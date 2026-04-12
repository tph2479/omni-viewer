<script lang="ts">
    import { onDestroy, setContext } from "svelte";
    import { fade } from "svelte/transition";
    import type { MediaFile } from '$lib/client/stores/browser/types';
    import { cacheVersion } from "$lib/client/stores/system/cache.svelte";
    import { createAudioController, AUDIO_CONTEXT_KEY } from "./audioPlayer.svelte.ts";
    import { Disc } from "lucide-svelte";
    import AudioHeader from "./AudioHeader.svelte";
    import AudioControls from "./AudioControls.svelte";

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
        loadedImages: MediaFile[];
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

    const ctrl = createAudioController({
        get isModalOpen() { return isModalOpen; },
        set isModalOpen(v) { isModalOpen = v; },
        get selectedImageIndex() { return selectedImageIndex; },
        set selectedImageIndex(v) { selectedImageIndex = v; },
        get loadedImages() { return loadedImages; },
        get totalImages() { return totalImages; },
        get hasMore() { return hasMore; },
        get currentPage() { return currentPage; },
        get loadFolder() { return loadFolder; },
        get isGrouped() { return isGrouped; },
        get onSwitchToPagination() { return onSwitchToPagination; },
        get onSwitchToVideo() { return onSwitchToVideo; }
    });
    setContext(AUDIO_CONTEXT_KEY, ctrl);
    
    let s = $derived(ctrl.state);
    const currentAudio = $derived(ctrl.currentAudio);

    $effect(() => {
        if (currentAudio) s.imgFailed = false;
    });

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") ctrl.close();
        if (e.key === "ArrowLeft" || e.key === "PageUp") {
            e.preventDefault();
            ctrl.prev();
        }
        if (e.key === "ArrowRight" || e.key === "PageDown") {
            e.preventDefault();
            ctrl.next();
        }
        if (e.key === " ") {
            e.preventDefault();
            ctrl.togglePlay();
        }
        if (e.key === "m") ctrl.toggleMute();
    }



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
                ctrl.prev(),
            );
            navigator.mediaSession.setActionHandler("nexttrack", () => ctrl.next());
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
    class="fixed inset-0 z-[300] flex items-center justify-center bg-surface-50/70 dark:bg-surface-900/70 backdrop-blur-md subtitle-hidden overflow-hidden font-sans"
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
            <div class="w-full h-full bg-surface-200 dark:bg-surface-800"></div>
        {/if}
        <div
            class="absolute inset-0 bg-gradient-to-t from-surface-50 dark:from-surface-900 via-surface-50/60 dark:via-surface-900/60 to-transparent"
        ></div>
    </div>

    <!-- Visualizer -->
    <div
        class="absolute bottom-0 left-0 right-0 h-56 pointer-events-none z-0 flex justify-center opacity-40 dark:opacity-40"
    >
        <div class="w-full max-w-3xl h-full">
            <canvas bind:this={s.canvas} class="w-full h-full"></canvas>
        </div>
    </div>

    <!-- Main Content -->
    <div class="relative z-10 w-full h-full flex flex-col max-w-4xl mx-auto">
        <AudioHeader />

        <!-- Content Area -->
        <div
            class="flex-1 flex flex-col items-center justify-center p-4 md:p-8 gap-3 md:gap-4 overflow-auto pb-56 md:pb-56"
        >
            <!-- Top block: [thumbnail] [title(bottom) + controls] -->
            <AudioControls>
                <!-- Cover Art + Vinyl -->
                <div
                    class="relative w-36 h-36 sm:w-44 sm:h-44 md:w-56 md:h-56 shrink-0 mx-auto md:mx-0"
                >
                    <!-- Cover -->
                    <div
                        class="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl border border-surface-200 dark:border-surface-700/30 bg-surface-100 dark:bg-surface-800"
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
                                <Disc class="w-16 h-16 text-surface-400 dark:text-surface-600" />
                            </div>
                        {/if}
                    </div>

                    <!-- Vinyl Edge (static) -->
                    <div
                        class="absolute -right-6 top-1/2 -translate-y-1/2 w-[85%] h-[85%] rounded-full border border-surface-200 dark:border-surface-700/20 shadow-2xl -z-10 opacity-60"
                        style="background: radial-gradient(circle at center, #444444 0%, #262626 100%);"
                    >
                        <div
                            class="absolute inset-[37.5%] rounded-full bg-surface-100 dark:bg-surface-800/80 border border-surface-200 dark:border-surface-700/20 flex items-center justify-center overflow-hidden"
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
            </AudioControls>
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
            s.isPlaying = false;
            ctrl.stopVisualizer();
            if (s.isAutoNext) ctrl.next();
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
