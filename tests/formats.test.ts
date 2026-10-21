import { describe, expect, it } from 'vitest';
import { detectFormat, importFile } from '../src/core/importers';
import { looksLikeText, rtfToText } from '../src/core/importers/other';

const file = (content: string | Uint8Array, name: string, type = '') => new File([content as BlobPart], name, { type });

describe('more book formats', () => {
  it('reads RTF documents', async () => {
    const rtf = "{\\rtf1\\ansi{\\fonttbl{\\f0 Times;}}{\\colortbl;\\red0\\green0\\blue0;}\\f0 Chapter 1\\par\\par Caf\\'e9 owners wake early.\\par It\\u8217?s a long day.}";
    expect(rtfToText(rtf)).toContain('Café owners wake early.');
    expect(rtfToText(rtf)).toContain('It’s a long day.');
    expect(rtfToText(rtf)).not.toContain('Times');
    expect(await detectFormat(file(rtf, 'notes.rtf'), 'notes.rtf')).toBe('rtf');
    const book = await importFile(file(rtf, 'My Notes.rtf'));
    expect(book.title).toBe('My Notes');
    expect(book.chapters[0].text).toContain('Café owners wake early.');
  });

  it('reads saved web pages', async () => {
    const html = '<!doctype html><html><head><title>Saved Article</title><style>p{}</style></head><body><h1>Saved Article</h1><p>First paragraph of the article.</p><script>x()</script><p>Second paragraph.</p></body></html>';
    const book = await importFile(file(html, 'page.html', 'text/html'));
    expect(book.title).toBe('Saved Article');
    expect(book.chapters[0].text).toContain('First paragraph of the article.\n\nSecond paragraph.');
    expect(book.chapters[0].text).not.toContain('x()');
  });

  it('reads plain text with any file name', async () => {
    const book = await importFile(file('Just some words in a file without an extension.', 'notes'));
    expect(book.chapters[0].text).toBe('Just some words in a file without an extension.');
  });

  it('explains files it cannot read', async () => {
    await expect(importFile(file(new Uint8Array([0, 1, 2, 3, 0, 0, 255, 254]), 'photo.heic'))).rejects.toThrow(/photo/);
    await expect(importFile(file(new Uint8Array([0, 1, 2, 3, 0, 0]), 'Report.pages'))).rejects.toThrow(/Export/);
    await expect(importFile(file(new Uint8Array([0, 1, 2, 3, 0, 0]), 'book.mobi'))).rejects.toThrow(/Kindle/);
  });

  it('tells text from binary', () => {
    expect(looksLikeText(new TextEncoder().encode('Hello there.\nNew line.'))).toBe(true);
    expect(looksLikeText(new Uint8Array([0, 0, 1, 2, 3, 4]))).toBe(false);
  });
});
