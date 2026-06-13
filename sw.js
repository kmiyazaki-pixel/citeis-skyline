// =====================================================
//  Service Worker - オフライン対応 (ネットワーク優先)
//   ・更新を取りこぼさないよう network-first
//   ・オフライン時のみキャッシュにフォールバック
// =====================================================

const CACHE = 'komorebi-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        // 同一オリジンのみキャッシュ更新 (CDN もキャッシュしてオフライン可)
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
