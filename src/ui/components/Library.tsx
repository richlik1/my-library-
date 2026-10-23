import { useCallback, useEffect, useMemo, useState } from 'react';
import { listBooks, listProgress } from '../../core/storage/db';
import type { Book, Progress } from '../../core/types';
import { navigate } from '../hooks/useRoute';
import { BookDetailsSheet } from './BookDetailsSheet';
import { Cover } from './Cover';
import { Icon } from './Icon';
import { useImporter } from './useImporter';

export function Library() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map());
  const [query, setQuery] = useState('');
  const [shelf, setShelf] = useState<string>('All Books');
  const [sort, setSort] = useState<'recent' | 'title' | 'progress'>('recent');
  const [editing, setEditing] = useState<{ book: Book; isNew: boolean } | null>(null);

  const refresh = useCallback(async () => {
    const [b, p] = await Promise.all([listBooks(), listProgress()]);
    setBooks(b);
    setProgress(new Map(p.map((x) => [x.bookId, x])));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const importer = useImporter(
    useCallback(
      (added: Book[], openDetails: boolean) => {
        refresh();
        if (openDetails) setEditing({ book: added[0], isNew: true });
      },
      [refresh],
    ),
  );

  const shelves = useMemo(() => {
    const cats = [...new Set((books ?? []).map((b) => b.category))].sort();
    const s = ['All Books'];
    if ((books ?? []).some((b) => (progress.get(b.id)?.percent ?? 0) > 0 && !progress.get(b.id)?.finished)) s.push('Currently Reading');
    if ((books ?? []).some((b) => !(progress.get(b.id)?.percent ?? 0) && !progress.get(b.id)?.finished)) s.push('Unread');
    if ((books ?? []).some((b) => b.favorite)) s.push('Favorites');
    if ((books ?? []).some((b) => progress.get(b.id)?.finished)) s.push('Completed');
    return [...s, ...cats];
  }, [books, progress]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (books ?? []).filter((b) => {
      const p = progress.get(b.id);
      if (shelf === 'Currently Reading' && !((p?.percent ?? 0) > 0 && !p?.finished)) return false;
      if (shelf === 'Unread' && ((p?.percent ?? 0) > 0 || p?.finished)) return false;
      if (shelf === 'Favorites' && !b.favorite) return false;
      if (shelf === 'Completed' && !p?.finished) return false;
      if (!['All Books', 'Currently Reading', 'Unread', 'Favorites', 'Completed'].includes(shelf) && b.category !== shelf) return false;
      return !q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.category.toLowerCase().includes(q);
    });
    const pct = (b: Book) => (progress.get(b.id)?.finished ? 1 : (progress.get(b.id)?.percent ?? 0));
    if (sort === 'title') return [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'progress') return [...list].sort((a, b) => pct(b) - pct(a));
    return list; // already newest first by last opened / added
  }, [books, progress, query, shelf, sort]);

  return (
    <div className="page tab-page">
      <header className="topbar">
        <h1>Library</h1>
        <button className="icon-btn" onClick={importer.openPaste} aria-label="Paste text as a book">
          <Icon name="text" />
        </button>
        <importer.AddLabel className="btn btn-primary" label="Add a book">
          <Icon name="plus" size={18} /> Add
        </importer.AddLabel>
      </header>
      {importer.ui}

      {books && books.length === 0 && (
        <div className="empty">
          <h2>No books yet</h2>
          <p>Add a PDF, EPUB, Word, RTF, web page or text book to start your shelf.</p>
          <importer.AddLabel className="btn btn-primary">
            <Icon name="plus" size={18} /> Add a book
          </importer.AddLabel>
        </div>
      )}

      {books && books.length > 0 && (
        <>
          <div className="search" style={{ marginTop: 4 }}>
            <Icon name="search" size={20} />
            <input type="search" placeholder="Search title, author or category" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search books" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
 <div className="small muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span aria-hidden="true">Sort</span>
              <select id="library-sort" aria-label="Sort books" className="input" style={{ width: 'auto', minHeight: 34, padding: '4px 10px', fontSize: 14 }} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="recent">Last opened</option>
                <option value="title">Title</option>
                <option value="progress">Progress</option>
              </select>
            </div>
          </div>
          <div className="chips" role="tablist">
            {shelves.map((s) => (
              <button key={s} className={`chip ${shelf === s ? 'active' : ''}`} onClick={() => setShelf(s)} role="tab" aria-selected={shelf === s}>
                {s}
              </button>
            ))}
          </div>

          <div className="grid" style={{ marginTop: 10 }}>
            {visible.map((b) => {
              const p = progress.get(b.id);
              return (
                <div key={b.id} className="book-card">
                  <button onClick={() => navigate(`/book/${b.id}`)} aria-label={`Open ${b.title}`} style={{ textAlign: 'left' }}>
                    <div style={{ position: 'relative' }}>
                      <Cover book={b} />
                      {/* A generated cover without an author already shows the format. */}
                      {(b.cover || b.author) && <span className="badge">{b.format}</span>}
                      {b.ocr && <span className="badge warn">OCR</span>}
                    </div>
                  </button>
                  <button className="more" onClick={() => setEditing({ book: b, isNew: false })} aria-label={`Details for ${b.title}`}>
                    <Icon name="more" size={20} />
                  </button>
                  <div className="progress-line">
                    <i style={{ width: `${(p?.percent ?? 0) * 100}%` }} />
                  </div>
                  <div className="meta">
                    <div className="title">{b.title}</div>
                    <div className="author">{p?.finished ? 'Completed' : b.author || b.category}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {visible.length === 0 && <p className="muted" style={{ textAlign: 'center', marginTop: 30 }}>No books match.</p>}
        </>
      )}

      {editing && (
        <BookDetailsSheet
          book={editing.book}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSaved={() => refresh()}
          onDeleted={() => refresh()}
        />
      )}
    </div>
  );
}
