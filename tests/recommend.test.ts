import { describe, expect, it } from 'vitest';
import { promptsForDay, recommend } from '../src/core/recommend';
import type { Annotation, Book, Progress } from '../src/core/types';

const NOW = Date.UTC(2026, 9, 22);
const DAY = 86_400_000;
const book = (id: string, category: string, extra: Partial<Book> = {}): Book => ({
  id,
  title: id,
  author: '',
  category,
  format: 'txt',
  fileName: id,
  fileSize: 1,
  addedAt: NOW - 10 * DAY,
  lastOpenedAt: null,
  cover: null,
  chapterCount: 1,
  charCount: 1000,
  ...extra,
});
const prog = (bookId: string, percent: number, finished = false): Progress => ({ bookId, chapter: 0, offset: 0, percent, updatedAt: NOW, finished });
const note = (bookId: string): Annotation => ({ id: Math.random().toString(), bookId, kind: 'highlight', chapter: 0, start: 0, end: 1, quote: 'q', createdAt: 0, updatedAt: 0 });

describe('recommendations', () => {
  it('suggests books from the library with reasons, strongest first, one per book', () => {
    const books = [
      book('paused', 'Leadership', { lastOpenedAt: NOW - 9 * DAY }),
      book('recent', 'Leadership', { lastOpenedAt: NOW - DAY }),
      book('noted', 'Money and Investing'),
      book('unread-lead', 'Leadership', { addedAt: NOW - 2 * DAY }),
      book('unread-other', 'Fiction', { addedAt: NOW - DAY }),
    ];
    const progress = new Map([
      ['paused', prog('paused', 0.34)],
      ['recent', prog('recent', 0.5)],
      ['noted', prog('noted', 1, true)],
    ]);
    const recs = recommend(books, progress, [note('noted'), note('noted'), note('noted')], NOW);
    expect(recs.map((r) => [r.book.id, r.kind])).toEqual([
      ['paused', 'continue'],
      ['noted', 'revisit'],
      ['unread-lead', 'unread-favorite'],
      ['unread-other', 'unread'],
    ]);
    expect(recs[0].why).toBe('You’re 34% through and last listened 9 days ago.');
    expect(recs[1].why).toBe('You saved 3 passages from it.');
  });

  it('returns nothing for an empty library and gives stable daily prompts', () => {
    expect(recommend([], new Map(), [], NOW)).toEqual([]);
    expect(promptsForDay(new Date(NOW))).toEqual(promptsForDay(new Date(NOW + 1000)));
    expect(promptsForDay(new Date(NOW))).toHaveLength(2);
  });
});
