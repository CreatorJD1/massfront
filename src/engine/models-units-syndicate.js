;
;
/* ============================================================================
   SYNDICATE COALITION — UNIT KIT
   ----------------------------------------------------------------------------
   Load after engine/models.js. Classic script, one shared global scope: every
   name in here is prefixed `coa`/`mdlCoa` so it cannot collide with the four
   model libraries already in the bundle.

   THE PROBLEM THIS SOLVES. The Coalition already ships a complete 27-building
   kit (models-machine.js) and exactly five bespoke chassis, so twenty-one of
   its unit slots fell through to the base roster — tracked, riveted, crewed
   vehicles parked in front of triangular hovering architecture. A faction is
   not a tint; it is a construction language, and half this army was speaking
   somebody else's.

   THE LANGUAGE, taken from the buildings and from mdlSynTank/mdlSyndicateRhino:
     - hexagonal plan. macHex() draws every Machine pad, silo and relay; every
       hull here is a hex or a raked derivative of one.
     - triangular pylons with a lit spine, exactly like macPylon().
     - separated, floating mechanisms — a core suspended inside a ring cage,
       the way macCore() hangs a reactor above a structure.
     - open energy throats. A Machine weapon is never a solid tube with a black
       dot on the end: it is a guide bore with accelerator rings down it and a
       real shadowed mouth (tubeX + TWR_BORE), the same as macPortal().
     - NO tracks, NO wheels, NO suspension, NO windows. These are autonomous
       constructs riding plenum skirts with a visible air gap underneath, and
       nothing on them is shaped for a human being to sit in.

   MATERIALS. The colour constants are material selectors, so the choices here
   are structural, not decorative:
     TEAM_A/TEAM_B/TEAM_T  the only surfaces that take the faction's livery.
                           Two to five panels per model, always in the same
                           places — flank rail, deck badge, dorsal stripe — so
                           ownership reads at command zoom without drowning the
                           metal.
     SERVO                 marks a surface as a LEG; the vertex stage swings it
                           through the walk cycle below y=11. Used on the TITAN
                           and NOWHERE else in this file, because painting a
                           hovering hull SERVO makes it flap.
     ENERGY / TWR_GLOW     lift coils, accelerator rings, cores. Deliberate and
                           local; smeared everywhere it stops meaning anything.
   ============================================================================ */

/* ---------------------------------------------------------------------------
   COMPONENT KIT
   The buildings get macPad/macPylon/macCore; the units get the same vocabulary
   sized for a vehicle. Every one of these is a COMPONENT with its material
   breaks already in it, so a chassis assembled from them starts at "machine".
   --------------------------------------------------------------------------- */

/* Hexagonal plan, elongated on X so the nose is a point rather than a facet.
   This is the shape the whole faction is drawn from. */
function coaHex(rx,rz){
  const p=[];
  for(let i=0;i<6;i++){ const a=i/6*TAU; p.push([Math.cos(a)*rx,Math.sin(a)*rz]); }
  return p;
}
/* Triangular plan, apex forward — macTri()'s footprint at vehicle scale. */
function coaTri(r){
  const p=[];
  for(let i=0;i<3;i++){ const a=-Math.PI/2+i/3*TAU; p.push([Math.cos(a)*r,Math.sin(a)*r]); }
  return p;
}

/* PLENUM SKIRT — the single part every Coalition ground chassis shares, and
   the reason none of them needs running gear. A chamfered hex plenum with
   exposed lift coils along both flanks and a glowing ring over each one; the
   whole assembly starts above y=0 so there is a real air gap and a real shadow
   under the vehicle. Coils are uncapped and the rings are 8-segment: this
   runs on ten thousand units, and a 16-segment ring is where that budget
   disappears. */
function coaSkirt(m,rx,rz,y,h,n,col){
  m.extrude(0,y,0,coaHex(rx,rz),h,col||TWR_COAT);
  m.extrude(0,y+h,0,coaHex(rx*0.90,rz*0.90),h*0.40,TWR_ARM_D);
  n=n||3;
  for(const sd of [-1,1]) for(let k=0;k<n;k++){
    const x=n<2?0:rx*(-0.54+1.08*k/(n-1));
    /* The coils hang into the air gap, which is the whole point of them — but
       never through the floor. A hover unit whose lowest geometry crosses y=0
       z-fights the terrain it is supposed to be floating over. */
    m.cyl(x,y-h*0.18,sd*rz*0.78,h*0.44,h*0.36,h*0.70,8,TWR_MACH,false);
    m.ring(x,y+h*0.44,sd*rz*0.78,h*0.30,h*0.58,8,ENERGY);
  }
  return m;
}
/* Triangular pylon with a lit spine. macPylon() is the Machine's most repeated
   silhouette element; this is the same object shrunk onto a hull. */
function coaPylon(m,x,y,z,h,w,yaw,lit){
  m.extrude(x,y,z,coaTri(w),h,TWR_COAT,yaw||0);
  m.extrude(x,y+h,z,coaTri(w*0.64),h*0.30,TWR_ARM,yaw||0);
  m.box(x,y+h*0.28,z,w*0.34,h*0.58,w*0.66,lit||TWR_GLOW,yaw||0);
  return m;
}
/* Suspended core inside a ring cage — macCore() at unit scale. The floating
   mechanism is the faction's whole thesis: the machine is not a box with parts
   bolted on, it is a field with hardware arranged around it. */
function coaCore(m,x,y,z,r,cage){
  m.sphere(x,y,z,r,7,TWR_GLOW,1,false);
  m.ring(x,y,z,r*1.34,r*1.62,12,TWR_TRIM);
  if(cage) ringX(m,x,y,z,r*1.48,r*1.80,12,TWR_ARM);
  return m;
}
/* COIL EMITTER — the Coalition's gun. A slim guide tube, accelerator rings
   stepping down it with the last one lit, and an open bore at the mouth. It is
   never a solid barrel: the shadowed throat is what says "energy weapon" at
   the distance a player actually plays at. */
function coaCoilGun(m,x,y,z,len,r,rings,col){
  const n=rings||3;
  cylX(m,x,y,z,len,r,r*0.84,8,col||TWR_MACH,false);
  for(let k=0;k<n;k++)
    ringX(m,x+len*(k+0.9)/(n+0.9),y,z,r*1.06,r*1.58,10,k===n-1?TWR_GLOW:TWR_TRIM);
  tubeX(m,x+len-r*0.25,y,z,r*1.16,r*1.12,r*0.54,10,TWR_BORE);
  return m;
}
/* Rear lift throat, flaring toward -X. Not a rocket bell: the Coalition's
   exhaust is a field, so there is no soot ring and no heat shroud, just a
   collar with the glow recessed inside it. */
function coaThroat(m,x,y,z,r,len){
  cylX(m,x-len,y,z,len,r,r*0.70,8,TWR_MACH,false);
  ringX(m,x-len,y,z,r*0.98,r*1.26,10,TWR_TRIM);
  ringX(m,x-len+0.08,y,z,r*0.28,r*0.82,10,ENERGY);
  return m;
}
/* Elevation / brace ram. hydraulic() in models.js costs 84 triangles a piece
   because all three of its cylinders are capped; a linkage nobody looks at
   cannot cost that on every unit in a ten-thousand-unit game. */
function coaRam(m,x,y,z,len,r,col){
  m.cyl(x,y,z,r,r*0.92,len*0.62,7,col||TWR_MACH,false);
  m.cyl(x,y+len*0.58,z,r*0.52,r*0.52,len*0.46,6,TWR_TRIM,false);
  return m;
}
/* DECK BADGE — livery hex plate inside a lit ring.
   Two things have to survive this game's near-overhead camera: whose unit it is
   and which army built it. The skirt coils carry the Coalition's glow, but they
   sit in the air gap where the hull hides them from directly above, so from the
   angle the player actually plays at the whole faction went dark. The badge
   fixes both at once and lands in the SAME PLACE on every chassis, which is
   what turns it into a read instead of a decoration. */
function coaBadge(m,x,y,z,r,col){
  m.extrude(x,y,z,coaHex(r,r*0.84),0.22,col||TEAM_A);
  m.ring(x,y+0.16,z,r*1.12,r*1.44,10,ENERGY);
  return m;
}
/* ============================================================================
   ARTILLERY AND SIEGE
   Three separate silhouettes because the stat lines are three different jobs:
   Thumper lobs from 265 on 135 hit points, Bombard reaches 400 and is the
   longest weapon in the game, Harbinger saturates from 210 with 760 hit points
   behind it. If those read the same the player buys the wrong one.
   ============================================================================ */

/* 3 — THUMPER. Arcing mortar, thin-hulled: 135 hp on a 56-mass chassis, so the
   hull is narrow and the machinery is exposed. The weapon is short and very
   wide-bored and sits high on the mount, because the thing that says "this
   shoots over a hill" is throat diameter, not tube length. */
function mdlCoaArty(){
  const m=MB();
  coaSkirt(m,6.5,2.7,0.42,1.5,3);
  m.extrude(0,2.35,0,coaHex(6.1,2.45),1.85,TWR_ARM_D);
  m.extrude(0.2,4.20,0,coaHex(4.9,2.00),0.55,TWR_ARM);
  m.wedge(4.55,4.20,0,3.1,0.95,3.3,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    armorPlate(m,0.2,2.35,sd*2.55,8.4,1.55,0.40,0,TWR_COAT,0);   // thin spaced skirt
    m.box(-0.6,4.80,sd*1.78,6.2,0.20,0.50,TEAM_A);
    m.bevelBox(-3.3,4.78,sd*1.45,2.5,1.25,1.15,0.26,TWR_COAT);   // ready-round cells
    m.box(-3.3,6.00,sd*1.45,1.9,0.18,0.44,ENERGY);
    coaPylon(m,-5.1,4.78,sd*1.25,2.3,0.92,0,ENERGY);             // charge pylons
  }
  ventBank(m,-1.6,4.80,0,2.2,2.9,4,TWR_MACH,0);
  m.greeble(0.6,4.80,0,2.6,2.2,0.34,5,TWR_MACH,0,91);
  coaBadge(m,1.9,4.80,0,1.45,TEAM_T);
  coaThroat(m,-6.3,3.20,0,0.70,1.3);
  glowStrip(m,3.3,4.86,0,2.6,ENERGY,0);
  const t=MB();
  t.cyl(-0.5,0,0,2.45,2.10,0.80,12,TWR_PAD);
  t.extrude(0,0.80,0,[[-2.9,-1.9],[1.5,-2.3],[3.2,-0.9],[3.2,0.9],[1.5,2.3],[-2.9,1.9]],1.85,TWR_ARM_D);
  t.extrude(0.1,2.65,0,[[-2.2,-1.4],[1.2,-1.7],[2.5,-0.7],[2.5,0.7],[1.2,1.7],[-2.2,1.4]],0.48,TEAM_T);
  for(const sd of [-1,1]){
    t.bevelBox(-1.2,1.10,sd*2.10,3.1,1.35,0.48,0.20,TWR_COAT);
    coaRam(t,-1.7,0.45,sd*1.45,2.1,0.27,TWR_MACH);
    t.box(-1.2,2.48,sd*2.32,1.9,0.18,0.40,sd>0?TEAM_A:TWR_GLOW);
  }
  cylX(t,1.0,2.85,0,3.5,1.12,1.00,10,TWR_MACH,false);            // short, very wide throat
  for(const x of [1.9,3.1]) ringX(t,x,2.85,0,1.16,1.60,10,x>3?TWR_GLOW:TWR_TRIM);
  tubeX(t,4.35,2.85,0,1.45,1.30,0.68,12,TWR_BORE);
  t.bevelBox(-2.7,1.20,0,1.7,2.1,3.0,0.32,DARKER);
  coaCore(t,-2.7,3.55,0,0.82,false);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:4.75,muzzle:5.0};
}

/* 16 — BOMBARD. Range 400, the longest reach on the board, and the model has
   exactly one job: be a very long thin emitter on a carriage braced to survive
   firing it. Outrigger feet drop from the skirt, the accelerator runs almost
   the full length of the unit again, and there is nothing else competing for
   the silhouette. */
function mdlCoaSiege(){
  const m=MB();
  coaSkirt(m,7.6,3.4,0.48,1.9,4);
  m.extrude(0,2.90,0,coaHex(7.1,3.10),2.30,TWR_ARM_D);
  m.extrude(0.2,5.20,0,coaHex(5.6,2.45),0.65,TWR_ARM);
  m.wedge(5.2,5.20,0,3.6,1.15,4.1,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    /* Deployed outriggers. A hover carriage that plants itself is the only
       honest way to draw a recoiling 400-range weapon with no wheels. */
    m.bevelBox(-4.6,1.30,sd*4.15,3.4,1.5,1.15,0.28,TWR_COAT);
    m.wedge(-5.6,0.30,sd*4.15,3.0,1.0,2.2,TWR_PAD,0,sd<0);
    coaRam(m,-4.2,2.60,sd*3.85,2.6,0.30,TWR_MACH);
    m.box(-0.4,5.86,sd*2.35,7.4,0.22,0.55,TEAM_A);
    coaPylon(m,-6.0,5.30,sd*1.45,3.2,1.05,0,ENERGY);
    armorPlate(m,0.4,2.90,sd*3.25,9.4,1.7,0.42,0,TWR_COAT,0);
  }
  ventBank(m,-2.4,5.86,0,2.8,3.6,5,TWR_MACH,0);
  m.greeble(0.6,5.86,0,4.0,3.4,0.40,6,TWR_MACH,0,151);
  m.bevelBox(-4.4,5.84,0,2.6,1.6,4.6,0.34,DARKER);               // charge magazine
  m.box(-4.4,7.42,0,2.0,0.22,3.4,ENERGY);
  coaBadge(m,2.4,5.86,0,1.7,TEAM_T);
  coaThroat(m,-7.3,3.60,0,0.85,1.5);
  deckCrown(m,0,5.84,0,13.0,6.2,TWR_COAT,TEAM_T);
  const t=MB();
  t.cyl(-1.0,0,0,3.1,2.70,0.95,12,TWR_PAD);
  t.extrude(-0.4,0.95,0,coaHex(3.9,2.55),2.30,TWR_ARM_D);
  t.extrude(-0.3,3.25,0,coaHex(3.0,1.95),0.55,TEAM_T);
  for(const sd of [-1,1]){
    t.bevelBox(-2.0,1.30,sd*2.45,3.6,1.7,0.52,0.22,TWR_COAT);
    coaRam(t,-2.4,0.50,sd*1.85,2.6,0.30,TWR_MACH);
    t.box(-2.0,3.10,sd*2.72,2.4,0.20,0.46,sd>0?TEAM_A:TWR_GLOW);
    t.cyl(1.4,1.10,sd*1.60,0.95,0.85,1.9,8,TWR_MACH,false);      // capacitor drums
  }
  /* THE WEAPON. Sixteen units of accelerator with five rings on it, a wide
     collar at the muzzle and a real bore. Nothing else on the model is long. */
  coaCoilGun(t,1.6,2.55,0,15.6,0.72,5,TWR_MACH);
  cylX(t,1.0,2.55,0,2.6,1.30,1.02,10,TWR_COAT,false);
  /* A sixteen-unit emitter needs a visible truss holding it up, or it reads as
     a stick pushed through the turret. Two braces and a mid-span yoke. */
  for(const sd of [-1,1]){
    t.box(7.4,3.35,sd*0.90,10.4,0.30,0.30,TWR_TRIM);
    t.box(4.2,2.95,sd*0.86,0.34,1.10,0.34,TWR_MACH);
    t.box(11.0,2.95,sd*0.86,0.34,1.10,0.34,TWR_MACH);
  }
  t.bevelBox(7.6,1.95,0,1.5,1.3,2.4,0.28,TWR_MACH);
  t.box(16.6,1.45,0,1.3,2.1,3.1,TWR_MACH);
  t.bevelBox(-3.6,1.40,0,2.0,2.6,4.2,0.36,DARKER);
  t.greeble(-2.0,3.85,0,2.6,3.4,0.36,4,TWR_MACH,0,101);
  coaCore(t,-3.6,4.30,0,1.05,false);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:5.85,muzzle:17.2};
}

/* 27 — HARBINGER. 760 hp, aoe 60: a saturation platform, not a sniper. Fixed
   forward battery of six short throats stacked in a frame, on a heavy skirt —
   the silhouette is WIDE where the Bombard is LONG. */
function mdlCoaBattery(){
  const m=MB();
  coaSkirt(m,8.2,4.4,0.50,2.0,4);
  m.extrude(0,3.05,0,coaHex(7.7,4.15),2.60,TWR_ARM_D);
  m.extrude(0,5.65,0,coaHex(6.1,3.30),0.70,TWR_ARM);
  m.wedge(5.4,5.65,0,3.4,1.20,5.4,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    armorPlate(m,0.2,3.05,sd*4.35,10.6,2.0,0.48,0,TWR_COAT,0);
    armorPlate(m,0.2,5.15,sd*4.60,9.2,1.3,0.44,0,TWR_ARM,0);     // second skirt tier
    m.box(-0.4,6.36,sd*3.15,8.0,0.24,0.60,TEAM_A);
    coaPylon(m,-6.2,5.75,sd*2.20,3.6,1.15,0,ENERGY);
    m.bevelBox(-3.4,6.35,sd*2.55,2.8,1.4,1.5,0.30,TWR_COAT);
    m.box(-3.4,7.72,sd*2.55,2.2,0.20,0.55,ENERGY);
    /* Outrigger stabilisers — a saturation battery plants itself between
       salvos, and on a hover chassis the pads are the only way to show it. */
    m.bevelBox(-5.4,1.40,sd*4.65,3.0,1.4,1.10,0.26,TWR_COAT);
    m.wedge(-6.3,0.35,sd*4.65,2.6,0.95,2.0,TWR_PAD,0,sd<0);
    coaRam(m,-5.0,2.70,sd*4.35,2.4,0.28,TWR_MACH);
  }
  /* Six throats in a bedded frame. They are SHORT — a saturation battery is a
     wall of muzzles, and that only reads if none of them is long enough to be
     mistaken for the siege gun. */
  m.bevelBox(1.2,6.35,0,6.6,1.6,7.0,0.42,TWR_MACH);
  m.box(-2.6,6.35,0,1.1,3.4,6.6,TWR_COAT);                       // backplate
  for(let r=0;r<2;r++) for(let c=-1;c<=1;c++){
    const y=7.35+r*1.55, z=c*2.35;
    cylX(m,-1.4,y,z,4.2,0.68,0.62,8,TWR_MACH,false);
    ringX(m,0.6,y,z,0.68,0.94,8,TWR_TRIM);
    ringX(m,2.5,y,z,0.70,1.00,8,TWR_GLOW);
    tubeX(m,2.6,y,z,0.72,0.70,0.36,8,TWR_BORE);
  }
  m.bevelBox(-4.2,6.35,0,2.4,2.6,5.4,0.36,DARKER);               // reload gantry
  m.greeble(-4.2,8.92,0,1.9,4.4,0.50,5,TWR_MACH,0,73);
  ventBank(m,-4.6,6.36,0,3.0,4.4,5,TWR_MACH,0);
  coaBadge(m,3.4,6.36,0,1.8,TEAM_T);
  coaCore(m,-5.6,8.10,0,1.35,true);
  coaThroat(m,-7.9,3.90,0,0.95,1.7);
  deckCrown(m,-0.4,6.34,0,13.6,8.0,TWR_COAT,TEAM_T);
  return {hull:m.build(),tur:null,s:1.05};
}

/* ============================================================================
   AIR
   ============================================================================ */

/* 5 — WASP. A 30-mass attack drone. No wings, no fuselage, no crew volume: a
   lifting hex plate with a coil pod under each cheek and an optic where a
   canopy would be on somebody else's aircraft. It has to look CHEAP. */
function mdlCoaDrone(){
  const m=MB();
  m.extrude(0,0.90,0,coaHex(4.7,3.20),0.90,TWR_ARM_D);
  m.extrude(0.2,1.80,0,coaHex(3.5,2.35),0.60,TWR_ARM);
  m.extrude(0.3,2.40,0,coaHex(2.2,1.50),0.26,TEAM_A);
  m.wedge(3.5,1.80,0,2.3,0.70,2.4,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    /* The vane is structure, not a wing: it overlaps the hull edge, it is hull
       material, and the livery rides ON it as a stripe. A bright detached slab
       at a rake angle reads as loose paper from overhead. */
    m.wedge(-1.1,1.35,sd*2.85,5.0,0.52,2.3,TWR_ARM,sd*0.12,sd<0);
    m.box(-1.1,1.87,sd*3.05,3.2,0.16,0.90,TEAM_A);
    m.cyl(-0.6,0.50,sd*2.85,0.60,0.50,0.50,8,TWR_MACH,false);
    m.ring(-0.6,1.02,sd*2.85,0.50,0.84,8,ENERGY);
    coaCoilGun(m,2.1,1.32,sd*1.25,2.5,0.29,2,TWR_MACH);
  }
  m.sphere(2.7,2.48,0,0.52,7,TWR_GLOW,1,false);
  m.box(-2.4,2.44,0,2.4,0.18,0.48,TEAM_A);
  m.ring(0.3,2.72,0,0.85,1.20,10,ENERGY);                        // dorsal lift ring
  coaThroat(m,-3.7,1.35,0,0.68,1.2);
  return {hull:m.build(),tur:null,s:1.0,air:1,propulsion:{mode:'field',sockets:[
    {p:[-4.90,1.35,0],axis:[-1,0,0],diameter:1.36,effect:'trail'},
    {p:[-.60,.50,-2.85],axis:[0,-1,0],diameter:1.00,effect:'lift'},
    {p:[-.60,.50, 2.85],axis:[0,-1,0],diameter:1.00,effect:'lift'}
  ]}};
}

/* 25 — KESTREL. 120 hp and speed 96 — the smallest, fastest thing the faction
   owns. One long spine, two blade vanes, a sensor ring where the Wasp carries
   its pods, and a single hair-thin emitter. Beside the Wasp it must read as
   half the machine, so it gets half the hardware. */
function mdlCoaScout(){
  const m=MB();
  m.extrude(0,0.80,0,[[-5.4,-1.00],[-2.6,-1.50],[2.4,-1.35],[5.6,-0.50],[6.4,0],
                      [5.6,0.50],[2.4,1.35],[-2.6,1.50],[-5.4,1.00]],0.80,TWR_ARM_D);
  m.extrude(0.2,1.60,0,[[-4.2,-0.72],[-2.0,-1.05],[2.2,-0.95],[4.4,-0.36],[5.0,0],
                        [4.4,0.36],[2.2,0.95],[-2.0,1.05],[-4.2,0.72]],0.48,TWR_ARM);
  m.box(-0.8,2.08,0,4.4,0.18,0.44,TEAM_T);
  for(const sd of [-1,1]){
    m.wedge(-1.6,1.10,sd*2.85,5.2,0.40,2.3,TWR_COAT,sd*0.30,sd<0);
    m.box(-1.6,1.50,sd*3.05,3.0,0.16,0.85,TEAM_A);
    m.cyl(-3.5,0.58,sd*1.05,0.40,0.34,0.38,7,TWR_MACH,false);
    m.ring(-3.5,0.98,sd*1.05,0.32,0.58,8,ENERGY);
  }
  m.ring(1.6,2.02,0,0.92,1.32,10,ENERGY);                        // sensor array
  m.sphere(1.6,2.06,0,0.58,7,TWR_GLOW,0.8,false);
  coaCoilGun(m,3.3,1.30,0,2.1,0.25,2,TWR_MACH);
  coaThroat(m,-4.6,1.20,0,0.60,1.1);
  return {hull:m.build(),tur:null,s:0.92,air:1,propulsion:{mode:'field',sockets:[
    {p:[-5.70,1.20,0],axis:[-1,0,0],diameter:1.20,effect:'trail'},
    {p:[-3.50,.58,-1.05],axis:[0,-1,0],diameter:.76,effect:'lift'},
    {p:[-3.50,.58, 1.05],axis:[0,-1,0],diameter:.76,effect:'lift'}
  ]}};
}

/* 17 — RAPTOR. Range 52 and 85 damage a shot: this thing has to get close and
   survive it, so it is stubby, thick and armoured, with the coil bank slung
   UNDER THE CHIN where the player can see what is about to happen. The Wasp
   is a plate; this is a fist. */
function mdlCoaGunship(){
  const m=MB();
  m.extrude(0,0.95,0,coaHex(5.4,3.60),1.35,TWR_ARM_D);
  m.extrude(0,2.30,0,coaHex(4.6,3.00),1.15,TWR_ARM);
  m.extrude(0.2,3.45,0,coaHex(3.2,2.00),0.34,TEAM_A);
  m.wedge(4.3,2.30,0,2.6,1.05,3.6,TWR_ARM,0,true);               // armoured brow
  for(const sd of [-1,1]){
    m.wedge(-1.2,2.05,sd*3.85,5.4,0.62,1.9,TWR_COAT,sd*0.22,sd<0);
    m.box(-1.2,2.66,sd*4.15,3.6,0.20,0.90,TEAM_T);
    m.cyl(-0.4,0.55,sd*3.15,0.78,0.66,0.60,8,TWR_MACH,false);
    m.ring(-0.4,1.14,sd*3.15,0.62,1.02,8,ENERGY);
    m.bevelBox(-3.2,2.35,sd*2.35,2.6,1.5,1.4,0.30,TWR_COAT);     // armoured cheeks
    armorPlate(m,-0.4,1.30,sd*3.35,6.8,1.5,0.42,0,TWR_COAT,0);   // flank belt
    m.bevelBox(-4.0,2.55,sd*1.10,2.2,1.9,1.1,0.28,DARKER);       // tail spine housing
    coaThroat(m,-4.6,2.05,sd*1.55,0.72,1.4);
  }
  /* CHIN BANK. Three heavy short coils on a chin mount, below the hull line.
     At 52 range the weapon is the unit; hiding it inside the body would leave
     a blank block that reads as a transport. */
  m.bevelBox(2.2,0.55,0,3.6,0.95,3.2,0.34,TWR_MACH);
  for(const z of [-1.05,0,1.05]) coaCoilGun(m,3.0,1.00,z,2.7,0.34,2,TWR_MACH);
  m.wedge(4.0,1.50,0,1.6,0.55,3.0,TWR_COAT,0,true);              // blast shroud
  coaCore(m,-1.6,3.95,0,0.78,false);
  m.greeble(-1.0,3.79,0,3.0,2.4,0.34,5,TWR_MACH,0,121);
  m.box(1.2,3.80,0,3.0,0.20,0.52,TEAM_A);
  return {hull:m.build(),tur:null,s:1.0,air:1,propulsion:{mode:'field',sockets:[
    {p:[-6.00,2.05,-1.55],axis:[-1,0,0],diameter:1.44,effect:'trail'},
    {p:[-6.00,2.05, 1.55],axis:[-1,0,0],diameter:1.44,effect:'trail'},
    {p:[-.40,.55,-3.15],axis:[0,-1,0],diameter:1.32,effect:'lift'},
    {p:[-.40,.55, 3.15],axis:[0,-1,0],diameter:1.32,effect:'lift'}
  ]}};
}

/* ============================================================================
   THE TITAN
   ============================================================================ */

/* 2 — GOLIATH. TYPES.legs:1, size 21, splash cannon. This slot used to share
   mdlSynTank with the Longbow — a hover diamond with no SERVO, so the gait
   flag animated nothing and the assault walker read as a second Rhino. The
   Titan is the fortress; this is the line walker: same hex language, legs
   stood OUTBOARD of the hull (Nova's first walker pass hid them under the
   torso and it became a turret on a plinth), hip bridge at y=9 so the
   shader's y=11 cut falls in the thigh. Everything below the hip is SERVO. */
function mdlCoaWalker(){
  const m=MB();
  for(const sd of [-1,1]){
    m.extrude(-0.6,0,sd*5.35,coaHex(3.15,1.85),1.35,SERVO);
    m.box(2.15,0.22,sd*5.35,1.55,0.85,2.55,SERVO);
    m.wedge(3.05,0.10,sd*5.35,1.35,0.62,0.85,SERVO,0,true);
    m.cyl(-0.55,1.35,sd*5.35,1.15,0.98,0.82,8,SERVO,false);
    m.ring(-0.55,2.18,sd*5.35,0.92,1.28,8,SERVO);
    m.extrude(-0.25,2.15,sd*5.35,coaHex(1.70,1.55),4.15,SERVO);
    m.bevelBox(-0.20,3.05,sd*5.35,2.35,2.45,3.15,0.34,SERVO);
    armorPlate(m,-0.20,3.85,sd*7.05,3.05,1.85,0.38,0,SERVO,0);
    coaRam(m,-1.55,2.20,sd*5.35,3.7,0.32,SERVO);
    m.cyl(0.20,6.35,sd*5.35,1.75,1.55,1.45,9,SERVO,false);
    m.ring(0.20,7.15,sd*5.35,1.55,2.05,9,SERVO);
    m.extrude(-0.10,7.55,sd*5.35,coaHex(1.65,1.50),2.55,SERVO);
    m.box(-1.05,8.05,sd*3.85,1.55,2.10,0.95,SERVO);
  }
  m.extrude(0,9.05,0,coaHex(5.15,5.25),2.85,TWR_ARM_D);
  m.extrude(0.12,11.90,0,coaHex(4.35,4.45),1.15,TEAM_A);
  for(const sd of [-1,1]){
    armorPlate(m,0.15,12.00,sd*4.35,5.8,1.05,0.40,0,TWR_ARM,0);
    coaPylon(m,-3.15,10.55,sd*3.55,2.85,0.95,0,ENERGY);
    m.box(0.20,12.08,sd*4.35,4.4,0.22,0.95,sd>0?TEAM_A:TEAM_B);
  }
  m.bevelBox(-3.15,10.35,0,3.05,2.15,7.15,0.48,DARKER);
  ventBank(m,-3.05,13.12,0,2.25,5.05,5,TWR_MACH,0);
  m.extrude(0,13.05,0,coaHex(4.55,4.35),3.85,TWR_ARM_D);
  m.extrude(0.22,16.90,0,coaHex(3.65,3.45),1.15,TEAM_A);
  m.wedge(3.35,14.55,0,2.85,2.55,6.4,TEAM_T,0,true);
  glowStrip(m,3.35,17.15,0,3.2,ENERGY,0);
  coaBadge(m,1.15,18.10,0,1.35,TEAM_T);
  for(const sd of [-1,1]){
    m.bevelBox(0.35,14.35,sd*4.85,4.15,2.65,2.55,0.46,TWR_COAT);
    m.box(0.35,17.05,sd*4.85,3.55,0.26,1.85,TEAM_A);
    m.box(-3.05,13.55,sd*3.85,1.45,3.05,0.75,DARK);
    for(let k=0;k<3;k++) m.box(-2.75,14.05+k*0.85,sd*4.25,1.05,0.26,0.24,TWR_TRIM);
  }
  coaThroat(m,-5.05,11.55,0,0.72,1.35);
  const t=MB();
  t.cyl(-0.55,0,0,2.35,2.05,0.85,12,TWR_PAD);
  t.extrude(-0.25,0.85,0,coaHex(2.85,2.25),1.85,TWR_ARM_D);
  t.extrude(-0.10,2.70,0,coaHex(2.25,1.75),0.55,TWR_ARM);
  for(const sd of [-1,1]){
    t.bevelBox(-0.85,1.35,sd*1.85,2.55,1.45,0.48,0.20,TWR_COAT);
    t.box(-0.85,2.82,sd*2.02,1.85,0.18,0.40,sd>0?TEAM_A:TWR_GLOW);
    coaCoilGun(t,1.15,1.95,sd*0.95,6.4,0.42,3,TWR_MACH);
  }
  t.bevelBox(-2.35,1.15,0,1.55,1.85,3.05,0.28,DARKER);
  coaCore(t,-2.35,3.25,0,0.62,false);
  return {hull:m.build(),tur:t.build(),s:0.86,turH:16.95};
}

/* 8 — TITAN. 16,000 hit points and size 46: this appears once in a match and
   it has to make everything beside it look small. Legs are the only geometry
   in this file painted SERVO, and everything below the hip is SERVO — mixing
   ordinary armour into a leg leaves those plates standing still while the foot
   walks away from them. The hip bridge sits at y=14 so the shader's y=11 hip
   line falls inside the thigh, which is what makes the knee lead the stride. */
function mdlCoaTitan(){
  const m=MB();
  for(const sd of [-1,1]){
    m.extrude(-1.0,0,sd*6.5,coaHex(5.0,2.9),1.9,SERVO);          // splayed hex foot
    m.box(3.4,0.35,sd*6.5,2.2,1.15,3.9,SERVO);                   // forward claw
    for(const tz of [-1.15,0,1.15])                              // toe wedges
      m.wedge(4.7,0.15,sd*6.5+tz,1.9,0.85,1.0,SERVO,0,true);
    m.box(-5.2,0.25,sd*6.5,1.3,0.95,3.6,SERVO);                  // heel spur
    m.cyl(-0.9,1.90,sd*6.5,1.70,1.42,1.05,8,SERVO,false);        // ankle bearing
    m.ring(-0.9,2.98,sd*6.5,1.35,1.85,10,SERVO);
    m.extrude(-0.4,2.95,sd*6.5,coaHex(2.5,2.3),5.9,SERVO);       // shin
    m.bevelBox(-0.3,4.10,sd*6.5,3.4,3.6,4.6,0.46,SERVO);
    armorPlate(m,-0.3,5.20,sd*8.95,4.4,2.6,0.50,0,SERVO,0);      // outboard shin greave
    coaRam(m,-2.20,3.05,sd*6.5,5.4,0.46,SERVO);
    coaRam(m, 1.15,3.15,sd*6.5,5.1,0.36,SERVO);
    m.cyl(0.35,8.85,sd*6.5,2.55,2.30,2.10,10,SERVO,false);       // knee drum
    m.ring(0.35,9.95,sd*6.5,2.35,2.95,10,SERVO);                 // knee cage
    m.bevelBox(0.25,9.75,sd*6.5,5.7,2.50,5.3,0.62,SERVO);
    m.extrude(-0.15,10.70,sd*6.5,coaHex(2.4,2.2),3.7,SERVO);     // thigh
    m.greeble(-0.15,12.90,sd*6.5,3.6,3.2,0.46,4,SERVO,0,sd>0?31:32);
    m.box(-1.40,11.20,sd*4.70,2.2,3.0,1.3,SERVO);                // hip brace
  }
  m.extrude(0,13.90,0,coaHex(7.4,7.6),4.30,TWR_ARM_D);           // hex pelvis
  m.extrude(0.15,18.20,0,coaHex(6.4,6.6),1.95,TEAM_A);
  for(const sd of [-1,1]){
    armorPlate(m,0.2,18.28,sd*6.10,8.4,1.5,0.56,0,TWR_ARM,0);    // hip skirt
    armorPlate(m,-3.4,15.30,sd*6.55,5.2,2.2,0.50,0,TWR_COAT,0);  // lower hip guard
    coaPylon(m,-4.6,16.10,sd*5.10,4.4,1.35,0,ENERGY);
    m.bevelBox(4.6,15.60,sd*4.30,3.0,2.4,2.6,0.44,TWR_COAT);     // forward hip blister
  }
  m.bevelBox(-4.6,15.90,0,4.4,3.1,10.2,0.70,DARKER);             // reactor bridge
  ventBank(m,-4.5,19.06,0,3.2,7.2,6,TWR_MACH,0);

  m.extrude(0,20.15,0,coaHex(6.6,6.4),6.10,TWR_ARM_D);           // torso
  m.extrude(0.35,26.25,0,coaHex(5.4,5.2),2.05,TEAM_A);
  m.wedge(4.90,22.60,0,4.1,4.0,9.6,TEAM_T,0,true);               // raked chest
  m.bevelBox(1.30,26.25,0,6.6,1.25,8.2,0.40,TWR_ARM);            // collar
  m.greeble(-0.60,28.32,0,5.4,6.2,0.62,7,TWR_MACH,0,41);         // deck hardware
  glowStrip(m,4.90,26.60,0,4.8,ENERGY,0);
  /* THE CHEST CORE. The whole faction hangs its reactor in open air; on the
     one unit big enough to carry it as a landmark, that core IS the head. */
  coaCore(m,3.10,29.30,0,2.55,true);
  /* CHIN BATTERY. A 16,000-hp walker that only shoots from its shoulders has a
     dead forward arc the eye reads as a blank chest. Two short throats under
     the glacis close it and put hardware where the camera looks first. */
  m.bevelBox(5.40,20.90,0,3.2,1.5,5.2,0.42,TWR_MACH);
  for(const cz of [-1.55,1.55]) coaCoilGun(m,6.20,21.55,cz,3.6,0.44,2,TWR_MACH);
  for(const sd of [-1,1]){
    m.bevelBox(0.60,22.40,sd*7.40,6.2,4.2,4.3,0.70,TWR_COAT);    // shoulder receiver
    armorPlate(m,0.60,26.60,sd*7.40,6.0,1.8,0.60,0,TWR_ARM,0);   // shoulder pauldron
    m.box(0.45,26.68,sd*7.40,5.3,0.40,3.4,TEAM_A);
    m.box(2.90,23.60,sd*7.40,3.5,2.1,2.4,DARKER);                // trunnion housing
    /* One very long coil lance per shoulder, ringed down its length. */
    coaCoilGun(m,4.50,24.50,sd*7.40,11.0,0.80,4,TWR_MACH);
    m.bevelBox(3.40,26.10,sd*7.40,2.6,1.0,1.9,0.28,TWR_TRIM);    // lance yoke
    m.extrude(-2.60,23.20,sd*7.40,coaTri(1.6),4.6,TWR_COAT);     // ammunition pylon
    m.box(-2.60,27.60,sd*7.40,0.9,0.9,0.9,TWR_GLOW);
    m.bevelBox(-2.70,21.10,sd*7.40,2.4,2.0,3.2,0.34,DARKER);     // feed housing
    m.box(-4.40,20.80,sd*5.90,2.0,4.6,1.05,DARK);                // torso grille
    for(let k=0;k<3;k++) m.box(-3.95,21.40+k*1.15,sd*6.45,1.4,0.34,0.30,TWR_TRIM);
    m.cyl(-5.10,22.90,sd*4.40,0.85,0.70,4.4,8,TWR_MACH,false);   // heat column
    m.ring(-5.10,27.36,sd*4.40,0.62,1.02,8,ENERGY);
  }
  m.bevelBox(-4.80,21.10,0,3.1,5.1,7.0,0.62,DARK);               // power stack
  coaPylon(m,-4.80,26.20,0,4.4,1.55,0,ENERGY);
  for(const sd of [-1,1]){
    coaPylon(m,-3.20,26.60,sd*2.90,3.2,1.10,0,ENERGY);
    m.wedge(-3.60,25.60,sd*4.20,4.2,0.9,1.4,TWR_ARM,sd*0.32,sd<0);  // swept dorsal vanes
  }
  return {hull:m.build(),tur:null,s:0.62};
}

/* ============================================================================
   DIRECT FIRE
   ============================================================================ */

/* 7 — HORNET. Rocket carrier at 175 range. Six genuinely open launch bores in
   a bedded frame on a turreted rack — a closed box would read as cargo. */
function mdlCoaRocket(){
  const m=MB();
  coaSkirt(m,6.3,3.3,0.44,1.6,3);
  m.extrude(0,2.50,0,coaHex(5.9,3.05),2.05,TWR_ARM_D);
  m.extrude(0.2,4.55,0,coaHex(4.6,2.40),0.58,TWR_ARM);
  m.wedge(4.4,4.55,0,3.0,1.05,4.0,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    armorPlate(m,0.2,2.50,sd*3.15,8.6,1.7,0.42,0,TWR_COAT,0);
    m.box(-0.4,5.19,sd*2.30,6.4,0.22,0.55,TEAM_A);
    m.bevelBox(-3.4,5.16,sd*1.95,2.4,1.25,1.35,0.28,TWR_COAT);   // reload cells
    m.box(-3.4,6.38,sd*1.95,1.8,0.20,0.50,ENERGY);
    coaPylon(m,-5.2,5.16,sd*1.55,2.6,0.98,0,ENERGY);
  }
  ventBank(m,-1.8,5.19,0,2.4,3.2,4,TWR_MACH,0);
  m.greeble(0.8,5.19,0,3.2,3.0,0.36,5,TWR_MACH,0,161);
  coaBadge(m,2.2,5.19,0,1.5,TEAM_T);
  coaThroat(m,-6.1,3.30,0,0.78,1.4);
  deckCrown(m,0,5.17,0,11.4,6.4,TWR_COAT,TEAM_T);
  const t=MB();
  t.cyl(-1.2,0,0,2.55,2.20,0.90,12,TWR_PAD);
  t.bevelBox(-0.9,0.90,0,3.2,2.0,5.2,0.42,TWR_COAT);
  for(const sd of [-1,1]){
    coaRam(t,-1.9,0.90,sd*2.10,2.1,0.28,TWR_MACH);
    t.box(-1.0,3.00,sd*2.62,3.4,0.22,0.42,sd>0?TEAM_A:TWR_GLOW);
  }
  t.box(-2.3,1.90,0,0.9,3.2,5.4,TWR_MACH);                       // frame backplate
  for(let row=0;row<2;row++) for(let col=0;col<3;col++){
    const y=2.30+row*1.50, z=-1.80+col*1.80;
    cylX(t,-0.6,y,z,4.20,0.66,0.60,8,TWR_MACH,false);
    ringX(t,3.45,y,z,0.64,0.90,8,row?TWR_GLOW:TWR_TRIM);
    tubeX(t,3.52,y,z,0.68,0.66,0.34,8,TWR_BORE);
  }
  t.bevelBox(-2.9,2.10,0,1.4,2.6,4.2,0.32,DARKER);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:5.10};
}

/* 6 — LONGBOW. 205-range beam, 110 hp, no turret — the hull yaws to aim.
   Shared mdlSynTank with the Goliath, so a precision gun and an assault
   walker were one hover diamond. This is a dedicated skiff: longer than the
   Vulture/Lancer beam yoke, lance fixed to the deck, no elevating cheeks,
   because a ground Longbow does not need to crane onto aircraft. */
function mdlCoaLongbow(){
  const m=MB();
  coaSkirt(m,7.15,2.15,0.40,1.40,3);
  m.extrude(0,2.15,0,coaHex(6.65,1.95),1.85,TWR_ARM_D);
  m.extrude(0.25,4.00,0,coaHex(5.15,1.55),0.52,TWR_ARM);
  m.wedge(5.05,4.00,0,3.35,0.95,2.55,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    m.box(-0.35,4.58,sd*1.42,7.15,0.20,0.42,TEAM_A);
    m.bevelBox(-4.15,4.54,sd*1.18,2.85,1.55,0.95,0.22,TWR_COAT);
    m.box(-4.15,6.12,sd*1.18,2.05,0.18,0.38,ENERGY);
    coaPylon(m,-5.85,4.54,sd*1.05,2.55,0.82,0,ENERGY);
    for(let k=0;k<4;k++) m.cyl(-1.85+k*1.35,4.56,sd*1.68,0.30,0.26,1.15,7,TWR_MACH,false);
  }
  coaBadge(m,1.85,4.58,0,1.25,TEAM_T);
  m.greeble(-1.15,4.56,0,2.85,1.65,0.28,4,TWR_MACH,0,181);
  coaThroat(m,-6.85,3.05,0,0.64,1.25);
  /* Fixed spinal lance. Four rings and a real bore; the last ring is the
     only live face so a 16-px hull still reads as a gun, not a barge. */
  m.bevelBox(1.15,4.55,0,3.55,1.15,1.35,0.26,TWR_COAT);
  coaCoilGun(m,2.05,5.15,0,11.4,0.48,4,TWR_MACH);
  m.box(2.85,6.22,0,2.15,0.20,0.85,ENERGY);
  coaCore(m,-2.55,5.55,0,0.72,false);
  return {hull:m.build(),tur:null,s:1.0};
}

/* 10 VULTURE / 22 LANCER. Both are standoff precision platforms on the same
   fragile chassis: 170 and 190 hit points, category `at`, reach traded for
   everything else. One builder, because the role is genuinely the same object
   — a narrow skiff whose entire top surface is a prism lance on an elevating
   yoke, held HIGH so it can track an aircraft or reach 230. The hull is the
   thinnest in the kit; that is the stat line showing. */
function mdlCoaBeam(){
  const m=MB();
  coaSkirt(m,6.2,2.4,0.40,1.35,3);
  m.extrude(0,2.10,0,coaHex(5.8,2.20),1.70,TWR_ARM_D);
  m.extrude(0.2,3.80,0,coaHex(4.5,1.75),0.50,TWR_ARM);
  m.wedge(4.4,3.80,0,3.0,0.90,2.9,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    m.box(-0.6,4.36,sd*1.58,6.0,0.20,0.46,TEAM_A);
    m.bevelBox(-3.6,4.32,sd*1.30,2.6,1.5,1.05,0.24,TWR_COAT);    // capacitor banks
    m.box(-3.6,5.86,sd*1.30,1.9,0.20,0.42,ENERGY);
    /* Open charge racks along the flanks. A precision platform is mostly
       capacitance, and exposing it is cheaper — and reads better — than
       wrapping the same volume in armour the stat line says is not there. */
    for(let k=0;k<3;k++) m.cyl(-1.6+k*1.5,4.34,sd*1.85,0.34,0.30,1.25,7,TWR_MACH,false);
    m.box(0.0,5.62,sd*1.85,4.0,0.20,0.42,ENERGY);
    m.bevelBox(1.9,4.32,sd*1.22,2.2,1.0,0.85,0.22,TWR_COAT);
  }
  coaBadge(m,1.6,4.36,0,1.30,TEAM_T);
  m.greeble(-1.4,4.34,0,2.6,1.9,0.30,4,TWR_MACH,0,171);
  coaThroat(m,-6.0,2.90,0,0.68,1.2);
  const t=MB();
  /* The yoke: two cheeks and a trunnion, so the lance visibly PIVOTS instead
     of being glued to a slab. */
  t.cyl(-0.6,0,0,2.20,1.90,0.75,12,TWR_PAD);
  t.extrude(-0.2,0.75,0,coaHex(2.6,1.75),1.60,TWR_ARM_D);
  for(const sd of [-1,1]){
    t.bevelBox(0.2,2.35,sd*1.55,2.6,2.6,0.55,0.22,TWR_ARM);      // yoke cheek
    t.box(0.2,4.86,sd*1.62,1.9,0.18,0.44,sd>0?TEAM_A:TWR_GLOW);
    coaRam(t,-1.8,1.10,sd*1.20,2.4,0.26,TWR_MACH);
  }
  t.cyl(0.2,3.30,0,0.95,0.88,1.10,8,TWR_MACH,false);             // trunnion
  /* PRISM LANCE. Long, thin, four rings, a real bore, and a lit prism block
     halfway along it — the emitter is not a barrel and should not look like
     a shell gun at any zoom. */
  coaCoilGun(t,1.0,3.85,0,9.2,0.46,4,TWR_MACH);
  t.bevelBox(2.6,3.35,0,2.2,1.0,1.0,0.24,TWR_COAT);
  t.box(2.6,4.36,0,1.7,0.22,0.90,ENERGY);
  t.bevelBox(-2.4,1.40,0,1.7,2.2,2.8,0.30,DARKER);
  coaCore(t,-2.4,4.10,0,0.80,false);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:4.30};
}

/* 26 — BASILISK. Tier-3 experimental, 1,100 hp at 260 mass. The detail budget
   has to run FORWARD here: a player paying four times a Rhino's price should
   not receive a Rhino with a bigger box on it. Twin heavy lances on a broad
   turret, a caged core behind them, and layered skirt armour. */
function mdlCoaExp(){
  const m=MB();
  coaSkirt(m,8.4,4.0,0.55,2.1,4);
  m.extrude(0,3.20,0,coaHex(7.9,3.85),2.80,TWR_ARM_D);
  m.extrude(0.2,6.00,0,coaHex(6.2,3.05),0.75,TWR_ARM);
  m.wedge(5.8,6.00,0,4.2,1.35,4.9,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    armorPlate(m,0.3,3.20,sd*4.05,10.6,2.1,0.55,0,TWR_COAT,0);
    armorPlate(m,0.3,5.35,sd*4.35,9.4,1.4,0.48,0,TWR_ARM,0);     // second skirt tier
    m.box(-0.4,6.78,sd*2.95,8.2,0.24,0.60,TEAM_A);
    m.bevelBox(3.2,6.76,sd*2.45,4.2,1.4,1.6,0.32,TWR_COAT);      // sponson blisters
    coaCoilGun(m,5.0,7.50,sd*2.45,3.0,0.30,2,TWR_MACH);          // sponson defensive coils
    coaPylon(m,-6.0,6.20,sd*2.05,3.4,1.15,0,ENERGY);
    m.bevelBox(-3.6,6.76,sd*2.25,2.6,1.3,1.5,0.30,TWR_COAT);     // charge cells
    m.box(-3.6,8.06,sd*2.25,2.0,0.20,0.52,ENERGY);
  }
  ventBank(m,-3.6,6.78,0,3.2,4.6,6,TWR_MACH,0);
  m.greeble(0.8,6.78,0,4.6,4.4,0.42,6,TWR_MACH,0,63);
  coaBadge(m,2.4,6.78,0,1.85,TEAM_T);
  coaThroat(m,-8.1,4.10,0,1.00,1.8);
  deckCrown(m,0,6.76,0,14.2,7.4,TWR_COAT,TEAM_T);
  const t=MB();
  t.cyl(-1.0,0,0,3.35,2.95,1.05,12,TWR_PAD);
  t.extrude(-0.4,1.05,0,coaHex(4.4,3.05),2.55,TWR_ARM_D);
  t.extrude(-0.3,3.60,0,coaHex(3.4,2.30),0.60,TEAM_T);
  t.wedge(3.4,3.60,0,2.4,0.85,3.2,TWR_ARM,0,true);               // turret brow
  for(const sd of [-1,1]){
    t.bevelBox(-1.6,1.40,sd*2.95,4.4,2.0,0.58,0.24,TWR_COAT);
    t.box(-1.6,3.42,sd*3.26,3.0,0.22,0.50,sd>0?TEAM_A:TWR_GLOW);
    coaRam(t,-2.2,0.60,sd*2.15,2.6,0.32,TWR_MACH);
    coaCoilGun(t,2.4,2.60,sd*1.35,8.6,0.62,4,TWR_MACH);          // twin heavy lances
    t.box(1.8,1.80,sd*1.35,2.2,1.6,1.6,DARKER);                  // mantlet block
    t.bevelBox(0.4,3.35,sd*1.85,2.6,0.9,1.1,0.24,TWR_TRIM);      // lance yoke
    t.cyl(-2.8,1.40,sd*1.55,0.72,0.62,2.6,8,TWR_MACH,false);     // capacitor column
    t.ring(-2.8,4.06,sd*1.55,0.56,0.92,8,ENERGY);
  }
  t.bevelBox(-3.8,1.60,0,2.2,2.8,4.6,0.38,DARKER);
  coaCore(t,-3.8,4.90,0,1.35,true);
  return {hull:m.build(),tur:t.build(),s:1.05,turH:6.75};
}

/* ============================================================================
   AREA AND CLOSE SUPPORT
   ============================================================================ */

/* 20 REAPER / 21 CINDER. Both are area casters on a light hover chassis —
   aoe 52 and aoe 46, ranges 120 and 96. Shared builder, because the role and
   the weight class really are the same: a splayed FAN of short throats on a
   raised bed, which is the shape that says "this covers ground" rather than
   "this hits a point". */
function mdlCoaCaster(){
  const m=MB();
  coaSkirt(m,6.0,3.5,0.44,1.55,3);
  m.extrude(0,2.45,0,coaHex(5.7,3.30),1.95,TWR_ARM_D);
  m.extrude(0,4.40,0,coaHex(4.5,2.60),0.60,TWR_ARM);
  m.wedge(4.2,4.40,0,2.8,1.00,4.2,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    m.box(-0.6,5.06,sd*2.45,6.2,0.22,0.55,TEAM_A);
    m.bevelBox(-3.6,5.02,sd*2.05,2.4,1.5,1.4,0.30,TWR_COAT);     // charge cells
    m.box(-3.6,6.54,sd*2.05,1.8,0.20,0.60,ENERGY);
    coaPylon(m,-5.1,5.02,sd*1.35,2.4,0.92,0,ENERGY);
  }
  /* THE FAN. Five short throats splayed across the bed on one shared cradle.
     Each is bedded into a real backplate; nothing floats. */
  m.bevelBox(1.4,5.00,0,4.6,1.30,6.4,0.40,TWR_MACH);
  m.box(-1.2,5.00,0,0.9,2.6,6.0,TWR_COAT);
  for(let k=0;k<5;k++){
    const a=(k-2)*0.30, z=Math.sin(a)*3.0, y=6.20+Math.cos(a)*0.55;
    cylX(m,0.4,y,z,3.0,0.52,0.46,8,TWR_MACH,false);
    ringX(m,3.1,y,z,0.54,0.80,8,TWR_GLOW);
    tubeX(m,3.18,y,z,0.56,0.54,0.28,8,TWR_BORE);
  }
  ventBank(m,-2.4,5.06,0,2.2,3.0,4,TWR_MACH,0);
  coaBadge(m,3.6,5.06,0,1.35,TEAM_T);
  coaCore(m,-4.4,6.30,0,1.05,false);
  coaThroat(m,-5.9,3.40,0,0.78,1.4);
  return {hull:m.build(),tur:null,s:1.0};
}

/* 18 — SCORCHER. 640 hp on a flame chassis: this is the ARMOURED one, and it
   gets there by wearing its plating rather than by being large. Twin plasma
   reservoirs sit on the flanks with a shroud over them and one wide projector
   throat on a short turret. */
function mdlCoaFlamer(){
  const m=MB();
  coaSkirt(m,7.4,3.8,0.50,1.85,4);
  m.extrude(0,2.80,0,coaHex(7.0,3.55),2.35,TWR_ARM_D);
  m.extrude(0,5.15,0,coaHex(5.5,2.80),0.65,TWR_ARM);
  m.wedge(5.0,5.15,0,3.6,1.30,4.6,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    armorPlate(m,0.2,2.80,sd*3.75,9.8,2.0,0.50,0,TWR_COAT,0);
    /* Plasma reservoir: a drum with bands and a shroud plate over the top, so
       it reads as pressurised rather than as a pipe. */
    m.cyl(-3.4,5.20,sd*2.35,1.55,1.42,3.6,9,TWR_MACH,false);
    m.ring(-3.4,6.20,sd*2.35,1.50,1.80,10,TWR_TRIM);
    m.ring(-3.4,7.85,sd*2.35,1.42,1.72,10,TWR_GLOW);
    m.box(-0.4,5.80,sd*2.90,7.0,0.24,0.58,TEAM_A);
    coaPylon(m,-5.8,5.25,sd*1.55,2.6,1.00,0,ENERGY);
  }
  m.bevelBox(-3.4,8.70,0,5.0,0.60,6.0,0.34,TWR_COAT);            // shroud over the drums
  /* PLUMBING. The drums have to be connected to the projector or they are two
     barrels somebody left on the deck; the feed runs forward along each flank
     and into the turret ring. */
  for(const sd of [-1,1]){
    m.box(-0.6,6.40,sd*2.35,4.6,0.34,0.34,TWR_TRIM);             // feed line
    m.box(2.0,6.24,sd*1.65,2.4,0.32,0.32,TWR_TRIM,sd*0.42);      // turn into the ring
    m.box(-1.6,6.05,sd*2.35,0.60,0.60,0.60,TWR_MACH);            // inline pump
    m.cyl(-1.6,6.68,sd*2.35,0.34,0.26,0.42,7,ENERGY,false);
  }
  ventBank(m,-1.2,5.80,0,2.6,3.6,4,TWR_MACH,0);
  m.greeble(1.0,5.80,0,3.2,3.0,0.38,5,TWR_MACH,0,111);
  coaBadge(m,2.6,5.80,0,1.60,TEAM_T);
  coaThroat(m,-7.2,3.60,0,0.88,1.6);
  deckCrown(m,0,5.78,0,12.6,7.2,TWR_COAT,TEAM_T);
  const t=MB();
  t.cyl(-0.6,0,0,2.85,2.50,0.85,12,TWR_PAD);
  t.extrude(-0.2,0.85,0,coaHex(3.5,2.55),2.10,TWR_ARM_D);
  t.extrude(-0.2,2.95,0,coaHex(2.7,1.95),0.52,TEAM_T);
  for(const sd of [-1,1]){
    t.bevelBox(-1.4,1.15,sd*2.45,3.4,1.6,0.52,0.22,TWR_COAT);
    t.box(-1.4,2.80,sd*2.72,2.4,0.20,0.44,sd>0?TEAM_A:HOT);
    coaRam(t,-1.9,0.55,sd*1.75,2.2,0.28,TWR_MACH);
  }
  /* One very wide projector, short and open — a flame weapon is a mouth. */
  cylX(t,1.4,2.55,0,3.4,1.02,1.28,10,TWR_MACH,false);
  ringX(t,3.0,2.55,0,1.20,1.66,10,TWR_TRIM);
  tubeX(t,4.55,2.55,0,1.55,1.42,0.74,12,TWR_BORE);
  t.sphere(5.4,2.55,0,0.46,6,HOT,1,false);
  t.wedge(3.2,3.60,0,2.0,0.60,2.6,TWR_COAT,0,true);              // heat shroud
  t.bevelBox(-2.6,1.10,0,1.7,2.3,3.6,0.34,DARKER);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:5.80};
}

/* 23 — RESONATOR. A sonic hull: the weapon is the BODY, so the chassis is a
   ribbed drum instead of a hex, and it is the only round thing in the kit —
   which is exactly why it is identifiable in one glance from above. */
function mdlCoaSonic(){
  const m=MB();
  coaSkirt(m,5.8,3.6,0.42,1.5,3);
  m.cyl(0,2.30,0,4.55,4.25,2.05,14,TWR_ARM_D,false);
  m.cyl(0,2.30,0,4.55,4.55,0.30,14,TWR_COAT,false);              // lower rim
  m.cyl(0,4.35,0,4.25,3.85,0.60,14,TWR_ARM);                     // chamfered crown
  m.cyl(0,4.95,0,3.45,3.45,0.28,14,TWR_COAT);                    // recessed deck
  /* Radial ribs. Eight spokes are what turn a smooth cylinder into a
     fabricated housing, and from overhead they are the whole read. */
  for(let k=0;k<8;k++){
    const a=k/8*TAU;
    m.box(Math.cos(a)*2.95,4.96,Math.sin(a)*2.95,2.5,0.32,0.50,k%2?TWR_TRIM:TWR_ARM,a);
  }
  /* EMITTER STACK — three rings widening downward on a short column, so the
     shape reads as a horn projecting up, not as a turret. */
  m.cyl(1.0,5.20,0,2.05,1.60,1.05,12,TWR_MACH,false);
  for(let k=0;k<3;k++) m.ring(1.0,6.28+k*0.50,0,1.80-k*0.42,2.35-k*0.42,12,k?ENERGY:TWR_TRIM);
  m.cyl(1.0,7.80,0,0.85,0.46,0.66,10,TWR_GLOW);                  // lit emitter tip
  for(const sd of [-1,1]){
    m.bevelBox(-3.1,5.05,sd*1.85,2.4,1.4,1.25,0.28,TWR_COAT);
    m.box(-3.1,6.46,sd*1.60,2.2,0.20,0.42,ENERGY);
    coaPylon(m,-4.6,5.05,sd*1.05,2.2,0.90,0,ENERGY);
    m.box(0.4,5.02,sd*3.55,5.2,0.22,0.52,TEAM_A);
    /* Tuned side horns. A sonic hull broadcasts sideways as well as forward,
       and the pair of them is what stops the drum reading as a fuel tank. */
    m.cyl(2.2,3.60,sd*3.95,0.72,0.92,1.10,8,TWR_MACH,false);
    m.ring(2.2,4.72,sd*3.95,0.86,1.22,8,ENERGY);
    m.bevelBox(2.2,2.95,sd*3.95,1.7,0.70,1.7,0.28,TWR_COAT);
  }
  coaBadge(m,-1.6,4.98,0,1.30,TEAM_T);
  m.greeble(-0.4,4.98,0,2.6,2.6,0.32,5,TWR_MACH,0,141);
  coaThroat(m,-5.4,3.20,0,0.72,1.3);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ============================================================================
   NAVAL
   ============================================================================ */

/* 14 — CORVETTE. A light warship, and still a Coalition hull: it rides on a
   plenum rather than displacing water, so the profile is a low skimmer with a
   spray chine instead of a bow wave, and a single coil turret amidships. */
function mdlCoaSkimmer(){
  const m=MB();
  const keel=[[-8.0,-2.30],[-6.4,-3.30],[3.6,-3.60],[7.4,-2.10],[8.6,0],
              [7.4,2.10],[3.6,3.60],[-6.4,3.30],[-8.0,2.30]];
  m.extrude(0,0.35,0,keel,1.55,TWR_COAT);                        // plenum
  m.extrude(0,1.90,0,keel.map(p=>[p[0]*0.94,p[1]*0.88]),1.70,TWR_ARM_D);
  m.extrude(0.2,3.60,0,keel.map(p=>[p[0]*0.80,p[1]*0.66]),0.55,TWR_ARM);
  m.wedge(6.2,3.60,0,3.2,1.00,3.4,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    m.wedge(-0.6,1.55,sd*3.55,12.4,0.55,1.5,TWR_COAT,sd*0.10,sd<0);  // spray chine
    for(const x of [-4.6,-0.6,3.4]){
      m.cyl(x,0.10,sd*2.85,0.66,0.56,0.62,8,TWR_MACH,false);
      m.ring(x,0.78,sd*2.85,0.54,0.90,8,ENERGY);
    }
    m.box(0.2,4.20,sd*2.15,8.2,0.22,0.52,TEAM_A);
    coaPylon(m,-5.8,4.15,sd*1.45,2.8,0.95,0,ENERGY);
  }
  m.bevelBox(-2.2,4.15,0,4.6,1.9,3.8,0.44,TWR_ARM_D);            // sensor island
  m.extrude(-2.2,6.05,0,coaHex(1.6,1.4),0.36,TEAM_T);
  coaCore(m,-2.2,6.90,0,1.15,true);
  /* Countermeasure cells forward — sealed, lit, and deliberately NOT bores:
     the corvette has one weapon and it is on the turret. */
  for(const sd of [-1,1]) for(let k=0;k<3;k++){
    m.bevelBox(4.0+k*1.15,4.18,sd*1.15,0.95,0.55,0.80,0.18,TWR_COAT);
    m.box(4.0+k*1.15,4.74,sd*1.15,0.62,0.16,0.52,ENERGY);
  }
  coaBadge(m,3.0,4.16,0,1.45,TEAM_T);
  m.greeble(0.6,4.18,0,3.6,3.2,0.36,5,TWR_MACH,0,131);
  ventBank(m,-4.6,4.18,0,2.2,3.0,4,TWR_MACH,0);
  for(const sd of [-1,1]) coaThroat(m,-8.2,1.85,sd*1.60,0.82,1.5);
  const t=MB();
  t.cyl(-0.5,0,0,2.15,1.85,0.72,12,TWR_PAD);
  t.extrude(-0.1,0.72,0,coaHex(2.7,1.85),1.60,TWR_ARM_D);
  t.extrude(-0.1,2.32,0,coaHex(2.1,1.40),0.44,TEAM_T);
  for(const sd of [-1,1]){
    t.bevelBox(-1.0,1.00,sd*1.75,2.6,1.3,0.46,0.20,TWR_COAT);
    t.box(-1.0,2.32,sd*1.96,1.9,0.18,0.40,sd>0?TEAM_A:TWR_GLOW);
  }
  coaCoilGun(t,1.4,2.05,0,5.4,0.48,3,TWR_MACH);
  t.bevelBox(-2.0,0.95,0,1.4,1.8,2.4,0.28,DARKER);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:4.20};
}

/* 15 — DREADNOUGHT. 1,300 hp and 290 range: the capital ship. It reads as
   capital by LENGTH and by a spinal accelerator running most of the deck —
   three lift banks a side, a caged core amidships, and a heavy twin turret
   forward. */
function mdlCoaCapital(){
  const m=MB();
  const keel=[[-13.4,-4.10],[-11.4,-5.30],[6.0,-5.80],[11.8,-3.50],[13.6,0],
              [11.8,3.50],[6.0,5.80],[-11.4,5.30],[-13.4,4.10]];
  m.extrude(0,0.45,0,keel,2.20,TWR_COAT);
  m.extrude(0,2.65,0,keel.map(p=>[p[0]*0.95,p[1]*0.88]),2.35,TWR_ARM_D);
  m.extrude(0.3,5.00,0,keel.map(p=>[p[0]*0.82,p[1]*0.66]),0.72,TWR_ARM);
  m.wedge(9.6,5.00,0,4.6,1.40,5.2,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    m.wedge(-0.8,2.25,sd*5.55,21.0,0.70,1.9,TWR_COAT,sd*0.08,sd<0);
    for(const x of [-8.4,-3.6,1.2,6.0]){
      m.cyl(x,0.15,sd*4.55,0.90,0.76,0.86,8,TWR_MACH,false);
      m.ring(x,1.06,sd*4.55,0.74,1.22,8,ENERGY);
    }
    m.box(0.2,5.78,sd*3.65,14.6,0.26,0.66,TEAM_A);
    coaPylon(m,-9.0,5.72,sd*2.75,4.2,1.30,0,ENERGY);
    m.bevelBox(3.2,5.75,sd*3.05,5.0,1.3,1.5,0.30,TWR_COAT);      // secondary casemates
    coaCoilGun(m,5.0,6.55,sd*3.05,3.4,0.34,2,TWR_MACH);
    m.bevelBox(-2.6,5.75,sd*3.55,4.4,1.2,1.4,0.28,TWR_COAT);     // magazine cells
    m.box(-2.6,6.90,sd*3.55,3.4,0.20,0.52,ENERGY);
    m.cyl(-11.2,5.75,sd*2.20,0.80,0.68,3.2,8,TWR_MACH,false);    // heat columns
    m.ring(-11.2,8.98,sd*2.20,0.60,1.00,8,ENERGY);
    armorPlate(m,0.4,2.65,sd*5.10,17.0,2.0,0.52,0,TWR_COAT,0);   // armour belt
    coaThroat(m,-13.6,2.70,sd*2.60,1.05,1.9);
  }
  /* SPINAL ACCELERATOR. Not a gun — an open rail down the deck with ring
     stations on it, which is what a capital hull is FOR in this faction. */
  m.bevelBox(-3.4,5.72,0,11.4,1.35,4.2,0.42,TWR_MACH);
  for(let k=0;k<4;k++) ringX(m,-8.0+k*3.2,7.60,0,1.05,1.60,10,k===3?TWR_GLOW:TWR_TRIM);
  m.box(-3.4,7.05,0,11.0,1.15,0.90,TWR_COAT);
  m.bevelBox(-8.8,7.07,0,3.6,2.1,5.4,0.50,TWR_ARM_D);            // sensor island
  m.extrude(-8.8,9.17,0,coaHex(2.1,1.9),0.42,TEAM_T);
  coaCore(m,-8.8,10.30,0,1.75,true);
  ventBank(m,-6.0,5.80,0,3.4,5.6,6,TWR_MACH,0);
  m.greeble(2.2,5.80,0,5.6,5.4,0.44,7,TWR_MACH,0,83);
  coaBadge(m,6.4,5.80,0,2.05,TEAM_T);
  const t=MB();
  t.cyl(-0.9,0,0,3.20,2.80,1.00,12,TWR_PAD);
  t.extrude(-0.3,1.00,0,coaHex(4.1,2.90),2.40,TWR_ARM_D);
  t.extrude(-0.3,3.40,0,coaHex(3.2,2.20),0.55,TEAM_T);
  for(const sd of [-1,1]){
    t.bevelBox(-1.6,1.30,sd*2.80,4.0,1.9,0.55,0.24,TWR_COAT);
    t.box(-1.6,3.22,sd*3.10,2.8,0.20,0.48,sd>0?TEAM_A:TWR_GLOW);
    coaCoilGun(t,2.0,2.50,sd*1.25,8.0,0.58,4,TWR_MACH);
    coaRam(t,-2.2,0.60,sd*2.00,2.4,0.30,TWR_MACH);
  }
  t.box(1.5,1.70,0,2.0,1.7,3.6,DARKER);
  t.bevelBox(-3.4,1.50,0,2.0,2.5,4.2,0.34,DARKER);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:5.75};
}

/* ============================================================================
   UNARMED
   Bulwark, Constructor, Warden and Prospector carry equipment where every
   other chassis carries a weapon. Not one of them has a barrel, a bore or an
   accelerator ring: giving an unarmed unit a gun is a lie the player will act
   on, and they will act on it while it is being shot at.
   ============================================================================ */

/* 11 — BULWARK. Mobile shield generator, 950 hp, dmg 0. The equipment is a
   projector: four pylons standing off a heavy skirt with a caged core hanging
   between them and a field ring across the top. Nothing points forward. */
function mdlCoaShield(){
  const m=MB();
  coaSkirt(m,7.4,4.4,0.52,2.0,4);
  m.extrude(0,3.00,0,coaHex(6.9,4.15),2.40,TWR_ARM_D);
  m.extrude(0,5.40,0,coaHex(5.4,3.30),0.70,TWR_ARM);
  m.wedge(4.9,5.40,0,3.0,1.10,5.0,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    armorPlate(m,0.2,3.00,sd*4.35,9.4,1.9,0.48,0,TWR_COAT,0);
    m.box(-0.4,6.12,sd*3.05,7.6,0.24,0.60,TEAM_A);
    for(const fx of [2.6,-2.6]) coaPylon(m,fx,6.10,sd*2.55,4.6,1.20,0,ENERGY);
  }
  /* THE FIELD. A core suspended above the deck inside a horizontal ring, with
     a second wider ring floating over it — a projector, unmistakably, and it
     is the tallest thing on the vehicle. */
  coaCore(m,0,10.20,0,2.35,true);
  m.ring(0,11.30,0,3.60,4.55,16,ENERGY);
  m.ring(0,9.10,0,3.10,3.95,16,TWR_TRIM);
  /* Field conduits climbing each pylon into the core, so the projector is one
     connected machine rather than a ball floating over a slab. */
  for(const sd of [-1,1]) for(const fx of [2.6,-2.6]){
    m.box(fx*0.55,9.60,sd*1.35,3.4,0.28,0.30,ENERGY,0);
    m.box(fx,9.00,sd*1.95,0.42,1.30,0.42,TWR_TRIM);
  }
  ventBank(m,-3.6,6.12,0,2.8,4.0,5,TWR_MACH,0);
  m.greeble(0.6,6.12,0,4.2,4.4,0.42,6,TWR_MACH,0,181);
  m.bevelBox(-5.0,6.10,0,2.4,1.7,4.8,0.36,DARKER);               // field regulator
  m.box(-5.0,7.78,0,1.8,0.22,3.6,ENERGY);
  coaBadge(m,2.6,6.12,0,1.70,TEAM_T);
  coaThroat(m,-7.2,3.90,0,0.90,1.6);
  deckCrown(m,0,6.10,0,12.6,8.4,TWR_COAT,TEAM_T);
  return {hull:m.build(),tur:null,s:1.0};
}

/* 19 — CONSTRUCTOR. An assembler rig. The equipment is a FABRICATOR ARRAY:
   three stubby articulated arms on a shared turntable, each ending in a lit
   nozzle head, plus a stock rack of feedstock cells behind them. Short, blunt
   and multiple — the opposite of a barrel, which is one long thing. */
function mdlCoaBuilder(){
  const m=MB();
  coaSkirt(m,4.9,2.8,0.38,1.30,3);
  m.extrude(0,2.05,0,coaHex(4.6,2.65),1.55,TWR_ARM_D);
  m.extrude(0,3.60,0,coaHex(3.5,2.00),0.48,TWR_ARM);
  m.wedge(3.3,3.60,0,2.2,0.80,3.0,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    m.box(-0.6,4.14,sd*1.85,4.6,0.20,0.46,TEAM_A);
    m.bevelBox(-2.6,4.10,sd*1.40,2.2,1.1,1.15,0.24,TWR_COAT);    // feedstock cells
    m.box(-2.6,5.22,sd*1.40,1.6,0.18,0.44,ENERGY);
  }
  /* FABRICATOR ARRAY. Turntable, then three arms fanned across the front, each
     an upper link, a stepped forearm and a nozzle head. */
  m.cyl(1.5,4.08,0,1.35,1.15,0.55,10,TWR_MACH,false);
  for(let k=0;k<3;k++){
    const a=(k-1)*0.42, z=Math.sin(a)*1.35;
    m.box(2.2,4.62,z,2.0,0.55,0.55,TWR_ARM,a*0.5);
    m.box(3.5,4.10,z*1.7,1.7,0.44,0.44,TWR_TRIM,a*0.5);
    m.bevelBox(4.5,3.55,z*2.1,0.9,0.75,0.80,0.20,TWR_COAT);
    m.cyl(4.5,3.28,z*2.1,0.44,0.24,0.34,8,ENERGY,false);         // nozzle head
  }
  coaBadge(m,-0.4,4.12,0,1.15,TEAM_T);
  coaPylon(m,-3.9,4.10,0,2.2,0.95,0,ENERGY);
  coaThroat(m,-4.7,2.70,0,0.62,1.1);
  return {hull:m.build(),tur:null,s:1.0};
}

/* 24 — WARDEN. Service and repair. The equipment is a BOOM: a shoulder, an
   upper arm that reaches forward and DOWN over whatever is being worked on,
   and a head carrying three tool nozzles. A boom that points down is the one
   shape nobody mistakes for a weapon. */
function mdlCoaService(){
  const m=MB();
  coaSkirt(m,5.4,3.1,0.40,1.40,3);
  m.extrude(0,2.20,0,coaHex(5.0,2.90),1.75,TWR_ARM_D);
  m.extrude(0,3.95,0,coaHex(3.9,2.20),0.52,TWR_ARM);
  m.wedge(3.6,3.95,0,2.4,0.85,3.2,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    m.box(-0.6,4.53,sd*2.00,5.0,0.20,0.48,TEAM_A);
    m.bevelBox(-3.0,4.50,sd*1.55,2.2,1.3,1.25,0.26,TWR_COAT);    // consumable drums
    m.box(-3.0,5.82,sd*1.55,1.7,0.18,0.46,ENERGY);
    coaPylon(m,-4.4,4.50,sd*1.00,2.1,0.88,0,ENERGY);
  }
  /* SERVICE BOOM. Shoulder yoke, one long link angled up, one dropping down,
     and a head with three nozzles on it pointed at the ground. */
  m.bevelBox(1.4,4.50,0,1.9,1.5,2.2,0.32,TWR_MACH);
  m.cyl(1.4,6.00,0,0.60,0.52,0.46,8,TWR_TRIM,false);
  m.box(2.8,6.35,0,3.2,0.62,0.62,TWR_ARM,0.30);
  m.box(4.6,5.35,0,0.58,2.0,0.58,TWR_TRIM);
  m.bevelBox(4.6,4.25,0,1.5,0.85,1.9,0.26,TWR_COAT);             // tool head
  for(const z of [-0.62,0,0.62]) m.cyl(4.6,3.95,z,0.30,0.16,0.32,7,ENERGY,false);
  coaRam(m,2.1,4.80,0,2.3,0.26,TWR_MACH);
  coaBadge(m,-1.2,4.52,0,1.20,TEAM_T);
  coaThroat(m,-5.2,3.00,0,0.66,1.2);
  return {hull:m.build(),tur:null,s:0.95};
}

/* 32 — PROSPECTOR. A mobile ore miner. Two pieces of equipment, both of which
   have to be visible from the battle camera for the economy to read: a mining
   HEAD slung under the nose with a focusing ring pointed at the ground, and an
   ore CELL on the back that is transparently a container. */
function mdlCoaMiner(){
  const m=MB();
  coaSkirt(m,5.6,3.0,0.40,1.45,3);
  m.extrude(0,2.25,0,coaHex(5.2,2.80),1.70,TWR_ARM_D);
  m.extrude(0,3.95,0,coaHex(4.0,2.15),0.50,TWR_ARM);
  m.wedge(3.8,3.95,0,2.4,0.85,3.0,TWR_ARM,0,true);
  for(const sd of [-1,1]){
    m.box(-0.8,4.51,sd*1.95,4.8,0.20,0.48,TEAM_A);
    coaPylon(m,-4.6,4.48,sd*1.30,2.3,0.92,0,ENERGY);
  }
  /* ORE CELL. A hexagonal hopper with a lit fill window down each flank and a
     lit rim on top — the one part of the machine that visibly holds something,
     and the rim is what carries that read to the overhead camera. */
  m.extrude(-2.6,4.45,0,coaHex(2.15,1.85),2.30,TWR_COAT);
  m.extrude(-2.6,6.75,0,coaHex(1.70,1.45),0.34,TWR_TRIM);
  m.ring(-2.6,6.82,0,1.75,2.20,10,ENERGY);
  for(const sd of [-1,1]) m.box(-2.6,5.05,sd*1.60,2.6,1.30,0.24,ENERGY);
  /* MINING HEAD. Slung on a short boom that reaches PAST the nose, with the
     focusing ring facing the GROUND. Tucked under the hull it was invisible
     from the only camera this game has, which makes the economic action the
     player is meant to read unreadable. */
  m.box(4.6,3.55,0,2.6,0.60,1.10,TWR_MACH);                      // boom
  m.bevelBox(6.2,2.95,0,2.3,1.05,2.2,0.32,TWR_ARM);              // head housing
  m.cyl(6.2,2.35,0,1.05,0.78,0.66,10,TWR_MACH,false);
  m.ring(6.2,2.32,0,0.80,1.30,10,ENERGY);                        // focusing ring
  m.sphere(6.2,2.52,0,0.58,6,TWR_GLOW,0.8,false);
  coaRam(m,4.4,4.10,0,1.6,0.24,TWR_MACH);
  coaBadge(m,0.6,4.50,0,1.25,TEAM_T);
  coaThroat(m,-5.4,3.05,0,0.68,1.2);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ---------------------------------------------------------------------------
   COALITION MATERIAL CONVERSION
   ---------------------------------------------------------------------------
   The Coalition is not green-painted steel. Nano-ceramic armor, gold field
   hardware, dark holographic housings and cyan conductors are rebound after
   construction so old helper calls participate in the same material grammar
   as the newer hover chassis. SERVO remains untouched because it is the TITAN
   gait channel, not a visual material choice. */
const COA_SYN_MAT=Object.freeze({
  [MAT.PLATE]:MAT.SYN_NANO,
  [MAT.GREEBLE]:MAT.SYN_HOLO,
  [MAT.TREAD]:MAT.SYN_HOLO,
  [MAT.GLASS]:MAT.SYN_HOLO,
  [MAT.TWR_ARMOR]:MAT.SYN_NANO,
  [MAT.TWR_MACH]:MAT.SYN_GOLD,
  [MAT.TWR_COAT]:MAT.SYN_HOLO,
  [MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
  [MAT.TWR_PAD]:MAT.SYN_HOLO
});
/* Stage S1 bespoke semantic packs. The Coalition's shared V2 route already
   gives every unit nano-ceramic, holographic machinery and cyan conductors.
   These slot contracts reserve the role-specific landmarks that their later
   BaseAO/NRE/mask bakes must preserve. `maps:null` is intentional: this is a
   truthful semantic-bake stage, never a claim that a UV-authored texture set
   exists. SERVO is deliberately absent: it is the vertex gait channel, not a
   surface material, so rebinding it would detach animated walker legs. */
const COA_SYN_BESPOKE_PACKS=Object.freeze({
  0:Object.freeze({
    id:'syndicate-strider-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({[MAT.TRIM]:MAT.SYN_NANO})
  }),
  1:Object.freeze({
    id:'syndicate-rhino-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_PAD]:MAT.SYN_HOLO,
      /* The Syndicate buys its hulls rather than forging them, so the plating is
         the one place that reads as bolted-on aftermarket rather than issued.
         (This slot previously mapped TWR_BORE to itself — a no-op that looked
         like an authored decision, which is why the contract gate flags them.) */
      [MAT.PLATE]:MAT.ARMR_RIB
    })
  }),
  2:Object.freeze({
    id:'syndicate-goliath-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.SYN_NANO,
      [MAT.TWR_GLOW]:MAT.SYN_CONDUIT
    })
  }),
  3:Object.freeze({
    id:'syndicate-oracle-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.SYN_HOLO,
      [MAT.TWR_GLOW]:MAT.CHARGE_STRIP
    })
  }),
  5:Object.freeze({
    id:'syndicate-drone-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* The optic and the two cheek-pod muzzles are the only hardware on a
         30-mass airframe, and the faction default lit them with the same
         conduit as the lift rings hanging under the plate. */
      [MAT.TWR_GLOW]:MAT.WEAPON_GLOW
    })
  }),
  6:Object.freeze({
    id:'syndicate-lance-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.SYN_NANO,
      [MAT.TWR_GLOW]:MAT.CHARGE_STRIP
    })
  }),
  7:Object.freeze({
    id:'syndicate-rocket-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.SYN_HOLO,
      [MAT.TWR_GLOW]:MAT.SYN_CONDUIT
    })
  }),
  8:Object.freeze({
    id:'syndicate-titan-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.SYN_NANO,
      [MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_GLOW]:MAT.SYN_CONDUIT
    })
  }),
  9:Object.freeze({
    id:'syndicate-incinerator-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* HOT lands on MAT.LAMP, which the faction remap never touches, so the
         plasma core and the projector tip were wearing a cabin light. */
      [MAT.LAMP]:MAT.PLASMA_JET,
      [MAT.TRIM]:MAT.SYN_GOLD                                  // containment ring, bells
    })
  }),
  10:Object.freeze({
    id:'syndicate-beam-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* The Vulture is open charge racks with a lance on top, so its live
         accelerator ring and core read as stored charge rather than as one
         more lift conduit -- which is what the faction default made them. */
      [MAT.TWR_GLOW]:MAT.CHARGE_STRIP,
      [MAT.TRIM]:MAT.SYN_HOLO
    })
  }),
  11:Object.freeze({
    id:'syndicate-shield-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* Dmg 0. TWR_GLOW on this hull is exactly one thing -- the suspended
         projector core -- and it must not read as a muzzle. */
      [MAT.TWR_GLOW]:MAT.CHARGE_STRIP,
      [MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  14:Object.freeze({
    id:'syndicate-skimmer-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* Sensor-island cap, deck badge and turret cap. On a hull this low they
         are the whole of what a near-overhead camera sees, and they were the
         one lane the faction remap left as generic grey trim. */
      [MAT.TRIM]:MAT.SYN_GOLD
    })
  }),
  15:Object.freeze({
    id:'syndicate-capital-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* The live station on the spinal rail and the amidships core carry most
         of this, and the four coil-gun muzzle rings ride along with them --
         TWR_GLOW is one lane, so a capital hull cannot light its rail without
         lighting its guns. That is the right trade here: this hull exists FOR
         the accelerator, so the thing that charges sets the tone. */
      [MAT.TWR_GLOW]:MAT.CHARGE_STRIP,
      [MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  16:Object.freeze({
    id:'syndicate-siege-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* Deployed outrigger feet and the turret race. These are the only
         ground-bearing surfaces on a hover carriage, and painting them the
         same holo as the skirt is what made the Bombard look like it was
         still floating on the one frame where it plants itself. */
      [MAT.TWR_PAD]:MAT.FOUNDATION_PAD,
      [MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  17:Object.freeze({
    id:'syndicate-gunship-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* At 52 range the chin bank IS the unit. TWR_COAT on this airframe is
         only the vanes, cheeks, flank belts and blast shroud -- no skirt --
         so ribbing it armours the Raptor without touching anything else. */
      [MAT.TWR_GLOW]:MAT.WEAPON_GLOW,
      [MAT.TWR_COAT]:MAT.ARMR_RIB
    })
  }),
  18:Object.freeze({
    id:'syndicate-flamer-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* The wide projector mouth. HOT resolves to MAT.LAMP and the faction
         remap has no entry for it, so the Scorcher's one hot surface was a
         warm cabin light sitting inside a plasma throat. */
      [MAT.LAMP]:MAT.PLASMA_JET,
      [MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  19:Object.freeze({
    id:'syndicate-builder-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* Unarmed, and already the highest conduit share in the kit from the
         nozzle heads and feedstock cells. One override: the badge takes the
         faction's field-hardware gold so the rig reads as plant, not gun. */
      [MAT.TRIM]:MAT.SYN_GOLD
    })
  }),
  20:Object.freeze({
    id:'syndicate-caster-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* Five splayed mouths on one cradle -- the Reaper's entire read. */
      [MAT.TWR_GLOW]:MAT.WEAPON_GLOW,
      [MAT.TRIM]:MAT.SYN_HOLO
    })
  }),
  21:Object.freeze({
    id:'syndicate-conduit-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* Shares mdlCoaCaster with slot 20 and deliberately not its contract:
         the Cinder burns ground at 96 range, so the same five mouths run hot
         instead of pulsing. A shared builder is exactly what this per-type
         remap is for. */
      [MAT.TWR_GLOW]:MAT.PLASMA_JET,
      [MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  22:Object.freeze({
    id:'syndicate-heavybeam-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* Same skiff as slot 10. The Vulture reads as stored charge; the Lancer
         reaches 230 and tracks aircraft, so its lance mouth reads as the
         emitter doing the work. */
      [MAT.TWR_GLOW]:MAT.WEAPON_GLOW,
      [MAT.TRIM]:MAT.SYN_GOLD
    })
  }),
  23:Object.freeze({
    id:'syndicate-sonic-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* Lower rim, recessed deck, horn bases and plenum. The Resonator is the
         only round hull in the kit and its eight radial ribs only read as ribs
         against a slatted housing; flat holo swallowed them. */
      [MAT.TWR_COAT]:MAT.METAL_LOUVRE,
      [MAT.TRIM]:MAT.SYN_HOLO
    })
  }),
  24:Object.freeze({
    id:'syndicate-service-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* TWR_ARM and TWR_ARM_D share MAT.TWR_ARMOR, so this is the whole
         armoured body -- plenum top plate, hull, upper deck, nose and boom
         link -- not just the deck. That is the point: the Warden is the one
         chassis here meant to be worked FROM rather than shot from, and a
         hull that is tread plate all over says so without adding a triangle.
         It is also the one chassis that trades away its nano-ceramic to do
         it, which is what keeps DECK_PLATE from becoming a kit-wide default. */
      [MAT.TWR_ARMOR]:MAT.DECK_PLATE,
      [MAT.TRIM]:MAT.SYN_GOLD
    })
  }),
  25:Object.freeze({
    id:'syndicate-scout-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* The Kestrel carries one hair-thin emitter and a sensor sphere twice
         its size; lighting both as weapon energy made it read as a smaller
         Wasp instead of as the thing that finds the enemy. */
      [MAT.TWR_GLOW]:MAT.RADAR_MESH,
      [MAT.TRIM]:MAT.SYN_HOLO                                  // dorsal spine stripe
    })
  }),
  26:Object.freeze({
    id:'syndicate-exp-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* Tier 3 at four times a Rhino's price, so this is the one contract that
         spends. Ribbed appliqué on hull and turret is the same fix the Nova
         Rhino needed: every Syndicate chassis pointed TWR_ARMOR at SYN_NANO,
         so the per-type remap existed but had nothing to say. */
      [MAT.TWR_ARMOR]:MAT.ARMR_RIB,
      [MAT.TWR_GLOW]:MAT.WEAPON_GLOW,
      [MAT.TRIM]:MAT.SYN_GOLD
    })
  }),
  27:Object.freeze({
    id:'syndicate-battery-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* Outrigger stabiliser feet, and on this hull TWR_PAD is nothing else --
         the Harbinger has no turret race. Same ground-bearing material as the
         Bombard, because both plant themselves and nothing else in the kit
         does. */
      [MAT.TWR_PAD]:MAT.FOUNDATION_PAD,
      [MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  29:Object.freeze({
    id:'syndicate-archon-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.SYN_GOLD,
      [MAT.TWR_COAT]:MAT.SYN_NANO,
      [MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.GLASS]:MAT.SYN_HOLO
    })
  }),
  32:Object.freeze({
    id:'syndicate-miner-v2', source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      /* TWR_GLOW on this hull is the mining head's emitter and nothing else --
         the pylons and the ore-cell rim are already ENERGY. A cutting beam is
         not a weapon and must not glow like one. */
      [MAT.TWR_GLOW]:MAT.PLASMA_JET,
      [MAT.TRIM]:MAT.SYN_GOLD
    })
  })
});
function coaSyndicateSurfacePass(geo,pack){
  if(!geo||!geo.v)return geo;
  const v=geo.v;
  for(let o=11;o<v.length;o+=VFLOATS){
    const raw=v[o],sgn=raw<0?-1:1,packed=Math.abs(raw);
    const whole=Math.floor(packed),src=whole-1;
    const dst=pack&&pack.surfaces[src]!==undefined?pack.surfaces[src]:COA_SYN_MAT[src];
    if(dst!==undefined)v[o]=sgn*((dst+1)+(packed-whole));
  }
  return geo;
}
const COA_SYN_FACTORY_CACHE=new Map();
function coaSyndicateFactory(fn,slot){
  /* A shared chassis may service more than one role. Cache by slot as well as
     builder so each semantic contract survives model-kit initialization. */
  const key=slot+':'+fn.name;
  if(COA_SYN_FACTORY_CACHE.has(key))return COA_SYN_FACTORY_CACHE.get(key);
  const wrapped=function(){
    const g=fn();
    const pack=COA_SYN_BESPOKE_PACKS[slot]||null;
    coaSyndicateSurfacePass(g.hull,pack);coaSyndicateSurfacePass(g.tur,pack);
    return g;
  };
  Object.defineProperty(wrapped,'name',{value:'coaGreen'+slot+'_'+fn.name});
  COA_SYN_FACTORY_CACHE.set(key,wrapped);
  return wrapped;
}

/* ---------------------------------------------------------------------------
   SLOT MAP. Roles are shared where the role is genuinely the same object and
   split where the stat line demands a different silhouette — a 400-range siege
   emitter and a 265-range mortar are not the same machine, and the player has
   to be able to say which is which at sixty pixels.
   --------------------------------------------------------------------------- */
const UNIT_MDL_SYNDICATE={
  0:coaSyndicateFactory(mdlSynStrider,0),       1:coaSyndicateFactory(mdlSyndicateRhino,1),
  2:coaSyndicateFactory(mdlCoaWalker,2),        3:coaSyndicateFactory(mdlCoaArty,3),
  5:coaSyndicateFactory(mdlCoaDrone,5),         6:coaSyndicateFactory(mdlCoaLongbow,6),
  7:coaSyndicateFactory(mdlCoaRocket,7),        8:coaSyndicateFactory(mdlCoaTitan,8),
  9:coaSyndicateFactory(mdlSynIncinerator,9),  10:coaSyndicateFactory(mdlCoaBeam,10),
  11:coaSyndicateFactory(mdlCoaShield,11),      14:coaSyndicateFactory(mdlCoaSkimmer,14),
  15:coaSyndicateFactory(mdlCoaCapital,15),     16:coaSyndicateFactory(mdlCoaSiege,16),
  17:coaSyndicateFactory(mdlCoaGunship,17),     18:coaSyndicateFactory(mdlCoaFlamer,18),
  19:coaSyndicateFactory(mdlCoaBuilder,19),     20:coaSyndicateFactory(mdlCoaCaster,20),
  21:coaSyndicateFactory(mdlCoaCaster,21),      22:coaSyndicateFactory(mdlCoaBeam,22),
  23:coaSyndicateFactory(mdlCoaSonic,23),      24:coaSyndicateFactory(mdlCoaService,24),
  25:coaSyndicateFactory(mdlCoaScout,25),      26:coaSyndicateFactory(mdlCoaExp,26),
  27:coaSyndicateFactory(mdlCoaBattery,27),    29:coaSyndicateFactory(mdlArchon,29),
  32:coaSyndicateFactory(mdlCoaMiner,32)
};

function mfCdrDecorateNyx(m){
  /* Needle lances past the sonic horns so the outline lengthens. Renn stays
     the stock Archon. */
  for(const sd of [-1,1]){
    cylX(m,8.0,4.4,sd*3.1,7.6,0.30,0.12,8,MET_L,false);
    ringX(m,15.2,4.4,sd*3.1,0.18,0.55,8,ENERGY);
    m.box(7.2,4.4,sd*3.1,1.8,0.72,0.72,TEAM_B);
    m.extrude(-2.6,6.6,sd*4.4,[[-5.4,-0.30],[-0.4,-0.30],[1.4,0.30],[-4.2,0.30]],2.6,MET);
  }
}
function mfCdrDecorateVoss(m){
  /* Predictive-core grid: concentric rings around the cortex plus deck cells. */
  m.ring(0,7.4,0,3.5,4.8,16,ENERGY);
  m.ring(0,8.3,0,2.7,4.0,14,ENERGY);
  m.ring(-0.6,9.5,0,2.1,3.4,12,TEAM_A);
  for(const z of [-1.7,0,1.7]) for(const x of [-2.5,-0.4,1.7])
    m.box(x,6.88,z,1.3,0.30,1.05,TEAM_B);
  for(const sd of [-1,1]){
    ringX(m,8.7,4.4,sd*3.1,0.72,1.90,10,ENERGY);
    m.box(3.2,5.95,sd*3.1,3.6,0.46,2.3,TEAM_A);
  }
}
if(typeof initFactionKits==='function'){
  const _coaInitKits=initFactionKits;
  initFactionKits=function(){
    _coaInitKits.apply(this,arguments);
    if(typeof mfCdrKitInst!=='function'||typeof COMMANDER_KIT_MESH==='undefined') return;
    const pack=COA_SYN_BESPOKE_PACKS[29];
    COMMANDER_KIT_MESH.syndicate_nyx=mfCdrKitInst(mdlArchon,mfCdrDecorateNyx,coaSyndicateSurfacePass,pack);
    COMMANDER_KIT_MESH.syndicate_voss=mfCdrKitInst(mdlArchon,mfCdrDecorateVoss,coaSyndicateSurfacePass,pack);
  };
}

