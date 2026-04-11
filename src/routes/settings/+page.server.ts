import { getDefaultAppPath, setDefaultAppPath, getToolPath, saveToolPath } from '$lib/server/database/db';
import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { statSync } from 'node:fs';

export const load: PageServerLoad = async () => {
    const defaultPath = await getDefaultAppPath();
    const ytDlpPath = await getToolPath('yt-dlp');
    const galleryDlPath = await getToolPath('gallery-dl');
    const ffmpegPath = await getToolPath('ffmpeg');
    return {
        defaultPath: defaultPath || '',
        ytDlpPath,
        galleryDlPath,
        ffmpegPath
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
    },
    saveTools: async ({ request }) => {
        const formData = await request.formData();
        const ytDlp = formData.get('ytDlp');
        const galleryDl = formData.get('galleryDl');
        const ffmpeg = formData.get('ffmpeg');
        
        try {
            if (typeof ytDlp === 'string') await saveToolPath('yt-dlp', ytDlp.trim());
            if (typeof galleryDl === 'string') await saveToolPath('gallery-dl', galleryDl.trim());
            if (typeof ffmpeg === 'string') await saveToolPath('ffmpeg', ffmpeg.trim());
            return { 
                success: true, 
                tools: { 
                    ytDlp: String(ytDlp || ''), 
                    galleryDl: String(galleryDl || ''), 
                    ffmpeg: String(ffmpeg || '')
                } 
            };
        } catch (error) {
            console.error('Failed to save tools:', error);
            return fail(500, { error: 'Internal server error while saving tool paths' });
        }
    }
};
