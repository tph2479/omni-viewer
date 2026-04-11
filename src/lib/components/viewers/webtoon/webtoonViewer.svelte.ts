import { tick } from 'svelte';
import type { MediaFile } from '$lib/stores/browser/types';
export const WEBTOON_CONTEXT_KEY = Symbol('webtoon-context');
export type WebtoonViewerContext = ReturnType<typeof createWebtoonController>;

export function createWebtoonController(folderPath: string, contextPath: string = "", actions: any) {
	const s = $state({
		folderPath,
		contextPath,
		siblings: [] as MediaFile[],
		currentIndex: -1,
		isTocOpen: false,
		loadedImages: [] as MediaFile[],
		totalImages: 0,
		isLoading: false,
		errorMsg: '',
		
		controlsVisible: false,
		isEditingPage: false,
		isEditingChapter: false,
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

	async function loadSiblings() {
		// Ensure contextPath is a directory
		if (s.contextPath && s.contextPath.toLowerCase().endsWith('.cbz')) {
			const parts = s.contextPath.split(/[/\\]/);
			parts.pop();
			s.contextPath = parts.join("/");
		}

		if (!s.contextPath) {
			const parts = s.folderPath.split(/[/\\]/);
			if (parts.length > 1) {
				parts.pop();
				s.contextPath = parts.join("/");
			} else {
				s.siblings = [];
				s.currentIndex = -1;
				return;
			}
		}

		try {
			// Normalize path for API
			const normalizedContext = s.contextPath.replace(/\\/g, '/');
			// Use noGroup=true to get a flat list even if folders and CBZs are mixed
			// isToc=true to get entryPath/containsImages for TOC
			const res = await fetch(`/api/file?action=gallery&folder=${encodeURIComponent(normalizedContext)}&sort=name_asc&type=all&limit=10000&noGroup=true&isToc=true`);
			const data = await res.json();
			
			if (data.images) {
				// Filter for books/chapters (both CBZ files and folders with images)
				s.siblings = (data.images as MediaFile[]).filter(item => 
					item.mediaType === 'cbz' || 
					item.name.toLowerCase().endsWith('.cbz') || 
					item.name.toLowerCase().endsWith('.zip') ||
					(item.mediaType === 'directory' && (item.entryPath || item.containsImages))
				);
				refreshCurrentIndex();
			}
		} catch (e) {
			console.error("[Webtoon] Failed to load siblings:", e);
		}
	}

	function refreshCurrentIndex() {
		// Use normalized comparison (no slashes, lowercase, strip trailing slash)
		const norm = (p: string) => {
			if (!p) return "";
			let s = p.replace(/[/\\]/g, '/').toLowerCase();
			if (s.endsWith('/')) s = s.slice(0, -1);
			return s;
		};
		const current = norm(s.folderPath);
		
		s.currentIndex = s.siblings.findIndex(item => {
			const itemPath = norm(item.path);
			const entryPathNorm = norm(item.entryPath || "");
			return itemPath === current || (entryPathNorm && entryPathNorm === current);
		});
	}

	async function goToIndex(index: number) {
		if (index >= 0 && index < s.siblings.length) {
			const item = s.siblings[index];
			const path = item.entryPath || item.path;
			actions.openCbzInWebtoon(path, s.contextPath);
			s.isTocOpen = false;
			await tick();
			s.webtoonScrollContainer?.focus();
		}
	}

	function goToSibling(direction: 1 | -1) {
		if (s.currentIndex === -1) return;
		goToIndex(s.currentIndex + direction);
	}

	async function loadWebtoonFolder() {
		refreshCurrentIndex();
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

		// Pre-emptively lock our anchoring state to the target index so any images 
		// loading concurrently use this target to adjust offsets perfectly.
		s.currentImageIndex = index;
		s.anchorPercentInImage = 0;

		const target = document.getElementById(`webtoon-image-${index}`);
		if (target) {
			target.scrollIntoView({ behavior, block: 'start' });
		}
	}

	async function handlePageInput(val: string) {
		const pageNum = parseInt(val);
		if (!isNaN(pageNum) && pageNum > 0 && pageNum <= s.loadedImages.length) {
			const targetIdx = pageNum - 1;
			scrollToIndex(targetIdx, 'instant');
		}
	}

	function handleChapterJump(val: string) {
		const idx = parseInt(val);
		if (!isNaN(idx) && idx >= 1 && idx <= s.siblings.length) {
			goToIndex(idx - 1);
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

	function updateAspectRatio(index: number, newRatio: number, imgElement: HTMLElement | null) {
		const oldRatio = s.aspectRatios[index] ?? 0.7;
		if (Math.abs(oldRatio - newRatio) < 0.001) return;

		if (!s.webtoonScrollContainer || !imgElement) {
			s.aspectRatios[index] = newRatio;
			return;
		}

		const oldHeight = imgElement.offsetHeight;
		s.aspectRatios[index] = newRatio;

		tick().then(() => {
			if (!s.webtoonScrollContainer || !imgElement) return;
			const newHeight = imgElement.offsetHeight;
			const heightDiff = newHeight - oldHeight;

			if (heightDiff !== 0) {
				// Core stabilization logic to prevent jumps/shifts from loading images
				if (index < s.currentImageIndex) {
					s.webtoonScrollContainer.scrollTop += heightDiff;
				} else if (index === s.currentImageIndex) {
					s.webtoonScrollContainer.scrollTop += heightDiff * s.anchorPercentInImage;
				}
			}
		});
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
		const rightThreshold = width * 0.7; // 30% of the right side
		const topThreshold = 100; // Top 100px

		if (e.clientX > rightThreshold || e.clientY < topThreshold || s.isEditingPage || s.isEditingChapter || s.isJumpPopupOpen) {
			s.controlsVisible = true;
			if (s.hideTimerId) clearTimeout(s.hideTimerId);
			if (!s.isEditingPage && !s.isEditingChapter && !s.isJumpPopupOpen) {
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
		loadSiblings,
		goToIndex,
		goToSibling,
		loadMore,
		scrollToIndex,
		handlePageInput,
		handleChapterJump,
		setWebtoonZoom: (newZoom: number, cursorY?: number, options?: { skipScroll?: boolean }) => setWebtoonZoom(newZoom, cursorY, options),
		toggleWebtoonFit,
		cleanupOldSizes,
		handleSeekBarMouseDown,
		updatePreview,
		handleWindowMouseMove,
		handleWindowMouseUp,
		handleMouseMove,
		refreshCurrentIndex,
		updateAspectRatio,
		destroy
	};
}
