import { createApiHandler } from '$lib/server/api/handler';
import { performDelete } from '$lib/server/services/files';

export const DELETE = createApiHandler(async ({ pathContext }) => {
    return await performDelete(pathContext!.absolutePath);
}, {
    path: 'required'
});
