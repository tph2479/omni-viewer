// Fallback ảnh lỗi hoặc xử lý HEIC/HEIF kể cả khi bị sai đuôi file
export async function handleImageError(event: Event, imgPath: string) {
	const target = event.target as HTMLImageElement;
	if (!target) return;
	
	const originalSrc = target.src;
	const loadingIndicator = target.nextElementSibling as HTMLElement;
	
	// Prevent infinite loops if the image consistently fails
	if (target.dataset.failedPermanently) {
		console.warn("Image consistently failing, giving up:", imgPath);
		return;
	}

	target.style.display = 'none';
	if (loadingIndicator) {
		loadingIndicator.style.display = 'flex';
		loadingIndicator.innerHTML = '<span class="loading loading-spinner loading-lg text-primary opacity-50"></span>';
	}

	try {
		// If we haven't retried this specific version yet
		if (!originalSrc.includes('retry=')) {
			// Just wait a moment and retry once with forced-regeneration flag on server
			await new Promise(resolve => setTimeout(resolve, 500));
			
			// Set a flag so if THIS retry fails, we don't try again
			target.onerror = () => {
				target.onerror = null;
				target.dataset.failedPermanently = "true";
				target.style.display = 'none';
				if (loadingIndicator) {
					loadingIndicator.style.display = 'flex';
					loadingIndicator.innerHTML = '<div class="flex flex-col items-center opacity-30"><svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div>';
				}
			};
			
			// Notify parents that we are retrying (useful for metadata sync)
			target.dispatchEvent(new CustomEvent('img-retry', { bubbles: true, detail: { path: imgPath } }));
			
			target.src = originalSrc + (originalSrc.includes('?') ? '&' : '?') + 'retry=' + Date.now();
			target.style.display = 'block';
			if (loadingIndicator) loadingIndicator.style.display = 'none';
		} else {
			target.dataset.failedPermanently = "true";
		}
	} catch (err) {
		console.warn("Image recovery failed:", err);
	}
}

// Kiểm tra đuôi file video
export function isVideoFile(filename: string) {
	const ext = filename.toLowerCase().split('.').pop();
	return ext === 'mp4' || ext === 'webm';
}

export function isZipFile(filename: string) {
	return filename.toLowerCase().endsWith('.zip');
}

export function isPdfFile(filename: string) {
	return filename.toLowerCase().endsWith('.pdf');
}

export function isCbzFile(filename: string) {
	return filename.toLowerCase().endsWith('.cbz');
}

export function isEpubFile(filename: string) {
	return filename.toLowerCase().endsWith('.epub');
}

export function isAudioFile(filename: string) {
	const ext = filename.toLowerCase().split('.').pop();
	return ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.m4b'].includes('.' + ext);
}

// Chuyển đổi bytes sang KB/MB
export function formatBytes(bytes: number, decimals = 2) {
	if (!+bytes) return '0 Bytes';
	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDate(ms: number) {
	return new Date(ms).toLocaleDateString();
}

export function formatDateTime(ms: number) {
	return new Date(ms).toLocaleString();
}

export type ImageFile = { name: string; path: string; size: number; lastModified: number; isCbz?: boolean; isDir?: boolean; isVideo?: boolean; isAudio?: boolean; isPdf?: boolean; isEpub?: boolean; width?: number; height?: number };
