import type { Chapter } from './types';

/**
 * Local full-text search over a book: splits chapters into passages and ranks
 * them with BM25. Every result points to its exact place in the book, so it
 * can be cited, opened and played. No network, no AI.
 */

export interface Passage {
  chapter: number;
  start: number;
  end: number;
  text: string;
}

export interface SearchHit extends Passage {
  score: number;
  chapterTitle: string;
}

const STOP = new Set(
  'a an and are as at be but by for from had has have he her his i if in into is it its me my not of on or our she so that the their them then there these they this to was we were what when where which who why will with you your do does did can could would should how about than just also very more most some any all no yes'.split(
    ' ',
  ),
);

/** Lower-case word stems, without common words. */
export function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? [])
    .map((w) => w.replace(/'s$|'/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

/** A light English stemmer (plural and common suffixes), good enough for matching. */
export function stem(word: string): string {
  let w = word;
  for (let pass = 0; pass < 2; pass++) {
    const before = w;
    for (const [suf, rep] of [
      ['ies', 'y'],
      ['ing', ''],
      ['edly', ''],
      ['ed', ''],
      ['ly', ''],
      ['es', ''],
      ['s', ''],
      ['e', ''],
    ] as const) {
      if (w.endsWith(suf) && w.length - suf.length >= 3 && !(suf === 's' && w.endsWith('ss'))) {
        w = w.slice(0, -suf.length) + rep;
        break;
      }
    }
    if (w === before) break;
  }
  return w;
}

/** Splits chapters into passages of about `size` characters, on paragraph or sentence boundaries. */
export function passages(chapters: Chapter[], size = 700): Passage[] {
  const out: Passage[] = [];
  chapters.forEach((ch, chapter) => {
    const text = ch.text;
    let start = 0;
    while (start < text.length) {
      let end = Math.min(text.length, start + size);
      if (end < text.length) {
        const para = text.lastIndexOf('\n\n', end);
        const sentence = Math.max(text.lastIndexOf('. ', end), text.lastIndexOf('? ', end), text.lastIndexOf('! ', end));
        if (para > start + size / 3) end = para;
        else if (sentence > start + size / 3) end = sentence + 1;
      }
      const t = text.slice(start, end).trim();
      if (t) out.push({ chapter, start: start + (text.slice(start, end).length - text.slice(start, end).trimStart().length), end, text: t });
      start = end;
      while (start < text.length && /\s/.test(text[start])) start++;
    }
  });
  return out;
}

export class BookIndex {
  private docs: Array<{ p: Passage; tf: Map<string, number>; len: number }>;
  private df = new Map<string, number>();
  private avgLen: number;

  constructor(
    private readonly chapters: Chapter[],
    size = 700,
  ) {
    this.docs = passages(chapters, size).map((p) => {
      const tf = new Map<string, number>();
      // The chapter title counts as part of each of its passages.
      const ts = [...terms(p.text), ...terms(chapters[p.chapter]?.title ?? '')];
      for (const t of ts) tf.set(t, (tf.get(t) ?? 0) + 1);
      return { p, tf, len: ts.length };
    });
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
  }

  get size() {
    return this.docs.length;
  }

  /** Best passages for a question. `chapter` (optional) gives a small boost to the chapter you're in. */
  search(query: string, opts: { k?: number; chapter?: number; exclude?: { chapter: number; start: number; end: number } } = {}): SearchHit[] {
    const q = [...new Set(terms(query))];
    if (!q.length) return [];
    const N = this.docs.length;
    const k1 = 1.2;
    const b = 0.75;
    const hits: SearchHit[] = [];
    for (const d of this.docs) {
      const ex = opts.exclude;
      if (ex && d.p.chapter === ex.chapter && d.p.start < ex.end && d.p.end > ex.start) continue;
      let score = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        const idf = Math.log(1 + (N - (this.df.get(t) ?? 0) + 0.5) / ((this.df.get(t) ?? 0) + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / this.avgLen));
      }
      if (score <= 0) continue;
      if (opts.chapter !== undefined && d.p.chapter === opts.chapter) score *= 1.15;
      hits.push({ ...d.p, score, chapterTitle: this.chapters[d.p.chapter]?.title ?? `Chapter ${d.p.chapter + 1}` });
    }
    return hits.sort((x, y) => y.score - x.score).slice(0, opts.k ?? 5);
  }

  /** The passage containing a position, with the passages just before and after. */
  around(chapter: number, offset: number): { before?: Passage; at?: Passage; after?: Passage } {
    const i = this.docs.findIndex((d) => d.p.chapter === chapter && offset >= d.p.start && offset < d.p.end + 2);
    if (i === -1) return {};
    const same = (j: number) => (this.docs[j]?.p.chapter === chapter ? this.docs[j].p : undefined);
    return { before: same(i - 1), at: this.docs[i].p, after: same(i + 1) };
  }
}

const cache = new Map<string, BookIndex>();

/** One index per open book, built on first use (kept in memory only). */
export function indexFor(bookId: string, chapters: Chapter[]): BookIndex {
  let idx = cache.get(bookId);
  if (!idx) {
    if (cache.size > 3) cache.delete(cache.keys().next().value!);
    idx = new BookIndex(chapters);
    cache.set(bookId, idx);
  }
  return idx;
}

/** Drop a book's index (after its text changes or it's deleted). */
export function forgetIndex(bookId: string) {
  cache.delete(bookId);
}

/** Status of AI answers on this device. There is no local language model yet. */
export function aiAnswerAvailability() {
  return {
    available: false as const,
    reason: 'AI answers need an on-device language model, which isn’t installed. You’re seeing the book’s own passages that match, with where they are.',
  };
}
