/*
 * Tech Nerv Accounts service worker.
 *
 * Deliberately conservative: financial data is private, so pages, API
 * responses and Supabase traffic are NEVER cached. We only cache:
 *   - Next.js build assets (/_next/static — content-hashed, immutable)
 *   - icons, fonts and the offline page
 * Navigations go to the network; if that fails, the offline page is shown.
 */
const VERSION = 'v1';
const STATIC_CACHE = `tn-static-${VERSION}`;
const SHELL = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== STATIC_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Page loads: always fresh from the network; offline page as the fallback.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match('/offline.html')) || Response.error()));
    return;
  }

  // Immutable build assets and icons: cache first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || /\.(woff2?|ttf)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
  }
  // Everything else (RSC payloads, /api, files) passes straight through.
});
