/* MASSFRONT PWA shell cache. Updates and channel manifests always bypass the
   cache; packaged runtime files are network-first and become offline fallbacks
   only after the player has successfully fetched them. */
'use strict';

const MF_SW_VERSION = '1.33.68-shell3';
const MF_SW_PREFIX = 'massfront-pwa-';
const MF_SW_CACHE = MF_SW_PREFIX + MF_SW_VERSION;
const MF_SW_UPDATE_DB = 'massfront-updates';
const MF_SW_UPDATE_STORE = 'bundles';
const MF_SW_OPERATION_STALE_MS = 5 * 60 * 1000;
let MF_SW_REPAIR_STATUS = 'pending';
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

function mfSwSameUpdateIdentity(a, b) {
  return !!(a && b && String(a.version) === String(b.version) &&
    String(a.channel || 'stable') === String(b.channel || 'stable') &&
    String(a.at == null ? '' : a.at) === String(b.at == null ? '' : b.at));
}

function mfSwCompleteUpdateBundle(value) {
  if (!value || !value.version || !value.files || typeof value.files !== 'object') return false;
  const order = Array.isArray(value.order) && value.order.length ? value.order : Object.keys(value.files);
  return !!order.length && order.every(path =>
    typeof path === 'string' && typeof value.files[path] === 'string');
}

/* v1.33.49/50 could leave activeMeta pointing at an older active snapshot.
   Their updater refuses to preserve rollback before it reads the authoritative
   active payload, so the already-verified next update cannot promote itself.
   Remove only that stale index during the outer PWA-shell update. The old
   updater then validates active against the exact running identity and writes
   activeMeta back in its lease-owned transaction. A genuinely mismatched
   payload still fails closed; pending, rollback, probation and player data are
   never touched here. */
async function mfSwRepairStaleUpdateMeta() {
  if (!self.indexedDB) return false;
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(MF_SW_UPDATE_DB, 1);
    request.onupgradeneeded = () => {
      const next = request.result;
      if (!next.objectStoreNames.contains(MF_SW_UPDATE_STORE)) next.createObjectStore(MF_SW_UPDATE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('update database unavailable'));
  });
  if (!db.objectStoreNames.contains(MF_SW_UPDATE_STORE)) { db.close(); return false; }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MF_SW_UPDATE_STORE, 'readwrite');
    const store = tx.objectStore(MF_SW_UPDATE_STORE);
    const active = store.get('active');
    const meta = store.get('activeMeta');
    const operation = store.get('operation');
    let ready = 0, repaired = false;
    const inspect = () => {
      if (++ready < 3) return;
      const op = operation.result;
      const age = op && Number.isFinite(op.at) ? Date.now() - op.at : -1;
      const operationLive = !!(op && op.token && (age < 0 || age < MF_SW_OPERATION_STALE_MS));
      const bundle = active.result;
      if (!operationLive && mfSwCompleteUpdateBundle(bundle) && meta.result &&
          !mfSwSameUpdateIdentity(bundle, meta.result)) {
        store.delete('activeMeta');
        repaired = true;
      }
    };
    active.onsuccess = inspect; meta.onsuccess = inspect; operation.onsuccess = inspect;
    active.onerror = () => reject(active.error || new Error('active update unavailable'));
    meta.onerror = () => reject(meta.error || new Error('active metadata unavailable'));
    operation.onerror = () => reject(operation.error || new Error('update operation unavailable'));
    tx.oncomplete = () => { db.close(); resolve(repaired); };
    tx.onerror = () => { const error = tx.error; db.close(); reject(error || new Error('metadata repair failed')); };
    tx.onabort = () => { const error = tx.error; db.close(); reject(error || new Error('metadata repair aborted')); };
  });
}

self.addEventListener('install', event => {
  /* The hosted shell is the recovery layer for browser-installed builds. A
     waiting worker left old PWA installs on an earlier boot.js, so the game
     could download an OTA but fail its final identity check. Activate the
     verified network-first shell immediately; active game code still changes
     only through the updater's separate atomic promotion path. */
  event.waitUntil(caches.open(MF_SW_CACHE)
    .then(cache => cache.addAll(MF_SW_BOOT))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try { MF_SW_REPAIR_STATUS = await mfSwRepairStaleUpdateMeta() ? 'repaired' : 'unchanged'; }
    catch (error) { MF_SW_REPAIR_STATUS = 'error'; }
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
    event.source?.postMessage({ type: 'MASSFRONT_SW_STATUS', version: MF_SW_VERSION,
      cache: MF_SW_CACHE, repair: MF_SW_REPAIR_STATUS });
  }
});
