<script lang="ts">
	import { handleImageError, formatBytes, formatDateTime, type ImageFile } from './utils';
	import { onDestroy } from 'svelte';

	// Props using Svelte 5 runes
	let {
		isModalOpen = $bindable(),
		selectedImageIndex = $bindable(),
		loadedImages = [],
		totalImages = 0,
		hasMore = false,
		currentPage = 0,
		loadFolder
	}: {
		isModalOpen: boolean;
		selectedImageIndex: number;
		loadedImages: ImageFile[];
		totalImages: number;
		hasMore: boolean;
		currentPage: number;
		loadFolder: (reset: boolean, page: number, append?: boolean) => Promise<void>;
	} = $props();

	// UI & Image State
	let zoomLevel = $state(1);
	let isDragging = $state(false);
	let startDragX = $state(0);
	let startDragY = $state(0);
	let translateX = $state(0);
	let translateY = $state(0);
	let naturalWidth = $state(0);
	let naturalHeight = $state(0);
	let renderedWidth = $state(0);
	let isFullImageLoaded = $state(false);
	let isWheelPanningH = $state(false);
	let wheelPanResetTimer: any = null;
	let rotation = $state(0);
	let currentImageSrc = $state('');
	let isPortraitImage = $state(false);
	
	let topControlsVisible = $state(false);
	let isHoveringControls = $state(false);
	let topHideTimerId: any = null;
	
	let currentMetadata = $state<any>(null);
	let isMetadataLoading = $state(false);

	const currentItem = $derived(loadedImages[selectedImageIndex] || null);
	const isRotated = $derived(rotation === 90 || rotation === 270);
	const realScaleRatio = $derived((renderedWidth && naturalWidth && naturalWidth > 0) ? renderedWidth / naturalWidth : 1);
	const absoluteZoomPercent = $derived(Math.round(zoomLevel * realScaleRatio * 100));

	// Constants for Zoom/Pan
	const zoomMultiplier = 1.25;
	const minZoom = 0.001;
	const maxZoom = 500;

	// Boundary Logic for Panning
	const imageRenderedHeight = $derived(naturalWidth > 0 ? renderedWidth * (naturalHeight / naturalWidth) : 0);
	const effectiveImageWidth = $derived(isRotated ? imageRenderedHeight : renderedWidth);
	const effectiveImageHeight = $derived(isRotated ? renderedWidth : imageRenderedHeight);

	const maxTranslateX = $derived(Math.max(0, (effectiveImageWidth * zoomLevel - (typeof window !== 'undefined' ? window.innerWidth : 0)) / 2));
	const maxTranslateY = $derived(Math.max(0, (effectiveImageHeight * zoomLevel - (typeof window !== 'undefined' ? window.innerHeight : 0)) / 2));
	const needsHorizontalPan = $derived(effectiveImageWidth * zoomLevel > (typeof window !== 'undefined' ? window.innerWidth : 0));
	const needsVerticalPan = $derived(effectiveImageHeight * zoomLevel > (typeof window !== 'undefined' ? window.innerHeight : 0));
	const canPanHorizontal = $derived(needsHorizontalPan || isWheelPanningH || zoomLevel > 1);

	$effect.pre(() => {
		if (canPanHorizontal) {
			translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, translateX));
		} else {
			translateX = 0;
		}
		if (needsVerticalPan || zoomLevel > 1) {
			translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, translateY));
		} else {
			translateY = 0;
		}
	});

	let lastPathForReset = '';
	let imageKey = 0;
	$effect(() => {
		const path = currentItem?.path || '';
		if (path && path !== lastPathForReset) {
			lastPathForReset = path;
			imageKey++;
			zoomLevel = 1;
			translateX = 0;
			translateY = 0;
		}
	});

	function rotateImage() {
		const newRotation = (rotation + 90) % 360;
		const newIsRotated = newRotation === 90 || newRotation === 270;
		const visualWidth = newIsRotated ? imageRenderedHeight : renderedWidth;
		const visualHeight = newIsRotated ? renderedWidth : imageRenderedHeight;
		let newZoom = zoomLevel;
		if (visualWidth > 0 && visualHeight > 0) {
			const fitWidthZoom = window.innerWidth / visualWidth;
			const fitHeightZoom = window.innerHeight / visualHeight;
			newZoom = Math.min(fitWidthZoom, fitHeightZoom);
		}
		rotation = newRotation;
		translateX = 0;
		translateY = 0;
		zoomLevel = newZoom;
	}

	function fitImageToViewport() {
		if (renderedWidth > 0 && naturalWidth > 0 && naturalHeight > 0) {
			const imgH = renderedWidth * (naturalHeight / naturalWidth);
			const fitWidthZoom = window.innerWidth / renderedWidth;
			const fitHeightZoom = window.innerHeight / imgH;
			zoomLevel = Math.min(fitWidthZoom, fitHeightZoom);
		}
	}

	function handleMouseMoveVisibility(e: MouseEvent) {
		if (typeof window === 'undefined') return;
		
		const height = window.innerHeight;
		const width = window.innerWidth;
		const ratioX = e.clientX / width;
		const ratioY = e.clientY / height;

		const isInTopStrip = ratioY < 0.2; 
		const isInCornerTriangle = (ratioX - ratioY) > 0.5;

		if (isInTopStrip || isInCornerTriangle) {
			topControlsVisible = true;
			if (topHideTimerId) clearTimeout(topHideTimerId);
			
			// Only set hide timer if NOT hovering over controls
			if (!isHoveringControls) {
				topHideTimerId = setTimeout(() => {
					if (!isHoveringControls) {
						topControlsVisible = false;
						topHideTimerId = null;
					}
				}, 2000);
			}
		} else if (!isHoveringControls) {
			topControlsVisible = false;
			if (topHideTimerId) {
				clearTimeout(topHideTimerId);
				topHideTimerId = null;
			}
		}
	}

	function resetZoomAndPan() {
		zoomLevel = 1;
		translateX = 0;
		translateY = 0;
		isDragging = false;
	}

	function resetAll() {
		zoomLevel = 1;
		translateX = 0;
		translateY = 0;
		rotation = 0;
		isDragging = false;
		isPortraitImage = false;
	}

	import { tick } from 'svelte';

	$effect(() => {
		if (currentItem?.path) {
			currentImageSrc = `/api/image?path=${encodeURIComponent(currentItem.path)}`;
			isFullImageLoaded = false;
			translateX = 0;
			translateY = 0;
		}
	});

	$effect(() => {
		if (!isModalOpen) {
			currentImageSrc = '';
			currentMetadata = null;
			resetAll();
		}
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		
		function handleOrientationChange() {
			setTimeout(() => {
				if (isModalOpen) {
					zoomLevel = 1;
					translateX = 0;
					translateY = 0;
				}
			}, 100);
		}
		
		window.addEventListener('orientationchange', handleOrientationChange);
		return () => {
			window.removeEventListener('orientationchange', handleOrientationChange);
		};
	});

	onDestroy(() => {
		currentImageSrc = '';
		if (topHideTimerId) clearTimeout(topHideTimerId);
		if (wheelPanResetTimer) clearTimeout(wheelPanResetTimer);
	});

	function closeModal() {
		if (topHideTimerId) { clearTimeout(topHideTimerId); topHideTimerId = null; }
		isModalOpen = false;
		resetZoomAndPan();
	}

	function performZoom(newZoom: number, anchorX?: number, anchorY?: number) {
		if (newZoom === zoomLevel) return;
		
		const oldZoom = zoomLevel;
		zoomLevel = newZoom;

		if (typeof window !== 'undefined') {
			const ax = (anchorX ?? window.innerWidth / 2) - window.innerWidth / 2;
			const ay = (anchorY ?? window.innerHeight / 2) - window.innerHeight / 2;
			
			translateX = ax - (ax - translateX) * (zoomLevel / oldZoom);
			translateY = ay - (ay - translateY) * (zoomLevel / oldZoom);
		}
	}

	function toggleZoom() {
		if (zoomLevel === 1) {
			let targetScale = (renderedWidth && naturalWidth) ? naturalWidth / renderedWidth : 2;
			if (targetScale < 1.1) targetScale = 2;
			performZoom(targetScale);
			if (naturalWidth > 0 && naturalHeight > naturalWidth * 1.2) {
				translateY = maxTranslateY;
			}
		} else {
			zoomLevel = 1;
			translateX = 0;
			translateY = 0;
			isDragging = false;
		}
	}

	function toggleFitWidth() {
		if (typeof window === 'undefined' || !renderedWidth) return;
		
		const fitWidth = isRotated ? effectiveImageWidth : renderedWidth;
		const targetZoom = window.innerWidth / fitWidth;
		
		if (Math.abs(zoomLevel - targetZoom) < 0.01) {
			resetZoomAndPan();
		} else {
			performZoom(targetZoom);
			translateX = 0;
			if (effectiveImageHeight * targetZoom > window.innerHeight) {
				translateY = maxTranslateY;
			} else {
				translateY = 0;
			}
		}
	}

	function handleWheel(event: WheelEvent) {
		if (event.ctrlKey) {
			const delta = event.deltaY;
			const adjustedDelta = event.deltaMode === 1 ? delta * 33 : (event.deltaMode === 2 ? delta * window.innerHeight : delta);
			event.preventDefault(); 
			const newZoom = Math.min(maxZoom, Math.max(minZoom, zoomLevel * Math.pow(1.0015, -adjustedDelta)));
			performZoom(newZoom, event.clientX, event.clientY);
			return;
		}

		const hasDeltaX = Math.abs(event.deltaX) > 0.1;
		const hasDeltaY = Math.abs(event.deltaY) > 0.1;
		
		if (!hasDeltaX && !hasDeltaY) return;
		
		const willPanH = hasDeltaX && canPanHorizontal;
		const willPanV = hasDeltaY && (needsVerticalPan || zoomLevel > 1);
		
		if (!willPanH && !willPanV) return;
		
		event.preventDefault();
		
		if (hasDeltaX) {
			isWheelPanningH = true;
			if (wheelPanResetTimer) clearTimeout(wheelPanResetTimer);
			wheelPanResetTimer = setTimeout(() => {
				isWheelPanningH = false;
				wheelPanResetTimer = null;
			}, 300);
		}
		
		if (willPanH) {
			translateX += event.deltaX * 1.5;
		}
		if (willPanV) {
			translateY -= event.deltaY * 1.5;
		}
	}

	function startDrag(event: MouseEvent) {
		if (canPanHorizontal || needsVerticalPan || zoomLevel > 1) {
			event.preventDefault(); 
			isDragging = true;
			startDragX = event.clientX - translateX;
			startDragY = event.clientY - translateY;
		}
	}

	function onDrag(event: MouseEvent) {
		if (isDragging) {
			translateX = event.clientX - startDragX;
			translateY = event.clientY - startDragY;
		}
	}

	function stopDrag() {
		isDragging = false;
	}

	function isImage(item: ImageFile) {
		return item && !item.isDir && !item.isCbz && !item.isVideo;
	}

	function nextImage() {
		let nextIdx = selectedImageIndex + 1;
		while (nextIdx < loadedImages.length) {
			if (isImage(loadedImages[nextIdx])) {
				selectedImageIndex = nextIdx;
				resetZoomAndPan();
				return;
			}
			nextIdx++;
		}
		
		if (hasMore) {
			loadFolder(false, currentPage + 1, true).then(() => {
				nextImage();
			});
		}
	}

	function prevImage() {
		let prevIdx = selectedImageIndex - 1;
		while (prevIdx >= 0) {
			if (isImage(loadedImages[prevIdx])) {
				selectedImageIndex = prevIdx;
				resetZoomAndPan();
				return;
			}
			prevIdx--;
		}
		
		if (currentPage > 0) {
			loadFolder(false, currentPage - 1).then(() => {
				if (loadedImages.length > 0) {
					let lastImageIdx = -1;
					for (let i = loadedImages.length - 1; i >= 0; i--) {
						if (isImage(loadedImages[i])) {
							lastImageIdx = i;
							break;
						}
					}
					if (lastImageIdx !== -1) {
						selectedImageIndex = lastImageIdx;
						resetZoomAndPan();
					}
				}
			});
		}
	}

	const currentImageIndexDisplay = $derived.by(() => {
		if (!currentItem) return 0;
		return loadedImages.slice(0, selectedImageIndex + 1).filter(isImage).length;
	});

	let modalContainer = $state<HTMLElement | null>(null);

	$effect(() => {
		if (isModalOpen && modalContainer) {
			modalContainer.focus();
		}
	});

	function handleKeyDown(event: KeyboardEvent) {
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
		if (!isModalOpen) return;

		const key = event.key.toLowerCase();
		if (key === 'z') {
			event.preventDefault();
			toggleZoom();
			return;
		}

		switch (event.code) { 
			case 'Escape': closeModal(); break;
			case 'ArrowRight': 
				event.preventDefault(); 
				if (canPanHorizontal) translateX -= 30;
				else nextImage(); 
				break;
			case 'ArrowLeft': 
				event.preventDefault(); 
				if (canPanHorizontal) translateX += 30;
				else prevImage(); 
				break;
			case 'ArrowUp':
				if (zoomLevel > 1) { event.preventDefault(); translateY += 30; }
				break;
			case 'ArrowDown':
				if (zoomLevel > 1) { event.preventDefault(); translateY -= 30; }
				break;
			case 'PageUp':
				event.preventDefault();
				if (zoomLevel > 1) { 
					translateY -= window.innerHeight * 0.8; 
				} else {
					prevImage();
				}
				break;
			case 'PageDown':
				event.preventDefault();
				if (zoomLevel > 1) { 
					translateY += window.innerHeight * 0.8; 
				} else {
					nextImage();
				}
				break;
			case 'Home':
				if (zoomLevel > 1) {
					event.preventDefault();
					translateY = maxTranslateY;
				}
				break;
			case 'End':
				if (zoomLevel > 1) {
					event.preventDefault();
					translateY = -maxTranslateY;
				}
				break;
			case 'Space': 
				event.preventDefault(); 
				if (event.shiftKey) prevImage();
				else nextImage();
				break;
		}
	}

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
    
	$effect(() => {
		if (isModalOpen && currentItem) {
			if (currentItem.width && currentItem.height && currentMetadata === null) {
				currentMetadata = {
					size: currentItem.size,
					lastModified: currentItem.lastModified,
					width: currentItem.width,
					height: currentItem.height
				};
				return;
			}

			const controller = new AbortController();
			isMetadataLoading = true;
			fetch(`/api/image?path=${encodeURIComponent(currentItem.path)}&metadata=true`, { signal: controller.signal })
				.then(res => res.json())
				.then(data => {
					currentMetadata = data;
					currentItem.width = data.width;
					currentItem.height = data.height;
					currentItem.size = data.size;
					currentItem.lastModified = data.lastModified;
				})
				.catch((err) => { if (err.name !== 'AbortError') console.warn('Metadata fetch failed', err); })
				.finally(() => { isMetadataLoading = false; });

			return () => {
				controller.abort();
				isMetadataLoading = false;
			};
		} else {
			currentMetadata = null;
		}
	});

</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isModalOpen}
	<div
		bind:this={modalContainer}
		id="media-modal-container"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		class="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex flex-col h-full w-full overflow-hidden outline-none animate-in fade-in duration-300"
		onmousemove={handleMouseMoveVisibility}
	>
		<!-- TOP BACKGROUND SHADOW (Full Width) -->
		<div 
			class="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none transition-opacity duration-300 {topControlsVisible ? 'opacity-100' : 'opacity-0'} z-[110]"
		></div>

		<!-- Toolbar (Top) -->
		<div class="absolute top-0 w-full p-4 flex justify-between items-start z-[110] bg-transparent pointer-events-none transition-all duration-300 {topControlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}">
			<!-- TOP LEFT: Info Area -->
			<div 
				class="text-white/90 pointer-events-auto flex flex-col max-w-[70%]" 
				onclick={(e) => e.stopPropagation()}
				onmouseenter={() => (isHoveringControls = true)}
				onmouseleave={() => (isHoveringControls = false)}
			>
				{#if currentItem}
					<p class="select-text text-white font-black text-lg sm:text-2xl tracking-tight whitespace-normal break-words leading-tight">
						<span class="px-2 py-0.5 -mx-2 rounded-lg">
							{currentImageIndexDisplay} / {totalImages} — {currentItem.name}
						</span>
					</p>
					{#if currentMetadata}
						<p class="select-text text-white/50 text-[10px] sm:text-xs font-mono mt-1">
							<span class="px-1 rounded-sm">
								{formatBytes(currentMetadata.size)} 
								{#if naturalWidth > 0 && naturalHeight > 0}
									• {naturalWidth} x {naturalHeight}
								{:else if currentMetadata.width && currentMetadata.height}
									• {currentMetadata.width} x {currentMetadata.height}
								{/if}
								• {formatDateTime(currentMetadata.lastModified)}
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
				onmouseenter={() => (isHoveringControls = true)}
				onmouseleave={() => (isHoveringControls = false)}
			>
				<!-- Close Button -->
				<button 
					aria-label="Close" 
					class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/95 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl transition-all hover:scale-110 mb-2" 
					onclick={(e) => { e.stopPropagation(); closeModal(); }} 
					onmousedown={(e) => e.preventDefault()}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
				</button>

				<!-- Navigation Group -->
				<div class="flex flex-col bg-zinc-900/95 rounded-xl backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl w-12 mb-3 pointer-events-auto">
					<button aria-label="Previous" class="btn btn-ghost w-12 h-12 min-h-0 p-0 text-white rounded-none border-b border-white/10 transition-colors hover:bg-white/5" onclick={(e) => { e.stopPropagation(); prevImage(); }} onmousedown={(e) => e.preventDefault()}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
					</button>
					<button aria-label="Next" class="btn btn-ghost border-none w-12 h-12 min-h-0 p-0 text-white rounded-none transition-colors hover:bg-white/5" onclick={(e) => { e.stopPropagation(); nextImage(); }} onmousedown={(e) => e.preventDefault()}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
					</button>
				</div>

				<!-- Zoom Modes -->
				<div class="flex flex-col bg-zinc-900/95 rounded-xl backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl w-12 mb-3 pointer-events-auto">
					<button 
						aria-label="Fit Width" 
						class="btn btn-ghost w-12 h-12 min-h-0 p-0 text-white rounded-none border-b border-white/10 flex items-center justify-center transition-colors hover:bg-white/5"
						onclick={(e) => { e.stopPropagation(); toggleFitWidth(); }}
						onmousedown={(e) => e.preventDefault()}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7h8m-8 5h8m-8 5h8M4 5v14M20 5v14" /></svg>
					</button>
					<button 
						aria-label="Toggle 1:1" 
						class="btn btn-ghost border-none w-12 h-12 min-h-0 p-0 text-white rounded-none font-black font-mono flex items-center justify-center text-[10px] transition-colors hover:bg-white/5"
						onclick={(e) => { e.stopPropagation(); toggleZoom(); }}
						onmousedown={(e) => e.preventDefault()}
					>
						1:1
					</button>
					<button 
						aria-label="Rotate" 
						class="btn btn-ghost w-12 h-12 min-h-0 p-0 text-white rounded-none transition-colors hover:bg-white/5 border-t border-white/10 flex items-center justify-center"
						onclick={(e) => { e.stopPropagation(); rotateImage(); }}
						onmousedown={(e) => e.preventDefault()}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
					</button>
				</div>

				<!-- Zoom Controls -->
				<div class="flex flex-col bg-zinc-900/95 rounded-xl backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl w-12 pointer-events-auto">
					<button aria-label="Zoom In" class="btn btn-ghost w-12 h-12 min-h-0 p-0 text-white rounded-none border-b border-white/10 transition-colors hover:bg-white/5" onclick={(e) => { 
						e.stopPropagation(); 
						performZoom(Math.min(maxZoom, zoomLevel * 1.35));
					}} onmousedown={(e) => e.preventDefault()}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" /></svg>
					</button>
					<button 
						aria-label="Current Zoom" 
						class="w-full py-2 text-[10px] font-mono font-black text-white hover:bg-white/10 transition-colors bg-white/5 flex items-center justify-center tracking-tighter vertical-text"
						onclick={(e) => { e.stopPropagation(); resetAll(); }}
						onmousedown={(e) => e.preventDefault()}
					>
						{absoluteZoomPercent}%
					</button>
					<button aria-label="Zoom Out" class="btn btn-ghost w-12 h-12 min-h-0 p-0 text-white rounded-none border-t border-white/10 transition-colors hover:bg-white/5" onclick={(e) => { 
						e.stopPropagation(); 
						performZoom(Math.max(minZoom, zoomLevel / 1.35));
					}} onmousedown={(e) => e.preventDefault()}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4" /></svg>
					</button>
				</div>
			</div>
		</div>
		
		<!-- Main View Area -->
		<div 
			class="relative flex-1 w-full h-full flex items-center justify-center p-0 overflow-hidden" 
			onmousemove={handleMouseMoveVisibility}
		>
			{#if currentItem}
				<div 
					class="relative flex items-center justify-center w-full h-full overflow-hidden"
					onwheel={handleWheel}
					onmousedown={startDrag}
					onmousemove={onDrag}
					onmouseup={stopDrag}
					onmouseleave={stopDrag}
					role="presentation"
				>
						{#key imageKey}
						<img 
							src={currentImageSrc}
							bind:clientWidth={renderedWidth}
							onload={(e) => {
								const img = e.target as HTMLImageElement;
								naturalWidth = img.naturalWidth;
								naturalHeight = img.naturalHeight;
								isPortraitImage = naturalHeight > naturalWidth;
								isFullImageLoaded = true;
								renderedWidth = img.clientWidth;
								if (renderedWidth > 0) {
									fitImageToViewport();
								} else {
									setTimeout(fitImageToViewport, 50);
								}
							}}
							class="pointer-events-auto select-none"
							style="transform: translate({translateX}px, {translateY}px) scale({zoomLevel}) rotate({rotation}deg); transition: transform 0.2s ease-out;"
							decoding="async"
							fetchpriority="high"
							draggable="false"
							onclick={(e) => e.stopPropagation()}
							ondblclick={(e) => { e.stopPropagation(); toggleZoom(); }}
							onerror={(e) => handleImageError(e, currentItem.path)}
							alt={currentItem.name}
						/>
					{/key}
				</div>
			{/if}
		</div>
	</div>
{/if}


