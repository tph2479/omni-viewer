/**
 * Ebook Service — file-level operations for EPUB, Archives (CBZ/ZIP), and PDF files.
 *
 * Responsibilities:
 *   - Metadata (type detection, page count for PDFs)
 *   - Cover/thumbnail generation and serving
 *   - Raw file serving with byte-range support
 *
 * For entry-level operations (individual archive pages / PDF virtual pages),
 * see archiveReader.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Stats } from 'node:fs';

import { isPdfFile, isEpubFile, isArchiveFile, getContentType } from '$lib/shared/utils/fileUtils';
import type { MediaType } from '$lib/client/stores/browser/types';
import { serveFileResponse, rangeStreamResponse, CACHE_IMMUTABLE, CACHE_SHORT } from '$lib/server/api/responseUtils';
import { getThumbnailPath } from '$lib/server/utils/heicConverter';
import { getPdfPageCount } from '$lib/server/services/ebook/pdfRenderer';
import { generateThumbnail } from '$lib/server/services/media/thumbnails';

// ─── Metadata ─────────────────────────────────────────────────────────────────

/**
 * Returns file-level metadata for an ebook (EPUB, Archive, or PDF).
 * For PDFs, includes `totalPages`.
 */
export async function getEbookMetadata(
    absolutePath: string,
    normalizedPath: string,
    stat: Stats,
) {
    const ext = path.extname(absolutePath).toLowerCase();

    let mediaType: MediaType = 'unknown';
    let totalPages = 0;

    if (isPdfFile(ext))       { mediaType = 'pdf'; totalPages = await getPdfPageCount(absolutePath); }
    else if (isEpubFile(ext)) { mediaType = 'epub'; }
    else if (isArchiveFile(ext))  { mediaType = 'archive'; }

    return {
        name:         path.basename(absolutePath),
        path:         normalizedPath,
        size:         stat.size,
        lastModified: stat.mtimeMs,
        mediaType,
        totalPages,
    };
}

// ─── Cover ────────────────────────────────────────────────────────────────────

/**
 * Generates (if needed) and returns a WebP cover/thumbnail Response for a
 * Archive, EPUB, or PDF file. Returns `null` if the file type is unsupported or
 * thumbnail generation fails.
 */
export async function buildEbookCoverResponse(
    absolutePath: string,
    stat: Stats,
    signal: AbortSignal,
): Promise<Response | null> {
    const ext = path.extname(absolutePath).toLowerCase();

    if (!isPdfFile(ext) && !isArchiveFile(ext) && !isEpubFile(ext)) return null;

    const thumbPath = getThumbnailPath(absolutePath, stat.mtimeMs);
    if (!fs.existsSync(thumbPath)) {
        const ok = await generateThumbnail(absolutePath, thumbPath, stat.mtimeMs, signal);
        if (!ok) return null;
    }
    return serveFileResponse(thumbPath, { 'Content-Type': 'image/webp', ...CACHE_IMMUTABLE });
}

// ─── Raw file serve ────────────────────────────────────────────────────────────

/**
 * Builds a byte-range-supporting HTTP Response that streams the raw ebook
 * file (PDF, EPUB, etc.) directly to the client.
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
