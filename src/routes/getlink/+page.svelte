<script lang="ts">
    import {
        Link, Image, Video, Music, Loader2, Settings2, Download,
        ChevronDown, ChevronRight, Command, Clock
    } from "lucide-svelte";
    import LazyImage from "$lib/components/LazyImage.svelte";
    import { toaster } from "$lib/stores/ui/toaster";
    import { slide, fade } from "svelte/transition";

    let url = $state("");
    let mediaType = $state<"image" | "video" | "audio">("video");
    let isLoading = $state(false);
    let showAdvanced = $state(false);

    // Progress state
    let progressLines = $state<string[]>([]);
    let progressPercent = $state<number | null>(null);
    let progressStatus = $state("");
    let result = $state<{ success: boolean; message: string; filePath?: string } | null>(null);
    let currentDownloadDest = "";
    let lastWasAudio = false;

    let showConsole = $state(false);

    let logEl: HTMLDivElement | null = $state(null);

    // URL preview metadata
    type Entry = { title: string; thumbnail: string | null; url: string; duration?: number | null };
    type Meta = { 
        thumbnail: string | null; 
        title: string | null; 
        uploader: string | null; 
        duration: number | null; 
        extractor: string | null;
        entries?: Entry[];
    };
    let meta = $state<Meta | null>(null);
    let metaLoading = $state(false);
    let metaDebounce: ReturnType<typeof setTimeout> | null = null;
    let metaAbortController: AbortController | null = null;

    function formatDuration(sec: number): string {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        return h > 0
            ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
            : `${m}:${String(s).padStart(2, "0")}`;
    }

    async function fetchMeta(targetUrl: string, forcePlaylist?: boolean) {
        if (!targetUrl.trim()) { meta = null; return; }
        const isPlaylist = forcePlaylist !== undefined ? forcePlaylist : options.playlist;
        try { new URL(targetUrl); } catch { meta = null; return; }

        if (metaAbortController) metaAbortController.abort();
        metaAbortController = new AbortController();
        const signal = metaAbortController.signal;

        metaLoading = true;
        
        try {
            const res = await fetch(`/api/getlink/info?url=${encodeURIComponent(targetUrl)}&type=${mediaType}&playlist=${isPlaylist}`, { signal });
            
            if (!res.ok || !res.body) {
                meta = null;
                metaLoading = false;
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            // Initialize meta for the NEW stream
            meta = { thumbnail: null, title: null, uploader: null, duration: null, extractor: null, entries: [] };

            let entryBuffer: any[] = [];
            let flushTimeout: ReturnType<typeof setTimeout> | null = null;

            const flushBuffer = () => {
                if (entryBuffer.length > 0 && meta) {
                    meta.entries = [...(meta.entries || []), ...entryBuffer];
                    entryBuffer = [];
                }
                flushTimeout = null;
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    if (flushTimeout) clearTimeout(flushTimeout);
                    flushBuffer();
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split("\n\n");
                buffer = parts.pop() ?? "";

                for (const part of parts) {
                    const dataLine = part.trim();
                    if (!dataLine.startsWith("data:")) continue;
                    try {
                        const payload = JSON.parse(dataLine.slice(5).trim());
                        if (payload.type === "meta") {
                            meta = { ...payload.data, entries: meta?.entries || [] };
                        } else if (payload.type === "entry") {
                            if (meta) {
                                entryBuffer.push(payload.data);
                                // Schedule a flush if not already scheduled
                                if (!flushTimeout) {
                                    flushTimeout = setTimeout(flushBuffer, 300);
                                }
                                // If buffer is large, flush immediately
                                if (entryBuffer.length >= 50) {
                                    if (flushTimeout) clearTimeout(flushTimeout);
                                    flushBuffer();
                                }
                            }
                        } else if (payload.type === "error") {
                             toaster.create({ type: "error", title: "Fetch Error", description: payload.message });
                        }
                    } catch { /* ignore parsing errors */ }
                }
            }
        } catch (err: any) {
            if (err.name === 'AbortError') return;
            meta = null;
        } finally {
            if (!signal.aborted) {
                metaLoading = false;
            }
        }
    }

    function onUrlChange(value: string) {
        if (value === url) return;
        url = value;
        meta = null;
        metaLoading = false;
        if (metaDebounce) clearTimeout(metaDebounce);
        if (value.trim()) {
            metaLoading = true;
            metaDebounce = setTimeout(() => fetchMeta(value), 700);
        }
    }

    let options = $state({
        username: "",
        password: "",
        chapterRange: "",
        playlist: false,
        resolution: "best",
        subtitles: false,
        embedThumbnail: true,
        format: "opus",
        extraArgs: ""
    });

    const mediaOptions = [
        { value: "image", label: "Image", icon: Image },
        { value: "video", label: "Video", icon: Video },
        { value: "audio", label: "Audio", icon: Music },
    ];

    let downloadedFiles = $state<string[]>([]);

    function basename(p: string): string {
        return p.replace(/\\/g, "/").split("/").pop() ?? p;
    }

    function isIntermediate(path: string): boolean {
        return /\.f\d+\.[^.]+$/.test(basename(path));
    }

    // Fire a toast for a completed file
    function notifyFileComplete(filePath: string) {
        const name = basename(filePath);
        if (downloadedFiles.includes(name)) return;
        downloadedFiles = [...downloadedFiles, name];
        toaster.create({
            type: "success",
            title: "Downloaded",
            description: name,
        });
    }

    // Parse yt-dlp / gallery-dl progress lines
    function parseProgress(line: string): void {
        // ---- yt-dlp: audio extraction done → final .opus/.mp3/etc file
        const extractMatch = line.match(/^\[(?:ExtractAudio|ffmpeg)\] Destination:\s*(.+)$/);
        if (extractMatch) {
            notifyFileComplete(extractMatch[1].trim());
            progressStatus = `Extracted: ${basename(extractMatch[1].trim())}`;
            lastWasAudio = true;
            return;
        }

        // ---- yt-dlp: video merge done
        const mergeMatch = line.match(/^\[Merger\] Merging formats into "(.+)"$/);
        if (mergeMatch) {
            notifyFileComplete(mergeMatch[1].trim());
            progressStatus = `Merged: ${basename(mergeMatch[1].trim())}`;
            lastWasAudio = true;
            return;
        }

        // ---- yt-dlp: already downloaded (cached)
        const alreadyMatch = line.match(/^\[download\] (.+) has already been downloaded$/);
        if (alreadyMatch) {
            const name = basename(alreadyMatch[1].trim());
            downloadedFiles = [...downloadedFiles, name];
            toaster.create({ type: "info", title: "Already exists", description: name });
            return;
        }

        // ---- yt-dlp: 100% for a video that doesn't need merging/extraction
        // detected by "[download] 100% of X in HH:MM:SS" with no ETA
        const done100Match = line.match(/^\[download\]\s+100%\s+of\s+.+in\s+\d/);
        if (done100Match && (mediaType === "video" || mediaType === "image")) {
            // For video without merge (e.g. already in one stream), attempt to get dest from last [download] Destination line
            if (currentDownloadDest && !lastWasAudio && !isIntermediate(currentDownloadDest)) {
                notifyFileComplete(currentDownloadDest);
                currentDownloadDest = "";
            }
            return;
        }

        // ---- gallery-dl: completed image line — starts with # followed by path
        const gdlMatch = line.match(/^#\s+(.+)$/);
        if (gdlMatch) {
            notifyFileComplete(gdlMatch[1].trim());
            progressStatus = `Saved: ${basename(gdlMatch[1].trim())}`;
            return;
        }

        // ---- yt-dlp download progress percentage
        const pctMatch = line.match(/^\[download\]\s+([\d.]+)%/);
        if (pctMatch) {
            progressPercent = parseFloat(pctMatch[1]);
            progressStatus = line.replace(/^\[download\]\s+/, "").trim();
            return;
        }

        // ---- track [download] Destination for no-merge video detection
        const destMatch = line.match(/^\[download\] Destination:\s*(.+)$/);
        if (destMatch) {
            currentDownloadDest = destMatch[1].trim();
            lastWasAudio = false;
        }

        // ---- generic status
        const stripped = line.replace(/^\[\w+\]\s+/, "").trim();
        if (stripped) progressStatus = stripped;
    }

    async function handleSubmit(itemUrl?: string, overrideType?: string) {
        const downloadUrl = itemUrl || url;
        const targetType = overrideType || mediaType;
        if (!downloadUrl.trim()) {
            toaster.create({ type: "error", title: "Error", description: "Please enter a URL" });
            return;
        }
        try { new URL(downloadUrl); } catch {
            toaster.create({ type: "error", title: "Error", description: "Invalid URL" });
            return;
        }

        isLoading = true;
        result = null;
        progressLines = [];
        progressPercent = null;
        progressStatus = "Starting...";
        downloadedFiles = [];
        currentDownloadDest = "";
        lastWasAudio = false;

        try {
            const response = await fetch("/api/getlink", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: downloadUrl, type: targetType, options }),
            });

            if (!response.ok || !response.body) {
                const data = await response.json().catch(() => ({}));
                result = { success: false, message: data.error || "An error occurred" };
                toaster.create({ type: "error", title: "Error", description: result.message });
                isLoading = false;
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split("\n\n");
                buffer = parts.pop() ?? "";

                for (const part of parts) {
                    const dataLine = part.trim();
                    if (!dataLine.startsWith("data:")) continue;
                    try {
                        const payload = JSON.parse(dataLine.slice(5).trim());
                        if (payload.type === "output") {
                            progressLines = [...progressLines, payload.line];
                            parseProgress(payload.line);
                            // Auto-scroll log
                            if (logEl) {
                                setTimeout(() => { if (logEl) logEl.scrollTop = logEl.scrollHeight; }, 10);
                            }
                        } else if (payload.type === "done") {
                            result = {
                                success: payload.success,
                                message: payload.message,
                                filePath: payload.filePath,
                            };
                            if (payload.success) {
                                progressPercent = 100;
                                progressStatus = "Complete";
                                const count = downloadedFiles.length;
                                    const desc = count > 1
                                        ? `${count} files downloaded successfully`
                                        : payload.message;
                                    if (!itemUrl) url = "";
                                    meta = null;
                                } else {
                                toaster.create({ type: "error", title: "Error", description: payload.message });
                            }
                        }
                    } catch {
                        // ignore malformed SSE
                    }
                }
            }
        } catch (e) {
            result = { success: false, message: "Could not connect to server" };
            toaster.create({ type: "error", title: "Error", description: "Could not connect to server" });
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="p-6 md:p-12 max-w-6xl mx-auto" in:fade={{ duration: 400 }}>
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:items-start">
            
            <!-- ===== LEFT COLUMN: Primary Interaction & Results (Lg: 8 cols) ===== -->
            <div class="lg:col-span-8 space-y-6">

                <!-- URL Input Card - High Polished -->
                <div class="card bg-surface-50/50 dark:bg-surface-900/40 backdrop-blur-xl border border-surface-200/50 dark:border-surface-800/50 p-1.5 shadow-md ring-1 ring-surface-950/5 rounded-2xl transition-all focus-within:ring-2 focus-within:ring-primary-500/30">
                    <div class="relative flex flex-row items-stretch gap-2">
                        <div class="flex-1 flex items-center gap-3 px-3 h-12">
                            <Link class="size-6 text-[var(--color-primary-500)] shrink-0" />
                            <input
                                type="text"
                                class="w-full bg-transparent border-none outline-none ring-0 text-base placeholder:text-surface-400 text-surface-900 dark:text-surface-50 font-medium tracking-tight"
                                value={url}
                                placeholder="Paste your link to analyze or download..."
                                oninput={(e) => onUrlChange((e.target as HTMLInputElement).value)}
                                onkeydown={(e) => e.key === "Enter" && handleSubmit()}
                                disabled={isLoading}
                            />
                            {#if metaLoading}
                                <Loader2 class="size-5 text-primary-500 shrink-0 animate-spin" />
                            {/if}
                        </div>

                        <button
                            type="button"
                            class="flex items-center justify-center px-5 shrink-0 rounded-xl transition-all duration-300
                                   bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-500/20 
                                   disabled:opacity-40 disabled:shadow-none active:scale-95"
                            onclick={() => handleSubmit()}
                            disabled={isLoading || !url.trim()}
                            title={meta?.entries && meta.entries.length > 1 ? `Download All (${meta.entries.length})` : 'Start Extraction'}
                        >
                            {#if isLoading}
                                <div class="flex items-center gap-2">
                                    <Loader2 class="size-5 animate-spin" />
                                    <span class="text-xs font-bold uppercase tracking-widest hidden md:inline">Processing</span>
                                </div>
                            {:else}
                                <div class="flex items-center gap-2">
                                    <Download class="size-5" />
                                    <span class="text-xs font-bold uppercase tracking-widest hidden md:inline">Get Link</span>
                                </div>
                            {/if}
                        </button>
                    </div>
                </div>

                <!-- Source Overview Card - Glassmorphic Hero -->
                {#if meta && (meta.thumbnail || meta.title) && !options.playlist}
                    <div class="card bg-surface-50/60 dark:bg-surface-900/40 backdrop-blur-2xl border border-surface-200/50 dark:border-surface-800/50 p-4 shadow-md overflow-hidden rounded-2xl" transition:slide={{ duration: 400 }}>
                        <div class="flex flex-col md:flex-row gap-5 items-start {metaLoading ? 'opacity-40 grayscale blur-[2px]' : ''} transition-all duration-500">
                            <div class="shrink-0 group relative">
                                {#if meta.thumbnail}
                                    <div class="overflow-hidden rounded-xl shadow-lg ring-1 ring-black/5">
                                        <LazyImage
                                            src={meta.thumbnail}
                                            alt="thumbnail"
                                            class="h-28 w-48 object-cover transition-transform duration-700 group-hover:scale-110"
                                            delay={300}
                                        />
                                    </div>
                                {:else}
                                    <div class="h-28 w-48 bg-surface-100 dark:bg-surface-950 rounded-xl flex items-center justify-center border border-surface-200 dark:border-surface-800 shadow-inner">
                                        <Video class="size-8 text-surface-300 dark:text-surface-700 font-thin" />
                                    </div>
                                {/if}
                            </div>
                            <div class="flex-1 min-w-0 space-y-4">
                                <div class="space-y-1">
                                    <p class="text-xs font-black uppercase tracking-[0.2em] text-primary-500">{meta.extractor || 'Source Detected'}</p>
                                    <h2 class="font-bold text-2xl leading-tight line-clamp-2 text-surface-900 dark:text-white group-hover:text-primary-500 transition-colors" title={meta.title}>
                                        <a href={url} target="_blank" rel="noopener noreferrer">
                                            {meta.title}
                                        </a>
                                    </h2>
                                </div>
                                <div class="flex flex-wrap items-center gap-4 text-[11px] font-bold uppercase tracking-widest">
                                    {#if meta.uploader}
                                        <span class="flex items-center gap-2 text-surface-600 dark:text-surface-400 bg-surface-100 dark:bg-surface-800/80 px-3 py-1.5 rounded-full border border-surface-200/50 dark:border-surface-700/30">
                                            <Command class="size-3.5 text-primary-500" /> {meta.uploader}
                                        </span>
                                    {/if}
                                    {#if meta.duration}
                                        <span class="flex items-center gap-2 text-surface-600 dark:text-surface-400 bg-surface-100 dark:bg-surface-800/80 px-3 py-1.5 rounded-full border border-surface-200/50 dark:border-surface-700/30">
                                            <Clock class="size-3.5 text-secondary-500" />{formatDuration(meta.duration)}
                                        </span>
                                    {/if}

                                    <button 
                                        class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-600/10 hover:bg-primary-600 text-primary-600 hover:text-white border border-primary-600/20 transition-all active:scale-95"
                                        onclick={() => handleSubmit(url, "thumbnail")}
                                        title="Download Artwork"
                                        disabled={isLoading}
                                    >
                                        <Image class="size-3.5" /> 
                                        <span>Full Artwork</span>
                                    </button>

                                    {#if meta.entries && meta.entries.length === 1}
                                        <button 
                                            class="flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-500/20 transition-all active:scale-95"
                                            onclick={() => handleSubmit(meta.entries ? meta.entries[0].url : url)}
                                            disabled={isLoading}
                                        >
                                            <Download class="size-3.5" /> 
                                            <span>Grab {mediaType === 'video' ? 'Video' : mediaType === 'audio' ? 'Audio' : 'Image'}</span>
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- Entry List Section - High-Density Glass -->
                {#if meta?.entries && (meta.entries.length > 1 || options.playlist)}
                    <section class="space-y-4" transition:slide={{ duration: 400 }}>
                        <div class="flex items-center justify-between px-2">
                            <div class="flex items-center gap-3">
                                <div class="size-2 rounded-full bg-primary-500 animate-pulse"></div>
                                <h2 class="text-xs font-black uppercase tracking-[0.2em] text-surface-500">
                                    Scanned Content <span class="text-primary-600 ml-1">[{meta.entries.length}]</span>
                                </h2>
                            </div>
                            
                            {#if options.playlist && meta.title}
                                <div class="flex items-center gap-4 bg-surface-50/50 dark:bg-surface-900/50 px-4 py-2 rounded-2xl border border-surface-200/50 dark:border-surface-800/50 shadow-sm backdrop-blur-md">
                                    <span class="text-[10px] font-bold text-surface-700 dark:text-surface-300 uppercase tracking-widest line-clamp-1 max-w-[200px]">
                                        {meta.title}
                                    </span>
                                    <div class="w-px h-4 bg-surface-300 dark:bg-surface-700"></div>
                                    <button 
                                        class="text-primary-500 hover:text-primary-600 transition-colors"
                                        onclick={() => handleSubmit(url, "thumbnail")}
                                        title="Playlist Art"
                                        disabled={isLoading || metaLoading}
                                    >
                                        <Image class="size-4" />
                                    </button>
                                </div>
                            {/if}
                        </div>

                        <div class="grid grid-cols-1 gap-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {#each meta.entries as entry, i}
                                <div class="group relative flex items-center gap-3 p-2 bg-surface-50/50 dark:bg-surface-900/20 backdrop-blur-md border border-surface-200/40 dark:border-surface-800/30 rounded-2xl hover:bg-surface-100/50 dark:hover:bg-surface-800/40 hover:border-primary-500/40 transition-all duration-300 shadow-sm">
                                    <div class="relative shrink-0 overflow-hidden rounded-xl shadow-md ring-1 ring-black/5">
                                        {#if entry.thumbnail}
                                            <LazyImage 
                                                src={entry.thumbnail} 
                                                alt="" 
                                                class="size-14 object-cover transition-transform duration-700 group-hover:scale-110" 
                                                delay={200 + (Math.min(i, 10) * 50)} 
                                            />
                                        {:else}
                                            <div class="size-14 bg-surface-100 dark:bg-surface-950 flex items-center justify-center">
                                                <span class="text-[10px] font-black opacity-20">{String(i+1).padStart(2, '0')}</span>
                                            </div>
                                        {/if}
                                        {#if entry.duration}
                                            <span class="absolute bottom-1 right-1 bg-black/80 text-[9px] text-white px-1.5 py-0.5 rounded-md font-bold backdrop-blur-sm">
                                                {formatDuration(entry.duration)}
                                            </span>
                                        {/if}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <a 
                                            href={entry.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            class="text-sm font-bold truncate text-surface-900 dark:text-white block hover:text-primary-500 transition-colors mb-0.5" 
                                            title={entry.title}
                                        >
                                            {entry.title}
                                        </a>
                                        <p class="text-[10px] uppercase font-bold tracking-widest text-surface-400 opacity-60">
                                            {new URL(entry.url).hostname.replace('www.', '')}
                                        </p>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <button
                                            title="Download Thumbnail"
                                            class="size-9 flex items-center justify-center rounded-xl bg-surface-500/10 dark:bg-white/10 border border-surface-200/50 dark:border-surface-700/50 text-surface-600 dark:text-white transition-all shadow-sm active:scale-95"
                                            onclick={() => handleSubmit(entry.url, "thumbnail")}
                                            disabled={isLoading}
                                        >
                                            <Image class="size-4" />
                                        </button>
                                        <button
                                            class="h-9 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all
                                                   bg-primary-500/15 dark:bg-primary-500/30 text-primary-600 dark:text-white hover:bg-primary-500 hover:text-white border border-primary-500/20 shadow-sm active:scale-95"
                                            onclick={() => handleSubmit(entry.url)}
                                            disabled={isLoading}
                                        >
                                            Grab
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </section>
                {/if}

                <!-- Progress Section - Professional Dashboard Style -->
                {#if isLoading || (result && progressLines.length > 0)}
                    <div transition:slide={{ duration: 400 }} class="card bg-surface-50/80 dark:bg-surface-900/60 backdrop-blur-xl border border-surface-200 dark:border-surface-800 p-6 space-y-5 shadow-md rounded-2xl relative overflow-hidden">
                        <!-- Background Glow for Terminal -->
                        <div class="absolute -top-12 -right-12 size-48 bg-primary-500/10 blur-[60px] pointer-events-none"></div>

                        <div class="flex items-center justify-between relative z-10">
                            <div class="flex items-center gap-3">
                                <div class="size-2 rounded-full bg-primary-500 animate-ping"></div>
                                <span class="text-[11px] font-black uppercase tracking-[0.2em] text-primary-400 font-mono">{progressStatus}</span>
                            </div>
                            {#if progressPercent !== null}
                                <span class="text-lg font-black text-white tabular-nums tracking-tighter">{progressPercent.toFixed(1)}%</span>
                            {/if}
                        </div>
                        
                        <div class="h-2 w-full bg-white/5 rounded-full overflow-hidden shadow-inner ring-1 ring-white/10 p-0.5">
                            {#if progressPercent !== null}
                                <div class="h-full bg-gradient-to-r from-primary-600 to-primary-400 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(var(--color-primary-500),0.5)]" style="width: {progressPercent}%"></div>
                            {:else}
                                <div class="h-full w-1/3 bg-primary-600 rounded-full animate-[indeterminate_1.5s_ease-in-out_infinite] shadow-[0_0_10px_rgba(var(--color-primary-500),0.3)]"></div>
                            {/if}
                        </div>

                        <div class="flex items-center justify-between pt-2">
                            <button
                                type="button"
                                class="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-surface-500 hover:text-primary-400 transition-colors"
                                onclick={() => showConsole = !showConsole}
                            >
                                <ChevronRight class="size-4 transition-transform duration-300 {showConsole ? 'rotate-90' : ''}" />
                                Processing Logs
                            </button>
                            
                            {#if downloadedFiles.length > 0}
                                <div class="flex items-center gap-2 text-[10px] font-black uppercase text-success-500 bg-success-500/10 px-3 py-1 rounded-full border border-success-500/20">
                                    <Download class="size-3" /> {downloadedFiles.length} Captured
                                </div>
                            {/if}
                        </div>

                        {#if showConsole}
                            <div transition:slide={{ duration: 300 }}>
                                <div
                                    bind:this={logEl}
                                    class="mt-3 bg-black/50 backdrop-blur-sm rounded-xl p-4 h-64 overflow-y-auto custom-scrollbar border border-white/5 font-mono text-[11px] text-surface-400/80 leading-relaxed shadow-inner"
                                >
                                    {#each progressLines as line}
                                        <div class="mb-1.5 border-l-2 border-white/5 pl-3 py-0.5 hover:bg-white/5 hover:text-white transition-colors">
                                            <span class="text-surface-600 mr-3 text-[9px]">{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                            {line}
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>

            <!-- ===== RIGHT COLUMN: Settings Panel (Lg: 4 cols) ===== -->
            <aside class="lg:col-span-4 space-y-6" in:fade={{ delay: 400 }}>

                <!-- Media Type Control - High Fidelity -->
                <nav class="card bg-surface-50/50 dark:bg-surface-900/40 backdrop-blur-xl border border-surface-200/50 dark:border-surface-800/50 p-1.5 flex gap-1.5 shadow-md rounded-2xl ring-1 ring-surface-950/5">
                    {#each mediaOptions as option}
                        {@const Icon = option.icon}
                        {@const active = mediaType === option.value}
                        <button
                            type="button"
                            class="flex-1 flex flex-col items-center gap-2 py-4 rounded-xl transition-all duration-300
                                {active 
                                    ? 'bg-primary-600 text-white shadow-xl shadow-primary-500/20 ring-1 ring-white/10' 
                                    : 'text-surface-500 hover:bg-surface-200/50 dark:hover:bg-surface-800/50'}"
                            onclick={() => (mediaType = option.value as any)}
                        >
                            <Icon class="size-6 transition-transform group-active:scale-90" />
                            <span class="text-[10px] uppercase font-black tracking-widest">{option.label}</span>
                        </button>
                    {/each}
                </nav>

                <!-- Dynamic Configuration Panel -->
                <div class="card bg-surface-50/50 dark:bg-surface-900/40 backdrop-blur-xl border border-surface-200/50 dark:border-surface-800/50 p-6 space-y-6 shadow-md rounded-2xl ring-1 ring-surface-950/5">
                    <div class="flex items-center justify-between pb-4 border-b border-surface-200/50 dark:border-surface-800/50">
                        <div class="flex items-center gap-3">
                            <Settings2 class="size-5 text-primary-500" />
                            <h3 class="text-xs font-black uppercase tracking-[0.2em] text-surface-500">Parameters</h3>
                        </div>
                    </div>

                    <div class="space-y-6">
                        {#if mediaType === 'image'}
                            <div class="space-y-2">
                                <label for="username" class="text-[10px] font-black uppercase tracking-widest text-surface-400 px-1">Source Account</label>
                                <div class="relative">
                                    <input id="username" type="text" class="w-full bg-surface-100 dark:bg-black border border-surface-300 dark:border-surface-800/50 rounded-xl h-11 px-4 text-sm font-medium transition-all focus:ring-2 focus:ring-primary-500/30" bind:value={options.username} placeholder="Username or Login..." />
                                </div>
                            </div>
                            <div class="space-y-2">
                                <label for="chapters" class="text-[10px] font-black uppercase tracking-widest text-surface-400 px-1">Selection Filter</label>
                                <input id="chapters" type="text" class="w-full bg-surface-100 dark:bg-black border border-surface-300 dark:border-surface-800/50 rounded-xl h-11 px-4 font-mono text-xs font-bold transition-all focus:ring-2 focus:ring-primary-500/30" bind:value={options.chapterRange} placeholder="e.g. 15-30, >50" />
                                <p class="text-[9px] text-surface-400 px-1 italic">Filter by number or range</p>
                            </div>
                        {:else if mediaType === 'video'}
                            <div class="space-y-2">
                                <label for="resolution" class="text-[10px] font-black uppercase tracking-widest text-surface-400 px-1">Max Fidelity</label>
                                <div class="relative">
                                    <select id="resolution" class="w-full bg-surface-100 dark:bg-black border border-surface-300 dark:border-surface-800/50 rounded-xl h-11 px-4 text-xs font-bold appearance-none cursor-pointer pr-10 hover:border-primary-500/50 transition-colors" bind:value={options.resolution}>
                                        <option value="best">Best Dynamic Quality</option>
                                        <option value="2160">4K Ultra High Definition</option>
                                        <option value="1080">1080p Full HD Elite</option>
                                        <option value="720">720p Optimized HD</option>
                                    </select>
                                    <ChevronDown class="absolute right-4 top-1/2 -translate-y-1/2 size-4 text-surface-400 pointer-events-none" />
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-3 pt-2">
                                <label class="flex items-center gap-3 p-3 bg-surface-100 dark:bg-black/40 border border-surface-200/50 dark:border-surface-800/50 rounded-xl cursor-pointer group hover:border-primary-500/30 transition-all active:scale-95">
                                    <input 
                                        type="checkbox" 
                                        class="checkbox size-4 accent-primary-600" 
                                        bind:checked={options.playlist} 
                                        onchange={(e) => { if (url.trim()) fetchMeta(url, e.currentTarget.checked); }}
                                    />
                                    <span class="text-[10px] font-black uppercase tracking-widest text-surface-500 group-hover:text-primary-500">Playlist</span>
                                </label>
                                <label class="flex items-center gap-3 p-3 bg-surface-100 dark:bg-black/40 border border-surface-200/50 dark:border-surface-800/50 rounded-xl cursor-pointer group hover:border-primary-500/30 transition-all active:scale-95">
                                    <input type="checkbox" class="checkbox size-4 accent-primary-600" bind:checked={options.subtitles} />
                                    <span class="text-[10px] font-black uppercase tracking-widest text-surface-500 group-hover:text-primary-500">Captions</span>
                                </label>
                            </div>
                        {:else if mediaType === 'audio'}
                            <div class="space-y-2">
                                <label for="format" class="text-[10px] font-black uppercase tracking-widest text-surface-400 px-1">Target Encoding</label>
                                <div class="relative">
                                    <select id="format" class="w-full bg-surface-100 dark:bg-black border border-surface-300 dark:border-surface-800/50 rounded-xl h-11 px-4 text-xs font-bold appearance-none cursor-pointer pr-10 hover:border-primary-500/50 transition-colors" bind:value={options.format}>
                                        <option value="opus">Opus (Reference Grade)</option>
                                        <option value="mp3">MPEG-3 (Global Standard)</option>
                                        <option value="flac">FLAC (High Fidelity Lossless)</option>
                                    </select>
                                    <ChevronDown class="absolute right-4 top-1/2 -translate-y-1/2 size-4 text-surface-400 pointer-events-none" />
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-3 pt-2">
                                <label class="flex items-center gap-3 p-3 bg-surface-100 dark:bg-black/40 border border-surface-200/50 dark:border-surface-800/50 rounded-xl cursor-pointer group hover:border-primary-500/30 transition-all active:scale-95">
                                    <input 
                                        type="checkbox" 
                                        class="checkbox size-4 accent-primary-600" 
                                        bind:checked={options.playlist} 
                                        onchange={(e) => { if (url.trim()) fetchMeta(url, e.currentTarget.checked); }}
                                    />
                                    <span class="text-[10px] font-black uppercase tracking-widest text-surface-500 group-hover:text-primary-500">Album</span>
                                </label>
                                <label class="flex items-center gap-3 p-3 bg-surface-100 dark:bg-black/40 border border-surface-200/50 dark:border-surface-800/50 rounded-xl cursor-pointer group hover:border-primary-500/30 transition-all active:scale-95">
                                    <input type="checkbox" class="checkbox size-4 accent-primary-600" bind:checked={options.embedThumbnail} />
                                    <span class="text-[10px] font-black uppercase tracking-widest text-surface-500 group-hover:text-primary-500">Cover Art</span>
                                </label>
                            </div>
                        {/if}
                    </div>

                    <!-- Advanced Panel - Minimalist Toggles -->
                    <div class="pt-4 border-t border-surface-200/50 dark:border-surface-800/50">
                        <button
                            type="button"
                            class="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-surface-400 hover:text-primary-500 transition-all group"
                            onclick={() => showAdvanced = !showAdvanced}
                        >
                           <div class="flex items-center gap-2">
                             <Command class="size-3.5 group-hover:rotate-12 transition-transform" />
                             Advanced Overrides
                           </div>
                           <ChevronDown class="size-4 transition-transform duration-300 {showAdvanced ? 'rotate-180 text-primary-500' : ''}" />
                        </button>

                        {#if showAdvanced}
                            <div transition:slide={{ duration: 300 }} class="space-y-4 pt-6">
                                {#if mediaType === 'image'}
                                    <div class="space-y-2">
                                        <label for="password" class="text-[10px] font-black uppercase tracking-widest text-surface-400 px-1">Session Key</label>
                                        <input id="password" type="password" class="w-full bg-surface-100 dark:bg-black border border-surface-300 dark:border-surface-800/50 rounded-xl h-11 px-4 text-sm tracking-widest focus:ring-2 focus:ring-primary-500/30" bind:value={options.password} placeholder="••••••••" />
                                    </div>
                                {/if}
                                <div class="space-y-2">
                                    <label for="extraArgs" class="text-[10px] font-black uppercase tracking-widest text-surface-400 px-1">CLI Directives</label>
                                    <textarea
                                        id="extraArgs"
                                        class="w-full bg-surface-100 dark:bg-black border border-surface-300 dark:border-surface-800/50 rounded-xl p-4 font-mono text-[10px] focus:ring-2 focus:ring-primary-500/30 h-24 resize-none leading-relaxed"
                                        bind:value={options.extraArgs}
                                        placeholder="--cookies-from-browser firefox ..."
                                    ></textarea>
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Capture Log Summary (Floating Badge Style) -->
                {#if downloadedFiles.length > 0 && !isLoading}
                    <div transition:fade={{ duration: 300 }} class="card bg-success-500/10 border border-success-500/30 p-4 rounded-2xl flex items-center justify-between shadow-lg shadow-success-500/5">
                        <div class="flex items-center gap-3">
                            <div class="size-10 rounded-xl bg-success-500 shadow-lg shadow-success-500/20 flex items-center justify-center">
                                <Download class="size-5 text-white" />
                            </div>
                            <div>
                                <p class="text-[11px] font-black text-success-700 dark:text-success-400 uppercase tracking-widest">Capture Success</p>
                                <p class="text-[9px] font-bold text-success-600/60 dark:text-success-400/50 uppercase tracking-tight">{downloadedFiles.length} file(s) initialized</p>
                            </div>
                        </div>
                        <button class="size-8 rounded-full border border-success-500/30 flex items-center justify-center text-success-600 hover:bg-success-500 hover:text-white transition-all" onclick={() => downloadedFiles = []}>
                            <ChevronDown class="size-4 rotate-45" />
                        </button>
                    </div>
                {/if}

            </aside>
        </div>
    </div>

<style>
    @keyframes indeterminate {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(300%); }
    }
    
    .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #e2e8f0;
        border-radius: 10px;
    }
    :global(.dark) .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #1e293b;
    }
</style>
