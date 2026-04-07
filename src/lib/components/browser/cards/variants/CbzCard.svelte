<script lang="ts">
    import { FileArchive } from "lucide-svelte";
    import CardThumbnail from "../parts/CardThumbnail.svelte";
    import CardIconBadge from "../parts/CardIconBadge.svelte";
    import CardFallbackIcon from "../parts/CardFallbackIcon.svelte";
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

<!-- CBZ Cover Card -->
<CardThumbnail
    src={thumbnailUrl}
    alt={item.name}
    fetchpriority={fetchPriority}
/>
<CardIconBadge icon={FileArchive} />
<CardFallbackIcon icon={FileArchive} backgroundColor={highlightedBg} />
