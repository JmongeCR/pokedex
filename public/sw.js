const VERSION = 'pokedex-v3';

// On install: cache the app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(['/', '/src/style.css', '/src/main.js']).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// On activate: remove old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Skip Vite HMR / dev-only
  if (url.pathname.startsWith('/@') || url.pathname.includes('__vite')) return;

  // External: fonts, PokéAPI, sprites → network first, cache fallback
  const isExternal = (
    url.hostname === 'pokeapi.co' ||
    url.hostname === 'raw.githubusercontent.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  );

  if (isExternal) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(VERSION).then(c => c.put(e.request, clone));
          }
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // App shell → cache first, network fallback, then offline root
  e.respondWith(
    caches.match(e.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(VERSION).then(c => c.put(e.request, clone));
          }
          return r;
        });
      })
      .catch(() => caches.match('/'))
  );
});
