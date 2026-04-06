import type { ImageFile } from "$lib/utils/fileUtils";

export const PAGE_SIZE = 42;
export const COVER_PAGE_SIZE = 42;

export type CoverFolder = { name: string; path: string; coverPath: string };
export type PendingFile = { path: string; type: "media" | "cbz" | "pdf" } | null;
export type MediaType = "all" | "images" | "videos" | "audio" | "ebook";
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
} | null;
