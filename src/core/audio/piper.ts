/**
 * Piper (MIT, rhasspy/piper): small, fast neural voices (VITS). Several times
 * faster than Kokoro on a phone, so chapters can keep up with listening. Runs
 * on the device; each voice is a one-time download (~63 MB) from Hugging Face.
 */
import type { NeuralVoice } from './types';

export interface PiperVoice extends NeuralVoice {
  /** Path under rhasspy/piper-voices, e.g. en/en_US/lessac/medium/en_US-lessac-medium */
  path: string;
}

export const PIPER_VOICES: PiperVoice[] = [
  { id: 'en_US-lessac-medium', name: 'Lessac', gender: 'female', accent: 'American', path: 'en/en_US/lessac/medium/en_US-lessac-medium' },
  { id: 'en_US-ryan-medium', name: 'Ryan', gender: 'male', accent: 'American', path: 'en/en_US/ryan/medium/en_US-ryan-medium' },
  { id: 'en_US-amy-medium', name: 'Amy', gender: 'female', accent: 'American', path: 'en/en_US/amy/medium/en_US-amy-medium' },
  { id: 'en_GB-alan-medium', name: 'Alan', gender: 'male', accent: 'British', path: 'en/en_GB/alan/medium/en_GB-alan-medium' },
];

export const DEFAULT_PIPER_VOICE = 'en_US-lessac-medium';
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
