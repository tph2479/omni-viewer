<script lang="ts">
	import { tick, onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
	
	let pdfjs: any = $state(null);


	let {
		isPdfMode = $bindable(),
		pdfPath,
		onCloseCallback
	}: {
		isPdfMode: boolean;
		pdfPath: string;
		onCloseCallback?: () => void;
	} = $props();

	let pdfDoc: any = $state(null);
	let numPages = $state(0);
	let isLoading = $state(false);
	let errorMsg = $state('');

	let controlsVisible = $state(false);
	let isEditingPage = $state(false);
	let isJumpPopupOpen = $state(false);
	let isSearchOpen = $state(false);
	let hideTimerId: any = null;

	let currentPageIndex = $state(0);
	let zoomLevel = $state(1.0);
	let previousZoom = $state(1.0);

	let pdfScrollContainer: HTMLElement | undefined = $state();
	// Progress updated dynamically via tracker (IntersectionObserver)
	let smoothPercent = $state(0);
	const indexPercent = $derived(numPages > 0 ? ((currentPageIndex + 1) / numPages) * 100 : 0);

	// Seek bar dragging logic (mirrored from WebtoonReader)
	let isDraggingSeek = $state(false);
	let hasMoved = $state(false);
	let startY = 0;
	let previewPercent = $state(0);
	let seekBarElement = $state<HTMLElement | null>(null);

	function handleSeekBarMouseDown(e: MouseEvent) {
		if (!seekBarElement) return;
		isDraggingSeek = true;
		hasMoved = false;
		startY = e.clientY;
		updatePreview(e);
		
		const targetIdx = Math.floor((previewPercent / 100) * numPages);
		scrollToIndex(Math.min(targetIdx, numPages - 1));
	}

	function updatePreview(e: MouseEvent) {
		if (!seekBarElement) return;
		const rect = seekBarElement.getBoundingClientRect();
		const percentage = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) * 100;
		previewPercent = percentage;
	}

	function handleWindowMouseMove(e: MouseEvent) {
		if (isDraggingSeek) {
			if (!hasMoved && Math.abs(e.clientY - startY) > 5) {
				hasMoved = true;
			}
			updatePreview(e);
			if (hasMoved) {
				const targetIdx = Math.floor((previewPercent / 100) * numPages);
				scrollToIndex(Math.min(targetIdx, numPages - 1), 'instant');
			}
		}
	}

	function handleWindowMouseUp() {
		if (isDraggingSeek) {
			isDraggingSeek = false;
			hasMoved = false;
		}
	}

	async function loadPdf() {
		if (!pdfPath || isLoading || !pdfjs) return;
		isLoading = true;
		errorMsg = '';
		try {
			const loadingTask = pdfjs.getDocument(`/api/ebook?path=${encodeURIComponent(pdfPath)}`);
			pdfDoc = await loadingTask.promise;
			numPages = pdfDoc.numPages;
		} catch (e: any) {
			console.error("Error loading PDF:", e);
			errorMsg = e.message || "Failed to load PDF";
		} finally {
			isLoading = false;
		}
	}

	onMount(async () => {
		if (browser) {
			const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
			pdfjs = mod;
			
			// Set worker source immediately after import to guarantee consistency
			if (pdfjs && !pdfjs.GlobalWorkerOptions.workerSrc) {
				pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
			}
			
			loadPdf();
		}
	});

	onDestroy(() => {
		if (pdfDoc) pdfDoc.destroy();
		for (const task of renderTasks.values()) {
			try {
				task.cancel();
			} catch (e) {}
		}
		renderTasks.clear();
	});

	function closePdf() {
		isPdfMode = false;
		if (onCloseCallback) onCloseCallback();
	}

	function scrollToIndex(index: number, behavior: ScrollBehavior = 'smooth') {
		if (!pdfScrollContainer) return;
		const target = document.getElementById(`pdf-page-${index}`);
		if (target) {
			target.scrollIntoView({ behavior, block: 'start' });
		}
	}

	function handlePageInput(val: string) {
		const page = parseInt(val);
		if (!isNaN(page) && page >= 1 && page <= numPages) {
			scrollToIndex(page - 1);
		}
	}

	function setZoom(newZoom: number, cursorY?: number) {
		if (!pdfScrollContainer || newZoom === zoomLevel) return;
		
		const oldZoom = zoomLevel;
		const ratio = newZoom / oldZoom;
		const paddingTop = 16;
		const yAnchor = cursorY ?? (window.innerHeight / 2);
		
		const currentScroll = pendingScrollTop !== null ? pendingScrollTop : pdfScrollContainer.scrollTop;
		const contentY = currentScroll + yAnchor - paddingTop;
		
		zoomLevel = newZoom;
		pendingScrollTop = (contentY * ratio) + paddingTop - yAnchor;
		
		tick().then(() => {
			if (pdfScrollContainer && pendingScrollTop !== null) {
				pdfScrollContainer.scrollTop = pendingScrollTop;
				pendingScrollTop = null;
			}
		});
	}

	function toggleFit() {
		if (zoomLevel >= 0.99 && zoomLevel <= 1.01) {
			setZoom(previousZoom < 0.99 ? previousZoom : 0.6);
		} else {
			previousZoom = zoomLevel;
			setZoom(1);
		}
	}

	function trackPageIndex(node: HTMLElement, index: number) {
		const visObserver = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					currentPageIndex = index;
					smoothPercent = ((index + 1) / numPages) * 100;
				}
			});
		}, {
			rootMargin: '0px 0px -50% 0px',
			threshold: 0
		});

		visObserver.observe(node);
		return { destroy() { visObserver.disconnect(); } };
	}

	// ── Rendering Page ───────────────────────────────────────────────────────
	// ── Rendering Page ───────────────────────────────────────────────────────
	// Similar to WebtoonReader's buffering, we only render nearby pages.
	// PAGES far from the viewport have their canvas cleared to save GPU memory.
	const RENDER_BUFFER = 5;
	let pageHeights: Record<number, number> = $state({});
	let renderedPages = $state(new Set<number>());
	let renderTasks = new Map<number, any>();

	async function renderPageToCanvas(pageIndex: number, canvas: HTMLCanvasElement) {
		if (!pdfDoc) return;
		
		// Cancel existing task if any
		if (renderTasks.has(pageIndex)) {
			try {
				renderTasks.get(pageIndex).cancel();
			} catch (e) {}
			renderTasks.delete(pageIndex);
		}

		try {
			const page = await pdfDoc.getPage(pageIndex + 1);
			const viewport = page.getViewport({ scale: 2.0 });
			const context = canvas.getContext('2d');
			if (!context) return;

			canvas.height = viewport.height;
			canvas.width = viewport.width;
			
			// Cache height for placeholder (relative to current width)
			pageHeights[pageIndex] = (viewport.height / viewport.width) * (canvas.clientWidth || 800);

			const renderTask = page.render({ canvasContext: context, viewport });
			renderTasks.set(pageIndex, renderTask);
			
			await renderTask.promise;
			renderTasks.delete(pageIndex);
			renderedPages.add(pageIndex);
		} catch (e: any) {
			if (e.name === 'RenderingCancelledException') {
				// Normal cancellation, do nothing
			} else {
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
		renderedPages.delete(index);
	}

	function pageAction(node: HTMLCanvasElement, index: number) {
		const observer = new IntersectionObserver((entries) => {
			const isVisible = entries[0].isIntersecting;
			const inBuffer = Math.abs(index - currentPageIndex) <= RENDER_BUFFER;

			if (isVisible || inBuffer) {
				if (!renderedPages.has(index)) {
					renderPageToCanvas(index, node);
				}
			} else {
				if (renderedPages.has(index)) {
					clearCanvas(node, index);
				}
			}
		}, { rootMargin: '100% 0px' }); // Render 1 screen ahead/behind

		observer.observe(node);
		
		// Reaction to current page changes for buffering
		const cleanupEffect = $effect.root(() => {
			$effect(() => {
				const inBuffer = Math.abs(index - currentPageIndex) <= RENDER_BUFFER;
				if (!inBuffer && renderedPages.has(index)) {
					clearCanvas(node, index);
				} else if (inBuffer && !renderedPages.has(index)) {
					// We don't want to force render all buffer pages immediately to avoid lag,
					// but we could if we wanted them ready. For now, let IntersectionObserver handle it.
				}
			});
		});

		return {
			destroy() { 
				observer.disconnect();
				cleanupEffect();
			}
		};
	}

	// ── Search Logic ─────────────────────────────────────────────────────────
	async function handleSearch() {
		if (!searchQuery || !pdfDoc) return;
		
		isLoading = true; // Show loading while searching large PDFs
		searchResults = [];
		currentSearchResultIndex = -1;

		try {
			for (let i = 0; i < numPages; i++) {
				const page = await pdfDoc.getPage(i + 1);
				const textContent = await page.getTextContent();
				const text = textContent.items.map((item: any) => item.str).join(" ");
				
				const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
				let match;
				while ((match = regex.exec(text)) !== null) {
					searchResults.push({ pageIndex: i, matchIndex: match.index });
				}
			}

			if (searchResults.length > 0) {
				currentSearchResultIndex = 0;
				scrollToIndex(searchResults[0].pageIndex);
			}
		} catch (e) {
			console.error("Search error:", e);
		} finally {
			isLoading = false;
		}
	}

	function nextSearchResult() {
		if (searchResults.length === 0) return;
		currentSearchResultIndex = (currentSearchResultIndex + 1) % searchResults.length;
		scrollToIndex(searchResults[currentSearchResultIndex].pageIndex);
	}

	function prevSearchResult() {
		if (searchResults.length === 0) return;
		currentSearchResultIndex = (currentSearchResultIndex - 1 + searchResults.length) % searchResults.length;
		scrollToIndex(searchResults[currentSearchResultIndex].pageIndex);
	}

	// ── UI Helpers ──────────────────────────────────────────────────────────
	// Search state
	let searchQuery = $state("");
	let searchResults: { pageIndex: number; matchIndex: number }[] = $state([]);
	let currentSearchResultIndex = $state(-1);

	function handleMouseMove(e: MouseEvent) {
		const width = window.innerWidth;
		const rightThreshold = width * 0.8;
		if (e.clientX > rightThreshold || isEditingPage || isJumpPopupOpen || isSearchOpen) {
			controlsVisible = true;
			if (hideTimerId) clearTimeout(hideTimerId);
			if (!isEditingPage && !isJumpPopupOpen && !isSearchOpen) {
				hideTimerId = setTimeout(() => {
					controlsVisible = false;
					hideTimerId = null;
				}, 2000);
			}
		} else {
			controlsVisible = false;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.target instanceof HTMLInputElement) return;
		if (event.key === 'Escape') {
			if (isSearchOpen) isSearchOpen = false;
			else closePdf();
		}
		if (event.code === 'KeyF' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			isSearchOpen = true;
			controlsVisible = true;
		}
		if (event.code === 'KeyZ') {
			event.preventDefault();
			toggleFit();
		}
	}
</script>

<style>
	:global(.pdf-scroll) {
		scrollbar-width: none;
		overflow-anchor: auto;
	}
	:global(.pdf-scroll::-webkit-scrollbar) {
		display: none;
	}
	canvas {
		max-width: 100%;
		height: auto !important;
	}
</style>

<svelte:window 
	onkeydown={handleKeyDown} 
	onmousemove={handleWindowMouseMove} 
	onmouseup={handleWindowMouseUp} 
/>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div 
	bind:this={pdfScrollContainer}
	tabindex="0"
	class="pdf-scroll fixed inset-0 z-[300] bg-zinc-950 overflow-y-auto animate-in fade-in duration-200 focus:outline-none" 
	onmousemove={handleMouseMove}
	onwheel={(e) => {
		if (e.ctrlKey) {
			e.preventDefault();
			let delta = e.deltaY;
			if (e.deltaMode === 1) delta *= 33;
			const newZoom = Math.min(5, Math.max(0.1, zoomLevel * Math.pow(1.0015, -delta)));
			setZoom(newZoom, e.clientY);
		}
	}}
>
	<!-- Top Controls -->
	<div class="fixed top-4 right-4 sm:right-6 pointer-events-none z-[110] transition-all duration-300 {controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}">
		<div class="flex items-center justify-end gap-2">
			{#if isSearchOpen}
				<div class="flex items-center bg-zinc-900/90 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto overflow-hidden px-2 py-1 animate-in slide-in-from-right-4 duration-200">
					<input 
						type="text" 
						bind:value={searchQuery} 
						placeholder="Search..." 
						class="bg-transparent text-white text-sm px-2 outline-none w-40 sm:w-60"
						onkeydown={(e) => e.key === 'Enter' && handleSearch()}
					/>
					<div class="flex items-center gap-1 border-l border-white/10 ml-2 pl-2">
						<span class="text-[10px] text-white/40 font-mono">
							{#if searchResults.length > 0}
								{currentSearchResultIndex + 1}/{searchResults.length}
							{:else}
								0/0
							{/if}
						</span>
						<button class="btn btn-ghost btn-xs text-white/60 p-0" onclick={prevSearchResult}>
							<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M5 15l7-7 7 7" stroke-width="2.5"/></svg>
						</button>
						<button class="btn btn-ghost btn-xs text-white/60 p-0" onclick={nextSearchResult}>
							<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" stroke-width="2.5"/></svg>
						</button>
						<button class="btn btn-ghost btn-xs text-white/60 p-0 ml-1" onclick={() => isSearchOpen = false}>
							<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" stroke-width="2.5"/></svg>
						</button>
					</div>
				</div>
			{:else}
				<button class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto transition-all" onclick={() => isSearchOpen = true}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
				</button>
			{/if}
			<button aria-label="Close (ESC)" class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto transition-all hover:scale-110" onclick={closePdf}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
			</button>
		</div>
	</div>

	<!-- Side Controls -->
	<div class="fixed top-20 right-4 sm:right-6 bottom-4 flex flex-col items-end gap-2 z-[110] pointer-events-none transition-all duration-300 {controlsVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}">
		<div class="flex flex-col items-end gap-2 pointer-events-auto h-full">
			<button class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl" onclick={toggleFit}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
			</button>

			<div class="flex flex-col bg-zinc-900/90 rounded-xl backdrop-blur-xl border border-white/10 shadow-2xl mt-1 w-12 overflow-hidden">
				<button class="btn btn-ghost btn-sm h-12 w-12 p-0 text-white rounded-none border-b border-white/10" onclick={() => setZoom(zoomLevel * 1.2)}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
				</button>
				<span class="py-2 text-[10px] font-mono font-black text-white text-center bg-white/5">
					{Math.round(zoomLevel * 100)}%
				</span>
				<button class="btn btn-ghost btn-sm h-12 w-12 p-0 text-white rounded-none border-t border-white/10" onclick={() => setZoom(zoomLevel / 1.2)}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" /></svg>
				</button>
			</div>

			<div class="flex-1 flex flex-col items-center gap-2 mt-1 bg-zinc-900/90 py-4 rounded-xl border border-white/10 shadow-2xl pointer-events-auto w-12 backdrop-blur-xl overflow-hidden px-0">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div 
					bind:this={seekBarElement}
					class="flex-1 w-3 sm:w-4 bg-white/10 rounded-full overflow-hidden border border-white/5 shadow-inner my-1 cursor-pointer group hover:bg-white/20 transition-colors relative"
					onmousedown={handleSeekBarMouseDown}
				>
					<!-- Current Progress -->
					<div 
						class="absolute top-0 left-0 w-full bg-primary rounded-full transition-all duration-75 ease-out origin-top z-10" 
						style="height: {smoothPercent}%"
					></div>
					
					<!-- Drag Preview -->
					{#if isDraggingSeek && hasMoved}
						<div 
							class="absolute top-0 left-0 w-full bg-white/30 rounded-full origin-top z-20" 
							style="height: {previewPercent}%"
						></div>
					{/if}
				</div>
				<div class="flex flex-col items-center gap-1 mt-auto pb-1">
					<span class="text-sm sm:text-base font-mono font-black text-white/90">
						{Math.round(isDraggingSeek && hasMoved ? previewPercent : smoothPercent)}%
					</span>
					<button 
						aria-label="Edit Page Number"
						class="btn btn-ghost btn-circle w-10 h-10 min-h-0 p-0 text-white hover:bg-white/10 transition-all mt-1 flex items-center justify-center"
						onclick={(e) => { e.stopPropagation(); isJumpPopupOpen = !isJumpPopupOpen; }}
						onmousedown={(e) => e.preventDefault()}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
						</svg>
					</button>
				</div>
			</div>

			{#if isJumpPopupOpen}
				<div 
					class="bg-zinc-900/90 px-4 py-2 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto text-right min-h-[3rem] flex items-center justify-center font-mono font-black text-sm sm:text-base focus:outline-none animate-in fade-in slide-in-from-right-2 duration-200"
				>
					<span
						contenteditable="true"
						inputmode="numeric"
						class="text-white/90 focus:outline-none hover:bg-white/5 rounded px-1 transition-colors min-w-[1ch]"
						onfocus={(e) => {
							isEditingPage = true;
							if (hideTimerId) {
								clearTimeout(hideTimerId);
								hideTimerId = null;
							}
							const range = document.createRange();
							range.selectNodeContents(e.currentTarget);
							const sel = window.getSelection();
							sel?.removeAllRanges();
							sel?.addRange(range);
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								handlePageInput(e.currentTarget.innerText);
								isJumpPopupOpen = false;
								e.currentTarget.blur();
							}
							e.stopPropagation();
						}}
						onblur={(e) => {
							isEditingPage = false;
							setTimeout(() => {
								if (!isEditingPage) {
									isJumpPopupOpen = false;
								}
							}, 100);
							e.currentTarget.innerText = String(currentPageIndex + 1);
						}}
					>
						{currentPageIndex + 1}
					</span>
					<span class="text-white/40 ml-2">/ {numPages}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- PDF Content -->
	<div class="flex flex-col items-center pb-20 pt-4 min-h-screen w-full">
		<div class="flex flex-col items-center origin-top gap-4" style="transform: scale({zoomLevel}); width: 100%;">
			{#if isLoading}
				<div class="h-screen flex items-center justify-center">
					<span class="loading loading-spinner loading-lg text-primary/50"></span>
				</div>
			{:else if errorMsg}
				<div class="h-screen flex items-center justify-center text-error font-bold">
					{errorMsg}
				</div>
			{:else}
				{#each Array.from({ length: numPages }) as _, i}
					{@const pageMatches = searchResults.filter(r => r.pageIndex === i).length}
					<div 
						id="pdf-page-{i}" 
						use:trackPageIndex={i}
						class="bg-white shadow-2xl relative"
						style="min-height: {pageHeights[i] || 800}px; width: 90%; max-width: 1000px;"
					>
						<canvas use:pageAction={i} class="w-full h-auto block"></canvas>
						
						<!-- Improved highlight overlay if searched -->
						{#if pageMatches > 0}
							<div class="absolute inset-x-0 top-0 h-6 bg-yellow-400/30 pointer-events-none flex items-center justify-center text-[10px] font-bold text-yellow-900 border-b border-yellow-400/50 backdrop-blur-sm z-10 transition-all">
								<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
								</svg>
								{pageMatches} {pageMatches === 1 ? 'MATCH' : 'MATCHES'} ON THIS PAGE
							</div>
						{/if}
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>
