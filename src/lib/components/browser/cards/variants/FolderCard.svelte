<script lang="ts">
    import { Folder, BookOpen } from "lucide-svelte";
    import { browserStore } from "$lib/stores/browser/index.svelte";
    import CardThumbnail from "../parts/CardThumbnail.svelte";
    import CardIconBadge from "../parts/CardIconBadge.svelte";
    import type { MediaFile } from "$lib/stores/browser/types";

    let {
        item,
        thumbnailUrl,
        onOpenCbz,
    }: {
        item: MediaFile;
        thumbnailUrl: string;
        onOpenCbz: (targetPath: string, context: string) => void;
    } = $props();
</script>

<!-- Folder Card -->
<div
    class="absolute inset-0 flex flex-col items-center justify-center bg-surface-100 dark:bg-surface-900 dark:group-hover:bg-surface-700 transition-colors"
>
    <Folder class="w-1/3 h-1/3 text-surface-800 dark:text-surface-400" />
</div>

{#if browserStore.cover.enabled}
    <CardThumbnail src={thumbnailUrl} alt={item.name} />
    <CardIconBadge icon={Folder} rounded="rounded-xl" />

    {#if item.entryPath || item.containsImages}
        <div
            class="absolute top-2 right-2 z-40"
            onclick={(e) => {
                e.stopPropagation();
                const targetPath = item.entryPath || item.path;
                const context = item.entryPath
                    ? item.path
                    : item.path.split(/[/\\]/).slice(0, -1).join("/");
                onOpenCbz(targetPath, context);
            }}
            onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    onOpenCbz(item.entryPath || item.path, item.path);
                }
            }}
            role="button"
            tabindex="0"
        >
            <div
                class="flex items-center gap-1.5 py-1 px-2.5
                    bg-black/60 hover:bg-primary-500/80 backdrop-blur-md
                    text-white rounded-lg border border-white/20 shadow-lg
                    transition-all duration-200 scale-90 hover:scale-100 shadow-xl"
                title={item.entryPath ? "Open first CBZ" : "Open images"}
            >
                <BookOpen size={14} strokeWidth={2} />
                <span class="text-[10px] font-black uppercase tracking-wider"
                    >Open</span
                >
            </div>
        </div>
    {/if}
{/if}
