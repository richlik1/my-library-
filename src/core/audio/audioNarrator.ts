import type { PlaybackController } from '../speech/controller';
import { chunkAt, chunkText, type Chunk } from '../speech/chunker';
import type { SpeakOptions } from '../speech/engine';
import type { NarratorState } from '../speech/narrator';
import type { Chapter, Position } from '../types';
import { chunkIndexAtTime, offsetAtTime, timeAtOffset } from './timing';
import type { ChapterAudio, ChunkTiming } from './types';
import { audioKey } from './types';
import { encodeWav } from './wav';

export interface AudioNarratorDeps {
  bookId: string;
  chapters: Chapter[];
  getMeta(key: string): Promise<Omit<ChapterAudio, 'wav'> | undefined>;
  getWav(key: string): Promise<ArrayBuffer | undefined>;
  /** Ask for chapters to be generated (first = most urgent). */
  requestAudio(chapters: number[]): void;
  /** For tests. */
  createAudio?: () => HTMLAudioElement;
}

// 0.1 s of silence, played inside the first tap so iOS lets this element play later.
let silentUrl: string | null = null;
function silentWavUrl(): string {
  if (!silentUrl) silentUrl = URL.createObjectURL(new Blob([encodeWav([new Float32Array(800)], 8000)], { type: 'audio/wav' }));
  return silentUrl;
}

/**
 * Plays generated chapter audio with a media element. Unlike live speech,
 * media playback continues with the screen locked and shows Lock Screen and
 * headphone controls. Reports the same state as the speech Narrator, so the
 * reader highlights the sentence being heard and progress is saved exactly.
 */
export class AudioNarrator implements PlaybackController {
  readonly kind = 'audio' as const;
  private listeners = new Set<(s: NarratorState) => void>();
  private state: NarratorState;
  private audio: HTMLAudioElement;
  private url: string | null = null;
  private loaded = -1;
  private loading: Promise<boolean> | null = null;
  private timings: ChunkTiming[] = [];
  private chunkCache = new Map<number, Chunk[]>();
  private rate = 1;
  /** The listener wants audio playing (survives waiting for generation). */
  private wantPlay = false;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private pendingSeekTime: number | null = null;

  constructor(
    private readonly deps: AudioNarratorDeps,
    opts: Partial<SpeakOptions>,
    start: Position = { chapter: 0, offset: 0 },
  ) {
    this.rate = opts.rate ?? 1;
    const chapter = Math.min(Math.max(0, start.chapter), Math.max(0, deps.chapters.length - 1));
    const chunks = this.chunksFor(chapter);
    const offset = Math.max(0, Math.min(start.offset, deps.chapters[chapter]?.text.length ?? 0));
    this.state = { status: 'idle', chapter, chunkIndex: chunkAt(chunks, offset), offset, chunks, notice: null, sleep: { mode: 'off' }, time: 0, duration: 0 };
    this.audio = deps.createAudio ? deps.createAudio() : new Audio();
    this.audio.preload = 'auto';
    (this.audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    this.audio.addEventListener('timeupdate', this.onTime);
    this.audio.addEventListener('ended', this.onEnded);
    this.audio.addEventListener('pause', this.onPauseEvent);
    this.audio.addEventListener('play', this.onPlayEvent);
    this.audio.addEventListener('error', this.onError);
    // Preload so the first tap on Play can start audio immediately (iOS requires play() inside the tap).
    void this.ensureLoaded(chapter);
  }

  // ---- PlaybackController -----------------------------------------------------

  get position(): Position {
    return { chapter: this.state.chapter, offset: this.state.offset };
  }

  subscribe(fn: (s: NarratorState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  getState() {
    return this.state;
  }

  play() {
    if (this.destroyed) return;
    if (this.state.status === 'ended') this.seek({ chapter: 0, offset: 0 });
    this.wantPlay = true;
    if (this.loaded === this.state.chapter) {
      this.startAudio();
      return;
    }
    // Not loaded yet: unlock the element inside this tap, then play once audio is ready.
    this.unlock();
    this.set({ status: 'playing', notice: null });
    void this.ensureLoaded(this.state.chapter).then((ok) => ok && this.wantPlay && this.startAudio());
  }

  pause(notice: string | null = null) {
    this.wantPlay = false;
    this.audio.pause();
    if (this.state.status === 'playing' || notice) this.set({ status: 'paused', notice, waitingForAudio: false });
  }

  toggle() {
    if (this.state.status === 'playing') this.pause();
    else this.play();
  }

  seek(pos: Position, autoplay = this.state.status === 'playing') {
    const chapter = Math.min(Math.max(0, pos.chapter), this.deps.chapters.length - 1);
    const chunks = this.chunksFor(chapter);
    const offset = Math.max(0, Math.min(pos.offset, this.deps.chapters[chapter].text.length));
    this.set({ chapter, chunks, offset, chunkIndex: chunkAt(chunks, offset), notice: null, status: autoplay ? 'playing' : this.state.status === 'idle' ? 'idle' : 'paused' });
    this.wantPlay = autoplay;
    if (this.loaded === chapter) {
      this.audio.currentTime = timeAtOffset(this.timings, offset);
      if (autoplay) this.startAudio();
      else this.audio.pause();
    } else {
      this.audio.pause();
      if (autoplay) this.unlock();
      void this.ensureLoaded(chapter).then((ok) => ok && this.wantPlay && this.state.chapter === chapter && this.startAudio());
    }
  }

  skip(delta: number) {
    const { chunks, chunkIndex, chapter } = this.state;
    const target = chunkIndex + delta;
    if (target < 0 && chapter > 0) return this.seek({ chapter: chapter - 1, offset: Number.MAX_SAFE_INTEGER });
    if (target >= chunks.length) return this.nextChapter();
    this.seek({ chapter, offset: chunks[Math.max(0, target)]?.start ?? 0 });
  }

  skipSeconds(seconds: number) {
    if (this.loaded !== this.state.chapter) return;
    const t = this.audio.currentTime + seconds;
    if (t < 0 && this.state.chapter > 0 && this.audio.currentTime < 1) return this.seek({ chapter: this.state.chapter - 1, offset: Number.MAX_SAFE_INTEGER });
    if (t >= (this.audio.duration || 0) && this.state.chapter < this.deps.chapters.length - 1) return this.nextChapter();
    this.audio.currentTime = Math.max(0, Math.min(t, this.audio.duration || t));
    this.onTime();
  }

  nextChapter() {
    if (this.state.chapter < this.deps.chapters.length - 1) this.seek({ chapter: this.state.chapter + 1, offset: 0 });
  }

  prevChapter() {
    const restart = (this.audio.currentTime ?? 0) > 3 || this.state.chunkIndex > 1;
    this.seek({ chapter: restart ? this.state.chapter : Math.max(0, this.state.chapter - 1), offset: 0 });
  }

  setOptions(opts: Partial<SpeakOptions>) {
    if (opts.rate) {
      this.rate = opts.rate;
      this.audio.playbackRate = opts.rate;
      this.audio.defaultPlaybackRate = opts.rate;
    }
  }

  setSleepTimer(mode: 'off' | 'chapter' | number) {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    if (mode === 'off') this.set({ sleep: { mode: 'off' } });
    else if (mode === 'chapter') this.set({ sleep: { mode: 'chapter' } });
    else {
      this.set({ sleep: { mode: 'time', endsAt: Date.now() + mode * 60_000 } });
      this.sleepTimer = setTimeout(() => {
        this.sleepTimer = null;
        this.set({ sleep: { mode: 'off' } });
        if (this.state.status === 'playing') this.pause('Sleep timer ended. Tap play to continue.');
      }, mode * 60_000);
    }
  }

  handleVisible() {
    /* media playback continues in the background; nothing to restart */
  }

  destroy() {
    this.destroyed = true;
    this.wantPlay = false;
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.audio.pause();
    this.audio.removeEventListener('timeupdate', this.onTime);
    this.audio.removeEventListener('ended', this.onEnded);
    this.audio.removeEventListener('pause', this.onPauseEvent);
    this.audio.removeEventListener('play', this.onPlayEvent);
    this.audio.removeEventListener('error', this.onError);
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.listeners.clear();
  }

  /** Called when the generation queue finishes a chapter. */
  audioReady(chapter: number) {
    if (chapter !== this.state.chapter || this.loaded === chapter) return;
    void this.ensureLoaded(chapter).then((ok) => ok && this.wantPlay && this.state.chapter === chapter && this.startAudio());
  }

  /** True when the current chapter's audio is loaded and playable. */
  get chapterReady() {
    return this.loaded === this.state.chapter;
  }

  // ---- internals ------------------------------------------------------------------

  private chunksFor(chapter: number): Chunk[] {
    let c = this.chunkCache.get(chapter);
    if (!c) {
      c = chunkText(this.deps.chapters[chapter]?.text ?? '');
      this.chunkCache.set(chapter, c);
    }
    return c;
  }

  private set(patch: Partial<NarratorState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  private unlock() {
    if (this.audio.src) return;
    try {
      this.audio.src = silentWavUrl();
      const p = this.audio.play();
      if (p) p.catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  private startAudio() {
    this.audio.playbackRate = this.rate;
    const p = this.audio.play();
    this.set({ status: 'playing', notice: null, waitingForAudio: false });
    if (p)
      p.catch((e: Error) => {
        if (this.destroyed || !this.wantPlay) return;
        this.wantPlay = false;
        this.set({
          status: 'paused',
          notice: e?.name === 'NotAllowedError' ? 'Tap play to start the audio.' : 'This chapter’s audio could not be played. Try regenerating it.',
        });
      });
  }

  private ensureLoaded(chapter: number): Promise<boolean> {
    if (this.loaded === chapter) return Promise.resolve(true);
    const run = async () => {
      const key = audioKey(this.deps.bookId, chapter);
      const meta = await this.deps.getMeta(key);
      const wav = meta && (await this.deps.getWav(key));
      if (this.destroyed || chapter !== this.state.chapter) return false;
      if (!meta || !wav) {
        this.deps.requestAudio([chapter, chapter + 1].filter((c) => c < this.deps.chapters.length));
        this.set({ waitingForAudio: true, time: 0, duration: 0 });
        return false;
      }
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      this.timings = meta.timings;
      this.pendingSeekTime = timeAtOffset(this.timings, this.state.offset);
      // Swap the source before marking it loaded, so the 'pause' this fires isn't taken as the user pausing.
      this.audio.src = this.url;
      this.loaded = chapter;
      this.audio.playbackRate = this.rate;
      this.audio.currentTime = this.pendingSeekTime;
      this.set({ waitingForAudio: false, duration: meta.duration, time: this.pendingSeekTime });
      // Generate ahead so the next chapter is ready when this one ends.
      if (chapter + 1 < this.deps.chapters.length) this.deps.requestAudio([chapter + 1]);
      return true;
    };
    const p = (this.loading ?? Promise.resolve(false)).then(run, run);
    this.loading = p;
    return p;
  }

  private onTime = () => {
    if (this.loaded !== this.state.chapter) return;
    const t = this.audio.currentTime;
    // Some browsers report 0 before applying a seek on a fresh source.
    if (this.pendingSeekTime !== null) {
      if (Math.abs(t - this.pendingSeekTime) > 0.5 && t < 0.3) this.audio.currentTime = this.pendingSeekTime;
      this.pendingSeekTime = null;
    }
    const offset = offsetAtTime(this.timings, t);
    const chunkIndex = Math.min(chunkIndexAtTime(this.timings, t), this.state.chunks.length - 1);
    if (offset !== this.state.offset || chunkIndex !== this.state.chunkIndex || Math.abs((this.state.time ?? 0) - t) > 0.25)
      this.set({ offset, chunkIndex, time: t, duration: this.audio.duration || this.state.duration });
  };

  private onEnded = () => {
    if (this.loaded !== this.state.chapter) return;
    const next = this.state.chapter + 1;
    if (next >= this.deps.chapters.length) {
      this.wantPlay = false;
      this.set({ status: 'ended', notice: null });
      return;
    }
    if (this.state.sleep.mode === 'chapter') {
      this.set({ sleep: { mode: 'off' } });
      this.seek({ chapter: next, offset: 0 }, false);
      this.pause('Sleep timer: stopped at the end of the chapter.');
      return;
    }
    this.seek({ chapter: next, offset: 0 }, true);
  };

  // Keep state in sync when the Lock Screen, headphones or the OS pause/resume playback.
  private onPauseEvent = () => {
    if (this.audio.ended || !this.wantPlay || this.loaded !== this.state.chapter) return;
    this.wantPlay = false;
    this.set({ status: 'paused' });
  };

  private onPlayEvent = () => {
    if (this.loaded !== this.state.chapter) return;
    this.wantPlay = true;
    if (this.state.status !== 'playing') this.set({ status: 'playing', notice: null });
  };

  private onError = () => {
    if (!this.url || !this.audio.src.startsWith('blob:')) return;
    this.wantPlay = false;
    this.set({ status: 'paused', notice: 'This chapter’s audio could not be played. Try regenerating it in Voice & speed.' });
  };
}
