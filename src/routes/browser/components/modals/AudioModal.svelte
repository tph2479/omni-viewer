<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade, fly, scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { formatDate, formatBytes, type ImageFile } from '../utils/utils';
	import { cacheVersion } from '$lib/stores/cache.svelte';
	import { createAudioController } from './audioController.svelte';

	let {
		isModalOpen = $bindable(),
		selectedImageIndex = $bindable(),
		loadedImages = $bindable(),
		totalImages,
		hasMore,
		currentPage,
		loadFolder,
		isGrouped = false,
		onSwitchToPagination,
		onSwitchToVideo
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
		onSwitchToVideo?: () => void;
	} = $props();

	const ctrl = createAudioController();
	let s = $derived(ctrl.state);

	const currentAudio = $derived(loadedImages[selectedImageIndex]);
	const extension = $derived(currentAudio?.name.split('.').pop()?.toUpperCase() || 'AUDIO');

	$effect(() => {
		if (currentAudio) s.imgFailed = false;
	});

	function close() {
		isModalOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
		if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
			e.preventDefault();
			prev();
		}
		if (e.key === 'ArrowRight' || e.key === 'PageDown') {
			e.preventDefault();
			next();
		}
		if (e.key === ' ') {
			e.preventDefault();
			ctrl.togglePlay();
		}
		if (e.key === 'm') ctrl.toggleMute();
	}

	function isAudioOrVideo(item: ImageFile) {
		return item && !item.isDir && !item.isCbz && !item.isPdf && !item.isEpub && (item.isAudio || item.isVideo);
	}

	function prev() {
		let prevIdx = selectedImageIndex - 1;
		while (prevIdx >= 0) {
			if (isAudioOrVideo(loadedImages[prevIdx])) {
				selectedImageIndex = prevIdx;
				return;
			}
			prevIdx--;
		}
	}

	async function next() {
		let nextIdx = selectedImageIndex + 1;

		if (isGrouped && nextIdx >= loadedImages.length && onSwitchToPagination) {
			await onSwitchToPagination();
		}

		while (nextIdx < loadedImages.length) {
			if (isAudioOrVideo(loadedImages[nextIdx])) {
				selectedImageIndex = nextIdx;
				return;
			}
			nextIdx++;
		}

		if (hasMore && !isGrouped) {
			await loadFolder(false, currentPage + 1, true);
			next();
		}
	}

	function formatTime(seconds: number) {
		if (isNaN(seconds)) return "0:00";
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const sec = Math.floor(seconds % 60);
		return [h, m, sec]
			.map(v => v < 10 ? "0" + v : v)
			.filter((v, i) => v !== "00" || i > 0)
			.join(":");
	}

	$effect(() => {
		if (isModalOpen) {
			document.body.style.overflow = 'hidden';
			window.addEventListener('keydown', handleKeydown);
		} else {
			document.body.style.overflow = '';
			window.removeEventListener('keydown', handleKeydown);
		}
	});

	onDestroy(() => {
		if (typeof document !== 'undefined') {
			document.body.style.overflow = '';
			window.removeEventListener('keydown', handleKeydown);
		}
		ctrl.destroy();
	});

	$effect(() => {
		if (currentAudio && isModalOpen && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: currentAudio.name.replace(/\.[^/.]+$/, ""),
				artist: 'Media Viewer',
				artwork: [
					{
						src: `/api/media?path=${encodeURIComponent(currentAudio.path)}&thumbnail=true&v=${cacheVersion.value}`,
						sizes: '512x512',
						type: 'image/jpeg'
					}
				]
			});

			navigator.mediaSession.setActionHandler('previoustrack', () => prev());
			navigator.mediaSession.setActionHandler('nexttrack', () => next());
		}
	});

	$effect(() => {
		if (!isModalOpen && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
			navigator.mediaSession.metadata = null;
			navigator.mediaSession.setActionHandler('previoustrack', null);
			navigator.mediaSession.setActionHandler('nexttrack', null);
		}
	});

	let progress = $derived(s.duration ? (s.currentTime / s.duration) * 100 : 0);

</script>

<div
	class="fixed inset-0 z-[300] flex items-center justify-center bg-zinc-950 subtitle-hidden overflow-hidden font-sans"
	role="dialog"
	aria-modal="true"
	transition:fade={{ duration: 300 }}
>
	<!-- High-end Ambient Background -->
	<div class="absolute inset-0 z-0">
		{#if !s.imgFailed}
			<img
				src={`/api/media?path=${encodeURIComponent(currentAudio?.path || '')}&thumbnail=true&v=${cacheVersion.value}`}
				alt=""
				class="w-full h-full object-cover opacity-20 saturate-[1.2]"
				transition:fade={{ duration: 1000 }}
				onerror={() => s.imgFailed = true}
			/>
		{:else}
			<div class="w-full h-full bg-neutral-800 shadow-inner"></div>
		{/if}
		<div class="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/40 to-transparent"></div>
		<div class="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(38,38,38,0.9)_100%)]"></div>
	</div>

	<!-- Centered, Width-Limited Canvas Visualizer (Background) -->
	<div class="absolute bottom-6 md:bottom-12 left-0 right-0 h-40 pointer-events-none z-0 flex justify-center">
		<div class="w-full max-w-2xl h-full opacity-30 md:opacity-40">
			<canvas
				bind:this={s.canvas}
				width="800"
				height="160"
				class="w-full h-full"
			></canvas>
		</div>
	</div>

	<!-- Main Interaction Area -->
	<div
		class="relative z-10 w-full h-full max-w-5xl flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 p-6 md:p-16 -translate-y-6 md:-translate-y-20"
		in:fly={{ y: 20, duration: 600, easing: quintOut }}
	>
		<!-- Cover Art Panel -->
		<div class="relative perspective-1000 w-full max-w-[200px] md:max-w-[420px] aspect-square flex-shrink-0">
			<!-- Card wrapper -->
			<div class="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-white/20 bg-neutral-800/80">
				{#if !s.imgFailed}
					<img
						src={`/api/media?path=${encodeURIComponent(currentAudio?.path || '')}&thumbnail=true&v=${cacheVersion.value}`}
						alt={currentAudio?.name}
						class="w-full h-full object-cover"
						onerror={() => s.imgFailed = true}
					/>
				{:else}
					<div class="w-full h-full flex items-center justify-center bg-neutral-800 border border-white/5">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-24 h-24 text-white/10" fill="currentColor" viewBox="0 0 24 24">
							<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
						</svg>
					</div>
				{/if}
				<!-- Gloss -->
				<div class="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent"></div>
			</div>

			<!-- Record Edge -->
			<div
				class="absolute -right-6 top-1/2 -translate-y-1/2 w-[85%] h-[85%] bg-neutral-800 rounded-full border border-white/10 shadow-2xl -z-10 transition-all duration-1000 {s.isPlaying ? 'translate-x-16 opacity-100' : 'translate-x-0 opacity-0'}"
				style="background: radial-gradient(circle at center, #444444 0%, #262626 100%);"
			>
				<div class="absolute inset-[37.5%] rounded-full bg-neutral-800/80 border border-white/10 flex items-center justify-center overflow-hidden">
					{#if !s.imgFailed}
						<img src={`/api/media?path=${encodeURIComponent(currentAudio?.path || '')}&thumbnail=true&v=${cacheVersion.value}`} alt="" class="w-full h-full object-cover opacity-50 animate-spin-slow will-change-transform" />
					{/if}
				</div>
			</div>
		</div>

		<!-- Commands Console -->
		<div class="flex-1 flex flex-col justify-center w-full min-w-0 md:pl-10 text-center md:text-left">
			<!-- Header -->
			<div class="mb-12 space-y-2">
				<div class="flex items-center justify-center md:justify-start gap-3 mb-2">
					<span class="bg-white/20 text-white text-[9px] font-black px-2 py-0.5 rounded tracking-[3px] uppercase">{extension}</span>
					<div class="h-px flex-1 bg-white/10 hidden md:block"></div>
				</div>
				<h1
					class="text-2xl md:text-3xl font-bold text-white leading-tight tracking-tight drop-shadow-lg"
					title={currentAudio?.name}
				>
					{currentAudio?.name.replace(/\.[^/.]+$/, "")}
				</h1>
				<p class="text-white/40 font-bold tracking-widest text-[10px] uppercase">
					{formatBytes(currentAudio?.size || 0)} • {selectedImageIndex + 1} OF {totalImages}
				</p>
			</div>

			<!-- Control Pad -->
			<div class="bg-zinc-900/60 border border-white/10 rounded-3xl p-5 md:p-8 space-y-4 md:space-y-8 shadow-2xl transition-all hover:bg-zinc-900/80">

				<!-- Seekbar -->
				<div class="space-y-4">
					<div class="relative h-2 flex items-center group cursor-pointer bg-white/10 rounded-full">
						<input
							type="range"
							min="0"
							max={s.duration || 0}
							bind:value={s.currentTime}
							oninput={(e) => { if (s.audioPlayer) s.audioPlayer.currentTime = Number(e.currentTarget.value); }}
							class="absolute inset-0 w-full h-full appearance-none bg-transparent rounded-full cursor-pointer focus:outline-none z-30 opacity-0"
						/>
						<div
							class="absolute top-0 left-0 h-full bg-white transition-all shadow-[0_0_15px_white]"
							style="width: {progress}%"
						></div>
						<div
							class="absolute top-1/2 -translate-y-1/2 h-4 w-4 bg-white rounded-full shadow-lg z-20 pointer-events-none transition-all scale-0 group-hover:scale-100"
							style="left: calc({progress}% - 8px)"
						></div>
					</div>

					<div class="flex justify-between items-center px-1 text-[11px] font-mono font-black text-white/50 tracking-widest">
						<span class="text-white">{formatTime(s.currentTime)}</span>
						<span>{formatTime(s.duration)}</span>
					</div>
				</div>

				<!-- Controls Row -->
				<div class="flex items-center justify-between gap-8">
					<div class="flex items-center gap-6">
						<button
							class="text-white/30 hover:text-white transition-all active:scale-90 focus:outline-none"
							aria-label="Previous"
							onclick={prev}
							disabled={selectedImageIndex === 0}
							onmousedown={(e) => e.preventDefault()}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6L18 18V6z"/></svg>
						</button>

						<button
							class="btn btn-circle btn-primary btn-lg shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 ring-4 ring-white/10 focus:outline-none"
							onclick={ctrl.togglePlay}
							onmousedown={(e) => e.preventDefault()}
						>
							{#if s.isPlaying}
								<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
							{/if}
						</button>

						<button
							class="text-white/30 hover:text-white transition-all active:scale-90 focus:outline-none"
							aria-label="Next"
							onclick={next}
							disabled={selectedImageIndex === loadedImages.length - 1 && !hasMore}
							onmousedown={(e) => e.preventDefault()}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
						</button>

						{#if currentAudio?.isVideo && onSwitchToVideo}
						<button
							class="ml-2 transition-all active:scale-90 focus:outline-none text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] hover:scale-110"
							onclick={onSwitchToVideo}
							title="Switch To Video Mode"
							onmousedown={(e) => e.preventDefault()}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
						</button>
						{/if}

						<!-- Loop Toggle -->
						<button
							class="ml-2 transition-all active:scale-90 focus:outline-none {s.isLooping ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'text-white/20'}"
							onclick={() => s.isLooping = !s.isLooping}
							title="Loop"
							onmousedown={(e) => e.preventDefault()}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
								<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
							</svg>
						</button>

						<!-- Auto Next Toggle -->
						<button
							class="ml-2 transition-all active:scale-90 focus:outline-none {s.isAutoNext ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'text-white/20'}"
							onclick={() => s.isAutoNext = !s.isAutoNext}
							title="Auto Next"
							onmousedown={(e) => e.preventDefault()}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
								<path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
							</svg>
						</button>
					</div>

					<!-- Volume -->
					<div class="flex items-center gap-3 w-32 border-l border-white/10 pl-8">
						<button class="text-white/20 hover:text-white transition-colors focus:outline-none" onclick={ctrl.toggleMute} onmousedown={(e) => e.preventDefault()}>
							{#if s.isMuted || s.volume === 0}
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
							{/if}
						</button>
						<div class="flex-1 relative h-1 bg-white/10 rounded-full cursor-pointer">
							<input
								type="range"
								min="0"
								max="1"
								step="0.01"
								bind:value={s.volume}
								oninput={(e) => { if (s.audioPlayer) { s.audioPlayer.volume = Number(e.currentTarget.value); s.isMuted = s.volume === 0; } }}
								class="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer"
							/>
							<div class="absolute top-0 left-0 h-full bg-white opacity-40 transition-all rounded-full" style="width: {s.volume * 100}%"></div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- System Close -->
	<button
		aria-label="Close"
		class="absolute top-8 right-8 btn btn-circle btn-ghost text-white/40 hover:text-white hover:bg-white/10 transition-all focus:outline-none z-50"
		onclick={close}
		onmousedown={(e) => e.preventDefault()}
	>
		<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
	</button>

	<!-- Hidden Audio Native -->
	<audio
		bind:this={s.audioPlayer}
		src={`/api/media?path=${encodeURIComponent(currentAudio?.path || '')}&v=${cacheVersion.value}`}
		crossorigin="anonymous"
		autoplay
		loop={s.isLooping}
		onplay={ctrl.handlePlay}
		onpause={() => s.isPlaying = false}
		ontimeupdate={(e) => s.currentTime = e.currentTarget.currentTime}
		onloadedmetadata={(e) => { s.duration = e.currentTarget.duration; if (s.audioPlayer) s.audioPlayer.volume = s.volume; }}
		onended={() => { if (s.isAutoNext) next(); }}
	></audio>
</div>

<style>
	:global(body) {
		overflow: hidden;
	}
	/* GPU Efficient Visualizer */
	.animate-spin-slow {
		animation: spin 80s linear infinite;
	}
	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	/* Performance hints */
	svg, img {
		backface-visibility: hidden;
	}
</style>
