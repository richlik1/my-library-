import { useRef, useState } from 'react';
import { deleteBook, updateBook } from '../../core/storage/db';
import type { Book } from '../../core/types';
import { useSettings } from '../hooks/settings';
import { useToast } from '../hooks/toast';
import { Cover, imageFileToCover } from './Cover';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

export function BookDetailsSheet({
  book,
  isNew,
  onClose,
  onSaved,
  onDeleted,
}: {
  book: Book;
  isNew?: boolean;
  onClose: () => void;
  onSaved: (b: Book) => void;
  onDeleted: (id: string) => void;
}) {
  const { settings, update } = useSettings();
  const toast = useToast();
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [category, setCategory] = useState(book.category);
  const [newCategory, setNewCategory] = useState('');
  const [cover, setCover] = useState(book.cover);
  const [favorite, setFavorite] = useState(!!book.favorite);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const categories = settings.categories.includes(category) || !category ? settings.categories : [...settings.categories, category];

  const save = async () => {
    let cat = category;
    const extra = newCategory.trim();
    if (category === '__new' && extra) {
      cat = extra;
      if (!settings.categories.includes(extra)) update({ categories: [...settings.categories, extra] });
    } else if (category === '__new') cat = 'Other';
    const next = await updateBook(book.id, { title: title.trim() || book.title, author: author.trim(), category: cat, cover, favorite });
    if (next) onSaved(next);
    onClose();
  };

  const remove = async () => {
    await deleteBook(book.id);
    toast(`Deleted “${book.title}”`);
    onDeleted(book.id);
    onClose();
  };

  return (
    <Sheet title={isNew ? 'Book added' : 'Book details'} onClose={onClose}>
      {book.ocr && (
        <div className="banner warn">
          <span className="icon-wrap">
            <Icon name="info" />
          </span>
          <div className="banner-body">
            <strong>Some pages need OCR.</strong> {book.ocr.imageOnlyPages.length} of {book.ocr.totalPages} pages are scanned images
            (pages {formatPages(book.ocr.imageOnlyPages)}). They have no text to read aloud and will be skipped. Run the PDF through a free OCR
            tool (e.g. iPhone Live Text or OCRmyPDF) and import it again to hear those pages.
          </div>
        </div>
      )}
      <div className="cover-edit">
        <Cover book={{ ...book, title, author, cover }} />
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} /> Choose cover
          </button>
          {cover && (
            <button className="btn btn-ghost" onClick={() => setCover(null)}>
              Use generated cover
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                setCover(await imageFileToCover(f));
              } catch {
                toast('That image could not be used.', { kind: 'error' });
              }
            }}
          />
        </div>
      </div>
      <label className="field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span>Author</span>
        <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Unknown" />
      </label>
      <label className="field">
        <span>Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="__new">+ New category…</option>
        </select>
      </label>
      {category === '__new' && (
        <label className="field">
          <span>New category name</span>
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} autoFocus />
        </label>
      )}
      <label className="switch">
        <span>
          Favorite
          <small>Show in the Favorites shelf</small>
        </span>
        <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />
      </label>
      <p className="muted small">
        {book.format.toUpperCase()} · {book.fileName} · {formatBytes(book.fileSize)} · {book.chapterCount} {book.chapterCount === 1 ? 'chapter' : 'chapters'} · about{' '}
        {listeningHours(book.charCount)} of listening
      </p>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        <button className="btn btn-primary btn-block" onClick={save}>
          {isNew ? 'Save to library' : 'Save changes'}
        </button>
        {!confirmDelete ? (
          <button className="btn btn-ghost btn-danger btn-block" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={18} /> Delete book
          </button>
        ) : (
          <button className="btn btn-danger btn-block" onClick={remove}>
            Tap again to delete the book, its progress and notes
          </button>
        )}
      </div>
    </Sheet>
  );
}

export function formatPages(pages: number[]): string {
  const ranges: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    ranges.push(i === j ? `${pages[i]}` : `${pages[i]}–${pages[j]}`);
    i = j;
  }
  return ranges.length > 8 ? `${ranges.slice(0, 8).join(', ')}…` : ranges.join(', ');
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Rough listening time at 1× (about 15 characters per second). */
export function listeningHours(chars: number, rate = 1): string {
  const minutes = Math.round(chars / 15 / rate / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
