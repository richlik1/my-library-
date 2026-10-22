/// <reference lib="webworker" />
/**
 * Service worker: offline app shell (Workbox precache), plus the headers that
 * make the page "cross-origin isolated". GitHub Pages can't send those
 * headers itself; with them the natural voice can use several processor
 * cores instead of one.
 */
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, addPlugins } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

function withIsolation(r: Response | undefined | null): Response | undefined {
  if (!r || r.status === 0 || r.type === 'opaque' || r.type === 'opaqueredirect') return r ?? undefined;
  const h = new Headers(r.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  h.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}

const isolate = {
  cachedResponseWillBeUsed: async ({ cachedResponse }: { cachedResponse?: Response }) => withIsolation(cachedResponse) ?? null,
  fetchDidSucceed: async ({ response }: { response: Response }) => withIsolation(response)!,
};

addPlugins([isolate]);
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// CJK maps / fonts for some PDFs, and the natural-voice runtime: cached the first time they're used.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.includes('/pdfjs/'),
  new CacheFirst({ cacheName: 'pdfjs-assets', plugins: [new ExpirationPlugin({ maxEntries: 400 }), isolate] }),
);
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.includes('/ort/'),
  new CacheFirst({ cacheName: 'voice-runtime', plugins: [new ExpirationPlugin({ maxEntries: 8 }), isolate] }),
);

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
