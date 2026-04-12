import { createCanvas, Path2D, ImageData, Image } from '@napi-rs/canvas';

// Robust 2D DOMMatrix polyfill for pdfjs-dist in Node environment
if (!(globalThis as any).DOMMatrix || !(globalThis as any).DOMMatrix.prototype.preMultiplySelf) {
    (globalThis as any).DOMMatrix = class DOMMatrix {
        a: number; b: number; c: number; d: number; e: number; f: number;
        constructor(arg?: any) {
            if (Array.isArray(arg) && arg.length >= 6) {
                this.a = arg[0]; this.b = arg[1]; this.c = arg[2];
                this.d = arg[3]; this.e = arg[4]; this.f = arg[5];
            } else if (arg && typeof arg === 'object') {
                this.a = arg.a; this.b = arg.b; this.c = arg.c;
                this.d = arg.d; this.e = arg.e; this.f = arg.f;
            } else {
                this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
            }
        }
        preMultiplySelf(m: any) {
            const { a, b, c, d, e, f } = this;
            this.a = m.a * a + m.c * b;
            this.b = m.b * a + m.d * b;
            this.c = m.a * c + m.c * d;
            this.d = m.b * c + m.d * d;
            this.e = m.a * e + m.c * f + m.e;
            this.f = m.b * e + m.d * f + m.f;
            return this;
        }
        translate(x: number, y: number) {
            const m = new DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]);
            m.e += m.a * x + m.c * y;
            m.f += m.b * x + m.d * y;
            return m;
        }
        scale(sx: number, sy: number) {
            const m = new DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]);
            m.a *= sx; m.b *= sx;
            m.c *= (sy ?? sx); m.d *= (sy ?? sx);
            return m;
        }
    };
}

(globalThis as any).Path2D   = Path2D;
(globalThis as any).ImageData = ImageData;
(globalThis as any).Image    = Image;

/**
 * Renders a specific page of a PDF to a PNG buffer.
 *
 * @param pdfPath     Absolute path to the PDF file.
 * @param pageNumber  1-indexed page number.
 * @param targetWidth Desired render width in pixels (controls CPU/memory usage).
 */
export async function renderPdfPage(
    pdfPath: string,
    pageNumber: number = 1,
    targetWidth: number = 400,
): Promise<Buffer> {
    try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

        const loadingTask = pdfjs.getDocument({
            url: pdfPath,
            verbosity: 0,
            stopAtErrors: false,
            disableAutoFetch: true,
            disableStream: false,
            disableFontFace: true,
        });

        const pdf         = await loadingTask.promise;
        const safePageNum = Math.max(1, Math.min(pageNumber, pdf.numPages));
        const page        = await pdf.getPage(safePageNum);

        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const scale            = targetWidth / unscaledViewport.width;
        const viewport         = page.getViewport({ scale });

        const canvas  = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext('2d');

        await page.render({ canvasContext: context as any, canvas: canvas as any, viewport }).promise;

        const buffer = await canvas.encode('png');
        await pdf.destroy();
        return buffer;
    } catch (error) {
        console.error(`[PDF Render Error] ${pdfPath} (page ${pageNumber}):`, error);
        throw new Error(`Failed to render PDF page: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Returns the total page count of a PDF file.
 */
export async function getPdfPageCount(pdfPath: string): Promise<number> {
    try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const loadingTask = pdfjs.getDocument({
            url: pdfPath,
            verbosity: 0,
            disableAutoFetch: true,
            disableStream: true,
        });
        const pdf      = await loadingTask.promise;
        const numPages = pdf.numPages;
        await pdf.destroy();
        return numPages;
    } catch (e) {
        console.error(`[PDF Meta Error] ${pdfPath}:`, e);
        return 0;
    }
}
