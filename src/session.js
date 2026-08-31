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
   match was generated from. Terrain geometry is regenerated, but finite
   resource reserves and authored-site damage/collections are stored: those are
   player-caused state and regenerating them would duplicate rewards.

   WHY localStorage AND NOT IndexedDB
   This runs inside a `webglcontextlost` handler with a 1.7-second budget before
   the page reloads. IndexedDB is asynchronous and is not guaranteed to flush in
   that window; localStorage is synchronous and is written before the handler
   returns. The snapshot is capped so it cannot exceed the quota and take the
   rest of the save data down with it.
   ============================================================================ */

const SESS_KEY = 'mf_dropped_session_v1';
const SESS_MAX_UNITS = 4000;      // DEBT: map-total snapshot slice, not a pop cap. Each combat faction is capped by FACTION_POP_CAP (500).
const SESS_TTL_MS = 45 * 60 * 1000;

function sessCanSnapshot(){
  try{
    /* Authored campaigns, Weekly runs and Training missions borrow the
       player's setup and keep mode-specific state outside this schema. Saving
       only the generic battle would create a prompt that can never be restored
       faithfully, so those modes stay fail-closed until their complete state
       has an explicit recovery contract. */
    const unsupportedCampaign=
      (typeof storyCampaignPlanBorrowed==='function'&&storyCampaignPlanBorrowed())||
      (typeof storyCampaignActiveId!=='undefined'&&!!storyCampaignActiveId),
      unsupportedWeekly=typeof weeklyMode!=='undefined'&&!!weeklyMode,
      unsupportedTraining=typeof trainingMissionActive==='function'&&trainingMissionActive();
    return typeof running !== 'undefined' && running &&
           typeof demoMode !== 'undefined' && !demoMode &&
           typeof gameEnded !== 'undefined' && !gameEnded &&
           typeof heroIdx !== 'undefined' && heroIdx >= 0 &&
           typeof ualive !== 'undefined' && !!ualive[heroIdx] &&
           !unsupportedCampaign && !unsupportedWeekly && !unsupportedTraining;
  }catch(e){ return false; }
}

/* A live unit's full order state. Kept as parallel plain arrays rather than an
   array of objects: JSON.stringify of 4000 objects is several times slower and
   several times larger, and this runs against a reload deadline. */
function sessCaptureUnits(){
  const idx=[], out={t:[],tm:[],x:[],y:[],hp:[],ang:[],st:[],tx:[],ty:[],hold:[],mode:[],vt:[],kl:[],
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
    /* Veterancy and its kill counter. spawnUnit ZEROES both on every spawn, so
       a restore that does not carry them hands the player back a rankless army:
       the ★ chevrons vanish from the world and the selection panel, and the
       +15%-per-rank damage in the damage roll (uvet[i]*0.15) is silently gone.
       airlift.js already round-trips exactly this pair for the same reason. */
    out.vt.push(typeof uvet!=='undefined'?uvet[i]|0:0);
    out.kl.push(typeof ukills!=='undefined'?ukills[i]|0:0);
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
              Math.round(B.hp), +(B.prog||0), B.lvl|0,
              B.buildPaidM==null?null:+B.buildPaidM.toFixed(3),
              B.buildPaidE==null?null:+B.buildPaidE.toFixed(3),
              bi,
              /* Seat ownership. Without these every resume stripped allyAI,
                 at which point the econTick guard stopped firing and the
                 ally seat's reactors started paying the human's bank. Old
                 snapshots lack the fields and restore as undefined = player-
                 owned, which matches their pre-fix reality. */
              B.allyAI==null?null:B.allyAI,
              B.aiBaseSlot==null?null:B.aiBaseSlot,
              /* addBld DERIVES b.fac from the team, and main.js then overwrites
                 it on every AI/ally base structure (baseB: `B.fac=fac`). Ally
                 bases are team 0, so a restore that lets addBld re-derive gives
                 them the player's own faction architecture instead of the kit
                 they were built with — the ally's base changes appearance
                 across a resume. aiBehavior has no derivation at all: without
                 it aiBuildingBehavior() falls back to the nearest base, so a
                 forward structure in a 1v3 answers to the wrong doctrine. */
              B.fac==null?null:B.fac,
              B.aiBehavior==null?null:B.aiBehavior,
              /* A restored extractor must reclaim the same finite node even
                 when its rounded structure coordinate is outside addBld's
                 three-unit exact-bind window. */
              B.dep>=0?B.dep:null,
              B.geo>=0?B.geo:null,
              /* Completion grants are historical state, not a function of a
                 surviving unit. A dead package Prospector must stay dead, and
                 a 99.96%-complete Extractor must still grant one on completion. */
              B.type==='mex'?(B.freeMiner?1:0):null]);
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

/* Storage is untrusted and old builds can leave a partially written record.
   Validate every array restore indexes or iterates before the fresh match is
   touched; catching an exception after killUnit() is already too late. */
function sessCheckCoreState(s){
  const bad=()=>({ok:false,code:'SESSION_CORE_STATE_INVALID'});
  const U=s&&s.units,rows=s&&s.blds;
  if(!U||typeof U!=='object'||!Array.isArray(rows)||rows.length>SESS_MAX_UNITS*2)return bad();
  const required=['t','tm','x','y','hp','ang','st','tx','ty','hold','mode'];
  const extended=['vt','kl','oi','cmd','tg','mh','pr','pst','psl','gh','gg','qk','q'];
  if(required.some(k=>!Array.isArray(U[k])))return bad();
  const n=U.t.length;if(!n||n>SESS_MAX_UNITS||required.some(k=>U[k].length!==n))return bad();
  if(s.v===2&&extended.some(k=>!Array.isArray(U[k])))return bad();
  if(extended.some(k=>U[k]!=null&&(!Array.isArray(U[k])||U[k].length!==n)))return bad();
  const int=v=>Number.isInteger(v),finite=v=>Number.isFinite(v),oldUnits=new Set();
  const span=typeof MAP==='number'?MAP:3200,inMap=v=>finite(v)&&v>=-span&&v<=span*2;
  const validSeat=v=>int(v)&&(typeof populationSlotValid==='function'?populationSlotValid(v):v>=-1&&v<=3);
  let playerHero=false;
  for(let k=0;k<n;k++){
    const type=U.t[k],team=U.tm[k];
    if(!int(type)||type<0||type>=TYPES.length||!int(team)||team<0||team>2||
       !inMap(U.x[k])||!inMap(U.y[k])||!finite(U.hp[k])||U.hp[k]<0||U.hp[k]>1e9||
       !finite(U.ang[k])||!int(U.st[k])||U.st[k]<0||U.st[k]>255||
       !inMap(U.tx[k])||!inMap(U.ty[k])||!int(U.hold[k])||U.hold[k]<0||U.hold[k]>255||
       !int(U.mode[k])||U.mode[k]<0||U.mode[k]>255)return bad();
    if(team===0&&(type===4||(TYPES[type]&&TYPES[type].cat==='hero'))&&
       (s.v===1||U.cmd&&U.cmd[k]===POP_PLAYER_SLOT))playerHero=true;
    for(const key of ['vt','kl','tg','mh','pr','pst','psl','gh','gg','qk'])
      if(U[key]!=null&&!int(U[key][k]))return bad();
    if(U.cmd&&!validSeat(U.cmd[k]))return bad();
    if(U.oi){const oi=U.oi[k];if(!int(oi)||oi<0||oi>=(typeof MAXU==='number'?MAXU:100000)||oldUnits.has(oi))return bad();oldUnits.add(oi);}
    if(U.q){
      const Q=U.q[k];if(Q!=null&&(!Array.isArray(Q)||Q.length>(typeof QUEUE_MAX==='number'?QUEUE_MAX:8)))return bad();
      if(Q)for(const step of Q)if(!step||typeof step!=='object'||!int(step.t)||step.t<0||step.t>2||
        !inMap(step.x)||!inMap(step.y)||!int(step.h)||!int(step.g)||!int(step.mv)||step.mv<0||step.mv>1)return bad();
    }
  }
  if(!playerHero)return bad();
  const oldBlds=new Set(),depClaims=new Set(),geoClaims=new Set();
  const nullableFinite=v=>v==null||finite(v),nullableInt=v=>v==null||int(v);
  for(const B of rows){
    if(!Array.isArray(B)||B.length<(s.v===2?17:14)||typeof B[0]!=='string'||
       !Object.prototype.hasOwnProperty.call(BT,B[0])||!int(B[1])||B[1]<0||B[1]>2||
       !inMap(B[2])||!inMap(B[3])||!finite(B[4])||B[4]<0||B[4]>1e9||
       !finite(B[5])||B[5]<0||B[5]>1||!int(B[6])||B[6]<0||B[6]>100||
       !nullableFinite(B[7])||B[7]<0||!nullableFinite(B[8])||B[8]<0||
       !int(B[9])||B[9]<0||oldBlds.has(B[9])||!nullableInt(B[10])||!nullableInt(B[11])||
       !(B[12]==null||typeof B[12]==='string')||!(B[13]==null||typeof B[13]==='string'))return bad();
    oldBlds.add(B[9]);
    if(s.v===2){
      const dep=B[14],geo=B[15],grant=B[16];
      if(!nullableInt(dep)||!nullableInt(geo)||(dep!=null&&(dep<0||B[0]!=='mex'||depClaims.has(dep)))||
         (geo!=null&&(geo<0||B[0]!=='geo'||geoClaims.has(geo)))||
         (B[0]==='mex'&&(grant!==0&&grant!==1))||(B[0]!=='mex'&&grant!=null))return bad();
      if(dep!=null)depClaims.add(dep);if(geo!=null)geoClaims.add(geo);
    }
  }
  const finiteArray=(a,len)=>Array.isArray(a)&&a.length===len&&a.every(v=>finite(v)&&v>=0);
  if(s.v===2&&(s.resM==null||s.resE==null||s.kills==null||s.built==null||
     s.wallets==null||s.patrols==null||s.wave==null||!finite(s.clock)||!finite(s.t)))return bad();
  if((s.resM!=null&&!finiteArray(s.resM,2))||(s.resE!=null&&!finiteArray(s.resE,2))||
     (s.kills!=null&&!finiteArray(s.kills,3))||(s.built!=null&&!finiteArray(s.built,2)))return bad();
  if(s.wallets!=null){
    const W=s.wallets;if(!W||!Array.isArray(W.seats)||!Array.isArray(W.allies))return bad();
    const walletRow=(R,seat)=>R&&validSeat(R.slot)&&finite(R.mass)&&finite(R.energy)&&R.mass>=0&&R.energy>=0&&
      (!seat||s.v===1?(R.mcap==null||int(R.mcap)&&R.mcap>0)&&(R.ecap==null||int(R.ecap)&&R.ecap>0):
        int(R.mcap)&&R.mcap>0&&int(R.ecap)&&R.ecap>0);
    if(W.seats.some(R=>!walletRow(R,true))||W.allies.some(R=>!walletRow(R,false)))return bad();
  }
  if(s.patrols!=null){
    if(!Array.isArray(s.patrols)||s.patrols.length>SESS_MAX_UNITS)return bad();
    for(const R of s.patrols)if(R!=null){
      if(!R||!Array.isArray(R.pts)||!Array.isArray(R.members)||!int(R.form)||!int(R.step)||
         R.pts.length<2||R.pts.length>6||R.form<0||R.form>=(typeof FORMS!=='undefined'?FORMS.length:6)||
         R.step<0||R.step>=R.pts.length||R.members.length>n||R.pts.some(P=>!P||!inMap(P.x)||!inMap(P.y))||
         R.members.some(E=>!Array.isArray(E)||E.length<2||!int(E[0])||!int(E[1])))return bad();
    }
  }
  if(s.wave!=null&&(!s.wave||!int(s.wave.n)||s.wave.n<0||!finite(s.wave.timer)||s.wave.timer<0))return bad();
  if((s.clock!=null&&(!finite(s.clock)||s.clock<0))||(s.t!=null&&(!finite(s.t)||s.t<0)))return bad();
  return {ok:true,units:U,blds:rows};
}

/* Core validation proves that every saved row is well-shaped. This second gate
   proves the regenerated match can ADMIT the whole roster before the fresh
   landing is erased. Combat factions own one shared cap, while every expected
   but absent Commander reserves one place. The final `used + missing <= cap`
   invariant is sufficient for every saved-order prefix: a Commander swaps one
   missing reservation for one used body, while an ordinary unit is the only
   operation that increases the sum. Neutral wildlife keeps its dynamic cap. */
function sessCheckRosterRealizable(s){
  const bad=()=>({ok:false,code:'SESSION_ROSTER_UNREALIZABLE'}),U=s&&s.units;
  if(!U||typeof populationExpectedSlots!=='function'||typeof populationResolveSlot!=='function'||
     typeof populationCapFor!=='function')return bad();
  const expected=[new Set(populationExpectedSlots(0)),new Set(populationExpectedSlots(1))],
    heroSeats=[new Set(),new Set()],counts=[0,0,0],
    hostileBrood=typeof broodIsEnemy==='function'&&broodIsEnemy();
  if(!expected[0].size||!expected[1].size)return bad();
  for(let k=0;k<U.t.length;k++){
    const team=U.tm[k],type=U.t[k],factionTeam=team===2&&hostileBrood?1:team;
    if(factionTeam===0||factionTeam===1){
      const cmd=U.cmd?U.cmd[k]:undefined,
        slot=populationResolveSlot(team,cmd,U.x[k],U.y[k]);
      if(!expected[factionTeam].has(slot))return bad();
      counts[factionTeam]++;
      /* Hostile infestation bodies share the enemy wallet but do not satisfy an
         AI Commander's reserved seat; spawnUnit mirrors that same distinction. */
      if(team<2&&TYPES[type]&&TYPES[type].cat==='hero')heroSeats[team].add(slot);
    }else counts[2]++;
  }
  const missing=[0,0],caps=[populationCapFor(0),populationCapFor(1),populationCapFor(2)];
  for(let team=0;team<2;team++){
    for(const slot of expected[team])if(!heroSeats[team].has(slot))missing[team]++;
    if(!Number.isFinite(caps[team])||counts[team]+missing[team]>caps[team])return bad();
  }
  if(!Number.isFinite(caps[2])||counts[2]>caps[2])return bad();
  if(s.wallets){
    const allySeats=new Set([...expected[0]].filter(slot=>slot!==POP_PLAYER_SLOT));
    const rowsOk=(rows,seats,exact)=>{
      const seen=new Set();
      if(!Array.isArray(rows))return false;
      for(const R of rows)if(!R||!seats.has(R.slot)||seen.has(R.slot))return false;else seen.add(R.slot);
      return !exact||seen.size===seats.size;
    };
    if(!rowsOk(s.wallets.seats,expected[1],s.v===2)||!rowsOk(s.wallets.allies,allySeats,s.v===2))return bad();
  }
  return {ok:true,counts,missing,caps};
}

/* sessResume applies this envelope before terrain generation. Keep corrupt or
   stale menu values from becoming NaN simulation globals or unknown factions
   before the post-generation world check has a chance to run. */
function sessCheckSetupEnvelope(s){
  const bad=()=>({ok:false,code:'SESSION_SETUP_STATE_INVALID'}),S=s&&s.setup,
    has=(O,k)=>!!O&&Object.prototype.hasOwnProperty.call(O,k),
    factionRuntime=v=>typeof facRuntimeKey==='function'?facRuntimeKey(v)||v:v,
    playerFactionOk=v=>{const key=factionRuntime(v);return typeof v==='string'&&
      (typeof playableFactions==='function'?playableFactions().includes(key):
        key==='nova'||!!(typeof FACTIONS!=='undefined'&&FACTIONS[key]));},
    enemyFactionOk=v=>{const key=factionRuntime(v);return typeof v==='string'&&
      typeof FACTIONS!=='undefined'&&has(FACTIONS,key);},
    battlefieldOk=v=>typeof v==='string'&&((s.v===1&&v==='grand')||
      (typeof BATTLEFIELD_PRESETS!=='undefined'&&has(BATTLEFIELD_PRESETS,v))),
    commanderOk=(fac,id)=>{
      if(!playerFactionOk(fac)||typeof id!=='string'||typeof commanderById!=='function'||
         typeof COMMANDER_ROSTERS==='undefined')return false;
      const key=typeof commanderFactionKey==='function'?commanderFactionKey(fac):fac,
        C=commanderById(id),R=COMMANDER_ROSTERS[key]||[];
      return !!C&&!C.aiOnly&&R.indexOf(C)>=0;
    };
  if(s.v===2&&(!S||typeof S!=='object'||Array.isArray(S)))return bad();
  if(s.v===2){
    const setupKeys=['d','t','m','f','pf','pc','bs','pkg','g','tl','rp','cr','ps','ais','df','inf'],
      topKeys=['map','theme','goal','timeLimit','aiFac','playerFac','playerCommander'];
    if(setupKeys.some(k=>!has(S,k)||S[k]==null)||topKeys.some(k=>!has(s,k)||s[k]==null)||
       S.m!==s.map||S.t!==s.theme||S.g!==s.goal||S.tl!==s.timeLimit||
       S.pf!==s.playerFac||S.pc!==s.playerCommander||!commanderOk(S.pf,S.pc)||
       !enemyFactionOk(s.aiFac)||(S.f!=='random'&&S.f!==s.aiFac)||
       !Array.isArray(S.ais)||S.ais.length!==aiSlots.length)return bad();
  }
  if(S!=null){
    if(typeof S!=='object'||Array.isArray(S)||(S.m!=null&&S.m!==s.map)||(S.t!=null&&S.t!==s.theme)||
       (S.d!=null&&(!Number.isInteger(S.d)||S.d<0||S.d>2))||
       (S.bs!=null&&!battlefieldOk(S.bs))||
       (S.pkg!=null&&(!DEPLOYMENT_PACKAGES||!Object.prototype.hasOwnProperty.call(DEPLOYMENT_PACKAGES,S.pkg)))||
       (S.g!=null&&(!Array.isArray(GOALS)||!GOALS.some(G=>G.id===S.g)))||
       (S.tl!=null&&(!Number.isFinite(S.tl)||S.tl<0||S.tl>7200))||
       (S.rp!=null&&(!Number.isFinite(S.rp)||S.rp<=0||S.rp>4))||
       (S.cr!=null&&(!Number.isFinite(S.cr)||S.cr<0||S.cr>4))||
       (S.ps!=null&&(!Array.isArray(START_ZONES)||!START_ZONES.some(Z=>Z.id===S.ps)))||
       (S.f!=null&&S.f!=='random'&&!enemyFactionOk(S.f))||
       (S.pf!=null&&!playerFactionOk(S.pf))||
       (S.pc!=null&&typeof S.pc!=='string')||
       (S.df!=null&&S.df!==0&&S.df!==1&&typeof S.df!=='boolean')||
       (S.inf!=null&&S.inf!==0&&S.inf!==1&&typeof S.inf!=='boolean'))return bad();
    if(S.ais!=null){
      if(!Array.isArray(S.ais)||S.ais.length>aiSlots.length)return bad();
      for(const A of S.ais)if(!A||typeof A!=='object'||typeof A.on!=='boolean'||typeof A.ally!=='boolean'||
        !Number.isInteger(A.diff)||A.diff<0||A.diff>2||!START_ZONES.some(Z=>Z.id===A.zone)||
        typeof A.behavior!=='string'||!AI_BEHAVIOR_TYPES[A.behavior])return bad();
    }
  }
  if((s.goal!=null&&!GOALS.some(G=>G.id===s.goal))||
     (s.timeLimit!=null&&(!Number.isFinite(s.timeLimit)||s.timeLimit<0||s.timeLimit>7200))||
     (s.aiFac!=null&&s.aiFac!=='random'&&!enemyFactionOk(s.aiFac))||
     (s.playerFac!=null&&!playerFactionOk(s.playerFac))||(s.playerCommander!=null&&typeof s.playerCommander!=='string'))return bad();
  return {ok:true,setup:S};
}

/* FULL_V1 worlds are deterministic only when the authored plan, normalized
   spawn topology and realized resource coordinates all match. These helpers
   keep that static compatibility separate from live site damage/collection. */
function sessLocationPrecheck(s){
  const map=s&&s.map,D=typeof MAPDEFS!=='undefined'&&MAPDEFS[map];
  if(!D)return {ok:false,code:'SESSION_LOCATION_MAP_UNKNOWN'};
  if((s.theme&&D.theme&&s.theme!==D.theme)||(s.setup&&s.setup.m&&s.setup.m!==map))
    return {ok:false,code:'SESSION_LOCATION_SETUP_MISMATCH'};
  const pre=typeof mfPreflightLocationPlanV1==='function'?mfPreflightLocationPlanV1(map):null;
  if(pre&&(!pre.ok||pre.status==='HYBRID_V1'))return {ok:false,code:!pre.ok?
    (pre.error&&pre.error.code||'SESSION_LOCATION_PREFLIGHT_FAILED'):'SESSION_LOCATION_HYBRID_UNSUPPORTED'};
  const full=!!(pre&&pre.status==='FULL_V1');
  const stampVer=typeof SITE_STAMP!=='undefined'?SITE_STAMP.ver:0;
  if(!full){
    /* Version 1 remains a supported legacy payload. Version 2 names the source
       contract, so a map that changed status must not silently cross it. */
    if(s.v===2){
      const L=s.location,P=L&&L.planner,status=pre&&pre.status||'LEGACY_V0';
      if(!L||L.schema!=='DroppedLocationStateV1'||L.version!==1||L.mapSeed!==D.seed||!P||
         P.schema!=='LocationPlanExecutionV1'||P.version!==1||P.stampVersion!==stampVer||P.status!==status)
        return {ok:false,full:false,code:'SESSION_LOCATION_LEGACY_CONTRACT_MISMATCH'};
    }
    return {ok:true,full:false,preflight:pre,location:s.v===2?s.location:null};
  }
  const L=s.location,P=L&&L.planner;
  if(s.v!==2||!L||L.schema!=='DroppedLocationStateV1'||L.version!==1)
    return {ok:false,full:true,code:'SESSION_FULL_V1_REQUIRES_V2'};
  if(L.mapSeed!==D.seed)return {ok:false,full:true,code:'SESSION_LOCATION_SEED_MISMATCH'};
  if(!P||P.schema!=='LocationPlanExecutionV1'||P.version!==1||P.stampVersion!==stampVer||
     P.status!=='FULL_V1'||P.planHash!==pre.planHash||typeof P.realizationHash!=='string'||!P.realizationHash||
     typeof P.topologyKey!=='string'||!P.topologyKey)
    return {ok:false,full:true,code:'SESSION_LOCATION_PLAN_MISMATCH'};
  return {ok:true,full:true,preflight:pre,location:L};
}
function sessExpectedSitePropIds(){
  const out=[];
  if(typeof sitePropPlan!=='undefined')for(const R of sitePropPlan)if(R&&R.id)out.push(R.id);
  if(typeof cityZones!=='undefined')for(const Z of cityZones){
    if(!Z||!Z.siteId)continue;
    for(let k=0;k<(Z.ind?3:2);k++)out.push(Z.siteId+'/loot/'+k);
    if(Z.ind)for(let k=0;k<5;k++)out.push(Z.siteId+'/ring-tank/'+k);
  }
  return out;
}
function sessCaptureLocation(){
  const map=typeof curMap!=='undefined'?curMap:'',D=typeof MAPDEFS!=='undefined'&&MAPDEFS[map];
  const pre=typeof mfPreflightLocationPlanV1==='function'?mfPreflightLocationPlanV1(map):null;
  const status=pre&&pre.status||'LEGACY_V0',plan=typeof SITE_STAMP!=='undefined'&&SITE_STAMP.plan;
  const base={schema:'DroppedLocationStateV1',version:1,mapSeed:D&&D.seed,
    planner:{schema:plan&&plan.schema||'LocationPlanExecutionV1',version:plan&&plan.version||1,
      stampVersion:typeof SITE_STAMP!=='undefined'?SITE_STAMP.ver:0,status:status,
      planHash:pre&&pre.planHash||'',realizationHash:typeof SITE_STAMP!=='undefined'?SITE_STAMP.realizationHash||'':'',
      topologyKey:typeof mfWorldTopologyKey==='function'?mfWorldTopologyKey():''},
    /* Finite reserves are gameplay state on every map contract, not only on
       authored FULL_V1 sites. Returning before this snapshot silently refilled
       legacy/PENDING deposits and geysers after a real page reload. */
    resources:{
      mass:deposits.map((D2,i)=>[i,+D2.x,+D2.y,D2.initialTier|0,+D2.capacity,+D2.remaining.toFixed(3),D2.surveyed|0]),
      energy:geysers.map((G,i)=>[i,+G.x,+G.y,G.initialTier|0,+G.capacity,+G.remaining.toFixed(3),G.surveyed|0])
    }};
  if(status!=='FULL_V1')return base;
  if(!pre.ok||!SITE_STAMP.ok||SITE_STAMP.map!==map||!plan||plan.status!=='FULL_V1'||
     plan.planHash!==pre.planHash||plan.topologyKey!==base.planner.topologyKey||!base.planner.realizationHash)return null;
  base.siteIds=cityZones.filter(Z=>Z&&Z.siteId).map(Z=>Z.siteId);
  base.plotIds=cityPlan.filter(P=>P&&P.siteObjectId).map(P=>P.siteObjectId);
  base.propIds=sessExpectedSitePropIds();
  if(base.siteIds.length!==cityZones.length||base.plotIds.length!==cityPlan.length||
     sitePropPlan.some(R=>!R||!R.id))return null;
  base.zones=cityZones.filter(Z=>Z&&Z.siteId).map(Z=>[Z.siteId,Z.total|0,Z.razed|0,Z.claimed?1:0]);
  base.relics=relics.filter(R=>R&&R.id).map(R=>[R.id,+clamp(R.hp||0,0,R.hpm).toFixed(3),R.alive?1:0,R.part?1:0,
    +(R.lean||0).toFixed(5),+(R.burn||0).toFixed(5),R.fallT==null?null:+R.fallT.toFixed(3)]);
  if(base.relics.length!==relics.length)return null;
  base.tanks=tanks.filter(T=>T&&T.id).map(T=>[T.id,+T.x,+T.y,+T.s,+clamp(T.hp||0,0,260).toFixed(3),
    T.alive?1:0,+(T.fuse||0).toFixed(3)]);
  base.crates=crates.filter(C=>C&&C.id).map(C=>[C.id,+C.x,+C.y,C.kind&&C.kind.id||'mass',
    +(C.alt||0).toFixed(3),+(C.t||0).toFixed(3),C.seen?1:0,C.site||'',C.siteName||'',
    C.announced?1:0,C.mission?1:0]);
  base.floraIds=trees.filter(T=>T&&T.id).map(T=>T.id);
  base.timers=[typeof crateT==='number'?+crateT.toFixed(3):0,
    typeof sitePickupT==='number'?+sitePickupT.toFixed(3):0];
  return base;
}
function sessLocationGeneratedCheck(s){
  const C=sessLocationPrecheck(s);if(!C.ok)return C;
  if(typeof curMap==='undefined'||curMap!==s.map)
    return {ok:false,full:C.full,code:'SESSION_LOCATION_MAP_MISMATCH'};
  if(!C.full)return C;
  const L=C.location,P=L.planner,S=typeof SITE_STAMP!=='undefined'?SITE_STAMP:null;
  if(!S||!S.ok||S.ver!==P.stampVersion||S.map!==s.map||!S.plan||
     S.plan.schema!==P.schema||S.plan.version!==P.version||S.plan.status!=='FULL_V1'||S.plan.planHash!==P.planHash||
     S.realizationHash!==P.realizationHash||S.plan.realizationHash!==P.realizationHash||
     S.plan.topologyKey!==P.topologyKey||typeof mfWorldTopologyKey!=='function'||mfWorldTopologyKey()!==P.topologyKey)
    return {ok:false,full:true,code:'SESSION_LOCATION_REALIZATION_MISMATCH'};
  return C;
}
function sessLocationCurrentCheck(s){
  const C=sessLocationGeneratedCheck(s);if(!C.ok)return C;
  const same=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<.001;
  /* V2 owns finite resource state on every planner status. A deterministic
     regen proves coordinates and capacities; the save supplies what remains. */
  if(s.v===2){
    const L=C.location,M=L&&L.resources&&L.resources.mass,E=L&&L.resources&&L.resources.energy;
    const resourceOk=(rows,live)=>Array.isArray(rows)&&rows.length===live.length&&rows.every((R,i)=>R&&R.length>=7&&
      R[0]===i&&same(R[1],live[i].x)&&same(R[2],live[i].y)&&R[3]===(live[i].initialTier|0)&&
      same(R[4],live[i].capacity)&&Number.isFinite(R[5])&&R[5]>=0&&R[5]<=live[i].capacity&&
      Number.isInteger(R[6])&&R[6]>=0&&R[6]<=7);
    if(!resourceOk(M,deposits)||!resourceOk(E,geysers))
      return {ok:false,full:C.full,code:'SESSION_LOCATION_RESOURCE_INVALID'};
    const depClaims=new Set(),geoClaims=new Set();
    for(const B of s.blds){
      const dep=B[14],geo=B[15],grant=B[16];
      if((B[0]==='mex'&&(grant!==0&&grant!==1))||(B[0]!=='mex'&&grant!=null))
        return {ok:false,full:C.full,code:'SESSION_LOCATION_BUILDINGS_INVALID'};
      if(dep!=null&&(!Number.isInteger(dep)||dep<0||dep>=deposits.length||B[0]!=='mex'||depClaims.has(dep)))
        return {ok:false,full:C.full,code:'SESSION_LOCATION_RESOURCE_CLAIM_INVALID'};
      if(geo!=null&&(!Number.isInteger(geo)||geo<0||geo>=geysers.length||B[0]!=='geo'||geoClaims.has(geo)))
        return {ok:false,full:C.full,code:'SESSION_LOCATION_RESOURCE_CLAIM_INVALID'};
      if(dep!=null)depClaims.add(dep);if(geo!=null)geoClaims.add(geo);
    }
  }
  if(!C.full)return C;
  const L=C.location,uniq=a=>Array.isArray(a)&&a.every(id=>typeof id==='string'&&!!id)&&new Set(a).size===a.length;
  const siteIds=cityZones.filter(Z=>Z&&Z.siteId).map(Z=>Z.siteId);
  const plotIds=cityPlan.filter(P=>P&&P.siteObjectId).map(P=>P.siteObjectId);
  const propIds=sessExpectedSitePropIds();
  if(!uniq(L.siteIds)||!uniq(L.plotIds)||!uniq(L.propIds)||JSON.stringify(L.siteIds)!==JSON.stringify(siteIds)||
     JSON.stringify(L.plotIds)!==JSON.stringify(plotIds)||JSON.stringify(L.propIds)!==JSON.stringify(propIds)||
     JSON.stringify(plotIds)!==JSON.stringify(relics.map(R=>R&&R.id||'')))
    return {ok:false,full:true,code:'SESSION_LOCATION_IDENTITY_MISMATCH'};
  const zones=new Map(cityZones.filter(Z=>Z&&Z.siteId).map(Z=>[Z.siteId,Z]));
  const relicMap=new Map(relics.filter(R=>R&&R.id).map(R=>[R.id,R]));
  const tankMap=new Map(tanks.filter(T=>T&&T.id).map(T=>[T.id,T]));
  const crateMap=new Map(crates.filter(K=>K&&K.id).map(K=>[K.id,K]));
  const floraMap=new Map(trees.filter(T=>T&&T.id).map(T=>[T.id,T]));
  const rowsOk=(rows,map,check)=>Array.isArray(rows)&&rows.length===map.size&&uniq(rows.map(R=>R&&R[0]))&&rows.every(R=>R&&map.has(R[0])&&check(R,map.get(R[0])));
  if(!rowsOk(L.relics,relicMap,(R,O)=>R.length>=7&&Number.isFinite(R[1])&&R[1]>=0&&R[1]<=O.hpm&&
       (R[2]===0||R[2]===1)&&(!R[2]||R[1]>0)&&(R[3]===0||R[3]===1)&&(!R[3]||O.kind===5)&&
       Number.isFinite(R[4])&&Math.abs(R[4])<=.5&&Number.isFinite(R[5])&&R[5]>=0&&R[5]<=1.5&&
       (R[6]==null||(Number.isFinite(R[6])&&R[6]>=0)))||
     !rowsOk(L.tanks,tankMap,(R,O)=>R.length>=7&&same(R[1],O.x)&&same(R[2],O.y)&&same(R[3],O.s)&&
       Number.isFinite(R[4])&&R[4]>=0&&R[4]<=260&&(R[5]===0||R[5]===1)&&
       Number.isFinite(R[6])&&R[6]>=0&&R[6]<=3))
    return {ok:false,full:true,code:'SESSION_LOCATION_DYNAMIC_INVALID'};
  const deadByZone=new Map(L.siteIds.map(id=>[id,0]));
  for(const R of L.relics)if(!R[2]){
    const O=relicMap.get(R[0]),Z=cityZones[O.zone];
    if(!Z||!deadByZone.has(Z.siteId))return {ok:false,full:true,code:'SESSION_LOCATION_ZONE_LINK_INVALID'};
    deadByZone.set(Z.siteId,deadByZone.get(Z.siteId)+1);
  }
  if(!rowsOk(L.zones,zones,(R,Z)=>R.length>=4&&R[1]===Z.total&&R[2]===deadByZone.get(R[0])&&
       R[2]>=0&&R[2]<=R[1]&&(R[3]===0||R[3]===1)&&(!R[3]||(R[1]>0&&R[2]===R[1]))))
    return {ok:false,full:true,code:'SESSION_LOCATION_ZONE_PROGRESS_INVALID'};
  if(!Array.isArray(L.crates)||!uniq(L.crates.map(R=>R&&R[0]))||L.crates.some(R=>!R||R.length<11||
     !crateMap.has(R[0])||!same(R[1],crateMap.get(R[0]).x)||!same(R[2],crateMap.get(R[0]).y)||
     !CRATE_KINDS.some(K=>K.id===R[3])||!Number.isFinite(R[4])||!Number.isFinite(R[5])||
     (R[6]!==0&&R[6]!==1)||(R[9]!==0&&R[9]!==1)||(R[10]!==0&&R[10]!==1)))
    return {ok:false,full:true,code:'SESSION_LOCATION_CRATE_INVALID'};
  const expectedFlora=new Set(sitePropPlan.filter(R=>R&&R.kind==='flora').map(R=>R.id));
  if(!uniq(L.floraIds)||L.floraIds.some(id=>!expectedFlora.has(id)||!floraMap.has(id)))
    return {ok:false,full:true,code:'SESSION_LOCATION_FLORA_INVALID'};
  if(!Array.isArray(L.timers)||L.timers.length!==2||L.timers.some(v=>!Number.isFinite(v)||v<0||v>1e5))
    return {ok:false,full:true,code:'SESSION_LOCATION_TIMERS_INVALID'};
  C.maps={zones,relics:relicMap,tanks:tankMap,crates:crateMap,flora:floraMap};return C;
}
function sessApplyResourceState(C){
  const L=C&&C.location,R=L&&L.resources;if(!R)return true;
  for(const row of R.mass){const D=deposits[row[0]],before=D.tier;D.remaining=row[5];D.surveyed=row[6]|0;D.taken=false;
    const after=depositTier(D);if(after!==before&&typeof refreshResourceTerrainNode==='function')refreshResourceTerrainNode(D,'mass',before,after);}
  for(const row of R.energy){const G=geysers[row[0]],before=G.tier;G.remaining=row[5];G.surveyed=row[6]|0;G.taken=false;
    const after=geyserTier(G);if(after!==before&&typeof refreshResourceTerrainNode==='function')refreshResourceTerrainNode(G,'energy',before,after);}
  /* `taken` is derived from the structures actually restored, never trusted
     from storage. That keeps a collected/depleted field from being reserved by
     stale bytes and also fixes restored geothermal plants, whose legacy addBld
     path did not claim their vent. */
  for(const B of blds){
    if(!B||!B.alive)continue;
    if(B.type==='mex'){
      if(!(B.dep>=0&&B.dep<deposits.length)&&typeof econBindResourceNode==='function')econBindResourceNode(B);
      if(B.dep>=0&&B.dep<deposits.length){const D=deposits[B.dep];D.taken=true;B.nodeTier=depositTier(D);B.nodeRemaining=D.remaining;}
    }else if(B.type==='geo'){
      if(!(B.geo>=0&&B.geo<geysers.length)&&typeof econBindResourceNode==='function')econBindResourceNode(B);
      if(B.geo>=0&&B.geo<geysers.length){const G=geysers[B.geo];G.taken=true;B.nodeTier=geyserTier(G);B.nodeRemaining=G.remaining;}
    }
  }
  return true;
}
function sessApplyLocationState(C){
  if(!C)return false;
  if(!C.full)return sessApplyResourceState(C);
  const L=C.location;
  for(const R of L.zones){const Z=C.maps.zones.get(R[0]);Z.razed=R[2]|0;Z.claimed=R[3]?1:0;}
  for(const R of L.relics){const O=C.maps.relics.get(R[0]);O.hp=R[1];O.alive=!!R[2];O.part=R[3]?1:0;
    O.lean=R[4]||0;O.burn=R[5]||0;if(R[6]==null)delete O.fallT;else O.fallT=R[6];}
  for(const R of L.tanks){const O=C.maps.tanks.get(R[0]);O.hp=R[4];O.alive=!!R[5];O.fuse=R[6]||0;}
  const savedCrates=new Map(L.crates.map(R=>[R[0],R])),expected=new Set(L.propIds);
  for(let i=crates.length-1;i>=0;i--)if(crates[i].id&&expected.has(crates[i].id)&&!savedCrates.has(crates[i].id))crates.splice(i,1);
  for(const R of L.crates){const O=C.maps.crates.get(R[0]),K=CRATE_KINDS.find(Q=>Q.id===R[3]);
    O.kind=K;O.alt=R[4];O.t=R[5];O.seen=!!R[6];O.site=R[7]||'';O.siteName=R[8]||'';
    O.announced=!!R[9];O.mission=!!R[10];}
  const liveFlora=new Set(L.floraIds);
  for(let i=trees.length-1;i>=0;i--)if(trees[i].id&&C.maps.flora.has(trees[i].id)&&!liveFlora.has(trees[i].id))trees.splice(i,1);
  if(!sessApplyResourceState(C))return false;
  crateT=L.timers[0];sitePickupT=L.timers[1];
  if(typeof mfMoveBlockersDirty==='function')mfMoveBlockersDirty();
  if(typeof mfArtObsRockGridReset==='function')mfArtObsRockGridReset();
  if(typeof markBuildZone==='function')markBuildZone();
  return true;
}
function sessCaptureWrecks(){
  if(typeof wrecks==='undefined')return [];
  return wrecks.map(W=>[+W.x,+W.y,+(W.a||0),+(W.s||0),+(W.mass||0),+(W.m0||0),
    +(W.en||0),+(W.e0||0),W.kind|0,String(W.style||''),+(W.life||0),+(W.glow||0),+(W.ts||0)]);
}
function sessCheckWrecks(s){
  if(s.v===1&&!Array.isArray(s.wrecks))return {ok:true,rows:null};
  const rows=s.wrecks,cap=typeof WRECK_CAP==='number'?WRECK_CAP:600,span=typeof MAP==='number'?MAP:20000;
  if(!Array.isArray(rows)||rows.length>cap)return {ok:false,code:'SESSION_WRECKS_INVALID'};
  for(const R of rows){
    if(!Array.isArray(R)||R.length<13||R.slice(0,9).some(v=>!Number.isFinite(v))||
       !Number.isFinite(R[10])||!Number.isFinite(R[11])||!Number.isFinite(R[12])||
       R[0]<-span||R[0]>span*2||R[1]<-span||R[1]>span*2||R[3]<0||R[3]>2000||
       R[4]<-.01||R[5]<-.01||R[6]<-.01||R[7]<-.01||R[8]<0||R[8]>32||
       typeof R[9]!=='string'||R[9].length>64||R[10]<0||R[11]<0||R[12]<0)
      return {ok:false,code:'SESSION_WRECKS_INVALID'};
  }
  return {ok:true,rows};
}
function sessApplyWrecks(C){
  if(!C||!C.rows)return;
  wrecks.length=0;
  for(const R of C.rows)wrecks.push({x:R[0],y:R[1],a:R[2],s:R[3],mass:Math.max(0,R[4]),m0:Math.max(0,R[5]),
    en:Math.max(0,R[6]),e0:Math.max(0,R[7]),kind:R[8]|0,style:R[9],life:R[10],glow:R[11],ts:R[12]});
}
function sessCaptureHeroState(){
  return {lvl:heroLvl|0,xp:+heroXp,next:+heroXpNext,pending:pendingLevels|0,
    modifiers:[+heroDmgMult,+heroRegen,+commanderHpMult,+armyDmgMult,+salvageMult,+bldHpMult,+playerBuildMult,+blastRadius],
    unlock:abUnlock.map(Boolean),cool:abCool.map(v=>+v||0),
    /* These three are live level-up effects, not derivable from heroLvl: the
       player can choose upgrades in different orders and repeat some of them. */
    maxHp:heroIdx>=0&&ualive[heroIdx]?+uhpm[heroIdx]:0,
    abilityCd:AB_CD.map(v=>+v),income:[+bonusMass,+bonusEnergy]};
}
function sessCheckHeroState(s){
  const H=s.hero;if(!H)return {ok:s.v===1,state:null,code:'SESSION_HERO_STATE_MISSING'};
  const progression=Number.isFinite(H.maxHp)&&H.maxHp>0&&H.maxHp<=1e9&&
    Array.isArray(H.abilityCd)&&H.abilityCd.length===5&&H.abilityCd.every(v=>Number.isFinite(v)&&v>0&&v<=1e5)&&
    Array.isArray(H.income)&&H.income.length===2&&H.income.every(v=>Number.isFinite(v)&&v>=0&&v<=1e5);
  if(!Number.isInteger(H.lvl)||H.lvl<1||H.lvl>100||!Number.isFinite(H.xp)||H.xp<0||
     !Number.isFinite(H.next)||H.next<=0||H.xp>=H.next||!Number.isInteger(H.pending)||H.pending<0||H.pending>=H.lvl||
     !Array.isArray(H.modifiers)||H.modifiers.length!==8||H.modifiers.some(v=>!Number.isFinite(v)||v<0||v>1e5)||
     !Array.isArray(H.unlock)||H.unlock.length!==5||H.unlock.some(v=>typeof v!=='boolean')||
     !Array.isArray(H.cool)||H.cool.length!==5||H.cool.some(v=>!Number.isFinite(v)||v<0||v>1e5)||
     (s.v===2&&!progression)||(s.v===1&&(H.maxHp!=null||H.abilityCd!=null||H.income!=null)&&!progression))
     return {ok:false,state:null,code:'SESSION_HERO_STATE_INVALID'};
  return {ok:true,state:H};
}
function sessApplyHeroState(C){
  const H=C&&C.state;if(!H)return;
  heroLvl=H.lvl;heroXp=H.xp;heroXpNext=H.next;pendingLevels=H.pending;
  heroDmgMult=H.modifiers[0];heroRegen=H.modifiers[1];commanderHpMult=H.modifiers[2];
  armyDmgMult=H.modifiers[3];salvageMult=H.modifiers[4];bldHpMult=H.modifiers[5];
  playerBuildMult=H.modifiers[6];blastRadius=H.modifiers[7];
  abUnlock=H.unlock.slice();abCool=H.cool.slice();
  if(H.abilityCd)for(let i=0;i<AB_CD.length;i++)AB_CD[i]=H.abilityCd[i];
  if(H.income){bonusMass=H.income[0];bonusEnergy=H.income[1];}
  if(H.maxHp>0&&heroIdx>=0&&ualive[heroIdx]){uhpm[heroIdx]=H.maxHp;uhp[heroIdx]=Math.min(uhp[heroIdx],H.maxHp);}
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
        ufield[i]=requestField(utx[i],uty[i],!!T.naval,mfNavUnitClearance(T));
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
    const location=sessCaptureLocation();
    const currentPre=typeof mfPreflightLocationPlanV1==='function'?mfPreflightLocationPlanV1(curMap):null;
    if(currentPre&&currentPre.status==='FULL_V1'&&!location)return false;
    const snap={
      v:2, at:Date.now(), reason:reason||'unknown',
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
      location,
      /* Destruction rewards have already been emitted. Preserve what remains
         instead of recreating salvage or rolling Commander XP backward. */
      wrecks:sessCaptureWrecks(),
      hero:sessCaptureHeroState(),
      extraStats:{nests:stats.nests|0,reclaimed:+(stats.reclaimed||0),campaignCache:stats.campaignCache|0},
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
    if(!s||(s.v!==1&&s.v!==2)||!s.units) return null;
    /* An hours-old snapshot is not a dropped session, it is an abandoned one,
       and offering it teaches the player that the prompt is noise. */
    if(Date.now()-(s.at||0)>SESS_TTL_MS){ sessClear(); return null; }
    const core=sessCheckCoreState(s),setup=sessCheckSetupEnvelope(s);
    if(!core.ok||!setup.ok){window.__mfSessionReject=!core.ok?core.code:setup.code;sessClear();return null;}
    /* This is deliberately before sessResume writes META/setup globals. A
       hashless old payload may still resume a legacy map, but never FULL_V1. */
    const location=sessLocationPrecheck(s);
    if(!location.ok){ window.__mfSessionReject=location.code;sessClear();return null; }
    if(s.v===2){
      const W=sessCheckWrecks(s),H=sessCheckHeroState(s),X=s.extraStats;
      const extraOk=!!X&&Number.isInteger(X.nests)&&X.nests>=0&&Number.isFinite(X.reclaimed)&&
        X.reclaimed>=0&&Number.isInteger(X.campaignCache)&&X.campaignCache>=0;
      if(!W.ok||!H.ok||!extraOk){window.__mfSessionReject=!W.ok?W.code:!H.ok?H.code:'SESSION_STATS_INVALID';
        sessClear();return null;}
    }
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
  /* Validate the regenerated FULL_V1 world and every additive payload before
     killing even one fresh object. A failed recovery must leave a playable
     freshly generated match, not half of the snapshot and half of the reset. */
  const coreCheck=sessCheckCoreState(s),setupCheck=coreCheck.ok?sessCheckSetupEnvelope(s):null,
    rosterCheck=coreCheck.ok&&setupCheck.ok?sessCheckRosterRealizable(s):null,
    locationCheck=coreCheck.ok&&setupCheck.ok&&rosterCheck.ok?sessLocationCurrentCheck(s):null;
  const wreckCheck=coreCheck.ok&&setupCheck.ok?sessCheckWrecks(s):null,
    heroCheck=coreCheck.ok&&setupCheck.ok?sessCheckHeroState(s):null;
  const X=s.extraStats,extraOk=s.v===1||!!X&&Number.isInteger(X.nests)&&X.nests>=0&&
    Number.isFinite(X.reclaimed)&&X.reclaimed>=0&&Number.isInteger(X.campaignCache)&&X.campaignCache>=0;
  if(!coreCheck.ok||!setupCheck.ok||!rosterCheck.ok||!locationCheck.ok||!wreckCheck.ok||!heroCheck.ok||!extraOk){
    window.__mfSessionReject=!coreCheck.ok?coreCheck.code:!setupCheck.ok?setupCheck.code:!rosterCheck.ok?rosterCheck.code:!locationCheck.ok?locationCheck.code:!wreckCheck.ok?wreckCheck.code:
      !heroCheck.ok?heroCheck.code:'SESSION_STATS_INVALID';
    sessClear();return false;
  }
  try{
    /* Clear whatever the fresh start spawned before laying the snapshot down,
       or the player resumes with two commanders and a doubled army. */
    for(let i=0;i<unitHigh;i++) if(ualive[i]) killUnit(i,true);
    /* EVERY structure, nests included. sessCaptureBuildings has no type filter,
       so the snapshot already holds every live hive; exempting them from the
       wipe therefore did not preserve them, it DUPLICATED them. setupNests()
       is seeded off the map seed (srand((def.seed^0x1234f)|1)), so the fresh
       generation lays hives down at the exact same coordinates the snapshot
       recorded — one resume put two stacked nests on every site, a second
       resume put four, and every one of them trickles and erupts independently.
       It also resurrected at full health every hive the player had cleared.
       Wiping them and replaying the snapshot makes the snapshot authoritative,
       which is what it is for the other 30-odd structure types already. */
    for(const B of blds) if(B.alive) B.alive=false;
    /* The regenerated baseline may contain extractors/geothermal plants that
       are absent from the snapshot. Dead structures no longer own anything;
       clear all reservations before the saved live structures reclaim their
       explicit node indices below. FULL_V1 re-derives this again after finite
       resource state is applied, while legacy/PENDING now gets the same rule. */
    for(const D of deposits)D.taken=false;
    for(const G of geysers)G.taken=false;
    refreshBldLive();

    const bMap=new Map();
    for(const b of s.blds){
      const [type,team,x,y,hp,prog,lvl,paidM,paidE,oldBi,allyAI,aiBaseSlot,bfac,bBehavior,depRef,geoRef,freeMiner]=b;
      /* Structures are restored before the captured unit roster. Suppress
         instant package grants here or each Extractor creates a fresh
         Prospector before its saved one is replayed below. */
      const before=blds.length,B=addBld(type,team,x,y,true,0,true);
      if(!B||blds.length!==before+1||blds[blds.length-1]!==B)throw new Error('SESSION_BUILDING_REPLAY_FAILED');
      B.hp=hp;
      /* Current snapshots preserve exact progress plus grant state. The
         clamp is a defensive bridge for any intermediate v2 payload that
         rounded an unspent near-complete Extractor to 1. */
      B.prog=type==='mex'&&freeMiner===0&&prog>=1?1-1e-6:prog;
      B.lvl=lvl||1;
      if(type==='mex')B.freeMiner=freeMiner==null?B.prog>=1:!!freeMiner;
      if(paidM!=null)B.buildPaidM=paidM;if(paidE!=null)B.buildPaidE=paidE;
      bMap.set(oldBi,blds.length-1);
      if(allyAI!=null)B.allyAI=allyAI; if(aiBaseSlot!=null)B.aiBaseSlot=aiBaseSlot;
      if(bfac!=null)B.fac=bfac; if(bBehavior!=null)B.aiBehavior=bBehavior;
      if(depRef!=null&&depRef>=0&&depRef<deposits.length){
        if(B.dep>=0&&B.dep!==depRef&&deposits[B.dep])deposits[B.dep].taken=false;
        B.dep=depRef;deposits[depRef].taken=true;B.rich=(deposits[depRef].initialTier||1)>=3;
      }
      if(geoRef!=null&&geoRef>=0&&geoRef<geysers.length){
        if(B.geo>=0&&B.geo!==geoRef&&geysers[B.geo])geysers[B.geo].taken=false;
        B.geo=geoRef;geysers[geoRef].taken=true;
      }
    }
    if(bMap.size!==s.blds.length)throw new Error('SESSION_BUILDING_REPLAY_INCOMPLETE');
    refreshBldLive();

    /* These are direct state assignments. Never call collapseBlock, blowTank,
       addWreck or a pickup handler here: each of those emits gameplay rewards. */
    if(!sessApplyLocationState(locationCheck))throw new Error('SESSION_LOCATION_REPLAY_FAILED');
    sessApplyWrecks(wreckCheck);
    sessApplyHeroState(heroCheck);

    const U=s.units, uMap=new Map(), spawned=[];
    for(let k=0;k<U.t.length;k++){
      const cmd=U.cmd?U.cmd[k]:undefined;
      const i=spawnUnit(U.t[k],U.tm[k],U.x[k],U.y[k],cmd);
      if(i<0)throw new Error('SESSION_UNIT_REPLAY_FAILED');
      spawned.push(i);
      if(U.oi) uMap.set(U.oi[k],i);
      uhp[i]=U.hp[k]; uang[i]=U.ang[k]; ustate[i]=U.st[k];
      utx[i]=U.tx[k]; uty[i]=U.ty[k]; uhold[i]=U.hold[k];
      if(typeof umode!=='undefined') umode[i]=U.mode[k];
      /* Guarded on the array, not on the snapshot version: a v1 snapshot taken
         before these were captured simply has no vt/kl and keeps its old
         behaviour of resuming at rank 0. */
      if(typeof uvet!=='undefined'&&U.vt) uvet[i]=U.vt[k]|0;
      if(typeof ukills!=='undefined'&&U.kl) ukills[i]=U.kl[k]|0;
    }
    if(spawned.length!==U.t.length||spawned.some(i=>i<0||!ualive[i])||U.oi&&uMap.size!==U.t.length)
      throw new Error('SESSION_UNIT_REPLAY_INCOMPLETE');
    /* Player ledger first. Seat wallets then overwrite the team-1 mirror so a
       1v2/1v3 resume does not dump three mex belts into one shared bank. */
    /* A wholesale RESTORE, not income - econSetBanks, never credit(). Called
       PER TEAM on purpose: the team-less form also resets both caps to
       MCAP0/ECAP0, which would silently wipe the silo bonuses this save is
       carrying. Keeps the A6 invariant true without pretending a restore is an
       earning. */
    if(typeof econSetBanks==='function'&&s.resM&&s.resE){
      econSetBanks(s.resM[0], s.resE[0], 0);
      if(!s.wallets) econSetBanks(s.resM[1], s.resE[1], 1);
    }
    sessApplyWallets(s.wallets);
    sessRestoreOrders(U, spawned, uMap, bMap, s.patrols);
    if(typeof stats!=='undefined'){
      stats.t=s.t||0;
      if(s.kills) stats.kills=s.kills.slice();
      if(s.built) stats.built=s.built.slice();
      if(X){stats.nests=X.nests;stats.reclaimed=X.reclaimed;stats.campaignCache=X.campaignCache;}
    }
    if(typeof matchClock!=='undefined') matchClock=s.clock||0;
    if(typeof AI!=='undefined'&&s.wave){ AI.wave=s.wave.n==null?1:s.wave.n; AI.waveTimer=s.wave.timer==null?60:s.wave.timer; }
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
    if(heroIdx<0)throw new Error('SESSION_PLAYER_COMMANDER_REPLAY_FAILED');
    /* The first hero-state application restored globals before spawnUnit used
       them. Now that the player seat has a new unit index, bind Nano Plating's
       exact live max HP to that unit as well. */
    sessApplyHeroState(heroCheck);
    sessClear();
    return true;
  }catch(e){ window.__mfSessionReject='SESSION_RESTORE_REPLAY_FAILED';sessClear();return false; }
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
    const compatibility=sessLocationPrecheck(s);
    if(!compatibility.ok){sessClear();sessRenderResume();return;}
    /* Apply only the topology-bearing fields first. If normalization cannot
       reproduce the saved key, restore the menu globals before any terrain or
       fresh match state is generated. */
    const prior={map:curMap,theme:curTheme,preset:battlefieldPreset,start:playerStartZone,
      slots:aiSlots.map(A=>({...A})),setup:typeof META!=='undefined'?META.setup:null};
    const su=s.setup||{};
    if(su.bs&&typeof battlefieldPreset!=='undefined'&&typeof battlefieldPresetKey==='function') battlefieldPreset=battlefieldPresetKey(su.bs);
    if(su.ps&&START_ZONES.some(Z=>Z.id===su.ps))playerStartZone=su.ps;
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
    if(typeof normalizeAiSlotsForBattlefield==='function')normalizeAiSlotsForBattlefield();
    if(compatibility.full&&mfWorldTopologyKey()!==compatibility.location.planner.topologyKey){
      curMap=prior.map;curTheme=prior.theme;battlefieldPreset=prior.preset;playerStartZone=prior.start;
      for(let i=0;i<aiSlots.length;i++)Object.assign(aiSlots[i],prior.slots[i]);
      if(typeof META!=='undefined')META.setup=prior.setup;
      window.__mfSessionReject='SESSION_LOCATION_TOPOLOGY_MISMATCH';sessClear();sessRenderResume();return;
    }
    /* Static compatibility is established. The remaining setup values do not
       participate in site realization and can now become live. */
    if(s.setup&&typeof META!=='undefined') META.setup=s.setup;
    if(su.d!=null&&typeof difficulty!=='undefined') difficulty=su.d;
    if(su.pkg&&typeof deploymentPackage!=='undefined'&&typeof DEPLOYMENT_PACKAGES!=='undefined'&&DEPLOYMENT_PACKAGES[su.pkg]) deploymentPackage=su.pkg;
    if(su.inf!=null&&typeof infestationOn!=='undefined') infestationOn=!!su.inf;
    if(su.df!=null&&typeof defenseFocus!=='undefined') defenseFocus=su.df?1:0;
    if(su.rp&&typeof resPace!=='undefined') resPace=+su.rp;
    if(su.cr!=null&&typeof crateRate!=='undefined') crateRate=crateRateBase=+su.cr;
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
    if(typeof applyTheme==='function') applyTheme();
    /* Do not require SITE_STAMP here: on a cold reload no world has been
       generated yet. newSkirmish() realizes the saved topology below, and
       sessRestoreInto() performs the full identity/resource check before it
       removes a single fresh unit or structure. */
    sessPending=s;
    if(typeof initAudio==='function') initAudio();
    if(typeof sfx==='function') sfx('ui');
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
