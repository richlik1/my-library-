import { useEffect, useMemo, useRef, useState } from 'react';
import { CATALOG } from '../../growth/catalog';
import { listStates } from '../../growth/store';
import { Narrator, type NarratorState } from '../../core/speech/narrator';
import { deleteSummary, getContent, listAnnotations, listSummaries, saveSummary } from '../../core/storage/db';
import { SOURCE_LABEL, aiSummaryAvailability, speakingMinutes, type Summary } from '../../core/summaries';
import type { Annotation, Book, Chapter } from '../../core/types';
import { speechEngine } from '../engine';
import { usePlaybackSession } from '../hooks/playbackSession';
import { useSettings } from '../hooks/settings';
import { useToast } from '../hooks/toast';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

/** Something Quick Listen can read aloud, with where its words came from. */
interface Listenable {
  id: string;
  title: string;
  text: string;
  label: string;
  summary?: Summary;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The Growth Library entry for a book: linked to it, or with the same title. */
async function growthEntry(book: Book) {
  const states = await listStates().catch(() => new Map());
  const linked = [...states.values()].find((s) => s.linkedBookId === book.id);
  return CATALOG.find((c) => c.id === linked?.bookId) ?? CATALOG.find((c) => norm(c.title) === norm(book.title));
}

function passagesText(annotations: Annotation[], chapters: Chapter[]): string {
  return [...annotations]
    .sort((a, b) => a.chapter - b.chapter || a.start - b.start)
    .map((a) => `From ${chapters[a.chapter]?.title ?? `chapter ${a.chapter + 1}`}. ${a.quote}${a.note ? ` Your note: ${a.note}` : ''}`)
    .join('\n\n');
}

export function QuickListenSheet({ book, books, onClose }: { book: Book; books: Book[]; onClose(): void }) {
  const [current, setCurrent] = useState(book);
  const [items, setItems] = useState<Listenable[] | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const [scope, setScope] = useState<number | 'book'>('book');
  const [version, setVersion] = useState(0);
  const toast = useToast();
  const ai = aiSummaryAvailability();
  const player = useQuickPlayer();

  useEffect(() => {
    let alive = true;
    (async () => {
      const [content, annotations, saved, entry] = await Promise.all([getContent(current.id), listAnnotations(current.id), listSummaries(current.id), growthEntry(current)]);
      if (!alive) return;
      const chs = content?.chapters ?? [];
      setChapters(chs);
      const list: Listenable[] = saved.map((s) => ({ id: s.id, title: s.title, text: s.text, label: SOURCE_LABEL[s.source], summary: s }));
      if (entry)
        list.push({
          id: `growth-${entry.id}`,
          title: `${entry.title}: summary`,
          text: `${entry.summary}\n\nKey ideas.\n\n${entry.keyIdeas.join('\n\n')}`,
          label: SOURCE_LABEL['growth-library'],
        });
      if (annotations.length)
        list.push({
          id: 'passages',
          title: `Your saved passages (${annotations.length})`,
          text: passagesText(annotations, chs),
          label: 'Your highlights, bookmarks and notes, in reading order',
        });
      setItems(list);
    })();
    return () => {
      alive = false;
    };
  }, [current, version]);

  const saveDraft = async () => {
    const text = draft.trim();
    if (!text) return;
    const chapter = scope === 'book' ? null : scope;
    await saveSummary({
      id: `sum-${Date.now().toString(36)}`,
      bookId: current.id,
      chapter,
      title: chapter === null ? `Your summary of ${current.title}` : `Your summary: ${chapters[chapter]?.title ?? `Chapter ${chapter + 1}`}`,
      text,
      source: 'you',
      createdAt: Date.now(),
    });
    setDraft('');
    setWriting(false);
    setVersion((v) => v + 1);
    toast('Summary saved');
  };

  return (
    <Sheet
      title="Quick Listen"
      onClose={() => {
        player.stop();
        onClose();
      }}
    >
      {books.length > 1 && (
        <label className="field">
          <span>Book</span>
          <select
            className="input"
            value={current.id}
            onChange={(e) => {
              player.stop();
              setCurrent(books.find((b) => b.id === e.target.value) ?? current);
            }}
          >
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {items === null ? (
        <div className="spinner" style={{ margin: '20px auto' }} />
      ) : (
        <ul className="list" aria-label="Things to listen to">
          {items.map((it) => {
            const active = player.playingId === it.id;
            return (
              <li key={it.id}>
                <div className="list-row">
                  <div className="grow">
                    <div>{it.title}</div>
                    <div className="sub">
                      {it.label} · about {Math.max(1, Math.round(speakingMinutes(it.text)))} min
                    </div>
                  </div>
                  <button className="icon-btn" onClick={() => (active ? player.stop() : player.play(it))} aria-label={active ? `Stop ${it.title}` : `Listen to ${it.title}`}>
                    <Icon name={active && player.status === 'playing' ? 'pause' : 'play'} size={20} />
                  </button>
                  {it.summary && (
                    <button
                      className="icon-btn"
                      aria-label={`Delete ${it.title}`}
                      onClick={async () => {
                        player.stop();
                        await deleteSummary(it.summary!.id);
                        setVersion((v) => v + 1);
                      }}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  )}
                </div>
                {active && player.notice && <div className="sub small">{player.notice}</div>}
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="muted small" style={{ padding: '8px 0' }}>
              Nothing to listen to for this book yet. Highlight or bookmark passages while reading, or write your own summary below.
            </li>
          )}
        </ul>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Icon name="sparkle" size={20} />
          <div>
            <strong>AI overview (2, 5 or 10 minutes)</strong>
            <p className="small muted" style={{ margin: '4px 0 0' }}>
              Not available yet. {ai.reason}
            </p>
          </div>
        </div>
      </div>

      {writing ? (
        <div style={{ marginTop: 14 }}>
          <label className="field">
            <span>Covers</span>
            <select className="input" value={String(scope)} onChange={(e) => setScope(e.target.value === 'book' ? 'book' : Number(e.target.value))}>
              <option value="book">The whole book</option>
              {chapters.map((c, i) => (
                <option key={i} value={i}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Your summary</span>
            <textarea className="input" rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="The main idea, key points and what you’ll do with it." />
          </label>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" onClick={saveDraft} disabled={!draft.trim()}>
              Save summary
            </button>
            <button className="btn btn-ghost" onClick={() => setWriting(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn" style={{ marginTop: 14 }} onClick={() => setWriting(true)}>
          <Icon name="edit" size={16} /> Write your own summary
        </button>
      )}
    </Sheet>
  );
}

/** Reads one text aloud with the device voice, pausing the book that's playing. */
function useQuickPlayer() {
  const { settings } = useSettings();
  const pb = usePlaybackSession();
  const narrator = useRef<Narrator | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [state, setState] = useState<NarratorState | null>(null);

  const stop = () => {
    narrator.current?.destroy();
    narrator.current = null;
    setPlayingId(null);
    setState(null);
  };
  useEffect(() => stop, []);

  return useMemo(
    () => ({
      playingId,
      status: state?.status,
      notice: state?.notice,
      stop,
      play(item: Listenable) {
        stop();
        if (pb.state?.status === 'playing') pb.narrator?.pause();
        const n = new Narrator(speechEngine, [{ title: item.title, text: item.text }], { voiceId: pb.voiceId, rate: settings.rate, pitch: settings.pitch, key: 'quick-listen' });
        narrator.current = n;
        n.subscribe((s) => {
          setState(s);
          if (s.status === 'ended') setPlayingId(null);
        });
        setPlayingId(item.id);
        n.play();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playingId, state, pb.voiceId, pb.state?.status, settings.rate, settings.pitch],
  );
}
