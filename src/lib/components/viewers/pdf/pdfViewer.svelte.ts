import { tick } from "svelte";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

export function createPdfController(initialPdfPath: string) {
  const s = $state({
    pdfPath: initialPdfPath,
    pdfjs: null as any,
    pdfjsViewer: null as any,
    pdfDoc: null as any,
    numPages: 0,
    isLoading: false,
    errorMsg: "",
    isDestroyed: false,

    controlsVisible: false,
    isEditingPage: false,
    isJumpPopupOpen: false,
    isSearchSidebarOpen: false,
    isSearching: false,
    isTocSidebarOpen: false,
    hideTimerId: null as any,
    isDarkMode:
      (typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-theme") === "business") || true as boolean,

    zoomMode: "default" as "default" | "fit-width" | "actual-size" | "custom",
    currentPageIndex: 0,
    zoomLevel: 1.0,

    pdfScrollContainer: undefined as HTMLElement | undefined,
    viewerContainer: undefined as HTMLElement | undefined,
    scrollY: 0,

    get smoothPercent() {
        if (s.numPages === 0 || !s.pdfScrollContainer) return 0;
        const maxScroll = Math.max(1, s.pdfScrollContainer.scrollHeight - s.pdfScrollContainer.clientHeight);
        return Math.min(100, Math.max(0, (s.scrollY / maxScroll) * 100));
    },

    searchQuery: "",
    searchResultsCount: 0,
    currentSearchResultIndex: -1,

    // Seek states
    isDraggingSeek: false,
    hasMoved: false,
    startY: 0,
    previewPercent: 0,
    seekBarElement: null as HTMLElement | null,

    toc: [] as any[],

    viewerApp: null as any,
    eventBus: null as any,
    pdfFindController: null as any,
    pdfLinkService: null as any,
  });

  async function loadLibraries() {
    try {
      const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const viewerMod = await import("pdfjs-dist/web/pdf_viewer.mjs");

      s.pdfjs = mod;
      s.pdfjsViewer = viewerMod;

      if (s.pdfjs && !s.pdfjs.GlobalWorkerOptions.workerSrc) {
        s.pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
      }

      loadPdf();
    } catch (e: any) {
      console.error("Failed to load PDF libraries", e);
      s.errorMsg = "Failed to load PDF libraries: " + e.message;
    }
  }

  let resizeObserver: ResizeObserver | null = null;

  function applyZoomMode() {
      if (!s.viewerApp) return;
      const isMobile = window.innerWidth <= 768;

      if (s.zoomMode === "default") {
          s.viewerApp.currentScaleValue = "page-width";
          let scale = s.viewerApp.currentScale;
          if (!isMobile) {
              scale *= 0.8;
          }
          s.viewerApp.currentScale = scale;
      } else if (s.zoomMode === "fit-width") {
          if (s.viewerApp.currentScaleValue !== "page-width") {
              s.viewerApp.currentScaleValue = "page-width";
          }
      } else if (s.zoomMode === "actual-size") {
          if (s.viewerApp.currentScaleValue !== "page-actual") {
              s.viewerApp.currentScaleValue = "page-actual";
          }
      }
  }

  function initViewerApp() {
    if (!s.pdfScrollContainer || !s.viewerContainer || !s.pdfjsViewer || s.viewerApp) return;

    try {
      const eventBus = new s.pdfjsViewer.EventBus();
      s.eventBus = eventBus;

      const linkService = new s.pdfjsViewer.PDFLinkService({
        eventBus,
      });
      s.pdfLinkService = linkService;

      const findController = new s.pdfjsViewer.PDFFindController({
        eventBus,
        linkService,
      });
      s.pdfFindController = findController;

      const pdfViewer = new s.pdfjsViewer.PDFViewer({
        container: s.pdfScrollContainer,
        viewer: s.viewerContainer,
        eventBus,
        linkService,
        findController,
        removePageBorders: true,
        textLayerMode: 2, // 2 is TEXT_LAYER_MODE.ENABLE
      });

      s.viewerApp = pdfViewer;
      linkService.setViewer(pdfViewer);

      // Setup Event Listeners
      eventBus.on("pagesinit", function () {
        s.zoomMode = "default";
        applyZoomMode();
        s.zoomLevel = s.viewerApp.currentScale;
      });

      eventBus.on("pagechanging", function (evt: any) {
        if (typeof evt.pageNumber === 'number') {
          s.currentPageIndex = evt.pageNumber - 1;
        }
      });

      eventBus.on("scalechanging", function (evt: any) {
        if (typeof evt.scale === 'number') {
          s.zoomLevel = evt.scale;
        }
      });

      eventBus.on("updatefindcontrolstate", function (evt: any) {
        if (evt.matchesCount) {
          s.searchResultsCount = evt.matchesCount.total;
          // In pdfjs, matches are 1-indexed. If current is 0, it means no current match mapped yet
          s.currentSearchResultIndex = Math.max(0, evt.matchesCount.current - 1);
        } else {
          s.searchResultsCount = 0;
          s.currentSearchResultIndex = -1;
        }
        
        if (evt.state === 0 /* FOUND */ || evt.state === 1 /* NOT_FOUND */ || evt.state === 2 /* WRAPPED */) {
            s.isSearching = false;
        }
      });

      eventBus.on("updatefindmatchescount", function (evt: any) {
        s.searchResultsCount = evt.matchesCount.total;
        s.currentSearchResultIndex = Math.max(0, evt.matchesCount.current - 1);
      });

      // Responsive Resize Observer
      resizeObserver = new ResizeObserver(() => {
          if (s.zoomMode === "default") {
              applyZoomMode();
          }
      });
      resizeObserver.observe(s.pdfScrollContainer);

    } catch (e: any) {
        console.error("Failed to init viewer app", e);
        s.errorMsg = "Init PDF Viewer Error: " + e.message;
    }
  }

  async function loadPdf() {
    if (!s.pdfPath || s.isLoading || !s.pdfjs) return;
    s.isLoading = true;
    s.errorMsg = "";
    try {
      const loadingTask = s.pdfjs.getDocument({
        url: `/api/ebook?path=${encodeURIComponent(s.pdfPath)}`,
        disableAutoFetch: true,
        disableStream: false,
      });
      s.pdfDoc = await loadingTask.promise;
      s.numPages = s.pdfDoc.numPages;

      if (!s.viewerApp) {
          initViewerApp();
      }

      if (s.viewerApp) {
        s.viewerApp.setDocument(s.pdfDoc);
        s.pdfLinkService.setDocument(s.pdfDoc, null);
      }

      try {
        const outline = await s.pdfDoc.getOutline();
        s.toc = outline || [];
      } catch (e) {
        console.warn("Failed to get outline", e);
      }

    } catch (e: any) {
      console.error("Error loading PDF:", e);
      s.errorMsg = e.message || "Failed to load PDF";
    } finally {
      s.isLoading = false;
    }
  }

  function scrollToIndex(index: number) {
    if (!s.viewerApp) return;
    s.viewerApp.currentPageNumber = index + 1;
  }

  function setZoom(newZoom: number) {
    if (!s.viewerApp) return;
    s.zoomMode = "custom";
    s.viewerApp.currentScaleValue = newZoom.toString();
  }

  function toggleFit() {
    if (!s.viewerApp) return;
    if (s.zoomMode === "fit-width") {
        s.zoomMode = "actual-size";
    } else {
        s.zoomMode = "fit-width";
    }
    applyZoomMode();
  }

  function handlePageInput(val: string) {
    const page = parseInt(val);
    if (!isNaN(page) && Math.floor(page) > 0 && Math.floor(page) <= s.numPages) {
      scrollToIndex(page - 1);
    }
  }

  function handleSearch(type: "find" | "findagain" | "findhighlightallchange" = "find", backward = false) {
    if (!s.pdfFindController || typeof s.searchQuery !== 'string') return;
    if (s.searchQuery.trim().length === 0) {
        clearSearch();
        return;
    }
    s.isSearching = true;

    s.pdfFindController.executeCommand(type, {
      query: s.searchQuery,
      phraseSearch: true,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: backward
    });
  }

  function clearSearch() {
      s.searchQuery = "";
      s.searchResultsCount = 0;
      s.currentSearchResultIndex = -1;
      s.isSearching = false;
      if (s.pdfFindController) {
          s.pdfFindController.executeCommand("find", {
              query: "",
          });
      }
  }

  function nextSearchResult() {
      handleSearch("findagain", false);
  }

  function prevSearchResult() {
      handleSearch("findagain", true);
  }

  function navigateToDest(dest: string | any[]) {
      if (!s.pdfLinkService) return;
      s.pdfLinkService.navigateTo(dest);
  }

  function updatePreview(e: MouseEvent) {
      if (!s.seekBarElement) return;
      const rect = s.seekBarElement.getBoundingClientRect();
      const perc = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      s.previewPercent = perc * 100;
  }

  function scrollToPreview() {
      if (!s.pdfScrollContainer) return;
      const maxScroll = Math.max(1, s.pdfScrollContainer.scrollHeight - s.pdfScrollContainer.clientHeight);
      s.pdfScrollContainer.scrollTop = (s.previewPercent / 100) * maxScroll;
      s.scrollY = s.pdfScrollContainer.scrollTop;
  }

  function handleSeekBarMouseDown(e: MouseEvent) {
      if (!s.seekBarElement || !s.pdfScrollContainer) return;
      s.isDraggingSeek = true;
      s.hasMoved = false;
      s.startY = e.clientY;
      updatePreview(e);
      scrollToPreview();
  }

  function handleWindowMouseUp() {
      if (s.isDraggingSeek) {
          s.isDraggingSeek = false;
          s.hasMoved = false;
      }
  }

  function handleWindowMouseMove(e: MouseEvent) {
    if (s.isDraggingSeek) {
      if (!s.hasMoved && Math.abs(e.clientY - s.startY) > 5) {
          s.hasMoved = true;
      }
      updatePreview(e);
      if (s.hasMoved) {
          scrollToPreview();
      }
    }

    const width = window.innerWidth;
    const rightThreshold = width * 0.8;
    if (
      e.clientX > rightThreshold ||
      s.isEditingPage ||
      s.isJumpPopupOpen ||
      s.isSearchSidebarOpen ||
      s.isTocSidebarOpen
    ) {
      s.controlsVisible = true;
      if (s.hideTimerId) clearTimeout(s.hideTimerId);
      if (!s.isEditingPage && !s.isJumpPopupOpen && !s.isSearchSidebarOpen && !s.isTocSidebarOpen) {
        s.hideTimerId = setTimeout(() => {
          s.controlsVisible = false;
          s.hideTimerId = null;
        }, 2000);
      }
    } else {
      s.controlsVisible = false;
    }
  }

  function handleScroll(e: Event) {
      const target = e.target as HTMLElement;
      s.scrollY = target.scrollTop;
  }

  function destroy() {
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    if (s.hideTimerId) {
      clearTimeout(s.hideTimerId);
      s.hideTimerId = null;
    }
    if (s.viewerApp && typeof s.viewerApp.cleanup === 'function') {
        s.viewerApp.cleanup();
    }
    if (s.pdfDoc) s.pdfDoc.destroy();
    s.pdfDoc = null;
    s.isDestroyed = true;
  }

  return {
    state: s,
    loadLibraries,
    initViewerApp,
    scrollToIndex,
    setZoom,
    toggleFit,
    handlePageInput,
    handleSearch,
    clearSearch,
    nextSearchResult,
    prevSearchResult,
    navigateToDest,
    handleWindowMouseMove,
    handleWindowMouseUp,
    handleSeekBarMouseDown,
    handleScroll,
    destroy,
  };
}
