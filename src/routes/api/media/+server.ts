import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { getContentType } from '$lib/utils/fileUtils';
import { THUMB_CACHE_DIR, getThumbnailPath } from '$lib/server/services/imageUtils';
import { createApiHandler } from '$lib/server/api/handler';
import { serveFileResponse, CACHE_IMMUTABLE } from '$lib/server/api/responseUtils';
import { detectImageRealType } from '$lib/server/utils/fileDetection';
import { findFolderCover } from '$lib/server/services/files';
import { getMediaMetadata, serveMediaImage, streamMedia } from '$lib/server/services/media';
import { generateThumbnail } from '$lib/server/services/thumbnails';

export const GET = createApiHandler(async ({ absolutePath: rawPath, normalizedPath, isArchivePath, url, request }) => {
    const isThumbnail = url.searchParams.get('thumbnail') === 'true';
    const getMetadataOnly = url.searchParams.get('metadata') === 'true';
    const isRetry = !!url.searchParams.get('retry');

    // Archive paths redirect to ebook API
    if (isArchivePath) {
        return new Response(null, {
            status: 307,
            headers: { Location: `/api/ebook?${url.searchParams.toString()}` },
        });
    }

    let absolutePath = rawPath;
    let stat = await fsp.stat(absolutePath);

    // Handle directory thumbnails (covers)
    if (stat.isDirectory() && isThumbnail) {
        const coverPath = await findFolderCover(absolutePath);
        if (!coverPath) return new Response(null, { status: 204 });
        absolutePath = coverPath;
        stat = await fsp.stat(absolutePath);
    }

    const filename = path.basename(absolutePath);
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    
    // Real type detection
    let { isHeic, isAvif } = await detectImageRealType(absolutePath);
    if (ext === 'heic' || ext === 'heif') isHeic = true;
    if (ext === 'avif') { isAvif = true; isHeic = false; }

    // Metadata Mode
    if (getMetadataOnly) {
        return await getMediaMetadata(absolutePath, normalizedPath, stat, ext, isHeic, request.signal, isRetry);
    }

    // Thumbnail Mode
    if (isThumbnail) {
        const thumbPath = await getThumbnailPath(absolutePath, stat.mtimeMs);
        if (!fs.existsSync(thumbPath)) {
            const ok = await generateThumbnail(absolutePath, thumbPath, stat.mtimeMs, request.signal);
            if (!ok) return new Response(null, { status: 204 });
        }
        return serveFileResponse(thumbPath, { 'Content-Type': 'image/webp', ...CACHE_IMMUTABLE });
    }

    // Serving Mode
    const realContentType = isAvif ? 'image/avif' : getContentType('.' + ext);
    const isVideo = realContentType.startsWith('video/');
    const isAudio = realContentType.startsWith('audio/');

    if (isVideo || isAudio) {
        return streamMedia(absolutePath, stat, realContentType, request.headers.get('range'), request.signal);
    }

    return serveMediaImage(absolutePath, stat, realContentType, isHeic, request.signal, isRetry);
}, {
    path: 'required'
});

export const DELETE = createApiHandler(async () => {
    if (fs.existsSync(THUMB_CACHE_DIR)) {
        await fsp.rm(THUMB_CACHE_DIR, { recursive: true, force: true });
        await fsp.mkdir(THUMB_CACHE_DIR, { recursive: true });
    }
    return { success: true };
});
