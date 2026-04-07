<script lang="ts">
    import { BookOpen } from "lucide-svelte";
    import CardThumbnail from "../parts/CardThumbnail.svelte";
    import CardIconBadge from "../parts/CardIconBadge.svelte";
    import type { MediaFile } from "$lib/stores/browser/types";

    let {
        item,
        thumbnailUrl,
        highlightedBg,
    }: {
        item: MediaFile;
        thumbnailUrl: string;
        highlightedBg?: string;
    } = $props();
</script>

<!-- EPUB Card -->
<div
    class="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/5 transition-colors group-hover:bg-emerald-500/10"
    style:background-color={highlightedBg}
>
    <BookOpen
        class="w-1/3 h-1/3 text-emerald-600 opacity-20 transition-all duration-500"
    />
</div>
<CardThumbnail
    src={thumbnailUrl}
    alt={item.name}
    fetchpriority="auto"
    class="z-10"
/>
<CardIconBadge icon={BookOpen} />
