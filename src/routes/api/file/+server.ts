import { error, json, isHttpError } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import path from 'node:path';
import { handleDelete } from './handlers/delete';
import { handleNavigation } from './handlers/navigation';
import { handleListing } from './handlers/listing';
import { handleCovers } from './handlers/covers';

function sanitizePath(p: string | null): string | null {
    if (!p) return p;
    return p.replace(/^([A-Za-z]:\\)\1+/i, '$1');
}

export async function DELETE({ url }: RequestEvent) {
	const pathParam = sanitizePath(url.searchParams.get('path'));
	if (!pathParam) throw error(400, 'Missing path');

	return await handleDelete(pathParam);
}

export async function GET({ url }: RequestEvent) {
    const action = url.searchParams.get('action');

    // directories navigation
    if (action === 'directories') {
	    const folderParam = sanitizePath(url.searchParams.get('path'));
	    try {
	    	return await handleNavigation(folderParam);
	    } catch (e: any) {
	    	console.error('API Directories Error:', e);
	    	if (isHttpError(e)) throw e;
	    	throw e;
	    }
    } 
    
    // gallery listing
    if (action === 'gallery') {
        const folderParam = sanitizePath(url.searchParams.get('folder'));
        const pageParam = url.searchParams.get('page') || '0';
        const limitParam = url.searchParams.get('limit') || '50';
        const sortBy = url.searchParams.get('sort') || 'date_desc';
        const typeFilter = url.searchParams.get('type') || 'all';
        const imagesOnly = url.searchParams.get('imagesOnly') === 'true';
        const isCover = url.searchParams.get('isCover') === 'true';
        const exclusiveType = url.searchParams.get('exclusiveType');
        const noGroup = url.searchParams.get('noGroup') === 'true';

        if (!folderParam || folderParam === 'This PC' || folderParam === 'This PC (Ổ đĩa hệ thống)') {
            return json({ images: [], total: 0, page: 0, hasMore: false });
        }

        const folderPath = path.resolve(folderParam);

        try {
            return await handleListing(
                folderPath, 
                parseInt(pageParam, 10), 
                parseInt(limitParam, 10), 
                sortBy, 
                typeFilter, 
                imagesOnly,
                exclusiveType,
                isCover,
                noGroup
            );
        } catch (e: any) {
            console.error('API Gallery Error:', e);
            throw e;
        }
    }

    // cover folder browsing
    if (action === 'covers') {
        const folderParam = sanitizePath(url.searchParams.get('folder'));
        const pageParam = url.searchParams.get('page') || '0';
        const limitParam = url.searchParams.get('limit') || '30';

        if (!folderParam) {
            return json({ folders: [], total: 0, page: 0, hasMore: false });
        }

        const folderPath = path.resolve(folderParam);

        try {
            return await handleCovers(folderPath, parseInt(pageParam, 10), parseInt(limitParam, 10));
        } catch (e: any) {
            console.error('API Covers Error:', e);
            throw e;
        }
    }

    throw error(400, 'Invalid or missing action parameter');
}
