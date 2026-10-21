import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { SequenceHandlers, SequenceItem, SequenceSpeechEngine, SpeakHandlers, SpeakOptions, VoiceInfo } from './engine';

interface NativeVoice {
  id: string;
  name: string;
  lang: string;
  quality: VoiceInfo['quality'];
}
type NativeEvent =
  | { type: 'itemStart'; seq: number; index: number }
  | { type: 'boundary'; seq: number; index: number; charIndex: number }
  | { type: 'done'; seq: number }
  | { type: 'paused'; seq: number; reason: 'remote' | 'interrupted' | 'sleep' | 'sleep-chapter' }
  | { type: 'resumed'; seq: number };

interface NativeSpeechPlugin {
  getVoices(): Promise<{ voices: NativeVoice[] }>;
  speakSequence(o: {
    seq: number;
    key: string;
    items: SequenceItem[];
    voiceId: string | null;
    rate: number;
    pitch: number;
    chapterTitles: string[];
  }): Promise<void>;
  stop(): Promise<void>;
  setSleepTimer(o: { minutes?: number; chapterEnd?: boolean }): Promise<void>;
  setNowPlaying(o: { title: string; artist: string; artwork?: string }): Promise<void>;
  getSavedPosition(o: { key: string }): Promise<{ chapter?: number; offset?: number; updatedAt?: number }>;
  addListener(event: 'event', cb: (e: NativeEvent) => void): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<NativeSpeechPlugin>('NativeSpeech');

/**
 * iOS app engine: AVSpeechSynthesizer via the app's NativeSpeech plugin
 * (ios/App/App/NativeSpeechPlugin.swift). Speech keeps going with the screen
 * locked and is controllable from the Lock Screen.
 */
export class NativeSpeechEngine implements SequenceSpeechEngine {
  readonly id = 'ios-native';
  private voices: VoiceInfo[] = [];
  private voiceListeners = new Set<() => void>();
  private seq = 0;
  private handlers: SequenceHandlers | null = null;

  constructor() {
    Native.getVoices()
      .then(({ voices }) => {
        this.voices = voices.map((v) => ({ id: v.id, name: v.name, lang: v.lang, local: true, isDefault: false, quality: v.quality }));
        this.voiceListeners.forEach((cb) => cb());
      })
      .catch(() => undefined);
    Native.addListener('event', (e) => this.onEvent(e)).catch(() => undefined);
  }

  isSupported() {
    return true;
  }

  getVoices() {
    return this.voices;
  }

  onVoicesChanged(cb: () => void) {
    this.voiceListeners.add(cb);
    return () => this.voiceListeners.delete(cb);
  }

  /** Single utterance (voice preview). */
  speak(text: string, opts: SpeakOptions, h: SpeakHandlers) {
    this.speakSequence('', [{ text, chapter: 0, start: 0 }], opts, {
      onItemStart: () => h.onStart(),
      onBoundary: (_i, ci) => h.onBoundary(ci),
      onDone: () => h.onEnd(),
      onPaused: () => h.onError('interrupted'),
      onResumed: () => undefined,
    }, []);
  }

  speakSequence(key: string, items: SequenceItem[], opts: SpeakOptions, handlers: SequenceHandlers, chapterTitles: string[]) {
    const seq = ++this.seq;
    this.handlers = handlers;
    Native.speakSequence({ seq, key, items, voiceId: opts.voiceId, rate: opts.rate, pitch: opts.pitch, chapterTitles }).catch(() => {
      if (seq === this.seq) handlers.onPaused('interrupted');
    });
  }

  cancel() {
    this.seq++;
    this.handlers = null;
    Native.stop().catch(() => undefined);
  }

  isSpeaking() {
    return this.handlers !== null;
  }

  setSleepTimer(mode: 'off' | 'chapter' | number) {
    Native.setSleepTimer(mode === 'off' ? {} : mode === 'chapter' ? { chapterEnd: true } : { minutes: mode }).catch(() => undefined);
  }

  setNowPlaying(info: { title: string; artist: string; artwork: string | null }) {
    Native.setNowPlaying({ title: info.title, artist: info.artist, ...(info.artwork ? { artwork: info.artwork } : {}) }).catch(() => undefined);
  }

  async getSavedPosition(key: string) {
    try {
      const r = await Native.getSavedPosition({ key });
      return typeof r.updatedAt === 'number' && r.updatedAt > 0 ? { chapter: r.chapter ?? 0, offset: r.offset ?? 0, updatedAt: r.updatedAt } : null;
    } catch {
      return null;
    }
  }

  private onEvent(e: NativeEvent) {
    const h = this.handlers;
    if (!h || e.seq !== this.seq) return;
    switch (e.type) {
      case 'itemStart':
        return h.onItemStart(e.index);
      case 'boundary':
        return h.onBoundary(e.index, e.charIndex);
      case 'done':
        this.handlers = null;
        return h.onDone();
      case 'paused':
        return h.onPaused(e.reason);
      case 'resumed':
        return h.onResumed();
    }
  }
}
