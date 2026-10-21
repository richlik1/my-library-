/**
 * Speech engine abstraction. The web app uses the browser's free
 * SpeechSynthesis voices; a future native iOS app can provide an engine backed
 * by AVSpeechSynthesizer or an offline neural model with background audio,
 * without changing the narrator or the UI.
 */
export interface VoiceInfo {
  id: string;
  name: string;
  lang: string;
  local: boolean;
  isDefault: boolean;
  quality: 'premium' | 'enhanced' | 'standard' | 'novelty';
}

export interface SpeakOptions {
  voiceId: string | null;
  rate: number;
  pitch: number;
}

export type SpeechErrorCode = 'not-allowed' | 'interrupted' | 'synthesis-failed' | 'voice-unavailable' | 'network' | 'unknown';

export interface SpeakHandlers {
  onStart(): void;
  /** charIndex is relative to the text passed to speak(). */
  onBoundary(charIndex: number): void;
  onEnd(): void;
  onError(code: SpeechErrorCode, detail?: string): void;
}

export interface SpeechEngine {
  readonly id: string;
  isSupported(): boolean;
  getVoices(): VoiceInfo[];
  onVoicesChanged(cb: () => void): () => void;
  speak(text: string, opts: SpeakOptions, handlers: SpeakHandlers): void;
  cancel(): void;
  /** True while the engine believes it is producing audio. */
  isSpeaking(): boolean;
}

/** One sentence of a queued sequence, with where it sits in the book. */
export interface SequenceItem {
  text: string;
  chapter: number;
  /** Offset in the chapter where `text` begins. */
  start: number;
}

export interface SequenceHandlers {
  onItemStart(index: number): void;
  /** charIndex is relative to the item's text. */
  onBoundary(index: number, charIndex: number): void;
  onDone(): void;
  /** Paused outside the app's own controls: Lock Screen, a phone call, or the sleep timer. */
  onPaused(reason: 'remote' | 'interrupted' | 'sleep' | 'sleep-chapter'): void;
  onResumed(): void;
}

/**
 * Engines that play a whole queue natively (iOS app). The queue keeps playing
 * while the web layer is suspended — screen locked or app in the background —
 * and the engine owns the sleep timer and Lock Screen controls.
 */
export interface SequenceSpeechEngine extends SpeechEngine {
  speakSequence(key: string, items: SequenceItem[], opts: SpeakOptions, handlers: SequenceHandlers, chapterTitles: string[]): void;
  setSleepTimer(mode: 'off' | 'chapter' | number): void;
  setNowPlaying(info: { title: string; artist: string; artwork: string | null }): void;
  getSavedPosition(key: string): Promise<{ chapter: number; offset: number; updatedAt: number } | null>;
}

export function isSequenceEngine(e: SpeechEngine): e is SequenceSpeechEngine {
  return typeof (e as SequenceSpeechEngine).speakSequence === 'function';
}
