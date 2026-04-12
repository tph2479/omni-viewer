<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";

    let { src, alt = "", class: className = "", delay = 0 } = $props();

    let isVisible = $state(false);
    let isLoaded = $state(false);
    let container: HTMLDivElement | null = $state(null);
    let shouldLoad = $state(false);

    onMount(() => {
        if (!container) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    // Once visible, wait for the optional delay, then trigger loading
                    setTimeout(() => {
                        shouldLoad = true;
                    }, delay);
                    observer.disconnect();
                }
            },
            { rootMargin: "200px" } // Load a bit before it enters the viewport
        );

        observer.observe(container);
        return () => observer.disconnect();
    });
</script>

<div bind:this={container} class="relative overflow-hidden {className}">
    {#if shouldLoad}
        <img
            {src}
            {alt}
            class="w-full h-full object-cover transition-opacity duration-500 {isLoaded ? 'opacity-100' : 'opacity-0'}"
            onload={() => (isLoaded = true)}
            loading="lazy"
        />
        {#if !isLoaded}
            <div class="absolute inset-0 bg-surface-100 dark:bg-surface-800 animate-pulse"></div>
        {/if}
    {:else}
        <div class="absolute inset-0 bg-surface-100 dark:bg-surface-800"></div>
    {/if}
</div>
