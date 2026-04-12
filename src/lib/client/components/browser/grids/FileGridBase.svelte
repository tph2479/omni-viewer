<script lang="ts">
    import { type MediaFile } from '$lib/client/stores/browser/types';
    import FileCard from "../cards/FileCard.svelte";
    import { FolderOpen } from "lucide-svelte";

    type FileActions = {
        openDir: (path: string) => void;
        openArchive: (path: string) => void;
        openModal: (index: number, items: MediaFile[]) => void;
    };

    let {
        items = $bindable([]),
        isLoading = false,
        highlightedPath = null,
        actions,
    }: {
        items?: MediaFile[];
        isLoading?: boolean;
        highlightedPath?: string | null;
        actions: FileActions;
    } = $props();
</script>

{#if items.length === 0}
    {#if isLoading}
        {#each Array.from({ length: 12 }) as _}
            <div class="flex flex-col gap-2 animate-pulse">
                <div
                    class="aspect-square bg-surface-200 dark:bg-surface-800 rounded-2xl w-full"
                ></div>
                <div
                    class="h-3 bg-surface-200 dark:bg-surface-800 rounded-full w-2/3 mx-auto"
                ></div>
            </div>
        {/each}
    {:else}
        <div
            class="col-span-full flex flex-col items-center justify-center opacity-60 bg-surface-200/30 dark:bg-surface-800/30 p-10 text-center min-h-75"
        >
            <FolderOpen size={56} strokeWidth={1} class="mb-4 opacity-20" />
            <p
                class="text-base font-black uppercase tracking-tight mb-2 text-surface-900 dark:text-surface-100"
            >
                No files found
            </p>
            <p
                class="text-[11px] font-bold uppercase tracking-widest opacity-50 mb-4"
            >
                This directory contains no supported media
            </p>
            <div class="flex flex-wrap justify-center gap-1.5 max-w-sm">
                {#each ["JPG", "PNG", "WEBP", "AVIF", "GIF", "BMP", "HEIC"] as fmt}
                    <span
                        class="badge badge-sm font-black opacity-60 border"
                        style="background-color: color-mix(in srgb, var(--color-success-500) 10%, transparent); color: var(--color-success-500); border-color: color-mix(in srgb, var(--color-success-500) 20%, transparent);"
                        >{fmt}</span
                    >
                {/each}
                {#each ["MP4", "WEBM", "MKV", "AVI", "MOV", "FLV", "M4V"] as fmt}
                    <span
                        class="badge badge-sm font-black opacity-60 border"
                        style="background-color: color-mix(in srgb, var(--color-secondary-500) 10%, transparent); color: var(--color-secondary-500); border-color: color-mix(in srgb, var(--color-secondary-500) 20%, transparent);"
                        >{fmt}</span
                    >
                {/each}
                {#each ["MP3", "WAV", "FLAC", "OGG", "M4A", "AAC", "OPUS"] as fmt}
                    <span
                        class="badge badge-sm font-black opacity-60 border"
                        style="background-color: color-mix(in srgb, var(--color-warning-500) 10%, transparent); color: var(--color-warning-500); border-color: color-mix(in srgb, var(--color-warning-500) 20%, transparent);"
                        >{fmt}</span
                    >
                {/each}
                {#each ["CBZ", "PDF", "EPUB"] as fmt}
                    <span
                        class="badge badge-sm font-black opacity-60 border"
                        style="background-color: color-mix(in srgb, var(--color-error-500) 10%, transparent); color: var(--color-error-500); border-color: color-mix(in srgb, var(--color-error-500) 20%, transparent);"
                        >{fmt}</span
                    >
                {/each}
            </div>
        </div>
    {/if}
{:else}
    {#each items as _, i}
        <FileCard
            bind:item={items[i]}
            index={i}
            highlighted={highlightedPath === items[i].path}
            actions={{
                openDir: actions.openDir,
                openArchive: actions.openArchive,
                openModal: (idx) => actions.openModal(idx, items),
            }}
        />
    {/each}
{/if}

