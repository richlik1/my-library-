import { useEffect, useState } from 'react';
import { promptsForDay, recommend, type Recommendation } from '../../core/recommend';
import { listAllAnnotations, listBooks, listProgress } from '../../core/storage/db';
import type { Book } from '../../core/types';
import { useSettings } from '../hooks/settings';
import { navigate } from '../hooks/useRoute';
import { Cover } from './Cover';
import { Icon } from './Icon';

/** Discover: what to listen to next, from your own library, plus the learning programs. */
export function DiscoverPage() {
  const { settings, update } = useSettings();
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    (async () => {
      const [b, p, a] = await Promise.all([listBooks(), listProgress(), listAllAnnotations()]);
      setBooks(b);
      setRecs(recommend(b, new Map(p.map((x) => [x.bookId, x])), a));
    })();
  }, []);

  const shown = settings.personalizedDiscover ? (recs ?? []) : [];

  return (
    <div className="page tab-page">
      <header className="topbar">
        <h1>Discover</h1>
      </header>

      <section aria-labelledby="next-h">
        <h2 className="section-title" id="next-h">
          Up next from your library
        </h2>
        {!settings.personalizedDiscover ? (
          <p className="muted small">Personalized suggestions are off.</p>
        ) : recs && recs.length === 0 ? (
          <p className="muted small">{books.length ? 'You’ve finished everything in your library. Add another book to get suggestions.' : 'Add books to your library to get suggestions here.'}</p>
        ) : (
          <ul className="rec-list">
            {shown.slice(0, 6).map((r) => (
              <li key={r.book.id}>
                <button className="rec" onClick={() => navigate(`/book/${r.book.id}`)} aria-label={`Open ${r.book.title}`}>
                  <span className="rec-cover">
                    <Cover book={r.book} size={0.35} />
                  </span>
                  <span className="rec-body">
                    <span className="rec-kind">
                      {{ continue: 'Pick up again', revisit: 'Revisit', 'unread-favorite': 'Start next', unread: 'Not started' }[r.kind]}
                    </span>
                    <span className="rec-title">{r.book.title}</span>
                    <span className="rec-why">{r.why}</span>
                  </span>
                  <Icon name="chevronRight" size={20} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="switch" style={{ borderBottom: 0 }}>
          <span>
            Personalized suggestions
            <small>Based only on your progress, notes and categories, on this device.</small>
          </span>
          <input type="checkbox" checked={settings.personalizedDiscover} onChange={(e) => update({ personalizedDiscover: e.target.checked })} />
        </label>
      </section>

      <section aria-labelledby="learn-h">
        <h2 className="section-title" id="learn-h">
          Learning
        </h2>
        <div className="discover-grid">
          <a className="discover-card" href="#/growth">
            <Icon name="book" size={26} />
            <strong>Growth Library</strong>
            <span>21 books for business, leadership, money and family: summaries, quizzes and a daily 30-minute plan.</span>
          </a>
          <a className="discover-card" href="#/club">
            <Icon name="note" size={26} />
            <strong>Book Club</strong>
            <span>Talk through the chapter you’re on: discussion and reflection questions, and a quiz for Growth Library books.</span>
          </a>
          <a className="discover-card" href="#/mentor">
            <Icon name="user" size={26} />
            <strong>Mentor</strong>
            <span>Guided plans for conversations and decisions, built from the Growth Library. Works offline.</span>
          </a>
        </div>
      </section>

      <section aria-labelledby="prompts-h">
        <h2 className="section-title" id="prompts-h">
          Today’s reading prompts
        </h2>
        <ul className="prompt-list">
          {promptsForDay().map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
