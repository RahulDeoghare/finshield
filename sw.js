/* FinShield service worker — offline cache + notifications */
const CACHE = 'finshield-v3';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './detector.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/badge-96.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // navigations (incl. share-target launches with query params):
  // network-first so updates always show; cached shell only when offline
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return resp;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // network-first for static assets, cache fallback for offline
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return resp;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});

/* notifications requested by the page (works while app is backgrounded) */
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SHOW_NOTIFICATION') {
    const { title, options } = e.data.payload;
    self.registration.showNotification(title, options);
  }
});

/* Web Push (requires a push server with VAPID keys to actually send) */
self.addEventListener('push', (e) => {
  let data = { title: 'FinShield alert', body: 'A scanned message looks like a scam.' };
  try { data = { ...data, ...e.data.json() }; } catch { /* keep defaults */ }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      vibrate: [120, 60, 120],
      data: { url: data.url || './index.html' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes('index.html') || new URL(w.url).pathname.endsWith('/'));
      if (existing) return existing.focus();
      return self.clients.openWindow(e.notification.data?.url || './index.html');
    }),
  );
});
