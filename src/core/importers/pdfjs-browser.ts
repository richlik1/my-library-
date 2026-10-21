// Browser loader for PDF.js. The "legacy" build supports older Safari
// versions (iOS 15/16) that the modern build does not.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PdfjsLike } from './pdf';

let configured = false;
let mainThread = false;

export async function loadPdfjs(): Promise<PdfjsLike> {
  if (!configured) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    configured = true;
  }
  return pdfjs as unknown as PdfjsLike;
}

/**
 * Fallback for browsers or embedded viewers that refuse to start the PDF.js
 * worker: load the worker code into the page itself so PDF.js runs on the
 * main thread (slower on huge files, but it works everywhere).
 * Returns false if it was already in use.
 */
export async function useMainThreadWorker(): Promise<boolean> {
  if (mainThread) return false;
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
  // PDF.js caches a failed worker setup forever; replace that cache with the in-page worker.
  Object.defineProperty(pdfjs.PDFWorker, '_setupFakeWorkerGlobal', { value: Promise.resolve(worker.WorkerMessageHandler), configurable: true });
  mainThread = true;
  return true;
}

/** Asset locations served from the app itself (never a CDN), so it works offline. */
export function pdfDocOptions(): Record<string, unknown> {
  const base = new URL('pdfjs/', document.baseURI).href;
  return { cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/` };
}
