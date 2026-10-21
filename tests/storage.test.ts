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

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow(/not a My Library backup/);
    expect(() => parseBackup('nope')).toThrow(/not valid JSON/);
  });
});
