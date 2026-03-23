<script lang="ts">
    import "../app.css";
    import {
        ArrowLeftRightIcon,
        BookIcon,
        HouseIcon,
        FolderTree,
        HardDriveDownload,
        SettingsIcon,
    } from "lucide-svelte";
    import { Navigation } from "@skeletonlabs/skeleton-svelte";
    import type { Snippet } from "svelte";

    const { children }: { children: Snippet } = $props();

    const links = [
        { label: "Home", href: "/", icon: HouseIcon },
        { label: "Gallery", href: "/gallery", icon: BookIcon },
        { label: "File Browser", href: "/browser", icon: FolderTree },
        { label: "Import", href: "/import", icon: HardDriveDownload },
        { label: "Settings", href: "/settings", icon: SettingsIcon },
    ];

    let layoutRail = $state(true);
    let isMobile = $state(false);

    function toggleLayout() {
        layoutRail = !layoutRail;
    }

    $effect(() => {
        const mediaQuery = window.matchMedia("(max-width: 768px)");
        isMobile = mediaQuery.matches;

        const handler = (e: MediaQueryListEvent) => {
            isMobile = e.matches;
        };

        mediaQuery.addEventListener("change", handler);
        return () => mediaQuery.removeEventListener("change", handler);
    });
</script>

<div
    class="w-full h-screen grid"
    class:grid-rows-[1fr_auto]={isMobile}
    class:grid-cols-[auto_1fr]={!isMobile}
>
    {#if !isMobile}
        <Navigation
            layout={layoutRail ? "rail" : "sidebar"}
            class={layoutRail ? "" : "grid grid-rows-[1fr_auto] gap-4"}
        >
            <Navigation.Content>
                <Navigation.Header>
                    <Navigation.Trigger onclick={toggleLayout}>
                        <ArrowLeftRightIcon
                            class={layoutRail ? "size-5" : "size-4"}
                        />
                        {#if !layoutRail}<span>Resize</span>{/if}
                    </Navigation.Trigger>
                </Navigation.Header>
                <Navigation.Menu>
                    {#each links as link (link)}
                        {@const Icon = link.icon}
                        <Navigation.TriggerAnchor href={link.href}>
                            <Icon class="size-5" />
                            <Navigation.TriggerText>
                                {link.label}
                            </Navigation.TriggerText>
                        </Navigation.TriggerAnchor>
                    {/each}
                </Navigation.Menu>
            </Navigation.Content>
        </Navigation>
    {/if}

    <!-- Render page content here -->
    <main class="overflow-auto">
        {@render children()}
    </main>

    {#if isMobile}
        <Navigation layout="bar">
            <Navigation.Menu class="grid grid-cols-5 gap-1">
                {#each links as link (link)}
                    {@const Icon = link.icon}
                    <Navigation.TriggerAnchor href={link.href}>
                        <Icon class="size-5" />
                        <Navigation.TriggerText>
                            {link.label}
                        </Navigation.TriggerText>
                    </Navigation.TriggerAnchor>
                {/each}
            </Navigation.Menu>
        </Navigation>
    {/if}
</div>
