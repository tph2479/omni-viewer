import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { isHeifBuffer, getThumbnailPath, ensureHeicConverted } from '$lib/server/archiveUtils';

const MAX_CONCURRENT_THUMBS = 4;
let activeGenerations = 0;
const generationQueue: (() => void)[] = [];
const ongoingGenerations = new Map<string, Promise<boolean>>();

export async function generateThumbnail(inputPath: string, outputPath: string, mtimeMs: number, signal?: AbortSignal): Promise<boolean> {
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
					sharpInput = await ensureHeicConverted(inputPath, mtimeMs, signal);
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
						sharpInput = await ensureHeicConverted(inputPath, mtimeMs, signal);
					}
				}
				
				if (!signal?.aborted) {
					try {
						await sharp(sharpInput)
							.rotate()
							.resize(200, 200, { fit: 'cover', fastShrinkOnLoad: true })
							.webp({ quality: 65, effort: 0 })
							.toFile(outputPath);
					} catch (sharpErr) {
						console.error(`[Sharp Thumb Error]`, sharpErr);
						if (!fs.existsSync(outputPath)) throw sharpErr;
					}
				}
				sharpInput = null;
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
			if (globalThis.Bun) { globalThis.Bun.gc(true); }
		}
	})();

	ongoingGenerations.set(outputPath, generationPromise);
	try {
		return await generationPromise;
	} finally {
		ongoingGenerations.delete(outputPath);
	}
}
