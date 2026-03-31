import { tick } from "svelte";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

export function createPdfController(initialPdfPath: string) {
  const s = $state({
    pdfPath: initialPdfPath,
    pdfjs: null as any,
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
    hideTimerId: null as any,
    isDarkMode:
      typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-theme") === "business",
    isFitWidth: false,

    currentPageIndex: 0,
    zoomLevel: 1.0,
    previousZoom: 1.0,
    pendingScrollTop: null as number | null,

    pdfScrollContainer: undefined as HTMLElement | undefined,
    scrollY: 0,
    viewportHeight: 0,

    get smoothPercent() {
      const maxScroll = Math.max(
        1,
        virtualData.offsets[this.numPages - 1] +
          getPageHeight(this.numPages - 1) -
          this.viewportHeight,
      );
      return Math.min(100, Math.max(0, (this.scrollY / maxScroll) * 100));
    },
    isDraggingSeek: false,
    hasMoved: false,
    startY: 0,
    previewPercent: 0,
    lastScrollPercent: 0,
    anchorPercentInPage: 0,
    seekBarElement: null as HTMLElement | null,

    aspectRatios: {} as Record<number, number>,
    baseWidth: 1000,

    searchQuery: "",
    searchResults: [] as {
      pageIndex: number;
      matchIndex: number;
      snippet: string;
    }[],
    currentSearchResultIndex: -1,
  });

  const GAP = 0;
  const defaultAspectRatio = 1.414;
  let resizeHandler: (() => void) | null = null;

  function getPageHeight(index: number, zoom: number = s.zoomLevel) {
    return s.baseWidth * zoom * (s.aspectRatios[index] || defaultAspectRatio);
  }

  const virtualData = $derived.by(() => {
    if (s.numPages === 0)
      return { start: 0, end: 0, topOffset: 0, bottomOffset: 0, offsets: [] };
    let total = 0;
    let start = 0;
    let topOffset = 0;
    let end = 0;
    let offsets = new Array(s.numPages);

    const preloadPixels = s.viewportHeight * 3.5;

    for (let i = 0; i < s.numPages; i++) {
      offsets[i] = total;
      let h = getPageHeight(i) + GAP;

      if (total + h >= s.scrollY - preloadPixels) {
        if (start === 0 && i !== 0) {
          start = i;
          topOffset = total;
        }
      }
      total += h;

      if (start !== 0 || i === 0) {
        if (
          total >= s.scrollY + s.viewportHeight + preloadPixels &&
          end === 0
        ) {
          end = i;
        }
      }
    }

    if (end === 0) end = s.numPages - 1;
    let bottomOffset = total - (offsets[end] + getPageHeight(end) + GAP);

    if (s.scrollY - preloadPixels <= 0) {
      start = 0;
      topOffset = 0;
    }

    return {
      start,
      end,
      topOffset,
      bottomOffset: Math.max(0, bottomOffset),
      offsets,
    };
  });

  const visiblePages = $derived(
    s.numPages > 0
      ? Array.from(
          { length: Math.max(0, virtualData.end - virtualData.start + 1) },
          (_, i) => virtualData.start + i,
        )
      : [],
  );

  function updateCurrentPageAndScroll() {
    if (s.numPages > 0 && virtualData.offsets.length > 0 && !s.isDraggingSeek) {
      const centerPoint = s.scrollY + s.viewportHeight / 2;
      let closestIndex = 0;
      for (let i = 0; i < s.numPages; i++) {
        if (virtualData.offsets[i] > centerPoint) {
          closestIndex = Math.max(0, i - 1);
          break;
        }
        closestIndex = i;
      }
      s.currentPageIndex = closestIndex;
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

      // Background Ratio Discovery: Discover all page dimensions for perfect virtualization math
      // We do this in chunks to avoid overwhelming the message bus
      (async () => {
        for (let i = 0; i < s.numPages; i++) {
          // Skip if already discovered
          if (s.aspectRatios[i]) continue;
          if (s.isDestroyed || !s.pdfDoc) break;
          try {
            const page = await s.pdfDoc.getPage(i + 1);
            const viewport = page.getViewport({ scale: 1.0 });
            s.aspectRatios[i] = viewport.height / viewport.width;
            if (typeof page.cleanup === "function") page.cleanup();
            // Yield to main thread every 10 pages
            if (i % 10 === 0) await tick();
          } catch (e: any) {
            if (e.name === "TransportDestroyedException") break;
            console.warn(`Failed to discover ratio for page ${i}:`, e);
          }
        }
      })();
    } catch (e: any) {
      console.error("Error loading PDF:", e);
      s.errorMsg = e.message || "Failed to load PDF";
    } finally {
      s.isLoading = false;
    }
  }

  async function loadLibraries() {
    s.baseWidth = Math.min(window.innerWidth * 0.9, 1000);
    resizeHandler = () => {
      s.baseWidth = Math.min(window.innerWidth * 0.9, 1000);
    };
    window.addEventListener("resize", resizeHandler);

    const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
    s.pdfjs = mod;

    if (s.pdfjs && !s.pdfjs.GlobalWorkerOptions.workerSrc) {
      s.pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
    }
    loadPdf();
  }

  function scrollToIndex(index: number, behavior: ScrollBehavior = "smooth") {
    if (!s.pdfScrollContainer) return;
    if (virtualData.offsets && virtualData.offsets[index] !== undefined) {
      s.pdfScrollContainer.scrollTo({
        top: virtualData.offsets[index],
        behavior,
      });
    }
  }

  function setZoom(newZoom: number, cursorY?: number) {
    if (!s.pdfScrollContainer || newZoom === s.zoomLevel) return;

    const yAnchor = cursorY ?? window.innerHeight / 2;
    const ratio = newZoom / s.zoomLevel;
    const absoluteY = s.scrollY + yAnchor;
    const newAbsoluteY = absoluteY * ratio;

    s.zoomLevel = newZoom;
    s.pendingScrollTop = newAbsoluteY - yAnchor;

    tick().then(() => {
      if (s.pdfScrollContainer && s.pendingScrollTop !== null) {
        s.pdfScrollContainer.scrollTop = s.pendingScrollTop;
        s.pendingScrollTop = null;

        // Sync stable indicators after zoom
        const maxScroll = Math.max(
          1,
          virtualData.offsets[s.numPages - 1] +
            getPageHeight(s.numPages - 1) -
            s.viewportHeight,
        );
        s.lastScrollPercent = s.pdfScrollContainer.scrollTop / maxScroll;

        const anchorEl = document.getElementById(
          `pdf-page-${s.currentPageIndex}`,
        );
        if (anchorEl) {
          const rect = anchorEl.getBoundingClientRect();
          const cRect = s.pdfScrollContainer.getBoundingClientRect();
          s.anchorPercentInPage = (cRect.top - rect.top) / rect.height;
        }
      }
    });
  }

  function toggleFit() {
    s.isFitWidth = !s.isFitWidth;
    if (s.isFitWidth) {
      s.previousZoom = s.zoomLevel;
      const fitZoom = (window.innerWidth * 0.9) / s.baseWidth;
      setZoom(fitZoom);
    } else {
      setZoom(s.previousZoom < 0.99 ? s.previousZoom : 1);
    }
  }

  function handlePageInput(val: string) {
    const page = parseInt(val);
    if (!isNaN(page) && page >= 1 && page <= s.numPages) {
      scrollToIndex(page - 1);
    }
  }

  async function handleSearch() {
    if (!s.searchQuery || !s.pdfDoc) return;

    s.isSearching = true;
    s.searchResults = [];
    s.currentSearchResultIndex = -1;

    try {
      for (let i = 0; i < s.numPages; i++) {
        if (!s.isSearching && !s.isSearchSidebarOpen) break;
        const page = await s.pdfDoc.getPage(i + 1);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((item: any) => item.str).join(" ");

        const regex = new RegExp(
          s.searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "gi",
        );
        let match;
        while ((match = regex.exec(text)) !== null) {
          const startSnippet = Math.max(0, match.index - 40);
          const endSnippet = Math.min(
            text.length,
            match.index + s.searchQuery.length + 40,
          );
          const before = text.substring(startSnippet, match.index);
          const after = text.substring(
            match.index + s.searchQuery.length,
            endSnippet,
          );

          s.searchResults.push({
            pageIndex: i,
            matchIndex: match.index,
            snippet: `... ${before}<mark class="bg-yellow-400/50 text-white rounded">${text.substring(match.index, match.index + s.searchQuery.length)}</mark>${after} ...`,
          });
        }
        
        if (typeof page.cleanup === "function") page.cleanup();
        if (i % 5 === 0) await tick();
      }

      if (s.searchResults.length > 0) {
        s.currentSearchResultIndex = 0;
      }
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      s.isSearching = false;
    }
  }

  function nextSearchResult() {
    if (s.searchResults.length === 0) return;
    s.currentSearchResultIndex =
      (s.currentSearchResultIndex + 1) % s.searchResults.length;
    scrollToIndex(s.searchResults[s.currentSearchResultIndex].pageIndex);
  }

  function prevSearchResult() {
    if (s.searchResults.length === 0) return;
    s.currentSearchResultIndex =
      (s.currentSearchResultIndex - 1 + s.searchResults.length) %
      s.searchResults.length;
    scrollToIndex(s.searchResults[s.currentSearchResultIndex].pageIndex);
  }

  function handleSeekBarMouseDown(e: MouseEvent) {
    if (!s.seekBarElement) return;
    s.isDraggingSeek = true;
    s.hasMoved = false;
    s.startY = e.clientY;
    updatePreview(e);

    const targetIdx = Math.floor((s.previewPercent / 100) * s.numPages);
    scrollToIndex(Math.min(targetIdx, s.numPages - 1));
  }

  function updatePreview(e: MouseEvent) {
    if (!s.seekBarElement) return;
    const rect = s.seekBarElement.getBoundingClientRect();
    const percentage =
      Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) * 100;
    s.previewPercent = percentage;
  }

  function handleWindowMouseMove(e: MouseEvent) {
    if (s.isDraggingSeek) {
      if (!s.hasMoved && Math.abs(e.clientY - s.startY) > 5) {
        s.hasMoved = true;
      }
      updatePreview(e);
      if (s.hasMoved) {
        const targetIdx = Math.floor((s.previewPercent / 100) * s.numPages);
        scrollToIndex(Math.min(targetIdx, s.numPages - 1), "instant");
      }
    }
  }

  function handleWindowMouseUp() {
    if (s.isDraggingSeek) {
      s.isDraggingSeek = false;
      s.hasMoved = false;
    }
  }

  function handleContainerMouseMove(e: MouseEvent) {
    const width = window.innerWidth;
    const rightThreshold = width * 0.8;
    if (
      e.clientX > rightThreshold ||
      s.isEditingPage ||
      s.isJumpPopupOpen ||
      s.isSearchSidebarOpen
    ) {
      s.controlsVisible = true;
      if (s.hideTimerId) clearTimeout(s.hideTimerId);
      if (!s.isEditingPage && !s.isJumpPopupOpen && !s.isSearchSidebarOpen) {
        s.hideTimerId = setTimeout(() => {
          s.controlsVisible = false;
          s.hideTimerId = null;
        }, 2000);
      }
    } else {
      s.controlsVisible = false;
    }
  }

  const renderTasks = new Map<number, any>();
  const pageTextCache = new Map<number, string[]>();

  async function renderPageToCanvas(
    pageIndex: number,
    canvas: HTMLCanvasElement,
    textLayerDiv: HTMLDivElement,
  ) {
    if (!s.pdfDoc) return;

    if (renderTasks.has(pageIndex)) {
      try {
        renderTasks.get(pageIndex).cancel();
      } catch (e) {}
      renderTasks.delete(pageIndex);
    }

    try {
      const page = await s.pdfDoc.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 2.0 });
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      s.aspectRatios[pageIndex] = viewport.height / viewport.width;

      const renderTask = page.render({ canvasContext: context, viewport });
      renderTasks.set(pageIndex, renderTask);

      await renderTask.promise;
      renderTasks.delete(pageIndex);

      try {
        if (textLayerDiv && s.pdfjs && s.pdfjs.TextLayer) {
          textLayerDiv.innerHTML = "";

          const parentWidth =
            canvas.parentElement?.clientWidth ||
            viewport.width / viewport.scale;
          const pageWidthPt = viewport.width / viewport.scale;
          const pageHeightPt =
            ((viewport.height / viewport.height) * viewport.height) /
            viewport.scale;
          const totalScaleFactor = parentWidth / pageWidthPt;

          // Store PDF-point dimensions for ResizeObserver
          textLayerDiv.setAttribute("data-pt-w", String(pageWidthPt));
          // Keep data-vw/vh for highlightAction compatibility
          textLayerDiv.setAttribute("data-vw", String(viewport.width));
          textLayerDiv.setAttribute("data-vh", String(viewport.height));

          // Set CSS vars — TextLayer v5 uses these to size/position itself
          textLayerDiv.style.setProperty(
            "--scale-factor",
            String(viewport.scale),
          );
          textLayerDiv.style.setProperty(
            "--total-scale-factor",
            String(totalScaleFactor),
          );
          textLayerDiv.style.setProperty("--scale-round-x", "1px");
          textLayerDiv.style.setProperty("--scale-round-y", "1px");

          // Don't set width/height/transform — TextLayer manages those
          const textContent = await page.getTextContent();
          const textItems = textContent.items.map(
            (item: any) => item.str as string,
          );
          pageTextCache.set(pageIndex, textItems);

          const textLayer = new s.pdfjs.TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport,
          });
          await textLayer.render();
        }
      } catch (e) {
        console.error("TextLayer rendering failed:", e);
      }
    } catch (e: any) {
      if (e.name !== "RenderingCancelledException") {
        console.error(`Error rendering page ${pageIndex}:`, e);
      }
    }
  }

  async function clearCanvas(canvas: HTMLCanvasElement, index: number) {
    if (renderTasks.has(index)) {
      try {
        renderTasks.get(index).cancel();
      } catch (e) {}
      renderTasks.delete(index);
    }
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    }
    
    // Free PDF.js page resources immediately
    try {
      if (s.pdfDoc) {
        const page = await s.pdfDoc.getPage(index + 1);
        if (page && typeof page.cleanup === "function") {
          page.cleanup();
        }
      }
    } catch (e) {}
  }

  function applySearchHighlights(
    pageIndex: number,
    textLayerDiv: HTMLDivElement,
  ) {
    // Remove old highlights
    textLayerDiv
      .querySelectorAll(".search-match, .search-match-selected")
      .forEach((el) => {
        el.classList.remove("search-match", "search-match-selected");
      });

    if (!s.searchQuery || s.searchResults.length === 0) return;

    const pageMatches = s.searchResults.filter(
      (r) => r.pageIndex === pageIndex,
    );
    if (pageMatches.length === 0) return;

    // Get the text content spans (exclude markedContent wrappers, br, endOfContent)
    const spans = Array.from(
      textLayerDiv.querySelectorAll(":scope > span, .markedContent > span"),
    ) as HTMLElement[];
    if (spans.length === 0) return;

    // Build text from spans with offset mapping
    let fullText = "";
    const spanMap: { start: number; end: number; span: HTMLElement }[] = [];
    for (const span of spans) {
      const start = fullText.length;
      const text = span.textContent || "";
      fullText += text;
      spanMap.push({ start, end: fullText.length, span });
      fullText += " "; // separator between spans
    }

    // Find matches in the concatenated text
    const escapedQuery = s.searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escapedQuery, "gi");
    let match;
    let matchIdx = 0;
    const currentResult = s.searchResults[s.currentSearchResultIndex];

    while ((match = regex.exec(fullText)) !== null) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;

      const isSelected =
        currentResult &&
        currentResult.pageIndex === pageIndex &&
        currentResult.matchIndex === matchStart;

      // Find which spans overlap with this match
      for (const entry of spanMap) {
        if (entry.start < matchEnd && entry.end > matchStart) {
          entry.span.classList.add(
            isSelected ? "search-match-selected" : "search-match",
          );
        }
      }
      matchIdx++;
    }
  }

  function destroy() {
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
      resizeHandler = null;
    }
    if (s.hideTimerId) {
      clearTimeout(s.hideTimerId);
      s.hideTimerId = null;
    }
    try {
      if (s.pdfDoc && typeof s.pdfDoc.cleanup === "function") {
        s.pdfDoc.cleanup();
      }
    } catch (e) {}
    s.isDestroyed = true;
    if (s.pdfDoc) s.pdfDoc.destroy();
    s.pdfDoc = null;
    for (const task of renderTasks.values()) {
      try {
        task.cancel();
      } catch (e) {}
    }
    renderTasks.clear();
    pageTextCache.clear();
  }

  return {
    state: s,
    get virtualData() {
      return virtualData;
    },
    get visiblePages() {
      return visiblePages;
    },

    getPageHeight,
    loadLibraries,
    updateCurrentPageAndScroll,
    scrollToIndex,
    setZoom,
    toggleFit,
    handlePageInput,
    handleSearch,
    nextSearchResult,
    prevSearchResult,
    handleSeekBarMouseDown,
    handleWindowMouseMove,
    handleWindowMouseUp,
    handleContainerMouseMove,
    renderPageToCanvas,
    applySearchHighlights,
    clearCanvas,
    destroy,
  };
}
