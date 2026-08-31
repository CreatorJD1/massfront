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
const APP_VERSION = '1.33.51';

/* Release notes for the PACKAGED build, bumped by the release script beside
   APP_VERSION and PACKAGED_REV. A device that has never taken an OTA has no
   download history to read notes from, and an offline device can never fetch
   them, so the build carries its own copy — otherwise a fresh install shows a
   permanently empty first entry in the mailbox. */
const APP_NOTES = "Hotfix: High/Cinematic clouds are separate puffs instead of a white veil, commander minimap voice, minimap dock and intel layout, softer rank marks, and map-edge camera clamp.";

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
  /* A transfer owns the manifest it captured at its first byte. Switching the
     global channel underneath it used to let that old transfer finish and
     stage the wrong channel after the player had selected a new one. Keep the
     control inert through every state that owns asynchronous update work; the
     player can cancel a download first, then switch once cancellation settles. */
  if(updOperationBusy()) return false;
  const next=updChannelName(channel);
  updSet('channeling',{offerBytes:null,offerKind:null,offerFallback:false,
                       transferKind:null,retryDownload:false,readyIdentity:null});
  let lease=null;
  try{
    /* localStorage is shared but has no compare-and-swap. Serialize its write
       through the updater's IndexedDB lease so Apply/Rollback and final staging
       observe one unambiguous before-or-after channel choice across windows. */
    lease=await updAcquireSharedOperation('channel');
    try{ localStorage.setItem(UPD_CHANNEL_KEY,next); }catch(e){}
    updResolved=false; UPDATE_URL=null;
    /* Drop the STATE together with the manifest. Nulling UPD.manifest while
       UPD.state was still 'available' (or 'ready') made the renderUpdatePanel
       call at the end of this function dereference m.version on a null, which
       threw out of this async function before the caller's updSet('idle') and
       updCheck(true) could run. Symptom: tapping PREVIEW/STABLE while an update
       was on offer highlighted the new button, froze the panel on the OLD
       channel's offer, and turned DOWNLOAD into a dead control — updDownload
       returns immediately on a null manifest — with no way back short of
       restarting the app. */
    UPD.manifest=null; UPD.checkedVersion=null; UPD.source=null; UPD.err=null;
    UPD.channel=next;
    await updResolveEndpoint(true);
    updSet('idle');
    return UPDATE_URL;
  }catch(e){
    updSet('error',{err:e&&e.code==='MF_UPDATE_OPERATION_BUSY'?e.message:
      'Could not switch update channel — try again',retryDownload:false});
    return false;
  }finally{
    if(lease){ try{ await updReleaseSharedOperation(lease); }catch(e){} }
  }
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
         always emits both (publish-hf-release.ps1) and the live 1.33.47
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
const UPD_OPERATION_KEY='operation', UPD_OPERATION_STALE_MS=5*60*1000;
const UPD_PREVIOUS_SLOTS=['previousA','previousB'];

function updIdb(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open(UPD_DB,1);
    r.onupgradeneeded=()=>{ const d=r.result;
      if(!d.objectStoreNames.contains(UPD_STORE)) d.createObjectStore(UPD_STORE); };
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
  });
}
function updBundleMeta(value){
  if(!value) return null;
  return {version:value.version,channel:value.channel||'stable',at:value.at,
    notes:value.notes||'',severity:value.severity||'recommended',
    kind:value.kind||'full',patchedFrom:value.patchedFrom||''};
}
function updMetaKey(key){ return key+'Meta'; }
function updPreviousSlot(key){
  return UPD_PREVIOUS_SLOTS.includes(String(key||''))?String(key):null;
}
async function updGet(key){
  const db=await updIdb();
  return new Promise((res,rej)=>{
    const tx=db.transaction(UPD_STORE,'readonly');
    const q=tx.objectStore(UPD_STORE).get(key);
    q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error);
  });
}
async function updGetBundleMeta(key){
  const db=await updIdb();
  return new Promise((res,rej)=>{
    const tx=db.transaction(UPD_STORE,'readwrite'),store=tx.objectStore(UPD_STORE);
    let result=null;
    const meta=store.get(updMetaKey(key));
    meta.onsuccess=()=>{
      if(meta.result){ result=meta.result; return; }
      /* Pre-metadata installs pay for one payload read, then persist the small
         identity so later menus and boots never deserialize it just for a
         version label. Keep the backfill in this transaction so two windows
         cannot publish metadata for different payload snapshots. */
      const legacy=store.get(key);
      legacy.onsuccess=()=>{
        result=updBundleMeta(legacy.result);
        if(result) store.put(result,updMetaKey(key));
      };
      legacy.onerror=()=>rej(legacy.error||new Error('could not inspect legacy bundle'));
    };
    meta.onerror=()=>rej(meta.error||new Error('could not inspect bundle metadata'));
    tx.oncomplete=()=>res(result);
    tx.onerror=()=>rej(tx.error||new Error('could not migrate bundle metadata'));
    tx.onabort=()=>rej(tx.error||new Error('bundle metadata migration aborted'));
  });
}
async function updGetRollbackMeta(){
  const db=await updIdb();
  const records=await new Promise((res,rej)=>{
    const tx=db.transaction(UPD_STORE,'readonly'),store=tx.objectStore(UPD_STORE);
    const keys=['previousRef','previousAMeta','previousBMeta','previousMeta'];
    const requests=keys.map(key=>store.get(key));
    let ready=0;
    const inspect=()=>{
      if(++ready<keys.length) return;
      const result={};
      keys.forEach((key,index)=>{ result[key]=requests[index].result; });
      res(result);
    };
    requests.forEach(request=>{
      request.onsuccess=inspect;
      request.onerror=()=>rej(request.error||new Error('could not inspect rollback metadata'));
    });
    tx.onerror=()=>rej(tx.error||new Error('could not inspect rollback metadata'));
    tx.onabort=()=>rej(tx.error||new Error('rollback metadata inspection aborted'));
  });
  const slot=updPreviousSlot(records.previousRef&&records.previousRef.key);
  const meta=slot&&records[updMetaKey(slot)];
  if(meta&&updSamePending(records.previousRef,meta)) return meta;
  if(records.previousMeta) return records.previousMeta;
  /* Only legacy installs without metadata pay for the old full-payload read.
     Slot records are always written with metadata in the same transaction. */
  return updGetBundleMeta('previous');
}
function updOperationLive(operation){
  const age=operation&&Number.isFinite(operation.at)?Date.now()-operation.at:-1;
  return !!(operation&&operation.token&&age>=0&&age<UPD_OPERATION_STALE_MS);
}
/* Apply and Rollback are short, destructive storage operations. A durable IDB
   lease serializes them across tabs/WebViews; the five-minute expiry recovers
   a document killed mid-operation without leaving updates disabled forever. */
async function updAcquireSharedOperation(kind,target){
  const db=await updIdb();
  return new Promise((res,rej)=>{
    const tx=db.transaction(UPD_STORE,'readwrite'),store=tx.objectStore(UPD_STORE);
    const lease={kind:String(kind),at:Date.now(),target:updPendingIdentity(target),
      token:String(kind)+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)};
    let conflict=null;
    const current=store.get(UPD_OPERATION_KEY);
    current.onsuccess=()=>{
      if(updOperationLive(current.result)){
        conflict=new Error('Another update window is already busy');
        conflict.code='MF_UPDATE_OPERATION_BUSY';
        try{ tx.abort(); }catch(e){ rej(conflict); }
        return;
      }
      store.put(lease,UPD_OPERATION_KEY);
    };
    current.onerror=()=>rej(current.error||new Error('could not inspect update operation'));
    tx.oncomplete=()=>res(lease);
    tx.onerror=()=>rej(conflict||tx.error||new Error('could not lock update operation'));
    tx.onabort=()=>rej(conflict||tx.error||new Error('update operation lock aborted'));
  });
}
async function updRefreshSharedOperation(lease){
  if(!lease||!lease.token) throw new Error('Missing update operation ownership');
  const db=await updIdb();
  return new Promise((res,rej)=>{
    const tx=db.transaction(UPD_STORE,'readwrite'),store=tx.objectStore(UPD_STORE);
    let conflict=null,refreshed=null;
    const current=store.get(UPD_OPERATION_KEY);
    current.onsuccess=()=>{
      if(!current.result||current.result.token!==lease.token){
        conflict=new Error('Update operation ownership changed');
        conflict.code='MF_UPDATE_OPERATION_CHANGED';
        try{ tx.abort(); }catch(e){ rej(conflict); }
        return;
      }
      refreshed=Object.assign({},current.result,{at:Date.now()});
      store.put(refreshed,UPD_OPERATION_KEY);
    };
    current.onerror=()=>rej(current.error||new Error('could not refresh update operation'));
    tx.oncomplete=()=>{ Object.assign(lease,refreshed||{}); res(lease); };
    tx.onerror=()=>rej(conflict||tx.error||new Error('could not refresh update operation'));
    tx.onabort=()=>rej(conflict||tx.error||new Error('update operation refresh aborted'));
  });
}
async function updReleaseSharedOperation(lease){
  if(!lease||!lease.token) return;
  const db=await updIdb();
  return new Promise((res,rej)=>{
    const tx=db.transaction(UPD_STORE,'readwrite'),store=tx.objectStore(UPD_STORE);
    const current=store.get(UPD_OPERATION_KEY);
    current.onsuccess=()=>{
      if(current.result&&current.result.token===lease.token) store.delete(UPD_OPERATION_KEY);
    };
    current.onerror=()=>rej(current.error||new Error('could not inspect update operation'));
    tx.oncomplete=()=>res();
    tx.onerror=()=>rej(tx.error||new Error('could not release update operation'));
    tx.onabort=()=>rej(tx.error||new Error('update operation release aborted'));
  });
}
async function updPreparePrevious(expected,lease){
  const db=await updIdb();
  return new Promise((res,rej)=>{
    const tx=db.transaction(UPD_STORE,'readwrite'),store=tx.objectStore(UPD_STORE);
    let conflict=null,result=null,ready=0;
    const operation=store.get(UPD_OPERATION_KEY);
    const meta=store.get('activeMeta');
    const previousRef=store.get('previousRef');
    const inspect=()=>{
      if(++ready<3) return;
      if(!lease||!operation.result||operation.result.token!==lease.token){
        conflict=new Error('Update operation ownership changed');
        conflict.code='MF_UPDATE_OPERATION_CHANGED';
        try{ tx.abort(); }catch(e){ rej(conflict); }
        return;
      }
      if(meta.result&&!updSamePending(meta.result,expected)){
        conflict=new Error('The installed update changed before rollback preservation');
        conflict.code='MF_UPDATE_ACTIVE_CHANGED';
        try{ tx.abort(); }catch(e){ rej(conflict); }
        return;
      }
      /* Read the one known-good active payload BEFORE pending is materialized.
         This keeps an OTA-to-OTA Apply at one large JS value at a time instead
         of cloning active plus pending twice in the promotion transaction. */
      const active=store.get('active');
      active.onsuccess=()=>{
        if(!updSamePending(active.result,expected)){
          conflict=new Error('The installed update changed before rollback preservation');
          conflict.code='MF_UPDATE_ACTIVE_CHANGED';
          try{ tx.abort(); }catch(e){ rej(conflict); }
          return;
        }
        /* The currently referenced rollback remains untouched until promotion
           succeeds. A failed/quota-aborted Apply can therefore discard only
           its inactive preparation slot, never the last validated recovery. */
        const current=updPreviousSlot(previousRef.result&&previousRef.result.key);
        const key=current==='previousA'?'previousB':'previousA';
        const activeMeta=updBundleMeta(active.result);
        result=Object.assign({key},updPendingIdentity(activeMeta));
        store.put(Object.assign({},operation.result,{at:Date.now()}),UPD_OPERATION_KEY);
        store.put(active.result,key);
        store.put(activeMeta,updMetaKey(key));
        if(!meta.result) store.put(activeMeta,'activeMeta');
      };
      active.onerror=()=>rej(active.error||new Error('could not inspect installed rollback copy'));
    };
    operation.onsuccess=inspect; meta.onsuccess=inspect; previousRef.onsuccess=inspect;
    operation.onerror=()=>rej(operation.error||new Error('could not verify rollback-copy ownership'));
    meta.onerror=()=>rej(meta.error||new Error('could not inspect installed update metadata'));
    previousRef.onerror=()=>rej(previousRef.error||new Error('could not inspect rollback pointer'));
    tx.oncomplete=()=>res(result);
    tx.onerror=()=>rej(conflict||tx.error||new Error('could not save rollback copy'));
    tx.onabort=()=>rej(conflict||tx.error||new Error('rollback-copy write aborted'));
  });
}
async function updClearPreviousOwned(prepared,lease){
  const key=prepared&&updPreviousSlot(prepared.key);
  if(!key) return false;
  const db=await updIdb();
  return new Promise((res,rej)=>{
    const tx=db.transaction(UPD_STORE,'readwrite'),store=tx.objectStore(UPD_STORE);
    let conflict=null,ready=0,cleared=false;
    const operation=store.get(UPD_OPERATION_KEY);
    const meta=store.get(updMetaKey(key));
    const inspect=()=>{
      if(++ready<2) return;
      if(!lease||!operation.result||operation.result.token!==lease.token){
        conflict=new Error('Update operation ownership changed');
        conflict.code='MF_UPDATE_OPERATION_CHANGED';
        try{ tx.abort(); }catch(e){ rej(conflict); }
        return;
      }
      /* A later owner may reuse the inactive slot. Exact identity plus the
         operation token prevents an older finally block deleting its bytes. */
      if(updSamePending(meta.result,prepared)){
        cleared=true;
        store.delete(key); store.delete(updMetaKey(key));
      }
    };
    operation.onsuccess=inspect; meta.onsuccess=inspect;
    operation.onerror=()=>rej(operation.error||new Error('could not verify rollback-copy cleanup'));
    meta.onerror=()=>rej(meta.error||new Error('could not inspect rollback-copy cleanup'));
    tx.oncomplete=()=>res(cleared);
    tx.onerror=()=>rej(conflict||tx.error||new Error('could not clear rollback copy'));
    tx.onabort=()=>rej(conflict||tx.error||new Error('rollback-copy cleanup aborted'));
  });
}

/* Commit the verified payload and retire a prior failed-start marker in ONE
   transaction. Separate writes allowed the first to succeed and the second to
   fail, leaving a newly staged payload behind after updDownload reported a
   failure. IndexedDB transactions are atomic across both keys. */
async function updCommitPending(value){
  const db=await updIdb();
  return new Promise((res,rej)=>{
    const tx=db.transaction(UPD_STORE,'readwrite');
    const store=tx.objectStore(UPD_STORE);
    let conflict=null;
    const existing=store.get('pendingMeta');
    const probation=store.get('probation');
    const operation=store.get(UPD_OPERATION_KEY);
    let ready=0,prior=null,legacy=null,committed=false;
    const abortConflict=(message,code)=>{
      conflict=new Error(message); conflict.code=code;
      try{ tx.abort(); }catch(e){ rej(conflict); }
    };
    const commit=()=>{
      if(committed) return;
      committed=true;
      if(updOperationLive(operation.result)){
        abortConflict('Another update operation is already in progress',
                      'MF_UPDATE_OPERATION_BUSY');
        return;
      }
      if(operation.result) store.delete(UPD_OPERATION_KEY);
      if(probation.result){
        abortConflict('Another update is already being installed','MF_UPDATE_INSTALL_ACTIVE');
        return;
      }
      /* localStorage is shared between same-origin documents. Recheck channel
         intent inside the serialized transaction so an old Preview tab cannot
         stage after another tab has selected Stable (or vice versa). */
      if(!updPendingForChannel(value)){
        abortConflict('The update channel changed during download','MF_UPDATE_CHANNEL_CHANGED');
        return;
      }
      const newer=prior&&prior.version&&verNewer(prior.version,value.version);
      const sameVersion=prior&&String(prior.version)===String(value.version);
      const sameChannel=prior&&updChannelName(prior.channel||'stable')===
        updChannelName(value.channel||'stable');
      if(sameChannel&&(newer||sameVersion)){
        abortConflict(newer?'A newer update is already staged'
                           :'This update version is already staged',
                      'MF_UPDATE_PENDING_SUPERSEDED');
        return;
      }
      store.put(value,'pending');
      store.put(updBundleMeta(value),'pendingMeta');
      store.delete('applyFailure');
    };
    const inspect=()=>{
      if(++ready<3) return;
      if(existing.result){ prior=existing.result; commit(); return; }
      /* A pre-metadata pending record is read only once for arbitration. The
         incoming verified payload replaces it on success; a conflicting legacy
         record stays untouched, and initUpdater's metadata migration handles
         its future lightweight reads. */
      legacy=store.get('pending');
      legacy.onsuccess=()=>{ prior=updBundleMeta(legacy.result); commit(); };
      legacy.onerror=()=>rej(legacy.error||new Error('could not inspect legacy staged update'));
    };
    existing.onsuccess=inspect;
    probation.onsuccess=inspect;
    operation.onsuccess=inspect;
    existing.onerror=()=>rej(existing.error||new Error('could not inspect staged update metadata'));
    probation.onerror=()=>rej(probation.error||new Error('could not inspect update installation'));
    operation.onerror=()=>rej(operation.error||new Error('could not inspect update operation'));
    tx.oncomplete=()=>res();
    tx.onerror=()=>rej(conflict||tx.error||new Error('update staging failed'));
    tx.onabort=()=>rej(conflict||tx.error||new Error('update staging aborted'));
  });
}

function updSamePending(a,b){
  return !!(a&&b&&String(a.version)===String(b.version)&&
    updChannelName(a.channel||'stable')===updChannelName(b.channel||'stable')&&
    String(a.at==null?'':a.at)===String(b.at==null?'':b.at));
}
function updPendingIdentity(value){
  return value?{version:value.version,channel:value.channel||'stable',at:value.at}:null;
}
function updRunningIdentity(){
  if(typeof window==='undefined'||!window.__MASSFRONT_PATCHED) return null;
  return {version:String(window.__MASSFRONT_PATCHED),
    channel:window.__MASSFRONT_PATCH_CHANNEL||'stable',
    at:window.__MASSFRONT_PATCH_AT};
}
function updProbationOwns(probation,bundle){
  return !!(probation&&bundle&&String(probation.version)===String(bundle.version)&&
    updChannelName(probation.channel||'stable')===updChannelName(bundle.channel||'stable')&&
    (probation.pendingAt==null||
     String(probation.pendingAt)===String(bundle.at==null?'':bundle.at)));
}
/* Validate pending and promote it under the SAME transaction. This closes the
   cross-document gap where another tab could replace pending after Apply read
   it, causing the old snapshot to become active and the new one to be deleted
   by boot confirmation. A probation record also blocks later staging. */
async function updCommitApply(value,lease,expected,running,prepared){
  const preparedSlot=prepared&&updPreviousSlot(prepared.key);
  if(prepared&&(!preparedSlot||!running||!updSamePending(prepared,running))){
    const conflict=new Error('The prepared rollback copy changed before installation');
    conflict.code='MF_UPDATE_PREVIOUS_CHANGED';
    throw conflict;
  }
  const db=await updIdb();
  return new Promise((res,rej)=>{
    const tx=db.transaction(UPD_STORE,'readwrite');
    const store=tx.objectStore(UPD_STORE);
    const pending=store.get('pendingMeta'),active=store.get('activeMeta');
    const probation=store.get('probation');
    const operation=store.get(UPD_OPERATION_KEY);
    const previousRef=store.get('previousRef');
    const preparedMeta=preparedSlot?store.get(updMetaKey(preparedSlot)):null;
    let pendingReady=false,activeReady=false,probationReady=false;
    let operationReady=false,previousReady=false,preparedReady=!preparedSlot,conflict=null;
    const promote=()=>{
      if(!pendingReady||!activeReady||!probationReady||!operationReady||
         !previousReady||!preparedReady) return;
      if(!lease||!operation.result||operation.result.token!==lease.token){
        conflict=new Error('Update installation ownership changed');
        conflict.code='MF_UPDATE_OPERATION_CHANGED';
        try{ tx.abort(); }catch(e){ rej(conflict); }
        return;
      }
      if(probation.result){
        conflict=new Error('Another update is already being installed');
        conflict.code='MF_UPDATE_INSTALL_ACTIVE';
        try{ tx.abort(); }catch(e){ rej(conflict); }
        return;
      }
      if(!updPendingForChannel(value)){
        conflict=new Error('The update channel changed before installation');
        conflict.code='MF_UPDATE_CHANNEL_CHANGED';
        try{ tx.abort(); }catch(e){ rej(conflict); }
        return;
      }
      if(!updSamePending(pending.result,value)||
         (expected&&!updSamePending(pending.result,expected))){
        conflict=new Error('The downloaded update changed before installation');
        conflict.code='MF_UPDATE_PENDING_CHANGED';
        try{ tx.abort(); }catch(e){ rej(conflict); }
        return;
      }
      if(running&&!updSamePending(active.result,running)){
        conflict=new Error('The installed update changed before installation');
        conflict.code='MF_UPDATE_ACTIVE_CHANGED';
        try{ tx.abort(); }catch(e){ rej(conflict); }
        return;
      }
      if(preparedSlot&&!updSamePending(preparedMeta.result,prepared)){
        conflict=new Error('The prepared rollback copy changed before installation');
        conflict.code='MF_UPDATE_PREVIOUS_CHANGED';
        try{ tx.abort(); }catch(e){ rej(conflict); }
        return;
      }
      store.put({version:value.version,channel:value.channel||'stable',
                 pendingAt:value.at,at:Date.now(),tries:0},'probation');
      store.put(value,'active');
      store.put(updBundleMeta(value),'activeMeta');
      if(preparedSlot){
        const oldSlot=updPreviousSlot(previousRef.result&&previousRef.result.key);
        store.put(Object.assign({key:preparedSlot},updPendingIdentity(prepared)),
                  'previousRef');
        if(oldSlot&&oldSlot!==preparedSlot){
          store.delete(oldSlot); store.delete(updMetaKey(oldSlot));
        }
        store.delete('previous'); store.delete('previousMeta');
      }else if(!running||!updSamePending(running,value)){
        /* If the best-effort copy did not fit, a successful promotion must not
           leave Rollback pointing two releases behind. Retire the old pointer
           only here, atomically with the new active payload; an Apply which
           fails before promotion still keeps its validated recovery intact. */
        store.delete('previousRef');
        for(const key of UPD_PREVIOUS_SLOTS){
          store.delete(key); store.delete(updMetaKey(key));
        }
        store.delete('previous'); store.delete('previousMeta');
      }
    };
    pending.onsuccess=()=>{ pendingReady=true; promote(); };
    active.onsuccess=()=>{ activeReady=true; promote(); };
    probation.onsuccess=()=>{ probationReady=true; promote(); };
    operation.onsuccess=()=>{ operationReady=true; promote(); };
    previousRef.onsuccess=()=>{ previousReady=true; promote(); };
    if(preparedMeta) preparedMeta.onsuccess=()=>{ preparedReady=true; promote(); };
    pending.onerror=()=>rej(pending.error||new Error('could not recheck download metadata'));
    active.onerror=()=>rej(active.error||new Error('could not inspect installed update metadata'));
    probation.onerror=()=>rej(probation.error||new Error('could not inspect update installation'));
    operation.onerror=()=>rej(operation.error||new Error('could not recheck update operation'));
    previousRef.onerror=()=>rej(previousRef.error||new Error('could not inspect rollback pointer'));
    if(preparedMeta) preparedMeta.onerror=()=>rej(preparedMeta.error||new Error('could not inspect prepared rollback copy'));
    tx.oncomplete=()=>res();
    tx.onerror=()=>rej(conflict||tx.error||new Error('could not prepare update'));
    tx.onabort=()=>rej(conflict||tx.error||new Error('update preparation aborted'));
  });
}

/* Rollback is one durable state transition. The former sequence used up to
   five separate transactions, so process death could expose a restored active
   bundle without probation or destroy only half of the recovery records. */
async function updCommitRollback(lease,expected){
  const db=await updIdb();
  return new Promise((res,rej)=>{
    const tx=db.transaction(UPD_STORE,'readwrite'),store=tx.objectStore(UPD_STORE);
    const keys=['activeMeta','pendingMeta','probation',UPD_OPERATION_KEY,
      'previousRef','previousAMeta','previousBMeta','previousMeta'];
    const requests=keys.map(key=>store.get(key)),records={};
    let ready=0,legacyLeft=0,activeLegacy=null,pendingLegacy=null;
    let conflict=null,result=null,committed=false;
    const abort=(message,code)=>{
      conflict=new Error(message); conflict.code=code;
      try{ tx.abort(); }catch(e){ rej(conflict); }
    };
    const clearPrevious=()=>{
      store.delete('previousRef'); store.delete('previous'); store.delete('previousMeta');
      for(const key of UPD_PREVIOUS_SLOTS){
        store.delete(key); store.delete(updMetaKey(key));
      }
    };
    const commit=(prior,selected)=>{
      if(committed) return;
      committed=true;
      const operation=records[UPD_OPERATION_KEY];
      if(!lease||!operation||operation.token!==lease.token){
        abort('Update rollback ownership changed','MF_UPDATE_OPERATION_CHANGED');
        return;
      }
      const current=records.activeMeta||(activeLegacy&&activeLegacy.result)||null;
      const pending=records.pendingMeta||(pendingLegacy&&pendingLegacy.result)||null;
      if(expected&&!updSamePending(current,expected)){
        abort('The installed update changed before rollback','MF_UPDATE_ACTIVE_CHANGED');
        return;
      }
      if(records.probation&&!updProbationOwns(records.probation,current)){
        abort('Update recovery state changed before rollback','MF_UPDATE_ACTIVE_CHANGED');
        return;
      }
      const good=prior&&prior.files&&verNewer(prior.version,APP_VERSION)&&
        Array.isArray(prior.order)&&prior.order.every(p=>typeof prior.files[p]==='string')&&
        (!selected.meta||updSamePending(selected.meta,prior))&&
        (!selected.ref||updSamePending(selected.ref,prior));
      if(good){
        result={version:prior.version,recovered:true};
        store.put(prior,'active'); store.put(updBundleMeta(prior),'activeMeta');
        clearPrevious();
        store.put({version:prior.version,channel:prior.channel||'stable',
                   pendingAt:prior.at,at:Date.now(),tries:0},'probation');
      }else{
        result={version:'',recovered:false};
        store.delete('active'); store.delete('activeMeta');
        clearPrevious();
        store.delete('probation');
      }
      /* `pending` may be a different candidate downloaded in another window.
         Reverting the installed build must not silently discard that consent. */
      if(pending&&current&&updSamePending(pending,current)){
        store.delete('pending'); store.delete('pendingMeta');
      }
    };
    const loadPrevious=()=>{
      const ref=records.previousRef;
      const slot=updPreviousSlot(ref&&ref.key);
      const slotMeta=slot&&records[updMetaKey(slot)];
      const selected=slot&&slotMeta&&updSamePending(ref,slotMeta)
        ?{key:slot,meta:slotMeta,ref}
        :{key:'previous',meta:records.previousMeta,ref:null};
      const previous=store.get(selected.key);
      previous.onsuccess=()=>commit(previous.result,selected);
      previous.onerror=()=>rej(previous.error||new Error('could not inspect rollback copy'));
    };
    const legacyDone=()=>{ if(--legacyLeft===0) loadPrevious(); };
    const inspect=()=>{
      if(++ready<keys.length) return;
      keys.forEach((key,index)=>{ records[key]=requests[index].result; });
      const operation=records[UPD_OPERATION_KEY];
      if(!lease||!operation||operation.token!==lease.token){
        abort('Update rollback ownership changed','MF_UPDATE_OPERATION_CHANGED');
        return;
      }
      if(!records.activeMeta){
        legacyLeft++; activeLegacy=store.get('active');
        activeLegacy.onsuccess=legacyDone;
        activeLegacy.onerror=()=>rej(activeLegacy.error||new Error('could not inspect installed update'));
      }
      if(!records.pendingMeta){
        legacyLeft++; pendingLegacy=store.get('pending');
        pendingLegacy.onsuccess=legacyDone;
        pendingLegacy.onerror=()=>rej(pendingLegacy.error||new Error('could not inspect downloaded update'));
      }
      if(!legacyLeft) loadPrevious();
    };
    requests.forEach(request=>{
      request.onsuccess=inspect;
      request.onerror=()=>rej(request.error||new Error('could not inspect update rollback state'));
    });
    tx.oncomplete=()=>res(result);
    tx.onerror=()=>rej(conflict||tx.error||new Error('could not commit rollback'));
    tx.onabort=()=>rej(conflict||tx.error||new Error('update rollback aborted'));
  });
}

/* ---- THE RELEASE LOG, AND THE NOTES THAT GO IN IT --------------------------
   Every release the player actually receives posts one mail item, and the body
   of that item is the publisher's notes for that exact version.

   Two storage rules make that work on a phone:

   * The notes are staged in localStorage at DOWNLOAD time, not read back out
     of the bundle at install time. They travel with the bundle in the IndexedDB
     `pending` record, but that record holds the whole payload — the current
     full release is about 85 MB — and deserialising it on the
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
function updDownloadAbort(){
  const e=new Error('Download cancelled'); e.name='AbortError'; return e;
}
/* Every awaited boundary verifies BOTH cancellation and ownership. The signal
   handles an ordinary CANCEL; the run id prevents an older promise from
   painting or committing after a newer attempt has taken ownership. */
function updAssertDownload(run,ac){
  if(UPD.downloadRun!==run||(ac&&ac.signal&&ac.signal.aborted))
    throw updDownloadAbort();
}
async function updVerifyHash(bytes,want,path,run,ac){
  if(!want) return;
  if(typeof crypto==='undefined'||!crypto.subtle) throw new Error(path+': integrity checks unavailable');
  /* Keep the verifier safe for both streamed downloads (Uint8Array) and any
     future non-streaming/native bridge that hands us a Blob. Web Crypto only
     accepts an ArrayBuffer or a view, never a Blob object itself. */
  if(bytes&&typeof bytes.arrayBuffer==='function'){
    bytes=await bytes.arrayBuffer();
    updAssertDownload(run,ac);
  }
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  updAssertDownload(run,ac);
  const got=updHex(digest);
  if(got.toLowerCase()!==String(want).toLowerCase()) throw new Error(path+': integrity check failed');
}

const UPD={ state:'idle', manifest:null, pct:0, got:0, total:0, rate:0, err:null,
             abort:null, lastCheck:0, checkedVersion:null, source:null, channel:'stable',
             downloadSeq:0,downloadRun:0,retryDownload:false,
             offerBytes:null,offerKind:null,offerFallback:false,transferKind:null,
             readyIdentity:null,
            /* Per-file feed. The download loop has always walked m.files, but only
               aggregate bytes were ever surfaced, so a multi-file patch looked
               identical to one big blob and a stall gave no clue which object was
               stuck. feed[] carries one row per file: name, size, and state. */
            feed:[], fileIdx:-1 };

/* One synchronous lock for every updater operation that owns async state.
   Without it, each function acquired its visible state after a different
   first await, leaving small but reachable channel/apply/rollback races. */
function updOperationBusy(){
  return !!UPD.downloadRun||
    ['channeling','checking','downloading','staging','applying','rollingBack'].includes(UPD.state);
}

function updSet(st,extra){
  UPD.state=st;
  if(extra) Object.assign(UPD,extra);
  if(typeof renderUpdatePanel==='function') renderUpdatePanel();
}

/* ---- CHECK ---------------------------------------------------------------- */
async function updCheck(manual){
  if(updOperationBusy()) return;
  /* Offline is a normal state, not a failure. Say so and stop — do not attempt
     a request that cannot succeed and then report an error for it. */
  if(typeof netAllowed==='function' && !netAllowed()){
    updSet('unset',{err:null});
    if(manual&&typeof toast==='function')
      toast('✈ Offline mode — turn it off in Settings to check for updates');
    return;
  }
  /* Claim the check before endpoint resolution, which itself awaits local
     configuration. Otherwise a second check or channel tap can interleave
     before the old implementation ever reached its `checking` state. */
  const t0=(typeof performance!=='undefined'?performance.now():Date.now());
  updSet('checking',{err:null,channel:updChannel(),retryDownload:false,readyIdentity:null});

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
    if(next==='available'){
      const plan=await updTransferPlan(m);
      if(plan.error){ next='error'; extra={err:plan.error}; }
      else{
        UPD.offerBytes=plan.files.reduce((sum,f)=>sum+(f.size||0),0);
        UPD.offerKind=updKindForFiles(plan.files);
        UPD.offerFallback=plan.fallback;
      }
    } else {
      UPD.offerBytes=null; UPD.offerKind=null; UPD.offerFallback=false;
    }
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
  updSet(next,Object.assign({retryDownload:false},extra));
  if(manual&&next==='current'&&typeof toast==='function') toast('✓ You are on the latest build (v'+updVerShown+')');
  if(manual&&next==='stale'&&typeof toast==='function')
    toast('Update channel is behind this build (server v'+UPD.manifest.version+', installed v'+updVerShown+')');
}

/* ---- DOWNLOAD ------------------------------------------------------------- */
/* Resolve the payload shape before consent as well as before transfer. Patch
   manifests carry a tiny delta and an optional full fallback; showing only the
   delta size to a fresh packaged client concealed the actual mobile-data cost. */
async function updTransferPlan(m){
  const files=Array.isArray(m&&m.files)?m.files:[];
  if(!updIsPatch(m)) return {files,patching:false,priorRec:null,fallback:false};
  let priorRec;
  try{ priorRec=await updGet('active'); }
  catch(e){ return {files:[],patching:false,priorRec:null,fallback:false,
                    error:'Could not inspect the installed update'}; }
  const priorFiles=(priorRec&&priorRec.files)||null;
  const sameBase=!!priorRec&&String(priorRec.version)===String(m.patchFrom);
  const shapeOK=!!priorFiles&&files.every(f=>
    Object.prototype.hasOwnProperty.call(priorFiles,f.path));
  if(sameBase&&shapeOK) return {files,patching:true,priorRec,fallback:false};
  const full=updFullEntry(m);
  if(full) return {files:full,patching:false,priorRec,fallback:true};
  const why=!priorRec ? 'there is no installed update to patch'
            : !sameBase ? ('it patches '+m.patchFrom+' and you have '+priorRec.version)
            : 'it patches files your installed build does not contain';
  return {files:[],patching:false,priorRec,fallback:false,
          error:'This update cannot be applied because '+why+
                ', and no full payload was published'};
}

/* Streamed so the bar reflects bytes actually on the device rather than
   jumping from 0 to 100 when the request settles. Files are fetched one at a
   time: on a phone that is kinder to memory than a dozen parallel sockets, and
   it makes per-file progress honest. */
async function updDownload(){
  const m=UPD.manifest;
  if(!m||updOperationBusy()) return;
  /* Claim the attempt before the first await. Patch-base discovery touches
     IndexedDB and can be slow under quota pressure; without this synchronous
     latch a second activation could start another full mobile-data transfer. */
  const run=++UPD.downloadSeq, ac=new AbortController();
  UPD.downloadRun=run;
  let patching=false, files=Array.isArray(m.files)?m.files:[], priorRec=null;
  const initialTotal=files.reduce((s,f)=>s+(f.size||0),0)||1;
  UPD.feed=files.map(f=>({path:f.path,size:f.size||0,state:'pending',got:0}));
  UPD.fileIdx=-1;
  updSet('downloading',{pct:0,got:0,total:initialTotal,rate:0,err:null,abort:ac,
                        retryDownload:false,readyIdentity:null});
  const base=m.base||'';
  const t0=performance.now();
  const out={};
  try{
    const plan=await updTransferPlan(m);
    updAssertDownload(run,ac);
    if(plan.error){
      UPD.feed=[];
      updSet('error',{err:plan.error,abort:null,retryDownload:false});
      return;
    }
    files=plan.files; patching=plan.patching; priorRec=plan.priorRec;
    const total=files.reduce((s,f)=>s+(f.size||0),0)||1;
    UPD.total=total;
    UPD.transferKind=updKindForFiles(files);
    /* Rebuild after patch-base selection so a full fallback never inherits the
       delta's rows. Every retry also receives new row objects and counters. */
    UPD.feed=files.map(f=>({path:f.path,size:f.size||0,state:'pending',got:0}));
    UPD.fileIdx=-1;
    if(typeof renderUpdatePanel==='function') renderUpdatePanel();
    let got=0;
    for(let fi=0;fi<files.length;fi++){
      const f=files[fi];
      UPD.fileIdx=fi;
      if(UPD.feed[fi]) UPD.feed[fi].state='downloading';
      const src=f.url||base+f.path;
      const r=await fetch(src+(src.includes('?')?'&':'?')+'v='+encodeURIComponent(m.version),
                          {cache:'no-store',signal:ac.signal});
      updAssertDownload(run,ac);
      if(!r.ok) throw new Error(f.path+': HTTP '+r.status);
      const contentType=String(r.headers&&r.headers.get?r.headers.get('content-type')||'':'').toLowerCase();
      const chunks=[]; let n=0;
      if(r.body&&r.body.getReader){
        const rd=r.body.getReader();
        for(;;){
          const {done,value}=await rd.read();
          updAssertDownload(run,ac);
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
        updAssertDownload(run,ac);
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
      await updVerifyHash(bytes,f.sha256,f.path,run,ac);
      updAssertDownload(run,ac);
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
      /* Already fetched and validated in the decision block above, so this
         cannot be null here - but re-read defensively rather than trusting a
         value captured before a multi-megabyte download. */
      let prior=priorRec;
      if(!prior){ prior=await updGet('active'); updAssertDownload(run,ac); }
      else updAssertDownload(run,ac);
      const priorFiles=(prior&&prior.files)||null;
      if(!priorFiles){
        /* abort:null, or this bail-out leaves UPD.abort holding the controller
           of a download that has already finished. updCancel() would then fire
           at a dead request, and the handle keeps the whole response pipeline
           reachable for the life of the document. */
        updSet('error',{err:'The patch base is missing — reinstall the full update',abort:null,
                        retryDownload:false});
        return;
      }
      commitFiles=Object.assign({},priorFiles,out);
      const priorOrder=(prior&&Array.isArray(prior.order)&&prior.order.length)
                        ? prior.order.slice() : Object.keys(priorFiles);
      for(const path of commitOrder) if(priorOrder.indexOf(path)<0) priorOrder.push(path);
      commitOrder=priorOrder;
    }
    updAssertDownload(run,ac);
    const pending={version:m.version, notes:m.notes||'', at:Date.now(),
                   schema:m.schema||1,channel:m.channel||'stable',
                   severity:m.severity||'recommended',
                   kind:plan.fallback?'full':(updIsPatch(m)?'patch':(m.kind||'full')),
                   patchedFrom:patching?String(m.patchFrom):'',
                   order:commitOrder, files:commitFiles};
    /* This is the explicit cancellation boundary. All network and integrity
       work is complete. From here the tiny atomic IDB transaction must finish
       as one unit, so CANCEL disappears and channel changes remain locked. */
    updSet('staging',{pct:100,abort:null,retryDownload:false});
    await updCommitPending(pending);
    updAssertDownload(run,ac);
    /* Stage the notes where the NEXT document can read them without touching
       the megabytes of source sitting in the record above. This is deliberately
       after the atomic IDB commit, so a failed transaction cannot alter notes. */
    updStageNotes(m.version,m.notes);
    updSet('ready',{pct:100,abort:null,retryDownload:false,
                    readyIdentity:updPendingIdentity(pending)});
  }catch(e){
    /* A stale attempt belongs to a newer owner now. It must not repaint that
       owner's state, feed, controller, or error. */
    if(UPD.downloadRun!==run) return;
    if(UPD.fileIdx>=0&&UPD.feed[UPD.fileIdx]&&UPD.feed[UPD.fileIdx].state==='downloading')
      UPD.feed[UPD.fileIdx].state='fail';
    /* IndexedDB may also report AbortError when a staging transaction fails.
       Only this attempt's own aborted signal means the player pressed Cancel. */
    if(ac.signal&&ac.signal.aborted){
      updSet('available',{pct:0,got:0,rate:0,abort:null,retryDownload:false});
      return;
    }
    const superseded=e&&['MF_UPDATE_PENDING_SUPERSEDED','MF_UPDATE_CHANNEL_CHANGED',
      'MF_UPDATE_INSTALL_ACTIVE','MF_UPDATE_OPERATION_BUSY'].includes(e.code);
    updSet('error',{err:(e&&e.message)||'Download failed',abort:null,
                    retryDownload:!superseded});
  }finally{
    if(UPD.downloadRun===run){
      UPD.downloadRun=0;
      if(typeof renderUpdatePanel==='function') renderUpdatePanel();
    }
  }
}
function updCancel(){ if(UPD.state==='downloading'&&UPD.abort) UPD.abort.abort(); }

/* ---- APPLY / ROLLBACK ------------------------------------------------------ */
async function updApply(){
  if(updOperationBusy()) return;
  const expected=UPD.readyIdentity;
  const running=updRunningIdentity();
  /* Applying owns storage from its first read onward. Acquiring this state
     after `updGet('pending')` allowed a channel tap to clear the manifest while
     the old channel's payload was already on its way to `active`. */
  updSet('applying',{err:null,pct:100});
  let lease=null,reload=false,preparedPrevious=null,promoted=false;
  try{
    lease=await updAcquireSharedOperation('apply',expected);
    const offered=await updGet('pendingMeta');
    if(!expected||!updSamePending(offered,expected)){
      updSet('error',{err:'The downloaded update changed — review it before installing',
                      retryDownload:false});
      return;
    }
    /* Preserve the known-good active payload before pending is materialized.
       The copy is best-effort and lease-owned: quota failure cannot block the
       install, while lost ownership cannot delete a newer window's copy. */
    if(running&&!updSamePending(running,expected)){
      try{ preparedPrevious=await updPreparePrevious(running,lease); }
      catch(e){
        if(e&&['MF_UPDATE_OPERATION_CHANGED','MF_UPDATE_ACTIVE_CHANGED'].includes(e.code))
          throw e;
      }
    }
    const p=await updGet('pending');
    if(!p){
      updSet('error',{err:'The downloaded update is missing — download it again',
                      retryDownload:false});
      return;
    }
    if(!updSamePending(p,expected)){
      updSet('error',{err:'The downloaded update changed — review it before installing',
                      retryDownload:false});
      return;
    }
    if(!updPendingForChannel(p)){
      updSet('error',{err:'The downloaded update belongs to a different channel',
                      retryDownload:false});
      return;
    }
    /* This is a two-phase install. Keep `pending` until the patched build has
       rendered its first frame; otherwise a failed start destroys the only
       retryable copy and collapses the panel back to GAME VERSION. */
    await updRefreshSharedOperation(lease);
    await updCommitApply(p,lease,expected,running,preparedPrevious);
    promoted=true;
    /* `probation` and `active` were committed atomically above. Probation is
       the record that arms automatic rollback, so there can no longer be a
       process-death gap with new active bytes and no failed-start detector.

       The referenced rollback slot remains best-effort. It is a THIRD full
       copy - `pending`, `active` and rollback are about 85 MB each on the current
       full channel, roughly 255 MB of durable capacity - but active is copied
       before pending is read, so Apply never holds all three payload objects in
       JavaScript. Losing the optional rollback copy costs a revert path; it
       never costs the install. */
    /* Preserve a prior failed-start count when retrying the same bytes. The
       boot loader quarantines the patch after two failures; clearing the count
       here previously made every attempt look like the first one forever. A
       fresh verified download resets the record in updDownload instead. */
    reload=true;
  }catch(e){
    const changed=e&&['MF_UPDATE_OPERATION_BUSY','MF_UPDATE_OPERATION_CHANGED',
      'MF_UPDATE_PENDING_CHANGED','MF_UPDATE_CHANNEL_CHANGED',
      'MF_UPDATE_INSTALL_ACTIVE','MF_UPDATE_ACTIVE_CHANGED',
      'MF_UPDATE_PREVIOUS_CHANGED'].includes(e.code);
    if(changed)
      updSet('error',{err:(e&&e.message)||'The downloaded update changed — check again',
                      retryDownload:false});
    else updSet('applyError',{err:'Could not prepare the update — retry install'});
  }finally{
    if(preparedPrevious&&!promoted)
      try{ await updClearPreviousOwned(preparedPrevious,lease); }catch(e){}
    if(lease){ try{ await updReleaseSharedOperation(lease); }catch(e){} }
  }
  if(reload) setTimeout(updHardReload,120); // let RESTARTING paint before navigation
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
  if(updOperationBusy()) return;
  /* Rollback deletes pending and rewrites active. Lock it before the first IDB
     read so it cannot race a download's atomic pending transaction or Apply. */
  updSet('rollingBack',{err:null,pct:100});
  let lease=null,reload=false;
  try{
    const running=updRunningIdentity();
    lease=await updAcquireSharedOperation('rollback',running);
    await updRefreshSharedOperation(lease);
    await updCommitRollback(lease,running);
    /* Mark only after the durable rollback commits. The captured running
       version survives the record transition, while a failed transaction must
       not leave history claiming the player reverted a build they still run. */
    if(running) updLogMark(running.version,{rolledBack:true});
    reload=true;
  }catch(e){
    const changed=e&&['MF_UPDATE_OPERATION_BUSY','MF_UPDATE_OPERATION_CHANGED',
      'MF_UPDATE_ACTIVE_CHANGED'].includes(e.code);
    updSet('error',{err:changed?e.message:'Could not revert the update — try again',
                    retryDownload:false});
  }finally{
    if(lease){ try{ await updReleaseSharedOperation(lease); }catch(e){} }
  }
  if(reload) updHardReload();
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
function updValidFile(f){
  return !!(f&&typeof f.path==='string'&&typeof f.sha256==='string'&&
            /^[0-9a-f]{64}$/i.test(f.sha256)&&Number.isFinite(f.size)&&f.size>0);
}
/* A `full` entry must carry an ABSOLUTE url of its own, and this is not
   pedantry. updDownload resolves a bare path as `base + f.path` using the
   manifest's single `base` prefix, which on a patch manifest points at the
   PATCH's folder - the one place the complete payload is guaranteed not to be.
   A full entry without its own url would therefore 404, or worse fetch a
   same-named delta artifact. Requiring the url here rejects that manifest
   before a byte moves. */
function updValidFullFile(f){
  /* startsWith, not a regex. Three patch scripts in a row have silently eaten
     the backslashes out of an emitted regex literal; the previous version of
     this line landed as /^https?:///i, which JS reads as the regex /^https?:/
     followed by a // comment - leaving a truthy RegExp as the final operand,
     so it accepted every url including relative ones. String methods cannot
     fail that way. */
  if(!updValidFile(f)||typeof f.url!=='string') return false;
  const u=f.url.toLowerCase();
  return u.startsWith('https://')||u.startsWith('http://');
}
/* Accepts a single entry OR a list. It has to accept a list: once the payload
   ships as N per-file artifacts, a COMPLETE build is N entries, and the
   fallback exists precisely to deliver a complete build. Returns null rather
   than a partial set - half a payload is worse than none. */
function updFullEntry(m){
  const f=m&&m.full;
  if(Array.isArray(f)) return (f.length&&f.every(updValidFullFile))?f.slice():null;
  return updValidFullFile(f)?[f]:null;
}
function updPendingForChannel(p){
  if(!p) return false;
  const channel=updChannelName(p.channel||'stable');
  return channel===updChannel()||(updPreviewFellBack&&channel==='stable');
}

/* ---- MATCH RUNTIME COMPATIBILITY -----------------------------------------
   Multiplayer may only compare the bytes this document is actually running.
   APP_VERSION, a Git revision, or the source manifest can all agree while the
   packaged/OTA executable bytes differ, so none of those are hash fallbacks.
   Success is deliberately the exact public triplet accepted by matchmaking;
   every provenance or validation failure rejects with a stable error code. */
const MF_RUNTIME_COMPAT_PATH='./assets/data/runtime-compatibility.json';
const MF_RUNTIME_COMPAT_SCHEMA='massfront.runtime-compatibility';
const MF_RUNTIME_COMPAT_VERSION_RE=/^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}(?:-[a-z0-9](?:[a-z0-9.-]{0,30}[a-z0-9])?)?$/i;
const MF_RUNTIME_COMPAT_HASH_RE=/^[a-f0-9]{64}$/;
const MF_RUNTIME_COMPAT_CACHE=new Map();

function mfRuntimeCompatibilityFailure(code,message,source){
  const e=new Error(message);
  e.name='MassfrontRuntimeCompatibilityError';
  e.code=code;
  e.source=source||'runtime';
  return e;
}
function mfRuntimeCompatibilityVersionNewer(a,b){
  const parse=value=>{
    const text=String(value),dash=text.indexOf('-');
    return {core:(dash<0?text:text.slice(0,dash)).split('.').map(Number),
      pre:dash<0?null:text.slice(dash+1).split('.')};
  };
  const x=parse(a),y=parse(b);
  for(let i=0;i<3;i++) if(x.core[i]!==y.core[i]) return x.core[i]>y.core[i];
  if(x.pre===null||y.pre===null) return x.pre===null&&y.pre!==null;
  for(let i=0;i<Math.max(x.pre.length,y.pre.length);i++){
    if(x.pre[i]===y.pre[i]) continue;
    if(x.pre[i]==null||y.pre[i]==null) return y.pre[i]==null;
    const xn=/^[0-9]+$/.test(x.pre[i]),yn=/^[0-9]+$/.test(y.pre[i]);
    if(xn&&yn) return Number(x.pre[i])>Number(y.pre[i]);
    if(xn!==yn) return !xn;
    return x.pre[i]>y.pre[i];
  }
  return false;
}
function mfRuntimeCompatibilityState(){
  const w=typeof window!=='undefined'?window:null;
  const raw=w&&w.__MASSFRONT_PATCHED;
  if(raw!=null&&String(raw)!==''){
    const version=String(raw);
    if(!MF_RUNTIME_COMPAT_VERSION_RE.test(version)||
       !mfRuntimeCompatibilityVersionNewer(version,APP_VERSION))
      return {kind:'invalid',version,key:'invalid:'+version};
    return {kind:'ota',version,key:'ota:'+version+':'+String(w.__MASSFRONT_PATCH_AT||'')+
      ':'+String(w.__MASSFRONT_PATCH_CHANNEL||'stable')};
  }
  return {kind:'packaged',version:APP_VERSION,key:'packaged:'+APP_VERSION};
}
function mfRuntimeCompatibilityValidate(raw,state){
  const source=state.kind;
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
     raw.schema!==MF_RUNTIME_COMPAT_SCHEMA||raw.schemaVersion!==1)
    throw mfRuntimeCompatibilityFailure('MF_RUNTIME_COMPATIBILITY_MALFORMED',
      'Runtime compatibility metadata has an unsupported schema.',source);
  if(typeof raw.buildVersion!=='string'||
     !MF_RUNTIME_COMPAT_VERSION_RE.test(raw.buildVersion))
    throw mfRuntimeCompatibilityFailure('MF_RUNTIME_COMPATIBILITY_MALFORMED',
      'Runtime compatibility metadata has an invalid build version.',source);
  if(raw.buildVersion!==state.version)
    throw mfRuntimeCompatibilityFailure('MF_RUNTIME_COMPATIBILITY_STALE',
      'Runtime compatibility metadata does not describe the executing build.',source);
  if(typeof raw.manifestHash!=='string'||
     !MF_RUNTIME_COMPAT_HASH_RE.test(raw.manifestHash)||
     typeof raw.balanceHash!=='string'||
     !MF_RUNTIME_COMPAT_HASH_RE.test(raw.balanceHash))
    throw mfRuntimeCompatibilityFailure('MF_RUNTIME_COMPATIBILITY_MALFORMED',
      'Runtime compatibility metadata requires lowercase SHA-256 roots.',source);
  return Object.freeze({buildVersion:raw.buildVersion,
    manifestHash:raw.manifestHash,balanceHash:raw.balanceHash});
}
async function mfRuntimeCompatibilityLoad(state){
  let raw;
  if(state.kind==='ota'){
    raw=typeof window!=='undefined'?window.__MASSFRONT_RUNTIME_COMPATIBILITY:null;
    if(raw==null)
      throw mfRuntimeCompatibilityFailure('MF_RUNTIME_COMPATIBILITY_UNAVAILABLE',
        'The executing OTA did not provide runtime compatibility metadata.','ota');
  }else{
    let response;
    try{ response=await fetch(MF_RUNTIME_COMPAT_PATH,{cache:'no-store'}); }
    catch(e){
      throw mfRuntimeCompatibilityFailure('MF_RUNTIME_COMPATIBILITY_UNAVAILABLE',
        'Packaged runtime compatibility metadata could not be loaded.','packaged');
    }
    if(!response||!response.ok)
      throw mfRuntimeCompatibilityFailure('MF_RUNTIME_COMPATIBILITY_UNAVAILABLE',
        'Packaged runtime compatibility metadata is missing.','packaged');
    try{ raw=await response.json(); }
    catch(e){
      throw mfRuntimeCompatibilityFailure('MF_RUNTIME_COMPATIBILITY_MALFORMED',
        'Packaged runtime compatibility metadata is not valid JSON.','packaged');
    }
  }
  return mfRuntimeCompatibilityValidate(raw,state);
}
async function mfRuntimeCompatibility(){
  const state=mfRuntimeCompatibilityState();
  if(state.kind==='invalid')
    throw mfRuntimeCompatibilityFailure('MF_RUNTIME_COMPATIBILITY_PATCH_STATE_INVALID',
      'The active patch identity is invalid or not newer than the packaged build.','ota');
  let pending=MF_RUNTIME_COMPAT_CACHE.get(state.key);
  if(!pending){
    pending=mfRuntimeCompatibilityLoad(state);
    MF_RUNTIME_COMPAT_CACHE.set(state.key,pending);
    while(MF_RUNTIME_COMPAT_CACHE.size>2)
      MF_RUNTIME_COMPAT_CACHE.delete(MF_RUNTIME_COMPAT_CACHE.keys().next().value);
    pending.catch(()=>{
      if(MF_RUNTIME_COMPAT_CACHE.get(state.key)===pending)
        MF_RUNTIME_COMPAT_CACHE.delete(state.key);
    });
  }
  const value=await pending;
  if(mfRuntimeCompatibilityState().key!==state.key)
    throw mfRuntimeCompatibilityFailure('MF_RUNTIME_COMPATIBILITY_RUNTIME_CHANGED',
      'The executing runtime changed while compatibility was being read.',state.kind);
  return value;
}
if(typeof window!=='undefined') window.mfRuntimeCompatibility=mfRuntimeCompatibility;
/* ---- END MATCH RUNTIME COMPATIBILITY ------------------------------------- */

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
function updKindForFiles(files){
  const bytes=(files||[]).reduce((a,f)=>a+(f.size||0),0);
  if(bytes<=2*1024*1024) return 'hotfix';
  if(bytes<=20*1024*1024) return 'content';
  return 'overhaul';
}
function updKind(m){
  if(!m) return null;
  const declared=String(m.kind||'').toLowerCase();
  if(UPD_KINDS[declared]) return declared;
  return updKindForFiles(m.files||[]);
}
function updKindLabel(m){ const k=updKind(m); return k?UPD_KINDS[k]:null; }
function updWants(){
  return UPD.state==='channeling'||UPD.state==='available'||UPD.state==='downloading'||
         UPD.state==='staging'||UPD.state==='ready'||UPD.state==='applying'||
         UPD.state==='rollingBack'||UPD.state==='applyError'||
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
        if(updOperationBusy()) return;
        if(b.dataset.channel===updChannel()) return;
        if(typeof sfx==='function') sfx('ui');
        if(await updSetChannel(b.dataset.channel)===false) return;
        updSet('idle',{checkedVersion:null,source:null,err:null,channel:updChannel()});
        updCheck(true);
      };
      if(typeof mfBindTap==='function') mfBindTap(b,go); else b.addEventListener('click',go);
    }
    const bar=document.getElementById('updBarO');
    panel.insertBefore(row,bar||null);
  }
  /* Driven by configuration, not hardcoded: the moment update-config.json
     carries a channels.preview endpoint, this button stops apologising. */
  const previewLive=!!(updChannelUrls&&updChannelUrls.preview);
  const locked=updOperationBusy();
  for(const b of row.querySelectorAll('button')){
    if(b.dataset.channel==='preview'){
      b.textContent=previewLive?'PREVIEW':'PREVIEW · SOON';
      b.style.opacity=previewLive?'1':'.55';
      b.setAttribute('aria-label',previewLive
        ?'Preview channel: early builds, ahead of stable'
        :'Preview channel: no preview build has been published; you will stay on stable');
    }
    const on=b.dataset.channel===updChannel();
    b.disabled=locked;
    b.setAttribute('aria-disabled',locked?'true':'false');
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
  channeling:['busy','Switching update channel…'],
  checking:['busy','Checking for updates…'],
  available:['warn','Update available'],
  downloading:['busy','Downloading update…'],
  staging:['busy','Saving verified update…'],
  rollingBack:['busy','Reverting update…'],
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
  const roll=document.getElementById('updRoll');
  const notes=document.getElementById('updNotes');
  /* Every one of these was dereferenced unguarded. One missing node — which is
     exactly what a menu rewrite produces — threw inside initUpdater and took
     the rest of the boot wiring down with it. */
  if(!bar||!txt||!sub||!btn) return;
  const m=UPD.manifest;
  /* Belt and braces for the same class of fault: 'available' and 'ready' are
     the only two arms that dereference the manifest, so never enter them
     without one. Rendering the neutral version line is recoverable; throwing
     out of the renderer takes every caller down with it. */
  const st=(!m&&(UPD.state==='available'||UPD.state==='ready'))?'idle':UPD.state;
  const channel=(m&&m.channel)||UPD.channel||updChannel();
  if(cancel) cancel.style.display=UPD.state==='downloading'&&UPD.abort?'block':'none';
  if(notes){
    notes.style.display=(UPD.state==='available'||UPD.state==='ready')&&m&&m.notes?'block':'none';
    if(m&&m.notes) notes.textContent=m.notes;
  }
  const operationBusy=updOperationBusy();
  if(roll){
    roll.disabled=operationBusy;
    roll.setAttribute('aria-disabled',operationBusy?'true':'false');
  }
  el.classList.toggle('busy',operationBusy);
  el.classList.toggle('good',UPD.state==='ready'||UPD.state==='installed');
  el.classList.toggle('mini',!(updOpen||updWants()));
  if(channelRow) channelRow.style.display=el.classList.contains('mini')?'none':'grid';
  switch(st){
    case 'channeling':
      txt.textContent='SWITCHING UPDATE CHANNEL';
      sub.textContent='Resolving the selected local channel';
      bar.style.width='8%'; btn.textContent='…'; btn.disabled=true; break;
    case 'checking':
      txt.textContent='CHECKING FOR UPDATES';
      sub.textContent='v'+updVerShown;
      bar.style.width='12%'; btn.textContent='…'; btn.disabled=true; break;
    case 'available':{
      const K=UPD.offerKind?UPD_KINDS[UPD.offerKind]:updKindLabel(m);
      const bytes=Number.isFinite(UPD.offerBytes)?UPD.offerBytes:
        m.files.reduce((s,f)=>s+(f.size||0),0);
      txt.textContent=K?('UPDATE AVAILABLE  ·  '+K.nm):'UPDATE AVAILABLE';
      sub.textContent='v'+updVerShown+'  →  v'+m.version+'   ·   '+
        (UPD.offerFallback?'FULL FALLBACK · ':'')+fmtBytes(bytes)+
        '   ·   '+String(channel).toUpperCase()+(m.severity?' / '+String(m.severity).toUpperCase():'');
      bar.style.width='0%'; btn.textContent='DOWNLOAD'; btn.disabled=false; break; }
    case 'downloading':{
      const KD=UPD.transferKind?UPD_KINDS[UPD.transferKind]:updKindLabel(m);
      txt.textContent='DOWNLOADING  '+UPD.pct.toFixed(0)+'%'+(KD?('  ·  '+KD.nm):'');
      const sp=UPD.rate? '  ·  '+fmtBytes(UPD.rate)+'/s' : '';
      sub.textContent=fmtBytes(UPD.got)+' of '+fmtBytes(UPD.total)+sp;
      bar.style.width=UPD.pct.toFixed(1)+'%'; btn.textContent='…'; btn.disabled=true; break; }
    case 'staging':
      txt.textContent='SAVING VERIFIED UPDATE';
      sub.textContent='Finishing one safe on-device transaction';
      bar.style.width='100%'; btn.textContent='…'; btn.disabled=true; break;
    case 'rollingBack':
      txt.textContent='REVERTING UPDATE';
      sub.textContent='Restoring the last validated local build';
      bar.style.width='100%'; btn.textContent='…'; btn.disabled=true; break;
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
      bar.style.width='0%'; btn.textContent=UPD.retryDownload?'RETRY DOWNLOAD':'RETRY'; btn.disabled=false; break;
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
  /* Same guard as the renderer: 'available' without a manifest is a state we
     should never be in, and updDownload() silently returns on one, so route it
     to a fresh check instead of giving the player a button that does nothing. */
  if(UPD.state==='available'&&UPD.manifest) updDownload();
  else if(UPD.state==='error'&&UPD.retryDownload&&UPD.manifest) updDownload();
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
  const pend=await updGetBundleMeta('pending');
  const previous=await updGetRollbackMeta();
  const fail=await updGet('applyFailure');
  const pendingHere=updPendingForChannel(pend);
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
  } else if(pendingHere&&fail&&fail.version===pend.version&&verNewer(pend.version,updVerShown)){
    UPD.manifest={version:pend.version,notes:pend.notes,files:[],
                  channel:pend.channel||'stable',severity:pend.severity||'recommended'};
    updSet('applyError',{err:fail.reason||'Downloaded update kept safely — retry install',
                         readyIdentity:updPendingIdentity(pend)});
  } else if(pendingHere&&verNewer(pend.version,updVerShown)){
    UPD.manifest={version:pend.version,notes:pend.notes,files:[],
                  channel:pend.channel||'stable',severity:pend.severity||'recommended'};
    updSet('ready',{readyIdentity:updPendingIdentity(pend)});
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
  /* The quiet launch check lives in the 1400ms timer above and NOWHERE ELSE.
     A second copy used to sit here on a 2500ms timer, so every cold start ran
     the launch check TWICE. updLoadManifest is not one request: it sweeps the
     configured endpoint, every configured mirror, the Hugging Face repo API
     and two official URLs, so the duplicate cost up to five extra requests on
     the player's data on every single launch, and the second sweep landed on
     top of whatever state the first had just settled into. The surviving timer
     is also the better of the two: it re-tests netAllowed() when it FIRES,
     rather than reading it once at wiring time. */
}
