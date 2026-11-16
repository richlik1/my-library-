import { describe, expect, it } from 'vitest';
import { build, changed, mapPosition, mergeWithNext, move, organize, rename, setRemoved, splitAt } from '../src/core/organizer';
import type { Chapter } from '../src/core/types';

const book: Chapter[] = [
  { title: 'Front matter', text: 'Copyright page.' },
  { title: 'Chapter 1', text: 'One A.\n\nOne B.\n\nOne C.', pages: [{ offset: 0, page: 3 }, { offset: 16, page: 4 }] },
  { title: 'Chapter 2', text: 'Two A.\n\nTwo B.' },
];

describe('chapter organizer', () => {
  it('starts unchanged and builds the same chapters', () => {
    const list = organize(book);
    expect(changed(list, book)).toBe(false);
    expect(build(list, book).map((c) => c.text)).toEqual(book.map((c) => c.text));
  });

  it('reorders, renames and removes chapters; places follow their text', () => {
    let list = organize(book);
    list = move(list, 2, -1); // Chapter 2 before Chapter 1
    list = rename(list, 1, 'The Second');
    list = setRemoved(list, 0, true); // drop the front matter
    expect(changed(list, book)).toBe(true);
    const out = build(list, book);
    expect(out.map((c) => c.title)).toEqual(['The Second', 'Chapter 1']);
    expect(mapPosition(list, { chapter: 1, offset: 8 })).toEqual({ chapter: 1, offset: 8 }); // "One B." moved with its chapter
    expect(mapPosition(list, { chapter: 2, offset: 0 })).toEqual({ chapter: 0, offset: 0 });
    // A place in the removed front matter moves to the start of the next kept chapter.
    expect(mapPosition(list, { chapter: 0, offset: 5 })).toEqual({ chapter: 0, offset: 0 });
  });

  it('splits at a paragraph without losing or duplicating text, keeping page starts', () => {
    const list = splitAt(organize(book), book, 1, 2, 'Chapter 1 continued');
    const out = build(list, book);
    expect(out.map((c) => c.title)).toEqual(['Front matter', 'Chapter 1', 'Chapter 1 continued', 'Chapter 2']);
    expect(out[1].text).toBe('One A.\n\nOne B.');
    expect(out[2].text).toBe('One C.');
    expect(out[1].pages).toEqual([{ offset: 0, page: 3 }]);
    expect(out[2].pages).toEqual([{ offset: 0, page: 4 }]);
    expect(mapPosition(list, { chapter: 1, offset: 16 })).toEqual({ chapter: 2, offset: 0 });
    expect(mapPosition(list, { chapter: 1, offset: 8 })).toEqual({ chapter: 1, offset: 8 });
  });

  it('merges a chapter with the next, and split-then-merge gives the original back', () => {
    const merged = mergeWithNext(organize(book), 1);
    const out = build(merged, book);
    expect(out.map((c) => c.title)).toEqual(['Front matter', 'Chapter 1']);
    expect(out[1].text).toBe('One A.\n\nOne B.\n\nOne C.\n\nTwo A.\n\nTwo B.');
    expect(mapPosition(merged, { chapter: 2, offset: 8 })).toEqual({ chapter: 1, offset: 32 });
    expect(out[1].text.slice(32, 38)).toBe('Two B.');

    const roundTrip = mergeWithNext(splitAt(organize(book), book, 1, 1, 'x'), 1);
    expect(build(roundTrip, book).map((c) => c.text)).toEqual(book.map((c) => c.text));
  });

  it('every character of kept text appears exactly once after any sequence of edits', () => {
    let list = organize(book);
    list = splitAt(list, book, 1, 1, 'B');
    list = move(list, 2, 1);
    list = mergeWithNext(list, 0);
    const all = build(list, book).map((c) => c.text).join('\n\n');
    for (const para of book.flatMap((c) => c.text.split('\n\n'))) expect(all.split(para).length - 1).toBe(1);
  });
});
