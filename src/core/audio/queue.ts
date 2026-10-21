import type { ChapterAudio, NeuralEngine } from './types';
import { audioKey } from './types';
import { ChunkGenerationError, generateChapterAudio } from './generate';
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
}

export interface QueueDeps {
  engine(): NeuralEngine;
  chapterText(bookId: string, chapter: number): Promise<string | undefined>;
  voiceFor(bookId: string): Promise<string>;
  pronunciations?(): Promise<Record<string, string> | undefined>;
  getAudioMeta(key: string): Promise<Omit<ChapterAudio, 'wav'> | undefined>;
  putAudio(a: ChapterAudio): Promise<void>;
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

  enqueue(bookId: string, chapters: number[]) {
    for (const chapter of chapters) {
      const existing = this.jobs.find((j) => j.bookId === bookId && j.chapter === chapter);
      if (existing && ['queued', 'generating'].includes(existing.status)) continue;
      if (existing) Object.assign(existing, { status: 'queued', progress: 0, error: undefined });
      else this.jobs.push({ bookId, chapter, status: 'queued', progress: 0 });
    }
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
    const engine = this.deps.engine();
    const voice = await this.deps.voiceFor(bookId);
    const hash = textHash(text);
    const key = audioKey(bookId, chapter);
    const cached = await this.deps.getAudioMeta(key);
    if (cached && cached.voice === voice && cached.engine === engine.id && cached.textHash === hash) {
      Object.assign(job, { status: 'done', progress: 1 });
      return this.emit();
    }
    Object.assign(job, { status: 'generating', progress: 0 });
    this.emit();
    this.controller = new AbortController();
    try {
      await engine.load((_fraction, label) => {
        Object.assign(job, { progress: 0, label });
        this.emit();
      });
      job.label = undefined;
      const result = await generateChapterAudio(engine, text, {
        voice,
        signal: this.controller.signal,
        pronunciations: await this.deps.pronunciations?.(),
        onProgress: (done, total) => {
          job.progress = done / total;
          this.emit();
        },
      });
      await this.deps.putAudio({ key, bookId, chapter, engine: engine.id, voice, textHash: hash, createdAt: Date.now(), ...result });
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
