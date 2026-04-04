// Fallback ảnh lỗi hoặc xử lý HEIC/HEIF kể cả khi bị sai đuôi file
export async function handleImageError(event: Event, imgPath: string) {
	const target = event.target as HTMLImageElement;
	if (!target || !target.src) return;

	const originalSrc = target.src;
	const baseUrl = originalSrc.split('&__rt=')[0].split('&retry=')[0];

	// Store the expected base url to detect if Svelte recycled this DOM node for another file
	if (!target.dataset.expectedSrc) {
		target.dataset.expectedSrc = baseUrl;
	} else if (target.dataset.expectedSrc !== baseUrl) {
		// This node was recycled for a new image! Reset everything!
		target.dataset.failedPermanently = "";
		target.dataset.expectedSrc = baseUrl;
	}

	// Prevent infinite loops if the image consistently fails
	if (target.dataset.failedPermanently === "true") {
		return;
	}

	target.style.display = 'none';

	try {
		if (!originalSrc.includes('retry=')) {
			// Just wait a moment and retry once with forced-regeneration flag on server for full images
			await new Promise(resolve => setTimeout(resolve, 500));

			if (target.dataset.expectedSrc !== baseUrl) return; // ABORT recycling

			// Set a flag so if THIS retry fails, we don't try again
			target.onerror = () => {
				target.onerror = null;
				target.dataset.failedPermanently = "true";
				target.style.display = 'none';
			};

			// Notify parents that we are retrying (useful for metadata sync)
			target.dispatchEvent(new CustomEvent('img-retry', { bubbles: true, detail: { path: imgPath } }));

			target.src = originalSrc + (originalSrc.includes('?') ? '&' : '?') + 'retry=' + Date.now();
			target.style.display = 'block';
		} else {
			if (target.dataset.expectedSrc === baseUrl) {
				target.dataset.failedPermanently = "true";
				target.style.display = 'none';
			}
		}
	} catch (err) {
		console.warn("Image recovery failed:", err);
	}
}

import {
	isImageFile as _isImage,
	isVideoFile as _isVideo,
	isAudioFile as _isAudio,
	isPdfFile as _isPdf,
	isEpubFile as _isEpub,
	isCbzFile as _isCbz
} from "$lib/fileUtils";

// ... existing handleImageError ...

// Kiểm tra đuôi file
export const isImageFile = _isImage;
export const isVideoFile = _isVideo;
export const isAudioFile = _isAudio;
export const isPdfFile = _isPdf;
export const isEpubFile = _isEpub;
export const isCbzFile = _isCbz;

export function isZipFile(filename: string) {
	return filename.toLowerCase().endsWith('.zip');
}


// Chuyển đổi bytes sang KB/MB
export function formatBytes(bytes: number, decimals = 2) {
	if (!+bytes) return '0 Bytes';
	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDate(ms: number) {
	return new Date(ms).toLocaleDateString();
}

export function formatDateTime(ms: number) {
	return new Date(ms).toLocaleString();
}

export type ImageFile = { name: string; path: string; size: number; lastModified: number; isCbz?: boolean; isDir?: boolean; isVideo?: boolean; isAudio?: boolean; isPdf?: boolean; isEpub?: boolean; width?: number; height?: number; firstCbz?: string };
