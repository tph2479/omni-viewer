/**
 * Media Metadata Extractor — reads EXIF/image metadata from a local media file.
 * Uses Sharp for image dimension and orientation, supporting HEIC via prior conversion.
 * This service is strictly read-only and never touches the HTTP layer.
 * Future extension: extract ID3 tags for audio, or PDF info/page count.
 */
import path from 'node:path';
import sharp from 'sharp';

import { isImageFile } from '$lib/shared/utils/fileUtils';
import { ensureHeicConverted } from '$lib/server/utils/heicConverter';
import type { Stats } from 'node:fs';

export interface MediaFileMetadata {
    name: string;
    /** Normalized (relative/virtual) path sent back to the client. */
    displayPath: string;
    fileSize: number;
    lastModifiedTimeMs: number;
    /** Pixel width after orientation correction. 0 when unavailable. */
    pixelWidth: number;
    /** Pixel height after orientation correction. 0 when unavailable. */
    pixelHeight: number;
}

/**
 * Extracts metadata for a media file.
 * For images (including HEIC after on-the-fly conversion), pixelWidth and pixelHeight
 * are populated with EXIF-orientation-corrected dimensions.
 *
 * @param absolutePath     Absolute path to the file on disk.
 * @param displayPath      Normalized path returned to the client (not the raw absolute path).
 * @param systemFileStats  Stats from a prior `fs.stat` call — avoids a duplicate stat.
 * @param fileExtension    Lowercase extension without the leading dot (e.g. "jpg").
 * @param isHeicFormat     True when the file is a HEIC/HEIF container.
 * @param abortSignal      Request's AbortSignal; passed to conversion helpers.
 * @param forceRegenerate  When true, invalidates and recreates any existing converted cache.
 */
export async function extractMediaFileMetadata(
    absolutePath: string,
    displayPath: string,
    systemFileStats: Stats,
    fileExtension: string,
    isHeicFormat: boolean,
    abortSignal: AbortSignal,
    forceRegenerate: boolean,
): Promise<MediaFileMetadata> {
    let pixelWidth = 0;
    let pixelHeight = 0;

    const isImagePath = isImageFile('.' + fileExtension) || isHeicFormat;

    if (isImagePath) {
        try {
            // HEIC files must be converted first before Sharp can read them
            const effectiveImagePath = isHeicFormat
                ? await ensureHeicConverted(absolutePath, systemFileStats.mtimeMs, abortSignal, forceRegenerate)
                : absolutePath;

            const sharpImageMeta = await sharp(effectiveImagePath).metadata();
            pixelWidth  = sharpImageMeta.width  ?? 0;
            pixelHeight = sharpImageMeta.height ?? 0;

            // EXIF orientation ≥ 5 means image is rotated 90° or 270° — swap dimensions
            if (sharpImageMeta.orientation && sharpImageMeta.orientation >= 5) {
                [pixelWidth, pixelHeight] = [pixelHeight, pixelWidth];
            }
        } catch {
            // Non-fatal: metadata extraction failure does not block serving
        }
    }

    return {
        name: path.basename(absolutePath),
        displayPath,
        fileSize: systemFileStats.size,
        lastModifiedTimeMs: systemFileStats.mtimeMs,
        pixelWidth,
        pixelHeight,
    };
}
