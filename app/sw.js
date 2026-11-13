// CoreDash Nexus service worker: caches the app shell so the app opens instantly and offline.
// Live data (/api, /ws) always goes to the network.
const CACHE = 'coredash-app-v28';
const SHELL = [
  './', './index.html', './app.css', './app.js', './coredash-client.mjs', './manifest.webmanifest', './twin.js', './bench.js', './report.js', './power.js', './power-sim.js', './home.js', './meter-ocr.js', './pq.js', './pq-model.js', './pw3198.js', './pq-alarms.js', './realcam.js', './audit.js', './audit-engine.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
  './icons/favicon.png', './icons/logo-green.webp', './icons/logo-red.webp'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname === '/ws') return;
  if (url.origin === location.origin) {
    // network-first: a new upload shows on the next reload; the cache is only the offline fallback
    e.respondWith(caches.open(CACHE).then(async (c) => {
      try {
        const r = await fetch(e.request, { cache: 'no-cache' });
        if (r.ok) c.put(e.request, r.clone());
        return r;
      } catch (_) {
        return (await c.match(e.request)) || (await c.match('./index.html')) || Response.error();
      }
    }));
  } else if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try { const r = await fetch(e.request); c.put(e.request, r.clone()); return r; } catch (_) { return Response.error(); }
    }));
  }
});

// Push notifications from the gateway (when a push service is configured).
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data.json(); } catch (_) { data = { title: 'CoreDash Nexus', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(data.title || 'CoreDash Nexus', { body: data.body || '', icon: 'icons/icon-192.png', badge: 'icons/favicon.png', tag: data.tag || 'coredash' }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow('./#alerts'))));
});
