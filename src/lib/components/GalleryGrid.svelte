<script lang="ts">
    import { type ImageFile } from "$lib/utils/utils";
    import { cacheVersion } from "$lib/stores/cache.svelte";
    import { lazyThumbnail } from "$lib/utils/thumbnailLoader";
    import FileCard from "./FileCard.svelte";

    import {
        ArrowLeft,
        Folder,
        ChevronLeft,
        ChevronRight,
        FolderOpen,
        ArrowRight,
    } from "lucide-svelte";

    type GroupInfo = { items: ImageFile[]; total: number };
    type GroupedData = Record<string, GroupInfo>;
    type CoverFolder = { name: string; path: string; coverPath: string };

    type PaginationState = {
        currentPage: number;
        hasMore: boolean;
        pageSize: number;
        total: number;
        onPageChange: (page: number) => void;
    };

    type CoverModeState = {
        enabled: boolean;
        folders: CoverFolder[];
        total: number;
        page: number;
        hasMore: boolean;
        onFolderClick: (path: string) => void;
        onExit: () => void;
        onPageChange: (page: number) => void;
    };

    type GalleryActions = {
        openModal: (index: number, items?: ImageFile[]) => void;
        openCbz: (path: string) => void;
        openDir: (path: string) => void;
        openGroup?: (type: string) => void;
    };

    let {
        items = $bindable<ImageFile[]>([]),
        isGrouped = false,
        groupedData = null,
        isLoading = false,
        highlightedPath = null,
        pagination = {
            currentPage: 0,
            hasMore: false,
            pageSize: 60,
            total: 0,
            onPageChange: () => {},
        },
        coverMode = {
            enabled: false,
            folders: [],
            total: 0,
            page: 0,
            hasMore: false,
            onFolderClick: () => {},
            onExit: () => {},
            onPageChange: () => {},
        },
        exclusiveMode = {
            type: null,
            total: 0,
            onExit: () => {},
        },
        actions,
    }: {
        items?: ImageFile[];
        isGrouped?: boolean;
        groupedData?: GroupedData | null;
        isLoading?: boolean;
        highlightedPath?: string | null;
        pagination?: PaginationState;
        coverMode?: CoverModeState;
        exclusiveMode?: {
            type: string | null;
            total: number;
            onExit: () => void;
        };
        actions: GalleryActions;
    } = $props();

    const totalPages = $derived(
        Math.ceil(pagination.total / pagination.pageSize),
    );
    const totalCoverPages = $derived(
        Math.ceil(coverMode.total / pagination.pageSize),
    );
</script>

{#if coverMode.enabled && coverMode.folders.length > 0}
    <div class="flex items-center gap-3 mb-4">
        <button
            class="btn btn-sm btn-ghost rounded-lg gap-1 border border-primary/30"
            onclick={() => coverMode.onExit()}
            onmousedown={(e) => e.preventDefault()}
        >
            <ArrowLeft size={16} />
            Back
        </button>
        <h2
            class="text-base font-black tracking-tight uppercase text-surface-900 dark:text-surface-100/80"
        >
            Cover Folders
        </h2>
        <span class="badge badge-primary badge-sm font-bold opacity-80"
            >{coverMode.total}</span
        >
    </div>

    <div
        class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 sm:gap-4 pb-10"
    >
        {#each coverMode.folders as folder}
            <div class="group flex flex-col">
                <button
                    class="relative aspect-square bg-surface-50 dark:bg-surface-900 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:ring-2 hover:ring-primary-500/50 transition-all duration-300 cursor-pointer border-2 border-primary-500/20 hover:border-primary-500/40 w-full"
                    onclick={() => coverMode.onFolderClick(folder.path)}
                >
                    <img
                        use:lazyThumbnail={`/api/media?path=${encodeURIComponent(folder.coverPath)}&thumbnail=true&v=${cacheVersion.value}`}
                        decoding="async"
                        alt={folder.name}
                        class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    />
                    <div class="absolute top-2 left-2 z-20">
                        <div
                            class="bg-primary-500 px-2 py-0.5 rounded shadow-lg group-hover:bg-primary-600 transition-colors flex items-center gap-1"
                        >
                            <Folder
                                size={12}
                                fill="currentColor"
                                class="text-white"
                            />
                            <span
                                class="text-[9px] font-black text-white tracking-widest uppercase"
                                >FOLDER</span
                            >
                        </div>
                    </div>
                    <div
                        class="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-t from-black/60 to-transparent"
                    ></div>
                </button>
                <div class="flex flex-col items-center mt-auto pt-1">
                    <p
                        class="text-[10px] sm:text-[11px] font-bold truncate text-center px-1 text-surface-600 dark:text-surface-400 group-hover:text-primary-500 transition-colors duration-300 w-full"
                        title={folder.name}
                    >
                        {folder.name}
                    </p>
                </div>
            </div>
        {/each}
    </div>

    {#if totalCoverPages > 1}
        <div
            class="flex flex-wrap justify-center items-center gap-2 mt-2 mb-10 w-full"
        >
            <button
                onclick={() => coverMode.onPageChange(coverMode.page - 1)}
                class="btn btn-sm btn-outline btn-square shadow-sm"
                disabled={coverMode.page === 0 || isLoading}
                aria-label="Previous page"
                onmousedown={(e) => e.preventDefault()}
            >
                <ChevronLeft size={16} />
            </button>
            <div class="flex items-center gap-1 font-mono text-sm">
                {#each Array.from({ length: totalCoverPages }) as _, i}
                    {#if i === 0 || i === totalCoverPages - 1 || Math.abs(i - coverMode.page) <= 2}
                        <button
                            onclick={() => coverMode.onPageChange(i)}
                            class="btn btn-sm shadow-sm {coverMode.page === i
                                ? 'btn-primary'
                                : 'btn-ghost'}"
                            disabled={isLoading}
                            onmousedown={(e) => e.preventDefault()}
                        >
                            {i + 1}
                        </button>
                    {:else if Math.abs(i - coverMode.page) === 3}
                        <span class="opacity-50 px-1">...</span>
                    {/if}
                {/each}
            </div>
            <button
                onclick={() => coverMode.onPageChange(coverMode.page + 1)}
                class="btn btn-sm btn-outline btn-square shadow-sm"
                disabled={!coverMode.hasMore || isLoading}
                aria-label="Next page"
                onmousedown={(e) => e.preventDefault()}
            >
                <ChevronRight size={16} />
            </button>
        </div>
    {/if}
{:else if items.length === 0 && !isGrouped}
    {#if isLoading}
        <div
            class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 sm:gap-4 pb-6 animate-pulse"
        >
            {#each Array.from({ length: 12 }) as _}
                <div class="flex flex-col gap-2">
                    <div
                        class="aspect-square bg-surface-200 dark:bg-surface-800 rounded-2xl w-full"
                    ></div>
                    <div
                        class="h-3 bg-surface-200 dark:bg-surface-800 rounded-full w-2/3 mx-auto"
                    ></div>
                </div>
            {/each}
        </div>
    {:else}
        <div
            class="flex-1 flex flex-col items-center justify-center opacity-60 bg-surface-200/30 dark:bg-surface-800/30 p-10 text-center min-h-75"
        >
            <FolderOpen size={56} strokeWidth={1} class="mb-4 opacity-20" />
            <p
                class="text-base font-black uppercase tracking-tight mb-2 text-surface-900 dark:text-surface-100"
            >
                No files found
            </p>
            <p
                class="text-[11px] font-bold uppercase tracking-widest opacity-50 mb-4"
            >
                This directory contains no supported media
            </p>
            <div class="flex flex-wrap justify-center gap-1.5 max-w-sm">
                {#each ["JPG", "PNG", "WEBP", "AVIF", "GIF", "BMP", "HEIC"] as fmt}
                    <span
                        class="badge badge-sm font-black opacity-60 bg-success/10 text-success border-success/20"
                        >{fmt}</span
                    >
                {/each}
                {#each ["MP4", "WEBM", "MKV", "AVI", "MOV", "FLV", "M4V"] as fmt}
                    <span
                        class="badge badge-sm font-black opacity-60 bg-info/10 text-info border-info/20"
                        >{fmt}</span
                    >
                {/each}
                {#each ["MP3", "WAV", "FLAC", "OGG", "M4A", "AAC", "OPUS"] as fmt}
                    <span
                        class="badge badge-sm font-black opacity-60 bg-warning/10 text-warning border-warning/20"
                        >{fmt}</span
                    >
                {/each}
                {#each ["CBZ", "PDF", "EPUB"] as fmt}
                    <span
                        class="badge badge-sm font-black opacity-60 bg-error/10 text-error border-error/20"
                        >{fmt}</span
                    >
                {/each}
            </div>
        </div>
    {/if}
{:else if isGrouped && groupedData}
    <div class="flex flex-col gap-8 p-10">
    {#each ["folders", "images", "cbz", "pdf", "epub", "audio", "videos"] as groupKey}
            {#if groupedData[groupKey] && groupedData[groupKey].items.length > 0}
                {@const groupInfo = groupedData[groupKey]}
                <div class="flex flex-col gap-2">
                    <div class="flex items-center gap-2 ml-1">
                        <h2
                            class="text-base font-black tracking-tight uppercase text-surface-900 dark:text-surface-100/80"
                        >
                            {groupKey}
                        </h2>
                        <span
                            class="badge badge-primary badge-sm font-bold opacity-80"
                            >{groupInfo.total}</span
                        >
                    </div>
                    <div
                        class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 sm:gap-4"
                    >
                        {#each groupInfo.items as img, i}
                            <FileCard
                                {img}
                                index={i}
                                highlighted={highlightedPath === img.path}
                                actions={{
                                    openDir: actions.openDir,
                                    openCbz: actions.openCbz,
                                    openModal: (idx) =>
                                        actions.openModal(idx, groupInfo.items),
                                }}
                            />
                        {/each}

                        {#if groupInfo.total > 11}
                            <button
                                class="relative aspect-square rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:ring-2 hover:ring-primary/50 transition-all duration-300 cursor-pointer border border-primary/20 bg-primary/5 flex flex-col items-center justify-center group w-full"
                                onclick={() => actions.openGroup?.(groupKey)}
                            >
                                <div
                                    class="bg-primary/20 p-4 rounded-full group-hover:bg-primary/30 transition-colors group-hover:scale-110 duration-300"
                                >
                                    <ArrowRight
                                        size={32}
                                        class="text-primary"
                                    />
                                </div>
                                <span
                                    class="mt-3 text-xs text-primary/80 uppercase tracking-widest"
                                    >View All</span
                                >
                            </button>
                        {/if}
                    </div>
                </div>
            {/if}
        {/each}
    </div>
{:else}
    <div class="flex flex-col p-10">
        {#if exclusiveMode.type}
            <div class="flex items-center gap-3 mb-6 p-1">
                <button
                    class="group flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-200 dark:hover:bg-surface-800 transition-colors"
                    onclick={exclusiveMode.onExit}
                    onmousedown={(e) => e.preventDefault()}
                    title="Back to group view"
                >
                    <ArrowLeft
                        size={20}
                        class="text-surface-900 dark:text-surface-100"
                    />
                </button>
                <div class="flex items-center gap-2">
                    <h2
                        class="text-base font-black tracking-tight uppercase text-surface-900 dark:text-surface-100/80"
                    >
                        <span class="opacity-40 font-bold mr-1">Viewing:</span>
                        {exclusiveMode.type}
                    </h2>
                    <span
                        class="badge badge-primary badge-sm font-bold opacity-80"
                        >{exclusiveMode.total}</span
                    >
                </div>
            </div>
        {/if}
        <div
            class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 sm:gap-4"
        >
            {#each items as _, i}
            <FileCard
                bind:img={items[i]}
                index={i}
                highlighted={highlightedPath === items[i].path}
                actions={{
                    openDir: actions.openDir,
                    openCbz: actions.openCbz,
                    openModal: actions.openModal,
                }}
            />
        {/each}
    </div>

    {#if totalPages > 1}
        <div
            class="flex flex-wrap justify-center items-center gap-2 mt-6 mb-10 w-full"
        >
            <button
                type="button"
                onclick={() =>
                    pagination.onPageChange(pagination.currentPage - 1)}
                class="btn-icon btn-icon-sm variant-soft hover:variant-filled-surface transition-colors"
                disabled={pagination.currentPage === 0 || isLoading}
                aria-label="Previous page"
            >
                <ChevronLeft size={16} />
            </button>

            <div class="flex items-center gap-2 font-mono text-sm">
                {#each Array.from({ length: totalPages }) as _, i}
                    {#if i === 0 || i === totalPages - 1 || Math.abs(i - pagination.currentPage) <= 2}
                        <button
                            type="button"
                            onclick={() => pagination.onPageChange(i)}
                            class="btn btn-sm transition-all duration-300 font-bold
                            {pagination.currentPage === i
                                ? 'variant-filled-primary ring-1 ring-primary-500 ring-offset-surface-50 dark:ring-offset-surface-900 scale-110 z-10'
                                : 'variant-soft-surface text-surface-900 dark:text-surface-50 border border-surface-200 dark:border-surface-700 hover:border-surface-400 dark:hover:border-surface-500'}"
                            disabled={isLoading}
                        >
                            {i + 1}
                        </button>
                    {:else if Math.abs(i - pagination.currentPage) === 3}
                        <span class="px-1 text-surface-500 italic opacity-50"
                            >...</span
                        >
                    {/if}
                {/each}
            </div>

            <button
                type="button"
                onclick={() =>
                    pagination.onPageChange(pagination.currentPage + 1)}
                class="btn-icon btn-icon-sm variant-soft hover:variant-filled-surface transition-colors"
                disabled={!pagination.hasMore || isLoading}
                aria-label="Next page"
            >
                <ChevronRight size={16} />
            </button>
        </div>
    {/if}
    </div>
{/if}
