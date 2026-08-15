;
;
/* ============================================================================
   FIELD REPAIR BAYS — a damaged army is worth keeping
   ----------------------------------------------------------------------------
   Until now the only way to restore a unit's health was to build a Warden and
   drive it to the casualty (`sim.js`, `utype===24`). Everything else in the
   game repairs: Constructors mend structures, the Aegis Barrier mends
   structures, the Commander regenerates. A tank did not. The consequence is a
   strategy-layer one, not a comfort one:

     * A veteran chassis is worth strictly less than a fresh one, because
       `uvet` rides on a body that can only ever get closer to dead. The game
       already grants ★1/★2/★3 at 4/10/24 kills and +15% damage a star — and
       then gives you no way to bank that investment.
     * RETREAT, which landed today, pays nothing. Pulling a half-dead column
       out of a fight buys you a half-dead column. Attack-move into the grinder
       is the dominant line whenever bodies are fungible.
     * The counter-triangle (WKM) is a knowledge test with no recovery step:
       bringing the wrong weapon costs you the army, not the engagement.

   Both design references solve this at the base, not in the field: C&C3 has the
   Repair Facility apron, Supreme Commander lets anything with a build arm mend
   a unit. This module takes the base half, which is the half that costs no
   APM — and APM is the resource a phone player actually has least of.

   Rules the module keeps to:

     * IT IS AN APRON, NOT AN AURA. You have to drive home. The radius is a few
       structure-widths, so "fall back and mend" is a real trip across ground an
       enemy can contest, and forward bases become worth building for a reason
       other than build range.
     * IT COSTS MASS AND ENERGY, at 35% of the chassis price pro-rata. Repairing
       is decisively cheaper than rebuilding (which is the point) but it is not
       free healing, so it competes with production for the same bank.
     * IT IS NOT A COMBAT HEAL. Anything that has taken hostile fire in the last
       four seconds is locked out. Without that, a defender's HQ apron turns
       every base assault into a damage race against an infinite health pool —
       the exact failure that makes turtling unbeatable.
     * IT APPLIES TO EVERY COMMANDER. The AI's units mend on its aprons too.
       A rule that only helps the player is a difficulty slider in a costume
       (same principle `hazards.js` states for hazards).
     * HEROES ARE EXCLUDED. Commanders already regenerate, with a deliberate
       in-combat gate; stacking an apron on top would undo that tuning.

   Cost model note: the bill is keyed to `uhpm`, not to authored `T.hp`. Health
   research and wildcards move `uhpm`, and pricing off the authored number would
   have made a Brittle Frames match cheaper to sustain than a normal one.
   ============================================================================ */

/* Which structures run an apron, and how far it reaches in world units. Only
   command and production structures: a Reactor is not a workshop, and letting
   every wall segment mend would make the radius question meaningless. */
const MF_BAY_APRON={hq:150, fac:115, airfield:115, harbor:115, tgate:135};
/* Percent of maximum health a second, floored and capped. A flat rate makes a
   Striker take as long as a Goliath; a pure percentage repairs a TITAN at 770
   HP/s. The band puts the whole mainline roster near eighteen seconds and
   leaves an experimental hull a genuinely long stay. */
const MF_BAY_RATE=0.055, MF_BAY_MIN=7, MF_BAY_MAX=110;
const MF_BAY_COST=0.35;                  // fraction of build cost per fraction of HP
const MF_BAY_SLOTS=6;                    // units one apron services per cycle
const MF_BAY_CADENCE=0.5;                // seconds between service sweeps
const MF_BAY_LOCKOUT=4;                  // seconds after hostile fire before mending resumes

/* Timestamp, not a countdown: `uHurtT` in sim.js is only decremented for
   heroes, so reusing it here would have latched every unit that ever took a
   real hit into permanent lockout. A stats.t deadline needs no per-tick decay
   and survives the frame-rate scaling main.js applies to simDt. */
const mfBayHitT=new Float32Array(MAXU);
let mfBayAcc=0, mfBayAnnounced=false;

const mfBayDealDamageBase=dealDamage;
dealDamage=function(j,dmg,attTeam,attacker,mu,wk){
  if(ualive[j]&&attTeam!==uteam[j]) mfBayHitT[j]=stats.t+MF_BAY_LOCKOUT;
  return mfBayDealDamageBase(j,dmg,attTeam,attacker,mu,wk);
};

function mfBayServiceable(i,team){
  if(!ualive[i]||uteam[i]!==team) return false;
  if(uhp[i]>=uhpm[i]*0.995) return false;
  if(mfBayHitT[i]>stats.t) return false;
  const T=TYPES[utype[i]];
  if(!T||T.cat==='hero') return false;
  /* Grown bodies and free spawns (Ravagers, Tidecasters, the hero chassis)
     carry no build price, so there is no honest bill to charge for mending
     them. They stay outside the system rather than being repaired for nothing. */
  return (T.cm>0||T.ce>0);
}

function mfRepairBayTick(dt){
  /* bldLive lags up to 31 ticks behind addBld. An empty cache used to skip
     the whole apron pass, so a parked column next to a finished HQ never
     mended until reclaimTick refreshed the list. Walk blds in that window. */
  const list=(typeof bldLive!=='undefined'&&bldLive.length)?bldLive
    :(typeof blds!=='undefined'?blds:null);
  if(!list||!list.length) return;
  mfBayAcc+=dt;
  if(mfBayAcc<MF_BAY_CADENCE) return;
  const step=mfBayAcc; mfBayAcc=0;
  const cand=[];
  for(const B of list){
    if(!B.alive||B.prog<1||B.team>1) continue;
    const R=MF_BAY_APRON[B.type];
    if(!R) continue;
    cand.length=0;
    forUnitsIn(B.x,B.y,R,j=>{ if(mfBayServiceable(j,B.team)) cand.push(j); });
    if(!cand.length) continue;
    /* Worst first. A bay with six slots and forty casualties parked on it
       should be pulling the ones closest to dying off the line, which is also
       what the player would have picked by hand. */
    cand.sort((a,b)=>uhp[a]/uhpm[a]-uhp[b]/uhpm[b]);
    const n=Math.min(MF_BAY_SLOTS,cand.length);
    const slot=(B.team===1&&typeof econAiBuildingSlot==='function')?econAiBuildingSlot(B):null;
    for(let k=0;k<n;k++){
      const i=cand[k], T=TYPES[utype[i]];
      const amt=Math.min(clamp(uhpm[i]*MF_BAY_RATE,MF_BAY_MIN,MF_BAY_MAX)*step, uhpm[i]-uhp[i]);
      if(amt<=0) continue;
      const frac=amt/Math.max(1,uhpm[i]);
      /* Bank first, mend second. payStream is all-or-nothing, so a stalled
         economy simply stops the line rather than handing out a free tick. */
      if(!payStream(B.team,(T.cm||0)*MF_BAY_COST*frac,(T.ce||0)*MF_BAY_COST*frac,slot)) break;
      uhp[i]=Math.min(uhpm[i],uhp[i]+amt);
      if(B.team===0&&!mfBayAnnounced){
        mfBayAnnounced=true;
        toast('🔧 FIELD REPAIR — damaged units mend on the apron of your HQ, Factory, Airfield or Harbor');
      }
      /* Two beams an apron a cycle. The Warden and Constructor already own this
         green 'repair' beam, so the readback is a language the player has
         seen; drawing one per serviced unit would turn a base full of
         casualties into a solid sheet of light. */
      if(k<2&&perfScale>0.4){
        addBeam(B.x,B.y,ux[i],uy[i],2.4,150,235,120,MF_BAY_CADENCE,'repair');
        addParticle(2,ux[i]+rr(-5,5),uy[i]+rr(-5,5),rr(-3,3),rr(-9,-2),.4,2.8,150,235,120);
      }
    }
  }
}

const mfBayEconTickBase=econTick;
econTick=function(dt){
  mfBayEconTickBase(dt);
  mfRepairBayTick(dt);
};

/* ---- CONSTRUCTOR RAISE ---------------------------------------------------
   Buildings construct themselves from the bank (`bldTick` + `payStream`). The
   Constructor's card, the idle-builder picker, and `B.tractorT` all talk as if
   an engineer on a foundation actually finishes it faster. Only Prospectors in
   ASSIST mode ever wrote that flag, and only onto completed factories.

   `tractorT` is already consumed in `bldTick` (same-frame, because this wrap
   runs at the end of `unitTick`, which is before `bldTick` in main.js). Two
   Constructors cap at +44%, matching the Prospector assist stack, so a blob of
   idle engineers cannot collapse a Titan Gate to instant. */
const MF_ENG_RAISE_R=78;
let mfEngRaiseAnnounced=false;

function mfEngineerRaiseTick(){
  if(typeof blds==='undefined'||!blds.length) return;
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]) continue;
    const T=TYPES[utype[i]];
    if(!T||!T.builder) continue;
    /* A fresh move / patrol / barrage / guard order wins. Once they arrive
       (ustate 1 → 0 at 7 units), the next tick picks up the foundation. */
    if(ustate[i]===1||ustate[i]===5||ustate[i]===6||ustate[i]===7) continue;
    let best=null,bd=MF_ENG_RAISE_R*MF_ENG_RAISE_R;
    for(const B of blds){
      if(!B.alive||B.team!==uteam[i]||B.prog>=1) continue;
      const d=dist2(ux[i],uy[i],B.x,B.y);
      if(d<bd){bd=d;best=B;}
    }
    if(!best) continue;
    const n=Math.min(2,(best.tractorFrame===tick?(best.tractorN||0)+1:1));
    best.tractorT=.18; best.tractorN=n; best.tractorFrame=tick;
    uheal[i]=0.6; umov[i]=0;
    if(uteam[i]===0&&!mfEngRaiseAnnounced){
      mfEngRaiseAnnounced=true;
      toast('🔧 CONSTRUCTORS RAISE STRUCTURES — park one on a foundation to finish it faster');
    }
    if(n<=2&&perfScale>0.4)
      addBeam(ux[i],uy[i],best.x,best.y,2.4,170,220,255,0.12,'repair');
  }
}

const mfBayUnitTickBase=unitTick;
unitTick=function(dt){
  mfBayUnitTickBase(dt);
  mfEngineerRaiseTick();
};

/* Slot reuse across matches would leave a recycled unit index locked out for
   up to four seconds of the next battle, and the first-repair notice must be
   able to teach a returning player again. */
const mfBayResetWorldBase=resetWorld;
resetWorld=function(){
  mfBayResetWorldBase();
  mfBayHitT.fill(0); mfBayAcc=0; mfBayAnnounced=false; mfEngRaiseAnnounced=false;
};

/* ---- UI (takeover, not hud.js) ------------------------------------------
   The apron healed with no readout: HQ / Factory copy never mentioned it, the
   selection bar had no way to send a wrecked column home, and Fabricators hid
   their salvage-drone job behind "burns energy for mass". */

(function mfBayPatchCopy(){
  for(const k in MF_BAY_APRON){
    const T=BT[k];
    if(T&&T.desc&&T.desc.indexOf('apron')<0) T.desc+=' — damaged units mend on its apron';
  }
  if(BT.fab&&BT.fab.desc&&BT.fab.desc.indexOf('salvage')<0)
    BT.fab.desc+=' — salvage drones reclaim nearby wrecks';
})();

if(typeof intelBldLine==='function'){
  const mfBayBldLineBase=intelBldLine;
  intelBldLine=function(id,kit){
    let s=mfBayBldLineBase(id,kit)||'';
    if(MF_BAY_APRON[id]&&s.indexOf('apron')<0) s+=' Damaged units mend on its apron.';
    if(id==='fab'&&s.toLowerCase().indexOf('salvage')<0) s+=' Salvage drones reclaim nearby wrecks.';
    return s;
  };
}
if(typeof bldPanelStatText==='function'){
  const mfBayStatBase=bldPanelStatText;
  bldPanelStatText=function(B){
    let s=mfBayStatBase(B);
    if(B&&MF_BAY_APRON[B.type]&&B.prog>=1)
      s+='  ·  REPAIR APRON '+MF_BAY_APRON[B.type];
    if(B&&B.type==='fab'&&B.prog>=1&&typeof FAB_RECL_R==='number')
      s+='  ·  SALVAGE '+FAB_RECL_R;
    return s;
  };
}
if(typeof intelUnitPurpose==='function'){
  const mfBayUnitPurposeBase=intelUnitPurpose;
  intelUnitPurpose=function(T){
    if(T&&T.builder)
      return 'Unarmed mobile engineer. Raises foundations, auto-repairs nearby structures and salvages wrecks at 2× speed.';
    return mfBayUnitPurposeBase(T);
  };
}

function mfBayNearestApron(x,y,team){
  let best=null,bd=Infinity;
  const list=(typeof bldLive!=='undefined'&&bldLive.length)?bldLive:blds;
  for(const B of list){
    if(!B.alive||B.prog<1||B.team!==team||!MF_BAY_APRON[B.type]) continue;
    const d=dist2(x,y,B.x,B.y); if(d<bd){bd=d;best=B;}
  }
  return best;
}
function mfBayDamagedCombatSel(){
  const out=[];
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]||!usel[i]||uteam[i]!==0) continue;
    const T=TYPES[utype[i]];
    if(!T||T.builder||T.cat==='hero') continue;
    if(uhp[i]<uhpm[i]*0.995) out.push(i);
  }
  return out;
}
function mfBayOrderMend(){
  const U=mfBayDamagedCombatSel();
  if(!U.length){ toast('No damaged combat units in the selection'); sfx('reject'); return; }
  let ordered=0;
  for(const i of U){
    const B=mfBayNearestApron(ux[i],uy[i],uteam[i]);
    if(!B) continue;
    /* Park ON the pad. Standing a structure-radius outside the HQ would put
       a Goliath past a Factory's 115 apron, which is the whole point of MEND. */
    const a=Math.atan2(uy[i]-B.y,ux[i]-B.x), stand=Math.max(22,(B.r||20)*0.35);
    let x=B.x+Math.cos(a)*stand, y=B.y+Math.sin(a)*stand;
    if(typeof battlefieldClampPoint==='function'){ const p=battlefieldClampPoint(x,y,18); x=p[0]; y=p[1]; }
    utgt[i]=-1; uhold[i]=0; uPatrolRoute[i]=-1; uMoveCohort[i]=-1;
    utx[i]=x; uty[i]=y;
    /* Attack-move + march: they walk home, shoot what is already on them, and
       do not peel off to chase — the same contract as an AI recall column. */
    ustate[i]=2; umarch[i]=1;
    ordered++;
  }
  if(ordered){
    toast('🔧 '+ordered+' damaged unit'+(ordered===1?'':'s')+' → repair apron');
    if(typeof uiCommandAck==='function') uiCommandAck('move',ordered);
  } else { toast('No HQ, Factory, Airfield or Harbor apron is standing'); sfx('reject'); }
}
function mfBayCollectHot(want){
  if(!want||!mfBayDamagedCombatSel().length) return;
  want.push({kind:'local',fn:mfBayOrderMend,em:'🔧',nm:'MEND',
    ds:'Fall back to the nearest HQ, Factory, Airfield or Harbor apron'});
}

/* Idle-Constructor picker treated "standing still" as idle, so it stole
   engineers off a live raise/repair beam (`uheal` is that beam's latch). */
if(typeof selectIdleBuilders==='function'){
  selectIdleBuilders=function(){
    clearSel(); let n=0,fx=0,fy=0;
    for(let i=0;i<unitHigh;i++){
      if(!ualive[i]||uteam[i]!==0||!TYPES[utype[i]].builder||ustate[i]!==0) continue;
      if(uheal[i]>0) continue;
      usel[i]=1; n++; fx+=ux[i]; fy+=uy[i];
    }
    if(!n){ toast('No idle Constructors — build one or finish current orders'); sfx('reject'); return; }
    cam.x=fx/n; cam.y=fy/n; clampCam(); camUpdateMatrices();
    updateSelInfo(); toast('🔧 '+n+' idle Constructor'+(n===1?'':'s')+' selected'); uiCommandAck('select',n,cam.x,cam.y);
  };
}
