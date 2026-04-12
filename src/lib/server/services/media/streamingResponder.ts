/**
 * Streaming Responder — constructs HTTP Responses that serve media bytes to the browser.
 * Handles both static images and RFC 7233 byte-range streaming for video/audio.
 * This is the only layer that touches the HTTP Response object for media serving.
 * Future extension: plug in FFmpeg transcoding here for unsupported video codecs.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { Stats } from 'node:fs';

import { ensureHeicConverted } from '$lib/server/utils/heicConverter';
import { rangeStreamResponse, CACHE_SHORT } from '$lib/server/api/responseUtils';

// ─── Static Image Serving ────────────────────────────────────────────────────

/**
 * Builds a streaming Response for a static image file.
 * When the image is HEIC/HEIF format, converts it transparently to WebP on the fly
 * using the cache-backed `ensureHeicConverted` helper.
 *
 * @param absolutePath   Absolute path to the source image on disk.
 * @param systemFileStats  Pre-fetched Stats for the file.
 * @param contentType    MIME type to advertise (overridden to image/webp on HEIC conversion).
 * @param isHeicFormat   True when the source format is HEIC/HEIF.
 * @param abortSignal    Request's AbortSignal; used to clean up the stream on disconnect.
 * @param forceRegenerate  When true, bypasses the HEIC conversion cache and regenerates.
 */
export async function serveStaticImageResponse(
    absolutePath: string,
    systemFileStats: Stats,
    contentType: string,
    isHeicFormat: boolean,
    abortSignal: AbortSignal,
    forceRegenerate: boolean,
): Promise<Response> {
    let targetFilePath = absolutePath;
    let targetFileStats = systemFileStats;
    let targetContentType = contentType;

    if (isHeicFormat) {
        targetFilePath    = await ensureHeicConverted(absolutePath, systemFileStats.mtimeMs, abortSignal, forceRegenerate);
        targetFileStats   = await fsp.stat(targetFilePath);
        targetContentType = 'image/webp';
    }

    const readStream = fs.createReadStream(targetFilePath);
    abortSignal.addEventListener('abort', () => readStream.destroy(), { once: true });

    return new Response(Readable.toWeb(readStream) as any, {
        headers: {
            'Content-Type': targetContentType,
            ...CACHE_SHORT,
            'Content-Length': targetFileStats.size.toString(),
        },
    });
}

// ─── Byte-Range Streaming for Video/Audio ────────────────────────────────────

/**
 * Builds a byte-range-aware streaming Response for video and audio files.
 * Conforms to RFC 7233 — the browser's media player will use Range requests
 * to support seeking, buffering, and resumable playback.
 *
 * @param absolutePath       Absolute path to the media file.
 * @param systemFileStats    Pre-fetched Stats for the file.
 * @param contentType        MIME type (e.g. "video/mp4", "audio/flac").
 * @param requestRangeHeader Value of the `Range` request header, or null for full file.
 * @param abortSignal        Request's AbortSignal; used to clean up the stream on disconnect.
 */
export function createByteRangeStreamResponse(
    absolutePath: string,
    systemFileStats: Stats,
    contentType: string,
    requestRangeHeader: string | null,
    abortSignal: AbortSignal,
): Response {
    const isVideoContent = contentType.startsWith('video/');

    const streamingHeaders: Record<string, string> = {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff',
        // Videos use cache-validation headers; audio benefits from a short cache
        ...(isVideoContent
            ? {
                ETag: `"${systemFileStats.mtimeMs.toString(16)}-${systemFileStats.size.toString(16)}"`,
                'Cache-Control': 'no-cache',
                'Last-Modified': new Date(systemFileStats.mtimeMs).toUTCString(),
            }
            : CACHE_SHORT
        ),
    };

    return rangeStreamResponse(absolutePath, systemFileStats, requestRangeHeader, streamingHeaders, abortSignal);
}
