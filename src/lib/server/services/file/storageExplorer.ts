/**
 * Storage Explorer — navigates the local file system hierarchy.
 * Serves the sidebar tree view and the root drives listing.
 * Intentionally keeps data shallow: it does NOT inspect media files inside containers.
 * Future extension: replace I/O calls with cache-first lookups from SQLite.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import {
    isImageFile,
    isVideoFile,
    isAudioFile,
    isPdfFile,
    isEpubFile,
    isArchiveFile,
    isExecutableFile,
} from '$lib/shared/utils/fileUtils';
import { fetchLocalSystemDrives, safelyEvaluateNodeStats } from '$lib/server/services/core/nodeScanner';

export interface NavigationDirectoryNode {
    name: string;
    absolutePath: string;
    isDirectory: boolean;
    isArchive: boolean;
    isMedia: boolean;
    isExecutable: boolean;
    lastModifiedTimeMs: number;
}

export interface NavigationResult {
    currentPath: string;
    parentPath: string | null;
    directories: NavigationDirectoryNode[];
    summary: { count: number; types: string[] } | null;
}

/**
 * Returns the navigation payload for a given directory path.
 * When no path is supplied, returns available root drives (Windows) or `/` (Unix).
 */
export async function browseContainerHierarchy(requestedPath: string | null): Promise<NavigationResult> {
    // Root level: list drives or unix root
    if (!requestedPath) {
        if (process.platform === 'win32') {
            const systemDrives = await fetchLocalSystemDrives();
            return {
                currentPath: '',
                parentPath: null,
                directories: systemDrives.map(drive => ({
                    name: drive.name,
                    absolutePath: drive.absolutePath,
                    isDirectory: true,
                    isArchive: false,
                    isMedia: false,
                    isExecutable: false,
                    lastModifiedTimeMs: 0,
                })),
                summary: null,
            };
        }
        return {
            currentPath: '/',
            parentPath: '',
            directories: [{ name: '/', absolutePath: '/', isDirectory: true, isArchive: false, isMedia: false, isExecutable: false, lastModifiedTimeMs: 0 }],
            summary: null,
        };
    }

    const resolvedCurrentPath = path.resolve(requestedPath);
    const currentDirectoryStats = await fs.stat(resolvedCurrentPath);
    if (!currentDirectoryStats.isDirectory()) {
        throw new Error('Path is not a directory');
    }

    const rawDirectoryEntries = await fs.readdir(resolvedCurrentPath, { withFileTypes: true });

    let visibleMediaFileCount = 0;
    const detectedMediaExtensions = new Set<string>();

    const directoryNodes: NavigationDirectoryNode[] = (
        await Promise.all(
            rawDirectoryEntries
                .filter(entry => !entry.name.startsWith('.'))
                .map(async entry => {
                    const entryAbsolutePath = path.join(resolvedCurrentPath, entry.name);
                    const fileExtension = path.extname(entry.name).toLowerCase();
                    const isDirectory = entry.isDirectory();
                    const isArchive = !isDirectory && isArchiveFile(fileExtension);
                    const isExecutable = !isDirectory && isExecutableFile(fileExtension);
                    const isMedia = !isDirectory && !isArchive && (
                        isImageFile(fileExtension) ||
                        isVideoFile(fileExtension) ||
                        isAudioFile(fileExtension) ||
                        isPdfFile(fileExtension) ||
                        isEpubFile(fileExtension)
                    );

                    if (isMedia) {
                        visibleMediaFileCount++;
                        detectedMediaExtensions.add(fileExtension.replace('.', '').toUpperCase());
                    }

                    const systemFileStats = await safelyEvaluateNodeStats(entryAbsolutePath);
                    return {
                        name: entry.name,
                        absolutePath: entryAbsolutePath,
                        isDirectory,
                        isArchive,
                        isMedia,
                        isExecutable,
                        lastModifiedTimeMs: systemFileStats?.mtimeMs ?? 0,
                    };
                })
        )
    ).sort((nodeA, nodeB) => {
        const rankEntry = (node: NavigationDirectoryNode) =>
            node.isDirectory ? 0 : (node.isArchive || node.isMedia || node.isExecutable) ? 1 : 2;
        const rankDifference = rankEntry(nodeA) - rankEntry(nodeB);
        return rankDifference !== 0
            ? rankDifference
            : nodeA.name.localeCompare(nodeB.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    const parentDirectoryPath = path.dirname(resolvedCurrentPath);
    const isAtStorageRoot =
        parentDirectoryPath === resolvedCurrentPath ||
        resolvedCurrentPath.endsWith(':\\') ||
        resolvedCurrentPath.endsWith(':/');

    return {
        currentPath: resolvedCurrentPath,
        parentPath: isAtStorageRoot ? '' : parentDirectoryPath,
        directories: directoryNodes,
        summary: visibleMediaFileCount > 0
            ? { count: visibleMediaFileCount, types: Array.from(detectedMediaExtensions).sort() }
            : null,
    };
}
