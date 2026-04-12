import type { MediaFile } from "$lib/client/stores/browser/types";

const HOVER_DELAY_MS = 150;

export function useMetadataFetch(node: HTMLElement, item: MediaFile) {
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;

    const shouldFetch =
        item.mediaType !== "directory" &&
        item.mediaType !== "archive" &&
        !(item.width && item.height);

    function handleMouseEnter() {
        if (!shouldFetch) return;

        hoverTimer = setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/media?path=${encodeURIComponent(item.path)}&metadata=true`,
                );
                const data = await res.json();
                item.size = data.size;
                item.lastModified = data.lastModified;
                item.width = data.width;
                item.height = data.height;
            } catch {
                // Silently ignore fetch errors
            }
        }, HOVER_DELAY_MS);
    }

    function handleMouseLeave() {
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
    }

    node.addEventListener("mouseenter", handleMouseEnter);
    node.addEventListener("mouseleave", handleMouseLeave);

    return {
        destroy() {
            if (hoverTimer) clearTimeout(hoverTimer);
            node.removeEventListener("mouseenter", handleMouseEnter);
            node.removeEventListener("mouseleave", handleMouseLeave);
        },
    };
}
