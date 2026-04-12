/**
 * Media API — single endpoint that serves images, video, audio, and thumbnails.
 *
 * Routing logic (parsed from query params):
 *   ?metadata=true           → Return JSON metadata (dimensions, size, etc.)
 *   ?thumbnail=true          → Return a cached WebP thumbnail (generate if missing)
 *   (default)                → Stream the raw media file; video/audio use byte-range
 *
 * Archive paths (.cbz::entry) are forwarded to the ebook API.
 * DELETE /api/media          → Purges the thumbnail cache directory.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';

import { getContentType } from '$lib/shared/utils/fileUtils';
import { THUMB_CACHE_DIR, getThumbnailPath } from '$lib/server/utils/heicConverter';
import { defineHandler } from '$lib/server/api/handler';
import { serveFileResponse, CACHE_IMMUTABLE } from '$lib/server/api/responseUtils';
import { detectImageRealType } from '$lib/server/utils/mediaSniffer';
import { locateDirectoryCoverImage } from '$lib/server/services/file/visualsResolver';
import { extractMediaFileMetadata } from '$lib/server/services/media/metadataExtractor';
import { serveStaticImageResponse, createByteRangeStreamResponse } from '$lib/server/services/media/streamingResponder';
import { generateThumbnail } from '$lib/server/services/media/thumbnails';

export const GET = defineHandler(async ({ absolutePath: rawPath, normalizedPath, isArchivePath, url, request }) => {
    const requestsThumbnailImage = url.searchParams.get('thumbnail') === 'true';
    const requestsMetadataOnly   = url.searchParams.get('metadata')  === 'true';
    const forceRegenerate        = !!url.searchParams.get('retry');

    // Archive paths are handled by the ebook API
    if (isArchivePath) {
        return new Response(null, {
            status: 307,
            headers: { Location: `/api/ebook?${url.searchParams.toString()}` },
        });
    }

    let resolvedFilePath = rawPath;
    let systemFileStats  = await fsp.stat(resolvedFilePath);

    // For directory thumbnails, resolve the cover image first
    if (systemFileStats.isDirectory() && requestsThumbnailImage) {
        const coverImagePath = await locateDirectoryCoverImage(resolvedFilePath);
        if (!coverImagePath) return new Response(null, { status: 204 });
        resolvedFilePath = coverImagePath;
        systemFileStats  = await fsp.stat(resolvedFilePath);
    }

    const fileExtension = resolvedFilePath.split('.').pop()?.toLowerCase() ?? '';

    // Detect real image format from file header (not just extension)
    let { isHeic: detectedAsHeic, isAvif: detectedAsAvif } = await detectImageRealType(resolvedFilePath);
    // Override with explicit extension when present
    if (fileExtension === 'heic' || fileExtension === 'heif') detectedAsHeic = true;
    if (fileExtension === 'avif') { detectedAsAvif = true; detectedAsHeic = false; }

    // ── Metadata Mode ────────────────────────────────────────────────────────
    if (requestsMetadataOnly) {
        return await extractMediaFileMetadata(
            resolvedFilePath,
            normalizedPath,
            systemFileStats,
            fileExtension,
            detectedAsHeic,
            request.signal,
            forceRegenerate,
        );
    }

    // ── Thumbnail Mode ───────────────────────────────────────────────────────
    if (requestsThumbnailImage) {
        const thumbnailCachePath = await getThumbnailPath(resolvedFilePath, systemFileStats.mtimeMs);
        if (!fs.existsSync(thumbnailCachePath)) {
            const thumbnailGenerated = await generateThumbnail(
                resolvedFilePath, thumbnailCachePath, systemFileStats.mtimeMs, request.signal
            );
            if (!thumbnailGenerated) return new Response(null, { status: 204 });
        }
        return serveFileResponse(thumbnailCachePath, { 'Content-Type': 'image/webp', ...CACHE_IMMUTABLE });
    }

    // ── Streaming / Static Serve Mode ────────────────────────────────────────
    const mimeType   = detectedAsAvif ? 'image/avif' : getContentType('.' + fileExtension);
    const isVideo    = mimeType.startsWith('video/');
    const isAudio    = mimeType.startsWith('audio/');

    if (isVideo || isAudio) {
        return createByteRangeStreamResponse(
            resolvedFilePath,
            systemFileStats,
            mimeType,
            request.headers.get('range'),
            request.signal,
        );
    }

    return serveStaticImageResponse(
        resolvedFilePath,
        systemFileStats,
        mimeType,
        detectedAsHeic,
        request.signal,
        forceRegenerate,
    );
}, {
    path: 'required'
});

export const DELETE = defineHandler(async () => {
    if (fs.existsSync(THUMB_CACHE_DIR)) {
        await fsp.rm(THUMB_CACHE_DIR, { recursive: true, force: true });
        await fsp.mkdir(THUMB_CACHE_DIR, { recursive: true });
    }
    return { success: true };
});
