/* MASSFRONT PWA shell cache. Updates and channel manifests always bypass the
   cache; packaged runtime files are network-first and become offline fallbacks
   only after the player has successfully fetched them. */
'use strict';

const MF_SW_VERSION = '1.33.88-shell1';
const MF_SW_PREFIX = 'massfront-pwa-';
const MF_SW_CACHE = MF_SW_PREFIX + MF_SW_VERSION;
/* Runtime code stays in the shell cache so an installed PWA always reaches the
   updater and offline game. Large visual/audio responses use a separate FIFO
   cache with hard accounting limits; CacheStorage otherwise grows for every
   battlefield the player visits until the browser evicts the entire origin. */
const MF_SW_CONTENT_CACHE = MF_SW_CACHE + '-content';
const MF_SW_CONTENT_MAX_ENTRIES = 240;
const MF_SW_CONTENT_MAX_BYTES = 160 * 1024 * 1024;
const MF_SW_CONTENT_MAX_ITEM_BYTES = 48 * 1024 * 1024;
const MF_SW_CONTENT_UNKNOWN_BYTES = 4 * 1024 * 1024;
const MF_SW_CONTENT_PATH = /\.(?:avif|bin|gif|glb|jpe?g|ktx2|m4a|mp3|mp4|ogg|png|webm|webp|wav)$/i;
let MF_SW_CONTENT_STATE = null;
let MF_SW_CONTENT_QUEUE = Promise.resolve();
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
  /* Updater and asset-pack fetches explicitly use no-store because their bytes
     are hash-verified and atomically persisted in IndexedDB. Caching the same
     response here doubles storage and can make the final IDB transaction fail. */
  if (request.cache === 'no-store') return true;
  return /(?:^|\/)(?:update(?:-preview)?\.json|assets\/update-config\.json)$/.test(url.pathname);
}

function mfSwContentBytes(response) {
  const raw=response&&response.headers&&response.headers.get('content-length');
  const n=raw!==null&&raw!==''?Number(raw):NaN;
  return Number.isFinite(n) && n >= 0 ? n : MF_SW_CONTENT_UNKNOWN_BYTES;
}

function mfSwStampedContent(response, bytes) {
  const copy = response.clone();
  const headers = new Headers(copy.headers);
  headers.set('x-massfront-cache-bytes', String(bytes));
  return new Response(copy.body, { status:copy.status, statusText:copy.statusText, headers });
}

async function mfSwContentState(cache) {
  if (MF_SW_CONTENT_STATE) return MF_SW_CONTENT_STATE;
  const keys = await cache.keys();
  const state = { order:[], sizes:new Map(), bytes:0 };
  for (const key of keys) {
    const response = await cache.match(key);
    const raw=response&&response.headers&&response.headers.get('x-massfront-cache-bytes');
    const n=raw!==null&&raw!==''?Number(raw):NaN;
    const size = Number.isFinite(n) && n >= 0 ? n : MF_SW_CONTENT_UNKNOWN_BYTES;
    state.order.push(key.url); state.sizes.set(key.url,size); state.bytes+=size;
  }
  MF_SW_CONTENT_STATE=state;
  return state;
}

async function mfSwStoreContent(request,response,bytes) {
  const work=MF_SW_CONTENT_QUEUE.then(async()=>{
    const cache=await caches.open(MF_SW_CONTENT_CACHE),state=await mfSwContentState(cache);
    const key=request.url,prior=state.sizes.get(key);
    /* Cache.put replaces an existing entry atomically. Do it before changing
       the ledger so quota/write failure preserves the last offline-good body. */
    await cache.put(request,mfSwStampedContent(response,bytes));
    if(prior!==undefined){
      state.bytes-=prior;state.sizes.delete(key);
      const at=state.order.indexOf(key);if(at>=0)state.order.splice(at,1);
    }
    state.order.push(key);state.sizes.set(key,bytes);state.bytes+=bytes;
    while(state.order.length>MF_SW_CONTENT_MAX_ENTRIES||state.bytes>MF_SW_CONTENT_MAX_BYTES){
      const oldest=state.order.shift(),size=state.sizes.get(oldest)||0;
      await cache.delete(oldest);
      /* Browser quota eviction may have removed the record behind our in-memory
         ledger already. Retire its charge either way so the loop still closes. */
      state.bytes-=size;state.sizes.delete(oldest);
    }
  });
  /* A failed write must not poison every later cache operation. */
  MF_SW_CONTENT_QUEUE=work.catch(()=>{});
  return work;
}

async function mfSwStore(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return response;
  const content = MF_SW_CONTENT_PATH.test(new URL(request.url).pathname);
  const bytes = content ? mfSwContentBytes(response) : 0;
  if (content && bytes > MF_SW_CONTENT_MAX_ITEM_BYTES) return response;
  try {
    if(content) await mfSwStoreContent(request,response,bytes);
    else{
      const cache=await caches.open(MF_SW_CACHE);
      await cache.put(request,response.clone());
    }
  } catch (error) {
    /* A successful network response must still reach the game when storage is
       full, private, or being evicted. Offline fallback is best-effort here. */
  }
  return response;
}

async function mfSwFallback(request, navigation) {
  const url = new URL(request.url);
  const cache = await caches.open(MF_SW_CONTENT_PATH.test(url.pathname) ? MF_SW_CONTENT_CACHE : MF_SW_CACHE);
  const exact = await cache.match(request);
  if (exact) return exact;
  if (navigation) return cache.match('./index.html', { ignoreSearch: true });
  return null;
}

async function mfSwMigrateLegacyContent() {
  const shell=await caches.open(MF_SW_CACHE),keys=await shell.keys();
  for(const key of keys){
    if(!MF_SW_CONTENT_PATH.test(new URL(key.url).pathname)) continue;
    const response=await shell.match(key);
    if(response){
      const bytes=mfSwContentBytes(response);
      if(bytes<=MF_SW_CONTENT_MAX_ITEM_BYTES) await mfSwStoreContent(key,response,bytes);
    }
    /* Earlier workers mixed media into the unbounded shell cache. Whether the
       entry moved or exceeded the new per-item ceiling, it cannot remain there
       and silently bypass all future accounting. */
    await shell.delete(key);
  }
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
    await Promise.all(names.filter(name => name.startsWith(MF_SW_PREFIX) &&
      name !== MF_SW_CACHE && name !== MF_SW_CONTENT_CACHE).map(name => caches.delete(name)));
    try{await mfSwMigrateLegacyContent();}catch(error){}
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
