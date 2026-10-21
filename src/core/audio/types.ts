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
}

export const audioKey = (bookId: string, chapter: number) => `${bookId}:${chapter}`;
