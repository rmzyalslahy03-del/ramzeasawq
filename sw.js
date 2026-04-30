// sw.js - Service Worker لتخزين الموقع مؤقتاً وتسريع التحميل
const CACHE_NAME = 'markets-cache-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// تثبيت الـ SW وتخزين الملفات الثابتة مسبقاً
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// تنظيف الإصدارات القديمة
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// استراتيجية: للملفات الثابتة -> Cache First ثم Network
// لطلبات API (Supabase) -> Network First ثم Cache (لكننا نستخدم تحديث الخلفية من JS)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // تجاهل طلبات التحليلات والإعلانات إن وجدت
  if (url.pathname.includes('analytics') || url.pathname.includes('firestore')) {
    return;
  }

  // للملفات الثابتة (HTML, CSS, JS, Fonts, Images)
  if (STATIC_ASSETS.some(asset => event.request.url.includes(asset)) || 
      event.request.destination === 'style' ||
      event.request.destination === 'script' ||
      event.request.destination === 'font' ||
      event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        return cachedResponse || fetch(event.request).then(networkResponse => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        });
      })
    );
    return;
  }

  // لطلبات Supabase API: استراتيجية Network First مع تحديث الكاش (احتياطي)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).then(networkResponse => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      }).catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'No internet connection' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // لجميع الطلبات الأخرى: Network First
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
