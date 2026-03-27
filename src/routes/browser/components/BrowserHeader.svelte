<script lang="ts">
    import GalleryToolbar from "$lib/components/GalleryToolbar.svelte";
    import { browserStore as s } from "$lib/stores/browser.svelte";
    import { Pin } from "lucide-svelte";

    $effect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (s.isPinned) return;
            s.showHeader = e.clientY < window.innerHeight * 0.1;
        };
        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    });

    $effect(() => {
        if (s.isPinned) s.showHeader = true;
    });

    function setSort(
        v:
            | "date_desc"
            | "date_asc"
            | "name_asc"
            | "name_desc"
            | "size_asc"
            | "size_desc",
    ) {
        s.currentSort = v;
    }

    function setFilter(v: "all" | "images" | "videos" | "audio" | "ebook") {
        s.mediaType = v;
    }

    const actions = $derived({
        onLoad: () => {
            const savedPage = s.folderPageHistory[s.folderPath] || 0;
            s.loadFolder(true, savedPage);
        },
        onOpenPicker: () => (s.isFolderPickerOpen = true),
        onOpenWebtoon: s.handleOpenWebtoon,
        onGoUp: async (path: string) => {
            if (s.savedCoverState && s.savedCoverState.path === path) {
                s.isCoverMode = true;
                s.coverFolders = s.savedCoverState.folders;
                s.coverFoldersTotal = s.savedCoverState.total;
                s.coverFoldersPage = s.savedCoverState.page;
                s.coverFoldersHasMore = s.savedCoverState.hasMore;
                const restoredScrollPos = s.savedCoverState.scrollPos;
                s.savedCoverState = null;
                s.folderPath = path;

                setTimeout(() => {
                    const scrollContainer =
                        document.querySelector(".drawer-content");
                    if (scrollContainer)
                        scrollContainer.scrollTo({
                            top: restoredScrollPos,
                            behavior: "instant",
                        });
                }, 0);
                return;
            }
            s.openDir(path, true);
        },
    });
</script>

<header
    class="sticky top-0 z-100 bg-surface-100 dark:bg-surface-900 px-0 py-0 shadow-md h-16 transition-transform duration-300 {s.showHeader
        ? 'translate-y-0'
        : '-translate-y-full'}"
>
    <div class="flex flex-row items-stretch min-h-full overflow-visible">
        <GalleryToolbar
            folder={{
                path: s.folderPath,
                isFolderSelected: s.isFolderSelected,
                isGrouped: s.isGrouped,
                items: s.loadedImages,
                onPathChange: (v) => (s.folderPath = v),
            }}
            stats={{
                items: s.isCoverMode ? s.coverFoldersTotal : s.totalMedia,
                images: s.isCoverMode ? 0 : s.totalImagesCount,
                videos: s.isCoverMode ? 0 : s.totalVideosCount,
                audio: s.isCoverMode ? 0 : s.totalAudioCount,
                ebook: s.isCoverMode ? 0 : s.totalEbookCount,
            }}
            sort={{ current: s.currentSort, onChange: setSort }}
            filter={{ type: s.mediaType, onChange: setFilter }}
            {actions}
            isLoading={s.isLoading}
        />
        <button
            onclick={() => (s.isPinned = !s.isPinned)}
            class="btn-icon btn-sm shrink-0 self-center mx-1"
            title={s.isPinned ? "Unpin Header" : "Pin Header (Always Show)"}
            onmousedown={(e) => e.preventDefault()}
        >
            <Pin size={20} />
        </button>
    </div>
</header>
