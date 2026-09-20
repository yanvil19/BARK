// ─── Cache name ──────────────────────────────────────────────────────────────
// Bump this string whenever you want to force all clients to get a fresh cache.
const CACHE_NAME = 'nu-board-static-v2';

// ─── Precache manifest ────────────────────────────────────────────────────────
// This array is replaced at build time by the injectPrecacheManifest Vite plugin
// (see vite.config.js). In dev/preview it falls back to just the shell entries.
const PRECACHE_MANIFEST = self.__PRECACHE_MANIFEST__ || [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

// ─── Install: cache everything in PRECACHE_MANIFEST ──────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_MANIFEST))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: delete stale caches ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : null)
      ))
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Never intercept API calls — app IndexedDB layer owns those responses.
  if (url.pathname.startsWith('/api')) return;

  // 2. Navigation (HTML): network-first → fall back to cached /index.html (SPA shell).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then((r) => r || caches.match('/'))
      )
    );
    return;
  }

  // 3. Static assets: stale-while-revalidate.
  //    Precached assets are served instantly; the network update runs in background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});

