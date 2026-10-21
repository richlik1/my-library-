import type { Chapter, Position } from '../types';
import { type Chunk, chunkAt, chunkText, wordStart } from './chunker';
import { isSequenceEngine, type SequenceItem, type SpeakOptions, type SpeechEngine, type SpeechErrorCode } from './engine';

export type NarratorStatus = 'idle' | 'playing' | 'paused' | 'ended';

export type SleepTimer = { mode: 'off' } | { mode: 'time'; endsAt: number } | { mode: 'chapter' };

export interface NarratorState {
  status: NarratorStatus;
  chapter: number;
  chunkIndex: number;
  /** Absolute character offset in the current chapter (word-accurate when the voice reports word boundaries). */
  offset: number;
  chunks: Chunk[];
  /** A message for the listener when playback stopped unexpectedly. */
  notice: string | null;
  sleep: SleepTimer;
}

type Listener = (s: NarratorState) => void;

interface NarratorOptions extends SpeakOptions {
  /** Injected for tests; defaults to `document.hidden`. */
  isHidden?: () => boolean;
  startTimeoutMs?: number;
  /** Identifies the book for engines that save the position natively. */
  key?: string;
}

const MAX_RETRIES_PER_CHUNK = 2;
const MAX_CONSECUTIVE_FAILURES = 6;
/** Sentences handed to a native queue at once (~10+ hours of listening). */
const MAX_SEQUENCE_ITEMS = 4000;

/**
 * Drives narration of a book: walks chunks and chapters, recovers from
 * engine failures, and reports an exact position for saving.
 * Independent of React and of the speech engine implementation.
 */
export class Narrator {
  private listeners = new Set<Listener>();
  private chunkCache = new Map<number, Chunk[]>();
  private state: NarratorState;
  private opts: NarratorOptions;
  private gen = 0;
  private retries = 0;
  private consecutiveFailures = 0;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private readonly engine: SpeechEngine,
    private readonly chapters: Chapter[],
    opts: NarratorOptions,
    start: Position = { chapter: 0, offset: 0 },
  ) {
    this.opts = { startTimeoutMs: 6000, isHidden: () => typeof document !== 'undefined' && document.hidden, ...opts };
    const chapter = Math.min(Math.max(0, start.chapter), Math.max(0, chapters.length - 1));
    const chunks = this.chunksFor(chapter);
    const offset = Math.max(0, Math.min(start.offset, chapters[chapter]?.text.length ?? 0));
    this.state = { status: 'idle', chapter, chunkIndex: chunkAt(chunks, offset), offset, chunks, notice: null, sleep: { mode: 'off' } };
  }

  // ---- public API ------------------------------------------------------------

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  getState(): NarratorState {
    return this.state;
  }

  get position(): Position {
    return { chapter: this.state.chapter, offset: this.state.offset };
  }

  /** Must be called from a user gesture the first time (iOS requirement). */
  play() {
    if (this.destroyed || !this.chapters.length) return;
    if (this.state.status === 'ended') this.seek({ chapter: 0, offset: 0 });
    this.retries = 0;
    this.consecutiveFailures = 0;
    this.set({ status: 'playing', notice: null });
    this.speakCurrent();
  }

  pause(notice: string | null = null) {
    this.gen++;
    this.clearTimers();
    this.engine.cancel();
    if (this.state.status === 'playing' || notice) this.set({ status: 'paused', notice });
  }

  toggle() {
    if (this.state.status === 'playing') this.pause();
    else this.play();
  }

  /** Jumps to a position; keeps playing if we were playing. */
  seek(pos: Position, autoplay = this.state.status === 'playing') {
    const chapter = Math.min(Math.max(0, pos.chapter), this.chapters.length - 1);
    const chunks = this.chunksFor(chapter);
    const offset = Math.max(0, Math.min(pos.offset, this.chapters[chapter].text.length));
    this.gen++;
    this.clearTimers();
    this.engine.cancel();
    const status: NarratorStatus = autoplay ? 'playing' : this.state.status === 'idle' ? 'idle' : 'paused';
    this.set({ chapter, chunks, offset, chunkIndex: chunkAt(chunks, offset), status, notice: null });
    if (autoplay) {
      this.retries = 0;
      this.speakCurrent();
    }
  }

  /** Moves by whole chunks (sentences). Crosses chapter boundaries. */
  skip(delta: number) {
    let { chapter, chunkIndex } = this.state;
    // "Back" from the middle of a sentence first restarts that sentence.
    const cur = this.state.chunks[chunkIndex];
    if (delta < 0 && cur && this.state.offset - cur.start > 12) delta += 1;
    chunkIndex += delta;
    while (chunkIndex < 0 && chapter > 0) {
      chapter--;
      chunkIndex += this.chunksFor(chapter).length;
    }
    while (chunkIndex >= this.chunksFor(chapter).length && chapter < this.chapters.length - 1) {
      chunkIndex -= this.chunksFor(chapter).length;
      chapter++;
    }
    const chunks = this.chunksFor(chapter);
    chunkIndex = Math.max(0, Math.min(chunkIndex, chunks.length - 1));
    this.seek({ chapter, offset: chunks[chunkIndex]?.start ?? 0 });
  }

  nextChapter() {
    if (this.state.chapter < this.chapters.length - 1) this.seek({ chapter: this.state.chapter + 1, offset: 0 });
  }

  prevChapter() {
    const startOfThis = this.state.offset > 200 || this.state.chunkIndex > 1;
    this.seek({ chapter: startOfThis ? this.state.chapter : Math.max(0, this.state.chapter - 1), offset: 0 });
  }

  /** Voice / rate / pitch changes take effect immediately, from the current word. */
  setOptions(opts: Partial<SpeakOptions>) {
    this.opts = { ...this.opts, ...opts };
    if (this.state.status === 'playing') {
      this.gen++;
      this.clearTimers(false);
      this.engine.cancel();
      this.retries = 0;
      this.speakCurrent();
    }
  }

  setSleepTimer(mode: 'off' | 'chapter' | number) {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    if (isSequenceEngine(this.engine)) {
      // The native engine keeps time even while the app is in the background.
      this.engine.setSleepTimer(mode);
      this.set({ sleep: mode === 'off' ? { mode: 'off' } : mode === 'chapter' ? { mode: 'chapter' } : { mode: 'time', endsAt: Date.now() + mode * 60_000 } });
      return;
    }
    if (mode === 'off') this.set({ sleep: { mode: 'off' } });
    else if (mode === 'chapter') this.set({ sleep: { mode: 'chapter' } });
    else {
      const endsAt = Date.now() + mode * 60_000;
      this.set({ sleep: { mode: 'time', endsAt } });
      this.sleepTimer = setTimeout(() => this.fireSleep(), mode * 60_000);
    }
  }

  /** Call when the page becomes visible again: iOS stops speech in the background. */
  handleVisible() {
    if (this.state.status !== 'playing' || isSequenceEngine(this.engine)) return;
    if (!this.engine.isSpeaking()) {
      this.gen++;
      this.clearTimers(false);
      this.retries = 0;
      this.speakCurrent();
    }
  }

  destroy() {
    this.destroyed = true;
    this.gen++;
    this.clearTimers();
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.engine.cancel();
    this.listeners.clear();
  }

  // ---- internals --------------------------------------------------------------

  private chunksFor(chapter: number): Chunk[] {
    let c = this.chunkCache.get(chapter);
    if (!c) {
      c = chunkText(this.chapters[chapter]?.text ?? '');
      this.chunkCache.set(chapter, c);
    }
    return c;
  }

  private set(patch: Partial<NarratorState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  private clearTimers(includeSleep = false) {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.endTimer) clearTimeout(this.endTimer);
    this.startTimer = this.endTimer = null;
    if (includeSleep && this.sleepTimer) clearTimeout(this.sleepTimer);
  }

  private fireSleep() {
    this.sleepTimer = null;
    this.set({ sleep: { mode: 'off' } });
    if (this.state.status === 'playing') this.pause('Sleep timer ended. Tap play to continue.');
  }

  private speakCurrent() {
    if (isSequenceEngine(this.engine)) {
      this.speakSequence();
      return;
    }
    const { chunks, chunkIndex, chapter } = this.state;
    const chunk = chunks[chunkIndex];
    if (!chunk) {
      this.finishChapter();
      return;
    }
    const text = this.chapters[chapter].text;
    let from = Math.max(chunk.start, wordStart(text, this.state.offset, chunk.start));
    if (from >= chunk.end - 1) from = chunk.start;
    const spoken = text.slice(from, chunk.end);
    const myGen = ++this.gen;
    let started = false;
    if (this.state.offset !== from) this.set({ offset: from });

    this.clearTimers();
    this.startTimer = setTimeout(() => {
      if (myGen !== this.gen || started) return;
      if (this.engine.isSpeaking()) return; // audio is running, the engine just didn't tell us
      this.onFailure(myGen, 'unknown', 'did-not-start');
    }, this.opts.startTimeoutMs);

    this.engine.speak(spoken, { voiceId: this.opts.voiceId, rate: this.opts.rate, pitch: this.opts.pitch }, {
      onStart: () => {
        if (myGen !== this.gen) return;
        started = true;
        if (this.startTimer) clearTimeout(this.startTimer);
        this.armEndWatchdog(myGen, spoken.length);
      },
      onBoundary: (ci) => {
        if (myGen !== this.gen) return;
        const offset = Math.min(chunk.end, from + ci);
        if (offset > this.state.offset) this.set({ offset });
      },
      onEnd: () => {
        if (myGen !== this.gen) return;
        this.retries = 0;
        this.consecutiveFailures = 0;
        this.advance();
      },
      onError: (code, detail) => {
        if (myGen !== this.gen) return;
        this.onFailure(myGen, code, detail);
      },
    });
  }

  /**
   * Native engines get the rest of the book as one queue so narration keeps
   * going while the app is in the background; we just mirror its progress.
   */
  private speakSequence() {
    if (!isSequenceEngine(this.engine)) return;
    const { chapter, chunkIndex, offset } = this.state;
    const items: SequenceItem[] = [];
    const map: Array<{ chapter: number; chunkIndex: number; start: number }> = [];
    for (let ch = chapter; ch < this.chapters.length && items.length < MAX_SEQUENCE_ITEMS; ch++) {
      const chunks = this.chunksFor(ch);
      const text = this.chapters[ch].text;
      for (let i = ch === chapter ? chunkIndex : 0; i < chunks.length && items.length < MAX_SEQUENCE_ITEMS; i++) {
        const c = chunks[i];
        let from = c.start;
        if (ch === chapter && i === chunkIndex) {
          from = Math.max(c.start, wordStart(text, offset, c.start));
          if (from >= c.end - 1) from = c.start;
        }
        items.push({ text: text.slice(from, c.end), chapter: ch, start: from });
        map.push({ chapter: ch, chunkIndex: i, start: from });
      }
    }
    this.clearTimers();
    if (!items.length) {
      this.gen++;
      this.set({ status: 'ended', notice: null });
      return;
    }
    const myGen = ++this.gen;
    const live = () => myGen === this.gen;
    this.engine.speakSequence(
      this.opts.key ?? '',
      items,
      { voiceId: this.opts.voiceId, rate: this.opts.rate, pitch: this.opts.pitch },
      {
        onItemStart: (i) => {
          const m = map[i];
          if (!live() || !m) return;
          this.set({ chapter: m.chapter, chunks: this.chunksFor(m.chapter), chunkIndex: m.chunkIndex, offset: m.start });
        },
        onBoundary: (i, ci) => {
          const m = map[i];
          if (!live() || !m || m.chapter !== this.state.chapter || m.chunkIndex !== this.state.chunkIndex) return;
          if (m.start + ci > this.state.offset) this.set({ offset: m.start + ci });
        },
        onDone: () => {
          if (!live()) return;
          const last = map[map.length - 1];
          const lastChunks = this.chunksFor(last.chapter);
          if (last.chunkIndex + 1 < lastChunks.length) {
            this.set({ chapter: last.chapter, chunks: lastChunks, chunkIndex: last.chunkIndex + 1, offset: lastChunks[last.chunkIndex + 1].start });
            this.speakSequence();
          } else if (last.chapter + 1 < this.chapters.length) {
            this.set({ chapter: last.chapter + 1, chunks: this.chunksFor(last.chapter + 1), chunkIndex: 0, offset: 0 });
            this.speakSequence();
          } else {
            this.gen++;
            this.set({ status: 'ended', notice: null, sleep: { mode: 'off' } });
          }
        },
        onPaused: (reason) => {
          if (!live()) return;
          const notice =
            reason === 'interrupted'
              ? 'Narration was interrupted by a call or another app. Tap play to continue.'
              : reason === 'sleep'
                ? 'Sleep timer ended. Tap play to continue.'
                : reason === 'sleep-chapter'
                  ? 'Sleep timer: stopped at the end of the chapter.'
                  : null;
          this.set({ status: 'paused', notice, sleep: reason.startsWith('sleep') ? { mode: 'off' } : this.state.sleep });
        },
        onResumed: () => {
          if (live()) this.set({ status: 'playing', notice: null });
        },
      },
      this.chapters.map((c) => c.title),
    );
  }

  /** If the engine never reports the end of an utterance, move on anyway. */
  private armEndWatchdog(myGen: number, chars: number, attempt = 0) {
    const expected = (chars / (14 * Math.max(0.3, this.opts.rate))) * 1000;
    this.endTimer = setTimeout(() => {
      if (myGen !== this.gen) return;
      if (this.opts.isHidden?.()) return this.armEndWatchdog(myGen, chars, attempt);
      if (this.engine.isSpeaking() && attempt < 3) return this.armEndWatchdog(myGen, chars, attempt + 1);
      this.advance();
    }, expected * 2 + 5000);
  }

  private onFailure(myGen: number, code: SpeechErrorCode, detail?: string) {
    if (myGen !== this.gen) return;
    this.clearTimers();
    if (code === 'interrupted') {
      // Something outside the app (a call, Siri, another app's audio, the
      // screen locking) stopped speech. Keep the exact position.
      if (this.opts.isHidden?.()) return; // handleVisible() resumes when we're back
      this.pause('Narration was interrupted. Tap play to continue.');
      return;
    }
    if (code === 'not-allowed') {
      this.pause('Your browser needs a tap before it can speak. Tap play to continue.');
      return;
    }
    if (code === 'voice-unavailable' && this.opts.voiceId) {
      this.opts = { ...this.opts, voiceId: null };
      this.set({ notice: 'The selected voice is not available on this device — using the default voice.' });
      this.speakCurrent();
      return;
    }
    if (detail === 'did-not-start' && this.opts.isHidden?.()) return;
    this.retries++;
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      this.pause(
        detail === 'did-not-start'
          ? 'Speech did not start. Tap play to try again. On iPhone, check the ring/silent switch and volume.'
          : 'Speech keeps failing on this device. Try another voice in Voice settings, then tap play.',
      );
      return;
    }
    if (this.retries <= MAX_RETRIES_PER_CHUNK) {
      this.engine.cancel();
      setTimeout(() => myGen === this.gen && this.speakCurrent(), 300);
      return;
    }
    // This sentence can't be spoken: skip it rather than stopping the book.
    this.retries = 0;
    this.set({ notice: 'One sentence could not be spoken and was skipped.' });
    this.advance();
  }

  private advance() {
    const { chunks, chunkIndex } = this.state;
    const cur = chunks[chunkIndex];
    if (chunkIndex + 1 < chunks.length) {
      this.set({ chunkIndex: chunkIndex + 1, offset: chunks[chunkIndex + 1].start });
      this.speakCurrent();
    } else {
      if (cur) this.set({ offset: cur.end });
      this.finishChapter();
    }
  }

  private finishChapter() {
    const next = this.state.chapter + 1;
    if (next >= this.chapters.length) {
      this.gen++;
      this.clearTimers();
      this.set({ status: 'ended', notice: null });
      return;
    }
    const chunks = this.chunksFor(next);
    this.set({ chapter: next, chunks, chunkIndex: 0, offset: 0 });
    if (this.state.sleep.mode === 'chapter') {
      this.set({ sleep: { mode: 'off' } });
      this.pause('Sleep timer: stopped at the end of the chapter.');
      return;
    }
    this.speakCurrent();
  }
}

/** Fraction of the whole book completed at a position. */
export function bookPercent(chapters: Chapter[], pos: Position): number {
  const total = chapters.reduce((s, c) => s + c.text.length, 0);
  if (!total) return 0;
  let before = 0;
  for (let i = 0; i < pos.chapter && i < chapters.length; i++) before += chapters[i].text.length;
  return Math.min(1, (before + pos.offset) / total);
}
