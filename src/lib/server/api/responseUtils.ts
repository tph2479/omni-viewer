import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { Stats } from 'node:fs';

/**
 * Serve a file from disk using Bun's fast file API when available,
 * falling back to Node's `fs.readFile`.
 *
 * Use this for small-to-medium cached files (thumbnails, covers) where
 * range-streaming isn't needed.
 */
export async function serveFileResponse(
    filePath: string,
    headers: Record<string, string>,
): Promise<Response> {
    // @ts-ignore — Bun exposes a faster file object
    if ((globalThis as any).Bun) {
        return new Response((globalThis as any).Bun.file(filePath), { headers });
    }
    return new Response(new Uint8Array(await fsp.readFile(filePath)), { headers });
}

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
const SHORT_CACHE = 'public, max-age=86400';

/** Standard headers for an immutable cached asset (thumbnails, covers). */
export const CACHE_IMMUTABLE = { 'Cache-Control': IMMUTABLE_CACHE } as const;
/** Standard headers for a short-lived cached asset (served files). */
export const CACHE_SHORT = { 'Cache-Control': SHORT_CACHE } as const;

/**
 * RFC 7233 byte-range streaming response.
 *
 * Handles both partial (206) and full (200) serving of a local file.
 * Listens to `signal` to destroy the underlying stream when the client
 * disconnects.
 *
 * @param absolutePath  Absolute path to the file on disk.
 * @param stat          `fs.Stats` for the file (provides `size`).
 * @param range         Value of the `Range` HTTP header, or `null`.
 * @param baseHeaders   Headers to include on every response (e.g. Content-Type, Cache-Control).
 * @param signal        AbortSignal from the request; used to clean up the stream.
 */
export function rangeStreamResponse(
    absolutePath: string,
    stat: Stats,
    range: string | null,
    baseHeaders: Record<string, string>,
    signal: AbortSignal,
): Response {
    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

        if (start >= stat.size) {
            return new Response(null, {
                status: 416,
                headers: { 'Content-Range': `bytes */${stat.size}` },
            });
        }
        if (end >= stat.size) end = stat.size - 1;

        const fileStream = fs.createReadStream(absolutePath, { start, end });
        signal.addEventListener('abort', () => fileStream.destroy(), { once: true });

        return new Response(Readable.toWeb(fileStream) as any, {
            status: 206,
            headers: {
                ...baseHeaders,
                'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                'Content-Length': (end - start + 1).toString(),
            },
        });
    }

    const fileStream = fs.createReadStream(absolutePath);
    signal.addEventListener('abort', () => fileStream.destroy(), { once: true });

    return new Response(Readable.toWeb(fileStream) as any, {
        headers: {
            ...baseHeaders,
            'Content-Length': stat.size.toString(),
        },
    });
}
