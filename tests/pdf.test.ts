// @vitest-environment node
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { importPdf, type PdfjsLike } from '../src/core/importers/pdf';

const require = createRequire(import.meta.url);

beforeAll(() => {
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
});

const lib = pdfjs as unknown as PdfjsLike;
const importPdfNode = (data: ArrayBuffer, name: string) =>
  importPdf(lib, data, name, {
    docOptions: { standardFontDataUrl: require.resolve('pdfjs-dist/package.json').replace('package.json', 'standard_fonts/') },
  });
const LOREM =
  'The quick brown fox jumps over the lazy dog while the narrator keeps reading this sentence aloud for testing purposes and more.';

async function textPdf(pages: string[][], title = 'Sample PDF Book'): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor('Pat Tester');
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  pages.forEach((lines, i) => {
    const page = doc.addPage([420, 600]);
    page.drawText('Sample PDF Book — running header', { x: 40, y: 570, size: 9, font });
    let y = 530;
    for (const line of lines) {
      if (line === '') {
        y -= 18;
        continue;
      }
      page.drawText(line, { x: 40, y, size: 12, font });
      y -= 15;
    }
    page.drawText(String(i + 1), { x: 205, y: 30, size: 9, font });
  });
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// 1x1 grey PNG
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0),
);

async function scannedPdf(withTextPage: boolean): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(PNG);
  for (let i = 0; i < 3; i++) doc.addPage([400, 600]).drawImage(img, { x: 0, y: 0, width: 400, height: 600 });
  if (withTextPage) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const p = doc.addPage([400, 600]);
    for (let i = 0; i < 5; i++) p.drawText('This page has real selectable text on it.', { x: 30, y: 500 - i * 15, size: 11, font });
  }
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('PDF importer', () => {
  it('extracts text, metadata, paragraphs and chapters; removes headers and page numbers', async () => {
    const pdf = await textPdf([
      ['Chapter 1', '', 'It was a dark and stormy night. ' + 'The wind howled.', 'The house stood alone on the hill.', '', 'A new paragraph starts here and it'],
      ['continued from the previous page and ends.', '', 'Chapter 2', '', 'The second chapter starts now.'],
      ['Chapter 3', '', 'Final words of the book.'],
    ]);
    const book = await importPdfNode(pdf, 'file.pdf');
    expect(book.title).toBe('Sample PDF Book');
    expect(book.author).toBe('Pat Tester');
    expect(book.ocr).toBeUndefined();
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
    const all = book.chapters.map((c) => c.text).join('\n\n');
    expect(all).not.toContain('running header');
    expect(all).not.toMatch(/(^|\n)\d(\n|$)/);
    expect(book.chapters[0].text).toContain('It was a dark and stormy night. The wind howled. The house stood alone on the hill.');
    expect(book.chapters[0].text).toContain('The house stood alone on the hill.\n\nA new paragraph starts here and it continued from the previous page and ends.');
    expect(book.chapters[1].text).toBe('Chapter 2\n\nThe second chapter starts now.');
  });

  it('keeps chapter headings that start each page but strips repeated running headers', async () => {
    const pages = [1, 2, 3, 4, 5].map((n) => [`Chapter ${n}`, '', `This is the body of chapter ${n}. It has a sentence.`]);
    const book = await importPdfNode(await textPdf(pages), 'five.pdf');
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4', 'Chapter 5']);
    expect(book.chapters.map((c) => c.text).join(' ')).not.toContain('running header');
  });

  it('groups pages when there are no chapter headings', async () => {
    const pages = Array.from({ length: 4 }, () => Array.from({ length: 6 }, () => LOREM.slice(0, 60)));
    const book = await importPdfNode(await textPdf(pages, ''), 'Untitled_Notes.pdf');
    expect(book.title).toBe('Untitled Notes');
    expect(book.chapters.length).toBeGreaterThanOrEqual(1);
    expect(book.chapters[0].title).toMatch(/^Pages? 1/);
  });

  it('explains that OCR is required for a fully scanned PDF', async () => {
    await expect(importPdfNode(await scannedPdf(false), 'scan.pdf')).rejects.toMatchObject({ kind: 'needs-ocr', message: expect.stringMatching(/scanned.*OCR/s) });
  });

  it('reports scanned pages in a partially scanned PDF', async () => {
    const book = await importPdfNode(await scannedPdf(true), 'mixed.pdf');
    expect(book.ocr).toEqual({ totalPages: 4, imageOnlyPages: [1, 2, 3] });
    expect(book.chapters[0].text).toContain('This page has real selectable text on it.');
  });

  it('rejects files that are not PDFs', async () => {
    await expect(importPdfNode(new TextEncoder().encode('%PDF-garbage').buffer as ArrayBuffer, 'bad.pdf')).rejects.toMatchObject({ kind: 'corrupt' });
  });
});
