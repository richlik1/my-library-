import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioNarrator } from '../../core/audio/audioNarrator';
import type { PlaybackController } from '../../core/speech/controller';
import { Narrator, bookPercent, type NarratorState } from '../../core/speech/narrator';
import { addListening, awardXp, getAudioWav, getChapterAudio, saveProgress, updateBook } from '../../core/storage/db';
import { ListeningTracker, XP_RULES, xpIds } from '../../core/habits';
import { habitsChanged } from './useHabits';
import { audioQueue } from '../narration';
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
export function usePlayback(book: Book, chapters: Chapter[], start: Position, voiceId: string | null, mode: 'device' | 'kokoro' = 'device') {
  const { settings } = useSettings();
  const [narrator, setNarrator] = useState<PlaybackController | null>(null);
  const [state, setState] = useState<NarratorState | null>(null);
  const lastSaved = useRef<string>('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = useRef({ start, voiceId, rate: settings.rate, pitch: settings.pitch });
  const rateRef = useRef(settings.rate);
  rateRef.current = settings.rate;

  const persist = useCallback(
    (s: NarratorState) => {
      const pos = { chapter: s.chapter, offset: s.offset };
      const key = `${pos.chapter}:${pos.offset}:${s.status}`;
      if (key === lastSaved.current) return;
      lastSaved.current = key;
      const finished = s.status === 'ended';
      if (finished)
        void awardXp({ id: xpIds.book(book.id), kind: 'book', amount: XP_RULES.bookCompleted, at: Date.now(), label: `Finished ${book.title}` }).then(habitsChanged);
      saveProgress({
        bookId: book.id,
        ...(finished ? { chapter: 0, offset: 0 } : pos),
        percent: finished ? 1 : bookPercent(chapters, pos),
        updatedAt: Date.now(),
        finished,
      }).catch(() => undefined);
    },
    [book.id, book.title, chapters],
  );

  // Where we are, so switching between device speech and audio files keeps the place.
  const lastPosition = useRef<Position>(start);

  useEffect(() => {
    const { start: _ignored, ...opts } = initial.current;
    const pos = lastPosition.current;
    const n: PlaybackController =
      mode === 'kokoro'
        ? new AudioNarrator(
            {
              bookId: book.id,
              chapters,
              getChapterAudio: (c) => getChapterAudio(book.id, c),
              getWav: getAudioWav,
              requestAudio: (chs, startOffset) => {
                audioQueue.enqueue(book.id, chs, { startOffset });
                audioQueue.prioritize(book.id, chs[0]);
              },
            },
            { rate: settings.rate },
            pos,
          )
        : new Narrator(speechEngine, chapters, { ...opts, key: book.id }, pos);
    // Tell the audio player as soon as more of a chapter it may be waiting for has been made.
    const seenParts = new Map<number, number>();
    const unsubQueue =
      n instanceof AudioNarrator
        ? audioQueue.subscribe((jobs) =>
            jobs.forEach((j) => {
              if (j.bookId !== book.id) return;
              const made = (j.partsDone ?? 0) + (j.status === 'done' ? 1000 : 0);
              if (made === seenParts.get(j.chapter) || made === 0) return;
              seenParts.set(j.chapter, made);
              n.audioReady(j.chapter);
            }),
          )
        : () => undefined;
    setNarrator(n);
    updateBook(book.id, { lastOpenedAt: Date.now() }).catch(() => undefined);
    // Listening time for goals and XP: measured from real playback only.
    const tracker = new ListeningTracker((bookId, secs, at) => void addListening(bookId, secs, at).then(habitsChanged, () => undefined));
    const sample = () => {
      const s = n.getState();
      tracker.update({
        bookId: book.id,
        playing: s.status === 'playing' && !s.waitingForAudio,
        mediaTime: n.kind === 'audio' ? s.time : undefined,
        chapter: s.chapter,
        rate: rateRef.current,
      });
    };
    const tick = setInterval(sample, 1000);
    const unsub = n.subscribe((s) => {
      setState(s);
      sample();
      lastPosition.current = { chapter: s.chapter, offset: s.offset };
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
    const flush = () => {
      persist(n.getState());
      tracker.flush();
    };
    const onVisibility = () => {
      if (document.hidden) flush();
      else n.handleVisible();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      clearInterval(tick);
      tracker.update({ bookId: book.id, playing: false, chapter: 0, rate: 1 });
      flush();
      unsub();
      unsubQueue();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      n.destroy();
    };
  }, [book.id, chapters, persist, mode]);

  // Voice / speed / pitch changes apply immediately.
  useEffect(() => {
    narrator?.setOptions({ voiceId, rate: settings.rate, pitch: settings.pitch });
  }, [narrator, voiceId, settings.rate, settings.pitch]);

  // Keep the screen awake while narrating: browser speech stops when an iPhone locks.
  const playing = state?.status === 'playing';
  useEffect(() => {
    // The iOS app keeps narrating with the screen locked, so it doesn't need this.
    // Audio files keep playing with the screen locked, so they don't need it either.
    if (!playing || !settings.keepAwake || isNativeApp() || mode === 'kokoro' || !('wakeLock' in navigator)) return;
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
  }, [playing, settings.keepAwake, mode]);

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
        ['seekbackward', () => (narrator.skipSeconds ? narrator.skipSeconds(-15) : narrator.skip(-1))],
        ['seekforward', () => (narrator.skipSeconds ? narrator.skipSeconds(30) : narrator.skip(1))],
      ];
      for (const [a, h] of handlers) {
        try {
          ms.setActionHandler(a, h);
        } catch {
          /* unsupported action */
        }
      }
      ms.playbackState = playing ? 'playing' : 'paused';
      // Lock Screen scrubber for audio files.
      if (narrator.kind === 'audio' && state?.duration) {
        try {
          ms.setPositionState({ duration: state.duration, position: Math.min(state.time ?? 0, state.duration), playbackRate: settings.rate });
        } catch {
          /* not supported */
        }
      }
    } catch {
      /* Media Session not usable */
    }
  }, [book, chapters, narrator, playing, state?.chapter, state?.duration, Math.floor((state?.time ?? 0) / 5), settings.rate]);

  return { narrator, state };
}
