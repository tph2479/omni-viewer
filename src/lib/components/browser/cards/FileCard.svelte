<script lang="ts">
    import type { MediaFile } from "$lib/stores/browser/types";
    import {
        isZipFile,
        isCbzFile,
        isPdfFile,
        isEpubFile,
        isVideoFile,
    } from "$lib/utils/fileUtils";
    import { cacheVersion } from "$lib/stores/system/cache.svelte";
    import { useMetadataFetch } from "$lib/actions/useMetadataFetch";
    import FolderCard from "./variants/FolderCard.svelte";
    import ZipCard from "./variants/ZipCard.svelte";
    import CbzCard from "./variants/CbzCard.svelte";
    import VideoCard from "./variants/VideoCard.svelte";
    import AudioCard from "./variants/AudioCard.svelte";
    import PdfCard from "./variants/PdfCard.svelte";
    import EpubCard from "./variants/EpubCard.svelte";
    import DefaultCard from "./variants/DefaultCard.svelte";

    import { browserStore } from "$lib/stores/browser/index.svelte";

    type FileActions = {
        openDir: (path: string) => void;
        openCbz: (path: string, context?: string) => void;
        openModal: (index: number) => void;
    };

    let {
        item = $bindable(),
        index,
        highlighted = false,
        actions,
    }: {
        item: MediaFile;
        index: number;
        highlighted?: boolean;
        actions: FileActions;
    } = $props();

    // Computed values
    let thumbnailUrl = $derived.by(() => {
        if (item.mediaType === "directory") {
            return `/api/media?path=${encodeURIComponent(item.path)}&thumbnail=true&v=${cacheVersion.value}`;
        }
        if (isCbzFile(item.name) || item.mediaType === "cbz") {
            return `/api/ebook?path=${encodeURIComponent(item.path)}&cover=true&v=${cacheVersion.value}`;
        }
        if (item.mediaType === "epub") {
            return `/api/ebook?path=${encodeURIComponent(item.path)}&thumbnail=true&v=${cacheVersion.value}`;
        }
        return `/api/media?path=${encodeURIComponent(item.path)}&thumbnail=true&v=${cacheVersion.value}`;
    });
    
    let fetchPriority = $derived((index < 12 ? "high" : "auto") as "high" | "auto");
    let highlightedBg = $derived(
        highlighted ? "rgba(59, 130, 246, 0.5)" : undefined,
    );
    let showOverlay = $derived(
        item.mediaType !== "directory" || browserStore.cover.enabled,
    );

    // Dynamic masked logic
    let textContainer: HTMLElement | null = $state(null);
    let textElement: HTMLElement | null = $state(null);
    let shouldMask = $derived(false);

    $effect(() => {
        if (!textContainer || !textElement) return;

        const observer = new ResizeObserver(() => {
            if (!textContainer || !textElement) return;
            const containerWidth = textContainer.clientWidth;
            const textWidth = textElement.scrollWidth;
            // Nếu text rộng hơn container width * 0.8 thì masked
            shouldMask = textWidth > containerWidth * 0.8;
        });

        observer.observe(textContainer);
        observer.observe(textElement);

        return () => {
            observer.disconnect();
        };
    });

    function handleCardClick() {
        if (item.mediaType === "directory") {
            actions.openDir(item.path);
            return;
        }
        if (isCbzFile(item.name) || item.mediaType === "cbz") {
            const parentPath = item.path.split(/[/\\]/).slice(0, -1).join("/");
            actions.openCbz(item.path, parentPath);
            return;
        }
        actions.openModal(index);
    }

    function handleOpenCbz(targetPath: string, context: string) {
        actions.openCbz(targetPath, context);
    }
</script>

<div class="group flex flex-col">
    <button
        id="item-{item.path.replace(/[^a-zA-Z0-9]/g, '-')}"
        class="relative aspect-square bg-surface-200 dark:bg-surface-800 rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border border-surface-300 dark:border-surface-700 w-full {highlighted
            ? 'ring-[1.5px] ring-primary-300 z-10'
            : ''}"
        onclick={handleCardClick}
        use:useMetadataFetch={item}
    >
        {#if item.mediaType === "directory"}
            <FolderCard {item} {thumbnailUrl} onOpenCbz={handleOpenCbz} />
        {:else if isZipFile(item.name)}
            <ZipCard {highlightedBg} />
        {:else if isCbzFile(item.name) || item.mediaType === "cbz"}
            <CbzCard {item} {thumbnailUrl} {fetchPriority} {highlightedBg} />
        {:else if isVideoFile(item.name) || item.mediaType === "video"}
            <VideoCard {item} {thumbnailUrl} {fetchPriority} {highlightedBg} />
        {:else if item.mediaType === "audio"}
            <AudioCard {item} {thumbnailUrl} {highlightedBg} />
        {:else if isPdfFile(item.name) || item.mediaType === "pdf"}
            <PdfCard {item} {thumbnailUrl} {highlightedBg} />
        {:else if isEpubFile(item.name) || item.mediaType === "epub"}
            <EpubCard {item} {thumbnailUrl} {highlightedBg} />
        {:else}
            <DefaultCard
                {item}
                {thumbnailUrl}
                {fetchPriority}
                {highlightedBg}
            />
        {/if}

        <!-- Filename Overlay (Bottom, with gradient) -->
        {#if showOverlay}
            <div
                class="absolute bottom-0 left-0 right-0 z-30
                    bg-gradient-to-t from-black/90 via-black/60 to-transparent
                    px-2.5 pb-2.5 pt-8"
                bind:this={textContainer}
            >
                <p
                    class="text-[10px] sm:text-[11px] overflow-x-auto
                        text-white [text-shadow:_0_1px_4px_rgba(0,0,0,0.8),0_0_2px_rgba(0,0,0,0.6)]
                        group-hover:text-white
                        transition-colors duration-200
                        white-space-nowrap"
                    title={item.name}
                    bind:this={textElement}
                    style={shouldMask ? "mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent); scrollbar-width: none; -ms-overflow-style: none; -webkit-scrollbar: none;" : "scrollbar-width: none; -ms-overflow-style: none; -webkit-scrollbar: none;"}
                >
                    {item.name}
                </p>
            </div>
        {:else}
            <!-- Filename (No gradient, for plain folder icons) -->
            <div class="absolute bottom-0 left-0 right-0 z-10 px-2.5 pb-2.5">
                <p
                    class="text-[10px] sm:text-[11px] font-semibold truncate
                        text-surface-700 dark:text-surface-200"
                    title={item.name}
                >
                    {item.name}
                </p>
            </div>
        {/if}
    </button>
</div>
