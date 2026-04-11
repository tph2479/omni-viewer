import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  isHeifBuffer,
  isAvifBuffer,
  getThumbnailPath,
  ensureHeicConverted,
  THUMB_CACHE_DIR,
} from "./imageUtils";
import { globalTaskSemaphore } from "$lib/server/utils/semaphore";
import { isVideoFile, isAudioFile, isImageFile, isPdfFile } from "$lib/utils/fileUtils";
import { renderPdfFirstPage } from "$lib/server/pdf/pdfRenderer";

const ongoingGenerations = new Map<string, Promise<boolean>>();
function ensureThumbDir() {
  if (!fs.existsSync(THUMB_CACHE_DIR)) {
    fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
  }
}

export async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  mtimeMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  if (ongoingGenerations.has(outputPath))
    return ongoingGenerations.get(outputPath) as Promise<boolean>;

  const generationPromise = (async (): Promise<boolean> => {
    try {
      if (signal?.aborted) return false;

      const ext = path.extname(inputPath).toLowerCase();

      if (isVideoFile(ext) || isAudioFile(ext)) {
        try {
          const res = await globalTaskSemaphore.run(async () => {
            if (signal?.aborted) throw new Error("Aborted");
            const ffmpegArgs = [
              "-hide_banner",
              "-loglevel",
              "error",
              "-an",
              "-sn",
              ...(isVideoFile(ext) ? ["-ss", "00:00:02"] : []),
              "-i",
              inputPath,
              "-map",
              "0:v:0",
              "-frames:v",
              "1",
              "-f",
              "image2",
              "-vcodec",
              "mjpeg",
              "pipe:1",
            ];

            // @ts-ignore
            if (globalThis.Bun) {
              // Use Bun.spawn for better efficiency on Windows when using Bun
              // @ts-ignore
              const proc = Bun.spawn(["ffmpeg", ...ffmpegArgs], {
                stdout: "pipe",
                stderr: "pipe",
                onExit: (proc: any) => {
                  if (signal?.aborted) proc.kill();
                },
              });

              if (signal)
                signal.addEventListener("abort", () => proc.kill(), {
                  once: true,
                });

              const stdoutPromise = new Response(proc.stdout).arrayBuffer();
              const stderrPromise = new Response(proc.stderr).text();

              await proc.exited;

              const stdout = await stdoutPromise;
              const stderr = await stderrPromise;

              if (proc.exitCode !== 0 || stdout.byteLength === 0) {
                const isNoCoverArt =
                  isAudioFile(ext) &&
                  (stderr.includes("Output file is empty") ||
                    stderr.includes("matches no streams") ||
                    (stdout.byteLength === 0 && stderr.trim() === ""));
                if (!isNoCoverArt) {
                  console.error(
                    `[FFmpeg Error] ${inputPath}: ${stderr.trim()}`,
                  );
                }
                return false;
              }

              ensureThumbDir();
              await sharp(Buffer.from(stdout))
                .rotate()
                .resize(200, 200, { fit: "cover", fastShrinkOnLoad: true })
                .webp({ quality: 65, effort: 0 })
                .toFile(outputPath);
            } else {
              // Fallback for non-Bun environments (Node.js)
              const { spawn } = await import("node:child_process");
              const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
                stdio: ["ignore", "pipe", "pipe"],
              });
              const chunks: Buffer[] = [];
              let stderrStr = "";

              ffmpeg.stdout.on("data", (d) => chunks.push(d));
              ffmpeg.stderr.on("data", (d) => {
                stderrStr += d.toString();
              });

              const killFFmpeg = () => ffmpeg.kill("SIGKILL");
              if (signal)
                signal.addEventListener("abort", killFFmpeg, { once: true });

              const success = await new Promise<boolean>((resolve) => {
                ffmpeg.on("close", (code) => {
                  if (signal) signal.removeEventListener("abort", killFFmpeg);
                  resolve(code === 0 && chunks.length > 0);
                });
              });

              if (!success || signal?.aborted) return false;

              ensureThumbDir();
              await sharp(Buffer.concat(chunks))
                .rotate()
                .resize(200, 200, { fit: "cover", fastShrinkOnLoad: true })
                .webp({ quality: 65, effort: 0 })
                .toFile(outputPath);
            }
            return true;
          });
          if (!res) return false;
        } catch (e) {
          return false;
        }
      } else if (isPdfFile(ext)) {
        try {
          const res = await globalTaskSemaphore.run(async () => {
            if (signal?.aborted) throw new Error("Aborted");
            const buf = await renderPdfFirstPage(inputPath, 250);
            ensureThumbDir();
            await sharp(buf)
                .rotate()
                .resize(200, 200, { fit: "cover", fastShrinkOnLoad: true })
                .webp({ quality: 65, effort: 0 })
                .toFile(outputPath);
            return true;
          });
          if (!res) return false;
        } catch (e: any) {
          if (e instanceof Error && e.message === "Aborted") return false;
          console.error(`[PDF Render Error] ${inputPath}:`, e);
          return false;
        }
      } else {
        let sharpInput: any = inputPath;
        let isHeif = ext === ".heic" || ext === ".heif";

        if (inputPath.includes("::")) {
          sharpInput = await ensureHeicConverted(inputPath, mtimeMs, signal);
        } else {
          if (!isHeif && isImageFile(inputPath)) {
            try {
              const header = Buffer.alloc(256);
              const fd = fs.openSync(inputPath, "r");
              fs.readSync(fd, header, 0, 256, 0);
              fs.closeSync(fd);
              isHeif = isHeifBuffer(header);
              if (isAvifBuffer(header)) isHeif = false;
            } catch (e) {}
          }
          if (isHeif) {
            sharpInput = await ensureHeicConverted(inputPath, mtimeMs, signal);
          }
        }

        if (signal?.aborted) return false;

        try {
          ensureThumbDir();
          await sharp(sharpInput)
            .rotate()
            .resize(200, 200, { fit: "cover", fastShrinkOnLoad: true })
            .webp({ quality: 65, effort: 0 })
            .toFile(outputPath);
        } catch (sharpErr) {
          console.error(`[Sharp Thumb Error]`, sharpErr);
          if (!fs.existsSync(outputPath)) throw sharpErr;
        }
        sharpInput = null;
      }

      if (signal?.aborted) return false;

      if (mtimeMs) {
        const atime = Date.now() / 1000;
        const mtime = mtimeMs / 1000;
        await fsp.utimes(outputPath, atime, mtime).catch(() => {});
      }
      return true;
    } catch (err) {
      if (err instanceof Error && err.message === "Aborted") return false;
      console.error(`[Thumbnail Error] ${inputPath}:`, err);
      return false;
    }
  })();

  ongoingGenerations.set(outputPath, generationPromise);
  try {
    return await generationPromise;
  } finally {
    ongoingGenerations.delete(outputPath);
  }
}
