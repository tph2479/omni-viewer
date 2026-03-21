<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade, fly, scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import type { ImageFile } from './utils';
	import { formatDate, formatBytes } from './utils';

	let {
		isModalOpen = $bindable(),
		selectedImageIndex = $bindable(),
		loadedImages,
		totalImages,
		hasMore,
		currentPage,
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

	let audioPlayer: HTMLAudioElement | null = $state(null);
	let isLooping = $state(false);
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(1);
	let imgFailed = $state(false);
	let isMuted = $state(false);
	let previousVolume = 1;

	const currentAudio = $derived(loadedImages[selectedImageIndex]);
	const extension = $derived(currentAudio?.name.split('.').pop()?.toUpperCase() || 'AUDIO');

	// Auto-reset image failure when track changes
	$effect(() => {
		if (currentAudio) imgFailed = false;
	});

	function close() {
		isModalOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
		if (e.key === 'ArrowLeft') prev();
		if (e.key === 'ArrowRight') next();
		if (e.key === ' ') {
			e.preventDefault();
			togglePlay();
		}
		if (e.key === 'm') toggleMute();
	}

	function prev() {
		if (selectedImageIndex > 0) {
			selectedImageIndex--;
		}
	}

	async function next() {
		if (selectedImageIndex < loadedImages.length - 1) {
			selectedImageIndex++;
		} else if (hasMore) {
			await loadFolder(false, currentPage + 1, true);
			selectedImageIndex++;
		}
	}

	function togglePlay() {
		if (!audioPlayer) return;
		if (audioPlayer.paused) {
			audioPlayer.play();
		} else {
			audioPlayer.pause();
		}
	}

	function toggleMute() {
		if (!audioPlayer) return;
		if (isMuted) {
			volume = previousVolume;
			isMuted = false;
		} else {
			previousVolume = volume;
			volume = 0;
			isMuted = true;
		}
		audioPlayer.volume = volume;
	}

	function formatTime(seconds: number) {
		if (isNaN(seconds)) return "0:00";
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		return [h, m, s]
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
	});

	let progress = $derived(duration ? (currentTime / duration) * 100 : 0);

	// Audio Analysis Engine
	let audioCtx: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let dataArray: Uint8Array | null = null;
	let animationFrame: number;
	let sourceNode: MediaElementAudioSourceNode | null = null;

	let excitement = $state(0);
	let canvas: HTMLCanvasElement | null = $state(null);
	let history: {y: number, b: number, m: number, t: number, h: number}[] = $state([]); 
	let timeData: Uint8Array = new Uint8Array(256); // Raw wave buffer
	let lastDrawTime = 0;


	function initAudioContext() {
		if (audioCtx || !audioPlayer) return;

		try {
			audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
			analyser = audioCtx.createAnalyser();
			analyser.fftSize = 256; 
			analyser.smoothingTimeConstant = 0.5; // Balanced smoothing for reactive but fluid movement
			
			sourceNode = audioCtx.createMediaElementSource(audioPlayer);
			sourceNode.connect(analyser);
			analyser.connect(audioCtx.destination);
			
			dataArray = new Uint8Array(analyser.frequencyBinCount);
			updateExcitement();
		} catch (e) {
			console.error("Audio Context failed:", e);
		}
	}

	let lastVal = 0;
	let smoothedVal = 0;
	let yVel = 0; 
	
	// 'Smart Climax' & Multi-Band detection variables
	let energyHistory: number[] = new Array(200).fill(0); 
	let prevDataArray = new Uint8Array(128);
	let isClimax = $state(false);
	let climaxIntensity = $state(0);
	
	// Band intensities for 'Smart' visuals
	let bassIntensity = $state(0);
	let midIntensity = $state(0);
	let trebleIntensity = $state(0);
	function updateExcitement() {
		if (!analyser || !dataArray || !canvas) return;
		
		const now = performance.now();
		if (now - lastDrawTime < 30) { // Stable 33 FPS
			animationFrame = requestAnimationFrame(updateExcitement);
			return;
		}
		lastDrawTime = now;

		// Now sampling Treble (High Frequencies) instead of Time Domain Raw Wave
		analyser.getByteFrequencyData(dataArray);
		
		let peak = 0;
		// Scan Treble range (High frequency bins 60 to 110)
		for(let i=60; i<110; i++) {
			if (dataArray[i] > peak) peak = dataArray[i];
		}
		
		const rawVal = peak / 255;
		
		// 1. Multi-Band Sensory Processing
		let bassSum = 0; for(let i=0; i<8; i++) bassSum += dataArray[i];
		let midSum = 0; for(let i=10; i<50; i++) midSum += dataArray[i];
		let trebleSum = 0; for(let i=60; i<110; i++) trebleSum += dataArray[i];
		
		// Normalize bands (approximate weights)
		const currentBass = Math.pow(bassSum / (8 * 255), 1.2) * 1.5;
		const currentMid = Math.pow(midSum / (40 * 255), 1.4) * 1.2;
		const currentTreble = Math.pow(trebleSum / (50 * 255), 1.6) * 2.0;

		// Smooth bands for visuals
		bassIntensity = bassIntensity * 0.8 + currentBass * 0.2;
		midIntensity = midIntensity * 0.8 + currentMid * 0.2;
		trebleIntensity = trebleIntensity * 0.7 + currentTreble * 0.3;

		// Vertical target driven primarily by Mid + Treble energy
		const targetVal = Math.min(1.0, (currentMid * 0.7 + currentTreble * 0.3) * 1.4); 
		
		// 2. Smart Climax Detection (Spectral Flux + Energy Variance)
		let flux = 0;
		for(let i=0; i<dataArray.length; i++) {
			flux += Math.max(0, dataArray[i] - prevDataArray[i]);
		}
		prevDataArray.set(dataArray);

		energyHistory.push(rawVal);
		energyHistory.shift();
		const baseline = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;
		
		// Climax combines raw energy vs baseline AND spectral flux (sudden density)
		const fluxFactor = Math.min(2.0, flux / 350); // Slightly more sensitive flux
		const energyFactor = rawVal / (Math.max(0.05, baseline) * 1.3); // Lower threshold
		
		isClimax = (energyFactor > 1.0 || fluxFactor > 1.4 || (currentBass > 0.7 && currentTreble > 0.7)) && rawVal > 0.15;
		
		// Smooth climax intensity - faster response
		climaxIntensity = climaxIntensity * 0.85 + (isClimax ? 1 : 0) * 0.15;
		
		// Spring Physics
		const stiffness = 0.15;
		const damping = 0.8;
		const force = (targetVal - smoothedVal) * stiffness;
		yVel = (yVel + force) * damping;
		smoothedVal += yVel;
		
		const hue = (performance.now() / 20) % 360;
		history.push({ 
			y: smoothedVal, 
			b: bassIntensity, 
			m: midIntensity, 
			t: trebleIntensity,
			h: hue
		});
		if (history.length > 500) history.shift();
		
		drawGraph();
		animationFrame = requestAnimationFrame(updateExcitement);
	}

	function drawGraph() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d', { alpha: true });
		if (!ctx) return;

		const w = canvas.width;
		const h = canvas.height;
		const step = 2.0; 
		const hue = (performance.now() / 20) % 360; // Global hue for the frame
		
		ctx.clearRect(0, 0, w, h);
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';

		const currentCount = history.length;
		const headX = w - 120; // Leave leading space in front of the dot
		
		// 1. Sleek Continuous History Trail (Single Color)
		ctx.beginPath();
		const opacity = 0.25; // Constant subtle opacity
		ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
		ctx.lineWidth = 1.0;
		
		for (let i = 0; i < currentCount; i++) {
			const indexFromHead = (currentCount - 1 - i);
			const x = headX - (indexFromHead * step);
			const y = h - (history[i].y * h * 0.5) - 40; 
			
			if (x < -20) continue;
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();

		// Floating Glow Point (Right-aligned)
		const lastPt = history[currentCount - 1];
		const headY = h - (lastPt.y * h * 0.5) - 40;

		// Large Outer Glow
		ctx.beginPath();
		ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
		ctx.lineWidth = 12;
		ctx.filter = 'blur(10px)';
		ctx.arc(headX, headY, 2, 0, Math.PI * 2);
		ctx.stroke();

		// Core Glow (Treble driven shimmer)
		ctx.beginPath();
		ctx.strokeStyle = `hsla(${hue}, 80%, 80%, ${0.1 + trebleIntensity * 0.2})`;
		ctx.lineWidth = 5 + trebleIntensity * 5;
		ctx.filter = `blur(${4 + trebleIntensity * 6}px)`;
		ctx.arc(headX, headY, 1, 0, Math.PI * 2);
		ctx.stroke();
		ctx.filter = 'none';

		// Solid Center Point (Sleek Flying Dot - "Dody")
		ctx.beginPath();
		
		// 1. Calculate dynamic outer color (Climax/Bass driven)
		const r = 255;
		const g = 255 - (climaxIntensity * 150) - (bassIntensity * 30); 
		const b = 255 - (climaxIntensity * 50) + (bassIntensity * 50);
		
		const outerColor = climaxIntensity > 0.2 
			? `hsla(${hue}, 80%, 70%, ${0.9 + climaxIntensity * 0.1})`
			: `rgba(${r}, ${g}, ${b}, ${0.9 + climaxIntensity * 0.1})`;
		
		// 2. Sleek Dynamic Size
		const baseSize = 2.0;
		const dynamicSize = baseSize + (climaxIntensity * 8) + (bassIntensity * 4);
		
		// 3. Create White-Core Gradient for Dody
		const grad = ctx.createRadialGradient(headX, headY, 0, headX, headY, dynamicSize);
		grad.addColorStop(0, "#FFFFFF"); // Pure white core
		grad.addColorStop(0.4, "#FFFFFF"); // Maintain white core for most of the radius
		grad.addColorStop(1, outerColor); // Dynamic edge
		
		ctx.fillStyle = grad;
		ctx.arc(headX, headY, dynamicSize, 0, Math.PI * 2);
		ctx.fill();

		// Extra 'Shockwave' Glow (Strong Bass driven) (Toned down)
		if (climaxIntensity > 0.4 || bassIntensity > 0.8) {
			const impact = Math.max(climaxIntensity, (bassIntensity - 0.5) * 2);
			ctx.beginPath();
			ctx.strokeStyle = `hsla(${hue}, 90%, 60%, ${impact * 0.15})`;
			ctx.lineWidth = 1 + impact * 2;
			ctx.filter = `blur(${8 + impact * 10}px)`;
			ctx.arc(headX, headY, dynamicSize * (2 + impact * 2), 0, Math.PI * 2);
			ctx.stroke();
			ctx.filter = 'none';
		}
	}

	function handlePlay() {
		isPlaying = true;
		if (!audioCtx) {
			initAudioContext();
		} else if (audioCtx.state === 'suspended') {
			audioCtx.resume();
		}
	}

	onDestroy(() => {
		if (typeof document !== 'undefined') {
			document.body.style.overflow = '';
			window.removeEventListener('keydown', handleKeydown);
		}
		if (animationFrame) cancelAnimationFrame(animationFrame);
		if (audioCtx) audioCtx.close();
	});
</script>

<div 
	class="fixed inset-0 z-[300] flex items-center justify-center bg-zinc-950 subtitle-hidden overflow-hidden font-sans"
	role="dialog"
	aria-modal="true"
	transition:fade={{ duration: 300 }}
>
	<!-- High-end Ambient Background -->
	<div class="absolute inset-0 z-0">
		{#if !imgFailed}
			<img 
				src={`/api/image?path=${encodeURIComponent(currentAudio?.path || '')}&thumbnail=true`} 
				alt=""
				class="w-full h-full object-cover opacity-20 saturate-[1.2]"
				transition:fade={{ duration: 1000 }}
				onerror={() => imgFailed = true}
			/>
		{:else}
			<div class="w-full h-full bg-zinc-900 shadow-inner"></div>
		{/if}
		<div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
		<div class="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)]"></div>
	</div>

	<!-- Centered, Width-Limited Canvas Visualizer (Background) -->
	<div class="absolute bottom-6 md:bottom-12 left-0 right-0 h-40 pointer-events-none z-0 flex justify-center">
		<div class="w-full max-w-2xl h-full opacity-30 md:opacity-40">
			<canvas 
				bind:this={canvas} 
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
		<div class="relative group perspective-1000 w-full max-w-[200px] md:max-w-[420px] aspect-square flex-shrink-0">
			<!-- Subtle Glow -->
			<div class="absolute inset-4 bg-white/5 rounded-full opacity-0 group-hover:opacity-20 transition-opacity"></div>
			
			<!-- Card wrapper -->
			<div class="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-white/20 bg-black/40 transition-all duration-700 group-hover:scale-105">
				{#if !imgFailed}
					<img 
						src={`/api/image?path=${encodeURIComponent(currentAudio?.path || '')}&thumbnail=true`} 
						alt={currentAudio?.name}
						class="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110"
						onerror={() => imgFailed = true}
					/>
				{:else}
					<div class="w-full h-full flex items-center justify-center bg-zinc-900 border border-white/5">
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
				class="absolute -right-6 top-1/2 -translate-y-1/2 w-[85%] h-[85%] bg-black rounded-full border border-white/10 shadow-2xl -z-10 transition-all duration-1000 {isPlaying ? 'translate-x-16 opacity-100' : 'translate-x-0 opacity-0'}"
				style="background: radial-gradient(circle at center, #1a1a1a 0%, #000 100%);"
			>
				<div class="absolute inset-[37.5%] rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden">
					{#if !imgFailed}
						<img src={`/api/image?path=${encodeURIComponent(currentAudio?.path || '')}&thumbnail=true`} alt="" class="w-full h-full object-cover opacity-50 animate-spin-slow will-change-transform" />
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
							max={duration || 0} 
							bind:value={currentTime} 
							oninput={(e) => { if (audioPlayer) audioPlayer.currentTime = Number(e.currentTarget.value); }}
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
						<span class="text-white">{formatTime(currentTime)}</span>
						<span>{formatTime(duration)}</span>
					</div>
				</div>

				<!-- Controls Row -->
				<div class="flex items-center justify-between gap-8">
					<div class="flex items-center gap-6">
						<button 
							class="text-white/30 hover:text-white transition-all active:scale-90 focus:outline-none" 
							onclick={prev} 
							disabled={selectedImageIndex === 0}
							onmousedown={(e) => e.preventDefault()}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6L18 18V6z"/></svg>
						</button>
						
						<button 
							class="btn btn-circle btn-primary btn-lg shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 ring-4 ring-white/10 focus:outline-none" 
							onclick={togglePlay}
							onmousedown={(e) => e.preventDefault()}
						>
							{#if isPlaying}
								<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
							{/if}
						</button>

						<button 
							class="text-white/30 hover:text-white transition-all active:scale-90 focus:outline-none" 
							onclick={next} 
							disabled={selectedImageIndex === loadedImages.length - 1 && !hasMore}
							onmousedown={(e) => e.preventDefault()}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
						</button>

						<!-- Loop Toggle -->
						<button 
							class="ml-2 transition-all active:scale-90 focus:outline-none {isLooping ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'text-white/20'}" 
							onclick={() => isLooping = !isLooping}
							title="Loop"
							onmousedown={(e) => e.preventDefault()}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
								<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
							</svg>
						</button>
					</div>

					<!-- Volume -->
					<div class="flex items-center gap-3 w-32 border-l border-white/10 pl-8">
						<button class="text-white/20 hover:text-white transition-colors focus:outline-none" onclick={toggleMute} onmousedown={(e) => e.preventDefault()}>
							{#if isMuted || volume === 0}
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
								bind:value={volume} 
								oninput={(e) => { if (audioPlayer) { audioPlayer.volume = Number(e.currentTarget.value); isMuted = volume === 0; } }}
								class="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer" 
							/>
							<div class="absolute top-0 left-0 h-full bg-white opacity-40 transition-all rounded-full" style="width: {volume * 100}%"></div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- System Close -->
	<button 
		class="absolute top-8 right-8 btn btn-circle btn-ghost text-white/40 hover:text-white hover:bg-white/10 transition-all focus:outline-none z-50"
		onclick={close}
		onmousedown={(e) => e.preventDefault()}
	>
		<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
	</button>

	<!-- Hidden Audio Native -->
	<audio
		bind:this={audioPlayer}
		src={`/api/image?path=${encodeURIComponent(currentAudio?.path || '')}`}
		crossorigin="anonymous"
		autoplay
		loop={isLooping}
		onplay={handlePlay}
		onpause={() => isPlaying = false}
		ontimeupdate={(e) => currentTime = e.currentTarget.currentTime}
		onloadedmetadata={(e) => { duration = e.currentTarget.duration; if (audioPlayer) audioPlayer.volume = volume; }}
		onended={next}
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
	.contain-strict {
		contain: strict;
	}
	svg, img {
		backface-visibility: hidden;
	}
</style>
