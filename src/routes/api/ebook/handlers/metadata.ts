import { json } from '@sveltejs/kit';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { isPdfFile, isEpubFile, isCbzFile } from '$lib/fileUtils';

import type { Stats } from 'node:fs';

export async function handleMetadata(absolutePath: string, normalizedPath: string, stat: Stats) {
    const ext = path.extname(absolutePath).toLowerCase();
    return json({
        name: path.basename(absolutePath),
        path: normalizedPath,
        size: stat.size,
        lastModified: stat.mtimeMs,
        isPdf: isPdfFile(ext),
        isEpub: isEpubFile(ext),
        isCbz: isCbzFile(ext)
    });
}
