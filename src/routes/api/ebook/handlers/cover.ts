import { error } from '@sveltejs/kit';
import fsp from 'node:fs/promises';
import { getArchiveCover } from '$lib/server/archiveUtils';

import type { Stats } from 'node:fs';

export async function handleCover(absolutePath: string, stat: Stats, signal: AbortSignal) {
    const thumbPath = await getArchiveCover(absolutePath, stat.mtimeMs, signal);
    if (!thumbPath) throw error(404, 'Cover could not be generated');
    
    const headers = { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' };
    // @ts-ignore
    if (globalThis.Bun) return new Response(globalThis.Bun.file(thumbPath), { headers });
    return new Response(await fsp.readFile(thumbPath), { headers });
}
