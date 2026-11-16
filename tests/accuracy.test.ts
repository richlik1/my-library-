// @vitest-environment node
/**
 * Import accuracy: books generated from a known text are rendered as PDF/EPUB, imported, and compared with the
 * source word by word (recall = source words found in order; precision = imported words that belong to the source).
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { importPdf, type PdfjsLike } from '../src/core/importers/pdf';
import { buildImportReport } from '../src/core/importers/report';
import { bookToPdf, compareWords, makeSourceBook, type SourceBook } from './fixtures/books';

const require = createRequire(import.meta.url);
beforeAll(() => {
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
});
const importPdfNode = (data: ArrayBuffer, name: string) =>
  importPdf(pdfjs as unknown as PdfjsLike, data, name, {
    docOptions: { standardFontDataUrl: require.resolve('pdfjs-dist/package.json').replace('package.json', 'standard_fonts/') },
  });

const sourceText = (c: SourceBook['chapters'][number]) => [c.title, ...c.paragraphs].join('\n\n');

function check(book: SourceBook, imported: { chapters: Array<{ title: string; text: string; kind?: string }> }, min = 0.99) {
  const main = imported.chapters.filter((c) => c.kind !== 'notes');
  // Order: the chapter titles, in order.
  expect(main.map((c) => c.title)).toEqual(book.chapters.map((c) => c.title));
  // Completeness and no invented text, chapter by chapter.
  const scores = book.chapters.map((c, i) => compareWords(sourceText(c), main[i]?.text ?? ''));
  const worst = scores.reduce((w, s) => ({ recall: Math.min(w.recall, s.recall), precision: Math.min(w.precision, s.precision) }), { recall: 1, precision: 1 });
  expect(worst.recall).toBeGreaterThanOrEqual(min);
  expect(worst.precision).toBeGreaterThanOrEqual(min);
  return worst;
}

describe('import accuracy against the source text', () => {
  it('single-column PDF with running headers, page numbers and hyphenation: every word, in order', async () => {
    const book = makeSourceBook({ chapters: 6, paragraphs: 12 });
    const { data } = await bookToPdf(book);
    const imported = await importPdfNode(data, 'single.pdf');
    const worst = check(book, imported);
    // No running headers or page numbers left in the text.
    expect(imported.chapters.map((c) => c.text).join('\n')).not.toContain('running header');
    console.log(`single column: worst chapter recall ${worst.recall.toFixed(4)}, precision ${worst.precision.toFixed(4)}`);
  });

  it('two-column PDF (column by column and row by row)', async () => {
    const book = makeSourceBook({ chapters: 4, paragraphs: 10, seed: 3 });
    for (const rowByRow of [false, true]) {
      const { data } = await bookToPdf(book, { columns: 2, rowByRow });
      const worst = check(book, await importPdfNode(data, 'two.pdf'));
      console.log(`two columns ${rowByRow ? 'row by row' : 'column by column'}: recall ${worst.recall.toFixed(4)}, precision ${worst.precision.toFixed(4)}`);
    }
  });

  it('long book (40 chapters, ~25,000 words) imports completely and in order', async () => {
    const book = makeSourceBook({ chapters: 40, paragraphs: 14, seed: 11 });
    const { data } = await bookToPdf(book);
    const t0 = Date.now();
    const imported = await importPdfNode(data, 'long.pdf');
    const ms = Date.now() - t0;
    const worst = check(book, imported);
    const report = buildImportReport(imported);
    expect(report.chapters.flatMap((c) => c.flags).filter((f) => f.severity === 'problem')).toEqual([]);
    console.log(`long book: ${report.words} words, ${imported.signals?.pages} pages in ${ms} ms; worst recall ${worst.recall.toFixed(4)}`);
  }, 120_000);

  it('accented (French) text keeps its characters', async () => {
    const book = makeSourceBook({ chapters: 3, paragraphs: 6, french: true, seed: 5 });
    const { data } = await bookToPdf(book);
    const imported = await importPdfNode(data, 'fr.pdf');
    check(book, imported);
    expect(imported.chapters[0].text).toMatch(/[éèêàâçôœû]/);
  });

  it('page-bottom footnotes in a PDF are kept as Notes, not mixed into the text', async () => {
    const book = makeSourceBook({ chapters: 3, paragraphs: 14, seed: 9 });
    const { data, footnotes } = await bookToPdf(book, { footnotes: true });
    const imported = await importPdfNode(data, 'notes.pdf');
    check(book, imported);
    const notes = imported.chapters.find((c) => c.kind === 'notes');
    expect(notes).toBeTruthy();
    for (const n of footnotes) expect(notes!.text).toContain(n);
  });
});
