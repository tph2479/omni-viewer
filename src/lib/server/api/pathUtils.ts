import path from 'node:path';
import fs from 'node:fs/promises';
import { error } from '@sveltejs/kit';

/**
 * Safely decode a URI-encoded path string.
 * Falls back to the raw string if decoding fails.
 */
export function decodePath(raw: string): string {
    if (!raw) return '';
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/**
 * Sanitise a path param to prevent duplicated drive-letter prefixes on Windows,
 * e.g. `C:\C:\foo` → `C:\foo`.
 */
export function sanitizePath(p: string | null): string {
    if (!p) return '';
    // Fix Windows double-drives: C:\C:\Path -> C:\Path
    let sanitized = p.replace(/^([A-Za-z]:\\)\1+/i, '$1');
    // Normalize slashes to OS default
    return path.normalize(sanitized);
}

export interface PathContext {
    absolutePath: string;
    internalPath: string | null;
    isArchivePath: boolean;
    normalizedPath: string;
    exists: boolean;
    isFile: boolean;
    isDirectory: boolean;
}

/**
 * Normalise slashes, detect archive (`::`) paths, and resolve to an
 * OS-absolute base path. Checks existence and type.
 */
export async function resolvePathContext(decoded: string): Promise<PathContext> {
    const normalizedPath = decoded.replace(/\\/g, '/');
    const isArchivePath = normalizedPath.includes('::');
    const [baseFilePath, internalPath = null] = isArchivePath
        ? normalizedPath.split('::')
        : [normalizedPath];

    // Accept absolute Windows (C:\…) and POSIX (/) paths verbatim; resolve everything else
    const absolutePath =
        baseFilePath.startsWith('/') || /^[a-zA-Z]:/.test(baseFilePath)
            ? path.normalize(baseFilePath)
            : path.resolve(baseFilePath);

    let exists = false;
    let isFile = false;
    let isDirectory = false;

    try {
        const stat = await fs.stat(absolutePath);
        exists = true;
        isFile = stat.isFile();
        isDirectory = stat.isDirectory();
    } catch {
        // Doesn't exist
    }

    return {
        absolutePath,
        internalPath,
        isArchivePath,
        normalizedPath,
        exists,
        isFile,
        isDirectory
    };
}

/**
 * Validates that a path exists and matches expected type.
 * Throws SvelteKit error if invalid.
 */
export async function validatePath(p: string | null, type: 'file' | 'dir' | 'any' = 'any'): Promise<PathContext> {
    if (!p) throw error(400, 'Path is required');
    const ctx = await resolvePathContext(sanitizePath(decodePath(p)));
    
    if (!ctx.exists) throw error(404, `Path not found: ${ctx.absolutePath}`);
    
    if (type === 'file' && !ctx.isFile && !ctx.isArchivePath) {
        throw error(400, `Path is not a file: ${ctx.absolutePath}`);
    }
    if (type === 'dir' && !ctx.isDirectory) {
        throw error(400, `Path is not a directory: ${ctx.absolutePath}`);
    }
    
    return ctx;
}
