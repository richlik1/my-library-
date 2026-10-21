import { describe, expect, it } from 'vitest';
import { detectChapters, finalizeChapters, isHeading, normalizeText, splitLongChapters, unwrapLines } from '../src/core/importers/text';

describe('text utilities', () => {
  it('normalises whitespace and paragraphs', () => {
    expect(normalizeText('  Hello  world \r\n\r\n\r\n second\nline ')).toBe('Hello world\n\nsecond line');
  });

  it('unwraps hard-wrapped lines and de-hyphenates', () => {
    const lines = [
      'It was a bright cold day in April, and the clocks were',
      'striking thirteen. Winston Smith, his chin nuzzled into his',
      'breast, slipped quickly through the glass doors of Vic-',
      'tory Mansions.',
      '',
      'The hallway smelt of boiled cabbage.',
    ];
    const out = unwrapLines(lines);
    expect(out.split('\n\n')).toHaveLength(2);
    expect(out).toContain('the clocks were striking thirteen.');
    expect(out).toContain('Victory Mansions.');
  });

  it('recognises chapter headings', () => {
    expect(isHeading('Chapter 1')).toBe(true);
    expect(isHeading('CHAPTER XII.')).toBe(true);
    expect(isHeading('Chapter One: The Beginning')).toBe(true);
    expect(isHeading('Prologue')).toBe(true);
    expect(isHeading('The chapter was long and the night was dark.')).toBe(false);
  });

  it('detects chapters', () => {
    const text = 'Preface text.\n\nChapter 1\n\nFirst body.\n\nChapter 2\n\nSecond body.';
    const ch = detectChapters(text, 'Book');
    expect(ch.map((c) => c.title)).toEqual(['Opening', 'Chapter 1', 'Chapter 2']);
    expect(ch[2].text).toBe('Chapter 2\n\nSecond body.');
  });

  it('does not create empty chapters from a table of contents', () => {
    const text = 'Chapter 1\n\nChapter 2\n\nChapter 1\n\nOne.\n\nChapter 2\n\nTwo.';
    expect(detectChapters(text).map((c) => c.text)).toEqual(['Chapter 1\n\nOne.', 'Chapter 2\n\nTwo.']);
  });

  it('falls back to a single chapter when there are no headings', () => {
    expect(detectChapters('Just some text.\n\nMore text.', 'My Book')).toEqual([{ title: 'My Book', text: 'Just some text.\n\nMore text.' }]);
  });

  it('splits very long chapters at paragraph boundaries', () => {
    const para = 'word '.repeat(200).trim(); // ~1000 chars
    const text = Array.from({ length: 10 }, () => para).join('\n\n');
    const parts = splitLongChapters([{ title: 'Long', text }], 3000);
    expect(parts.length).toBeGreaterThan(3);
    expect(parts.every((p) => p.text.length <= 3000)).toBe(true);
    expect(parts[0].title).toMatch(/Long \(part 1 of \d+\)/);
    expect(parts.map((p) => p.text).join('\n\n')).toBe(text);
  });

  it('finalizes: drops empty chapters, normalises text', () => {
    expect(finalizeChapters([{ title: ' A ', text: ' x \n\n\n y ' }, { title: 'B', text: '   ' }])).toEqual([{ title: 'A', text: 'x\n\ny' }]);
  });
});
