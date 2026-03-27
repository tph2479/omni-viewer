import { tick } from "svelte";
import type { ImageFile } from "$lib/utils/utils";

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
  folders: CoverFolder[];
  total: number;
  page: number;
  hasMore: boolean;
  savedState: SavedCoverState;
  scrollPosition: number;
}

interface ModalState {
  image: { open: boolean; index: number };
  video: { open: boolean };
  audio: { open: boolean };
  pdf: { open: boolean; path: string };
  webtoon: { open: boolean; cbzPath: string };
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
  const folder: FolderState = $state({
    path: "",
    isSelected: false,
    lastLoadedPath: "",
    pageHistory: {},
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
    webtoon: { open: false, cbzPath: "" },
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
    if (res.length === 2 && res[1] === ":") {
      res += "\\";
    } else if (res.length > 3 && (res.endsWith("\\") || res.endsWith("/"))) {
      res = res.slice(0, -1);
    }
    return res;
  }

  async function refreshDrives() {
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
      if (ui.availableDrives.length === 0) refreshDrives();
      modal.folderPicker.open = true;
      return;
    }

    ui.isLoading = true;
    ui.error = "";

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
        `/api/file?action=gallery&folder=${encodeURIComponent(targetPath)}&page=${pagination.currentPage}&limit=${pagination.pageSize}&sort=${pagination.sort}&type=${pagination.mediaType}${exclusiveParam}`,
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
      ui.error = e.message;
      if (reset) folder.isSelected = false;
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
    else if (img.isEpub) console.log("EPUB clicked:", img.path);
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
    modal.webtoon.open = false;
  }

  function openDir(dirPath: string, isGoingUp = false) {
    const normalized = normalizePath(dirPath);
    ui.lastOpenedFolder = isGoingUp ? folder.path : null;

    folder.path = normalized;
    localStorage.setItem("last-path", normalized);
    ui.exclusiveType = null;
    pagination.mediaType = "all";
    coverMode.enabled = false;
    coverMode.folders = [];

    const savedPage = folder.pageHistory[normalized] || 0;
    loadFolder(true, savedPage);
  }

  function openCbzInWebtoon(cbzPath: string) {
    modal.webtoon.cbzPath = cbzPath;
    modal.webtoon.open = true;
  }

  function showNoImagesPopup() {
    ui.noImagesPopup.open = true;
    if (ui.noImagesPopup.timer) clearTimeout(ui.noImagesPopup.timer);
    ui.noImagesPopup.timer = setTimeout(() => {
      ui.noImagesPopup.open = false;
      ui.noImagesPopup.timer = null;
    }, 3000);
  }

  async function handleOpenWebtoon() {
    if (coverMode.enabled) {
      coverMode.enabled = false;
      coverMode.folders = [];
      return;
    }

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

      const coverRes = await fetch(
        `/api/file?action=covers&folder=${encodeURIComponent(folder.path)}&page=0&limit=${COVER_PAGE_SIZE}`,
      );
      const coverData = await coverRes.json();
      if (coverData.total > 0) {
        coverMode.folders = coverData.folders;
        coverMode.total = coverData.total;
        coverMode.page = 0;
        coverMode.hasMore = coverData.hasMore;
        coverMode.enabled = true;
        return;
      }

      showNoImagesPopup();
    } catch (e) {
      console.error(e);
    } finally {
      ui.isLoading = false;
    }
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

  function saveCoverState() {
    const scrollContainer = document.querySelector(".drawer-content");
    if (scrollContainer) coverMode.scrollPosition = scrollContainer.scrollTop;
    coverMode.savedState = {
      path: normalizePath(folder.path),
      folders: [...coverMode.folders],
      total: coverMode.total,
      page: coverMode.page,
      hasMore: coverMode.hasMore,
      scrollPos: coverMode.scrollPosition,
    };
  }

  function handleCoverFolderClick(path: string) {
    const scrollContainer = document.querySelector(".drawer-content");
    if (scrollContainer) coverMode.scrollPosition = scrollContainer.scrollTop;
    coverMode.savedState = {
      path: normalizePath(folder.path),
      folders: [...coverMode.folders],
      total: coverMode.total,
      page: coverMode.page,
      hasMore: coverMode.hasMore,
      scrollPos: coverMode.scrollPosition,
    };
    coverMode.enabled = false;
    coverMode.folders = [];
    openDir(path);
  }

  function exitCoverMode() {
    coverMode.enabled = false;
    coverMode.folders = [];
  }

  async function loadCoverPage(page: number) {
    ui.isLoading = true;
    try {
      const res = await fetch(
        `/api/file?action=covers&folder=${encodeURIComponent(folder.path)}&page=${page}&limit=${COVER_PAGE_SIZE}`,
      );
      const data = await res.json();
      coverMode.folders = data.folders;
      coverMode.page = page;
      coverMode.hasMore = data.hasMore;
    } catch (e) {
      console.error(e);
    } finally {
      ui.isLoading = false;
    }
  }

  function loadNextPage(page: number) {
    loadFolder(false, page);
  }

  return {
    folder: {
      get path() { return folder.path; },
      set path(v) { folder.path = v; },
      get isSelected() { return folder.isSelected; },
      get lastLoadedPath() { return folder.lastLoadedPath; },
      get pageHistory() { return folder.pageHistory; },
      set pageHistory(v) { folder.pageHistory = v; },
      normalize: normalizePath,
      open: openDir,
    },
    content: {
      get items() { return content.items; },
      set items(v) { content.items = v; },
      get groupedData() { return content.groupedData; },
      get isGrouped() { return content.isGrouped; },
      get totals() { return content.totals; },
    },
    pagination: {
      get page() { return pagination.currentPage; },
      set page(v) { pagination.currentPage = v; },
      get hasMore() { return pagination.hasMore; },
      get size() { return pagination.pageSize; },
      get sort() { return pagination.sort; },
      set sort(v) { pagination.sort = v; },
      get type() { return pagination.mediaType; },
      set type(v) { pagination.mediaType = v; },
      loadNext: loadNextPage,
      setSort,
      setType: setMediaType,
    },
    cover: {
      get enabled() { return coverMode.enabled; },
      set enabled(v) { coverMode.enabled = v; },
      get folders() { return coverMode.folders; },
      set folders(v) { coverMode.folders = v; },
      get total() { return coverMode.total; },
      set total(v) { coverMode.total = v; },
      get page() { return coverMode.page; },
      set page(v) { coverMode.page = v; },
      get hasMore() { return coverMode.hasMore; },
      set hasMore(v) { coverMode.hasMore = v; },
      get savedState() { return coverMode.savedState; },
      set savedState(v) { coverMode.savedState = v; },
      get scrollPos() { return coverMode.scrollPosition; },
      handleClick: handleCoverFolderClick,
      exit: exitCoverMode,
      loadPage: loadCoverPage,
      saveState: saveCoverState,
    },
    modal: {
      get image() { return modal.image; },
      get video() { return modal.video; },
      get audio() { return modal.audio; },
      get pdf() { return modal.pdf; },
      get webtoon() { return modal.webtoon; },
      get webtoonActivePath() { return modal.webtoon.cbzPath || folder.path; },
      get picker() { return modal.folderPicker; },
      open: openModal,
      closeAll: closeAllModals,
      openPdf: openPdfReader,
      openCbz: openCbzInWebtoon,
    },
    ui: {
      get loading() { return ui.isLoading; },
      get drivesLoading() { return ui.isDrivesLoading; },
      get error() { return ui.error; },
      set error(v) { ui.error = v; },
      get exclusiveType() { return ui.exclusiveType; },
      get groupScrollPos() { return ui.groupScrollPosition; },
      get lastFolder() { return ui.lastOpenedFolder; },
      get lastFile() { return ui.lastOpenedFile; },
      set lastFile(v) { ui.lastOpenedFile = v; },
      get highlightedPath() { return ui.highlightedPath; },
      set highlightedPath(v) { ui.highlightedPath = v; },
      get pendingFile() { return ui.pendingFile; },
      set pendingFile(v) { ui.pendingFile = v; },
      get popup() { return ui.noImagesPopup; },
      get drives() { return ui.availableDrives; },
      refreshDrives,
      showPopup: showNoImagesPopup,
      loadFolder,
      handleOpenWebtoon,
      continueToPagination: handleSwitchToPaginationToContinue,
      exitGroupView: handleExitGroupView,
      openGroup: handleOpenGroup,
    },
    reset() {
      content.items = [];
      content.totals = { images: 0, videos: 0, audio: 0, ebook: 0, media: 0 };
      pagination.currentPage = 0;
      pagination.hasMore = false;
      folder.isSelected = false;
    },
  };
}

export const browserStore = createBrowserStore();
