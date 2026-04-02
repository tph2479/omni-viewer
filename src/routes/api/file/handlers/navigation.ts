import { json, error } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { isImageFile, isVideoFile, isAudioFile, isPdfFile, isEpubFile, isCbzFile } from '$lib/fileUtils';

const execAsync = promisify(exec);

async function getWindowsDrives(): Promise<{ name: string; path: string }[]> {
	try {
		const { stdout } = await execAsync('wmic logicaldisk get name, volumename /format:list');
		const lines = stdout.split(/\r?\n/);
		const drives: { name: string; path: string }[] = [];
		let currentDrive: { name?: string; volumeName?: string } = {};

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) {
				if (currentDrive.name) {
					const name = currentDrive.name;
					const volumeName = currentDrive.volumeName || '';
					const displayName = volumeName ? `${name}\\ (${volumeName})` : `${name}\\`;
					drives.push({ name: displayName, path: `${name}\\` });
					currentDrive = {};
				}
				continue;
			}

			if (trimmed.startsWith('Name=')) {
				currentDrive.name = trimmed.substring(5).trim();
			} else if (trimmed.startsWith('VolumeName=')) {
				currentDrive.volumeName = trimmed.substring(11).trim();
			}
		}

		if (currentDrive.name) {
			const name = currentDrive.name;
			const volumeName = currentDrive.volumeName || '';
			const displayName = volumeName ? `${name}\\ (${volumeName})` : `${name}\\`;
			drives.push({ name: displayName, path: `${name}\\` });
		}

		return drives.sort((a, b) => {
			if (a.path.startsWith('C:')) return -1;
			if (b.path.startsWith('C:')) return 1;
			return a.path.localeCompare(b.path);
		});
	} catch (e) {
		console.error('Failed to get Windows drives via WMIC:', e);
		return [{ name: 'C:\\', path: 'C:\\' }];
	}
}


export async function handleNavigation(folderParam: string | null) {
    if (!folderParam || folderParam.trim() === '' || folderParam === 'This PC' || folderParam === 'This PC (Ổ đĩa hệ thống)') {
        const isWin = process.platform === 'win32';
        if (isWin) {
            const drives = await getWindowsDrives();
            const directories = drives.map(d => ({ ...d, isDir: true }));
            return json({ currentPath: '', parentPath: null, directories });
        } else {
            return json({ currentPath: '/', parentPath: '', directories: [{ name: '/', path: '/', isDir: true }] });
        }
    }

    const sanitizedParam = folderParam.replace(/^([A-Za-z]:\\)\1+/i, '$1');
    const currentPath = path.resolve(sanitizedParam);
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
