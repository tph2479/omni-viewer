<script lang="ts">
    import { onDestroy } from "svelte";
    import { isZipFile, type ImageFile } from "$lib/utils/fileUtils";
    import {
        isVideoFile,
        isCbzFile,
        isPdfFile,
        isEpubFile,
    } from "$lib/utils/fileUtils";
    import { cacheVersion } from "$lib/stores/system/cache.svelte";
    import { lazyThumbnail } from "$lib/actions/lazyThumbnail";
    import {
        Folder,
        FileArchive,
        FileText,
        FileAudio,
        Play,
        BookOpen,
    } from "lucide-svelte";
    import { browserStore } from "$lib/stores/browser/index.svelte";

    type FileActions = {
        openDir: (path: string) => void;
        openCbz: (path: string, context?: string) => void;
        openModal: (index: number) => void;
    };

    let {
        img = $bindable(),
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
        if (isCbzFile(img.name) || img.isCbz) {
            const parentPath = img.path.split(/[/\\]/).slice(0, -1).join("/");
            actions.openCbz(img.path, parentPath);
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
        class="relative aspect-square bg-surface-200 dark:bg-surface-800 rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border border-surface-300 dark:border-surface-700 w-full"
        onclick={handleCardClick}
    >
        {#if img.isDir}
            <!-- Folder card -->
            <div
                class="absolute inset-0 flex flex-col items-center justify-center bg-surface-100 dark:bg-surface-900 dark:group-hover:bg-surface-700 transition-colors"
            >
                <Folder
                    class="w-1/3 h-1/3 text-surface-800 dark:text-surface-400"
                />
            </div>
            {#if browserStore.cover.enabled}
                <img
                    use:lazyThumbnail={`/api/media?path=${encodeURIComponent(img.path)}&thumbnail=true&v=${cacheVersion.value}`}
                    decoding="async"
                    alt={img.name}
                    class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />
                <div class="absolute top-2 left-2 z-10">
                    <div
                        class="bg-black/60 p-1.5 rounded-xl border border-white/20 shadow-lg"
                    >
                        <Folder class="w-4 h-4 text-white" />
                    </div>
                </div>
            {/if}

            {#if browserStore.cover.enabled && (img.firstCbz || img.hasImages)}
                <div
                    class="absolute bottom-2 right-2 z-20"
                    onclick={(e) => {
                        e.stopPropagation();
                        // If we have a firstCbz, context is the current folder (img.path)
                        // If we are opening the folder itself as a book, context is the parent folder
                        const target = img.firstCbz || img.path;
                        const context = img.firstCbz
                            ? img.path
                            : img.path.split(/[/\\]/).slice(0, -1).join("/");
                        actions.openCbz(target, context);
                    }}
                    onkeydown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            actions.openCbz(img.firstCbz || img.path, img.path);
                        }
                    }}
                    role="button"
                    tabindex="0"
                >
                    <div
                        class="flex items-center gap-1.5 py-1 px-2.5
                            bg-black/60 hover:bg-primary-500/80 backdrop-blur-md
                            text-white rounded-lg border border-white/20 shadow-lg
                            transition-all duration-200 scale-90 hover:scale-100 shadow-xl"
                        title={img.firstCbz ? "Open first CBZ" : "Open images"}
                    >
                        <BookOpen size={14} strokeWidth={2} />
                        <span
                            class="text-[10px] font-black uppercase tracking-wider"
                            >Open</span
                        >
                    </div>
                </div>
            {/if}
        {:else if isZipFile(img.name)}
            <!-- Zip Icon (No thumbnail per user request) -->
            <div
                class="absolute inset-0 flex flex-col items-center justify-center bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors"
                style:background-color={highlighted
                    ? "rgba(59, 130, 246, 0.5)"
                    : undefined}
            >
                <FileArchive
                    class="w-1/2 h-1/2 text-amber-600 opacity-20 transition-all duration-500"
                />
            </div>
            <div class="absolute top-2 left-2 z-10">
                <div
                    class="bg-black/60 p-1.5 rounded-lg border border-white/20 shadow-lg"
                >
                    <FileArchive class="w-4 h-4 text-white" />
                </div>
            </div>
        {:else if isCbzFile(img.name)}
            <!-- CBZ cover -->
            <img
                use:lazyThumbnail={`/api/ebook?path=${encodeURIComponent(img.path)}&cover=true&v=${cacheVersion.value}`}
                decoding="async"
                fetchpriority={index < 12 ? "high" : "auto"}
                alt={img.name}
                class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            />
            <div class="absolute top-2 left-2 z-10">
                <div
                    class="bg-black/60 p-1.5 rounded-lg border border-white/20 shadow-lg"
                >
                    <FileArchive class="w-4 h-4 text-white" />
                </div>
            </div>
            <!-- Fallback Icon for CBZ (Hidden by default, shown on error) -->
            <div
                class="hidden absolute inset-0 w-full h-full flex-col items-center justify-center bg-amber-500/10 transition-colors"
                style:background-color={highlighted
                    ? "rgba(59, 130, 246, 0.5)"
                    : undefined}
            >
                <FileArchive class="w-1/2 h-1/2 text-amber-500 opacity-50" />
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
                    class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />
            </div>
            <div class="absolute top-2 left-2 z-10">
                <div
                    class="bg-black/60 p-1.5 rounded-lg border border-white/20 shadow-lg"
                >
                    <Play class="w-4 h-4 text-white" />
                </div>
            </div>
        {:else if img.isAudio}
            <div
                class="absolute inset-0"
                style:background-color={highlighted
                    ? "rgba(59, 130, 246, 0.5)"
                    : undefined}
            >
                <img
                    use:lazyThumbnail={`/api/media?path=${encodeURIComponent(img.path)}&thumbnail=true&v=${cacheVersion.value}`}
                    decoding="async"
                    fetchpriority="auto"
                    alt={img.name}
                    class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />
            </div>
            <div class="absolute top-2 left-2 z-10">
                <div
                    class="bg-black/60 p-1.5 rounded-lg border border-white/20 shadow-lg"
                >
                    <FileAudio class="w-4 h-4 text-white" />
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
                />
            </div>
            <img
                use:lazyThumbnail={`/api/media?path=${encodeURIComponent(img.path)}&thumbnail=true&v=${cacheVersion.value}`}
                decoding="async"
                fetchpriority="auto"
                alt={img.name}
                class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out z-10"
            />
            <div class="absolute top-2 left-2 z-10">
                <div
                    class="bg-black/60 p-1.5 rounded-lg border border-white/20 shadow-lg"
                >
                    <FileText class="w-4 h-4 text-white" />
                </div>
            </div>
        {:else if isEpubFile(img.name) || img.isEpub}
            <div
                class="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/5 transition-colors group-hover:bg-emerald-500/10"
                style:background-color={highlighted
                    ? "rgba(59, 130, 246, 0.5)"
                    : undefined}
            >
                <BookOpen
                    class="w-1/3 h-1/3 text-emerald-600 opacity-20 transition-all duration-500"
                />
            </div>
            <img
                use:lazyThumbnail={`/api/ebook?path=${encodeURIComponent(img.path)}&thumbnail=true&v=${cacheVersion.value}`}
                decoding="async"
                fetchpriority="auto"
                alt={img.name}
                class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out z-10"
            />
            <div class="absolute top-2 left-2 z-10">
                <div
                    class="bg-black/60 p-1.5 rounded-lg border border-white/20 shadow-lg"
                >
                    <BookOpen class="w-4 h-4 text-white" />
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
                    class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />
            </div>
        {/if}
    </button>
    <div class="flex flex-col items-center mt-auto pt-1">
        <p
            class="text-[10px] sm:text-[11px] font-bold truncate text-center px-1 text-surface-600 dark:text-surface-100 group-hover:text-[var(--color-primary-500)] transition-colors duration-300 w-full"
            title={img.name}
            onmouseenter={handleMouseEnter}
            onmouseleave={handleMouseLeave}
        >
            {img.name}
        </p>
    </div>
</div>
