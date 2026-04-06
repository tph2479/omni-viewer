import type { SavedCoverState, CoverFolder } from "./types";

export class CoverStore {
  enabled = $state(false);
  folders = $state<CoverFolder[]>([]);
  total = $state(0);
  page = $state(0);
  hasMore = $state(false);
  savedState = $state<SavedCoverState>(null);
  scrollPosition = $state(0);
}
