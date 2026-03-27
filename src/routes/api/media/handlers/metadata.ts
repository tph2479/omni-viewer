import { json } from '@sveltejs/kit';
import type { Stats } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { isImageFile } from '$lib/fileUtils';
import { ensureHeicConverted } from '$lib/server/archiveUtils';

export async function handleMetadata(absolutePath: string, normalizedPath: string, stat: Stats, ext: string, isHeic: boolean, signal: AbortSignal, isRetry: boolean) {
    let width = 0, height = 0;
    if (isImageFile(ext) || isHeic) {
        try {
            let metaPath = absolutePath;
            if (isHeic) metaPath = await ensureHeicConverted(absolutePath, stat.mtimeMs, signal, isRetry);
            const meta = await sharp(metaPath).metadata();
            width = meta.width || 0; height = meta.height || 0;
            if (meta.orientation && meta.orientation >= 5) [width, height] = [height, width];
        } catch (e) {}
    }
    return json({ 
        name: path.basename(absolutePath), 
        path: normalizedPath, 
        size: stat.size, 
        lastModified: stat.mtimeMs, 
        width, 
        height 
    });
}
