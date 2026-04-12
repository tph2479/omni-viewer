/**
 * Visuals Resolver — discovers representative cover images for display in the Gallery UI.
 * Given a directory path, resolves the best candidate image to act as a cover.
 * Future extension point: extract cover from CBR, PDF first-page, ID3 tag, etc.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { isImageFile, isArchiveFile } from '$lib/shared/utils/fileUtils';

/**
 * Holds the result of resolving the visual context of a subdirectory.
 * - `entryPath`: Override path to read content from (e.g. an archive file or inner sub-folder)
 * - `containsImages`: true when the directory directly holds multiple images (gallery mode)
 */
export interface DirectoryVisualContext {
    entryPath?: string;
    containsImages?: boolean;
}

/**
 * Searches a directory for a suitable cover image.
 * Priority: 1. A file literally named "cover" (any image ext).
 *           2. The first image file sorted alphanumerically.
 * Returns null when the directory is unreadable or has no images.
 */
export async function locateDirectoryCoverImage(directoryAbsolutePath: string): Promise<string | null> {
    try {
        const sortedFileNames = (await fs.readdir(directoryAbsolutePath)).sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        );

        // 1. Prefer a file explicitly named "cover"
        const explicitCoverFile = sortedFileNames.find(fileName => {
            const fileExtension = path.extname(fileName.toLowerCase());
            const baseName = path.basename(fileName.toLowerCase(), fileExtension);
            return baseName === 'cover' && isImageFile(fileExtension);
        });

        if (explicitCoverFile) return path.join(directoryAbsolutePath, explicitCoverFile);

        // 2. Fall back to the first image found
        const firstImageFile = sortedFileNames.find(fileName =>
            isImageFile(path.extname(fileName).toLowerCase())
        );

        if (firstImageFile) return path.join(directoryAbsolutePath, firstImageFile);
    } catch {
        // Directory may be unreadable (permissions, etc.)
    }

    return null;
}

/**
 * Deeply inspects a subdirectory to determine what visual content it holds.
 * Used by the Gallery when rendering folder covers (isCover) or table-of-contents (isToc) views.
 *
 * Resolution order:
 *   1. Multiple images directly inside → mark as image gallery (containsImages = true)
 *   2. A sub-folder containing images → return that sub-folder as entryPath
 *   3. An archive inside             → return the archive as entryPath
 *   4. Nothing found                 → return empty context {}
 */
export async function resolveSubdirectoryVisualContext(directoryAbsolutePath: string): Promise<DirectoryVisualContext> {
    const rawSubEntries = await fs.readdir(directoryAbsolutePath, { withFileTypes: true });
    const sortedSubEntries = rawSubEntries.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    const imageFiles = sortedSubEntries.filter(
        entry => !entry.isDirectory() && isImageFile(path.extname(entry.name).toLowerCase())
    );
    const hasArchive = sortedSubEntries.some(
        entry => !entry.isDirectory() && isArchiveFile(path.extname(entry.name).toLowerCase())
    );

    // Case 1: Multiple images directly inside this folder → treat as image gallery
    if (imageFiles.length > 1) {
        return { containsImages: true };
    }

    // Case 2: Check first sub-folder for images
    const firstSubDirectory = sortedSubEntries.find(entry => entry.isDirectory());
    if (firstSubDirectory) {
        const subDirectoryAbsolutePath = path.join(directoryAbsolutePath, firstSubDirectory.name);
        const subDirectoryEntries = await fs.readdir(subDirectoryAbsolutePath, { withFileTypes: true });
        const subHasImages = subDirectoryEntries.some(
            entry => !entry.isDirectory() && isImageFile(path.extname(entry.name).toLowerCase())
        );
        if (subHasImages) return { entryPath: subDirectoryAbsolutePath };
    }

    // Case 3: Defer to the first archive found
    if (hasArchive) {
        const firstArchiveEntry = sortedSubEntries.find(
            entry => !entry.isDirectory() && isArchiveFile(path.extname(entry.name).toLowerCase())
        );
        if (firstArchiveEntry) return { entryPath: path.join(directoryAbsolutePath, firstArchiveEntry.name) };
    }

    return {};
}
