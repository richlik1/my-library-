import type { BusinessProfile, DailyBlock, GrowthBookState, GrowthNote, WeeklyReview } from '../../growth/types';
import type { Annotation, Book, BookContent, Progress, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { GROWTH_STORES, db } from './db';

export const BACKUP_FORMAT = 'my-library-backup';
/** v2 added the Growth Library. v1 backups still restore. */
export const BACKUP_VERSION = 2;

interface BackupFile {
  bookId: string;
  name: string;
  type: string;
  base64: string;
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  books: Book[];
  contents: BookContent[];
  progress: Progress[];
  annotations: Annotation[];
  settings: Settings;
  files: BackupFile[];
  growth?: {
    books: GrowthBookState[];
    notes: GrowthNote[];
    days: DailyBlock[];
    reviews: WeeklyReview[];
    profile?: BusinessProfile;
  };
}

export interface ImportSummary {
  books: number;
  skippedBooks: number;
  annotations: number;
  progress: number;
  /** Growth Library records restored or updated (reading status, notes, daily blocks, reviews). */
  growth: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Builds a complete backup. Original files are optional because they can be large. */
export async function createBackup(includeOriginalFiles: boolean): Promise<Backup> {
  const d = await db();
  const [gBooks, gNotes, gDays, gReviews, gProfile] = await Promise.all([
    d.getAll('growthBooks'),
    d.getAll('growthNotes'),
    d.getAll('growthDays'),
    d.getAll('growthReviews'),
    d.get('kv', 'growthProfile') as Promise<BusinessProfile | undefined>,
  ]);
  const [books, contents, progress, annotations, settings] = await Promise.all([
    d.getAll('books'),
    d.getAll('contents'),
    d.getAll('progress'),
    d.getAll('annotations'),
    d.get('kv', 'settings') as Promise<Settings | undefined>,
  ]);
  const files: BackupFile[] = [];
  if (includeOriginalFiles) {
    for (const f of await d.getAll('files')) {
      files.push({ bookId: f.bookId, name: f.name, type: f.type, base64: bytesToBase64(new Uint8Array(f.data instanceof Blob ? await f.data.arrayBuffer() : f.data)) });
    }
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    books,
    contents,
    progress,
    annotations,
    settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
    files,
    growth: { books: gBooks, notes: gNotes, days: gDays, reviews: gReviews, ...(gProfile ? { profile: gProfile } : {}) },
  };
}

export async function exportBackupBlob(includeOriginalFiles: boolean): Promise<Blob> {
  return new Blob([JSON.stringify(await createBackup(includeOriginalFiles))], { type: 'application/json' });
}

export function parseBackup(text: string): Backup {
  let data: Backup;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a My Library backup (it is not valid JSON).');
  }
  if (data?.format !== BACKUP_FORMAT || !Array.isArray(data.books)) throw new Error('This file is not a My Library backup.');
  if (data.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of My Library. Update the app first.');
  return data;
}

/**
 * Restores a backup by merging it into the current library. Books already
 * present are kept, but newer progress and missing annotations are merged in.
 */
export async function restoreBackup(backup: Backup, opts: { restoreSettings?: boolean } = {}): Promise<ImportSummary> {
  const d = await db();
  const summary: ImportSummary = { books: 0, skippedBooks: 0, annotations: 0, progress: 0, growth: 0 };
  const contents = new Map(backup.contents.map((c) => [c.bookId, c]));
  const files = new Map((backup.files ?? []).map((f) => [f.bookId, f]));
  const tx = d.transaction(['books', 'contents', 'files', 'progress', 'annotations', 'kv', ...GROWTH_STORES], 'readwrite');

  for (const book of backup.books) {
    const content = contents.get(book.id);
    if (!content) continue;
    if (await tx.objectStore('books').get(book.id)) {
      summary.skippedBooks++;
    } else {
      await tx.objectStore('books').put(book);
      await tx.objectStore('contents').put(content);
      const f = files.get(book.id);
      if (f) await tx.objectStore('files').put({ bookId: f.bookId, name: f.name, type: f.type, data: base64ToBytes(f.base64).buffer });
      summary.books++;
    }
  }
  for (const p of backup.progress ?? []) {
    if (!(await tx.objectStore('books').get(p.bookId))) continue;
    const existing = await tx.objectStore('progress').get(p.bookId);
    if (!existing || existing.updatedAt < p.updatedAt) {
      await tx.objectStore('progress').put(p);
      summary.progress++;
    }
  }
  for (const a of backup.annotations ?? []) {
    if (!(await tx.objectStore('books').get(a.bookId))) continue;
    const existing = await tx.objectStore('annotations').get(a.id);
    if (!existing || existing.updatedAt < a.updatedAt) {
      await tx.objectStore('annotations').put(a);
      summary.annotations++;
    }
  }
  if (opts.restoreSettings && backup.settings) await tx.objectStore('kv').put({ ...DEFAULT_SETTINGS, ...backup.settings }, 'settings');

  // Growth Library: keep whichever copy of each record is newer.
  const g = backup.growth;
  if (g) {
    for (const s of g.books ?? []) {
      const cur = await tx.objectStore('growthBooks').get(s.bookId);
      if (!cur || cur.updatedAt < s.updatedAt) {
        await tx.objectStore('growthBooks').put(s);
        summary.growth++;
      }
    }
    for (const n of g.notes ?? []) {
      const cur = await tx.objectStore('growthNotes').get(n.id);
      if (!cur || cur.updatedAt < n.updatedAt) {
        await tx.objectStore('growthNotes').put(n);
        summary.growth++;
      }
    }
    for (const b of g.days ?? []) {
      const cur = await tx.objectStore('growthDays').get(b.date);
      const count = (x: typeof b) => Object.values(x.segments).filter(Boolean).length;
      if (!cur || count(cur) < count(b)) {
        await tx.objectStore('growthDays').put(b);
        summary.growth++;
      }
    }
    for (const r of g.reviews ?? []) {
      const cur = await tx.objectStore('growthReviews').get(r.week);
      if (!cur || cur.savedAt < r.savedAt) {
        await tx.objectStore('growthReviews').put(r);
        summary.growth++;
      }
    }
    if (opts.restoreSettings && g.profile) await tx.objectStore('kv').put(g.profile, 'growthProfile');
  }
  await tx.done;
  return summary;
}
