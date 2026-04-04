import { error, json } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { getContentType, isImageFile } from "$lib/fileUtils";
import { isHeifBuffer, isAvifBuffer, getThumbnailPath, THUMB_CACHE_DIR } from "$lib/server/archiveUtils";

import { findFolderCover } from "$lib/server/fileUtils.server";

import { generateThumbnail } from "./handlers/thumbnail";
import { handleMetadata } from "./handlers/metadata";
import { handleImage } from "./handlers/image";
import { handleStream } from "./handlers/stream";

// THUMB_CACHE_DIR is imported from archiveUtils

export async function GET({ url, request }: RequestEvent) {
  try {
    const imagePath = url.searchParams.get("path");
    const isThumbnail = url.searchParams.get("thumbnail") === "true";
    const getMetadataOnly = url.searchParams.get("metadata") === "true";
    const isRetry = !!url.searchParams.get("retry");

    if (!imagePath) throw error(400, "Missing path");

    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(imagePath);
    } catch (e) {
      decodedPath = imagePath;
    }

    const normalizedPath = decodedPath.replace(/\\/g, "/");
    const isZipPath = normalizedPath.includes("::");
    let [actualFilePath, internalPath] = isZipPath
      ? normalizedPath.split("::")
      : [normalizedPath, null];

    let absolutePath =
      actualFilePath.startsWith("/") || /^[a-zA-Z]:/.test(actualFilePath)
        ? actualFilePath
        : path.resolve(actualFilePath);

    if (!fs.existsSync(absolutePath)) throw error(404, "File not found");
    let stat = await fsp.stat(absolutePath);

    // If it's a directory and we want a thumbnail, find a cover image inside it
    if (stat.isDirectory() && isThumbnail) {
        const coverPath = await findFolderCover(absolutePath);
        if (!coverPath) return new Response(null, { status: 204 });
        
        absolutePath = coverPath;
        stat = await fsp.stat(absolutePath);
        // Reset internalPath as we've resolved to a real file
        internalPath = null;
    }

    const filename = internalPath || path.basename(absolutePath);
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    let isHeic = ext === "heic" || ext === "heif";
    let isAvif = ext === "avif";

    if (isZipPath) {
      // Redirect archive requests to api/ebook
      return new Response(null, {
        status: 307,
        headers: { Location: `/api/ebook?${url.searchParams.toString()}` },
      });
    }

    if (
      !isThumbnail &&
      isImageFile(filename)
    ) {
      try {
        const header = Buffer.alloc(256);
        const fd = fs.openSync(absolutePath, "r");
        fs.readSync(fd, header, 0, 256, 0);
        fs.closeSync(fd);
        if (isHeifBuffer(header)) isHeic = true;
        if (isAvifBuffer(header)) {
            isAvif = true;
            isHeic = false;
        }
      } catch (e) {}
    }

    if (getMetadataOnly) {
      return handleMetadata(
        absolutePath,
        normalizedPath,
        stat,
        ext,
        isHeic,
        request.signal,
        isRetry,
      );
    }

    if (isThumbnail) {
      const thumbPath = await getThumbnailPath(absolutePath, stat.mtimeMs);
      if (!fs.existsSync(thumbPath)) {
        const success = await generateThumbnail(
          absolutePath,
          thumbPath,
          stat.mtimeMs,
          request.signal,
        );
        if (!success) return new Response(null, { status: 204 });
      }
      const headers = {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      };
      // @ts-ignore
      if ((globalThis as any).Bun)
        return new Response((globalThis as any).Bun.file(thumbPath), { headers });
      return new Response(await fsp.readFile(thumbPath), { headers });
    }

    const contentType = isAvif ? "image/avif" : getContentType("." + ext);
    const isVideo = contentType.startsWith("video/");
    const isAudio = contentType.startsWith("audio/");

    if (isVideo || isAudio) {
      return handleStream(
        absolutePath,
        stat,
        contentType,
        request.headers.get("range"),
        request.signal,
      );
    }

    return handleImage(
      absolutePath,
      stat,
      contentType,
      isHeic,
      request.signal,
      isRetry,
    );
  } catch (err: any) {
    if (err?.status) throw err;
    console.error(`[GET ERROR]`, err);
    throw error(500, `Internal error: ${err?.message || "Unknown error"}`);
  }
}

export async function DELETE() {
  try {
    if (fs.existsSync(THUMB_CACHE_DIR)) {
      await fsp.rm(THUMB_CACHE_DIR, { recursive: true, force: true });
      await fsp.mkdir(THUMB_CACHE_DIR, { recursive: true });
    }
    return json({ success: true });
  } catch (err: any) {
    console.error(`[DELETE ERROR]`, err);
    throw error(500, `Failed to clear cache: ${err?.message || "Unknown error"}`);
  }
}
