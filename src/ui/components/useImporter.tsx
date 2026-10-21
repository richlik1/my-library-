import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ImportError, importFile } from '../../core/importers';
import { parseTxt } from '../../core/importers/txt';
import { requestPersistentStorage, saveImportedBook } from '../../core/storage/db';
import type { Book } from '../../core/types';
import { useSettings } from '../hooks/settings';
import { useToast } from '../hooks/toast';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

interface Failure {
  name: string;
  message: string;
  needsOcr: boolean;
}

/** File picker + extraction progress + error explanations for importing books. */
export function useImporter(onImported: (books: Book[], openDetails: boolean) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { settings } = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState<{ name: string; index: number; total: number; fraction: number; label: string } | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);

  const run = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      requestPersistentStorage();
      const added: Book[] = [];
      const failed: Failure[] = [];
      const category = settings.categories.includes('Other') ? 'Other' : settings.categories[0] ?? 'Other';
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setBusy({ name: file.name, index: i, total: files.length, fraction: 0, label: 'Opening…' });
        try {
          const imported = await importFile(file, (fraction, label) => setBusy((b) => (b ? { ...b, fraction, label } : b)));
          setBusy((b) => (b ? { ...b, fraction: 1, label: 'Saving to your library…' } : b));
          added.push(await saveImportedBook(imported, { name: file.name, size: file.size, type: file.type, data: file }, category));
        } catch (e) {
          console.error(e);
          const err = e as Error;
          const quota = err?.name === 'QuotaExceededError';
          failed.push({
            name: file.name,
            needsOcr: e instanceof ImportError && e.kind === 'needs-ocr',
            message:
              e instanceof ImportError
                ? e.message
                : quota
                  ? 'Your device is out of storage space for this app. Delete some books or free up space, then try again.'
                  : `Something went wrong while reading this file (${err?.message ?? 'unknown error'}).`,
          });
        }
      }
      setBusy(null);
      if (failed.length) setFailures(failed);
      if (added.length) {
        if (added.length > 1) toast(`Added ${added.length} books to your library`);
        onImported(added, added.length === 1 && !failed.length);
      }
    },
    [onImported, settings.categories, toast],
  );

  const open = useCallback(() => inputRef.current?.click(), []);
  const [pasting, setPasting] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');

  const savePasted = useCallback(async () => {
    const text = pasteText.trim();
    if (!text) return;
    const title = pasteTitle.trim() || 'Pasted text';
    try {
      const imported = { ...parseTxt(text, `${title}.txt`), title };
      const category = settings.categories.includes('Other') ? 'Other' : settings.categories[0] ?? 'Other';
      const book = await saveImportedBook(imported, { name: `${title}.txt`, size: text.length, type: 'text/plain', data: new Blob([text], { type: 'text/plain' }) }, category);
      setPasting(false);
      setPasteText('');
      setPasteTitle('');
      onImported([book], false);
      toast(`Added “${title}”`);
    } catch (e) {
      toast(`Could not save the text: ${(e as Error).message}`, { kind: 'error' });
    }
  }, [pasteText, pasteTitle, settings.categories, onImported, toast]);

  const ui = (
    <>
      <input
        ref={inputRef}
        type="file"
        id="book-file-input"
        multiple
        className="sr-only"
        tabIndex={-1}
        data-testid="file-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          run(files);
        }}
      />
      {busy && (
        <div className="scrim">
          <div className="sheet" role="dialog" aria-label="Importing">
            <div className="progress-modal">
              <div className="spinner" />
              <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--serif)' }}>
                {busy.total > 1 ? `Importing ${busy.index + 1} of ${busy.total}` : 'Preparing your book'}
              </h3>
              <div className="muted small" style={{ wordBreak: 'break-word' }}>
                {busy.name}
              </div>
              <div className="small" style={{ marginTop: 10, color: 'var(--text-2)' }}>
                {busy.label}
              </div>
              <div className="bar">
                <i style={{ width: `${Math.round(busy.fraction * 100)}%` }} />
              </div>
              <p className="muted small" style={{ marginTop: 14 }}>
                Everything happens on this device. Your file is never uploaded.
              </p>
            </div>
          </div>
        </div>
      )}
      {pasting && (
        <Sheet title="Paste text" onClose={() => setPasting(false)}>
          <p className="muted small" style={{ marginTop: 0 }}>
            If a file won’t import, open it in another app (Files, Books, a PDF viewer), select all the text, copy it, and paste it here.
          </p>
          <label className="field">
            <span>Title</span>
            <input id="paste-title" value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="Book title" />
          </label>
          <label className="field">
            <span>Text</span>
            <textarea id="paste-text" value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste the book’s text here" style={{ minHeight: 200 }} />
          </label>
          <button className="btn btn-primary btn-block" disabled={!pasteText.trim()} onClick={savePasted}>
            Save to library
          </button>
        </Sheet>
      )}
      {failures.length > 0 && (
        <Sheet title={failures.some((f) => f.needsOcr) ? 'This PDF needs OCR' : "Couldn't import"} onClose={() => setFailures([])}>
          {failures.map((f) => (
            <div key={f.name} className="banner warn">
              <span className="icon-wrap">
                <Icon name="info" />
              </span>
              <div className="banner-body">
                <strong style={{ wordBreak: 'break-word' }}>{f.name}</strong>
                <div style={{ marginTop: 4 }}>{f.message}</div>
              </div>
            </div>
          ))}
          <button className="btn btn-primary btn-block" onClick={() => setFailures([])}>
            OK
          </button>
        </Sheet>
      )}
    </>
  );

  /** A real label for the file input: tapping it opens the picker natively (works where scripted clicks are blocked). */
  const AddLabel = ({ className, children, label }: { className: string; children: ReactNode; label?: string }) => (
    <label htmlFor="book-file-input" className={className} role="button" tabIndex={0} aria-label={label} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open()}>
      {children}
    </label>
  );

  return { open, ui, run, AddLabel, openPaste: () => setPasting(true) };
}
