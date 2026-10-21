// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { ChunkGenerationError, generateChapterAudio } from '../src/core/audio/generate';
import { AudioQueue } from '../src/core/audio/queue';
import { chunkIndexAtTime, offsetAtTime, textHash, timeAtOffset } from '../src/core/audio/timing';
import type { ChapterAudio, NeuralEngine } from '../src/core/audio/types';
import { audioKey } from '../src/core/audio/types';
import { decodeWavInfo, encodeWav, trimSilence } from '../src/core/audio/wav';
import { db, deleteBook, getAudioMeta, getAudioWav, listBookAudio, putAudio, resetDbConnection, saveImportedBook } from '../src/core/storage/db';
import { chunkText } from '../src/core/speech/chunker';

/** Deterministic engine: 0.01 s of tone per character, padded with silence. */
class FakeEngine implements NeuralEngine {
  readonly id = 'fake';
  readonly label = 'Fake';
  calls: string[] = [];
  failTimes = new Map<string, number>();
  loaded = false;
  async load() {
    this.loaded = true;
  }
  isLoaded() {
    return this.loaded;
  }
  voices() {
    return [{ id: 'v1', name: 'One', gender: 'female' as const, accent: 'American' }];
  }
  async synthesize(text: string) {
    this.calls.push(text);
    const left = this.failTimes.get(text) ?? 0;
    if (left > 0) {
      this.failTimes.set(text, left - 1);
      throw new Error('model hiccup');
    }
    const sr = 1000;
    const body = new Float32Array(text.length * 10).fill(0.5);
    const out = new Float32Array(body.length + 100); // 50 ms silence on each side
    out.set(body, 50);
    return { samples: out, sampleRate: sr };
  }
}

const TEXT = 'The first sentence is long enough to stand alone. The second sentence follows it very nicely indeed.\n\nA new paragraph begins right here and continues.';

describe('wav encoding', () => {
  it('writes a valid 16-bit mono WAV', () => {
    const wav = encodeWav([new Float32Array([0, 0.5, -0.5, 1]), new Float32Array([2])], 24000);
    expect(wav.byteLength).toBe(44 + 5 * 2);
    expect(decodeWavInfo(wav)).toEqual({ sampleRate: 24000, samples: 5, duration: 5 / 24000 });
    expect(new DataView(wav).getInt16(44 + 2 * 3, true)).toBe(32767);
    expect(new DataView(wav).getInt16(44 + 2 * 4, true)).toBe(32767); // clipped
  });

  it('trims silence at both ends', () => {
    const t = Array.from(trimSilence(new Float32Array([0, 0, 0.4, 0, 0.3, 0])));
    expect(t).toHaveLength(3);
    expect(t[0]).toBeCloseTo(0.4, 5);
    expect(t[2]).toBeCloseTo(0.3, 5);
  });
});

describe('chapter generation', () => {
  it('builds one audio file with sentence timings and pauses', async () => {
    const engine = new FakeEngine();
    const r = await generateChapterAudio(engine, TEXT, { voice: 'v1', sentencePause: 0.2, paragraphPause: 0.5 });
    const chunks = chunkText(TEXT);
    expect(r.timings).toHaveLength(chunks.length);
    expect(r.timings.map((t) => [t.start, t.end])).toEqual(chunks.map((c) => [c.start, c.end]));
    // Each chunk lasts 0.01 s per character (padding trimmed); pauses sit between chunks.
    expect(r.timings[0].t0).toBe(0);
    expect(r.timings[0].t1).toBeCloseTo(chunks[0].text.length * 0.01, 5);
    expect(r.timings[1].t0).toBeCloseTo(r.timings[0].t1 + 0.2, 5);
    expect(r.timings[2].t0).toBeCloseTo(r.timings[1].t1 + 0.5, 5);
    expect(decodeWavInfo(r.wav).duration).toBeCloseTo(r.duration, 2);
  });

  it('retries a failed sentence and succeeds', async () => {
    const engine = new FakeEngine();
    const first = chunkText(TEXT)[0].text;
    engine.failTimes.set(first, 2);
    const r = await generateChapterAudio(engine, TEXT, { voice: 'v1', retries: 2 });
    expect(r.timings).toHaveLength(3);
    expect(engine.calls.filter((c) => c === first)).toHaveLength(3);
  });

  it('reports which sentence failed instead of skipping it', async () => {
    const engine = new FakeEngine();
    const second = chunkText(TEXT)[1].text;
    engine.failTimes.set(second, 5);
    await expect(generateChapterAudio(engine, TEXT, { voice: 'v1', retries: 1 })).rejects.toBeInstanceOf(ChunkGenerationError);
    await expect(generateChapterAudio(engine, TEXT, { voice: 'v1', retries: 1 })).rejects.toThrow(/sentence 2/);
  });

  it('applies the pronunciation dictionary to the spoken text only', async () => {
    const engine = new FakeEngine();
    const r = await generateChapterAudio(engine, 'StayOps helps hosts every single day of the week.', { voice: 'v1', pronunciations: { StayOps: 'Stay Ops' } });
    expect(engine.calls[0]).toBe('Stay Ops helps hosts every single day of the week.');
    expect(r.timings[0]).toMatchObject({ start: 0, end: 49 });
  });
});

describe('timing maps', () => {
  const timings = [
    { start: 0, end: 10, t0: 0, t1: 2 },
    { start: 11, end: 31, t0: 2.5, t1: 6.5 },
  ];
  it('maps time to text and back', () => {
    expect(chunkIndexAtTime(timings, 3)).toBe(1);
    expect(offsetAtTime(timings, 1)).toBe(5);
    expect(offsetAtTime(timings, 4.5)).toBe(21);
    expect(offsetAtTime(timings, 2.2)).toBe(10);
    expect(timeAtOffset(timings, 15)).toBe(2.5);
    expect(timeAtOffset(timings, 0)).toBe(0);
    expect(timeAtOffset(timings, 999)).toBe(6.5);
  });
  it('hashes text stably', () => {
    expect(textHash('abc')).toBe(textHash('abc'));
    expect(textHash('abc')).not.toBe(textHash('abd'));
  });
});

describe('generation queue and audio cache', () => {
  beforeEach(async () => {
    await resetDbConnection();
    const d = await db();
    for (const s of ['books', 'contents', 'files', 'audio', 'audioData'] as const) await d.clear(s);
  });

  const deps = (engine: FakeEngine, texts: string[], voice = 'v1') => ({
    engine: () => engine,
    chapterText: async (_b: string, ch: number) => texts[ch],
    voiceFor: async () => voice,
    getAudioMeta,
    putAudio,
  });

  it('generates chapters in order, caches them, and skips cached ones', async () => {
    const engine = new FakeEngine();
    const q = new AudioQueue(deps(engine, [TEXT, 'Chapter two has only one sentence in it today.']));
    q.enqueue('b1', [0, 1]);
    await q.idle();
    expect(q.list.map((j) => j.status)).toEqual(['done', 'done']);
    const meta = await listBookAudio('b1');
    expect(meta.map((m) => m.chapter)).toEqual([0, 1]);
    expect((await getAudioWav(audioKey('b1', 1)))!.byteLength).toBeGreaterThan(44);
    const calls = engine.calls.length;
    q.enqueue('b1', [0, 1]);
    await q.idle();
    expect(engine.calls.length).toBe(calls); // nothing regenerated
  });

  it('regenerates when the voice changes', async () => {
    const engine = new FakeEngine();
    await (async () => {
      const q = new AudioQueue(deps(engine, [TEXT]));
      q.enqueue('b1', [0]);
      await q.idle();
    })();
    const before = engine.calls.length;
    const q2 = new AudioQueue(deps(engine, [TEXT], 'v2'));
    q2.enqueue('b1', [0]);
    await q2.idle();
    expect(engine.calls.length).toBeGreaterThan(before);
    expect((await getAudioMeta(audioKey('b1', 0)))!.voice).toBe('v2');
  });

  it('marks a chapter failed with a reason and lets it be retried', async () => {
    const engine = new FakeEngine();
    const first = chunkText(TEXT)[0].text;
    engine.failTimes.set(first, 3);
    const q = new AudioQueue(deps(engine, [TEXT]));
    q.enqueue('b1', [0]);
    await q.idle();
    expect(q.list[0]).toMatchObject({ status: 'failed' });
    expect(q.list[0].error).toMatch(/sentence 1/);
    q.enqueue('b1', [0]); // retry
    await q.idle();
    expect(q.list[0].status).toBe('done');
  });

  it('pauses, resumes and cancels', async () => {
    const engine = new FakeEngine();
    const q = new AudioQueue(deps(engine, [TEXT, TEXT, TEXT]));
    q.pause();
    q.enqueue('b1', [0, 1, 2]);
    await new Promise((r) => setTimeout(r, 30));
    expect(engine.calls).toHaveLength(0);
    q.cancel('b1');
    expect(q.list).toHaveLength(0);
    q.enqueue('b1', [2]);
    q.resume();
    await q.idle();
    expect(q.list.map((j) => [j.chapter, j.status])).toEqual([[2, 'done']]);
  });

  it('deleting a book deletes its audio', async () => {
    const book = await saveImportedBook({ title: 'T', author: '', format: 'txt', cover: null, chapters: [{ title: 'A', text: TEXT }] }, { name: 't.txt', size: 1, type: 'text/plain', data: new Blob(['x']) }, 'Other');
    const q = new AudioQueue(deps(new FakeEngine(), [TEXT]));
    q.enqueue(book.id, [0]);
    await q.idle();
    expect(await listBookAudio(book.id)).toHaveLength(1);
    await deleteBook(book.id);
    expect(await listBookAudio(book.id)).toHaveLength(0);
    expect(await getAudioWav(audioKey(book.id, 0))).toBeUndefined();
  });
});

export type { ChapterAudio };
