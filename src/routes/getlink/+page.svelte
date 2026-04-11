<script lang="ts">
    import {
        Link, Image, Video, Music, Loader2, Settings2, Download,
        ChevronDown, ChevronRight, Command, Clock
    } from "lucide-svelte";
    import { toaster } from "$lib/stores/ui/toaster";
    import { slide, fade } from "svelte/transition";

    let url = $state("");
    let mediaType = $state<"image" | "video" | "audio">("image");
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
    type Meta = { thumbnail: string | null; title: string | null; uploader: string | null; duration: number | null; extractor: string | null };
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

    async function fetchMeta(targetUrl: string) {
        // Only attempt for video/audio - yt-dlp won't help for gallery-dl URLs
        if (!targetUrl.trim()) { meta = null; return; }
        try { new URL(targetUrl); } catch { meta = null; return; }

        metaLoading = true;
        meta = null;
        try {
            const res = await fetch(`/api/getlink/info?url=${encodeURIComponent(targetUrl)}`);
            if (res.ok) {
                meta = await res.json();
            } else {
                meta = null;
            }
        } catch {
            meta = null;
        } finally {
            metaLoading = false;
        }
    }

    function onUrlChange(value: string) {
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

    async function handleSubmit() {
        if (!url.trim()) {
            toaster.create({ type: "error", title: "Error", description: "Please enter a URL" });
            return;
        }
        try { new URL(url); } catch {
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
                body: JSON.stringify({ url, type: mediaType, options }),
            });

            if (!response.ok || !response.body) {
                const data = await response.json().catch(() => ({}));
                result = { success: false, message: data.error || "An error occurred" };
                toaster.create({ type: "error", title: "Error", description: result.message });
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
                                toaster.create({ type: "success", title: "Done", description: desc });
                                url = "";
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

<div class="min-h-[85vh] w-full flex items-start justify-center p-4 md:p-8">
    <div class="w-full max-w-5xl">
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6 lg:items-start">

            <!-- ===== LEFT COLUMN: URL + Preview + Progress ===== -->
            <div class="lg:col-span-3 space-y-4">

                <!-- URL Input -->
                <div class="flex items-center gap-3 bg-surface-50 dark:bg-surface-900 border border-surface-200-800 rounded-xl px-4 h-14 focus-within:border-primary-500 transition-colors">
                    <Link class="size-5 text-surface-400 shrink-0" />
                    <input
                        type="text"
                        class="w-full bg-transparent border-none outline-none ring-0 text-base placeholder:text-surface-400 text-surface-900 dark:text-surface-50 font-medium"
                        value={url}
                        placeholder="Paste your URL here..."
                        oninput={(e) => onUrlChange((e.target as HTMLInputElement).value)}
                        onkeydown={(e) => e.key === "Enter" && handleSubmit()}
                        disabled={isLoading}
                    />
                    {#if metaLoading}
                        <Loader2 class="size-4 text-surface-400 shrink-0 animate-spin" />
                    {/if}
                </div>

                <!-- Thumbnail Preview -->
                {#if meta && (meta.thumbnail || meta.title)}
                    <div class="flex items-center gap-4 p-3 bg-surface-50 dark:bg-surface-900 border border-surface-200-800 rounded-xl" transition:slide={{ duration: 200 }}>
                        {#if meta.thumbnail}
                            <img
                                src={meta.thumbnail}
                                alt="thumbnail"
                                class="h-20 w-36 object-cover rounded-lg shrink-0 bg-surface-200 dark:bg-surface-800"
                            />
                        {/if}
                        <div class="min-w-0 space-y-1.5">
                            {#if meta.title}
                                <p class="font-semibold text-sm leading-snug line-clamp-2 text-surface-900 dark:text-surface-50">{meta.title}</p>
                            {/if}
                            <div class="flex flex-wrap items-center gap-2 text-xs text-surface-500">
                                {#if meta.uploader}
                                    <span>{meta.uploader}</span>
                                {/if}
                                {#if meta.duration}
                                    <span class="flex items-center gap-1">
                                        <Clock class="size-3" />{formatDuration(meta.duration)}
                                    </span>
                                {/if}
                                {#if meta.extractor}
                                    <span class="badge preset-tonal-surface text-[10px] px-1.5 py-0.5">{meta.extractor}</span>
                                {/if}
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- Progress Panel -->
                {#if isLoading || (result && progressLines.length > 0)}
                    <div transition:slide={{ duration: 250 }} class="bg-surface-50 dark:bg-surface-900 border border-surface-200-800 rounded-xl p-4 space-y-3">
                        <div class="flex items-center justify-between text-xs text-surface-500">
                            <span class="truncate max-w-[80%] font-mono">{progressStatus}</span>
                            {#if progressPercent !== null}
                                <span class="font-bold tabular-nums text-primary-500 shrink-0 ml-2">{progressPercent.toFixed(1)}%</span>
                            {/if}
                        </div>
                        <div class="w-full h-1.5 bg-surface-200 dark:bg-surface-800 rounded-full overflow-hidden">
                            {#if progressPercent !== null}
                                <div class="h-full bg-primary-500 rounded-full transition-all duration-300" style="width: {progressPercent}%"></div>
                            {:else}
                                <div class="h-full w-1/3 bg-primary-500 rounded-full animate-[indeterminate_1.5s_ease-in-out_infinite]"></div>
                            {/if}
                        </div>

                        <!-- Console toggle -->
                        <div>
                            <button
                                type="button"
                                class="flex items-center gap-1.5 text-xs text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors font-medium"
                                onclick={() => showConsole = !showConsole}
                            >
                                <ChevronRight class="size-3.5 transition-transform duration-200 {showConsole ? 'rotate-90' : ''}" />
                                Console output
                            </button>
                            {#if showConsole}
                                <div transition:slide={{ duration: 200 }}>
                                    <div
                                        bind:this={logEl}
                                        class="mt-2 bg-black/80 text-surface-100 rounded-lg font-mono text-[11px] leading-relaxed p-3 max-h-64 overflow-y-auto whitespace-pre-wrap"
                                    >
                                        {#each progressLines as line}
                                            <div>{line}</div>
                                        {/each}
                                        {#if isLoading}
                                            <div class="animate-pulse opacity-60">▮</div>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}

                <!-- Downloaded files list (desktop only) -->
                {#if downloadedFiles.length > 0 && !isLoading}
                    <div transition:slide={{ duration: 200 }} class="bg-surface-50 dark:bg-surface-900 border border-surface-200-800 rounded-xl p-4 space-y-2">
                        <p class="text-xs font-semibold uppercase tracking-wider text-surface-500">{downloadedFiles.length} file{downloadedFiles.length > 1 ? 's' : ''} downloaded</p>
                        <ul class="space-y-1 max-h-40 overflow-y-auto">
                            {#each downloadedFiles as f}
                                <li class="text-sm font-mono text-surface-700 dark:text-surface-300 truncate flex items-center gap-2">
                                    <span class="size-1.5 rounded-full bg-success-500 shrink-0"></span>
                                    {f}
                                </li>
                            {/each}
                        </ul>
                    </div>
                {/if}

            </div>

            <!-- ===== RIGHT COLUMN: Controls ===== -->
            <div class="lg:col-span-2 space-y-4">

                <!-- Media Type: horizontal on mobile, vertical on desktop -->
                <div class="bg-surface-50 dark:bg-surface-900 border border-surface-200-800 rounded-xl p-1 grid grid-cols-3 gap-1 lg:flex lg:flex-col">
                    {#each mediaOptions as option}
                        <button
                            type="button"
                            class="flex flex-col lg:flex-row items-center lg:items-center gap-1.5 lg:gap-3 px-2 lg:px-4 py-3 rounded-xl border transition-all duration-200 lg:text-left
                                {mediaType === option.value
                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                                    : 'border-transparent text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'}"
                            onclick={() => (mediaType = option.value as "image" | "video" | "audio")}
                            disabled={isLoading}
                        >
                            <svelte:component this={option.icon} class="size-5 shrink-0" />
                            <span class="font-semibold text-sm">{option.label}</span>
                        </button>
                    {/each}
                </div>

                <!-- Quick Options (context-sensitive) -->
                <div class="bg-surface-50 dark:bg-surface-900 border border-surface-200-800 rounded-xl p-4 space-y-3">
                    {#if mediaType === 'image'}
                        <div class="space-y-1.5" in:fade={{ duration: 150 }}>
                            <label class="text-xs font-semibold uppercase tracking-wider text-surface-500">Username</label>
                            <input type="text" class="input preset-outlined h-10 rounded-xl" bind:value={options.username} placeholder="(optional)" disabled={isLoading} />
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold uppercase tracking-wider text-surface-500">Chapter Filter</label>
                            <input type="text" class="input preset-outlined h-10 rounded-xl font-mono text-sm" bind:value={options.chapterRange} placeholder="e.g. >=10 and <=20" disabled={isLoading} />
                        </div>
                    {:else if mediaType === 'video'}
                        <div class="space-y-1.5" in:fade={{ duration: 150 }}>
                            <label class="text-xs font-semibold uppercase tracking-wider text-surface-500">Resolution</label>
                            <select class="select preset-outlined h-10 rounded-xl cursor-pointer" bind:value={options.resolution} disabled={isLoading}>
                                <option value="best">Best Available</option>
                                <option value="2160">4K (2160p)</option>
                                <option value="1440">2K (1440p)</option>
                                <option value="1080">Full HD (1080p)</option>
                                <option value="720">HD (720p)</option>
                                <option value="480">SD (480p)</option>
                            </select>
                        </div>
                        <label class="flex items-center gap-3 cursor-pointer px-1">
                            <input type="checkbox" class="checkbox" bind:checked={options.playlist} disabled={isLoading} />
                            <span class="text-sm">Download entire playlist</span>
                        </label>
                        <label class="flex items-center gap-3 cursor-pointer px-1">
                            <input type="checkbox" class="checkbox" bind:checked={options.subtitles} disabled={isLoading} />
                            <span class="text-sm">Embed subtitles</span>
                        </label>
                    {:else if mediaType === 'audio'}
                        <div class="space-y-1.5" in:fade={{ duration: 150 }}>
                            <label class="text-xs font-semibold uppercase tracking-wider text-surface-500">Format</label>
                            <select class="select preset-outlined h-10 rounded-xl cursor-pointer" bind:value={options.format} disabled={isLoading}>
                                <option value="mp3">MP3</option>
                                <option value="flac">FLAC</option>
                                <option value="m4a">M4A</option>
                                <option value="opus">Opus</option>
                                <option value="wav">WAV</option>
                            </select>
                        </div>
                        <label class="flex items-center gap-3 cursor-pointer px-1">
                            <input type="checkbox" class="checkbox" bind:checked={options.playlist} disabled={isLoading} />
                            <span class="text-sm">Download entire playlist</span>
                        </label>
                        <label class="flex items-center gap-3 cursor-pointer px-1">
                            <input type="checkbox" class="checkbox" bind:checked={options.embedThumbnail} disabled={isLoading} />
                            <span class="text-sm">Embed cover art</span>
                        </label>
                    {/if}
                </div>

                <!-- Download Button -->
                <button
                    type="button"
                    class="btn preset-filled-primary w-full h-12 rounded-xl font-bold tracking-wide transition-all disabled:opacity-50 active:scale-[0.98]"
                    onclick={handleSubmit}
                    disabled={isLoading || !url.trim()}
                >
                    {#if isLoading}
                        <Loader2 class="size-5 animate-spin mr-2" />
                        Downloading...
                    {:else}
                        <Download class="size-5 mr-2" />
                        Download to Server
                    {/if}
                </button>

                <!-- Advanced Options Toggle -->
                <div class="flex justify-center">
                    <button
                        type="button"
                        class="flex items-center gap-2 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 font-medium transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800"
                        onclick={() => showAdvanced = !showAdvanced}
                    >
                        <Settings2 class="size-4" />
                        Advanced
                        <ChevronDown class="size-4 transition-transform duration-200 {showAdvanced ? 'rotate-180' : ''}" />
                    </button>
                </div>

                <!-- Advanced Options Panel -->
                {#if showAdvanced}
                    <div transition:slide={{ duration: 250 }}>
                        <div class="bg-surface-50 dark:bg-surface-900 border border-surface-200-800 rounded-xl p-4 space-y-4">
                            {#if mediaType === 'image'}
                                <div class="space-y-1.5">
                                    <label class="text-xs font-semibold uppercase tracking-wider text-surface-500">Password</label>
                                    <input type="password" class="input preset-outlined h-10 rounded-xl" bind:value={options.password} placeholder="(optional)" disabled={isLoading} />
                                </div>
                            {/if}
                            <div class="space-y-1.5">
                                <label class="text-xs font-semibold uppercase tracking-wider text-surface-500 flex items-center gap-1.5">
                                    <Command class="size-3.5" /> Extra Arguments
                                </label>
                                <input
                                    type="text"
                                    class="input preset-outlined h-10 rounded-xl font-mono text-sm"
                                    bind:value={options.extraArgs}
                                    placeholder="e.g. --cookies-from-browser firefox"
                                    disabled={isLoading}
                                />
                            </div>
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
        100% { transform: translateX(400%); }
    }
    @keyframes countdown {
        from { transform: scaleX(1); }
        to   { transform: scaleX(0); }
    }
</style>
