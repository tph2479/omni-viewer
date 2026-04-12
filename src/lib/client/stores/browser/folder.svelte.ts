export class FolderStore {
  path = $state("");
  isSelected = $state(false);
  lastLoadedPath = $state("");
  pageHistory = $state<Record<string, number>>({});

  normalize(p: string): string {
    if (!p) return p;
    let res = p.trim();
    // Strip double drive prefix: C:\C:\Users → C:\Users
    res = res.replace(/^([A-Za-z]:\\)\1+/i, "$1");
    if (res.length === 2 && res[1] === ":") {
      res += "\\";
    } else if (res.length > 3 && (res.endsWith("\\") || res.endsWith("/"))) {
      res = res.slice(0, -1);
    }
    return res;
  }
}
