import type { Annotation, Book, Progress } from './types';

/** A suggestion from your own library, with the reason it was picked. */
export interface Recommendation {
  book: Book;
  kind: 'continue' | 'revisit' | 'unread-favorite' | 'unread';
  why: string;
}

const DAY = 86_400_000;

/**
 * Deterministic, explainable suggestions from books you already have. No
 * outside catalog, no tracking: just your progress, notes and categories.
 */
export function recommend(books: Book[], progress: Map<string, Progress>, annotations: Annotation[], now = Date.now()): Recommendation[] {
  const out: Recommendation[] = [];
  const pct = (b: Book) => progress.get(b.id)?.percent ?? 0;
  const finished = (b: Book) => !!progress.get(b.id)?.finished;
  const started = (b: Book) => pct(b) > 0 && !finished(b);
  const notes = new Map<string, number>();
  for (const a of annotations) notes.set(a.bookId, (notes.get(a.bookId) ?? 0) + 1);

  // 1. Started but put down for a while.
  for (const b of books.filter(started).sort((a, b) => (a.lastOpenedAt ?? 0) - (b.lastOpenedAt ?? 0))) {
    const days = b.lastOpenedAt ? Math.floor((now - b.lastOpenedAt) / DAY) : null;
    if (days !== null && days < 3) continue;
    out.push({ book: b, kind: 'continue', why: `You’re ${Math.round(pct(b) * 100)}% through${days !== null ? ` and last listened ${days} days ago` : ''}.` });
  }

  // 2. Books you saved passages from: worth a second look.
  for (const b of books.filter((b) => (notes.get(b.id) ?? 0) >= 2 && (finished(b) || pct(b) > 0.5)).sort((a, b) => (notes.get(b.id) ?? 0) - (notes.get(a.id) ?? 0))) {
    out.push({ book: b, kind: 'revisit', why: `You saved ${notes.get(b.id)} passages from it.` });
  }

  // 3. Unread books in the categories you listen to most.
  const weight = new Map<string, number>();
  for (const b of books) if (finished(b) || started(b)) weight.set(b.category, (weight.get(b.category) ?? 0) + (finished(b) ? 2 : 1));
  const unread = books.filter((b) => pct(b) === 0 && !finished(b));
  const favored = unread.filter((b) => weight.has(b.category)).sort((a, b) => (weight.get(b.category) ?? 0) - (weight.get(a.category) ?? 0) || b.addedAt - a.addedAt);
  for (const b of favored) out.push({ book: b, kind: 'unread-favorite', why: `Not started yet, in ${b.category}, a category you listen to.` });

  // 4. Anything else not started, newest first.
  for (const b of unread.filter((b) => !favored.includes(b)).sort((a, b) => b.addedAt - a.addedAt)) {
    const days = Math.floor((now - b.addedAt) / DAY);
    out.push({ book: b, kind: 'unread', why: days ? `Added ${days} day${days === 1 ? '' : 's'} ago and not started.` : 'Added today and not started.' });
  }

  // One suggestion per book, the strongest reason first.
  const seen = new Set<string>();
  return out.filter((r) => !seen.has(r.book.id) && seen.add(r.book.id));
}

/** Short prompts to make listening count, one set per day. */
export const READING_PROMPTS = [
  'After this chapter, say the main idea out loud in one sentence.',
  'Pick one idea from today’s listening and try it before tonight.',
  'Bookmark the line you’d want to remember a year from now.',
  'Listen for one claim you disagree with, and note why.',
  'Explain what you heard today to someone at home or at work.',
  'Before you press play, recall what the last chapter was about.',
  'Write one action you’ll take this week from the book you’re on.',
];

export function promptsForDay(date = new Date(), count = 2): string[] {
  const day = Math.floor(date.getTime() / DAY);
  return Array.from({ length: count }, (_, i) => READING_PROMPTS[(day + i * 3) % READING_PROMPTS.length]);
}
