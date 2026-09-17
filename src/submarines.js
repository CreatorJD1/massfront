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

   DOCTRINE
     Nova       hunter-killer: sonar on the hull, fires while dived
     Legion     Leviathan: thicker, slower, MUST surface to shoot
     Syndicate  Blackwake: fastest, quietest, thinnest shell
     Brood      Abyssal: organic, knits hull while dived
   ============================================================================ */
const MF_SUB_SONAR=18;
const MF_SUB_DIVE=6.4;

function mfSubIs(i){
  const T=typeof TYPES!=='undefined'&&TYPES[utype[i]];
  return !!(T&&T.sub);
}
function mfSubAsw(T){ return !!(T&&(T.asw||T.sub||T.scout)); }
function mfSubProfile(team){
  const f=typeof factionDoctrineKey==='function'?factionDoctrineKey(team):'nova';
  if(f==='legion') return {hp:1.22,spd:0.82,dmg:1.16,sonar:0.72,surfaceFire:1,regen:0};
  if(f==='syndicate') return {hp:0.82,spd:1.20,dmg:0.92,sonar:1.15,surfaceFire:0,regen:0};
  if(f==='horde') return {hp:1.10,spd:0.94,dmg:1.04,sonar:0.80,surfaceFire:0,regen:1};
  return {hp:1,spd:1,dmg:1,sonar:1.22,surfaceFire:0,regen:0};
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
    }
    return i;
  };
}

if(typeof mfDomainSpeedMul==='function'){
  const _mfSubSpd=mfDomainSpeedMul;
  mfDomainSpeedMul=function(i){
    let m=_mfSubSpd(i);
    const T=TYPES[utype[i]];
    if(T&&T.sub) m*=mfSubProfile(uteam[i]).spd;
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
  if(P.surfaceFire&&umode[i]===4) return false;
  return true;
}

function mfSubOnFire(i){
  /* Hunter-killers stay dived. Shot bloom stamps detect so they are not an
     invisible eraser; Legion never reaches this path (surfaceFire). */
  const T=TYPES[utype[i]];
  if(!T||!T.sub) return;
  umode[i]=4;
  umodeT[i]=0;
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
    if(T&&T.sub&&i!=null&&umode[i]===4) h-=MF_SUB_DIVE;
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
      const P=mfSubProfile(uteam[i]);
      if(P.regen&&umode[i]===4&&uhp[i]<uhpm[i]&&((i+tick)&7)===0)
        uhp[i]=Math.min(uhpm[i],uhp[i]+uhpm[i]*0.004*dt*8);
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
      return {id:4,nm:'DIVE',em:'◌',ds:'Silent running under the sheet. Unseen until you fire. −35% speed.'};
    if(T&&T.sub&&m===0)
      return {id:0,nm:'PERISCOPE',em:'▸',ds:'Surfaced. Visible, full speed, guns free.'};
    return d;
  };
}
