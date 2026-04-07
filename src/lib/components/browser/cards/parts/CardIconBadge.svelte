<script lang="ts">
    import type { ComponentType } from "svelte";
    import type { Icon } from "lucide-svelte";

    let {
        icon,
        rounded = "rounded-lg",
        class: className = "",
    }: {
        icon: ComponentType<Icon>;
        rounded?: string;
        class?: string;
    } = $props();
</script>

<div class="absolute top-2 left-2 z-10 {className}">
    <div class="bg-black/60 p-1.5 {rounded} border border-white/20 shadow-lg">
        <svelte:component this={icon} class="w-4 h-4 text-white" />
    </div>
</div>
