import type { PdfState } from './pdfState.svelte';
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { applyZoomMode } from './pdfZoom';
import { resolveTocPages } from './pdfToc';

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
            textLayerMode: 2,
        });

        s.viewerApp = pdfViewer;
        linkService.setViewer(pdfViewer);
        s.isViewerAppInitialized = true;

        eventBus.on("pagesinit", function () {
            s.zoomMode = "default";
            applyZoomMode(s);
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

        s.resizeObserver = new ResizeObserver(() => {
            if (s.zoomMode === "default") {
                applyZoomMode(s);
            }
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
            disableAutoFetch: false, // Eagerly preload remaining chunks to speed up tree parsing
            disableStream: false,
            rangeChunkSize: 5242880, // 5MB chunks (drastically eliminates waterfall 206 limits for localhost)
            cMapUrl: "https://unpkg.com/pdfjs-dist@5.5.207/cmaps/",
            cMapPacked: true,
            standardFontDataUrl: "https://unpkg.com/pdfjs-dist@5.5.207/standard_fonts/",
        });
        s.pdfDoc = await loadingTask.promise;
        s.numPages = s.pdfDoc.numPages;

        if (!s.viewerApp) {
            initViewerApp(s);
        }

        if (s.viewerApp) {
            s.viewerApp.setDocument(s.pdfDoc);
            s.pdfLinkService.setDocument(s.pdfDoc, null);
        }

        try {
            const outline = await s.pdfDoc.getOutline();
            s.toc = outline || [];
            
            // Only trigger async TOC resolve without awaiting to not block rendering
            resolveTocPages(s).catch((err) => console.warn("TOC extraction err", err));
            
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

export function destroyPdf(s: PdfState) {
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
    if (s.pdfDoc) s.pdfDoc.destroy();
    s.pdfDoc = null;
    s.isDestroyed = true;
}
