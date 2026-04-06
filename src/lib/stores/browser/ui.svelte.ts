import type { PendingFile } from "./types";

export type Drive = { name: string; path: string };

export class UIStore {
  isLoading = $state(false);
  isDrivesLoading = $state(false);
  error = $state("");
  exclusiveType = $state<string | null>(null);
  groupScrollPosition = $state(0);
  lastOpenedFolder = $state<string | null>(null);
  lastOpenedFile = $state<string | null>(null);
  highlightedPath = $state<string | null>(null);
  pendingFile = $state<PendingFile>(null);
  availableDrives = $state<Drive[]>([]);
}
