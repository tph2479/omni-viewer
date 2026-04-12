/**
 * Ebook service — serves EPUB, CBZ, and PDF files.
 * Handles metadata, cover extraction, archive entry extraction, and raw file serving.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import yauzl from 'yauzl-promise';
import sharp from 'sharp';

import { isPdfFile, isEpubFile, isCbzFile, getContentType, isImageFile } from '$lib/utils/fileUtils';
import type { MediaType } from '$lib/stores/browser/types';
import { serveFileResponse, rangeStreamResponse, CACHE_IMMUTABLE, CACHE_SHORT } from '$lib/server/api/responseUtils';
import { globalTaskSemaphore } from '../utils/semaphore';
import { isHeicBuffer, ensureThumbDir, getThumbnailPath } from './imageUtils';
import { renderPdfPage, getPdfPageCount } from '../pdf/pdfRenderer';
import { generateThumbnail } from './thumbnails';

import type { Stats } from 'node:fs';

// ─── Metadata ─────────────────────────────────────────────────────────────────

/**
 * Returns metadata for an ebook file.
 */
export async function getEbookMetadata(
    absolutePath: string,
    normalizedPath: string,
    stat: Stats,
) {
    const ext = path.extname(absolutePath).toLowerCase();
    
    let mediaType: MediaType = 'unknown';
    let totalPages = 0;

    if (isPdfFile(ext)) {
        mediaType = 'pdf';
        totalPages = await getPdfPageCount(absolutePath);
    }
    else if (isEpubFile(ext)) mediaType = 'epub';
    else if (isCbzFile(ext)) mediaType = 'cbz';
    
    return {
        name: path.basename(absolutePath),
        path: normalizedPath,
        size: stat.size,
        lastModified: stat.mtimeMs,
        mediaType,
        totalPages, // Important for PDFs
    };
}

// ─── Cover ────────────────────────────────────────────────────────────────────

/**
 * Extract and provide the cover image response for a CBZ, EPUB, or PDF file.
 */
export async function buildEbookCoverResponse(
    absolutePath: string,
    stat: Stats,
    signal: AbortSignal,
): Promise<Response | null> {
    const ext = path.extname(absolutePath).toLowerCase();

    // 1. Handle PDF covers (First page rendering)
    if (isPdfFile(ext)) {
        const thumbPath = getThumbnailPath(absolutePath, stat.mtimeMs);
        if (!fs.existsSync(thumbPath)) {
            const ok = await generateThumbnail(absolutePath, thumbPath, stat.mtimeMs, signal);
            if (!ok) return null;
        }
        return serveFileResponse(thumbPath, {
            'Content-Type': 'image/webp',
            ...CACHE_IMMUTABLE,
        });
    }

    // 2. Handle Archive covers (CBZ, EPUB)
    if (isCbzFile(ext) || isEpubFile(ext)) {
        const thumbPath = await getArchiveCover(absolutePath, stat.mtimeMs, signal);
        if (!thumbPath) return null;

        return serveFileResponse(thumbPath, {
            'Content-Type': 'image/webp',
            ...CACHE_IMMUTABLE,
        });
    }

    return null;
}

// ─── Archive / Virtual Entry ──────────────────────────────────────────────────

/**
 * Builds a response for a single file inside an archive (CBZ/ZIP)
 * OR a virtual page inside a PDF.
 */
export async function buildArchiveEntryResponse(
    absolutePath: string,
    internalPath: string,
): Promise<Response> {
    const ext = path.extname(absolutePath).toLowerCase();

    // 1. Handle PDF Virtual Page Extraction
    if (isPdfFile(ext)) {
        const pageNum = parseInt(internalPath, 10);
        if (isNaN(pageNum)) throw new Error('Invalid PDF page number');
        
        const buffer = await renderPdfPage(absolutePath, pageNum, 1200); // Higher res for viewing
        return new Response(new Uint8Array(buffer), {
            headers: {
                'Content-Type': 'image/png',
                ...CACHE_SHORT,
            },
        });
    }

    // 2. Handle Real Archive Extraction (CBZ/EPUB)
    const stream = await extractFileFromArchive(absolutePath, internalPath);
    const contentType = getContentType(path.extname(internalPath).toLowerCase());
    // @ts-ignore — Node stream → Web stream
    return new Response(Readable.toWeb(stream) as any, {
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
        },
    });
}

// ─── Raw file serve ────────────────────────────────────────────────────────────

/**
 * Builds a range-supporting response for a raw ebook file.
 */
export function buildEbookFileResponse(
    absolutePath: string,
    stat: Stats,
    range: string | null,
    signal: AbortSignal,
): Response {
    const ext = path.extname(absolutePath).toLowerCase();
    const baseHeaders: Record<string, string> = {
        'Content-Type': getContentType(ext),
        'Accept-Ranges': 'bytes',
        ...CACHE_SHORT,
    };
    return rangeStreamResponse(absolutePath, stat, range, baseHeaders, signal);
}

// ─── Archive extraction tools ──────────────────────────────────────────────────

export async function getArchiveCover(
  archivePath: string,
  mtimeMs: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const thumbPath = getThumbnailPath(archivePath, mtimeMs, "-cover");

  if (fs.existsSync(thumbPath)) return thumbPath;

  return await globalTaskSemaphore.run(async () => {
    if (signal?.aborted) return null;

    let zip: any = null;
    try {
      zip = await yauzl.open(archivePath);
      let firstEntry: any = null;
      let coverEntry: any = null;
      const isEpub = archivePath.toLowerCase().endsWith('.epub');

      for await (const entry of zip) {
        if (signal?.aborted) {
          await zip.close();
          return null;
        }
        if (entry.filename.endsWith("/")) continue;
        
        const ext = path.extname(entry.filename).toLowerCase();
        if (isImageFile(ext)) {
          if (!firstEntry) firstEntry = entry;
          
          if (isEpub) {
            if (entry.filename.toLowerCase().includes('cover')) {
              coverEntry = entry;
              break;
            }
          } else {
            break;
          }
        }
      }

      const targetEntry = isEpub ? (coverEntry || firstEntry) : firstEntry;

      if (!targetEntry) {
        await zip.close();
        return null;
      }

      if (signal?.aborted) {
        await zip.close();
        return null;
      }

      const stream = await targetEntry.openReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        if (signal?.aborted) {
          stream.destroy();
          await zip.close();
          return null;
        }
        chunks.push(chunk);
      }
      await zip.close();

      const buffer = Buffer.concat(chunks);
      let sharpInput: any = buffer;

      if (isHeicBuffer(buffer)) {
        try {
          const heicImport = await import("heic-convert");
          const heicConvert = (heicImport.default || heicImport) as any;
          let converted: any = await heicConvert({
            buffer,
            format: "JPEG",
            quality: 0.6,
          });
          sharpInput = Buffer.from(converted);
        } catch (err) {
          console.error("[Archive Cover] HEIC conversion failed:", err);
        }
      }

      ensureThumbDir();
      await sharp(sharpInput)
        .rotate()
        .resize(200, 200, { fit: "cover", fastShrinkOnLoad: true })
        .webp({ quality: 65, effort: 0 })
        .toFile(thumbPath);

      return thumbPath;
    } catch (e) {
      if (zip) await zip.close().catch(() => {});
      console.error("[Archive Cover Error]:", e);
      return null;
    }
  }, signal);
}

export async function extractFileFromArchive(
  archivePath: string,
  internalPath: string,
): Promise<NodeJS.ReadableStream> {
  const zip = await yauzl.open(archivePath);
  try {
    let entry: any = null;
    for await (const e of zip) {
      if (e.filename === internalPath) {
        entry = e;
        break;
      }
    }

    if (!entry) {
      await zip.close();
      throw new Error(`Entry ${internalPath} not found in archive`);
    }

    if (entry.isEncrypted && entry.isEncrypted()) {
      await zip.close().catch(() => {});
      throw new Error(`Entry ${internalPath} is encrypted and decryption is not supported.`);
    }

    const stream = await entry.openReadStream();
    stream.on("end", () => zip.close().catch(() => {}));
    stream.on("error", () => zip.close().catch(() => {}));

    return stream;
  } catch (err: any) {
    await zip.close().catch(() => {});
    throw err;
  }
}
