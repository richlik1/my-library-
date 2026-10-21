import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SequenceHandlers, SequenceItem, SequenceSpeechEngine, SpeakHandlers, SpeakOptions, SpeechEngine, VoiceInfo } from '../src/core/speech/engine';
import { Narrator, bookPercent } from '../src/core/speech/narrator';
import type { Chapter } from '../src/core/types';

class FakeEngine implements SpeechEngine {
  readonly id = 'fake';
  spoken: Array<{ text: string; opts: SpeakOptions }> = [];
  handlers: SpeakHandlers | null = null;
  speaking = false;
  cancels = 0;
  isSupported() {
    return true;
  }
  getVoices(): VoiceInfo[] {
    return [];
  }
  onVoicesChanged() {
    return () => undefined;
  }
  speak(text: string, opts: SpeakOptions, h: SpeakHandlers) {
    this.spoken.push({ text, opts });
    this.handlers = h;
  }
  cancel() {
    this.cancels++;
    this.handlers = null;
    this.speaking = false;
  }
  isSpeaking() {
    return this.speaking;
  }
  // helpers
  start() {
    this.speaking = true;
    this.handlers?.onStart();
  }
  finish() {
    const h = this.handlers;
    this.speaking = false;
    h?.onStart();
    h?.onEnd();
  }
  get last() {
    return this.spoken[this.spoken.length - 1]?.text;
  }
}

const chapters: Chapter[] = [
  { title: 'One', text: 'The first sentence is long enough to stand alone. The second sentence follows it very nicely indeed.' },
  { title: 'Two', text: 'Chapter two begins with a sentence of decent length. It ends with another sentence that is long enough.' },
];
const [A, B] = ['The first sentence is long enough to stand alone.', 'The second sentence follows it very nicely indeed.'];
const C = 'Chapter two begins with a sentence of decent length.';
const opts = { voiceId: null, rate: 1, pitch: 1, isHidden: () => false };

describe('Narrator', () => {
  let engine: FakeEngine;
  beforeEach(() => {
    vi.useFakeTimers();
    engine = new FakeEngine();
  });
  afterEach(() => vi.useRealTimers());

  it('reads every chunk across chapters and ends', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    expect(engine.last).toBe(A);
    engine.finish();
    expect(engine.last).toBe(B);
    engine.finish();
    expect(n.getState().chapter).toBe(1);
    expect(engine.last).toBe(C);
    engine.finish();
    engine.finish();
    expect(n.getState().status).toBe('ended');
    expect(engine.spoken).toHaveLength(4);
  });

  it('resumes from the exact word after pause', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    engine.finish(); // first sentence done
    engine.start();
    engine.handlers!.onBoundary(11); // "The second |sentence"
    n.pause();
    expect(n.getState().status).toBe('paused');
    expect(n.position).toEqual({ chapter: 0, offset: A.length + 1 + 11 });
    n.play();
    expect(engine.last).toBe('sentence follows it very nicely indeed.');
  });

  it('starts from a saved position', () => {
    const n = new Narrator(engine, chapters, opts, { chapter: 1, offset: C.length + 4 });
    n.play();
    expect(engine.last).toBe('ends with another sentence that is long enough.');
  });

  it('skips forward and backward by sentence', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    n.skip(1);
    expect(engine.last).toBe(B);
    n.skip(1);
    expect(n.getState().chapter).toBe(1);
    n.skip(-1);
    expect(n.getState().chapter).toBe(0);
    expect(engine.last).toBe(B);
  });

  it('navigates chapters', () => {
    const n = new Narrator(engine, chapters, opts);
    n.nextChapter();
    expect(n.getState()).toMatchObject({ chapter: 1, offset: 0, status: 'idle' });
    n.prevChapter();
    expect(n.getState().chapter).toBe(0);
  });

  it('applies a new rate immediately from the current word', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    engine.start();
    engine.handlers!.onBoundary(10);
    n.setOptions({ rate: 1.5 });
    expect(engine.spoken.at(-1)).toEqual({ text: 'sentence is long enough to stand alone.', opts: { voiceId: null, rate: 1.5, pitch: 1 } });
  });

  it('retries a failed sentence, then skips it instead of stopping', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    engine.handlers!.onError('synthesis-failed');
    vi.advanceTimersByTime(400);
    expect(engine.spoken).toHaveLength(2);
    engine.handlers!.onError('synthesis-failed');
    vi.advanceTimersByTime(400);
    engine.handlers!.onError('synthesis-failed');
    expect(engine.last).toBe(B);
    expect(n.getState().notice).toMatch(/skipped/);
    expect(n.getState().status).toBe('playing');
  });

  it('pauses with an explanation when interrupted by the system', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    engine.handlers!.onError('interrupted');
    expect(n.getState().status).toBe('paused');
    expect(n.getState().notice).toMatch(/interrupted/i);
  });

  it('pauses when the browser requires a tap (autoplay policy)', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    engine.handlers!.onError('not-allowed');
    expect(n.getState()).toMatchObject({ status: 'paused' });
    expect(n.getState().notice).toMatch(/tap/i);
  });

  it('retries when speech silently never starts, then explains', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    for (let i = 0; i < 20 && n.getState().status === 'playing'; i++) vi.advanceTimersByTime(7000);
    expect(n.getState().status).toBe('paused');
    expect(n.getState().notice).toMatch(/did not start/);
    expect(engine.spoken.length).toBeGreaterThan(1);
  });

  it('moves on if the engine never reports the end of a sentence', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    engine.start();
    engine.speaking = false; // engine silently stopped without onend
    vi.advanceTimersByTime(60_000);
    expect(engine.spoken.length).toBeGreaterThan(1);
    expect(engine.spoken[1].text).toBe(B);
  });

  it('ignores events from cancelled utterances', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    const stale = engine.handlers!;
    n.skip(1);
    stale.onEnd();
    expect(n.getState().chunkIndex).toBe(1);
    expect(engine.spoken).toHaveLength(2);
  });

  it('sleep timer stops at the end of the chapter', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    n.setSleepTimer('chapter');
    engine.finish();
    engine.finish();
    expect(n.getState()).toMatchObject({ status: 'paused', chapter: 1, offset: 0 });
  });

  it('sleep timer stops after the chosen minutes', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    engine.start();
    n.setSleepTimer(1);
    vi.advanceTimersByTime(61_000);
    expect(n.getState().status).toBe('paused');
  });

  it('restarts speech when the app returns to the foreground', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    engine.start();
    engine.speaking = false; // iOS stopped speech while hidden
    n.handleVisible();
    expect(engine.spoken).toHaveLength(2);
    expect(engine.last).toBe(A);
  });

  it('computes book percent', () => {
    expect(bookPercent(chapters, { chapter: 0, offset: 0 })).toBe(0);
    expect(bookPercent(chapters, { chapter: 1, offset: chapters[1].text.length })).toBe(1);
  });
});

class FakeSequenceEngine extends FakeEngine implements SequenceSpeechEngine {
  sequences: Array<{ key: string; items: SequenceItem[]; titles: string[] }> = [];
  seqHandlers: SequenceHandlers | null = null;
  sleep: Array<'off' | 'chapter' | number> = [];
  speakSequence(key: string, items: SequenceItem[], _o: SpeakOptions, h: SequenceHandlers, titles: string[]) {
    this.sequences.push({ key, items, titles });
    this.seqHandlers = h;
  }
  cancel() {
    super.cancel();
    this.seqHandlers = null;
  }
  setSleepTimer(m: 'off' | 'chapter' | number) {
    this.sleep.push(m);
  }
  setNowPlaying() {}
  async getSavedPosition() {
    return null;
  }
}

describe('Narrator with a native queue (iOS app)', () => {
  let engine: FakeSequenceEngine;
  beforeEach(() => {
    vi.useFakeTimers();
    engine = new FakeSequenceEngine();
  });
  afterEach(() => vi.useRealTimers());

  it('hands the rest of the book to the engine as one queue, from the exact word', () => {
    const n = new Narrator(engine, chapters, { ...opts, key: 'book-1' }, { chapter: 0, offset: 4 });
    n.play();
    expect(engine.spoken).toHaveLength(0);
    const { key, items, titles } = engine.sequences[0];
    expect(key).toBe('book-1');
    expect(titles).toEqual(['One', 'Two']);
    expect(items.map((i) => i.chapter)).toEqual([0, 0, 1, 1]);
    expect(items[0]).toEqual({ text: A.slice(4), chapter: 0, start: 4 });
    expect(items[2]).toEqual({ text: C, chapter: 1, start: 0 });
  });

  it('mirrors native progress, including across chapters', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    const h = engine.seqHandlers!;
    h.onItemStart(1);
    h.onBoundary(1, 4);
    expect(n.position).toEqual({ chapter: 0, offset: A.length + 1 + 4 });
    h.onItemStart(2);
    expect(n.getState()).toMatchObject({ chapter: 1, chunkIndex: 0, offset: 0, status: 'playing' });
    h.onDone();
    expect(n.getState().status).toBe('ended');
  });

  it('follows Lock Screen pause/resume and explains interruptions', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    engine.seqHandlers!.onPaused('remote');
    expect(n.getState()).toMatchObject({ status: 'paused', notice: null });
    engine.seqHandlers!.onResumed();
    expect(n.getState().status).toBe('playing');
    engine.seqHandlers!.onPaused('interrupted');
    expect(n.getState().notice).toMatch(/interrupted/);
  });

  it('lets the engine run the sleep timer (it keeps time in the background)', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    n.setSleepTimer(15);
    n.setSleepTimer('chapter');
    expect(engine.sleep).toEqual([15, 'chapter']);
    vi.advanceTimersByTime(20 * 60_000);
    expect(n.getState().status).toBe('playing'); // no JS timer fired
    engine.seqHandlers!.onPaused('sleep-chapter');
    expect(n.getState()).toMatchObject({ status: 'paused', sleep: { mode: 'off' } });
  });

  it('pausing in the app stops the native queue and resumes from the same word', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    engine.seqHandlers!.onItemStart(1);
    engine.seqHandlers!.onBoundary(1, 11);
    n.pause();
    expect(engine.seqHandlers).toBeNull();
    n.play();
    expect(engine.sequences[1].items[0].text).toBe('sentence follows it very nicely indeed.');
  });

  it('ignores events from a replaced queue', () => {
    const n = new Narrator(engine, chapters, opts);
    n.play();
    const stale = engine.seqHandlers!;
    n.skip(1);
    stale.onItemStart(3);
    expect(n.getState().chapter).toBe(0);
  });
});
