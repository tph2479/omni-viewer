/**
 * Shared file type constants and detection logic.
 * This file is shared between client-side and server-side code.
 */

import type { MediaType } from '$lib/stores/browser/types';

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.heic', '.heif'];
export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mkv', '.avi', '.flv', '.mov', '.m4v'];
export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.m4b'];
export const ARCHIVE_EXTENSIONS = ['.cbz', '.zip'];
export const PDF_EXTENSIONS = ['.pdf'];
export const EPUB_EXTENSIONS = ['.epub'];

const ALL_EXTENSIONS = [
    ...IMAGE_EXTENSIONS,
    ...VIDEO_EXTENSIONS,
    ...AUDIO_EXTENSIONS,
    ...ARCHIVE_EXTENSIONS,
    ...PDF_EXTENSIONS,
    ...EPUB_EXTENSIONS
];

export const ALLOWED_EXTENSIONS = new Set(ALL_EXTENSIONS);

const CONTENT_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp',
    '.gif': 'image/gif', '.avif': 'image/avif',
    '.bmp': 'image/bmp', '.heic': 'image/heic', '.heif': 'image/heic',
    '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
    '.flv': 'video/x-flv', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.opus': 'audio/opus', '.m4b': 'audio/mp4',
    '.pdf': 'application/pdf', '.epub': 'application/epub+zip',
    '.cbz': 'application/vnd.comicbook+zip', '.zip': 'application/zip',
};

function getExtension(filename: string): string {
    if (!filename.includes('.')) return filename.toLowerCase();
    return '.' + filename.toLowerCase().split('.').pop()!;
}

function hasExtension(ext: string, extensions: readonly string[]): boolean {
    return extensions.includes(ext);
}

export function isImageFile(filename: string): boolean {
    return hasExtension(getExtension(filename), IMAGE_EXTENSIONS);
}

export function isVideoFile(filename: string): boolean {
    return hasExtension(getExtension(filename), VIDEO_EXTENSIONS);
}

export function isAudioFile(filename: string): boolean {
    return hasExtension(getExtension(filename), AUDIO_EXTENSIONS);
}

export function isPdfFile(filename: string): boolean {
    return hasExtension(getExtension(filename), PDF_EXTENSIONS);
}

export function isEpubFile(filename: string): boolean {
    return hasExtension(getExtension(filename), EPUB_EXTENSIONS);
}

export function isCbzFile(filename: string): boolean {
    return hasExtension(getExtension(filename), ARCHIVE_EXTENSIONS);
}

export function isZipFile(filename: string): boolean {
    return getExtension(filename) === '.zip';
}

export function getContentType(filename: string): string {
    return CONTENT_TYPES[getExtension(filename)] ?? 'application/octet-stream';
}

export const MEDIA_TYPE_MAP = new Map<string, MediaType>([
    ['.jpg', 'image'], ['.jpeg', 'image'], ['.png', 'image'], ['.webp', 'image'],
    ['.gif', 'image'], ['.avif', 'image'], ['.bmp', 'image'], ['.heic', 'image'], ['.heif', 'image'],
    ['.mp4', 'video'], ['.webm', 'video'], ['.mkv', 'video'], ['.avi', 'video'],
    ['.flv', 'video'], ['.mov', 'video'], ['.m4v', 'video'],
    ['.mp3', 'audio'], ['.wav', 'audio'], ['.ogg', 'audio'], ['.flac', 'audio'],
    ['.m4a', 'audio'], ['.aac', 'audio'], ['.opus', 'audio'], ['.m4b', 'audio'],
    ['.pdf', 'pdf'], ['.epub', 'epub'],
    ['.cbz', 'cbz'], ['.zip', 'cbz'],
]);

export function getMediaType(filename: string): MediaType {
    const ext = getExtension(filename);
    return MEDIA_TYPE_MAP.get(ext) ?? 'unknown';
}

export type GroupedItems = {
    folders: any[];
    images: any[];
    cbz: any[];
    pdf: any[];
    epub: any[];
    audio: any[];
    videos: any[];
};

export type GroupedResult = {
    groups: GroupedItems;
    counts: {
        total: number;
        totalImages: number;
        totalVideos: number;
        totalAudio: number;
        totalEbook: number;
    };
};

export function groupItemsByMediaType(items: any[]): GroupedResult {
    const groups: GroupedItems = {
        folders: [], images: [], cbz: [], pdf: [],
        epub: [], audio: [], videos: []
    };

    for (const item of items) {
        switch (item.mediaType) {
            case 'directory': groups.folders.push(item); break;
            case 'image': groups.images.push(item); break;
            case 'cbz': groups.cbz.push(item); break;
            case 'pdf': groups.pdf.push(item); break;
            case 'epub': groups.epub.push(item); break;
            case 'audio': groups.audio.push(item); break;
            case 'video': groups.videos.push(item); break;
        }
    }

    return {
        groups,
        counts: {
            total: items.length,
            totalImages: groups.images.length,
            totalVideos: groups.videos.length,
            totalAudio: groups.audio.length,
            totalEbook: groups.cbz.length + groups.pdf.length + groups.epub.length,
        }
    };
}
