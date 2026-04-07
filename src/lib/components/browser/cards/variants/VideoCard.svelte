<script lang="ts">
    import { Play } from "lucide-svelte";
    import CardThumbnail from "../parts/CardThumbnail.svelte";
    import CardIconBadge from "../parts/CardIconBadge.svelte";
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

<!-- Video Card -->
<div class="absolute inset-0" style:background-color={highlightedBg}>
    <CardThumbnail
        src={thumbnailUrl}
        alt={item.name}
        fetchpriority={fetchPriority}
    />
</div>
<CardIconBadge icon={Play} />
