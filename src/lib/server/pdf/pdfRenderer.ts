import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs/promises';

// We need to polyfill DOMMatrix for pdfjs-dist in Node environment
if (!(globalThis as any).DOMMatrix) {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a: number; b: number; c: number; d: number; e: number; f: number;
    constructor(arg?: number[]) {
      if (Array.isArray(arg)) {
        this.a = arg[0]; this.b = arg[1]; this.c = arg[2]; this.d = arg[3]; this.e = arg[4]; this.f = arg[5];
      } else {
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      }
    }
  };
}

import { spawn } from 'node:child_process';

/**
 * Renders the first page of a PDF to a PNG buffer with optimal scaling.
 * Runs in a separate isolated process to avoid main-thread memory spikes and V8 GC pauses
 * when dealing with extremely large PDF files.
 * 
 * @param pdfPath Absolute path to the PDF file.
 * @param targetWidth The desired width for the thumbnail (to optimize CPU/Memory usage).
 */
export async function renderPdfFirstPage(pdfPath: string, targetWidth: number = 400): Promise<Buffer> {
  const code = `
    import fs from 'node:fs/promises';
    import { createCanvas } from '@napi-rs/canvas';
    import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

    if (!globalThis.DOMMatrix) {
      globalThis.DOMMatrix = class DOMMatrix {
        constructor(arg) {
          if (Array.isArray(arg)) {
            this.a = arg[0]; this.b = arg[1]; this.c = arg[2]; this.d = arg[3]; this.e = arg[4]; this.f = arg[5];
          } else {
            this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
          }
        }
      };
    }

    async function run() {
      // Use url loading to prevent reading the entire file into memory at once
      const loadingTask = pdfjs.getDocument({ 
        url: process.env.PDF_PATH, 
        verbosity: 0, 
        stopAtErrors: false,
        disableAutoFetch: true,
        disableStream: false,
        disableFontFace: true
      });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const scale = parseFloat(process.env.TARGET_WIDTH) / unscaledViewport.width;
      const viewport = page.getViewport({ scale });
      
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      // Disable rendering annotations and interactive forms for speed
      await page.render({ 
        canvasContext: context, 
        viewport: viewport, 
        annotationMode: 0, 
        renderInteractiveForms: false 
      }).promise;
      
      const buffer = await canvas.encode('png');
      process.stdout.write(buffer);
      await pdf.destroy();
    }
    
    run().catch(e => { console.error(e); process.exit(1); });
  `;

  return new Promise((resolve, reject) => {
    // @ts-ignore
    const runner = globalThis.Bun ? 'bun' : 'node';
    const proc = spawn(runner, ['-e', code], {
      env: { ...process.env, PDF_PATH: pdfPath, TARGET_WIDTH: targetWidth.toString() },
      stdio: ['ignore', 'pipe', 'inherit'] // stderr inherits to log PDF JS errors to console if any
    });
    
    const chunks: Buffer[] = [];
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.on('close', (code: number) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`PDF render process failed with code ${code}`));
      }
    });
  });
}
