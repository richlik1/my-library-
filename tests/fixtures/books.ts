/**
 * Import-accuracy fixtures: books generated from a known source text, rendered as PDF (one or two columns,
 * running headers, page numbers, hyphenated line breaks, footnotes) and EPUB, so an import can be compared with
 * the exact text it should produce.
 */
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

export interface SourceBook {
  title: string;
  author: string;
  chapters: Array<{ title: string; paragraphs: string[] }>;
}

// Small deterministic generator (no randomness between runs).
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const NOUNS = ['keeper', 'harbour', 'lantern', 'island', 'letter', 'captain', 'storm', 'morning', 'village', 'garden', 'window', 'teacher', 'market', 'river', 'mountain', 'bridge', 'library', 'journey', 'question', 'promise'];
const VERBS = ['carried', 'watched', 'followed', 'remembered', 'opened', 'answered', 'crossed', 'painted', 'repaired', 'explained', 'gathered', 'measured'];
const ADJS = ['quiet', 'distant', 'golden', 'narrow', 'patient', 'curious', 'ancient', 'bright', 'careful', 'gentle', 'restless', 'familiar'];
const FR = ['été', 'côte', 'fenêtre', 'garçon', 'âme', 'cœur', 'déjà', 'où', 'très', 'bientôt'];

export function makeSourceBook(opts: { chapters: number; paragraphs: number; seed?: number; french?: boolean }): SourceBook {
  const r = rng(opts.seed ?? 7);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const sentence = (c: number, p: number, k: number) => {
    const extra = opts.french ? ` ${pick(FR)}` : '';
    // Each sentence carries a unique marker so missing, duplicated or reordered text is detectable.
    return `The ${pick(ADJS)} ${pick(NOUNS)} ${pick(VERBS)} the ${pick(ADJS)} ${pick(NOUNS)}${extra} near marker${c}x${p}x${k}.`;
  };
  return {
    title: opts.french ? 'Le Phare Généré' : 'The Generated Lighthouse',
    author: 'Fixture Author',
    chapters: Array.from({ length: opts.chapters }, (_, c) => ({
      title: `Chapter ${c + 1}`,
      paragraphs: Array.from({ length: opts.paragraphs }, (_, p) => Array.from({ length: 3 + Math.floor(r() * 3) }, (_, k) => sentence(c + 1, p + 1, k + 1)).join(' ')),
    })),
  };
}

/** Wraps text into lines that fit `width`, hyphenating a long word at the line end now and then. */
function wrap(text: string, font: PDFFont, size: number, width: number, hyphenate: boolean): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next;
      continue;
    }
    // Hyphenate words of 8+ letters that would otherwise start the next line.
    if (hyphenate && /^[a-z]{8,}$/.test(w)) {
      const head = w.slice(0, 4);
      if (font.widthOfTextAtSize(`${line} ${head}-`, size) <= width) {
        lines.push(`${line} ${head}-`);
        line = w.slice(4);
        continue;
      }
    }
    lines.push(line);
    line = w;
  }
  if (line) lines.push(line);
  return lines;
}

/** Renders a source book as a PDF: running header, page numbers, hyphenation, optional two columns and footnotes. */
export async function bookToPdf(
  book: SourceBook,
  opts: { columns?: 1 | 2; footnotes?: boolean; rowByRow?: boolean } = {},
): Promise<{ data: ArrayBuffer; footnotes: string[] }> {
  const doc = await PDFDocument.create();
  doc.setTitle(book.title);
  doc.setAuthor(book.author);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const W = 420;
  const H = 600;
  const margin = 40;
  const columns = opts.columns ?? 1;
  const gutter = 24;
  const colWidth = (W - margin * 2 - gutter * (columns - 1)) / columns;
  const size = 10.5;
  const lead = 14;
  const footnotes: string[] = [];
  let page: PDFPage | null = null;
  let pageNo = 0;
  let col = 0;
  let y = 0;
  // For row-by-row output, lines are buffered per page and drawn interleaved across columns at the end.
  let buffered: Array<Array<{ text: string; y: number; size: number }>> = [];
  const flushRowByRow = () => {
    if (!page || !opts.rowByRow) return;
    const rows = Math.max(...buffered.map((c) => c.length));
    for (let i = 0; i < rows; i++)
      buffered.forEach((c, k) => {
        const l = c[i];
        if (l) page!.drawText(l.text, { x: margin + k * (colWidth + gutter), y: l.y, size: l.size, font });
      });
    buffered = [];
  };
  const newPage = () => {
    flushRowByRow();
    page = doc.addPage([W, H]);
    pageNo++;
    col = 0;
    y = H - 70;
    buffered = Array.from({ length: columns }, () => []);
    page.drawText(`${book.title} — running header`, { x: margin, y: H - 30, size: 8, font });
    page.drawText(String(pageNo), { x: W / 2 - 5, y: 24, size: 8, font });
    if (opts.footnotes && pageNo % 2 === 0) {
      const note = `${footnotes.length + 1} A footnote about page ${pageNo} explaining marker details.`;
      footnotes.push(note.replace(/^\d+ /, ''));
      page.drawText(note, { x: margin, y: 44, size: 7, font });
    }
  };
  const draw = (text: string, s = size) => {
    if (!page || y < 70) {
      if (page && col + 1 < columns) {
        col++;
        y = H - 70;
      } else newPage();
    }
    const x = margin + col * (colWidth + gutter);
    if (opts.rowByRow) buffered[col].push({ text, y, size: s });
    else page!.drawText(text, { x, y, size: s, font });
    y -= s > size ? lead * 1.6 : lead;
  };
  for (const ch of book.chapters) {
    newPage(); // each chapter starts a new page
    draw(ch.title, 15);
    for (const p of ch.paragraphs) {
      for (const line of wrap(p, font, size, colWidth, true)) draw(line);
      y -= lead * 0.7; // paragraph gap
    }
  }
  flushRowByRow();
  return { data: (await doc.save()).buffer as ArrayBuffer, footnotes };
}

/** Renders a source book as an EPUB 3 with a nav table of contents (one file per chapter). */
export async function bookToEpub(book: SourceBook, lang = 'en'): Promise<Blob> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const items = book.chapters.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('');
  const spine = book.chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('');
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(book.title)}</dc:title><dc:creator>${esc(book.author)}</dc:creator><dc:language>${lang}</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${items}</manifest><spine>${spine}</spine></package>`,
  );
  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>${book.chapters.map((c, i) => `<li><a href="c${i}.xhtml">${esc(c.title)}</a></li>`).join('')}</ol></nav></body></html>`,
  );
  book.chapters.forEach((c, i) =>
    zip.file(
      `OEBPS/c${i}.xhtml`,
      `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(c.title)}</title></head><body><h1>${esc(c.title)}</h1>${c.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</body></html>`,
    ),
  );
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}

/** Word-level comparison: share of source words found in order (recall) and of imported words that are real (precision). */
export function compareWords(source: string, imported: string): { recall: number; precision: number } {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const a = norm(source);
  const b = norm(imported);
  // Longest common subsequence with two rows (chapters are a few thousand words).
  let prev = new Uint32Array(b.length + 1);
  let cur = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    [prev, cur] = [cur, prev];
  }
  const lcs = prev[b.length];
  return { recall: lcs / Math.max(1, a.length), precision: lcs / Math.max(1, b.length) };
}
