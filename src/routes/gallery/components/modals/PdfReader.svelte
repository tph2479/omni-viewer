<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { createPdfController } from './pdfController.svelte';
	import 'pdfjs-dist/web/pdf_viewer.css';

	let {
		isPdfMode = $bindable(),
		pdfPath,
		onCloseCallback
	}: {
		isPdfMode: boolean;
		pdfPath: string;
		onCloseCallback?: () => void;
	} = $props();

	const pdf = createPdfController(pdfPath);
	let s = $derived(pdf.state);

	$effect(() => {
		pdf.updateCurrentPageAndScroll();
	});

	onMount(() => {
		pdf.loadLibraries();
	});

	onDestroy(() => {
		pdf.destroy();
	});

	function closePdf() {
		isPdfMode = false;
		if (onCloseCallback) onCloseCallback();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.target instanceof HTMLInputElement) return;
		if (event.key === 'Escape') {
			if (s.isSearchSidebarOpen) {
				s.isSearchSidebarOpen = false;
				s.isSearching = false;
			} else {
				closePdf();
			}
		}
		if (event.code === 'KeyF' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			s.isSearchSidebarOpen = true;
			s.controlsVisible = true;
		}
		if (event.code === 'KeyZ') {
			event.preventDefault();
			pdf.toggleFit();
		}
	}

	function pageAction(node: HTMLCanvasElement, index: number) {
		const parent = node.parentElement;
		const textLayerDiv = parent?.querySelector('.textLayer') as HTMLDivElement;
		
		pdf.renderPageToCanvas(index, node, textLayerDiv);

		let resizeObserver: ResizeObserver | null = null;
		if (parent && textLayerDiv) {
			resizeObserver = new ResizeObserver(entries => {
				for (const entry of entries) {
					const width = entry.contentRect.width;
					const height = entry.contentRect.height;
					const vw = textLayerDiv.getAttribute('data-vw');
					const vh = textLayerDiv.getAttribute('data-vh');
					if (vw && vh) {
						const scaleX = width / parseFloat(vw);
						const scaleY = height / parseFloat(vh);
						textLayerDiv.style.transform = `scale(${scaleX}, ${scaleY})`;
					}
				}
			});
			resizeObserver.observe(parent);
		}

		return {
			destroy() { 
				pdf.clearCanvas(node, index);
				if (textLayerDiv) textLayerDiv.innerHTML = '';
				if (resizeObserver) resizeObserver.disconnect();
			}
		};
	}

	function highlightAction(node: HTMLDivElement, params: any) {
		let currentParams = params;
		
		function applyHighlights() {
			const textLayerDiv = node.querySelector('.textLayer');
			if (!textLayerDiv) return;
			textLayerDiv.querySelectorAll('.pdf-highlight').forEach(el => el.remove());
			
			const { i, searchQuery, searchResults, currentSearchResultIndex } = currentParams;
			if (!searchQuery || searchResults.length === 0) return;
			
			const pageMatches = searchResults.filter((r: any) => r.pageIndex === i);
			if (pageMatches.length === 0) return;
			
			const spans = textLayerDiv.querySelectorAll('span:not(.pdf-highlight)');
			if (spans.length === 0) return;
			
			let text = "";
			const spanOffsets = [];
			for (let idx = 0; idx < spans.length; idx++) {
				const start = text.length;
				text += spans[idx].textContent + " ";
				spanOffsets.push({ start, end: text.length - 1, spanIndex: idx });
			}
			
			const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
			let match;
			while ((match = regex.exec(text)) !== null) {
				const startMatch = match.index;
				const endMatch = match.index + searchQuery.length;
				
				const currentMatchObj = searchResults[currentSearchResultIndex];
				const isSelected = currentMatchObj && currentMatchObj.pageIndex === i && currentMatchObj.matchIndex === startMatch;
				
				for (const off of spanOffsets) {
					if (Math.max(startMatch, off.start) < Math.min(endMatch, off.end)) {
						const span = spans[off.spanIndex] as HTMLElement;
						const h = document.createElement('div');
						h.className = `pdf-highlight absolute pointer-events-none rounded mix-blend-multiply z-20 ${isSelected ? 'bg-orange-500/60 shadow-[0_0_8px_rgba(249,115,22,0.6)]' : 'bg-yellow-400/40'}`;
						h.style.left = span.offsetLeft + 'px';
						h.style.top = span.offsetTop + 'px';
						h.style.width = span.offsetWidth + 'px';
						h.style.height = span.offsetHeight + 'px';
						h.style.transform = span.style.transform;
						h.style.transformOrigin = span.style.transformOrigin;
						textLayerDiv.appendChild(h);
					}
				}
			}
		}

		const textLayerDiv = node.querySelector('.textLayer');
		let observer: MutationObserver | null = null;
		if (textLayerDiv) {
			observer = new MutationObserver(() => applyHighlights());
			observer.observe(textLayerDiv, { childList: true });
			applyHighlights();
		}

		return {
			update(newParams: any) {
				currentParams = newParams;
				applyHighlights();
			},
			destroy() {
				if (observer) observer.disconnect();
			}
		};
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
	:global(.pdf-dark-mode canvas) {
		filter: invert(1) hue-rotate(180deg) contrast(0.9);
	}
	:global(.pdf-dark-mode .textLayer) {
		mix-blend-mode: difference;
	}
	:global(.textLayer) {
		position: absolute;
		left: 0; top: 0;
		overflow: visible;
		opacity: 1;
		line-height: 1;
		cursor: text !important;
		user-select: text !important;
		-webkit-user-select: text !important;
	}
	:global(.textLayer span),
	:global(.textLayer br) {
		color: transparent;
		position: absolute;
		white-space: pre;
		cursor: text !important;
		user-select: text !important;
		-webkit-user-select: text !important;
		transform-origin: 0% 0%;
	}
	:global(.textLayer ::selection) {
		background: rgba(0, 0, 255, 0.25);
		color: transparent;
	}
	:global(.pdf-dark-mode .textLayer ::selection) {
		background: rgba(255, 255, 0, 0.25);
	}
	/* Fix pdf.js endOfContent div that blocks text selection */
	:global(.textLayer .endOfContent) {
		display: none !important;
	}
</style>

<svelte:window 
	onkeydown={handleKeyDown} 
	onmousemove={pdf.handleWindowMouseMove} 
	onmouseup={pdf.handleWindowMouseUp} 
/>

{#if s.isSearchSidebarOpen}
<div class="fixed inset-y-0 right-0 w-80 sm:w-96 bg-zinc-950/95 border-l border-white/10 backdrop-blur-xl shadow-2xl z-[400] overflow-hidden flex flex-col animate-in slide-in-from-right duration-300">
	<div class="p-4 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md shrink-0 flex flex-col gap-3">
		<div class="flex items-center justify-between">
			<h2 class="text-white font-bold text-lg">Search PDF</h2>
			<button class="btn btn-ghost btn-sm btn-circle text-white/50 hover:text-white transition-colors" onclick={() => { s.isSearchSidebarOpen = false; s.isSearching = false; }}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" stroke-width="2"/></svg>
			</button>
		</div>
		<div class="flex gap-2">
			<input 
				type="text" 
				bind:value={s.searchQuery} 
				placeholder="Find in document..." 
				class="input input-sm flex-1 bg-white/10 text-white border-none focus:outline-none focus:ring-1 focus:ring-primary"
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						s.isSearching = false;
						setTimeout(() => pdf.handleSearch(), 50);
					}
				}}
			/>
			<button class="btn btn-sm btn-primary min-h-0 h-8 px-3" onclick={() => { s.isSearching = false; setTimeout(() => pdf.handleSearch(), 50); }}>
				{#if s.isSearching}
					<span class="loading loading-spinner loading-xs text-white"></span>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" stroke-width="2"/></svg>
				{/if}
			</button>
		</div>
		{#if s.searchResults.length > 0}
			<div class="text-xs text-white/50 font-mono">{s.searchResults.length} matches found</div>
		{/if}
	</div>
	
	<div class="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
		{#each s.searchResults as result, i}
			<button 
				class="text-left w-full p-3 rounded-lg hover:bg-white/5 transition-colors border border-transparent {s.currentSearchResultIndex === i ? 'bg-primary/20 border-primary/50' : ''}"
				onclick={() => {
					s.currentSearchResultIndex = i;
					pdf.scrollToIndex(result.pageIndex);
					if (window.innerWidth < 768) s.isSearchSidebarOpen = false;
				}}
			>
				<div class="flex items-center justify-between mb-1">
					<span class="text-primary font-mono text-xs font-bold">Page {result.pageIndex + 1}</span>
				</div>
				<div class="text-white/80 text-sm leading-relaxed text-ellipsis overflow-hidden">
					{@html result.snippet}
				</div>
			</button>
		{/each}
		{#if s.isSearching}
			<div class="p-8 flex justify-center"><span class="loading loading-dots loading-md text-primary"></span></div>
		{:else if s.searchResults.length === 0 && s.searchQuery}
			<div class="p-8 text-center text-white/40 text-sm">No results found for "{s.searchQuery}"</div>
		{/if}
	</div>
</div>
{/if}

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div 
	bind:this={s.pdfScrollContainer}
	tabindex="0"
	class="pdf-scroll fixed inset-0 z-[300] bg-zinc-950 overflow-y-auto animate-in fade-in duration-200 focus:outline-none {s.isDarkMode ? 'pdf-dark-mode' : ''}" 
	onmousemove={pdf.handleContainerMouseMove}
	onclick={() => { if (s.isSearchSidebarOpen && window.innerWidth < 768) s.isSearchSidebarOpen = false; }}
	onscroll={(e) => { s.scrollY = e.currentTarget.scrollTop; }}
	bind:clientHeight={s.viewportHeight}
	onwheel={(e) => {
		if (e.ctrlKey) {
			e.preventDefault();
			let delta = e.deltaY;
			if (e.deltaMode === 1) delta *= 33;
			const newZoom = Math.min(5, Math.max(0.1, s.zoomLevel * Math.pow(1.0015, -delta)));
			pdf.setZoom(newZoom, e.clientY);
		}
	}}
>
	<!-- Top Controls -->
	<div class="fixed top-4 right-4 sm:right-6 pointer-events-none z-[110] transition-all duration-300 {s.controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}">
		<div class="flex items-center justify-end gap-2">
			{#if !s.isSearchSidebarOpen}
				<button class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto transition-all" onclick={() => s.isSearchSidebarOpen = true}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
				</button>
			{/if}
			<button class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto transition-all" onclick={() => s.isDarkMode = !s.isDarkMode}>
				{#if s.isDarkMode}
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
				{/if}
			</button>
			<button aria-label="Close (ESC)" class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto transition-all hover:scale-110" onclick={closePdf}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
			</button>
		</div>
	</div>

	<!-- Side Controls -->
	<div class="fixed top-20 right-4 sm:right-6 bottom-4 flex flex-col items-end gap-2 z-[110] pointer-events-none transition-all duration-300 {s.controlsVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}">
		<div class="flex flex-col items-end gap-2 pointer-events-auto h-full">
			<button class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl" onclick={pdf.toggleFit}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
			</button>

			<div class="flex flex-col bg-zinc-900/90 rounded-xl backdrop-blur-xl border border-white/10 shadow-2xl mt-1 w-12 overflow-hidden">
				<button class="btn btn-ghost btn-sm h-12 w-12 p-0 text-white rounded-none border-b border-white/10" onclick={() => pdf.setZoom(s.zoomLevel * 1.2)}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
				</button>
				<span class="py-2 text-[10px] font-mono font-black text-white text-center bg-white/5">
					{Math.round(s.zoomLevel * 100)}%
				</span>
				<button class="btn btn-ghost btn-sm h-12 w-12 p-0 text-white rounded-none border-t border-white/10" onclick={() => pdf.setZoom(s.zoomLevel / 1.2)}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" /></svg>
				</button>
			</div>

			<div class="flex-1 flex flex-col items-center gap-2 mt-1 bg-zinc-900/90 py-4 rounded-xl border border-white/10 shadow-2xl pointer-events-auto w-12 backdrop-blur-xl overflow-hidden px-0">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div 
					bind:this={s.seekBarElement}
					class="flex-1 w-3 sm:w-4 bg-white/10 rounded-full overflow-hidden border border-white/5 shadow-inner my-1 cursor-pointer group hover:bg-white/20 transition-colors relative"
					onmousedown={pdf.handleSeekBarMouseDown}
				>
					<!-- Current Progress -->
					<div 
						class="absolute top-0 left-0 w-full bg-primary rounded-full transition-all duration-75 ease-out origin-top z-10" 
						style="height: {s.smoothPercent}%"
					></div>
					
					<!-- Drag Preview -->
					{#if s.isDraggingSeek && s.hasMoved}
						<div 
							class="absolute top-0 left-0 w-full bg-white/30 rounded-full origin-top z-20" 
							style="height: {s.previewPercent}%"
						></div>
					{/if}
				</div>
				<div class="flex flex-col items-center gap-1 mt-auto pb-1">
					<span class="text-sm sm:text-base font-mono font-black text-white/90">
						{Math.round(s.isDraggingSeek && s.hasMoved ? s.previewPercent : s.smoothPercent)}%
					</span>
					<button 
						aria-label="Edit Page Number"
						class="btn btn-ghost btn-circle w-10 h-10 min-h-0 p-0 text-white hover:bg-white/10 transition-all mt-1 flex items-center justify-center"
						onclick={(e) => { e.stopPropagation(); s.isJumpPopupOpen = !s.isJumpPopupOpen; }}
						onmousedown={(e) => e.preventDefault()}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
						</svg>
					</button>
				</div>
			</div>

			{#if s.isJumpPopupOpen}
				<div 
					class="bg-zinc-900/90 px-4 py-2 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto text-right min-h-[3rem] flex items-center justify-center font-mono font-black text-sm sm:text-base focus:outline-none animate-in fade-in slide-in-from-right-2 duration-200"
				>
					<span
						contenteditable="true"
						inputmode="numeric"
						class="text-white/90 focus:outline-none hover:bg-white/5 rounded px-1 transition-colors min-w-[1ch]"
						onfocus={(e) => {
							s.isEditingPage = true;
							if (s.hideTimerId) {
								clearTimeout(s.hideTimerId);
								s.hideTimerId = null;
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
								pdf.handlePageInput(e.currentTarget.innerText);
								s.isJumpPopupOpen = false;
								e.currentTarget.blur();
							}
							e.stopPropagation();
						}}
						onblur={(e) => {
							s.isEditingPage = false;
							setTimeout(() => {
								if (!s.isEditingPage) {
									s.isJumpPopupOpen = false;
								}
							}, 100);
							e.currentTarget.innerText = String(s.currentPageIndex + 1);
						}}
					>
						{s.currentPageIndex + 1}
					</span>
					<span class="text-white/40 ml-2">/ {s.numPages}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- PDF Content -->
	<div class="flex flex-col items-center pb-20 pt-4 min-h-screen w-full">
		{#if s.isLoading}
			<div class="h-screen flex items-center justify-center">
				<span class="loading loading-spinner loading-lg text-primary/50"></span>
			</div>
		{:else if s.errorMsg}
			<div class="h-screen flex items-center justify-center text-error font-bold">
				{s.errorMsg}
			</div>
		{:else if s.numPages > 0}
			<div style="height: {pdf.virtualData.topOffset}px; flex-shrink: 0; width: 100%;"></div>
			
			<div class="flex flex-col items-center gap-4 w-full">
				{#each pdf.visiblePages as i (i)}
					{@const pageMatches = s.searchResults.filter((r: any) => r.pageIndex === i).length}
					<div 
						id="pdf-page-{i}" 
						use:highlightAction={{i, searchQuery: s.searchQuery, searchResults: s.searchResults, currentSearchResultIndex: s.currentSearchResultIndex}}
						class="bg-white shadow-2xl relative flex items-center justify-center"
						style="height: {pdf.getPageHeight(i)}px; width: {90 * s.zoomLevel}%; max-width: {1000 * s.zoomLevel}px;"
					>
						<canvas use:pageAction={i} class="absolute w-full h-full block object-contain z-0 pointer-events-none"></canvas>
						<div class="textLayer absolute inset-0 z-10 pointer-events-auto overflow-hidden"></div>
						
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
			</div>

			<div style="height: {pdf.virtualData.bottomOffset}px; flex-shrink: 0; width: 100%;"></div>
		{/if}
	</div>
</div>
