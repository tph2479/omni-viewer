import type { PdfState } from './pdfState.svelte';

export function applyZoomMode(s: PdfState) {
    if (!s.viewerApp) return;
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

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
