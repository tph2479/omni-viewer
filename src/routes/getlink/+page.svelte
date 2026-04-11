<script lang="ts">
    import {
        Link, Image, Video, Music, Loader2, Settings2, Download,
        ChevronDown, ChevronRight, Command, Clock
    } from "lucide-svelte";
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

        metaLoading = true;
        try {
            const res = await fetch(`/api/getlink/info?url=${encodeURIComponent(targetUrl)}&type=${mediaType}&playlist=${isPlaylist}`);
            const data = await res.json();
            
            if (res.ok) {
                meta = data;
            } else {
                meta = null;
                if (res.status === 422) {
                    toaster.create({
                        type: "error",
                        title: "Fetch Error",
                        description: data.error || "Could not fetch metadata"
                    });
                }
            }
        } catch (err) {
            meta = null;
        } finally {
            metaLoading = false;
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

    // Fire a toast for a completed file
    function notifyFileComplete(filePath: string) {
        const name = basename(filePath);
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
            return;
        }

        // ---- yt-dlp: video merge done
        const mergeMatch = line.match(/^\[Merger\] Merging formats into "(.+)"$/);
        if (mergeMatch) {
            notifyFileComplete(mergeMatch[1].trim());
            progressStatus = `Merged: ${basename(mergeMatch[1].trim())}`;
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
            if (currentDownloadDest && !lastWasAudio) {
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

<div class="relative min-h-screen w-full flex items-start justify-center p-4 md:p-8 overflow-x-hidden selection:bg-primary-500/30">
    
    <!-- Muted Atmosphere Background -->
    <div class="fixed inset-0 -z-10 bg-surface-50 dark:bg-surface-950">
        <div class="absolute top-0 left-1/4 size-[400px] rounded-full bg-primary-500/5 blur-[100px]"></div>
        <div class="absolute bottom-0 right-1/4 size-[400px] rounded-full bg-secondary-500/5 blur-[100px]"></div>
    </div>

    <div class="w-full max-w-6xl relative z-10">
        


        <div class="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:items-start">
            <!-- ===== LEFT COLUMN: Primary Interaction ===== -->
            <div class="lg:col-span-3 space-y-4">

                <!-- URL Input Section - Compact -->
                <div class="relative flex flex-row items-stretch gap-2 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl p-1.5 shadow-sm transition-all focus-within:border-primary-500/50">
                    <div class="flex-1 flex items-center gap-3 px-3 h-11">
                        <Link class="size-5 text-surface-400 shrink-0" />
                        <input
                            type="text"
                            class="w-full bg-transparent border-none outline-none ring-0 text-sm placeholder:text-surface-400 text-surface-900 dark:text-surface-50 font-medium"
                            value={url}
                            placeholder="Paste your link here..."
                            oninput={(e) => onUrlChange((e.target as HTMLInputElement).value)}
                            onkeydown={(e) => e.key === "Enter" && handleSubmit()}
                            disabled={isLoading}
                        />
                        {#if metaLoading}
                            <Loader2 class="size-4 text-primary-500 shrink-0 animate-spin" />
                        {/if}
                    </div>

                    <button
                        type="button"
                        class="flex items-center justify-center size-11 shrink-0 rounded-lg transition-all
                               bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-50 active:scale-95"
                        onclick={() => handleSubmit()}
                        disabled={isLoading || !url.trim()}
                        title={meta?.entries && meta.entries.length > 1 ? `Download All (${meta.entries.length})` : 'Download'}
                    >
                        {#if isLoading}
                            <Loader2 class="size-5 animate-spin" />
                        {:else}
                            <Download class="size-5" />
                        {/if}
                    </button>
                </div>

                <!-- Source Overview Card - Compact (Only for Single File Mode) -->
                {#if meta && (meta.thumbnail || meta.title) && !options.playlist}
                    <div class="relative bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl p-4 shadow-sm overflow-hidden" transition:slide={{ duration: 300 }}>
                        
                        {#if metaLoading}
                            <div class="absolute inset-0 z-20 flex items-center justify-center bg-white/60 dark:bg-surface-900/60 backdrop-blur-[2px]" in:fade={{ duration: 200 }}>
                                <div class="flex flex-col items-center gap-2">
                                    <Loader2 class="size-6 text-primary-500 animate-spin" />
                                    <span class="text-[9px] font-bold uppercase tracking-widest text-surface-500">Updating Details...</span>
                                </div>
                            </div>
                        {/if}

                        <div class="flex flex-col md:flex-row gap-4 items-start {metaLoading ? 'opacity-40 grayscale blur-[1px]' : ''} transition-all duration-300">
                            <div class="shrink-0">
                                {#if meta.thumbnail}
                                    <img
                                        src={meta.thumbnail}
                                        alt="thumbnail"
                                        loading="lazy"
                                        decoding="async"
                                        class="h-20 w-36 object-cover rounded-lg bg-surface-100 dark:bg-surface-800 shadow-sm"
                                    />
                                {:else}
                                    <div class="h-20 w-36 bg-surface-100 dark:bg-surface-800 rounded-lg flex items-center justify-center border border-surface-200 dark:border-surface-700">
                                        <Video class="size-6 text-surface-400" />
                                    </div>
                                {/if}
                            </div>
                            <div class="flex-1 min-w-0 space-y-2">
                                <p class="font-bold text-lg leading-snug line-clamp-2 text-surface-900 dark:text-white">{meta.title}</p>
                                <div class="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-surface-500">
                                    {#if meta.uploader}
                                        <span class="flex items-center gap-1.5"><Command class="size-3" /> {meta.uploader}</span>
                                    {/if}
                                    {#if meta.duration}
                                        <span class="flex items-center gap-1.5 bg-surface-100 dark:bg-surface-800 px-2 py-0.5 rounded-md">
                                            <Clock class="size-3" />{formatDuration(meta.duration)}
                                        </span>
                                    {/if}
                                    {#if meta.extractor}
                                        <span class="text-primary-500 font-black">{meta.extractor}</span>
                                    {/if}

                                    <!-- Download Thumbnail only -->
                                    <button 
                                        class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-100 dark:bg-surface-800 hover:bg-primary-600 hover:text-white transition-all text-primary-500"
                                        onclick={() => handleSubmit(url, "thumbnail")}
                                        title="Download Thumbnail Only"
                                        disabled={isLoading}
                                    >
                                        <Image class="size-3" /> THUMBNAIL
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- Entry List Section - Compact -->
                {#if meta?.entries && meta.entries.length > 0}
                    <div class="relative space-y-3" transition:slide={{ duration: 400 }}>
                        {#if metaLoading}
                             <div class="absolute inset-0 z-10 bg-white/10 dark:bg-black/10 backdrop-blur-[1px] pointer-events-none"></div>
                        {/if}
                        {#if options.playlist && meta}
                            <div class="px-1 py-1 space-y-1">
                                <div class="flex items-center justify-between gap-4">
                                    <h2 class="text-lg font-bold text-surface-900 dark:text-white truncate">{meta.title}</h2>
                                    <div class="flex items-center gap-3 shrink-0">
                                        <span class="text-[10px] font-bold text-primary-500 bg-primary-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">{meta.entries.length}{meta.entries.length >= 50 ? '+' : ''} Items</span>
                                        <button 
                                            class="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-100 dark:bg-surface-800 hover:bg-primary-600 hover:text-white transition-all text-[9px] font-bold uppercase tracking-wider text-surface-500"
                                            onclick={() => handleSubmit(url, "thumbnail")}
                                            title="Save Playlist Thumbnail"
                                            disabled={isLoading || metaLoading}
                                        >
                                            <Image class="size-3" />
                                        </button>
                                    </div>
                                </div>
                                <div class="h-px w-full bg-gradient-to-r from-surface-200/50 via-surface-200/50 to-transparent dark:from-surface-800/50 dark:via-surface-800/50 mt-2"></div>
                            </div>
                        {:else}
                            <div class="flex items-center justify-between px-1">
                                <h2 class="text-[10px] font-bold uppercase tracking-[0.2em] text-surface-400">Batch Content <span class="text-primary-500 ml-1">[{meta.entries.length}]</span></h2>
                            </div>
                        {/if}
                        <div class="grid grid-cols-1 gap-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {#each meta.entries as entry, i}
                                <div class="group flex items-center gap-3 p-2 bg-white dark:bg-surface-900 border border-surface-100 dark:border-surface-800 rounded-xl hover:border-primary-500/30 hover:shadow-sm transition-all duration-200">
                                    <div class="relative shrink-0">
                                        {#if entry.thumbnail}
                                            <img 
                                                src={entry.thumbnail} 
                                                alt="" 
                                                loading="lazy" 
                                                decoding="async"
                                                class="size-14 object-cover rounded-lg bg-surface-100 dark:bg-surface-800" 
                                            />
                                        {:else}
                                            <div class="size-14 bg-surface-100 dark:bg-surface-800 rounded-lg flex items-center justify-center border border-white/5">
                                                <span class="text-xs font-bold opacity-20">{i+1}</span>
                                            </div>
                                        {/if}
                                        {#if entry.duration}
                                            <span class="absolute bottom-1 right-1 bg-black/70 text-[9px] text-white px-1 rounded font-bold">
                                                {formatDuration(entry.duration)}
                                            </span>
                                        {/if}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <p class="text-sm font-bold truncate text-surface-900 dark:text-surface-100">{entry.title}</p>
                                        <p class="text-[9px] font-mono text-surface-500 truncate mt-0.5 opacity-60">{entry.url}</p>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <button
                                            title="Download Thumbnail"
                                            class="size-8 flex items-center justify-center rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-500 hover:bg-primary-600 hover:text-white transition-all"
                                            onclick={() => handleSubmit(entry.url, "thumbnail")}
                                            disabled={isLoading}
                                        >
                                            <Image class="size-4" />
                                        </button>
                                        <button
                                            class="h-8 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all
                                                   bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-primary-600 hover:text-white"
                                            onclick={() => handleSubmit(entry.url)}
                                            disabled={isLoading}
                                        >
                                            Download
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- Progress Section - Professional -->
                {#if isLoading || (result && progressLines.length > 0)}
                    <div transition:slide={{ duration: 300 }} class="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl p-5 space-y-4 shadow-sm">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span class="size-1.5 rounded-full bg-primary-500"></span>
                                <span class="text-[10px] font-bold uppercase tracking-widest text-primary-500">{progressStatus}</span>
                            </div>
                            {#if progressPercent !== null}
                                <span class="text-sm font-bold text-surface-900 dark:text-white tabular-nums">{progressPercent.toFixed(0)}%</span>
                            {/if}
                        </div>
                        
                        <div class="h-1.5 w-full bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
                            {#if progressPercent !== null}
                                <div class="h-full bg-primary-600 transition-all duration-300" style="width: {progressPercent}%"></div>
                            {:else}
                                <div class="h-full w-1/3 bg-primary-600 animate-[indeterminate_1.5s_ease-in-out_infinite]"></div>
                            {/if}
                        </div>

                        <button
                            type="button"
                            class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-surface-400 hover:text-primary-500 transition-colors"
                            onclick={() => showConsole = !showConsole}
                        >
                            <ChevronRight class="size-3.5 transition-transform {showConsole ? 'rotate-90' : ''}" />
                            Engine Logs
                        </button>

                        {#if showConsole}
                            <div transition:slide={{ duration: 200 }}>
                                <div
                                    bind:this={logEl}
                                    class="mt-2 bg-surface-50 dark:bg-black rounded-lg p-4 h-48 overflow-y-auto custom-scrollbar border border-surface-100 dark:border-surface-800 font-mono text-[11px] text-surface-600 dark:text-surface-400"
                                >
                                    {#each progressLines as line}
                                        <div class="mb-0.5 opacity-80">{line}</div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                {/if}

                <!-- Success Summary -->
                {#if downloadedFiles.length > 0 && !isLoading}
                    <div transition:slide={{ duration: 200 }} class="bg-success-500/5 border border-success-500/20 rounded-xl p-4 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="size-8 rounded-lg bg-success-500 flex items-center justify-center">
                                <Download class="size-4 text-white" />
                            </div>
                            <p class="text-xs font-bold text-success-700 dark:text-success-400 uppercase tracking-widest">{downloadedFiles.length} file(s) saved</p>
                        </div>
                    </div>
                {/if}

            </div>

            <!-- ===== RIGHT COLUMN: Settings Panel ===== -->
            <div class="lg:col-span-2 space-y-6" in:fade={{ delay: 400 }}>

                <!-- Media Type Picker - Compact -->
                <div class="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl p-1 flex gap-1 shadow-sm">
                    {#each mediaOptions as option}
                        <button
                            type="button"
                            class="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg transition-all
                                {mediaType === option.value 
                                    ? 'bg-primary-600 text-white shadow-md' 
                                    : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'}"
                            onclick={() => (mediaType = option.value as any)}
                        >
                            <svelte:component this={option.icon} class="size-5" />
                            <span class="text-[9px] uppercase font-bold tracking-widest">{option.label}</span>
                        </button>
                    {/each}
                </div>

                <!-- Parameters Panel - Simplified -->
                <div class="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl p-5 space-y-5 shadow-sm">
                    <div class="flex items-center gap-2 pb-2 border-b border-surface-100 dark:border-surface-800">
                        <Settings2 class="size-4 text-surface-400" />
                        <h3 class="text-[10px] font-bold uppercase tracking-widest text-surface-400">Settings</h3>
                    </div>

                    <div class="space-y-4">
                        {#if mediaType === 'image'}
                            <div class="space-y-1.5">
                                <label class="text-[9px] font-bold uppercase tracking-widest text-surface-400">Username</label>
                                <input type="text" class="w-full bg-surface-50 dark:bg-black border border-surface-200 dark:border-surface-800 rounded-lg h-9 px-3 text-sm font-medium" bind:value={options.username} placeholder="Username..." />
                            </div>
                            <div class="space-y-1.5">
                                <label class="text-[9px] font-bold uppercase tracking-widest text-surface-400">Chapters</label>
                                <input type="text" class="w-full bg-surface-50 dark:bg-black border border-surface-200 dark:border-surface-800 rounded-lg h-9 px-3 font-mono text-xs font-bold" bind:value={options.chapterRange} placeholder="e.g. >=10" />
                            </div>
                        {:else if mediaType === 'video'}
                            <div class="space-y-1.5">
                                <label class="text-[9px] font-bold uppercase tracking-widest text-surface-400">Max Resolution</label>
                                <select class="w-full bg-surface-50 dark:bg-black border border-surface-200 dark:border-surface-800 rounded-lg h-9 px-3 text-xs font-bold appearance-none cursor-pointer" bind:value={options.resolution}>
                                    <option value="best">Best Available</option>
                                    <option value="2160">4K Ultra HD</option>
                                    <option value="1080">1080p Full HD</option>
                                    <option value="720">720p HD</option>
                                </select>
                            </div>
                            <div class="space-y-3 pt-1">
                                <label class="flex items-center gap-3 cursor-pointer group">
                                    <input 
                                        type="checkbox" 
                                        class="checkbox" 
                                        bind:checked={options.playlist} 
                                        onchange={(e) => { if (url.trim()) fetchMeta(url, e.currentTarget.checked); }}
                                    />
                                    <span class="text-[10px] font-bold uppercase tracking-widest text-surface-500">Playlist</span>
                                </label>
                                <label class="flex items-center gap-3 cursor-pointer group">
                                    <input type="checkbox" class="checkbox" bind:checked={options.subtitles} />
                                    <span class="text-[10px] font-bold uppercase tracking-widest text-surface-500">Subtitles</span>
                                </label>
                            </div>
                        {:else if mediaType === 'audio'}
                            <div class="space-y-1.5">
                                <label class="text-[9px] font-bold uppercase tracking-widest text-surface-400">Preferred Format</label>
                                <select class="w-full bg-surface-50 dark:bg-black border border-surface-200 dark:border-surface-800 rounded-lg h-9 px-3 text-xs font-bold appearance-none cursor-pointer" bind:value={options.format}>
                                    <option value="opus">Opus (Standard)</option>
                                    <option value="mp3">MPEG-3 (MP3)</option>
                                    <option value="flac">Lossless (FLAC)</option>
                                </select>
                            </div>
                            <div class="space-y-3 pt-1">
                                <label class="flex items-center gap-3 cursor-pointer group">
                                    <input 
                                        type="checkbox" 
                                        class="checkbox" 
                                        bind:checked={options.playlist} 
                                        onchange={(e) => { if (url.trim()) fetchMeta(url, e.currentTarget.checked); }}
                                    />
                                    <span class="text-[10px] font-bold uppercase tracking-widest text-surface-500">Album</span>
                                </label>
                                <label class="flex items-center gap-3 cursor-pointer group">
                                    <input type="checkbox" class="checkbox" bind:checked={options.embedThumbnail} />
                                    <span class="text-[10px] font-bold uppercase tracking-widest text-surface-500">Cover Art</span>
                                </label>
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Advanced Refined Toggle -->
                <button
                    type="button"
                    class="w-full h-10 flex items-center justify-center gap-2 text-[9px] font-bold uppercase tracking-widest text-surface-400 hover:text-primary-500 transition-all"
                    onclick={() => showAdvanced = !showAdvanced}
                >
                    <Command class="size-3.5" />
                    Advanced Overrides
                    <ChevronDown class="size-3.5 transition-transform {showAdvanced ? 'rotate-180' : ''}" />
                </button>

                {#if showAdvanced}
                    <div transition:slide={{ duration: 250 }} class="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl p-4 space-y-4 shadow-sm">
                        {#if mediaType === 'image'}
                            <div class="space-y-1.5">
                                <label class="text-[9px] font-bold uppercase tracking-widest text-surface-400">Session Password</label>
                                <input type="password" class="w-full bg-surface-50 dark:bg-black border border-surface-100 dark:border-surface-800 rounded-lg h-9 px-3 text-sm focus:ring-1 focus:ring-primary-500" bind:value={options.password} placeholder="••••••••" />
                            </div>
                        {/if}
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-bold uppercase tracking-widest text-surface-400">Terminal Commands</label>
                            <input
                                type="text"
                                class="w-full bg-surface-50 dark:bg-black border border-surface-100 dark:border-surface-800 rounded-lg h-9 px-3 font-mono text-[10px] focus:ring-1 focus:ring-primary-500"
                                bind:value={options.extraArgs}
                                placeholder="--cookies-from-browser ..."
                            />
                        </div>
                    </div>
                {/if}

            </div>
        </div>
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
    .dark .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #1e293b;
    }
</style>
