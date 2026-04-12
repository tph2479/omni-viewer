import { defineHandler } from '$lib/server/api/handler';
import { fetchDirectoryCovers } from '$lib/server/services/file/galleryProvider';

export const GET = defineHandler(async ({ absolutePath, page, limit }) => {
    return await fetchDirectoryCovers(absolutePath, page, limit);
}, {
    path: 'required',
    pathType: 'dir',
    parsePagination: true
});

