import JSZip from 'jszip';
import type { Chapter, ImportSignals, ImportedBook } from '../types';
import { ImportError } from './errors';
import { finalizeChapters, titleFromFileName } from './text';

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'blockquote', 'pre', 'li', 'ul', 'ol', 'dl', 'dt', 'dd',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'table', 'figure', 'figcaption', 'hr', 'br', 'body', 'nav', 'main', 'address',
]);
const SKIP_TAGS = new Set(['script', 'style', 'head', 'title', 'svg', 'math', 'noscript', 'rt', 'rp']);

const NOTE_TYPES = /\b(footnote|endnote|rearnote|note|footnotes|endnotes|rearnotes)\b/;
/** Marks where a table-of-contents entry starts inside a file (see importEpub). */
export const SPLIT_MARK = '\u2063SPLIT';

/** epub:type of an element (also the plain `type`/`role` some books use). */
const epubType = (el: Element) => `${el.getAttribute('epub:type') ?? el.getAttributeNS?.('http://www.idpf.org/2007/ops', 'type') ?? ''} ${el.getAttribute('role') ?? ''}`.toLowerCase();

/**
 * Extracts readable text from an (X)HTML document, keeping paragraph breaks. Footnotes and endnotes
 * (epub:type footnote/endnote/note, role doc-footnote/doc-endnote) are collected into `notes` instead of the text.
 */
export function htmlToText(root: Node, notes?: string[]): string {
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out.push((node.nodeValue ?? '').replace(/\s+/g, ' '));
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node as Element).localName?.toLowerCase() ?? '';
    if (SKIP_TAGS.has(tag)) return;
    const split = (node as Element).getAttribute?.('data-split');
    if (split != null) out.push(`\n\n${SPLIT_MARK}${split}\n\n`);
    const type = epubType(node as Element);
    if (notes && (NOTE_TYPES.test(type) || /doc-(foot|end)note/.test(type)) && !/noteref/.test(type)) {
      const t = htmlToText(node);
      if (t) notes.push(t);
      return;
    }
    // Links to notes ("¹", "[3]") are noise when read aloud.
    if (tag === 'a' && /noteref/.test(type)) return;
    // Footnote reference markers ("[12]") are noise when read aloud.
    if (tag === 'sup' && /^\s*\[?\d+\]?\s*$/.test(node.textContent ?? '')) return;
    const block = BLOCK_TAGS.has(tag);
    if (block) out.push('\n\n');
    node.childNodes.forEach(walk);
    if (block) out.push('\n\n');
  };
  walk(root);
  return out
    .join('')
    .split(/\n\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

function parseXml(text: string, type: DOMParserSupportedType = 'application/xml'): Document {
  const doc = new DOMParser().parseFromString(text, type);
  if (doc.getElementsByTagName('parsererror').length && type !== 'text/html') {
    return new DOMParser().parseFromString(text, 'text/html');
  }
  return doc;
}

/** getElementsByTagName that ignores namespace prefixes (dc:title vs title). */
function byLocalName(doc: Document | Element, name: string): Element[] {
  return Array.from(doc.getElementsByTagName('*')).filter((e) => e.localName === name || e.nodeName.toLowerCase() === name);
}

function resolvePath(base: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0]);
  if (clean.startsWith('/')) return clean.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of clean.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

interface TocEntry {
  path: string;
  anchor: string | null;
  label: string;
}

/** The table of contents in its listed order (EPUB 3 nav, else EPUB 2 NCX), with each entry's file and anchor. */
async function readToc(zip: JSZip, opfPath: string, manifest: Map<string, { href: string; type: string; props: string }>, tocId: string | null): Promise<TocEntry[]> {
  const entries: TocEntry[] = [];
  const add = (base: string, href: string, label: string) => {
    const anchor = href.includes('#') ? decodeURIComponent(href.split('#')[1]) : null;
    entries.push({ path: resolvePath(base, href), anchor: anchor || null, label });
  };
  const navItem = [...manifest.values()].find((m) => m.props.split(/\s+/).includes('nav'));
  const ncxItem = (tocId && manifest.get(tocId)) || [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml');
  if (navItem) {
    const path = resolvePath(opfPath, navItem.href);
    const xml = await zip.file(path)?.async('string');
    if (xml) {
      const doc = parseXml(xml, 'application/xhtml+xml');
      const navs = byLocalName(doc, 'nav');
      const toc = navs.find((n) => (n.getAttribute('epub:type') ?? n.getAttribute('type') ?? '').includes('toc')) ?? navs[0];
      for (const a of toc ? byLocalName(toc, 'a') : []) {
        const href = a.getAttribute('href');
        const label = a.textContent?.replace(/\s+/g, ' ').trim();
        if (href && label) add(path, href, label);
      }
    }
  }
  if (!entries.length && ncxItem) {
    const path = resolvePath(opfPath, ncxItem.href);
    const xml = await zip.file(path)?.async('string');
    if (xml) {
      const doc = parseXml(xml);
      for (const np of byLocalName(doc, 'navPoint')) {
        const label = byLocalName(np, 'text')[0]?.textContent?.replace(/\s+/g, ' ').trim();
        const src = byLocalName(np, 'content')[0]?.getAttribute('src');
        if (label && src) add(path, src, label);
      }
    }
  }
  return entries;
}

async function readCover(zip: JSZip, opfPath: string, opf: Document, manifest: Map<string, { href: string; type: string; props: string }>) {
  let item = [...manifest.values()].find((m) => m.props.split(/\s+/).includes('cover-image'));
  if (!item) {
    const metaCover = byLocalName(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
    if (metaCover) item = manifest.get(metaCover);
  }
  if (!item) item = [...manifest.values()].find((m) => m.type.startsWith('image/') && /cover/i.test(m.href));
  if (!item || !item.type.startsWith('image/')) return null;
  const data = await zip.file(resolvePath(opfPath, item.href))?.async('base64');
  if (!data || data.length > 3_000_000) return null; // ignore gigantic covers
  return `data:${item.type};base64,${data}`;
}

export async function importEpub(file: Blob, fileName: string): Promise<ImportedBook> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new ImportError('This EPUB file could not be opened. It may be damaged.', 'corrupt');
  }
  const encryption = await zip.file('META-INF/encryption.xml')?.async('string');
  if (encryption) {
    // Font obfuscation is harmless; any other encryption algorithm means DRM.
    const FONT_OBFUSCATION = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'];
    const algorithms = byLocalName(parseXml(encryption), 'EncryptionMethod').map((m) => m.getAttribute('Algorithm') ?? '');
    if (algorithms.some((a) => !FONT_OBFUSCATION.includes(a)))
      throw new ImportError('This EPUB is protected with DRM, so its text cannot be read. Only DRM-free EPUB files can be imported.', 'encrypted');
  }
  const container = await zip.file('META-INF/container.xml')?.async('string');
  const opfPath = container ? parseXml(container).getElementsByTagName('rootfile')[0]?.getAttribute('full-path') : null;
  const opfText = opfPath ? await zip.file(opfPath)?.async('string') : null;
  if (!opfPath || !opfText) throw new ImportError('This EPUB is missing its table of contents (package file).', 'corrupt');
  const opf = parseXml(opfText);

  const manifest = new Map<string, { href: string; type: string; props: string }>();
  for (const item of byLocalName(opf, 'item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest.set(id, { href, type: item.getAttribute('media-type') ?? '', props: item.getAttribute('properties') ?? '' });
  }
  const spineEl = byLocalName(opf, 'spine')[0];
  const spine = byLocalName(opf, 'itemref')
    .filter((r) => r.getAttribute('linear') !== 'no')
    .map((r) => manifest.get(r.getAttribute('idref') ?? ''))
    .filter((m): m is { href: string; type: string; props: string } => !!m);

  const title = byLocalName(opf, 'title')[0]?.textContent?.trim() || titleFromFileName(fileName);
  const author = byLocalName(opf, 'creator').map((c) => c.textContent?.trim()).filter(Boolean).join(', ');
  const language = byLocalName(opf, 'language')[0]?.textContent?.trim() || undefined;
  const toc = await readToc(zip, opfPath, manifest, spineEl?.getAttribute('toc') ?? null);
  const spinePaths = spine.map((item) => resolvePath(opfPath, item.href));
  const extraItems = byLocalName(opf, 'itemref')
    .filter((r) => r.getAttribute('linear') === 'no')
    .map((r) => manifest.get(r.getAttribute('idref') ?? ''))
    .filter((m): m is { href: string; type: string; props: string } => !!m);

  const chapters: Chapter[] = [];
  const notes: string[] = [];
  const extras: string[] = [];
  /** Text of one book file, split where table-of-contents entries start inside it. */
  const readDoc = async (item: { href: string; type: string }, path: string) => {
    const html = await zip.file(path)?.async('string');
    if (!html) return null;
    const isXhtml = /xhtml|xml/.test(item.type);
    const doc = parseXml(html, isXhtml ? 'application/xhtml+xml' : 'text/html');
    const body = doc.getElementsByTagName('body')[0] ?? doc.documentElement;
    const anchors = toc.filter((t) => t.path === path && t.anchor);
    const unfound: TocEntry[] = [];
    for (const [i, t] of anchors.entries()) {
      const el = doc.getElementById(t.anchor!) ?? byLocalName(body as Element, '*').find((e) => e.getAttribute('id') === t.anchor || e.getAttribute('name') === t.anchor);
      if (el) el.setAttribute('data-split', String(i));
      else unfound.push(t);
    }
    const fileNotes: string[] = [];
    const text = htmlToText(body, fileNotes);
    notes.push(...fileNotes);
    // Pieces: [text before the first anchor, then one piece per anchor found].
    const pieces: Array<{ entry: TocEntry | null; text: string }> = [];
    let current: { entry: TocEntry | null; parts: string[] } = { entry: null, parts: [] };
    for (const para of text.split(/\n\n+/)) {
      if (para.startsWith(SPLIT_MARK)) {
        pieces.push({ entry: current.entry, text: current.parts.join('\n\n') });
        current = { entry: anchors[Number(para.slice(SPLIT_MARK.length))] ?? null, parts: [] };
      } else current.parts.push(para);
    }
    pieces.push({ entry: current.entry, text: current.parts.join('\n\n') });
    const heading = byLocalName(body as Element, 'h1')[0] ?? byLocalName(body as Element, 'h2')[0];
    // An entry whose anchor isn't in the file names the file as a whole.
    return { pieces, heading: heading?.textContent?.replace(/\s+/g, ' ').trim(), fileEntry: unfound[0] ?? null };
  };

  for (let si = 0; si < spine.length; si++) {
    const item = spine[si];
    const path = spinePaths[si];
    const read = await readDoc(item, path);
    if (!read) continue;
    const fileEntry = toc.find((t) => t.path === path && !t.anchor) ?? read.fileEntry;
    read.pieces.forEach((piece, pi) => {
      const text = piece.text;
      if (text.replace(/\s/g, '').length < 2) return;
      const entry = piece.entry ?? (pi === 0 ? fileEntry : null) ?? null;
      const chTitle = entry?.label ?? (pi === 0 ? read.heading : undefined) ?? `Section ${chapters.length + 1}`;
      // Tiny untitled fragments (e.g. a split page) are merged into the previous chapter.
      if (!entry && !(pi === 0 && read.heading) && text.length < 400 && chapters.length) {
        chapters[chapters.length - 1].text += `\n\n${text}`;
        return;
      }
      chapters.push({ title: chTitle, text });
    });
  }
  // Sections outside the reading order (often notes or extras) are kept at the end instead of being dropped.
  for (const item of extraItems) {
    const path = resolvePath(opfPath, item.href);
    const read = await readDoc(item, path);
    const text = read?.pieces.map((p) => p.text).filter(Boolean).join('\n\n') ?? '';
    if (text.replace(/\s/g, '').length < 200) continue;
    const label = toc.find((t) => t.path === path)?.label ?? read?.heading ?? 'Extra';
    extras.push(label);
    chapters.push({ title: label, text });
  }
  if (!chapters.length) throw new ImportError('No readable text was found in this EPUB.', 'empty');
  if (notes.length) chapters.push({ title: 'Notes', text: notes.join('\n\n'), kind: 'notes' });

  // Compare the table of contents with the reading order.
  const position = (t: TocEntry) => spinePaths.indexOf(t.path);
  const tocMissing = toc.filter((t) => position(t) < 0 && !extraItems.some((x) => resolvePath(opfPath, x.href) === t.path)).map((t) => t.label);
  const placed = toc.filter((t) => position(t) >= 0);
  const tocOutOfOrder: string[] = [];
  let maxPos = -1;
  for (const t of placed) {
    const p = position(t);
    if (p < maxPos) tocOutOfOrder.push(t.label);
    maxPos = Math.max(maxPos, p);
  }
  const signals: ImportSignals = {
    structure: toc.length ? 'toc' : 'spine',
    ...(tocOutOfOrder.length ? { tocOutOfOrder } : {}),
    ...(tocMissing.length ? { tocMissing } : {}),
    ...(extras.length ? { extras } : {}),
  };

  const cover = await readCover(zip, opfPath, opf, manifest).catch(() => null);
  return { title, author, format: 'epub', cover, chapters: finalizeChapters(chapters), language, signals };
}
