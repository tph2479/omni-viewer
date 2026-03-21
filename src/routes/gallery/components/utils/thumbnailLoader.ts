const queue: (() => void)[] = [];
let active = 0;
const MAX_CONCURRENT = 2; // Guarantee at least 4 browser connections are ALWAYS free for video streaming/metadata

export async function fetchThumbnailBlob(url: string, signal: AbortSignal): Promise<string> {
    if (active >= MAX_CONCURRENT) {
        await new Promise<void>(resolve => {
            const onAbort = () => {
                const idx = queue.indexOf(resolve);
                if (idx > -1) queue.splice(idx, 1);
                resolve();
            };
            signal.addEventListener('abort', onAbort, { once: true });
            queue.push(resolve);
        });
    }
    if (signal.aborted) throw new Error("Aborted BEFORE fetch");
    active++;
    try {
        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        return URL.createObjectURL(blob);
    } finally {
        active--;
        if (queue.length > 0) queue.shift()!();
    }
}

const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export function lazyThumbnail(node: HTMLImageElement, url: string) {
    let abortController = new AbortController();
    let currentObjectUrl: string | null = null;
    let observer: IntersectionObserver;
    
    // Initialize state to avoid "broken" icon and ugly layout
    if (!node.src || node.src === window.location.href) {
        node.src = PLACEHOLDER;
    }
    node.style.opacity = '0';
    node.style.transition = 'opacity 0.2s ease-in-out';

    node.onload = () => {
        if (node.src !== PLACEHOLDER) {
            node.style.opacity = '1';
        }
    };

    node.onerror = () => {
        node.style.display = 'none';
    };
    
    async function executeLoad(targetUrl: string) {
        try {
            const src = await fetchThumbnailBlob(targetUrl, abortController.signal);
            if (!abortController.signal.aborted) {
                currentObjectUrl = src;
                node.src = src;
                node.style.display = ''; 
            }
        } catch (e) {
            if (!abortController.signal.aborted) {
				node.style.display = 'none';
			}
        }
    }

    observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            observer.disconnect();
            executeLoad(url);
        }
    }, { rootMargin: '400px' });

    observer.observe(node);

    return {
        update(newUrl: string) {
            if (url !== newUrl) {
                url = newUrl;
                abortController.abort();
                if (currentObjectUrl) {
                    URL.revokeObjectURL(currentObjectUrl);
                    currentObjectUrl = null;
                }
                node.removeAttribute('src'); // Clean up old image instantly
                abortController = new AbortController();
                
                // Re-observe since the node's content changed
                observer.disconnect();
                observer.observe(node);
            }
        },
        destroy() {
            abortController.abort();
            observer.disconnect();
            if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
        }
    };
}
