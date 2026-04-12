import { createApiHandler } from '$lib/server/api/handler';
import { getGalleryItems } from '$lib/server/services/files';

export const GET = createApiHandler(async ({ absolutePath, page, limit, url }) => {
    return await getGalleryItems(absolutePath, {
        page,
        limit,
        sortBy: url.searchParams.get('sort') ?? 'date_desc',
        typeFilter: url.searchParams.get('type') ?? 'all',
        imagesOnly: url.searchParams.get('imagesOnly') === 'true',
        exclusiveType: url.searchParams.get('exclusiveType'),
        isCover: url.searchParams.get('isCover') === 'true',
        isToc: url.searchParams.get('isToc') === 'true',
        noGroup: url.searchParams.get('noGroup') === 'true',
    });
}, {
    path: 'required',
    parsePagination: true
});
