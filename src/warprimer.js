;
;
/* ============================================================================
   WAR TABLE PRIMER — first-run orientation for the deployment route
   ----------------------------------------------------------------------------
   KEEL (src/tutorial.js) teaches the battlefield. Nothing taught the screen
   the player has to get through BEFORE a battlefield exists: the war table's
   galaxy -> system -> planet -> region -> deploy chain. A new commander who
   opens it sees four stars, three of them locked, and no explanation of what
   a "region" is or why there are twelve sites; the stepper across the top
   names the five stages but not what any of them are for.

   This module walks that chain once. It is deliberately NOT part of KEEL:

     * KEEL is gated on live match state and only exists inside a drop. The
       war table is a front screen with no match, no units and no sim to read.
     * KEEL's panel is fixed-position HUD chrome. On this screen a floating
       card would have to fight the stage stepper, the mode contract row and
       the footer dock for the same narrow phone lane, and lose.

   So the card is inserted INTO the active stage panel as its first child. It
   scrolls with the content it describes, can never overlap chrome, and needs
   no z-index or pointer-events rules at all. galaxyui.js rebuilds the system,
   planet and region panels with innerHTML on every stage change, which would
   delete the card — so the poll below re-inserts it whenever it has gone
   missing, the same self-healing pattern tutorial.js uses to keep its card
   alive across renderOps().

   galaxyui.js is not rewritten. A one-line stage hook (wtpOnStage) plus a
   takeover of openPlanetarySetup let this file compact the lecture after
   Training and keep the two must-see cards alive across SKIP GUIDE.
   ============================================================================ */
(function(){

/* ---------------------------------------------------------------------------
   THE SCRIPT — one card per stage, in the order the route walks them. Copy
   names the real controls and the real numbers the screen prints ("TAP AN
   UNLOCKED STAR", "4 REGIONS · 12 SITES", "3 BATTLEFIELD SITES") so the card
   and the panel underneath it can never disagree.
   --------------------------------------------------------------------------- */
var PRIMER_VERSION=2;
var STAGES=[
 { id:'galaxy', nm:'GALAXY',
   tx:'Sombrero-I is the only open star. Andromeda, Orion and Helios stay locked — tap a locked chip and you remain on this galaxy, no warp. Drag the hologram, TAP AN UNLOCKED STAR, then ENTER SOMBRERO-I.' },
 { id:'system', nm:'SYSTEM',
   tx:'One playable homeworld; other bodies on the rings are lore, not drops. The dossier reads 4 REGIONS · 12 SITES — clearing them unlocks the next star. Tap the homeworld, then ENTER AELOS.' },
 { id:'planet', nm:'PLANET',
   tx:'The planet splits into four regions, each a different battlefield theme and hazard. Drag the globe or use the chips below it, then tap a region. Locked regions open as neighbouring ones are liberated.' },
 { id:'region', nm:'REGION',
   tx:'Three sites per region, in order: COMPACT (_small, 2.2 km), STANDARD (_medium, 2.6 km), LARGE (_large, 3.2 km). A Standard War Room drop lands on the medium theatre — that is the map the mode is balanced around. Pick STANDARD / medium unless you want the short Compact fight.' },
 { id:'deploy', nm:'DEPLOY',
   tx:'The deployment plan: commander, objective, threat, modifiers and payout, all editable below. START BATTLE sends the carrier — you still pick landing ground, then DEPLOY BASE HERE. In the drop the HUD pop counter reads n/500; every allied commander shares that faction-wide cap.' }
];
var CLOSER='That is the route. Twelve sites per system, and the next star opens when the last one falls.';
/* The two facts a first Standard visit must still teach after Training or
   SKIP GUIDE. Optional stages (system / planet / deploy) may be dropped. */
var MUST_SEE=['galaxy','region'];

/* ---------------------------------------------------------------------------
   STATE — rides the existing profile save, like META.tutorial does. This
   module never writes its own storage blob.
   --------------------------------------------------------------------------- */
function primerMeta(){
  if(typeof META==='undefined'||!META) return {done:false,version:0,seen:{}};
  META.warPrimer=META.warPrimer||{done:false,version:0,seen:{}};
  if(!META.warPrimer.seen) META.warPrimer.seen={};
  return META.warPrimer;
}
function isMust(id){
  return MUST_SEE.indexOf(id)>=0;
}
function mustPending(){
  var M=primerMeta();
  for(var i=0;i<MUST_SEE.length;i++) if(!M.seen[MUST_SEE[i]]) return true;
  return false;
}
function markSeen(id){
  var M=primerMeta();
  M.seen=M.seen||{};
  if(id) M.seen[id]=true;
}
function markOptionalSeen(){
  var M=primerMeta(),changed=false,i,id;
  M.seen=M.seen||{};
  for(i=0;i<STAGES.length;i++){
    id=STAGES[i].id;
    if(!isMust(id)&&!M.seen[id]){ M.seen[id]=true; changed=true; }
  }
  return changed;
}
function trainedCareer(){
  /* Training / KEEL skip never open the war table. Compact to must-see so
     Standard is not a five-card lecture after the field guide. */
  if(typeof META==='undefined'||!META||!META.tutorial) return false;
  var T=META.tutorial;
  return !!(T.done||T.skipped);
}
function ensureMustSeeRoute(persist){
  /* A prior SKIP GUIDE set done without recording the two facts. Re-open
     only those cards — do not rebuild the five-stage lecture. Replay sets
     forceFull so a Training graduate can still walk all five on purpose. */
  var M=primerMeta(),changed=false;
  if(M.forceFull) return false;
  if(mustPending()&&(M.done||trainedCareer())) changed=markOptionalSeen();
  if(changed&&persist&&typeof metaSave==='function') metaSave();
  return changed;
}
function unseenLeft(){
  var M=primerMeta(),i;
  for(i=0;i<STAGES.length;i++) if(!M.seen[STAGES[i].id]) return true;
  return false;
}
function visibleCount(id){
  var M=primerMeta(),n=0,at=0,i,sid;
  for(i=0;i<STAGES.length;i++){
    sid=STAGES[i].id;
    if(M.seen&&M.seen[sid]&&sid!==id) continue;
    n++;
    if(sid===id) at=n;
  }
  return {at:at,n:n,last:at===n};
}
function armed(){
  ensureMustSeeRoute(false);
  if(mustPending()) return true;
  var M=primerMeta();
  return !M.done||(M.version|0)<PRIMER_VERSION;
}
function finish(){
  var M=primerMeta(),i;
  M.done=true; M.version=PRIMER_VERSION; M.forceFull=false;
  M.seen=M.seen||{};
  /* finish() is the end of the route, never a skip. Must-see are already
     seen when we get here; stamp the rest so a later load does not revive them. */
  for(i=0;i<STAGES.length;i++) M.seen[STAGES[i].id]=true;
  if(typeof metaSave==='function') metaSave();
  var card=document.getElementById('wtpCard');
  if(card) card.remove();
  if(typeof sfx==='function'){ try{ sfx('ui'); }catch(e){} }
  if(typeof renderSettings==='function'&&shown(document.getElementById('settingsScr'))) renderSettings();
}
function replay(){
  var M=primerMeta();
  M.done=false; M.version=0; M.seen={}; M.forceFull=true;
  if(typeof metaSave==='function') metaSave();
  if(typeof sfx==='function'){ try{ sfx('ui'); }catch(e){} }
  if(typeof running!=='undefined'&&running){ if(typeof toast==='function') toast('War table primer armed — it shows on the next deployment'); }
  else if(typeof showFrontScreen==='function') showFrontScreen('setupScr');
  if(typeof renderSettings==='function') renderSettings();
}

/* ---------------------------------------------------------------------------
   PLACEMENT
   --------------------------------------------------------------------------- */
function shown(el){
  if(!el||!el.isConnected) return false;
  var s=getComputedStyle(el);
  if(s.display==='none'||s.visibility==='hidden') return false;
  var r=el.getBoundingClientRect();
  return r.width>1&&r.height>1;
}
function activePanel(){
  var scr=document.getElementById('setupScr');
  if(!shown(scr)) return null;
  var list=scr.querySelectorAll('.mfStagePanel.on');
  for(var i=0;i<list.length;i++) if(shown(list[i])) return list[i];
  return null;
}
function stageIdx(id){
  for(var i=0;i<STAGES.length;i++) if(STAGES[i].id===id) return i;
  return -1;
}
function dismissStage(){
  /* GOT IT hides THIS stage only. The old DISMISS called finish() and wiped
     the rest of the route — so a player who cleared the galaxy card to see
     the hologram never learned that Standard is the medium theatre. */
  var panel=activePanel(),id=panel&&panel.dataset.stage;
  markSeen(id);
  if(!unseenLeft()){ finish(); return; }
  if(typeof metaSave==='function') metaSave();
  var card=document.getElementById('wtpCard');
  if(card) card.remove();
  if(typeof sfx==='function'){ try{ sfx('ui'); }catch(e){} }
}
function skipGuide(){
  /* SKIP GUIDE drops the optional lecture. It must not stamp done until the
     two must-see cards have actually been on screen — otherwise SKIP on
     galaxy erases the medium-theatre card. */
  var panel=activePanel(),id=panel&&panel.dataset.stage;
  markSeen(id);
  markOptionalSeen();
  if(!mustPending()){ finish(); return; }
  if(typeof metaSave==='function') metaSave();
  var card=document.getElementById('wtpCard');
  if(card) card.remove();
  if(typeof sfx==='function'){ try{ sfx('ui'); }catch(e){} }
}
function build(S,idx,last){
  var vis=visibleCount(S.id);
  var d=document.createElement('aside');
  d.id='wtpCard';
  d.className='wtpCard'+(last?' wtpLast':'');
  d.dataset.stage=S.id;
  d.setAttribute('aria-label','War table orientation');
  d.innerHTML='<header><span>WAR TABLE ORIENTATION</span><b>'+vis.at+' / '+vis.n+' · '+S.nm+'</b></header>'
    +'<p>'+S.tx+(last?' '+CLOSER:'')+'</p>'
    +'<div class="wtpFoot"><i>'+STAGES.map(function(q,n){
        return '<em class="'+(n===idx?'on':n<idx?'past':'')+'">'+q.nm+'</em>';
      }).join('<u>›</u>')+'</i>'
    +'<button type="button" class="wtpDone">'+(last?'GOT IT · FINISH':'GOT IT')+'</button>'
    +(last?'':'<button type="button" class="wtpSkip">SKIP GUIDE</button>')+'</div>';
  var b=d.querySelector('.wtpDone');
  /* mfBindTap is the codebase's touch-safe binder; fall back to click so an
     OTA shell that predates it still gets a working dismiss. */
  var doneFn=last?finish:dismissStage;
  if(typeof mfBindTap==='function') mfBindTap(b,doneFn); else b.addEventListener('click',doneFn);
  var sk=d.querySelector('.wtpSkip');
  if(sk){ if(typeof mfBindTap==='function') mfBindTap(sk,skipGuide); else sk.addEventListener('click',skipGuide); }
  return d;
}
function sync(){
  if(!armed()){
    var stale=document.getElementById('wtpCard');
    if(stale) stale.remove();
    return;
  }
  var panel=activePanel();
  if(!panel) return;
  var id=panel.dataset.stage,idx=stageIdx(id);
  if(idx<0) return;
  var M=primerMeta();
  var card=document.getElementById('wtpCard');
  if(M.seen&&M.seen[id]){
    /* Optional stages already skipped still rebuild their panels. Drop a
       leftover must-see card so it cannot ride a hidden galaxy panel. */
    if(card) card.remove();
    return;
  }
  /* Re-insert on ANY of: panel rebuilt beneath us, stage advanced, or the
     card landing in a panel that is no longer the visible one. Comparing the
     rendered stage against the panel's own dataset is what makes a rebuild
     indistinguishable from a stage change here — both are just "the card
     that should be on screen is not". */
  if(card&&card.dataset.stage===id&&card.parentNode===panel) return;
  if(card) card.remove();
  var vis=visibleCount(id);
  panel.insertBefore(build(STAGES[idx],idx,vis.last),panel.firstChild);
}

/* ---------------------------------------------------------------------------
   SETTINGS — one replay row, appended after renderSettings() rebuilds
   #setList. src/game/meta.js replaces that list's entire innerHTML on every
   call, so the row has to be re-appended each time rather than inserted once;
   src/tutorial.js already wraps the same function for its own two rows and
   this wrap simply chains onto that one.
   --------------------------------------------------------------------------- */
function appendPrimerSettingsRow(){
  var list=document.getElementById('setList');
  if(!list||document.getElementById('wtpSetRow')) return;
  var M=primerMeta(),done=!!M.done&&(M.version|0)>=PRIMER_VERSION&&!mustPending();
  var row=document.createElement('div');
  row.className='sItem setRow';
  row.id='wtpSetRow';
  row.setAttribute('role','button');
  row.setAttribute('tabindex','0');
  row.innerHTML='<div class="sTx"><b>🗺 War Table Primer</b><div class="sDs">'
    +(done?'Seen':'Armed for the next visit')
    +' — walks galaxy, system, planet, region and deployment</div></div>'
    +'<div class="sBuy">'+(done?'↺ REPLAY':'ARMED')+'</div>';
  var act=function(ev){ if(ev){ ev.preventDefault(); } if(done) replay(); };
  row.addEventListener('pointerdown',act);
  row.addEventListener('keydown',function(ev){ if(ev.key==='Enter'||ev.key===' ') act(ev); });
  list.appendChild(row);
}
if(typeof renderSettings==='function'&&!window.__wtpSettingsWrapped){
  window.__wtpSettingsWrapped=true;
  var _wtpRenderSettings=renderSettings;
  renderSettings=function(){ _wtpRenderSettings(); appendPrimerSettingsRow(); };
}

/* ---------------------------------------------------------------------------
   BOOT — poll keeps the card alive across galaxyui innerHTML rebuilds. The
   Standard entry wrap (takeover, after initGalaxyUI) and wtpOnStage hook
   make the first paint immediate so SKIP / Training compact is not a 320 ms
   late.
   --------------------------------------------------------------------------- */
function onStandardOpen(){
  ensureMustSeeRoute(true);
  try{ sync(); }catch(e){}
}
function wrapStandardEntry(){
  if(window.__wtpOpenWrapped) return;
  var prev=window.openPlanetarySetup;
  if(typeof prev!=='function') return;
  window.__wtpOpenWrapped=true;
  window.openPlanetarySetup=function(mode){
    var r=prev.apply(this,arguments);
    if(mode==='standard') onStandardOpen();
    return r;
  };
}
function initWarPrimer(){
  if(window.__wtpInit) return;
  window.__wtpInit=true;
  wrapStandardEntry();
  ensureMustSeeRoute(true);
  setInterval(function(){ try{ sync(); }catch(e){ if(window.console) console.error('war primer',e); } },320);
}
window.initWarPrimer=initWarPrimer;
window.wtpEnsureMustSee=function(){ return ensureMustSeeRoute(true); };
window.wtpOnStage=function(){ try{ sync(); }catch(e){} };
/* Read-only inspection handle for verification scripts, matching the
   __tutDebug hook src/tutorial.js already exposes. */
window.__wtpDebug=function(){ return {STAGES:STAGES,MUST_SEE:MUST_SEE,armed:armed(),
  mustPending:mustPending(),trained:trainedCareer(),meta:primerMeta(),
  stage:(activePanel()||{dataset:{}}).dataset.stage||'',
  finish:finish,replay:replay,skipGuide:skipGuide}; };


/* SELF-INITIALISE. src/main.js (manifest index 68) lists initWarPrimer in the
   init loop it runs from boot(), but this file is index 73 - so the function
   did not exist yet and was SKIPPED IN SILENCE, exactly like initGalaxyUI. The
   war primer has been dead in every build for the same reason, and nobody
   noticed because nothing errored. Found by the new init-order gate in
   tools/bundle.mjs on its very first run.
   Safe here: __wtpInit makes it idempotent, and this file loads AFTER
   src/galaxyui.js (71), which is the ordering its own wrapStandardEntry
   comment requires. */
try{ initWarPrimer(); }catch(e){ if(window.console) console.error('initWarPrimer threw',e); }
})();
