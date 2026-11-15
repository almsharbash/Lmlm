/* LMLM Service Worker v4
 * استراتيجية:
 *   - HTML/JS/CSS → Network-first (دائماً أحدث نسخة) مع كاش احتياطي
 *   - صور/manifest → Cache-first
 *   - مكتبات CDN المثبّتة بإصدار → Cache-first (تعمل دون اتصال بعد أول تحميل)
 *   - Supabase API → بدون تدخل (بيانات حية)
 * لا يُخزَّن في الكاش إلا الردود الناجحة (200) كي لا تُحفظ أخطاء 404/500.
 */

const VERSION = 'lmlm-v4';

const STATIC = [
  './',
  './index.html',
  './legal.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

const CDN_HOSTS = ['cdn.jsdelivr.net', 'esm.sh'];

/* ---------- Install ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // نضيف كل ملف على حدة كي لا يُفشل ملفٌ مفقود تخزين الباقي
      .then((cache) => Promise.all(STATIC.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

/* ---------- Activate ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function put(req, res) {
  if (res && res.ok && res.status === 200) {
    const clone = res.clone();
    caches.open(VERSION).then((c) => c.put(req, clone)).catch(() => {});
  }
  return res;
}

/* ---------- Fetch ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // بيانات Supabase حيّة: لا نتدخل أبداً
  if (url.hostname.endsWith('supabase.co')) return;

  // مكتبات CDN (مثبّتة بإصدار): كاش أولاً ثم الشبكة
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => put(req, res)))
    );
    return;
  }

  // لا نتدخل في أي نطاق خارجي آخر (خطوط Google تُترك للمتصفح)
  if (url.origin !== self.location.origin) return;

  // HTML / JS / CSS → Network-first
  if (req.mode === 'navigate' || ['document', 'script', 'style', 'font'].includes(req.destination)) {
    event.respondWith(
      fetch(req)
        .then((res) => put(req, res))
        .catch(() =>
          caches.match(req, { ignoreSearch: true }).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // صور / manifest → Cache-first
  if (['image', 'manifest'].includes(req.destination)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => put(req, res)))
    );
    return;
  }

  // الباقي: الشبكة ثم الكاش
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
