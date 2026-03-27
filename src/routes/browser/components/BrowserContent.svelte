<script lang="ts">
    import EmptyState from "$lib/components/EmptyState.svelte";
    import GalleryGrid from "$lib/components/GalleryGrid.svelte";
    import { browserStore as s } from "$lib/stores/browser.svelte";
    import { BadgeAlert } from "lucide-svelte";

    let wasModalOpen = $state(false);

    const gridProps = $derived({
        items: s.loadedImages,
        isGrouped: s.isGrouped,
        groupedData: s.groupedData,
        isLoading: s.isLoading,
        highlightedPath: s.highlightedPath,
        pagination: {
            currentPage: s.currentPage,
            hasMore: s.hasMore,
            pageSize: s.PAGE_SIZE,
            total: s.totalMedia,
            onPageChange: s.loadNextPage,
        },
        coverMode: {
            enabled: s.isCoverMode,
            folders: s.coverFolders,
            total: s.coverFoldersTotal,
            page: s.coverFoldersPage,
            hasMore: s.coverFoldersHasMore,
            onFolderClick: s.handleCoverFolderClick,
            onExit: s.exitCoverMode,
            onPageChange: s.loadCoverPage,
        },
        exclusiveMode: {
            type: s.currentExclusiveType,
            total: s.totalMedia,
            onExit: s.handleExitGroupView,
        },
        actions: {
            openModal: s.openModal,
            openCbz: s.openCbzInWebtoon,
            openDir: s.openDir,
            openGroup: s.handleOpenGroup,
        },
    });

    $effect(() => {
        const isAnyModalOpen =
            s.isImageModalOpen ||
            s.isVideoModalOpen ||
            s.isWebtoonMode ||
            s.isAudioModalOpen ||
            s.isPdfReaderOpen;
        if (wasModalOpen && !isAnyModalOpen && s.lastOpenedFile) {
            s.highlightedPath = s.lastOpenedFile;
            s.lastOpenedFile = null;
            setTimeout(() => {
                const el = document.getElementById(
                    `item-${s.highlightedPath?.replace(/[^a-zA-Z0-9]/g, "-")}`,
                );
                if (el)
                    el.scrollIntoView({ behavior: "instant", block: "center" });
            }, 0);
            setTimeout(() => {
                s.highlightedPath = null;
            }, 2500);
        }
        wasModalOpen = isAnyModalOpen;
    });
</script>

<div class="flex-1 flex flex-col">
    {#if s.errorMsg}
        <aside
            class="flex items-center gap-3 preset-filled-error-500 text-xs py-2 px-4 mb-6 rounded-xl w-full"
        >
            <BadgeAlert size={18} class="shrink-0" />
            <span class="font-bold tracking-tight uppercase">{s.errorMsg}</span>
        </aside>
    {/if}

    {#if !s.isFolderSelected && !s.isLoading && !s.errorMsg}
        <EmptyState onOpenPicker={() => (s.isFolderPickerOpen = true)} />
    {:else if s.isFolderSelected}
        <GalleryGrid {...gridProps} />
    {/if}
</div>
