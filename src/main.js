;
;
/* ============================================================
   MAIN — game setup, loop, win/lose, wiring
   ============================================================ */
let running=false, paused=false, demoMode=false, gameEnded=false;
let matchLive=false;            // false during the carrier drop / deploy phase
let difficulty=1;
let defenseFocus=0;             // 0 combined arms, 1 fortress / tower-defence cadence
let infestationOn=true;         // neutral map nests, guards, spread, eruptions and tides
let deploymentPackage='prepared'; // supported opening for newcomers; classic start remains selectable
let hudDeck='orders';           // one secondary command row at a time on phones
/* Phone command dock is platoon-first (4 groups, deck tabs). Army/box/rings
   still treat the army as one blob. Stage A HUD (after Stage 0 screenshots,
   not this slice): ring LOD, hologram sampling, box-select via spatial hash.
   Army select does not auto-split into P1–P4. selInfo lists 3 unit types. */
let activeWarMode='standard';   // Standard, Co-op and MMO share one planetary catalogue

/* First Contact is deliberately NOT the Tutorial. Training owns KEEL,
   objectives, highlights and its own mode; Standard gets only a short series
   of ordinary notice-rail prompts during a new career's first three prepared
   landings. Keeping this at the battle boundary stops Training state ever
   leaking into a normal session again. */
let firstContactTimers=[];
function clearFirstContactGuide(){
  for(const t of firstContactTimers) clearTimeout(t);
  firstContactTimers.length=0;
}
function startFirstContactGuide(){
  clearFirstContactGuide();
  if(activeWarMode!=='standard'||!assistedOpeningActive()||deploymentPackage!=='prepared') return;
  if(typeof TUT!=='undefined'&&TUT.trainingMode) return;
  const battle=(META.standardMatches|0)+1;
  const say=(delay,msg)=>firstContactTimers.push(setTimeout(()=>{
    if(running&&matchLive&&activeWarMode==='standard'&&!(typeof TUT!=='undefined'&&TUT.trainingMode)) toast(msg);
  },delay));
  if(battle===1) say(900,'◇ FIRST CONTACT 1 / 3 — Standard medium theatre (*_medium). Locked stars stay on the galaxy. HQ is down. HUD pop reads n/1K.');
  else say(900,'◇ FIRST CONTACT '+battle+' / 3 — HQ, Reactor and Factory are deployed. Income next. HUD pop reads n/1K — 1K is this commander\'s cap.');
  say(11000,'◆ CLAIM MASS — place an Extractor on a nearby deposit, then protect the route back to base.');
  say(28500,'⚔ FORM A SCREEN — queue a small force. SINGLE-TAP ground is attack-move (fight on the way). DOUBLE-TAP open ground is retreat (break contact, no fighting).');
  say(56000,'⌖ HOLD TERRITORY — construction stays inside HQ range until a Targeting Array extends your network.');
}

function setHudDeck(deck,quiet){
  const valid=['orders','platoons','abilities','view'];
  hudDeck=valid.includes(deck)?deck:'orders';
  document.body.classList.toggle('hudViewDeck',hudDeck==='view');
  document.querySelectorAll('.hudDeckBtn').forEach(b=>b.classList.toggle('on',b.dataset.deck===hudDeck));
  for(const id of ['camRow','tacRow','grpRow','hotSlots']){
    const row=$(id); if(row) row.style.display='none';
  }
  const rowId={orders:'tacRow',platoons:'grpRow',abilities:'hotSlots',view:'camRow'}[hudDeck];
  const row=$(rowId);
  if(row&&hudDeck!=='orders') row.style.display=hudDeck==='abilities'?(row.children.length?'flex':'none'):'flex';
  if(hudDeck==='abilities'&&typeof hotSlotSync==='function') hotSlotSync(true);
  if(typeof updateSelInfo==='function') updateSelInfo();
  if(typeof hotSlotPlace==='function') requestAnimationFrame(hotSlotPlace);
  if(!quiet){sfx('ui');buzz(8);}
}
function showHudDock(on,deck){
  document.body.classList.toggle('hudTacticalDock',!!on);
  const tabs=$('hudDeckTabs'); if(tabs) tabs.style.display=on?'flex':'none';
  const primary=$('primaryRow'); if(primary) primary.style.display=on?'flex':'none';
  if(on) setHudDeck(deck||hudDeck,true);
  else for(const id of ['tacRow','grpRow','hotSlots']){const row=$(id);if(row)row.style.display='none';}
}

/* Eight authored deployment plateaus.  They are deliberately inset rather
   than sitting on the border: the camera can frame them, builders have room to
   expand, and every zone can be raised to dry land by the terrain generator. */
const START_ZONES=[
  {id:'nw',n:'1',x:.18,y:.18},{id:'n', n:'2',x:.50,y:.15},
  {id:'ne',n:'3',x:.82,y:.18},{id:'e', n:'4',x:.85,y:.50},
  {id:'se',n:'5',x:.82,y:.82},{id:'s', n:'6',x:.50,y:.85},
  {id:'sw',n:'7',x:.18,y:.82},{id:'w', n:'8',x:.15,y:.50}
];
/* MAP is baked into terrain, pathfinding, fog and shaders. Resizing that buffer
   at runtime would desynchronise all four, so map size defines a playable
   theatre inside the fixed 2.6 km terrain. Spawn separation, neutral resource
   bounds and resource counts all use the same theatre scale; this produces a
   genuinely faster Compact match without allocating a second terrain stack. */
const BATTLEFIELD_PRESETS={
  compact:{nm:'COMPACT',km:'2.2 KM',dur:'10\u201314 MIN',world:.6875,start:.72,spread:.90,nodes:16,geysers:1,site:.90,haz:.92,
           ds:'Close spawns, concentrated resource fields and quick clashes.'},
  standard:{nm:'STANDARD',km:'2.6 KM',dur:'15\u201322 MIN',world:.8125,start:.86,spread:1.08,nodes:20,geysers:2,site:1.06,haz:1.04,
             ds:'More breathing room for expansion, scouting and multi-front defence.'},
  large:{nm:'LARGE',km:'3.2 KM',dur:'20\u201330 MIN',world:1,start:1,spread:1.20,nodes:24,geysers:3,site:1.22,haz:1.14,
         ds:'Maximum separation, additional fields and room for multi-front wars.'}
};
let battlefieldPreset='standard';
const DEPLOYMENT_PACKAGES={
  prepared:{nm:'PREPARED LANDING',em:'\u25c8',ds:'HQ, Reactor, Factory and Constructor deploy together. Recommended while learning.'},
  expedition:{nm:'EXPEDITION LANDING',em:'\u25c7',ds:'HQ and Constructor only. Classic build-from-zero RTS opening.'}
};
function deploymentPackageDef(){return DEPLOYMENT_PACKAGES[deploymentPackage]||DEPLOYMENT_PACKAGES.prepared;}
function deploymentGraceSeconds(diff){return [180,120,75][clamp(diff|0,0,2)];}
function assistedOpeningActive(){return ((META&&META.standardMatches)||0)<3;}
function openingContactRemaining(){
  if(!matchLive||typeof AI==='undefined'||AI.openingGrace==null)return 0;
  return Math.max(0,AI.openingGrace-(AI.t||0));
}
function battlefieldPresetKey(key){ return key==='grand'?'large':(BATTLEFIELD_PRESETS[key]?key:'standard'); }
function battlefieldPresetDef(){ return BATTLEFIELD_PRESETS[battlefieldPresetKey(battlefieldPreset)]; }
function battlefieldPresetHint(){
  const P=battlefieldPresetDef();
  return P.km+' \u00b7 '+battlefieldFactionCap()+' FACTIONS MAX \u00b7 EST. '+P.dur+' \u2014 '+P.ds;
}
function battlefieldPlayBounds(pad){
  const P=battlefieldPresetDef(),span=MAP*(P.world||1),inset=(MAP-span)*.5;
  const lo=inset+(pad||0),hi=MAP-inset-(pad||0);
  return lo<hi?{lo,hi,span}:{lo:MAP*.5-40,hi:MAP*.5+40,span:80};
}
/* THEATRE SILHOUETTES.
   Map size still owns one stable square allocation, but the playable edge is
   not the same square stamped onto every biome.  Each theme receives a
   deterministic superellipse plus low-frequency authored inlets/notches.
   The same formula is duplicated in the terrain vertex shader and sampled by
   the holographic border, so gameplay, red line and exclusion art agree. */
function battlefieldShapeStyle(){
  const D=(typeof MAPDEFS!=='undefined'&&MAPDEFS[curMap])?MAPDEFS[curMap]:null;
  return D&&D.seabed?1:(D&&D.crater?2:
    (D&&D.relief>=1.28?3:(curTheme==='ashland'?2:curTheme==='arctic'?3:0)));
}
function battlefieldShapeRadius(angle,pad){
  const B=battlefieldPlayBounds(0),half=Math.max(45,(B.hi-B.lo)*.5-(pad||0));
  const style=battlefieldShapeStyle(),ca=Math.abs(Math.cos(angle)),sa=Math.abs(Math.sin(angle));
  const power=style===1?3.15:style===2?6.25:style===3?4.15:5.0;
  const base=half/Math.pow(Math.pow(ca,power)+Math.pow(sa,power),1/power);
  let shape;
  if(style===1)      shape=.945+.024*Math.sin(angle*3+.65)+.016*Math.sin(angle*7-1.10);
  else if(style===2) shape=.958+.020*Math.sin(angle*5+.30)+.012*Math.sin(angle*9+1.20);
  else if(style===3) shape=.948+.025*Math.sin(angle*2-.80)+.016*Math.sin(angle*6+.45);
  else               shape=.966+.014*Math.sin(angle*4+.35)+.010*Math.sin(angle*7-.55);
  return Math.max(36,base*shape);
}
function battlefieldSignedDistance(x,y,pad){
  const B=battlefieldPlayBounds(0),cx=(B.lo+B.hi)*.5,cy=cx,dx=x-cx,dy=y-cy;
  const r=Math.hypot(dx,dy),a=r>0.001?Math.atan2(dy,dx):0;
  return battlefieldShapeRadius(a,pad)-r;
}
function battlefieldContains(x,y,pad){ return battlefieldSignedDistance(x,y,pad)>=0; }
function battlefieldClampPoint(x,y,pad){
  const B=battlefieldPlayBounds(0),cx=(B.lo+B.hi)*.5,cy=cx,dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy);
  const a=r>0.001?Math.atan2(dy,dx):0,limit=battlefieldShapeRadius(a,pad);
  if(r<=limit)return [x,y];
  const q=limit/Math.max(.001,r);return [cx+dx*q,cy+dy*q];
}
function battlefieldBoundaryPoint(angle,pad){
  const B=battlefieldPlayBounds(0),c=(B.lo+B.hi)*.5,r=battlefieldShapeRadius(angle,pad);
  return [c+Math.cos(angle)*r,c+Math.sin(angle)*r];
}
/* Max orthographic span for THIS theatre.
   SPAN_MAX=3400 is the engine ceiling, sized for the 3.2 km Large mesh. Compact
   and Standard are smaller playable discs inside that same mesh, so a single
   ceiling lets the view run into exclusion haze, the heightfield rim, and the
   skirt void. Pan stays inside the playable square (red rungs). FAR zoom is
   allowed to spend Compact/Standard's unused MAP inset so infantry can finish
   converting to icons (~2196 span at VH=915) without Large seeing the mesh
   skirt (MAP-88 still wins there). Pitch and aspect both change the ground
   footprint — a tilted portrait view is tall, a landscape view is wide — so
   this is not a per-preset constant. */
function battlefieldViewInner(){
  const B=typeof battlefieldPlayBounds==='function'?battlefieldPlayBounds(0):{lo:0,hi:MAP,span:MAP};
  const play=Math.max(80,B.span||(B.hi-B.lo));
  /* play-24 keeps a hair inside the theatre square so the red rungs sit on
     the visible edge. MAP-88 keeps Large's heightfield rim off-screen without
     cropping the rungs (they sit ~60wu inside MAP). Compact/Standard are
     already inset from MAP, so the theatre wins there. Pan/look-at uses this
     tight square; FAR zoom uses battlefieldZoomInner() so icons can engage. */
  return Math.min(play-24,MAP-88);
}
function battlefieldZoomInner(){
  const inner=battlefieldViewInner();
  const B=typeof battlefieldPlayBounds==='function'?battlefieldPlayBounds(0):{lo:0,hi:MAP,span:MAP};
  const play=Math.max(80,B.span||(B.hi-B.lo));
  /* Compact FAR used to sit at ~2020 span — below the infantry icon-out
     crossing (~2196 at VH=915), so the strategic tier never fully took over.
     Spend some of Compact/Standard's unused MAP inset as border haze (already
     fog-coloured) so FAR zoom reaches that band. 560 wu is past infantry
     full-convert with margin; MAP-88 still blocks Large's heightfield rim.
     Pan stays on the tight inner. */
  const haze=Math.min(560,Math.max(0,(MAP-play)*0.56));
  return Math.min(inner+haze,MAP-88);
}
function spanMaxNow(){
  const inner=battlefieldZoomInner();
  const pitch=clamp(typeof camPitch==='number'?camPitch:1.19,
    typeof PITCH_MIN==='number'?PITCH_MIN:1.05,
    typeof PITCH_MAX==='number'?PITCH_MAX:1.50);
  const sinP=Math.max(0.30,Math.sin(pitch));
  /* Fit the pitched ground HEIGHT inside `inner`. The previous formula used
     max(width,height) of the ground AABB, so a landscape window was capped
     at inner/aspect (~1748 at 1080p) — below the infantry icon crossing.
     Screen-right may hang into border haze; shaders already fade that to
     fog colour. Portrait phones were already height-limited, so their cap
     only moves by battlefieldZoomInner(). Yaw is left out on purpose:
     turning used to shrink span and fight the icon band. */
  const k=1/sinP;
  const hi=typeof SPAN_MAX==='number'?SPAN_MAX:3400;
  const lo=spanMinNow();
  return clamp(inner/Math.max(0.35,k),lo,hi);
}
/* mesh.js SPAN_MIN=420 is a company view. On a 412×900 phone that floor never
   reaches commander/unit tactical mesh (~200–270). Icon fade is footprint-
   based and still off at 200; the old floor just hid the mesh band. */
function spanMinNow(){ return 200; }
/* mesh.js owns clampCam / zoomBy / camTick. Do not edit that file for this —
   FS3D/AO work lives there. Takeover keeps the pitch clamp and rewrites span
   + look-at against the current theatre. distTarget must be clamped too:
   camTick lerps orthoSpan toward it, so leaving it at SPAN_MAX would fight
   the cap every frame. */
const _mfClampCamMesh=clampCam;
clampCam=function(){
  const lo=spanMinNow(), mx=spanMaxNow();
  if(orthoSpan>mx) orthoSpan=mx;
  if(distTarget>mx) distTarget=mx;
  const want=orthoSpan;
  _mfClampCamMesh();
  /* mesh clampCam raises anything under 420. Restore the tactical floor. */
  if(want<SPAN_MIN) orthoSpan=clamp(want,lo,mx);
  if(orthoSpan>mx) orthoSpan=mx;
  if(orthoSpan<lo) orthoSpan=lo;
  distTarget=clamp(distTarget,lo,mx);
  camDist=orthoSpan;
  cam.z=1400/orthoSpan;
  /* LOOK-AT, not view-hull. Subtracting max(hw,depth) on a tall phone ate
     the slack box (~±515 at span 1500) and left SW HQ (576,2624) outside
     it — pan stuck and HQ follow yanked back to centre every frame. Haze
     already hides overhang. */
  const B=battlefieldPlayBounds(0);
  const over=80+160*(1-clamp(orthoSpan/Math.max(1,mx),0,1));
  cam.x=clamp(cam.x,B.lo-over,B.hi+over);
  cam.y=clamp(cam.y,B.lo-over,B.hi+over);
};
zoomBy=function(f){ distTarget=clamp(distTarget/f,spanMinNow(),spanMaxNow()); };
const _mfCamTickMesh=camTick;
camTick=function(dt){
  /* mesh camTick follows even after camUser(). Pinch/pan must win. */
  if(camFollow>=0&&typeof camAutoAllowed==='function'&&!camAutoAllowed()) camFollow=-1;
  _mfCamTickMesh(dt);
};
/* MEDIUM/LOW scissor projects the ground AABB. A pitched portrait view
   leaves fog-clear strips (the grey border). Full frame on tall phones. */
if(typeof mfGfxScissor==='function'){
  const _mfGfxScissorMesh=mfGfxScissor;
  mfGfxScissor=function(on){
    if(!on){ _mfGfxScissorMesh(false); return; }
    if(typeof VH==='number'&&typeof VW==='number'&&VH>VW){
      if(typeof gl!=='undefined'&&gl) gl.disable(gl.SCISSOR_TEST);
      return;
    }
    _mfGfxScissorMesh(true);
  };
}
let playerStartZone='sw', spawnPick='player';
let aiSlots=[
  {on:true, diff:1,zone:'ne',ally:false,behavior:'balanced'},
  {on:false,diff:1,zone:'nw',ally:false,behavior:'balanced'},
  {on:false,diff:1,zone:'se',ally:false,behavior:'balanced'}
];
/* Theatre size owns participant density and the 1000-pop-per-slot lock:
   Compact 2 / Standard 3 / Large 4 seats → 2000 / 3000 / 4000 total. Rows stay
   visible but MAP-locked so a larger war table expands the match. This does
   not raise FACTION_POP_CAP (still 1000 per seat). Authored seats: Compact
   duel SW–NE; second enemy SE never NW; ally NW; Large 1v3 four corners.
   Adjacent cardinals (~1028 m) are crush — never a default. */
const BATTLEFIELD_FACTION_CAP={compact:2,standard:3,large:4};
const SPAWN_CORNERS=['nw','ne','se','sw'];
const SPAWN_FAIR_MIN_M=1400;
function battlefieldFactionCap(){return BATTLEFIELD_FACTION_CAP[populationTheatre()]||3;}
function battlefieldAiCap(){return Math.max(1,battlefieldFactionCap()-1);}
function spawnZoneIsCorner(id){ return SPAWN_CORNERS.indexOf(id)>=0; }
function normalizeAiSlotsForBattlefield(){
  const max=battlefieldAiCap();
  for(const A of aiSlots)A.behavior=typeof aiBehaviorKey==='function'?aiBehaviorKey(A.behavior):'balanced';
  for(let i=max;i<aiSlots.length;i++)aiSlots[i].on=false;
  if(!aiSlots.slice(0,max).some(A=>A.on))aiSlots[0].on=true;
  /* A skirmish still needs an opponent. Compact therefore cannot spend its
     only AI slot on an ally; larger theatres can trade any additional slot. */
  if(!aiSlots.slice(0,max).some(A=>A.on&&!A.ally)){
    const first=aiSlots.findIndex((A,i)=>i<max&&A.on);if(first>=0)aiSlots[first].ally=false;
  }
  if(spawnPick!=='player'){
    const i=+spawnPick.slice(2);if(i>=max||!aiSlots[i]||!aiSlots[i].on)spawnPick='player';
  }
  reseatSpawnPlanner(max);
}
function reseatSpawnPlanner(max){
  /* Stage 0 MAP contract. Compact is a SW–NE duel; extras are already off.
     On Standard/Large, allies claim NW, the second enemy is SE (never NW —
     that is the ally chair / west-edge crush vs player SW), and a third enemy
     takes the leftover corner so Large 1v3 is four corners. Cardinals snap
     off because SW–W is ~1028 m. */
  if(max==null) max=battlefieldAiCap();
  if((typeof populationTheatre==='function'?populationTheatre():'standard')==='compact'){
    playerStartZone='sw';
    aiSlots[0].on=true; aiSlots[0].ally=false; aiSlots[0].zone='ne';
    return;
  }
  if(!spawnZoneIsCorner(playerStartZone)) playerStartZone='sw';
  let allyN=0;
  for(let i=0;i<aiSlots.length;i++){
    if(i>=max||!aiSlots[i].on||!aiSlots[i].ally) continue;
    if(allyN===0){
      if(playerStartZone==='nw') playerStartZone='sw';
      aiSlots[i].zone='nw';
    }
    allyN++;
  }
  const taken=new Set([playerStartZone]);
  for(let i=0;i<aiSlots.length;i++) if(i<max&&aiSlots[i].on&&aiSlots[i].ally) taken.add(aiSlots[i].zone);
  const enemyIdx=[];
  for(let i=0;i<aiSlots.length;i++) if(i<max&&aiSlots[i].on&&!aiSlots[i].ally) enemyIdx.push(i);
  const nE=enemyIdx.length;
  /* 1v1/1v2 omit NW so the second enemy cannot sit on the ally chair. 1v3
     puts NW last so AI 2 (index 1) still prefers SE. */
  const prefer=nE>=3?['ne','se','nw','sw']:['ne','se','sw'];
  for(const i of enemyIdx){
    const A=aiSlots[i];
    const nwBanned=A.zone==='nw'&&(i===1||nE<3);
    const ok=spawnZoneIsCorner(A.zone)&&!taken.has(A.zone)&&!nwBanned;
    if(!ok){
      const pick=prefer.find(z=>!taken.has(z)&&!(i===1&&z==='nw'))||SPAWN_CORNERS.find(z=>!taken.has(z));
      if(pick) A.zone=pick;
    }
    taken.add(A.zone);
  }
  allyN=0;
  for(let i=0;i<aiSlots.length;i++){
    if(i>=max||!aiSlots[i].on||!aiSlots[i].ally) continue;
    allyN++;
    if(allyN===1){ taken.add(aiSlots[i].zone); continue; }
    if(spawnZoneIsCorner(aiSlots[i].zone)&&!taken.has(aiSlots[i].zone)){ taken.add(aiSlots[i].zone); continue; }
    const pick=SPAWN_CORNERS.find(z=>!taken.has(z));
    if(pick){ aiSlots[i].zone=pick; taken.add(pick); }
  }
}
function startZone(id){
  const Z=START_ZONES.find(z=>z.id===id)||START_ZONES[0],s=battlefieldPresetDef().start;
  return {id:Z.id,n:Z.n,x:.5+(Z.x-.5)*s,y:.5+(Z.y-.5)*s};
}
function activeAiSlots(){ return aiSlots.map((s,i)=>({...s,slot:i})).filter(s=>s.on); }
function activeEnemySlots(){return activeAiSlots().filter(S=>!S.ally);}
function activeAllySlots(){return activeAiSlots().filter(S=>S.ally);}
function spawnAiRosterPick(fac, used){
  /* Identity only. Chassis stays FACTIONS[fac].hero (4 / 28 / 29 / 30).
     applyCommanderChoice is the player's doctrine stack — never run it here
     or three AI seats would multiply player perks. */
  const key=typeof commanderFactionKey==='function'?commanderFactionKey(fac):fac;
  const roster=(typeof COMMANDER_ROSTERS!=='undefined'&&COMMANDER_ROSTERS[key])||[];
  let pick=null;
  for(let i=0;i<roster.length;i++) if(used.indexOf(roster[i].id)<0){ pick=roster[i]; break; }
  if(!pick&&roster.length) pick=roster[used.length%roster.length];
  if(pick) used.push(pick.id);
  return pick;
}
function skirmishSpawnPoints(){
  const P=startZone(playerStartZone), out=[{kind:'player',slot:-1,x:P.x*MAP,y:P.y*MAP,diff:0,zone:P.id}];
  for(const A of activeAiSlots()){
    const Z=startZone(A.zone); out.push({kind:A.ally?'ally':'ai',ally:!!A.ally,slot:A.slot,x:Z.x*MAP,y:Z.y*MAP,diff:A.diff,zone:Z.id,behavior:A.behavior});
  }
  return out;
}
function farFromStartZones(x,y,d){
  for(const S of skirmishSpawnPoints()) if(dist2(x,y,S.x,S.y)<d*d) return false;
  return true;
}
function spawnTargetZone(key){
  if(key==='player') return playerStartZone;
  const i=+String(key).replace('ai',''); return aiSlots[i]?aiSlots[i].zone:playerStartZone;
}
function spawnEnemyNwBanned(key,zone){
  /* AI 2 (index 1) is never an enemy on NW — that chair is the ally / 1v3
     leftover. A two-front also must not park its second enemy there. */
  if(zone!=='nw'||key==='player') return false;
  const i=+String(key).replace('ai','');
  if(aiSlots[i]==null||aiSlots[i].ally) return false;
  if(i===1) return true;
  let n=0;
  for(let k=0;k<aiSlots.length;k++) if(aiSlots[k].on&&!aiSlots[k].ally) n++;
  if(!aiSlots[i].on) n++;
  return n<3;
}
function setSpawnTargetZone(key,zone){
  if(!spawnZoneIsCorner(zone)){
    toast('CARDINAL STARTS ARE CRUSH — use a corner');
    return false;
  }
  if((typeof populationTheatre==='function'?populationTheatre():'standard')==='compact'&&zone!=='sw'&&zone!=='ne'){
    toast('COMPACT DUEL IS SW–NE');
    return false;
  }
  if(spawnEnemyNwBanned(key,zone)){
    toast('SECOND ENEMY IS SE — NW IS THE ALLY CHAIR');
    return false;
  }
  const old=spawnTargetZone(key);
  let occupied='';
  if(playerStartZone===zone) occupied='player';
  for(let i=0;i<aiSlots.length;i++) if(aiSlots[i].on&&aiSlots[i].zone===zone) occupied='ai'+i;
  if(occupied&&occupied!==key){
    if(occupied==='player') playerStartZone=old;
    else aiSlots[+occupied.slice(2)].zone=old;
  }
  if(key==='player') playerStartZone=zone;
  else { const i=+key.slice(2); if(aiSlots[i]) aiSlots[i].zone=zone; }
  return true;
}
function drawSpawnPlanner(){
  const cv3=$('spawnMap'); if(!cv3||typeof drawMapPreview!=='function') return;
  drawMapPreview(cv3,MAPDEFS[curMap]||MAPDEFS.vanguard,curTheme,false);
  const c=cv3.getContext('2d'), W=cv3.width,H=cv3.height;
  const picked=spawnTargetZone(spawnPick);
  for(const Z0 of START_ZONES){
    const Z=startZone(Z0.id),x=Z.x*W,y=Z.y*H, sel=Z.id===picked;
    c.beginPath(); c.arc(x,y,sel?14:11,0,TAU);
    c.fillStyle='rgba(5,13,23,.82)'; c.fill();
    c.lineWidth=sel?3:1.5; c.strokeStyle=sel?'#fff':'rgba(210,235,250,.72)'; c.stroke();
    c.fillStyle='#d9edf8'; c.font='800 10px sans-serif'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(Z.n,x,y+.5);
  }
  const marks=[{key:'player',zone:playerStartZone,label:'YOU',col:'#41c8ff',fac:playerFaction}];
  for(let i=0;i<aiSlots.length;i++) if(aiSlots[i].on) marks.push({key:'ai'+i,zone:aiSlots[i].zone,
    label:(aiSlots[i].ally?'ALLY ':'ENEMY ')+(i+1),col:aiSlots[i].ally?'#66e5a2':'#ff5d43',
    fac:aiSlots[i].ally?playerFaction:(aiFactionSel==='random'?'':aiFactionSel),behavior:aiSlots[i].behavior});
  for(const M of marks){
    const Z=startZone(M.zone),x=Z.x*W,y=Z.y*H;
    c.beginPath(); c.arc(x,y,11,0,TAU); c.fillStyle='rgba(4,12,21,.94)'; c.fill();
    c.lineWidth=2.5;c.strokeStyle=M.col;c.stroke();
    const I=typeof facIconCanvas==='function'?facIconCanvas(M.fac,drawSpawnPlanner):null;
    if(I)c.drawImage(I,x-8,y-8,16,16);
    else{c.fillStyle=M.col;c.font='900 11px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(M.fac?'\u25c8':'?',x,y+.5);}
    c.font='800 8px sans-serif';c.textAlign='center';c.textBaseline='bottom';c.fillStyle='#fff';c.fillText(M.label,x,y-13);
    c.font='800 7px sans-serif';c.textBaseline='top';c.fillStyle=M.col;c.fillText(aiBehaviorDef(M.behavior).nm.slice(0,3),x,y+13);
  }
}
function renderSpawnPlanner(){
  const pick=$('spawnPick'), list=$('aiSlotList'); if(!pick||!list) return;
  normalizeAiSlotsForBattlefield();
  const aiMax=battlefieldAiCap();
  const live=activeAiSlots(),same=live.every(A=>A.diff===live[0].diff);
  const conquestFloor=typeof mfConquestDifficultyFloor==='function'?mfConquestDifficultyFloor(curMap):0;
  let gdiff=$('globalDiffRow');
  if(!gdiff){
    gdiff=document.createElement('div'); gdiff.id='globalDiffRow'; gdiff.className='optRow';
    list.parentNode.insertBefore(gdiff,list);
  }
  gdiff.innerHTML=['EASY','NORMAL','HARD'].map((n,d)=>'<button type="button" class="globalDiff dbtn'+(same&&d===live[0].diff?' on':'')+(d<conquestFloor?' mapFloor':'')+'" data-d="'+d+'">'+n+'</button>').join('');
  gdiff.querySelectorAll('.globalDiff').forEach(b=>b.addEventListener('pointerdown',e=>{
    e.stopPropagation();
    if(+b.dataset.d<conquestFloor){toast('CONQUEST THREAT FLOOR — this battlefield begins at '+['EASY','NORMAL','HARD'][conquestFloor]);sfx('deny');return;}
    difficulty=+b.dataset.d;
    for(const A of aiSlots) if(A.on) A.diff=difficulty;
    if(typeof META!=='undefined'&&META&&!(typeof storyCampaignPlanBorrowed==='function'&&storyCampaignPlanBorrowed())){
      META.setup=META.setup||{}; META.setup.d=difficulty; if(typeof metaSave==='function') metaSave();
    }
    renderSpawnPlanner(); initAudio(); sfx('ui');
  }));
  document.querySelectorAll('.globalDiff').forEach(b=>{b.classList.toggle('on',same&&+b.dataset.d===live[0].diff);b.classList.toggle('mapFloor',+b.dataset.d<conquestFloor);});
  const targets=[{key:'player',nm:'YOU',on:true}].concat(aiSlots.map((s,i)=>({key:'ai'+i,nm:'AI '+(i+1),on:s.on})));
  pick.innerHTML=targets.map(T=>{
    const Z=startZone(spawnTargetZone(T.key));
    return '<button class="spawnTarget'+(spawnPick===T.key?' on':'')+(T.on?'':' off')+'" data-sp="'+T.key+'">'+T.nm+'<b>ZONE '+Z.n+'</b></button>';
  }).join('');
  pick.querySelectorAll('.spawnTarget').forEach(b=>b.addEventListener('pointerdown',e=>{
    e.stopPropagation(); const k=b.dataset.sp;
    if(k!=='player'){
      const i=+k.slice(2);
      if(i>=aiMax){toast('LARGER THEATRE REQUIRED \u2014 '+battlefieldFactionCap()+' factions maximum here');sfx('deny');return;}
      if(!aiSlots[i].on) aiSlots[i].on=true;
    }
    spawnPick=k; renderSpawnPlanner(); sfx('ui');
  }));
  list.innerHTML=aiSlots.map((A,i)=>{
    const Z=startZone(A.zone),locked=i>=aiMax,behavior=aiBehaviorKey(A.behavior),BD=aiBehaviorDef(behavior);
    const behaviorOptions=Object.keys(AI_BEHAVIOR_TYPES).map(k=>'<option value="'+k+'"'+(k===behavior?' selected':'')+(!aiBehaviorAvailable(k)?' disabled':'')+'>'+AI_BEHAVIOR_TYPES[k].em+' '+AI_BEHAVIOR_TYPES[k].nm+(k==='naval'&&!aiBehaviorAvailable(k)?' — NO WATER':'')+'</option>').join('');
    return '<div class="aiSlot'+(A.on?'':' disabled')+(locked?' mapLocked':'')+'" data-ai="'+i+'">'
      +'<div class="aiSlotHead"><span class="aiSlotName">'+(typeof facIcon==='function'?facIcon(A.ally?playerFaction:(aiFactionSel==='random'?'':aiFactionSel),20,'aiMapFac'):'')+'<i>AI COMMANDER '+(i+1)+'</i></span><span class="aiSlotZone">ZONE '+Z.n+'</span>'
      +'<button class="aiRole '+(A.ally?'ally':'enemy')+'">'+(A.ally?'ALLY':'ENEMY')+'</button>'
      +'<button class="aiToggle'+(A.on?' on':'')+'">'+(locked?'MAP LOCK':(A.on?'ENABLED':'OFF'))+'</button></div>'
      +'<div class="aiBehaviorRow"><label>BEHAVIOR</label><select class="aiBehavior" aria-label="AI behavior">'+behaviorOptions+'</select></div>'
      +'<p class="aiBehaviorHint">'+BD.ds+'</p>'
      +'<div class="aiDiffRow">'+['EASY','NORMAL','HARD'].map((n,d)=>'<button class="aiDiff'+(A.diff===d?' on':'')+(d<conquestFloor?' mapFloor':'')+'" data-ad="'+d+'">'+n+'</button>').join('')+'</div></div>';
  }).join('');
  list.querySelectorAll('.aiSlot').forEach(row=>{
    const i=+row.dataset.ai,locked=i>=aiMax;
    row.querySelector('.aiSlotName').addEventListener('pointerdown',()=>{ if(aiSlots[i].on){spawnPick='ai'+i;renderSpawnPlanner();sfx('ui');} });
    row.querySelector('.aiRole').addEventListener('pointerdown',()=>{
      if(locked){toast('LARGER THEATRE REQUIRED');sfx('deny');return;}
      if(!aiSlots[i].ally&&activeEnemySlots().length===1){toast('At least one enemy faction is required');sfx('deny');return;}
      aiSlots[i].on=true;aiSlots[i].ally=!aiSlots[i].ally;spawnPick='ai'+i;
      normalizeAiSlotsForBattlefield();difficulty=Math.max(...activeEnemySlots().map(A=>A.diff));renderSpawnPlanner();sfx('confirm');
    });
    row.querySelector('.aiBehavior').addEventListener('change',e=>{
      if(locked){renderSpawnPlanner();sfx('deny');return;}
      const k=e.target.value;if(!aiBehaviorAvailable(k)){toast('NAVAL AI REQUIRES A CONNECTED OCEAN OR RIVER');renderSpawnPlanner();sfx('deny');return;}
      aiSlots[i].behavior=k;aiSlots[i].on=true;spawnPick='ai'+i;renderSpawnPlanner();sfx('confirm');
    });
    row.querySelector('.aiToggle').addEventListener('pointerdown',()=>{
      if(locked){toast('LARGER THEATRE REQUIRED \u2014 choose '+(i===1?'Standard':'Large')+' for this faction slot');sfx('deny');return;}
      if(aiSlots[i].on&&!aiSlots[i].ally&&activeEnemySlots().length===1){ toast('At least one enemy faction is required'); return; }
      aiSlots[i].on=!aiSlots[i].on;
      if(!aiSlots[i].on&&spawnPick==='ai'+i) spawnPick='player';
      else if(aiSlots[i].on) spawnPick='ai'+i;
      normalizeAiSlotsForBattlefield();difficulty=Math.max(...activeEnemySlots().map(A=>A.diff)); renderSpawnPlanner(); sfx('ui');
    });
    row.querySelectorAll('.aiDiff').forEach(b=>b.addEventListener('pointerdown',()=>{
      if(locked){toast('LARGER THEATRE REQUIRED');sfx('deny');return;}
      if(+b.dataset.ad<conquestFloor){toast('CONQUEST THREAT FLOOR — this battlefield begins at '+['EASY','NORMAL','HARD'][conquestFloor]);sfx('deny');return;}
      aiSlots[i].diff=+b.dataset.ad; aiSlots[i].on=true; spawnPick='ai'+i;
      difficulty=Math.max(...activeEnemySlots().map(A=>A.diff)); renderSpawnPlanner(); sfx('ui');
    }));
  });
  const fair=$('spawnFairness');
  if(fair){
    const S=skirmishSpawnPoints(); let md=1e9;
    for(let a=0;a<S.length;a++) for(let b=a+1;b<S.length;b++) md=Math.min(md,Math.sqrt(dist2(S[a].x,S[a].y,S[b].x,S[b].y)));
    const crush=md<SPAWN_FAIR_MIN_M;
    fair.style.background=crush?'rgba(90,18,22,.55)':'';
    fair.style.borderColor=crush?'rgba(255,93,67,.45)':'';
    fair.innerHTML=crush
      ?'<b style="color:#ff6d55">\u26A0 CRUSH '+Math.round(md)+'m</b><span style="color:#ffb3a6">Nearest commanders under '+SPAWN_FAIR_MIN_M+'m — corners only (SW–NE duel, SE second enemy, NW ally)</span>'
      :'<b>\u2713 1 PLAYER · '+activeAllySlots().length+' AI ALLY · '+activeEnemySlots().length+' ENEMY</b><span>3 mass + 1 energy site each · nearest commanders '+Math.round(md)+'m apart</span>';
  }
  drawSpawnPlanner();
}
function initSpawnPlanner(){
  const cv3=$('spawnMap'); if(!cv3||cv3.dataset.wired) return;
  cv3.dataset.wired='1';
  cv3.addEventListener('pointerdown',e=>{
    e.stopPropagation(); const r=cv3.getBoundingClientRect(),u=(e.clientX-r.left)/r.width,v=(e.clientY-r.top)/r.height;
    let best=START_ZONES[0],bd=1e9;
    for(const Z0 of START_ZONES){ const Z=startZone(Z0.id),d=(u-Z.x)*(u-Z.x)+(v-Z.y)*(v-Z.y);if(d<bd){bd=d;best=Z;} }
    if(setSpawnTargetZone(spawnPick,best.id)===false){ sfx('deny'); return; }
    renderSpawnPlanner(); sfx('confirm');
  });
  renderSpawnPlanner();
}

function resetWorld(){
  clearFirstContactGuide();
  ualive.fill(0); usel.fill(0);
  freeList=[]; unitHigh=0; teamCount[0]=0; teamCount[1]=0;
  if(typeof populationResetLedgers==='function') populationResetLedgers();
  if(typeof uAllyBase!=='undefined') uAllyBase.fill(-1);
  rebuildGrid();                                   // spatial grid must never hold stale chains
  heroIdx=-1; enemyHeroIdx=-1; enemyHeroIdxs.length=0;
  blds.length=0; rebuildBGrid();
  craters.length=0; wrecks.length=0; rubbles.length=0;
  pFree=[]; pHigh=0; palive.fill(0); pSplit.fill(0);
  pSmokeT.fill(0);pFlightCue.fill(0);artShellSmoke.length=0;
  flife.fill(0); fCount=0; fHead=0;
  resM[0]=resM[1]=260; resE[0]=resE[1]=1000;
  RES_MCAP[0]=RES_MCAP[1]=MCAP0; RES_ECAP[0]=RES_ECAP[1]=ECAP0;
  mSpend=eSpend=mSpendAcc=eSpendAcc=spendT=0; mWasted=0;
  aiHpMult=1;
  stats.kills=[0,0,0]; stats.built=[0,0]; stats.t=0; stats.nests=0; stats.reclaimed=0;
  heroLvl=1; heroXp=0; heroXpNext=100; pendingLevels=0;
  heroDmgMult=1; heroRegen=14; commanderHpMult=1;armyDmgMult=1; stimDmgMult=1; boostDmgT=0; bonusMass=0; bonusEnergy=0;
  playerBuildMult=1; blastRadius=110;
  titanCount[0]=0; titanCount[1]=0; teamCount[2]=0;
  beams.length=0; fogCov.fill(0); fogSeen.fill(0); fogSources.fill(0); fogScans.length=0;
  if(typeof mmPings!=='undefined') mmPings.length=0;
  meteors.length=0; stormTimer=200;
  fields.length=0; ffNext=0; ufield.fill(-1); ushielded.fill(0); umarch.fill(0);
  ufireT.fill(0); uheal.fill(0);
  if(typeof uCrash!=='undefined'){ uCrash.fill(0); ualt.fill(0); uCtime.fill(0); }
  ubroodLed.fill(0);uMineT.fill(0);uMineNode.fill(-1);broodMassT=0;
  researched={}; resDone=0; researchCarry={}; resHpMult=1; resRngMult=1; resEnergyMult=1;
  if(typeof resetTypeBoosts==='function') resetTypeBoosts();
  resBldHpMult=1; resDefDmgMult=1; labBufferMult=1;
  deformQ.length=0; musicInt=0; lastDmgTotal=0; dmgAccum=[0,0,0]; dayT=0.08; shLife.fill(0);
  /* FIVE entries: commander.js declares abUnlock with five and develop.js's
     craftable EMP module writes abUnlock[4]. Resetting to a four-entry array
     silently truncated it, so a paid-for research reward could never be set.
     (The ability itself is still not dispatched — see the note in commander.js.) */
  abCool=[0,0,0,0,0]; abUnlock=[false,false,false,false,false]; aiming=-1;
  /* Per-match timers that outlived their match: the alarm suppressor and the
     jump-jet cooldown. Both are compared against a clock that restarts at 0. */
  if(typeof alarmT!=='undefined') alarmT=0;
  if(typeof heroJumpCool!=='undefined') heroJumpCool=0;
  if(typeof artBarrageReset==='function') artBarrageReset();
  if(typeof classAbilityReset==='function') classAbilityReset();
  salvageMult=1; bldHpMult=1; matchClock=timeLimit; goalDone=false;
  infestT=230; nestSpreadT=170; infestLvl=0; tideT=260; birds.length=0; bugQ.length=0;
  if(typeof hazReset==='function') hazReset();          // map hazard clock
  uhold.fill(0);uPatrolRoute.fill(-1);uPatrolStep.fill(0);uPatrolSlot.fill(0);patrolRoutes.length=0;
  uMoveCohort.fill(-1);uCohesion.fill(1);moveCohorts.fill(null);moveCohortNext=0;
  armRally=-1;armPatrol=false;patrolDraft=null;armFormation=false;orderPreview=null;orderConfirm=null;novaSrc=-1;
  carrier.active=false; carrier.phase=2; carrier.alt=0; carrier.clearance=0; carrier.fac='nova';
  aiDeployArrivals.length=0; matchLive=false;
  camYaw=yawTarget=0.6; camPitch=pitchTarget=1.19; orthoSpan=distTarget=1500; camFollow=-1;
  crates.length=0; crateT=55; sitePickupT=28; boostDmgT=0;
  for(let g=0;g<4;g++){ctrlGroups[g]=[];groupForms[g]=0;}
  activePlatoon=-1;updateGroupBadges();patrolButtonState();setFormation(0,true);
  tl.length=0; tlLast=0;
  placing=null; openBld=-1; gameEnded=false;
  if(typeof clearWaveWarning==='function') clearWaveWarning();
  umode.fill(0); umodeT.fill(0); relief.length=0; wrecks.length=0;
  fortTimer=0; fortTierSeen=[0,0,0]; FORT.length=0; reclTip=0; razeTip=0; lastPlaceRot=0;
  const _mb=$('modeBtn'); if(_mb) _mb.style.display='none';
  showHudDock(false); $('camRow').style.display='flex';
  setupDeposits(); setupDoodads();
  closeMenus(); cancelPlace();
  $('gameOver').style.display='none';
  $('levelUp').style.display='none';
}

function setupOnBtn(sel){ return document.querySelector(sel); }
function commitSetupFromDom(){
  /* Deploy can highlight a pick whose live global was overwritten (training
     snapshot restore, shared .fbtn paint). Launch copies the buttons. Scoped
     per row so the player's Nova chip cannot be read as the enemy. */
  const mc=document.querySelector('#mapRow .mapCard.sel');
  if(mc&&mc.dataset.map&&typeof MAPDEFS!=='undefined'&&MAPDEFS[mc.dataset.map]
     &&typeof syncBattlefieldFromMap==='function'){
    const key=mc.dataset.map;
    const keepMedium=typeof activeWarMode!=='undefined'&&activeWarMode==='standard'
      &&MAPDEFS[key].size==='compact'&&MAPDEFS[curMap]&&MAPDEFS[curMap].size==='standard';
    if(!keepMedium) syncBattlefieldFromMap(key);
  }
  if(typeof activeWarMode!=='undefined'&&activeWarMode==='standard'
     &&typeof theatreMapId==='function'&&MAPDEFS[curMap]&&MAPDEFS[curMap].size!=='standard'
     &&window._mfTheatrePick!=='compact'&&window._mfTheatrePick!=='large'){
    const pk=typeof planetForMap==='function'?planetForMap(curMap):null;
    const P=pk&&typeof PLANETS!=='undefined'&&PLANETS[pk];
    const R=P&&P.regions.find(r=>r.maps&&r.maps.indexOf(curMap)>=0);
    const med=R&&theatreMapId(R.maps,'standard');
    if(med) syncBattlefieldFromMap(med);
  }
  const ons=[...document.querySelectorAll('#facRow .fbtn.on')];
  const specific=ons.find(b=>b.dataset.f&&b.dataset.f!=='random');
  if(specific&&(typeof FACTIONS!=='undefined'&&FACTIONS[specific.dataset.f])) aiFactionSel=specific.dataset.f;
  else if(!(aiFactionSel&&(aiFactionSel==='random'||(typeof FACTIONS!=='undefined'&&FACTIONS[aiFactionSel])))){
    const fac=ons[0];
    if(fac&&fac.dataset.f&&(fac.dataset.f==='random'||(typeof FACTIONS!=='undefined'&&FACTIONS[fac.dataset.f]))) aiFactionSel=fac.dataset.f;
    else if(typeof META!=='undefined'&&META&&META.setup&&META.setup.f
            &&(META.setup.f==='random'||(typeof FACTIONS!=='undefined'&&FACTIONS[META.setup.f])))
      aiFactionSel=META.setup.f;
  }
  if(typeof persistEnemyFacPick==='function') persistEnemyFacPick();
  const pf=setupOnBtn('#pfacRow .fbtn.on');
  if(pf&&pf.dataset.f&&typeof playableFactions==='function'&&playableFactions().includes(pf.dataset.f))
    playerFaction=pf.dataset.f;
  const cmd=setupOnBtn('#commanderRow .commanderCard.on')||setupOnBtn('#mfQuickCommanders .mfQuickCommander.on');
  if(cmd) playerCommanderId=cmd.dataset.commander||cmd.dataset.mfCommander||playerCommanderId;
  const gl=setupOnBtn('#goalRow .glbtn.on'); if(gl&&gl.dataset.g) goalSel=gl.dataset.g;
  const tm=setupOnBtn('#timeRow .tmbtn.on'); if(tm) timeLimit=+tm.dataset.t||0;
  const pc=setupOnBtn('#paceRow .pcbtn.on'); if(pc) resPace=+pc.dataset.p;
  const cr=setupOnBtn('#crRow .crbtn.on'); if(cr) crateRate=crateRateBase=+cr.dataset.c;
  const inf=setupOnBtn('#infestRow .ifbtn.on'); if(inf) infestationOn=!!+inf.dataset.i;
  const df=setupOnBtn('#defFocusRow .dfbtn.on'); if(df) defenseFocus=+df.dataset.df;
  const pkg=setupOnBtn('#deployPkgRow .pkgbtn.on');
  if(pkg&&DEPLOYMENT_PACKAGES[pkg.dataset.pkg]) deploymentPackage=pkg.dataset.pkg;
  const gd=setupOnBtn('#globalDiffRow .globalDiff.on')||setupOnBtn('.globalDiff.on');
  if(gd){
    difficulty=+gd.dataset.d;
    for(const A of aiSlots) if(A.on&&!A.ally) A.diff=difficulty;
  } else if(typeof activeEnemySlots==='function'&&activeEnemySlots().length)
    difficulty=Math.max(...activeEnemySlots().map(A=>A.diff));
  const wc=setupOnBtn('#wcRowSel .wbtn.on'); if(wc) wcChoice=+wc.dataset.w;
  const th=setupOnBtn('#threatRow .thBtn.on');
  if(th&&typeof META!=='undefined'&&META) META.threatSel=+th.dataset.t||META.threatSel;
}
let matchSetupArmed=false;
function armMatchSetup(){ commitSetupFromDom(); matchSetupArmed=true; }
function consumeMatchSetup(){ if(!matchSetupArmed) return; matchSetupArmed=false; commitSetupFromDom(); }
function mfRescueHiddenSetupCards(){
  /* Galaxy flow hides leftover .setupScroll > .setupCard. Landing package was
     never moved into Advanced, so Prepared/Expedition never reached the match.
     Rescue without touching the GALAXY→SYSTEM→PLANET stage machine. */
  const body=$('mfAdvancedBody'); if(!body) return;
  const el=$('deployPkgRow'), card=el&&el.closest('.setupCard');
  if(card&&!body.contains(card)){ card.removeAttribute('data-setup-tab'); body.appendChild(card); }
}

function newSkirmish(){
  consumeMatchSetup();
  /* Pull the player faction's radio bank now, while the loading screen is up,
     so the first order of the match speaks instead of falling back to whatever
     the OS narrator happens to be. */
  try{ if(typeof voPrewarm==='function'&&typeof radioFaction==='function') voPrewarm((radioFaction()||{}).id||'nova'); }catch(e){}
  stopAttract();          // the menu diorama gives way to the real match
  normalizeAiSlotsForBattlefield(); // final contract gate before any ally can spawn
  resetWorld();
  demoMode=false;
  fogOn=META.settings.fog!==false;
  pickWildcards(wcChoice);                    // danger modifiers (chosen count, random draw)
  applyMetaPerks();                           // permanent Armory perks
  if(typeof applyModules==='function') applyModules();   // crafted modules, on top
  /* Capture the readied loadout BEFORE invApplyLoadout consumes it. The
     ready[] array is cleared at apply-time, but the pre-match modifier splash
     and consumable HUD need to show what was brought. */
  if(typeof invApplyLoadout==='function'){
    const _b=invBag();
    _mfMatchCons=_b.ready.map(id=>INV_CONSUMABLES.find(c=>c.id===id)).filter(Boolean);
    _mfMatchGear=[];
    for(const s of ['weapon','armor','utility']){ const g=INV_GEAR.find(x=>x.id===_b.equipped[s]); if(g) _mfMatchGear.push(g); }
    invApplyLoadout();
  }
  if(typeof applyCommanderChoice==='function')applyCommanderChoice();
  if(typeof applyFactionDoctrineChoice==='function')applyFactionDoctrineChoice();
  if(WC.meteor||(typeof mapHazardKey==='function'&&mapHazardKey(curMap)==='meteor')) stormTimer=40+Math.random()*30;
  renderWcRow();
  /* ---- orbital drop ----------------------------------------------------
     Spawns are inset from the map corners. The camera clamps its VIEW to the
     battlefield, so a ship parked at 16% of the map sat in a corner the
     camera physically could not centre — you could neither see it properly
     nor fly it. 26% keeps both starts comfortably reachable while leaving
     plenty of ground between them. */
  const starts=skirmishSpawnPoints(), PS=starts[0];
  const pxs=PS.x, pys=PS.y;
  matchLive=false;
  carrier.active=true; carrier.phase=0; carrier.alt=980; carrier.clearance=0;
  /* The drop is the FIRST thing anyone sees of their own army, and it was
     always Nova — "Nova is the current playable army" stopped being true once
     the faction picker went into battle setup. It now arrives in the colours
     and hardware of whatever the player actually chose. The query override
     stays, ahead of the choice, so QA can still inspect any registered
     deployer without touching progression. */
  const carrierFacQa=(location.search.match(/[?&]carrierfac=(nova|terran|frontline|federation|legion|ascendancy|red|syndicate|machine|coalition|horde|brood|swarm|infestation)/)||[])[1]||'';
  const carrierFacOwn=(typeof playerKitKey==='function')?playerKitKey():'nova';
  carrier.fac=typeof dropFactionKey==='function'?dropFactionKey(carrierFacQa||carrierFacOwn):'nova';
  carrier.x=pxs; carrier.y=pys; carrier.tx=pxs; carrier.ty=pys; carrier.ang=0; carrier.dust=0;
  // AI start (mirrored)
  /* The enemy fields its FACTION'S hero, not a mirror of yours. The Legion
     walks a siege battery, the Syndicate a shielded hover platform, the Horde a
     brood hive that keeps spawning — so "kill the enemy Commander" is a
     different fight depending on who you drew. */
  aiPickFaction();          // must precede the hero spawn AND setupNests()
  /* Upload only this match's enemy architecture kit. Deferring the other two
     avoids keeping three unused structure libraries resident on phones. */
  if(typeof ensureBldFactionMeshes==='function'){
    ensureBldFactionMeshes(AI.fac);
    /* The player's own architecture too. bldMeshFor() would fault it in lazily,
       but that lands on the frame the first structure finishes rather than
       here in the carrier phase where an allocation is invisible. */
    if(typeof playerKitKey==='function') ensureBldFactionMeshes(playerKitKey());
    /* Neutral nests use Horde architecture even when another faction owns the
       enemy base. Upload it during the carrier/deployment phase, where a short
       allocation is invisible, instead of hitching the first frame a nest
       enters view. If infestation is disabled no second kit is resident. */
    if(infestationOn&&AI.fac!=='horde') ensureBldFactionMeshes('horde');
  }
  const FH=FACTIONS[AI.fac]||FACTIONS.legion;
  const ownFH=(typeof FACTIONS!=='undefined'&&FACTIONS[playerFaction])||null;
  const aiBases=[],allyBases=[];
  const enemyRosterUsed=[], allyRosterUsed=playerCommanderId?[playerCommanderId]:[];
  for(const S of starts.slice(1)){
    const exs=S.x,eys=S.y,egx=Math.round(exs/SNAP_GRID)*SNAP_GRID,egy=Math.round(eys/SNAP_GRID)*SNAP_GRID;
    const ally=!!S.ally,team=ally?0:1,fac=ally?carrierFacOwn:AI.fac;
    /* Chassis is the faction hero type. Identity is a distinct roster id so
       Large 1v3 is not three Vexes / Renns / Sovereigns. */
    const heroType=ally?(ownFH&&ownFH.hero!=null?ownFH.hero:4):(FH.hero!=null?FH.hero:4);
    const rosterFac=ally?(typeof commanderFactionKey==='function'?commanderFactionKey(playerFaction):playerFaction)||'nova':AI.fac;
    const cmd=spawnAiRosterPick(rosterFac, ally?allyRosterUsed:enemyRosterUsed);
    const h=spawnUnit(heroType,team,exs,eys,S.slot);
    if(h>=0){if(ally)uAllyBase[h]=S.slot;else enemyHeroIdxs.push(h);}
    const a=Math.atan2(MAP*.5-eys,MAP*.5-exs),fx=Math.cos(a),fy=Math.sin(a),rx=-fy,ry=fx;
    const baseB=(type,x,y)=>{const B=addBld(type,team,x,y,true);B.fac=fac;B.aiBaseSlot=S.slot;B.aiBehavior=aiBehaviorKey(S.behavior);if(ally)B.allyAI=S.slot;return B;};
    baseB('pgen',egx+fx*105+rx*45,egy+fy*105+ry*45);
    baseB('fac',egx+fx*105-rx*70,egy+fy*105-ry*70);
    if(S.diff>=1)baseB('turret',egx+fx*178,egy+fy*178);
    if(S.diff>=2){
      baseB('turret',egx+fx*125+rx*155,egy+fy*125+ry*155);
      baseB('pgen',egx+fx*45-rx*145,egy+fy*45-ry*145);
    }
    const guard=[1,3,5][S.diff];
    for(let k=0;k<guard;k++){
      const ty=S.diff>=2&&k>2?1:0;
      const u=spawnUnit(ty,team,egx+fx*(210+rr(-30,45))+rx*rr(-100,100),egy+fy*(210+rr(-30,45))+ry*rr(-100,100),S.slot);
      if(u>=0){ustate[u]=1;utx[u]=egx;uty[u]=egy;if(ally)uAllyBase[u]=S.slot;}
    }
    let bd=1e12,bi=-1;
    for(let d=0;d<deposits.length;d++){ const D=deposits[d];
      if(D.taken||depositTier(D)<=0) continue; const dd=dist2(D.x,D.y,exs,eys); if(dd<bd){bd=dd;bi=d;} }
    if(bi>=0){ deposits[bi].taken=true; baseB('mex',deposits[bi].x,deposits[bi].y); }
    /* Store the generation alongside the slot so ai.js can tell "still the same
       Commander" from "that slot was recycled into somebody else's unit". */
    const base={x:egx,y:egy,diff:S.diff,slot:S.slot,behavior:aiBehaviorKey(S.behavior),commander:h,fac,
                commanderId:cmd&&cmd.id,commanderNm:cmd&&cmd.nm,
                commanderGen:(h>=0&&typeof ugen!=='undefined')?ugen[h]:null,spawnT:18,orderT:4,mass:220,energy:900};
    (ally?allyBases:aiBases).push(base);
    aiDeployArrivals.push({x:egx,y:egy,fac,ang:a+Math.PI,depart:0});
  }
  livingEnemyCommanders();
  setupNests();
  setupRelics();
  /* Deterministic device/browser QA scene. It is inert in every normal game;
     the query hook lets release checks reproduce a roof crossing or a city
     landing without relying on a lucky random camera route. */
  const carrierQa=(location.search.match(/[?&]carrierqa=(fly|land)/)||[])[1]||'';
  let carrierQaFocus=null;
  if(carrierQa&&relics.length){
    const R=relics.find(o=>o.alive&&o.kind===0)||relics.find(o=>o.alive);
    if(R){
      carrier.phase=1; carrier.alt=0; carrier.ang=0;
      if(carrierQa==='fly'){
        carrier.x=clamp(R.x-220,70,MAP-70); carrier.y=R.y;
        carrier.tx=clamp(R.x+220,70,MAP-70); carrier.ty=R.y;
        carrier.clearance=0;
      } else {
        carrier.x=R.x; carrier.y=R.y; carrier.tx=R.x; carrier.ty=R.y;
        carrier.clearance=carrierObstacleClearanceAt(R.x,R.y,0);
      }
      carrierQaFocus=R;
      window.__carrierQa={mode:carrierQa,roofX:R.x,roofY:R.y,roofKind:R.kind,
                          blocksBefore:carrierLandingBlockCount(),deployed:false};
    }
  }
  aiSetup(difficulty,aiBases,allyBases);
    /* Open framed on the ship, close enough to fly it. */
  cam.x=carrierQaFocus?carrierQaFocus.x:pxs;
  cam.y=carrierQaFocus?carrierQaFocus.y:pys;
  orthoSpan=distTarget=carrierQaFocus?520:680; clampCam(); camUpdateMatrices();
  camFollow=-1;
  running=true; paused=false;
  updateFog();
  showHudDock(false); $('camRow').style.display='flex';
  toast('☄ ORBITAL DROP — your super carrier is coming down');
  sfx('flyby',carrier.x,carrier.y,0.72);
}

/* ---------- deploy the carrier: this is what actually starts the match ---------- */
function deployCarrier(){
  if(!carrierCanDeploy()){
    toast('⛔ Cannot deploy here — need solid, flat ground clear of active structures');
    sfx('alarm'); return;
  }
  /* Snap the landing point to the build grid. The HQ anchors every later
     placement — structures axis-align to their neighbours — so an off-grid HQ
     silently pushed the whole base half a cell out of alignment forever. */
  const snap=carrierSnapPosition();
  const cx2=snap[0], cy2=snap[1];
  carrier.x=cx2; carrier.y=cy2;
  const landing=carrierClearLandingZone(cx2,cy2);
  if(window.__carrierQa){
    window.__carrierQa.deployed=true;
    window.__carrierQa.blocksCleared=landing.blocks;
    window.__carrierQa.tanksCleared=landing.tanks;
    window.__carrierQa.overlapsAfter=carrierLandingRelics(cx2,cy2).length;
  }
  carrier.phase=2; carrier.active=false;
  const departNow=performance.now()/1000;
  for(const A of aiDeployArrivals) A.depart=departNow;
  /* You land with a Carrier HQ, your Commander and ONE constructor — nothing
     else. Handing the player a pre-built reactor, factory and extractor made
     the opening a formality; the layout that matters most is the one you lay
     down yourself, and it should be yours from the first structure. The HQ
     generates enough on its own to fund that first move. */
  const hq=addBld('hq',0,cx2,cy2,true);
  /* Visual-only unfolding window. The HQ exists immediately for simulation
     and placement rules, while the renderer grows it out of the landing site
     instead of making the dropship vanish and a finished base pop into view. */
  hq.deployT=performance.now()/1000;
  /* You field YOUR faction's hero, the same way the enemy fields theirs. The
     Dominion walks Lord Darion Vex, the Syndicate a shielded hover platform,
     the Brood its Sovereign — and Nova keeps the Commander. Until now only the
     AI got this, so choosing a faction changed who you fought as everywhere
     except the one unit you spend the whole match looking at.
     No hero builds anything — `builder:1` belongs to the Constructor, which
     lands beside you regardless — so this swaps a fighter, not an economy. */
  const PH=(typeof FACTIONS!=='undefined'&&FACTIONS[playerFaction])||null;
  heroIdx=spawnUnit(PH&&PH.hero!=null?PH.hero:4,0,cx2+52,cy2+44);
  spawnUnit(UT_ENGINEER,0,cx2-52,cy2+44);
  /* PREPARED LANDING is explicit onboarding support, not a hidden economy
     bonus. The AI already owns these two structures. addBld deliberately owns
     the placement so prefab ground is graded through the normal foundation
     path instead of hovering over the landing plateau. */
  if(deploymentPackage==='prepared'){
    const snapB=(v)=>Math.round(v/SNAP_GRID)*SNAP_GRID;
    const sites=[['pgen',snapB(cx2-102),snapB(cy2+4)],['fac',snapB(cx2+112),snapB(cy2+6)]];
    for(const S of sites){
      const B=addBld(S[0],0,S[1],S[2],true);
      B.deployT=performance.now()/1000+0.14;
    }
  }
  AI.base.x=AI.base.x; // (AI base already placed)
  matchLive=true; stats.t=0; matchClock=timeLimit;
  /* The setup modifier strip is useful before launch but becomes a duplicate
     of the compact MOD chip once the battle begins. Hide it at the state
     transition instead of waiting for another setup render that never comes. */
  if(typeof renderWcRow==='function')renderWcRow();
  if(typeof storyCampaignOnDeploy==='function')storyCampaignOnDeploy();
  /* A dropped session is laid down here, AFTER the world has regenerated from
     the same setup and seed — so we are restoring a fight onto a battlefield
     that came back identically, not trying to persist the battlefield itself. */
  if(typeof sessPending!=='undefined'&&sessPending){
    const snap=sessPending; sessPending=null;
    if(typeof sessRestoreInto==='function'&&sessRestoreInto(snap)){
      toast('◈ SESSION RECOVERED — '+Math.round((snap.t||0)/60)+' minutes restored');
      if(typeof sfx==='function') sfx('deploy');
    }
  }
  shake=Math.max(shake,16); flashScreen();
  addParticle(3,cx2,cy2,0,0,1.2,420, 140,220,255);
  for(let k=0;k<34;k++){
    const a=Math.random()*TAU, sp=110+Math.random()*220;
    addParticle(1,cx2,cy2,Math.cos(a)*sp,Math.sin(a)*sp,1.7,30, 150,142,124);
  }
  /* Landing destroys the surroundings, not the ground the new HQ already
     occupies. The old single crater ran AFTER addBld() flattened and paved the
     foundation, excavating a lake directly beneath the base. Four shallow
     exhaust scars sit outside the HQ footprint and leave its engineered pad
     intact while preserving the violent deployment event. */
  for(let q=0;q<4;q++){
    const a=q*TAU/4+Math.PI*.25,rx=cx2+Math.cos(a)*118,ry=cy2+Math.sin(a)*118;
    deformTerrain(rx,ry,42,0.012);
    if(typeof addGroundBurn==='function')addGroundBurn(rx,ry,58,0);
  }
  sfx('carrier_deploy',cx2,cy2,1.18); buzz(45);
  showHudDock(true,'orders');
  startFirstContactGuide();
  $('deployBtn').style.display='none';
  updateFog();
  if(wcActive.length) toast('⚠ '+wcActive.length+' modifiers active · +'+Math.round((wcRewardMult()-1)*100)+'% payout — tap MOD for details');
  else if(landing.blocks||landing.tanks) toast('🏙 LANDING ZONE CLEARED — '+landing.blocks+' city block'+(landing.blocks===1?'':'s')+' demolished');
  else toast('🏭 BASE DEPLOYED — your HQ powers itself. Build ⛏ Extractors on ◆ deposits');
  if(typeof showModSplash==='function') showModSplash();
  setTimeout(()=>{ if(running&&matchLive) toast('⬡ BUILD GRID — establish inside HQ range; research a Targeting Array to extend territory'); },5200);
}

function newDemo(){
  /* The 10,000-unit Mega / SANDBOX bench is GONE. It was a player-facing
     stress toy that no longer represented the game, and it sat on the front
     strip beside CAREER and INTEL as if it were a mode. newDemo() now serves
     only the three hidden QA capture labs; with no lab token in the URL there
     is nothing to enter, so bail before touching world or HUD state. */
  const cannonLab=location.search.indexOf('cannonshow=1')>=0;
  const defenseLab=location.search.indexOf('defenseshow=1')>=0;
  const ammoLab=location.search.indexOf('ammoshow=1')>=0;
  if(!cannonLab&&!defenseLab&&!ammoLab) return;
  stopAttract();
  resetWorld();
  demoMode=true; matchLive=true;
  carrier.active=false; carrier.phase=2;
  WC={}; wcActive=[]; renderWcRow();
  showHudDock(true,'powers');
  $('deployBtn').style.display='none';
  fogOn=false;
  /* Hidden device-QA layout. `?cannonshow=1` keeps the real combat simulation
     but brings smaller opposing lines into cannon range for readable captures. */
  if(defenseLab){
    const cx=MAP/2, cy=MAP/2+45, g=v=>Math.round(v/SNAP_GRID)*SNAP_GRID;
    const base=[
      ['hq',0,215],['techlab',0,120],['sgen',-125,135,3],['uplink',130,140,3],
      ['bunker',-250,35,3],['turret',-155,35,3],['rail',-55,25],['bastion',55,25,3],
      ['aatower',155,35],['hellstorm',250,35,3],
      ['minelaser',-205,-85,3],['arc',-100,-90,3],['plasma',0,-90,3],
      ['missilebastion',110,-90,3],['nova',220,-85,3],
      ['wall',-200,-195],['wall',-145,-195],['wall',-90,-195],['gate',-30,-195],
      ['gate',30,-195],['wall',90,-195],['wall',145,-195],['wall',200,-195]
    ];
    for(const [ty,dx,dy,lvl] of base){ const B=addBld(ty,0,g(cx+dx),g(cy+dy),true,0); if(lvl) B.lvl=lvl; }
    for(let k=0;k<22;k++){
      const a=(k-10.5)*.105, d=280+(k%4)*28;
      const ty=[0,1,2,4,9,20,21,23][k%8];
      let i=spawnUnit(ty,1,cx+Math.sin(a)*d,cy-190-Math.cos(a)*d*.35);
      if(i>=0){ ustate[i]=2; utx[i]=cx+rr(-90,90); uty[i]=cy+40; }
    }
    for(let k=0;k<12;k++){
      const ty=[0,1,2,9,11,19][k%6];
      const i=spawnUnit(ty,0,cx-130+k%6*52,cy+105+(k>5?38:0));
      if(i>=0){ ustate[i]=3; utx[i]=ux[i]; uty[i]=uy[i]; }
    }
    cam.x=cx; cam.y=cy-5; orthoSpan=distTarget=860; camPitch=pitchTarget=1.12; camYaw=yawTarget=.08;
    clampCam(); camUpdateMatrices(); running=true; paused=false;
    toast('🛡 DEFENSIVE NETWORK — 10 contact-sheet structure families live-fire');
    return;
  }
  if(ammoLab){
    /* One mirrored duel per armed chassis. A dense army turns every munition
       into the same white explosion; separated lanes let the player actually
       read the launch, flight and impact language of each weapon family. */
    const roster=[0,1,2,3,4,6,7,8,9,10,14,15,16,17,18,20,21,22,23,25,26,27,28,29];
    const cx=MAP/2, cy=MAP/2;
    for(let k=0;k<roster.length;k++){
      const col=k%6, row=(k/6)|0, mx=cx+(col-2.5)*175, my=cy+(row-1.5)*175;
      const a=spawnUnit(roster[k],0,mx-52,my), b=spawnUnit(roster[k],1,mx+52,my);
      if(a>=0&&b>=0){
        /* Showcase durability only: keep both emitters alive long enough to
           compare several volleys instead of capturing 23 simultaneous deaths. */
        uhpm[a]*=10; uhp[a]=uhpm[a]; uhpm[b]*=10; uhp[b]=uhpm[b];
        utgt[a]=b; utgtg[a]=ugen[b]; ustate[a]=2; utx[a]=ux[b]; uty[a]=uy[b];
        utgt[b]=a; utgtg[b]=ugen[a]; ustate[b]=2; utx[b]=ux[a]; uty[b]=uy[a];
      }
    }
    cam.x=cx; cam.y=cy; orthoSpan=distTarget=800; camPitch=pitchTarget=1.08; camYaw=yawTarget=.05;
    clampCam(); camUpdateMatrices(); running=true; paused=false;
    toast('⚡ AMMUNITION LAB — 24 mirrored weapon duels running live');
    return;
  }
  /* 72 a side, not 5000: the only caller left is the cannon capture lab. */
  const perSide=72, cols=12;
  for(let k=0;k<perSide;k++){
    const col=k%cols, row=(k/cols)|0;
    /* The stress battle also doubles as a visual combat showcase. Keep the
       rank-and-file majority cheap, but seed both armies with every major
       weapon language: lance/sniper/thermal/sonic beams, missiles, incendiary
       shells and heavy kinetic rounds. */
    const t = cannonLab ? (k%18===0?4:(k%5===0?1:0))
            : k%503===0?4 : k%251===0?8 : k%43===0?18 : k%31===0?6 : k%67===0?23
            : k%79===0?7 : k%109===0?20 : k%83===0?21
            : k%23===0?2 : k%9===0?1 : k%37===0?3 : 0;
    const nearY=cannonLab?0.525:0.72, farY=cannonLab?0.475:0.28;
    // team 0 bottom half marching up
    let i=spawnUnit(t,0, MAP/2+(col-cols/2)*22+rr(-6,6), MAP*nearY+row*16+rr(-5,5));
    if(i>=0){ ustate[i]=2; utx[i]=ux[i]; uty[i]=MAP*farY; }
    i=spawnUnit(t,1, MAP/2+(col-cols/2)*22+rr(-6,6), MAP*farY-row*16+rr(-5,5));
    if(i>=0){ ustate[i]=2; utx[i]=ux[i]; uty[i]=MAP*nearY; }
  }
  cam.x=MAP/2; cam.y=MAP/2; orthoSpan=distTarget=cannonLab?720:3200; clampCam(); camUpdateMatrices();
  running=true; paused=false;
  toast('💥 COMMANDER CANNON QA — live damage and effects');
}

function checkVictory(){
  if(gameEnded||!running||(!matchLive&&!demoMode)) return;
  if(demoMode){
    if(teamCount[0]===0||teamCount[1]===0){
      endGame(teamCount[1]===0,'Simulation complete');
    }
    return;
  }
  // losing your Commander always ends the run
  if(heroIdx<0){ endGame(false,'Your Commander was destroyed'); return; }
  const g=goalDef();
  if(g.id==='annihilate'){
    if(livingEnemyCommanders().length===0){ endGame(true,'Enemy commanders destroyed'); return; }
  } else if(g.id==='purge'){
    if(liveNests().length===0){ endGame(true,'Every hive purged from the surface'); return; }
    if(livingEnemyCommanders().length===0&&liveNests().length===0){ endGame(true,'Planet cleansed'); return; }
  } else if(g.id==='survival'){
    /* Last Stand at UNLIMITED had a defeat condition and no victory condition
       at all: the kill-the-commander win is excluded for survival, and the
       timed resolver below is gated on timeLimit>0. A player could wipe the
       enemy off the map and the match would simply keep running. Breaking the
       siege outright is a win by any honest reading. */
    if(timeLimit<=0&&livingEnemyCommanders().length===0){ endGame(true,'The siege was broken'); return; }
  } else {
    if(livingEnemyCommanders().length===0){ endGame(true,'Enemy commanders destroyed'); return; }
  }
  /* NOTHING ON A PHONE MAY RUN FOREVER. "Unlimited" means no SCHEDULED end, not
     no end — and against an AI commander parked inside a fortified base, an
     unlimited match could run until the player force-quit. A force-quit never
     reaches endGame(), so it also paid nothing. Forty minutes is past any
     honest match and short of a dead battery. */
  if(timeLimit<=0&&stats.t>=MATCH_HARD_CAP){
    const a=territoryScore(0), b=territoryScore(1);
    endGame(a>=b,'Stalemate — decided on territory'); return;
  }
  // timed goals resolve on the clock
  if(timeLimit>0&&matchClock<=0){
    if(g.id==='domination'){
      const a=territoryScore(0), b=territoryScore(1);
      endGame(a>=b, a>=b?'Time — you held the most territory':'Time — the enemy held more territory');
    } else if(g.id==='survival') endGame(true,'Time — you survived the siege');
    else if(g.id==='purge') endGame(false,'Time — hives still stand');
    else endGame(territoryScore(0)>=territoryScore(1),'Time — decided on territory');
  }
}
function endGame(win,reason){
  gameEnded=true;
  // report match result to a hosting shell (Base44 app) if embedded
  try{
    if(window.parent!==window) window.parent.postMessage({
      type:'massfront-result', win:!!win, demo:!!demoMode,
      difficulty, theme:curTheme, duration:stats.t|0,
      kills:stats.kills[0]|0, losses:stats.kills[1]|0,
      heroLevel:heroLvl|0, built:stats.built[0]|0
    },'*');
  }catch(e){}
  const rw=demoMode?null:metaGrant(win);      // cross-game rewards (persisted immediately)
  /* The endgame layer scores the run, advances the threat ladder, ticks the
     mastery grid and records a weekly best — all from what actually happened. */
  const dv=demoMode?null:(typeof developRecord==='function'?developRecord({
    win:!!win, kills:stats.kills[0]|0, built:(stats.built[0])|0, nests:stats.nests|0,
    fieldMass:Math.max(0,Math.floor(resM[0]||0)),fieldEnergy:Math.max(0,Math.floor(resE[0]||0)),
    reclaimed:Math.max(0,Math.round(stats.reclaimed||0))}):null);
  const eg=demoMode?null:(typeof endgameRecord==='function'?endgameRecord({
    win:!!win, kills:stats.kills[0]|0, built:(stats.built[0])|0,
    seconds:stats.t|0, difficulty:difficulty|0}):null);
  /* The dispatch waits for the results screen to be dismissed — a story beat
     landing on top of a victory screen reads as an interruption. */
  setTimeout(()=>{
    running=false;
    $('goTitle').textContent=win?'MISSION COMPLETE':'MISSION FAILED';
    $('goTitle').style.color=win?'#9fffc4':'#ff8d7a';
    const mins=(stats.t/60)|0, secs=(stats.t%60)|0;
    const outcome=$('goOutcome');
    if(outcome) outcome.textContent=goalDef().nm.toUpperCase()+' · '+reason;
    $('goStats').innerHTML='<div class="goStatGrid">'
      +'<div><b>'+mins+'m '+secs+'s</b><span>MISSION TIME</span></div>'
      +'<div><b>'+stats.kills[0]+'</b><span>HOSTILES DESTROYED</span></div>'
      +'<div><b>'+stats.kills[1]+'</b><span>UNITS LOST</span></div>'
      +'<div><b>LV '+heroLvl+'</b><span>COMMANDER</span></div>'
      +'<div><b>'+stats.built[0]+'</b><span>STRUCTURES BUILT</span></div>'
      +'<div><b>'+(eg&&eg.score?eg.score.toLocaleString():'—')+'</b><span>OPERATION SCORE</span></div></div>';
    if(rw){
      const fld=rw.field||{mass:0,energy:0,reclaimed:0};
      const mats=dv?Object.keys(dv.mats).filter(k=>dv.mats[k]>0).map(k=>
        '<div class="goRes"><b>'+MATS[k].em+' '+dv.mats[k]+'</b><span>'+MATS[k].nm.toUpperCase()+'</span></div>').join(''):'';
      const dataBreak=(rw.dataParts||[]).map(p=>'<span>'+p[0]+' <b>+'+p[1]+'</b></span>').join('');
      let loot='';
      if(rw.loot&&rw.loot.gear){
        const g=rw.loot.gear, rr=invRarity(g.rarity);
        loot+='<div class="goLoot" style="--rar:'+rr.col+'"><span class="goLootEm">'+g.em+'</span><div><i>'+rr.nm+' GEAR</i><b>'+g.nm+'</b>'
          +'<small>'+(g.duplicate?'DUPLICATE · OWNED ×'+g.count:'AUTO-EQUIPPED IF SLOT WAS EMPTY')+'</small></div></div>';
      }
      if(rw.loot) for(const c of rw.loot.consumables||[]){
        const rr=invRarity(c.rarity);
        loot+='<div class="goLoot" style="--rar:'+rr.col+'"><span class="goLootEm">'+c.em+'</span><div><i>'+rr.nm+' '+(c.exclusive?'MODE REWARD':'CONSUMABLE')+'</i><b>'+c.nm+' ×'+c.count+'</b><small>'+(c.exclusive?'EXCLUSIVE '+String(c.mode||'').toUpperCase()+' VICTORY SUPPLY':'BANKED TO ARMORY INVENTORY')+'</small></div></div>';
      }
      $('goRewards').innerHTML='<section class="goSection"><h3>MISSION PAYOUT'
        +(rw.modeContract&&rw.modeContract.xp>1?'<small>'+rw.modeContract.nm+' · +'+Math.round((rw.modeContract.xp-1)*100)+'% XP</small>'
          :rw.mult>1.001?'<small>×'+rw.mult.toFixed(2)+' OPERATION MULTIPLIER</small>':'')+'</h3>'
        +'<div class="goPayout"><div><b>+'+rw.xp+'</b><span>XP</span></div><div><b>+'+rw.cores+'</b><span>⬡ CORES</span></div>'
        +'<div><b>+'+(rw.data||0)+'</b><span>◆ RESEARCH DATA</span></div></div>'
        +'<div class="goBreak">'+rw.parts.map(p=>'<span>'+p[0]+' <b>+'+p[1]+'</b></span>').join('')+'</div>'
        +(dataBreak?'<div class="goBreak research"><strong>RESEARCH DATA</strong>'+dataBreak+'</div>':'')+'</section>'
        +'<section class="goSection"><h3>FIELD RECOVERY</h3><div class="goResourceGrid">'
        +'<div class="goRes"><b>'+fld.mass.toLocaleString()+'</b><span>MASS IN RESERVE</span></div>'
        +'<div class="goRes"><b>'+fld.energy.toLocaleString()+'</b><span>ENERGY IN RESERVE</span></div>'
        +'<div class="goRes"><b>'+fld.reclaimed.toLocaleString()+'</b><span>MASS RECLAIMED</span></div></div>'
        +(mats?'<h4 class="goAccountSalvage">ACCOUNT SALVAGE <small>Persisted to Development inventory</small></h4>'
          +'<div class="goResourceGrid account">'+mats+'</div>':'')+'</section>'
        +(loot?'<section class="goSection"><h3>ITEMS ACQUIRED</h3>'+loot+'</section>':'')
        +(rw.conquest?'<div class="goNotice good">◈ '+rw.conquest.title+' — '+rw.conquest.unlock+'<br>FIRST CLEAR · +'+rw.conquest.xp+' XP · +'+rw.conquest.cores+' CORES</div>':'')
        +(rw.modeReward?'<div class="goNotice good">'+rw.modeReward.em+' '+rw.modeContract.nm+' REWARD — '+rw.modeReward.nm+' banked to Account Armory</div>':'')
        +(rw.rankUp?'<div class="goNotice good">◈ PROMOTED — '+rw.rankUp.em+' '+rw.rankUp.nm.toUpperCase()+'</div>':'')
        +(eg&&eg.msgs.length?'<div class="goNotice">'+eg.msgs.join('<br>')+'</div>':'')
        +(dv&&dv.broke.length?'<div class="goNotice bad">✖ BROKEN — '+dv.broke.map(b=>b.em+' '+b.nm).join(', ')+'</div>':'');
    } else $('goRewards').innerHTML='';
    drawMatchChart();
    if(typeof adShowPostMatchAd==='function') adShowPostMatchAd(win);
    $('gameOver').style.display='flex';
    sfx(win?'level':'alarm');
  },1400);
}

// ---------- main loop ----------
let acc=0, lastT=0, fpsN=0, fpsT=0, fpsShow=60;
let aiAcc=0, fogAcc=0;
/* Tell the boot loader the patch is good. Called on the FIRST frame rather
   than at the end of setup: reaching a frame means the renderer, the sim and
   the UI all initialised, which is the only definition of "it boots" worth
   acting on. */
let bootConfirmed=false;
function confirmBoot(){
  if(bootConfirmed) return;
  bootConfirmed=true;
  if(window.__MASSFRONT_RELEASE_INPUT_GUARD)
    window.__MASSFRONT_RELEASE_INPUT_GUARD();
  if(window.__bootOk) window.__bootOk();
}
/* ============================================================================
   ATTRACT MODE — the menu is a window onto the game, not a picture of it
   ----------------------------------------------------------------------------
   The start screen used to be a gradient. Everything needed to make it a live
   scene was already built and idle: terrain, models, lighting, the day cycle.
   So the menu now sits over a real battlefield with a real base on it, lit by
   the real sun, with the camera making a slow orbit — and the panels float in
   front of it in perspective rather than lying flat on top.

   It is deliberately small: a few dozen units and a handful of structures, a
   slow sim tick, no AI and no fog. A menu should never be the most expensive
   thing the game does. */
let attractOn=false, attractT=0, attractCX=0, attractCY=0;
/* Lower bound the frame-rate scaler may not go below. Zero on every preset but
   CINEMATIC, which exists precisely to stop the automatic backing-off. */
let perfFloor=0;
/* A snapshot waiting to be laid down once the world has regenerated. */
let sessPending=null;
/* THE PLAYER'S OWN FACTION.
   src/audio.js has been reading `playerFaction` since the radio system landed,
   but nothing ever declared it — so it was permanently undefined and the player
   always spoke with Nova's voice no matter what they were fielding. The setup
   screen let you pick your OPPONENT's faction and not your own, which is an odd
   thing for a game whose four armies have genuinely different chassis kits.
   'nova' is the Terran line and stays the default. */
let playerFaction='nova';
let playerCommanderId='nova_kai';
function menuBg(){ return (META&&META.settings&&META.settings.menubg)||'dim'; }
/* Off keeps the menu chrome — the HUD must still be hidden — but skips building
   and ticking the diorama entirely. menuMode is what suppresses the in-match
   HUD, so it stays on either way; only attractOn changes. */
function applyMenuBackdrop(){
  const ss=document.getElementById('startScreen');
  const training=typeof trainingMissionActive==='function'&&trainingMissionActive();
  /* Training owns the carrier/loading transition before `running` flips true.
     Treating that short window as a menu let applySettings() restart the
     attract scene and re-add menuMode over the live tutorial HUD. */
  if(training){ document.body.classList.remove('menuMode'); return; }
  const onMenu=!running && ss && ss.style.display!=='none';
  if(!onMenu) return;
  document.body.classList.add('menuMode');
  if(menuBg()==='off'){ attractOn=false; return; }
  if(!attractOn) setupAttract();
}
function setupAttract(){
  if(typeof trainingMissionActive==='function'&&trainingMissionActive()){
    stopAttract();
    return;
  }
  if(!terrVerts) return;
  if(menuBg()==='off'){ document.body.classList.add('menuMode'); attractOn=false; return; }
  resetWorld();
  if(typeof materialV2SetupAttract==='function'&&materialV2SetupAttract())return;
  demoMode=false; matchLive=false; fogOn=false;
  /* Somewhere scenic and reachable: the map's own player start, which is
     guaranteed to be buildable ground. */
  const bx=MAP*SP_LO, by=MAP*SP_HI;
  attractCX=bx; attractCY=by;
  const g=v=>Math.round(v/SNAP_GRID)*SNAP_GRID;
  addBld('hq',0,g(bx),g(by),true,0);
  for(const [ty,dx,dy] of [['fac',150,-90],['pgen',-140,-70],['pgen',-140,30],
                           ['turret',60,170],['techlab',150,80],['silo',-140,130],
                           ['aatower',-40,-190],['uplink',180,0]]){
    const x=g(bx+dx), y=g(by+dy);
    if(!footBlocked(ty,x,y,0)&&footOnLand(ty,x,y,0)) addBld(ty,0,x,y,true,0);
  }
  /* A patrol worth watching: a mixed column walking a slow circuit past the
     base, so there is movement, dust and walk cycles rather than a still life. */
  for(let k=0;k<34;k++){
    const ty=[0,1,2,9,11,19,22,20][k%8];
    const a=k/34*TAU, d=190+Math.random()*160;
    const i=spawnUnit(ty,0,bx+Math.cos(a)*d,by+Math.sin(a)*d);
    if(i>=0){
      ustate[i]=5;                                   // patrol
      upx1[i]=ux[i]; upy1[i]=uy[i];
      upx2[i]=bx+Math.cos(a+2.2)*d; upy2[i]=by+Math.sin(a+2.2)*d;
      utx[i]=upx2[i]; uty[i]=upy2[i];
    }
  }
  orthoSpan=distTarget=880; camPitch=pitchTarget=1.16;
  cam.x=bx; cam.y=by; camYaw=yawTarget=0.4;
  clampCam(); camUpdateMatrices();
  attractOn=true; attractT=0;
  /* The in-match HUD has no business showing through the menu. */
  document.body.classList.add('menuMode');
}
function attractTick(dt){
  if(typeof materialV2TickAttract==='function'&&materialV2TickAttract(dt))return;
  attractT+=dt;
  /* A slow orbit with a gentle breathing zoom. Slow enough to read as
     cinematic; never so slow that it looks frozen on a first glance.
     Dimmed halves every rate again: the eye tracks change, not brightness, so
     slowing the motion does more for legibility than darkening alone. */
  const m = menuBg()==='dim' ? 0.45 : 1;
  camYaw=yawTarget=0.4+attractT*0.055*m;
  orthoSpan=distTarget=880+Math.sin(attractT*0.17*m)*150;
  camPitch=pitchTarget=1.18+Math.sin(attractT*0.11*m)*0.06;
  cam.x=attractCX+Math.cos(attractT*0.09*m)*40;
  cam.y=attractCY+Math.sin(attractT*0.07*m)*40;
  clampCam(); camUpdateMatrices();
  /* One slow sim step: the patrol walks, guns idle, dust drifts. */
  const sd=1/24;
  unitTick(sd); projTick(sd); bldTick(sd); beamTick(sd); envTick(sd);
  updParticles(sd); shardTick(sd);
  /* Parallax: the UI leans against the orbit, so the panels feel like they are
     standing in the scene rather than pasted over it. */
  const ss=document.getElementById('startScreen');
  if(ss&&ss.style.display!=='none'){
    const lx=Math.sin(attractT*0.055)*5.0*m, ly=Math.cos(attractT*0.041)*3.0*m;
    ss.style.setProperty('--px',lx.toFixed(2)+'deg');
    ss.style.setProperty('--py',ly.toFixed(2)+'deg');
  }
}
function stopAttract(){
  attractOn=false; document.body.classList.remove('menuMode');
  /* #gl is display:none under menuMode.bgOff. Remeasure after it is shown
     so a landscape desktop window is not stuck with the hidden-canvas size. */
  if(typeof resize==='function') resize();
}
function frame(ts){
  requestAnimationFrame(frame);
  if(!bootConfirmed) confirmBoot();
  if(!lastT) lastT=ts;
  let dt=(ts-lastT)/1000; lastT=ts;
  if(dt>0.25) dt=0.25;
  // fps
  fpsN++; fpsT+=dt;
  if(fpsT>=0.6){
    fpsShow=Math.round(fpsN/fpsT); fpsN=0; fpsT=0;
    const total=teamCount[0]+teamCount[1]+teamCount[2];
    /* HYSTERESIS. Dozens of effects gate or scale on this value; a bare
       threshold on a noisy fps signal flipped it 0.55<->1.0 twice a second at
       36-44 fps and strobed all of them at once — glows, beams, dust, water
       sparkle. Drop instantly to protect the frame, rise only with headroom.
       (This block also used to EASE the visible value "so changes arrive as
       fades, not steps". That reintroduced the very strobe it sits above — see
       the note on the assignment below — and has been removed.) */
    const band=fpsShow<28?0.25:fpsShow<42?0.55:1;
    if(band<perfBand) perfBand=band;
    else if(band>perfBand&&fpsShow>(perfBand<0.5?34:48)) perfBand=band;
    /* QUANTISED, NOT EASED — this is the fix for the half-second FX strobe.

       About seventy effects gate on perfScale, and their thresholds sit in one
       tight cluster between 0.30 and 0.56: water sparkle, shadow decals, tread
       dust, debris, rubble, repair beams, muzzle flashes, and ambient occlusion
       at 0.50. Easing the value dragged it through EVERY threshold in that
       cluster on a single band change, so all of those effects switched off and
       came back over about half a second. Measured on a real GPU: one 1.00 ->
       0.25 ramp crossed all six sampled gates (tools/verify-perfscale-gates.mjs).

       perfBand above is ALREADY the anti-strobe mechanism — drop instantly,
       rise only with headroom. Reading it directly gives one deliberate step
       per genuine performance change. The ease this replaces existed so
       particle COUNTS would fade rather than step, but a count going from 5 to
       3 is invisible while a shadow pass vanishing is not. */
    perfScale=perfBand;
    if(total>7000) perfScale=Math.min(perfScale,0.55);
    if(total>18000) perfScale=Math.min(perfScale,0.3);
    if(META.settings.perf==='low') perfScale=Math.min(perfScale,0.45);
    /* CINEMATIC sets a floor under the automatic scaler, so a heavy fight
       cannot quietly strip the frame back to the low preset — which is the
       whole reason someone picks it. */
    if(typeof perfFloor!=='undefined'&&perfFloor>0) perfScale=Math.max(perfScale,perfFloor);
    /* Density is a SETTING, not an observation, so it is applied on the way out
       of a value recomputed from perfBand each sample — never folded back into
       an accumulator. It used to compound: `perfScale *= GFX.particles` ran
       after the ease, so its own output was re-eased and re-multiplied every
       sample. Measured on a real GPU it settled at 3.63-3.86 on CINEMATIC
       (x1.5) against an intended ceiling of 1.0 — roughly 4x the particles it
       was asked for — and at 0.31 on LOW (x0.5) at a locked 60fps, which
       silently disabled every effect gated above 0.32. */
    if(typeof GFX!=='undefined'&&GFX.particles) perfScale*=GFX.particles;
  }
  if(running&&!paused){
    const totAll=teamCount[0]+teamCount[1]+teamCount[2];
    const simDt= totAll>22000?1/12 : totAll>13000?1/16 : totAll>6500?1/22 : totAll>900?1/26 : 1/30;
    acc+=dt*gameSpeed;
    let steps=0;
    while(acc>=simDt&&steps<3){
      acc-=simDt; steps++;
      carrierTick(simDt);
      camAuthTick(simDt);
      /* God Mode is deliberately obvious and deterministic: the gold badge
         stays visible while the solo-test economy refills every sim step. */
      if(!demoMode&&matchLive&&META.settings.godMode){
        resM[0]=RES_MCAP[0]; resE[0]=RES_ECAP[0];
        for(let k=0;k<abCool.length;k++) abCool[k]=0;
      }
      /* Only reel the camera in when the ship has genuinely left the view, and
         only while the player is not driving. 210 units is well inside a single
         screen, so the old threshold fired during ordinary panning. */
      if(carrier.active&&carrier.phase<2&&Math.hypot(carrier.x-cam.x,carrier.y-cam.y)>orthoSpan*0.55)
        carrierFollow();
      unitTick(simDt);
      projTick(simDt);
      bldTick(simDt);
      fortTick(simDt);
      buildZoneTick(simDt);
      reclaimTick(simDt);
      econTick(simDt);
      abilTick(simDt);
      beamTick(simDt);
      envTick(simDt);
      crateTick(simDt);
      sceneryTick(simDt);
      shardTick(simDt);
      updParticles(simDt);
      if(!demoMode&&!matchLive){         // keep vision live while flying the carrier in
        fogAcc+=simDt;
        if(fogAcc>=0.4){ updateFog(); fogAcc=0; }
      }
      if(matchLive&&!demoMode&&timeLimit>0&&matchClock>0) matchClock=Math.max(0,matchClock-simDt);
      if(!demoMode&&matchLive){          // the war only runs once you've planted your base
        aiAcc+=simDt;
        if(aiAcc>=0.5){ aiTick(aiAcc); aiAcc=0; }
        fogAcc+=simDt;
        if(fogAcc>=0.5){ updateFog(); fogAcc=0; }
        if(stats.t-tlLast>=5){ tlLast=stats.t; tlRecord(); }
      }
    }
    if(acc>simDt*3) acc=0;
    checkVictory();
  }
  if(!running && attractOn && attractVisible){
    attractTick(dt);
    processDeforms();
    render(dt);
    musicTickFrame(dt);
    return;
  }
  camTick(dt);
  if(running){
    if(!paused&&perfScale>0.4) weatherTick(dt);
    processDeforms();
    deformMaintain(dt);
    render(dt);
    floatTextTick(dt);
    renderMinimap();
    updateHUD(fpsShow);
  }
  musicTickFrame(dt);
}

/* Mid-tier CPU at 1000 pop. GPU fillrate is the quality preset; this is
   sim/HUD/pathfinding. Takeover, not edits to the renderer files. */
function mfCpuBind(){
  mfCpuBindPath();
  mfCpuBindSep();
  mfCpuBindMinimap();
  mfCpuBindIcons();
  mfCpuBindFx();
}
function mfGfxKey(){
  if(typeof qualityKey==='function') return qualityKey();
  const q=typeof META!=='undefined'&&META.settings&&META.settings.quality;
  return q==='low'||q==='medium'||q==='cinematic'?q:'high';
}
function mfCpuBindPath(){
  if(typeof computeField!=='function'||typeof PGS!=='number'||typeof requestField!=='function') return;
  const pool=[];
  let mark=null, epoch=0;
  computeField=function(tx,ty,naval){
    const N=PGS*PGS;
    if(!ffDistA){ ffDistA=new Uint16Array(N); ffQueue=new Int32Array(N); }
    if(!mark||mark.length!==N){ mark=new Uint16Array(N); epoch=0; }
    let dirs=pool.pop();
    if(!dirs||dirs.length!==N) dirs=new Uint8Array(N);
    dirs.fill(8);
    epoch++;
    if(epoch===65535){ mark.fill(0); epoch=1; }
    const dist=ffDistA;
    const pass=i=>naval?!!(NAVW&&NAVW[i]&&NAVCOMP[i]===NAV_MAIN):!!PASS[i];
    let goal=ffCell(tx,ty);
    if(!pass(goal)){
      const gx=goal%PGS, gy=goal/PGS|0;
      outer: for(let r=1;r<24;r++)
        for(let a=0;a<TAU;a+=0.5){
          const nx=clamp(gx+Math.round(Math.cos(a)*r),0,PGS-1), ny=clamp(gy+Math.round(Math.sin(a)*r),0,PGS-1);
          if(pass(ny*PGS+nx)){ goal=ny*PGS+nx; break outer; }
        }
    }
    if(!pass(goal)) return dirs;
    let qh=0, qt=0;
    dist[goal]=0; mark[goal]=epoch; ffQueue[qt++]=goal;
    while(qh<qt){
      const c=ffQueue[qh++];
      const cx=c%PGS, cy=c/PGS|0, cd=dist[c];
      for(let k=0;k<8;k++){
        const nx2=cx+DIRX[k], ny2=cy+DIRY[k];
        if(nx2<0||ny2<0||nx2>=PGS||ny2>=PGS) continue;
        const n=ny2*PGS+nx2;
        if(!pass(n)||mark[n]===epoch) continue;
        if(k&1){
          if(!pass(cy*PGS+nx2)||!pass(ny2*PGS+cx)) continue;
        }
        mark[n]=epoch;
        dist[n]=cd+((k&1)?3:2);
        ffQueue[qt++]=n;
      }
    }
    for(let qi=0;qi<qt;qi++){
      const c=ffQueue[qi];
      if(c===goal) continue;
      const cx=c%PGS, cy=c/PGS|0;
      let bk=8, bd2=dist[c];
      for(let k=0;k<8;k++){
        const nx2=cx+DIRX[k], ny2=cy+DIRY[k];
        if(nx2<0||ny2<0||nx2>=PGS||ny2>=PGS) continue;
        const n=ny2*PGS+nx2;
        if(mark[n]!==epoch) continue;
        const dn=dist[n];
        if(dn<bd2){ bd2=dn; bk=k; }
      }
      dirs[c]=bk;
    }
    return dirs;
  };
  requestField=function(tx,ty,naval){
    naval=!!naval;
    for(let f=0;f<fields.length;f++){
      if(fields[f]&&!!fields[f].naval===naval&&dist2(fields[f].tx,fields[f].ty,tx,ty)<70*70) return f;
    }
    const f=ffNext; ffNext=(ffNext+1)%FF_MAX;
    for(let i=0;i<unitHigh;i++) if(ufield[i]===f) ufield[i]=-1;
    const old=fields[f];
    if(old&&old.dirs) pool.push(old.dirs);
    fields[f]={tx,ty,naval,dirs:computeField(tx,ty,naval)};
    return f;
  };
}
function mfCpuBindSep(){
  if(typeof unitSeparation!=='function') return;
  const orig=unitSeparation;
  unitSeparation=function(i,T,isBug,swarmLOD,total){
    /* HIGH keeps the original 800/every-other skip. MEDIUM starts earlier and
       strides harder so 400–800 pop does not pay HIGH-class pair tests. */
    const q=mfGfxKey();
    const gate=q==='low'?280:q==='medium'?420:800;
    const stride=q==='low'?3:q==='medium'?(total>900?3:2):2;
    if(total>gate && ((i+tick)%stride) && !usel[i] && T.cat!=='hero'){
      sepVX=0; sepVY=0; sepHits=0; sepVisited=0;
      return;
    }
    return orig(i,T,isBug,swarmLOD,total);
  };
}
function mfCpuBindMinimap(){
  if(typeof renderMinimap!=='function') return;
  const orig=renderMinimap;
  let keep=null, keepT=0, skip=0, keepGen=-1;
  renderMinimap=function(){
    const tot=(teamCount[0]+teamCount[1]+teamCount[2])|0;
    const now=performance.now();
    const q=mfGfxKey();
    /* Deform stamps null mmBg on every crater. The 2048→256 civic downsample
       (drawImage of terrainCanvas) is the #2 CPU hotspot at 1000 pop.
       HIGH/CINEMATIC refresh scars sooner; MEDIUM holds the last bake longer. */
    const hold=q==='low'?1600:q==='medium'?1100:q==='cinematic'?320:520;
    /* Hold only a bake from this map gen. Restoring a black/stale keep
       after applyTheme nulls mmBg is why MEDIUM phones kept a black square. */
    if(keep && keepGen===mmBgGen && now-keepT<hold) mmBg=keep;
    const skipN=q==='low'?3:q==='medium'?(tot>280?2:1):(tot>700?2:1);
    if(keep && keepGen===mmBgGen && skipN>1 && (++skip%skipN)) return;
    orig();
    if(typeof mmBg!=='undefined'&&mmBg){ keep=mmBg; keepT=now; keepGen=mmBgGen; }
    else { keep=null; keepGen=-1; }
  };
}
function mfCpuBindIcons(){
  /* Screen-footprint handover already lives in tacticons.js (24→15 px).
     MEDIUM/LOW convert a few pixels earlier so infantry drop meshes sooner.
     HIGH/CINEMATIC keep the authored ramp — do not make the flagship cheaper. */
  if(typeof mfIconQ!=='function') return;
  const orig=mfIconQ;
  mfIconQ=function(worldSpan){
    const q=mfGfxKey();
    if(q==='high'||q==='cinematic') return orig(worldSpan);
    const px=worldSpan/(typeof mfWorldPx==='function'?mfWorldPx():Math.max(.24,orthoSpan/Math.max(1,VH)));
    if(q==='medium') return clamp((28-px)/(28-17),0,1);
    return clamp((34-px)/(34-20),0,1);
  };
}
function mfCpuBindFx(){
  /* GPUFX already scales burst counts via GFX.particles. This only thins the
     CPU sprite ring (MAXPART=9000) for atmosphere/dust — combat flashes stay. */
  if(typeof addParticle!=='function') return;
  const orig=addParticle;
  let dustN=0;
  addParticle=function(type,x,y,vx,vy,life,size,r,g,b){
    const q=mfGfxKey();
    if(q==='medium'||q==='low'){
      /* Thin atmosphere, do not delete it — LOW keeps a quarter, MEDIUM half. */
      if(type===9 && ((++dustN)&(q==='low'?3:1))) return;
      if(type===10 && (dustN&(q==='low'?3:1))) return;
      if(type===1 && q==='medium' && size<9 && (dustN&1)) return;
    }
    return orig(type,x,y,vx,vy,life,size,r,g,b);
  };
}

// ---------- UI wiring ----------
let builtTheme='verdant', builtMap='aelos_north_medium';
function applyTheme(){
  window.__reclaimTip=0;
  /* Swap the ground albedo variant set the moment the destination planet is
     known — a no-op when the theme is unchanged, an async re-decode when a
     drop moves between AELOS, NORDHALL, PYRAETH and VESPERA. */
  if(typeof reloadTerrainThemeTextures==='function') reloadTerrainThemeTextures();
  /* Theme/map equality is not proof that terrain exists. On a cold boot those
     defaults already match before the attract scene has produced heightF;
     launching Training or Standard immediately then called setupDoodads()
     against null terrain. The cache is reusable only when every CPU/GPU side
     needed by simulation is present. */
  if(heightF&&PASS&&terrainTex&&curTheme===builtTheme&&curMap===builtMap&&!mmDirty) return;   // rebuild also when scarred by battle
  setupDeposits();                                 // node layout follows the map seed
  terrainTex=buildTerrain(curTheme);
  /* Settlements are part of the world: generated right after the ground exists
     so a rebuilt map (context loss, theme change) grows the same places back. */
  if(typeof worldSitesGenerate==='function'){
    try{ const ns=worldSitesGenerate(); if(ns) console.log('world sites:',ns); }
    catch(e){ console.warn('worldsites:',e&&e.message); }
  }
  builtTheme=curTheme; builtMap=curMap;
  mmBg=null; mmDirty=false; mipDirty=false; mipUrgent=false;
  if(typeof mmBgGen==='number') mmBgGen++;
}
let pitchIdx=1;
let gameSpeed=1;
let perfBand=1;                 // hysteretic quality band behind perfScale
/* ---------- match timeline (post-game graph) ---------- */
const tl=[]; let tlLast=0;
function tlRecord(){
  let av0=0, av1=0;
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]) continue;
    const c=TYPES[utype[i]].cm+TYPES[utype[i]].ce*0.1 || 60;
    if(uteam[i]===0) av0+=c; else if(uteam[i]===1) av1+=c;
  }
  tl.push({t:stats.t, a0:av0, a1:av1, k0:stats.kills[0], k1:stats.kills[1]});
  if(tl.length>400) tl.shift();
}
function drawMatchChart(){
  const cv3=$('goChart'); if(!cv3||tl.length<3){ if(cv3) cv3.style.display='none'; return; }
  cv3.style.display='block';
  const c=cv3.getContext('2d'), W=cv3.width, H=cv3.height;
  c.clearRect(0,0,W,H);
  c.fillStyle='rgba(10,18,30,.85)'; c.fillRect(0,0,W,H);
  let mx=10; for(const p of tl) mx=Math.max(mx,p.a0,p.a1);
  const X=i2=>8+(W-16)*i2/(tl.length-1), Y=v=>H-10-(H-24)*v/mx;
  c.lineWidth=1; c.strokeStyle='rgba(120,160,190,.25)';
  for(let g2=1;g2<4;g2++){ c.beginPath(); c.moveTo(8,Y(mx*g2/4)); c.lineTo(W-8,Y(mx*g2/4)); c.stroke(); }
  const line=(key,col)=>{
    c.strokeStyle=col; c.lineWidth=2; c.beginPath();
    tl.forEach((p,i2)=>{ i2? c.lineTo(X(i2),Y(p[key])) : c.moveTo(X(0),Y(p[key])); });
    c.stroke();
  };
  line('a1','rgba(255,110,84,.95)');
  line('a0','rgba(96,200,255,.95)');
  c.font='700 9px Rajdhani,sans-serif';
  c.fillStyle='#8fd8ff'; c.fillText('YOUR ARMY',10,12);
  c.fillStyle='#ffab98'; c.fillText('ENEMY',70,12);
  c.fillStyle='#7fa8c4'; c.fillText('ARMY VALUE OVER TIME',W-118,12);
}
/* An OTA patch replaces the SCRIPTS, not the shell: a device patched over an
   older APK still has the old index.html (no #planetRow) and the old ui.css.
   So the planet section is created on demand and its styles are injected here
   too — the same rules that ui.css ships for fresh builds. */
function mfPlanetRowStyles(){
  if(document.getElementById('mfPlanetRowCss')) return;
  const st=document.createElement('style');
  st.id='mfPlanetRowCss';
  st.textContent='#planetRow{display:flex;flex-direction:column;width:100%;box-sizing:border-box;gap:8px}'
    +'.warTableCard{overflow:hidden}.regionMissionDeck{margin-top:10px;padding-top:10px;border-top:1px solid rgba(120,205,255,.2)}'
    +'.regionMissionHead{display:flex;justify-content:space-between;gap:8px;align-items:end;margin-bottom:8px}'
    +'.regionMissionHead span{font:900 11px/1 var(--fT);letter-spacing:.14em;color:#eaf8ff}'
    +'.regionMissionHead small{font:800 8px/1 var(--fT);letter-spacing:.1em;color:#6e9bb7}';
  (document.head||document.documentElement).appendChild(st);
}
function ensurePlanetRow(){
  mfPlanetRowStyles();
  let row=$('planetRow');
  if(!row){
    const host=document.querySelector('#setupScr [data-setup-tab="map"]');
    if(!host||!host.parentNode) return null;
    const sec=document.createElement('section');
    sec.className='setupCard warTableCard';
    sec.setAttribute('data-setup-tab','map');
    sec.innerHTML='<div class="secLbl">PLANETARY WAR TABLE</div><div class="optRow" id="planetRow"></div>';
    host.parentNode.insertBefore(sec,host); row=$('planetRow');
  }
  /* OTA patches run inside old APK shells. Move their separate map row into
     the War Table once, and retire the independent size card: each site now
     carries its Small/Medium/Large theatre contract. */
  const card=row.closest('.setupCard'),maps=$('mapRow');
  if(card&&maps&&!card.contains(maps)){
    const old=maps.closest('.setupCard'),deck=document.createElement('div');
    deck.className='regionMissionDeck';
    deck.innerHTML='<div class="regionMissionHead"><span id="regionMissionName">REGION</span><small>SELECT A BATTLEFIELD SITE</small></div>';
    deck.appendChild(maps); card.appendChild(deck);
    if(old&&old!==card) old.style.display='none';
  }
  const scale=$('battleScaleRow');
  if(scale){scale.hidden=true;const sc=scale.closest('.setupCard');if(sc&&sc!==card)sc.style.display='none';}
  const scaleHint=$('battleScaleHint');if(scaleHint){scaleHint.hidden=true;scaleHint.style.display='none';}
  return row;
}
let planetYaw = 0.5, planetPitch = 0.2, curRegionId = 'aelos_north';
let isDraggingPlanet = false, lastDragX = 0, lastDragY = 0, planetDragDx = 0, planetDragDy = 0;

function selectPlanetKey(key){
  const P=typeof PLANETS!=='undefined'&&PLANETS[key];if(!P)return false;
  if(typeof mfConquestPlanetOpen==='function'&&!mfConquestPlanetOpen(key)){
    if(typeof toast==='function') toast('🔒 CONQUER THE PREVIOUS PLANET TO OPEN '+P.nm);
    if(typeof sfx==='function') sfx('deny');
    return false;
  }
  curTheme=P.theme;curRegionId=P.regions[0].id;
  const maps=P.regions[0].maps||[];if(maps.length)syncBattlefieldFromMap(theatreMapId(maps,'standard'));
  if(typeof sfx==='function')sfx('ui');
  renderPlanetRow();renderMapRow();renderSpawnPlanner();
  return true;
}

function renderPlanetRow(){
  const row=ensurePlanetRow();
  if(!row||typeof PLANETS==='undefined') return;
  const activeKey=typeof planetForMap==='function'?planetForMap(curMap):planetForTheme(curTheme);
  const P=PLANETS[activeKey]||PLANETS.aelos;

  const planetRail=Object.keys(PLANETS).map(k=>{
    const Q=PLANETS[k],col=(Q.regions&&Q.regions[0]&&Q.regions[0].color)||'#65d8ff';
    return '<button type="button" class="orbitWorld'+(k===activeKey?' on':'')+'" data-planet="'+k+'" aria-pressed="'+(k===activeKey)+'" style="--world:'+col+'">'
      +'<i class="orbitWorldOrb"></i><span><b>'+Q.nm+'</b><small>4 REGIONS</small></span></button>';
  }).join('');
  row.innerHTML = '<nav class="worldOrbitRail" aria-label="Select planet">'+planetRail+'</nav>'
    + '<div class="planetHeaderWrap" style="text-align:center;margin-bottom:8px">'
    + '<div style="font-family:var(--fT);font-size:16px;letter-spacing:0.25em;color:#eaf7ff;font-weight:900;text-transform:uppercase">' + P.nm + '</div>'
    + '<div style="margin-top:3px;font:800 8px/1 var(--fT);letter-spacing:.16em;color:#65d8ff">'+String(activeWarMode||'standard').toUpperCase()+' THEATRE</div>'
    + '<div style="display:flex;justify-content:space-around;margin-top:6px;padding:6px 2px;background:rgba(5,15,25,0.65);border-radius:6px;border:1px solid rgba(140,230,255,0.2);font-size:9px;color:#8abfdc">'
    + '<div><span style="display:block;font-size:8px;color:#5a84a0;letter-spacing:0.05em">SECTOR</span><b style="color:#ffffff;font-size:9px">' + (P.sector||'Helios Core') + '</b></div>'
    + '<div><span style="display:block;font-size:8px;color:#5a84a0;letter-spacing:0.05em">DIAMETER</span><b style="color:#ffffff;font-size:9px">' + (P.diameter||'56,780 km') + '</b></div>'
    + '<div><span style="display:block;font-size:8px;color:#5a84a0;letter-spacing:0.05em">DAY LENGTH</span><b style="color:#ffffff;font-size:9px">' + (P.dayLen||'12 hrs') + '</b></div>'
    + '<div><span style="display:block;font-size:8px;color:#5a84a0;letter-spacing:0.05em">AVG TEMP</span><b style="color:#ffffff;font-size:9px">' + (P.temp||'25°C') + '</b></div>'
    + '<div><span style="display:block;font-size:8px;color:#5a84a0;letter-spacing:0.05em">CLIMATE</span><b style="color:#ffffff;font-size:9px">' + (P.climate||'Tropical') + '</b></div>'
    + '</div></div>'
    + '<div style="position:relative;width:100%;height:230px;margin:0 auto;background:rgba(3,10,18,0.85);border-radius:8px;border:1px solid rgba(140,230,255,0.25);overflow:hidden;box-sizing:border-box">'
    + '<canvas id="planetSphereCanvas" width="440" height="230" style="width:100%;height:100%;object-fit:contain;cursor:grab;touch-action:none"></canvas>'
    + '<div style="position:absolute;bottom:6px;left:10px;right:10px;display:flex;justify-content:space-between;pointer-events:none;font-size:10px;color:#a0d4f5;font-weight:700">'
    + '<span>⬡ REVERSE BIODOME: '+ (P.biodome||'ACTIVE') +'</span>'
    + '<span>TAP REGION ↺</span>'
    + '</div></div>';

  const cv = document.getElementById('planetSphereCanvas');
  row.querySelectorAll('.orbitWorld').forEach(b=>{
    const choose=e=>{e.preventDefault();e.stopPropagation();selectPlanetKey(b.dataset.planet);};
    if(typeof mfBindTap==='function')mfBindTap(b,choose);else b.addEventListener('pointerdown',choose);
  });
  if(!cv) return;

  const draw = () => {
    draw3DPlanetSphere(cv, activeKey, planetYaw, planetPitch, curRegionId);
  };
  draw();

  cv.onpointerdown = (e) => {
    isDraggingPlanet = true;
    lastDragX = e.clientX; lastDragY = e.clientY;
    planetDragDx = 0; planetDragDy = 0;
    cv.style.cursor = 'grabbing';
    cv.setPointerCapture(e.pointerId);
  };
  cv.onpointermove = (e) => {
    if(!isDraggingPlanet) return;
    const dx = e.clientX - lastDragX, dy = e.clientY - lastDragY;
    planetDragDx = (planetDragDx||0) + Math.abs(dx);
    planetDragDy = (planetDragDy||0) + Math.abs(dy);
    lastDragX = e.clientX; lastDragY = e.clientY;
    planetYaw += dx * 0.01;
    planetPitch = Math.max(-0.8, Math.min(0.8, planetPitch - dy * 0.01));
    draw();
  };
  cv.onpointerup = cv.onpointercancel = (e) => {
    isDraggingPlanet = false;
    cv.style.cursor = 'grab';
  };

  cv.onclick = (e) => {
    const rect = cv.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    /* Ignore clicks that dragged more than a few pixels; the globe is rotatable,
       and without a threshold every tap ends up nudging the planet. */
    if(typeof planetDragDx==='number' && (Math.abs(planetDragDx)>4 || Math.abs(planetDragDy)>4)) return;

    /* Globe taps select one of the four surface regions, never another world. */
    const W = cv.width, H = cv.height, R = Math.min(W,H)*0.32, cx = W*0.5, cy = H*0.53;
    for(const reg of P.regions){
      const rLat=reg.lat, rLon=reg.lon+planetYaw;
      const cosLat=Math.cos(rLat), sinLat=Math.sin(rLat);
      const cosLon=Math.cos(rLon), sinLon=Math.sin(rLon);
      const px=cx + R * cosLat * sinLon;
      const py=cy - R * (sinLat * Math.cos(planetPitch) - cosLat * cosLon * Math.sin(planetPitch));
      const pz=cosLat * cosLon * Math.cos(planetPitch) + sinLat * Math.sin(planetPitch);

      const sectorHitRadius = Math.max(38, (reg.rad || 0.38) * R * 1.1);
      if(pz > -0.15 && Math.hypot(mx - px, my - py) < sectorHitRadius){
        if(typeof mfConquestRegionOpen==='function'&&!mfConquestRegionOpen(activeKey,reg.id)){
          if(typeof toast==='function') toast('🔒 LIBERATE THE PREVIOUS REGION FIRST');
          if(typeof sfx==='function') sfx('deny');
          break;
        }
        curRegionId = reg.id;
        if(reg.maps && reg.maps.length > 0) syncBattlefieldFromMap(theatreMapId(reg.maps,'standard'));
        if(typeof sfx==='function') sfx('ui');
        renderPlanetRow(); renderMapRow(); renderSpawnPlanner();
        break;
      }
    }
  };
}

const mapPrevCache={};
function syncBattlefieldFromMap(key){
  const def=MAPDEFS[key]; if(!def) return false;
  if(typeof mfConquestMapOpen==='function'&&!mfConquestMapOpen(key))return false;
  curMap=key;
  if(def.theme&&typeof THEMES!=='undefined'&&THEMES[def.theme]) curTheme=def.theme;
  if(def.size) battlefieldPreset=battlefieldPresetKey(def.size);
  document.querySelectorAll('.bsbtn').forEach(b=>b.classList.toggle('on',b.dataset.bs===battlefieldPreset));
  const h=$('battleScaleHint'); if(h) h.textContent=battlefieldPresetHint();
  return true;
}
function renderMapRow(){
  const row=$('mapRow'); if(!row) return;
  const planet=typeof planetForMap==='function'?planetForKey(planetForMap(curMap)):planetForKey(planetForTheme(curTheme));
  const reg=(planet.regions && planet.regions.find(r => r.id === curRegionId)) || (planet.regions && planet.regions[0]);
  const regionKeys=(reg && reg.maps) || getPlanetMaps(planet);
  const rn=$('regionMissionName'); if(rn) rn.textContent=(reg&&reg.nm)||'REGION';

  row.innerHTML='';
  for(const key of regionKeys){
    const def=MAPDEFS[key];
    if(!def) continue;
    const card=document.createElement('div');
    const conquestOpen=typeof mfConquestMapOpen!=='function'||mfConquestMapOpen(key),conquestWon=typeof mfConquestWon==='function'&&mfConquestWon(key);
    card.className='mapCard'+(curMap===key?' sel':'')+(conquestOpen?'':' locked')+(conquestWon?' conquered':'');
    card.dataset.map=key;
    const ck=key+'_'+(def.theme||curTheme);
    let cv3=mapPrevCache[ck];
    if(!cv3){
      /* 96×72 was acceptable while these were icon-sized thumbnails. The War
         Table makes one site nearly phone-wide, where that source becomes a
         visibly blocky stamp. 192×120 stays under five MB even if every one of
         the 48 sites is browsed and cached, but keeps rivers, roads and city
         footprints legible during map choice. */
      cv3=document.createElement('canvas'); cv3.width=192; cv3.height=120;
      drawMapPreview(cv3,def,def.theme||curTheme);
      mapPrevCache[ck]=cv3;
    }
    card.appendChild(cv3);
    const hz=(typeof mapHazardDef==='function')?mapHazardDef(key):((typeof MAPHAZ!=='undefined'&&MAPHAZ[key])?MAPHAZ[key]:null);
    const sz={compact:'COMPACT · 2.2 KM',standard:'STANDARD · 2.6 KM',large:'LARGE · 3.2 KM'}[def.size]||'BATTLEFIELD';
    const CQ=typeof mfConquestLocate==='function'?mfConquestLocate(key):null;
    const firstClear=CQ&&typeof mfConquestReward==='function'?mfConquestReward(key):null;
    const contract=typeof modeRewardContract==='function'?modeRewardContract('standard'):null;
    const rewardXp=firstClear?Math.round(firstClear.xp*(contract?contract.xp:1)):0;
    const rewardItem=contract&&contract.item&&typeof INV_CONSUMABLES!=='undefined'?INV_CONSUMABLES.find(x=>x.id===contract.item):null;
    card.insertAdjacentHTML('beforeend','<div class="mSize">'+sz+'</div><div class="mNm">'+def.nm+'</div><div class="mDs">'+def.ds+'</div>'
      +(CQ?'<div class="mConquest"><span>FRONT '+CQ.tier+' / 48</span><b>'+(conquestWon?'SECURED':conquestOpen?['EASY','NORMAL','HARD'][CQ.mi]+' THREAT':'LOCKED')+'</b></div>':'')
      +(firstClear?'<div class="mReward"><span>FIRST CLEAR · +'+rewardXp+' XP · +'+firstClear.cores+' CORES</span><b>'+(rewardItem?rewardItem.em+' '+rewardItem.nm:'')+'</b></div>':'')
      +(hz?'<div class="mHz"><b>'+hz.em+' '+hz.nm+'</b>'+hz.ds+'</div>':''));
    card.addEventListener('pointerdown',()=>{if(!conquestOpen){toast('🔒 SECURE THE PREVIOUS BATTLEFIELD FIRST');sfx('deny');return;}window._mfTheatrePick=def.size;syncBattlefieldFromMap(key); if(typeof sfx==='function') sfx('ui'); renderMapRow(); renderSpawnPlanner(); });
    row.appendChild(card);
  }
  if(typeof drawSpawnPlanner==='function') drawSpawnPlanner();
}
let settingsFrom='menu';
let inboxFromMatch=false;
const FRONT_SCREEN_IDS=['startScreen','warScr','setupScr','devScr','opsScr','dailyScr','dossierScr','inboxScr','updScr','profileScr','settingsScr','armory'];
/* THE DIORAMA IS THE MENU'S BACKGROUND, AND NOTHING ELSE'S.
   Every other front screen — War Room, Development, Operations, Armory, the
   Dossier, the store, Settings — is an opaque full-screen panel. Behind them
   the attract branch in frame() was still stepping the entire simulation and
   drawing a complete 3D frame (terrain, every model, SSAO, bloom, at full
   resolution) for nobody to see. On a phone that is the research tree quietly
   heating the device, and then handing a thermally throttled GPU to the match
   the player opens next. */
let attractVisible=true;
function hideFrontScreens(except){
  for(const id of FRONT_SCREEN_IDS){
    if(id===except) continue;
    const el=$(id); if(el) el.style.display='none';
  }
  if(typeof apClose==='function') try{ apClose(); }catch(e){}
  const ap=$('apOverlay'); if(ap) ap.style.display='none';
  const apc=$('apConfirmOverlay'); if(apc) apc.style.display='none';
  if(except===undefined){
    attractVisible=false;   // bare call = dropping into a match
    if(typeof audMusicEnterMatch==='function') audMusicEnterMatch();
  }
}
function showFrontScreen(id){
  hideFrontScreens(id);
  const el=$(id); if(el) el.style.display='flex';
  document.body.dataset.frontScreen=id||'';
  attractVisible=(id==='startScreen');
  /* Re-evaluated every time the menu is shown rather than once at boot: a
     session can be dropped mid-play, and the offer has to be there when the
     player lands back here — which is the moment they are looking for it. */
  if(id==='startScreen'&&typeof sessRenderResume==='function') sessRenderResume();
  if(typeof audMusicEnterScreen==='function') audMusicEnterScreen(id);
}
function openSettings(from){
  settingsFrom=from;
  renderSettings();
  if(from==='pause') $('pauseOverlay').style.display='none';
  showFrontScreen('settingsScr');
}
let nativeBackExitAt=0;
function nativeLayerVisible(id){
  const el=$(id);return !!(el&&getComputedStyle(el).display!=='none');
}
function nativeBackTap(id){
  const el=$(id);if(!el)return false;
  if(typeof MF_POINTER_COMMIT!=='undefined') MF_POINTER_COMMIT=-1e9;
  /* Blur FIRST. Android Back used to navigate straight out of a screen with a
     text field still focused, so the field's commit handler never ran and
     whatever had been typed was discarded — silently, which is the worst way to
     lose a name someone chose. */
  const a=document.activeElement;
  if(a&&a!==document.body&&typeof a.blur==='function') a.blur();
  el.click();
  return true;
}
function handleNativeBack(AppPlugin){
  if(nativeLayerVisible('mfNoticeHistory')){if(typeof mfNoticeHistoryClose==='function')mfNoticeHistoryClose();return;}
  /* Close the topmost modal first. Android Back now follows the same visual
     hierarchy as the on-screen controls instead of terminating the Activity. */
  if(nativeLayerVisible('apOverlay')){if(typeof apClose==='function')apClose();return;}
  if(nativeLayerVisible('accDlg')){nativeBackTap('accDlgN');return;}
  if(nativeLayerVisible('dispatch')){nativeBackTap('dispOk');return;}
  const layers=[
    ['settingsScr','setBack'],['profileScr','profBack'],['armory','armoryBack'],
    ['setupScr','setupBack'],['warScr','warBack'],['devScr','devBack'],['opsScr','opsBack'],
    ['dailyScr','dailyBack'],['dossierScr','dossBack'],['inboxScr','inboxBack'],['updScr','updBack'],['gameOver','restartBtn']
  ];
  for(const L of layers)if(nativeLayerVisible(L[0])){nativeBackTap(L[1]);return;}
  if(nativeLayerVisible('pauseOverlay')){nativeBackTap('resumeBtn');return;}
  if(typeof aiming!=='undefined'&&aiming>=0){
    if(aiming===5&&typeof cancelArtilleryBarrageAim==='function')cancelArtilleryBarrageAim(true);
    else aiming=-1;
    toast('Targeting cancelled');sfx('ui');return;
  }
  if(typeof placing!=='undefined'&&placing){cancelPlace();sfx('ui');return;}
  if(nativeLayerVisible('buildMenu')||nativeLayerVisible('bldPanel')||nativeLayerVisible('prodMenu')){
    closeMenus();sfx('ui');return;
  }
  if(nativeLayerVisible('baseFinder')){ $('baseFinder').style.display='none';sfx('ui');return; }
  if(typeof armPatrol!=='undefined'&&armPatrol){cancelPatrolDraft(false);return;}
  if(typeof armFormation!=='undefined'&&armFormation){
    armFormation=false;orderPreview=null;
    const f=$('formBtn');if(f)f.classList.remove('on');toast('Formation placement cancelled');sfx('ui');return;
  }
  if(typeof boxMode!=='undefined'&&boxMode){boxMode=false;const b=$('boxBtn');if(b)b.classList.remove('on');sfx('ui');return;}
  if(running){paused=true;$('pauseOverlay').style.display='flex';sfx('ui');return;}
  const now=performance.now();
  if(now-nativeBackExitAt<1800){if(AppPlugin&&AppPlugin.exitApp)AppPlugin.exitApp();return;}
  nativeBackExitAt=now;toast('Press Back again to exit MASSFRONT');
}
function initNativeNavigation(){
  const C=typeof window!=='undefined'&&window.Capacitor;
  const A=C&&C.Plugins&&C.Plugins.App;
  if(!A||typeof A.addListener!=='function')return;
  A.addListener('backButton',()=>handleNativeBack(A));
}

/* One exit transaction for victory, defeat and Pause > Main Menu. Partial
   visibility flips left pointer capture, tutorial chrome and modal layers from
   the match alive behind the front end. Resetting them together makes the
   return path deterministic and gives Android Back the same clean hierarchy as
   a cold launch. */
function returnToMainMenu(){
  /* Training's protected rules are scoped to its operation. This is the one
     intentional early-exit path; incidental UI state changes must not call it. */
  if(typeof cancelTrainingMission==='function') cancelTrainingMission();
  /* Weekly borrows the player's threat/modifier plan for its authored brief.
     endgameRecord hands it back at the end of a FINISHED run — abandoning one
     never reached that code, so quitting a Weekly kept the loan forever. */
  if(typeof weeklyMode!=='undefined'&&weeklyMode&&typeof restoreWeeklyConfig==='function'){
    restoreWeeklyConfig(); weeklyMode=false;
  }
  /* Same contract for an authored campaign mission's modifier set. */
  if(typeof storyCampaignRestoreMods==='function') storyCampaignRestoreMods();
  paused=false; running=false; matchLive=false;
  if(typeof audMusicLeaveMatch==='function') audMusicLeaveMatch();
  if(typeof resetInputState==='function') resetInputState();
  /* Do not leave an old front-end screen in the DOM hit-test stack. All menu
     overlays share a z-index, so one stale `display:flex` layer can sit above
     the newly shown main menu and silently eat every tap. */
  for(const id of FRONT_SCREEN_IDS.concat(['pauseOverlay','gameOver','levelUp','loadScr'])){
    const el=$(id); if(el) el.style.display='none';
  }
  if(typeof adClearPostMatchAd==='function') adClearPostMatchAd();
  if(typeof apClose==='function') apClose();
  document.querySelectorAll('.apOverlay,.apConfirmOverlay').forEach(el=>{ el.style.display='none'; });
  const dlg=$('accDlg'); if(dlg) dlg.style.display='none';
  const dp=$('dispatch'); if(dp){ dp.style.display='none'; dp.classList.remove('in'); }
  closeMenus(); cancelPlace();
  showHudDock(false);
  showFrontScreen('startScreen');
  renderMetaHead(); setupAttract();
  if(typeof storyCheck==='function') setTimeout(storyCheck,420);
}
function continueToNextMap(){
  /* Rewards already landed in endGame/metaGrant. This only launches the next
     unlocked War Table site — do not call returnToMainMenu first or the
     attract diorama eats the loadout. */
  if(typeof mfDepart!=='undefined') mfDepart.fromVictory=false;
  if(typeof mfConquestHasNextMap!=='function'||!mfConquestHasNextMap()){
    if(typeof returnToMainMenu==='function') returnToMainMenu();
    return;
  }
  const map=mfConquestNextMap();
  const L=typeof mfConquestLocate==='function'?mfConquestLocate(map):null;
  if(!L||typeof syncBattlefieldFromMap!=='function'||!syncBattlefieldFromMap(map)){
    if(typeof toast==='function') toast('NO NEXT BATTLEFIELD');
    if(typeof returnToMainMenu==='function') returnToMainMenu();
    return;
  }
  curTheme=L.P.theme; curRegionId=L.R.id;
  if(!(typeof storyCampaignPlanBorrowed==='function'&&storyCampaignPlanBorrowed())){
    META.setup=META.setup||{};
    META.setup.m=curMap; META.setup.t=curTheme;
    if(typeof metaSave==='function') metaSave();
  }
  paused=false; running=false; matchLive=false;
  if(typeof audMusicLeaveMatch==='function') audMusicLeaveMatch();
  const go=$('gameOver'); if(go) go.style.display='none';
  if(typeof adClearPostMatchAd==='function') adClearPostMatchAd();
  closeMenus(); cancelPlace();
  hideFrontScreens();
  $('loadScr').style.display='flex';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    applyTheme(); newSkirmish();
    $('loadScr').style.display='none';
    stopAttract();
    if(typeof mfFlowLayout==='function') mfFlowLayout();
  }));
}
function wire(){
  document.querySelectorAll('.hudDeckBtn').forEach(b=>mfBindTap(b,e=>{
    e.preventDefault(); setHudDeck(b.dataset.deck);
  }));
  document.querySelectorAll('.globalDiff').forEach(b=>{
    b.addEventListener('pointerdown',()=>{
      const floor=typeof mfConquestDifficultyFloor==='function'?mfConquestDifficultyFloor(curMap):0;
      if(+b.dataset.d<floor){toast('CONQUEST THREAT FLOOR — this battlefield begins at '+['EASY','NORMAL','HARD'][floor]);sfx('deny');return;}
      document.querySelectorAll('.globalDiff').forEach(x=>x.classList.remove('on'));
      b.classList.add('on'); difficulty=+b.dataset.d;
      for(const A of aiSlots) if(A.on) A.diff=difficulty;
      renderSpawnPlanner(); initAudio(); sfx('ui');
    });
  });
  const pick=(sel,fn)=>document.querySelectorAll(sel).forEach(b=>{
    b.addEventListener('pointerdown',ev=>{
      ev.stopPropagation();
      document.querySelectorAll(sel).forEach(x=>x.classList.remove('on'));
      b.classList.add('on'); fn(b); initAudio(); sfx('ui');
    });
  });
  pick('.glbtn',b=>{ goalSel=b.dataset.g; $('goalHint').textContent=goalDef().ds; });
  pick('.tmbtn',b=>{ timeLimit=+b.dataset.t;
    /* SHORT FORM PAYS THE ECONOMY FORWARD. The AI's first wave lands around
       eighty seconds and the design assumes a long build-up, so at normal pace
       a five-minute match ends during the opening build order — that is not a
       short match, it is a truncated one. A faster economy and denser crates
       move first contact early enough that five minutes is a battle. */
    if(timeLimit&&timeLimit<=300){ resPace=1.6; crateRate=1.5; }
    else if(resPace===1.6){ resPace=1; crateRate=1; } });
  pick('.pcbtn',b=>{ resPace=+b.dataset.p; });
  pick('.crbtn',b=>{ crateRate=crateRateBase=+b.dataset.c; });
  pick('.bsbtn',b=>{
    battlefieldPreset=battlefieldPresetKey(b.dataset.bs);
    normalizeAiSlotsForBattlefield();
    const h=$('battleScaleHint');
    if(h) h.textContent=battlefieldPresetHint();
    renderSpawnPlanner();
  });
  pick('.ifbtn',b=>{
    infestationOn=!!+b.dataset.i;
    $('infestHint').textContent=infestationOn
      ?'Neutral nests spread and erupt during the battle.'
      :'No neutral nests, infestation guards, eruptions, spread, or map-wide tides.';
  });
  pick('.dfbtn',b=>{
    defenseFocus=+b.dataset.df;
    $('defFocusHint').textContent=defenseFocus
      ?'Tower defence: +20% defence HP, +15% damage, +10% range, 25% faster construction — enemy waves arrive 18% faster.'
      :'Classic RTS balance between mobile armies and static defences.';
  });
  pick('.pkgbtn',b=>{
    deploymentPackage=DEPLOYMENT_PACKAGES[b.dataset.pkg]?b.dataset.pkg:'prepared';
    const h=$('deployPkgHint');if(h)h.textContent=deploymentPackageDef().ds;
  });
  initSpawnPlanner();
  /* Battle setup is five short task-focused pages. Showing all of them at once
     duplicated controls under the wrong highlighted tab and recreated the
     overlong mobile form these pages were designed to replace. */
  const setup=$('setupScr');setup.dataset.tab=setup.dataset.tab||'map';
  const setupNames={map:'WORLD & MAP',forces:'ARMIES & STARTS',rules:'VICTORY RULES',economy:'MATCH ECONOMY',modifiers:'RISK MODIFIERS'};
  const setupContext=$('setupContext');if(setupContext)setupContext.textContent=setupNames[setup.dataset.tab]||setupNames.map;
  const oldAdv=$('advToggle');if(oldAdv)oldAdv.remove();
  document.querySelectorAll('.setupTabBtn').forEach(b=>mfBindTap(b,()=>{
    setup.dataset.tab=b.dataset.tab;setup.classList.remove('setupAll');
    document.querySelectorAll('.setupTabBtn').forEach(x=>x.classList.toggle('on',x===b));
    if(setupContext)setupContext.textContent=setupNames[b.dataset.tab]||'';sfx('ui');
    if(b.dataset.tab==='modifiers'&&typeof renderOps==='function') renderOps();
    const sc=setup.querySelector('.setupScroll');if(sc)sc.scrollTop=0;
  }));
  /* The enemy picker is generated from FACTIONS now — see renderFacRow() in
     src/factions.js — so it carries the real crests and cannot fall out of step
     with a rename. */
  if(typeof renderFacRow==='function') renderFacRow();
  if(typeof initFactionTheme==='function') initFactionTheme();
  document.querySelectorAll('.wbtn').forEach(b=>{
    b.addEventListener('pointerdown',()=>{
      if(b.disabled) return;
      document.querySelectorAll('.wbtn').forEach(x=>x.classList.remove('on'));
      b.classList.add('on'); wcChoice=+b.dataset.w;
      /* Random quick-picks and hand-selected modifiers are intentionally
         exclusive, so neither control can silently override the other. */
      META.opmods={};
      META.wcPref=wcChoice; metaSave(); initAudio(); sfx('ui');
      if(typeof renderOps==='function') renderOps();
    });
  });
  mfBindTap($('armoryBtn'),()=>{
    initAudio(); sfx('ui');
    renderMetaHead(); renderArmory();
    showFrontScreen('armory');
  });
  mfBindTap($('armoryBack'),()=>{
    sfx('ui'); renderMetaHead();
    showFrontScreen('startScreen');
  });
  document.querySelectorAll('.tbtn').forEach(b=>{
    b.addEventListener('pointerdown',()=>{
      document.querySelectorAll('.tbtn').forEach(x=>x.classList.remove('on'));
      b.classList.add('on'); curTheme=b.dataset.t; initAudio(); sfx('ui');
      renderMapRow();                          // previews follow the biome palette
      if(typeof renderPlanetRow==='function') renderPlanetRow(); // keep the planet highlight honest
    });
  });
  /* The planet row owns the biome now (see PLANETS in gl.js); the old biome
     strip is gone, so this loop is a live fallback only. If anything re-adds
     .tbtn buttons they still work — but they must stay inside the selected
     planet or the picker shows a region the world cannot render. */
  /* Skirmish setup is no longer what the primary button does — it is what the
     STANDARD card in the War Room does. Kept as a named function so the War
     Room, the back stack and any future deep link all enter it the same way. */
  window.openPlanetarySetup=(mode)=>{
    /* Campaign / MMO / Co-op are advertised on the War Room but unimplemented.
       Opening the planetary catalogue for them was a trap: a locked card still
       walked into a stub war table that played like a mode. */
    if(mode==='coop'||mode==='mmo'||mode==='campaign'){
      initAudio(); sfx('deny');
      toast((mode==='mmo'?'MMO':mode==='coop'?'CO-OP':'CAMPAIGN')+' is not available yet.');
      return;
    }
    initAudio(); sfx('ui');
    /* Training owns a borrowed ruleset and must never leak into the Standard
       war table. tutorial.js is IIFE-scoped, so this calls its explicit export
       rather than relying on a local declaration magically becoming global. */
    if(mode==='standard'&&typeof trainingMissionActive==='function'&&trainingMissionActive()
       &&typeof cancelTrainingMission==='function') cancelTrainingMission();
    activeWarMode='standard';
    /* A saved plan can name a legacy map (vanguard) or a locked later world.
       Key off the map catalogue, not the biome — sibling themes would snap
       Aelos High Shelf (arctic) onto Nordhall. Conquest then clamps the drop. */
    if(typeof mfConquestNormalizeSelection==='function') mfConquestNormalizeSelection();
    else {
      const key=typeof planetForMap==='function'?planetForMap(curMap):planetForTheme(curTheme);
      const P=planetForKey(key);
      let R=P&&P.regions.find(r=>r.id===curRegionId&&r.maps.indexOf(curMap)>=0);
      if(P&&!R){R=P.regions[0];curRegionId=R.id;if(R.maps.length)syncBattlefieldFromMap(theatreMapId(R.maps,'standard'));}
    }
    const h=document.querySelector('#setupScr .setupHead h2');
    if(h)h.textContent='⚔ STANDARD WAR TABLE';
    const launch=$('setupStart');
    if(launch){launch.textContent='▶ START BATTLE';launch.classList.remove('disabled');}
    renderPlanetRow(); renderMapRow(); renderSpawnPlanner();
    if(typeof renderOps==='function') renderOps();
    showFrontScreen('setupScr'); };
  window.openSkirmishSetup=()=>window.openPlanetarySetup('standard');
  mfBindTap($('startBtn'),()=>{ initAudio(); sfx('ui');
    /* Very old installs predate the War Room shell entirely (#warScr does not
       exist in their APK), so opening it would dead-end. Fall back to Battle
       Setup — where the planet/region picker lives — and the button works on
       every shell that has ever shipped. */
    if($('warScr')){
      if(typeof renderWarRoom==='function') renderWarRoom();
      showFrontScreen('warScr');
    } else if(typeof openSkirmishSetup==='function') openSkirmishSetup();
  });
  mfBindTap($('warBack'),()=>{ sfx('ui');
    renderMetaHead(); showFrontScreen('startScreen'); });
  mfBindTap($('setupBack'),()=>{ sfx('ui');
    /* Battle Setup doubles as an authored mission's brief. Backing out of it is
       DECLINING the mission, so the borrowed plan comes back here — otherwise
       the player's next ordinary skirmish quietly ran the mission's map, theme,
       difficulty and AI slots, and the menu diorama stayed in its biome. */
    if(typeof storyCampaignRestoreMods==='function'&&storyCampaignRestoreMods()
       &&typeof storyCampaignSyncSetup==='function') storyCampaignSyncSetup();
    if(typeof renderWarRoom==='function') renderWarRoom();
    showFrontScreen('warScr'); });
  mfBindTap($('setupStart'),()=>{
    initAudio();
    if(activeWarMode==='coop'||activeWarMode==='mmo'||activeWarMode==='campaign'){
      sfx('deny');
      toast((activeWarMode==='mmo'?'MMO':activeWarMode==='coop'?'CO-OP':'CAMPAIGN')+' is not available yet.');
      return;
    }
    /* Standard must be a clean session boundary. The normal setup entry clears
       Training already, but an older OTA shell or a deep-linked setup screen can
       bypass that entry point. Do the inexpensive idempotent cleanup again here
       so KEEL objectives and Training's borrowed rules can never ride into a
       Standard battle. */
    if(activeWarMode==='standard'&&typeof cancelTrainingMission==='function') cancelTrainingMission();
    /* Training restore rewinds live globals. The buttons still show the plan
       the player just set — copy them back before META.setup is written. */
    armMatchSetup();
    const loan=typeof weeklyMode!=='undefined'&&weeklyMode;
    const training=typeof trainingMissionActive==='function'&&trainingMissionActive();
    if(!loan&&!training){
      if(typeof isHomeworldMap==='function'&&!isHomeworldMap(curMap)){
        sfx('deny'); toast('DROP WORLDS ARE THE FOUR HOMEWORLDS');
        if(typeof mfConquestNormalizeSelection==='function') mfConquestNormalizeSelection();
        return;
      }
      if(typeof mfConquestMapOpen==='function'&&!mfConquestMapOpen(curMap)){
        sfx('deny'); toast('🔒 SECURE THE PREVIOUS BATTLEFIELD FIRST');
        return;
      }
    }
    /* "Remember loadout" means the PLAYER'S loadout. An authored campaign
       mission borrows every field below for the length of its run, so saving
       here while a preset was on loan wrote the mission's plan over the
       player's own — permanently, across restarts. That is how one prologue
       mission authored on theme:'arctic' made the snow biome the saved
       default and the menu diorama came up in it every launch. */
    if(!(typeof storyCampaignPlanBorrowed==='function'&&storyCampaignPlanBorrowed())){
      META.setup={d:difficulty,t:curTheme,m:curMap,f:aiFactionSel,pf:playerFaction,pc:playerCommanderId,bs:battlefieldPreset,pkg:deploymentPackage,
                  g:goalSel,tl:timeLimit,rp:resPace,cr:crateRate,
                  ps:playerStartZone,ais:aiSlots.map(A=>({on:!!A.on,diff:A.diff|0,zone:A.zone,ally:!!A.ally,behavior:aiBehaviorKey(A.behavior)})),
                  df:defenseFocus,inf:infestationOn?1:0}; metaSave();   // remember loadout
    }
    hideFrontScreens(); sfx('ui');
    // terrain generation is heavy at this resolution — show it, don't freeze on it
    $('loadScr').style.display='flex';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      applyTheme(); newSkirmish();
      $('loadScr').style.display='none';
      /* hideFrontScreens() measures while the loading screen is still visible,
         so HUD traffic control marks the app as menu-occluded at that instant.
         Recompute after the loader leaves or mfMenuOpen can remain latched. */
      stopAttract();
      if(typeof mfFlowLayout==='function') mfFlowLayout();
    }));
  });
  $('spdBtn').addEventListener('pointerdown',()=>{
    gameSpeed=gameSpeed===1?1.5:gameSpeed===1.5?2:1;
    $('spdBtn').textContent=gameSpeed+'×';
    toast('⏩ Game speed '+gameSpeed+'×'); sfx('ui');
  });
  /* The header is a tap target for Profile, but it now CONTAINS buttons — the
     rank badge, the update dot and the mailbox. mfBindTap fires for any
     descendant of the element it is bound to, so without this guard every one
     of those opened its own screen and then had Profile shown on top of it by
     the header's own handler running on the same bubbling pointerup. The
     mailbox looked like it simply did nothing. */
  mfBindTap($('metaHead'),e=>{
    if(e&&e.target&&e.target.closest&&e.target.closest('button')) return;
    initAudio(); sfx('ui'); renderProfile(); showFrontScreen('profileScr');
  });
  mfBindTap($('restartBtn'),returnToMainMenu);
  const goCont=$('goContinueBtn');
  if(goCont&&goCont.dataset.bound!=='1'){
    goCont.dataset.bound='1';
    mfBindTap(goCont,()=>{
      if(typeof mfVictoryContinue==='function') mfVictoryContinue();
      else if(typeof continueToNextMap==='function') continueToNextMap();
    });
  }
  mfBindTap($('menuBtn'),()=>{ if(!running) return; paused=true; $('pauseOverlay').style.display='flex'; });
  mfBindTap($('resumeBtn'),()=>{ paused=false; $('pauseOverlay').style.display='none'; });
  mfBindTap($('quitBtn'),()=>{
    const go=()=>returnToMainMenu();
    if(typeof accConfirm==='function') accConfirm('Abandon this operation? The unfinished match grants no mission payout.',go);
    else go();
  });
  mfBindTap($('pauseSettings'),()=>{ openSettings('pause'); });
  mfBindTap($('setBack'),()=>{
    $('settingsScr').style.display='none'; sfx('ui');
    if(settingsFrom==='pause') $('pauseOverlay').style.display='flex';
    else showFrontScreen('startScreen');
  });
  // ---- profile (account) screen ----
  const openProfile=()=>{
    initAudio(); sfx('ui'); renderProfile();
    showFrontScreen('profileScr');
  };
  mfBindTap($('profileBtn'),openProfile);
  /* The rank badge is the only rank UI left on the menu, so it has to lead to
     the screen the rest of the ladder moved to. */
  if($('rankEm')) mfBindTap($('rankEm'),openProfile);
  mfBindTap($('settingsBtn'),()=>{ initAudio(); sfx('ui'); openSettings('menu'); });
  mfBindTap($('updDot'),()=>{
    initAudio(); sfx('ui');
    /* The full Game Version screen is already the detail view. Leaving the
       updater in its menu-sized collapsed state hid the Stable/Preview
       selector and rollback controls even though there was ample room. */
    if(typeof updOpen!=='undefined') updOpen=true;
    if(typeof renderUpdatePanel==='function') renderUpdatePanel();
    showFrontScreen('updScr');
  });
  mfBindTap($('updBack'),()=>{ sfx('ui');
    renderMetaHead(); showFrontScreen('startScreen'); });
  mfBindTap($('inboxBtn'),()=>{
    initAudio(); sfx('ui');
    if(typeof renderInbox==='function') renderInbox();
    showFrontScreen('inboxScr');
  });
  mfBindTap($('inboxBack'),()=>{ sfx('ui');
    if(inboxFromMatch){ inboxFromMatch=false; $('inboxScr').style.display='none'; return; }
    renderMetaHead(); showFrontScreen('startScreen'); });
  /* In-match the Inbox is a POPUP, not a front screen: showFrontScreen would
     hide the battlefield HUD and leave the player staring at an empty overlay
     when they closed it. Close every other panel first so it never opens on top
     of a build menu or a unit card. */
  mfBindTap($('inboxHudBtn'),()=>{
    initAudio(); sfx('ui');
    if(typeof closeMenus==='function') closeMenus();
    if(typeof hideFrontScreens==='function') hideFrontScreens();
    const uc=$('unitCard'); if(uc) uc.style.display='none';
    if(typeof renderInbox==='function') renderInbox();
    inboxFromMatch=true;
    $('inboxScr').style.display='flex';
  });
  mfBindTap($('profBack'),()=>{
    renderMetaHead(); sfx('ui'); showFrontScreen('startScreen');
  });
  /* `change` alone loses the name. On a phone the field is committed by the
     player leaving the screen, and the two ways they actually do that — the
     hardware Back button, and a tap on BACK that fires from pointerdown before
     the input has blurred — neither produces a `change` event. So a commander
     typed their name, went back, and the game had forgotten it. Commit on
     `blur` as well, and see nativeBackTap() for the other half. */
  const profNameCommit=()=>{
    const P=activeProf(), v=$('profName').value.trim();
    if(v&&P&&P.name!==v.slice(0,14)){ P.name=v.slice(0,14); profSave(); renderMetaHead(); renderProfile(); }
  };
  $('profName').addEventListener('change',profNameCommit);
  $('profName').addEventListener('blur',profNameCommit);
  $('profNew').addEventListener('pointerdown',()=>{
    if(PROFILES.list.length>=6){ toast('Profile limit reached (6)'); return; }
    const id='p'+(++PROFILES.seq);
    PROFILES.list.push({id,name:'Commander '+PROFILES.seq,emblem:EMBLEMS[PROFILES.list.length%EMBLEMS.length]});
    profSave(); switchProfile(id); renderProfile(); sfx('level');
    toast('👤 New profile created — progress now saves here');
  });
  let resetArm=0;
  $('profReset').addEventListener('pointerdown',()=>{
    if(performance.now()-resetArm>2600){
      resetArm=performance.now();
      toast('⚠ Tap RESET again to wipe this profile\'s progress'); sfx('alarm'); return;
    }
    META={...META_DEF,owned:{},facWins:{},mapWins:{},settings:{...META.settings}};
    metaSave(); applyColor(); renderMetaHead(); renderProfile(); sfx('ui');
    toast('Progress reset for '+activeProf().name);
  });
  let delArm=0;
  $('profDel').addEventListener('pointerdown',()=>{
    if(PROFILES.list.length<=1){ toast('Cannot delete the last profile'); return; }
    if(performance.now()-delArm>2600){
      delArm=performance.now();
      toast('⚠ Tap DELETE again to remove this profile forever'); sfx('alarm'); return;
    }
    const P=activeProf();
    try{ localStorage.removeItem('massfront_meta_'+P.id); }catch(e){}
    PROFILES.list=PROFILES.list.filter(p=>p.id!==P.id);
    profSave(); switchProfile(PROFILES.list[0].id); renderProfile(); sfx('ui');
    toast('Profile deleted');
  });
  $('upBtn').addEventListener('pointerdown',()=>{
    if(openBld<0) return;
    const err=startUpgrade(openBld);
    if(err) toast(err); else sfx('ui');
    renderProdMenu();
  });
  $('bp_fire').addEventListener('pointerdown',()=>{
    if(openBld<0) return;
    const B=blds[openBld];
    if(B.type!=='nova'||B.cool>0) return;
    novaSrc=openBld; aiming=2;
    closeMenus();
    toast('☄ NOVA ARMED — tap anywhere on the map (or minimap-jump first)');
    sfx('alarm');
  });
  $('bp_prio').addEventListener('pointerdown',()=>{
    if(openBld<0) return;
    const B=blds[openBld];
    B.prio=((B.prio||0)+1)%3;
    renderBldPanel(); sfx('ui');
    toast('🎯 '+BT[B.type].name+' targeting: '+['nearest enemy','air first','strongest first'][B.prio]);
  });
  $('bp_up').addEventListener('pointerdown',()=>{
    if(openBld<0) return;
    const err=startUpgrade(openBld);
    if(err) toast(err); else sfx('ui');
    renderBldPanel();
  });
  $('bp_sell').addEventListener('pointerdown',()=>{
    if(openBld<0) return;
    const B=blds[openBld];
    if(!B.alive) return;
    /* Recycling is irreversible, so a first tap arms it and states the exact
       recovered mass. This is safer than a browser confirm dialog (which is
       often obscured or suppressed by Android WebViews) while remaining a
       two-tap action in the same reachable control. */
    const now=Date.now(), refund=bldRecycleMass(B);
    if(!(B.recycleConfirmAt>now)){
      B.recycleConfirmAt=now+3000;
      toast('♻ RECYCLE '+BT[B.type].name.toUpperCase()+' — +'+refund+' MASS · TAP AGAIN TO CONFIRM');
      renderBldPanel(); sfx('ui');
      return;
    }
    resM[0]=Math.min(RES_MCAP[0],resM[0]+refund);
    B.alive=false; rebuildBGrid();
    if(B.type==='mex'){
      if(B.dep>=0) redirectProspectorsFromNode(B.dep,B.team);
      for(const D of deposits) if(D.x===B.x&&D.y===B.y) D.taken=false;
    }
    if(B.type==='geo') for(const G of geysers) if(G.x===B.x&&G.y===B.y) G.taken=false;
    addParticle(3,B.x,B.y,0,0,.5,BT[B.type].size, 120,230,255);
    toast('♻ '+BT[B.type].name+' recycled · +'+refund+' mass');
    closeMenus(); sfx('ui');
  });
  $('armyBtn').addEventListener('pointerdown',()=>{ selectArmy(); });
  if($('idleBuilderBtn')) $('idleBuilderBtn').addEventListener('pointerdown',()=>{ selectIdleBuilders(); });
  // ---- tactics bar: patrol / hold / formation ----
  $('patrolBtn').addEventListener('pointerdown',()=>{togglePatrolPlanner();});
  /* Keep the control alive until finger-up. Hiding it on pointerdown exposed
     the platoon row underneath to the same release, producing a ghost P1/P2
     recall toast immediately after an otherwise successful deployment. */
  $('deployBtn').addEventListener('pointerup',ev=>{ ev.stopPropagation(); deployCarrier(); });
  $('rotL').addEventListener('pointerdown',()=>{ yawTarget-=Math.PI/4; sfx('ui'); });
  $('rotR').addEventListener('pointerdown',()=>{ yawTarget+=Math.PI/4; sfx('ui'); });
  /* OTA patches can run against an older installed HTML shell.  Create the
     new camera controls when that shell predates them instead of crashing the
     entire input binding pass on a missing element. */
  const ensureCamControl=(id,glyph,label,before)=>{
    let el=$(id);if(el)return el;
    el=document.createElement('button');el.id=id;el.className='cbtn camBtn';
    el.setAttribute('aria-label',label);el.innerHTML='<span class="em">'+glyph+'</span><span>'+label+'</span>';
    const row=$('camRow'),ref=$(before);if(row)row.insertBefore(el,ref||null);return el;
  };
  const zoomInControl=ensureCamControl('zoomIn','＋','Near','tiltBtn');
  const zoomOutControl=ensureCamControl('zoomOut','−','Far','rotR');
  zoomInControl.addEventListener('pointerdown',()=>{
    camFollow=-1;if(typeof camUser==='function')camUser();zoomBy(1.28);toast('CAMERA · ZOOM IN');sfx('ui');
  });
  zoomOutControl.addEventListener('pointerdown',()=>{
    camFollow=-1;if(typeof camUser==='function')camUser();zoomBy(.78);toast('CAMERA · ZOOM OUT');sfx('ui');
  });
  $('tiltBtn').addEventListener('pointerdown',()=>{
    /* Four framing presets: overhead for reading a base layout, through to a
       low chase angle for watching a battle line. */
    pitchIdx=(pitchIdx+1)%4;
    /* Four command-view angles. All of them keep the battlefield readable —
       there is deliberately no ground-level option. */
    pitchTarget=[1.49,1.32,1.19,1.07][pitchIdx];
    toast(['⛰ View: straight down','⛰ View: high','⛰ View: standard','⛰ View: low'][pitchIdx]);
    sfx('ui');
  });
  $('holdBtn').addEventListener('pointerdown',()=>{ orderHold(); });
  // control groups: tap = recall, hold = save
  for(let n=0;n<4;n++){
    const btn=$('grpBtn'+(n+1)); if(!btn) continue;
    let saveT=0,saved=false,lastTap=0;
    btn.addEventListener('pointerdown',()=>{
      saved=false;
      saveT=setTimeout(()=>{ saved=true; saveGroup(n); },480);
    });
    const fin=()=>{
      clearTimeout(saveT);
      if(!saved&&running){const now=performance.now(),focus=now-lastTap<430;lastTap=now;recallGroup(n,focus);}
      saved=false;
    };
    btn.addEventListener('pointerup',fin);
    btn.addEventListener('pointercancel',()=>clearTimeout(saveT));
  }
  $('formBtn').addEventListener('pointerdown',()=>{armFormationOrder();});
  $('rallyBtn').addEventListener('pointerdown',()=>{
    if(openBld<0) return;
    armRally=openBld;
    closeMenus();
    toast('⚑ Tap the map to place the rally flag');
    sfx('ui');
  });
  $('boxBtn').addEventListener('pointerdown',()=>{
    boxMode=!boxMode; $('boxBtn').classList.toggle('on',boxMode);
    if(boxMode) toast('⬚ Drag on the map to box-select your units');
  });
  $('stopBtn').addEventListener('pointerdown',()=>{ stopSelected(); });
  $('atkAlert').addEventListener('pointerdown',()=>{ jumpToAlert(); });
  $('waveAlert').addEventListener('pointerdown',()=>{ jumpToWaveWarning(); });
  $('moveBtn').addEventListener('pointerdown',()=>{ toggleMoveMode(); });
  $('clearBtn').addEventListener('pointerdown',()=>{ clearSel(); updateSelInfo(); sfx('ui'); });
  $('buildBtn').addEventListener('pointerdown',()=>{
    if(placing) cancelPlace();                 // never overlap menu with placement mode
    const bm=$('buildMenu');
    if(bm.style.display==='block'){ bm.style.display='none'; }
    else {
      closeMenus(); renderBuildMenu(); bm.style.display='block';          // re-render: unlock states follow CDR level
      flashBuildZone();                                                   // preview HQ/uplink command territory before choosing a structure
    }
    sfx('ui');
  });
  $('placeOk').addEventListener('pointerdown',confirmPlace);
  $('placeNo').addEventListener('pointerdown',()=>{ cancelPlace(); sfx('ui'); });
  $('modeBtn').addEventListener('pointerdown',e=>{ e.preventDefault(); cycleSelectedModes(); });
  $('placeRotL').addEventListener('pointerdown',e=>{ e.preventDefault(); rotatePlacement(-1); });
  $('placeRotR').addEventListener('pointerdown',e=>{ e.preventDefault(); rotatePlacement(1); });
  $('repeatBtn').addEventListener('pointerdown',()=>{
    if(openBld<0) return;
    const B=blds[openBld]; B.repeat=!B.repeat;
    $('repeatBtn').textContent='REPEAT: '+(B.repeat?'ON':'OFF');
    $('repeatBtn').classList.toggle('on',B.repeat); sfx('ui');
  });
  $('abOver').addEventListener('pointerdown',()=>{ if(aiming===0){aiming=-1;return;} tryAbility(0); });
  $('abHeal').addEventListener('pointerdown',()=>tryAbility(1));
  $('abRage').addEventListener('pointerdown',()=>tryAbility(2));
  $('abLance').addEventListener('pointerdown',()=>tryAbility(3));
  if($('abEmp')) $('abEmp').addEventListener('pointerdown',()=>tryAbility(4));
  if($('abJump')) $('abJump').addEventListener('pointerdown',()=>tryCommanderJump());
  $('abBarrage').addEventListener('pointerdown',()=>tryArtilleryBarrage());
  if($('abClass')) $('abClass').addEventListener('pointerdown',()=>tryClassAbility());
  $('abHero').addEventListener('pointerdown',()=>selectHero());
  if($('baseFindBtn')) $('baseFindBtn').addEventListener('pointerdown',()=>toggleBaseFinder());
  mfBindTap($('heroBar'),()=>{
    selectHero();
    if(heroIdx>=0) toast('★ COMMANDER — selected and centered');
  });
  $('heroBar').addEventListener('keydown',ev=>{
    if(ev.key!=='Enter'&&ev.key!==' ') return;
    ev.preventDefault(); selectHero();
    if(heroIdx>=0) toast('★ COMMANDER — selected and centered');
  });
  document.body.addEventListener('pointerdown',initAudio,{once:true});
  setInterval(()=>{
    if(openBld<0||!blds[openBld]) return;
    renderQueue();
    if($('bldMenu2').style.display==='block') renderBldPanel();
    if($('prodMenu').style.display==='block'&&blds[openBld].type==='techlab'&&blds[openBld].res<0) renderResearchMenu();
  },800);
}

// ---------- boot ----------
async function boot(){
  profLoad();                    // user accounts
  metaLoad();                    // active profile's progression + settings
  applyColor();
  applySettings();
  wcChoice=clamp(META.wcPref|0,0,3);
  document.querySelectorAll('.wbtn').forEach(b=>b.classList.toggle('on',+b.dataset.w===wcChoice));
  // restore the last battle loadout
  const su=META.setup||{};
  if(su.d!=null&&su.d>=0&&su.d<=2) difficulty=su.d;
  /* Last loadout may name a legacy map. Keep the eight for training, but the
     career picker starts on a homeworld site. */
  if(su.m&&MAPDEFS[su.m]&&(typeof isHomeworldMap!=='function'||isHomeworldMap(su.m))) curMap=su.m;
  else if(typeof isHomeworldMap==='function'&&!isHomeworldMap(curMap)) curMap='aelos_north_medium';
  const mapDef=MAPDEFS[curMap];
  if(mapDef&&mapDef.theme&&THEMES[mapDef.theme]) curTheme=mapDef.theme;
  else if(THEMES[su.t]) curTheme=su.t;
  /* `grand` was the pre-1.32 name for Large. Keep old setup saves valid while
     storing only the player-facing Compact / Standard / Large vocabulary. */
  if(BATTLEFIELD_PRESETS[su.bs]||su.bs==='grand') battlefieldPreset=battlefieldPresetKey(su.bs);
  /* Old Standard loadouts stored aelos_north_small while preset stayed
     standard. Compact stays compact only when the saved theatre is compact. */
  if(typeof theatreMapId==='function'&&MAPDEFS[curMap]&&MAPDEFS[curMap].size!==battlefieldPresetKey(battlefieldPreset)){
    const pk=typeof planetForMap==='function'?planetForMap(curMap):null;
    const P=pk&&typeof PLANETS!=='undefined'&&PLANETS[pk];
    const R=P&&P.regions.find(r=>r.maps&&r.maps.indexOf(curMap)>=0);
    const hit=R&&theatreMapId(R.maps,battlefieldPreset);
    if(hit&&MAPDEFS[hit]) curMap=hit;
  }
  deploymentPackage=DEPLOYMENT_PACKAGES[su.pkg]?su.pkg:'expedition';
  /* First-three Standard battles keep the supported landing. Theatre size
     follows the selected site — Standard is medium, not Compact or Large. */
  if(assistedOpeningActive()) deploymentPackage='prepared';
  if(su.f&&(su.f==='random'||FACTIONS[su.f])) aiFactionSel=su.f;
  if(su.g&&GOALS.some(g=>g.id===su.g)) goalSel=su.g;
  if(su.tl!=null) timeLimit=+su.tl||0;
  if(su.rp) resPace=+su.rp;
  if(su.cr!=null) crateRate=crateRateBase=+su.cr;
  if(su.inf!=null) infestationOn=!!su.inf;
  if(START_ZONES.some(z=>z.id===su.ps)) playerStartZone=su.ps;
  if(Array.isArray(su.ais)) for(let i=0;i<Math.min(aiSlots.length,su.ais.length);i++){
    const S=su.ais[i]||{};
    aiSlots[i].on=!!S.on;
    aiSlots[i].diff=clamp(S.diff|0,0,2);
    aiSlots[i].ally=!!S.ally;
    aiSlots[i].behavior=typeof aiBehaviorKey==='function'?aiBehaviorKey(S.behavior):'balanced';
    if(START_ZONES.some(z=>z.id===S.zone)) aiSlots[i].zone=S.zone;
  }
  if(!aiSlots.some(A=>A.on)) aiSlots[0].on=true;
  /* Old saves can stack two commanders or park an enemy on NW / a cardinal.
     Reseat lives in normalize (corners, SE second enemy, NW ally) so this
     must not pick n/e/s/w from START_ZONES — that is the 1028 m crush. */
  normalizeAiSlotsForBattlefield();
  /* Validate against the PICKER's own list, not against FACTIONS. FACTIONS has
     no 'nova' entry — it is the enemy roster — so validating a saved player
     faction against it silently rejects the one everybody starts on. It happens
     to land on 'nova' anyway because that is the declared default, which is
     exactly the kind of accident that stops being true the moment the default
     moves. */
  if(su.pf&&typeof playableFactions==='function'&&playableFactions().includes(su.pf)) playerFaction=su.pf;
  else playerFaction='nova';
  if(su.pc&&typeof commanderById==='function'){
    const facKey=typeof commanderFactionKey==='function'?commanderFactionKey(playerFaction):playerFaction;
    const C=commanderById(su.pc),R=typeof COMMANDER_ROSTERS!=='undefined'?COMMANDER_ROSTERS[facKey]||[]:[];
    if(C&&!C.aiOnly&&R.indexOf(C)>=0) playerCommanderId=su.pc;
    else playerCommanderId=((R.find(c=>!c.aiOnly)||(COMMANDER_ROSTERS.nova&&COMMANDER_ROSTERS.nova[0]))||{id:'nova_kai'}).id;
  }
  if(su.df!=null) defenseFocus=su.df?1:0;
  difficulty=Math.max(...activeEnemySlots().map(A=>A.diff));
  document.querySelectorAll('.glbtn').forEach(b=>b.classList.toggle('on',b.dataset.g===goalSel));
  document.querySelectorAll('.tmbtn').forEach(b=>b.classList.toggle('on',+b.dataset.t===timeLimit));
  document.querySelectorAll('.pcbtn').forEach(b=>b.classList.toggle('on',+b.dataset.p===resPace));
  document.querySelectorAll('.crbtn').forEach(b=>b.classList.toggle('on',+b.dataset.c===crateRate));
  document.querySelectorAll('.bsbtn').forEach(b=>b.classList.toggle('on',b.dataset.bs===battlefieldPreset));
  document.querySelectorAll('.pkgbtn').forEach(b=>b.classList.toggle('on',b.dataset.pkg===deploymentPackage));
  const pkh=$('deployPkgHint');if(pkh)pkh.textContent=deploymentPackageDef().ds;
  const bsh=$('battleScaleHint');
  if(bsh) bsh.textContent=battlefieldPresetHint();
  document.querySelectorAll('.ifbtn').forEach(b=>b.classList.toggle('on',!!+b.dataset.i===infestationOn));
  const ifh=$('infestHint'); if(ifh) ifh.textContent=infestationOn
    ?'Neutral nests spread and erupt during the battle.'
    :'No neutral nests, infestation guards, eruptions, spread, or map-wide tides.';
  const gh=$('goalHint'); if(gh) gh.textContent=goalDef().ds;
  const allSame=activeAiSlots().every(A=>A.diff===activeAiSlots()[0].diff);
  document.querySelectorAll('.globalDiff').forEach(b=>b.classList.toggle('on',allSame&&+b.dataset.d===difficulty));
  if(typeof renderPlanetRow==='function') renderPlanetRow();
  document.querySelectorAll('#facRow .fbtn').forEach(b=>b.classList.toggle('on',b.dataset.f===aiFactionSel));
  document.querySelectorAll('#pfacRow .fbtn').forEach(b=>b.classList.toggle('on',b.dataset.f===playerFaction));
  document.querySelectorAll('.dfbtn').forEach(b=>b.classList.toggle('on',+b.dataset.df===defenseFocus));
  const dfh=$('defFocusHint'); if(dfh) dfh.textContent=defenseFocus
    ?'Tower defence: +20% defence HP, +15% damage, +10% range, 25% faster construction — enemy waves arrive 18% faster.'
    :'Classic RTS balance between mobile armies and static defences.';
  builtTheme=curTheme; builtMap=curMap;
  renderMetaHead();
  resize();
  await preloadMatAtlases();     // load premade PBR atlases if present
  initGL3D();                    // depth buffer, culling, the lit + additive programs
  buildMatAtlas();               // upload premade atlases or generate procedurally
  if(typeof initMaterialV2==='function') initMaterialV2(); // allocates only for ?materiallab=1
  initBillboards();              // sprite layer for smoke, fire and energy
  initModels();                  // procedural geometry for every unit, structure and prop
  atlasTex=buildAtlas();         // (2D atlas retained for HUD icons and the minimap)
  if(typeof mfIconInitGL==='function') mfIconInitGL();   // tactical icon sheet + its batch
  buildDetailTex();
  loadTerrainTextures();   // real tileable ground art (async decode)
  initFloatText();
  setupDeposits();               // must precede terrain (raises land under deposits)
  terrainTex=buildTerrain();
  orthoSpan=distTarget=1500; camPitch=pitchTarget=1.19; camYaw=yawTarget=0.6;
  cam.x=MAP*0.5; cam.y=MAP*0.5; clampCam(); camUpdateMatrices();
  setupDoodads();
  renderBuildMenu();
  const hm=$('abHero').querySelector('.em');       // real commander render on the CDR button
  hm.textContent=''; hm.appendChild(unitIconEl(4,32));
  wire();
  if(typeof initDaily==='function') initDaily();       // daily orders + boosters
  if(typeof initOps==='function') initOps();           // threat ladder + weekly
  if(typeof initDevelop==='function') initDevelop();   // research + crafting
  const showScr=id=>{ showFrontScreen(id); sfx('ui'); };
  mfBindTap($('dailyBtn'),()=>{ renderDaily(); showScr('dailyScr'); });
  mfBindTap($('dailyBack'),()=>{ showFrontScreen('startScreen'); renderMetaHead(); sfx('ui'); });
  /* One purpose, so no tab row: the Dossier is the faction codex. Dispatches
     moved to the mailbox whole, sealed entries included (see renderInbox). */
  mfBindTap($('dossierBtn'),()=>{
    if(typeof renderCodex==='function') renderCodex();
    showScr('dossierScr');
  });
  mfBindTap($('opsBtn'),()=>{ renderOps(); showScr('opsScr'); });
  mfBindTap($('devBtn'),()=>{ renderDevelop(); showScr('devScr'); });
  mfBindTap($('devBack'),()=>{ showFrontScreen('startScreen'); renderMetaHead(); sfx('ui'); });
  mfBindTap($('opsBack'),()=>{ showFrontScreen('startScreen'); sfx('ui'); });
  /* One pinned button, two operations. Its label is set by opsSyncGo(); this
     is the matching action, so the CAMPAIGN tab starts a mission and the
     WEEKLY tab starts the weekly, and neither needs its own buried control. */
  $('weeklyGo').addEventListener('pointerdown',e=>{
    const mode=e.currentTarget&&e.currentTarget.dataset.opsMode;
    if(mode==='campaign'){
      sfx('deny');
      toast('CAMPAIGN is not available yet.');
      return;
    }
    startWeekly();
  });
  /* Weekly no longer has its own menu tile — Operations owns the weekly card.
     The listener stays, guarded, so an older shell that still has the button
     keeps working instead of throwing here and killing every wiring below. */
  const wkB=$('weeklyBtn');
  if(wkB) wkB.addEventListener('pointerdown',()=>{ renderOps(); showScr('opsScr');
    setTimeout(()=>{ const w=$('weeklyBox'); if(w) w.scrollIntoView({behavior:'smooth',block:'center'}); },120); });
  mfBindTap($('dossBack'),()=>{ showFrontScreen('startScreen'); sfx('ui'); });
  /* Dismissing a dispatch marks it read, but nothing used to re-render the list
     underneath — the corner badge cleared while the row it came from still
     showed a green dot and NEW until you left the screen and came back. Redraw
     the mailbox on dismiss (never from inside showDispatch, which would rebuild
     the list under a live modal). handleNativeBack routes #dispatch here too,
     so hardware Back gets the same fix. */
  mfBindTap($('dispOk'),()=>{ $('dispatch').style.display='none';
    if(typeof storyRefreshBadge==='function') storyRefreshBadge();
    const ib=$('inboxScr');
    if(ib&&ib.style.display!=='none'&&typeof renderInbox==='function') renderInbox();
    sfx('ui'); });
  /* New subsystems. Each lives in its own module and registers its own UI, so
     none of them need to touch index.html or this file beyond this line. */
  for(const fn of ['initOffline','initSampleAudio','initAssetPacks','initAuthPortal','initTutorial','initAdBoards','initStoreUI','initResTree3D','initEconomyNet','initIntro','initGalaxyUI','initWarPrimer'])
    if(typeof window[fn]==='function'){ try{ window[fn](); }catch(e){ console.error(fn,e); } }
  mfRescueHiddenSetupCards();
  /* The auth portal loads its cached AP_SESSION synchronously. Initialise the
     Profile account/save panel afterwards so it renders that real session,
     rather than briefly and incorrectly labelling the player signed out. */
  if(typeof initAccounts==='function') initAccounts();
  initNativeNavigation();
  if(typeof initUpdater==='function') initUpdater();   // start-menu patcher
  mfCpuBind();
  setupAttract();                                      // live 3D behind the menu
  requestAnimationFrame(frame);
}
boot();
