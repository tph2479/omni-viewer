import { getDefaultAppPath, setDefaultAppPath } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { statSync } from 'node:fs';

export const load: PageServerLoad = async () => {
    const defaultPath = await getDefaultAppPath();
    return {
        defaultPath: defaultPath || ''
    };
};

export const actions: Actions = {
    savePath: async ({ request }) => {
        const formData = await request.formData();
        const path = formData.get('path');
        
        if (typeof path !== 'string' || !path.trim()) {
            return fail(400, { error: 'Path cannot be empty', path: String(path || '') });
        }
        
        try {
            let trimmedPath = path.trim();
            trimmedPath = trimmedPath.replace(/^([A-Za-z]:\\)\1+/i, '$1');
            
            try {
                const stats = statSync(trimmedPath);
                if (!stats.isDirectory()) {
                    return fail(400, { error: 'Path exists but is not a directory', path: trimmedPath });
                }
            } catch {
                return fail(400, { error: 'Directory does not exist', path: trimmedPath });
            }
            
            await setDefaultAppPath(trimmedPath);
            return { success: true, path: trimmedPath };
        } catch (error) {
            console.error('Failed to save path:', error);
            return fail(500, { error: 'Internal server error while saving path', path: path.trim() });
        }
    }
};
