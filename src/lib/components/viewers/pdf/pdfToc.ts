import type { PdfState } from './pdfState.svelte';
import { scrollToIndex } from './pdfEvents';

export async function navigateToDest(s: PdfState, dest: string | any[]) {
    if (!s.pdfLinkService || !s.pdfDoc) return;
    
    if (Array.isArray(dest) && dest[0]) {
        const pageRef = dest[0];
        if (typeof pageRef === 'object' && 'num' in pageRef) {
            try {
                const pageIndex = await s.pdfDoc.getPageIndex(pageRef);
                scrollToIndex(s, pageIndex);
                return;
            } catch (e) {
                console.warn('Failed to get page index from dest:', e);
            }
        }
    }
    
    s.pdfLinkService.navigateTo(dest);
}

export async function resolveTocPages(s: PdfState) {
    if (!s.pdfDoc || !s.toc.length) return;
    
    // Lazy resolve sequential implementation to avoid concurrent spam that blocks PDF web worker
    // Flatten TOC into array
    const allItems: any[] = [];
    function collect(items: any[]) {
        for (const item of items) {
            allItems.push(item);
            if (item.items) collect(item.items);
        }
    }
    collect(s.toc);

    // Resolve sequentially in small batches to not lock up the PDF.js web worker
    const BATCH_SIZE = 50; 
    
    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
        if (s.isDestroyed) break;
        
        const batch = allItems.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (item) => {
            if (!item.dest) return;
            try {
                if (Array.isArray(item.dest)) {
                    const pageRef = item.dest[0];
                    if (pageRef && typeof pageRef === 'object' && 'num' in pageRef) {
                        const pageIndex = await s.pdfDoc.getPageIndex(pageRef);
                        item.pageNumber = pageIndex + 1;
                    }
                } else if (typeof item.dest === 'string') {
                    const dest = await s.pdfDoc.getDestination(item.dest);
                    if (dest && dest[0]) {
                        const pageIndex = await s.pdfDoc.getPageIndex(dest[0]);
                        item.pageNumber = pageIndex + 1;
                    }
                }
            } catch (err) {
                // Ignore resolve errors on specific items
            }
        }));
        
        // Yield to browser event loop
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    
    // Trigger Svelte proxy reactivity assignment by mutating the array pointer
    s.toc = [...s.toc];
}
