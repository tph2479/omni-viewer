import { FolderStore } from "./folder.svelte";
import { ContentStore } from "./content.svelte";
import { PaginationStore } from "./pagination.svelte";
import { UIStore } from "./ui.svelte";
import { ModalStore } from "./modal.svelte";
import { CoverStore } from "./cover.svelte";
import { createActions } from "./actions.svelte";

export class BrowserStore {
  folder = new FolderStore();
  content = new ContentStore();
  pagination = new PaginationStore();
  ui = new UIStore();
  modal = new ModalStore();
  cover = new CoverStore();

  actions = createActions(this);

  reset() {
    this.content.items = [];
    this.content.totals = { images: 0, videos: 0, audio: 0, ebook: 0, media: 0 };
    this.pagination.currentPage = 0;
    this.pagination.hasMore = false;
    this.folder.path = "";
    this.folder.isSelected = false;
  }
}

export const browserStore = new BrowserStore();
