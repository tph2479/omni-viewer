import type { PdfState } from './pdfState.svelte';

export function handleSearch(s: PdfState, type: "find" | "findagain" | "findhighlightallchange" = "find", backward = false) {
    if (!s.pdfFindController || typeof s.searchQuery !== 'string') return;
    if (s.searchQuery.trim().length === 0) {
        clearSearch(s);
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

export function clearSearch(s: PdfState) {
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

export function nextSearchResult(s: PdfState) {
    handleSearch(s, "findagain", false);
}

export function prevSearchResult(s: PdfState) {
    handleSearch(s, "findagain", true);
}
