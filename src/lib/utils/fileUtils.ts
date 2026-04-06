/**
 * Shared file type constants and detection logic.
 * This file is shared between client-side and server-side code.
 */

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.heic', '.heif'];
export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mkv', '.avi', '.flv', '.mov', '.m4v'];
export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.m4b'];
export const ARCHIVE_EXTENSIONS = ['.cbz', '.zip'];
export const PDF_EXTENSIONS = ['.pdf'];
export const EPUB_EXTENSIONS = ['.epub'];

export const ALL_ALLOWED_EXTENSIONS = [
    ...IMAGE_EXTENSIONS,
    ...VIDEO_EXTENSIONS,
    ...AUDIO_EXTENSIONS,
    ...ARCHIVE_EXTENSIONS,
    ...PDF_EXTENSIONS,
    ...EPUB_EXTENSIONS
];

export const ALLOWED_EXTENSIONS = new Set(ALL_ALLOWED_EXTENSIONS);

/**
 * Checks if a filename or extension is an image file.
 * @param filename File name or extension (e.g. 'image.jpg' or '.jpg')
 */
export function isImageFile(filename: string): boolean {
    const ext = filename.toLowerCase().includes('.') ? '.' + filename.toLowerCase().split('.').pop() : filename.toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Checks if a filename or extension is a video file.
 */
export function isVideoFile(filename: string): boolean {
    const ext = filename.toLowerCase().includes('.') ? '.' + filename.toLowerCase().split('.').pop() : filename.toLowerCase();
    return VIDEO_EXTENSIONS.includes(ext);
}

/**
 * Checks if a filename or extension is an audio file.
 */
export function isAudioFile(filename: string): boolean {
    const ext = filename.toLowerCase().includes('.') ? '.' + filename.toLowerCase().split('.').pop() : filename.toLowerCase();
    return AUDIO_EXTENSIONS.includes(ext);
}

/**
 * Checks if a filename or extension is a PDF file.
 */
export function isPdfFile(filename: string): boolean {
    const ext = filename.toLowerCase().includes('.') ? '.' + filename.toLowerCase().split('.').pop() : filename.toLowerCase();
    return PDF_EXTENSIONS.includes(ext);
}

/**
 * Checks if a filename or extension is an EPUB file.
 */
export function isEpubFile(filename: string): boolean {
    const ext = filename.toLowerCase().includes('.') ? '.' + filename.toLowerCase().split('.').pop() : filename.toLowerCase();
    return EPUB_EXTENSIONS.includes(ext);
}

/**
 * Checks if a filename or extension is a CBZ/Archive file.
 */
export function isCbzFile(filename: string): boolean {
    const ext = filename.toLowerCase().includes('.') ? '.' + filename.toLowerCase().split('.').pop() : filename.toLowerCase();
    return ARCHIVE_EXTENSIONS.includes(ext);
}

/**
 * Gets the standardized media type for a filename or extension.
 */
export function getFileType(filename: string): 'image' | 'video' | 'audio' | 'pdf' | 'epub' | 'cbz' | 'unknown' {
    if (isImageFile(filename)) return 'image';
    if (isVideoFile(filename)) return 'video';
    if (isAudioFile(filename)) return 'audio';
    if (isPdfFile(filename)) return 'pdf';
    if (isEpubFile(filename)) return 'epub';
    if (isCbzFile(filename)) return 'cbz';
    return 'unknown';
}

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

/**
 * Checks if a filename or extension is a traditional ZIP file.
 */
export function isZipFile(filename: string): boolean {
	return filename.toLowerCase().endsWith('.zip');
}

export type ImageFile = { 
    name: string; 
    path: string; 
    size: number; 
    lastModified: number; 
    isCbz?: boolean; 
    isDir?: boolean; 
    isVideo?: boolean; 
    isAudio?: boolean; 
    isPdf?: boolean; 
    isEpub?: boolean; 
    width?: number; 
    height?: number; 
    firstCbz?: string; 
    hasImages?: boolean; 
};
