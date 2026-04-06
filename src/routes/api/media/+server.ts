import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { getContentType, isImageFile } from '$lib/utils/fileUtils';
import { isHeifBuffer, isAvifBuffer, THUMB_CACHE_DIR, getThumbnailPath } from '$lib/server/services/imageUtils';
import { findFolderCover } from '$lib/server/services/files';

import { decodePath, resolvePath } from '../_shared/pathUtils';
import { serveFileResponse, CACHE_IMMUTABLE } from '../_shared/responseUtils';

import { getMediaMetadata, serveMediaImage, streamMedia } from '$lib/server/services/media';
import { generateThumbnail } from '$lib/server/services/thumbnails';

export async function GET({ url, request }: RequestEvent) {
    try {
        const imagePath = url.searchParams.get('path');
        const isThumbnail = url.searchParams.get('thumbnail') === 'true';
        const getMetadataOnly = url.searchParams.get('metadata') === 'true';
        const isRetry = !!url.searchParams.get('retry');

        if (!imagePath) throw error(400, 'Missing path');

        const { absolutePath: rawPath, isArchivePath } = resolvePath(decodePath(imagePath));

        if (isArchivePath) {
            return new Response(null, {
                status: 307,
                headers: { Location: `/api/ebook?${url.searchParams.toString()}` },
            });
        }

        let absolutePath = rawPath;
        if (!fs.existsSync(absolutePath)) throw error(404, 'File not found');
        let stat = await fsp.stat(absolutePath);

        if (stat.isDirectory() && isThumbnail) {
            const coverPath = await findFolderCover(absolutePath);
            if (!coverPath) return new Response(null, { status: 204 });
            absolutePath = coverPath;
            stat = await fsp.stat(absolutePath);
        }

        const filename = path.basename(absolutePath);
        let ext = path.extname(filename).toLowerCase().replace('.', '');
        let isHeic = ext === 'heic' || ext === 'heif';
        let isAvif = ext === 'avif';

        if (!isThumbnail && isImageFile(filename)) {
            try {
                const header = Buffer.alloc(256);
                const fd = fs.openSync(absolutePath, 'r');
                fs.readSync(fd, header, 0, 256, 0);
                fs.closeSync(fd);
                if (isHeifBuffer(header)) isHeic = true;
                if (isAvifBuffer(header)) { isAvif = true; isHeic = false; ext = 'avif'; }
            } catch { /* soft fallback */ }
        }

        if (getMetadataOnly) {
            return getMediaMetadata(absolutePath, imagePath, stat, ext, isHeic, request.signal, isRetry);
        }

        if (isThumbnail) {
            const thumbPath = await getThumbnailPath(absolutePath, stat.mtimeMs);
            if (!fs.existsSync(thumbPath)) {
                const ok = await generateThumbnail(absolutePath, thumbPath, stat.mtimeMs, request.signal);
                if (!ok) return new Response(null, { status: 204 });
            }
            return serveFileResponse(thumbPath, { 'Content-Type': 'image/webp', ...CACHE_IMMUTABLE });
        }

        const realContentType = isAvif ? 'image/avif' : getContentType('.' + ext);
        const isVideo = realContentType.startsWith('video/');
        const isAudio = realContentType.startsWith('audio/');

        if (isVideo || isAudio) {
            return streamMedia(absolutePath, stat, realContentType, request.headers.get('range'), request.signal);
        }

        return serveMediaImage(absolutePath, stat, realContentType, isHeic, request.signal, isRetry);
    } catch (err: any) {
        if (err?.status) throw err;
        console.error('[Media API Error]', err);
        throw error(500, `Internal error: ${err?.message ?? 'Unknown error'}`);
    }
}

export async function DELETE() {
    try {
        if (fs.existsSync(THUMB_CACHE_DIR)) {
            await fsp.rm(THUMB_CACHE_DIR, { recursive: true, force: true });
            await fsp.mkdir(THUMB_CACHE_DIR, { recursive: true });
        }
        return json({ success: true });
    } catch (err: any) {
        console.error('[Media DELETE Error]', err);
        throw error(500, `Failed to clear cache: ${err?.message ?? 'Unknown error'}`);
    }
}
