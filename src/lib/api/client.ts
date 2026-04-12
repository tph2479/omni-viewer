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
    async getNavigation(path?: string) {
        const query = path ? `?path=${encodeURIComponent(path)}` : '';
        return this.fetchJson<any>(`/api/file/navigation${query}`);
    }

    /**
     * Fetch gallery items for a folder.
     */
    async getGallery(folder: string, opts: GalleryOptions = {}) {
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

        return this.fetchJson<any>(`/api/file/gallery?${params.toString()}`);
    }

    /**
     * Fetch folders with covers.
     */
    async getCovers(folder: string, opts: PaginationOptions = {}) {
        const params = new URLSearchParams({
            folder,
            page: (opts.page ?? 0).toString(),
            limit: (opts.limit ?? 30).toString(),
        });
        return this.fetchJson<any>(`/api/file/covers?${params.toString()}`);
    }

    /**
     * Delete a file or folder.
     */
    async deleteItem(path: string) {
        return this.fetchJson<any>(`/api/file/item?path=${encodeURIComponent(path)}`, {
            method: 'DELETE'
        });
    }

    // ─── Media & Ebook ─────────────────────────────────────────────────────

    /**
     * Fetch media metadata.
     */
    async getMediaMetadata(path: string, retry?: boolean) {
        const retryParam = retry ? '&retry=true' : '';
        return this.fetchJson<any>(`/api/media?path=${encodeURIComponent(path)}&metadata=true${retryParam}`);
    }

    /**
     * Fetch ebook metadata.
     */
    async getEbookMetadata(path: string) {
        return this.fetchJson<any>(`/api/ebook?path=${encodeURIComponent(path)}&metadata=true`);
    }

    /**
     * Clear the media thumbnail cache.
     */
    async clearCache() {
        return this.fetchJson<any>('/api/media', { method: 'DELETE' });
    }
}

export const api = new ApiClient();
