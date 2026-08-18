;
;
/* ============================================================================
   FACTION DOCTRINES — rules, not flavour text
   ----------------------------------------------------------------------------
   Faction names and models already resolve through playerFaction / AI.fac.
   Keep the gameplay seam here as small query functions so the shared TYPES and
   BT tables can remain save-compatible while each army changes how those
   chassis are paid for and used. Do not cache the selected faction: setup,
   campaign restore and imported sessions may all change it before resetWorld.
   ============================================================================ */

function factionDoctrineKey(team){
  if(team===2) return 'horde';
  if(team===1) return (typeof AI!=='undefined'&&AI.fac)||'legion';
  const f=(typeof playerFaction!=='undefined'&&playerFaction)||'nova';
  return f==='ascendancy'||f==='dominion'?'legion':f==='brood'?'horde':f;
}

/* Frontline Command wins through repeatable engineering rather than a raw
   combat scalar. The card shows the discounted STREAMED total, and production
   pays exactly that same total in sim.js. Brood cost is used by AI production;
   its true biological spawn systems remain in nests / Massflesh. */
function factionDoctrineUnitCostMul(team){
  const f=factionDoctrineKey(team);
  return f==='nova'?.94:f==='horde'?.86:1;
}
function factionDoctrineUnitCost(T,team){
  const m=factionDoctrineUnitCostMul(team);
  return {m:Math.ceil(T.cm*m),e:Math.ceil(T.ce*m)};
}
function factionDoctrineBuildSpeedMul(team){
  const f=factionDoctrineKey(team);
  return f==='nova'?1.12:f==='horde'?1.18:1;
}

/* Shared numeric chassis do not require every faction to expose every slot.
   These arsenal cuts are intentionally small: each side keeps a complete
   counter triangle, but its signature answer cannot be copied by both rivals.
   Existing save queues are not rewritten, so an older session can finish what
   it had already paid for. Only NEW production cards use this roster. */
const FAC_ARSENAL={
  /* Nova keeps every factory, air, naval and titan card. Listing it here makes
     the Four complete without shrinking combined-arms flexibility: a missing
     nova key used to look like an unfinished table. */
  nova:{
    fac:new Set([0,1,2,3,6,7,9,10,11,16,18,19,20,21,22,23,24,26,27,32]),
    tgate:new Set([8,26]),airfield:new Set([5,17,25]),harbor:new Set([14,15])
  },
  legion:{
    fac:new Set([0,1,2,3,7,9,10,16,18,19,20,21,22,26,27,32]),
    /* Titan Gate costs the same 820 blended as every other faction. Flavor
       already names the Legion TITAN (Ascendant) and says the gate builds
       TITANs. No doctrine comment forbids chassis 8 — the Basilisk-only set
       was an incomplete cut, not a written exclude. Match Nova: TITAN + Tyrant. */
    tgate:new Set([8,26]),airfield:new Set([5,17]),harbor:new Set([14,15])
  },
  syndicate:{
    fac:new Set([0,1,2,6,7,10,11,19,20,23,24,26,27,32]),
    tgate:new Set([8]),airfield:new Set([5,17,25]),harbor:new Set([14,15])
  },
  /* Brood keeps a complete counter triangle (runners, walkers, bile, AA,
     support) but does not copy Dominion 400-range siege or Coalition
     beam/shield/sonic plant. Nest organisms 12/13/31 stay hive-spawned. */
  horde:{
    fac:new Set([0,1,2,3,7,9,10,18,19,20,21,22,27,32]),
    tgate:new Set([8]),airfield:new Set([5,17,25]),harbor:new Set([14,15])
  }
};
function factionDoctrineRoster(list,facility,team){
  const rule=FAC_ARSENAL[factionDoctrineKey(team)];
  if(!rule||!rule[facility]) return list.slice();
  return list.filter(t=>rule[facility].has(t));
}

/* Coalition extraction is an EFFICIENCY bonus, not a faster emptying of the
   field. economy.js drains the authored amount from the finite node, then
   applies this yield to what reaches storage. */
function factionDoctrineNodeYieldMul(team){
  return factionDoctrineKey(team)==='syndicate'?1.18:1;
}

/* Dominion momentum is per body. A single global timer would let an artillery
   piece inherit a rifleman's combat time; slot generation prevents a newly
   spawned unit inheriting the dead occupant's fury. The engagement grace is
   derived from weapon cooldown so deliberate siege weapons can still ramp. */
const facFightStart=new Float32Array(MAXU),facFightLast=new Float32Array(MAXU);
const facFightGen=new Int32Array(MAXU);
const facFightLit=new Uint8Array(MAXU);
const facPhaseUsed=new Uint8Array(MAXU);
const facEntrenchTime=new Float32Array(MAXU);
const facLastPosX=new Float32Array(MAXU);
const facLastPosY=new Float32Array(MAXU);
const facOutOfCombat=new Float32Array(MAXU);
function factionDoctrineReset(){
  facFightStart.fill(0);facFightLast.fill(-999);facFightGen.fill(-1);facFightLit.fill(0);
  facPhaseUsed.fill(0);facEntrenchTime.fill(0);facLastPosX.fill(0);facLastPosY.fill(0);facOutOfCombat.fill(0);
}
function factionDoctrineAttackMul(team,i){
  if(factionDoctrineKey(team)!=='legion'||i<0) return 1;
  const now=(typeof stats!=='undefined'&&stats.t)||0,T=TYPES[utype[i]];
  if(facFightGen[i]!==ugen[i]){
    facFightGen[i]=ugen[i];facFightStart[i]=now;facFightLast[i]=now;facFightLit[i]=0;
    return 1;
  }
  const grace=Math.max(4,(T&&T.cool||1)*1.8);
  if(now-facFightLast[i]>grace){facFightStart[i]=now;facFightLit[i]=0;}
  facFightLast[i]=now;
  const charge=clamp((now-facFightStart[i])/12,0,1);
  if(charge>=1&&!facFightLit[i]){
    facFightLit[i]=1;
    if(typeof addParticle==='function') addParticle(3,ux[i],uy[i],0,0,.5,(T&&T.size||14)*2.2,255,78,48);
  }
  return 1+.18*charge;
}

/* Called once after loadout and commander perks. The Coalition turns recovered
   battlefield hardware into account economy as well as improving claimed node
   yield; the multiplier composes with modules and match modifiers. */
function applyFactionDoctrineChoice(){
  factionDoctrineReset();
  if(factionDoctrineKey(0)==='syndicate') salvageMult*=1.18;
}

/* ---- ACCOUNT FACTION RESEARCH --------------------------------------------
   These are deliberately narrow consumers of the account tree. Generic
   research and crafted modules still compose normally. A faction unlock only
   runs when the player is actually commanding that faction; owning Dominion
   doctrine must never strengthen a Nova expedition or the opposing AI. */
const MF_FACTION_TECH_CONSUMERS=Object.freeze({
  asc_siege_foundry:{kind:'spawn-rule',consumer:'spawnUnit',faction:'legion'},
  asc_iron_discipline:{kind:'formation-rule',consumer:'formationSpacing',faction:'legion'},
  asc_crown_battery:{kind:'stance-rule',consumer:'setMode/unitTick',faction:'legion'},
  syn_quantum_grid:{kind:'economy-rule',consumer:'drawEnergy',faction:'syndicate'},
  syn_drone_mesh:{kind:'target-rule',consumer:'unitTick/dealDamage',faction:'syndicate'},
  syn_phase_lattice:{kind:'transport-rule',consumer:'mfAirliftPostTick',faction:'syndicate'},
  /* Brood is not selectable in Pre-Alpha. Selling these as live player buffs
     would be false, and binding account ownership to enemy strength would be
     hostile progression. They remain explicit dossier/future gates until the
     horde enters playableFactions(); the existing AI Tidecaster and Massflesh
     doctrines continue to run independently of the player's account. */
  hor_gene_splice:{kind:'future-gate',consumer:'mfFactionTechBroodGate',faction:'horde'},
  hor_synaptic_tide:{kind:'future-gate',consumer:'mfFactionTechBroodGate',faction:'horde'},
  hor_living_siege:{kind:'future-gate',consumer:'mfFactionTechBroodGate',faction:'horde'}
});

function mfFactionTechBroodGate(){
  return false;                         // AI-only until horde is deliberately made playable
}
function mfFactionTechPurchasable(id){
  const R=MF_FACTION_TECH_CONSUMERS[id];
  return !R||R.kind!=='future-gate';
}
function mfFactionTechActive(id){
  const R=MF_FACTION_TECH_CONSUMERS[id];
  if(!R||R.kind==='future-gate'||!devHas(id)) return false;
  return factionDoctrineKey(0)===R.faction;
}
/* Previous UI exposed the future Brood dossier through devBuy(), allowing a
   player to spend scarce account materials on a deliberately inert enemy-only
   node. Keep the nodes visible as intelligence, but fail closed here too. */
const mfFactionTechDevBuyBase=devBuy;
devBuy=function(n,silent){
  if(n&&!mfFactionTechPurchasable(n.id)){
    if(!silent){
      toast('AI DOSSIER — Brood evolution becomes researchable only when the faction is playable');
      if(typeof sfx==='function')sfx('ui');
    }
    return false;
  }
  return mfFactionTechDevBuyBase(n,silent);
};
function mfFactionTechArtillery(type){
  const T=TYPES[type];return !!(T&&T.cat==='art');
}

/* Hardened Dominion gun carriages. Apply after the complete spawn takeover
   chain, so transports, session restore and factory production all receive
   the same maximum-health rule without cloning any production code. */
const mfFactionTechSpawnBase=spawnUnit;
spawnUnit=function(type,team,x,y,cmdSlot){
  const i=mfFactionTechSpawnBase(type,team,x,y,cmdSlot);
  if(i>=0){
    /* Slots are recycled immediately. Tech timers and target marks are not
       part of sim.js's core arrays, so this takeover owns clearing them. */
    mfFactionTechOverStart[i]=0;mfFactionTechOverEnd[i]=0;
    mfFactionTechOverReady[i]=0;mfFactionTechOverFx[i]=0;
    mfFactionTechMarkUntil[i]=0;mfFactionTechMarkGen[i]=0;
    facPhaseUsed[i]=0;facEntrenchTime[i]=0;
    facLastPosX[i]=ux[i];facLastPosY[i]=uy[i];facOutOfCombat[i]=0;
  }
  if(i>=0&&team===0&&mfFactionTechActive('asc_siege_foundry')&&mfFactionTechArtillery(type)){
    uhpm[i]*=1.12;uhp[i]*=1.12;
  }
  return i;
};

/* Iron Discipline changes footprint rather than collision radius. Physical
   separation in sim.js remains authoritative, so a dense formation cannot
   collapse into a single-unit stack. Small squads retain normal clearance. */
const mfFactionTechFormationSpacingBase=formationSpacing;
formationSpacing=function(sel){
  const spacing=mfFactionTechFormationSpacingBase(sel);
  return sel&&sel.length>=4&&mfFactionTechActive('asc_iron_discipline')
    ?Math.max(24,spacing*.88):spacing;
};

/* Crown overcharge begins after the ordinary Siege deployment lock. It speeds
   cooldown recovery rather than multiplying impact damage, which preserves
   the authored projectile/splash model and cannot apply twice to one shell. */
const mfFactionTechOverStart=new Float32Array(MAXU);
const mfFactionTechOverEnd=new Float32Array(MAXU);
const mfFactionTechOverReady=new Float32Array(MAXU);
const mfFactionTechOverFx=new Float32Array(MAXU);
const mfFactionTechSetModeBase=setMode;
setMode=function(i,m){
  const changed=mfFactionTechSetModeBase(i,m);
  if(!changed)return false;
  if(m!==1){mfFactionTechOverEnd[i]=0;return true;}
  const now=(typeof stats!=='undefined'&&stats.t)||0;
  if(uteam[i]===0&&mfFactionTechArtillery(utype[i])&&
     mfFactionTechActive('asc_crown_battery')&&now>=mfFactionTechOverReady[i]){
    mfFactionTechOverStart[i]=now+MODE_SWITCH;
    mfFactionTechOverEnd[i]=mfFactionTechOverStart[i]+8;
    mfFactionTechOverReady[i]=mfFactionTechOverEnd[i]+18;
    mfFactionTechOverFx[i]=0;
  }
  return true;
};

/* Quantum routing discounts only requests made through drawEnergy(). Income,
   storage, construction escrow and account resources are intentionally not
   touched, so the stated 15% field-system saving is the complete effect. */
const mfFactionTechDrawEnergyBase=drawEnergy;
drawEnergy=function(team,e){
  if(team===0&&mfFactionTechActive('syn_quantum_grid'))e*=.85;
  return mfFactionTechDrawEnergyBase(team,e);
};

/* A lightweight per-target generation mark avoids allocating objects during
   combat and cannot survive a recycled unit slot. The spatial grid bounds the
   scout search; this runs three times every two seconds, not every frame. */
const mfFactionTechMarkUntil=new Float32Array(MAXU);
const mfFactionTechMarkGen=new Int32Array(MAXU);
let mfFactionTechScanAt=0,mfFactionTechLastT=0;
function mfFactionTechIsDrone(i){
  const T=TYPES[utype[i]];
  return !!(T&&(T.scout||(T.air&&!T.airTransport))&&T.cat!=='hero');
}
function mfFactionTechScanDrones(now){
  if(!mfFactionTechActive('syn_drone_mesh'))return;
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]||uteam[i]!==0||!mfFactionTechIsDrone(i))continue;
    let target=-1,best=250*250;
    forUnitsIn(ux[i],uy[i],250,j=>{
      if(uteam[j]===0)return;
      const d=dist2(ux[i],uy[i],ux[j],uy[j]);
      if(d<best){best=d;target=j;}
    });
    if(target>=0){
      const fresh=mfFactionTechMarkGen[target]!==ugen[target]||mfFactionTechMarkUntil[target]<=now;
      mfFactionTechMarkGen[target]=ugen[target];mfFactionTechMarkUntil[target]=now+3.5;
      if(fresh&&perfScale>.45)addParticle(3,ux[target],uy[target],0,0,.32,TYPES[utype[target]].size*1.25,104,255,146);
    }
  }
}
const mfFactionTechDealDamageBase=dealDamage;
dealDamage=function(j,dmg,attTeam,attacker,mu,wk){
  const now=(typeof stats!=='undefined'&&stats.t)||0;
  if(j<0||!ualive[j]) return;
  facOutOfCombat[j]=0;
  if(attacker>=0&&attacker<MAXU) facOutOfCombat[attacker]=0;

  // 1. Syndicate Quantum Energy Siphon
  if(attTeam>=0&&factionDoctrineKey(attTeam)==='syndicate'&&dmg>0){
    if(typeof drawEnergy==='function') drawEnergy(attTeam,-dmg*0.05);
  }

  // 2. Dominion Frontal Deflection Armor
  if(factionDoctrineKey(uteam[j])==='legion'&&attacker>=0&&uhpm[j]>=450){
    const dx=ux[attacker]-ux[j],dy=uy[attacker]-uy[j];
    const len=Math.hypot(dx,dy);
    if(len>1){
      const dot=(dx*Math.cos(ua[j])+dy*Math.sin(ua[j]))/len;
      if(dot>0.35) dmg*=0.80;
    }
  }

  // 3. Brood Swarm AoE / Splash Resistance
  if(factionDoctrineKey(uteam[j])==='horde'&&wk){
    dmg*=0.75;
  }

  // 4. Nova Entrenchment Damage Mitigation
  if(factionDoctrineKey(uteam[j])==='nova'){
    if(facEntrenchTime[j]>6.0) dmg*=0.88;
  }

  // 5. Tech drone mesh
  if(attTeam===0&&mfFactionTechActive('syn_drone_mesh')&&
     mfFactionTechMarkGen[j]===ugen[j]&&mfFactionTechMarkUntil[j]>now)dmg*=1.10;

  // 6. Syndicate Emergency Micro-Phase Shift
  if(factionDoctrineKey(uteam[j])==='syndicate'&&uhp[j]<=dmg&&!facPhaseUsed[j]){
    const T=TYPES[utype[j]];
    if(T&&(T.cat==='hero'||T.cat==='tgate'||uhpm[j]>=850)){
      facPhaseUsed[j]=1;
      uhp[j]=uhpm[j]*0.15;
      if(typeof addParticle==='function') addParticle(3,ux[j],uy[j],0,0,0.55,T.size*2.2,90,212,255);
      return;
    }
  }

  return mfFactionTechDealDamageBase(j,dmg,attTeam,attacker,mu,wk);
};

const mfFactionTechUnitTickBase=unitTick;
unitTick=function(dt){
  mfFactionTechUnitTickBase(dt);
  const now=(typeof stats!=='undefined'&&stats.t)||0;
  if(now<mfFactionTechLastT){
    mfFactionTechOverStart.fill(0);mfFactionTechOverEnd.fill(0);mfFactionTechOverReady.fill(0);
    mfFactionTechMarkUntil.fill(0);mfFactionTechMarkGen.fill(0);mfFactionTechScanAt=0;
    factionDoctrineReset();
  }
  mfFactionTechLastT=now;
  if(now>=mfFactionTechScanAt){mfFactionTechScanAt=now+.66;mfFactionTechScanDrones(now);}

  // Faction Signature Operational Rules Simulation
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]) continue;
    facOutOfCombat[i]+=dt;
    const fKey=factionDoctrineKey(uteam[i]);
    
    // Brood Creep Vitality: out-of-combat HP regeneration
    if(fKey==='horde'){
      if(facOutOfCombat[i]>4.0&&uhp[i]<uhpm[i]){
        uhp[i]=Math.min(uhpm[i],uhp[i]+3.5*dt);
      }
    }
    // Nova Entrenchment: stationary tracking
    else if(fKey==='nova'){
      if(Math.hypot(ux[i]-facLastPosX[i],uy[i]-facLastPosY[i])<0.6){
        facEntrenchTime[i]+=dt;
        if(facEntrenchTime[i]>6.0&&ucool[i]>0){
          ucool[i]=Math.max(0,ucool[i]-dt*0.10); // +10% rate of fire when entrenched
        }
      } else {
        facEntrenchTime[i]=0;
        facLastPosX[i]=ux[i];facLastPosY[i]=uy[i];
      }
    }
  }

  if(!mfFactionTechActive('asc_crown_battery'))return;
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]||uteam[i]!==0||umode[i]!==1||now<mfFactionTechOverStart[i]||now>=mfFactionTechOverEnd[i])continue;
    if(drawEnergy(0,2.5*dt)<.999){mfFactionTechOverEnd[i]=0;continue;}
    ucool[i]=Math.max(0,ucool[i]-dt*.28);
    mfFactionTechOverFx[i]-=dt;
    if(mfFactionTechOverFx[i]<=0){
      mfFactionTechOverFx[i]=.72;
      if(perfScale>.45)addParticle(3,ux[i],uy[i],0,0,.24,TYPES[utype[i]].size*1.35,255,112,72);
    }
  }
};

/* The Phase Ark already serializes passengers and renders the transfer beam.
   This hook changes only the final approach distance; it does not teleport the
   carrier itself, bypass map bounds, or duplicate cargo. */
const mfFactionTechAirliftPostBase=mfAirliftPostTick;
mfAirliftPostTick=function(dt){
  mfFactionTechAirliftPostBase(dt);
  if(!mfFactionTechActive('syn_phase_lattice'))return;
  for(let i=0;i<mfAirliftHolds.length;i++){
    const H=mfAirliftHolds[i];
    if(!H||!H.mission||!mfAirliftIsLive(i,H.gen)||uteam[i]!==0)continue;
    if(dist2(ux[i],uy[i],H.mission.x,H.mission.y)<=96*96){
      addParticle(3,H.mission.x,H.mission.y,0,0,.48,56,104,255,146);
      mfAirliftUnloadNow(i,H);
    }
  }
};

