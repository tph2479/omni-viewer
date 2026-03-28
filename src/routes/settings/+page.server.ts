import { getDefaultAppPath, setDefaultAppPath } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
    const defaultPath = await getDefaultAppPath();
    return {
        defaultPath: defaultPath || ''
    };
};

export const actions: Actions = {
    savePath: async ({ request }) => {
        const data = await request.formData();
        const path = data.get('path');
        
        if (typeof path !== 'string' || !path.trim()) {
            return fail(400, { error: 'Path cannot be empty', path });
        }
        
        await setDefaultAppPath(path.trim());
        return { success: true, path: path.trim() };
    }
};
