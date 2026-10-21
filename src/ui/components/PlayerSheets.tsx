import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { VoiceInfo } from '../../core/speech/engine';
import type { SleepTimer } from '../../core/speech/narrator';
import type { Annotation, AnnotationKind, Book, Chapter, HighlightColor } from '../../core/types';
import { useSettings } from '../hooks/settings';
import { isNativeApp } from '../platform';
import { sortVoices } from '../hooks/useVoices';
import { listeningHours } from './BookDetailsSheet';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

export function ChaptersSheet({
  chapters,
  current,
  onPick,
  onClose,
}: {
  chapters: Chapter[];
  current: number;
  onPick(i: number): void;
  onClose(): void;
}) {
  const { settings } = useSettings();
  return (
    <Sheet title="Chapters" onClose={onClose}>
      <ul className="list">
        {chapters.map((c, i) => (
          <li key={i}>
            <button
              className={`list-row ${i === current ? 'current' : ''}`}
              onClick={() => onPick(i)}
              ref={i === current ? (el) => el?.scrollIntoView({ block: 'center' }) : undefined}
            >
              <span className="num">{i + 1}</span>
              <span className="grow">
                <div>{c.title}</div>
                <div className="sub">{listeningHours(c.text.length, settings.rate)}</div>
              </span>
              {i < current && <Icon name="check" size={18} className="muted" />}
              {i === current && <Icon name="voice" size={18} />}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

const KIND_LABEL: Record<AnnotationKind, string> = { bookmark: 'Bookmarks', highlight: 'Highlights', note: 'Notes' };

export function AnnotationsSheet({
  book,
  chapters,
  annotations,
  onJump,
  onEdit,
  onDelete,
  onClose,
}: {
  book: Book;
  chapters: Chapter[];
  annotations: Annotation[];
  onJump(a: Annotation): void;
  onEdit(a: Annotation): void;
  onDelete(a: Annotation): void;
  onClose(): void;
}) {
  const [filter, setFilter] = useState<'all' | AnnotationKind>('all');
  const list = annotations.filter((a) => filter === 'all' || a.kind === filter);

  const exportNotes = () => {
    const lines = [`# ${book.title}`, book.author ? `*${book.author}*` : '', ''];
    let lastChapter = -1;
    for (const a of annotations) {
      if (a.chapter !== lastChapter) {
        lines.push(`## ${chapters[a.chapter]?.title ?? `Chapter ${a.chapter + 1}`}`, '');
        lastChapter = a.chapter;
      }
      const tag = a.kind === 'bookmark' ? '🔖 Bookmark' : a.kind === 'note' ? '📝 Note' : '🖍 Highlight';
      lines.push(`${tag}`, `> ${a.quote.replace(/\n+/g, ' ')}`);
      if (a.note) lines.push('', a.note);
      lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    void downloadBlob(blob, `${safeName(book.title)} - notes.md`);
  };

  return (
    <Sheet
      title="Notes & highlights"
      onClose={onClose}
      actions={
        annotations.length > 0 && (
          <button className="icon-btn" onClick={exportNotes} aria-label="Export notes">
            <Icon name="download" />
          </button>
        )
      }
    >
      <div className="chips">
        {(['all', 'bookmark', 'highlight', 'note'] as const).map((k) => (
          <button key={k} className={`chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
            {k === 'all' ? 'All' : KIND_LABEL[k]} {k === 'all' ? annotations.length : annotations.filter((a) => a.kind === k).length}
          </button>
        ))}
      </div>
      {list.length === 0 && (
        <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>
          Nothing here yet. Tap any sentence while reading to bookmark, highlight or add a note — or select text.
        </p>
      )}
      <ul className="list">
        {list.map((a) => (
          <li key={a.id}>
            <div className="list-row" style={{ alignItems: 'flex-start' }}>
              <button className="grow" style={{ textAlign: 'left' }} onClick={() => onJump(a)}>
                <div className="sub">
                  <Icon name={a.kind === 'note' ? 'note' : a.kind} size={13} /> {chapters[a.chapter]?.title}
                </div>
                <div className={`quote hl-${a.color ?? 'gold'}`}>{a.quote}</div>
                {a.note && <div className="note-text">{a.note}</div>}
              </button>
              {a.kind !== 'bookmark' && (
                <button className="icon-btn" onClick={() => onEdit(a)} aria-label="Edit note">
                  <Icon name="edit" size={18} />
                </button>
              )}
              <button className="icon-btn" onClick={() => onDelete(a)} aria-label="Delete">
                <Icon name="trash" size={18} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export const COLORS: HighlightColor[] = ['gold', 'rose', 'mint', 'sky'];
const SWATCH: Record<HighlightColor, string> = { gold: '#e7b866', rose: '#ff80a0', mint: '#6edcaa', sky: '#6eafff' };
export const swatch = (c: HighlightColor) => SWATCH[c];

export function NoteSheet({
  initial,
  onSave,
  onClose,
}: {
  initial: { quote: string; note?: string; color?: HighlightColor; isNew: boolean };
  onSave(note: string, color: HighlightColor): void;
  onClose(): void;
}) {
  const [note, setNote] = useState(initial.note ?? '');
  const [color, setColor] = useState<HighlightColor>(initial.color ?? 'gold');
  return (
    <Sheet title={initial.isNew ? 'Add note' : 'Edit note'} onClose={onClose}>
      <div className={`quote hl-${color}`} style={{ marginBottom: 14 }}>
        {initial.quote}
      </div>
      <label className="field">
        <span>Your note</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} autoFocus placeholder="What do you want to remember?" />
      </label>
      <div className="preset-row" style={{ marginBottom: 16 }}>
        {COLORS.map((c) => (
          <button key={c} className={`chip ${c === color ? 'active' : ''}`} onClick={() => setColor(c)} aria-label={`${c} highlight`}>
            <span className="swatch" style={{ background: SWATCH[c], width: 14, height: 14 }} /> {c}
          </button>
        ))}
      </div>
      <button className="btn btn-primary btn-block" onClick={() => onSave(note.trim(), color)}>
        Save note
      </button>
    </Sheet>
  );
}

export function VoiceSheet({
  voices,
  selected,
  onSelect,
  onPreview,
  onClose,
  top,
  showDeviceVoices = true,
}: {
  voices: VoiceInfo[];
  selected: string | null;
  onSelect(id: string): void;
  onPreview(v: VoiceInfo): void;
  onClose(): void;
  /** Natural-voice controls shown above the speed slider. */
  top?: ReactNode;
  showDeviceVoices?: boolean;
}) {
  const { settings, update } = useSettings();
  const [q, setQ] = useState('');
  const [allLanguages, setAllLanguages] = useState(false);
  const base = (navigator.language || 'en').split('-')[0].toLowerCase();

  const groups = useMemo(() => {
    const filtered = sortVoices(voices).filter(
      (v) =>
        (settings.showNoveltyVoices || v.quality !== 'novelty') &&
        (allLanguages || q || v.lang.toLowerCase().startsWith(base) || v.id === selected) &&
        (!q || `${v.name} ${v.lang}`.toLowerCase().includes(q.toLowerCase())),
    );
    const map = new Map<string, VoiceInfo[]>();
    for (const v of filtered) {
      const key = langName(v.lang);
      map.set(key, [...(map.get(key) ?? []), v]);
    }
    return [...map.entries()];
  }, [voices, settings.showNoveltyVoices, allLanguages, q, base, selected]);

  const rate = settings.rate;
  return (
    <Sheet title="Voice & speed" onClose={onClose}>
      {top}
      <div className="rate-row">
        <div className="rate-head">
          <span>Narration speed</span>
          <span>{rate.toFixed(2).replace(/0$/, '')}×</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.05}
          value={rate}
          style={{ '--fill': `${((rate - 0.5) / 2.5) * 100}%` } as CSSProperties}
          onChange={(e) => update({ rate: Number(e.target.value) })}
          aria-label="Narration speed"
        />
        <div className="preset-row">
          {[0.75, 1, 1.25, 1.5, 1.75, 2, 2.5].map((r) => (
            <button key={r} className={`chip ${Math.abs(rate - r) < 0.01 ? 'active' : ''}`} onClick={() => update({ rate: r })}>
              {r}×
            </button>
          ))}
        </div>
      </div>
      {showDeviceVoices && (
        <>
          <div className="rate-row">
            <div className="rate-head">
              <span>Pitch</span>
              <span>{settings.pitch.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={settings.pitch}
              style={{ '--fill': `${(settings.pitch - 0.5) * 100}%` } as CSSProperties}
              onChange={(e) => update({ pitch: Number(e.target.value) })}
              aria-label="Pitch"
            />
          </div>

          <div className="search" style={{ margin: '4px 0 4px' }}>
            <Icon name="search" size={20} />
            <input type="search" placeholder="Search voices" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="switch" style={{ borderBottom: 0, paddingBottom: 0 }}>
            <span>Show all languages</span>
            <input type="checkbox" checked={allLanguages} onChange={(e) => setAllLanguages(e.target.checked)} />
          </label>

          {voices.length === 0 && (
            <div className="banner warn">
              <span className="icon-wrap">
                <Icon name="info" />
              </span>
              <div className="banner-body">
                No voices were reported by this browser yet. They usually appear after a moment. On iPhone you can download better free
                voices in <strong>Settings → Accessibility → Spoken Content → Voices</strong> (choose an “Enhanced” or “Premium” voice),
                then reopen this app.
              </div>
            </div>
          )}

          {groups.map(([lang, list]) => (
            <div key={lang} className="voice-group">
              <h4>{lang}</h4>
              <ul className="list">
                {list.map((v) => (
                  <li key={v.id}>
                    <div className={`list-row ${v.id === selected ? 'current' : ''}`}>
                      <button className="grow" style={{ textAlign: 'left' }} onClick={() => onSelect(v.id)}>
                        <div>
                          {v.name.replace(/\s*\((Enhanced|Premium)\)/i, '')}
                          {v.quality === 'premium' && <span className="tag">Premium</span>}
                          {v.quality === 'enhanced' && <span className="tag">Enhanced</span>}
                          {!v.local && <span className="tag dim">Online</span>}
                        </div>
                        <div className="sub">
                          {v.lang}
                          {v.isDefault ? ' · system default' : ''}
                        </div>
                      </button>
                      <button className="icon-btn" onClick={() => onPreview(v)} aria-label={`Preview ${v.name}`}>
                        <Icon name="play" size={18} />
                      </button>
                      {v.id === selected && <Icon name="check" size={20} />}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="muted small" style={{ marginTop: 16 }}>
            Voices come free with your device. “Online” voices need an internet connection — choose an on-device voice to listen offline. On
            iPhone, add Enhanced/Premium voices in Settings → Accessibility → Spoken Content → Voices.
          </p>
        </>
      )}
    </Sheet>
  );
}

export function SleepSheet({ sleep, onSet, onClose }: { sleep: SleepTimer; onSet(m: 'off' | 'chapter' | number): void; onClose(): void }) {
  const remaining = sleep.mode === 'time' ? Math.max(0, Math.round((sleep.endsAt - Date.now()) / 60000)) : 0;
  return (
    <Sheet title="Sleep timer" onClose={onClose}>
      {sleep.mode !== 'off' && (
        <p className="muted">{sleep.mode === 'chapter' ? 'Stopping at the end of this chapter.' : `Stopping in about ${remaining} min.`}</p>
      )}
      <ul className="list">
        {[5, 10, 15, 30, 45, 60, 90].map((m) => (
          <li key={m}>
            <button className="list-row" onClick={() => onSet(m)}>
              <span className="grow">{m} minutes</span>
            </button>
          </li>
        ))}
        <li>
          <button className={`list-row ${sleep.mode === 'chapter' ? 'current' : ''}`} onClick={() => onSet('chapter')}>
            <span className="grow">End of this chapter</span>
          </button>
        </li>
        <li>
          <button className="list-row" onClick={() => onSet('off')}>
            <span className="grow">Off</span>
          </button>
        </li>
      </ul>
    </Sheet>
  );
}

let displayNames: Intl.DisplayNames | null = null;
function langName(tag: string): string {
  try {
    displayNames ??= new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' });
    return displayNames.of(tag.replace('_', '-')) ?? tag;
  } catch {
    return tag;
  }
}

export function safeName(s: string) {
  return (
    s
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .trim()
      .slice(0, 80) || 'book'
  );
}

/**
 * Saves a file for the user. In a browser it downloads; in the iOS app (where
 * web downloads don't exist) it opens the share sheet: Save to Files, AirDrop, Mail…
 */
export async function downloadBlob(blob: Blob, name: string) {
  if (isNativeApp()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const data = await blobToBase64(blob);
    const { uri } = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
    try {
      await Share.share({ title: name, files: [uri] });
    } catch {
      /* the user closed the share sheet */
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
