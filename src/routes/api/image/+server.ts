import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import yauzl from 'yauzl-promise';
import { getContentType } from '$lib/server/fileUtils';
import sharp from 'sharp';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

sharp.concurrency(1);
sharp.cache({ items: 500, memory: 256, files: 100 });
sharp.simd(true);

const THUMB_CACHE_DIR = path.resolve('.thumbnails');
if (!fs.existsSync(THUMB_CACHE_DIR)) {
	fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
}

let activeGenerations = 0;
const MAX_CONCURRENT_THUMBS = 4;
const generationQueue: (() => void)[] = [];
const ongoingGenerations = new Map<string, Promise<void>>();

async function getThumbnailPath(filePath: string, mtime: number) {
	const hash = createHash('md5').update(`${filePath}-${mtime}`).digest('hex');
	return path.join(THUMB_CACHE_DIR, `${hash}.webp`);
}

async function generateThumbnail(inputPath: string, outputPath: string, mtimeMs: number, signal?: AbortSignal) {
	if (ongoingGenerations.has(outputPath)) return ongoingGenerations.get(outputPath);

	function isHeifBuffer(buf: Buffer): boolean {
		if (buf.length < 12) return false;
		if (buf[0] !== 0x00 || buf[1] !== 0x00 || buf[2] !== 0x00) return false;
		const ftyp = buf.slice(4, 8).toString();
		return ftyp === 'ftyp' && (buf[8] === 0x68 || buf[8] === 0x28);
	}

	const generationPromise = (async () => {
		if (activeGenerations >= MAX_CONCURRENT_THUMBS) {
			await new Promise<void>(resolve => {
				const onAbort = () => {
					const idx = generationQueue.indexOf(resolve);
					if (idx > -1) generationQueue.splice(idx, 1);
					resolve();
				};
				signal?.addEventListener('abort', onAbort, { once: true });
				generationQueue.unshift(resolve);
			});
		}
		if (signal?.aborted) return;
		activeGenerations++;

		try {
			const ext = path.extname(inputPath).toLowerCase();
			if (['.mp4', '.webm'].includes(ext)) {
				await new Promise((resolve, reject) => {
					const ffmpeg = spawn('ffmpeg', [
						'-ss', '00:00:01',
						'-i', inputPath,
						'-frames:v', '1',
						'-vf', 'scale=300:300:force_original_aspect_ratio=increase,crop=300:300',
						'-c:v', 'webp',
						'-lossless', '0',
						'-compression_level', '0',
						'-q:v', '60',
						'-y',
						outputPath
					], { stdio: 'ignore' });

					const killFFmpeg = () => { ffmpeg.kill('SIGKILL'); reject(new Error('Aborted')); };
					signal?.addEventListener('abort', killFFmpeg, { once: true });
					ffmpeg.on('close', (code) => {
						signal?.removeEventListener('abort', killFFmpeg);
						if (code === 0) resolve(true);
						else reject(new Error(`FFmpeg error ${code}`));
					});
				});
			} else {
				let sharpInput: any = inputPath;
				let isHeif = ext === '.heic' || ext === '.heif';

				if (inputPath.includes('::')) {
					const [zipPath, internalPath] = inputPath.split('::');
					const absoluteZipPath = path.resolve(zipPath);
					const zip = await yauzl.open(absoluteZipPath);
					try {
						let entry: any = null;
						for await (const e of zip) {
							if (e.filename === internalPath) {
								entry = e;
								break;
							}
						}
						if (!entry) throw new Error(`Entry ${internalPath} not found in zip`);

						const nodeStream = await entry.openReadStream();
						const chunks: Buffer[] = [];
						for await (const chunk of nodeStream) {
							if (signal?.aborted) {
								nodeStream.destroy();
								throw new Error('Aborted');
							}
							chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
						}
						sharpInput = Buffer.concat(chunks);
						if (!isHeif && sharpInput.length >= 12) {
							isHeif = isHeifBuffer(sharpInput);
						}
					} finally {
						await zip.close();
					}
				} else if (!isHeif) {
					const header = Buffer.alloc(12);
					const fd = fs.openSync(inputPath, 'r');
					fs.readSync(fd, header, 0, 12, 0);
					fs.closeSync(fd);
					isHeif = isHeifBuffer(header);
				}

				if (isHeif) {
					let fullBuffer: any = Buffer.isBuffer(sharpInput) ? sharpInput : await fsp.readFile(sharpInput);
					const heicConvert = (await import('heic-convert')).default;
					let converted: any = await heicConvert({ buffer: fullBuffer, format: 'JPEG', quality: 0.8 });
					fullBuffer = null;
					sharpInput = Buffer.from(converted);
					converted = null;
				}
				
				if (signal?.aborted) { sharpInput = null; return; }
				
				if (!sharpInput || (Buffer.isBuffer(sharpInput) && sharpInput.length === 0)) {
					throw new Error("Invalid or empty image input for Sharp");
				}

				try {
					await sharp(sharpInput)
						.rotate()
						.resize(200, 200, { fit: 'cover', fastShrinkOnLoad: true })
						.webp({ quality: 65, effort: 0 })
						.toFile(outputPath);
				} catch (sharpErr) {
					console.error(`[Sharp Error] ${inputPath}:`, sharpErr);
					if (!fs.existsSync(outputPath)) {
						throw new Error(`Sharp failed to process image: ${sharpErr instanceof Error ? sharpErr.message : String(sharpErr)}`);
					}
				}
				
				sharpInput = null;
			}
			if (mtimeMs && !signal?.aborted) {
				const atime = Date.now() / 1000;
				const mtime = mtimeMs / 1000;
				await fsp.utimes(outputPath, atime, mtime).catch(() => { });
			}
		} catch (err) {
			console.error(`[Thumbnail Error] Path: ${inputPath}`, err);
			throw err;
		} finally {
			activeGenerations--;
			if (generationQueue.length > 0) {
				const next = generationQueue.shift();
				if (next) next();
			}
			// @ts-ignore
			if (global.Bun) { Bun.gc(true); }
		}
	})();

	ongoingGenerations.set(outputPath, generationPromise);
	try { await generationPromise; } finally { ongoingGenerations.delete(outputPath); }
}

export async function GET({ url, request }: RequestEvent) {
	try {
		const imagePath = url.searchParams.get('path');
		const isThumbnail = url.searchParams.get('thumbnail') === 'true';
		const getMetadataOnly = url.searchParams.get('metadata') === 'true';

		if (!imagePath) throw error(400, 'Missing path');

		let decodedPath: string;
		try {
			decodedPath = decodeURIComponent(imagePath);
		} catch (e) {
			decodedPath = imagePath;
		}
		
		if (!decodedPath) throw error(400, 'Invalid path encoding');

		const normalizedPath = decodedPath.replace(/\\/g, '/');
		
		const isZipPath = normalizedPath.includes('::');
		const actualFilePath = isZipPath 
			? normalizedPath.split('::')[0] 
			: normalizedPath;
			
		const absolutePath = actualFilePath.startsWith('/') || /^[a-zA-Z]:/.test(actualFilePath)
			? actualFilePath
			: path.resolve(actualFilePath);
			
		if (!fs.existsSync(absolutePath)) {
			throw error(404, 'File not found');
		}

		if (normalizedPath.includes('::')) {
			const [zipPath, internalPath] = normalizedPath.split('::');
			const zipPathFixed = zipPath.replace(/\//g, '\\');
			const absoluteZipPath = path.resolve(zipPathFixed);
			
			if (!fs.existsSync(absoluteZipPath)) {
				throw error(404, 'Zip file not found');
			}
			const stat = await fsp.stat(absoluteZipPath);

			if (getMetadataOnly) {
				return json({
					name: internalPath,
					size: stat.size,
					lastModified: stat.mtimeMs,
					width: 0, height: 0
				});
			}

			if (isThumbnail) {
				const thumbPath = await getThumbnailPath(normalizedPath, stat.mtimeMs);
				if (fs.existsSync(thumbPath)) {
					const headers = {
						'Content-Type': 'image/webp',
						'Cache-Control': 'public, max-age=31536000, immutable'
					};
					// @ts-ignore
					if (global.Bun) return new Response(Bun.file(thumbPath), { headers });
					const data = await fsp.readFile(thumbPath);
					return new Response(data, { headers });
				}
				await generateThumbnail(normalizedPath, thumbPath, stat.mtimeMs, request.signal);
				if (fs.existsSync(thumbPath)) {
					const headers = {
						'Content-Type': 'image/webp',
						'Cache-Control': 'public, max-age=31536000, immutable'
					};
					// @ts-ignore
					if (global.Bun) return new Response(Bun.file(thumbPath), { headers });
					const data = await fsp.readFile(thumbPath);
					return new Response(data, { headers });
				}
				throw error(404, 'Failed to generate thumbnail');
			}

			const zip = await yauzl.open(absoluteZipPath);
			let entry: any = null;
			const searchBasename = path.basename(internalPath).toLowerCase();
			
			for await (const e of zip) {
				const entryBasename = path.basename(e.filename).toLowerCase();
				if (entryBasename === searchBasename) {
					entry = e;
					break;
				}
			}
			
			if (!entry) {
				await zip.close();
				throw error(404, 'Not found in archive');
			}

			const stream = await entry.openReadStream();
			const webStream = new ReadableStream({
				async start(controller) {
					stream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
					stream.on('end', () => controller.close());
					stream.on('error', (err: Error) => controller.error(err));
				},
				cancel() {
					stream.destroy();
					zip.close().catch(() => {});
				}
			});

			request.signal.addEventListener('abort', () => {
				stream.destroy();
				zip.close().catch(() => {});
			}, { once: true });

			return new Response(webStream, { 
				headers: { 
					'Content-Type': getContentType(path.extname(internalPath).toLowerCase()),
					'Transfer-Encoding': 'chunked'
				} 
			});
		}

		if (!fs.existsSync(absolutePath)) throw error(404, 'File not found');
		const stat = await fsp.stat(absolutePath);
		const ext = path.extname(absolutePath).toLowerCase();

		if (getMetadataOnly) {
			let width = 0, height = 0;
			if (['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(ext)) {
				try {
					const meta = await sharp(absolutePath).metadata();
					width = meta.width || 0;
					height = meta.height || 0;
					if (meta.orientation && meta.orientation >= 5) [width, height] = [height, width];
				} catch (e) { }
			}
			return json({
				name: path.basename(absolutePath),
				size: stat.size,
				lastModified: stat.mtimeMs,
				width, height
			});
		}

		if (isThumbnail) {
			const thumbPath = await getThumbnailPath(absolutePath, stat.mtimeMs);
			if (!fs.existsSync(thumbPath)) {
				await generateThumbnail(absolutePath, thumbPath, stat.mtimeMs, request.signal);
			}

			if (fs.existsSync(thumbPath)) {
				const headers = {
					'Content-Type': 'image/webp',
					'Cache-Control': 'public, max-age=31536000, immutable'
				};
				// @ts-ignore
				if (global.Bun) return new Response(Bun.file(thumbPath), { headers });
				const data = await fsp.readFile(thumbPath);
				return new Response(data, { headers });
			}
			throw error(404, 'Thumbnail not found');
		}

		const contentType = getContentType(ext);
		const isHeic = ext === '.heic' || ext === '.heif';
		const range = request.headers.get('range');
		const isVideo = contentType.startsWith('video/');
		const highWaterMark = isVideo ? 256 * 1024 : 128 * 1024;

		const baseHeaders: any = {
			'Content-Type': isHeic ? 'image/heic' : contentType,
			'Accept-Ranges': 'bytes',
			'X-Content-Type-Options': 'nosniff',
		};

		if (isVideo) {
			baseHeaders['ETag'] = `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`;
			baseHeaders['Cache-Control'] = 'no-cache';
			baseHeaders['Last-Modified'] = new Date(stat.mtimeMs).toUTCString();
		} else {
			baseHeaders['Cache-Control'] = 'public, max-age=86400';
		}

		if (isVideo) {
			if (range) {
				const parts = range.replace(/bytes=/, '').split('-');
				const start = parseInt(parts[0], 10);
				let end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
				if (start >= stat.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
				if (end >= stat.size) end = stat.size - 1;

				const fileStream = fs.createReadStream(absolutePath, { start, end, highWaterMark });
				const webStream = Readable.toWeb(fileStream);
				request.signal.addEventListener('abort', () => {
					fileStream.destroy();
				}, { once: true });

				baseHeaders['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
				baseHeaders['Content-Length'] = (end - start + 1).toString();
				return new Response(webStream as any, { status: 206, headers: baseHeaders });
			}

			const fileStream = fs.createReadStream(absolutePath, { highWaterMark });
			const webStream = Readable.toWeb(fileStream);
			request.signal.addEventListener('abort', () => {
				fileStream.destroy();
			}, { once: true });
			baseHeaders['Content-Length'] = stat.size.toString();
			return new Response(webStream as any, { headers: baseHeaders });
		}

		// @ts-ignore
		if (global.Bun) {
			if (range) {
				const parts = range.replace(/bytes=/, '').split('-');
				const start = parseInt(parts[0], 10);
				let end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
				if (start < stat.size) {
					if (end >= stat.size) end = stat.size - 1;
					baseHeaders['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
					baseHeaders['Content-Length'] = (end - start + 1).toString();
					// @ts-ignore
					return new Response(Bun.file(absolutePath).slice(start, end + 1), { status: 206, headers: baseHeaders });
				}
			}
			baseHeaders['Content-Length'] = stat.size.toString();
			// @ts-ignore
			return new Response(Bun.file(absolutePath), { headers: baseHeaders });
		}

		if (range) {
			const parts = range.replace(/bytes=/, '').split('-');
			const start = parseInt(parts[0], 10);
			let end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
			if (start >= stat.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
			if (end >= stat.size) end = stat.size - 1;

			const fileStream = fs.createReadStream(absolutePath, { start, end, highWaterMark });
			const webStream = Readable.toWeb(fileStream);
			request.signal.addEventListener('abort', () => fileStream.destroy(), { once: true });
			baseHeaders['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
			baseHeaders['Content-Length'] = (end - start + 1).toString();
			return new Response(webStream as any, { status: 206, headers: baseHeaders });
		}

		const fileStream = fs.createReadStream(absolutePath, { highWaterMark });
		const webStream = Readable.toWeb(fileStream);
		request.signal.addEventListener('abort', () => fileStream.destroy(), { once: true });
		baseHeaders['Content-Length'] = stat.size.toString();
		return new Response(webStream as any, { headers: baseHeaders });
	} catch (err: any) {
		if (err?.status) throw err;
		console.error('[Image API Error]', err);
		throw error(500, `Internal error: ${err?.message || 'Unknown error'}`);
	}
}

export async function DELETE() {
	// @ts-ignore
	if (global.Bun) Bun.gc(true);
	if (fs.existsSync(THUMB_CACHE_DIR)) {
		await fsp.rm(THUMB_CACHE_DIR, { recursive: true, force: true });
		await fsp.mkdir(THUMB_CACHE_DIR, { recursive: true });
	}
	return new Response(JSON.stringify({ success: true }));
}
