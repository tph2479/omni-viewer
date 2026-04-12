import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  isHeifBuffer,
  isAvifBuffer,
  ensureHeicConverted,
  THUMB_CACHE_DIR,
} from "./imageUtils";
import { globalTaskSemaphore } from "$lib/server/utils/semaphore";
import { isVideoFile, isAudioFile, isImageFile, isPdfFile, isCbzFile, isEpubFile } from "$lib/utils/fileUtils";
import { renderPdfPage } from "$lib/server/pdf/pdfRenderer";
import { getToolPath } from "$lib/server/database/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FfmpegResult = { stdout: Buffer | null; stderr: string };

// ---------------------------------------------------------------------------
// De-duplicate in-flight requests for the same output path.
// ---------------------------------------------------------------------------

const ongoingGenerations = new Map<string, Promise<boolean>>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureThumbDir(): void {
  // mkdirSync with recursive:true is a no-op when the directory already exists.
  fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
}

/**
 * Shared sharp pipeline: EXIF-rotate → cover-crop 200×200 → save as WebP.
 * Used by every source type so quality and size are consistent.
 */
async function saveThumbWebp(input: Buffer | string, outputPath: string): Promise<void> {
  ensureThumbDir();
  await sharp(input)
    .rotate()
    .resize(200, 200, { fit: "cover", fastShrinkOnLoad: true })
    .webp({ quality: 65, effort: 0 })
    .toFile(outputPath);
}

// ---------------------------------------------------------------------------
// FFmpeg runner — Bun and Node paths separated for clarity
// ---------------------------------------------------------------------------

/**
 * FFmpeg args shared between video and audio thumbnail extraction.
 *
 * Key speed flags (all before -i):
 *   -skip_frame noref  — skip B/P frames during seek, decode only keyframes
 *   -noaccurate_seek   — snap to nearest keyframe, no forward-decode to exact ts
 *   -threads 1         — avoid thread-pool overhead for a single-frame job
 *
 * Output pipeline:
 *   scale=300:-2       — pre-downscale in FFmpeg; pipe carries ~10 KB not 6 MB
 *   -q:v 5             — fast MJPEG encode (sharp re-encodes to WebP anyway)
 *   -pix_fmt yuv420p   — fixes swscaler error -129 on videos with non-standard
 *                        color primaries / transfer characteristics
 */
function buildFfmpegArgs(inputPath: string, isVideo: boolean): string[] {
  return [
    "-hide_banner", "-loglevel", "error",
    "-skip_frame", "noref",
    "-noaccurate_seek",
    "-threads", "1",
    "-an", "-sn",
    ...(isVideo ? ["-ss", "00:00:02"] : []),
    "-i", inputPath,
    "-map", "0:v:0",
    "-vf", "scale=300:-2:sws_flags=bilinear",
    "-pix_fmt", "yuv420p",
    "-frames:v", "1",
    "-q:v", "5",
    "-f", "image2",
    "-vcodec", "mjpeg",
    "pipe:1",
  ];
}

async function runFfmpegBun(
  ffmpegPath: string,
  args: string[],
  signal?: AbortSignal,
): Promise<FfmpegResult> {
  const Bun = (globalThis as any).Bun;
  const proc = Bun.spawn([ffmpegPath, ...args], { stdout: "pipe", stderr: "pipe" });

  const onAbort = () => proc.kill();
  signal?.addEventListener("abort", onAbort, { once: true });

  const [stdoutBuf, stderr] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
  ]);

  await proc.exited;
  signal?.removeEventListener("abort", onAbort);

  if (proc.exitCode !== 0 || stdoutBuf.byteLength === 0) {
    return { stdout: null, stderr };
  }
  return { stdout: Buffer.from(stdoutBuf), stderr };
}

async function runFfmpegNode(
  ffmpegPath: string,
  args: string[],
  signal?: AbortSignal,
): Promise<FfmpegResult> {
  const { spawn } = await import("node:child_process");
  const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });

  // stdio is always "pipe" here, but the ChildProcess types are nullable.
  if (!proc.stdout || !proc.stderr) {
    throw new Error("[FFmpeg] Failed to open stdio streams");
  }

  const chunks: Buffer[] = [];
  let stderrStr = "";
  proc.stdout.on("data", (d: Buffer) => chunks.push(d));
  proc.stderr.on("data", (d: Buffer) => (stderrStr += d.toString()));

  const onAbort = () => proc.kill("SIGKILL");
  signal?.addEventListener("abort", onAbort, { once: true });

  const exitCode = await new Promise<number>((resolve) => {
    proc.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      resolve(code ?? 1);
    });
  });

  if (exitCode !== 0 || chunks.length === 0) {
    return { stdout: null, stderr: stderrStr };
  }
  return { stdout: Buffer.concat(chunks), stderr: stderrStr };
}

/**
 * Run FFmpeg and return { stdout, stderr }.
 * stdout is null if the process failed or produced no output.
 * Dispatches to the Bun or Node implementation depending on the runtime.
 * Kills the process if the AbortSignal fires.
 */
async function runFfmpeg(
  ffmpegPath: string,
  args: string[],
  signal?: AbortSignal,
): Promise<FfmpegResult> {
  if ((globalThis as any).Bun) {
    return runFfmpegBun(ffmpegPath, args, signal);
  }
  return runFfmpegNode(ffmpegPath, args, signal);
}

// ---------------------------------------------------------------------------
// Per-type thumbnail extractors
// ---------------------------------------------------------------------------

/** Extract a frame from a video file and save it as a WebP thumbnail. */
async function extractVideoFrame(
  inputPath: string,
  outputPath: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const ffmpegBin = (await getToolPath("ffmpeg")) || "ffmpeg";
  const result = await runFfmpeg(ffmpegBin, buildFfmpegArgs(inputPath, true), signal);

  if (!result.stdout) {
    console.error(`[FFmpeg/Video] ${inputPath}: ${result.stderr.trim()}`);
    return false;
  }

  await saveThumbWebp(result.stdout, outputPath);
  return true;
}

/**
 * Extract embedded cover art from an audio file.
 * Audio without cover art silently returns false — that is not an error.
 */
async function extractAudioCover(
  inputPath: string,
  outputPath: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const ffmpegBin = (await getToolPath("ffmpeg")) || "ffmpeg";
  const result = await runFfmpeg(ffmpegBin, buildFfmpegArgs(inputPath, false), signal);

  if (!result.stdout) {
    const isExpectedNoArt =
      !result.stderr ||
      result.stderr.trim() === "" ||
      result.stderr.includes("Output file is empty") ||
      result.stderr.includes("matches no streams");

    if (!isExpectedNoArt) {
      console.error(`[FFmpeg/Audio] ${inputPath}: ${result.stderr.trim()}`);
    }
    return false;
  }

  await saveThumbWebp(result.stdout, outputPath);
  return true;
}

/** Render the first page of a PDF as a WebP thumbnail. */
async function renderPdfThumb(inputPath: string, outputPath: string): Promise<boolean> {
  const buf = await renderPdfPage(inputPath, 1, 250);
  await saveThumbWebp(buf, outputPath);
  return true;
}

/**
 * Render an image file (including HEIC/HEIF) as a WebP thumbnail.
 * Also handles archive paths (e.g. "archive.cbz::page.jpg").
 */
async function renderImageThumb(
  inputPath: string,
  outputPath: string,
  mtimeMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  let sharpInput: string | Buffer = inputPath;

  if (inputPath.includes("::")) {
    // Archive path — ensureHeicConverted handles extraction.
    sharpInput = await ensureHeicConverted(inputPath, mtimeMs, signal);
  } else {
    const lowerPath = inputPath.toLowerCase();
    let isHeif = lowerPath.endsWith(".heic") || lowerPath.endsWith(".heif");

    // Sniff magic bytes for HEIF containers with an unexpected extension.
    if (!isHeif && isImageFile(inputPath)) {
      try {
        const header = Buffer.alloc(256);
        const fd = fs.openSync(inputPath, "r");
        fs.readSync(fd, header, 0, 256, 0);
        fs.closeSync(fd);
        isHeif = isHeifBuffer(header) && !isAvifBuffer(header);
      } catch { /* non-fatal */ }
    }

    if (isHeif) {
      sharpInput = await ensureHeicConverted(inputPath, mtimeMs, signal);
    }
  }

  if (signal?.aborted) return false;

  try {
    await saveThumbWebp(sharpInput, outputPath);
  } catch (err) {
    console.error("[Sharp Thumb Error]", err);
    // Partial writes may still be usable; only rethrow if nothing was written.
    if (!fs.existsSync(outputPath)) throw err;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  mtimeMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  // Reuse an in-flight promise for the same output path.
  const existing = ongoingGenerations.get(outputPath);
  if (existing) return existing;

  const work = _generate(inputPath, outputPath, mtimeMs, signal);
  ongoingGenerations.set(outputPath, work);
  try {
    return await work;
  } finally {
    ongoingGenerations.delete(outputPath);
  }
}

async function _generate(
  inputPath: string,
  outputPath: string,
  mtimeMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return false;

  const ext = path.extname(inputPath).toLowerCase();

  try {
    let ok: boolean;

    if (isVideoFile(ext)) {
      ok = await globalTaskSemaphore.run(async () => {
        if (signal?.aborted) return false;
        return extractVideoFrame(inputPath, outputPath, signal);
      });
    } else if (isAudioFile(ext)) {
      ok = await globalTaskSemaphore.run(async () => {
        if (signal?.aborted) return false;
        return extractAudioCover(inputPath, outputPath, signal);
      });
    } else if (isPdfFile(ext)) {
      ok = await globalTaskSemaphore.run(async () => {
        if (signal?.aborted) return false;
        return renderPdfThumb(inputPath, outputPath);
      });
    } else if (isCbzFile(ext) || isEpubFile(ext)) {
      // For archive-based ebooks, we extract the cover as a thumbnail
      const { getArchiveCover } = await import("./ebook");
      const coverPath = await getArchiveCover(inputPath, mtimeMs, signal);
      if (coverPath && fs.existsSync(coverPath)) {
        await fsp.copyFile(coverPath, outputPath);
        ok = true;
      } else {
        ok = false;
      }
    } else {
      ok = await renderImageThumb(inputPath, outputPath, mtimeMs, signal);
    }

    if (!ok || signal?.aborted) return false;

    // Stamp the output file with the source's mtime so cache invalidation works.
    if (mtimeMs) {
      await fsp
        .utimes(outputPath, Date.now() / 1000, mtimeMs / 1000)
        .catch(() => {});
    }

    return true;
  } catch (err) {
    if (err instanceof Error && err.message === "Aborted") return false;
    console.error(`[Thumbnail Error] ${inputPath}:`, err);
    return false;
  }
}
