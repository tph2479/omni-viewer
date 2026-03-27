import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { isPdfFile, isEpubFile, isCbzFile } from '$lib/fileUtils';

import { handleMetadata } from './handlers/metadata';
import { handleCover } from './handlers/cover';
import { handleArchive } from './handlers/archive';
import { handleServe } from './handlers/serve';

export async function GET({ url, request }: RequestEvent) {
	const filePathParam = url.searchParams.get('path');
	const isCover = url.searchParams.get('cover') === 'true';
	const isThumbnail = url.searchParams.get('thumbnail') === 'true';
	const getMetadataOnly = url.searchParams.get('metadata') === 'true';

	if (!filePathParam) throw error(400, 'Missing path');

	let decodedPath: string;
	try {
		decodedPath = decodeURIComponent(filePathParam);
	} catch (e) {
		decodedPath = filePathParam;
	}

	const normalizedPath = decodedPath.replace(/\\/g, '/');
	const isArchivePath = normalizedPath.includes('::');
	const [baseFilePath, internalPath] = isArchivePath ? normalizedPath.split('::') : [normalizedPath, null];

	const absolutePath = baseFilePath.startsWith('/') || /^[a-zA-Z]:/.test(baseFilePath)
		? baseFilePath
		: path.resolve(baseFilePath);

	if (!fs.existsSync(absolutePath)) throw error(404, 'File not found');
	const stat = await fsp.stat(absolutePath);
	const ext = path.extname(absolutePath).toLowerCase();

	if (getMetadataOnly) {
		return handleMetadata(absolutePath, normalizedPath, stat);
	}

	if (isCover || (isThumbnail && (isPdfFile(ext) || isEpubFile(ext) || isCbzFile(ext)))) {
		if (isCbzFile(ext) || isEpubFile(ext)) {
			return handleCover(absolutePath, stat, request.signal);
		}
	}

	if (isArchivePath && internalPath) {
		return handleArchive(absolutePath, internalPath);
	}

	return handleServe(absolutePath, stat, request.headers.get('range'), request.signal);
}
