/**
 * On-device OCR for scanned PDF pages, with Tesseract.js (Apache-2.0). The engine and the English data are served
 * by the app itself (public/ocr), so page images never leave the device. Loaded only when the user asks.
 */
import type { PdfPage } from './pdf';

type OcrWorker = { recognize(image: HTMLCanvasElement): Promise<{ data: { text: string; confidence: number } }>; terminate(): Promise<unknown> };

let worker: Promise<OcrWorker> | null = null;

function getWorker(): Promise<OcrWorker> {
  worker ??= (async () => {
    const { createWorker } = await import('tesseract.js');
    const base = new URL('ocr/', document.baseURI).href;
    return (await createWorker('eng', 1, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: `${base}lang`,
      gzip: true,
      workerBlobURL: false,
    })) as unknown as OcrWorker;
  })();
  worker.catch(() => (worker = null));
  return worker;
}

/** Renders a PDF page at about 2,000 px wide and reads its text. Returns null when nothing usable was recognised. */
export async function ocrPdfPage(page: PdfPage): Promise<string | null> {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, 2000 / base.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, canvas, viewport }).promise;
  const { data } = await (await getWorker()).recognize(canvas);
  canvas.width = canvas.height = 0; // free the memory at once (iPhone)
  // Very low confidence means noise (photos, ornaments), not text.
  return data.confidence >= 40 && data.text.trim() ? data.text : null;
}

/** Frees the OCR engine's memory. */
export async function stopOcr() {
  const w = worker;
  worker = null;
  await (await w?.catch(() => null))?.terminate();
}
