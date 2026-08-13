;
;
/* ============================================================================
   TERRAN FRONTLINE COMMAND — UNIT CHASSIS KIT   (internal kit key `nova`)
   ----------------------------------------------------------------------------
   DISCIPLINE. TECHNOLOGY. UNITY.

   The base roster was the oldest art in the game and it showed: every ground
   vehicle was `runningGear()` plus `hullShell()` plus one distinguishing lump,
   which at command-view zoom is fifteen identical grey slabs. Worse, it was
   also the most EXPENSIVE roster in the game — the Nova Goliath cost 4,072
   triangles against the Dominion walker's 2,232 for the same slot, because
   runningGear() spends 1,400-2,300 of them on per-wheel hydraulic rams hidden
   behind a track skirt that this camera never looks under. The army that
   looked the cheapest was paying the most for it.

   Everything here is built on `trackUnit()` instead (496/560/712 triangles for
   light/medium/heavy — the same read for a quarter of the cost), and the
   difference is spent on the part of the silhouette a player actually sees:
   the deck, the weapon and the outline.

   THE DOCTRINE. The Frontline Command is a professional combined-arms force
   and its machines are MAINTAINED. The vocabulary, repeated on every chassis
   so the army reads as one manufacturer before it reads as one colour:

     - welded monocoque hulls: a lower tub, a smaller upper deck stepped in on
       top of it, and a bevel on every exposed edge. No applique, no rivets;
     - a RAKED glacis that actually rakes fore-aft (see the wedge note below),
       with a brow lip and tow shackles either side of it;
     - deliberate panel breaks — a recessed seam with a bright edge — rather
       than large blank plate;
     - crew hatches, sensor masts and vision blocks. These are crewed vehicles
       and it should be obvious;
     - stowage strapped down where a crew would strap it, and ammunition
       lockers bolted to the flanks;
     - DUCTED exhaust exiting sideways behind a heat shield. The Dominion vents
       straight up through open stacks because nobody paid for ducting; that
       contrast is the point;
     - the livery band lands in the SAME PLACE on every chassis — the top edge
       of the track skirt — with a second panel on the turret cheeks.

   Restraint is the character. It is the opposite of the Dominion's riveted
   expendable iron and the opposite of the Coalition's cockpitless hovering
   machines, and it gets there by being deliberately plainer than either.

   CONTRACT, copied from mdlNovaRhino(): +X is forward (the direction the unit
   shoots), +Y is up, Z is lateral, the lowest point of a ground vehicle sits
   at y=0, and a builder returns {hull, tur, s, turH}. Unturreted units return
   tur:null and no turH.

   MATERIALS ARE LOAD-BEARING.
     TEAM_A / TEAM_B / TEAM_T are the only surfaces the faction colour reaches
       in full; everything else takes a partial wash. Two to five panels per
       model, never the whole hull. Hulls are MET/MET_L/MET_D on purpose so the
       body still carries the wash; weapons and machinery are TWR_MACH, which
       the shader washes far less, so the gun reads as steel against a tinted
       vehicle.
     SERVO marks a LEG — the vertex stage swings anything wearing it through
       the walk cycle. It appears in this file ONLY on mdlTfcWalker and the two
       infantry, which are the only Nova slots with `legs:1` AND actual legs.
       The Goliath's TYPES row has said legs:1 for as long as it has existed;
       the old model was a tracked tank, so the flag animated nothing.
     HOT / ENERGY / LAMP are emissive and are rationed to exhaust bores, muzzle
       collars, equipment cores and hatch beacons.

   THE WEDGE TRAP. MeshBuilder.wedge() slopes across its THIRD axis, so a wedge
   dropped in at yaw 0 ramps SIDEWAYS — every "glacis" authored in the base
   roster is really a lateral A-frame, and it was never caught because a sloped
   shape still looks sloped in a screenshot. glacisX() yaws a quarter turn so
   the ridge sits at the rear and the slope runs down to the nose. Every sloped
   plate in this file goes through it or through tfcProw().

   Names are prefixed tfc/mdlTfc because this repo is one global scope and
   `verifyglobals.mjs` fails the build on a duplicate top-level name.
   ============================================================================ */

/* ---------------------------------------------------------------------------
   FRONTLINE COMMAND DETAIL KIT
   --------------------------------------------------------------------------- */

/* A welded panel break: a shallow recess with a bright seam along it. This is
   the cheapest thing in the file (22 triangles) and it does more work than
   anything else — it is what stops a 6x4 armour face reading as an untextured
   slab, and it is the single detail that separates a Frontline hull from the
   Dominion's bolted plate at the distance this game is played at. */
function tfcSeam(m,x,y,z,len,wid,col,yaw){
  m.inset(x,y,z,len,wid,0.20,0.34,DARKER,yaw||0);
  m.box(x,y+0.03,z,len*0.90,0.09,0.13,col||MET_L,yaw||0);
  return m;
}

/* Crew hatch: rim, lid stepped in, grab handle. A vehicle with a hatch is a
   vehicle with people in it, which is exactly the read the Coalition's drones
   must not have. */
function tfcHatch(m,x,y,z,r,col){
  m.cyl(x,y,z,r,r*0.94,0.20,7,col||MET_D);
  m.cyl(x,y+0.20,z,r*0.80,r*0.74,0.16,7,MET_L);
  m.box(x,y+0.36,z,r*0.26,0.12,r*1.05,MET_L);
  return m;
}

/* Tow shackle: bracket and eye. Four per vehicle, front and rear, because
   recovery gear is what "we get our vehicles back" looks like in geometry. */
function tfcTow(m,x,y,z,yaw){
  m.box(x,y,z,0.52,0.58,0.40,MET_D,yaw||0);
  m.ring(x,y+0.60,z,0.20,0.40,7,MET_L);
  return m;
}

/* Ducted exhaust: a horizontal outlet with a real shadowed bore and a heat
   shield plate over it. Deliberately NOT the Dominion's open vertical stack.
   Points -X, so it exits behind the vehicle. */
function tfcExhaust(m,x,y,z,n,r){
  for(let k=0;k<n;k++){
    const oz=z+(k-(n-1)/2)*r*2.9;
    cylX(m,x,y,oz,r*1.9,r*1.14,r*0.98,7,MET_D,false);
    tubeX(m,x-r*0.7,y,oz,r*0.55,r*1.00,r*0.52,7,TWR_BORE);
    ringX(m,x-r*0.62,y,oz,r*0.28,r*0.56,7,HOT);
  }
  m.box(x-r*0.55,y+r*1.55,z,r*3.1,0.20,r*3.0*n,MET_L);
  return m;
}

/* Running gear. trackUnit() already builds the right components at the right
   price and puts the livery on the skirt's top edge — the one piece of running
   gear an overhead camera can see — so this only adds the Frontline tells: a
   bright welded seam along the skirt and two mud-flap ribs per side. */
function tfcTracks(m,len,wid,h,gauge,n,cls){
  const K=cls==null?1:cls;
  trackUnit(m,len,wid,h,gauge,n,MET_D,K,TEAM_A);
  const W=wid*[0.84,1.0,1.24][K];
  for(const sd of [-1,1]){
    m.box(0,h*1.44,sd*(gauge+W*0.14),len*0.90,0.14,W*0.26,MET_L);
    for(const f of [-1,1])
      m.box(f*len*0.40,h*0.92,sd*(gauge+W*0.56),len*0.09,h*0.46,0.20,MET_L);
  }
  return m;
}

/* Welded two-tier hull. The lower tub carries the plan shape; the upper deck
   is the SAME outline pulled in, which is what reads as a plate break from
   directly above. Returns the deck height so callers stack hardware on it
   without repeating the arithmetic. */
function tfcHull(m,x,yBase,len,wid,hLow,hHigh,colLow,colHigh){
  const L=len*0.5, W=wid*0.5;
  const prof=[[-L,-W*0.76],[-L*0.64,-W],[L*0.32,-W],[L*0.84,-W*0.62],[L,-W*0.26],
              [ L, W*0.26],[L*0.84, W*0.62],[L*0.32, W],[-L*0.64, W],[-L, W*0.76]];
  m.extrude(x,yBase,0,prof,hLow,colLow||MET);
  m.extrude(x,yBase+hLow,0,prof.map(p=>[p[0]*0.90,p[1]*0.84]),hHigh,colHigh||MET_L);
  return yBase+hLow+hHigh;
}

/* Raked prow: glacis (through glacisX, so it slopes fore-aft), brow lip, a
   seam across the plate and a tow shackle either side. */
function tfcProw(m,x,y,z,len,h,wid){
  glacisX(m,x,y,z,len,h,wid,MET_L);
  m.box(x-len*0.34,y+h*0.92,z,len*0.30,0.22,wid*0.66,MET_L);
  m.box(x+len*0.30,y+h*0.16,z,len*0.20,h*0.26,wid*0.70,MET_D);
  for(const sd of [-1,1]) tfcTow(m,x+len*0.28,y+h*0.04,z+sd*wid*0.30,0);
  return m;
}

/* Turret bearing ring. A turret sitting straight on a deck reads as a box
   balanced on a box; the ring is what makes it a machine that traverses. */
function tfcRing(t,x,r,h){
  t.cyl(x,-h,0,r,r*0.90,h,10,TWR_PAD);
  t.ring(x,0,0,r*0.62,r*0.94,10,MET_D);
  return t;
}

/* Welded turret: faceted body, deck stepped in, cheek livery, smoke
   dischargers, a bustle rack and a commander's cupola with a hatch. Everything
   a Frontline turret has in common with every other Frontline turret. */
function tfcTurret(t,len,wid,h,cupZ){
  const L=len*0.5, W=wid*0.5;
  const prof=[[-L,-W*0.80],[-L*0.52,-W],[L*0.30,-W*0.94],[L*0.88,-W*0.52],
              [ L,-W*0.22],[ L, W*0.22],[L*0.88, W*0.52],[L*0.30, W*0.94],
              [-L*0.52, W],[-L, W*0.80]];
  t.extrude(0,0,0,prof,h*0.70,MET);
  t.extrude(0,h*0.70,0,prof.map(p=>[p[0]*0.84,p[1]*0.78]),h*0.30,MET_L);
  for(const sd of [-1,1]){
    t.bevelBox(-L*0.10,h*0.20,sd*W*0.92,len*0.54,h*0.44,0.40,0.13,sd>0?TEAM_A:TEAM_B);
    t.box(-L*0.60,h*0.72,sd*W*0.54,len*0.16,h*0.26,len*0.13,DARKER);
    for(let k=0;k<3;k++) t.cyl(-L*0.66+k*len*0.09,h*0.98,sd*W*0.54,0.20,0.17,len*0.10,6,DARKER);
  }
  t.bevelBox(-L*0.88,h*0.18,0,len*0.28,h*0.66,wid*0.60,0.22,MET_D);
  t.box(-L*0.88,h*0.86,0,len*0.22,0.16,wid*0.44,TEAM_T);
  tfcHatch(t,-L*0.24,h*1.00,(cupZ==null?-W*0.42:cupZ),Math.min(0.95,wid*0.15),MET_D);
  return t;
}

/* One SERVO leg. Everything is painted SERVO because the vertex stage swings
   SERVO geometry below the hip line through the gait — mixing ordinary armour
   into a limb leaves those plates standing where the foot used to be. S scales
   the whole limb so the same anatomy can serve more than one machine. */
function tfcLeg(m,z,S){
  m.bevelBox(-0.40*S,0,z,4.30*S,0.95*S,2.75*S,0.32*S,SERVO);          // planted foot
  m.box(1.50*S,0.20*S,z,1.10*S,0.52*S,2.25*S,SERVO);                  // toe cleat
  m.box(-1.95*S,0.18*S,z,0.75*S,0.48*S,2.00*S,SERVO);                 // heel
  m.cyl(-0.35*S,0.95*S,z,0.88*S,0.74*S,0.62*S,8,SERVO);               // ankle bearing
  m.extrude(-0.20*S,1.52*S,z,[[-1.15*S,-1.10*S],[0.85*S,-1.10*S],[1.20*S,-0.46*S],
            [1.20*S,0.46*S],[0.85*S,1.10*S],[-1.15*S,1.10*S]],3.00*S,SERVO);
  m.bevelBox(-0.05*S,2.05*S,z,1.90*S,2.00*S,2.60*S,0.26*S,SERVO);     // shin armour
  /* Shin ram built by hand rather than through hydraulic(): that helper hard-
     codes MET_L for the bright ram and DARKER for the gland nut whatever colour
     it is handed, so two thirds of every "SERVO" leg ram in this engine is NOT
     SERVO and stands still while the limb it belongs to swings away from it.
     Same three components, all of them actually painted as a leg. */
  m.cyl(-1.20*S,1.60*S,z,0.24*S,0.23*S,1.74*S,7,SERVO);               // ram body
  m.cyl(-1.20*S,3.34*S,z,0.14*S,0.14*S,1.30*S,7,SERVO);               // ram rod
  m.cyl(-1.20*S,3.20*S,z,0.29*S,0.29*S,0.30*S,7,SERVO);               // gland nut
  m.cyl(0.15*S,4.55*S,z,1.34*S,1.18*S,1.10*S,8,SERVO);                // knee bearing
  m.bevelBox(0.10*S,5.30*S,z,3.00*S,1.45*S,2.85*S,0.32*S,SERVO);      // thigh armour
  m.extrude(-0.10*S,6.15*S,z,[[-1.05*S,-1.05*S],[0.95*S,-1.05*S],[1.25*S,-0.48*S],
            [1.25*S,0.48*S],[0.95*S,1.05*S],[-1.05*S,1.05*S]],2.05*S,SERVO);
  return m;
}

/* A cylinder lying ACROSS the vehicle, on the Z axis.

   THE OTHER ENGINE TRAP, and it is worth writing down beside the wedge one.
   MeshBuilder.cyl()'s ninth argument is `cap`, not a yaw — cyl has no rotation
   parameter at all. Every `cyl(..., Math.PI/2)` in this library therefore
   builds a cylinder STANDING ON END with its end caps switched on, which is
   why wheelAsm()'s tyres, runningGear()'s hubs, the Scorcher's fuel drums and
   the Warden's hose reel are all vertical discs rather than anything lying
   across a hull — and, like the wedge, it was never caught because a circle
   still looks like a circle in a screenshot. cylX() already solves this for the
   +X axis by rotating a scratch mesh onto it; this is the same move for +Z.
   Local +Y becomes +Z, so the cylinder runs from z to z+len. */
function tfcCylZ(m,x,y,z,len,r1,r2,seg,col,cap){
  const mm=MB(); mm.m=m.m; mm.tm=m.tm;
  mm.cyl(0,0,0,r1,r2,len,seg,col,cap);
  for(let i=0;i<mm.v.length;i+=VFLOATS){
    const px=mm.v[i], py=mm.v[i+1], pz=mm.v[i+2];
    const nx=mm.v[i+3], ny=mm.v[i+4], nz=mm.v[i+5];
    mm.v[i]=px+x; mm.v[i+1]=-pz+y; mm.v[i+2]=py+z;      // rotate +90 about X
    mm.v[i+3]=nx; mm.v[i+4]=-nz; mm.v[i+5]=ny;
  }
  const o=m.n;
  for(let i=0;i<mm.v.length;i++) m.v.push(mm.v[i]);
  for(const ix of mm.i) m.i.push(ix+o);
  m.n+=mm.n; m.m=mm.m; m.tm=mm.tm;
  return m;
}

/* Diagonal member. Every primitive in this library is axis-aligned, which is
   why every crane, jib and outrigger in the roster is a staircase of boxes —
   the renders of the first pass made that unmistakable on the engineer, whose
   "telescopic boom" was three blocks with a yaw on them (a yaw rotates in the
   GROUND plane, so it swung the boom sideways instead of raising it).
   boneSeg() already builds a tapered tube between two arbitrary points for the
   Brood limbs; it writes quads directly, so it does not pass through the
   colour->material wrapper and the material has to be set by hand. */
function tfcStrut(m,a,b,r,col){
  m.m=COL_MAT.get(col)||0; m.tm=COL_TEAM.has(col)?1:0;
  boneSeg(m,a,b,r,r*0.88,6,col);
  return m;
}

/* Engine deck. A recessed dark grille panel at the rear of every hull. The
   renders of the first pass were the argument for this: with the whole deck in
   one mid grey the hull read as an untextured slab from directly above, which
   is the one angle this camera always has. A dark inset behind a bright rail is
   the cheapest value break there is, and it also says where the engine is. */
function tfcDeckGear(m,x,y,len,wid,trim){
  deckCrown(m,x,y,0,len*0.88,wid*0.80,MET_D,trim||TEAM_T);
  insetPanel(m,x-len*0.30,y+0.02,0,len*0.26,wid*0.44,0.22,DARK,0);
  for(let k=0;k<3;k++) m.box(x-len*0.30,y+0.16,-wid*0.16+k*wid*0.16,len*0.22,0.13,0.13,MET_L);
  return m;
}

/* Strapped stowage: a rolled tarp with two straps over it and a locker beside
   it. The base roster used RUST for stowage on every vehicle, which reads as
   neglect; Frontline kit is canvas over painted steel. */
function tfcStow(m,x,y,z,len,wid,seed){
  m.bevelBox(x,y,z,len*0.52,wid*0.62,wid*0.86,wid*0.24,CONC_D);
  for(const f of [-1,1]) m.box(x+f*len*0.13,y+wid*0.30,z,0.12,wid*0.34,wid*0.92,MET_D);
  m.greeble(x+len*0.36,y,z,len*0.46,wid*0.80,wid*0.46,3,MET_D,0,seed||7);
  return m;
}

/* Hazard chevrons across a service vehicle's deck. Unarmed machines need a
   read of their own from directly above, and this is the one the eye already
   knows from every works vehicle it has ever seen. */
function tfcChevrons(m,x,y,z,n,span,wid){
  /* Value contrast, not emission. Painting alternate bars LAMP made three
     unarmed vehicles glow in the dark from their deck markings and pushed them
     past 10% emissive verts; bright trim against a dark reveal reads as a
     hazard stripe in daylight and costs nothing at night. */
  for(let k=0;k<n;k++)
    m.box(x-span*0.5+k*(span/Math.max(1,n-1)),y,z,0.40,0.13,wid,k&1?DARKER:MET_L,0.44);
  return m;
}

/* The shared Frontline soldier. The production tab says INFANTRY and the
   player expects a person: helmet with a visor band, armoured torso over a
   narrower waist, pauldrons carrying the livery at the widest point, webbing
   pouches on the belt and a backpack. Legs are SERVO so the walk shader
   marches them with the same system that walks the mechs; arms and weapon stay
   rigid so the gun does not wobble. Returns the joint heights the weapon
   builders hang hardware off. */
function tfcSoldier(m,o){
  o=o||{};
  const H=o.h||8.6, W=o.w||1.0;
  const hip=H*0.46, sh=H*0.74, hd=H*0.86;
  for(const sd of [-1,1]){
    m.bevelBox(0.25,0,sd*0.62*W,1.45*W,0.52,0.92*W,0.18,DARK);            // boot
    m.bevelBox(0.05,0.52,sd*0.62*W,0.78*W,hip*0.42,0.78*W,0.17,SERVO);    // shin
    tfcCylZ(m,0.05,hip*0.50,sd*0.62*W-0.24,0.48,0.44*W,0.44*W,6,MET_D,true); // knee
    m.bevelBox(0.0,hip*0.55,sd*0.62*W,0.90*W,hip*0.48,0.90*W,0.19,SERVO); // thigh
    m.box(0.0,hip*1.02,sd*0.62*W,0.98*W,0.46,0.98*W,MET_D);               // hip guard
  }
  m.bevelBox(0,hip,0,1.28*W,(sh-hip)*0.34,1.46*W,0.20,DARK);              // waist
  m.bevelBox(0.08,hip+(sh-hip)*0.28,0,1.86*W,(sh-hip)*0.76,2.05*W,0.28,o.chest||MET);
  /* Raked breastplate — the armour angle is what stops a torso reading as a
     box, and it is the same move as the vehicles' glacis at 1/20th the scale. */
  glacisX(m,0.62*W,hip+(sh-hip)*0.34,0,0.80*W,(sh-hip)*0.50,1.85*W,o.chest||MET_L);
  m.box(-0.55*W,hip+(sh-hip)*0.5,0,0.95*W,(sh-hip)*0.60,1.80*W,o.pack||MET_D);  // backpack
  for(const sd of [-1,1]){
    m.bevelBox(0,sh-0.24,sd*1.22*W,1.30*W,0.58,0.92*W,0.28,TEAM_A);       // pauldron livery
    m.bevelBox(0.14,sh-1.12,sd*1.28*W,0.70*W,1.05,0.60*W,0.19,SERVO);     // upper arm
    m.bevelBox(0.82*W,sh-1.52,sd*1.02*W,1.26*W,0.56,0.52*W,0.17,DARK);    // forearm
    m.box(0.30,hip+0.10,sd*0.96*W,0.62*W,0.52,0.42*W,MET_D);              // webbing pouch
  }
  m.bevelBox(0.08,sh+0.14,0,1.12*W,(hd-sh)*0.9,1.22*W,0.32,o.helm||MET_L);// helmet
  m.box(0.60*W,sh+0.40,0,0.30,0.40,0.92*W,GLASS);                         // visor band
  m.box(0.10,hd+0.02,0,0.85*W,0.16,1.00*W,TEAM_T);                        // helmet band livery
  if(o.antenna) m.cyl(-0.34*W,hd,0.48*W,0.05,0.03,0.95,5,DARKER);
  return {hip,sh,hd};
}

/* ---------------------------------------------------------------------------
   0 — STRIKER.  Line rifleman, hp 40 / dmg 5.4 / rng 62.
   The cheapest thing the Command fields and the one it fields most of, so it
   is also the unit that sets the scale of everything else on the board: a tank
   only reads as big when a person is standing next to it.
   --------------------------------------------------------------------------- */
function mdlTfcTrooper(){
  const m=MB();
  const b=tfcSoldier(m,{h:8.6,w:1.0,antenna:1});
  /* Service rifle held across the body and pointed +X, so the soldier faces
     where he shoots: receiver, barrel, muzzle brake, magazine, optic. */
  const gy=b.hip+1.55;
  m.bevelBox(1.30,gy,0.15,2.50,0.52,0.42,0.13,MET_D);
  m.box(1.05,gy+0.44,0.15,1.20,0.26,0.30,TWR_MACH);                       // optic
  cylX(m,2.55,gy+0.10,0.15,1.70,0.14,0.12,6,DARKER,false);                // barrel
  m.box(4.20,gy-0.12,0.15,0.34,0.42,0.44,TWR_MACH);                       // muzzle brake
  tubeX(m,4.28,gy+0.10,0.15,0.24,0.18,0.09,6,TWR_BORE);                   // bore
  m.box(1.55,gy-0.50,0.15,0.36,0.58,0.32,MET_D);                          // magazine
  m.box(0.24,gy+0.04,0.15,0.66,0.38,0.32,DARK);                           // stock
  m.box(-0.58,b.sh+0.36,0,0.62,0.18,0.30,ENERGY);                         // radio lamp
  return {hull:m.build(),tur:null,s:0.92};
}

/* ---------------------------------------------------------------------------
   9 — PYRO.  Flame trooper, hp 240 / dmg 11 / rng 58.
   Same species, bulked out: a flame suit is sealed and heavy, the helmet is a
   full hood, and the backpack is the fuel plant. The pilot light is the tell
   at range and the only emissive on the model.
   --------------------------------------------------------------------------- */
function mdlTfcFlamer(){
  const m=MB();
  const b=tfcSoldier(m,{h:8.2,w:1.22,chest:MET_D,helm:MET_D,pack:DARK});
  for(const sd of [-1,1]){
    m.cyl(-1.05,b.hip+0.35,sd*0.60,0.50,0.50,3.30,7,TWR_MACH);            // fuel bottle
    m.cyl(-1.05,b.hip+3.65,sd*0.60,0.50,0.30,0.46,7,MET_D);               // valve cap
    m.cyl(-1.05,b.hip+1.85,sd*0.60,0.55,0.55,0.24,7,MET_L);               // pressure band
  }
  m.box(-1.05,b.sh+0.30,0,1.30,0.20,1.90,MET_L);                          // bottle yoke
  cylX(m,-0.70,b.sh-0.42,0,1.85,0.15,0.13,5,DARKER,false);                // feed hose
  /* Projector: short, fat, shrouded, with the pilot flame at the lip. */
  const gy=b.hip+1.45;
  m.bevelBox(1.42,gy,0.15,1.95,0.66,0.58,0.15,MET_D);
  cylX(m,2.40,gy+0.08,0.15,1.05,0.32,0.36,7,TWR_MACH,false);
  tubeX(m,3.42,gy+0.08,0.15,0.55,0.40,0.20,7,TWR_BORE);
  cylX(m,3.80,gy+0.08,0.15,0.46,0.11,0.09,5,HOT,true);                    // pilot light
  m.box(0.94,gy-0.46,0.15,0.46,0.48,0.36,DARK);                           // grip
  return {hull:m.build(),tur:null,s:0.95};
}

/* ---------------------------------------------------------------------------
   2 — GOLIATH.  Assault walker, hp 450 / dmg 42 / rng 104, aoe 10.
   TYPES has carried legs:1 on this slot since it was written and the game's
   own intel copy calls it an assault walker; the old model was a tracked tank,
   so the flag animated nothing and the army had no legged silhouette at all
   between the Striker and the TITAN. Rebuilt as what the data already said it
   was — and that also solves the readability problem, because at 60 pixels a
   walker is the only thing in a Frontline column that is not a tracked box.
   Legs are SERVO and everything above the hip is not.
   --------------------------------------------------------------------------- */
function mdlTfcWalker(){
  const m=MB();
  /* STANCE. The first pass put the legs at z=+-4.1 under a torso +-4.3 wide
     and shoulders wider still, so from every angle inside the camera's pitch
     band the walker read as a turret on a plinth — the legs were never visible
     at all. Standing them outboard of the hull is the entire difference
     between a walker and a tank with a tall superstructure. */
  for(const sd of [-1,1]){
    tfcLeg(m,sd*5.45,1.00);
    /* Knee shroud and shin skirt are painted SERVO like the limb they belong
       to. Armour left in an ordinary material stands where the foot used to be
       once the gait swings the leg out from under it. */
    m.bevelBox(0.10,4.35,sd*5.45,2.90,0.70,3.05,0.24,SERVO);              // knee shroud
    armorPlate(m,-0.20,2.20,sd*7.05,4.40,1.50,0.40,0,SERVO,0);            // shin skirt
    tfcStrut(m,[-1.10,8.10,sd*3.40],[0.10,6.30,sd*5.45],0.34,MET_D);      // hip brace
  }
  /* Hip bridge — the legs hang off this, so it is visibly a single casting. */
  m.extrude(0,8.20,0,[[-4.10,-4.60],[2.40,-5.10],[4.35,-2.70],[4.35,2.70],
            [2.40,5.10],[-4.10,4.60]],2.10,MET);
  m.extrude(0.10,10.30,0,[[-3.50,-4.00],[2.10,-4.40],[3.75,-2.30],[3.75,2.30],
            [2.10,4.40],[-3.50,4.00]],0.70,MET_L);
  for(const sd of [-1,1]) m.box(-0.40,11.00,sd*4.05,5.20,0.24,1.30,sd>0?TEAM_A:TEAM_B);
  /* Torso — lower casemate, stepped upper plate, raked chest. */
  m.extrude(0,11.00,0,[[-4.00,-3.75],[2.30,-4.20],[4.30,-2.20],[4.30,2.20],
            [2.30,4.20],[-4.00,3.75]],2.90,MET);
  m.extrude(0.15,13.90,0,[[-3.30,-3.05],[2.00,-3.40],[3.55,-1.75],[3.55,1.75],
            [2.00,3.40],[-3.30,3.05]],0.85,MET_L);
  tfcProw(m,4.40,11.20,0,3.10,2.70,6.60);                                 // chest glacis
  tfcSeam(m,-1.20,14.76,0,3.20,4.00,MET_L,0);
  m.box(2.20,14.76,0,1.80,0.22,4.60,TEAM_T);                              // collar band livery
  for(const sd of [-1,1]){
    m.bevelBox(0.30,11.60,sd*4.35,4.20,2.40,1.20,0.28,MET_D);             // shoulder plate
    m.box(0.30,14.02,sd*4.40,3.80,0.26,1.00,sd>0?TEAM_A:TEAM_B);          // shoulder livery
    m.bevelBox(-0.60,11.30,sd*4.00,5.60,2.10,0.44,0.16,sd>0?TEAM_A:TEAM_B);// flank livery
    m.box(-4.15,11.45,sd*2.85,1.45,2.50,0.90,DARK);                       // torso grille
    for(let k=0;k<3;k++) m.box(-3.95,11.75+k*0.74,sd*3.32,1.00,0.26,0.26,MET_L);
    m.cyl(4.30,11.75,sd*3.10,0.28,0.24,1.05,6,MET_L);                     // lift point
  }
  ventBank(m,-2.90,14.76,0,2.70,5.00,5,MET_D,0);
  m.bevelBox(-4.25,11.30,0,2.20,3.20,5.80,0.42,MET_D);                    // powerplant
  tfcExhaust(m,-5.30,12.90,0,2,0.52);
  m.greeble(-4.25,14.50,0,1.80,4.40,0.50,4,TWR_MACH,0,71);
  sensorMast(m,-1.95,14.80,2.20,2.10,MET_L);
  tfcStow(m,-2.40,14.80,-2.60,3.00,1.10,31);

  const t=MB();
  tfcRing(t,-0.70,3.30,1.05);
  tfcTurret(t,7.60,6.40,3.10,-2.60);
  t.box(3.10,0.95,0,1.10,2.20,3.00,TWR_MACH);                             // mantlet
  gunX(t,3.20,1.85,7.60,0.68,TWR_MACH);                                   // splash cannon
  cylX(t,2.45,1.85,0,2.60,1.12,0.92,10,MET_D,false);                      // recoil sleeve
  for(const x of [5.10,7.90]) ringX(t,x,1.85,0,0.76,1.02,9,x>7?HOT:MET_L);
  cylX(t,2.70,0.72,-2.15,3.10,0.26,0.22,6,TWR_MACH,false);                // coaxial
  tubeX(t,5.85,0.72,-2.15,0.40,0.34,0.16,7,TWR_BORE);
  tfcStow(t,-3.10,3.20,0,2.60,1.00,17);
  return {hull:m.build(),tur:t.build(),s:0.86,turH:14.75};
}

/* ---------------------------------------------------------------------------
   3 — THUMPER.  Field artillery, hp 135 / dmg 60 / rng 265, minRng 80.
   Thin-skinned by design: a light track run, a shallow hull and every gram of
   the mass in the tube and the recoil gear. The DEPLOYED SPADES at the back
   are the plan-view tell that separates artillery from a gun tank, and the
   mount is open-topped — a crew serving a piece, not a sealed turret.
   --------------------------------------------------------------------------- */
function mdlTfcArty(){
  const m=MB();
  tfcTracks(m,12.6,3.00,2.60,3.45,5,0);
  const deck=tfcHull(m,-0.20,2.10,12.2,7.20,1.30,0.80);                   // deck ~4.20
  tfcProw(m,5.30,2.10,0,2.60,1.90,5.80);
  for(const sd of [-1,1]){
    /* Recoil spade: a plate on a ram, dug in behind the vehicle. Carried
       OUTBOARD of the track run so it breaks the plan-view outline — the first
       pass tucked them between the tracks where the overhead camera could not
       see them at all, which threw away the entire artillery tell. */
    m.box(-6.60,1.10,sd*4.60,0.70,3.00,2.40,MET_D);
    m.wedge(-7.25,0.05,sd*4.60,1.80,1.10,2.30,MET_L,Math.PI/2,true);
    hydraulic(m,-5.40,2.20,sd*4.10,2.20,0.28,TWR_MACH,0);
    m.box(-6.62,3.00,sd*4.60,0.34,0.22,1.80,sd>0?TEAM_A:TEAM_B);
    kitBox(m,2.30,deck,sd*2.55,2.30,0.90,1.30,MET_D,0);                   // shell lockers
    m.box(-1.30,deck+0.02,sd*3.05,4.60,0.16,0.70,MET_L);                  // deck walkway
  }
  tfcDeckGear(m,-0.20,deck,12.2,7.20);
  tfcExhaust(m,-5.10,3.10,1.90,1,0.44);
  tfcSeam(m,1.60,deck+0.02,0,3.00,3.00,MET_L,0);
  tfcHatch(m,3.10,deck,-2.10,0.72,MET_D);
  sensorMast(m,-4.30,deck,1.90,2.20,MET_L);

  const t=MB();
  tfcRing(t,-0.60,2.55,0.85);
  /* OPEN MOUNT: a shield plate and two side cheeks rather than a closed
     turret. Artillery is served, not driven. */
  t.extrude(0,0,0,[[-3.20,-2.70],[1.20,-3.00],[2.60,-1.70],[2.60,1.70],
            [1.20,3.00],[-3.20,2.70]],1.90,MET);
  t.bevelBox(1.90,1.90,0,1.90,1.70,5.10,0.34,MET_L);                      // gun shield
  for(const sd of [-1,1]){
    t.bevelBox(-0.90,1.90,sd*2.45,4.20,1.35,0.42,0.16,sd>0?TEAM_A:TEAM_B);// cheek livery
    t.cyl(1.30,1.00,sd*1.70,1.20,1.10,0.80,8,MET_D);                      // trunnion
    hydraulic(t,-1.40,0.90,sd*1.95,2.40,0.30,TWR_MACH,0);                 // elevation ram
    t.box(-2.60,1.95,sd*1.60,1.60,0.90,1.00,DARKER);                      // ready rack
  }
  gunX(t,1.60,2.05,13.40,0.56,TWR_MACH);                                  // long tube
  cylX(t,1.30,2.05,0,2.90,1.02,0.86,9,MET_D,false);                       // recuperator
  for(const x of [6.40,10.60]) ringX(t,x,2.05,0,0.60,0.84,9,MET_L);
  t.box(-3.00,1.90,0,1.60,1.10,3.40,TWR_MACH);                            // breech block
  t.box(-3.00,3.00,0,1.20,0.16,2.40,TEAM_T);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:4.30};
}

/* ---------------------------------------------------------------------------
   16 — BOMBARD.  Siege platform, hp 400 / dmg 95 / rng 400, minRng 100.
   The longest reach in the game, and the silhouette has to say so from across
   the map: ONE very long thin tube on a BRACED carriage. The four deployed
   outrigger jacks are the whole read — nothing else in the roster plants
   itself on the ground to fire, and a player who sees them knows immediately
   that the thing shooting at his base is 400 units away.
   --------------------------------------------------------------------------- */
function mdlTfcSiege(){
  const m=MB();
  tfcTracks(m,14.2,3.60,2.90,4.05,6,1);
  const deck=tfcHull(m,-0.30,2.40,13.6,8.60,1.60,0.95);                   // deck ~4.95
  tfcProw(m,5.90,2.40,0,2.90,2.10,6.90);
  for(const sd of [-1,1]){
    /* OUTRIGGER JACKS, front and rear, DEPLOYED and reaching clear of the
       track run. The first pass had them at z=5.4 with the skirts already out
       to 6.0, so from above the one detail that says "this thing plants itself
       to shoot 400 units" was hidden inside its own silhouette. */
    for(const fx of [4.30,-5.60]){
      m.box(fx,3.05,sd*5.60,2.00,0.70,3.00,MET_D);
      m.cyl(fx+(fx>0?0.60:-0.60),0.90,sd*7.30,0.46,0.42,2.40,7,MET_L);
      m.bevelBox(fx+(fx>0?0.60:-0.60),0,sd*7.30,2.40,0.90,2.40,0.34,MET_D);
      m.box(fx+(fx>0?0.60:-0.60),0.90,sd*7.30,1.60,0.18,1.60,sd>0?TEAM_A:TEAM_B);
    }
    kitBox(m,-2.20,deck,sd*3.00,2.80,1.00,1.60,MET_D,0);
    m.box(-0.30,deck+0.02,sd*3.60,6.20,0.16,0.72,MET_L);
  }
  tfcDeckGear(m,-0.30,deck,13.6,8.60);
  tfcExhaust(m,-6.10,3.50,2.20,1,0.50);
  tfcSeam(m,2.40,deck+0.02,0,3.00,3.40,MET_L,0);
  tfcHatch(m,3.40,deck,-2.40,0.78,MET_D);
  sensorMast(m,-5.10,deck,2.20,2.60,MET_L);

  const t=MB();
  tfcRing(t,-0.80,3.05,1.00);
  t.extrude(0,0,0,[[-3.60,-3.10],[1.30,-3.40],[2.80,-1.90],[2.80,1.90],
            [1.30,3.40],[-3.60,3.10]],2.30,MET);
  t.bevelBox(-2.90,2.30,0,2.40,0.90,5.20,0.30,MET_L);
  t.bevelBox(2.00,2.30,0,2.00,1.90,5.60,0.38,MET_L);                      // shield plate
  for(const sd of [-1,1]){
    t.bevelBox(-1.10,2.30,sd*2.80,4.60,1.50,0.44,0.18,sd>0?TEAM_A:TEAM_B);
    t.cyl(1.20,1.10,sd*2.00,1.34,1.20,0.90,8,MET_D);                      // trunnion
    hydraulic(t,-1.70,1.00,sd*2.30,2.70,0.32,TWR_MACH,0);
    cylX(t,0.60,2.55,sd*1.05,6.40,0.32,0.28,7,TWR_MACH,false);            // recoil cylinder
  }
  /* THE TUBE. Thin for its length on purpose: a siege mortar reads as a pipe,
     not as a tank gun, and the two collars along it give the eye something to
     measure that length against. */
  gunX(t,1.30,2.10,17.20,0.62,TWR_MACH);
  cylX(t,1.10,2.10,0,3.10,1.14,0.94,10,MET_D,false);
  for(const x of [7.20,12.60,16.20]) ringX(t,x,2.10,0,0.66,0.92,9,x>16?HOT:MET_L);
  t.box(-3.40,2.10,0,1.80,1.30,3.80,TWR_MACH);                            // breech
  t.box(-3.40,3.40,0,1.30,0.18,2.60,TEAM_T);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:5.05};
}

/* ---------------------------------------------------------------------------
   10 — VULTURE.  Anti-air, hp 170 / dmg 52 / rng 172, tg:'air'.
   It cannot shoot ground AT ALL, so the mount has to be unmistakable from
   above or the player wastes it: twin high-elevation autocannon with visible
   ammunition feeds, and a flat PLANAR RADAR ARRAY rather than a dish, because
   the Frontline Command's whole pitch is that its technology is current.
   Tier 1, so this is on the strictest triangle budget in the file.
   --------------------------------------------------------------------------- */
function mdlTfcAA(){
  const m=MB();
  tfcTracks(m,11.0,2.80,2.40,3.20,5,0);
  const deck=tfcHull(m,-0.20,2.00,10.8,6.60,1.20,0.70);                   // deck ~3.90
  tfcProw(m,4.70,2.00,0,2.30,1.70,5.30);
  kitBox(m,-2.60,deck,2.30,2.20,0.85,1.20,MET_D,0);
  tfcDeckGear(m,-0.20,deck,10.8,6.60);
  tfcExhaust(m,-4.60,2.80,1.70,1,0.40);

  const t=MB();
  tfcRing(t,-0.40,2.30,0.80);
  t.extrude(0,0,0,[[-2.70,-2.30],[1.10,-2.60],[2.40,-1.40],[2.40,1.40],
            [1.10,2.60],[-2.70,2.30]],1.70,MET);
  t.extrude(0,1.70,0,[[-2.20,-1.85],[0.90,-2.10],[1.95,-1.15],[1.95,1.15],
            [0.90,2.10],[-2.20,1.85]],0.55,MET_L);
  for(const sd of [-1,1]){
    /* Barrels PITCHED UP through tfcStrut, because every barrel primitive in
       this library runs along an axis and a level barrel reads as a gun tank —
       which gets this unit driven at armour it literally cannot hurt. Elevation
       is the entire silhouette of an anti-air mount and nothing else in the
       roster has it. */
    const z=sd*1.30;
    tfcStrut(t,[0.70,1.55,z],[5.30,4.30,z],0.30,TWR_MACH);                // barrel
    tfcStrut(t,[4.60,3.88,z],[5.75,4.57,z],0.44,MET_L);                   // flash hider
    tfcStrut(t,[5.62,4.49,z],[5.98,4.71,z],0.21,TWR_BORE);                // bore
    t.box(0.10,1.55,sd*2.20,1.90,1.00,0.90,DARKER);                       // ammunition feed
    t.box(-0.60,2.32,sd*2.15,2.60,0.20,0.52,sd>0?TEAM_A:TEAM_B);          // cheek livery
    t.box(-1.30,1.10,sd*1.60,0.50,1.30,0.44,TWR_MACH);                    // elevation ram
  }
  t.bevelBox(1.10,1.55,0,1.60,1.60,3.30,0.30,TWR_MACH);                   // trunnion cradle
  /* PLANAR ARRAY: a flat panel on a mast. Reads as radar from any angle and
     costs a fraction of a dish — and a dish is what the old model used, which
     is also what the Dominion's Warden uses, so it was never diagnostic. */
  t.cyl(-2.30,2.25,0,0.30,0.26,1.30,6,MET_D);
  t.bevelBox(-2.30,3.55,0,0.36,2.70,3.90,0.18,MET_L);
  t.box(-2.12,3.70,0,0.16,2.30,3.40,TEAM_T);
  t.box(-2.30,6.25,0,0.26,0.34,0.26,LAMP);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:4.00};
}

/* ---------------------------------------------------------------------------
   6 — LONGBOW / 22 — LANCER.  Precision long guns.
   Longbow is a 205-range beam at 110 hull; Lancer is a 230-range gauss lance
   at 190 hull and 150 damage a shot. Both are the same doctrinal object: a
   light, fragile carrier whose entire mass is ONE very long weapon, with
   capacitor banks feeding it and stabiliser jacks under it. They share a
   chassis for the same reason the Dominion's two long guns do — the roles are
   the same shape — and the sim scales them apart at draw time.
   --------------------------------------------------------------------------- */
function mdlTfcLance(){
  const m=MB();
  tfcTracks(m,11.6,2.80,2.45,3.30,5,0);
  const deck=tfcHull(m,-0.20,2.05,11.4,6.80,1.25,0.75);                   // deck ~4.05
  tfcProw(m,5.00,2.05,0,2.40,1.75,5.40);
  for(const sd of [-1,1]){
    /* Capacitor bank: the sniper role has to stay readable when the weapon is
       tracking away from the camera, and this is the part that says it. */
    m.cyl(-3.30,deck,sd*2.05,0.68,0.68,2.10,8,TWR_MACH);
    m.ring(-3.30,deck+2.10,sd*2.05,0.70,0.92,8,ENERGY);
    m.box(-3.30,deck+0.90,sd*2.05,0.32,0.30,1.55,TEAM_T);
    m.box(-5.20,1.10,sd*3.30,1.20,1.20,0.90,MET_D);                       // stabiliser jack
    m.cyl(-5.20,0.30,sd*3.30,0.60,0.52,0.85,7,MET_L);
    kitBox(m,1.90,deck,sd*2.45,2.00,0.85,1.20,MET_D,0);
  }
  tfcDeckGear(m,-0.20,deck,11.4,6.80);
  tfcExhaust(m,-4.90,2.90,1.80,1,0.42);
  tfcHatch(m,3.00,deck,-1.95,0.70,MET_D);
  sensorMast(m,-4.20,deck,1.90,2.10,MET_L);

  const t=MB();
  tfcRing(t,-0.50,2.40,0.85);
  t.extrude(0,0,0,[[-3.00,-2.30],[1.10,-2.55],[2.30,-1.30],[2.30,1.30],
            [1.10,2.55],[-3.00,2.30]],2.00,MET);
  t.bevelBox(-2.30,2.00,0,2.00,0.85,4.10,0.28,MET_L);
  for(const sd of [-1,1]){
    t.bevelBox(-0.80,1.70,sd*2.10,3.60,1.10,0.40,0.15,sd>0?TEAM_A:TEAM_B);
    hydraulic(t,-1.60,0.60,sd*1.55,1.90,0.24,TWR_MACH,0);
  }
  /* THE LANCE. A slim rail with four accelerator collars stepping down its
     length — the taper is what makes 12 units of barrel read as a weapon
     rather than as a pipe someone left on the deck. */
  t.bevelBox(1.80,2.00,0,3.20,1.10,2.00,0.28,MET_D);                      // breech housing
  cylX(t,2.60,2.45,0,11.60,0.44,0.34,8,TWR_MACH,false);
  for(let k=0;k<4;k++) ringX(t,4.10+k*2.55,2.45,0,0.48,0.78-k*0.05,9,k===3?ENERGY:MET_L);
  tubeX(t,14.10,2.45,0,0.52,0.40,0.19,8,TWR_BORE);
  for(const sd of [-1,1]) cylX(t,2.90,1.55,sd*0.95,8.20,0.20,0.17,6,MET_D,false);  // rails
  t.box(-2.60,2.90,0,1.30,0.18,2.30,TEAM_T);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:4.15};
}

/* ---------------------------------------------------------------------------
   7 — HORNET / 20 — REAPER / 21 — CINDER / 27 — HARBINGER.
   Four slots, one doctrinal object: a BOX OF TUBES on an elevating cradle.
   Ranges 175 / 120 / 96 / 210 and splash 24 / 52 / 46 / 60 — every one of them
   throws area fire out of open tubes, and the sim already tells them apart on
   screen because `size` runs 16 / 19 / 17 / 24, so the Harbinger draws half
   again as large as the Hornet from the same mesh.
   The cradle elevates and the tubes are genuinely open: a closed box reads as
   cargo, and this roster has already made that mistake once.
   --------------------------------------------------------------------------- */
function mdlTfcLauncher(){
  const m=MB();
  tfcTracks(m,12.0,3.00,2.55,3.40,5,1);
  const deck=tfcHull(m,-0.20,2.10,11.8,7.60,1.35,0.80);                   // deck ~4.25
  tfcProw(m,5.10,2.10,0,2.50,1.85,6.10);
  for(const sd of [-1,1]){
    kitBox(m,-3.20,deck,sd*2.70,2.60,0.95,1.40,MET_D,0);                  // reload lockers
    m.box(1.60,deck+0.02,sd*3.20,4.40,0.16,0.70,MET_L);                   // deck walkway
    m.cyl(4.60,deck-0.20,sd*2.60,0.28,0.24,1.00,6,MET_L);                 // tie-down
  }
  tfcDeckGear(m,-0.20,deck,11.8,7.60);
  tfcExhaust(m,-5.20,3.00,1.95,1,0.44);
  tfcHatch(m,3.20,deck,-2.20,0.72,MET_D);
  sensorMast(m,-4.40,deck,2.00,2.20,MET_L);
  tfcStow(m,-1.40,deck,3.10,2.80,1.00,53);

  const t=MB();
  tfcRing(t,-0.60,2.70,0.90);
  t.extrude(0,0,0,[[-3.10,-2.90],[1.20,-3.20],[2.50,-1.80],[2.50,1.80],
            [1.20,3.20],[-3.10,2.90]],1.60,MET);
  /* CRADLE: a trapezoid body with cheek plates at each end and rams under it,
     pitched up so the rack reads as elevated rather than as a lid. */
  t.extrude(-0.40,1.60,0,[[-3.00,-2.60],[2.40,-2.20],[3.00,-1.10],[3.00,1.10],
            [2.40,2.20],[-3.00,2.60]],1.90,MET_L);
  for(const sd of [-1,1]){
    t.bevelBox(-0.40,1.60,sd*2.55,5.60,2.00,0.50,0.20,sd>0?TEAM_A:TEAM_B);// cheek livery
    hydraulic(t,-2.20,0.70,sd*1.70,2.10,0.28,TWR_MACH,0);
  }
  t.box(-3.20,1.80,0,0.90,2.20,4.60,MET_D);                               // backplate
  /* Six open tubes in two rows, each with a muzzle collar. */
  for(let row=0;row<2;row++) for(let col=-1;col<=1;col++){
    const y=2.90+row*1.45, z=col*1.65;
    cylX(t,-2.60,y,z,5.60,0.62,0.58,7,TWR_MACH,false);
    ringX(t,2.90,y,z,0.60,0.80,8,MET_L);
    tubeX(t,2.94,y,z,0.62,0.66,0.35,8,TWR_BORE);
  }
  /* The rack's livery is a spine BETWEEN the two rows of tubes, not a lid over
     them. The first pass floated a wide plate above the rack and from directly
     overhead it covered every muzzle — a launcher with no visible tubes is a
     cargo truck. */
  t.box(-0.20,3.56,0,5.20,0.20,0.70,TEAM_T);
  for(const sd of [-1,1]) t.box(-0.20,3.56,sd*2.55,5.20,0.20,0.60,sd>0?TEAM_A:TEAM_B);
  t.bevelBox(-3.40,3.10,0,1.30,2.60,3.80,0.30,MET_D);                     // reload gantry
  return {hull:m.build(),tur:t.build(),s:1.0,turH:4.35};
}

/* ---------------------------------------------------------------------------
   18 — SCORCHER.  Armoured flame tank, hp 640 / dmg 13 / rng 80, aoe 38.
   The design language the players already know is "two big pressure vessels on
   the deck", and it stays — but Frontline plumbing is BANDED, VALVED and
   painted, not a pair of rusty drums. The heat shield over the projector and
   the flash at the lip are the only emissive on it.
   --------------------------------------------------------------------------- */
function mdlTfcFlameTank(){
  const m=MB();
  tfcTracks(m,14.0,3.60,2.95,3.95,6,1);
  const deck=tfcHull(m,-0.20,2.45,13.4,8.40,1.70,1.00);                   // deck ~5.15
  tfcProw(m,5.70,2.45,0,2.90,2.20,6.70);
  for(const sd of [-1,1]){
    /* Pressure vessel: a banded cylinder lying fore-aft with proper end caps
       and a valve stack, cradled on the deck. */
    cylX(m,-6.00,deck+1.70,sd*2.60,4.80,1.70,1.70,8,MET,false);           // vessel body
    cylX(m,-6.45,deck+1.70,sd*2.60,0.45,1.35,1.72,8,MET_D,true);          // rear dome
    cylX(m,-1.20,deck+1.70,sd*2.60,0.45,1.72,1.35,8,MET_D,true);          // front dome
    for(let k=0;k<2;k++) cylX(m,-4.90+k*2.20,deck+1.70,sd*2.60,0.26,1.76,1.76,8,MET_L,false);
    m.box(-3.60,deck+3.40,sd*2.60,3.60,0.20,0.85,sd>0?TEAM_A:TEAM_B);     // vessel livery
    m.bevelBox(-3.60,deck-0.10,sd*2.60,5.40,0.95,1.50,0.22,MET_D);        // cradle
    m.cyl(-1.20,deck+2.90,sd*2.60,0.34,0.28,0.90,6,TWR_MACH);             // valve
    cylX(m,-0.10,deck+1.10,sd*1.75,4.20,0.22,0.20,6,DARKER,false);        // feed line
  }
  tfcDeckGear(m,-0.20,deck,13.4,8.40);
  tfcExhaust(m,-6.90,3.60,2.40,1,0.48);
  tfcSeam(m,3.00,deck+0.02,0,2.60,3.00,MET_L,0);
  tfcHatch(m,3.60,deck,-2.50,0.78,MET_D);

  const t=MB();
  tfcRing(t,-0.60,2.85,0.95);
  tfcTurret(t,6.40,5.80,2.70,-2.20);
  t.box(2.70,0.80,0,1.10,1.90,2.80,TWR_MACH);                             // mantlet
  /* One heavy projector rather than two thin ones: the Scorcher is the tank
     version of the Pyro, so the nozzle should read at the same weight class. */
  cylX(t,2.20,1.55,0,4.60,0.86,0.76,9,TWR_MACH,false);
  for(const x of [3.40,5.40]) ringX(t,x,1.55,0,0.80,1.06,9,MET_L);
  cylX(t,6.70,1.55,0,1.30,1.06,1.40,9,MET_D,false);                       // flare
  tubeX(t,7.60,1.55,0,1.05,1.42,0.74,9,TWR_BORE);
  t.sphere(8.30,1.55,0,0.36,6,HOT,1,false);                               // pilot flame
  t.wedge(4.60,2.60,0,2.60,0.70,3.00,MET_L,Math.PI/2,true);               // heat shield
  return {hull:m.build(),tur:t.build(),s:1.0,turH:5.25};
}

/* ---------------------------------------------------------------------------
   11 — BULWARK.  Mobile shield, hp 950, dmg 0 — UNARMED.
   TYPES says dmg:0, so this carries no barrel of any kind. It is the toughest
   thing in a Frontline column and the game's copy says it walks in front of
   the advance and absorbs the volley, so it is built as a heavy chassis whose
   whole deck is one enormous emitter: four folding masts around a generator
   drum with a low field disc between them. The disc lies flat, which is the
   only orientation an overhead camera can read.
   --------------------------------------------------------------------------- */
function mdlTfcShield(){
  const m=MB();
  tfcTracks(m,13.2,3.60,2.90,3.95,5,2);
  const deck=tfcHull(m,-0.20,2.40,12.8,8.80,1.90,1.10);                   // deck ~5.40
  tfcProw(m,5.50,2.40,0,2.80,2.30,7.00);
  for(const sd of [-1,1]){
    armorPlate(m,0.20,2.40,sd*5.10,10.40,2.00,0.46,0,MET_D,0);            // heavy skirt
    m.box(-0.30,deck+0.02,sd*3.60,7.20,0.18,0.74,sd>0?TEAM_A:TEAM_B);     // deck livery
    kitBox(m,-4.20,deck,sd*2.40,2.40,0.90,1.40,MET_D,0);
  }
  tfcDeckGear(m,-0.20,deck,12.8,8.80);
  tfcExhaust(m,-6.20,3.50,2.30,1,0.50);
  tfcHatch(m,3.60,deck,-2.60,0.80,MET_D);
  /* GENERATOR DRUM — chamfered, ribbed, obviously a machine and not a barrel. */
  chamferCyl(m,-0.40,deck,0,2.70,2.60,10,MET,MET_L,0);
  for(let k=0;k<6;k++){
    const a=k/6*TAU;
    m.box(-0.40+Math.cos(a)*2.70,deck+0.40,Math.sin(a)*2.70,0.90,1.80,0.34,MET_D,a);
  }
  m.cyl(-0.40,deck+2.60,0,2.20,1.60,0.60,10,TEAM_T);                      // drum cap livery
  /* FOUR FOLDING EMITTER MASTS, raked outward and standing PROUD of the field
     ring. The first pass buried them under a fat torus and the whole vehicle
     read as a doughnut: the mechanism has to be the thing you see and the field
     has to be the thin bright line it projects. */
  for(const sd of [-1,1]) for(const f of [-1,1]){
    const x=-0.40+f*3.40, z=sd*3.30;
    m.bevelBox(x,deck,z,1.60,0.95,1.60,0.28,MET_D);
    m.cyl(x,deck+0.95,z,0.48,0.38,3.80,7,TWR_MACH);
    m.box(x,deck+2.20,z,0.90,0.20,0.90,sd*f>0?TEAM_A:TEAM_B);             // mast collar
    m.cyl(x,deck+4.75,z,1.05,0.26,0.38,8,MET_L);                          // emitter dish
    m.cyl(x,deck+4.85,z,0.36,0.28,0.42,6,ENERGY);
  }
  /* The FIELD: one thin ring at mast-head height. A solid dome costs 112
     triangles and hides the vehicle under it. */
  m.ring(-0.40,deck+3.90,0,3.30,3.90,14,ENERGY);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ---------------------------------------------------------------------------
   19 — CONSTRUCTOR.  Engineer, hp 220, dmg 0 — UNARMED.
   The only unarmed thing a player drives around a battle, so it has to read as
   PLANT rather than as a tank with the gun removed: a wheeled works chassis, a
   flat load bed with cargo strapped to it, a two-stage telescopic boom with a
   fabricator head, hazard chevrons and a rotating amber beacon.
   Kept WHEELED. TYPES carries legs:1 on this slot, but the design language the
   player already knows is a works truck, and wheels plus a SERVO walk cycle is
   the worst of both — the flag stays unused here exactly as it was.
   Tier 1, so it is on the 1,400 budget: the wheels are built from a tyre, a
   rim face and a hub rather than through wheelAsm(), which costs 264 apiece.
   --------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
   23 — RESONATOR. Shield-piercing sonic armor, hp 340 / rng 130.
   This was the final ordinary Blue ground-combat slot still falling through
   to the shared roster. A long cannon would lie about the weapon: the unit
   projects a coupled pressure wave. Twin forward waveguides, three stepped
   tuning collars and a visible capacitor spine make the role readable without
   borrowing the Longbow's silhouette.
   --------------------------------------------------------------------------- */
function mdlTfcResonator(){
  const m=MB();
  tfcTracks(m,12.2,3.15,2.55,3.55,5,1);
  const deck=tfcHull(m,-0.35,2.15,11.8,7.35,1.55,0.95);                 // deck ~4.65
  tfcProw(m,5.05,2.15,0,2.55,1.95,5.80);
  tfcDeckGear(m,-1.20,deck,9.60,6.45);
  tfcExhaust(m,-5.50,3.00,2.00,1,0.42);
  for(const sd of [-1,1]){
    m.box(-0.55,deck+0.02,sd*3.05,6.70,0.17,0.62,sd>0?TEAM_A:TEAM_B);   // family livery
    m.bevelBox(-2.85,deck+0.18,sd*2.05,2.60,1.25,1.25,0.26,MET_D);      // capacitor bank
    m.box(-2.85,deck+1.44,sd*2.05,1.70,0.13,0.72,ENERGY);               // charge indicator
    m.cyl(1.10,deck+0.30,sd*2.20,0.36,0.30,1.10,7,MET_L);               // waveguide pivot
    /* The guide is a real dark-bore tube, not a solid neon rod. Its three
       collars widen toward the muzzle like an acoustic horn. */
    cylX(m,1.10,deck+1.45,sd*1.58,5.15,0.52,0.44,9,TWR_MACH,false);
    for(let k=0;k<3;k++){
      const x=2.20+k*1.45, r=0.66+k*0.13;
      ringX(m,x,deck+1.45,sd*1.58,r*0.72,r,10,k===2?ENERGY:MET_L);
    }
    tubeX(m,6.15,deck+1.45,sd*1.58,0.82,1.02,0.55,11,TWR_BORE);
  }
  /* Central phase spine links both guides. Thin energy surfaces are accents;
     the physical dark housing remains most of the visible volume. */
  m.bevelBox(0.10,deck+0.20,0,6.10,1.30,1.10,0.25,NOVA_CARB);
  m.box(0.10,deck+1.52,0,4.90,0.16,0.50,NOVA_MET);
  for(const x of [-1.50,0.10,1.70]){
    m.ring(x,deck+2.05,0,0.58,0.92,10,ENERGY);
    m.sphere(x,deck+2.05,0,0.34,7,ENERGY,1,false);
  }
  tfcHatch(m,-3.95,deck,-2.25,0.72,MET_D);
  sensorMast(m,-4.45,deck,2.10,2.20,MET_L);
  return {hull:m.build(),tur:null,s:1.0};
}

function tfcWheel(m,x,y,z,r,w){
  const sd=z>=0?1:-1;
  tfcCylZ(m,x,y,z-sd*w*0.5,w,r,r,7,TREAD,true);                           // tyre
  tfcCylZ(m,x,y,z+sd*w*0.46,w*0.16,r*0.60,r*0.56,7,MET_L,true);           // rim face
  tfcCylZ(m,x,y,z+sd*w*0.58,w*0.14,r*0.22,r*0.18,6,MET_D,true);           // hub cap
  return m;
}
function mdlTfcEngineer(){
  const m=MB();
  m.bevelBox(0,1.90,0,8.40,2.20,4.60,0.40,MET);                           // chassis rail
  glacisX(m,3.90,4.10,0,2.20,0.90,4.20,MET_L);                            // sloped nose
  for(const sd of [-1,1]){
    for(const fx of [2.60,-2.60]){
      tfcWheel(m,fx,1.50,sd*2.95,1.45,1.35);
      /* The arch spans the wheel FORE-AFT and is narrower than the tyre, so the
         outer face of the wheel still shows from directly above. A raw wedge
         ramps across its third axis, and that is exactly what put the first
         pass's arches across the vehicle instead of over the tyres — where
         they then read as four black blocks with no wheel visible at all. */
      m.box(fx,3.00,sd*2.55,3.30,0.36,1.10,MET);
      m.box(fx,2.30,sd*2.05,3.30,0.80,0.22,MET_D);
    }
    m.bevelBox(0.60,4.75,sd*1.85,3.20,0.95,0.85,0.20,sd>0?TEAM_A:TEAM_B); // side livery
    m.box(-1.40,4.50,sd*2.15,5.00,0.46,0.20,MET_L);                       // bed rail
  }
  /* LOAD BED: a recessed inner extrusion with a lip is what makes a flatbed
     read as a bed rather than as the top of a box. */
  const BB=[[-4.00,-2.10],[1.00,-2.10],[1.00,2.10],[-4.00,2.10]];
  m.extrude(0,4.10,0,BB,0.30,MET_D);
  m.extrude(0,4.40,0,BB.map(q=>[q[0]*0.90,q[1]*0.84]),0.18,DARKER);
  tfcStow(m,-2.20,4.58,0.50,3.00,1.10,41);
  kitBox(m,-3.30,4.58,-1.20,1.40,0.80,1.40,MET_D,0);
  /* TELESCOPIC BOOM. Two stages on a real diagonal, with the upper stage
     stepped in — the step is what says telescopic, and the diagonal is what
     says boom rather than shelf. */
  m.bevelBox(-1.00,4.58,0,2.00,1.60,2.20,0.30,MET_D);                     // turntable
  m.cyl(-1.00,6.18,0,0.80,0.70,0.50,8,MET_L);
  tfcStrut(m,[-1.00,6.50,0],[2.90,8.60,0],0.46,MET_L);                    // lower stage
  tfcStrut(m,[2.60,8.44,0],[6.10,9.90,0],0.32,MET_D);                     // upper stage
  m.bevelBox(6.20,9.55,0,1.20,0.90,1.00,0.22,MET_D);                      // head housing
  cylX(m,6.80,10.00,0,0.80,0.40,0.28,8,ENERGY,false);                     // fabricator head
  tfcStrut(m,[-0.20,4.90,0],[2.40,7.90,0],0.22,MET_D);                    // lift ram
  tfcStrut(m,[2.20,8.30,0.55],[2.20,8.30,-0.55],0.30,MET_L);              // stage pivot
  tfcChevrons(m,-1.40,4.60,0,4,3.00,3.20);
  /* CAB. An engineer with a cab is a machine somebody drives; the old model had
     a bare box for a nose and read as a remote hull. */
  m.bevelBox(3.00,4.10,0,2.00,1.80,3.40,0.32,MET);
  m.box(3.95,5.05,0,0.32,0.95,2.60,GLASS);                                // windscreen
  m.box(3.00,5.90,0,1.70,0.20,2.80,TEAM_T);                               // cab roof livery
  m.box(2.30,5.95,1.30,0.70,0.22,0.55,LAMP);                              // work light
  m.cyl(-3.85,4.60,1.60,0.22,0.17,1.60,6,DARKER);
  m.cyl(-3.85,6.20,1.60,0.36,0.30,0.38,7,LAMP);                           // rotating beacon
  for(const sd of [-1,1]) tfcTow(m,-4.30,2.20,sd*1.50,0);
  deckCrown(m,-1.50,4.60,0,6.40,4.20,MET_D,TEAM_T);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ---------------------------------------------------------------------------
   32 — PROSPECTOR.  Mobile miner, hp 190, dmg 0 — UNARMED.
   This slot had no model of its own at all: UNIT_MDL only ever ran to 31
   entries, and src/airlift.js patches slot 32 to mdlConstructor at load, so
   for the Frontline Command the miner and the engineer were the SAME VEHICLE.
   Two units in the same production tab with one silhouette is the worst
   readability failure in the roster, and it is invisible in every gate because
   nothing crashed.
   Same works-vehicle family as the engineer — unity is the doctrine — but
   TRACKED rather than wheeled, with a front drill head and an ore bin with a
   raised hopper lip, so the two tell apart instantly at 60 pixels.
   --------------------------------------------------------------------------- */
function mdlTfcMiner(){
  const m=MB();
  tfcTracks(m,10.4,2.60,2.20,3.00,4,0);
  const deck=tfcHull(m,-0.40,1.85,10.0,6.20,1.15,0.65);                   // deck ~3.65
  /* ORE BIN: an open hopper with a raised lip and a discharge chute at the
     back. An open container is the whole read for a hauler. */
  const BN=[[-4.30,-2.50],[0.60,-2.50],[0.60,2.50],[-4.30,2.50]];
  m.extrude(-0.20,deck,0,BN,1.90,MET_D);
  m.extrude(-0.20,deck+0.35,0,BN.map(q=>[q[0]*0.86,q[1]*0.82]),1.60,DARKER);
  for(const sd of [-1,1]){
    m.box(-2.05,deck+1.95,sd*2.30,4.90,0.24,0.60,sd>0?TEAM_A:TEAM_B);     // hopper lip livery
    m.cyl(1.10,deck+0.30,sd*2.10,0.26,0.22,0.95,6,MET_L);                 // tie-down
    m.box(-1.20,deck-0.10,sd*3.00,3.60,0.16,0.62,MET_L);
  }
  m.wedge(-5.00,deck+0.30,0,1.60,1.10,4.20,MET_L,Math.PI/2);              // discharge chute
  /* DRILL: a boom carrying a toothed conical bit, raised clear of the hull and
     reaching well past the nose. The first pass tucked a small bit against the
     glacis and from overhead the Prospector still read as "some works vehicle"
     — which is exactly the confusion with the Constructor this rebuild exists
     to end. It is now the largest single feature on the model. */
  m.bevelBox(2.40,deck+0.10,0,2.60,2.00,3.40,0.36,MET_D);                 // boom pivot
  tfcStrut(m,[2.00,deck+1.40,0],[4.80,deck+2.30,0],0.62,MET_L);           // boom arm
  tfcStrut(m,[1.90,deck+0.30,0],[3.90,deck+2.00,0],0.24,MET_D);           // boom ram
  cylX(m,5.00,deck+2.20,0,2.30,1.35,1.55,8,TWR_MACH,false);               // drill housing
  for(const x of [5.40,6.50]) ringX(m,x,deck+2.20,0,1.35,1.75,8,MET_L);
  m.box(5.80,deck+3.70,0,2.20,0.20,1.70,TEAM_T);                          // housing cap livery
  cylX(m,7.30,deck+2.20,0,2.70,1.50,0.20,8,MET_D,true);                   // conical bit
  for(let k=0;k<6;k++){
    const a=k/6*TAU+0.5;
    m.box(7.80,deck+2.20+Math.cos(a)*0.92,Math.sin(a)*0.92,1.90,0.28,0.28,MET_L,0);
  }
  cylX(m,7.10,deck+2.20,0,0.55,0.34,0.28,6,ENERGY,true);                  // cutting head
  tfcDeckGear(m,-0.60,deck+2.00,7.60,5.60);
  tfcExhaust(m,-4.60,2.60,1.60,1,0.38);
  tfcChevrons(m,-3.20,deck+2.02,0,3,2.00,3.00);
  m.cyl(1.40,deck+0.30,-2.30,0.22,0.17,1.55,6,DARKER);
  m.cyl(1.40,deck+1.85,-2.30,0.36,0.30,0.38,7,LAMP);                      // beacon
  m.box(2.70,deck+0.10,-1.90,1.10,0.55,0.90,GLASS);                       // cab vision block
  return {hull:m.build(),tur:null,s:1.0};
}

/* ---------------------------------------------------------------------------
   24 — WARDEN.  Field repair, hp 420, dmg 0 — UNARMED.
   A support vehicle has to read as a TOOL, not as a gun with the barrel taken
   off. The working end is the whole model: a hose reel with visibly spooled
   line, a folding gantry that reaches forward and DOWN over whatever is being
   worked on, and hazard chevrons where the overhead camera looks.
   --------------------------------------------------------------------------- */
function mdlTfcWarden(){
  const m=MB();
  tfcTracks(m,10.2,2.60,2.25,3.05,4,0);
  const deck=tfcHull(m,-0.20,1.90,10.0,6.00,1.20,0.70);                   // deck ~3.80
  tfcProw(m,4.30,1.90,0,2.10,1.60,4.80);
  for(const sd of [-1,1]){
    m.box(-0.80,deck+0.02,sd*2.55,5.20,0.16,0.66,sd>0?TEAM_A:TEAM_B);
    kitBox(m,1.60,deck,sd*2.00,1.80,0.80,1.10,MET_D,0);                   // medical lockers
  }
  /* HOSE REEL: two cheeks with a spooled drum between them reads as a reel at
     a glance; a bare cylinder does not. */
  for(const sd of [-1,1]) tfcCylZ(m,-2.20,deck+1.75,sd*1.75-(sd>0?0:0.36),0.36,1.70,1.70,9,MET_L,true);
  for(let k=0;k<4;k++)
    tfcCylZ(m,-2.20,deck+1.75,-1.42+k*0.72,0.62,1.38-k*0.05,1.38-k*0.05,7,DARKER,false);
  m.tube(-2.20,deck+3.40,0,0.95,0.62,0.34,8,ENERGY);                      // field emitter
  /* FOLDING GANTRY — forward and down over the casualty, which is the shape
     that says "working on something" rather than "aiming". */
  m.bevelBox(1.90,deck,0,1.60,1.80,1.90,0.30,MET_D);
  m.cyl(1.90,deck+1.80,0,0.38,0.34,1.35,6,MET_L);
  tfcStrut(m,[1.90,deck+2.40,0],[5.20,deck+4.10,0],0.36,MET_L);           // jib
  tfcStrut(m,[5.20,deck+4.10,0],[5.60,deck+1.60,0],0.28,MET_D);           // drop link
  tfcStrut(m,[2.20,deck+0.60,0],[4.20,deck+3.20,0],0.20,MET_D);           // lift ram
  m.cyl(5.60,deck+0.90,0,0.80,0.50,0.72,8,ENERGY);                        // repair emitter
  tfcChevrons(m,-0.40,deck+0.04,0,3,2.40,3.40);
  tfcDeckGear(m,-0.20,deck,10.0,6.00);
  tfcExhaust(m,-4.60,2.60,1.55,1,0.36);
  m.cyl(3.30,deck,-2.00,0.22,0.17,1.45,6,DARKER);
  m.cyl(3.30,deck+1.45,-2.00,0.34,0.28,0.36,7,LAMP);                      // beacon
  m.box(-4.30,deck+0.60,0,1.20,0.20,2.20,TEAM_T);
  return {hull:m.build(),tur:null,s:0.95};
}

/* ---------------------------------------------------------------------------
   26 — BASILISK.  Experimental heavy, hp 1100 / dmg 120 / rng 190.
   Tier 3 at 260 mass, and its hull used to be five primitive calls — a quarter
   of the surface break-up of a tier-2 costing a quarter as much. This is the
   largest tracked vehicle the Command fields and everything about it is the
   Goliath's turret argument taken one weight class further: heavy running
   gear, a two-tier hull deep enough to see from above, a full-length raked
   glacis, sponson blisters and a gun that visibly could not fit on anything
   smaller.
   --------------------------------------------------------------------------- */
function mdlTfcHeavy(){
  const m=MB();
  tfcTracks(m,16.4,4.40,3.50,4.70,6,2);
  const deck=tfcHull(m,-0.20,3.10,15.8,10.20,2.30,1.30);                  // deck ~6.70
  tfcProw(m,6.80,3.10,0,3.50,2.90,8.20);
  for(const sd of [-1,1]){
    m.bevelBox(3.20,deck-0.30,sd*3.90,4.80,1.50,2.10,0.32,MET_D);         // sponson blister
    m.box(0.40,deck+0.02,sd*4.20,8.60,0.20,0.86,sd>0?TEAM_A:TEAM_B);      // deck livery
    kitBox(m,-4.20,deck,sd*3.20,3.00,1.05,1.80,MET_D,0);
    m.cyl(6.40,deck-0.20,sd*3.00,0.32,0.28,1.15,6,MET_L);                 // lift point
    m.box(-2.20,deck+0.02,sd*2.20,5.20,0.16,0.62,MET_L);                  // walkway
  }
  tfcDeckGear(m,-0.20,deck,15.8,10.20);
  ventBank(m,-5.40,deck+0.02,3.30,3.20,2.60,4,MET_D,0);
  tfcExhaust(m,-7.10,4.20,2.80,2,0.52);
  tfcSeam(m,3.20,deck+0.02,0,3.20,3.60,MET_L,0);
  tfcHatch(m,4.40,deck,-3.00,0.86,MET_D);
  sensorMast(m,-6.00,deck,2.80,2.90,MET_L);
  tfcStow(m,-2.40,deck,3.90,3.60,1.20,29);

  const t=MB();
  tfcRing(t,-0.80,4.00,1.20);
  tfcTurret(t,9.20,7.80,3.80,-3.20);
  t.box(3.90,1.10,0,1.30,2.70,3.70,TWR_MACH);                             // mantlet
  gunX(t,4.00,2.30,11.40,0.86,TWR_MACH);
  cylX(t,3.10,2.30,0,3.10,1.42,1.16,10,MET_D,false);                      // recoil sleeve
  for(const x of [6.60,10.60]) ringX(t,x,2.30,0,0.96,1.26,10,x>10?HOT:MET_L);
  cylX(t,3.40,0.95,-2.70,3.40,0.30,0.26,6,TWR_MACH,false);                // coaxial
  tubeX(t,6.70,0.95,-2.70,0.44,0.38,0.18,7,TWR_BORE);
  tfcStow(t,-3.70,3.95,0,3.00,1.10,23);
  t.box(-3.70,3.95,0,2.40,0.18,3.40,TEAM_T);
  return {hull:m.build(),tur:t.build(),s:1.05,turH:6.85};
}

/* ---------------------------------------------------------------------------
   THE KIT.
   Eighteen slots from fourteen meshes; with the Rhino's existing bespoke
   chassis that is all twenty-six production slots the Frontline Command can
   field. Slots share a mesh only where the ROLES share a shape and the sim's
   `size` field draws them apart at instance time — the same pattern the
   Dominion kit uses for its two long guns and its two splash carriers.
   --------------------------------------------------------------------------- */
/* BLUE MATERIAL CONVERSION — production path, not the 32k showcase shader.
   The authored geometry predates faction-semantic materials and therefore
   still requests generic PLATE/GREEBLE/TWR_* ids. Rebinding those ids after
   construction gives the whole Blue kit its composite/carbon/actuator/circuit
   language while keeping every mesh, instance stream, draw call and UV intact.
   Bone fractions and the sign used by team-livery panels are preserved. */
const TFC_NOVA_MAT=Object.freeze({
  [MAT.PLATE]:MAT.NOVA_COMPOSITE,
  [MAT.GREEBLE]:MAT.NOVA_CARBON,
  [MAT.TREAD]:MAT.TREAD_WEAR,
  [MAT.GLASS]:MAT.HUD_CANOPY,
  [MAT.TWR_ARMOR]:MAT.NOVA_COMPOSITE,
  [MAT.TWR_MACH]:MAT.NOVA_SERVO,
  [MAT.TWR_COAT]:MAT.NOVA_CARBON,
  [MAT.TWR_GLOW]:MAT.NOVA_CIRCUIT,
  [MAT.TWR_PAD]:MAT.NOVA_CARBON,
  [MAT.SYN_CONDUIT]:MAT.NOVA_CIRCUIT
});
/* Stage N1/N2 bespoke semantic packs. These are deliberately per-asset
   surface contracts, not a claim that we have authored UV map sets. The live
   V2 shader still supplies the shared microdetail, AO and damage response;
   each contract only assigns the authored procedural parts to the appropriate
   armor/machinery/glass hierarchy until a named BaseAO/NRE/mask package is
   baked for that exact model. Keeping this data beside the unit kit prevents a
   faction-wide remap from making every Nova asset look like a Rhino. */
const TFC_NOVA_BESPOKE_PACKS=Object.freeze({
  0:Object.freeze({
    id:'nova-striker-v2', source:'authored', maps:'nova-striker-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.NOVA_COMPOSITE
    })
  }),
  1:Object.freeze({
    id:'nova-rhino-v2', source:'authored', maps:'nova-rhino-v2',
    surfaces:Object.freeze({
      [MAT.TWR_PAD]:MAT.NOVA_CARBON,
      /* Ribbed appliqué instead of the faction default. Every Nova chassis was
         pointed at NOVA_COMPOSITE for both PLATE and TWR_ARMOR, so the per-type
         remap existed but had nothing to say -- a Rhino and a Goliath wore the
         same armour tile at the same repeat frequency. Keys are RAW pre-remap
         ids, so this intercepts before TFC_NOVA_MAT reaches for the default. */
      [MAT.PLATE]:MAT.ARMR_RIB,
      [MAT.TWR_ARMOR]:MAT.ARMR_RIB
    })
  }),
  2:Object.freeze({
    id:'nova-goliath-v2', source:'authored', maps:'nova-goliath-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.NOVA_COMPOSITE
    })
  }),
  3:Object.freeze({
    id:'nova-thumper-v2', source:'authored', maps:'nova-thumper-v2',
    surfaces:Object.freeze({
      /* Open gun-mount rails and ready-rack framing stay carbon-dark, so the
         thin artillery tube reads against its carriage at RTS distance. */
      [MAT.TRIM]:MAT.NOVA_CARBON
    })
  }),
  4:Object.freeze({
    id:'nova-commander-v2', source:'authored', maps:'nova-commander-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.NOVA_COMPOSITE,
      [MAT.GLASS]:MAT.HUD_CANOPY
    })
  }),
  5:Object.freeze({
    id:'nova-wasp-v2', source:'authored', maps:'nova-wasp-v2',
    surfaces:Object.freeze({
      /* Formation lamps are navigation hardware, not cockpit/energy glow. */
      [MAT.LAMP]:MAT.UNIT_BEACON
    })
  }),
  6:Object.freeze({
    id:'nova-longbow-v2', source:'authored', maps:'nova-longbow-v2',
    surfaces:Object.freeze({
      /* Capacitor collars are a deliberate charged-weapon landmark rather
         than the general Nova circuit treatment used by ordinary machinery. */
      [MAT.TWR_GLOW]:MAT.CHARGE_STRIP
    })
  }),
  7:Object.freeze({
    id:'nova-hornet-v2', source:'authored', maps:'nova-hornet-v2',
    surfaces:Object.freeze({
      /* Hornet's common launcher chassis also drives Reaper/Cinder/Harbinger.
         The charged strip lives between tubes, leaving each bore physically
         dark at combat distance. */
      [MAT.TWR_GLOW]:MAT.CHARGE_STRIP,
      [MAT.TRIM]:MAT.NOVA_CARBON
    })
  }),
  8:Object.freeze({
    id:'nova-titan-v2', source:'authored', maps:'nova-titan-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.NOVA_COMPOSITE,
      [MAT.TWR_GLOW]:MAT.NOVA_CIRCUIT
    })
  }),
  9:Object.freeze({
    id:'nova-pyro-v2', source:'authored', maps:'nova-pyro-v2',
    surfaces:Object.freeze({
      /* Heat landmarks stay localized to the projector: blue machinery must
         not become a second emissive system across the infantry body. */
      [MAT.TWR_GLOW]:MAT.WEAPON_GLOW,
      [MAT.LAMP]:MAT.UNIT_BEACON
    })
  }),
  10:Object.freeze({
    id:'nova-vulture-v2', source:'authored', maps:'nova-vulture-v2',
    surfaces:Object.freeze({
      [MAT.TWR_GLOW]:MAT.CHARGE_STRIP,
      [MAT.LAMP]:MAT.UNIT_BEACON
    })
  }),
  11:Object.freeze({
    id:'nova-bulwark-v2', source:'authored', maps:'nova-bulwark-v2',
    surfaces:Object.freeze({
      /* Its field masts are hardware with a contained circuit signature, not
         a vehicle painted with the generic weapon-charge treatment. */
      [MAT.TWR_GLOW]:MAT.NOVA_CIRCUIT,
      [MAT.LAMP]:MAT.UNIT_BEACON
    })
  }),
  14:Object.freeze({
    id:'nova-corvette-v2', source:'authored', maps:'nova-corvette-v2',
    surfaces:Object.freeze({
      [MAT.GLASS]:MAT.HUD_CANOPY,
      [MAT.LAMP]:MAT.UNIT_BEACON,
      [MAT.TWR_GLOW]:MAT.NOVA_CIRCUIT
    })
  }),
  15:Object.freeze({
    id:'nova-dreadnought-v2', source:'authored', maps:'nova-dreadnought-v2',
    surfaces:Object.freeze({
      [MAT.GLASS]:MAT.HUD_CANOPY,
      [MAT.TRIM]:MAT.NOVA_CARBON,
      [MAT.TWR_GLOW]:MAT.CHARGE_STRIP
    })
  }),
  16:Object.freeze({
    id:'nova-bombard-v2', source:'authored', maps:'nova-bombard-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.NOVA_CARBON,
      [MAT.TWR_GLOW]:MAT.CHARGE_STRIP
    })
  }),
  17:Object.freeze({
    id:'nova-raptor-v2', source:'authored', maps:'nova-raptor-v2',
    surfaces:Object.freeze({
      [MAT.GLASS]:MAT.HUD_CANOPY,
      [MAT.LAMP]:MAT.UNIT_BEACON,
      [MAT.TWR_GLOW]:MAT.NOVA_CIRCUIT
    })
  }),
  18:Object.freeze({
    id:'nova-scorcher-v2', source:'authored', maps:'nova-scorcher-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.NOVA_COMPOSITE,
      [MAT.TWR_GLOW]:MAT.WEAPON_GLOW
    })
  }),
  19:Object.freeze({
    id:'nova-constructor-v2', source:'authored', maps:'nova-constructor-v2',
    surfaces:Object.freeze({
      [MAT.GLASS]:MAT.HUD_CANOPY,
      [MAT.LAMP]:MAT.UNIT_BEACON,
      [MAT.TWR_GLOW]:MAT.NOVA_CIRCUIT
    })
  }),
  20:Object.freeze({
    id:'nova-reaper-v2', source:'authored', maps:'nova-reaper-v2',
    surfaces:Object.freeze({})
  }),
  21:Object.freeze({
    id:'nova-cinder-v2', source:'authored', maps:'nova-cinder-v2',
    surfaces:Object.freeze({})
  }),
  22:Object.freeze({
    id:'nova-lancer-v2', source:'authored', maps:'nova-lancer-v2',
    surfaces:Object.freeze({})
  }),
  23:Object.freeze({
    id:'nova-resonator-v2', source:'authored', maps:'nova-resonator-v2',
    surfaces:Object.freeze({})
  }),
  24:Object.freeze({
    id:'nova-warden-v2', source:'authored', maps:'nova-warden-v2',
    surfaces:Object.freeze({})
  }),
  25:Object.freeze({
    id:'nova-kestrel-v2', source:'authored', maps:'nova-kestrel-v2',
    surfaces:Object.freeze({})
  }),
  26:Object.freeze({
    id:'nova-basilisk-v2', source:'authored', maps:'nova-basilisk-v2',
    surfaces:Object.freeze({})
  }),
  27:Object.freeze({
    id:'nova-harbinger-v2', source:'authored', maps:'nova-harbinger-v2',
    surfaces:Object.freeze({})
  }),
  32:Object.freeze({
    id:'nova-prospector-v2', source:'authored', maps:'nova-prospector-v2',
    surfaces:Object.freeze({})
  })
});
function tfcNovaSurfacePass(geo,pack){
  if(!geo||!geo.v)return geo;
  const v=geo.v;
  for(let o=11;o<v.length;o+=VFLOATS){
    const raw=v[o],sgn=raw<0?-1:1,packed=Math.abs(raw);
    const whole=Math.floor(packed),src=whole-1;
    const dst=pack&&pack.surfaces[src]!==undefined?pack.surfaces[src]:TFC_NOVA_MAT[src];
    if(dst!==undefined)v[o]=sgn*((dst+1)+(packed-whole));
  }
  return geo;
}
const TFC_NOVA_FACTORY_CACHE=new Map();
function tfcNovaFactory(fn,slot){
  if(TFC_NOVA_FACTORY_CACHE.has(fn))return TFC_NOVA_FACTORY_CACHE.get(fn);
  const wrapped=function(){
    const g=fn();
    const pack=TFC_NOVA_BESPOKE_PACKS[slot]||null;
    tfcNovaSurfacePass(g.hull,pack);tfcNovaSurfacePass(g.tur,pack);
    return g;
  };
  /* initFactionKits caches identical builders by name. Every wrapper therefore
     needs a stable unique name or the first Blue chassis would replace all of
     the others despite a completely clean JavaScript console. */
  Object.defineProperty(wrapped,'name',{value:'tfcBlue'+slot+'_'+fn.name});
  TFC_NOVA_FACTORY_CACHE.set(fn,wrapped);
  return wrapped;
}
const UNIT_MDL_NOVA={
  0 :tfcNovaFactory(mdlTfcTrooper,0),    // Striker      — line rifleman (SERVO legs)
  1 :tfcNovaFactory(mdlNovaRhino,1),     // Rhino        — energy-assisted battle tank
  2 :tfcNovaFactory(mdlTfcWalker,2),     // Goliath      — assault walker (SERVO legs)
  3 :tfcNovaFactory(mdlTfcArty,3),       // Thumper      — field artillery, deployed spades
  4 :tfcNovaFactory(mdlCommander,4),     // Commander    — Nova-exclusive command chassis
  5 :tfcNovaFactory(mdlWasp,5),          // Wasp         — clean VTOL interceptor
  6 :tfcNovaFactory(mdlTfcLance,6),      // Longbow      — precision long gun
  7 :tfcNovaFactory(mdlTfcLauncher,7),   // Hornet       — box launcher
  8 :tfcNovaFactory(mdlTitan,8),         // TITAN        — clean-tech walking fortress
  9 :tfcNovaFactory(mdlTfcFlamer,9),     // Pyro         — flame trooper (SERVO legs)
  10:tfcNovaFactory(mdlTfcAA,10),        // Vulture      — anti-air, air targets only
  11:tfcNovaFactory(mdlTfcShield,11),    // Bulwark      — shield generator, UNARMED
  14:tfcNovaFactory(mdlCorvette,14),     // Corvette     — fast energy-fleet escort
  15:tfcNovaFactory(mdlDread,15),        // Dreadnought  — blue-water capital battery
  16:tfcNovaFactory(mdlTfcSiege,16),     // Bombard      — siege platform, longest reach
  17:tfcNovaFactory(mdlRaptor,17),       // Raptor       — armoured close-air gunship
  18:tfcNovaFactory(mdlTfcFlameTank,18), // Scorcher     — armoured flame tank
  19:tfcNovaFactory(mdlTfcEngineer,19),  // Constructor  — engineer, UNARMED
  20:tfcNovaFactory(mdlTfcLauncher,20),  // Reaper       — saturation launcher
  21:tfcNovaFactory(mdlTfcLauncher,21),  // Cinder       — close-support launcher
  22:tfcNovaFactory(mdlTfcLance,22),     // Lancer       — gauss lance
  23:tfcNovaFactory(mdlTfcResonator,23), // Resonator    — paired sonic waveguides
  24:tfcNovaFactory(mdlTfcWarden,24),    // Warden       — field repair, UNARMED
  25:tfcNovaFactory(mdlKestrel,25),      // Kestrel      — thin delta reconnaissance craft
  26:tfcNovaFactory(mdlTfcHeavy,26),     // Basilisk     — experimental heavy
  27:tfcNovaFactory(mdlTfcLauncher,27),  // Harbinger    — siege battery
  32:tfcNovaFactory(mdlTfcMiner,32),     // Prospector   — ore miner, UNARMED
};

const TFC_NOVA_BLD_BESPOKE_PACKS=Object.freeze({
  'mex':Object.freeze({id:'nova-mex-v2', source:'authored', maps:'nova-mex-v2', surfaces:Object.freeze({})}),
  'pgen':Object.freeze({id:'nova-pgen-v2', source:'authored', maps:'nova-pgen-v2', surfaces:Object.freeze({})}),
  'fac':Object.freeze({id:'nova-fac-v2', source:'authored', maps:'nova-fac-v2', surfaces:Object.freeze({})}),
  'turret':Object.freeze({id:'nova-turret-v2', source:'authored', maps:'nova-turret-v2', surfaces:Object.freeze({})}),
  'bunker':Object.freeze({id:'nova-bunker-v2', source:'authored', maps:'nova-bunker-v2', surfaces:Object.freeze({})}),
  'sgen':Object.freeze({id:'nova-sgen-v2', source:'authored', maps:'nova-sgen-v2', surfaces:Object.freeze({})}),
  'tgate':Object.freeze({id:'nova-tgate-v2', source:'authored', maps:'nova-tgate-v2', surfaces:Object.freeze({})}),
  'harbor':Object.freeze({id:'nova-harbor-v2', source:'authored', maps:'nova-harbor-v2', surfaces:Object.freeze({})}),
  'seafort':Object.freeze({id:'nova-seafort-v2', source:'authored', maps:'nova-seafort-v2', surfaces:Object.freeze({})}),
  'bastion':Object.freeze({id:'nova-bastion-v2', source:'authored', maps:'nova-bastion-v2', surfaces:Object.freeze({})}),
  'techlab':Object.freeze({id:'nova-techlab-v2', source:'authored', maps:'nova-techlab-v2', surfaces:Object.freeze({})}),
  'aatower':Object.freeze({id:'nova-aatower-v2', source:'authored', maps:'nova-aatower-v2', surfaces:Object.freeze({})}),
  'airfield':Object.freeze({id:'nova-airfield-v2', source:'authored', maps:'nova-airfield-v2', surfaces:Object.freeze({})}),
  'uplink':Object.freeze({id:'nova-uplink-v2', source:'authored', maps:'nova-uplink-v2', surfaces:Object.freeze({})}),
  'hq':Object.freeze({id:'nova-hq-v2', source:'authored', maps:'nova-hq-v2', surfaces:Object.freeze({})}),
  'hellstorm':Object.freeze({id:'nova-hellstorm-v2', source:'authored', maps:'nova-hellstorm-v2', surfaces:Object.freeze({})}),
  'arc':Object.freeze({id:'nova-arc-v2', source:'authored', maps:'nova-arc-v2', surfaces:Object.freeze({})}),
  'rail':Object.freeze({id:'nova-rail-v2', source:'authored', maps:'nova-rail-v2', surfaces:Object.freeze({})}),
  'nova':Object.freeze({id:'nova-nova-v2', source:'authored', maps:'nova-nova-v2', surfaces:Object.freeze({})}),
  'minelaser':Object.freeze({id:'nova-minelaser-v2', source:'authored', maps:'nova-minelaser-v2', surfaces:Object.freeze({})}),
  'missilebastion':Object.freeze({id:'nova-missilebastion-v2', source:'authored', maps:'nova-missilebastion-v2', surfaces:Object.freeze({})}),
  'plasma':Object.freeze({id:'nova-plasma-v2', source:'authored', maps:'nova-plasma-v2', surfaces:Object.freeze({})}),
  'wall':Object.freeze({id:'nova-wall-v2', source:'authored', maps:'nova-wall-v2', surfaces:Object.freeze({})}),
  'gate':Object.freeze({id:'nova-gate-v2', source:'authored', maps:'nova-gate-v2', surfaces:Object.freeze({})}),
  'geo':Object.freeze({id:'world-geo-v2', source:'authored', maps:'world-geo-v2', surfaces:Object.freeze({})}),
  'silo':Object.freeze({id:'world-silo-v2', source:'authored', maps:'world-silo-v2', surfaces:Object.freeze({})}),
  'fab':Object.freeze({id:'world-fab-v2', source:'authored', maps:'world-fab-v2', surfaces:Object.freeze({})})
});

function tfcNovaBldFactory(fn, k) {
  if (!fn) return fn;
  const wrapped = function(...args) {
    const g = fn(...args);
    const pack = TFC_NOVA_BLD_BESPOKE_PACKS[k] || null;
    return tfcNovaSurfacePass(g, pack);
  };
  Object.defineProperty(wrapped, 'name', {value: 'tfcNovaBld_' + k});
  return wrapped;
}

for (const k in TFC_NOVA_BLD_BESPOKE_PACKS) {
  if (typeof BLD_MDL !== 'undefined' && BLD_MDL[k]) {
    BLD_MDL[k] = tfcNovaBldFactory(BLD_MDL[k], k);
  }
  if (typeof BLD_TUR_MDL !== 'undefined' && BLD_TUR_MDL[k]) {
    BLD_TUR_MDL[k] = tfcNovaBldFactory(BLD_TUR_MDL[k], k);
  }
  if (typeof BLD_TIER_MDL !== 'undefined' && BLD_TIER_MDL[k]) {
    const orig = BLD_TIER_MDL[k];
    BLD_TIER_MDL[k] = orig.map(V => ({
      base: tfcNovaBldFactory(V.base, k),
      tur: V.tur ? tfcNovaBldFactory(V.tur, k) : null
    }));
  }
}

