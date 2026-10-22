import { KokoroEngine, DEFAULT_KOKORO_VOICE } from '../core/audio/kokoroEngine';
import { AudioQueue } from '../core/audio/queue';
import type { LoadProgress, NeuralEngine } from '../core/audio/types';
import { deleteAudio, getBook, getChapterAudio, getContent, getSettings, putAudio } from '../core/storage/db';

const DEVICE_KEY = 'ml-kokoro-device';

/** 'webgpu' = use the graphics chip (faster, 326 MB model); 'wasm' = processor (92 MB model, works everywhere). */
export function kokoroDevice(): 'wasm' | 'webgpu' {
  try {
    return localStorage.getItem(DEVICE_KEY) === 'webgpu' ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}

const engines = { wasm: new KokoroEngine({ device: 'wasm' }), webgpu: new KokoroEngine({ device: 'webgpu' }) };

export function setKokoroDevice(d: 'wasm' | 'webgpu') {
  try {
    localStorage.setItem(DEVICE_KEY, d);
  } catch {
    /* private mode */
  }
}

/**
 * The natural-voice engine for the chosen device, loaded on first use. If the
 * graphics-chip version fails (not enough memory, unsupported GPU), it switches
 * to the processor version by itself instead of leaving narration broken.
 */
class AutoKokoro implements NeuralEngine {
  readonly id = 'kokoro';
  readonly label = 'Kokoro natural voices';
  private get current() {
    return engines[kokoroDevice()];
  }
  get runsIn() {
    return this.current.runsIn;
  }
  get threads() {
    return this.current.threads;
  }
  get mode() {
    return this.current.mode;
  }
  isLoaded() {
    return this.current.isLoaded();
  }
  voices() {
    return this.current.voices();
  }
  private fallBack(onProgress?: LoadProgress) {
    setKokoroDevice('wasm');
    onProgress?.(0, 'The graphics chip couldn’t run the voice; using the processor instead…');
    return engines.wasm.load(onProgress);
  }
  async load(onProgress?: LoadProgress) {
    try {
      await this.current.load(onProgress);
    } catch (e) {
      if (kokoroDevice() !== 'webgpu') throw e;
      await this.fallBack(onProgress);
    }
  }
  async synthesize(text: string, voice: string) {
    try {
      return await this.current.synthesize(text, voice);
    } catch (e) {
      if (kokoroDevice() !== 'webgpu') throw e;
      await this.fallBack();
      return engines.wasm.synthesize(text, voice);
    }
  }
}

const auto = new AutoKokoro();
export const kokoroEngine = (): NeuralEngine & { runsIn: string; threads: number; mode: string | null } => auto;

/**
 * Automated tests can install a small deterministic engine (no model download)
 * by setting `window.__MY_LIBRARY_TEST_ENGINE__` before the app loads.
 */
export function neuralEngine(): NeuralEngine {
  const test = (globalThis as { __MY_LIBRARY_TEST_ENGINE__?: NeuralEngine }).__MY_LIBRARY_TEST_ENGINE__;
  return test ?? kokoroEngine();
}

/** One queue for the whole app, so generation continues while you browse. */
export const audioQueue = new AudioQueue({
  engine: neuralEngine,
  chapterText: async (bookId, chapter) => (await getContent(bookId))?.chapters[chapter]?.text,
  voiceFor: async (bookId) => (await getBook(bookId))?.narration?.voice ?? DEFAULT_KOKORO_VOICE,
  chapterAudio: getChapterAudio,
  putAudio,
  deleteAudio,
  options: async (bookId) => {
    const [s, book] = await Promise.all([getSettings(), getBook(bookId)]);
    // Pauses can be set per book (narrator presets); otherwise the Settings default.
    const pause = book?.narration?.pause ?? s.narrationPause;
    const pauses = { short: [0.1, 0.35], normal: [0.18, 0.55], long: [0.3, 0.9] }[pause] ?? [0.18, 0.55];
    const pronunciations = Object.fromEntries(s.pronunciations.filter((p) => p.word.trim() && p.say.trim()).map((p) => [p.word.trim(), p.say.trim()]));
    return { sentencePause: pauses[0], paragraphPause: pauses[1], ...(Object.keys(pronunciations).length ? { pronunciations } : {}) };
  },
});
