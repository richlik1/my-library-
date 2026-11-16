import type { Chapter } from './types';

/**
 * Chapter Organizer: rearranges a book's chapters (reorder, rename, split, merge, remove) without touching the
 * original file. Each organized chapter records which ranges of the original chapters it is made of, so places in
 * the book (reading position, highlights, notes, bookmarks, PDF page starts) can be moved to the new chapters.
 */

export interface Range {
  /** Original chapter index and character range [start, end) in its text. */
  ch: number;
  start: number;
  end: number;
}

export interface OrganizedChapter {
  title: string;
  ranges: Range[];
  removed?: boolean;
  kind?: Chapter['kind'];
}

/** Starting point: one organized chapter per original chapter. */
export function organize(chapters: Chapter[]): OrganizedChapter[] {
  return chapters.map((c, i) => ({ title: c.title, ranges: [{ ch: i, start: 0, end: c.text.length }], ...(c.kind ? { kind: c.kind } : {}) }));
}

const JOIN = '\n\n';

export function textOf(item: OrganizedChapter, original: Chapter[]): string {
  return item.ranges.map((r) => original[r.ch].text.slice(r.start, r.end)).join(JOIN);
}

/** Where each paragraph of an organized chapter starts, in its joined text. */
export function paragraphStarts(item: OrganizedChapter, original: Chapter[]): number[] {
  const text = textOf(item, original);
  const starts = [0];
  for (let i = text.indexOf(JOIN); i >= 0; i = text.indexOf(JOIN, i + JOIN.length)) starts.push(i + JOIN.length);
  return starts;
}

export function move(list: OrganizedChapter[], index: number, delta: -1 | 1): OrganizedChapter[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const out = [...list];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

export function rename(list: OrganizedChapter[], index: number, title: string): OrganizedChapter[] {
  return list.map((c, i) => (i === index ? { ...c, title: title.trim() || c.title } : c));
}

export function setRemoved(list: OrganizedChapter[], index: number, removed: boolean): OrganizedChapter[] {
  return list.map((c, i) => (i === index ? { ...c, removed } : c));
}

/** Merges chapter `index` with the one after it (keeps the first title). */
export function mergeWithNext(list: OrganizedChapter[], index: number): OrganizedChapter[] {
  if (index < 0 || index + 1 >= list.length) return list;
  const a = list[index];
  const b = list[index + 1];
  return [...list.slice(0, index), { ...a, ranges: [...a.ranges, ...b.ranges], removed: a.removed && b.removed }, ...list.slice(index + 2)];
}

/**
 * Splits chapter `index` before paragraph `paragraph` (1 = after the first paragraph). The new chapter gets
 * `title`. Nothing is lost or duplicated: the ranges are cut exactly at the paragraph start.
 */
export function splitAt(list: OrganizedChapter[], original: Chapter[], index: number, paragraph: number, title: string): OrganizedChapter[] {
  const item = list[index];
  const starts = paragraphStarts(item, original);
  if (paragraph <= 0 || paragraph >= starts.length) return list;
  const cut = starts[paragraph]; // offset in the joined text where the new chapter begins
  const first: Range[] = [];
  const second: Range[] = [];
  let pos = 0;
  for (const r of item.ranges) {
    const len = r.end - r.start;
    if (pos + len <= cut - JOIN.length || (pos + len < cut && second.length === 0)) first.push(r);
    else if (pos >= cut) second.push(r);
    else {
      // The cut falls inside this range: it is at a paragraph start, so the text before it ends with "\n\n".
      const local = cut - pos;
      first.push({ ...r, end: r.start + local - JOIN.length });
      second.push({ ...r, start: r.start + local });
    }
    pos += len + JOIN.length;
  }
  return [...list.slice(0, index), { ...item, ranges: first }, { title: title.trim() || `${item.title} (continued)`, ranges: second, ...(item.kind ? { kind: item.kind } : {}) }, ...list.slice(index + 1)];
}

/** The chapters to save: removed ones left out. */
export function build(list: OrganizedChapter[], original: Chapter[]): Chapter[] {
  return list
    .filter((c) => !c.removed)
    .map((c) => {
      const text = textOf(c, original);
      const pages = mapPagesInto(c, original);
      return { title: c.title, text, ...(c.kind ? { kind: c.kind } : {}), ...(pages.length ? { pages } : {}) };
    });
}

function mapPagesInto(item: OrganizedChapter, original: Chapter[]) {
  const out: Array<{ offset: number; page: number }> = [];
  let pos = 0;
  for (const r of item.ranges) {
    for (const p of original[r.ch].pages ?? []) if (p.offset >= r.start && p.offset < r.end) out.push({ offset: pos + p.offset - r.start, page: p.page });
    pos += r.end - r.start + JOIN.length;
  }
  return out;
}

/**
 * Moves a place in the original book to the organized book. A place inside a removed chapter (or in text that
 * was cut out) moves to the start of the next kept chapter, so nothing points at text that no longer exists.
 */
export function mapPosition(list: OrganizedChapter[], pos: { chapter: number; offset: number }): { chapter: number; offset: number } | null {
  const kept = list.filter((c) => !c.removed);
  let fallback: { chapter: number; offset: number } | null = null;
  let keptIndex = -1;
  for (const c of list) {
    if (!c.removed) keptIndex++;
    let at = 0;
    for (const r of c.ranges) {
      if (r.ch === pos.chapter && pos.offset >= r.start && pos.offset <= r.end) {
        if (!c.removed) return { chapter: keptIndex, offset: at + (pos.offset - r.start) };
        fallback ??= { chapter: Math.min(keptIndex + 1, kept.length - 1), offset: 0 };
      }
      at += r.end - r.start + JOIN.length;
    }
  }
  return kept.length ? (fallback ?? { chapter: 0, offset: 0 }) : null;
}

/** True when the organized book differs from the original. */
export function changed(list: OrganizedChapter[], original: Chapter[]): boolean {
  if (list.length !== original.length) return true;
  return list.some((c, i) => c.removed || c.title !== original[i].title || c.ranges.length !== 1 || c.ranges[0].ch !== i || c.ranges[0].start !== 0 || c.ranges[0].end !== original[i].text.length);
}
