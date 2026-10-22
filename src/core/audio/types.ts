/**
 * Neural narration: engines that turn text into real audio, which is cached
 * and played by a media player. Unlike live device speech, cached audio keeps
 * playing with the iPhone locked and shows Lock Screen controls.
 */

export interface NeuralVoice {
  id: string;
  name: string;
  gender: 'female' | 'male';
  accent: string;
  /** Engine's own quality grade, if published (e.g. "A", "B-"). */
  grade?: string;
}

export interface SynthResult {
  samples: Float32Array;
  sampleRate: number;
}

export type LoadProgress = (fraction: number, label: string) => void;

export interface NeuralEngine {
  readonly id: string;
  readonly label: string;
  /** Downloads/initializes the model. Safe to call more than once. */
  load(onProgress?: LoadProgress): Promise<void>;
  isLoaded(): boolean;
  voices(): NeuralVoice[];
  synthesize(text: string, voice: string): Promise<SynthResult>;
}

/** Where one speech chunk sits in the chapter text and in the audio. */
export interface ChunkTiming {
  /** Character offsets in the chapter text. */
  start: number;
  end: number;
  /** Seconds in the chapter audio. */
  t0: number;
  t1: number;
}

/** A chapter's generated audio, cached on the device. */
export interface ChapterAudio {
  key: string;
  bookId: string;
  chapter: number;
  engine: string;
  voice: string;
  /** Hash of the chapter text, so edited text is regenerated. */
  textHash: string;
  sampleRate: number;
  duration: number;
  timings: ChunkTiming[];
  /** 16-bit mono WAV file bytes. */
  wav: ArrayBuffer;
  createdAt: number;
  /**
   * Chapters are made in parts, so listening can start after the first few
   * sentences. Absent on audio made before parts existed (one file per chapter).
   * Part timings are relative to the start of the part.
   */
  part?: number;
  parts?: number;
}

export type ChapterAudioMeta = Omit<ChapterAudio, 'wav'>;

export const audioKey = (bookId: string, chapter: number) => `${bookId}:${chapter}`;
export const partKey = (bookId: string, chapter: number, part: number) => `${bookId}:${chapter}:${part}`;

/**
 * Splits a chapter's sentences into parts: a tiny first part so playback can
 * start quickly, then bigger parts. Returns [from, to) sentence index ranges.
 */
export function partRanges(sentences: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < sentences; ) {
    const size = [1, 5, 14][out.length] ?? 24;
    out.push([i, Math.min(sentences, i + size)]);
    i += size;
  }
  return out;
}

/** The usable audio for each chapter: complete when every part (or a legacy single file) is present. */
export function chapterAudioStatus(metas: ChapterAudioMeta[]): Map<number, { complete: boolean; done: number; total: number; legacy?: boolean }> {
  const out = new Map<number, { complete: boolean; done: number; total: number; legacy?: boolean }>();
  for (const m of metas) {
    const cur = out.get(m.chapter);
    if (m.part === undefined || cur?.legacy) {
      out.set(m.chapter, { complete: true, done: 1, total: 1, legacy: true });
      continue;
    }
    const done = (cur?.done ?? 0) + 1;
    const total = m.parts ?? 1;
    out.set(m.chapter, { done, total, complete: done >= total });
  }
  return out;
}
