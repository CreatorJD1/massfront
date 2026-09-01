;
;
/* ============================================================================
   OFFLINE
   ----------------------------------------------------------------------------
   MASSFRONT is a single-player game that grew some online services. That order
   matters: the services are additions, and none of them may become a condition
   of playing. A player on a plane, on a dead signal, or who simply does not
   want the game talking to anything, gets the whole game.

   Everything needed to play is already in the installer — terrain generation is
   procedural, the unit and item art is bundled, and the soundtrack ships inside
   the build. What remains are four optional network callers:

     updater      checks for patches            src/updater.js
     asset packs  downloads extra media         src/assetpack.js
     accounts     register / sign in / sync     src/authportal.js
     ad boards    would fetch remote creatives  src/adboards.js

   This file is the single gate all four ask before reaching the network, so the
   answer is decided in one place rather than four. `netAllowed()` is false when
   the player has chosen offline, and ALSO when the browser reports itself
   offline — a request that cannot succeed should not be attempted, because the
   failure path costs a visible error and a timeout the player has to sit
   through.

   The design rule for every caller is: no network is a NORMAL state, not an
   error. Nothing here retries in a loop, nothing blocks a frame, and nothing
   shows a failure for a request it should never have made.
   ============================================================================ */

const NET = { forced:false, online:true };

/* Offline is a per-device choice, not per-profile: it describes where the phone
   is, not who is playing. */
const NET_KEY = 'massfront_offline';

/* Delivery diagnostics must be readable on the phone itself. Console-only
   evidence is not useful when an install, storage, or renderer failure happens
   away from a development machine. Keep the captured list short and never put
   account or request data in it. */
const MF_PLATFORM_ERRORS=[];
function mfPlatformRememberError(kind, value){
  const msg=String(value&&value.message||value||'unknown').slice(0,500);
  MF_PLATFORM_ERRORS.push({at:new Date().toISOString(),kind:kind,message:msg});
  if(MF_PLATFORM_ERRORS.length>12) MF_PLATFORM_ERRORS.shift();
}
function mfPwaInstalled(){
  try{
    return !!((window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)
      ||navigator.standalone===true);
  }catch(e){ return false; }
}
function mfPwaIOS(){
  try{ return /iphone|ipad|ipod/i.test(navigator.userAgent)
    ||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1); }
  catch(e){ return false; }
}
function mfTextureFamilyDiag(){
  if(typeof gl==='undefined'||!gl) return {preferred:'unavailable',atlas:'not initialized'};
  const has=n=>{ try{ return !!gl.getExtension(n); }catch(e){ return false; } };
  const preferred=has('WEBGL_compressed_texture_astc')?'ASTC 4x4'
    :has('EXT_texture_compression_bptc')?'BC7'
    :has('WEBGL_compressed_texture_etc')?'ETC2':'RGBA32';
  const ready=(typeof matCmpAlbedo!=='undefined'&&!!matCmpAlbedo)
    ||(typeof matCmpNormal!=='undefined'&&!!matCmpNormal)
    ||(typeof matCmpOrm!=='undefined'&&!!matCmpOrm);
  return {preferred:preferred,compressedAtlasLoaded:ready};
}
function mfDiagAwait(promise, ms){
  return Promise.race([Promise.resolve(promise),new Promise(resolve=>setTimeout(()=>resolve(null),ms||2500))]);
}
async function mfPlatformDiagnostics(){
  const storage={supported:!!(navigator.storage&&navigator.storage.estimate)};
  if(storage.supported){
    try{
      const est=await mfDiagAwait(navigator.storage.estimate(),2500);
      if(!est) throw new Error('storage estimate timed out');
      storage.usage=est.usage||0; storage.quota=est.quota||0;
      storage.usageMiB=Math.round((storage.usage/1048576)*10)/10;
      storage.quotaMiB=Math.round((storage.quota/1048576)*10)/10;
    }catch(e){ storage.error=String(e&&e.message||e); }
    try{ storage.persisted=await mfDiagAwait(navigator.storage.persisted(),2500); }catch(e){}
  }
  const serviceWorker=Object.assign({},window.__mfPwaDiag||{supported:false});
  try{
    if(navigator.serviceWorker){
      serviceWorker.controlled=!!navigator.serviceWorker.controller;
      const reg=await mfDiagAwait(navigator.serviceWorker.getRegistration('./'),2500);
      serviceWorker.registered=!!reg;
      serviceWorker.scope=reg&&reg.scope||serviceWorker.scope||null;
    }
  }catch(e){ serviceWorker.inspectError=String(e&&e.message||e); }
  let cacheNames=[];
  try{ if(typeof caches!=='undefined') cacheNames=(await mfDiagAwait(caches.keys(),2500))||[]; }catch(e){}
  const version=(typeof updRunningVersion==='function')?updRunningVersion()
    :((typeof APP_VERSION!=='undefined'&&APP_VERSION)||'unknown');
  return {
    capturedAt:new Date().toISOString(),
    location:location.origin+location.pathname,
    version:version,
    ota:{active:!!window.__MASSFRONT_PATCHED,version:window.__MASSFRONT_PATCHED||null,
      channel:window.__MASSFRONT_PATCH_CHANNEL||null},
    network:{browserOnline:navigator.onLine!==false,forcedOffline:!!NET.forced},
    installed:mfPwaInstalled(),
    installPromptAvailable:!!window.__mfPwaInstallEvent,
    serviceWorker:serviceWorker,
    cacheNames:cacheNames,
    storage:storage,
    renderer:(typeof mfGraphicsDiag==='function')?mfGraphicsDiag():'unavailable',
    textureFamily:mfTextureFamilyDiag(),
    shaderErrors:(typeof GL_PROG_ERRORS!=='undefined')?GL_PROG_ERRORS.slice(0,12):[],
    runtimeErrors:MF_PLATFORM_ERRORS.slice()
  };
}
function mfOpenPlatformDiagnostics(){
  let shade=document.getElementById('mfPlatformDiag');
  if(!shade){
    shade=document.createElement('div'); shade.id='mfPlatformDiag';
    shade.setAttribute('role','dialog'); shade.setAttribute('aria-modal','true');
    shade.setAttribute('aria-label','Platform diagnostics');
    shade.style.cssText='position:fixed;inset:0;z-index:100050;background:rgba(1,9,15,.94);padding:max(18px,env(safe-area-inset-top)) 16px max(18px,env(safe-area-inset-bottom));overflow:auto;color:#dff7ff;font:13px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace';
    shade.innerHTML='<div style="max-width:820px;margin:auto"><div style="display:flex;gap:8px;align-items:center;position:sticky;top:0;background:#071823;padding:10px;border:1px solid #24536a"><b style="flex:1;font:700 18px/1.2 system-ui">MASSFRONT diagnostics</b><button data-act="copy">COPY</button><button data-act="refresh">REFRESH</button><button data-act="close">CLOSE</button></div><pre style="white-space:pre-wrap;overflow-wrap:anywhere;background:#031019;border:1px solid #24536a;border-top:0;margin:0;padding:14px;min-height:220px">Collecting…</pre></div>';
    document.body.appendChild(shade);
    shade.querySelector('[data-act="close"]').addEventListener('click',()=>shade.remove());
    shade.querySelector('[data-act="refresh"]').addEventListener('click',()=>mfRefreshPlatformDiagnostics(shade));
    shade.querySelector('[data-act="copy"]').addEventListener('click',async()=>{
      const text=shade.querySelector('pre').textContent;
      try{ await navigator.clipboard.writeText(text); if(typeof toast==='function') toast('Diagnostics copied'); }
      catch(e){ if(typeof toast==='function') toast('Copy unavailable — select the report text'); }
    });
  }
  mfRefreshPlatformDiagnostics(shade);
}
async function mfRefreshPlatformDiagnostics(shade){
  const pre=shade&&shade.querySelector('pre'); if(!pre) return;
  pre.textContent='Collecting…';
  try{ pre.textContent=JSON.stringify(await mfPlatformDiagnostics(),null,2); }
  catch(e){ pre.textContent='Diagnostics failed: '+String(e&&e.message||e); }
}
function mfPwaStatusText(){
  if(mfPwaInstalled()) return {label:'INSTALLED',desc:'Running as an installed app.',on:true};
  if(window.__mfPwaInstallEvent) return {label:'INSTALL',desc:'Install MASSFRONT for fullscreen play and reliable offline startup.',on:true};
  if(mfPwaIOS()) return {label:'HOW TO',desc:'On iPhone or iPad: Share → Add to Home Screen.',on:false};
  if(!window.__mfPwaDiag) return {label:'BROWSER',desc:'Installation requires HTTPS or localhost in a supported browser.',on:false};
  return {label:'WAITING',desc:'The browser will offer installation after its eligibility checks pass.',on:false};
}

function netLoad(){
  try{ NET.forced = localStorage.getItem(NET_KEY) === '1'; }catch(e){}
  NET.online = (typeof navigator === 'undefined') || navigator.onLine !== false;
}
function netAllowed(){
  if(NET.forced) return false;
  return NET.online !== false;
}
/* The two halves of netAllowed() are not equally trustworthy and callers that
   can retry need to tell them apart. NET.forced is the player's own Offline
   Mode switch and is authoritative. NET.online only mirrors navigator.onLine,
   which an Android WebView reports as false while the device is plainly
   connected; gating every attempt on it let one bad flag silently and
   permanently stop a device from ever seeing another update. */
function netForcedOffline(){ return !!NET.forced; }
function netBrowserOffline(){ return NET.online === false; }
function netSetOffline(v){
  NET.forced = !!v;
  try{ localStorage.setItem(NET_KEY, NET.forced ? '1' : '0'); }catch(e){}
  document.body.classList.toggle('offline', NET.forced);
  if(typeof renderSettings === 'function') renderSettings();
  if(typeof packRenderBar === 'function') packRenderBar();
  if(typeof renderUpdatePanel === 'function') renderUpdatePanel();
  if(typeof renderAccount === 'function') renderAccount();
  /* Leaving offline is the moment a queued cloud backup should flush.
     Entering it must not start a request — netAllowed() already refuses. */
  if(!NET.forced && typeof cloudPush === 'function' && typeof CLOUD !== 'undefined' && CLOUD.dirty)
    try{ cloudPush(); }catch(e){}
  if(typeof toast === 'function')
    toast(NET.forced ? '✈ Offline mode — the game never contacts a server'
                     : '☁ Online features enabled');
}

/* A fetch wrapper the online modules use instead of calling fetch directly.
   Two jobs: refuse when offline, and time out. A hanging request is worse than
   a failed one — it leaves a spinner up forever on a captive-portal wifi that
   accepts the connection and then never answers. */
async function netFetch(url, opts){
  if(!netAllowed()) throw new Error('offline');
  const ms = (opts && opts.timeout) || 12000;
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const t = setTimeout(() => { try{ ctl && ctl.abort(); }catch(e){} }, ms);
  try{
    return await fetch(url, Object.assign({}, opts, ctl ? {signal: ctl.signal} : {}));
  } finally { clearTimeout(t); }
}

function initOffline(){
  netLoad();
  /* Trust the events over the initial flag: a phone that regains signal should
     not need a restart to sync, and one that loses it should stop trying. */
  if(typeof window !== 'undefined'){
    window.addEventListener('error',e=>mfPlatformRememberError('error',e.error||e.message));
    window.addEventListener('unhandledrejection',e=>mfPlatformRememberError('promise',e.reason));
    window.addEventListener('online',  () => { NET.online = true;
      if(typeof packRenderBar === 'function') packRenderBar();
      if(typeof renderAccount === 'function') renderAccount();
      if(typeof cloudPush === 'function' && typeof CLOUD !== 'undefined' && CLOUD.dirty)
        try{ cloudPush(); }catch(e){}
    });
    window.addEventListener('offline', () => { NET.online = false;
      if(typeof packRenderBar === 'function') packRenderBar();
      if(typeof renderAccount === 'function') renderAccount();
    });
    window.addEventListener('massfront-pwa-install-ready',()=>{
      if(typeof renderSettings==='function'&&document.getElementById('setList')) renderSettings();
    });
    window.addEventListener('appinstalled',()=>{
      window.__mfPwaInstallEvent=null;
      if(typeof renderSettings==='function'&&document.getElementById('setList')) renderSettings();
    });
  }
  document.body.classList.toggle('offline', NET.forced);

  /* Add the toggle to Settings by wrapping renderSettings rather than editing
     meta.js — same pattern the tutorial uses, so the two do not fight. */
  if(typeof renderSettings === 'function'){
    const base = renderSettings;
    renderSettings = function(){
      base.apply(this, arguments);
      const list = document.getElementById('setList');
      const rows = document.getElementById('setExtraRows')||list;
      if(!list || !rows || list.querySelector('[data-set="offline"]')) return;
      const row = document.createElement('div');
      row.className = 'sItem setRow'; row.dataset.set = 'offline';
      row.innerHTML = '<div class="sTx"><b>✈ Offline Mode</b><div class="sDs">'
        + (NET.forced
            ? 'The game never contacts a server. Everything still plays.'
            : 'When on, the game never contacts a server. Updates and cloud saves stay on this device.')
        + '</div></div><div class="sBuy togB' + (NET.forced ? ' onT' : '') + '">'
        + (NET.forced ? 'ON' : 'OFF') + '</div>';
      const flip = () => {
        netSetOffline(!NET.forced);
        if(typeof sfx === 'function') sfx('ui');
      };
      if(typeof mfBindTap === 'function') mfBindTap(row, flip);
      else row.addEventListener('pointerdown', flip);
      rows.appendChild(row);

      const pwa=mfPwaStatusText(), install=document.createElement('div');
      install.className='sItem setRow'; install.dataset.set='pwaInstall';
      install.tabIndex=0; install.setAttribute('role','button');
      install.innerHTML='<div class="sTx"><b>▣ Install Game</b><div class="sDs">'+pwa.desc
        +'</div></div><div class="sBuy togB'+(pwa.on?' onT':'')+'">'+pwa.label+'</div>';
      const askInstall=async()=>{
        if(mfPwaInstalled()){ if(typeof toast==='function') toast('MASSFRONT is already installed'); return; }
        if(mfPwaIOS()){ if(typeof toast==='function') toast('Tap Share, then Add to Home Screen'); return; }
        if(typeof window.mfRequestPwaInstall!=='function'||!window.__mfPwaInstallEvent){
          if(typeof toast==='function') toast('Install is not available in this browser yet'); return;
        }
        try{ await window.mfRequestPwaInstall(); }catch(e){ mfPlatformRememberError('install',e); }
        if(typeof renderSettings==='function') renderSettings();
      };
      install.addEventListener('click',askInstall);
      install.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); askInstall(); } });
      rows.appendChild(install);

      const diag=document.createElement('div');
      diag.className='sItem setRow'; diag.dataset.set='platformDiag';
      diag.tabIndex=0; diag.setAttribute('role','button');
      diag.innerHTML='<div class="sTx"><b>⌁ Platform Diagnostics</b><div class="sDs">Renderer, texture compression, storage, service worker, OTA version, and runtime errors.</div></div><div class="sBuy togB">OPEN</div>';
      const openDiag=()=>mfOpenPlatformDiagnostics();
      diag.addEventListener('click',openDiag);
      diag.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openDiag(); } });
      rows.appendChild(diag);
    };
  }
  try{
    const q=new URLSearchParams(location.search);
    if(q.get('diag')==='1') setTimeout(mfOpenPlatformDiagnostics,0);
  }catch(e){}
}
