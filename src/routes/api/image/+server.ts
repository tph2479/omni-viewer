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
// Disable internal cache to free RAM immediately after each image is processed
sharp.cache(false);
sharp.simd(true);

const THUMB_CACHE_DIR = path.resolve('.thumbnails');
if (!fs.existsSync(THUMB_CACHE_DIR)) {
	fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
}

let activeGenerations = 0;
const MAX_CONCURRENT_THUMBS = 4;
const generationQueue: (() => void)[] = [];
const ongoingGenerations = new Map<string, Promise<boolean>>();
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heis', 'hevm', 'hevx', 'mif2', 'msf2', 'avif', 'avif', 'avis']);

function isHeifBuffer(buf: Buffer): boolean {
	if (buf.length < 12) return false;
	if (buf[0] !== 0x00 || buf[1] !== 0x00 || buf[2] !== 0x00) return false;
	const ftyp = buf.slice(4, 8).toString('ascii');
	if (ftyp !== 'ftyp') return false;
	const brand = buf.slice(8, 12).toString('ascii').trim().toLowerCase();
	return HEIF_BRANDS.has(brand);
}

async function getThumbnailPath(filePath: string, mtime: number) {
	const hash = createHash('md5').update(`${filePath}-${mtime}`).digest('hex');
	return path.join(THUMB_CACHE_DIR, `${hash}.webp`);
}

async function ensureHeicConverted(inputPath: string, mtimeMs: number, logCtx: string, signalForWait?: AbortSignal, forceRegenerate = false): Promise<string> {
	const hash = createHash('md5').update(`${inputPath}-${mtimeMs}-full`).digest('hex');
	const outputPath = path.join(THUMB_CACHE_DIR, `full-${hash}.webp`);

	if (forceRegenerate) {
		try { fs.unlinkSync(outputPath); } catch(e) {}
	}

	if (ongoingGenerations.has(outputPath)) {
		await ongoingGenerations.get(outputPath);
		if (fs.existsSync(outputPath)) return outputPath;
	}

	if (fs.existsSync(outputPath)) {
		const stat = fs.statSync(outputPath);
		if (stat.size > 128) return outputPath;
		try { fs.unlinkSync(outputPath); } catch(e) {}
	}

	const conversionPromise = (async () => {
		if (activeGenerations >= MAX_CONCURRENT_THUMBS) {
			await new Promise<void>(resolve => {
				const onAbort = () => {
					const idx = generationQueue.indexOf(resolve);
					if (idx > -1) generationQueue.splice(idx, 1);
					resolve();
				};
				if (signalForWait) signalForWait.addEventListener('abort', onAbort, { once: true });
				generationQueue.push(resolve);
			});
		}
		if (signalForWait?.aborted) return;
		activeGenerations++;

		try {
			if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 128) return;

			let fullBuffer: Buffer;
			if (inputPath.includes('::')) {
				const [zipPath, internalPath] = inputPath.split('::');
				const zip = await yauzl.open(path.resolve(zipPath));
				try {
					let entry: any = null;
					for await (const e of zip) {
						if (e.filename === internalPath) { entry = e; break; }
					}
					if (!entry) throw new Error(`Entry ${internalPath} not found in zip`);
					const nodeStream = await entry.openReadStream();
					const chunks: Buffer[] = [];
					for await (const chunk of nodeStream) chunks.push(chunk);
					fullBuffer = Buffer.concat(chunks);
				} finally { await zip.close(); }
			} else {
				fullBuffer = await fsp.readFile(inputPath);
			}

			try {
				await sharp(fullBuffer)
					.rotate()
					.webp({ quality: 85, effort: 4 })
					.toFile(outputPath);
				(fullBuffer as any) = null;
			} catch (sharpErr) {
				try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch(e) {}
				const heicImport = await import('heic-convert');
				const heicConvert = (heicImport.default || heicImport) as any;
				let converted: any = await heicConvert({ buffer: fullBuffer, format: 'JPEG', quality: 0.9 });
				(fullBuffer as any) = null;
				if (Array.isArray(converted)) converted = converted[0].data;
				await sharp(Buffer.from(converted))
					.rotate()
					.webp({ quality: 85, effort: 4 })
					.toFile(outputPath);
				(converted as any) = null;
			}
			
			if (mtimeMs) {
				const atime = Date.now() / 1000;
				const mtime = mtimeMs / 1000;
				await fsp.utimes(outputPath, atime, mtime).catch(() => {});
			}
		} catch (err) {
			console.error(`[Conversion Error]`, err);
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

	// @ts-ignore
	ongoingGenerations.set(outputPath, conversionPromise);
	try { await conversionPromise; } finally { ongoingGenerations.delete(outputPath); }
	return outputPath;
}

async function generateThumbnail(inputPath: string, outputPath: string, mtimeMs: number, logCtx: string, signal?: AbortSignal): Promise<boolean> {
	if (ongoingGenerations.has(outputPath)) return ongoingGenerations.get(outputPath) as Promise<boolean>;

	const generationPromise = (async (): Promise<boolean> => {
		if (activeGenerations >= MAX_CONCURRENT_THUMBS) {
			await new Promise<void>(resolve => {
				const onAbort = () => {
					const idx = generationQueue.indexOf(resolve);
					if (idx > -1) generationQueue.splice(idx, 1);
					resolve();
				};
				if (signal) signal.addEventListener('abort', onAbort, { once: true });
				generationQueue.push(resolve);
			});
		}
		if (signal?.aborted) return false;
		activeGenerations++;

		try {
			const ext = path.extname(inputPath).toLowerCase();
			const isVideo = ['.mp4', '.webm', '.mkv', '.avi', '.flv', '.mov', '.m4v'].includes(ext);
			const isAudio = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.m4b'].includes(ext);

			if (isVideo || isAudio) {
				await new Promise((resolve, reject) => {
					// For audio, we want first frame if it's there (cover art)
					const ffmpegArgs = isAudio ? [
						'-i', inputPath,
						'-map', '0:v?',
						'-frames:v', '1',
						'-vf', 'scale=300:300:force_original_aspect_ratio=increase,crop=300:300',
						'-c:v', 'webp',
						'-y',
						outputPath
					] : [
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
					];

					const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: 'ignore' });

					const killFFmpeg = () => { ffmpeg.kill('SIGKILL'); reject(new Error('Aborted')); };
					if (signal) signal.addEventListener('abort', killFFmpeg, { once: true });
					ffmpeg.on('close', (code) => {
						if (signal) signal.removeEventListener('abort', killFFmpeg);
						if (code === 0) resolve(true);
						else reject(new Error(`FFmpeg error ${code}`));
					});
				});
			} else {
				let sharpInput: any = inputPath;
				let isHeif = ext === '.heic' || ext === '.heif';

				if (inputPath.includes('::')) {
					const [zipPath, internalPath] = inputPath.split('::');
					const subExt = path.extname(internalPath).toLowerCase();
					if (subExt === '.heic' || subExt === '.heif') {
						sharpInput = await ensureHeicConverted(inputPath, mtimeMs, logCtx, signal);
					} else {
						const zip = await yauzl.open(path.resolve(zipPath));
						try {
							for await (const e of zip) {
								if (e.filename === internalPath) {
									const stream = await e.openReadStream();
									const chunks: Buffer[] = [];
									let readLen = 0;
									for await (const chunk of stream) {
										chunks.push(chunk);
										readLen += chunk.length;
										if (readLen >= 12) break;
									}
									stream.destroy();
									if (isHeifBuffer(Buffer.concat(chunks))) {
										sharpInput = await ensureHeicConverted(inputPath, mtimeMs, logCtx, signal);
									} else {
										const fullStream = await e.openReadStream();
										const fullChunks: Buffer[] = [];
										for await (const c of fullStream) fullChunks.push(c);
										sharpInput = Buffer.concat(fullChunks);
									}
									break;
								}
							}
						} finally { await zip.close(); }
					}
				} else {
					if (!isHeif && ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
						try {
							const header = Buffer.alloc(12);
							const fd = fs.openSync(inputPath, 'r');
							fs.readSync(fd, header, 0, 12, 0);
							fs.closeSync(fd);
							isHeif = isHeifBuffer(header);
						} catch (e) {}
					}
					if (isHeif) {
						sharpInput = await ensureHeicConverted(inputPath, mtimeMs, logCtx, signal);
					}
				}
				
				if (!signal?.aborted) {
					try {
						await sharp(sharpInput)
							.rotate()
							.resize(200, 200, { fit: 'cover', fastShrinkOnLoad: true })
							.webp({ quality: 65, effort: 0 })
							.toFile(outputPath);
						(sharpInput as any) = null;
					} catch (sharpErr) {
						(sharpInput as any) = null;
						console.error(`[Sharp Thumb Error]`, sharpErr);
						if (!fs.existsSync(outputPath)) throw sharpErr;
					}
				}
				(sharpInput as any) = null;
			}
			if (mtimeMs && !signal?.aborted) {
				const atime = Date.now() / 1000;
				const mtime = mtimeMs / 1000;
				await fsp.utimes(outputPath, atime, mtime).catch(() => { });
			}
			return true;
		} catch (err) {
			console.error(`[Thumbnail Error] ${inputPath}:`, err);
			return false;
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
	try {
		return await generationPromise;
	} finally {
		ongoingGenerations.delete(outputPath);
	}
}

export async function GET({ url, request }: RequestEvent) {
	const rid = Math.random().toString(36).substring(7);
	try {
		const imagePath = url.searchParams.get('path');
		const isThumbnail = url.searchParams.get('thumbnail') === 'true';
		const getMetadataOnly = url.searchParams.get('metadata') === 'true';
		const isRetry = !!url.searchParams.get('retry');

		if (!imagePath) throw error(400, 'Missing path');

		let decodedPath: string;
		try {
			decodedPath = decodeURIComponent(imagePath);
		} catch (e) {
			decodedPath = imagePath;
		}
		
		const normalizedPath = decodedPath.replace(/\\/g, '/');
		const isZipPath = normalizedPath.includes('::');
		const [actualFilePath, internalPath] = isZipPath ? normalizedPath.split('::') : [normalizedPath, null];
			
		const absolutePath = actualFilePath.startsWith('/') || /^[a-zA-Z]:/.test(actualFilePath)
			? actualFilePath
			: path.resolve(actualFilePath);
			
		if (!fs.existsSync(absolutePath)) throw error(404, 'File not found');
		const stat = await fsp.stat(absolutePath);
		const filename = internalPath || path.basename(absolutePath);
		const ext = filename.split('.').pop()?.toLowerCase() || '';
		let isHeic = ext === 'heic' || ext === 'heif';

		if (isZipPath) {
			if (getMetadataOnly) {
				let width = 0, height = 0;
				if (isHeic) {
					try {
						const convertedPath = await ensureHeicConverted(normalizedPath, stat.mtimeMs, rid, request.signal, isRetry);
						const meta = await sharp(convertedPath).metadata();
						width = meta.width || 0; height = meta.height || 0;
					} catch (e) {}
				}
				return json({ name: internalPath, path: normalizedPath, size: stat.size, lastModified: stat.mtimeMs, width, height });
			}

			if (isThumbnail) {
				const thumbPath = await getThumbnailPath(normalizedPath, stat.mtimeMs);
				if (!fs.existsSync(thumbPath)) {
					const success = await generateThumbnail(absolutePath, thumbPath, stat.mtimeMs, rid, request.signal);
					if (!success) throw error(404, 'Thumbnail could not be generated');
				}
				const headers = { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' };
				// @ts-ignore
				if (global.Bun) return new Response(Bun.file(thumbPath), { headers });
				return new Response(await fsp.readFile(thumbPath), { headers });
			}

			if (isHeic) {
				const convertedPath = await ensureHeicConverted(normalizedPath, stat.mtimeMs, rid, request.signal, isRetry);
				return new Response(await fsp.readFile(convertedPath), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=86400' } });
			}

			const zip = await yauzl.open(absolutePath.replace(/\//g, '\\'));
			try {
				let entry: any = null;
				for await (const e of zip) {
					if (e.filename === internalPath) { entry = e; break; }
				}
				if (!entry) throw error(404, 'Inside archive file not found');
				const stream = await entry.openReadStream();
				const webStream = new ReadableStream({
					async start(controller) {
						stream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
						stream.on('end', () => controller.close());
						stream.on('error', (err: Error) => controller.error(err));
					},
					cancel() { stream.destroy(); }
				});
				return new Response(webStream, { headers: { 'Content-Type': getContentType('.' + ext), 'Transfer-Encoding': 'chunked' } });
			} finally { zip.close().catch(() => {}); }
		}

		if (!isHeic && !isThumbnail && ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
			try {
				const header = Buffer.alloc(12);
				const fd = fs.openSync(absolutePath, 'r');
				fs.readSync(fd, header, 0, 12, 0);
				fs.closeSync(fd);
				if (isHeifBuffer(header)) isHeic = true;
			} catch(e) {}
		}

		if (getMetadataOnly) {
			let width = 0, height = 0;
			if (['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(ext) || isHeic) {
				try {
					let metaPath = absolutePath;
					if (isHeic) metaPath = await ensureHeicConverted(absolutePath, stat.mtimeMs, rid, request.signal, isRetry);
					const meta = await sharp(metaPath).metadata();
					width = meta.width || 0; height = meta.height || 0;
					if (meta.orientation && meta.orientation >= 5) [width, height] = [height, width];
				} catch (e) {}
			}
			return json({ name: path.basename(absolutePath), path: normalizedPath, size: stat.size, lastModified: stat.mtimeMs, width, height });
		}

		if (isThumbnail) {
			const thumbPath = await getThumbnailPath(absolutePath, stat.mtimeMs);
			if (!fs.existsSync(thumbPath)) {
				const success = await generateThumbnail(absolutePath, thumbPath, stat.mtimeMs, rid, request.signal);
				if (!success) throw error(404, 'Thumbnail could not be generated');
			}
			const headers = { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' };
			// @ts-ignore
			if (global.Bun) return new Response(Bun.file(thumbPath), { headers });
			return new Response(await fsp.readFile(thumbPath), { headers });
		}

		let servePath = absolutePath;
		let serveStat = stat;
		let contentType = getContentType('.' + ext);

		if (isHeic) {
			servePath = await ensureHeicConverted(absolutePath, stat.mtimeMs, rid, request.signal, isRetry);
			serveStat = await fsp.stat(servePath);
			contentType = 'image/webp';
		}

		const range = request.headers.get('range');
		const isVideo = contentType.startsWith('video/');
		const baseHeaders: any = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };

		if (isVideo) {
			baseHeaders['ETag'] = `"${serveStat.mtimeMs.toString(16)}-${serveStat.size.toString(16)}"`;
			baseHeaders['Cache-Control'] = 'no-cache';
			baseHeaders['Last-Modified'] = new Date(serveStat.mtimeMs).toUTCString();
		} else {
			baseHeaders['Cache-Control'] = 'public, max-age=86400';
		}

		if (range) {
			const parts = range.replace(/bytes=/, '').split('-');
			const start = parseInt(parts[0], 10);
			let end = parts[1] ? parseInt(parts[1], 10) : serveStat.size - 1;
			if (start >= serveStat.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${serveStat.size}` } });
			if (end >= serveStat.size) end = serveStat.size - 1;

			const fileStream = fs.createReadStream(servePath, { start, end });
			const webStream = Readable.toWeb(fileStream);
			request.signal.addEventListener('abort', () => fileStream.destroy(), { once: true });
			baseHeaders['Content-Range'] = `bytes ${start}-${end}/${serveStat.size}`;
			baseHeaders['Content-Length'] = (end - start + 1).toString();
			return new Response(webStream as any, { status: 206, headers: baseHeaders });
		}

		const fileStream = fs.createReadStream(servePath);
		const webStream = Readable.toWeb(fileStream);
		request.signal.addEventListener('abort', () => fileStream.destroy(), { once: true });
		baseHeaders['Content-Length'] = serveStat.size.toString();
		return new Response(webStream as any, { headers: baseHeaders });
	} catch (err: any) {
		if (err?.status) throw err;
		console.error(`[GET ERROR]`, err);
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
