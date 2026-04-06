import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { decodePath, resolvePath } from '../_shared/pathUtils';

import {
    getEbookMetadata,
    getEbookCover,
    serveArchiveEntry,
    serveEbookFile,
} from '$lib/server/services/ebook';

export async function GET({ url, request }: RequestEvent) {
    try {
        const filePathParam = url.searchParams.get('path');
        const isCover = url.searchParams.get('cover') === 'true';
        const isThumbnail = url.searchParams.get('thumbnail') === 'true';
        const getMetadataOnly = url.searchParams.get('metadata') === 'true';

        if (!filePathParam) throw error(400, 'Missing path');

        const { absolutePath, internalPath, isArchivePath, normalizedPath } = resolvePath(
            decodePath(filePathParam),
        );

        if (!fs.existsSync(absolutePath)) throw error(404, 'File not found');
        const stat = await fsp.stat(absolutePath);

        if (getMetadataOnly) {
            return getEbookMetadata(absolutePath, normalizedPath, stat);
        }

        if (isCover || isThumbnail) {
            const res = await getEbookCover(absolutePath, stat, request.signal);
            if (res) return res;
            // E.g. PDF covers aren't supported via this endpoint, return 204
            return new Response(null, { status: 204 });
        }

        if (isArchivePath && internalPath) {
            return serveArchiveEntry(absolutePath, internalPath);
        }

        return serveEbookFile(absolutePath, stat, request.headers.get('range'), request.signal);
    } catch (err: any) {
        if (err?.status) throw err;
        console.error('[Ebook API Error]', err);
        throw error(500, `Internal error: ${err?.message ?? 'Unknown error'}`);
    }
}
