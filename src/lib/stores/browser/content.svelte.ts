import type { MediaFile } from "./types";

export class ContentStore {
  items = $state<MediaFile[]>([]);
  groupedData = $state<any>(null);
  isGrouped = $state(false);
  totals = $state({
    images: 0,
    videos: 0,
    audio: 0,
    ebook: 0,
    media: 0,
  });
}
