import { createApiHandler } from '$lib/server/api/handler';
import { getNavigation } from '$lib/server/services/files';

export const GET = createApiHandler(async ({ normalizedPath }) => {
    return await getNavigation(normalizedPath);
}, {
    path: 'optional'
});
