import { PdfState } from './pdfState.svelte';
import { loadLibraries, initViewerApp, destroyPdf } from './pdfCore';
import { setZoom, toggleFit } from './pdfZoom';
import { handleSearch, clearSearch, nextSearchResult, prevSearchResult } from './pdfSearch';
import { navigateToDest } from './pdfToc';
import { handlePageInput, handleWindowMouseMove, handleWindowMouseUp, handleSeekBarMouseDown, handleScroll } from './pdfEvents';

export function createPdfController(initialPdfPath: string) {
    const s = new PdfState(initialPdfPath);

    return {
        state: s,
        loadLibraries: () => loadLibraries(s),
        initViewerApp: () => initViewerApp(s),
        destroy: () => destroyPdf(s),
        setZoom: (zoom: number) => setZoom(s, zoom),
        toggleFit: () => toggleFit(s),
        handleSearch: (type: "find" | "findagain" | "findhighlightallchange" = "find", backward = false) => handleSearch(s, type, backward),
        clearSearch: () => clearSearch(s),
        nextSearchResult: () => nextSearchResult(s),
        prevSearchResult: () => prevSearchResult(s),
        navigateToDest: (dest: string | any[]) => navigateToDest(s, dest),
        handlePageInput: (val: string) => handlePageInput(s, val),
        handleWindowMouseMove: (e: MouseEvent) => handleWindowMouseMove(s, e),
        handleWindowMouseUp: () => handleWindowMouseUp(s),
        handleSeekBarMouseDown: (e: MouseEvent) => handleSeekBarMouseDown(s, e),
        handleScroll: (e: Event) => handleScroll(s, e),
    };
}
