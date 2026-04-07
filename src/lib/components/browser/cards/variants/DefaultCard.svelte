<script lang="ts">
    import CardThumbnail from "../parts/CardThumbnail.svelte";
    import type { MediaFile } from "$lib/stores/browser/types";

    let {
        item,
        thumbnailUrl,
        fetchPriority,
        highlightedBg,
    }: {
        item: MediaFile;
        thumbnailUrl: string;
        fetchPriority: "high" | "auto";
        highlightedBg?: string;
    } = $props();
</script>

<!-- Default/Image Card -->
<div class="absolute inset-0" style:background-color={highlightedBg}>
    <CardThumbnail
        src={thumbnailUrl}
        alt={item.name}
        fetchpriority={fetchPriority}
    />
</div>
