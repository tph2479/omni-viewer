<script lang="ts">
    import type { ImageFile } from '$lib/utils/utils';
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
    } from "lucide-svelte";

    let {
        folderPath = $bindable(),
        currentSort = $bindable(),
        mediaType = $bindable(),
        isLoading,
        isFolderSelected,
        isGrouped = false,
        loadedImages,
        totalItems,
        totalImages = 0,
        totalVideos = 0,
        totalAudio = 0,
        totalEbook = 0,
        onLoad,
        onOpenPicker,
        onOpenWebtoon,
        onGoUp,
    }: {
        folderPath: string;
        currentSort: string;
        isLoading: boolean;
        isFolderSelected: boolean;
        isGrouped?: boolean;
        loadedImages: ImageFile[];
        totalImages?: number;
        totalVideos?: number;
        totalAudio?: number;
        totalEbook?: number;
        totalItems: number;
        onLoad: () => void;
        onOpenPicker: () => void;
        onOpenWebtoon: () => void;
        onGoUp: (dir: string) => void;
        mediaType: "all" | "images" | "videos" | "audio" | "ebook";
    } = $props();

    // ── Logic giữ nguyên ─────────────────────────────────────────────
    const parentPath = $derived.by(() => {
        if (!folderPath) return null;
        const normalized = folderPath.replace(/\\/g, "/").replace(/\/+$/, "");
        if (/^[a-zA-Z]:$/.test(normalized)) return null;
        const parts = normalized.split("/");
        if (parts.length <= 1) return null;
        const parent = parts.slice(0, -1).join("\\");
        if (/^[a-zA-Z]:$/.test(parent)) return parent + "\\";
        return parent;
    });

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter") onLoad();
        if (e.key === "Escape") (e.target as HTMLElement)?.blur();
    }

    const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

    // ── Popup state ───────────────────────────────────────────────────
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

    // ── Media options ─────────────────────────────────────────────────
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
        mediaType = v;
        onLoad();
    }

    function selectSort(v: string) {
        currentSort = v;
        onLoad();
    }
</script>

<div
    class="relative flex items-center w-full max-w-4xl mx-auto h-14 gap-2"
    bind:this={menuRef}
>
    <!-- Left buttons -->
    <div
        class="flex items-center px-1
               bg-surface-100-900 dark:bg-surface-800
               border border-surface-200-800 shadow-lg rounded-full shrink-0"
    >
        <button
            class="hidden sm:flex items-center justify-center w-10 h-10 shrink-0
                   rounded-full text-sm font-medium
                   hover:preset-tonal-surface transition-colors"
            onclick={onOpenPicker}
            onmousedown={(e) => e.preventDefault()}
            title="Select folder"
        >
            <FolderOpen size={20} />
        </button>

        <button
            class="flex items-center justify-center w-10 h-10 shrink-0
                   rounded-full hover:preset-tonal-surface transition-colors
                   disabled:opacity-30"
            onclick={() => parentPath && onGoUp(parentPath)}
            disabled={!parentPath || isLoading}
            onmousedown={(e) => e.preventDefault()}
            title="Up one level"
        >
            <ArrowUp size={20} strokeWidth={2.5} />
        </button>
    </div>

    <!-- Input -->
    <div
        class="flex items-center flex-1 min-w-0 h-10 max-w-[600px]
               bg-surface-100-900 dark:bg-surface-800
               border border-surface-200-800 shadow-lg rounded-full"
    >
        <input
            type="text"
            class="w-full h-full px-4 bg-transparent
                   border-none outline-none ring-0
                   text-sm font-medium tracking-tight truncate
                   placeholder:opacity-40 placeholder:font-normal
                   text-surface-700-200"
            bind:value={folderPath}
            onkeydown={handleKeydown}
            placeholder="Tap to browse…"
            onclick={() => isMobile && onOpenPicker()}
            readonly={isMobile}
        />
    </div>

    <!-- Right buttons -->
    <div
        class="flex items-center px-1
               bg-surface-100-900 dark:bg-surface-800
               border border-surface-200-800 shadow-lg rounded-full shrink-0"
    >
        <button
            class="flex items-center justify-center w-10 h-10 shrink-0
                   rounded-full hover:preset-tonal-surface transition-colors
                   disabled:opacity-30"
            onclick={onLoad}
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
            class="flex items-center justify-center w-10 h-10 shrink-0
                   rounded-full hover:preset-tonal-surface transition-colors
                   disabled:opacity-30"
            onclick={onOpenWebtoon}
            title="Webtoon / Cover view"
        >
            <Layers size={20} />
        </button>

        {#if isFolderSelected}
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
                <ChevronsRight size={20} />
            </button>
        {/if}
    </div>

    <!-- Popup -->
    {#if isFolderSelected && menuOpen}
        <div
            class="popup absolute right-0 top-[calc(100%+6px)]
                    w-64 p-3 space-y-3
                    rounded-container
                    bg-surface-100-900 dark:bg-surface-800
                    border border-surface-200-800 shadow-xl
                    pointer-events-auto"
        >
            <!-- Media type -->
            <p class="text-[10px] font-semibold tracking-widest uppercase">
                Media type
            </p>
            <div class="grid grid-cols-3 gap-1.5">
                {#each mediaOptions as opt}
                    <button
                        class="flex flex-col items-center gap-1 py-2 px-1
                               rounded-container text-xs transition-colors
                               border border-surface-200-800
                               {mediaType === opt.value
                            ? 'preset-filled-primary-500'
                            : 'hover:preset-tonal-surface'}"
                        onclick={() => selectMedia(opt.value)}
                        disabled={opt.value !== "all" &&
                            !isGrouped &&
                            loadedImages.length === 0}
                        title="{opt.label} ({opt.count})"
                    >
                        <opt.icon size={16} />
                        <span class="leading-none">{opt.label}</span>
                        <span class="text-[10px]">{opt.count}</span>
                    </button>
                {/each}
            </div>

            <!-- Sort -->
            <p class="text-[10px] font-semibold tracking-widest uppercase">
                Sort by
            </p>
            <div class="grid grid-cols-4 gap-1">
                {#each sortOptions as opt}
                    <button
                        class="py-1.5 text-xs rounded-container transition-colors
                               border border-surface-200-800
                               {currentSort === opt.value
                            ? 'preset-filled-primary-500'
                            : 'hover:preset-tonal-surface'}"
                        onclick={() => selectSort(opt.value)}
                    >
                        {opt.label}
                    </button>
                {/each}
            </div>
        </div>
    {/if}
</div>
