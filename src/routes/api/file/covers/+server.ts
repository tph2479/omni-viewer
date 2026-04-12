import { createApiHandler } from '$lib/server/api/handler';
import { getFolderCovers } from '$lib/server/services/files';

export const GET = createApiHandler(async ({ absolutePath, page, limit }) => {
    return await getFolderCovers(absolutePath, page, limit);
}, {
    path: 'required',
    pathType: 'dir',
    parsePagination: true
});
