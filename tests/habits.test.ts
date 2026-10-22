import { describe, expect, it } from 'vitest';
import { ListeningTracker, achievements, addDays, levelFor, monthMinutes, streak, weekDays, xpForLevel, type ListeningDay } from '../src/core/habits';

describe('listening time', () => {
  const setup = () => {
    let t = 0;
    const out: Array<[string, number]> = [];
    const tracker = new ListeningTracker((b, s) => out.push([b, s]), () => t, 1000);
    return { tracker, out, advance: (s: number) => (t += s * 1000), total: () => out.reduce((a, [, s]) => a + s, 0) };
  };

  it('counts audio time while playing, divided by speed, including time with the phone locked', () => {
    const { tracker, advance, total } = setup();
    tracker.update({ bookId: 'b', playing: true, mediaTime: 0, chapter: 0, rate: 1.5 });
    advance(10);
    tracker.update({ bookId: 'b', playing: true, mediaTime: 15, chapter: 0, rate: 1.5 });
    // Phone locked for 10 minutes: no updates, then one big step.
    advance(600);
    tracker.update({ bookId: 'b', playing: true, mediaTime: 915, chapter: 0, rate: 1.5 });
    tracker.update({ bookId: 'b', playing: false, chapter: 0, rate: 1.5 });
    expect(total()).toBeCloseTo(610, 5);
  });

  it('does not count paused time, waiting for audio, or skips', () => {
    const { tracker, advance, total } = setup();
    tracker.update({ bookId: 'b', playing: true, mediaTime: 0, chapter: 0, rate: 1 });
    advance(1);
    tracker.update({ bookId: 'b', playing: true, mediaTime: 31, chapter: 0, rate: 1 }); // +30 s skip
    tracker.update({ bookId: 'b', playing: false, chapter: 0, rate: 1 });
    advance(300); // paused / waiting
    tracker.update({ bookId: 'b', playing: true, mediaTime: 31, chapter: 0, rate: 1 });
    advance(2);
    tracker.update({ bookId: 'b', playing: true, mediaTime: 33, chapter: 0, rate: 1 });
    tracker.flush();
    expect(total()).toBeCloseTo(2, 5);
  });

  it('device speech counts the clock in short steps only (no throttled background timers)', () => {
    const { tracker, advance, total } = setup();
    tracker.update({ bookId: 'b', playing: true, chapter: 0, rate: 1 });
    advance(1);
    tracker.update({ bookId: 'b', playing: true, chapter: 0, rate: 1 });
    advance(120); // a background timer firing late
    tracker.update({ bookId: 'b', playing: true, chapter: 0, rate: 1 });
    advance(1);
    tracker.update({ bookId: 'b', playing: true, chapter: 0, rate: 1 });
    tracker.flush();
    expect(total()).toBe(2);
  });
});

describe('streaks, week and month', () => {
  const today = '2026-10-22';
  const days = (...offsets: number[]) => new Set(offsets.map((o) => addDays(today, -o)));

  it('counts days in a row, forgives one rest day a week, and today not done yet', () => {
    expect(streak(days(0, 1, 2), today)).toBe(3);
    expect(streak(days(1, 2), today)).toBe(2); // today not listened yet
    expect(streak(days(0, 2, 3, 4), today)).toBe(4); // one rest day
    expect(streak(days(0, 2, 4, 5), today)).toBe(2); // two rest days within a week: stops
    expect(streak(days(0, 2, 3, 4, 5, 6, 7, 8, 10), today)).toBe(9); // rest days a week apart
    expect(streak(days(0, 1, 2), today, 0)).toBe(3);
    expect(streak(days(), today)).toBe(0);
  });

  it('summarises the week and month in minutes', () => {
    const m = new Map<string, ListeningDay>([
      [today, { date: today, seconds: 1250, byBook: {} }],
      ['2026-10-20', { date: '2026-10-20', seconds: 600, byBook: {} }],
      ['2026-09-30', { date: '2026-09-30', seconds: 6000, byBook: {} }],
    ]);
    expect(weekDays(m, today).map((d) => d.minutes)).toEqual([0, 0, 0, 0, 10, 0, 20]);
    expect(monthMinutes(m, today)).toBe(30);
  });
});

describe('levels and achievements', () => {
  it('uses a formula, not a fixed list of levels', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(60);
    expect(levelFor(0)).toMatchObject({ level: 1, name: 'Beginner' });
    expect(levelFor(60)).toMatchObject({ level: 2, name: 'Explorer' });
    expect(levelFor(100000).level).toBeGreaterThan(5);
    expect(levelFor(100000).name).toMatch(/^Master Learner \d+$/);
  });

  it('earns achievements from real counts and shows progress', () => {
    const list = achievements({ totalSeconds: 3700, listenedDays: 3, booksStarted: 2, booksCompleted: 1, quotes: 4 });
    const by = Object.fromEntries(list.map((a) => [a.id, a]));
    expect(by['first-book'].earned).toBe(true);
    expect(by['first-hour'].earned).toBe(true);
    expect(by['five-days']).toMatchObject({ earned: false, progress: '3 of 5 days' });
    expect(by['first-complete'].earned).toBe(true);
    expect(by['collector'].earned).toBe(false);
  });
});

describe('habit storage', () => {
  it('adds listening time per day and book, with listening XP that updates instead of duplicating', async () => {
    const { addListening, listListening, listXp, awardXp, resetDbConnection, db } = await import('../src/core/storage/db');
    await resetDbConnection();
    const d = await db();
    await d.clear('listening');
    await d.clear('xp');
    const at = new Date(2026, 9, 22, 9).getTime();
    await addListening('a', 50, at);
    await addListening('b', 80, at);
    const [day] = await listListening();
    expect(day).toMatchObject({ date: '2026-10-22', seconds: 130, byBook: { a: 50, b: 80 } });
    expect((await listXp()).map((e) => [e.id, e.amount])).toEqual([['listen:2026-10-22', 2]]);

    // The same event never counts twice.
    const e = { id: 'book:a', kind: 'book' as const, amount: 20, at, label: 'Finished A' };
    expect(await awardXp(e)).toBe(true);
    expect(await awardXp({ ...e, at: at + 1000 })).toBe(false);
    expect((await listXp()).filter((x) => x.id === 'book:a')).toHaveLength(1);
  });
});
