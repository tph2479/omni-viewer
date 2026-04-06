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
} from '$lib/utils/fileUtils';

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
            if (isMedia) {
                mediaCount++;
                mediaTypes.add(ext.replace('.', '').toUpperCase());
            }
            return { name: e.name, path: entryPath, isDir, isCbz, isMedia };
        })
        .sort((a, b) => {
            const rank = (e: typeof a) => e.isDir ? 0 : e.isCbz ? 1 : e.isMedia ? 2 : 3;
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
    noGroup: boolean;
}

/**
 * List media files in a directory (or inside a CBZ archive) with pagination,
 * sorting, type filtering, and optional grouping by media type.
 */
export async function listDirectory(folderPath: string, opts: ListDirectoryOptions) {
    const { page, limit, sortBy, typeFilter, imagesOnly, exclusiveType, isCover, noGroup } = opts;

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
                        isDir: false,
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

        for (let i = 0; i < entries.length; i += CHUNK) {
            const results = await Promise.all(
                entries.slice(i, i + CHUNK).map(async entry => {
                    const fullPath = path.join(folderPath, entry.name);
                    const ext = path.extname(entry.name).toLowerCase();
                    const isDir = entry.isDirectory();
                    const isCbz = !isDir && isCbzFile(ext);
                    const isVideo = !isDir && isVideoFile(ext);
                    const isAudio = !isDir && isAudioFile(ext);
                    const isPdf = !isDir && isPdfFile(ext);
                    const isEpub = !isDir && isEpubFile(ext);
                    const isImg = !isDir && !isCbz && !isVideo && !isAudio && !isPdf && !isEpub;

                    let allowed = isDir || isCbz || isAudio || isPdf || isEpub || ALLOWED_EXTENSIONS.has(ext);

                    if (!isDir && allowed) {
                        if (typeFilter === 'images' && (isVideo || isAudio || isPdf || isEpub || isCbz)) allowed = false;
                        if (typeFilter === 'videos' && !isVideo) allowed = false;
                        if (typeFilter === 'audio' && !isAudio) allowed = false;
                        if (typeFilter === 'ebook' && !isPdf && !isEpub && !isCbz) allowed = false;
                    }

                    if (!allowed) return null;
                    if (imagesOnly && (isDir || isVideo || isAudio || isCbz || isPdf || isEpub)) return null;

                    if (exclusiveType) {
                        if (exclusiveType === 'folders' && !isDir) return null;
                        if (exclusiveType !== 'folders' && isDir) return null;
                        if (exclusiveType === 'images' && (isVideo || isAudio || isCbz || isPdf || isEpub)) return null;
                        if (exclusiveType === 'cbz' && !isCbz) return null;
                        if (exclusiveType === 'pdf' && !isPdf) return null;
                        if (exclusiveType === 'epub' && !isEpub) return null;
                        if (exclusiveType === 'audio' && !isAudio) return null;
                        if (exclusiveType === 'videos' && !isVideo) return null;
                    }

                    try {
                        const entryStat = await fs.stat(fullPath);
                        let firstCbz: string | undefined;
                        let hasImages: boolean | undefined;

                        if (isDir && isCover) {
                            const sub = await fs.readdir(fullPath, { withFileTypes: true });
                            const sorted = sub.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
                            const foundCbz = sorted.find(e => !e.isDirectory() && isCbzFile(path.extname(e.name).toLowerCase()));
                            if (foundCbz) {
                                firstCbz = path.join(fullPath, foundCbz.name);
                            } else {
                                const imgFiles = sorted.filter(e => !e.isDirectory() && isImageFile(path.extname(e.name).toLowerCase()));
                                if (imgFiles.length > 1) {
                                    hasImages = true;
                                } else {
                                    const firstSub = sorted.find(e => e.isDirectory());
                                    if (firstSub) firstCbz = path.join(fullPath, firstSub.name);
                                }
                            }
                        }

                        return {
                            name: entry.name,
                            path: fullPath,
                            mtime: entryStat.mtimeMs,
                            size: entryStat.size,
                            isDir, isCbz, isVideo, isAudio, isPdf, isEpub,
                            firstCbz, hasImages,
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
            if (a.isDir && !b.isDir) return -1;
            if (!a.isDir && b.isDir) return 1;
        }
        if (sortBy === 'date_desc') return b.mtime - a.mtime;
        if (sortBy === 'date_asc') return a.mtime - b.mtime;
        const locale = { numeric: true, sensitivity: 'base' } as const;
        if (sortBy === 'name_asc') return a.name.localeCompare(b.name, undefined, locale);
        if (sortBy === 'name_desc') return b.name.localeCompare(a.name, undefined, locale);
        return 0;
    });

    const isPlainImage = (i: any) => !i.isDir && !i.isCbz && !i.isVideo && !i.isAudio && !i.isPdf && !i.isEpub;

    const totalCount = items.length;
    const totalImages = items.filter(isPlainImage).length;
    const totalVideos = items.filter(i => i.isVideo).length;
    const totalAudio = items.filter(i => i.isAudio).length;
    const totalEbook = items.filter(i => i.isPdf || i.isEpub || i.isCbz).length;

    const toDto = (item: any) => ({
        name: item.name, path: item.path,
        isDir: item.isDir, isCbz: item.isCbz, isVideo: item.isVideo,
        isAudio: item.isAudio, isPdf: item.isPdf, isEpub: item.isEpub,
        firstCbz: item.firstCbz, size: item.size, lastModified: item.mtime,
    });

    const counts = { total: totalCount, totalImages, totalVideos, totalAudio, totalEbook };

    // ── Grouping ──
    if (!exclusiveType && !noGroup) {
        const groups = [
            { type: 'folders', items: items.filter(i => i.isDir) },
            { type: 'images',  items: items.filter(isPlainImage) },
            { type: 'cbz',     items: items.filter(i => i.isCbz) },
            { type: 'pdf',     items: items.filter(i => i.isPdf) },
            { type: 'epub',    items: items.filter(i => i.isEpub) },
            { type: 'audio',   items: items.filter(i => i.isAudio) },
            { type: 'videos',  items: items.filter(i => i.isVideo) },
        ].filter(g => g.items.length > 0);

        if (groups.length > 1) {
            const groupedResponse: Record<string, any> = {};
            for (const g of groups) {
                groupedResponse[g.type] = { total: g.items.length, items: g.items.slice(0, 11).map(toDto) };
            }
            return json({ isGrouped: true, groups: groupedResponse, ...counts });
        }
    }

    // ── Paginated flat list ──
    const start = page * limit;
    return json({
        images: items.slice(start, start + limit).map(toDto),
        page,
        hasMore: start + limit < totalCount,
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
