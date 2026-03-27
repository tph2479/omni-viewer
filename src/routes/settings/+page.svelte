<script lang="ts">
    import { SunIcon, MoonIcon, Trash2Icon, PowerIcon } from "lucide-svelte";
    import { Switch } from "@skeletonlabs/skeleton-svelte";
    import { cacheVersion } from "$lib/stores/cache.svelte";

    let clearConfirm = $state(false);
    let isClearingCache = $state(false);
    let shutdownConfirm = $state(false);

    async function handleClear() {
        if (isClearingCache) return;
        isClearingCache = true;
        try {
            await fetch("/api/media", { method: "DELETE" });
            cacheVersion.refresh();
        } catch (e) {
            console.error(e);
        } finally {
            isClearingCache = false;
        }
    }

    function handleShutdown() {
        if (!shutdownConfirm) {
            shutdownConfirm = true;
            setTimeout(() => (shutdownConfirm = false), 3000);
            return;
        }
        // TODO: gọi API shutdown
        shutdownConfirm = false;
    }
</script>

<div class="p-4 md:p-8 max-w-2xl mx-auto space-y-3">
    <h1 class="h2 mb-6">Settings</h1>

    <!-- Dark / Light toggle -->
    <!-- <div class="card preset-outlined p-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
            {#if theme.isDark}
                <MoonIcon class="size-5" />
            {:else}
                <SunIcon class="size-5" />
            {/if}
            <div>
                <p class="font-medium">Dark Mode</p>
                <p class="text-sm text-surface-500 dark:text-surface-400">
                    {theme.isDark ? "Dark mode is on" : "Light mode is on"}
                </p>
            </div>
        </div>
        <Switch checked={theme.isDark} onCheckedChange={(e) => theme.toggle()}>
            <Switch.Control>
                <Switch.Thumb />
            </Switch.Control>
            <Switch.HiddenInput />
        </Switch>
    </div> -->

    <!-- Clear cache & preferences -->
    <div class="card preset-outlined p-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
            <Trash2Icon class="size-5" />
            <div>
                <p class="font-medium">Clear cache & preferences</p>
                <p class="text-sm text-surface-500 dark:text-surface-400">
                    Clear thumbnail cache and localStorage.
                </p>
            </div>
        </div>
        <button onclick={handleClear} class="btn shrink-0 transition-all">
            Clear
        </button>
    </div>

    <!-- Shutdown -->
    <div class="card preset-outlined p-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
            <PowerIcon
                class="size-5 {shutdownConfirm
                    ? 'text-error-400'
                    : 'text-surface-400'}"
            />
            <div>
                <p class="font-medium">Shutdown</p>
                <p class="text-sm text-surface-500 dark:text-surface-400">
                    Shutdown the server and close the application.
                </p>
            </div>
        </div>
        <button
            onclick={handleShutdown}
            class="btn shrink-0 transition-all
                {shutdownConfirm
                ? 'preset-filled-error-300'
                : 'preset-tonal-surface'}"
        >
            <PowerIcon class="size-4" />
            {shutdownConfirm ? "Pull the plug ?" : "Shutdown"}
        </button>
    </div>
</div>
