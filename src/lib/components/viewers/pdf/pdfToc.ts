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

export async function resolveItemPage(s: PdfState, item: any) {
    if (!s.pdfDoc || !item.dest || item.pageNumber) return;
    
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
        console.warn('Failed to resolve TOC item page:', err);
    }
}

export function initTocState(items: any[]) {
    for (const item of items) {
        item.expanded = false;
        if (item.items) initTocState(item.items);
    }
}

export async function resolveTocPages(s: PdfState, items: any[]) {
    if (!s.pdfDoc || !items.length) return;
    
    // Resolve only the current level in parallel
    await Promise.all(items.map(item => resolveItemPage(s, item)));
    
    // Trigger reactivity
    s.toc = [...s.toc];
}
