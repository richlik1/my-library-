/**
 * What happened while starting and running the voice and the player on this device (shown in Settings,
 * for troubleshooting). Kept on the device, so it survives the phone closing the app.
 */
const KEY = 'ml-voice-log';
const MAX = 80;

let voiceLog: string[] | null = null;

function lines(): string[] {
  if (!voiceLog) {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
      voiceLog = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-MAX) : [];
    } catch {
      voiceLog = [];
    }
  }
  return voiceLog;
}

export function vlog(line: string) {
  const log = lines();
  const now = new Date();
  log.push(`${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${now.toLocaleTimeString()} ${line}`);
  if (log.length > MAX) log.splice(0, log.length - MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    /* private mode or full: kept in memory only */
  }
}

export const getVoiceLog = () => [...lines()];
