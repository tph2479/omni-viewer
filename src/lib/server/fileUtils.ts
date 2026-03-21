/**
 * Shared server-side utilities for file handling across API routes.
 * Centralises the allowed extension set and MIME-type resolution so that
 * api/gallery, api/image and api/directories never duplicate this logic.
 */

// All file extensions that the gallery accepts.
export const ALLOWED_EXTENSIONS = new Set([
	'.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', 
	'.mp4', '.webm', '.mkv', '.avi', '.flv', '.mov', '.m4v', '.cbz', '.zip', '.heic', '.heif',
	'.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.m4b',
	'.pdf', '.epub'
]);

export const isImageFile = (ext: string) => /^\.(jpg|jpeg|png|webp|gif|avif|bmp|heic|heif)$/i.test(ext);
export const isVideoFile = (ext: string) => /^\.(mp4|webm|mkv|avi|flv|mov|m4v)$/i.test(ext);
export const isAudioFile = (ext: string) => /^\.(mp3|wav|ogg|flac|m4a|aac|opus|m4b)$/i.test(ext);
export const isPdfFile = (ext: string) => ext === '.pdf';
export const isEpubFile = (ext: string) => ext === '.epub';
export const isCbzFile = (ext: string) => /^\.(cbz|zip)$/i.test(ext);

/**
 * Return the appropriate HTTP Content-Type for the given lowercase file
 * extension (including the leading dot, e.g. '.jpg').
 * Falls back to 'application/octet-stream' for unknown types.
 */
export function getContentType(ext: string): string {
	switch (ext) {
		case '.jpg':
		case '.jpeg': return 'image/jpeg';
		case '.png':  return 'image/png';
		case '.webp': return 'image/webp';
		case '.gif':  return 'image/gif';
		case '.avif': return 'image/avif';
		case '.bmp':  return 'image/bmp';
		case '.heic':
		case '.heif': return 'image/heic';
		case '.mp4':  return 'video/mp4';
		case '.webm': return 'video/webm';
		case '.mp3':  return 'audio/mpeg';
		case '.wav':  return 'audio/wav';
		case '.ogg':  return 'audio/ogg';
		case '.flac': return 'audio/flac';
		case '.m4a':  return 'audio/mp4';
		case '.aac':  return 'audio/aac';
		case '.opus': return 'audio/opus';
		case '.m4b':  return 'audio/mp4';
		case '.mkv':  return 'video/x-matroska';
		case '.avi':  return 'video/x-msvideo';
		case '.flv':  return 'video/x-flv';
		case '.mov':  return 'video/quicktime';
		case '.m4v':  return 'video/x-m4v';
		case '.pdf':  return 'application/pdf';
		case '.epub': return 'application/epub+zip';
		default:      return 'application/octet-stream';
	}
}
