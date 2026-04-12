import fsp from 'node:fs/promises';
import { createApiHandler } from '$lib/server/api/handler';
import {
    getEbookMetadata,
    buildEbookCoverResponse,
    buildArchiveEntryResponse,
    buildEbookFileResponse,
} from '$lib/server/services/ebook';

export const GET = createApiHandler(async ({ absolutePath, internalPath, isArchivePath, normalizedPath, url, request }) => {
    const isCover = url.searchParams.get('cover') === 'true';
    const isThumbnail = url.searchParams.get('thumbnail') === 'true';
    const getMetadataOnly = url.searchParams.get('metadata') === 'true';

    const stat = await fsp.stat(absolutePath);

    // 1. Metadata Mode
    if (getMetadataOnly) {
        return await getEbookMetadata(absolutePath, normalizedPath, stat);
    }

    // 2. Cover / Thumbnail Mode
    if (isCover || isThumbnail) {
        const res = await buildEbookCoverResponse(absolutePath, stat, request.signal);
        if (res) return res;
        return new Response(null, { status: 204 });
    }

    // 3. Virtual Archive Entry (PDF Pages) or Real Archive Entry (CBZ/EPUB)
    if ((isArchivePath || absolutePath.toLowerCase().endsWith('.pdf')) && internalPath) {
        return await buildArchiveEntryResponse(absolutePath, internalPath);
    }

    // 4. Default: Serve the raw file (PDF, EPUB)
    return buildEbookFileResponse(absolutePath, stat, request.headers.get('range'), request.signal);
}, {
    path: 'required'
});
