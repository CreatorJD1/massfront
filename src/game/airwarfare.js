/* ============================================================================
   DETERMINISTIC AIR WARFARE AUTHORITY
   Aircraft used to share the ground chase/fire loop with terrain checks
   removed. This module owns fixed-step air intent and attitude; the existing
   projectile and damage paths remain authoritative.
   ============================================================================ */
const MF_AIR_BAND_LANDING=0,MF_AIR_BAND_LOW=1,MF_AIR_BAND_TACTICAL=2,
      MF_AIR_BAND_HIGH=3,MF_AIR_BAND_CRASHING=4;
const MF_AIR_MISSION_NONE=0,MF_AIR_MISSION_CAP=1,MF_AIR_MISSION_INTERCEPT=2,
      MF_AIR_MISSION_ESCORT=3,MF_AIR_MISSION_STRIKE=4,MF_AIR_MISSION_RECON=5,
      MF_AIR_MISSION_RTB=6;
const MF_AIR_PHASE_HOLD=0,MF_AIR_PHASE_INGRESS=1,MF_AIR_PHASE_ALIGN=2,
      MF_AIR_PHASE_RELEASE=3,MF_AIR_PHASE_BREAK=4,MF_AIR_PHASE_EGRESS=5,
      MF_AIR_PHASE_REFORM=6,MF_AIR_PHASE_EXTEND=7,MF_AIR_PHASE_REACQUIRE=8;
const MF_AIR_BAND_H=new Float32Array([8,27,58,94,0]);
const MF_AIR_MISSION_NAME=['none','cap','intercept','escort','strike','recon','rtb'];
const MF_AIR_PHASE_NAME=['hold','ingress','alignment','release','pull-up','egress','reform','extend','reacquire'];
const MF_AIR_BAND_NAME=['landing','low','tactical','high','crashing'];
const uAirGen=new Int32Array(MAXU),uAirTarget=new Int32Array(MAXU),uAirTargetG=new Int32Array(MAXU),
      uAirEscort=new Int32Array(MAXU),uAirEscortG=new Int32Array(MAXU),
      uAirTrackGen=new Int32Array(MAXU),uAirTrackTick=new Int32Array(MAXU);
const uAirBand=new Uint8Array(MAXU),uAirBandReq=new Uint8Array(MAXU),
      uAirMission=new Uint8Array(MAXU),uAirHomeMission=new Uint8Array(MAXU),
      uAirPhase=new Uint8Array(MAXU),uAirFire=new Uint8Array(MAXU),uAirScanClock=new Uint8Array(MAXU);
const uAirAlt=new Float32Array(MAXU),uAirPhaseT=new Float32Array(MAXU),
      uAirAnchorX=new Float32Array(MAXU),uAirAnchorY=new Float32Array(MAXU),
      uAirGoalX=new Float32Array(MAXU),uAirGoalY=new Float32Array(MAXU),
      uAirAimX=new Float32Array(MAXU),uAirAimY=new Float32Array(MAXU),
      uAirVx=new Float32Array(MAXU),uAirVy=new Float32Array(MAXU),
      uAirObservedVx=new Float32Array(MAXU),uAirObservedVy=new Float32Array(MAXU),
      uAirObservedTick=new Int32Array(MAXU),
      uAirTrackX=new Float32Array(MAXU),uAirTrackY=new Float32Array(MAXU),
      uAirPhaseGoalX=new Float32Array(MAXU),uAirPhaseGoalY=new Float32Array(MAXU),
      uAirLastX=new Float32Array(MAXU),uAirLastY=new Float32Array(MAXU),
      uAirBank=new Float32Array(MAXU),uAirPitch=new Float32Array(MAXU),
      uAirCourse=new Float32Array(MAXU),uAirYawRate=new Float32Array(MAXU);
const uAirPass=new Uint16Array(MAXU),uAirReleaseN=new Uint16Array(MAXU),
      uAirReacquireN=new Uint16Array(MAXU),uAirSortie=new Uint16Array(MAXU);
/* Propulsion is a swept path, not a vertical billboard drawn from the current
   pose. Fixed-step authority records a short, generation-safe history for each
   aircraft; rendering may read it but can never append to it. Six samples cover
   a turn without leaving a long neon rope behind a fast interceptor. */
const MF_AIR_PROPULSION_HISTORY_SAMPLES=6;
const uAirPropulsionHistoryData=new Float32Array(MAXU*MF_AIR_PROPULSION_HISTORY_SAMPLES*6);
const uAirPropulsionHistoryHead=new Uint8Array(MAXU),uAirPropulsionHistoryCount=new Uint8Array(MAXU);
const uAirPropulsionHistoryGen=new Int32Array(MAXU),uAirPropulsionHistoryTick=new Int32Array(MAXU);
let mfAirSeed=0x4d465835,mfAirAiAcc=0;

function mfAirHash32(v){
  v=Math.imul((v|0)^(v>>>16),0x7feb352d);v=Math.imul(v^(v>>>15),0x846ca68b);
  return (v^(v>>>16))>>>0;
}
function mfAirRand01(i,lane){
  return mfAirHash32(mfAirSeed^Math.imul(i+1,0x9e3779b1)^Math.imul((ugen[i]|0)+1,0x85ebca6b)^
    Math.imul((utype[i]|0)+3,0xc2b2ae35)^Math.imul((tick|0)+17,0x27d4eb2f)^Math.imul((lane|0)+1,0x165667b1))/4294967296;
}
function mfAirWrap(a){while(a>Math.PI)a-=TAU;while(a<-Math.PI)a+=TAU;return a;}
function mfAirBandHeight(b){return MF_AIR_BAND_H[clamp(b|0,0,3)];}
function mfAirBandForAltitude(h){
  let best=MF_AIR_BAND_LANDING,bd=Infinity;
  for(let b=MF_AIR_BAND_LANDING;b<=MF_AIR_BAND_HIGH;b++){
    const d=Math.abs(mfAirBandHeight(b)-h);if(d<bd){bd=d;best=b;}
  }
  return best;
}
function mfAirMissionCode(kind){
  if(Number.isFinite(kind))return clamp(kind|0,0,MF_AIR_MISSION_RTB);
  kind=String(kind||'').toLowerCase();
  for(let i=0;i<MF_AIR_MISSION_NAME.length;i++)if(MF_AIR_MISSION_NAME[i]===kind)return i;
  return MF_AIR_MISSION_NONE;
}
function mfAirTargetValid(i,t,g){
  if(t>=0)return !!(ualive[t]&&ugen[t]===g&&uteam[t]!==uteam[i]&&!uCrash[t]);
  if(typeof isRelicTg==='function'&&isRelicTg(t)){const R=relics[relicOf(t)];return !!(R&&R.alive);}
  if(t<=-2){const B=blds[-2-t];return !!(B&&B.alive&&B.team!==uteam[i]);}
  return false;
}
function mfAirTargetInfo(t){
  if(t>=0&&ualive[t]){
    /* Target observations must not share the aircraft movement cache. Ground
       targets never pass through mfAirAfterMove, so the old cache began at
       (0,0) and reported every stationary tank as moving at the 180u/s clamp.
       A generation-aware sample starts at zero velocity, then measures only
       displacement since the previous fixed-step observation. */
    const now=tick|0;
    if(uAirTrackGen[t]!==ugen[t]){
      uAirTrackGen[t]=ugen[t];uAirTrackTick[t]=now;uAirTrackX[t]=ux[t];uAirTrackY[t]=uy[t];
      uAirObservedVx[t]=0;uAirObservedVy[t]=0;uAirObservedTick[t]=now;
    }else if(now>uAirTrackTick[t]){
      const ticks=Math.max(1,now-uAirTrackTick[t]),scale=30/ticks;
      uAirObservedVx[t]=clamp((ux[t]-uAirTrackX[t])*scale,-180,180);
      uAirObservedVy[t]=clamp((uy[t]-uAirTrackY[t])*scale,-180,180);
      uAirTrackX[t]=ux[t];uAirTrackY[t]=uy[t];uAirTrackTick[t]=now;uAirObservedTick[t]=now;
    }
    const observed=(now-uAirObservedTick[t])<=2,T=TYPES[utype[t]],air=!!T.air;
    return {x:ux[t],y:uy[t],r:TYPES[utype[t]].r||0,air:!!TYPES[utype[t]].air,
      alt:air?mfAirAltitude(t):0,band:air?uAirBand[t]:MF_AIR_BAND_LANDING,
      vx:observed?uAirObservedVx[t]:(air?(uAirVx[t]||0):0),vy:observed?uAirObservedVy[t]:(air?(uAirVy[t]||0):0)};
  }
  if(typeof isRelicTg==='function'&&isRelicTg(t)){const R=relics[relicOf(t)];return R&&R.alive?{x:R.x,y:R.y,r:(R.s||0)*.45,air:false,alt:0,band:MF_AIR_BAND_LANDING,vx:0,vy:0}:null;}
  if(t<=-2){const B=blds[-2-t];return B&&B.alive?{x:B.x,y:B.y,r:B.r||0,air:false,alt:0,band:MF_AIR_BAND_LANDING,vx:0,vy:0}:null;}
  return null;
}
function mfAirDefaultMission(i,T){
  /* Player aircraft hold their authored position until ordered. Automatically
     orbiting them made direct move/lead commands fight the mission authority.
     AI aircraft receive CAP/recon through mfAirAiMissionTick below. */
  return uteam[i]===1?(T&&T.scout?MF_AIR_MISSION_RECON:MF_AIR_MISSION_CAP):MF_AIR_MISSION_NONE;
}
function mfAirEnsure(i,T){
  if(uAirGen[i]===ugen[i])return;
  uAirGen[i]=ugen[i];uAirTarget[i]=-1;uAirTargetG[i]=-1;uAirEscort[i]=-1;uAirEscortG[i]=-1;
  const m=mfAirDefaultMission(i,T);uAirMission[i]=m;uAirHomeMission[i]=m;uAirPhase[i]=MF_AIR_PHASE_HOLD;
  const b=T&&T.scout?MF_AIR_BAND_HIGH:MF_AIR_BAND_TACTICAL;
  uAirBand[i]=uAirBandReq[i]=b;uAirAlt[i]=mfAirBandHeight(b);uAirPhaseT[i]=0;
  uAirAnchorX[i]=uAirGoalX[i]=uAirAimX[i]=ux[i];uAirAnchorY[i]=uAirGoalY[i]=uAirAimY[i]=uy[i];
  uAirLastX[i]=ux[i];uAirLastY[i]=uy[i];
  uAirPhaseGoalX[i]=ux[i];uAirPhaseGoalY[i]=uy[i];
  uAirVx[i]=uAirVy[i]=uAirObservedVx[i]=uAirObservedVy[i]=uAirBank[i]=uAirPitch[i]=uAirYawRate[i]=0;
  uAirObservedTick[i]=-999999;uAirCourse[i]=uang[i];
  uAirPass[i]=uAirReleaseN[i]=uAirReacquireN[i]=0;uAirSortie[i]=(mfAirHash32((i+1)^ugen[i]^mfAirSeed)&65535)||1;
  uAirFire[i]=0;uAirScanClock[i]=0;
  mfAirPropulsionHistoryResetUnit(i);
}
function mfAirResetUnit(i,T){uAirGen[i]=0;mfAirEnsure(i,T);}
function mfAirReset(seed){
  if(Number.isFinite(seed))mfAirSeed=(seed|0)||0x4d465835;
  uAirGen.fill(0);uAirTarget.fill(-1);uAirTargetG.fill(-1);uAirEscort.fill(-1);uAirEscortG.fill(-1);
  uAirMission.fill(0);uAirHomeMission.fill(0);uAirPhase.fill(0);uAirFire.fill(0);
  uAirScanClock.fill(0);
  uAirBand.fill(0);uAirBandReq.fill(0);uAirAlt.fill(0);uAirPhaseT.fill(0);
  uAirVx.fill(0);uAirVy.fill(0);uAirLastX.fill(0);uAirLastY.fill(0);
  uAirObservedVx.fill(0);uAirObservedVy.fill(0);uAirObservedTick.fill(-999999);
  uAirTrackGen.fill(0);uAirTrackTick.fill(-999999);uAirTrackX.fill(0);uAirTrackY.fill(0);
  uAirPhaseGoalX.fill(0);uAirPhaseGoalY.fill(0);
  uAirBank.fill(0);uAirPitch.fill(0);uAirYawRate.fill(0);mfAirAiAcc=0;
  uAirPropulsionHistoryHead.fill(0);uAirPropulsionHistoryCount.fill(0);
  uAirPropulsionHistoryGen.fill(0);uAirPropulsionHistoryTick.fill(-999999);
}

function mfAirPropulsionHistoryResetUnit(i){
  uAirPropulsionHistoryGen[i]=ugen[i];uAirPropulsionHistoryHead[i]=0;
  uAirPropulsionHistoryCount[i]=0;uAirPropulsionHistoryTick[i]=-999999;
}
function mfAirPropulsionHistorySample(i){
  if(i<0||i>=MAXU||!ualive[i])return false;
  const T=TYPES[utype[i]];if(!T||!T.air)return false;
  if(uAirPropulsionHistoryGen[i]!==ugen[i])mfAirPropulsionHistoryResetUnit(i);
  const cap=MF_AIR_PROPULSION_HISTORY_SAMPLES,base=i*cap*6,count=uAirPropulsionHistoryCount[i]|0;
  let head=uAirPropulsionHistoryHead[i]|0;
  if(count){
    const o=base+head*6,dx=ux[i]-uAirPropulsionHistoryData[o],dy=uy[i]-uAirPropulsionHistoryData[o+1];
    if((tick-uAirPropulsionHistoryTick[i])<2&&dx*dx+dy*dy<1.44)return false;
    head=(head+1)%cap;
  }
  const o=base+head*6;
  uAirPropulsionHistoryData[o]=ux[i];uAirPropulsionHistoryData[o+1]=uy[i];
  uAirPropulsionHistoryData[o+2]=(typeof terrainH==='function'?terrainH(ux[i],uy[i]):0)+(uCrash[i]?ualt[i]:uAirAlt[i]);
  uAirPropulsionHistoryData[o+3]=uang[i]-Math.PI/2;
  uAirPropulsionHistoryData[o+4]=uCrash[i]?uCpitch[i]:uAirPitch[i];
  uAirPropulsionHistoryData[o+5]=uCrash[i]?uCroll[i]:uAirBank[i];
  uAirPropulsionHistoryHead[i]=head;uAirPropulsionHistoryCount[i]=Math.min(cap,count+1);
  uAirPropulsionHistoryTick[i]=tick;return true;
}
/* Returns oldest -> newest world XYZ nozzle samples in `out`. The local point
   receives the exact roll/pitch/yaw order used by VS3D, so banked aircraft do
   not leave their exhaust hovering beside the engine socket. */
function mfAirPropulsionHistoryRead(i,localX,localY,localZ,scale,wide,out){
  out=out||new Float32Array(MF_AIR_PROPULSION_HISTORY_SAMPLES*3);
  if(i<0||i>=MAXU||uAirPropulsionHistoryGen[i]!==ugen[i])return 0;
  const cap=MF_AIR_PROPULSION_HISTORY_SAMPLES,count=uAirPropulsionHistoryCount[i]|0;
  if(count<2)return 0;
  const base=i*cap*6,head=uAirPropulsionHistoryHead[i]|0,oldest=(head-count+1+cap)%cap;
  for(let k=0;k<count;k++){
    const o=base+((oldest+k)%cap)*6,yaw=uAirPropulsionHistoryData[o+3];
    const pitch=uAirPropulsionHistoryData[o+4],roll=uAirPropulsionHistoryData[o+5];
    const cr=Math.cos(roll),sr=Math.sin(roll),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const ry=localY*cr-localZ*sr,rz=localY*sr+localZ*cr;
    const px=localX*cp-ry*sp,py=localX*sp+ry*cp;
    const ca=Math.cos(yaw),sa=Math.sin(yaw),q=k*3;
    out[q]=uAirPropulsionHistoryData[o]+px*scale*ca-rz*wide*sa;
    out[q+1]=uAirPropulsionHistoryData[o+2]+py*scale;
    out[q+2]=uAirPropulsionHistoryData[o+1]+px*scale*sa+rz*wide*ca;
  }
  return count;
}
/* Builds a two-point world line from an authored socket along its local emitter
   axis. Lift/field engines use this instead of borrowing the aircraft's travel
   history, so four physical lift ducts produce four correctly oriented wakes. */
function mfAirPropulsionCurrentLine(i,localX,localY,localZ,axisX,axisY,axisZ,length,scale,wide,out){
  out=out||new Float32Array(6);
  if(i<0||i>=MAXU||uAirPropulsionHistoryGen[i]!==ugen[i])return 0;
  const cap=MF_AIR_PROPULSION_HISTORY_SAMPLES,count=uAirPropulsionHistoryCount[i]|0;if(count<1)return 0;
  const base=i*cap*6,o=base+(uAirPropulsionHistoryHead[i]|0)*6,yaw=uAirPropulsionHistoryData[o+3];
  const pitch=uAirPropulsionHistoryData[o+4],roll=uAirPropulsionHistoryData[o+5];
  function put(q,lx,ly,lz){
    const cr=Math.cos(roll),sr=Math.sin(roll),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const ry=ly*cr-lz*sr,rz=ly*sr+lz*cr,px=lx*cp-ry*sp,py=lx*sp+ry*cp;
    const ca=Math.cos(yaw),sa=Math.sin(yaw);
    out[q]=uAirPropulsionHistoryData[o]+px*scale*ca-rz*wide*sa;
    out[q+1]=uAirPropulsionHistoryData[o+2]+py*scale;
    out[q+2]=uAirPropulsionHistoryData[o+1]+px*scale*sa+rz*wide*ca;
  }
  /* Oldest/outer endpoint first, newest/socket mouth second. */
  put(0,localX+axisX*length,localY+axisY*length,localZ+axisZ*length);
  put(3,localX,localY,localZ);return 2;
}
function mfAirPropulsionHistoryTangent(i){
  const count=uAirPropulsionHistoryCount[i]|0;if(count<2)return {x:0,y:0};
  const cap=MF_AIR_PROPULSION_HISTORY_SAMPLES,base=i*cap*6,h=uAirPropulsionHistoryHead[i]|0,p=(h-1+cap)%cap;
  return {x:uAirPropulsionHistoryData[base+h*6]-uAirPropulsionHistoryData[base+p*6],
    y:uAirPropulsionHistoryData[base+h*6+1]-uAirPropulsionHistoryData[base+p*6+1]};
}
function mfAirAltitude(i){
  if(i<0||i>=MAXU)return 58;if(uCrash[i])return ualt[i];
  const T=TYPES[utype[i]];if(!T||!T.air)return 0;mfAirEnsure(i,T);return uAirAlt[i]||58;
}
function mfAirMarkCrash(i){
  if(i<0||i>=MAXU)return;const T=TYPES[utype[i]];if(T&&T.air)mfAirEnsure(i,T);
  uAirBand[i]=uAirBandReq[i]=MF_AIR_BAND_CRASHING;uAirFire[i]=0;
}
function mfAirCrashValue(i,lane){return mfAirRand01(i,100+(lane|0));}
function mfAirSetPhase(i,p){if(uAirPhase[i]!==p){uAirPhase[i]=p;uAirPhaseT[i]=0;}}
function mfAirBeginManeuver(i,p,x,y){
  uAirPhaseGoalX[i]=clamp(x,8,MAP-8);uAirPhaseGoalY[i]=clamp(y,8,MAP-8);mfAirSetPhase(i,p);
}
function mfAirManeuverGoal(i){uAirGoalX[i]=uAirPhaseGoalX[i];uAirGoalY[i]=uAirPhaseGoalY[i];}
function mfAirManeuverReached(i,r){return Math.hypot(uAirPhaseGoalX[i]-ux[i],uAirPhaseGoalY[i]-uy[i])<=r;}
function mfAirReformPoint(i){
  const a=(uAirSortie[i]%8)*TAU/8,r=30+((uAirSortie[i]>>>3)&1)*16;
  return [clamp(uAirAnchorX[i]+Math.cos(a)*r,8,MAP-8),clamp(uAirAnchorY[i]+Math.sin(a)*r,8,MAP-8)];
}
function mfAirTargetDistance(i,I){
  const dz=(I&&Number.isFinite(I.alt)?I.alt:0)-uAirAlt[i];
  return Math.hypot(I.x-ux[i],I.y-uy[i],dz);
}
function mfAirFireEnvelope(i,T,I,range){
  if(!I)return false;
  const dz=Math.abs((Number.isFinite(I.alt)?I.alt:0)-uAirAlt[i]);
  /* Dogfights require a shared altitude layer; attack aircraft may release
     downward only from the authored low band. This makes the five bands part
     of weapon authority rather than labels consumed only by the renderer. */
  if(I.air){if(dz>22)return false;}
  else if(uAirAlt[i]>MF_AIR_BAND_H[MF_AIR_BAND_LOW]+10)return false;
  return mfAirTargetDistance(i,I)<=range;
}
function mfAirIssueMission(i,kind,payload){
  if(i<0||i>=unitHigh||!ualive[i])return false;
  const T=TYPES[utype[i]];if(!T||!T.air||uCrash[i])return false;
  mfAirEnsure(i,T);const p=payload||{},label=String(kind||'').toLowerCase();
  const bandCode=label==='landing'?MF_AIR_BAND_LANDING:label==='low'?MF_AIR_BAND_LOW:
    label==='tactical'?MF_AIR_BAND_TACTICAL:label==='high'?MF_AIR_BAND_HIGH:-1;
  if(bandCode>=0){
    uAirMission[i]=uAirHomeMission[i]=MF_AIR_MISSION_NONE;uAirTarget[i]=utgt[i]=-1;uAirTargetG[i]=utgtg[i]=-1;
    uAirBandReq[i]=bandCode;uAirGoalX[i]=uAirAnchorX[i]=ux[i];uAirGoalY[i]=uAirAnchorY[i]=uy[i];
    mfAirSetPhase(i,MF_AIR_PHASE_HOLD);return true;
  }
  const m=mfAirMissionCode(kind);
  uAirMission[i]=m;uAirHomeMission[i]=(m===MF_AIR_MISSION_INTERCEPT||m===MF_AIR_MISSION_STRIKE)?mfAirDefaultMission(i,T):m;
  uAirAnchorX[i]=Number.isFinite(p.x)?clamp(p.x,8,MAP-8):ux[i];uAirAnchorY[i]=Number.isFinite(p.y)?clamp(p.y,8,MAP-8):uy[i];
  uAirTarget[i]=Number.isFinite(p.target)?p.target|0:-1;uAirTargetG[i]=uAirTarget[i]>=0?(Number.isFinite(p.generation)?p.generation|0:ugen[uAirTarget[i]]):-1;
  uAirEscort[i]=Number.isFinite(p.escort)?p.escort|0:-1;uAirEscortG[i]=uAirEscort[i]>=0?(Number.isFinite(p.escortGeneration)?p.escortGeneration|0:ugen[uAirEscort[i]]):-1;
  if(uAirTarget[i]!==-1){utgt[i]=uAirTarget[i];utgtg[i]=uAirTargetG[i];}
  uAirSortie[i]=(uAirSortie[i]+1)&65535;uAirPass[i]=0;uAirFire[i]=0;
  uAirScanClock[i]=(m===MF_AIR_MISSION_CAP||m===MF_AIR_MISSION_INTERCEPT||m===MF_AIR_MISSION_STRIKE)?11:0;
  mfAirSetPhase(i,m===MF_AIR_MISSION_RTB?MF_AIR_PHASE_EGRESS:
    (uAirTarget[i]!==-1&&(m===MF_AIR_MISSION_INTERCEPT||m===MF_AIR_MISSION_STRIKE))?MF_AIR_PHASE_INGRESS:MF_AIR_PHASE_HOLD);return true;
}
function mfAirAcquire(i,T){
  const m=uAirMission[i],rad=m===MF_AIR_MISSION_RECON?260:m===MF_AIR_MISSION_CAP?560:720;
  let mask=T.targetMask,prefer=T.preferMask;
  if(m===MF_AIR_MISSION_CAP||m===MF_AIR_MISSION_INTERCEPT||m===MF_AIR_MISSION_ESCORT){mask=MF_DOM_AIR;prefer=MF_DOM_AIR;}
  let e=findEnemyDomain(ux[i],uy[i],uteam[i],rad,mask,prefer);
  /* The spatial grid is authoritative, but a newly scripted/probe-positioned
     aircraft can move before its next relink. This bounded fallback preserves
     CAP acquisition without making ordinary per-frame combat scan globally. */
  if(e<0&&(mask&MF_DOM_AIR)){
    let bd=rad*rad;
    for(let j=0;j<unitHigh;j++)if(j!==i&&intelCanTarget(j,uteam[i])&&TYPES[utype[j]].air){
      const dz=mfAirAltitude(j)-uAirAlt[i],d=dist2(ux[i],uy[i],ux[j],uy[j])+dz*dz;
      if(d<bd){bd=d;e=j;}
    }
  }
  if(e<0&&T.tg!=='air'&&(T.ptype===7||m===MF_AIR_MISSION_STRIKE)){
    e=findEnemyDomain(ux[i],uy[i],uteam[i],rad,MF_DOM_LAND|MF_DOM_NAVAL,MF_DOM_LAND);
    if(e<0){const b=findEnemyBld(ux[i],uy[i],uteam[i],rad);if(b>=0)e=-2-b;}
  }
  return e;
}
function mfAirBeginTarget(i,T,t){
  const I=mfAirTargetInfo(t);if(!I)return false;
  uAirTarget[i]=utgt[i]=t;uAirTargetG[i]=utgtg[i]=t>=0?ugen[t]:-1;
  uAirMission[i]=I.air?MF_AIR_MISSION_INTERCEPT:MF_AIR_MISSION_STRIKE;
  mfAirSetPhase(i,MF_AIR_PHASE_INGRESS);uAirReacquireN[i]++;return true;
}
function mfAirOrbitGoal(i,cx,cy,r,speed){
  const sign=(uAirSortie[i]&1)?1:-1,a=uAirPhaseT[i]*speed*sign+(uAirSortie[i]%628)*.01;
  uAirGoalX[i]=clamp(cx+Math.cos(a)*r,8,MAP-8);uAirGoalY[i]=clamp(cy+Math.sin(a)*r,8,MAP-8);
  uAirAimX[i]=uAirGoalX[i];uAirAimY[i]=uAirGoalY[i];
}
function mfAirLeadPoint(i,T,I){
  if(Number.isFinite(T)){I=mfAirTargetInfo(T|0);T=TYPES[utype[i]];}
  if(!T||!I)return [ux[i],uy[i]];
  const d=Math.hypot(I.x-ux[i],I.y-uy[i]),spd=Math.max(18,T.spd||30);
  const lead=clamp(d/(spd+Math.hypot(I.vx,I.vy)+1),.12,1.35);
  return [clamp(I.x+I.vx*lead,8,MAP-8),clamp(I.y+I.vy*lead,8,MAP-8)];
}
function mfAirConeError(i,x,y){return Math.abs(mfAirWrap(Math.atan2(y-uy[i],x-ux[i])+Math.PI/2-uang[i]));}
function mfAirReconSweep(i,T){
  if(typeof intelContactUpdate!=='function')return 0;
  const range=Math.max(320,(T&&T.rng||0)*2.5),r2=range*range,team=uteam[i];let n=0;
  for(let j=0;j<unitHigh&&n<18;j++){
    if(j===i||!ualive[j]||uCrash[j]||uteam[j]===team||dist2(ux[i],uy[i],ux[j],uy[j])>r2)continue;
    intelContactUpdate(team,j,'aerial',.92,16,ux[j],uy[j],ugen[j]);n++;
  }
  return n;
}
function mfAirAuthorityTick(i,T,dt){
  mfAirEnsure(i,T);uAirPhaseT[i]+=dt;uAirFire[i]=0;if(uCrash[i]){mfAirMarkCrash(i);return;}
  let t=uAirTarget[i];
  if(t!==-1&&!mfAirTargetValid(i,t,uAirTargetG[i])){
    const completingPass=(uAirMission[i]===MF_AIR_MISSION_INTERCEPT||uAirMission[i]===MF_AIR_MISSION_STRIKE)&&
      uAirPhase[i]>=MF_AIR_PHASE_RELEASE;
    t=uAirTarget[i]=-1;uAirTargetG[i]=-1;utgt[i]=-1;utgtg[i]=-1;
    if(!completingPass){uAirMission[i]=uAirHomeMission[i]||mfAirDefaultMission(i,T);mfAirSetPhase(i,MF_AIR_PHASE_REFORM);}
  }
  if(t===-1&&utgt[i]!==-1&&mfAirTargetValid(i,utgt[i],utgtg[i]))mfAirBeginTarget(i,T,utgt[i]);
  if(uAirTarget[i]===-1){
    if(++uAirScanClock[i]>=12){
      uAirScanClock[i]=0;const e=mfAirAcquire(i,T);if(e!==-1)mfAirBeginTarget(i,T,e);
    }
  }else uAirScanClock[i]=0;
  t=uAirTarget[i];const I=t!==-1?mfAirTargetInfo(t):null;let m=uAirMission[i];
  if(ustate[i]===1&&t===-1){
    uAirMission[i]=uAirHomeMission[i]=MF_AIR_MISSION_NONE;uAirBandReq[i]=MF_AIR_BAND_TACTICAL;
    uAirGoalX[i]=uAirAnchorX[i]=utx[i];uAirGoalY[i]=uAirAnchorY[i]=uty[i];uAirAimX[i]=utx[i];uAirAimY[i]=uty[i];
    m=MF_AIR_MISSION_NONE;
  }
  else if((m===MF_AIR_MISSION_INTERCEPT||m===MF_AIR_MISSION_STRIKE)&&I){
    const dx=I.x-ux[i],dy=I.y-uy[i],d=Math.hypot(dx,dy),nx=dx/(d||1),ny=dy/(d||1),lead=mfAirLeadPoint(i,T,I),cone=mfAirConeError(i,lead[0],lead[1]);
    uAirAimX[i]=lead[0];uAirAimY[i]=lead[1];
    if(m===MF_AIR_MISSION_INTERCEPT){
      uAirBandReq[i]=mfAirBandForAltitude(I.alt);const p=uAirPhase[i],rr=(T.rng||80)+I.r;
      if(p===MF_AIR_PHASE_RELEASE){
        uAirGoalX[i]=lead[0];uAirGoalY[i]=lead[1];
        if(uAirPhaseT[i]>.12){
          const fa=uang[i]-Math.PI/2,side=(uAirSortie[i]&1)?1:-1;
          mfAirBeginManeuver(i,MF_AIR_PHASE_BREAK,ux[i]+Math.cos(fa)*125-Math.sin(fa)*side*76,uy[i]+Math.sin(fa)*125+Math.cos(fa)*side*76);
        }
      }else if(p===MF_AIR_PHASE_BREAK){
        mfAirManeuverGoal(i);
        if(mfAirManeuverReached(i,24)||uAirPhaseT[i]>2.4){
          const fa=uang[i]-Math.PI/2;mfAirBeginManeuver(i,MF_AIR_PHASE_EXTEND,ux[i]+Math.cos(fa)*175,uy[i]+Math.sin(fa)*175);
        }
      }else if(p===MF_AIR_PHASE_EXTEND){
        mfAirManeuverGoal(i);
        if(mfAirManeuverReached(i,28)||uAirPhaseT[i]>3.2)mfAirSetPhase(i,MF_AIR_PHASE_REACQUIRE);
      }else if(p===MF_AIR_PHASE_REACQUIRE){
        uAirGoalX[i]=lead[0];uAirGoalY[i]=lead[1];
        if((cone<.58&&mfAirTargetDistance(i,I)<rr*2.8)||uAirPhaseT[i]>3.5){uAirPass[i]++;uAirReacquireN[i]++;mfAirSetPhase(i,MF_AIR_PHASE_INGRESS);}
      }else{
        uAirGoalX[i]=lead[0];uAirGoalY[i]=lead[1];const range3=mfAirTargetDistance(i,I);
        if(range3<rr*1.34&&cone<.48)mfAirSetPhase(i,MF_AIR_PHASE_ALIGN);
        if(mfAirFireEnvelope(i,T,I,rr)&&cone<.20)mfAirSetPhase(i,MF_AIR_PHASE_RELEASE);
        uAirFire[i]=(uAirPhase[i]===MF_AIR_PHASE_RELEASE&&mfAirFireEnvelope(i,T,I,rr)&&cone<.20)?1:0;
      }
    }else{
      const p=uAirPhase[i],approach=Math.max(92,(T.rng||60)*1.85);
      if(p===MF_AIR_PHASE_RELEASE){
        uAirBandReq[i]=MF_AIR_BAND_LOW;uAirGoalX[i]=lead[0];uAirGoalY[i]=lead[1];
        if(uAirPhaseT[i]>.12){const fa=uang[i]-Math.PI/2;mfAirBeginManeuver(i,MF_AIR_PHASE_BREAK,ux[i]+Math.cos(fa)*105,uy[i]+Math.sin(fa)*105);}
      }else if(p===MF_AIR_PHASE_BREAK){
        uAirBandReq[i]=MF_AIR_BAND_TACTICAL;mfAirManeuverGoal(i);
        if(mfAirManeuverReached(i,22)||uAirPhaseT[i]>2.2){
          const fa=uang[i]-Math.PI/2;mfAirBeginManeuver(i,MF_AIR_PHASE_EGRESS,ux[i]+Math.cos(fa)*approach*1.6,uy[i]+Math.sin(fa)*approach*1.6);
        }
      }else if(p===MF_AIR_PHASE_EGRESS){
        uAirBandReq[i]=MF_AIR_BAND_HIGH;mfAirManeuverGoal(i);
        if(mfAirManeuverReached(i,30)||Math.hypot(I.x-ux[i],I.y-uy[i])>=approach*1.35||uAirPhaseT[i]>4){
          const rp=mfAirReformPoint(i);mfAirBeginManeuver(i,MF_AIR_PHASE_REFORM,rp[0],rp[1]);
        }
      }else if(p===MF_AIR_PHASE_REFORM){
        uAirBandReq[i]=MF_AIR_BAND_TACTICAL;mfAirManeuverGoal(i);
        if(mfAirManeuverReached(i,36)||uAirPhaseT[i]>6){uAirPass[i]++;uAirReacquireN[i]++;mfAirSetPhase(i,MF_AIR_PHASE_INGRESS);}
      }else{
        const ix=I.x-nx*approach,iy=I.y-ny*approach;
        if(p===MF_AIR_PHASE_INGRESS&&Math.hypot(ix-ux[i],iy-uy[i])>38){uAirBandReq[i]=MF_AIR_BAND_TACTICAL;uAirGoalX[i]=ix;uAirGoalY[i]=iy;}
        else{
          mfAirSetPhase(i,MF_AIR_PHASE_ALIGN);uAirBandReq[i]=MF_AIR_BAND_LOW;uAirGoalX[i]=lead[0];uAirGoalY[i]=lead[1];const rr=(T.rng||52)+I.r;
          if(mfAirFireEnvelope(i,T,I,rr)&&cone<.16)mfAirSetPhase(i,MF_AIR_PHASE_RELEASE);
          uAirFire[i]=(uAirPhase[i]===MF_AIR_PHASE_RELEASE&&mfAirFireEnvelope(i,T,I,rr)&&cone<.16)?1:0;
        }
      }
    }
  }else if((m===MF_AIR_MISSION_INTERCEPT||m===MF_AIR_MISSION_STRIKE)&&!I&&uAirPhase[i]>=MF_AIR_PHASE_RELEASE){
    const p=uAirPhase[i],fa=uang[i]-Math.PI/2;
    if(p===MF_AIR_PHASE_RELEASE){
      uAirGoalX[i]=clamp(ux[i]+Math.cos(fa)*90,8,MAP-8);uAirGoalY[i]=clamp(uy[i]+Math.sin(fa)*90,8,MAP-8);
      if(uAirPhaseT[i]>.12)mfAirBeginManeuver(i,MF_AIR_PHASE_BREAK,ux[i]+Math.cos(fa)*130,uy[i]+Math.sin(fa)*130);
    }else if(p===MF_AIR_PHASE_BREAK){
      uAirBandReq[i]=MF_AIR_BAND_TACTICAL;mfAirManeuverGoal(i);
      if(mfAirManeuverReached(i,24)||uAirPhaseT[i]>2.5)mfAirBeginManeuver(i,MF_AIR_PHASE_EGRESS,uAirAnchorX[i],uAirAnchorY[i]);
    }else if(p===MF_AIR_PHASE_EGRESS){
      uAirBandReq[i]=MF_AIR_BAND_HIGH;mfAirManeuverGoal(i);
      if(mfAirManeuverReached(i,42)||uAirPhaseT[i]>6){const rp=mfAirReformPoint(i);mfAirBeginManeuver(i,MF_AIR_PHASE_REFORM,rp[0],rp[1]);}
    }else{
      uAirBandReq[i]=MF_AIR_BAND_TACTICAL;mfAirManeuverGoal(i);
      if(mfAirManeuverReached(i,36)||uAirPhaseT[i]>4){uAirMission[i]=uAirHomeMission[i]||mfAirDefaultMission(i,T);mfAirSetPhase(i,MF_AIR_PHASE_HOLD);}
    }
  }else if(m===MF_AIR_MISSION_ESCORT&&uAirEscort[i]>=0&&ualive[uAirEscort[i]]&&ugen[uAirEscort[i]]===uAirEscortG[i]){
    const e=uAirEscort[i],a=(uAirSortie[i]%8)*TAU/8;uAirBandReq[i]=MF_AIR_BAND_TACTICAL;uAirGoalX[i]=clamp(ux[e]+Math.cos(a)*64,8,MAP-8);uAirGoalY[i]=clamp(uy[e]+Math.sin(a)*64,8,MAP-8);uAirAimX[i]=uAirGoalX[i];uAirAimY[i]=uAirGoalY[i];
  }else if(m===MF_AIR_MISSION_RTB){
    const d=Math.hypot(uAirAnchorX[i]-ux[i],uAirAnchorY[i]-uy[i]);uAirGoalX[i]=uAirAnchorX[i];uAirGoalY[i]=uAirAnchorY[i];uAirBandReq[i]=d<72?MF_AIR_BAND_LANDING:MF_AIR_BAND_LOW;
  }else if(m===MF_AIR_MISSION_NONE){
    uAirGoalX[i]=uAirAnchorX[i];uAirGoalY[i]=uAirAnchorY[i];uAirAimX[i]=uAirGoalX[i];uAirAimY[i]=uAirGoalY[i];
  }else{
    const recon=m===MF_AIR_MISSION_RECON;uAirBandReq[i]=recon?MF_AIR_BAND_HIGH:MF_AIR_BAND_TACTICAL;
    mfAirOrbitGoal(i,uAirAnchorX[i],uAirAnchorY[i],recon?145:92,recon?.32:.48);
    if(recon&&((tick+i)%15)===0)mfAirReconSweep(i,T);
    if(uAirPhase[i]===MF_AIR_PHASE_REFORM&&Math.hypot(ux[i]-uAirAnchorX[i],uy[i]-uAirAnchorY[i])<130)mfAirSetPhase(i,MF_AIR_PHASE_HOLD);
  }
  const targetAlt=mfAirBandHeight(uAirBandReq[i]),rate=uAirBandReq[i]===MF_AIR_BAND_LANDING?22:30,ad=targetAlt-uAirAlt[i];
  uAirAlt[i]+=clamp(ad,-rate*dt,rate*dt);if(Math.abs(ad)<.6)uAirBand[i]=uAirBandReq[i];
}
function mfAirMovementGoal(i){return {x:uAirGoalX[i],y:uAirGoalY[i]};}
function mfAirShouldMove(i){
  const d=Math.hypot(uAirGoalX[i]-ux[i],uAirGoalY[i]-uy[i]);
  return uAirMission[i]===MF_AIR_MISSION_NONE?d>5:(uAirBandReq[i]!==MF_AIR_BAND_LANDING||d>5);
}
function mfAirCanFire(i){return !!uAirFire[i];}
function mfAirFireAllowed(i,bearing){
  if(!Number.isFinite(bearing))return mfAirCanFire(i);
  return Math.abs(mfAirWrap(bearing-(uang[i]-Math.PI/2)))<=.35;
}
function mfAirAimPoint(i,x,y){return {x:Number.isFinite(uAirAimX[i])?uAirAimX[i]:x,y:Number.isFinite(uAirAimY[i])?uAirAimY[i]:y};}
function mfAirOnWeaponRelease(i){uAirReleaseN[i]++;uAirFire[i]=0;}
function mfAirProjectVelocity(i,T,vx,vy,speed,dt){
  mfAirEnsure(i,T);const wanted=Math.atan2(vy,vx)+Math.PI/2,turn=T.scout?3.4:(T.ptype===7?2.15:2.8),err=mfAirWrap(wanted-uang[i]),step=clamp(err,-turn*dt,turn*dt);uang[i]+=step;
  const fa=uang[i]-Math.PI/2,align=clamp(Math.cos(mfAirWrap(wanted-uang[i])),.18,1),out=Math.max(0,speed)*align;uAirCourse[i]=wanted;
  uAirYawRate[i]=step/Math.max(.001,dt);
  const wb=clamp(-step/Math.max(.001,turn*dt),-1,1)*.42;uAirBank[i]+=(wb-uAirBank[i])*Math.min(1,dt*7.5);
  const wp=clamp((mfAirBandHeight(uAirBandReq[i])-uAirAlt[i])/72,-.22,.28);uAirPitch[i]+=(wp-uAirPitch[i])*Math.min(1,dt*5.5);
  return {vx:Math.cos(fa)*out,vy:Math.sin(fa)*out};
}
function mfAirAfterMove(i,ox,oy,nx,ny,dt){
  const k=Math.min(1,dt*9),vx=(nx-ox)/Math.max(.001,dt),vy=(ny-oy)/Math.max(.001,dt);uAirVx[i]+=(vx-uAirVx[i])*k;uAirVy[i]+=(vy-uAirVy[i])*k;uAirLastX[i]=nx;uAirLastY[i]=ny;
  mfAirPropulsionHistorySample(i);
}
function mfAirMissionSnapshot(i){
  if(i<0||i>=unitHigh||!ualive[i])return null;const T=TYPES[utype[i]];if(!T||!T.air)return null;mfAirEnsure(i,T);
  return {unit:i,generation:ugen[i],mission:MF_AIR_MISSION_NAME[uAirMission[i]],phase:MF_AIR_PHASE_NAME[uAirPhase[i]],band:MF_AIR_BAND_NAME[uAirBand[i]],requestedBand:MF_AIR_BAND_NAME[uAirBandReq[i]],altitude:+uAirAlt[i].toFixed(4),target:uAirTarget[i],targetGeneration:uAirTargetG[i],goal:[+uAirGoalX[i].toFixed(3),+uAirGoalY[i].toFixed(3)],aim:[+uAirAimX[i].toFixed(3),+uAirAimY[i].toFixed(3)],velocity:[+uAirVx[i].toFixed(3),+uAirVy[i].toFixed(3)],course:+uAirCourse[i].toFixed(5),heading:+uang[i].toFixed(5),yawRate:+uAirYawRate[i].toFixed(5),bank:+uAirBank[i].toFixed(5),pitch:+uAirPitch[i].toFixed(5),pass:uAirPass[i],releaseCount:uAirReleaseN[i],reacquireCount:uAirReacquireN[i],fireAllowed:!!uAirFire[i],sortie:uAirSortie[i]};
}
function mfAirAiMissionTick(dt){
  mfAirAiAcc+=dt;if(mfAirAiAcc<.75)return;mfAirAiAcc=0;
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]||uteam[i]!==1)continue;const T=TYPES[utype[i]];if(!T||!T.air||uCrash[i])continue;mfAirEnsure(i,T);if(uAirTarget[i]!==-1)continue;
    let bx=ux[i],by=uy[i];if(typeof AI!=='undefined'&&AI&&AI.base){bx=AI.base.x;by=AI.base.y;}
    if(T.scout){const hx=typeof heroIdx!=='undefined'&&heroIdx>=0&&ualive[heroIdx]?ux[heroIdx]:MAP*.5,hy=typeof heroIdx!=='undefined'&&heroIdx>=0&&ualive[heroIdx]?uy[heroIdx]:MAP*.5;if(uAirMission[i]!==MF_AIR_MISSION_RECON)mfAirIssueMission(i,'recon',{x:hx,y:hy});}
    else if(T.ptype===7){const e=findEnemyDomain(ux[i],uy[i],1,920,MF_DOM_LAND|MF_DOM_NAVAL,MF_DOM_LAND);if(e>=0)mfAirIssueMission(i,'strike',{x:bx,y:by,target:e,generation:ugen[e]});else if(uAirMission[i]!==MF_AIR_MISSION_CAP)mfAirIssueMission(i,'cap',{x:bx,y:by});}
    else {const e=findEnemyDomain(ux[i],uy[i],1,980,MF_DOM_AIR,MF_DOM_AIR);if(e>=0)mfAirIssueMission(i,'intercept',{x:bx,y:by,target:e,generation:ugen[e]});else if(uAirMission[i]!==MF_AIR_MISSION_CAP)mfAirIssueMission(i,'cap',{x:bx,y:by});}
  }
}
