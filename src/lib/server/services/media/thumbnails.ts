/**
 * Thumbnail Generator — public entry point for creating WebP thumbnails
 * from any supported media type.
 *
 * Dispatches to the appropriate extractor based on file extension:
 *   - Video/Audio  → thumbnailExtractors (frame/cover extraction)
 *   - PDF          → ebook/pdfRenderer (page render to PNG, then WebP)
 *   - Archive/EPUB → thumbnailExtractors (archive cover extraction)
 *   - Image        → sharp (including HEIC/HEIF conversion)
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import {
    isHeifBuffer,
    isAvifBuffer,
} from '$lib/server/utils/mediaSniffer';
import {
    THUMB_CACHE_DIR,
    ensureThumbDir,
    ensureHeicConverted,
} from '$lib/server/utils/heicConverter';
import { globalTaskSemaphore } from '$lib/server/utils/semaphore';
import { isVideoFile, isAudioFile, isImageFile, isPdfFile, isArchiveFile, isEpubFile } from '$lib/shared/utils/fileUtils';
import { renderPdfPage } from '$lib/server/services/ebook/pdfRenderer';
import {
    extractVideoFrame,
    extractAudioCover,
    extractArchiveCoverThumb,
} from '$lib/server/services/media/thumbnailExtractors';

// ─── De-duplicate in-flight requests for the same output path ────────────────

const ongoingGenerations = new Map<string, Promise<boolean>>();

// ─── Shared sharp pipeline ────────────────────────────────────────────────────

/**
 * EXIF-rotate → cover-crop 200×200 → save as WebP.
 * Used by every source type so quality and size are consistent.
 */
export async function saveThumbWebp(input: Buffer | string, outputPath: string): Promise<void> {
    ensureThumbDir();
    await sharp(input)
        .rotate()
        .resize(200, 200, { fit: 'cover', fastShrinkOnLoad: true })
        .webp({ quality: 65, effort: 0 })
        .toFile(outputPath);
}

// ─── Per-type extractors (image + PDF, local to thumbnails) ──────────────────

/** Renders the first page of a PDF as a WebP thumbnail. */
async function renderPdfThumb(inputPath: string, outputPath: string): Promise<boolean> {
    const buf = await renderPdfPage(inputPath, 1, 250);
    await saveThumbWebp(buf, outputPath);
    return true;
}

/**
 * Renders an image file (including HEIC/HEIF) as a WebP thumbnail.
 * Also handles archive image paths (`archive.zip::page.jpg`).
 */
async function renderImageThumb(
    inputPath: string,
    outputPath: string,
    mtimeMs: number,
    signal?: AbortSignal,
): Promise<boolean> {
    let sharpInput: string | Buffer = inputPath;

    if (inputPath.includes('::')) {
        // Archive path — ensureHeicConverted handles extraction internally
        sharpInput = await ensureHeicConverted(inputPath, mtimeMs, signal);
    } else {
        const lowerPath = inputPath.toLowerCase();
        let isHeif = lowerPath.endsWith('.heic') || lowerPath.endsWith('.heif');

        // Sniff magic bytes for HEIF containers with unexpected extensions
        if (!isHeif && isImageFile(inputPath)) {
            try {
                const header = Buffer.alloc(256);
                const fd = fs.openSync(inputPath, 'r');
                fs.readSync(fd, header, 0, 256, 0);
                fs.closeSync(fd);
                isHeif = isHeifBuffer(header) && !isAvifBuffer(header);
            } catch { /* non-fatal */ }
        }

        if (isHeif) {
            sharpInput = await ensureHeicConverted(inputPath, mtimeMs, signal);
        }
    }

    if (signal?.aborted) return false;

    try {
        await saveThumbWebp(sharpInput, outputPath);
    } catch (err) {
        console.error('[Sharp Thumb Error]', err);
        // Partial writes may still be usable — only rethrow if nothing was written
        if (!fs.existsSync(outputPath)) throw err;
    }

    return true;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates a WebP thumbnail for any supported media file and writes it to
 * `outputPath`. In-flight requests for the same `outputPath` are deduplicated.
 *
 * @returns `true` on success, `false` if generation failed or was aborted.
 */
export async function generateThumbnail(
    inputPath: string,
    outputPath: string,
    mtimeMs: number,
    signal?: AbortSignal,
): Promise<boolean> {
    const existing = ongoingGenerations.get(outputPath);
    if (existing) return existing;

    const work = _generate(inputPath, outputPath, mtimeMs, signal);
    ongoingGenerations.set(outputPath, work);
    try {
        return await work;
    } finally {
        ongoingGenerations.delete(outputPath);
    }
}

async function _generate(
    inputPath: string,
    outputPath: string,
    mtimeMs: number,
    signal?: AbortSignal,
): Promise<boolean> {
    if (signal?.aborted) return false;

    const ext = path.extname(inputPath).toLowerCase();

    try {
        let ok: boolean;

        if (isVideoFile(ext)) {
            ok = await globalTaskSemaphore.run(async () => {
                if (signal?.aborted) return false;
                return extractVideoFrame(inputPath, outputPath, saveThumbWebp, signal);
            });
        } else if (isAudioFile(ext)) {
            ok = await globalTaskSemaphore.run(async () => {
                if (signal?.aborted) return false;
                return extractAudioCover(inputPath, outputPath, saveThumbWebp, signal);
            });
        } else if (isPdfFile(ext)) {
            ok = await globalTaskSemaphore.run(async () => {
                if (signal?.aborted) return false;
                return renderPdfThumb(inputPath, outputPath);
            });
        } else if (isArchiveFile(ext) || isEpubFile(ext)) {
            ok = await globalTaskSemaphore.run(async () => {
                if (signal?.aborted) return false;
                return extractArchiveCoverThumb(inputPath, outputPath, saveThumbWebp, signal);
            });
        } else {
            ok = await renderImageThumb(inputPath, outputPath, mtimeMs, signal);
        }

        if (!ok || signal?.aborted) return false;

        // Stamp the output file with the source's mtime so cache invalidation works
        if (mtimeMs) {
            await fsp.utimes(outputPath, Date.now() / 1000, mtimeMs / 1000).catch(() => {});
        }

        return true;
    } catch (err) {
        if (err instanceof Error && err.message === 'Aborted') return false;
        console.error(`[Thumbnail Error] ${inputPath}:`, err);
        return false;
    }
}
