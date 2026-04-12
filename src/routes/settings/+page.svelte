<script lang="ts">
    import {
        Trash2Icon,
        PowerIcon,
        FolderOpenIcon,
        FolderIcon,
        Settings2Icon,
        TerminalIcon
    } from "lucide-svelte";
    import { cacheVersion } from "$lib/client/stores/system/cache.svelte";
    import { enhance } from "$app/forms";
    import FolderPicker from "$lib/client/components/browser/modals/FolderPicker.svelte";
    import { browserStore } from "$lib/client/stores/browser/index.svelte";
    import { toaster } from "$lib/client/stores/ui/toaster";
    import { untrack, tick } from "svelte";
    import { goto } from "$app/navigation";
    import { fade } from "svelte/transition";

    import { deserialize } from "$app/forms";
    import { invalidateAll } from "$app/navigation";
    import type { ActionResult } from "@sveltejs/kit";

    let { data } = $props();

    let isClearingCache = $state(false);
    let isSaving = $state(false);
    let shutdownConfirm = $state<boolean>(false);
    let formEl: HTMLFormElement;
    let lastSavedPath = $state(untrack(() => data?.defaultPath ?? ""));
    let ytDlpPath = $state(untrack(() => data?.ytDlpPath ?? ""));
    let galleryDlPath = $state(untrack(() => data?.galleryDlPath ?? ""));
    let ffmpegPath = $state(untrack(() => data?.ffmpegPath ?? ""));

    let isSavingTools = $state(false);

    // --- Path bound to DB value ---
    let pickerPath = $state<string>(untrack(() => data?.defaultPath ?? ""));

    // Sync state when data from server changes (after Page Load)
    $effect(() => {
        if (data?.defaultPath) {
            pickerPath = data.defaultPath;
            lastSavedPath = data.defaultPath;
        }
        if (data?.ytDlpPath) ytDlpPath = data.ytDlpPath;
        if (data?.galleryDlPath) galleryDlPath = data.galleryDlPath;
        if (data?.ffmpegPath) ffmpegPath = data.ffmpegPath;
    });

    // --- Folder Picker ---
    let isFolderPickerOpen = $state(false);
    let pickingFor = $state<"library" | "ytDlp" | "galleryDl" | "ffmpeg">("library");
    let modalPath = $state("");

    function getParentDir(p: string): string {
        if (!p) return "";
        // If it looks like a file (has an extension at the end), get its parent directory
        if (/\.[a-z0-9]+$/i.test(p)) {
            const lastSep = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
            return lastSep > 0 ? p.substring(0, lastSep) : p;
        }
        return p;
    }

    function isAbsolutePath(p: string): boolean {
        // Windows: C:\... or \\server\...  Linux/Mac: /...
        return /^[a-z]:[\\\/]/i.test(p) || /^[\\\/]/.test(p);
    }

    function openPicker(target: "library" | "ytDlp" | "galleryDl" | "ffmpeg" = "library") {
        pickingFor = target;
        let initialPath = "";
        
        if (target === "library") initialPath = pickerPath;
        else if (target === "ytDlp") initialPath = ytDlpPath;
        else if (target === "galleryDl") initialPath = galleryDlPath;
        else if (target === "ffmpeg") initialPath = ffmpegPath;

        const normPath = initialPath.trim();
        if (normPath && isAbsolutePath(normPath)) {
            modalPath = getParentDir(normPath);
        } else {
            modalPath = "";
        }
        
        browserStore.actions.refreshDrives();
        isFolderPickerOpen = true;
    }

    // --- Auto-save Tools ---
    async function saveSingleTool(name: string, path: string) {
        const formData = new FormData();
        formData.append(name, path);

        const response = await fetch("?/saveTools", {
            method: "POST",
            body: formData,
        });

        const result: ActionResult = deserialize(await response.text());
        if (result.type === "success") {
            await invalidateAll();
        }
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
        fetch("/api/system/shutdown", { method: "POST" }).catch(() => {});
    }
</script>

<div class="p-6 md:p-12 max-w-4xl mx-auto" in:fade={{ duration: 400 }}>
    <div class="grid gap-8">
        <!-- Section: Library -->
        <section class="space-y-4">
            <div class="flex items-center gap-3 px-2">
                <FolderOpenIcon class="size-6 text-[var(--color-primary-500)]" />
                <h2 class="text-xl font-semibold">Library</h2>
            </div>
            
            <div class="card bg-surface-50/50 dark:bg-surface-900/40 backdrop-blur-xl border border-surface-200/50 dark:border-surface-800/50 p-6 shadow-xl ring-1 ring-surface-950/5">
                <div class="flex flex-col gap-4">
                    <div>
                        <p class="font-medium text-lg">Media Library Path</p>
                        <p class="text-sm text-surface-500 dark:text-surface-400 mb-4">
                            The root directory where your Manga, Videos, and Ebooks are stored.
                        </p>

                        <form
                            bind:this={formEl}
                            method="POST"
                            action="?/savePath"
                            use:enhance={() => {
                                return async ({ result, update }) => {
                                    if (result.type === 'success' && result.data) {
                                        const actionData = result.data as { path?: string };
                                        isSaving = false;
                                        toaster.create({
                                            type: "success",
                                            title: "Path saved",
                                            description: `Media library path updated: ${actionData.path ?? ""}`,
                                        });
                                        if (actionData.path) {
                                            pickerPath = actionData.path;
                                            lastSavedPath = actionData.path;
                                            setTimeout(() => {
                                                goto(`/browser?path=${encodeURIComponent(String(actionData.path))}`);
                                            }, 1000);
                                        }
                                    } else if (result.type === 'failure' && result.data) {
                                        const actionData = result.data as { error?: string };
                                        isSaving = false;
                                        toaster.create({
                                            type: "error",
                                            title: "Save failed",
                                            description: String(actionData.error ?? "Unknown error"),
                                        });
                                    }
                                    await update({ reset: false });
                                };
                            }}
                            class="w-full"
                        >
                            <div class="group relative flex items-center w-full bg-surface-100 dark:bg-surface-950/50 border border-surface-300 dark:border-surface-700/50 rounded-xl overflow-hidden transition-all focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:border-primary-500">
                                <input
                                    name="path"
                                    type="text"
                                    class="flex-1 h-12 px-4 bg-transparent border-none outline-none ring-0 text-sm font-medium tracking-tight truncate"
                                    bind:value={pickerPath}
                                    onkeydown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            handleSave();
                                            (e.target as HTMLInputElement).blur();
                                        }
                                    }}
                                    placeholder="Select a folder..."
                                    onclick={() => !pickerPath && openPicker()}
                                />
                                <div class="w-px h-6 bg-surface-300 dark:bg-surface-700/50 mx-1"></div>
                                <button
                                    type="button"
                                    class="flex items-center justify-center w-12 h-12 hover:bg-surface-200 dark:hover:bg-surface-800 transition-colors text-surface-600 dark:text-surface-400"
                                    onclick={() => openPicker("library")}
                                    title="Browse folders"
                                >
                                    <FolderIcon size={20} />
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </section>

        <!-- Section: External Tools -->
        <section class="space-y-4">
            <div class="flex items-center gap-3 px-2">
                <Settings2Icon class="size-6 text-[var(--color-primary-500)]" />
                <h2 class="text-xl font-semibold">External Tools</h2>
            </div>

            <div class="card bg-surface-50/50 dark:bg-surface-900/40 backdrop-blur-xl border border-surface-200/50 dark:border-surface-800/50 p-6 shadow-xl ring-1 ring-surface-950/5">
                <p class="text-sm text-surface-500 dark:text-surface-400 mb-8">
                    Paths for core media processing tools. These are automatically detected if left empty.
                </p>

                <div class="grid gap-10 md:gap-8">
                    <!-- yt-dlp -->
                    <div class="space-y-3">
                        <div class="flex flex-col">
                            <label for="ytDlp" class="text-xs font-bold uppercase tracking-widest text-surface-400 flex items-center gap-2 mb-1">
                                <TerminalIcon class="size-4" /> yt-dlp
                            </label>
                            <p class="text-sm text-surface-600 dark:text-surface-400 font-normal">
                                Downloads video and audio.
                            </p>
                        </div>
                        <div class="group relative flex items-center w-full bg-surface-100 dark:bg-surface-950/50 border border-surface-300 dark:border-surface-700/50 rounded-xl overflow-hidden transition-all focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:border-primary-500 h-10">
                            <input
                                id="ytDlp"
                                type="text"
                                class="flex-1 px-4 bg-transparent border-none outline-none ring-0 text-sm font-medium truncate"
                                bind:value={ytDlpPath}
                                onblur={() => saveSingleTool("ytDlp", ytDlpPath)}
                                placeholder="Automatically detecting..."
                            />
                            <div class="w-px h-5 bg-surface-300 dark:bg-surface-700/50 mx-1"></div>
                            <button
                                type="button"
                                class="flex items-center justify-center w-10 h-full hover:bg-surface-200 dark:hover:bg-surface-800 transition-colors text-surface-600 dark:text-surface-400"
                                onclick={() => openPicker("ytDlp")}
                                title="Browse folders"
                            >
                                <FolderIcon size={16} />
                            </button>
                        </div>
                    </div>

                    <!-- gallery-dl -->
                    <div class="space-y-3">
                        <div class="flex flex-col">
                            <label for="galleryDl" class="text-xs font-bold uppercase tracking-widest text-surface-400 flex items-center gap-2 mb-1">
                                <TerminalIcon class="size-4" /> gallery-dl
                            </label>
                            <p class="text-sm text-surface-600 dark:text-surface-400 font-normal">
                                Downloads image galleries.
                            </p>
                        </div>
                        <div class="group relative flex items-center w-full bg-surface-100 dark:bg-surface-950/50 border border-surface-300 dark:border-surface-700/50 rounded-xl overflow-hidden transition-all focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:border-primary-500 h-10">
                            <input
                                id="galleryDl"
                                type="text"
                                class="flex-1 px-4 bg-transparent border-none outline-none ring-0 text-sm font-medium truncate"
                                bind:value={galleryDlPath}
                                onblur={() => saveSingleTool("galleryDl", galleryDlPath)}
                                placeholder="Automatically detecting..."
                            />
                            <div class="w-px h-5 bg-surface-300 dark:bg-surface-700/50 mx-1"></div>
                            <button
                                type="button"
                                class="flex items-center justify-center w-10 h-full hover:bg-surface-200 dark:hover:bg-surface-800 transition-colors text-surface-600 dark:text-surface-400"
                                onclick={() => openPicker("galleryDl")}
                                title="Browse folders"
                            >
                                <FolderIcon size={16} />
                            </button>
                        </div>
                    </div>

                    <!-- ffmpeg -->
                    <div class="space-y-3">
                        <div class="flex flex-col">
                            <label for="ffmpeg" class="text-xs font-bold uppercase tracking-widest text-surface-400 flex items-center gap-2 mb-1">
                                <TerminalIcon class="size-4" /> ffmpeg
                            </label>
                            <p class="text-sm text-surface-600 dark:text-surface-400 font-normal">
                                Media transcoding and thumbnails.
                            </p>
                        </div>
                        <div class="group relative flex items-center w-full bg-surface-100 dark:bg-surface-950/50 border border-surface-300 dark:border-surface-700/50 rounded-xl overflow-hidden transition-all focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:border-primary-500 h-10">
                            <input
                                id="ffmpeg"
                                type="text"
                                class="flex-1 px-4 bg-transparent border-none outline-none ring-0 text-sm font-medium truncate"
                                bind:value={ffmpegPath}
                                onblur={() => saveSingleTool("ffmpeg", ffmpegPath)}
                                placeholder="Automatically detecting..."
                            />
                            <div class="w-px h-5 bg-surface-300 dark:bg-surface-700/50 mx-1"></div>
                            <button
                                type="button"
                                class="flex items-center justify-center w-10 h-full hover:bg-surface-200 dark:hover:bg-surface-800 transition-colors text-surface-600 dark:text-surface-400"
                                onclick={() => openPicker("ffmpeg")}
                                title="Browse folders"
                            >
                                <FolderIcon size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Section: System -->
        <section class="space-y-4">
            <div class="flex items-center gap-3 px-2">
                <PowerIcon class="size-6 text-[var(--color-primary-500)]" />
                <h2 class="text-xl font-semibold">System Maintenance</h2>
            </div>

            <div class="grid md:grid-cols-2 gap-4">
                <!-- Clear Cache -->
                <div class="card bg-surface-50/50 dark:bg-surface-900/40 backdrop-blur-xl border border-surface-200/50 dark:border-surface-800/50 p-5 shadow-lg flex flex-col justify-between gap-4">
                    <div>
                        <div class="flex items-center gap-3 mb-2">
                            <Trash2Icon class="size-5 text-surface-400" />
                            <p class="font-semibold">Reset Storage</p>
                        </div>
                        <p class="text-sm text-surface-500 dark:text-surface-400">
                            Wipe thumbnail cache, local settings, and active sessions.
                        </p>
                    </div>
                    <button
                        onclick={handleClear}
                        disabled={isClearingCache}
                        class="btn transition-all font-medium py-2.5 rounded-xl
                               {isClearingCache ? 'bg-surface-300 dark:bg-surface-700' : 'bg-surface-200 hover:bg-surface-300 dark:bg-surface-800 dark:hover:bg-surface-700 text-surface-800 dark:text-surface-200'}"
                    >
                        {isClearingCache ? "Clearing..." : "Clear System Data"}
                    </button>
                </div>

                <!-- Shutdown -->
                <div class="card bg-surface-50/50 dark:bg-surface-900/40 backdrop-blur-xl border border-surface-200/50 dark:border-surface-800/50 p-5 shadow-lg flex flex-col justify-between gap-4 transition-all duration-300 {shutdownConfirm ? 'ring-2 ring-error-500/50 border-error-500/30 bg-error-500/5' : ''}">
                    <div>
                        <div class="flex items-center gap-3 mb-2">
                            <PowerIcon
                                class="size-5 transition-colors duration-300"
                                style="color: {shutdownConfirm ? 'var(--color-error-500)' : 'var(--color-surface-400)'};"
                            />
                            <p class="font-semibold">Shutdown Server</p>
                        </div>
                        <p class="text-sm text-surface-500 dark:text-surface-400">
                            Stop all background processes and terminate the application server.
                        </p>
                    </div>
                    <button
                        onclick={handleShutdown}
                        class="btn transition-all font-bold py-2.5 rounded-xl flex items-center justify-center gap-2
                            {shutdownConfirm
                            ? 'bg-error-500 hover:bg-error-600 text-white shadow-lg shadow-error-500/20 px-8'
                            : 'bg-surface-200 hover:bg-surface-300 dark:bg-surface-800 dark:hover:bg-surface-700 text-surface-800 dark:text-surface-200'}"
                    >
                        {#if shutdownConfirm}
                            <PowerIcon class="size-4 animate-pulse" />
                            Confirm Shutdown
                        {:else}
                            <PowerIcon class="size-4" />
                            Shutdown
                        {/if}
                    </button>
                </div>
            </div>
        </section>
    </div>
</div>


<!-- Folder Picker Modal -->
{#if isFolderPickerOpen}
    <FolderPicker
        bind:isFolderPickerOpen
        bind:folderPath={modalPath}
        isFileMode={pickingFor !== "library"}
        availableDrives={browserStore.ui.availableDrives}
        isDrivesLoading={browserStore.ui.isDrivesLoading}
        onRefreshDrives={browserStore.actions.refreshDrives}
        onSelect={async (path: string) => {
            if (pickingFor === "library") {
                pickerPath = path;
                await tick();
                formEl.requestSubmit();
            } else if (pickingFor === "ytDlp") {
                ytDlpPath = path;
                saveSingleTool("ytDlp", path);
            } else if (pickingFor === "galleryDl") {
                galleryDlPath = path;
                saveSingleTool("galleryDl", path);
            } else if (pickingFor === "ffmpeg") {
                ffmpegPath = path;
                saveSingleTool("ffmpeg", path);
            }
        }}
    />
{/if}
