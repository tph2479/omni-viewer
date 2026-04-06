<script lang="ts">
    import { type ImageFile } from '$lib/utils/fileUtils';
    import { ArrowLeft } from "lucide-svelte";
    import Pagination from "../ui/Pagination.svelte";
    import FileGridBase from "./FileGridBase.svelte";

    type FileActions = {
        openDir: (path: string) => void;
        openCbz: (path: string) => void;
        openModal: (index: number, items: ImageFile[]) => void;
    };

    let {
        items = $bindable([]),
        total = 0,
        isLoading = false,
        highlightedPath = null,
        pagination = {
            currentPage: 0,
            hasMore: false,
            pageSize: 42,
            onPageChange: () => {},
        },
        actions,
    }: {
        items?: ImageFile[];
        total: number;
        isLoading?: boolean;
        highlightedPath?: string | null;
        pagination?: {
            currentPage: number;
            hasMore: boolean;
            pageSize: number;
            onPageChange: (page: number) => void;
        };
        actions: FileActions;
    } = $props();

    // Determine if we should show pagination
    const showPagination = $derived(
        pagination.hasMore || pagination.currentPage > 0 || total > pagination.pageSize
    );
</script>

<div class="flex flex-col p-4">



    <div
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4"
    >
        <FileGridBase
            bind:items
            {isLoading}
            {highlightedPath}
            {actions}
        />
    </div>

    {#if showPagination}
        <Pagination
            currentPage={pagination.currentPage}
            total={total}
            pageSize={pagination.pageSize}
            {isLoading}
            onPageChange={pagination.onPageChange}
        />
    {/if}
</div>
