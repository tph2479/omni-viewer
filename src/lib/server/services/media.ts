/**
 * Media service — serves images, audio, and video files.
 * Handles metadata extraction, HEIC conversion, and byte-range streaming.
 */
import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';

import { isImageFile } from '$lib/utils/fileUtils';
import { ensureHeicConverted } from '$lib/server/services/imageUtils';
import { rangeStreamResponse } from '../../../routes/api/_shared/responseUtils';

import type { Stats } from 'node:fs';

// ─── Metadata ─────────────────────────────────────────────────────────────────

/**
 * Return image dimensions and basic file info as JSON.
 * Width/height are only populated for image files (including HEIC after conversion).
 */
export async function getMediaMetadata(
    absolutePath: string,
    normalizedPath: string,
    stat: Stats,
    ext: string,
    isHeic: boolean,
    signal: AbortSignal,
    isRetry: boolean,
) {
    let width = 0;
    let height = 0;

    if (isImageFile(ext) || isHeic) {
        try {
            const metaPath = isHeic
                ? await ensureHeicConverted(absolutePath, stat.mtimeMs, signal, isRetry)
                : absolutePath;
            const meta = await sharp(metaPath).metadata();
            width = meta.width ?? 0;
            height = meta.height ?? 0;
            // EXIF orientation ≥ 5 means the image is rotated 90°/270°
            if (meta.orientation && meta.orientation >= 5) [width, height] = [height, width];
        } catch { /* non-fatal */ }
    }

    return json({
        name: path.basename(absolutePath),
        path: normalizedPath,
        size: stat.size,
        lastModified: stat.mtimeMs,
        width,
        height,
    });
}

// ─── Image ────────────────────────────────────────────────────────────────────

/**
 * Stream a single image file to the client.
 * Transparently converts HEIC/HEIF to WebP on the fly.
 */
export async function serveMediaImage(
    absolutePath: string,
    stat: Stats,
    contentType: string,
    isHeic: boolean,
    signal: AbortSignal,
    isRetry: boolean,
): Promise<Response> {
    let servePath = absolutePath;
    let serveStat = stat;
    let finalContentType = contentType;

    if (isHeic) {
        servePath = await ensureHeicConverted(absolutePath, stat.mtimeMs, signal, isRetry);
        serveStat = await fsp.stat(servePath);
        finalContentType = 'image/webp';
    }

    const fileStream = fs.createReadStream(servePath);
    signal.addEventListener('abort', () => fileStream.destroy(), { once: true });

    return new Response(Readable.toWeb(fileStream) as any, {
        headers: {
            'Content-Type': finalContentType,
            'Cache-Control': 'public, max-age=86400',
            'Content-Length': serveStat.size.toString(),
        },
    });
}

// ─── Stream ───────────────────────────────────────────────────────────────────

/**
 * Stream a video or audio file with full RFC 7233 byte-range support.
 * Videos get ETag + no-cache headers for accurate seeking; audio gets a short cache.
 */
export function streamMedia(
    absolutePath: string,
    stat: Stats,
    contentType: string,
    range: string | null,
    signal: AbortSignal,
): Response {
    const isVideo = contentType.startsWith('video/');
    const baseHeaders: Record<string, string> = {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff',
        ...(isVideo
            ? {
                  ETag: `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`,
                  'Cache-Control': 'no-cache',
                  'Last-Modified': new Date(stat.mtimeMs).toUTCString(),
              }
            : { 'Cache-Control': 'public, max-age=86400' }),
    };
    return rangeStreamResponse(absolutePath, stat, range, baseHeaders, signal);
}
