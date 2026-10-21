import { Capacitor } from '@capacitor/core';

/** True inside the iOS app (App Store build), false in a browser / home-screen web app. */
export const isNativeApp = () => Capacitor.isNativePlatform();

/** Short description of this device and browser, for import diagnostics. */
export function deviceInfo(): string {
  const ua = navigator.userAgent;
  const ios = /OS (\d+)[._](\d+)/.exec(ua);
  const os = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    ? `iOS ${ios ? `${ios[1]}.${ios[2]}` : '?'}`
    : /Android ([\d.]+)/.exec(ua)?.[0] ?? (/Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : 'other OS');
  const browser = /CriOS/.test(ua)
    ? 'Chrome'
    : /FxiOS/.test(ua)
      ? 'Firefox'
      : /EdgiOS|Edg\//.test(ua)
        ? 'Edge'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? `Safari ${/Version\/([\d.]+)/.exec(ua)?.[1] ?? ''}`.trim()
            : 'in-app browser';
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone || window.matchMedia?.('(display-mode: standalone)').matches;
  const where = isNativeApp() ? 'iOS app' : standalone ? 'Home Screen app' : window.top !== window.self ? 'embedded page' : 'browser tab';
  return `${os} · ${browser} · ${where}`;
}
