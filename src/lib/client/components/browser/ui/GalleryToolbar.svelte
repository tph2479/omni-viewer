<script lang="ts">
    import type { MediaFile, FilterType } from "$lib/client/stores/browser/types";
    import {
        ArrowUp,
        BookOpen,
        ChevronsRight,
        FolderOpen,
        Image,
        LayoutGrid,
        Library,
        Maximize,
        Music,
        RefreshCw,
        ScrollText,
        Video,
    } from "lucide-svelte";

    type FolderState = {
        path: string;
        isFolderSelected: boolean;
        isGrouped: boolean;
        isCoverMode?: boolean;
        exclusiveType?: string | null;
        items: MediaFile[];
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
        type: FilterType;
        onChange: (v: FilterType) => void;
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
        const normalized = folderPathRaw
            .replace(/\\/g, "/")
            .replace(/\/+$/, "");
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

    function selectMedia(v: FilterType) {
        filter.onChange(v);
        actions.onLoad();
    }

    function selectSort(v: (typeof sortOptions)[number]["value"]) {
        sort.onChange(v);
        actions.onLoad();
    }
</script>

<div class="relative flex items-center w-full sm:w-3/5 mx-auto h-14 gap-2">
    <!-- Left buttons -->
    <div
        class="island shrink-0 premium-shadow
               bg-surface-100/60 dark:bg-surface-900/60 backdrop-blur-xl
               border border-surface-200/50 dark:border-white/10 rounded-xl"
    >
        <button
            class="island-button hidden sm:flex items-center justify-center w-10 shrink-0
                   rounded-xl text-sm font-medium
                   text-surface-600 dark:text-surface-400 hover:text-primary-500 dark:hover:text-primary-400 
                   hover:bg-primary-500/15 transition-colors duration-150"
            onclick={actions.onOpenPicker}
            onmousedown={(e) => e.preventDefault()}
            title="Select folder"
        >
            <FolderOpen size={20} />
        </button>

        <button
            type="button"
            class="island-button flex items-center justify-center w-10 shrink-0
                   rounded-xl text-surface-600 dark:text-surface-400 hover:text-primary-500 dark:hover:text-primary-400 
                   hover:bg-primary-500/15 transition-colors duration-150
                   disabled:opacity-30"
            onclick={() => parentPath && actions.onGoUp(parentPath)}
            disabled={!parentPath || isLoading}
            onmousedown={(e) => e.preventDefault()}
            title="Up one level"
        >
            <ArrowUp size={20} />
        </button>
    </div>

    <!-- Input -->
    <div
        class="island flex-1 min-w-0 premium-shadow
               bg-surface-100/60 dark:bg-surface-900/60 backdrop-blur-xl
               border border-surface-200/50 dark:border-white/10 rounded-xl focus-within:ring-2 focus-within:ring-primary-500/30"
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
                onkeydown={(e) => e.key === "Enter" && actions.onOpenPicker()}
            >
                {folderPathRaw ||
                    (isMobile
                        ? "Tap to browse…"
                        : "Enter folder path or search…")}
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
            <div class="flex items-center gap-1.5 shrink-0 ml-1 mr-2 h-full">
                <div class="w-px bg-surface-500/20 mx-0.5 h-3/5"></div>
                <div
                    class="flex items-center py-1 px-2.5 rounded-xl border border-primary-500/30"
                    style="background-color: color-mix(in srgb, var(--color-primary-500) 15%, transparent); color: var(--color-primary-400);"
                >
                    <span
                        class="text-[10px] font-black uppercase tracking-wider whitespace-nowrap"
                    >
                        {exclusiveType}
                    </span>
                </div>
            </div>
        {/if}
    </div>

    <!-- Right buttons -->
    <div
        class="island shrink-0 premium-shadow
               bg-surface-100/60 dark:bg-surface-900/60 backdrop-blur-xl
               border border-surface-200/50 dark:border-white/10 rounded-xl"
    >
        <button
            class="island-button flex items-center justify-center w-10 shrink-0
                   rounded-xl text-surface-600 dark:text-surface-400 hover:text-primary-500 dark:hover:text-primary-400 
                   hover:bg-primary-500/15 transition-colors duration-150
                   disabled:opacity-30"
            onclick={actions.onLoad}
            disabled={isLoading}
            onmousedown={(e) => e.preventDefault()}
            title="Refresh"
        >
            {#if isLoading}
                <span class="spinner-third w-4 h-4 border-2"></span>
            {:else}
                <RefreshCw size={20} />
            {/if}
        </button>

        <button
            type="button"
            class="island-button flex items-center justify-center w-10 shrink-0
                   rounded-xl text-surface-600 dark:text-surface-400 hover:text-primary-500 dark:hover:text-primary-400 
                   hover:bg-primary-500/15 transition-colors duration-150
                   disabled:opacity-30"
            onclick={actions.onOpenWebtoon}
            title="Webtoon view"
        >
            <ScrollText size={20} />
        </button>

        <button
            type="button"
            class="island-button flex items-center justify-center w-10 shrink-0
                   rounded-xl transition-colors duration-150
                   disabled:opacity-30 
                   {folder.isCoverMode
                ? 'bg-primary-500/25 text-primary-600 dark:text-primary-400 ring-1 ring-primary-500/50 shadow-lg shadow-primary-500/20'
                : 'text-surface-600 dark:text-surface-400 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-primary-500/15'}"
            onclick={actions.onToggleCoverMode}
            title="Toggle Folder Thumbnails"
        >
            <Library size={20} />
        </button>

        <button
            type="button"
            class="island-button flex items-center justify-center w-10 shrink-0
                   rounded-xl text-surface-600 dark:text-surface-400 hover:text-primary-500 dark:hover:text-primary-400 
                   hover:bg-primary-500/15 transition-colors duration-150
                   disabled:opacity-30"
            onclick={() => {
                if (!document.fullscreenElement) {
                    document.documentElement
                        .requestFullscreen()
                        .catch((err) => {
                            console.error(
                                `Error attempting to enable fullscreen: ${err.message}`,
                            );
                        });
                } else {
                    document.exitFullscreen();
                }
            }}
            title="Toggle Fullscreen"
        >
            <Maximize size={20} />
        </button>

        {#if isFolderSelected}
            <div class="relative flex items-center h-full" bind:this={menuRef}>
                <button
                    class="island-button flex items-center justify-center w-10 shrink-0
                           rounded-xl transition-colors duration-150
                           {menuOpen
                        ? 'bg-primary-500/25 text-primary-600 dark:text-primary-400 ring-1 ring-primary-500/50 shadow-lg shadow-primary-500/20'
                        : 'text-surface-600 dark:text-surface-400 hover:bg-primary-500/15 hover:text-primary-500 dark:hover:text-primary-400'}"
                    onclick={(e) => { e.stopPropagation(); menuOpen = !menuOpen; }}
                    title="View options"
                    aria-expanded={menuOpen}
                >
                    <ChevronsRight size={20} />
                </button>

                <!-- Popup -->
                {#if menuOpen}
                    <div
                        class="popup absolute right-0 top-[calc(100%+8px)]
                                w-64 p-4 space-y-4 z-[200]
                                rounded-xl premium-shadow-popup
                                bg-surface-50 dark:bg-surface-900/98 backdrop-blur-2xl
                                border border-surface-200/50 dark:border-surface-800/50
                                pointer-events-auto"
                    >
                        <!-- Media type -->
                        <div class="space-y-2">
                            <p
                                class="text-[10px] font-black tracking-widest uppercase ml-1"
                            >
                                Media type
                            </p>
                            <div class="grid grid-cols-3 gap-3">
                                {#each mediaOptions as opt}
                                    <button
                                        class="flex flex-col items-center gap-1.5 py-2.5 px-1
                                               rounded-xl text-xs transition-colors duration-200
                                               border border-surface-200/50 dark:border-white/5
                                               {mediaType === opt.value
                                            ? 'bg-primary-500/25 text-primary-600 dark:text-primary-400 ring-1 ring-primary-500/50 shadow-md shadow-primary-500/10 scale-105 z-10'
                                            : 'bg-surface-100/50 dark:bg-white/5 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-white/10 hover:text-primary-500 dark:hover:text-primary-400'}"
                                        onclick={() => selectMedia(opt.value)}
                                        disabled={opt.value !== "all" &&
                                            !isGrouped &&
                                            loadedImages.length === 0}
                                        title="{opt.label} ({opt.count})"
                                    >
                                        <opt.icon size={18} />
                                        <span
                                            class="text-[9px] font-bold"
                                            >{opt.count}</span
                                        >
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <!-- Sort -->
                        <div class="space-y-2">
                            <p
                                class="text-[10px] font-black tracking-widest uppercase ml-1"
                            >
                                Sort by
                            </p>
                            <div class="grid grid-cols-2 gap-2">
                                {#each sortOptions as opt}
                                    <button
                                        class="py-2 text-[10px] font-bold rounded-xl transition-colors duration-200
                                               border border-surface-200/50 dark:border-white/5 uppercase tracking-tighter
                                               {currentSort === opt.value
                                            ? 'bg-primary-500/25 text-primary-600 dark:text-primary-400 ring-1 ring-primary-500/50 shadow-md shadow-primary-500/10'
                                            : 'bg-surface-100/50 dark:bg-white/5 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-white/10 hover:text-primary-500 dark:hover:text-primary-400'}"
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
    .island {
        height: 40px !important;
        box-sizing: border-box !important;
        /* overflow: hidden !important; */
        display: flex !important;
        align-items: stretch !important;
    }
    .island-button {
        height: 100% !important;
        transform: none !important;
        transition: background-color 0.15s ease, color 0.15s ease !important;
    }
    .hide-scrollbar {
        -ms-overflow-style: none; /* IE and Edge */
        scrollbar-width: none; /* Firefox */
    }
    .hide-scrollbar::-webkit-scrollbar {
        display: none; /* Chrome, Safari and Opera */
    }

    .premium-shadow {
        box-shadow: 
            0 0 0 1px rgba(0,0,0,0.05),
            0 0 10px rgba(0,0,0,0.05),
            0 0 25px rgba(0,0,0,0.03) !important;
    }
    :global([data-mode="dark"]) .premium-shadow {
        box-shadow: 
            0 0 0 1px rgba(255,255,255,0.08),
            0 0 15px rgba(0,0,0,0.5),
            0 0 40px rgba(0,0,0,0.6) !important;
    }
    .premium-shadow-popup {
        box-shadow: 
            0 0 0 1px rgba(0,0,0,0.1),
            0 0 20px rgba(0,0,0,0.1),
            0 0 50px rgba(0,0,0,0.1) !important;
    }
    :global([data-mode="dark"]) .premium-shadow-popup {
        box-shadow: 
            0 0 0 1px rgba(255,255,255,0.12),
            0 0 30px rgba(0,0,0,0.6),
            0 0 80px rgba(0,0,0,0.8) !important;
    }
</style>
