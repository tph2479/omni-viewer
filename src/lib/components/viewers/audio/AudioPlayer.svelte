<script lang="ts">
    import { onDestroy } from "svelte";
    import { fade, fly } from "svelte/transition";
    import { formatBytes, type ImageFile } from "$lib/utils/utils";
    import { cacheVersion } from "$lib/stores/cache.svelte";
    import { createAudioController } from "./audioPlayer.svelte.ts";
    import {
        X,
        Play,
        Pause,
        Volume2,
        VolumeX,
        Volume1,
        Repeat,
        SkipBack,
        SkipForward,
        Disc,
        ArrowBigRightDash,
        Video,
    } from "lucide-svelte";

    let {
        isModalOpen = $bindable(),
        selectedImageIndex = $bindable(),
        loadedImages = $bindable(),
        totalImages,
        hasMore,
        currentPage,
        loadFolder,
        isGrouped = false,
        onSwitchToPagination,
        onSwitchToVideo,
    }: {
        isModalOpen: boolean;
        selectedImageIndex: number;
        loadedImages: ImageFile[];
        totalImages: number;
        hasMore: boolean;
        currentPage: number;
        loadFolder: (
            reset: boolean,
            page: number,
            append?: boolean,
        ) => Promise<void>;
        isGrouped?: boolean;
        onSwitchToPagination?: () => Promise<void>;
        onSwitchToVideo?: () => void;
    } = $props();

    const ctrl = createAudioController();
    let s = $derived(ctrl.state);

    const currentAudio = $derived(loadedImages[selectedImageIndex]);
    const extension = $derived(
        currentAudio?.name.split(".").pop()?.toUpperCase() || "AUDIO",
    );

    $effect(() => {
        if (currentAudio) s.imgFailed = false;
    });

    function close() {
        isModalOpen = false;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") close();
        if (e.key === "ArrowLeft" || e.key === "PageUp") {
            e.preventDefault();
            prev();
        }
        if (e.key === "ArrowRight" || e.key === "PageDown") {
            e.preventDefault();
            next();
        }
        if (e.key === " ") {
            e.preventDefault();
            ctrl.togglePlay();
        }
        if (e.key === "m") ctrl.toggleMute();
    }

    function isAudioOrVideo(item: ImageFile) {
        return (
            item &&
            !item.isDir &&
            !item.isCbz &&
            !item.isPdf &&
            !item.isEpub &&
            (item.isAudio || item.isVideo)
        );
    }

    function prev() {
        let prevIdx = selectedImageIndex - 1;
        while (prevIdx >= 0) {
            if (isAudioOrVideo(loadedImages[prevIdx])) {
                selectedImageIndex = prevIdx;
                return;
            }
            prevIdx--;
        }

        if (currentPage > 0) {
            const targetPage = currentPage - 1;
            selectedImageIndex = -1;
            loadFolder(false, targetPage, false).then(() => {
                if (loadedImages.length > 0) {
                    let lastIdx = -1;
                    for (let i = loadedImages.length - 1; i >= 0; i--) {
                        if (isAudioOrVideo(loadedImages[i])) {
                            lastIdx = i;
                            break;
                        }
                    }
                    if (lastIdx !== -1) {
                        selectedImageIndex = lastIdx;
                    }
                }
            });
        }
    }

    async function next() {
        let nextIdx = selectedImageIndex + 1;

        if (
            isGrouped &&
            nextIdx >= loadedImages.length &&
            onSwitchToPagination
        ) {
            await onSwitchToPagination();
        }

        while (nextIdx < loadedImages.length) {
            if (isAudioOrVideo(loadedImages[nextIdx])) {
                selectedImageIndex = nextIdx;
                return;
            }
            nextIdx++;
        }

        if (hasMore && !isGrouped) {
            selectedImageIndex = -1;
            await loadFolder(false, currentPage + 1, false);
            let startIdx = 0;
            while (startIdx < loadedImages.length) {
                if (isAudioOrVideo(loadedImages[startIdx])) {
                    selectedImageIndex = startIdx;
                    return;
                }
                startIdx++;
            }
        }
    }

    function formatTime(seconds: number) {
        if (isNaN(seconds)) return "0:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const sec = Math.floor(seconds % 60);
        return [h, m, sec]
            .map((v) => (v < 10 ? "0" + v : v))
            .filter((v, i) => v !== "00" || i > 0)
            .join(":");
    }

    function handleSeek(e: Event) {
        const target = e.target as HTMLInputElement;
        if (s.audioPlayer) {
            s.audioPlayer.currentTime = Number(target.value);
        }
    }

    let progress = $derived(
        s.duration ? (s.currentTime / s.duration) * 100 : 0,
    );

    $effect(() => {
        if (isModalOpen) {
            document.body.style.overflow = "hidden";
            window.addEventListener("keydown", handleKeydown);
        } else {
            document.body.style.overflow = "";
            window.removeEventListener("keydown", handleKeydown);
        }
    });

    onDestroy(() => {
        if (typeof document !== "undefined") {
            document.body.style.overflow = "";
            window.removeEventListener("keydown", handleKeydown);
        }
        ctrl.destroy();
    });

    $effect(() => {
        if (
            currentAudio &&
            isModalOpen &&
            typeof navigator !== "undefined" &&
            "mediaSession" in navigator
        ) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: currentAudio.name.replace(/\.[^/.]+$/, ""),
                artist: "Media Viewer",
                artwork: [
                    {
                        src: `/api/media?path=${encodeURIComponent(currentAudio.path)}&thumbnail=true&v=${cacheVersion.value}`,
                        sizes: "512x512",
                        type: "image/jpeg",
                    },
                ],
            });
            navigator.mediaSession.setActionHandler("previoustrack", () =>
                prev(),
            );
            navigator.mediaSession.setActionHandler("nexttrack", () => next());
        }
    });

    $effect(() => {
        if (
            !isModalOpen &&
            typeof navigator !== "undefined" &&
            "mediaSession" in navigator
        ) {
            navigator.mediaSession.metadata = null;
            navigator.mediaSession.setActionHandler("previoustrack", null);
            navigator.mediaSession.setActionHandler("nexttrack", null);
        }
    });
</script>

<div
    class="fixed inset-0 z-[300] flex items-center justify-center bg-surface-900 subtitle-hidden overflow-hidden font-sans"
    role="dialog"
    aria-modal="true"
    transition:fade={{ duration: 200 }}
>
    <!-- Background -->
    <div class="absolute inset-0 z-0">
        {#if !s.imgFailed}
            <img
                src={`/api/media?path=${encodeURIComponent(currentAudio?.path || "")}&thumbnail=true&v=${cacheVersion.value}`}
                alt=""
                class="w-full h-full object-cover opacity-10"
                transition:fade={{ duration: 1000 }}
                onerror={() => (s.imgFailed = true)}
            />
        {:else}
            <div class="w-full h-full bg-surface-800"></div>
        {/if}
        <div
            class="absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/60 to-transparent"
        ></div>
    </div>

    <!-- Visualizer -->
    <div
        class="absolute bottom-0 left-0 right-0 h-56 pointer-events-none z-0 flex justify-center opacity-40"
    >
        <div class="w-full max-w-3xl h-full">
            <canvas bind:this={s.canvas} class="w-full h-full"></canvas>
        </div>
    </div>

    <!-- Main Content -->
    <div class="relative z-10 w-full h-full flex flex-col max-w-4xl mx-auto">
        <!-- Header -->
        <div
            class="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-surface-700/50"
        >
            <div class="w-10"></div>
            <div class="flex items-center gap-2">
                <span
                    class="badge badge-sm variant-filled-primary font-bold text-[10px] tracking-widest uppercase"
                >
                    {extension}
                </span>
            </div>

            <button
                class="btn btn-sm btn-ghost text-surface-400 hover:text-surface-100"
                onclick={close}
            >
                <X class="w-5 h-5" />
            </button>
        </div>

        <!-- Content Area -->
        <div
            class="flex-1 flex flex-col items-center justify-center p-4 md:p-8 gap-3 md:gap-4 overflow-auto pb-56 md:pb-56"
        >
            <!-- Top block: [thumbnail] [title(bottom) + controls] -->
            <div
                class="flex flex-col md:flex-row items-center md:items-stretch gap-4 md:gap-10 w-full max-w-3xl"
            >
                <!-- Cover Art + Vinyl -->
                <div
                    class="relative w-36 h-36 sm:w-44 sm:h-44 md:w-56 md:h-56 shrink-0 mx-auto md:mx-0"
                >
                    <!-- Cover -->
                    <div
                        class="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl border border-surface-600/30 bg-surface-800"
                    >
                        {#if !s.imgFailed}
                            <img
                                src={`/api/media?path=${encodeURIComponent(currentAudio?.path || "")}&thumbnail=true&v=${cacheVersion.value}`}
                                alt={currentAudio?.name}
                                class="w-full h-full object-cover"
                                onerror={() => (s.imgFailed = true)}
                            />
                        {:else}
                            <div
                                class="w-full h-full flex items-center justify-center"
                            >
                                <Disc class="w-16 h-16 text-surface-600" />
                            </div>
                        {/if}
                    </div>

                    <!-- Vinyl Edge (static) -->
                    <div
                        class="absolute -right-6 top-1/2 -translate-y-1/2 w-[85%] h-[85%] rounded-full border border-surface-600/20 shadow-2xl -z-10 opacity-60"
                        style="background: radial-gradient(circle at center, #444444 0%, #262626 100%);"
                    >
                        <div
                            class="absolute inset-[37.5%] rounded-full bg-surface-800/80 border border-surface-600/20 flex items-center justify-center overflow-hidden"
                        >
                            {#if !s.imgFailed}
                                <img
                                    src={`/api/media?path=${encodeURIComponent(currentAudio?.path || "")}&thumbnail=true&v=${cacheVersion.value}`}
                                    alt=""
                                    class="w-full h-full object-cover opacity-50"
                                />
                            {/if}
                        </div>
                    </div>
                </div>

                <!-- Right panel: title (bottom-aligned) + controls -->
                <div class="flex-1 flex flex-col min-w-0 w-full gap-3 md:gap-2">
                    <!-- Title pushes to bottom on desktop via flex-1 -->
                    <div
                        class="flex-1 flex flex-col justify-end text-center md:text-left"
                    >
                        <h1
                            class="text-lg sm:text-xl md:text-2xl font-bold text-surface-100 leading-tight audio-title-scroll"
                            title={currentAudio?.name}
                        >
                            {currentAudio?.name.replace(/\.[^/.]+$/, "")}
                        </h1>
                        <p class="text-surface-400 text-sm mt-1">
                            {formatBytes(currentAudio?.size || 0)} &bull; {selectedImageIndex +
                                1} of {totalImages}
                        </p>
                    </div>
                    <!-- Controls row -->
                    <div
                        class="flex items-center justify-center md:justify-end gap-2 sm:gap-3 shrink-0"
                    >
                        <button
                            class="btn btn-circle btn-ghost text-surface-400 hover:text-surface-100"
                            onclick={prev}
                            disabled={selectedImageIndex === 0 &&
                                currentPage === 0}
                        >
                            <SkipBack class="w-5 h-5" />
                        </button>

                        <!-- Play/Pause -->
                        <button
                            class="btn btn-circle btn-primary w-14 h-14"
                            onclick={ctrl.togglePlay}
                        >
                            {#if s.isPlaying}
                                <Pause class="w-5 h-5" />
                            {:else}
                                <Play class="w-5 h-5" />
                            {/if}
                        </button>

                        <!-- Next -->
                        <button
                            class="btn btn-circle btn-ghost text-surface-400 hover:text-surface-100"
                            onclick={next}
                            disabled={selectedImageIndex ===
                                loadedImages.length - 1 && !hasMore}
                        >
                            <SkipForward class="w-5 h-5" />
                        </button>

                        <!-- Loop -->
                        <button
                            class="btn btn-circle btn-ghost {s.isLooping
                                ? 'text-primary-400'
                                : 'text-surface-500'}"
                            onclick={() => (s.isLooping = !s.isLooping)}
                            title="Loop"
                        >
                            <Repeat class="w-5 h-5" />
                        </button>

                        <!-- Auto Next -->
                        <button
                            class="btn btn-circle btn-ghost {s.isAutoNext
                                ? 'text-primary-400'
                                : 'text-surface-500'}"
                            onclick={() => (s.isAutoNext = !s.isAutoNext)}
                            title="Auto Next"
                        >
                            <ArrowBigRightDash class="w-5 h-5" />
                        </button>

                        <!-- Volume -->
                        <button
                            class="btn btn-circle btn-ghost text-surface-400 hover:text-surface-100"
                            onclick={ctrl.toggleMute}
                        >
                            {#if s.isMuted || s.volume === 0}
                                <VolumeX class="w-5 h-5" />
                            {:else}
                                <Volume2 class="w-5 h-5" />
                            {/if}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Seek bar — full width of parent -->
            <div class="w-full max-w-3xl space-y-1">
                <div
                    class="relative h-2 bg-surface-700 rounded-full overflow-hidden"
                >
                    <div
                        class="absolute top-0 left-0 h-full bg-surface-100 transition-all"
                        style="width: {progress}%"
                    ></div>
                    <input
                        type="range"
                        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        min="0"
                        max={s.duration || 100}
                        value={s.currentTime}
                        oninput={handleSeek}
                    />
                </div>
                <div
                    class="flex justify-between text-xs font-mono text-surface-500"
                >
                    <span class="text-surface-300"
                        >{formatTime(s.currentTime)}</span
                    >
                    <span>{formatTime(s.duration)}</span>
                </div>
            </div>

            <!-- Switch to Video (if applicable) -->
            {#if currentAudio?.isVideo && onSwitchToVideo}
                <button
                    class="btn btn-sm variant-filled-primary"
                    onclick={onSwitchToVideo}
                >
                    <Video class="w-5 h-5 mr-2" />
                    Switch to Video
                </button>
            {/if}
        </div>
    </div>

    <!-- Hidden Audio Element -->
    <audio
        bind:this={s.audioPlayer}
        src={`/api/media?path=${encodeURIComponent(currentAudio?.path || "")}&v=${cacheVersion.value}`}
        crossorigin="anonymous"
        autoplay
        loop={s.isLooping}
        onplay={ctrl.handlePlay}
        onpause={() => (s.isPlaying = false)}
        ontimeupdate={(e) => (s.currentTime = e.currentTarget.currentTime)}
        onloadedmetadata={(e) => {
            s.duration = e.currentTarget.duration;
            if (s.audioPlayer) s.audioPlayer.volume = s.volume;
        }}
        onended={() => {
            if (s.isAutoNext) next();
        }}
    ></audio>
</div>

<style>
    :global(body) {
        overflow: hidden;
    }

    img {
        backface-visibility: hidden;
    }

    /* Scrollable title - hidden scrollbar */
    :global(.audio-title-scroll) {
        overflow-x: auto;
        white-space: nowrap;
        /* Hide scrollbar for all browsers */
        scrollbar-width: none; /* Firefox */
        -ms-overflow-style: none; /* IE/Edge */
    }
    :global(.audio-title-scroll::-webkit-scrollbar) {
        display: none; /* Chrome/Safari/Opera */
    }
</style>
