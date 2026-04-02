<script lang="ts">
    import {
        Trash2Icon,
        PowerIcon,
        FolderOpenIcon,
        FolderIcon,
    } from "lucide-svelte";
    import { cacheVersion } from "$lib/stores/cache.svelte";
    import { enhance } from "$app/forms";
    import FolderPicker from "$lib/components/FolderPicker.svelte";
    import { browserStore } from "$lib/stores/browser.svelte";
    import { toaster } from "$lib/stores/toaster";
    import { untrack, tick } from "svelte";
    import { goto } from "$app/navigation";

    let { data, form } = $props();

    let isClearingCache = $state(false);
    let isSaving = $state(false);
    let shutdownConfirm = $state(false);
    let formEl: HTMLFormElement;
    let lastSavedPath = $state(untrack(() => data?.defaultPath ?? ""));

    // --- Path bound to DB value ---
    let pickerPath = $state<string>(untrack(() => data?.defaultPath ?? ""));

    // Sync state when data from server changes (after Page Load)
    $effect(() => {
        if (data?.defaultPath) {
            pickerPath = data.defaultPath;
            lastSavedPath = data.defaultPath;
        }
    });

    // --- Folder Picker ---
    let isFolderPickerOpen = $state(false);
    function openPicker() {
        browserStore.actions.refreshDrives();
        isFolderPickerOpen = true;
    }

    // --- Save Logic ---
    async function handleSave() {
        if (isSaving) return;
        if (pickerPath !== lastSavedPath) {
            isSaving = true;
            await tick();
            formEl.requestSubmit();
        }
    }

    // --- Clear cache ---
    async function handleClear() {
        if (isClearingCache) return;
        isClearingCache = true;
        try {
            await fetch("/api/media", { method: "DELETE" });
            
            // Clear client-side storage
            localStorage.clear();
            sessionStorage.clear();
            
            // Reset stores
            cacheVersion.refresh();
            browserStore.reset();
            
            toaster.create({
                type: "success",
                title: "System cleared",
                description: "Thumbnail cache, LocalStorage, and SessionStorage have been wiped.",
            });
        } catch (e) {
            console.error(e);
            toaster.create({
                type: "error",
                title: "Failed to clear",
                description: String(e),
            });
        } finally {
            isClearingCache = false;
        }
    }

    // --- Shutdown ---
    function handleShutdown() {
        if (!shutdownConfirm) {
            shutdownConfirm = true;
            setTimeout(() => (shutdownConfirm = false), 3000);
            return;
        }
        shutdownConfirm = false;
    }
</script>

<div class="p-4 md:p-8 max-w-2xl mx-auto space-y-3">
    <h1 class="h2 mb-6">Settings</h1>

    <!-- Media Directory Path Configuration -->
    <div class="space-y-1">
        <div class="card preset-outlined p-4 flex flex-col gap-4">
            <div class="flex items-center gap-3">
                <FolderOpenIcon class="size-5 shrink-0" />
                <div class="flex-1 min-w-0">
                    <p class="font-medium">Media Library</p>
                    <p class="text-sm text-surface-500 dark:text-surface-400">
                        Root directory path for Manga, Videos and Ebooks.
                    </p>

                    <form
                        bind:this={formEl}
                        method="POST"
                        action="?/savePath"
                        use:enhance={() => {
                            return async ({ result, update }) => {
                                const data = await result;
                                if (data.type === 'success') {
                                    isSaving = false;
                                    toaster.create({
                                        type: "success",
                                        title: "Path saved",
                                        description: `Media library path updated: ${data.data.path}`,
                                    });
                                    if (data.data.path) {
                                        pickerPath = data.data.path;
                                        lastSavedPath = data.data.path;
                                        setTimeout(() => {
                                            goto(`/browser?path=${encodeURIComponent(data.data.path)}`);
                                        }, 1000);
                                    }
                                } else if (data.type === 'failure') {
                                    isSaving = false;
                                    toaster.create({
                                        type: "error",
                                        title: "Save failed",
                                        description: data.data.error,
                                    });
                                }
                                update({ reset: false });
                            };
                        }}
                        class="w-full mt-4"
                    >
                        <!-- Path Input with Browse Button on Right -->
                        <div
                            class="card preset-outlined flex items-center w-full overflow-hidden shadow-none"
                        >
                            <input
                                name="path"
                                type="text"
                                class="flex-1 h-10 px-4 bg-transparent border-none outline-none ring-0
                                       text-sm font-medium tracking-tight truncate
                                       text-surface-700 dark:text-surface-200"
                                bind:value={pickerPath}
                                onkeydown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleSave();
                                    }
                                }}
                                placeholder="Type or browse to select folder…"
                                onclick={() => !pickerPath && openPicker()}
                            />
                            <div
                                class="w-px h-6 bg-surface-200 dark:bg-surface-800/10 shrink-0 mx-1"
                            ></div>
                            <button
                                type="button"
                                class="flex items-center justify-center w-10 h-10 shrink-0 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
                                onclick={openPicker}
                                title="Browse folders"
                            >
                                <FolderIcon size={18} strokeWidth={1.5} />
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <!-- Clear cache & preferences -->
    <div class="card preset-outlined p-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
            <Trash2Icon class="size-5" />
            <div>
                <p class="font-medium">Clear cache &amp; preferences</p>
                <p class="text-sm text-surface-500 dark:text-surface-400">
                    Clear thumbnail cache, localStorage and sessionStorage.
                </p>
            </div>
        </div>
        <button
            onclick={handleClear}
            disabled={isClearingCache}
            class="btn shrink-0 transition-all preset-tonal-surface disabled:opacity-50"
        >
            {isClearingCache ? "Clearing…" : "Clear"}
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

<!-- Folder Picker Modal -->
{#if isFolderPickerOpen}
    <FolderPicker
        bind:isFolderPickerOpen
        bind:folderPath={pickerPath}
        availableDrives={browserStore.ui.availableDrives}
        isDrivesLoading={browserStore.ui.isDrivesLoading}
        onRefreshDrives={browserStore.actions.refreshDrives}
        onSelect={async (path) => {
            pickerPath = path;
            await tick();
            formEl.requestSubmit();
        }}
    />
{/if}
