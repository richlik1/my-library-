import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { newId } from '../id';
import type { Annotation, Book, BookContent, ImportedBook, Progress, Settings, StoredFile } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import type { DailyBlock, GrowthBookState, GrowthNote, WeeklyReview } from '../../growth/types';

/**
 * All data lives in this browser's IndexedDB. Nothing is ever uploaded.
 * A future native app can implement the same functions on top of SQLite.
 */
interface LibraryDB extends DBSchema {
  books: { key: string; value: Book };
  contents: { key: string; value: BookContent };
  files: { key: string; value: StoredFile };
  progress: { key: string; value: Progress };
  annotations: { key: string; value: Annotation; indexes: { byBook: string } };
  kv: { key: string; value: unknown };
  // LYONS AI Growth Library (schema v2)
  growthBooks: { key: string; value: GrowthBookState };
  growthNotes: { key: string; value: GrowthNote };
  growthDays: { key: string; value: DailyBlock };
  growthReviews: { key: string; value: WeeklyReview };
}

export const GROWTH_STORES = ['growthBooks', 'growthNotes', 'growthDays', 'growthReviews'] as const;

export const DB_NAME = 'my-library';
let dbPromise: Promise<IDBPDatabase<LibraryDB>> | null = null;

export function db(): Promise<IDBPDatabase<LibraryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<LibraryDB>(DB_NAME, 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore('books', { keyPath: 'id' });
          d.createObjectStore('contents', { keyPath: 'bookId' });
          d.createObjectStore('files', { keyPath: 'bookId' });
          d.createObjectStore('progress', { keyPath: 'bookId' });
          d.createObjectStore('annotations', { keyPath: 'id' }).createIndex('byBook', 'bookId');
          d.createObjectStore('kv');
        }
        if (oldVersion < 2) {
          // Added with the Growth Library; existing books and progress are untouched.
          d.createObjectStore('growthBooks', { keyPath: 'bookId' });
          d.createObjectStore('growthNotes', { keyPath: 'id' });
          d.createObjectStore('growthDays', { keyPath: 'date' });
          d.createObjectStore('growthReviews', { keyPath: 'week' });
        }
      },
      blocking() {
        // Another tab upgraded the schema: close so it can proceed.
        dbPromise?.then((x) => x.close());
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/** For tests: forget the cached connection. */
export async function resetDbConnection() {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

// ---- Books -----------------------------------------------------------------

export async function listBooks(): Promise<Book[]> {
  const books = await (await db()).getAll('books');
  return books.sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt));
}

export async function getBook(id: string) {
  return (await db()).get('books', id);
}

export async function saveImportedBook(
  imported: ImportedBook,
  file: { name: string; size: number; type: string; data: Blob },
  category: string,
  keepOriginal = true,
): Promise<Book> {
  const id = newId();
  const book: Book = {
    id,
    title: imported.title,
    author: imported.author,
    category,
    format: imported.format,
    fileName: file.name,
    fileSize: file.size,
    addedAt: Date.now(),
    lastOpenedAt: null,
    cover: imported.cover,
    chapterCount: imported.chapters.length,
    charCount: imported.chapters.reduce((s, c) => s + c.text.length, 0),
    ...(imported.ocr ? { ocr: imported.ocr } : {}),
  };
  // Read the bytes before opening the transaction (it would auto-commit while we wait).
  const bytes = keepOriginal ? await file.data.arrayBuffer() : null;
  const d = await db();
  const tx = d.transaction(['books', 'contents', 'files'], 'readwrite');
  await tx.objectStore('books').put(book);
  await tx.objectStore('contents').put({ bookId: id, chapters: imported.chapters });
  if (bytes) await tx.objectStore('files').put({ bookId: id, name: file.name, type: file.type, data: bytes });
  await tx.done;
  return book;
}

export async function updateBook(id: string, patch: Partial<Omit<Book, 'id'>>): Promise<Book | undefined> {
  const d = await db();
  const book = await d.get('books', id);
  if (!book) return undefined;
  const next = { ...book, ...patch };
  await d.put('books', next);
  return next;
}

export async function deleteBook(id: string) {
  const d = await db();
  const tx = d.transaction(['books', 'contents', 'files', 'progress', 'annotations'], 'readwrite');
  await Promise.all([
    tx.objectStore('books').delete(id),
    tx.objectStore('contents').delete(id),
    tx.objectStore('files').delete(id),
    tx.objectStore('progress').delete(id),
  ]);
  const keys = await tx.objectStore('annotations').index('byBook').getAllKeys(id);
  await Promise.all(keys.map((k) => tx.objectStore('annotations').delete(k)));
  await tx.done;
}

export async function getContent(bookId: string) {
  return (await db()).get('contents', bookId);
}

/** The original file, always returned as a Blob. */
export async function getFile(bookId: string): Promise<(StoredFile & { data: Blob }) | undefined> {
  const f = await (await db()).get('files', bookId);
  return f ? { ...f, data: f.data instanceof Blob ? f.data : new Blob([f.data], { type: f.type }) } : undefined;
}

// ---- Progress --------------------------------------------------------------

export async function getProgress(bookId: string) {
  return (await db()).get('progress', bookId);
}

export async function listProgress(): Promise<Progress[]> {
  return (await db()).getAll('progress');
}

export async function saveProgress(p: Progress) {
  await (await db()).put('progress', p);
}

// ---- Annotations -----------------------------------------------------------

export async function listAnnotations(bookId: string): Promise<Annotation[]> {
  const all = await (await db()).getAllFromIndex('annotations', 'byBook', bookId);
  return all.sort((a, b) => a.chapter - b.chapter || a.start - b.start);
}

export async function saveAnnotation(a: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<Annotation, 'id' | 'createdAt'>>) {
  const now = Date.now();
  const full: Annotation = { ...a, id: a.id ?? newId(), createdAt: a.createdAt ?? now, updatedAt: now };
  await (await db()).put('annotations', full);
  return full;
}

export async function deleteAnnotation(id: string) {
  await (await db()).delete('annotations', id);
}

// ---- Settings --------------------------------------------------------------

export async function getSettings(): Promise<Settings> {
  const s = (await (await db()).get('kv', 'settings')) as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function saveSettings(s: Settings) {
  await (await db()).put('kv', s, 'settings');
}

// ---- Device storage ----------------------------------------------------------

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
