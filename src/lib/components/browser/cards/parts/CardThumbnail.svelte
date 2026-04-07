<script lang="ts">
    import { lazyThumbnail } from "$lib/actions/lazyThumbnail";

    let {
        src,
        alt,
        fetchpriority = "auto",
        class: className = "",
    }: {
        src: string;
        alt: string;
        fetchpriority?: "high" | "auto";
        class?: string;
    } = $props();
</script>

<img
    use:lazyThumbnail={src}
    decoding="async"
    {fetchpriority}
    {alt}
    class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out {className}"
/>
