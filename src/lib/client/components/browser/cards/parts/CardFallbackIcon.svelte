<script lang="ts">
    import type { ComponentType } from "svelte";
    import type { Icon as LucideIcon } from "lucide-svelte";

    let {
        icon: Icon,
        backgroundColor,
        iconColor = "text-amber-500",
        bgBase = "bg-amber-500/10",
        bgHover = "transition-colors",
        class: className = "",
    }: {
        icon: ComponentType<LucideIcon>;
        backgroundColor?: string;
        iconColor?: string;
        bgBase?: string;
        bgHover?: string;
        class?: string;
    } = $props();
</script>

<div
    class="hidden absolute inset-0 w-full h-full flex-col items-center justify-center {bgBase} {bgHover} {className}"
    style:background-color={backgroundColor}
>
    <Icon class="w-1/2 h-1/2 {iconColor} opacity-50" />
</div>
