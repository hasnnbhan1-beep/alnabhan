/* =========================================================
   النبهان — Service Worker
   يعطي: تحميل فوري، عمل بلا إنترنت، وتثبيت كتطبيق
   ========================================================= */
const VERSION = 'nabhan-v4.9';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './admin.html',
  './admin.css',
  './admin.js',
  './manifest.json',
  './mark-192.png',
  './mark-512.png',
  './icon-192.png',
  './icon-512.png',
  './fonts/Tajawal-Bold.ttf',
  './fonts/Tajawal-ExtraBold.ttf',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // لوحة تحكم المالك: بلا تخزين مؤقت إطلاقاً (بيانات حسّاسة)
  if (url.pathname.startsWith('./admin') || url.pathname.includes('/admin')) return;

  // بيانات المتجر: الأسرع من الشبكة، ومع الاحتياط من الكاش عند انقطاع الإنترنت
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // التنقّل: الشبكة أولاً ثم الكاش (حتى لا تظهر نسخة قديمة)
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // الوسائط والملفات: من الكاش فوراً + تحديث في الخلفية
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// زر التثبيت من داخل الصفحة
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
