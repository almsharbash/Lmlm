/* LMLM Service Worker v2
 * استراتيجية:
 *   - HTML/JS/CSS → Network-first (دائماً أحدث نسخة)
 *   - صور/manifest → Cache-first (أسرع)
 *   - Supabase API → بدون تدخل (بيانات حية)
 */

const VERSION = 'lmlm-v2';

const STATIC = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* ---------- Install ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(STATIC).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

/* ---------- Activate ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ---------- Fetch ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // لا نتدخل في غير GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // لا نتدخل في طلبات Supabase أو أي API خارجي
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('jsdelivr.net')) return;

  // HTML / JS / CSS / Fonts → Network-first
  if (['document', 'script', 'style', 'font'].includes(req.destination)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, clone)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // صور / manifest → Cache-first
  if (['image', 'manifest'].includes(req.destination)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            const clone = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, clone)).catch(() => {});
            return res;
          })
          .catch(() => cached);
      })
    );
    return;
  }

  // الباقي: نجرّب الشبكة، ونستخدم الكاش كاحتياط
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
