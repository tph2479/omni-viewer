<script lang="ts">
    import { ChevronLeft, ChevronRight } from "lucide-svelte";

    let {
        currentPage = 0,
        total = 0,
        pageSize = 42,
        isLoading = false,
        onPageChange,
    }: {
        currentPage: number;
        total: number;
        pageSize: number;
        isLoading?: boolean;
        onPageChange: (page: number) => void;
    } = $props();

    const totalPages = $derived(Math.ceil(total / pageSize));

    // Helper to generate page range with ellipses
    const pages = $derived.by(() => {
        const result: (number | "ellipsis")[] = [];
        for (let i = 0; i < totalPages; i++) {
            if (
                i === 0 || 
                i === totalPages - 1 || 
                Math.abs(i - currentPage) <= 2
            ) {
                result.push(i);
            } else if (Math.abs(i - currentPage) === 3) {
                result.push("ellipsis");
            }
        }
        return result;
    });

    const hasMore = $derived(currentPage < totalPages - 1);
</script>

{#if totalPages > 1}
    <div class="flex flex-wrap justify-center items-center gap-2 mt-6 mb-10 w-full">
        <button
            type="button"
            onclick={() => onPageChange(currentPage - 1)}
            class="btn-icon btn-icon-sm variant-soft hover:variant-filled-surface transition-colors"
            disabled={currentPage === 0 || isLoading}
            aria-label="Previous page"
        >
            <ChevronLeft size={16} strokeWidth={1.5} />
        </button>

        <div class="flex items-center gap-2 font-mono text-sm">
            {#each pages as page}
                {#if page === "ellipsis"}
                    <span class="px-1 text-surface-500 italic opacity-50">...</span>
                {:else}
                    <button
                        type="button"
                        onclick={() => onPageChange(page)}
                        class="btn btn-sm transition-all duration-300 font-bold
                        {currentPage === page
                            ? 'variant-filled-primary ring-1 ring-primary-500 ring-offset-surface-50 dark:ring-offset-surface-900 scale-110 z-10'
                            : 'variant-soft-surface text-surface-900 dark:text-surface-50 border border-surface-200 dark:border-surface-700 hover:border-surface-400 dark:hover:border-surface-500'}"
                        disabled={isLoading}
                    >
                        {page + 1}
                    </button>
                {/if}
            {/each}
        </div>

        <button
            type="button"
            onclick={() => onPageChange(currentPage + 1)}
            class="btn-icon btn-icon-sm variant-soft hover:variant-filled-surface transition-colors"
            disabled={!hasMore || isLoading}
            aria-label="Next page"
        >
            <ChevronRight size={16} strokeWidth={1.5} />
        </button>
    </div>
{/if}
