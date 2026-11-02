/* =========================================================
   النبهان — Service Worker
   يعطي: تحميل فوري، عمل بلا إنترنت، وتثبيت كتطبيق
   ========================================================= */
const VERSION = 'nabhan-v8.2';
const IMG_CACHE = 'nabhan-img-v1'; // صور المنتجات (روابط خارجية) للعمل بلا إنترنت
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
  './icon-180.png',
  './brand-card.png',
  './brand-stage.png',
  './logo-192.png',
  './logo-512.png',
  './fonts/Tajawal-Bold.ttf',
  './fonts/Tajawal-ExtraBold.ttf',
];

async function trimImages(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length > 240) {
      for (const k of keys.slice(0, keys.length - 220)) await cache.delete(k);
    }
  } catch {}
}

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

  // صور المنتجات من التخزين السحابي: تُحفظ محلياً لتعمل بلا إنترنت
  if (url.origin !== self.location.origin) {
    if (req.destination !== 'image') return;
    event.respondWith(
      caches.open(IMG_CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) {
          fetch(req)
            .then((res) => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()).catch(() => {}); })
            .catch(() => {});
          return hit;
        }
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            c.put(req, copy).then(() => trimImages(c)).catch(() => {});
          }
          return res;
        } catch (err) {
          return new Response('', { status: 504 });
        }
      })
    );
    return;
  }

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
