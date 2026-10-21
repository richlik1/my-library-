import type { Book } from '../../core/types';

function hash(s: string) {
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
