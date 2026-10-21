import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
  action?: { label: string; run: () => void };
}
type ShowToast = (text: string, opts?: { kind?: Toast['kind']; action?: Toast['action']; ms?: number }) => void;

const Ctx = createContext<ShowToast>(() => undefined);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback<ShowToast>(
    (text, opts = {}) => {
      const id = ++seq;
      setToasts((t) => [...t.slice(-2), { id, text, kind: opts.kind ?? 'info', action: opts.action }]);
      const ms = opts.ms ?? (opts.kind === 'error' ? 7000 : 3500);
      if (ms > 0) setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );
  const value = useMemo(() => show, [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                className="btn btn-primary"
                style={{ minHeight: 34, padding: '0 12px' }}
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
