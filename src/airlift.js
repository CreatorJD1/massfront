;
;
/* ============================================================================
   ATLAS SKYCRANE — buildable heavy air transport
   ----------------------------------------------------------------------------
   The pre-deployment `carrier` is the orbital base lander. This module never
   reuses that singleton: the Skycrane is an ordinary TYPES unit with its own
   serialized passenger manifest, orders and generation-safe handles.

   Passengers are deliberately removed from the live simulation while aboard.
   Keeping a hidden ground unit alive made spatial queries, fog and splash
   damage continue to see it; a compact manifest is both cheaper and honest.
   ============================================================================ */
const MF_UT_AIRLIFT=TYPES.length;
const MF_AIRLIFT_CAPACITY=12;
TYPES.push({
  name:'Atlas Skycrane',spr:'raptor',tur:null,size:34,r:12.5,hp:1850,dmg:0,rng:0,cool:9,
  spd:50,psp:0,ptype:0,aoe:0,wk:'n',tg:'a',cm:210,ce:820,bt:13,air:1,tier:2,
  cat:'transport',airTransport:1,transportCap:MF_AIRLIFT_CAPACITY
});
UCAT.transport={nm:'AIR TRANSPORT',em:'⇩'};
UNIT_MODES[MF_UT_AIRLIFT]=[0];
ARM[MF_UT_AIRLIFT]=2;
if(typeof INTEL_ROLE_COPY!=='undefined')
  INTEL_ROLE_COPY.transport='Heavy airlift for relocating infantry, constructors and light vehicles';
if(typeof INTEL_ROLE_GUIDE!=='undefined') INTEL_ROLE_GUIDE.transport={
  tag:'HEAVY AIRLIFT',form:'LOAD / DROP',
  use:'Carry a mixed light force over terrain, then deploy it in a readable formation.',
  avoid:'Unarmed and vulnerable to anti-air; heavy armor, artillery and aircraft cannot board.'
};

/* A broad twin-engine silhouette remains legible at command zoom: deep cargo
   hull, separated wing nacelles, open-looking rear ramp and sparse team trim.
   The geometry uses the same material atlas as the current vehicle pipeline. */
function mfAirliftModel(){
  const m=MB();
  const hull=[[-9,-3.5],[-6.5,-4.8],[3.5,-4.2],[9,-2.2],[10.5,0],[9,2.2],[3.5,4.2],[-6.5,4.8],[-9,3.5]];
  m.extrude(0,3.0,0,hull,3.4,MET_D);
  m.extrude(-.6,6.4,0,hull.map(p=>[p[0]*.78,p[1]*.76]),2.2,MET);
  m.wedge(7.8,8.6,0,5.8,2.0,5.6,GLASS,0,true);                 // flight deck
  m.bevelBox(-6.8,5.6,0,4.0,2.2,6.2,.55,DARK);                // cargo ramp housing
  m.box(-9.0,4.0,0,.65,2.9,5.0,DARKER);                       // shadowed rear aperture
  m.box(-9.38,4.2,0,.28,2.4,4.2,MET_L);                       // ramp lip
  for(const side of [-1,1]){
    m.wedge(-.2,5.8,side*6.0,14.5,1.15,5.6,TEAM_A,Math.PI/2,side<0);
    m.bevelBox(-1.0,5.0,side*7.8,7.4,3.0,3.5,.55,MET_D);
    cylX(m,-4.2,6.0,side*7.8,7.2,1.62,1.20,12,MET,false);
    tubeX(m,2.5,6.0,side*7.8,1.05,1.78,.92,12,TWR_BORE);
    m.box(-.8,8.4,side*7.8,4.8,.32,1.9,ENERGY);
    m.bevelBox(-4.2,1.4,side*3.9,6.2,1.0,1.3,.25,DARKER);      // landing rail
    for(const x of [-6.4,-2.0]) m.cyl(x,.25,side*3.9,.48,.48,1.4,8,RUBBER);
  }
  m.bevelBox(-2.0,8.3,0,8.8,1.2,5.8,.35,TEAM_T);
  ventBank(m,-3.0,9.52,0,5.2,4.4,6,MET_D,0);
  glowStrip(m,2.2,8.55,-3.1,5.4,ENERGY,0);
  glowStrip(m,2.2,8.55, 3.1,5.4,ENERGY,0);
  m.box(-7.0,8.1,0,3.8,.7,1.1,LAMP);                          // cargo status light
  sensorMast(m,-5.2,9.4,1.4,2.1,MET_L);
  return {hull:m.build(),tur:null,s:1.18,air:1};
}
/* TYPES gained two non-rendered simulation entries before the transport.
   Filling their fallback factories also keeps initModels' dense loop valid. */
if(!UNIT_MDL[31]) UNIT_MDL[31]=mdlBroodmother;
if(!UNIT_MDL[32]) UNIT_MDL[32]=mdlConstructor;
UNIT_MDL[MF_UT_AIRLIFT]=mfAirliftModel;

const mfAirliftHolds=[];
let mfAirliftBoardOrders=[];
let mfAirliftAim=null;
let mfAirliftLastLoss=0;

function mfAirliftIsLive(i,gen){
  return mfTransportIsLive(i,gen,'atlas');
}
function mfTransportKindByType(type){
  if(type===MF_UT_AIRLIFT)return 'atlas';
  if(typeof MF_UT_MASSFLESH!=='undefined'&&(type===MF_UT_MASSFLESH||type===MF_UT_MASSFLESH_AIR))return 'massflesh';
  return '';
}
function mfTransportIsLive(i,gen,kind){
  return i>=0&&ualive[i]&&ugen[i]===gen&&mfTransportKindByType(utype[i])===kind;
}
function mfAirliftHold(i,create){
  if(i<0) return null;
  let H=mfAirliftHolds[i];
  if(H&&H.gen!==ugen[i]) H=mfAirliftHolds[i]=null;
  if(!H&&create&&ualive[i]&&utype[i]===MF_UT_AIRLIFT)
    H=mfAirliftHolds[i]={gen:ugen[i],capacity:MF_AIRLIFT_CAPACITY,used:0,cargo:[],mission:null,fx:0};
  return H;
}
function mfAirliftSlotCost(i){
  if(i<0||!ualive[i]) return 0;
  const T=TYPES[utype[i]],cat=T.cat||'veh';
  if(T.airTransport||T.air||T.naval||cat==='art'||cat==='exp'||cat==='hero') return 0;
  if(T.builder||T.miner) return 1;
  if(cat==='inf') return 1;
  if(cat==='veh'&&(ARM[utype[i]]||0)<=1&&T.size<=18) return 2;
  return 0;
}
function mfAirliftReserved(i,gen){
  let n=0;
  for(const O of mfAirliftBoardOrders) if(O.sky===i&&O.skyGen===gen)n+=O.slots;
  return n;
}
function mfAirliftSerialize(i,slots){
  return {
    type:utype[i],team:uteam[i],slots,
    hpRatio:uhpm[i]>0?uhp[i]/uhpm[i]:1,
    veteran:uvet[i],kills:ukills[i],mode:umode[i],cool:Math.max(0,ucool[i]),
    cmd:typeof uCmd!=='undefined'?uCmd[i]:-1
  };
}
function mfAirliftBoardPoint(O,rank){
  const side=(rank&1)?1:-1,row=Math.floor(rank/2),a=uang[O.sky]-Math.PI/2;
  const back=17+row*5,lateral=side*(7+row*1.5);
  return {
    x:ux[O.sky]-Math.cos(a)*back-Math.sin(a)*lateral,
    y:uy[O.sky]-Math.sin(a)*back+Math.cos(a)*lateral
  };
}
function mfAirliftEligibleSelection(sky){
  const ok=[],rejected=[];
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]&&i!==sky){
    const slots=mfAirliftSlotCost(i);
    (slots?ok:rejected).push({i,gen:ugen[i],slots});
  }
  return {ok,rejected};
}
function mfAirliftQueueBoard(sky,entries,playerOrder){
  if(!ualive[sky]||utype[sky]!==MF_UT_AIRLIFT)return 0;
  const H=mfAirliftHold(sky,true),team=uteam[sky];
  let free=H.capacity-H.used-mfAirliftReserved(sky,H.gen),n=0;
  for(const i of entries){
    const slots=mfAirliftSlotCost(i);
    if(!slots||slots>free||uteam[i]!==team||i===sky)continue;
    if(mfAirliftBoardOrders.some(O=>O.unit===i&&O.unitGen===ugen[i]))continue;
    mfAirliftBoardOrders.push({unit:i,unitGen:ugen[i],sky,skyGen:H.gen,slots});
    free-=slots;n++;
  }
  if(n){
    utgt[sky]=-1;ustate[sky]=0;utx[sky]=ux[sky];uty[sky]=uy[sky];uhold[sky]=1;
    if(playerOrder){
      clearSel();usel[sky]=1;updateSelInfo();
      toast('⇩ BOARDING '+n+' UNIT'+(n===1?'':'S'));
      uiCommandAck('move',n,ux[sky],uy[sky]);
    }
  }
  return n;
}
function mfAirliftIssueBoard(sky){
  if(!ualive[sky]||uteam[sky]!==0||utype[sky]!==MF_UT_AIRLIFT)return false;
  const picked=mfAirliftEligibleSelection(sky);
  const n=mfAirliftQueueBoard(sky,picked.ok.map(P=>P.i),true);
  if(!n){
    toast(picked.rejected.length?'CANNOT BOARD — only infantry, constructors and light vehicles':'SKYCRANE CARGO FULL');
    sfx('reject');return false;
  }
  return true;
}
function mfAirliftFormation(cargo,x,y){
  const n=cargo.length,cols=Math.max(1,Math.ceil(Math.sqrt(n*1.45))),rows=Math.ceil(n/cols),out=[];
  let largest=5;
  for(const P of cargo)largest=Math.max(largest,(TYPES[P.type]&&TYPES[P.type].r)||5);
  const gap=Math.max(16,largest*2+7);
  for(let k=0;k<n;k++){
    const col=k%cols,row=Math.floor(k/cols),px=x+(col-(Math.min(cols,n-row*cols)-1)/2)*gap;
    const py=y+(row-(rows-1)/2)*gap;
    let L=findLand(clamp(px,18,MAP-18),clamp(py,18,MAP-18));
    if(typeof battlefieldClampPoint==='function')L=battlefieldClampPoint(L[0],L[1],22);
    out.push({x:L[0],y:L[1]});
  }
  return out;
}
function mfAirliftCommandUnload(sky,x,y){
  const H=mfAirliftHold(sky,false);
  if(!H||!H.cargo.length)return false;
  x=clamp(x,24,MAP-24);y=clamp(y,24,MAP-24);
  if(typeof battlefieldClampPoint==='function'){const p=battlefieldClampPoint(x,y,48);x=p[0];y=p[1];}
  H.mission={x,y,slots:mfAirliftFormation(H.cargo,x,y)};
  uhold[sky]=0;utgt[sky]=-1;ustate[sky]=1;utx[sky]=x;uty[sky]=y;
  mfAirliftAim=null;if(typeof aiming!=='undefined'&&aiming===9)aiming=-1;mfAirliftUpdateButton();
  addParticle(3,x,y,0,0,.72,44,92,226,255);
  if(uteam[sky]===0){toast('⇩ DROP ZONE CONFIRMED · '+H.cargo.length+' PASSENGERS');uiCommandAck('move',1,x,y);}
  return true;
}
function mfAirliftArmUnload(sky){
  const H=mfAirliftHold(sky,false);
  if(!H||!H.cargo.length){toast('SKYCRANE CARGO EMPTY');sfx('reject');return false;}
  mfAirliftAim={sky,gen:ugen[sky]};
  /* aiming 9 is the map-confirm for UNLOAD. input.js dispatches it the same
     way as jump/lance so a later onTap rewrite cannot leave this UI-only. */
  if(typeof aiming!=='undefined')aiming=9;
  if(typeof armPatrol!=='undefined'&&armPatrol)cancelPatrolDraft(true);
  mfAirliftUpdateButton();
  toast('⇩ TAP THE MAP TO SET A DROP ZONE');sfx('ui');return true;
}
function mfAirliftConfirmAim(wx,wy){
  const A=mfAirliftAim;mfAirliftAim=null;
  if(typeof aiming!=='undefined'&&aiming===9)aiming=-1;
  mfAirliftUpdateButton();
  if(A&&mfAirliftIsLive(A.sky,A.gen))mfAirliftCommandUnload(A.sky,wx,wy);
}
function mfAirliftDiscardHold(H){
  /* Wipe a manifest without UnloadNow/BirthNow. Callers that already released
     pop-holds (killUnit) or wiped the ledger (resetWorld) must not popHold. */
  if(!H) return;
  H.cargo.length=0;H.used=0;H.mission=null;H.flight=0;
}
function mfAirliftResetHolds(){
  /* resetWorld zeros ualive/teamCount/popCmd without killUnit, so boarded
     pop-holds would survive into the next match. A later preTick still sees
     the old gen on that slot (ugen is not reset) and PostTick UnloadNow /
     Massflesh BirthNow would spawn ghosts and popCmdDec the new ledger.
     Discard here; do not spawn and do not popHold — the cap stays 1000. */
  for(let i=0;i<mfAirliftHolds.length;i++) mfAirliftDiscardHold(mfAirliftHolds[i]);
  mfAirliftHolds.length=0;mfAirliftBoardOrders.length=0;mfAirliftAim=null;
  for(let i=0;i<mfMassHolds.length;i++) mfAirliftDiscardHold(mfMassHolds[i]);
  mfMassHolds.length=0;mfMassBoardOrders.length=0;mfMassBirthAim=null;mfMassAlertUnit=-1;
  if(typeof aiming!=='undefined'&&(aiming===9||aiming===10)) aiming=-1;
}
function mfAirliftPreTick(dt){
  for(let k=mfAirliftBoardOrders.length-1;k>=0;k--){
    const O=mfAirliftBoardOrders[k];
    if(!mfAirliftIsLive(O.sky,O.skyGen)||!ualive[O.unit]||ugen[O.unit]!==O.unitGen){
      mfAirliftBoardOrders.splice(k,1);continue;
    }
    const rank=mfAirliftBoardOrders.filter(Q=>Q.sky===O.sky&&Q.skyGen===O.skyGen).indexOf(O);
    const P=mfAirliftBoardPoint(O,Math.max(0,rank));
    utgt[O.unit]=-1;utgtg[O.unit]=-1;uhold[O.unit]=0;ustate[O.unit]=1;
    utx[O.unit]=P.x;uty[O.unit]=P.y;
  }
  for(let i=0;i<mfAirliftHolds.length;i++){
    const H=mfAirliftHolds[i];
    if(!H) continue;
    /* Stale gen after resetWorld or slot reuse: never steer into UnloadNow. */
    if(!mfAirliftIsLive(i,H.gen)){mfAirliftDiscardHold(H);mfAirliftHolds[i]=null;continue;}
    if(!H.mission) continue;
    utgt[i]=-1;utgtg[i]=-1;uhold[i]=0;ustate[i]=1;utx[i]=H.mission.x;uty[i]=H.mission.y;
  }
}
function mfAirliftPopHold(P,on){
  /* Cargo stays on the seat ledger while aboard so unload cannot fail at cap
     and so boarding cannot be used to raise the live army past FACTION_POP_CAP.
     Do not change the cap constant; this only keeps the already-paid bodies. */
  if(!P) return;
  const team=P.team,slot=P.cmd;
  if(on){
    teamCount[team]++;
    if(team<2&&typeof popCmdInc==='function') popCmdInc(slot);
  }else{
    if(teamCount[team]>0) teamCount[team]--;
    if(team<2&&typeof popCmdDec==='function') popCmdDec(slot);
  }
}
function mfAirliftUnloadNow(i,H){
  const remaining=[],dropped=[];
  for(let k=0;k<H.cargo.length;k++){
    const P=H.cargo[k],S=H.mission.slots[k]||{x:H.mission.x,y:H.mission.y};
    mfAirliftPopHold(P,false);
    const u=spawnUnit(P.type,P.team,S.x,S.y,P.cmd);
    if(u<0){mfAirliftPopHold(P,true);remaining.push(P);continue;}
    uhp[u]=clamp(uhpm[u]*P.hpRatio,1,uhpm[u]);uvet[u]=P.veteran;ukills[u]=P.kills;ucool[u]=P.cool;
    if(unitModes(P.type).indexOf(P.mode)>=0)umode[u]=P.mode;
    utx[u]=S.x;uty[u]=S.y;ustate[u]=0;
    addBeam(ux[i],uy[i],ux[u],uy[u],3.4,90,225,255,.30,'tractor');
    addParticle(3,ux[u],uy[u],0,0,.55,TYPES[P.type].size*1.9,92,226,255);
    dropped.push(u);
  }
  H.cargo=remaining;H.used=remaining.reduce((n,P)=>n+P.slots,0);H.mission=null;
  uhold[i]=0;ustate[i]=0;utx[i]=ux[i];uty[i]=uy[i];
  sfx('deploy',ux[i],uy[i],1.15);
  if(dropped.length&&uteam[i]===0){toast('⇩ '+dropped.length+' UNIT'+(dropped.length===1?'':'S')+' DEPLOYED');uiCommandAck('deploy',dropped.length,ux[i],uy[i]);}
  if(remaining.length&&uteam[i]===0)toast('DROP PARTIAL — '+remaining.length+' PASSENGERS REMAIN');
  updateSelInfo();
}
function mfAirliftPostTick(dt){
  let changed=false;
  for(let k=mfAirliftBoardOrders.length-1;k>=0;k--){
    const O=mfAirliftBoardOrders[k];
    if(!mfAirliftIsLive(O.sky,O.skyGen)||!ualive[O.unit]||ugen[O.unit]!==O.unitGen){
      mfAirliftBoardOrders.splice(k,1);continue;
    }
    const reach=TYPES[utype[O.unit]].r+TYPES[MF_UT_AIRLIFT].r+8;
    if(dist2(ux[O.unit],uy[O.unit],ux[O.sky],uy[O.sky])>reach*reach)continue;
    const H=mfAirliftHold(O.sky,true),P=mfAirliftSerialize(O.unit,O.slots),px=ux[O.unit],py=uy[O.unit];
    H.cargo.push(P);H.used+=O.slots;
    mfAirliftPopHold(P,true);
    addBeam(px,py,ux[O.sky],uy[O.sky],3.6,86,226,255,.34,'tractor');
    addParticle(3,px,py,0,0,.45,TYPES[P.type].size*1.8,86,226,255);
    killUnit(O.unit,true);mfAirliftBoardOrders.splice(k,1);changed=true;
    sfx('laser',ux[O.sky],uy[O.sky],.62);
  }
  for(let i=0;i<mfAirliftHolds.length;i++){
    const H=mfAirliftHolds[i];
    if(!H)continue;
    if(!mfAirliftIsLive(i,H.gen)){mfAirliftHolds[i]=null;continue;}
    if(H.mission){
      H.fx-=dt;
      if(H.fx<=0){
        H.fx=.16;
        for(const S of H.mission.slots)addParticle(3,S.x,S.y,0,0,.23,18,86,226,255);
        addParticle(3,H.mission.x,H.mission.y,0,0,.28,42,210,246,255);
      }
      if(dist2(ux[i],uy[i],H.mission.x,H.mission.y)<22*22)mfAirliftUnloadNow(i,H);
    }
  }
  if(changed){
    let loaded=0,player=false;
    for(let i=0;i<mfAirliftHolds.length;i++){
      const H=mfAirliftHolds[i];if(!H)continue;loaded+=H.cargo.length;
      if(mfAirliftIsLive(i,H.gen)&&uteam[i]===0)player=true;
    }
    if(player)toast('⇩ CARGO SECURED · '+loaded+' ABOARD');updateSelInfo();
  }
}

/* Takeovers preserve the base simulation as the fallback path. */
const mfAirliftPopResetBase=populationResetLedgers;
populationResetLedgers=function(){
  /* resetWorld wipes the seat ledger here. Holds must die in the same breath
     or the next preTick still owns cargo against a zeroed cap. */
  mfAirliftResetHolds();
  mfAirliftPopResetBase();
};
const mfAirliftSpawnUnitBase=spawnUnit;
spawnUnit=function(type,team,x,y,cmdSlot){
  const i=mfAirliftSpawnUnitBase(type,team,x,y,cmdSlot);
  if(i>=0){mfAirliftHolds[i]=null;if(type===MF_UT_AIRLIFT)mfAirliftHold(i,true);}
  return i;
};
const mfAirliftKillUnitBase=killUnit;
killUnit=function(i,silent){
  if(ualive[i]&&utype[i]===MF_UT_AIRLIFT){
    const H=mfAirliftHold(i,false),lost=H?H.cargo.length:0;
    mfAirliftLastLoss=lost;
    for(const O of mfAirliftBoardOrders) if(O.sky===i&&O.skyGen===ugen[i]&&ualive[O.unit]&&ugen[O.unit]===O.unitGen){
      ustate[O.unit]=0;utgt[O.unit]=-1;utx[O.unit]=ux[O.unit];uty[O.unit]=uy[O.unit];
    }
    mfAirliftBoardOrders=mfAirliftBoardOrders.filter(O=>!(O.sky===i&&O.skyGen===ugen[i]));
    if(mfAirliftAim&&mfAirliftAim.sky===i&&mfAirliftAim.gen===ugen[i]){mfAirliftAim=null;if(typeof aiming!=='undefined'&&aiming===9)aiming=-1;}
    if(H){for(const P of H.cargo)mfAirliftPopHold(P,false);H.cargo.length=0;H.used=0;H.mission=null;mfAirliftHolds[i]=null;}
    if(lost&&!silent){
      addParticle(3,ux[i],uy[i],0,0,.8,70,255,112,70);
      toast('AIRLIFT LOST · '+lost+' PASSENGER'+(lost===1?'':'S')+' KILLED');
    }
  }
  return mfAirliftKillUnitBase(i,silent);
};
const mfAirliftUnitTickBase=unitTick;
unitTick=function(dt){mfAirliftPreTick(dt);mfAirliftUnitTickBase(dt);mfAirliftPostTick(dt);};

/* A board order is intentionally higher priority than ordinary friendly-unit
   selection: selected troops + tap Skycrane is the whole mobile gesture. */
const mfAirliftOnTapBase=onTap;
onTap=function(sx,sy){
  const W=s2w(sx,sy),wx=W[0],wy=W[1];
  if(mfAirliftAim){
    mfAirliftConfirmAim(wx,wy);
    return;
  }
  const pk=pickUnit(wx,wy);
  if(pk.own>=0&&utype[pk.own]===MF_UT_AIRLIFT&&selCount()>0&&!usel[pk.own]){
    if(mfAirliftIssueBoard(pk.own))return;
    const hasOther=(()=>{for(let i=0;i<unitHigh;i++)if(ualive[i]&&usel[i]&&i!==pk.own)return true;return false;})();
    if(hasOther)return;
  }
  return mfAirliftOnTapBase(sx,sy);
};

function mfAirliftSvgIcon(size){
  const w=document.createElement('div');w.className='mfAirliftIcon';w.style.width=size+'px';w.style.height=size+'px';
  w.innerHTML='<svg viewBox="0 0 96 96" aria-hidden="true"><defs><linearGradient id="mfSkyG" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d8edf7"/><stop offset="1" stop-color="#547187"/></linearGradient></defs><path fill="#17354a" stroke="#75dcff" stroke-width="3" d="M8 53l25-12 7-24h16l7 24 25 12-4 13-27-5-2 18H41l-2-18-27 5z"/><path fill="url(#mfSkyG)" d="M39 33h18l7 22-16 12-16-12z"/><path fill="#7ee8ff" d="M42 24h12v11H42zM16 54h18v6H16zm46 0h18v6H62z"/><path fill="#07121a" d="M41 69h14v8H41z"/></svg>';
  return w;
}
const mfAirliftUnitIconBase=unitIconEl;
unitIconEl=function(tIdx,size,kit){
  /* Route transports through the faction-exact live thumbnail path. A single
     Atlas SVG made the Syndicate Phase Ark look like Blue hardware while its
     preview was loading. */
  return mfAirliftUnitIconBase(tIdx,size,kit);
};
const mfAirliftPurposeBase=intelUnitPurpose;
intelUnitPurpose=function(T){
  if(T&&T.airTransport)return 'Unarmed heavy airlift. Board infantry, constructors and light vehicles, then set a protected formation drop zone.';
  return mfAirliftPurposeBase(T);
};

const mfAirliftShowUnitTypeBase=showUnitTypeCard;
showUnitTypeCard=function(tIdx,pinned,kit){
  mfAirliftShowUnitTypeBase(tIdx,pinned,kit);
  if(tIdx!==MF_UT_AIRLIFT)return;
  const row=$('unitCard')&&$('unitCard').querySelector('.ucChips');
  if(row)row.insertAdjacentHTML('beforeend',intelChip('⬣','WEIGHT: HEAVY')
    +'<span class="ucChip mfAirliftCapacity"><i>▦</i>'+MF_AIRLIFT_CAPACITY+' SLOTS</span>');
};
const mfAirliftShowUnitBase=showUnitCard;
showUnitCard=function(uIdx,bIdx,pinned){
  mfAirliftShowUnitBase(uIdx,bIdx,pinned);
  if(uIdx<0||!ualive[uIdx]||utype[uIdx]!==MF_UT_AIRLIFT)return;
  const H=mfAirliftHold(uIdx,true),chip=$('unitCard')&&$('unitCard').querySelector('.mfAirliftCapacity');
  if(chip)chip.innerHTML='<i>▦</i>'+H.used+' / '+H.capacity+' SLOTS';
};

/* Extension production cards must obey the same release/drag contract as the
   core roster. Mark them locally safe only after mfBindTap owns the gesture;
   the pointerdown fallback stays unmarked so input.js guards and replays it on
   a completed release instead of trusting an unsafe caller. */
function mfAirliftBindReleaseCard(d,fn){
  if(typeof mfBindTap==='function'){
    d.dataset.mfReleaseSafe='1';
    mfBindTap(d,fn);
  }else d.addEventListener('pointerdown',fn);
}

function mfAirliftRenderCard(){
  const g=$('prodGrid'),T=TYPES[MF_UT_AIRLIFT];g.innerHTML='';
  renderMenuRoleBrief('unit','transport',[MF_UT_AIRLIFT]);
  const d=document.createElement('div');d.className='bcard mfAirliftCard';
  d.innerHTML='<div class="nm">'+T.name+'</div><div class="cost">'+T.cm+'m <span>'+T.ce+'e</span></div>'
    +'<div class="mfAirliftBadges"><b>HEAVY</b><b>AIR TRANSPORT</b><b>'+T.transportCap+' SLOTS</b></div>'
    +'<div class="cardPurpose">INFANTRY · CONSTRUCTORS · LIGHT VEHICLES</div>';
  d.setAttribute('role','button');d.setAttribute('aria-label','Build Atlas Skycrane heavy air transport, capacity 12 slots');
  const icw=document.createElement('div');icw.className='icw';icw.appendChild(unitIconEl(MF_UT_AIRLIFT,48));d.insertBefore(icw,d.firstChild);
  mfAirliftBindReleaseCard(d,ev=>{
    ev.stopPropagation();if(openBld<0)return;const B=blds[openBld];
    if(B&&B.alive&&B.queue.length<30){B.queue.push(MF_UT_AIRLIFT);sfx('ui');renderQueue();}
  });
  addCardIntelButton(d,'unit',MF_UT_AIRLIFT);g.appendChild(d);
}
const mfAirliftRenderProdBase=renderProdMenu;
renderProdMenu=function(){
  const B=openBld>=0?blds[openBld]:null,airliftKit=B?bldFactionKey(B):'',
    atlas=!!(B&&B.type==='airfield'&&typeof factionUnitModelAllowed==='function'&&
      factionUnitModelAllowed(MF_UT_AIRLIFT,airliftKit)),
    wants=atlas&&prodTab==='transport';
  mfAirliftRenderProdBase();
  if(!atlas)return;
  const tr=$('prodTabs');tr.style.display='flex';
  const b=document.createElement('button');b.className='tabBtn'+(wants?' on':'');
  b.innerHTML='<span class="tEm">⇩</span>AIRLIFT';b.setAttribute('aria-label','Air transport production');
  if(wants)for(const x of tr.querySelectorAll('.tabBtn'))x.classList.remove('on');
  if(wants)b.classList.add('on');
  mfBindNativePress(b,ev=>{ev.stopPropagation();prodTab='transport';sfx('ui');renderProdMenu();});
  tr.appendChild(b);
  if(wants){prodTab='transport';mfAirliftRenderCard();}
  /* The transport also belongs in AIRCRAFT. A dedicated tab is discoverable
     only if you already know to look for it, and AIRCRAFT is what opens by
     default — so from the player's side the Atlas Skycrane simply was not in
     the airfield. It is now listed with the aircraft AND keeps its own tab for
     the role brief. */
  if(prodTab==='air'&&!$('prodGrid').querySelector('.mfAirliftCard')) mfAirliftAppendCard($('prodGrid'));
};
/* The card, without the tab's role-brief header, so it can be appended to an
   existing grid. mfAirliftRenderCard() clears the grid; this one does not. */
function mfAirliftAppendCard(g){
  if(!g) return;
  const T=TYPES[MF_UT_AIRLIFT];
  const d=document.createElement('div');d.className='bcard mfAirliftCard';
  d.innerHTML='<div class="nm">'+T.name+'</div><div class="cost">'+T.cm+'m <span>'+T.ce+'e</span></div>'
    +'<div class="mfAirliftBadges"><b>HEAVY</b><b>AIR TRANSPORT</b><b>'+T.transportCap+' SLOTS</b></div>'
    +'<div class="cardPurpose">INFANTRY · CONSTRUCTORS · LIGHT VEHICLES</div>';
  d.setAttribute('role','button');
  d.setAttribute('aria-label','Build Atlas Skycrane heavy air transport, capacity '+T.transportCap+' slots');
  const icw=document.createElement('div');icw.className='icw';icw.appendChild(unitIconEl(MF_UT_AIRLIFT,48));
  d.insertBefore(icw,d.firstChild);
  mfAirliftBindReleaseCard(d,ev=>{
    ev.stopPropagation();if(openBld<0)return;const B=blds[openBld];
    if(B&&B.alive&&B.queue.length<30){B.queue.push(MF_UT_AIRLIFT);sfx('ui');renderQueue();}
  });
  addCardIntelButton(d,'unit',MF_UT_AIRLIFT);g.appendChild(d);
}

function mfAirliftSelected(){
  let found=-1;
  for(let i=0;i<unitHigh;i++)if(ualive[i]&&usel[i]&&utype[i]===MF_UT_AIRLIFT){if(found>=0)return -1;found=i;}
  return found;
}
function mfAirliftUpdateButton(){
  const b=$('mfUnloadBtn');if(!b)return;
  const i=mfAirliftSelected(),H=i>=0?mfAirliftHold(i,true):null;
  b.style.display=i>=0?'flex':'none';b.disabled=!H||!H.cargo.length;
  b.classList.toggle('on',!!(mfAirliftAim&&i===mfAirliftAim.sky&&ugen[i]===mfAirliftAim.gen));
  const nm=b.querySelector('.lbl');if(nm)nm.textContent=H&&H.cargo.length?'UNLOAD '+H.cargo.length:'UNLOAD';
  b.setAttribute('aria-label',H?'Unload Skycrane cargo, '+H.used+' of '+H.capacity+' slots used':'Unload Skycrane cargo');
}
const mfAirliftUpdateSelBase=updateSelInfo;
updateSelInfo=function(){
  mfAirliftUpdateSelBase();
  const i=mfAirliftSelected(),H=i>=0?mfAirliftHold(i,true):null;
  if(i<0&&mfAirliftAim){mfAirliftAim=null;}
  if(H){
    const line=$('selInfo')&&$('selInfo').querySelector('.selIntelCopy span');
    if(line)line.textContent+=' · AIR TRANSPORT · CARGO '+H.used+'/'+H.capacity;
    const chip=$('unitCard')&&$('unitCard').querySelector('.mfAirliftCapacity');
    if(chip)chip.innerHTML='<i>▦</i>'+H.used+' / '+H.capacity+' SLOTS';
  }
  mfAirliftUpdateButton();
};
function mfAirliftInitUI(){
  const row=$('tacRow');if(!row||$('mfUnloadBtn'))return;
  const b=document.createElement('button');b.type='button';b.className='cbtn mfAirliftOrder';b.id='mfUnloadBtn';
  b.style.display='none';b.innerHTML='<span class="em">⇩</span><span class="lbl">UNLOAD</span>';
  mfBindNativePress(b,ev=>{ev.preventDefault();ev.stopPropagation();const i=mfAirliftSelected();if(i>=0)mfAirliftArmUnload(i);});
  row.insertBefore(b,$('clearBtn'));
  const st=document.createElement('style');st.textContent='\n'
    +'.mfAirliftIcon{filter:drop-shadow(0 0 7px rgba(90,220,255,.42)) drop-shadow(0 4px 4px rgba(0,0,0,.65))}.mfAirliftIcon svg{width:100%;height:100%;display:block}'
    +'.mfAirliftBadges{display:flex;flex-wrap:wrap;justify-content:center;gap:3px;margin:3px 0}.mfAirliftBadges b{padding:3px 5px;border:1px solid rgba(100,220,255,.38);border-radius:4px;background:rgba(20,92,122,.32);color:#9beaff;font:700 7px/1 var(--fT);letter-spacing:.05em}'
    +'.mfAirliftCard{min-height:126px}.mfAirliftOrder{min-width:49px!important;min-height:44px!important}.mfAirliftOrder:disabled{opacity:.42;filter:saturate(.45)}';
  document.head.appendChild(st);
}
mfAirliftInitUI();

/* ============================================================================
   MASSFLESH — Brood breakthrough transport
   ----------------------------------------------------------------------------
   This is not a recoloured Skycrane. It is a heavy walking digestive organism
   that absorbs a light brood, unfolds into a short-lived flying form, lashes a
   path through rear structures, then births the stored organisms behind the
   defensive line. Two TYPES entries let the existing simulation and renderer
   apply honest counters without per-frame global flags:
     landed  = HEAVY ground target → anti-tank
     winged  = AIR target          → anti-air
   ============================================================================ */
const MF_UT_MASSFLESH=TYPES.length,MF_MASS_CAPACITY=18,MF_MASS_FLIGHT=26;
TYPES.push({
  name:'Massflesh Carrier',spr:'brood',tur:null,size:42,r:15.5,hp:2850,dmg:0,rng:0,cool:9,
  spd:25,psp:0,ptype:0,aoe:0,wk:'n',tg:'g',cm:190,ce:610,bt:12,air:0,tier:2,
  cat:'biomass',brood:1,massflesh:1,transportCap:MF_MASS_CAPACITY
});
const MF_UT_MASSFLESH_AIR=TYPES.length;
TYPES.push({
  name:'Massflesh Ascendant',spr:'brood',tur:null,size:45,r:16,hp:2850,dmg:58,rng:145,cool:1.55,
  spd:58,psp:0,ptype:0,aoe:0,wk:'n',tg:'g',cm:0,ce:0,bt:0,air:1,tier:2,
  cat:'biomass',brood:1,massflesh:1,massfleshAir:1,transportCap:MF_MASS_CAPACITY
});
UCAT.biomass={nm:'LIVING TRANSPORT',em:'♒'};
UNIT_MODES[MF_UT_MASSFLESH]=[0];UNIT_MODES[MF_UT_MASSFLESH_AIR]=[0];
ARM[MF_UT_MASSFLESH]=2;ARM[MF_UT_MASSFLESH_AIR]=0;
INTEL_ROLE_COPY.biomass='Living breakthrough carrier that consumes a light brood and births it behind defenses';
INTEL_ROLE_GUIDE.biomass={
  tag:'BREAKTHROUGH ORGANISM',form:'MERGE / ASCEND / BIRTH',
  use:'Absorb a light brood, cross the defensive line during timed flight, then birth the attack in the rear.',
  avoid:'Counter the landed body with anti-tank and the winged body with dedicated anti-air.'
};

/* Massflesh uses its own biological zones. Reusing CHITIN/BIO_MEM across the
   whole animal produced a pale toy capsule in the tactical preview and a row
   of dark beads in flight. These colours select distinct PBR atlas materials:
   shell, wet muscle, translucent lift sac, membrane, bone, cavity and organ. */
const MF_CHITIN=C(72,43,39),MF_CHITIN_H=C(132,79,57),MF_FLESH=C(88,35,50),MF_FLESH_H=C(151,61,77);
const MF_SAC=C(148,196,84),MF_MEM=C(72,48,86),MF_TENDON=C(111,77,94),MF_WEAK=C(218,112,255),MF_WEAK_H=C(232,255,132);
const MF_BORE=C(11,5,10),MF_BONE=C(211,190,145);
COL_MAT.set(MF_CHITIN,MAT.CHITIN);COL_MAT.set(MF_CHITIN_H,MAT.CHITIN);
COL_MAT.set(MF_FLESH,MAT.RUST);COL_MAT.set(MF_FLESH_H,MAT.LEAF);
COL_MAT.set(MF_SAC,MAT.CRYST);COL_MAT.set(MF_MEM,MAT.LEAF);COL_MAT.set(MF_TENDON,MAT.LEAF);
COL_MAT.set(MF_WEAK,MAT.TWR_GLOW);COL_MAT.set(MF_WEAK_H,MAT.LAMP);
COL_MAT.set(MF_BORE,MAT.TWR_BORE);COL_MAT.set(MF_BONE,MAT.STONE);

/* Join a tapered primitive between authored anatomy points. Curved limbs use
   several short segments: inexpensive on mobile, but far clearer than boxes
   or disconnected bead chains. */
function mfMassLimb(m,a,b,r1,r2,col,seg){
  let dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];const len=Math.hypot(dx,dy,dz)||1;dx/=len;dy/=len;dz/=len;
  const rx=Math.abs(dy)>.92?1:0,ry=Math.abs(dy)>.92?0:1,rz=0;
  let vx=ry*dz-rz*dy,vy=rz*dx-rx*dz,vz=rx*dy-ry*dx,vl=Math.hypot(vx,vy,vz)||1;vx/=vl;vy/=vl;vz/=vl;
  const wx=vy*dz-vz*dy,wy=vz*dx-vx*dz,wz=vx*dy-vy*dx,mm=MB();
  mm.cyl(0,0,0,r1,r2,len,seg||7,col,true);
  for(let i=0;i<mm.v.length;i+=VFLOATS){
    const px=mm.v[i],py=mm.v[i+1],pz=mm.v[i+2],nx=mm.v[i+3],ny=mm.v[i+4],nz=mm.v[i+5];
    mm.v[i]=a[0]+vx*px+dx*py+wx*pz;mm.v[i+1]=a[1]+vy*px+dy*py+wy*pz;mm.v[i+2]=a[2]+vz*px+dz*py+wz*pz;
    mm.v[i+3]=vx*nx+dx*ny+wx*nz;mm.v[i+4]=vy*nx+dy*ny+wy*nz;mm.v[i+5]=vz*nx+dz*ny+wz*nz;
  }
  const off=m.n;for(const v of mm.v)m.v.push(v);for(const ix of mm.i)m.i.push(ix+off);m.n+=mm.n;m.m=mm.m;m.tm=mm.tm;return m;
}
function mfMassWeakOrgan(m,x,y,z,r){
  m.sphere(x,y,z,r,8,MF_WEAK,.82,false);m.ring(x,y+r*.78,z,r*1.05,r*1.36,12,MF_WEAK_H);
}
function mfMassHook(m,a,b,c,d,r){
  mfMassLimb(m,a,b,r,r*.72,MF_TENDON,7);mfMassLimb(m,b,c,r*.73,r*.40,MF_CHITIN_H,7);
  mfMassLimb(m,c,d,r*.42,.045,MF_BONE,6);m.sphere(b[0],b[1],b[2],r*.84,7,MF_CHITIN,.62,false);
}

function mfMassGroundModel(){
  const m=MB();
  /* Unequal wet belly, armored thorax and shielded head break the old capsule
     silhouette before the smaller anatomy is even visible. */
  m.sphere(-3.8,3.4,0,7.8,13,MF_FLESH,.52,false);
  m.sphere(-8.5,4.0,-.7,5.8,11,MF_CHITIN,.66,false);
  m.sphere(.8,4.5,.5,6.5,12,MF_CHITIN,.58,false);
  m.sphere(7.9,4.1,-.3,4.7,11,MF_CHITIN_H,.64,false);
  /* Layered shell scutes leave wet seams instead of coating the animal in one
     noisy material. Their alternating offset keeps the top outline irregular. */
  for(let k=0;k<5;k++){
    const x=-8.0+k*3.25,z=(k&1)?.85:-.75,r=3.15-k*.12;
    m.sphere(x,7.0+(k%3)*.24,z,r,8,k&1?MF_CHITIN_H:MF_CHITIN,.30,false);
    for(const sd of [-1,1])m.sphere(x,5.3,sd*(3.9+(k%2)*.35),1.45,7,k&1?MF_FLESH_H:MF_CHITIN_H,.55,false);
  }
  /* Open dorsal birthing cavity: black lumen, fleshy lip, hooked teeth and
     visible stored biomass remain legible at production-preview zoom. */
  m.tube(-4.4,6.8,0,4.8,2.35,2.0,13,MF_BORE);m.ring(-4.4,8.82,0,2.25,4.85,14,MF_FLESH_H);
  for(let k=0;k<7;k++){
    const a=k/7*TAU,r=3.7+(k&1)*.25;
    mfMassLimb(m,[-4.4+Math.cos(a)*r,8.6,Math.sin(a)*r],[-4.4+Math.cos(a)*r*1.13,10.0,Math.sin(a)*r*1.13],.34,.035,MF_BONE,6);
  }
  for(const p of [[-5.4,8.2,-1.1],[-3.5,8.4,.8],[-4.8,8.15,1.5]])m.sphere(p[0],p[1],p[2],.82,7,MF_SAC,.78,false);
  /* Folded asymmetric lift sacs telegraph the later air state. Bright cores
     are exposed weak organs rather than decorative team lights. */
  const sacs=[[-1.1,6.0,-5.1,2.65],[1.0,6.5,5.7,3.45],[-6.8,5.7,5.0,2.25]];
  for(const S of sacs){m.sphere(S[0],S[1],S[2],S[3],9,MF_SAC,.72,false);m.ring(S[0],S[1]+S[3]*.72,S[2],S[3]*.65,S[3]*.88,11,MF_CHITIN_H);}
  mfMassWeakOrgan(m,1.0,8.0,5.7,1.02);mfMassWeakOrgan(m,-1.1,7.55,-5.1,.82);
  for(const sd of [-1,1]){
    /* Five load-bearing hooks per side create a low predatory stance. */
    for(let k=0;k<5;k++){
      const x=-7.0+k*3.35,a=[x,3.3,sd*4.5],b=[x-.7,1.4,sd*(8.0+(k&1)*.8)],c=[x+1.1,.35,sd*(11.0+k*.38)],d=[x+2.35,1.0,sd*(9.8+k*.32)];
      mfMassHook(m,a,b,c,d,.82-k*.035);
    }
    /* Forward mandibles establish +X and curl back toward the mouth. */
    mfMassHook(m,[8.2,4.0,sd*2.5],[11.2,3.0,sd*4.1],[13.5,2.0,sd*2.8],[12.0,2.7,sd*.85],.72);
  }
  tubeX(m,10.0,3.8,0,2.35,1.9,.9,10,MF_BORE);
  mfMassWeakOrgan(m,8.9,6.5,-2.15,.82);mfMassWeakOrgan(m,9.5,6.25,1.75,.64);
  for(let k=0;k<7;k++){
    const x=-9+k*2.25,h=2.6+(k%3)*.65;mfMassLimb(m,[x,7.5,(k&1)?.45:-.45],[x-.5,7.5+h,(k&1)?1.0:-1.0],.38,.025,MF_BONE,6);
  }
  return {hull:m.build(),tur:null,s:1.08};
}
function mfMassAirModel(){
  const m=MB();
  /* Ascension rotates the siege pod upright. A pendant muscular body carries
     the payload below a swollen neural lift organ; there are no machine-like
     wings or aircraft surfaces. */
  m.sphere(-1.0,8.0,0,5.7,11,MF_FLESH,.92,false);
  m.sphere(-1.8,12.2,.3,6.0,12,MF_CHITIN,.72,false);
  m.sphere(-2.0,18.3,.7,7.2,13,MF_SAC,1.02,false);
  m.sphere(-4.2,17.0,-1.0,6.4,12,MF_CHITIN,.60,false);
  m.sphere(1.4,17.8,1.0,5.3,11,MF_CHITIN_H,.58,false);
  /* A radial armored cranial halo protects—but does not completely cover—the
     translucent lift sac. Horns point away from the weak core. */
  for(let k=0;k<10;k++){
    const a=k/10*TAU+.16,ca=Math.cos(a),sa=Math.sin(a),r=7.2+(k%3)*.35;
    m.sphere(-2+ca*r,18.2+(k&1)*.35,.7+sa*r,2.25,8,k&1?MF_CHITIN_H:MF_CHITIN,.46,false);
    mfMassLimb(m,[-2+ca*r,18.5,.7+sa*r],[-2+ca*(r+5.0),21.0+(k%2)*1.1,.7+sa*(r+5.0)],.54,.035,k%3?MF_BONE:MF_CHITIN_H,6);
  }
  /* The large exposed organ is the visually honest anti-air target. */
  m.sphere(1.9,20.0,-.5,3.55,10,MF_SAC,.94,false);mfMassWeakOrgan(m,2.8,21.2,-.5,2.15);
  /* Raised above the horn plane so command-view cameras cannot hide the
     anti-air weak organ behind the cranial shell. */
  mfMassWeakOrgan(m,-1.0,23.7,.6,3.15);m.sphere(-.7,24.8,.4,2.35,9,MF_WEAK_H,1,false);
  m.ring(-2.0,24.1,.7,3.2,5.25,15,MF_WEAK_H);
  /* Birthing throat faces forward beneath the cranial shell. */
  tubeX(m,2.0,12.0,0,3.8,3.0,1.45,11,MF_BORE);ringX(m,5.55,12.0,0,1.5,3.05,12,MF_FLESH_H);
  for(const sd of [-1,1]){
    mfMassWeakOrgan(m,2.2,15.0,sd*3.15,sd>0?.82:.62);
    mfMassHook(m,[2.5,13.0,sd*2.6],[6.0,10.0,sd*4.3],[8.6,6.0,sd*3.3],[6.5,7.0,sd*.9],.72);
  }
  /* Six secondary tendrils hang from the lower body; three long primaries form
     the recognizable hooked cephalopod silhouette and remain separated. */
  for(let k=0;k<6;k++){
    const a=k/6*TAU+.35,ca=Math.cos(a),sa=Math.sin(a),start=[-1+ca*3.8,9.0,sa*3.8];
    mfMassHook(m,start,[-1+ca*6.0,5.7,sa*6.2],[-1+ca*8.2,1.0,sa*8.6],[-1+ca*6.1,2.0,sa*6.4],.68-k*.025);
  }
  for(const sd of [-1,0,1]){
    const z=sd*3.4;mfMassLimb(m,[1.3,10.0,z],[5.0,5.7,z+sd*4.0],1.0,.70,MF_TENDON,8);
    mfMassLimb(m,[5.0,5.7,z+sd*4.0],[11.5,.4,z+sd*8.0],.72,.35,MF_CHITIN_H,8);
    mfMassLimb(m,[11.5,.4,z+sd*8.0],[8.2,1.8,z+sd*5.6],.36,.045,MF_BONE,6);
  }
  return {hull:m.build(),tur:null,s:1.02,air:1};
}
UNIT_MDL[MF_UT_MASSFLESH]=mfMassGroundModel;
UNIT_MDL[MF_UT_MASSFLESH_AIR]=mfMassAirModel;
/* Massflesh is not a universal transport skin. Register both states only in
   the Brood kit so no technological faction can resolve the organism through
   the shared UNIT_MDL table. */
FAC_KIT.horde[MF_UT_MASSFLESH]=mfMassGroundModel;
FAC_KIT.horde[MF_UT_MASSFLESH_AIR]=mfMassAirModel;

const mfMassHolds=[];
let mfMassBoardOrders=[],mfMassBirthAim=null,mfMassAlertUnit=-1,mfMassAiNext=135,mfMassAiLastT=0;
function mfMassIsLive(i,gen){return mfTransportIsLive(i,gen,'massflesh');}
function mfMassHold(i,create){
  if(i<0)return null;let H=mfMassHolds[i];
  if(H&&H.gen!==ugen[i])H=mfMassHolds[i]=null;
  if(!H&&create&&ualive[i]&&mfTransportKindByType(utype[i])==='massflesh')
    H=mfMassHolds[i]={gen:ugen[i],capacity:MF_MASS_CAPACITY,used:0,cargo:[],flight:0,mission:null,fx:0,attack:0,aiT:2};
  return H;
}
function mfMassSlotCost(i,team){
  if(i<0||!ualive[i]||uteam[i]!==team)return 0;
  const T=TYPES[utype[i]],cat=T.cat||'veh';
  if(T.massflesh||T.air||T.naval||cat==='art'||cat==='exp'||cat==='hero'||(ARM[utype[i]]||0)>1)return 0;
  if(!unitIsBrood(i))return 0;
  return T.size<=17?1:2;
}
function mfMassReserved(i,gen){let n=0;for(const O of mfMassBoardOrders)if(O.mass===i&&O.massGen===gen)n+=O.slots;return n;}
function mfMassBoardPoint(O,rank){
  const a=uang[O.mass]-Math.PI/2,side=(rank&1)?1:-1,row=Math.floor(rank/2);
  return {x:ux[O.mass]-Math.cos(a)*(20+row*5)-Math.sin(a)*side*(8+row),
          y:uy[O.mass]-Math.sin(a)*(20+row*5)+Math.cos(a)*side*(8+row)};
}
function mfMassQueueBoard(mass,entries,playerOrder){
  const H=mfMassHold(mass,true);if(!H||utype[mass]!==MF_UT_MASSFLESH)return 0;
  let free=H.capacity-H.used-mfMassReserved(mass,H.gen),n=0;
  for(const i of entries){
    const slots=mfMassSlotCost(i,uteam[mass]);
    if(!slots||slots>free||mfMassBoardOrders.some(O=>O.unit===i&&O.unitGen===ugen[i]))continue;
    mfMassBoardOrders.push({unit:i,unitGen:ugen[i],mass,massGen:H.gen,slots});free-=slots;n++;
  }
  if(n){
    utgt[mass]=-1;ustate[mass]=0;utx[mass]=ux[mass];uty[mass]=uy[mass];uhold[mass]=1;
    if(playerOrder){clearSel();usel[mass]=1;updateSelInfo();toast('♒ '+n+' BROOD MERGING INTO BIOMASS');uiCommandAck('move',n,ux[mass],uy[mass]);}
  }
  return n;
}
function mfMassIssueBoard(mass){
  const candidates=[],rejected=[];
  for(let i=0;i<unitHigh;i++)if(ualive[i]&&usel[i]&&i!==mass)(mfMassSlotCost(i,uteam[mass])?candidates:rejected).push(i);
  const n=mfMassQueueBoard(mass,candidates,true);
  if(!n){toast(rejected.length?'MASSFLESH REJECTS HEAVY OR NON-BROOD UNITS':'MASSFLESH BIOMASS FULL');sfx('reject');}
  return n>0;
}
function mfMassAlert(i,state){
  if(i<0||!ualive[i]||uteam[i]===0)return;
  mfMassAlertUnit=i;const el=$('mfMassAlert');if(!el)return;
  el.style.display='block';el.innerHTML='<b>⚠ MASSFLESH '+state+'</b><span>BREAKTHROUGH ORGANISM · TAP TO TRACK</span>';
}
function mfMassBeginFlight(i){
  const H=mfMassHold(i,false);if(!H||!H.cargo.length||utype[i]!==MF_UT_MASSFLESH)return false;
  utype[i]=MF_UT_MASSFLESH_AIR;H.flight=MF_MASS_FLIGHT;H.mission=null;H.attack=.25;uhold[i]=0;ustate[i]=0;
  addParticle(3,ux[i],uy[i],0,0,1.0,100,185,92,255);
  for(let k=0;k<10;k++)addParticle(4,ux[i]+rr(-12,12),uy[i]+rr(-12,12),rr(-18,18),rr(-18,18),.8,8,135,236,72);
  sfx('cre_attack',ux[i],uy[i],1.6);
  if(uteam[i]!==0){mfMassAlert(i,'AIRBORNE');sfx('alarm',ux[i],uy[i],1.15);if(typeof radioAck==='function')radioAck('attack',1,ux[i],uy[i]);}
  else toast('♒ MASSFLESH ASCENDED · '+Math.ceil(H.flight)+'s FLIGHT WINDOW');
  updateSelInfo();return true;
}
function mfMassBehindPlayerTarget(i){
  let tx=heroIdx>=0&&ualive[heroIdx]?ux[heroIdx]:MAP*.25,ty=heroIdx>=0&&ualive[heroIdx]?uy[heroIdx]:MAP*.25;
  for(const B of blds)if(B.alive&&B.team===0&&(B.type==='hq'||B.type==='fac')){tx=B.x;ty=B.y;if(B.type==='hq')break;}
  let dx=tx-ux[i],dy=ty-uy[i],d=Math.hypot(dx,dy)||1;dx/=d;dy/=d;
  const L=findLand(clamp(tx+dx*150,24,MAP-24),clamp(ty+dy*150,24,MAP-24));return {x:L[0],y:L[1]};
}
function mfMassCommandBirth(i,x,y){
  const H=mfMassHold(i,false);if(!H||utype[i]!==MF_UT_MASSFLESH_AIR||!H.cargo.length)return false;
  x=clamp(x,24,MAP-24);y=clamp(y,24,MAP-24);H.mission={x,y,slots:mfAirliftFormation(H.cargo,x,y)};
  utgt[i]=-1;ustate[i]=1;utx[i]=x;uty[i]=y;mfMassBirthAim=null;if(typeof aiming!=='undefined'&&aiming===10)aiming=-1;mfMassUpdateUI();
  addParticle(3,x,y,0,0,.8,58,168,92,255);
  if(uteam[i]===0){toast('♒ BIRTH SITE MARKED · '+H.cargo.length+' ORGANISMS');uiCommandAck('deploy',H.cargo.length,x,y);}
  return true;
}
function mfMassBirthNow(i,H){
  const target=H.mission||{x:ux[i],y:uy[i],slots:mfAirliftFormation(H.cargo,ux[i],uy[i])},remaining=[],born=[];
  for(let k=0;k<H.cargo.length;k++){
    const P=H.cargo[k],S=target.slots[k]||target;
    mfAirliftPopHold(P,false);
    const u=spawnUnit(P.type,P.team,S.x,S.y,P.cmd);
    if(u<0){mfAirliftPopHold(P,true);remaining.push(P);continue;}
    uhp[u]=clamp(uhpm[u]*P.hpRatio,1,uhpm[u]);uvet[u]=P.veteran;ukills[u]=P.kills;ucool[u]=P.cool;
    if(unitModes(P.type).indexOf(P.mode)>=0)umode[u]=P.mode;
    if(P.team===1){const q=mfMassBehindPlayerTarget(i);ustate[u]=2;utx[u]=q.x;uty[u]=q.y;}
    addBeam(ux[i],uy[i],ux[u],uy[u],4.5,168,88,255,.36,'tractor');
    addParticle(6,ux[u],uy[u],0,0,.55,TYPES[P.type].size*1.8,150,242,82);born.push(u);
  }
  H.cargo=remaining;H.used=remaining.reduce((n,P)=>n+P.slots,0);H.mission=null;H.flight=0;
  utype[i]=MF_UT_MASSFLESH;ustate[i]=0;utx[i]=ux[i];uty[i]=uy[i];uhold[i]=0;
  addParticle(3,ux[i],uy[i],0,0,.9,86,185,92,255);sfx('deploy',ux[i],uy[i],1.25);sfx('cre_attack',ux[i],uy[i],1.1);
  if(uteam[i]===0)toast('♒ '+born.length+' ORGANISMS BORN INTO FORMATION');
  updateSelInfo();return born;
}
function mfMassTentacleAttack(i,H){
  let target=-1,best=145*145,kind='unit';
  forUnitsIn(ux[i],uy[i],145,j=>{
    if(uteam[j]===uteam[i]||TYPES[utype[j]].air)return;
    const d=dist2(ux[i],uy[i],ux[j],uy[j]),light=(ARM[utype[j]]||0)===0;
    const score=d*(light?.55:1.45);if(score<best){best=score;target=j;kind='unit';}
  });
  const b=findEnemyBld(ux[i],uy[i],uteam[i],145);
  if(b>=0){const d=dist2(ux[i],uy[i],blds[b].x,blds[b].y)*.42;if(d<best){best=d;target=b;kind='building';}}
  if(target<0)return null;
  const x=kind==='unit'?ux[target]:blds[target].x,y=kind==='unit'?uy[target]:blds[target].y;
  let dmg=TYPES[MF_UT_MASSFLESH_AIR].dmg;
  if(kind==='building'){dmg*=1.75;damageBld(target,dmg,uteam[i]);}
  else{dmg*=(ARM[utype[target]]||0)===0?1.45:.52;dealDamage(target,dmg,uteam[i],i);}
  addBeam(ux[i],uy[i],x,y,5.2,176,78,255,.30,'lightning');addBeam(ux[i],uy[i],x,y,2.2,132,242,78,.34,'tractor');
  addParticle(4,x,y,0,0,.42,15,135,238,76);sfx('cre_attack',ux[i],uy[i],1.25);sfx('sonic',x,y,.72);
  H.attack=TYPES[MF_UT_MASSFLESH_AIR].cool;return {kind,target,dmg};
}
function mfMassPreTick(dt){
  for(let k=mfMassBoardOrders.length-1;k>=0;k--){
    const O=mfMassBoardOrders[k];
    if(!mfMassIsLive(O.mass,O.massGen)||utype[O.mass]!==MF_UT_MASSFLESH||!ualive[O.unit]||ugen[O.unit]!==O.unitGen){mfMassBoardOrders.splice(k,1);continue;}
    const rank=mfMassBoardOrders.filter(Q=>Q.mass===O.mass&&Q.massGen===O.massGen).indexOf(O),P=mfMassBoardPoint(O,Math.max(0,rank));
    utgt[O.unit]=-1;utgtg[O.unit]=-1;ustate[O.unit]=1;utx[O.unit]=P.x;uty[O.unit]=P.y;uhold[O.unit]=0;
  }
  for(let i=0;i<mfMassHolds.length;i++){
    const H=mfMassHolds[i];
    if(!H) continue;
    if(!mfMassIsLive(i,H.gen)){mfAirliftDiscardHold(H);mfMassHolds[i]=null;continue;}
    if(utype[i]!==MF_UT_MASSFLESH_AIR||!H.mission) continue;
    utgt[i]=-1;utgtg[i]=-1;ustate[i]=1;utx[i]=H.mission.x;uty[i]=H.mission.y;uhold[i]=0;
  }
}
function mfMassPostTick(dt){
  for(let k=mfMassBoardOrders.length-1;k>=0;k--){
    const O=mfMassBoardOrders[k];
    if(!mfMassIsLive(O.mass,O.massGen)||!ualive[O.unit]||ugen[O.unit]!==O.unitGen){mfMassBoardOrders.splice(k,1);continue;}
    const reach=TYPES[utype[O.unit]].r+TYPES[MF_UT_MASSFLESH].r+9;
    if(dist2(ux[O.unit],uy[O.unit],ux[O.mass],uy[O.mass])>reach*reach)continue;
    const H=mfMassHold(O.mass,true),P=mfAirliftSerialize(O.unit,O.slots),x=ux[O.unit],y=uy[O.unit];
    P.biomass=Math.round(uhp[O.unit]+TYPES[P.type].size*4);H.cargo.push(P);H.used+=O.slots;
    mfAirliftPopHold(P,true);
    for(let q=0;q<3;q++)addBeam(x+rr(-3,3),y+rr(-3,3),ux[O.mass],uy[O.mass],2.8,145,235,76,.32,'tractor');
    addParticle(4,x,y,0,0,.55,TYPES[P.type].size*1.7,153,238,78);killUnit(O.unit,true);mfMassBoardOrders.splice(k,1);
    sfx('cre_attack',ux[O.mass],uy[O.mass],.68);
  }
  for(let i=0;i<mfMassHolds.length;i++){
    const H=mfMassHolds[i];if(!H)continue;
    if(!mfMassIsLive(i,H.gen)){mfMassHolds[i]=null;continue;}
    H.aiT-=dt;
    if(utype[i]===MF_UT_MASSFLESH){
      if(uteam[i]===1&&typeof AI!=='undefined'&&AI.fac==='horde'&&H.aiT<=0){
        H.aiT=2.2;
        if(H.used<6){const near=[];forUnitsIn(ux[i],uy[i],260,j=>{if(j!==i&&mfMassSlotCost(j,uteam[i]))near.push(j);});mfMassQueueBoard(i,near.slice(0,6),false);}
        if(H.used>=4&&!mfMassReserved(i,H.gen)){
          mfMassBeginFlight(i);const D=mfMassBehindPlayerTarget(i);mfMassCommandBirth(i,D.x,D.y);
        }
      }
      continue;
    }
    H.flight=Math.max(0,H.flight-dt);H.attack=Math.max(0,H.attack-dt);
    if(H.attack<=0)mfMassTentacleAttack(i,H);
    if(uteam[i]!==0)mfMassAlert(i,'AIRBORNE · '+Math.ceil(H.flight)+'s');
    /* Flight is a temporary breakthrough state, not a permanent aircraft mode.
       Birth at the current position when the membrane timer ruptures even if a
       distant order is still pending.  This keeps anti-air counterplay finite. */
    if(H.flight<=0){
      H.mission={x:ux[i],y:uy[i],slots:mfAirliftFormation(H.cargo,ux[i],uy[i])};mfMassBirthNow(i,H);
    }else if(H.mission){
      H.fx-=dt;if(H.fx<=0){H.fx=.17;for(const S of H.mission.slots)addParticle(3,S.x,S.y,0,0,.24,20,168,92,255);}
      if(dist2(ux[i],uy[i],H.mission.x,H.mission.y)<24*24)mfMassBirthNow(i,H);
    }
  }
  mfMassRefreshAlert();mfMassUpdateUI();
}

const mfMassSpawnBase=spawnUnit;
spawnUnit=function(type,team,x,y,cmdSlot){
  const i=mfMassSpawnBase(type,team,x,y,cmdSlot);
  if(i>=0){mfMassHolds[i]=null;if(type===MF_UT_MASSFLESH||type===MF_UT_MASSFLESH_AIR)mfMassHold(i,true);}
  return i;
};
const mfMassKillBase=killUnit;
killUnit=function(i,silent){
  if(ualive[i]&&mfTransportKindByType(utype[i])==='massflesh'){
    const H=mfMassHold(i,false),lost=H?H.cargo.length:0;
    for(const O of mfMassBoardOrders)if(O.mass===i&&O.massGen===ugen[i]&&ualive[O.unit]&&ugen[O.unit]===O.unitGen){ustate[O.unit]=0;utx[O.unit]=ux[O.unit];uty[O.unit]=uy[O.unit];}
    mfMassBoardOrders=mfMassBoardOrders.filter(O=>!(O.mass===i&&O.massGen===ugen[i]));
    if(H){for(const P of H.cargo)mfAirliftPopHold(P,false);H.cargo.length=0;H.used=0;H.mission=null;mfMassHolds[i]=null;}
    if(lost&&!silent){toast('MASSFLESH SLAIN · '+lost+' STORED ORGANISMS LOST');addParticle(4,ux[i],uy[i],0,0,1.0,80,150,238,72);}
    if(mfMassAlertUnit===i)mfMassAlertUnit=-1;
  }
  return mfMassKillBase(i,silent);
};
const mfMassUnitTickBase=unitTick;
unitTick=function(dt){mfMassPreTick(dt);mfMassUnitTickBase(dt);mfMassPostTick(dt);};

const mfMassOnTapBase=onTap;
onTap=function(sx,sy){
  const W=s2w(sx,sy),wx=W[0],wy=W[1];
  if(mfMassBirthAim){mfMassConfirmAim(wx,wy);return;}
  const pk=pickUnit(wx,wy);
  if(pk.own>=0&&utype[pk.own]===MF_UT_MASSFLESH&&selCount()>0&&!usel[pk.own]){
    if(mfMassIssueBoard(pk.own))return;
    for(let i=0;i<unitHigh;i++)if(ualive[i]&&usel[i]&&i!==pk.own)return;
  }
  return mfMassOnTapBase(sx,sy);
};

const mfMassPurposeBase=intelUnitPurpose;
intelUnitPurpose=function(T){
  if(T&&T.massflesh)return T.massfleshAir
    ?'Timed winged breakthrough state. Tentacles rend structures and light units; dedicated anti-air brings it down.'
    :'Living heavy carrier. Merge a light Brood into biomass, then ascend and birth it behind the defensive line.';
  return mfMassPurposeBase(T);
};
const mfMassShowTypeBase=showUnitTypeCard;
showUnitTypeCard=function(tIdx,pinned,kit){
  mfMassShowTypeBase(tIdx,pinned,kit);const T=TYPES[tIdx];if(!T||!T.massflesh)return;
  const row=$('unitCard')&&$('unitCard').querySelector('.ucChips');
  if(row)row.insertAdjacentHTML('beforeend',T.massfleshAir
    ?intelChip('✈','AIRBORNE')+intelChip('⌖','COUNTER: ANTI-AIR','bad')
    :intelChip('⬣','GROUND HEAVY')+intelChip('⌖','COUNTER: ANTI-TANK','bad')+'<span class="ucChip mfMassCapacity"><i>◉</i>'+MF_MASS_CAPACITY+' BIOMASS</span>');
  const card=$('unitCard'),warn=card&&card.querySelector('.ucCounter.caution'),ammo=card&&card.querySelector('.ucAmmo');
  if(T.massfleshAir){if(warn)warn.remove();if(ammo)ammo.textContent='TENTACLES · +75% STRUCTURES · +45% LIGHT · WEAK VS HEAVY';}
};
function mfMassSvgIcon(size){
  const w=document.createElement('div');w.className='mfMassIcon';w.style.width=size+'px';w.style.height=size+'px';
  w.innerHTML='<svg viewBox="0 0 96 96" aria-hidden="true"><path fill="#27143a" stroke="#bd76ff" stroke-width="3" d="M13 52c4-22 18-37 35-37s31 15 35 37c-8 17-19 27-35 28-16-1-27-11-35-28z"/><path fill="#6c933e" d="M22 51c9-9 13-22 26-25 13 3 17 16 26 25-9 9-13 18-26 19-13-1-17-10-26-19z"/><circle cx="48" cy="45" r="11" fill="#c06cff"/><path stroke="#9eea58" stroke-width="5" stroke-linecap="round" d="M26 65L13 82m28-12-5 17m34-22 13 17M55 70l5 17"/></svg>';
  return w;
}
const mfMassIconBase=unitIconEl;
unitIconEl=function(tIdx,size,kit){return mfMassIconBase(tIdx,size,kit);};
function mfMassRenderCard(){
  const g=$('prodGrid'),T=TYPES[MF_UT_MASSFLESH];g.innerHTML='';renderMenuRoleBrief('unit','biomass',[MF_UT_MASSFLESH]);
  const d=document.createElement('div');d.className='bcard mfMassCard';
  d.innerHTML='<div class="nm">'+T.name+'</div><div class="cost">'+T.cm+'m <span>'+T.ce+'e</span></div>'
    +'<div class="mfMassBadges"><b>GROUND HEAVY</b><b>ANTI-TANK COUNTERS</b><b>'+T.transportCap+' BIOMASS</b></div>'
    +'<div class="cardPurpose">MERGE · ASCEND · BIRTH BEHIND DEFENSES</div>';
  d.setAttribute('role','button');d.setAttribute('aria-label','Grow Massflesh Brood breakthrough carrier');
  const icw=document.createElement('div');icw.className='icw';icw.appendChild(unitIconEl(MF_UT_MASSFLESH,48));d.insertBefore(icw,d.firstChild);
  mfAirliftBindReleaseCard(d,ev=>{ev.stopPropagation();const B=openBld>=0?blds[openBld]:null;if(B&&bldFactionKey(B)==='horde'&&B.queue.length<30){B.queue.push(MF_UT_MASSFLESH);sfx('ui');renderQueue();}});
  addCardIntelButton(d,'unit',MF_UT_MASSFLESH);g.appendChild(d);
}
const mfMassRenderProdBase=renderProdMenu;
renderProdMenu=function(){
  const B=openBld>=0?blds[openBld]:null,brood=!!(B&&B.type==='fac'&&bldFactionKey(B)==='horde'),wants=brood&&prodTab==='biomass';
  mfMassRenderProdBase();if(!brood)return;
  const tr=$('prodTabs');tr.style.display='flex';const b=document.createElement('button');b.className='tabBtn'+(wants?' on':'');
  b.innerHTML='<span class="tEm">♒</span>MASSFLESH';b.setAttribute('aria-label','Brood living transport production');
  if(wants)for(const x of tr.querySelectorAll('.tabBtn'))x.classList.remove('on');
  mfBindNativePress(b,ev=>{ev.stopPropagation();prodTab='biomass';sfx('ui');renderProdMenu();});
  /* A faction-defining organism must not be hidden beyond the phone-width tab
     scroller.  Keep it first for Brood factories while leaving Terran clean. */
  tr.insertBefore(b,tr.firstChild);
  if(wants){prodTab='biomass';mfMassRenderCard();}
};
function mfMassConfirmAim(wx,wy){
  const A=mfMassBirthAim;mfMassBirthAim=null;
  if(typeof aiming!=='undefined'&&aiming===10)aiming=-1;
  if(A&&mfMassIsLive(A.i,A.gen))mfMassCommandBirth(A.i,wx,wy);
  mfMassUpdateUI();
}
function mfMassArmSelected(){
  const i=mfMassSelected();if(i<0)return false;
  if(utype[i]===MF_UT_MASSFLESH)return mfMassBeginFlight(i);
  mfMassBirthAim={i,gen:ugen[i]};
  if(typeof aiming!=='undefined')aiming=10;
  toast('♒ TAP BEHIND THE DEFENSIVE LINE TO BIRTH THE BROOD');
  mfMassUpdateUI();return true;
}
function mfMassSelected(){let found=-1;for(let i=0;i<unitHigh;i++)if(ualive[i]&&usel[i]&&mfTransportKindByType(utype[i])==='massflesh'){if(found>=0)return -1;found=i;}return found;}
function mfMassUpdateUI(){
  const b=$('mfMassActionBtn');if(!b)return;const i=mfMassSelected(),H=i>=0?mfMassHold(i,true):null,air=i>=0&&utype[i]===MF_UT_MASSFLESH_AIR;
  b.style.display=i>=0?'flex':'none';b.disabled=!H||!H.cargo.length;
  const label=b.querySelector('.lbl');if(label)label.textContent=air?'BIRTH '+Math.ceil(H.flight)+'s':'TAKE FLIGHT';
  b.classList.toggle('on',!!(mfMassBirthAim&&i===mfMassBirthAim.i));
  b.setAttribute('aria-label',air?'Set Massflesh birth site; airborne counter is anti-air':'Take flight; landed Massflesh counter is anti-tank');
}
const mfMassUpdateSelBase=updateSelInfo;
updateSelInfo=function(){
  mfMassUpdateSelBase();const i=mfMassSelected(),H=i>=0?mfMassHold(i,true):null;
  if(i<0)mfMassBirthAim=null;
  if(H){const line=$('selInfo')&&$('selInfo').querySelector('.selIntelCopy span'),air=utype[i]===MF_UT_MASSFLESH_AIR;
    if(line)line.textContent+=' · '+(air?'AIRBORNE / ANTI-AIR':'GROUND HEAVY / ANTI-TANK')+' · BIOMASS '+H.used+'/'+H.capacity;
    const chip=$('unitCard')&&$('unitCard').querySelector('.mfMassCapacity');if(chip)chip.innerHTML='<i>◉</i>'+H.used+' / '+H.capacity+' BIOMASS';
  }
  mfMassUpdateUI();
};
function mfMassRefreshAlert(){
  const el=$('mfMassAlert');if(!el)return;let best=-1,state='APPROACHING';
  for(let i=0;i<unitHigh;i++)if(ualive[i]&&uteam[i]!==0&&mfTransportKindByType(utype[i])==='massflesh'){
    if(utype[i]===MF_UT_MASSFLESH_AIR){best=i;state='AIRBORNE';break;}
    for(const B of blds)if(B.alive&&B.team===0&&dist2(ux[i],uy[i],B.x,B.y)<620*620){best=i;break;}
  }
  if(best>=0)mfMassAlert(best,state);else{el.style.display='none';mfMassAlertUnit=-1;}
}
function mfMassInitUI(){
  const row=$('tacRow');if(!row||$('mfMassActionBtn'))return;
  const b=document.createElement('button');b.type='button';b.id='mfMassActionBtn';b.className='cbtn mfMassAction';b.style.display='none';
  b.innerHTML='<span class="em">♒</span><span class="lbl">TAKE FLIGHT</span>';
  mfBindNativePress(b,ev=>{ev.preventDefault();ev.stopPropagation();mfMassArmSelected();});
  row.insertBefore(b,$('clearBtn'));
  const a=document.createElement('button');a.type='button';a.id='mfMassAlert';a.style.display='none';a.setAttribute('aria-label','Track inbound Massflesh breakthrough carrier');
  mfBindNativePress(a,()=>{const i=mfMassAlertUnit;if(i>=0&&ualive[i]){cam.x=ux[i];cam.y=uy[i];camFollow=i;clampCam();camUpdateMatrices();sfx('ui');}});document.body.appendChild(a);
  const st=document.createElement('style');st.textContent='\n'
    +'.mfMassIcon{filter:drop-shadow(0 0 8px rgba(184,102,255,.5))}.mfMassIcon svg{width:100%;height:100%;display:block}'
    +'.mfMassCard{width:156px!important;min-height:176px}.mfMassBadges{display:flex;flex-wrap:wrap;justify-content:center;gap:3px;margin:3px 0}.mfMassBadges b{padding:3px 5px;border:1px solid rgba(185,112,255,.48);border-radius:4px;background:rgba(72,28,92,.42);color:#d9aaff;font:700 7px/1 var(--fT)}'
    +'.mfMassAction{min-width:58px!important;min-height:44px!important}.mfMassAction:disabled{opacity:.42}'
    +'#mfMassAlert{position:fixed;left:50%;transform:translateX(-50%);top:calc(var(--sat) + 158px);z-index:60;min-width:260px;min-height:50px;padding:8px 14px;border:1px solid #c274ff;border-left:5px solid #aaf05e;border-radius:10px;background:linear-gradient(180deg,rgba(55,18,74,.96),rgba(21,10,35,.97));color:#f0d8ff;box-shadow:0 0 22px rgba(182,94,255,.34);font-family:var(--fT)}#mfMassAlert b{display:block;font-size:12px;letter-spacing:.08em}#mfMassAlert span{display:block;margin-top:3px;font-size:9px;color:#c9f88f;letter-spacing:.06em}body.menuMode #mfMassAlert{display:none!important}';
  document.head.appendChild(st);
}
mfMassInitUI();

/* Seed one genuine breakthrough organism into a developed Brood AI economy.
   The normal AI continues to own every other production choice. */
const mfMassAiTickBase=aiTick;
aiTick=function(dt){
  if(stats.t<mfMassAiLastT){mfMassAiNext=135;}mfMassAiLastT=stats.t;
  if(typeof AI!=='undefined'&&AI.fac==='horde'&&stats.t>=mfMassAiNext){
    const live=(()=>{let n=0;for(let i=0;i<unitHigh;i++)if(ualive[i]&&uteam[i]===1&&mfTransportKindByType(utype[i])==='massflesh')n++;return n;})();
    const B=blds.find(B=>B.alive&&B.team===1&&B.type==='fac'&&B.tier>=2&&B.prog>=1&&B.queue.length<3);
    if(!live&&B){B.queue.unshift(MF_UT_MASSFLESH);mfMassAiNext=stats.t+190;}else mfMassAiNext=stats.t+12;
  }
  return mfMassAiTickBase(dt);
};

/* Atlas AI uses the same takeover as Massflesh. Keep it here so ai.js can
   stay the other agent's file: one extra airfield queue and board/drop orders. */
let mfAirliftAiNext=160,mfAirliftAiLastT=0;
function mfAirliftAiTick(dt){
  if(typeof AI==='undefined'||!AI||AI.fac==='horde') return;
  if(stats.t<mfAirliftAiLastT) mfAirliftAiNext=160;
  mfAirliftAiLastT=stats.t;
  if(typeof FAC_KIT!=='undefined'&&FAC_KIT[AI.fac]&&typeof FAC_KIT[AI.fac][MF_UT_AIRLIFT]!=='function') return;
  let live=0;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&uteam[i]===1&&utype[i]===MF_UT_AIRLIFT){
    live++;
    const H=mfAirliftHold(i,true);
    if(H.aiT==null) H.aiT=2;
    H.aiT-=dt; if(H.aiT>0) continue;
    H.aiT=2.4;
    if(H.used<4){
      const near=[];
      forUnitsIn(ux[i],uy[i],280,j=>{if(j!==i&&uteam[j]===1&&mfAirliftSlotCost(j))near.push(j);});
      mfAirliftQueueBoard(i,near.slice(0,8),false);
    }
    if(H.used>=3&&!H.mission&&!mfAirliftReserved(i,H.gen)){
      const D=typeof heroIdx!=='undefined'&&heroIdx>=0&&ualive[heroIdx]
        ?{x:ux[heroIdx],y:uy[heroIdx]}:{x:MAP*.28,y:MAP*.28};
      const L=findLand(clamp(D.x+rr(-80,80),24,MAP-24),clamp(D.y+rr(-80,80),24,MAP-24));
      mfAirliftCommandUnload(i,L[0],L[1]);
    }
  }
  if(stats.t>=mfAirliftAiNext){
    const B=blds.find(B=>B.alive&&B.team===1&&B.type==='airfield'&&B.prog>=1&&B.queue.length<2);
    if(!live&&B&&typeof populationCanSpawn==='function'&&populationCanSpawn(MF_UT_AIRLIFT,1,B.aiBaseSlot,B.x,B.y)){
      B.queue.unshift(MF_UT_AIRLIFT);mfAirliftAiNext=stats.t+210;
    }else mfAirliftAiNext=stats.t+14;
  }
}
const mfAirliftAiTickBase=aiTick;
aiTick=function(dt){ mfAirliftAiTick(dt); return mfAirliftAiTickBase(dt); };
