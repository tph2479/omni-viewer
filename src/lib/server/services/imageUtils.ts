import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createHash } from 'node:crypto';
import yauzl from 'yauzl-promise';
import sharp from 'sharp';

import { globalTaskSemaphore } from '../utils/semaphore';

export const THUMB_CACHE_DIR = path.resolve('.thumbnails');
export function ensureThumbDir() {
    if (!fs.existsSync(THUMB_CACHE_DIR)) {
        fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
    }
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'mif2', 'msf1', 'msf2', 'heis', 'hevm']);
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'mif2', 'msf1', 'msf2', 'heis', 'hevm']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

const ongoingGenerations = new Map<string, Promise<any>>();

export function isHeicBuffer(buf: Buffer): boolean {
    if (buf.length < 12) return false;
    if (isAvifBuffer(buf)) return false;
    if (buf[0] !== 0x00 || buf[1] !== 0x00 || buf[2] !== 0x00) {
        if (!(buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00)) return false;
    }
    const ftyp = buf.slice(4, 8).toString('ascii');
    if (ftyp !== 'ftyp') return false;
    const brand = buf.slice(8, 12).toString('ascii').trim().toLowerCase();
    // In original code there was a console.log here which I'm preserving if intended, or removing.
    // console.log("[Detection] Brand:", brand);
    return HEIC_BRANDS.has(brand);
}

export function isHeifBuffer(buf: Buffer): boolean {
    if (buf.length < 12) return false;
    if (isAvifBuffer(buf)) return false;
    if (buf[0] !== 0x00 || buf[1] !== 0x00 || buf[2] !== 0x00) {
        if (!(buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00)) return false;
    }
    const ftyp = buf.slice(4, 8).toString('ascii');
    if (ftyp !== 'ftyp') return false;
    const brand = buf.slice(8, 12).toString('ascii').trim().toLowerCase();
    return HEIF_BRANDS.has(brand);
}

export function isAvifBuffer(buf: Buffer): boolean {
    if (buf.length < 12) return false;
    if (buf[0] !== 0x00 || buf[1] !== 0x00 || buf[2] !== 0x00) {
        if (!(buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00)) return false;
    }
    const ftyp = buf.slice(4, 8).toString('ascii');
    if (ftyp !== 'ftyp') return false;

    const majorBrand = buf.slice(8, 12).toString('ascii').trim().toLowerCase();
    if (AVIF_BRANDS.has(majorBrand)) return true;

    const boxSize = buf.readUInt32BE(0);
    const maxScan = Math.min(boxSize, buf.length);
    for (let i = 16; i + 4 <= maxScan; i += 4) {
        const brand = buf.slice(i, i + 4).toString('ascii').trim().toLowerCase();
        if (AVIF_BRANDS.has(brand)) return true;
    }

    return false;
}

export function getThumbnailPath(inputPath: string, mtimeMs: number, suffix = '') {
    const hash = createHash('md5').update(`${inputPath}-${mtimeMs}${suffix}`).digest('hex');
    return path.join(THUMB_CACHE_DIR, `${hash}.webp`);
}

export async function ensureHeicConverted(
    inputPath: string,
    mtimeMs: number,
    signalForWait?: AbortSignal,
    forceRegenerate = false,
): Promise<string> {
    const hash = createHash('md5').update(`${inputPath}-${mtimeMs}-full`).digest('hex');
    const outputPath = path.join(THUMB_CACHE_DIR, `full-${hash}.webp`);

    if (forceRegenerate) {
        try { fs.unlinkSync(outputPath); } catch (e) {}
    }

    if (ongoingGenerations.has(outputPath)) {
        await ongoingGenerations.get(outputPath);
        if (fs.existsSync(outputPath)) return outputPath;
    }

    if (fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        if (stat.size > 128) return outputPath;
        try { fs.unlinkSync(outputPath); } catch (e) {}
    }

    const conversionPromise = (async () => {
        try {
            return await globalTaskSemaphore.run(async () => {
                if (signalForWait?.aborted) return;
                if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 128) return;

                let fullBuffer: Buffer;
                if (inputPath.includes('::')) {
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
                } catch (sharpErr) {
                    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) {}
                    const heicImport = await import('heic-convert');
                    const heicConvert = (heicImport.default || heicImport) as any;
                    let converted: any = await heicConvert({ buffer: fullBuffer, format: 'JPEG', quality: 0.9 });
                    (fullBuffer as any) = null;
                    if (Array.isArray(converted)) converted = converted[0].data;
                    ensureThumbDir();
                    await sharp(Buffer.from(converted)).rotate().webp({ quality: 85, effort: 4 }).toFile(outputPath);
                    (converted as any) = null;
                }

                if (mtimeMs) {
                    const atime = Date.now() / 1000;
                    const mtime = mtimeMs / 1000;
                    await fsp.utimes(outputPath, atime, mtime).catch(() => {});
                }
            }, signalForWait);
        } catch (err) {
            if (err instanceof Error && err.message === 'Aborted') return;
            console.error(`[Conversion Error]`, err);
            throw err;
        }
    })();

    ongoingGenerations.set(outputPath, conversionPromise);
    try { await conversionPromise; } finally { ongoingGenerations.delete(outputPath); }
    return outputPath;
}
