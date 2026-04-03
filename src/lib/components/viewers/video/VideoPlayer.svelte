<script lang="ts">
	import { isVideoFile, formatBytes, formatDateTime, type ImageFile } from '$lib/utils/utils';
	import { onDestroy } from 'svelte';
	import { cacheVersion } from '$lib/stores/cache.svelte';
	import { createVideoController } from './videoPlayer.svelte.ts';
	import { X, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX, RotateCw, Maximize, Minimize, Music, Repeat, Lock, Unlock } from 'lucide-svelte';

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
		onSwitchToAudio
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
		onSwitchToAudio?: () => void;
	} = $props();

	const ctrl = createVideoController();
	let s = $derived(ctrl.state);

	$effect(() => {
		ctrl.setupFullscreenListeners();
	});

	const currentItem = $derived(loadedImages[selectedImageIndex] || null);
	const progressPercent = $derived(s.videoDuration > 0 ? (s.videoTime / s.videoDuration) * 100 : 0);

	function formatVideoTime(seconds: number) {
		if (isNaN(seconds) || seconds === Infinity || !seconds) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function closeModal() {
		if (s.hideTimerId) { clearTimeout(s.hideTimerId); s.hideTimerId = null; }
		ctrl.releaseVideo();
		isModalOpen = false;
	}

	function isVideoItem(item: ImageFile) {
		return item && !item.isDir && !item.isCbz && item.isVideo;
	}

	async function nextVideo() {
		let nextIdx = selectedImageIndex + 1;

		if (isGrouped && nextIdx >= loadedImages.length && onSwitchToPagination) {
			await onSwitchToPagination();
		}

		while (nextIdx < loadedImages.length) {
			if (isVideoItem(loadedImages[nextIdx])) {
				selectedImageIndex = nextIdx;
				return;
			}
			nextIdx++;
		}

		if (hasMore && !isGrouped) {
			selectedImageIndex = -1;
			loadFolder(false, currentPage + 1, false).then(() => {
				let startIdx = 0;
				while (startIdx < loadedImages.length) {
					if (isVideoItem(loadedImages[startIdx])) {
						selectedImageIndex = startIdx;
						return;
					}
					startIdx++;
				}
			});
		}
	}

	function prevVideo() {
		let prevIdx = selectedImageIndex - 1;
		while (prevIdx >= 0) {
			if (isVideoItem(loadedImages[prevIdx])) {
				selectedImageIndex = prevIdx;
				return;
			}
			prevIdx--;
		}

		if (currentPage > 0) {
			const targetPage = currentPage - 1;
			selectedImageIndex = -1;
			loadFolder(false, targetPage, false).then(() => {
				if (loadedImages.length > 0) {
					let lastVideoIdx = -1;
					for (let i = loadedImages.length - 1; i >= 0; i--) {
						if (isVideoItem(loadedImages[i])) {
							lastVideoIdx = i;
							break;
						}
					}
					if (lastVideoIdx !== -1) {
						selectedImageIndex = lastVideoIdx;
					}
				}
			});
		}
	}

	const currentVideoIndexDisplay = $derived.by(() => {
		if (!currentItem) return 0;
		return loadedImages.slice(0, selectedImageIndex + 1).filter(isVideoItem).length;
	});

	function handleKeyDown(event: KeyboardEvent) {
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
		if (!isModalOpen) return;

		switch (event.code) {
			case 'Escape': closeModal(); break;
			case 'ArrowRight':
				event.preventDefault();
				s.videoTime = Math.min(s.videoDuration, s.videoTime + 5);
				break;
			case 'ArrowLeft':
				event.preventDefault();
				s.videoTime = Math.max(0, s.videoTime - 5);
				break;
			case 'PageUp':
				event.preventDefault();
				prevVideo();
				break;
			case 'PageDown':
				event.preventDefault();
				nextVideo();
				break;
			case 'KeyF':
				event.preventDefault();
				ctrl.toggleFullscreen();
				break;
			case 'Space':
				event.preventDefault();
				s.isVideoPaused = !s.isVideoPaused;
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
		if (typeof window === 'undefined') return;
		ctrl.setOrientation(window.innerHeight > window.innerWidth);

		function handleResize() {
			ctrl.setOrientation(window.innerHeight > window.innerWidth);
		}

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	$effect(() => {
		if (currentItem?.path) {
			s.currentVideoSrc = `/api/media?path=${encodeURIComponent(currentItem.path)}&v=${cacheVersion.value}`;
		}
	});

	$effect(() => {
		if (currentItem && isModalOpen && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: currentItem.name.replace(/\.[^/.]+$/, ""),
				artist: 'Media Viewer',
				artwork: [
					{
						src: `/api/media?path=${encodeURIComponent(currentItem.path)}&thumbnail=true&v=${cacheVersion.value}`,
						sizes: '512x512',
						type: 'image/jpeg'
					}
				]
			});

			navigator.mediaSession.setActionHandler('previoustrack', () => prevVideo());
			navigator.mediaSession.setActionHandler('nexttrack', () => nextVideo());
		}
	});

	$effect(() => {
		if (!isModalOpen && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
			navigator.mediaSession.metadata = null;
			navigator.mediaSession.setActionHandler('previoustrack', null);
			navigator.mediaSession.setActionHandler('nexttrack', null);
		}
	});

	$effect(() => {
		if (!isModalOpen) {
			s.currentVideoSrc = '';
			s.currentMetadata = null;
			ctrl.releaseVideo();
		}
	});

	onDestroy(() => {
		ctrl.destroy();
	});

	$effect(() => {
		if (isModalOpen && currentItem && currentItem.path !== s.lastMetadataPath) {
			s.lastMetadataPath = currentItem.path;
			const controller = new AbortController();
			s.isMetadataLoading = true;
			fetch(`/api/media?path=${encodeURIComponent(currentItem.path)}&metadata=true&v=${cacheVersion.value}`, { signal: controller.signal })
				.then(res => res.json())
				.then(data => {
					s.currentMetadata = data;
					currentItem.width = data.width;
					currentItem.height = data.height;
					currentItem.size = data.size;
					currentItem.lastModified = data.lastModified;
				})
				.catch((err) => { if (err.name !== 'AbortError') console.warn('Metadata fetch failed', err); })
				.finally(() => { s.isMetadataLoading = false; });

			return () => {
				controller.abort();
				s.isMetadataLoading = false;
			};
		} else {
			s.currentMetadata = null;
		}
	});

</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isModalOpen}
	<div
		id="media-modal-container"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		class="fixed inset-0 z-[300] bg-black/80 flex flex-col h-full w-full overflow-hidden outline-none animate-in fade-in duration-300"
		onmousemove={ctrl.handleMouseMoveVisibility}
		onmouseleave={() => ctrl.hideControlsImmediately()}
		ontouchend={() => {
			s.controlsVisible = true;
			if (s.hideTimerId) clearTimeout(s.hideTimerId);
			s.hideTimerId = setTimeout(() => {
				s.controlsVisible = false;
				s.hideTimerId = null;
			}, 3000);
		}}
	>
		<!-- Main View Area -->
		<div
			class="relative flex-1 w-full h-full flex items-center justify-center p-0 overflow-hidden"
			role="presentation"
			onmousemove={ctrl.handleMouseMoveVisibility}
		>
			{#if currentItem}
				<div class="relative w-full h-full flex items-center justify-center pointer-events-auto bg-black" bind:clientWidth={s.containerWidth} bind:clientHeight={s.containerHeight}>
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						bind:this={s.videoElement}
						bind:videoWidth={s.videoWidth}
						bind:videoHeight={s.videoHeight}
						id="modal-video-player"
						src={s.currentVideoSrc}
						autoplay
						preload="auto"
						playsinline
						muted={s.isVideoMuted}
						bind:paused={s.isVideoPaused}
						bind:currentTime={s.videoTime}
						bind:duration={s.videoDuration}
						bind:volume={s.videoVolume}
						loop={s.isVideoLoop}
						class="w-full h-full object-contain pointer-events-auto transition-transform duration-300"
						style="transform: rotate({s.videoRotation}deg) scale({(s.videoRotation % 180 !== 0) ? ((s.videoWidth && s.videoHeight && s.containerWidth && s.containerHeight) ? Math.min(s.containerWidth / s.videoHeight, s.containerHeight / s.videoWidth) / Math.min(s.containerWidth / s.videoWidth, s.containerHeight / s.videoHeight) : 1) : 1});"
						onclick={(e) => { e.stopPropagation(); }}
						ondblclick={(e) => { e.stopPropagation(); ctrl.toggleFullscreen(); }}
						oncanplay={() => { s.isVideoPaused = false; }}
						onended={() => { s.isVideoPaused = true; }}
					></video>

					<!-- VIDEO CONTROLS -->
					<div
						class="absolute inset-0 z-[120] pointer-events-none transition-all duration-300 {s.controlsVisible ? 'opacity-100' : 'opacity-0'}"
						role="presentation"
					>
						<!-- TOP BACKGROUND -->
						<div
							class="absolute top-0 left-0 w-full h-72 bg-gradient-to-b from-black via-black/85 to-transparent pointer-events-none transition-opacity duration-300 {s.controlsVisible ? 'opacity-100' : 'opacity-0'} z-[110]"
						></div>

						<!-- LAYOUT -->
						<div
							class="absolute top-0 left-0 w-full p-4 z-[130] pointer-events-none flex flex-col gap-2 transition-all duration-300 {s.controlsVisible ? 'translate-y-0' : '-translate-y-4'}"
							role="presentation"
							onclick={(e) => e.stopPropagation()}
							onkeydown={(e) => e.stopPropagation()}
							onmouseenter={() => (s.isHoveringControls = true)}
							onmouseleave={() => (s.isHoveringControls = false)}
						>
							<!-- Row 1: Seekbar + Time + Close -->
							<div class="flex items-center gap-4 pointer-events-auto">
								<div class="flex-1 min-w-0">
									<div
										role="slider"
										aria-label="Seek Bar"
										aria-valuemin="0"
										aria-valuemax={s.videoDuration}
										aria-valuenow={s.videoTime}
										tabindex="0"
										class="relative w-full h-3 flex items-center cursor-pointer group/progress"
										onclick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); if (s.videoDuration > 0) s.videoTime = ((e.clientX - rect.left) / rect.width) * s.videoDuration; }}
										onpointerdown={(e) => e.preventDefault()}
										onkeydown={(e) => {
											if (e.key === 'ArrowRight') s.videoTime = Math.min(s.videoDuration, s.videoTime + 5);
											if (e.key === 'ArrowLeft') s.videoTime = Math.max(0, s.videoTime - 5);
										}}
									>
										<div class="relative w-full h-[3px] bg-white/20 overflow-hidden rounded-full">
											<div class="absolute top-0 left-0 h-full bg-white" style="width: {progressPercent}%"></div>
										</div>
										<div class="absolute w-4 h-4 bg-white rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity duration-150 z-30" style="left: calc({progressPercent}% - 8px)"></div>
									</div>
								</div>
								<div class="text-white text-xs sm:text-sm font-mono shrink-0">
									{formatVideoTime(s.videoTime)} / {formatVideoTime(s.videoDuration)}
								</div>
				<button
					aria-label="Close"
					class="w-12 h-12 flex items-center justify-center text-white hover:bg-white/10 rounded transition-colors cursor-pointer shrink-0"
					tabindex="-1"
					onclick={(e) => { e.stopPropagation(); closeModal(); }}
					onpointerdown={(e) => e.preventDefault()}
				>
					<X class="h-7 w-7" />
				</button>
							</div>

							<!-- Row 2: Title -->
							<div class="flex items-center pointer-events-auto">
								<div class="flex-1 min-w-0 overflow-x-auto video-title-scroll text-right">
									<p class="select-text text-white font-bold text-xl sm:text-2xl tracking-tight whitespace-nowrap leading-tight inline-block">
										{currentVideoIndexDisplay} / {totalImages} — {currentItem?.name}
									</p>
									{#if s.currentMetadata}
										<p class="select-text text-white/60 text-xs font-mono mt-0.5 whitespace-nowrap inline-block">
											{formatBytes(s.currentMetadata.size)} • {formatDateTime(s.currentMetadata.lastModified)}
										</p>
									{/if}
								</div>
								<div class="w-[1rem] shrink-0" aria-hidden="true"></div>
							</div>

							<!-- Row 3: Buttons -->
							<div class="flex items-center justify-end gap-2 pointer-events-auto">
								<div class="flex items-center gap-0.5">
									<button aria-label="Previous" class="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded transition-colors cursor-pointer disabled:opacity-30" tabindex="-1" onclick={(e) => { e.stopPropagation(); prevVideo(); }} disabled={selectedImageIndex === 0 && currentPage === 0} onpointerdown={(e) => e.preventDefault()}>
										<ChevronLeft class="h-5 w-5" />
									</button>
									<button aria-label="Next" class="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded transition-colors cursor-pointer disabled:opacity-30" tabindex="-1" onclick={(e) => { e.stopPropagation(); nextVideo(); }} disabled={selectedImageIndex >= loadedImages.length - 1 && !hasMore} onpointerdown={(e) => e.preventDefault()}>
										<ChevronRight class="h-5 w-5" />
									</button>
								</div>
								<div class="w-px h-6 bg-white/20"></div>
								<div class="flex items-center gap-0.5">
									<button aria-label={s.isVideoPaused ? "Play" : "Pause"} class="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded transition-colors cursor-pointer" tabindex="-1" onclick={(e) => { e.stopPropagation(); s.isVideoPaused = !s.isVideoPaused; }} onpointerdown={(e) => e.preventDefault()}>
										{#if s.isVideoPaused}
											<Play class="h-5 w-5" />
										{:else}
											<Pause class="h-5 w-5" />
										{/if}
									</button>
									<button aria-label="Toggle Loop" class="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded transition-colors cursor-pointer" tabindex="-1" onclick={(e) => { e.stopPropagation(); s.isVideoLoop = !s.isVideoLoop; }} onpointerdown={(e) => e.preventDefault()} style={s.isVideoLoop ? 'color: var(--color-primary-500);' : 'color: white;'}>
										<Repeat class="h-5 w-5" />
									</button>
								</div>
								<div class="w-px h-6 bg-white/20"></div>
								<div class="flex items-center gap-0.5">
									<button aria-label="Toggle Mute" class="w-10 h-10 flex items-center justify-center rounded transition-colors cursor-pointer" tabindex="-1" onclick={(e) => { e.stopPropagation(); s.isVideoMuted = !s.isVideoMuted; }} onpointerdown={(e) => e.preventDefault()} style={s.isVideoMuted ? 'color: var(--color-primary-500);' : 'color: white;'}>
										{#if s.isVideoMuted}
											<VolumeX class="h-5 w-5" />
										{:else}
											<Volume2 class="h-5 w-5" />
										{/if}
									</button>
									{#if onSwitchToAudio}
										<button aria-label="Audio Only" class="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded transition-colors cursor-pointer" tabindex="-1" onclick={(e) => { e.stopPropagation(); onSwitchToAudio(); }} onpointerdown={(e) => e.preventDefault()}>
											<Music class="h-5 w-5" />
										</button>
									{/if}
								</div>
								<div class="w-px h-6 bg-white/20"></div>
								<div class="flex items-center gap-0.5">
									<button aria-label="Toggle Rotation Lock" class="w-10 h-10 flex items-center justify-center rounded transition-colors cursor-pointer" tabindex="-1" onclick={(e) => { e.stopPropagation(); ctrl.toggleRotationLock(); }} onpointerdown={(e) => e.preventDefault()} style={s.isRotationLocked ? 'color: var(--color-primary-500);' : 'color: white;'}>
										{#if s.isRotationLocked}
											<Lock class="h-5 w-5" />
										{:else}
											<Unlock class="h-5 w-5" />
										{/if}
									</button>
									<button aria-label="Rotate" class="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded transition-colors cursor-pointer" tabindex="-1" onclick={(e) => { e.stopPropagation(); ctrl.rotateVideo(); }} onpointerdown={(e) => e.preventDefault()}>
										<RotateCw class="h-5 w-5" />
									</button>
									<button aria-label="Toggle Fullscreen" class="mr-1.5 w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded transition-colors cursor-pointer" tabindex="-1" onclick={(e) => { e.stopPropagation(); ctrl.toggleFullscreen(); }} onpointerdown={(e) => e.preventDefault()}>
										{#if s.isFullscreen}
											<Minimize class="h-5 w-5" />
										{:else}
											<Maximize class="h-5 w-5" />
										{/if}
										
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
	{/if}
<style>
	/* Scrollable title - hidden scrollbar */
	:global(.video-title-scroll) {
		overflow-x: auto;
		white-space: nowrap;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}
	:global(.video-title-scroll::-webkit-scrollbar) {
		display: none;
	}
</style>
