import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from '../hooks/toast';

/** Tells the user when the app is ready offline, and when an update is available. */
export function UpdatePrompt() {
  const toast = useToast();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Check for updates every hour while the app is open.
      if (reg) setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (offlineReady) {
      toast('My Library is ready to work offline.');
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady, toast]);

  useEffect(() => {
    if (needRefresh) {
      toast('A new version of My Library is available.', {
        ms: 0,
        action: { label: 'Update', run: () => updateServiceWorker(true) },
      });
      setNeedRefresh(false);
    }
  }, [needRefresh, setNeedRefresh, toast, updateServiceWorker]);

  return null;
}
