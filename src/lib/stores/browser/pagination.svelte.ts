import { PAGE_SIZE, type FilterType, type SortType } from "./types";

export class PaginationStore {
  currentPage = $state(0);
  hasMore = $state(false);
  pageSize = $state(PAGE_SIZE);
  sort = $state<SortType>("date_desc");
  mediaType = $state<FilterType>("all");
}
