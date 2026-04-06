import type { PdfState } from './pdfState.svelte';

export function applyZoomMode(s: PdfState) {
    if (!s.viewerApp) return;
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

    if (s.zoomMode === "default") {
        // Use fit-width to determine the maximum possible scale for the container
        s.viewerApp.currentScaleValue = "page-width";
        const fitWidthScale = s.viewerApp.currentScale;
        
        // If 100% (scale 1.0) is within the container, use 1.0, otherwise keep fit-width
        if (fitWidthScale >= 1.0) {
            s.viewerApp.currentScaleValue = "1.0";
        }
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

export function setZoom(s: PdfState, newZoom: number) {
    if (!s.viewerApp) return;
    s.zoomMode = "custom";
    s.viewerApp.currentScaleValue = newZoom.toString();
}

export function toggleFit(s: PdfState) {
    if (!s.viewerApp) return;
    if (s.zoomMode === "fit-width") {
        s.zoomMode = "actual-size";
    } else {
        s.zoomMode = "fit-width";
    }
    applyZoomMode(s);
}
