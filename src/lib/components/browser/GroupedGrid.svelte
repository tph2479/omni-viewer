<script lang="ts">
    import { type ImageFile } from "$lib/utils/utils";
    import { ArrowRight } from "lucide-svelte";
    import FileGridBase from "./FileGridBase.svelte";

    type GroupInfo = { items: ImageFile[]; total: number };
    type GroupedData = Record<string, GroupInfo>;

    type FileActions = {
        openDir: (path: string) => void;
        openCbz: (path: string) => void;
        openModal: (index: number, items: ImageFile[]) => void;
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
        "cbz",
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
                        class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 sm:gap-4"
                    >
                        <FileGridBase
                            bind:items={groupedData[groupKey].items}
                            {isLoading}
                            {highlightedPath}
                            {actions}
                        />

                        {#if groupInfo && groupInfo.total > 11}
                            <div class="flex flex-col">
                                <button
                                    class="relative rounded-2xl overflow-hidden transition-colors duration-200 cursor-pointer group w-full aspect-square flex items-center justify-center bg-surface-100/50 dark:bg-surface-800/50 hover:bg-surface-200/60 dark:hover:bg-surface-700/50"
                                    onclick={() => actions.openGroup?.(groupKey)}
                                >
                                    <div
                                        class="flex flex-col items-center justify-center gap-2"
                                    >
                                        <ArrowRight
                                            size={28}
                                            class="text-surface-400 dark:text-surface-500 hover:text-[var(--color-primary-500)] transition-colors duration-200"
                                            strokeWidth={1.5}
                                        />
                                    </div>
                                </button>
                                <div class="flex flex-col items-center mt-auto pt-1">
                                    <span
                                        class="text-[10px] font-bold text-surface-400 dark:text-surface-500 group-hover:text-[var(--color-primary-500)] transition-colors duration-200 text-center px-1"
                                    >
                                        +{groupInfo.total -
                                            groupInfo.items.length} items
                                    </span>
                                </div>
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
