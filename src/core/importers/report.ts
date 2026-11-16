import type { Chapter, ImportSignals, OcrReport } from '../types';

/**
 * Import quality report: checks an imported book against what the source file itself says (its table of contents,
 * bookmarks, page numbers) and against simple consistency rules. It never claims the order is right just because
 * parsing finished: `order.status` says what the order was actually compared with.
 */

export type FlagKind = 'order' | 'missing' | 'duplicate' | 'ocr' | 'garbled' | 'short' | 'structure' | 'extra';
export type Severity = 'info' | 'check' | 'problem';

export interface ReportFlag {
  kind: FlagKind;
  severity: Severity;
  message: string;
  /** Chapter index the flag is about, if any. */
  chapter?: number;
}

export interface ChapterReport {
  index: number;
  title: string;
  words: number;
  firstParagraph: string;
  lastParagraph: string;
  /** First and last source page (PDF). */
  pageRange?: [number, number];
  notes: boolean;
  flags: ReportFlag[];
  confidence: 'high' | 'check' | 'low';
}

export interface ImportReport {
  words: number;
  chapters: ChapterReport[];
  flags: ReportFlag[];
  order: {
    /**
     * 'matches-source': compared with the file's own table of contents or bookmarks and they agree;
     * 'conflicts': the file's own structure disagrees with itself or with the result (see flags);
     * 'unverified': the file has no chapter structure to compare with, so the order follows the pages/text.
     */
    status: 'matches-source' | 'conflicts' | 'unverified';
    explanation: string;
  };
  confidence: 'high' | 'check' | 'low';
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const paragraphs = (s: string) => s.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
const clip = (s: string, n = 240) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s);

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
function fromRoman(s: string): number | null {
  const t = s.toLowerCase();
  if (!/^[ivxlcdm]+$/.test(t)) return null;
  let n = 0;
  for (let i = 0; i < t.length; i++) {
    const v = ROMAN[t[i]];
    const next = ROMAN[t[i + 1]] ?? 0;
    n += v < next ? -v : v;
  }
  return n > 0 && n < 400 ? n : null;
}

const WORD_NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

/** The chapter number in a title like "Chapter 12", "CHAPTER XII", "Chapter Three", "12. The Storm"; null if none. */
export function chapterNumber(title: string): number | null {
  const t = title.trim();
  const m = /^(?:chapter|chap\.?|ch\.)\s+([0-9]+|[ivxlcdm]+|[a-z]+)\b/i.exec(t);
  if (m) {
    const v = m[1];
    if (/^\d+$/.test(v)) return Number(v);
    const word = WORD_NUMBERS.indexOf(v.toLowerCase());
    if (word >= 0) return word + 1;
    return fromRoman(v);
  }
  const lead = /^(\d{1,3})[.:)]?\s+\S/.exec(t);
  return lead ? Number(lead[1]) : null;
}

/** Fraction of characters that look like extraction damage (replacement characters, letter-spaced words). */
export function garbleScore(text: string): number {
  if (!text) return 0;
  const replacement = (text.match(/�/g) ?? []).length;
  // "T h i s  i s" — runs of 4+ single letters separated by spaces.
  const spaced = (text.match(/\b(?:\p{L} ){4,}\p{L}\b/gu) ?? []).reduce((n, m) => n + m.length, 0);
  // Mostly symbols (not letters or digits): a broken font encoding. Number-heavy text (tables, references) is fine.
  const readable = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const symbolHeavy = text.length >= 200 && readable / Math.max(1, text.replace(/\s/g, '').length) < 0.5 ? 0.5 : 0;
  return Math.min(1, (replacement * 5 + spaced) / Math.max(1, text.length) + symbolHeavy);
}

function shingles(text: string, size = 8): Set<string> {
  const w = words(text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ''));
  const out = new Set<string>();
  for (let i = 0; i + size <= w.length; i += 2) out.add(w.slice(i, i + size).join(' '));
  return out;
}

function rangeText(nums: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < nums.length; ) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    parts.push(i === j ? `${nums[i]}` : `${nums[i]}–${nums[j]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

export function buildImportReport(book: { chapters: Chapter[]; ocr?: OcrReport; signals?: ImportSignals; format?: string }): ImportReport {
  const flags: ReportFlag[] = [];
  const signals = book.signals;
  const chapters: ChapterReport[] = book.chapters.map((c, index) => {
    // The heading is often repeated as the first paragraph; show the first paragraph of real text.
    const all = paragraphs(c.text);
    const paras = all.length > 1 && all[0].replace(/\s+/g, ' ').toLowerCase() === c.title.replace(/\s+/g, ' ').toLowerCase() ? all.slice(1) : all;
    const pageRange: [number, number] | undefined = c.pages?.length ? [c.pages[0].page, c.pages[c.pages.length - 1].page] : undefined;
    return {
      index,
      title: c.title,
      words: words(c.text).length,
      firstParagraph: clip(paras[0] ?? ''),
      lastParagraph: clip(paras[paras.length - 1] ?? ''),
      pageRange,
      notes: c.kind === 'notes',
      flags: [],
      confidence: 'high',
    };
  });
  const flag = (f: ReportFlag) => {
    if (f.chapter !== undefined) chapters[f.chapter]?.flags.push(f);
    else flags.push(f);
  };

  // 1. Chapter numbers: out of sequence or skipped.
  let prev: { n: number; index: number } | null = null;
  for (const c of chapters) {
    if (c.notes) continue;
    const n = chapterNumber(c.title);
    if (n === null) continue;
    if (prev) {
      if (n <= prev.n && n !== 1) {
        flag({ kind: 'order', severity: 'problem', chapter: c.index, message: `“${c.title}” comes after chapter ${prev.n}: the chapter order may be wrong.` });
        continue; // keep counting from the highest chapter seen
      } else if (n > prev.n + 1)
        flag({ kind: 'missing', severity: 'check', chapter: c.index, message: `Chapter ${prev.n + 1 === n - 1 ? prev.n + 1 : `${prev.n + 1}–${n - 1}`} not found before “${c.title}”.` });
    }
    prev = { n, index: c.index };
  }

  // 2. Duplicated passages: a chapter mostly repeating an earlier one, or long paragraphs that appear twice.
  const seen = new Set<string>();
  book.chapters.forEach((c, i) => {
    const sh = shingles(c.text);
    if (sh.size >= 20) {
      let shared = 0;
      for (const s of sh) if (seen.has(s)) shared++;
      if (shared / sh.size >= 0.5)
        flag({ kind: 'duplicate', severity: 'problem', chapter: i, message: `About ${Math.round((shared / sh.size) * 100)}% of this chapter repeats earlier text.` });
    }
    for (const s of sh) seen.add(s);
  });
  const paraCount = new Map<string, number[]>();
  book.chapters.forEach((c, i) => {
    for (const p of paragraphs(c.text)) if (words(p).length >= 30) paraCount.set(p, [...(paraCount.get(p) ?? []), i]);
  });
  for (const [p, at] of paraCount)
    if (at.length > 1 && !chapters[at[1]].flags.some((f) => f.kind === 'duplicate'))
      flag({ kind: 'duplicate', severity: 'check', chapter: at[1], message: `A paragraph appears ${at.length} times: “${clip(p, 80)}”` });

  // 3. Missing pages (PDF): blank pages and gaps in printed page numbers.
  if (signals?.blankPages?.length)
    flag({
      kind: 'missing',
      // A few blank pages are normal in books; many suggest text that couldn't be read.
      severity: signals.blankPages.length > Math.max(2, (signals.pages ?? 0) * 0.05) ? 'check' : 'info', message: `Page${signals.blankPages.length > 1 ? 's' : ''} ${rangeText(signals.blankPages)} had no text and no images (blank, or the text couldn’t be read).`,
    });
  const printed = [...(signals?.printedPageNumbers ?? [])].sort((a, b) => a.page - b.page);
  const gaps: string[] = [];
  for (let i = 1; i < printed.length; i++) {
    const a = printed[i - 1];
    const b = printed[i];
    const expected = a.printed + (b.page - a.page);
    if (b.printed > expected && b.printed - expected <= 50) gaps.push(`${expected + 1 === b.printed ? expected : `${expected}–${b.printed - 1}`}`);
  }
  if (gaps.length) flag({ kind: 'missing', severity: 'problem', message: `Printed page numbers skip ${gaps.join(', ')}: those pages seem to be missing from the file.` });

  // 4. Scanned pages.
  if (book.ocr?.imageOnlyPages.length)
    flag({
      kind: 'ocr',
      severity: 'problem',
      message: `Page${book.ocr.imageOnlyPages.length > 1 ? 's' : ''} ${rangeText(book.ocr.imageOnlyPages)} ${book.ocr.imageOnlyPages.length > 1 ? 'are' : 'is'} scanned images: their text is not included (it needs OCR).`,
    });

  if (signals?.ocrPages?.length)
    flag({
      kind: 'ocr',
      severity: 'info',
      message: `Page${signals.ocrPages.length > 1 ? 's' : ''} ${rangeText(signals.ocrPages)} ${signals.ocrPages.length > 1 ? 'were' : 'was'} read from scanned images with OCR on this device. OCR can misread words: check those pages if something sounds wrong.`,
    });

  // 5. Damaged text and very short chapters.
  book.chapters.forEach((c, i) => {
    const g = garbleScore(c.text);
    if (g >= 0.08) flag({ kind: 'garbled', severity: 'problem', chapter: i, message: 'Some text looks damaged (odd characters or spaced-out letters). The PDF’s text layer may be faulty.' });
    if (i > 0 && c.kind !== 'notes' && chapters[i].words < 30)
      flag({ kind: 'short', severity: 'check', chapter: i, message: `Only ${chapters[i].words} words: maybe a heading or page split from its text. Merge it if so.` });
  });

  // 6. The file's own structure.
  if (signals?.tocOutOfOrder?.length)
    flag({ kind: 'order', severity: 'problem', message: `The book’s table of contents lists ${signals.tocOutOfOrder.map((t) => `“${t}”`).join(', ')} in a different order from the text. The reading order was used; check these.` });
  if (signals?.tocMissing?.length)
    flag({ kind: 'missing', severity: 'check', message: `The table of contents points to sections that aren’t in the file: ${signals.tocMissing.map((t) => `“${t}”`).join(', ')}.` });
  if (signals?.extras?.length)
    flag({ kind: 'extra', severity: 'info', message: `${signals.extras.length} section${signals.extras.length > 1 ? 's' : ''} outside the main reading order (notes, extras) ${signals.extras.length > 1 ? 'were' : 'was'} added at the end.` });

  let order: ImportReport['order'];
  const orderConflicts = [...flags, ...chapters.flatMap((c) => c.flags)].some((f) => f.kind === 'order');
  switch (signals?.structure) {
    case 'toc':
    case 'outline':
      order = orderConflicts
        ? { status: 'conflicts', explanation: 'The file’s own chapter list and the text disagree in places; see the problems below.' }
        : {
            status: 'matches-source',
            explanation:
              signals.structure === 'toc'
                ? 'Chapters follow the book’s reading order and match its table of contents.'
                : 'Chapters follow the PDF’s bookmarks, in page order.',
          };
      break;
    case 'spine':
      order = orderConflicts
        ? { status: 'conflicts', explanation: 'Chapter numbers are out of sequence; see the problems below.' }
        : { status: 'unverified', explanation: 'Chapters follow the book’s reading order. It has no table of contents to compare with.' };
      break;
    case 'headings':
      order = orderConflicts
        ? { status: 'conflicts', explanation: 'Chapter numbers are out of sequence; see the problems below.' }
        : { status: 'unverified', explanation: 'Chapters were found from headings in the text. The file has no chapter list to compare with, so check the order.' };
      break;
    case 'pages':
      flag({ kind: 'structure', severity: 'check', message: 'No chapter headings or bookmarks were found, so the text is grouped by pages.' });
      order = { status: 'unverified', explanation: 'The file has no chapter information; the text follows the page order.' };
      break;
    default:
      order = orderConflicts
        ? { status: 'conflicts', explanation: 'Chapter numbers are out of sequence; see the problems below.' }
        : { status: 'unverified', explanation: 'The text follows the order in the file. There was no chapter list to compare with.' };
  }

  for (const c of chapters) c.confidence = c.flags.some((f) => f.severity === 'problem') ? 'low' : c.flags.length ? 'check' : 'high';
  const all = [...flags, ...chapters.flatMap((c) => c.flags)];
  const confidence: ImportReport['confidence'] = all.some((f) => f.severity === 'problem')
    ? 'low'
    : all.some((f) => f.severity === 'check') || order.status !== 'matches-source'
      ? 'check'
      : 'high';
  return { words: chapters.reduce((n, c) => n + c.words, 0), chapters, flags, order, confidence };
}
