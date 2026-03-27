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
    } from "lucide-svelte";
    import { Navigation, Portal, Tooltip } from "@skeletonlabs/skeleton-svelte";
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
        return () => window.removeEventListener("pointerdown", handlePointerDown);
    });

    // --- CẤU HÌNH LINKS ---
    const links = [
        { label: "Home", href: "/", icon: HouseIcon },
        { label: "Gallery", href: "/gallery", icon: BookIcon },
        { label: "Browser", href: "/browser", icon: FolderTree },
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
        let savedMode = localStorage.getItem("mode");
        if (!savedMode) {
            savedMode = window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light";
        }
        document.documentElement.setAttribute("data-mode", savedMode);
        document.documentElement.classList.toggle("dark", savedMode === "dark");
    </script>
</svelte:head>

{#snippet ThemeIconToggle(isMobileNav = false)}
    <button
        onclick={toggleMode}
        class="flex flex-col items-center justify-center transition-all duration-300 hover:text-primary-500 active:scale-95
               {isMobileNav ? 'flex-1 py-2' : 'w-full py-6'}"
        aria-label="Toggle Theme"
    >
        <div class="relative size-5 flex items-center justify-center">
            {#if isDark}
                <div
                    class="absolute"
                    in:scale={{ duration: 400, start: 0.7, delay: 100 }}
                    out:fade={{ duration: 200 }}
                >
                    <Moon class="size-[18px] text-surface-50 stroke-[2px]" />
                </div>
            {:else}
                <div
                    class="absolute"
                    in:scale={{ duration: 400, start: 0.7, delay: 100 }}
                    out:fade={{ duration: 200 }}
                >
                <Sun
                    class="size-[18px] text-surface-900 stroke-[2px]"
                />
                </div>
            {/if}
        </div>

        {#if isMobileNav}
            <span class="text-[10px] mt-1 font-medium opacity-60 tracking-wide">
                {isDark ? "Dark" : "Light"}
            </span>
        {/if}
    </button>
{/snippet}

{#snippet NavItem({ label, href, icon: Icon }: any, isMobileNav = false)}
    {@const active = isActive(href)}
    <Tooltip openDelay={0} closeDelay={0} positioning={{ placement: "right" }}>
        <Tooltip.Trigger class="w-full">
            <Navigation.TriggerAnchor
                {href}
                class="flex flex-col md:flex-row justify-center items-center py-3 transition-all relative"
            >
                {#if active && !isMobileNav}
                    <div
                        class="absolute left-0 top-1/4 bottom-1/4 w-1 bg-primary-500 rounded-r-full"
                        transition:fade
                    ></div>
                {/if}
                <Icon
                    class="size-5 {active ? 'stroke-[2.5px]' : 'stroke-[2px]'}"
                />
                {#if isMobileNav}
                    <span class="text-[10px] mt-1 font-medium">{label}</span>
                {/if}
            </Navigation.TriggerAnchor>
        </Tooltip.Trigger>
        <Portal>
            <Tooltip.Positioner class="z-50 hidden md:block">
                <Tooltip.Content
                    class="preset-filled-surface-950-50 text-xs px-3 py-1.5 rounded-md shadow-xl"
                >
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
            ? 'flex-row bg-surface-100 dark:bg-surface-900 border-t border-surface-200 dark:border-surface-800'
            : 'flex-col bg-surface-100 dark:bg-surface-900 border-r border-surface-200 dark:border-surface-800'}"
    >
        {#if !isMobileNav}
            <Navigation.Header>
                {@render ThemeIconToggle(isMobileNav)}
            </Navigation.Header>
        {/if}

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

                <!-- {#if isMobileNav}
                    <div class="flex-1">
                        {@render ThemeIconToggle(isMobileNav)}
                    </div>
                {/if} -->
            </Navigation.Menu>
        </Navigation.Content>
    </Navigation>
{/snippet}

<div
    class="w-full h-dvh grid grid-rows-[1fr_auto] md:grid-rows-none md:grid-cols-[auto_1fr]"
>
    <!-- Desktop Sidebar -->
    <div class="hidden md:block w-16">
        {@render MainNavigation(false)}
    </div>

    <!-- Main Content -->
    <main class="h-full overflow-y-auto w-full">
        {@render children()}
    </main>

    <!-- Mobile Navigation -->
    <div class="block md:hidden w-full">
        {@render MainNavigation(true)}
    </div>
</div>
