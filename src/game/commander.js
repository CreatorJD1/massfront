;
;
/* ============================================================
   RPG — hero commander: XP, levels, upgrades, active abilities
   ============================================================ */
let heroLvl=1, heroXp=0, heroXpNext=100;
let heroDmgMult=1, heroRegen=14;
let commanderHpMult=1;
let abCool=[0,0,0,0,0];                // blast, repair, surge, orbital lance, EMP
const AB_CD=[26,20,30,70,45];
let heroJumpCool=0;
const HERO_JUMP={range:275,cool:28,energy:170};
let heroStuckFor=0,heroRescueAt=0;
/* Index 4 is the craftable EMP: unlocked by a module rather than by rank or by
   the store, so it is the one ability that can be LOST when its module wears
   out. */
/* No universal Blast button. The selected commander grants their authored
   baseline power in applyCommanderChoice(); rank, Armory and modules add the
   others later. This makes the action rail describe the commander rather than
   exposing a generic legacy power menu. */
let abUnlock=[false,false,false,false,false];
let salvageMult=1, bldHpMult=1;
let aiming=-1;                         // ability awaiting a target tap
let pendingLevels=0;
let commanderActiveCool=0;
let commanderWeaponCool=[0,0];
/* Voss −14% is a live multiplier at ASSIGN time, not a rewrite of AB_CD.
   applyMetaPerks rebuilds AB_CD from AB_BASE (capacitor / Chrono Rig), and
   Rapid Systems mutates that table mid-match. Folding Voss into AB_CD missed
   signature, jump and commander weapons, and would double-apply if the table
   was rebuilt. Class doctrine and barrage stay army unlocks, not commander CD. */
let commanderCdMult=1;
function commanderCool(t){return (t||0)*commanderCdMult;}
/* Seat identity. main.js stores AI.bases[].commanderId (and the same field
   on AI.allies) so Large 1v3 is not three copies of the faction default.
   Mesh and weapon overlays key off that id — never TYPES, never playerCommanderId
   for an enemy. applyCommanderChoice stays the player perk stack. */
function commanderIdForUnit(i){
  if(i==null||i<0) return null;
  if(typeof heroIdx!=='undefined'&&i===heroIdx)
    return (typeof playerCommanderId!=='undefined'&&playerCommanderId)||null;
  if(typeof AI==='undefined'||!AI) return null;
  const hit=S=>{
    if(!S||S.commander!==i) return null;
    if(S.commanderGen!=null&&typeof ugen!=='undefined'&&ugen[i]!==S.commanderGen) return null;
    return S.commanderId||null;
  };
  for(const S of AI.bases||[]){ const id=hit(S); if(id) return id; }
  for(const S of AI.allies||[]){ const id=hit(S); if(id) return id; }
  return null;
}
function commanderWeaponProfileFor(id){
  if(typeof COMMANDER_WEAPON_PROFILES==='undefined'||!id) return null;
  return COMMANDER_WEAPON_PROFILES[id]||null;
}
function commanderStampAiSeats(){
  if(typeof AI==='undefined'||!AI) return;
  const stamp=seats=>{
    if(!seats) return;
    for(const S of seats){
      if(!S||!S.commanderId) continue;
      const P=commanderWeaponProfileFor(S.commanderId)||
        (S.fac&&typeof COMMANDER_WEAPON_PROFILES!=='undefined'&&COMMANDER_WEAPON_PROFILES[S.fac])||null;
      if(!P) continue;
      S.primary=P.primary; S.secondary=P.secondary;
      if(S.activeCool==null) S.activeCool=8+Math.random()*6;
      if(!S.weaponCool) S.weaponCool=[0,4+Math.random()*6];
    }
  };
  stamp(AI.bases); stamp(AI.allies);
}
function commanderDefForUnit(i){
  const id=commanderIdForUnit(i);
  if(id&&typeof commanderById==='function'){
    const C=commanderById(id);
    if(C) return C;
  }
  if(typeof heroIdx!=='undefined'&&i===heroIdx&&typeof playerCommanderDef==='function')
    return playerCommanderDef();
  return null;
}
function commanderSeatForUnit(i){
  if(typeof heroIdx!=='undefined'&&i===heroIdx) return {team:0,slot:-1,seat:null};
  if(typeof AI!=='undefined'&&AI){
    const hit=S=>{
      if(!S||S.commander!==i) return null;
      if(S.commanderGen!=null&&ugen[i]!==S.commanderGen) return null;
      return S;
    };
    for(const S of AI.bases||[]){ const s=hit(S); if(s) return {team:uteam[i],slot:s.slot,seat:s}; }
    for(const S of AI.allies||[]){ const s=hit(S); if(s) return {team:uteam[i],slot:s.slot,seat:s}; }
  }
  return {team:uteam[i],slot:typeof uCmd!=='undefined'?uCmd[i]:-1,seat:null};
}

/* ---------- PRIMARY / SECONDARY FIRE -------------------------------------
   Auto-attack keeps the Commander useful when the player is managing an army.
   These two manual weapons provide the missing deliberate shot: primary is a
   quick focus-fire command, secondary spends grid energy on faction-specific
   ordnance. They are selection-bound through hotslots.js, not global menus. */
function commanderWeaponDef(slot){
  try{const C=typeof playerCommanderDef==='function'?playerCommanderDef():null;return C?(slot?C.secondary:C.primary):null;}
  catch(e){return null;}
}
function commanderWeaponButton(slot){
  const id=slot?'abSecondary':'abPrimary';let b=document.getElementById(id);if(b)return b;
  const row=document.getElementById('heroRow');if(!row)return null;
  b=document.createElement('button');b.type='button';b.className='cbtn abtn';b.id=id;
  b.innerHTML='<span class="em"></span><span class="wnm"></span><div class="cdring"></div>';
  const before=document.getElementById('abCommander')||row.firstChild;row.insertBefore(b,before);
  b.addEventListener('pointerdown',e=>{e.stopPropagation();tryCommanderWeapon(slot);});
  return b;
}
function commanderWeaponRefresh(reset){
  if(reset)commanderWeaponCool=[0,0];
  for(let slot=0;slot<2;slot++){
    const W=commanderWeaponDef(slot),b=commanderWeaponButton(slot);if(!b)continue;
    b.style.display=W?'flex':'none';if(!W)continue;
    b.querySelector('.em').textContent=W.em||'•';b.querySelector('.wnm').textContent=(W.nm||(slot?'SECONDARY':'PRIMARY')).toUpperCase();
  }
  commanderWeaponButtonState();
}
function tryCommanderWeapon(slot){
  const W=commanderWeaponDef(slot);if(!W||heroIdx<0||!ualive[heroIdx]){toast('Commander weapon unavailable');return;}
  if(commanderWeaponCool[slot]>0){toast(W.nm+' REARMING — '+Math.ceil(commanderWeaponCool[slot])+'s');return;}
  if((W.energy||0)>resE[0]){toast(W.nm+' NEEDS '+W.energy+' ENERGY');return;}
  if(aiming===7+slot){aiming=-1;toast(W.nm.toUpperCase()+' TARGETING CANCELLED');return;}
  aiming=7+slot;
  toast((W.em||'•')+' '+W.nm.toUpperCase()+' — tap within '+W.range+'m');
  if(typeof radioAck==='function')radioAck('ability',1,ux[heroIdx],uy[heroIdx]);
}
function fireCommanderWeapon(slot,wx,wy){
  const W=commanderWeaponDef(slot);if(!W||heroIdx<0||!ualive[heroIdx]){aiming=-1;return false;}
  const hx=ux[heroIdx],hy=uy[heroIdx],d=Math.hypot(wx-hx,wy-hy);
  if(d>W.range){toast(W.nm.toUpperCase()+' TARGET OUT OF RANGE');return false;}
  if((W.energy||0)>resE[0]){toast(W.nm+' NEEDS '+W.energy+' ENERGY');return false;}
  /* Direct primary rounds need an actual contact. Passing the Commander as
     the projectile target made an otherwise valid shot curl back toward its
     owner; passing no target made zero-splash rounds land harmlessly. Snap the
     reticle to a nearby hostile, while authored splash secondaries may still
     bombard clear ground to deny an approach. */
  const snap=Math.max(22,Math.min(48,(W.aoe||0)*.55));
  let tgt=findEnemy(wx,wy,0,snap),tx=wx,ty=wy;
  if(tgt>=0){tx=ux[tgt];ty=uy[tgt];}
  else {
    const b=findEnemyBld(wx,wy,0,snap+14);
    if(b>=0){tgt=-2-b;tx=blds[b].x;ty=blds[b].y;}
    else if(!slot&&!W.aoe){toast('NO HOSTILE UNDER RETICLE');return false;}
  }
  if(W.energy)pay(0,0,W.energy);
  commanderWeaponCool[slot]=commanderCool(W.cool);aiming=-1;
  const mz=typeof mfUnitMuzzle==='function'?mfUnitMuzzle(heroIdx):[hx,hy];
  const pk=fireProj(W.ptype,0,mz[0],mz[1],tx,ty,W.speed,W.damage*heroDmgMult,W.aoe||0,tgt);
  if(pk>=0){
    pwk[pk]=W.wk||'p';
    if(slot){pCannon[pk]=1;if(W.ptype===2){pBarrage[pk]=1;pArc[pk]=90;}}
    projectileFireFX(pk,mz[0],mz[1],tx-mz[0],ty-mz[1]);
  }
  const C=playerCommanderDef(),col=C&&C.active&&C.active.col||[110,215,255];
  addParticle(0,mz[0],mz[1],0,0,.22,slot?22:13,col[0],col[1],col[2]);
  sfx(W.sfx||'shot',hx,hy,slot?1.45:1.05);shake=Math.max(shake,slot?2.4:.65);
  if(typeof radioAck==='function')radioAck('ability',1,tx,ty);
  return true;
}
function commanderWeaponButtonState(){
  for(let slot=0;slot<2;slot++){
    const W=commanderWeaponDef(slot),b=document.getElementById(slot?'abSecondary':'abPrimary');if(!b||!W)continue;
    const cover=commanderWeaponCool[slot]>0?Math.ceil(commanderWeaponCool[slot]):((W.energy||0)>resE[0]?'E':'');
    const cd=b.querySelector('.cdring');b.classList.toggle('cd',!!cover);b.classList.toggle('on',aiming===7+slot);
    cd.style.display=cover?'flex':'none';cd.textContent=cover;
    const tip=(slot?'Secondary':'Primary')+' fire — '+W.nm+(W.energy?' · '+W.energy+' energy':'')+' · '+Math.round(commanderCool(W.cool))+'s. '+W.ds;
    b.title=tip;b.setAttribute('aria-label',tip);
  }
}

/* ---------- COMMANDER SIGNATURE ACTIVES -----------------------------------
   Baseline powers remain baseline powers. The selected commander adds one
   signature command through its own source button, so identity changes play
   without taking Orbital Blast, Repair Pulse, Surge, Lance or EMP away. */
function commanderActiveDef(){
  try{ const C=typeof playerCommanderDef==='function'?playerCommanderDef():null;return C&&C.active?C.active:null; }
  catch(e){ return null; }
}
function commanderActiveButton(){
  let b=document.getElementById('abCommander');
  if(b) return b;
  const row=document.getElementById('heroRow');if(!row)return null;
  b=document.createElement('button');b.type='button';b.className='cbtn abtn';b.id='abCommander';
  b.innerHTML='<span class="em" id="cmdAbEm">✦</span><span id="cmdAbNm">SIGNATURE</span><div class="cdring"></div>';
  const jump=document.getElementById('abJump');row.insertBefore(b,jump||row.firstChild);
  b.addEventListener('pointerdown',e=>{e.stopPropagation();tryCommanderActive();});
  return b;
}
function commanderActiveRefresh(reset){
  const b=commanderActiveButton(),A=commanderActiveDef();if(!b)return;
  if(reset) commanderActiveCool=0;
  b.style.display=A?'flex':'none';if(!A)return;
  const em=document.getElementById('cmdAbEm'),nm=document.getElementById('cmdAbNm');
  if(em)em.textContent=A.em||'✦';if(nm)nm.textContent=A.nm||'SIGNATURE';
  commanderActiveButtonState();
}
function commanderActiveReset(){
  commanderActiveCool=0;commanderWeaponCool=[0,0];
  if(aiming===6||aiming===7||aiming===8)aiming=-1;
  commanderActiveRefresh(false);commanderWeaponRefresh(false);
}
function commanderActiveFx(A,x,y,size){
  const c=A.col||[110,210,255],s=size||A.range||150;
  addParticle(3,x,y,0,0,.72,s,c[0],c[1],c[2]);
  addParticle(0,x,y,0,-10,.5,Math.max(9,s*.08),c[0],c[1],c[2]);
}
function commanderActivePayAt(i,A,quiet){
  const m=A.mass||0,e=A.energy||0,seat=commanderSeatForUnit(i);
  if(!canAfford(seat.team,m,e,seat.slot)){
    if(!quiet) toast(A.nm+' NEEDS '+(m?m+' MASS'+(e?' + ':''):'')+(e?e+' ENERGY':''));
    return false;
  }
  pay(seat.team,m,e,seat.slot);
  const cd=commanderCool(A.cool||30);
  if(typeof heroIdx!=='undefined'&&i===heroIdx) commanderActiveCool=cd;
  else if(seat.seat) seat.seat.activeCool=cd;
  return true;
}
function commanderActivePay(A){ return commanderActivePayAt(heroIdx,A,false); }
function commanderActiveRefundAt(i,A){
  const seat=commanderSeatForUnit(i);
  if(typeof heroIdx!=='undefined'&&i===heroIdx) commanderActiveCool=0;
  else if(seat.seat) seat.seat.activeCool=0;
  if(seat.team===1&&seat.seat){
    seat.seat.mass=(seat.seat.mass||0)+(A.mass||0);
    seat.seat.energy=(seat.seat.energy||0)+(A.energy||0);
    return;
  }
  const t=seat.team||0;
  resM[t]=Math.min(RES_MCAP[t],resM[t]+(A.mass||0));
  resE[t]=Math.min(RES_ECAP[t],resE[t]+(A.energy||0));
}
function commanderActiveRefund(A){ commanderActiveRefundAt(heroIdx,A); }
function tryCommanderActive(){
  const A=commanderActiveDef();
  if(!A){toast('Commander signature unavailable — baseline powers remain operational');sfx('ui');return;}
  if(heroIdx<0||!ualive[heroIdx]){toast('Commander is down');return;}
  if(commanderActiveCool>0){toast(A.nm+' REARMING — '+Math.ceil(commanderActiveCool)+'s');return;}
  if(!canAfford(0,A.mass||0,A.energy||0)){commanderActivePay(A);return;}
  if(aiming===7||aiming===8)aiming=-1;
  if(A.target){
    if(aiming===6){aiming=-1;toast(A.nm.toUpperCase()+' TARGETING CANCELLED');return;}
    aiming=6;toast((A.em||'✦')+' '+A.nm.toUpperCase()+' — tap within '+A.range+'m');
    if(typeof radioAck==='function')radioAck('ability',1,ux[heroIdx],uy[heroIdx]);return;
  }
  fireCommanderActive(ux[heroIdx],uy[heroIdx]);
}
function commanderActiveDamageCircle(x,y,r,unitDmg,bldDmg,team){
  if(team==null) team=0;
  let n=0;
  forUnitsIn(x,y,r,j=>{if(uteam[j]===team)return;dealDamage(j,unitDmg,team,-1);n++;});
  for(let bi=0;bi<blds.length;bi++){const B=blds[bi];if(B.alive&&B.team!==team&&dist2(x,y,B.x,B.y)<=r*r){damageBld(bi,bldDmg,team);n++;}}
  return n;
}
function fireCommanderActive(wx,wy){ return fireCommanderActiveAt(heroIdx,wx,wy,false); }
function fireCommanderActiveAt(idx,wx,wy,quiet){
  const C=commanderDefForUnit(idx),A=C&&C.active;
  if(!A||idx<0||!ualive[idx]){if(!quiet)aiming=-1;return false;}
  const hx=ux[idx],hy=uy[idx],team=uteam[idx],player=typeof heroIdx!=='undefined'&&idx===heroIdx;
  const dmgM=player?heroDmgMult:1;
  if(A.target&&Math.hypot(wx-hx,wy-hy)>(A.range||0)){
    if(!quiet)toast(A.nm.toUpperCase()+' TARGET OUT OF RANGE');return false;
  }
  if(A.id==='phasebreach'&&!jumpLandingClear(wx,wy,idx)){
    if(!quiet)toast('PHASE BREACH NEEDS CLEAR GROUND');return false;
  }
  if(!commanderActivePayAt(idx,A,quiet))return false;
  if(player)aiming=-1;let affected=0;
  if(A.id==='skybreaker'){
    const pts=[[0,0],[36,-24],[-31,28]];
    for(let q=0;q<pts.length;q++){
      const x=wx+pts[q][0],y=wy+pts[q][1];
      affected+=commanderActiveDamageCircle(x,y,72,190*dmgM,130*dmgM,team);
      addBeam(x,y-680,x,y,10,A.col[0],A.col[1],A.col[2],.25,'orbital');
      spawnExplosion(x,y,34,1);addCrater(x,y,28);
    }
    if(player){
      if(typeof requestShake==='function') requestShake(wx,wy,7,'blast');
      else shake=Math.max(shake,7);
    }
  }else if(A.id==='fieldworkshop'){
    forUnitsIn(hx,hy,A.range,j=>{if(uteam[j]!==team)return;affected++;uhp[j]=Math.min(uhpm[j],uhp[j]+uhpm[j]*.34+55);uclassBuff[j]=3;uclassBuffT[j]=Math.max(uclassBuffT[j],8);});
    for(const B of blds)if(B.alive&&B.team===team&&dist2(hx,hy,B.x,B.y)<=A.range*A.range){B.hp=Math.min(B.hpm,B.hp+B.hpm*.24+90);B.shieldT=Math.max(B.shieldT||0,8);affected++;}
  }else if(A.id==='ghostnet'){
    if(typeof fogStartScan==='function')fogStartScan(wx,wy,22,18);
    forUnitsIn(wx,wy,225,j=>{affected++;if(uteam[j]===team){uclassBuff[j]=2;uclassBuffT[j]=Math.max(uclassBuffT[j],9);}else{ustun[j]=Math.max(ustun[j],1.6);ucool[j]=Math.max(ucool[j],2.2);}});
  }else if(A.id==='seismicdecree'){
    affected=commanderActiveDamageCircle(wx,wy,125,420*dmgM,920*dmgM,team);
    damageScenery(wx,wy,145,1300);spawnExplosion(wx,wy,36,team);addCrater(wx,wy,105);deformTerrain(wx,wy,125,.09);
    if(player){
      if(typeof requestShake==='function') requestShake(wx,wy,11,'blast');
      else shake=Math.max(shake,11);
    }
  }else if(A.id==='crimsonadvance'){
    forUnitsIn(hx,hy,A.range,j=>{if(uteam[j]!==team||j===idx)return;affected++;uhp[j]=Math.min(uhpm[j],uhp[j]+uhpm[j]*.15);uclassBuff[j]=1;uclassBuffT[j]=Math.max(uclassBuffT[j],11);});
    affected+=commanderActiveDamageCircle(hx,hy,95,120*dmgM,70*dmgM,team);
  }else if(A.id==='ironredoubt'){
    for(const B of blds)if(B.alive&&B.team===team&&dist2(hx,hy,B.x,B.y)<=A.range*A.range){affected++;B.hp=Math.min(B.hpm,B.hp+B.hpm*.17+100);B.shieldT=Math.max(B.shieldT||0,12);commanderActiveFx(A,B.x,B.y,B.r*2.1);}
    if(!affected){commanderActiveRefundAt(idx,A);if(!quiet)toast('IRON REDOUBT NEEDS A FRIENDLY STRUCTURE IN RANGE — RESOURCES REFUNDED');return false;}
  }else if(A.id==='liquidation'){
    let claimed=0;
    for(let w=wrecks.length-1;w>=0&&claimed<4;w--){const W=wrecks[w];if(dist2(hx,hy,W.x,W.y)>A.range*A.range)continue;
      if(team===1){const seat=commanderSeatForUnit(idx);if(seat.seat){seat.seat.mass=(seat.seat.mass||0)+W.mass;seat.seat.energy=(seat.seat.energy||0)+W.en;}}
      else{resM[team]=Math.min(RES_MCAP[team],resM[team]+W.mass);resE[team]=Math.min(RES_ECAP[team],resE[team]+W.en);}
      commanderActiveFx(A,W.x,W.y,38);wrecks.splice(w,1);claimed++;}
    for(const B of blds)if(B.alive&&B.team===team&&['fac','tgate','harbor','airfield'].includes(B.type)&&dist2(hx,hy,B.x,B.y)<=A.range*A.range){B.boost=Math.max(B.boost,16);affected++;}
    affected+=claimed;
    if(!affected){commanderActiveRefundAt(idx,A);if(!quiet)toast('COMBAT LIQUIDATION NEEDS A WRECK OR FACTORY — RESOURCES REFUNDED');return false;}
  }else if(A.id==='phasebreach'){
    commanderActiveFx(A,hx,hy,65);ux[idx]=wx;uy[idx]=wy;utx[idx]=wx;uty[idx]=wy;utgt[idx]=-1;ustate[idx]=0;
    forUnitsIn(wx,wy,165,j=>{if(uteam[j]===team)return;ustun[j]=Math.max(ustun[j],3.5);ucool[j]=Math.max(ucool[j],4);affected++;});
    for(const B of blds)if(B.alive&&B.team!==team&&dist2(wx,wy,B.x,B.y)<=165*165){B.cool=Math.max(B.cool||0,4);affected++;}
    commanderCrushScenery(idx,true);
  }else if(A.id==='naniterecall'){
    const chosen=[];
    if(player){for(let n=0;n<unitHigh&&chosen.length<8;n++)if(ualive[n]&&uteam[n]===team&&usel[n]&&n!==idx)chosen.push(n);}
    else{
      const near=[];
      for(let n=0;n<unitHigh;n++)if(ualive[n]&&uteam[n]===team&&n!==idx&&dist2(ux[n],uy[n],hx,hy)<720*720)near.push(n);
      near.sort((a,b)=>dist2(ux[a],uy[a],hx,hy)-dist2(ux[b],uy[b],hx,hy));
      for(let n=0;n<near.length&&chosen.length<8;n++)chosen.push(near[n]);
    }
    for(let n=0;n<chosen.length;n++){const u=chosen[n],ang=n/Math.max(1,chosen.length)*TAU,rad=52+22*(n>>2);let x=hx+Math.cos(ang)*rad,y=hy+Math.sin(ang)*rad;
      if(typeof battlefieldClampPoint==='function'){const p=battlefieldClampPoint(x,y,TYPES[utype[u]].r+5);x=p[0];y=p[1];}
      if(!TYPES[utype[u]].air&&typeof isWalkable==='function'&&!isWalkable(x,y))continue;
      commanderActiveFx(A,ux[u],uy[u],30);ux[u]=x;uy[u]=y;utx[u]=x;uty[u]=y;utgt[u]=-1;ustate[u]=0;uhp[u]=Math.min(uhpm[u],uhp[u]+uhpm[u]*.18);uclassBuff[u]=3;uclassBuffT[u]=7;affected++;commanderActiveFx(A,x,y,34);}
    if(!affected){commanderActiveRefundAt(idx,A);if(!quiet)toast('NANITE RECALL NEEDS SELECTED ALLIED UNITS — RESOURCES REFUNDED');return false;}
  }else{
    commanderActiveRefundAt(idx,A);
    if(!quiet)toast('Signature command unavailable — resources refunded');return false;
  }
  commanderActiveFx(A,wx,wy,Math.max(70,Math.min(260,A.range||150)));
  sfx(A.sfx||'surge',wx,wy,1.2);
  if(typeof radioAck==='function'&&player)radioAck('ability',Math.max(1,affected),wx,wy);
  if(!quiet)toast((A.em||'✦')+' '+A.nm.toUpperCase()+' — '+affected+' '+(affected===1?'ASSET':'ASSETS')+' AFFECTED');
  return true;
}
function commanderActiveButtonState(){
  const b=commanderActiveButton(),A=commanderActiveDef();if(!b)return;
  b.style.display=A?'flex':'none';if(!A)return;
  const cd=b.querySelector('.cdring'),m=A.mass||0,e=A.energy||0;
  let cover=commanderActiveCool>0?Math.ceil(commanderActiveCool):(!canAfford(0,m,e)?(m&&resM[0]<m?'M':'E'):'');
  b.classList.toggle('cd',!!cover);b.classList.toggle('on',aiming===6);cd.style.display=cover?'flex':'none';cd.textContent=cover;
  const cost=(m?m+' mass'+(e?' + ':''):'')+(e?e+' energy':'');
  const tip=(A.em||'✦')+' '+A.nm+' — '+cost+', '+Math.round(commanderCool(A.cool))+'s cooldown. '+A.ds;
  b.title=tip;b.setAttribute('aria-label',tip);
}

/* ---------- CHARGED ARTILLERY BARRAGE --------------------------------------
   A Development unlock grants a new COMMAND, never a passive stat. Selected
   artillery must visibly brace for the shot and can be interrupted by orders,
   displacement or heavy incoming damage. All timing is simulation time: pause,
   game speed and reset remain deterministic, unlike a setTimeout salvo. */
const ART_BARRAGE={energy:240,cool:52,charge:2.8,range:720,shells:6,
                   cadence:.28,speed:115,damage:155,aoe:48,spread:104,arc:620};
const ART_BARRAGE_OFF=[[-.68,-.42],[.08,-.78],[.76,-.25],[.58,.57],[-.16,.80],[-.80,.18]];
let artBarrageCool=0, artBarrageAim=null, artBarrageCharge=null, artBarrageQueue=[];
function artBarrageUnlocked(){ return typeof devHas==='function'&&devHas('firemission'); }
function artBarragePattern(x,y){
  return ART_BARRAGE_OFF.slice(0,ART_BARRAGE.shells).map(o=>({
    x:clamp(x+o[0]*ART_BARRAGE.spread,15,MAP-15),
    y:clamp(y+o[1]*ART_BARRAGE.spread,15,MAP-15)
  }));
}
function artBarrageSelected(tx,ty,limit){
  const out=[];
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&uteam[i]===0&&usel[i]&&TYPES[utype[i]].cat==='art'){
    if(tx!==undefined&&dist2(ux[i],uy[i],tx,ty)>ART_BARRAGE.range*ART_BARRAGE.range) continue;
    out.push(i);
  }
  if(tx!==undefined) out.sort((a,b)=>dist2(ux[a],uy[a],tx,ty)-dist2(ux[b],uy[b],tx,ty));
  return limit?out.slice(0,limit):out;
}
function setArtBarragePreview(x,y){
  artBarrageAim={x:clamp(x,15,MAP-15),y:clamp(y,15,MAP-15)};
}
function cancelArtilleryBarrageAim(quiet){
  if(aiming===5) aiming=-1;
  artBarrageAim=null;
  if(!quiet){toast('BARRAGE TARGETING CANCELLED');sfx('ui');}
}
function artBarrageRemember(i){
  return {i:i,g:ugen[i],x:ux[i],y:uy[i],hp:uhp[i],state:ustate[i],hold:uhold[i],
    tx:utx[i],ty:uty[i],tgt:utgt[i],tgtg:utgtg[i],field:ufield[i],
    route:uPatrolRoute[i],step:uPatrolStep[i],slot:uPatrolSlot[i],cohort:uMoveCohort[i]};
}
function artBarrageRestore(m){
  const i=m.i;if(!ualive[i]||ugen[i]!==m.g||uteam[i]!==0||ustate[i]!==6)return;
  ustate[i]=m.state;uhold[i]=m.hold;utx[i]=m.tx;uty[i]=m.ty;utgt[i]=m.tgt;utgtg[i]=m.tgtg;
  ufield[i]=m.field;uPatrolRoute[i]=m.route;uPatrolStep[i]=m.step;uPatrolSlot[i]=m.slot;uMoveCohort[i]=m.cohort;
}
function artBarrageMemberLive(m){
  const i=m.i;
  return !!(ualive[i]&&ugen[i]===m.g&&uteam[i]===0&&TYPES[utype[i]].cat==='art'&&
    ustate[i]===6&&dist2(ux[i],uy[i],m.x,m.y)<=28*28&&uhp[i]>m.hp-uhpm[i]*.08);
}
function tryArtilleryBarrage(){
  if(artBarrageCharge){
    for(const m of artBarrageCharge.members)artBarrageRestore(m);
    artBarrageCharge=null;toast('BARRAGE CHARGE INTERRUPTED');sfx('ui');return;
  }
  if(aiming===5){cancelArtilleryBarrageAim(false);return;}
  if(!artBarrageUnlocked()){
    toast('LOCKED — research Fire Mission Protocol in DEVELOPMENT > DOCTRINE');sfx('ui');return;
  }
  if(artBarrageCool>0){toast('BARRAGE REARMING — '+Math.ceil(artBarrageCool)+'s');return;}
  if(artBarrageQueue.length){toast('BARRAGE VOLLEY IS STILL IN FLIGHT');return;}
  const src=artBarrageSelected();
  if(!src.length){toast('Select a Thumper or Bombard artillery unit first');sfx('ui');return;}
  if(!canAfford(0,0,ART_BARRAGE.energy)){toast('BARRAGE NEEDS '+ART_BARRAGE.energy+' ENERGY');return;}
  let cx=0,cy=0;for(const i of src){cx+=ux[i];cy+=uy[i];}cx/=src.length;cy/=src.length;
  let dx=cam.x-cx,dy=cam.y-cy,d=Math.hypot(dx,dy);
  if(d<60){dx=0;dy=-1;d=1;}
  const step=Math.min(310,Math.max(180,d));
  setArtBarragePreview(cx+dx/d*step,cy+dy/d*step);
  aiming=5;
  toast('CHARGED BARRAGE — '+ART_BARRAGE.energy+' energy · tap or drag a target area');
  if(typeof radioAck==='function')radioAck('ability',src.length,cx,cy);else sfx('radio',cx,cy,.9);
}
function beginArtilleryBarrage(x,y){
  if(!artBarrageUnlocked()||artBarrageCool>0||artBarrageCharge||artBarrageQueue.length){cancelArtilleryBarrageAim(true);return false;}
  const src=artBarrageSelected(x,y,4);
  if(!src.length){setArtBarragePreview(x,y);toast('TARGET OUT OF RANGE — move selected artillery within '+ART_BARRAGE.range+'m');return false;}
  if(!canAfford(0,0,ART_BARRAGE.energy)){cancelArtilleryBarrageAim(true);toast('BARRAGE NEEDS '+ART_BARRAGE.energy+' ENERGY');return false;}
  pay(0,0,ART_BARRAGE.energy);artBarrageCool=ART_BARRAGE.cool;
  const members=src.map(artBarrageRemember);
  for(const m of members){
    const i=m.i;ustate[i]=6;uhold[i]=1;utgt[i]=-1;utgtg[i]=-1;utx[i]=ux[i];uty[i]=uy[i];
    uPatrolRoute[i]=-1;uMoveCohort[i]=-1;
  }
  artBarrageCharge={x:clamp(x,15,MAP-15),y:clamp(y,15,MAP-15),t:0,total:ART_BARRAGE.charge,
    members:members,pattern:artBarragePattern(x,y),fx:0};
  aiming=-1;artBarrageAim=null;
  const c0=members[0],sx=ux[c0.i],sy=uy[c0.i];
  addParticle(3,sx,sy,0,0,.55,34,255,190,80);
  if(typeof fogFxVisible!=='function'||fogFxVisible(sx,sy,0))sfx('surge',sx,sy,1.05);
  toast('FIRE MISSION CHARGING — moving or heavy damage interrupts');
  return true;
}
function artBarrageLaunch(m,P){
  const i=m.i;if(!ualive[i]||ugen[i]!==m.g||uteam[i]!==0||TYPES[utype[i]].cat!=='art')return false;
  const T=TYPES[utype[i]],a=Math.atan2(P.y-uy[i],P.x-ux[i]);
  uturr[i]=a+Math.PI/2;
  const mz=typeof mfUnitMuzzle==='function'?mfUnitMuzzle(i):[ux[i]+Math.cos(a)*T.size*.72,uy[i]+Math.sin(a)*T.size*.72];
  const sx=mz[0],sy=mz[1];
  const k=fireProj(2,0,sx,sy,P.x,P.y,ART_BARRAGE.speed,ART_BARRAGE.damage,ART_BARRAGE.aoe,-1);
  if(k<0)return false;
  pwk[k]='e';pmu0[k]=1;pBarrage[k]=1;
  pArc[k]=ART_BARRAGE.arc+Math.min(180,Math.sqrt(dist2(sx,sy,P.x,P.y))*.22);
  addParticle(0,sx,sy,0,0,.16,18,255,238,188);
  addParticle(3,sx,sy,0,0,.28,29,255,170,62);
  addParticle(1,sx,sy,rr(-5,5),rr(-14,-5),.9,10,65,60,55);
  if(typeof fogFxVisible!=='function'||fogFxVisible(sx,sy,0)){
    sfx('cannon',sx,sy,1.22);
    if(typeof artilleryWorldAudio==='function')artilleryWorldAudio('launch',sx,sy,0,1.18);
  }
  return true;
}
function artBarrageTick(dt){
  if(artBarrageCool>0)artBarrageCool=Math.max(0,artBarrageCool-dt);
  const C=artBarrageCharge;
  if(C){
    const live=[];
    for(const m of C.members){if(artBarrageMemberLive(m))live.push(m);else artBarrageRestore(m);}
    C.members=live;
    if(!live.length){artBarrageCharge=null;toast('BARRAGE INTERRUPTED — battery lost the firing solution');sfx('ui');}
    else{
      C.t+=dt;C.fx-=dt;
      const p=clamp(C.t/C.total,0,1);
      for(const m of live){
        const i=m.i,a=Math.atan2(C.y-uy[i],C.x-ux[i])+Math.PI/2,d=a-uturr[i];
        uturr[i]+=clamp(Math.atan2(Math.sin(d),Math.cos(d)),-2.8*dt,2.8*dt);
      }
      if(C.fx<=0){
        C.fx=.17;
        for(const m of live){const i=m.i;addParticle(0,ux[i],uy[i],rr(-3,3),rr(-4,1),.22,5+8*p,255,185,68);}
      }
      if(C.t>=C.total){
        for(const m of live)artBarrageRestore(m);
        for(let n=0;n<C.pattern.length;n++)artBarrageQueue.push({t:n*ART_BARRAGE.cadence,m:live[n%live.length],p:C.pattern[n]});
        artBarrageCharge=null;toast('BARRAGE AWAY — '+C.pattern.length+' shells');
      }
    }
  }
  for(let q=artBarrageQueue.length-1;q>=0;q--){
    const Q=artBarrageQueue[q];Q.t-=dt;
    if(Q.t<=0){artBarrageLaunch(Q.m,Q.p);artBarrageQueue.splice(q,1);}
  }
}
function artBarrageReset(){
  artBarrageCool=0;artBarrageAim=null;artBarrageCharge=null;artBarrageQueue.length=0;
}
function artBarrageButtonState(){
  const b=document.getElementById('abBarrage');if(!b)return;
  const cd=b.querySelector('.cdring'),locked=!artBarrageUnlocked(),n=artBarrageSelected().length;
  let cover='',desc='Charged Barrage — '+ART_BARRAGE.energy+' energy, '+ART_BARRAGE.cool+'s cooldown. '+
    'Selected artillery braces for '+ART_BARRAGE.charge+'s; movement or heavy damage interrupts.';
  if(locked){cover='LOCK';desc='Locked — research Fire Mission Protocol in Development > Doctrine.';}
  else if(artBarrageCharge){cover=Math.round(clamp(artBarrageCharge.t/artBarrageCharge.total,0,1)*100)+'%';}
  else if(artBarrageQueue.length){cover='FIRE';}
  else if(artBarrageCool>0){cover=String(Math.ceil(artBarrageCool));}
  else if(resE[0]<ART_BARRAGE.energy){cover='E';}
  else if(!n){cover='ARTY';}
  b.classList.toggle('cd',!!cover);b.classList.toggle('on',aiming===5||!!artBarrageCharge);
  cd.style.display=cover?'flex':'none';cd.textContent=cover;
  b.title=desc;b.setAttribute('aria-label',desc);
}

/* ---------- CONTEXTUAL CLASS DOCTRINES ------------------------------------
   One adaptive button keeps the phone HUD readable while still giving three
   major unit families a real unlocked active. The selected composition decides
   which command is presented; mixed selections choose the family with the most
   eligible units. Artillery retains its authored target-and-charge Barrage. */
const CLASS_AB={
  assault:{nm:'BREAK',em:'➤',req:'breakthrough',energy:130,cool:44,dur:9,
    cats:['inf','veh','at','aoe','exp'],
    ds:'+28% damage, +22% speed and faster fire for 9s; units take +12% damage.'},
  intercept:{nm:'INTERCEPT',em:'⌁',req:'intercept',energy:95,cool:38,dur:8,
    cats:['air','aa'],
    ds:'+58% speed, +22% range and faster tracking for 8s.'},
  service:{nm:'SERVICE',em:'✚',req:'fieldservice',energy:115,cool:34,dur:7,
    cats:['sup'],
    ds:'Support units restore nearby allies and project a 28% damage screen for 7s.'}
};
const classAbCool={assault:0,intercept:0,service:0};
function classAbilityEligible(A){
  const out=[];
  for(let i=0;i<unitHigh;i++)if(ualive[i]&&uteam[i]===0&&usel[i]&&A.cats.indexOf(TYPES[utype[i]].cat)>=0)out.push(i);
  return out;
}
function classAbilityChoice(){
  let best=null,bestN=0;
  for(const k of ['service','intercept','assault']){
    const n=classAbilityEligible(CLASS_AB[k]).length;
    if(n>bestN){best=k;bestN=n;}
  }
  return best?{key:best,A:CLASS_AB[best],units:classAbilityEligible(CLASS_AB[best])}:null;
}
function classAbilityUnlocked(A){return typeof devHas==='function'&&devHas(A.req);}
/* THE ARMY'S OWN WORD FOR ITS OWN DOCTRINE. CLASS_AB holds the rules — cost,
   cooldown, duration, eligible categories — and those are identical for every
   faction. Only the label, glyph and sentence move, resolved once here so the
   button, its aria-label, the hot-slot chip and every toast cannot disagree
   about what the player just pressed. */
function classAbWords(key){
  const A=CLASS_AB[key]||{};
  if(typeof factionClassAbName!=='function') return {nm:A.nm||'',em:A.em||'',ds:A.ds||''};
  const kit=(typeof factionTextKit==='function')?factionTextKit(0):undefined;
  return {nm:factionClassAbName(key,kit)||A.nm||'',
          em:factionClassAbEm(key,kit)||A.em||'',
          ds:factionClassAbDesc(key,kit)||A.ds||''};
}
function tryClassAbility(){
  const C=classAbilityChoice();
  if(!C){toast('Select assault, interceptor, anti-air, or support units first');sfx('ui');return;}
  const A=C.A,W=classAbWords(C.key);
  if(!classAbilityUnlocked(A)){
    const n=(typeof DEVTREE!=='undefined'&&DEVTREE.find(x=>x.id===A.req));
    toast('LOCKED — research '+(n?n.nm:A.req)+' in DEVELOPMENT > DOCTRINE');sfx('ui');return;
  }
  if(classAbCool[C.key]>0){toast(W.nm+' REARMING — '+Math.ceil(classAbCool[C.key])+'s');return;}
  if(!canAfford(0,0,A.energy)){toast(W.nm+' NEEDS '+A.energy+' ENERGY');return;}
  pay(0,0,A.energy);classAbCool[C.key]=A.cool;
  const touched=new Set(),centres=C.units;
  if(C.key==='service'){
    for(const i of centres){
      uclassBuff[i]=3;uclassBuffT[i]=A.dur;
      forUnitsIn(ux[i],uy[i],125,j=>{
        if(uteam[j]!==0)return;touched.add(j);uclassBuff[j]=3;uclassBuffT[j]=Math.max(uclassBuffT[j],A.dur);
        uhp[j]=Math.min(uhpm[j],uhp[j]+uhpm[j]*.26+55);
        addParticle(0,ux[j],uy[j],0,-8,.42,6,82,255,164);
      });
      for(const B of blds)if(B.alive&&B.team===0&&dist2(ux[i],uy[i],B.x,B.y)<=145*145){
        B.hp=Math.min(B.hpm,B.hp+B.hpm*.18+80);touched.add(B);
      }
      addParticle(3,ux[i],uy[i],0,0,.75,250,82,255,164);
    }
  }else{
    const kind=C.key==='intercept'?2:1;
    for(const i of centres){uclassBuff[i]=kind;uclassBuffT[i]=A.dur;touched.add(i);
      const col=kind===2?[75,225,255]:[255,112,54];
      addParticle(3,ux[i],uy[i],0,0,.5,TYPES[utype[i]].size*2.5,col[0],col[1],col[2]);
    }
  }
  let cx=0,cy=0;for(const i of centres){cx+=ux[i];cy+=uy[i];}cx/=centres.length;cy/=centres.length;
  toast(W.em+' '+W.nm+' — '+touched.size+' '+(touched.size===1?'ASSET':'ASSETS')+' AFFECTED');
  sfx(C.key==='service'?'heal':'surge',cx,cy,1.05);
  if(typeof radioAck==='function')radioAck('ability',touched.size,cx,cy);
}
function classAbilityReset(){
  for(const k in classAbCool)classAbCool[k]=0;
  /* resetWorld already calls this after wiping the pop ledger. airlift.js
     loads before main.js so it cannot wrap resetWorld; this is the world-reset
     hook we own. mfAirliftResetHolds is idempotent with the ledger wrap. */
  if(typeof mfAirliftResetHolds==='function') mfAirliftResetHolds();
}
function classAbilityTick(dt){for(const k in classAbCool)if(classAbCool[k]>0)classAbCool[k]=Math.max(0,classAbCool[k]-dt);}
function classAbilityButtonState(){
  const b=document.getElementById('abClass');if(!b)return;
  const C=classAbilityChoice(),cd=b.querySelector('.cdring'),em=document.getElementById('classAbEm'),nm=document.getElementById('classAbNm');
  b.style.display=C?'flex':'none';if(!C)return;
  const A=C.A,W=classAbWords(C.key),locked=!classAbilityUnlocked(A);em.textContent=W.em;nm.textContent=W.nm;
  let cover='';if(locked)cover='LOCK';else if(classAbCool[C.key]>0)cover=Math.ceil(classAbCool[C.key]);else if(resE[0]<A.energy)cover='E';
  b.classList.toggle('cd',!!cover);cd.style.display=cover?'flex':'none';cd.textContent=cover;
  const desc=W.nm+' — '+A.energy+' energy, '+A.cool+'s cooldown. '+W.ds;
  b.title=desc;b.setAttribute('aria-label',desc);
}

function heroXP(x){
  if(heroIdx<0) return;
  heroXp+=x;
  while(heroXp>=heroXpNext){
    heroXp-=heroXpNext; heroLvl++;
    heroXpNext=Math.round(heroXpNext*1.45);
    pendingLevels++;
    if(heroLvl===2){ abUnlock[1]=true; toast('🛠 REPAIR PULSE unlocked'); }
    if(heroLvl===3){ abUnlock[2]=true; toast('⚡ COMBAT SURGE unlocked'); }
    sfx('level');
  }
  if(pendingLevels>0 && document.getElementById('levelUp').style.display!=='flex') showLevelUp();
}

/* The eight level-up cards. Nova is the base roster's own voice so these ARE
   its words; the other three armies overlay `upgrade` in src/factext.js and a
   Brood commander is never offered "Nano Plating". Names stay <= 16 characters
   because .upCard is 136px wide on a 380px phone — "Assembly Protocols" was 18
   and wrapped. Whatever the words, `fn` is the effect and is never overridden. */
const UPGRADES=[
 {em:'🗡', nm:'Weapon Overload',  ds:'+25% Commander damage',        fn:()=>{ heroDmgMult*=1.25; }},
 {em:'🛡', nm:'Nano Plating',     ds:'+20% Commander max HP (heals)',fn:()=>{ if(heroIdx>=0){ uhpm[heroIdx]*=1.2; uhp[heroIdx]=Math.min(uhpm[heroIdx],uhp[heroIdx]+uhpm[heroIdx]*0.25);} }},
 /* Was *=1.8 uncapped: three picks took regen from 14 to 82/s and the
    commander stopped being killable. Capped compounding keeps the card
    worth taking without ever out-regenerating a defended base's damage. */
 {em:'♻', nm:'Regen Matrix',     ds:'+45% Commander regeneration',   fn:()=>{ heroRegen=Math.min(heroRegen*1.45,70); }},
 {em:'⏱', nm:'Rapid Systems',    ds:'Ability cooldowns −20%',        fn:()=>{ for(let i=0;i<3;i++) AB_CD[i]*=0.8; }},
 {em:'📦', nm:'Logistics Core',   ds:'+2.5 mass & +8 energy income',  fn:()=>{ bonusMass+=2.5; bonusEnergy+=8; }},
 {em:'🎖', nm:'Veteran Doctrine', ds:'All your units +10% damage',    fn:()=>{ armyDmgMult+=0.10; }},
 {em:'🏭', nm:'Assembly Lines', ds:'Factories build 25% faster',      fn:()=>{ playerBuildMult+=0.25; }},
 {em:'💥', nm:'Wider Blast',      ds:'Orbital Blast radius +35%',     fn:()=>{ blastRadius*=1.35; }},
];
let bonusMass=0, bonusEnergy=0, armyDmgMult=1, blastRadius=110;
/* Combat Stims are a TEMPORARY multiplier and must be kept out of armyDmgMult.
   armyDmgMult is written ADDITIVELY by thirteen different sources — research,
   the Veteran Doctrine level-up card, five armory weapon items, consumables,
   develop modules and operation modifiers. Folding a *=1.45 into it and later
   doing /=1.45 is not an inverse once any of those has landed in between:
   (1.00*1.45 + 0.12)/1.45 = 1.083, not 1.12. A player who completed Ballistics I
   during a stim permanently kept 0.083 of the 0.12 they paid 500 mass and 2500
   energy for, and level-ups are MORE likely during a stim because kills spike. */
let stimDmgMult=1;
function flashScreen(){
  const f=document.getElementById('flash');
  if(!f) return;
  f.style.transition='none'; f.style.opacity=0.85;
  requestAnimationFrame(()=>{ f.style.transition='opacity .9s'; f.style.opacity=0; });
}

function showLevelUp(){
  if(pendingLevels<=0) return;
  paused=true;
  const el=document.getElementById('levelUp');
  document.getElementById('luLvl').textContent='Commander reached level '+(heroLvl-pendingLevels+1+0)+' — choose an upgrade';
  const cards=document.getElementById('luCards');
  cards.innerHTML='';
  /* Draw INDICES, not the card objects: the words on a card are resolved
     through the player's faction kit (src/factext.js) and the index is what
     names them. A Brood commander is not offered "Nano Plating". The `fn` is
     never overridden, so the effect can never drift from the promise. */
  const pool=UPGRADES.map((u,i)=>i);
  const upKit=(typeof factionTextKit==='function')?factionTextKit(0):undefined;
  for(let k=0;k<2;k++){
    const gi=pool.splice(Math.floor(Math.random()*pool.length),1)[0];
    const pick=UPGRADES[gi];
    const upEm=(typeof factionUpgradeEm==='function')?factionUpgradeEm(gi,upKit)||pick.em:pick.em;
    const upNm=(typeof factionUpgradeName==='function')?factionUpgradeName(gi,upKit)||pick.nm:pick.nm;
    const upDs=(typeof factionUpgradeDesc==='function')?factionUpgradeDesc(gi,upKit)||pick.ds:pick.ds;
    const d=document.createElement('div');
    d.className='upCard';
    d.innerHTML='<div class="em">'+upEm+'</div><b>'+upNm+'</b>'+upDs;
    d.addEventListener('pointerdown',ev=>{
      ev.stopPropagation();
      pick.fn(); sfx('ui');
      pendingLevels--;
      if(pendingLevels>0){ showLevelUp(); }
      else { el.style.display='none'; paused=false; }
    });
    cards.appendChild(d);
  }
  el.style.display='flex';
}

// ---------- abilities ----------
function tryAbility(k){
  if(aiming===5) cancelArtilleryBarrageAim(true);
  if(aiming===6) aiming=-1;
  if(aiming===7||aiming===8)aiming=-1;
  if(heroIdx<0){ toast('Commander is down'); return; }
  if(!abUnlock[k]){
    toast(k===3?'🛰 Buy the Orbital Uplink in the Armory to unlock this'
        :k===4?'⚡ Craft the EMP Charge module in Development to unlock this'
                :'Unlocks at Commander level '+(k===1?2:3));
    return;
  }
  if(abCool[k]>0) return;
  if(k===0){
    aiming=0;
    const fac=typeof mfCombatFactionTeam==='function'?mfCombatFactionTeam(0):'nova';
    toast(fac==='legion'||fac==='syndicate'
      ? '◐ Tap a location to open a GRAVITY WELL'
      : '✹ Tap a location to fire CLUSTER BOMB');
    if(typeof radioAck==='function')radioAck('ability',1,ux[heroIdx],uy[heroIdx]); return; }
  if(k===3){ aiming=3; toast('🛰 Tap a location to call the ORBITAL LANCE');
    if(typeof radioAck==='function')radioAck('ability',1,ux[heroIdx],uy[heroIdx]); return; }
  if(k===1){ // repair pulse
    abCool[1]=commanderCool(AB_CD[1]);
    const hx=ux[heroIdx], hy=uy[heroIdx];
    forUnitsIn(hx,hy,190,j=>{
      if(uteam[j]===0){ uhp[j]=Math.min(uhpm[j],uhp[j]+uhpm[j]*0.45+40);
        addParticle(0,ux[j],uy[j],0,-10,.5,7, 120,255,170); }
    });
    addParticle(3,hx,hy,0,0,.7,190, 90,255,160);
    sfx('heal'); if(typeof radioAck==='function')radioAck('ability',1,hx,hy); return;
  }
  if(k===4){ // EMP charge — the craftable module from Development
    /* This module has been on sale in Development for 5 Relic Cores + 30 Isotope
       since it was added, described as "stun everything in a wide radius", with
       no implementation anywhere in the codebase and a flag that a four-entry
       reset array threw away every match. Both are fixed; this is the ability.

       Centred on the Commander rather than aimed: it is a panic button for when
       the Commander is caught, and a self-centred blast needs no aiming mode —
       one less state machine to get wrong. Friendlies are untouched. */
    abCool[4]=commanderCool(AB_CD[4]);
    const hx=ux[heroIdx], hy=uy[heroIdx], R=260;
    let n=0;
    forUnitsIn(hx,hy,R,j=>{
      if(!ualive[j]||uteam[j]===0||j===heroIdx) return;
      ustun[j]=4; ucool[j]=Math.max(ucool[j],4); n++;
      addParticle(0,ux[j],uy[j],0,-12,.5,7,150,220,255);
    });
    /* Enemy defensive structures are on the same grid and are just as much
       "everything in a wide radius" as the units are. */
    let b=0;
    for(const B of blds){
      if(!B.alive||B.team===0) continue;
      if(Math.hypot(B.x-hx,B.y-hy)>R) continue;
      B.cool=Math.max(B.cool||0,4); b++;
    }
    addParticle(3,hx,hy,0,0,.8,R,150,220,255);
    if(typeof gpfxEnergyBlast==='function')
      gpfxEnergyBlast(hx,hy,16,52,[150,220,255],{speed:180,up:0.12,life:0.85,size:3.4,min:8,jit:10});
    toast('⚡ EMP — '+n+' unit'+(n===1?'':'s')+(b?' and '+b+' structure'+(b===1?'':'s'):'')+' disabled for 4s');
    sfx('surge',hx,hy,1.2);
    if(typeof radioAck==='function')radioAck('ability',n,hx,hy);
    return;
  }
  if(k===2){ // combat surge
    abCool[2]=commanderCool(AB_CD[2]);
    const hx=ux[heroIdx], hy=uy[heroIdx];
    let n=0;
    forUnitsIn(hx,hy,230,j=>{ if(uteam[j]===0){ ubuff[j]=8; n++; } });
    addParticle(3,hx,hy,0,0,.7,230, 255,220,90);
    toast('⚡ '+n+' units surging (+dmg +speed)');
    sfx('surge'); if(typeof radioAck==='function')radioAck('ability',n,hx,hy); return;
  }
}
/* Emergency mobility is deliberately short-range and terrain-aware. It gets
   the heavy commander out of a blocked street or a surround, without turning
   it into a free cross-map teleport. */
function jumpLandingClear(x,y,i){
  if(i==null) i=heroIdx;
  if(typeof isWalkable==='function'&&!isWalkable(x,y)) return false;
  const rad=(TYPES[utype[i]]&&TYPES[utype[i]].r)||12;
  for(let b=0;b<blds.length;b++){
    const B=blds[b]; if(!B.alive) continue;
    if(dist2(x,y,B.x,B.y)<(B.r+rad+12)*(B.r+rad+12)) return false;
  }
  return true;
}
/* Craters alter the passability grid after they are drawn. A commander that
   was already standing in the new flooded cell otherwise has no legal first
   step, so normal pathfinding can never escape. Search outward in rings and
   use a tiny automatic jet-assist only when the terrain (or a real stall) has
   trapped the player. This does not spend energy or consume the chosen Jump
   Jets ability. */
function nearestCommanderGround(x,y,range){
  const T=TYPES[utype[heroIdx]];
  for(let d=18;d<=range;d+=18){
    for(let n=0;n<16;n++){
      /* `let`, not `const`: the clamp below reassigns these. battlefieldClampPoint
         is always defined (main.js), so that branch ALWAYS ran and always threw
         "Assignment to constant variable" — from inside unitTick, which is the
         first call in frame(). Every later sim step and the entire render were
         skipped, so a Commander trapped by crater terrain froze the whole game
         on a still picture. The one function whose job is to un-stick the
         Commander could not complete even once. */
      let a=n/16*TAU+(d/18&1)*.19,px=clamp(x+Math.cos(a)*d,10,MAP-10),py=clamp(y+Math.sin(a)*d,10,MAP-10);
      if(typeof battlefieldClampPoint==='function'){const p=battlefieldClampPoint(px,py,T.r+8);px=p[0];py=p[1];}
      if(jumpLandingClear(px,py)) return [px,py];
    }
  }
  return null;
}
function commanderTerrainRecovery(i,travel,dt){
  if(i!==heroIdx||!ualive[i]||!TYPES[utype[i]]||TYPES[utype[i]].cat!=='hero') return;
  const ordered=Math.hypot(utx[i]-ux[i],uty[i]-uy[i])>34;
  const trapped=(typeof isWalkable==='function'&&!isWalkable(ux[i],uy[i]));
  heroStuckFor=(trapped||(ordered&&travel<.08&&umode[i]!==1&&umode[i]!==5))?heroStuckFor+dt:0;
  if(heroStuckFor<0.9) return;
  const P=nearestCommanderGround(ux[i],uy[i],trapped?220:120);
  heroStuckFor=0;
  if(!P) return;
  const ox=ux[i],oy=uy[i];ux[i]=P[0];uy[i]=P[1];utgt[i]=-1;utgtg[i]=-1;ufield[i]=-1;
  utx[i]=P[0];uty[i]=P[1];ustate[i]=0;
  addParticle(3,ox,oy,0,0,.32,42,110,205,255);addParticle(3,P[0],P[1],0,0,.42,50,110,205,255);
  if(performance.now()>heroRescueAt){heroRescueAt=performance.now()+2800;toast('↗ JET ASSIST — Commander cleared crater terrain');sfx('surge',P[0],P[1],.72);}
}
function tryCommanderJump(){
  if(heroIdx<0||!ualive[heroIdx]){ toast('Commander is down'); return; }
  if(heroJumpCool>0){ toast('JUMP JETS REARMING — '+Math.ceil(heroJumpCool)+'s'); return; }
  if(!canAfford(0,0,HERO_JUMP.energy)){ toast('JUMP JETS NEED '+HERO_JUMP.energy+' ENERGY'); return; }
  if(aiming===4){ aiming=-1; toast('JUMP TARGETING CANCELLED'); return; }
  aiming=4;
  toast('JUMP JETS — tap clear ground within '+HERO_JUMP.range+'m');
  if(typeof radioAck==='function') radioAck('ability',1,ux[heroIdx],uy[heroIdx]);
}
function commanderCrushScenery(i,impact){
  if(i<0||!ualive[i]||!TYPES[utype[i]]||TYPES[utype[i]].cat!=='hero') return;
  const T=TYPES[utype[i]],rad=T.r+(impact?36:16),r2=rad*rad;
  for(const R of relics){
    /* Cities and large derelicts remain terrain decisions. Cottages, houses,
       props and small blocks are destructible under a commander's weight. */
    if(!R.alive||R.s>56||!(R.kind===2||R.kind===3)||dist2(ux[i],uy[i],R.x,R.y)>r2) continue;
    R.hp-=impact?9999:Math.max(95,T.size*4);
    R.burn=Math.min(1,(R.burn||0)+.16);
    if(R.hp<=0) collapseBlock(R,0);
  }
}
function fireCommanderJump(wx,wy){
  if(heroIdx<0||!ualive[heroIdx]){ aiming=-1; return; }
  const hx=ux[heroIdx],hy=uy[heroIdx],d=Math.hypot(wx-hx,wy-hy);
  if(d>HERO_JUMP.range){ toast('JUMP TARGET OUT OF RANGE'); return; }
  if(!jumpLandingClear(wx,wy)){ toast('JUMP NEEDS CLEAR LANDING GROUND'); return; }
  pay(0,0,HERO_JUMP.energy); heroJumpCool=commanderCool(HERO_JUMP.cool); aiming=-1;
  addParticle(3,hx,hy,0,0,.42,58,110,215,255); addParticle(1,hx,hy,0,-16,.72,18,85,80,72);
  ux[heroIdx]=wx; uy[heroIdx]=wy; utx[heroIdx]=wx; uty[heroIdx]=wy; utgt[heroIdx]=-1; ustate[heroIdx]=0;
  commanderCrushScenery(heroIdx,true);
  addParticle(3,wx,wy,0,0,.66,72,130,225,255); addParticle(1,wx,wy,0,-18,.86,24,95,88,76);
  if(typeof requestShake==='function') requestShake(wx,wy,3.2,'step');
  else shake=Math.max(shake,3.2);
  sfx('surge',wx,wy,1.25);
  toast('↗ COMMANDER JUMP — landing zone secured');
}
function commanderJumpTick(dt){ if(heroJumpCool>0) heroJumpCool=Math.max(0,heroJumpCool-dt); }
function commanderJumpButtonState(){
  const b=document.getElementById('abJump'); if(!b) return;
  const cd=b.querySelector('.cdring'),cover=heroJumpCool>0?Math.ceil(heroJumpCool):(resE[0]<HERO_JUMP.energy?'E':'');
  b.classList.toggle('cd',!!cover); b.classList.toggle('on',aiming===4);
  cd.style.display=cover?'flex':'none'; cd.textContent=cover;
  b.title='Jump Jets — '+HERO_JUMP.energy+' energy, '+Math.round(commanderCool(HERO_JUMP.cool))+'s cooldown. Emergency move through blocked terrain.';
}
function fireBlast(wx,wy){
  buzz(30);
  abCool[0]=commanderCool(AB_CD[0]);
  aiming=-1;
  const fac=typeof mfCombatFactionTeam==='function'?mfCombatFactionTeam(0):'nova';
  /* Ability 0 used spawnExplosion(46, victimTeam) — size>=40 is the
     superweapon handoff, and victim-team made Nova's blast inherit the
     enemy's singularity. Legion/Syndicate own the well; Nova is bomblets. */
  if(fac==='legion'||fac==='syndicate'){
    spawnSingularity(wx,wy,1.05,0);
    if(typeof radioAck==='function')radioAck('ability',1,wx,wy);
    if(typeof requestShake==='function') requestShake(wx,wy,6,'blast');
    else shake=Math.max(shake,6);
    return;
  }
  const R=blastRadius, dmgM=heroDmgMult, spread=R*(72/110);
  const pts=[[0,0]];
  for(let k=0;k<7;k++){
    const a=k/7*TAU+0.18, d=spread*(0.42+((k*3)&1)*0.28);
    pts.push([Math.cos(a)*d,Math.sin(a)*d]);
  }
  let n=0;
  for(let q=0;q<pts.length;q++){
    const x=wx+pts[q][0], y=wy+pts[q][1];
    const r=q?40:48, ud=(q?115:170)*dmgM, bd=(q?85:120)*dmgM;
    n+=commanderActiveDamageCircle(x,y,r,ud,bd,0);
    spawnExplosion(x,y,q?22:28,0);
    if(typeof gpfxEnergyBlast==='function')
      gpfxEnergyBlast(x,y,14,q?18:28,[255,210,120],{speed:140,up:0.5,life:0.62,size:3.1,min:5});
    addCrater(x,y,q?16:22);
  }
  damageScenery(wx,wy,R,700);
  deformTerrain(wx,wy,70,0.035);
  sfx('boom',wx,wy,2.2);
  if(typeof radioAck==='function')radioAck('ability',1,wx,wy);
  if(typeof requestShake==='function') requestShake(wx,wy,8,'blast');
  else shake=8;
  toast('✹ CLUSTER BOMB — '+n+' '+(n===1?'ASSET':'ASSETS')+' HIT');
}
function commanderAiAimPoint(i,A){
  const hx=ux[i],hy=uy[i],team=uteam[i],R=A.range||180;
  if(!A.target) return {x:hx,y:hy,n:1};
  let cx=0,cy=0,n=0;
  forUnitsIn(hx,hy,R,j=>{if(uteam[j]===team)return;cx+=ux[j];cy+=uy[j];n++;});
  if(n>=2) return {x:cx/n,y:cy/n,n};
  const e=findEnemy(hx,hy,team,R);
  if(e>=0) return {x:ux[e],y:uy[e],n:1};
  const b=findEnemyBld(hx,hy,team,Math.min(R,420));
  if(b>=0) return {x:blds[b].x,y:blds[b].y,n:1};
  return null;
}
function commanderAiShouldCast(i,A,aim){
  const hx=ux[i],hy=uy[i],team=uteam[i];
  if(A.id==='ironredoubt'){
    for(const B of blds)if(B.alive&&B.team===team&&dist2(hx,hy,B.x,B.y)<=A.range*A.range) return true;
    return false;
  }
  if(A.id==='liquidation'){
    for(let w=0;w<wrecks.length;w++) if(dist2(hx,hy,wrecks[w].x,wrecks[w].y)<=A.range*A.range) return true;
    for(const B of blds)if(B.alive&&B.team===team&&['fac','tgate','harbor','airfield'].includes(B.type)&&dist2(hx,hy,B.x,B.y)<=A.range*A.range) return true;
    return false;
  }
  if(A.id==='naniterecall'){
    for(let n=0;n<unitHigh;n++) if(ualive[n]&&uteam[n]===team&&n!==i&&dist2(ux[n],uy[n],hx,hy)<720*720) return true;
    return false;
  }
  if(A.id==='fieldworkshop'||A.id==='crimsonadvance') return true;
  return !!(aim&&aim.n);
}
function commanderAiFireSecondary(i,S){
  const C=commanderDefForUnit(i),W=C&&C.secondary;
  if(!W||!S.weaponCool) return;
  if(S.weaponCool[1]>0) return;
  const e=findEnemy(ux[i],uy[i],uteam[i],W.range||280);
  if(e<0) return;
  const seat=commanderSeatForUnit(i);
  if((W.energy||0)&&!canAfford(seat.team,0,W.energy,seat.slot)) return;
  if(W.energy) pay(seat.team,0,W.energy,seat.slot);
  S.weaponCool[1]=W.cool||16;
  const mz=typeof mfUnitMuzzle==='function'?mfUnitMuzzle(i):[ux[i],uy[i]];
  const pk=fireProj(W.ptype,uteam[i],mz[0],mz[1],ux[e],uy[e],W.speed,W.damage,W.aoe||0,e);
  if(pk>=0){pwk[pk]=W.wk||'p';pCannon[pk]=1;if(W.ptype===2){pBarrage[pk]=1;pArc[pk]=90;}projectileFireFX(pk,mz[0],mz[1],ux[e]-mz[0],uy[e]-mz[1]);}
  sfx(W.sfx||'cannon',ux[i],uy[i],1.2);
}
/* Which wallet a commander power spends. The four baseline powers hardcoded
   pay(0,0,...) - the PLAYER bank - so an ally commander firing its primary,
   barrage, class ability or jump jets billed the human. Harmless while ally
   seats had no wallet; a straight transfer now that they do. */
function commanderUnitSeatSlot(i){
  if(i==null||i<0) return null;
  if(typeof uCmd==='undefined') return null;
  const s=uCmd[i];
  return (s!=null&&s>=0)?s:null;
}
function commanderAiTick(dt){
  if(typeof AI==='undefined'||!AI) return;
  const seats=[].concat(AI.bases||[],AI.allies||[]);
  for(const S of seats){
    if(!S||S.commander==null||S.commander<0) continue;
    const i=S.commander;
    if(!ualive[i]||(S.commanderGen!=null&&ugen[i]!==S.commanderGen)) continue;
    if(typeof heroIdx!=='undefined'&&i===heroIdx) continue;
    /* A seat a human occupies is never driven by the director. Nothing sets
       S.human yet - co-op has not landed - so this is inert today, and the
       ===true test keeps it inert for an undefined field rather than
       accidentally parking every AI commander. */
    if(S&&S.human===true) continue;
    S.activeCool=Math.max(0,(S.activeCool||0)-dt);
    if(!S.weaponCool) S.weaponCool=[0,0];
    S.weaponCool[0]=Math.max(0,S.weaponCool[0]-dt);
    S.weaponCool[1]=Math.max(0,S.weaponCool[1]-dt);
    commanderAiFireSecondary(i,S);
    if(S.activeCool>0) continue;
    const C=commanderDefForUnit(i),A=C&&C.active; if(!A) continue;
    const aim=commanderAiAimPoint(i,A);
    if(!commanderAiShouldCast(i,A,aim)||!aim) continue;
    /* ALLY abilities now cost the ally seat. fireCommanderActiveAt pays
       NOTHING - the player UI callers pay before invoking it - so an AI
       commander cast has always been free. That was invisible while ally
       seats had no wallet; now that they earn from real structures it should
       cost them, exactly as it costs the player. Enemy seats are deliberately
       left free: charging them is a live difficulty change and belongs to a
       balance pass, not to this one. A seat that cannot afford its ability
       simply does not cast, which is what canAfford is for.
       commanderUnitSeatSlot resolves the seat from uCmd on the firing unit. */
    if(uteam[i]===0 && A.energy){
      const seat=commanderUnitSeatSlot(i);
      if(seat!=null){
        if(!canAfford(0,0,A.energy,seat)) continue;
        pay(0,0,A.energy,seat);
      }
    }
    fireCommanderActiveAt(i,aim.x,aim.y,true);
  }
}
function abilTick(dt){
  for(let i=0;i<abCool.length;i++) if(abCool[i]>0) abCool[i]-=dt;
  if(commanderActiveCool>0)commanderActiveCool=Math.max(0,commanderActiveCool-dt);
  for(let i=0;i<commanderWeaponCool.length;i++)if(commanderWeaponCool[i]>0)commanderWeaponCool[i]=Math.max(0,commanderWeaponCool[i]-dt);
  commanderWeaponButtonState();
  commanderJumpTick(dt);
  classAbilityTick(dt);
  artBarrageTick(dt);
  commanderAiTick(dt);
}
/* ---------- ORBITAL LANCE — a sweeping beam bought in the Armory ---------- */
function fireLance(wx,wy){
  abCool[3]=commanderCool(AB_CD[3]);
  aiming=-1;
  const ang=Math.random()*TAU, LEN=560, W=64;
  const dxl=Math.cos(ang), dyl=Math.sin(ang);
  for(let k=0;k<9;k++){
    const px2=wx+dxl*(k-4)*(LEN/9), py2=wy+dyl*(k-4)*(LEN/9);
    setTimeout(()=>{
      if(!running) return;
      forUnitsIn(px2,py2,W,j=>{ if(uteam[j]!==0) dealDamage(j,760*heroDmgMult,0,-1); });
      const nb=findEnemyBld(px2,py2,0,W);
      if(nb>=0) damageBld(nb,620,0);
      damageScenery(px2,py2,W,500);
      spawnExplosion(px2,py2,34,1);
      addParticle(3,px2,py2,0,0,.6,W*2.2, 190,225,255);
      addBeam(px2,py2-700,px2,py2,16,200,235,255,0.28,'orbital');
      deformTerrain(px2,py2,W*0.8,0.03);
      if(typeof requestShake==='function') requestShake(px2,py2,7,'blast');
      else shake=Math.max(shake,7);
      sfx('boom',px2,py2,1.7);
    },k*85);
  }
  toast('🛰 ORBITAL LANCE — cutting the surface');
  sfx('laser',wx,wy,2.4);
  if(typeof radioAck==='function')radioAck('ability',1,wx,wy);
}
// hook bonus income into economy
const _econTick=econTick;
econTick=function(dt){
  _econTick(dt);
  resM[0]=Math.min(RES_MCAP[0],resM[0]+bonusMass*dt);
  resE[0]=Math.min(RES_ECAP[0],resE[0]+bonusEnergy*dt);
  mRate+=bonusMass; eRate+=bonusEnergy;
};

