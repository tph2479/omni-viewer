import { getDefaultAppPath } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
    const defaultPath = await getDefaultAppPath();
    const path = url.searchParams.get('path') || '';
    return {
        defaultPath: defaultPath || '',
        urlPath: path
    };
};
