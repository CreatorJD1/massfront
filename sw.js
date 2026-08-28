/* MASSFRONT PWA shell cache. Updates and channel manifests always bypass the
   cache; packaged runtime files are network-first and become offline fallbacks
   only after the player has successfully fetched them. */
'use strict';

const MF_SW_VERSION = '1.33.48-shell1';
const MF_SW_PREFIX = 'massfront-pwa-';
const MF_SW_CACHE = MF_SW_PREFIX + MF_SW_VERSION;
const MF_SW_BOOT = [
  './', './index.html', './boot.js',
  './assets/app.webmanifest', './assets/data/manifest.json'
];

function mfSwBypass(url, request) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) return true;
  return /(?:^|\/)(?:update(?:-preview)?\.json|assets\/update-config\.json)$/.test(url.pathname);
}

async function mfSwStore(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return response;
  const cache = await caches.open(MF_SW_CACHE);
  await cache.put(request, response.clone());
  return response;
}

async function mfSwFallback(request, navigation) {
  const cache = await caches.open(MF_SW_CACHE);
  const exact = await cache.match(request);
  if (exact) return exact;
  if (navigation) return cache.match('./index.html', { ignoreSearch: true });
  return null;
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(MF_SW_CACHE).then(cache => cache.addAll(MF_SW_BOOT)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(MF_SW_PREFIX) && name !== MF_SW_CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (mfSwBypass(url, request)) return;
  const navigation = request.mode === 'navigate';
  event.respondWith((async () => {
    try {
      return await mfSwStore(request, await fetch(request));
    } catch (error) {
      const fallback = await mfSwFallback(request, navigation);
      if (fallback) return fallback;
      throw error;
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'MASSFRONT_SW_STATUS') {
    event.source?.postMessage({ type: 'MASSFRONT_SW_STATUS', version: MF_SW_VERSION, cache: MF_SW_CACHE });
  }
});
