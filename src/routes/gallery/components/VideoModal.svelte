<script lang="ts">
	import { isVideoFile, formatBytes, formatDateTime, type ImageFile } from './utils';
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

	// Video State
	let isVideoPaused = $state(true);
	let videoTime = $state(0);
	let videoDuration = $state(0);
	let isVideoMuted = $state(false);
	let videoVolume = $state(1);
	let isVideoLoop = $state(false);
	let videoRotation = $state(0);
	let controlsVisible = $state(false);
	let isHoveringControls = $state(false);
	let hideTimerId: any = null;
	let videoElement = $state<HTMLVideoElement | null>(null);
	let currentVideoSrc = $state('');
	
	let currentMetadata = $state<any>(null);
	let isMetadataLoading = $state(false);

	const currentItem = $derived(loadedImages[selectedImageIndex] || null);
	const progressPercent = $derived(videoDuration > 0 ? (videoTime / videoDuration) * 100 : 0);

	function formatVideoTime(seconds: number) {
		if (isNaN(seconds) || seconds === Infinity || !seconds) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function handleMouseMoveVisibility(e: MouseEvent) {
		if (typeof window === 'undefined') return;
		
		const height = window.innerHeight;
		const ratioY = e.clientY / height;
		const isInTopZone = ratioY < 0.2; 

		if (isInTopZone) {
			controlsVisible = true;
			if (hideTimerId) clearTimeout(hideTimerId);
			
			if (!isHoveringControls) {
				hideTimerId = setTimeout(() => {
					if (!isHoveringControls) {
						controlsVisible = false;
						hideTimerId = null;
					}
				}, 2000);
			}
		} else if (!isHoveringControls) {
			controlsVisible = false;
			if (hideTimerId) {
				clearTimeout(hideTimerId);
				hideTimerId = null;
			}
		}
	}

	function rotateVideo() {
		videoRotation = (videoRotation + 90) % 360;
	}

	function releaseVideo() {
		const v = videoElement;
		if (!v) return;
		v.pause();
		v.loop = false;
		v.volume = 0;
		v.removeAttribute('src');
		v.load(); 
	}

	function closeModal() {
		if (hideTimerId) { clearTimeout(hideTimerId); hideTimerId = null; }
		releaseVideo();
		isModalOpen = false;
	}

	function isVideoItem(item: ImageFile) {
		return item && !item.isDir && !item.isCbz && item.isVideo;
	}

	function nextVideo() {
		let nextIdx = selectedImageIndex + 1;
		while (nextIdx < loadedImages.length) {
			if (isVideoItem(loadedImages[nextIdx])) {
				selectedImageIndex = nextIdx;
				return;
			}
			nextIdx++;
		}
		
		if (hasMore) {
			loadFolder(false, currentPage + 1, true).then(() => {
				nextVideo();
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
			loadFolder(false, currentPage - 1).then(() => {
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

	function toggleFullscreen() {
		if (typeof document === 'undefined') return;
		const container = document.getElementById('media-modal-container');
		if (!container) return;
		if (!document.fullscreenElement) {
			container.requestFullscreen().catch(() => {});
		} else {
			document.exitFullscreen().catch(() => {});
		}
	}
	
	function handleKeyDown(event: KeyboardEvent) {
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
		if (!isModalOpen) return;

		switch (event.code) { 
			case 'Escape': closeModal(); break;
			case 'ArrowRight': 
				event.preventDefault(); 
				videoTime = Math.min(videoDuration, videoTime + 5);
				break;
			case 'ArrowLeft': 
				event.preventDefault(); 
				videoTime = Math.max(0, videoTime - 5);
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
				toggleFullscreen();
				break;
			case 'Space': 
				event.preventDefault(); 
				isVideoPaused = !isVideoPaused;
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
		if (currentItem?.path) {
			currentVideoSrc = `/api/image?path=${encodeURIComponent(currentItem.path)}`;
		}
	});

	$effect(() => {
		if (!isModalOpen) {
			currentVideoSrc = '';
			currentMetadata = null;
			releaseVideo();
		}
	});

	onDestroy(() => {
		currentVideoSrc = '';
		if (hideTimerId) clearTimeout(hideTimerId);
		releaseVideo();
	});

	$effect(() => {
		if (isModalOpen && currentItem) {
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
		id="media-modal-container"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		class="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex flex-col h-full w-full overflow-hidden outline-none animate-in fade-in duration-300"
		onmousemove={handleMouseMoveVisibility}
	>
		<!-- Main View Area -->
		<div 
			class="relative flex-1 w-full h-full flex items-center justify-center p-0 overflow-hidden" 
			onmousemove={handleMouseMoveVisibility}
		>
			{#if currentItem}
				<div class="relative w-full h-full flex items-center justify-center pointer-events-auto bg-black">
					<!-- svelte-ignore a11y_media_has_caption -->
					<video 
						bind:this={videoElement}
						id="modal-video-player"
						src={currentVideoSrc}
						autoplay
						preload="auto"
						playsinline
						muted={isVideoMuted}
						bind:paused={isVideoPaused}
						bind:currentTime={videoTime}
						bind:duration={videoDuration}
						bind:volume={videoVolume}
						loop={isVideoLoop}
						class="w-full h-full object-contain pointer-events-auto transition-transform duration-300"
						style="transform: rotate({videoRotation}deg) scale({(videoRotation % 180 !== 0) ? (videoElement ? Math.min(videoElement.parentElement!.clientWidth / videoElement.videoHeight, videoElement.parentElement!.clientHeight / videoElement.videoWidth) / Math.min(videoElement.parentElement!.clientWidth / videoElement.videoWidth, videoElement.parentElement!.clientHeight / videoElement.videoHeight) : 1) : 1});"
						onclick={(e) => { e.stopPropagation(); }}
						ondblclick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
						oncanplay={() => { isVideoPaused = false; }}
						onended={() => { isVideoPaused = true; }}
					></video>

					<!-- VIDEO CONTROLS (Khung Tranh Style) -->
					<div 
						class="absolute inset-0 z-[120] pointer-events-none transition-all duration-300 {controlsVisible ? 'opacity-100' : 'opacity-0'}"
						onmouseenter={() => (isHoveringControls = true)}
						onmouseleave={() => {
							isHoveringControls = false;
							if (hideTimerId) clearTimeout(hideTimerId);
							hideTimerId = setTimeout(() => {
								if (!isHoveringControls) {
									controlsVisible = false;
									hideTimerId = null;
								}
							}, 2000);
						}}
					>
						<!-- TOP BACKGROUND SHADOW (Full Width) -->
						<div 
							class="absolute top-0 left-0 w-full h-48 bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-none transition-opacity duration-300 {controlsVisible ? 'opacity-100' : 'opacity-0'} z-[110]"
						></div>

						<!-- TOP BACKGROUND SHADOW (Full Width) -->
						<div 
							class="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none transition-opacity duration-300 {controlsVisible ? 'opacity-100' : 'opacity-0'} z-[110]"
						></div>

						<!-- INTEGRATED REFINED 2-ROW CONTROL SYSTEM -->
						<div 
							class="absolute top-0 left-0 w-full p-4 z-[130] transition-all duration-300 {controlsVisible ? 'translate-y-0' : '-translate-y-4'} pointer-events-none flex flex-col gap-1"
							onmouseenter={() => (isHoveringControls = true)}
							onmouseleave={() => (isHoveringControls = false)}
						>
							<!-- ROW 1: Metadata --- Seekbar (flex-1) --- Time | Close -->
							<div class="flex items-center gap-6 w-full pointer-events-none">
								<!-- Left/Center Content Wrapper (flex-1) -->
								<div class="flex items-center gap-6 flex-1 pointer-events-auto">
									{#if currentMetadata}
										<p class="select-text text-white/70 text-[10px] sm:text-xs font-mono shrink-0">
											<span class="bg-black/10 shadow-[0_0_10px_6px_rgba(0,0,0,0.3)] px-1 rounded-sm box-decoration-clone">
												{formatBytes(currentMetadata.size)} • {formatDateTime(currentMetadata.lastModified)}
											</span>
										</p>
									{/if}

									<div class="flex items-center gap-4 flex-1">
										<!-- Seekbar -->
										<div 
											role="slider"
											aria-label="Seek Bar"
											aria-valuemin="0"
											aria-valuemax={videoDuration}
											aria-valuenow={videoTime}
											tabindex="0"
											class="relative flex-1 h-3 flex items-center cursor-pointer group/progress" 
											onclick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); if (videoDuration > 0) videoTime = ((e.clientX - rect.left) / rect.width) * videoDuration; }}
											onmousedown={(e) => e.preventDefault()}
											onkeydown={(e) => {
												if (e.key === 'ArrowRight') videoTime = Math.min(videoDuration, videoTime + 5);
												if (e.key === 'ArrowLeft') videoTime = Math.max(0, videoTime - 5);
											}}
										>
											<div class="relative w-full h-[3px] bg-white/10 overflow-hidden rounded-full">
												<div class="absolute top-0 left-0 h-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)]" style="width: {progressPercent}%"></div>
											</div>
											<div class="absolute w-3.5 h-3.5 bg-white rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity duration-150 z-30 shadow-[0_0_20px_rgba(255,255,255,1)]" style="left: calc({progressPercent}% - 7px)"></div>
										</div>

										<!-- Time Display (Right of Seekbar) - Fixed width for alignment -->
										<div class="text-white/90 text-[11px] sm:text-xs font-black tracking-tight tabular-nums w-24 shrink-0 text-right">
											<span class="bg-black/5 shadow-[0_0_8px_4px_rgba(0,0,0,0.2)] px-1 rounded-sm">
												{formatVideoTime(videoTime)} / {formatVideoTime(videoDuration)}
											</span>
										</div>
									</div>
								</div>

								<!-- Right: Close Button -->
								<div class="pointer-events-auto shrink-0 ml-2">
									<button 
										aria-label="Close" 
										class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900/95 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl transition-all hover:scale-110" 
										onclick={(e) => { e.stopPropagation(); closeModal(); }} 
										onmousedown={(e) => e.preventDefault()}
									>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
									</button>
								</div>
							</div>

							<!-- ROW 2: Title (Left) --- Secondary Buttons (Right, under Seekbar) | Spacer -->
							<div class="flex items-start gap-6 w-full pointer-events-none">
								<!-- Content Wrapper (flex-1) -->
								<div class="flex items-start gap-6 flex-1 pointer-events-auto">
									<!-- Left: Wrapped Title (Now takes all remaining space) -->
									<div class="flex-1 min-w-0">
										<p class="select-text text-white font-black text-lg sm:text-2xl tracking-tight whitespace-normal break-words leading-tight">
											<span class="px-2 py-0.5 -mx-2 rounded-lg">
												{currentVideoIndexDisplay} / {totalImages} — {currentItem?.name}
											</span>
										</p>
									</div>

									<!-- Right Area: All Buttons Grouped for Row 1 Alignment (Fixed w-24 area) -->
									<div class="shrink-0 mt-1 flex justify-end items-start">
										<!-- Consolidated Button Group aligned to right edge of Time -->
										<div class="flex items-center gap-2 mr-[-6px]">
											<!-- Navigation -->
											<div class="flex items-center border-r border-white/20 pr-2 gap-1">
												<button aria-label="Previous" class="btn btn-ghost w-8 h-8 min-h-0 p-0 text-white transition-colors hover:bg-white/10" onclick={(e) => { e.stopPropagation(); prevVideo(); }} disabled={selectedImageIndex === 0 && currentPage === 0} onmousedown={(e) => e.preventDefault()}>
													<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
												</button>
												<button aria-label="Next" class="btn btn-ghost w-8 h-8 min-h-0 p-0 text-white transition-colors hover:bg-white/10" onclick={(e) => { e.stopPropagation(); nextVideo(); }} disabled={selectedImageIndex >= loadedImages.length - 1 && !hasMore} onmousedown={(e) => e.preventDefault()}>
													<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
												</button>
											</div>

											<!-- Playback -->
											<div class="flex items-center border-r border-white/20 pr-2 gap-1">
												<button aria-label={isVideoPaused ? "Play" : "Pause"} class="btn btn-ghost w-8 h-8 min-h-0 p-0 text-white transition-colors hover:bg-white/10" onclick={(e) => { e.stopPropagation(); isVideoPaused = !isVideoPaused; }} onmousedown={(e) => e.preventDefault()}>
													{#if isVideoPaused}
														<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
													{:else}
														<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
													{/if}
												</button>
												<button aria-label="Toggle Loop" class="btn btn-ghost w-8 h-8 min-h-0 p-0 transition-all hover:bg-white/10 {isVideoLoop ? 'text-primary' : 'text-white'}" onclick={(e) => { e.stopPropagation(); isVideoLoop = !isVideoLoop; }} onmousedown={(e) => e.preventDefault()}>
													<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
												</button>
												<button aria-label="Toggle Mute" class="btn btn-ghost w-8 h-8 min-h-0 p-0 transition-all hover:bg-white/10 {isVideoMuted ? 'text-red-500' : 'text-white'}" onclick={(e) => { e.stopPropagation(); isVideoMuted = !isVideoMuted; }} onmousedown={(e) => e.preventDefault()}>
													{#if isVideoMuted}<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0 0 14 8.07V10.2l2.45 2.45c.05-.2.05-.41.05-.65zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>
													{:else}<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>{/if}
												</button>
											</div>

											<!-- Other Functions -->
											<div class="flex items-center gap-1">
												<button aria-label="Rotate" class="btn btn-ghost w-8 h-8 min-h-0 p-0 text-white transition-colors hover:bg-white/10" onclick={(e) => { e.stopPropagation(); rotateVideo(); }} onmousedown={(e) => e.preventDefault()}>
													<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
														<path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-9-9c2.48 0 4.74.99 6.36 2.59M21 3v6h-6" />
													</svg>
												</button>
												<button aria-label="Toogle Fullscreen" class="btn btn-ghost w-8 h-8 min-h-0 p-0 text-white transition-colors hover:bg-white/10" onclick={(e) => { e.stopPropagation(); toggleFullscreen(); }} onmousedown={(e) => e.preventDefault()}>
													<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
														<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15" />
													</svg>
												</button>
											</div>
										</div>
									</div>
								</div>

								<!-- Close Button Area Mirroring Close Button Width (shrink-0 ml-2 w-12) -->
								<div class="shrink-0 ml-2 w-12"></div>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
