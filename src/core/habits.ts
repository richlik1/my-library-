/**
 * Reading habits: listening time measured from real playback, daily goals,
 * gentle streaks, an auditable XP ledger, levels and achievements.
 * Pure functions here; storage lives in core/storage/db.ts.
 */

export interface ListeningDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  seconds: number;
  byBook: Record<string, number>;
}

export type XpKind = 'listening' | 'quiz' | 'book' | 'review';

/**
 * One line of the XP ledger. The id is the deduplication key: the same event
 * (e.g. finishing the same book) always has the same id, so it counts once.
 */
export interface XpEvent {
  id: string;
  kind: XpKind;
  amount: number;
  at: number;
  label: string;
}

export const XP_RULES = { perListeningMinute: 1, quiz: 10, bookCompleted: 20, review: 5 } as const;

export const xpIds = {
  listening: (date: string) => `listen:${date}`,
  quiz: (growthBookId: string) => `quiz:${growthBookId}`,
  book: (bookId: string) => `book:${bookId}`,
  review: (date: string) => `review:${date}`,
};

export function localDate(d: Date | number = new Date()): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + n));
}

// ---- Levels ----------------------------------------------------------------------

export interface LevelConfig {
  names: string[];
  /** XP needed for level 2. */
  base: number;
  /** How quickly each level gets bigger (1 = equal steps). */
  growth: number;
}

export const LEVELS: LevelConfig = {
  names: ['Beginner', 'Explorer', 'Knowledge Builder', 'Deep Thinker', 'Master Learner'],
  base: 60,
  growth: 1.6,
};

/** Total XP needed to reach a level (level 1 needs 0). Works for any level, not just the named ones. */
export function xpForLevel(level: number, cfg: LevelConfig = LEVELS): number {
  return level <= 1 ? 0 : Math.round(cfg.base * Math.pow(level - 1, cfg.growth));
}

export function levelFor(xp: number, cfg: LevelConfig = LEVELS) {
  let level = 1;
  while (xp >= xpForLevel(level + 1, cfg)) level++;
  const floor = xpForLevel(level, cfg);
  const next = xpForLevel(level + 1, cfg);
  return {
    level,
    name: cfg.names[level - 1] ?? `${cfg.names[cfg.names.length - 1]} ${level - cfg.names.length + 1}`,
    xp,
    floor,
    next,
    progress: (xp - floor) / (next - floor),
  };
}

// ---- Goals and streaks --------------------------------------------------------------

/**
 * Days in a row with listening, counting back from today. Forgiving: one rest
 * day per week doesn't break it, and today not being done yet never does.
 */
export function streak(listened: Set<string>, today: string, restDaysPerWeek = 1): number {
  let count = 0;
  let lastRest: number | null = null;
  let day = listened.has(today) ? today : addDays(today, -1);
  for (let i = 0; i < 3660; i++, day = addDays(day, -1)) {
    if (listened.has(day)) {
      count++;
      continue;
    }
    // A single missed day is a rest day if there's listening just before it and none was used in the past week.
    const canRest = restDaysPerWeek > 0 && listened.has(addDays(day, -1)) && (lastRest === null || i - lastRest >= 7);
    if (!canRest) break;
    lastRest = i;
  }
  return count;
}

export function weekDays(days: Map<string, ListeningDay>, today: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, minutes: Math.floor((days.get(date)?.seconds ?? 0) / 60) };
  });
}

export function monthMinutes(days: Map<string, ListeningDay>, today: string) {
  const prefix = today.slice(0, 7);
  let s = 0;
  for (const d of days.values()) if (d.date.startsWith(prefix)) s += d.seconds;
  return Math.floor(s / 60);
}

// ---- Achievements -------------------------------------------------------------------

export interface AchievementInput {
  totalSeconds: number;
  listenedDays: number;
  booksStarted: number;
  booksCompleted: number;
  quotes: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  earned: boolean;
  /** e.g. "3 of 5 days". */
  progress: string;
}

export function achievements(i: AchievementInput): Achievement[] {
  const a = (id: string, name: string, description: string, have: number, need: number, unit: string): Achievement => ({
    id,
    name,
    description,
    earned: have >= need,
    progress: `${Math.min(have, need)} of ${need} ${unit}`,
  });
  return [
    a('first-book', 'First Book', 'Start listening to your first book.', i.booksStarted, 1, 'book'),
    a('first-hour', 'First Hour', 'Listen for one hour in total.', Math.floor(i.totalSeconds / 60), 60, 'minutes'),
    a('five-days', 'Five-Day Reading Habit', 'Listen on five different days.', i.listenedDays, 5, 'days'),
    a('first-complete', 'First Completed Book', 'Finish a whole book.', i.booksCompleted, 1, 'book'),
    a('ten-complete', 'Ten Books Completed', 'Finish ten books.', i.booksCompleted, 10, 'books'),
    a('collector', 'Knowledge Collector', 'Save ten quotes or lessons.', i.quotes, 10, 'quotes'),
  ];
}

// ---- Measuring listening time ----------------------------------------------------------

export interface PlaybackSample {
  bookId: string;
  playing: boolean;
  /** Seconds into the chapter audio (audio files only). */
  mediaTime?: number;
  chapter: number;
  rate: number;
}

/**
 * Turns playback state into listening seconds. Counts only time when audio is
 * actually playing: not paused, not waiting for audio to be made. For audio
 * files it uses the media clock (so time listened with the phone locked
 * counts), and ignores jumps from skipping. For device speech it uses the
 * clock in short steps, so a throttled background timer can't add time.
 */
export class ListeningTracker {
  private last: { wall: number; mediaTime?: number; chapter: number; bookId: string } | null = null;
  private pending = new Map<string, number>();
  private pendingTotal = 0;

  constructor(
    private readonly sink: (bookId: string, seconds: number, at: number) => void,
    private readonly now: () => number = () => Date.now(),
    private readonly flushEvery = 15,
  ) {}

  update(s: PlaybackSample) {
    const wall = this.now();
    const last = this.last;
    if (!s.playing) {
      this.last = null;
      this.flush();
      return;
    }
    if (last && last.bookId === s.bookId) {
      const wallDelta = (wall - last.wall) / 1000;
      let add = 0;
      if (s.mediaTime !== undefined && last.mediaTime !== undefined) {
        const listened = (s.mediaTime - last.mediaTime) / Math.max(0.25, s.rate);
        // Same chapter, moving forward, no faster than the clock: real listening, not a skip.
        if (last.chapter === s.chapter && listened > 0 && listened <= wallDelta * 1.25 + 1) add = listened;
      } else if (s.mediaTime === undefined && wallDelta > 0 && wallDelta <= 5) {
        add = wallDelta;
      }
      if (add > 0) {
        this.pending.set(s.bookId, (this.pending.get(s.bookId) ?? 0) + add);
        this.pendingTotal += add;
      }
    }
    this.last = { wall, mediaTime: s.mediaTime, chapter: s.chapter, bookId: s.bookId };
    if (this.pendingTotal >= this.flushEvery) this.flush();
  }

  flush() {
    const at = this.now();
    for (const [bookId, secs] of this.pending) if (secs > 0) this.sink(bookId, secs, at);
    this.pending.clear();
    this.pendingTotal = 0;
  }
}
