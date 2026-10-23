import { DEFAULT_KOKORO_VOICE } from '../core/audio/kokoroEngine';
import { updateBook } from '../core/storage/db';
import type { Book, NarratorPreset, Settings } from '../core/types';

/** Ready-made presets. All use natural voices, which keep playing with the screen locked. */
export const BUILT_IN_PRESETS: NarratorPreset[] = [
  { id: 'deep-focus', name: 'Deep Focus', engine: 'kokoro', voice: 'af_heart', rate: 1, pause: 'normal' },
  { id: 'business', name: 'Business Learning', engine: 'kokoro', voice: 'am_michael', rate: 1.25, pause: 'short' },
  { id: 'relaxed', name: 'Relaxed Listening', engine: 'kokoro', voice: 'af_bella', rate: 0.9, pause: 'long' },
  { id: 'fast-review', name: 'Fast Review', engine: 'kokoro', voice: 'af_heart', rate: 1.5, pause: 'short' },
];

export const allPresets = (settings: Settings): NarratorPreset[] => [...BUILT_IN_PRESETS, ...(settings.presets ?? [])];

export const presetFor = (book: Book, settings: Settings) => allPresets(settings).find((p) => p.id === book.narration?.presetId) ?? null;

/** The preset matching the book's current narration, if any (so a manual change shows no preset as active). */
export function activePreset(book: Book, settings: Settings): NarratorPreset | null {
  const p = presetFor(book, settings);
  if (!p) return null;
  const n = book.narration;
  const same =
    (n?.engine ?? 'device') === p.engine &&
    (p.engine === 'device' || (n?.voice ?? DEFAULT_KOKORO_VOICE) === p.voice) &&
    (n?.pause ?? settings.narrationPause) === p.pause &&
    Math.abs(settings.rate - p.rate) < 0.01;
  return same ? p : null;
}

/** On opening a book: use the speed of the preset last chosen for it. Voice and pauses are stored on the book. */
export async function applyBookPreset(book: Book, settings: Settings, update: (s: Partial<Settings>) => void) {
  const p = presetFor(book, settings);
  if (p && Math.abs(settings.rate - p.rate) > 0.001) update({ rate: p.rate });
}

/**
 * Switches a book to a preset. Returns the updated book and whether the
 * natural-voice audio has to be made again (voice or pauses changed).
 * Changing only the speed never regenerates audio.
 */
export async function choosePreset(
  book: Book,
  preset: NarratorPreset,
  settings: Settings,
  update: (s: Partial<Settings>) => void,
): Promise<{ book: Book; regenerates: boolean }> {
  const before = book.narration;
  const regenerates =
    preset.engine !== 'device' &&
    before?.engine === preset.engine &&
    ((before.voice ?? DEFAULT_KOKORO_VOICE) !== preset.voice || (before.pause ?? settings.narrationPause) !== preset.pause);
  const narration = { engine: preset.engine, voice: preset.voice ?? before?.voice, pause: preset.pause, presetId: preset.id };
  const next = (await updateBook(book.id, { narration })) ?? { ...book, narration };
  update({ rate: preset.rate });
  return { book: next, regenerates };
}

export function newPresetId() {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
