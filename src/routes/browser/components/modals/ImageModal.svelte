<script lang="ts">
	import { handleImageError, formatBytes, formatDateTime, type ImageFile } from '../utils/utils';
	import { onDestroy, tick } from 'svelte';
	import { createImageModalState } from './imageModalState.svelte';

	// Props using Svelte 5 runes
	let {
		isModalOpen = $bindable(),
		selectedImageIndex = $bindable(),
		loadedImages = $bindable(),
		totalImages = 0,
		hasMore = false,
		currentPage = 0,
		loadFolder,
		isGrouped = false,
		onSwitchToPagination
	}: {
		isModalOpen: boolean;
		selectedImageIndex: number;
		loadedImages: ImageFile[];
		totalImages: number;
		hasMore: boolean;
		currentPage: number;
		loadFolder: (reset: boolean, page: number, append?: boolean) => Promise<void>;
		isGrouped?: boolean;
		onSwitchToPagination?: () => Promise<void>;
	} = $props();

	const imgState = createImageModalState({
		get isModalOpen() { return isModalOpen; },
		set isModalOpen(v) { isModalOpen = v; },
		get selectedImageIndex() { return selectedImageIndex; },
		set selectedImageIndex(v) { selectedImageIndex = v; },
		get loadedImages() { return loadedImages; },
		get totalImages() { return totalImages; },
		get hasMore() { return hasMore; },
		get currentPage() { return currentPage; },
		get loadFolder() { return loadFolder; },
		get isGrouped() { return isGrouped; },
		onSwitchToPagination: async () => { if (onSwitchToPagination) await onSwitchToPagination(); }
	});

	let modalContainer: HTMLElement | null = $state(null);

	$effect(() => {
		if (isModalOpen && modalContainer) {
			modalContainer.focus();
		}
	});

	$effect(() => {
		const scrollContainer = document.querySelector('.drawer-content');
		if (scrollContainer) {
			const originalOverflow = (scrollContainer as HTMLElement).style.overflow;
			(scrollContainer as HTMLElement).style.overflow = 'hidden';
			return () => {
				(scrollContainer as HTMLElement).style.overflow = originalOverflow || 'auto';
			};
		}
	});

	onDestroy(() => {
		imgState.cleanup();
	});

</script>

<svelte:window onkeydown={imgState.handleKeyDown} />

{#if isModalOpen}
	<div
		bind:this={modalContainer}
		id="media-modal-container"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		class="fixed inset-0 z-[300] bg-black/40 backdrop-blur-md flex flex-col h-full w-full overflow-hidden outline-none animate-in fade-in duration-300"
		onmousemove={imgState.handleMouseMoveVisibility}
	>
		<!-- TOP BACKGROUND SHADOW (Full Width) -->
		<div
			class="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none transition-opacity duration-300 {imgState.topControlsVisible ? 'opacity-100' : 'opacity-0'} z-[110]"
		></div>

		<!-- Toolbar (Top) -->
		<div class="absolute top-0 w-full p-4 flex justify-between items-start z-[110] bg-transparent pointer-events-none transition-all duration-300 {imgState.topControlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}">
			<!-- TOP LEFT: Info Area -->
			<div
				class="text-white/90 pointer-events-auto flex flex-col max-w-[70%]"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				onmouseenter={() => (imgState.isHoveringControls = true)}
				onmouseleave={() => (imgState.isHoveringControls = false)}
				role="presentation"
			>
				{#if imgState.currentItem}
					<p class="select-text text-white font-black text-lg sm:text-2xl tracking-tight whitespace-normal break-words leading-tight">
						<span class="px-2 py-0.5 -mx-2 rounded-lg">
							{imgState.currentImageIndexDisplay} / {totalImages} — {imgState.currentItem.name}
						</span>
					</p>
					{#if imgState.currentMetadata}
						<p class="select-text text-white/50 text-[10px] sm:text-xs font-mono mt-1">
							<span class="px-1 rounded-sm">
								{formatBytes(imgState.currentMetadata.size)}
								{#if imgState.naturalWidth > 0 && imgState.naturalHeight > 0}
									• {imgState.naturalWidth} x {imgState.naturalHeight}
								{:else if imgState.currentMetadata.width && imgState.currentMetadata.height}
									• {imgState.currentMetadata.width} x {imgState.currentMetadata.height}
								{/if}
								• {formatDateTime(imgState.currentMetadata.lastModified)}
							</span>
						</p>
					{:else}
						<div class="flex items-center gap-2 mt-2">
							<span class="loading loading-spinner loading-[10px] opacity-20"></span>
							<span class="text-white/20 text-[10px] font-mono italic">Loading details...</span>
						</div>
					{/if}
				{/if}
			</div>

			<!-- TOP RIGHT: Button Area -->
			<div
				class="flex flex-col items-center gap-2 pointer-events-auto ml-2"
				onmouseenter={() => (imgState.isHoveringControls = true)}
				onmouseleave={() => (imgState.isHoveringControls = false)}
				role="presentation"
			>
				<!-- Close Button -->
				<button
					aria-label="Close"
					class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/95 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl transition-all hover:scale-110 mb-2"
					onclick={(e) => { e.stopPropagation(); imgState.closeModal(); }}
					onmousedown={(e) => e.preventDefault()}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
				</button>

				<!-- Navigation Group -->
				<div class="flex flex-col bg-zinc-900/95 rounded-xl backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl w-12 mb-3 pointer-events-auto">
					<button aria-label="Previous" class="btn btn-ghost w-12 h-12 min-h-0 p-0 text-white rounded-none border-b border-white/10 transition-colors hover:bg-white/5" onclick={(e) => { e.stopPropagation(); imgState.prevImage(); }} onmousedown={(e) => e.preventDefault()}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
					</button>
					<button aria-label="Next" class="btn btn-ghost border-none w-12 h-12 min-h-0 p-0 text-white rounded-none transition-colors hover:bg-white/5" onclick={(e) => { e.stopPropagation(); imgState.nextImage(); }} onmousedown={(e) => e.preventDefault()}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
					</button>
				</div>

				<!-- Zoom Modes -->
				<div class="flex flex-col bg-zinc-900/95 rounded-xl backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl w-12 mb-3 pointer-events-auto">
					<button
						aria-label="Fit Width"
						class="btn btn-ghost w-12 h-12 min-h-0 p-0 text-white rounded-none border-b border-white/10 flex items-center justify-center transition-colors hover:bg-white/5"
						onclick={(e) => { e.stopPropagation(); imgState.toggleFitWidth(); }}
						onmousedown={(e) => e.preventDefault()}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7h8m-8 5h8m-8 5h8M4 5v14M20 5v14" /></svg>
					</button>
					<button
						aria-label="Toggle 1:1"
						class="btn btn-ghost border-none w-12 h-12 min-h-0 p-0 text-white rounded-none font-black font-mono flex items-center justify-center text-[10px] transition-colors hover:bg-white/5"
						onclick={(e) => { e.stopPropagation(); imgState.toggleZoom(e.clientX, e.clientY); }}
						onmousedown={(e) => e.preventDefault()}
					>
						1:1
					</button>
					<button
						aria-label="Rotate"
						class="btn btn-ghost w-12 h-12 min-h-0 p-0 text-white rounded-none transition-colors hover:bg-white/5 border-t border-white/10 flex items-center justify-center"
						onclick={(e) => { e.stopPropagation(); imgState.rotateImage(); }}
						onmousedown={(e) => e.preventDefault()}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
					</button>
				</div>

				<!-- Zoom Controls -->
				<div class="flex flex-col bg-zinc-900/95 rounded-xl backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl w-12 pointer-events-auto">
					<button aria-label="Zoom In" class="btn btn-ghost w-12 h-12 min-h-0 p-0 text-white rounded-none border-b border-white/10 transition-colors hover:bg-white/5" onclick={(e) => {
						e.stopPropagation();
						imgState.performZoom(Math.min(500, imgState.zoomLevel * 1.35));
					}} onmousedown={(e) => e.preventDefault()}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" /></svg>
					</button>
					<button
						aria-label="Current Zoom"
						class="w-full py-2 text-[10px] font-mono font-black text-white hover:bg-white/10 transition-colors bg-white/5 flex items-center justify-center tracking-tighter vertical-text"
						onclick={(e) => { e.stopPropagation(); imgState.resetAll(); }}
						onmousedown={(e) => e.preventDefault()}
					>
						{imgState.absoluteZoomPercent}%
					</button>
					<button aria-label="Zoom Out" class="btn btn-ghost w-12 h-12 min-h-0 p-0 text-white rounded-none border-t border-white/10 transition-colors hover:bg-white/5" onclick={(e) => {
						e.stopPropagation();
						imgState.performZoom(Math.max(0.001, imgState.zoomLevel / 1.35));
					}} onmousedown={(e) => e.preventDefault()}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4" /></svg>
					</button>
				</div>
			</div>
		</div>

		<!-- Main View Area -->
		<div
			class="relative flex-1 w-full h-full flex items-center justify-center p-0 overflow-hidden"
			onmousemove={imgState.handleMouseMoveVisibility}
			role="presentation"
		>
			{#if imgState.currentItem}
				<div
					class="relative flex items-center justify-center w-full h-full overflow-hidden"
					onwheel={imgState.handleWheel}
					onmousedown={imgState.startDrag}
					onmousemove={imgState.onDrag}
					onmouseup={imgState.stopDrag}
					onmouseleave={imgState.stopDrag}
					onclick={(e) => e.stopPropagation()}
					ondblclick={(e) => { e.stopPropagation(); imgState.toggleZoom(e.clientX, e.clientY); }}
					role="presentation"
				>
						{#key imgState.imageKey}
						<img
							src={imgState.currentImageSrc}
							onload={async (e) => {
								const img = e.currentTarget as HTMLImageElement;
								if (!img) return;

								imgState.naturalWidth = img.naturalWidth;
								imgState.naturalHeight = img.naturalHeight;
								imgState.isPortraitImage = imgState.naturalHeight > imgState.naturalWidth;

								// Ensure transitions are OFF and image HIDDEN while we find the fit
								imgState.isFullImageLoaded = false;

								await tick();
								imgState.renderedWidth = img.clientWidth;

								if (imgState.renderedWidth > 0) {
									imgState.fitImageToViewport();
								} else {
									await new Promise(r => setTimeout(r, 60));
									imgState.renderedWidth = img?.clientWidth || 0;
									imgState.fitImageToViewport();
								}

								// CRITICAL: We need TWO frames to ensure the browser paints the "scale(fit)"
								// with "transition: none" BEFORE we turn "transition: transform" back on.
								await tick();
								await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

								imgState.isFullImageLoaded = true;
							}}
							class="pointer-events-auto select-none"
							style="opacity: {imgState.isFullImageLoaded ? 1 : 0}; transform: translate({imgState.translateX}px, {imgState.translateY}px) scale({imgState.zoomLevel}) rotate({imgState.rotation}deg); transition: {imgState.isFullImageLoaded ? 'transform 0.2s ease-out' : 'none'};"
							decoding="async"
							fetchpriority="high"
							draggable="false"
							onerror={(e) => handleImageError(e, imgState.currentItem.path)}
							alt={imgState.currentItem.name}
						/>
					{/key}
				</div>
			{/if}
		</div>
	</div>
{/if}
