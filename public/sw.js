// Service Worker —— 离线缓存（v2，修复旧版缓存滞留问题）
// 策略：JS/CSS/HTML 网络优先（确保更新即时生效），图片缓存优先（变化少）
const CACHE = 'restart-v2'; // 版本号升级，旧缓存自动清除

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/index.html', '/style.css', '/app.js', '/manifest.json'])));
  self.skipWaiting(); // 立即激活，不等旧 SW 释放
});

self.addEventListener('activate', e => {
  // 清除旧版本缓存
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim(); // 立即接管所有页面
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // JS / CSS / HTML：永远先尝试网络，确保用户看到最新版；网络失败时用缓存兜底
  if (url.pathname.match(/\.(css|js|html)$/) || url.pathname === '/') {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // 图片 / 图标 / 字体：缓存优先（这些不常变，加快加载速度）
  if (url.pathname.match(/\.(png|jpg|svg|ico|woff2?)$/)) {
    e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
  }
});