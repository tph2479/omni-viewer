import { tick } from "svelte";
import { pushState } from "$app/navigation";
import type { ImageFile } from "$lib/utils/utils";
import { toaster } from "$lib/stores/toaster";

const PAGE_SIZE = 42;
const COVER_PAGE_SIZE = 42;

type CoverFolder = { name: string; path: string; coverPath: string };
type PendingFile = { path: string; type: "media" | "cbz" | "pdf" } | null;
type MediaType = "all" | "images" | "videos" | "audio" | "ebook";
type SortType =
  | "date_desc"
  | "date_asc"
  | "name_asc"
  | "name_desc"
  | "size_asc"
  | "size_desc";
type SavedCoverState = {
  path: string;
  folders: CoverFolder[];
  total: number;
  page: number;
  hasMore: boolean;
  scrollPos: number;
} | null;

interface FolderState {
  path: string;
  isSelected: boolean;
  lastLoadedPath: string;
  pageHistory: Record<string, number>;
}

interface ContentState {
  items: ImageFile[];
  groupedData: any;
  isGrouped: boolean;
  totals: {
    images: number;
    videos: number;
    audio: number;
    ebook: number;
    media: number;
  };
}

interface PaginationState {
  currentPage: number;
  hasMore: boolean;
  pageSize: number;
  sort: SortType;
  mediaType: MediaType;
}

interface CoverModeState {
  enabled: boolean;
}

interface ModalState {
  image: { open: boolean; index: number };
  video: { open: boolean };
  audio: { open: boolean };
  pdf: { open: boolean; path: string };
  epub: { open: boolean; path: string };
  webtoon: { open: boolean; cbzPath: string; contextPath: string };
  folderPicker: { open: boolean };
}

interface UIState {
  isLoading: boolean;
  isDrivesLoading: boolean;
  error: string;
  exclusiveType: string | null;
  groupScrollPosition: number;
  lastOpenedFolder: string | null;
  lastOpenedFile: string | null;
  highlightedPath: string | null;
  pendingFile: PendingFile;
  noImagesPopup: { open: boolean; timer: any };
  availableDrives: any[];
}

export function createBrowserStore() {
  const folder: FolderState & { normalize: (p: string) => string } = $state({
    path: "",
    isSelected: false,
    lastLoadedPath: "",
    pageHistory: {},
    normalize: (p: string) => normalizePath(p),
  });

  const content: ContentState = $state({
    items: [],
    groupedData: null,
    isGrouped: false,
    totals: { images: 0, videos: 0, audio: 0, ebook: 0, media: 0 },
  });

  const pagination: PaginationState = $state({
    currentPage: 0,
    hasMore: false,
    pageSize: PAGE_SIZE,
    sort: "date_desc",
    mediaType: "all",
  });


  const coverMode: CoverModeState = $state({
    enabled: false,
    folders: [],
    total: 0,
    page: 0,
    hasMore: false,
    savedState: null,
    scrollPosition: 0,
  });

  const modal: ModalState = $state({
    image: { open: false, index: 0 },
    video: { open: false },
    audio: { open: false },
    pdf: { open: false, path: "" },
    epub: { open: false, path: "" },
    webtoon: {
      open: false,
      cbzPath: "",
      contextPath: "",
    },
    folderPicker: { open: false },
  });

  const ui: UIState = $state({
    isLoading: false,
    isDrivesLoading: false,
    error: "",
    exclusiveType: null,
    groupScrollPosition: 0,
    lastOpenedFolder: null,
    lastOpenedFile: null,
    highlightedPath: null,
    pendingFile: null,
    noImagesPopup: { open: false, timer: null },
    availableDrives: [],
  });

  function normalizePath(p: string) {
    if (!p) return p;
    let res = p.trim();
    // Strip double drive prefix: C:\C:\Users → C:\Users
    res = res.replace(/^([A-Za-z]:\\)\1+/i, '$1');
    if (res.length === 2 && res[1] === ":") {
      res += "\\";
    } else if (res.length > 3 && (res.endsWith("\\") || res.endsWith("/"))) {
      res = res.slice(0, -1);
    }
    return res;
  }

  async function refreshDrives(force = false) {
    if (!force && ui.availableDrives.length > 0) return;
    ui.isDrivesLoading = true;
    try {
      const res = await fetch("/api/file?action=directories&path=");
      if (res.ok) {
        const data = await res.json();
        ui.availableDrives = data.directories;
      }
    } catch (e) {
      console.error("Failed to load drives:", e);
    } finally {
      ui.isDrivesLoading = false;
    }
  }

  async function loadFolder(reset = true, pageToLoad = 0, append = false) {
    if (!folder.path.trim()) {
      if (ui.availableDrives.length === 0) await refreshDrives();
      // Auto-load first drive instead of opening picker
      if (ui.availableDrives.length > 0) {
        folder.path = ui.availableDrives[0].path;
        await loadFolder(reset, pageToLoad, append);
        return;
      }
      modal.folderPicker.open = true;
      return;
    }

    ui.isLoading = true;
    ui.error = "";

    // Start loading drives in parallel (for fallback)
    const drivesPromise = ui.availableDrives.length === 0
      ? refreshDrives()
      : Promise.resolve();

    const targetPath = normalizePath(folder.path);
    const targetId = ui.lastOpenedFolder
      ? `item-${ui.lastOpenedFolder.replace(/[^a-zA-Z0-9]/g, "-")}`
      : null;

    if (reset && targetPath !== folder.lastLoadedPath) {
      ui.exclusiveType = null;
    }
    folder.lastLoadedPath = targetPath;

    if (reset) {
      pagination.currentPage = pageToLoad;
      pagination.hasMore = false;
      content.items = [];
    } else {
      pagination.currentPage = pageToLoad;
      if (!append) content.items = [];
    }

    try {
      if (typeof window !== "undefined" && !append && !targetId) {
        const scrollContainer =
          document.querySelector(".drawer-content") ||
          document.scrollingElement;
        if (scrollContainer)
          scrollContainer.scrollTo({ top: 0, behavior: "instant" });
      }

      const exclusiveParam = ui.exclusiveType
        ? `&exclusiveType=${ui.exclusiveType}`
        : "";
      const res = await fetch(
        `/api/file?action=gallery&folder=${encodeURIComponent(targetPath)}&page=${pagination.currentPage}&limit=${pagination.pageSize}&sort=${pagination.sort}&type=${pagination.mediaType}&isCover=${coverMode.enabled}${exclusiveParam}`,
      );
      const data = await res.json();

      if (!res.ok)
        throw new Error(data.message || "Error fetching data from server.");

      content.isGrouped = data.isGrouped || false;
      if (content.isGrouped) {
        content.groupedData = data.groups;
        content.items = [];
      } else {
        content.groupedData = null;
        content.items = append
          ? [...content.items, ...data.images]
          : data.images;
      }

      if (reset) {
        folder.isSelected = true;
        localStorage.setItem("last-path", targetPath);
      }

      content.totals = {
        images: data.totalImages,
        videos: data.totalVideos,
        audio: data.totalAudio,
        ebook: data.totalEbook,
        media: data.total,
      };
      pagination.hasMore = data.hasMore;

      folder.pageHistory[targetPath] = pagination.currentPage;
      sessionStorage.setItem(
        "folder-history",
        JSON.stringify(folder.pageHistory),
      );

      if (targetId) {
        tick().then(() => {
          const el = document.getElementById(targetId);
          if (el) {
            el.scrollIntoView({ behavior: "instant", block: "center" });
            el.classList.add("ring-[1.5px]", "ring-primary", "z-10");
            setTimeout(
              () => el.classList.remove("ring-[1.5px]", "ring-primary", "z-10"),
              2500,
            );
          }
          ui.lastOpenedFolder = null;
        });
      }

      if (ui.pendingFile) {
        if (ui.pendingFile.type === "cbz") {
          openCbzInWebtoon(ui.pendingFile.path);
        } else if (ui.pendingFile.type === "pdf") {
          openPdfReader(ui.pendingFile.path);
        } else {
          const idx = content.items.findIndex(
            (img) => img.path === ui.pendingFile!.path,
          );
          if (idx !== -1) openModal(idx);
        }
        ui.pendingFile = null;
      }
    } catch (e: any) {
      // Don't show error — try to fall back to first available drive
      await drivesPromise;
      if (ui.availableDrives.length > 0) {
        const firstDrive = ui.availableDrives[0].path;
        if (firstDrive !== targetPath) {
          folder.path = firstDrive;
          folder.isSelected = false;
          localStorage.setItem("last-path", firstDrive);
          // Retry with the first drive
          await loadFolder(reset, pageToLoad, append);
          return;
        }
      }
      // No drives available or already on first drive — open picker
      ui.error = "";
      folder.isSelected = false;
      modal.folderPicker.open = true;
    } finally {
      ui.isLoading = false;
    }
  }

  function openModal(index: number, items?: ImageFile[]) {
    const sourceList = items || content.items;
    const img = sourceList[index];
    if (!img) return;

    if (items) content.items = items;
    modal.image.index = index;

    if (img.isVideo) {
      modal.video.open = true;
    } else if (img.isAudio) {
      modal.audio.open = true;
    } else if (img.isPdf) openPdfReader(img.path);
    else if (img.isEpub) {
      modal.epub.path = img.path;
      modal.epub.open = true;
    }
    else modal.image.open = true;
  }

  function openPdfReader(path: string) {
    modal.pdf.path = path;
    modal.pdf.open = true;
  }

  function closeAllModals() {
    modal.image.open = false;
    modal.video.open = false;
    modal.audio.open = false;
    modal.pdf.open = false;
    modal.epub.open = false;
    modal.webtoon.open = false;
  }

  function closePicker() {
    modal.folderPicker.open = false;
  }

  function openDir(dirPath: string, isGoingUp = false, isFromHistory = false) {
    const normalized = normalizePath(dirPath);
    ui.lastOpenedFolder = isGoingUp ? folder.path : null;

    if (!isFromHistory && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("path", normalized);
      pushState(url.toString(), {});
    }

    folder.path = normalized;
    localStorage.setItem("last-path", normalized);
    ui.exclusiveType = null;
    pagination.mediaType = "all";

    const savedPage = folder.pageHistory[normalized] || 0;
    loadFolder(true, savedPage);
  }

  function openCbzInWebtoon(cbzPath: string, context?: string) {
    modal.webtoon.cbzPath = cbzPath;
    modal.webtoon.contextPath = context || "";
    modal.webtoon.open = true;
  }

  function showNoImagesPopup() {
    toaster.create({
      type: "warning",
      title: "No Media Found",
      description: "Directory has no compatible files.",
    });
  }

  async function handleOpenWebtoon() {
    if (modal.webtoon.cbzPath) {
      modal.webtoon.open = true;
      return;
    }

    ui.isLoading = true;
    try {
      const imgRes = await fetch(
        `/api/file?action=gallery&folder=${encodeURIComponent(folder.path)}&page=0&limit=1&imagesOnly=true`,
      );
      const imgData = await imgRes.json();
      if (imgData.total > 0) {
        modal.webtoon.open = true;
        return;
      }

      showNoImagesPopup();
    } catch (e) {
      console.error(e);
    } finally {
      ui.isLoading = false;
    }
  }

  function navigateWebtoon(direction: 1 | -1) {
    const items = content.items;
    if (items.length === 0) return;

    const currentPath = modal.webtoon.cbzPath || folder.path;
    let currentIndex = items.findIndex(
      (item) => item.firstCbz === currentPath || item.path === currentPath,
    );

    if (currentIndex === -1) return;

    let targetIndex = currentIndex + direction;
    // Find next openable item
    while (targetIndex >= 0 && targetIndex < items.length) {
      const item = items[targetIndex];
      if (item.firstCbz || item.hasImages || item.isCbz) {
        openCbzInWebtoon(item.firstCbz || item.path);
        return;
      }
      targetIndex += direction;
    }
  }

  function handleToggleCoverMode() {
    coverMode.enabled = !coverMode.enabled;
    if (coverMode.enabled) {
      pagination.sort = "name_asc";
    }
    loadFolder(true, 0);
  }

  async function handleSwitchToPaginationToContinue() {
    const firstItem = content.items[0];
    if (!firstItem) return;

    let key = "images";
    if (firstItem.isVideo) key = "videos";
    else if (firstItem.isAudio) key = "audio";
    else if (firstItem.isPdf) key = "pdf";
    else if (firstItem.isCbz) key = "cbz";
    else if (firstItem.isEpub) key = "epub";

    const scrollContainer = document.querySelector(".drawer-content");
    if (scrollContainer) ui.groupScrollPosition = scrollContainer.scrollTop;
    ui.exclusiveType = key;
    await loadFolder(true, 0);
  }

  function handleExitGroupView() {
    ui.exclusiveType = null;
    loadFolder(true, 0).then(() => {
      tick().then(() => {
        const scrollContainer = document.querySelector(".drawer-content");
        if (scrollContainer)
          scrollContainer.scrollTo({
            top: ui.groupScrollPosition,
            behavior: "instant",
          });
      });
    });
  }

  function handleOpenGroup(type: string) {
    const scrollContainer = document.querySelector(".drawer-content");
    if (scrollContainer) ui.groupScrollPosition = scrollContainer.scrollTop;
    ui.exclusiveType = type;
    loadFolder(true, 0);
  }

  function setSort(sort: SortType) {
    pagination.sort = sort;
    loadFolder(true, 0);
  }

  function setMediaType(type: MediaType) {
    pagination.mediaType = type;
    loadFolder(true, 0);
  }

  function loadNextPage(page: number) {
    loadFolder(false, page);
  }

  return {
    get folder() { return folder; },
    get content() { return content; },
    get pagination() { return pagination; },
    get cover() { return coverMode; },
    get modal() { return modal; },
    get ui() { return ui; },
    
    // Actions/Methods
    actions: {
      openDir,
      loadFolder,
      refreshDrives: (force = true) => refreshDrives(force),
      setSort,
      setMediaType,
      loadNextPage,
      closePicker,
      openModal,
      closeAllModals,
      openPdfReader,
      openCbzInWebtoon,
      handleOpenWebtoon,
      handleToggleCoverMode,
      handleSwitchToPaginationToContinue,
      handleExitGroupView,
      handleOpenGroup,
    },

    reset() {
      content.items = [];
      content.totals = { images: 0, videos: 0, audio: 0, ebook: 0, media: 0 };
      pagination.currentPage = 0;
      pagination.hasMore = false;
      folder.path = "";
      folder.isSelected = false;
    },
  };
}

export const browserStore = createBrowserStore();
