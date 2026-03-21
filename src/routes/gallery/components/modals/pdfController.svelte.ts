import { tick } from 'svelte';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

export function createPdfController(initialPdfPath: string) {
	const s = $state({
		pdfPath: initialPdfPath,
		pdfjs: null as any,
		pdfDoc: null as any,
		numPages: 0,
		isLoading: false,
		errorMsg: '',

		controlsVisible: false,
		isEditingPage: false,
		isJumpPopupOpen: false,
		isSearchSidebarOpen: false,
		isSearching: false,
		hideTimerId: null as any,
		isDarkMode: false,

		currentPageIndex: 0,
		zoomLevel: 1.0,
		previousZoom: 1.0,
		pendingScrollTop: null as number | null,

		pdfScrollContainer: undefined as HTMLElement | undefined,
		scrollY: 0,
		viewportHeight: 0,

		smoothPercent: 0,
		isDraggingSeek: false,
		hasMoved: false,
		startY: 0,
		previewPercent: 0,
		seekBarElement: null as HTMLElement | null,

		aspectRatios: {} as Record<number, number>,
		baseWidth: 1000,

		searchQuery: "",
		searchResults: [] as { pageIndex: number; matchIndex: number; snippet: string }[],
		currentSearchResultIndex: -1,
	});

	const GAP = 16;
	const defaultAspectRatio = 1.414;

	function getPageHeight(index: number, zoom: number = s.zoomLevel) {
		return s.baseWidth * zoom * (s.aspectRatios[index] || defaultAspectRatio);
	}

	const virtualData = $derived.by(() => {
		if (s.numPages === 0) return { start: 0, end: 0, topOffset: 0, bottomOffset: 0, offsets: [] };
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
				if (total >= s.scrollY + s.viewportHeight + preloadPixels && end === 0) {
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

		return { start, end, topOffset, bottomOffset: Math.max(0, bottomOffset), offsets };
	});

	const visiblePages = $derived(
		s.numPages > 0 ? Array.from({ length: Math.max(0, virtualData.end - virtualData.start + 1) }, (_, i) => virtualData.start + i) : []
	);

	function updateCurrentPageAndScroll() {
		if (s.numPages > 0 && virtualData.offsets.length > 0 && !s.isDraggingSeek) {
			const centerPoint = s.scrollY + (s.viewportHeight / 2);
			let closestIndex = 0;
			for (let i = 0; i < s.numPages; i++) {
				if (virtualData.offsets[i] > centerPoint) {
					closestIndex = Math.max(0, i - 1);
					break;
				}
				closestIndex = i;
			}
			s.currentPageIndex = closestIndex;

			const maxScroll = Math.max(1, (virtualData.offsets[s.numPages - 1] + getPageHeight(s.numPages - 1)) - s.viewportHeight);
			s.smoothPercent = Math.min(100, Math.max(0, (s.scrollY / maxScroll) * 100));
		}
	}

	async function loadPdf() {
		if (!s.pdfPath || s.isLoading || !s.pdfjs) return;
		s.isLoading = true;
		s.errorMsg = '';
		try {
			const loadingTask = s.pdfjs.getDocument(`/api/ebook?path=${encodeURIComponent(s.pdfPath)}`);
			s.pdfDoc = await loadingTask.promise;
			s.numPages = s.pdfDoc.numPages;
		} catch (e: any) {
			console.error("Error loading PDF:", e);
			s.errorMsg = e.message || "Failed to load PDF";
		} finally {
			s.isLoading = false;
		}
	}

	async function loadLibraries() {
		s.baseWidth = Math.min(window.innerWidth * 0.9, 1000);
		window.addEventListener('resize', () => {
			s.baseWidth = Math.min(window.innerWidth * 0.9, 1000);
		});

		const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
		s.pdfjs = mod;

		if (s.pdfjs && !s.pdfjs.GlobalWorkerOptions.workerSrc) {
			s.pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
		}
		loadPdf();
	}

	function scrollToIndex(index: number, behavior: ScrollBehavior = 'smooth') {
		if (!s.pdfScrollContainer) return;
		if (virtualData.offsets && virtualData.offsets[index] !== undefined) {
			s.pdfScrollContainer.scrollTo({ top: virtualData.offsets[index], behavior });
		}
	}

	function setZoom(newZoom: number, cursorY?: number) {
		if (!s.pdfScrollContainer || newZoom === s.zoomLevel) return;

		const yAnchor = cursorY ?? (window.innerHeight / 2);
		const ratio = newZoom / s.zoomLevel;
		const absoluteY = s.scrollY + yAnchor;
		const newAbsoluteY = absoluteY * ratio;

		s.zoomLevel = newZoom;
		s.pendingScrollTop = newAbsoluteY - yAnchor;

		tick().then(() => {
			if (s.pdfScrollContainer && s.pendingScrollTop !== null) {
				s.pdfScrollContainer.scrollTop = s.pendingScrollTop;
				s.pendingScrollTop = null;
			}
		});
	}

	function toggleFit() {
		if (s.zoomLevel >= 0.99 && s.zoomLevel <= 1.01) {
			setZoom(s.previousZoom < 0.99 ? s.previousZoom : 0.6);
		} else {
			s.previousZoom = s.zoomLevel;
			setZoom(1);
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

				const regex = new RegExp(s.searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
				let match;
				while ((match = regex.exec(text)) !== null) {
					const startSnippet = Math.max(0, match.index - 40);
					const endSnippet = Math.min(text.length, match.index + s.searchQuery.length + 40);
					const before = text.substring(startSnippet, match.index);
					const after = text.substring(match.index + s.searchQuery.length, endSnippet);

					s.searchResults.push({
						pageIndex: i,
						matchIndex: match.index,
						snippet: `... ${before}<mark class="bg-yellow-400/50 text-white rounded">${text.substring(match.index, match.index + s.searchQuery.length)}</mark>${after} ...`
					});
				}
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
		s.currentSearchResultIndex = (s.currentSearchResultIndex + 1) % s.searchResults.length;
		scrollToIndex(s.searchResults[s.currentSearchResultIndex].pageIndex);
	}

	function prevSearchResult() {
		if (s.searchResults.length === 0) return;
		s.currentSearchResultIndex = (s.currentSearchResultIndex - 1 + s.searchResults.length) % s.searchResults.length;
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
		const percentage = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) * 100;
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
				scrollToIndex(Math.min(targetIdx, s.numPages - 1), 'instant');
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
		if (e.clientX > rightThreshold || s.isEditingPage || s.isJumpPopupOpen || s.isSearchSidebarOpen) {
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

	async function renderPageToCanvas(pageIndex: number, canvas: HTMLCanvasElement, textLayerDiv: HTMLDivElement) {
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
			const context = canvas.getContext('2d');
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
					textLayerDiv.innerHTML = '';

					const parentWidth = canvas.parentElement?.clientWidth || viewport.width / viewport.scale;
					const pageWidthPt = viewport.width / viewport.scale;
					const pageHeightPt = viewport.height / viewport.height * viewport.height / viewport.scale;
					const totalScaleFactor = parentWidth / pageWidthPt;

					// Store PDF-point dimensions for ResizeObserver
					textLayerDiv.setAttribute('data-pt-w', String(pageWidthPt));
					// Keep data-vw/vh for highlightAction compatibility
					textLayerDiv.setAttribute('data-vw', String(viewport.width));
					textLayerDiv.setAttribute('data-vh', String(viewport.height));

					// Set CSS vars — TextLayer v5 uses these to size/position itself
					textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));
					textLayerDiv.style.setProperty('--total-scale-factor', String(totalScaleFactor));
					textLayerDiv.style.setProperty('--scale-round-x', '1px');
					textLayerDiv.style.setProperty('--scale-round-y', '1px');

					// Don't set width/height/transform — TextLayer manages those
					const textContentSource = page.streamTextContent();
					const textLayer = new s.pdfjs.TextLayer({
						textContentSource,
						container: textLayerDiv,
						viewport,
					});
					await textLayer.render();
				}
			} catch (e) {
				console.error('TextLayer rendering failed:', e);
			}
		} catch (e: any) {
			if (e.name !== 'RenderingCancelledException') {
				console.error(`Error rendering page ${pageIndex}:`, e);
			}
		}
	}

	function clearCanvas(canvas: HTMLCanvasElement, index: number) {
		if (renderTasks.has(index)) {
			try {
				renderTasks.get(index).cancel();
			} catch (e) {}
			renderTasks.delete(index);
		}
		const context = canvas.getContext('2d');
		if (context) {
			context.clearRect(0, 0, canvas.width, canvas.height);
		}
	}

	function destroy() {
		if (s.pdfDoc) s.pdfDoc.destroy();
		for (const task of renderTasks.values()) {
			try {
				task.cancel();
			} catch (e) {}
		}
		renderTasks.clear();
	}

	return {
		state: s,
		get virtualData() { return virtualData; },
		get visiblePages() { return visiblePages; },

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
		clearCanvas,
		destroy
	};
}
