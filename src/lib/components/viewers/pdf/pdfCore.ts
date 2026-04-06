import type { PdfState } from './pdfState.svelte';
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { applyZoomMode } from './pdfZoom';
import { resolveTocPages, initTocState, resolveItemPage } from './pdfToc';

export async function loadLibraries(s: PdfState) {
    try {
        const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const viewerMod = await import("pdfjs-dist/web/pdf_viewer.mjs");

        s.pdfjs = mod;
        s.pdfjsViewer = viewerMod;
        s.isPdfjsLoaded = true;

        if (s.pdfjs && !s.pdfjs.GlobalWorkerOptions.workerSrc) {
            s.pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
        }

        loadPdf(s);
    } catch (e: any) {
        console.error("Failed to load PDF libraries", e);
        s.errorMsg = "Failed to load PDF libraries: " + e.message;
    }
}

export function initViewerApp(s: PdfState) {
    if (!s.pdfScrollContainer || !s.viewerContainer || !s.pdfjsViewer || s.viewerApp) return;

    try {
        const eventBus = new s.pdfjsViewer.EventBus();
        s.eventBus = eventBus;

        const linkService = new s.pdfjsViewer.PDFLinkService({
            eventBus,
        });
        s.pdfLinkService = linkService;

        // Defer FindController creation entirely to save memory/CPU
        s.pdfFindController = null;

        const pdfViewer = new s.pdfjsViewer.PDFViewer({
            container: s.pdfScrollContainer,
            viewer: s.viewerContainer,
            eventBus,
            linkService,
            findController: null, 
            removePageBorders: true,
            textLayerMode: 0, // DISABLE text layer for massive RAM/CPU savings
            annotationMode: 0, // DISABLE annotations for faster rendering
            imageResourcesPath: "",
            renderInteractiveForms: false,
        });

        s.viewerApp = pdfViewer;
        linkService.setViewer(pdfViewer);
        s.isViewerAppInitialized = true;

        eventBus.on("pagesinit", function () {
            s.zoomMode = "default";
            // Delay zoom to avoid thrashing during node creation
            setTimeout(() => {
                if (s.isDestroyed) return;
                applyZoomMode(s);
                s.zoomLevel = s.viewerApp.currentScale;
            }, 500);
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
                s.currentSearchResultIndex = Math.max(0, evt.matchesCount.current - 1);
            } else {
                s.searchResultsCount = 0;
                s.currentSearchResultIndex = -1;
            }
            if (evt.state === 0 || evt.state === 1 || evt.state === 2) {
                s.isSearching = false;
            }
        });

        eventBus.on("updatefindmatchescount", function (evt: any) {
            s.searchResultsCount = evt.matchesCount.total;
            s.currentSearchResultIndex = Math.max(0, evt.matchesCount.current - 1);
        });

        let lastWidth = 0;
        let resizeTimeout: any = null;
        s.resizeObserver = new ResizeObserver((entries) => {
            if (!entries[0]) return;
            const width = entries[0].contentRect.width;
            if (Math.abs(width - lastWidth) < 2) return;
            lastWidth = width;

            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (s.isDestroyed) return;
                if (s.zoomMode === "default") {
                    applyZoomMode(s);
                }
            }, 250);
        });
        s.resizeObserver.observe(s.pdfScrollContainer);

    } catch (e: any) {
        console.error("Failed to init viewer app", e);
        s.errorMsg = "Init PDF Viewer Error: " + e.message;
    }
}

async function loadPdf(s: PdfState) {
    if (!s.pdfPath || s.isLoading || !s.pdfjs) return;
    s.isLoading = true;
    s.errorMsg = "";
    try {
        const loadingTask = s.pdfjs.getDocument({
            url: `/api/ebook?path=${encodeURIComponent(s.pdfPath)}`,
            disableAutoFetch: true, // Eagerly preloading is the main RAM killer
            disableStream: false,
            rangeChunkSize: 2097152, // 2MB – Sumatra-style bulk loading for efficiency
            cMapUrl: "/pdfjs/cmaps/",
            cMapPacked: true,
            standardFontDataUrl: "/pdfjs/standard_fonts/",
            stopAtErrors: true,
        });
        s.pdfDoc = await loadingTask.promise;
        s.numPages = s.pdfDoc.numPages;

        if (!s.viewerApp) {
            initViewerApp(s);
        }

        if (s.viewerApp) {
            // Set loading false early for huge docs (7000+ pages) 
            // The viewer will then incrementally show pages.
            s.isLoading = false; 

            s.viewerApp.setDocument(s.pdfDoc);
            s.pdfLinkService.setDocument(s.pdfDoc, null);
        }

        try {
            const outline = await s.pdfDoc.getOutline();
            s.toc = outline || [];
            
            initTocState(s.toc);
            // DO NOT resolve any page numbers at startup for 7000+ page files.
            // Resolution will happen on-demand when user expands items in the UI.
            
        } catch (e) {
            console.warn("Failed to get outline", e);
        }

    } catch (e: any) {
        console.error("Error loading PDF:", e);
        s.errorMsg = e.message || "Failed to load PDF";
        s.isLoading = false; // Reset on error
    } 
}

export function destroyPdf(s: PdfState) {
    if (s.pdfFindController) {
        try {
            s.pdfFindController.executeCommand("find", { query: "" });
        } catch (e) {}
    }

    if (s.resizeObserver) {
        s.resizeObserver.disconnect();
        s.resizeObserver = null;
    }
    if (s.hideTimerId) {
        clearTimeout(s.hideTimerId);
        s.hideTimerId = null;
    }
    if (s.viewerApp && typeof s.viewerApp.cleanup === 'function') {
        s.viewerApp.cleanup();
    }
    if (s.pdfDoc) {
        s.pdfDoc.destroy();
        s.pdfDoc = null;
    }
    
    // Attempt to terminate GlobalWorker if s.pdfjs is available
    if (s.pdfjs && typeof s.pdfjs.destroy === 'function') {
        s.pdfjs.destroy();
    }
    
    s.isDestroyed = true;
}
