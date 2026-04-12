import fs from 'node:fs';
import { isHeifBuffer, isAvifBuffer } from '../services/imageUtils';

/**
 * Detects the real type of an image file by reading its first 256 bytes.
 */
export async function detectImageRealType(absolutePath: string): Promise<{ isHeic: boolean, isAvif: boolean }> {
    try {
        const header = Buffer.alloc(256);
        const fd = await new Promise<number>((resolve, reject) => {
            fs.open(absolutePath, 'r', (err, fd) => err ? reject(err) : resolve(fd));
        });
        
        await new Promise<void>((resolve, reject) => {
            fs.read(fd, header, 0, 256, 0, (err) => err ? reject(err) : resolve());
        });
        
        await new Promise<void>((resolve, reject) => {
            fs.close(fd, (err) => err ? reject(err) : resolve());
        });

        const isHeic = isHeifBuffer(header);
        const isAvif = isAvifBuffer(header);
        
        return { isHeic, isAvif };
    } catch {
        return { isHeic: false, isAvif: false };
    }
}
