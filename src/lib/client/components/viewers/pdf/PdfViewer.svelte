<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { createPdfController } from './pdfController.svelte.ts';
	import { resolveTocPages } from './pdfToc';
	import 'pdfjs-dist/web/pdf_viewer.css';
	import { X, Search, Moon, Sun, ZoomIn, ZoomOut, Maximize2, Hash, List, ChevronUp, ChevronDown } from 'lucide-svelte';

	let {
		isPdfMode = $bindable(),
		pdfPath,
		onCloseCallback
	}: {
		isPdfMode: boolean;
		pdfPath: string;
		onCloseCallback?: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	const pdf = createPdfController(pdfPath);
	const s = pdf.state;

	let searchInput: HTMLInputElement | undefined = $state();
	
	$effect(() => {
		if (s.isSearchSidebarOpen) {
			tick().then(() => {
				searchInput?.focus();
			});
		}
	});

	$effect(() => {
		if (s.pdfScrollContainer && s.viewerContainer && s.isPdfjsLoaded && !s.isViewerAppInitialized) {
			pdf.initViewerApp();
		}
	});

	$effect(() => {
		if (isPdfMode && s.pdfScrollContainer) {
			s.pdfScrollContainer.focus();
		}
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
				s.pdfScrollContainer?.focus();
			} else if (s.isTocSidebarOpen) {
				s.isTocSidebarOpen = false;
				s.pdfScrollContainer?.focus();
			} else {
				closePdf();
			}
		}
		if (event.key === 'Tab') {
			event.preventDefault();
			if (s.isTocSidebarOpen) {
				s.isTocSidebarOpen = false;
				s.pdfScrollContainer?.focus();
			} else {
				s.isTocSidebarOpen = true;
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
</script>

<style>
	:global(.pdf-scroll) {
		scrollbar-width: none;
		overflow-anchor: none;
	}
	:global(.pdf-scroll::-webkit-scrollbar) {
		display: none;
	}
	
	/* Dark Mode Overrides for PDF.js native viewer */
	:global(.pdf-dark-mode .pdfViewer .page) {
		background-color: #111 !important;
		border-color: #333 !important;
	}
	:global(.pdf-dark-mode .pdfViewer canvas) {
		filter: invert(1) hue-rotate(180deg) brightness(95%) contrast(90%);
	}
	:global(.pdf-dark-mode .pdfViewer .textLayer) {
		mix-blend-mode: difference;
	}
	
	/* Search highlighting tweaks */
	:global(.pdfViewer .textLayer .highlight.selected) {
		background-color: rgba(249, 115, 22, 0.4) !important;
		border-radius: 2px;
	}
	:global(.pdfViewer .textLayer .highlight) {
		background-color: rgba(255, 213, 0, 0.3) !important;
		border-radius: 2px;
	}
	
	/* Center the pdf page natively */
	:global(.pdfViewer .page) {
		margin-left: auto;
		margin-right: auto;
		margin-bottom: 24px;
		box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
	}
</style>

<svelte:window
	onkeydown={handleKeyDown}
	onmousemove={pdf.handleWindowMouseMove}
	onmouseup={pdf.handleWindowMouseUp}
/>

{#snippet tocItem(item: any, depth = 0)}
	<div class="flex flex-col mb-1">
		<div class="flex items-center gap-1 group">
			{#if item.items && item.items.length > 0}
				<button 
					class="w-6 h-6 flex items-center justify-center text-white/40 hover:text-white transition-colors"
					onclick={(e) => { 
						e.stopPropagation(); 
						item.expanded = !item.expanded; 
						if (item.expanded && item.items) {
							resolveTocPages(s, item.items);
						}
						s.toc = [...s.toc]; 
					}}
				>
					<span class="transition-transform duration-200" style="transform: {item.expanded ? 'rotate(90deg)' : 'rotate(0deg)'}">▶</span>
				</button>
			{:else}
				<div class="w-6 h-6"></div>
			{/if}
			<button 
				class="flex-1 text-left p-2 hover:bg-white/10 rounded transition-colors text-sm text-white/80 hover:text-white flex items-center justify-between overflow-hidden" 
				onclick={() => { 
					pdf.navigateToDest(item.dest); 
					s.isTocSidebarOpen = false;
					s.pdfScrollContainer?.focus();
				}}
			>
				<span class="truncate">{item.title}</span>
				{#if item.pageNumber}
					<span class="text-xs text-white/40 font-mono ml-2 shrink-0">{item.pageNumber}</span>
				{/if}
			</button>
		</div>
		{#if item.expanded && item.items && item.items.length > 0}
			<div class="ml-4 border-l border-white/5">
				{#each item.items as subItem}
					{@render tocItem(subItem, depth + 1)}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<!-- TOC Sidebar -->
{#if s.isTocSidebarOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[399]" onclick={() => { s.isTocSidebarOpen = false; }}></div>
<div class="fixed inset-y-0 left-0 w-80 sm:w-96 bg-zinc-950/95 border-r border-white/10 backdrop-blur-xl shadow-2xl z-[400] overflow-hidden flex flex-col animate-in slide-in-from-left duration-300">
	<div class="p-4 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md shrink-0 flex items-center justify-between">
		<h2 class="text-white font-bold text-lg">Mục lục</h2>
		<button class="btn btn-ghost btn-sm btn-circle text-white/50 hover:text-white transition-colors" onclick={() => { s.isTocSidebarOpen = false; s.pdfScrollContainer?.focus(); }}>
			<X class="h-5 w-5" />
		</button>
	</div>
	<div class="flex-1 overflow-y-auto p-4">
		{#if s.toc && s.toc.length > 0}
			{#each s.toc as item}
				{@render tocItem(item)}
			{/each}
		{:else}
			<div class="p-8 text-center text-white/40 text-sm">Chưa có mục lục cho tài liệu này.</div>
		{/if}
	</div>
</div>
{/if}

<!-- Search Sidebar -->
{#if s.isSearchSidebarOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[399]" onclick={() => { s.isSearchSidebarOpen = false; s.isSearching = false; }}></div>
<div class="fixed inset-y-0 left-0 w-80 sm:w-96 bg-zinc-900 border-r border-white/10 shadow-[20px_0_50px_rgba(0,0,0,0.5)] z-[400] overflow-hidden flex flex-col animate-in slide-in-from-left duration-300">
	<div class="p-6 border-b border-white/10 space-y-4 relative">
		<div class="flex items-center justify-between">
			<h2 class="text-white font-black uppercase tracking-widest text-sm">Tìm kiếm PDF</h2>
			<button class="btn btn-ghost btn-circle btn-xs text-white/40 hover:text-white" onclick={() => { s.isSearchSidebarOpen = false; s.isSearching = false; }}>
				<X class="h-4 w-4" />
			</button>
		</div>
		<div class="flex gap-2 items-center">
			<div class="relative flex-1">
				<input
					bind:this={searchInput}
					type="text"
					bind:value={s.searchQuery}
					placeholder="Nhập từ khoá..."
					class="input input-sm w-full bg-white/10 text-white border-none focus:outline-none focus:ring-[var(--color-primary-500)]"
					onkeydown={(e) => {
						if (e.key === 'Escape') {
							s.isSearchSidebarOpen = false;
							s.isSearching = false;
							s.searchQuery = '';
							s.pdfScrollContainer?.focus();
							return;
						}
						if (e.key === 'Enter') {
							e.preventDefault();
							pdf.handleSearch("find");
						}
					}}
				/>
			</div>
			<button class="btn btn-sm btn-primary min-h-0 h-8 px-3" onclick={() => { pdf.handleSearch("find"); }}>
				{#if s.isSearching}
					<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
				{:else}
					<Search class="h-4 w-4" />
				{/if}
			</button>
		</div>
		
		{#if s.searchResultsCount > 0}
			<div class="flex items-center justify-between mt-2 px-1">
				<span class="text-xs text-white/50 font-mono">{s.searchResultsCount} matches found</span>
				<button
					class="btn btn-ghost btn-xs text-white/40 hover:text-white gap-1 transition-colors"
					onclick={() => pdf.clearSearch()}
				>
					<X class="h-3.5 w-3.5" />
					Clear
				</button>
			</div>
			
			<div class="flex items-center justify-between mt-1 px-1 p-2 bg-white/5 rounded-lg border border-white/10">
				<span class="text-xs text-white/80 font-mono font-bold tracking-wide">
					KẾT QUẢ {s.currentSearchResultIndex + 1} / {s.searchResultsCount}
				</span>
				<div class="flex items-center gap-1">
					<button class="btn btn-sm min-h-0 h-7 w-7 p-0 bg-white/10 hover:bg-white/20 text-white rounded border border-white/5" onclick={() => pdf.prevSearchResult()}>
						<ChevronUp class="w-4 h-4" />
					</button>
					<button class="btn btn-sm min-h-0 h-7 w-7 p-0 bg-white/10 hover:bg-white/20 text-white rounded border border-white/5" onclick={() => pdf.nextSearchResult()}>
						<ChevronDown class="w-4 h-4" />
					</button>
				</div>
			</div>
		{:else if s.searchQuery && !s.isSearching}
			<div class="text-center text-white/40 text-xs mt-2 font-medium">Không tìm thấy kết quả.</div>
		{/if}
	</div>
</div>
{/if}

<!-- PDF Scroller / Content -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={s.pdfScrollContainer}
	tabindex="0"
	role="region"
	aria-label="PDF viewer"
	class="pdf-scroll fixed inset-0 z-[300] bg-zinc-950 overflow-y-auto animate-in fade-in duration-200 focus:outline-none {s.isDarkMode ? 'pdf-dark-mode' : ''}"
	onscroll={pdf.handleScroll}
>
	<!-- Top Controls -->
	<div class="fixed top-4 right-4 sm:right-6 pointer-events-none z-[310] transition-all duration-300 {s.controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}">
		<div class="flex items-center justify-end gap-2">
			<button class="btn rounded-xl w-10 h-10 min-h-0 p-0 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 shadow-xl pointer-events-auto transition-all" aria-label="Toggle fit" onclick={() => { pdf.toggleFit(); s.pdfScrollContainer?.focus(); }}>
				<Maximize2 class="h-5 w-5" />
			</button>
			<button class="btn rounded-xl w-10 h-10 min-h-0 p-0 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 shadow-xl pointer-events-auto transition-all" onclick={() => { s.isDarkMode = !s.isDarkMode; s.pdfScrollContainer?.focus(); }}>
				{#if s.isDarkMode}
					<Sun class="h-5 w-5" />
				{:else}
					<Moon class="h-5 w-5" />
				{/if}
			</button>
			<button class="btn rounded-xl w-10 h-10 min-h-0 p-0 {s.isTocSidebarOpen ? 'bg-primary-500 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'} border border-white/10 shadow-xl pointer-events-auto transition-all" aria-label="TOC" onclick={() => { s.isTocSidebarOpen = !s.isTocSidebarOpen; s.pdfScrollContainer?.focus(); }}>
				<List class="h-5 w-5" />
			</button>
			<button class="btn rounded-xl w-10 h-10 min-h-0 p-0 {s.isSearchSidebarOpen ? 'bg-primary-500 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'} border border-white/10 shadow-xl pointer-events-auto transition-all" aria-label="Search" onclick={() => { 
				s.isSearchSidebarOpen = !s.isSearchSidebarOpen; 
				if (s.isSearchSidebarOpen) {
					import('./pdfSearch').then(mod => mod.initFindController(s));
				}
				s.pdfScrollContainer?.focus(); 
			}}>
				<Search class="h-5 w-5" />
			</button>
			<button aria-label="Close (ESC)" class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 shadow-xl pointer-events-auto transition-all hover:scale-110" onclick={closePdf}>
				<X class="h-6 w-6" />
			</button>
		</div>
	</div>

	<!-- Side Controls -->
	<div class="fixed top-24 right-4 sm:right-6 bottom-4 flex flex-col items-end gap-2 z-[310] pointer-events-none transition-all duration-300 {s.controlsVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}">
		<div class="flex flex-col items-end gap-2 pointer-events-auto h-full">
			<button class="btn rounded-xl w-10 h-10 min-h-0 p-0 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 shadow-xl pointer-events-auto transition-all" aria-label="Zoom in" onclick={() => { pdf.setZoom(parseFloat(s.zoomLevel.toString()) * 1.2); s.pdfScrollContainer?.focus(); }}>
				<ZoomIn class="h-5 w-5" />
			</button>
			<span class="py-1 px-2 text-[10px] font-mono font-black text-white text-center bg-zinc-900 rounded-xl border border-white/10 shadow-xl select-none">
				{Math.round(parseFloat(s.zoomLevel.toString()) * 100) || 100}%
			</span>
			<button class="btn rounded-xl w-10 h-10 min-h-0 p-0 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 shadow-xl pointer-events-auto transition-all" aria-label="Zoom out" onclick={() => { pdf.setZoom(parseFloat(s.zoomLevel.toString()) / 1.2); s.pdfScrollContainer?.focus(); }}>
				<ZoomOut class="h-5 w-5" />
			</button>

			<!-- Page Jump & Progress -->
			<div class="flex-1 flex flex-col items-center gap-2 mt-1 w-10 relative">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					bind:this={s.seekBarElement}
					class="flex-1 w-full bg-zinc-900 rounded-xl border border-white/10 shadow-xl overflow-hidden cursor-pointer group hover:bg-zinc-800 transition-colors relative"
					onmousedown={pdf.handleSeekBarMouseDown}
				>
					<div class="absolute top-0 left-0 w-full transition-all duration-75 ease-out origin-top z-10 pointer-events-none" style="height: {s.smoothPercent}%; background-color: white;"></div>
					{#if s.isDraggingSeek && s.hasMoved}
						<div class="absolute top-0 left-0 w-full bg-white/30 origin-top z-20 pointer-events-none" style="height: {s.previewPercent}%"></div>
					{/if}
					<span class="absolute inset-0 flex items-center justify-center z-30 pointer-events-none text-sm font-mono font-black mix-blend-difference select-none">
						{Math.round(s.isDraggingSeek && s.hasMoved ? s.previewPercent : s.smoothPercent)}%
					</span>
				</div>
				<div class="flex flex-col items-center gap-2 mt-auto">
					<div class="relative">
						<button
							class="btn rounded-xl w-10 h-10 min-h-0 p-0 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 shadow-xl pointer-events-auto transition-all flex items-center justify-center"
							onclick={(e) => { e.stopPropagation(); s.isJumpPopupOpen = !s.isJumpPopupOpen; s.pdfScrollContainer?.focus(); }}
						>
							<Hash class="h-5 w-5" />
						</button>

						<!-- Jump Popup -->
						{#if s.isJumpPopupOpen}
							<div class="absolute right-full top-0 mr-2 h-10 bg-zinc-900 px-3 rounded-xl border border-white/10 shadow-xl pointer-events-auto flex items-center gap-1.5 font-mono font-black text-[11px] focus:outline-none animate-in fade-in slide-in-from-right-4 duration-200 whitespace-nowrap">
								<span
									role="textbox"
									aria-label="Page number"
									tabindex="0"
									contenteditable="true"
									inputmode="numeric"
									class="text-white focus:outline-none bg-zinc-800 rounded-lg px-2 py-0.5 transition-colors min-w-[2ch] text-center"
									onfocus={(e) => {
										s.isEditingPage = true;
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
										s.isJumpPopupOpen = false;
										e.currentTarget.innerText = String(s.currentPageIndex + 1);
									}}
								>
									{s.currentPageIndex + 1}
								</span>
								<span class="text-white/40 ml-2 select-none">/ {s.numPages}</span>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Main PDF Container Native -->
	<div class="pt-4 pb-20 w-full relative z-[200]">
		<div id="viewer" class="pdfViewer" bind:this={s.viewerContainer}></div>
	</div>

	{#if s.isLoading}
		<div class="fixed inset-0 z-[301] flex items-center justify-center pointer-events-none">
			<div class="w-10 h-10 border-4 border-white/10 border-t-primary rounded-full animate-spin" style="border-top-color: var(--color-primary-500);"></div>
		</div>
	{/if}
</div>
