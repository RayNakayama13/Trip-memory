/**
 * アプリ本体をキャッシュして、オフラインでも思い出を見返せるようにする Service Worker。
 *
 * - ビルド成果物（/assets/ 以下のハッシュ付きファイル）はキャッシュ優先
 * - ページ本体はネットワーク優先（更新をすぐ反映し、圏外ではキャッシュを使う）
 * - 地図タイルや地名 API など外部への通信は一切キャッシュしない
 */
const VERSION = 'v1';
const CACHE = `trip-memory-${VERSION}`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // ルートだけ先に取得しておき、初回オフラインでも起動できるようにする
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(new Request('./', { cache: 'reload' }))).catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put('./', copy));
          return response;
        })
        .catch(() => caches.match('./').then((cached) => cached ?? Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
