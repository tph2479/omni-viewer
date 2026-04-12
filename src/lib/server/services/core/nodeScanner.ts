import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Stats } from 'node:fs';

import { 
    isArchiveFile, 
    isExecutableFile, 
    getMediaType 
} from '$lib/shared/utils/fileUtils';
import type { MediaType } from '$lib/client/stores/browser/types';

const execAsync = promisify(exec);

export interface SystemFileStats extends Stats {}

export interface StorageDriveNode {
    name: string;
    absolutePath: string;
}

export interface FileSystemNode {
    name: string;
    absolutePath: string;
    isDirectory: boolean;
    isArchive: boolean;
    isMedia: boolean;
    isExecutable: boolean;
    lastModifiedTimeMs: number;
    fileSize: number;
    mediaType: MediaType;
}

/**
 * Safely evaluates system stats without throwing hard errors when permissions fail.
 */
export async function safelyEvaluateNodeStats(absolutePath: string): Promise<SystemFileStats | null> {
    try {
        return await fs.stat(absolutePath);
    } catch {
        return null;
    }
}

/**
 * Sweeps a directory and returns a pre-sorted array of comprehensively analyzed FileSystemNodes.
 */
export async function fetchSortedSystemNodes(directoryAbsolutePath: string): Promise<FileSystemNode[]> {
    const rawDirectoryEntries = await fs.readdir(directoryAbsolutePath, { withFileTypes: true });
    
    const processedNodes = await Promise.all(
        rawDirectoryEntries
            .filter(entry => !entry.name.startsWith('.'))
            .map(async entry => {
                const absolutePath = path.join(directoryAbsolutePath, entry.name);
                const fileExtension = path.extname(entry.name).toLowerCase();
                const systemFileStats = await safelyEvaluateNodeStats(absolutePath);
                
                const isDirectory = entry.isDirectory();
                const isArchive = !isDirectory && isArchiveFile(fileExtension);
                const isExecutable = !isDirectory && isExecutableFile(fileExtension);
                
                let mediaType = isDirectory ? 'directory' as MediaType : getMediaType(fileExtension);
                const isMedia = mediaType !== 'unknown' && mediaType !== 'directory';
                
                return {
                    name: entry.name,
                    absolutePath,
                    isDirectory,
                    isArchive,
                    isExecutable,
                    isMedia,
                    lastModifiedTimeMs: systemFileStats?.mtimeMs ?? 0,
                    fileSize: systemFileStats?.size ?? 0,
                    mediaType
                };
            })
    );

    // Default alphanumeric sort
    return processedNodes.sort((a, b) => 
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
}

/**
 * Fetches root system drives for Windows.
 */
export async function fetchLocalSystemDrives(): Promise<StorageDriveNode[]> {
    try {
        const { stdout } = await execAsync('wmic logicaldisk get name, volumename /format:list');
        const lines = stdout.split(/\r?\n/);
        const systemDrives: StorageDriveNode[] = [];
        let currentDriveScan: { name?: string; volumeName?: string } = {};

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) {
                if (currentDriveScan.name) {
                    const volume = currentDriveScan.volumeName || '';
                    systemDrives.push({
                        name: volume ? `${currentDriveScan.name}\\ (${volume})` : `${currentDriveScan.name}\\`,
                        absolutePath: `${currentDriveScan.name}\\`
                    });
                    currentDriveScan = {};
                }
                continue;
            }
            if (trimmedLine.startsWith('Name=')) currentDriveScan.name = trimmedLine.slice(5).trim();
            else if (trimmedLine.startsWith('VolumeName=')) currentDriveScan.volumeName = trimmedLine.slice(11).trim();
        }

        if (currentDriveScan.name) {
            const volume = currentDriveScan.volumeName || '';
            systemDrives.push({
                name: volume ? `${currentDriveScan.name}\\ (${volume})` : `${currentDriveScan.name}\\`,
                absolutePath: `${currentDriveScan.name}\\`
            });
        }

        return systemDrives.sort((a, b) => {
            if (a.absolutePath.startsWith('C:')) return -1;
            if (b.absolutePath.startsWith('C:')) return 1;
            return a.absolutePath.localeCompare(b.absolutePath);
        });
    } catch (error) {
        console.error('[NodeScanner] Failed to fetch Windows drives:', error);
        return [{ name: 'C:\\', absolutePath: 'C:\\' }];
    }
}
