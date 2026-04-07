<script lang="ts">
    import { FileAudio } from "lucide-svelte";
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

<!-- Audio Card -->
<div class="absolute inset-0" style:background-color={highlightedBg}>
    <CardThumbnail src={thumbnailUrl} alt={item.name} fetchpriority="auto" />
</div>
<CardIconBadge icon={FileAudio} />
