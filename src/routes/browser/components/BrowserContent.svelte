<script lang="ts">
    import EmptyState from "$lib/components/EmptyState.svelte";
    import GalleryGrid from "$lib/components/GalleryGrid.svelte";
    import { browserStore as s } from "$lib/stores/browser.svelte";

    let wasModalOpen = $state(false);

    const gridProps = $derived({
        items: s.content.items,
        isGrouped: s.content.isGrouped,
        groupedData: s.content.groupedData,
        isLoading: s.ui.loading,
        highlightedPath: s.ui.highlightedPath,
        pagination: {
            currentPage: s.pagination.page,
            hasMore: s.pagination.hasMore,
            pageSize: s.pagination.size,
            total: s.content.totals.media,
            onPageChange: s.pagination.loadNext,
        },
        coverMode: {
            enabled: s.cover.enabled,
            folders: s.cover.folders,
            total: s.cover.total,
            page: s.cover.page,
            hasMore: s.cover.hasMore,
            onFolderClick: s.cover.handleClick,
            onExit: s.cover.exit,
            onPageChange: s.cover.loadPage,
        },
        exclusiveMode: {
            type: s.ui.exclusiveType,
            total: s.content.totals.media,
            onExit: s.ui.exitGroupView,
        },
        actions: {
            openModal: s.modal.open,
            openCbz: s.modal.openCbz,
            openDir: s.folder.open,
            openGroup: s.ui.openGroup,
        },
    });

    $effect(() => {
        const isAnyModalOpen =
            s.modal.image.open ||
            s.modal.video.open ||
            s.modal.webtoon.open ||
            s.modal.audio.open ||
            s.modal.pdf.open;
        if (wasModalOpen && !isAnyModalOpen && s.ui.lastFile) {
            s.ui.highlightedPath = s.ui.lastFile;
            s.ui.lastFile = null;
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

    {#if !s.folder.isSelected && !s.ui.loading && !s.ui.error}
        <EmptyState onOpenPicker={() => (s.modal.picker.open = true)} />
    {:else if s.folder.isSelected}
        <GalleryGrid {...gridProps} />
    {/if}
</div>
