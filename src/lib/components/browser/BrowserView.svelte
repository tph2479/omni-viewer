<script lang="ts">
    import { browserStore as s } from "$lib/stores/browser/index.svelte";
    import NormalGrid from "./grids/NormalGrid.svelte";
    import GroupedGrid from "./grids/GroupedGrid.svelte";

    let {
        highlightedPath = null,
    }: {
        highlightedPath?: string | null;
    } = $props();

    const actions = {
        openModal: s.actions.openModal,
        openCbz: s.actions.openCbzInWebtoon,
        openDir: s.actions.openDir,
        openGroup: s.actions.handleOpenGroup,
    };
</script>

{#if s.content.isGrouped}
    <GroupedGrid
        bind:groupedData={s.content.groupedData}
        isLoading={s.ui.isLoading}
        {highlightedPath}
        {actions}
    />
{:else}
    <NormalGrid
        bind:items={s.content.items}
        total={s.content.totals.media}
        isLoading={s.ui.isLoading}
        {highlightedPath}
        pagination={{
            currentPage: s.pagination.currentPage,
            hasMore: s.pagination.hasMore,
            pageSize: s.pagination.pageSize,
            onPageChange: s.actions.loadNextPage,
        }}
        {actions}
    />
{/if}
