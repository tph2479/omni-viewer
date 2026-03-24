import { tick } from 'svelte';
import type { ImageFile } from '$lib/utils/utils';

export function createWebtoonController(folderPath: string) {
	const s = $state({
		folderPath,
		loadedImages: [] as ImageFile[],
		totalImages: 0,
		isLoading: false,
		errorMsg: '',
		
		controlsVisible: false,
		isEditingPage: false,
		isJumpPopupOpen: false,
		hideTimerId: null as any,

		currentPage: 0,
		hasMore: true,
		
		webtoonZoomLevel: 0.6,
		previousWebtoonZoom: 0.6,
		
		webtoonScrollContainer: undefined as HTMLElement | undefined,
		pendingScrollTop: null as number | null,
		goToPageInput: "",
		
		aspectRatios: {} as Record<number, number>,
		
		currentImageIndex: 0,
		
		get smoothPercent() {
			return this.totalImages > 0 ? ((this.currentImageIndex + 1) / this.totalImages) * 100 : 0;
		},
		
		isDraggingSeek: false,
		hasMoved: false,
		startY: 0,
		previewPercent: 0,
		lastScrollPercent: 0,
		anchorPercentInImage: 0,
		seekBarElement: null as HTMLElement | null
	});

	const WEBTOON_PAGE_SIZE = 5000;
	const BUFFER_SIZE = 5;

	async function loadWebtoonFolder() {
		if (!s.folderPath.trim() || s.isLoading) return;

		s.isLoading = true;
		s.errorMsg = '';
		s.loadedImages = [];
		s.totalImages = 0;
		s.hasMore = true;

		try {
			let allImages: any[] = [];
			let page = 0;
			let hasMorePages = true;

			while (hasMorePages) {
				const res = await fetch(`/api/file?action=gallery&folder=${encodeURIComponent(s.folderPath)}&page=${page}&limit=${WEBTOON_PAGE_SIZE}&sort=name_asc&imagesOnly=true`);
				const data = await res.json();
				if (!res.ok) throw new Error(data.message || "Error loading webtoon data");

				allImages = allImages.concat(data.images);
				s.totalImages = data.totalImages;
				hasMorePages = data.hasMore;
				page++;

				if (!hasMorePages || allImages.length >= data.total) {
					hasMorePages = false;
				}
			}

			s.loadedImages = allImages;
			s.hasMore = false;
		} catch (e: any) {
			s.errorMsg = e.message;
		} finally {
			s.isLoading = false;
		}
	}

	async function loadMore() {
		// Placeholder for future pagination
	}

	function scrollToIndex(index: number, behavior: ScrollBehavior = 'smooth') {
		if (!s.webtoonScrollContainer) return;
		const target = document.getElementById(`webtoon-image-${index}`);
		if (target) {
			target.scrollIntoView({ behavior, block: 'start' });
		}
	}

	function handlePageInput(val: string) {
		const page = parseInt(val);
		if (!isNaN(page) && page >= 1 && page <= s.totalImages) {
			scrollToIndex(page - 1);
		}
	}

	function setWebtoonZoom(newZoom: number, cursorY?: number, options?: { skipScroll?: boolean }) {
		if (!s.webtoonScrollContainer || newZoom === s.webtoonZoomLevel) return;
		
		const oldZoom = s.webtoonZoomLevel;
		const ratio = newZoom / oldZoom;
		
		// `pt-4` in the container equals 16px of non-scaled padding top.
		const paddingTop = 16;
		const yAnchor = cursorY ?? (window.innerHeight / 2);
		
		const currentScroll = s.pendingScrollTop !== null ? s.pendingScrollTop : s.webtoonScrollContainer.scrollTop;
		const contentY = currentScroll + yAnchor - paddingTop;
		
		s.webtoonZoomLevel = newZoom;
		
		if (options?.skipScroll) {
			s.pendingScrollTop = null;
			return;
		}

		s.pendingScrollTop = (contentY * ratio) + paddingTop - yAnchor;
		
		tick().then(() => {
			if (s.webtoonScrollContainer && s.pendingScrollTop !== null) {
				s.webtoonScrollContainer.scrollTop = s.pendingScrollTop;
				s.pendingScrollTop = null;
				
				// Synchronize the stable percentage after zoom adjustment to avoid jumps on next resize
				if (s.webtoonScrollContainer.scrollHeight > 0) {
					s.lastScrollPercent = s.webtoonScrollContainer.scrollTop / s.webtoonScrollContainer.scrollHeight;
					
					const anchorEl = document.getElementById(`webtoon-image-${s.currentImageIndex}`);
					if (anchorEl) {
						const rect = anchorEl.getBoundingClientRect();
						const cRect = s.webtoonScrollContainer.getBoundingClientRect();
						s.anchorPercentInImage = (cRect.top - rect.top) / rect.height;
					}
				}
			}
		});
	}

	function toggleWebtoonFit() {
		if (s.webtoonZoomLevel >= 0.99) {
			setWebtoonZoom(s.previousWebtoonZoom < 0.99 ? s.previousWebtoonZoom : 0.6);
		} else {
			s.previousWebtoonZoom = s.webtoonZoomLevel;
			setWebtoonZoom(1);
		}
	}

	function cleanupOldSizes() {
		// Deactivated to ensure layout stability during window resize and jumps.
		// Aspect ratios are tiny and should be kept for the duration of the folder view.
	}

	function handleSeekBarMouseDown(e: MouseEvent) {
		if (!s.seekBarElement) return;
		s.isDraggingSeek = true;
		s.hasMoved = false;
		s.startY = e.clientY;
		updatePreview(e);
		
		const targetIdx = Math.floor((s.previewPercent / 100) * s.totalImages);
		scrollToIndex(Math.min(targetIdx, s.totalImages - 1));
	}

	function updatePreview(e: MouseEvent) {
		if (!s.seekBarElement) return;
		const rect = s.seekBarElement.getBoundingClientRect();
		const percentage = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) * 100;
		s.previewPercent = percentage;
	}

	function handleWindowMouseMove(e: MouseEvent) {
		if (s.isDraggingSeek) {
			if (!s.hasMoved && Math.abs(e.clientY - s.startY) > 5) {
				s.hasMoved = true;
			}
			updatePreview(e);
			if (s.hasMoved) {
				const targetIdx = Math.floor((s.previewPercent / 100) * s.totalImages);
				scrollToIndex(Math.min(targetIdx, s.totalImages - 1), 'instant');
			}
		}
	}

	function handleWindowMouseUp() {
		if (s.isDraggingSeek) {
			s.isDraggingSeek = false;
			s.hasMoved = false;
		}
	}

	function handleMouseMove(e: MouseEvent) {
		const width = window.innerWidth;
		const rightThreshold = width * 0.8; 

		if (e.clientX > rightThreshold || s.isEditingPage || s.isJumpPopupOpen) {
			s.controlsVisible = true;
			if (s.hideTimerId) clearTimeout(s.hideTimerId);
			if (!s.isEditingPage && !s.isJumpPopupOpen) {
				s.hideTimerId = setTimeout(() => {
					s.controlsVisible = false;
					s.hideTimerId = null;
				}, 2000);
			}
		} else {
			s.controlsVisible = false;
			if (s.hideTimerId) {
				clearTimeout(s.hideTimerId);
				s.hideTimerId = null;
			}
		}
	}

	function destroy() {
		s.loadedImages = [];
		s.aspectRatios = {};
	}

	return {
		state: s,
		BUFFER_SIZE,
		loadWebtoonFolder,
		loadMore,
		scrollToIndex,
		handlePageInput,
		setWebtoonZoom: (newZoom: number, cursorY?: number, options?: { skipScroll?: boolean }) => setWebtoonZoom(newZoom, cursorY, options),
		toggleWebtoonFit,
		cleanupOldSizes,
		handleSeekBarMouseDown,
		updatePreview,
		handleWindowMouseMove,
		handleWindowMouseUp,
		handleMouseMove,
		destroy
	};
}
