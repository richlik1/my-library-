// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createBackup, parseBackup, restoreBackup } from '../src/core/storage/backup';
import {
  db,
  deleteBook,
  getContent,
  getFile,
  getProgress,
  getSettings,
  listAnnotations,
  listBooks,
  resetDbConnection,
  saveAnnotation,
  saveImportedBook,
  saveProgress,
  saveSettings,
  updateBook,
  updateChapterText,
} from '../src/core/storage/db';
import type { ImportedBook } from '../src/core/types';

const imported: ImportedBook = {
  title: 'Stored Book',
  author: 'A. Writer',
  format: 'txt',
  cover: null,
  chapters: [
    { title: 'One', text: 'Hello world.' },
    { title: 'Two', text: 'Goodbye world.' },
  ],
};

async function clearAll() {
  const d = await db();
  for (const s of ['books', 'contents', 'files', 'progress', 'annotations', 'kv', 'growthBooks', 'growthNotes', 'growthDays', 'growthReviews'] as const) await d.clear(s);
}

describe('library storage', () => {
  beforeEach(async () => {
    await resetDbConnection();
    await clearAll();
  });

  it('corrects a chapter’s text and keeps notes on their quoted words', async () => {
    const book = await saveImportedBook(
      { ...imported, chapters: [{ title: 'One', text: 'PAGE 4 Header. The keeper lit the lamp. He waited all night.' }] },
      { name: 'b.txt', size: 5, type: 'text/plain', data: new Blob(['x']) },
      'Fiction',
    );
    const text = 'PAGE 4 Header. The keeper lit the lamp. He waited all night.';
    const q1 = 'The keeper lit the lamp.';
    await saveAnnotation({ bookId: book.id, kind: 'highlight', chapter: 0, start: text.indexOf(q1), end: text.indexOf(q1) + q1.length, quote: q1 });
    await saveAnnotation({ bookId: book.id, kind: 'note', chapter: 0, start: 0, end: 6, quote: 'PAGE 4', note: 'header' });
    const r = await updateChapterText(book.id, 0, 'The Lamp', 'The keeper lit the lamp. He waited all night.');
    expect(r).toMatchObject({ moved: 1, unmatched: 1 });
    expect((await getContent(book.id))!.chapters[0]).toEqual({ title: 'The Lamp', text: 'The keeper lit the lamp. He waited all night.' });
    const notes = await listAnnotations(book.id);
    const h = notes.find((a) => a.quote === q1)!;
    expect('The keeper lit the lamp. He waited all night.'.slice(h.start, h.end)).toBe(q1);
    expect((await listBooks())[0].charCount).toBe('The keeper lit the lamp. He waited all night.'.length);
  });

  it('saves and lists books with content and original file', async () => {
    const book = await saveImportedBook(imported, { name: 'b.txt', size: 5, type: 'text/plain', data: new Blob(['hello']) }, 'Fiction');
    expect(book.chapterCount).toBe(2);
    expect(book.charCount).toBe(26);
    expect((await listBooks()).map((b) => b.title)).toEqual(['Stored Book']);
    expect((await getContent(book.id))?.chapters[1].text).toBe('Goodbye world.');
    expect(await (await getFile(book.id))!.data.text()).toBe('hello');
    // Stored as raw bytes, not a Blob: Safari on iPhone refuses to store Blobs in IndexedDB.
    expect((await (await db()).get('files', book.id))!.data).toBeInstanceOf(ArrayBuffer);
    await updateBook(book.id, { category: 'Study' });
    expect((await listBooks())[0].category).toBe('Study');
  });

  it('deletes a book with all its data', async () => {
    const book = await saveImportedBook(imported, { name: 'b.txt', size: 5, type: 'text/plain', data: new Blob(['hello']) }, 'Fiction');
    await saveProgress({ bookId: book.id, chapter: 1, offset: 3, percent: 0.5, updatedAt: 1 });
    await saveAnnotation({ bookId: book.id, kind: 'bookmark', chapter: 0, start: 0, end: 5, quote: 'Hello' });
    await deleteBook(book.id);
    expect(await listBooks()).toEqual([]);
    expect(await getContent(book.id)).toBeUndefined();
    expect(await getProgress(book.id)).toBeUndefined();
    expect(await listAnnotations(book.id)).toEqual([]);
  });

  it('round-trips a full backup including files, progress, notes and settings', async () => {
    const book = await saveImportedBook(imported, { name: 'b.txt', size: 5, type: 'text/plain', data: new Blob(['hello']) }, 'Fiction');
    await saveProgress({ bookId: book.id, chapter: 1, offset: 3, percent: 0.5, updatedAt: 10 });
    await saveAnnotation({ bookId: book.id, kind: 'note', chapter: 0, start: 0, end: 5, quote: 'Hello', note: 'Nice' });
    await saveSettings({ ...(await getSettings()), rate: 1.4 });

    const json = JSON.stringify(await createBackup(true));
    await clearAll();
    expect(await listBooks()).toEqual([]);

    const summary = await restoreBackup(parseBackup(json), { restoreSettings: true });
    expect(summary).toEqual({ books: 1, skippedBooks: 0, annotations: 1, progress: 1, growth: 0 });
    expect((await listBooks())[0].title).toBe('Stored Book');
    expect((await getProgress(book.id))?.offset).toBe(3);
    expect((await listAnnotations(book.id))[0].note).toBe('Nice');
    expect(await (await getFile(book.id))!.data.text()).toBe('hello');
    expect((await getSettings()).rate).toBe(1.4);

    // Restoring again merges without duplicating.
    const again = await restoreBackup(parseBackup(json));
    expect(again.books).toBe(0);
    expect(again.skippedBooks).toBe(1);
    expect(await listBooks()).toHaveLength(1);
  });

  it('adds the new default categories to an existing list once, keeping custom ones', async () => {
    await (await db()).put('kv', { ...(await getSettings()), categories: ['Fiction', 'My Custom'], categoriesVersion: 1 }, 'settings');
    const s = await getSettings();
    expect(s.categories.slice(0, 2)).toEqual(['Fiction', 'My Custom']);
    expect(s.categories).toContain('Spirituality and Philosophy');
    expect(s.categories).toContain('Technology and AI');
    await saveSettings({ ...s, categories: ['Only Mine'] });
    expect((await getSettings()).categories).toEqual(['Only Mine']); // a later removal is respected
  });

  it('keeps a settings change made just before the app closed, and a restored backup replaces it', async () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    };
    try {
      const s = await getSettings();
      await saveSettings({ ...s, theme: 'dark' });
      const backup = await createBackup(false);
      // The app closes before the database write of the next change finishes: only the instant copy has it.
      store.set('ml-settings', JSON.stringify({ at: Date.now() + 1000, s: { ...s, theme: 'light' } }));
      expect((await getSettings()).theme).toBe('light');
      await restoreBackup(backup, { restoreSettings: true });
      expect((await getSettings()).theme).toBe('dark');
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow(/not a My Library backup/);
    expect(() => parseBackup('nope')).toThrow(/not valid JSON/);
  });
});
