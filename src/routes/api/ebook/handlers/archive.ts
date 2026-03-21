import { error } from '@sveltejs/kit';
import path from 'node:path';
import { Readable } from 'node:stream';
import { getContentType } from '$lib/server/fileUtils';
import { extractFileFromArchive } from '$lib/server/archiveUtils';

export async function handleArchive(absolutePath: string, internalPath: string) {
    try {
        const stream = await extractFileFromArchive(absolutePath, internalPath);
        const internalExt = path.extname(internalPath).toLowerCase();
        const contentType = getContentType(internalExt);

        // @ts-ignore
        const webStream = Readable.toWeb(stream);
        return new Response(webStream as any, { 
            headers: { 
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400'
            } 
        });
    } catch (err: any) {
        console.error(`[Ebook API Error] Extracting ${internalPath}:`, err);
        throw error(404, `Internal file not found: ${err.message}`);
    }
}
