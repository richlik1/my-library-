import type { NeuralEngine } from './types';

export interface VoiceBenchmark {
  /** Seconds to download/start the model (0 when it was already loaded). */
  loadSeconds: number;
  genSeconds: number;
  audioSeconds: number;
  /** Seconds of speech made per second of work; above 1 means faster than listening. */
  speed: number;
}

export const BENCHMARK_TEXT =
  'The lighthouse stood at the edge of the world. Every night its keeper climbed the long stairs to light the lamp, and every morning he climbed down again, tired but content.';

/** Measures, on this device, how fast the natural voice makes speech. */
export async function benchmarkVoice(engine: NeuralEngine, voice: string, onStatus?: (label: string) => void): Promise<VoiceBenchmark> {
  const t0 = performance.now();
  const wasLoaded = engine.isLoaded();
  await engine.load((_f, label) => onStatus?.(label));
  const loadSeconds = wasLoaded ? 0 : (performance.now() - t0) / 1000;
  onStatus?.('Making a test sentence…');
  // A short warm-up, so the measurement isn't dominated by first-run setup. If the voice gets
  // stuck, the engine switches to a safer way of running it; try again that way.
  for (let attempt = 0; ; attempt++) {
    try {
      await engine.synthesize('Hello.', voice);
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
      onStatus?.('The voice got stuck. Trying a safer way to run it (this can take a minute)…');
      await engine.load((_f, label) => onStatus?.(label));
      onStatus?.('Making a test sentence…');
    }
  }
  const t1 = performance.now();
  const r = await engine.synthesize(BENCHMARK_TEXT, voice);
  const genSeconds = (performance.now() - t1) / 1000;
  const audioSeconds = r.samples.length / r.sampleRate;
  return { loadSeconds, genSeconds, audioSeconds, speed: audioSeconds / Math.max(genSeconds, 1e-3) };
}

export function describeBenchmark(b: VoiceBenchmark): string {
  const load = b.loadSeconds ? `Voice model ready in ${b.loadSeconds.toFixed(0)} s. ` : '';
  const verdict =
    b.speed >= 1.2
      ? 'Faster than listening: chapters keep up with playback.'
      : b.speed >= 0.9
        ? 'About as fast as listening: generate a chapter or two ahead.'
        : 'Slower than listening: generate the chapters you need ahead of time (Generate whole book) and keep the app open while it works.';
  return `${load}Made ${b.audioSeconds.toFixed(1)} s of speech in ${b.genSeconds.toFixed(1)} s (${b.speed.toFixed(1)}× listening speed). ${verdict}`;
}
