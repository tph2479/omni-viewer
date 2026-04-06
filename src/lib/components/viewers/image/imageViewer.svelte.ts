import { tick } from 'svelte';
import type { ImageFile } from '$lib/utils/fileUtils';
import { cacheVersion } from '$lib/stores/system/cache.svelte';

export const IMAGE_CONTEXT_KEY = Symbol('image-context');
export type ImageViewerContext = ReturnType<typeof createImageModalState>;

const minZoom = 0.001;
const maxZoom = 500;

export function createImageModalState(props: {
	get isModalOpen(): boolean;
	set isModalOpen(v: boolean);
	get selectedImageIndex(): number;
	set selectedImageIndex(v: number);
	get loadedImages(): ImageFile[];
	get totalImages(): number;
	get hasMore(): boolean;
	get currentPage(): number;
	loadFolder: (reset: boolean, page: number, append?: boolean) => Promise<void>;
	get isGrouped(): boolean;
	onSwitchToPagination: () => Promise<void>;
}) {
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

	let isPinching = $state(false);
	let pinchStartDistance = 0;
	let pinchStartZoom = 1;
	let pinchStartTranslateX = 0;
	let pinchStartTranslateY = 0;
	let pinchCenterX = 0;
	let pinchCenterY = 0;

	let pinchTranslateX = $state(0);
	let pinchTranslateY = $state(0);

	let infoVisible = $state(false);
	let isHoveringInfo = $state(false);
	let infoHideTimerId: any = null;

	let rightControlsVisible = $state(false);
	let isHoveringRightControls = $state(false);
	let rightHideTimerId: any = null;

	let currentMetadata = $state<any>(null);
	let isMetadataLoading = $state(false);
	
	let mouseX = $state(0);
	let mouseY = $state(0);
	
	let lastPathForReset = '';
	let imageKey = $state(0);
	let lastMetadataPath = '';
	let metadataRetryCount = $state(0);

	const currentItem = $derived(props.loadedImages[props.selectedImageIndex] || null);
	const isRotated = $derived(rotation === 90 || rotation === 270);
	const realScaleRatio = $derived((renderedWidth && naturalWidth && naturalWidth > 0) ? renderedWidth / naturalWidth : 1);
	const absoluteZoomPercent = $derived(Math.round(zoomLevel * realScaleRatio * 100));

	const imageRenderedHeight = $derived(naturalWidth > 0 ? renderedWidth * (naturalHeight / naturalWidth) : 0);
	const effectiveImageWidth = $derived(isRotated ? imageRenderedHeight : renderedWidth);
	const effectiveImageHeight = $derived(isRotated ? renderedWidth : imageRenderedHeight);

	const maxTranslateX = $derived(Math.max(0, (effectiveImageWidth * zoomLevel - (typeof window !== 'undefined' ? window.innerWidth : 0)) / 2));
	const maxTranslateY = $derived(Math.max(0, (effectiveImageHeight * zoomLevel - (typeof window !== 'undefined' ? window.innerHeight : 0)) / 2));
	const needsHorizontalPan = $derived(effectiveImageWidth * zoomLevel > (typeof window !== 'undefined' ? window.innerWidth : 0));
	const needsVerticalPan = $derived(effectiveImageHeight * zoomLevel > (typeof window !== 'undefined' ? window.innerHeight : 0));

	const currentImageIndexDisplay = $derived.by(() => {
		if (!currentItem) return 0;
		return props.loadedImages.slice(0, props.selectedImageIndex + 1).filter(isImage).length;
	});

	$effect.pre(() => {
		if (isPinching) return;
		if (needsHorizontalPan || isWheelPanningH) {
			translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, translateX));
		} else {
			translateX = 0;
		}
		if (needsVerticalPan) {
			translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, translateY));
		} else {
			translateY = 0;
		}
	});

	$effect.pre(() => {
		const path = currentItem?.path || '';
		if (path && path !== lastPathForReset) {
			lastPathForReset = path;
			imageKey++;
			naturalWidth = 0;
			naturalHeight = 0;
			renderedWidth = 0;
			zoomLevel = 1;
			translateX = 0;
			translateY = 0;
		}
	});

	$effect.pre(() => {
		if (currentItem?.path) {
			currentImageSrc = `/api/media?path=${encodeURIComponent(currentItem.path)}&v=${cacheVersion.value}`;
			isFullImageLoaded = false;
			translateX = 0;
			translateY = 0;
		}
	});

	$effect.pre(() => {
		if (!props.isModalOpen) {
			currentImageSrc = '';
			currentMetadata = null;
			resetAll();
		}
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		
		function handleResize() {
			fitImageToViewport();
		}
		
		function handleOrientationChange() {
			setTimeout(() => {
				if (props.isModalOpen) {
					fitImageToViewport();
				}
			}, 200);
		}
		
		if (typeof window !== 'undefined') {
			window.addEventListener('orientationchange', handleOrientationChange);
			window.addEventListener('resize', handleResize);
		}
		return () => {
			if (typeof window !== 'undefined') {
				window.removeEventListener('orientationchange', handleOrientationChange);
				window.removeEventListener('resize', handleResize);
			}
		};
	});

	$effect(() => {
		if (props.isModalOpen && currentItem && (currentItem.path !== lastMetadataPath || metadataRetryCount > 0)) {
			const isMetadataRetry = currentItem.path === lastMetadataPath && metadataRetryCount > 0;
			const currentPath = currentItem.path;
			lastMetadataPath = currentPath;
			
			if (!isMetadataRetry && currentItem.width && currentItem.height && currentMetadata === null) {
				currentMetadata = {
					name: currentItem.name,
					path: currentPath,
					width: currentItem.width,
					height: currentItem.height,
					size: currentItem.size || 0,
					lastModified: currentItem.lastModified || 0
				};
			}

			const controller = new AbortController();
			isMetadataLoading = true;
			const retryParam = isMetadataRetry ? '&retry=true' : '';
			
			fetch(`/api/media?path=${encodeURIComponent(currentPath)}&metadata=true${retryParam}&v=${cacheVersion.value}`, { signal: controller.signal })
				.then(res => res.json())
				.then(data => {
					if (currentPath === currentItem.path) {
						currentMetadata = { ...data, path: currentPath };
						currentItem.width = data.width;
						currentItem.height = data.height;
					}
				})
				.catch(err => {
					if (err.name !== 'AbortError') console.error('Metadata fetch error:', err);
				})
				.finally(() => {
					if (currentPath === currentItem.path) {
						isMetadataLoading = false;
						if (isMetadataRetry) metadataRetryCount = 0;
					}
				});

			return () => controller.abort();
		} else if (!props.isModalOpen) {
			currentMetadata = null;
			lastMetadataPath = '';
			metadataRetryCount = 0;
		}
	});

	function cleanup() {
		currentImageSrc = '';
		if (infoHideTimerId) clearTimeout(infoHideTimerId);
		if (rightHideTimerId) clearTimeout(rightHideTimerId);
		if (wheelPanResetTimer) clearTimeout(wheelPanResetTimer);
	}

	function hideControlsImmediately() {
		if (infoHideTimerId) { clearTimeout(infoHideTimerId); infoHideTimerId = null; }
		if (rightHideTimerId) { clearTimeout(rightHideTimerId); rightHideTimerId = null; }
		infoVisible = false;
		rightControlsVisible = false;
	}

	function fitImageToViewport(forcedRotation?: number) {
		if (renderedWidth > 0 && naturalWidth > 0 && naturalHeight > 0) {
			const rot = forcedRotation !== undefined ? forcedRotation : rotation;
			const isRot = rot === 90 || rot === 270;
			const imgH = renderedWidth * (naturalHeight / naturalWidth);
			const fitWidth = isRot ? imgH : renderedWidth;
			const fitHeight = isRot ? renderedWidth : imgH;
			
			const isDesktop = window.innerWidth >= 768;
			const targetW = isDesktop ? 0.8 : 1.0;
			const targetH = isDesktop ? 0.9 : 1.0;
			
			const fitWidthZoom = (window.innerWidth * targetW) / fitWidth;
			const fitHeightZoom = (window.innerHeight * targetH) / fitHeight;
			
			// On mobile, use 100% of the viewport (no extra padding)
			// but still use the smaller of the two zooms to ensure the whole image is visible (Best Fit).
			zoomLevel = Math.min(fitWidthZoom, fitHeightZoom);
			translateX = 0;
			translateY = 0;
		}
	}

	function rotateImage() {
		const newRotation = (rotation + 90) % 360;
		fitImageToViewport(newRotation);
		rotation = newRotation;
		translateX = 0;
		translateY = 0;
	}

	function handleMouseMoveVisibility(e: MouseEvent) {
		if (typeof window === 'undefined') return;
		
		mouseX = e.clientX;
		mouseY = e.clientY;
		
		const height = window.innerHeight;
		const width = window.innerWidth;
		const ratioX = e.clientX / width;
		const ratioY = e.clientY / height;

		const selection = window.getSelection();
		const hasSelection = selection && selection.toString().length > 0;

		const isInTopStrip = ratioY < 0.15; 
		const isInRightStrip = ratioX > 0.85;

		if (hasSelection || isInTopStrip || isHoveringInfo) {
			infoVisible = true;
			if (infoHideTimerId) clearTimeout(infoHideTimerId);
			if (!isHoveringInfo) {
				infoHideTimerId = setTimeout(() => {
					const currentSelection = window.getSelection();
					const stillHasSelection = currentSelection && currentSelection.toString().length > 0;
					if (!isHoveringInfo && !stillHasSelection) {
						infoVisible = false;
						infoHideTimerId = null;
					}
				}, 2000);
			}
		} else if (!isHoveringInfo) {
			infoVisible = false;
			if (infoHideTimerId) {
				clearTimeout(infoHideTimerId);
				infoHideTimerId = null;
			}
		}
		
		if (isInRightStrip || isHoveringRightControls) {
			rightControlsVisible = true;
			if (rightHideTimerId) clearTimeout(rightHideTimerId);
			if (!isHoveringRightControls) {
				rightHideTimerId = setTimeout(() => {
					if (!isHoveringRightControls) {
						rightControlsVisible = false;
						rightHideTimerId = null;
					}
				}, 2000);
			}
		} else if (!isHoveringRightControls) {
			rightControlsVisible = false;
			if (rightHideTimerId) {
				clearTimeout(rightHideTimerId);
				rightHideTimerId = null;
			}
		}
	}

	function resetZoomAndPan() {
		fitImageToViewport();
		translateX = 0;
		translateY = 0;
		isDragging = false;
	}

	function resetAll() {
		resetZoomAndPan();
		rotation = 0;
		isPortraitImage = false;
	}

	function closeModal() {
		if (infoHideTimerId) { clearTimeout(infoHideTimerId); infoHideTimerId = null; }
		if (rightHideTimerId) { clearTimeout(rightHideTimerId); rightHideTimerId = null; }
		props.isModalOpen = false;
		resetZoomAndPan();
	}

	function performZoom(newZoom: number, anchorX?: number, anchorY?: number) {
		const minZoom = getBestFitZoom();
		const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
		const oldZoom = zoomLevel;
		
		if (clampedZoom <= minZoom + 0.001) {
			zoomLevel = minZoom;
			translateX = 0;
			translateY = 0;
			return;
		}
		
		if (clampedZoom === zoomLevel) return;
		zoomLevel = clampedZoom;

		if (typeof window !== 'undefined') {
			const ax = (anchorX ?? window.innerWidth / 2) - window.innerWidth / 2;
			const ay = (anchorY ?? window.innerHeight / 2) - window.innerHeight / 2;
			translateX = ax - (ax - translateX) * (zoomLevel / oldZoom);
			translateY = ay - (ay - translateY) * (zoomLevel / oldZoom);
		}
	}

	function getBestFitZoom() {
		if (renderedWidth <= 0 || naturalWidth <= 0 || naturalHeight <= 0) return 1;
		const isRot = rotation === 90 || rotation === 270;
		const imgH = renderedWidth * (naturalHeight / naturalWidth);
		const fitW = isRot ? imgH : renderedWidth;
		const fitH = isRot ? renderedWidth : imgH;
		const isDesktop = window.innerWidth >= 768;
		const targetW = isDesktop ? 0.8 : 1.0;
		const targetH = isDesktop ? 0.9 : 1.0;
		return Math.min((window.innerWidth * targetW) / fitW, (window.innerHeight * targetH) / fitH);
	}

	function toggleZoom(anchorX?: number, anchorY?: number) {
		let targetScale = (renderedWidth && naturalWidth) ? naturalWidth / renderedWidth : 2;
		if (targetScale < 1.1) targetScale = 1;
		
		// If zoom level is currently at or close to targetScale (or significantly zoomed in), reset to best fit
		if (zoomLevel >= targetScale * 0.95) {
			resetZoomAndPan();
		} else {
			performZoom(targetScale, anchorX, anchorY);
			// Only force scroll to top for tall images if we DID NOT zoom via mouse anchor
			if (anchorX === undefined && naturalWidth > 0 && naturalHeight > naturalWidth * 1.2) {
				translateY = maxTranslateY;
			}
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

	function getTouchDistance(t1: Touch, t2: Touch) {
		const dx = t1.clientX - t2.clientX;
		const dy = t1.clientY - t2.clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function handleTouchStart(event: TouchEvent) {
		if (event.touches.length === 2) {
			event.preventDefault();
			isDragging = false;
			isPinching = true;
			pinchStartDistance = getTouchDistance(event.touches[0], event.touches[1]);
			pinchStartZoom = zoomLevel;
			pinchStartTranslateX = translateX;
			pinchStartTranslateY = translateY;
			pinchCenterX = (event.touches[0].clientX + event.touches[1].clientX) / 2 - window.innerWidth / 2;
			pinchCenterY = (event.touches[0].clientY + event.touches[1].clientY) / 2 - window.innerHeight / 2;
		}
	}

	function handleTouchMove(event: TouchEvent) {
		if (!isPinching || event.touches.length !== 2) return;
		event.preventDefault();

		const currentDistance = getTouchDistance(event.touches[0], event.touches[1]);
		const scale = currentDistance / pinchStartDistance;
		const newZoom = Math.min(maxZoom, Math.max(getBestFitZoom(), pinchStartZoom * scale));
		const zoomRatio = newZoom / pinchStartZoom;

		const stx = pinchStartTranslateX;
		const sty = pinchStartTranslateY;

		zoomLevel = newZoom;
		translateX = pinchCenterX - (pinchCenterX - stx) * zoomRatio;
		translateY = pinchCenterY - (pinchCenterY - sty) * zoomRatio;
	}

	function handleTouchEnd(event: TouchEvent) {
		if (isPinching && event.touches.length === 0) {
			isPinching = false;
			const minZoom = getBestFitZoom();
			if (zoomLevel <= minZoom + 0.001) {
				zoomLevel = minZoom;
				translateX = 0;
				translateY = 0;
			}
		}
	}

	function handleWheel(event: WheelEvent) {
		if (event.ctrlKey) {
			const delta = event.deltaY;
			const adjustedDelta = event.deltaMode === 1 ? delta * 33 : (event.deltaMode === 2 ? delta * window.innerHeight : delta);
			event.preventDefault(); 
			const newZoom = Math.min(maxZoom, Math.max(minZoom, zoomLevel * Math.pow(1.005, -adjustedDelta)));
			performZoom(newZoom, event.clientX, event.clientY);
			return;
		}

		let dX = event.deltaX;
		let dY = event.deltaY;
		
		// Map vertical wheel to horizontal pan if image only overflows horizontally (e.g. rotated)
		if (!needsVerticalPan && needsHorizontalPan && Math.abs(dY) > 0.1 && Math.abs(dX) < 0.1) {
			dX = dY;
			dY = 0;
		}

		const hasDeltaX = Math.abs(dX) > 0.1;
		const hasDeltaY = Math.abs(dY) > 0.1;
		if (!hasDeltaX && !hasDeltaY) return;
		
		const willPanH = hasDeltaX && (needsHorizontalPan || isWheelPanningH);
		const willPanV = hasDeltaY && needsVerticalPan;
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
		
		// Standard native 2D scroll behavior
		if (willPanH) translateX -= dX * 1.5;
		if (willPanV) translateY -= dY * 1.5;
	}

	function startDrag(event: MouseEvent) {
		if (needsHorizontalPan || needsVerticalPan) {
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
		return item && !item.isDir && !item.isCbz && !item.isVideo && !item.isAudio && !item.isPdf && !item.isEpub;
	}

	async function nextImage() {
		let nextIdx = props.selectedImageIndex + 1;
		
		if (props.isGrouped && nextIdx >= props.loadedImages.length && props.onSwitchToPagination) {
			await props.onSwitchToPagination();
		}

		while (nextIdx < props.loadedImages.length) {
			if (isImage(props.loadedImages[nextIdx])) {
				props.selectedImageIndex = nextIdx;
				return;
			}
			nextIdx++;
		}
		
		if (props.hasMore && !props.isGrouped) {
			props.selectedImageIndex = -1;
			props.loadFolder(false, props.currentPage + 1, false).then(() => {
				let startIdx = 0;
				while (startIdx < props.loadedImages.length) {
					if (isImage(props.loadedImages[startIdx])) {
						props.selectedImageIndex = startIdx;
						return;
					}
					startIdx++;
				}
			});
		}
	}

	function prevImage() {
		let prevIdx = props.selectedImageIndex - 1;
		while (prevIdx >= 0) {
			if (isImage(props.loadedImages[prevIdx])) {
				props.selectedImageIndex = prevIdx;
				return;
			}
			prevIdx--;
		}
		
		if (props.currentPage > 0) {
			const targetPage = props.currentPage - 1;
			props.selectedImageIndex = -1;
			props.loadFolder(false, targetPage, false).then(() => {
				if (props.loadedImages.length > 0) {
					let lastImageIdx = -1;
					for (let i = props.loadedImages.length - 1; i >= 0; i--) {
						if (isImage(props.loadedImages[i])) {
							lastImageIdx = i;
							break;
						}
					}
					if (lastImageIdx !== -1) {
						props.selectedImageIndex = lastImageIdx;
					}
				}
			});
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
		if (!props.isModalOpen) return;

		const key = event.key.toLowerCase();
		if (key === 'z') {
			event.preventDefault();
			toggleZoom(mouseX || window.innerWidth / 2, mouseY || window.innerHeight / 2);
			return;
		}
		if (key === '=' || key === '+') {
			event.preventDefault();
			performZoom(Math.min(maxZoom, zoomLevel * 1.35), mouseX || window.innerWidth / 2, mouseY || window.innerHeight / 2);
			return;
		}
		if (key === '-') {
			event.preventDefault();
			performZoom(Math.max(minZoom, zoomLevel / 1.35), mouseX || window.innerWidth / 2, mouseY || window.innerHeight / 2);
			return;
		}

		switch (event.code) { 
			case 'Escape': closeModal(); break;
			case 'ArrowRight': 
				event.preventDefault(); 
				if (needsHorizontalPan && translateX > -maxTranslateX + 1) translateX -= 30;
				else nextImage(); 
				break;
			case 'ArrowLeft': 
				event.preventDefault(); 
				if (needsHorizontalPan && translateX < maxTranslateX - 1) translateX += 30;
				else prevImage(); 
				break;
			case 'ArrowUp':
				if (needsVerticalPan) { event.preventDefault(); translateY += 30; }
				break;
			case 'ArrowDown':
				if (needsVerticalPan) { event.preventDefault(); translateY -= 30; }
				break;
			case 'PageUp':
				event.preventDefault();
				if (needsVerticalPan && translateY < maxTranslateY - 1) { 
					translateY += window.innerHeight * 0.8; 
				} else {
					prevImage();
				}
				break;
			case 'PageDown':
				event.preventDefault();
				if (needsVerticalPan && translateY > -maxTranslateY + 1) { 
					translateY -= window.innerHeight * 0.8; 
				} else {
					nextImage();
				}
				break;
			case 'Home':
				if (needsVerticalPan) {
					event.preventDefault();
					translateY = maxTranslateY;
				}
				break;
			case 'End':
				if (needsVerticalPan) {
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

    return {
        get zoomLevel() { return zoomLevel; },
        get isDragging() { return isDragging; },
        get translateX() { return translateX; },
        get translateY() { return translateY; },
        get naturalWidth() { return naturalWidth; },
        set naturalWidth(v) { naturalWidth = v; },
        get naturalHeight() { return naturalHeight; },
        set naturalHeight(v) { naturalHeight = v; },
        get renderedWidth() { return renderedWidth; },
        set renderedWidth(v) { renderedWidth = v; },
        get isFullImageLoaded() { return isFullImageLoaded; },
        set isFullImageLoaded(v) { isFullImageLoaded = v; },
        get isPinching() { return isPinching; },
        get rotation() { return rotation; },
        get currentImageSrc() { return currentImageSrc; },
        get isPortraitImage() { return isPortraitImage; },
        set isPortraitImage(v) { isPortraitImage = v; },
        get infoVisible() { return infoVisible; },
        get rightControlsVisible() { return rightControlsVisible; },
        get currentMetadata() { return currentMetadata; },
        get imageKey() { return imageKey; },
        get currentItem() { return currentItem; },
        get absoluteZoomPercent() { return absoluteZoomPercent; },
        get currentImageIndexDisplay() { return currentImageIndexDisplay; },
        get totalImages() { return props.totalImages; },
        get loadedImages() { return props.loadedImages; },

        set isHoveringInfo(v: boolean) { isHoveringInfo = v; },
        set isHoveringRightControls(v: boolean) { isHoveringRightControls = v; },
        set metadataRetryCount(v: number) { metadataRetryCount = v; },

        fitImageToViewport,
        rotateImage,
        handleMouseMoveVisibility,
        closeModal,
        performZoom,
        toggleZoom,
        toggleFitWidth,
        handleWheel,
        startDrag,
        onDrag,
        stopDrag,
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
        nextImage,
        prevImage,
        handleKeyDown,
		cleanup,
		resetAll,
		hideControlsImmediately
    };
}
