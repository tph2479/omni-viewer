import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import path from 'node:path';

import { sanitizePath } from '../_shared/pathUtils';
import { navigateDirectory, listDirectory, browseCovers, deleteFile } from '$lib/server/services/files';

export async function DELETE({ url }: RequestEvent) {
    const pathParam = sanitizePath(url.searchParams.get('path'));
    if (!pathParam) throw error(400, 'Missing path');
    return deleteFile(pathParam);
}

export async function GET({ url }: RequestEvent) {
    try {
        const action = url.searchParams.get('action');

        if (action === 'directories') {
            const folderParam = sanitizePath(url.searchParams.get('path'));
            return await navigateDirectory(folderParam);
        }

        if (action === 'gallery') {
            const folderParam = sanitizePath(url.searchParams.get('folder'));
            const page = parseInt(url.searchParams.get('page') ?? '0', 10);
            const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
            const sortBy = url.searchParams.get('sort') ?? 'date_desc';
            const typeFilter = url.searchParams.get('type') ?? 'all';
            const imagesOnly = url.searchParams.get('imagesOnly') === 'true';
            const isCover = url.searchParams.get('isCover') === 'true';
            const exclusiveType = url.searchParams.get('exclusiveType');
            const noGroup = url.searchParams.get('noGroup') === 'true';

            if (!folderParam || ['This PC', 'This PC (Ổ đĩa hệ thống)', ''].includes(folderParam.trim())) {
                return json({ images: [], total: 0, page: 0, hasMore: false });
            }

            return await listDirectory(path.resolve(folderParam), {
                page, limit, sortBy, typeFilter,
                imagesOnly, exclusiveType, isCover, noGroup,
            });
        }

        if (action === 'covers') {
            const folderParam = sanitizePath(url.searchParams.get('folder'));
            if (!folderParam) return json({ folders: [], total: 0, page: 0, hasMore: false });

            const page = parseInt(url.searchParams.get('page') ?? '0', 10);
            const limit = parseInt(url.searchParams.get('limit') ?? '30', 10);
            return await browseCovers(path.resolve(folderParam), page, limit);
        }

        throw error(400, 'Invalid or missing action parameter');
    } catch (err: any) {
        if (err?.status) throw err;
        console.error('[File API Error]', err);
        throw error(500, `Internal error: ${err?.message ?? 'Unknown error'}`);
    }
}
