export function createVideoController() {
	const s = $state({
		isVideoPaused: true,
		videoTime: 0,
		videoDuration: 0,
		isVideoMuted: false,
		videoVolume: 1,
		isVideoLoop: false,
		videoRotation: 0,
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
		lastMetadataPath: ''
	});

	function rotateVideo() {
		s.videoRotation = (s.videoRotation + 90) % 360;
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
		if (typeof document === 'undefined') return;
		const container = document.getElementById('media-modal-container');
		if (!container) return;
		if (!document.fullscreenElement) {
			container.requestFullscreen().catch(() => { });
		} else {
			document.exitFullscreen().catch(() => { });
		}
	}

	function handleMouseMoveVisibility(e: MouseEvent) {
		if (typeof window === 'undefined') return;
		const height = window.innerHeight;
		const ratioY = e.clientY / height;
		const isInTopZone = ratioY < 0.2;

		if (isInTopZone) {
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

	function destroy() {
		s.currentVideoSrc = '';
		if (s.hideTimerId) clearTimeout(s.hideTimerId);
		releaseVideo();
	}

	return {
		state: s,
		rotateVideo,
		releaseVideo,
		toggleFullscreen,
		handleMouseMoveVisibility,
		destroy
	};
}
