<script lang="ts">
    import type { ComponentType } from "svelte";
    import type { Icon as LucideIcon } from "lucide-svelte";

    let {
        icon: Icon,
        rounded = "rounded-lg",
        class: className = "",
    }: {
        icon: ComponentType<LucideIcon>;
        rounded?: string;
        class?: string;
    } = $props();
</script>

<div class="absolute top-2 left-2 z-10 {className}">
    <div class="bg-black/70 p-1.5 {rounded} border border-white/10">
        <Icon class="w-4 h-4 text-white" />
    </div>
</div>
