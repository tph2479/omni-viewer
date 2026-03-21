import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import path from 'node:path';
import { handleListing } from './handlers/listing';

export async function GET({ url }: RequestEvent) {
	const folderParam = url.searchParams.get('folder');
	const pageParam = url.searchParams.get('page') || '0';
	const limitParam = url.searchParams.get('limit') || '50';
	const sortBy = url.searchParams.get('sort') || 'date_desc';
	const typeFilter = url.searchParams.get('type') || 'all';
    const imagesOnly = url.searchParams.get('imagesOnly') === 'true';

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
            imagesOnly
        );
	} catch (e: any) {
		console.error('API Gallery Error:', e);
		throw e;
	}
}
