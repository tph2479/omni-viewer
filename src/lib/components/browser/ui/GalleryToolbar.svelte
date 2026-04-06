<script lang="ts">
    import type { ImageFile } from "$lib/utils/fileUtils";
    import {
        FolderOpen,
        ArrowUp,
        RefreshCw,
        Layers,
        Image,
        Video,
        Music,
        BookOpen,
        LayoutGrid,
        ChevronsRight,
        Maximize,
        ScrollText,
        Library,
    } from "lucide-svelte";

    type FolderState = {
        path: string;
        isFolderSelected: boolean;
        isGrouped: boolean;
        isCoverMode?: boolean;
        exclusiveType?: string | null;
        items: ImageFile[];
        onPathChange?: (v: string) => void;
    };


    type StatsState = {
        items: number;
        images: number;
        videos: number;
        audio: number;
        ebook: number;
    };

    type SortState = {
        current:
            | "date_desc"
            | "date_asc"
            | "name_asc"
            | "name_desc"
            | "size_asc"
            | "size_desc";
        onChange: (
            v:
                | "date_desc"
                | "date_asc"
                | "name_asc"
                | "name_desc"
                | "size_asc"
                | "size_desc",
        ) => void;
    };

    type FilterState = {
        type: "all" | "images" | "videos" | "audio" | "ebook";
        onChange: (v: "all" | "images" | "videos" | "audio" | "ebook") => void;
    };

    type ToolbarActions = {
        onLoad: () => void;
        onOpenPicker: () => void;
        onOpenWebtoon: () => void;
        onToggleCoverMode: () => void;
        onGoUp: (dir: string) => void;
    };

    let {
        folder,
        stats,
        sort,
        filter,
        actions,
        isLoading = false,
    }: {
        folder: FolderState;
        stats: StatsState;
        sort: SortState;
        filter: FilterState;
        actions: ToolbarActions;
        isLoading?: boolean;
    } = $props();

    const folderPathRaw = $derived(folder?.path ?? "");
    const isFolderSelected = $derived(folder?.isFolderSelected ?? false);
    const isGrouped = $derived(folder?.isGrouped ?? false);
    const exclusiveType = $derived(folder?.exclusiveType ?? null);
    const loadedImages = $derived(folder?.items ?? []);

    const folderPath = $derived.by(() => {
        if (!folderPathRaw) return "";
        return exclusiveType ? `${folderPathRaw} > ${exclusiveType}` : folderPathRaw;
    });

    const totalItems = $derived(stats?.items ?? 0);
    const totalImages = $derived(stats?.images ?? 0);
    const totalVideos = $derived(stats?.videos ?? 0);
    const totalAudio = $derived(stats?.audio ?? 0);
    const totalEbook = $derived(stats?.ebook ?? 0);

    const currentSort = $derived(sort?.current ?? "date_desc");
    const mediaType = $derived(filter?.type ?? "all");

    const parentPath = $derived.by(() => {
        if (exclusiveType) return "EXIT_EXCLUSIVE"; // Special value to signal exit
        if (!folderPathRaw) return null;
        const normalized = folderPathRaw.replace(/\\/g, "/").replace(/\/+$/, "");
        if (/^[a-zA-Z]:$/.test(normalized)) return null;
        const parts = normalized.split("/");
        if (parts.length <= 1) return null;
        const parent = parts.slice(0, -1).join("\\");
        if (/^[a-zA-Z]:$/.test(parent)) return parent + "\\";
        return parent;
    });

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter") actions.onLoad();
        if (e.key === "Escape") (e.target as HTMLElement)?.blur();
    }

    let innerWidth = $state(1024);
    const isMobile = $derived(innerWidth < 640);
    
    import { onMount } from "svelte";
    onMount(() => {
        innerWidth = window.innerWidth;
        const handleResize = () => (innerWidth = window.innerWidth);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    });

    let menuOpen = $state(false);
    let menuRef = $state<HTMLElement | null>(null);

    function toggleMenu() {
        menuOpen = !menuOpen;
    }

    function handleOutsideClick(e: MouseEvent) {
        if (menuRef && !menuRef.contains(e.target as Node)) menuOpen = false;
    }

    $effect(() => {
        if (menuOpen)
            document.addEventListener("mousedown", handleOutsideClick);
        else document.removeEventListener("mousedown", handleOutsideClick);
        return () =>
            document.removeEventListener("mousedown", handleOutsideClick);
    });

    const mediaOptions: {
        value: typeof mediaType;
        label: string;
        icon: typeof Image;
        count: number;
    }[] = $derived([
        { value: "all", label: "All", icon: LayoutGrid, count: totalItems },
        { value: "images", label: "Images", icon: Image, count: totalImages },
        { value: "videos", label: "Videos", icon: Video, count: totalVideos },
        { value: "audio", label: "Audio", icon: Music, count: totalAudio },
        { value: "ebook", label: "Ebook", icon: BookOpen, count: totalEbook },
    ]);

    const sortOptions = [
        { value: "date_desc", label: "Newest" },
        { value: "date_asc", label: "Oldest" },
        { value: "name_asc", label: "A – Z" },
        { value: "name_desc", label: "Z – A" },
    ] as const;

    function selectMedia(v: typeof mediaType) {
        filter.onChange(v);
        actions.onLoad();
    }

    function selectSort(v: (typeof sortOptions)[number]["value"]) {
        sort.onChange(v);
        actions.onLoad();
    }
</script>

<div
    class="relative flex items-center w-full sm:w-3/5 mx-auto h-14 gap-2"
>
    <!-- Left buttons -->
    <div
        class="flex items-center px-1
               bg-surface-100/70 dark:bg-surface-800/70 backdrop-blur-md
               border border-surface-200/50 dark:border-surface-800/50 shadow-lg rounded-full shrink-0"
    >
        <button
            class="hidden sm:flex items-center justify-center w-10 h-10 shrink-0
                   rounded-full text-sm font-medium
                   hover:preset-tonal-surface transition-colors"
            onclick={actions.onOpenPicker}
            onmousedown={(e) => e.preventDefault()}
            title="Select folder"
        >
            <FolderOpen size={20} />
        </button>

        <button
            class="flex items-center justify-center w-10 h-10 shrink-0
                   rounded-full hover:preset-tonal-surface transition-colors
                   disabled:opacity-30"
            onclick={() => parentPath && actions.onGoUp(parentPath)}
            disabled={!parentPath || isLoading}
            onmousedown={(e) => e.preventDefault()}
            title="Up one level"
        >
            <ArrowUp size={20} strokeWidth={1.5} />
        </button>
    </div>

    <!-- Input -->
    <div
        class="flex items-center flex-1 min-w-0 h-10 px-1
               bg-surface-100/70 dark:bg-surface-800/70 backdrop-blur-md
               border border-surface-200/50 dark:border-surface-800/50 shadow-lg rounded-full"
    >
        {#if isMobile}
            <div
                class="flex-1 h-full px-3 bg-transparent
                       flex items-center
                       text-sm font-medium tracking-tight
                       overflow-x-auto whitespace-nowrap hide-scrollbar
                       text-surface-700 dark:text-surface-200
                       cursor-pointer"
                style="mask-image: linear-gradient(to right, transparent, black 15px, black calc(100% - 15px), transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 15px, black calc(100% - 15px), transparent);"
                onclick={actions.onOpenPicker}
                aria-label="Folder path"
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === 'Enter' && actions.onOpenPicker()}
            >
                {folderPathRaw || (isMobile ? "Tap to browse…" : "Enter folder path or search…")}
            </div>
        {:else}
            <input
                type="text"
                class="flex-1 h-full px-3 bg-transparent
                       border-none outline-none ring-0
                       text-sm font-medium tracking-tight
                       placeholder:opacity-40 placeholder:font-normal
                       text-surface-700 dark:text-surface-200"
                value={folderPathRaw}
                oninput={(e) =>
                    folder.onPathChange?.((e.target as HTMLInputElement).value)}
                onkeydown={handleKeydown}
                placeholder="Enter folder path or search…"
            />
        {/if}
        
        {#if exclusiveType}
            <div class="flex items-center gap-1.5 shrink-0 ml-1 mr-2 animate-in fade-in slide-in-from-right-2 duration-300">
                <div class="w-px h-4 bg-surface-500/20 mx-0.5"></div>
                <div class="flex items-center gap-1.5 py-1 px-2.5 rounded-full shadow-sm" style="background-color: color-mix(in srgb, var(--color-primary-500) 10%, transparent); border: 1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent); color: var(--color-primary-500);">
                    <LayoutGrid size={12} strokeWidth={2.5} class="opacity-70" />
                    <span class="text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                        {exclusiveType}
                    </span>
                </div>
            </div>
        {/if}
    </div>


    <!-- Right buttons -->
    <div
        class="flex items-center px-1
               bg-surface-100 dark:bg-surface-800
               border border-surface-200 dark:border-surface-800 shadow-lg rounded-full shrink-0"
    >
        <button
            class="flex items-center justify-center w-10 h-10 shrink-0
                   rounded-full hover:preset-tonal-surface transition-colors
                   disabled:opacity-30"
            onclick={actions.onLoad}
            disabled={isLoading}
            onmousedown={(e) => e.preventDefault()}
            title="Refresh"
        >
            {#if isLoading}
                <span class="spinner-third w-4 h-4 border-2"></span>
            {:else}
                <RefreshCw size={20} strokeWidth={1.5} />
            {/if}
        </button>

        <button
            type="button"
            class="flex items-center justify-center w-10 h-10 shrink-0
                   rounded-full hover:preset-tonal-surface transition-colors
                   disabled:opacity-30"
            onclick={actions.onOpenWebtoon}
            title="Webtoon view"
        >
            <ScrollText size={20} strokeWidth={1.5} />
        </button>

        <button
            type="button"
            class="flex items-center justify-center w-10 h-10 shrink-0
                   rounded-full hover:preset-tonal-surface transition-colors
                   disabled:opacity-30 {folder.isCoverMode ? 'preset-filled-primary-500' : ''}"
            onclick={actions.onToggleCoverMode}
            title="Toggle Folder Thumbnails"
        >
            <Library size={20} strokeWidth={1.5} />
        </button>

        <button
            type="button"
            class="flex items-center justify-center w-10 h-10 shrink-0
                   rounded-full hover:preset-tonal-surface transition-colors
                   disabled:opacity-30"
            onclick={() => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch((err) => {
                        console.error(`Error attempting to enable fullscreen: ${err.message}`);
                    });
                } else {
                    document.exitFullscreen();
                }
            }}
            title="Toggle Fullscreen"
        >
            <Maximize size={20} strokeWidth={1.5} />
        </button>

        {#if isFolderSelected}
            <div class="relative flex items-center" bind:this={menuRef}>
                <button
                    class="flex items-center justify-center w-10 h-10 shrink-0
                           rounded-full transition-colors
                           {menuOpen
                        ? 'preset-filled-primary-500'
                        : 'hover:preset-tonal-surface'}"
                    onclick={toggleMenu}
                    onmousedown={(e) => e.preventDefault()}
                    title="View options"
                    aria-expanded={menuOpen}
                >
                    <ChevronsRight size={20} strokeWidth={1.5} />
                </button>

                <!-- Popup -->
                {#if menuOpen}
                    <div
                        class="popup absolute right-0 top-[calc(100%+8px)]
                                w-64 p-4 space-y-4 z-[200]
                                rounded-3xl
                                bg-surface-100 dark:bg-surface-900/95 backdrop-blur-xl
                                border border-surface-200/50 dark:border-white/10
                                shadow-[0_25px_70px_-15px_rgba(0,0,0,0.5)] dark:shadow-[0_25px_70px_-15px_rgba(0,0,0,0.8)]
                                pointer-events-auto animate-in fade-in zoom-in-95 duration-200"
                    >
                        <!-- Media type -->
                        <div class="space-y-2">
                            <p class="text-[10px] font-black tracking-widest uppercase opacity-40 ml-1">
                                Media type
                            </p>
                            <div class="grid grid-cols-3 gap-2">
                                {#each mediaOptions as opt}
                                    <button
                                        class="flex flex-col items-center gap-1.5 py-2.5 px-1
                                               rounded-2xl text-xs transition-all duration-200
                                               border border-surface-200 dark:border-white/5
                                               {mediaType === opt.value
                                            ? 'preset-filled-primary-500 shadow-lg shadow-primary-500/20 scale-105 z-10'
                                            : 'hover:bg-surface-200 dark:hover:bg-white/5'}"
                                        onclick={() => selectMedia(opt.value)}
                                        disabled={opt.value !== "all" &&
                                            !isGrouped &&
                                            loadedImages.length === 0}
                                        title="{opt.label} ({opt.count})"
                                    >
                                        <opt.icon size={18} strokeWidth={1.5} />
                                        <span class="text-[9px] font-bold opacity-80">{opt.count}</span>
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <!-- Sort -->
                        <div class="space-y-2">
                            <p class="text-[10px] font-black tracking-widest uppercase opacity-40 ml-1">
                                Sort by
                            </p>
                            <div class="grid grid-cols-2 gap-2">
                                {#each sortOptions as opt}
                                    <button
                                        class="py-2 text-[10px] font-bold rounded-xl transition-all duration-200
                                               border border-surface-200 dark:border-white/5 uppercase tracking-tighter
                                               {currentSort === opt.value
                                            ? 'preset-filled-primary-500 shadow-md shadow-primary-500/10'
                                            : 'hover:bg-surface-200 dark:hover:bg-white/5'}"
                                        onclick={() => selectSort(opt.value)}
                                    >
                                        {opt.label}
                                    </button>
                                {/each}
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>

<style>
    .hide-scrollbar {
        -ms-overflow-style: none; /* IE and Edge */
        scrollbar-width: none; /* Firefox */
    }
    .hide-scrollbar::-webkit-scrollbar {
        display: none; /* Chrome, Safari and Opera */
    }
</style>
