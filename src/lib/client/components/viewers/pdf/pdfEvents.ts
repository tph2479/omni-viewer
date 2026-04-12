import type { PdfState } from './pdfState.svelte';

export function scrollToIndex(s: PdfState, index: number) {
    if (!s.viewerApp) return;
    s.viewerApp.currentPageNumber = index + 1;
}

export function handlePageInput(s: PdfState, val: string) {
    const page = parseInt(val);
    if (!isNaN(page) && Math.floor(page) > 0 && Math.floor(page) <= s.numPages) {
        scrollToIndex(s, page - 1);
    }
}

function updatePreview(s: PdfState, e: MouseEvent) {
    if (!s.seekBarElement) return;
    const rect = s.seekBarElement.getBoundingClientRect();
    const perc = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    s.previewPercent = perc * 100;
}

function scrollToPreview(s: PdfState) {
    if (!s.pdfScrollContainer) return;
    const maxScroll = Math.max(1, s.pdfScrollContainer.scrollHeight - s.pdfScrollContainer.clientHeight);
    s.pdfScrollContainer.scrollTop = (s.previewPercent / 100) * maxScroll;
    s.scrollY = s.pdfScrollContainer.scrollTop;
}

export function handleSeekBarMouseDown(s: PdfState, e: MouseEvent) {
    if (!s.seekBarElement || !s.pdfScrollContainer) return;
    s.isDraggingSeek = true;
    s.hasMoved = false;
    s.startY = e.clientY;
    updatePreview(s, e);
    scrollToPreview(s);
}

export function handleWindowMouseUp(s: PdfState) {
    if (s.isDraggingSeek) {
        s.isDraggingSeek = false;
        s.hasMoved = false;
    }
}

export function handleWindowMouseMove(s: PdfState, e: MouseEvent) {
    if (s.isDraggingSeek) {
        if (!s.hasMoved && Math.abs(e.clientY - s.startY) > 5) {
            s.hasMoved = true;
        }
        updatePreview(s, e);
        if (s.hasMoved) {
            scrollToPreview(s);
        }
    }

    const width = window.innerWidth;
    const rightThreshold = width * 0.8;
    const shouldShow =
        e.clientX > rightThreshold ||
        s.isEditingPage ||
        s.isJumpPopupOpen ||
        s.isSearchSidebarOpen ||
        s.isTocSidebarOpen;

    if (shouldShow) {
        if (!s.controlsVisible) s.controlsVisible = true;
        if (s.hideTimerId) clearTimeout(s.hideTimerId);
        if (!s.isEditingPage && !s.isJumpPopupOpen && !s.isSearchSidebarOpen && !s.isTocSidebarOpen) {
            s.hideTimerId = setTimeout(() => {
                s.controlsVisible = false;
                s.hideTimerId = null;
            }, 2000);
        }
    } else {
        if (s.controlsVisible) s.controlsVisible = false;
    }
}

let scrollRafId: number | null = null;
export function handleScroll(s: PdfState, e: Event) {
    if (scrollRafId !== null) return;
    const target = e.target as HTMLElement;
    scrollRafId = requestAnimationFrame(() => {
        if (s.isDestroyed || !target) return;
        s.scrollY = target.scrollTop;
        const sh = target.scrollHeight;
        const ch = target.clientHeight;
        const maxScroll = Math.max(1, sh - ch);
        s.smoothPercent = Math.min(100, Math.max(0, (target.scrollTop / maxScroll) * 100));
        scrollRafId = null;
    });
}
