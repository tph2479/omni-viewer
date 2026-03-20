// Đệm lưu trữ HEIC Blob URLs để tránh convert nhiều lần
export const heicCache = new Map<string, string>();

// Fallback ảnh lỗi hoặc xử lý HEIC/HEIF kể cả khi bị sai đuôi file
export async function handleImageError(event: Event, imgPath: string) {
	const target = event.target as HTMLImageElement;
	const originalSrc = target.src;
	let loadingIndicator = target.nextElementSibling as HTMLElement;
	const originalSvg = loadingIndicator ? loadingIndicator.innerHTML : '';

	target.style.display = 'none';
	if (loadingIndicator) {
		loadingIndicator.style.display = 'flex';
		loadingIndicator.innerHTML = '<span class="loading loading-spinner loading-lg text-primary opacity-50"></span>';
	}

	if (heicCache.has(imgPath)) {
		target.src = heicCache.get(imgPath)!;
		target.onerror = null;
		target.onload = () => {
			target.style.display = 'block';
			if (loadingIndicator) loadingIndicator.style.display = 'none';
		};
		return;
	}

	try {
		const res = await fetch(`/api/image?path=${encodeURIComponent(imgPath)}`);
		if (!res.ok) throw new Error('Fetch failed');
		const blob = await res.blob();
		
		const headerBlob = blob.slice(0, 32);
		const buffer = await headerBlob.arrayBuffer();
		const uint8 = new Uint8Array(buffer);
		
		let isHeic = false;
		let headerText = '';
		for (let i = 0; i < uint8.length; i++) {
			headerText += String.fromCharCode(uint8[i]);
		}
		
		if (headerText.includes('ftypheic') || headerText.includes('ftypheix') || headerText.includes('ftypmif1') || headerText.includes('ftyphevc')) {
			isHeic = true;
		}

		const ext = imgPath.split('.').pop()?.toLowerCase();
		if (isHeic || ext === 'heic' || ext === 'heif') {
			const heic2any = (await import('heic2any')).default;
			
			const convertedBlob = await heic2any({
				blob,
				toType: 'image/jpeg',
				quality: 0.8
			});

			const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
			
			const objectUrl = URL.createObjectURL(finalBlob);
			heicCache.set(imgPath, objectUrl);
			
			target.src = objectUrl;
			target.onerror = null;
			
			target.onload = () => {
				target.style.display = 'block';
				if (loadingIndicator) loadingIndicator.style.display = 'none';
			};
			return; 
		}
	} catch (err) {
		console.warn("Image Recovery/HEIC conversion failed:", err);
	}

	// Không phải HEIC hoặc fetch thất bại - thử load lại ảnh gốc
	target.src = '';
	target.src = originalSrc;
	target.style.display = 'block';
	if (loadingIndicator) {
		loadingIndicator.style.display = 'none';
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

export function isCbzFile(filename: string) {
	return filename.toLowerCase().endsWith('.cbz');
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

export type ImageFile = { name: string; path: string; size: number; lastModified: number; isCbz?: boolean; isDir?: boolean; isVideo?: boolean; width?: number; height?: number };
