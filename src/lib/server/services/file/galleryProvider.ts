/**
 * Gallery Provider — the core content engine for the Grid View.
 * Treats both directories and archives as "media containers" transparently.
 *
 * Data flow (pure pipeline):
 *   Container path
 *     → [1] Scan:    collect all raw media nodes from disk or archive
 *     → [2] Filter:  apply user-defined query filters (type, imagesOnly, exclusiveType)
 *     → [3] Sort:    stable alphanumeric or date based ordering
 *     → [4] Group:   optional MediaType grouping for mixed-content views
 *     → [5] Paginate or Group response
 *
 * Future extension: Step [1] will first check SQLite metadata cache before hitting disk.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { groupItemsByMediaType, getMediaType, isArchiveFile } from '$lib/shared/utils/fileUtils';
import { extractMediaNodesFromArchive, type ArchiveMediaNode } from '$lib/server/services/file/archiveExtractor';
import { resolveSubdirectoryVisualContext } from '$lib/server/services/file/visualsResolver';
import { safelyEvaluateNodeStats } from '$lib/server/services/core/nodeScanner';
import type { MediaType } from '$lib/client/stores/browser/types';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * All query parameters the frontend may pass to customize the gallery response.
 */
export interface MediaGalleryQueryConfig {
    currentPageIndex: number;
    itemsPerPage: number;
    sortMode: string;
    typeFilter: string;
    imagesOnly: boolean;
    exclusiveType: string | null;
    /** When true: resolve entryPath + containsImages for each sub-directory. */
    resolveFolderCovers: boolean;
    /** When true: resolve TOC-level folder information. */
    resolveFolderToc: boolean;
    /** When true: skip MediaType grouping, return flat paginated list. */
    disableGrouping: boolean;
}

/** Normalized internal representation for any item returned from a container scan. */
interface MediaNode {
    name: string;
    absolutePath: string;
    mediaType: MediaType;
    lastModifiedTimeMs: number;
    fileSize: number;
    /** Resolved sub-folder or archive path (only for folder-cover / TOC views). */
    resolvedEntryPath?: string;
    /** True when folder directly contains a gallery of images. */
    containsImages?: boolean;
}

/** Shape of items returned to the frontend. */
export interface GalleryItemDto {
    name: string;
    path: string;
    mediaType: MediaType;
    lastModified: number;
    size: number;
    entryPath?: string;
    containsImages?: boolean;
}

// ─── Step 1: Scan ────────────────────────────────────────────────────────────

/** Converts an ArchiveMediaNode to our internal MediaNode shape. */
function mapArchiveNodeToMediaNode(archiveNode: ArchiveMediaNode): MediaNode {
    return {
        name: archiveNode.name,
        absolutePath: archiveNode.absolutePath,
        mediaType: archiveNode.mediaType,
        lastModifiedTimeMs: archiveNode.lastModifiedTimeMs,
        fileSize: archiveNode.fileSize,
    };
}

/**
 * Scans a directory and returns all valid media nodes (files + sub-folders).
 * Resolves visual context for sub-folders when cover/TOC mode is enabled.
 */
async function scanDirectoryForMediaNodes(
    directoryAbsolutePath: string,
    resolveFolderCovers: boolean,
    resolveFolderToc: boolean
): Promise<MediaNode[]> {
    const rawDirectoryEntries = await fs.readdir(directoryAbsolutePath, { withFileTypes: true });
    const CONCURRENCY_CHUNK_SIZE = 50;
    const unpaginatedMediaNodes: MediaNode[] = [];

    for (let chunkStart = 0; chunkStart < rawDirectoryEntries.length; chunkStart += CONCURRENCY_CHUNK_SIZE) {
        const currentChunk = rawDirectoryEntries.slice(chunkStart, chunkStart + CONCURRENCY_CHUNK_SIZE);

        const chunkResults = await Promise.all(
            currentChunk.map(async entry => {
                const entryAbsolutePath = path.join(directoryAbsolutePath, entry.name);
                const fileExtension = path.extname(entry.name).toLowerCase();
                const isDirectory = entry.isDirectory();
                const mediaType = isDirectory ? ('directory' as MediaType) : getMediaType(fileExtension);
                const isKnownMediaType = mediaType !== 'unknown' && mediaType !== 'directory';

                // Skip files that are neither directories nor known media
                if (!isDirectory && !isKnownMediaType) return null;

                const systemFileStats = await safelyEvaluateNodeStats(entryAbsolutePath);
                if (!systemFileStats) return null;

                let resolvedEntryPath: string | undefined;
                let containsImages: boolean | undefined;

                // Deep-resolve visual context for folder thumbnails / TOC
                if (isDirectory && (resolveFolderCovers || resolveFolderToc)) {
                    const visualContext = await resolveSubdirectoryVisualContext(entryAbsolutePath);
                    resolvedEntryPath = visualContext.entryPath;
                    containsImages = visualContext.containsImages;
                }

                return {
                    name: entry.name,
                    absolutePath: entryAbsolutePath,
                    mediaType,
                    lastModifiedTimeMs: systemFileStats.mtimeMs,
                    fileSize: systemFileStats.size,
                    resolvedEntryPath,
                    containsImages,
                } satisfies MediaNode;
            })
        );

        unpaginatedMediaNodes.push(...(chunkResults.filter(Boolean) as MediaNode[]));
    }

    return unpaginatedMediaNodes;
}

// ─── Step 2: Filter ──────────────────────────────────────────────────────────

/**
 * Pure function — applies all query-driven filter rules to the raw node list.
 * No I/O. No side effects.
 */
function applyMediaFilters(
    unpaginatedMediaNodes: MediaNode[],
    galleryQueryFilters: Pick<MediaGalleryQueryConfig, 'imagesOnly' | 'typeFilter' | 'exclusiveType'>
): MediaNode[] {
    return unpaginatedMediaNodes.filter(node => {
        const isDirectory = node.mediaType === 'directory';

        // Global images-only toggle
        if (galleryQueryFilters.imagesOnly && node.mediaType !== 'image') return false;

        // Category filter (broad groups: images, videos, audio, ebook)
        if (!isDirectory) {
            if (galleryQueryFilters.typeFilter === 'images' && node.mediaType !== 'image') return false;
            if (galleryQueryFilters.typeFilter === 'videos' && node.mediaType !== 'video') return false;
            if (galleryQueryFilters.typeFilter === 'audio'  && node.mediaType !== 'audio') return false;
            if (galleryQueryFilters.typeFilter === 'ebook'  && !['pdf', 'epub', 'archive'].includes(node.mediaType)) return false;
        }

        // Exclusive type filter (precise single-type targeting)
        if (galleryQueryFilters.exclusiveType) {
            const exclusive = galleryQueryFilters.exclusiveType;
            if (exclusive === 'folders')  return isDirectory;
            if (isDirectory) return false;
            if (exclusive === 'images')   return node.mediaType === 'image';
            if (exclusive === 'archive')  return node.mediaType === 'archive';
            if (exclusive === 'pdf')      return node.mediaType === 'pdf';
            if (exclusive === 'epub')     return node.mediaType === 'epub';
            if (exclusive === 'audio')    return node.mediaType === 'audio';
            if (exclusive === 'videos')   return node.mediaType === 'video';
        }

        return true;
    });
}

// ─── Step 3: Sort ────────────────────────────────────────────────────────────

const LOCALE_SORT_OPTIONS = { numeric: true, sensitivity: 'base' } as const;

/**
 * Pure function — sorts nodes by the requested mode.
 * Directories are always pinned to the top of any sort unless grouping is disabled.
 */
function sortNodesDynamically(nodes: MediaNode[], sortMode: string, disableGrouping: boolean): MediaNode[] {
    return [...nodes].sort((nodeA, nodeB) => {
        // Directories float to top in grouped/mixed views
        if (!disableGrouping) {
            if (nodeA.mediaType === 'directory' && nodeB.mediaType !== 'directory') return -1;
            if (nodeA.mediaType !== 'directory' && nodeB.mediaType === 'directory') return 1;
        }

        if (sortMode === 'date_desc') return nodeB.lastModifiedTimeMs - nodeA.lastModifiedTimeMs;
        if (sortMode === 'date_asc')  return nodeA.lastModifiedTimeMs - nodeB.lastModifiedTimeMs;
        if (sortMode === 'name_asc')  return nodeA.name.localeCompare(nodeB.name, undefined, LOCALE_SORT_OPTIONS);
        if (sortMode === 'name_desc') return nodeB.name.localeCompare(nodeA.name, undefined, LOCALE_SORT_OPTIONS);
        return 0;
    });
}

// ─── Step 4+5: Format response ───────────────────────────────────────────────

/** Converts an internal MediaNode to the DTO shape exposed to the frontend. */
function serializeNodeToGalleryItemDto(node: MediaNode): GalleryItemDto {
    return {
        name: node.name,
        path: node.absolutePath,
        mediaType: node.mediaType,
        lastModified: node.lastModifiedTimeMs,
        size: node.fileSize,
        entryPath: node.resolvedEntryPath,
        containsImages: node.containsImages,
    };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Main entry point for the gallery API.
 * Orchestrates the full pipeline: Scan → Filter → Sort → Group/Paginate.
 */
export async function composeMediaGalleryPage(
    containerAbsolutePath: string,
    galleryQueryFilters: MediaGalleryQueryConfig
) {
    const {
        currentPageIndex,
        itemsPerPage,
        sortMode,
        imagesOnly,
        typeFilter,
        exclusiveType,
        resolveFolderCovers,
        resolveFolderToc,
        disableGrouping,
    } = galleryQueryFilters;

    const containerStats = await fs.stat(containerAbsolutePath);

    // ── Step 1: Scan ──────────────────────────────────────────────────────────
    const isArchiveContainer = containerStats.isFile() && isArchiveFile(path.extname(containerAbsolutePath));
    let unpaginatedMediaNodes: MediaNode[];

    if (isArchiveContainer) {
        const archiveNodes = await extractMediaNodesFromArchive(containerAbsolutePath);
        unpaginatedMediaNodes = archiveNodes.map(mapArchiveNodeToMediaNode);
    } else if (containerStats.isDirectory()) {
        unpaginatedMediaNodes = await scanDirectoryForMediaNodes(
            containerAbsolutePath,
            resolveFolderCovers,
            resolveFolderToc
        );
    } else {
        throw new Error('Invalid container: must be a directory or a ZIP archive.');
    }

    // ── Step 2: Sort (must precede grouping so groups are pre-sorted) ─────────
    const sortedMediaNodes = sortNodesDynamically(unpaginatedMediaNodes, sortMode, disableGrouping);

    // ── Step 3: Calculate counts / groups from sorted list ────────────────────
    const { groups, counts } = groupItemsByMediaType(sortedMediaNodes);

    // ── Step 4: Apply Filters ─────────────────────────────────────────────────
    const processedMediaNodes = applyMediaFilters(sortedMediaNodes, { imagesOnly, typeFilter, exclusiveType });

    // ── Step 5a: Grouped Response (mixed-content, no exclusiveType override) ──
    if (!exclusiveType && !disableGrouping) {
        const nonEmptyGroups = Object.entries(groups).filter(([, items]) => (items as any[]).length > 0);
        if (nonEmptyGroups.length > 1) {
            const groupedData: Record<string, { total: number; items: GalleryItemDto[] }> = {};
            for (const [mediaType, items] of nonEmptyGroups) {
                groupedData[mediaType] = {
                    total: (items as MediaNode[]).length,
                    items: (items as MediaNode[]).slice(0, 11).map(serializeNodeToGalleryItemDto),
                };
            }
            return { isGrouped: true, groups: groupedData, ...counts };
        }
    }

    // ── Step 5b: Flat Paginated Response ─────────────────────────────────────
    const paginationStart = currentPageIndex * itemsPerPage;
    return {
        items: processedMediaNodes.slice(paginationStart, paginationStart + itemsPerPage).map(serializeNodeToGalleryItemDto),
        page: currentPageIndex,
        hasMore: paginationStart + itemsPerPage < processedMediaNodes.length,
        ...counts,
    };
}

/**
 * Lists all immediate sub-folders of a directory and resolves a cover image for each.
 * Powers the Covers grid view.
 */
export async function fetchDirectoryCovers(
    containerAbsolutePath: string,
    currentPageIndex: number,
    itemsPerPage: number
) {
    const { locateDirectoryCoverImage } = await import('./visualsResolver');

    const rawDirectoryEntries = await fs.readdir(containerAbsolutePath, { withFileTypes: true });
    const sortedSubDirectories = rawDirectoryEntries
        .filter(entry => entry.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name, undefined, LOCALE_SORT_OPTIONS));

    const totalSubDirectories = sortedSubDirectories.length;
    const paginationStart = currentPageIndex * itemsPerPage;
    const pagedDirectories = sortedSubDirectories.slice(paginationStart, paginationStart + itemsPerPage);

    const coverEntries = await Promise.all(
        pagedDirectories.map(async subDirectory => {
            const subDirectoryAbsolutePath = path.join(containerAbsolutePath, subDirectory.name);
            const coverImagePath = (await locateDirectoryCoverImage(subDirectoryAbsolutePath)) ?? '';
            return { name: subDirectory.name, path: subDirectoryAbsolutePath, coverPath: coverImagePath };
        })
    );

    return {
        folders: coverEntries,
        total: totalSubDirectories,
        page: currentPageIndex,
        hasMore: paginationStart + itemsPerPage < totalSubDirectories,
    };
}
