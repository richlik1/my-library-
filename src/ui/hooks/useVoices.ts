import { useEffect, useState } from 'react';
import type { SpeechEngine, VoiceInfo } from '../../core/speech/engine';

export function useVoices(engine: SpeechEngine): VoiceInfo[] {
  const [voices, setVoices] = useState<VoiceInfo[]>(() => engine.getVoices());
  useEffect(() => {
    const refresh = () => setVoices(engine.getVoices());
    refresh();
    return engine.onVoicesChanged(refresh);
  }, [engine]);
  return voices;
}

/** Voices for the user's language first, best quality first. */
export function sortVoices(voices: VoiceInfo[], preferredLang = navigator.language || 'en-US'): VoiceInfo[] {
  const base = preferredLang.split('-')[0].toLowerCase();
  const rank = (v: VoiceInfo) =>
    (v.lang.toLowerCase().replace('_', '-') === preferredLang.toLowerCase() ? 0 : v.lang.toLowerCase().startsWith(base) ? 1 : 2) * 10 +
    { premium: 0, enhanced: 1, standard: 2, novelty: 3 }[v.quality];
  return [...voices].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** Picks a sensible default: the best local voice in the user's language. */
export function pickDefaultVoice(voices: VoiceInfo[]): VoiceInfo | null {
  const sorted = sortVoices(voices.filter((v) => v.quality !== 'novelty'));
  return sorted.find((v) => v.local) ?? sorted[0] ?? null;
}
