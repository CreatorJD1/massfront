;
;
/* ============================================================================
   MAP-EXCLUSIVE ENVIRONMENTAL HAZARDS
   ----------------------------------------------------------------------------
   Every map already looked different. None of them PLAYED differently — the
   terrain changed the pathing and nothing else, so map choice was decoration.
   Each map now owns one hazard nobody else gets, drawn from what that place
   actually is:

     Vanguard Valley  DUST FRONT   a squall rolls across the open highway country,
                                   blinding and slowing everything inside it
     Highland Scar    ROCKSLIDE    the cliffs shed; fighting on steep ground has
                                   a cost the plains do not charge
     Shattered Isles  SQUALL       an ocean storm earths itself through the
                                   biggest piece of metal under the cell
     Relic Basin      RELIC PULSE  the thing in the crater is not inert, and the
                                   centre of the map is the richest ground on it

   Three rules the whole file obeys:
     * every hazard hits ALL THREE TEAMS. A hazard that only inconveniences the
       player is a difficulty setting wearing a costume.
     * every hazard is telegraphed before it lands, with enough warning to walk
       out. Damage from nowhere is not difficulty, it is noise.
     * every hazard scales with the difficulty setting, because the whole reason
       Easy was unplayable is that the map's third parties did not.
   ============================================================================ */

const HAZ={ map:'', mode:'', t:0, warn:0, cells:[], front:null, phase:0, count:0, faults:[], vision:[], lava:[] };

/* Shown on the map cards in Battle Setup, so the hazard is part of choosing a
   battlefield rather than a surprise thirty seconds in. */
const MAPHAZ={
  vanguard:{em:'🌪', nm:'DUST FRONTS',  ds:'Squalls cross the valley — sight and speed cut inside'},
  highland:{em:'⛰', nm:'FAULT COLLAPSE',ds:'Marked shelves crack, telegraph, then collapse into impassable scars'},
  isles:   {em:'⚡', nm:'SQUALL LINES', ds:'Lightning earths through the largest massed force'},
  crater:  {em:'◈', nm:'RELIC PULSES', ds:'The basin floor blacks out systems and drains grids'},
};
const MF_HAZARD_PROFILES={
  dust:{em:'🌪',nm:'ASH FRONT',ds:'Abrasive fronts cut sight and movement across exposed ground',mode:'vanguard'},
  storm:{em:'🌩',nm:'TEMPEST CELLS',ds:'Charged weather blinds advancing formations',mode:'vanguard'},
  spores:{em:'◌',nm:'SPORE BLOOM',ds:'Dense alien spores conceal units and slow movement',mode:'vanguard'},
  heat:{em:'♨',nm:'THERMAL SURGE',ds:'Heat distortion sweeps exposed routes and drains combat tempo',mode:'vanguard'},
  collapse:{em:'⛰',nm:'TERRAIN COLLAPSE',ds:'Telegraphed shelves fracture into impassable scars',mode:'highland'},
  eruption:{em:'🌋',nm:'MAGMA ERUPTION',ds:'Unstable vents rupture, then leave dangerous molten ground',mode:'eruption'},
  meteor:{em:'☄',nm:'ORBITAL DEBRIS',ds:'Map-specific debris storms telegraph destructive impact zones',mode:'meteor'},
  squall:{em:'⚡',nm:'SQUALL LINES',ds:'Electrical storms earth through concentrated forces',mode:'isles'},
  whiteout:{em:'❄',nm:'WHITEOUT',ds:'Frozen fronts erase vision before discharging through massed units',mode:'isles'},
  flood:{em:'≋',nm:'FLOOD SURGE',ds:'Rising channels isolate formations before a violent surge',mode:'isles'},
  pulse:{em:'◈',nm:'RELIC PULSES',ds:'Buried systems black out units and drain local grids',mode:'crater'}
};
function mapHazardKey(map){
  const D=(typeof MAPDEFS!=='undefined'&&MAPDEFS[map])?MAPDEFS[map]:null;
  return (D&&D.hazard)||({vanguard:'dust',highland:'collapse',isles:'squall',crater:'pulse'}[map])||'storm';
}
function mapHazardDef(map){
  return MAPHAZ[map]||MF_HAZARD_PROFILES[mapHazardKey(map)]||MF_HAZARD_PROFILES.storm;
}
function mapHazardMode(map){ return (mapHazardDef(map).mode)||map; }

function hazDiff(){ return (typeof diffLvl==='function')?diffLvl():1; }
/* Long gaps on Easy, and a much smaller bite. */
function hazEvery(base){
  const p=typeof battlefieldPresetDef==='function'?battlefieldPresetDef():{haz:1};
  return base*[1.85,1.3,1][hazDiff()]*(p.haz||1);
}
function hazDmg(base){ return base*[0.45,0.75,1][hazDiff()]; }

function hazReset(){
  HAZ.map=(typeof curMap!=='undefined')?curMap:'';
  HAZ.mode=mapHazardMode(HAZ.map);
  HAZ.cells.length=0; HAZ.front=null; HAZ.phase=0; HAZ.warn=0; HAZ.count=0;
  HAZ.faults.length=0; HAZ.vision.length=0; HAZ.lava.length=0;
  /* Nothing happens for the first stretch of any match. A hazard during the
     opening build is just a tax on not knowing the map yet. */
  HAZ.t=hazEvery([150,120,95][hazDiff()]);
  if(typeof uhaz!=='undefined') uhaz.fill(0);
  if(HAZ.mode==='highland') hazSeedFaults();
}
function hazName(){
  const D=mapHazardDef(HAZ.map);
  return (D&&D.nm)||'';
}

/* Apply the blind/slow debuff — see uhaz in sim.js, read by movement and by
   weapon range. Buildings are immune; they were not going anywhere anyway. */
function hazBlind(x,y,r,secs){
  const r2=r*r;
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]) continue;
    if(dist2(ux[i],uy[i],x,y)<r2 && uhaz[i]<secs) uhaz[i]=secs;
  }
}
/* Damage is attributed to team 2 rather than a fourth "environment" team: the
   damage accumulator is a three-slot array and a stray index 3 would quietly
   poison it with NaN. Nothing reads the attacker for kill credit here — the
   attacker index is -1 — so the only effect is that the hive gets blamed for
   the weather, which is close enough to true on this planet. */
function hazHurt(x,y,r,dmg){
  const r2=r*r;
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]) continue;
    const d2=dist2(ux[i],uy[i],x,y);
    if(d2<r2) dealDamage(i,dmg*(1-Math.sqrt(d2)/r*0.55),2,-1);
  }
  /* damageBld takes an INDEX into blds, not the object, and it is the only path
     that handles death properly — rubble, salvage, territory rebuild. */
  for(let b=0;b<blds.length;b++){
    const B=blds[b];
    if(!B||!B.alive) continue;
    const d2=dist2(B.x,B.y,x,y);
    if(d2<r2) damageBld(b,dmg*(1-Math.sqrt(d2)/r*0.55)*0.6,2);
  }
}

/* ---- VANGUARD VALLEY — the dust front -------------------------------------
   A band that crosses the whole map on a fixed heading. It does no damage at
   all: it takes away sight and speed, which on open highway country is the
   thing that actually decides fights. Armies caught mid-march arrive late and
   half-blind; armies that waited lose tempo instead. */
function hazFrontTick(dt){
  const F=HAZ.front;
  if(!F) return;
  F.p+=F.sp*dt;
  const span=Math.hypot(MAP,MAP);
  /* Sample points along the band and blind everything near them. */
  const cx=MAP/2+F.dx*(F.p-span*0.5), cy=MAP/2+F.dy*(F.p-span*0.5);
  F.cx=cx; F.cy=cy;
  const px=-F.dy, py=F.dx;
  for(let k=-6;k<=6;k++){
    const sx=cx+px*k*(MAP/13), sy=cy+py*k*(MAP/13);
    if(sx<-200||sy<-200||sx>MAP+200||sy>MAP+200) continue;
    hazBlind(sx,sy,F.w*0.62,1.1);
    if(typeof addParticle==='function' && (tick+k)%2===0 && perfScale>0.35){
      for(let n=0;n<2;n++)
        addParticle(1, sx+rr(-F.w*0.5,F.w*0.5), sy+rr(-F.w*0.45,F.w*0.45),
                    F.dx*26+rr(-8,8), F.dy*26+rr(-8,8), 1.5+Math.random(),
                    52+Math.random()*40, 168,150,116);
    }
  }
  if(F.p>span+F.w){ HAZ.front=null; }
}

/* ---- HIGHLAND SCAR — rockslides -------------------------------------------
   Sited by slope, not at random: the hazard belongs to the cliffs, so holding
   the high ground is a real trade rather than a free advantage. */
function hazPickSteep(){
  let best=null, bs=-1;
  for(let t=0;t<40;t++){
    const x=rr(220,MAP-220), y=rr(220,MAP-220);
    if(typeof hAt!=='function') break;
    const h=hAt(x,y);
    if(h<0.02) continue;                                   // not underwater
    const s=Math.abs(hAt(x+34,y)-h)+Math.abs(hAt(x,y+34)-h)
           +Math.abs(hAt(x-34,y)-h)+Math.abs(hAt(x,y-34)-h);
    if(s>bs){ bs=s; best=[x,y]; }
  }
  return bs>0.012?best:null;
}

/* Fault shelves are authored by the live heightfield, not by screen-space
   decoration.  Dormant shelves remain visible before they arm, giving players
   a route-planning choice; the normal hazard warning is still the final clear
   signal to evacuate. */
function hazSeedFaults(){
  const want=5;
  for(let tries=0;HAZ.faults.length<want&&tries<90;tries++){
    const p=hazPickSteep(); if(!p) continue;
    if(typeof farFromStartZones==='function'&&!farFromStartZones(p[0],p[1],430)) continue;
    let clear=true;
    for(const F of HAZ.faults) if(dist2(p[0],p[1],F.x,F.y)<280*280){ clear=false; break; }
    if(clear) HAZ.faults.push({x:p[0],y:p[1],r:105+Math.random()*28,state:0,at:0});
  }
}

/* Fog sources ask this at their own position.  Unit debuffs and actual storm
   geometry now reduce line of sight, rather than merely lowering weapon range
   while the fog map continued to reveal everything. */
function hazVisionMult(x,y,unitIdx){
  let m=1;
  if(unitIdx>=0&&typeof uhaz!=='undefined'&&uhaz[unitIdx]>0) m=0.44;
  const F=HAZ.front;
  if(F&&F.cx!=null){
    const along=Math.abs((x-F.cx)*F.dx+(y-F.cy)*F.dy);
    if(along<F.w*0.64) m=Math.min(m,0.42);
  }
  const now=typeof stats!=='undefined'?stats.t:0;
  for(const V of HAZ.vision){
    if(V.until<=now) continue;
    if(dist2(x,y,V.x,V.y)<V.r*V.r) m=Math.min(m,V.m||0.45);
  }
  return m;
}

/* ---- SHATTERED ISLES — squall lightning -----------------------------------
   Earths through the largest mass under the cell. Massing an army in one place
   on an ocean map is exactly what you want to do and exactly what gets hit. */
function hazPickMass(){
  let best=null, bs=0;
  const step=Math.max(1,unitHigh/220|0);
  for(let i=0;i<unitHigh;i+=step){
    if(!ualive[i]||uteam[i]===2) continue;
    let n=0;
    for(let j=0;j<unitHigh;j+=step) if(ualive[j]&&dist2(ux[i],uy[i],ux[j],uy[j])<170*170) n++;
    if(n>bs){ bs=n; best=[ux[i],uy[i]]; }
  }
  for(const B of bldLive){
    if(!B.alive||B.team===2||B.prog<1) continue;
    let n=1.5;
    for(const C of bldLive) if(C.alive&&dist2(B.x,B.y,C.x,C.y)<200*200) n+=1.2;
    if(n>bs){ bs=n; best=[B.x,B.y]; }
  }
  return bs>=3?best:null;
}

function hazTick(dt){
  if(typeof running==='undefined'||!running||demoMode||gameEnded) return;
  if(HAZ.map!==curMap) hazReset();
  const D=hazDiff();
  const now=typeof stats!=='undefined'?stats.t:0;
  for(let i=HAZ.vision.length-1;i>=0;i--) if(HAZ.vision[i].until<=now) HAZ.vision.splice(i,1);

  /* Eruptions leave readable, persistent danger instead of becoming a single
     orange explosion that players can immediately forget. Damage pulses are
     bounded and the pool expires, so it cannot permanently wall off a route. */
  for(let i=HAZ.lava.length-1;i>=0;i--){
    const L=HAZ.lava[i]; L.life-=dt; L.pulse-=dt;
    if(L.life<=0){ HAZ.lava.splice(i,1); continue; }
    if(L.pulse<=0){ L.pulse=.78; hazHurt(L.x,L.y,L.r,hazDmg(34)); }
    if(typeof addParticle==='function'&&perfScale>.32&&Math.random()<dt*9){
      const a=Math.random()*TAU, rr0=Math.sqrt(Math.random())*L.r;
      addParticle(Math.random()<.42?0:1,L.x+Math.cos(a)*rr0,L.y+Math.sin(a)*rr0,
                  rr(-3,3),rr(-18,-5),.5+Math.random()*.7,8+Math.random()*14,255,104,30);
    }
  }

  if(HAZ.front) hazFrontTick(dt);

  /* Telegraph phase: markers are on the ground, damage has not landed yet. */
  if(HAZ.warn>0){
    HAZ.warn-=dt;
    for(const c of HAZ.cells){
      if(typeof addParticle==='function' && (tick%3)===0 && perfScale>0.35)
        addParticle(0, c[0]+rr(-c[2],c[2]), c[1]+rr(-c[2],c[2]), 0,-14, .5, 8,
                    c[3][0],c[3][1],c[3][2]);
    }
    if(HAZ.warn<=0){ hazStrike(); HAZ.cells.length=0; }
    return;
  }

  HAZ.t-=dt;
  if(HAZ.t>0) return;

  if(HAZ.mode==='vanguard'){
    HAZ.t=hazEvery(115+Math.random()*50);
    const a=Math.random()*TAU;
    HAZ.front={dx:Math.cos(a),dy:Math.sin(a),p:0,
               sp:118+Math.random()*40, w:[300,400,480][D]};
    HAZ.count++;
    toast('🌪 Dust front rolling in — sight and speed cut inside it');
    sfx('alarm');
  }
  else if(HAZ.mode==='highland'){
    HAZ.t=hazEvery(95+Math.random()*40);
    HAZ.cells.length=0;
    const n=[1,2,3][D];
    for(let k=0;k<n;k++){
      let F=HAZ.faults.find(q=>q.state===0);
      if(!F){ hazSeedFaults(); F=HAZ.faults.find(q=>q.state===0); }
      if(F){
        F.state=1; F.at=now;
        const c=[F.x,F.y,F.r,[220,176,98]]; c.fault=F; HAZ.cells.push(c);
      }
    }
    if(!HAZ.cells.length){ HAZ.t=20; return; }
    HAZ.warn=4.8; HAZ.phase=1;
    for(const c of HAZ.cells) mmPing(c[0],c[1]);
    toast('⛰ FAULT COLLAPSE — cracked shelves are giving way, clear the marked ground');
    sfx('alarm');
  }
  else if(HAZ.mode==='eruption'){
    HAZ.t=hazEvery(82+Math.random()*38);
    HAZ.cells.length=0;
    const n=[1,2,3][D];
    for(let k=0;k<n;k++){
      const p=hazPickSteep()||[rr(240,MAP-240),rr(240,MAP-240)];
      HAZ.cells.push([p[0],p[1],86+Math.random()*24,[255,92,28]]);
    }
    HAZ.warn=4.4; HAZ.phase=4;
    for(const c of HAZ.cells) mmPing(c[0],c[1]);
    toast('🌋 MAGMA PRESSURE RISING — evacuate the marked vents');
    sfx('alarm');
  }
  else if(HAZ.mode==='isles'){
    HAZ.t=hazEvery(80+Math.random()*35);
    HAZ.cells.length=0;
    const n=[2,3,5][D];
    for(let k=0;k<n;k++){
      const p=hazPickMass();
      if(p) HAZ.cells.push([clamp(p[0]+rr(-70,70),40,MAP-40),
                            clamp(p[1]+rr(-70,70),40,MAP-40),70,[150,225,255]]);
    }
    if(!HAZ.cells.length){ HAZ.t=18; return; }
    HAZ.warn=2.6; HAZ.phase=2;
    mmPing(HAZ.cells[0][0],HAZ.cells[0][1]);
    toast('⚡ Squall line overhead — lightning earthing through massed armour');
    sfx('alarm');
  }
  else if(HAZ.mode==='crater'){
    HAZ.t=hazEvery(125+Math.random()*45);
    HAZ.cells=[[MAP/2,MAP/2,[300,380,460][D],[200,160,255]]];
    HAZ.warn=4.0; HAZ.phase=3;
    mmPing(MAP/2,MAP/2);
    toast('◈ The relic is waking — pulse building at the basin floor');
    sfx('alarm');
  }
  else HAZ.t=60;
}

function hazStrike(){
  const D=hazDiff();
  HAZ.count++;
  if(HAZ.phase===1){                                    // rockslide
    for(const c of HAZ.cells){
      if(c.fault){ c.fault.state=2; c.fault.at=stats.t; }
      spawnExplosion(c[0],c[1],c[2]*0.5,2);
      hazHurt(c[0],c[1],c[2],hazDmg(210));
      hazBlind(c[0],c[1],c[2]*1.2,2.2);
      HAZ.vision.push({x:c[0],y:c[1],r:c[2]*1.2,until:stats.t+3.2,m:0.48});
      /* A collapse is terrain, not a decal: the deeper bowl is processed by
         the existing deformation queue, re-lights the mesh and updates the
         passability grid if the shelf tears below the water table. */
      if(typeof deformTerrain==='function') deformTerrain(c[0],c[1],c[2]*0.78,0.105);
      if(typeof addParticle==='function')
        for(let k=0;k<14;k++)
          addParticle(1,c[0]+rr(-c[2]*0.6,c[2]*0.6),c[1]+rr(-c[2]*0.6,c[2]*0.6),
                      rr(-14,14),rr(-24,-6),1.8,44+Math.random()*40, 150,136,116);
    }
    shake=Math.max(shake,5);
  }
  else if(HAZ.phase===2){                               // lightning
    for(const c of HAZ.cells){
      spawnExplosion(c[0],c[1],c[2]*0.7,2);
      hazHurt(c[0],c[1],c[2],hazDmg(260));
      hazBlind(c[0],c[1],c[2]*1.4,1.6);                 // EMP dazzle
      HAZ.vision.push({x:c[0],y:c[1],r:c[2]*1.45,until:stats.t+2.4,m:0.36});
      if(typeof addParticle==='function')
        for(let k=0;k<10;k++)
          addParticle(0,c[0]+rr(-c[2]*0.5,c[2]*0.5),c[1]+rr(-c[2]*0.5,c[2]*0.5),
                      0,rr(-40,-10),.45,10, 190,240,255);
    }
    shake=Math.max(shake,4);
    if(typeof flashScreen==='function'&&HAZ.cells.length>2) flashScreen();
  }
  else if(HAZ.phase===3){                               // relic pulse
    const c=HAZ.cells[0];
    spawnExplosion(c[0],c[1],c[2]*0.4,2);
    hazHurt(c[0],c[1],c[2],hazDmg(150));
    hazBlind(c[0],c[1],c[2]*1.15,4.5);                  // long systems blackout
    HAZ.vision.push({x:c[0],y:c[1],r:c[2]*1.15,until:stats.t+5.2,m:0.32});
    /* It eats power too — the basin punishes anyone who parks their grid on it. */
    for(let t=0;t<2;t++) if(typeof resE!=='undefined') resE[t]=Math.max(0,resE[t]*0.88);
    if(typeof addParticle==='function')
      for(let k=0;k<20;k++){
        const a=Math.random()*TAU;
        addParticle(0,c[0]+Math.cos(a)*c[2]*0.5,c[1]+Math.sin(a)*c[2]*0.5,
                    Math.cos(a)*70,Math.sin(a)*70,.7,13, 200,150,255);
      }
    shake=Math.max(shake,7);
    toast('◈ RELIC PULSE — systems down across the basin');
  }
  else if(HAZ.phase===4){                               // magma eruption
    for(const c of HAZ.cells){
      spawnExplosion(c[0],c[1],c[2]*.75,2);
      hazHurt(c[0],c[1],c[2]*1.08,hazDmg(320));
      hazBlind(c[0],c[1],c[2]*1.3,2.4);
      HAZ.vision.push({x:c[0],y:c[1],r:c[2]*1.35,until:stats.t+4,m:.5});
      HAZ.lava.push({x:c[0],y:c[1],r:c[2]*.82,life:34+Math.random()*14,pulse:.2});
      if(typeof deformTerrain==='function') deformTerrain(c[0],c[1],c[2]*.65,.055);
      if(typeof addParticle==='function') for(let k=0;k<28;k++){
        const a=Math.random()*TAU;
        addParticle(k%3?0:1,c[0]+Math.cos(a)*rr(0,c[2]*.5),c[1]+Math.sin(a)*rr(0,c[2]*.5),
                    Math.cos(a)*rr(12,55),Math.sin(a)*rr(12,55),.6+Math.random(),
                    10+Math.random()*22,255,92,24);
      }
    }
    shake=Math.max(shake,11);
    if(typeof flashScreen==='function') flashScreen();
    toast('🌋 MAGMA ERUPTION — molten ground remains lethal');
    if(typeof sfx==='function'&&HAZ.cells.length) sfx('boom',HAZ.cells[0][0],HAZ.cells[0][1],2.2);
  }
  HAZ.phase=0;
}

