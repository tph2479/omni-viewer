import { defineHandler } from '$lib/server/api/handler';
import { composeMediaGalleryPage, type MediaGalleryQueryConfig } from '$lib/server/services/file/galleryProvider';

export const GET = defineHandler(async ({ absolutePath, page, limit, url }) => {
    const galleryQueryFilters: MediaGalleryQueryConfig = {
        currentPageIndex:   page,
        itemsPerPage:       limit,
        sortMode:           url.searchParams.get('sort')          ?? 'date_desc',
        typeFilter:         url.searchParams.get('type')          ?? 'all',
        imagesOnly:         url.searchParams.get('imagesOnly')    === 'true',
        exclusiveType:      url.searchParams.get('exclusiveType') ?? null,
        resolveFolderCovers:url.searchParams.get('isCover')       === 'true',
        resolveFolderToc:   url.searchParams.get('isToc')         === 'true',
        disableGrouping:    url.searchParams.get('noGroup')       === 'true',
    };

    return await composeMediaGalleryPage(absolutePath, galleryQueryFilters);
}, {
    path: 'required',
    parsePagination: true
});

