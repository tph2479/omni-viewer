import { tick } from "svelte";
import { pushState } from "$app/navigation";
import { toaster } from "$lib/stores/ui/toaster";
import type { ImageFile } from "$lib/utils/fileUtils";
import type { BrowserStore } from "./index.svelte.js";
import type { SortType, MediaType } from "./types";

export function createActions(store: BrowserStore) {
  const { folder, content, pagination, ui, modal, cover } = store;

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

      const exclusiveParam = ui.exclusiveType
        ? `&exclusiveType=${ui.exclusiveType}`
        : "";
      const res = await fetch(
        `/api/file?action=gallery&folder=${encodeURIComponent(targetPath)}&page=${pagination.currentPage}&limit=${pagination.pageSize}&sort=${pagination.sort}&type=${pagination.mediaType}&isCover=${cover.enabled}${exclusiveParam}`,
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
          modal.openCbz(ui.pendingFile.path);
        } else if (ui.pendingFile.type === "pdf") {
          modal.openPdf(ui.pendingFile.path);
        } else {
          const idx = content.items.findIndex(
            (img: ImageFile) => img.path === ui.pendingFile!.path,
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

  function openModal(index: number, items?: ImageFile[]) {
    const sourceList = items || content.items;
    const img = sourceList[index];
    if (!img) return;

    if (items) content.items = items;
    modal.image.index = index;

    if (img.isVideo) modal.video.open = true;
    else if (img.isAudio) modal.audio.open = true;
    else if (img.isPdf) modal.openPdf(img.path);
    else if (img.isEpub) modal.openEpub(img.path);
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

    const currentPath = modal.webtoon.cbzPath || folder.path;
    let currentIndex = items.findIndex(
      (item: ImageFile) => item.firstCbz === currentPath || item.path === currentPath,
    );

    if (currentIndex === -1) return;

    let targetIndex = currentIndex + direction;
    while (targetIndex >= 0 && targetIndex < items.length) {
      const item = items[targetIndex];
      if (item.firstCbz || item.hasImages || item.isCbz) {
        modal.openCbz(item.firstCbz || item.path);
        return;
      }
      targetIndex += direction;
    }
  }

  function handleToggleCoverMode() {
    cover.enabled = !cover.enabled;
    if (cover.enabled) {
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
    openDir,
    loadFolder,
    refreshDrives: (force = true) => refreshDrives(force),
    setSort,
    setMediaType,
    loadNextPage,
    closePicker: () => { modal.folderPicker.open = false; },
    openModal,
    handleOpenWebtoon,
    navigateWebtoon,
    handleToggleCoverMode,
    handleSwitchToPaginationToContinue,
    handleExitGroupView,
    handleOpenGroup,
  };
}
