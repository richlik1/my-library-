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
const importPdfNode = (data: ArrayBuffer, name: string) =>
  importPdf(pdfjs as unknown as PdfjsLike, data, name, {
    docOptions: { standardFontDataUrl: require.resolve('pdfjs-dist/package.json').replace('package.json', 'standard_fonts/') },
  });

const LEFT = ['Left column starts the article and', 'keeps going on the second line of', 'the left side until it ends here.'];
const RIGHT = ['Right column continues the story and', 'adds more on its second line before', 'it finishes at the bottom right.'];

/** A two-column page. `interleaved` draws row by row (left, right, left…), as some PDF producers do. */
async function twoColumnPdf(interleaved: boolean): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  for (let p = 0; p < 2; p++) {
    const page = doc.addPage([460, 600]);
    const draw = (text: string, col: number, row: number) => page.drawText(text, { x: col ? 245 : 30, y: 540 - row * 15, size: 10, font });
    if (interleaved) LEFT.forEach((l, r) => (draw(l, 0, r), draw(RIGHT[r], 1, r)));
    else {
      LEFT.forEach((l, r) => draw(l, 0, r));
      RIGHT.forEach((l, r) => draw(l, 1, r));
    }
  }
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const expected = `${LEFT.join(' ')}\n\n${RIGHT.join(' ')}`;

describe('two-column PDFs', () => {
  it('reads the left column, then the right column (column-by-column PDF)', async () => {
    const book = await importPdfNode(await twoColumnPdf(false), 'cols.pdf');
    expect(book.chapters.map((c) => c.text).join('\n\n')).toContain(expected);
  });

  it('reads the left column, then the right column (row-by-row PDF)', async () => {
    const book = await importPdfNode(await twoColumnPdf(true), 'rows.pdf');
    expect(book.chapters.map((c) => c.text).join('\n\n')).toContain(expected);
  });
});
