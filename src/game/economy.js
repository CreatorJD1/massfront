;
;
/* ============================================================
   ECONOMY — SupCom-style streaming mass/energy + build placement
   ============================================================ */
const resM=[220,220], resE=[900,900];
const MCAP0=1200, ECAP0=6000;
const RES_MCAP=[MCAP0,MCAP0], RES_ECAP=[ECAP0,ECAP0];   // PER TEAM — each side's own Silos
const FAB_E=58, FAB_M=3.6;             // Fabricator: burns energy → forges mass
let mRate=0, eRate=0;                  // gross income (player)
let mSpend=0, eSpend=0;                // measured spend rate (player, for the HUD)
let mSpendAcc=0, eSpendAcc=0, spendT=0;
let mWasted=0;                         // mass lost to overflow (player) — drives the coach
let aiIncomeMult=1, aiBuildMult=1, aiDmgMult=1, aiHpMult=1, playerBuildMult=1;

const stats={kills:[0,0,0], built:[0,0], t:0};
let stallM=0, stallE=0;                 // production starving for mass / energy (HUD warning)

/* Per-seat AI wallets. Allies already own virtual mass/energy on the seat
   object; enemy commanders copy that pattern so Standard/Large 1v2 and 1v3
   do not dump three mex belts into resM[1]. sim.js bldTick still calls
   payStream(team,m,e) with no slot (Track 3 owns that file), so team-1
   streams infer the paying building this frame. Compact 1v1 is one seat. */
let _econBldDt=0, _econPayUsed=null;
function econAiSeat(slot){
  if(typeof AI==='undefined'||!AI.bases||!AI.bases.length) return null;
  if(slot==null) return AI.base||AI.bases[0];
  for(let i=0;i<AI.bases.length;i++) if(AI.bases[i].slot===slot) return AI.bases[i];
  return AI.base||AI.bases[0];
}
function econAiBuildingSlot(B){
  if(!B) return 0;
  if(B.aiBaseSlot!=null) return B.aiBaseSlot;
  if(typeof AI==='undefined'||!AI.bases||!AI.bases.length) return 0;
  let best=AI.bases[0],bd=1e18;
  for(const S of AI.bases){ const d=dist2(B.x,B.y,S.x,S.y); if(d<bd){bd=d;best=S;} }
  return best.slot;
}
function econMirrorAiBanks(){
  if(typeof AI==='undefined'||!AI.bases||!AI.bases.length) return;
  let m=0,e=0,mc=0,ec=0;
  for(const S of AI.bases){ m+=S.mass||0; e+=S.energy||0; mc+=S.mcap||MCAP0; ec+=S.ecap||ECAP0; }
  resM[1]=m; resE[1]=e; RES_MCAP[1]=mc; RES_ECAP[1]=ec;
}
function econPayAiSeat(slot,m,e){
  const S=econAiSeat(slot);
  if(!S) return false;
  if((S.mass||0)<m||(S.energy||0)<e) return false;
  S.mass=(S.mass||0)-m; S.energy=(S.energy||0)-e;
  econMirrorAiBanks();
  return true;
}
function econNearPay(a,b){
  const s=Math.abs(a)+Math.abs(b);
  return Math.abs(a-b)<=(s>1?s*1e-4:1e-6);
}
function econExpectedAiPay(B,dt){
  if(!B||B.team!==1) return null;
  if(B.prog<1){
    const T=BT[B.type]; if(!T) return null;
    const tractor=B.tractorT>0?1+.22*Math.min(2,B.tractorN||1):1;
    const bs=(typeof aiBuildMult!=='undefined'?aiBuildMult:1)*tractor;
    const nextProg=Math.min(1,B.prog+dt*bs/T.bt);
    const paidM=B.buildPaidM==null?T.cm:B.buildPaidM, paidE=B.buildPaidE==null?T.ce:B.buildPaidE;
    return {m:Math.max(0,T.cm*nextProg-paidM),e:Math.max(0,T.ce*nextProg-paidE)};
  }
  if(B.type==='techlab'&&B.res>=0&&typeof RESEARCH!=='undefined'){
    const R=RESEARCH[B.res]; if(!R) return null;
    const frac=dt/R.t; return {m:R.cm*frac,e:R.ce*frac};
  }
  if(B.queue&&B.queue.length&&typeof TYPES!=='undefined'){
    const t=B.queue[0],T=TYPES[t]; if(!T||!T.bt) return null;
    const tractor=B.tractorT>0?1+.22*Math.min(2,B.tractorN||1):1;
    const facSpeed=(typeof factionDoctrineBuildSpeedMul==='function')?factionDoctrineBuildSpeedMul(1):1;
    const fort=(typeof fortOf==='function')?fortOf(1).prod:1;
    const speed=(typeof aiBuildMult!=='undefined'?aiBuildMult:1)*facSpeed*(1+0.12*Math.min(2,B.adj||0))*fort*tractor;
    const frac=dt*speed/T.bt;
    const facCost=(typeof factionDoctrineUnitCost==='function')?factionDoctrineUnitCost(T,1):{m:T.cm,e:T.ce};
    return {m:facCost.m*frac,e:facCost.e*frac};
  }
  return null;
}
function econInferAiPaySlot(m,e){
  if(typeof AI!=='undefined'&&AI.econPaySlot!=null) return AI.econPaySlot;
  const fallback=(typeof AI!=='undefined'&&AI.base&&AI.base.slot!=null)?AI.base.slot:0;
  if(typeof blds==='undefined'||!(_econBldDt>0)) return fallback;
  /* Walk blds in the same order bldTick pays, so two factories streaming the
     same chassis debit their own seats rather than the first match in bldLive. */
  for(let b=0;b<blds.length;b++){
    const B=blds[b];
    if(!B.alive||B.team!==1||(_econPayUsed&&_econPayUsed.has(B))) continue;
    const exp=econExpectedAiPay(B,_econBldDt);
    if(!exp||!econNearPay(exp.m,m)||!econNearPay(exp.e,e)) continue;
    if(_econPayUsed) _econPayUsed.add(B);
    return econAiBuildingSlot(B);
  }
  return fallback;
}
function payStream(team,m,e,slot){
  if(team===1&&typeof AI!=='undefined'&&AI.bases&&AI.bases.length){
    if(slot==null) slot=econInferAiPaySlot(m,e);
    return econPayAiSeat(slot,m,e);
  }
  if(resM[team]>=m && resE[team]>=e){
    resM[team]-=m; resE[team]-=e;
    if(team===0){ mSpendAcc+=m; eSpendAcc+=e; }
    return true;
  }
  return false;
}
function canAfford(team,m,e,slot){
  if(team===1&&typeof AI!=='undefined'&&AI.bases&&AI.bases.length){
    const S=econAiSeat(slot);
    return !!S&&(S.mass||0)>=m&&(S.energy||0)>=e;
  }
  return resM[team]>=m && resE[team]>=e;
}
function pay(team,m,e,slot){
  if(team===1&&typeof AI!=='undefined'&&AI.bases&&AI.bases.length){
    econPayAiSeat(slot,m,e); return;
  }
  resM[team]-=m; resE[team]-=e; if(team===0){ mSpendAcc+=m; eSpendAcc+=e; }
}
/* Construction is an economy stream, not a shop purchase. A small site escrow
   prevents unlimited foundation spam, then bldTick pays the remaining cost in
   exact proportion to progress. Keeping this in one helper also means player
   and AI construction can never drift into different payment rules again. */
const MF_BUILD_ESCROW_FRAC=0.02;
function buildStartCost(T){
  return {m:T.cm*MF_BUILD_ESCROW_FRAC,e:T.ce*MF_BUILD_ESCROW_FRAC};
}
function canStartBuild(team,T,slot){
  const c=buildStartCost(T); return canAfford(team,c.m,c.e,slot);
}
function beginBuild(team,type,x,y,rot,slot){
  const T=BT[type]; if(!T) return null;
  if(team===1&&slot==null&&typeof AI!=='undefined'&&AI.base) slot=AI.base.slot;
  const c=buildStartCost(T);
  if(!payStream(team,c.m,c.e,slot)) return null;
  const B=addBld(type,team,x,y,false,rot||0);
  B.buildPaidM=c.m; B.buildPaidE=c.e; B.buildStalled=false;
  if(team===1&&slot!=null) B.aiBaseSlot=slot;
  return B;
}
function drawEnergy(team,e){            // power weapons sip the grid; returns 0..1 satisfaction
  if(resE[team]>=e){ resE[team]-=e; if(team===0) eSpendAcc+=e; return 1; }
  const got=Math.max(0,resE[team]); resE[team]=0;
  if(team===0){ eSpendAcc+=got; stallE=0.8; }
  return e>0?got/e:1;
}

/* addBld only stamps dep/geo when dist2<9 (~3wu). Placement allows 34wu, and
   session restore rounds structure coords, so a finished Extractor can sit on
   a live node with dep=-1 and pay nothing. Repair here — not in sim.js —
   because income is this file's contract. Do not steal a node another live
   mex/geo already owns; depleted bound nodes stay bound (relocate, don't hop). */
function econNodeClaimed(kind,idx,except){
  if(idx<0) return false;
  for(const O of bldLive){
    if(O===except||!O.alive||O.type!==kind) continue;
    if(kind==='mex'?O.dep===idx:O.geo===idx) return true;
  }
  return false;
}
function econBindResourceNode(B){
  if(!B||!B.alive) return null;
  if(B.type==='mex'){
    if(B.dep>=0&&B.dep<deposits.length) return deposits[B.dep];
    let best=-1,bd=34*34;
    for(let d=0;d<deposits.length;d++){
      if(depositTier(deposits[d])<=0||econNodeClaimed('mex',d,B)) continue;
      const dd=dist2(B.x,B.y,deposits[d].x,deposits[d].y); if(dd<bd){bd=dd;best=d;}
    }
    if(best>=0){ B.dep=best; deposits[best].taken=true; B.rich=(deposits[best].initialTier||1)>=3; }
    return B.dep>=0&&B.dep<deposits.length?deposits[B.dep]:null;
  }
  if(B.type==='geo'){
    if(B.geo>=0&&B.geo<geysers.length) return geysers[B.geo];
    let best=-1,bd=34*34;
    for(let g=0;g<geysers.length;g++){
      if(geyserTier(geysers[g])<=0||econNodeClaimed('geo',g,B)) continue;
      const dd=dist2(B.x,B.y,geysers[g].x,geysers[g].y); if(dd<bd){bd=dd;best=g;}
    }
    if(best>=0){ B.geo=best; geysers[best].taken=true; }
    return B.geo>=0&&B.geo<geysers.length?geysers[B.geo]:null;
  }
  return null;
}
function econTickAiSeats(dt){
  /* One wallet per enemy commander. Mex/pgen/geo/fab/silo follow B.aiBaseSlot
     the same way ally buildings skip the player bank via B.allyAI. Compact
     1v1 is a single seat, so this is the old team-1 ledger with a name. */
  if(typeof AI==='undefined'||!AI.bases||!AI.bases.length) return false;
  for(const S of AI.bases){
    if(S.mass==null) S.mass=220;
    if(S.energy==null) S.energy=900;
    let mi=0.6, ei=2, silos=0, fabs=0;
    for(const B of bldLive){
      if(!B.alive||B.team!==1||B.prog<1) continue;
      if(econAiBuildingSlot(B)!==S.slot) continue;
      if(B.type==='hq'){ mi+=5.0; ei+=26; }
      if(B.type==='mex'){
        const D=econBindResourceNode(B), before=depositTier(D);
        if(before>0){
          const base=(B.lvl===3?11 : B.lvl===2?7 : 4)*(DEPOSIT_YIELD[before]||1);
          const raw=drainDeposit(D,base*dt);
          const got=raw*(typeof factionDoctrineNodeYieldMul==='function'?factionDoctrineNodeYieldMul(1):1);
          mi+=got/Math.max(dt,.0001);
          B.nodeTier=depositTier(D); B.nodeRemaining=D.remaining;
        } else { B.nodeTier=0; B.nodeRemaining=0; }
      }
      else if(B.type==='pgen') ei+= B.lvl===3?38 : B.lvl===2?24 : 14;
      else if(B.type==='geo'){
        const G=econBindResourceNode(B), before=geyserTier(G);
        if(before>0){
          const raw=drainGeyser(G,30*dt);
          const got=raw*(typeof factionDoctrineNodeYieldMul==='function'?factionDoctrineNodeYieldMul(1):1);
          ei+=got/Math.max(dt,.0001);
          B.nodeTier=geyserTier(G);B.nodeRemaining=G.remaining;
        }else{B.nodeTier=0;B.nodeRemaining=0;}
      }
      else if(B.type==='silo') silos++;
      else if(B.type==='fab') fabs++;
    }
    mi*=resPace; ei*=resPace;
    mi*=aiIncomeMult; ei*=aiIncomeMult;
    if(fabs){
      const thr=clamp((S.energy||0)/900,0,1);
      ei-=FAB_E*fabs*thr;
      mi+=FAB_M*fabs*thr;
    }
    S.mcap=MCAP0+600*silos; S.ecap=ECAP0+2000*silos;
    S.mass=Math.max(0,Math.min(S.mcap,S.mass+mi*dt));
    S.energy=Math.max(0,Math.min(S.ecap,S.energy+ei*dt));
  }
  econMirrorAiBanks();
  return true;
}
function econTick(dt){
  for(let team=0;team<2;team++){
    if(team===1&&econTickAiSeats(dt)) continue;
    /* The HQ is a working installation, not just a spawn point: it runs its own
       reactor and a small ore processor. That is what makes landing with NO
       other buildings a viable opening — you can fund your first Extractor
       from the carrier alone — and it makes losing the HQ hurt economically as
       well as strategically. */
    let mi=0.6, ei=2, silos=0, fabs=0, hq=0;
    for(const B of bldLive){
      if(!B.alive||B.team!==team||B.prog<1) continue;
      /* Allied AI installations own a virtual economy in ai.js. Counting their
         prebuilt reactors and extractors here would silently donate another
         player's entire income to the local commander. */
      if(team===0&&B.allyAI!=null)continue;
      if(B.type==='hq'){ mi+=5.0; ei+=26; hq++; }
      if(B.type==='mex'){
        const D=econBindResourceNode(B), before=depositTier(D);
        if(before>0){
          const base=(B.lvl===3?11 : B.lvl===2?7 : 4)*(DEPOSIT_YIELD[before]||1)*(team===0&&WC.veins?0.7:1);
          const raw=drainDeposit(D,base*dt);
          const got=raw*(typeof factionDoctrineNodeYieldMul==='function'?factionDoctrineNodeYieldMul(team):1);
          mi+=got/Math.max(dt,.0001);
          B.nodeTier=depositTier(D); B.nodeRemaining=D.remaining;
          if(team===0&&B.nodeTier!==before){
            if(B.nodeTier>0) toast('◇ PHASE FIELD DOWNGRADED — TIER '+B.nodeTier+' · '+Math.ceil(D.remaining)+' ore remains');
            else toast('◇ PHASE FIELD DEPLETED — relocate the Prospector or claim another node');
            sfx('notify',B.x,B.y,.72);
          }
        } else { B.nodeTier=0; B.nodeRemaining=0; }
      }
      else if(B.type==='pgen') ei+= B.lvl===3?38 : B.lvl===2?24 : 14;
      else if(B.type==='geo'){
        const G=econBindResourceNode(B), before=geyserTier(G);
        if(before>0){
          const raw=drainGeyser(G,30*dt);
          const got=raw*(typeof factionDoctrineNodeYieldMul==='function'?factionDoctrineNodeYieldMul(team):1);
          ei+=got/Math.max(dt,.0001);
          B.nodeTier=geyserTier(G);B.nodeRemaining=G.remaining;
          if(team===0&&B.nodeTier!==before){
            if(B.nodeTier>0)toast('✦ GEOTHERMAL FIELD DOWNGRADED — TIER '+B.nodeTier+' · '+Math.ceil(G.remaining)+' energy remains');
            else toast('✦ GEOTHERMAL FIELD DEPLETED — claim another vent or build reactors');
            sfx('notify',B.x,B.y,.72);
          }
        }else{B.nodeTier=0;B.nodeRemaining=0;}
      }
      else if(B.type==='silo') silos++;
      else if(B.type==='fab') fabs++;
    }
    RES_MCAP[team]=MCAP0+600*silos;
    RES_ECAP[team]=ECAP0+2000*silos;
    /* COMEBACK FLOOR — the difference between behind and locked out.
       A player who loses their HQ but keeps their Commander earned 0.6 mass a
       second. A Constructor costs 35: that is a minute of income to place one
       building, with the AI's threat clock still arriving on schedule. And
       checkVictory will not end the match either, because the Commander is
       alive — so the player sat in a game they could not win and could not
       leave without forfeiting the payout. That is not a losing position, it
       is a locked door.
       Player only (the AI has its own difficulty knobs), HQ-less only, and it
       switches off above a small reserve — so it funds a rebuild and never an
       army, and a player who is merely losing a fight never sees it. */
    if(team===0&&!hq&&resM[0]<420){ mi+=7; ei+=22; }
    mi*=resPace; ei*=resPace;                              // session resource pace
    /* PRIORITY SUPPLY booster: the player's income only, never the AI's. */
    if(team===0&&typeof boostMul==='function'){ const b=boostMul('res'); mi*=b; ei*=b; }
    if(team===1){ mi*=aiIncomeMult; ei*=aiIncomeMult; }
    else { ei*=resEnergyMult; }
    // Fabricators convert surplus energy into mass, throttling as the grid drains
    if(fabs){
      const thr=clamp(resE[team]/900,0,1);
      ei-=FAB_E*fabs*thr;
      mi+=FAB_M*fabs*thr;
    }
    const nm=resM[team]+mi*dt;
    if(team===0 && nm>RES_MCAP[0]) mWasted+=nm-RES_MCAP[0];
    resM[team]=Math.max(0,Math.min(RES_MCAP[team],nm));
    resE[team]=Math.max(0,Math.min(RES_ECAP[team],resE[team]+ei*dt));
    if(team===0){ mRate=mi; eRate=ei; }
  }
  spendT+=dt;                                            // smoothed expense readout
  if(spendT>=0.5){ mSpend=mSpendAcc/spendT; eSpend=eSpendAcc/spendT; mSpendAcc=0; eSpendAcc=0; spendT=0; }
  if(stallM>0) stallM-=dt;
  if(stallE>0) stallE-=dt;
  stats.t+=dt;
}

// ---------- player build placement (BAR-style snap grid) ----------
let placing=null;      // {type, x, y, rx, ry, rot}  rx/ry = raw drag position
let lastPlaceRot=0;    // sticky facing — chain walls and rows without re-aiming
/* Rotation snaps to quarter turns. Free rotation looked flexible but was
   actively harmful: a footprint at 22.5 degrees can't align to the build grid,
   can't tile flush against its neighbours, and can't have its foundation
   painted as whole cells. Ninety-degree steps make every structure agree with
   the grid, which is what lets bases be DESIGNED rather than scattered. */
const PLACE_STEP=Math.PI/2;
function rotatePlacement(dir){
  if(!placing) return;
  // quantise so repeated presses can never accumulate drift off the grid
  placing.rot=Math.round(((placing.rot||0)+dir*PLACE_STEP)/PLACE_STEP)*PLACE_STEP;
  lastPlaceRot=placing.rot;
  snapPlace();                 // re-snap: a quarter turn changes the footprint
  updatePlaceRotUI();
  sfx('ui');
}
function updatePlaceRotUI(){
  const el=document.getElementById('placeRotDeg');
  if(el&&placing) el.textContent=(Math.round(((placing.rot||0)*180/Math.PI)%360+360)%360)+'°';
}
const SNAP=SNAP_GRID;          // placement snaps to the same grid the build zone is drawn on
function snapPlace(){
  if(!placing) return;
  let x=placing.rx, y=placing.ry;
  // 1) magnet to deposits for extractors / geysers for geo plants
  if(placing.type==='mex'){
    const d=depositAt(x,y,70);
    if(d>=0){ placing.x=deposits[d].x; placing.y=deposits[d].y; return; }
  }
  if(placing.type==='geo'){
    const g=geyserAt(x,y,70);
    if(g>=0){ placing.x=geysers[g].x; placing.y=geysers[g].y; return; }
  }
  // 2) axis-align with nearby friendly structures (row/column building)
  let ax=null, ay=null, bxd=28, byd=28;
  for(const B of bldLive){
    if(!B.alive||B.team!==0) continue;
    if(dist2(x,y,B.x,B.y)>260*260) continue;
    const dx=Math.abs(B.x-x), dy=Math.abs(B.y-y);
    if(dx<bxd){ bxd=dx; ax=B.x; }
    if(dy<byd){ byd=dy; ay=B.y; }
  }
  /* 3) snap to the build grid, CENTRED ON THE FOOTPRINT.
     A structure whose footprint spans an even number of cells has to sit on a
     cell BOUNDARY for its edges to land on grid lines; an odd span has to sit
     on a cell CENTRE. Snapping the centre blindly to the grid put half of them
     permanently half a cell out of alignment. */
  const f=bldFoot(placing.type), rot=placing.rot||0;
  const swap=(Math.round(rot/(Math.PI/2))&1)===1;
  const fw=swap?f[1]:f[0], fh=swap?f[0]:f[1];
  const cellsX=Math.max(1,Math.round(fw/SNAP)), cellsY=Math.max(1,Math.round(fh/SNAP));
  const offX=(cellsX&1)?0:SNAP*0.5, offY=(cellsY&1)?0:SNAP*0.5;
  x = ax!==null? ax : Math.round((x-offX)/SNAP)*SNAP+offX;
  y = ay!==null? ay : Math.round((y-offY)/SNAP)*SNAP+offY;
  placing.x=clamp(x,40,MAP-40); placing.y=clamp(y,40,MAP-40);
  if(typeof battlefieldClampPoint==='function'){
    const edgePad=Math.hypot(fw,fh)*.5+8,p=battlefieldClampPoint(placing.x,placing.y,edgePad);
    placing.x=p[0];placing.y=p[1];
  }
}
function startPlacing(type){
  // pull back to a framing where the build grid is legible, if we're very close
  if(orthoSpan<620){ orthoSpan=distTarget=760; }
  clampCam(); camUpdateMatrices();
  const [wx,wy]=s2w(VW/2,VH*0.42);
  /* Facing carries over between placements, so laying a whole wall run or a row
     of aligned factories doesn't mean re-aiming every single one. */
  placing={type, x:0, y:0, rx:clamp(wx,40,MAP-40), ry:clamp(wy,40,MAP-40), rot:lastPlaceRot};
  snapPlace();
  document.getElementById('placeUI').style.display='flex';
  document.getElementById('buildMenu').style.display='none';
  document.body.classList.add('uiPlacing');
  updatePlaceRotUI();
  toast('Drag the ghost or tap a spot · ⟳ to rotate · ✓ to build');
}
function placementHasShoreAccess(type,x,y,rot){
  if(type!=='harbor')return true;
  const f=bldFoot(type),reach=Math.max(f[0],f[1])*.5;
  for(let a=0;a<TAU;a+=Math.PI/8){
    for(const d of [reach+18,reach+42,reach+68]){
      const wx=x+Math.cos(a)*d,wy=y+Math.sin(a)*d;
      if(isWalkable(wx,wy)&&inBuildRange(wx,wy,0))return true;
    }
  }
  return false;
}
function placementValid(){
  if(!placing) return false;
  const T=BT[placing.type];
  if(typeof battlefieldContains==='function'){
    const f=bldFoot(placing.type),edgePad=Math.hypot(f[0],f[1])*.5+8;
    if(!battlefieldContains(placing.x,placing.y,edgePad))return false;
  }
  if(!canStartBuild(0,T)) return false;
  if(placing.type==='mex'){
    return depositAt(placing.x,placing.y,34)>=0;
  }
  if(placing.type==='geo'){
    return geyserAt(placing.x,placing.y,34)>=0;
  }
  // everything except resource claims must sit inside your construction zone
  if(!inBuildRange(placing.x,placing.y,0)) return false;
  if(T.placement==='water'){
    if(typeof battlefieldNavalEnabled!=='function'||!battlefieldNavalEnabled())return false;
    if(!footOnWater(placing.type,placing.x,placing.y,placing.rot||0))return false;
    if(!placementHasShoreAccess(placing.type,placing.x,placing.y,placing.rot||0))return false;
  }else if(!footOnLand(placing.type,placing.x,placing.y,placing.rot||0)) return false;
  // no overlapping footprints — rectangles must not intersect, at any facing
  if(footBlocked(placing.type,placing.x,placing.y,placing.rot||0)) return false;
  // ruins occupy ground too: raze them before you build over them
  for(const Rc of relics){
    if(Rc.alive && obbHit(placing.x,placing.y,bldFoot(placing.type)[0],bldFoot(placing.type)[1],placing.rot||0,
                          Rc.x,Rc.y,Rc.w,Rc.h,Rc.a,4)) return false;
  }
  for(const D of deposits){
    if(!D.taken && dist2(placing.x,placing.y,D.x,D.y)<(T.r+18)*(T.r+18)) return false;
  }
  return true;
}
function confirmPlace(){
  if(!placing) return;
  const T=BT[placing.type];
  if(!placementValid()){
    const site=buildStartCost(T);
    if(!canAfford(0,site.m,site.e)) toast(resM[0]<site.m?('Need '+site.m+' mass to establish this site ('+Math.floor(resM[0])+' stored)'):('Need '+site.e+' energy to establish this site ('+Math.floor(resE[0])+' stored)'));
    else if(placing.type==='mex') toast('Place extractors on a ◆ deposit');
    else if(placing.type==='geo') toast('Place Geo Plants on a ✦ geyser');
    else if(!inBuildRange(placing.x,placing.y,0)) toast('⬡ Outside command territory — stay inside the HQ grid or research a Targeting Array relay');
    else if(T.placement==='water'&&(typeof battlefieldNavalEnabled!=='function'||!battlefieldNavalEnabled()))
      toast('✕ NAVAL UNAVAILABLE — this battlefield has no connected ocean or river domain');
    else if(T.placement==='water'&&!footOnWater(placing.type,placing.x,placing.y,placing.rot||0))
      toast('⚓ Entire footprint must sit in the connected navigable water domain');
    else if(T.placement==='water'&&!placementHasShoreAccess(placing.type,placing.x,placing.y,placing.rot||0))
      toast('⚓ Harbor needs a nearby friendly shoreline inside your build zone');
    else if(footBlocked(placing.type,placing.x,placing.y,placing.rot||0))
      toast('⬛ Footprints overlap — nudge it clear or rotate with ⟳');
    else toast('Blocked terrain — find open, flat ground clear of structures');
    return;
  }
  if(placing.type==='mex'){
    const d=depositAt(placing.x,placing.y,34);
    placing.x=deposits[d].x; placing.y=deposits[d].y;
    deposits[d].taken=true;
  }
  if(placing.type==='geo'){
    const g=geyserAt(placing.x,placing.y,34);
    placing.x=geysers[g].x; placing.y=geysers[g].y;
    geysers[g].taken=true;
  }
  const B=beginBuild(0,placing.type,placing.x,placing.y,placing.rot||0);
  /* placementValid checked the escrow immediately before this call. The guard
     still protects against another system spending the last resource in the
     same input frame. Do not claim a node if the site did not start. */
  if(!B){
    if(placing.type==='mex'){
      const d=depositAt(placing.x,placing.y,34); if(d>=0) deposits[d].taken=false;
    }
    if(placing.type==='geo'){
      const g=geyserAt(placing.x,placing.y,34); if(g>=0) geysers[g].taken=false;
    }
    toast('Construction site could not reserve resources — try again');
    return;
  }
  flashBuildZone();                       // show how the territory just grew
  stats.built[0]++;
  if(typeof radioAck==='function')radioAck('build',1,placing.x,placing.y);else sfx('ui');
  buzz(18); toast(T.name+' under construction');
  if(placing.type==='wall'||placing.type==='gate'){   // chain-laying: stay in placement mode
    /* Advance along the wall's own facing, not blindly east, so a rotated run
       keeps running in the direction you actually pointed it. */
    const px2=placing.x, py2=placing.y, rt=placing.rot||0, ty=placing.type;
    const step=bldFoot(ty)[0]+2;
    startPlacing(ty);
    placing.rot=rt;
    placing.rx=clamp(px2+Math.cos(rt)*step,40,MAP-40);
    placing.ry=clamp(py2+Math.sin(rt)*step,40,MAP-40);
    snapPlace(); updatePlaceRotUI();
    toast('🧱 Placed — keep tapping to extend the curtain · ⟳ turns the run');
    return;
  }
  /* Every structure, not only walls, keeps the selected placement tool armed.
     The player exits intentionally with Cancel instead of returning to a menu
     after every factory, generator, or defensive building. */
  const px2=placing.x, py2=placing.y, rt=placing.rot||0, ty=placing.type;
  const foot=bldFoot(ty),step=Math.max(foot[0],foot[1])+8;
  startPlacing(ty);
  placing.rot=rt;
  placing.rx=clamp(px2+Math.cos(rt)*step,40,MAP-40);
  placing.ry=clamp(py2+Math.sin(rt)*step,40,MAP-40);
  snapPlace(); updatePlaceRotUI();
  toast('PLACED '+T.name.toUpperCase()+' — placement remains active · tap another site or cancel');
  return;
}
function cancelPlace(){
  placing=null;
  document.getElementById('placeUI').style.display='none';
  document.body.classList.remove('uiPlacing');
}
/* sim.js bldTick pays with payStream(team,m,e) and no seat. Wrap it so this
   frame's dt is visible to econInferAiPaySlot. Do not copy the tick body. */
if(typeof bldTick==='function'&&!bldTick._econSeatWrap){
  const _econBldTick=bldTick;
  bldTick=function(dt){
    _econBldDt=dt; _econPayUsed=new Set();
    _econBldTick(dt);
    _econPayUsed=null;
  };
  bldTick._econSeatWrap=true;
}

