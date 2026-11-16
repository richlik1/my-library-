import { describe, expect, it } from 'vitest';
import { buildImportReport, chapterNumber, garbleScore } from '../src/core/importers/report';

// Distinct letter-only words: seed + base-26 index (e.g. "aab").
const tag = (i: number) => Array.from({ length: 3 }, (_, k) => String.fromCharCode(97 + (Math.floor(i / 26 ** k) % 26))).join('');
const para = (n: number, seed = 'word') => Array.from({ length: n }, (_, i) => `${seed}${tag(i)}`).join(' ');
const ch = (title: string, text: string) => ({ title, text });

describe('import quality report', () => {
  it('reads chapter numbers in common forms', () => {
    expect(chapterNumber('Chapter 12')).toBe(12);
    expect(chapterNumber('CHAPTER XII')).toBe(12);
    expect(chapterNumber('Chapter Three')).toBe(3);
    expect(chapterNumber('7. The Storm')).toBe(7);
    expect(chapterNumber('Prologue')).toBeNull();
    expect(chapterNumber('1984 was a year')).toBeNull();
  });

  it('counts words and shows the first and last paragraph of each chapter', () => {
    const r = buildImportReport({ chapters: [ch('One', `First para here.\n\n${para(50)}\n\nLast para here.`)], signals: { structure: 'toc' } });
    expect(r.words).toBe(56);
    expect(r.chapters[0].firstParagraph).toBe('First para here.');
    expect(r.chapters[0].lastParagraph).toBe('Last para here.');
    expect(r.order.status).toBe('matches-source');
    expect(r.confidence).toBe('high');
  });

  it('flags chapters out of order and skipped chapters', () => {
    const r = buildImportReport({
      chapters: [ch('Chapter 1', para(60, 'a')), ch('Chapter 3', para(60, 'b')), ch('Chapter 2', para(60, 'c')), ch('Chapter 6', para(60, 'd'))],
      signals: { structure: 'outline' },
    });
    expect(r.chapters[1].flags.map((f) => f.kind)).toEqual(['missing']);
    expect(r.chapters[2].flags.map((f) => f.kind)).toEqual(['order']);
    expect(r.chapters[3].flags[0].message).toContain('4–5');
    expect(r.order.status).toBe('conflicts');
    expect(r.confidence).toBe('low');
  });

  it('never calls the order verified when the file had nothing to compare with', () => {
    expect(buildImportReport({ chapters: [ch('Chapter 1', para(60))], signals: { structure: 'headings' } }).order.status).toBe('unverified');
    expect(buildImportReport({ chapters: [ch('Pages 1–3', para(60))], signals: { structure: 'pages' } }).order.status).toBe('unverified');
    expect(buildImportReport({ chapters: [ch('Text', para(60))] }).order.status).toBe('unverified');
  });

  it('flags a chapter that repeats earlier text, and repeated paragraphs', () => {
    const body = para(200, 'x');
    const r = buildImportReport({ chapters: [ch('A', body), ch('B', para(200, 'y')), ch('A again', body)], signals: { structure: 'toc' } });
    expect(r.chapters[2].flags.map((f) => f.kind)).toContain('duplicate');
    const p = `${para(40, 'z')}.`;
    const r2 = buildImportReport({ chapters: [ch('A', `${p}\n\n${para(100, 'q')}`), ch('B', `${para(100, 'r')}\n\n${p}`)] });
    expect(r2.chapters[1].flags[0].message).toContain('appears 2 times');
  });

  it('reports blank pages, scanned pages and gaps in printed page numbers', () => {
    const r = buildImportReport({
      chapters: [ch('Text', para(80))],
      ocr: { totalPages: 12, imageOnlyPages: [4, 5] },
      signals: {
        structure: 'pages',
        pages: 12,
        blankPages: [7],
        printedPageNumbers: [
          { page: 2, printed: 1 },
          { page: 3, printed: 2 },
          { page: 4, printed: 6 },
        ],
      },
    });
    const text = r.flags.map((f) => f.message).join('\n');
    expect(text).toContain('Page 7 had no text');
    expect(text).toContain('Pages 4–5 are scanned');
    expect(text).toContain('skip 3–5');
  });

  it('flags damaged text and very short chapters', () => {
    expect(garbleScore('T h i s  i s  b r o k e n  t e x t  f r o m  a  P D F')).toBeGreaterThan(0.08);
    expect(garbleScore('Perfectly ordinary prose, with punctuation.')).toBeLessThan(0.02);
    const r = buildImportReport({ chapters: [ch('One', para(80)), ch('Two', 'Just a heading')], signals: { structure: 'toc' } });
    expect(r.chapters[1].flags.map((f) => f.kind)).toEqual(['short']);
    expect(r.confidence).toBe('check');
  });

  it('reports the file’s own table-of-contents problems', () => {
    const r = buildImportReport({ chapters: [ch('One', para(80))], signals: { structure: 'toc', tocOutOfOrder: ['Epilogue'], tocMissing: ['Appendix'], extras: ['Notes'] } });
    expect(r.flags.map((f) => f.kind).sort()).toEqual(['extra', 'missing', 'order']);
    expect(r.order.status).toBe('conflicts');
  });
});
