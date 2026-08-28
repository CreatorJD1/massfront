;
;
/* ============================================================================
   BATTLEFIELD INTEL — vision, radar, detection, stealth
   ----------------------------------------------------------------------------
   Fog already hid models, bars, FX and the minimap. What it did not do was
   read the intel data the roster already carried:

     TYPES[].scout   Kestrel (and faction scouts) used the same air bubble as a
                     Wasp. The card said "150 sight"; fog stamped 14 cells.
     umode === 4     GHOST: findEnemy skipped them, firing broke cover, hulls
                     went translucent — and the player still SAW them the
                     moment they entered a sensor circle. "Unseen until you
                     fire" was targeting-only.
     BT.uplink       Targeting Array / radar dish. Boosted towers and the build
                     grid. Vision was the generic 10-cell building stamp, so a
                     radar mast saw the same as a silo.
     WC.dark         "vision suffers" only forced night. Fog Bank (fogb) was
                     the only wildcard that actually shortened sensors.

   Jamming has no authored radius/flag. Ghost Net already stuns and scans; a
   dedicated radar-denial layer is a later plan item, not invented here.

   Radar is a COMMAND-MAP layer, not a second 3D reveal. Uplink/techlab stamp
   fogRadar; the minimap draws those contacts; render3d keeps using
   fogEntityVisible (visual). That split is why this file must not live in
   the renderer — and why it never writes GL state.

   Detection is the answer to GHOST. Scouts, uplinks, techlabs, HQs and live
   survey scans stamp fogDetect. intelCanTarget (sim.js seam) lets a detector
   lock a silent-running hull; fogEntityVisible hides it from the player
   until then. Same numbers both ways, so a cloak that fools the eye also
   fools the gun until a sensor is in range.
   ============================================================================ */
const INTEL_VIS_GROUND=10, INTEL_VIS_AIR=14, INTEL_VIS_SCOUT=18, INTEL_VIS_GHOST=4;
const INTEL_VIS_HQ=22, INTEL_VIS_TURRET=12, INTEL_VIS_BLD=10, INTEL_VIS_CARRIER=24;
/* Radar cells are larger than visual on purpose: the mast hears further than
   it sees. Contacts are minimap-only (see intelRadarContact). */
const INTEL_RADAR_UPLINK=22, INTEL_RADAR_TECHLAB=16;
/* Detect is shorter than radar. Omni-style pierce, not a second map hack. */
const INTEL_DET_SCOUT=16, INTEL_DET_UPLINK=14, INTEL_DET_TECHLAB=12, INTEL_DET_HQ=8;
const fogRadar=new Uint8Array(FN*FN);
const fogDetect=new Uint8Array(FN*FN);
const intelGhostIdx=[];
let intelGhostStamp=-1;
const intelHasGhost=[0,0,0];

/* Last-known contacts are a derived command-intel ledger, not gameplay or save
   authority. `stats.t` is the only clock: replays therefore age the same way
   at every render rate and pausing the renderer cannot create or expire intel.
   Unit slot + generation is the stable identity because slots are recycled. */
const INTEL_CONTACT_CAP=256;
const INTEL_CONTACT_TTL={visual:10,radar:18,scan:14,aerial:16,manual:10};
const INTEL_CONTACT_CONF={visual:1,radar:.72,scan:.86,aerial:.92,manual:.65};
const intelContacts=[];
let intelContactClock=0;

function intelContactNow(){
  return typeof stats!=='undefined'&&stats&&Number.isFinite(stats.t)?stats.t:0;
}
function intelContactAdvanceClock(now){
  now=Number.isFinite(now)?now:intelContactNow();
  if(now>intelContactClock) intelContactClock=now;
  return intelContactClock;
}
function intelContactDefaults(source){
  source=typeof source==='string'&&source?source:'manual';
  return {source,
    confidence:INTEL_CONTACT_CONF[source]===undefined?INTEL_CONTACT_CONF.manual:INTEL_CONTACT_CONF[source],
    ttl:INTEL_CONTACT_TTL[source]===undefined?INTEL_CONTACT_TTL.manual:INTEL_CONTACT_TTL[source]};
}
function intelContactSnapshot(C){
  return {team:C.team,target:C.target,generation:C.generation,x:C.x,y:C.y,
    source:C.source,confidence:C.confidence,age:C.age,timestamp:C.timestamp,
    expiresAt:C.expiresAt};
}
function intelContactTick(now){
  now=intelContactAdvanceClock(now);
  for(let i=intelContacts.length-1;i>=0;i--){
    const C=intelContacts[i];
    /* A living slot with another generation is a different chassis. A dead
       slot with the same generation remains valid last-known intelligence. */
    if(C.target<0||C.target>=MAXU||(ualive[C.target]&&ugen[C.target]!==C.generation)){
      intelContacts.splice(i,1);continue;
    }
    C.age=Math.max(0,now-C.timestamp);
    const span=Math.max(.000001,C.expiresAt-C.timestamp);
    C.confidence=C.baseConfidence*clamp((C.expiresAt-now)/span,0,1);
    if(now>=C.expiresAt||C.confidence<=0) intelContacts.splice(i,1);
  }
  return intelContacts.length;
}
function intelContactFind(team,target,generation){
  for(let i=0;i<intelContacts.length;i++){
    const C=intelContacts[i];
    if(C.team===team&&C.target===target&&(generation===undefined||C.generation===generation)) return i;
  }
  return -1;
}
function intelContactWorse(A,B){
  return A.confidence<B.confidence||
    (A.confidence===B.confidence&&(A.timestamp<B.timestamp||
    (A.timestamp===B.timestamp&&(A.team<B.team||
    (A.team===B.team&&(A.target<B.target||
    (A.target===B.target&&A.generation<B.generation)))))));
}
/* Minimal later-integration seam. Supplying x/y/generation/time is optional
   for live units, but lets a fixed-step caller publish a sampled observation
   without the renderer mutating the record. Stale updates never rewind it. */
function intelContactUpdate(team,target,source,confidence,ttl,x,y,generation,now){
  team=team|0;target=target|0;
  if(team<0||team>30||target<0||target>=MAXU) return null;
  const sampledAt=Number.isFinite(now)?now:intelContactNow();
  const staleSample=sampledAt<intelContactClock;
  now=intelContactAdvanceClock(sampledAt);
  generation=Number.isFinite(generation)?generation|0:ugen[target]|0;
  if(ualive[target]&&ugen[target]!==generation) return null;
  x=Number.isFinite(x)?x:+ux[target];y=Number.isFinite(y)?y:+uy[target];
  if(!Number.isFinite(x)||!Number.isFinite(y)) return null;
  const D=intelContactDefaults(source);
  source=D.source;
  confidence=Number.isFinite(confidence)?clamp(confidence,0,1):D.confidence;
  ttl=Number.isFinite(ttl)?Math.max(.001,ttl):D.ttl;
  if(confidence<=0) return null;
  intelContactTick(now);
  /* A recycled target slot cannot retain two generations for one observer. */
  for(let i=intelContacts.length-1;i>=0;i--){
    const C=intelContacts[i];
    if(C.team===team&&C.target===target&&C.generation!==generation) intelContacts.splice(i,1);
  }
  let at=intelContactFind(team,target,generation),C=at>=0?intelContacts[at]:null;
  /* Late packets/probe calls may describe an older simulation tick. They are
     allowed to age the ledger to the current monotonic clock, but never to
     refresh confidence or replace the newer sampled position. */
  if(staleSample) return C?intelContactSnapshot(C):null;
  if(C&&now<C.timestamp) return intelContactSnapshot(C);
  if(C&&now===C.timestamp&&confidence<C.baseConfidence) return intelContactSnapshot(C);
  if(!C){
    if(intelContacts.length>=INTEL_CONTACT_CAP){
      /* Deterministic pressure trim: weakest first, then oldest, then the
         lowest stable identity. Active observations are not insertion-order
         random and equal runs retain the same contact set. */
      let worst=0;
      for(let i=1;i<intelContacts.length;i++) if(intelContactWorse(intelContacts[i],intelContacts[worst])) worst=i;
      const incoming={confidence,timestamp:now,team,target,generation};
      if(intelContactWorse(incoming,intelContacts[worst])) return null;
      intelContacts.splice(worst,1);
    }
    C={team,target,generation,x,y,source,confidence,baseConfidence:confidence,
      age:0,timestamp:now,expiresAt:now+ttl};
    intelContacts.push(C);
  }else{
    C.x=x;C.y=y;C.source=source;C.confidence=confidence;C.baseConfidence=confidence;
    C.age=0;C.timestamp=now;C.expiresAt=now+ttl;
  }
  return intelContactSnapshot(C);
}
function intelContactGet(team,target,generation){
  team=team|0;target=target|0;intelContactTick();
  if(generation===undefined&&target>=0&&target<MAXU&&ualive[target]) generation=ugen[target]|0;
  const at=intelContactFind(team,target,generation);
  return at<0?null:intelContactSnapshot(intelContacts[at]);
}
function intelContactList(team,minConfidence){
  team=team|0;minConfidence=Number.isFinite(minConfidence)?minConfidence:0;
  intelContactTick();
  return intelContacts.filter(C=>C.team===team&&C.confidence>=minConfidence)
    .sort((A,B)=>A.target-B.target||A.generation-B.generation)
    .map(intelContactSnapshot);
}
function intelArtillerySolution(team,request,now){
  team=team|0;request=request&&typeof request==='object'?request:{};
  now=intelContactAdvanceClock(now);
  intelContactTick(now);
  if(request.source==='player'&&Number.isFinite(request.x)&&Number.isFinite(request.y)){
    return {eligible:true,team,target:-1,generation:-1,
      x:clamp(request.x,0,MAP),y:clamp(request.y,0,MAP),source:'player',
      confidence:1,age:0,timestamp:now,expiresAt:now};
  }
  const target=request.target|0;
  if(target<0||target>=MAXU) return {eligible:false,team,reason:'invalid-target'};
  const generation=Number.isFinite(request.generation)?request.generation|0:
    (ualive[target]?ugen[target]|0:undefined);
  const at=intelContactFind(team,target,generation);
  if(at<0) return {eligible:false,team,target,generation,reason:'missing-contact'};
  const C=intelContacts[at];
  return {eligible:true,team,target:C.target,generation:C.generation,x:C.x,y:C.y,
    source:C.source,confidence:C.confidence,age:C.age,timestamp:C.timestamp,
    expiresAt:C.expiresAt};
}
function intelArtilleryScatterRadius(solution,weaponRadius){
  if(!solution||!solution.eligible) return 0;
  weaponRadius=Number.isFinite(weaponRadius)?Math.max(1,weaponRadius):64;
  const sourceBias=solution.source==='visual'?.08:solution.source==='player'?.12:
    solution.source==='aerial'?.14:solution.source==='scan'?.2:solution.source==='radar'?.28:.34;
  const confidence=clamp(Number.isFinite(solution.confidence)?solution.confidence:0,0,1);
  const ttl=Math.max(.001,(Number.isFinite(solution.expiresAt)?solution.expiresAt:0)-
    (Number.isFinite(solution.timestamp)?solution.timestamp:0));
  const ageRatio=clamp((Number.isFinite(solution.age)?solution.age:ttl)/ttl,0,1);
  return weaponRadius*(sourceBias+(1-confidence)*.65+ageRatio*.25);
}
function intelArtilleryHash32(value){
  value=(value|0)+0x6d2b79f5;
  value=Math.imul(value^(value>>>15),value|1);
  value^=value+Math.imul(value^(value>>>7),value|61);
  return (value^(value>>>14))>>>0;
}
function intelArtilleryScatterPoint(solution,weaponRadius,shellIndex,seed){
  if(!solution||!solution.eligible) return {x:NaN,y:NaN,radius:0};
  const radius=intelArtilleryScatterRadius(solution,weaponRadius);
  const identity=Math.imul((solution.target|0)+2,0x45d9f3b)^Math.imul((solution.generation|0)+2,0x119de1f3)^
    Math.imul(Math.round(solution.x*16)|0,0x27d4eb2d)^Math.imul(Math.round(solution.y*16)|0,0x165667b1);
  const h0=intelArtilleryHash32(identity^(seed|0)^Math.imul((shellIndex|0)+1,0x9e3779b1));
  const h1=intelArtilleryHash32(h0^0x85ebca6b);
  const angle=h0/4294967296*Math.PI*2;
  const distance=Math.sqrt(h1/4294967296)*radius;
  return {x:clamp(solution.x+Math.cos(angle)*distance,0,MAP),
    y:clamp(solution.y+Math.sin(angle)*distance,0,MAP),radius};
}
function intelContactRefreshSensors(){
  const active=typeof fogGameplayActive!=='function'||fogGameplayActive();
  const now=intelContactNow();
  intelContactTick(now);
  if(!active) return;
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]||(typeof uCrash!=='undefined'&&uCrash[i])) continue;
    const cell=intelCell(ux[i],uy[i]);
    for(let observer=0;observer<=1;observer++){
      if(uteam[i]===observer) continue;
      const bit=intelSensorBit(observer);
      /* fogCov is deliberately player-only. Team one still receives its real
         uplink/techlab radar contacts; no imaginary AI visual grid is added. */
      const visual=observer===0&&!!fogCov[cell]&&
        (umode[i]!==4||intelDetectedAt(ux[i],uy[i],observer));
      const radar=!!(fogRadar[cell]&bit)&&umode[i]!==4;
      if(visual) intelContactUpdate(observer,i,'visual',undefined,undefined,
        ux[i],uy[i],ugen[i],now);
      else if(radar) intelContactUpdate(observer,i,'radar',undefined,undefined,
        ux[i],uy[i],ugen[i],now);
    }
  }
}
function intelContactReset(){ intelContacts.length=0;intelContactClock=0; }

function intelVisionScale(r){
  let s=r;
  if(typeof WC!=='undefined'){
    if(WC.fogb) s=Math.max(4,Math.round(s*0.6));
    /* Total Eclipse already forces night (sim.js dayT). The card also promised
       shorter sensors; without this it was a free payout on a cosmetic sky. */
    if(WC.dark) s=Math.max(4,Math.round(s*0.72));
  }
  return s;
}
function intelUnitVision(i,vis,hm){
  const T=TYPES[utype[i]];
  let base=T.scout?INTEL_VIS_SCOUT:(T.air?INTEL_VIS_AIR:INTEL_VIS_GROUND);
  if(umode[i]===4) base+=INTEL_VIS_GHOST;
  const scaled=vis(base);
  return Math.max(6,Math.round(6+(scaled-6)*hm));
}
function intelBldVision(B,vis,hm){
  const t=B.type==='hq'?INTEL_VIS_HQ:B.type==='turret'?INTEL_VIS_TURRET:INTEL_VIS_BLD;
  return Math.max(4,Math.round(vis(t)*hm));
}
function intelCell(wx,wy){
  return clamp(wy/MAP*FN|0,0,FN-1)*FN+clamp(wx/MAP*FN|0,0,FN-1);
}
function intelStamp(grid,wx,wy,rc,bit){
  if(rc<=0) return;
  const cx=clamp(wx/MAP*FN|0,0,FN-1), cy=clamp(wy/MAP*FN|0,0,FN-1), r2=rc*rc;
  for(let y=Math.max(0,cy-rc);y<=Math.min(FN-1,cy+rc);y++)
    for(let x=Math.max(0,cx-rc);x<=Math.min(FN-1,cx+rc);x++){
      const dx=x-cx,dy=y-cy;
      if(dx*dx+dy*dy<=r2) grid[y*FN+x]|=bit;
    }
}
function intelDetectedAt(wx,wy,team){
  const bit=1<<(team|0);
  return !!(fogDetect[intelCell(wx,wy)]&bit);
}
function intelRadarContact(wx,wy){
  if(typeof fogGameplayActive==='function'&&!fogGameplayActive()) return false;
  return !!(fogRadar[intelCell(wx,wy)]&1);
}
function intelGhostRefresh(){
  const t=(typeof stats!=='undefined'&&stats)?stats.t:-2;
  if(t===intelGhostStamp) return;
  intelGhostStamp=t;
  intelGhostIdx.length=0;
  intelHasGhost[0]=intelHasGhost[1]=intelHasGhost[2]=0;
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]||umode[i]!==4) continue;
    intelGhostIdx.push(i);
    intelHasGhost[uteam[i]]=1;
  }
}
function intelGhostCloaked(team,wx,wy){
  if(team===0||!intelHasGhost[team]) return false;
  intelGhostRefresh();
  for(let n=0;n<intelGhostIdx.length;n++){
    const j=intelGhostIdx[n];
    if(!ualive[j]||uteam[j]!==team||umode[j]!==4) continue;
    if(ux[j]!==wx||uy[j]!==wy) continue;
    return !intelDetectedAt(wx,wy,0);
  }
  return false;
}
intelCanTarget=function(j,team){
  if(!ualive[j]||uteam[j]===team) return false;
  if(typeof uCrash!=='undefined'&&uCrash[j]) return false;
  if(umode[j]===4&&!intelDetectedAt(ux[j],uy[j],team)) return false;
  return true;
};
function intelSensorBit(team){ return team===1?2:team===0?1:0; }
function intelStampSensors(){
  fogRadar.fill(0); fogDetect.fill(0);
  const vis=intelVisionScale;
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]) continue;
    const bit=intelSensorBit(uteam[i]); if(!bit) continue;
    const T=TYPES[utype[i]];
    if(T.scout){
      const hm=typeof hazVisionMult==='function'?hazVisionMult(ux[i],uy[i],i):1;
      intelStamp(fogDetect,ux[i],uy[i],Math.max(4,Math.round(vis(INTEL_DET_SCOUT)*hm)),bit);
    }
  }
  for(const B of blds){
    if(!B.alive||B.prog<1) continue;
    const bit=intelSensorBit(B.team); if(!bit) continue;
    const hm=typeof hazVisionMult==='function'?hazVisionMult(B.x,B.y,-1):1;
    if(B.type==='uplink'){
      intelStamp(fogRadar,B.x,B.y,Math.max(6,Math.round(vis(INTEL_RADAR_UPLINK)*hm)),bit);
      intelStamp(fogDetect,B.x,B.y,Math.max(4,Math.round(vis(INTEL_DET_UPLINK)*hm)),bit);
    }else if(B.type==='techlab'){
      intelStamp(fogRadar,B.x,B.y,Math.max(6,Math.round(vis(INTEL_RADAR_TECHLAB)*hm)),bit);
      intelStamp(fogDetect,B.x,B.y,Math.max(4,Math.round(vis(INTEL_DET_TECHLAB)*hm)),bit);
    }else if(B.type==='hq'){
      intelStamp(fogDetect,B.x,B.y,Math.max(4,Math.round(vis(INTEL_DET_HQ)*hm)),bit);
    }
  }
  if(typeof carrier!=='undefined'&&carrier&&carrier.active)
    intelStamp(fogDetect,carrier.x,carrier.y,vis(12),1);
  if(typeof fogScans!=='undefined'){
    for(let i=0;i<fogScans.length;i++){
      const S=fogScans[i];
      intelStamp(fogDetect,S.x,S.y,vis(S.r*2),1);
      intelStamp(fogRadar,S.x,S.y,vis(S.r*2),1);
    }
  }
  intelGhostStamp=-1;
  intelGhostRefresh();
  intelContactRefreshSensors();
}
function intelReset(){
  fogRadar.fill(0); fogDetect.fill(0);
  intelGhostIdx.length=0;
  intelHasGhost[0]=intelHasGhost[1]=intelHasGhost[2]=0;
  intelGhostStamp=-1;
  intelContactReset();
}

(function mfIntelInstall(){
  const baseFog=updateFog;
  updateFog=function(){
    baseFog();
    intelStampSensors();
  };
  const baseVis=fogEntityVisible;
  fogEntityVisible=function(team,wx,wy){
    if(!baseVis(team,wx,wy)) return false;
    /* Fog-off / attract / menus keep the old translucent GHOST hull. The
       stance still needs a detector to be shot; hiding the model is a fog-on
       intel rule so a silent Wasp cannot silhouette against black map. */
    if(typeof fogGameplayActive==='function'&&!fogGameplayActive()) return true;
    if(intelGhostCloaked(team,wx,wy)) return false;
    return true;
  };
  if(typeof setMode==='function'&&!setMode._mfIntel){
    const baseMode=setMode;
    setMode=function(i,m){ const r=baseMode(i,m); intelGhostStamp=-1; return r; };
    setMode._mfIntel=1;
  }
  if(typeof resetWorld==='function'&&!resetWorld._mfIntel){
    const baseReset=resetWorld;
    resetWorld=function(){ baseReset.apply(this,arguments); intelReset(); };
    resetWorld._mfIntel=1;
  }
  const basePurpose=intelUnitPurpose;
  intelUnitPurpose=function(T){
    let s=basePurpose(T);
    if(T.scout&&!/detect/i.test(s))
      s=s.replace(/\.?$/,'')+'. Wider sensors, and it can detect silent-running chassis.';
    return s;
  };
  const baseBld=intelBldPurpose;
  intelBldPurpose=function(key){
    let s=baseBld(key);
    if(key==='uplink'&&!/radar/i.test(s))
      s=s.replace(/\.?$/,'')+'. Paints radar contacts on the command map and detects GHOST chassis.';
    else if(key==='techlab'&&!/detect/i.test(s))
      s=s.replace(/\.?$/,'')+'. Sensor dish: shorter radar than an Uplink, still detects silent running.';
    return s;
  };
})();
