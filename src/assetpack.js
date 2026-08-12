;
;
/* ============================================================================
   ASSET PACKS — media the installer does not carry
   ----------------------------------------------------------------------------
   The soundtrack alone is ten megabytes, and that is nine tracks. Bundling media
   into the installer means every future addition inflates a download that every
   player pays for whether or not they ever hear it — and it puts the build over
   the size where phones stop installing over cellular.

   So the app ships lean and fetches packs from Cloudflare on first launch:

     GET  <endpoint>/packs.json          what packs exist and what is in them
     GET  <endpoint>/pack/<pack>/<file>  one file

   Downloaded files are stored as Blobs in IndexedDB and served back as
   `blob:` URLs, which HTMLAudioElement plays exactly like a network URL. That
   choice matters on iOS in particular: a WKWebView's HTTP cache is evictable and
   opaque, so relying on it would mean silently re-downloading the soundtrack at
   unpredictable intervals on someone's mobile data. IndexedDB is the only client
   storage that is both durable and inspectable.

   THREE RULES, all of them about not being rude to the player:
     * Nothing here is required. Miss the pack, fail the download, decline it —
       the game plays. Music is the only thing affected and it falls back to the
       bundled beds.
     * Never download without consent on a metered connection. The prompt says
       the size before anything transfers.
     * Never re-download what is already stored. Files are keyed by name and
       size; a pack that has not changed costs one small JSON request.
   ============================================================================ */

const PACK = { idx:null, have:{}, busy:false, got:0, total:0, state:'idle', err:'' };
const PACK_DB = 'massfront-packs', PACK_STORE = 'files';
const PACK_PREF = 'massfront_pack_pref';       // 'auto' | 'ask' | 'off'

function packDb(){
  return new Promise((res, rej) => {
    const r = indexedDB.open(PACK_DB, 1);
    r.onupgradeneeded = () => { const d = r.result;
      if(!d.objectStoreNames.contains(PACK_STORE)) d.createObjectStore(PACK_STORE); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function packGet(k){
  const db = await packDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(PACK_STORE, 'readonly');
    const q = tx.objectStore(PACK_STORE).get(k);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
async function packPut(k, v){
  const db = await packDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(PACK_STORE, 'readwrite');
    tx.objectStore(PACK_STORE).put(v, k);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
async function packKeys(){
  const db = await packDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(PACK_STORE, 'readonly');
    const q = tx.objectStore(PACK_STORE).getAllKeys();
    q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error);
  });
}

/* The endpoint is the same one the updater resolves — one server, one setting,
   configured in exactly one place. */
function packEndpoint(){
  if(typeof UPDATE_URL === 'string' && UPDATE_URL) return UPDATE_URL.replace(/\/update\.json.*$/, '');
  if(typeof window !== 'undefined' && window.MASSFRONT_UPDATE_URL)
    return String(window.MASSFRONT_UPDATE_URL).replace(/\/update\.json.*$/, '');
  return '';
}

function packBytes(n){
  return n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
}

async function packLoadIndex(){
  if(typeof netAllowed==='function' && !netAllowed()) return null;
  const base = packEndpoint();
  if(!base) return null;
  try{
    const r = await fetch(base + '/packs.json?t=' + Date.now(), {cache:'no-store'});
    if(!r.ok) return null;
    const j = await r.json();
    PACK.idx = j && j.packs ? j.packs : null;
    return PACK.idx;
  }catch(e){ return null; }
}

/* What is missing, and how many bytes that is. Size is part of the key so a
   replaced file re-downloads without needing a version number. */
async function packMissing(pack){
  if(!PACK.idx || !PACK.idx[pack]) return {files:[], bytes:0};
  const keys = new Set(await packKeys());
  const out = [];
  let bytes = 0;
  for(const f of PACK.idx[pack].files){
    const k = pack + '/' + f.name + ':' + f.size;
    if(!keys.has(k)){ out.push({...f, key:k}); bytes += f.size; }
  }
  return {files:out, bytes};
}

async function packDownload(pack, onProgress){
  if(typeof netAllowed==='function' && !netAllowed()){
    PACK.state='idle'; packRenderBar(); return false;
  }
  const base = packEndpoint();
  if(!base) return false;
  const miss = await packMissing(pack);
  if(!miss.files.length){ PACK.state = 'ready'; return true; }
  PACK.busy = true; PACK.state = 'downloading';
  PACK.total = miss.bytes; PACK.got = 0;
  for(const f of miss.files){
    try{
      const r = await fetch(base + '/pack/' + pack + '/' + encodeURIComponent(f.name));
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob();
      await packPut(f.key, blob);
      PACK.got += f.size;
      if(onProgress) onProgress(PACK.got, PACK.total);
      packRenderBar();
    }catch(e){
      PACK.busy = false; PACK.state = 'error';
      PACK.err = 'Download failed — the game runs without it';
      packRenderBar();
      return false;
    }
  }
  PACK.busy = false; PACK.state = 'ready';
  packRenderBar();
  return true;
}

/* Hand back a playable URL for a pack file, or null if it is not stored. The
   object URL is cached per file — creating a new one on every play would leak a
   blob reference for the lifetime of the document. */
const packURLs = {};
async function packURL(pack, name){
  const k = pack + '/' + name;
  if(packURLs[k]) return packURLs[k];
  if(!PACK.idx || !PACK.idx[pack]) return null;
  const meta = PACK.idx[pack].files.find(f => f.name === name);
  if(!meta) return null;
  const blob = await packGet(k + ':' + meta.size);
  if(!blob) return null;
  return (packURLs[k] = URL.createObjectURL(blob));
}

/* ---- UI -------------------------------------------------------------------
   A single line on the start screen, in the same register as the updater panel:
   quiet when there is nothing to say, explicit about size before it spends
   anyone's data. */
function packPanel(){
  let el = document.getElementById('packPanel');
  if(el) return el;
  el = document.createElement('div');
  el.id = 'packPanel';
  el.innerHTML = '<div class="packRow"><div><div id="packTxt"></div><div id="packSub"></div></div>'
               + '<button id="packBtn"></button></div>'
               + '<div id="packBarO"><div id="packBarF"></div></div>';
  const start = document.getElementById('startScreen');
  const anchor = document.getElementById('updPanel');
  /* The update panel moved into its own overlay (updScr) a while ago, so it is
     no longer a child of the start screen; insertBefore on a foreign node
     throws. Fall back to a plain append — the panel still lands on the start
     screen, just without a hard position beside the version row. */
  if(start && anchor && anchor.parentNode === start) start.insertBefore(el, anchor);
  else if(start) start.appendChild(el);
  el.querySelector('#packBtn').addEventListener('click', e => {
    e.stopPropagation();
    if(typeof sfx === 'function') sfx('ui');
    if(PACK.state === 'downloading') return;
    packStart(true);
  });
  return el;
}
function packRenderBar(){
  const el = document.getElementById('packPanel');
  if(!el) return;
  const txt = el.querySelector('#packTxt'), sub = el.querySelector('#packSub');
  const btn = el.querySelector('#packBtn'), bar = el.querySelector('#packBarF');
  el.classList.toggle('busy', PACK.state === 'downloading');
  if(PACK.state === 'downloading'){
    const pct = PACK.total ? Math.round(PACK.got / PACK.total * 100) : 0;
    txt.textContent = 'DOWNLOADING AUDIO PACK';
    sub.textContent = packBytes(PACK.got) + ' of ' + packBytes(PACK.total) + '  ·  ' + pct + '%';
    bar.style.width = pct + '%'; btn.textContent = '…'; btn.disabled = true;
    el.style.display = '';
  } else if(PACK.state === 'offer'){
    /* No longer soundtrack-only: this panel now covers the voice bank too, and
       telling a player they are downloading music when they are also getting
       every spoken line is the kind of small lie that gets a refund request. */
    txt.textContent = 'AUDIO PACK AVAILABLE';
    sub.textContent = packBytes(PACK.total) + ' — faction music and voices, downloaded once';
    bar.style.width = '0%'; btn.textContent = 'GET IT'; btn.disabled = false;
    el.style.display = '';
  } else if(PACK.state === 'error'){
    txt.textContent = 'AUDIO PACK UNAVAILABLE';
    sub.textContent = PACK.err;
    bar.style.width = '0%'; btn.textContent = 'RETRY'; btn.disabled = false;
    el.style.display = '';
  } else {
    el.style.display = 'none';                    // ready or nothing to offer
  }
}

/* Every pack this build knows how to consume, in the order it wants them.
   `voice` was published on the channel and then never requested by anything —
   packDownload's only call site asked for 'music' and packStart returned early
   unless idx.music existed — so on a pack-only build the radio and KEEN banks
   were never fetched, packURL('voice', …) always returned null, and voice was
   silent on every device. Generalised over a list so the next pack is data. */
/* Voice FIRST. Music is 16.1 MB and voice is 5.2, so fetching in the old order
   meant the download prompt quoted 21.3 MB and KEEN stayed mute until the whole
   soundtrack had landed — on a phone, on mobile data, that is most of a session
   of silence from the feature the update is for. Ordered by what the player
   notices missing, not by what was written first. */
const PACK_WANT = ['voice', 'music'];

async function packStart(manual){
  packPanel();
  const idx = PACK.idx || await packLoadIndex();
  if(!idx){ PACK.state = 'idle'; packRenderBar(); return; }
  const want = PACK_WANT.filter(p => idx[p]);
  if(!want.length){ PACK.state = 'idle'; packRenderBar(); return; }
  let bytes = 0;
  const need = [];
  for(const p of want){
    const m = await packMissing(p);
    if(m.files.length){ need.push(p); bytes += m.bytes; }
  }
  PACK.total = bytes;
  if(!need.length){
    PACK.state = 'ready'; packRenderBar();
    if(typeof audAttachPack === 'function') audAttachPack();
    return;
  }
  let pref = 'ask';
  try{ pref = localStorage.getItem(PACK_PREF) || 'ask'; }catch(e){}
  if(!manual && pref !== 'auto'){ PACK.state = 'offer'; packRenderBar(); return; }
  try{ localStorage.setItem(PACK_PREF, 'auto'); }catch(e){}
  let ok = true;
  for(const p of need) ok = (await packDownload(p)) && ok;
  if(ok && typeof audAttachPack === 'function') audAttachPack();
}

function initAssetPacks(){
  packPanel(); packRenderBar();
  /* Deliberately late: terrain generation and audio decode are already
     competing for the first few seconds of a cold start. */
  if(typeof netAllowed!=='function' || netAllowed()) setTimeout(() => packStart(false), 4000);
}

