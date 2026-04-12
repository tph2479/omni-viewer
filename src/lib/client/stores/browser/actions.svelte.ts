import { tick } from "svelte";
import { pushState } from "$app/navigation";
import { toaster } from "$lib/client/stores/ui/toaster";
import { api } from '$lib/client/api/client';
import type { MediaFile, SortType, FilterType } from "./types";
import type { BrowserStore } from "./index.svelte.js";

export function createActions(store: BrowserStore) {
  const { folder, content, pagination, ui, modal, cover } = store;

  async function refreshDrives(force = false) {
    if (!force && ui.availableDrives.length > 0) return;
    ui.isDrivesLoading = true;
    try {
      const data = await api.getNavigation();
      ui.availableDrives = data.directories.map((d: any) => ({
        name: d.name,
        path: d.absolutePath || d.path,
        mediaType: 'directory'
      }));
    } catch (e) {
      console.error("Failed to load drives:", e);
    } finally {
      ui.isDrivesLoading = false;
    }
  }

  async function loadFolder(reset = true, pageToLoad = 0, append = false) {
    if (!folder.path.trim()) {
      if (ui.availableDrives.length === 0) await refreshDrives();
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

    const drivesPromise = ui.availableDrives.length === 0
      ? refreshDrives()
      : Promise.resolve();

    const targetPath = folder.normalize(folder.path);
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

      const data = await api.getGallery(targetPath, {
        page: pagination.currentPage,
        limit: pagination.pageSize,
        sort: pagination.sort,
        type: pagination.mediaType,
        isCover: cover.enabled,
        exclusiveType: ui.exclusiveType,
      });

      content.isGrouped = data.isGrouped || false;
      if (content.isGrouped) {
        content.groupedData = data.groups;
        content.items = [];
      } else {
        content.groupedData = null;
        content.items = append
          ? [...content.items, ...data.items]
          : data.items;
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
            el.classList.add("ring-[1.5px]", "ring-primary-300", "z-10");
            setTimeout(
              () => el.classList.remove("ring-[1.5px]", "ring-primary-300", "z-10"),
              2500,
            );
          }
          ui.lastOpenedFolder = null;
        });
      }

      if (ui.pendingFile) {
        ui.lastOpenedFile = ui.pendingFile.path;
        if (ui.pendingFile.type === "archive") {
          modal.openArchive(ui.pendingFile.path);
        } else if (ui.pendingFile.type === "pdf") {
          modal.openPdf(ui.pendingFile.path);
        } else {
          const idx = content.items.findIndex(
            (item: MediaFile) => item.path === ui.pendingFile!.path,
          );
          if (idx !== -1) openModal(idx);
        }
        ui.pendingFile = null;
      }
    } catch (e: any) {
      await drivesPromise;
      if (ui.availableDrives.length > 0) {
        const firstDrive = ui.availableDrives[0].path;
        if (firstDrive !== targetPath) {
          folder.path = firstDrive;
          folder.isSelected = false;
          localStorage.setItem("last-path", firstDrive);
          await loadFolder(reset, pageToLoad, append);
          return;
        }
      }
      ui.error = "";
      folder.isSelected = false;
      modal.folderPicker.open = true;
    } finally {
      ui.isLoading = false;
    }
  }

  function openModal(index: number, items?: MediaFile[]) {
    const sourceList = items || content.items;
    const item = sourceList[index];
    if (!item) return;

    if (items) content.items = items;
    modal.image.index = index;
    ui.lastOpenedFile = item.path;

    if (item.mediaType === 'video') modal.video.open = true;
    else if (item.mediaType === 'audio') modal.audio.open = true;
    else if (item.mediaType === 'pdf') modal.openPdf(item.path);
    else if (item.mediaType === 'epub') modal.openEpub(item.path);
    else modal.image.open = true;
  }

  function openDir(dirPath: string, isGoingUp = false, isFromHistory = false) {
    const normalized = folder.normalize(dirPath);
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

  function showNoImagesToast() {
    toaster.create({
      type: "warning",
      title: "No Media Found",
      description: "Directory has no compatible files.",
    });
  }

  async function handleOpenWebtoon() {
    if (modal.webtoon.archivePath) {
      modal.webtoon.open = true;
      return;
    }

    ui.isLoading = true;
    try {
      const imgData = await api.getGallery(folder.path, {
        page: 0,
        limit: 1,
        imagesOnly: true
      });
      if (imgData.total > 0) {
        modal.webtoon.open = true;
        return;
      }

      showNoImagesToast();
    } catch (e) {
      console.error(e);
    } finally {
      ui.isLoading = false;
    }
  }

  function navigateWebtoon(direction: 1 | -1) {
    const items = content.items;
    if (items.length === 0) return;

    const currentPath = modal.webtoon.archivePath || folder.path;
    let currentIndex = items.findIndex(
      (item: MediaFile) => item.entryPath === currentPath || item.path === currentPath,
    );

    if (currentIndex === -1) return;

    let targetIndex = currentIndex + direction;
    while (targetIndex >= 0 && targetIndex < items.length) {
      const target = items[targetIndex];
      if (target.entryPath || target.containsImages || target.mediaType === 'archive') {
        modal.openArchive(target.entryPath || target.path);
        return;
      }
      targetIndex += direction;
    }
  }

  function handleToggleCoverMode() {
    const wasEnabled = cover.enabled;
    cover.enabled = !cover.enabled;
    
    if (cover.enabled) {
      cover.savedState = {
        path: folder.path,
        sort: pagination.sort,
        counts: { ...content.totals },
      } as any;
      pagination.sort = "name_asc";
      loadFolder(true, 0);
    } else if (cover.savedState) {
      pagination.sort = cover.savedState.sort || "date_desc";
      loadFolder(true, 0).then(() => {
        if (cover.savedState?.counts) {
          content.totals = cover.savedState.counts;
        }
      });
    }
  }

  async function handleSwitchToPaginationToContinue() {
    const firstItem = content.items[0];
    if (!firstItem) return;

    let key = "images";
    if (firstItem.mediaType === 'video') key = "videos";
    else if (firstItem.mediaType === 'audio') key = "audio";
    else if (firstItem.mediaType === 'pdf') key = "pdf";
    else if (firstItem.mediaType === 'archive') key = "archives";
    else if (firstItem.mediaType === 'epub') key = "epub";

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

  function setMediaType(type: FilterType) {
    pagination.mediaType = type;
    loadFolder(true, 0);
  }

  function loadNextPage(page: number) {
    loadFolder(false, page);
  }

  return {
    openDir,
    loadFolder,
    refreshDrives: (force = true) => refreshDrives(force),
    setSort,
    setMediaType,
    loadNextPage,
    closePicker: () => { modal.folderPicker.open = false; },
    openModal,
    openArchive: (path: string, context = "") => {
      ui.lastOpenedFile = path;
      modal.openArchive(path, context);
    },
    openArchiveInWebtoon: (path: string, context = "") => {
      ui.lastOpenedFile = path;
      modal.openArchive(path, context);
    },
    handleOpenWebtoon,
    navigateWebtoon,
    handleToggleCoverMode,
    handleSwitchToPaginationToContinue,
    handleExitGroupView,
    handleOpenGroup,
  };
}
