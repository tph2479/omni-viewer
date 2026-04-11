<script lang="ts">
    import { untrack, onMount } from "svelte";
    import {
        FolderOpen,
        ChevronLeft,
        RotateCw,
        HardDrive,
        Folder,
        FileText,
        X,
        AlertCircle,
        FolderX,
        FileArchive,
        Play,
    } from "lucide-svelte";

    type DirectoryEntry = {
        name: string;
        path: string;
        mediaType?: 'directory' | 'cbz' | 'media' | 'unknown';
    };

    let {
        isFolderPickerOpen = $bindable(),
        folderPath = $bindable(),
        availableDrives = $bindable([]),
        isDrivesLoading,
        onRefreshDrives,
        onSelect,
        onOpenFile,
        isFileMode = false,
    }: {
        isFolderPickerOpen: boolean;
        folderPath: string;
        availableDrives: DirectoryEntry[];
        isDrivesLoading: boolean;
        onRefreshDrives?: () => Promise<void>;
        onSelect: (path: string) => void;
        onOpenFile?: (path: string, type: "media" | "cbz") => void;
        isFileMode?: boolean;
    } = $props();

    // ── OS Detection ──────────────────────────────────────────────
    // Detect from the first available drive path returned by the server.
    // Falls back to checking navigator.userAgent as a last resort.
    const isWindows = $derived.by(() => {
        if (availableDrives.length > 0) {
            return /^[A-Za-z]:[\\\/]/.test(availableDrives[0].path);
        }
        // Also check folderPath for Windows-style paths (e.g. from DB or localStorage)
        if (folderPath && /^[A-Za-z]:[\\\/]/.test(folderPath)) {
            return true;
        }
        return navigator.userAgent.toLowerCase().includes("win");
    });

    const SEP = $derived(isWindows ? "\\" : "/");

    // ── Path helpers ──────────────────────────────────────────────
    /** Normalize separators so we always compare with the native sep. */
    function normalizePath(p: string): string {
        if (!p) return p;
        // Detect Windows from path itself (important for mobile browsers)
        const pathIsWindows = /^[A-Za-z]:[\\\/]/.test(p);
        if (pathIsWindows || isWindows) return p.replace(/\//g, "\\");
        return p.replace(/\\/g, "/");
    }

    /** Strip trailing separator unless it's a root path (C:\ or /). */
    function stripTrailingSep(p: string): string {
        const norm = normalizePath(p);
        // Windows root: "C:\"  → keep
        if (/^[A-Za-z]:\\$/.test(norm)) return norm;
        // Linux root: "/"     → keep
        if (norm === "/") return norm;
        return norm.replace(/[\\\/]+$/, "");
    }

    /** Root label shown when no drive / path is selected. */
    const ROOT_LABEL = "";

    // ── State ─────────────────────────────────────────────────────
    let pickerCurrentPath = $state("");
    let pickerParentPath = $state<string | null>(null);
    let subdirectoryEntries: DirectoryEntry[] = $state([]);
    let selectedFilePath = $state<string | null>(null);
    const isAtRoot = $derived(
        pickerCurrentPath === ROOT_LABEL || pickerCurrentPath === "",
    );
    const pickerDirectories = $derived(
        isAtRoot ? availableDrives : subdirectoryEntries,
    );
    let isPickerLoading = $state(false);
    let pickerError = $state("");
    let dialogEl: HTMLDivElement;

    let innerWidth = $state(1024);
    const isMobile = $derived(innerWidth < 640);

    onMount(() => {
        innerWidth = window.innerWidth;
        const handleResize = () => (innerWidth = window.innerWidth);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    });

    // ── Data loading ──────────────────────────────────────────────
    async function loadPickerData(pathQuery = "", force = false) {
        const isRoot =
            pathQuery === "" ||
            pathQuery === "This PC" ||
            pathQuery === "File System";

        if (isRoot) {
            // Never show "This PC" — always go to first available drive
            if (availableDrives.length > 0) {
                await loadPickerData(availableDrives[0].path, force);
                return;
            }
            // No drives yet — load them first
            if (onRefreshDrives) {
                await onRefreshDrives();
                if (availableDrives.length > 0) {
                    await loadPickerData(availableDrives[0].path, force);
                    return;
                }
            }
            // Still no drives — show empty state, not "This PC"
            pickerCurrentPath = "";
            pickerParentPath = null;
            return;
        }

        isPickerLoading = true;
        pickerError = "";

        try {
            const query = normalizePath(pathQuery);
            const res = await fetch(
                `/api/file?action=directories&path=${encodeURIComponent(query)}`,
            );
            const data = await res.json();
            if (!res.ok)
                throw new Error(data.message || "Error fetching directories");

            // Reset selection when navigating to a new folder
            selectedFilePath = null;

            pickerCurrentPath = data.currentPath || "";
            pickerParentPath = data.parentPath ?? null;
            subdirectoryEntries = (data.directories as any[]).map(
                (d) => {
                    const isDir = d.isDir;
                    const isCbz = d.isCbz;
                    const isMedia = d.isMedia;
                    const isExecutable = d.isExecutable;
                    let mediaType: 'directory' | 'cbz' | 'media' | 'unknown' = 'unknown';
                    if (isDir) mediaType = 'directory';
                    else if (isCbz) mediaType = 'cbz';
                    else if (isMedia || isExecutable) mediaType = 'media';
                    return {
                        name: d.name,
                        path: normalizePath(d.path),
                        mediaType,
                        isExecutable,
                    };
                },
            );
        } catch (e: any) {
            pickerError = e.message;
        } finally {
            isPickerLoading = false;
        }
    }

    // ── Open effect ───────────────────────────────────────────────
    let wasOpen = false;
    $effect(() => {
        if (isFolderPickerOpen && !wasOpen) {
            untrack(() => {
                let target = folderPath.trim();

                // If empty path, default to first available drive
                if (!target) {
                    if (availableDrives.length > 0) {
                        target = availableDrives[0].path;
                        folderPath = target;
                        normalizeAndLoad(target);
                    } else {
                        // Drives not loaded yet — load them first, then navigate to first drive
                        onRefreshDrives?.().then(() => {
                            if (availableDrives.length > 0) {
                                const firstDrive = availableDrives[0].path;
                                folderPath = firstDrive;
                                normalizeAndLoad(firstDrive);
                            }
                        }).catch(() => {});
                    }
                    setTimeout(() => dialogEl?.focus(), 50);
                    return;
                }

                normalizeAndLoad(target);
                setTimeout(() => dialogEl?.focus(), 50);
            });
        }
        wasOpen = isFolderPickerOpen;
    });

    function normalizeAndLoad(raw: string) {
        let target = raw.trim();
        // Strip double drive prefix: C:\C:\Users → C:\Users
        target = target.replace(/^([A-Za-z]:\\)\1+/i, '$1');
        // Detect Windows from path itself (important for mobile browsers)
        const pathIsWindows = /^[A-Za-z]:[\\\/]/.test(target);
        // Windows: "C:" → "C:\"
        if ((pathIsWindows || isWindows) && target.length === 2 && target.endsWith(":")) {
            target += "\\";
        }
        // Linux: ensure leading slash when non-empty
        if (!pathIsWindows && !isWindows && target && !target.startsWith("/")) {
            target = "/" + target;
        }
        loadPickerData(target).catch(() => {});
    }

    // ── Actions ───────────────────────────────────────────────────
    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") close();
    }
    function close() {
        isFolderPickerOpen = false;
        wasOpen = false;
    }

    function confirm() {
        const finalPath = isFileMode && selectedFilePath ? selectedFilePath : stripTrailingSep(pickerCurrentPath);
        if (!finalPath) return;
        folderPath = finalPath;
        isFolderPickerOpen = false;
        onSelect(finalPath);
    }

    function handleEntryClick(dir: DirectoryEntry) {
        if (dir.mediaType === 'directory') {
            loadPickerData(dir.path);
            return;
        }

        if (isFileMode) {
            selectedFilePath = (selectedFilePath === dir.path) ? null : dir.path;
            return;
        }

        // Default behavior for non-file mode (media/cbz handling)
        const mt = dir.mediaType || 'unknown';
        if (mt === 'cbz') {
            folderPath = dir.path;
            isFolderPickerOpen = false;
            onOpenFile?.(dir.path, "cbz");
            onSelect(dir.path);
            return;
        }
        if (mt === 'media') {
            folderPath = pickerCurrentPath;
            isFolderPickerOpen = false;
            onOpenFile?.(dir.path, "media");
            onSelect(pickerCurrentPath);
            return;
        }
    }

    // ── UI helpers ────────────────────────────────────────────────
    function getEntryMeta(dir: DirectoryEntry, isRoot: boolean) {
        const isDrive = /^[A-Za-z]:[\\\/]?$/.test(dir.path);
        if (isRoot || isDrive)
            return { colorClass: "", icon: "drive", style: "color: var(--color-tertiary-500);" };
        
        if (dir.mediaType === 'directory')
            return { colorClass: "", icon: "folder", style: "color: var(--color-primary-500);" };
        
        if ((dir as any).isExecutable)
            return { colorClass: "", icon: "media", style: "color: var(--color-warning-500); filter: hue-rotate(240deg);" };

        const mt = dir.mediaType || 'unknown';
        if (mt === 'cbz')
            return { colorClass: "", icon: "archive", style: "color: var(--color-warning-500);" };
        if (mt === 'media')
            return { colorClass: "", icon: "media", style: "color: var(--color-success-500);" };
        return { colorClass: "opacity-30", icon: "file", style: "" };
    }


    const canConfirm = $derived((!isAtRoot || isFileMode) && !isPickerLoading && !pickerError && (!isFileMode || !!selectedFilePath || !!pickerCurrentPath));

    /** Drive/root label shown in the quick-nav chips.
     *  Windows → "C", "D" …   Linux → "/", "~", "/media/…" last segment */
    function driveLabel(drive: DirectoryEntry): string {
        const isDrive = /^[A-Za-z]:[\\\/]?$/.test(drive.path);
        if (isDrive) {
            // "C:\ (Volume)" or "C:\"
            const letterMatch = drive.path.match(/^([A-Za-z]:)/);
            const letter = letterMatch ? letterMatch[1] : drive.name.slice(0, 2);
            
            // Extract volume name from inside parentheses if present
            const volumeMatch = drive.name.match(/\((.*)\)/);
            const volume = volumeMatch ? volumeMatch[1] : "";
            
            return volume ? `${letter} (${volume})` : letter;
        }
        // For Linux show last path segment or "/" for root
        const segs = drive.path.replace(/\/$/, "").split("/").filter(Boolean);
        return segs.length === 0 ? "/" : segs[segs.length - 1];
    }
</script>

<!-- Backdrop -->
<div
    role="dialog"
    aria-modal="true"
    aria-label="Select Directory"
    tabindex="-1"
    class="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md grid place-items-center sm:p-4 p-0 outline-none"
    onclick={close}
    onkeydown={handleKeydown}
    bind:this={dialogEl}
>
    <!-- Card -->
    <div
        role="presentation"
        class="
			sm:w-[580px] sm:h-[620px] w-full h-full sm:max-w-[95vw] sm:max-h-[90vh]
			flex flex-col overflow-hidden sm:rounded-2xl rounded-none shadow-2xl
			bg-white dark:bg-surface-800
			border border-gray-200 dark:border-surface-600
		"
        onclick={(e) => e.stopPropagation()}
    >
        <!-- Header -->
        <div
            class="flex items-center justify-between px-5 py-3.5
			bg-gray-50/70 dark:bg-surface-700/70 backdrop-blur-md
			border-b border-gray-200 dark:border-surface-600"
        >
            <div class="flex items-center gap-2.5">
                <span class="p-1.5 rounded-lg" style="background-color: color-mix(in srgb, var(--color-primary-500) 10%, transparent);">
                    <FolderOpen class="h-5 w-5" style="color: var(--color-primary-500);" />
                </span>
                <span
                    class="text-sm font-semibold text-gray-800 dark:text-white tracking-wide"
                >
                    {isFileMode ? "Select Executable File" : "Select Media Folder"}
                </span>
            </div>
            <button
                class="btn-icon btn-icon-sm variant-ghost-surface rounded-lg"
                onclick={close}
                aria-label="Close"
            >
                <X class="h-4 w-4" />
            </button>
        </div>

        <!-- Address Bar -->
        <div
            class="flex items-center gap-2 px-4 py-2.5
			bg-gray-50/70 dark:bg-surface-700/70 backdrop-blur-md
			border-b border-gray-200 dark:border-surface-600"
        >
            <button
                class="btn-icon btn-icon-sm variant-ghost-surface rounded-lg disabled:opacity-30"
                disabled={pickerParentPath === null}
                onclick={() => {
                    if (pickerParentPath !== null)
                        loadPickerData(pickerParentPath);
                }}
                aria-label="Go up"
            >
                <ChevronLeft class="h-4 w-4" />
            </button>

            <!-- Path segments breadcrumb -->
            <input
                type="text"
                class="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-xs font-mono
				bg-white dark:bg-surface-900
				border border-gray-200 dark:border-surface-600
				text-gray-600 dark:text-gray-300 outline-none overflow-x-auto hide-scrollbar"
                style="mask-image: linear-gradient(to right, transparent, black 15px, black calc(100% - 15px), transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 15px, black calc(100% - 15px), transparent);"
                value={pickerCurrentPath}
                placeholder={isAtRoot ? "Selecting drive…" : "Enter path…"}
                onkeydown={(e) => {
                    if (e.key === "Enter") {
                        normalizeAndLoad((e.target as HTMLInputElement).value);
                    }
                }}
            />

            <button
                class="btn-icon btn-icon-sm variant-ghost-surface rounded-lg
					{isPickerLoading || isDrivesLoading
                    ? 'animate-spin opacity-50 pointer-events-none'
                    : ''}"
                onclick={() => {
                    onRefreshDrives?.();
                    if (!isAtRoot) {
                        loadPickerData(pickerCurrentPath, true);
                    }
                }}
                aria-label="Refresh"
            >
                <RotateCw class="h-4 w-4" />
            </button>
        </div>

        <!-- File List -->
        <div
            class="flex-1 overflow-y-scroll p-2 bg-white dark:bg-surface-800 custom-scroll"
        >
            {#if isPickerLoading || (isAtRoot && isDrivesLoading)}
                <ul class="flex flex-col gap-0.5 mt-2">
                    {#each [".", "..", "..."] as name, i}
                        <li class="skeleton-stagger" style="animation-delay: {i * 150}ms">
                            <div
                                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl opacity-40 cursor-default"
                            >
                                <span class="shrink-0" style="color: var(--color-primary-500);">
                                    <Folder class="h-4 w-4" />
                                </span>
                                <span
                                    class="flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-200"
                                >
                                    {name}
                                </span>
                            </div>
                        </li>
                    {/each}
                </ul>
            {:else if pickerError}
                <div
                    class="m-3 p-4 rounded-xl flex items-start gap-3
					bg-red-50 dark:bg-red-900/20
					border border-red-200 dark:border-red-700/50"
                >
                    <AlertCircle class="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <p
                        class="text-xs font-medium text-red-700 dark:text-red-300"
                    >
                        {pickerError}
                    </p>
                </div>
            {:else if pickerDirectories.length === 0}
                <div
                    class="flex flex-col items-center justify-center h-full gap-3 py-20 text-gray-400"
                >
                    <FolderX class="h-10 w-10 opacity-20" />
                    <span
                        class="text-xs font-medium tracking-widest uppercase opacity-40"
                        >Empty directory</span
                    >
                </div>
            {:else}
                <ul class="flex flex-col gap-0.5">
                    {#each pickerDirectories as dir}
                        {@const meta = getEntryMeta(dir, isAtRoot)}
                        <li>
                            <button
                                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left
									transition-all duration-100
									{selectedFilePath === dir.path ? 'bg-primary-500/10 ring-1 ring-primary-500' : 'hover:bg-gray-100 dark:hover:bg-surface-700'}
									active:scale-[0.99]
									{isPickerLoading ? 'pointer-events-none opacity-40' : ''}"
                                onclick={() => handleEntryClick(dir)}
                            >
                                <span class="shrink-0" style={meta.style}>
                                    {#if meta.icon === "drive"}
                                        <HardDrive class="h-4 w-4" />
                                    {:else if meta.icon === "folder"}
                                        <Folder class="h-4 w-4" />
                                    {:else if meta.icon === "archive"}
                                        <FileArchive class="h-4 w-4" />
                                    {:else if meta.icon === "media"}
                                        <Play class="h-4 w-4" />
                                    {:else}
                                        <FileText class="h-4 w-4" />
                                    {/if}
                                </span>

                                <span
                                    class="flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-200"
                                >
                                    {dir.name}
                                </span>

                                {#if dir.mediaType === 'cbz'}
                                    <span
                                        class="badge variant-filled-warning text-[10px] font-bold px-2 py-0.5 rounded-md"
                                    >
                                        CBZ
                                    </span>
                                {/if}
                            </button>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>

        <!-- Footer -->
        <div
            class="flex items-center justify-between px-4 py-3
			bg-gray-50/70 dark:bg-surface-700/70 backdrop-blur-md
			border-t border-gray-200 dark:border-surface-600"
        >
            <!-- Drive / root quick-nav chips -->
            <div
                class="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-[75%] py-3 px-3"
            >
                {#each availableDrives as drive}
                    {@const isActive = pickerCurrentPath.startsWith(drive.path)}
                    <button
                        class="chip shrink-0 text-[10px] font-bold h-9 px-3 min-w-[36px] flex items-center justify-center rounded-lg transition-all duration-200 whitespace-nowrap
							{isActive
                            ? 'variant-filled-primary ring-2 ring-inset ring-primary-500'
                            : 'bg-gray-200 dark:bg-surface-600 hover:bg-gray-300 dark:hover:bg-surface-500 text-gray-700 dark:text-gray-200 active:scale-95'}"
                        disabled={isPickerLoading}
                        onclick={() => loadPickerData(drive.path)}
                        title={drive.path}
                    >
                        {driveLabel(drive)}
                    </button>
                {/each}
            </div>
            
            {#if isDrivesLoading}
                <div
                    class="flex-1 flex items-center justify-center gap-1.5 px-2" style="color: color-mix(in srgb, var(--color-primary-500) 50%, transparent);"
                >
                    {#each [".", "..", "..."] as dot, i}
                        <span
                            class="skeleton-stagger text-xl font-black"
                            style="animation-delay: {i * 150}ms"
                        >
                            {dot}
                        </span>
                    {/each}
                </div>
            {/if}

            <!-- Actions -->
            <div class="flex items-center gap-2">
                <button
                    class="btn btn-sm variant-ghost-surface rounded-lg text-xs font-semibold px-4"
                    onclick={close}
                >
                    Cancel
                </button>
                <button
                    class="btn btn-sm variant-filled-primary rounded-lg text-xs font-bold px-5 disabled:opacity-40"
                    disabled={!canConfirm}
                    onclick={confirm}
                >
                    Select
                </button>
            </div>
        </div>
    </div>
</div>

<style>
    .custom-scroll::-webkit-scrollbar {
        width: 4px;
    }
    .custom-scroll::-webkit-scrollbar-track {
        background: rgba(128, 128, 128, 0.05);
    }
    .custom-scroll::-webkit-scrollbar-thumb {
        background: rgba(128, 128, 128, 0.4);
        border-radius: 99px;
    }
    .custom-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(128, 128, 128, 0.6);
    }
    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .hide-scrollbar {
        -ms-overflow-style: none; /* IE and Edge */
        scrollbar-width: none; /* Firefox */
    }
    .hide-scrollbar::-webkit-scrollbar {
        display: none; /* Chrome, Safari and Opera */
    }
    @keyframes skeleton-pulse {
        0%, 100% { opacity: 0.3; transform: scale(0.99); }
        50% { opacity: 0.7; transform: scale(1); }
    }
    .skeleton-stagger {
        animation: skeleton-pulse 1.2s infinite ease-in-out;
    }
</style>
