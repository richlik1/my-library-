import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { VoiceInfo } from '../../core/speech/engine';
import { isSequenceEngine } from '../../core/speech/engine';
import type { PlaybackController } from '../../core/speech/controller';
import type { NarratorState } from '../../core/speech/narrator';
import { getBook, getContent, getProgress, updateBook } from '../../core/storage/db';
import { DEFAULT_PIPER_VOICE } from '../../core/audio/piper';
import { kokoroUnavailable } from '../narration';
import type { Book, Chapter, Position } from '../../core/types';
import { speechEngine } from '../engine';
import { applyBookPreset } from '../presets';
import { useSettings } from './settings';
import { usePlayback } from './usePlayback';
import { ambient } from '../ambient';
import { pickDefaultVoice, useVoices } from './useVoices';

interface Session {
  book: Book;
  chapters: Chapter[];
  start: Position;
}

interface PlaybackSession {
  /** The book being listened to; it keeps playing while you browse the app. */
  session: Session | null;
  narrator: PlaybackController | null;
  state: NarratorState | null;
  voices: VoiceInfo[];
  voiceId: string | null;
  /** Loads a book into the player (no-op if it's already there). */
  open(id: string): Promise<'ok' | 'missing'>;
  /** Updates the book shown/used by the player (e.g. after changing its narration). */
  setBook(b: Book): void;
  /** Stops and unloads the current book. */
  close(): void;
  /** Uses corrected chapter text (the player restarts at the same place). */
  replaceChapters(bookId: string, chapters: Chapter[]): void;
}

const Ctx = createContext<PlaybackSession | null>(null);

export function usePlaybackSession(): PlaybackSession {
  const c = useContext(Ctx);
  if (!c) throw new Error('PlaybackProvider missing');
  return c;
}

async function loadSession(id: string): Promise<Session | null> {
  const [stored, content, progress] = await Promise.all([getBook(id), getContent(id), getProgress(id)]);
  let book = stored;
  if (!book || !content) return null;
  if (book.narration?.engine === 'kokoro' && kokoroUnavailable()) {
    // Kokoro doesn't work on this device: use the fast natural voice so the book reads.
    const narration = { ...book.narration, engine: 'piper' as const, voice: DEFAULT_PIPER_VOICE };
    await updateBook(id, { narration });
    book = { ...book, narration };
  }
  let start = progress && !progress.finished ? { chapter: progress.chapter, offset: progress.offset } : { chapter: 0, offset: 0 };
  // The iOS app also saves the position natively, which survives the app
  // being closed while narrating in the background. Use whichever is newer.
  if (isSequenceEngine(speechEngine)) {
    const native = await speechEngine.getSavedPosition(id);
    if (native && native.updatedAt > (progress?.updatedAt ?? 0) && native.chapter < content.chapters.length)
      start = { chapter: native.chapter, offset: native.offset };
  }
  return { book, chapters: content.chapters, start };
}

/**
 * Holds the book being listened to at the app level, so narration continues
 * while you move between Home, Library and the other tabs, with a mini-player.
 */
export function PlaybackProvider({ children }: { children: ReactNode }) {
  const { settings, loaded, update } = useSettings();
  const voices = useVoices(speechEngine);
  const voiceId = useMemo(() => {
    if (settings.voiceURI && voices.some((v) => v.id === settings.voiceURI)) return settings.voiceURI;
    return pickDefaultVoice(voices)?.id ?? null;
  }, [settings.voiceURI, voices]);
  const [session, setSession] = useState<Session | null>(null);
  const [live, setLive] = useState<{ narrator: PlaybackController | null; state: NarratorState | null }>({ narrator: null, state: null });
  const current = useRef<Session | null>(null);
  current.current = session;
  const pending = useRef<Map<string, Promise<'ok' | 'missing'>>>(new Map());

  const open = useCallback(
    (id: string) => {
      if (current.current?.book.id === id) return Promise.resolve<'ok'>('ok');
      const existing = pending.current.get(id);
      if (existing) return existing;
      const p = loadSession(id)
        .then(async (s) => {
          if (!s) return 'missing' as const;
          // Use the narrator preset last chosen for this book.
          await applyBookPreset(s.book, settings, update);
          setLive({ narrator: null, state: null });
          setSession(s);
          return 'ok' as const;
        })
        .catch(() => 'missing' as const)
        .finally(() => pending.current.delete(id));
      pending.current.set(id, p);
      return p;
    },
    [settings, update],
  );

  const replaceChapters = useCallback((bookId: string, chapters: Chapter[]) => setSession((s) => (s && s.book.id === bookId ? { ...s, chapters } : s)), []);
  const setBook = useCallback((b: Book) => setSession((s) => (s && s.book.id === b.id ? { ...s, book: b } : s)), []);
  const close = useCallback(() => {
    setSession(null);
    setLive({ narrator: null, state: null });
  }, []);

  const value = useMemo<PlaybackSession>(
    () => ({ session, narrator: live.narrator, state: live.state, voices, voiceId, open, setBook, close, replaceChapters }),
    [session, live, voices, voiceId, open, setBook, close, replaceChapters],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {session && loaded && <SessionHost key={session.book.id} session={session} voiceId={voiceId} onLive={setLive} />}
    </Ctx.Provider>
  );
}

function SessionHost({
  session,
  voiceId,
  onLive,
}: {
  session: Session;
  voiceId: string | null;
  onLive(l: { narrator: PlaybackController | null; state: NarratorState | null }): void;
}) {
  const mode = session.book.narration?.engine ?? 'device';
  const { narrator, state } = usePlayback(session.book, session.chapters, session.start, voiceId, mode);
  const { settings } = useSettings();
  useEffect(() => onLive({ narrator, state }), [narrator, state, onLive]);
  // Background sound follows narration: on while it plays, faded out when it pauses or the book closes.
  useEffect(() => ambient.set(settings.ambient, settings.ambientVolume), [settings.ambient, settings.ambientVolume]);
  const audible = state?.status === 'playing' && !state.waitingForAudio;
  useEffect(() => ambient.setActive(!!audible), [audible]);
  useEffect(() => () => ambient.setActive(false), []);
  return null;
}
