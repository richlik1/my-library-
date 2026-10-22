import { useMemo, useState } from 'react';
import { CATEGORIES } from '../../growth/categories';
import { CATALOG } from '../../growth/catalog';
import { STATUS_LABEL, isBlockComplete, isoWeek, localDate, pickFocusBook, searchCatalog, streak, weekStats } from '../../growth/plan';
import type { CatalogBook, CategoryId, ReadingStatus } from '../../growth/types';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { navigate } from '../hooks/useRoute';
import { useGrowth, type GrowthData } from './useGrowth';

export function GrowthHome() {
  const g = useGrowth();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryId | 'all'>('all');
  const [status, setStatus] = useState<ReadingStatus | 'all'>('all');

  const results = useMemo(() => searchCatalog(CATALOG, { query, category, status }, g.states, g.notes), [query, category, status, g.states, g.notes]);
  const filtered = query.trim() !== '' || category !== 'all' || status !== 'all';
  const finished = CATALOG.filter((b) => g.states.get(b.id)?.status === 'finished').length;

  return (
    <div className="page">
      <header className="topbar">
        <a className="icon-btn" href="#/discover" aria-label="Back to Discover">
          <Icon name="chevronLeft" />
        </a>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">LYONS AI</div>
          <h1 style={{ fontSize: 28 }}>Growth Library</h1>
        </div>
        <button className="btn" onClick={() => navigate('/growth/notes')}>
          Notes &amp; plans
        </button>
      </header>

      {g.loaded && <Overview g={g} />}

      <div className="section-title">
        Catalog · {finished} of {CATALOG.length} finished
      </div>
      <div className="search">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
        </svg>
        <input id="growth-search" type="search" placeholder="Search books, skills, ideas or your notes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the catalog" />
      </div>
      <div className="chips">
        <button className={`chip ${category === 'all' ? 'active' : ''}`} onClick={() => setCategory('all')}>
          All
        </button>
        {CATEGORIES.map((c) =>
          c.id === 'notes' ? (
            <button key={c.id} className="chip" onClick={() => navigate('/growth/notes')}>
              {c.name}
            </button>
          ) : (
            <button key={c.id} className={`chip ${category === c.id ? 'active' : ''}`} onClick={() => setCategory(c.id)}>
              {c.name}
            </button>
          ),
        )}
      </div>
      <div className="chips">
        {(['all', 'not-started', 'reading', 'finished', 'rereading'] as const).map((s) => (
          <button key={s} className={`chip ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
            {s === 'all' ? 'Any status' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {filtered ? (
        <BookList books={results} g={g} />
      ) : (
        CATEGORIES.filter((c) => c.id !== 'notes').map((c) => (
          <section key={c.id}>
            <div className="section-title" style={{ marginBottom: 0 }}>
              {c.name}
            </div>
            <p className="muted small" style={{ margin: '4px 0 0' }}>
              {c.blurb}
            </p>
            <BookList books={results.filter((b) => b.category === c.id)} g={g} />
          </section>
        ))
      )}
      {results.length === 0 && <p className="muted">No books match. Try another word or clear the filters.</p>}
      <p className="muted small" style={{ marginTop: 28 }}>
        Summaries, quizzes and exercises are original study material written for this library. To read or listen to a full book, use your own
        copy (purchase or library loan) and import it into Audiobooks.
      </p>
    </div>
  );
}

function Overview({ g }: { g: GrowthData }) {
  const today = localDate();
  const block = g.blocks.find((b) => b.date === today);
  const focus = block ? CATALOG.find((b) => b.id === block.bookId) ?? pickFocusBook(CATALOG, g.states) : pickFocusBook(CATALOG, g.states);
  const doneCount = block ? Object.values(block.segments).filter(Boolean).length : 0;
  const days = streak(g.blocks, today);
  const week = isoWeek();
  const stats = weekStats(week, g.blocks, [...g.states.values()], g.notes);
  const reviewed = g.reviews.some((r) => r.week === week);
  const isWeekend = [0, 6].includes(new Date().getDay());
  return (
    <div className="g-cards">
      <div className="card">
        <div className="eyebrow">Today · 30 minutes</div>
        <h3>{isBlockComplete(block) ? 'Done for today ✓' : focus.title}</h3>
        <div className="seg-dots" aria-label={`${doneCount} of 4 parts done`}>
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className={i < doneCount ? 'on' : ''} />
          ))}
        </div>
        <p className="muted small">
          {days > 0 ? `${days}-day streak. ` : ''}Review 5 · Read 15 · Practice 5 · Apply 5
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/growth/today')}>
          {doneCount === 0 ? 'Start today’s block' : isBlockComplete(block) ? 'See today' : 'Continue'}
        </button>
      </div>
      <div className="card">
        <div className="eyebrow">This week · {week.slice(5)}</div>
        <h3>{reviewed ? 'Weekly review done ✓' : isWeekend ? 'Weekly review is due' : 'Weekly accountability'}</h3>
        <p className="muted small">
          {stats.blocks} blocks · {stats.minutes} min · {stats.actionsDone} actions done · {stats.actionsOpen} open
        </p>
        <button className={`btn ${!reviewed && isWeekend ? 'btn-primary' : ''}`} onClick={() => navigate('/growth/review')}>
          {reviewed ? 'Open review' : 'Do the review'}
        </button>
      </div>
      <div className="card">
        <div className="eyebrow">Mentor</div>
        <h3>Coach me through it</h3>
        <p className="muted small">Conversations, leadership, sales, decisions and fatherhood, using the frameworks from your books.</p>
        <button className="btn" onClick={() => navigate('/mentor')}>
          Open mentor
        </button>
      </div>
    </div>
  );
}

function BookList({ books, g }: { books: CatalogBook[]; g: GrowthData }) {
  return (
    <div>
      {books.map((b) => {
        const st = g.states.get(b.id)?.status ?? 'not-started';
        return (
          <button key={b.id} className="g-row" onClick={() => navigate(`/growth/book/${b.id}`)} aria-label={`Open ${b.title}`}>
            <Cover book={{ title: b.title, author: b.author, cover: null, format: 'txt' }} />
            <span style={{ minWidth: 0 }}>
              <span className="t">
                {b.order}. {b.title}
                {b.order === 1 && <span className="read-first">Read first</span>}
              </span>
              <span className="s" style={{ display: 'block' }}>
                {b.author} · {b.skill}
              </span>
            </span>
            <span className={`status ${st}`}>{STATUS_LABEL[st]}</span>
          </button>
        );
      })}
    </div>
  );
}
