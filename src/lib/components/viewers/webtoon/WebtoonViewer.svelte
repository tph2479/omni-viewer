<script lang="ts">
	import { tick, onMount, onDestroy, setContext } from 'svelte';
	import type { MediaFile } from '$lib/stores/browser/types';
	import { isVideoFile } from '$lib/utils/fileUtils';
	import { cacheVersion } from '$lib/stores/system/cache.svelte';
	import { browserStore } from '$lib/stores/browser/index.svelte';
	import { createWebtoonController, WEBTOON_CONTEXT_KEY } from './webtoonViewer.svelte.ts';
	import WebtoonToolbar from './WebtoonToolbar.svelte';
	import WebtoonControls from './WebtoonControls.svelte';
	import WebtoonSidebar from './WebtoonSidebar.svelte';

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
	const ctrl = createWebtoonController(folderPath, browserStore.modal.webtoon.contextPath, browserStore.actions);
	let s = $derived(ctrl.state);

	setContext(WEBTOON_CONTEXT_KEY, ctrl);

	onMount(() => {
		ctrl.loadWebtoonFolder();
		ctrl.loadSiblings();
	});

	$effect(() => {
		if (folderPath && folderPath !== s.folderPath) {
			s.folderPath = folderPath;
			ctrl.loadWebtoonFolder();
		}
	});

	onDestroy(() => {
		ctrl.destroy();
	});

	function closeWebtoon() {
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {});
		}
		isWebtoonMode = false;
		s.webtoonZoomLevel = 0.6;
		ctrl.destroy();
		if (onCloseCallback) onCloseCallback();
	}

	let isFullscreen = $state(false);
	function toggleFullscreen() {
		if (!s.webtoonScrollContainer) return;
		if (!document.fullscreenElement) {
			s.webtoonScrollContainer.requestFullscreen().catch(err => {
				console.error(`Error attempting to enable full-screen mode: ${err.message}`);
			});
			isFullscreen = true;
		} else {
			document.exitFullscreen();
			isFullscreen = false;
		}
	}

	onMount(() => {
		const fsChange = () => isFullscreen = !!document.fullscreenElement;
		document.addEventListener('fullscreenchange', fsChange);
		return () => document.removeEventListener('fullscreenchange', fsChange);
	});

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
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || s.isEditingPage || s.isEditingChapter) return;
		if (event.key === 'Escape') {
			if (s.isTocOpen) {
				s.isTocOpen = false;
				s.webtoonScrollContainer?.focus();
				return;
			}
			if (s.isJumpPopupOpen) {
				s.isJumpPopupOpen = false;
				s.webtoonScrollContainer?.focus();
				return;
			}
			closeWebtoon();
		}
		if (event.key === 'Tab') {
			event.preventDefault();
			if (s.isTocOpen) {
				s.isTocOpen = false;
				s.webtoonScrollContainer?.focus();
			} else {
				s.isTocOpen = true;
			}
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
	<WebtoonToolbar {isFullscreen} {toggleFullscreen} {closeWebtoon} />
	<WebtoonControls />
	<WebtoonSidebar />

	<!-- Nội dung Webtoon -->
	<div class="flex flex-col items-center pb-20 pt-4 min-h-dvh outline-none w-full">
		<div class="flex flex-col items-center" style="width: {s.webtoonZoomLevel * 100}%; max-width: none; flex-shrink: 0;">
			{#each s.loadedImages as mediaItem, i}
				{@const inBuffer = Math.abs(i - s.currentImageIndex) <= ctrl.BUFFER_SIZE}
				<!-- svelte-ignore a11y_missing_attribute -->
				<div
					id="webtoon-image-{i}"
					use:trackImageIndex={i}
					style="aspect-ratio: {s.aspectRatios[i] ?? 0.7};"
					class="w-full flex flex-col items-center justify-center border-b border-white/5 bg-black relative"
				>
					<img
						src={inBuffer ? `/api/media?path=${encodeURIComponent(mediaItem.path)}&v=${cacheVersion.value}` : undefined}
						alt=""
						class="w-full h-auto object-contain block m-0 p-0 pointer-events-none"
						onload={(e) => {
							const el = e.currentTarget as HTMLImageElement;
							if (el.naturalWidth && el.naturalHeight) {
								s.aspectRatios[i] = el.naturalWidth / el.naturalHeight;
							}
						}}
					/>
				</div>
			{/each}
		</div>

		{#if s.errorMsg}
		<div class="mt-8 mb-8 text-center text-sm font-medium" style="color: var(--color-error-500);">
			{s.errorMsg}
		</div>
		{/if}

		{#if s.hasMore}
			<div class="h-40 flex items-center justify-center w-full" use:sentinelAction>
				<div class="w-10 h-10 border-4 border-white/10 border-t-primary rounded-full animate-spin" style="border-top-color: var(--color-primary-500);"></div>
			</div>
		{:else}
			<div class="mt-12 mb-20 text-center text-white/50 text-sm font-medium">
				— End of Images ({s.totalImages}) —
			</div>
		{/if}
	</div>
</div>
