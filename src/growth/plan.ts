import type { CatalogBook, CategoryId, DailyBlock, GrowthBookState, GrowthNote, ReadingStatus, SegmentId, WeeklyReview } from './types';

/** Places to get a legal copy: library lending and catalog records. No pirated sources. */
export function sourceLinks(b: Pick<CatalogBook, 'title' | 'author'>) {
  const query = encodeURIComponent(`${b.title} ${b.author.split(/[,&]| with /)[0].trim()}`);
  return [
    { label: 'Open Library', url: `https://openlibrary.org/search?q=${query}` },
    { label: 'WorldCat · nearby libraries', url: `https://search.worldcat.org/search?q=${query}` },
    { label: 'Libby · library e-books & audiobooks', url: 'https://libbyapp.com/' },
  ];
}

export const STATUS_LABEL: Record<ReadingStatus, string> = {
  'not-started': 'Not started',
  reading: 'Reading',
  finished: 'Finished',
  rereading: 'Re-reading',
};

export function emptyState(bookId: string): GrowthBookState {
  return { bookId, status: 'not-started', exercisesDone: [], quizAttempts: 0, minutes: 0, updatedAt: 0 };
}

export interface CatalogFilter {
  query?: string;
  category?: CategoryId | 'all';
  status?: ReadingStatus | 'all';
}

/** Full-text search over title, author, skill, summary, ideas, tags and the user's notes. */
export function searchCatalog(
  books: CatalogBook[],
  filter: CatalogFilter,
  states: Map<string, GrowthBookState>,
  notes: GrowthNote[] = [],
): CatalogBook[] {
  const terms = (filter.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return books.filter((b) => {
    if (filter.category && filter.category !== 'all' && b.category !== filter.category) return false;
    const status = states.get(b.id)?.status ?? 'not-started';
    if (filter.status && filter.status !== 'all' && status !== filter.status) return false;
    if (!terms.length) return true;
    const hay = [
      b.title,
      b.author,
      b.skill,
      b.summary,
      ...b.keyIdeas,
      ...b.tags,
      ...b.lyons,
      ...b.stayops,
      ...notes.filter((n) => n.bookId === b.id).map((n) => n.text),
    ]
      .join(' ')
      .toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ISO-8601 week id, e.g. "2026-W43". */
export function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** The book to focus on today: the one you're reading, else the next in the recommended order. */
export function pickFocusBook(books: CatalogBook[], states: Map<string, GrowthBookState>): CatalogBook {
  const active = books
    .filter((b) => ['reading', 'rereading'].includes(states.get(b.id)?.status ?? ''))
    .sort((a, b) => (states.get(b.id)?.updatedAt ?? 0) - (states.get(a.id)?.updatedAt ?? 0));
  if (active.length) return active[0];
  const next = [...books].sort((a, b) => a.order - b.order).find((b) => (states.get(b.id)?.status ?? 'not-started') === 'not-started');
  return next ?? books[0];
}

export interface Segment {
  id: SegmentId;
  minutes: number;
  title: string;
  detail: string;
}

const dayNumber = (date: string) => Math.floor(new Date(`${date}T12:00:00`).getTime() / 86400000);

/** Today's 30-minute learning block: review 5, read/listen 15, practice 5, apply 5. */
export function buildDailyPlan(date: string, book: CatalogBook, state: GrowthBookState | undefined, linkedCopy: boolean): Segment[] {
  const n = dayNumber(date);
  const idea = book.keyIdeas[n % book.keyIdeas.length];
  const exercise = book.exercises.find((e) => !state?.exercisesDone.includes(e.id)) ?? book.exercises[n % book.exercises.length];
  const applications = [
    ...book.lyons.map((t) => `Lyons Cleaning Solutions: ${t}`),
    ...book.stayops.map((t) => `StayOps: ${t}`),
    `Home: ${book.personal}`,
  ];
  return [
    { id: 'review', minutes: 5, title: 'Review a key idea', detail: idea },
    {
      id: 'read',
      minutes: 15,
      title: linkedCopy ? `Listen to ${book.title}` : `Read ${book.title}`,
      detail: linkedCopy
        ? 'Open your copy in My Library and listen for 15 minutes. Your place is saved.'
        : 'Read 15 minutes of your own copy (library loan or purchase), or study the summary and key ideas here.',
    },
    { id: 'practice', minutes: 5, title: `Practice: ${exercise.title}`, detail: exercise.steps.join(' ') },
    { id: 'apply', minutes: 5, title: 'Apply it today', detail: applications[n % applications.length] },
  ];
}

export const emptySegments = (): Record<SegmentId, boolean> => ({ review: false, read: false, practice: false, apply: false });

export const isBlockComplete = (b?: DailyBlock) => !!b && Object.values(b.segments).every(Boolean);

/** Consecutive completed days ending today (or yesterday, if today isn't done yet). */
export function streak(blocks: DailyBlock[], today = localDate()): number {
  const done = new Set(blocks.filter(isBlockComplete).map((b) => b.date));
  const d = new Date(`${today}T12:00:00`);
  if (!done.has(today)) d.setDate(d.getDate() - 1);
  let count = 0;
  while (done.has(localDate(d))) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

export interface WeekStats {
  blocks: number;
  minutes: number;
  notes: number;
  actionsDone: number;
  actionsOpen: number;
  booksFinished: number;
}

export function weekStats(week: string, blocks: DailyBlock[], states: GrowthBookState[], notes: GrowthNote[]): WeekStats {
  const inWeek = (t?: number) => !!t && isoWeek(new Date(t)) === week;
  const weekBlocks = blocks.filter((b) => isoWeek(new Date(`${b.date}T12:00:00`)) === week);
  const completed = weekBlocks.filter(isBlockComplete);
  return {
    blocks: completed.length,
    minutes: weekBlocks.reduce((s, b) => s + (b.segments.review ? 5 : 0) + (b.segments.read ? 15 : 0) + (b.segments.practice ? 5 : 0) + (b.segments.apply ? 5 : 0), 0),
    notes: notes.filter((x) => inWeek(x.createdAt)).length,
    actionsDone: notes.filter((x) => x.kind === 'action' && x.done && inWeek(x.updatedAt)).length,
    actionsOpen: notes.filter((x) => x.kind === 'action' && !x.done).length,
    booksFinished: states.filter((s) => inWeek(s.finishedAt)).length,
  };
}

export const emptyReview = (week: string): WeeklyReview => ({
  week,
  wins: '',
  lyons: '',
  stayops: '',
  family: '',
  missed: '',
  lesson: '',
  commitment: '',
  score: 7,
  savedAt: 0,
});

export function scoreQuiz(quiz: { answer: number }[], answers: (number | null)[]): number {
  return quiz.reduce((s, item, i) => s + (answers[i] === item.answer ? 1 : 0), 0);
}
