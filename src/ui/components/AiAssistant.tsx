import { useState } from 'react';
import { AI_MODELS, askClaude, buildPrompt, getAiConfig, parseFlashcards, setAiConfig, sourcesFor, type AssistantAnswer, type AssistantRequest, type Source } from '../../core/assistant';
import type { BookIndex } from '../../core/search';
import { saveAnnotation } from '../../core/storage/db';
import type { Book, Chapter, Position } from '../../core/types';
import { useToast } from '../hooks/toast';
import { navigate } from '../hooks/useRoute';
import { Icon } from './Icon';

/** One AI action (explain, summarize…) and its labelled, cited answer. */
export function AiAction({
  label,
  request,
  book,
  chapters,
  index,
  onGo,
  onSaved,
}: {
  label: string;
  request: AssistantRequest | null;
  book: Book;
  chapters: Chapter[];
  index: BookIndex;
  onGo(pos: Position, play: boolean): void;
  onSaved(): void;
}) {
  const toast = useToast();
  const config = getAiConfig();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ answer: AssistantAnswer; sources: Source[]; task: AssistantRequest['task'] } | null>(null);

  if (!config)
    return (
      <div className="card ai-off">
        <p className="small" style={{ margin: 0 }}>
          <strong>AI answers are off.</strong> You can turn them on with your own Claude API key in Settings (only the passages needed for each
          question are sent; your library stays on this device). Everything else here works without AI.
        </p>
        <button className="btn" style={{ marginTop: 8 }} onClick={() => navigate('/settings')}>
          AI settings
        </button>
      </div>
    );

  const run = async () => {
    if (!request) return;
    setBusy(true);
    try {
      const sources = sourcesFor(request, index, chapters);
      if (!sources.length) {
        toast('Nothing in this book matches that, so there is nothing to base an answer on.');
        return;
      }
      const answer = await askClaude(config, buildPrompt(request, sources, book), sources);
      setResult({ answer, sources, task: request.task });
    } catch (e) {
      const msg = (e as { status?: number; message?: string }).status === 401 ? 'The API key was not accepted. Check it in Settings.' : (e as Error).message;
      toast(`AI request failed: ${msg}`, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const listen = (text: string) => {
    const u = new SpeechSynthesisUtterance(text.replace(/\[\d+(?:[,–-]\s*\d+)*\]/g, ''));
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };

  const saveNote = async () => {
    if (!result) return;
    const s = result.answer.cited[0] ?? result.sources[0];
    await saveAnnotation({
      bookId: book.id,
      kind: 'note',
      chapter: s.chapter,
      start: s.start,
      end: Math.min(s.end, s.start + 400),
      quote: s.text.slice(0, 400),
      note: `AI interpretation (${label.toLowerCase()}): ${result.answer.text}`,
      color: 'sky',
      tags: ['ai'],
    });
    toast('Saved to your notes, labelled as AI interpretation.');
    onSaved();
  };

  const cards = result?.task === 'flashcards' ? parseFlashcards(result.answer.text, result.sources) : [];
  const saveCards = async () => {
    for (const c of cards) {
      const s = c.source ?? result!.sources[0];
      await saveAnnotation({
        bookId: book.id,
        kind: 'note',
        chapter: s.chapter,
        start: s.start,
        end: Math.min(s.end, s.start + 300),
        quote: s.text.slice(0, 300),
        note: `Q: ${c.q}\nA: ${c.a}`,
        color: 'sky',
        tags: ['flashcard', 'ai'],
      });
    }
    toast(`Saved ${cards.length} flashcards to your quotes (tag “flashcard”).`);
    onSaved();
  };

  return (
    <div className="ai-action">
      {!result && (
        <button className="btn btn-primary" onClick={run} disabled={busy || !request}>
          <Icon name="sparkle" size={16} /> {busy ? 'Thinking…' : label}
        </button>
      )}
      {result && (
        <section className="ai-answer" aria-label="AI answer">
          <div className="ai-label">
            AI interpretation · {result.answer.model} · based on {result.sources.length} passage{result.sources.length > 1 ? 's' : ''} from the book
          </div>
          {result.answer.refused ? (
            <p className="small">The AI declined this request.</p>
          ) : (
            <div className="ai-text">
              {result.answer.text.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
          {!result.answer.refused && !result.answer.cited.length && (
            <p className="small warn-text" role="note">
              This answer doesn’t cite the book’s passages. Treat it as general guidance, not as what the book says.
            </p>
          )}
          {result.answer.invalid.length > 0 && (
            <p className="small warn-text" role="note">
              It referred to passage{result.answer.invalid.length > 1 ? 's' : ''} {result.answer.invalid.join(', ')}, which weren’t given to it; those references were ignored.
            </p>
          )}
          <div className="org-actions">
            <button className="pill" onClick={() => listen(result.answer.text)}>
              <Icon name="play" size={14} /> Listen
            </button>
            <button className="pill" onClick={saveNote}>
              Save as note
            </button>
            {cards.length > 0 && (
              <button className="pill" onClick={saveCards}>
                Save {cards.length} flashcards
              </button>
            )}
            <button className="pill" onClick={() => setResult(null)}>
              Ask again
            </button>
          </div>
          <h4 className="ask-h">From the book (what the answer is based on)</h4>
          <ul className="hits">
            {(result.answer.cited.length ? result.answer.cited : result.sources).map((s) => (
              <li key={s.n} className="hit">
                <div className="hit-ref">
                  [{s.n}] {s.label}
                </div>
                <p className="hit-text">{s.text.length > 360 ? `${s.text.slice(0, 360)}…` : s.text}</p>
                <div className="row" style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost" onClick={() => onGo({ chapter: s.chapter, offset: s.start }, false)}>
                    Go there
                  </button>
                  <button className="btn btn-ghost" onClick={() => onGo({ chapter: s.chapter, offset: s.start }, true)}>
                    <Icon name="play" size={14} /> Play from here
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Settings card: optional AI with the reader's own key (off by default, stored only on this device). */
export function AiSettings() {
  const toast = useToast();
  const [config, setConfig] = useState(getAiConfig());
  const [key, setKey] = useState('');
  const [model, setModel] = useState<string>(config?.model ?? AI_MODELS[0].id);

  const save = () => {
    const k = key.trim();
    if (!/^sk-ant-/.test(k)) {
      toast('That doesn’t look like a Claude API key (they start with “sk-ant-”).', { kind: 'error' });
      return;
    }
    const c = { provider: 'claude' as const, apiKey: k, model };
    setAiConfig(c);
    setConfig(c);
    setKey('');
    toast('AI answers are on.');
  };

  return (
    <section className="card" aria-label="AI assistant">
      <h3>AI assistant (optional)</h3>
      <p className="small" style={{ marginTop: 0 }}>
        Off by default. With your own Claude API key, “Ask my book” can explain passages, define words, summarize chapters and make study
        questions, flashcards and action plans. Each answer is labelled as an AI interpretation and cites the passages it is based on. Only
        those passages (and your question) are sent to Anthropic; your library stays on this device. Your key is stored only on this device
        and is never included in backups. Usage is billed to your Anthropic account.
      </p>
      {config ? (
        <>
          <p className="small">
            <strong>On</strong> · key ending “…{config.apiKey.slice(-4)}”
          </p>
          <label className="small" htmlFor="ai-model">
            Model
          </label>
          <select
            id="ai-model"
            className="input"
            value={config.model}
            onChange={(e) => {
              const c = { ...config, model: e.target.value };
              setAiConfig(c);
              setConfig(c);
            }}
          >
            {AI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.note}
              </option>
            ))}
          </select>
          <button
            className="btn"
            style={{ marginTop: 10 }}
            onClick={() => {
              setAiConfig(null);
              setConfig(null);
              toast('AI answers are off and the key was removed from this device.');
            }}
          >
            Turn off and remove key
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            className="input"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Claude API key (sk-ant-…)"
            aria-label="Claude API key"
          />
          <select className="input" style={{ marginTop: 8 }} value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model">
            {AI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.note}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" style={{ marginTop: 10 }} type="submit" disabled={!key.trim()}>
            Turn on AI answers
          </button>
        </form>
      )}
    </section>
  );
}
