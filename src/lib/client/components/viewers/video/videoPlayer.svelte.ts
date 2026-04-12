export function createVideoController() {
	const s = $state({
		isVideoPaused: true,
		videoTime: 0,
		videoDuration: 0,
		isVideoMuted: false,
		videoVolume: 1,
		isVideoLoop: false,
		videoRotation: 0,
		baseRotation: 0,
		isPortrait: false,
		isRotationLocked: true,
		controlsVisible: false,
		isHoveringControls: false,
		hideTimerId: null as any,
		videoElement: null as HTMLVideoElement | null,
		videoWidth: 0,
		videoHeight: 0,
		containerWidth: 0,
		containerHeight: 0,
		currentVideoSrc: '',
		currentMetadata: null as any,
		isMetadataLoading: false,
		lastMetadataPath: '',
		isFullscreen: false
	});

	function updateRotation() {
		s.videoRotation = (s.baseRotation + (s.isPortrait && !s.isRotationLocked ? 90 : 0)) % 360;
	}

	function rotateVideo() {
		s.baseRotation = (s.baseRotation + 90) % 360;
		updateRotation();
	}

	function toggleRotationLock() {
		s.isRotationLocked = !s.isRotationLocked;
		updateRotation();
	}

	function setOrientation(portrait: boolean) {
		if (s.isPortrait !== portrait) {
			s.isPortrait = portrait;
			updateRotation();
		}
	}

	function releaseVideo() {
		const v = s.videoElement;
		if (!v) return;
		v.pause();
		v.loop = false;
		v.volume = 0;
		v.removeAttribute('src');
		v.load();
	}

	function toggleFullscreen() {
		if (typeof globalThis.document === 'undefined') return;
		const container = globalThis.document.getElementById('media-modal-container');
		if (!container) return;
		if (!globalThis.document.fullscreenElement) {
			container.requestFullscreen().then(() => {
				s.isFullscreen = true;
				if ('orientation' in globalThis.screen && s.videoWidth > s.videoHeight) {
					(globalThis.screen as any).orientation.lock?.('landscape').catch(() => {});
				}
			}).catch(() => { });
		} else {
			globalThis.document.exitFullscreen().then(() => {
				s.isFullscreen = false;
				if ('orientation' in globalThis.screen) {
					(globalThis.screen as any).orientation.unlock?.();
				}
			}).catch(() => { });
		}
	}

	function handleMouseMoveVisibility(e: MouseEvent) {
		if (typeof window === 'undefined') return;
		const height = window.innerHeight;
		const ratioY = e.clientY / height;
		const isInTopZone = ratioY < 0.2;

		if (isInTopZone || s.isHoveringControls) {
			s.controlsVisible = true;
			if (s.hideTimerId) clearTimeout(s.hideTimerId);
			if (!s.isHoveringControls) {
				s.hideTimerId = setTimeout(() => {
					if (!s.isHoveringControls) {
						s.controlsVisible = false;
						s.hideTimerId = null;
					}
				}, 2000);
			}
		} else if (!s.isHoveringControls) {
			s.controlsVisible = false;
			if (s.hideTimerId) {
				clearTimeout(s.hideTimerId);
				s.hideTimerId = null;
			}
		}
	}

	function setupFullscreenListeners() {
		if (typeof globalThis.document === 'undefined') return;
		const handler = () => {
			const isNowFullscreen = !!globalThis.document.fullscreenElement;
			s.isFullscreen = isNowFullscreen;
			if (isNowFullscreen) {
				s.controlsVisible = false;
				s.isHoveringControls = false;
				if (s.hideTimerId) {
					clearTimeout(s.hideTimerId);
					s.hideTimerId = null;
				}
			}
		};
		globalThis.document.addEventListener('fullscreenchange', handler);
	}

	function destroy() {
		s.currentVideoSrc = '';
		if (s.hideTimerId) clearTimeout(s.hideTimerId);
		releaseVideo();
	}

	function hideControlsImmediately() {
		if (s.hideTimerId) { clearTimeout(s.hideTimerId); s.hideTimerId = null; }
		s.controlsVisible = false;
	}

	return {
		state: s,
		rotateVideo,
		toggleRotationLock,
		setOrientation,
		releaseVideo,
		toggleFullscreen,
		handleMouseMoveVisibility,
		destroy,
		hideControlsImmediately,
		setupFullscreenListeners
	};
}
