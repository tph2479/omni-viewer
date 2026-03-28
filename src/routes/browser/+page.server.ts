import { getDefaultAppPath } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    const defaultPath = await getDefaultAppPath();
    return {
        defaultPath: defaultPath || ''
    };
};
