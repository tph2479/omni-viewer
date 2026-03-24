<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import GalleryToolbar from "./components/toolbar/GalleryToolbar.svelte";
    import GalleryGrid from "./components/grid/GalleryGrid.svelte";
    import EmptyState from "./components/grid/EmptyState.svelte";
    import GroupViewHeader from "./components/grid/GroupViewHeader.svelte";
    import GalleryModals from "./components/modals/GalleryModals.svelte";
    import type { ImageFile } from "./components/utils/utils";
    import { BadgeAlert, Pin } from "lucide-svelte";

    // ── Core state ────────────────────────────────────────────────────────────
    let folderPath = $state("");
    let isFolderSelected = $state(false);
    let isLoading = $state(false);
    let errorMsg = $state("");

    let loadedImages: ImageFile[] = $state([]);
    let totalImagesCount = $state(0);
    let totalVideosCount = $state(0);
    let totalAudioCount = $state(0);
    let totalEbookCount = $state(0);
    let totalMedia = $state(0);
    let currentPage = $state(0);
    const PAGE_SIZE = 60;
    let hasMore = $state(false);

    let currentSort = $state("date_desc");
    let mediaType = $state<"all" | "images" | "videos" | "audio" | "ebook">(
        "all",
    );

    /** Persistent drives list loaded ONCE on start */
    let availableDrives = $state<any[]>([]);

    // ── Modal / view state ────────────────────────────────────────────────────
    let isImageModalOpen = $state(false);
    let isVideoModalOpen = $state(false);
    let isAudioModalOpen = $state(false);
    let isPdfReaderOpen = $state(false);
    let selectedImageIndex = $state(0);
    let isWebtoonMode = $state(false);
    let isFolderPickerOpen = $state(false);
    let isDrivesLoading = $state(false);
    let isNoImagesPopupOpen = $state(false);
    let noImagesPopupTimer: any = $state(null);

    let webtoonCbzPath = $state("");

    // Cover folder browsing state
    type CoverFolder = { name: string; path: string; coverPath: string };
    let coverFolders = $state<CoverFolder[]>([]);
    let coverFoldersTotal = $state(0);
    let coverFoldersPage = $state(0);
    let coverFoldersHasMore = $state(false);
    let isCoverMode = $state(false);
    const COVER_PAGE_SIZE = 60;
    let savedCoverState: {
        path: string;
        folders: CoverFolder[];
        total: number;
        page: number;
        hasMore: boolean;
        scrollPos: number;
    } | null = $state(null);
    let selectedPdfPath = $state("");
    let pendingFile = $state<{
        path: string;
        type: "media" | "cbz" | "pdf";
    } | null>(null);
    let lastOpenedFolder = $state<string | null>(null);
    let lastOpenedFile = $state<string | null>(null);

    /** Track page number for each folder to remember when going back/down */
    let folderPageHistory: Record<string, number> = $state({});

    /** The path actually fed to WebtoonReader */
    const webtoonActivePath = $derived(webtoonCbzPath || folderPath);

    let isPinned = $state(true);
    let showHeader = $state(true);

    let isGrouped = $state(false);
    let groupedData = $state<any>(null);
    let currentExclusiveType = $state<string | null>(null);
    let lastLoadedPath = $state("");
    let groupScrollPosition = $state(0);
    let coverScrollPosition = $state(0);

    $effect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isPinned) return;

            // Chỉ hiện khi chuột nằm ở vùng 10% trên cùng của màn hình
            if (e.clientY < window.innerHeight * 0.1) {
                showHeader = true;
            } else {
                showHeader = false;
            }
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
        };
    });

    $effect(() => {
        if (isPinned) {
            showHeader = true;
        }
    });

    // Track the current file being viewed to highlight it when modal closes
    $effect(() => {
        if (isImageModalOpen || isVideoModalOpen) {
            const item = loadedImages[selectedImageIndex];
            if (item) lastOpenedFile = item.path;
        } else if (isWebtoonMode && webtoonCbzPath) {
            lastOpenedFile = webtoonCbzPath;
        } else if (isPdfReaderOpen && selectedPdfPath) {
            lastOpenedFile = selectedPdfPath;
        }
    });

    // Trigger highlight when modals are closed
    let wasModalOpen = false;
    $effect(() => {
        const isAnyModalOpen =
            isImageModalOpen ||
            isVideoModalOpen ||
            isWebtoonMode ||
            isAudioModalOpen ||
            isPdfReaderOpen;
        if (wasModalOpen && !isAnyModalOpen && lastOpenedFile) {
            const targetId = `item-${lastOpenedFile.replace(/[^a-zA-Z0-9]/g, "-")}`;
            tick().then(() => {
                const el = document.getElementById(targetId);
                if (el) {
                    el.scrollIntoView({ behavior: "instant", block: "center" });
                    el.classList.add("ring-[1.5px]", "ring-primary", "z-10");
                    setTimeout(() => {
                        el.classList.remove(
                            "ring-[1.5px]",
                            "ring-primary",
                            "z-10",
                        );
                    }, 2500);
                }
            });
            lastOpenedFile = null;
        }
        wasModalOpen = isAnyModalOpen;
    });

    async function refreshDrives() {
        isDrivesLoading = true;
        try {
            const res = await fetch("/api/file?action=directories&path=");
            const data = await res.json();
            if (res.ok) availableDrives = data.directories;
        } catch (e) {
            console.error("Failed to load drives:", e);
        } finally {
            isDrivesLoading = false;
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    onMount(async () => {
        const saved = localStorage.getItem("last-path");
        if (saved) folderPath = saved;

        const savedHistory = sessionStorage.getItem("folder-history");
        if (savedHistory) {
            try {
                folderPageHistory = JSON.parse(savedHistory);
            } catch (e) {
                console.error("Failed to parse folder history");
            }
        }

        // Load drives ONCE on startup
        await refreshDrives();

        // Auto load last folder if exists
        if (folderPath && folderPath !== "C:\\Users") {
            folderPath = normalizePath(folderPath); // Ensure path is normalized
            const savedPage = folderPageHistory[folderPath] || 0;
            loadFolder(true, savedPage);
        }
    });

    // Handle orientation change for responsive grid
    function handleOrientationChange() {
        window.dispatchEvent(new Event("resize"));
    }

    onMount(() => {
        window.addEventListener("orientationchange", handleOrientationChange);
        return () => {
            window.removeEventListener(
                "orientationchange",
                handleOrientationChange,
            );
        };
    });

    onDestroy(() => {
        loadedImages = [];
        totalImagesCount = 0;
        totalVideosCount = 0;
        totalAudioCount = 0;
        totalEbookCount = 0;
        totalMedia = 0;
        currentPage = 0;
        hasMore = false;
        isFolderSelected = false;
    });

    function normalizePath(p: string) {
        if (!p) return p;
        let res = p.trim();
        if (res.length === 2 && res[1] === ":") {
            res += "\\";
        } else if (
            res.length > 3 &&
            (res.endsWith("\\") || res.endsWith("/"))
        ) {
            res = res.slice(0, -1);
        }
        return res;
    }

    // ── Data loading ──────────────────────────────────────────────────────────
    async function loadFolder(reset = true, pageToLoad = 0, append = false) {
        if (!folderPath.trim()) {
            errorMsg = "Please enter a directory path.";
            return;
        }

        isLoading = true;
        errorMsg = "";

        // Capture and normalize path at the start to avoid race conditions
        folderPath = normalizePath(folderPath);
        const targetPath = folderPath;
        const targetId = lastOpenedFolder
            ? `item-${lastOpenedFolder.replace(/[^a-zA-Z0-9]/g, "-")}`
            : null;

        // Reset exclusive type filter when navigating to a different folder
        if (reset && targetPath !== lastLoadedPath) {
            currentExclusiveType = null;
        }
        lastLoadedPath = targetPath;

        if (reset) {
            currentPage = pageToLoad;
            hasMore = false;
            loadedImages = [];
        } else {
            currentPage = pageToLoad;
            if (!append) loadedImages = [];
        }

        try {
            // Scroll to top by default if not targeting an item
            if (typeof window !== "undefined" && !append && !targetId) {
                const scrollContainer =
                    document.querySelector(".drawer-content");
                if (scrollContainer)
                    scrollContainer.scrollTo({ top: 0, behavior: "instant" });
                else window.scrollTo({ top: 0, behavior: "instant" });
            }

            const res = await fetch(
                `/api/file?action=gallery&folder=${encodeURIComponent(targetPath)}&page=${currentPage}&limit=${PAGE_SIZE}&sort=${currentSort}&type=${mediaType}${currentExclusiveType ? "&exclusiveType=" + currentExclusiveType : ""}`,
            );
            const data = await res.json();

            if (!res.ok)
                throw new Error(
                    data.message || "Error fetching data from server.",
                );

            isGrouped = data.isGrouped || false;
            if (isGrouped) {
                groupedData = data.groups;
                loadedImages = [];
            } else {
                groupedData = null;
                loadedImages = append
                    ? [...loadedImages, ...data.images]
                    : data.images;
            }

            if (reset) {
                isFolderSelected = true;
                // Path is already normalized above
                localStorage.setItem("last-path", targetPath);
            }

            totalImagesCount = data.totalImages;
            totalVideosCount = data.totalVideos;
            totalAudioCount = data.totalAudio;
            totalEbookCount = data.totalEbook;
            totalMedia = data.total;
            hasMore = data.hasMore;

            // Save current state to history using the CAPTURED path
            folderPageHistory[targetPath] = currentPage;
            sessionStorage.setItem(
                "hello-folder-history",
                JSON.stringify(folderPageHistory),
            );

            // Logic cuộn về vị trí cũ
            if (targetId) {
                tick().then(() => {
                    const el = document.getElementById(targetId);
                    if (el) {
                        el.scrollIntoView({
                            behavior: "instant",
                            block: "center",
                        });
                        // Static prominent highlight (disappears after 2.5s)
                        el.classList.add(
                            "ring-[1.5px]",
                            "ring-primary",
                            "z-10",
                        );
                        setTimeout(() => {
                            el.classList.remove(
                                "ring-[1.5px]",
                                "ring-primary",
                                "z-10",
                            );
                        }, 2500);
                    }
                    lastOpenedFolder = null; // Clear after use
                });
            }

            // ... rest of pendingFile logic ...
            if (pendingFile) {
                if (pendingFile.type === "cbz") {
                    openCbzInWebtoon(pendingFile.path);
                } else if (pendingFile.type === "pdf") {
                    openPdfReader(pendingFile.path);
                } else {
                    const idx = loadedImages.findIndex(
                        (img) => img.path === pendingFile!.path,
                    );
                    if (idx !== -1) openModal(idx);
                }
                pendingFile = null;
            }
        } catch (e: any) {
            errorMsg = e.message;
            if (reset) isFolderSelected = false;
        } finally {
            isLoading = false;
        }
    }

    function openModal(index: number, items?: ImageFile[]) {
        const sourceList = items || loadedImages;
        const img = sourceList[index];
        if (!img) return;

        if (items) {
            loadedImages = items;
        }

        selectedImageIndex = index;
        if (img.isVideo) {
            isVideoModalOpen = true;
        } else if (img.isAudio) {
            isAudioModalOpen = true;
        } else if (img.isPdf) {
            openPdfReader(img.path);
        } else if (img.isEpub) {
            // EPUB reader not implemented yet, maybe show a message or just ignore
            console.log("EPUB clicked:", img.path);
        } else {
            isImageModalOpen = true;
        }
    }

    function openPdfReader(path: string) {
        selectedPdfPath = path;
        isPdfReaderOpen = true;
    }

    function openDir(dirPath: string, isGoingUp = false) {
        const normalized = normalizePath(dirPath);
        if (isGoingUp) {
            lastOpenedFolder = folderPath;
        } else {
            lastOpenedFolder = null;
        }

        folderPath = normalized;
        localStorage.setItem("last-path", normalized);
        currentExclusiveType = null;
        mediaType = "all";
        isCoverMode = false;
        coverFolders = [];

        // Restore page if it exists in history
        const savedPage = folderPageHistory[normalized] || 0;
        loadFolder(true, savedPage);
    }

    function openCbzInWebtoon(cbzPath: string) {
        webtoonCbzPath = cbzPath;
        isWebtoonMode = true;
    }

    function showPopup() {
        isNoImagesPopupOpen = true;
        if (noImagesPopupTimer) clearTimeout(noImagesPopupTimer);
        noImagesPopupTimer = setTimeout(() => {
            isNoImagesPopupOpen = false;
            noImagesPopupTimer = null;
        }, 3000);
    }

    async function handleOpenWebtoon() {
        if (isCoverMode) {
            isCoverMode = false;
            coverFolders = [];
            return;
        }

        if (webtoonCbzPath) {
            isWebtoonMode = true;
            return;
        }

        isLoading = true;
        try {
            // Step 1: Check if folder has images → open webtoon
            const imgRes = await fetch(
                `/api/file?action=gallery&folder=${encodeURIComponent(folderPath)}&page=0&limit=1&imagesOnly=true`,
            );
            const imgData = await imgRes.json();
            if (imgData.total > 0) {
                isWebtoonMode = true;
                return;
            }

            // Step 2: No images → check subfolders for covers
            const coverRes = await fetch(
                `/api/file?action=covers&folder=${encodeURIComponent(folderPath)}&page=0&limit=${COVER_PAGE_SIZE}`,
            );
            const coverData = await coverRes.json();
            if (coverData.total > 0) {
                coverFolders = coverData.folders;
                coverFoldersTotal = coverData.total;
                coverFoldersPage = 0;
                coverFoldersHasMore = coverData.hasMore;
                isCoverMode = true;
                return;
            }

            // Step 3: No images and no covers → show popup
            showPopup();
        } catch (e) {
            console.error(e);
        } finally {
            isLoading = false;
        }
    }

    function handleWebtoonClose() {
        webtoonCbzPath = "";
    }

    function handleOpenGroup(type: string) {
        const scrollContainer = document.querySelector(".drawer-content");
        if (scrollContainer) groupScrollPosition = scrollContainer.scrollTop;
        currentExclusiveType = type;
        loadFolder(true, 0); // Always start at page 0 for exclusive view
    }

    function handleExitGroupView() {
        currentExclusiveType = null;
        loadFolder(true, 0).then(() => {
            tick().then(() => {
                const scrollContainer =
                    document.querySelector(".drawer-content");
                if (scrollContainer)
                    scrollContainer.scrollTo({
                        top: groupScrollPosition,
                        behavior: "instant",
                    });
            });
        });
    }

    async function handleSwitchToPaginationToContinue() {
        const firstItem = loadedImages[0];
        if (!firstItem) return;

        let key = "images";
        if (firstItem.isVideo) key = "videos";
        else if (firstItem.isAudio) key = "audio";
        else if (firstItem.isPdf) key = "pdf";
        else if (firstItem.isCbz) key = "cbz";
        else if (firstItem.isEpub) key = "epub";

        const scrollContainer = document.querySelector(".drawer-content");
        if (scrollContainer) groupScrollPosition = scrollContainer.scrollTop;
        currentExclusiveType = key;
        await loadFolder(true, 0);
    }
</script>

<div class="flex flex-col relative w-full h-full">
    <!-- Sticky Header -->
    <header
        class="sticky top-0 z-100 bg-surface-100-900
               px-0 py-0 shadow-md h-16
               transition-transform duration-300 rounded-b-lg
               {showHeader ? 'translate-y-0' : '-translate-y-full'}"
    >
        <div
            class="flex flex-row items-stretch min-h-full overflow-visible
"
        >
            <GalleryToolbar
                bind:folderPath
                bind:currentSort
                bind:mediaType
                {isLoading}
                {isFolderSelected}
                {isGrouped}
                {loadedImages}
                totalItems={isCoverMode ? coverFoldersTotal : totalMedia}
                totalImages={isCoverMode ? 0 : totalImagesCount}
                totalVideos={isCoverMode ? 0 : totalVideosCount}
                totalAudio={isCoverMode ? 0 : totalAudioCount}
                totalEbook={isCoverMode ? 0 : totalEbookCount}
                onLoad={() => {
                    const savedPage = folderPageHistory[folderPath] || 0;
                    loadFolder(true, savedPage);
                }}
                onOpenPicker={() => (isFolderPickerOpen = true)}
                onOpenWebtoon={handleOpenWebtoon}
                onGoUp={async (path) => {
                    if (savedCoverState && savedCoverState.path === path) {
                        isCoverMode = true;
                        coverFolders = savedCoverState.folders;
                        coverFoldersTotal = savedCoverState.total;
                        coverFoldersPage = savedCoverState.page;
                        coverFoldersHasMore = savedCoverState.hasMore;
                        const restoredScrollPos = savedCoverState.scrollPos;
                        savedCoverState = null;
                        folderPath = path;
                        tick().then(() => {
                            const scrollContainer =
                                document.querySelector(".drawer-content");
                            if (scrollContainer)
                                scrollContainer.scrollTo({
                                    top: restoredScrollPos,
                                    behavior: "instant",
                                });
                        });
                        return;
                    }
                    openDir(path, true);
                }}
            />
            <button
                onclick={() => {
                    isPinned = !isPinned;
                }}
                class="btn-icon btn-sm shrink-0 self-center mx-1"
                title={isPinned ? "Unpin Header" : "Pin Header (Always Show)"}
                onmousedown={(e) => e.preventDefault()}
            >
                <Pin size={20} />
            </button>
        </div>
    </header>

    <div class="p-4 sm:p-6 flex-1 flex flex-col">
        <!-- Error banner -->
        {#if errorMsg}
            <aside
                class="flex items-center gap-3
                          preset-filled-error-500
                          text-xs py-2 px-4 mb-6
                          rounded-xl w-full"
            >
                <BadgeAlert size={18} class="shrink-0" />
                <span class="font-bold tracking-tight uppercase"
                    >{errorMsg}</span
                >
            </aside>
        {/if}

        <!-- Views -->
        {#if !isFolderSelected && !isLoading && !errorMsg}
            <EmptyState onOpenPicker={() => (isFolderPickerOpen = true)} />
        {:else if isFolderSelected}
            {#if currentExclusiveType}
                <GroupViewHeader
                    {currentExclusiveType}
                    onExit={handleExitGroupView}
                />
            {/if}

            <GalleryGrid
                bind:loadedImages
                {isGrouped}
                {groupedData}
                totalImages={totalMedia}
                {currentPage}
                {hasMore}
                {isLoading}
                {PAGE_SIZE}
                onOpenModal={openModal}
                onOpenCbz={openCbzInWebtoon}
                onOpenDir={openDir}
                onLoadPage={(page) => loadFolder(false, page)}
                onOpenGroup={handleOpenGroup}
                {coverFolders}
                {coverFoldersTotal}
                {coverFoldersPage}
                {coverFoldersHasMore}
                {isCoverMode}
                onExitCoverMode={() => {
                    isCoverMode = false;
                    coverFolders = [];
                }}
                onCoverFolderClick={(path) => {
                    const scrollContainer =
                        document.querySelector(".drawer-content");
                    if (scrollContainer)
                        coverScrollPosition = scrollContainer.scrollTop;
                    savedCoverState = {
                        path: normalizePath(folderPath),
                        folders: [...coverFolders],
                        total: coverFoldersTotal,
                        page: coverFoldersPage,
                        hasMore: coverFoldersHasMore,
                        scrollPos: coverScrollPosition,
                    };
                    isCoverMode = false;
                    coverFolders = [];
                    openDir(path);
                }}
                onLoadCoverPage={async (page) => {
                    isLoading = true;
                    try {
                        const res = await fetch(
                            `/api/file?action=covers&folder=${encodeURIComponent(folderPath)}&page=${page}&limit=${COVER_PAGE_SIZE}`,
                        );
                        const data = await res.json();
                        coverFolders = data.folders;
                        coverFoldersPage = page;
                        coverFoldersHasMore = data.hasMore;
                    } catch (e) {
                        console.error(e);
                    } finally {
                        isLoading = false;
                    }
                }}
            />
        {/if}
    </div>
</div>

<!-- Modals -->
<GalleryModals
    bind:mediaType
    bind:isWebtoonMode
    {webtoonActivePath}
    {handleWebtoonClose}
    bind:isImageModalOpen
    bind:selectedImageIndex
    bind:loadedImages
    {totalImagesCount}
    {hasMore}
    {currentPage}
    {loadFolder}
    bind:isPdfReaderOpen
    bind:selectedPdfPath
    bind:isVideoModalOpen
    {totalVideosCount}
    bind:isAudioModalOpen
    {totalAudioCount}
    bind:isCoverMode
    bind:coverFolders
    bind:isFolderPickerOpen
    bind:folderPath
    {availableDrives}
    {isDrivesLoading}
    {refreshDrives}
    {folderPageHistory}
    onOpenFile={(path, type) => {
        pendingFile = { path, type };
    }}
    bind:isNoImagesPopupOpen
    bind:noImagesPopupTimer
    {isGrouped}
    onSwitchToPagination={handleSwitchToPaginationToContinue}
/>
