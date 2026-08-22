// Service Worker —— 离线缓存（v3，图片改为网络优先，修复头像/图片不更新的问题）
// 策略：所有资源网络优先（确保更新即时生效），离线时才用缓存兜底
const CACHE = 'restart-v3'; // 版本号升级，激活时自动清除旧缓存

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/index.html', '/style.css', '/app.js', '/manifest.json'])));
  self.skipWaiting(); // 立即激活，不等旧 SW 释放
});

self.addEventListener('activate', e => {
  // 清除旧版本缓存（v2 及更早）
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim(); // 立即接管所有页面
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 只处理同源 GET 请求
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // 全部资源网络优先：先用网络，成功则更新缓存；网络失败用缓存兜底（离线可用）
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});