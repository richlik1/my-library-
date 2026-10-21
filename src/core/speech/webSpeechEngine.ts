import type { SpeakHandlers, SpeakOptions, SpeechEngine, SpeechErrorCode, VoiceInfo } from './engine';

const NOVELTY = new Set(
  'albert bad news bahh bells boing bubbles cellos deranged good news hysterical jester junior organ pipe organ superstar trinoids whisper wobble zarvox fred ralph kathy'.split(
    ' ',
  ),
);
const NOVELTY_NAMES = ['Bad News', 'Good News', 'Pipe Organ'];

function quality(v: SpeechSynthesisVoice): VoiceInfo['quality'] {
  const n = v.name.toLowerCase();
  if (n.includes('premium')) return 'premium';
  if (n.includes('enhanced') || n.includes('neural') || n.includes('natural') || n.includes('siri')) return 'enhanced';
  const bare = n.replace(/\s*\(.*\)$/, '');
  if (NOVELTY_NAMES.some((x) => x.toLowerCase() === bare) || (NOVELTY.has(bare) && v.voiceURI.includes('com.apple'))) return 'novelty';
  return 'standard';
}

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

/** Browser SpeechSynthesis engine — free, offline for on-device voices. */
export class WebSpeechEngine implements SpeechEngine {
  readonly id = 'web-speech';
  private current: SpeechSynthesisUtterance | null = null; // strong ref: avoids Chrome GC bug
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private lastCancelAt = 0;
  private pendingSpeak: ReturnType<typeof setTimeout> | null = null;

  private get synth(): SpeechSynthesis | null {
    return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  }

  isSupported() {
    return !!this.synth && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  getVoices(): VoiceInfo[] {
    const voices = this.synth?.getVoices() ?? [];
    return voices.map((v) => ({
      id: v.voiceURI || v.name,
      name: v.name,
      lang: v.lang,
      local: v.localService,
      isDefault: v.default,
      quality: quality(v),
    }));
  }

  onVoicesChanged(cb: () => void) {
    const synth = this.synth;
    if (!synth) return () => undefined;
    synth.addEventListener?.('voiceschanged', cb);
    // Some browsers (iOS) fill the list late without firing the event.
    const timers = [250, 1000, 3000].map((ms) => setTimeout(cb, ms));
    return () => {
      synth.removeEventListener?.('voiceschanged', cb);
      timers.forEach(clearTimeout);
    };
  }

  private findVoice(id: string | null): SpeechSynthesisVoice | null {
    if (!id) return null;
    return this.synth?.getVoices().find((v) => (v.voiceURI || v.name) === id) ?? null;
  }

  speak(text: string, opts: SpeakOptions, h: SpeakHandlers) {
    const synth = this.synth;
    if (!synth) {
      h.onError('synthesis-failed', 'Speech is not supported in this browser');
      return;
    }
    this.stopKeepAlive();
    this.clearPendingSpeak();
    if (synth.speaking || synth.pending) {
      synth.cancel();
      this.lastCancelAt = Date.now();
    }
    const u = new SpeechSynthesisUtterance(text);
    const voice = this.findVoice(opts.voiceId);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = opts.rate;
    u.pitch = opts.pitch;
    let done = false;
    u.onstart = () => {
      h.onStart();
      // Desktop Chrome's online voices stop after ~15 s unless nudged.
      if (voice && !voice.localService && !isIOS() && !isAndroid()) {
        this.keepAlive = setInterval(() => {
          if (synth.speaking && !synth.paused) {
            synth.pause();
            synth.resume();
          }
        }, 10_000);
      }
    };
    u.onboundary = (e) => {
      if (e.name === undefined || e.name === 'word') h.onBoundary(e.charIndex);
    };
    u.onend = () => {
      if (done) return;
      done = true;
      this.stopKeepAlive();
      if (this.current === u) this.current = null;
      h.onEnd();
    };
    u.onerror = (e) => {
      if (done) return;
      done = true;
      this.stopKeepAlive();
      if (this.current === u) this.current = null;
      const code = (e.error as SpeechErrorCode | 'canceled' | 'audio-busy' | 'audio-hardware' | 'language-unavailable' | 'text-too-long' | 'invalid-argument') ?? 'unknown';
      if (code === 'canceled' || code === 'interrupted') h.onError('interrupted');
      else if (code === 'not-allowed') h.onError('not-allowed');
      else if (code === 'language-unavailable' || code === 'voice-unavailable') h.onError('voice-unavailable');
      else if (code === 'network') h.onError('network');
      else h.onError('synthesis-failed', String(code));
    };
    this.current = u;
    const go = () => {
      this.pendingSpeak = null;
      if (this.current !== u) return;
      synth.speak(u);
      // Some engines start paused after a previous pause(); make sure we run.
      if (synth.paused) synth.resume();
    };
    // Safari on iOS can silently drop an utterance queued right after cancel().
    if (isIOS() && Date.now() - this.lastCancelAt < 150) this.pendingSpeak = setTimeout(go, 120);
    else go();
  }

  private clearPendingSpeak() {
    if (this.pendingSpeak) clearTimeout(this.pendingSpeak);
    this.pendingSpeak = null;
  }

  cancel() {
    this.stopKeepAlive();
    this.clearPendingSpeak();
    this.lastCancelAt = Date.now();
    const u = this.current;
    this.current = null;
    if (u) {
      // Detach handlers so the cancelled utterance can't report events.
      u.onend = null;
      u.onerror = null;
      u.onstart = null;
      u.onboundary = null;
    }
    this.synth?.cancel();
  }

  isSpeaking() {
    // A paused synthesizer (e.g. iOS after the screen locked) is not producing audio.
    return !!this.synth && (this.synth.speaking || this.synth.pending) && !this.synth.paused;
  }

  private stopKeepAlive() {
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
  }
}
