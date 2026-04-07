<script lang="ts">
    import { FileArchive } from "lucide-svelte";
    import CardIconBadge from "../parts/CardIconBadge.svelte";

    let {
        highlightedBg,
    }: {
        highlightedBg?: string;
    } = $props();
</script>

<!-- Zip File Card -->
<div
    class="absolute inset-0 flex flex-col items-center justify-center bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors"
    style:background-color={highlightedBg}
>
    <FileArchive
        class="w-1/2 h-1/2 text-amber-600 opacity-20 transition-all duration-500"
    />
</div>
<CardIconBadge icon={FileArchive} />
