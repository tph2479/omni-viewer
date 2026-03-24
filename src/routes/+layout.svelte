<script lang="ts">
    import "../app.css";
    import { page } from "$app/stores";
    import {
        BookIcon,
        HouseIcon,
        FolderTree,
        HardDriveDownload,
        SettingsIcon,
        SunMoon,
    } from "lucide-svelte";
    import { Navigation, Portal, Tooltip } from "@skeletonlabs/skeleton-svelte";
    import type { Snippet } from "svelte";
    import { fade } from "svelte/transition";

    const { children }: { children: Snippet } = $props();

    const links = [
        { label: "Home", href: "/", icon: HouseIcon },
        { label: "Gallery", href: "/gallery", icon: BookIcon },
        { label: "File Browser", href: "/browser", icon: FolderTree },
        { label: "Import", href: "/import", icon: HardDriveDownload },
    ];

    const bottom_links = [
        { label: "Setting", href: "/settings", icon: SettingsIcon },
    ];

    let isMobile = $state(false);

    $effect(() => {
        const mediaQuery = window.matchMedia("(max-width: 768px)");
        isMobile = mediaQuery.matches;
        const handler = (e: MediaQueryListEvent) => {
            isMobile = e.matches;
        };
        mediaQuery.addEventListener("change", handler);
        return () => mediaQuery.removeEventListener("change", handler);
    });

    // SimpleBar removed - using CSS solution

    const isActive = (href: string) => {
        const currentPath = $page.url.pathname;
        if (href === "/") return currentPath === "/";
        return currentPath.startsWith(href);
    };
</script>

{#snippet NavItem({
    label,
    href,
    icon: Icon,
}: {
    label: string;
    href: string;
    icon: any;
})}
    {@const active = isActive(href)}

    <Tooltip openDelay={0} closeDelay={0} positioning={{ placement: "right" }}>
        <Tooltip.Trigger class="w-full">
            <Navigation.TriggerAnchor
                {href}
                class="flex justify-center py-3 transition-all duration-200 relative
                       {active ? 'text-primary-500' : 'text-surface-700-200'}"
            >
                {#if active}
                    <div
                        class="absolute left-0 top-1/4 bottom-1/4 w-1 bg-primary-500 rounded-r-full shadow-[0_0_10px_rgba(var(--color-primary-500)/0.5)]"
                        transition:fade={{ duration: 200 }}
                    ></div>
                {/if}

                <Icon
                    class="size-5 {active ? 'stroke-[2.5px]' : 'stroke-[2px]'}"
                />
            </Navigation.TriggerAnchor>
        </Tooltip.Trigger>

        <Portal>
            <Tooltip.Positioner class="z-50">
                <Tooltip.Content
                    class="preset-filled-surface-950-50 text-xs px-3 py-1.5 rounded-md shadow-xl"
                >
                    {label}
                    <Tooltip.Arrow
                        class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-950-50)]"
                    >
                        <Tooltip.ArrowTip />
                    </Tooltip.Arrow>
                </Tooltip.Content>
            </Tooltip.Positioner>
        </Portal>
    </Tooltip>
{/snippet}

<div
    class="w-full h-dvh grid"
    class:grid-rows-[1fr_auto]={isMobile}
    class:grid-cols-[auto_1fr]={!isMobile}
>
    {#if !isMobile}
        <Navigation
            layout="rail"
            class="w-16 border-r border-surface-500/20 p-1"
        >
            <Navigation.Header>
                <Navigation.Trigger class="flex justify-center py-3">
                    <SunMoon class="size-5" />
                </Navigation.Trigger>
            </Navigation.Header>

            <Navigation.Content>
                <Navigation.Menu>
                    {#each links as link (link.label)}
                        {@render NavItem(link)}
                    {/each}
                </Navigation.Menu>
            </Navigation.Content>

            <Navigation.Footer>
                {#each bottom_links as link (link.label)}
                    {@render NavItem(link)}
                {/each}
            </Navigation.Footer>
        </Navigation>
    {/if}

    <main class="h-full overflow-y-scroll">
        {@render children()}
    </main>

    {#if isMobile}
        <Navigation
            layout="bar"
            class="border-t border-surface-500/20 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]"
        >
            <Navigation.Menu class="grid grid-cols-4 gap-1">
                {#each links as link (link.label)}
                    {@const Icon = link.icon}
                    {@const active = isActive(link.href)}

                    <Navigation.TriggerAnchor
                        href={link.href}
                        class="flex flex-col items-center py-2 transition-all duration-200
                               {active
                            ? 'text-primary-500'
                            : 'text-surface-700-200 opacity-60'}"
                    >
                        <div class="relative flex items-center justify-center">
                            <Icon
                                class="size-5 {active
                                    ? 'stroke-[2.5px]'
                                    : 'stroke-[2px]'}"
                            />
                        </div>
                        <span
                            class="text-[10px] mt-1 font-medium {active
                                ? 'text-primary-500'
                                : 'text-surface-700-200 opacity-80'}"
                        >
                            {link.label}
                        </span>
                    </Navigation.TriggerAnchor>
                {/each}
            </Navigation.Menu>
        </Navigation>
    {/if}
</div>
