<script lang="ts">
    import { type MediaFile } from '$lib/client/stores/browser/types';
    import { ArrowRight } from "lucide-svelte";
    import FileGridBase from "./FileGridBase.svelte";

    type GroupInfo = { items: MediaFile[]; total: number };
    type GroupedData = Record<string, GroupInfo>;

    type FileActions = {
        openDir: (path: string) => void;
        openArchive: (path: string) => void;
        openModal: (index: number, items: MediaFile[]) => void;
        openGroup?: (type: string) => void;
    };

    let {
        groupedData = $bindable(null),
        isLoading = false,
        highlightedPath = null,
        actions,
    }: {
        groupedData?: GroupedData | null;
        isLoading?: boolean;
        highlightedPath?: string | null;
        actions: FileActions;
    } = $props();

    const groups = [
        "folders",
        "images",
        "archives",
        "pdf",
        "epub",
        "audio",
        "videos",
    ];
</script>

{#if groupedData}
    <div class="flex flex-col gap-8 p-4">
        {#each groups as groupKey}
            {#if groupedData[groupKey] && (groupedData[groupKey].items.length > 0 || isLoading)}
                {@const groupInfo = groupedData[groupKey]}
                <div class="flex flex-col gap-2">
                    <div
                        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4"
                    >
                        <FileGridBase
                            bind:items={groupedData[groupKey].items}
                            {isLoading}
                            {highlightedPath}
                            {actions}
                        />

                        {#if groupInfo && groupInfo.total > groupInfo.items.length}
                            <div class="flex flex-col">
                                 <button
                                     class="relative rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer group w-full aspect-square flex flex-col items-center justify-center
									bg-surface-100/50 dark:bg-surface-800/50
									border border-surface-200 dark:border-surface-700
									hover:bg-surface-200/50 dark:hover:bg-surface-700/50"
                                     onclick={() => actions.openGroup?.(groupKey)}
                                 >
                                    <div class="relative z-10 flex flex-col items-center justify-center gap-2 transition-transform duration-200 group-hover:scale-105">
                                        <div class="size-11 rounded-full flex items-center justify-center
											bg-surface-200 dark:bg-surface-700
											group-hover:bg-primary-500 group-hover:text-white
											transition-all duration-200">
                                            <ArrowRight size={24} />
                                        </div>
                                        <div class="flex flex-col items-center">
                                             <span class="text-[10px] font-black uppercase tracking-widest text-surface-500 dark:text-surface-400 group-hover:text-primary-500 transition-colors">View All</span>
                                             <span class="text-[11px] font-bold text-surface-400 dark:text-surface-500">+{groupInfo.total - groupInfo.items.length} items</span>
                                        </div>
                                    </div>
                                </button>
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        {/each}
    </div>
{:else if isLoading}
    <div class="p-4">
        <FileGridBase items={[]} {isLoading} {actions} />
    </div>
{/if}
