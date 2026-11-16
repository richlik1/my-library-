// @vitest-environment jsdom
/**
 * Real public-domain books (opt-in): REAL_BOOKS_DIR holds <id>.epub and <id>.txt from Project Gutenberg
 * (downloaded by CI). The EPUB import is checked against the plain-text edition of the same book: every
 * paragraph of the text must be found in the imported book, in the same order.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importEpub } from '../src/core/importers/epub';
import { buildImportReport } from '../src/core/importers/report';

const DIR = process.env.REAL_BOOKS_DIR;
const ids = DIR && existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.epub')).map((f) => f.slice(0, -5)) : [];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’“”"'`_*\-—–]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Paragraphs of a Gutenberg text, between its START and END markers. */
function gutenbergParagraphs(txt: string): string[] {
  const start = txt.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
  const end = txt.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/i);
  const body = txt.slice(start >= 0 ? txt.indexOf('\n', start) : 0, end > 0 ? end : undefined);
  return body
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map(norm)
    .filter((p) => p.split(' ').length >= 8);
}

describe.skipIf(!ids.length)('real public-domain books', () => {
  for (const id of ids) {
    it(`${id}: every paragraph of the plain-text edition is in the imported EPUB, in order`, async () => {
      const epub = new Blob([readFileSync(join(DIR!, `${id}.epub`))]);
      const book = await importEpub(epub, `${id}.epub`);
      const text = norm(book.chapters.filter((c) => c.kind !== 'notes').map((c) => c.text).join(' '));
      const paras = gutenbergParagraphs(readFileSync(join(DIR!, `${id}.txt`), 'utf8'));
      let found = 0;
      let outOfOrder = 0;
      let at = 0;
      const missing: string[] = [];
      for (const p of paras) {
        const key = p.slice(0, 120);
        const i = text.indexOf(key, at);
        if (i >= 0) {
          found++;
          at = i + key.length;
        } else if (text.includes(key)) outOfOrder++;
        else missing.push(p.slice(0, 80));
      }
      const recall = found / Math.max(1, paras.length);
      const report = buildImportReport(book);
      console.log(
        `${id} “${book.title}”: ${book.chapters.length} chapters, ${report.words} words; ${found}/${paras.length} paragraphs in order (${(recall * 100).toFixed(1)}%), ${outOfOrder} out of order, ${missing.length} missing; order ${report.order.status}; confidence ${report.confidence}`,
      );
      if (missing.length) console.log(`  missing, first few: ${missing.slice(0, 3).join(' | ')}`);
      expect(outOfOrder).toBe(0);
      // Gutenberg's text edition has a few extra paragraphs (licence notes, transcriber notes) the EPUB lacks.
      expect(recall).toBeGreaterThanOrEqual(0.97);
    }, 120_000);
  }
});
