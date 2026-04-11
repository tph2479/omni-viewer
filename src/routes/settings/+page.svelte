<script lang="ts">
    import {
        Trash2Icon,
        PowerIcon,
        FolderOpenIcon,
        FolderIcon,
        Settings2Icon,
        TerminalIcon
    } from "lucide-svelte";
    import { cacheVersion } from "$lib/stores/system/cache.svelte";
    import { enhance } from "$app/forms";
    import FolderPicker from "$lib/components/browser/modals/FolderPicker.svelte";
    import { browserStore } from "$lib/stores/browser/index.svelte";
    import { toaster } from "$lib/stores/ui/toaster";
    import { untrack, tick } from "svelte";
    import { goto } from "$app/navigation";

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
                                        (e.target as HTMLInputElement).blur();
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
                                <FolderIcon size={18}  />
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <!-- External Tools Configuration -->
    <div class="space-y-1 transition-all duration-300">
        <div class="card preset-outlined p-4 flex flex-col gap-4">
            <div class="flex items-center gap-3">
                <Settings2Icon class="size-5 shrink-0" />
                <div class="flex-1 min-w-0">
                    <p class="font-medium">External Tools</p>
                    <p class="text-sm text-surface-500 dark:text-surface-400">
                        Paths for downloading and processing media. Auto-detected from system PATH if empty.
                    </p>
                    <div class="space-y-8 mt-6">
                        <!-- yt-dlp -->
                        <div class="space-y-3">
                            <div class="flex flex-col gap-1">
                                <label for="ytDlp" class="text-xs font-bold uppercase tracking-wider text-surface-500 flex items-center gap-2">
                                    <TerminalIcon class="size-4" /> yt-dlp Path
                                </label>
                                <p class="text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
                                    Downloads videos and audio from YouTube and other platforms.
                                </p>
                            </div>
                            <div class="card preset-outlined flex items-center w-full overflow-hidden shadow-none h-9">
                                <input
                                    id="ytDlp"
                                    type="text"
                                    class="flex-1 px-3 bg-transparent border-none outline-none ring-0 text-sm font-medium truncate"
                                    bind:value={ytDlpPath}
                                    onblur={() => saveSingleTool("ytDlp", ytDlpPath)}
                                    placeholder="Auto-detecting..."
                                />
                                <div class="w-px h-5 bg-surface-200 dark:bg-surface-800/50 shrink-0 mx-1"></div>
                                <button
                                    type="button"
                                    class="flex items-center justify-center w-9 h-full shrink-0 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
                                    onclick={() => openPicker("ytDlp")}
                                    title="Browse folders"
                                >
                                    <FolderIcon size={14} />
                                </button>
                            </div>
                        </div>

                        <!-- gallery-dl -->
                        <div class="space-y-3">
                            <div class="flex flex-col gap-1">
                                <label for="galleryDl" class="text-xs font-bold uppercase tracking-wider text-surface-500 flex items-center gap-2">
                                    <TerminalIcon class="size-4" /> gallery-dl Path
                                </label>
                                <p class="text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
                                    Downloads image galleries, albums, and manga from various sites.
                                </p>
                            </div>
                            <div class="card preset-outlined flex items-center w-full overflow-hidden shadow-none h-9">
                                <input
                                    id="galleryDl"
                                    type="text"
                                    class="flex-1 px-3 bg-transparent border-none outline-none ring-0 text-sm font-medium truncate"
                                    bind:value={galleryDlPath}
                                    onblur={() => saveSingleTool("galleryDl", galleryDlPath)}
                                    placeholder="Auto-detecting..."
                                />
                                <div class="w-px h-5 bg-surface-200 dark:bg-surface-800/50 shrink-0 mx-1"></div>
                                <button
                                    type="button"
                                    class="flex items-center justify-center w-9 h-full shrink-0 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
                                    onclick={() => openPicker("galleryDl")}
                                    title="Browse folders"
                                >
                                    <FolderIcon size={14} />
                                </button>
                            </div>
                        </div>

                        <!-- ffmpeg -->
                        <div class="space-y-3">
                            <div class="flex flex-col gap-1">
                                <label for="ffmpeg" class="text-xs font-bold uppercase tracking-wider text-surface-500 flex items-center gap-2">
                                    <TerminalIcon class="size-4" /> ffmpeg Path
                                </label>
                                <p class="text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
                                    Handles media transcoding and thumbnail generation.
                                </p>
                            </div>
                            <div class="card preset-outlined flex items-center w-full overflow-hidden shadow-none h-9">
                                <input
                                    id="ffmpeg"
                                    type="text"
                                    class="flex-1 px-3 bg-transparent border-none outline-none ring-0 text-sm font-medium truncate"
                                    bind:value={ffmpegPath}
                                    onblur={() => saveSingleTool("ffmpeg", ffmpegPath)}
                                    placeholder="Auto-detecting..."
                                />
                                <div class="w-px h-5 bg-surface-200 dark:bg-surface-800/50 shrink-0 mx-1"></div>
                                <button
                                    type="button"
                                    class="flex items-center justify-center w-9 h-full shrink-0 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
                                    onclick={() => openPicker("ffmpeg")}
                                    title="Browse folders"
                                >
                                    <FolderIcon size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
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
                class="size-5"
                style="color: {shutdownConfirm ? 'var(--color-error-400)' : 'var(--color-surface-400)'};"
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
        bind:folderPath={modalPath}
        isFileMode={pickingFor !== "library"}
        availableDrives={browserStore.ui.availableDrives}
        isDrivesLoading={browserStore.ui.isDrivesLoading}
        onRefreshDrives={browserStore.actions.refreshDrives}
        onSelect={async (path) => {
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
