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

function netLoad(){
  try{ NET.forced = localStorage.getItem(NET_KEY) === '1'; }catch(e){}
  NET.online = (typeof navigator === 'undefined') || navigator.onLine !== false;
}
function netAllowed(){
  if(NET.forced) return false;
  return NET.online !== false;
}
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
  }
  document.body.classList.toggle('offline', NET.forced);

  /* Add the toggle to Settings by wrapping renderSettings rather than editing
     meta.js — same pattern the tutorial uses, so the two do not fight. */
  if(typeof renderSettings === 'function'){
    const base = renderSettings;
    renderSettings = function(){
      base.apply(this, arguments);
      const list = document.getElementById('setList');
      if(!list || list.querySelector('[data-set="offline"]')) return;
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
      list.appendChild(row);
    };
  }
}

