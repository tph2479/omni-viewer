export class PdfState {
    pdfPath = $state("");
    numPages = $state(0);
    isLoading = $state(false);
    errorMsg = $state("");
    isDestroyed = $state(false);

    controlsVisible = $state(false);
    isEditingPage = $state(false);
    isJumpPopupOpen = $state(false);
    isSearchSidebarOpen = $state(false);
    isSearching = $state(false);
    isTocSidebarOpen = $state(false);
    hideTimerId = $state<any>(null);
    isDarkMode = $state<boolean>(
      typeof document !== "undefined" 
        ? document.documentElement.classList.contains("dark") || document.documentElement.getAttribute("data-mode") === "dark"
        : true
    );

    zoomMode = $state<"default" | "fit-width" | "actual-size" | "custom">("default");
    currentPageIndex = $state(0);
    zoomLevel = $state(1.0);

    pdfScrollContainer = $state<HTMLElement | undefined>(undefined);
    viewerContainer = $state<HTMLElement | undefined>(undefined);
    scrollY = $state(0);

    get smoothPercent() {
        if (this.numPages === 0 || !this.pdfScrollContainer) return 0;
        const maxScroll = Math.max(1, this.pdfScrollContainer.scrollHeight - this.pdfScrollContainer.clientHeight);
        return Math.min(100, Math.max(0, (this.scrollY / maxScroll) * 100));
    }

    searchQuery = $state("");
    searchResultsCount = $state(0);
    currentSearchResultIndex = $state(-1);

    isDraggingSeek = $state(false);
    hasMoved = $state(false);
    startY = $state(0);
    previewPercent = $state(0);
    seekBarElement = $state<HTMLElement | null>(null);

    toc = $state<any[]>([]);

    isPdfjsLoaded = $state(false);
    isViewerAppInitialized = $state(false);

    // Non-reactive references for PDF.js complex internals
    // Storing them outside of $state() prevents Svelte from deep-proxying them!
    pdfjs: any = null;
    pdfjsViewer: any = null;
    pdfDoc: any = null;
    viewerApp: any = null;
    eventBus: any = null;
    pdfFindController: any = null;
    pdfLinkService: any = null;
    resizeObserver: ResizeObserver | null = null;
    
    constructor(initialPdfPath: string) {
        this.pdfPath = initialPdfPath;
    }
}
