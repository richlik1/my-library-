import type { Position } from '../types';
import type { SpeakOptions } from './engine';
import type { NarratorState } from './narrator';

/**
 * What the player screen needs from a playback engine. Implemented by the
 * live-speech Narrator (device voices) and the AudioNarrator (generated audio
 * files, which keep playing with the screen locked).
 */
export interface PlaybackController {
  readonly kind: 'speech' | 'audio';
  readonly position: Position;
  subscribe(fn: (s: NarratorState) => void): () => void;
  getState(): NarratorState;
  play(): void;
  pause(notice?: string | null): void;
  toggle(): void;
  seek(pos: Position, autoplay?: boolean): void;
  /** Moves by whole sentences. */
  skip(delta: number): void;
  nextChapter(): void;
  prevChapter(): void;
  setOptions(opts: Partial<SpeakOptions>): void;
  setSleepTimer(mode: 'off' | 'chapter' | number): void;
  handleVisible(): void;
  destroy(): void;
  /** Audio-file playback can also jump by seconds. */
  skipSeconds?(seconds: number): void;
}
