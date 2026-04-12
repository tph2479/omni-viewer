import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createHash } from 'node:crypto';
import yauzl from 'yauzl-promise';
import sharp from 'sharp';

import { globalTaskSemaphore } from './semaphore';

// ─── Thumbnail cache ──────────────────────────────────────────────────────────

export const THUMB_CACHE_DIR = path.resolve('.thumbnails');

export function ensureThumbDir(): void {
    // mkdirSync with recursive:true is a no-op when the directory already exists.
    fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
}

/**
 * Returns the deterministic WebP cache path for a given source file + mtime.
 * The `suffix` parameter allows producing distinct paths for the same file
 * (e.g. full-size conversion vs. thumbnail).
 */
export function getThumbnailPath(inputPath: string, mtimeMs: number, suffix = ''): string {
    const hash = createHash('md5').update(`${inputPath}-${mtimeMs}${suffix}`).digest('hex');
    return path.join(THUMB_CACHE_DIR, `${hash}.webp`);
}

// ─── HEIC/HEIF → WebP on-the-fly conversion ──────────────────────────────────

const ongoingConversions = new Map<string, Promise<any>>();

/**
 * Converts a HEIC/HEIF file (or an archive entry containing one) to WebP and
 * caches the result. Subsequent calls for the same path hit the cache immediately.
 *
 * Supports archive paths (`archive.zip::image.heic`) via yauzl extraction.
 *
 * @param inputPath       Absolute path, or `"zipPath::internalPath"` for archive entries.
 * @param mtimeMs         Source file mtime used for cache-key and mtime-stamping.
 * @param signalForWait   AbortSignal — queued conversions are dropped on abort.
 * @param forceRegenerate When true, deletes any existing cached output before converting.
 * @returns Absolute path to the converted WebP file.
 */
export async function ensureHeicConverted(
    inputPath: string,
    mtimeMs: number,
    signalForWait?: AbortSignal,
    forceRegenerate = false,
): Promise<string> {
    const hash       = createHash('md5').update(`${inputPath}-${mtimeMs}-full`).digest('hex');
    const outputPath = path.join(THUMB_CACHE_DIR, `full-${hash}.webp`);

    if (forceRegenerate) {
        try { fs.unlinkSync(outputPath); } catch { /* non-fatal */ }
    }

    // If another request is already converting the same file, wait for it.
    if (ongoingConversions.has(outputPath)) {
        await ongoingConversions.get(outputPath);
        if (fs.existsSync(outputPath)) return outputPath;
    }

    // Cache hit — skip suspiciously small files (partial writes)
    if (fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        if (stat.size > 128) return outputPath;
        try { fs.unlinkSync(outputPath); } catch { /* non-fatal */ }
    }

    const conversionPromise = (async () => {
        try {
            return await globalTaskSemaphore.run(async () => {
                if (signalForWait?.aborted) return;
                if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 128) return;

                let fullBuffer: Buffer;

                if (inputPath.includes('::')) {
                    // Archive entry path — extract entry bytes first
                    const [zipPath, internalPath] = inputPath.split('::');
                    const zip = await yauzl.open(path.resolve(zipPath));
                    try {
                        let entry: any = null;
                        for await (const e of zip) {
                            if (e.filename === internalPath) { entry = e; break; }
                        }
                        if (!entry) throw new Error(`Entry ${internalPath} not found in zip`);
                        const nodeStream = await entry.openReadStream();
                        const chunks: Buffer[] = [];
                        for await (const chunk of nodeStream) chunks.push(chunk);
                        fullBuffer = Buffer.concat(chunks);
                    } finally {
                        await zip.close();
                    }
                } else {
                    fullBuffer = await fsp.readFile(inputPath);
                }

                try {
                    ensureThumbDir();
                    await sharp(fullBuffer).rotate().webp({ quality: 85, effort: 4 }).toFile(outputPath);
                    (fullBuffer as any) = null;
                } catch {
                    // Sharp failed (likely true HEIC) — fall back to heic-convert
                    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch { /* non-fatal */ }
                    const heicImport  = await import('heic-convert');
                    const heicConvert = (heicImport.default || heicImport) as any;
                    let converted: any = await heicConvert({ buffer: fullBuffer, format: 'JPEG', quality: 0.9 });
                    (fullBuffer as any) = null;
                    if (Array.isArray(converted)) converted = converted[0].data;
                    ensureThumbDir();
                    await sharp(Buffer.from(converted)).rotate().webp({ quality: 85, effort: 4 }).toFile(outputPath);
                    (converted as any) = null;
                }

                if (mtimeMs) {
                    await fsp.utimes(outputPath, Date.now() / 1000, mtimeMs / 1000).catch(() => {});
                }
            }, signalForWait);
        } catch (err) {
            if (err instanceof Error && err.message === 'Aborted') return;
            console.error('[HEIC Conversion Error]', err);
            throw err;
        }
    })();

    ongoingConversions.set(outputPath, conversionPromise);
    try { await conversionPromise; } finally { ongoingConversions.delete(outputPath); }
    return outputPath;
}

// Re-export buffer helpers so existing callers that import them from here keep working.
// Prefer importing directly from fileDetection.ts in new code.
export { isHeicBuffer, isHeifBuffer, isAvifBuffer } from '$lib/server/utils/mediaSniffer';
