;
;
/* ============================================================================
   COUNTER HINT — the damage triangle, named
   ----------------------------------------------------------------------------
   THE DEFECT. sim.js carries a full counter system: `wk` (weapon class) and
   `tg` (what a chassis is allowed to shoot at) on every TYPES row, an armour
   class per row in ARM, and WKM — a weapon x armour matrix whose spread runs
   from x0.45 to x1.85. Bringing the wrong weapon is a four-fold swing. Nothing
   in the product ever names a single unit on either side of it.

   What the intel card already had (src/ui/hud.js, intelWeaponMatchups /
   intelArmorThreatMatchups) is the ABSTRACT half: "your weapon does x1.55 vs
   LIGHT", "your armour fears GAUSS". Both are true and neither is actionable,
   because the game never says which chassis are LIGHT and nothing in the roster
   is called "gauss". A player reading "x1.55 vs LIGHT" on a Rhino still cannot
   answer the only question they have, which is "so do I build this against the
   Strikers coming at me, or not".

   This file closes that gap: two more rows on the same card, in the same chip
   grid, listing REAL CHASSIS BY NAME on both sides.

   EVERY NUMBER HERE IS READ, NEVER AUTHORED. There is no counter table in this
   file. The lists are computed at card time from TYPES / ARM / WKM / tg, so a
   balance pass that moves a multiplier moves this UI with it, and a
   hand-written "Rhino beats Striker" table can never drift out of agreement
   with the simulation that decides the fight.

   HOW A MATCHUP IS DECIDED — three questions, in order:

     1. CAN IT SHOOT AT ALL?  `tg` is a hard gate, not a modifier: 'g' cannot
        touch air at any range, 'air' cannot touch ground. When one side can
        fire and the other cannot, that is the sharpest counter on the board
        (it is why the Vulture exists) and it is listed regardless of armour.
     2. DOES THE WEAPON BITE?  WKM[wk][ARM[target]] >= 1.15, which is the same
        threshold hud.js's intelUnitCounters() already uses, so this file and
        the chips directly above it can never disagree about what "strong
        against" means.
     3. WHICH OF THOSE MATTERS MOST?  Ranked by mass traded — see mfCtTrade.

   WHY MASS TRADED AND NOT RAW DAMAGE. A multiplier alone ranks the Goliath as
   the answer to a Striker, which is true and useless: the Goliath costs four
   times as much. The ranking is therefore the exchange the player actually
   pays — seconds-to-kill in both directions, scaled by the mass cost of both
   chassis. A value of 3 means "spend one of these and you delete three times
   its own mass in those". Every input (hp, dmg, cool, cm, the multiplier, the
   tg gate) is a live field on the same rows the simulation reads.

   NAMES ARE CANON, NOT FACTIONAL. Every other line on this card speaks in one
   army's voice (src/factext.js). These two rows deliberately do not, because
   the chassis being listed belong to WHOEVER IS SHOOTING AT YOU and their
   faction is not known at card time. One vocabulary that always denotes the
   same chassis is the only unambiguous option, and it is also the roster the
   design DB and the balance pass read.

   AIRLIFT SAFETY. sim.js stamps `targetMask` / `domainMask` onto TYPES in a
   loop that runs at ITS load time — before src/airlift.js appends the Atlas
   Skycrane and the two Massflesh bodies. Those three rows therefore carry no
   masks at all, so this file recomputes them from `tg` / `air` / `naval` using
   sim.js's own expressions whenever the stamped field is missing, rather than
   reading undefined and silently concluding that nothing can hit anything.
   ============================================================================ */

/* Domain bits. Same values as sim.js MF_DOM_*, restated because a top-level
   const in a classic script is a lexical binding and not a window property, and
   because this file must still evaluate if it is ever run without sim.js
   present (tools/extract-design-db.mjs does exactly that). */
const MF_CT_LAND=1, MF_CT_AIR=2, MF_CT_NAVAL=4;
/* "Strong against" threshold. Matches intelUnitCounters() in src/ui/hud.js so
   the named rows never contradict the abstract chips directly above them. */
const MF_CT_EDGE=1.15;
/* TWO CHIPS PER ROW, NOT THREE — measured, not chosen. The base card's chip
   grid is three columns because everything it ever put in one was a single
   short word (LIGHT / MEDIUM / HEAVY, KINETIC / BEAM / GAUSS). Chassis names
   are not: at 393px the name cell measures 64px and "DREADNOUGHT" renders
   84.2px, so a third of the roster came out as "DREADNOU…". A counter the
   player cannot read is not a counter, so these two rows drop to two columns
   (see mfCtInjectCSS) and the names fit. */
const MF_CT_MAX=2;
const MF_CT_ONEWAY_MAX=1;             // see mfCtTop — leave the triangle a slot

function mfCtType(i){ return (typeof TYPES!=='undefined'&&TYPES[i])||null; }
function mfCtDomainMask(T){
  if(!T) return 0;
  return T.domainMask || (T.air?MF_CT_AIR:T.naval?MF_CT_NAVAL:MF_CT_LAND);
}
function mfCtTargetMask(T){
  if(!T) return 0;
  return T.targetMask || (T.tg==='air'?MF_CT_AIR
    :T.tg==='g'?(MF_CT_LAND|MF_CT_NAVAL)
    :(MF_CT_LAND|MF_CT_AIR|MF_CT_NAVAL));
}
function mfCtArm(i){ return (typeof ARM!=='undefined'&&ARM[i]!=null)?ARM[i]:0; }
function mfCtArmName(i){ return (typeof ARM_NM!=='undefined'&&ARM_NM[mfCtArm(i)])||'LIGHT'; }
function mfCtWkRow(wk){
  if(typeof WKM==='undefined') return [1,1,1];
  return WKM[wk]||WKM.n||[1,1,1];
}
function mfCtWkName(wk){ return (typeof WK_NM!=='undefined'&&WK_NM[wk])||'WEAPON'; }
/* Armed means it can put damage on a hostile chassis. `wk:'n'` is NOT the test:
   the Massflesh Ascendant carries wk 'n' and 58 damage, and a Bulwark carries a
   weapon class and zero damage. Damage plus a cooldown is the honest test. */
function mfCtArmed(T){ return !!(T && T.dmg>0 && T.cool>0); }
function mfCtCanHit(A,D){ return !!(mfCtArmed(A) && (mfCtTargetMask(A)&mfCtDomainMask(D))); }
/* The multiplier attacker index `ai` applies to defender index `di`. */
function mfCtMul(ai,di){
  const A=mfCtType(ai); if(!A) return 1;
  return mfCtWkRow(A.wk)[mfCtArm(di)];
}
/* Damage per second actually landed, after the tg gate and the armour matrix. */
function mfCtEffDps(ai,di){
  const A=mfCtType(ai),D=mfCtType(di);
  if(!A||!D||!mfCtCanHit(A,D)) return 0;
  return A.dmg/A.cool*mfCtMul(ai,di);
}
/* MASS TRADED. How much of the defender's cost one attacker destroys per unit
   of its own cost, if the two stand still and shoot each other:

     t1 = D.hp / effDps(A->D)     seconds for A to kill D
     t2 = A.hp / effDps(D->A)     seconds for D to kill A
     trade = (t2/t1) * (D.cm/A.cm)

   Above 1 the attacker is the cost-efficient answer. The cost term is dropped
   for unpriced chassis (Brood wildlife and the Ascendant, cm 0) because there
   is no mass to trade for those; the pure duel ratio is what remains.
   Infinity is a result and not an error: it is what "the target cannot shoot
   back" means arithmetically, and it sorts correctly. */
function mfCtTrade(ai,di){
  const A=mfCtType(ai),D=mfCtType(di);
  if(!A||!D) return 0;
  const ea=mfCtEffDps(ai,di), ed=mfCtEffDps(di,ai);
  if(ea<=0) return 0;
  const cost=(A.cm>0&&D.cm>0)?(D.cm/A.cm):1;
  if(ed<=0) return Infinity;
  return ((A.hp/ed)/(D.hp/ea))*cost;
}
/* Tiebreak for the one-way group, where every trade is Infinity and Infinity
   minus Infinity is NaN. How much of the target's health one attacker strips
   per second, per unit of mass spent — "fastest and cheapest deletion first". */
function mfCtSpeed(ai,di){
  const A=mfCtType(ai),D=mfCtType(di);
  if(!A||!D||!D.hp) return 0;
  const cost=(A.cm>0&&D.cm>0)?(D.cm/A.cm):1;
  return mfCtEffDps(ai,di)/D.hp*cost;
}

/* ---------------------------------------------------------------------------
   THE PROFILE. Pure data, no DOM — this is the entry point for a test, for the
   tutorial, or for anything else that wants the triangle in list form. Returns
   null only when the roster has not loaded.
   --------------------------------------------------------------------------- */
function mfCounterProfile(tIdx){
  const A=mfCtType(tIdx); if(!A||typeof WKM==='undefined') return null;
  const beats=[],threats=[],len=TYPES.length;
  for(let di=0;di<len;di++){
    if(di===tIdx) continue;
    const D=mfCtType(di); if(!D) continue;
    /* Heroes are one per team and never a build answer, so listing them would
       print "beaten by Commander" on every card in the game and teach nothing. */
    if(D.cat==='hero') continue;
    /* ONLY ARMED CHASSIS ARE MATCHUPS, and this line is the whole reason the
       first draft of this file was worthless. Left in, an unarmed chassis is a
       one-way kill for EVERY armed unit in the game, so "THIS BEATS" opened
       with Constructor / Warden / Prospector on the Striker, the Rhino, the
       Goliath and the Scorcher alike — four different weapon classes reading
       the same three names, which is precisely the interchangeable-copy defect
       the intel card already suffers from. "You beat things that cannot shoot"
       is universally true and therefore teaches nothing. A no-reply matchup is
       only a counter when the loser HAS a weapon and the tg gate denies it. */
    if(!mfCtArmed(D)) continue;
    const aHits=mfCtCanHit(A,D), dHits=mfCtCanHit(D,A);
    if(aHits){
      const mul=mfCtMul(tIdx,di);
      if(!dHits)               beats.push({i:di,mul,trade:Infinity,speed:mfCtSpeed(tIdx,di),oneWay:1});
      else if(mul>=MF_CT_EDGE) beats.push({i:di,mul,trade:mfCtTrade(tIdx,di),speed:mfCtSpeed(tIdx,di),oneWay:0});
    }
    if(dHits){
      const mul=mfCtMul(di,tIdx);
      if(!aHits)               threats.push({i:di,mul,trade:Infinity,speed:mfCtSpeed(di,tIdx),oneWay:1});
      else if(mul>=MF_CT_EDGE) threats.push({i:di,mul,trade:mfCtTrade(di,tIdx),speed:mfCtSpeed(di,tIdx),oneWay:0});
    }
  }
  /* RANK: the gate, then the triangle, then the wallet.
       1. one-way first — a chassis that cannot answer is the hardest counter
          there is, and it is the only fact `tg` alone can teach.
       2. multiplier next, NOT mass traded. Ranking straight by the exchange
          buried the single most useful line on the Corvette's card: ION is
          x1.35 into HEAVY and x1.15 into MEDIUM, and because medium chassis are
          cheaper they traded better, so the card listed only medium targets and
          the anti-heavy role never appeared. The multiplier IS the lesson.
       3. mass traded decides WITHIN one multiplier tier — that is the honest
          job for it: five chassis share an armour class, and this picks which
          three are worth naming.
       4. speed breaks the one-way group, where every trade is Infinity (and
          Infinity minus Infinity is NaN, which || steps over). */
  const rank=(x,y)=>(y.oneWay-x.oneWay)||(y.mul-x.mul)||(y.trade-x.trade)
    ||(y.speed-x.speed)||(x.i-y.i);
  beats.sort(rank); threats.sort(rank);
  return {i:tIdx,name:A.name,armed:mfCtArmed(A),wk:A.wk,tg:A.tg||'a',
    arm:mfCtArm(tIdx),armName:mfCtArmName(tIdx),
    blind:A.tg==='g'?'AIR':A.tg==='air'?'GROUND':'',
    beats,threats};
}

/* ---------------------------------------------------------------------------
   RENDERING. Deliberately reuses the .ucMatchRow / .ucMatchChip classes the
   card already ships (src/styles/ui.css) so these rows read as the same object
   as the two above them rather than a second visual language bolted underneath.
   --------------------------------------------------------------------------- */
function mfCtEsc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function mfCtNum(v){ return v===Infinity?'∞':v>=10?v.toFixed(0):v.toFixed(1); }
function mfCtChip(e,side){
  const D=mfCtType(e.i)||{name:'?'};
  const beats=side==='beats';
  /* Chip anatomy is fixed by ui.css: i = icon, b = name, em = the multiplier,
     small = the fact that explains it. On the winning side that fact is the
     TARGET'S armour class ("kinetic x1.55 into LIGHT"); on the losing side it
     is the ATTACKER'S weapon class ("GAUSS x1.85 into your plate"). */
  const tag=beats?mfCtArmName(e.i):mfCtWkName(D.wk);
  const gate=e.oneWay?(beats?'it cannot shoot back':'you cannot shoot back')+' · ':'';
  /* A no-reply matchup does NOT win on its multiplier, and printing one is
     actively misleading: the Lancer's gauss is x0.95 into the Vulture and it
     still deletes it for free, so a green chip reading "0.95×" told the player
     the opposite of the truth. The number moves to the tooltip and the slot
     states the actual reason. */
  const headline=e.oneWay?'NO REPLY':(e.mul.toFixed(2)+'×');
  return '<span class="ucMatchChip '+(beats?'good':'bad')+'" title="'+mfCtEsc(D.name)+' — '
    +gate+'damage x'+e.mul.toFixed(2)+' · trades '+mfCtNum(e.trade)+'x its own mass">'
    +'<i>'+(e.oneWay?'⊘':(beats?'✓':'◆'))+'</i>'
    +'<b>'+mfCtEsc(String(D.name).toUpperCase())+'</b>'
    +'<em>'+headline+'</em><small>'+mfCtEsc(tag)+'</small></span>';
}
/* Which of a ranked list actually reaches the three chips.
   THE VULTURE PROBLEM: it is the only armed chassis in the roster that cannot
   return fire on the ground, so every ground unit in the game gets it as a
   one-way kill and — with one-way ranked first — it took the top slot on
   eleven consecutive cards. True, and monotonous enough to read as a bug. The
   cap keeps at most two no-reply entries so the armour triangle, which is the
   thing this feature exists to teach, always keeps at least one slot.
   The reserved slot is GIVEN BACK when there is nothing to put in it: an
   unarmed chassis is killed one-way by definition, so a strict cap printed the
   Bulwark only two of its three killers and left a hole for no reason. */
function mfCtTop(list){
  const head=[],rest=[],spare=[];
  for(const e of list){
    if(!e.oneWay) rest.push(e);
    else if(head.length<MF_CT_ONEWAY_MAX) head.push(e);
    else spare.push(e);
  }
  return head.concat(rest,spare).slice(0,MF_CT_MAX);
}
function mfCtRowHTML(label,list,side,empty){
  const cells=mfCtTop(list).map(e=>mfCtChip(e,side)).join('')
    || '<span class="mfCtNone">'+mfCtEsc(empty)+'</span>';
  return '<div class="ucMatchRow mfCtRow'+(side==='beats'?'':' incoming')+'">'
    +'<strong>'+label+'</strong><div>'+cells+'</div></div>';
}
function mfCounterHintHTML(tIdx){
  const P=mfCounterProfile(tIdx); if(!P) return '';
  const rows=mfCtRowHTML('THIS BEATS',P.beats,'beats',
      P.armed?'NO ARMOUR EDGE — IT WINS ON NUMBERS, NOT MATCHUP'
             :'UNARMED — IT COUNTERS NOTHING, ESCORT IT')
    +mfCtRowHTML('BEATEN BY',P.threats,'threats','NO WEAPON CLASS PUNISHES THIS ARMOUR');
  let why='⊘ = CANNOT RETURN FIRE · RANKED BY MULTIPLIER, THEN MASS TRADED · '
    +mfCtWkName(P.wk)+' WEAPON, '+P.armName+' PLATING';
  if(P.blind) why='⚠ CANNOT TARGET '+P.blind+' AT ALL · '+why;
  else if(!P.armed) why='⚠ UNARMED · '+why;
  return rows+'<div class="mfCtWhy">'+why+'</div>';
}

/* Style for the only two elements the base card has no class for: the
   empty-list cell and the caption. Injected rather than added to
   src/styles/ui.css so the feature is one file and cannot half-land. */
function mfCtInjectCSS(){
  if(typeof document==='undefined'||document.getElementById('mfCtCSS')) return;
  const s=document.createElement('style');
  s.id='mfCtCSS';
  s.textContent=
    /* Two columns, and the name may take a second line at a word boundary so
       "MASSFLESH ASCENDANT" reads in full instead of ellipsising. `break-word`
       and not `anywhere`: a mid-word break on "DREADNOUGHT" is as unreadable
       as the ellipsis it replaces, and at two columns it no longer needs one. */
     '#unitCard .mfCtRow>div{grid-template-columns:repeat(2,minmax(0,1fr))}'
    +'#unitCard .mfCtRow .ucMatchChip b{white-space:normal;overflow-wrap:break-word;'
    +'text-overflow:clip;line-height:1.08}'
    +'#unitCard .mfCtNone{grid-column:1/-1;padding:5px;border-radius:6px;'
    +'border:1px dashed rgba(134,180,208,.26);color:#8fb0c6;'
    +'font:800 9px/1.25 var(--fT);letter-spacing:.05em}'
    +'#unitCard .mfCtWhy{margin-top:6px;color:#8fb0c6;font:700 8px/1.35 var(--fT);'
    +'letter-spacing:.07em}';
  (document.head||document.documentElement).appendChild(s);
}

/* Attach to whatever the base card produced. Two shapes exist: an armed unit
   gets a .ucMatchups grid (append into it, so the 5px row gap stays uniform);
   an unarmed one gets a .ucCounter warning instead and no grid at all, so one
   is created ahead of the ammo line. */
function mfCounterHintAttach(tIdx){
  if(typeof document==='undefined') return false;
  const card=document.getElementById('unitCard');
  if(!card||card.querySelector('.mfCtRow')) return false;
  const html=mfCounterHintHTML(tIdx);
  if(!html) return false;
  mfCtInjectCSS();
  let host=card.querySelector('.ucMatchups');
  if(!host){
    host=document.createElement('div');
    host.className='ucMatchups mfCtHost';
    const ammo=card.querySelector('.ucAmmo');
    if(ammo) card.insertBefore(host,ammo); else card.appendChild(host);
  }
  host.insertAdjacentHTML('beforeend',html);
  return true;
}

/* Wrap, do not edit: src/ui/hud.js owns showUnitTypeCard and src/airlift.js
   already wraps it twice for its own chips. This file loads last, so it is the
   outermost wrapper and appends after every other contributor has finished.
   The failure is swallowed on purpose — a derivation bug must never be able to
   blank the intel card in the middle of a match. */
if(typeof showUnitTypeCard==='function'){
  const mfCtShowUnitTypeBase=showUnitTypeCard;
  showUnitTypeCard=function(tIdx,pinned,kit){
    mfCtShowUnitTypeBase(tIdx,pinned,kit);
    try{ mfCounterHintAttach(tIdx); }
    catch(e){ console.warn('counterhint: '+(e&&e.message)); }
  };
}
