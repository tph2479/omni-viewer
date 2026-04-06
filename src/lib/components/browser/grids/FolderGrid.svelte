<script lang="ts">
    import { Folder, ArrowLeft, Library } from "lucide-svelte";
    import { cacheVersion } from "$lib/stores/system/cache.svelte";
    import { lazyThumbnail } from "$lib/actions/lazyThumbnail";
    import Pagination from "../ui/Pagination.svelte";

    type CoverFolder = { name: string; path: string; coverPath: string };

    let {
        folders = [],
        total = 0,
        page = 0,
        pageSize = 42,
        isLoading = false,
        onFolderClick,
        onExit,
        onPageChange,
    }: {
        folders: CoverFolder[];
        total: number;
        page: number;
        pageSize?: number;
        isLoading?: boolean;
        onFolderClick: (path: string) => void;
        onExit: () => void;
        onPageChange: (page: number) => void;
    } = $props();
</script>


<div
    class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 sm:gap-4 pb-10"
>
    {#each folders as folder}
        <div class="group flex flex-col">
            <button
                class="relative aspect-square bg-surface-50 dark:bg-surface-900 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:ring-2 hover:ring-primary-500/50 transition-all duration-300 cursor-pointer border-2 border-primary-500/20 hover:border-primary-500/40 w-full"
                onclick={() => onFolderClick(folder.path)}
            >
                <img
                    use:lazyThumbnail={`/api/media?path=${encodeURIComponent(folder.coverPath)}&thumbnail=true&v=${cacheVersion.value}`}
                    decoding="async"
                    alt={folder.name}
                    class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />
                <div class="absolute top-2 left-2 z-10">
                    <div class="bg-black/60 backdrop-blur-md p-1.5 rounded-lg border border-white/20 shadow-lg">
                        <Library size={16} strokeWidth={1.5} class="text-white" />
                    </div>
                </div>
                <div
                    class="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-t from-black/60 to-transparent"
                ></div>
            </button>
            <div class="flex flex-col items-center mt-auto pt-2">
                <p
                    class="text-[11px] sm:text-[13px] font-black truncate text-center px-2 text-surface-700 dark:text-surface-200 group-hover:text-primary-500 transition-colors duration-300 w-full"
                    title={folder.name}
                >
                    {folder.name}
                </p>
            </div>
        </div>
    {/each}
</div>

<Pagination
    currentPage={page}
    total={total}
    {pageSize}
    {isLoading}
    {onPageChange}
/>
