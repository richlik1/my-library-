import type { BookFormat, ImportedBook } from '../types';
import { importDocx } from './docx';
import { importEpub } from './epub';
import { ImportError } from './errors';
import type { ProgressFn } from './pdf';
import { importTxt } from './txt';

export { ImportError, OCR_EXPLANATION } from './errors';

export const ACCEPT =
  '.pdf,.epub,.txt,.text,.md,.docx,application/pdf,application/epub+zip,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Detects the format from magic bytes first, then the extension. */
export async function detectFormat(file: Blob, name: string): Promise<BookFormat | null> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const ascii = String.fromCharCode(...head);
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ascii.includes('%PDF-')) return 'pdf';
  if (head[0] === 0x50 && head[1] === 0x4b) {
    if (ascii.includes('mimetypeapplication/epub+zip') || ext === 'epub') return 'epub';
    if (ext === 'docx' || ascii.includes('word/') || ascii.includes('[Content_Types].xml')) return 'docx';
  }
  if (ext === 'pdf') return 'pdf';
  if (ext === 'epub') return 'epub';
  if (ext === 'docx') return 'docx';
  if (['txt', 'text', 'md'].includes(ext) || file.type.startsWith('text/')) return 'txt';
  return null;
}

export async function importFile(file: File, onProgress?: ProgressFn): Promise<ImportedBook> {
  const format = await detectFormat(file, file.name);
  if (file.size === 0) throw new ImportError('This file is empty.', 'empty');
  switch (format) {
    case 'pdf': {
      // PDF.js is large, so it is loaded only when a PDF is imported.
      const [{ loadPdfjs, pdfDocOptions, useMainThreadWorker }, { importPdf }] = await Promise.all([import('./pdfjs-browser'), import('./pdf')]);
      const data = await file.arrayBuffer();
      const run = async () => importPdf(await loadPdfjs(), data.slice(0), file.name, { onProgress, docOptions: pdfDocOptions() });
      try {
        return await run();
      } catch (e) {
        // "Could not open" can mean the browser blocked PDF.js's worker; retry without it.
        if (e instanceof ImportError && e.kind === 'corrupt' && (await useMainThreadWorker())) return run();
        throw e;
      }
    }
    case 'epub':
      return importEpub(file, file.name);
    case 'docx':
      return importDocx(file, file.name);
    case 'txt':
      return importTxt(file, file.name);
    default:
      if (/\.doc$/i.test(file.name)) throw new ImportError('Old Word .doc files are not supported. Open it in Word or Pages and save as .docx, then import it.', 'unsupported');
      if (/\.(mobi|azw3?|kfx)$/i.test(file.name)) throw new ImportError('Kindle files are not supported. Use a DRM-free EPUB or PDF instead.', 'unsupported');
      throw new ImportError(`“${file.name}” is not a supported book. Use PDF, EPUB, DOCX or TXT.`, 'unsupported');
  }
}
