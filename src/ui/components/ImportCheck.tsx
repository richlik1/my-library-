import { useState } from 'react';
import { importFile } from '../../core/importers';
import { deleteBook, saveImportedBook } from '../../core/storage/db';
import { deviceInfo } from '../platform';
import { useToast } from '../hooks/toast';

type Step = { label: string; ok: boolean; detail?: string };

/** Runs a real import of a tiny bundled PDF to show exactly which step fails on this device. */
export function ImportCheck() {
  const toast = useToast();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    const out: Step[] = [{ label: `Device: ${deviceInfo()}`, ok: true }];
    const push = (s: Step) => {
      out.push(s);
      setSteps([...out]);
    };
    try {
      const res = await fetch(new URL('import-test.pdf', document.baseURI).href);
      const file = new File([await res.blob()], 'import-test.pdf', { type: 'application/pdf' });
      push({ label: 'Load the test PDF', ok: file.size > 0 });
      const imported = await importFile(file);
      push({ label: 'Read the text from the PDF', ok: imported.chapters.some((c) => c.text.includes('My Library')) });
      try {
        const book = await saveImportedBook(imported, { name: file.name, size: file.size, type: file.type, data: file }, 'Other');
        await deleteBook(book.id);
        push({ label: 'Save a book with its original file', ok: true });
      } catch (e) {
        push({ label: 'Save a book with its original file', ok: false, detail: `${(e as Error).name}: ${(e as Error).message}` });
        const book = await saveImportedBook(imported, { name: file.name, size: file.size, type: file.type, data: file }, 'Other', false);
        await deleteBook(book.id);
        push({ label: 'Save the text only (fallback)', ok: true });
      }
    } catch (e) {
      push({ label: 'Import failed', ok: false, detail: `${(e as Error).name}: ${(e as Error).message}` });
    }
    setSteps([...out]);
    setRunning(false);
  };

  const report = steps?.map((s) => `${s.ok ? '✓' : '✗'} ${s.label}${s.detail ? ` — ${s.detail}` : ''}`).join('\n') ?? '';
  const allOk = steps && steps.every((s) => s.ok);

  return (
    <section className="card">
      <h3>Check book import</h3>
      <p>Having trouble adding a book? This runs a real test import on this device and shows which step fails.</p>
      <button className="btn" onClick={run} disabled={running}>
        {running ? 'Checking…' : 'Run the check'}
      </button>
      {steps && (
        <>
          <ul className="list" style={{ marginTop: 12 }}>
            {steps.map((s, i) => (
              <li key={i} className="list-row" style={{ minHeight: 0 }}>
                <span style={{ color: s.ok ? 'var(--ok)' : 'var(--danger)' }}>{s.ok ? '✓' : '✗'}</span>
                <span className="grow small">
                  {s.label}
                  {s.detail && <div className="sub">{s.detail}</div>}
                </span>
              </li>
            ))}
          </ul>
          {!running && (
            <p className="small" style={{ marginTop: 10 }}>
              {allOk
                ? 'Everything works here. If one of your files still fails, the problem is that file (for example copy protection or a scanned PDF); the error message will say which.'
                : 'Something on this device is blocking imports. Tap “Copy results” and send them to support.'}
            </p>
          )}
          <button
            className="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(report);
                toast('Results copied');
              } catch {
                toast('Select the results and copy them.');
              }
            }}
          >
            Copy results
          </button>
        </>
      )}
    </section>
  );
}
