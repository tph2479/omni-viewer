import { json, error } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { isImageFile, isVideoFile, isAudioFile, isPdfFile, isEpubFile, isCbzFile } from '$lib/server/fileUtils';

const execAsync = promisify(exec);

async function getWindowsDrives(): Promise<{ name: string; path: string }[]> {
	try {
		const { stdout } = await execAsync('powershell "Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Name"');
		const lines = stdout.split('\n');
		const drives = [];
		for (const line of lines) {
			const d = line.trim();
			if (d && d.length === 1) {
				drives.push({ name: `${d}:\\`, path: `${d}:\\` });
			} else if (d && d.length === 2 && d[1] === ':') {
				drives.push({ name: `${d}\\`, path: `${d}\\` });
			}
		}
		return drives.sort((a, b) => {
			if (a.name.startsWith('C:')) return -1;
			if (b.name.startsWith('C:')) return 1;
			return a.name.localeCompare(b.name);
		});
	} catch (e) {
		console.error('Failed to get Windows drives via PowerShell:', e);
		return [{ name: 'C:\\', path: 'C:\\' }];
	}
}

export async function handleNavigation(folderParam: string | null) {
    if (!folderParam || folderParam.trim() === '' || folderParam === 'This PC' || folderParam === 'This PC (Ổ đĩa hệ thống)') {
        const isWin = process.platform === 'win32';
        if (isWin) {
            const drives = await getWindowsDrives();
            return json({ currentPath: '', parentPath: null, directories: drives });
        } else {
            return json({ currentPath: '/', parentPath: '', directories: [{ name: '/', path: '/' }] });
        }
    }

    const currentPath = path.resolve(folderParam);
    const stat = await fs.stat(currentPath);
    if (!stat.isDirectory()) throw error(400, 'Path is not a directory');

    const parentPath = path.dirname(currentPath);
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    let mediaCount = 0;
    const mediaTypes = new Set<string>();

    const directories = entries
        .filter((entry: any) => !entry.name.startsWith('.'))
        .map((entry: any) => {
            const entryPath = path.join(currentPath, entry.name);
            const ext = path.extname(entry.name).toLowerCase();
            const isDir = entry.isDirectory();
            const isCbz = !isDir && isCbzFile(ext);
            const isMedia = !isDir && !isCbz && (isImageFile(ext) || isVideoFile(ext) || isAudioFile(ext) || isPdfFile(ext) || isEpubFile(ext));

            if (isMedia) {
                mediaCount++;
                mediaTypes.add(ext.replace('.', '').toUpperCase());
            }

            return { name: entry.name, path: entryPath, isDir, isCbz, isMedia };
        })
        .sort((a: any, b: any) => {
            const rank = (e: any) => e.isDir ? 0 : e.isCbz ? 1 : e.isMedia ? 2 : 3;
            const ra = rank(a), rb = rank(b);
            if (ra !== rb) return ra - rb;
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

    return json({
        currentPath,
        parentPath: (parentPath === currentPath || currentPath.endsWith(':\\') || currentPath.endsWith(':/')) ? '' : parentPath,
        directories,
        summary: mediaCount > 0 ? { count: mediaCount, types: Array.from(mediaTypes).sort() } : null
    });
}
