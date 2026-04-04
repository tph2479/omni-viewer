import fs from "node:fs/promises";
import path from "node:path";
import { isImageFile } from "$lib/fileUtils";

/**
 * Finds a cover image within a directory.
 * Priority:
 * 1. File named 'cover' with a valid image extension.
 * 2. The first image file found in the directory.
 * Returns null if no cover image is found.
 */
export async function findFolderCover(dirPath: string): Promise<string | null> {
  try {
    const children = (await fs.readdir(dirPath)).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    );

    // 1. Look for a cover.* file
    let coverFile = children.find((f) => {
      const lower = f.toLowerCase();
      const ext = path.extname(lower);
      const base = path.basename(lower, ext);
      return base === "cover" && isImageFile(ext);
    });

    // 2. Fallback to the first available image
    if (!coverFile) {
      coverFile = children.find((f) => {
        const lower = f.toLowerCase();
        return isImageFile(path.extname(lower));
      });
    }

    if (coverFile) {
      return path.join(dirPath, coverFile);
    }
  } catch (error) {
    // console.error(`Error finding cover in ${dirPath}:`, error);
  }

  return null;
}
