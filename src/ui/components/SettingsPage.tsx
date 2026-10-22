import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { OCR_EXPLANATION } from '../../core/importers';
import { exportBackupBlob, parseBackup, restoreBackup } from '../../core/storage/backup';
import { requestPersistentStorage, storageEstimate } from '../../core/storage/db';
import { useSettings } from '../hooks/settings';
import { useToast } from '../hooks/toast';
import { goBack } from '../hooks/useRoute';
import { formatBytes } from './BookDetailsSheet';
import { Icon } from './Icon';
import { downloadBlob } from './PlayerSheets';
import { ImportCheck } from './ImportCheck';
import { isNativeApp } from '../platform';
import { benchmarkVoice, describeBenchmark } from '../../core/audio/benchmark';
import { DEFAULT_KOKORO_VOICE, getVoiceLog, voiceThreads } from '../../core/audio/kokoroEngine';
import { neuralEngine } from '../narration';

export function SettingsPage() {
  const { settings, update } = useSettings();
  const toast = useToast();
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [word, setWord] = useState('');
  const [say, setSay] = useState('');
  const [bench, setBench] = useState<{ busy: boolean; text: string } | null>(null);

  const [benchSecs, setBenchSecs] = useState(0);
  const runBench = async () => {
    setBench({ busy: true, text: 'Starting…' });
    const t0 = Date.now();
    setBenchSecs(0);
    const tick = setInterval(() => setBenchSecs(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const engine = neuralEngine();
      const b = await benchmarkVoice(engine, DEFAULT_KOKORO_VOICE, (label) => setBench({ busy: true, text: label }));
      const mode = (engine as { mode?: string | null }).mode;
      const threads = (engine as { threads?: number }).threads ?? voiceThreads();
      const how =
        mode === 'threads' ? `${threads} processor cores, in the background` : mode === 'single' ? 'one processor core, in the background' : mode === 'page' ? 'one processor core, on the page' : 'the test engine';
      setBench({ busy: false, text: `${describeBenchmark(b)} (Runs on ${how}.)` });
    } catch (e) {
      setBench({
        busy: false,
        text: `The natural voice couldn’t run on this device: ${(e as Error).message}. Device voice still works. Please send a screenshot of this.`,
      });
    } finally {
      clearInterval(tick);
    }
  };
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshStorage = async () => {
    setUsage(await storageEstimate());
    try {
      setPersisted((await navigator.storage?.persisted?.()) ?? null);
    } catch {
      setPersisted(null);
    }
  };
  useEffect(() => {
    refreshStorage();
  }, []);

  const doExport = async (withFiles: boolean) => {
    setBusy(true);
    try {
      const blob = await exportBackupBlob(withFiles);
      const date = new Date().toISOString().slice(0, 10);
      await downloadBlob(blob, `my-library-backup-${date}${withFiles ? '-full' : ''}.json`);
      toast(`Backup created (${formatBytes(blob.size)}). On iPhone, choose “Save to Files”.`);
    } catch (e) {
      toast(`Backup failed: ${(e as Error).message}`, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (file: File) => {
    setBusy(true);
    try {
      const summary = await restoreBackup(parseBackup(await file.text()), { restoreSettings: true });
      toast(
        `Restored ${summary.books} book${summary.books === 1 ? '' : 's'}, ${summary.annotations} notes/highlights, ${summary.progress} reading positions` +
          (summary.skippedBooks ? ` (${summary.skippedBooks} already in library)` : ''),
        { ms: 6000 },
      );
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      toast((e as Error).message, { kind: 'error' });
    } finally {
      setBusy(false);
      refreshStorage();
    }
  };

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <header className="topbar">
        <button className="icon-btn" onClick={goBack} aria-label="Back">
          <Icon name="chevronLeft" />
        </button>
        <h1 style={{ fontSize: 26 }}>Settings</h1>
      </header>

      <section className="card">
        <h3>Backup &amp; restore</h3>
        <p>
          Save your library, reading positions, bookmarks, highlights and notes to a file you keep (Files app, iCloud Drive, a computer…).
          Restore it on this or another device. Backups never leave your device unless you move them.
        </p>
        <div className="row">
          <button className="btn btn-primary" disabled={busy} onClick={() => doExport(false)}>
            <Icon name="download" size={18} /> Export backup
          </button>
          <button className="btn" disabled={busy} onClick={() => doExport(true)}>
            <Icon name="download" size={18} /> Full backup with original files
          </button>
          <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} /> Restore backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) doImport(f);
            }}
          />
        </div>
        <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
          The standard backup contains the extracted text, so books are fully restorable. The full backup also includes the original
          PDF/EPUB/DOCX/TXT files.
        </p>
      </section>

      <ImportCheck />

      <section className="card">
        <h3>Storage on this device</h3>
        {usage && usage.quota > 0 ? (
          <>
            <div className="meter">
              <i style={{ width: `${Math.min(100, (usage.usage / usage.quota) * 100)}%` }} />
            </div>
            <p>
              Using {formatBytes(usage.usage)} of about {formatBytes(usage.quota)} available to this app.
            </p>
          </>
        ) : (
          <p>Storage information is not available in this browser.</p>
        )}
        <p>
          {isNativeApp()
            ? 'Your books are stored inside the app on this iPhone. Deleting the app deletes them, so keep a backup in Files or iCloud Drive.'
            : persisted
              ? '✓ Your library is protected from automatic clean-up by the browser.'
              : 'Browsers may clear website data that is not used for a while. Installing the app to your Home Screen (and tapping the button below) protects it. Keep a backup too.'}
        </p>
        {!persisted && !isNativeApp() && (
          <button
            className="btn"
            onClick={async () => {
              const ok = await requestPersistentStorage();
              setPersisted(ok);
              toast(
                ok ? 'Library storage is now protected.' : 'The browser did not grant protected storage. Install the app and keep backups.',
              );
            }}
          >
            <Icon name="shield" size={18} /> Protect my library
          </button>
        )}
      </section>

      <section className="card">
        <h3>Appearance</h3>
        <div className="seg-nav" role="radiogroup" aria-label="Theme">
          {(['system', 'dark', 'light'] as const).map((t) => (
            <a
              key={t}
              href="#"
              role="radio"
              aria-checked={settings.theme === t}
              className={settings.theme === t ? 'active' : ''}
              onClick={(e) => {
                e.preventDefault();
                update({ theme: t });
              }}
            >
              {t === 'system' ? 'Match device' : t === 'dark' ? 'Dark' : 'Light'}
            </a>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Reading &amp; listening</h3>
        <div className="rate-row">
          <div className="rate-head">
            <span>Text size</span>
            <span>{settings.fontSize}px</span>
          </div>
          <input
            type="range"
            min={14}
            max={30}
            step={1}
            value={settings.fontSize}
            style={{ '--fill': `${((settings.fontSize - 14) / 16) * 100}%` } as CSSProperties}
            onChange={(e) => update({ fontSize: Number(e.target.value) })}
            aria-label="Text size"
          />
        </div>
        <label className="switch">
          <span>
            Follow along
            <small>Scroll the text to the sentence being read.</small>
          </span>
          <input type="checkbox" checked={settings.followAlong} onChange={(e) => update({ followAlong: e.target.checked })} />
        </label>
        {!isNativeApp() && (
          <label className="switch">
            <span>
              Keep screen awake while listening
              <small>Browser speech stops when an iPhone locks, so this keeps the screen on during narration.</small>
            </span>
            <input type="checkbox" checked={settings.keepAwake} onChange={(e) => update({ keepAwake: e.target.checked })} />
          </label>
        )}
        <label className="switch" style={{ borderBottom: 0 }}>
          <span>
            Show novelty voices
            <small>Bells, Bubbles, Zarvox and other joke voices.</small>
          </span>
          <input type="checkbox" checked={settings.showNoveltyVoices} onChange={(e) => update({ showNoveltyVoices: e.target.checked })} />
        </label>
      </section>

      <section className="card">
        <h3>Natural voice</h3>
        <div className="rate-head" style={{ marginBottom: 6 }}>
          <span>Default pauses between sentences</span>
        </div>
        <div className="seg-nav" role="radiogroup" aria-label="Pauses between sentences">
          {(['short', 'normal', 'long'] as const).map((p) => (
            <a
              key={p}
              href="#"
              role="radio"
              aria-checked={settings.narrationPause === p}
              className={settings.narrationPause === p ? 'active' : ''}
              onClick={(e) => {
                e.preventDefault();
                update({ narrationPause: p });
              }}
            >
              {p === 'short' ? 'Short' : p === 'normal' ? 'Normal' : 'Long'}
            </a>
          ))}
        </div>
        <div className="rate-head" style={{ margin: '14px 0 6px' }}>
          <span>Pronunciations</span>
        </div>
        {settings.pronunciations.length > 0 && (
          <ul className="list" aria-label="Pronunciations">
            {settings.pronunciations.map((p, i) => (
              <li key={`${p.word}-${i}`}>
                <div className="list-row">
                  <span className="grow">
                    <strong>{p.word}</strong> → {p.say}
                  </span>
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${p.word}`}
                    onClick={() => update({ pronunciations: settings.pronunciations.filter((_, j) => j !== i) })}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form
          className="row"
          style={{ marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            const w = word.trim();
            const s2 = say.trim();
            if (!w || !s2) return;
            update({ pronunciations: [...settings.pronunciations.filter((p) => p.word.toLowerCase() !== w.toLowerCase()), { word: w, say: s2 }] });
            setWord('');
            setSay('');
          }}
        >
          <input className="input" style={{ flex: 1, minWidth: 110 }} placeholder="Word" aria-label="Word" value={word} onChange={(e) => setWord(e.target.value)} />
          <input className="input" style={{ flex: 1, minWidth: 110 }} placeholder="Say it as" aria-label="Say it as" value={say} onChange={(e) => setSay(e.target.value)} />
          <button className="btn" type="submit">
            Add
          </button>
        </form>
        <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Changes apply to chapters made from now on. Use “Regenerate this chapter” in Voice &amp; speed to remake one you already have.
        </p>
        {settings.presets.length > 0 && (
          <>
            <div className="rate-head" style={{ margin: '14px 0 6px' }}>
              <span>Your presets</span>
            </div>
            <ul className="list" aria-label="Your presets">
              {settings.presets.map((p) => (
                <li key={p.id}>
                  <div className="list-row">
                    <span className="grow">
                      <strong>{p.name}</strong> · {p.rate}× · {p.pause} pauses
                    </span>
                    <button className="icon-btn" aria-label={`Delete preset ${p.name}`} onClick={() => update({ presets: settings.presets.filter((x) => x.id !== p.id) })}>
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="row" style={{ marginTop: 14, alignItems: 'center' }}>
          <button className="btn" onClick={runBench} disabled={bench?.busy}>
            {bench?.busy ? 'Testing…' : 'Test natural voice speed'}
          </button>
        </div>
        {bench && (
          <p className="small" role="status" style={{ marginBottom: 0 }}>
            {bench.text}
            {bench.busy && benchSecs > 0 ? ` (${benchSecs} s)` : ''}
          </p>
        )}
        {bench && !bench.busy && (
          <details style={{ marginTop: 8 }}>
            <summary className="small">Details for troubleshooting</summary>
            <pre className="voice-log">{[navigator.userAgent, ...getVoiceLog()].join('\n')}</pre>
            <button
              className="btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText([bench.text, navigator.userAgent, ...getVoiceLog()].join('\n'));
                  toast('Copied');
                } catch {
                  toast('Couldn’t copy; take a screenshot instead', { kind: 'error' });
                }
              }}
            >
              Copy details
            </button>
          </details>
        )}
      </section>

      <section className="card">
        <h3>Categories</h3>
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {settings.categories.map((c) => (
            <span key={c} className="chip">
              {c}
              <button
                aria-label={`Remove ${c}`}
                onClick={() => update({ categories: settings.categories.filter((x) => x !== c) })}
                style={{ display: 'inline-grid', placeItems: 'center' }}
              >
                <Icon name="close" size={14} />
              </button>
            </span>
          ))}
        </div>
        <form
          className="row"
          style={{ marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            const c = newCat.trim();
            if (c && !settings.categories.includes(c)) update({ categories: [...settings.categories, c] });
            setNewCat('');
          }}
        >
          <input
            className="input"
            style={{ flex: 1, minWidth: 160 }}
            placeholder="New category"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
          />
          <button className="btn" type="submit">
            Add
          </button>
        </form>
        <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Removing a category here doesn’t change books already in it.
        </p>
      </section>

      {isNativeApp() ? (
        <section className="card">
          <h3>Listening tips</h3>
          <ol className="steps">
            <li>
              Narration keeps playing with the screen locked or while you use other apps. Control it from the Lock Screen, Control Center or
              your headphones.
            </li>
            <li>
              For much better voices, download free <strong>Enhanced</strong> or <strong>Premium</strong> voices: Settings → Accessibility →
              Spoken Content → Voices. Then pick them in Voice &amp; speed.
            </li>
            <li>Your place is saved continuously, even if the app is closed while it reads.</li>
          </ol>
        </section>
      ) : (
        <section className="card">
          <h3>iPhone: install &amp; listening tips</h3>
          <ol className="steps">
            <li>
              Open this app in <strong>Safari</strong>, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. Open it from
              the new icon.
            </li>
            <li>
              Turn off Silent mode or raise the volume if you hear nothing (speech follows the ring/silent switch on some iOS versions).
            </li>
            <li>
              For much better voices, download free <strong>Enhanced</strong> or <strong>Premium</strong> voices: Settings → Accessibility →
              Spoken Content → Voices. Then pick them in Voice &amp; speed.
            </li>
            <li>
              <strong>To listen with the screen locked</strong>, open a book, tap <strong>Voice &amp; speed</strong>, choose{' '}
              <strong>Natural voice</strong> and generate a few chapters (or the whole book) first. Generated chapters keep playing locked,
              in other apps and offline, with Lock Screen controls.
            </li>
            <li>
              <strong>Honest limitation:</strong> the Device voice (browser speech) stops when the screen locks or you switch apps; My Library
              keeps the screen awake while it reads and resumes from the same sentence. Natural voice chapters are made only while the app is
              open, so keep it open until the chapters you need are ready.
            </li>
          </ol>
        </section>
      )}

      <section className="card">
        <h3>Scanned PDFs</h3>
        <p style={{ marginBottom: 0 }}>{OCR_EXPLANATION}</p>
      </section>

      <section className="card">
        <h3>Privacy</h3>
        <p style={{ marginBottom: 0 }}>
          My Library has no account, no server, no analytics and no tracking. Books, progress and notes are stored only in this browser’s
          private storage on this device. Device voices are your device’s built-in voices (some “online” voices on Chrome/Android may use
          the browser maker’s speech service — the voice list marks them). Natural voice downloads the free Kokoro voice model once from
          Hugging Face; after that, audio is made on this device and your book text never leaves it.
        </p>
      </section>
      <p className="muted small" style={{ textAlign: 'center' }}>
        My Library v{__APP_VERSION__} · free &amp; open
      </p>
    </div>
  );
}
