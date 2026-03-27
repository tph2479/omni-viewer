import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { createHash } from "node:crypto";
import yauzl from "yauzl-promise";
import sharp from "sharp";
import { ALLOWED_EXTENSIONS, isImageFile } from "$lib/fileUtils";
import { globalTaskSemaphore } from "./semaphore";

const THUMB_CACHE_DIR = path.resolve(".thumbnails");
if (!fs.existsSync(THUMB_CACHE_DIR)) {
  fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
}

const HEIC_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "mif1",
  "mif2",
  "msf1",
  "msf2",
  "heis",
  "hevm",
]);

const ongoingGenerations = new Map<string, Promise<any>>();

export function isHeicBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // Some HEIC/AVIF start with 00 00 00
  if (buf[0] !== 0x00 || buf[1] !== 0x00 || buf[2] !== 0x00) {
    // Also support some variations
    if (!(buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00)) return false;
  }
  const ftyp = buf.slice(4, 8).toString("ascii");
  if (ftyp !== "ftyp") return false;
  const brand = buf.slice(8, 12).toString("ascii").trim().toLowerCase();
  return HEIC_BRANDS.has(brand);
}

const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "mif1",
  "mif2",
  "msf1",
  "msf2",
  "heis",
  "hevm",
  "avif",
  "avis",
]);

export function isHeifBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[0] !== 0x00 || buf[1] !== 0x00 || buf[2] !== 0x00) {
    if (!(buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00)) return false;
  }
  const ftyp = buf.slice(4, 8).toString("ascii");
  if (ftyp !== "ftyp") return false;
  const brand = buf.slice(8, 12).toString("ascii").trim().toLowerCase();
  return HEIF_BRANDS.has(brand);
}

export function getThumbnailPath(
  inputPath: string,
  mtimeMs: number,
  suffix = "",
) {
  const hash = createHash("md5")
    .update(`${inputPath}-${mtimeMs}${suffix}`)
    .digest("hex");
  return path.join(THUMB_CACHE_DIR, `${hash}.webp`);
}

export async function getArchiveCover(
  archivePath: string,
  mtimeMs: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const thumbPath = getThumbnailPath(archivePath, mtimeMs, "-cover");

  if (fs.existsSync(thumbPath)) return thumbPath;

  return await globalTaskSemaphore.run(async () => {
    if (signal?.aborted) return null;

    let zip: any = null;
    try {
      zip = await yauzl.open(archivePath);
      let firstEntry: any = null;

      for await (const entry of zip) {
        if (signal?.aborted) {
          await zip.close();
          return null;
        }
        if (entry.filename.endsWith("/")) continue;
        if (isImageFile(path.extname(entry.filename).toLowerCase())) {
          firstEntry = entry;
          break;
        }
      }

      if (!firstEntry) {
        await zip.close();
        return null;
      }

      if (signal?.aborted) {
        await zip.close();
        return null;
      }

      const stream = await firstEntry.openReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        if (signal?.aborted) {
          stream.destroy();
          await zip.close();
          return null;
        }
        chunks.push(chunk);
      }
      await zip.close();

      const buffer = Buffer.concat(chunks);
      let sharpInput: any = buffer;

      if (isHeicBuffer(buffer)) {
        try {
          const heicImport = await import("heic-convert");
          const heicConvert = (heicImport.default || heicImport) as any;
          let converted: any = await heicConvert({
            buffer,
            format: "JPEG",
            quality: 0.6,
          });
          sharpInput = Buffer.from(converted);
        } catch (err) {
          console.error("[Archive Cover] HEIC conversion failed:", err);
        }
      }

      await sharp(sharpInput)
        .rotate()
        .resize(200, 200, { fit: "cover", fastShrinkOnLoad: true })
        .webp({ quality: 65, effort: 0 })
        .toFile(thumbPath);

      return thumbPath;
    } catch (e) {
      if (zip) await zip.close().catch(() => {});
      console.error("[Archive Cover Error]:", e);
      return null;
    }
  }, signal);
}

export async function ensureHeicConverted(
  inputPath: string,
  mtimeMs: number,
  signalForWait?: AbortSignal,
  forceRegenerate = false,
): Promise<string> {
  const hash = createHash("md5")
    .update(`${inputPath}-${mtimeMs}-full`)
    .digest("hex");
  const outputPath = path.join(THUMB_CACHE_DIR, `full-${hash}.webp`);

  if (forceRegenerate) {
    try {
      fs.unlinkSync(outputPath);
    } catch (e) {}
  }

  if (ongoingGenerations.has(outputPath)) {
    await ongoingGenerations.get(outputPath);
    if (fs.existsSync(outputPath)) return outputPath;
  }

  if (fs.existsSync(outputPath)) {
    const stat = fs.statSync(outputPath);
    if (stat.size > 128) return outputPath;
    try {
      fs.unlinkSync(outputPath);
    } catch (e) {}
  }

  const conversionPromise = (async () => {
    try {
      return await globalTaskSemaphore.run(async () => {
        if (signalForWait?.aborted) return;

        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 128)
          return;

        let fullBuffer: Buffer;
        if (inputPath.includes("::")) {
          const [zipPath, internalPath] = inputPath.split("::");
          const zip = await yauzl.open(path.resolve(zipPath));
          try {
            let entry: any = null;
            for await (const e of zip) {
              if (e.filename === internalPath) {
                entry = e;
                break;
              }
            }
            if (!entry)
              throw new Error(`Entry ${internalPath} not found in zip`);
            const nodeStream = await entry.openReadStream();
            const chunks: Buffer[] = [];
            for await (const chunk of nodeStream) chunks.push(chunk);
            fullBuffer = Buffer.concat(chunks);
          } finally {
            await zip.close();
          }
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
          try {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          } catch (e) {}
          const heicImport = await import("heic-convert");
          const heicConvert = (heicImport.default || heicImport) as any;
          let converted: any = await heicConvert({
            buffer: fullBuffer,
            format: "JPEG",
            quality: 0.9,
          });
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
      }, signalForWait);
    } catch (err) {
      if (err instanceof Error && err.message === "Aborted") return;
      console.error(`[Conversion Error]`, err);
      throw err;
    }
  })();

  ongoingGenerations.set(outputPath, conversionPromise);
  try {
    await conversionPromise;
  } finally {
    ongoingGenerations.delete(outputPath);
  }
  return outputPath;
}

export async function extractFileFromArchive(
  archivePath: string,
  internalPath: string,
): Promise<NodeJS.ReadableStream> {
  const zip = await yauzl.open(archivePath);
  try {
    let entry: any = null;
    for await (const e of zip) {
      if (e.filename === internalPath) {
        entry = e;
        break;
      }
    }

    if (!entry) {
      await zip.close();
      throw new Error(`Entry ${internalPath} not found in archive`);
    }

    if (entry.isEncrypted && entry.isEncrypted()) {
      await zip.close().catch(() => {});
      throw new Error(
        `Entry ${internalPath} is encrypted and decryption is not supported.`,
      );
    }

    const stream = await entry.openReadStream();
    // Ensure zip is closed when stream ends
    stream.on("end", () => zip.close().catch(() => {}));
    stream.on("error", () => zip.close().catch(() => {}));

    return stream;
  } catch (err: any) {
    await zip.close().catch(() => {});
    throw err;
  }
}
