import { error, json, isHttpError } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';
import yauzl from 'yauzl-promise';
import { ALLOWED_EXTENSIONS } from '$lib/server/fileUtils';

export async function GET({ url }: RequestEvent) {
	const folderParam = url.searchParams.get('folder');
	const pageParam = url.searchParams.get('page') || '0';
	const limitParam = url.searchParams.get('limit') || '50';
	const sortBy = url.searchParams.get('sort') || 'date_desc';

	if (!folderParam || folderParam === 'This PC' || folderParam === 'This PC (Ổ đĩa hệ thống)') {
		return json({ images: [], total: 0, page: 0, hasMore: false });
	}

	const folderPath = path.resolve(folderParam);

	const imagesOnlyParam = url.searchParams.get('imagesOnly') === 'true';

	try {
		// Kiểm tra cơ bản
		const stat = await fs.stat(folderPath);
		let imageDetails: any[] = [];

		if (stat.isFile() && (folderPath.toLowerCase().endsWith('.cbz') || folderPath.toLowerCase().endsWith('.zip'))) {
			const zip = await yauzl.open(folderPath);
			try {
				for await (const entry of zip) {
					const ext = path.extname(entry.filename).toLowerCase();
					// In a CBZ/ZIP, we typically only want images. Definitely NO nested CBZ/ZIP.
					if (ALLOWED_EXTENSIONS.has(ext) && ext !== '.cbz' && ext !== '.zip' && ext !== '.mp4' && ext !== '.webm') {
						imageDetails.push({
							name: entry.filename,
							path: `${folderPath}::${entry.filename}`,
							size: entry.uncompressedSize,
							mtime: Date.now(),
							isDir: false
						});
					}
				}
			} finally {
				await zip.close();
			}
		} else if (stat.isDirectory()) {
			const entries = await fs.readdir(folderPath, { withFileTypes: true });

			// TỐI ƯU: Quét thông tin file theo từng đợt (chunks) để tránh nghẽn RAM/Disk
			const CHUNK_SIZE_STAT = 50;
			for (let i = 0; i < entries.length; i += CHUNK_SIZE_STAT) {
				const chunk = entries.slice(i, i + CHUNK_SIZE_STAT);
				const results = await Promise.all(
					chunk.map(async (entry) => {
						const fullPath = path.join(folderPath, entry.name);
						const ext = path.extname(entry.name).toLowerCase();
						const isDir = entry.isDirectory();
						const isCbz = !isDir && (ext === '.cbz' || ext === '.zip');
						const isVideo = !isDir && (ext === '.mp4' || ext === '.webm');

						const isAllowed = isDir || isCbz || ALLOWED_EXTENSIONS.has(ext);
						
						if (isAllowed) {
							if (imagesOnlyParam) {
								if (isDir || isCbz || isVideo) return null;
							}

							try {
								const entryStat = await fs.stat(fullPath);
								return {
									name: entry.name,
									path: fullPath,
									mtime: entryStat.mtimeMs,
									size: entryStat.size, // Needed for cache keys or metadata placeholder
									isDir,
									isCbz,
									isVideo
								};
							} catch (e) { return null; }
						}
						return null;
					})
				);
				imageDetails.push(...results.filter(Boolean));
			}
		} else {
			throw error(400, 'Invalid path');
		}

		// Sắp xếp
		imageDetails.sort((a, b) => {
			if (a.isDir && !b.isDir) return -1;
			if (!a.isDir && b.isDir) return 1;
			if (sortBy === 'date_desc') return b.mtime - a.mtime;
			if (sortBy === 'date_asc') return a.mtime - b.mtime;
			if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
			if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
			return 0;
		});

		const page = parseInt(pageParam, 10);
		const limit = parseInt(limitParam, 10);
		const start = page * limit;
		const end = start + limit;
		const totalCount = imageDetails.length;
		const totalImagesCount = imageDetails.filter(item => !item.isDir && !item.isCbz && !item.isVideo).length;
		const totalVideosCount = imageDetails.filter(item => item.isVideo).length;

		// Final mapping of essential data only
		const paginatedImages = imageDetails.slice(start, end).map(item => ({
			name: item.name,
			path: item.path,
			isDir: item.isDir,
			isCbz: item.isCbz,
			isVideo: item.isVideo,
			lastModified: item.mtime
		}));

		imageDetails = [];

		if (global.Bun) { Bun.gc(true); }

		return json({
			images: paginatedImages,
			total: totalCount,
			totalImages: totalImagesCount,
			totalVideos: totalVideosCount,
			page,
			hasMore: end < totalCount
		});

	} catch (e: any) {
		console.error('API Gallery Error:', e);
		if (isHttpError(e)) throw e;
		throw error(500, 'Error: ' + (e.message || 'Unknown error'));
	}
}
