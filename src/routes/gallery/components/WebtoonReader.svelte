<script lang="ts">
	import { tick, onMount, onDestroy } from 'svelte';
	import { isVideoFile, type ImageFile } from './utils';

	let {
		isWebtoonMode = $bindable(),
		folderPath,
		onCloseCallback
	}: {
		isWebtoonMode: boolean;
		folderPath: string;
		onCloseCallback?: () => void;
	} = $props();

	let loadedImages: ImageFile[] = $state([]);
	let totalImages = $state(0);
	let isLoading = $state(false);
	let errorMsg = $state('');
	
	let controlsVisible = $state(false);
	let isEditingPage = $state(false);
	let isJumpPopupOpen = $state(false);
	let hideTimerId: any = null;

	let currentPage = $state(0);
	let hasMore = $state(true);
	const WEBTOON_PAGE_SIZE = 5000;

	async 	function loadWebtoonFolder() {
		if (!folderPath.trim() || isLoading) return;

		isLoading = true;
		errorMsg = '';
		loadedImages = [];
		totalImages = 0;
		hasMore = true;

		try {
			let allImages: any[] = [];
			let page = 0;
			let hasMorePages = true;

			while (hasMorePages) {
				const res = await fetch(`/api/gallery?folder=${encodeURIComponent(folderPath)}&page=${page}&limit=${WEBTOON_PAGE_SIZE}&sort=name_asc&imagesOnly=true`);
				const data = await res.json();
				if (!res.ok) throw new Error(data.message || "Error loading webtoon data");

				allImages = allImages.concat(data.images);
				totalImages = data.totalImages;
				hasMorePages = data.hasMore;
				page++;

				if (!hasMorePages || allImages.length >= data.total) {
					hasMorePages = false;
				}
			}

			loadedImages = allImages;
			hasMore = false;
		} catch (e: any) {
			errorMsg = e.message;
		} finally {
			isLoading = false;
		}
	}

	async function loadMore() {
		// Placeholder for future pagination
	}


	onMount(() => {
		loadWebtoonFolder();
	});

	onDestroy(() => {
		loadedImages = [];
		imageSizes = {};
	});

	function closeWebtoon() {
		isWebtoonMode = false;
		webtoonZoomLevel = 0.6;
		loadedImages = [];
		imageSizes = {};
		if (onCloseCallback) onCloseCallback();
	}

	let webtoonZoomLevel = $state(0.6);
	let previousWebtoonZoom = $state(0.6);
	// Index of the image currently at the top of the viewport (0-based)
	let currentImageIndex = $state(0);

	// Progress updated dynamically via tracker (IntersectionObserver)
	let webtoonScrollContainer: HTMLElement | undefined = $state();

	let pendingScrollTop: number | null = null;
	let goToPageInput = $state("");

	function scrollToIndex(index: number, behavior: ScrollBehavior = 'smooth') {
		if (!webtoonScrollContainer) return;
		const target = document.getElementById(`webtoon-image-${index}`);
		if (target) {
			target.scrollIntoView({ behavior, block: 'start' });
		}
	}

	function handlePageInput(val: string) {
		const page = parseInt(val);
		if (!isNaN(page) && page >= 1 && page <= totalImages) {
			scrollToIndex(page - 1);
		}
	}

	function setWebtoonZoom(newZoom: number, cursorY?: number) {
		if (!webtoonScrollContainer || newZoom === webtoonZoomLevel) return;
		
		const oldZoom = webtoonZoomLevel;
		const ratio = newZoom / oldZoom;
		
		// `pt-4` in the container equals 16px of non-scaled padding top.
		const paddingTop = 16;
		const yAnchor = cursorY ?? (window.innerHeight / 2);
		
		// Use pendingScrollTop if we are in the middle of a tick() update
		// This mathematically prevents compounding errors from rapid wheel events
		const currentScroll = pendingScrollTop !== null ? pendingScrollTop : webtoonScrollContainer.scrollTop;
		const contentY = currentScroll + yAnchor - paddingTop;
		
		webtoonZoomLevel = newZoom;
		pendingScrollTop = (contentY * ratio) + paddingTop - yAnchor;
		
		tick().then(() => {
			if (webtoonScrollContainer && pendingScrollTop !== null) {
				webtoonScrollContainer.scrollTop = pendingScrollTop;
				pendingScrollTop = null;
			}
		});
	}

	function toggleWebtoonFit() {
		if (webtoonZoomLevel >= 0.99) {
			setWebtoonZoom(previousWebtoonZoom < 0.99 ? previousWebtoonZoom : 0.6);
		} else {
			previousWebtoonZoom = webtoonZoomLevel;
			setWebtoonZoom(1);
		}
	}

	// ── Buffer window config ─────────────────────────────────────────────────
	// Images within BUFFER_SIZE of currentImageIndex are loaded (src active).
	// Outside the window the img stays in DOM (no layout shift) but src is
	// cleared to free GPU/RAM. Heights are cached so placeholders are accurate.
	const BUFFER_SIZE = 5;
	// Cached rendered height for each image-only index (set on first load).
	let imageSizes: Record<number, number> = $state({});

	function cleanupOldSizes() {
		const keepRange = BUFFER_SIZE * 3;
		const keys = Object.keys(imageSizes).map(Number).sort((a, b) => a - b);
		for (const key of keys) {
			if (Math.abs(key - currentImageIndex) > keepRange) {
				delete imageSizes[key];
			}
		}
	}

	// Action: track which image is at the top of the viewport to drive the progress bar.
	function trackImageIndex(node: HTMLElement, index: number) {
		const visObserver = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				// Fire when the top edge of this image crosses the top ~40% of the screen.
				if (entry.isIntersecting) {
					currentImageIndex = index;
					cleanupOldSizes();
				}
			});
		}, {
			// Trigger when image enters the top half of the viewport (ignore the bottom 50%).
			rootMargin: '0px 0px -50% 0px',
			threshold: 0
		});

		visObserver.observe(node);
		return { destroy() { visObserver.disconnect(); } };
	}



	// Calculate percentage based on exact scroll position (for smooth 1% steps)
	let smoothPercent = $state(0);
	const indexPercent = $derived(totalImages > 0 ? ((currentImageIndex + 1) / totalImages) * 100 : 0);

	// Seek bar dragging logic
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
		
		// Instant jump on first click (no preview bar shown yet)
		const targetIdx = Math.floor((previewPercent / 100) * totalImages);
		scrollToIndex(Math.min(targetIdx, totalImages - 1));
	}

	function updatePreview(e: MouseEvent) {
		if (!seekBarElement) return;
		const rect = seekBarElement.getBoundingClientRect();
		const percentage = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) * 100;
		previewPercent = percentage;
	}

	function handleWindowMouseMove(e: MouseEvent) {
		if (isDraggingSeek) {
			// Only consider it a "drag" (with visual effects) if moved > 5px
			if (!hasMoved && Math.abs(e.clientY - startY) > 5) {
				hasMoved = true;
			}
			
			updatePreview(e);
			
			if (hasMoved) {
				// Real-time jump only while dragging
				const targetIdx = Math.floor((previewPercent / 100) * totalImages);
				scrollToIndex(Math.min(targetIdx, totalImages - 1), 'instant');
			}
		}
	}

	function handleWindowMouseUp() {
		if (isDraggingSeek) {
			isDraggingSeek = false;
			hasMoved = false;
		}
	}

	function sentinelAction(node: HTMLElement) {
		const observer = new IntersectionObserver((entries) => {
			if (entries[0].isIntersecting && hasMore && !isLoading) {
				loadMore();
			}
		}, { threshold: 0.1 });
		observer.observe(node);
		return { destroy() { observer.disconnect(); } };
	}

	$effect(() => {
		if (isWebtoonMode && webtoonScrollContainer) {
			webtoonScrollContainer.focus();
		}
	});

	function handleKeyDown(event: KeyboardEvent) {
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
		if (event.key === 'Escape') {
			closeWebtoon();
		}
		if (event.code === 'KeyZ') {
			event.preventDefault();
			toggleWebtoonFit();
		}
	}

	function handleMouseMove(e: MouseEvent) {
		const width = window.innerWidth;
		const rightThreshold = width * 0.8; // Expanded to 20% from right edge

		if (e.clientX > rightThreshold || isEditingPage || isJumpPopupOpen) {
			controlsVisible = true;
			if (hideTimerId) clearTimeout(hideTimerId);
			if (!isEditingPage && !isJumpPopupOpen) {
				hideTimerId = setTimeout(() => {
					controlsVisible = false;
					hideTimerId = null;
				}, 2000);
			}
		} else {
			controlsVisible = false;
			if (hideTimerId) {
				clearTimeout(hideTimerId);
				hideTimerId = null;
			}
		}
	}
</script>

<style>
	/* Hide native scrollbar — use :global so Svelte doesn't strip the selector */
	:global(.webtoon-scroll) {
		scrollbar-width: none; /* Firefox */
		overflow-anchor: auto; /* Let browser handle scroll position when content above changes */
	}
	:global(.webtoon-scroll::-webkit-scrollbar) {
		display: none; /* Chrome / Safari / Edge */
	}
</style>

<svelte:window onkeydown={handleKeyDown} onmousemove={handleWindowMouseMove} onmouseup={handleWindowMouseUp} />

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div 
	bind:this={webtoonScrollContainer}
	tabindex="0"
	class="webtoon-scroll fixed inset-0 z-[300] bg-zinc-950 overflow-y-auto animate-in fade-in duration-200 focus:outline-none" 
	onmousemove={handleMouseMove}
	onscroll={(e) => { 
		const t = e.currentTarget;
		if (totalImages > 0) {
			smoothPercent = ((currentImageIndex + 1) / totalImages) * 100;
		}
	}}
	onwheel={(e) => {
		if (e.ctrlKey) {
			e.preventDefault();
			let delta = e.deltaY;
			if (e.deltaMode === 1) delta *= 33;
			else if (e.deltaMode === 2) delta *= window.innerHeight;

			const newZoom = Math.min(500, Math.max(0.001, webtoonZoomLevel * Math.pow(1.0015, -delta)));
			setWebtoonZoom(newZoom, e.clientY);
		}
	}}
>
	<!-- Top Title Bar -->
	<div class="fixed top-4 right-4 sm:right-6 pointer-events-none z-[110] transition-all duration-300 {controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}">
		<div class="flex items-start justify-end">
			<button aria-label="Close (ESC)" class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto transition-all hover:scale-110" onclick={(e) => { e.stopPropagation(); closeWebtoon(); }}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
			</button>
		</div>
	</div>

	<div class="fixed top-20 right-4 sm:right-6 bottom-2 flex flex-col items-end gap-2 z-[110] pointer-events-none transition-all duration-300 {controlsVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}">
		<div class="flex flex-col items-end gap-2 pointer-events-auto h-full">
			<button 
				aria-label="Toggle Fit Mode (Z Key)"
				class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl tooltip tooltip-left" 
				data-tip="Toggle Fit Mode (Z Key)" 
				onclick={(e) => { e.stopPropagation(); toggleWebtoonFit(); }}
				onmousedown={(e) => e.preventDefault()}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
			</button>

			<div class="flex flex-col bg-zinc-900/90 rounded-xl backdrop-blur-xl overflow-hidden sm:flex border border-white/10 shadow-2xl mt-1 w-12">
				<button aria-label="Zoom In" class="btn btn-ghost btn-sm h-12 w-12 p-0 text-white rounded-none border-b border-white/10 tooltip tooltip-left" data-tip="Zoom In (+)" onclick={(e) => { e.stopPropagation(); setWebtoonZoom(Math.min(500, webtoonZoomLevel * 1.15)); }} onmousedown={(e) => e.preventDefault()}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 m-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
				</button>
				<span class="py-2 text-xs sm:text-sm font-mono font-black text-white flex items-center justify-center bg-white/5 w-12 px-0 tracking-tighter" aria-label="Current Zoom">
					{Math.round(webtoonZoomLevel * 100)}%
				</span>
				<button aria-label="Zoom Out" class="btn btn-ghost btn-sm h-12 w-12 p-0 text-white rounded-none border-t border-white/10 tooltip tooltip-left" data-tip="Zoom Out (-)" onclick={(e) => { e.stopPropagation(); setWebtoonZoom(Math.max(0.001, webtoonZoomLevel / 1.15)); }} onmousedown={(e) => e.preventDefault()}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 m-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" /></svg>
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
					
					<!-- Drag Preview (Only shown when really dragging) -->
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
					<!-- Jump to Page Trigger Icon -->
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

			<!-- Editable Page indicator: Popup mode -->
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
							// If you click outside the popup, close it
							setTimeout(() => {
								if (!isEditingPage) {
									isJumpPopupOpen = false;
									webtoonScrollContainer?.focus();
								}
							}, 100);
							// Sync back if user didn't press enter or entered invalid value
							e.currentTarget.innerText = String(currentImageIndex + 1);
						}}
					>
						{currentImageIndex + 1}
					</span>
					<span class="text-white/40 ml-2">/ {totalImages}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Nội dung Webtoon -->
	<div class="flex flex-col items-center pb-20 pt-4 min-h-screen outline-none w-full">
		<div class="flex flex-col items-center origin-top" style="transform: scale({webtoonZoomLevel}); width: 100%; max-width: none;">
			{#each loadedImages as img, i}
				{@const inBuffer = Math.abs(i - currentImageIndex) <= BUFFER_SIZE}
				<!-- svelte-ignore a11y_missing_attribute -->
				<div
					id="webtoon-image-{i}"
					use:trackImageIndex={i}
					style="min-height: {imageSizes[i] ?? 500}px"
					class="w-full flex flex-col items-center justify-center border-b border-white/5 bg-black relative"
				>
					<img
						src={inBuffer ? `/api/media?path=${encodeURIComponent(img.path)}` : undefined}
						alt=""
						class="w-full h-auto object-contain block m-0 p-0 pointer-events-none"
						onload={(e) => {
							const h = (e.currentTarget as HTMLImageElement).clientHeight;
							if (h) imageSizes[i] = h;
						}}
					/>
				</div>
			{/each}
		</div>
		
		{#if errorMsg}
			<div class="mt-8 mb-8 text-center text-error text-sm font-medium">
				{errorMsg}
			</div>
		{/if}

		{#if hasMore}
			<div class="h-40 flex items-center justify-center w-full" use:sentinelAction>
				<span class="loading loading-spinner loading-lg text-primary/50"></span>
			</div>
		{:else}
			<div class="mt-12 mb-20 text-center text-white/50 text-sm font-medium">
				— End of Images ({totalImages}) —
			</div>
		{/if}
	</div>
</div>
