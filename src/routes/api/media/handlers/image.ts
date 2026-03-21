import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Readable } from 'node:stream';
import { ensureHeicConverted } from '$lib/server/archiveUtils';

import type { Stats } from 'node:fs';

export async function handleImage(absolutePath: string, stat: Stats, contentType: string, isHeic: boolean, signal: AbortSignal, isRetry: boolean) {
    let servePath = absolutePath;
    let serveStat = stat;
    let finalContentType = contentType;

    if (isHeic) {
        servePath = await ensureHeicConverted(absolutePath, stat.mtimeMs, signal, isRetry);
        serveStat = await fsp.stat(servePath);
        finalContentType = 'image/webp';
    }

    const baseHeaders: any = { 
        'Content-Type': finalContentType, 
        'Cache-Control': 'public, max-age=86400',
        'Content-Length': serveStat.size.toString()
    };

    const fileStream = fs.createReadStream(servePath);
    const webStream = Readable.toWeb(fileStream);
    signal.addEventListener('abort', () => fileStream.destroy(), { once: true });
    
    return new Response(webStream as any, { headers: baseHeaders });
}
