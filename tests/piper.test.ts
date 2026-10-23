import { describe, expect, it } from 'vitest';
import { phonemeIds, splitPunctuation } from '../src/core/audio/piper';

describe('Piper input', () => {
  it('keeps punctuation separate from words', () => {
    expect(splitPunctuation('Hello, world! Ready?')).toEqual([
      { punct: false, text: 'Hello' },
      { punct: true, text: ', ' },
      { punct: false, text: 'world' },
      { punct: true, text: '! ' },
      { punct: false, text: 'Ready' },
      { punct: true, text: '?' },
    ]);
  });

  it('maps phonemes to ids with BOS, padding after each phoneme, and EOS; skips unknown ones', () => {
    const map = { _: [0], '^': [1], $: [2], ' ': [3], h: [20], ə: [59], l: [24], 'ˈ': [120], oʊ: [999], o: [27], ʊ: [100] };
    expect(phonemeIds('həlˈoʊ', map)).toEqual([1, 0, 20, 0, 59, 0, 24, 0, 120, 0, 27, 0, 100, 0, 2]);
    expect(phonemeIds('h?', map)).toEqual([1, 0, 20, 0, 2]);
  });
});
