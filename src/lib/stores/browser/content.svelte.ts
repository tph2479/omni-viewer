import type { ImageFile } from "$lib/utils/fileUtils";

export class ContentStore {
  items = $state<ImageFile[]>([]);
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
