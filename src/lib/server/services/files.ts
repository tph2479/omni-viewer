/**
 * Files service — file system operations: directory listing, navigation,
 * cover browsing, and file/folder deletion.
 */
import { error, json } from '@sveltejs/kit';
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

// ─── Navigation ───────────────────────────────────────────────────────────────

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

/**
 * List drives (Windows) or root (POSIX) when no path is given,
 * otherwise list subdirectories and media files at the given path.
 */
export async function navigateDirectory(folderParam: string | null) {
    const isEmpty = !folderParam || ROOT_SENTINELS.has(folderParam.trim());

    if (isEmpty) {
        if (process.platform === 'win32') {
            const drives = await getWindowsDrives();
            return json({ currentPath: '', parentPath: null, directories: drives.map(d => ({ ...d, isDir: true })) });
        }
        return json({ currentPath: '/', parentPath: '', directories: [{ name: '/', path: '/', isDir: true }] });
    }

    const currentPath = path.resolve(folderParam!);
    const stat = await fs.stat(currentPath);
    if (!stat.isDirectory()) throw error(400, 'Path is not a directory');

    const parentPath = path.dirname(currentPath);
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    let mediaCount = 0;
    const mediaTypes = new Set<string>();

    const directories = entries
        .filter(e => !e.name.startsWith('.'))
        .map(e => {
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
            return { name: e.name, path: entryPath, isDir, isCbz, isMedia, isExecutable };
        })
        .sort((a, b) => {
            const rank = (e: any) => e.isDir ? 0 : (e.isCbz || e.isMedia || e.isExecutable) ? 1 : 2;
            const diff = rank(a) - rank(b);
            return diff !== 0 ? diff : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

    const isRoot = parentPath === currentPath
        || currentPath.endsWith(':\\')
        || currentPath.endsWith(':/');

    return json({
        currentPath,
        parentPath: isRoot ? '' : parentPath,
        directories,
        summary: mediaCount > 0 ? { count: mediaCount, types: Array.from(mediaTypes).sort() } : null,
    });
}

// ─── Gallery listing ──────────────────────────────────────────────────────────

export interface ListDirectoryOptions {
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
 * List media files in a directory (or inside a CBZ archive) with pagination,
 * sorting, type filtering, and optional grouping by media type.
 */
export async function listDirectory(folderPath: string, opts: ListDirectoryOptions) {
    const { page, limit, sortBy, typeFilter, imagesOnly, exclusiveType, isCover, isToc, noGroup } = opts;

    const stat = await fs.stat(folderPath);
    let items: any[] = [];

    // ── CBZ archive ──
    if (stat.isFile() && isCbzFile(path.extname(folderPath))) {
        const zip = await yauzl.open(folderPath);
        try {
            for await (const entry of zip) {
                const ext = path.extname(entry.filename).toLowerCase();
                if (ALLOWED_EXTENSIONS.has(ext) && isImageFile(ext)) {
                    items.push({
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
        // ── Directory ──
        const entries = await fs.readdir(folderPath, { withFileTypes: true });
        const CHUNK = 50;
        let mediaCount = 0;
        const mediaTypes = new Set<string>();

        for (let i = 0; i < entries.length; i += CHUNK) {
            const results = await Promise.all(
                entries.slice(i, i + CHUNK).map(async entry => {
                    const fullPath = path.join(folderPath, entry.name);
                    const ext = path.extname(entry.name).toLowerCase();
                    const isDir = entry.isDirectory();

                    let mediaType: MediaType = isDir ? 'directory' : getMediaType(ext);

                    const isMedia = mediaType !== 'unknown' && mediaType !== 'directory';
                    if (isMedia) {
                        mediaCount++;
                        mediaTypes.add(ext.replace('.', '').toUpperCase());
                    }

                    let allowed = isDir || isMedia;

                    if (!isDir && allowed) {
                        if (typeFilter === 'images' && (mediaType === 'video' || mediaType === 'audio' || mediaType === 'pdf' || mediaType === 'epub' || mediaType === 'cbz')) allowed = false;
                        if (typeFilter === 'videos' && mediaType !== 'video') allowed = false;
                        if (typeFilter === 'audio' && mediaType !== 'audio') allowed = false;
                        if (typeFilter === 'ebook' && mediaType !== 'pdf' && mediaType !== 'epub' && mediaType !== 'cbz') allowed = false;
                    }

                    if (!allowed) return null;
                    if (imagesOnly && mediaType !== 'image') return null;

                    if (exclusiveType) {
                        if (exclusiveType === 'folders' && mediaType !== 'directory') return null;
                        if (exclusiveType !== 'folders' && mediaType === 'directory') return null;
                        if (exclusiveType === 'images' && mediaType !== 'image') return null;
                        if (exclusiveType === 'cbz' && mediaType !== 'cbz') return null;
                        if (exclusiveType === 'pdf' && mediaType !== 'pdf') return null;
                        if (exclusiveType === 'epub' && mediaType !== 'epub') return null;
                        if (exclusiveType === 'audio' && mediaType !== 'audio') return null;
                        if (exclusiveType === 'videos' && mediaType !== 'video') return null;
                    }

                    try {
                        const entryStat = await fs.stat(fullPath);
                        let entryPath: string | undefined;
                        let containsImages: boolean | undefined;

                        if (isDir && isCover) {
                            const sub = await fs.readdir(fullPath, { withFileTypes: true });
                            const sorted = sub.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
                            const foundCbz = sorted.find(e => !e.isDirectory() && isCbzFile(path.extname(e.name).toLowerCase()));
                            if (foundCbz) {
                                entryPath = path.join(fullPath, foundCbz.name);
                            } else {
                                const imgFiles = sorted.filter(e => !e.isDirectory() && isImageFile(path.extname(e.name).toLowerCase()));
                                if (imgFiles.length > 1) {
                                    containsImages = true;
                                } else {
                                    const firstSub = sorted.find(e => e.isDirectory());
                                    if (firstSub) {
                                        const subPath = path.join(fullPath, firstSub.name);
                                        const subContent = await fs.readdir(subPath, { withFileTypes: true });
                                        const subHasImages = subContent.some(e => !e.isDirectory() && isImageFile(path.extname(e.name).toLowerCase()));
                                        if (subHasImages) {
                                            entryPath = subPath;
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (isDir && isToc) {
                            const sub = await fs.readdir(fullPath, { withFileTypes: true });
                            const sorted = sub.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
                            
                            const imgFiles = sorted.filter(e => !e.isDirectory() && isImageFile(path.extname(e.name).toLowerCase()));
                            const hasImages = imgFiles.length > 1;
                            const hasCbz = sorted.some(e => !e.isDirectory() && isCbzFile(path.extname(e.name).toLowerCase()));
                            
                            if (hasImages) {
                                containsImages = true;
                            } else {
                                const firstSub = sorted.find(e => e.isDirectory());
                                if (firstSub) {
                                    const subPath = path.join(fullPath, firstSub.name);
                                    const subContent = await fs.readdir(subPath, { withFileTypes: true });
                                    const subHasImages = subContent.some(e => !e.isDirectory() && isImageFile(path.extname(e.name).toLowerCase()));
                                    if (subHasImages) {
                                        entryPath = subPath;
                                    }
                                }
                            }
                            
                            if (hasCbz && !hasImages && !entryPath) {
                            } else if (hasCbz) {
                                const foundCbz = sorted.find(e => !e.isDirectory() && isCbzFile(path.extname(e.name).toLowerCase()));
                                if (foundCbz) {
                                    entryPath = path.join(fullPath, foundCbz.name);
                                }
                            }
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
            items.push(...results.filter(Boolean));
        }
    } else {
        throw error(400, 'Invalid path');
    }

    // ── Sort ──
    items.sort((a, b) => {
        if (!noGroup) {
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

    const toDto = (item: any) => ({
        name: item.name, path: item.path,
        mediaType: item.mediaType,
        entryPath: item.entryPath,
        containsImages: item.containsImages,
        size: item.size, lastModified: item.mtime,
    });

    const { groups, counts } = groupItemsByMediaType(items);
    const nonEmptyGroups = Object.entries(groups)
        .filter(([_, arr]) => (arr as any[]).length > 0)
        .map(([type, arr]) => ({ type, items: arr as any[] }));

    if (!exclusiveType && !noGroup && nonEmptyGroups.length > 1) {
        const groupedResponse: Record<string, any> = {};
        for (const g of nonEmptyGroups) {
            groupedResponse[g.type] = { total: g.items.length, items: g.items.slice(0, 11).map(toDto) };
        }
        return json({ isGrouped: true, groups: groupedResponse, ...counts });
    }

    // ── Paginated flat list ──
    const start = page * limit;
    return json({
        images: items.slice(start, start + limit).map(toDto),
        page,
        hasMore: start + limit < items.length,
        ...counts,
    });
}

// ─── Cover browsing ───────────────────────────────────────────────────────────

/**
 * List subdirectories in a folder and resolve a representative cover image for each.
 */
export async function browseCovers(folderPath: string, page: number, limit: number) {
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

    return json({ folders, total, page, hasMore: start + limit < total });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a file or directory (recursive) at the given path.
 */
export async function deleteFile(filePath: string) {
    try {
        const absolutePath = path.resolve(filePath);
        const stat = await fs.stat(absolutePath);
        if (stat.isDirectory()) {
            await fs.rm(absolutePath, { recursive: true, force: true });
        } else {
            await fs.unlink(absolutePath);
        }
        return json({ success: true, message: 'Deleted successfully' });
    } catch (err: any) {
        console.error('[Files] Delete error:', err);
        throw error(500, `Failed to delete: ${err.message}`);
    }
}

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

    let coverFile = children.find((f) => {
      const lower = f.toLowerCase();
      const ext = path.extname(lower);
      const base = path.basename(lower, ext);
      return base === "cover" && isImageFile(ext);
    });

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
    // ignore
  }

  return null;
}
