import { error, json } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';
import yauzl from 'yauzl-promise';
import { ALLOWED_EXTENSIONS, isVideoFile, isAudioFile, isPdfFile, isEpubFile, isCbzFile } from '$lib/server/fileUtils';

export async function handleListing(folderPath: string, page: number, limit: number, sortBy: string, typeFilter: string, imagesOnly: boolean) {
    const stat = await fs.stat(folderPath);
    let imageDetails: any[] = [];

    if (stat.isFile() && (folderPath.toLowerCase().endsWith('.cbz') || folderPath.toLowerCase().endsWith('.zip'))) {
        const zip = await yauzl.open(folderPath);
        try {
            for await (const entry of zip) {
                const ext = path.extname(entry.filename).toLowerCase();
                if (ALLOWED_EXTENSIONS.has(ext) && ext !== '.cbz' && ext !== '.zip' && ext !== '.mp4' && ext !== '.webm') {
                    imageDetails.push({
                        name: entry.filename,
                        path: `${folderPath}::${entry.filename}`,
                        size: entry.uncompressedSize,
                        mtime: Date.now(),
                        isDir: false
                    });
                }
            }
        } finally {
            await zip.close();
        }
    } else if (stat.isDirectory()) {
        const entries = await fs.readdir(folderPath, { withFileTypes: true });
        const CHUNK_SIZE_STAT = 50;

        for (let i = 0; i < entries.length; i += CHUNK_SIZE_STAT) {
            const chunk = entries.slice(i, i + CHUNK_SIZE_STAT);
            const results = await Promise.all(
                chunk.map(async (entry: any) => {
                    const fullPath = path.join(folderPath, entry.name);
                    const ext = path.extname(entry.name).toLowerCase();
                    const isDir = entry.isDirectory();
                    const isCbz = !isDir && isCbzFile(ext);
                    const isVideo = !isDir && isVideoFile(ext);
                    const isAudio = !isDir && isAudioFile(ext);
                    const isPdf = !isDir && isPdfFile(ext);
                    const isEpub = !isDir && isEpubFile(ext);

                    let isAllowed = isDir || isCbz || isAudio || isPdf || isEpub || ALLOWED_EXTENSIONS.has(ext);

                    if (!isDir) {
                        if (typeFilter === 'images' && (isVideo || isAudio || isPdf || isEpub || isCbz)) isAllowed = false;
                        if (typeFilter === 'videos' && !isVideo) isAllowed = false;
                        if (typeFilter === 'audio' && !isAudio) isAllowed = false;
                        if (typeFilter === 'ebook' && (!isPdf && !isEpub && !isCbz)) isAllowed = false;
                    }
                    
                    if (isAllowed) {
                        if (imagesOnly && (isDir || isVideo || isAudio || isCbz || isPdf || isEpub)) return null;

                        try {
                            const entryStat = await fs.stat(fullPath);
                            return {
                                name: entry.name,
                                path: fullPath,
                                mtime: entryStat.mtimeMs,
                                size: entryStat.size,
                                isDir, isCbz, isVideo, isAudio, isPdf, isEpub
                            };
                        } catch (e) { return null; }
                    }
                    return null;
                })
            );
            imageDetails.push(...results.filter(Boolean));
        }
    } else {
        throw error(400, 'Invalid path');
    }

    imageDetails.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        if (sortBy === 'date_desc') return b.mtime - a.mtime;
        if (sortBy === 'date_asc') return a.mtime - b.mtime;
        if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
        return 0;
    });

    const start = page * limit;
    const end = start + limit;
    const totalCount = imageDetails.length;
    const totalImagesCount = imageDetails.filter(item => !item.isDir && !item.isCbz && !item.isVideo && !item.isAudio && !item.isPdf && !item.isEpub).length;
    const totalVideosCount = imageDetails.filter(item => item.isVideo).length;
    const totalAudioCount = imageDetails.filter(item => item.isAudio).length;
    const totalEbookCount = imageDetails.filter(item => item.isPdf || item.isEpub || item.isCbz).length;

    const paginatedImages = imageDetails.slice(start, end).map(item => ({
        name: item.name,
        path: item.path,
        isDir: item.isDir,
        isCbz: item.isCbz,
        isVideo: item.isVideo,
        isAudio: item.isAudio,
        isPdf: item.isPdf,
        isEpub: item.isEpub,
        size: item.size,
        lastModified: item.mtime
    }));

    // @ts-ignore
    if (globalThis.Bun) { globalThis.Bun.gc(true); }

    return json({
        images: paginatedImages,
        total: totalCount,
        totalImages: totalImagesCount,
        totalVideos: totalVideosCount,
        totalAudio: totalAudioCount,
        totalEbook: totalEbookCount,
        page,
        hasMore: end < totalCount
    });
}
