/**
 * Archive Reader — extracts entries from zip-based archives (Archives, EPUB, ZIP)
 * and builds HTTP Responses for individual archive entries or PDF virtual pages.
 *
 * Responsibilities:
 *   - Low-level zip entry streaming via yauzl
 *   - HTTP Response construction for `GET /api/ebook?path=...::internalPath`
 *   - PDF page rendering (delegated to pdfRenderer)
 */
import path from 'node:path';
import { Readable } from 'node:stream';
import yauzl from 'yauzl-promise';

import { isPdfFile, getContentType } from '$lib/shared/utils/fileUtils';
import { CACHE_SHORT } from '$lib/server/api/responseUtils';
import { renderPdfPage } from '$lib/server/services/ebook/pdfRenderer';

// ─── Low-level archive extraction ────────────────────────────────────────────

/**
 * Opens a zip/archive/EPUB and returns a readable stream for the
 * specified internal entry. The zip handle is closed automatically when
 * the stream ends or errors.
 */
export async function extractFileFromArchive(
    archivePath: string,
    internalPath: string,
): Promise<NodeJS.ReadableStream> {
    const zip = await yauzl.open(archivePath);
    try {
        let entry: any = null;
        for await (const e of zip) {
            if (e.filename === internalPath) { entry = e; break; }
        }

        if (!entry) {
            await zip.close();
            throw new Error(`Entry "${internalPath}" not found in archive`);
        }

        if (entry.isEncrypted?.()) {
            await zip.close();
            throw new Error(`Entry "${internalPath}" is encrypted — decryption is not supported`);
        }

        const stream = await entry.openReadStream();
        stream.on('end',   () => zip.close().catch(() => {}));
        stream.on('error', () => zip.close().catch(() => {}));
        return stream;
    } catch (err) {
        await zip.close().catch(() => {});
        throw err;
    }
}

// ─── HTTP Response builder ────────────────────────────────────────────────────

/**
 * Builds an HTTP Response for a single entry inside an ebook/archive:
 *   - PDF  → renders the page number given in `internalPath` to PNG
 *   - Archive/EPUB/ZIP → streams the raw entry bytes
 */
export async function buildArchiveEntryResponse(
    absolutePath: string,
    internalPath: string,
): Promise<Response> {
    const ext = path.extname(absolutePath).toLowerCase();

    // 1. Virtual PDF page
    if (isPdfFile(ext)) {
        const pageNum = parseInt(internalPath, 10);
        if (isNaN(pageNum)) throw new Error('Invalid PDF page number');

        const buffer = await renderPdfPage(absolutePath, pageNum, 1200);
        return new Response(new Uint8Array(buffer), {
            headers: { 'Content-Type': 'image/png', ...CACHE_SHORT },
        });
    }

    // 2. Real archive entry (Archive/EPUB/ZIP)
    const stream      = await extractFileFromArchive(absolutePath, internalPath);
    const contentType = getContentType(path.extname(internalPath).toLowerCase());
    // @ts-ignore — Node Readable → Web ReadableStream
    return new Response(Readable.toWeb(stream) as any, {
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
        },
    });
}
