import { useCallback, useEffect, useRef, useState } from 'react';
import { Narrator, bookPercent, type NarratorState } from '../../core/speech/narrator';
import { saveProgress, updateBook } from '../../core/storage/db';
import type { Book, Chapter, Position } from '../../core/types';
import { isSequenceEngine } from '../../core/speech/engine';
import { speechEngine } from '../engine';
import { isNativeApp } from '../platform';
import { useSettings } from './settings';

type WakeLockSentinelLike = { release(): Promise<void>; released?: boolean };

/**
 * Connects a Narrator to React: progress saving, settings, wake lock,
 * Media Session metadata and foreground/background handling.
 */
export function usePlayback(book: Book, chapters: Chapter[], start: Position, voiceId: string | null) {
  const { settings } = useSettings();
  const [narrator, setNarrator] = useState<Narrator | null>(null);
  const [state, setState] = useState<NarratorState | null>(null);
  const lastSaved = useRef<string>('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = useRef({ start, voiceId, rate: settings.rate, pitch: settings.pitch });

  const persist = useCallback(
    (s: NarratorState) => {
      const pos = { chapter: s.chapter, offset: s.offset };
      const key = `${pos.chapter}:${pos.offset}:${s.status}`;
      if (key === lastSaved.current) return;
      lastSaved.current = key;
      const finished = s.status === 'ended';
      saveProgress({
        bookId: book.id,
        ...(finished ? { chapter: 0, offset: 0 } : pos),
        percent: finished ? 1 : bookPercent(chapters, pos),
        updatedAt: Date.now(),
        finished,
      }).catch(() => undefined);
    },
    [book.id, chapters],
  );

  useEffect(() => {
    const { start: pos, ...opts } = initial.current;
    const n = new Narrator(speechEngine, chapters, { ...opts, key: book.id }, pos);
    setNarrator(n);
    updateBook(book.id, { lastOpenedAt: Date.now() }).catch(() => undefined);
    const unsub = n.subscribe((s) => {
      setState(s);
      // Save at most every 1.5 s while playing, immediately on pause/stop.
      if (s.status !== 'playing') {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = null;
        if (s.status !== 'idle' || s.offset > 0 || s.chapter > 0) persist(s);
      } else if (!saveTimer.current) {
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null;
          persist(n.getState());
        }, 1500);
      }
    });
    const flush = () => persist(n.getState());
    const onVisibility = () => {
      if (document.hidden) flush();
      else n.handleVisible();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      unsub();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      n.destroy();
    };
  }, [book.id, chapters, persist]);

  // Voice / speed / pitch changes apply immediately.
  useEffect(() => {
    narrator?.setOptions({ voiceId, rate: settings.rate, pitch: settings.pitch });
  }, [narrator, voiceId, settings.rate, settings.pitch]);

  // Keep the screen awake while narrating: browser speech stops when an iPhone locks.
  const playing = state?.status === 'playing';
  useEffect(() => {
    // The iOS app keeps narrating with the screen locked, so it doesn't need this.
    if (!playing || !settings.keepAwake || isNativeApp() || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const l = await (navigator as Navigator & { wakeLock: { request(t: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock.request('screen');
        if (cancelled) l.release().catch(() => undefined);
        else lock = l;
      } catch {
        /* not allowed right now */
      }
    };
    acquire();
    const onVis = () => !document.hidden && (!lock || lock.released) && acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => undefined);
    };
  }, [playing, settings.keepAwake]);

  // Media Session: headphone / keyboard media keys where the browser supports it.
  useEffect(() => {
    if (!narrator) return;
    if (isSequenceEngine(speechEngine)) {
      // Lock Screen / Control Center info is handled natively in the iOS app.
      speechEngine.setNowPlaying({ title: book.title, artist: book.author || 'My Library', artwork: book.cover });
      return;
    }
    const ms = navigator.mediaSession;
    if (!ms) return;
    try {
      ms.metadata = new MediaMetadata({
        title: book.title,
        artist: book.author || 'My Library',
        album: chapters[state?.chapter ?? 0]?.title ?? '',
        artwork: book.cover ? [{ src: book.cover, sizes: '400x600', type: book.cover.slice(5, book.cover.indexOf(';')) }] : [],
      });
      const handlers: Array<[MediaSessionAction, () => void]> = [
        ['play', () => narrator.play()],
        ['pause', () => narrator.pause()],
        ['previoustrack', () => narrator.prevChapter()],
        ['nexttrack', () => narrator.nextChapter()],
        ['seekbackward', () => narrator.skip(-1)],
        ['seekforward', () => narrator.skip(1)],
      ];
      for (const [a, h] of handlers) {
        try {
          ms.setActionHandler(a, h);
        } catch {
          /* unsupported action */
        }
      }
      ms.playbackState = playing ? 'playing' : 'paused';
    } catch {
      /* Media Session not usable */
    }
  }, [book, chapters, narrator, playing, state?.chapter]);

  return { narrator, state };
}
