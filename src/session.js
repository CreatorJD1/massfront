;
;
/* ============================================================================
   DROPPED SESSION RECOVERY
   ----------------------------------------------------------------------------
   The WebGL context-loss handler in gl.js shows an overlay reading "your
   progress is saved to this device and your account", waits 1.7 seconds, and
   reloads the page. That sentence was not true of the thing the player cares
   about. Account progress — cores, XP, unlocks — is saved. The MATCH is not,
   and nothing in this codebase ever saved one, so a context loss five minutes
   into a fight threw the fight away and dropped the player back at the menu
   with no way back in.

   Context loss is not a bug we can promise never to hit. Android reclaims GPU
   memory when it wants to, and a large swarm on a warm phone is exactly the
   condition that provokes it. So the honest fix is not only to make it rarer —
   it is to make it survivable.

   WHAT IS SNAPSHOTTED, AND WHY THIS SET
   The sim is structure-of-arrays, so a snapshot is a handful of typed-array
   slices plus a plain list for structures. We store what cannot be derived:
   positions, health, ownership, orders, resources, the clock and the setup the
   match was generated from. We deliberately do NOT store terrain, deposits,
   hives or doodads — all of those are regenerated deterministically from the
   map's seed (see srand() in gl.js), so persisting them would be megabytes to
   reproduce something a single integer already reproduces exactly.

   WHY localStorage AND NOT IndexedDB
   This runs inside a `webglcontextlost` handler with a 1.7-second budget before
   the page reloads. IndexedDB is asynchronous and is not guaranteed to flush in
   that window; localStorage is synchronous and is written before the handler
   returns. The snapshot is capped so it cannot exceed the quota and take the
   rest of the save data down with it.
   ============================================================================ */

const SESS_KEY = 'mf_dropped_session_v1';
const SESS_MAX_UNITS = 4000;      // beyond this we keep the largest-value slice
const SESS_TTL_MS = 45 * 60 * 1000;

function sessCanSnapshot(){
  try{
    return typeof running !== 'undefined' && running &&
           typeof demoMode !== 'undefined' && !demoMode &&
           typeof gameEnded !== 'undefined' && !gameEnded &&
           typeof heroIdx !== 'undefined' && heroIdx >= 0;
  }catch(e){ return false; }
}

/* A live unit's full order state. Kept as parallel plain arrays rather than an
   array of objects: JSON.stringify of 4000 objects is several times slower and
   several times larger, and this runs against a reload deadline. */
function sessCaptureUnits(){
  const idx=[], out={t:[],tm:[],x:[],y:[],hp:[],ang:[],st:[],tx:[],ty:[],hold:[],mode:[]};
  for(let i=0;i<unitHigh;i++) if(ualive[i]) idx.push(i);
  /* Over the cap, keep the player's army and the enemy's commanders first —
     losing some wildlife on a resume is survivable; losing your own force is
     the thing this exists to prevent. */
  if(idx.length>SESS_MAX_UNITS){
    idx.sort((a,b)=>(uteam[a]===0?0:uteam[a]===1?1:2)-(uteam[b]===0?0:uteam[b]===1?1:2));
    idx.length=SESS_MAX_UNITS;
  }
  for(const i of idx){
    out.t.push(utype[i]); out.tm.push(uteam[i]);
    out.x.push(Math.round(ux[i])); out.y.push(Math.round(uy[i]));
    out.hp.push(Math.round(uhp[i])); out.ang.push(+uang[i].toFixed(2));
    out.st.push(ustate[i]);
    out.tx.push(Math.round(utx[i])); out.ty.push(Math.round(uty[i]));
    out.hold.push(uhold[i]|0); out.mode.push(typeof umode!=='undefined'?(umode[i]|0):0);
  }
  return out;
}

function sessCaptureBuildings(){
  const out=[];
  for(const B of blds){
    if(!B.alive) continue;
    out.push([B.type, B.team, Math.round(B.x), Math.round(B.y),
              Math.round(B.hp), +(B.prog||0).toFixed(3), B.lvl|0,
              B.buildPaidM==null?null:+B.buildPaidM.toFixed(3),
              B.buildPaidE==null?null:+B.buildPaidE.toFixed(3)]);
  }
  return out;
}

function sessSnapshot(reason){
  if(!sessCanSnapshot()) return false;
  try{
    const snap={
      v:1, at:Date.now(), reason:reason||'unknown',
      /* The setup is what regenerates the world. Everything terrain-shaped
         falls out of it, which is why the snapshot is kilobytes not megabytes. */
      setup: (typeof META!=='undefined'&&META.setup)?META.setup:null,
      map: typeof curMap!=='undefined'?curMap:null,
      theme: typeof curTheme!=='undefined'?curTheme:null,
      goal: typeof goalSel!=='undefined'?goalSel:null,
      timeLimit: typeof timeLimit!=='undefined'?timeLimit:0,
      aiFac: (typeof AI!=='undefined'&&AI.fac)?AI.fac:null,
      playerFac: typeof playerFaction!=='undefined'?playerFaction:'nova',
      playerCommander: typeof playerCommanderId!=='undefined'?playerCommanderId:'nova_kai',
      clock: typeof matchClock!=='undefined'?matchClock:0,
      t: (typeof stats!=='undefined'&&stats.t)?stats.t:0,
      kills: (typeof stats!=='undefined'&&stats.kills)?stats.kills.slice():[0,0,0],
      built: (typeof stats!=='undefined'&&stats.built)?stats.built.slice():[0,0],
      resM: typeof resM!=='undefined'?[resM[0],resM[1]]:[0,0],
      resE: typeof resE!=='undefined'?[resE[0],resE[1]]:[0,0],
      wave: (typeof AI!=='undefined')?{n:AI.wave|0,timer:AI.waveTimer|0}:null,
      units: sessCaptureUnits(),
      blds: sessCaptureBuildings(),
    };
    const text=JSON.stringify(snap);
    /* A snapshot that blows the quota would throw and take nothing with it —
       but it could also evict the account save on some engines, so refuse
       rather than risk it. 3 MB is far above a realistic match and far below
       the 5 MB localStorage floor. */
    if(text.length>3*1024*1024) return false;
    localStorage.setItem(SESS_KEY,text);
    return true;
  }catch(e){ return false; }
}

function sessLoad(){
  try{
    const raw=localStorage.getItem(SESS_KEY);
    if(!raw) return null;
    const s=JSON.parse(raw);
    if(!s||s.v!==1||!s.units) return null;
    /* An hours-old snapshot is not a dropped session, it is an abandoned one,
       and offering it teaches the player that the prompt is noise. */
    if(Date.now()-(s.at||0)>SESS_TTL_MS){ sessClear(); return null; }
    return s;
  }catch(e){ return null; }
}
function sessClear(){ try{ localStorage.removeItem(SESS_KEY); }catch(e){} }
function sessHas(){ return !!sessLoad(); }

/* A short human description for the resume prompt. A player will not act on
   "resume session"; they will act on "9 minutes in, 34 units, Vanguard Valley". */
function sessDescribe(s){
  if(!s) return '';
  const mins=Math.max(0,Math.round((s.t||0)/60));
  const mine=(s.units.tm||[]).filter(t=>t===0).length;
  const M=(typeof MAPDEFS!=='undefined'&&MAPDEFS[s.map])?MAPDEFS[s.map].nm:(s.map||'battlefield');
  return mins+' min in · '+mine+' units · '+M;
}

/* ---- RESTORE ---------------------------------------------------------------
   Runs AFTER the normal match generation, so the world is already built from
   the same setup and the same seed. We are placing the fight back onto a
   battlefield that regenerated identically, not rebuilding the battlefield. */
function sessRestoreInto(s){
  if(!s) return false;
  try{
    /* Clear whatever the fresh start spawned before laying the snapshot down,
       or the player resumes with two commanders and a doubled army. */
    for(let i=0;i<unitHigh;i++) if(ualive[i]) killUnit(i,true);
    for(const B of blds) if(B.alive&&B.type!=='nest') B.alive=false;
    refreshBldLive();

    for(const b of s.blds){
      const [type,team,x,y,hp,prog,lvl,paidM,paidE]=b;
      try{
        const B=addBld(type,team,x,y,true);
        if(B){ B.hp=hp; B.prog=prog; B.lvl=lvl||1;
          if(paidM!=null)B.buildPaidM=paidM;if(paidE!=null)B.buildPaidE=paidE; }
      }catch(e){}
    }
    refreshBldLive();

    const U=s.units;
    for(let k=0;k<U.t.length;k++){
      const i=spawnUnit(U.t[k],U.tm[k],U.x[k],U.y[k]);
      if(i<0) continue;
      uhp[i]=U.hp[k]; uang[i]=U.ang[k]; ustate[i]=U.st[k];
      utx[i]=U.tx[k]; uty[i]=U.ty[k]; uhold[i]=U.hold[k];
      if(typeof umode!=='undefined') umode[i]=U.mode[k];
    }
    if(typeof resM!=='undefined'){ resM[0]=s.resM[0]; resM[1]=s.resM[1]; }
    if(typeof resE!=='undefined'){ resE[0]=s.resE[0]; resE[1]=s.resE[1]; }
    if(typeof stats!=='undefined'){
      stats.t=s.t||0;
      if(s.kills) stats.kills=s.kills.slice();
      if(s.built) stats.built=s.built.slice();
    }
    if(typeof matchClock!=='undefined') matchClock=s.clock||0;
    if(typeof AI!=='undefined'&&s.wave){ AI.wave=s.wave.n||1; AI.waveTimer=s.wave.timer||60; }
    /* THE COMMANDER IS WHAT checkVictory KEYS OFF. heroIdx is set once at spawn
       and cleared on death; a restore that does not re-point it leaves it at -1
       and the resumed match ends as an instant defeat on the very first tick.
       Same for the enemy commanders, or the win condition can never be met. */
    heroIdx=-1; enemyHeroIdx=-1; enemyHeroIdxs.length=0;
    for(let i=0;i<unitHigh;i++){
      if(!ualive[i]) continue;
      const T=TYPES[utype[i]];
      const isCdr = utype[i]===4 || (T && T.cat==='hero');
      if(!isCdr) continue;
      if(uteam[i]===0){ if(heroIdx<0) heroIdx=i; }
      else if(uteam[i]===1){ if(enemyHeroIdx<0) enemyHeroIdx=i; enemyHeroIdxs.push(i); }
    }
    if(heroIdx<0) return (sessClear(),false);   // nothing to resume into
    sessClear();
    return true;
  }catch(e){ sessClear(); return false; }
}

/* Snapshot on the two events that actually lose a match: the GPU going away,
   and the page being torn down while a fight is live. */
(function sessInstall(){
  try{
    const cvEl=document.getElementById('gl');
    if(cvEl) cvEl.addEventListener('webglcontextlost',()=>{ sessSnapshot('contextlost'); },true);
    /* `pagehide` fires on mobile where `beforeunload` frequently does not. */
    window.addEventListener('pagehide',()=>{ sessSnapshot('pagehide'); });
    /* Backgrounding is where Android reclaims the GPU, so take the snapshot on
       the way out rather than hoping to get a handler when it does. */
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='hidden') sessSnapshot('hidden');
    });
  }catch(e){}
})();

/* ---- THE PROMPT ------------------------------------------------------------
   Offered on the main menu, once, and only while the snapshot is fresh. It sits
   above WAR ROOM because a player who has just been dropped out of a nine-minute
   fight is not looking for the menu — they are looking for their match. */
function sessRenderResume(){
  const host=document.getElementById('startScreen');
  if(!host) return;
  let el=document.getElementById('sessResume');
  const s=sessLoad();
  if(!s){ if(el) el.remove(); return; }
  if(!el){
    el=document.createElement('button');
    el.id='sessResume'; el.type='button'; el.className='mbtn';
    const anchor=document.getElementById('startBtn');
    if(anchor&&anchor.parentNode) anchor.parentNode.insertBefore(el,anchor);
    else host.appendChild(el);
    if(typeof mfBindTap==='function') mfBindTap(el,sessResume);
    else el.addEventListener('click',sessResume);
  }
  el.innerHTML='◈ &nbsp;RESUME DROPPED SESSION'
    +'<small style="display:block;margin-top:3px;font-size:9px;opacity:.8;letter-spacing:.06em">'
    +sessDescribe(s)+'</small>';
}
function sessResume(){
  const s=sessLoad();
  if(!s){ sessRenderResume(); return; }
  try{
    /* Put the setup back BEFORE generating, so the world regenerates from the
       same seed and the same rules the dropped match was played under. */
    if(s.setup&&typeof META!=='undefined') META.setup=s.setup;
    if(s.map&&typeof curMap!=='undefined') curMap=s.map;
    if(s.theme&&typeof curTheme!=='undefined') curTheme=s.theme;
    if(s.goal&&typeof goalSel!=='undefined') goalSel=s.goal;
    if(typeof timeLimit!=='undefined') timeLimit=s.timeLimit||0;
    if(s.aiFac&&typeof aiFactionSel!=='undefined'){ aiFactionSel=s.aiFac;
      if(typeof AI!=='undefined'){ AI.fac=s.aiFac; if(typeof aiFacPicked!=='undefined') aiFacPicked=true; } }
    if(s.playerFac&&typeof playerFaction!=='undefined'&&
       (typeof playableFactions!=='function'||playableFactions().includes(s.playerFac)))playerFaction=s.playerFac;
    if(s.playerCommander&&typeof playerCommanderId!=='undefined'&&typeof commanderById==='function'){
      const C=commanderById(s.playerCommander),R=COMMANDER_ROSTERS[playerFaction]||[];
      if(C&&!C.aiOnly&&R.indexOf(C)>=0)playerCommanderId=s.playerCommander;
    }
    sessPending=s;
    if(typeof initAudio==='function') initAudio();
    if(typeof sfx==='function') sfx('ui');
    if(typeof applyTheme==='function') applyTheme();
    if(typeof hideFrontScreens==='function') hideFrontScreens();
    if(typeof newSkirmish==='function') newSkirmish();
    /* SKIP THE LANDING. A resumed match should not ask the player to choose a
       drop site again — they landed nine minutes ago, and their HQ is in the
       snapshot. Put the carrier on the saved HQ and deploy it automatically, so
       resuming lands them back in the fight rather than back at the start of
       one. Deferred a frame because newSkirmish generates terrain first and the
       deploy check tests the ground it is standing on. */
    const hq=(s.blds||[]).find(b2=>b2[0]==='hq'&&b2[1]===0);
    /* Terrain generation takes seconds and deployCarrier() refuses to land on
       ground that does not exist yet, so this polls for readiness rather than
       guessing a delay — a fixed timeout was silently landing nothing at all.
       Bounded, so a map that never becomes deployable leaves the player at the
       normal drop screen instead of hanging on a spinner. */
    let tries=0;
    const land=function(){
      if(++tries>140) return;                       // ~35 s ceiling
      try{
        if(typeof carrierCanDeploy!=='function'||typeof deployCarrier!=='function') return;
        if(hq&&typeof carrier!=='undefined'){ carrier.x=hq[2]; carrier.y=hq[3]; }
        if(typeof matchLive!=='undefined'&&matchLive) return;   // already down
        if(carrierCanDeploy()){ deployCarrier(); return; }
      }catch(e){}
      setTimeout(land,250);
    };
    setTimeout(land,250);
  }catch(e){ sessClear(); sessRenderResume(); }
}

