import { useState } from 'react';
import { categoryName } from '../../growth/categories';
import { catalogBook } from '../../growth/catalog';
import { STATUS_LABEL, scoreQuiz, sourceLinks } from '../../growth/plan';
import { deleteNote, saveNote, updateState } from '../../growth/store';
import type { CatalogBook, GrowthBookState, GrowthNote, ReadingStatus } from '../../growth/types';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { awardXp } from '../../core/storage/db';
import { XP_RULES, xpIds } from '../../core/habits';
import { habitsChanged } from '../hooks/useHabits';
import { useToast } from '../hooks/toast';
import { navigate } from '../hooks/useRoute';
import { useGrowth, type GrowthData } from './useGrowth';

type Tab = 'summary' | 'apply' | 'exercises' | 'quiz' | 'notes';

export function GrowthBook({ id }: { id: string }) {
  const book = catalogBook(id);
  const g = useGrowth();
  const [tab, setTab] = useState<Tab>('summary');
  if (!book)
    return (
      <div className="page">
        <p>That book is not in the catalog.</p>
        <a className="btn" href="#/growth">
          Back to the Growth Library
        </a>
      </div>
    );
  const state = g.states.get(book.id);
  const set = async (patch: Partial<GrowthBookState>) => {
    await updateState(book.id, patch);
    await g.refresh();
  };

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate('/growth')} aria-label="Back to the Growth Library">
          <Icon name="chevronLeft" />
        </button>
        <div className="eyebrow" style={{ flex: 1 }}>
          {categoryName(book.category)}
        </div>
      </header>

      <div className="g-head">
        <Cover book={{ title: book.title, author: book.author, cover: null, format: 'txt' }} size={0.9} />
        <div style={{ minWidth: 0 }}>
          <h1>{book.title}</h1>
          <div className="muted">
            {book.author} · {book.year}
          </div>
          <p style={{ margin: '8px 0', color: 'var(--text-2)' }}>{book.skill}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="sr-only" htmlFor="status">
              Reading status
            </label>
            <select id="status" className="input" style={{ width: 'auto', minHeight: 40 }} value={state?.status ?? 'not-started'} onChange={(e) => set({ status: e.target.value as ReadingStatus })}>
              {(Object.keys(STATUS_LABEL) as ReadingStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <span className="stars" aria-label="Your rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={(state?.rating ?? 0) >= n ? 'on' : ''} onClick={() => set({ rating: n })} aria-label={`${n} star${n > 1 ? 's' : ''}`}>
                  ★
                </button>
              ))}
            </span>
          </div>
        </div>
      </div>

      <YourCopy book={book} g={g} state={state} onLink={(linkedBookId) => set({ linkedBookId })} />

      <div className="tabs" role="tablist">
        {(
          [
            ['summary', 'Summary'],
            ['apply', 'Apply it'],
            ['exercises', 'Exercises'],
            ['quiz', 'Quiz'],
            ['notes', `Notes (${g.notes.filter((n) => n.bookId === book.id).length})`],
          ] as Array<[Tab, string]>
        ).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <>
          <p className="prose">{book.summary}</p>
          <div className="section-title">Key ideas</div>
          <ul className="ideas">
            {book.keyIdeas.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </>
      )}
      {tab === 'apply' && <Apply book={book} g={g} />}
      {tab === 'exercises' && <Exercises book={book} state={state} onToggle={(done) => set({ exercisesDone: done })} />}
      {tab === 'quiz' && <Quiz key={book.id} book={book} state={state} onScore={(score) => {
            set({ quizAttempts: (state?.quizAttempts ?? 0) + 1, quizBest: Math.max(score, state?.quizBest ?? 0) });
            void awardXp({ id: xpIds.quiz(book.id), kind: 'quiz', amount: XP_RULES.quiz, at: Date.now(), label: `Completed the ${book.title} quiz` }).then(habitsChanged);
          }} />}
      {tab === 'notes' && <BookNotes book={book} g={g} />}
    </div>
  );
}

function YourCopy({ book, g, state, onLink }: { book: CatalogBook; g: GrowthData; state?: GrowthBookState; onLink(id: string | undefined): void }) {
  const linked = g.libraryBooks.find((b) => b.id === state?.linkedBookId);
  return (
    <section className="card">
      <h3>Your copy</h3>
      {linked ? (
        <>
          <p>
            Linked to “{linked.title}” in your Audiobooks shelf.
          </p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => navigate(`/book/${linked.id}`)}>
              <Icon name="play" size={16} /> Listen
            </button>
            <button className="btn btn-ghost" onClick={() => onLink(undefined)}>
              Unlink
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            The library does not include the full text. Borrow or buy a copy, import it in Audiobooks, then link it here to listen during
            your daily block.
          </p>
          {g.libraryBooks.length > 0 && (
            <label className="field">
              <span>Link a book from your Audiobooks shelf</span>
              <select defaultValue="" onChange={(e) => e.target.value && onLink(e.target.value)}>
                <option value="">Choose…</option>
                {g.libraryBooks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {sourceLinks(book).map((l) => (
              <a key={l.url} className="btn wrap" href={l.url} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Apply({ book, g }: { book: CatalogBook; g: GrowthData }) {
  const toast = useToast();
  const add = async (text: string, area: GrowthNote['area']) => {
    await saveNote({ bookId: book.id, kind: 'action', text, area });
    await g.refresh();
    toast('Added to your action plan');
  };
  const group = (title: string, items: string[], area: GrowthNote['area']) => (
    <section>
      <div className="section-title">{title}</div>
      {items.map((t) => (
        <div key={t} className="apply-item">
          <span>{t}</span>
          <button className="btn" onClick={() => add(t, area)}>
            + Action
          </button>
        </div>
      ))}
    </section>
  );
  return (
    <>
      {group(g.profile.lyons.split(' — ')[0] || 'Lyons Cleaning Solutions', book.lyons, 'lyons')}
      {group(g.profile.stayops.split(' — ')[0] || 'StayOps', book.stayops, 'stayops')}
      {group('Home & family', [book.personal], 'family')}
    </>
  );
}

function Exercises({ book, state, onToggle }: { book: CatalogBook; state?: GrowthBookState; onToggle(done: string[]): void }) {
  // Local copy so the checkbox responds instantly; storage catches up in the background.
  const [done, setDone] = useState<string[]>(state?.exercisesDone ?? []);
  const toggle = (next: string[]) => {
    setDone(next);
    onToggle(next);
  };
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {book.exercises.map((e) => {
        const isDone = done.includes(e.id);
        return (
          <div key={e.id} className="card" style={{ margin: 0 }}>
            <label className={`check ${isDone ? 'done' : ''}`}>
              <input type="checkbox" checked={isDone} onChange={() => toggle(isDone ? done.filter((x) => x !== e.id) : [...done, e.id])} />
              <span>
                <span className="check-title">{e.title}</span> <span className="muted small">· {e.minutes} min</span>
                <ol className="steps" style={{ marginTop: 8 }}>
                  {e.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </span>
            </label>
          </div>
        );
      })}
    </div>
  );
}

function Quiz({ book, state, onScore }: { book: CatalogBook; state?: GrowthBookState; onScore(score: number): void }) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => book.quiz.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const score = scoreQuiz(book.quiz, answers);
  return (
    <div>
      {state?.quizAttempts ? (
        <p className="muted small">
          Best score: {state.quizBest ?? 0}/{book.quiz.length} · {state.quizAttempts} attempt{state.quizAttempts > 1 ? 's' : ''}
        </p>
      ) : null}
      {book.quiz.map((item, qi) => (
        <div key={qi} className="quiz-q">
          <h4>
            {qi + 1}. {item.q}
          </h4>
          {item.options.map((o, oi) => {
            const cls = submitted ? (oi === item.answer ? 'right' : answers[qi] === oi ? 'wrong' : '') : answers[qi] === oi ? 'picked' : '';
            return (
              <button key={oi} className={`quiz-opt ${cls}`} disabled={submitted} onClick={() => setAnswers((a) => a.map((x, i) => (i === qi ? oi : x)))}>
                {o}
              </button>
            );
          })}
          {submitted && <p className="muted small">{item.why}</p>}
        </div>
      ))}
      {!submitted ? (
        <button
          className="btn btn-primary"
          disabled={answers.some((a) => a === null)}
          onClick={() => {
            setSubmitted(true);
            onScore(score);
          }}
        >
          Check answers
        </button>
      ) : (
        <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <strong>
            You scored {score}/{book.quiz.length}
          </strong>
          <button
            className="btn"
            onClick={() => {
              setAnswers(book.quiz.map(() => null));
              setSubmitted(false);
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function BookNotes({ book, g }: { book: CatalogBook; g: GrowthData }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'note' | 'action'>('note');
  const notes = g.notes.filter((n) => n.bookId === book.id);
  return (
    <div>
      <label className="field">
        <span>Add a note or action</span>
        <textarea id="book-note" value={text} onChange={(e) => setText(e.target.value)} placeholder="What stood out? What will you do differently?" />
      </label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button className={`chip ${kind === 'note' ? 'active' : ''}`} onClick={() => setKind('note')}>
          Note
        </button>
        <button className={`chip ${kind === 'action' ? 'active' : ''}`} onClick={() => setKind('action')}>
          Action item
        </button>
        <button
          className="btn btn-primary"
          disabled={!text.trim()}
          onClick={async () => {
            await saveNote({ bookId: book.id, kind, text: text.trim() });
            setText('');
            await g.refresh();
          }}
        >
          Save
        </button>
      </div>
      <NoteList notes={notes} g={g} />
    </div>
  );
}

export function NoteList({ notes, g, showBook }: { notes: GrowthNote[]; g: GrowthData; showBook?: boolean }) {
  if (!notes.length) return <p className="muted">Nothing here yet.</p>;
  return (
    <ul className="list">
      {notes.map((n) => (
        <li key={n.id}>
          <div className="list-row" style={{ alignItems: 'flex-start' }}>
            {n.kind === 'action' ? (
              <input
                type="checkbox"
                aria-label="Done"
                checked={!!n.done}
                style={{ width: 22, height: 22, marginTop: 2, accentColor: 'var(--accent)' }}
                onChange={async () => {
                  await saveNote({ ...n, done: !n.done });
                  await g.refresh();
                }}
              />
            ) : (
              <Icon name="note" size={18} />
            )}
            <div className="grow">
              <div className="sub">
                {n.kind === 'action' ? 'Action' : 'Note'}
                {n.area ? ` · ${{ lyons: 'Lyons Cleaning', stayops: 'StayOps', family: 'Family', personal: 'Personal' }[n.area]}` : ''}
                {showBook && n.bookId ? ` · ${catalogBook(n.bookId)?.title ?? ''}` : ''} · {new Date(n.createdAt).toLocaleDateString()}
              </div>
              <div className="note-text" style={{ textDecoration: n.done ? 'line-through' : undefined, color: n.done ? 'var(--text-3)' : undefined }}>
                {n.text}
              </div>
            </div>
            <button
              className="icon-btn"
              aria-label="Delete"
              onClick={async () => {
                await deleteNote(n.id);
                await g.refresh();
              }}
            >
              <Icon name="trash" size={18} />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
