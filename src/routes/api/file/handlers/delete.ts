import { error, json } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function handleDelete(filePath: string) {
    try {
        const absolutePath = path.resolve(filePath);
        const stat = await fs.stat(absolutePath);

        if (stat.isDirectory()) {
            await fs.rm(absolutePath, { recursive: true, force: true });
        } else {
            await fs.unlink(absolutePath);
        }

        return json({ success: true, message: 'Deleted successfully' });
    } catch (err: any) {
        console.error('File Delete Error:', err);
        throw error(500, `Failed to delete: ${err.message}`);
    }
}
