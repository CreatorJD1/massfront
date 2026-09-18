;
;
/* ============================================================================
   FACTION SUBMARINES
   ----------------------------------------------------------------------------
   One Harbor chassis (TYPES[UT_SUB]) with four doctrines. Surface fleets stay
   Corvette / Dreadnought; this file is the underwater answer and the ASW that
   makes that answer a decision instead of an invisible eraser.

   RULES
     1. Subs are naval. Pathing, harbors and water-only placement already exist.
        Do not invent a fourth movement grid.
     2. Silent running IS GHOST (umode 4). intel.js already hides and unmasks
        cloak. Spawning submerged is a default mode, not a second stealth flag.
     3. ASW is detection, not a new damage type. Corvettes and other subs stamp
        sonar (fogDetect). Without that stamp a submerged hull cannot be locked.
     4. Faction identity is doctrine + mesh + name, not four TYPES rows.
     5. Ballast is analogue. umode 4 is the DIVE order; ukeel interpolates in
        metres. Flooding is slow. Blow is the escape. Do not snap Y.

   DOCTRINE
     Nova       hunter-killer: sonar on the hull, fires while dived
     Legion     Leviathan: thicker, slower, MUST surface to shoot
     Syndicate  Blackwake: fastest, quietest, thinnest shell
     Brood      Abyssal: organic, knits hull while dived
   ============================================================================ */
const MF_SUB_SONAR=18;
const MF_SUB_DIVE=6.4;
const MF_SUB_SURFACE=3.2;
const MF_SUB_PATROL=52;
const MF_SUB_SHELF=82;
const MF_SUB_STATIONS=[0,14,52,82];
const MF_SUB_CRUSH={nova:430,legion:520,syndicate:305,horde:580};

const _mfSubCap=typeof MAXU==='number'?MAXU:8192;
const ukeel=new Float32Array(_mfSubCap);
const utkeel=new Float32Array(_mfSubCap);

function mfSubIs(i){
  const T=typeof TYPES!=='undefined'&&TYPES[utype[i]];
  return !!(T&&T.sub);
}
function mfSubAsw(T){ return !!(T&&(T.asw||T.sub||T.scout)); }
function mfSubFaction(team){
  return typeof factionDoctrineKey==='function'?factionDoctrineKey(team):'nova';
}
function mfSubProfile(team){
  const f=mfSubFaction(team);
  if(f==='legion') return {hp:1.22,spd:0.82,dmg:1.16,sonar:0.72,surfaceFire:1,regen:0};
  if(f==='syndicate') return {hp:0.82,spd:1.20,dmg:0.92,sonar:1.15,surfaceFire:0,regen:0};
  if(f==='horde') return {hp:1.10,spd:0.94,dmg:1.04,sonar:0.80,surfaceFire:0,regen:1};
  return {hp:1,spd:1,dmg:1,sonar:1.22,surfaceFire:0,regen:0};
}
function mfSubCrush(team){
  return MF_SUB_CRUSH[mfSubFaction(team)]||MF_SUB_CRUSH.nova;
}
function mfSubRate(metres, flooding){
  if(flooding){
    if(metres<28) return 7.2;
    if(metres<48) return 4.4;
    if(metres<168) return 1.85;
    if(metres<390) return 0.95;
    return 0.42;
  }
  if(metres>390) return 6.2;
  if(metres>168) return 9.4;
  if(metres>48) return 13.5;
  return 16.5;
}
function mfSubNextStation(m, cap){
  for(let i=0;i<MF_SUB_STATIONS.length;i++){
    if(MF_SUB_STATIONS[i]>m+5 && MF_SUB_STATIONS[i]<=cap+0.01)
      return Math.min(MF_SUB_STATIONS[i], cap);
  }
  return cap;
}
function mfSubPrevStation(m){
  for(let i=MF_SUB_STATIONS.length-1;i>=0;i--){
    if(MF_SUB_STATIONS[i]<m-5) return MF_SUB_STATIONS[i];
  }
  return 0;
}
function mfSubDived(i){ return ukeel[i]>MF_SUB_SURFACE; }

function mfSubFlood(i){
  if(!mfSubIs(i)) return false;
  const cap=Math.min(MF_SUB_SHELF, mfSubCrush(uteam[i]));
  utkeel[i]=mfSubNextStation(Math.max(ukeel[i], utkeel[i]), cap);
  umode[i]=4; umodeT[i]=0;
  return true;
}
function mfSubBlow(i){
  if(!mfSubIs(i)) return false;
  utkeel[i]=mfSubPrevStation(Math.min(ukeel[i], utkeel[i]));
  if(utkeel[i]<MF_SUB_SURFACE){ umode[i]=0; umodeT[i]=0; }
  return true;
}
function mfSubCrash(i){
  if(!mfSubIs(i)) return false;
  const cap=Math.min(MF_SUB_SHELF, mfSubCrush(uteam[i]));
  utkeel[i]=ukeel[i]<28?Math.min(MF_SUB_PATROL,cap):cap;
  umode[i]=4; umodeT[i]=0;
  return true;
}
function mfSubSurface(i){
  if(!mfSubIs(i)) return false;
  utkeel[i]=0;
  umode[i]=0; umodeT[i]=0;
  return true;
}

if(typeof spawnUnit==='function'){
  const _mfSubSpawn=spawnUnit;
  spawnUnit=function(type,team,x,y,cmdSlot){
    const i=_mfSubSpawn(type,team,x,y,cmdSlot);
    if(i<0) return i;
    const T=TYPES[type];
    if(T&&T.sub){
      const P=mfSubProfile(team);
      uhpm[i]*=P.hp; uhp[i]=uhpm[i];
      umode[i]=4;
      umodeT[i]=0;
      ukeel[i]=MF_SUB_PATROL;
      utkeel[i]=MF_SUB_PATROL;
    }
    return i;
  };
}

if(typeof setMode==='function'){
  const _mfSubSetMode=setMode;
  setMode=function(i,m){
    const was=mfSubIs(i);
    const ok=_mfSubSetMode(i,m);
    if(!ok||!was) return ok;
    if(m===4){
      const cap=Math.min(MF_SUB_SHELF, mfSubCrush(uteam[i]));
      if(ukeel[i]<MF_SUB_SURFACE) utkeel[i]=Math.min(MF_SUB_PATROL, cap);
      else utkeel[i]=mfSubNextStation(ukeel[i], cap);
    } else if(m===0){
      utkeel[i]=0;
    }
    return ok;
  };
}

if(typeof mfDomainSpeedMul==='function'){
  const _mfSubSpd=mfDomainSpeedMul;
  mfDomainSpeedMul=function(i){
    let m=_mfSubSpd(i);
    const T=TYPES[utype[i]];
    if(T&&T.sub){
      m*=mfSubProfile(uteam[i]).spd;
      if(ukeel[i]>8) m*=ukeel[i]>48?0.65:0.82;
    }
    return m;
  };
}
if(typeof mfDomainDamageMul==='function'){
  const _mfSubDmg=mfDomainDamageMul;
  mfDomainDamageMul=function(i,tg){
    let m=_mfSubDmg(i,tg);
    const T=TYPES[utype[i]];
    if(T&&T.sub) m*=mfSubProfile(uteam[i]).dmg;
    return m;
  };
}

function mfSubCanFire(i){
  const T=TYPES[utype[i]];
  if(!T||!T.sub) return true;
  const P=mfSubProfile(uteam[i]);
  if(P.surfaceFire&&(umode[i]===4||ukeel[i]>MF_SUB_SURFACE)) return false;
  return true;
}

function mfSubOnFire(i){
  /* Hunter-killers stay dived. Shot bloom stamps detect so they are not an
     invisible eraser; Legion never reaches this path (surfaceFire). */
  const T=TYPES[utype[i]];
  if(!T||!T.sub) return;
  umode[i]=4;
  umodeT[i]=0;
  if(ukeel[i]<MF_SUB_SURFACE){
    const cap=Math.min(MF_SUB_SHELF, mfSubCrush(uteam[i]));
    utkeel[i]=Math.max(utkeel[i], Math.min(14, cap));
  }
  if(typeof intelStamp==='function'&&typeof fogDetect!=='undefined'){
    const vis=typeof intelVisionScale==='function'?intelVisionScale:n=>n;
    intelStamp(fogDetect,ux[i],uy[i],Math.max(6,Math.round(vis(8))),7);
  }
}

if(typeof intelStampSensors==='function'){
  const _mfSubStamp=intelStampSensors;
  intelStampSensors=function(){
    _mfSubStamp();
    if(typeof intelStamp!=='function'||typeof fogDetect==='undefined') return;
    const vis=typeof intelVisionScale==='function'?intelVisionScale:n=>n;
    for(let i=0;i<unitHigh;i++){
      if(!ualive[i]) continue;
      const T=TYPES[utype[i]];
      if(!mfSubAsw(T)) continue;
      const bit=typeof intelSensorBit==='function'?intelSensorBit(uteam[i]):0;
      if(!bit) continue;
      const P=T.sub?mfSubProfile(uteam[i]):{sonar:1};
      const r=Math.max(5,Math.round(vis(MF_SUB_SONAR)*P.sonar));
      intelStamp(fogDetect,ux[i],uy[i],r,bit);
    }
  };
}

if(typeof unitGroundY==='function'){
  const _mfSubY=unitGroundY;
  unitGroundY=function(T,x,y,i){
    let h=_mfSubY(T,x,y,i);
    if(T&&T.sub&&i!=null){
      const k=ukeel[i]||0;
      h-=MF_SUB_DIVE*Math.max(0, Math.min(1, k/MF_SUB_PATROL));
    }
    return h;
  };
}

if(typeof unitTick==='function'){
  const _mfSubTick=unitTick;
  unitTick=function(dt){
    _mfSubTick(dt);
    if(!dt) return;
    for(let i=0;i<unitHigh;i++){
      if(!ualive[i]||!mfSubIs(i)) continue;
      const cap=Math.min(MF_SUB_SHELF, mfSubCrush(uteam[i]));
      if(utkeel[i]>cap) utkeel[i]=cap;
      const flooding=utkeel[i]>ukeel[i]+0.12;
      const rate=mfSubRate(ukeel[i], flooding);
      if(ukeel[i]<utkeel[i]) ukeel[i]=Math.min(utkeel[i], ukeel[i]+rate*dt);
      else if(ukeel[i]>utkeel[i]) ukeel[i]=Math.max(utkeel[i], ukeel[i]-rate*dt);
      if(ukeel[i]>MF_SUB_SURFACE) umode[i]=4;
      const P=mfSubProfile(uteam[i]);
      if(P.regen&&ukeel[i]>MF_SUB_SURFACE&&uhp[i]<uhpm[i]&&((i+tick)&7)===0)
        uhp[i]=Math.min(uhpm[i],uhp[i]+uhpm[i]*0.004*dt*8);
      if(ukeel[i]>mfSubCrush(uteam[i])){
        uhp[i]-=uhpm[i]*0.045*dt;
        if(uhp[i]<=0){
          uhp[i]=0;
          if(typeof killUnit==='function') killUnit(i);
        }
      }
    }
  };
}

if(typeof unitModeDef==='function'){
  const _mfSubMode=unitModeDef;
  unitModeDef=function(ty,m){
    const d=_mfSubMode(ty,m);
    if(!d) return d;
    const T=TYPES[ty];
    if(T&&T.sub&&m===4)
      return {id:4,nm:'DIVE',em:'◌',ds:'Flood tanks. Slow. Silent running. Unseen until you fire.'};
    if(T&&T.sub&&m===0)
      return {id:0,nm:'SURFACE',em:'▸',ds:'Blow ballast. Visible on the way up. Guns free at the sheet.'};
    return d;
  };
}
