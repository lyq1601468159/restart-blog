// Service Worker —— 离线缓存
// 策略：静态资源缓存优先，API 直接走网络（不缓存）
const CACHE = 'restart-v1';
const STATIC = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 静态资源：缓存优先
  if (STATIC.some(s => url.pathname.endsWith(s)) || url.pathname.match(/\.(css|js|png|jpg|svg|ico|woff2?)$/)) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );
  }
  // API / 动态请求：网络优先，失败时不做缓存（保持数据新鲜）
  // 让浏览器默认处理（网络失败返回错误）
});