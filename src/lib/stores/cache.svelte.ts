import { browser } from "$app/environment";

let _version = $state(
  browser ? parseInt(localStorage.getItem("cache-version") || "0") || 0 : 0,
);

export const cacheVersion = {
  get value() {
    return _version;
  },
  refresh() {
    _version = Date.now();
    if (browser) {
      localStorage.setItem("cache-version", _version.toString());
    }
  },
};
