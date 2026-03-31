<script lang="ts">
    import EmptyState from "$lib/components/EmptyState.svelte";
    import GalleryGrid from "$lib/components/GalleryGrid.svelte";
    import { browserStore as s } from "$lib/stores/browser.svelte";

    let wasModalOpen = $state(false);

    const gridProps = $derived({
        items: s.content.items,
        isGrouped: s.content.isGrouped,
        groupedData: s.content.groupedData,
        isLoading: s.ui.isLoading,
        highlightedPath: s.ui.highlightedPath,
        pagination: {
            currentPage: s.pagination.currentPage,
            hasMore: s.pagination.hasMore,
            pageSize: s.pagination.pageSize,
            total: s.content.totals.media,
            onPageChange: s.actions.loadNextPage,
        },
        coverMode: {
            enabled: s.cover.enabled,
            folders: s.cover.folders,
            total: s.cover.total,
            page: s.cover.page,
            hasMore: s.cover.hasMore,
            onFolderClick: s.actions.handleCoverFolderClick,
            onExit: s.actions.exitCoverMode,
            onPageChange: s.actions.loadCoverPage,
        },
        exclusiveMode: {
            type: s.ui.exclusiveType,
            total: s.content.totals.media,
            onExit: s.actions.handleExitGroupView,
        },
        actions: {
            openModal: s.actions.openModal,
            openCbz: s.actions.openCbzInWebtoon,
            openDir: s.actions.openDir,
            openGroup: s.actions.handleOpenGroup,
        },
    });

    $effect(() => {
        const isAnyModalOpen =
            s.modal.image.open ||
            s.modal.video.open ||
            s.modal.webtoon.open ||
            s.modal.audio.open ||
            s.modal.pdf.open;
        if (wasModalOpen && !isAnyModalOpen && s.ui.lastOpenedFile) {
            s.ui.highlightedPath = s.ui.lastOpenedFile;
            s.ui.lastOpenedFile = null;
            setTimeout(() => {
                const el = document.getElementById(
                    `item-${s.ui.highlightedPath?.replace(/[^a-zA-Z0-9]/g, "-")}`,
                );
                if (el)
                    el.scrollIntoView({ behavior: "instant", block: "center" });
            }, 0);
            setTimeout(() => {
                s.ui.highlightedPath = null;
            }, 2500);
        }
        wasModalOpen = isAnyModalOpen;
    });
</script>

<div class="flex-1 flex flex-col">
    {#if s.ui.error}
        <aside
            class="flex items-center gap-3 preset-filled-error-500 text-xs py-2 px-4 mb-6 rounded-xl w-full"
        >
            <span class="font-bold tracking-tight uppercase">{s.ui.error}</span>
        </aside>
    {/if}

    {#if !s.folder.isSelected && !s.ui.isLoading && !s.ui.error}
        <EmptyState onOpenPicker={() => (s.modal.folderPicker.open = true)} />
    {:else if s.folder.isSelected}
        <GalleryGrid
            bind:items={s.content.items}
            bind:groupedData={s.content.groupedData}
            {...gridProps}
        />
    {/if}
</div>
