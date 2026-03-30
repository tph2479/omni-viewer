<script lang="ts">
    import { onDestroy } from "svelte";
    import {
        isVideoFile,
        isZipFile,
        isCbzFile,
        isPdfFile,
        isEpubFile,
        type ImageFile,
    } from "$lib/utils/utils";
    import { cacheVersion } from "$lib/stores/cache.svelte";
    import { lazyThumbnail } from "$lib/utils/thumbnailLoader";
    import {
        Folder,
        FileArchive,
        FileText,
        FileVideo,
        FileAudio,
        Play,
    } from "lucide-svelte";

    type FileActions = {
        openDir: (path: string) => void;
        openCbz: (path: string) => void;
        openModal: (index: number) => void;
    };


    let {
        img,
        index,
        highlighted = false,
        actions,
    }: {
        img: ImageFile;
        index: number;
        highlighted?: boolean;
        actions: FileActions;
    } = $props();

    function handleCardClick() {
        if (img.isDir) {
            actions.openDir(img.path);
            return;
        }
        if (img.isCbz) {
            actions.openCbz(img.path);
            return;
        }
        if (img.isPdf) {
            actions.openModal(index);
            return;
        }
        actions.openModal(index);
    }

    let hoverTimer: any = null;

    function handleMouseEnter() {
        if (img.isDir || img.isCbz || (img.width && img.height)) return;

        hoverTimer = setTimeout(() => {
            fetch(
                `/api/media?path=${encodeURIComponent(img.path)}&metadata=true`,
            )
                .then((res) => res.json())
                .then((data) => {
                    img.size = data.size;
                    img.lastModified = data.lastModified;
                    img.width = data.width;
                    img.height = data.height;
                })
                .catch(() => {});
        }, 150);
    }

    function handleMouseLeave() {
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
    }

    onDestroy(() => {
        if (hoverTimer) clearTimeout(hoverTimer);
    });
</script>

<div class="group flex flex-col">
    <button
        id="item-{img.path.replace(/[^a-zA-Z0-9]/g, '-')}"
        class="relative aspect-square bg-surface-200 dark:bg-surface-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:ring-2 hover:ring-primary-500/50 transition-all duration-300 cursor-pointer border border-surface-300 dark:border-surface-700 w-full"
        onclick={handleCardClick}
    >
        {#if img.isDir}
            <!-- Folder card -->
            <div
                class="absolute inset-0 flex flex-col items-center justify-center bg-surface-100 dark:bg-surface-900 group-hover:bg-surface-200 dark:group-hover:bg-surface-800 transition-colors"
            >
                <Folder
                    class="w-1/2 h-1/2 text-surface-900 dark:text-surface-300 transition-transform duration-300"
                    strokeWidth={1.5}
                />
            </div>
        {:else if isZipFile(img.name)}
            <!-- Zip Icon (No thumbnail per user request) -->
            <div
                class="absolute inset-0 flex flex-col items-center justify-center bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors"
                style:background-color={highlighted
                    ? "rgba(59, 130, 246, 0.5)"
                    : undefined}
            >
                <FileArchive
                    class="w-1/2 h-1/2 text-amber-600 transition-transform duration-300"
                    strokeWidth={1.5}
                />
            </div>
            <div
                class="absolute top-2 left-2 z-10 bg-amber-600 text-white text-[9px] font-black tracking-widest px-2 py-0.5 rounded shadow-lg uppercase"
            >
                ZIP
            </div>
        {:else if isCbzFile(img.name)}
            <!-- CBZ cover -->
            <img
                use:lazyThumbnail={`/api/ebook?path=${encodeURIComponent(img.path)}&cover=true&v=${cacheVersion.value}`}
                decoding="async"
                fetchpriority={index < 12 ? "high" : "auto"}
                alt={img.name}
                class="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ease-out"
            />
            <div
                class="absolute top-2 left-2 z-10 bg-amber-500 text-white text-[9px] font-black tracking-widest px-2 py-0.5 rounded shadow-lg uppercase"
            >
                CBZ
            </div>
            <!-- Fallback Icon for CBZ (Hidden by default, shown on error) -->
            <div
                class="hidden absolute inset-0 w-full h-full flex-col items-center justify-center bg-amber-500/10 transition-colors"
                style:background-color={highlighted
                    ? "rgba(59, 130, 246, 0.5)"
                    : undefined}
            >
                <FileArchive class="w-1/2 h-1/2 text-amber-500 opacity-50" strokeWidth={1.5} />
            </div>
        {:else if isVideoFile(img.name)}
            <div
                class="absolute inset-0"
                style:background-color={highlighted
                    ? "rgba(59, 130, 246, 0.5)"
                    : undefined}
            >
                <img
                    use:lazyThumbnail={`/api/media?path=${encodeURIComponent(img.path)}&thumbnail=true&v=${cacheVersion.value}`}
                    decoding="async"
                    fetchpriority={index < 12 ? "high" : "auto"}
                    alt={img.name}
                    class="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ease-out"
                />
            </div>
            <div class="absolute top-2 left-2 z-10">
                <div
                    class="bg-black/60 p-1.5 rounded-lg border border-white/20 shadow-lg"
                >
                    <Play class="w-4 h-4 text-white" strokeWidth={1.5} />
                </div>
            </div>
        {:else if img.isAudio}
            <div
                class="absolute inset-0 flex flex-col items-center justify-center bg-primary/5 transition-colors group-hover:bg-primary/10"
                style:background-color={highlighted
                    ? "rgba(59, 130, 246, 0.5)"
                    : undefined}
            >
                <FileAudio
                    class="w-1/4 h-1/4 text-primary opacity-20 transition-all duration-500"
                    strokeWidth={1.5}
                />
            </div>
            <img
                use:lazyThumbnail={`/api/media?path=${encodeURIComponent(img.path)}&thumbnail=true&v=${cacheVersion.value}`}
                decoding="async"
                fetchpriority="auto"
                alt={img.name}
                class="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ease-out z-10"
            />
            <div class="absolute top-2 left-2 z-10">
                <div
                    class="bg-primary/80 p-1.5 rounded-lg border border-white/20 shadow-lg group-hover:bg-primary transition-colors"
                >
                    <FileAudio class="w-4 h-4 text-white" strokeWidth={1.5} />
                </div>
            </div>
        {:else if isPdfFile(img.name) || img.isPdf}
            <div
                class="absolute inset-0 flex flex-col items-center justify-center bg-red-500/5 transition-colors group-hover:bg-red-500/10"
                style:background-color={highlighted
                    ? "rgba(59, 130, 246, 0.5)"
                    : undefined}
            >
                <FileText
                    class="w-1/3 h-1/3 text-red-600 opacity-20 transition-all duration-500"
                    strokeWidth={1.5}
                />
            </div>
            <img
                use:lazyThumbnail={`/api/media?path=${encodeURIComponent(img.path)}&thumbnail=true&v=${cacheVersion.value}`}
                decoding="async"
                fetchpriority="auto"
                alt={img.name}
                class="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ease-out z-10"
            />
            <div class="absolute top-2 left-2 z-10">
                <div
                    class="bg-red-600/90 px-2 py-0.5 rounded shadow-lg group-hover:bg-red-600 transition-colors"
                >
                    <span
                        class="text-[9px] font-black text-white tracking-widest uppercase"
                        >PDF</span
                    >
                </div>
            </div>
        {:else if isEpubFile(img.name) || img.isEpub}
            <div
                class="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/5 transition-colors group-hover:bg-emerald-500/10"
                style:background-color={highlighted
                    ? "rgba(59, 130, 246, 0.5)"
                    : undefined}
            >
                <FileText
                    class="w-1/3 h-1/3 text-emerald-600 opacity-20 transition-all duration-500"
                    strokeWidth={1.5}
                />
            </div>
            <img
                use:lazyThumbnail={`/api/ebook?path=${encodeURIComponent(img.path)}&thumbnail=true&v=${cacheVersion.value}`}
                decoding="async"
                fetchpriority="auto"
                alt={img.name}
                class="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ease-out z-10"
            />
            <div class="absolute top-2 left-2 z-10">
                <div
                    class="bg-emerald-600/90 px-2 py-0.5 rounded shadow-lg group-hover:bg-emerald-600 transition-colors"
                >
                    <span
                        class="text-[9px] font-black text-white tracking-widest uppercase"
                        >EPUB</span
                    >
                </div>
            </div>
        {:else}
            <div
                class="absolute inset-0"
                style:background-color={highlighted
                    ? "rgba(59, 130, 246, 0.5)"
                    : undefined}
            >
                <img
                    use:lazyThumbnail={`/api/media?path=${encodeURIComponent(img.path)}&thumbnail=true&v=${cacheVersion.value}`}
                    decoding="async"
                    fetchpriority={index < 12 ? "high" : "auto"}
                    alt={img.name}
                    class="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ease-out"
                />
            </div>
        {/if}
    </button>
    <div class="flex flex-col items-center mt-auto pt-1">
        <p
            class="text-[10px] sm:text-[11px] font-bold truncate text-center px-1 text-surface-600 dark:text-surface-400 group-hover:text-primary transition-colors duration-300 w-full cursor-help"
            title={img.name}
            onmouseenter={handleMouseEnter}
            onmouseleave={handleMouseLeave}
        >
            {img.name}
        </p>
        {#if img.width && img.height}
            <div
                class="text-[9px] font-mono font-black text-primary/50 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-[-2px] group-hover:translate-y-0"
            >
                {img.width}x{img.height}
            </div>
        {/if}
    </div>
</div>
