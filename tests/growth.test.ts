// @vitest-environment node
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { CATEGORIES } from '../src/growth/categories';
import { CATALOG } from '../src/growth/catalog';
import { MENTOR_FLOWS, buildPrompt, planToText } from '../src/growth/mentor';
import {
  buildDailyPlan,
  emptySegments,
  emptyState,
  isoWeek,
  pickFocusBook,
  scoreQuiz,
  searchCatalog,
  sourceLinks,
  streak,
  weekStats,
} from '../src/growth/plan';
import { getProfile, listNotes, listStates, saveBlock, saveNote, saveReview, updateState } from '../src/growth/store';
import { DEFAULT_PROFILE, type DailyBlock, type GrowthBookState } from '../src/growth/types';
import { createBackup, parseBackup, restoreBackup } from '../src/core/storage/backup';
import { DB_NAME, db, listBooks, resetDbConnection } from '../src/core/storage/db';

const REQUESTED = [
  'Atomic Habits', 'The Confidence Gap', 'How to Win Friends and Influence People', 'Crucial Conversations',
  'The 7 Habits of Highly Effective People', 'Emotional Intelligence', 'The Happiness Trap', 'Deep Work',
  'Never Split the Difference', 'The Charisma Myth', 'Extreme Ownership', 'The Effective Executive',
  'The E-Myth Revisited', 'Profit First', 'SPIN Selling', 'Traction', 'The Psychology of Money',
  'The Whole-Brain Child', "The New Father: A Dad's Guide to the First Year", 'Nonviolent Communication', 'Co-Intelligence',
];

describe('catalog', () => {
  it('contains exactly the 21 requested books, in a single recommended order', () => {
    expect(CATALOG.map((b) => b.title).sort()).toEqual([...REQUESTED].sort());
    expect(new Set(CATALOG.map((b) => b.id)).size).toBe(21);
    expect(CATALOG.map((b) => b.order)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(CATALOG[0].title).toBe('Atomic Habits');
  });

  it('has the eight categories, each book category valid, and every book category used', () => {
    expect(CATEGORIES.map((c) => c.name)).toEqual([
      'Discipline & Mental Resilience', 'Confidence & Social Skills', 'Leadership & Communication', 'Business Operations & Sales',
      'Financial Intelligence', 'Fatherhood & Relationships', 'AI & Technology', 'Reading Notes & Action Plans',
    ]);
    for (const c of CATEGORIES.filter((c) => c.id !== 'notes')) expect(CATALOG.some((b) => b.category === c.id)).toBe(true);
    expect(CATALOG.every((b) => CATEGORIES.some((c) => c.id === b.category && c.id !== 'notes'))).toBe(true);
  });

  it('gives every book a summary, ideas, business applications, exercises and a valid quiz', () => {
    for (const b of CATALOG) {
      expect(b.summary.length).toBeGreaterThan(200);
      expect(b.keyIdeas.length).toBeGreaterThanOrEqual(4);
      expect(b.lyons.length + b.stayops.length).toBeGreaterThanOrEqual(2);
      expect(b.exercises.length).toBeGreaterThanOrEqual(2);
      expect(b.quiz.length).toBeGreaterThanOrEqual(3);
      for (const item of b.quiz) expect(item.answer).toBeLessThan(item.options.length);
    }
    const ids = CATALOG.flatMap((b) => b.exercises.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('links only to legal sources (library catalogs and lending)', () => {
    const links = sourceLinks(CATALOG[0]);
    expect(links.map((l) => new URL(l.url).hostname)).toEqual(['openlibrary.org', 'search.worldcat.org', 'libbyapp.com']);
  });
});

describe('plan logic', () => {
  const states = (entries: Array<[string, Partial<GrowthBookState>]>) =>
    new Map(entries.map(([id, s]) => [id, { ...emptyState(id), ...s }]));

  it('searches across text, category, status and notes', () => {
    const st = states([['deep-work', { status: 'reading' }]]);
    expect(searchCatalog(CATALOG, { query: 'negotiation' }, st).map((b) => b.id)).toContain('never-split');
    expect(searchCatalog(CATALOG, { category: 'finance' }, st).map((b) => b.id)).toEqual(['profit-first', 'psychology-of-money']);
    expect(searchCatalog(CATALOG, { status: 'reading' }, st).map((b) => b.id)).toEqual(['deep-work']);
    const notes = [{ id: 'n', bookId: 'traction', kind: 'note' as const, text: 'Level 10 every Monday with Jordan', createdAt: 1, updatedAt: 1 }];
    expect(searchCatalog(CATALOG, { query: 'jordan' }, st, notes).map((b) => b.id)).toEqual(['traction']);
  });

  it('focuses on the book being read, else the next in order', () => {
    expect(pickFocusBook(CATALOG, new Map()).id).toBe('atomic-habits');
    expect(pickFocusBook(CATALOG, states([['atomic-habits', { status: 'finished' }]])).id).toBe('confidence-gap');
    expect(pickFocusBook(CATALOG, states([['traction', { status: 'reading', updatedAt: 5 }]])).id).toBe('traction');
  });

  it('builds a 30-minute daily block with the next unfinished exercise', () => {
    const book = CATALOG[0];
    const plan = buildDailyPlan('2026-10-21', book, { ...emptyState(book.id), exercisesDone: [book.exercises[0].id] }, true);
    expect(plan.map((s) => s.id)).toEqual(['review', 'read', 'practice', 'apply']);
    expect(plan.reduce((s, x) => s + x.minutes, 0)).toBe(30);
    expect(plan[1].title).toMatch(/^Listen/);
    expect(plan[2].title).toContain(book.exercises[1].title);
    expect(plan[3].detail).toMatch(/^(Lyons Cleaning Solutions|StayOps|Home):/);
  });

  it('counts streaks of fully completed days', () => {
    const done = (date: string): DailyBlock => ({ date, bookId: 'x', segments: { review: true, read: true, practice: true, apply: true } });
    const blocks = [done('2026-10-19'), done('2026-10-20'), { date: '2026-10-21', bookId: 'x', segments: emptySegments() }];
    expect(streak(blocks, '2026-10-21')).toBe(2);
    expect(streak([...blocks.slice(0, 2), done('2026-10-21')], '2026-10-21')).toBe(3);
    expect(streak([done('2026-10-15')], '2026-10-21')).toBe(0);
  });

  it('uses ISO weeks and summarizes a week', () => {
    expect(isoWeek(new Date(2026, 9, 21))).toBe('2026-W43');
    expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-W53');
    const blocks: DailyBlock[] = [{ date: '2026-10-20', bookId: 'x', segments: { review: true, read: true, practice: false, apply: false } }];
    expect(weekStats('2026-W43', blocks, [], []).minutes).toBe(20);
  });

  it('scores quizzes', () => {
    expect(scoreQuiz(CATALOG[0].quiz, [1, 2, 0])).toBe(2);
  });
});

describe('mentor', () => {
  it('every flow produces a useful plan, even with blank answers', () => {
    for (const f of MENTOR_FLOWS) {
      for (const answers of [{}, Object.fromEntries(f.fields.map((x) => [x.id, x.options?.[0] ?? 'example answer, second item']))]) {
        const sections = f.compose(answers, DEFAULT_PROFILE);
        expect(sections.length).toBeGreaterThanOrEqual(3);
        expect(sections.every((s) => s.lines.length > 0 && s.lines.every((l) => l.trim().length > 0))).toBe(true);
        expect(planToText(f, sections)).not.toMatch(/undefined|\[object/);
      }
      expect(f.books.every((id) => CATALOG.some((b) => b.id === id))).toBe(true);
    }
  });

  it('tailors the conversation script to the situation', () => {
    const f = MENTOR_FLOWS.find((x) => x.id === 'conversation')!;
    const text = planToText(f, f.compose({ who: 'Jordan, team lead', facts: 'Three turnovers finished after 3pm', feeling: 'worried', need: 'reliability for our hosts', request: 'text me by 1:30 if late', want: 'Every property ready on time' }, DEFAULT_PROFILE));
    expect(text).toContain('"Jordan, I want to talk about something because I care about every property ready on time."');
    expect(text).toContain('"Three turnovers finished after 3pm. I feel worried, because I need reliability for our hosts."');
    expect(text).toContain('"Would you be willing to text me by 1:30 if late?"');
  });

  it('builds a prompt for an outside AI with the business profile', () => {
    const f = MENTOR_FLOWS.find((x) => x.id === 'decision')!;
    const prompt = buildPrompt(f, { decision: 'Hire a team lead', context: 'Lyons Cleaning Solutions' }, DEFAULT_PROFILE, ['The Effective Executive']);
    expect(prompt).toContain('Lyons Cleaning Solutions');
    expect(prompt).toContain('StayOps');
    expect(prompt).toContain('Hire a team lead');
    expect(prompt).toContain('The Effective Executive');
  });
});

describe('growth storage', () => {
  beforeEach(async () => {
    await resetDbConnection();
    const d = await db();
    for (const s of ['books', 'contents', 'files', 'progress', 'annotations', 'kv', 'growthBooks', 'growthNotes', 'growthDays', 'growthReviews'] as const) await d.clear(s);
  });

  it('saves reading status, notes, blocks and reviews, and backs them up', async () => {
    const s = await updateState('deep-work', { status: 'reading' });
    expect(s.startedAt).toBeTypeOf('number');
    const done = await updateState('deep-work', { status: 'finished', rating: 5 });
    expect(done.finishedAt).toBeTypeOf('number');
    await saveNote({ bookId: 'deep-work', kind: 'action', text: 'Block 8–10am for StayOps', area: 'stayops' });
    await saveBlock({ date: '2026-10-21', bookId: 'deep-work', segments: { review: true, read: true, practice: true, apply: true } });
    await saveReview({ week: '2026-W43', wins: 'x', lyons: '', stayops: '', family: '', missed: '', lesson: '', commitment: 'y', score: 8, savedAt: 0 });
    expect((await getProfile()).name).toBe(DEFAULT_PROFILE.name);

    const json = JSON.stringify(await createBackup(false));
    const d = await db();
    for (const st of ['growthBooks', 'growthNotes', 'growthDays', 'growthReviews'] as const) await d.clear(st);
    const summary = await restoreBackup(parseBackup(json));
    expect(summary.growth).toBe(4);
    expect((await listStates()).get('deep-work')?.rating).toBe(5);
    expect((await listNotes())[0].text).toBe('Block 8–10am for StayOps');
  });

  it('still restores backups from the first version', async () => {
    const v1 = { format: 'my-library-backup', version: 1, exportedAt: '', books: [], contents: [], progress: [], annotations: [], settings: {}, files: [] };
    await expect(restoreBackup(parseBackup(JSON.stringify(v1)))).resolves.toMatchObject({ books: 0, growth: 0 });
  });
});

describe('database upgrade', () => {
  it('keeps existing books when upgrading from version 1', async () => {
    await resetDbConnection();
    await new Promise((r) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = r;
    });
    const old = await openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore('books', { keyPath: 'id' });
        d.createObjectStore('contents', { keyPath: 'bookId' });
        d.createObjectStore('files', { keyPath: 'bookId' });
        d.createObjectStore('progress', { keyPath: 'bookId' });
        d.createObjectStore('annotations', { keyPath: 'id' }).createIndex('byBook', 'bookId');
        d.createObjectStore('kv');
      },
    });
    await old.put('books', { id: 'b1', title: 'Old book', addedAt: 1, lastOpenedAt: null } as never);
    old.close();
    expect((await listBooks()).map((b) => b.title)).toEqual(['Old book']);
    expect((await db()).objectStoreNames.contains('growthNotes')).toBe(true);
  });
});
