import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { importEpub } from '../src/core/importers/epub';
import { buildImportReport } from '../src/core/importers/report';

/**
 * A complex EPUB 3: two chapters inside one file (the table of contents points at anchors), a footnote with its
 * reference link, a `linear="no"` notes file, nested TOC levels, and a French language tag.
 */
async function complexEpub(opts: { tocOrder?: 'ok' | 'swapped'; missingTarget?: boolean } = {}): Promise<Blob> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  zip.file(
    'OPS/package.opf',
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Le Phare</dc:title><dc:creator>Jeanne Auteur</dc:creator><dc:language>fr</dc:language></metadata>
     <manifest>
       <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
       <item id="p1" href="part1.xhtml" media-type="application/xhtml+xml"/>
       <item id="c3" href="ch3.xhtml" media-type="application/xhtml+xml"/>
       <item id="notes" href="endnotes.xhtml" media-type="application/xhtml+xml"/>
     </manifest>
     <spine><itemref idref="p1"/><itemref idref="c3"/><itemref idref="notes" linear="no"/></spine></package>`,
  );
  const items = [
    `<li><a href="part1.xhtml">Part One</a><ol><li><a href="part1.xhtml#c1">Chapter 1</a></li><li><a href="part1.xhtml#c2">Chapter 2</a></li></ol></li>`,
    `<li><a href="ch3.xhtml">Chapter 3</a></li>`,
    `<li><a href="endnotes.xhtml">Endnotes</a></li>`,
  ];
  if (opts.tocOrder === 'swapped') [items[0], items[1]] = [items[1], items[0]];
  if (opts.missingTarget) items.push(`<li><a href="appendix.xhtml">Appendix</a></li>`);
  zip.file(
    'OPS/nav.xhtml',
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>${items.join('')}</ol></nav></body></html>`,
  );
  const page = (body: string) =>
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>x</title></head><body>${body}</body></html>`;
  const long = (s: string) => Array(12).fill(s).join(' ');
  zip.file(
    'OPS/part1.xhtml',
    page(
      `<h1>Part One</h1><p>${long('An opening note for the first part.')}</p>
       <h2 id="c1">Chapter 1</h2><p>${long('The keeper climbed the stairs.')}</p><p>He lit the lamp<a epub:type="noteref" href="#fn1">1</a> at dusk.</p>
       <aside epub:type="footnote" id="fn1"><p>The lamp burned whale oil.</p></aside>
       <h2 id="c2">Chapter 2</h2><p>${long('A storm came in from the west.')}</p>`,
    ),
  );
  zip.file('OPS/ch3.xhtml', page(`<h2>Chapter 3</h2><p>${long('Morning brought calm water.')}</p>`));
  zip.file('OPS/endnotes.xhtml', page(`<h2>Endnotes</h2><p>${long('Sources for this story are listed here.')}</p>`));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}

describe('complex EPUB', () => {
  it('splits chapters at table-of-contents anchors inside one file, in reading order', async () => {
    const book = await importEpub(await complexEpub(), 'le-phare.epub');
    expect(book.chapters.map((c) => c.title)).toEqual(['Part One', 'Chapter 1', 'Chapter 2', 'Chapter 3', 'Endnotes', 'Notes']);
    expect(book.chapters[0].text).toContain('An opening note for the first part.');
    expect(book.chapters[0].text).not.toContain('keeper');
    expect(book.chapters[1].text).toMatch(/^Chapter 1\n\nThe keeper climbed/);
    expect(book.chapters[2].text).toMatch(/^Chapter 2\n\nA storm/);
    expect(book.language).toBe('fr');
  });

  it('moves footnotes to a Notes section and drops the note marks from the text', async () => {
    const book = await importEpub(await complexEpub(), 'le-phare.epub');
    const ch1 = book.chapters[1].text;
    expect(ch1).toContain('He lit the lamp at dusk.');
    expect(ch1).not.toContain('whale oil');
    const notes = book.chapters.find((c) => c.kind === 'notes');
    expect(notes?.text).toBe('The lamp burned whale oil.');
  });

  it('keeps sections outside the reading order at the end and says so', async () => {
    const book = await importEpub(await complexEpub(), 'le-phare.epub');
    expect(book.signals?.extras).toEqual(['Endnotes']);
    const report = buildImportReport(book);
    expect(report.order.status).toBe('matches-source');
    expect(report.flags.map((f) => f.kind)).toEqual(['extra']);
  });

  it('reports a table of contents that disagrees with the reading order, or points to missing sections', async () => {
    const swapped = await importEpub(await complexEpub({ tocOrder: 'swapped', missingTarget: true }), 'x.epub');
    // The reading order (spine) is kept…
    expect(swapped.chapters.slice(0, 4).map((c) => c.title)).toEqual(['Part One', 'Chapter 1', 'Chapter 2', 'Chapter 3']);
    // …and the disagreement is reported, not hidden.
    expect(swapped.signals?.tocOutOfOrder).toEqual(['Part One', 'Chapter 1', 'Chapter 2']);
    expect(swapped.signals?.tocMissing).toEqual(['Appendix']);
    const report = buildImportReport(swapped);
    expect(report.order.status).toBe('conflicts');
    expect(report.confidence).toBe('low');
  });
});
