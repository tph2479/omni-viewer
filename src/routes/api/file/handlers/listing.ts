import { error, json } from "@sveltejs/kit";
import fs from "node:fs/promises";
import path from "node:path";
import yauzl from "yauzl-promise";
import {
  ALLOWED_EXTENSIONS,
  isImageFile,
  isVideoFile,
  isAudioFile,
  isPdfFile,
  isEpubFile,
  isCbzFile,
} from "$lib/fileUtils";

export async function handleListing(
  folderPath: string,
  page: number,
  limit: number,
  sortBy: string,
  typeFilter: string,
  imagesOnly: boolean,
  exclusiveType: string | null = null,
) {
  const stat = await fs.stat(folderPath);
  let imageDetails: any[] = [];

  if (stat.isFile() && isCbzFile(path.extname(folderPath))) {
    const zip = await yauzl.open(folderPath);
    try {
      for await (const entry of zip) {
        const ext = path.extname(entry.filename).toLowerCase();
        if (
          ALLOWED_EXTENSIONS.has(ext) &&
          isImageFile(ext) // Inside CBZ/Zip we only care about images for now (as per original logic it seems, although it excluded mp4/webm explicitly)
        ) {
          imageDetails.push({
            name: entry.filename,
            path: `${folderPath}::${entry.filename}`,
            size: entry.uncompressedSize,
            mtime: Date.now(),
            isDir: false,
          });
        }
      }
    } finally {
      await zip.close();
    }
  } else if (stat.isDirectory()) {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const CHUNK_SIZE_STAT = 50;

    for (let i = 0; i < entries.length; i += CHUNK_SIZE_STAT) {
      const chunk = entries.slice(i, i + CHUNK_SIZE_STAT);
      const results = await Promise.all(
        chunk.map(async (entry: any) => {
          const fullPath = path.join(folderPath, entry.name);
          const ext = path.extname(entry.name).toLowerCase();
          const isDir = entry.isDirectory();
          const isCbz = !isDir && isCbzFile(ext);
          const isVideo = !isDir && isVideoFile(ext);
          const isAudio = !isDir && isAudioFile(ext);
          const isPdf = !isDir && isPdfFile(ext);
          const isEpub = !isDir && isEpubFile(ext);

          let isAllowed =
            isDir ||
            isCbz ||
            isAudio ||
            isPdf ||
            isEpub ||
            ALLOWED_EXTENSIONS.has(ext);

          if (!isDir) {
            if (
              typeFilter === "images" &&
              (isVideo || isAudio || isPdf || isEpub || isCbz)
            )
              isAllowed = false;
            if (typeFilter === "videos" && !isVideo) isAllowed = false;
            if (typeFilter === "audio" && !isAudio) isAllowed = false;
            if (typeFilter === "ebook" && !isPdf && !isEpub && !isCbz)
              isAllowed = false;
          }

          if (isAllowed) {
            if (
              imagesOnly &&
              (isDir || isVideo || isAudio || isCbz || isPdf || isEpub)
            )
              return null;

            if (exclusiveType) {
              if (exclusiveType === "folders" && !isDir) return null;
              if (exclusiveType !== "folders" && isDir) return null;
              if (
                exclusiveType === "images" &&
                (isVideo || isAudio || isCbz || isPdf || isEpub)
              )
                return null;
              if (exclusiveType === "cbz" && !isCbz) return null;
              if (exclusiveType === "pdf" && !isPdf) return null;
              if (exclusiveType === "epub" && !isEpub) return null;
              if (exclusiveType === "audio" && !isAudio) return null;
              if (exclusiveType === "videos" && !isVideo) return null;
            }

            try {
              const entryStat = await fs.stat(fullPath);
              let firstCbz: string | undefined;
              
              if (isDir) {
                const subEntries = await fs.readdir(fullPath);
                const cbzFiles = subEntries
                  .filter(f => isCbzFile(f))
                  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
                
                if (cbzFiles.length > 0) {
                  firstCbz = path.join(fullPath, cbzFiles[0]);
                }
              }

              return {
                name: entry.name,
                path: fullPath,
                mtime: entryStat.mtimeMs,
                size: entryStat.size,
                isDir,
                isCbz,
                isVideo,
                isAudio,
                isPdf,
                isEpub,
                firstCbz,
              };
            } catch (e) {
              return null;
            }
          }
          return null;
        }),
      );
      imageDetails.push(...results.filter(Boolean));
    }
  } else {
    throw error(400, "Invalid path");
  }

  imageDetails.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    if (sortBy === "date_desc") return b.mtime - a.mtime;
    if (sortBy === "date_asc") return a.mtime - b.mtime;
    if (sortBy === "name_asc")
      return a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    if (sortBy === "name_desc")
      return b.name.localeCompare(a.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    return 0;
  });

  const start = page * limit;
  const end = start + limit;
  const totalCount = imageDetails.length;
  const totalImagesCount = imageDetails.filter(
    (item) =>
      !item.isDir &&
      !item.isCbz &&
      !item.isVideo &&
      !item.isAudio &&
      !item.isPdf &&
      !item.isEpub,
  ).length;
  const totalVideosCount = imageDetails.filter((item) => item.isVideo).length;
  const totalAudioCount = imageDetails.filter((item) => item.isAudio).length;
  const totalEbookCount = imageDetails.filter(
    (item) => item.isPdf || item.isEpub || item.isCbz,
  ).length;

  // Conditional Grouping
  let isGrouped = false;
  let groupedResponse: Record<string, any> | null = null;

  if (!exclusiveType) {
    const folders = imageDetails.filter((i) => i.isDir);
    const images = imageDetails.filter(
      (i) =>
        !i.isDir &&
        !i.isCbz &&
        !i.isVideo &&
        !i.isAudio &&
        !i.isPdf &&
        !i.isEpub,
    );
    const cbz = imageDetails.filter((i) => i.isCbz);
    const pdf = imageDetails.filter((i) => i.isPdf);
    const epub = imageDetails.filter((i) => i.isEpub);
    const audio = imageDetails.filter((i) => i.isAudio);
    const videos = imageDetails.filter((i) => i.isVideo);

    const groupsArray = [
      { type: "folders", items: folders },
      { type: "images", items: images },
      { type: "cbz", items: cbz },
      { type: "pdf", items: pdf },
      { type: "epub", items: epub },
      { type: "audio", items: audio },
      { type: "videos", items: videos },
    ];

    const activeGroupsCount = groupsArray.filter(
      (g) => g.items.length > 0,
    ).length;

    if (activeGroupsCount > 1) {
      isGrouped = true;
      groupedResponse = {};
      for (const g of groupsArray) {
        if (g.items.length > 0) {
          groupedResponse[g.type] = {
            total: g.items.length,
            items: g.items.slice(0, 11).map((item) => ({
              name: item.name,
              path: item.path,
              isDir: item.isDir,
              isCbz: item.isCbz,
              isVideo: item.isVideo,
              isAudio: item.isAudio,
              isPdf: item.isPdf,
              isEpub: item.isEpub,
              firstCbz: item.firstCbz,
              size: item.size,
              lastModified: item.mtime,
            })),
          };
        }
      }
    }
  }

  const paginatedImages = imageDetails.slice(start, end).map((item) => ({
    name: item.name,
    path: item.path,
    isDir: item.isDir,
    isCbz: item.isCbz,
    isVideo: item.isVideo,
    isAudio: item.isAudio,
    isPdf: item.isPdf,
    isEpub: item.isEpub,
    firstCbz: item.firstCbz,
    size: item.size,
    lastModified: item.mtime,
  }));

  if (isGrouped) {
    return json({
      isGrouped: true,
      groups: groupedResponse,
      total: totalCount,
      totalImages: totalImagesCount,
      totalVideos: totalVideosCount,
      totalAudio: totalAudioCount,
      totalEbook: totalEbookCount,
    });
  }

  return json({
    images: paginatedImages,
    total: totalCount,
    totalImages: totalImagesCount,
    totalVideos: totalVideosCount,
    totalAudio: totalAudioCount,
    totalEbook: totalEbookCount,
    page,
    hasMore: end < totalCount,
  });
}
