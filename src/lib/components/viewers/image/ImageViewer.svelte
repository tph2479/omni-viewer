<script lang="ts">
	import { handleImageError } from "$lib/actions/imageError";
	import { type ImageFile } from "$lib/utils/fileUtils";
	import { onDestroy, tick, setContext } from "svelte";
	import { createImageModalState, IMAGE_CONTEXT_KEY } from "./imageViewer.svelte.ts";
	import ImageToolbar from "./ImageToolbar.svelte";
	import ImageControls from "./ImageControls.svelte";

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
		onSwitchToPagination,
	}: {
		isModalOpen: boolean;
		selectedImageIndex: number;
		loadedImages: ImageFile[];
		totalImages: number;
		hasMore: boolean;
		currentPage: number;
		loadFolder: (
			reset: boolean,
			page: number,
			append?: boolean,
		) => Promise<void>;
		isGrouped?: boolean;
		onSwitchToPagination?: () => Promise<void>;
	} = $props();

	const imgState = createImageModalState({
		get isModalOpen() {
			return isModalOpen;
		},
		set isModalOpen(v) {
			isModalOpen = v;
		},
		get selectedImageIndex() {
			return selectedImageIndex;
		},
		set selectedImageIndex(v) {
			selectedImageIndex = v;
		},
		get loadedImages() {
			return loadedImages;
		},
		get totalImages() {
			return totalImages;
		},
		get hasMore() {
			return hasMore;
		},
		get currentPage() {
			return currentPage;
		},
		get loadFolder() {
			return loadFolder;
		},
		get isGrouped() {
			return isGrouped;
		},
		onSwitchToPagination: async () => {
			if (onSwitchToPagination) await onSwitchToPagination();
		},
	});

	setContext(IMAGE_CONTEXT_KEY, imgState);

	let modalContainer: HTMLElement | null = $state(null);

	$effect(() => {
		if (isModalOpen && modalContainer) {
			modalContainer.focus();
		}
	});

	$effect(() => {
		const scrollContainer = document.querySelector(".drawer-content");
		if (scrollContainer) {
			const originalOverflow = (scrollContainer as HTMLElement).style
				.overflow;
			(scrollContainer as HTMLElement).style.overflow = "hidden";
			return () => {
				(scrollContainer as HTMLElement).style.overflow =
					originalOverflow || "auto";
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
		onmouseleave={() => imgState.hideControlsImmediately()}
	>
		<ImageToolbar />
		<ImageControls />

		<!-- Main View Area -->
		<div
			class="relative flex-1 w-full h-full flex items-center justify-center p-0 overflow-hidden"
			onmousemove={imgState.handleMouseMoveVisibility}
			role="presentation"
		>
			{#if imgState.currentItem}
				<div
					class="relative flex items-center justify-center w-full h-full overflow-hidden"
					style="touch-action: none;"
					ontouchstart={imgState.handleTouchStart}
					ontouchmove={imgState.handleTouchMove}
					ontouchend={imgState.handleTouchEnd}
					ontouchcancel={imgState.handleTouchEnd}
					onwheel={imgState.handleWheel}
					onpointerdown={imgState.startDrag}
					onpointermove={imgState.onDrag}
					onpointerup={imgState.stopDrag}
					onpointerleave={imgState.stopDrag}
					onclick={(e) => e.stopPropagation()}
					ondblclick={(e) => {
						e.stopPropagation();
						imgState.toggleZoom(e.clientX, e.clientY);
					}}
					role="presentation"
				>
					{#key imgState.imageKey}
						<img
							src={imgState.currentImageSrc}
							onload={async (e) => {
								const img = e.currentTarget as HTMLImageElement;
								if (!img) return;
								const currentKey = imgState.imageKey;

								// Ensure transitions are OFF and image HIDDEN while we find the fit
								imgState.isFullImageLoaded = false;
								await tick();

								const checkAndFit = async (retries = 3) => {
									if (currentKey !== imgState.imageKey) return;

									imgState.naturalWidth = img.naturalWidth;
									imgState.naturalHeight = img.naturalHeight;
									imgState.renderedWidth = img.naturalWidth;

									if (imgState.naturalWidth > 0) {
										imgState.isPortraitImage = imgState.naturalHeight > imgState.naturalWidth;
										imgState.fitImageToViewport();

										// CRITICAL: We need TWO frames to ensure the browser paints the "scale(fit)"
										// with "transition: none" BEFORE we turn "transition: transform" back on.
										await tick();
										await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

										if (currentKey === imgState.imageKey) {
											imgState.isFullImageLoaded = true;
										}
									} else if (retries > 0) {
										setTimeout(() => checkAndFit(retries - 1), 60);
									} else {
										// Fallback if it refuses to yield dimensions
										if (currentKey === imgState.imageKey) {
											imgState.isFullImageLoaded = true;
										}
									}
								};

								checkAndFit();
							}}
							class="pointer-events-auto select-none"
							style="opacity: {imgState.isFullImageLoaded
								? 1
								: 0}; transform: translate({imgState.translateX}px, {imgState.translateY}px) scale({imgState.zoomLevel}) rotate({imgState.rotation}deg); transition: {imgState.isFullImageLoaded && !imgState.isPinching
								? 'transform 0.15s ease-out'
								: 'none'}; max-width: none !important; max-height: none !important;"
							decoding="async"
							fetchpriority="high"
							onerror={(e) =>
								handleImageError(e, imgState.currentItem.path)}
							alt={imgState.currentItem.name}
						/>
					{/key}
				</div>
			{/if}
		</div>
	</div>
{/if}
