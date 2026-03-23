<script lang="ts">
	import { tick, onMount, onDestroy } from 'svelte';
	import { isVideoFile, type ImageFile } from '../utils/utils';
	import { cacheVersion } from '$lib/stores/cache.svelte';
	import { createWebtoonController } from './webtoonController.svelte';

	let {
		isWebtoonMode = $bindable(),
		folderPath,
		onCloseCallback
	}: {
		isWebtoonMode: boolean;
		folderPath: string;
		onCloseCallback?: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	const ctrl = createWebtoonController(folderPath);
	let s = $derived(ctrl.state);

	onMount(() => {
		ctrl.loadWebtoonFolder();
	});

	onDestroy(() => {
		ctrl.destroy();
	});

	function closeWebtoon() {
		isWebtoonMode = false;
		s.webtoonZoomLevel = 0.6;
		ctrl.destroy();
		if (onCloseCallback) onCloseCallback();
	}

	function trackImageIndex(node: HTMLElement, index: number) {
		const visObserver = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					s.currentImageIndex = index;
					ctrl.cleanupOldSizes();
				}
			});
		}, {
			rootMargin: '0px 0px -50% 0px',
			threshold: 0
		});

		visObserver.observe(node);
		return { destroy() { visObserver.disconnect(); } };
	}

	function sentinelAction(node: HTMLElement) {
		const observer = new IntersectionObserver((entries) => {
			if (entries[0].isIntersecting && s.hasMore && !s.isLoading) {
				ctrl.loadMore();
			}
		}, { threshold: 0.1 });
		observer.observe(node);
		return { destroy() { observer.disconnect(); } };
	}

	$effect(() => {
		if (isWebtoonMode && s.webtoonScrollContainer) {
			s.webtoonScrollContainer.focus();
		}
	});

	function handleKeyDown(event: KeyboardEvent) {
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
		if (event.key === 'Escape') {
			closeWebtoon();
		}
		if (event.code === 'KeyZ') {
			event.preventDefault();
			ctrl.toggleWebtoonFit();
		}
	}

	let lastWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
	let isResizing = false;
	function handleResize() {
		if (typeof window === 'undefined' || !s.webtoonScrollContainer || isResizing) return;
		const currentWidth = window.innerWidth;
		if (currentWidth === lastWidth) return;

		isResizing = true;

		const capturedIdx = s.currentImageIndex;
		const capturedImagePercent = s.anchorPercentInImage;
		const capturedDocPercent = s.lastScrollPercent;

		// 2. Symmetrical Zoom Switch
		if (lastWidth >= 640 && currentWidth < 640) {
			ctrl.setWebtoonZoom(1, undefined, { skipScroll: true });
		} else if (lastWidth < 640 && currentWidth >= 640) {
			ctrl.setWebtoonZoom(s.previousWebtoonZoom < 0.99 ? s.previousWebtoonZoom : 0.6, undefined, { skipScroll: true });
		}

		// 3. Clear any pending controller adjustments to ensure we have full control
		s.pendingScrollTop = null;
		lastWidth = currentWidth;

		// 4. Restore anchor: Primary is element-specific, fallback is document percentage
		tick().then(() => {
			if (s.webtoonScrollContainer) {
				const el = document.getElementById(`webtoon-image-${capturedIdx}`);
				if (el) {
					// 16px is the pt-4 padding on the container. el.offsetTop is relative to the inner content div.
					s.webtoonScrollContainer.scrollTop = 16 + el.offsetTop + (capturedImagePercent * el.offsetHeight);
				} else {
					s.webtoonScrollContainer.scrollTop = capturedDocPercent * s.webtoonScrollContainer.scrollHeight;
				}
			}
			isResizing = false;
		});
	}

	// Initial check for mobile fit
	onMount(() => {
		if (window.innerWidth < 640) {
			ctrl.setWebtoonZoom(1);
		}
	});
</script>

<style>
	:global(.webtoon-scroll) {
		scrollbar-width: none;
		overflow-anchor: none;
	}
	:global(.webtoon-scroll::-webkit-scrollbar) {
		display: none;
	}
</style>

<svelte:window onkeydown={handleKeyDown} onmousemove={ctrl.handleWindowMouseMove} onmouseup={ctrl.handleWindowMouseUp} onresize={handleResize} />

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={s.webtoonScrollContainer}
	tabindex="0"
	role="region"
	aria-label="Webtoon Reader"
	class="webtoon-scroll fixed inset-0 z-[300] bg-zinc-950 overflow-y-auto animate-in fade-in duration-200 focus:outline-none"
	onmousemove={ctrl.handleMouseMove}
	onscroll={(e) => {
		const target = e.currentTarget as HTMLElement;
		if (target.scrollHeight > 0 && !isResizing && s.pendingScrollTop === null) {
			s.lastScrollPercent = target.scrollTop / target.scrollHeight;

			// Pro-Reader Anchoring: Track precise offset into the current image
			const anchorEl = document.getElementById(`webtoon-image-${s.currentImageIndex}`);
			if (anchorEl) {
				const rect = anchorEl.getBoundingClientRect();
				const containerRect = target.getBoundingClientRect();
				s.anchorPercentInImage = (containerRect.top - rect.top) / rect.height;
			}
		}
	}}
	onwheel={(e) => {
		if (e.ctrlKey) {
			e.preventDefault();
			let delta = e.deltaY;
			if (e.deltaMode === 1) delta *= 33;
			else if (e.deltaMode === 2) delta *= window.innerHeight;

			const newZoom = Math.min(500, Math.max(0.001, s.webtoonZoomLevel * Math.pow(1.0015, -delta)));
			ctrl.setWebtoonZoom(newZoom, e.clientY);
		}
	}}
>
	<!-- Top Title Bar -->
	<div class="fixed top-4 right-4 sm:right-6 pointer-events-none z-[110] transition-all duration-300 {s.controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}">
		<div class="flex items-start justify-end">
			<button aria-label="Close (ESC)" class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto transition-all hover:scale-110" onclick={(e) => { e.stopPropagation(); closeWebtoon(); }}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
			</button>
		</div>
	</div>

	<div class="fixed top-20 right-4 sm:right-6 bottom-2 flex flex-col items-end gap-2 z-[110] pointer-events-none transition-all duration-300 {s.controlsVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}">
		<div class="flex flex-col items-end gap-2 pointer-events-auto h-full">
			<button
				aria-label="Toggle Fit Mode (Z Key)"
				class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl tooltip tooltip-left"
				data-tip="Toggle Fit Mode (Z Key)"
				onclick={(e) => { e.stopPropagation(); ctrl.toggleWebtoonFit(); }}
				onmousedown={(e) => e.preventDefault()}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
			</button>

			<div class="flex flex-col bg-zinc-900/90 rounded-xl backdrop-blur-xl overflow-hidden sm:flex border border-white/10 shadow-2xl mt-1 w-12">
				<button aria-label="Zoom In" class="btn btn-ghost btn-sm h-12 w-12 p-0 text-white rounded-none border-b border-white/10 tooltip tooltip-left" data-tip="Zoom In (+)" onclick={(e) => { e.stopPropagation(); ctrl.setWebtoonZoom(Math.min(500, s.webtoonZoomLevel * 1.15)); }} onmousedown={(e) => e.preventDefault()}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 m-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
				</button>
				<span class="py-2 text-xs sm:text-sm font-mono font-black text-white flex items-center justify-center bg-white/5 w-12 px-0 tracking-tighter" aria-label="Current Zoom">
					{Math.round(s.webtoonZoomLevel * 100)}%
				</span>
				<button aria-label="Zoom Out" class="btn btn-ghost btn-sm h-12 w-12 p-0 text-white rounded-none border-t border-white/10 tooltip tooltip-left" data-tip="Zoom Out (-)" onclick={(e) => { e.stopPropagation(); ctrl.setWebtoonZoom(Math.max(0.001, s.webtoonZoomLevel / 1.15)); }} onmousedown={(e) => e.preventDefault()}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 m-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" /></svg>
				</button>
			</div>

			<div class="flex-1 flex flex-col items-center gap-2 mt-1 bg-zinc-900/90 py-4 rounded-xl border border-white/10 shadow-2xl pointer-events-auto w-12 backdrop-blur-xl overflow-hidden px-0">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					bind:this={s.seekBarElement}
					class="flex-1 w-3 sm:w-4 bg-white/10 rounded-full overflow-hidden border border-white/5 shadow-inner my-1 cursor-pointer group hover:bg-white/20 transition-colors relative"
					onmousedown={ctrl.handleSeekBarMouseDown}
				>
					<!-- Current Progress -->
					<div
						class="absolute top-0 left-0 w-full bg-primary rounded-full transition-all duration-75 ease-out origin-top z-10"
						style="height: {s.smoothPercent}%"
					></div>

					<!-- Drag Preview (Only shown when really dragging) -->
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
					<!-- Jump to Page Trigger Icon -->
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

			<!-- Editable Page indicator: Popup mode -->
			{#if s.isJumpPopupOpen}
				<div
					class="bg-zinc-900/90 px-4 py-2 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto text-right min-h-[3rem] flex items-center justify-center font-mono font-black text-sm sm:text-base focus:outline-none animate-in fade-in slide-in-from-right-2 duration-200"
				>
					<span
						    role="textbox"
						    aria-label="Page number"
						    tabindex="0"
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
								ctrl.handlePageInput(e.currentTarget.innerText);
								s.isJumpPopupOpen = false;
								e.currentTarget.blur();
							}
							e.stopPropagation();
						}}
						onblur={(e) => {
							s.isEditingPage = false;
							// If you click outside the popup, close it
							setTimeout(() => {
								if (!s.isEditingPage) {
									s.isJumpPopupOpen = false;
									s.webtoonScrollContainer?.focus();
								}
							}, 100);
							// Sync back if user didn't press enter or entered invalid value
							e.currentTarget.innerText = String(s.currentImageIndex + 1);
						}}
					>
						{s.currentImageIndex + 1}
					</span>
					<span class="text-white/40 ml-2">/ {s.totalImages}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Nội dung Webtoon -->
	<div class="flex flex-col items-center pb-20 pt-4 min-h-screen outline-none w-full">
		<div class="flex flex-col items-center" style="width: {s.webtoonZoomLevel * 100}%; max-width: none; flex-shrink: 0;">
			{#each s.loadedImages as img, i}
				{@const inBuffer = Math.abs(i - s.currentImageIndex) <= ctrl.BUFFER_SIZE}
				<!-- svelte-ignore a11y_missing_attribute -->
				<div
					id="webtoon-image-{i}"
					use:trackImageIndex={i}
					style="aspect-ratio: {s.aspectRatios[i] ?? 0.7};"
					class="w-full flex flex-col items-center justify-center border-b border-white/5 bg-black relative"
				>
					<img
						src={inBuffer ? `/api/media?path=${encodeURIComponent(img.path)}&v=${cacheVersion.value}` : undefined}
						alt=""
						class="w-full h-auto object-contain block m-0 p-0 pointer-events-none"
						onload={(e) => {
							const img = e.currentTarget as HTMLImageElement;
							if (img.naturalWidth && img.naturalHeight) {
								s.aspectRatios[i] = img.naturalWidth / img.naturalHeight;
							}
						}}
					/>
				</div>
			{/each}
		</div>

		{#if s.errorMsg}
			<div class="mt-8 mb-8 text-center text-error text-sm font-medium">
				{s.errorMsg}
			</div>
		{/if}

		{#if s.hasMore}
			<div class="h-40 flex items-center justify-center w-full" use:sentinelAction>
				<span class="loading loading-spinner loading-lg text-primary/50"></span>
			</div>
		{:else}
			<div class="mt-12 mb-20 text-center text-white/50 text-sm font-medium">
				— End of Images ({s.totalImages}) —
			</div>
		{/if}
	</div>
</div>
