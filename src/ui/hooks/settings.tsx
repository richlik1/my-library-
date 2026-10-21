import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSettings, saveSettings } from '../../core/storage/db';
import { DEFAULT_SETTINGS, type Settings } from '../../core/types';

interface Ctx {
  settings: Settings;
  loaded: boolean;
  update(patch: Partial<Settings>): void;
}
const SettingsCtx = createContext<Ctx>({ settings: DEFAULT_SETTINGS, loaded: false, update: () => undefined });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getSettings()
      .then(setSettings)
      .finally(() => setLoaded(true));
  }, []);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next).catch(() => undefined);
      return next;
    });
  }, []);
  return <SettingsCtx.Provider value={{ settings, loaded, update }}>{children}</SettingsCtx.Provider>;
}

export const useSettings = () => useContext(SettingsCtx);
