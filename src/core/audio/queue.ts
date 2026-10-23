import { chunkAt, chunkText } from '../speech/chunker';
import type { ChapterAudio, ChapterAudioMeta, NeuralEngine } from './types';
import { partKey, partRanges } from './types';
import { ChunkGenerationError, generatePart, type GenerateOptions } from './generate';
import { textHash } from './timing';

export type JobStatus = 'queued' | 'generating' | 'done' | 'failed' | 'cancelled';

export interface Job {
  bookId: string;
  chapter: number;
  status: JobStatus;
  /** 0..1 within the chapter. */
  progress: number;
  /** What's happening now, e.g. downloading the voice model. */
  label?: string;
  error?: string;
  /** Parts of the chapter ready to play, out of `parts`. */
  partsDone?: number;
  parts?: number;
  /** Where the listener is in this chapter: that part is made first. */
  startOffset?: number;
}

export interface QueueDeps {
  /** The engine for a book (books can use different voices). */
  engine(bookId: string): NeuralEngine | Promise<NeuralEngine>;
  chapterText(bookId: string, chapter: number): Promise<string | undefined>;
  voiceFor(bookId: string): Promise<string>;
  /** Pauses and pronunciations to use; changing them makes chapters regenerate when requested. */
  options?(bookId: string): Promise<Pick<GenerateOptions, 'sentencePause' | 'paragraphPause' | 'pronunciations'>>;
  /** Everything cached for a chapter (parts, or one older whole-chapter file). */
  chapterAudio(bookId: string, chapter: number): Promise<ChapterAudioMeta[]>;
  putAudio(a: ChapterAudio): Promise<void>;
  deleteAudio(keys: string[]): Promise<void>;
}

type Listener = (jobs: Job[]) => void;

/**
 * Generates chapter audio one chapter at a time, in order. Skips chapters
 * already cached with the same voice and text, retries failed sentences,
 * and can be paused, resumed or cancelled.
 */
export class AudioQueue {
  private jobs: Job[] = [];
  private listeners = new Set<Listener>();
  private running = false;
  private paused = false;
  private controller: AbortController | null = null;

  constructor(private readonly deps: QueueDeps) {}

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.jobs);
    return () => this.listeners.delete(fn);
  }

  get list(): Job[] {
    return this.jobs;
  }

  get isPaused() {
    return this.paused;
  }

  /** `startOffset` (for the first chapter) makes the part the listener is at first. */
  enqueue(bookId: string, chapters: number[], opts: { startOffset?: number } = {}) {
    chapters.forEach((chapter, i) => {
      const startOffset = i === 0 ? opts.startOffset : undefined;
      const existing = this.jobs.find((j) => j.bookId === bookId && j.chapter === chapter);
      if (existing && ['queued', 'generating'].includes(existing.status)) {
        if (existing.status === 'queued' && startOffset !== undefined) existing.startOffset = startOffset;
        return;
      }
      if (existing) Object.assign(existing, { status: 'queued', progress: 0, error: undefined, startOffset });
      else this.jobs.push({ bookId, chapter, status: 'queued', progress: 0, startOffset });
    });
    this.emit();
    void this.pump();
  }

  /** Moves a chapter to the front (e.g. the one the listener wants next). */
  prioritize(bookId: string, chapter: number) {
    const i = this.jobs.findIndex((j) => j.bookId === bookId && j.chapter === chapter && j.status === 'queued');
    if (i > 0) {
      const firstQueued = this.jobs.findIndex((j) => j.status === 'queued');
      const [job] = this.jobs.splice(i, 1);
      this.jobs.splice(firstQueued, 0, job);
      this.emit();
    }
  }

  pause() {
    this.paused = true;
    this.controller?.abort();
    this.emit();
  }

  resume() {
    this.paused = false;
    this.emit();
    void this.pump();
  }

  cancel(bookId?: string) {
    for (const j of this.jobs) if ((!bookId || j.bookId === bookId) && ['queued', 'generating'].includes(j.status)) j.status = 'cancelled';
    if (this.jobs.some((j) => j.status === 'cancelled')) this.controller?.abort();
    this.jobs = this.jobs.filter((j) => j.status !== 'cancelled');
    this.emit();
  }

  clearFinished() {
    this.jobs = this.jobs.filter((j) => !['done', 'failed'].includes(j.status));
    this.emit();
  }

  /** Resolves when nothing is queued or generating (used by tests). */
  async idle(): Promise<void> {
    while (this.running || this.jobs.some((j) => j.status === 'queued' && !this.paused)) await new Promise((r) => setTimeout(r, 10));
  }

  private emit() {
    const snapshot = this.jobs.map((j) => ({ ...j }));
    for (const l of this.listeners) l(snapshot);
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.paused) {
        const job = this.jobs.find((j) => j.status === 'queued');
        if (!job) break;
        await this.run(job);
      }
    } finally {
      this.running = false;
    }
  }

  private async run(job: Job) {
    const { bookId, chapter } = job;
    const text = await this.deps.chapterText(bookId, chapter);
    if (text === undefined) {
      Object.assign(job, { status: 'failed', error: 'Chapter not found' });
      return this.emit();
    }
    const engine = await this.deps.engine(bookId);
    const voice = await this.deps.voiceFor(bookId);
    const extra = (await this.deps.options?.(bookId)) ?? {};
    // The cache key covers the text and the narration settings that change the audio.
    const hash = textHash(`${text}\u0000${JSON.stringify(extra)}`);
    const matches = (m: ChapterAudioMeta) => m.voice === voice && m.engine === engine.id && m.textHash === hash;
    const metas = await this.deps.chapterAudio(bookId, chapter);
    if (metas.some((m) => m.part === undefined && matches(m))) {
      Object.assign(job, { status: 'done', progress: 1, partsDone: 1, parts: 1 });
      return this.emit();
    }
    const chunks = chunkText(text);
    const ranges = partRanges(chunks.length);
    if (!ranges.length) ranges.push([0, 0]);
    const valid = metas.filter((m) => m.part !== undefined && matches(m) && m.parts === ranges.length);
    // Audio in another voice or from older settings is replaced, never mixed in.
    const stale = metas.filter((m) => !valid.includes(m)).map((m) => m.key);
    if (stale.length) await this.deps.deleteAudio(stale);
    const have = new Set(valid.map((m) => m.part!));
    const sentences = (p: number) => ranges[p][1] - ranges[p][0];
    let doneSentences = [...have].reduce((s, p) => s + sentences(p), 0);
    Object.assign(job, { parts: ranges.length, partsDone: have.size });
    if (have.size === ranges.length) {
      Object.assign(job, { status: 'done', progress: 1 });
      return this.emit();
    }
    const startChunk = job.startOffset !== undefined ? chunkAt(chunks, job.startOffset) : 0;
    const startPart = Math.max(0, ranges.findIndex(([a, b]) => startChunk >= a && startChunk < b));
    const order = [...ranges.keys()].map((i) => (i + startPart) % ranges.length).filter((p) => !have.has(p));
    Object.assign(job, { status: 'generating', progress: doneSentences / Math.max(1, chunks.length) });
    this.emit();
    this.controller = new AbortController();
    try {
      await engine.load((_fraction, label) => {
        Object.assign(job, { label });
        this.emit();
      });
      job.label = undefined;
      for (const p of order) {
        const result = await generatePart(engine, chunks, ranges[p], {
          voice,
          signal: this.controller.signal,
          ...extra,
          onProgress: (done) => {
            job.progress = (doneSentences + done) / Math.max(1, chunks.length);
            this.emit();
          },
        });
        const key = partKey(bookId, chapter, p);
        await this.deps.putAudio({ key, bookId, chapter, engine: engine.id, voice, textHash: hash, createdAt: Date.now(), part: p, parts: ranges.length, ...result });
        doneSentences += sentences(p);
        job.partsDone = (job.partsDone ?? 0) + 1;
        this.emit();
      }
      Object.assign(job, { status: 'done', progress: 1 });
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // Paused: put it back in the queue. Cancelled jobs were already removed.
        if (this.jobs.includes(job)) Object.assign(job, { status: 'queued', progress: 0 });
      } else {
        Object.assign(job, { status: 'failed', error: e instanceof ChunkGenerationError ? e.message : `${(e as Error).message ?? e}` });
      }
    } finally {
      this.controller = null;
      this.emit();
    }
  }
}
