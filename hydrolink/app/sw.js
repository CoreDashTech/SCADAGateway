/* CoreDash HydroLink service worker — offline app shell */
var CACHE = 'cdhl-v1';
var SHELL = ['./', 'index.html', 'app.css', 'sim.js', 'core.js', 'control.js', 'pages-ops.js', 'pages-data.js', 'pages-admin.js', 'station3d.js', 'settings.js', 'i18n-dict.js', 'i18n.js', 'live.js', 'points.js', 'replay.js', 'samples/scenario-peak.json', 'samples/scenario-p01-fault.json', 'samples/scenario-power-estop.json', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(function (r) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, cp); }); return r; }).catch(function () { return caches.match(e.request).then(function (m) { return m || caches.match('index.html'); }); }));
});
