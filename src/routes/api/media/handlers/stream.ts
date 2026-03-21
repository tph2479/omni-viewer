import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Readable } from 'node:stream';

import type { Stats } from 'node:fs';

export async function handleStream(absolutePath: string, stat: Stats, contentType: string, range: string | null, signal: AbortSignal) {
    const isVideo = contentType.startsWith('video/');
    const baseHeaders: any = { 
        'Content-Type': contentType, 
        'Accept-Ranges': 'bytes', 
        'X-Content-Type-Options': 'nosniff' 
    };

    if (isVideo) {
        baseHeaders['ETag'] = `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`;
        baseHeaders['Cache-Control'] = 'no-cache';
        baseHeaders['Last-Modified'] = new Date(stat.mtimeMs).toUTCString();
    } else {
        baseHeaders['Cache-Control'] = 'public, max-age=86400';
    }

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        
        if (start >= stat.size) {
            return new Response(null, { 
                status: 416, 
                headers: { 'Content-Range': `bytes */${stat.size}` } 
            });
        }
        if (end >= stat.size) end = stat.size - 1;

        const fileStream = fs.createReadStream(absolutePath, { start, end });
        const webStream = Readable.toWeb(fileStream);
        signal.addEventListener('abort', () => fileStream.destroy(), { once: true });
        
        baseHeaders['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
        baseHeaders['Content-Length'] = (end - start + 1).toString();
        return new Response(webStream as any, { status: 206, headers: baseHeaders });
    }

    const fileStream = fs.createReadStream(absolutePath);
    const webStream = Readable.toWeb(fileStream);
    signal.addEventListener('abort', () => fileStream.destroy(), { once: true });
    baseHeaders['Content-Length'] = stat.size.toString();
    
    return new Response(webStream as any, { headers: baseHeaders });
}
