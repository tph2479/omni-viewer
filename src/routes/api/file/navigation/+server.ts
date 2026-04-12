import { defineHandler } from '$lib/server/api/handler';
import { browseContainerHierarchy } from '$lib/server/services/file/storageExplorer';

export const GET = defineHandler(async ({ url }) => {
    const requestedPath = url.searchParams.get('path') ?? null;
    return await browseContainerHierarchy(requestedPath);
});
