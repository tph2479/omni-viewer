<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { createPdfController } from './pdfViewer.svelte.ts';
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

	$effect(() => {
		if (s.pdfScrollContainer && s.viewerContainer && s.pdfjsViewer && !s.viewerApp) {
			pdf.initViewerApp();
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
			} else if (s.isTocSidebarOpen) {
				s.isTocSidebarOpen = false;
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
	<button 
		class="w-full text-left p-2 hover:bg-white/10 rounded transition-colors text-sm text-white/80 hover:text-white mb-1" 
		style="padding-left: {depth * 1.5 + 0.5}rem" 
		onclick={() => { 
			pdf.navigateToDest(item.dest); 
			if (window.innerWidth < 768) s.isTocSidebarOpen = false; 
		}}
	>
		{item.title}
	</button>
	{#if item.items && item.items.length > 0}
		{#each item.items as subItem}
			{@render tocItem(subItem, depth + 1)}
		{/each}
	{/if}
{/snippet}

<!-- TOC Sidebar -->
{#if s.isTocSidebarOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[399]" onclick={() => { s.isTocSidebarOpen = false; }}></div>
<div class="fixed inset-y-0 left-0 w-80 sm:w-96 bg-zinc-950/95 border-r border-white/10 backdrop-blur-xl shadow-2xl z-[400] overflow-hidden flex flex-col animate-in slide-in-from-left duration-300">
	<div class="p-4 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md shrink-0 flex items-center justify-between">
		<h2 class="text-white font-bold text-lg">Mục lục</h2>
		<button class="btn btn-ghost btn-sm btn-circle text-white/50 hover:text-white transition-colors" onclick={() => { s.isTocSidebarOpen = false; }}>
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
<div class="fixed inset-y-0 right-0 w-80 sm:w-96 bg-zinc-950/95 border-l border-white/10 backdrop-blur-xl shadow-2xl z-[400] overflow-hidden flex flex-col animate-in slide-in-from-right duration-300">
	<div class="p-4 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md shrink-0 flex flex-col gap-3">
		<div class="flex items-center justify-between">
			<h2 class="text-white font-bold text-lg">Tìm kiếm PDF</h2>
			<button class="btn btn-ghost btn-sm btn-circle text-white/50 hover:text-white transition-colors" onclick={() => { s.isSearchSidebarOpen = false; s.isSearching = false; }}>
				<X class="h-5 w-5" />
			</button>
		</div>
		<div class="flex gap-2 items-center">
			<div class="relative flex-1">
				<input
					type="text"
					bind:value={s.searchQuery}
					placeholder="Nhập từ khoá..."
					class="input input-sm w-full bg-white/10 text-white border-none focus:outline-none focus:ring-[var(--color-primary-500)]"
					onkeydown={(e) => {
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
			<button class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto transition-all" aria-label="Toggle fit" onclick={() => { pdf.toggleFit(); }}>
				<Maximize2 class="h-5 w-5" />
			</button>
			{#if !s.isTocSidebarOpen}
				<button class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto transition-all" aria-label="TOC" onclick={() => s.isTocSidebarOpen = true}>
					<List class="h-5 w-5" />
				</button>
			{/if}
			{#if !s.isSearchSidebarOpen}
				<button class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto transition-all" aria-label="Search" onclick={() => s.isSearchSidebarOpen = true}>
					<Search class="h-5 w-5" />
				</button>
			{/if}
			<button class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto transition-all" onclick={() => s.isDarkMode = !s.isDarkMode}>
				{#if s.isDarkMode}
					<Sun class="h-5 w-5" />
				{:else}
					<Moon class="h-5 w-5" />
				{/if}
			</button>
			<button aria-label="Close (ESC)" class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto transition-all hover:scale-110" onclick={closePdf}>
				<X class="h-6 w-6" />
			</button>
		</div>
	</div>

	<!-- Side Controls -->
	<div class="fixed top-24 right-4 sm:right-6 bottom-4 flex flex-col items-end gap-2 z-[310] pointer-events-none transition-all duration-300 {s.controlsVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}">
		<div class="flex flex-col items-end gap-2 pointer-events-auto h-full">
			<div class="flex flex-col bg-zinc-900/90 rounded-xl backdrop-blur-xl border border-white/10 shadow-2xl mt-1 w-12 overflow-hidden">
				<button class="btn btn-ghost btn-sm h-12 w-12 p-0 text-white rounded-none border-b border-white/10" aria-label="Zoom in" onclick={() => { pdf.setZoom(parseFloat(s.zoomLevel.toString()) * 1.2); }}>
					<ZoomIn class="h-5 w-5" />
				</button>
				<span class="py-2 text-[10px] font-mono font-black text-white text-center bg-white/5">
					{Math.round(parseFloat(s.zoomLevel.toString()) * 100) || 100}%
				</span>
				<button class="btn btn-ghost btn-sm h-12 w-12 p-0 text-white rounded-none border-t border-white/10" aria-label="Zoom out" onclick={() => { pdf.setZoom(parseFloat(s.zoomLevel.toString()) / 1.2); }}>
					<ZoomOut class="h-5 w-5" />
				</button>
			</div>

			<!-- Page Jump & Progress -->
			<div class="flex-1 flex flex-col items-center gap-2 mt-1 bg-zinc-900/90 py-4 rounded-xl border border-white/10 shadow-2xl pointer-events-auto w-12 backdrop-blur-xl overflow-hidden px-0">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					bind:this={s.seekBarElement}
					class="flex-1 w-3 sm:w-4 bg-white/10 rounded-full overflow-hidden border border-white/5 shadow-inner my-1 cursor-pointer group hover:bg-white/20 transition-colors relative"
					onmousedown={pdf.handleSeekBarMouseDown}
				>
					<div class="absolute top-0 left-0 w-full rounded-full transition-all duration-75 ease-out origin-top z-10 pointer-events-none" style="height: {s.smoothPercent}%; background-color: var(--color-primary-500);"></div>
					{#if s.isDraggingSeek && s.hasMoved}
						<div class="absolute top-0 left-0 w-full bg-white/30 rounded-full origin-top z-20 pointer-events-none" style="height: {s.previewPercent}%"></div>
					{/if}
				</div>
				<div class="flex flex-col items-center gap-1 mt-auto pb-1">
					<span class="text-sm font-mono font-black text-white/90">
						{Math.round(s.isDraggingSeek && s.hasMoved ? s.previewPercent : s.smoothPercent)}%
					</span>
					<button
						class="btn btn-ghost btn-circle w-10 h-10 min-h-0 p-0 text-white hover:bg-white/10 transition-all mt-1 flex items-center justify-center"
						onclick={(e) => { e.stopPropagation(); s.isJumpPopupOpen = !s.isJumpPopupOpen; }}
					>
						<Hash class="h-5 w-5" />
					</button>
				</div>
			</div>

			<!-- Jump Popup -->
			{#if s.isJumpPopupOpen}
				<div class="bg-zinc-900/90 px-4 py-2 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto text-right min-h-[3rem] flex items-center justify-center font-mono font-black text-sm focus:outline-none animate-in fade-in slide-in-from-right-2 duration-200">
					<span
						role="textbox"
						aria-label="Page number"
						tabindex="0"
						contenteditable="true"
						inputmode="numeric"
						class="text-white/90 focus:outline-none hover:bg-white/5 rounded px-1 transition-colors min-w-[1ch]"
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
					<span class="text-white/40 ml-2">/ {s.numPages}</span>
				</div>
			{/if}
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
