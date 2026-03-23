export function createAudioController() {
	const s = $state({
		audioPlayer: null as HTMLAudioElement | null,
		isLooping: false,
		isPlaying: false,
		currentTime: 0,
		duration: 0,
		volume: 1,
		imgFailed: false,
		isMuted: false,
		previousVolume: 1,
		isAutoNext: true,

		audioCtx: null as AudioContext | null,
		analyser: null as AnalyserNode | null,
		dataArray: null as Uint8Array | null,
		animationFrame: 0 as number,
		sourceNode: null as MediaElementAudioSourceNode | null,

		canvas: null as HTMLCanvasElement | null,
		history: [] as {y: number, b: number, m: number, t: number, h: number}[],
		lastDrawTime: 0,

		smoothedVal: 0,
		yVel: 0, 
		
		energyHistory: new Array(200).fill(0), 
		prevDataArray: new Uint8Array(128),
		isClimax: false,
		climaxIntensity: 0,
		
		bassIntensity: 0,
		midIntensity: 0,
		trebleIntensity: 0
	});

	function togglePlay() {
		if (!s.audioPlayer) return;
		if (s.audioPlayer.paused) {
			s.audioPlayer.play();
		} else {
			s.audioPlayer.pause();
		}
	}

	function toggleMute() {
		if (!s.audioPlayer) return;
		if (s.isMuted) {
			s.volume = s.previousVolume;
			s.isMuted = false;
		} else {
			s.previousVolume = s.volume;
			s.volume = 0;
			s.isMuted = true;
		}
		s.audioPlayer.volume = s.volume;
	}

	function initAudioContext() {
		if (s.audioCtx || !s.audioPlayer) return;

		try {
			s.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
			s.analyser = s.audioCtx.createAnalyser();
			s.analyser.fftSize = 256; 
			s.analyser.smoothingTimeConstant = 0.5;
			
			s.sourceNode = s.audioCtx.createMediaElementSource(s.audioPlayer);
			s.sourceNode.connect(s.analyser);
			s.analyser.connect(s.audioCtx.destination);
			
			s.dataArray = new Uint8Array(s.analyser.frequencyBinCount);
			updateExcitement();
		} catch (e) {
			console.error("Audio Context failed:", e);
		}
	}

	function updateExcitement() {
		if (!s.analyser || !s.dataArray || !s.canvas) return;
		
		const now = performance.now();
		if (now - s.lastDrawTime < 30) {
			s.animationFrame = requestAnimationFrame(updateExcitement);
			return;
		}
		s.lastDrawTime = now;

		s.analyser.getByteFrequencyData(s.dataArray as any);
		
		let peak = 0;
		for(let i=60; i<110; i++) {
			if (s.dataArray[i] > peak) peak = s.dataArray[i];
		}
		
		const rawVal = peak / 255;
		
		let bassSum = 0; for(let i=0; i<8; i++) bassSum += s.dataArray[i];
		let midSum = 0; for(let i=10; i<50; i++) midSum += s.dataArray[i];
		let trebleSum = 0; for(let i=60; i<110; i++) trebleSum += s.dataArray[i];
		
		const currentBass = Math.pow(bassSum / (8 * 255), 1.2) * 1.5;
		const currentMid = Math.pow(midSum / (40 * 255), 1.4) * 1.2;
		const currentTreble = Math.pow(trebleSum / (50 * 255), 1.6) * 2.0;

		s.bassIntensity = s.bassIntensity * 0.8 + currentBass * 0.2;
		s.midIntensity = s.midIntensity * 0.8 + currentMid * 0.2;
		s.trebleIntensity = s.trebleIntensity * 0.7 + currentTreble * 0.3;

		const targetVal = Math.min(1.0, (currentMid * 0.7 + currentTreble * 0.3) * 1.4); 
		
		let flux = 0;
		for(let i=0; i<s.dataArray.length; i++) {
			flux += Math.max(0, s.dataArray[i] - s.prevDataArray[i]);
		}
		s.prevDataArray.set(s.dataArray);

		s.energyHistory.push(rawVal);
		s.energyHistory.shift();
		const baseline = s.energyHistory.reduce((a, b) => a + b, 0) / s.energyHistory.length;
		
		const fluxFactor = Math.min(2.0, flux / 350);
		const energyFactor = rawVal / (Math.max(0.05, baseline) * 1.3);
		
		s.isClimax = (energyFactor > 1.0 || fluxFactor > 1.4 || (currentBass > 0.7 && currentTreble > 0.7)) && rawVal > 0.15;
		
		s.climaxIntensity = s.climaxIntensity * 0.85 + (s.isClimax ? 1 : 0) * 0.15;
		
		const stiffness = 0.15;
		const damping = 0.8;
		const force = (targetVal - s.smoothedVal) * stiffness;
		s.yVel = (s.yVel + force) * damping;
		s.smoothedVal += s.yVel;
		
		const hue = (performance.now() / 20) % 360;
		s.history.push({ 
			y: s.smoothedVal, 
			b: s.bassIntensity, 
			m: s.midIntensity, 
			t: s.trebleIntensity,
			h: hue
		});
		if (s.history.length > 500) s.history.shift();
		
		drawGraph();
		s.animationFrame = requestAnimationFrame(updateExcitement);
	}

	function drawGraph() {
		if (!s.canvas) return;
		const ctx = s.canvas.getContext('2d', { alpha: true });
		if (!ctx) return;

		const w = s.canvas.width;
		const h = s.canvas.height;
		const step = 2.0; 
		const hue = (performance.now() / 20) % 360; 
		
		ctx.clearRect(0, 0, w, h);
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';

		const currentCount = s.history.length;
		const headX = w - 120; 
		
		ctx.beginPath();
		const opacity = 0.25;
		ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
		ctx.lineWidth = 1.0;
		
		for (let i = 0; i < currentCount; i++) {
			const indexFromHead = (currentCount - 1 - i);
			const x = headX - (indexFromHead * step);
			const y = h - (s.history[i].y * h * 0.5) - 40; 
			
			if (x < -20) continue;
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();

		if (currentCount === 0) return;

		const lastPt = s.history[currentCount - 1];
		const headY = h - (lastPt.y * h * 0.5) - 40;

		ctx.beginPath();
		ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
		ctx.lineWidth = 12;
		ctx.filter = 'blur(10px)';
		ctx.arc(headX, headY, 2, 0, Math.PI * 2);
		ctx.stroke();

		ctx.beginPath();
		ctx.strokeStyle = `hsla(${hue}, 80%, 80%, ${0.1 + s.trebleIntensity * 0.2})`;
		ctx.lineWidth = 5 + s.trebleIntensity * 5;
		ctx.filter = `blur(${4 + s.trebleIntensity * 6}px)`;
		ctx.arc(headX, headY, 1, 0, Math.PI * 2);
		ctx.stroke();
		ctx.filter = 'none';

		ctx.beginPath();
		
		const r = 255;
		const g = 255 - (s.climaxIntensity * 150) - (s.bassIntensity * 30); 
		const b = 255 - (s.climaxIntensity * 50) + (s.bassIntensity * 50);
		
		const outerColor = s.climaxIntensity > 0.2 
			? `hsla(${hue}, 80%, 70%, ${0.9 + s.climaxIntensity * 0.1})`
			: `rgba(${r}, ${g}, ${b}, ${0.9 + s.climaxIntensity * 0.1})`;
		
		const baseSize = 2.0;
		const dynamicSize = baseSize + (s.climaxIntensity * 8) + (s.bassIntensity * 4);
		
		const grad = ctx.createRadialGradient(headX, headY, 0, headX, headY, dynamicSize);
		grad.addColorStop(0, "#FFFFFF");
		grad.addColorStop(0.4, "#FFFFFF");
		grad.addColorStop(1, outerColor);
		
		ctx.fillStyle = grad;
		ctx.arc(headX, headY, dynamicSize, 0, Math.PI * 2);
		ctx.fill();

		if (s.climaxIntensity > 0.4 || s.bassIntensity > 0.8) {
			const impact = Math.max(s.climaxIntensity, (s.bassIntensity - 0.5) * 2);
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
		s.isPlaying = true;
		if (!s.audioCtx) {
			initAudioContext();
		} else if (s.audioCtx.state === 'suspended') {
			s.audioCtx.resume();
		}
	}

	function destroy() {
		if (s.animationFrame) cancelAnimationFrame(s.animationFrame);
		if (s.audioCtx) s.audioCtx.close();
		s.audioCtx = null;
		s.analyser = null;
		s.sourceNode = null;
	}

	return {
		state: s,
		togglePlay,
		toggleMute,
		initAudioContext,
		handlePlay,
		destroy
	};
}
