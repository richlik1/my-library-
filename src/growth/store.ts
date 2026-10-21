import { newId } from '../core/id';
import { db } from '../core/storage/db';
import { emptyState } from './plan';
import { DEFAULT_PROFILE, type BusinessProfile, type DailyBlock, type GrowthBookState, type GrowthNote, type WeeklyReview } from './types';

/** Growth Library persistence (same private on-device database as the books). */

export async function listStates(): Promise<Map<string, GrowthBookState>> {
  const all = await (await db()).getAll('growthBooks');
  return new Map(all.map((s) => [s.bookId, s]));
}

export async function getState(bookId: string): Promise<GrowthBookState> {
  return (await (await db()).get('growthBooks', bookId)) ?? emptyState(bookId);
}

export async function updateState(bookId: string, patch: Partial<GrowthBookState>): Promise<GrowthBookState> {
  const d = await db();
  const cur = (await d.get('growthBooks', bookId)) ?? emptyState(bookId);
  const next: GrowthBookState = { ...cur, ...patch, bookId, updatedAt: Date.now() };
  if (patch.status === 'reading' && !cur.startedAt) next.startedAt = Date.now();
  if (patch.status === 'finished' && cur.status !== 'finished') next.finishedAt = Date.now();
  await d.put('growthBooks', next);
  return next;
}

export async function listNotes(): Promise<GrowthNote[]> {
  const all = await (await db()).getAll('growthNotes');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveNote(n: Omit<GrowthNote, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<GrowthNote, 'id' | 'createdAt'>>): Promise<GrowthNote> {
  const now = Date.now();
  const full: GrowthNote = { ...n, id: n.id ?? newId(), createdAt: n.createdAt ?? now, updatedAt: now };
  await (await db()).put('growthNotes', full);
  return full;
}

export async function deleteNote(id: string) {
  await (await db()).delete('growthNotes', id);
}

export async function listBlocks(): Promise<DailyBlock[]> {
  return (await db()).getAll('growthDays');
}

export async function getBlock(date: string) {
  return (await db()).get('growthDays', date);
}

export async function saveBlock(b: DailyBlock) {
  await (await db()).put('growthDays', b);
}

export async function listReviews(): Promise<WeeklyReview[]> {
  const all = await (await db()).getAll('growthReviews');
  return all.sort((a, b) => b.week.localeCompare(a.week));
}

export async function saveReview(r: WeeklyReview) {
  await (await db()).put('growthReviews', { ...r, savedAt: Date.now() });
}

export async function getProfile(): Promise<BusinessProfile> {
  const p = (await (await db()).get('kv', 'growthProfile')) as Partial<BusinessProfile> | undefined;
  return { ...DEFAULT_PROFILE, ...(p ?? {}) };
}

export async function saveProfile(p: BusinessProfile) {
  await (await db()).put('kv', p, 'growthProfile');
}
