/**
 * Piper (MIT, rhasspy/piper): small, fast neural voices (VITS). Several times
 * faster than Kokoro on a phone, so chapters can keep up with listening. Runs
 * on the device; each voice is a one-time download (~63 MB) from Hugging Face.
 */
import type { NeuralVoice } from './types';

export interface PiperVoice extends NeuralVoice {
  /** Measured naturalness, 1–5 (see PIPER_VOICES). */
  score: number;
  /** Path under rhasspy/piper-voices, e.g. en/en_US/lessac/medium/en_US-lessac-medium */
  path: string;
}

/**
 * The voices offered, most natural first. `score` is the predicted listener rating (UTMOS, 1–5) of the same
 * passage made the app's way, averaged over 5 takes (Piper varies from take to take), measured by
 * scripts/voice-lab for all 20 English single-speaker "medium" Piper voices. ("High" voices were 8× slower
 * without scoring higher, so they're not offered.) Lessac stays for books that already use it.
 */
export const PIPER_VOICES: PiperVoice[] = [
  { id: 'en_US-amy-medium', name: 'Amy', gender: 'female', accent: 'American', score: 4.48, path: 'en/en_US/amy/medium/en_US-amy-medium' },
  { id: 'en_US-bryce-medium', name: 'Bryce', gender: 'male', accent: 'American', score: 4.42, path: 'en/en_US/bryce/medium/en_US-bryce-medium' },
  { id: 'en_US-kristin-medium', name: 'Kristin', gender: 'female', accent: 'American', score: 4.38, path: 'en/en_US/kristin/medium/en_US-kristin-medium' },
  { id: 'en_US-mike-medium', name: 'Mike', gender: 'male', accent: 'American', score: 4.34, path: 'en/en_US/mike/medium/en_US-mike-medium' },
  { id: 'en_GB-jenny_dioco-medium', name: 'Jenny', gender: 'female', accent: 'British', score: 4.3, path: 'en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium' },
  { id: 'en_US-ryan-medium', name: 'Ryan', gender: 'male', accent: 'American', score: 4.29, path: 'en/en_US/ryan/medium/en_US-ryan-medium' },
  { id: 'en_US-lessac-medium', name: 'Lessac', gender: 'female', accent: 'American', score: 4.19, path: 'en/en_US/lessac/medium/en_US-lessac-medium' },
];

export const DEFAULT_PIPER_VOICE = 'en_US-amy-medium';
export const PIPER_HOST = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';

export interface PiperConfig {
  audio: { sample_rate: number };
  espeak?: { voice?: string };
  inference?: { noise_scale?: number; length_scale?: number; noise_w?: number };
  phoneme_id_map: Record<string, number[]>;
}

/** Splits text into word runs and punctuation, like Piper's own phonemizer keeps punctuation. */
export function splitPunctuation(text: string): Array<{ punct: boolean; text: string }> {
  const out: Array<{ punct: boolean; text: string }> = [];
  const re = /(\s*[;:,.!?¡¿—…"«»“”()]+\s*)+/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ punct: false, text: text.slice(last, m.index) });
    out.push({ punct: true, text: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ punct: false, text: text.slice(last) });
  return out;
}

/**
 * Turns IPA phonemes into Piper's input ids: BOS, then each phoneme followed
 * by the padding id, then EOS. Phonemes the voice doesn't know are skipped.
 */
export function phonemeIds(ipa: string, map: Record<string, number[]>): number[] {
  const pad = map['_']?.[0] ?? 0;
  const ids = [...(map['^'] ?? [1]), pad];
  for (const ch of ipa.normalize('NFD')) {
    const id = map[ch];
    if (!id) continue;
    ids.push(...id, pad);
  }
  ids.push(...(map['$'] ?? [2]));
  return ids;
}
