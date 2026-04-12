/**
 * Unified API client to interact with the backend.
 * Centralizes endpoint management and provides a clean, logical interface.
 */

export interface PaginationOptions {
    page?: number;
    limit?: number;
}

export interface GalleryOptions extends PaginationOptions {
    sort?: string;
    type?: string;
    imagesOnly?: boolean;
    exclusiveType?: string | null;
    isCover?: boolean;
    isToc?: boolean;
    noGroup?: boolean;
}

export class ApiClient {
    private async fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
        const res = await fetch(url, options);
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.message || `API Error: ${res.status}`);
        }
        return data as T;
    }

    // ─── File & Directory ──────────────────────────────────────────────────

    /**
     * Fetch navigation data (directories/drives).
     */
    async getNavigation(path?: string, init?: RequestInit) {
        const query = path ? `?path=${encodeURIComponent(path)}` : '';
        return this.fetchJson<any>(`/api/file/navigation${query}`, init);
    }

    /**
     * Fetch gallery items for a folder.
     */
    async getGallery(folder: string, opts: GalleryOptions = {}, init?: RequestInit) {
        const params = new URLSearchParams({
            folder,
            page: (opts.page ?? 0).toString(),
            limit: (opts.limit ?? 50).toString(),
            sort: opts.sort ?? 'date_desc',
            type: opts.type ?? 'all',
        });

        if (opts.imagesOnly) params.append('imagesOnly', 'true');
        if (opts.exclusiveType) params.append('exclusiveType', opts.exclusiveType);
        if (opts.isCover) params.append('isCover', 'true');
        if (opts.isToc) params.append('isToc', 'true');
        if (opts.noGroup) params.append('noGroup', 'true');

        return this.fetchJson<any>(`/api/file/gallery?${params.toString()}`, init);
    }

    /**
     * Fetch folders with covers.
     */
    async getCovers(folder: string, opts: PaginationOptions = {}, init?: RequestInit) {
        const params = new URLSearchParams({
            folder,
            page: (opts.page ?? 0).toString(),
            limit: (opts.limit ?? 30).toString(),
        });
        return this.fetchJson<any>(`/api/file/covers?${params.toString()}`, init);
    }



    // ─── Media & Ebook ─────────────────────────────────────────────────────

    /**
     * Fetch media metadata.
     */
    async getMediaMetadata(path: string, options: { retry?: boolean, cacheVersion?: string | number } & RequestInit = {}) {
        let url = `/api/media?path=${encodeURIComponent(path)}&metadata=true`;
        if (options?.retry) url += '&retry=true';
        if (options?.cacheVersion) url += `&v=${options.cacheVersion}`;
        return this.fetchJson<any>(url, options);
    }

    /**
     * Fetch ebook metadata.
     */
    async getEbookMetadata(path: string, init?: RequestInit) {
        return this.fetchJson<any>(`/api/ebook?path=${encodeURIComponent(path)}&metadata=true`, init);
    }

    /**
     * Clear the media thumbnail cache.
     */
    async clearCache(init?: RequestInit) {
        return this.fetchJson<any>('/api/media', { method: 'DELETE', ...init });
    }

    // ─── Downloader (getlink) ──────────────────────────────────────────────

    /**
     * Start a download request. Returns the raw SSE Response.
     */
    async startDownload(payload: { url: string; type: string; options?: any }, init?: RequestInit) {
        return fetch('/api/getlink', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            ...init
        });
    }

    /**
     * Get extracted info for a URL constraint. Returns the raw SSE Response.
     */
    async getDownloadInfo(url: string, type: string, isPlaylist: boolean = false, init?: RequestInit) {
        const params = new URLSearchParams({
            url,
            type,
            playlist: isPlaylist.toString()
        });
        return fetch(`/api/getlink/info?${params.toString()}`, init);
    }
}

export const api = new ApiClient();
