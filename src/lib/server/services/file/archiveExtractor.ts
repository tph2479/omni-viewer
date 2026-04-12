import path from 'node:path';
import yauzl from 'yauzl-promise';

import { ALLOWED_EXTENSIONS, isImageFile } from '$lib/shared/utils/fileUtils';
import type { MediaType } from '$lib/client/stores/browser/types';

export interface ArchiveMediaNode {
    name: string;
    absolutePath: string;
    fileSize: number;
    lastModifiedTimeMs: number;
    mediaType: MediaType;
    isDirectory?: boolean;
}

/**
 * Extracts available media data from an archive (like ZIP/CBZ).
 * Follows the Strategy pattern footprint for future RAR/7Z extensions.
 */
export async function extractMediaNodesFromArchive(archiveAbsolutePath: string): Promise<ArchiveMediaNode[]> {
    const unpaginatedArchiveNodes: ArchiveMediaNode[] = [];
    const zipArchiveInstance = await yauzl.open(archiveAbsolutePath);
    
    try {
        for await (const entry of zipArchiveInstance) {
            const fileExtension = path.extname(entry.filename).toLowerCase();
            
            if (ALLOWED_EXTENSIONS.has(fileExtension) && isImageFile(fileExtension)) {
                unpaginatedArchiveNodes.push({
                    name: path.basename(entry.filename),
                    absolutePath: `${archiveAbsolutePath}::${entry.filename}`,
                    fileSize: entry.uncompressedSize,
                    lastModifiedTimeMs: Date.now(), // Archives don't readily provide inner mtime with yauzl without extra effort
                    mediaType: 'image' as MediaType,
                    isDirectory: false
                });
            }
        }
    } finally {
        await zipArchiveInstance.close();
    }
    
    return unpaginatedArchiveNodes;
}
