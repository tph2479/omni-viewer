import { findFolderCover } from "$lib/server/fileUtils.server";
import { json } from "@sveltejs/kit";
import fs from "node:fs/promises";
import path from "node:path";

export async function handleCovers(
  folderPath: string,
  page: number = 0,
  limit: number = 42,
) {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());

  // Sort directories by name first
  dirs.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  const total = dirs.length;
  const start = page * limit;
  const end = start + limit;
  const paginatedDirs = dirs.slice(start, end);

  // Only read contents for the current page's directories to find a cover image
  const folders = await Promise.all(
    paginatedDirs.map(async (dir) => {
      const dirPath = path.join(folderPath, dir.name);
      const coverPath = await findFolderCover(dirPath) || "";
      
      return {
        name: dir.name,
        path: dirPath,
        coverPath,
      };
    }),
  );

  return json({
    folders,
    total,
    page,
    hasMore: end < total,
  });
}
