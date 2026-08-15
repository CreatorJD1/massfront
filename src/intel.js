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
}
function intelReset(){
  fogRadar.fill(0); fogDetect.fill(0);
  intelGhostIdx.length=0;
  intelHasGhost[0]=intelHasGhost[1]=intelHasGhost[2]=0;
  intelGhostStamp=-1;
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
