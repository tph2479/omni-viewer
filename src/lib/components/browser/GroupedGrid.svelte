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
                            <button
                                class="relative rounded-2xl overflow-hidden transition-all duration-500 cursor-pointer group w-full min-h-[180px] flex items-center justify-center"
                                onclick={() => actions.openGroup?.(groupKey)}
                            >
                                <!-- Background Layer -->
                                <div
                                    class="absolute inset-0 bg-surface-100/50 dark:bg-surface-800/50 backdrop-blur-sm border-2 border-dashed border-primary-500/20 group-hover:border-primary-500/50 group-hover:bg-primary-500/5 transition-all duration-500 rounded-2xl"
                                ></div>

                                <!-- Content Layer -->
                                <div
                                    class="relative z-10 flex flex-col items-center justify-center p-4"
                                >
                                    <div
                                        class="bg-primary-500/10 p-4 sm:p-5 rounded-full group-hover:bg-primary-500/20 group-hover:scale-110 transition-all duration-500 shadow-sm group-hover:shadow-lg border border-primary-500/20"
                                    >
                                        <ArrowRight
                                            size={36}
                                            class="text-primary-500 group-hover:translate-x-1 transition-transform duration-500"
                                            strokeWidth={1.5}
                                        />
                                    </div>
                                    <div
                                        class="mt-3 flex flex-col items-center gap-1"
                                    >
                                        <span
                                            class="badge variant-soft-primary px-2 py-0.5 rounded-full text-[9px] font-bold opacity-60 group-hover:opacity-100 transition-opacity"
                                        >
                                            +{groupInfo.total -
                                                groupInfo.items.length} items
                                        </span>
                                    </div>
                                </div>

                                <!-- Subtle Shine Effect -->
                                <div
                                    class="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/0 to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                                ></div>
                            </button>
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
