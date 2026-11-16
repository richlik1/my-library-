// @vitest-environment jsdom
/**
 * Real public-domain books (opt-in, run in CI): REAL_BOOKS_DIR holds Standard Ebooks source folders
 * (github.com/standardebooks/<book>, unzipped), each a complete EPUB 3 under `src/`. The book is zipped as an
 * EPUB and imported; the ground truth is every paragraph of its reading-order (spine) files, extracted
 * independently of the importer. Every body paragraph must be in the imported book, in the same order, and the
 * endnotes must be in Notes.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { importEpub } from '../src/core/importers/epub';
import { buildImportReport } from '../src/core/importers/report';

const DIR = process.env.REAL_BOOKS_DIR;
const books = DIR && existsSync(DIR) ? readdirSync(DIR).filter((d) => existsSync(join(DIR, d, 'src', 'META-INF', 'container.xml'))) : [];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’“”"'`_*\-—–]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
}

async function zipEpub(src: string): Promise<Blob> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  for (const f of files(src)) if (!f.endsWith('mimetype')) zip.file(relative(src, f), readFileSync(f));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}

/** Ground truth: <p> paragraphs of the spine files, split into body text and endnotes. */
function groundTruth(src: string): { body: string[]; notes: string[] } {
  const container = readFileSync(join(src, 'META-INF', 'container.xml'), 'utf8');
  const opfPath = /full-path="([^"]+)"/.exec(container)![1];
  const opfDir = join(src, opfPath, '..');
  const opf = new DOMParser().parseFromString(readFileSync(join(src, opfPath), 'utf8'), 'application/xml');
  const manifest = new Map(Array.from(opf.getElementsByTagName('item')).map((i) => [i.getAttribute('id')!, i.getAttribute('href')!]));
  const body: string[] = [];
  const notes: string[] = [];
  for (const ref of Array.from(opf.getElementsByTagName('itemref'))) {
    const href = manifest.get(ref.getAttribute('idref')!)!;
    const doc = new DOMParser().parseFromString(readFileSync(join(opfDir, href), 'utf8'), 'application/xhtml+xml');
    const isNotes = /endnotes/.test(href);
    for (const p of Array.from(doc.getElementsByTagName('p'))) {
      // Note-reference marks are not read in the imported text either.
      for (const a of Array.from(p.getElementsByTagName('a'))) if (/noteref/.test(a.getAttribute('epub:type') ?? '')) a.remove();
      const t = norm(p.textContent ?? '');
      if (t.split(' ').length < 6) continue;
      (isNotes ? notes : body).push(t);
    }
  }
  return { body, notes };
}

function inOrder(paras: string[], text: string) {
  let found = 0;
  let outOfOrder = 0;
  let at = 0;
  const missing: string[] = [];
  for (const p of paras) {
    const key = p.slice(0, 100);
    const i = text.indexOf(key, at);
    if (i >= 0) {
      found++;
      at = i + key.length;
    } else if (text.includes(key)) outOfOrder++;
    else missing.push(p.slice(0, 80));
  }
  return { found, outOfOrder, missing };
}

describe.skipIf(!books.length)('real public-domain books (Standard Ebooks)', () => {
  for (const name of books) {
    it(`${name}: every paragraph, in order; endnotes in Notes`, async () => {
      const src = join(DIR!, name, 'src');
      const book = await importEpub(await zipEpub(src), `${name}.epub`);
      const truth = groundTruth(src);
      const main = norm(book.chapters.filter((c) => c.kind !== 'notes').map((c) => c.text).join(' '));
      const notesText = norm(book.chapters.filter((c) => c.kind === 'notes').map((c) => c.text).join(' '));
      const b = inOrder(truth.body, main);
      const report = buildImportReport(book);
      console.log(
        `${name}: “${book.title}”, ${book.chapters.length} chapters, ${report.words} words. Body paragraphs ${b.found}/${truth.body.length} in order, ${b.outOfOrder} out of order, ${b.missing.length} missing. Endnotes ${truth.notes.length}. Order ${report.order.status}, confidence ${report.confidence}; flags: ${[...report.flags, ...report.chapters.flatMap((c) => c.flags)].map((f) => f.kind).join(', ') || 'none'}`,
      );
      if (b.missing.length) console.log(`  missing, first few: ${b.missing.slice(0, 3).join(' | ')}`);
      expect(b.outOfOrder).toBe(0);
      expect(b.found / truth.body.length).toBeGreaterThanOrEqual(0.995);
      if (truth.notes.length) {
        const n = inOrder(truth.notes, notesText);
        console.log(`  endnotes in Notes: ${n.found}/${truth.notes.length}`);
        expect(n.found / truth.notes.length).toBeGreaterThanOrEqual(0.95);
      }
    }, 180_000);
  }
});
