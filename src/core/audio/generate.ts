import { chunkText, type Chunk } from '../speech/chunker';
import type { ChunkTiming, NeuralEngine } from './types';
import { encodeWav, trimSilence } from './wav';

export class ChunkGenerationError extends Error {
  constructor(
    public readonly chunkIndex: number,
    public readonly chunkText: string,
    cause: unknown,
  ) {
    super(`Could not generate audio for sentence ${chunkIndex + 1} ("${chunkText.slice(0, 60)}…"): ${(cause as Error)?.message ?? cause}`);
    this.name = 'ChunkGenerationError';
  }
}

export interface GenerateOptions {
  voice: string;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Extra attempts per sentence before giving up. */
  retries?: number;
  sentencePause?: number;
  paragraphPause?: number;
  /** Words to say differently: { "StayOps": "Stay Ops" }. Applied before synthesis only. */
  pronunciations?: Record<string, string>;
}

export interface GeneratedChapter {
  wav: ArrayBuffer;
  sampleRate: number;
  duration: number;
  timings: ChunkTiming[];
}

function applyPronunciations(text: string, dict?: Record<string, string>): string {
  if (!dict) return text;
  let out = text;
  for (const [word, say] of Object.entries(dict)) {
    if (!word.trim()) continue;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), say);
  }
  return out;
}

const abortError = () => Object.assign(new Error('Generation cancelled'), { name: 'AbortError' });

/**
 * Generates one chapter as a single WAV file, sentence by sentence, with
 * retries. Records where each sentence is in the audio, so playback can
 * highlight text and resume at the exact sentence.
 */
export async function generateChapterAudio(engine: NeuralEngine, text: string, opts: GenerateOptions): Promise<GeneratedChapter> {
  const chunks = chunkText(text);
  return generatePart(engine, chunks, [0, chunks.length], opts);
}

/**
 * Generates sentences [from, to) of a chapter as one WAV file. Timings start
 * at 0. Ends with the pause before the next sentence, so parts played one
 * after another sound like one recording.
 */
export async function generatePart(engine: NeuralEngine, chunks: Chunk[], [from, to]: [number, number], opts: GenerateOptions): Promise<GeneratedChapter> {
  const retries = opts.retries ?? 2;
  const parts: Float32Array[] = [];
  const timings: ChunkTiming[] = [];
  let sampleRate = 24000;
  let t = 0;
  for (let i = from; i < to; i++) {
    if (opts.signal?.aborted) throw abortError();
    const c = chunks[i];
    const spoken = applyPronunciations(c.text, opts.pronunciations);
    let result: Awaited<ReturnType<NeuralEngine['synthesize']>> | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= retries && !result; attempt++) {
      try {
        result = await engine.synthesize(spoken, opts.voice);
        if (!result.samples.length) throw new Error('empty audio');
      } catch (e) {
        result = null;
        lastError = e;
        if (opts.signal?.aborted) throw abortError();
      }
    }
    if (!result) throw new ChunkGenerationError(i, c.text, lastError);
    sampleRate = result.sampleRate;
    const samples = trimSilence(result.samples);
    const dur = samples.length / sampleRate;
    timings.push({ start: c.start, end: c.end, t0: t, t1: t + dur });
    parts.push(samples);
    t += dur;
    const next = chunks[i + 1];
    if (next) {
      const pause = next.paragraph !== c.paragraph ? (opts.paragraphPause ?? 0.55) : (opts.sentencePause ?? 0.18);
      const n = Math.round(pause * sampleRate);
      parts.push(new Float32Array(n));
      t += n / sampleRate;
    }
    opts.onProgress?.(i - from + 1, to - from);
  }
  return { wav: encodeWav(parts, sampleRate), sampleRate, duration: t, timings };
}
