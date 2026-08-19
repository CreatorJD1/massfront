;
;
/* ============================================================
   SIMULATION v2 — 10k units, turrets, beams, terrain-aware
   ============================================================ */
// wk: p kinetic | b beam | e explosive | g gauss | f fire | s sonic | i ion | m melee | n none
const TYPES=[
 /* STRIKER WAS THE ANSWER TO EVERYTHING.
    Measured across the roster it sat at 1.346 damage-per-cost against a median
    of 0.383 — three and a half times the next tier of units — and it was ALSO
    near the top for health-per-cost. A unit that is simultaneously the most
    efficient attacker and one of the most durable is not a choice, it is the
    correct answer, and every other ground unit in the game existed as a worse
    version of it.
    The fix is not a flat nerf: it is giving the unit a shape. Cost up, damage
    down, and health cut hardest, so the Striker becomes what a tier-1 skirmisher
    should be — the fastest thing you can field and the first thing that dies.
    It still wins early because it arrives early, and it stops scaling into the
    late game where the heavy chassis are supposed to take over. */
 {name:'Striker',  spr:'bot',    tur:null,     size:12, r:4.4, hp:40,   dmg:5.4,rng:62,  cool:.65, spd:38, psp:340, ptype:0, aoe:0,  wk:'p', tg:'a',  cm:15,  ce:34,   bt:1.1, air:0, tier:1, legs:1},
 /* RHINO was the next universal answer after the Striker pass: 0.702 DPS and
    7.95 HP per mass, while also being the faster-to-field durable chassis.
    It needs to lead an early push, not erase the reason to graduate into a
    Goliath. The price increase does most of the work; the small stat trim keeps
    its head-on advantage from scaling back through the cheaper unit count. */
 {name:'Rhino',    spr:'tankH',  tur:'tankT',  size:16, r:6.0, hp:130,  dmg:16, rng:88,  cool:1.1, spd:27, psp:300, ptype:1, aoe:0,  wk:'p', tg:'a',  cm:26,  ce:100,  bt:2.6, air:0, tier:1},
 {name:'Goliath',  spr:'heavyH', tur:'heavyT', size:21, r:7.8, hp:450,  dmg:42, rng:104, cool:1.6, spd:22, psp:300, ptype:1, aoe:10, wk:'p', tg:'a',  cm:64,  ce:250,  bt:6.0, air:0, tier:2, legs:1},
 {name:'Thumper',  spr:'artyH',  tur:'artyT',  size:17, r:6.4, hp:135,  dmg:60, rng:265, cool:3.7, spd:22, psp:150, ptype:2, aoe:38, wk:'e', tg:'g',  cm:56,  ce:230,  bt:5.2, air:0, tier:2, minRng:80},
 {name:'Commander',spr:'cdr',    tur:null,     size:32, r:11.5,hp:5200,dmg:135, rng:140,cool:1.25,spd:30, psp:330, ptype:3, aoe:48, wk:'e', tg:'a',  cm:0,   ce:0,    bt:0,   air:0, tier:0, cat:'hero', hero:'nova', legs:1},
 {name:'Wasp',     spr:'gun',    tur:null,     size:15, r:5.4, hp:135,  dmg:13, rng:78,  cool:.75, spd:74, psp:380, ptype:0, aoe:0,  wk:'p', tg:'a',  cm:30,  ce:150,  bt:3.4, air:1, tier:1},
 {name:'Longbow',  spr:'longbow',tur:null,     size:16, r:5.8, hp:110,  dmg:95, rng:205, cool:3.0, spd:26, psp:0,   ptype:0, aoe:0,  wk:'b', tg:'a',  cm:60,  ce:240,  bt:5.5, air:0, tier:2},
 /* HORNET was the only strictly dominated purchase in the whole roster. Measured
    against the Vulture — a TIER ONE unit costing 6 less mass — it lost on
    splash-adjusted output (0.40 vs 1.57 per mass), on durability (3.23 vs 4.05
    hp per mass) AND on range (135 vs 190) simultaneously. Nothing was traded
    for that; the tech that unlocked it was simply wasted. Its case has always
    been that it shoots ground as well as air, so it now buys the longer reach
    of the two and still pays for it in efficiency — a decision instead of a
    trap. Numbers from tools/balance-audit.mjs, not from feel. */
 {name:'Hornet',   spr:'hornet', tur:null,     size:16, r:6.0, hp:210,  dmg:27, rng:175, cool:1.8, spd:40, psp:150, ptype:4, aoe:24, wk:'e', tg:'a',  cm:48,  ce:200,  bt:4.5, air:0, tier:2},
 {name:'TITAN',    spr:'titan',  tur:null,     size:46, r:18,  hp:14000,dmg:160,rng:175, cool:.5,  spd:15, psp:0,   ptype:0, aoe:0,  wk:'b', tg:'a',  cm:900, ce:3600, bt:45,  air:0, tier:3, legs:1},
 {name:'Pyro',     spr:'pyro',   tur:null,     size:16, r:6.0, hp:210,  dmg:11, rng:58,  cool:.38, spd:36, psp:130, ptype:5, aoe:18, wk:'m', tg:'g',  cm:40,  ce:160,  bt:3.5, air:0, tier:1, legs:1},
 /* VULTURE stays a hard counter — it cannot shoot ground at all, so a game with
    no enemy air makes its whole cost a dead stat, and that asymmetry earns it
    the best rate in the roster. But it was measured at 1.57 splash-adjusted
    output per mass against a tier-1 median of 0.58, and at 40 dps from 190px it
    was doing 70% of a STATIC anti-air emplacement's damage from a mobile
    tier-1 chassis while outranging every aircraft in the game. Air was not a
    counterplay problem, it was an unaffordable one. Trimmed to ~32 dps at
    172px: still the sharpest counter on the board, no longer an eraser. */
 {name:'Vulture',  spr:'vulture',tur:null,     size:16, r:6.0, hp:170,  dmg:52, rng:172, cool:1.6, spd:42, psp:300, ptype:8, aoe:26,  wk:'e', tg:'air',cm:42,  ce:170,  bt:3.6, air:0, tier:1},
 {name:'Bulwark',  spr:'bulwark',tur:null,     size:21, r:7.8, hp:950,  dmg:0,  rng:0,   cool:9,   spd:28, psp:0,   ptype:0, aoe:0,  wk:'n', tg:'a',  cm:90,  ce:380,  bt:7.0, air:0, tier:2, upkeepE:5},
 {name:'Ravager',  spr:'rav',    tur:null,     size:16, r:5.6, hp:118,  dmg:27, rng:20,  cool:.9, spd:49, psp:0,   ptype:0, aoe:0,  wk:'m', tg:'g',  cm:0,   ce:0,    bt:0,   air:0, tier:0, legs:1, brood:1, bldMul:1.55},
 {name:'Alpha Ravager',spr:'rav',tur:null,     size:28, r:10,  hp:780,  dmg:82, rng:26,  cool:1.25,spd:38, psp:0,   ptype:0, aoe:12, wk:'m', tg:'g',  cm:0,   ce:0,    bt:0,   air:0, tier:0, legs:1, brood:1, bldMul:1.75},
 /* Naval hulls are authored longer than land chassis. Applying the universal
    1.5x command-view exaggeration to their full `size` made a Dreadnought as
    large as a city block and left no room to read a fleet. `vscale` is render
    only: collision, selection tolerance, range, health and spacing stay on the
    measured simulation values above. */
 {name:'Corvette', spr:'corv',   tur:null,     size:20, r:7.5, hp:320,  dmg:24, rng:115, cool:1.0, spd:42, psp:120, ptype:6, aoe:0,  wk:'i', tg:'a',  cm:55,  ce:220,  bt:5.0, air:0, tier:1, naval:1,vscale:.66},
 {name:'Dreadnought',spr:'dread',tur:null,     size:32, r:12,  hp:1300, dmg:88, rng:290, cool:5.0, spd:20, psp:150, ptype:2, aoe:34, wk:'e', tg:'g',  cm:170, ce:680,  bt:12,  air:0, tier:2, naval:1,vscale:.54},
 {name:'Bombard',  spr:'bombH',  tur:'bombT',  size:21, r:8,   hp:400,  dmg:95, rng:400, cool:5.8, spd:14, psp:150, ptype:9, aoe:44, wk:'e', tg:'g',  cm:140, ce:560,  bt:10,  air:0, tier:2, minRng:100},
 {name:'Raptor',   spr:'raptor', tur:null,     size:18, r:6.5, hp:280,  dmg:85, rng:52,  cool:3.8, spd:62, psp:130, ptype:7, aoe:32, wk:'e', tg:'g',  cm:70,  ce:330,  bt:6.5, air:1, tier:1},
 /* SCORCHER is the Pyro's graduation and had the Pyro's profile exactly
    inverted. Classed as BEAM it did x1.60 into heavy plate and x0.60 into
    light — measured, the second-hardest anti-heavy weapon in the game, on a
    flamethrower. A player who learns at tier 1 that flame cooks infantry got
    punished for carrying that lesson forward, and the roster quietly had a
    95-mass answer to armour that no card advertised.
    Now INCENDIARY, which is what the sprite, the thermal-gel projectile and
    the tier-1 version all already said. Per-shot damage comes down with it:
    incendiary carries the largest crowd multiplier in WK_HORDE, so keeping 15
    would have made this the best unit in the game against everything light. */
 {name:'Scorcher', spr:'pyro',   tur:null,     size:24, r:8.5, hp:640,  dmg:13, rng:80,  cool:.34, spd:24, psp:140, ptype:5, aoe:38, wk:'f', tg:'g',  cm:95,  ce:390,  bt:7.5, air:0, tier:2},
 /* CONSTRUCTOR — unarmed, and the only mobile source of build range besides
    the Commander. Cheap enough to lose, valuable enough to escort. */
 {name:'Constructor',spr:'bot',  tur:null,     size:15, r:5.6, hp:220,  dmg:0,  rng:0,   cool:9,   spd:44, psp:0,   ptype:0, aoe:0,  wk:'n', tg:'a',  cm:35,  ce:140,  bt:4.0, air:0, tier:1, builder:1, legs:1},
 /* ==========================================================================
    SECOND WAVE — the roles the original roster had no answer for.
    Every entry here exists because something was unanswerable without it:
    a shield with no counter, a swarm with no crowd control, heavy armour that
    only one unit could hurt, and a tech tree with nothing between tier 1 chaff
    and a nine-hundred-mass titan.
    ========================================================================== */
 {name:'Reaper',   spr:'reaper', tur:null,     size:19, r:7.0, hp:300,  dmg:26, rng:120, cool:1.5, spd:30, psp:230, ptype:8, aoe:52, wk:'e', tg:'g',  cm:72,  ce:290,  bt:5.4, air:0, tier:2, cat:'aoe'},
 {name:'Cinder',   spr:'cinder', tur:null,     size:17, r:6.2, hp:260,  dmg:19, rng:96,  cool:1.1, spd:34, psp:170, ptype:2, aoe:46, wk:'f', tg:'g',  cm:58,  ce:230,  bt:4.4, air:0, tier:2, cat:'aoe'},
 {name:'Lancer',   spr:'lancer', tur:null,     size:18, r:6.6, hp:190,  dmg:150,rng:230, cool:4.2, spd:24, psp:900, ptype:1, aoe:0,  wk:'g', tg:'a',  cm:82,  ce:330,  bt:6.2, air:0, tier:2, cat:'at'},
 /* Labelled ANTI-TANK, it does x1.05 into heavy armour — the intel panel was
    printing "High-damage armor hunter" over a unit that is mediocre against
    armour on purpose (see WKM.s). Its real job is the only thing in the roster
    that ignores the Bulwark bubble, which no screen said out loud. `cat` is now
    honest; the pierce is advertised in the intel copy instead. Both categories
    feed the same assault class ability, so nothing is lost. */
 {name:'Resonator',spr:'reson',  tur:null,     size:18, r:6.6, hp:340,  dmg:34, rng:130, cool:1.7, spd:28, psp:240,   ptype:6, aoe:18, wk:'s', tg:'a',  cm:66,  ce:270,  bt:5.0, air:0, tier:2, cat:'veh'},
 {name:'Warden',   spr:'warden', tur:null,     size:16, r:6.0, hp:420,  dmg:0,  rng:0,   cool:9,   spd:36, psp:0,   ptype:0, aoe:0,  wk:'n', tg:'a',  cm:62,  ce:250,  bt:5.0, air:0, tier:2, cat:'sup', medic:1},
 {name:'Kestrel',  spr:'kestrel',tur:null,     size:14, r:5.2, hp:120,  dmg:14, rng:150, cool:1.0, spd:96, psp:420, ptype:0, aoe:0,  wk:'p', tg:'a',  cm:34,  ce:150,  bt:3.0, air:1, tier:1, cat:'air', scout:1},
 {name:'Basilisk', spr:'basil',  tur:'basilT', size:26, r:9.5, hp:1100, dmg:120,rng:190, cool:2.6, spd:18, psp:340, ptype:1, aoe:20, wk:'g', tg:'a',  cm:260, ce:1050, bt:14,  air:0, tier:3, cat:'exp'},
 {name:'Harbinger',spr:'harb',   tur:null,     size:24, r:9.0, hp:760,  dmg:44, rng:210, cool:2.0, spd:22, psp:200, ptype:7, aoe:60, wk:'e', tg:'g',  cm:190, ce:760,  bt:11,  air:0, tier:3, cat:'aoe'},
 /* ---- FACTION HEROES ------------------------------------------------------
    One per faction, and each one changes how its army plays rather than just
    hitting harder. They are never buildable: a faction fields its own. */
 {name:'Lord Darion Vex',  spr:'praetor',tur:null,     size:34, r:12,  hp:6200, dmg:130,rng:250, cool:2.4, spd:22, psp:210, ptype:9, aoe:70, wk:'e', tg:'a',  cm:0,   ce:0,    bt:0,   air:0, tier:0, cat:'hero', legs:1, hero:'legion'},
 /* rng 165 outranged every basic defence in the game (turret/bunker 155) —
    combined with the fastest hero chassis it made the green Commander a solo
    army: kite, farm, never get hit. 150 keeps the raid identity (fast, long
    for a hero) but puts it inside defensive fire. */
 {name:'Broker Lys Renn',   spr:'archon', tur:null,     size:30, r:11,  hp:4600, dmg:70, rng:150, cool:.55, spd:38, psp:240,   ptype:6, aoe:10, wk:'s', tg:'a',  cm:0,   ce:0,    bt:0,   air:0, tier:0, cat:'hero', hero:'syndicate'},
 {name:'The Brood Sovereign',spr:'brood',tur:null,     size:38, r:14,  hp:7400, dmg:110,rng:34,  cool:1.2, spd:30, psp:0,   ptype:0, aoe:26, wk:'m', tg:'g',  cm:0,   ce:0,    bt:0,   air:0, tier:0, cat:'hero', legs:1, hero:'horde', brood:1, bldMul:1.65},
 /* A Tidecaster is not built. A critical mass of nearby Ravagers grows one,
    trading an individual body for coordination, speed and a target-minded
    tide. Its own health stays deliberately low: the counterplay is to pick the
    leader out of the crowd and let the mass dissolve back into animals. */
 {name:'Brood Tidecaster',spr:'brood',tur:null, size:24, r:8.5, hp:390, dmg:24, rng:142, cool:2.4, spd:40, psp:175, ptype:6, aoe:26, wk:'s', tg:'a', cm:0, ce:0, bt:0, air:0, tier:0, cat:'sup', legs:1, brood:1, caster:1, bldMul:1.35},
 /* Mobile resource utility. Prospectors earn less than an Extractor but can
    work a field before territory reaches it; the authored mining beam makes
    the economic action readable from the ordinary battle camera. */
 {name:'Prospector',spr:'warden',tur:null, size:17, r:6.2, hp:190, dmg:0, rng:0, cool:9, spd:39, psp:0, ptype:0, aoe:0, wk:'n', tg:'a', cm:52, ce:210, bt:5.0, air:0, tier:1, cat:'sup', miner:1},
];
/* UNIT CATEGORIES. Used by the build menu, the unit card and the AI's
   composition logic, so a role is a real thing the game reasons about rather
   than a description in a tooltip. */
const UCAT={
  inf:{nm:'INFANTRY',  em:'🤖'}, veh:{nm:'ARMOUR',    em:'🛡'},
  at :{nm:'ANTI-TANK', em:'🎯'}, aoe:{nm:'CROWD CONTROL', em:'💥'},
  art:{nm:'ARTILLERY', em:'💣'}, aa :{nm:'ANTI-AIR',  em:'🛩'},
  air:{nm:'AIRCRAFT',  em:'✈'},  nav:{nm:'NAVAL',     em:'⚓'},
  sup:{nm:'SUPPORT',   em:'🛠'}, exp:{nm:'EXPERIMENTAL', em:'☢'},
  hero:{nm:'HERO',     em:'★'}
};
/* Fill in the categories the original roster never declared, from what each
   unit actually does. Doing it here rather than by hand in every row keeps the
   table readable and the classification in one place. */
(function classify(){
  const byName={
    Striker:'inf', Rhino:'veh', Goliath:'veh', Thumper:'art', Commander:'hero',
    Wasp:'air', Longbow:'at', Hornet:'veh', TITAN:'exp', Pyro:'inf',
    Vulture:'aa', Bulwark:'sup', Ravager:'inf', 'Alpha Ravager':'exp',
    Corvette:'nav', Dreadnought:'nav', Bombard:'art', Raptor:'air',
    Scorcher:'aoe', Constructor:'sup'
  };
  for(const T of TYPES) if(!T.cat) T.cat=byName[T.name]||'veh';
})();
const MF_DOM_LAND=1,MF_DOM_AIR=2,MF_DOM_NAVAL=4;
function mfDomainOfType(T){return T.air?MF_DOM_AIR:T.naval?MF_DOM_NAVAL:MF_DOM_LAND;}
for(const T of TYPES){
  T.domainMask=mfDomainOfType(T);
  T.targetMask=T.tg==='air'?MF_DOM_AIR:T.tg==='g'?(MF_DOM_LAND|MF_DOM_NAVAL):(MF_DOM_LAND|MF_DOM_AIR|MF_DOM_NAVAL);
  T.preferMask=T.cat==='aa'?MF_DOM_AIR:T.naval?MF_DOM_NAVAL:(T.air&&T.tg!=='g'?MF_DOM_AIR:0);
}
function mfTargetAllowed(T,j){return !!(T.targetMask&mfDomainOfType(TYPES[utype[j]]));}
function mfCombatFactionTeam(team){
  if(team===0)return (typeof playerFaction!=='undefined'&&playerFaction)||'nova';
  if(team===1)return (typeof AI!=='undefined'&&AI&&AI.fac)||'legion';
  return 'horde';
}
function mfCombatFaction(i){return mfCombatFactionTeam(uteam[i]);}
/* Weapon family still owns the projectile silhouette. This palette is a thin
   army signature layered around it: cold precision for Nova, furnace heat for
   Dominion, split-spectrum phase energy for Syndicate, and bile/spores for
   Brood. Keeping it here makes Canvas particles and WebGL ordnance resolve the
   same faction even in mirror matches. */
function mfFactionFxPalette(team){
  const f=mfCombatFactionTeam(team);
  if(f==='legion')return {key:f,a:[255,72,42],b:[255,178,70]};
  if(f==='syndicate')return {key:f,a:[91,238,183],b:[180,82,255]};
  if(f==='horde')return {key:f,a:[186,82,245],b:[167,255,78]};
  return {key:'nova',a:[88,218,255],b:[234,252,255]};
}
function mfDomainSpeedMul(i){
  const T=TYPES[utype[i]],f=mfCombatFaction(i);
  return f==='syndicate'&&(T.air||T.naval)?1.10:f==='legion'&&T.naval?.92:1;
}
function mfDomainDamageMul(i,tg){
  if(tg<0)return 1;
  const A=TYPES[utype[i]],D=mfDomainOfType(TYPES[utype[tg]]),f=mfCombatFaction(i);
  if(f==='nova'&&A.air&&D===MF_DOM_AIR)return 1.10;
  if(f==='legion'&&A.naval&&D===MF_DOM_NAVAL)return 1.15;
  if(f==='syndicate'&&((A.air&&D===MF_DOM_AIR)||(A.naval&&D===MF_DOM_NAVAL)))return 1.12;
  return 1;
}
const UT_ENGINEER=19;                       // index of the Constructor in TYPES
const UT_BROOD_CASTER=31, UT_MINER=32;
const SHIELD_REDUCE=0.72, SHIELD_R=95;
const AGGRO_MULT=1.9, AGGRO_ADD=70;
const TITAN_STOMP_DMG=210, TITAN_STOMP_R=85;

// ---------- unit arrays ----------
const ux=new Float32Array(MAXU), uy=new Float32Array(MAXU);
const uang=new Float32Array(MAXU), uturr=new Float32Array(MAXU);
const utx=new Float32Array(MAXU), uty=new Float32Array(MAXU);
const uhp=new Float32Array(MAXU), uhpm=new Float32Array(MAXU);
const ucool=new Float32Array(MAXU), ubuff=new Float32Array(MAXU), ustomp=new Float32Array(MAXU);
/* Separate from ustomp on purpose: sharing one timer between a hero ability
   and commander reclaim meant whichever ran first in the tick starved the
   other for good. */
const ureclaim=new Float32Array(MAXU);
/* Contextual class abilities use their own effect channel. `ubuff` is the
   Commander surge and intentionally boosts everything; class doctrine needs
   narrower, readable trades so an interceptor does not receive the same buff
   as a breakthrough tank. 1=breakthrough, 2=intercept, 3=service shield. */
const uclassBuff=new Uint8Array(MAXU), uclassBuffT=new Float32Array(MAXU);
function classDmgMul(i){return uclassBuffT[i]>0&&uclassBuff[i]===1?1.28:uclassBuffT[i]>0&&uclassBuff[i]===2?1.12:1;}
function classCoolMul(i){return uclassBuffT[i]>0&&uclassBuff[i]===1?.78:uclassBuffT[i]>0&&uclassBuff[i]===2?.65:1;}
function classSpdMul(i){return uclassBuffT[i]>0&&uclassBuff[i]===1?1.22:uclassBuffT[i]>0&&uclassBuff[i]===2?1.58:1;}
function classRngMul(i){return uclassBuffT[i]>0&&uclassBuff[i]===2?1.22:1;}
function classTakenMul(i){return uclassBuffT[i]>0&&uclassBuff[i]===1?1.12:uclassBuffT[i]>0&&uclassBuff[i]===2?.86:uclassBuffT[i]>0&&uclassBuff[i]===3?.72:1;}
/* Brood leadership is intentionally offensive utility rather than hidden
   bonus health. A player who kills the visible Tidecaster immediately strips
   the speed, damage and cadence from every nearby creature. */
const ubroodLed=new Float32Array(MAXU), uMineT=new Float32Array(MAXU);
const uMineNode=new Int16Array(MAXU); uMineNode.fill(-1);
function broodDmgMul(i){return ubroodLed[i]>0?1.18:1;}
function broodCoolMul(i){return ubroodLed[i]>0?.82:1;}
function broodSpdMul(i){return ubroodLed[i]>0?1.14:1;}
const utype=new Uint8Array(MAXU), uteam=new Uint8Array(MAXU);
/* -1 = directly commanded player/enemy/wildlife; 0..2 = shared-control allied
   AI slot. Same-team combat rules make allies genuinely friendly while this
   owner tag lets their lightweight director move only its own reinforcements. */
const uAllyBase=new Int8Array(MAXU);uAllyBase.fill(-1);
/* Commander owner for population ledgers. Same ids as skirmish spawn:
   -1 player, 0..2 = aiSlots. Team 0 copies this into uAllyBase so the
   ally director keeps matching on the tag it already owns. */
const uCmd=new Int8Array(MAXU);uCmd.fill(-1);
const ualive=new Uint8Array(MAXU), ustate=new Uint8Array(MAXU);
const usel=new Uint8Array(MAXU);
const utgt=new Int32Array(MAXU);
/* ---- UNIT HANDLES ----------------------------------------------------------
   Slots are recycled the instant a unit dies, and with tens of thousands of
   insects churning the free list every second a slot can be reborn on a
   different team between one frame and the next. Every consumer checked that
   its target index was ALIVE; none checked that it was still the same unit. So
   a tank kept firing at "its" target after that index had been refilled by a
   friendly, and an in-flight shell homed on and damaged whoever now occupied
   the slot.

   Each slot therefore carries a GENERATION, bumped on every spawn. A target is
   valid only if the slot is alive AND its generation still matches the one
   recorded when the target was acquired. `utgtg` and `ptgtg` hold the expected
   generation for unit targets and projectile targets respectively. */
const ugen=new Int32Array(MAXU);
const uwalk=new Float32Array(MAXU);       // gait phase, advanced by distance covered
const utgtg=new Int32Array(MAXU);
function liveTgt(tg,gen){ return tg>=0 && ualive[tg] && ugen[tg]===gen; }
/* Hostility is checked separately: a valid handle can still point at an ally
   once orders, splash re-targeting or a captured slot get involved. */
function foeTgt(self,tg,gen){ return liveTgt(tg,gen) && uteam[tg]!==uteam[self]; }
const ukills=new Uint16Array(MAXU), uvet=new Uint8Array(MAXU);
const umov=new Uint8Array(MAXU);   // moving flag → drives baked walk cycles
const ushielded=new Float32Array(MAXU);
const ufield=new Int16Array(MAXU);
/* Seconds of environmental debuff remaining — dust, EMP dazzle, concussion.
   Set by src/hazards.js, read in exactly two places: movement speed and weapon
   range. One array rather than one per hazard, because every hazard that
   degrades a unit degrades it the same way: it cannot see and it cannot run. */
const uhaz=new Float32Array(MAXU);
const HAZ_SPD=0.72, HAZ_RNG=0.70;
/* Fire persistence: seconds of flame remaining per unit. Set by incendiary
   hits (wk==='f') in dealDamage, drives persistent flame particles in
   unitTick, and spawns extra fire on death in killUnit. */
const ufireT=new Float32Array(MAXU);
/* MARCH ORDER. Set on the units of an AI attack wave while it is crossing the
   map (see ai.js), cleared when the wave breaks or arrives.

   It exists because of a specific failure: the neutral bug infestation seeds its
   hives away from BOTH starting corners, which puts them squarely in the middle
   — directly on the only path between the two bases. A wave using ordinary
   attack-move stopped for every bug it met, ground to a halt around the
   midpoint, and eventually retreated. The player's chosen opponent never
   arrived and the match was, in practice, always against the wildlife.

   A marching column keeps walking and shoots on the move. It still returns fire
   — weapons are independent of movement — it simply does not adopt a bug as a
   destination. Only while EN ROUTE: within arrival range the flag is cleared and
   normal engagement resumes, so this cannot make a wave ignore the base it came
   to attack. */
const umarch=new Uint8Array(MAXU);
/* EMP stun, in seconds. A stunned unit neither moves nor fires. Declared here
   with the rest of the per-unit state so it is impossible to miss when reading
   what a slot carries — and it is cleared in spawnUnit() alongside the others,
   because a recycled slot inherits every array it is not explicitly told to
   reset. That exact omission on umarch shipped as a live bug in 1.32.18. */
const ustun=new Float32Array(MAXU);
/* Seconds since a unit last took a real hit (counts DOWN from 6). Only heroes
   read it: commander regeneration drops to quarter strength while under fire,
   so focus fire accumulates instead of being mopped up between volleys. This
   is the difference between a hero that raids and a hero that solos. */
const uHurtT=new Float32Array(MAXU);
/* Seconds remaining on a live support beam (Warden heal / Constructor repair).
   Drives the aura effect between cadence scans without re-scanning every frame,
   and is cleared in spawnUnit() like every other per-slot array. */
const uheal=new Float32Array(MAXU);
let freeList=[], unitHigh=0;
const teamCount=[0,0,0];
/* Population is a gameplay budget AND a mobile stability budget. MAXU remains
   large because the renderer and save format need a wide slot address space.
   Each commander SEAT is FACTION_POP_CAP (1000). Compact 2 seats → 2000,
   standard 3 → 3000, large 4 → 4000. That 4000 is the theatre SUM, never a
   team blob and never this constant. HUD chip is the player seat (Track 5
   hudPlayerPop). SESS_MAX_UNITS=4000 is a map-total snapshot — debt, not a
   pop cap. Do not set this to 2000 or 4000. */
const FACTION_POP_CAP=1000;
const POP_PLAYER_SLOT=-1;
const popCmdCount=new Uint16Array(4);   // index 0 = player (-1), 1..3 = aiSlots 0..2
const simHot={unitTickMs:0,live:0,team0:0,team1:0,team2:0};
function populationTheatre(){
  const k=typeof battlefieldPresetKey==='function'&&typeof battlefieldPreset!=='undefined'
    ?battlefieldPresetKey(battlefieldPreset):'standard';
  return k==='compact'||k==='large'?k:'standard';
}
function populationPlayerSlot(){ return POP_PLAYER_SLOT; }
function popCmdIndex(slot){
  const s=slot==null?POP_PLAYER_SLOT:slot|0;
  if(s<-1||s>2) return 0;
  return s+1;
}
function popCmdInc(slot){ popCmdCount[popCmdIndex(slot)]++; }
function popCmdDec(slot){ const k=popCmdIndex(slot); if(popCmdCount[k]) popCmdCount[k]--; }
function nCommandersOnTeam(team){
  /* Match-setup count, not living heroes: a dead commander must not shrink
     the team ceiling and strand the army that still belongs to that slot. */
  if(team===0){
    let n=1;
    if(typeof AI!=='undefined'&&AI&&AI.allies&&AI.allies.length) n+=AI.allies.length;
    return n;
  }
  if(team===1){
    if(typeof AI!=='undefined'&&AI&&AI.bases&&AI.bases.length) return AI.bases.length;
    return Math.max(1, enemyHeroIdxs.length||1);
  }
  return 0;
}
function populationTeamCeiling(team){
  if(team===0||team===1) return FACTION_POP_CAP*nCommandersOnTeam(team);
  return populationCapFor(team);
}
function populationCapFor(team){
  /* Per-team DISPLAY helper stays 1000 (or wildlife bugCap). Callers that
     need a theatre total use populationTeamCeiling. */
  if(team===2&&!(typeof broodIsEnemy==='function'&&broodIsEnemy())&&typeof bugCap==='function')return bugCap();
  return FACTION_POP_CAP;
}
function populationUsedFor(team){
  if((team===1||team===2)&&typeof broodIsEnemy==='function'&&broodIsEnemy())return teamCount[1]+teamCount[2];
  return teamCount[team]||0;
}
function populationCapForCommander(slot){
  return FACTION_POP_CAP;
}
function populationUsedForCommander(slot){
  return popCmdCount[popCmdIndex(slot)]||0;
}
function populationDefaultSeat(team,x,y){
  if(team===0) return POP_PLAYER_SLOT;
  /* Team 1 must never fall through to the player bucket (-1). Missing tags
     bind to the nearest enemy base, else aiSlots[0]. */
  if(typeof AI!=='undefined'&&AI&&AI.bases&&AI.bases.length){
    if(x!=null&&y!=null){
      let best=AI.bases[0],bd=1e18;
      for(const B of AI.bases){
        const d=dist2(x,y,B.x,B.y);
        if(d<bd){bd=d;best=B;}
      }
      if(best&&best.slot!=null) return best.slot;
    }
    if(AI.bases[0]&&AI.bases[0].slot!=null) return AI.bases[0].slot;
  }
  return 0;
}
function commanderSlotForBuilding(B){
  if(!B) return POP_PLAYER_SLOT;
  if(B.team===0) return B.allyAI==null?POP_PLAYER_SLOT:B.allyAI;
  if(B.team===1){
    if(B.aiBaseSlot!=null) return B.aiBaseSlot;
    return populationDefaultSeat(1,B.x,B.y);
  }
  return POP_PLAYER_SLOT;
}
function populationResolveSlot(team,cmdSlot,x,y){
  if(team===0) return (cmdSlot==null||cmdSlot<-1)?POP_PLAYER_SLOT:cmdSlot|0;
  if(team===1||(team===2&&typeof broodIsEnemy==='function'&&broodIsEnemy()))
    return (cmdSlot==null||cmdSlot<0)?populationDefaultSeat(1,x,y):cmdSlot|0;
  return POP_PLAYER_SLOT;
}
function populationCanSpawn(type,team,slot,x,y){
  const T=TYPES[type];
  if(!T||team<0||team>2)return false;
  /* A scripted Commander arrival must never be deleted because ordinary units
     filled the last slot one frame earlier. Commanders are spawned at setup,
     so this exception cannot be used by factories to exceed the cap. */
  if(T.cat==='hero') return true;
  if(team===2){
    if(typeof broodIsEnemy==='function'&&broodIsEnemy()){
      const s=populationResolveSlot(2,slot,x,y);
      return populationUsedForCommander(s)<populationCapForCommander(s);
    }
    return populationUsedFor(2)<populationCapFor(2);
  }
  /* Each seat is 1000. One booming seat cannot eat the team's theatre share.
     Economy wallets stay shared until Track 4 Stage 3. */
  if(populationUsedFor(team)>=populationTeamCeiling(team)) return false;
  const s=populationResolveSlot(team,slot,x,y);
  return populationUsedForCommander(s)<populationCapForCommander(s);
}
function assignUnitCommander(i,slot){
  if(i<0||!ualive[i]||uteam[i]>1) return;
  const next=populationResolveSlot(uteam[i],slot,ux[i],uy[i]);
  const prev=uCmd[i];
  if(prev===next){
    if(uteam[i]===0) uAllyBase[i]=next;
    return;
  }
  popCmdDec(prev);
  uCmd[i]=next;
  if(uteam[i]===0) uAllyBase[i]=next;
  popCmdInc(next);
}
function populationResetLedgers(){
  popCmdCount.fill(0); uCmd.fill(-1);
}
function populationRecountLedgers(){
  popCmdCount.fill(0);
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]) continue;
    if(uteam[i]<2) popCmdInc(uCmd[i]);
    else if(uteam[i]===2&&uCmd[i]>=0) popCmdInc(uCmd[i]);
  }
}
const titanCount=[0,0];
let heroIdx=-1, enemyHeroIdx=-1, enemyHeroIdxs=[];
function isEnemyCommander(i){ return enemyHeroIdxs.indexOf(i)>=0; }
function livingEnemyCommanders(){
  enemyHeroIdxs=enemyHeroIdxs.filter(i=>i>=0&&ualive[i]&&uteam[i]===1);
  enemyHeroIdx=enemyHeroIdxs.length?enemyHeroIdxs[0]:-1;
  return enemyHeroIdxs;
}
function unitIsBrood(i){
  return uteam[i]===2 || !!(TYPES[utype[i]]&&TYPES[utype[i]].brood) ||
    (uteam[i]===1 && typeof AI!=='undefined' && AI.fac==='horde');
}

/* GROUND ESCAPE. Slope gating can turn a cell a unit is standing on into
   blocked ground - a crater rim raised under it, a foundation pad levelled
   beside it, or simply the gate switching on mid-match. Only the commander
   had a way out (commanderTerrainRecovery, hero-gated on its first line);
   every other ground unit would press against the wall forever, because the
   movement code refuses the step and nothing ever re-sites the unit.

   Deliberately quiet: no jets, no toast, no particles. This is a correctness
   backstop, not an ability, and if it ever fires in bulk that is a bug in the
   gate rather than something to celebrate on screen. Counted so a probe can
   assert it stays near zero.

   Runs only for units that are BOTH stuck and standing on blocked ground -
   a unit merely blocked by a crowd is the flow field's problem, not this. */
let groundRescues=0;
const uStuckFor=new Float32Array(MAXU);
function groundTerrainRecovery(i,travel,dt){
  if(!ualive[i]) return;
  const T=TYPES[utype[i]];
  if(!T||T.air||T.naval) return;
  if(i===heroIdx) return;                 // the hero has its own, louder path
  const blocked=(typeof isWalkable==="function"&&!isWalkable(ux[i],uy[i]));
  if(!blocked){ uStuckFor[i]=0; return; }
  uStuckFor[i]+=dt;
  if(uStuckFor[i]<1.2) return;            // ride out transient deforms
  uStuckFor[i]=0;
  const P=findLand(ux[i],uy[i]);
  if(!P) return;                          // nowhere to go: leave it rather than teleport into the sea
  if(P[0]===ux[i]&&P[1]===uy[i]) return;
  ux[i]=P[0]; uy[i]=P[1];
  utgt[i]=-1; utgtg[i]=-1; ufield[i]=-1;
  groundRescues++;
}

function findLand(x,y){
  if(isWalkable(x,y)) return [x,y];
  for(let r=20;r<400;r+=24){
    for(let a=0;a<TAU;a+=0.7){
      const nx=clamp(x+Math.cos(a)*r,10,MAP-10), ny=clamp(y+Math.sin(a)*r,10,MAP-10);
      if(isWalkable(nx,ny)) return [nx,ny];
    }
  }
  return [x,y];
}
function findWater(x,y){
  /* Only the authored, connected water body is navigable. Treating every
     non-walkable cell as water sent ships into craters, cliffs and the fake
     land beyond irregular map borders. */
  if(typeof isNavigableWater==='function'&&isNavigableWater(x,y,true)) return [x,y];
  for(let r=20;r<900;r+=22){
    for(let a=0;a<TAU;a+=0.6){
      const nx=clamp(x+Math.cos(a)*r,10,MAP-10), ny=clamp(y+Math.sin(a)*r,10,MAP-10);
      if(typeof isNavigableWater==='function'&&isNavigableWater(nx,ny,true)) return [nx,ny];
    }
  }
  return null;
}
const upx1=new Float32Array(MAXU), upy1=new Float32Array(MAXU),
      upx2=new Float32Array(MAXU), upy2=new Float32Array(MAXU);   // patrol endpoints
/* Multi-waypoint patrol ownership. A route stores one formation slot per unit
   at every waypoint; these compact per-unit arrays only say which route, slot,
   and waypoint the live unit is currently using. */
const uPatrolRoute=new Int16Array(MAXU), uPatrolStep=new Uint8Array(MAXU),
      uPatrolSlot=new Uint16Array(MAXU);
uPatrolRoute.fill(-1);
const patrolRoutes=[];
/* A formation order is more than N unrelated destinations. Cohorts remember
   which live handles share a move so faster chassis can pace the rear instead
   of turning the whole platoon into a long single-file smear. The ring is
   bounded: issuing hundreds of orders cannot grow match memory forever. */
const MOVE_COHORT_MAX=64,moveCohorts=new Array(MOVE_COHORT_MAX);
const uMoveCohort=new Int16Array(MAXU),uCohesion=new Float32Array(MAXU);
uMoveCohort.fill(-1);uCohesion.fill(1);
let moveCohortNext=0;
function allocMoveCohort(sel,targets,form){
  if(sel.length<2) return -1;
  const ci=moveCohortNext++%MOVE_COHORT_MAX,old=moveCohorts[ci];
  if(old) for(const e of old.members) if(ualive[e[0]]&&ugen[e[0]]===e[1]&&uMoveCohort[e[0]]===ci) uMoveCohort[e[0]]=-1;
  moveCohorts[ci]={members:sel.map((i,k)=>[i,ugen[i],k]),targets,form,created:stats.t};
  return ci;
}
function tickMoveCohorts(){
  uCohesion.fill(1,0,unitHigh);
  for(let ci=0;ci<MOVE_COHORT_MAX;ci++){
    const C=moveCohorts[ci];if(!C)continue;
    const live=C.members.filter(e=>ualive[e[0]]&&ugen[e[0]]===e[1]&&uteam[e[0]]===0&&uMoveCohort[e[0]]===ci);
    C.members=live;
    if(!live.length){moveCohorts[ci]=null;continue;}
    let far=0,arrived=0;
    for(const e of live){
      const i=e[0],P=C.targets[e[2]];if(!P)continue;
      const d=Math.hypot(ux[i]-P.x,uy[i]-P.y);far=Math.max(far,d);if(d<=12)arrived++;
    }
    if(arrived===live.length){
      for(const e of live)uMoveCohort[e[0]]=-1;
      moveCohorts[ci]=null;continue;
    }
    for(const e of live){
      const i=e[0],P=C.targets[e[2]];if(!P)continue;
      const d=Math.hypot(ux[i]-P.x,uy[i]-P.y),lead=far-d;
      /* Only leaders are throttled. Rear units keep their authored speed, so
         cohesion never makes a slow vehicle even slower or deadlock the move. */
      uCohesion[i]=d<=12&&far>34?.18:lead>140?.52:lead>75?.76:1;
    }
  }
}
const uhold=new Uint8Array(MAXU);                                 // hold-position stance

/* ================= GUARD (escort) + QUEUED ORDERS =========================
   Two orders the genre treats as basic that this simulation had no state for.

   GUARD is `ustate===7`. It is NOT `umode===2`, which the stance table also
   calls GUARD: that one is the dug-in combat stance (−45% damage taken, −60%
   speed) and lives in the abilities popover. The collision is inherited; keep
   the two apart when reading this file.

   What makes a guard order different from an attack-move parked on top of a
   friendly is that every decision is taken FROM THE ANCHOR, not from wherever
   the escort happens to be standing: threats are searched around the guarded
   thing, and a lock is dropped as soon as the enemy leaves the anchor's leash.
   Searching from the escort is what turns an escort into a wandering
   attack-move that abandons the thing it was told to protect — the exact
   failure the order exists to prevent.

   QUEUED ORDERS are per-unit chains, advanced per unit. Platoon-synchronised
   advance is what tickPatrolRoutes does for patrol legs, and it is the wrong
   rule here: one damaged straggler must not hold the whole force at node 2.
   C&C3 and SupCom both advance per unit, so a slow chassis simply arrives late
   and catches up at the next node. */
const uGuard=new Int32Array(MAXU), uGuardG=new Int32Array(MAXU);
uGuard.fill(-1); uGuardG.fill(-1);
/* Stand-off ring, threat radius and leash — all measured from the anchor.
   ENGAGE < LEASH deliberately: the escort takes the fight that comes to the
   thing it guards and follows it a little way, but breaks off long before it
   can be baited out of position by a single fast scout. */
const GUARD_STAND=52, GUARD_ENGAGE=230, GUARD_LEASH=330;
/* null | array of steps. A plain array, not a typed array: depth is bounded
   by QUEUE_MAX and only ever holds a chain a player placed by hand, so 34k
   mostly-null slots is cheaper than eight parallel typed arrays. */
const uQueue=new Array(MAXU);
const QUEUE_MAX=8;
/* Kind of the LIVE node (not the remaining chain). 0 waypoint, 1 named chase,
   2 guard. queueTick used to wait on any lock, so a stray scout on node 1
   froze an entire A-MOVE chain. Kind is one byte because the alternative is
   sniffing umarch/ufield, which air waypoints and named chases share. */
const uQkind=new Uint8Array(MAXU);

function guardEntityLive(h,g){
  if(h>=0) return !!(ualive[h]&&ugen[h]===g&&uteam[h]===0);
  if(h<=-2){ const B=blds[-2-h]; return !!(B&&B.alive&&B.team===0); }
  return false;
}
function guardEntityPos(h){
  if(h>=0) return [ux[h],uy[h],TYPES[utype[h]].r||6];
  const B=blds[-2-h]; return [B.x,B.y,B.r||18];
}
/* Position of any order handle in the encoding orders already use everywhere:
   >=0 unit slot, relic handle, or -2-b for a building. */
function orderTgPos(tg){
  if(tg>=0) return ualive[tg]?[ux[tg],uy[tg]]:null;
  if(typeof isRelicTg==='function'&&isRelicTg(tg)){
    const R=relics[relicOf(tg)]; return R&&R.alive?[R.x,R.y]:null;
  }
  const B=blds[-2-tg]; return B&&B.alive?[B.x,B.y]:null;
}
function guardStop(i){
  ustate[i]=0; uGuard[i]=-1; uGuardG[i]=-1;
  utgt[i]=-1; utgtg[i]=-1; utx[i]=ux[i]; uty[i]=uy[i]; ufield[i]=-1; umarch[i]=0;
}
function guardSteer(i,acqMod){
  if(!guardEntityLive(uGuard[i],uGuardG[i])){
    /* Anchor destroyed, slot recycled, or a restored save wrote ustate 7 with
       no guard table behind it (session.js snapshots ustate, not orders).
       Standing down here is what makes that restore path safe. */
    guardStop(i); return;
  }
  const A=guardEntityPos(uGuard[i]), T=TYPES[utype[i]];
  if(utgt[i]!==-1){
    const P=orderTgPos(utgt[i]);
    if(!P||dist2(P[0],P[1],A[0],A[1])>GUARD_LEASH*GUARD_LEASH){ utgt[i]=-1; utgtg[i]=-1; }
  }
  if(utgt[i]===-1 && T.wk!=='n' && (i+tick)%acqMod===0){
    const e=findEnemyDomain(A[0],A[1],uteam[i],GUARD_ENGAGE,T.targetMask,T.preferMask);
    if(e>=0){ utgt[i]=e; utgtg[i]=ugen[e]; }
  }
  /* The post is a deterministic golden-angle ring slot. No per-order solve, and
     escorts do not swap places every time the anchor turns — the same reason
     control groups store a stable slot instead of re-sorting. */
  const a=i*2.399963, stand=A[2]+GUARD_STAND+(T.r||4);
  utx[i]=clamp(A[0]+Math.cos(a)*stand,15,MAP-15);
  uty[i]=clamp(A[1]+Math.sin(a)*stand,15,MAP-15);
  /* No flow field. The leash is 330wu, comfortably inside the range where
     direct steering plus the walkability slide already routes correctly, and a
     per-tick requestField for a MOVING anchor would evict the field ring (and
     pay an O(unitHigh) detach) several times a second. */
  ufield[i]=-1; uhold[i]=0; umarch[i]=0;
}

function queueClear(i){ if(uQueue[i]) uQueue[i]=null; uQkind[i]=0; }
/* step: {t:0 move | 1 attack | 2 guard, x, y, h:handle, g:generation, mv:move-only} */
function queueApply(i,s){
  const T=TYPES[utype[i]];
  uhold[i]=0; uPatrolRoute[i]=-1; uMoveCohort[i]=-1; uGuard[i]=-1; uGuardG[i]=-1;
  uQkind[i]=0;
  if(s.t===2&&guardEntityLive(s.h,s.g)){
    uQkind[i]=2;
    ustate[i]=7; uGuard[i]=s.h; uGuardG[i]=s.g;
    utgt[i]=-1; utgtg[i]=-1; umarch[i]=0; ufield[i]=-1; return;
  }
  if(s.t===1){
    const P=orderTgPos(s.h);
    if(P&&(s.h<=-2||foeTgt(i,s.h,s.g))){
      uQkind[i]=1;
      ustate[i]=2; utgt[i]=s.h; utgtg[i]=s.g;
      utx[i]=P[0]; uty[i]=P[1]; umarch[i]=0; ufield[i]=-1; return;
    }
    /* The named target died while the chain was still walking. Fall through and
       run the node as an attack-move onto its last known position rather than
       skipping it — silently teleporting the plan forward is worse than
       arriving somewhere the player did point at. */
  }
  const legal=T.air?[s.x,s.y]:T.naval?(findWater(s.x,s.y)||[ux[i],uy[i]]):findLand(s.x,s.y);
  ustate[i]=s.mv?1:2; utgt[i]=-1; utgtg[i]=-1; umarch[i]=s.mv?0:1;
  utx[i]=clamp(legal[0],15,MAP-15); uty[i]=clamp(legal[1],15,MAP-15);
  ufield[i]=T.air?-1:requestField(legal[0],legal[1],!!T.naval);
}
function queueNext(i){
  const Q=uQueue[i];
  if(!Q||!Q.length){ uQueue[i]=null; return false; }
  const s=Q.shift();
  if(!Q.length) uQueue[i]=null;
  queueApply(i,s); return true;
}
function queueTick(i){
  const Q=uQueue[i];
  if(!Q||!Q.length){ uQueue[i]=null; return; }
  if(ustate[i]===7||uQkind[i]===2) return;        // guard is terminal; it never arrives
  /* Named chase is the node: wait until the lock dies, then advance even if
     the hull never stood on the corpse. A waypoint (move / A-MOVE) advances
     on arrival WHILE shooting — otherwise a scout on node 1 holds the chain. */
  if(uQkind[i]===1){ if(utgt[i]!==-1) return; queueNext(i); return; }
  const arrive=Math.max(15,(TYPES[utype[i]].r||4)*2.4);
  if(ustate[i]!==0 && dist2(ux[i],uy[i],utx[i],uty[i])>arrive*arrive) return;
  queueNext(i);
}

/* ================= UNIT COMBAT MODES ======================================
   A mode is a deliberate trade, never a free upgrade: you give up something
   real to get something real, and it takes time to switch, so committing to a
   mode is a decision you can be punished for. Each chassis family gets the
   mode that suits how it actually fights, which is what makes a mixed army
   worth microing instead of a single blob you A-move.
     0 NORMAL   1 SIEGE   2 GUARD   3 OVERDRIVE   4 SCOUT/CLOAK   5 SUPPRESS */
const umode=new Uint8Array(MAXU);        // current mode
const umodeT=new Float32Array(MAXU);     // deploy/undeploy timer — mode is locked while >0
const MODES=[
  {id:0,nm:'MOBILE',   em:'▸', ds:'Standard footing'},
  {id:1,nm:'SIEGE',    em:'⛯', ds:'Rooted: +75% range, +45% damage, cannot move'},
  {id:2,nm:'GUARD',    em:'⛊', ds:'Dug in: −45% damage taken, −60% speed'},
  {id:3,nm:'OVERDRIVE',em:'⏵', ds:'Redlined: +60% fire rate, +35% speed, bleeds HP'},
  {id:4,nm:'GHOST',    em:'◌', ds:'Silent running: unseen until you fire, −35% speed'},
  {id:5,nm:'SUPPRESS', em:'≋', ds:'Sustained fire: +85% rate, −30% range, no movement'},
  {id:6,nm:'ASSIST',   em:'↯', ds:'Tractor beam: accelerate a factory, build site or Command HQ'},
  {id:7,nm:'SURVEY',   em:'⌾', ds:'Explore the nearest unclaimed phase-crystal field'},
];
/* Which modes a chassis can actually take. Artillery roots to shoot further;
   assault armour digs in; light frames redline or go quiet; flamers suppress. */
const UNIT_MODES=[
  [0,3],      // 0  Striker      — redline
  [0,2],      // 1  Rhino        — dig in
  [0,2,3],    // 2  Goliath      — dig in or redline
  [0,1],      // 3  Thumper      — siege
  [0,3],      // 4  Commander    — redline
  [0,4],      // 5  Wasp         — ghost
  [0,1],      // 6  Longbow      — siege
  [0,5],      // 7  Hornet       — suppress
  [0,2],      // 8  TITAN        — dig in
  [0,5],      // 9  Pyro         — suppress
  [0,4],      // 10 Vulture      — ghost
  [0,2],      // 11 Bulwark      — dig in
  [0],        // 12 Ravager
  [0],        // 13 Alpha Ravager
  [0,2],      // 14 Corvette     — dig in
  [0,1],      // 15 Dreadnought  — siege
  [0,1],      // 16 Bombard      — siege
  [0,3],      // 17 Raptor       — redline
  [0,5],      // 18 Scorcher     — suppress
  [0],        // 19 Constructor
  [0,5],      // 20 Reaper       — suppress: root and saturate
  [0,5],      // 21 Cinder
  [0,1],      // 22 Lancer       — siege: dig in for the long shot
  [0,2],      // 23 Resonator    — guard
  [0],        // 24 Warden
  [0,4],      // 25 Kestrel      — scout
  [0,1],      // 26 Basilisk     — siege
  [0,1],      // 27 Harbinger    — siege
  [0,1],      // 28 Praetor      — siege
  [0,2],      // 29 Archon       — guard
  [0,3],      // 30 Broodmother  — overdrive
  [0],        // 31 Tidecaster   — biological leader
  [0,6,7],    // 32 Prospector   — mine / assist / survey
];
const MODE_SWITCH=1.6;                   // seconds locked while deploying
/* MODES ARE TRADES.
   The first pass promised "a deliberate trade, never a free upgrade" and then
   made every mode net positive: siege paid immobility, which artillery never
   wanted; overdrive's bleed took 48 seconds to matter in a 10-second fight;
   guard was a pure gift on a unit whose damage is zero. Every cost now bites
   inside the length of an actual engagement.
     1 SIEGE     +75% range, +45% damage — rooted AND fragile while deployed
     2 GUARD     -45% damage taken — and -55% damage dealt, so it is a decision
     3 OVERDRIVE +60% rate, +35% speed — bleeds 5%/s, ~14 s to the auto-cutout
     4 SCOUT     +faster, sees further — thinner armour
     5 SUPPRESS  +85% rate, -30% range — rooted, and accuracy falls off */
function modeRngMul(m){ return m===1?1.75 : m===5?0.70 : 1; }
function modeDmgMul(m){ return m===1?1.45 : m===2?0.45 : m===5?0.80 : 1; }
function modeCoolMul(m){ return m===3?0.625 : m===5?0.54 : 1; }
function modeSpdMul(m){ return (m===1||m===5)?0 : m===2?0.40 : m===3?1.18 : m===4?0.65 : 1; }
function modeTakenMul(m){ return m===2?0.55 : m===1?1.35 : m===3?1.15 : m===4?1.25 : 1; }
function unitModes(ty){ return UNIT_MODES[ty]||[0]; }
/* The miner's mode 0 is MINE rather than MOBILE — a chassis-specific override
   of the shared table. Pulled out of unitModeDef so there is ONE owner of
   "which base entry does this (chassis, mode) pair resolve to", which
   src/factext.js mirrors when it looks for a faction's word for it. */
const MODE_MINE={id:0,nm:'MINE',em:'⛏',ds:'Lock a mining tractor beam onto an active phase-crystal field'};
function modeBaseDef(ty,m){
  if(ty===UT_MINER&&m===0) return MODE_MINE;
  return MODES[m]||MODES[0];
}
/* THE ARMY'S OWN WORD FOR ITS OWN POSTURE. A stance was the last thing in the
   game still spoken in one voice: a Brood "SIEGE" and a Dominion "SIEGE" read
   identically in an army that owns no machinery. `id` is the mode number and
   stays untouched — only the label, glyph and sentence are resolved through
   the player's kit (see src/factext.js), and every faction's sentence carries
   the same numbers as the base table. */
function unitModeDef(ty,m){
  const base=modeBaseDef(ty,m);
  if(typeof factionModeName!=='function') return base;
  const kit=(typeof factionTextKit==='function')?factionTextKit(0):undefined;
  return {id:base.id,
          nm:factionModeName(m,ty,kit)||base.nm,
          em:factionModeEm(m,ty,kit)||base.em,
          ds:factionModeDesc(m,ty,kit)||base.ds};
}
function cycleMode(i){
  const list=unitModes(utype[i]);
  if(list.length<2) return false;
  const cur=list.indexOf(umode[i]);
  const next=list[(cur+1)%list.length];
  return setMode(i,next);
}
function setMode(i,m){
  if(!ualive[i]||umodeT[i]>0||umode[i]===m) return false;
  if(unitModes(utype[i]).indexOf(m)<0) return false;
  umode[i]=m; umodeT[i]=MODE_SWITCH;
  /* Rooting yourself stops you dead — you can't shuffle out of a siege
     commitment for free. */
  if(m===1||m===5){ utx[i]=ux[i]; uty[i]=uy[i]; }
  addParticle(3,ux[i],uy[i],0,0,0.45,TYPES[utype[i]].size*2.2, 150,220,255);
  return true;
}
function modeCount(team,m){
  let n=0;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&uteam[i]===team&&umode[i]===m) n++;
  return n;
}
function spawnUnit(type,team,x,y,cmdSlot){
  const T=TYPES[type];
  if(!populationCanSpawn(type,team,cmdSlot,x,y)) return -1;
  let i;
  if(freeList.length) i=freeList.pop();
  else { if(unitHigh>=MAXU) return -1; i=unitHigh++; }
  if(typeof battlefieldClampPoint==='function'){
    const bp=battlefieldClampPoint(x,y,(TYPES[type].r||4)+8);x=bp[0];y=bp[1];
  }
  const L=TYPES[type].naval? (findWater(x,y)||[x,y]) : findLand(x,y);
  x=L[0]; y=L[1];
  if(typeof battlefieldClampPoint==='function'){
    const bp=battlefieldClampPoint(x,y,(TYPES[type].r||4)+8);x=bp[0];y=bp[1];
  }
  ux[i]=x; uy[i]=y; uang[i]=team?Math.PI:0; uturr[i]=uang[i];
  utx[i]=x; uty[i]=y;
  uhp[i]=T.hp*(team===0?resHpMult*typeHpMult[type]*(T.cat==='hero'?commanderHpMult:1):(team===1?aiHpMult*(WC.iron?1.25:1):1)); uhpm[i]=uhp[i];
  ucool[i]=Math.random()*T.cool; ubuff[i]=0; ustomp[i]=0; ureclaim[i]=0;
  uclassBuff[i]=0;uclassBuffT[i]=0;ubroodLed[i]=0;uMineT[i]=0;uMineNode[i]=-1;
  utype[i]=type; uteam[i]=team; ualive[i]=1; ustate[i]=0; usel[i]=0;
  const slot=populationResolveSlot(team,cmdSlot,x,y);
  uCmd[i]=slot;
  uAllyBase[i]=team===0?slot:-1;
  ugen[i]=(ugen[i]+1)|0;                    // this slot is now a different unit
  uwalk[i]=Math.random()*6.283;             // desynchronise the gait across a squad
  utgt[i]=-1; utgtg[i]=-1; ukills[i]=0; uvet[i]=0; ushielded[i]=0; uhaz[i]=0; ufireT[i]=0; ufield[i]=-1; uhold[i]=0;
  /* A recycled slot inherits every array it is not explicitly cleared from.
     umarch=1 means "walk to the goal, do not skirmish", so a unit spawned into
     a dead marcher's slot silently refused to engage for the rest of the match.
     main.js clears the array between matches, which is why this only ever
     surfaced mid-match and read as an aggro/AI bug rather than a spawn bug. */
  umarch[i]=0; ustun[i]=0; uheal[i]=0; uHurtT[i]=0;
  uCrash[i]=0; ualt[i]=0; uCtime[i]=0;
  uPatrolRoute[i]=-1; uPatrolStep[i]=0; uPatrolSlot[i]=0;
  uMoveCohort[i]=-1; uCohesion[i]=1;
  /* Same recycled-slot hazard as umarch above, and the reason a save restored
     into ustate 7 is harmless: guardSteer finds no anchor and stands the unit
     down instead of escorting whatever the dead occupant was escorting. */
  uGuard[i]=-1; uGuardG[i]=-1; uQueue[i]=null; uQkind[i]=0;
  umode[i]=0; umodeT[i]=0;
  teamCount[team]++;
  if(team<2) popCmdInc(slot);
  else if(team===2&&slot>=0&&typeof broodIsEnemy==='function'&&broodIsEnemy()) popCmdInc(slot);
  if(type===8) titanCount[team]++;
  if(typeof gridLink==='function') gridLink(i);
  return i;
}
/* Hero-ness is a property of the TYPE, not of slot 4. Anything keyed to
   utype===4 breaks the moment a faction lands its own commander; behaviours
   ask this instead. */
function unitIsHero(i){ const T=TYPES[utype[i]]; return !!(T&&T.cat==='hero'); }
/* Cruise height matches render3d's long-standing +58. Crash integrates this
   AGL so a Wasp does not pop at cruise and a falling Atlas still meets dirt.
   Size >=28 is the existing shell-vs-pock gate (Atlas 34, Ascendant 45;
   Raptor 18 stays on the ordinary pock). */
const AIR_CRUISE_ALT=58, AIR_CRASH_LARGE=28;
const uCrash=new Uint8Array(MAXU);
const ualt=new Float32Array(MAXU);
const uCvx=new Float32Array(MAXU), uCvy=new Float32Array(MAXU), uCvz=new Float32Array(MAXU);
const uCpitch=new Float32Array(MAXU), uCroll=new Float32Array(MAXU);
const uCdPitch=new Float32Array(MAXU), uCdRoll=new Float32Array(MAXU), uCspin=new Float32Array(MAXU);
const uCtime=new Float32Array(MAXU);
function unitAirAlt(i){
  if(i>=0&&uCrash[i]) return ualt[i];
  return AIR_CRUISE_ALT;
}
function unitAirLarge(T){
  return !!(T&&(T.size>=AIR_CRASH_LARGE||T.airTransport||T.massfleshAir));
}
function emitAirSmoke(i,T,crashing){
  if(typeof gpfxAirSmoke!=='function') return;
  const p=typeof mfVfxQ==='function'?mfVfxQ():1;
  const hpFrac=uhpm[i]>0?uhp[i]/uhpm[i]:0;
  const rich=crashing||hpFrac<0.18;
  /* HIGH every 3–5 ticks, MEDIUM 5–8, LOW 8–14. Do not share the ground
     combat smoke cadence — that path stays on dirt. */
  const mod=p>=0.95?(rich?3:5):p>=0.65?(rich?5:8):(rich?8:14);
  if((i+tick)%mod) return;
  const h=(typeof terrainH==='function'?terrainH(ux[i],uy[i]):0)+(uCrash[i]?ualt[i]:AIR_CRUISE_ALT);
  const heading=uang[i]-Math.PI/2;
  const vx=uCrash[i]?uCvx[i]:Math.cos(heading)*(T.spd||20)*0.28;
  const vy=uCrash[i]?uCvy[i]:Math.sin(heading)*(T.spd||20)*0.28;
  gpfxAirSmoke(ux[i],uy[i],h,vx,vy,{size:T.size,rich:rich,crash:!!crashing});
}
function beginAirCrash(i){
  if(!ualive[i]||uCrash[i]) return false;
  const T=TYPES[utype[i]];
  if(!T||!T.air) return false;
  /* Mechanical air must not take the Brood ichor burst at cruise height.
     Brood fliers still crash, then orgfxOnDeath runs on impact via killUnit. */
  uCrash[i]=1; usel[i]=0; uhold[i]=1;
  ustate[i]=0; utgt[i]=-1; utgtg[i]=-1; umarch[i]=0;
  uQueue[i]=null; uQkind[i]=0; uPatrolRoute[i]=-1; uMoveCohort[i]=-1;
  uhp[i]=0;
  ualt[i]=AIR_CRUISE_ALT;
  const heading=uang[i]-Math.PI/2;
  const spd=(T.spd||24)*(umov[i]?0.88:0.38);
  uCvx[i]=Math.cos(heading)*spd;
  uCvy[i]=Math.sin(heading)*spd;
  uCvz[i]=8+Math.random()*12;
  uCpitch[i]=0.18+Math.random()*0.35;
  uCroll[i]=(Math.random()-0.5)*0.7;
  uCdPitch[i]=1.05+Math.random()*1.55;
  uCdRoll[i]=(Math.random()<0.5?-1:1)*(1.5+Math.random()*2.1);
  uCspin[i]=(Math.random()-0.5)*2.6;
  uCtime[i]=0;
  return true;
}
function airCrashTick(i,dt){
  const T=TYPES[utype[i]];
  if(!T){ killUnit(i,true); return; }
  const drag=Math.pow(0.90,dt*10);
  uCvx[i]*=drag; uCvy[i]*=drag;
  uCvz[i]-=124*dt;
  let nx=clamp(ux[i]+uCvx[i]*dt,8,MAP-8), ny=clamp(uy[i]+uCvy[i]*dt,8,MAP-8);
  if(typeof battlefieldClampPoint==='function'){
    const bp=battlefieldClampPoint(nx,ny,T.r+8); nx=bp[0]; ny=bp[1];
  }
  ux[i]=nx; uy[i]=ny;
  ualt[i]+=uCvz[i]*dt;
  uang[i]+=uCspin[i]*dt;
  uCpitch[i]+=uCdPitch[i]*dt;
  uCroll[i]+=uCdRoll[i]*dt;
  uCtime[i]+=dt;
  umov[i]=1;
  if(typeof gridRelink==='function') gridRelink(i);
  if(perfScale>0.22) emitAirSmoke(i,T,true);
  /* Floor is hull thickness, not zero — a 34-size Atlas kissing dirt at
     alt=0 buried the mesh a frame before the blast. 3.6s is the off-map
     failsafe if gravity ever loses the wreck. */
  if(ualt[i]<=Math.max(2.8,T.size*0.08) || uCtime[i]>3.6) killUnit(i);
}
function killUnit(i, silent){
  if(!ualive[i]) return;
  const T0=TYPES[utype[i]];
  if(!silent && !uCrash[i] && T0 && T0.air){
    beginAirCrash(i);
    return;
  }
  const crashImpact=uCrash[i];
  uCrash[i]=0;
  const brood=unitIsBrood(i);
  ualive[i]=0; usel[i]=0; teamCount[uteam[i]]--;
  if(typeof gridUnlink==='function') gridUnlink(i);
  if(uteam[i]<2) popCmdDec(uCmd[i]);
  else if(uteam[i]===2&&uCmd[i]>=0) popCmdDec(uCmd[i]);
  uCmd[i]=POP_PLAYER_SLOT; uAllyBase[i]=-1;
  /* Orders retain generation handles, but clearing the live pointers here
     lets route/cohort maintenance compact the gap on its very next pass. */
  uMoveCohort[i]=-1;uPatrolRoute[i]=-1;uGuard[i]=-1;uQueue[i]=null;uQkind[i]=0;
  if(utype[i]===8) titanCount[uteam[i]]--;
  freeList.push(i);
  const T=TYPES[utype[i]];
  if(!silent){
    /* Infantry, wildlife and Brood used to inherit the vehicle fireball
       (flash + mushroom + white shards). Size>24 Brood (Alpha, Sovereign)
       still fell through and drowned orgfxOnDeath. Keep the warhead for
       machines only. */
    const organic=brood || (!unitIsHero(i) && !T.air && !!T.legs && T.size<=16);
    if(organic){
      const cr=brood?48:190, cg=brood?180:18, cb=brood?40:14;
      addParticle(0,ux[i],uy[i],0,0,.16,T.size*1.15, cr,cg,cb);
      addParticle(3,ux[i],uy[i],0,0,.28,T.size*1.05, cr,cg,cb);
      addParticle(1,ux[i],uy[i],rr(-2,2),rr(-8,-3),.55,T.size*.38, brood?58:72,brood?64:42,brood?48:36);
    } else {
      spawnExplosion(ux[i],uy[i], T.size*0.9, uteam[i]);
    }
    if(T.size>=20){
      const wuv=UNIT_UV[T.spr];
      if(wuv) shatterFrame(ux[i],uy[i],T.size*2.05,wuv[angFrame(uang[i])%wuv.length],uteam[i],T.size>=40?3:2,0.7+T.size/40);
    }
    const civic=typeof cityGroundAt==='function' && cityGroundAt(ux[i],uy[i])>=1;
    if(T.size>=16 && !(brood&&civic)) addCrater(ux[i],uy[i],T.size*1.85);
    if(T.size>=18 && !(brood&&civic)){
      /* Large air crash uses the existing titan-scale blast (size*2.6 / 0.085).
         Do not retune pock/shell radii — Raptor 18 still takes the ordinary
         pock. CITYG bowls stay on applyDeform's 0.55×; brood+civic still skip. */
      if(crashImpact && T.air && unitAirLarge(T))
        deformTerrain(ux[i],uy[i],T.size*2.6, 0.085, 'blast');
      else
        deformTerrain(ux[i],uy[i],T.size*1.55, 0.048, T.size>=28?'shell':'pock');
    }
    /* Wreckage from EVERY loss, both sides. Your own dead armour is salvage too
       — a grinder in your own territory quietly refunds you.                */
    /* Wildlife leaves no salvage. It used to: every insect death pushed a
       wreck worth eight mass into a 460-entry ring buffer that evicts from the
       front, so a single tide flushed every piece of genuinely valuable
       structure and city salvage out of the array before the player could
       reach it — and paid an O(n) memmove per corpse to do it. */
    /* What lands on the ground is decided by material doctrine, in one
       place (dropRemains): scrap from machines, biomass from the grown,
       nothing from the fallen. The size gate that protects the wreck ring
       buffer from tide spam lives inside it. */
    dropRemains(i);
    /* Ichor stays on the corpse. Type 4 is a fire sprite (ignores RGB) and
       60–110 speed launched shards into orbit — both read as cheap garnish
       around the real hull. */
    if((T.legs||brood) && T.size<=24 && perfScale>0.35){
      const isOrg=brood;
      const cr=isOrg?48:190, cg=isOrg?180:18, cb=isOrg?40:14;
      const n=Math.round((3+T.size*0.2)*perfScale);
      for(let k=0;k<n;k++){
        const a=Math.random()*TAU, sp=11+Math.random()*16;
        addParticle(5,ux[i],uy[i],Math.cos(a)*sp,Math.sin(a)*sp,.28+Math.random()*.16,2.2+Math.random()*1.4, cr,cg,cb);
      }
    }
    if((utype[i]===8||utype[i]===4)&&!brood){             // titan / commander death = cataclysm
      spawnExplosion(ux[i],uy[i], 60, uteam[i]);
      addParticle(3,ux[i],uy[i],0,0,1.4,340, 255,220,140);
      addParticle(3,ux[i],uy[i],0,0,1.0,220, 255,150,80);
      addCrater(ux[i],uy[i],140);
      deformTerrain(ux[i],uy[i],T.size*2.6, 0.085, 'blast');
      flashScreen();
      if(typeof requestShake==='function') requestShake(ux[i],uy[i],16,'blast');
      else shake=16;
    }
    if(WC.volatile){                                      // wildcard: every death detonates
      const vr=T.size*2.2+20, vd=T.hp*0.15+14, vx=ux[i], vy=uy[i], vt=uteam[i];
      forUnitsIn(vx,vy,vr,j=>{
        if(j!==i&&ualive[j]&&uteam[j]!==vt)
          dealDamage(j,vd*(1-0.55*Math.sqrt(dist2(vx,vy,ux[j],uy[j]))/vr),vt,-1);
      });
      addParticle(3,vx,vy,0,0,.45,vr, 255,150,70);
    }
    if(brood){
      if(typeof orgfxOnDeath==='function') orgfxOnDeath(ux[i],uy[i],T.size,T.name);
      sfx('cre_death',ux[i],uy[i],clamp(T.size/18,0.65,1.8));
      if(T.size>=30) sfx('boomsmall',ux[i],uy[i],T.size/28);
    } else sfx('boom', ux[i],uy[i], T.size/16);
  }
  if(i===heroIdx) heroIdx=-1;
  if(isEnemyCommander(i)){
    enemyHeroIdxs=enemyHeroIdxs.filter(h=>h!==i);
    enemyHeroIdx=enemyHeroIdxs.length?enemyHeroIdxs[0]:-1;
  }
}

// ---------- spatial hash ----------
const CS=44, GW=Math.ceil(MAP/CS)+2;
const gHead=new Int32Array(GW*GW), gNext=new Int32Array(MAXU);
const uGridCell=new Int32Array(MAXU);
gHead.fill(-1); gNext.fill(-1); uGridCell.fill(-1);  // zeros would make cell walks cycle on unit 0
function gCell(x,y){ return clamp(y/CS|0,0,GW-1)*GW + clamp(x/CS|0,0,GW-1); }
function gridUnlink(i){
  const c=uGridCell[i];
  if(c<0) return;
  let j=gHead[c], prev=-1;
  while(j>=0){
    if(j===i){ if(prev<0) gHead[c]=gNext[i]; else gNext[prev]=gNext[i]; break; }
    prev=j; j=gNext[j];
  }
  gNext[i]=-1; uGridCell[i]=-1;
}
function gridLink(i){
  /* Unlink first: a recycled slot or a test wipe that skipped killUnit would
     otherwise prepend into its own chain and livelock findEnemy. */
  if(uGridCell[i]>=0) gridUnlink(i);
  const c=gCell(ux[i],uy[i]);
  uGridCell[i]=c; gNext[i]=gHead[c]; gHead[c]=i;
}
function gridRelink(i){
  const c=gCell(ux[i],uy[i]);
  if(c===uGridCell[i]) return;
  gridUnlink(i); gridLink(i);
}
/* Match reset and proofs only. Live ticks keep the hash via spawn, kill, and
   cell-change relink — filling gHead every step was O(GW²) throwaway work.
   Do not raise FACTION_POP_CAP or armyCap to "pay for" this. */
function rebuildGrid(){
  gHead.fill(-1);
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]){ uGridCell[i]=-1; gNext[i]=-1; continue; }
    const c=gCell(ux[i],uy[i]);
    uGridCell[i]=c;
    gNext[i]=gHead[c]; gHead[c]=i;
  }
}
function gridQueryProof(){
  /* Incremental hash vs a full rebuild on the same neighbor queries.
     Crowded-cell walk order can differ (LIFO vs index); closest enemy and
     "does overlap still produce a separation hit" must not. */
  const probes=[], total=teamCount[0]+teamCount[1]+teamCount[2];
  for(let i=0;i<unitHigh && probes.length<24;i++){
    if(!ualive[i]) continue;
    const T=TYPES[utype[i]];
    const fe=findEnemy(ux[i],uy[i],uteam[i],T.rng||80,0);
    unitSeparation(i,T,uteam[i]===2,false,total);
    probes.push({i,fe,hits:sepHits});
  }
  rebuildGrid();
  let feBad=0, sepMiss=0;
  for(let p=0;p<probes.length;p++){
    const P=probes[p];
    if(!ualive[P.i]) continue;
    const T=TYPES[utype[P.i]];
    if(findEnemy(ux[P.i],uy[P.i],uteam[P.i],T.rng||80,0)!==P.fe) feBad++;
    unitSeparation(P.i,T,uteam[P.i]===2,false,total);
    if((P.hits===0)!==(sepHits===0)) sepMiss++;
  }
  return {n:probes.length,feBad,sepMiss,ok:!feBad&&!sepMiss};
}
/* GHOST (umode 4) is unseen until it fires — unless a detector is in range.
   src/intel.js takes this over so scouts/uplinks/techlabs can pierce cloak.
   The fallback matches the old hard skip, so a missing intel module cannot
   make silent-running hulls suddenly targetable. */
function intelCanTarget(j,team){ return ualive[j]&&uteam[j]!==team&&umode[j]!==4&&!uCrash[j]; }
// mode: 0 any, 1 air-only, 2 ground-only
function findEnemy(x,y,team,rad,mode){
  mode=mode||0;
  const cr=Math.min(14, Math.ceil(rad/CS));   // 14 cells ≈ 616wu — covers siege artillery ranges
  const cx=clamp(x/CS|0,0,GW-1), cy=clamp(y/CS|0,0,GW-1);
  let best=-1, bd=rad*rad;
  const x0=Math.max(0,cx-cr), x1=Math.min(GW-1,cx+cr), y0=Math.max(0,cy-cr), y1=Math.min(GW-1,cy+cr);
  for(let gy=y0;gy<=y1;gy++) for(let gx=x0;gx<=x1;gx++){
    let j=gHead[gy*GW+gx];
    while(j>=0){
      if(intelCanTarget(j,team)){
        const air=TYPES[utype[j]].air;
        if(!((mode===1&&!air)||(mode===2&&air))){
          const d=dist2(x,y,ux[j],uy[j]);
          if(d<bd){ bd=d; best=j; }
        }
      }
      j=gNext[j];
    }
  }
  return best;
}
function findEnemyDomain(x,y,team,rad,mask,prefer){
  const cr=Math.min(14,Math.ceil(rad/CS)),cx=clamp(x/CS|0,0,GW-1),cy=clamp(y/CS|0,0,GW-1);
  let best=-1,bscore=rad*rad;
  for(let gy=Math.max(0,cy-cr);gy<=Math.min(GW-1,cy+cr);gy++)for(let gx=Math.max(0,cx-cr);gx<=Math.min(GW-1,cx+cr);gx++){
    let j=gHead[gy*GW+gx];
    while(j>=0){
      if(intelCanTarget(j,team)){
        const D=mfDomainOfType(TYPES[utype[j]]);
        if(mask&D){
          const d=dist2(x,y,ux[j],uy[j]);
          /* Wounded bias. hpFrac 1.0 leaves score unchanged; a target at 25%
             health scores 0.66x, so it wins against an equal-distance healthy
             one but does NOT beat a much closer target — deliberately mild, so
             units do not walk past the thing shooting them to finish something
             across the field. 0.45 was too strong in reasoning: it inverted
             distance entirely at low health. */
          const hpFrac=uhpm[j]>0?clamp(uhp[j]/uhpm[j],0,1):1;
          const wounded=0.55+0.45*hpFrac;
          const score=d*((prefer&D)?.62:1)*wounded;
          if(score<bscore){bscore=score;best=j;}
        }
      }
      j=gNext[j];
    }
  }
  return best;
}

/* ---------- flow-field pathfinding (SupCom2-style) ---------- */
const DIRX=[1,1,0,-1,-1,-1,0,1,0], DIRY=[0,1,1,1,0,-1,-1,-1,0];
const FF_MAX=8;
const fields=[];              // {tx,ty,dirs:Uint8Array}
let ffNext=0;
const ffDist=new Uint16Array(0);  // replaced at init
let ffDistA=null, ffQueue=null;
function ffCell(wx,wy){ return clamp(wy/MAP*PGS|0,0,PGS-1)*PGS+clamp(wx/MAP*PGS|0,0,PGS-1); }
function computeField(tx,ty,naval){
  if(!ffDistA){ ffDistA=new Uint16Array(PGS*PGS); ffQueue=new Int32Array(PGS*PGS); }
  const dirs=new Uint8Array(PGS*PGS).fill(8);
  const dist=ffDistA; dist.fill(65535);
  const pass=i=>naval?!!(NAVW&&NAVW[i]&&NAVCOMP[i]===NAV_MAIN):!!PASS[i];
  let goal=ffCell(tx,ty);
  if(!pass(goal)){                       // nudge goal to the nearest legal cell for this medium
    const gx=goal%PGS, gy=goal/PGS|0;
    outer: for(let r=1;r<24;r++)
      for(let a=0;a<TAU;a+=0.5){
        const nx=clamp(gx+Math.round(Math.cos(a)*r),0,PGS-1), ny=clamp(gy+Math.round(Math.sin(a)*r),0,PGS-1);
        if(pass(ny*PGS+nx)){ goal=ny*PGS+nx; break outer; }
      }
  }
  if(!pass(goal)) return dirs;
  let qh=0, qt=0;
  dist[goal]=0; ffQueue[qt++]=goal;
  while(qh<qt){
    const c=ffQueue[qh++];
    const cx=c%PGS, cy=c/PGS|0, cd=dist[c];
    for(let k=0;k<8;k++){
      const nx2=cx+DIRX[k], ny2=cy+DIRY[k];
      if(nx2<0||ny2<0||nx2>=PGS||ny2>=PGS) continue;
      const n=ny2*PGS+nx2;
      if(!pass(n)||dist[n]!==65535) continue;
      if(k&1){ // diagonal: forbid corner cutting
        if(!pass(cy*PGS+nx2)||!pass(ny2*PGS+cx)) continue;
      }
      dist[n]=cd+((k&1)?3:2);
      ffQueue[qt++]=n;
    }
  }
  for(let c=0;c<PGS*PGS;c++){
    if(dist[c]===65535||c===goal) continue;
    const cx=c%PGS, cy=c/PGS|0;
    let bk=8, bd2=dist[c];
    for(let k=0;k<8;k++){
      const nx2=cx+DIRX[k], ny2=cy+DIRY[k];
      if(nx2<0||ny2<0||nx2>=PGS||ny2>=PGS) continue;
      const dn=dist[ny2*PGS+nx2];
      if(dn<bd2){ bd2=dn; bk=k; }
    }
    dirs[c]=bk;
  }
  return dirs;
}
function requestField(tx,ty,naval){
  naval=!!naval;
  for(let f=0;f<fields.length;f++){
    if(fields[f]&&!!fields[f].naval===naval&&dist2(fields[f].tx,fields[f].ty,tx,ty)<70*70) return f;
  }
  const f=ffNext; ffNext=(ffNext+1)%FF_MAX;
  for(let i=0;i<unitHigh;i++) if(ufield[i]===f) ufield[i]=-1;   // detach units from recycled slot
  fields[f]={tx,ty,naval,dirs:computeField(tx,ty,naval)};
  return f;
}
function forUnitsIn(x,y,rad,fn){
  /* Was Math.min(8,...) = 352wu. Every non-findEnemy turret acquires through
     here, so a Missile Bastion (430) drew a 430 ring, printed RANGE 430 in its
     panel, and then simply never scanned the cells its outer band covers. Its
     range upgrades changed the number and nothing else. 14 matches findEnemy's
     own cap, which is already sized for siege artillery. */
  const cr=Math.min(14, Math.ceil(rad/CS));
  const cx=clamp(x/CS|0,0,GW-1), cy=clamp(y/CS|0,0,GW-1);
  const r2=rad*rad;
  const x0=Math.max(0,cx-cr), x1=Math.min(GW-1,cx+cr), y0=Math.max(0,cy-cr), y1=Math.min(GW-1,cy+cr);
  for(let gy=y0;gy<=y1;gy++) for(let gx=x0;gx<=x1;gx++){
    let j=gHead[gy*GW+gx];
    while(j>=0){
      if(ualive[j] && dist2(x,y,ux[j],uy[j])<=r2) fn(j);
      j=gNext[j];
    }
  }
}

// ---------- buildings ----------
/* STRUCTURE CATEGORIES. Same purpose as the unit ones: the build menu groups
   by them, so a player looking for "how do I stop air" has somewhere to look. */
const BCAT={
  eco :{nm:'ECONOMY',    em:'⛏'}, prod:{nm:'PRODUCTION', em:'🏭'},
  nav :{nm:'NAVAL',      em:'⚓'},
  def :{nm:'DEFENCE',    em:'🛡'}, tech:{nm:'TECH',       em:'🔬'},
  wall:{nm:'FORTIFICATION', em:'🧱'}, sup:{nm:'SUPPORT',  em:'📡'},
  sup2:{nm:'SUPERWEAPON',em:'☄'}
};
const BT={
  mex:   {name:'Extractor', spr:'mex',   size:32, r:15, hp:600,  cm:45,  ce:120,  bt:6,  desc:'+4 Mass (on ◆)', em:'⛏', clvl:1},
  pgen:  {name:'Reactor',   spr:'pgen',  size:32, r:15, hp:500,  cm:40,  ce:0,    bt:5,  desc:'+14 Energy', em:'☀', clvl:1},
  fac:   {name:'Factory',   spr:'fac',   size:48, r:24, hp:1600, cm:130, ce:380,  bt:10, desc:'Builds units', em:'🏭', clvl:1},
  turret:{name:'Sentinel',  spr:'turB',  size:28, r:13, hp:900,  cm:90,  ce:260,  bt:7,  desc:'Laser turret', em:'🎯', clvl:1, bcat:'def'},
  bunker:{name:'Bulwark',   spr:'turB',  size:36, r:17, hp:2800, cm:145, ce:420,  bt:10, desc:'Armored close-defence cannon', em:'🏰', clvl:2, bcat:'def'},
  sgen:  {name:'Aegis Barrier',spr:'sgen', size:32, r:15, hp:1200, cm:135, ce:480,  bt:10, desc:'Projects a shield field and repairs nearby structures', em:'🛡', clvl:2},
  tgate: {name:'Titan Gate',spr:'tgate', size:66, r:33, hp:3200, cm:420, ce:1600, bt:22, desc:'Builds TITANs', em:'🌌', req:'techlab', clvl:8},
  nest:  {name:'Ravager Nest',spr:'nest',size:52, r:26, hp:2400, cm:0,   ce:0,    bt:1,  desc:'Wildlife hive — bounty 200 mass', em:'🐛'},
  harbor:{name:'Harbor',    spr:'harbor',size:52, r:26, hp:1400, cm:150, ce:500,  bt:12, desc:'Floating shipyard — navigable water only', em:'⚓', clvl:4, bcat:'nav', placement:'water'},
  seafort:{name:'Sea Bastion',spr:'towerB',size:42,r:21,hp:2200,cm:285,ce:980,bt:17,desc:'Floating dual-purpose coastal battery',em:'◉',clvl:5,bcat:'nav',placement:'water'},
  bastion:{name:'Concussion Mortar',spr:'towerB',size:42, r:21, hp:2600, cm:320, ce:1300, bt:20, desc:'Long-range explosive shells stun clustered targets', em:'💣', req:'techlab', clvl:6, bcat:'def'},
  techlab:{name:'Research Complex',spr:'techlab',size:42,r:21,hp:2400,cm:180,ce:680,bt:14,desc:'Shielded studies bank account ◆ Data',em:'🔬',clvl:3,bcat:'tech'},
  aatower:{name:'Skyguard', spr:'aatower',size:30,r:14, hp:1000, cm:100, ce:340,  bt:8,  desc:'Anti-air flak', em:'🛩', clvl:2, bcat:'def'},
  airfield:{name:'Airfield',spr:'airfield',size:52,r:26,hp:1500, cm:160, ce:520,  bt:12, desc:'Builds aircraft', em:'✈', clvl:5, bcat:'prod'},
  uplink:{name:'Targeting Array',spr:'uplink', size:30, r:14,hp:800,  cm:120, ce:480,  bt:9,  desc:'Research-gated territory relay that extends the HQ build grid and boosts nearby towers', em:'📡', clvl:4, req:'techlab', bcat:'sup'},
  hq:    {name:'Carrier HQ',spr:'carrier',size:76, r:34, hp:6000, cm:0,   ce:0,    bt:1,  desc:'Deployed super carrier — wide build zone', em:'🚀', clvl:99},
  hellstorm:{name:'Hellfire Rotary',spr:'hellB',size:34, r:16, hp:1400, cm:190, ce:680,  bt:11, desc:'Rapid rotary fire shreds swarms and light armor', em:'🌪', clvl:4, req:'techlab', bcat:'def'},
  arc:   {name:'Tesla Coil', spr:'arcB',  size:32, r:15, hp:1100, cm:230, ce:850,  bt:12, desc:'Chain lightning arcs through packed enemies', em:'⚡', clvl:5, req:'techlab'},
  rail:  {name:'Rail Battery',spr:'towerB',size:40,r:20,hp:1900,cm:275,ce:980,bt:16,desc:'Long-range anti-heavy penetrator',em:'➤',clvl:5,req:'techlab',bcat:'def'},
  nova:  {name:'NOVA Missile Silo',spr:'novaB', size:52, r:26, hp:3200, cm:680, ce:2700, bt:30, desc:'Strategic superweapon with map-wide strike range', em:'☄', clvl:7, req:'techlab'},
  minelaser:{name:'Mining Laser',spr:'towerB',size:38,r:18,hp:1650,cm:250,ce:920,bt:15,desc:'Sustained beam melts heavy armor',em:'◈',clvl:5,req:'techlab',bcat:'def'},
  missilebastion:{name:'Missile Bastion',spr:'novaB',size:44,r:21,hp:2200,cm:340,ce:1240,bt:18,desc:'Long-range guided area-defense salvos',em:'➟',clvl:6,req:'techlab',bcat:'def'},
  plasma:{name:'Plasma Charger',spr:'arcB',size:40,r:19,hp:1800,cm:310,ce:1160,bt:17,desc:'Charged ion blast with heavy splash',em:'◉',clvl:6,req:'techlab',bcat:'def'},
  stormcaller:{name:'Stormcaller Battery',spr:'novaB',size:46,r:22,hp:2000,cm:380,ce:1500,bt:20,desc:'Banks a heavy charge, then rains a 16-shell barrage on massed attackers',em:'🌩',clvl:6,req:'techlab',bcat:'def'},
  wall:  {name:'Barricade', spr:'wall',   size:22, r:11, hp:1700, cm:12,  ce:16,   bt:1.2,desc:'Blocks ground units', em:'🧱', clvl:1},
  gate:  {name:'Gate',      spr:'wall',   size:22, r:11, hp:1500, cm:18,  ce:30,   bt:1.5,desc:'Wall your units pass through', em:'🚪', clvl:1},
  geo:   {name:'Geo Plant', spr:'pgen',   size:34, r:16, hp:750,  cm:95,  ce:160,  bt:8,  desc:'+30 Energy (on ✦ geyser)', em:'✦', clvl:2},
  silo:  {name:'Silo',      spr:'silo',   size:28, r:13, hp:900,  cm:70,  ce:220,  bt:6,  desc:'+600 mass / +2000 energy storage', em:'🛢', clvl:2},
  fab:   {name:'Fabricator',spr:'fabB',   size:32, r:15, hp:800,  cm:130, ce:460,  bt:9,  desc:'Burns 58 energy → +3.6 mass', em:'🔥', clvl:3},
};
/* ---------- armor & damage matrix (visible counters) ----------
   armor classes per unit type index: 0 LIGHT, 1 MEDIUM, 2 HEAVY      */
/* Armour class per unit index. Must stay the same length as TYPES — the new
   entries continue the list in order. */
/* Fill in any structure category not declared inline, in one place. */
(function classifyBld(){
  const by={mex:'eco',pgen:'eco',geo:'eco',fab:'eco',silo:'eco',
            fac:'prod',tgate:'prod',harbor:'nav',airfield:'prod',hq:'prod',seafort:'nav',
            turret:'def',bunker:'def',aatower:'def',bastion:'def',hellstorm:'def',arc:'def',rail:'def',nest:'def',
            minelaser:'def',missilebastion:'def',plasma:'def',
            techlab:'tech',uplink:'sup',sgen:'sup',
            wall:'wall',gate:'wall',nova:'sup2'};
  for(const k in BT) if(!BT[k].bcat) BT[k].bcat=by[k]||'sup';
})();
const ARM=[0,1,2,1,2, 0,1,1,2, 1,1,2, 0,2, 1,2, 1,0, 1, 0,
           1,1,1,1,0,0,2,2,        // Reaper Cinder Lancer Resonator Warden Kestrel Basilisk Harbinger
           2,1,2,0,0,              // Praetor Archon Broodmother Tidecaster Prospector
           2,2,0];                 // Atlas Skycrane, Massflesh Carrier, Massflesh Ascendant
const ARM_NM=['LIGHT','MEDIUM','HEAVY'];
/* WHY 33-35 ARE LISTED HERE AND ALSO ASSIGNED IN airlift.js.
   Those three chassis are appended to TYPES by src/airlift.js, which then wrote
   their armour class and nothing else did. That left this table three entries
   short, and a short table does not fail — `dmgMul` reads `ARM[i] || 0`, so a
   missing entry silently resolves to LIGHT, the worst possible default: LIGHT
   takes kinetic x1.55, claws x1.60 and incendiary x1.75 while gauss collapses
   to x0.45. Any heavy body that fell off the end of this list therefore had its
   counter triangle inverted with nothing anywhere saying so.

   The live game was covered by airlift.js, but every reader of THIS file alone
   was not — including tools/extract-design-db.mjs, which is the measurement the
   balance pass runs on. The 2026-08-14 review consequently reported a 1850 HP
   transport and a 2850 HP carrier as LIGHT when the running game treats both as
   HEAVY. These values match what airlift.js installs, so the table now agrees
   with the simulation and no multiplier moved.

   The Ascendant stays LIGHT on purpose: it is the winged Massflesh state, and
   airlift.js's own header sets the counter as "landed = HEAVY ground target ->
   anti-tank, winged = AIR target -> anti-air". Flak is EXPLOSIVE, which is
   x1.35 vs light and x0.70 vs heavy, so promoting it would halve the strength
   of the documented answer to a breakthrough flight. */
/* MAKE THE DRIFT LOUD. The invariant above used to be a comment, and a comment
   cannot fail. Deferred by a macrotask because TYPES is still growing when this
   file runs: the manifest loads airlift.js afterwards. Missing classes are the
   only failure — extra trailing ARM slots (this file listing 33-35 before
   airlift.js appends those TYPES) must not alarm extract-design-db / replay
   tooling that evaluate sim.js alone. console.error, not throw: a thrown Error
   on boot would black-screen a shipping match over a table typo, and the
   design-DB already prints ARM.length vs TYPES.length. */
if(typeof setTimeout==='function') setTimeout(()=>{
  if(ARM.length<TYPES.length)
    console.error('ARM.length='+ARM.length+' < TYPES.length='+TYPES.length
      +' — dmgMul() reads ARM[i]||0 so Atlas/Massflesh silently become LIGHT');
  for(let i=0;i<TYPES.length;i++) if(ARM[i]==null)
    console.error('ARM: no armour class for TYPES['+i+'] '+((TYPES[i]&&TYPES[i].name)||'?')
      +' — dmgMul() degrades it to LIGHT');
},0);
/* WEAPON vs ARMOUR.
   The original spread was +-15..30%, which sounds like a counter system and
   behaves like rounding error: a Striker is over three times more mass
   efficient than a Goliath, and no multiplier in that range inverts a 3x gap.
   So the advertised counter (armour) never decided a fight and the real one
   (splash radius) was never in the UI. These numbers are wide enough that
   bringing the wrong weapon is a visible loss and bringing the right one is a
   visible win — which is the only way a player can learn the triangle. */
const WKM={                       // weapon-class → [vs light, vs med, vs heavy]
  p:[1.55,1.00,0.55],             // KINETIC   — shreds light, deflects off heavy
  b:[0.60,1.00,1.60],             // BEAM      — burns through heavy plate
  m:[1.60,1.00,0.60],             // CLAWS     — rend light armour, blunt on plate
  e:[1.35,1.20,0.70],             // EXPLOSIVE — blast: crowds and buildings
  g:[0.45,0.95,1.85],             // GAUSS     — armour-piercing slug, wasted on chaff
  f:[1.75,0.85,0.45],             // INCENDIARY— cooks infantry, useless on plate
  s:[0.90,1.15,1.05],             // SONIC     — mediocre everywhere, ignores shields
  i:[0.85,1.15,1.35],             // ION       — energized plasma bites powered heavy frames
  n:[1,1,1]
};
/* Weapons that IGNORE the Bulwark bubble. Until now the shield had no answer
   anywhere in the roster, which made massed Bulwarks the dominant composition
   by default. Sonic is the counter, and it is deliberately unexciting against
   everything else so taking it is a real choice. */
const WK_PIERCE={s:1};
/* HORDE CONTROL. A blast that gets MORE efficient the more bodies are in it.
   This is the mechanical answer to a thousand-strong swarm: without it the only
   counter to mass is more mass, and the wildlife tide is unanswerable rather
   than merely dangerous. Capped so it never becomes the answer to everything. */
const WK_HORDE={e:1.0, f:1.35};
const WK_NM={p:'KINETIC',b:'BEAM',m:'CLAWS',e:'EXPLOSIVE',g:'GAUSS',f:'INCENDIARY',s:'SONIC',i:'ION',n:'—'};
const STM={p:0.9,b:1.0,m:1.1,e:1.55,g:1.20,f:0.65,s:1.15,i:1.05,n:1};   // vs structures
const AMMO_PTYPE={0:'CASELESS TRACER',1:'AP CANNON SHELL',2:'BALLISTIC HE SHELL',3:'COMMANDER HE SHELL',
  4:'UNGUIDED ROCKET',5:'THERMAL GEL',6:'ION PLASMA ORB',7:'GUIDED MISSILE',8:'FLAK AIRBURST',9:'CLUSTER MUNITION'};
function ammoName(T){
  if(!T) return 'UNARMED';
  if(T.miner) return 'MINING TRACTOR LASER';
  if(T.wk==='n') return 'UNARMED';
  if(T.wk==='m') return T.ptype===5?'NAPALM JET':'MELEE STRIKE';
  if(T.wk==='b') return T.name==='Longbow'?'COHERENT SNIPER BEAM':T.name==='TITAN'?'TITAN PARTICLE LANCE':'LASER ENERGY';
  if(T.wk==='g') return 'GAUSS PENETRATOR';
  /* ptype 5 is the thermal-gel jet, so the Scorcher reads as a flame weapon
     rather than sharing the Cinder's shell copy. */
  if(T.wk==='f') return T.ptype===5?'THERMAL GEL JET':'INCENDIARY CANISTER';
  if(T.wk==='s') return 'SONIC RESONANCE PULSE';
  if(T.wk==='i') return 'ION PLASMA ORB';
  if(T.wk==='e'&&T.ptype===4) return 'UNGUIDED HE ROCKET';
  if(T.wk==='e'&&T.ptype===7) return 'GUIDED HE MISSILE';
  if(T.wk==='e'&&T.ptype===8) return 'PROXIMITY FLAK';
  if(T.wk==='e'&&T.ptype===9) return 'CLUSTER MUNITION';
  return AMMO_PTYPE[T.ptype]||WK_NM[T.wk]||'WEAPON';
}
function dmgMul(wk,tIdx){ return (WKM[wk]||WKM.n)[ARM[tIdx]||0]; }

const BASTION={rng:520, minRng:140, dmg:170, aoe:48, cool:8};
const BASTION_CONCUSS=[1.8,2.3,3.0];                         // Mk1/2/3 movement + range disruption
const AA={rng:200, dmg:46, aoe:22, cool:0.8};
const HELL={rng:215, dmg:26, cool:0.3, tgts:8, e:9};            // anti-swarm rotary flak
const ARC={rng:245, dmg:60, cool:1.5, chain:10, jump:70, e:38}; // chain lightning
const BUNKER={rng:168,dmg:80,aoe:24,cool:1.2};                  // cheap, tough line-holder — must reach a kiting hero
const RAIL={rng:360,dmg:410,cool:5.8,e:70};                    // deliberate anti-heavy answer
const MINELASER={rng:315,dmg:175,cool:1.65,e:62};              // sustained anti-heavy optical drill
const MISSILE_BASTION={rng:430,dmg:115,aoe:46,cool:4.4,e:74,tgts:3};
const PLASMA_CHARGER={rng:300,dmg:285,aoe:72,cool:5.4,e:92};   // charged ion splash
/* STORMCALLER BATTERY — the charge-up siege defence. Banks a full charge over
   cd seconds (paying a steady energy drip), then waits, humming, until a real
   force masses in range — and answers with a rolling spiral of shells that
   rains hell across the whole approach. aoe stays under 52: at 0.78× that is
   the spawnExplosion size that would escalate every shell into a superweapon. */
const STORM={rng:520,minRng:110,dmg:135,aoe:48,shells:16,cadence:.16,cd:26,e:520,trigger:4};
const NOVA={dmg:2800, aoe:235, cd:90, e:1500};                  // map-wide superweapon
const UPLINK_R=150, UPLINK_BOOST=1.35;

/* ---------- structure upgrade paths (Mk1 → Mk3) ---------- */
const BUP={
  turret:[{cm:80, ce:300, t:10, desc:'Mk2: +60% damage, +20% range', clvl:3},
          {cm:160,ce:620, t:14, desc:'Mk3: +140% damage, +40% range, +50% HP', clvl:6}],
  bunker:[{cm:120,ce:380,t:11,desc:'Mk2: +35% damage, +20% range, reinforced armor',clvl:4},
          {cm:210,ce:680,t:15,desc:'Mk3: +75% damage, +35% range, smart twin cannons',clvl:7}],
  mex:   [{cm:90, ce:280, t:12, desc:'Mk2: +4 → +7 mass', clvl:3},
          {cm:180,ce:560, t:16, desc:'Mk3: +7 → +11 mass', clvl:6}],
  pgen:  [{cm:80, ce:0,   t:10, desc:'Mk2: +14 → +24 energy', clvl:3},
          {cm:160,ce:0,   t:14, desc:'Mk3: +24 → +38 energy', clvl:6}],
  fac:   [{cm:170,ce:650, t:16, desc:'TECH 2: unlocks advanced units', req:'techlab', clvl:4}],
  aatower:[{cm:90,ce:320, t:10, desc:'Mk2: +70% damage, +25% range', clvl:4},
           {cm:185,ce:640,t:15,desc:'Mk3: +120% damage, +38% range, hardened tracking crown',clvl:7}],
  hellstorm:[{cm:150,ce:520,t:12,desc:'Mk2: +35% damage, +15% range, reinforced mount',clvl:5},
             {cm:250,ce:860,t:16,desc:'Mk3: +75% damage, +25% range, eight-barrel storm',clvl:8}],
  arc:   [{cm:180,ce:680,t:13,desc:'Mk2: +40% damage, +18% range, reinforced coils',clvl:6},
          {cm:300,ce:1080,t:18,desc:'Mk3: +85% damage, +30% range, expanded chain crown',clvl:9}],
  rail:  [{cm:210,ce:760,t:14,desc:'Mk2: +45% damage, +18% range, reinforced mount',clvl:7},
          {cm:360,ce:1240,t:19,desc:'Mk3: +90% damage, +32% range, twin accelerator banks',clvl:9}],
  bastion:[{cm:240,ce:900,t:16,desc:'Mk2: +45% damage, +20% range, reinforced magazine',clvl:7},
           {cm:390,ce:1380,t:21,desc:'Mk3: +90% damage, +35% range, concussion payload',clvl:10}],
  minelaser:[{cm:210,ce:760,t:14,desc:'Mk2: +45% damage, +15% range, twin capacitor banks',clvl:6},
             {cm:340,ce:1180,t:18,desc:'Mk3: +85% damage, +28% range, focused armor erosion',clvl:8}],
  missilebastion:[{cm:250,ce:880,t:15,desc:'Mk2: +35% damage, +15% range, expanded rack',clvl:7},
                  {cm:390,ce:1320,t:20,desc:'Mk3: +75% damage, +25% range, four-target salvo',clvl:9}],
  plasma:[{cm:230,ce:840,t:15,desc:'Mk2: +40% damage, +15% range, residual splash',clvl:7},
          {cm:370,ce:1280,t:20,desc:'Mk3: +85% damage, +25% range, triple-stage charge',clvl:9}],
  stormcaller:[{cm:290,ce:1050,t:16,desc:'Mk2: +35% shell damage, +12% range, faster charge',clvl:7},
               {cm:460,ce:1600,t:22,desc:'Mk3: +75% shell damage, +22% range, storm doctrine',clvl:9}],
  sgen:[{cm:150,ce:560,t:12,desc:'Mk2: wider field and stronger repairs',clvl:5},
        {cm:260,ce:920,t:16,desc:'Mk3: reinforced barrier and rapid repair matrix',clvl:7}],
  uplink:[{cm:140,ce:520,t:11,desc:'Mk2: wider targeting network and +47% tower range',clvl:5},
          {cm:240,ce:860,t:15,desc:'Mk3: battlefield array and +60% tower range',clvl:7}],
  nova:[{cm:360,ce:1300,t:18,desc:'Mk2: reinforced silo and 15% faster recharge',clvl:8},
        {cm:560,ce:2100,t:24,desc:'Mk3: expanded cells and 30% faster recharge',clvl:10}],
};
function bldDmgTierMul(type,lvl){
  return type==='turret'?(lvl===3?2.4:lvl===2?1.6:1)
       :type==='bunker'?(lvl===3?1.75:lvl===2?1.35:1)
       :type==='aatower'?(lvl===3?2.2:lvl===2?1.7:1)
       :type==='hellstorm'?(lvl===3?1.75:lvl===2?1.35:1)
       :type==='arc'?(lvl===3?1.85:lvl===2?1.4:1)
       :type==='rail'?(lvl===3?1.9:lvl===2?1.45:1)
       :type==='bastion'?(lvl===3?1.9:lvl===2?1.45:1)
       :type==='minelaser'?(lvl===3?1.85:lvl===2?1.45:1)
       :type==='missilebastion'?(lvl===3?1.75:lvl===2?1.35:1)
       :type==='plasma'?(lvl===3?1.85:lvl===2?1.4:1)
       :type==='stormcaller'?(lvl===3?1.75:lvl===2?1.35:1):1;
}
function bldDmgMulAt(B,lvl){
  let m=bldDmgTierMul(B.type,lvl);
  if(B.team===0&&typeof defenseFocus!=='undefined'&&defenseFocus&&DEFT[B.type]) m*=1.15;
  if(B.team===0) m*=resDefDmgMult;
  m*=1+0.12*(B.vet||0);                      // defence veterancy: earned, visible power
  return m;
}
/* ---------- DEFENCE VETERANCY + KILL BOUNTY --------------------------------
   Towers were fire-and-forget furniture: they killed things and nothing came
   back. Now every kill a defensive structure lands pays a small salvage bounty
   and counts toward veterancy tiers (+12% damage each), so a well-sited tower
   visibly grows into the wall it was built to be. Credit is counted from the
   team kill counter delta around the structure's damage call, which means
   splash and chain kills all attribute correctly. */
const DEF_VET_TIERS=[6,16,32];
/* Kill credit for a UNIT. liveTgt is the codebase's existing slot-reuse guard
   (index + generation), so a shell whose shooter died mid-flight credits
   nobody instead of promoting the stranger who took its slot. */
function unitKillCredit(a,gen,got){
  if(!(got>0)||!liveTgt(a,gen)) return;
  ukills[a]+=got;
  const k=ukills[a];
  /* Raise only, never lower. The original inline code used an if/else-if that
     simply never assigned 0, so a rank could not be taken away; a flat
     assignment would DEMOTE any unit holding a rank it did not earn from
     kills (airlift.js restores uvet and ukills as a pair, and a future
     veteran-production upgrade would too). Keep the old semantics exactly. */
  const v=k>=24?3:k>=10?2:k>=4?1:0;
  if(v>uvet[a]) uvet[a]=v;
}
function defKillCredit(B,got){
  if(!B||!B.alive||!(got>0)) return;
  B.kills=(B.kills||0)+got;
  if(B.team===0){
    /* Kill salvage pays the seat whose turret earned it. */
    credit(0,3*got,9*got,typeof commanderSlotForBuilding==='function'?commanderSlotForBuilding(B):null);
    if(perfScale>0.4) addParticle(0,B.x,B.y-8,0,-16,.5,8, 255,215,120);
  }
  const v=B.vet||0;
  if(v<DEF_VET_TIERS.length&&B.kills>=DEF_VET_TIERS[v]){
    B.vet=v+1;
    addParticle(3,B.x,B.y,0,0,.8,BT[B.type].size*1.9, 255,205,96);
    if(B.team===0){
      toast('🎖 '+BT[B.type].name+' promoted to VETERAN '+['I','II','III'][v]+' — +'+(12*(v+1))+'% damage');
      sfx('level',B.x,B.y,.9);
    }
  }
}
function bldDmgMul(B){ return bldDmgMulAt(B,B.lvl||1); }
function bldRngTierMul(type,lvl){
  return type==='turret'? (lvl===3?1.4:lvl===2?1.2:1)
        : type==='bunker'? (lvl===3?1.35:lvl===2?1.2:1)
        : type==='aatower'? (lvl===3?1.38:lvl===2?1.25:1)
        : type==='hellstorm'? (lvl===3?1.25:lvl===2?1.15:1)
        : type==='arc'? (lvl===3?1.30:lvl===2?1.18:1)
        : type==='rail'? (lvl===3?1.32:lvl===2?1.18:1)
        : type==='bastion'? (lvl===3?1.35:lvl===2?1.2:1)
        : type==='minelaser'? (lvl===3?1.28:lvl===2?1.15:1)
        : type==='missilebastion'? (lvl===3?1.25:lvl===2?1.15:1)
        : type==='plasma'? (lvl===3?1.25:lvl===2?1.15:1)
        : type==='stormcaller'? (lvl===3?1.22:lvl===2?1.12:1):1;
}
function bldRngMulAt(B,lvl){
  let m=bldRngTierMul(B.type,lvl);
  if(B.team===0&&typeof defenseFocus!=='undefined'&&defenseFocus&&DEFT[B.type]) m*=1.10;
  if(B.boost>0) m*=B.boostM||UPLINK_BOOST;
  if(B.team<2) m*=fortOf(B.team).rng;      // interlocking fields of fire
  return m;
}
function bldRngMul(B){ return bldRngMulAt(B,B.lvl||1); }
function hasBld(team,type){ for(const B of bldLive) if(B.alive&&B.team===team&&B.type===type&&B.prog>=1) return true; return false; }
function startUpgrade(b){
  const B=blds[b], path=BUP[B.type];
  if(!path) return 'This structure has no upgrades';
  const lvl=B.lvl||1;
  if(B.type==='fac'&&B.tier===2) return 'Already Tech 2';
  if(lvl-1>=path.length) return 'Max level reached';
  const U=path[lvl-1];
  if(U.req && !hasBld(B.team,U.req)) return 'Requires a '+BT[U.req].name;
  if(B.team===0 && U.clvl && heroLvl<U.clvl) return '🔒 Requires Commander level '+U.clvl;
  if(B.upT>0) return 'Already upgrading';
  if(!canAfford(B.team,U.cm,U.ce)) return 'Need '+U.cm+' mass, '+U.ce+' energy';
  pay(B.team,U.cm,U.ce);
  B.upT=U.t; B.upMax=U.t;
  return null;
}
function finishUpgrade(B){
  if(B.type==='fac'){ B.tier=2; if(B.team===0) toast('🏭 Factory upgraded to TECH 2'); return; }
  B.lvl=(B.lvl||1)+1;
  if(B.type==='turret'||B.type==='bunker'||B.type==='aatower'||B.type==='hellstorm'||B.type==='arc'||B.type==='rail'||B.type==='bastion'||B.type==='seafort'||
     B.type==='minelaser'||B.type==='missilebastion'||B.type==='plasma'||B.type==='stormcaller'||B.type==='sgen'||B.type==='uplink'||B.type==='nova'){
    B.hpm*=B.lvl===3?1.5:1.15; B.hp=Math.min(B.hpm,B.hp+B.hpm*0.3);
  }
  if(B.team===0) toast('⬆ '+BT[B.type].name+' upgraded to Mk'+B.lvl);
}

/* ---------- research (Tech Lab) ---------- */
const RESEARCH=[
 {id:'bal1', nm:'Ballistics I',  em:'🗡', ds:'+12% unit damage',   cm:120, ce:500, t:35, req:null, clvl:3},
 {id:'plate1',nm:'Plating I',    em:'🛡', ds:'+15% unit HP',       cm:130, ce:550, t:40, req:null, clvl:3},
 {id:'optics',nm:'Optics Array', em:'🔭', ds:'+12% unit range',    cm:110, ce:480, t:35, req:null, clvl:4},
 {id:'nano', nm:'Field Automation', em:'⚙', ds:'+25% build speed · +2 Constructor/Prospector cap', cm:140, ce:600, t:40, req:null, clvl:4},
 {id:'fusion',nm:'Fusion Cells', em:'⚡', ds:'+30% energy income', cm:120, ce:500, t:35, req:null, clvl:4},
 {id:'hardpoint',nm:'Hardpoint Bracing',em:'🏰',ds:'+25% structure HP',cm:140,ce:580,t:42,req:null,clvl:3},
 {id:'contain',nm:'Containment Lattice',em:'◆',ds:'+50% Research Complex shield',cm:135,ce:620,t:45,req:null,clvl:4},
 {id:'defnet',nm:'Defence Network',em:'🎯',ds:'+15% defensive structure damage',cm:210,ce:920,t:58,req:'hardpoint',clvl:5},
 {id:'bal2', nm:'Ballistics II', em:'⚔', ds:'+15% unit damage',   cm:200, ce:900, t:55, req:'bal1', clvl:6},
 {id:'plate2',nm:'Plating II',   em:'🔰', ds:'+20% unit HP',       cm:220, ce:950, t:60, req:'plate1', clvl:6},
];
/* Research is paid as it runs, so deleting a nearly-finished study was both a
   combat loss and a silent resource wipe. The field network remembers the
   paid elapsed time for the current match; rebuilding a Complex can resume it.
   This is deliberately not account persistence—winning the match still owns
   permanent progression. */
let researched={}, resDone=0, researchCarry={};
function bankResearchProgress(id,t){ researchCarry[id]=Math.max(researchCarry[id]||0,t||0); }
function researchResumeTime(id){ return researchCarry[id]||0; }
let resHpMult=1, resRngMult=1, resEnergyMult=1;
/* PER-CHASSIS BOOSTS — item 5b, "consumables lock to unit TYPE".
   Every consumable in this game was a global scalar applied once at match
   start: readying Repair Nanites made the whole army 8% tougher and asked you
   nothing. Locking a charge to ONE chassis is a decision — which of your units
   is carrying this match — and it has to pay more than spreading it thin, or
   there is nothing to decide. Indexed by TYPES slot; reset with the world. */
const typeHpMult=new Float32Array(TYPES.length+8).fill(1);
const typeDmgMult=new Float32Array(TYPES.length+8).fill(1);
function resetTypeBoosts(){ typeHpMult.fill(1); typeDmgMult.fill(1); }
function typeBoostSummary(){
  const out=[];
  for(let t=0;t<TYPES.length;t++)
    if(typeHpMult[t]!==1||typeDmgMult[t]!==1)
      out.push({ty:t,nm:TYPES[t].name,hp:typeHpMult[t],dmg:typeDmgMult[t]});
  return out;
}
let resBldHpMult=1, resDefDmgMult=1, labBufferMult=1;
/* Crafted-module multiplier. Lives here beside the research ones so everything
   that scales the player's side is in one place. */
let bldSpeedMult=1;
function applyResearch(id){
  delete researchCarry[id];
  researched[id]=true; resDone++;
  if(id==='bal1') armyDmgMult+=0.12;
  else if(id==='bal2') armyDmgMult+=0.15;
  else if(id==='plate1') resHpMult+=0.15;
  else if(id==='plate2') resHpMult+=0.20;
  else if(id==='optics') resRngMult+=0.12;
  else if(id==='nano') playerBuildMult+=0.25;
  else if(id==='fusion') resEnergyMult+=0.30;
  else if(id==='hardpoint'){
    resBldHpMult*=1.25;
    for(const B of blds) if(B.alive&&B.team===0){ const old=B.hpm; B.hpm*=1.25; B.hp+=B.hpm-old; }
  }
  else if(id==='contain'){
    labBufferMult*=1.5;
    for(const B of blds) if(B.alive&&B.team===0&&B.type==='techlab'){
      B.shieldMax=900*labBufferMult; B.shield=Math.min(B.shieldMax,B.shield+450);
    }
  }
  else if(id==='defnet') resDefDmgMult*=1.15;
  toast('🔬 '+RESEARCH.find(r=>r.id===id).nm+' complete · +3 ◆ Data at debrief');
  sfx('notify');
}

/* (volumetric terrain destruction lives in the engine layer — see applyDeform) */

const FAC_UP={cm:170, ce:650, t:16};
/* DEFENSES MUST OUTRANGE HEROES. At 155 range and 36 damage a Sentinel could
   not scratch a raiding Commander: every playable hero except Nova's outranged
   it and 36dps loses to baseline hero regen alone. 170 range puts the tower
   inside every basic hero's face, and 46dps makes standing in it a decision. */
const TURRET_DMG=46, TURRET_RNG=170, TURRET_COOL=1.0;
/* A one-cycle containment relay gives defenders a readable response window
   when a raid reaches the tech core. It prevents a single burst from erasing
   the building, then only rearms after the Complex is repaired and its buffer
   has recovered. Sustained pressure still kills it. */
const TECH_GUARD={trigger:.38,floor:.14,duration:5.5,rearm:28,hpReady:.86,shieldReady:.90};
/* One source of truth for defensive previews. The firing code still owns the
   behaviours (chain, splash, air-only, minimum range); this table exposes the
   numbers those behaviours actually consume so the panel cannot advertise a
   different weapon from the one on the battlefield. */
const DEF_WEAPON_DATA={
  turret:{dmg:TURRET_DMG,rng:TURRET_RNG,cool:TURRET_COOL,wk:'b'},
  bunker:{dmg:BUNKER.dmg,rng:BUNKER.rng,cool:BUNKER.cool,wk:'e'},
  aatower:{dmg:AA.dmg,rng:AA.rng,cool:AA.cool,wk:'e'},
  bastion:{dmg:BASTION.dmg,rng:BASTION.rng,min:BASTION.minRng,cool:BASTION.cool,wk:'e'},
  seafort:{dmg:BASTION.dmg*.84,rng:BASTION.rng*.86,min:BASTION.minRng*.72,cool:BASTION.cool*.82,wk:'e'},
  hellstorm:{dmg:HELL.dmg,rng:HELL.rng,cool:HELL.cool,wk:'p'},
  arc:{dmg:ARC.dmg,rng:ARC.rng,cool:ARC.cool,wk:'b'},
  rail:{dmg:RAIL.dmg,rng:RAIL.rng,cool:RAIL.cool,wk:'g'},
  minelaser:{dmg:MINELASER.dmg,rng:MINELASER.rng,cool:MINELASER.cool,wk:'b'},
  missilebastion:{dmg:MISSILE_BASTION.dmg,rng:MISSILE_BASTION.rng,cool:MISSILE_BASTION.cool,wk:'e'},
  plasma:{dmg:PLASMA_CHARGER.dmg,rng:PLASMA_CHARGER.rng,cool:PLASMA_CHARGER.cool,wk:'i'},
  stormcaller:{dmg:STORM.dmg*STORM.shells,rng:STORM.rng,min:STORM.minRng,cool:STORM.cd,wk:'e'}
};
const BLD_HP_UPGRADES={turret:1,bunker:1,aatower:1,hellstorm:1,arc:1,rail:1,bastion:1,seafort:1,
  minelaser:1,missilebastion:1,plasma:1,stormcaller:1,sgen:1,uplink:1,nova:1};
function bldWeaponSnapshot(B,lvl){
  const W=DEF_WEAPON_DATA[B.type]; if(!W) return null;
  const L=lvl||B.lvl||1;
  return {damage:W.dmg*bldDmgMulAt(B,L),range:W.rng*bldRngMulAt(B,L),
    minRange:W.min||0,rate:1/W.cool,dps:W.dmg*bldDmgMulAt(B,L)/W.cool,wk:W.wk};
}
function bldSupportSnapshot(B,lvl){
  const L=lvl||B.lvl||1,up=Math.max(0,L-1);
  if(B.type==='sgen') return {field:120+up*18,repair:(12+up*7)*2};
  if(B.type==='uplink') return {field:UPLINK_R*(1+up*.18),boost:UPLINK_BOOST+up*.125};
  if(B.type==='nova') return {recharge:NOVA.cd/(L===3?1.30:L===2?1.15:1),damage:NOVA.dmg};
  if(B.type==='mex') return {income:L===3?11:L===2?7:4};
  if(B.type==='pgen') return {income:L===3?38:L===2?24:14};
  return null;
}
function bldProjectedHp(B,lvl){
  let hp=B.hpm,L=B.lvl||1;
  if(!BLD_HP_UPGRADES[B.type]) return hp;
  while(L<lvl){ L++; hp*=L===3?1.5:1.15; }
  return hp;
}
function bldNum(v){ return v>=100?Math.round(v):Math.round(v*10)/10; }
function bldPanelStatText(B){
  const W=bldWeaponSnapshot(B,B.lvl||1);
  if(W) return 'DAMAGE '+bldNum(W.damage)+'  ·  RANGE '+bldNum(W.range)+'  ·  RATE '+bldNum(W.rate)+'/s';
  const S=bldSupportSnapshot(B,B.lvl||1);
  if(B.type==='sgen') return 'FIELD '+bldNum(S.field)+'  ·  STRUCTURE REPAIR '+bldNum(S.repair)+'/s';
  if(B.type==='uplink') return 'FIELD '+bldNum(S.field)+'  ·  RANGE BOOST +'+bldNum((S.boost-1)*100)+'%';
  if(B.type==='nova') return 'STRIKE '+NOVA.dmg+'  ·  RECHARGE '+bldNum(S.recharge)+'s';
  if(B.type==='mex'){
    const D=B.dep>=0?deposits[B.dep]:null,tier=depositTier(D),rate=S.income*(DEPOSIT_YIELD[tier]||0);
    return tier>0?'MASS +'+bldNum(rate)+'/s  ·  FIELD TIER '+tier+'  ·  '+Math.ceil(D.remaining)+' ORE LEFT'
                 :'FIELD DEPLETED  ·  RELOCATE MINERS';
  }
  if(B.type==='pgen') return 'ENERGY INCOME +'+S.income+'/s';
  return (BT[B.type].bcat||'STRUCTURE').toUpperCase()+'  ·  HP '+Math.ceil(B.hpm);
}
function bldUpgradeDeltaText(B){
  const path=BUP[B.type],L=B.lvl||1;if(!path||L-1>=path.length) return '';
  const N=L+1,W0=bldWeaponSnapshot(B,L),W1=bldWeaponSnapshot(B,N);
  if(W0&&W1) return 'MK'+L+' → MK'+N+'  ·  DAMAGE '+bldNum(W0.damage)+' → '+bldNum(W1.damage)
    +'  ·  RANGE '+bldNum(W0.range)+' → '+bldNum(W1.range)+'  ·  HP '+Math.ceil(B.hpm)+' → '+Math.ceil(bldProjectedHp(B,N));
  const S0=bldSupportSnapshot(B,L),S1=bldSupportSnapshot(B,N);
  if(B.type==='sgen') return 'MK'+L+' → MK'+N+'  ·  FIELD '+bldNum(S0.field)+' → '+bldNum(S1.field)
    +'  ·  REPAIR '+bldNum(S0.repair)+' → '+bldNum(S1.repair)+'/s';
  if(B.type==='uplink') return 'MK'+L+' → MK'+N+'  ·  FIELD '+bldNum(S0.field)+' → '+bldNum(S1.field)
    +'  ·  BOOST +'+bldNum((S0.boost-1)*100)+'% → +'+bldNum((S1.boost-1)*100)+'%';
  if(B.type==='nova') return 'MK'+L+' → MK'+N+'  ·  RECHARGE '+bldNum(S0.recharge)+'s → '+bldNum(S1.recharge)+'s'
    +'  ·  HP '+Math.ceil(B.hpm)+' → '+Math.ceil(bldProjectedHp(B,N));
  if(B.type==='mex'||B.type==='pgen') return 'MK'+L+' → MK'+N+'  ·  INCOME '+S0.income+' → '+S1.income+'/s';
  return 'MK'+L+' → MK'+N+'  ·  '+path[L-1].desc.replace(/^Mk\d:\s*/, '');
}
/* The panel must expose the whole investment before the first button press.
   Hiding Mk3 behind a completed Mk2 makes an upgrade feel like an unexplained
   tax, especially on a phone where returning to a structure takes effort. */
function bldDisplayLevel(B){
  if(!B) return 1;
  /* Factories store tech as tier, everything else as Mk lvl. One read so
     billboards and selection chrome cannot disagree. */
  if(B.type==='fac') return B.tier===2?2:1;
  return Math.max(1,B.lvl||1);
}
function bldUpgradePlanText(B){
  const path=BUP[B.type];
  if(!path) return '';
  const L=typeof bldDisplayLevel==='function'?bldDisplayLevel(B):(B.type==='fac'?(B.tier===2?2:1):(B.lvl||1));
  const out=[];
  for(let i=0;i<path.length;i++){
    const U=path[i], mk=i+2;
    out.push((mk<=L?'✓ ':'')+'MK'+mk+' '+U.cm+'m'+(U.ce?' / '+U.ce+'e':'')+(U.clvl?' · CDR '+U.clvl:''));
  }
  return 'PATH: '+out.join('  →  ');
}
/* Recycling returns half of the mass actually committed to the structure,
   including completed (and already-paid active) upgrades. The old SELL control
   refunded only the original shell, which made an expensive Mk3 dismantle look
   broken rather than intentionally costly. Energy is deliberately not refunded:
   it is operating power, not recoverable material. */
function bldRecycleMass(B){
  /* MUST scale by committed progress. Construction pays a 2% escrow up front
     (MF_BUILD_ESCROW_FRAC) and streams the rest as B.prog advances, so
     refunding against the FULL cost on an unfinished site returned far more
     than was ever paid — an unlimited mass printer via place/recycle. The
     completed-upgrade terms below are paid in full at purchase, so they are
     NOT scaled; only the base structure cost is progress-weighted. */
  const progPaid=Math.max(0,Math.min(1,B.prog!=null?B.prog:1));
  let invested=(BT[B.type].cm||0)*progPaid;
  const path=BUP[B.type]||[];
  const completed=B.type==='fac'?(B.tier===2?1:0):Math.max(0,(B.lvl||1)-1);
  for(let i=0;i<Math.min(completed,path.length);i++) invested+=path[i].cm||0;
  if(B.upT>0&&path[completed]) invested+=path[completed].cm||0;
  return Math.round(invested*0.5);
}
const blds=[];
const BCS=130, BGW=Math.ceil(MAP/BCS)+1;
let bGrid=[];
/* Rebuilding the structure grid also re-rasterises the build territory — a
   37,636-cell sweep with a walkability test per cell. Doing that inside the
   damage handler meant a swarm chewing through a thirty-segment wall line ran
   it thirty times in a few frames. The grid itself is cheap and stays
   immediate; the expensive territory pass is deferred to one rebuild at the
   end of the tick, which is soon enough for something the player reads as a
   static overlay. */
function rebuildBGrid(deferZone){
  /* `deferZone` skips the territory pass entirely: buildZoneTick already
     re-rasterises on a 1.2 s cadence, which is the mechanism that exists
     precisely because terrain and occupancy drift under the player. Structure
     deaths ride that instead of forcing their own sweep. */
  if(!deferZone && typeof markBuildZone==='function') markBuildZone();
  if(typeof refreshFabList==='function'){ refreshFabList(); refreshBldLive(); }
  bGrid=new Array(BGW*BGW);
  for(let b=0;b<blds.length;b++){
    const B=blds[b]; if(!B.alive) continue;
    const c=clamp(B.y/BCS|0,0,BGW-1)*BGW+clamp(B.x/BCS|0,0,BGW-1);
    (bGrid[c]||(bGrid[c]=[])).push(b);
  }
}
function findEnemyBld(x,y,team,rad){
  let best=-1,bd=rad*rad;
  const cr=Math.ceil(rad/BCS);
  const cx=clamp(x/BCS|0,0,BGW-1), cy=clamp(y/BCS|0,0,BGW-1);
  for(let gy=Math.max(0,cy-cr);gy<=Math.min(BGW-1,cy+cr);gy++)
   for(let gx=Math.max(0,cx-cr);gx<=Math.min(BGW-1,cx+cr);gx++){
    const cell=bGrid[gy*BGW+gx]; if(!cell) continue;
    for(const b of cell){
      const B=blds[b];
      if(B.alive && B.team!==team){
        const d=dist2(x,y,B.x,B.y);
        if(d<bd){ bd=d; best=b; }
      }
    }
  }
  return best;
}
function addBld(type,team,x,y,instant,rot){
  const T=BT[type];
  /* Team colour is not a faction. The old player branch always stamped Nova
     here, so choosing the Brood still built human concrete buildings despite
     the faction mesh registry being present and fully authored. */
  const fac=team===0?(((typeof playerFaction!=='undefined'&&playerFaction)||'nova')):team===2?'horde':
    ((typeof AI!=='undefined'&&AI&&AI.fac)||'legion');
  const doctrineHp=(team===0&&typeof defenseFocus!=='undefined'&&defenseFocus&&DEFT[type])?1.20:1;
  const hpM=(team===0?bldHpMult*doctrineHp*resBldHpMult:1);
  const shieldMax=type==='techlab'?900*labBufferMult:0;
  const b={type,team,fac,x,y,hp:(instant?T.hp:T.hp*0.1)*hpM,hpm:T.hp*hpM,r:T.r,alive:true,prog:instant?1:0,
            cool:0,queue:[],repeat:false,prodT:0,heal:0,tier:1,lvl:1,upT:0,upMax:1,tang:team?Math.PI:0,
            seen:false,boost:0,boostM:UPLINK_BOOST,res:-1,resT:0,rally:null,rich:false,dep:-1,geo:-1,
            shield:instant?shieldMax:0,shieldMax,shieldT:0,dmgT:0,
            guardReady:type==='techlab',guardT:0,guardCharge:0,
            rot:rot||0,footTier:bldFootTierCount(type,fac),link:0,anim:Math.random()*10,animS:0,conduit:[],
            buildPaidM:instant?T.cm:0,buildPaidE:instant?T.ce:0,buildStalled:false};
  if(type==='mex') for(let di=0;di<deposits.length;di++){
    const D=deposits[di];
    if(dist2(D.x,D.y,x,y)<9){ b.dep=di; b.rich=(D.initialTier||1)>=3; D.taken=true; break; }
  }
  if(type==='geo') for(let gi=0;gi<geysers.length;gi++){
    const G=geysers[gi];
    if(dist2(G.x,G.y,x,y)<9){b.geo=gi;break;}
  }
  if(type==='nova') b.cool=NOVA.cd*0.6;          // first charge after construction
  blds.push(b); rebuildBGrid();
  /* Level and pave the ground for it. Doing this at placement rather than at
     completion means the site is visibly prepared while construction runs.
     Brood harbor is water, so it must not pour concrete — but it still needs
     the U-slip creep bed or the berth sits on a neighbour's veined disc. */
  if(type!=='nest'&&(T.placement!=='water'||(fac==='horde'&&type==='harbor'))){
    if(fac==='horde'&&typeof makeOrganicFoundation==='function') makeOrganicFoundation(b);
    else if(T.placement!=='water') makeFoundation(b);
  }
  if(type==='mex'&&instant) deployExtractorMiner(b);
  return b;
}
/* BASE UNDER ATTACK.
   On a phone the player sees a fraction of the map, and until now nothing told
   them a structure was being taken apart — no ping, no sound, no message. You
   found out when the building was already gone. This is throttled so a long
   siege does not spam, and only fires for damage the player did not order. */
/* alarmT is an absolute match-clock timestamp. resetWorld restarts stats.t at 0
   but used to leave alarmT holding the previous match's value, so "base under
   attack" — ping, sfx, toast and jump button — stayed suppressed for the first
   several minutes of every match after the first. Reset in resetWorld. */
let alarmT=0, alarmX=0, alarmY=0;
function baseAlarm(B){
  if(B.team!==0 || stats.t<alarmT) return;
  alarmT=stats.t+9; alarmX=B.x; alarmY=B.y;
  if(typeof mmPing==='function') mmPing(B.x,B.y);
  sfx('alarm',B.x,B.y,1.2);
  buzz(60);
  toast('⚠ '+(BT[B.type]?BT[B.type].name:'Structure')+' UNDER ATTACK — tap the alert to jump');
  if(typeof showAlert==='function') showAlert(B.x,B.y);
}
function damageBld(b,dmg,attTeam){
  const B=blds[b]; if(!B||!B.alive) return;
  if(B.team===0&&attTeam!==0&&META.settings.godMode){B.hp=B.hpm;return;}
  if(B.team===0 && attTeam!==0) baseAlarm(B);
  if(typeof aiOnBldHit==='function'&&B.team===1&&attTeam===0) aiOnBldHit(B,dmg,attTeam);
  B.dmgT=6;
  if(B.shieldT>0) dmg*=0.72;                                  // protected by an Aegis Relay
  if(B.team<2&&B.type!=='nest') dmg*=fortOf(B.team).armor;   // perimeter hardening
  if(B.shield>0){
    const take=Math.min(B.shield,dmg); B.shield-=take; dmg-=take;
    addParticle(0,B.x+rr(-B.r,B.r),B.y+rr(-B.r,B.r),0,0,.18,9,110,220,255);
    if(dmg<=0){ B.hitT=0.2; return; }
  }
  /* Trigger on the threshold crossing, including a nominally lethal hit. Once
     active, the floor is absolute for its short lifetime; the attacker must
     remain on target after the relay burns out. */
  if(B.type==='techlab'&&B.guardReady&&B.hp>B.hpm*TECH_GUARD.floor&&B.hp-dmg<=B.hpm*TECH_GUARD.trigger){
    B.guardReady=false; B.guardT=TECH_GUARD.duration+(researched.contain?2:0); B.guardCharge=0;
    if(B.team===0){
      toast('◆ RESEARCH CONTAINMENT — '+Math.ceil(B.guardT)+'s to reinforce the Complex');
      sfx('surge',B.x,B.y,1.25); buzz([45,35,70]);
    }
  }
  if(B.type==='techlab'&&B.guardT>0) B.hp=Math.max(B.hpm*TECH_GUARD.floor,B.hp-dmg*.24);
  else B.hp-=dmg;
  B.hitT=0.35;                                               // drives the flinch/spark anim
  if(typeof orgfxOnBld==='function') orgfxOnBld(B,dmg,B.hp<=0);
  if(B.hp>0 && B.hp<B.hpm*0.78 && perfScale>0.35){
    addParticle(0,B.x+rr(-B.r*0.55,B.r*0.55),B.y+rr(-B.r*0.55,B.r*0.55),0,0,.35,4.8,255,140,40);
    if(Math.random()<0.65)
      addParticle(0,B.x+rr(-B.r*0.40,B.r*0.40),B.y+rr(-B.r*0.40,B.r*0.40),0,0,.28,3.8,255,128,36);
  }
  if(B.hp<=0){
    B.alive=false;
    B.fallT=stats.t;
    if(B.type==='mex'&&B.dep>=0) redirectProspectorsFromNode(B.dep,B.team);
    const Tb0=BT[B.type], bsz=Tb0.size;
    const civic=typeof cityGroundAt==='function' && cityGroundAt(B.x,B.y)>=1;
    /* A nest is grown tissue. Masonry collapse + wreck fire is the same
       drowning fireball the large-Brood unit path used to fire. orgfxOnBld
       already sprayed ichor; puddles stay billboards. Civic: no crater. */
    const grown=B.type==='nest'||B.team===2
      ||(typeof orgfxBldOrganic==='function'&&orgfxBldOrganic(B));
    if(!grown) spawnBuildingCollapse(B.x,B.y,bsz,civic);
    if(!(grown&&civic)){
      addCrater(B.x,B.y, civic?Math.min(bsz*1.05,64):Math.min(bsz*1.75,120));
      deformTerrain(B.x,B.y, civic?Math.min(bsz*1.15,52):Math.min(bsz*1.65,115), civic?0.032:0.072, civic?'shell':'blast');
    }
    addRubble(B.x,B.y,bsz*0.9);
    addRubble(B.x+rr(-bsz*0.35,bsz*0.35),B.y+rr(-bsz*0.35,bsz*0.35),bsz*0.55);
    if(!grown){
      if(civic){
        addGroundBurn(B.x,B.y, Math.max(bsz*1.35,48), 1);
        spawnCivicWreckFire(B.x,B.y,bsz);
      } else {
        addGroundBurn(B.x,B.y, Math.max(bsz*0.95,28), 1);
        spawnCivicWreckFire(B.x,B.y,bsz*0.72);
      }
    }
    shake=Math.max(shake,6);
    sfx('boom',B.x,B.y,1.6);
    rebuildBGrid(true);                       // territory catches up at end of tick
    /* Every structure that falls — yours, theirs, a wildlife nest — leaves a
       debris field worth roughly half what it cost to raise. Whoever holds the
       ground afterwards gets paid, which is why you counter-attack.        */
    const Tb=BT[B.type], big=Tb.size>=46;
    /* A nest is grown tissue, not a fabricated building. */
    if(B.type==='nest') addWreckField(B.x,B.y, 0, Tb.size*2.2, WRECK_BIO, Tb.size*0.75, big?4:2);
    else addWreckField(B.x,B.y, Tb.cm*0.55+18, Tb.ce*0.30, WRECK_STRUCT, Tb.size*0.75, big?4:2);
      /* Release by the INDEX that claimed the node, not by coordinate equality.
         econBindResourceNode (economy.js:174/184) binds any node within 34wu
         and sets taken=true without moving the building onto it, so an exact
         float compare could never match and the reservation leaked forever.
         The coordinate scan stays as a fallback for anything bound before
         B.dep/B.geo existed. */
    if(B.type==='mex'){
      if(B.dep>=0&&deposits[B.dep]){ deposits[B.dep].taken=false; B.dep=-1; }
      else for(const D of deposits) if(D.x===B.x&&D.y===B.y) D.taken=false;
    }
    if(B.type==='geo'){
      if(B.geo>=0&&geysers[B.geo]){ geysers[B.geo].taken=false; B.geo=-1; }
      else for(const G of geysers) if(G.x===B.x&&G.y===B.y) G.taken=false;
    }
    if(attTeam===0) heroXP(26);
    if(B.type==='nest'&&attTeam===0){
      stats.nests=(stats.nests||0)+1;            // counted for daily orders
      resM[0]=Math.min(RES_MCAP[0],resM[0]+200);
      heroXP(60);
      toast('🐛 Nest destroyed — +200 mass bounty!');
    }
  }
}
/* Structural patch applied by a Constructor (and future repair sources). HP
   only ever restores toward the ceiling — upgrades set hpm first, then repair
   follows it — so a partially-upgraded turret cannot be healed past its tier. */
function repairBld(B,amt){
  if(!B||!B.alive||B.prog<1) return;
  B.hp=Math.min(B.hpm,B.hp+amt);
}

// ---------- resource nodes: mass deposits, rich veins, energy geysers ----------
// Procedurally seeded per map — every battlefield has its own economy layout,
// always point-mirrored so both commanders get a fair start.
const deposits=[], geysers=[];
const DEPOSIT_BAND=1000;
const DEPOSIT_YIELD=[0,1,1.48,2.12];
/* Geo output stays at the existing +30/s; the new capacity only turns an
   unlimited binary prop into a strategic three-stage field. Three 9k bands
   last fifteen minutes at base output, so ordinary match balance is unchanged
   while long Large-map wars eventually need a second power site. */
const GEYSER_BAND=9000;
function makeDeposit(x,y,rich,starter){
  /* Tier is both a gameplay value and a silhouette. Starter fields begin at
     Tier II, rare contested veins at Tier III, and ordinary expansion pockets
     at Tier I. Every band is finite and visibly collapses into the next. */
  const patterned=((Math.floor(x/97)+Math.floor(y/113))&3)===0;
  const tier=rich?3:(starter||patterned?2:1);
  return {x,y,taken:false,rich:tier===3,starter:starter||'',initialTier:tier,
    tier,capacity:DEPOSIT_BAND*tier,remaining:DEPOSIT_BAND*tier,depleted:false,pulse:rr(0,TAU)};
}
function depositTier(D){
  if(!D||D.remaining<=0){ if(D){D.remaining=0;D.tier=0;D.depleted=true;} return 0; }
  D.tier=clamp(Math.ceil(D.remaining/DEPOSIT_BAND),1,D.initialTier||3);
  D.depleted=false; return D.tier;
}
function depositYield(D){ return DEPOSIT_YIELD[depositTier(D)]||0; }
function drainDeposit(D,amount){
  if(!D||amount<=0||depositTier(D)<=0) return 0;
  const got=Math.min(D.remaining,amount),before=D.tier;
  D.remaining-=got; const after=depositTier(D);
  if(after!==before){
    D.phaseFlash=1.4;
    if(typeof refreshResourceTerrainNode==='function')refreshResourceTerrainNode(D,'mass',before,after);
  }
  return got;
}
function makeGeyser(x,y,starter){
  return {x,y,taken:false,starter:starter||'',initialTier:3,tier:3,
    capacity:GEYSER_BAND*3,remaining:GEYSER_BAND*3,depleted:false,pulse:rr(0,TAU)};
}
function geyserTier(G){
  if(!G)return 0;
  /* Saves created before finite geysers have no capacity fields. Promote them
     in place rather than treating a valid old node as depleted. */
  if(!Number.isFinite(G.capacity)||G.capacity<=0)G.capacity=GEYSER_BAND*3;
  if(!Number.isFinite(G.remaining))G.remaining=G.capacity;
  if(!Number.isFinite(G.initialTier)||G.initialTier<1)G.initialTier=3;
  if(G.remaining<=0){G.remaining=0;G.tier=0;G.depleted=true;return 0;}
  G.tier=clamp(Math.ceil(G.remaining/GEYSER_BAND),1,G.initialTier);
  G.depleted=false;return G.tier;
}
function drainGeyser(G,amount){
  const before=geyserTier(G);
  if(!G||amount<=0||before<=0)return 0;
  const got=Math.min(G.remaining,amount);G.remaining-=got;
  const after=geyserTier(G);
  if(after!==before){
    G.phaseFlash=1.4;
    if(typeof refreshResourceTerrainNode==='function')refreshResourceTerrainNode(G,'energy',before,after);
  }
  return got;
}
function setupDeposits(){
  deposits.length=0; geysers.length=0;
  const def=MAPDEFS[curMap]||MAPDEFS.vanguard;
  srand((def.seed^0x5f3759)|1);
  if(typeof skirmishSpawnPoints==='function'){
    const starts=skirmishSpawnPoints(),all=[],gall=[];
    const addNode=(arr,x,y,rich,minD,starter)=>{
      x=clamp(x,100,MAP-100); y=clamp(y,100,MAP-100);
      /* Objectives belong inside the red tactical line. Starter fields near an
         inlet are projected inward; random expansion fields are rejected by
         the loops below so their authored spacing remains natural. */
      if(typeof battlefieldClampPoint==='function'){
        const p=battlefieldClampPoint(x,y,112); x=p[0]; y=p[1];
      }
      for(const p of arr) if(dist2(x,y,p[0],p[1])<minD*minD) return false;
      arr.push(rich==null?[x,y,null,starter||'']:[x,y,rich,starter||'']); return true;
    };
    /* The selected start owns equal nearby resources. Choosing another edge
       of the map must never secretly remove the opening economy. */
    const bp=typeof battlefieldPresetDef==='function'?battlefieldPresetDef():
      {spread:1,nodes:18,geysers:2,world:1};
    const spread=bp.spread||1;
    for(let si=0;si<starts.length;si++){
      const S=starts[si],a=Math.atan2(MAP*.5-S.y,MAP*.5-S.x),fx=Math.cos(a),fy=Math.sin(a),rx=-fy,ry=fx;
      addNode(all,S.x+fx*150*spread,S.y+fy*150*spread,0,88*spread,S.zone);
      addNode(all,S.x+fx*250*spread+rx*115*spread,S.y+fy*250*spread+ry*115*spread,0,88*spread,S.zone);
      addNode(all,S.x+fx*250*spread-rx*115*spread,S.y+fy*250*spread-ry*115*spread,0,88*spread,S.zone);
      addNode(gall,S.x+fx*355*spread+rx*(si&1?100:-100)*spread,
                    S.y+fy*355*spread+ry*(si&1?100:-100)*spread,null,125*spread,S.zone);
    }
    const bounds=typeof battlefieldPlayBounds==='function'?battlefieldPlayBounds(170*spread):{lo:220,hi:MAP-220};
    let tries=0,target=Math.max(starts.length*3+4,(bp.nodes||18)+Math.max(0,starts.length-2)*3);
    while(all.length<target&&tries++<700){
      const x=rr(bounds.lo,bounds.hi),y=rr(bounds.lo,bounds.hi);
      if(typeof battlefieldContains==='function'&&!battlefieldContains(x,y,112))continue;
      let clear=true; for(const S of starts) if(dist2(x,y,S.x,S.y)<(330*spread)**2){clear=false;break;}
      if(clear) addNode(all,x,y,(all.length%7===3)?1:0,145*spread);
    }
    tries=0; const gTarget=starts.length+(bp.geysers||2);
    while(gall.length<gTarget&&tries++<500){
      const x=rr(bounds.lo,bounds.hi),y=rr(bounds.lo,bounds.hi);
      if(typeof battlefieldContains==='function'&&!battlefieldContains(x,y,112))continue;
      let clear=true; for(const p of all) if(dist2(x,y,p[0],p[1])<(145*spread)**2){clear=false;break;}
      if(clear) addNode(gall,x,y,null,190*spread);
    }
    window.__depPts=all.concat(gall);
    for(const p of all) deposits.push(makeDeposit(p[0],p[1],!!p[2],p[3]||''));
    for(const p of gall) geysers.push(makeGeyser(p[0],p[1],p[3]||''));
    return;
  }
  const pts=[];                              // [x,y,rich]
  const bx=MAP*SP_LO, by=MAP*SP_HI;
  const farOK=(x,y,minD)=>{
    if(typeof battlefieldContains==='function'&&(!battlefieldContains(x,y,112)||
       !battlefieldContains(MAP-x,MAP-y,112)))return false;
    for(const p of pts){
      if(dist2(x,y,p[0],p[1])<minD*minD) return false;
      if(dist2(x,y,MAP-p[0],MAP-p[1])<minD*minD) return false;
    }
    return dist2(x,y,MAP-x,MAP-y)>minD*minD; // keep clear of own mirror point
  };
  // guaranteed starter economy near each base
  pts.push([bx+rr(100,190), by-rr(110,190), 0]);
  pts.push([bx-rr(10,110),  by-rr(230,320), 0]);
  pts.push([bx+rr(230,330), by+rr(-40,60),  0]);
  // contested field — some rich
  let tries=0;
  while(pts.length<9 && tries++<400){
    const x=rr(240,MAP-240), y=rr(240,MAP-240);
    if(!farOK(x,y,165)) continue;
    if(dist2(x,y,bx,by)<330*330 || dist2(x,y,MAP-bx,MAP-by)<330*330) continue;
    pts.push([x,y, pts.length===4||pts.length===7 ?1:0]);
  }
  const gp=[]; tries=0;
  while(gp.length<2 && tries++<300){
    const x=rr(300,MAP-300), y=rr(300,MAP-300);
    let ok=dist2(x,y,bx,by)>380*380 && dist2(x,y,MAP-bx,MAP-by)>380*380;
    if(ok&&typeof battlefieldContains==='function')ok=battlefieldContains(x,y,112)&&battlefieldContains(MAP-x,MAP-y,112);
    if(ok) for(const p of pts) if(dist2(x,y,p[0],p[1])<150*150||dist2(x,y,MAP-p[0],MAP-p[1])<150*150){ ok=false; break; }
    if(ok) for(const g of gp) if(dist2(x,y,g[0],g[1])<220*220||dist2(x,y,MAP-g[0],MAP-g[1])<220*220){ ok=false; break; }
    if(ok) gp.push([x,y]);
  }
  const all=[], gall=[];
  for(const p of pts){ all.push(p); all.push([MAP-p[0],MAP-p[1],p[2]]); }
  for(const p of gp){ gall.push(p); gall.push([MAP-p[0],MAP-p[1]]); }
  window.__depPts=all.concat(gall);          // terrain raises land under all nodes
  for(const p of all) deposits.push(makeDeposit(p[0],p[1],!!p[2],''));
  for(const p of gall) geysers.push(makeGeyser(p[0],p[1],''));
}
function geyserAt(x,y,rad){
  for(let g=0;g<geysers.length;g++){
    const G=geysers[g];
    if(!G.taken&&geyserTier(G)>0&&dist2(x,y,G.x,G.y)<rad*rad) return g;
  }
  return -1;
}
/* THE LANE. The two starts sit on opposite corners, so the only route between
   them is the diagonal — and hives were being seeded by the rule "far from both
   starts", which describes that diagonal almost exactly. The result was a wall
   of chitin sitting on the one path any attack has to walk, and the AI's waves
   died in it every match. Keeping hives off the lane leaves them as objectives
   you go out and hunt, instead of a toll booth on someone else's war. */
function laneDist(x,y){
  if(typeof skirmishSpawnPoints==='function'){
    const S=skirmishSpawnPoints(),A=S[0]; let best=1e12;
    for(const B of S.slice(1)){
      const dx=B.x-A.x,dy=B.y-A.y,L2=dx*dx+dy*dy;
      let t=((x-A.x)*dx+(y-A.y)*dy)/L2;t=t<0?0:(t>1?1:t);
      best=Math.min(best,Math.sqrt(dist2(x,y,A.x+dx*t,A.y+dy*t)));
    }
    return best;
  }
  const ax=MAP*SP_LO, ay=MAP*SP_HI, bx=MAP*SP_HI, by=MAP*SP_LO;
  const dx=bx-ax, dy=by-ay, L2=dx*dx+dy*dy;
  let t=((x-ax)*dx+(y-ay)*dy)/L2;
  t=t<0?0:(t>1?1:t);
  return Math.sqrt(dist2(x,y,ax+dx*t,ay+dy*t));
}
const LANE_CLEAR=430;
function setupNests(){
  if(typeof infestationOn==='boolean'&&!infestationOn) return;
  const def=MAPDEFS[curMap]||MAPDEFS.vanguard;
  srand((def.seed^0x1234f)|1);
  /* Starting hive count was a flat 5 on every difficulty — the map opened with
     the SAME infestation footprint whether the player picked Easy or Hard, so
     even before a single eruption timer fired, Easy already had more hives on
     the ground than its own spread cap (nestSpreadT's `3+tier` ceiling) allows
     it to grow into. Fewer hives at the whistle on Easy means fewer ambient-
     trickle sources and fewer eruption origins for the whole match, which is
     the actual "opening to build" the player needs. Hard is left at 5 — the
     original, intentionally-hard baseline. */
  const nestGoal=Math.max(1, Math.round([3,4,5][diffLvl()] * (broodIsEnemy()?1:0.55) * ((typeof planetInfestMul==='function')?planetInfestMul():1)));
  let n=0, tries=0;
  const placed=[];
  while(n<nestGoal && tries++<200){
    const px2=rr(500,MAP-500), py2=rr(500,MAP-500);
    if(typeof battlefieldContains==='function'&&!battlefieldContains(px2,py2,135))continue;
    if(typeof farFromStartZones==='function'&&!farFromStartZones(px2,py2,650)) continue;
    if(laneDist(px2,py2)<LANE_CLEAR) continue;      // keep the corridor passable
    let clear=true;
    for(const q of placed) if(dist2(px2,py2,q[0],q[1])<380*380){ clear=false; break; }
    if(!clear) continue;
    let L=findLand(px2,py2);
    if(typeof battlefieldClampPoint==='function')L=battlefieldClampPoint(L[0],L[1],135);
    placed.push(L);
    addBld('nest',2,L[0],L[1],true);
    /* Guard units at the hive door scale down too — on Easy a wandering scout
       shouldn't eat a full-strength ambush at every single hive on the map. */
    const guard=Math.round((WC.wild?6:3)*[0.67,1,1][diffLvl()]);
    for(let k=0;k<guard;k++){
      const i=spawnUnit(12,2,L[0]+rr(-50,50),L[1]+rr(-50,50),
        (typeof broodIsEnemy==='function'&&broodIsEnemy())?populationDefaultSeat(1,L[0],L[1]):undefined);
      if(i>=0) ustate[i]=2;
    }
    n++;
  }
}

/* ============================================================
   VOLUMETRIC SHATTER — objects break into ballistic fragments
   carved from their own baked 3D frame (real z-physics: launch,
   gravity, tumble, bounce, settle; moving ground shadows)
   ============================================================ */
const MAXSH=384;
const shX=new Float32Array(MAXSH), shY=new Float32Array(MAXSH);      // ground position
const shVX=new Float32Array(MAXSH), shVY=new Float32Array(MAXSH);
const shZ=new Float32Array(MAXSH), shVZ=new Float32Array(MAXSH);     // altitude physics
const shRot=new Float32Array(MAXSH), shSpin=new Float32Array(MAXSH);
const shLife=new Float32Array(MAXSH), shSize=new Float32Array(MAXSH);
const shU0=new Float32Array(MAXSH), shV0=new Float32Array(MAXSH), shU1=new Float32Array(MAXSH), shV1=new Float32Array(MAXSH);
const shR=new Uint8Array(MAXSH), shG=new Uint8Array(MAXSH), shB=new Uint8Array(MAXSH);
const shBounced=new Uint8Array(MAXSH);
let shHead=0;
const SH_G=290;                                                       // gravity (wu/s²)
function addShard(x,y,vx,vy,vz,size,uv,tr,tg,tb){
  const i=shHead; shHead=(shHead+1)%MAXSH;
  shX[i]=x; shY[i]=y; shVX[i]=vx; shVY[i]=vy;
  shZ[i]=0.1; shVZ[i]=vz;
  shRot[i]=Math.random()*TAU; shSpin[i]=rr(-7,7);
  shLife[i]=2.6+Math.random()*1.2; shSize[i]=size;
  shU0[i]=uv[0]; shV0[i]=uv[1]; shU1[i]=uv[2]; shV1[i]=uv[3];
  shR[i]=tr; shG[i]=tg; shB[i]=tb;
  shBounced[i]=0;
}
// break a baked frame into an N×N grid of textured fragments
function shatterFrame(x,y,worldSize,uv,team,grid,power){
  if(!unitTexReady||!uv) return;
  const n=grid||3, cell=worldSize/n;
  const tc=TEAMC[team]||[255,255,255];
  for(let gy=0;gy<n;gy++) for(let gx=0;gx<n;gx++){
    if(Math.random()<0.18) continue;                                  // ragged break
    const fu0=uv[0]+(uv[2]-uv[0])*gx/n,     fv0=uv[1]+(uv[3]-uv[1])*gy/n;
    const fu1=uv[0]+(uv[2]-uv[0])*(gx+1)/n, fv1=uv[1]+(uv[3]-uv[1])*(gy+1)/n;
    const ox=(gx+0.5-n/2)*cell, oy=(gy+0.5-n/2)*cell;
    const d=Math.max(6,Math.hypot(ox,oy));
    const p=power||1;
    addShard(x+ox, y+oy,
      ox/d*rr(28,85)*p + rr(-14,14),  oy/d*rr(28,85)*p + rr(-14,14),
      rr(55,150)*p,
      cell*rr(0.85,1.1), [fu0,fv0,fu1,fv1], tc[0],tc[1],tc[2]);
  }
}
function shardTick(dt){
  for(let i=0;i<MAXSH;i++){
    if(shLife[i]<=0) continue;
    shLife[i]-=dt;
    if(shZ[i]>0.001||shVZ[i]>0){
      shVZ[i]-=SH_G*dt;
      shZ[i]+=shVZ[i]*dt;
      shX[i]+=shVX[i]*dt; shY[i]+=shVY[i]*dt;
      shRot[i]+=shSpin[i]*dt;
      if(shZ[i]<=0&&shVZ[i]<0){                                      // ground impact
        shZ[i]=0;
        if(!shBounced[i]&&shVZ[i]<-60){
          shBounced[i]=1;
          shVZ[i]*=-0.32; shVX[i]*=0.5; shVY[i]*=0.5; shSpin[i]*=0.4;
          if(Math.random()<0.5) addParticle(1,shX[i],shY[i],rr(-3,3),rr(-6,-2),.4,shSize[i]*0.5, 120,112,96);
        } else { shVZ[i]=0; shVX[i]=0; shVY[i]=0; shSpin[i]*=0.1; }
      }
    }
  }
}

/* ---------- day/night cycle ---------- */
let dayT=0.08;                      // 0=noon .5=midnight; full cycle 8 min
const DAY_LEN=480;
/* Daylight lock is a tactical accessibility option, not a cosmetic filter.
   It deliberately wins over Blood Moon / Eclipse: a player who has disabled
   the cycle asked for an always-readable battlefield, including on a map that
   would otherwise force permanent darkness. */
function dayCycleOn(){ return !(typeof META!=='undefined'&&META.settings&&META.settings.dayNight===false); }
function nightAmt(){ return dayCycleOn() ? (1-Math.cos(dayT*TAU))/2 : 0; }

/* ---------- meteor storms ---------- */
const meteors=[];            // {x,y,t}
let stormTimer=200;
/* ---------- alien infestation — HIVEWORLD escalation ----------
   THE INFESTATION IGNORED THE DIFFICULTY SETTING ENTIRELY, and that single
   omission was behind two separate complaints that sounded unrelated.

   Every number below — tier clock, eruption size, hive count, the Tide — ran off
   match time alone. So "Easy" put the same 220-bugs-per-hive tide on the field
   as Hard, four minutes in, and a new player was buried by a third party they
   never chose to fight. That is the "easy is too hard, I get swarmed" report.

   The second report — "enemy factions never make it to the player" — is the SAME
   BUG seen from the other end. Bugs are hostile to team 1 as well, and the AI's
   attack waves have to cross the same carpet. They were being shredded in transit
   and the retreat rule (below 28% strength) sent the survivors home, so the enemy
   army the player picked never arrived. The player only ever fought bugs.

   So the infestation now scales on every axis, and on Easy it is a hazard rather
   than the main event. The AI is the opponent; the hive is weather.            */
let infestT=230, nestSpreadT=170, infestLvl=0, tideT=260;
/* Difficulty index, safely — sim.js is parsed before ai.js defines AI.
   Prefer the UI's `difficulty` global over AI.diff: newSkirmish() calls
   setupNests() BEFORE aiSetup(difficulty) runs, so AI.diff still holds the
   PREVIOUS match's value (or the default 1) while the hives are placed.
   Reading `difficulty` instead means the very first thing that spawns on
   the map — the starting hive count — actually sees what the player picked. */
function diffLvl(){
  if(typeof difficulty==='number') return clamp(difficulty|0,0,2);
  return (typeof AI!=='undefined'&&AI&&typeof AI.diff==='number')?clamp(AI.diff|0,0,2):1;
}
/* WHOSE ARMY IS THE HIVE?
   It is the Umbral Brood's. That is the design rule this whole section now
   obeys, and it was missing: the infestation ran at full strength no matter who
   the player chose to fight, so picking the Ascendancy still meant spending the
   match killing bugs while the Ascendancy's army was somewhere else entirely.
   The opponent the player picked has to be the opponent they fight.

   Against the Brood the hive IS the war and stays as fierce as it ever was.
   Against anyone else it drops to wildlife: a hazard around the nests, a reason
   to escort an expansion, and nothing that decides a match. */
function broodIsEnemy(){
  return (typeof AI!=='undefined' && AI && AI.fac === 'horde');
}
/* One multiplier for every quantity in this section: how many spawn, how often,
   how many can stand at once. Difficulty first, then the faction rule. */
function infQty(){
  /* Hiveworld overrides the faction rule: you asked for the swarm.
     Brood homeworld maps also thicken the carpet even when the AI is someone
     else — the planet is the hive. Nova homeworlds stay wildlife-thin. */
  const world=(typeof planetInfestMul==='function')?planetInfestMul():1;
  return [0.18, 0.5, 1.0][diffLvl()] * ((broodIsEnemy() || WC.swarm) ? 1 : 0.35)
         * (WC.swarm ? 2.2 : 1) * world;
}
function planetInfestMul(){
  const D=(typeof MAPDEFS!=='undefined'&&MAPDEFS[curMap])?MAPDEFS[curMap]:{};
  if(D.infest!=null) return D.infest;
  const fac=typeof mapHomeFac==='function'?mapHomeFac():'nova';
  return fac==='horde'?1.7:fac==='nova'?0.4:fac==='legion'?0.75:0.55;
}
function bugCap(){
  const D=diffLvl(),k=populationTheatre(),mapMul={compact:.78,standard:1,large:1.22}[k]||1;
  /* Hundreds still read as a tide at RTS camera distance. Thousands multiply
     pathing, targeting, fog and billboard traffic until Android reclaims the
     WebGL context. Keep Unholy dangerous through cadence and composition, not
     by allocating an unrenderable carpet. */
  let hard=[210,360,620][D]*mapMul*(broodIsEnemy()?1:.42)*(WC.swarm?1.22:1);
  if(typeof planetInfestMul==='function'&&planetInfestMul()>1) hard*=1.22;
  if(typeof META!=='undefined'&&META.settings&&META.settings.perf==='low')hard=Math.min(hard,220);
  return Math.max(80,Math.min(FACTION_POP_CAP,Math.round(hard)));
}
function infTier(){                       // threat tier I–V, escalates with match time
  /* Easy takes nearly twice as long to reach each tier, so the early game is
     actually an early game. */
  const D=diffLvl(), brood=broodIsEnemy();
  let t2=1+Math.floor(stats.t/([290,205,155][D]*(brood?1:1.7)));
  if(WC.wild) t2++;
  /* A ceiling, not just a slower climb. Wildlife should never reach the tier
     where the map starts erupting on its own — that escalation belongs to the
     faction whose army it is. */
  const cap = brood ? 5 : [2,2,3][D];
  return Math.min(cap,Math.max(1,t2));
}
function liveNests(){ const n=[]; for(const B of bldLive) if(B.alive&&B.type==='nest') n.push(B); return n; }
/* Eruptions QUEUE their broods and the ground pours bugs continuously —
   thousands stream out over seconds instead of one hitch. */
const bugQ=[];
function bugQPending(){ let n=0; for(const q of bugQ) n+=q.n; return n; }
function nestErupt(N,count,tier){
  let tp=null,td=1e18, te=null,tde=1e18;  // nearest structures of each side
  for(const B of blds){
    if(!B.alive||B.prog<1) continue;
    const dd=dist2(B.x,B.y,N.x,N.y);
    if(B.team===0&&dd<td){ td=dd; tp=B; }
    if(B.team===1&&dd<tde){ tde=dd; te=B; }
  }
  /* Clamp against remaining headroom AT PUSH TIME. The queue drains only while
     there is room under the population cap, so pushing a full tide regardless
     meant entries piled up forever at cap and then avalanched the instant
     bugs started dying — a second wave nobody triggered. What cannot spawn now
     is dropped now. */
  const hiveSeat=(typeof broodIsEnemy==='function'&&broodIsEnemy())?populationDefaultSeat(1,N.x,N.y):POP_PLAYER_SLOT;
  const room=Math.max(0, (typeof broodIsEnemy==='function'&&broodIsEnemy())
    ?populationCapForCommander(hiveSeat)-populationUsedForCommander(hiveSeat)
    :bugCap()-populationUsedFor(2)-bugQPending());
  count=Math.min(count, room);
  if(count<=0) return;
  bugQ.push({x:N.x,y:N.y,n:count,tier,seat:hiveSeat,
    tpx:tp?tp.x:-1,tpy:tp?tp.y:0, tex:te?te.x:-1,tey:te?te.y:0});
  // eruption FX: the ground bursts open
  spawnExplosion(N.x,N.y,30,1);
  addParticle(3,N.x,N.y,0,0,.9,180, 170,235,80);
  for(let k2=0;k2<6;k2++) addParticle(1,N.x+rr(-40,40),N.y+rr(-30,30),rr(-8,8),rr(-20,-8),1.4,16, 90,110,50);
  deformTerrain(N.x,N.y,50,0.02);
}
function bugQTick(){                      // pour queued broods out of the ground
  if(!bugQ.length) return;
  let budget=(typeof fpsShow!=='undefined'&&fpsShow<22)?60:340;   // back off if the device struggles
  budget=Math.min(budget, (typeof broodIsEnemy==='function'&&broodIsEnemy())
    ?Math.max(0,populationCapForCommander(bugQ[0].seat)-populationUsedForCommander(bugQ[0].seat))
    :bugCap()-populationUsedFor(2));
  while(budget>0&&bugQ.length){
    const q=bugQ[0];
    const batch=Math.min(q.n,budget,70);
    for(let k=0;k<batch;k++){
      const alpha=Math.random()<0.02*q.tier;
      const typ=alpha?13:(Math.random()<0.13?17:12);
      const i=spawnUnit(typ,2,q.x+rr(-90,90),q.y+rr(-90,90),q.seat>=0?q.seat:undefined);
      if(i>=0){
        ustate[i]=2; ubuff[i]=q.tier>=4?6:0;              // frenzied at high tiers
        const r3=Math.random();
        /* Who the brood walks at. Half of every eruption marching straight for
           the player made the hive feel personal rather than ambient; on Easy
           most of a tide now wanders or goes for the AI instead. */
        const atPlayer=[0.26,0.38,0.5][diffLvl()]*(broodIsEnemy()?1:0.7);
        if(r3<atPlayer&&q.tpx>=0){ utx[i]=clamp(q.tpx+rr(-140,140),20,MAP-20); uty[i]=clamp(q.tpy+rr(-140,140),20,MAP-20); }
        else if(r3<atPlayer+0.35&&q.tex>=0){ utx[i]=clamp(q.tex+rr(-140,140),20,MAP-20); uty[i]=clamp(q.tey+rr(-140,140),20,MAP-20); }
        else { utx[i]=clamp(q.x+rr(-600,600),20,MAP-20); uty[i]=clamp(q.y+rr(-600,600),20,MAP-20); }
      }
    }
    q.n-=batch; budget-=batch;
    if(q.n<=0) bugQ.shift();
    if((tick&7)===0&&bugQ.length) addParticle(1,q.x+rr(-40,40),q.y+rr(-30,30),rr(-6,6),rr(-16,-8),1.0,14, 90,110,50);
  }
}
/* ---------- ambient bird flocks ---------- */
const birds=[];              // {x,y,vx,vy,n,ph}
function envTick(dt){
  if(!dayCycleOn()) dayT=0.08;                 // stable clear daylight
  else if(WC.moon || WC.dark) dayT=0.5;        // wildcard: endless night
  else dayT=(dayT+dt/DAY_LEN)%1;
  // bird flocks drift across the map (day only)
  for(let b=birds.length-1;b>=0;b--){
    const F=birds[b]; F.x+=F.vx*dt; F.y+=F.vy*dt; F.ph+=dt*9;
    if(F.x<-200||F.x>MAP+200||F.y<-200||F.y>MAP+200) birds.splice(b,1);
  }
  if(birds.length<2 && nightAmt()<0.6 && Math.random()<dt*0.06){
    const side=Math.random()*4|0;
    const F={n:4+(Math.random()*5|0), ph:Math.random()*9, x:0,y:0,vx:0,vy:0};
    const sp=34+Math.random()*22;
    if(side===0){ F.x=-150; F.y=rr(300,MAP-300); F.vx=sp; F.vy=rr(-9,9); }
    else if(side===1){ F.x=MAP+150; F.y=rr(300,MAP-300); F.vx=-sp; F.vy=rr(-9,9); }
    else if(side===2){ F.y=-150; F.x=rr(300,MAP-300); F.vy=sp; F.vx=rr(-9,9); }
    else { F.y=MAP+150; F.x=rr(300,MAP-300); F.vy=-sp; F.vx=rr(-9,9); }
    birds.push(F);
  }
  if(demoMode) return;
  /* The battle setup owns this rule. Off means completely off: no hidden
     starter nests, queued broods, later spread, eruptions or global tides.
     A Horde AI remains a normal enemy faction and is intentionally separate
     from this neutral-map infestation switch. */
  /* WEATHER FIRST, then the infestation. These are independent systems and
     the order within a frame does not matter - but the infestation gate below
     is an early `return`, and everything after it used to be skipped when the
     player turned Infestation off. That silently disabled map hazards (lava
     flows, fault lines, orbital debris, vision storms), the Meteor Season
     wildcard and rubble smoulder. The switch is meant to remove the bugs, not
     the weather, so the weather now runs before the gate can return. */
  const D=diffLvl();
  /* Map-exclusive hazards live in src/hazards.js and tick alongside the
     weather they belong to. */
  if(typeof hazTick==='function') hazTick(dt);
  /* Meteors belong to the Meteor Season wildcard, not to authored meteor
     sites. Those maps already strike through hazards.js (HAZ.mode==='meteor',
     orbital debris). OR-ing mapHazardKey here stacked two inbound toasts and
     two damage pulses on nordhall_peaks. If hazards.js is missing, the site
     still gets this older storm so the weather is not silent. */
  const hazMeteor=(typeof mapHazardMode==='function'?mapHazardMode(curMap)==='meteor'
                 :(typeof mapHazardKey==='function'&&mapHazardKey(curMap)==='meteor'));
  const hazOwnsMeteor=hazMeteor&&typeof hazTick==='function';
  const meteorSite=!hazOwnsMeteor&&!!(WC.meteor||hazMeteor);
  if(meteorSite) stormTimer-=dt;
  if(meteorSite&&stormTimer<=0){
    stormTimer=(90+Math.random()*70)*(WC.meteor?0.33:1)*[2.1,1.4,1][D];
    const n=Math.max(1,(2+Math.random()*3|0)-[2,1,0][D])+(WC.meteor?2:0);
    // aim near random units for drama
    for(let k=0;k<n;k++){
      let x=rr(300,MAP-300), y=rr(300,MAP-300);
      const pick=Math.random()*unitHigh|0;
      if(ualive[pick]&&Math.random()<0.7){ x=clamp(ux[pick]+rr(-160,160),100,MAP-100); y=clamp(uy[pick]+rr(-160,160),100,MAP-100); }
      meteors.push({x,y,t:3.2+k*0.5});
    }
    toast('☄ METEOR STORM INBOUND — clear the strike zones!');
    sfx('alarm');
  }
  // smoldering rubble: civic wreckage keeps coals + smoke, not licking flames
  if(perfScale>0.4) for(const R of rubbles){
    const age=stats.t-(R.ts||0);
    const civic=typeof cityGroundAt==='function' && cityGroundAt(R.x,R.y)>=1;
    if(civic && age<48 && Math.random()<dt*2.2){
      addParticle(1,R.x+rr(-R.s*0.3,R.s*0.3),R.y+rr(-R.s*0.25,R.s*0.25),rr(-3,3),rr(-14,-7),1.4,R.s*0.26, 40,32,28);
      if(Math.random()<0.35) addParticle(0,R.x+rr(-6,6),R.y+rr(-6,6),0,0,.28,4.2, 255,140,60);
    } else if(age<25 && Math.random()<dt*1.6){
      addParticle(1,R.x+rr(-R.s*0.4,R.s*0.4),R.y+rr(-R.s*0.3,R.s*0.3),rr(-2,2),rr(-13,-7),1.1+Math.random()*0.7,R.s*0.28, 46,44,46);
      if(Math.random()<0.25) addParticle(0,R.x+rr(-6,6),R.y+rr(-6,6),0,-4,.3,5, 255,140,60);
    }
  }
  updateSingularities(dt);
  for(let m=meteors.length-1;m>=0;m--){
    const M=meteors[m];
    M.t-=dt;
    if(M.t<=0.35 && !M.fired){
      M.fired=true;
      addParticle(0,M.x,M.y-600,0,0,.35,60, 255,220,150);
    }
    if(M.t<=0){
      meteors.splice(m,1);
      const R=85, DMG=340;
      forUnitsIn(M.x,M.y,R,j=>{
        const fall=1-0.55*Math.sqrt(dist2(M.x,M.y,ux[j],uy[j]))/R;
        dealDamage(j,DMG*fall,2,-1);
      });
      for(let b=0;b<blds.length;b++){
        const Bd=blds[b];
        if(Bd.alive&&dist2(M.x,M.y,Bd.x,Bd.y)<(R+Bd.r)*(R+Bd.r)) damageBld(b,DMG*0.7,2);
      }
      damageScenery(M.x,M.y,R,420);
      spawnExplosion(M.x,M.y,52,1);
      addParticle(3,M.x,M.y,0,0,1.0,R*2.4, 255,150,70);
      addCrater(M.x,M.y,110);
      deformTerrain(M.x,M.y,118, 0.068, 'blast');
      shake=Math.max(shake,10);
      sfx('boom',M.x,M.y,2.2);
    }
  }

  if(typeof infestationOn==='boolean'&&!infestationOn){
    bugQ.length=0; infestLvl=0; return;
  }
  // ---- HIVEWORLD infestation: hives spread, swell, and erupt in tides ----
  const tier=infTier();   // D is hoisted above the gate
  infestLvl=tier;
  // hive spread — faster and denser as the threat grows
  nestSpreadT-=dt;
  if(nestSpreadT<=0){
    nestSpreadT=(Math.max(45,150-tier*20)+Math.random()*40)*[1.9,1.3,1][D];
    const nests=liveNests();
    if(nests.length && nests.length<[3+tier,5+tier*1.5,6+tier*2][D]){
      const N=nests[Math.random()*nests.length|0];
      let L=findLand(N.x+rr(-300,300),N.y+rr(-300,300));
      if(typeof battlefieldClampPoint==='function')L=battlefieldClampPoint(L[0],L[1],135);
      if((typeof battlefieldContains!=='function'||battlefieldContains(L[0],L[1],135))
         && dist2(L[0],L[1],MAP*SP_LO,MAP*SP_HI)>480*480 && dist2(L[0],L[1],MAP*SP_HI,MAP*SP_LO)>480*480
         && laneDist(L[0],L[1])>=LANE_CLEAR){
        let clear=true;
        for(const B of blds) if(B.alive&&dist2(L[0],L[1],B.x,B.y)<120*120){ clear=false; break; }
        if(clear){
          const nb=addBld('nest',2,L[0],L[1],true);
          nb.hpm=nb.hp=2400*(1+0.2*(tier-1));            // late hives are tougher
          mmPing(L[0],L[1]);
          toast('🐛 The infestation spreads — a new hive has taken root ('+liveNests().length+' hives)');
        }
      }
    }
  }
  // pour queued broods out of the ground every tick
  bugQTick();
  // population governor: a struggling device sheds only off-screen wildlife.
  if(typeof fpsShow!=='undefined'&&fpsShow<22&&populationUsedFor(2)>bugCap()*.82){
    const b2=camBounds(); let culled=0;
    for(let i=0;i<unitHigh&&culled<24;i++){
      if(!ualive[i]||uteam[i]!==2||((i+tick)%3)) continue;
      if(ux[i]<b2.x0-380||ux[i]>b2.x1+380||uy[i]<b2.y0-380||uy[i]>b2.y1+380){ killUnit(i,true); culled++; }
    }
  }
  // mass eruptions — multiple hives at once, escalating 20x counts
  infestT-=dt;
  if(infestT<=0){
    infestT=(Math.max(55,210-tier*30)+Math.random()*40)*[1.75,1.25,1][D]*(broodIsEnemy()?1:1.8);
    const nests=liveNests();
    if(nests.length && (broodIsEnemy()?populationCanSpawn(12,2,undefined,nests[0].x,nests[0].y):populationUsedFor(2)<bugCap())){
      const eruptN=Math.max(1,Math.min(nests.length,Math.round((1+tier*0.6)*infQty()*1.8)));
      /* 220 bugs per hive at tier 1 was the headline number, and on Easy it is
         now 55 — enough to matter at a mex outpost, not enough to end a match. */
      const per=Math.max(8,Math.round((6+tier*5)*20*infQty()));
      const pool=[...nests];
      for(let e2=0;e2<eruptN;e2++){
        const N=pool.splice(Math.random()*pool.length|0,1)[0];
        nestErupt(N,per,tier);
        mmPing(N.x,N.y);
      }
      shake=Math.max(shake,3+tier);
      toast(tier>=4?'☠ MASS ERUPTION — '+(eruptN*per).toLocaleString()+' bugs surfacing! KILL THE HIVES!'
                   :'🐛 Hives erupting — '+(eruptN*per)+' bugs pouring out across the map');
      sfx('alarm');
    }
  }
  // THE TIDE — at high tiers, every hive on the map vomits at once.
  // Easy never sees it. It is a spectacle for players who went looking for one.
  if(tier>=[6,5,4][D]){
    tideT-=dt;
    if(tideT<=0){
      tideT=(230+Math.random()*60)*[2,1.4,1][D];
      const nests=liveNests();
      if(nests.length && (broodIsEnemy()?populationCanSpawn(12,2,undefined,nests[0].x,nests[0].y):populationUsedFor(2)<bugCap())){
        let total=0;
        const tc=Math.round((6+tier*5)*40*[0.25,0.55,1][D]);
        for(const N of nests){ total+=tc; nestErupt(N,tc,tier); mmPing(N.x,N.y); }
        shake=Math.max(shake,14); flashScreen();
        toast('☠☠ THE TIDE ☠☠ — '+total.toLocaleString()+' bugs rising. The ground itself is moving. HOLD THE LINE!');
        sfx('alarm');
      }
    }
  }
}

/* ============================================================
   WORLD OBJECTS — supply crates, relic cities, volatile tanks
   ============================================================ */
const crates=[], relics=[], tanks=[];
const CRATE_RARITY=[
  {id:'common',   nm:'Common',   col:[105,215,255]},
  {id:'uncommon', nm:'Uncommon', col:[100,235,145]},
  {id:'rare',     nm:'Rare',     col:[110,145,255]},
  {id:'epic',     nm:'Epic',     col:[205,105,255]},
  {id:'legendary',nm:'Legendary',col:[255,198,75]},
];
const CRATE_KINDS=[
  {id:'mass',  em:'⛏', nm:'Mass Cache',       ds:'+450 mass',rarity:0,w:24,col:[95,220,255],spr:'depR'},
  {id:'power', em:'⚡', nm:'Flux Cell',        ds:'+1800 energy',rarity:0,w:24,col:[255,222,92],spr:'glow'},
  {id:'supply',em:'◆', nm:'Dual Supply Vault',ds:'+250 mass and +900 energy',rarity:1,w:17,col:[100,235,145],spr:'crate'},
  {id:'repair',em:'✚', nm:'Nano Canister',    ds:'Repairs all friendly forces',rarity:1,w:14,col:[95,255,180],spr:'rotor'},
  {id:'scan',  em:'⌾', nm:'Survey Beacon',    ds:'Reveals this sector for 24 seconds',rarity:2,w:10,col:[105,175,255],spr:'dish'},
  {id:'vet',   em:'▲', nm:'Combat Stims',     ds:'Army damage +45% for 30 seconds',rarity:2,w:7,col:[255,115,92],spr:'warn'},
  {id:'xp',    em:'★', nm:'Command Archive',  ds:'Commander gains a level',rarity:3,w:3,col:[215,115,255],spr:'crystal'},
  {id:'nova',  em:'☄', nm:'NOVA Strike Codes',ds:'Recharges NOVA cannons',rarity:4,w:1,col:[255,198,75],spr:'ring'},
  /* Account-progression finds: reaching a cache with a friendly unit pays
     research and crafting, so scouting remains valuable beyond combat buffs. */
  {id:'data',  em:'DATA', nm:'Research Archive', ds:'+4 permanent Research Data',rarity:2,w:8,col:[96,220,255],spr:'crystal'},
  {id:'mats',  em:'MAT', nm:'Crafting Salvage', ds:'Permanent crafting materials',rarity:2,w:8,col:[125,245,180],spr:'crate'},
  /* DROPPED, NOT AIRDROPPED: spawned at the death site of a heavy machine
     (see dropRemains). `w:0` keeps it out of the random supply-pod table. */
  {id:'scrap', em:'♻', nm:'Scrap Crate', ds:'+25 mass recovered from the wreck',rarity:0,w:0,col:[255,210,87],spr:'crate'},
];
let crateT=55, sitePickupT=28, boostDmgT=0;
function spawnCrate(x,y,forced){
  let k=typeof forced==='string'?CRATE_KINDS.find(o=>o.id===forced):forced;
  if(!k){
    let roll=Math.random()*CRATE_KINDS.reduce((n,o)=>n+o.w,0);
    for(const q of CRATE_KINDS){ roll-=q.w; if(roll<=0){k=q;break;} }
    k=k||CRATE_KINDS[0];
  }
  /* Random drops sample the physical square, while Compact and authored map
     edges do not. Clamp before and after the land search: the first gives the
     search a reachable in-theatre seed, and the second prevents findLand from
     stepping back across a notched/coastal command boundary. 36 covers the
     largest rarity crate's ground footprint; two extra world units absorb
     projection/float error instead of leaving its outer pixel on the line. */
  let P=typeof battlefieldClampPoint==='function'?battlefieldClampPoint(x,y,38):[x,y];
  let L=findLand(P[0],P[1]);
  if(typeof battlefieldClampPoint==='function')L=battlefieldClampPoint(L[0],L[1],38);
  crates.push({x:L[0],y:L[1],kind:k,alt:520,t:0,seen:false});
  return crates[crates.length-1];
}
/* Resource-site caches turn neutral economy nodes into scoutable objectives.
   Starter nodes are excluded: every commander already receives the same
   opening economy, and placing a random bonus beside one start would undo that
   fairness. These arrive on the ground, so they do not masquerade as orbital
   supply drops when that rule is disabled. */
function spawnResourceSiteCrate(){
  const sites=[];
  for(const D of deposits) if(!D.taken&&!D.starter) sites.push({x:D.x,y:D.y,k:D.rich?'supply':'mass',site:'MASS SITE'});
  for(const G of geysers) if(!G.taken&&!G.starter) sites.push({x:G.x,y:G.y,k:'power',site:'ENERGY SITE'});
  for(let n=sites.length-1;n>=0;n--){
    const S=sites[n];
    if(typeof farFromStartZones==='function'&&!farFromStartZones(S.x,S.y,430)){ sites.splice(n,1); continue; }
    for(const C of crates) if(dist2(S.x,S.y,C.x,C.y)<190*190){ sites.splice(n,1); break; }
  }
  if(!sites.length) return null;
  const S=sites[Math.random()*sites.length|0],a=Math.random()*TAU;
  const C=spawnCrate(S.x+Math.cos(a)*54,S.y+Math.sin(a)*54,S.k);
  C.alt=0; C.site=true; C.siteName=S.site; C.announced=false;
  return C;
}
function crateTick(dt){
  if(!matchLive||demoMode) return;
  crateT-=dt;
  if(crateRate>0&&crateT<=0&&crates.length<4){
    crateT=(50+Math.random()*40)/(crateRate||1);
    const c2=spawnCrate(rr(300,MAP-300),rr(300,MAP-300));
    mmPing(c2.x,c2.y);
    toast('📦 Supply pod inbound — grab it with any unit');
  }
  else if(crateRate<=0&&crateT<=0) crateT=55;
  sitePickupT-=dt;
  if(sitePickupT<=0&&crates.filter(C=>C.site).length<2){
    const P=typeof battlefieldPresetDef==='function'?battlefieldPresetDef():{site:1};
    sitePickupT=(62+Math.random()*34)*(P.site||1);
    spawnResourceSiteCrate();
  }
  for(let i=crates.length-1;i>=0;i--){
    const C=crates[i];
    C.t+=dt;
    if(C.site&&C.seen&&!C.announced){
      C.announced=true; toast('Survey contact — '+C.siteName+' cache located');
      sfx('radio',C.x,C.y,0.75);
    }
    if(C.alt>0){
      C.alt=Math.max(0,C.alt-dt*300);
      if(C.alt===0){
        addParticle(1,C.x,C.y,0,0,.9,26, 160,150,130);
        sfx('hit',C.x,C.y,1);
      }
      continue;
    }
    // any friendly unit that touches it claims the boost
    let got=-1;
    forUnitsIn(C.x,C.y,62,j=>{ if(got<0&&uteam[j]===0) got=j; });
    if(got>=0){
      applyCrate(C.kind,C.x,C.y);
      const cc=C.kind.col||[255,225,140], burst=10+(C.kind.rarity||0)*3;
      addParticle(3,C.x,C.y,0,0,.8,150+(C.kind.rarity||0)*16,cc[0],cc[1],cc[2]);
      for(let k=0;k<burst;k++) addParticle(0,C.x,C.y,rr(-70,70),rr(-70,70),.5,8,cc[0],cc[1],cc[2]);
      sfx('pickup',C.x,C.y,1);
      crates.splice(i,1);
    } else if(C.t>150&&!(C.kind&&C.kind.id==='campaign_cache')) crates.splice(i,1);
  }
  if(boostDmgT>0){
    boostDmgT-=dt;
    /* Set, not divided — see the stimDmgMult note in commander.js. */
    if(boostDmgT<=0){ stimDmgMult=1; toast('🎖 Combat stims worn off'); }
  }
}
function applyCrate(k,x,y){
  if(k.id==='mass'){ resM[0]=Math.min(RES_MCAP[0],resM[0]+450); pickupToast(k,'+450 MASS'); }
  else if(k.id==='power'){ resE[0]=Math.min(RES_ECAP[0],resE[0]+1800); pickupToast(k,'+1,800 ENERGY'); }
  else if(k.id==='supply'){
    resM[0]=Math.min(RES_MCAP[0],resM[0]+250);resE[0]=Math.min(RES_ECAP[0],resE[0]+900);
    pickupToast(k,'+250 MASS · +900 ENERGY');
  }
  else if(k.id==='vet'){
    stimDmgMult=1.45;
    boostDmgT=30; pickupToast(k,'ARMY DAMAGE +45% · 30 SECONDS');
  }
  else if(k.id==='repair'){
    for(let i=0;i<unitHigh;i++) if(ualive[i]&&uteam[i]===0) uhp[i]=uhpm[i];
    for(const B of blds) if(B.alive&&B.team===0) B.hp=B.hpm;
    pickupToast(k,'ALL FRIENDLY FORCES REPAIRED');
  }
  else if(k.id==='scan'){
    if(typeof fogStartScan==='function') fogStartScan(x,y,24,15);
    pickupToast(k,'LOCAL SENSOR WINDOW · 24 SECONDS');
  }
  else if(k.id==='data'){
    META.researchData=(META.researchData||0)+4;
    if(typeof metaSave==='function') metaSave();
    pickupToast(k,'+4 PERMANENT RESEARCH DATA');
  }
  else if(k.id==='mats'){
    /* One focused material drop is easier to plan around than four tiny
       increments. Relic cores remain tied to hives and ruins. */
    var pool=['alloy','alloy','circuit','circuit','isotope'];
    var mat=pool[Math.random()*pool.length|0],amount=mat==='alloy'?12:(mat==='circuit'?7:4),grant={};
    grant[mat]=amount;
    if(typeof matGrant==='function') matGrant(grant);
    pickupToast(k,'+'+amount+' '+(typeof MATS!=='undefined'?MATS[mat].nm:mat.toUpperCase()).toUpperCase());
  }
  else if(k.id==='scrap'){
    /* A reclaimed hulk pays out like any other salvage: the No Salvage wildcard
       and Salvage Rigs both apply, so a dead tank is worth exactly what the
       player's economy doctrine says wreckage is worth. */
    resM[0]=Math.min(RES_MCAP[0],resM[0]+25*salvageMult);
    pickupToast(k,'+25 MASS');
  }
  else if(k.id==='nova'){
    let n=0; for(const B of blds) if(B.alive&&B.team===0&&B.type==='nova'&&B.cool>0){ B.cool=0; n++; }
    resE[0]=Math.min(RES_ECAP[0],resE[0]+1500);
    pickupToast(k,(n||0)+' NOVA RECHARGED · +1,500 ENERGY');
  }
  else if(k.id==='xp'){ heroXP(heroXpNext-heroXp+1); pickupToast(k,'COMMANDER LEVEL GAINED'); }
}

/* ---------- relic cities & volatile tanks (destructible scenery) ---------- */
/* ================= DERELICT DISTRICTS =====================================
   Cities are not scattered rubble props — they are laid out on a STREET GRID,
   rotated as a whole so each one sits on the land at its own angle. Blocks
   fill the plots, streets are cut into the road network (so they're fast to
   drive and read as real roads), and every block is a fat bank of salvage
   waiting for whoever is willing to level it. Razing a district is a genuine
   economic strategy, not just scenery destruction.
   kind: 0 tower block  1 low block  2 industrial hall  3 tank farm/silo
         4 INTACT civic block — still powered, and deliberately the only one.
   Kind 4 gets NO special simulation rules: same footprint, hit points, salvage
   and collapse as a low block, so it can be razed for the same payout as its
   dead neighbours. Everything that separates it is geometry and one emissive
   colour. Where a lookup is keyed on kind, 4 either falls through to the low
   block on purpose or has its own entry because the value is a measurement of
   the mesh (see carrierRelicRoof).                                          */
const cityZones=[];      // {x,y,r,ind,name,total,razed}
const cityPlan=[];       // block layout, seeded — survives across resets
const cityStreets=[];    // [x0,y0,x1,y1,w,zone] — authored first so plots can face a real street
/* Props an authored template asked for. planDistricts runs before the height
   field exists and before tanks/crates are built, so the stamp records intent
   and setupRelics() spawns it once the land search is safe to call. */
const sitePropQueue=[];  // {kind:'tank'|'crate', x, y, s}
/* Why authored sites failed to place. A silent 0-of-2 is indistinguishable
   from the feature being off, and this placement has six independent ways to
   reject a candidate. */
const SITE_REJ={arena:0,spawn:0,water:0,res:0,near:0,plots:0,ok:0};
/* City occupancy is shared by terrain dressing, prop placement, render LOD
   and combat scarring.  Previously each subsystem rediscovered a city from a
   loose radius (or did not know about it at all), which is how rocks appeared
   through floors and why a generated block looked stamped onto untouched
   wilderness. Values: 0 wild, 1 district envelope, 2 street/service verge,
   3 authored plot. Combat still burns and craters civic ground. Civic bowls
   stay above the waterline and PASS is not rewritten, so the Commander is
   not trapped. Soil bowls may punch below WATER_H but stay dry dirt — they
   must not spawn ponds or rewrite PASS to flood. */
let CITYG=null;
function cityGroundAt(wx,wy){
  if(!CITYG)return 0;
  const x=clamp(wx/MAP*PGS|0,0,PGS-1),y=clamp(wy/MAP*PGS|0,0,PGS-1);
  return CITYG[y*PGS+x]||0;
}
function rebuildCityGroundMask(){
  CITYG=new Uint8Array(PGS*PGS);
  const cell=MAP/PGS;
  const stamp=(gx,gy,v)=>{if(gx>=0&&gy>=0&&gx<PGS&&gy<PGS){const i=gy*PGS+gx;if(v>CITYG[i])CITYG[i]=v;}};
  /* Keep the authored district clear of wilderness clutter, including plazas
     that do not happen to contain a live building. */
  for(const Z of cityZones){
    const r=(Z.span||Z.r)*1.04,x0=clamp((Z.x-r)/cell|0,0,PGS-1),x1=clamp(Math.ceil((Z.x+r)/cell),0,PGS-1);
    const y0=clamp((Z.y-r)/cell|0,0,PGS-1),y1=clamp(Math.ceil((Z.y+r)/cell),0,PGS-1),r2=r*r;
    for(let gy=y0;gy<=y1;gy++)for(let gx=x0;gx<=x1;gx++){
      const wx=(gx+.5)*cell,wy=(gy+.5)*cell;
      if(dist2(wx,wy,Z.x,Z.y)<=r2)stamp(gx,gy,1);
    }
  }
  for(const S of cityStreets){
    const ax=S[0],ay=S[1],bx=S[2],by=S[3],dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy||1,pad=S[4]*.75+24;
    const x0=clamp((Math.min(ax,bx)-pad)/cell|0,0,PGS-1),x1=clamp(Math.ceil((Math.max(ax,bx)+pad)/cell),0,PGS-1);
    const y0=clamp((Math.min(ay,by)-pad)/cell|0,0,PGS-1),y1=clamp(Math.ceil((Math.max(ay,by)+pad)/cell),0,PGS-1);
    for(let gy=y0;gy<=y1;gy++)for(let gx=x0;gx<=x1;gx++){
      const wx=(gx+.5)*cell,wy=(gy+.5)*cell,t=clamp(((wx-ax)*dx+(wy-ay)*dy)/L2,0,1);
      if(dist2(wx,wy,ax+dx*t,ay+dy*t)<=pad*pad)stamp(gx,gy,2);
    }
  }
  for(const P of cityPlan){
    const pad=26,rad=Math.hypot(P.w,P.h)*.62+pad,ca=Math.cos(P.a),sa=Math.sin(P.a);
    const x0=clamp((P.x-rad)/cell|0,0,PGS-1),x1=clamp(Math.ceil((P.x+rad)/cell),0,PGS-1);
    const y0=clamp((P.y-rad)/cell|0,0,PGS-1),y1=clamp(Math.ceil((P.y+rad)/cell),0,PGS-1);
    for(let gy=y0;gy<=y1;gy++)for(let gx=x0;gx<=x1;gx++){
      const dx=(gx+.5)*cell-P.x,dy=(gy+.5)*cell-P.y,lx=dx*ca+dy*sa,ly=-dx*sa+dy*ca;
      if(Math.abs(lx)<=P.w*.61+pad&&Math.abs(ly)<=P.h*.61+pad)stamp(gx,gy,3);
    }
  }
}

/* Planning is separated from instantiation because the streets have to be
   BAKED INTO THE TERRAIN (they're part of the ground texture and the road
   grid), which happens once per map, while the blocks themselves are live
   objects that get rebuilt every match. */
function obbOverlap(b1, b2, margin){
  margin=margin||10;
  const dx=b1.x-b2.x, dy=b1.y-b2.y;
  const r1=Math.hypot(b1.w,b1.h)*0.5+margin, r2=Math.hypot(b2.w,b2.h)*0.5;
  if(dx*dx+dy*dy > (r1+r2)*(r1+r2)) return false;
  const getCorners=(b)=>{
    const ca=Math.cos(b.a), sa=Math.sin(b.a);
    const hw=b.w*0.5+margin*0.5, hh=b.h*0.5+margin*0.5;
    return [
      [b.x - hw*ca + hh*sa, b.y - hw*sa - hh*ca],
      [b.x + hw*ca + hh*sa, b.y + hw*sa - hh*ca],
      [b.x + hw*ca - hh*sa, b.y + hw*sa + hh*ca],
      [b.x - hw*ca - hh*sa, b.y - hw*sa + hh*ca]
    ];
  };
  const c1=getCorners(b1), c2=getCorners(b2);
  const axes=[[Math.cos(b1.a),Math.sin(b1.a)], [-Math.sin(b1.a),Math.cos(b1.a)],
              [Math.cos(b2.a),Math.sin(b2.a)], [-Math.sin(b2.a),Math.cos(b2.a)]];
  for(const axis of axes){
    let min1=Infinity, max1=-Infinity, min2=Infinity, max2=-Infinity;
    for(const p of c1){ const dot=p[0]*axis[0]+p[1]*axis[1]; if(dot<min1)min1=dot; if(dot>max1)max1=dot; }
    for(const p of c2){ const dot=p[0]*axis[0]+p[1]*axis[1]; if(dot<min2)min2=dot; if(dot>max2)max2=dot; }
    if(max1<min2 || max2<min1) return false;
  }
  return true;
}

function planDistricts(){
  cityPlan.length=0; cityStreets.length=0; cityZones.length=0;
  sitePropQueue.length=0;
  /* Per-generation, not cumulative: planDistricts runs more than once per
     session (menu backdrop, then the match), and totals that span both describe
     no world in particular. */
  for(const k in SITE_REJ) SITE_REJ[k]=0;
  const def=MAPDEFS[curMap]||MAPDEFS.vanguard;
  srand((def.seed^0x7ACE1)|1);
  const spawnA=[MAP*SP_LO,MAP*SP_HI], spawnB=[MAP*SP_HI,MAP*SP_LO];
  const farFromSpawns=(x,y,d)=> typeof farFromStartZones==='function'?farFromStartZones(x,y,d)
    :dist2(x,y,spawnA[0],spawnA[1])>d*d&&dist2(x,y,spawnB[0],spawnB[1])>d*d;
  /* Economy fields are authored terrain sites, not props a city may pave
     through. Reserve the complete crystal/geyser corruption footprint while
     choosing a district and again while accepting an individual plot. */
  const clearOfResourceSites=(x,y,r)=>{
    if(typeof deposits!=='undefined')for(const D of deposits)if(dist2(x,y,D.x,D.y)<Math.pow(r+118,2))return false;
    if(typeof geysers!=='undefined')for(const G of geysers)if(dist2(x,y,G.x,G.y)<Math.pow(r+96,2))return false;
    return true;
  };

  /* A centre-point land test is not enough for a rotated city block. On coast
     maps its centre could be dry while a corner sat in the ocean; the grading
     pass then raised that corner above sea level and manufactured a square
     island. Validate the complete apron plus a shoreline buffer before the
     plot becomes part of the authored district. */
  const dryFootprint=(x,y,w,h,a)=>{
    if(typeof battlefieldWaterMode==='function'&&battlefieldWaterMode()==='none')return true;
    const ca=Math.cos(a),sa=Math.sin(a),hw=w*.70+18,hh=h*.70+18;
    const pts=[[0,0],[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh],[-hw,0],[hw,0],[0,-hh],[0,hh]];
    for(const p of pts){
      const wx=x+p[0]*ca-p[1]*sa,wy=y+p[0]*sa+p[1]*ca;
      if(hAt(wx,wy)<WATER_H+.008)return false;
    }
    return true;
  };

  /* A building belongs to a street frontage. The previous planner scattered a
     candidate inside a block, then painted an oversized sidewalk beneath it;
     those two independent decisions let roads run through walls. Snap the lot
     to the nearest street in its district, align its long face to that street,
     and retain an explicit curb-to-entrance connector for terrain painting. */
  const streetFrontage=(x,y,w,h,zone)=>{
    let best=null;
    for(let si=0;si<cityStreets.length;si++){
      const S=cityStreets[si];if(S[5]!==zone)continue;
      const dx=S[2]-S[0],dy=S[3]-S[1],L2=dx*dx+dy*dy||1;
      const t=clamp(((x-S[0])*dx+(y-S[1])*dy)/L2,.08,.92);
      const qx=S[0]+dx*t,qy=S[1]+dy*t,d2=dist2(x,y,qx,qy);
      if(!best||d2<best.d2)best={S,si,qx,qy,dx,dy,d2};
    }
    if(!best)return null;
    const L=Math.hypot(best.dx,best.dy)||1,tx=best.dx/L,ty=best.dy/L,nx=-ty,ny=tx;
    const side=((x-best.qx)*nx+(y-best.qy)*ny)<0?-1:1;
    /* P.w/P.h describe the building footprint; the terrain apron is 1.18x.
       Reserve a visible sidewalk/service strip between that apron and curb. */
    const apronHalf=h*.59,curbHalf=best.S[4]*.5+3,setback=14;
    const centre=curbHalf+setback+apronHalf;
    const facing=s=>({x:best.qx+nx*s*centre,y:best.qy+ny*s*centre,a:Math.atan2(ty,tx),
      street:best.si,roadX:best.qx+nx*s*curbHalf,roadY:best.qy+ny*s*curbHalf,
      frontX:best.qx+nx*s*(curbHalf+setback),frontY:best.qy+ny*s*(curbHalf+setback)});
    const primary=facing(side);primary.alt=facing(-side);return primary;
  };
  const roadClear=(P)=>{
    const ca=Math.cos(P.a),sa=Math.sin(P.a);
    /* Test the entire 1.18x apron against every avenue in this district. This
       rejects corner lots which face one road correctly but clip a crossing
       street. Seven samples per axis are enough at the 12.5 m nav-cell scale. */
    for(let iy=-3;iy<=3;iy++)for(let ix=-3;ix<=3;ix++){
      const lx=P.w*.59*ix/3,ly=P.h*.59*iy/3,x=P.x+lx*ca-ly*sa,y=P.y+lx*sa+ly*ca;
      for(const S of cityStreets){
        if(S[5]!==P.zone)continue;
        const dx=S[2]-S[0],dy=S[3]-S[1],L2=dx*dx+dy*dy||1;
        const t=clamp(((x-S[0])*dx+(y-S[1])*dy)/L2,0,1);
        if(dist2(x,y,S[0]+dx*t,S[1]+dy*t)<Math.pow(S[4]*.5+2,2))return false;
      }
    }
    return true;
  };
  const plot=(x,y,w,h,a,kind,zone)=>{
    const F=streetFrontage(x,y,w,h,zone);
    const pad=Math.max(58,Math.hypot(w,h)*.55);
    const fronts=F?[F,F.alt]:[{x,y,a}];
    for(const V of fronts){
      const candidate={x:V.x,y:V.y,w,h,a:V.a,kind,zone};
      if(F){candidate.street=V.street;candidate.roadX=V.roadX;candidate.roadY=V.roadY;
        candidate.frontX=V.frontX;candidate.frontY=V.frontY;}
      if(typeof battlefieldContains==='function'&&!battlefieldContains(candidate.x,candidate.y,pad))continue;
      if(!dryFootprint(candidate.x,candidate.y,w,h,candidate.a))continue;
      if(!clearOfResourceSites(candidate.x,candidate.y,pad)||!roadClear(candidate))continue;
      let blocked=false;
      for(let i=0;i<cityPlan.length;i++)if(obbOverlap(candidate,cityPlan[i],12)){blocked=true;break;}
      if(blocked)continue;
      cityPlan.push(candidate);cityZones[zone].total++;return true;
    }
    return false;
  };
  /* Street frontage overwrites yaw, so every lot on a parallel avenue
     faced the same way. Square towers/domes take 90° steps; halls only
     flip 180° so the long face still meets the curb. */
  const varyPlot=()=>{
    const last=cityPlan[cityPlan.length-1]; if(!last) return;
    const h=((last.x*17+last.y*11)|0);
    if(last.kind===0||last.kind===1||last.kind===3||last.kind===4||last.kind===5||last.kind===7)
      last.a+=(h&3)*Math.PI*0.5;
    else if(last.kind===2||last.kind===6) last.a+=(h&1)*Math.PI+((h>>2)&7)*0.035-0.12;
  };
  /* Skip stacking the same short-lot mesh on neighboring plots. Pool is
     the existing civic set (tower/dome/hall/civic) — no new unique meshes. */
  const pickShortKind=(x,y,zi,civicOk,cell)=>{
    if(civicOk) return 4;
    const fac=typeof mapHomeFac==='function'?mapHomeFac():'nova';
    const near=[], r2=cell*cell*0.9;
    for(let i=0;i<cityPlan.length;i++){
      const P=cityPlan[i];
      if(P.zone!==zi) continue;
      if(dist2(P.x,P.y,x,y)<r2) near.push(P.kind);
    }
    /* Homeworld mix uses the existing civic vocabulary: Nova wants towers and
       intact halls, Dominion wants domes, Syndicate wants automation halls,
       Brood wants broken low blocks — no new meshes. */
    let pool=fac==='legion'?[1,1,1,2,0]:fac==='syndicate'?[2,2,0,1]:fac==='horde'?[1,2,2,0]:[0,0,4,2];
    const fresh=pool.filter(k=>near.indexOf(k)<0);
    if(fresh.length) pool=fresh;
    return pool[(((x*19+y*11)|0)>>>0)%pool.length];
  };
  /* Stamp an authored layout (assets/data/sitetemplates.js) at a world point.
     Deliberately a sibling of makeDistrict rather than a global: it writes
     through the same plot() closure, so a template gets the identical street
     frontage search, dry-footprint test and battlefield clamp that procedural
     plots get. A template that cannot legally place its required plots is
     rolled back whole — a half-built outpost reads as a bug, not as ruins. */
  const stampSite=(T,cx2,cy2,cls)=>{
    if(!T) return false;
    const zi=cityZones.length;
    const s0=cityStreets.length, p0=cityPlan.length;
    const ga=T.rotation==='random'?rr(0,TAU):(+T.rotation||0);
    const ca=Math.cos(ga), sa=Math.sin(ga);
    const L2W=(lx,ly)=>[cx2+lx*ca-ly*sa, cy2+lx*sa+ly*ca];
    cityZones.push({x:cx2,y:cy2,r:T.radius||200,ind:T.ind?1:0,total:0,razed:0,claimed:0,
                    name:T.name||'SITE',tpl:1,grade:T.grade||'plane',site:cls||T.id||'site'});
    for(const S of (T.streets||[])){
      const a2=L2W(S[0],S[1]), b2=L2W(S[2],S[3]);
      cityStreets.push([a2[0],a2[1],b2[0],b2[1],S[4],zi]);
    }
    let ok=true;
    for(const P of (T.plots||[])){
      if(P.optional!==undefined && rnd()>P.optional) continue;
      const W=L2W(P.x,P.y);
      const placed=plot(W[0],W[1],P.w,P.h,(P.a||0)+ga,P.kind,zi);
      /* plot() appends on success, so the role rides on the entry it just made.
         The sim treats 6/7 generically; only the render pass reads role. */
      if(placed&&P.role&&cityPlan.length) cityPlan[cityPlan.length-1].role=P.role;
      if(!placed&&P.required){ ok=false; break; }
    }
    if(!ok){
      cityStreets.length=s0; cityPlan.length=p0; cityZones.length=zi;
      return false;
    }
    /* Props are recorded, not spawned. This runs inside planDistricts, which is
       well before setupRelics() builds tanks and crates and before the height
       field the land search needs exists — spawning here would either throw or
       drop props into water. setupRelics drains the queue once it is safe. */
    for(const R of (T.props||[])){
      const W=L2W(R.x,R.y);
      sitePropQueue.push({kind:R.kind,x:W[0],y:W[1],s:R.s||0});
    }
    return true;
  };
  const makeDistrict=(cx2,cy2,ind)=>{
    const zi=cityZones.length;
    cityZones.push({x:cx2,y:cy2,r:ind?300:340,ind,total:0,razed:0,claimed:0,
                    name:ind?'INDUSTRIAL BELT':'DERELICT DISTRICT',site:ind?'indus':'city'});
    const ga=rr(0,TAU);                                   // whole district shares one grid angle
    const ca=Math.cos(ga), sa=Math.sin(ga);
    const L2W=(lx,ly)=>[cx2+lx*ca-ly*sa, cy2+lx*sa+ly*ca];
    const CELL=ind?180:134, COLS=ind?3:5, ROWS=ind?3:5;
    const half=n=>-(n-1)/2;
    /* Streets at vehicle scale: a district lane is 13 units kerb to kerb,
       an industrial service road 17 — the old 20/26 poured half the district
       in grey. */
    const SW=ind?17:13;
    let civic=0;                                          // intact blocks placed here
    for(let r2=0;r2<ROWS;r2++){                            // avenues
      const ly=(half(ROWS)+r2)*CELL;
      const a2=L2W(half(COLS)*CELL-CELL*0.5,ly), b2=L2W((half(COLS)+COLS-1)*CELL+CELL*0.5,ly);
      cityStreets.push([a2[0],a2[1],b2[0],b2[1],SW,zi]);
    }
    for(let c3=0;c3<COLS;c3++){                            // cross streets
      const lx=(half(COLS)+c3)*CELL;
      const a2=L2W(lx,half(ROWS)*CELL-CELL*0.5), b2=L2W(lx,(half(ROWS)+ROWS-1)*CELL+CELL*0.5);
      cityStreets.push([a2[0],a2[1],b2[0],b2[1],SW,zi]);
    }
    /* SKYLINE ANCHOR. Every derelict district gets one true skyscraper,
       placed BEFORE the ordinary blocks so the tallest lot always lands and
       the grid fills in around it (plot() rejects overlaps). NOT at the
       exact centre: that is a street INTERSECTION, and roadClear correctly
       rejects any lot whose apron a crossing avenue clips — so the anchor
       takes a cell centre adjacent to the heart, first one that clears. */
    if(!ind){
      const s5=rr(50,60);
      for(const [ax,ay] of [[CELL*0.5,CELL*0.5],[-CELL*0.5,CELL*0.5],
                            [CELL*0.5,-CELL*0.5],[-CELL*0.5,-CELL*0.5],
                            [CELL*1.5,CELL*0.5],[CELL*0.5,CELL*1.5]]){
        const A=L2W(ax,ay);
        if(isWalkable(A[0],A[1])&&plot(A[0],A[1],s5,s5,ga,5,zi)){ varyPlot(); break; }
      }
    }
    for(let r2=0;r2<ROWS;r2++) for(let c3=0;c3<COLS;c3++){
      const fac=typeof mapHomeFac==='function'?mapHomeFac():'nova';
      const skip=ind?(fac==='syndicate'||fac==='legion'?0.12:0.20):(fac==='nova'?0.06:fac==='horde'?0.28:0.14);
      if(rnd()<skip) continue;                  // plazas and collapsed lots
      const lx=(half(COLS)+c3)*CELL+CELL*0.5, ly=(half(ROWS)+r2)*CELL+CELL*0.5;
      const P=L2W(lx,ly);
      if(!isWalkable(P[0],P[1])||!farFromSpawns(P[0],P[1],520)) continue;
      if(ind){
        /* Mix hall/tower/dome from the existing set so the belt is not one stamp. */
        const kit=typeof civicKitFill==='function'?civicKitFill(fac,rnd):null;
        if(kit){
          if(plot(P[0],P[1], kit.w, kit.h, ga, kit.kind, zi)){
            varyPlot(); cityPlan[cityPlan.length-1].role=kit.role;
          }
        }else{
          const roll=((P[0]*13+P[1]*7)|0)%5;
          let ikind=roll===0?0:roll===1?1:2;
          if(fac==='legion') ikind=roll<2?1:roll<4?2:0;
          else if(fac==='syndicate') ikind=roll<3?2:roll===3?3:0;
          const iw=ikind===2?rr(96,132):ikind===3?rr(40,56):ikind===0?rr(44,62):rr(52,78);
          const ih=ikind===2?rr(62,88):ikind===3?rr(40,56):ikind===0?rr(44,62):rr(38,58);
          if(plot(P[0],P[1], iw, ih, ga, ikind, zi)) varyPlot();
        }
        if(rnd()<0.7){
          const T2=L2W(lx+rr(-46,46), ly+(rnd()<0.5?-1:1)*rr(54,68));
          if(isWalkable(T2[0],T2[1])&&plot(T2[0],T2[1],rr(34,46),rr(34,46),ga,3,zi)) varyPlot();
        }
      } else {
        /* Varied derelict layouts: grid, organic cluster, or plaza-centered */
        const layout = rnd()*3|0;
        if(layout===0){
          /* Grid - original behavior */
          const n=1+(rnd()*2.4|0);
          for(let k=0;k<n;k++){
            const Q=L2W(lx+rr(-CELL*0.22,CELL*0.22), ly+rr(-CELL*0.22,CELL*0.22));
            if(!isWalkable(Q[0],Q[1])) continue;
            const r2b=rnd(), tall=r2b<(fac==='nova'?0.55:fac==='legion'?0.22:0.42), civ=!tall&&civic<(fac==='nova'?4:2)&&r2b>=(fac==='nova'?0.72:fac==='horde'?0.96:0.857);
            const kit=!tall&&typeof civicKitFill==='function'?civicKitFill(fac,rnd):null;
            const kind=kit?kit.kind:(tall?0:pickShortKind(Q[0],Q[1],zi,civ,CELL));
            const w=kit?kit.w:(kind===0?rr(40,58):kind===2?rr(72,104):kind===4?rr(50,70):rr(56,84));
            const h=kit?kit.h:(kind===0?rr(40,58):kind===2?rr(48,72):kind===4?rr(50,70):rr(34,50));
            if(plot(Q[0],Q[1], w, h, ga, kind, zi)){ varyPlot(); if(kind===4) civic++; if(kit) cityPlan[cityPlan.length-1].role=kit.role; }
          }
        }else if(layout===1){
          /* Organic cluster - buildings grouped around center */
          const n=2+(rnd()*3|0);
          for(let k=0;k<n;k++){
            const ang=rnd()*TAU, dist=rr(10,CELL*0.45);
            const Q=L2W(lx+Math.cos(ang)*dist, ly+Math.sin(ang)*dist);
            if(!isWalkable(Q[0],Q[1])) continue;
            const r2b=rnd(), tall=r2b<(fac==='nova'?0.48:0.35), civ=!tall&&civic<(fac==='nova'?4:2)&&r2b>=(fac==='nova'?0.74:fac==='horde'?0.96:0.88);
            const kit=!tall&&typeof civicKitFill==='function'?civicKitFill(fac,rnd):null;
            const kind=kit?kit.kind:(tall?0:pickShortKind(Q[0],Q[1],zi,civ,CELL));
            const w=kit?kit.w:(kind===0?rr(40,60):kind===2?rr(70,100):kind===4?rr(50,70):rr(50,90));
            const h=kit?kit.h:(kind===0?rr(40,60):kind===2?rr(44,68):kind===4?rr(50,70):rr(30,55));
            if(plot(Q[0],Q[1], w, h, ga, kind, zi)){ varyPlot(); if(kind===4) civic++; if(kit) cityPlan[cityPlan.length-1].role=kit.role; }
          }
        }else{
          /* Plaza-centered - one big open space, buildings on edges */
          const edges=[[0,-1],[1,0],[0,1],[-1,0]];
          for(const [ex,ey] of edges){
            if(rnd()<0.25) continue;
            const Q=L2W(lx+ex*CELL*0.35, ly+ey*CELL*0.35);
            if(!isWalkable(Q[0],Q[1])) continue;
            const r2b=rnd(), tall=r2b<(fac==='nova'?0.62:0.5), civ=!tall&&civic<(fac==='nova'?4:2)&&r2b>=(fac==='nova'?0.70:fac==='horde'?0.96:0.82);
            const kit=!tall&&typeof civicKitFill==='function'?civicKitFill(fac,rnd):null;
            const kind=kit?kit.kind:(tall?0:pickShortKind(Q[0],Q[1],zi,civ,CELL));
            const w=kit?kit.w:(kind===0?rr(45,65):kind===2?rr(72,110):kind===4?rr(52,72):rr(60,100));
            const h=kit?kit.h:(kind===0?rr(45,65):kind===2?rr(48,74):kind===4?rr(52,72):rr(35,60));
            if(plot(Q[0],Q[1], w, h, ga, kind, zi)){ varyPlot(); if(kind===4) civic++; if(kit) cityPlan[cityPlan.length-1].role=kit.role; }
          }
        }
      }
    }
  };
  /* Span is the real civic disc (corner lots sit outside Z.r). Measure it
     as soon as a site writes streets/plots so the next candidate cannot
     land inside that disc. The old 660→470→360 relax packed two 5×5
     grids on top of each other — stacked beige pancakes on the command
     map and a cramped night grid in 3D. Drop a site before overlapping. */
  const zoneSpanOf=(zi)=>{
    const Z=cityZones[zi]; if(!Z) return 0;
    let r=Z.r||200;
    for(const S of cityStreets){
      if(S[5]!==zi)continue;
      const pad=S[4]*0.5+16;
      r=Math.max(r, Math.hypot(S[0]-Z.x,S[1]-Z.y)+pad, Math.hypot(S[2]-Z.x,S[3]-Z.y)+pad);
    }
    for(const P of cityPlan){
      if(P.zone!==zi)continue;
      r=Math.max(r, Math.hypot(P.x-Z.x,P.y-Z.y)+Math.hypot(P.w,P.h)*0.7+16);
    }
    Z.span=r;
    return r;
  };
  const GAP=64;
  const placed=[];
  const clashes=(x,y,r)=>{
    for(const p of placed) if(dist2(x,y,p.x,p.y)<(r+p.r+GAP)*(r+p.r+GAP)) return true;
    return false;
  };
  const tryPlace=(ind)=>{
    const guess=ind?310:400;
    for(let a=0;a<100;a++){
      const x=rr(MAP*0.18,MAP*0.82), y=rr(MAP*0.18,MAP*0.82);
      if(typeof battlefieldContains==='function'&&!battlefieldContains(x,y,310))continue;
      if(!farFromSpawns(x,y,700)||!isWalkable(x,y)) continue;
      if(!clearOfResourceSites(x,y,ind?330:370))continue;
      if(clashes(x,y,guess)) continue;
      const zi=cityZones.length, s0=cityStreets.length, p0=cityPlan.length;
      makeDistrict(x,y,ind);
      const r=zoneSpanOf(zi);
      if(clashes(x,y,r)){
        cityStreets.length=s0; cityPlan.length=p0; cityZones.length=zi;
        SITE_REJ.near++;
        continue;
      }
      placed.push({x,y,r}); return true;
    }
    return false;
  };
  /* Authored sites carry their own clearance — an outpost is a quarter the
     size of a district. Pairwise span still wins over a single minD so a
     town cannot sit inside a prefecture's grid. */
  const tryStamp=(cls)=>{
    if(typeof siteTemplateFor!=='function') return false;
    for(let a=0;a<100;a++){
      const T=siteTemplateFor(cls,rnd);
      if(!T) return false;
      const x=rr(MAP*0.18,MAP*0.82), y=rr(MAP*0.18,MAP*0.82);
      const clear=T.minClearRadius||220;
      const guess=Math.max(T.radius||200, clear*0.72);
      if(typeof battlefieldContains==='function'&&!battlefieldContains(x,y,clear)){SITE_REJ.arena++;continue;}
      if(!farFromSpawns(x,y,T.minSpawnDist||800)){SITE_REJ.spawn++;continue;}
      if(!isWalkable(x,y)){SITE_REJ.water++;continue;}
      if(!clearOfResourceSites(x,y,clear)){SITE_REJ.res++;continue;}
      if(clashes(x,y,guess)){SITE_REJ.near++;continue;}
      const zi=cityZones.length, s0=cityStreets.length, p0=cityPlan.length, q0=sitePropQueue.length;
      if(!stampSite(T,x,y,cls)){SITE_REJ.plots++;continue;}
      const r=zoneSpanOf(zi);
      if(clashes(x,y,r)){
        cityStreets.length=s0; cityPlan.length=p0; cityZones.length=zi; sitePropQueue.length=q0;
        SITE_REJ.near++;
        continue;
      }
      placed.push({x,y,r}); SITE_REJ.ok++; return true;
    }
    return false;
  };
  /* Authored kit towns/outposts first. Aelos Standard asks for 4 procedural
     districts AND a brutalist prefecture; if the 5x5 grids claim the map
     first the catalog layouts lose every stamp and WORLD_KIT stays unused. */
  for(let c2=0;c2<(def.towns||0);c2++)   tryStamp('city');
  for(let c2=0;c2<(def.outpost||0);c2++) tryStamp('outpost');
  for(let c2=0;c2<(def.relic||0);c2++)   tryStamp('relic');
  for(let c2=0;c2<(def.spaceport||0);c2++) tryStamp('spaceport');
  for(let c2=0;c2<(def.domes||0);c2++)     tryStamp('dome');
  for(let c2=0;c2<(def.city||0);c2++) if(!tryPlace(0)) SITE_REJ.near++;
  for(let c2=0;c2<(def.indus||0);c2++) if(!tryPlace(1)) SITE_REJ.near++;
  /* Z.r is the authored disc. Corner lots of a 5x5 / 3x3 grid sit outside
     that circle, which left biome grass in the blocks players read as city.
     span covers every street and plot so CITYG and the grey fill match. */
  for(let zi=0;zi<cityZones.length;zi++){
    const Z=cityZones[zi];
    let r=Z.r;
    for(const S of cityStreets){
      if(S[5]!==zi)continue;
      const pad=S[4]*0.5+16;
      r=Math.max(r, Math.hypot(S[0]-Z.x,S[1]-Z.y)+pad, Math.hypot(S[2]-Z.x,S[3]-Z.y)+pad);
    }
    for(const P of cityPlan){
      if(P.zone!==zi)continue;
      r=Math.max(r, Math.hypot(P.x-Z.x,P.y-Z.y)+Math.hypot(P.w,P.h)*0.7+16);
    }
    Z.span=r;
  }
  rebuildCityGroundMask();
  if(placed.length) window.__cityAt=placed[0];
}

/* SuperCom bases sit on graded pads. The old pass pulled 34% toward a tilted
   plane inside Z.r, so biome hills continued through every plaza. Flatten the
   SPAN (corner lots live outside Z.r), then dump the cut as irregular berms —
   mangled scrape, not a cliff and not a blend that puts lumps back on the pad. */
function siteBermWidth(Z){
  const s=Z.site||'';
  /* Wide enough for dumped heaps to sit outside the pad disc. The old 32–52
     ring was thinner than one city block and still read as a drawn circle. */
  if(s==='indus'||s==='city') return 86;
  if(s==='relic') return 68;
  return 58;                                          // outpost / colony / town
}
function siteHash(zx,zy,a,b){
  let n=(Math.imul(zx|0,73856093)^Math.imul(zy|0,19349663)^Math.imul(a|0,83492791)^Math.imul(b|0,2654435761))|0;
  n=Math.imul(n^(n>>>16),0x7feb352d);
  return ((n>>>8)&65535)/65536;
}
function gradeDistrictTerrain(){
  if(!heightF||!cityZones.length)return;
  const k=TS/MAP,sample=(wx,wy)=>heightF[clamp(wy*k|0,0,TS-1)*TS+clamp(wx*k|0,0,TS-1)];
  const zoneGrade=new Float32Array(cityZones.length);
  for(let zi=0;zi<cityZones.length;zi++){
    const Z=cityZones[zi];
    let ang=0;
    for(const S of cityStreets){ if(S[5]===zi){ ang=Math.atan2(S[3]-S[1],S[2]-S[0]); break; } }
    const ca=Math.cos(-ang), sa=Math.sin(-ang);
    let hx=36, hy=36;
    const acc=(x,y,pad)=>{
      const lx=(x-Z.x)*ca-(y-Z.y)*sa, ly=(x-Z.x)*sa+(y-Z.y)*ca;
      hx=Math.max(hx,Math.abs(lx)+pad); hy=Math.max(hy,Math.abs(ly)+pad);
    };
    for(const S of cityStreets){
      if(S[5]!==zi)continue;
      const pad=S[4]*.5+18;
      acc(S[0],S[1],pad); acc(S[2],S[3],pad);
    }
    for(const P of cityPlan){
      if(P.zone!==zi)continue;
      acc(P.x,P.y,Math.hypot(P.w,P.h)*.55+12);
    }
    Z.padHx=hx; Z.padHy=hy; Z.padA=ang;
    Z._pad={ang,hx,hy};
    const bermW=siteBermWidth(Z), ext=Math.hypot(hx,hy)+bermW*1.85;
    const vals=[];
    for(let i=0;i<13;i++){
      const a=i/13*TAU, d=i?Math.min(hx,hy)*(0.28+0.22*(i%3)/3):0;
      vals.push(sample(Z.x+Math.cos(a)*d,Z.y+Math.sin(a)*d));
    }
    vals.sort((a,b)=>a-b);
    const hc=Math.max(WATER_H+.016, vals[vals.length>>1]);
    zoneGrade[zi]=hc; Z.gradeH=hc;
    const cW=Math.cos(ang), sW=Math.sin(ang);
    const heaps=[];
    const nHeap=8+((siteHash(Z.x,Z.y,zi,91)*9)|0);
    for(let p=0;p<nHeap;p++){
      const side=(siteHash(Z.x,Z.y,p,zi)*4)|0, u=siteHash(Z.x,Z.y,p+3,zi);
      const extra=bermW*(0.18+1.35*siteHash(Z.x,Z.y,p+41,zi+2));
      let lx,ly;
      if(side===0){ lx=(u-.5)*2*hx; ly=-(hy+extra); }
      else if(side===1){ lx=(u-.5)*2*hx; ly=hy+extra; }
      else if(side===2){ lx=-(hx+extra); ly=(u-.5)*2*hy; }
      else { lx=hx+extra; ly=(u-.5)*2*hy; }
      const hxw=Z.x+lx*cW-ly*sW, hyw=Z.y+lx*sW+ly*cW;
      if(cityGroundAt(hxw,hyw)>=2) continue;
      const hr=bermW*(0.14+0.50*siteHash(Z.x,Z.y,p+71,zi+4));
      const origP=sample(hxw,hyw);
      const amp=(Math.max(0,origP-hc)*0.70+0.022)*(0.35+1.25*siteHash(Z.x,Z.y,p+9,zi));
      heaps.push(hxw,hyw,hr,amp);
    }
    const x0=clamp((Z.x-ext)*k|0,0,TS-1),x1=clamp(Math.ceil((Z.x+ext)*k),0,TS-1);
    const y0=clamp((Z.y-ext)*k|0,0,TS-1),y1=clamp(Math.ceil((Z.y+ext)*k),0,TS-1);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const wx=x/k,wy=y/k;
      const lx=(wx-Z.x)*ca-(wy-Z.y)*sa, ly=(wx-Z.x)*sa+(wy-Z.y)*ca;
      const ox=Math.max(0,Math.abs(lx)-hx), oy=Math.max(0,Math.abs(ly)-hy);
      const d=Math.hypot(ox,oy);
      if(d>bermW*1.9)continue;
      const i=y*TS+x, orig=heightF[i];
      const cls=cityGroundAt(wx,wy);
      const floor=WATER_H+.016;
      if(orig<WATER_H+.002){
        /* Authored rivers/lakes under the painted GRID used to stay as
           WATER_AUTH holes: the water sheet sat in a texel-jagged pit and
           bit blue through city pavement. Drain wet texels on the pad
           (interior or street/plot). Berm/biome water stays authored so a
           shoreline city does not become a square island. */
        if(d>=5&&cls<2) continue;
        heightF[i]=Math.max(floor, hc);
        continue;
      }
      /* Interior of the GRID stays construction-flat. Outside, a wide
         smoothstep returns to biome — a steep circular face was the cliff. */
      if(d<5||cls>=2){
        heightF[i]=Math.max(floor, hc);
      }else{
        const u=clamp(d/Math.max(14,bermW),0,1);
        const w=u*u*(3-2*u);
        let h=hc+(orig-hc)*w;
        const cut=Math.max(0,orig-hc), fill=Math.max(0,hc-orig);
        const grain=0.45+0.90*siteHash(Z.x,Z.y,x,y);
        const pile=Math.exp(-((u-0.38)*3.1)*((u-0.38)*3.1));
        h+=(cut*0.55+fill*0.18+0.016)*grain*pile*(0.35+siteHash(Z.x,Z.y,x+7,y));
        for(let p=0;p<heaps.length;p+=4){
          const hd=Math.hypot(wx-heaps[p],wy-heaps[p+1]), hr=heaps[p+2];
          if(hd>=hr)continue;
          const t=1-hd/hr;
          h+=heaps[p+3]*t*t*(3-2*t);
        }
        heightF[i]=Math.max(floor, Math.min(0.84, h));
      }
    }
  }
  for(const P of cityPlan){
    const ca=Math.cos(P.a),sa=Math.sin(P.a),hw=P.w*.67,hh=P.h*.67,feather=22;
    const datum=zoneGrade[P.zone]||Math.max(WATER_H+.016,sample(P.x,P.y));
    const rad=Math.hypot(hw,hh)+feather,x0=clamp((P.x-rad)*k|0,0,TS-1),x1=clamp(Math.ceil((P.x+rad)*k),0,TS-1);
    const y0=clamp((P.y-rad)*k|0,0,TS-1),y1=clamp(Math.ceil((P.y+rad)*k),0,TS-1);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const wx=x/k,wy=y/k,dx=wx-P.x,dy=wy-P.y,lx=dx*ca+dy*sa,ly=-dx*sa+dy*ca;
      const ox=Math.max(0,Math.abs(lx)-hw),oy=Math.max(0,Math.abs(ly)-hh),d=Math.hypot(ox,oy);
      const i=y*TS+x;
      /* District grading may flatten existing land, but it must never create
         land. Shoreline cells remain water and are later clipped out of the
         painted street/foundation passes. */
      if(d>feather||heightF[i]<WATER_H+.004)continue;const t=1-d/feather,w=t*t*(3-2*t);
      heightF[i]+= (datum-heightF[i])*w;
    }
  }
  /* Streets share the site pad grade. Endpoint samples used to put one
     crossing above another; the berm ring is the only place hills return. */
  for(const S of cityStreets){
    const ax=S[0],ay=S[1],bx=S[2],by=S[3],dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy||1;
    const pad=S[4]*.7+16,datum=Math.max(WATER_H+.014,zoneGrade[S[5]]||((sample(ax,ay)+sample(bx,by))*.5));
    const x0=clamp((Math.min(ax,bx)-pad)*k|0,0,TS-1),x1=clamp(Math.ceil((Math.max(ax,bx)+pad)*k),0,TS-1);
    const y0=clamp((Math.min(ay,by)-pad)*k|0,0,TS-1),y1=clamp(Math.ceil((Math.max(ay,by)+pad)*k),0,TS-1);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const wx=x/k,wy=y/k,t=clamp(((wx-ax)*dx+(wy-ay)*dy)/L2,0,1),px=ax+dx*t,py=ay+dy*t,d=Math.hypot(wx-px,wy-py);
      const i=y*TS+x;
      if(d>pad||heightF[i]<WATER_H+.004)continue;const q=1-d/pad,w=q*q*(3-2*q);
      heightF[i]+=(datum-heightF[i])*w;
    }
  }
  for(let y=0;y<PGS;y++)for(let x=0;x<PGS;x++){
    const hx=clamp(Math.round((x+.5)/PGS*TS),0,TS-1),hy=clamp(Math.round((y+.5)/PGS*TS),0,TS-1);
    PASS[y*PGS+x]=heightF[hy*TS+hx]>=WATER_H-.004?1:0;
    /* Slope and repairs apply here too. A restamp that only re-tested water
       would hand passability straight back to a gated cliff, and would undo
       PREPAIR corridors on the next foundation pad - which is exactly how a
       gate like this quietly re-severs a map mid-match. */
    if(PASS[y*PGS+x]&&typeof PSLOPE!=="undefined"&&PSLOPE&&PSLOPE.length===PGS*PGS){
      const pi=y*PGS+x;
      const lim=(typeof passSlopeLimit==="function")?passSlopeLimit():Infinity;
      if(isFinite(lim)&&!(PREPAIR&&PREPAIR[pi])&&PSLOPE[pi]>lim) PASS[pi]=0;
    }
  }
}

function setupRelics(){
  relics.length=0; tanks.length=0;
  for(const Z of cityZones){ Z.razed=0; Z.claimed=0; }
  const def=MAPDEFS[curMap]||MAPDEFS.vanguard;
  srand((def.seed^0x51EF)|1);
  for(const P of cityPlan){
    const s=Math.max(P.w,P.h), k=P.kind;
    /* A 330-unit skyscraper cannot share a low block's health bar. It is the
       toughest thing on the map and it comes down in two stages, so half of
       this pool buys the shear and half buys the ground. */
    /* Kit structures are built, not derelict: tougher than a tank farm, well
   short of a tower block. Towers are small and come down fast. */
    const hp=k===5?4200 : k===2?1500 : k===0?1150 : k===6?640 : k===3?520 : k===7?380 : 780;
    relics.push({x:P.x,y:P.y,w:P.w,h:P.h,s,a:P.a,kind:k,zone:P.zone,role:P.role,
      hp,hpm:hp,alive:true,
      salv:Math.round(s*(k===5?4.2 : k===2?2.4 : k===0?1.7 : k===6?1.5 : k===3?1.2 : k===7?0.9 : 1.25)),
      salvE:Math.round(s*(k===5?3.0 : k===2?2.0 : k===3?2.6 : 0.5)),
      lean:0, burn:0, seed:(P.x*7+P.y*13)|0});
  }
  // loot scattered through every district
  for(const Z of cityZones) for(let k=0;k<(Z.ind?3:2);k++){
    const a=rnd()*TAU, d=rr(60,250);
    let L=findLand(clamp(Z.x+Math.cos(a)*d,80,MAP-80), clamp(Z.y+Math.sin(a)*d,80,MAP-80));
    if(typeof battlefieldClampPoint==='function')L=battlefieldClampPoint(L[0],L[1],70);
    spawnCrate(L[0],L[1]);
    if(crates.length) crates[crates.length-1].alt=0;
  }
  // industrial belts are ringed with volatile tanks — dangerous ground to fight over
  for(const Z of cityZones) if(Z.ind) for(let k=0;k<5;k++){
    const a=rnd()*TAU, d=rr(190,310);
    let L=findLand(clamp(Z.x+Math.cos(a)*d,80,MAP-80), clamp(Z.y+Math.sin(a)*d,80,MAP-80));
    if(typeof battlefieldClampPoint==='function')L=battlefieldClampPoint(L[0],L[1],70);
    tanks.push({x:L[0],y:L[1],s:rr(30,42),hp:260,alive:true,fuse:0});
  }
  /* Authored template props, now that findLand and the prop arrays are live.
     Same shapes as the procedural spawns above -- a tank missing hp/alive/fuse
     is not a tank, it is a null dereference the first time one is shot. */
  for(const R of sitePropQueue){
    let L=findLand(clamp(R.x,80,MAP-80), clamp(R.y,80,MAP-80));
    if(typeof battlefieldClampPoint==='function')L=battlefieldClampPoint(L[0],L[1],70);
    if(R.kind==='tank') tanks.push({x:L[0],y:L[1],s:R.s||rr(30,42),hp:260,alive:true,fuse:0});
    else if(R.kind==='crate'){ spawnCrate(L[0],L[1]); if(crates.length) crates[crates.length-1].alt=0; }
    else if(R.kind==='rock'){
      const BK=typeof biomeKit==='function'?biomeKit():null;
      rocks.push({x:L[0],y:L[1],s:R.s||rr(18,36),a:rr(0,TAU),k:(BK&&BK.rockKind)||'stone'});
    }else if(R.kind==='flora'){
      const BK=typeof biomeKit==='function'?biomeKit():null;
      trees.push({x:L[0],y:L[1],s:R.s||rr(16,28),a:rr(0,TAU),
        k:typeof floraKind==='function'?floraKind(BK,rnd):(BK&&BK.flora)||'broad'});
    }
  }
  sitePropQueue.length=0;
  const spawnA=[MAP*SP_LO,MAP*SP_HI], spawnB=[MAP*SP_HI,MAP*SP_LO];
  const tn=10+(rnd()*8|0);
  for(let k=0;k<tn;k++){
    let L=findLand(rr(260,MAP-260),rr(260,MAP-260));
    if(typeof battlefieldClampPoint==='function')L=battlefieldClampPoint(L[0],L[1],70);
    if(typeof farFromStartZones==='function'&&!farFromStartZones(L[0],L[1],420)) continue;
    tanks.push({x:L[0],y:L[1],s:rr(28,40),hp:260,alive:true,fuse:0});
  }
}
function blowTank(T){
  if(!T.alive) return;
  T.alive=false;
  const R=T.s*4.2, DMG=520;
  forUnitsIn(T.x,T.y,R,j=>{
    const fall=1-0.6*Math.sqrt(dist2(T.x,T.y,ux[j],uy[j]))/R;
    dealDamage(j,DMG*fall,2,-1);
  });
  for(let b2=0;b2<blds.length;b2++){
    const B=blds[b2];
    if(B.alive&&dist2(T.x,T.y,B.x,B.y)<(R*0.8+B.r)*(R*0.8+B.r)) damageBld(b2,DMG*0.5,2);
  }
  spawnExplosion(T.x,T.y,Math.min(T.s*0.55,22),1);
  addParticle(3,T.x,T.y,0,0,1.1,Math.min(72,T.s*2.2), 255,170,70);
  addParticle(8,T.x,T.y,0,0,2.4,Math.min(28,T.s*0.9), 255,255,255);
  addCrater(T.x,T.y,T.s*2.4);
  deformTerrain(T.x,T.y,T.s*2.6,0.068,'blast');
  shake=Math.max(shake,9);
  sfx('boom',T.x,T.y,2.2);
  // chain reaction through the tank farm
  for(const O of tanks) if(O.alive&&O.fuse<=0&&dist2(O.x,O.y,T.x,T.y)<(R*1.15)*(R*1.15)) O.fuse=0.18+Math.random()*0.35;
}
function sceneryTick(dt){
  for(const T of tanks){
    if(!T.alive) continue;
    if(T.fuse>0){ T.fuse-=dt; if(T.fuse<=0) blowTank(T); continue; }
    // splash damage from nearby explosions lights them off
    if((tick&15)===0){
      let hot=false;
      forUnitsIn(T.x,T.y,T.s*0.9,j=>{ if(uteam[j]===2) hot=true; });   // bugs smash them open
      if(hot&&Math.random()<0.25) T.fuse=0.5;
    }
  }
  for(const R of relics){
    if(!R.alive) continue;
    if((tick&15)===0 && (R.burn>0.12 || R.hp<R.hpm*0.65)){
      if(Math.random()<0.4)
        addParticle(1,R.x+rr(-R.s*0.3,R.s*0.3),R.y-R.s*0.2,rr(-3,3),rr(-12,-5),1.2,R.s*0.22, 60,58,56);
      if(Math.random()<0.35)
        addParticle(0,R.x+rr(-R.w*0.2,R.w*0.2),R.y+rr(-R.h*0.15,R.h*0.15),0,0,.28,5, 255,140,60);
    }
  }
}
/* Target encoding across the sim: >=0 is a unit, <=-2 is a structure index,
   and anything past RELIC_TG is a derelict block. Keeping ruins in the same
   channel means every existing "shoot the thing" path works on them for free. */
const RELIC_TG=-1000000;
function RT(k){ return RELIC_TG-k; }
function isRelicTg(t){ return t<=RELIC_TG; }
function relicOf(t){ return RELIC_TG-t; }
/* Nearest standing ruin. Kept for explicit/scripted raze orders; normal target
   acquisition deliberately never calls it. A city block is scenery and
   potential salvage, not an enemy that an attack-moving platoon should stop to
   shoot merely because it passed within weapon range. */
function findRelic(x,y,rad){
  let best=-1,bd=rad*rad;
  for(let k=0;k<relics.length;k++){
    const R=relics[k]; if(!R.alive) continue;
    const d=dist2(x,y,R.x,R.y);
    if(d<bd){ bd=d; best=k; }
  }
  return best;
}
function damageRelic(R,dmg,byTeam){
  if(!R||!R.alive) return;
  R.hp-=dmg;
  R.burn=Math.min(1,(R.burn||0)+Math.max(0.10,dmg/Math.max(1,R.hpm)*0.62));
  R.lean=Math.min(0.16,(R.lean||0)+0.006);
  R.hitT=0.25;
  if(perfScale>0.28 && (R.burn>0.08 || R.hp<R.hpm*0.82)){
    const q=towerFxQ();
    addParticle(0,R.x+rr(-R.w*0.28,R.w*0.28),R.y+rr(-R.h*0.22,R.h*0.22),0,0,
      .28, Math.min(11,R.s*0.18), 255,148,48);
    if(q>0.55)
      addParticle(1,R.x+rr(-R.w*0.16,R.w*0.16),R.y+rr(-R.h*0.14,R.h*0.14),rr(-4,4),rr(-18,-8),
        2.4, Math.min(10,R.s*0.16), 48,42,38);
  }
  /* STAGED COLLAPSE. A skyscraper that vanished the instant its bar emptied
     was the least believable destruction in the game. At half health the top
     two thirds shear off as a real event — dust, debris, ground displacement,
     a salvage dividend — and the stump keeps fighting for the other half. */
  if(R.kind===5&&!R.part&&R.hp<=R.hpm*0.5&&R.hp>0){
    R.part=1; R.lean=0;
    spawnBuildingCollapse(R.x,R.y,R.s*0.72,true);
    addRubble(R.x,R.y,R.s*0.72);
    deformTerrain(R.x,R.y,R.s*1.05,0.042,'shell');
    shake=Math.max(shake,6);
    for(let k=0;k<18;k++)
      addParticle(1,R.x+rr(-R.w*0.5,R.w*0.5),R.y+rr(-R.h*0.5,R.h*0.5),rr(-34,34),rr(-40,-8),2.3,R.s*0.38, 122,120,114);
    addParticle(2,R.x,R.y,0,0,2.0,R.s*1.9, 152,146,134);
    addWreckField(R.x,R.y, Math.round(R.salv*0.42), Math.round(R.salvE*0.42), 2, R.s*0.9, 4);
    sfx('boom',R.x,R.y,1.7);
    if(byTeam===0) heroXP(10);
  }
  if(R.hp<=0) collapseBlock(R,byTeam);
}
let razeTip=0;
function collapseBlock(R,byTeam){
  if(!R.alive) return;
  R.alive=false;
  R.fallT=stats.t;
  R.burn=1;
  spawnBuildingCollapse(R.x,R.y,R.s,true);
  addRubble(R.x,R.y,R.s*0.85);
  addCrater(R.x,R.y,R.s*1.15);
  /* Civic detonations stay small (no mushroom), but the crater they leave
     must still BURN. spawnExplosion's capped size only stamped a ~30-unit
     ember disc under an 80-unit hall, and the live-ruin fire loop skips
     dead blocks — so city destroy read as a cold grey crater. */
  if(typeof cityGroundAt==='function' && cityGroundAt(R.x,R.y)>=1){
    addGroundBurn(R.x,R.y, Math.max(R.s*1.35, 48), 1);
    spawnCivicWreckFire(R.x, R.y, R.s);
  } else if(R.kind===0){
    /* Civic towers off the painted city mask still have to burn. */
    addGroundBurn(R.x,R.y, Math.max(R.s*0.95, 28), 1);
    spawnCivicWreckFire(R.x, R.y, R.s*0.85);
  }
  /* A tower block coming down displaces real ground — that's the biggest
     single deformation event in the game outside a NOVA strike. */
  deformTerrain(R.x,R.y,R.s*(R.kind===5?2.15:1.45), R.kind===5?0.135:R.kind===0?0.090:0.058, 'blast');
  shake=Math.max(shake, R.kind===5?11:R.kind===0?7:4);
  for(let k=0;k<14;k++)
    addParticle(1,R.x+rr(-R.w*0.4,R.w*0.4),R.y+rr(-R.h*0.35,R.h*0.35),rr(-22,22),rr(-30,-6),1.9,R.s*0.32, 120,118,112);
  addParticle(2,R.x,R.y,0,0,1.5,R.s*1.4, 150,144,132);       // dust bloom
  /* THE PAYOUT. Levelling a derelict is an economic act: it dumps a wide field
     of salvage on the ground for whoever holds the rubble afterwards. Nobody
     "owns" it — it goes to whichever side has units standing there. */
  addWreckField(R.x,R.y, R.salv, R.salvE, 2, R.s*(R.kind===5?1.35:0.85), R.kind===5?7:R.kind===2?5:3);
  if(R.kind===3){                                            // tank farm: goes up loudly
    const RR2=R.s*3.4, DMG=380;
    forUnitsIn(R.x,R.y,RR2,j=>{
      dealDamage(j,DMG*(1-0.6*Math.sqrt(dist2(R.x,R.y,ux[j],uy[j]))/RR2),2,-1);
    });
    addParticle(3,R.x,R.y,0,0,0.8,RR2*0.9, 255,170,80);
    sfx('boom',R.x,R.y,2.0);
  } else sfx('boom',R.x,R.y,1.3);
  const Z=cityZones[R.zone];
  if(Z){
    Z.razed++;
    if(Z.razed===Z.total&&Z.total>0&&byTeam===0){
      /* Clearing an entire district is a milestone worth chasing: a lump
         bonus, XP, and open ground you can now build on. */
      resM[0]=Math.min(RES_MCAP[0],resM[0]+340);
      resE[0]=Math.min(RES_ECAP[0],resE[0]+900);
      heroXP(120);
      toast('🏙 '+Z.name+' LEVELLED — +340 mass, +900 energy, ground cleared for building');
      sfx('deploy',Z.x,Z.y,1.4);
    }
  }
  if(byTeam===0){
    heroXP(R.kind===2?14:8);
    if(!razeTip){ razeTip=1; toast('🏚 Ruins razed — the wreckage is salvage. Park units on it to reclaim'); }
  }
}
function damageScenery(x,y,rad,dmg,byTeam){   // called from every area damage source
  const r2=rad*rad;
  for(const R of relics){
    if(!R.alive||dist2(x,y,R.x,R.y)>r2) continue;
    R.hp-=dmg;
    R.burn=Math.min(1,(R.burn||0)+0.25);
    R.lean=Math.min(0.13,(R.lean||0)+0.012);   // structural lean as it takes damage
    /* Defaulting an unattributed hit to team 0 handed the PLAYER the mass, energy
     and Commander XP whenever a meteor flattened a Derelict District nobody had
     touched. Neutral (2) is what every other environmental damage path in this
     file already passes, and what carrierClearLandingZone passes explicitly to
     stop exactly this exploit. */
  if(R.hp<=0) collapseBlock(R, byTeam===undefined?2:byTeam);
  }
  for(const T of tanks) if(T.alive&&T.fuse<=0&&dist2(x,y,T.x,T.y)<r2) T.fuse=0.12+Math.random()*0.2;
}

/* ============================================================
   SUPER CARRIER — the match opens with an orbital drop. You fly
   the carrier to the ground you want, then deploy it into a base.
   Phase 0 = falling, 1 = mobile (choose your spot), 2 = deployed.
   ============================================================ */
const carrier={active:false, x:0, y:0, tx:0, ty:0, alt:0, clearance:0, ang:0, phase:0, dust:0, fac:'nova'};
/* Enemy setup is still instant by design, but its headquarters now has a short
   faction-authored arrival/departure cue. Keeping this separate from `carrier`
   avoids pretending the AI owns the player's interactive flight controls. */
const aiDeployArrivals=[];
const CARRIER_SPD=74;
const CARRIER_CRUISE_ALT=62;
const CARRIER_CITY_ALT=132;
const CARRIER_BODY=[112,82];
const CARRIER_LANDING=[112,88];

/* The orbital carrier is an aircraft, not a ground crawler. `alt` remains the
   opening orbital-drop height while `clearance` is the phase-1 flight height.
   Keeping the two separate prevents a new course change from restarting the
   drop sequence, while both renderers can use the same effective altitude. */
function carrierEffectiveAlt(){
  return carrier.phase===1?(carrier.clearance||0):carrier.alt;
}
function carrierSnapPosition(){
  return [Math.round(carrier.x/SNAP_GRID)*SNAP_GRID,
          Math.round(carrier.y/SNAP_GRID)*SNAP_GRID];
}
function carrierRelicRoof(R){
  const s=Math.max(R.w,R.h);
  /* Not a gameplay rule — a measurement. Every entry here is that mesh's own
     height over its own reference footprint, and the carrier flies at the
     tallest one it overlaps. The civic block is a cube plus a mast (60 units
     tall on a 46 footprint), so the low-block default of 0.78 would have flown
     the ship straight through its antenna. */
  return R.kind===0?s*1.72 : R.kind===2?s*0.68 : R.kind===3?s*0.58
       : R.kind===4?s*1.31 : s*0.78;
}
/* Height required by the ship's complete footprint at one point on its
   course. The OBB test catches building corners that a centre/radius test
   misses, including rotated city blocks. */
function carrierObstacleClearanceAt(x,y,ang){
  let roof=0;
  for(const R of relics){
    if(!R.alive) continue;
    if(obbHit(x,y,CARRIER_BODY[0],CARRIER_BODY[1],ang,
              R.x,R.y,R.w,R.h,R.a,8)) roof=Math.max(roof,carrierRelicRoof(R));
  }
  for(const B of blds){
    if(!B.alive) continue;
    const f=bldFoot(B);
    if(obbHit(x,y,CARRIER_BODY[0],CARRIER_BODY[1],ang,
              B.x,B.y,f[0],f[1],B.rot||0,8))
      roof=Math.max(roof,(BT[B.type]?BT[B.type].size:40)*1.55);
  }
  return roof>0?Math.max(CARRIER_CITY_ALT,roof+34):0;
}
function carrierDesiredClearance(dx,dy,d){
  const moving=d>4;
  const ang=moving?Math.atan2(dy,dx):carrier.ang;
  let wanted=moving?CARRIER_CRUISE_ALT:0;
  /* Look far enough ahead to finish climbing before the nose reaches a roof.
     Sampling a swept corridor is cheap here: there are only dozens of city
     blocks, and the carrier exists only during pre-deployment. */
  const look=Math.min(d,170), samples=look>0?[0,0.25,0.5,0.75,1]:[0];
  for(const q of samples){
    const x=carrier.x+(moving?dx/d*look*q:0);
    const y=carrier.y+(moving?dy/d*look*q:0);
    wanted=Math.max(wanted,carrierObstacleClearanceAt(x,y,ang));
  }
  return wanted;
}
function carrierTick(dt){
  if(!carrier.active||carrier.phase>=2) return;
  if(carrier.phase===0){
    carrier.alt-=dt*430;
    if(carrier.alt<=0){
      carrier.alt=0; carrier.clearance=0; carrier.phase=1;
      shake=Math.max(shake,13);
      for(let k=0;k<26;k++){
        const a=Math.random()*TAU, sp=90+Math.random()*180;
        addParticle(1,carrier.x,carrier.y,Math.cos(a)*sp,Math.sin(a)*sp,1.5,26, 150,142,124);
      }
      addParticle(3,carrier.x,carrier.y,0,0,1.0,300, 200,230,255);
      sfx('carrier_deploy',carrier.x,carrier.y,1.0);
      toast('🚀 CARRIER READY — tap ground to fly there, then DEPLOY');
    } else {
      /* Grey dust while descending — type 10 hugs the ground and never
         blooms. Type 0 here was the orange flash on the hull. */
      if((tick&3)===0) addParticle(10,carrier.x+rr(-40,40),carrier.y+rr(-30,30),rr(-10,10),rr(-8,8),.45,14, 150,142,124);
    }
    return;
  }
  // mobile: fly directly toward the tapped destination, climbing over obstacles
  const dx=carrier.tx-carrier.x, dy=carrier.ty-carrier.y;
  const d=Math.hypot(dx,dy);
  const wantedAlt=carrierDesiredClearance(dx,dy,d);
  const climb=wantedAlt>carrier.clearance?240:92;
  carrier.clearance+=(wantedAlt-carrier.clearance)*Math.min(1,dt*climb/Math.max(1,Math.abs(wantedAlt-carrier.clearance)));
  if(Math.abs(carrier.clearance-wantedAlt)<0.25) carrier.clearance=wantedAlt;
  if(d>4){
    const sp=Math.min(CARRIER_SPD,d*2.2);
    const nx=carrier.x+dx/d*sp*dt, ny=carrier.y+dy/d*sp*dt;
    carrier.x=clamp(nx,60,MAP-60); carrier.y=clamp(ny,60,MAP-60);
    /* Nose-first. The old target angle carried a +90 degree offset left over
       from the sprite era, so the ship crabbed sideways down its own flight
       path — the one thing a spacecraft never does. Models are authored facing
       +X, which is exactly atan2(dy,dx), so the offset is simply wrong.
       Turn rate is also faster than the hull can drift, so on a straight run
       the nose settles onto the course within a few frames and stays there. */
    const ta=Math.atan2(dy,dx);
    let da=ta-carrier.ang;
    while(da>Math.PI)da-=TAU; while(da<-Math.PI)da+=TAU;
    carrier.ang+=clamp(da,-3.4*dt,3.4*dt);
    carrier.bank=(carrier.bank||0)+(clamp(da,-1,1)*0.34-(carrier.bank||0))*Math.min(1,dt*4);
  }
  /* Hover dust, not glow. Type 10 is the boot/track particulate: ground-
     hugging, alpha-blended, no bloom. The old type-0 warm flashes (255,196,118)
     were additive sprites that painted the hull orange. */
  carrier.dust+=dt;
  if(carrier.dust>0.055){
    carrier.dust=0;
    const loft=Math.max(8,carrier.clearance||carrier.alt||0);
    const wash=clamp(1-loft/240,0.22,1);
    const n=2+((wash*5)|0);
    for(let k=0;k<n;k++)
      addParticle(10,carrier.x+rr(-40,40),carrier.y+rr(-34,34),rr(-20,20),rr(-12,14),0.65+wash*0.45,11+wash*12,150,142,124);
  }
}
function carrierCanDeploy(){
  if(!carrier.active||carrier.phase!==1) return false;
  const p=carrierSnapPosition();
  return footOnLand('hq',p[0],p[1],0)&&!footBlocked('hq',p[0],p[1],0);
}
function carrierLandingRelics(x,y){
  const hit=[];
  for(const R of relics){
    if(R.alive&&obbHit(x,y,CARRIER_LANDING[0],CARRIER_LANDING[1],0,
                       R.x,R.y,R.w,R.h,R.a,10)) hit.push(R);
  }
  return hit;
}
function carrierLandingBlockCount(){
  const p=carrierSnapPosition();
  return carrierLandingRelics(p[0],p[1]).length;
}
/* Resolve the impact before the HQ or Commander exists. City blocks use their
   normal collapse pipeline (debris, smoke, craters and salvage), but neutral
   attribution prevents a free account-XP/district-bonus exploit. Volatile
   tanks in the pad are crushed immediately rather than left with a delayed
   fuse that could destroy the freshly spawned base. */
function carrierClearLandingZone(x,y){
  const hit=carrierLandingRelics(x,y);
  for(const R of hit) collapseBlock(R,2);
  let tankN=0;
  for(const T of tanks){
    if(!T.alive) continue;
    if(!obbHit(x,y,CARRIER_LANDING[0],CARRIER_LANDING[1],0,
               T.x,T.y,T.s,T.s,0,8)) continue;
    T.alive=false; T.fuse=0; tankN++;
    spawnExplosion(T.x,T.y,Math.min(T.s*0.55,22),1);
    addCrater(T.x,T.y,Math.min(T.s*1.2,48));
    addParticle(3,T.x,T.y,0,0,0.65,Math.min(T.s*1.8,48),255,165,70);
  }
  /* The landing shockwave is dangerous to bodies caught under the ship, but
     active player/AI structures remain protected by carrierCanDeploy(). */
  const blast=150;
  forUnitsIn(x,y,blast,j=>{
    const d=Math.sqrt(dist2(x,y,ux[j],uy[j]));
    /* Environmental attribution: the carrier may crush an infestation at the
       chosen site, but pre-match wildlife must not grant a free Commander
       level before the Commander has even spawned. */
    dealDamage(j,520*(1-0.55*d/blast),2,-1);
  });
  if(hit.length||tankN){
    addParticle(3,x,y,0,0,0.72,310,255,175,85);
    for(let k=0;k<18;k++)
      addParticle(5,x+rr(-54,54),y+rr(-42,42),rr(-90,90),rr(-90,90),0.9,rr(5,11),155,145,132);
  }
  return {blocks:hit.length,tanks:tankN};
}

/* ---------- build range: structures project a SQUARE construction zone ----------
   Square footprints tile cleanly, so chaining Uplinks grows a readable grid
   of territory instead of overlapping circles.                              */
function buildRadius(B){                 // half-extent of the square, in world units
  /* Territory belongs to command infrastructure. Letting every factory,
     wall and wandering Constructor project a fresh square meant a player
     could leapfrog across the entire map without ever building the research
     relay that exists for this exact job. */
  return B.type==='hq'?540 : B.type==='uplink'?470+Math.max(0,(B.lvl||1)-1)*55 : 0;
}
/* Builders operate inside the command network; they never project free
   territory. Expansion therefore has a defensible relay chain and cannot be
   leapfrogged across the map by walking a constructor into enemy territory. */
const BUILDER_R={};                           // builders construct inside the command network; they do not create territory
function forBuilders(team,fn){
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]||uteam[i]!==team) continue;
    const r=BUILDER_R[utype[i]];
    if(r) fn(ux[i],uy[i],r,i);
  }
}
function inBuildRange(x,y,team){
  for(const B of blds){
    if(!B.alive||B.team!==team) continue;
    const r=buildRadius(B);
    if(r<=0)continue;
    if(Math.abs(x-B.x)<=r && Math.abs(y-B.y)<=r) return true;   // Chebyshev = square
  }
  let ok=false;
  forBuilders(team,(bx,by,r)=>{ if(Math.abs(x-bx)<=r && Math.abs(y-by)<=r) ok=true; });
  return ok;
}

/* ---- BUILD ZONE GRID ------------------------------------------------------
   Your buildable territory is a GRID REGION, not a set of circles. Every
   structure stamps an axis-aligned square of cells (Chebyshev distance, which
   is what inBuildRange actually tests), and the union of those squares is your
   territory. Rasterising it once into a grid means the drawn border is exactly
   the rule the placement check enforces — no more circles that lie about where
   you can build, and chaining Uplinks visibly grows a rectilinear empire
   instead of a pile of overlapping discs.
   Cell size is the placement snap, so the border always lands on a legal
   building position. */
const SNAP_GRID=20;            // world units per placement cell
/* The grid is OFFSET so it can hold negative world coordinates: a base near
   the map edge legitimately projects its build square past x=0, and a grid
   that started at zero silently clipped that territory — the border was drawn
   short of where you could actually build. */
const BZ=SNAP_GRID, BZO=32, BZN=Math.ceil(MAP/BZ)+BZO*2;
const bzW=g=>(g-BZO)*BZ;                    // cell index -> world coordinate
const bzG=w=>Math.round(w/BZ)+BZO;          // world coordinate -> cell index
const bzGrid=new Uint8Array(BZN*BZN);
/* Cell states: 0 outside your territory, 1 buildable, 2 blocked.
   "Blocked" is rasterised the same way the zone is — stamp each blocker's
   bounding box rather than testing every cell against every object — so the
   whole grid stays a couple of array passes instead of a quadratic scan. */
const BZ_OUT=0, BZ_OK=1, BZ_BAD=2;
function markBuildZone(){
  bzGrid.fill(BZ_OUT);
  // 1) territory: the union of every friendly structure's square
  for(const B of blds){
    if(!B.alive||B.team!==0) continue;
    const r=buildRadius(B);
    if(r<=0)continue;
    /* Cell g represents the world POINT g*BZ, so mark it only when that point
       is genuinely inside the square. floor/ceil here would over-cover by a
       cell on each side and draw a border a step outside where you can
       actually build — the exact kind of lie this replaced. */
    const x0=Math.max(0,Math.ceil((B.x-r)/BZ)+BZO), x1=Math.min(BZN-1,Math.floor((B.x+r)/BZ)+BZO);
    const y0=Math.max(0,Math.ceil((B.y-r)/BZ)+BZO), y1=Math.min(BZN-1,Math.floor((B.y+r)/BZ)+BZO);
    for(let gy=y0;gy<=y1;gy++){
      const row=gy*BZN;
      for(let gx=x0;gx<=x1;gx++) bzGrid[row+gx]=BZ_OK;
    }
  }
  // 2) terrain: water, cliffs and anything else the pathing grid calls impassable
  for(let gy=0;gy<BZN;gy++){
    const row=gy*BZN, wy=bzW(gy);
    for(let gx=0;gx<BZN;gx++){
      if(bzGrid[row+gx]!==BZ_OK) continue;
      if(!isWalkable(bzW(gx),wy)) bzGrid[row+gx]=BZ_BAD;
    }
  }
  // 3) occupied ground: structures, ruins and unclaimed nodes all block a footprint
  const stamp=(x,y,hw,hh)=>{
    const x0=Math.max(0,Math.floor((x-hw)/BZ)+BZO), x1=Math.min(BZN-1,Math.ceil((x+hw)/BZ)+BZO);
    const y0=Math.max(0,Math.floor((y-hh)/BZ)+BZO), y1=Math.min(BZN-1,Math.ceil((y+hh)/BZ)+BZO);
    for(let gy=y0;gy<=y1;gy++){
      const row=gy*BZN;
      for(let gx=x0;gx<=x1;gx++) if(bzGrid[row+gx]===BZ_OK) bzGrid[row+gx]=BZ_BAD;
    }
  };
  for(const B of blds){
    if(!B.alive) continue;
    const f=bldFoot(B);
    /* Facings are quarter turns now, so a footprint is always axis-aligned and
       its EXACT extent can be stamped. The old circumscribed square was sized
       for arbitrary rotation and over-covered by up to 40%, painting red over
       ground that was genuinely buildable. */
    const swap=(Math.round((B.rot||0)/(Math.PI/2))&1)===1;
    stamp(B.x,B.y,(swap?f[1]:f[0])*0.5+3,(swap?f[0]:f[1])*0.5+3);
  }
  for(const R of relics){
    if(!R.alive) continue;
    // ruins DO sit at arbitrary angles, so they keep the conservative extent
    const e=Math.hypot(R.w,R.h)*0.5+3;
    stamp(R.x,R.y,e,e);
  }
  for(const D of deposits) if(!D.taken) stamp(D.x,D.y,22,22);   // reserved for Extractors
  for(const G of geysers)  if(!G.taken) stamp(G.x,G.y,22,22);   // reserved for Geo Plants
}
function bzAt(gx,gy){ return (gx<0||gy<0||gx>=BZN||gy>=BZN)?BZ_OUT:bzGrid[gy*BZN+gx]; }
function bzIn(gx,gy){ return bzAt(gx,gy)!==BZ_OUT; }        // inside the territory at all
/* Terrain can change under you — a razed district frees its plot — so the
   blocked layer is refreshed on a slow cadence as well as on every structure
   change. Combat craters do not rewrite PASS from depth. */
let bzRefresh=0;
function buildZoneTick(dt){
  bzRefresh-=dt;
  if(bzRefresh<=0){ bzRefresh=1.2; markBuildZone(); }
}

/* ================= STRUCTURE FOOTPRINTS ==================================
   Every structure occupies an oriented rectangle, not a circle. Rectangles
   are what make base layout a design problem: they tile flush, they have a
   facing worth choosing, and they can't be feathered into each other the way
   overlapping discs can. [w,h] in world units — h is the "depth" along the
   facing axis, so an Airfield is a long runway and a Barricade is a slab.  */
const FOOT={
  mex:[34,34],  pgen:[38,30],  fac:[64,50],   turret:[42,42], bunker:[52,52],sgen:[34,34],
  tgate:[78,64],nest:[52,52],  harbor:[74,44], bastion:[44,44],seafort:[48,48],techlab:[48,40],
  aatower:[38,38],airfield:[92,42], uplink:[30,30], hq:[88,74],
  hellstorm:[34,34], arc:[32,32], rail:[58,58],nova:[58,50],
  minelaser:[52,52],missilebastion:[46,46],plasma:[42,42],
  wall:[28,20],  gate:[28,20],  geo:[38,32],   silo:[30,30],   fab:[38,30]
};
/* Alternate architecture is deliberately not scaled back into Nova's plot.
   That made the new silhouettes look larger, but their legs, runway lobes and
   rotating weapons could occupy ground the simulation still considered free.
   Values below are measured horizontal mesh envelopes (rounded up to whole
   world units). Tier lists include the complete rotating weapon sweep.

   A newly-built structure reserves its largest authored tier through
   `footTier`. This is intentional: letting a Mk1 fit in a narrow gap and then
   growing its Mk3 barrel through the neighbouring factory would only defer the
   overlap until the player had already paid for the upgrade. Nova remains in
   the shared FOOT table; only silhouettes measured outside their old plots
   were enlarged, leaving every non-flagged player layout dimension unchanged. */
const FOOT_FACTION={
  legion:{
    mex:[38,38],pgen:[38,36],turret:[[32,32],[36,36],[42,42]],
    bunker:[[42,42],[44,44],[48,48]],sgen:[[36,36],[38,38],[40,40]],
    nest:[72,60],harbor:[74,46],bastion:[[48,48],[54,54],[60,60]],
    techlab:[56,46],aatower:[30,30],uplink:[[32,32],[34,34],[36,36]],
    hellstorm:[[38,38],[40,40],[42,42]],arc:[[36,36],[38,38],[40,40]],
    rail:[[48,48],[54,54],[60,60]],wall:[34,18],
    minelaser:[[40,40],[46,46],[50,50]],
    missilebastion:[[46,46],[48,48],[50,50]],plasma:[[40,40],[42,42],[44,44]],
    gate:[42,18],geo:[42,42],silo:[36,36],fab:[38,36]
  },
  syndicate:{
    mex:[34,36],pgen:[38,38],fac:[76,70],
    turret:[[46,46],[50,50],[54,54]],bunker:[[48,48],[52,52],[58,58]],
    sgen:[36,40],harbor:[82,68],techlab:[48,48],
    aatower:[[48,48],[52,52],[58,58]],airfield:[94,62],uplink:[36,40],hq:[88,94],
    hellstorm:[[60,60],[66,66],[72,72]],arc:[40,46],
    rail:[[80,80],[88,88],[98,98]],nova:[[58,58],[60,60],[66,66]],wall:[34,18],
    minelaser:[[60,60],[66,66],[72,72]],missilebastion:[46,48],
    plasma:[[46,46],[50,50],[54,54]],gate:[34,20],geo:[38,40],silo:[38,42],fab:[40,44]
  },
  horde:{
    mex:[36,42],pgen:[44,42],fac:[72,70],
    turret:[[40,40],[44,44],[52,52]],bunker:[[50,50],[52,50],[56,58]],
    sgen:[44,48],tgate:[78,66],harbor:[74,74],
    bastion:[[40,40],[46,46],[52,52]],techlab:[48,48],
    aatower:[[44,42],[50,48],[50,52]],airfield:[92,80],
    uplink:[[42,40],[36,40],[48,46]],hq:[88,78],
    hellstorm:[[38,36],[46,46],[48,48]],arc:[42,38],
    rail:[[70,70],[78,78],[86,86]],wall:[38,30],
    minelaser:[[62,62],[68,68],[74,74]],
    missilebastion:[[44,42],[50,48],[50,52]],
    plasma:[[44,44],[50,44],[50,48]],
    gate:[50,22],geo:[44,44],silo:[52,50],fab:[58,48]
  }
};
function bldFootTierCount(type,fac){
  const f=FOOT_FACTION[fac]&&FOOT_FACTION[fac][type];
  return f&&Array.isArray(f[0])?f.length:1;
}
function bldFoot(typeOrB,fac,lvl){
  const B=typeof typeOrB==='object'&&typeOrB?typeOrB:null;
  const type=B?B.type:typeOrB;
  const base=FOOT[type]||[BT[type]?BT[type].size:30,BT[type]?BT[type].size:30];
  /* Team 0 was pinned to 'nova' here too - the player's PLOTS ignored the
     faction even after the meshes stopped doing so, so a Dominion base drew
     Dominion architecture on Nova-sized pads and clipped its own walls. */
  fac=B?(B.fac||(B.team===2?'horde':B.team===0?
    ((typeof playerKitKey==='function')?playerKitKey():'nova'):
    ((typeof AI!=='undefined'&&AI&&AI.fac)||'legion'))):fac;
  if(!fac||fac==='nova'||!FOOT_FACTION[fac]||!FOOT_FACTION[fac][type]) return base;
  const f=FOOT_FACTION[fac][type];
  if(!Array.isArray(f[0])) return f;
  /* Existing saves predate footTier. Reserve the complete family for them too;
     this prevents loading a Mk1 base whose old plot later clips at Mk3. */
  const ti=B?Math.max(B.footTier||f.length,B.lvl||1):Math.max(1,lvl==null?f.length:lvl);
  return f[Math.min(f.length,ti)-1];
}

/* Separating-axis test between two oriented boxes. Four candidate axes is all
   a rectangle pair needs — if any one separates them, they cannot touch.    */
function obbHit(ax,ay,aw,ah,ar, bx,by,bw,bh,br, pad){
  aw+=(pad||0)*2; ah+=(pad||0)*2;
  const ac=Math.cos(ar), asn=Math.sin(ar), bc=Math.cos(br), bsn=Math.sin(br);
  const dx=bx-ax, dy=by-ay, ahw=aw*0.5, ahh=ah*0.5, bhw=bw*0.5, bhh=bh*0.5;
  const AX=[ac,asn, -asn,ac, bc,bsn, -bsn,bc];
  for(let k=0;k<8;k+=2){
    const ux=AX[k], uy=AX[k+1];
    const ra=Math.abs(ahw*(ac*ux+asn*uy))+Math.abs(ahh*(-asn*ux+ac*uy));
    const rb=Math.abs(bhw*(bc*ux+bsn*uy))+Math.abs(bhh*(-bsn*ux+bc*uy));
    if(Math.abs(dx*ux+dy*uy) > ra+rb) return false;
  }
  return true;
}
/* Would a structure of this type, here, at this facing, foul anything already
   built? Walls get a tighter pad so they can be laid shoulder-to-shoulder into
   a continuous curtain — that's the whole point of a wall.                  */
function footBlocked(type,x,y,rot,ignore,fac,lvl){
  const f=bldFoot(type,fac,lvl), thin=(type==='wall'||type==='gate');
  const pad=thin?0.5:3;
  for(const B of blds){
    if(!B.alive||B===ignore) continue;
    const g=bldFoot(B);
    const bothThin=thin&&(B.type==='wall'||B.type==='gate');
    if(obbHit(x,y,f[0],f[1],rot||0, B.x,B.y,g[0],g[1],B.rot||0, bothThin?0.5:pad)) return true;
  }
  return false;
}
/* Corner + edge sampling of the oriented box against the passability grid, so
   a long building can't have one end hanging over a cliff or a lake.        */
function footOnLand(type,x,y,rot,fac,lvl){
  const f=bldFoot(type,fac,lvl), c=Math.cos(rot||0), s=Math.sin(rot||0);
  const hw=f[0]*0.5, hh=f[1]*0.5;
  const P=[[0,0],[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh],[0,-hh],[0,hh],[-hw,0],[hw,0]];
  for(const [px,py] of P){
    if(!isWalkable(x+px*c-py*s, y+px*s+py*c)) return false;
  }
  return true;
}
function footOnWater(type,x,y,rot,fac,lvl){
  const f=bldFoot(type,fac,lvl),c=Math.cos(rot||0),s=Math.sin(rot||0);
  const hw=f[0]*0.5,hh=f[1]*0.5;
  const P=[[0,0],[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh],[0,-hh],[0,hh],[-hw,0],[hw,0]];
  for(const [px,py] of P){
    const wx=x+px*c-py*s,wy=y+px*s+py*c;
    if(typeof isNavigableWater!=='function'||!isNavigableWater(wx,wy,true))return false;
  }
  return true;
}

/* ================= CURTAIN WALLS & BASE FORTIFICATION ====================
   A barricade dropped on its own is a speed bump. Barricades laid in a LINE
   become a curtain: each segment finds its neighbours, turns to face along the
   run, grows connector posts, and gets tougher for being braced. That turns
   wall-building from decoration into a layout puzzle with a real payoff.   */
const WALL_LINK=60;   // generous: a hand-laid run should never fail to join
const DEFT={turret:1,bunker:1,aatower:1,hellstorm:1,arc:1,rail:1,bastion:1,seafort:1,minelaser:1,missilebastion:1,plasma:1,stormcaller:1,sgen:1,nova:1,wall:1,gate:1};
function relinkWalls(){
  const W=[];
  for(let i=0;i<blds.length;i++){
    const B=blds[i];
    if(!B.alive||(B.type!=='wall'&&B.type!=='gate')) continue;
    B.linkN=0; B.linkA=[]; W.push(i);
  }
  const L2=WALL_LINK*WALL_LINK;
  for(let a=0;a<W.length;a++){
    const A=blds[W[a]];
    for(let c=a+1;c<W.length;c++){
      const C=blds[W[c]];
      if(A.team!==C.team) continue;
      if(dist2(A.x,A.y,C.x,C.y)>L2) continue;
      const ang=Math.atan2(C.y-A.y,C.x-A.x);
      A.linkA.push(ang); C.linkA.push(ang+Math.PI);
      A.linkN++; C.linkN++;
    }
  }
  for(const i of W){
    const B=blds[i];
    if(!B.linkN) continue;
    /* Average the link directions in DOUBLED angle space. A wall run has no
       "forward" — east and west are the same axis — and doubling makes those
       two agree instead of cancelling to zero.                              */
    let sx=0,sy=0;
    for(const a of B.linkA){ sx+=Math.cos(a*2); sy+=Math.sin(a*2); }
    if(sx||sy) B.rot=Math.atan2(sy,sx)*0.5;
    const braced=1+0.20*Math.min(2,B.linkN);      // braced segments hold far longer
    const doctrine=(B.team===0&&typeof defenseFocus!=='undefined'&&defenseFocus)?1.20:1;
    const base=BT[B.type].hp*(B.team===0?bldHpMult*resBldHpMult*doctrine:1);
    const frac=B.hpm>0?B.hp/B.hpm:1;
    B.hpm=base*braced; B.hp=B.hpm*frac;
  }
}

/* Per-team fortification readout. `cover` asks a simple question: standing at
   the base core and looking out in 16 directions, how many of those approaches
   have something defending them? A ring earns more than a stack.            */
const FORT=[];
function fortOf(team){
  return FORT[team]||(FORT[team]={cover:0,walls:0,def:0,armor:1,regen:0,prod:1,rng:1,tier:0,cx:0,cy:0});
}
function recomputeFort(team){
  const F=fortOf(team); FORT[team]=F;
  let core=null;
  for(const B of blds) if(B.alive&&B.team===team&&B.type==='hq'&&B.prog>=1){ core=B; break; }
  if(!core) for(const B of blds) if(B.alive&&B.team===team&&B.type==='fac'&&B.prog>=1){ core=B; break; }
  if(!core){ F.cover=0;F.walls=0;F.def=0;F.armor=1;F.regen=0;F.prod=1;F.rng=1;F.tier=0; return; }
  F.cx=core.x; F.cy=core.y;
  const SEC=16, secW=new Float32Array(SEC), secD=new Float32Array(SEC);
  let walls=0, def=0;
  for(const B of blds){
    if(!B.alive||B.team!==team||B.prog<1||B===core) continue;
    const dx=B.x-core.x, dy=B.y-core.y, d=Math.hypot(dx,dy);
    if(d<60||d>820) continue;                       // too close to shield, too far to matter
    const s=(((Math.atan2(dy,dx)+TAU)%TAU)/TAU*SEC)|0;
    if(B.type==='wall'||B.type==='gate'){
      if(B.linkN>=1){ walls++; secW[s]=Math.min(1,secW[s]+0.34); }   // only CONNECTED wall counts
    } else if(DEFT[B.type]){ def++; secD[s]=Math.min(1,secD[s]+0.5); }
  }
  let cov=0;
  for(let s=0;s<SEC;s++) cov+=Math.min(1, secW[s]*0.62 + secD[s]*0.58);
  F.cover=cov/SEC; F.walls=walls; F.def=def;
  const c=F.cover;
  F.armor=1-0.30*c;          // hardened perimeter: structures shrug off 30% at full ring
  F.regen=26*c;              // engineering crews work safely → passive structure repair
  F.prod =1+0.22*c;          // a base that isn't under threat builds faster
  F.rng  =1+0.18*c;          // interlocking fields of fire reach further
  F.tier = c>=0.85?3 : c>=0.60?2 : c>=0.30?1 : 0;
}
let fortTimer=0, fortTierSeen=[0,0,0];
const FORT_NM=['','⬡ FORTIFIED','⬡⬡ STRONGHOLD','⬡⬡⬡ CITADEL'];
function fortTick(dt){
  fortTimer-=dt;
  if(fortTimer>0) return;
  fortTimer=1.5;
  relinkWalls();
  for(let tm=0;tm<2;tm++){
    recomputeFort(tm);
    const F=fortOf(tm);
    if(tm===0&&F.tier>fortTierSeen[0]){
      toast(FORT_NM[F.tier]+' — perimeter '+Math.round(F.cover*100)+'%: '
            +Math.round((1-F.armor)*100)+'% less structure damage, +'+Math.round((F.prod-1)*100)+'% build speed');
      sfx('ui');
    }
    fortTierSeen[tm]=F.tier;
  }
}

/* ---------- NOVA cannon strike: annihilation anywhere on the map ---------- */
function novaFire(b,wx,wy){
  const B=blds[b];
  if(!B||!B.alive||B.type!=='nova'||B.cool>0) return false;
  if(resE[B.team]<NOVA.e){                          // the shot needs a charged grid
    if(B.team===0) toast('⚡ NOVA needs '+NOVA.e+' energy — you have '+Math.floor(resE[0])+'. Build Reactors or a Silo');
    return false;
  }
  /* Manual superweapon orders bypass the normal auto-target loop, so rotate
     the newly articulated launcher toward its strike point before firing. */
  B.tang=Math.atan2(wy-B.y,wx-B.x)+Math.PI/2;
  drawEnergy(B.team,NOVA.e);
  B.cool=NOVA.cd;
  /* Renderer draws orbital_up as a vertical lance from (x0,y0). Offsetting
     map-Y put the column south of the silo. */
  addBeam(B.x,B.y,B.x,B.y,10,255,220,140,0.5,'orbital_up',B.team);
  addBeam(wx,wy,wx,wy,14,255,240,180,0.6,'orbital',B.team);
  setTimeout(()=>{},0);
  const R=NOVA.aoe;
  forUnitsIn(wx,wy,R,j=>{
    if(uteam[j]===B.team) return;
    const fall=1-0.55*Math.sqrt(dist2(wx,wy,ux[j],uy[j]))/R;
    dealDamage(j,NOVA.dmg*fall,B.team,-1);
  });
  for(let b2=0;b2<blds.length;b2++){
    const Bd=blds[b2];
    if(Bd.alive&&Bd.team!==B.team&&dist2(wx,wy,Bd.x,Bd.y)<(R*0.9+Bd.r)*(R*0.9+Bd.r))
      damageBld(b2,NOVA.dmg*0.7,B.team);
  }
  damageScenery(wx,wy,R,900);
  spawnExplosion(wx,wy,band(64,86),B.team);
  spawnExplosion(wx+rr(-50,50),wy+rr(-50,50),52,B.team);
  addParticle(3,wx,wy,0,0,1.3,R*2.3, 255,230,150);
  addParticle(3,wx,wy,0,0,0.9,R*1.4, 255,160,80);
  addCrater(wx,wy,175);
  deformTerrain(wx,wy,195,0.12,'blast');
  shake=22; flashScreen();
  sfx('boom',wx,wy,3.2);
  if(B.team===0) toast('☄ NOVA STRIKE — target zone annihilated');
  return true;
}
function band(a,b2){ return a+Math.random()*(b2-a); }
function depositAt(x,y,rad){
  for(let d=0;d<deposits.length;d++){
    const D=deposits[d];
    if(!D.taken && depositTier(D)>0 && dist2(x,y,D.x,D.y)<rad*rad) return d;
  }
  return -1;
}

// ---------- decals & doodads ----------
const craters=[], wrecks=[], rocks=[], trees=[], crystals=[], rubbles=[], cover=[];
function addRubble(x,y,s){ rubbles.push({x,y,s,a:Math.random()*TAU,ts:stats.t}); if(rubbles.length>90) rubbles.shift(); }
function addCrater(x,y,s){
  /* Sprite records the hit. Depth-below-water must not flood: applyDeform
     keeps PASS and WATER_AUTH so a bowl is dirt/ash, not a pond.
     CITYG>=1 also stamps a noisy burnt-concrete scar into the terrain
     canvas — the crater sprite is a square atlas cell and would otherwise
     cut a grass/dirt rectangle into painted pavement.
     Tiny civic sprites are the dirt-carpet; large collapses still record
     (city-combat gate + 2D fallback). 3D hud already skips the atlas draw. */
  const civic=typeof cityGroundAt==='function' && cityGroundAt(x,y)>=1;
  const allow=typeof mfCraterSpriteOk==='function'?mfCraterSpriteOk(x,y,s):true;
  if(allow){
    craters.push({x,y,s,a:Math.random()*TAU,ts:stats.t}); if(craters.length>220) craters.shift();
  }
  if(civic && typeof stampGroundScar==='function'){
    const box=stampGroundScar(x,y,s,true);
    if(box && typeof uploadTerrainTexRegion==='function')
      uploadTerrainTexRegion(box[0],box[1],box[2],box[3],true);
  }
}
/* ---------------------------------------------------------------------------
   GROUND BURNS — the impact's thermal story, told by the terrain itself.
   An explosive strike leaves ground that GLOWS: embers in the crack network,
   cooling through red into char, then fading to ash. A kinetic strike tells a
   different story — no heat, just violently disturbed pale earth that settles.
   These are temporary by design; the painted scorch pass remains the
   permanent record underneath.
   kind: 0 kinetic, 1 thermal, 2 void, 3 urban ash.
   --------------------------------------------------------------------------- */
const groundBurns=[];
function addGroundBurn(x,y,r,kind){
  /* Cities still burn and crater.  What they must not do is impersonate
     open soil: a truthy kind used to coerce void scars into orange thermal
     discs, and those discs read as a broken placement preview on pavement.
     kind 0 kinetic, 1 thermal, 2 void, 3 urban ash.
     Thermal hits stay kind 1 so plazas ember; the terrain shader converts
     the same stamp to soot where the hardscape mask is poured. */
  const civic=typeof cityGroundAt==='function' ? cityGroundAt(x,y) : 0;
  const k=kind===2 ? 2 : (kind===3 ? 3 : (kind ? 1 : 0));
  groundBurns.push({x,y,r,kind:k,t0:stats.t,civic:civic>=1});
  if(groundBurns.length>64) groundBurns.shift();
  if(civic>=1 && k!==2 && r>=20 && typeof addShard==='function'){
    for(let n=0;n<4;n++){
      const a=Math.random()*TAU, sp=rr(30,90);
      addShard(x+Math.cos(a)*10, y+Math.sin(a)*10,
               Math.cos(a)*sp, Math.sin(a)*sp, rr(40,110),
               rr(4,9), [0.1,0.1,0.3,0.3], 130,136,144);
    }
  }
  return true;
}
/* ================= RECLAMATION =============================================
   Nothing on this battlefield is ever fully destroyed — it is DEMOTED into raw
   material. Your tanks, their tanks, your own factory, a derelict apartment
   block: all of it collapses into a wreck field that any unit standing over it
   will strip for mass and energy. That is the point. It makes ground worth
   holding after the shooting stops, it makes razing a dead city a legitimate
   economic strategy, and it means a lost battle still pays you something.
   kind: 0 unit  1 structure  2 city/derelict  3 scenery  4 volatile/fuel     */
const WRECK_CAP=460, RECL_R=58, RECL_RATE=52, FAB_RECL_R=230, FAB_RECL_RATE=44;
/* ============================================================================
   SALVAGE IS MADE OF WHAT DIED.
   Every loss used to drop the same debris: a tank, a factory and a giant insect
   all left identical scrap paying identical mass AND energy. That is wrong on
   its face — there is no powerplant in a bug and no reactor in a rifleman — and
   it quietly flattened a real decision, because if all corpses pay the same
   there is never a reason to fight over one battlefield rather than another.

   Three classes, and the difference is in what they PAY, not just how they look:
     SCRAP    machines and structures. Alloy plus recoverable electronics, so it
              is the only salvage that returns energy.
     BIOMASS  the Brood and the wildlife. Chitin and tissue: mass only, and less
              of it, because you are rendering a carcass rather than stripping a
              hull. Renders as pale organic matter, not twisted metal.
     GEAR     infantry. Armour plate, a weapon and a power cell — a small pile,
              but genuinely a pile, where previously a dead soldier left nothing.
   ============================================================================ */
const WRECK_SCRAP=0, WRECK_STRUCT=1, WRECK_RUIN=2, WRECK_BIO=5;
/* Which faction kit is this team actually fielding? Salvage resolves material
   through the SAME table the renderer resolves the mesh through - an edited
   kit can never ship a faction that bleeds the wrong substance. */
function unitKitOf(team){
  if(team===2) return 'horde';
  if(team===1) return (typeof AI!=='undefined'&&AI.fac&&FACTIONS[AI.fac])?(FACTIONS[AI.fac].kit||'legion'):'legion';
  const pf=(typeof playerFaction!=='undefined'&&playerFaction)||'nova';
  return (typeof FACTIONS!=='undefined'&&FACTIONS[pf]&&FACTIONS[pf].kit)||'nova';
}
/* Machine refund: 40% of build cost plus a hull term. The line this replaced
   paid cm*0.5+8, which refunded 103% on a Striker, 51% on a TITAN, and minted
   8 mass from every free-spawn death - the cheaper the unit, the better the
   deal, which is exactly backwards for an economy that wants you contesting
   the EXPENSIVE graves. Flat-rate plus size keeps every hulk near 40-45%. */
function machineMass(T){ return T.cm*0.40 + T.size*T.size*0.010; }
/* SALVAGE IS MADE OF WHAT DIED.
   Machines leave scrap: alloy plus recoverable electronics, the only salvage
   that pays MASS (and some energy). Grown things leave BIOMASS: rendered for
   ENERGY only - there is no plate to smelt in a carcass and no reactor in a
   bug - and it rots off the field far sooner than metal. Fallen soldiers
   leave nothing at all: a body is not salvage. The organic test resolves
   through the faction kit, so a Syndicate "infantry" slot - a strider drone -
   correctly leaves a small scrap pile while a Dominion breacher, a person in
   siege plate, leaves none. */
function dropRemains(i){
  const T=TYPES[utype[i]], team=uteam[i];
  if(T.naval) return;
  const organic=T.brood||T.caster||team===2||
    (typeof unitModelOrganic==='function'&&unitModelOrganic(unitKitOf(team),utype[i]));
  if(organic){
    /* A fallen soldier is a body, not a resource: no pile, ever. A grown
       warbeast renders into biomass - but only bodies big enough to be worth
       a drone's time make an entry, because the wreck ring buffer must
       survive a tide (460 slots; a flood of tiny corpses used to evict
       every valuable structure grave on the field). */
    if(typeof unitModelHuman==='function'&&unitModelHuman(unitKitOf(team),utype[i])) return;
    if(T.size<16) return;
    addWreckField(ux[i],uy[i], 0, T.ce*0.20+T.size*0.9, WRECK_BIO,
                  T.size*0.8, T.size>=34?2:1);
    return;
  }
  addWreckField(ux[i],uy[i], machineMass(T), T.ce*0.14, WRECK_SCRAP,
                T.size*0.8, T.size>=34?2:1);
  /* HEAVY MACHINES ALSO LEAVE ONE VISIBLE CRATE, not just a scatter of passive
     piles. Same salvage doctrine, better feedback: the +25 mass is a collectible
     the player can see and reach for instead of a value hidden in the debris,
     and it is what makes a dead tank read as "go claim that" on the field. */
  if(T.size>=20){
    const SC=spawnCrate(ux[i],uy[i],'scrap');
    if(SC) SC.alt=0;                               // landed already, it was just killed
  }
}
function addWreck(x,y,mass,energy,kind,scale){
  wrecks.push({x,y,a:Math.random()*TAU,s:(scale||1)*(16+Math.random()*10),
               /* `mass||20` turned an EXPLICIT zero into 20 - which quietly
                  minted metal out of every biomass pile, since biomass is
                  defined by carrying mass 0. Default only when absent. */
               mass:mass===undefined?20:mass, m0:mass===undefined?20:mass,
               en:energy||0, e0:energy||0,
                kind:kind||0, life:0, glow:0, ts:stats.t});
  if(wrecks.length>WRECK_CAP) wrecks.shift();
}
/* A convenience wrapper: scatter one big loss into several smaller piles so a
   dead factory reads as a debris FIELD rather than a single tidy token.     */
function addWreckField(x,y,mass,energy,kind,rad,n){
  n=Math.max(1,n|0);
  for(let k=0;k<n;k++){
    const a=Math.random()*TAU, d=Math.sqrt(Math.random())*(rad||30);
    addWreck(x+Math.cos(a)*d, y+Math.sin(a)*d, mass/n, energy/n, kind, 0.8+Math.random()*0.6);
  }
}
let reclTip=0;
/* LIVE STRUCTURE CACHE.
   `blds` is append-only: indices are handles (a unit's target encodes one as
   -2-b, and the spatial grid stores them), so entries can never be spliced out.
   That left every hot scan — economy twice a tick per team, AI counts, threat
   scoring, placement tests — walking a list that only ever grows, most of it
   rubble. The cache is the same list with the dead removed; anything that
   iterates for a SURVEY rather than resolving a handle uses it. */
let bldLive=[];
function refreshBldLive(){ bldLive=blds.filter(B=>B.alive); }
/* Completed, living fabricators, refreshed whenever the structure list changes.
   Reclaim consults this every tick for every wreck, so it must not be a scan. */
let fabList=[];
function refreshFabList(){
  fabList=blds.filter(B=>B.alive&&B.prog>=1&&B.type==='fab'&&B.team<2);
}
function reclaimTick(dt){
  /* Construction finishing does not touch the structure grid, so the cache is
     also refreshed on a slow beat to pick up newly completed fabricators. */
  if((tick%31)===0){ refreshFabList(); refreshBldLive(); }
  if(!wrecks.length) return;
  for(let w=wrecks.length-1;w>=0;w--){
    const W=wrecks[w];
    W.life+=dt;
    if(W.glow>0) W.glow-=dt;
    /* Fabricators run salvage drones over a wide area — that is the building's
       second job and the reason to plant one behind the front line.         */
    let team=-1, rate=0;
    /* Iterate the FABRICATORS, not the buildings. The original scanned every
       structure in the game for every wreck, every tick — at the wreck cap and
       a few hundred structures that is six figures of distance tests per tick.
       There are only ever a handful of fabricators, and they are cached. */
    for(const B of fabList){
      if(dist2(B.x,B.y,W.x,W.y)<FAB_RECL_R*FAB_RECL_R){ team=B.team; rate=FAB_RECL_RATE; break; }
    }
    if(team<0){                       // otherwise: any unit standing on it strips it
      const u=nearestUnitAny(W.x,W.y,RECL_R);
      if(u>=0&&uteam[u]<2){
        team=uteam[u];
        /* A dedicated engineer should be the obvious salvage tool. Previously
           every chassis reclaimed at the same rate, so the Constructor had no
           economic identity after the base was standing. */
        rate=RECL_RATE*(unitIsHero(u)?3.2:(TYPES[utype[u]].builder?2.0:1));
      }
    }
    if(team>=0){
      const take=Math.min(W.mass, rate*dt);
      const takeE=Math.min(W.en, rate*dt*1.6);
      if(take>0){
        resM[team]=Math.min(RES_MCAP[team], resM[team]+take*(team===0?salvageMult:1));
        stats.reclaimed=(stats.reclaimed||0)+ (team===0?take:0);
      }
      if(takeE>0) resE[team]=Math.min(RES_ECAP[team], resE[team]+takeE*(team===0?salvageMult:1));
      W.mass-=take; W.en-=takeE; W.glow=0.5;
      if(team===0&&(tick&15)===0) addParticle(0,W.x,W.y,rr(-6,6),rr(-16,-6),.45,9, 120,255,170);
      if(team===0&&!reclTip&&W.kind===2){ reclTip=1; toast('♻ Salvaging ruins — raze derelict cities for mass and energy'); }
      if(W.mass<=0.01&&W.en<=0.01){
        if(team===0) heroXP(1);
        addParticle(0,W.x,W.y,0,0,.35,16, 140,255,190);
        wrecks.splice(w,1); continue;
      }
    }
    /* Meat rots faster than metal: a carcass is gone in a minute and a half,
       a hulk lingers three and a half, a razed city stays until stripped. */
    if(W.life>(W.kind===WRECK_BIO?84:210)&&W.kind!==WRECK_RUIN) wrecks.splice(w,1);
  }
}
function nearestUnitAny(x,y,rad){
  let best=-1,bd=rad*rad;
  forUnitsIn(x,y,rad,j=>{ if(uteam[j]>1) return; const d=dist2(x,y,ux[j],uy[j]); if(d<bd){bd=d;best=j;} });
  return best;
}
/* Smooth deterministic value noise for scatter fields. Deliberately local and
   tiny rather than reaching into terragen's lattice: this runs once per map on
   a few thousand samples, and coupling scatter to the erosion generator would
   mean a terrain tuning change silently moved every tree. */
function mfScatterNoise(x,y,freq,seed){
  const fx=x*freq/MAP, fy=y*freq/MAP;
  const x0=Math.floor(fx), y0=Math.floor(fy);
  const tx=fx-x0, ty=fy-y0;
  const sx=tx*tx*(3-2*tx), sy=ty*ty*(3-2*ty);      // smoothstep, not linear
  const h=(a,b)=>{ let n=(a*374761393+b*668265263+seed*1442695040888963407)|0;
    n=(n^(n>>>13))*1274126177|0; return ((n^(n>>>16))>>>0)/4294967295; };
  const v00=h(x0,y0), v10=h(x0+1,y0), v01=h(x0,y0+1), v11=h(x0+1,y0+1);
  return (v00*(1-sx)+v10*sx)*(1-sy)+(v01*(1-sx)+v11*sx)*sy;
}
/* Flora height gates below were tuned against the OLD narrow distribution.
   TERRA.reliefGain expands land about WATER_H, so those literals now describe
   different ground than when they were chosen: the measured effect was tree
   count collapsing to 58 against a cap of 240 — the expansion quietly thinned
   every forest. Map each tuned constant through the same transform so a band
   keeps meaning the same PLACE it always did. */
function mfFloraH(h){
  const g=(typeof TERRA!=='undefined'&&TERRA.reliefGain)||1;
  const w=(typeof WATER_H!=='undefined')?WATER_H:0.335;
  return h>w? w+(h-w)*g : h;
}
function setupDoodads(){
  rocks.length=0; trees.length=0; crystals.length=0; cover.length=0;
  /* Was srand(777): a literal constant, so every map on every planet drew the
     SAME candidate points. Terrain and biome filters then carved different
     subsets out of one shared pattern, which is a large part of why regions
     read as the same place with a different palette. Seed from the map id. */
  let mapSeed=777;
  if(typeof curMap==='string'){ for(let c=0;c<curMap.length;c++) mapSeed=(mapSeed*31+curMap.charCodeAt(c))|0; }
  if(typeof MAPDEFS!=='undefined'&&MAPDEFS[curMap]&&MAPDEFS[curMap].seed) mapSeed^=MAPDEFS[curMap].seed;
  srand(mapSeed>>>0);
  /* GROVE + ZONE FIELDS. There was no clustering of any kind — "forest" was
     not a concept, only uniform scatter, which is why woodland read as gravel
     spread evenly over a map. groveN concentrates canopy into stands with
     genuine clearings between them; zoneN keeps species coherent over an area
     instead of rolling per candidate, so a pine stand stays a pine stand. */
  const GROVE_SEED=(mapSeed^0x9e37)>>>0, ZONE_SEED=(mapSeed^0x85eb)>>>0;
  const groveN=(x,y)=>mfScatterNoise(x,y,7.5,GROVE_SEED)*0.68+mfScatterNoise(x,y,17,GROVE_SEED^5)*0.32;
  const zoneN =(x,y)=>mfScatterNoise(x,y,4.2,ZONE_SEED);
  /* Flora needs a heightfield. newSkirmish → resetWorld can beat applyTheme
     on a cold boot; planting against null heightF used to throw in hAt. */
  const haveH=!!heightF;
  const K=typeof biomeKit==='function'?biomeKit():null;
  const treeCap=K&&K.trees!=null?K.trees:(THEMES[curTheme]&&THEMES[curTheme].trees)||180;
  const rockCap=K&&K.rocks!=null?K.rocks:60;
  const coverCap=K&&K.cover!=null?K.cover:40;
  const rockKind=(K&&K.rockKind)||'stone';
  const clearOf=(x,y)=> typeof farFromStartZones==='function'?farFromStartZones(x,y,300)
    :dist2(x,y,MAP*SP_LO,MAP*SP_HI)>300*300&&dist2(x,y,MAP*SP_HI,MAP*SP_LO)>300*300;
  /* Raised from 1100: clustering REJECTS candidates in clearings, so the same
     count would thin the map overall. Caps still bound the result, so this
     costs candidate tests, not objects. */
  for(let i=0;i<2600;i++){
    const x=rr(60,MAP-60), y=rr(60,MAP-60);
    if(!clearOf(x,y)) continue;
    /* The city planner owns these cells. Trees and boulders are valid beyond
       the weathered verge, never through a roof, road or cleared plaza. */
    if(cityGroundAt(x,y)) continue;
    if(!haveH) continue;
    const h=hAt(x,y);
    if(h<mfFloraH(0.40)||h>mfFloraH(0.75)) continue;
    let nearDep=false;
    for(const D of deposits) if(dist2(x,y,D.x,D.y)<70*70){ nearDep=true; break; }
    if(nearDep) continue;
    /* Species by LOCATION, not per candidate. floraKind rolls a fresh random
       for every point, so a mixed kit produced salt-and-pepper: a pine beside a
       palm beside a pine. Feeding it a position-stable value makes the same
       call return the same species across a whole zone, so stands are coherent
       and the boundary between them is where the noise crosses. */
    const zv=zoneN(x,y);
    const fk=typeof floraKind==='function'?floraKind(K,()=>zv):(K&&K.flora)||'broad';
    /* Grove weight: >1 inside a stand, ~0 in a clearing. */
    const gv=groveN(x,y);
    /* Sharper than the first attempt (0.34/0.30), which measured a nearest-
       neighbour ratio of 0.94-0.98 — barely distinguishable from uniform
       scatter. Higher threshold and narrower ramp make clearings genuinely
       empty, which is what makes a stand read as a stand. */
    const grove=clamp((gv-0.44)/0.20,0,1);
    const lo=mfFloraH(fk==='palm'?0.40:(fk==='pine'?0.50:0.42));
    const hi=mfFloraH(fk==='palm'?0.54:(fk==='pine'?0.72:0.60));
    if(trees.length<treeCap && h>lo && h<hi && rnd()<0.06+0.92*grove)
      trees.push({x,y,s:rr(16,34),a:rr(0,TAU),k:fk});
    /* Undergrowth follows the canopy but reaches past its edge, so a stand has
       a soft margin instead of a hard disc. */
    else if(cover.length<coverCap && h>mfFloraH(0.42) && h<mfFloraH(0.62) && rnd()<0.10+0.44*Math.sqrt(grove))
      cover.push({x,y,s:rr(10,18),a:rr(0,TAU)});
    /* Boulders prefer the OPEN ground the canopy left behind. Previously rocks
       only ever received the trees' rejects, so they inherited tree
       distribution instead of having one of their own. */
    else if(rocks.length<rockCap && rnd()<0.12+0.34*(1-grove))
      rocks.push({x,y,s:rr(16,44),a:rr(0,TAU),k:rockKind});
  }
  /* Modest crown on each mass node. The old 7+6+7 field at 17–88 world
     units was the glow-orb carpet; crystals:0 hid the shards that belong
     on the pad. Three core + a few close satellites stay on the outcrop. */
  for(let di=0;di<deposits.length;di++){
    const D=deposits[di],tier=D.initialTier||1;
    for(let k=0;k<3;k++){
      const a=k/3*TAU+rr(-.18,.18),d=k?rr(7,14):rr(1,5);
      crystals.push({x:D.x+Math.cos(a)*d,y:D.y+Math.sin(a)*d,
        s:rr(28,38)+(tier-1)*3,a:rr(-0.28,0.28),dep:di,band:1,phase:rr(0,TAU),core:1});
    }
    const extra=tier>=3?3:2;
    for(let k=0;k<extra;k++){
      const a=(k/extra)*TAU+rr(-.2,.2)+.31,d=rr(16,26);
      crystals.push({x:D.x+Math.cos(a)*d,y:D.y+Math.sin(a)*d,
        s:rr(16,24),a:rr(-0.42,0.42),dep:di,band:1,phase:rr(0,TAU)});
    }
  }
}

// ---------- beams ----------
const beams=[];    // {x0,y0,x1,y1,t,max,w,r,g,b,style,seed,team}
function addBeam(x0,y0,x1,y1,w,r,g,b,life,style,team){
  /* Style is visual only, but it gives each weapon a readable silhouette:
     lightning branches, thermal beams pulse, and orbital lances have a wide
     bloom sheath. Keeping that data on the short-lived beam avoids another
     effect list and does not touch combat balance. */
  /* At 12-18 fps a 140 ms beam can be born and expire between two rendered
     frames even though the simulation processed it correctly. Keep the visual
     record alive for at least 190 ms; this changes no damage timing, it only
     guarantees one readable frame on the phones that need the feedback most. */
  /* `team` is fog identity for the renderer. Friendly fire may stay readable
     at the sensor edge; omitting it keeps the old "must be in a revealed cell"
     path so repair/airlift callers do not change. */
  beams.push({x0,y0,x1,y1,t:0,max:Math.max(.19,life||0.14),w,r,g,b,
              style:style||'laser',seed:(x0*13+y0*7+x1*3+y1+tick*11)%TAU,team:team});
  if(beams.length>400) beams.shift();
}
/* Visual-only: land a tracer on the hull, not the navel. Damage still uses
   the sim contact. Cap the pull so a point-blank shot cannot invert. */
function beamHitXY(x0,y0,x1,y1,rad){
  const dx=x1-x0, dy=y1-y0, d=Math.hypot(dx,dy)||1;
  const pull=Math.min(Math.max(0,rad)||0, d*0.42);
  return pull<=0.4?[x1,y1]:[x1-dx/d*pull, y1-dy/d*pull];
}
/* Authored gun meshes sit on BLD_TUR_S, which is larger than the collision
   disc. `frac` is a fraction of BT.size chosen to sit on the bore (see the
   comment on BLD_TUR_S). `side` is a perpendicular tube offset. */
function bldMuzzleXY(B,frac,side){
  const ma=(B.tang||0)-Math.PI/2, d=((BT[B.type]&&BT[B.type].size)||20)*(frac||0.7);
  const c=Math.cos(ma), s=Math.sin(ma), lat=side||0;
  return [B.x+c*d-s*lat, B.y+s*d+c*lat];
}
function beamTick(dt){
  for(let i=beams.length-1;i>=0;i--){
    beams[i].t+=dt;
    if(beams[i].t>=beams[i].max) beams.splice(i,1);
  }
}

// ---------- projectiles ----------
const px=new Float32Array(MAXP), py=new Float32Array(MAXP);
const pvx=new Float32Array(MAXP), pvy=new Float32Array(MAXP);
const plife=new Float32Array(MAXP), pdmg=new Float32Array(MAXP), paoe=new Float32Array(MAXP);
const ptype=new Uint8Array(MAXP), pteam=new Uint8Array(MAXP), palive=new Uint8Array(MAXP);
const ptgt=new Int32Array(MAXP);
const ptgtg=new Int32Array(MAXP);
const pmu0=new Float32Array(MAXP);      // armour multiplier already folded into pdmg
const pwk=new Array(MAXP).fill('n');    // weapon class, for per-victim splash
const psx=new Float32Array(MAXP), psy=new Float32Array(MAXP), pex=new Float32Array(MAXP), pey=new Float32Array(MAXP), pt=new Float32Array(MAXP);
const pmax=new Float32Array(MAXP);       // normalized flight phase for trails / guided boost
const pSplit=new Uint8Array(MAXP);
const pCannon=new Uint8Array(MAXP);       // Commander's heavy shell: unique report + blast signature
const pBio=new Uint8Array(MAXP);          // grown spore/bile payload, never rendered as manufactured ordnance
const pBarrage=new Uint8Array(MAXP);      // coordinated active-fire payload; wide structure splash + distinct VFX
/* Source structure for defence-fired ordnance (object ref, null otherwise).
   Lets shell/missile kills feed the same veterancy + bounty loop the
   direct-fire towers use — checked for aliveness at credit time. */
const pSrcBld=new Array(MAXP).fill(null);
/* Who FIRED this shot. Kill credit - and therefore veterancy - was reachable
   only by melee and instant-beam units, because those two call dealDamage with
   a real attacker index while every projectile path passed -1. 23 of 29 armed
   chassis fire projectiles, so almost the whole roster could never be promoted
   no matter how it performed. Stored as index + generation because projectile
   slots outlive unit slots and the pool recycles: without the generation the
   credit could land on whatever new unit inherited the shooter's slot. */
const pSrcUnit=new Int32Array(MAXP).fill(-1);
const pSrcGen=new Int32Array(MAXP).fill(-1);
const pArc=new Float32Array(MAXP);         // authored visual arc height for true ballistic shells
/* REAL BALLISTIC Z. Until now a shell had no height state at all: the renderer
   derived its apparent altitude from gh(X,Y) -- the ground beneath its CURRENT
   xy -- plus a sine of flight phase. So the shell's height was a property of
   whatever terrain it happened to be over: firing across a ridge made the round
   climb with it, and a shot over a crater dipped into the hole. pz0/pz1 capture
   the muzzle and impact GROUND heights once at spawn; pz carries the live
   height, so the arc is a real trajectory between two fixed points. */
const pz0=new Float32Array(MAXP), pz1=new Float32Array(MAXP), pz=new Float32Array(MAXP);
const pSmokeT=new Float32Array(MAXP);      // fixed-rate barrage wake; independent of render FPS / global tick
const pFlightCue=new Uint8Array(MAXP);     // two restrained pressure cues per shell, never one per frame
const pTurbSeed=new Float32Array(MAXP);    // stable phase for the filtered-noise smoke path
const artShellSmoke=[];                    // lightweight 3D-aware wake, bounded below for mobile
function artShellTurbulence(i,q){
  /* Two low-frequency harmonics behave like filtered noise: the wake bends
     and curls without the frame-to-frame sparkle of Math.random(). Keeping
     this pure makes replay captures and the focused ballistics test exact. */
  const s=pTurbSeed[i]*TAU;
  return Math.sin(q*19.7+s)*8.4+Math.sin(q*43.3+s*2.31)*3.1;
}
/* Impact-carried disruption duration. This cannot live on the Bastion itself:
   a shell can remain airborne after its source is sold or destroyed, and the
   Mk level that fired it is the payload it must keep. */
const pConcuss=new Float32Array(MAXP);
let pFree=[], pHigh=0;
/* Submunition spawner: marks the round as ALREADY SPLIT so it detonates
   normally instead of clustering again — without that flag a cluster shell
   spawns cluster shells forever. fireProj returns its slot so this is a direct
   write rather than a search. */
function fireProjSplit(type,team,x,y,tx,ty,speed,dmg,aoe,bio,from){
  const k=fireProj(type,team,x,y,tx,ty,speed,dmg,aoe,-1);
  if(k>=0){
    pSplit[k]=1; pBio[k]=bio?1:0;
    /* Bomblets used to spawn as wk 'n' with no commander flag, so a cluster
       strike lost its explosive class and could not inherit the parent's
       blast VFX. Copy both from the opening shell. */
    if(from>=0){ pwk[k]=pwk[from]||'e'; pCannon[k]=pCannon[from]; }
  }
}
function mfUnitMeshFor(i){
  const ty=utype[i], T=TYPES[ty];
  const kit=uteam[i]===0?((typeof playerKitKey==='function')?playerKitKey():'nova')
    :(uteam[i]===1&&typeof AI!=='undefined'&&AI?AI.fac:null);
  if(typeof factionUnitMeshFor==='function'&&kit){
    const F=factionUnitMeshFor(ty,kit);
    if(F) return F;
  }
  if((T.cat==='hero'||T.hero||ty===4)&&typeof commanderKitMeshFor==='function'){
    const cid=typeof commanderIdForUnit==='function'?commanderIdForUnit(i):null;
    if(cid){ const K=commanderKitMeshFor(cid); if(K) return K; }
  }
  return (typeof UNIT_MESH!=='undefined')?UNIT_MESH[ty]:null;
}
function mfMuzzleReachModel(T,M){
  /* Model-space +X to the bore. T.size*0.62 was a hull guess — Rhino's
     gunX starts at 2.6 and runs 7.6, so the flash sat halfway down the tube. */
  if(M&&M.muzzle>0) return M.muzzle;
  if(T.air) return 3.6;
  if(T.naval) return 8.2;
  if(!T.tur) return T.size>=28?8.8:T.legs?2.8:4.0;
  if(T.minRng||T.ptype===2) return 16.0;
  if(T.size>=20) return 14.2;
  if(T.size>=15) return 10.2;
  return 7.4;
}
function mfUnitMuzzle(i,side){
  const T=TYPES[utype[i]], M=mfUnitMeshFor(i);
  const ss=(T.size/15)*(M&&M.s||1)*1.5*(T.vscale||1);
  const ma=(T.tur?uturr[i]:uang[i])-Math.PI/2;
  const reach=mfMuzzleReachModel(T,M)*ss;
  let lat=(M&&M.muzzleZ)||0;
  if(!lat&&T.tur&&T.tg==='air') lat=1.15;
  if(side==null) side=((i+(typeof tick==='number'?tick:0))&1)?1:-1;
  lat*=ss*side;
  return [ux[i]+Math.cos(ma)*reach-Math.sin(ma)*lat,
          uy[i]+Math.sin(ma)*reach+Math.cos(ma)*lat];
}
function fireProj(type,team,x,y,tx,ty,speed,dmg,aoe,tgt){
  let i;
  if(pFree.length) i=pFree.pop(); else { if(pHigh>=MAXP) return -1; i=pHigh++; }
  palive[i]=1; ptype[i]=type; pteam[i]=team; pdmg[i]=dmg; paoe[i]=aoe; ptgt[i]=tgt; pSplit[i]=0; pCannon[i]=0; pBio[i]=0; pBarrage[i]=0; pArc[i]=0; pConcuss[i]=0; pSrcBld[i]=null; pSrcUnit[i]=-1; pSrcGen[i]=-1;
  pSmokeT[i]=0;pFlightCue[i]=0;
  ptgtg[i]=tgt>=0?ugen[tgt]:-1;
  pmu0[i]=1; pwk[i]='n';
  px[i]=x; py[i]=y;
  if(type===2){
    psx[i]=x; psy[i]=y; pex[i]=tx; pey[i]=ty; pt[i]=0;
    /* Sampled once, at the two ends only. terrainH is a 9-tap box blur (36
       heightF reads), so per-frame per-shell sampling would be the most
       expensive thing in this loop for no gain — the endpoints define the arc. */
    pz0[i]=(typeof terrainH==='function')?terrainH(x,y):0;
    pz1[i]=(typeof terrainH==='function')?terrainH(tx,ty):0;
    pz[i]=pz0[i]+16;
    const d=Math.max(1,Math.sqrt(dist2(x,y,tx,ty)));
    /* The renderer orients shells from velocity. Ballistics used to inherit a
       recycled slot's old velocity, so their bodies and smoke could point at
       a completely different battle. */
    pvx[i]=(tx-x)/d*speed; pvy[i]=(ty-y)/d*speed;
    plife[i]=d/speed;
    pTurbSeed[i]=(Math.abs((x*31+y*17+tx*13+ty*7+i*97)|0)%997)/997;
  } else {
    const d=Math.max(1,Math.sqrt(dist2(x,y,tx,ty)));
    pvx[i]=(tx-x)/d*speed; pvy[i]=(ty-y)/d*speed;
    plife[i]=d/speed+(type===4?0.6 : type===7?1.6 : type===6?0.9 : type===8?0.35 : type===9?0.25 : 0.06);
  }
  pmax[i]=Math.max(0.001,plife[i]);
  return i;
}
function killProj(i){ palive[i]=0; pFree.push(i); }

/* A projectile's first frame should identify the weapon before the damage
   number appears. Keeping launch signatures separate from impact signatures
   stops a kinetic rifle, a rocket and a sonic emitter reading as one gun. */
function projectileFireFX(i,x,y,dx,dy){
  /* Low FPS used to remove the ENTIRE firing signature. That is backwards:
     the muzzle flash is gameplay feedback while its extra sparks are garnish.
     Keep one core event at every quality and scale only the secondary spray. */
  const lowFx=perfScale<=.32;
  const l=Math.hypot(dx,dy)||1;
  dx/=l;dy/=l;
  const rx=-dx,ry=-dy,wk=pwk[i]||'p',ty=ptype[i],fp=mfFactionFxPalette(pteam[i]);
  const heavy=pCannon[i]||pBarrage[i]||ty===2||ty===9;
  const spark=(n,sp,r,g,b)=>{n=lowFx?Math.min(1,n):n;for(let q=0;q<n;q++){
    const a=Math.atan2(ry,rx)+(Math.random()-.5)*.55,v=Math.min(10,sp*(.35+Math.random()*.4));
    addParticle(2,x+dx*3,y+dy*3,Math.cos(a)*v,Math.sin(a)*v,.07,.16+Math.random()*.12,r,g,b);
  }};
  if(pBio[i]){
    addParticle(0,x+dx*4,y+dy*4,0,0,.18,14,178,255,92);
    addParticle(3,x,y,0,0,.32,25,177,82,245); spark(2,9,167,255,78);
  }else if(heavy){
    addParticle(0,x+dx*6,y+dy*6,0,0,.13,pCannon[i]?27:21,255,196,76);
    addParticle(3,x,y,0,0,.28,pCannon[i]?21:16,255,122,31);
    addParticle(1,x+rx*4,y+ry*4,rx*7+(Math.random()-.5)*4,ry*7+(Math.random()-.5)*4,1.25,5.8,56,46,31);
    spark(pCannon[i]?5:3,pCannon[i]?17:12,255,145,41);
  }else if(wk==='g'){
    addParticle(0,x+dx*4,y+dy*4,0,0,.10,13,235,250,255); addParticle(3,x,y,0,0,.20,20,56,218,255); spark(3,16,72,242,255);
  }else if(wk==='s'||ty===6){
    addParticle(0,x+dx*3,y+dy*3,0,0,.11,15,220,245,255); addParticle(3,x,y,0,0,.22,22,89,158,255); addParticle(3,x,y,0,0,.30,14,184,77,255);
  }else if(wk==='i'){
    addParticle(0,x+dx*4,y+dy*4,0,0,.10,15,215,248,255); spark(2,12,89,209,255);
  }else if(wk==='f'||ty===5){
    addParticle(0,x+dx*3,y+dy*3,0,0,.13,18,255,92,13); addParticle(4,x+rx*2,y+ry*2,rx*8,ry*8,.24,3.5,255,56,8);
  }else if(ty===4||ty===7||ty===8){
    addParticle(0,x+dx*4,y+dy*4,0,0,.12,16,255,140,41); addParticle(4,x+rx*3,y+ry*3,rx*12,ry*12,.28,3.8,255,79,13); addParticle(1,x+rx*4,y+ry*4,rx*5,ry*5,1.05,5,64,59,51);
  }else{
    addParticle(0,x+dx*3,y+dy*3,0,0,.10,12,184,230,255); spark(1,8,184,230,255);
  }
  /* Signature accents are sampled for ordinary rifles but guaranteed for
     heavy/energy/biological fire. At a 1,000-unit cap this keeps the identity
     visible without doubling the particle load of every infantry volley. */
  const signature=heavy||pBio[i]||wk==='g'||wk==='s'||wk==='i'||((i+((stats.t||0)*12|0))&3)===0;
  if(signature&&!pBio[i]){
    if(fp.key==='legion'){
      addParticle(3,x+dx*3,y+dy*3,0,0,.24,heavy?25:14,fp.a[0],fp.a[1],fp.a[2]);
      if(!lowFx)spark(heavy?3:1,heavy?18:10,fp.b[0],fp.b[1],fp.b[2]);
    }else if(fp.key==='syndicate'){
      addParticle(3,x+dx*3,y+dy*3,0,0,.28,heavy?27:15,fp.a[0],fp.a[1],fp.a[2]);
      if(!lowFx)addParticle(3,x,y,0,0,.38,heavy?34:20,fp.b[0],fp.b[1],fp.b[2]);
    }else{
      addParticle(0,x+dx*5,y+dy*5,0,0,.09,heavy?20:11,fp.b[0],fp.b[1],fp.b[2]);
      if(!lowFx)addParticle(3,x,y,0,0,.22,heavy?23:13,fp.a[0],fp.a[1],fp.a[2]);
    }
  }
}

/* A projectile's impact should identify the weapon before the damage number
   appears. These are deliberately small signatures layered around the shared
   explosion: gauss showers hard white/cyan sparks, sonic ripples twice,
   incendiary sticks as flame, and explosives throw hot fragments into smoke. */
function projectileImpactFX(i,x,y){
  /* Never cull the core impact language. Debris helpers below already obey
     the performance budget; deleting this whole function made every weapon
     silently hit at the exact moment a device became busy. */
  const wk=pwk[i]||'p', ty=ptype[i],fp=mfFactionFxPalette(pteam[i]);
  const s=clamp(5+Math.sqrt(Math.max(1,pdmg[i]))*0.34+(paoe[i]||0)*0.12,6,34);
  const vl=Math.hypot(pvx[i],pvy[i])||1,nx=pvx[i]/vl,ny=pvy[i]/vl;
  const debris=(n,sp,r,g,b)=>{if(perfScale<=.48)return;
    /* Older callers use normalized colours while particle storage is Uint8.
       Convert at the seam so fragments do not silently become near-black. */
    if(r<=1&&g<=1&&b<=1){r*=255;g*=255;b*=255;}
    for(let q=0;q<n;q++){
    const a=Math.atan2(ny,nx)+(Math.random()-.5)*1.6,v=Math.min(14,sp*(.4+Math.random()*.45));
    addParticle(7,x,y,Math.cos(a)*v,Math.sin(a)*v,.10+Math.random()*.10,.36+Math.random()*.24,r,g,b);
  }};
  if(pBio[i]){
    /* Brood ammunition ruptures rather than detonates: wet luminous bile,
       chitin splinters and a delayed spore ring. Damage semantics stay in wk. */
    addParticle(0,x,y,0,0,.20,s*1.65, 178,255,92);
    addParticle(3,x,y,0,0,.42,Math.min(16,s*1.15), 177,95,235);
    addParticle(1,x,y,rr(-5,5),rr(-10,-3),1.45,s*.95, 65,78,48);
    const n=Math.max(2,Math.round(5*perfScale));
    for(let k=0;k<n;k++) addParticle(2,x,y,rr(-14,14),rr(-14,14),.22,2.2, 198,255,105);
  } else if(pBarrage[i]){
    addParticle(0,x,y,0,0,.17,s*2.1,255,246,215);
    addParticle(3,x,y,0,0,.44,paoe[i]*1.9,255,174,72);
    addParticle(3,x,y,0,0,.72,paoe[i]*2.7,164,132,105);
    addParticle(1,x,y,rr(-7,7),rr(-22,-9),2.35,s*1.85,48,45,43);
    const n=Math.max(5,Math.round(11*perfScale));
    for(let k=0;k<n;k++) addParticle(5,x,y,rr(-22,22),rr(-22,22),.32,3.2,255,178,74);
    debris(5,20,.23,.18,.12);
  } else if(pCannon[i]){
    /* White pressure flash, hot fragmentation, then a broad dust column. The
       expanding rings expose the actual splash footprint. */
    addParticle(0,x,y,0,0,.18,s*2.25, 255,244,210);
    addParticle(3,x,y,0,0,.38,paoe[i]*1.85, 255,194,105);
    addParticle(3,x,y,0,0,.68,paoe[i]*2.65, 185,145,105);
    addParticle(4,x,y,0,0,.68,Math.min(16,s*1.1), 255,145,48);
    addParticle(1,x,y,rr(-6,6),rr(-20,-8),2.15,s*1.55, 50,47,44);
    const n=Math.max(5,Math.round(10*perfScale));
    for(let k=0;k<n;k++) addParticle(5,x,y,rr(-20,20),rr(-20,20),.30,3.0, 255,185,82);
    debris(7,25,.24,.2,.15);
  } else if(wk==='g'){
    addParticle(3,x,y,0,0,.24,s*1.65, 155,225,255);
    addParticle(0,x,y,0,0,.13,s*1.25, 235,250,255);
    const n=Math.round(4*perfScale);
    for(let k=0;k<n;k++) addParticle(2,x,y,rr(-16,16),rr(-16,16),.18,2.0, 190,235,255);
  } else if(wk==='s'){
    addParticle(3,x,y,0,0,.34,s*1.8, 115,220,255);
    addParticle(3,x,y,0,0,.48,s*2.6, 185,125,255);
    addParticle(0,x,y,0,0,.18,s*1.45, 210,245,255);
  } else if(wk==='i'||ty===6){
    addParticle(3,x,y,0,0,.26,s*1.7, 75,205,255);
    addParticle(0,x,y,0,0,.22,s*1.55, 215,250,255);
    for(let k=0;k<Math.round(3*perfScale);k++) addParticle(2,x,y,rr(-12,12),rr(-12,12),.16,1.8,95,220,255);
  } else if(wk==='f'||ty===5){
    addParticle(4,x,y,0,0,.65,Math.min(16,s*1.15), 255,150,55);
    addParticle(1,x+rr(-4,4),y+rr(-4,4),rr(-3,3),rr(-12,-6),1.0,s*.75, 58,52,48);
  } else if(wk==='e'||ty===7||ty===9){
    addParticle(4,x,y,0,0,.48,Math.min(14,s*1.05), 255,170,70);
    const n=Math.round(3*perfScale);
    for(let k=0;k<n;k++) addParticle(5,x,y,rr(-16,16),rr(-16,16),.22,2.6, 255,190,95);
    addParticle(1,x,y,rr(-4,4),rr(-13,-6),1.65,s*1.15, 55,52,52);
    if((paoe[i]||0)>=18) debris(3,15,.22,.19,.15);
  } else {
    const n=Math.max(1,Math.round((ty===2?5:2)*perfScale));
    for(let k=0;k<n;k++) addParticle(2,x,y,rr(-12,12),rr(-12,12),.16,1.7, 255,210,140);
    if(ty===1||ty===2||ty===3) addParticle(1,x,y,rr(-3,3),rr(-7,-2),1.05,s*.62, 92,86,78);
  }
  /* The primary impact says WHAT hit; this outer pulse says WHO fired it.
     It is deliberately one cheap ring at low quality and gains a second
     faction-specific flourish only when the adaptive budget has headroom. */
  if(!pBio[i]){
    addParticle(3,x,y,0,0,.34,Math.min(16,s*(pCannon[i]||pBarrage[i]?1.15:0.85)),fp.a[0],fp.a[1],fp.a[2]);
    if(perfScale>.48){
      if(fp.key==='legion') debris(pCannon[i]?5:2,22,1,.34,.16);
      else if(fp.key==='syndicate') addParticle(3,x,y,0,0,.40,Math.min(14,s*1.05),fp.b[0],fp.b[1],fp.b[2]);
      else addParticle(0,x,y,0,0,.12,s*1.15,fp.b[0],fp.b[1],fp.b[2]);
    }
  }
  if(typeof gpfxEnergyBlast==='function'&&perfScale>.28){
    const energy=wk==='g'||wk==='s'||wk==='i'||ty===6||pCannon[i]||pBarrage[i];
    gpfxEnergyBlast(x,y,12,energy?18:8,[fp.a[0],fp.a[1],fp.a[2]],
      {speed:energy?80:52,up:energy?0.36:0.22,life:energy?0.70:0.44,size:energy?6.8:5.4,min:3,dir:[nx,ny]});
  }
}

function projImpact(i){
  const x=px[i], y=py[i], team=pteam[i], aoe=paoe[i], dmg=pdmg[i];
  const preKills=stats.kills[team];
  if(ptype[i]===9 && !pSplit[i]){
    /* Cluster shell opens over the target and rains submunitions. One shot
       becomes a pattern, so it punishes clumped formations far harder than a
       single big blast of the same total damage would. */
    pSplit[i]=1;
    const n=pCannon[i]?8:6, df=pCannon[i]?0.45:0.34, af=pCannon[i]?0.58:0.55;
    for(let k=0;k<n;k++){
      const a=pCannon[i]?(k/n)*TAU+0.21:Math.random()*TAU;
      const d=pCannon[i]?(24+(k&3)*11):(18+Math.random()*46);
      fireProjSplit(9,team,x,y,x+Math.cos(a)*d,y+Math.sin(a)*d,220,dmg*df,aoe*af,pBio[i],i);
    }
    addParticle(0,x,y,0,0,.2,20,pBio[i]?175:255,pBio[i]?255:220,pBio[i]?90:160);
    /* Bomblet open — sparks, not a gravity well. Nova cluster stays bomblets. */
    if(typeof gpfxEnergyBlast==='function')
      gpfxEnergyBlast(x,y,16,pCannon[i]?28:18,pBio[i]?[175,255,90]:[255,210,120],
        {speed:96,up:0.46,life:0.66,size:6.6,min:5});
    if(pCannon[i]){ addParticle(3,x,y,0,0,.36,aoe*0.9,255,196,82); sfx('cannon',x,y,0.95); }
    else sfx(pBio[i]?'cre_attack':'hit',x,y,0.8);
    killProj(i); return;
  }
  if(ptype[i]===8){                     // flak: airburst fragments / bursting spores
    for(let k=0;k<9;k++){
      const a=Math.random()*TAU, sp=12+Math.random()*18;
      addParticle(5,x,y,Math.cos(a)*sp,Math.sin(a)*sp,.22,2.4,pBio[i]?185:255,pBio[i]?255:215,pBio[i]?95:140);
    }
    addParticle(0,x,y,0,0,.18,aoe*0.9,pBio[i]?180:255,pBio[i]?255:225,pBio[i]?95:170);
    addParticle(3,x,y,0,0,.30,aoe*1.5,pBio[i]?175:255,pBio[i]?105:200,pBio[i]?235:120);
  }
  projectileImpactFX(i,x,y);
  if(aoe>0){
    /* `dmg` arrives with the AIMED target's armour multiplier already folded
       in, so a shell fired at a light scout was applying the anti-light bonus
       to the heavy tank standing beside it. Undo the aimer's multiplier and
       apply each victim's own. */
    const wk=pwk[i]||'n';
    const base=dmg/(pmu0[i]||1);
    /* HORDE SCALING. Count the bodies first, then pay out. A blast landing in a
       press of thirty gets a real bonus; the same blast on a lone tank gets
       none. That is what makes crowd-control weapons a genuine answer to mass
       rather than just a bigger number. */
    const hz=WK_HORDE[wk]||0;
    let crowd=0;
    if(hz) forUnitsIn(x,y,aoe,j=>{ if(uteam[j]!==team) crowd++; });
    const hm = hz ? 1+Math.min(1.6, hz*Math.max(0,crowd-2)*0.055) : 1;
    forUnitsIn(x,y,aoe,j=>{
      if(uteam[j]!==team){
        const fall=1-0.5*Math.sqrt(dist2(x,y,ux[j],uy[j]))/aoe;
        const mv=dmgMul(wk,utype[j]);
        if(pConcuss[i]>0) uhaz[j]=Math.max(uhaz[j],pConcuss[i]);
        dealDamage(j,base*fall*mv*hm,team,-1,mv,wk);
      }
    });
    if(hz&&crowd>=8&&perfScale>0.5) addParticle(3,x,y,0,0,0.34,aoe*1.25, 255,190,110);
    if(pCannon[i]||pBarrage[i]){
      /* Heavy splash strikes every structure inside the pressure front with
         the same 100% to 50% falloff used for units. */
      const bbase=base*(STM[wk]||1);
      for(let b=0;b<blds.length;b++){
        const B=blds[b]; if(!B.alive||B.team===team) continue;
        const br=aoe+B.r, bd=Math.sqrt(dist2(x,y,B.x,B.y));
        if(bd<br) damageBld(b,bbase*(1-0.5*bd/br),team);
      }
    } else {
      const nb=findEnemyBld(x,y,team,aoe+16);
      /* base, not dmg. dmg still carries the multiplier for whatever UNIT this
         shot was aimed at, so a shell aimed at a light scout hit the building
         behind it with the anti-light bonus - and one aimed at heavy armour
         hit the same building for a fraction of its rating. Up to a 3.9x swing
         on identical shots. The heavy-splash branch above already converts to
         the structure multiplier; this branch never did. */
      if(nb>=0) damageBld(nb,base*(STM[wk]||1),team);
    }
    damageScenery(x,y,aoe+8,dmg*0.85,team);      // splash chews through ruins too
    if(pBio[i]){
      addParticle(0,x,y,0,0,.22,aoe*.78,174,255,90);
      addParticle(3,x,y,0,0,.46,aoe*1.18,176,92,235);
      if(aoe>=30) deformTerrain(x,y,aoe*.85,.028,'shell');
      sfx('cre_attack',x,y,clamp(aoe/32,.7,1.4));
    } else if(ptype[i]===5){                          // flame: soft scorch, no fireball
      addParticle(0,x,y,0,0,.2,14, 255,170,60);
      if(Math.random()<0.2) addParticle(1,x,y,rr(-4,4),rr(-10,-4),.5,7, 60,55,50);
    } else {
      const heavy=pCannon[i]||pBarrage[i];
      const arty=heavy||ptype[i]===2||ptype[i]===9||ptype[i]===7;
      /* Visual size only. size>=40 is the superweapon handoff, and the old
         victim-team argument made a Nova cluster on Syndicate ground become
         their singularity (pull, not blast). Cap the FX; damage already
         applied above. Shooter team so any future super stays on the firer. */
      spawnExplosion(x,y,Math.min(aoe*(heavy?0.78:0.55),36),team);
      if(arty||aoe>=28){
        addCrater(x,y,aoe*(arty?1.35:0.95));
        deformTerrain(x,y,aoe*(arty?1.28:1.05),arty?0.068:0.040,arty?'blast':'shell');
      } else if(aoe>=10){
        addCrater(x,y,Math.max(20,aoe*0.95));
        deformTerrain(x,y,Math.max(24,aoe*1.15),0.022,'pock');
      }
      if(heavy){
        if(typeof cam==='undefined'||dist2(x,y,cam.x,cam.y)<900*900) shake=Math.max(shake,4.5);
        /* Player rounds are always known. This guard also prevents a future
           hostile battery from leaking its hidden impact through audio. */
        if(typeof fogFxVisible!=='function'||fogFxVisible(x,y,team)){
          sfx('boom',x,y,pBarrage[i]?1.5:1.35);
          if(pBarrage[i]&&typeof artilleryWorldAudio==='function')artilleryWorldAudio('impact',x,y,team,1.15);
        }
      } else sfx('hit',x,y,aoe/30);
    }
  } else {
    const t=ptgt[i];
    /* Passing the multiplier lights the deflect/rend feedback. Kinetic is most
       of the shots fired in the game and it was the one path that never showed
       the player whether their weapon was right for the armour it hit. */
    if(t>=0 && liveTgt(t,ptgtg[i]) && uteam[t]!==team) dealDamage(t,dmg,team,-1,pmu0[i]||1,pwk[i]);
    else if(isRelicTg(t)){ const R=relics[relicOf(t)]; if(R&&R.alive) damageRelic(R,dmg,team); }
    else if(t<=-2){ const b=-2-t; damageBld(b,dmg,team); }
    else {
      const e=findEnemy(x,y,team,14);
      if(e>=0) dealDamage(e,dmg,team,-1);
    }
    addParticle(0,x,y,0,0,.14,5,pBio[i]?178:255,pBio[i]?255:220,pBio[i]?92:150);
    if(!pBio[i]&&(pCannon[i]||ptype[i]===1||ptype[i]===3)){
      addCrater(x,y,18);
      deformTerrain(x,y,22,0.016,'pock');
    }
  }
  if(pSrcBld[i]) defKillCredit(pSrcBld[i],stats.kills[team]-preKills);
  /* Same diff-the-counter trick the defence path above uses, for the same
     reason: one shell can kill several units, and this counts all of them.
     Credited here rather than by passing the shooter into dealDamage, so the
     directional impact spray and aiOnUnitHit keep their current behaviour -
     this fixes attribution only, and adds no particles to a projectile hit. */
  if(pSrcUnit[i]>=0) unitKillCredit(pSrcUnit[i],pSrcGen[i],stats.kills[team]-preKills);
  killProj(i);
}

let dmgAccum=[0,0,0];
/* `wk` is the weapon class that produced the hit. It is optional — most call
   sites do not care — but sonic uses it to bypass shields and the horde
   multiplier uses it to scale a blast against a crowd. */
function dealDamage(j,dmg,attTeam,attacker,mu,wk){
  if(!ualive[j]||uCrash[j]) return;
  if(uteam[j]===0&&attTeam!==0&&META.settings.godMode){uhp[j]=uhpm[j];return;}
  const shielded=ushielded[j]>0 && !(wk&&WK_PIERCE[wk]);
  if(shielded){
    dmg*=SHIELD_REDUCE;
    /* The shield absorbing a hit was previously INVISIBLE - the one defensive
       buff in the game gave no feedback that it was doing anything. A brief
       cyan shell ripple at the moment of absorption is the readback. */
    if(perfScale>0.5&&Math.random()<0.30)
      addParticle(3,ux[j],uy[j],0,0,.28,TYPES[utype[j]].size*0.85, 120,210,255);
  }
  if(umode[j]) dmg*=modeTakenMul(umode[j]);      // GUARD stance eats the hit
  dmg*=classTakenMul(j);
  uhp[j]-=dmg;
  if(dmg>=10) uHurtT[j]=6;                       // suppress hero regen while under real fire
  if(typeof aiOnUnitHit==='function'&&attacker>=0&&dmg>=6) aiOnUnitHit(j,dmg,attTeam,attacker);
  if(uhp[j]>0&&unitIsBrood(j)&&dmg>=uhpm[j]*0.04&&Math.random()<0.16)
    sfx('cre_pain',ux[j],uy[j],clamp(TYPES[utype[j]].size/18,0.65,1.5));
  /* Fire persistence: incendiary hits leave units burning for 2.4s */
  if(wk==='f'){
    ufireT[j]=2.4;
    /* Scorch decal on the ground where incendiary rounds land */
    if(perfScale>0.35 && Math.random()<0.45)
      addRubble(ux[j]+rr(-6,6),uy[j]+rr(-6,6),TYPES[utype[j]].size*0.7);
  }
  dmgAccum[attTeam]+=dmg;
  // combat readability: floating damage numbers + counter FX (sampled, near camera)
  if(perfScale>0.5 && Math.random()<0.28) spawnFloatText(ux[j],uy[j],dmg,mu||1);
  if(mu){
    if(mu<=0.8 && Math.random()<0.35) addParticle(5,ux[j],uy[j],rr(-8,8),rr(-10,-3),.16,2.0, 200,208,218);   // deflect spark
    else if(mu>=1.15 && Math.random()<0.3) addParticle(0,ux[j],uy[j],0,0,.16,9, 255,150,60);                  // rend flash
  }
  /* DIRECTIONAL IMPACT SPRAY. Hits used to flash at the victim's centre with
     no notion of where the shot came FROM, so a firefight read as units
     twinkling rather than units being struck. Debris now exits on the far
     side of the impact, along the shot line - and it is made of the victim:
     ichor off a carapace, sparks off a hull. Sampled hard; this is seasoning,
     not another particle storm. */
  if(attacker>=0&&ualive[attacker]&&perfScale>0.5&&Math.random()<0.22){
    const ix=ux[j]-ux[attacker], iy=uy[j]-uy[attacker], il=Math.hypot(ix,iy)||1;
    const dx2=ix/il, dy2=iy/il, organic=unitIsBrood(j);
    const nsp=dmg>=26?3:2;
    for(let k2=0;k2<nsp;k2++){
      const sway=rr(-0.55,0.55), c2=Math.cos(sway), s2=Math.sin(sway);
      const vx2=(dx2*c2-dy2*s2)*rr(8,16), vy2=(dx2*s2+dy2*c2)*rr(8,16);
      if(organic) addParticle(5,ux[j],uy[j],vx2*0.7,vy2*0.7,.30,2.6, 150,235,95);
      else        addParticle(5,ux[j],uy[j],vx2,vy2,.22,2.2, 255,214,140);
    }
  }
  /* Brood liquid lives in organicfx.js — not the energy spark path. */
  if(uhp[j]>0&&typeof orgfxOnHit==='function'&&unitIsBrood(j)&&dmg>=6)
    orgfxOnHit(j,dmg,attacker);
  if(uhp[j]<=0){
    const wasType=utype[j], wasTeam=uteam[j];
    killUnit(j);
    stats.kills[attTeam]++;
    /* Rendering a kill in the field pays ENERGY - there is no alloy in an
       insect, and paying mass here minted metal out of meat. */
    if(attTeam===0&&wasTeam===2){ credit(0,0,(wasType===13?90:8)*salvageMult,(attacker>=0&&uCmd[attacker]>=0)?uCmd[attacker]:null); }
    if(attTeam===0) heroXP(wasTeam===2?1.2:4+TYPES[wasType].size*0.5);   // bug kills give trickle XP (swarms would flood level-ups)
    if(attacker>=0) unitKillCredit(attacker,ugen[attacker],1);
  }
}

// ---------- particles ----------
// types: 0 flash, 1 smoke, 2 spark, 3 ring, 4 flame, 5 hot fragment,
//        6 explosion flipbook, 7 solid debris, 8 mushroom plume, 9 ambience,
//        10 movement dust (separate so tactical motion survives smoke LOD)
const fx=new Float32Array(MAXPART), fy=new Float32Array(MAXPART);
const fvx=new Float32Array(MAXPART), fvy=new Float32Array(MAXPART);
const flife=new Float32Array(MAXPART), fmax=new Float32Array(MAXPART), fsize=new Float32Array(MAXPART);
const ftype=new Uint8Array(MAXPART);
const fcr=new Uint8Array(MAXPART), fcg=new Uint8Array(MAXPART), fcb=new Uint8Array(MAXPART);
/* 0 = terrain-relative (every existing caller). >0 = world Y for airframe
   puffs so a Wasp trail does not stain the dirt. Ground magnitudes untouched. */
const fzh=new Float32Array(MAXPART);
let fHead=0, fCount=0;
let perfScale=1;
function addParticle(type,x,y,vx,vy,life,size,r,g,b){
  const i=fHead; fHead=(fHead+1)%MAXPART;
  if(!flife[i]) fCount++;
  ftype[i]=type; fx[i]=x; fy[i]=y; fvx[i]=vx; fvy[i]=vy;
  flife[i]=life; fmax[i]=life; fsize[i]=size;
  fcr[i]=r; fcg[i]=g; fcb[i]=b;
  fzh[i]=0;
}
function addAirPuff(x,y,h,vx,vy,life,size,r,g,b){
  addParticle(1,x,y,vx,vy,life,size,r,g,b);
  fzh[(fHead-1+MAXPART)%MAXPART]=h;
}
/* ============================================================================
   SUPERWEAPON DETONATION — true destruction.
   One call delivers the whole strategic-weapon contract: blinding flash, a
   dome of three thousand GPU sparks, double shockwave, mushroom column, a
   crater deep enough to read as a bowl, every derelict block and tree inside the ring
   levelled through the SAME damage paths the rest of the game uses (so
   salvage, staged skyscraper collapse and district bonuses all still apply),
   an ember field that cools over a minute, and smouldering aftermath smoke.
   pow ~ 1.0 is a tactical nuke; scale up for campaign-enders.
   ============================================================================ */
let _superT=0;
/* ---------------------------------------------------------------------------
   SINGULARITY WEAPONS — the Machine Ascendancy's answer to the warhead.
   Where every other faction burns a target, the machines DELETE it: a staged
   collapse that darkens the sky, drags the battlefield inward along an
   accretion spiral, then crushes everything past the horizon and leaves a
   void bore where the ground used to be. Terrain devastation is the
   point: the crater is deeper than any warhead's and the scar burns violet.
   --------------------------------------------------------------------------- */
const singularities=[];
function teamFacKeyFor(team){
  try{
    if(team===0) return playerFaction;
    if(typeof AI!=='undefined'&&AI&&AI.fac) return AI.fac;
  }catch(e){}
  return 'nova';
}
function spawnSingularity(x,y,pow,team){
  singularities.push({x,y,pow:pow||1,team:team==null?2:team,t:0,phase:0,fed:0});
  sfx('alarm'); shake=Math.max(shake,3);
  if(typeof toast==='function') toast('◐ SINGULARITY FORMING — gravity well expanding');
}
function updateSingularities(dt){
  let attrSet=false;
  for(let i=singularities.length-1;i>=0;i--){
    const S=singularities[i]; S.t+=dt;
    const R=170*Math.sqrt(S.pow), dur=2.5;
    if(S.phase===0){
      /* IMPLOSION. The well feeds: loose matter streams in along the spiral,
         units are dragged off their paths, the core light collapses inward. */
      if(typeof gpfxAttr!=='undefined'&&!attrSet){
        gpfxAttr[0]=S.x; gpfxAttr[1]=16; gpfxAttr[2]=S.y;
        gpfxAttr[3]=0.8+1.6*(S.t/dur); attrSet=true;
      }
      if(typeof gpfxBurst==='function'&&(S.fed+=dt)>0.05){
        S.fed=0;
        const a2=rr(0,TAU), d2=rr(R*0.7,R*1.5);
        gpfxBurst(S.x+Math.cos(a2)*d2,S.y+Math.sin(a2)*d2,rr(3,26),26,
          {speed:14,up:0.15,life:2.6,col:[186,158,255],size:6.6,drag:0.999,jit:5});
        gpfxBurst(S.x+Math.cos(a2+2.1)*d2*0.8,S.y+Math.sin(a2+2.1)*d2*0.8,rr(2,20),16,
          {speed:10,up:0.1,life:2.2,col:[255,244,255],size:5.2,drag:0.999,jit:4});
      }
      /* Pull must actually relocate hostiles. 150 u/s plus free pathing let
         units walk out, so the well read as a static hole. Stun + interrupt
         keep them in the spiral until the 2.5s collapse. Friendlies stay out
         — this is the robotic signature, not a friendly-fire toy. */
      const grip=Math.min(1,S.t/0.45);
      forUnitsIn(S.x,S.y,R*1.65,j=>{
        if(uteam[j]===S.team) return;
        const dx=S.x-ux[j],dy=S.y-uy[j],d3=Math.hypot(dx,dy)||1;
        const pull=grip*dt*(320*S.pow)*(1-Math.min(1,d3/(R*1.65)))*(TYPES[utype[j]].air?1.5:1);
        ux[j]+=dx/d3*pull; uy[j]+=dy/d3*pull;
        ustun[j]=Math.max(ustun[j],0.45);
        utgt[j]=-1; if(ustate[j]!==0) ustate[j]=0;
        if(d3<R*0.38) dealDamage(j,480*dt*S.pow,S.team,-1);
      });
      if(S.t>=dur) S.phase=1;
    } else if(S.phase===1){
      /* COLLAPSE. Past the horizon nothing argues. Canonical damage paths so
         salvage, staged skyscraper shears and district bonuses all apply —
         and the ground itself is DEVOURED: a void bore half again deeper
         than a warhead crater. The bowl stays dry — hydrology is authored. */
      S.phase=2; S.t=0;
      addParticle(0,S.x,S.y,0,0,.36,R*2.1, 232,214,255);
      addParticle(3,S.x,S.y,0,0,.7,R*1.15, 190,150,255);
      addParticle(3,S.x,S.y,0,0,1.15,R*1.9, 140,90,235);
      addParticle(8,S.x,S.y,rr(-2,2),0,3.0,R*0.4, 210,190,240);
      if(typeof gpfxBurst==='function'){
        gpfxBurst(S.x,S.y,10,typeof gpfxN==='function'?gpfxN(520,80):420,{speed:340*Math.sqrt(S.pow),up:0.55,life:1.9,col:[196,164,255],size:8.4,drag:0.968,jit:5});
        gpfxBurst(S.x,S.y,8,typeof gpfxN==='function'?gpfxN(340,60):260,{speed:210*Math.sqrt(S.pow),up:1.15,life:2.6,col:[255,250,255],size:7.0,drag:0.982,jit:4});
        gpfxBurst(S.x,S.y,14,typeof gpfxN==='function'?gpfxN(180,40):140,{speed:420*Math.sqrt(S.pow),up:0.22,life:1.15,col:[232,214,255],size:5.6,drag:0.94,jit:3});
      }
      deformTerrain(S.x,S.y,R*0.68, 0.30*S.pow, 'blast');
      addCrater(S.x,S.y,R*0.52);
      if(typeof addGroundBurn==='function'){
        addGroundBurn(S.x,S.y,R*1.05,2);
        for(let k=0;k<4;k++){ const a3=rr(0,TAU),d4=rr(R*0.5,R*0.95);
          addGroundBurn(S.x+Math.cos(a3)*d4,S.y+Math.sin(a3)*d4,rr(22,46),2); }
      }
      forUnitsIn(S.x,S.y,R,j=>{
        if(uteam[j]===S.team) return;
        dealDamage(j,(2300*S.pow)*(1-0.5*Math.sqrt(dist2(S.x,S.y,ux[j],uy[j]))/R),S.team,-1);
      });
      for(let b2=0;b2<blds.length;b2++){ const Bd=blds[b2];
        if(Bd.alive&&Bd.team!==S.team&&dist2(S.x,S.y,Bd.x,Bd.y)<R*R)
          damageBld(b2,(2900*S.pow)*(1-0.5*Math.sqrt(dist2(S.x,S.y,Bd.x,Bd.y))/R),S.team);
      }
      for(const Rl of relics){ if(!Rl.alive) continue;
        const d2r=dist2(S.x,S.y,Rl.x,Rl.y); if(d2r>R*R) continue;
        damageRelic(Rl,(3400*S.pow)*(1-0.5*Math.sqrt(d2r)/R),S.team);
      }
      for(let k=trees.length-1;k>=0;k--)
        if(dist2(S.x,S.y,trees[k].x,trees[k].y)<R*R*0.9) trees.splice(k,1);
      shake=Math.max(shake,16*S.pow);
      sfx('boom',S.x,S.y,2.8);
    } else {
      /* Afterglow ring dissipates, well closes. */
      if(S.t>0.6) singularities.splice(i,1);
    }
  }
  if(!attrSet&&typeof gpfxAttr!=='undefined') gpfxAttr[3]=0;
}
function superDetonation(x,y,pow,byTeam){
  pow=pow||1;
  /* Shooter faction, not victim. spawnExplosion used to pass the opposite
     team, so a Nova cluster on Syndicate/Legion ground inherited their
     singularity — pull/stun instead of blast. Legion + Syndicate keep the
     robotic well; Nova stays a warhead. */
  const fac=typeof mfCombatFactionTeam==='function'?mfCombatFactionTeam(byTeam):teamFacKeyFor(byTeam);
  if(!_superT&&(fac==='legion'||fac==='syndicate')){ spawnSingularity(x,y,pow,byTeam); return; }
  const R=210*Math.sqrt(pow);
  _superT=1;                                    // guard against recursion
  addParticle(0,x,y,0,0,.30,R*1.9, 255,252,240);          // sky-wide flash
  addParticle(6,x,y,rr(-3,3),rr(-6,-2),1.1,R*0.85, 255,255,255);
  addParticle(8,x,y,rr(-2,2),0,3.6,R*0.55, 255,255,255);  // mushroom column
  addParticle(3,x,y,0,0,.55,R*0.9, 255,190,110);          // first ring
  addParticle(3,x,y,0,0,1.05,R*1.6, 255,150,80);          // second, wider ring
  if(typeof gpfxBurst==='function'){
    gpfxBurst(x,y,8,480,{speed:260*Math.sqrt(pow),up:0.9,life:2.2,col:[255,214,120],size:8.2,drag:0.975,jit:8});
    gpfxBurst(x,y,6,380,{speed:150*Math.sqrt(pow),up:1.4,life:2.8,col:[255,120,40],size:9.4,drag:0.985,jit:6});
    gpfxBurst(x,y,10,280,{speed:340*Math.sqrt(pow),up:0.35,life:1.2,col:[255,255,235],size:5.8,drag:0.955,jit:4});
  }
  deformTerrain(x,y,R*0.72, 0.20*pow, 'blast');                    // deep dry bowl; hydrology stays authored
  addCrater(x,y,R*0.58);
  if(typeof addGroundBurn==='function'){
    addGroundBurn(x,y,R*1.15,1);
    for(let k=0;k<5;k++){ const a2=rr(0,TAU),d2=rr(R*0.5,R*1.05);
      addGroundBurn(x+Math.cos(a2)*d2,y+Math.sin(a2)*d2,rr(26,60),1); }
  }
  /* Everything inside the ring dies through the normal paths. */
  forUnitsIn(x,y,R,j=>{
    dealDamage(j,(1900*pow)*(1-0.65*Math.sqrt(dist2(x,y,ux[j],uy[j]))/R),2,-1);
  });
  for(const B of blds){ if(!B.alive) continue;
    const d2b=dist2(x,y,B.x,B.y); if(d2b>R*R) continue;
    damageBld(B,(2600*pow)*(1-0.6*Math.sqrt(d2b)/R),byTeam==null?2:byTeam);
  }
  for(const Rl of relics){ if(!Rl.alive) continue;
    const d2r=dist2(x,y,Rl.x,Rl.y); if(d2r>R*R) continue;
    damageRelic(Rl,(3200*pow)*(1-0.55*Math.sqrt(d2r)/R),byTeam==null?2:byTeam);
  }
  /* Forests are levelled: felled trees become debris, not decoration. */
  for(let i=trees.length-1;i>=0;i--){ const T2=trees[i];
    if(dist2(x,y,T2.x,T2.y)<R*R*0.92){
      if(Math.random()<0.5) addParticle(5,T2.x,T2.y,rr(-40,40),rr(-30,-70),0.8,4, 120,90,50);
      trees.splice(i,1);
    }
  }
  for(let k=0;k<6;k++)
    rubbles.push({x:x+rr(-R*0.5,R*0.5),y:y+rr(-R*0.5,R*0.5),s:rr(20,42),ts:stats.t});
  if(typeof requestShake==='function') requestShake(x,y,14*(pow||1),'blast');
  else shake=Math.max(shake,14*pow);
  sfx('boom',x,y,2.6); sfx('alarm');
  _superT=0;
}
function towerFxQ(){
  /* Preset density, not the FPS scaler. HIGH keeps the full masonry bowl;
     MEDIUM drops GPU bursts; LOW is dust + a few flames. */
  const q=typeof qualityKey==='function'?qualityKey():'high';
  if(q==='low') return 0.32;
  if(q==='medium') return 0.58;
  return 1.0;
}
function towerCrumble(x,y,s,civic){ spawnBuildingCollapse(x,y,s,civic); }
function spawnBuildingCollapse(x,y,s,civic){
  /* Masonry death. spawnExplosion always emits a type-3 fireball (vehicle
     mushroom); towers that used it popped into a tank blast. Dust, debris
     shards and a bowl of embers — the hull shader already goes charcoal. */
  const q=towerFxQ();
  const fx=perfScale*q;
  const sz=Math.max(12, Math.min(s, 52));
  addParticle(0,x,y,0,0,.12,sz*0.78, 210,196,168);
  addParticle(2,x,y,0,0,1.55,sz*1.45, 148,142,130);
  const nd=Math.round((5+sz*0.24)*fx);
  for(let k=0;k<nd;k++){
    const a=Math.random()*TAU, sp=8+Math.random()*18;
    addParticle(7,x,y,Math.cos(a)*sp,Math.sin(a)*sp,.36+Math.random()*.28,Math.min(11,sz*(0.16+Math.random()*0.12)), 160,150,132);
  }
  const nk=Math.round((4+sz*0.16)*fx);
  for(let k=0;k<nk;k++){
    const a=Math.random()*TAU, d=Math.random()*sz*0.48;
    addParticle(1,x+Math.cos(a)*d,y+Math.sin(a)*d,rr(-12,12),rr(-24,-6),1.3+Math.random()*.8,sz*0.30, 50,44,38);
  }
  if(civic && typeof addGroundBurn==='function')
    addGroundBurn(x,y,sz*1.15,1);
  if(q>0.40 && typeof gpfxBurst==='function')
    gpfxBurst(x,y,8, Math.round((civic?18:14)*fx),
      {speed:22, up:0.55, life:0.72, col:[168,158,140], size:6.4, drag:0.90, jit:4});
}
function spawnCivicWreckFire(x,y,s){
  /* Coals + smoke. Type-4 used to plant upright licking-flame quads that
     lived 16–30s. Heat lives in addGroundBurn + a short GPU ember spray. */
  const q=towerFxQ(), fx=perfScale*q;
  if(typeof addGroundBurn==='function')
    addGroundBurn(x,y,Math.max(s*0.85,22),1);
  addParticle(1, x+rr(-s*0.2,s*0.2), y+rr(-s*0.2,s*0.2), rr(-3,3), rr(-12,-6), 3.8, s*0.32, 42, 34, 28);
  if(q>0.35)
    addParticle(1, x+rr(-s*0.28,s*0.28), y+rr(-s*0.22,s*0.22), rr(-4,4), rr(-16,-8), 2.6, s*0.24, 48, 40, 34);
  if(q>0.40 && typeof gpfxBurst==='function')
    gpfxBurst(x, y, 5, Math.round(16*fx),
      {speed:7, up:0.18, life:0.72, col:[255,118,36], size:6.2, drag:0.94, jit:3.2});
}
function spawnExplosion(x,y,size,victimTeam){
  const civic=typeof cityGroundAt==='function' && cityGroundAt(x,y)>=1;
  /* City hits were bleaching the whole district: a building-scale size fed a
     flash and mushroom that filled the phone screen. Cap BEFORE the
     superweapon handoff — Factory/HQ death used to skip this and nuke
     the map. Lingering burn is a separate stamp. */
  const sz=civic?Math.min(size,13):size;
  if(sz>=40&&!_superT){ superDetonation(x,y,sz/44,victimTeam); return; }
  if(sz>=16) addGroundBurn(x,y,sz*2.1,1);
  else if(sz>=8) addGroundBurn(x,y,sz*(civic?3.2:1.7),civic?1:0);
  else if(civic&&sz>=5) addGroundBurn(x,y,sz*3.0,1);
  addParticle(0,x,y,0,0,civic?.12:.2,sz*(civic?1.15:1.55), 255,civic?210:240,civic?150:200);
  addParticle(6,x,y,0,0,.38+sz*0.010,Math.min(22,sz*(civic?1.05:1.45)), 255,255,255);
  addParticle(3,x,y,0,0,civic?.22:.42,sz*(civic?0.7:1.2), 255,180,90);
  if(sz>=24&&!civic) addParticle(8,x,y,rr(-2,2),0,2.3,sz, 255,255,255);
  const ns=Math.round((civic?1:2+sz*0.3)*perfScale);
  for(let k=0;k<ns;k++){
    const a=Math.random()*TAU, sp=(8+Math.random()*14)*(civic?0.5:1);
    addParticle(5,x,y,Math.cos(a)*sp,Math.sin(a)*sp,.18+Math.random()*.16,2.2+Math.random()*1.4, 255,200,120);
  }
  if(sz>=12&&!civic){
    const nd=Math.round((1+sz*0.18)*perfScale);
    for(let k=0;k<nd;k++){
      const a=Math.random()*TAU, sp=10+Math.random()*16;
      addParticle(7,x,y,Math.cos(a)*sp,Math.sin(a)*sp,.28+Math.random()*.22,Math.min(8,sz*(0.18+Math.random()*0.12)), 168,148,122);
    }
  }
  if(civic){
    const nf=Math.max(2, Math.round((2+sz*0.16)*perfScale));
    for(let k=0;k<nf;k++){
      const a=Math.random()*TAU, d=Math.random()*sz*0.55;
      addParticle(0,x+Math.cos(a)*d,y+Math.sin(a)*d,0,0,
        .32+Math.random()*.18, Math.min(8,sz*(0.38+Math.random()*0.22)), 255, 152, 52);
    }
  }
  const nk=Math.round(((civic?1:2)+sz*0.12)*perfScale);
  for(let k=0;k<nk;k++){
    const a=Math.random()*TAU, d=Math.random()*sz*0.5;
    addParticle(1,x+Math.cos(a)*d,y+Math.sin(a)*d,rr(-8,8),rr(-16,-6),1.15+Math.random()*.85,sz*(civic?0.36:0.68), civic?44:105,civic?34:105,civic?28:110);
  }
  if(typeof gpfxEnergyBlast==='function'&&sz>=8)
    gpfxEnergyBlast(x,y,8,civic?8:14+sz*0.45,[255,200,110],{speed:38+sz*1.3,up:0.52,life:0.78,size:6.4,min:4});
  /* Civic hits are capped at 13 above, so they never reach this. size>=40
     already handed off to superDetonation. 18 is a Goliath hull. */
  if(sz>=18&&typeof requestShake==='function')
    requestShake(x,y,sz>=30?10:6+sz*0.16,'blast');
}
function updParticles(dt){
  /* Ring-buffer scan of all 9000 slots. Later FX slice: live-index list so
     tick/draw are O(live). Civic explosion caps and type-4 flame clamp stay. */
  for(let i=0;i<MAXPART;i++){
    if(!flife[i]) continue;
    flife[i]-=dt;
    if(flife[i]<=0){ flife[i]=0; fCount--; continue; }
    const tp=ftype[i];
    /* Flash, ring, flame and fireball stay on the hit / hull. Integrating
       leftover velocity walked burning wreckage into a drifting orange swarm. */
    if(tp!==0&&tp!==3&&tp!==4&&tp!==6){
      fx[i]+=fvx[i]*dt; fy[i]+=fvy[i]*dt;
    }
    if(tp===2||tp===5||tp===7){ fvx[i]*=0.82; fvy[i]*=0.82; }
    else if(tp===1||tp===8||tp===10){ fsize[i]+=dt*(tp===8?6.5:tp===10?8:9); }
    else if(tp===4){
      /* Coals stay put. Growing them like a torch made leftover type-4
         read as licking flames even after the sprite swap. */
    }
  }
}

/* Per-biome ambience: snow, ash and drifting sand spawn across the camera's
   current viewport as type-9 particles. Purely cosmetic, so the whole system
   shuts off below 40% perfScale where the budget belongs to combat FX. */
let wxT=0;
function weatherTick(dt){
  if(perfScale<=0.4) return;
  wxT+=dt;
  if(wxT<0.10) return;
  wxT=0;
  const TH=THEMES[curTheme]||THEMES.verdant;
  const B=typeof camBounds==='function'?camBounds():null;
  if(!B) return;
  const w=B.x1-B.x0, h=B.y1-B.y0;
  const n=Math.round(clamp(w*h/(1100*1100),0.8,5)*perfScale);
  const lava=TH.water==='lava', ice=TH.water==='ice', dusk=TH.water==='dusk';
  for(let i=0;i<n;i++){
    const x=clamp(B.x0+Math.random()*w,0,MAP), y=clamp(B.y0+Math.random()*h,0,MAP);
    if(lava) addParticle(9,x,y,rr(-5,5),rr(16,28),3+Math.random()*2.5,3.5+Math.random()*3, 56,50,48);
    else if(ice) addParticle(9,x,y,rr(-4,4),rr(9,16),4+Math.random()*3,2.4+Math.random()*2, 238,246,254);
    else if(dusk) addParticle(9,x,y,rr(16,30),rr(-4,4),2.5+Math.random()*2,3+Math.random()*3, 208,170,118);
    else addParticle(9,x,y,rr(-12,12),rr(24,40),1.8+Math.random()*1.4,1.8+Math.random()*1.4, 168,200,232);
  }
}

// ---------- unit tick ----------
/* Separation samples the current bucket plus all eight neighbours. The old
   loop inspected at most five entries from ONLY the current bucket, and ignored
   d2===0, so two units on opposite sides of a bucket edge (or at the exact same
   coordinates) formed a stable permanent stack.

   Work is bounded per bucket rather than by the population of the cell. That
   keeps a 10k-unit infestation mobile-safe while guaranteeing that an adjacent
   bucket gets a chance even when the current one is crowded. Results live in
   scratch scalars to avoid allocating a vector for every unit every frame. */
const SEP_CX=[0,-1,1,0,0,-1,1,-1,1], SEP_CY=[0,0,0,-1,1,-1,-1,1,1];
const SEP_FORCE=90;
let sepVX=0,sepVY=0,sepVisited=0,sepHits=0;
function unitSeparation(i,T,isBug,swarmLOD,total){
  sepVX=0;sepVY=0;sepVisited=0;sepHits=0;
  const cx=clamp(ux[i]/CS|0,0,GW-1),cy=clamp(uy[i]/CS|0,0,GW-1);
  /* 1000-pop mid-tier used the small-army 5/12 neighborhood walk. That was
     the measured JS hotspot (CDP ~197ms/3.5s at 987 live). Tighten at 800,
     not 6000 — theatre cap is 1000/seat, not 10k. */
  const perCell=isBug&&swarmLOD?1:total>15000?1:total>6000?2:total>800?3:5;
  const hitCap=isBug&&swarmLOD?3:total>15000?4:total>6000?6:total>800?8:12;
  for(let c=0;c<9&&sepHits<hitCap;c++){
    const gx=cx+SEP_CX[c],gy=cy+SEP_CY[c];
    if(gx<0||gy<0||gx>=GW||gy>=GW) continue;
    let j=gHead[gy*GW+gx],cellN=0;
    while(j>=0&&cellN<perCell&&sepHits<hitCap){
      cellN++;sepVisited++;
      if(j!==i){
        const N=TYPES[utype[j]];
        /* Units only share collision space with their own movement medium:
           aircraft avoid aircraft, ships avoid ships, ground avoids ground. */
        if(!!N.air===!!T.air&&(T.air||!!N.naval===!!T.naval)){
          let dx=ux[i]-ux[j],dy=uy[i]-uy[j],d2=dx*dx+dy*dy;
          const ally=uteam[j]===uteam[i];
          /* `r` is tuned for combat reach and is intentionally smaller than
             several rendered hulls. Separation uses the visible half-width so
             technically non-overlapping collision circles do not still look
             like one fused tank in the top-down camera. */
          const ir=Math.max(T.r,T.size*0.54),jr=Math.max(N.r,N.size*0.54);
          const rs=(ir+jr)*(ally?1:0.82)+(ally?2:0);
          if(d2<rs*rs){
            let nx2,ny2,d;
            if(d2<=0.001){
              /* An index-pair hash gives exact overlaps an equal/opposite,
                 deterministic escape direction instead of silently doing zero. */
              const lo=Math.min(i,j),hi=Math.max(i,j);
              const seed=(((lo+1)*73856093)^((hi+1)*19349663))>>>0;
              const a=(seed%6283)*0.001,sgn=i===lo?1:-1;
              nx2=Math.cos(a)*sgn;ny2=Math.sin(a)*sgn;d=0;
            }else{
              d=Math.sqrt(d2);nx2=dx/d;ny2=dy/d;
            }
            const crowd=isBug?0.38:(ally?1:0.68);
            const push=(rs-d)/rs*SEP_FORCE*crowd;
            sepVX+=nx2*push;sepVY+=ny2*push;sepHits++;
          }
        }
      }
      j=gNext[j];
    }
  }
  const mag=Math.hypot(sepVX,sepVY);
  const cap=isBug?24:Math.min(54,Math.max(26,T.spd+14));
  if(mag>cap){sepVX=sepVX/mag*cap;sepVY=sepVY/mag*cap;}
}
let tick=0;
const BROOD_MASS=28, BROOD_AURA=285;
let broodMassT=0;
function broodCriticalMassTick(dt){
  broodMassT-=dt; if(broodMassT>0) return;
  broodMassT=1.35;
  /* Wildlife and the Brood opponent both currently emerge through the hive
     team. Keeping the mechanic on the biological roster prevents a recolored
     machine from accidentally qualifying as a caster just because the enemy
     faction selector says Brood. */
  const fighters=[],casters=[];
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&uteam[i]===2){
    if(utype[i]===12||utype[i]===13) fighters.push(i);
    else if(utype[i]===UT_BROOD_CASTER) casters.push(i);
  }
  const desired=Math.min(7,Math.floor(fighters.length/BROOD_MASS));
  if(casters.length<desired){
    let seed=-1,best=0;
    /* Sample the mass rather than doing an all-pairs search. The spatial hash
       still verifies that the chosen body sits inside a genuine local crowd. */
    for(let n=0;n<fighters.length;n+=Math.max(1,(fighters.length/40)|0)){
      const i=fighters[n]; if(utype[i]!==12) continue;
      let local=0,led=false;
      forUnitsIn(ux[i],uy[i],225,j=>{
        if(uteam[j]!==2) return;
        if(utype[j]===12||utype[j]===13) local++;
        if(utype[j]===UT_BROOD_CASTER) led=true;
      });
      if(!led&&local>best){best=local;seed=i;}
    }
    if(seed>=0&&best>=BROOD_MASS){
      const x=ux[seed],y=uy[seed]; killUnit(seed,true);
      const c=spawnUnit(UT_BROOD_CASTER,2,x,y,
        (typeof broodIsEnemy==='function'&&broodIsEnemy())?populationDefaultSeat(1,x,y):undefined);
      if(c>=0){
        casters.push(c); ustate[c]=2; ubroodLed[c]=3;
        addParticle(3,x,y,0,0,.8,92,180,92,255);
        addParticle(3,x,y,0,0,1.25,150,92,230,155);
        for(let q=0;q<12;q++) addParticle(0,x,y,rr(-46,46),rr(-46,46),.55,5,178,255,96);
        if(typeof fogPointVisible!=='function'||fogPointVisible(x,y)){
          toast('☣ CRITICAL MASS — a Brood Tidecaster has formed');
          sfx('alarm',x,y,.72);
        }
      }
    }
  }
  /* A caster converts a loose crowd into one purposeful wave. It does not make
     units occupy the same point: staggered target offsets retain the existing
     soft separation while the entire tide advances on one strategic object. */
  for(const c of casters){
    if(!ualive[c]) continue;
    const bi=findEnemyBld(ux[c],uy[c],2,MAP*1.5);
    let tx=utx[c],ty=uty[c],tg=-1;
    if(bi>=0){tx=blds[bi].x;ty=blds[bi].y;tg=-2-bi;}
    else {
      const e=findEnemy(ux[c],uy[c],2,MAP*1.25);
      if(e>=0){tx=ux[e];ty=uy[e];tg=e;}
    }
    if(tg===-1&&bi<0) continue;
    const fld=requestField(tx,ty); let slot=0;
    forUnitsIn(ux[c],uy[c],BROOD_AURA,j=>{
      if(uteam[j]!==2||(utype[j]!==12&&utype[j]!==13&&utype[j]!==UT_BROOD_CASTER)) return;
      ubroodLed[j]=2.8;
      const lane=(slot++%7)-3,row=(slot/7|0);
      ustate[j]=2; utgt[j]=-1; utgtg[j]=-1; ufield[j]=fld; umarch[j]=1;
      utx[j]=clamp(tx+lane*15,20,MAP-20); uty[j]=clamp(ty+row*12,20,MAP-20);
    });
  }
}
function nearestOreNode(x,y,rad){
  let best=-1,bd=rad*rad;
  for(let d=0;d<deposits.length;d++){
    const D=deposits[d]; if(depositTier(D)<=0) continue;
    const dd=dist2(x,y,D.x,D.y); if(dd<bd){bd=dd;best=d;}
  }
  return best;
}
function supportUnitCap(team){
  if(team!==0) return 10;
  const lab=hasBld(0,'techlab')?2:0,automation=(typeof researched!=='undefined'&&researched.nano)?2:0;
  return Math.min(12,3+Math.floor(Math.max(0,heroLvl-1)/2)+lab+automation);
}
function supportUnitCount(team,includeQueues){
  let n=0;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&uteam[i]===team&&(utype[i]===UT_ENGINEER||utype[i]===UT_MINER)) n++;
  if(includeQueues) for(const B of bldLive) if(B.alive&&B.team===team&&B.queue)
    for(const q of B.queue) if(q===UT_ENGINEER||q===UT_MINER)n++;
  return n;
}
function nearestSupportBuilding(i,types,rad){
  let best=-1,bd=rad*rad;
  for(let b=0;b<blds.length;b++){
    const B=blds[b]; if(!B.alive||B.team!==uteam[i]||types.indexOf(B.type)<0)continue;
    const d=dist2(ux[i],uy[i],B.x,B.y);if(d<bd){bd=d;best=b;}
  }
  return best;
}
function redirectProspector(i){
  if(!ualive[i]||utype[i]!==UT_MINER)return false;
  let best=-1,bd=Infinity;
  for(const B of bldLive){
    if(!B.alive||B.team!==uteam[i]||B.type!=='mex'||B.dep<0||depositTier(deposits[B.dep])<=0)continue;
    const d=dist2(ux[i],uy[i],B.x,B.y);if(d<bd){bd=d;best=B.dep;}
  }
  if(best>=0){
    const D=deposits[best];umode[i]=0;uMineNode[i]=best;ustate[i]=2;utgt[i]=-1;
    utx[i]=D.x+rr(-30,30);uty[i]=D.y+rr(-30,30);ufield[i]=requestField(D.x,D.y);
    return true;
  }
  const h=nearestSupportBuilding(i,['hq','fac','airfield','harbor','tgate'],MAP*2);
  umode[i]=6;uMineNode[i]=-1;
  if(h>=0){const B=blds[h];ustate[i]=2;utx[i]=B.x+rr(-24,24);uty[i]=B.y+rr(-24,24);ufield[i]=requestField(B.x,B.y);return true;}
  return false;
}
function redirectProspectorsFromNode(dep,team){
  for(let i=0;i<unitHigh;i++)if(ualive[i]&&uteam[i]===team&&utype[i]===UT_MINER&&uMineNode[i]===dep){
    uMineNode[i]=-1;redirectProspector(i);
    if(team===0)toast('⛏ EXTRACTOR LOST — Prospector reassigned automatically');
  }
}
function deployExtractorMiner(B){
  if(!B||B.type!=='mex'||B.freeMiner)return -1;
  B.freeMiner=true;
  /* The Extractor's attached Prospector is part of the structure package and
     is never denied by the manual support cap. If grants push the roster over
     that cap, factories simply cannot recruit more support until Commander or
     Research Lab progression catches up. */
  const i=spawnUnit(UT_MINER,B.team,B.x+B.r+18,B.y+B.r*.45,commanderSlotForBuilding(B));
  if(i>=0){uMineNode[i]=B.dep;utx[i]=B.x;uty[i]=B.y;if(B.team===0)toast('⛏ PROSPECTOR DEPLOYED — MINE / ASSIST / SURVEY orders unlocked');}
  return i;
}
function prospectorAssistTick(i,dt){
  const range=145;
  let bi=nearestSupportBuilding(i,['hq','fac','airfield','harbor','tgate'],range);
  if(bi<0){
    if(ustate[i]===2&&dist2(ux[i],uy[i],utx[i],uty[i])>35*35)return false;
    bi=nearestSupportBuilding(i,['hq','fac','airfield','harbor','tgate'],MAP*2);
    if(bi<0)return false;
    const G=blds[bi];ustate[i]=2;utx[i]=G.x+rr(-28,28);uty[i]=G.y+rr(-28,28);ufield[i]=requestField(G.x,G.y);return false;
  }
  const B=blds[bi],a=Math.atan2(B.y-uy[i],B.x-ux[i]);umov[i]=0;uang[i]=a+Math.PI/2;
  B.tractorT=.18;B.tractorN=Math.min(2,(B.tractorFrame===tick?(B.tractorN||0)+1:1));B.tractorFrame=tick;
  const mx=ux[i]+Math.cos(a)*TYPES[UT_MINER].size*.55,my=uy[i]+Math.sin(a)*TYPES[UT_MINER].size*.55;
  /* Same clamped-beam case as the extraction laser: LABOUR holds on a build
     site for its whole duration, so the weapon burst saturates there too. */
  addBeam(mx,my,B.x,B.y,3.2,90,225,255,.11,'mining');
  if(B.type==='hq'&&uteam[i]<2){resM[uteam[i]]=Math.min(RES_MCAP[uteam[i]],resM[uteam[i]]+.42*dt);resE[uteam[i]]=Math.min(RES_ECAP[uteam[i]],resE[uteam[i]]+1.8*dt);}
  return true;
}
function prospectorSurveyTick(i,dt){
  let di=uMineNode[i],bit=1<<Math.min(2,uteam[i]);
  if(di<0||depositTier(deposits[di])<=0||((deposits[di].surveyed||0)&bit)){
    let best=-1,bd=Infinity;
    for(let d=0;d<deposits.length;d++){
      const D=deposits[d];if(depositTier(D)<=0||((D.surveyed||0)&bit))continue;
      const dd=dist2(ux[i],uy[i],D.x,D.y);if(dd<bd){bd=dd;best=d;}
    }
    if(best<0){umode[i]=6;return redirectProspector(i);}
    di=uMineNode[i]=best;const D=deposits[di];ustate[i]=2;utx[i]=D.x+50;uty[i]=D.y;ufield[i]=requestField(D.x,D.y);return false;
  }
  const D=deposits[di];if(dist2(ux[i],uy[i],D.x,D.y)>110*110)return false;
  D.surveyed=(D.surveyed||0)|bit;uMineT[i]=1.5;
  addParticle(3,D.x,D.y,0,0,.8,155,80,225,255);if(typeof mmPing==='function')mmPing(D.x,D.y);
  if(uteam[i]===0){credit(0,35+depositTier(D)*15,0,uCmd[i]>=0?uCmd[i]:null);toast('⌾ SURVEY COMPLETE — Tier '+depositTier(D)+' phase field charted');sfx('notify',D.x,D.y,.8);}
  uMineNode[i]=-1;return true;
}
function minerUnitTick(i,dt){
  if(umode[i]===6)return prospectorAssistTick(i,dt);
  if(umode[i]===7)return prospectorSurveyTick(i,dt);
  const R=125,existing=uMineNode[i];
  let di=existing>=0&&depositTier(deposits[existing])>0?existing:-1;
  if(di<0||dist2(ux[i],uy[i],deposits[di].x,deposits[di].y)>R*R) di=nearestOreNode(ux[i],uy[i],R);
  if(di<0){uMineNode[i]=-1;if(!redirectProspector(i))return false;return false;}
  const D=deposits[di];
  /* A fresh move order always wins. The Prospector only locks onto the field
     after arriving, so it cannot feel as if it ignored the player's drag. */
  if(ustate[i]===2&&dist2(ux[i],uy[i],utx[i],uty[i])>30*30&&dist2(utx[i],uty[i],D.x,D.y)>R*R) return false;
  uMineNode[i]=di; umov[i]=0;
  const a=Math.atan2(D.y-uy[i],D.x-ux[i]); uang[i]=a+Math.PI/2;
  const mx=ux[i]+Math.cos(a)*TYPES[utype[i]].size*.55,my=uy[i]+Math.sin(a)*TYPES[utype[i]].size*.55;
  const tier=depositTier(D),col=tier===3?[205,105,255]:tier===2?[80,255,165]:[80,220,255];
  /* 'mining', not 'laser': a beam clamped on one point forever must not use
     the weapon terminus burst. See the sty==='mining' branch in render3d.js. */
  addBeam(mx,my,D.x+Math.cos(D.pulse||0)*5,D.y+Math.sin(D.pulse||0)*5,3.4,col[0],col[1],col[2],.11,'mining');
  addParticle(0,D.x+rr(-9,9),D.y+rr(-9,9),rr(-5,5),rr(-14,-4),.25,4,col[0],col[1],col[2]);
  uMineT[i]-=dt;
  if(uMineT[i]<=0){
    uMineT[i]=.68; const before=D.tier,got=drainDeposit(D,1.15);
    if(uteam[i]<2) resM[uteam[i]]=Math.min(RES_MCAP[uteam[i]],resM[uteam[i]]+got);
    if((tick+i)%9===0) sfx('laser',ux[i],uy[i],.42);
    if(uteam[i]===0&&D.tier!==before){
      toast(D.tier?'◇ MOBILE MINING — field dropped to Tier '+D.tier:'◇ MOBILE MINING — field depleted');
      sfx('notify',D.x,D.y,.7);
    }
    if(D.tier===0)redirectProspector(i);
  }
  return true;
}
/* Tick LOD. 0 Full = every simDt (commanders, selected, in-weapon-range,
   on-screen combat). 1 March = off-screen umarch at 2×, skip sep/FX.
   2 Idle = off-screen ustate 0, no target, at 4×, no sep/acquire.
   Far wildlife keeps the team-2 half-rate. HP/stun/burn always use simDt.
   Missing camBounds (boot/tests) treats the unit as on-screen so sep still runs. */
function unitOnCam(x,y,B){
  return !B || (x>=B.x0 && x<=B.x1 && y>=B.y0 && y<=B.y1);
}
function unitInWeaponRange(i,T){
  const tg=utgt[i];
  if(tg===-1||!T) return false;
  let ex,ey,tr=0;
  if(tg>=0){ if(!ualive[tg]) return false; ex=ux[tg]; ey=uy[tg]; tr=TYPES[utype[tg]].r||0; }
  else if(isRelicTg(tg)){ const R=relics[relicOf(tg)]; if(!R||!R.alive) return false; ex=R.x; ey=R.y; tr=(R.s||0)*0.45; }
  else { const Bld=blds[-2-tg]; if(!Bld||!Bld.alive) return false; ex=Bld.x; ey=Bld.y; tr=Bld.r||0; }
  const rng=(T.rng||0)+tr;
  return dist2(ux[i],uy[i],ex,ey)<=rng*rng;
}
function unitTickLod(i,T,onScreen){
  if(!T||T.cat==='hero'||i===heroIdx||isEnemyCommander(i)||usel[i]) return 0;
  if(unitInWeaponRange(i,T)) return 0;
  if(onScreen && utgt[i]!==-1) return 0;
  if(!onScreen && umarch[i]===1) return 1;
  if(!onScreen && ustate[i]===0 && utgt[i]===-1) return 2;
  return 0;
}
function unitTick(dt){
  const _hotT0=(typeof performance!=='undefined'&&performance.now)?performance.now():0;
  /* Teleports (jump jets, terrain rescue) write ux/uy outside this loop.
     Relink is a cell compare; no-op unless the bucket changed. Do not skip
     HP / stun / burn / commanders to "save" this pass. */
  for(let gi=0;gi<unitHigh;gi++) if(ualive[gi]) gridRelink(gi);
  tickMoveCohorts();
  broodCriticalMassTick(dt);
  /* Patrol planning lives in input.js, which loads after the simulation. The
     guarded call preserves boot/replay tooling that evaluates sim.js alone. */
  if(typeof tickPatrolRoutes==='function')tickPatrolRoutes(dt);
  const total=teamCount[0]+teamCount[1]+teamCount[2];
  const acqMod=total>20000?34:total>15000?24:total>6000?14:6;
  /* Movement dust is gameplay feedback, so low FPS may thin it but may not
     delete it. At battle scale the wider cadence bounds the live particle
     count; type 10 lets the renderer retain a representative tactical trail
     without also retaining every ambient smoke puff. */
  const dustMod=total>4000?83:total>1400?47:19;
  const dustStride=Math.max(1,Math.round(dustMod*(perfScale<.42?2.2:1)));
  const swarmLOD=teamCount[2]>3000;              // hiveworld: bugs half-rate, double-dt
  const dtBase=dt, dtBug=dt*2;
  const camB=typeof camBounds==='function'?camBounds():null;
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]) continue;
    const isBug=uteam[i]===2;
    const T=TYPES[utype[i]];
    if(T&&T.air&&uhp[i]<=0&&!uCrash[i]){ beginAirCrash(i); }
    if(uCrash[i]){ airCrashTick(i,dtBase); continue; }
    const onScreen=unitOnCam(ux[i],uy[i],camB);
    const lod=unitTickLod(i,T,onScreen);
    const farWild=isBug&&swarmLOD&&lod!==0;
    if(unitIsBrood(i)&&((i+tick*13)&4095)===0)
      sfx('cre_idle',ux[i],uy[i],clamp(T.size/20,0.65,1.5));
    if(farWild&&((i+tick)&1)) continue;          // existing team-2 half-rate
    if(farWild) dt=dtBug; else dt=dtBase;
    if(ucool[i]>0) ucool[i]-=dt;
    if(ubuff[i]>0) ubuff[i]-=dt;
    if(uclassBuffT[i]>0){uclassBuffT[i]-=dt;if(uclassBuffT[i]<=0){uclassBuffT[i]=0;uclassBuff[i]=0;}}
    if(ubroodLed[i]>0) ubroodLed[i]-=dt;
    if(uhaz[i]>0) uhaz[i]-=dt;
    if(ufireT[i]>0) ufireT[i]-=dt;
    if(ustomp[i]>0) ustomp[i]-=dt;
    if(ureclaim[i]>0) ureclaim[i]-=dt;
    if(uheal[i]>0) uheal[i]-=dt;
    if(umode[i]===3){
      uhp[i]-=uhpm[i]*0.050*dt;         // overdrive is HP — never lod-skip this
      if(uhp[i]<=uhpm[i]*0.12){ umode[i]=0; umodeT[i]=MODE_SWITCH*0.6; }
    }
    if(ustun[i]>0){
      ustun[i]-=dt;
      /* Held under EMP: no movement, no firing. The arc particle is what tells
         the player WHY a line of enemies has stopped, so it is not optional. */
      if(((i+tick)&7)===0) addParticle(0,ux[i],uy[i],rr(-14,14),rr(-14,14),.26,4,150,220,255);
      continue;
    }
    if(ushielded[i]>0) ushielded[i]-=dt;
    /* March/Idle drop sep/acquire/FX, not clocks. Burn particles stay on the
       skip path so incendiary readback does not vanish off-screen. */
    const lodSkip=!farWild&&((lod===1&&((i+tick)&1))||(lod===2&&((i+tick)&3)));
    if(lodSkip){
      if(ufireT[i]>0 && (i+tick)%6===0 && perfScale>0.4){
        addParticle(4,ux[i]+rr(-T.size*.2,T.size*.2),uy[i]+rr(-T.size*.2,T.size*.2),
          0,0,.55,T.size*0.45, 255,140,35);
        if((i+tick)%18===0) addParticle(1,ux[i]+rr(-3,3),uy[i]+rr(-3,3),
          rr(-2,2),rr(-8,-3),.7,T.size*0.3, 58,50,44);
      }
      continue;
    }
    if(!farWild&&lod===1) dt=dtBase*2;
    else if(!farWild&&lod===2) dt=dtBase*4;
    const skipSep=!farWild&&(lod===1||lod===2);
    const skipFx=!farWild&&lod===1;
    const skipAcq=!farWild&&lod===2;
    /* ---- FACTION HERO BEHAVIOURS ------------------------------------------
       Each hero does something its faction's army cannot, so killing it changes
       the shape of the fight rather than just removing a big health bar. */
    if(T.cat==='hero'){
      if(utype[i]===29){                       // ARCHON — projects the void bubble
        if(ustomp[i]<=0){
          ustomp[i]=0.5;
          forUnitsIn(ux[i],uy[i],SHIELD_R*1.6,j=>{ if(uteam[j]===uteam[i]) ushielded[j]=0.7; });
        }
      } else if(utype[i]===30){                // BROOD SOVEREIGN — Ravagers on THIS seat's 1000
        if(ustomp[i]<=0){
          ustomp[i]=6.0;
          /* Hero ability, not a factory: it never saw armyCap. Gate on the
             Sovereign's commander seat (uCmd / nearest aiBaseSlot), never a
             teamCount blob. Wildlife hives keep bugCap via seat===undefined. */
          const seat=uteam[i]===0?(uCmd[i]==null?POP_PLAYER_SLOT:uCmd[i])
            :uteam[i]===1?(uCmd[i]!=null&&uCmd[i]>=0?uCmd[i]:populationDefaultSeat(1,ux[i],uy[i]))
            :(typeof broodIsEnemy==='function'&&broodIsEnemy()
              ?(uCmd[i]!=null&&uCmd[i]>=0?uCmd[i]:populationDefaultSeat(1,ux[i],uy[i]))
              :undefined);
          if(populationCanSpawn(12,uteam[i],seat,ux[i],uy[i])){
            const room=seat===undefined?3
              :Math.max(0,populationCapForCommander(seat)-populationUsedForCommander(seat));
            const n=Math.min(3,room);
            for(let k=0;k<n;k++){
              const a=Math.random()*TAU, d=T.r+16+Math.random()*22;
              const bb=spawnUnit(12,uteam[i],ux[i]+Math.cos(a)*d,uy[i]+Math.sin(a)*d,seat);
              if(bb>=0){ ustate[bb]=2; utx[bb]=utx[i]; uty[bb]=uty[i]; ubuff[bb]=4; }
            }
          }
          if(perfScale>0.5) addParticle(3,ux[i],uy[i],0,0,0.5,T.r*1.6, 170,235,80);
        }
      } else if(utype[i]===28){                // PRAETOR — walking siege battery
        /* Target validation happens further down, so read the raw handle. */
        const ht=utgt[i];
        if(ustomp[i]<=0 && ht>=0 && ualive[ht]){
          ustomp[i]=5.5;
          for(let k=0;k<3;k++){
            const a=Math.random()*TAU, d=Math.random()*70;
            const mz=mfUnitMuzzle(i,k===1?-1:1);
            fireProj(9,uteam[i],mz[0],mz[1],ux[ht]+Math.cos(a)*d,uy[ht]+Math.sin(a)*d,
                     190,T.dmg*0.55,T.aoe*0.8,-1);
          }
          sfx('boom',ux[i],uy[i],1.1);
        }
      }
    }
    /* Bulwark shield pulse — now METERED.
       A 0.7 s shield refreshed every 0.5 s is a permanent 28% damage reduction
       for ninety mass, free, with no answer anywhere in the roster. It now runs
       off the grid: no energy, no bubble. That makes massed Bulwarks a real
       economic commitment and gives the opponent something to attack. */
    if(T.wk==='n' && utype[i]===11){
      if(ustomp[i]<=0){
        ustomp[i]=0.5;
        const up=(T.upkeepE||0)*0.5;
        if(uteam[i]>1 || resE[uteam[i]]>=up){
          if(uteam[i]<2) resE[uteam[i]]-=up;
          forUnitsIn(ux[i],uy[i],SHIELD_R,j=>{ if(uteam[j]===uteam[i]) ushielded[j]=0.7; });
        } else if(uteam[i]===0 && (tick&63)===0) stallE=0.8;
      }
    }
    /* ---- SUPPORT UNITS: Warden field medic & Constructor engineer -----------
       Both are unarmed (wk:'n'), so acquisition never owns them; these blocks
       are their entire combat role. The scan runs on a half-second cadence via
       ustomp, exactly like the hero abilities above, and picks the single most
       damaged friendly target so N supports in a crowd stay grid-local instead
       of each emitting a full-area scan every frame. */
    if(utype[i]===24){                                  // WARDEN — heals units
      if(ustomp[i]<=0){
        ustomp[i]=0.5;
        let best=-1,low=1,active=false;
        forUnitsIn(ux[i],uy[i],60,j=>{
          if(j!==i&&uteam[j]===uteam[i]&&uhp[j]<uhpm[j]*0.99){
            active=true;
            const f2=uhp[j]/uhpm[j];
            if(f2<low){low=f2;best=j;}
          }
        });
        if(active) uheal[i]=0.6;
        if(best>=0){
          uhp[best]=Math.min(uhpm[best],uhp[best]+4);   // 8 HP/s at the 0.5s cadence
          if(perfScale>0.4) addBeam(ux[i],uy[i],ux[best],uy[best],2.2,120,255,170,0.5,'repair');
        }
      }
      if(uheal[i]>0&&perfScale>0.45&&(i+tick)%5===0){
        const a=tick*1.35+(i%7);
        addParticle(0,ux[i]+Math.cos(a)*(T.r+3.5),uy[i]+Math.sin(a)*(T.r+3.5),0,0,.45,3.2,120,255,170);
        addParticle(0,ux[i]+Math.cos(a+Math.PI)*(T.r+5.5),uy[i]+Math.sin(a+Math.PI)*(T.r+5.5),0,0,.4,2.6,140,255,190);
      }
    } else if(utype[i]===19){                           // CONSTRUCTOR — repairs structures
      if(ustomp[i]<=0){
        ustomp[i]=0.5;
        let best=null,low=1,active=false;
        for(const B of bldLive){
          if(B.alive&&B.team===uteam[i]&&B.prog>=1&&B.hp<B.hpm*0.99
             &&dist2(ux[i],uy[i],B.x,B.y)<=70*70){
            active=true;
            const f2=B.hp/B.hpm;
            if(f2<low){low=f2;best=B;}
          }
        }
        if(active) uheal[i]=0.6;
        if(best){
          repairBld(best,7);                            // 14 HP/s at the 0.5s cadence
          if(perfScale>0.4){
            addBeam(ux[i],uy[i],best.x,best.y,2.6,150,235,120,0.5,'repair');
            if((tick&3)===0) addParticle(2,best.x+rr(-best.r*.5,best.r*.5),best.y+rr(-best.r*.5,best.r*.5),rr(-3,3),rr(-6,-1),.35,3,170,255,150);
          }
        }
      }
      if(uheal[i]>0&&perfScale>0.45&&(i+tick)%7===0)
        addParticle(2,ux[i]+rr(-6,6),uy[i]+rr(-6,6),rr(-4,4),rr(-10,-2),.4,2.8,150,235,120);
    }
    if(T.miner&&minerUnitTick(i,dt)) continue;
    // validate target
    let tg=utgt[i];
    if(tg>=0 && (!foeTgt(i,tg,utgtg[i])||!mfTargetAllowed(T,tg))){ tg=utgt[i]=-1; }
    else if(isRelicTg(tg)){ const R=relics[relicOf(tg)]; if(!R||!R.alive) tg=utgt[i]=-1; }
    else if(tg<=-2){ const B=blds[-2-tg]; if(!B||!B.alive) tg=utgt[i]=-1; }
    /* Move-only / retreat (ustate 1) must not keep a previous attack lock.
       Acquisition already skips this state, but a leftover utgt still made
       the hull chase and fire — which is why "click away" felt like target
       lock. Weapons stay silent until arrival; idle (state 0) may acquire. */
    if(ustate[i]===1){ tg=utgt[i]=-1; utgtg[i]=-1; }
    /* Queued waypoints and GUARD both rewrite the lock AND the goal, so they
       run after validation (a dead target must already read -1 here) and before
       acquisition (guard's search is anchored on the guarded thing, not on this
       unit, and must not be overwritten by the ordinary aggro sweep). */
    if(uQueue[i]) queueTick(i);
    if(ustate[i]===7) guardSteer(i,acqMod);
    tg=utgt[i];
    const md=umode[i];
    if(umodeT[i]>0) umodeT[i]-=dt;                 // deploying: locked mid-transition
    if(md===3){
      if((i+tick)%9===0&&perfScale>0.4&&uhp[i]>uhpm[i]*0.12)
        addParticle(1,ux[i],uy[i],rr(-4,4),rr(-14,-6),.5,3, 255,140,60);
    }
    const rngM=(uteam[i]===0?resRngMult:1)*modeRngMul(md)*classRngMul(i)*(uhaz[i]>0?HAZ_RNG:1);
    // staggered acquisition
    if(!skipAcq && T.wk!=='n' && (i+tick)%acqMod===0 && ustate[i]!==1 && ustate[i]!==6 && ustate[i]!==7){
      /* On the march, acquisition shrinks to self-defence range: the column
         shoots what is already on top of it and walks past the rest.
         HOLD used full aggro range then refused to walk, so units locked a
         target they could not shoot and looked like the button was dead. */
      const marching=umarch[i]===1;
      const holding=!!uhold[i];
      const aggro=holding ? T.rng*rngM
                 : marching ? Math.min(T.rng*rngM+20, 150)
                 : T.rng*rngM*AGGRO_MULT+AGGRO_ADD+(uteam[i]===2?120:0);
      let e=findEnemyDomain(ux[i],uy[i],uteam[i],aggro,T.targetMask,T.preferMask);
      // AI focus fire: finish wounded targets already in weapon range
      if(e>=0 && uteam[i]===1 && (teamCount[0]+teamCount[1])<4000){
        let low=1, li=-1;
        forUnitsIn(ux[i],uy[i],T.rng*rngM+30,j=>{
          if(intelCanTarget(j,uteam[i])&&mfTargetAllowed(T,j)){ const f2=uhp[j]/uhpm[j]; if(f2<low-0.18){ low=f2; li=j; } }
        });
        if(li>=0) e=li;
      }
      if(e>=0){ tg=utgt[i]=e; utgtg[i]=ugen[e]; }
      else if(tg===-1 && ustate[i]===2 && T.tg!=='air' && uteam[i]!==2 && !marching && !holding){
        const b=findEnemyBld(ux[i],uy[i],uteam[i],aggro+80);
        if(b>=0) tg=utgt[i]=-2-b;
      }
    }
    /* Player A-MOVE arrives here; AI waves still drop march earlier (340) in
       ai.js so they storm a base instead of walking onto the HQ pad. Patrol
       must keep march or each waypoint would become a chase. Drop BEFORE the
       goal rewrite so this tick walks toward the target, not the pad. */
    if(umarch[i]===1 && ustate[i]!==5 && uPatrolRoute[i]<0
       && dist2(ux[i],uy[i],utx[i],uty[i])<=18*18) umarch[i]=0;
    // goal
    let gx, gy, engaging=false, inRange=false, er=0;
    if(tg!==-1){
      let ex,ey,trad;
      if(tg>=0){ ex=ux[tg]; ey=uy[tg]; trad=TYPES[utype[tg]].r; }
      else if(isRelicTg(tg)){ const R=relics[relicOf(tg)]; ex=R.x; ey=R.y; trad=R.s*0.45; }
      else { const B=blds[-2-tg]; ex=B.x; ey=B.y; trad=B.r; }
      er=Math.sqrt(dist2(ux[i],uy[i],ex,ey));
      inRange = er <= T.rng*rngM+trad;
      engaging=true;
      /* Fire on the move: the turret tracks the target below, but the hull's
         goal remains the wave objective rather than whatever wandered into
         range. This is the difference between a column advancing under fire and
         a column stopping to skirmish. */
      if(umarch[i]===1||uhold[i]){ gx=utx[i]; gy=uty[i]; }
      else { gx=ex; gy=ey; }
      const ta=Math.atan2(ey-uy[i],ex-ux[i])+Math.PI/2;
      // turreted units: swivel turret fast, hull turns when moving
      let da=ta-uturr[i];
      while(da>Math.PI)da-=TAU; while(da<-Math.PI)da+=TAU;
      uturr[i]+=clamp(da,-8*dt,8*dt);
      if(!T.tur){
        let db=ta-uang[i];
        while(db>Math.PI)db-=TAU; while(db<-Math.PI)db+=TAU;
        uang[i]+=clamp(db,-6*dt,6*dt);
      }
      // fire
      if(inRange && ucool[i]<=0 && !(T.minRng && er<T.minRng)){
        const vet=1+uvet[i]*0.15;
        ucool[i]=T.cool*modeCoolMul(md)*classCoolMul(i)*broodCoolMul(i)/(ubuff[i]>0?1.4:1);
        if(md===4){ umode[i]=0; umodeT[i]=MODE_SWITCH*0.4; }   // firing breaks GHOST cover
        const facDmg=(typeof factionDoctrineAttackMul==='function')?factionDoctrineAttackMul(uteam[i],i):1;
        const dmg=T.dmg*vet*modeDmgMul(md)*classDmgMul(i)*broodDmgMul(i)*facDmg*mfDomainDamageMul(i,tg)*(ubuff[i]>0?1.5:1)*(uteam[i]===1?aiDmgMult:(uteam[i]===0?armyDmgMult*stimDmgMult*typeDmgMult[utype[i]]:1))*(i===heroIdx?heroDmgMult:1);
        const mz=mfUnitMuzzle(i);
        const mx=mz[0], my=mz[1];
        if(T.wk==='m'){
          // melee claw strike
          if(tg>=0){
            dealDamage(tg,dmg*dmgMul('m',utype[tg]),uteam[i],i,dmgMul('m',utype[tg]));
            if(T.aoe>0) forUnitsIn(ex,ey,T.aoe,j=>{ if(uteam[j]!==uteam[i]&&j!==tg) dealDamage(j,dmg*0.5*dmgMul('m',utype[j]),uteam[i],i); });
          } else if(isRelicTg(tg)) damageRelic(relics[relicOf(tg)],dmg*STM.m*(T.bldMul||1),uteam[i]);
          else damageBld(-2-tg,dmg*STM.m*(T.bldMul||1),uteam[i]);
          addParticle(0,ex,ey,0,0,.14,9, 255,190,90);
          addParticle(5,ex,ey,rr(-40,40),rr(-40,40),.25,4, 255,170,60);
          /* (tick+i), not i alone. A unit's slot index never changes, so `i&3`
             was not thinning a busy frame — it was permanently muting three
             quarters of the army, and WHICH three quarters was decided by
             allocation order. A five-unit raid party could fight a whole match
             in silence. Same 25% duty cycle, same per-frame call volume; only
             which unit gets the slot rotates. Matches the (tick+i)%9 idiom
             already used for tracer audio a few hundred lines up. */
          if(((tick+i)&3)===0) sfx(unitIsBrood(i)?'cre_attack':(T.ptype===5?'flame':'hit'),ux[i],uy[i],1);
        } else if(T.wk==='b'){
          // instant beam
          if(tg>=0) dealDamage(tg,dmg*dmgMul('b',utype[tg]),uteam[i],i,dmgMul('b',utype[tg]));
          else if(isRelicTg(tg)) damageRelic(relics[relicOf(tg)],dmg*STM.b,uteam[i]);
          else damageBld(-2-tg,dmg*STM.b,uteam[i]);
          const bc = utype[i]===8? [180,235,255] : (T.ptype===5? [255,142,55] : (uteam[i]? [255,120,80] : TEAMC[0]));
          const bstyle=utype[i]===8?'lance':T.ptype===5?'thermal':utype[i]===6?'sniper':'laser';
          const bh=beamHitXY(mx,my,ex,ey,trad);
          addBeam(mx,my,bh[0],bh[1], utype[i]===8?7:T.ptype===5?4.5:2.6,
            bc[0],bc[1],bc[2], utype[i]===8?.32:T.ptype===5?.24:utype[i]===6?.27:.18,bstyle,uteam[i]);
          addParticle(0,bh[0],bh[1],0,0,.14,utype[i]===8?16:7, bc[0],bc[1],bc[2]);
          if(T.ptype===5){
            addParticle(4,ex,ey,0,0,.42,8,255,130,38);
            if(perfScale>0.48) addParticle(1,ex,ey,rr(-3,3),rr(-12,-5),.8,5,65,56,50);
          } else if(utype[i]===8){
            addParticle(3,ex,ey,0,0,.22,22,150,225,255);
            for(let s=0;s<4;s++) addParticle(2,ex,ey,rr(-10,10),rr(-10,10),.16,1.8,205,245,255);
          } else if(utype[i]===6 && perfScale>0.45){
            addParticle(3,ex,ey,0,0,.16,10,180,230,255);
          }
          if(((tick+i)&3)===0) sfx(T.ptype===5?'flame':'laser',ux[i],uy[i],utype[i]===8?1.8:1);
        } else {
          const pmu=tg>=0?dmgMul(T.wk||'p',utype[tg]):(STM[T.wk||'p']||1);
          /* A zero speed makes plife = d/0 = Infinity, so the shot never moves, never
             expires and never returns its slot. A handful of those permanently
             exhausts the 6000-slot pool and then NOTHING in the match can fire.
             Guard here as well as in the data, because the data is easy to extend. */
          const pk=fireProj(T.ptype,uteam[i],mx,my,ex+rr(-3,3),ey+rr(-3,3),T.psp>0?T.psp:240,dmg*pmu*(tg<=-2?(T.bldMul||1):1),T.aoe,tg);
          const commanderCannon=utype[i]===4;
          if(pk>=0){
            pmu0[pk]=pmu; pwk[pk]=T.wk||'p'; pCannon[pk]=commanderCannon?1:0;

            pSrcUnit[pk]=i; pSrcGen[pk]=ugen[i];   // kill credit survives the flight
            pBio[pk]=unitIsBrood(i)?1:0;
            projectileFireFX(pk,mx,my,ex-mx,ey-my);
          }
          if(commanderCannon){
            if(uteam[i]===0) shake=Math.max(shake,1.8);
            sfx('cannon',ux[i],uy[i],1.05);
          } else if((i&7)===0){
            const snd=T.wk==='g'?'gauss':T.wk==='f'?'flame':T.wk==='s'?'sonic':T.wk==='i'?'laser':
                      (T.ptype===4||T.ptype===7||T.ptype===8)?'missile':
                      (T.ptype===2||(T.ptype===1&&T.size>=20))?'cannon':'shot';
            sfx(snd,ux[i],uy[i],T.size/14);
          }
        }
      }
      // titan stomp
      if(utype[i]===8 && ustomp[i]<=0 && er<TITAN_STOMP_R+30){
        let hitAny=false;
        forUnitsIn(ux[i],uy[i],TITAN_STOMP_R,j=>{
          if(uteam[j]!==uteam[i]){ dealDamage(j,TITAN_STOMP_DMG,uteam[i],i); hitAny=true; }
        });
        if(hitAny){
          ustomp[i]=2.6;
          addParticle(3,ux[i],uy[i],0,0,.5,TITAN_STOMP_R*2.2, 255,200,120);
          addParticle(3,ux[i],uy[i],0,0,.7,TITAN_STOMP_R*3.0, 255,160,80);
          if(typeof requestShake==='function') requestShake(ux[i],uy[i],7,'blast');
          else shake=Math.max(shake,7);
          sfx('boom',ux[i],uy[i],1.2);
        } else ustomp[i]=0.8;
      }
    } else { gx=utx[i]; gy=uty[i]; }
    // move
    let mvx=0,mvy=0,moving=false;
    const distGoal=Math.sqrt(dist2(ux[i],uy[i],gx,gy));
    // Multi-waypoint routes advance once in tickPatrolRoutes, as a platoon.
    // Only legacy two-point patrols still turn independently here.
    if(uPatrolRoute[i]>=0&&!patrolRoutes[uPatrolRoute[i]])uPatrolRoute[i]=-1;
    if(ustate[i]===5 && !engaging && distGoal<=14 && uPatrolRoute[i]<0){
      if(Math.abs(utx[i]-upx2[i])<1 && Math.abs(uty[i]-upy2[i])<1){ utx[i]=upx1[i]; uty[i]=upy1[i]; }
      else { utx[i]=upx2[i]; uty[i]=upy2[i]; }
    }
    const spdM=modeSpdMul(md)*(umodeT[i]>0?0.3:1);   // rooted modes can't move at all
    /* A marching column never halts to trade shots — it only stops when it has
       arrived. Without this the goal rewrite above is pointless: the unit would
       aim at its destination and then stand still because something was in
       range. */
    const wantMove = (uhold[i]||spdM<=0) ? false
                   : (umarch[i]===1) ? distGoal>6
                   : (engaging ? (!inRange || er > T.rng*rngM*0.92+6) : distGoal>6);
    if(wantMove && distGoal>0.001){
      // ground units make better time on the old highways
      const rd=(!T.air&&!T.naval&&roadAt(ux[i],uy[i]))?ROAD_SPD:1;
      const sp=T.spd*spdM*classSpdMul(i)*broodSpdMul(i)*mfDomainSpeedMul(i)*(ubuff[i]>0?1.35:1)*(uhaz[i]>0?HAZ_SPD:1)*rd*uCohesion[i]*Math.min(1,distGoal/18+0.25);
      // flow-field steering for long marches (routes armies around lakes)
      let ffOk=false;
      /* Formation orders share a coarse field to the leg centre, then fan out
         early enough to settle into their own slots before the turn. */
      const slotApproach=(uMoveCohort[i]>=0||uPatrolRoute[i]>=0)?170:70;
      if(!engaging && !T.air && ufield[i]>=0 && distGoal>slotApproach){
        const F=fields[ufield[i]];
        if(F&&!!F.naval===!!T.naval){
          const k=F.dirs[ffCell(ux[i],uy[i])];
          if(k<8){
            const inv=1/Math.hypot(DIRX[k],DIRY[k]);
            mvx=DIRX[k]*inv*sp; mvy=DIRY[k]*inv*sp;
            ffOk=true;
          }
        } else ufield[i]=-1;
      }
      if(!ffOk){ mvx=(gx-ux[i])/distGoal*sp; mvy=(gy-uy[i])/distGoal*sp; }
      moving=true;
      const ta=Math.atan2(mvy,mvx)+Math.PI/2;
      let da=ta-uang[i];
      while(da>Math.PI)da-=TAU; while(da<-Math.PI)da+=TAU;
      uang[i]+=clamp(da,-(isBug?11:5)*dt,(isBug?11:5)*dt);
      if(!engaging){
        let dturr=ta-uturr[i];
        while(dturr>Math.PI)dturr-=TAU; while(dturr<-Math.PI)dturr+=TAU;
        uturr[i]+=clamp(dturr,-4*dt,4*dt);
      }
      if(ustate[i]===1 && distGoal<=7) ustate[i]=0;
    }
    // physical separation; formation/order goals remain the primary velocity
    if(skipSep){ sepVX=0; sepVY=0; sepHits=0; sepVisited=0; }
    else unitSeparation(i,T,isBug,swarmLOD,total);
    /* Near a shared destination, do not let every unit's goal vector overpower
       collision response and recreate the stack. Valid formation slots never
       enter this branch because they have no overlap (`sepHits===0`). Long
       marches keep full speed and only fan out as the column arrives. */
    if(sepHits&&distGoal<60&&umarch[i]!==1){mvx*=0.12;mvy*=0.12;}
    /* CROWD ARRIVAL. Forty units sent to one point steer down the same flow
       cells, meet, and keep pressing into each other forever — the blob
       shivers and the rear never routes around. Close to goal and physically
       wedged against two or more others IS arrival: stop, drop the field,
       idle-acquire. Formations, patrols, marches and the commander exempt. */
    if(sepHits>=2&&distGoal<46&&!engaging&&umarch[i]!==1&&(ustate[i]===1||ustate[i]===2)&&
       uPatrolRoute[i]<0&&uMoveCohort[i]<0&&i!==heroIdx&&!T.air){
      ustate[i]=0; utx[i]=ux[i]; uty[i]=uy[i]; ufield[i]=-1;
    }
    mvx+=sepVX;mvy+=sepVY;
    if(!T.air){
      const bc=bGrid[clamp(uy[i]/BCS|0,0,BGW-1)*BGW+clamp(ux[i]/BCS|0,0,BGW-1)];
      if(bc) for(const b of bc){
        const B=blds[b];
        if(B.type==='gate'&&B.team===uteam[i]) continue;      // friendly units pass through gates
        const dx=ux[i]-B.x, dy=uy[i]-B.y, rs=T.r+B.r+1;
        const d2=dx*dx+dy*dy;
        if(d2<rs*rs && d2>0.001){
          const d=Math.sqrt(d2), push=(rs-d)*3.2;
          mvx+=dx/d*push; mvy+=dy/d*push;
        }
      }
    }
    // apply with medium constraint: ground stays on land, ships stay on water, air flies anywhere
    const ox=ux[i], oy=uy[i];
    let nx=clamp(ox+mvx*dt,8,MAP-8), ny=clamp(oy+mvy*dt,8,MAP-8);
    if(typeof battlefieldClampPoint==='function'){
      const bp=battlefieldClampPoint(nx,ny,T.r+8);nx=bp[0];ny=bp[1];
      const goal=battlefieldClampPoint(utx[i],uty[i],T.r+8);utx[i]=goal[0];uty[i]=goal[1];
    }
    if(!T.air && (mvx||mvy)){
      const okAt=T.naval?((X,Y)=>typeof isNavigableWater==='function'&&isNavigableWater(X,Y,true)):isWalkable;
      if(!okAt(nx,ny)){
        if(okAt(nx,uy[i])) ny=uy[i];
        else if(okAt(ux[i],ny)) nx=ux[i];
        else { nx=ux[i]; ny=uy[i]; }
      }
    }
    const travel=Math.hypot(nx-ox,ny-oy);
    ux[i]=nx; uy[i]=ny;
    if(travel>0.01) gridRelink(i);
    if(i===heroIdx&&typeof commanderTerrainRecovery==='function') commanderTerrainRecovery(i,travel,dt);
    if(i===heroIdx&&T.cat==='hero'&&travel>0.01&&(tick&7)===0&&typeof commanderCrushScenery==='function')
      commanderCrushScenery(i,false);
    /* Intent is not movement: blocked walkers can still have a far-away order.
       Drive gait and movement audio from real displacement so feet stay put. */
    umov[i]=travel>0.01?1:0;
    const _rw=uwalk[i];
    if(T.legs&&travel>0.01) uwalk[i]=(uwalk[i]+travel*(utype[i]===4?0.19:0.16))%TAU;
    if(typeof rumbleUnitMove==='function') rumbleUnitMove(i,T,travel,_rw);
    /* Water splash: ground units crossing authored water (oceans/rivers/lakes),
       not a dry crater that punched below WATER_H. */
    if(!skipFx && !T.air && !T.naval && travel>0.5 && perfScale>0.4){
      const wetAt=typeof authoredWaterAt==='function'?authoredWaterAt:(typeof hAt==='function'?(X,Y)=>hAt(X,Y)<WATER_H:()=>false);
      const wasWet = wetAt(ox,oy);
      const nowWet = wetAt(nx,ny);
      if(wasWet!==nowWet){
        for(let sp=0;sp<4;sp++){
          const sa=Math.random()*TAU, sv=40+Math.random()*60;
          addParticle(5,nx,ny,Math.cos(sa)*sv,Math.sin(sa)*sv-20,.3,.8+Math.random()*3, 210,235,255);
        }
        addParticle(0,nx,ny,0,0,.18,T.size*1.4, 230,245,255);
      }
    }
    // dust trail / ship wake
    if(!skipFx && umov[i] && !T.air && (i+tick)%dustStride===0 && perfScale>0.18){
      if(T.naval) addParticle(1,ux[i]-mvx*0.08,uy[i]-mvy*0.08,rr(-2,2),rr(-2,2),.8,T.size*(T.vscale||1)*0.45, 210,235,245);
      else if(T.size>18) addParticle(10,ux[i]-mvx*0.06,uy[i]-mvy*0.06,rr(-5,5),rr(-5,5),.8,T.size*0.55, 140,132,110);
      else addParticle(10,ux[i]-mvx*0.06,uy[i]-mvy*0.06,rr(-3,3),rr(-3,3),.62,T.size*0.4, 128,120,100);
    }
    /* Three readable damage states. Smoke starts before the unit is almost
       dead; sparks and flame arrive only at critical health. Emission is
       staggered by slot so a damaged 1,000-unit army cannot burst 1,000 quads
       into the ring buffer on one frame. Brood bleed corrosive vapour instead
       of pretending their chitin has an engine bay. */
    const hpFrac=uhp[i]/uhpm[i];
    /* Airframe trail is 3D (gpufx). The dirt-relative type-1 puffs below
       stay on ground combat — do not retune those magnitudes. */
    if(!skipFx && T.air && hpFrac<0.35 && perfScale>0.22) emitAirSmoke(i,T,false);
    if(!skipFx && !T.air && hpFrac<0.58 && T.size>=12 && perfScale>0.38){
      const crit=hpFrac<0.20, bad=hpFrac<0.36, organic=unitIsBrood(i);
      const mod=crit?7:bad?13:25;
      if((i+tick)%mod===0){
        addParticle(1,ux[i]+rr(-T.size*.18,T.size*.18),uy[i]+rr(-T.size*.18,T.size*.18),
          rr(-4,4),rr(-18,-9),crit?1.45:bad?1.05:.75,T.size*(crit?.48:bad?.38:.28),
          organic?48:crit?34:48,organic?68:crit?33:47,organic?34:crit?35:48);
      }
      if(bad&&(i+tick*3)%17===0)
        addParticle(2,ux[i],uy[i],rr(-8,8),rr(-10,-2),.22,2.0,
          organic?145:255,organic?220:180,organic?80:75);
      if(crit&&(i+tick)%19===0)
        addParticle(organic?0:4,ux[i]+rr(-4,4),uy[i]+rr(-4,4),0,0,
          organic?.24:.52,T.size*(organic?.36:.50),organic?130:255,organic?225:135,organic?65:38);
      if(organic&&typeof orgfxSeep==='function'&&(i+tick)%(crit?9:17)===0)
        orgfxSeep(ux[i],uy[i],T.size);
    }
    /* Fire persistence: units hit by incendiary weapons burn for a few seconds,
       emitting flame particles each tick to make the thermal damage visible. */
    if(ufireT[i]>0 && (i+tick)%6===0 && perfScale>0.4){
      addParticle(4,ux[i]+rr(-T.size*.2,T.size*.2),uy[i]+rr(-T.size*.2,T.size*.2),
        0,0,.55,T.size*0.45, 255,140,35);
      if((i+tick)%18===0) addParticle(1,ux[i]+rr(-3,3),uy[i]+rr(-3,3),
        rr(-2,2),rr(-8,-3),.7,T.size*0.3, 58,50,44);
    }
    // hero regen + wreck reclaiming (SupCom-style)
    if(i===heroIdx||isEnemyCommander(i)){
      if(uHurtT[i]>0) uHurtT[i]-=dt;
      /* IN-COMBAT REGEN GATE. Full regeneration is a between-fights tool; while
         shells are landing it runs at 25%, so a defended base can actually
         out-damage a commander instead of feeding it a solo playthrough. */
      uhp[i]=Math.min(uhpm[i],uhp[i]+ (i===heroIdx?heroRegen:8)*(uHurtT[i]>0?0.25:1)*dt);
      if(ureclaim[i]<=0){
        ureclaim[i]=0.85;
        for(let w=0;w<wrecks.length;w++){
          const W=wrecks[w];
          if(dist2(ux[i],uy[i],W.x,W.y)<130*130){
            const team=uteam[i];
            const sm=(team===0?salvageMult:1);
            resM[team]=Math.min(RES_MCAP[team],resM[team]+W.mass*sm);
            /* Pay the energy too. The wreck is spliced out immediately below,
               so anything not banked here is destroyed. */
            if(W.en>0) resE[team]=Math.min(RES_ECAP[team],resE[team]+W.en*sm);
            addBeam(ux[i],uy[i],W.x,W.y,2.4,120,255,170,0.5,'repair');
            addParticle(0,W.x,W.y,0,0,.4,14, 120,255,170);
            if(team===0){
              heroXP(3);
              if(!window.__reclaimTip){ window.__reclaimTip=1; toast('♻ Commander reclaimed a wreck +'+Math.round(W.mass)+' mass'+(W.en>0?' +'+Math.round(W.en)+' energy':'')); }
            }
            wrecks.splice(w,1);
            break;
          }
        }
      }
    }
  }
  tick++;
  if(_hotT0){
    simHot.unitTickMs=performance.now()-_hotT0;
    simHot.live=total;
    simHot.team0=teamCount[0]; simHot.team1=teamCount[1]; simHot.team2=teamCount[2];
  }
}

// ---------- projectile tick ----------
function projTick(dt){
  for(let s=artShellSmoke.length-1;s>=0;s--){
    const S=artShellSmoke[s];S.life-=dt;
    if(S.life<=0){artShellSmoke.splice(s,1);continue;}
    S.x+=S.vx*dt;S.y+=S.vy*dt;S.lift+=S.rise*dt;
  }
  for(let i=0;i<pHigh;i++){
    if(!palive[i]) continue;
    if(ptype[i]===2){
      pt[i]+=dt/plife[i];
      if(pt[i]>=1){ px[i]=pex[i]; py[i]=pey[i]; projImpact(i); continue; }
      px[i]=psx[i]+(pex[i]-psx[i])*pt[i];
      py[i]=psy[i]+(pey[i]-psy[i])*pt[i];
      /* Ground-to-ground lerp plus the authored arc. The +16 the renderer used
         to add is folded in so muzzle and impact sit clear of the deck. */
      pz[i]=pz0[i]+(pz1[i]-pz0[i])*pt[i]+16+Math.sin(pt[i]*Math.PI)*(pArc[i]||70);
      if(pBarrage[i]){
        /* The shell itself follows the authored ballistic path; its wake does
           not. Fixed-rate samples are pushed sideways by smooth deterministic
           turbulence, then continue to drift/rise after the projectile moves
           on. This reads as pressure-torn smoke instead of a clean ruler line. */
        pSmokeT[i]+=dt;
        let emitted=0;
        while(pSmokeT[i]>=.055&&emitted++<3){
          pSmokeT[i]-=.055;
          const q=clamp(pt[i]-pSmokeT[i]/Math.max(.001,plife[i]),0,1);
          const bx=psx[i]+(pex[i]-psx[i])*q,by=psy[i]+(pey[i]-psy[i])*q;
          const d=Math.max(1,Math.hypot(pex[i]-psx[i],pey[i]-psy[i]));
          const nx=(pex[i]-psx[i])/d,ny=(pey[i]-psy[i])/d,w=artShellTurbulence(i,q);
          const life=1.45+((i*17+(q*100|0))%7)*.045;
          artShellSmoke.push({x:bx-ny*w,y:by+nx*w,lift:16+Math.sin(q*Math.PI)*(pArc[i]||70),
            life,max:life,size:9.6+Math.abs(w)*.16,rot:pTurbSeed[i]*TAU+q*5.2,team:pteam[i],
            hot:q>.035&&q<.965,vx:-ny*w*.34,vy:nx*w*.34,rise:7+Math.abs(w)*.18});
        }
        while(artShellSmoke.length>220)artShellSmoke.shift();
        if(pt[i]>=.30&&pFlightCue[i]===0){
          pFlightCue[i]=1;
          if(typeof artilleryWorldAudio==='function')artilleryWorldAudio('flight',px[i],py[i],pteam[i],1);
        }
        if(pt[i]>=.74&&pFlightCue[i]===1){
          pFlightCue[i]=2;
          if(typeof artilleryWorldAudio==='function')artilleryWorldAudio('flight',px[i],py[i],pteam[i],.82);
        }
      } else if((tick+i)%3===0 && perfScale>0.38){
        if(pBio[i]){
          addParticle(0,px[i]+rr(-2,2),py[i]+rr(-2,2),rr(-3,3),rr(-5,1),.34,5.2,178,255,92);
          if((tick+i)%9===0) addParticle(1,px[i],py[i],rr(-2,2),rr(-5,0),.54,3.4,62,78,46);
        } else if(pwk[i]==='f'){
          addParticle(4,px[i],py[i],rr(-2,2),rr(-5,-1),.34,6.2,255,145,45);
          if((tick+i)%9===0) addParticle(1,px[i],py[i],rr(-2,2),rr(-7,-2),.55,3.2,68,56,48);
        } else {
          addParticle(1,px[i]+rr(-2,2),py[i]+rr(-2,2),rr(-2,2),rr(-5,1),.62,4.0, 92,88,84);
          if((tick+i)%9===0) addParticle(0,px[i],py[i],0,0,.12,3.5, 255,175,90);
        }
      }
    } else {
      plife[i]-=dt;
      if(plife[i]<=0){ projImpact(i); continue; }
      const t=ptgt[i];
      if(t>=0 && liveTgt(t,ptgtg[i]) && uteam[t]!==pteam[i] && ptype[i]!==5){
        const d=Math.max(1,Math.sqrt(dist2(px[i],py[i],ux[t],uy[t])));
        const sp=Math.sqrt(pvx[i]*pvx[i]+pvy[i]*pvy[i]);
        const hm=ptype[i]===7?0.34 : ptype[i]===4?0.10 : ptype[i]===6?0.05 : ptype[i]===8?0.22 : ptype[i]===9?0 : 0.18;
        pvx[i]=pvx[i]*(1-hm)+ (ux[t]-px[i])/d*sp*hm;
        pvy[i]=pvy[i]*(1-hm)+ (uy[t]-py[i])/d*sp*hm;
        if(d<TYPES[utype[t]].r+5){ px[i]=ux[t]; py[i]=uy[t]; projImpact(i); continue; }
      }
      if(ptype[i]===4){
        // rocket wobble + smoke trail
        const wob=Math.sin(plife[i]*22+(i&7))*36;
        const sp=Math.max(1,Math.sqrt(pvx[i]*pvx[i]+pvy[i]*pvy[i]));
        px[i]+=(pvx[i]-pvy[i]/sp*wob*0.2)*dt; py[i]+=(pvy[i]+pvx[i]/sp*wob*0.2)*dt;
        if((tick+i)%3===0) addParticle(pBio[i]?0:1,px[i],py[i],0,0,.75,5.8,pBio[i]?178:150,pBio[i]?255:150,pBio[i]?92:155);
      } else if(ptype[i]===6){
        /* PLASMA ORB — slow, heavy, visibly travelling. Being able to SEE a
           shot cross the gap is what makes energy weapons feel different from
           a hitscan bullet: you can watch it coming, and so can the target. */
        px[i]+=pvx[i]*dt; py[i]+=pvy[i]*dt;
        if((tick+i)%2===0){
          const sonic=pwk[i]==='s',bio=pBio[i];
          addParticle(0,px[i]+rr(-2,2),py[i]+rr(-2,2),rr(-6,6),rr(-6,6),.30,7,
            bio?178:sonic?190:110,bio?255:sonic?125:220,bio?92:255);
        }
      } else if(ptype[i]===8){
        /* FLAK BURST — arms after a short flight then detonates in the air,
           spraying fragments. It doesn't need to HIT anything, which is what
           makes it feel different from every other projectile: aircraft die to
           proximity, not to marksmanship. */
        px[i]+=pvx[i]*dt; py[i]+=pvy[i]*dt;
        if((tick+i)%3===0) addParticle(0,px[i],py[i],0,0,.12,3.4,pBio[i]?178:255,pBio[i]?255:220,pBio[i]?92:150);
      } else if(ptype[i]===9){
        /* CLUSTER SHELL — lofts, then splits. Handled on impact; in flight it
           just arcs like a heavy round with a visible smoke trail. */
        px[i]+=pvx[i]*dt; py[i]+=pvy[i]*dt;
        if((tick+i)%2===0) addParticle(pBio[i]?0:1,px[i],py[i],rr(-3,3),rr(-3,3),.72,4.3,pBio[i]?170:92,pBio[i]?235:88,pBio[i]?88:86);
        if((tick+i)%7===0) addParticle(0,px[i],py[i],0,0,.14,4.5,pBio[i]?184:255,pBio[i]?255:145,pBio[i]?96:55);
      } else if(ptype[i]===7){
        /* GUIDED MISSILE — boosts up to speed, then turns hard. Unlike the
           dumb rocket it keeps chasing, so it punishes slow targets and can
           be outrun by fast ones. */
        const sp=Math.sqrt(pvx[i]*pvx[i]+pvy[i]*pvy[i])||1;
        /* Remaining seconds are not a flight phase. Long shots used to begin
           with a negative boost and visibly slide backwards. Normalize by the
           launch lifetime so every missile accelerates from 1.0 to 1.9. */
        const phase=clamp(1-plife[i]/pmax[i],0,1);
        const boost=1+Math.min(.9,phase*1.4);
        px[i]+=pvx[i]*boost*dt; py[i]+=pvy[i]*boost*dt;
        if((tick+i)%2===0) addParticle(pBio[i]?0:1,px[i],py[i],rr(-4,4),rr(-4,4),.72,5.2,pBio[i]?172:104,pBio[i]?230:102,pBio[i]?88:104);
        if((tick+i)%5===0) addParticle(0,px[i],py[i],0,0,.16,5,pBio[i]?184:255,pBio[i]?255:190,pBio[i]?96:110);
      } else {
        px[i]+=pvx[i]*dt; py[i]+=pvy[i]*dt;
        if(pBio[i]){
          if((tick+i)%2===0) addParticle(0,px[i],py[i],rr(-2,2),rr(-2,2),.28,5.2,178,255,92);
        } else if(pCannon[i]){
          if((tick+i)%2===0) addParticle(0,px[i],py[i],0,0,.16,7.5,255,166,68);
          if((tick+i)%3===0) addParticle(1,px[i],py[i],rr(-2,2),rr(-2,2),.52,4.8,76,70,65);
        } else if(pwk[i]==='g'&&perfScale>0.42&&(tick+i)%2===0){
          addParticle(2,px[i],py[i],rr(-10,10),rr(-10,10),.14,2.4,165,230,255);
          if((tick+i)%6===0) addParticle(0,px[i],py[i],0,0,.10,5.5,225,250,255);
        } else if(perfScale>0.55 && (ptype[i]===1||ptype[i]===3) && (tick+i)%5===0)
          addParticle(0,px[i],py[i],0,0,.10,ptype[i]===3?5.5:3.0,
            ptype[i]===3?125:255,ptype[i]===3?225:180,ptype[i]===3?255:95);
      }
    }
  }
}

// ---------- building tick ----------
function bldTick(dt){
  for(let b=0;b<blds.length;b++){
    const B=blds[b]; if(!B.alive) continue;
    if(B.prog<1){
      /* FORCED TEMPO booster: construction only, and only for the player. */
      const doctrine=(B.team===0&&typeof defenseFocus!=='undefined'&&defenseFocus&&DEFT[B.type])?1.333:1;
      const tractor=B.tractorT>0?1+.22*Math.min(2,B.tractorN||1):1;
      const bs=(B.team===0?((typeof boostMul==='function'?boostMul('build'):1)*
                            (typeof bldSpeedMult!=='undefined'?bldSpeedMult:1)*doctrine):
                            (B.team===1?aiBuildMult:1))*tractor;
      const wasProg=B.prog;
      const T=BT[B.type],nextProg=Math.min(1,B.prog+dt*bs/T.bt);
      /* A mid-match save from before streamed sites already paid its full lump
         sum. Treat missing ledgers as paid instead of charging that player a
         second time; every newly-created site always carries explicit fields. */
      if(B.buildPaidM==null){B.buildPaidM=T.cm;B.buildPaidE=T.ce;}
      const needM=Math.max(0,T.cm*nextProg-B.buildPaidM);
      const needE=Math.max(0,T.ce*nextProg-B.buildPaidE);
      if(payStream(B.team,needM,needE)){
        B.buildPaidM+=needM; B.buildPaidE+=needE; B.buildStalled=false;
        B.prog=nextProg;
        B.hp=Math.min(B.hpm,B.hpm*(.1+.9*B.prog));
      }else{
        B.buildStalled=true;
        if(B.team===0){ if(resM[0]<needM)stallM=.8; if(resE[0]<needE)stallE=.8; }
      }
      if((tick&7)===0) addParticle(2,B.x+rr(-B.r,B.r),B.y+rr(-B.r,B.r),rr(-4,4),rr(-10,-2),.3,3, 160,230,255);
      if(wasProg<1&&B.prog>=1){
        if(B.type==='techlab') B.shield=B.shieldMax;
        if(B.type==='mex') deployExtractorMiner(B);
        if(B.team===0) sfx('build',B.x,B.y,1);
      }
      continue;
    }
    if(B.upT>0){
      B.upT-=dt;
      if(B.upT<=0) finishUpgrade(B);
    }
    if(B.boost>0) B.boost-=dt;
    if(B.hitT>0) B.hitT-=dt;
    if(B.dmgT>0) B.dmgT-=dt;
    if(B.shieldT>0) B.shieldT-=dt;
    if(B.guardT>0) B.guardT-=dt;
    if(B.tractorT>0)B.tractorT-=dt;
    const bfac=bldFactionKey(B);
    if(B.team<2){                                   // fortification regen
      const F=fortOf(B.team);
      if(F.regen>0&&B.hp<B.hpm) B.hp=Math.min(B.hpm,B.hp+F.regen*dt);
    }
    if(B.type==='uplink'){
      B.heal-=dt;
      if(B.heal<=0){
        B.heal=1;
        /* `blds` is append-only — bldLive exists precisely because destroyed
           entries stay in it — so this scan grew for the whole match and, in a
           long one, spent most of its time skipping rubble. The radius also
           depends only on B, and was being recomputed once per candidate. */
        const ur=UPLINK_R*(1+Math.max(0,(B.lvl||1)-1)*.18), ur2=ur*ur;
        for(const T2 of bldLive){
          if(T2.alive&&T2.team===B.team&&T2.prog>=1&&(T2.type==='turret'||T2.type==='bunker'||T2.type==='bastion'||T2.type==='aatower'||T2.type==='hellstorm'||T2.type==='arc'||T2.type==='rail'||T2.type==='minelaser'||T2.type==='missilebastion'||T2.type==='plasma'||T2.type==='stormcaller')
             &&dist2(B.x,B.y,T2.x,T2.y)<ur2){ T2.boost=1.4; T2.boostM=UPLINK_BOOST+Math.max(0,(B.lvl||1)-1)*.125; }
        }
      }
    }
    else if(B.type==='techlab'){
      // The account-progression hub is intentionally hard to snipe. Its buffer
      // returns only after a short no-damage window, so an actual siege can
      // still break it while stray raiders cannot erase the whole tech path.
      if(B.dmgT<=0&&B.shield<B.shieldMax){
        B.shield=Math.min(B.shieldMax,B.shield+45*dt);
        if((tick&31)===0) addParticle(0,B.x+rr(-B.r*.6,B.r*.6),B.y+rr(-B.r*.6,B.r*.6),0,-5,.45,5,105,220,255);
      }
      if(!B.guardReady&&B.guardT<=0&&B.dmgT<=0&&B.hp>=B.hpm*TECH_GUARD.hpReady&&
         B.shield>=B.shieldMax*TECH_GUARD.shieldReady){
        B.guardCharge+=dt;
        if(B.guardCharge>=TECH_GUARD.rearm){
          B.guardReady=true; B.guardCharge=0;
          if(B.team===0){ toast('◆ Research containment relay rearmed'); sfx('notify',B.x,B.y,.72); }
        }
      } else if(B.dmgT>0||B.hp<B.hpm*TECH_GUARD.hpReady||B.shield<B.shieldMax*TECH_GUARD.shieldReady) B.guardCharge=0;
      if(B.res>=0){
        const R=RESEARCH[B.res];
        const frac=dt/R.t;
        if(payStream(B.team, R.cm*frac, R.ce*frac)){
          B.resT+=dt;
          if(B.team===0) bankResearchProgress(R.id,B.resT);
          if(B.resT>=R.t){ applyResearch(R.id); B.res=-1; B.resT=0; }
        }
      }
    }
    else if(B.type==='bunker'){
      // Cheap early anchor: slow dual-purpose cannon with a compact splash.
      B.cool-=dt;
      const rng=BUNKER.rng*bldRngMul(B);
      const e=findEnemy(B.x,B.y,B.team,rng,2);
      if(e>=0){
        B.tang=Math.atan2(uy[e]-B.y,ux[e]-B.x)+Math.PI/2;
        if(B.cool<=0){
          B.cool=BUNKER.cool;
          const ma=B.tang-Math.PI/2;
          const mx=B.x+Math.cos(ma)*BT.bunker.size*.67, my=B.y+Math.sin(ma)*BT.bunker.size*.67;
          const bio=bfac==='horde',phase=bfac==='syndicate';
          const pk=fireProj(bio?6:phase?3:2,B.team,mx,my,ux[e],uy[e],bio?150:185,
            BUNKER.dmg*bldDmgMul(B)*(bio?.92:1),BUNKER.aoe*(bio?1.3:1),-1);
          if(pk>=0){ pwk[pk]='e'; pBio[pk]=bio?1:0; pSrcBld[pk]=B; }
          addParticle(0,mx,my,0,0,.18,14,bio?156:phase?190:255,bio?255:phase?105:220,bio?92:phase?255:160);
          addParticle(1,mx,my,rr(-3,3),rr(-7,-2),.6,7,92,96,102);
          shake=Math.max(shake,1.2);
          sfx(bio?'sonic':phase?'surge':'shot',B.x,B.y,1.25);
        }
      } else if(B.cool<0) B.cool=.2;
    }
    else if(B.type==='aatower'){
      B.cool-=dt;
      const rngA=AA.rng*bldRngMul(B);
      const e=findEnemy(B.x,B.y,B.team,rngA,1);
      if(e>=0){
        B.tang=Math.atan2(uy[e]-B.y,ux[e]-B.x)+Math.PI/2;
        if(B.cool<=0){
          B.cool=AA.cool;
          const dmgA=AA.dmg*bldDmgMul(B);
          const pre=stats.kills[B.team];
          dealDamage(e,dmgA,B.team,-1);
          forUnitsIn(ux[e],uy[e],AA.aoe,j=>{
            if(uteam[j]!==B.team&&TYPES[utype[j]].air&&j!==e) dealDamage(j,dmgA*0.5,B.team,-1);
          });
          defKillCredit(B,stats.kills[B.team]-pre);
          /* Particles have no Z. `uy-9` was a fake "height" that walked the
             burst nine world-metres south of the aircraft. Sit on the target
             and let the renderer lift billboards. */
          const mz=bldMuzzleXY(B,0.57);
          const hit=beamHitXY(mz[0],mz[1],ux[e],uy[e],TYPES[utype[e]].r);
          addParticle(0,mz[0],mz[1],0,0,.10,8,255,230,190);
          addParticle(0,hit[0]+rr(-6,6),hit[1]+rr(-6,6),0,0,.22,10, 255,220,170);
          if(bfac==='syndicate') addBeam(mz[0],mz[1],hit[0],hit[1],2.2,176,255,95,.14,'arc',B.team);
          else if(bfac==='horde') addParticle(0,hit[0],hit[1],0,0,.28,15,150,255,88);
          addParticle(1,hit[0]+rr(-5,5),hit[1]+rr(-5,5),rr(-3,3),rr(-6,-2),.7,6, 70,70,74);
          if(Math.random()<0.4) sfx('hit',B.x,B.y,1);
        }
      } else if(B.cool<0) B.cool=0.2;
    }
    else if(B.type==='bastion'||B.type==='seafort'){
      B.cool-=dt;
      const sea=B.type==='seafort',WR=sea?DEF_WEAPON_DATA.seafort:BASTION;
      const e=findEnemy(B.x,B.y,B.team,WR.rng*bldRngMul(B),2);
      if(e>=0){
        const er=Math.sqrt(dist2(B.x,B.y,ux[e],uy[e]));
        let ta=Math.atan2(uy[e]-B.y,ux[e]-B.x)+Math.PI/2;
        let da=ta-B.tang;
        while(da>Math.PI)da-=TAU; while(da<-Math.PI)da+=TAU;
        B.tang+=clamp(da,-1.6*dt,1.6*dt);
        if(B.cool<=0 && er>(WR.min||WR.minRng) && Math.abs(da)<0.15){
          B.cool=WR.cool;
          const ma=B.tang-Math.PI/2;
          const mx=B.x+Math.cos(ma)*BT[B.type].size*0.89, my=B.y+Math.sin(ma)*BT[B.type].size*0.89;
          const bio=bfac==='horde',phase=bfac==='syndicate';
          const pk=fireProj(bio?6:phase?3:2,B.team,mx,my,ux[e]+rr(-14,14),uy[e]+rr(-14,14),bio?112:135,
            (sea?BASTION.dmg*.84:BASTION.dmg)*bldDmgMul(B)*(bio?.9:1),BASTION.aoe*(bio?1.25:1),-1);
          if(pk>=0){
            pwk[pk]='e';
            pBio[pk]=bio?1:0;
            pConcuss[pk]=BASTION_CONCUSS[clamp((B.lvl||1)-1,0,2)];
            pSrcBld[pk]=B;
          }
          addParticle(0,mx,my,0,0,.22,20,bio?168:phase?195:255,bio?255:phase?110:230,bio?92:phase?255:170);
          addParticle(1,mx,my,rr(-6,6),rr(-10,-4),.8,10, 120,120,124);
          shake=Math.max(shake,2.5);
          sfx(bio?'sonic':phase?'surge':'boom',B.x,B.y,0.9);
        }
      } else if(B.cool<0) B.cool=0.4;
    }
    else if(B.type==='turret'){
      B.cool-=dt;
      const trng=TURRET_RNG*bldRngMul(B);
      let e=-1;
      if(B.prio===1){                          // AIR FIRST
        e=findEnemy(B.x,B.y,B.team,trng,1);
        if(e<0) e=findEnemy(B.x,B.y,B.team,trng);
      } else if(B.prio===2){                   // STRONGEST FIRST
        let bh=-1;
        forUnitsIn(B.x,B.y,trng,j=>{ if(intelCanTarget(j,B.team)&&uhpm[j]>bh){ bh=uhpm[j]; e=j; } });
      } else e=findEnemy(B.x,B.y,B.team,trng);
      /* A commander in range IS the target. Sentinels exist to punish hero
         raids; picking the nearest scout instead let the actual threat farm
         the base from the tower's blind priority. */
      if(e<0||TYPES[utype[e]].cat!=='hero'){
        let h=-1;
        forUnitsIn(B.x,B.y,trng,j=>{ if(intelCanTarget(j,B.team)&&TYPES[utype[j]].cat==='hero') h=j; });
        if(h>=0) e=h;
      }
      if(e>=0){
        B.tang=Math.atan2(uy[e]-B.y,ux[e]-B.x)+Math.PI/2;
        if(B.cool<=0){
          B.cool=TURRET_COOL;
          const bio=bfac==='horde';
          const pre=stats.kills[B.team];
          dealDamage(e,TURRET_DMG*bldDmgMul(B)*dmgMul(bio?'p':'b',utype[e]),B.team,-1,dmgMul(bio?'p':'b',utype[e]));
          defKillCredit(B,stats.kills[B.team]-pre);
          const ma=B.tang-Math.PI/2;
          const mx=B.x+Math.cos(ma)*BT.turret.size*0.73, my=B.y+Math.sin(ma)*BT.turret.size*0.73;
          const hit=beamHitXY(mx,my,ux[e],uy[e],TYPES[utype[e]].r);
          if(bio){
            /* Hitscan already applied. A 0-damage type-1 bolt then flew to the
               corpse after the kill — a second, late tracer. */
            addBeam(mx,my,hit[0],hit[1],1.7,174,255,88,.12,'tracer',B.team);
            addParticle(0,hit[0],hit[1],0,0,.18,10,154,255,84);
            sfx('sonic',B.x,B.y,.85);
          }else{
            const mac=bfac==='syndicate';
            addBeam(mx,my,hit[0],hit[1],3,mac?186:110,mac?96:255,mac?255:150,.18,'turret',B.team);
            addParticle(0,hit[0],hit[1],0,0,.13,8,mac?190:110,mac?105:255,mac?255:150);
            sfx(mac?'surge':'laser',B.x,B.y,1);
          }
        }
      } else if(B.cool<0) B.cool=0.2;
    }
    else if(B.type==='hellstorm'){
      // rotary flak: sprays up to HELL.tgts ground targets at once — swarm shredder
      B.cool-=dt;
      if(B.cool<=0){
        const rng=HELL.rng*bldRngMul(B);
        const tgts=[];
        forUnitsIn(B.x,B.y,rng,j=>{
          if(uteam[j]!==B.team&&!TYPES[utype[j]].air&&tgts.length<HELL.tgts) tgts.push(j);
        });
        if(tgts.length){
          const pw=drawEnergy(B.team,HELL.e);            // brownouts slow the guns
          B.cool=HELL.cool*(pw<0.5?2.2:1);
          B.tang=Math.atan2(uy[tgts[0]]-B.y,ux[tgts[0]]-B.x)+Math.PI/2;
          const ma=B.tang-Math.PI/2;
          const mx=B.x+Math.cos(ma)*BT.hellstorm.size*0.5, my=B.y+Math.sin(ma)*BT.hellstorm.size*0.5;
          const bio=bfac==='horde',mac=bfac==='syndicate';
          const pre=stats.kills[B.team];
          for(const j of tgts){
            dealDamage(j,HELL.dmg*bldDmgMul(B)*dmgMul('p',utype[j]),B.team,-1);
            if(perfScale>0.4){
              const hit=beamHitXY(mx,my,ux[j]+rr(-3,3),uy[j]+rr(-3,3),TYPES[utype[j]].r);
              addBeam(mx,my,hit[0],hit[1],bio?2.5:mac?2.1:1.6,
                bio?170:mac?192:255,bio?255:mac?100:220,bio?90:mac?255:120,bio?.16:.10,bio?'arc':mac?'lance':'tracer',B.team);
            }
          }
          defKillCredit(B,stats.kills[B.team]-pre);
          addParticle(0,mx,my,0,0,.08,10,bio?170:mac?190:255,bio?255:mac?105:230,bio?90:mac?255:150);
          if((tick&3)===0) sfx(bio?'sonic':mac?'surge':'shot',B.x,B.y,1.4);
        } else B.cool=0.2;
      }
    }
    else if(B.type==='arc'){
      // tesla pylon: lightning chains through packed enemies
      B.cool-=dt;
      if(B.cool<=0){
        const rng=ARC.rng*bldRngMul(B);
        const first=findEnemy(B.x,B.y,B.team,rng);
        if(first>=0){
          const pw=drawEnergy(B.team,ARC.e);
          B.cool=ARC.cool*(pw<0.5?2.2:1);
          const chained=new Set([first]),bio=bfac==='horde',mac=bfac==='syndicate';
          const pre=stats.kills[B.team];
          let px3=B.x, py3=B.y-BT.arc.size*0.45, cur=first, mult=1;
          for(let c2=0;c2<ARC.chain&&cur>=0;c2++){
            dealDamage(cur,ARC.dmg*bldDmgMul(B)*mult*dmgMul('b',utype[cur]),B.team,-1);
            const end=beamHitXY(px3,py3,ux[cur],uy[cur],TYPES[utype[cur]].r);
            addBeam(px3,py3,end[0],end[1],2.6,bio?178:mac?202:150,bio?255:mac?96:230,bio?94:mac?255:255,.21,'arc',B.team);
            addParticle(0,ux[cur],uy[cur],0,0,.12,10,bio?170:mac?195:180,bio?255:mac?110:240,bio?90:mac?255:255);
            px3=ux[cur]; py3=uy[cur]; mult*=0.88;
            let nx2=-1,nd2=ARC.jump*ARC.jump;
            forUnitsIn(px3,py3,ARC.jump,j=>{
              if(uteam[j]!==B.team&&!chained.has(j)){
                const dd=dist2(px3,py3,ux[j],uy[j]);
                if(dd<nd2){ nd2=dd; nx2=j; }
              }
            });
            cur=nx2; if(cur>=0) chained.add(cur);
          }
          defKillCredit(B,stats.kills[B.team]-pre);
          sfx('surge',B.x,B.y,1.6);
        } else B.cool=0.25;
      }
    }
    else if(B.type==='rail'){
      // Long-range precision answer to commanders, titans and other armour.
      B.cool-=dt;
      const rng=RAIL.rng*bldRngMul(B);
      let e=-1, best=-1;
      forUnitsIn(B.x,B.y,rng,j=>{
        if(uteam[j]===B.team||TYPES[utype[j]].air) return;
        const score=uhpm[j]*(ARM[utype[j]]===2?1.65:1);
        if(score>best){ best=score; e=j; }
      });
      if(e>=0){
        B.tang=Math.atan2(uy[e]-B.y,ux[e]-B.x)+Math.PI/2;
        if(B.cool<=0){
          const pw=drawEnergy(B.team,RAIL.e);
          B.cool=RAIL.cool*(pw<.5?2.1:1);
          const ma=B.tang-Math.PI/2;
          const mx=B.x+Math.cos(ma)*BT.rail.size*.715, my=B.y+Math.sin(ma)*BT.rail.size*.715;
          const pre=stats.kills[B.team];
          dealDamage(e,RAIL.dmg*bldDmgMul(B)*dmgMul('g',utype[e]),B.team,-1,dmgMul('g',utype[e]),'g');
          defKillCredit(B,stats.kills[B.team]-pre);
          const hit=beamHitXY(mx,my,ux[e],uy[e],TYPES[utype[e]].r);
          addBeam(mx,my,hit[0],hit[1],5,170,235,255,.24,'lance',B.team);
          for(let p=0;p<5;p++) addParticle(0,hit[0]+rr(-8,8),hit[1]+rr(-8,8),rr(-2,2),rr(-7,-1),.35,8,150,225,255);
          shake=Math.max(shake,2.2);
          sfx('surge',B.x,B.y,1.8);
        }
      } else if(B.cool<0) B.cool=.35;
    }
    else if(B.type==='minelaser'){
      B.cool-=dt;
      const rng=MINELASER.rng*bldRngMul(B);
      let e=-1,best=-1;
      forUnitsIn(B.x,B.y,rng,j=>{
        if(uteam[j]===B.team||TYPES[utype[j]].air) return;
        const score=(ARM[utype[j]]===2?2.2:1)*uhp[j];
        if(score>best){ best=score; e=j; }
      });
      if(e>=0){
        B.tang=Math.atan2(uy[e]-B.y,ux[e]-B.x)+Math.PI/2;
        if(B.cool<=0){
          const pw=drawEnergy(B.team,MINELASER.e);
          B.cool=MINELASER.cool*(pw<.5?2.15:1);
          const ma=B.tang-Math.PI/2;
          const mx=B.x+Math.cos(ma)*BT.minelaser.size*.72,my=B.y+Math.sin(ma)*BT.minelaser.size*.72;
          const mul=dmgMul('b',utype[e]);
          const pre=stats.kills[B.team];
          dealDamage(e,MINELASER.dmg*bldDmgMul(B)*mul,B.team,-1,mul,'b');
          defKillCredit(B,stats.kills[B.team]-pre);
          const mac=bfac==='syndicate';
          const hit=beamHitXY(mx,my,ux[e],uy[e],TYPES[utype[e]].r);
          addBeam(mx,my,hit[0],hit[1],5.5,mac?190:80,mac?96:215,255,.28,'lance',B.team);
          for(let p=0;p<3;p++) addParticle(0,hit[0]+rr(-5,5),hit[1]+rr(-5,5),rr(-2,2),rr(-6,-1),.24,7,mac?190:100,mac?105:225,255);
          sfx('laser',B.x,B.y,1.55);
        }
      } else if(B.cool<0) B.cool=.25;
    }
    else if(B.type==='missilebastion'){
      B.cool-=dt;
      if(B.cool<=0){
        const bio=bfac==='horde';
        const rng=MISSILE_BASTION.rng*bldRngMul(B),targets=[];
        const max=MISSILE_BASTION.tgts+((B.lvl||1)>=3?1:0);
        forUnitsIn(B.x,B.y,rng,j=>{
          if(uteam[j]!==B.team&&!TYPES[utype[j]].air&&targets.length<max) targets.push(j);
        });
        if(targets.length){
          const pw=drawEnergy(B.team,MISSILE_BASTION.e);
          B.cool=MISSILE_BASTION.cool*(pw<.5?2.2:1);
          B.tang=Math.atan2(uy[targets[0]]-B.y,ux[targets[0]]-B.x)+Math.PI/2;
          for(let n=0;n<targets.length;n++){
            const j=targets[n],mz=bldMuzzleXY(B,0.23,(n%2?1:-1)*4.1);
            const mx=mz[0], my=mz[1];
            const pk=fireProj(7,B.team,mx,my,ux[j],uy[j],165,MISSILE_BASTION.dmg*bldDmgMul(B),MISSILE_BASTION.aoe,j);
            if(pk>=0){ pwk[pk]='e'; pBio[pk]=bio?1:0; pSrcBld[pk]=B; }
            addParticle(1,mx,my,rr(-2,2),rr(-5,-1),.45,6,92,96,106);
          }
          shake=Math.max(shake,1.4); sfx('missile',B.x,B.y,1.25);
        } else B.cool=.3;
      }
    }
    else if(B.type==='plasma'){
      B.cool-=dt;
      const rng=PLASMA_CHARGER.rng*bldRngMul(B),e=findEnemy(B.x,B.y,B.team,rng,2);
      if(e>=0){
        B.tang=Math.atan2(uy[e]-B.y,ux[e]-B.x)+Math.PI/2;
        if(B.cool<=0){
          const pw=drawEnergy(B.team,PLASMA_CHARGER.e);
          B.cool=PLASMA_CHARGER.cool*(pw<.5?2.25:1);
          const bio=bfac==='horde',mac=bfac==='syndicate';
          const pk=fireProj(6,B.team,B.x,B.y,ux[e],uy[e],bio?125:150,PLASMA_CHARGER.dmg*bldDmgMul(B)*(bio?.88:1),PLASMA_CHARGER.aoe*(bio?1.28:1),e);
          if(pk>=0){ pwk[pk]='i'; pBio[pk]=bio?1:0; pSrcBld[pk]=B; }
          for(let p=0;p<5;p++) addParticle(0,B.x+rr(-6,6),B.y+rr(-6,6),rr(-3,3),rr(-8,-2),.35,9,bio?165:mac?190:105,bio?255:mac?105:210,bio?88:255);
          shake=Math.max(shake,1.8); sfx('surge',B.x,B.y,1.55);
        }
      } else if(B.cool<0) B.cool=.35;
    }
    else if(B.type==='stormcaller'){
      /* Three readable states, all simulation time: CHARGING (pays an energy
         drip, cool counts down), CHARGED (holds, humming, until a worthwhile
         mass of attackers is in the kill zone), FIRING (a spiral of shells
         walks across the target cluster over ~2.5s). A lone scout never
         triggers it; a commander always does. */
      if(B.stormInit==null){ B.stormInit=1; B.cool=STORM.cd; B.sq=null; B.sqT=0; }
      if(B.sq&&B.sq.length){                                   // FIRING
        B.sqT-=dt;
        while(B.sq.length&&B.sqT<=0){
          const S=B.sq.shift(); B.sqT+=STORM.cadence;
          const mz=bldMuzzleXY(B,0.17,rr(-4.8,4.8));
          const mx=mz[0], my=mz[1];
          const pk=fireProj(2,B.team,mx,my,S[0],S[1],118,STORM.dmg*bldDmgMul(B),STORM.aoe,-1);
          if(pk>=0){ pwk[pk]='e'; pBarrage[pk]=1; pArc[pk]=560+rr(0,120); pSrcBld[pk]=B; }
          addParticle(0,mx,my,0,0,.15,17, 255,214,130);
          addParticle(1,mx,my,rr(-4,4),rr(-10,-3),.7,9, 96,96,102);
          if(typeof artilleryWorldAudio==='function')artilleryWorldAudio('launch',mx,my,B.team,1.16);
          else sfx('cannon',B.x,B.y,1.2);
        }
        if(!B.sq.length) B.sq=null;
      } else if(B.cool>0){                                     // CHARGING
        if(payStream(B.team,0,(STORM.e/STORM.cd)*dt)){
          B.cool-=dt;
          if(B.cool<=0){
            B.cool=0;
            if(B.team===0){ toast('🌩 STORMCALLER CHARGED — holding for massed hostiles'); sfx('notify',B.x,B.y,.8); }
          }
          if(perfScale>0.4&&(tick&15)===0)
            addParticle(0,B.x+rr(-12,12),B.y+rr(-12,12),0,-7,.42,4, 150,210,255);
        }
      } else {                                                 // CHARGED — watch the approach
        if(perfScale>0.4&&(tick&23)===0)
          addParticle(3,B.x,B.y,0,0,.55,BT.stormcaller.size*1.45, 255,205,110);
        if((tick&7)===0){
          const rng=STORM.rng*bldRngMul(B), min2=STORM.minRng*STORM.minRng;
          let cx=0,cy=0,n=0,hero=-1;
          forUnitsIn(B.x,B.y,rng,j=>{
            if(!intelCanTarget(j,B.team)||TYPES[utype[j]].air) return;
            if(dist2(B.x,B.y,ux[j],uy[j])<min2) return;
            cx+=ux[j]; cy+=uy[j]; n++;
            if(TYPES[utype[j]].cat==='hero') hero=j;
          });
          if(n>=STORM.trigger||hero>=0){
            if(hero>=0&&n<STORM.trigger){ cx=ux[hero]; cy=uy[hero]; }
            else { cx/=n; cy/=n; }
            B.cool=STORM.cd; B.sq=[]; B.sqT=0;
            for(let s2=0;s2<STORM.shells;s2++){
              const a2=s2/STORM.shells*TAU*2.35, d2=Math.sqrt((s2+1)/STORM.shells)*98;
              B.sq.push([clamp(cx+Math.cos(a2)*d2,15,MAP-15),clamp(cy+Math.sin(a2)*d2,15,MAP-15)]);
            }
            B.tang=Math.atan2(cy-B.y,cx-B.x)+Math.PI/2;
            if(B.team===0) toast('🌩 STORMCALLER FIRING — '+STORM.shells+' shells inbound');
            addParticle(3,B.x,B.y,0,0,.7,BT.stormcaller.size*2.2, 255,190,90);
            shake=Math.max(shake,3); sfx('alarm',B.x,B.y,.9);
          }
        }
      }
    }
    else if(B.type==='nova'){
      if(B.cool>0) B.cool-=dt*(B.lvl===3?1.30:B.lvl===2?1.15:1);
    }
    else if(B.type==='sgen'){
      B.heal-=dt;
      if(B.heal<=0){
        B.heal=0.5;
        const sr=120+Math.max(0,(B.lvl||1)-1)*18;
        const unitHeal=9+Math.max(0,(B.lvl||1)-1)*5;
        const structureHeal=12+Math.max(0,(B.lvl||1)-1)*7;
        forUnitsIn(B.x,B.y,sr,j=>{
          if(uteam[j]===B.team && uhp[j]<uhpm[j]){
            uhp[j]=Math.min(uhpm[j],uhp[j]+unitHeal);
            if(Math.random()<0.15) addParticle(0,ux[j],uy[j],0,-6,.4,5, 120,255,170);
          }
        });
        for(const T2 of blds){
          if(!T2.alive||T2.team!==B.team||T2.prog<1||dist2(B.x,B.y,T2.x,T2.y)>(sr+25)*(sr+25)) continue;
          T2.shieldT=.75; // active Aegis field: 28% incoming damage reduction
          if(T2.hp<T2.hpm) T2.hp=Math.min(T2.hpm,T2.hp+structureHeal);
          if(Math.random()<.06) addParticle(0,T2.x+rr(-T2.r*.5,T2.r*.5),T2.y+rr(-T2.r*.5,T2.r*.5),0,-5,.35,4,100,225,255);
        }
      }
    }
    else if(B.type==='nest'){
      B.prodT+=dt; B.heal+=dt;
      const nTier=demoMode?1:infTier();
      /* The AMBIENT TRICKLE, not the eruptions, is what actually fills the map.
         Six bugs every five seconds from each of five hives is ~360 bugs a
         minute, and that standing carpet is what was killing the AI's attack
         waves halfway across the map — the player never saw an enemy army
         because there was a neutral one in between eating it. Eruptions are the
         drama; this is the load-bearing number, and it now scales too. */
      const nD=(typeof diffLvl==='function')?diffLvl():1;
      if(B.prodT>=Math.max(2,(WC.wild?5:7)-nTier)*[2.4,1.45,1][nD]*(broodIsEnemy()?1:2.2)){
        B.prodT=0;
        let near=0;
        forUnitsIn(B.x,B.y,320,j=>{ if(uteam[j]===2) near++; });
        const batch=Math.max(1,Math.round((4+nTier)*infQty()*1.6));
        if(near<(4+nTier*3)*10*infQty()*1.7 && populationCanSpawn(12,2,undefined,B.x,B.y)){
          const hiveSeat=(typeof broodIsEnemy==='function'&&broodIsEnemy())?populationDefaultSeat(1,B.x,B.y):undefined;
          for(let s2=0;s2<batch;s2++){
            const i=spawnUnit(12,2,B.x+rr(-40,40),B.y+rr(-40,40),hiveSeat);
            if(i>=0){ ustate[i]=2; const L=findLand(B.x+rr(-220,220),B.y+rr(-220,220)); utx[i]=L[0]; uty[i]=L[1]; }
          }
        }
      }
      if(B.heal>=Math.max(18,(WC.wild?24:46)-nTier*5)){
        B.heal=0;
        let alpha=0;
        forUnitsIn(B.x,B.y,400,j=>{ if(uteam[j]===2&&utype[j]===13) alpha++; });
        if(alpha<(nTier>=4?3:1) && populationCanSpawn(13,2,undefined,B.x,B.y)){
          const hiveSeat=(typeof broodIsEnemy==='function'&&broodIsEnemy())?populationDefaultSeat(1,B.x,B.y):undefined;
          const i=spawnUnit(13,2,B.x+rr(-30,30),B.y+rr(-30,30),hiveSeat);
          if(i>=0){ ustate[i]=2; utx[i]=B.x; uty[i]=B.y; }
        }
      }
    }
    else if(B.type==='fac'||B.type==='tgate'||B.type==='harbor'||B.type==='airfield'){
      // adjacency: generators touching this plant feed it (+12% build speed each, max 2)
      if(((tick+b)%90===0)||B.adj===undefined){
        B.adj=0; B.adjL=[];
        for(let o2=0;o2<blds.length;o2++){
          const O=blds[o2];
          if(O.alive&&O.team===B.team&&(O.type==='pgen'||O.type==='geo')&&O.prog>=1
             &&dist2(O.x,O.y,B.x,B.y)<(B.r+O.r+28)*(B.r+O.r+28)){ B.adj++; B.adjL.push(o2); }
        }
      }
      if(B.queue.length){
        if(B.type==='fac'&&(tick%14)===0&&perfScale>0.5){
          const szf=BT.fac.size;
          addParticle(1,B.x+rr(0.2,0.3)*szf,B.y-szf*0.34,rr(-2,2),rr(-10,-6),.9,5, 118,118,124);
        }
        const t=B.queue[0], T=TYPES[t];
        /* Pause BEFORE streaming payment. Previously a factory at the cap paid
           the full price, popped its queue, then spawnUnit failed and silently
           discarded the completed unit. Progress is retained just below the
           finish line and resumes as soon as a live slot opens. */
        const cmdSlot=commanderSlotForBuilding(B);
        if(!populationCanSpawn(t,B.team,cmdSlot)){
          B.prodT=Math.min(B.prodT,Math.max(0,T.bt-.02));
          continue;
        }
        const tractor=B.tractorT>0?1+.22*Math.min(2,B.tractorN||1):1;
        const facSpeed=(typeof factionDoctrineBuildSpeedMul==='function')?factionDoctrineBuildSpeedMul(B.team):1;
        const speed=(B.team===1?aiBuildMult:playerBuildMult)*facSpeed*(1+0.12*Math.min(2,B.adj||0))*fortOf(B.team).prod*tractor;
        const frac=dt*speed/T.bt;
        const facCost=(typeof factionDoctrineUnitCost==='function')?factionDoctrineUnitCost(T,B.team):{m:T.cm,e:T.ce};
        if(!payStream(B.team, facCost.m*frac, facCost.e*frac)){
          if(B.team===0){ if(resM[0]<facCost.m*frac) stallM=0.8; if(resE[0]<facCost.e*frac) stallE=0.8; }
          continue;
        }
        B.prodT+=dt*speed;
        if(B.prodT>=T.bt){
          B.prodT=0; B.queue.shift();
          if(B.repeat) B.queue.push(t);
          if(teamCount[B.team]<MAXU/2-10){
            const i=spawnUnit(t,B.team,B.x+rr(-14,14),B.y+ (B.team===0?B.r+16:-(B.r+16)),cmdSlot);
            if(i>=0){
              ustate[i]=2;
              let rx,ry;
              if(B.team===0 && B.rally){          // player rally point
                rx=clamp(B.rally.x+rr(-26,26),20,MAP-20);
                ry=clamp(B.rally.y+rr(-26,26),20,MAP-20);
                if(!TYPES[t].air && !TYPES[t].naval && dist2(B.x,B.y,rx,ry)>200*200)
                  ufield[i]=requestField(B.rally.x,B.rally.y);
              } else {
                rx=clamp(B.x+(B.team===0?rr(60,120):rr(-120,-60)),20,MAP-20);
                ry=clamp(B.y+(B.team===0?rr(60,120):rr(-120,-60)),20,MAP-20);
              }
              const L=TYPES[t].naval? (findWater(rx,ry)||[ux[i],uy[i]]) : findLand(rx,ry);
              utx[i]=L[0]; uty[i]=L[1];
              addParticle(0,ux[i],uy[i],0,0,.25,14, 160,230,255);
              if(B.team===0){ sfx('deploy',ux[i],uy[i],0.75); if(T.air) sfx('flyby',ux[i],uy[i],1); }
            }
          }
        }
      } else B.prodT=0;
    }
  }
}

