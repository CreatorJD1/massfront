;
;
/* ============================================================================
   UPDATER
   ----------------------------------------------------------------------------
   Patches the game in place, without going through a store.

   The game is a set of ordered plain scripts, so a patch is simply a newer set
   of those sources. The updater fetches a small manifest, compares its version
   with the one baked into this build, streams down the payload with real byte
   progress, verifies it, and stores it in IndexedDB. On the next launch the
   boot loader finds the stored bundle and runs it instead of the packaged
   files.

   Why IndexedDB and not a service worker or a native plugin:
     * A service worker cannot be registered on the custom scheme WKWebView and
       the Android WebView serve an installed app from, so it would work in the
       browser and nowhere else.
     * A native live-update plugin means a different mechanism per platform, a
       paid service, or both.
   IndexedDB is available in all three environments — browser, WKWebView and
   Android WebView — so ONE code path patches every target.

   Safety. A half-downloaded or corrupt bundle must never brick the game, so:
     * nothing is committed until every file has arrived and the totals match
     * the boot loader records that it is about to run a patched bundle, and
       clears that record once the game has actually started; a bundle that
       fails to boot is therefore detected on the NEXT launch and rolled back
       automatically
     * the packaged build always remains on disk, so rollback is instant

   What the payload actually carries (tools/bundle-update.mjs, not this file):
     * every script in assets/data/manifest.json `order` — including
       unitrows.js, organicfx.js, rumble.js. boot.js is NOT in that list;
       a boot-loader change needs a new APK/Space package.
     * window.__MF_OTA_ASSETS — binaries the 1.33.31 APK never shipped
       (world-structure V2 maps, faction tacticon sheet, authored Rhino /
       Gorger skins). Loaders resolve them through mf2AssetURL.
     * Generated per-unit V2 stubs (~250 files) and nova-hq-v2 256px
       templates stay on the APK/Space. A miss falls back to the atlas
       already packaged / inlined — it must not 404-break the renderer.
   ============================================================================ */

/* Bumped by the release script. Compared against the manifest's `version`. */
const APP_VERSION = '1.33.44';

/* Release notes for the PACKAGED build, bumped by the release script beside
   APP_VERSION and PACKAGED_REV. A device that has never taken an OTA has no
   download history to read notes from, and an offline device can never fetch
   them, so the build carries its own copy — otherwise a fresh install shows a
   permanently empty first entry in the mailbox. */
const APP_NOTES = "Hotfix: mass nodes no longer emit a white bloom disc during deploy; additive vein ribbons and standing glow pools are gone — terrain cracks and crystal meshes remain.";

/* The channel URL in update-config.json remains publisher-configurable, but a
   production checker also needs one known-good recovery path. More importantly,
   `resolve/main` can be cached at more than one layer on a phone. We first ask
   the repository API for its current commit and then fetch update.json through
   that immutable commit. A cache can keep an immutable object forever without
   ever hiding a newer release. */
const UPD_OFFICIAL_REPO='CREATORJD/massfront-releases';
const UPD_REPO_API='https://huggingface.co/api/datasets/'+UPD_OFFICIAL_REPO;
const UPD_OFFICIAL_MANIFEST='https://huggingface.co/datasets/'+UPD_OFFICIAL_REPO+
  '/resolve/main/update.json?download=true';

/* ---- WHERE TO LOOK -------------------------------------------------------
   This was `'./update.json'` and that is precisely why the button did nothing
   useful. Inside an installed app that path resolves to the manifest PACKAGED
   WITH THE BUILD — the updater fetched a description of the very files it was
   already running, found the versions equal, and reported "up to date" forever.
   It never failed, so there was nothing to diagnose; it simply could not ever
   find an update, which from the outside looks exactly like a dead button.

   A relative manifest is only meaningful when the game is served from a real
   web origin. A Capacitor build runs on http://localhost or capacitor://, which
   look like origins but are the local package, so those are treated as packaged
   too. Production clients read the official channel from update-config.json.
   window.MASSFRONT_UPDATE_URL remains a developer/embedder override, but there
   is deliberately no player-facing URL field and no device-stored endpoint.
   A missing official service is an outage to retry, not a setup task for the
   player. Resolution order:
     1. window.MASSFRONT_UPDATE_URL  — developer/embedder override
     2. assets/update-config.json    — official channel shipped with the build
     3. ./update.json                — only from a genuine remote web origin
   Nothing found means nothing to check, and the panel says so in plain words
   rather than spinning and shrugging.                                        */
let UPDATE_URL = null;
let updSrc = 'none';                       // where UPDATE_URL came from
let updResolved = false;
let updMirrors = [];
let updChannelUrls = {};
const UPD_CHANNEL_KEY='mf_update_channel';
/* Set when PREVIEW was requested but no preview endpoint exists, so the
   channel check knows to accept the Stable manifest we deliberately fell back
   to instead of rejecting every update as "wrong update channel". */
let updPreviewFellBack=false;
function updChannelName(v){ return String(v||'').toLowerCase()==='preview'?'preview':'stable'; }
function updChannel(){
  try{ return updChannelName(localStorage.getItem(UPD_CHANNEL_KEY)||'stable'); }
  catch(e){ return 'stable'; }
}
async function updSetChannel(channel){
  const next=updChannelName(channel);
  try{ localStorage.setItem(UPD_CHANNEL_KEY,next); }catch(e){}
  updResolved=false; UPDATE_URL=null; UPD.manifest=null;
  await updResolveEndpoint(true);
  if(typeof renderUpdatePanel==='function') renderUpdatePanel();
  return UPDATE_URL;
}

function updPackagedHost(){
  if(typeof location==='undefined') return true;
  const p=location.protocol||'', h=location.hostname||'';
  if(p==='file:'||p==='capacitor:'||p==='ionic:') return true;
  if(h===''||h==='localhost'||h==='127.0.0.1'||h==='[::1]') return true;
  return false;
}
async function updResolveEndpoint(force){
  if(updResolved&&!force) return UPDATE_URL;
  updResolved=true;
  updPreviewFellBack=false;
  const channel=updChannel();
  updMirrors=[]; updChannelUrls={};
  if(typeof window!=='undefined' && window.MASSFRONT_UPDATE_CHANNELS){
    const ch=window.MASSFRONT_UPDATE_CHANNELS;
    if(ch&&typeof ch==='object') updChannelUrls=ch;
  }
  if(typeof window!=='undefined' && window.MASSFRONT_UPDATE_URL&&channel==='stable'){
    updSrc='embed'; return (UPDATE_URL=window.MASSFRONT_UPDATE_URL);
  }
  try{
    const r=await fetch('./assets/update-config.json?t='+Date.now(),{cache:'no-store'});
    if(r.ok){
      const c=await r.json();
      if(c&&c.channels&&typeof c.channels==='object')
        updChannelUrls=Object.assign({},updChannelUrls,c.channels);
      const chosen=updChannelUrls[channel];
      if(typeof chosen==='string'&&chosen.trim()){
        updMirrors=c&&c.channelMirrors&&Array.isArray(c.channelMirrors[channel])
          ? c.channelMirrors[channel].filter(u=>typeof u==='string'&&u.trim()).map(u=>u.trim()) : [];
        updSrc='config '+channel; return (UPDATE_URL=chosen.trim());
      }
      if(channel==='stable'&&c&&typeof c.endpoint==='string'&&c.endpoint.trim()){
        updMirrors=Array.isArray(c.mirrors)
          ? c.mirrors.filter(u=>typeof u==='string'&&u.trim()).map(u=>u.trim()) : [];
        updSrc='config'; return (UPDATE_URL=c.endpoint.trim());
      }
    }
  }catch(e){}
  if(!updPackagedHost()){
    updSrc='origin '+channel;
    return (UPDATE_URL=channel==='preview'?'./update-preview.json':'./update.json');
  }
  /* A damaged/missing local config must not permanently disable the updater.
     The official public channel is safe to embed because it contains no key or
     account data. */
  /* PREVIEW used to resolve to null here, and null does not mean "no preview
     build yet" - it switches the updater OFF. One tap in Settings and the
     device stops receiving updates entirely, including security fixes, with
     no error to explain it and no hint that STABLE must be re-selected to
     recover. Serve Stable instead and record that we did. */
  if(channel==='preview'){
    updPreviewFellBack=true;
    updSrc='preview unavailable - using stable';
    return (UPDATE_URL=UPD_OFFICIAL_MANIFEST);
  }
  updSrc='fallback'; return (UPDATE_URL=UPD_OFFICIAL_MANIFEST);
}
function updEndpoint(){ return UPDATE_URL||''; }

function updBust(url){
  const sep=String(url).includes('?')?'&':'?';
  return String(url)+sep+'mfcb='+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
}
function updParseJson(data){
  if(data&&typeof data==='object') return data;
  if(typeof data==='string') return JSON.parse(data.replace(/^\uFEFF/,''));
  throw new Error('empty JSON response');
}

/* Capacitor's patched fetch normally proxies remote GET requests correctly,
   but Android WebView, the proxy, and a redirected CDN add several independent
   caches. Calling the native HTTP plugin directly is a clean second transport
   with no WebView CORS or cache state. Web builds simply use fetch. */
async function updRequestJson(url){
  const u=updBust(url), errors=[];
  const cap=typeof window!=='undefined'?window.Capacitor:null;
  const native=cap&&typeof cap.isNativePlatform==='function'&&cap.isNativePlatform()&&
    typeof cap.isPluginAvailable==='function'&&cap.isPluginAvailable('CapacitorHttp')&&
    cap.Plugins&&cap.Plugins.CapacitorHttp;
  if(native&&typeof native.get==='function'){
    try{
      const r=await native.get({
        url:u,
        headers:{'Accept':'application/json','Cache-Control':'no-cache, no-store, max-age=0','Pragma':'no-cache'},
        connectTimeout:12000,readTimeout:15000,responseType:'json'
      });
      if(Number(r.status)<200||Number(r.status)>=300) throw new Error('HTTP '+r.status);
      return updParseJson(r.data);
    }catch(e){ errors.push(e); }
  }
  const ac=typeof AbortController!=='undefined'?new AbortController():null;
  const timer=ac?setTimeout(()=>ac.abort(),16000):null;
  try{
    const r=await fetch(u,{
      /* Keep this a CORS-simple GET for the web build. The unique URL and
         no-store mode defeat browser caching without a preflight request. */
      cache:'no-store',signal:ac?ac.signal:undefined
    });
    if(!r.ok) throw new Error('HTTP '+r.status);
    return updParseJson(await r.text());
  }catch(e){
    errors.push(e);
    const last=errors[errors.length-1];
    throw last||new Error('request failed');
  }finally{ if(timer) clearTimeout(timer); }
}

function updNormalizeManifest(raw){
  if(!raw||typeof raw!=='object') return null;
  const m=Object.assign({},raw);
  m.schema=Number(m.schema||1);
  m.channel=updChannelName(m.channel||'stable');
  m.severity=['critical','recommended','optional'].includes(m.severity)
    ? m.severity : 'recommended';
  m.files=Array.isArray(m.files)?m.files:(Array.isArray(m.core)?m.core:[]);
  if(!m.packs||typeof m.packs!=='object') m.packs={};
  return m;
}
function updValidManifest(m){
  return !!(m&&/^\d+\.\d+\.\d+$/.test(String(m.version||''))&&
    Array.isArray(m.files)&&m.files.length>0&&m.files.every(f=>f&&typeof f.path==='string'&&
      /* sha256 and size are REQUIRED, not optional. updVerifyHash returns early
         on a falsy hash and the size check is guarded by `if(f.size && ...)`, so
         a manifest that simply omitted both downloaded and APPLIED executable
         JavaScript with no verification at all - the integrity checks were
         opt-in by the very document an attacker would control. The publisher
         always emits both (publish-hf-release.ps1) and the live 1.33.44
         manifest carries them, so requiring them rejects nothing genuine. */
      typeof f.sha256==='string'&&/^[0-9a-f]{64}$/i.test(f.sha256)&&
      Number.isFinite(f.size)&&f.size>0)&&
    /* A patch that does not say what it patches is unapplicable by
       construction - reject it here rather than merging onto the wrong build. */
    (String(m.kind||'').toLowerCase()!=='patch'||/^\d+\.\d+\.\d+$/.test(String(m.patchFrom||''))));
}
function updManifestForChannel(m){
  /* A schema-v1 manifest has no channel and is Stable by definition. This is
     the backward-compatibility rule that lets old publishers keep working. */
  /* When preview is unavailable we knowingly serve Stable to a player whose
     channel says preview; accept it rather than failing every check. */
  if(updPreviewFellBack) return !!(m&&updChannelName(m.channel||'stable')==='stable');
  return !!(m&&updChannelName(m.channel||'stable')===updChannel());
}
function updExposePacks(m){
  if(!m||!m.packs||typeof PACK==='undefined') return;
  const valid={};
  for(const id in m.packs){
    const p=m.packs[id];
    if(p&&Array.isArray(p.files)) valid[id]=p;
  }
  if(Object.keys(valid).length) PACK.idx=Object.assign({},PACK.idx||{},valid);
}
async function updLoadManifest(){
  const errors=[];
  let best=null, source='';
  const seen=[];
  const consider=async(url,label)=>{
    if(!url||seen.includes(url)) return;
    seen.push(url);
    try{
      const m=updNormalizeManifest(await updRequestJson(url));
      if(!updValidManifest(m)) throw new Error('bad manifest');
      if(!updManifestForChannel(m)) throw new Error('wrong update channel');
      if(!best||verNewer(m.version,best.version)){
        best=m;
        if(label) source=label;
        else try{ source=new URL(url,location.href).hostname; }
        catch(e){ source=String(url); }
      }
    }catch(e){ errors.push(e); }
  };

  /* The endpoint packaged with this build is the publisher's source of truth.
     Evaluate it first, but still compare every healthy recovery mirror and
     select the numerically newest manifest. A valid yet stale recovery channel
     must never short-circuit a newer configured release. */
  await consider(UPDATE_URL,updSrc==='config'?'configured channel':'');
  for(const url of updMirrors) await consider(url,'');

  /* Commit-pinned Hugging Face data is immune to moving-branch caches, so keep
     it as a recovery candidate rather than allowing it to override config. */
  try{
    const repo=await updRequestJson(UPD_REPO_API);
    const sha=repo&&String(repo.sha||'');
    if(/^[0-9a-f]{40}$/i.test(sha)){
      const immutable='https://huggingface.co/datasets/'+UPD_OFFICIAL_REPO+
        '/resolve/'+sha+'/update.json?download=true';
      await consider(immutable,'release '+sha.slice(0,7));
    }
  }catch(e){ errors.push(e); }

  await consider(UPD_OFFICIAL_MANIFEST,'');
  await consider('https://huggingface.co/datasets/'+UPD_OFFICIAL_REPO+
                 '/raw/main/update.json','');
  if(best) return {manifest:best,source};
  throw errors[errors.length-1]||new Error('update service unavailable');
}

const UPD_DB='massfront-updates', UPD_STORE='bundles';

function updIdb(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open(UPD_DB,1);
    r.onupgradeneeded=()=>{ const d=r.result;
      if(!d.objectStoreNames.contains(UPD_STORE)) d.createObjectStore(UPD_STORE); };
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
  });
}
async function updPut(key,val){
  const db=await updIdb();
  return new Promise((res,rej)=>{
    const tx=db.transaction(UPD_STORE,'readwrite');
    tx.objectStore(UPD_STORE).put(val,key);
    tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error);
  });
}
async function updGet(key){
  const db=await updIdb();
  return new Promise((res,rej)=>{
    const tx=db.transaction(UPD_STORE,'readonly');
    const q=tx.objectStore(UPD_STORE).get(key);
    q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error);
  });
}
async function updDel(key){
  const db=await updIdb();
  return new Promise((res,rej)=>{
    const tx=db.transaction(UPD_STORE,'readwrite');
    tx.objectStore(UPD_STORE).delete(key);
    tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error);
  });
}

/* ---- THE RELEASE LOG, AND THE NOTES THAT GO IN IT --------------------------
   Every release the player actually receives posts one mail item, and the body
   of that item is the publisher's notes for that exact version.

   Two storage rules make that work on a phone:

   * The notes are staged in localStorage at DOWNLOAD time, not read back out
     of the bundle at install time. They travel with the bundle in the IndexedDB
     `pending` record, but that record holds the whole payload — the live
     channel ships one 26.7 MB source string — and deserialising 26 MB on the
     boot path to recover 1 KB of text is not something a 360px phone should be
     asked to do. localStorage survives the location.replace() that restarts the
     document, which is the only thing the install path actually needs.

   * The log is keyed by VERSION and appended in exactly one place, so a re-check,
     a relaunch, a rollback or a re-apply can never post the same release twice.
     Everything here is localStorage only: no network, so the whole path is
     already offline-clean and stays that way.                                  */
const UPD_LOG_KEY='mf_update_log';
const UPD_NOTES_KEY='mf_update_notes';
const UPD_NOTES_MAX=2000;

function updLogRead(){
  try{
    const a=JSON.parse(localStorage.getItem(UPD_LOG_KEY)||'[]');
    return Array.isArray(a)? a.filter(e=>e&&e.version) : [];
  }catch(e){ return []; }
}
function updLogWrite(log){
  try{ localStorage.setItem(UPD_LOG_KEY,JSON.stringify(log.slice(0,40))); return true; }
  catch(e){ return false; }
}
function updStageNotes(version,notes){
  if(!version) return;
  try{
    let a=JSON.parse(localStorage.getItem(UPD_NOTES_KEY)||'[]');
    if(!Array.isArray(a)) a=[];
    a=a.filter(e=>e&&e.version!==String(version));
    a.unshift({version:String(version),notes:String(notes||'').slice(0,UPD_NOTES_MAX)});
    localStorage.setItem(UPD_NOTES_KEY,JSON.stringify(a.slice(0,6)));
  }catch(e){}
}
function updNotesFor(version){
  try{
    const a=JSON.parse(localStorage.getItem(UPD_NOTES_KEY)||'[]');
    const e=Array.isArray(a)&&a.find(x=>x&&x.version===String(version));
    return (e&&e.notes)||'';
  }catch(e){ return ''; }
}
/* The ONE place that appends to the log, so the install path, the packaged seed
   and any future writer cannot disagree about an entry's shape. Version is the
   dedupe key. Returns true only when an entry was really added. */
function updLogPost(version,notes,extra){
  if(!version) return false;
  const v=String(version), log=updLogRead();
  if(log.some(e=>String(e.version)===v)) return false;
  log.unshift(Object.assign({version:v,at:Date.now(),
    notes:String(notes||'').slice(0,UPD_NOTES_MAX),read:false},extra||{}));
  return updLogWrite(log);
}
/* Stamp fields onto an existing entry: read state, and the rollback marker.
   Writes only when something actually changed, because this is called on every
   launch of a patched build. */
function updLogMark(version,patch){
  if(!version||!patch) return false;
  const v=String(version), log=updLogRead();
  const e=log.find(x=>String(x.version)===v);
  if(!e) return false;
  let dirty=false;
  for(const k of Object.keys(patch)) if(e[k]!==patch[k]){ e[k]=patch[k]; dirty=true; }
  return dirty? updLogWrite(log) : false;
}
/* An entry written by a build that predates staging has an empty body, and so
   does one whose staged notes were evicted. A later check whose manifest is for
   THAT EXACT version can fill it in. The equality guard matters: the channel is
   normally ahead of the device, and pasting the next release's notes onto the
   installed one is worse than leaving it blank. */
function updBackfillNotes(m){
  if(!m||!m.notes||!m.version) return;
  const log=updLogRead();
  const e=log.find(x=>String(x.version)===String(m.version));
  if(!e||e.notes) return;
  e.notes=String(m.notes).slice(0,UPD_NOTES_MAX);
  if(updLogWrite(log)&&typeof renderInboxUpdates==='function')
    try{ renderInboxUpdates(); }catch(err){}
}

/* Compare dotted version strings numerically: '1.10.0' is newer than '1.9.9',
   which a string comparison gets backwards. */
function verNewer(a,b){
  const pa=String(a).split('.').map(Number), pb=String(b).split('.').map(Number);
  for(let i=0;i<Math.max(pa.length,pb.length);i++){
    const x=pa[i]||0, y=pb[i]||0;
    if(x!==y) return x>y;
  }
  return false;
}
function fmtBytes(n){
  if(n<1024) return n+' B';
  if(n<1048576) return (n/1024).toFixed(0)+' KB';
  return (n/1048576).toFixed(1)+' MB';
}
function updHex(buf){
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function updVerifyHash(bytes,want,path){
  if(!want) return;
  if(typeof crypto==='undefined'||!crypto.subtle) throw new Error(path+': integrity checks unavailable');
  /* Keep the verifier safe for both streamed downloads (Uint8Array) and any
     future non-streaming/native bridge that hands us a Blob. Web Crypto only
     accepts an ArrayBuffer or a view, never a Blob object itself. */
  if(bytes&&typeof bytes.arrayBuffer==='function') bytes=await bytes.arrayBuffer();
  const got=updHex(await crypto.subtle.digest('SHA-256',bytes));
  if(got.toLowerCase()!==String(want).toLowerCase()) throw new Error(path+': integrity check failed');
}

const UPD={ state:'idle', manifest:null, pct:0, got:0, total:0, rate:0, err:null,
            abort:null, lastCheck:0, checkedVersion:null, source:null, channel:'stable',
            /* Per-file feed. The download loop has always walked m.files, but only
               aggregate bytes were ever surfaced, so a multi-file patch looked
               identical to one big blob and a stall gave no clue which object was
               stuck. feed[] carries one row per file: name, size, and state. */
            feed:[], fileIdx:-1 };

function updSet(st,extra){
  UPD.state=st;
  if(extra) Object.assign(UPD,extra);
  if(typeof renderUpdatePanel==='function') renderUpdatePanel();
}

/* ---- CHECK ---------------------------------------------------------------- */
async function updCheck(manual){
  if(UPD.state==='downloading'||UPD.state==='checking') return;
  /* Offline is a normal state, not a failure. Say so and stop — do not attempt
     a request that cannot succeed and then report an error for it. */
  if(typeof netAllowed==='function' && !netAllowed()){
    updSet('unset',{err:null});
    if(manual&&typeof toast==='function')
      toast('✈ Offline mode — turn it off in Settings to check for updates');
    return;
  }
  /* Re-read the packaged channel on an explicit check. It costs one tiny local
     file read and repairs an endpoint that was temporarily unresolved at boot. */
  if(!updResolved||manual) await updResolveEndpoint(!!manual);

  /* No official endpoint is an unavailable service, never a request for the
     player to paste infrastructure URLs into a mobile game. */
  if(!UPDATE_URL){
    updSet('unset',{err:null});
    if(manual&&typeof toast==='function')
      toast('Official update service is unavailable — try again later');
    return;
  }

  /* The bar has to move the instant a finger lands on the button. A check
     against a nearby server can finish in 30ms, and a panel that flickers
     through "checking" too fast to read is indistinguishable from one that
     ignored the tap — which is what "doesn't work" actually meant. */
  const t0=(typeof performance!=='undefined'?performance.now():Date.now());
  updSet('checking',{err:null,channel:updChannel()});
  let next='current', extra={};
  try{
    const found=await updLoadManifest();
    const m=found.manifest;
    UPD.manifest=m;
    UPD.checkedVersion=m.version;
    UPD.source=found.source;
    UPD.channel=m.channel;
    updExposePacks(m);
    updBackfillNotes(m);          // repair a note-less log entry for THIS version only
    /* Compare against the version actually running. A live-patched client can
       be newer than its packaged APP_VERSION; comparing only to the package
       made it repeatedly offer an older patch. Also distinguish a stale
       server manifest from a genuinely current channel so diagnostics are
       honest instead of saying UP TO DATE when the publisher is behind. */
    next = verNewer(m.version,updVerShown) ? 'available'
         : verNewer(updVerShown,m.version) ? 'stale' : 'current';
  }catch(e){
    next='error';
    extra={err: manual ? ((e&&e.message&&/HTTP/.test(e.message))
                          ? 'Update server answered '+e.message
                          : 'Could not reach the update server')
                       : null};
  }
  const el=(typeof performance!=='undefined'?performance.now():Date.now())-t0;
  if(el<520) await new Promise(res=>setTimeout(res,520-el));
  UPD.lastCheck=Date.now();
  updSet(next,extra);
  if(manual&&next==='current'&&typeof toast==='function') toast('✓ You are on the latest build (v'+updVerShown+')');
  if(manual&&next==='stale'&&typeof toast==='function')
    toast('Update channel is behind this build (server v'+UPD.manifest.version+', installed v'+updVerShown+')');
}

/* ---- DOWNLOAD ------------------------------------------------------------- */
/* Streamed so the bar reflects bytes actually on the device rather than
   jumping from 0 to 100 when the request settles. Files are fetched one at a
   time: on a phone that is kinder to memory than a dozen parallel sockets, and
   it makes per-file progress honest. */
async function updDownload(){
  const m=UPD.manifest;
  if(!m||UPD.state==='downloading') return;
  const base=m.base||'';
  /* Decide UP FRONT whether this is a delta we can actually apply. Getting
     this wrong after the bytes are on disk would mean either a broken merge
     or a wasted download. */
  const installedNow=await updInstalledVersion();
  let patching=false, files=m.files;
  if(updIsPatch(m)){
    if(updPatchApplies(m,installedNow)) patching=true;
    else{
      const full=updFullEntry(m);
      if(!full){
        updSet('error',{err:'This update patches '+m.patchFrom+' but you are on '+
                            installedNow+', and no full payload was published'});
        return;
      }
      files=[full];   // not our base: take the complete build instead
    }
  }
  const total=files.reduce((s,f)=>s+(f.size||0),0)||1;
  const ac=new AbortController();
  updSet('downloading',{pct:0,got:0,total,rate:0,err:null,abort:ac});
  const t0=performance.now();
  const out={};
  /* Build the feed up front so every file is visible as PENDING before the
     first byte lands — a 900MB object that has not started yet is exactly the
     case where silence looks like a hang. */
  UPD.feed=files.map(f=>({path:f.path,size:f.size||0,state:'pending',got:0}));
  UPD.fileIdx=-1;
  try{
    let got=0;
    for(let fi=0;fi<files.length;fi++){
      const f=files[fi];
      UPD.fileIdx=fi;
      if(UPD.feed[fi]) UPD.feed[fi].state='downloading';
      const src=f.url||base+f.path;
      const r=await fetch(src+(src.includes('?')?'&':'?')+'v='+encodeURIComponent(m.version),
                          {cache:'no-store',signal:ac.signal});
      if(!r.ok) throw new Error(f.path+': HTTP '+r.status);
      const contentType=String(r.headers&&r.headers.get?r.headers.get('content-type')||'':'').toLowerCase();
      const chunks=[]; let n=0;
      if(r.body&&r.body.getReader){
        const rd=r.body.getReader();
        for(;;){
          const {done,value}=await rd.read();
          if(done) break;
          chunks.push(value); n+=value.length; got+=value.length;
          if(UPD.feed[fi]) UPD.feed[fi].got=n;
          const el=(performance.now()-t0)/1000;
          UPD.got=got; UPD.pct=Math.min(99,got/total*100);
          UPD.rate=el>0.25? got/el : 0;
          if(typeof renderUpdatePanel==='function') renderUpdatePanel();
        }
      } else {                                  // no streaming body: still works
        const buf=new Uint8Array(await r.arrayBuffer());
        chunks.push(buf); n=buf.length; got+=n;
        UPD.got=got; UPD.pct=Math.min(99,got/total*100);
        if(typeof renderUpdatePanel==='function') renderUpdatePanel();
      }
      /* Size catches truncation. SHA-256 (present on current manifests) catches
         a wrong or corrupted object that happens to have the same length. */
      if(f.size && Math.abs(n-f.size) > Math.max(64, f.size*0.02)){
        /* File-share services commonly answer a nominally successful request
           with a login/confirmation HTML page. Surface that real cause, and
           always include both byte counts so a publisher can diagnose a stale
           manifest without needing device logs. */
        const hostPage=contentType.includes('text/html')||contentType.includes('application/xhtml');
        const reason=n===0 ? 'download host returned no data'
                    : hostPage ? 'download host returned a web page instead of update data'
                    : 'download was incomplete';
        throw new Error(f.path+': '+reason+' ('+fmtBytes(n)+' of '+fmtBytes(f.size)+')');
      }
      const bytes=new Uint8Array(n); let at=0;
      for(const c of chunks){ bytes.set(c,at); at+=c.length; }
      await updVerifyHash(bytes,f.sha256,f.path);
      /* Only after BOTH the size check and the sha256 — a green row must mean
         verified, not merely received. */
      if(UPD.feed[fi]){ UPD.feed[fi].state='ok'; UPD.feed[fi].got=n; }
      out[f.path]=new TextDecoder().decode(bytes);
    }
    /* Commit only once every file is present and accounted for. */
    /* MERGE, do not replace, when this was a delta. The cached payload is the
       whole build; the patch is a handful of files to overwrite inside it.
       Order matters as much as content - boot.js concatenates in manifest
       order - so keep the base order and append only genuinely new paths. */
    let commitFiles=out, commitOrder=files.map(f=>f.path);
    if(patching){
      const prior=await updGet('active');
      const priorFiles=(prior&&prior.files)||null;
      if(!priorFiles){
        updSet('error',{err:'The patch base is missing — reinstall the full update'});
        return;
      }
      commitFiles=Object.assign({},priorFiles,out);
      const priorOrder=(prior&&Array.isArray(prior.order)&&prior.order.length)
                        ? prior.order.slice() : Object.keys(priorFiles);
      for(const path of commitOrder) if(priorOrder.indexOf(path)<0) priorOrder.push(path);
      commitOrder=priorOrder;
    }
    await updPut('pending',{version:m.version, notes:m.notes||'', at:Date.now(),
                            schema:m.schema||1,channel:m.channel||'stable',
                            severity:m.severity||'recommended',
                            kind:updIsPatch(m)?'patch':(m.kind||'full'),
                            patchedFrom:patching?String(m.patchFrom):'',
                            order:commitOrder, files:commitFiles});
    /* Stage the notes where the NEXT document can read them without touching
       the megabytes of source sitting in the record above. */
    updStageNotes(m.version,m.notes);
    await updDel('applyFailure');
    updSet('ready',{pct:100,abort:null});
  }catch(e){
    if(UPD.fileIdx>=0&&UPD.feed[UPD.fileIdx]&&UPD.feed[UPD.fileIdx].state==='downloading')
      UPD.feed[UPD.fileIdx].state='fail';
    if(e&&e.name==='AbortError'){ updSet('available',{pct:0,got:0,abort:null}); return; }
    updSet('error',{err:(e&&e.message)||'Download failed',abort:null});
  }
}
function updCancel(){ if(UPD.abort) UPD.abort.abort(); }

/* ---- APPLY / ROLLBACK ------------------------------------------------------ */
async function updApply(){
  const p=await updGet('pending');
  if(!p){ updSet('applyError',{err:'The downloaded update is missing — download it again'}); return; }
  try{
    /* This is a two-phase install. Keep `pending` until the patched build has
       rendered its first frame; otherwise a failed start destroys the only
       retryable copy and collapses the panel back to GAME VERSION. */
    updSet('applying',{err:null,pct:100});
    const current=await updGet('active');
    const running=typeof window!=='undefined'?String(window.__MASSFRONT_PATCHED||''):'';
    /* Only the bundle this document is demonstrably running is known-good.
       Preserve that exact copy before replacing it so rollback returns one
       release, not all the way to an old APK payload. */
    if(current&&current.files&&running&&String(current.version)===running&&
       String(current.version)!==String(p.version)) await updPut('previous',current);
    await updPut('active',p);
    await updPut('probation',{version:p.version,at:Date.now(),tries:0});
    /* Preserve a prior failed-start count when retrying the same bytes. The
       boot loader quarantines the patch after two failures; clearing the count
       here previously made every attempt look like the first one forever. A
       fresh verified download resets the record in updDownload instead. */
    setTimeout(updHardReload,120);       // let RESTARTING paint before navigation
  }catch(e){
    updSet('applyError',{err:'Could not prepare the update — retry install'});
  }
}
function updHardReload(){
  /* A cache-busted replace is a document restart inside the WebView. It does
     not hand the user out to Android, and it cannot reuse a stale local shell. */
  try{
    const u=new URL(location.href);
    u.searchParams.set('mf_restart',Date.now().toString(36));
    location.replace(u.href);
  }catch(e){ location.reload(); }
}
async function updRollback(){
  /* Mark the entry BEFORE the records are destroyed: one reload from now
     __MASSFRONT_PATCHED is gone and nothing can tell which version was
     reverted. The entry is not removed — the player really did run that build
     on this device — it just stops implying it is still installed. */
  const v=typeof window!=='undefined'?String(window.__MASSFRONT_PATCHED||''):'';
  if(v) updLogMark(v,{rolledBack:true});
  const previous=await updGet('previous');
  const good=previous&&previous.files&&verNewer(previous.version,APP_VERSION)&&
    Array.isArray(previous.order)&&previous.order.every(p=>typeof previous.files[p]==='string');
  if(good){
    await updPut('active',previous);
    await updDel('previous');
    await updPut('probation',{version:previous.version,at:Date.now(),tries:0});
  } else {
    await updDel('active'); await updDel('previous'); await updDel('probation');
  }
  await updDel('pending');
  updHardReload();
}
/* ---- PATCH MANIFESTS ------------------------------------------------------
   A `kind:'patch'` manifest lists ONLY the source files that changed. It
   cannot simply replace the cached payload the way a full update does -
   `active` holds the complete file set the boot loader concatenates, so
   installing a one-file list verbatim would leave the build with one file.
   A patch is therefore MERGED over the payload it was built against, which
   is why it names that build in `patchFrom`.

   NOTE the field name: `base` is already the URL prefix for relative file
   paths in this manifest format, so the base VERSION needs its own key.

   `full` is the escape hatch. A device whose installed build is not the one
   the patch was cut against cannot apply it, and there is only one manifest
   URL for every client - so the patch manifest carries a complete payload
   entry alongside the deltas and such a device downloads that instead. */
function updIsPatch(m){ return !!(m&&String(m.kind||'').toLowerCase()==='patch'); }
function updPatchApplies(m,installed){
  return updIsPatch(m)&&!!m.patchFrom&&String(m.patchFrom)===String(installed);
}
function updFullEntry(m){
  const f=m&&m.full;
  return (f&&typeof f.path==='string'&&typeof f.sha256==='string'&&
          /^[0-9a-f]{64}$/i.test(f.sha256)&&Number.isFinite(f.size)&&f.size>0)?f:null;
}
async function updInstalledVersion(){
  const running=typeof window!=='undefined'?String(window.__MASSFRONT_PATCHED||''):'';
  /* An IndexedDB `active` record is only an intention. It may have failed,
     been superseded by a native install, or not have run yet. Report a patch
     only when this document is actually executing it and it is newer than the
     packaged code. */
  return running&&verNewer(running,APP_VERSION)?running:APP_VERSION;
}

/* ---- PANEL ---------------------------------------------------------------- */
/* The panel used to be five stacked rows sitting under nine menu buttons, which
   is a lot of furniture for something that is idle 364 days a year. It now
   collapses to a single version line and opens itself only when it has real
   news — a patch found, a download running, or a failure worth reading. */
let updVerShown=APP_VERSION, updOpen=false;
/* Patch taxonomy. A manifest may declare `kind` explicitly; otherwise infer it
   from payload size so existing manifests get a sensible label with no publisher
   change. HOTFIX is a handful of files a player should take immediately;
   OVERHAUL is a full payload replacement worth warning about on mobile data. */
const UPD_KINDS={hotfix:{nm:'HOTFIX',ds:'Small fix — installs in seconds'},
                 content:{nm:'CONTENT PATCH',ds:'New content and fixes'},
                 overhaul:{nm:'OVERHAUL',ds:'Full rebuild — large download'}};
function updKind(m){
  if(!m) return null;
  const declared=String(m.kind||'').toLowerCase();
  if(UPD_KINDS[declared]) return declared;
  const bytes=(m.files||[]).reduce((a,f)=>a+(f.size||0),0);
  if(bytes<=2*1024*1024) return 'hotfix';
  if(bytes<=20*1024*1024) return 'content';
  return 'overhaul';
}
function updKindLabel(m){ const k=updKind(m); return k?UPD_KINDS[k]:null; }
function updWants(){
  return UPD.state==='available'||UPD.state==='downloading'||
         UPD.state==='ready'||UPD.state==='applying'||UPD.state==='applyError'||
         UPD.state==='installed'||UPD.state==='error'||UPD.state==='stale';
}
function updEnsureChannelControl(){
  const panel=document.getElementById('updPanel');
  if(!panel) return null;
  let row=document.getElementById('updChannels');
  if(!row){
    row=document.createElement('div');
    row.id='updChannels'; row.setAttribute('role','group');
    row.setAttribute('aria-label','Update channel');
    row.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:9px 0 2px';
    row.innerHTML='<button type="button" data-channel="stable">STABLE</button>'+
                  '<button type="button" data-channel="preview">PREVIEW</button>';
    for(const b of row.querySelectorAll('button')){
      b.style.cssText='min-height:44px;border:1px solid rgba(104,180,224,.35);border-radius:8px;'+
        'background:rgba(7,18,31,.82);color:#9cc7e2;font:700 10px var(--fT);letter-spacing:.08em';
      const go=async e=>{
        e.stopPropagation();
        if(b.dataset.channel===updChannel()) return;
        if(typeof sfx==='function') sfx('ui');
        await updSetChannel(b.dataset.channel);
        updSet('idle',{checkedVersion:null,source:null,err:null,channel:updChannel()});
        updCheck(true);
      };
      if(typeof mfBindTap==='function') mfBindTap(b,go); else b.addEventListener('click',go);
    }
    const bar=document.getElementById('updBarO');
    panel.insertBefore(row,bar||null);
  }
  for(const b of row.querySelectorAll('button')){
    const on=b.dataset.channel===updChannel();
    b.setAttribute('aria-pressed',on?'true':'false');
    b.style.background=on?'linear-gradient(180deg,rgba(30,105,146,.95),rgba(12,49,76,.98))':'rgba(7,18,31,.82)';
    b.style.color=on?'#fff':'#9cc7e2';
  }
  return row;
}
/* The header status dot. Four states, and the colours are the whole point of it:
   the player should be able to tell at a glance, from the main menu, whether the
   build they are running is current — without opening anything.
     grey   never checked / no endpoint
     amber  checking, or an update is waiting
     green  up to date, or one just installed
     red    the check or the install failed  */
const UPD_DOT_STATE={
  idle:['', 'Tap to check for updates'],
  unset:['', 'No update server configured'],
  checking:['busy','Checking for updates…'],
  available:['warn','Update available'],
  downloading:['busy','Downloading update…'],
  ready:['warn','Update ready to install'],
  installed:['ok','Up to date'],
  current:['ok','Up to date'],
  error:['bad','Update check failed'],
  applyError:['bad','Update failed to install'],
  offline:['','Offline — cannot check']
};
function renderUpdateDot(){
  const d=document.getElementById('updDot'); if(!d) return;
  const map=UPD_DOT_STATE[UPD.state]||['',''];
  d.classList.remove('updOk','updWarn','updBad','updBusy');
  if(map[0]==='ok') d.classList.add('updOk');
  else if(map[0]==='warn') d.classList.add('updWarn');
  else if(map[0]==='bad') d.classList.add('updBad');
  else if(map[0]==='busy') d.classList.add('updWarn','updBusy');
  const v=UPD.manifest&&UPD.manifest.version;
  d.title=map[1]+(v?' · v'+v:'');
  d.setAttribute('aria-label','Game version — '+map[1]);
}

function renderUpdatePanel(){
  renderUpdateDot();
  const el=document.getElementById('updPanel');
  if(!el) return;
  const channelRow=updEnsureChannelControl();
  const bar=document.getElementById('updBarF');
  const txt=document.getElementById('updTxt');
  const sub=document.getElementById('updSub');
  const btn=document.getElementById('updBtn');
  const cancel=document.getElementById('updCancel');
  const notes=document.getElementById('updNotes');
  /* Every one of these was dereferenced unguarded. One missing node — which is
     exactly what a menu rewrite produces — threw inside initUpdater and took
     the rest of the boot wiring down with it. */
  if(!bar||!txt||!sub||!btn) return;
  const m=UPD.manifest;
  const channel=(m&&m.channel)||UPD.channel||updChannel();
  if(cancel) cancel.style.display=UPD.state==='downloading'?'block':'none';
  if(notes){
    notes.style.display=(UPD.state==='available'||UPD.state==='ready')&&m&&m.notes?'block':'none';
    if(m&&m.notes) notes.textContent=m.notes;
  }
  el.classList.toggle('busy',UPD.state==='downloading'||UPD.state==='applying');
  el.classList.toggle('good',UPD.state==='ready'||UPD.state==='installed');
  el.classList.toggle('mini',!(updOpen||updWants()));
  if(channelRow) channelRow.style.display=el.classList.contains('mini')?'none':'grid';
  switch(UPD.state){
    case 'checking':
      txt.textContent='CHECKING FOR UPDATES';
      sub.textContent='v'+updVerShown;
      bar.style.width='12%'; btn.textContent='…'; btn.disabled=true; break;
    case 'available':{
      const K=updKindLabel(m);
      txt.textContent=K?('UPDATE AVAILABLE  ·  '+K.nm):'UPDATE AVAILABLE';
      sub.textContent='v'+updVerShown+'  →  v'+m.version+'   ·   '+fmtBytes(m.files.reduce((s,f)=>s+(f.size||0),0))+
        '   ·   '+String(channel).toUpperCase()+(m.severity?' / '+String(m.severity).toUpperCase():'');
      bar.style.width='0%'; btn.textContent='DOWNLOAD'; btn.disabled=false; break; }
    case 'downloading':{
      const KD=updKindLabel(m);
      txt.textContent='DOWNLOADING  '+UPD.pct.toFixed(0)+'%'+(KD?('  ·  '+KD.nm):'');
      const sp=UPD.rate? '  ·  '+fmtBytes(UPD.rate)+'/s' : '';
      sub.textContent=fmtBytes(UPD.got)+' of '+fmtBytes(UPD.total)+sp;
      bar.style.width=UPD.pct.toFixed(1)+'%'; btn.textContent='…'; btn.disabled=true; break; }
    case 'ready':
      txt.textContent='READY TO INSTALL';
      sub.textContent='v'+m.version+' downloaded — restart to apply';
      bar.style.width='100%'; btn.textContent='RESTART & INSTALL'; btn.disabled=false; break;
    case 'applying':
      txt.textContent='INSTALLING UPDATE';
      sub.textContent='Downloaded copy kept until the new build starts';
      bar.style.width='100%'; btn.textContent='RESTARTING…'; btn.disabled=true; break;
    case 'applyError':
      txt.textContent='UPDATE COULD NOT START';
      sub.textContent=UPD.err||'Downloaded update kept safely — retry install';
      bar.style.width='100%'; btn.textContent='RETRY INSTALL'; btn.disabled=false; break;
    case 'installed':
      txt.textContent='UPDATE INSTALLED';
      sub.textContent='v'+updVerShown+' is now running';
      bar.style.width='100%'; btn.textContent='CHECK AGAIN'; btn.disabled=false; break;
    case 'error':
      txt.textContent='UPDATE FAILED';
      sub.textContent=UPD.err||'Try again later';
      bar.style.width='0%'; btn.textContent='RETRY'; btn.disabled=false; break;
    case 'current':
      txt.textContent='UP TO DATE';
      sub.textContent='Installed v'+updVerShown+'  ·  '+String(channel).toUpperCase()+
        ' v'+(UPD.checkedVersion||updVerShown)+updWhen();
      bar.style.width='100%'; btn.textContent='CHECK AGAIN'; btn.disabled=false; break;
    case 'stale':
      /* Local test packages can legitimately lead the public channel while a
         release is being staged. Do not describe the installed game itself
         as outdated or imply that the player should downgrade. */
      txt.textContent='LOCAL BUILD AHEAD';
      sub.textContent='Installed v'+updVerShown+' · update server is v'+(m?m.version:'?');
      bar.style.width='0%'; btn.textContent='CHECK AGAIN'; btn.disabled=false; break;
    case 'unset':
      txt.textContent='UPDATE SERVICE UNAVAILABLE';
      sub.textContent='v'+updVerShown+'  ·  reconnect and try again';
      bar.style.width='0%'; btn.textContent='RETRY'; btn.disabled=false; break;
    default:
      txt.textContent='GAME VERSION';
      sub.textContent='v'+updVerShown+updWhen();
      bar.style.width='0%'; btn.textContent='CHECK'; btn.disabled=false;
  }
  updRenderFeed();
}
/* One row per file: name, size, and a state glyph. Written as a signature diff
   so a 60fps download does not rebuild this list every chunk. */
function updRenderFeed(){
  const host=document.getElementById('updFeed');
  if(!host) return;
  const show=(UPD.state==='downloading'||UPD.state==='ready'||UPD.state==='error')&&UPD.feed&&UPD.feed.length;
  host.style.display=show?'block':'none';
  if(!show) return;
  const sig=UPD.feed.map(f=>f.state+':'+((f.got/1048576)|0)).join('|');
  if(host._mfSig===sig) return;
  host._mfSig=sig;
  const GL={pending:'·',downloading:'▸',ok:'✓',fail:'✕'};
  host.innerHTML=UPD.feed.map(f=>{
    const nm=String(f.path).split('/').pop();
    const sz=f.size?fmtBytes(f.size):'';
    const got=f.state==='downloading'&&f.size?(' '+Math.min(99,(f.got/f.size*100)|0)+'%'):'';
    return '<div class="updFRow '+f.state+'"><span class="updFG">'+GL[f.state]+'</span>'+
           '<span class="updFN">'+nm+'</span><span class="updFS">'+sz+got+'</span></div>';
  }).join('');
}
function updWhen(){
  if(!UPD.lastCheck) return '';
  const s=(Date.now()-UPD.lastCheck)/1000;
  if(s<90) return '  ·  checked just now';
  if(s<5400) return '  ·  checked '+Math.round(s/60)+'m ago';
  return '  ·  checked '+Math.round(s/3600)+'h ago';
}
function updButton(){
  if(UPD.state==='available') updDownload();
  else if(UPD.state==='ready'||UPD.state==='applyError') updApply();
  else updCheck(true);
}
async function initUpdater(){
  const el=document.getElementById('updPanel');
  if(!el) return;
  updVerShown=await updInstalledVersion();
  UPD.channel=updChannel();
  updEnsureChannelControl();
  await updResolveEndpoint();
  /* Running a patch: offer the way back. Hidden on a packaged build, because a
     revert button that reverts to what you already have is just confusing. */
  if(window.__MASSFRONT_PATCHED) document.body.classList.add('patched');
  const pend=await updGet('pending');
  const previous=await updGet('previous');
  const fail=await updGet('applyFailure');
  const roll=document.getElementById('updRoll');
  if(roll&&window.__MASSFRONT_PATCHED)
    roll.textContent=previous&&previous.version&&verNewer(previous.version,APP_VERSION)
      ? '↺ Revert to validated v'+previous.version : '↺ Revert to packaged v'+APP_VERSION;
  const running=window.__MASSFRONT_PATCHED?String(window.__MASSFRONT_PATCHED):'';
  const installed=running&&localStorage.getItem('mf_update_installed_notice')!==running;
  /* This document IS the patch, so an entry still marked reverted is describing
     the build the player is looking at. Re-applying a rolled-back version can
     only be caught here: it does not re-enter the branch below, because
     mf_update_installed_notice still holds that version from the first install. */
  if(running) updLogMark(running,{rolledBack:false});
  if(installed){
    localStorage.setItem('mf_update_installed_notice',running);
    /* Post the mail for this release. This is the history the player actually
       received on THIS device — not a changelog fetched from the server — so it
       stays truthful offline and after a rollback.

       The body comes from the copy updDownload staged in localStorage. Reading
       UPD.manifest here, as this did, always produced an empty body: this is a
       fresh document, UPD is the literal declared above with manifest:null, and
       the first updCheck that would fill it in is still 1.4 seconds away. */
    if(updLogPost(running,updNotesFor(running))&&typeof storyRefreshBadge==='function')
      try{ storyRefreshBadge(); }catch(e){}
    updSet('installed');
  } else if(fail&&fail.quarantined&&verNewer(fail.version,updVerShown)){
    updSet('error',{err:'v'+fail.version+' failed to start twice and was removed - check again to download a fresh copy'});
  } else if(pend&&fail&&fail.version===pend.version&&verNewer(pend.version,updVerShown)){
    UPD.manifest={version:pend.version,notes:pend.notes,files:[],
                  channel:pend.channel||'stable',severity:pend.severity||'recommended'};
    updSet('applyError',{err:fail.reason||'Downloaded update kept safely — retry install'});
  } else if(pend&&verNewer(pend.version,updVerShown)){
    UPD.manifest={version:pend.version,notes:pend.notes,files:[],
                  channel:pend.channel||'stable',severity:pend.severity||'recommended'};
    updSet('ready');
  } else if(!UPDATE_URL) updSet('unset');
  else renderUpdatePanel();

  /* FRESH INSTALL, and native store upgrades. No OTA ran, so nothing above
     posted anything, and the mailbox would read "no updates yet" on a build the
     player installed five minutes ago. Log the packaged build from its own
     APP_NOTES — entirely local, so it works on a device that has never had a
     network. Silent (read:true) when the log was empty: a brand-new player has
     no "what's new" to catch up on and should not be handed an unread badge on
     first launch. A store upgrade over existing history is real news, so that
     one arrives unread. Dedupe is by version, so a rollback to a packaged build
     that is already logged posts nothing. */
  if(!running&&APP_NOTES){
    const empty=!updLogRead().length;
    if(updLogPost(APP_VERSION,APP_NOTES,{packaged:true,read:empty})&&!empty&&
       typeof storyRefreshBadge==='function') try{ storyRefreshBadge(); }catch(e){}
  }

  /* Auto-check on arrival at the main menu. The dot goes amber while the request
     is in flight and settles green or amber-with-an-update, so the player never
     has to remember to press CHECK. Silent: no toast, no modal — a check that
     interrupts you is worse than no check. Skipped when a download or install is
     already pending, and when the offline gate says no. */
  if(!['downloading','ready','applyError','unset'].includes(UPD.state)){
    setTimeout(()=>{
      if(typeof netAllowed==='function'&&!netAllowed()) return;
      try{ updCheck(false); }catch(e){}
    },1400);
  }

  /* pointerdown alone loses the tap whenever an ancestor cancels the gesture,
     and the start screen has a parallax handler that does exactly that. Bind
     both and swallow the duplicate. */
  const tap=(id,fn)=>{
    const b=document.getElementById(id);
    if(!b) return;
    let last=0;
    const go=e=>{
      e.stopPropagation();
      const t=(typeof performance!=='undefined'?performance.now():Date.now());
      if(t-last<350) return;
      last=t;
      if(typeof sfx==='function') sfx('ui');
      fn();
    };
    /* Completed pointer-up activation avoids Android click retargeting while
       still waiting until the install finger has actually left the screen. */
    if(typeof mfBindTap==='function'){
      mfBindTap(b,go);
      return;
    }
    b.addEventListener('pointerdown',e=>{
      /* Installing replaces the document. Starting that replacement on
         pointer-down lets the matching pointer-up/click land on a newly
         created menu control — on phones it opened Account/Login. Wait for
         the completed click for install/retry; ordinary checks and downloads
         keep their immediate pointer-down response. */
      if(id==='updBtn'&&(UPD.state==='ready'||UPD.state==='applyError')){
        e.stopPropagation();
        return;
      }
      go(e);
    });
    b.addEventListener('click',go);
  };
  tap('updBtn',updButton);
  tap('updCancel',updCancel);
  tap('updRoll',updRollback);
  /* Tapping the line itself opens the detail, so the collapsed state is not a
     dead end. */
  const head=el.querySelector('.updHead');
  if(head) mfBindTap(head,e=>{
    if(e.target.closest('button')) return;
    updOpen=!updOpen; renderUpdatePanel();
  });
  /* A quiet check on launch, so the player finds out there is a patch without
     having to go looking. Never downloads on its own — that is their data. */
  if(UPDATE_URL && UPD.state!=='installed' && UPD.state!=='applyError' &&
     (typeof netAllowed!=='function' || netAllowed()))
    setTimeout(()=>updCheck(false),2500);
}

