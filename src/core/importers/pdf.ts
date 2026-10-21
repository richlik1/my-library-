import type { Chapter, ImportedBook, OcrReport } from '../types';
import { ImportError, OCR_EXPLANATION } from './errors';
import { MAX_CHAPTER_CHARS, detectChapters, finalizeChapters, isHeading, titleFromFileName } from './text';

// Minimal structural types for the parts of PDF.js we use. Keeping them local
// lets the same code run with the browser build and in Node tests.
interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}
interface PdfPage {
  getTextContent(): Promise<{ items: Array<TextItem | { type: string }> }>;
  getOperatorList(): Promise<{ fnArray: number[] }>;
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: unknown): { promise: Promise<void> };
  cleanup(): void;
}
interface OutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineItem[];
}
export interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  getOutline(): Promise<OutlineItem[] | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
  getMetadata(): Promise<{ info?: Record<string, unknown> }>;
}
export interface PdfjsLike {
  getDocument(src: Record<string, unknown>): { promise: Promise<PdfDoc>; destroy(): Promise<void> };
  OPS: Record<string, number>;
}

export type ProgressFn = (fraction: number, label: string) => void;

interface Line {
  text: string;
  y: number;
  x: number;
  end: number;
  h: number;
}

/** Rebuilds visual lines from PDF.js text items. */
export function itemsToLines(items: TextItem[]): Line[] {
  const lines: Line[] = [];
  let cur: Line | null = null;
  let breakNext = false;
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const h = Math.abs(it.height || it.transform[3] || 10);
    if (!it.str) {
      if (it.hasEOL) breakNext = true;
      continue;
    }
    const sameLine = cur && !breakNext && Math.abs(y - cur.y) < Math.max(cur.h, h) * 0.5;
    if (!sameLine) {
      if (cur) lines.push(cur);
      cur = { text: it.str, y, x, end: x + it.width, h };
    } else if (cur) {
      const gap = x - cur.end;
      const needsSpace = gap > h * 0.15 && !/\s$/.test(cur.text) && !/^\s/.test(it.str);
      cur.text += (needsSpace ? ' ' : '') + it.str;
      cur.end = Math.max(cur.end, x + it.width);
      cur.h = Math.max(cur.h, h);
    }
    breakNext = !!it.hasEOL;
  }
  if (cur) lines.push(cur);
  return lines
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text.length > 0);
}

const PAGE_NUMBER_RE = /^(?:page\s*)?(?:\d{1,4}|[ivxlcdm]{1,7})(?:\s*(?:of|\/)\s*\d{1,4})?$/i;
const signature = (s: string) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

/**
 * Removes running headers, footers and page numbers: lines at the top or
 * bottom of a page that repeat (ignoring digits) on many pages.
 */
export function stripHeadersFooters(pages: Line[][]): Line[][] {
  const sigCounts = new Map<string, number>();
  const exactCounts = new Map<string, number>();
  // Two lines at each end (header + page number), or one on short pages.
  const edge = (lines: Line[]) => {
    const n = lines.length >= 8 ? 2 : 1;
    return [...lines.slice(0, n), ...lines.slice(-n)];
  };
  for (const lines of pages) {
    const e = edge(lines);
    for (const sig of new Set(e.map((l) => signature(l.text)))) sigCounts.set(sig, (sigCounts.get(sig) ?? 0) + 1);
    for (const t of new Set(e.map((l) => l.text))) exactCounts.set(t, (exactCounts.get(t) ?? 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.4));
  const repeated = (l: Line) =>
    pages.length >= 3 &&
    // "Chapter 3" / "Chapter 4" at the top of pages are real headings, so
    // heading-like lines only count as running headers when identical.
    (isHeading(l.text) ? exactCounts.get(l.text) ?? 0 : sigCounts.get(signature(l.text)) ?? 0) >= threshold;
  return pages.map((lines) => {
    const edges = new Set(edge(lines));
    return lines.filter((l) => !edges.has(l) || (!PAGE_NUMBER_RE.test(l.text) && !repeated(l)));
  });
}

/** Turns the lines of one page into paragraphs separated by "\n\n". */
export function linesToText(lines: Line[]): string {
  if (!lines.length) return '';
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const g = lines[i - 1].y - lines[i].y;
    if (g > 0) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  // Normal line spacing: the lower quartile of gaps (paragraph gaps are larger).
  // Pages with only a few lines have few samples, so also cap it by the font size.
  const heights = lines.map((l) => l.h).sort((a, b) => a - b);
  const fontGap = heights[Math.floor(heights.length / 2)] * 1.3;
  const lineGap = gaps.length ? Math.min(gaps[Math.floor((gaps.length - 1) / 4)], fontGap) : 0;
  const widths = lines.map((l) => l.end - l.x).sort((a, b) => a - b);
  const typicalWidth = widths[Math.floor(widths.length * 0.8)] || 1;
  const minX = Math.min(...lines.map((l) => l.x));

  const paras: string[] = [];
  let cur = '';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const prev = lines[i - 1];
    let newPara = false;
    if (prev) {
      const gap = prev.y - l.y;
      const prevShort = prev.end - prev.x < typicalWidth * 0.75;
      const indented = l.x - minX > l.h * 1.2 && l.x - prev.x > l.h;
      if (lineGap && (gap > lineGap * 1.45 || gap < -lineGap)) newPara = true; // big gap or new column
      else if (prevShort && /[.!?:"”’)]$/.test(prev.text)) newPara = true;
      else if (indented && /[.!?"”’]$/.test(prev.text)) newPara = true;
    }
    if (newPara && cur) {
      paras.push(cur);
      cur = '';
    }
    if (!cur) cur = l.text;
    else if (/[A-Za-z]-$/.test(cur) && /^[a-z]/.test(l.text)) cur = cur.slice(0, -1) + l.text;
    else cur += ' ' + l.text;
  }
  if (cur) paras.push(cur);
  return paras.join('\n\n');
}

/** Joins page texts, merging a paragraph that continues across a page break. */
export function joinPages(pages: string[]): string {
  let out = '';
  for (const p of pages) {
    if (!p) continue;
    if (!out) {
      out = p;
      continue;
    }
    const continues = !/[.!?:"”’)\]]$/.test(out) && /^[a-z]/.test(p);
    if (continues) out = /[A-Za-z]-$/.test(out) ? out.slice(0, -1) + p : `${out} ${p}`;
    else out += `\n\n${p}`;
  }
  return out;
}

async function resolveOutline(doc: PdfDoc): Promise<Array<{ title: string; page: number }>> {
  let outline: OutlineItem[] | null = null;
  try {
    outline = await doc.getOutline();
  } catch {
    return [];
  }
  if (!outline?.length) return [];
  // Use the second level when the top level is just one wrapper entry.
  let items = outline;
  if (items.length < 3 && items.every((i) => i.items?.length)) items = items.flatMap((i) => [i, ...i.items]);
  const out: Array<{ title: string; page: number }> = [];
  for (const item of items) {
    try {
      let dest = item.dest;
      if (typeof dest === 'string') dest = await doc.getDestination(dest);
      if (!Array.isArray(dest) || !dest.length) continue;
      const ref = dest[0];
      const page = typeof ref === 'number' ? ref : await doc.getPageIndex(ref);
      out.push({ title: item.title, page });
    } catch {
      /* ignore broken outline entries */
    }
  }
  out.sort((a, b) => a.page - b.page);
  return out;
}

function chaptersFromOutline(pageTexts: string[], marks: Array<{ title: string; page: number }>): Chapter[] {
  const chapters: Chapter[] = [];
  const firstPage = marks[0].page;
  if (firstPage > 0) {
    const front = joinPages(pageTexts.slice(0, firstPage));
    if (front.trim()) chapters.push({ title: 'Front matter', text: front });
  }
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].page;
    const end = i + 1 < marks.length ? marks[i + 1].page : pageTexts.length;
    if (end <= start) continue; // several entries on the same page: keep the last one
    chapters.push({ title: marks[i].title, text: joinPages(pageTexts.slice(start, end)) });
  }
  return chapters;
}

function chaptersFromPages(pageTexts: string[]): Chapter[] {
  const chapters: Chapter[] = [];
  let startPage = 0;
  let buf: string[] = [];
  let size = 0;
  const target = MAX_CHAPTER_CHARS * 0.6;
  pageTexts.forEach((t, i) => {
    buf.push(t);
    size += t.length;
    if (size >= target || i === pageTexts.length - 1) {
      chapters.push({ title: startPage === i ? `Page ${startPage + 1}` : `Pages ${startPage + 1}–${i + 1}`, text: joinPages(buf) });
      startPage = i + 1;
      buf = [];
      size = 0;
    }
  });
  return chapters;
}

function cleanTitle(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const t = raw.replace(/^Microsoft (Word|PowerPoint) - /i, '').replace(/\.(docx?|pdf|indd)$/i, '').trim();
  if (!t || /^untitled/i.test(t) || t.length < 2) return '';
  return t;
}

async function renderCover(page: PdfPage): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  try {
    const base = page.getViewport({ scale: 1 });
    const scale = 360 / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    const url = canvas.toDataURL('image/jpeg', 0.78);
    return url.startsWith('data:image/jpeg') ? url : null;
  } catch {
    return null;
  }
}

export async function importPdf(
  pdfjs: PdfjsLike,
  data: ArrayBuffer,
  fileName: string,
  opts: { onProgress?: ProgressFn; docOptions?: Record<string, unknown> } = {},
): Promise<ImportedBook> {
  const { onProgress } = opts;
  let doc: PdfDoc;
  const task = pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, ...opts.docOptions });
  try {
    // A blocked worker can leave PDF.js waiting forever; give up after 15 s.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('PDF engine did not start')), 15_000);
    });
    doc = await Promise.race([task.promise, timeout]).finally(() => clearTimeout(timer));
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === 'PasswordException')
      throw new ImportError('This PDF is password-protected. Remove the password (for example by printing it to a new PDF) and import it again.', 'encrypted');
    task.destroy().catch(() => undefined);
    throw new ImportError('This file could not be opened as a PDF. It may be damaged or not really a PDF.', 'corrupt');
  }

  try {
    const imageOps = new Set(
      ['paintImageXObject', 'paintInlineImageXObject', 'paintImageMaskXObject', 'paintImageXObjectRepeat', 'paintInlineImageXObjectGroup']
        .map((k) => pdfjs.OPS[k])
        .filter((v) => typeof v === 'number'),
    );
    const pageLines: Line[][] = [];
    const imageOnlyPages: number[] = [];
    let cover: string | null = null;

    for (let n = 1; n <= doc.numPages; n++) {
      onProgress?.((n - 1) / doc.numPages, `Reading page ${n} of ${doc.numPages}`);
      const page = await doc.getPage(n);
      if (n === 1) cover = await renderCover(page);
      const content = await page.getTextContent();
      const lines = itemsToLines(content.items.filter((i): i is TextItem => 'str' in i));
      const chars = lines.reduce((s, l) => s + l.text.replace(/\s/g, '').length, 0);
      if (chars < 20) {
        try {
          const ops = await page.getOperatorList();
          if (ops.fnArray.some((f) => imageOps.has(f))) imageOnlyPages.push(n);
        } catch {
          /* ignore */
        }
      }
      pageLines.push(lines);
      page.cleanup();
    }
    onProgress?.(1, 'Organising chapters');

    const pageTexts = stripHeadersFooters(pageLines).map(linesToText);
    const totalChars = pageTexts.reduce((s, t) => s + t.replace(/\s/g, '').length, 0);
    if (totalChars < 50) {
      if (imageOnlyPages.length > 0) throw new ImportError(OCR_EXPLANATION, 'needs-ocr');
      throw new ImportError('No readable text was found in this PDF. ' + OCR_EXPLANATION, 'needs-ocr');
    }

    const meta = await doc.getMetadata().catch(() => ({ info: {} as Record<string, unknown> }));
    const title = cleanTitle(meta.info?.Title) || titleFromFileName(fileName);
    const author = typeof meta.info?.Author === 'string' ? (meta.info.Author as string).trim() : '';

    const marks = await resolveOutline(doc);
    let chapters: Chapter[];
    if (marks.length >= 2) chapters = chaptersFromOutline(pageTexts, marks);
    else {
      const detected = detectChapters(joinPages(pageTexts), title);
      chapters = detected.length >= 2 ? detected : chaptersFromPages(pageTexts);
    }

    const ocr: OcrReport | undefined = imageOnlyPages.length ? { totalPages: doc.numPages, imageOnlyPages } : undefined;
    return { title, author, format: 'pdf', cover, chapters: finalizeChapters(chapters), ocr };
  } finally {
    task.destroy().catch(() => undefined);
  }
}
