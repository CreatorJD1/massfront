;
;
/* ============================================================
   AI SKIRMISH OPPONENT — selectable enemy factions
   ============================================================ */
let AI={ base:{x:MAP*SP_HI,y:MAP*SP_LO}, bases:[], allies:[], t:0, wave:1, waveTimer:60, buildTimer:2, state:'grow', diff:1,
         harassTimer:90, techTimer:240, waveUnits:[], waveSize0:0, retreated:false, fac:'legion',buildCursor:0,waveCursor:0 };

/* Per-slot AI doctrine. These are authored rules rather than personality text:
   setup, construction, production, wave pacing and allied reinforcement all
   consume the same key. Naval is gated from dry maps at setup time. */
const AI_BEHAVIOR_TYPES=Object.freeze({
  balanced:{nm:'BALANCED',em:'◈',ds:'Mixed forces, economy and adaptable counters.'},
  land:{nm:'LAND',em:'⬡',ds:'Ground vehicles, bots and direct land-route pushes.'},
  air:{nm:'AIR',em:'✦',ds:'Airfields, fighters and bombers contest the skies.'},
  naval:{nm:'NAVAL',em:'⚓',ds:'Harbors, fleets and water-domain supremacy.'},
  rush:{nm:'RUSH',em:'»',ds:'Cheap early pressure with shorter attack cycles.'},
  turtle:{nm:'TURTLE',em:'⬢',ds:'Fortifications, shields, repairs and counterattacks.'}
});
function aiBehaviorAvailable(key){
  if(key!=='naval')return !!AI_BEHAVIOR_TYPES[key];
  const D=typeof MAPDEFS!=='undefined'&&typeof curMap!=='undefined'?MAPDEFS[curMap]:null;
  return !!(D&&D.navalEnabled);
}
function aiBehaviorKey(key){return AI_BEHAVIOR_TYPES[key]&&aiBehaviorAvailable(key)?key:'balanced';}
function aiBehaviorDef(key){return AI_BEHAVIOR_TYPES[aiBehaviorKey(key)];}
function aiBehaviorUnitPool(key,tier,facility){
  key=aiBehaviorKey(key);
  if(facility==='airfield')return key==='air'?[5,17,5,17,25]:[5,17];
  if(facility==='harbor')return key==='naval'?(AI.t>260?[14,14,15]:[14,14,14]):[14,15];
  if(key==='land')return tier===2?[1,2,3,7,16,20,21,22,27]:[0,1,9,10,19];
  if(key==='air')return tier===2?[0,9,10,19,23,24]:[0,9,10,19];
  if(key==='naval')return tier===2?[0,1,10,19,20,24]:[0,9,10,19];
  if(key==='rush')return tier===2?[0,0,1,9,9,18,21]:[0,0,0,1,9,9];
  if(key==='turtle')return tier===2?[1,2,10,19,20,23,24,27]:[1,9,10,19,24];
  return null;
}

/* FACTION BIAS IS A READER, NOT FLAVOUR.
   FACTIONS[k].bias used to be dead data: design/design.json exported the
   weights, the comment claimed they made Legion feel different from Syndicate,
   and production at the factory loop below ignored them in favour of three
   hardcoded pools that disagreed (Legion's table weights Harbinger 1.8; the
   pool was [1,2,2,16,3] and could never roll it). Tuning a table nobody reads
   is how identity silently dies. Weighted pick from the LEGAL roster is the
   cheap wire — arsenal filter still owns "can this faction build it", bias
   only reweights what already passed. */
function aiFactionBias(){
  const F=typeof FACTIONS!=='undefined'&&FACTIONS[AI.fac];
  return F&&F.bias||null;
}
function aiWeightedPick(pool,bias){
  if(!pool||!pool.length) return -1;
  if(!bias) return pool[Math.random()*pool.length|0];
  let tot=0;
  const w=new Array(pool.length);
  for(let i=0;i<pool.length;i++){
    const b=bias[pool[i]];
    w[i]=b>0?b:1;
    tot+=w[i];
  }
  let r=Math.random()*tot;
  for(let i=0;i<pool.length;i++){ r-=w[i]; if(r<=0) return pool[i]; }
  return pool[pool.length-1];
}
function aiFactionBiasOverride(legal){
  const b=aiFactionBias();
  if(!b||!legal||!legal.length) return -1;
  const themed=legal.filter(t=>b[t]>0&&TYPES[t]&&TYPES[t].bt>0);
  if(!themed.length) return -1;
  return aiWeightedPick(themed,b);
}

const FACTIONS={
  legion:   {nm:'Red Ascendancy',  em:'🔺', art:'ascendancy',
             col:[255,120,90],  colB:[255,93,67],
             ds:'Heavy armor columns and siege engines',
             income:1.0, waveMul:1.12, buildMul:1.0,
             // look: broad, heavy, hard-edged — slabs of moving iron
             /* Each faction gets a genuinely different chassis kit, not just a
                recolour: Legion fields the standard tracked line with extra
                applique armour, so it reads as HEAVY. */
             scale:1.14, squash:0.94, tilt:0, glow:[255,110,70], glowA:26, trim:'plate',
             kit:'legion', hull:[196,178,168], liv:[255,120,90],
             /* A hero the faction fields instead of a plain Commander, and a
                theme that biases what it builds. This is what makes fighting
                the Legion feel different from fighting the Syndicate beyond the
                colour of the tracers. */
             /* Keys are TYPES indices. aiFactionBiasOverride reads this on
                every empty factory / airfield roll. T1 factories only see
                Rhino (1) from this map — 2/3/16/27 are T2 — which is why 1 is
                listed: without it the table is unread until the first T2 plant. */
             hero:28, heroNm:'Lord Darion Vex',
             theme:'siege', bias:{1:1.6, 3:1.9, 16:2.2, 27:1.8, 2:1.4}},
  /* Recoloured to match the supplied art: the Coalition is green and the brood
     is violet. The two had those palettes the other way round, which would have
     made every crest disagree with the army wearing it. */
  syndicate:{nm:'Syndicate Coalition', em:'🜁', art:'syndicate',
             col:[150,235,95],  colB:[110,215,60],
             ds:'Air superiority and lightning raids',
             income:1.0, waveMul:0.92, buildMul:1.0,
             // look: slim, raked-forward, haloed in void light
             // Syndicate hovers: no treads at all, raked hulls, energy glow
             scale:0.93, squash:1.12, tilt:0.1, glow:[140,240,90], glowA:52, trim:'halo',
             kit:'syndicate', hull:[162,180,158], liv:[150,235,95],
             hero:29, heroNm:'Broker Lys Renn',
             theme:'raid', bias:{25:2.4, 17:2.0, 5:1.8, 23:1.6}},
  horde:    {nm:'Umbral Brood',    em:'🐛', art:'horde',
             col:[186,120,255],  colB:[150,80,235],
             ds:'Endless cheap swarms and ravager packs',
             /* Brood hatch speed is already applied by factiondoctrine.js.
                A second 1.25 multiplier here stacked to 1.56x factory speed
                before cost/income bonuses and overwhelmed every equivalent
                Normal opponent. Keep the AI layer neutral and tune the single
                player-visible doctrine instead. */
             income:0.92, waveMul:0.82, buildMul:1.0,
             // look: small, jittering, sickly bio-luminescent
             // Horde is grown, not built: carapace and claws over machinery
             scale:0.86, squash:1.0, tilt:0, glow:[172,90,255], glowA:38, trim:'spore',
             kit:'horde', hull:[142,116,168], liv:[186,120,255],
             hero:30, heroNm:'The Brood Sovereign',
             theme:'swarm', bias:{0:2.6, 9:2.0, 21:1.8}},
};
let aiFactionSel='random';
/* WHICH FACTION, DECIDED ONCE AND EARLY.
   This used to be rolled inside aiSetup(), which runs late in match setup — and
   two things that run BEFORE it already read AI.fac: the enemy commander spawn
   (so you could face the Ascendancy commanded by a Brood Sovereign) and now the
   hive seeding, which needs to know whether the infestation is this match's
   army or just wildlife. Resolving it up front fixes both, and the flag stops
   aiSetup re-rolling a choice that has already been made and acted on. */
let aiFacPicked=false;
function aiPickFaction(){
  /* enemyFactions() is the opponent picker (Nova legal, Brood AI-only as a
     player). Fall back to the three original rows if factions.js has not
     loaded — this function can run from a save restore during boot. */
  const pool=(typeof enemyFactions==='function'?enemyFactions():['nova','legion','syndicate','horde'])
    .filter(k=>typeof FACTIONS!=='undefined'&&FACTIONS[k]);
  const keys=pool.length?pool:['legion','syndicate','horde'];
  let fac=aiFactionSel==='random'?keys[Math.random()*keys.length|0]:aiFactionSel;
  if(!FACTIONS[fac]) fac=keys[0]||'legion';
  AI.fac=fac;
  aiFacPicked=true;
  return AI.fac;
}
let mmECol='#ff5d43', mmEColA='rgba(255,93,67,.9)';
/* The neutral wildlife palette, kept so team 2 can be restored when the hive is
   NOT the opponent's army. */
const WILD_C=[235,235,220], WILD_B=[255,177,58];

function aiSetup(diff,bases,allies){
  AI.diff=diff; AI.t=0; AI.wave=1; AI.buildTimer=3; AI.state='grow';
  AI.bases=Array.isArray(bases)&&bases.length?bases:[{x:MAP*SP_HI,y:MAP*SP_LO,diff}];
  AI.allies=Array.isArray(allies)?allies:[];
  AI.base=AI.bases[0]; AI.buildCursor=0; AI.waveCursor=0;
  if(!aiFacPicked) aiPickFaction();
  aiFacPicked=false;                       // consumed; next match picks again
  const F=FACTIONS[AI.fac];
  /* The FIRST wave is the one that decides whether a new player ever gets a
     base up. Easy now gets a genuine opening — nearly three minutes before the
     first attack, and no economic harassment for four — instead of the same
     95-second clock Normal runs on. */
  /* FIRST CONTACT IS A CONTRACT. The old sqrt(lanes) divisor let two Normal
     commanders attack about fifty seconds after touchdown. Faction cadence,
     Blitz and Fortress begin after each lane has introduced itself. */
  AI.openingGrace=typeof deploymentGraceSeconds==='function'?deploymentGraceSeconds(diff):[180,120,75][diff];
  AI.openingLanes=Math.max(1,AI.bases.length);
  AI.waveTimer=AI.openingGrace;
  AI.harassTimer=AI.openingGrace+60; AI.techTimer=240;
  AI.waveUnits=[]; AI.waveSize0=0; AI.retreated=false; AI.warned=false; AI.warnBase=null; AI.warnTarget=null;
  aiWaveDirty();
  AI.ambushQ=[]; AI.ambushCool=0; AI.peelSnap=[];
  AI.defend=null; AI.recallSnap=[]; AI.recallCool=0; AI.defendSent=false;
  AI.thr=1;
  /* AI is a module-level singleton that outlives a match. stall accumulates
     while a wave is under strength; carrying a saturated value into the next
     match makes the wave-release check pass immediately, so from match two
     onward the AI threw its first wave in undersized and lost it. */
  AI.stall=0;
  /* Per-base wallets copy the ally pattern (virtual mass/energy on the seat).
     Spawn already seeds 220/900; keep that opening bank if present so a
     Compact 1v1 does not start poorer than it did on the shared team ledger. */
  for(const S of AI.bases){
    if(S.mass==null) S.mass=220;
    if(S.energy==null) S.energy=900;
    if(S.mcap==null) S.mcap=MCAP0;
    if(S.ecap==null) S.ecap=ECAP0;
  }
  if(typeof econMirrorAiBanks==='function') econMirrorAiBanks();
  /* These four are recomputed from the threat clock on the first aiTick, one
     frame from now. They were previously seeded here from a SECOND copy of the
     difficulty table that had already drifted out of step with the real one
     (income read [0.8,1.15,1.6] here against [0.75,1.0,1.25] there), so the
     numbers a reader found first were not the numbers the match ran on. Seed
     them neutral instead: they only have to be defined, not tuned. */
  aiIncomeMult=1; aiBuildMult=1; aiDmgMult=1; aiHpMult=1;
  TEAMC[1][0]=F.col[0]; TEAMC[1][1]=F.col[1]; TEAMC[1][2]=F.col[2];
  TEAMB[1][0]=F.colB[0]; TEAMB[1][1]=F.colB[1]; TEAMB[1][2]=F.colB[2];
  mmECol='rgb('+F.colB[0]+','+F.colB[1]+','+F.colB[2]+')';
  mmEColA='rgba('+F.colB[0]+','+F.colB[1]+','+F.colB[2]+',.9)';
  /* Re-run the player's livery now that the enemy's is known: the same-faction
     matchup can only be resolved once both sides have been painted, and this
     has to come AFTER the minimap colours or the contrast shift is overwritten
     by the line that set them. */
  if(typeof applyColor==='function') applyColor();
  /* THE SWARM WEARS THE BROOD'S COLOURS WHEN IT IS THE BROOD'S SWARM.
     Team 2 rendered a neutral off-white regardless, so fighting the Umbral
     Brood meant facing a violet army standing next to a beige one that was
     also theirs. The hive is their army — the crest, the commander art and the
     units are all the same violet, and the bugs should be too. Against any
     other faction the wildlife goes back to neutral, because then it genuinely
     is a third party. */
  const brood = AI.fac==='horde';
  const H=FACTIONS.horde;
  TEAMC[2][0]=brood?H.col[0]:WILD_C[0];  TEAMC[2][1]=brood?H.col[1]:WILD_C[1];  TEAMC[2][2]=brood?H.col[2]:WILD_C[2];
  TEAMB[2][0]=brood?H.colB[0]:WILD_B[0]; TEAMB[2][1]=brood?H.colB[1]:WILD_B[1]; TEAMB[2][2]=brood?H.colB[2]:WILD_B[2];
  toast(F.em+' Enemy faction: '+F.nm+' — '+F.ds);
}
/* Shared-control allied AI. Allies use the player's team for real friendliness
   (weapons, shields, repair and fog all agree) but own a small virtual economy
   and only issue orders to units tagged with their slot. The player may still
   override those units; the director only retasks an idle unit. */
function aiAllyTick(dt){
  if(!AI.allies||!AI.allies.length)return;
  for(const A of AI.allies){
    A.mass=Math.min(1400,(A.mass||0)+dt*(4.4+A.diff*1.6));
    A.energy=Math.min(6200,(A.energy||0)+dt*(22+A.diff*9));
    A.spawnT=(A.spawnT||0)-dt;A.orderT=(A.orderT||0)-dt;
    let live=typeof populationUsedForCommander==='function'?populationUsedForCommander(A.slot):0;
    if(!live){
      for(let i=0;i<unitHigh;i++)if(ualive[i]&&uteam[i]===0&&uAllyBase[i]===A.slot)live++;
    }
    const behavior=aiBehaviorKey(A.behavior),targetMul=behavior==='rush'?1.18:behavior==='land'?1.10:behavior==='turtle'?.78:behavior==='air'?.92:1;
    const target=Math.round([18,30,44][A.diff]*targetMul);
    if(A.spawnT<=0&&live<target&&populationCanSpawn(0,0,A.slot)){
      const F=bldLive.find(B=>B.alive&&B.team===0&&B.allyAI===A.slot&&B.type==='fac');
      if(F){
        const facility=behavior==='air'?'airfield':behavior==='naval'?'harbor':'fac';
        let pool=aiBehaviorUnitPool(behavior,A.diff>0?2:1,facility)||
          (A.diff>1?[0,1,9,10,18,20,21,24]:A.diff?[0,1,9,10,18,24]:[0,0,1,9]);
        /* Doctrine filtering has to receive the virtual facility being used.
           Passing `fac` here silently replaced Naval and Air pools with ground
           units, so the setup label and the battlefield doctrine disagreed. */
        if(typeof factionDoctrineRoster==='function')pool=factionDoctrineRoster(pool,facility,0).filter(t=>TYPES[t]&&TYPES[t].bt>0);
        if(!pool.length)pool=[0];
        const t=pool[Math.random()*pool.length|0]||0,T=TYPES[t];
        if(A.mass>=T.cm&&A.energy>=T.ce){
          const i=spawnUnit(t,0,F.x+rr(-18,18),F.y+F.r+20,A.slot);
          if(i>=0){A.mass-=T.cm;A.energy-=T.ce;uAllyBase[i]=A.slot;ustate[i]=2;utx[i]=A.x+rr(-90,90);uty[i]=A.y+rr(-90,90);}
        }
      }
      const cadence=behavior==='rush'?.64:behavior==='turtle'?1.3:behavior==='air'?.92:1;
      A.spawnT=(Math.max(5,13-A.diff*2)+Math.random()*5)*cadence;
    }
    if(A.orderT<=0){
      A.orderT=4.5;
      for(let i=0;i<unitHigh;i++){
        if(!ualive[i]||uteam[i]!==0||uAllyBase[i]!==A.slot||ustate[i]!==0)continue;
        const hero=TYPES[utype[i]].cat==='hero',e=findEnemy(ux[i],uy[i],0,hero?300:520);
        if(e>=0){ustate[i]=2;utx[i]=ux[e];uty[i]=uy[e];}
        else if(hero||behavior==='turtle'){ustate[i]=2;utx[i]=A.x+rr(-100,100);uty[i]=A.y+rr(-100,100);}
        else if(AI.t>AI.openingGrace*(behavior==='rush'?.55:1)){ustate[i]=2;utx[i]=AI.base.x+rr(-130,130);uty[i]=AI.base.y+rr(-130,130);}
      }
    }
  }
}
function aiUseBase(kind){
  if(!AI.bases||!AI.bases.length) return AI.base;
  const key=kind==='wave'?'waveCursor':'buildCursor';
  const B=AI.bases[AI[key]++%AI.bases.length];
  AI.base=B||AI.base; return AI.base;
}
function aiSeat(slot){
  if(slot==null) return AI.base;
  if(!AI.bases) return AI.base;
  for(let i=0;i<AI.bases.length;i++) if(AI.bases[i].slot===slot) return AI.bases[i];
  return AI.base;
}
function aiCanAfford(cm,ce,seat){
  const S=seat||AI.base;
  return typeof canAfford==='function'?canAfford(1,cm,ce,S&&S.slot):((S.mass||0)>=cm&&(S.energy||0)>=ce);
}
let aiArmyMemoT=-1, aiArmyMemo=[];
let aiAirMemoT=-1, aiAirMemo=-1;
function aiSeatArmy(slot){
  /* Same aiTick can ask this per factory. 1000-pop scans were ~16ms of aiTick. */
  const k=(slot==null?0:slot+1)|0;
  if(aiArmyMemoT===AI.t && aiArmyMemo[k]!=null) return aiArmyMemo[k];
  let n=0;
  const useCmd=typeof uCmd!=='undefined';
  const base=aiSeat(slot);
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]||uteam[i]!==1||isEnemyCommander(i)||utype[i]===UT_ENGINEER) continue;
    if(useCmd&&uCmd[i]===slot) n++;
    else if(!useCmd||uCmd[i]<0){ if(aiUnitBelongsToBase(i,base)) n++; }
  }
  aiArmyMemoT=AI.t; aiArmyMemo[k]=n;
  return n;
}
function aiSeatArmyCap(slot){
  /* Clock, not a step to 1000. Easy/Normal/Hard keep the old opening drip
     (18/28/36 + 5/9/13 per minute, plateau 46/86/132). After that plateau the
     lid keeps climbing toward this seat's 1000 so a long match can actually
     get there — 46/86/132 never would. Compact 1v1 is still one seat; theatre
     size does not multiply the cap. Do not raise FACTION_POP_CAP. */
  const D=AI.diff;
  const popCap=typeof populationCapForCommander==='function'?populationCapForCommander(slot):1000;
  const seatMax=Math.max(1,popCap-2);
  const tMin=(typeof stats!=='undefined'?stats.t:0)/60;
  const floor=[18,28,36][D], early=[5,9,13][D], oldCeil=[46,86,132][D];
  const tHi=(oldCeil-floor)/early;
  /* Late slope: Easy ~50 min to the seat cap, Normal ~40, Hard ~30 (a long Large). */
  const late=[20,28,38][D];
  const clock=tMin<=tHi ? floor+early*tMin : oldCeil+late*(tMin-tHi);
  return Math.min(seatMax, Math.round(clock));
}
function aiSeatAtCap(B){
  const slot=(B&&B.aiBaseSlot!=null)?B.aiBaseSlot:(AI.base&&AI.base.slot);
  const popCap=typeof populationCapForCommander==='function'?populationCapForCommander(slot):1000;
  const popUsed=typeof populationUsedForCommander==='function'?populationUsedForCommander(slot):0;
  return aiSeatArmy(slot)>=aiSeatArmyCap(slot)||popUsed>=popCap;
}
function aiUnitBelongsToBase(i,B){
  if(!AI.bases||AI.bases.length<2) return true;
  const d=dist2(ux[i],uy[i],B.x,B.y);
  for(const O of AI.bases) if(O!==B&&dist2(ux[i],uy[i],O.x,O.y)<d) return false;
  return true;
}
// defense strength near a point (player turrets/bastions/aa)
function defenseAt(x,y,team){
  let d=0;
  for(const B of bldLive){
    if(!B.alive||B.team!==team||B.prog<1) continue;
    if(B.type==='turret'&&dist2(x,y,B.x,B.y)<260*260) d++;
    else if((B.type==='bastion'||B.type==='seafort')&&dist2(x,y,B.x,B.y)<520*520) d+=2;
    else if(B.type==='aatower'&&dist2(x,y,B.x,B.y)<260*260) d+=0.5;
  }
  return d;
}
// pick the player's weakest valuable spot
function aiPickTarget(base){
  const AB=base||AI.base;
  let best=null, bs=1e18;
  const cands=[];
  for(const B of bldLive){
    if(!B.alive||B.team!==0||B.prog<1) continue;
    /* VALUE, not just proximity. Scoring on defence and distance alone meant a
       single undefended forty-mass Reactor parked next to the AI's base scored
       near zero and became a permanent decoy that every wave for the rest of
       the match walked into. Worth is now in the score, so a cheap bait is not
       more attractive than the factory it is hiding. */
    const worth = B.type==='fac'||B.type==='tgate'||B.type==='airfield' ? 3.0
                : B.type==='mex' ? 1.8 : B.type==='pgen' ? 1.0 : 1.2;
    cands.push([B.x,B.y,worth]);
  }
  if(heroIdx>=0) cands.push([ux[heroIdx],uy[heroIdx],2.4]);
  if(!cands.length) return [MAP*SP_LO,MAP*SP_HI];
  for(const c of cands){
    const dist=Math.sqrt(dist2(c[0],c[1],AB.x,AB.y));
    const score=(defenseAt(c[0],c[1],0)*420 + dist*0.25) / c[2];
    if(score<bs){ bs=score; best=c; }
  }
  return [best[0],best[1]];
}
function aiWaveMuster(B,WD){
  let army=0;
  for(let i=0;i<unitHigh;i++)
    if(ualive[i]&&uteam[i]===1&&!isEnemyCommander(i)&&utype[i]!==UT_ENGINEER&&aiUnitBelongsToBase(i,B)) army++;
  return {army,need:Math.min([14,18,22][WD],[7,9,11][WD]+Math.ceil(AI.wave/AI.bases.length))};
}
function playerAirCount(){
  if(aiAirMemoT===AI.t && aiAirMemo>=0) return aiAirMemo;
  let n=0;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&uteam[i]===0&&TYPES[utype[i]].air) n++;
  aiAirMemoT=AI.t; aiAirMemo=n;
  return n;
}
function aiFreeSpot(type){
  const fac=AI.fac||'legion', f=bldFoot(type,fac), edge=Math.max(f[0],f[1])*.5+12;
  /* A radius check was adequate while every faction reused Nova art, but it
     could accept a Machine Harbor whose far platform already crossed another
     building. Use the same authored OBB as player placement. Forty attempts
     offsets the larger honest plots without granting the AI illegal ground. */
  for(let t=0;t<40;t++){
    const a=Math.random()*TAU, d=70+Math.random()*320;
    const x=clamp(AI.base.x+Math.cos(a)*d,edge,MAP-edge);
    const y=clamp(AI.base.y+Math.sin(a)*d,edge,MAP-edge);
    if(typeof battlefieldContains==='function'&&!battlefieldContains(x,y,edge))continue;
    if(!footOnLand(type,x,y,0,fac)||footBlocked(type,x,y,0,null,fac)) continue;
    let ok=true;
    for(const D of deposits){
      if(!D.taken&&obbHit(x,y,f[0],f[1],0,D.x,D.y,40,40,0,3)){ok=false;break;}
    }
    if(ok) return [x,y];
  }
  return null;
}
function aiFreeWaterSpot(type){
  if(typeof battlefieldNavalEnabled!=='function'||!battlefieldNavalEnabled())return null;
  const fac=AI.fac||'legion',f=bldFoot(type,fac),edge=Math.max(f[0],f[1])*.5+12;
  for(let t=0;t<72;t++){
    const a=Math.random()*TAU,d=120+Math.random()*760;
    const x=clamp(AI.base.x+Math.cos(a)*d,edge,MAP-edge),y=clamp(AI.base.y+Math.sin(a)*d,edge,MAP-edge);
    if(footOnWater(type,x,y,0,fac)&&!footBlocked(type,x,y,0,null,fac))return [x,y];
  }
  return null;
}
function aiBaseOwnsBuilding(B,base){
  if(!base)return true;
  if(B.aiBaseSlot!=null)return B.aiBaseSlot===base.slot;
  let best=base,bd=dist2(B.x,B.y,base.x,base.y);
  for(const O of AI.bases||[])if(O!==base){const d=dist2(B.x,B.y,O.x,O.y);if(d<bd){bd=d;best=O;}}
  return best===base;
}
function aiCounts(base){
  const c={mex:0,pgen:0,fac:0,turret:0,sgen:0,tgate:0,bastion:0,harbor:0,seafort:0,airfield:0,nest:0};
  for(const B of bldLive) if(B.alive&&B.team===1&&aiBaseOwnsBuilding(B,base)) c[B.type]=(c[B.type]||0)+1;
  return c;
}
function aiBuildAt(type,x,y){
  const slot=AI.base&&AI.base.slot;
  AI.econPaySlot=slot;
  const B=beginBuild(1,type,x,y,0,slot);
  AI.econPaySlot=null;
  if(B){B.aiBaseSlot=slot;B.aiBehavior=aiBehaviorKey(AI.base&&AI.base.behavior);}
  return B;
}
function aiBuildingBehavior(B){
  if(B&&B.aiBehavior)return aiBehaviorKey(B.aiBehavior);
  let best=AI.base,bd=1e18;
  for(const A of AI.bases||[]){const d=dist2(B.x,B.y,A.x,A.y);if(d<bd){bd=d;best=A;}}
  return aiBehaviorKey(best&&best.behavior);
}
/* ---------- threat clock: how hard the AI is allowed to become ----------
   Grows with match time AND with how strong the player has actually gotten,
   so difficulty compounds instead of flat-lining. Slope + ceiling per level. */
function playerStructCount(){ let n=0; for(const B of bldLive) if(B.alive&&B.team===0&&B.prog>=1) n++; return n; }
/* THREAT IS A CLOCK, NOT A MIRROR.
   The old curve fed off the player's own unit count, structure count and
   commander level, so on Hard the AI's income multiplier reached ~9.6x with
   near-double health and damage — the better you played, the more it was
   handed. That is not difficulty, it is a tax on competence, and it teaches
   nothing because none of it is visible or learnable.

   Threat now advances with MATCH TIME only, and the ceiling is low enough that
   the AI has to actually spend its economy well. The difficulty it lost here
   is bought back with behaviour: mode usage, artillery against defended
   ground, and target scoring that weighs value instead of only distance. */
/* EASY IS THE ON-RAMP AND IT WAS NOT FLAT ENOUGH.
   At a 1.35 ceiling on a 0.05/min slope an Easy AI reached full threat at seven
   minutes, which put its income multiplier at 0.75*1.35 = 1.01 — parity with
   the player, on the difficulty someone picks to learn the controls. Training
   is where a player decides whether this game is for them. A shallower slope to
   a lower ceiling caps Easy at 0.83 instead, reached in a little over three
   minutes, so the match settles into a steady state that can be out-produced
   rather than one that keeps climbing. Normal and Hard are untouched. */
function aiThreat(){
  const D=AI.diff, tMin=stats.t/60;
  const raw=Math.min([1.10,1.7,2.2][D], 1+[0.03,0.09,0.13][D]*tMin);
  /* THE CLOCK RAMP KNOWS NOTHING ABOUT WHO IS WINNING.
     The player's economy is 100% map control, so losing a fight loses deposits
     and drops income toward the floor — while the AI's scheduled +70% arrives
     anyway, on time, because it reads a stopwatch. That compounds in exactly
     one direction. Ease the ramp when the ground says the player is genuinely
     behind; never reverse it, because the ladder is what they chose, and never
     help them when they are merely even. */
  if(typeof territoryScore!=='function') return raw;
  const a=territoryScore(0), b=territoryScore(1);
  return a*2<b ? 1+(raw-1)*0.65 : raw;
}
function aiTick(dt){
  AI.t+=dt; AI.buildTimer-=dt; AI.waveTimer-=dt;
  aiAllyTick(dt);
  aiRetreatTick(dt);
  // scale economy, damage, toughness and build speed off the threat clock
  const thr=aiThreat(), FA=FACTIONS[AI.fac]||FACTIONS.legion;
  AI.thr=thr;
  /* THREAT LEVEL rides on top of the difficulty setting. It is the one source
     of extra difficulty the player asked for explicitly, so unlike the old
     rubber band it is allowed to be steep. */
  const TE=(typeof threatEcon==='function')?threatEcon():1;
  const TH=(typeof threatHp==='function')?threatHp():1;
  const TD=(typeof threatDmg==='function')?threatDmg():1;
  const TT=(typeof threatTech==='function')?threatTech():1;
  aiIncomeMult=[0.75,1.0,1.25][AI.diff]*thr*FA.income*TE;
  aiDmgMult   =[0.85,1.0,1.10][AI.diff]*(1+0.06*(thr-1))*TD;
  aiHpMult    =(1+[0.04,0.07,0.10][AI.diff]*(thr-1))*TH;
  aiBuildMult =[0.85,1.15,1.6][AI.diff]*(1+0.10*(thr-1))*FA.buildMul*TT;
  // ---------- construction ----------
  if(AI.buildTimer<=0){
    aiUseBase('build');                 // expand each configured foothold in turn
    AI.buildTimer=Math.max(0.7,2.2-0.45*(thr-1));      // richer AI builds faster
    const c=aiCounts(AI.base),behavior=aiBehaviorKey(AI.base&&AI.base.behavior);
    const bank=AI.base||{};
    /* Shared simulation types, faction-specific arsenals. This keeps saves and
       balance tables stable while making each opponent actually construct a
       different defensive roster instead of painting the same turret green. */
    const basicDef=AI.fac==='legion'?'bunker':AI.fac==='syndicate'?'plasma':'turret';
    const siegeDef=AI.fac==='legion'?'missilebastion':AI.fac==='syndicate'?'minelaser':'bastion';
    const facBias=behavior==='rush'?2:behavior==='land'?1:behavior==='turtle'?-1:0;
    const wantFac=Math.max(1,Math.min(2+Math.floor(AI.t/60)+facBias, [4,8,13][AI.diff]+facBias));
    const wantMex=Math.min(deposits.length, 5+Math.floor(AI.t/70)+AI.diff*2);
    const eStarved=(bank.energy||0)<760, mFlush=(bank.mass||0)>(bank.mcap||MCAP0)*0.8;
    let done=false;
    // extractor on nearest free deposit within reach (range widens over the match)
    let bestD=-1,bd=1e12;
    const reach=(900+AI.t*0.9)*(900+AI.t*0.9);
    for(let d=0;d<deposits.length;d++){
      const D=deposits[d];
      if(D.taken||depositTier(D)<=0) continue;
      const dd=dist2(D.x,D.y,AI.base.x,AI.base.y);
      if(dd<bd && dd<reach){ bd=dd; bestD=d; }
    }
    // free geyser for Geo Plants (big, cheap energy)
    let bg=-1,bgd=1e12;
    for(let g=0;g<geysers.length;g++){
      const G=geysers[g];
      if(G.taken||geyserTier(G)<=0) continue;
      const dd=dist2(G.x,G.y,AI.base.x,AI.base.y);
      if(dd<bgd&&dd<reach){ bgd=dd; bg=g; }
    }
    // ---- ENERGY FIRST: a starved grid was what stalled the whole AI economy ----
    if(eStarved && bg>=0 && aiCanAfford(BT.geo.cm,BT.geo.ce)){
      geysers[bg].taken=true;
      aiBuildAt('geo',geysers[bg].x,geysers[bg].y); done=true;
    }
    else if(eStarved && aiCanAfford(BT.pgen.cm,BT.pgen.ce)){
      const s=aiFreeSpot('pgen'); if(s){ aiBuildAt('pgen',s[0],s[1]); done=true; }
    }
    else if(c.pgen<2){ const s=aiFreeSpot('pgen'); if(s&&aiCanAfford(BT.pgen.cm,BT.pgen.ce)){ aiBuildAt('pgen',s[0],s[1]); done=true; } }
    else if(bestD>=0 && c.mex<wantMex && aiCanAfford(BT.mex.cm,BT.mex.ce)){
      deposits[bestD].taken=true;
      aiBuildAt('mex',deposits[bestD].x,deposits[bestD].y); done=true;
    }
    // keep the grid ahead of production: T2 factories are energy hogs
    else if(c.pgen<2+c.fac*2 && aiCanAfford(BT.pgen.cm,BT.pgen.ce)){
      const s=aiFreeSpot('pgen'); if(s){ aiBuildAt('pgen',s[0],s[1]); done=true; }
    }
    else if(behavior==='air'&&(c.airfield||0)<[2,3,4][AI.diff]&&AI.t>[115,85,60][AI.diff]&&aiCanAfford(BT.airfield.cm,BT.airfield.ce)){
      const s=aiFreeSpot('airfield');if(s){aiBuildAt('airfield',s[0],s[1]);done=true;}
    }
    else if(behavior==='naval'&&aiBehaviorAvailable('naval')&&(c.harbor||0)<[1,2,3][AI.diff]&&AI.t>[105,75,55][AI.diff]&&aiCanAfford(BT.harbor.cm,BT.harbor.ce)){
      const s=aiFreeWaterSpot('harbor');if(s){aiBuildAt('harbor',s[0],s[1]);done=true;}
    }
    else if(behavior==='turtle'&&(c[basicDef]||0)<[4,7,11][AI.diff]&&(bank.mass||0)>240&&aiCanAfford(BT[basicDef].cm,BT[basicDef].ce)){
      const s=aiFreeSpot(basicDef);if(s){aiBuildAt(basicDef,s[0],s[1]);done=true;}
    }
    else if(c.fac<wantFac && aiCanAfford(BT.fac.cm,BT.fac.ce)){
      const s=aiFreeSpot('fac'); if(s){ aiBuildAt('fac',s[0],s[1]); done=true; }
    }
    else if(bg>=0 && (c.geo||0)<3 && aiCanAfford(BT.geo.cm,BT.geo.ce)){
      geysers[bg].taken=true;
      aiBuildAt('geo',geysers[bg].x,geysers[bg].y); done=true;
    }
    // mass piling up? bank it, then burn surplus energy into more mass
    else if(mFlush && (c.silo||0)<[1,2,4][AI.diff] && aiCanAfford(BT.silo.cm,BT.silo.ce)){
      const s=aiFreeSpot('silo'); if(s){ aiBuildAt('silo',s[0],s[1]); done=true; }
    }
    else if(AI.diff>=1 && (bank.energy||0)>2600 && (c.fab||0)<[0,2,4][AI.diff] && aiCanAfford(BT.fab.cm,BT.fab.ce)){
      const s=aiFreeSpot('fab'); if(s){ aiBuildAt('fab',s[0],s[1]); done=true; }
    }
    else if((c[basicDef]||0)<([2,5,8][AI.diff]+(behavior==='turtle'?3:behavior==='rush'?-1:0)) && (bank.mass||0)>300 && aiCanAfford(BT[basicDef].cm,BT[basicDef].ce)){
      const s=aiFreeSpot(basicDef); if(s){ aiBuildAt(basicDef,s[0],s[1]); done=true; }
    }
    else if(c.sgen<(behavior==='turtle'?2:1) && AI.t>(behavior==='turtle'?105:240) && aiCanAfford(BT.sgen.cm,BT.sgen.ce)){
      const s=aiFreeSpot('sgen'); if(s){ aiBuildAt('sgen',s[0],s[1]); }
    }
    else if(c.tgate<1 && (AI.t>[520,420,330][AI.diff]||heroLvl>=8||(WC.titan&&AI.t>90)) && aiCanAfford(BT.tgate.cm,BT.tgate.ce)){
      const s=aiFreeSpot('tgate'); if(s){ aiBuildAt('tgate',s[0],s[1]); }
    }
    else if((c[siegeDef]||0)<[1,1,2][AI.diff] && (AI.t>[560,440,340][AI.diff]||heroLvl>=6) && aiCanAfford(BT[siegeDef].cm,BT[siegeDef].ce)){
      const s=aiFreeSpot(siegeDef); if(s){ aiBuildAt(siegeDef,s[0],s[1]); }
    }
    else if((c.techlab||0)<1 && AI.t>150 && aiCanAfford(BT.techlab.cm,BT.techlab.ce)){
      const s=aiFreeSpot('techlab'); if(s){ aiBuildAt('techlab',s[0],s[1]); }
    }
    else if((c.airfield||0)<(AI.fac==='syndicate'?[2,2,3]:[1,1,2])[AI.diff]
         && (AI.t>(AI.fac==='syndicate'?[220,160,120]:[420,320,250])[AI.diff]||heroLvl>=5)
         && aiCanAfford(BT.airfield.cm,BT.airfield.ce)){
      const s=aiFreeSpot('airfield'); if(s){ aiBuildAt('airfield',s[0],s[1]); }
    }
    else if(typeof battlefieldNavalEnabled==='function'&&battlefieldNavalEnabled()&&c.harbor<1&&
            AI.t>[260,190,145][AI.diff]&&aiCanAfford(BT.harbor.cm,BT.harbor.ce)){
      const s=aiFreeWaterSpot('harbor');if(s)aiBuildAt('harbor',s[0],s[1]);
    }
    else if(c.harbor>0&&c.seafort<Math.max(1,AI.diff)&&AI.t>260&&aiCanAfford(BT.seafort.cm,BT.seafort.ce)){
      const s=aiFreeWaterSpot('seafort');if(s)aiBuildAt('seafort',s[0],s[1]);
    }
    // reactive anti-air: player is flying? build Skyguards
    if(playerAirCount()>2 && (c.aatower||0)<[2,3,4][AI.diff] && aiCanAfford(BT.aatower.cm,BT.aatower.ce)){
      const s=aiFreeSpot('aatower'); if(s){ aiBuildAt('aatower',s[0],s[1]); }
    }
    // reactive anti-swarm: the hiveworld is boiling? build Hellstorms (and Arcs on Hard)
    if(infTier()>=2 && hasBld(1,'techlab') && (c.hellstorm||0)<[1,3,5][AI.diff] && aiCanAfford(BT.hellstorm.cm,BT.hellstorm.ce)){
      const s=aiFreeSpot('hellstorm'); if(s){ aiBuildAt('hellstorm',s[0],s[1]); }
    }
    if(AI.diff>=2 && infTier()>=3 && hasBld(1,'techlab') && (c.arc||0)<2 && aiCanAfford(BT.arc.cm,BT.arc.ce)){
      const s=aiFreeSpot('arc'); if(s){ aiBuildAt('arc',s[0],s[1]); }
    }
    // upgrade a factory to T2 over time — pay the factory's own seat
    if(AI.t>[220,170,130][AI.diff] || heroLvl>=4){
      for(const B of bldLive){
        if(B.alive&&B.team===1&&B.type==='fac'&&B.prog>=1&&B.tier===1&&B.upT<=0&&canAfford(1,FAC_UP.cm,FAC_UP.ce,B.aiBaseSlot)){
          pay(1,FAC_UP.cm,FAC_UP.ce,B.aiBaseSlot); B.upT=FAC_UP.t; B.upMax=FAC_UP.t; break;
        }
      }
    }
    // upgrade turrets when that seat is rich
    if((bank.mass||0)>450){
      for(const B of bldLive){
        if(B.alive&&B.team===1&&B.type===basicDef&&B.prog>=1&&(B.lvl||1)<3&&B.upT<=0&&BUP[B.type]){
          const U=BUP[B.type][B.lvl-1];
          if(canAfford(1,U.cm,U.ce,B.aiBaseSlot)){ pay(1,U.cm,U.ce,B.aiBaseSlot); B.upT=U.t; B.upMax=U.t; }
          break;
        }
      }
    }
  }
  // (AI combat scaling now comes from the threat clock at the top of aiTick)
  /* ---------- ARRIVAL: drop march order ----------
     The flag makes a unit walk past everything, so it MUST come off the moment
     the unit is at its objective — otherwise the wave would stroll through the
     player's base without engaging it, which is a worse bug than the one march
     order was added to fix. */
  for(const [i,g] of AI.waveUnits){
    if(!ualive[i]||ugen[i]!==g) continue;
    if(umarch[i]===1 && dist2(ux[i],uy[i],utx[i],uty[i])<340*340) umarch[i]=0;
  }
  // ---------- retreat broken waves ----------
  if(AI.waveUnits.length){
    let alive=0;
    /* Wave membership is (slot, generation): counting bare slots meant a wave
       "survived" on units that had died and been replaced by whatever spawned
       into their index, so retreat never triggered. */
    for(const [i,g] of AI.waveUnits) if(ualive[i]&&ugen[i]===g&&uteam[i]===1) alive++;
    /* A 28% floor on a four-unit wave triggers on the first casualty, which is
       how a "retreat" rule turned every small attack into an immediate rout.
       Only waves big enough for the fraction to mean something can break. */
    if(AI.waveSize0>=8 && alive>0 && alive<AI.waveSize0*0.28 && !AI.retreated){
      AI.retreated=true;
      const rb=AI.waveBase||AI.base, fld=requestField(rb.x,rb.y);
      for(const [i,g] of AI.waveUnits){
        if(!ualive[i]||ugen[i]!==g||uteam[i]!==1) continue;
        ustate[i]=2; utgt[i]=-1; ufield[i]=fld; umarch[i]=1;
        utx[i]=rb.x+rr(-120,120); uty[i]=rb.y+rr(-120,120);
      }
      AI.waveUnits=[]; aiWaveDirty();
    } else if(alive===0){ AI.waveUnits=[]; aiWaveDirty(); }
  }
  // ---------- economic harassment squads ----------
  AI.harassTimer-=dt;
  if(AI.harassTimer<=0){
    AI.harassTimer=[110,85,65][AI.diff];
    // weakest player mex
    let tgt=null, bs=1e18;
    for(const B of bldLive){
      if(!B.alive||B.team!==0||B.type!=='mex'||B.prog<1) continue;
      const sc=defenseAt(B.x,B.y,0)*1000 - Math.sqrt(dist2(B.x,B.y,AI.base.x,AI.base.y))*0.1;
      if(sc<bs){ bs=sc; tgt=B; }
    }
    if(tgt){
      const squad=[];
      for(let i=0;i<unitHigh&&squad.length<8;i++){
        if(!ualive[i]||uteam[i]!==1||isEnemyCommander(i)) continue;
        const tp=utype[i];
        if((tp===0||tp===9||tp===1)&&!aiWaveHas(i)&&!aiIsRetasked(i)) squad.push(i);
      }
      if(squad.length>=5){
        const fld=requestField(tgt.x,tgt.y);
        for(const i of squad){
          ustate[i]=2; utgt[i]=-1; ufield[i]=fld; umarch[i]=1;
          utx[i]=tgt.x+rr(-40,40); uty[i]=tgt.y+rr(-40,40);
        }
        if(fogOn?covAt(AI.base.x,AI.base.y):true){} // silent unless scouted
      }
    }
  }
  /* ---------- ARMY CEILING --------------------------------------------------
     Per seat, clock-ramped toward that seat's 1000. Opening minutes still
     follow 46/86/132; the lid is no longer a plateau. Compact 1v1 is one seat. */

  // ---------- production ----------
  for(const B of bldLive){
    if(!B.alive||B.team!==1||B.prog<1) continue;
    const atCap=aiSeatAtCap(B);
    const seat=aiSeat(B.aiBaseSlot);
    if(B.type==='tgate'){
      if(!B.queue.length && titanCount[1]<(WC.titan?3:2)) B.queue.push(8);
      continue;
    }
    if(B.type==='airfield'){
      B.repeat=false;                                   // re-roll each aircraft
      const pool=aiBehaviorUnitPool(aiBuildingBehavior(B),B.tier,'airfield');
      if(!B.queue.length && !atCap){
        const t=aiWeightedPick(pool,aiFactionBias());
        B.queue.push(t>=0?t:pool[Math.random()*pool.length|0]);
      }
      continue;
    }
    if(B.type==='harbor'){
      B.repeat=false;
      const pool=aiBehaviorUnitPool(aiBuildingBehavior(B),B.tier,'harbor');
      if(!B.queue.length&&!atCap){
        const t=aiWeightedPick(pool,aiFactionBias());
        B.queue.push(t>=0?t:pool[Math.random()*pool.length|0]);
      }
      continue;
    }
    if(B.type!=='fac') continue;
    B.repeat=false;                                     // re-roll composition every unit
    if(atCap) continue;                                 // this seat's ceiling — other lanes still produce
    // surplus dump: banked mass must become army, or income scaling means nothing
    if((seat.mass||0)>(seat.mcap||MCAP0)*0.72 && B.queue.length<4){
      const dump=B.tier===2?[1,2,3,9,16]:[0,1,9];
      const biased=aiFactionBiasOverride(dump);
      B.queue.push(biased>=0?biased:dump[Math.random()*dump.length|0]);
    }
    if(!B.queue.length){
      let t=0;
      const r=Math.random();
      // war footing advances with BOTH match time and the player's commander level
      const phase=Math.max(AI.t, (heroLvl-1)*75);
      if(B.tier===1){
        /* 10 is the Vulture, which cannot shoot ground at all. Rolling it into
           ground waves regardless of whether the player owns a single aircraft
           sent free kills across the map every wave. */
        const aa = playerAirCount()>0;
        if(phase<110) t = r<0.8?0 : 1;
        else if(phase<240) t = r<0.45?0 : r<0.8?1 : (r<0.92?9:(aa?10:1));
        else t = r<0.25?0 : r<0.55?1 : r<0.72?9 : (r<0.88?(aa?10:2):5);
      } else {
        if(phase<420) t = r<0.2?0 : r<0.42?1 : r<0.58?2 : r<0.72?3 : r<0.84?7 : (r<0.94?6:11);
        else t = r<0.14?1 : r<0.32?2 : r<0.48?3 : r<0.6?16 : r<0.72?6 : r<0.84?7 : (r<0.93?11:5);
      }
      /* Personality shapes the faction's LEGAL roster, never replaces it.
         This pass happens before the arsenal filter below so a Dominion Air
         AI still fields Dominion escorts and a Syndicate Turtle cannot roll a
         chassis its faction does not own. */
      const behavior=aiBuildingBehavior(B),focus=aiBehaviorUnitPool(behavior,B.tier,'fac');
      if(focus&&Math.random()<(behavior==='balanced'?0:behavior==='rush'?.9:.76))t=focus[Math.random()*focus.length|0];
      /* This guard makes future wildlife/hero additions fail safe instead of
         turning one bad doctrine entry into a permanent production deadlock. */
      if(!TYPES[t]||TYPES[t].bt<=0) t=B.tier===2?(Math.random()<0.6?21:20):(Math.random()<0.5?0:9);
      /* The same arsenal seam drives player cards and enemy factories. A bias
         alone still lets a Dominion line randomly field Coalition shields or
         a Coalition plant roll Dominion siege; filter the final choice, then
         replace it from that faction's legal counter-complete pool. */
      let legal=null;
      if(typeof factionDoctrineRoster==='function'){
        const basePool=B.tier===2?[0,1,9,18,10,2,3,6,7,11,16,19,20,21,22,23,24,27,32]:[0,1,9,10,19,24,32];
        legal=factionDoctrineRoster(basePool,B.type||'fac',1).filter(q=>TYPES[q]&&TYPES[q].bt>0);
        if(legal.length&&legal.indexOf(t)<0) t=legal[Math.random()*legal.length|0];
      }
      /* Faction identity used to be three hardcoded pools that disagreed with
         FACTIONS[k].bias (Legion never rolled Harbinger). 0.45 matches the old
         Legion chance: keep the phase mix most of the time, overlay the table
         often enough that the design-DB weights are a real production lever. */
      if(legal&&legal.length){
        const themed=aiFactionBiasOverride(legal);
        if(themed>=0&&Math.random()<0.45) t=themed;
      }
      /* Vultures remain pure AA even if bias or the phase roll named one. */
      if(t===10&&playerAirCount()<=0) t=legal&&legal.indexOf(23)>=0?23:(B.tier===2&&legal&&legal.indexOf(2)>=0?2:1);
      B.queue.push(t);
    }
  }
  // ---------- wave attacks ----------
  if(!AI.warned && AI.waveTimer<=16 && AI.waveTimer>0){
    const warnBase=AI.bases[AI.waveCursor%AI.bases.length]||AI.base;
    const WD=clamp(warnBase.diff==null?AI.diff:warnBase.diff,0,2),muster=aiWaveMuster(warnBase,WD);
    /* Only announce a wave that can actually leave. Earlier warnings fired on
       the timer even when the AI had no army, producing repeated false alarms
       during an eight-second muster retry loop. */
    if(muster.army>=muster.need||(AI.stall||0)>=[150,120,100][WD]){
      AI.warned=true; AI.warnBase=warnBase; AI.warnTarget=aiPickTarget(warnBase);
      const lane=typeof waveLaneName==='function'?waveLaneName(warnBase.x,warnBase.y,AI.warnTarget[0],AI.warnTarget[1]):'APPROACH';
      toast('⚠ Wave '+AI.wave+' massing — '+lane+'!');
      if(typeof setWaveWarning==='function') setWaveWarning(warnBase.x,warnBase.y,AI.warnTarget[0],AI.warnTarget[1],AI.waveTimer,AI.wave,muster.army);
      sfx('alarm',AI.warnTarget[0],AI.warnTarget[1],.92);
    }
  }
  /* ---- DON'T ATTACK WITHOUT AN ARMY ----------------------------------------
     This is the other half of "enemy factions never make it to the player", and
     unlike the bug carpet it was the AI beating itself. The wave clock fired on
     time regardless of what was standing: at ninety seconds that is four units,
     which walk across the map, die to the first turret or bug pack they meet,
     and take the AI's entire standing force with them. The next wave is four
     more. The AI never accumulated enough to arrive anywhere, so the player saw
     a trickle of suicides and no army.

     A wave now needs a real fist behind it. If the muster is short the clock
     waits and re-checks — but never forever: after a couple of minutes of
     waiting it commits regardless, so a boxed-in or starved AI is still an
     opponent rather than a statue. */
  if(AI.waveTimer<=0){
    const waveBase=aiUseBase('wave'), WD=clamp(waveBase.diff==null?AI.diff:waveBase.diff,0,2);
    AI.waveBase=waveBase;
    const muster=aiWaveMuster(waveBase,WD),army=muster.army,need=muster.need;
    AI.stall=(AI.stall||0);
    if(army<need && AI.stall<[150,120,100][WD]){
      AI.stall+=8; AI.waveTimer=8; AI.warned=false; AI.warnBase=null; AI.warnTarget=null;
      if(typeof clearWaveWarning==='function') clearWaveWarning();
    } else {
    AI.stall=0;
    AI.warned=false;
    /* The floor matters more than the starting value: waves compress by 3s each
       time, so a shared floor of 30 meant every difficulty converged on the same
       relentless drumbeat by wave 15. Easy holds at a minute. */
    const firstLane=AI.openingLanes>0;
    if(firstLane){
      AI.openingLanes--;
      const behavior=aiBehaviorKey(waveBase.behavior),pace=behavior==='rush'?.66:behavior==='turtle'?1.38:behavior==='air'?.88:behavior==='naval'?1.08:1;
      AI.waveTimer=AI.openingLanes>0?30:Math.max([62,42,30][WD],[104,80,58][WD])*pace;
    }else{
      /* Wallets now pay per seat, so the √N cadence discount is retired.
         Compact 1v1 is one lane (divisor was 1 anyway). Each commander keeps
         its own clock with muster-or-stall; we do not ×N the old shared timer. */
      const lanePace=(typeof defenseFocus!=='undefined'&&defenseFocus)?0.82:1;
      const behavior=aiBehaviorKey(waveBase.behavior),doctrinePace=behavior==='rush'?.66:behavior==='turtle'?1.38:behavior==='air'?.88:behavior==='naval'?1.08:1;
      AI.waveTimer=Math.max([62,42,30][WD],
                            [104,80,58][WD]-Math.ceil(AI.wave)*[2,2.5,3][WD]
                            -Math.max(0,heroLvl-2)*[1,1.5,2][WD])
                   *(WC.blitz?0.6:1)*lanePace*doctrinePace;
    }
    let n=0;
    let [tx,ty]=AI.warnTarget||aiPickTarget(waveBase); // use the lane that was telegraphed
    // flanking: if the direct approach is fortified, swing the wave around the weaker side
    const mx2=(AI.base.x+tx)/2, my2=(AI.base.y+ty)/2;
    if(defenseAt(mx2,my2,0)>=2){
      const dx2=tx-AI.base.x, dy2=ty-AI.base.y, L=Math.hypot(dx2,dy2)||1;
      const px3=-dy2/L, py3=dx2/L;
      const c1=[clamp(mx2+px3*320,60,MAP-60),clamp(my2+py3*320,60,MAP-60)];
      const c2=[clamp(mx2-px3*320,60,MAP-60),clamp(my2-py3*320,60,MAP-60)];
      if(typeof battlefieldClampPoint==='function'){
        const a1=battlefieldClampPoint(c1[0],c1[1],60),a2=battlefieldClampPoint(c2[0],c2[1],60);
        c1[0]=a1[0];c1[1]=a1[1];c2[0]=a2[0];c2[1]=a2[1];
      }
      const w=defenseAt(c1[0],c1[1],0)<=defenseAt(c2[0],c2[1],0)?c1:c2;
      tx=clamp(tx+(w[0]-mx2)*0.7,60,MAP-60);
      ty=clamp(ty+(w[1]-my2)*0.7,60,MAP-60);
      if(typeof battlefieldClampPoint==='function'){
        const p=battlefieldClampPoint(tx,ty,60);tx=p[0];ty=p[1];
      }
    }
    /* Easy commits about half its standing army instead of nearly all of it, so
       a wave is something you repel rather than something you survive — and the
       leftovers mean the AI still defends itself when you push back. */
    const waveBehavior=aiBehaviorKey(waveBase.behavior),commit=waveBehavior==='rush'?.13:waveBehavior==='turtle'?-.22:waveBehavior==='land'?.06:0;
    const sendFrac = ((AI.fac==='horde'?0.82:0.7)+commit+0.05*Math.min(4,Math.ceil(AI.wave/AI.bases.length)))
                     *[0.62,0.85,1][WD];
    const fld=requestField(tx,ty);
    AI.waveUnits=[]; AI.retreated=false; aiWaveDirty();
    for(let i=0;i<unitHigh;i++){
      if(!ualive[i]||uteam[i]!==1||isEnemyCommander(i)||!aiUnitBelongsToBase(i,waveBase)) continue;
      if(aiIsRetasked(i)) continue;
      if(Math.random()<sendFrac){
        const T=TYPES[utype[i]],nav=T.naval&&typeof findWater==='function'?findWater(tx,ty):null;
        const qx=nav?nav[0]:clamp(tx+rr(-90,90),20,MAP-20),qy=nav?nav[1]:clamp(ty+rr(-90,90),20,MAP-20);
        ustate[i]=2; utgt[i]=-1; ufield[i]=T.naval?requestField(qx,qy,true):fld;
        utx[i]=qx;uty[i]=qy;
        umarch[i]=1;                       // march order: walk, don't skirmish
        AI.waveUnits.push([i,ugen[i]]);
        n++;
      }
    }
    AI.waveSize0=n;
    if(n>6){
      toast('⚠ Enemy wave '+AI.wave+' inbound — '+n+' units!'); mmPing(tx,ty); sfx('alarm');
      if(typeof setWaveWarning==='function') setWaveWarning(waveBase.x,waveBase.y,tx,ty,0,AI.wave,n);
    }
    AI.warnBase=null; AI.warnTarget=null;
    AI.wave++;
    }
  }
  aiTacticsTick(dt);
  /* ---- BASE DEFENSE SCRAMBLE -------------------------------------------
     A raiding enemy commander used to be ignored: waves marched to their own
     target, garrison units idled, and a kiting hero farmed the base picket by
     picket. If the player's commander is inside a base's perimeter, nearby
     garrison units converge on it — the AI answers the solo play instead of
     pretending it is not happening. */
  if(typeof heroIdx!=='undefined'&&heroIdx>=0&&ualive[heroIdx]){
    AI.cmdrScrT=(AI.cmdrScrT||0)-dt;
    if(AI.cmdrScrT<=0){
      AI.cmdrScrT=6;
      for(const B of AI.bases||[]){
        if(dist2(ux[heroIdx],uy[heroIdx],B.x,B.y)>640*640) continue;
        let sent=0;
        for(let i=0;i<unitHigh&&sent<12;i++){
          if(!ualive[i]||uteam[i]!==1||isEnemyCommander(i)||utype[i]===UT_ENGINEER) continue;
          if(dist2(ux[i],uy[i],B.x,B.y)>900*900) continue;
          if(aiWaveHas(i)) continue;
          if(aiIsRetasked(i)) continue;
          ustate[i]=2; utgt[i]=-1; umarch[i]=0;
          utx[i]=ux[heroIdx]+rr(-45,45); uty[i]=uy[heroIdx]+rr(-45,45); sent++;
        }
        break;
      }
    }
  }
  // Every enemy commander guards its own selected start instead of stacking.
  for(const B of AI.bases||[]){
    const h=B.commander;
    /* ualive[h] proves the SLOT is occupied, not that it still holds the same
       unit. killUnit returns dead slots to the shared freeList, so once an AI
       Commander died the next spawn — frequently a player unit out of a Factory
       — inherited the handle and had its orders overwritten every aiTick. Team
       and generation are both checked, matching AI.waveUnits and ctrlGroups. */
    if(h==null||h<0||!ualive[h]||uteam[h]!==1) continue;
    if(B.commanderGen!=null&&ugen[h]!==B.commanderGen){ B.commander=-1; continue; }
    const e=findEnemy(ux[h],uy[h],1,320);
    if(e>=0){ ustate[h]=2; utx[h]=ux[e]; uty[h]=uy[e]; }
    else { ustate[h]=2; utx[h]=B.x; uty[h]=B.y; }
  }
}

/* ---------- AMBUSH SPLIT + BASE RECALL (C&C3 / SupCom2) --------------------
   A marching column that 100% turns on the first flank shot rubber-bands the
   whole wave off its objective. A column that 100% ignores the flank dies to
   a raid it never answered. The split below peels a minority (nearby / idle /
   rear) onto the new shooter and leaves a core on the original order.

   Base damage is the same idea at strategic scale: request a portion home,
   leave far raiders raiding, restore field orders when the yard is quiet. */
function aiSnapOrder(i){
  return {i,g:ugen[i],st:ustate[i],tx:utx[i],ty:uty[i],tgt:utgt[i],tgtg:utgtg[i],
          field:ufield[i],march:umarch[i],hold:uhold[i]};
}
function aiRestoreOrder(s){
  if(!s||!ualive[s.i]||ugen[s.i]!==s.g||uteam[s.i]!==1) return false;
  const i=s.i;
  ustate[i]=s.st; utx[i]=s.tx; uty[i]=s.ty; ufield[i]=s.field;
  umarch[i]=s.march; uhold[i]=s.hold;
  let tg=s.tgt;
  if(tg>=0&&(!ualive[tg]||ugen[tg]!==s.tgtg||uteam[tg]===1)) tg=-1;
  else if(tg<=-2){ const B=blds[-2-tg]; if(!B||!B.alive) tg=-1; }
  utgt[i]=tg; utgtg[i]=tg>=0?s.tgtg:-1;
  return true;
}
function aiSnapHas(list,i){
  if(!list) return false;
  const g=ugen[i];
  for(let k=0;k<list.length;k++) if(list[k].i===i&&list[k].g===g) return true;
  return false;
}
function aiIsRetasked(i){
  return aiSnapHas(AI.peelSnap,i)||aiSnapHas(AI.recallSnap,i);
}
function aiDropSnap(list,i){
  if(!list) return;
  for(let k=list.length-1;k>=0;k--) if(list[k].i===i) list.splice(k,1);
}
function aiPruneSnaps(list){
  if(!list) return;
  for(let k=list.length-1;k>=0;k--){
    const s=list[k];
    if(!ualive[s.i]||ugen[s.i]!==s.g||uteam[s.i]!==1) list.splice(k,1);
  }
}
function aiWaveDirty(){ AI._waveMap=null; }
function aiWaveHas(i){
  let M=AI._waveMap;
  if(!M){
    M=AI._waveMap=new Map();
    const W=AI.waveUnits;
    if(W) for(let k=0;k<W.length;k++) M.set(W[k][0], W[k][1]);
  }
  return M.has(i);
}
function aiInWave(i){
  const M=AI._waveMap||(aiWaveHas(i),AI._waveMap);
  return !!(M&&M.get(i)===ugen[i]);
}
function aiCombatAI(i){
  return ualive[i]&&uteam[i]===1&&!isEnemyCommander(i)&&utype[i]!==UT_ENGINEER&&TYPES[utype[i]].wk!=='n';
}

/* RETREAT. The AI never read its own units' health: a wave fought to the last
   chassis every time, which reads as mindless rather than difficult and hands
   the player free kills and free veterancy. A unit below the threshold breaks
   contact and pulls toward its base; it is NOT healed or protected, it simply
   stops feeding itself into a fight it is losing.
   Deliberately narrow:
     - commanders and engineers are exempt (commanders have their own logic,
       engineers are already non-combat)
     - only while actually engaged, so idle damaged units do not stampede
     - a cooldown per unit so a unit cannot oscillate between fight and flee
     - the threshold is a named constant, so it can be tuned or set to 0 to
       disable the behaviour entirely in one edit. */
const AI_RETREAT_HP=0.28;      // fraction of max health
const AI_RETREAT_COOL=6;       // seconds before the same unit may retreat again
function aiRetreatTick(dt){
  if(AI_RETREAT_HP<=0) return;
  const R=AI.retreatT||(AI.retreatT={});
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]||uteam[i]!==1) continue;
    if(isEnemyCommander(i)||utype[i]===UT_ENGINEER) continue;
    if(R[i]>0){ R[i]-=dt; continue; }
    if(uhpm[i]<=0) continue;
    if(uhp[i]/uhpm[i]>AI_RETREAT_HP) continue;
    /* Only break off an actual engagement. */
    if(ustate[i]!==2&&utgt[i]<0) continue;
    /* Fall back to the main base. Per-seat bases exist (AI.bases) but there is
       no unit->base lookup, only aiUnitBelongsToBase(i,B) which is a test, not
       a query — walking every base per retreating unit is not worth it for a
       pull-back destination. */
    let bx=AI.base.x, by=AI.base.y;
    if(AI.bases&&AI.bases.length>1){
      for(const B of AI.bases){ if(B&&aiUnitBelongsToBase(i,B)){ bx=B.x; by=B.y; break; } }
    }
    utgt[i]=-1; utgtg[i]=-1;
    ustate[i]=1; umarch[i]=0;
    utx[i]=bx; uty[i]=by;
    R[i]=AI_RETREAT_COOL;
  }
}
function aiOnUnitHit(j,dmg,attTeam,attacker){
  if(attTeam!==0||uteam[j]!==1||attacker<0||dmg<6) return;
  if(!ualive[attacker]||uteam[attacker]!==0) return;
  if(isEnemyCommander(j)||utype[j]===UT_ENGINEER) return;
  if(utgt[j]===attacker) return;
  if(aiSnapHas(AI.recallSnap,j)) return;
  const tasked=ustate[j]===2||ustate[j]===5||umarch[j]===1;
  const engaged=utgt[j]>=0&&utgt[j]!==attacker;
  if(!tasked&&!engaged) return;
  const Q=AI.ambushQ||(AI.ambushQ=[]);
  for(let k=0;k<Q.length;k++) if(Q[k].a===attacker){
    Q[k].x=ux[j]; Q[k].y=uy[j]; Q[k].n=(Q[k].n||1)+1; return;
  }
  if(Q.length>=8) Q.shift();
  Q.push({a:attacker,g:ugen[attacker],x:ux[j],y:uy[j],n:1});
}

function aiOnBldHit(B){
  if(!B||B.team!==1) return;
  const t=B.type;
  if(t!=='hq'&&t!=='fac'&&t!=='airfield'&&t!=='tgate'&&t!=='harbor'&&t!=='uplink'
     &&t!=='mex'&&t!=='pgen'&&t!=='geo'&&t!=='sgen'&&t!=='nest') return;
  let seat=null,bd=780*780;
  for(const S of AI.bases||[]){
    const d=dist2(B.x,B.y,S.x,S.y);
    if(d<bd){ bd=d; seat=S; }
  }
  if(!seat) return;
  AI.defend={seat,x:B.x,y:B.y,t:AI.t};
}

function aiIssueFocus(i,tx,ty,tgt){
  ustate[i]=2; umarch[i]=0; uhold[i]=0; uPatrolRoute[i]=-1; uMoveCohort[i]=-1;
  if(tgt>=0&&ualive[tgt]&&uteam[tgt]!==1){
    utgt[i]=tgt; utgtg[i]=ugen[tgt]; utx[i]=ux[tgt]; uty[i]=uy[tgt];
  } else {
    utgt[i]=-1; utgtg[i]=-1; utx[i]=tx; uty[i]=ty;
    ufield[i]=requestField(tx,ty,!!TYPES[utype[i]].naval);
  }
}

function aiAmbushTick(dt){
  const P=AI.peelSnap||(AI.peelSnap=[]);
  aiPruneSnaps(P);
  const now=AI.t;
  for(let k=P.length-1;k>=0;k--){
    const s=P[k];
    if(s.until!=null&&now>s.until){ aiRestoreOrder(s); P.splice(k,1); continue; }
    if(s.focus>=0&&(!ualive[s.focus]||ugen[s.focus]!==s.focusg)){ aiRestoreOrder(s); P.splice(k,1); }
  }
  AI.ambushCool=(AI.ambushCool||0)-dt;
  const Q=AI.ambushQ;
  if(AI.ambushCool>0||!Q||!Q.length) return;
  AI.ambushCool=0.55;
  const ev=Q.pop(); Q.length=0;
  if(!ev||!ualive[ev.a]||ugen[ev.a]!==ev.g||uteam[ev.a]!==0) return;
  const cands=[];
  for(let i=0;i<unitHigh;i++){
    if(!aiCombatAI(i)) continue;
    if(aiSnapHas(AI.recallSnap,i)||aiSnapHas(P,i)) continue;
    if(utgt[i]===ev.a) continue;
    const d2=dist2(ux[i],uy[i],ev.x,ev.y);
    if(d2>480*480) continue;
    const wave=aiInWave(i), idle=ustate[i]===0&&utgt[i]<0;
    const toGoal=Math.sqrt(dist2(ux[i],uy[i],utx[i],uty[i]));
    let score=Math.sqrt(d2);
    if(idle) score-=180;
    if(!wave) score-=80;
    if(wave&&umarch[i]===1) score+=90;
    if(wave) score-=Math.min(120,toGoal*0.25);
    cands.push({i,score,wave});
  }
  if(!cands.length) return;
  cands.sort((a,b)=>a.score-b.score);
  const local=cands.length;
  if(local===1){
    const i=cands[0].i;
    P.push(Object.assign(aiSnapOrder(i),{until:now+7,focus:ev.a,focusg:ev.g}));
    aiIssueFocus(i,ux[ev.a],uy[ev.a],ev.a);
    return;
  }
  const peelN=Math.max(1,Math.min(8,Math.round(local*0.35)));
  let waveLocal=0; for(const c of cands) if(c.wave) waveLocal++;
  const wavePeelMax=Math.max(waveLocal>=2?1:0,Math.floor(waveLocal*0.4));
  let n=0,wavePeel=0;
  for(const c of cands){
    if(n>=peelN) break;
    if(c.wave){ if(wavePeel>=wavePeelMax) continue; wavePeel++; }
    P.push(Object.assign(aiSnapOrder(c.i),{until:now+7,focus:ev.a,focusg:ev.g}));
    aiIssueFocus(c.i,ux[ev.a],uy[ev.a],ev.a);
    n++;
  }
}

function aiDefendTick(dt){
  const R=AI.recallSnap||(AI.recallSnap=[]);
  aiPruneSnaps(R);
  const D=AI.defend;
  AI.recallCool=(AI.recallCool||0)-dt;
  let threat=false, seat=null, hx=0, hy=0;
  if(D){
    seat=D.seat; hx=D.x; hy=D.y;
    if(AI.t-D.t<8) threat=true;
  }
  if(seat){
    const e=findEnemy(seat.x,seat.y,1,480);
    if(e>=0){ threat=true; hx=ux[e]; hy=uy[e]; }
  }
  if(!threat){
    if(R.length){ for(const s of R) aiRestoreOrder(s); AI.recallSnap=[]; }
    AI.defendSent=false;
    return;
  }
  if(AI.recallCool>0) return;
  AI.recallCool=1.15;
  const behavior=aiBehaviorKey(seat&&seat.behavior);
  const frac=behavior==='turtle'?0.42:behavior==='rush'?0.18:0.28;
  const garrison=[], field=[];
  for(let i=0;i<unitHigh;i++){
    if(!aiCombatAI(i)||!aiUnitBelongsToBase(i,seat)) continue;
    if(aiSnapHas(R,i)) continue;
    const d=Math.sqrt(dist2(ux[i],uy[i],seat.x,seat.y));
    if(d<=820) garrison.push({i,d});
    else if(d<=1500) field.push({i,d});
  }
  garrison.sort((a,b)=>a.d-b.d);
  field.sort((a,b)=>a.d-b.d);
  const wantG=Math.min(10,garrison.length);
  const wantF=Math.min(8,Math.round(field.length*frac));
  const want=wantG+wantF;
  /* One commitment per raid. Top up only if casualties dropped the screen
     below a thin picket — otherwise 28% of the remainder every tick would
     eventually recall the whole 1500-range field. Far raiders stay out. */
  if(AI.defendSent&&R.length>=Math.max(4,want*0.45)) return;
  AI.defendSent=true;
  const pick=[];
  for(let k=0;k<wantG;k++) pick.push(garrison[k].i);
  for(let k=0;k<wantF;k++) pick.push(field[k].i);
  const e=findEnemy(hx,hy,1,320);
  for(const i of pick){
    aiDropSnap(AI.peelSnap,i);
    R.push(aiSnapOrder(i));
    aiIssueFocus(i,hx+rr(-40,40),hy+rr(-40,40),e);
  }
}

function aiTacticsTick(dt){
  aiAmbushTick(dt);
  aiDefendTick(dt);
}

