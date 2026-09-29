;
;
/* ============================================================================
   STORMPEAK OCEAN TESTER — host launch and return
   ----------------------------------------------------------------------------
   Stormpeak is a sibling WebGL document. This file never imports it and never
   writes career, XP, or save schema. It only opens the isolated theatre and
   restores MASSFRONT Settings or War Room when the tester returns.
   ============================================================================ */
const MF_STORMPEAK_URL='./modules/stormpeak_ocean/index.html';
const MF_STORMPEAK_RETURN_KEY='massfront.stormpeak.return.v1';
let mfStormpeakLaunching=false;

function mfStormpeakAvailable(){
  return window.__MF_BUILD_HAS_STORMPEAK_TESTER===true;
}
function mfStormpeakEnabled(){
  try{ return !!(META&&META.settings&&META.settings.oceanTester); }
  catch(e){ return false; }
}
function mfStormpeakHostUrl(){
  try{
    const url=new URL(location.href);
    url.searchParams.delete('stormpeak');
    url.searchParams.delete('from');
    url.searchParams.delete('nonce');
    url.searchParams.delete('resume');
    return url.pathname+(url.search||'')+(url.hash||'');
  }catch(e){
    return './index.html';
  }
}
function mfStormpeakMintNonce(){
  try{
    if(crypto&&typeof crypto.randomUUID==='function') return crypto.randomUUID();
  }catch(e){}
  return 'sp-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
}
function mfStormpeakWriteTicket(resume){
  const now=Date.now();
  const ticket={
    schemaVersion:1,
    kind:'MassfrontStormpeakReturnV1',
    nonce:mfStormpeakMintNonce(),
    issuedAt:now,
    expiresAt:now+6*60*60*1000,
    hostUrl:mfStormpeakHostUrl(),
    resume:resume==='warScr'?'warScr':'settings'
  };
  const text=JSON.stringify(ticket);
  try{
    sessionStorage.setItem(MF_STORMPEAK_RETURN_KEY,text);
    const stored=JSON.parse(sessionStorage.getItem(MF_STORMPEAK_RETURN_KEY)||'null');
    if(!stored||stored.nonce!==ticket.nonce||stored.kind!==ticket.kind) return null;
    return ticket;
  }catch(e){
    return null;
  }
}
/* Both surfaces that carry this launch are rebuilt from scratch by pollers —
   see updateTrainingEntry() in src/tutorial.js, which calls renderWarRoom()
   whenever the training signature changes. A rebuild mid-launch detaches the
   exact card the player pressed and appends a fresh one, so a busy state pinned
   to that one element silently vanishes, and on the failure path could be left
   stranded on its replacement. Drive it from the latch across every live
   control instead, and re-assert it whenever a surface is rebuilt. */
function mfStormpeakBusy(on){
  const rows=document.querySelectorAll('#mfStormpeakSetOpen,[data-mode="stormpeak"]');
  for(const el of rows){
    el.classList.toggle('is-launching',!!on);
    if(on) el.setAttribute('aria-busy','true');
    else el.removeAttribute('aria-busy');
  }
}
async function mfOpenStormpeakTester(options){
  options=options||{};
  if(mfStormpeakLaunching) return false;
  mfStormpeakLaunching=true;
  const finish=message=>{
    mfStormpeakLaunching=false;
    if(typeof mfLaunchVeilClose==='function') mfLaunchVeilClose();
    mfStormpeakBusy(false);
    if(message&&typeof toast==='function') toast(message);
    return false;
  };
  /* This tap had no feedback at all: the card never changed state, and every
     message above — including the one naming the reason a launch failed — went
     into the notification rail that front screens hide. So an install without
     the module, and a healthy launch that simply takes a few seconds to hand
     over the tab, were indistinguishable from a button wired to nothing.
     Show the working state with the tap, and let finish() take it down. */
  mfStormpeakBusy(true);
  if(typeof mfLaunchVeilOpen==='function') mfLaunchVeilOpen('OCEAN TESTER',
    'Stormpeak theatre is preparing',
    ()=>finish('Ocean Theatre Tester did not open — tap again to retry'));
  if(typeof initAudio==='function') initAudio();
  if(typeof sfx==='function') sfx('ui');
  let target=MF_STORMPEAK_URL;
  if(!mfStormpeakAvailable()){
    let present=false;
    try{
      const r=await fetch(MF_STORMPEAK_URL,{method:'HEAD',cache:'no-store'});
      present=r.ok;
    }catch(e){}
    if(!present){
      /* An installation older than the tester has no packaged document here —
         this is the report that the card "doesn't launch". The closure rides
         this release inside the OTA payload, so write it into native storage
         and open the mounted copy instead of dying on a 404. On a shell with
         no native filesystem (plain web) there is nothing to mount, and the
         reason below now actually reaches the player. */
      let mounted=null;
      try{
        mounted=typeof mfPrepareStormpeakMount==='function'?await mfPrepareStormpeakMount():null;
      }catch(e){ mounted=null; }
      if(!mounted||!mounted.ok||!mounted.openUrl)
        return finish('Ocean Theatre Tester is not installed in this build');
      target=mounted.openUrl;
    }
  }
  const ticket=mfStormpeakWriteTicket(options.resume||'settings');
  if(!ticket) return finish('Ocean tester return route could not be secured');
  try{
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    location.href=target;
    return true;
  }catch(e){
    return finish('Ocean Theatre Tester could not be opened');
  }
}
/* Career-shaped counters without a career contract --------------------------
   The theatre writes its settled outcome to a namespaced sessionStorage key
   (see modules/stormpeak_ocean host-return.ts). Consume it here on return:
   counting runs in META keeps the owner's no-XP/no-save promise intact while
   the War Room card can still say whether the last outing held the region.
   Everything is defensive: an absent key, private-mode storage, or an older
   counter shape all degrade to "no record yet". */
const MF_STORMPEAK_RESULT_KEY='massfront.stormpeak.result.v1';
function mfStormpeakConsumeResult(){
  let rec=null;
  try{ rec=JSON.parse(sessionStorage.getItem(MF_STORMPEAK_RESULT_KEY)||'null'); }catch(e){ rec=null; }
  try{ sessionStorage.removeItem(MF_STORMPEAK_RESULT_KEY); }catch(e){}
  if(!rec||rec.kind!=='MassfrontStormpeakResultV1'||rec.schemaVersion!==1) return null;
  if(rec.outcome!=='victory'&&rec.outcome!=='defeat') return null;
  if(typeof META==='undefined'||!META) return null;
  const s=META.stormpeak||(META.stormpeak={runs:0,wins:0,lastOutcome:null,lastSeconds:0});
  s.runs=(s.runs|0)+1;
  if(rec.outcome==='victory')s.wins=(s.wins|0)+1;
  s.lastOutcome=rec.outcome;s.lastSeconds=rec.seconds|0;s.lastAt=Date.now();
  if(typeof metaSave==='function'){ try{ metaSave(); }catch(e){} }
  return rec;
}
function mfStormpeakRecordText(){
  try{
    const s=META&&META.stormpeak;
    if(!s||!(s.runs>0)) return '';
    return s.wins+' of '+s.runs+' sorties held the region';
  }catch(e){ return ''; }
}
function mfStormpeakResumeHost(){
  let resume='settings', nonce='';
  try{
    const q=new URL(location.href).searchParams;
    if(q.get('from')!=='stormpeak') return false;
    resume=q.get('resume')==='warScr'?'warScr':'settings';
    nonce=q.get('nonce')||'';
  }catch(e){ return false; }
  let ticket=null;
  try{ ticket=JSON.parse(sessionStorage.getItem(MF_STORMPEAK_RETURN_KEY)||'null'); }catch(e){}
  const ok=!!(ticket&&ticket.schemaVersion===1&&ticket.kind==='MassfrontStormpeakReturnV1'
    &&ticket.nonce&&(!nonce||nonce===ticket.nonce)&&Date.now()<=ticket.expiresAt);
  try{ sessionStorage.removeItem(MF_STORMPEAK_RETURN_KEY); }catch(e){}
  try{
    const url=new URL(location.href);
    url.searchParams.delete('from');
    url.searchParams.delete('nonce');
    url.searchParams.delete('resume');
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  }catch(e){}
  if(!ok){
    if(typeof toast==='function') toast('Ocean tester return ticket expired');
    return false;
  }
  /* Galactic Command owns the strategic home and intercepts startScreen/warScr
     by navigating to the UGA document. Forcing the classic Settings or War Room
     open here wins for one frame and is then thrown away by that auto-entry,
     which reads to the player as the return button doing nothing. When UGA is
     the authoritative home, hand the player back to it and only say where they
     came from. */
  const galacticHome=(()=>{
    try{
      const b=window.__MF_GALACTIC_BRIDGE;
      return !!b&&b.classicFallbackActive!==true;
    }catch(e){ return false; }
  })();
  mfStormpeakConsumeResult();
  if(galacticHome){
    if(typeof toast==='function') toast('Ocean Theatre Tester closed — back in MASSFRONT');
    return true;
  }
  if(resume==='warScr'&&typeof openWarRoom==='function'){
    openWarRoom();
    return true;
  }
  if(typeof openSettings==='function'){
    openSettings('menu');
    try{
      if(typeof MF_TAB_STATE!=='undefined') MF_TAB_STATE.setList='system';
      if(typeof renderSettings==='function') renderSettings();
    }catch(e){}
    return true;
  }
  return false;
}
function mfStormpeakWantOpen(){
  try{ return /[?&]stormpeak=1(?:&|$)/.test(location.search); }catch(e){ return false; }
}
function mfStormpeakBindRow(row,act){
  if(!row) return;
  const go=ev=>{ if(ev) ev.preventDefault(); act(); };
  if(typeof mfBindTap==='function') mfBindTap(row,go);
  else{
    row.addEventListener('pointerdown',go);
    row.addEventListener('keydown',ev=>{ if(ev.key==='Enter'||ev.key===' ') go(ev); });
  }
}
function mfStormpeakAppendSettings(){
  const rows=document.getElementById('setExtraRows')||document.getElementById('setList');
  if(!rows||document.getElementById('mfStormpeakSetToggle')) return;
  if(META&&META.settings&&META.settings.oceanTester==null) META.settings.oceanTester=false;
  const on=mfStormpeakEnabled();
  const tog=document.createElement('div');
  tog.className='sItem setRow';
  tog.id='mfStormpeakSetToggle';
  tog.setAttribute('role','button');
  tog.setAttribute('tabindex','0');
  tog.setAttribute('aria-pressed',on?'true':'false');
  tog.innerHTML='<div class="sTx"><b>Ocean Theatre Tester</b>'
    +'<div class="sDs">DEV surface. Shows the Stormpeak FFT ocean card in War Room. Does not score career or XP.</div></div>'
    +'<div class="sBuy togB'+(on?' onT':'')+'">'+(on?'ON':'OFF')+'</div>';
  mfStormpeakBindRow(tog,()=>{
    if(!META||!META.settings) return;
    META.settings.oceanTester=!META.settings.oceanTester;
    if(typeof metaSave==='function') metaSave();
    if(typeof sfx==='function') sfx('ui');
    if(typeof renderSettings==='function') renderSettings();
    if(typeof renderWarRoom==='function') renderWarRoom();
  });
  rows.appendChild(tog);
  const open=document.createElement('div');
  open.className='sItem setRow';
  open.id='mfStormpeakSetOpen';
  open.setAttribute('role','button');
  open.setAttribute('tabindex','0');
  open.innerHTML='<div class="sTx"><b>Open Ocean Theatre Tester</b>'
    +'<div class="sDs">Isolated Tessendorf sea with hull buoyancy and hydrophone. Return to MASSFRONT from its HUD or pause overlay.</div></div>'
    +'<div class="sBuy togB onT">OPEN</div>';
  mfStormpeakBindRow(open,()=>mfOpenStormpeakTester({resume:'settings'}));
  rows.appendChild(open);
  const extras=document.getElementById('setExtras');
  if(extras) extras.classList.remove('setGroupEmpty');
  mfStormpeakBusy(mfStormpeakLaunching);
}
/* ---------- DEV MODULES SECTION ----------
   A development surface is not an operation. This card used to sit directly in
   #warGrid as a sibling of TRAINING / STANDARD / CAMPAIGN, which advertised a
   debug tool as a way to play and silently inflated the "N OPERATIONS" count in
   the header. Dev work gets a labelled section at the foot of the war table
   instead, so the operations list means one thing again and later dev modules
   have somewhere to land.

   renderWarRoom() rebuilds #warGrid with innerHTML, so this is re-created on
   every render, exactly as the card itself always has been. */
const MF_WAR_DEV_GROUP_ID='mfWarDevGroup';
function mfWarDevGroup(){
  const g=document.getElementById('warGrid');
  if(!g) return null;
  const existing=document.getElementById(MF_WAR_DEV_GROUP_ID);
  if(existing&&existing.parentNode===g) return existing;
  const sec=document.createElement('section');
  sec.id=MF_WAR_DEV_GROUP_ID;
  sec.className='warDevGroup';
  sec.setAttribute('aria-label','Development modules');
  const head=document.createElement('div');
  head.className='warDevHd';
  head.textContent='DEV MODULES';
  const desc=document.createElement('div');
  desc.className='warDevDs';
  desc.textContent='Development surfaces for feedback and testing. They never write '
    +'career, XP or saves, and none of them count as an operation.';
  sec.appendChild(head);
  sec.appendChild(desc);
  g.appendChild(sec);
  return sec;
}
function mfStormpeakInjectWarCard(){
  const g=document.getElementById('warGrid');
  if(!g||!mfStormpeakEnabled()) return;
  if(g.querySelector('[data-mode="stormpeak"]')) return;
  const host=mfWarDevGroup();
  if(!host) return;
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='warCard';
  btn.dataset.mode='stormpeak';
  const record=mfStormpeakRecordText();
  btn.innerHTML='<span class="warEm">\u2248</span>'
    +'<span class="warBody"><span class="warNm">OCEAN TESTER</span>'
    +'<span class="warDs">DEV · Stormpeak Tessendorf theatre, hull buoyancy, hydrophone</span>'
    +(record?'<span class="warFootTx">'+record.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</span>':'')
    +'<span class="warFootTx">Does not write career, XP, or saves</span></span>';
  host.appendChild(btn);
  mfStormpeakBindRow(btn,()=>mfOpenStormpeakTester({resume:'warScr'}));
  /* The operations count belongs to renderWarRoom(), which writes it from
     WAR_MODES.length. This used to overwrite it with a count of every .warCard
     in the grid — which is how a DEV surface started being announced to the
     player as one more operation. */
  mfStormpeakBusy(mfStormpeakLaunching);
}
if(typeof renderSettings==='function'&&!renderSettings.__mfStormpeak){
  const _rs=renderSettings;
  renderSettings=function(){ _rs(); mfStormpeakAppendSettings(); };
  renderSettings.__mfStormpeak=1;
}
if(typeof renderWarRoom==='function'&&!renderWarRoom.__mfStormpeak){
  const _rw=renderWarRoom;
  renderWarRoom=function(){ _rw(); mfStormpeakInjectWarCard(); };
  renderWarRoom.__mfStormpeak=1;
}

/* Restoring Settings or War Room while the launcher gateway or the pre-alpha
   title is still on top produces a surface the player cannot see and cannot
   reach; the first tap on the title then throws it away. Wait for the front
   layers to clear instead of racing them, and give up after ~24 s so a stalled
   boot never silently holds a return ticket. */
function mfStormpeakHostFrontReady(){
  try{
    /* Under the UGA strategic home the host document navigates to the Galactic
       tab within seconds of boot, so waiting for the classic menu layers would
       let that navigation strand an unconsumed return ticket. */
    const b=window.__MF_GALACTIC_BRIDGE;
    if(b&&b.classicFallbackActive!==true) return true;
  }catch(e){}
  try{
    if(document.body&&document.body.classList.contains('mfLauncherGate')) return false;
    const seen=el=>{
      if(!el) return false;
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0.05;
    };
    if(seen(document.getElementById('mfIntroStart'))) return false;
    if(seen(document.getElementById('mfLaunchPlay'))) return false;
    if(seen(document.getElementById('apCloseBtn'))) return false;
    return !!document.getElementById('settingsBtn');
  }catch(e){ return true; }
}
/* mfStormpeakLaunching is a one-shot latch, cleared only by finish(), because
   on the success path this document is replaced. It is not always replaced:
   Safari and Android WebView restore this heap from bfcache on Back with the
   latch still true, and from then on the tester card refuses every tap in
   silence — the same stuck-boolean failure main.js documents for DEPLOY
   MASSFRONT, and one more reason "the ocean tester does nothing" was reported
   against a launch path that was working. pageshow with persisted=true is the
   only event fired by that restore; pagehide covers an abandoned navigation. */
(function mfStormpeakLatchReset(){
  const clearPressed=()=>{ mfStormpeakLaunching=false; mfStormpeakBusy(false); };
  window.addEventListener('pageshow',e=>{
    if(!e||!e.persisted) return;
    clearPressed();
    if(typeof mfLaunchVeilClose==='function') mfLaunchVeilClose();
  });
  window.addEventListener('pagehide',clearPressed);
})();
(function mfStormpeakHostBoot(){
  const deadline=Date.now()+24000;
  const tick=()=>{
    if(typeof META==='undefined'||!META){ setTimeout(tick,200); return; }
    const wantResume=mfStormpeakWantOpen()?false:/[?&]from=stormpeak(?:&|$)/.test(location.search||'');
    if(wantResume&&!mfStormpeakHostFrontReady()&&Date.now()<deadline){ setTimeout(tick,250); return; }
    if(mfStormpeakResumeHost()) return;
    if(mfStormpeakWantOpen()) mfOpenStormpeakTester({resume:'settings'});
  };
  setTimeout(tick,400);
})();
