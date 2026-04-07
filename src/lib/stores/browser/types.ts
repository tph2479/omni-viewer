export const PAGE_SIZE = 42;
export const COVER_PAGE_SIZE = 42;

export type MediaType = 'image' | 'video' | 'audio' | 'pdf' | 'epub' | 'cbz' | 'directory' | 'unknown';

export type MediaFile = {
    name: string;
    path: string;
    size: number;
    lastModified: number;
    mediaType: MediaType;
    width?: number;
    height?: number;
    entryPath?: string;
    containsImages?: boolean;
};

export type CoverFolder = { name: string; path: string; coverPath: string };
export type PendingFile = { path: string; type: "media" | "cbz" | "pdf" } | null;
export type FilterType = "all" | "images" | "videos" | "audio" | "ebook";
export type SortType =
    | "date_desc"
    | "date_asc"
    | "name_asc"
    | "name_desc"
    | "size_asc"
    | "size_desc";

export type SavedCoverState = {
    path: string;
    folders: CoverFolder[];
    total: number;
    page: number;
    hasMore: boolean;
    scrollPos: number;
    sort: SortType;
    counts: {
        media: number;
        images: number;
        videos: number;
        audio: number;
        ebook: number;
    };
} | null;
