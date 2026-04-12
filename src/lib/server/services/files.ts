/**
 * Files service — pure data operations for the file system.
 * Handles directory listing, navigation, cover resolving, and deletion.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import yauzl from 'yauzl-promise';

import {
    ALLOWED_EXTENSIONS,
    isImageFile,
    isVideoFile,
    isAudioFile,
    isPdfFile,
    isEpubFile,
    isCbzFile,
    isExecutableFile,
    getMediaType,
    groupItemsByMediaType,
} from '$lib/utils/fileUtils';
import type { MediaType } from '$lib/stores/browser/types';

const execAsync = promisify(exec);

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Lists available logical drives on Windows.
 */
async function getWindowsDrives(): Promise<{ name: string; path: string }[]> {
    try {
        const { stdout } = await execAsync('wmic logicaldisk get name, volumename /format:list');
        const lines = stdout.split(/\r?\n/);
        const drives: { name: string; path: string }[] = [];
        let cur: { name?: string; volumeName?: string } = {};

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                if (cur.name) {
                    const vol = cur.volumeName || '';
                    drives.push({
                        name: vol ? `${cur.name}\\ (${vol})` : `${cur.name}\\`,
                        path: `${cur.name}\\`,
                    });
                    cur = {};
                }
                continue;
            }
            if (trimmed.startsWith('Name=')) cur.name = trimmed.slice(5).trim();
            else if (trimmed.startsWith('VolumeName=')) cur.volumeName = trimmed.slice(11).trim();
        }

        if (cur.name) {
            const vol = cur.volumeName || '';
            drives.push({
                name: vol ? `${cur.name}\\ (${vol})` : `${cur.name}\\`,
                path: `${cur.name}\\`,
            });
        }

        return drives.sort((a, b) => {
            if (a.path.startsWith('C:')) return -1;
            if (b.path.startsWith('C:')) return 1;
            return a.path.localeCompare(b.path);
        });
    } catch (e) {
        console.error('[Files] Failed to get Windows drives:', e);
        return [{ name: 'C:\\', path: 'C:\\' }];
    }
}

const ROOT_SENTINELS = new Set(['This PC', 'This PC (Ổ đĩa hệ thống)', '', '/']);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns navigation data for a directory: subdirectories and a media summary.
 * If no path is given, returns root drives/folders.
 */
export async function getNavigation(folderParam: string | null) {
    const isEmpty = !folderParam;

    if (isEmpty) {
        if (process.platform === 'win32') {
            const drives = await getWindowsDrives();
            return { currentPath: '', parentPath: null, directories: drives.map(d => ({ ...d, isDir: true })) };
        }
        return { currentPath: '/', parentPath: '', directories: [{ name: '/', path: '/', isDir: true }] };
    }

    const currentPath = path.resolve(folderParam!);
    const stat = await fs.stat(currentPath);
    if (!stat.isDirectory()) throw new Error('Path is not a directory');

    const parentPath = path.dirname(currentPath);
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    let mediaCount = 0;
    const mediaTypes = new Set<string>();

    const directories = (await Promise.all(entries
        .filter(e => !e.name.startsWith('.'))
        .map(async e => {
            const entryPath = path.join(currentPath, e.name);
            const ext = path.extname(e.name).toLowerCase();
            const isDir = e.isDirectory();
            const isCbz = !isDir && isCbzFile(ext);
            const isMedia = !isDir && !isCbz && (
                isImageFile(ext) || isVideoFile(ext) || isAudioFile(ext) || isPdfFile(ext) || isEpubFile(ext)
            );
            const isExecutable = !isDir && isExecutableFile(ext);
            if (isMedia) {
                mediaCount++;
                mediaTypes.add(ext.replace('.', '').toUpperCase());
            }

            try {
                const s = await fs.stat(entryPath);
                return { name: e.name, path: entryPath, isDir, isCbz, isMedia, isExecutable, mtime: s.mtimeMs };
            } catch {
                return { name: e.name, path: entryPath, isDir, isCbz, isMedia, isExecutable, mtime: 0 };
            }
        }))).sort((a, b) => {
            const rank = (e: any) => e.isDir ? 0 : (e.isCbz || e.isMedia || e.isExecutable) ? 1 : 2;
            const diff = rank(a) - rank(b);
            return diff !== 0 ? diff : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

    const isRoot = parentPath === currentPath
        || currentPath.endsWith(':\\')
        || currentPath.endsWith(':/');

    return {
        currentPath,
        parentPath: isRoot ? '' : parentPath,
        directories,
        summary: mediaCount > 0 ? { count: mediaCount, types: Array.from(mediaTypes).sort() } : null,
    };
}

export interface ListGalleryOptions {
    page: number;
    limit: number;
    sortBy: string;
    typeFilter: string;
    imagesOnly: boolean;
    exclusiveType: string | null;
    isCover: boolean;
    isToc: boolean;
    noGroup: boolean;
}

/**
 * Lists gallery items (media files) in a directory or CBZ.
 */
export async function getGalleryItems(folderPath: string, opts: ListGalleryOptions) {
    const { page, limit, sortBy, typeFilter, imagesOnly, exclusiveType, isCover, isToc, noGroup } = opts;

    const stat = await fs.stat(folderPath);
    let allCandidates: any[] = [];

    // ── Archive Handling (CBZ/ZIP) ──
    if (stat.isFile() && isCbzFile(path.extname(folderPath))) {
        const zip = await yauzl.open(folderPath);
        try {
            for await (const entry of zip) {
                const ext = path.extname(entry.filename).toLowerCase();
                if (ALLOWED_EXTENSIONS.has(ext) && isImageFile(ext)) {
                    allCandidates.push({
                        name: entry.filename,
                        path: `${folderPath}::${entry.filename}`,
                        size: entry.uncompressedSize,
                        mtime: Date.now(),
                        mediaType: 'image' as MediaType,
                    });
                }
            }
        } finally {
            await zip.close();
        }
    } else if (stat.isDirectory()) {
        // ── Directory Handling ──
        const entries = await fs.readdir(folderPath, { withFileTypes: true });
        const CHUNK = 50;
        
        for (let i = 0; i < entries.length; i += CHUNK) {
            const results = await Promise.all(
                entries.slice(i, i + CHUNK).map(async entry => {
                    const fullPath = path.join(folderPath, entry.name);
                    const ext = path.extname(entry.name).toLowerCase();
                    const isDir = entry.isDirectory();

                    let mediaType = isDir ? 'directory' as MediaType : getMediaType(ext);
                    const isMedia = mediaType !== 'unknown' && mediaType !== 'directory';

                    if (!isDir && !isMedia) return null;

                    try {
                        const entryStat = await fs.stat(fullPath);
                        let entryPath: string | undefined;
                        let containsImages: boolean | undefined;

                        // Deep Resolve for Covers/TOC
                        if (isDir && (isCover || isToc)) {
                            const result = await resolveDirectoryMediaContext(fullPath);
                            entryPath = result.entryPath;
                            containsImages = result.containsImages;
                        }

                        return {
                            name: entry.name,
                            path: fullPath,
                            mtime: entryStat.mtimeMs,
                            size: entryStat.size,
                            mediaType,
                            entryPath,
                            containsImages,
                        };
                    } catch {
                        return null;
                    }
                }),
            );
            allCandidates.push(...results.filter(Boolean));
        }
    } else {
        throw new Error('Invalid path or file type');
    }

    // ── 1. GLOBAL SORT (Crucial: Sort BEFORE Grouping) ──
    allCandidates.sort((a, b) => {
        if (!noGroup) {
            // Folders always at the top in grouped/mixed view
            if (a.mediaType === 'directory' && b.mediaType !== 'directory') return -1;
            if (a.mediaType !== 'directory' && b.mediaType === 'directory') return 1;
        }
        
        if (sortBy === 'date_desc') return b.mtime - a.mtime;
        if (sortBy === 'date_asc') return a.mtime - b.mtime;
        
        const locale = { numeric: true, sensitivity: 'base' } as const;
        if (sortBy === 'name_asc') return a.name.localeCompare(b.name, undefined, locale);
        if (sortBy === 'name_desc') return b.name.localeCompare(a.name, undefined, locale);
        
        return 0;
    });

    // ── 2. Calculate Counts & Groups (now based on sorted list) ──
    const { groups, counts } = groupItemsByMediaType(allCandidates);

    // ── 3. Apply Filters for paginated list ──
    let filteredItems = allCandidates.filter(item => {
        const isDir = item.mediaType === 'directory';
        
        // Images Only Global Filter
        if (imagesOnly && item.mediaType !== 'image') return false;

        // Type Category Filter
        if (!isDir) {
            if (typeFilter === 'images' && item.mediaType !== 'image') return false;
            if (typeFilter === 'videos' && item.mediaType !== 'video') return false;
            if (typeFilter === 'audio' && item.mediaType !== 'audio') return false;
            if (typeFilter === 'ebook' && !['pdf', 'epub', 'cbz'].includes(item.mediaType)) return false;
        }

        // Exclusive Type Filter
        if (exclusiveType) {
            if (exclusiveType === 'folders') return isDir;
            if (isDir) return false;

            if (exclusiveType === 'images') return item.mediaType === 'image';
            if (exclusiveType === 'cbz') return item.mediaType === 'cbz';
            if (exclusiveType === 'pdf') return item.mediaType === 'pdf';
            if (exclusiveType === 'epub') return item.mediaType === 'epub';
            if (exclusiveType === 'audio') return item.mediaType === 'audio';
            if (exclusiveType === 'videos') return item.mediaType === 'video';
        }

        return true;
    });

    const toDto = (item: any) => ({
        name: item.name, 
        path: item.path,
        mediaType: item.mediaType,
        entryPath: item.entryPath,
        containsImages: item.containsImages,
        size: item.size, 
        lastModified: item.mtime,
    });
    
    // ── 4. Grouped Response ──
    if (!exclusiveType && !noGroup) {
        const nonEmptyGroups = Object.entries(groups)
            .filter(([_, arr]) => (arr as any[]).length > 0);
            
        if (nonEmptyGroups.length > 1) {
            const groupedData: Record<string, any> = {};
            for (const [type, arr] of nonEmptyGroups) {
                groupedData[type] = {
                    total: (arr as any[]).length,
                    items: (arr as any[]).slice(0, 11).map(toDto)
                };
            }
            return { isGrouped: true, groups: groupedData, ...counts };
        }
    }

    // ── 5. Paginated Flat Response ──
    const start = page * limit;
    return {
        items: filteredItems.slice(start, start + limit).map(toDto),
        page,
        hasMore: start + limit < filteredItems.length,
        ...counts,
    };
}

/**
 * Lists subdirectories and their resolved covers.
 */
export async function getFolderCovers(folderPath: string, page: number, limit: number) {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const dirs = entries
        .filter(e => e.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const total = dirs.length;
    const start = page * limit;
    const paged = dirs.slice(start, start + limit);

    const folders = await Promise.all(
        paged.map(async dir => {
            const dirPath = path.join(folderPath, dir.name);
            const coverPath = (await findFolderCover(dirPath)) ?? '';
            return { name: dir.name, path: dirPath, coverPath };
        }),
    );

    return { folders, total, page, hasMore: start + limit < total };
}

/**
 * Deletes a file or directory.
 */
export async function performDelete(filePath: string) {
    const absolutePath = path.resolve(filePath);
    const stat = await fs.stat(absolutePath);
    if (stat.isDirectory()) {
        await fs.rm(absolutePath, { recursive: true, force: true });
    } else {
        await fs.unlink(absolutePath);
    }
    return { success: true };
}

// ─── Internal Feature Logic ──────────────────────────────────────────────────

/**
 * Deeply resolves what should be displayed for a directory (e.g. for covers/TOC).
 */
async function resolveDirectoryMediaContext(dirPath: string): Promise<{ entryPath?: string; containsImages?: boolean }> {
    const sub = await fs.readdir(dirPath, { withFileTypes: true });
    const sorted = sub.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    
    const imgFiles = sorted.filter(e => !e.isDirectory() && isImageFile(path.extname(e.name).toLowerCase()));
    const hasCbz = sorted.some(e => !e.isDirectory() && isCbzFile(path.extname(e.name).toLowerCase()));
    
    if (imgFiles.length > 1) {
        return { containsImages: true };
    }

    // Try finding images in the first sub-folder
    const firstSubDir = sorted.find(e => e.isDirectory());
    if (firstSubDir) {
        const subPath = path.join(dirPath, firstSubDir.name);
        const subContent = await fs.readdir(subPath, { withFileTypes: true });
        if (subContent.some(e => !e.isDirectory() && isImageFile(path.extname(e.name).toLowerCase()))) {
            return { entryPath: subPath };
        }
    }

    if (hasCbz) {
        const foundCbz = sorted.find(e => !e.isDirectory() && isCbzFile(path.extname(e.name).toLowerCase()));
        if (foundCbz) return { entryPath: path.join(dirPath, foundCbz.name) };
    }

    return {};
}

/**
 * Finds a cover image within a directory.
 */
export async function findFolderCover(dirPath: string): Promise<string | null> {
    try {
        const children = (await fs.readdir(dirPath)).sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
        );

        // 1. File named 'cover'
        let coverFile = children.find((f) => {
            const lower = f.toLowerCase();
            const ext = path.extname(lower);
            const base = path.basename(lower, ext);
            return base === "cover" && isImageFile(ext);
        });

        // 2. First image file
        if (!coverFile) {
            coverFile = children.find((f) => isImageFile(path.extname(f.toLowerCase())));
        }

        if (coverFile) return path.join(dirPath, coverFile);
    } catch { /* ignore */ }
    return null;
}
