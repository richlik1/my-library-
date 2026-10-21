import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { importDocx } from '../src/core/importers/docx';
import { importEpub } from '../src/core/importers/epub';
import { ImportError } from '../src/core/importers/errors';
import { detectFormat } from '../src/core/importers/index';
import { decodeText, importTxt, parseTxt } from '../src/core/importers/txt';

describe('TXT importer', () => {
  it('strips the Project Gutenberg wrapper and finds chapters', () => {
    const raw = [
      'Title: A Test Book',
      'Author: Jane Doe',
      '*** START OF THE PROJECT GUTENBERG EBOOK TEST ***',
      'CHAPTER I.',
      '',
      'It was the best of times, it was the worst',
      'of times.',
      '',
      'CHAPTER II.',
      '',
      'Another chapter begins here.',
      '*** END OF THE PROJECT GUTENBERG EBOOK TEST ***',
      'License text that should not be read.',
    ].join('\r\n');
    const book = parseTxt(raw, 'test.txt');
    expect(book.title).toBe('A Test Book');
    expect(book.author).toBe('Jane Doe');
    expect(book.chapters.map((c) => c.title)).toEqual(['CHAPTER I', 'CHAPTER II']);
    expect(book.chapters[0].text).toContain('it was the worst of times.');
    expect(JSON.stringify(book)).not.toContain('License');
  });

  it('decodes Windows-1252 when the file is not UTF-8', () => {
    expect(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe('café');
    expect(decodeText(new TextEncoder().encode('naïve'))).toBe('naïve');
  });

  it('uses the file name as title', async () => {
    const book = await importTxt(new Blob(['Hello there.']), 'my_great-book.txt');
    expect(book.title).toBe('my great-book');
    expect(book.chapters).toHaveLength(1);
  });
});

async function makeEpub(): Promise<Blob> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>The EPUB Test</dc:title><dc:creator>Ann Author</dc:creator><meta name="cover" content="cov"/></metadata>
     <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/><item id="cov" href="img/cover.png" media-type="image/png"/></manifest>
     <spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
  );
  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">The First Chapter</a></li><li><a href="text/ch2.xhtml#start">The Second Chapter</a></li></ol></nav></body></html>`,
  );
  const page = (h: string, body: string) =>
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title><style>p{}</style></head><body><h1>${h}</h1>${body}</body></html>`;
  zip.file('OEBPS/text/ch1.xhtml', page('One', '<p>First paragraph<sup>1</sup> of the book.</p><p>Second   paragraph.</p>'));
  zip.file('OEBPS/text/ch2.xhtml', page('Two', '<div><p>Chapter two text &amp; more.</p></div><script>alert(1)</script>'));
  zip.file('OEBPS/img/cover.png', new Uint8Array([137, 80, 78, 71]));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}

describe('EPUB importer', () => {
  it('reads metadata, spine order, TOC titles, text and cover', async () => {
    const book = await importEpub(await makeEpub(), 'x.epub');
    expect(book.title).toBe('The EPUB Test');
    expect(book.author).toBe('Ann Author');
    expect(book.chapters.map((c) => c.title)).toEqual(['The First Chapter', 'The Second Chapter']);
    expect(book.chapters[0].text).toBe('One\n\nFirst paragraph of the book.\n\nSecond paragraph.');
    expect(book.chapters[1].text).toBe('Two\n\nChapter two text & more.');
    expect(book.cover).toMatch(/^data:image\/png;base64,/);
  });

  it('is detected by magic bytes', async () => {
    const blob = await makeEpub();
    expect(await detectFormat(blob, 'book.bin')).toBe('epub');
  });

  it('rejects DRM-protected books with a clear message', async () => {
    const zip = await JSZip.loadAsync(await (await makeEpub()).arrayBuffer());
    zip.file(
      'META-INF/encryption.xml',
      `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></enc:EncryptedData></encryption>`,
    );
    await expect(importEpub(await zip.generateAsync({ type: 'blob' }), 'drm.epub')).rejects.toThrow(/DRM/);
  });
});

async function makeDocx(): Promise<Blob> {
  const zip = new JSZip();
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const p = (text: string, style?: string) =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  zip.file('[Content_Types].xml', '<Types/>');
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document ${W}><w:body>${p('My Doc Title', 'Title')}${p('Intro paragraph.')}${p('Getting Started', 'Heading1')}${p('Step one.')}<w:p><w:r><w:t>Split </w:t></w:r><w:r><w:t>run</w:t><w:tab/><w:t>text.</w:t></w:r><w:del><w:r><w:delText>deleted</w:delText></w:r></w:del></w:p>${p('Going Further', 'Heading1')}${p('More detail.')}</w:body></w:document>`,
  );
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0"?><w:styles ${W}><w:style w:styleId="Title"><w:name w:val="Title"/></w:style><w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`,
  );
  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0"?><cp:coreProperties xmlns:cp="x" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title></dc:title><dc:creator>Doc Writer</dc:creator></cp:coreProperties>`,
  );
  return zip.generateAsync({ type: 'blob' });
}

describe('DOCX importer', () => {
  it('reads headings as chapters, runs, tabs, and skips deleted text', async () => {
    const book = await importDocx(await makeDocx(), 'file.docx');
    expect(book.title).toBe('My Doc Title');
    expect(book.author).toBe('Doc Writer');
    expect(book.chapters.map((c) => c.title)).toEqual(['Opening', 'Getting Started', 'Going Further']);
    expect(book.chapters[1].text).toBe('Getting Started\n\nStep one.\n\nSplit run text.');
    expect(JSON.stringify(book)).not.toContain('deleted');
  });

  it('rejects files that are not zip archives', async () => {
    await expect(importDocx(new Blob(['not a zip']), 'old.docx')).rejects.toBeInstanceOf(ImportError);
  });
});

describe('format detection', () => {
  it('detects by content and extension', async () => {
    expect(await detectFormat(new Blob(['%PDF-1.7 ...']), 'whatever')).toBe('pdf');
    expect(await detectFormat(await makeDocx(), 'a.docx')).toBe('docx');
    expect(await detectFormat(new Blob(['hello']), 'notes.txt')).toBe('txt');
    expect(await detectFormat(new Blob(['hello']), 'song.mp3')).toBe(null);
  });
});
