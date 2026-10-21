import JSZip from 'jszip';
import type { Chapter, ImportedBook } from '../types';
import { ImportError } from './errors';
import { finalizeChapters, titleFromFileName } from './text';

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'blockquote', 'pre', 'li', 'ul', 'ol', 'dl', 'dt', 'dd',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'table', 'figure', 'figcaption', 'hr', 'br', 'body', 'nav', 'main', 'address',
]);
const SKIP_TAGS = new Set(['script', 'style', 'head', 'title', 'svg', 'math', 'noscript', 'rt', 'rp']);

/** Extracts readable text from an (X)HTML document, keeping paragraph breaks. */
export function htmlToText(root: Node): string {
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out.push((node.nodeValue ?? '').replace(/\s+/g, ' '));
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node as Element).localName?.toLowerCase() ?? '';
    if (SKIP_TAGS.has(tag)) return;
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

async function readTocTitles(zip: JSZip, opfPath: string, manifest: Map<string, { href: string; type: string; props: string }>, tocId: string | null) {
  const titles = new Map<string, string>();
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
        if (href && label) {
          const key = resolvePath(path, href);
          if (!titles.has(key)) titles.set(key, label);
        }
      }
    }
  }
  if (!titles.size && ncxItem) {
    const path = resolvePath(opfPath, ncxItem.href);
    const xml = await zip.file(path)?.async('string');
    if (xml) {
      const doc = parseXml(xml);
      for (const np of byLocalName(doc, 'navPoint')) {
        const label = byLocalName(np, 'text')[0]?.textContent?.replace(/\s+/g, ' ').trim();
        const src = byLocalName(np, 'content')[0]?.getAttribute('src');
        if (label && src) {
          const key = resolvePath(path, src);
          if (!titles.has(key)) titles.set(key, label);
        }
      }
    }
  }
  return titles;
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
  const tocTitles = await readTocTitles(zip, opfPath, manifest, spineEl?.getAttribute('toc') ?? null);

  const chapters: Chapter[] = [];
  for (const item of spine) {
    const path = resolvePath(opfPath, item.href);
    const html = await zip.file(path)?.async('string');
    if (!html) continue;
    const isXhtml = /xhtml|xml/.test(item.type);
    const doc = parseXml(html, isXhtml ? 'application/xhtml+xml' : 'text/html');
    const body = doc.getElementsByTagName('body')[0] ?? doc.documentElement;
    const text = htmlToText(body);
    if (text.replace(/\s/g, '').length < 2) continue;
    const heading = byLocalName(body as Element, 'h1')[0] ?? byLocalName(body as Element, 'h2')[0];
    const chTitle =
      tocTitles.get(path) ?? heading?.textContent?.replace(/\s+/g, ' ').trim() ?? `Section ${chapters.length + 1}`;
    // Tiny untitled fragments (e.g. a split page) are merged into the previous chapter.
    if (!tocTitles.has(path) && !heading && text.length < 400 && chapters.length) {
      chapters[chapters.length - 1].text += `\n\n${text}`;
      continue;
    }
    chapters.push({ title: chTitle, text });
  }
  if (!chapters.length) throw new ImportError('No readable text was found in this EPUB.', 'empty');

  const cover = await readCover(zip, opfPath, opf, manifest).catch(() => null);
  return { title, author, format: 'epub', cover, chapters: finalizeChapters(chapters) };
}
