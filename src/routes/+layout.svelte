<script lang="ts">
    import "../app.css";
    import { page } from "$app/stores";
    import {
        BookIcon,
        HouseIcon,
        FolderTree,
        HardDriveDownload,
        SettingsIcon,
        Sun,
        Moon,
        Link,
    } from "lucide-svelte";
    import { Navigation, Portal, Tooltip } from "@skeletonlabs/skeleton-svelte";
    import GalleryModals from "$lib/components/browser/modals/GalleryModals.svelte";
    import BrowserNotifications from "$lib/components/browser/ui/BrowserNotifications.svelte";
    import type { Snippet } from "svelte";
    import { fade, scale } from "svelte/transition";

    const { children }: { children: Snippet } = $props();

    // --- LOGIC DARK MODE ---
    let isDark = $state(false);

    $effect(() => {
        let mode = localStorage.getItem("mode");
        if (!mode) {
            mode = window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light";
        }
        isDark = mode === "dark";
        document.documentElement.setAttribute("data-mode", mode);
        document.documentElement.classList.toggle("dark", isDark);
    });

    const toggleMode = () => {
        isDark = !isDark;
        const mode = isDark ? "dark" : "light";
        document.documentElement.setAttribute("data-mode", mode);
        document.documentElement.classList.toggle("dark", isDark);
        localStorage.setItem("mode", mode);
    };

    // --- GLOBAL BUTTON FOCUS PREVENTION ---
    $effect(() => {
        const handlePointerDown = (e: PointerEvent) => {
            const button = (e.target as HTMLElement).closest("button");
            if (button) {
                // We use setTimeout to blur after the click event has processed
                setTimeout(() => {
                    if (document.activeElement === button) {
                        button.blur();
                    }
                }, 0);
            }
        };
        window.addEventListener("pointerdown", handlePointerDown);
        return () =>
            window.removeEventListener("pointerdown", handlePointerDown);
    });

    // --- CẤU HÌNH LINKS ---
    const links = [
        { label: "Home", href: "/", icon: HouseIcon },
        { label: "Gallery", href: "/gallery", icon: BookIcon },
        { label: "Browser", href: "/browser", icon: FolderTree },
        { label: "Getlink", href: "/getlink", icon: Link },
        { label: "Import", href: "/import", icon: HardDriveDownload },
        { label: "Settings", href: "/settings", icon: SettingsIcon },
    ];

    const isActive = (href: string) => {
        const currentPath = $page.url.pathname;
        return href === "/"
            ? currentPath === "/"
            : currentPath.startsWith(href);
    };

    // --- NAVIGATION COMPONENT ---
</script>

<svelte:head>
    <script>
        (() => {
            let savedMode = localStorage.getItem("mode");
            if (!savedMode) {
                savedMode = window.matchMedia("(prefers-color-scheme: dark)")
                    .matches
                    ? "dark"
                    : "light";
            }
            document.documentElement.setAttribute("data-mode", savedMode);
            document.documentElement.classList.toggle(
                "dark",
                savedMode === "dark",
            );
        })();
    </script>
</svelte:head>

{#snippet ThemeIconToggle(isMobileNav = false)}
    <Tooltip openDelay={0} closeDelay={0} positioning={{ placement: "right" }}>
        <Tooltip.Trigger
            onclick={toggleMode}
            class="flex flex-col items-center justify-center transition-all duration-100 w-full py-2 text-surface-600 dark:text-surface-400 hover:text-[var(--color-primary-600)] dark:hover:text-[var(--color-primary-400)] active:scale-95"
            aria-label="Toggle Theme"
        >
            <div class="relative size-7 flex items-center justify-center">
                {#if isDark}
                    <Moon class="size-[28px] stroke-[1.5px]" />
                {:else}
                    <Sun class="size-[28px] stroke-[1.5px]" />
                {/if}
            </div>
        </Tooltip.Trigger>
        <Portal>
            <Tooltip.Positioner class="fixed z-[10000] hidden md:block">
                <Tooltip.Content
                    class="preset-filled-surface-950-50 text-xs px-3 py-1.5 rounded-md shadow-xl relative z-[10000]"
                >
                    <Tooltip.Arrow>
                        <div
                            class="preset-filled-surface-950-50 size-2 rotate-45 absolute -left-1 top-1/2 -translate-y-1/2 -z-10"
                        ></div>
                    </Tooltip.Arrow>
                    {isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                </Tooltip.Content>
            </Tooltip.Positioner>
        </Portal>
    </Tooltip>
{/snippet}

{#snippet NavItem({ label, href, icon: Icon }: any, isMobileNav = false)}
    {@const active = isActive(href)}
    <Tooltip openDelay={0} closeDelay={0} positioning={{ placement: "right" }}>
        <Tooltip.Trigger class="w-full">
            {#snippet element(props)}
                <Navigation.TriggerAnchor
                    {...props}
                    {href}
                    class="flex flex-col md:flex-row justify-center items-center py-2 transition-all relative"
                >
                    {#if active && !isMobileNav}
                        <div
                            class="absolute left-0 top-1/4 bottom-1/4 w-1 rounded-r-full"
                            style="background-color: var(--color-primary-500);"
                            transition:fade
                        ></div>
                    {/if}
                    <Icon
                        class="size-7 {active
                            ? 'stroke-[1.8px] text-[var(--color-primary-600)] dark:text-[var(--color-primary-400)]'
                            : 'stroke-[1.5px] text-surface-600 dark:text-surface-400 hover:text-[var(--color-primary-600)] dark:hover:text-[var(--color-primary-400)]'} transition-colors"
                    />
                </Navigation.TriggerAnchor>
            {/snippet}
        </Tooltip.Trigger>
        <Portal>
            <Tooltip.Positioner class="fixed z-[10000] hidden md:block">
                <Tooltip.Content
                    class="preset-filled-surface-950-50 text-xs px-3 py-1.5 rounded-md shadow-xl relative z-[10000]"
                >
                    <Tooltip.Arrow>
                        <div
                            class="preset-filled-surface-950-50 size-2 rotate-45 absolute -left-1 top-1/2 -translate-y-1/2 -z-10"
                        ></div>
                    </Tooltip.Arrow>
                    {label}
                </Tooltip.Content>
            </Tooltip.Positioner>
        </Portal>
    </Tooltip>
{/snippet}

{#snippet MainNavigation(isMobileNav: boolean)}
    <Navigation
        layout={isMobileNav ? "bar" : "rail"}
        class="h-full w-full flex {isMobileNav
            ? 'flex-row bg-surface-100 dark:bg-surface-900'
            : 'flex-col bg-surface-100 dark:bg-surface-900'}"
    >
        <Navigation.Content class="flex-1 {isMobileNav ? 'w-full' : ''}">
            <Navigation.Menu
                class={isMobileNav
                    ? "flex w-full justify-around items-center"
                    : "space-y-2"}
            >
                {#each links as link}
                    <div class={isMobileNav ? "flex-1" : "w-full"}>
                        {@render NavItem(link, isMobileNav)}
                    </div>
                {/each}
            </Navigation.Menu>
        </Navigation.Content>
        {#if !isMobileNav}
            <Navigation.Footer>
                {@render ThemeIconToggle(isMobileNav)}
            </Navigation.Footer>
        {/if}
    </Navigation>
{/snippet}

<div
    class="w-full h-dvh grid grid-rows-[1fr_auto] md:grid-rows-none md:grid-cols-[auto_1fr]"
>
    <!-- Desktop Sidebar -->
    <div class="hidden md:block w-16 relative z-[100]">
        {@render MainNavigation(false)}
    </div>

    <!-- Main Content -->
    <main class="h-full overflow-y-scroll w-full relative z-0">
        {@render children()}
    </main>

    <!-- Mobile Navigation -->
    <div class="block md:hidden w-full">
        {@render MainNavigation(true)}
    </div>
</div>

<GalleryModals />
<BrowserNotifications />
