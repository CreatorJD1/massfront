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
const SESS_MAX_UNITS = 4000;      // DEBT: map-total snapshot slice, not a pop cap. Per-seat cap is FACTION_POP_CAP (1000).
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
  const idx=[], out={t:[],tm:[],x:[],y:[],hp:[],ang:[],st:[],tx:[],ty:[],hold:[],mode:[],
    oi:[],cmd:[],tg:[],mh:[],pr:[],pst:[],psl:[],gh:[],gg:[],qk:[],q:[]};
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
    /* Old slot is the remap key. spawnUnit hands out new indices, so utgt /
       guard / queue / patrol members stored as raw slots would point at the
       wrong hulls after a resume. ufield is omitted on purpose: the field
       ring dies with the match and is rebuilt from tx/ty. */
    out.oi.push(i);
    out.cmd.push(typeof uCmd!=='undefined'?uCmd[i]:-1);
    out.tg.push(typeof utgt!=='undefined'?utgt[i]:-1);
    out.mh.push(typeof umarch!=='undefined'?umarch[i]|0:0);
    out.pr.push(typeof uPatrolRoute!=='undefined'?uPatrolRoute[i]:-1);
    out.pst.push(typeof uPatrolStep!=='undefined'?uPatrolStep[i]|0:0);
    out.psl.push(typeof uPatrolSlot!=='undefined'?uPatrolSlot[i]|0:0);
    out.gh.push(typeof uGuard!=='undefined'?uGuard[i]:-1);
    out.gg.push(typeof uGuardG!=='undefined'?uGuardG[i]:-1);
    out.qk.push(typeof uQkind!=='undefined'?uQkind[i]|0:0);
    const Q=(typeof uQueue!=='undefined'&&uQueue[i])?uQueue[i]:null;
    out.q.push(Q?Q.map(s=>({t:s.t|0,x:Math.round(s.x||0),y:Math.round(s.y||0),h:s.h|0,g:s.g|0,mv:s.mv|0})):null);
  }
  return out;
}

function sessCaptureBuildings(){
  const out=[];
  for(let bi=0;bi<blds.length;bi++){
    const B=blds[bi];
    if(!B||!B.alive) continue;
    out.push([B.type, B.team, Math.round(B.x), Math.round(B.y),
              Math.round(B.hp), +(B.prog||0).toFixed(3), B.lvl|0,
              B.buildPaidM==null?null:+B.buildPaidM.toFixed(3),
              B.buildPaidE==null?null:+B.buildPaidE.toFixed(3),
              bi,
              /* Seat ownership. Without these every resume stripped allyAI,
                 at which point the econTick guard stopped firing and the
                 ally seat's reactors started paying the human's bank. Old
                 snapshots lack the fields and restore as undefined = player-
                 owned, which matches their pre-fix reality. */
              B.allyAI==null?null:B.allyAI,
              B.aiBaseSlot==null?null:B.aiBaseSlot]);
  }
  return out;
}
function sessCaptureWallets(){
  const seats=[], allies=[];
  if(typeof AI!=='undefined'){
    if(AI.bases) for(const S of AI.bases)
      seats.push({slot:S.slot,mass:+(S.mass||0).toFixed(2),energy:+(S.energy||0).toFixed(2),
                  mcap:S.mcap|0,ecap:S.ecap|0});
    if(AI.allies) for(const A of AI.allies)
      allies.push({slot:A.slot,mass:+(A.mass||0).toFixed(2),energy:+(A.energy||0).toFixed(2)});
  }
  return {seats,allies};
}
function sessCapturePatrols(){
  if(typeof patrolRoutes==='undefined'||!patrolRoutes.length) return [];
  const out=[];
  for(let ri=0;ri<patrolRoutes.length;ri++){
    const R=patrolRoutes[ri];
    if(!R||!R.pts||!R.members){ out.push(null); continue; }
    out.push({
      pts:R.pts.map(p=>({x:+p.x,y:+p.y})),
      form:R.form|0, step:R.step|0,
      members:R.members.map(e=>[e[0]|0,e[1]|0])
    });
  }
  return out;
}
/* Relic handles survive a seed regen. Unit/building handles do not. */
function sessRemapHandle(h,uMap,bMap){
  if(h==null||h===-1) return -1;
  if(typeof isRelicTg==='function'&&isRelicTg(h)) return h;
  if(h>=0) return uMap.has(h)?uMap.get(h):-1;
  const bi=-2-h;
  return bMap.has(bi)?(-2-bMap.get(bi)):-1;
}
function sessApplyWallets(w){
  if(!w||typeof AI==='undefined') return;
  if(w.seats&&AI.bases){
    for(const row of w.seats){
      let S=null;
      for(let i=0;i<AI.bases.length;i++) if(AI.bases[i].slot===row.slot){ S=AI.bases[i]; break; }
      if(!S) continue;
      if(row.mass!=null) S.mass=row.mass;
      if(row.energy!=null) S.energy=row.energy;
      if(row.mcap) S.mcap=row.mcap;
      if(row.ecap) S.ecap=row.ecap;
    }
  }
  if(w.allies&&AI.allies){
    for(const row of w.allies){
      let A=null;
      for(let i=0;i<AI.allies.length;i++) if(AI.allies[i].slot===row.slot){ A=AI.allies[i]; break; }
      if(!A) continue;
      if(row.mass!=null) A.mass=row.mass;
      if(row.energy!=null) A.energy=row.energy;
    }
  }
  /* Fresh deploy wrote commander indices we then killed. Rebind by seat. */
  if(AI.bases){
    for(const S of AI.bases){
      let best=-1,bd=1e18;
      for(let i=0;i<unitHigh;i++){
        if(!ualive[i]||uteam[i]!==1) continue;
        const T=TYPES[utype[i]];
        if(!(utype[i]===4||(T&&T.cat==='hero'))) continue;
        if(typeof uCmd!=='undefined'&&uCmd[i]===S.slot){ best=i; break; }
        const d=dist2(ux[i],uy[i],S.x,S.y);
        if(d<bd){ bd=d; best=i; }
      }
      if(best>=0){ S.commander=best; S.commanderGen=ugen[best]; }
    }
  }
  if(typeof econMirrorAiBanks==='function') econMirrorAiBanks();
}
function sessRestoreOrders(U,spawned,uMap,bMap,patrols){
  if(!U||!U.oi) return;
  for(let k=0;k<spawned.length;k++){
    const i=spawned[k]; if(i<0) continue;
    if(typeof umarch!=='undefined'&&U.mh) umarch[i]=U.mh[k]|0;
    if(typeof utgt!=='undefined'&&U.tg){
      const tg=sessRemapHandle(U.tg[k],uMap,bMap);
      utgt[i]=tg;
      if(typeof utgtg!=='undefined') utgtg[i]=tg>=0?ugen[tg]:-1;
    }
    if(typeof uGuard!=='undefined'&&U.gh){
      const gh=sessRemapHandle(U.gh[k],uMap,bMap);
      uGuard[i]=gh;
      if(typeof uGuardG!=='undefined') uGuardG[i]=gh>=0?ugen[gh]:-1;
    }
    if(typeof uQkind!=='undefined'&&U.qk) uQkind[i]=U.qk[k]|0;
    if(typeof uQueue!=='undefined'&&U.q&&U.q[k]){
      uQueue[i]=U.q[k].map(s=>{
        const h=sessRemapHandle(s.h,uMap,bMap);
        return {t:s.t|0,x:s.x,y:s.y,h,g:h>=0?ugen[h]:-1,mv:s.mv|0};
      });
    }
    if(typeof ufield!=='undefined'){
      ufield[i]=-1;
      const T=TYPES[utype[i]];
      if(T&&!T.air&&(ustate[i]===1||ustate[i]===2||ustate[i]===5)&&typeof requestField==='function')
        ufield[i]=requestField(utx[i],uty[i],!!T.naval);
    }
  }
  if(typeof patrolRoutes==='undefined') return;
  patrolRoutes.length=0;
  if(!patrols||!patrols.length) return;
  for(const R of patrols){
    if(!R||!R.pts||!R.members){ patrolRoutes.push(null); continue; }
    const members=[];
    for(const e of R.members){
      const ni=uMap.get(e[0]);
      if(ni==null||!ualive[ni]) continue;
      members.push([ni,ugen[ni]]);
    }
    if(!members.length){ patrolRoutes.push(null); continue; }
    const sel=members.map(e=>e[0]);
    const targets=(typeof patrolTargetRows==='function')?patrolTargetRows(sel,R.pts,R.form):[];
    const rec={pts:R.pts,targets,form:R.form|0,members,step:R.step|0,legT:0,waitT:0,gcT:.45,created:performance.now()};
    const ri=patrolRoutes.length;
    patrolRoutes.push(rec);
    for(let k=0;k<sel.length;k++){
      const i=sel[k];
      if(typeof uPatrolRoute!=='undefined') uPatrolRoute[i]=ri;
      if(typeof uPatrolStep!=='undefined') uPatrolStep[i]=rec.step;
      if(typeof uPatrolSlot!=='undefined') uPatrolSlot[i]=k;
    }
    if(typeof refreshPatrolRoute==='function') refreshPatrolRoute(ri,true);
  }
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
      wallets: sessCaptureWallets(),
      wave: (typeof AI!=='undefined')?{n:AI.wave|0,timer:AI.waveTimer|0}:null,
      units: sessCaptureUnits(),
      blds: sessCaptureBuildings(),
      patrols: sessCapturePatrols(),
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

    const bMap=new Map();
    for(const b of s.blds){
      const [type,team,x,y,hp,prog,lvl,paidM,paidE,oldBi,allyAI,aiBaseSlot]=b;
      try{
        const B=addBld(type,team,x,y,true);
        if(B){ B.hp=hp; B.prog=prog; B.lvl=lvl||1;
          if(paidM!=null)B.buildPaidM=paidM;if(paidE!=null)B.buildPaidE=paidE;
          if(oldBi!=null) bMap.set(oldBi,blds.length-1);
          if(allyAI!=null)B.allyAI=allyAI; if(aiBaseSlot!=null)B.aiBaseSlot=aiBaseSlot; }
      }catch(e){}
    }
    refreshBldLive();

    const U=s.units, uMap=new Map(), spawned=[];
    for(let k=0;k<U.t.length;k++){
      const cmd=U.cmd?U.cmd[k]:undefined;
      const i=spawnUnit(U.t[k],U.tm[k],U.x[k],U.y[k],cmd);
      spawned.push(i);
      if(i<0) continue;
      if(U.oi) uMap.set(U.oi[k],i);
      uhp[i]=U.hp[k]; uang[i]=U.ang[k]; ustate[i]=U.st[k];
      utx[i]=U.tx[k]; uty[i]=U.ty[k]; uhold[i]=U.hold[k];
      if(typeof umode!=='undefined') umode[i]=U.mode[k];
    }
    /* Player ledger first. Seat wallets then overwrite the team-1 mirror so a
       1v2/1v3 resume does not dump three mex belts into one shared bank. */
    if(typeof resM!=='undefined'&&s.resM){ resM[0]=s.resM[0]; if(!s.wallets) resM[1]=s.resM[1]; }
    if(typeof resE!=='undefined'&&s.resE){ resE[0]=s.resE[0]; if(!s.wallets) resE[1]=s.resE[1]; }
    sessApplyWallets(s.wallets);
    sessRestoreOrders(U, spawned, uMap, bMap, s.patrols);
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
      /* The PLAYER seat, not merely team 0. Ally commanders are also team 0
         and cat==="hero", and they spawn at LOWER indices than the player on
         a resume - so this first-match scan handed heroIdx to the ALLY, and
         from that moment abilities, the HUD, hero XP and the victory check
         all pointed at a unit the player does not control. uCmd is captured
         (U.cmd) and replayed through spawnUnit above, so the seat is known
         here. The fallback keeps a legacy snapshot with no seat data
         resumable, which is what it did before. */
      if(uteam[i]===0){
        if(uCmd[i]===POP_PLAYER_SLOT){ if(heroIdx<0||uCmd[heroIdx]!==POP_PLAYER_SLOT) heroIdx=i; }
        else if(heroIdx<0) heroIdx=i;   // legacy snapshot: better a hero than none
      }
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
    const su=s.setup||{};
    if(su.d!=null&&typeof difficulty!=='undefined') difficulty=su.d;
    if(su.pkg&&typeof deploymentPackage!=='undefined'&&typeof DEPLOYMENT_PACKAGES!=='undefined'&&DEPLOYMENT_PACKAGES[su.pkg]) deploymentPackage=su.pkg;
    if(su.bs&&typeof battlefieldPreset!=='undefined'&&typeof battlefieldPresetKey==='function') battlefieldPreset=battlefieldPresetKey(su.bs);
    if(su.inf!=null&&typeof infestationOn!=='undefined') infestationOn=!!su.inf;
    if(su.df!=null&&typeof defenseFocus!=='undefined') defenseFocus=su.df?1:0;
    if(su.rp&&typeof resPace!=='undefined') resPace=+su.rp;
    if(su.cr!=null&&typeof crateRate!=='undefined') crateRate=crateRateBase=+su.cr;
    if(Array.isArray(su.ais)&&typeof aiSlots!=='undefined'){
      for(let i=0;i<Math.min(aiSlots.length,su.ais.length);i++){
        const S=su.ais[i]||{};
        aiSlots[i].on=!!S.on;
        aiSlots[i].diff=(S.diff|0);
        aiSlots[i].ally=!!S.ally;
        if(S.zone) aiSlots[i].zone=S.zone;
        if(S.behavior&&typeof aiBehaviorKey==='function') aiSlots[i].behavior=aiBehaviorKey(S.behavior);
      }
    }
    if(s.map&&typeof curMap!=='undefined') curMap=s.map;
    if(s.theme&&typeof curTheme!=='undefined') curTheme=s.theme;
    if(s.goal&&typeof goalSel!=='undefined') goalSel=s.goal;
    if(typeof timeLimit!=='undefined') timeLimit=s.timeLimit||0;
    if(s.aiFac&&typeof aiFactionSel!=='undefined'){ aiFactionSel=s.aiFac;
      if(typeof AI!=='undefined'){ AI.fac=s.aiFac; if(typeof aiFacPicked!=='undefined') aiFacPicked=true; } }
    else if(su.f&&typeof aiFactionSel!=='undefined') aiFactionSel=su.f;
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
    if(typeof audMusicEnterMatch==='function') audMusicEnterMatch();
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

