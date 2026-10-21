import { useEffect, useMemo, useState } from 'react';
import { CATALOG, catalogBook } from '../../growth/catalog';
import { buildDailyPlan, emptyReview, emptySegments, isBlockComplete, isoWeek, localDate, pickFocusBook, streak, weekStats } from '../../growth/plan';
import { saveBlock, saveNote, saveReview, updateState } from '../../growth/store';
import type { DailyBlock, GrowthNote, SegmentId, WeeklyReview } from '../../growth/types';
import { Icon } from '../components/Icon';
import { downloadBlob } from '../components/PlayerSheets';
import { useToast } from '../hooks/toast';
import { navigate } from '../hooks/useRoute';
import { NoteList } from './GrowthBook';
import { useGrowth } from './useGrowth';

function Back({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={() => navigate('/growth')} aria-label="Back to the Growth Library">
        <Icon name="chevronLeft" />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 style={{ fontSize: 26 }}>{title}</h1>
      </div>
    </header>
  );
}

// ---- Daily 30-minute block -------------------------------------------------------

export function TodayPage() {
  const g = useGrowth();
  const toast = useToast();
  const today = localDate();
  const [block, setBlock] = useState<DailyBlock | null>(null);

  useEffect(() => {
    if (!g.loaded) return;
    const existing = g.blocks.find((b) => b.date === today);
    setBlock(existing ?? { date: today, bookId: pickFocusBook(CATALOG, g.states).id, segments: emptySegments() });
  }, [g.loaded, g.blocks, g.states, today]);

  if (!block) return <div className="page" />;
  const book = catalogBook(block.bookId) ?? CATALOG[0];
  const state = g.states.get(book.id);
  const linked = g.libraryBooks.find((b) => b.id === state?.linkedBookId);
  const plan = buildDailyPlan(today, book, state, !!linked);
  const done = isBlockComplete(block);

  const persist = async (next: DailyBlock) => {
    const complete = isBlockComplete(next);
    const final = complete && !next.completedAt ? { ...next, completedAt: Date.now() } : next;
    setBlock(final);
    await saveBlock(final);
    if (complete && !block.completedAt) {
      await updateState(book.id, { minutes: (state?.minutes ?? 0) + 30, ...(state?.status === 'not-started' || !state ? { status: 'reading' as const } : {}) });
      toast('30 minutes done. See you tomorrow!');
    }
    await g.refresh();
  };
  const toggle = (id: SegmentId) => persist({ ...block, segments: { ...block.segments, [id]: !block.segments[id] } });
  const reading = CATALOG.filter((b) => ['reading', 'rereading'].includes(g.states.get(b.id)?.status ?? ''));
  const choices = [...new Map([book, ...reading, pickFocusBook(CATALOG, g.states)].map((b) => [b.id, b])).values()];

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <Back title="Today’s 30 minutes" eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} />
      <p className="muted">
        {streak(g.blocks, today) > 0 ? `${streak(g.blocks, today)}-day streak · ` : ''}Focus book:{' '}
        <a href={`#/growth/book/${book.id}`} style={{ color: 'var(--accent)' }}>
          {book.title}
        </a>
      </p>
      {choices.length > 1 && !done && (
        <label className="field" style={{ maxWidth: 360 }}>
          <span>Change today’s book</span>
          <select value={book.id} onChange={(e) => persist({ ...block, bookId: e.target.value })}>
            {choices.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <div style={{ display: 'grid', gap: 12 }}>
        {plan.map((s) => (
          <div key={s.id} className="card" style={{ margin: 0 }}>
            <label className={`check ${block.segments[s.id] ? 'done' : ''}`}>
              <input type="checkbox" checked={block.segments[s.id]} onChange={() => toggle(s.id)} />
              <span>
                <span className="check-title">{s.title}</span> <span className="muted small">· {s.minutes} min</span>
                <span style={{ display: 'block', marginTop: 6, color: 'var(--text-2)' }}>{s.detail}</span>
              </span>
            </label>
            {s.id === 'read' && linked && (
              <button className="btn" style={{ marginTop: 10 }} onClick={() => navigate(`/book/${linked.id}`)}>
                <Icon name="play" size={16} /> Listen to your copy
              </button>
            )}
            {s.id === 'read' && !linked && (
              <button className="btn" style={{ marginTop: 10 }} onClick={() => navigate(`/growth/book/${book.id}`)}>
                Open summary &amp; key ideas
              </button>
            )}
          </div>
        ))}
      </div>
      <label className="field" style={{ marginTop: 18 }}>
        <span>One thing I learned or will do</span>
        <textarea id="reflection" value={block.reflection ?? ''} onChange={(e) => setBlock({ ...block, reflection: e.target.value })} onBlur={() => saveBlock(block)} placeholder="Write one sentence" />
      </label>
      <button
        className="btn"
        disabled={!block.reflection?.trim()}
        onClick={async () => {
          await saveBlock(block);
          await saveNote({ bookId: book.id, kind: 'note', text: block.reflection!.trim() });
          await g.refresh();
          toast('Saved to your notes');
        }}
      >
        Save to notes
      </button>
    </div>
  );
}

// ---- Weekly accountability review ---------------------------------------------------

const QUESTIONS: Array<[keyof WeeklyReview, string, string]> = [
  ['wins', 'Wins this week', 'What went well? What are you proud of?'],
  ['lyons', 'What I applied at Lyons Cleaning Solutions', 'A habit, conversation, system or number you changed'],
  ['stayops', 'What I applied at StayOps', 'Product, customers, partners, focus'],
  ['family', 'Home and fatherhood', 'Where were you present? What needs attention?'],
  ['missed', 'What I avoided or missed, and why', 'Be honest. Own it, without excuses.'],
  ['lesson', 'Biggest lesson', 'One sentence'],
  ['commitment', 'One commitment for next week', 'Specific and measurable'],
];

export function ReviewPage() {
  const g = useGrowth();
  const toast = useToast();
  const week = isoWeek();
  const [r, setR] = useState<WeeklyReview>(emptyReview(week));
  useEffect(() => {
    const saved = g.reviews.find((x) => x.week === week);
    if (saved) setR(saved);
  }, [g.reviews, week]);
  const stats = weekStats(week, g.blocks, [...g.states.values()], g.notes);
  const previous = g.reviews.filter((x) => x.week !== week);
  const lastCommitment = previous[0]?.commitment;

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <Back title="Weekly review" eyebrow={`Week ${week.slice(6)} · ${week.slice(0, 4)}`} />
      <div className="stats">
        <div>
          <b>{stats.blocks}/7</b>
          <span>daily blocks</span>
        </div>
        <div>
          <b>{stats.minutes}</b>
          <span>minutes learning</span>
        </div>
        <div>
          <b>{stats.actionsDone}</b>
          <span>actions done</span>
        </div>
        <div>
          <b>{stats.actionsOpen}</b>
          <span>actions open</span>
        </div>
        <div>
          <b>{stats.booksFinished}</b>
          <span>books finished</span>
        </div>
      </div>
      {lastCommitment && (
        <div className="banner">
          <span className="icon-wrap">
            <Icon name="check" />
          </span>
          <div className="banner-body">
            <strong>Last week you committed to:</strong> {lastCommitment}
          </div>
        </div>
      )}
      {QUESTIONS.map(([key, label, hint]) => (
        <label key={key} className="field">
          <span>{label}</span>
          <textarea id={`review-${key}`} value={String(r[key] ?? '')} placeholder={hint} onChange={(e) => setR({ ...r, [key]: e.target.value })} style={{ minHeight: 80 }} />
        </label>
      ))}
      <div className="rate-row">
        <div className="rate-head">
          <span>How well did I keep my commitments? (1–10)</span>
          <span>{r.score}</span>
        </div>
        <input id="review-score" type="range" min={1} max={10} step={1} value={r.score} onChange={(e) => setR({ ...r, score: Number(e.target.value) })} aria-label="Accountability score" />
      </div>
      <button
        className="btn btn-primary btn-block"
        onClick={async () => {
          await saveReview(r);
          if (r.commitment.trim()) await saveNote({ bookId: null, kind: 'action', text: `Weekly commitment (${week}): ${r.commitment.trim()}`, area: 'personal' });
          await g.refresh();
          toast('Weekly review saved. Your commitment is in your action plan.');
        }}
      >
        Save review
      </button>
      {previous.length > 0 && (
        <>
          <div className="section-title">Past reviews</div>
          <ul className="list">
            {previous.map((p) => (
              <li key={p.week} className="list-row" style={{ display: 'block' }}>
                <strong>{p.week}</strong> · score {p.score}/10
                {p.commitment && <div className="sub">Commitment: {p.commitment}</div>}
                {p.lesson && <div className="sub">Lesson: {p.lesson}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ---- Reading Notes & Action Plans (category 8) ---------------------------------------

export function NotesPage() {
  const g = useGrowth();
  const [filter, setFilter] = useState<'all' | 'note' | 'open' | 'done'>('all');
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'note' | 'action'>('action');
  const [area, setArea] = useState<GrowthNote['area']>('lyons');
  const notes = useMemo(
    () =>
      g.notes.filter((n) =>
        filter === 'all' ? true : filter === 'note' ? n.kind === 'note' : filter === 'open' ? n.kind === 'action' && !n.done : n.kind === 'action' && n.done,
      ),
    [g.notes, filter],
  );

  const exportAll = () => {
    const lines = ['# LYONS AI — Reading Notes & Action Plans', ''];
    for (const n of g.notes) {
      const book = n.bookId ? catalogBook(n.bookId)?.title : 'General';
      lines.push(`- [${n.kind === 'action' ? (n.done ? 'x' : ' ') : '-'}] ${n.text} _(${book}${n.area ? `, ${n.area}` : ''}, ${new Date(n.createdAt).toLocaleDateString()})_`);
    }
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/markdown' }), 'LYONS AI notes and action plans.md');
  };

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <Back title="Reading Notes & Action Plans" eyebrow="LYONS AI" />
      <div className="card">
        <label className="field">
          <span>New note or action</span>
          <textarea id="new-note" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Start the weekly scorecard for Lyons on Monday" style={{ minHeight: 80 }} />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className={`chip ${kind === 'action' ? 'active' : ''}`} onClick={() => setKind('action')}>
            Action
          </button>
          <button className={`chip ${kind === 'note' ? 'active' : ''}`} onClick={() => setKind('note')}>
            Note
          </button>
          <select className="input" style={{ width: 'auto', minHeight: 36 }} value={area} onChange={(e) => setArea(e.target.value as GrowthNote['area'])} aria-label="Area">
            <option value="lyons">Lyons Cleaning</option>
            <option value="stayops">StayOps</option>
            <option value="family">Family</option>
            <option value="personal">Personal</option>
          </select>
          <button
            className="btn btn-primary"
            disabled={!text.trim()}
            onClick={async () => {
              await saveNote({ bookId: null, kind, text: text.trim(), area });
              setText('');
              await g.refresh();
            }}
          >
            Add
          </button>
        </div>
      </div>
      <div className="chips">
        {(
          [
            ['all', 'All'],
            ['open', 'Open actions'],
            ['done', 'Done'],
            ['note', 'Notes'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={`chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
        {g.notes.length > 0 && (
          <button className="chip" onClick={exportAll}>
            <Icon name="download" size={14} /> Export
          </button>
        )}
      </div>
      <NoteList notes={notes} g={g} showBook />
    </div>
  );
}
