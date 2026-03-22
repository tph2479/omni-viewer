import { json } from "@sveltejs/kit";
import fs from "node:fs/promises";
import path from "node:path";

const COVER_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".bmp",
]);

export async function handleCovers(
  folderPath: string,
  page: number = 0,
  limit: number = 30,
) {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());

  // Sort directories by name first
  dirs.sort((a, b) => a.name.localeCompare(b.name));

  const total = dirs.length;
  const start = page * limit;
  const end = start + limit;
  const paginatedDirs = dirs.slice(start, end);

  // Only read contents for the current page's directories to find a cover image
  const folders = await Promise.all(
    paginatedDirs.map(async (dir) => {
      const dirPath = path.join(folderPath, dir.name);
      let coverPath = "";
      try {
        const children = await fs.readdir(dirPath);

        // 1. Look for a cover.* file
        let coverFile = children.find((f) => {
          const lower = f.toLowerCase();
          const ext = path.extname(lower);
          const base = path.basename(lower, ext);
          return base === "cover" && COVER_EXTENSIONS.has(ext);
        });

        // 2. Fallback to the first available image
        if (!coverFile) {
          coverFile = children.find((f) => {
            const lower = f.toLowerCase();
            return COVER_EXTENSIONS.has(path.extname(lower));
          });
        }

        if (coverFile) {
          coverPath = path.join(dirPath, coverFile);
        }
      } catch {
        // Skip if we can't read the directory
      }

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
