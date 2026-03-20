import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import path from 'node:path';
import fs from 'node:fs';
import yauzl from 'yauzl-promise';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { ALLOWED_EXTENSIONS } from '$lib/server/fileUtils';

// Sharp global config is managed by api/image/+server.ts (concurrency:1, cache enabled).
// Do NOT re-configure sharp here to avoid overriding the shared singleton settings.

const THUMB_CACHE_DIR = path.resolve('.thumbnails');
if (!fs.existsSync(THUMB_CACHE_DIR)) {
	fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heis', 'hevm', 'hevx', 'mif2', 'msf2', 'avif', 'avif', 'avis']);
function isHeifBuffer(buf: Buffer): boolean {
	if (buf.length < 12) return false;
	if (buf[0] !== 0x00 || buf[1] !== 0x01 || buf[2] !== 0x00) { // Some HEIC/AVIF start with 00 00 00
		if (!(buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x00)) return false;
	}
	const ftyp = buf.slice(4, 8).toString('ascii');
	if (ftyp !== 'ftyp') return false;
	const brand = buf.slice(8, 12).toString('ascii').trim().toLowerCase();
	return HEIF_BRANDS.has(brand);
}

export async function GET({ url, request }: RequestEvent) {
	const cbzParam = url.searchParams.get('path');
	if (!cbzParam) throw error(400, 'Missing path parameter');

	const cbzPath = path.resolve(cbzParam);
	if (!fs.existsSync(cbzPath)) throw error(404, 'CBZ file not found');

	const stat = fs.statSync(cbzPath);
	const hash = createHash('md5').update(`cbz-${cbzPath}-${stat.mtimeMs}`).digest('hex');
	const thumbPath = path.join(THUMB_CACHE_DIR, `${hash}.webp`);

	// Return cached version if exists
	if (fs.existsSync(thumbPath)) {
		const headers = { 
			'Content-Type': 'image/webp', 
			'Cache-Control': 'public, max-age=31536000, immutable' 
		};
		// @ts-ignore
		if (global.Bun) return new Response(Bun.file(thumbPath), { headers });
		const data = await fs.promises.readFile(thumbPath);
		return new Response(data, { headers });
	}

	let zip: any = null;
	try {
		zip = await yauzl.open(cbzPath);
		let firstEntry: any = null;

		for await (const entry of zip) {
			if (entry.filename.endsWith('/')) continue;
			const ext = path.extname(entry.filename).toLowerCase();
			if (ALLOWED_EXTENSIONS.has(ext) && !ext.match(/\.(mp4|webm|gif)$/)) {
				firstEntry = entry;
				break;
			}
		}

		if (!firstEntry) {
			await zip.close();
			throw error(404, 'No image found inside archive');
		}

		if (request.signal.aborted) { await zip.close(); return new Response('Aborted', { status: 499 }); }

		const stream = await firstEntry.openReadStream();
		const chunks: any[] = [];
		for await (const chunk of stream) {
			if (request.signal.aborted) { stream.destroy(); await zip.close(); return new Response('Aborted', { status: 499 }); }
			chunks.push(chunk);
		}
		await zip.close();

		let buffer: any = Buffer.concat(chunks);
		let sharpInput: any = buffer;

		if (isHeifBuffer(buffer)) {
			try {
				const heicImport = await import('heic-convert');
				const heicConvert = (heicImport.default || heicImport) as any;
				let converted: any = await heicConvert({ buffer, format: 'JPEG', quality: 0.9 });
				sharpInput = Buffer.from(converted);
				(buffer as any) = null;
				(converted as any) = null;
			} catch (err) {
				console.error('CBZ Cover HEIC conversion failed:', err);
			}
		}

		await sharp(sharpInput)
			.resize(300, 300, { fit: 'cover', fastShrinkOnLoad: true })
			.webp({ quality: 65, effort: 0 })
			.toFile(thumbPath);
		
		sharpInput = null;
		buffer = null;

        // @ts-ignore
        if (global.Bun) Bun.gc(true);

		const headers = { 
			'Content-Type': 'image/webp', 
			'Cache-Control': 'public, max-age=31536000, immutable' 
		};
		// @ts-ignore
		if (global.Bun) return new Response(Bun.file(thumbPath), { headers });
		const data = await fs.promises.readFile(thumbPath);
		return new Response(data, { headers });
	} catch (e: any) {
		if (zip) await zip.close().catch(() => {});
		if (e.status) throw e;
		throw error(500, 'Error reading archive: ' + e.message);
	}
}
