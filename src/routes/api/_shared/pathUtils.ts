import path from 'node:path';

/**
 * Safely decode a URI-encoded path string.
 * Falls back to the raw string if decoding fails.
 */
export function decodePath(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/**
 * Normalise slashes, detect archive (`::`) paths, and resolve to an
 * OS-absolute base path.
 *
 * @returns `absolutePath` — the real file on disk
 * @returns `internalPath` — the path inside an archive, or `null`
 * @returns `isArchivePath` — whether `::` was present
 */
export function resolvePath(decoded: string): {
    absolutePath: string;
    internalPath: string | null;
    isArchivePath: boolean;
    normalizedPath: string;
} {
    const normalizedPath = decoded.replace(/\\/g, '/');
    const isArchivePath = normalizedPath.includes('::');
    const [baseFilePath, internalPath = null] = isArchivePath
        ? normalizedPath.split('::')
        : [normalizedPath];

    // Accept absolute Windows (C:\…) and POSIX (/) paths verbatim; resolve everything else
    const absolutePath =
        baseFilePath.startsWith('/') || /^[a-zA-Z]:/.test(baseFilePath)
            ? baseFilePath
            : path.resolve(baseFilePath);

    return { absolutePath, internalPath, isArchivePath, normalizedPath };
}

/**
 * Sanitise a path param to prevent duplicated drive-letter prefixes on Windows,
 * e.g. `C:\C:\foo` → `C:\foo`.
 */
export function sanitizePath(p: string | null): string | null {
    if (!p) return p;
    return p.replace(/^([A-Za-z]:\\)\1+/i, '$1');
}
