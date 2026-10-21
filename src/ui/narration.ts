import { KokoroEngine, DEFAULT_KOKORO_VOICE } from '../core/audio/kokoroEngine';
import { AudioQueue } from '../core/audio/queue';
import type { NeuralEngine } from '../core/audio/types';
import { getAudioMeta, getBook, getContent, putAudio } from '../core/storage/db';

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

/** The natural-voice engine for the chosen device. Loaded on first use only. */
export const kokoroEngine = () => engines[kokoroDevice()];

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
  getAudioMeta,
  putAudio,
});
