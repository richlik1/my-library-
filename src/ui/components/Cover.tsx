import type { Book } from '../../core/types';

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Book cover: the real cover image, or an elegant generated one. */
export function Cover({ book, size = 1 }: { book: Pick<Book, 'title' | 'author' | 'cover' | 'format' | 'ocr'>; size?: number }) {
  const h = hash(book.title + book.author);
  const hue = h % 360;
  const hue2 = (hue + 40 + (h % 60)) % 360;
  return (
    <div className="cover" style={{ fontSize: `${14 * size}px` }}>
      {book.cover ? (
        <img src={book.cover} alt="" loading="lazy" draggable={false} />
      ) : (
        <div
          className="cover-gen"
          style={{ background: `linear-gradient(155deg, hsl(${hue} 45% 32%), hsl(${hue2} 50% 16%) 70%, hsl(${hue2} 40% 10%))` }}
        >
          <div>
            <div className="t">{book.title}</div>
            <div className="rule" />
          </div>
          <div className="a">{book.author || book.format.toUpperCase()}</div>
        </div>
      )}
    </div>
  );
}

/** Resizes a user-chosen image into a small JPEG data URL for the cover. */
export async function imageFileToCover(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = 400;
    const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = Math.min(h, 800);
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The generated cover as a square PNG (data URL), for the Lock Screen and Control Center when a book has no
 * cover image. Same colours as the cover shown in the app.
 */
export function generatedCoverImage(book: Pick<Book, 'title' | 'author'>, px = 512): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const h = hash(book.title + book.author);
    const hue = h % 360;
    const hue2 = (hue + 40 + (h % 60)) % 360;
    const g = ctx.createLinearGradient(0, 0, px * 0.6, px);
    g.addColorStop(0, `hsl(${hue} 45% 32%)`);
    g.addColorStop(0.7, `hsl(${hue2} 50% 16%)`);
    g.addColorStop(1, `hsl(${hue2} 40% 10%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, px, px);
    // Title, wrapped to at most 4 lines, in a serif like the app's covers.
    const pad = px * 0.1;
    const size = px * 0.1;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `600 ${size}px Georgia, 'Times New Roman', serif`;
    ctx.textBaseline = 'top';
    const words = book.title.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > px - pad * 2 && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    lines.slice(0, 4).forEach((l, i) => ctx.fillText(i === 3 && lines.length > 4 ? `${l}…` : l, pad, pad + i * size * 1.2));
    const ruleY = pad + Math.min(4, lines.length) * size * 1.2 + size * 0.3;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(pad, ruleY, px * 0.15, Math.max(2, px * 0.006));
    if (book.author) {
      ctx.font = `500 ${px * 0.05}px -apple-system, system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(book.author, pad, px - pad - px * 0.05);
    }
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
