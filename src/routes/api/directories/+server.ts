import { error, json, isHttpError } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
// @ts-ignore
import fs from 'node:fs/promises';
// @ts-ignore
import path from 'node:path';
// @ts-ignore
import { exec } from 'node:child_process';
// @ts-ignore
import { promisify } from 'node:util';
import { ALLOWED_EXTENSIONS, isImageFile, isVideoFile, isAudioFile, isPdfFile, isEpubFile, isCbzFile } from '$lib/server/fileUtils';

const execAsync = promisify(exec);

// Lấy danh sách ổ đĩa Windows (Ví dụ: C:\, D:\)
async function getWindowsDrives(): Promise<{ name: string; path: string }[]> {
	try {
		// Dùng PowerShell để lấy danh sách ổ đĩa (ổn định hơn wmic đã bị khai tử)
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
		// Sắp xếp C lên đầu rồi tới các ổ khác
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

export async function GET({ url }: RequestEvent) {
	const folderParam = url.searchParams.get('path');

	try {
		// NẾU KHÔNG TRUYỀN PARAM VÀ ĐANG Ở WINDOWS -> TRẢ VỀ CÁC Ổ ĐĨA
		if (!folderParam || folderParam.trim() === '' || folderParam === 'This PC' || folderParam === 'This PC (Ổ đĩa hệ thống)') {
			const isWin = process.platform === 'win32';
			if (isWin) {
				const drives = await getWindowsDrives();
				return json({
					currentPath: '',
					parentPath: null, // Ở gốc This PC thì không có cha nữa
					directories: drives
				});
			} else {
				// Linux/Mac fallback (Root /)
				return json({
					currentPath: '/',
					parentPath: '',
					directories: [{ name: '/', path: '/' }]
				});
			}
		}

		const currentPath = path.resolve(folderParam);

		// Kiểm tra thư mục có tồn tại
		const stat = await fs.stat(currentPath);
		if (!stat.isDirectory()) {
			throw error(400, 'Path is not a directory');
		}

		// Lấy đường dẫn thư mục Cha (để làm nút Up/Back)
		const parentPath = path.dirname(currentPath);

		// Đọc thư mục hiện tại
		const entries = await fs.readdir(currentPath, { withFileTypes: true });

		const CBZ_EXTS = new Set(['.cbz', '.zip']);

		// Return ALL non-hidden entries — dirs, CBZ, media, and unknown files.
		// Each entry is tagged with flags the FolderPicker uses to pick the right icon.
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
				// Dirs first, then CBZ, then media, then unknowns; alphabetical within each group
				const rank = (e: any) => e.isDir ? 0 : e.isCbz ? 1 : e.isMedia ? 2 : 3;
				const ra = rank(a), rb = rank(b);
				if (ra !== rb) return ra - rb;
				return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
			});

		return json({
			currentPath,
			// Nếu cha bằng hiện tại (vd gốc C:\), trả về rỗng để hiển thị list ổ đĩa
			parentPath: (parentPath === currentPath || currentPath.endsWith(':\\') || currentPath.endsWith(':/')) ? '' : parentPath,
			directories,
			summary: mediaCount > 0 ? {
				count: mediaCount,
				types: Array.from(mediaTypes).sort()
			} : null
		});

	} catch (e: any) {
		console.error('API Directories Error:', e);
		if (isHttpError(e)) throw e;
		if (e.code === 'ENOENT') {
			throw error(404, 'Directory does not exist or was deleted.');
		} else if (e.code === 'EPERM' || e.code === 'EACCES') {
			throw error(403, 'Access Denied.');
		}
		throw error(500, 'An error occurred while scanning the directory: ' + (e.message || 'Unknown error'));
	}
}
