/**
 * Thumbnail Extractors — spawns FFmpeg to extract video frames and audio cover art,
 * and handles archive cover thumbnails via yauzl.
 *
 * This module is a pure I/O worker. It does not touch HTTP or cache paths —
 * all output is written to a `outputPath` supplied by the caller (thumbnails.ts).
 */
import path from 'node:path';
import yauzl from 'yauzl-promise';

import { isHeicBuffer } from '$lib/server/utils/mediaSniffer';
import { isImageFile } from '$lib/shared/utils/fileUtils';
import { getToolPath } from '$lib/server/database/database';

// ─── Types ────────────────────────────────────────────────────────────────────

type FfmpegResult = { stdout: Buffer | null; stderr: string };

// ─── FFmpeg argument builder ──────────────────────────────────────────────────

/**
 * Builds the FFmpeg argument list for a single-frame extraction.
 *
 * Key flags:
 *   -skip_frame noref   — decode only keyframes during seek
 *   -noaccurate_seek    — snap to nearest keyframe (faster than forward-decode)
 *   -threads 1          — avoid thread-pool overhead for a single-frame job
 *   scale=300:-2        — pre-downscale in FFmpeg; pipe carries ~10 KB not 6 MB
 *   -q:v 5              — fast MJPEG encode (sharp re-encodes to WebP anyway)
 *   setparams filter    — forces BT.709 to bypass 'reserved' metadata errors (swscaler -129)
 */
export function buildFfmpegArgs(inputPath: string, isVideo: boolean): string[] {
    const videoFilters = isVideo
        ? 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709,scale=300:-2:sws_flags=bilinear,format=yuv420p'
        : 'scale=300:-2:sws_flags=bilinear,format=yuv420p';

    return [
        '-hide_banner', '-loglevel', 'error',
        '-skip_frame', 'noref',
        '-noaccurate_seek',
        '-threads', '1',
        '-an', '-sn',
        ...(isVideo ? ['-ss', '00:00:02'] : []),
        '-i', inputPath,
        '-map', '0:v:0',
        '-vf', videoFilters,
        '-frames:v', '1',
        '-q:v', '5',
        '-f', 'image2',
        '-vcodec', 'mjpeg',
        'pipe:1',
    ];
}

// ─── FFmpeg process runners ───────────────────────────────────────────────────

async function runFfmpegBun(
    ffmpegPath: string,
    args: string[],
    signal?: AbortSignal,
): Promise<FfmpegResult> {
    const Bun  = (globalThis as any).Bun;
    const proc = Bun.spawn([ffmpegPath, ...args], { stdout: 'pipe', stderr: 'pipe' });

    const onAbort = () => proc.kill();
    signal?.addEventListener('abort', onAbort, { once: true });

    const [stdoutBuf, stderr] = await Promise.all([
        new Response(proc.stdout).arrayBuffer(),
        new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    signal?.removeEventListener('abort', onAbort);

    if (proc.exitCode !== 0 || stdoutBuf.byteLength === 0) return { stdout: null, stderr };
    return { stdout: Buffer.from(stdoutBuf), stderr };
}

async function runFfmpegNode(
    ffmpegPath: string,
    args: string[],
    signal?: AbortSignal,
): Promise<FfmpegResult> {
    const { spawn } = await import('node:child_process');
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    if (!proc.stdout || !proc.stderr) throw new Error('[FFmpeg] Failed to open stdio streams');

    const chunks: Buffer[] = [];
    let stderrStr = '';
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d: Buffer) => (stderrStr += d.toString()));

    const onAbort = () => proc.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });

    const exitCode = await new Promise<number>((resolve) => {
        proc.on('close', (code) => {
            signal?.removeEventListener('abort', onAbort);
            resolve(code ?? 1);
        });
    });

    if (exitCode !== 0 || chunks.length === 0) return { stdout: null, stderr: stderrStr };
    return { stdout: Buffer.concat(chunks), stderr: stderrStr };
}

/**
 * Runs FFmpeg and returns `{ stdout, stderr }`.
 * `stdout` is `null` if the process failed or produced no output.
 * Dispatches to Bun or Node implementation based on the runtime.
 * Kills the process if the AbortSignal fires.
 */
export async function runFfmpeg(
    ffmpegPath: string,
    args: string[],
    signal?: AbortSignal,
): Promise<FfmpegResult> {
    return (globalThis as any).Bun
        ? runFfmpegBun(ffmpegPath, args, signal)
        : runFfmpegNode(ffmpegPath, args, signal);
}

// ─── Per-type extractors ──────────────────────────────────────────────────────

/** Extracts a keyframe from a video file and saves it as a WebP thumbnail. */
export async function extractVideoFrame(
    inputPath: string,
    outputPath: string,
    saveWebp: (input: Buffer | string, out: string) => Promise<void>,
    signal?: AbortSignal,
): Promise<boolean> {
    const ffmpegBin = (await getToolPath('ffmpeg')) || 'ffmpeg';
    const result    = await runFfmpeg(ffmpegBin, buildFfmpegArgs(inputPath, true), signal);

    if (!result.stdout) {
        console.error(`[FFmpeg/Video] ${inputPath}: ${result.stderr.trim()}`);
        return false;
    }
    await saveWebp(result.stdout, outputPath);
    return true;
}

/**
 * Extracts embedded cover art from an audio file.
 * Audio without cover art returns `false` silently — that is not an error.
 */
export async function extractAudioCover(
    inputPath: string,
    outputPath: string,
    saveWebp: (input: Buffer | string, out: string) => Promise<void>,
    signal?: AbortSignal,
): Promise<boolean> {
    const ffmpegBin = (await getToolPath('ffmpeg')) || 'ffmpeg';
    const result    = await runFfmpeg(ffmpegBin, buildFfmpegArgs(inputPath, false), signal);

    if (!result.stdout) {
        const isExpectedNoArt =
            !result.stderr ||
            result.stderr.trim() === '' ||
            result.stderr.includes('Output file is empty') ||
            result.stderr.includes('matches no streams');
        if (!isExpectedNoArt) console.error(`[FFmpeg/Audio] ${inputPath}: ${result.stderr.trim()}`);
        return false;
    }
    await saveWebp(result.stdout, outputPath);
    return true;
}

/**
 * Extracts the cover image from an archive or EPUB and saves it as WebP.
 * For EPUB, prefers entries whose filename contains "cover".
 */
export async function extractArchiveCoverThumb(
    archivePath: string,
    outputPath: string,
    saveWebp: (input: Buffer | string, out: string) => Promise<void>,
    signal?: AbortSignal,
): Promise<boolean> {
    let zip: any = null;
    try {
        zip = await yauzl.open(archivePath);
        let firstEntry: any  = null;
        let coverEntry: any  = null;
        const isEpub = archivePath.toLowerCase().endsWith('.epub');

        for await (const entry of zip) {
            if (signal?.aborted) { await zip.close(); return false; }
            if (entry.filename.endsWith('/')) continue;
            const ext = path.extname(entry.filename).toLowerCase();
            if (isImageFile(ext)) {
                if (!firstEntry) firstEntry = entry;
                if (isEpub && entry.filename.toLowerCase().includes('cover')) {
                    coverEntry = entry;
                    break;
                } else if (!isEpub) {
                    break;
                }
            }
        }

        const targetEntry = isEpub ? (coverEntry || firstEntry) : firstEntry;
        if (!targetEntry) { await zip.close(); return false; }
        if (signal?.aborted) { await zip.close(); return false; }

        const stream = await targetEntry.openReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            if (signal?.aborted) { stream.destroy(); await zip.close(); return false; }
            chunks.push(chunk);
        }
        await zip.close();

        let sharpInput: any = Buffer.concat(chunks);

        // HEIC images inside archives need conversion before Sharp can process them
        if (isHeicBuffer(sharpInput)) {
            try {
                const heicImport  = await import('heic-convert');
                const heicConvert = (heicImport.default || heicImport) as any;
                let converted: any = await heicConvert({ buffer: sharpInput, format: 'JPEG', quality: 0.6 });
                sharpInput = Buffer.from(converted);
            } catch (err) {
                console.error('[Archive Cover] HEIC conversion failed:', err);
            }
        }

        await saveWebp(sharpInput, outputPath);
        return true;
    } catch (e) {
        if (zip) await zip.close().catch(() => {});
        console.error(`[Archive Cover Error] ${archivePath}:`, e);
        return false;
    }
}
