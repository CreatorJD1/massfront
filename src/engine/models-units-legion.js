;
;
/* ============================================================================
   CRIMSON DOMINION — UNIT CHASSIS KIT   (internal kit key `legion`)
   ----------------------------------------------------------------------------
   STRENGTH. AUTHORITY. CONQUEST.

   The Dominion does not build elegant machines. It builds SLABS OF MOVING
   IRON: a base hull, then a second skin of applique armour bolted over the top
   of it, then whatever heat hardware is needed to survive running that much
   mass. Every chassis in this file is assembled from the same short vocabulary
   so the army reads as one manufacturer long before the player reads a colour:

     - broad tracked runs with a bolted skirt over the whole length, and the
       livery band always in the same place on that skirt;
     - blunt, bolted prows — chamfered, never raked to a point;
     - exposed vertical heat stacks with an open glowing bore;
     - riveted seams on every large flat plate;
     - almost no glass. Crews look through slits.

   It should look like it was built to be REPLACED, not maintained.

   Contract, copied from mdlLegionRhino(): +X is forward (the direction the
   unit shoots), +Y is up, Z is lateral, tracks/keel sit at y=0, and a builder
   returns {hull, tur, s, turH}. Unturreted units return tur:null and no turH.

   MATERIALS ARE LOAD-BEARING. TEAM_A/TEAM_B/TEAM_T are the only surfaces that
   take the faction's livery — two to five panels per model, never the whole
   hull. SERVO marks a surface as a LEG and the vertex stage swings it through
   the walk cycle, so it appears ONLY on the walkers (Goliath, TITAN,
   Constructor) and only below their hips. HOT and ENERGY are emissive and are
   rationed to heat bores, muzzle collars and equipment cores.

   Names are prefixed dom/mdlDom because this repo is one global scope.
   ============================================================================ */

/* ---------------------------------------------------------------------------
   DOMINION DETAIL KIT
   --------------------------------------------------------------------------- */

/* Bolt heads along a seam. The single cheapest thing that makes a Dominion
   plate read as BOLTED ON rather than cast in — and it is what separates this
   faction's armour from Nova's welded monocoques at command-view zoom. */
function domRivets(m,x,y,z,len,n,col,yaw){
  const c=Math.cos(yaw||0), s=Math.sin(yaw||0), N=n||3;
  for(let k=0;k<N;k++){
    const t=N<2?0:(k/(N-1)-0.5), px=t*len;
    m.box(x+px*c,y,z+px*s,0.46,0.44,0.34,col||TWR_TRIM,yaw||0);
  }
  return m;
}

/* Exposed heat stack: shroud, riser, an actually hollow bore and a heat ring.
   Doctrine hardware — a Dominion vehicle vents straight up because nobody
   spent the mass on ducting it anywhere. */
function domStack(m,x,y,z,h,r){
  r=r||0.82;
  m.cyl(x,y,z,r*1.30,r*1.06,h*0.26,7,TWR_MACH);
  m.cyl(x,y+h*0.22,z,r,r*0.88,h*0.78,7,TWR_ARM_D);
  m.tube(x,y+h*0.94,z,r*0.92,r*0.50,h*0.16,7,TWR_BORE);
  m.ring(x,y+h*1.12,z,r*0.54,r*0.94,8,HOT);
  return m;
}

/* Blunt bolted prow. Deliberately NOT a raked point: the nose ends in a flat
   bolted face with a brow lip over it, which is the Dominion's whole argument
   with the Syndicate's raked skimmers.

   The wedge primitive slopes across its THIRD axis, so a wedge dropped in with
   yaw 0 ramps sideways and the "glacis" ends up a bright triangle running
   across the nose instead of a plate leaning away from the enemy. Yawing it a
   quarter turn and swapping the spans is what actually makes it a glacis;
   `len` is fore-aft and `wid` is lateral, which is how every call site here
   reads it. */
function domProw(m,x,y,z,len,h,wid){
  m.wedge(x,y,z,wid,h,len,TWR_ARM,Math.PI/2,false);
  m.box(x+len*0.34,y+h*0.10,z,len*0.34,h*0.56,wid*0.84,TWR_ARM_D);     // blunt bolted face
  m.box(x-len*0.16,y+h*0.90,z,len*0.46,0.28,wid*0.52,TWR_TRIM);        // brow lip
  domRivets(m,x+len*0.30,y+h*0.40,z,wid*0.66,3,TWR_TRIM,Math.PI/2);
  return m;
}

/* Track run with a BOLTED APPLIQUE SKIRT over the whole length, plus the
   livery band that lands in the same place on every Dominion chassis.
   cls 0/1/2 widens the run and adds a second plate tier, so weight class reads
   off the running gear alone before any other part of the model is legible. */
function domTracks(m,len,wid,h,gauge,n,cls){
  const K=cls==null?1:cls, W=wid*[0.86,1.0,1.24][K], N=n||5;
  for(const sd of [-1,1]){
    m.box(0,0,sd*gauge,len,h*0.88,W,TREAD);                            // track block
    m.box(0,h*0.32,sd*gauge,len*1.05,h*0.30,W*1.18,DARKER);            // links
    for(let k=0;k<N;k++)
      m.cyl(-len/2+len*(k+0.5)/N,h*0.44,sd*gauge,h*0.40,h*0.40,W*0.54,6,RUBBER);
    m.cyl( len*0.50,h*0.70,sd*gauge,h*0.38,h*0.38,W*0.56,8,TWR_MACH);  // drive sprocket
    m.cyl(-len*0.50,h*0.68,sd*gauge,h*0.34,h*0.34,W*0.56,8,TWR_MACH);  // idler
    const sz=sd*(gauge+W*0.50);
    m.box(0,h*0.86,sz,len*0.96,h*0.96,0.46,TWR_COAT);                  // applique skirt
    m.box(0,h*1.82,sz,len*0.96,0.26,0.68,TWR_ARM_D);                   // skirt lip
    domRivets(m,0,h*1.26,sd*(gauge+W*0.63),len*0.78,3,TWR_TRIM,0);
    m.box(-len*0.05,h*1.40,sz,len*0.54,0.28,0.64,sd>0?TEAM_A:TEAM_B);  // livery band
    if(K===2) m.box(len*0.24,h*1.06,sd*(gauge+W*0.66),len*0.34,h*0.62,0.34,TWR_COAT);
  }
  return m;
}

/* Two-tier Dominion hull: a wide lower casemate with a smaller bolted upper
   plate on top of it. Returns the deck height so callers can stack hardware
   without repeating the arithmetic. */
function domHullSlab(m,x,yBase,len,wid,hLow,hHigh){
  const L=len*0.5, W=wid*0.5;
  const prof=[[-L,-W*0.72],[-L*0.62,-W],[L*0.46,-W],[L,-W*0.56],
              [L,W*0.56],[L*0.46,W],[-L*0.62,W],[-L,W*0.72]];
  m.extrude(x,yBase,0,prof,hLow,TWR_ARM_D);
  m.extrude(x,yBase+hLow,0,prof.map(p=>[p[0]*0.86,p[1]*0.82]),hHigh,TWR_ARM);
  return yBase+hLow+hHigh;
}

/* One SERVO leg. Everything here is painted SERVO because the vertex stage
   swings SERVO geometry below hip height through the gait — mixing ordinary
   armour into a leg leaves those plates standing where the foot used to be.
   S scales the whole limb so the same anatomy serves a 450hp assault walker
   and a 16000hp fortress. */
function domLeg(m,z,S){
  m.bevelBox(-0.55*S,0,z,4.6*S,1.05*S,2.95*S,0.34*S,SERVO);            // planted foot
  m.box(1.55*S,0.22*S,z,1.25*S,0.62*S,2.45*S,SERVO);                   // reinforced toe
  m.box(-2.15*S,0.20*S,z,0.85*S,0.55*S,2.20*S,SERVO);                  // heel counterweight
  m.cyl(-0.45*S,1.05*S,z,0.96*S,0.80*S,0.66*S,8,SERVO);                // ankle bearing
  m.extrude(-0.25*S,1.65*S,z,[[-1.30*S,-1.20*S],[0.90*S,-1.20*S],[1.32*S,-0.52*S],
            [1.32*S,0.52*S],[0.90*S,1.20*S],[-1.30*S,1.20*S]],3.15*S,SERVO);
  m.bevelBox(-0.10*S,2.10*S,z,2.05*S,2.15*S,2.80*S,0.28*S,SERVO);      // shin armour mass
  hydraulic(m,-1.30*S,1.70*S,z,3.05*S,0.26*S,SERVO,0);                 // shin ram
  m.cyl(0.15*S,4.80*S,z,1.48*S,1.30*S,1.20*S,9,SERVO);                 // knee drum
  m.bevelBox(0.10*S,5.60*S,z,3.25*S,1.55*S,3.05*S,0.36*S,SERVO);       // thigh armour
  m.extrude(-0.10*S,6.55*S,z,[[-1.15*S,-1.15*S],[1.00*S,-1.15*S],[1.35*S,-0.52*S],
            [1.35*S,0.52*S],[1.00*S,1.15*S],[-1.15*S,1.15*S]],2.20*S,SERVO);
  m.box(-0.70*S,6.90*S,z*0.74,1.35*S,1.75*S,0.85*S,SERVO);             // inner hip brace
  return m;
}

/* Turret bearing: the pad ring every Dominion turret sits in. Kept separate
   because the ring is what stops a turret reading as a box balanced on a hull. */
function domRing(t,x,r,h){
  t.cyl(x,0,0,r,r*0.88,h||1.2,12,TWR_PAD);
  return t;
}

/* ---------------------------------------------------------------------------
   2 — GOLIATH.  Assault walker, hp 450 / dmg 42 / rng 104.
   The line tank's big brother is a WALKER in Dominion service: same blunt
   turret vocabulary as the Rhino, carried on two SERVO legs so it reads as an
   escalation of the same doctrine rather than a bigger box.
   --------------------------------------------------------------------------- */
function mdlDomWalker(){
  const m=MB();
  for(const sd of [-1,1]){
    domLeg(m,sd*4.15,1.02);
    m.bevelBox(0.15*1.02,4.35,sd*4.15,3.05,0.75,3.25,0.26,TWR_COAT);   // knee applique
    armorPlate(m,-0.20,2.30,sd*5.85,4.60,1.60,0.44,0,TWR_COAT,0);      // shin skirt
  }
  /* pelvis / hip bridge — the legs hang off this, so it is visibly a casting */
  m.extrude(0,9.10,0,[[-4.55,-4.30],[2.60,-4.75],[4.65,-2.55],[4.65,2.55],
            [2.60,4.75],[-4.55,4.30]],2.35,TWR_ARM_D);
  for(const sd of [-1,1]) armorPlate(m,0.10,9.35,sd*4.95,7.40,1.45,0.48,0,TWR_COAT,0);
  /* torso — lower casemate, bolted upper plate, blunt chest */
  m.extrude(0,11.45,0,[[-4.20,-3.95],[2.45,-4.35],[4.50,-2.30],[4.50,2.30],
            [2.45,4.35],[-4.20,3.95]],3.15,TWR_ARM);
  m.extrude(0.20,14.60,0,[[-3.45,-3.20],[2.10,-3.55],[3.75,-1.85],[3.75,1.85],
            [2.10,3.55],[-3.45,3.20]],0.95,TEAM_A);                    // shoulder deck livery
  domProw(m,3.75,11.65,0,3.30,2.90,7.10);                              // chest glacis
  m.bevelBox(0.90,15.55,0,4.90,1.05,6.30,0.38,TWR_ARM);                // collar armour
  domRivets(m,-2.60,15.62,0,5.30,4,TWR_TRIM,Math.PI/2);
  for(const sd of [-1,1]){
    m.bevelBox(0.35,12.05,sd*4.55,4.40,2.60,1.35,0.30,TWR_COAT);       // shoulder applique
    m.box(0.35,14.68,sd*4.72,3.10,0.26,0.62,sd>0?TEAM_A:HOT);          // livery / heat strip
    domStack(m,-3.55,14.55,sd*2.30,3.20,0.74);                         // twin heat stacks
    m.box(-4.30,11.90,sd*3.05,1.55,2.70,0.95,DARK);                    // torso grille
    for(let k=0;k<3;k++) m.box(-4.05,12.20+k*0.78,sd*3.55,1.10,0.30,0.30,TWR_TRIM);
  }
  ventBank(m,-3.10,15.62,0,2.90,5.40,5,TWR_MACH,0);
  m.bevelBox(-4.35,11.85,0,2.35,3.40,6.10,0.46,DARKER);                // reactor backpack
  m.greeble(-4.35,15.28,0,1.90,4.80,0.56,5,TWR_MACH,0,71);
  sensorMast(m,-2.05,15.70,2.35,2.20,TWR_TRIM);

  const t=MB();
  domRing(t,-0.90,3.55,1.20);
  t.bevelBox(-0.70,1.20,0,7.40,2.90,6.10,0.72,TWR_ARM_D);
  t.bevelBox(-0.35,4.10,0,6.40,0.95,5.10,0.32,TWR_ARM);
  for(const sd of [-1,1]){
    t.bevelBox(-1.55,1.70,sd*2.85,3.70,1.95,0.56,0.22,TWR_COAT);       // cheek applique
    t.box(-1.55,3.60,sd*3.14,2.20,0.20,0.52,sd>0?TEAM_A:HOT);
    hydraulic(t,-1.95,0.50,sd*2.25,2.20,0.26,TWR_MACH,0);
    domRivets(t,-1.55,2.60,sd*3.16,2.90,3,TWR_TRIM,0);
  }
  t.box(3.05,1.10,0,1.20,2.40,3.20,TWR_MACH);                          // mantlet
  gunX(t,3.10,2.10,8.10,0.66,TWR_MACH);
  cylX(t,2.30,2.10,0,2.90,1.16,0.94,12,TWR_COAT,false);                // recoil sleeve
  for(const x of [5.10,8.00]) ringX(t,x,2.10,0,0.76,1.04,10,x>7?HOT:TWR_TRIM);
  cylX(t,2.60,0.85,-2.05,3.30,0.28,0.24,7,TWR_MACH,false);             // coaxial
  tubeX(t,5.95,0.85,-2.05,0.42,0.36,0.17,8,TWR_BORE);
  t.bevelBox(-3.60,1.30,0,2.20,2.30,4.40,0.38,DARKER);                 // ammunition bustle
  t.box(-3.60,3.62,0,1.60,0.24,3.10,TEAM_T);
  return {hull:m.build(),tur:t.build(),s:0.88,turH:16.55};
}

/* ---------------------------------------------------------------------------
   8 — TITAN.  Walking fortress, hp 16000 / dmg 160 / rng 175.
   Everything about this is the Goliath again at a scale that stops being a
   vehicle: the legs carry armour panels of their own, the hips are a bridge,
   and the weapons are shoulder-mounted because there is no turret ring large
   enough. One per match, if ever — so it gets the top of the budget.
   --------------------------------------------------------------------------- */
function mdlDomTitan(){
  const m=MB();
  for(const sd of [-1,1]){
    domLeg(m,sd*6.30,1.90);
    armorPlate(m,-0.40,4.20,sd*8.85,8.60,2.30,0.62,0,TWR_COAT,0);      // outer shin plate
    m.bevelBox(0.20,8.60,sd*6.30,5.80,1.35,5.60,0.48,TWR_COAT);        // knee applique
    m.box(2.90,0.50,sd*6.30,2.10,1.10,4.20,TWR_ARM_D);                 // toe cleat
  }
  /* hip bridge */
  m.extrude(0,14.10,0,[[-6.60,-7.10],[3.70,-7.65],[6.95,-4.25],[6.95,4.25],
            [3.70,7.65],[-6.60,7.10]],4.35,TWR_ARM_D);
  m.extrude(0.15,18.45,0,[[-5.90,-6.35],[3.50,-6.80],[6.05,-3.65],[6.05,3.65],
            [3.50,6.80],[-5.90,6.35]],1.95,TEAM_A);                    // hip deck livery
  for(const sd of [-1,1]){
    armorPlate(m,0.20,18.55,sd*6.25,8.40,1.55,0.60,0,TWR_COAT,0);
    domStack(m,-4.20,16.10,sd*5.05,3.40,0.82);
  }
  m.bevelBox(-4.55,16.05,0,4.55,3.20,10.55,0.72,DARKER);               // reactor bridge
  ventBank(m,-4.45,19.40,0,3.30,7.50,6,TWR_MACH,0);
  /* torso */
  m.extrude(0,20.40,0,[[-5.85,-6.15],[3.35,-7.05],[6.05,-4.20],[6.05,4.20],
            [3.35,7.05],[-5.85,6.15]],6.20,TWR_ARM);
  m.extrude(0.35,26.60,0,[[-4.85,-5.30],[2.95,-5.90],[5.10,-3.30],[5.10,3.30],
            [2.95,5.90],[-4.85,5.30]],2.05,TEAM_A);                    // shoulder deck livery
  domProw(m,4.35,22.60,0,3.90,4.20,10.10);                             // chest glacis
  m.bevelBox(1.30,28.65,0,6.70,1.25,8.50,0.42,TWR_ARM);                // collar armour
  domRivets(m,-2.30,28.72,0,7.20,5,TWR_TRIM,Math.PI/2);
  for(const sd of [-1,1]){
    m.bevelBox(0.60,22.45,sd*7.50,6.35,4.30,4.40,0.70,TWR_ARM_D);      // shoulder receiver
    m.box(-2.60,23.15,sd*7.50,1.55,2.45,4.00,DARKER);                  // ammunition bustle
    m.greeble(-2.60,25.55,sd*7.50,1.20,3.10,0.54,4,TWR_MACH,0,sd>0?81:82);
    m.box(3.00,23.70,sd*7.50,3.60,2.20,2.50,TWR_COAT);                 // trunnion housing
    gunX(m,4.65,24.55,11.10,0.80,TWR_MACH,sd*7.50);                    // shoulder cannon
    cylX(m,3.95,24.55,sd*7.50,2.90,1.28,1.06,12,TWR_COAT,false);
    for(const x of [8.20,13.90]) ringX(m,x,24.55,sd*7.50,0.90,1.20,10,x>13?HOT:TWR_TRIM);
    m.box(0.45,26.90,sd*7.50,5.50,0.42,3.50,sd>0?TEAM_A:TEAM_B);       // ownership panel
    m.box(-4.55,20.95,sd*5.95,2.10,4.70,1.10,DARK);                    // torso grille
    for(let k=0;k<4;k++) m.box(-4.05,21.50+k*0.86,sd*6.52,1.45,0.34,0.32,TWR_TRIM);
    domStack(m,-5.05,23.05,sd*4.55,4.80,0.94);                         // dorsal heat stacks
  }
  m.bevelBox(-4.80,21.25,0,3.20,5.30,7.25,0.62,DARKER);                // power backpack
  m.greeble(-4.80,26.55,0,2.35,5.10,0.68,5,TWR_MACH,0,91);
  m.bevelBox(3.00,30.20,0,4.85,3.40,6.10,0.60,TWR_ARM);                // command head
  m.box(5.65,31.05,0,0.52,0.95,4.05,TWR_BORE);                         // vision slit
  m.box(5.90,31.20,0,0.34,0.44,3.55,ENERGY);
  m.box(3.00,33.55,0,3.30,0.30,4.60,TEAM_T);                           // head livery cap
  sensorMast(m,-0.35,33.60,1.60,2.40,TWR_TRIM);
  kitBox(m,-4.80,20.15,0,2.05,1.25,3.55,TWR_MACH,0);
  return {hull:m.build(),tur:null,s:0.62};
}

/* ---------------------------------------------------------------------------
   3 — THUMPER.  Field artillery, hp 135 / dmg 60 / rng 265.
   Thin-skinned on purpose: a light track run, a shallow hull and all the mass
   in the tube and the recoil gear. Deployed spades at the back are the plan-
   view tell that separates artillery from a gun tank.
   --------------------------------------------------------------------------- */
function mdlDomArty(){
  const m=MB();
  domTracks(m,12.6,3.00,2.70,3.50,5,0);
  const deck=domHullSlab(m,-0.30,2.15,12.0,7.20,1.55,0.95);            // deck ~4.65
  domProw(m,4.60,2.20,0,3.00,2.20,5.60);
  for(const sd of [-1,1]){
    m.box(-5.60,1.30,sd*3.60,2.20,2.60,0.90,TWR_COAT);                 // recoil spade
    hydraulic(m,-4.80,2.55,sd*3.20,2.20,0.26,TWR_MACH,0);
    m.box(0.60,deck+0.02,sd*3.05,6.40,0.34,0.62,sd>0?TEAM_A:TEAM_B);
    kitBox(m,2.60,deck+0.02,sd*2.20,2.20,0.90,1.30,TWR_MACH,0);        // shell lockers
  }
  domStack(m,-3.40,deck,2.20,2.60,0.62);
  ventBank(m,-3.40,deck+0.02,-1.90,2.40,2.60,4,TWR_MACH,0);
  sensorMast(m,-4.90,deck+0.05,1.60,2.10,TWR_TRIM);
  domRivets(m,1.60,deck+0.06,0,6.00,4,TWR_TRIM,0);
  deckCrown(m,-0.30,deck+0.02,0,11.4,7.0,TWR_ARM_D,TEAM_T);

  const t=MB();
  domRing(t,-0.60,2.55,1.05);
  t.bevelBox(-0.55,1.05,0,5.20,2.30,5.10,0.50,TWR_ARM_D);
  t.bevelBox(-0.30,3.35,0,4.40,0.80,4.20,0.28,TWR_ARM);
  for(const sd of [-1,1]){
    t.cyl(1.30,0.95,sd*1.85,1.15,1.00,0.90,9,TWR_MACH);                // trunnion
    hydraulic(t,-1.40,0.95,sd*2.00,2.40,0.28,TWR_MACH,0);              // elevation ram
    t.box(-0.60,2.40,sd*2.55,3.60,0.42,0.46,sd>0?TEAM_A:HOT);
  }
  gunX(t,1.55,2.10,13.40,0.52,TWR_MACH);                               // very long tube
  cylX(t,1.10,2.10,0,2.60,1.02,0.82,10,TWR_COAT,false);                // recuperator
  for(const x of [6.20,10.40]) ringX(t,x,2.10,0,0.62,0.86,10,TWR_TRIM);
  t.bevelBox(-2.55,1.05,0,1.70,1.70,3.60,0.32,DARKER);                 // counterweight
  t.box(-2.55,2.78,0,1.20,0.22,2.60,TEAM_T);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:4.70};
}

/* ---------------------------------------------------------------------------
   6 — LONGBOW (hp 110 / dmg 95 / rng 205)   and   7 — HORNET (hp 210 / rng 175)
   The same role: a light chassis carrying an ELEVATING OPEN RACK of missile
   cells. Both are thin-skinned launchers — the armour budget went into the
   cells, and the rack is deliberately exposed so the silhouette is a box of
   tubes rather than another turret.
   --------------------------------------------------------------------------- */
function mdlDomMissile(){
  const m=MB();
  domTracks(m,11.6,2.85,2.55,3.30,5,0);
  const deck=domHullSlab(m,-0.20,2.05,11.0,6.90,1.45,0.90);            // deck ~4.40
  domProw(m,4.20,2.10,0,2.80,2.10,5.40);
  m.bevelBox(2.55,deck,0,2.90,1.60,3.60,0.34,TWR_ARM_D);               // armoured cab
  m.box(4.05,deck+0.85,0,0.34,0.42,2.20,TWR_BORE);                     // vision slit
  for(const sd of [-1,1]){
    m.box(0.20,deck+0.02,sd*2.95,5.80,0.32,0.60,sd>0?TEAM_A:TEAM_B);
    m.cyl(-4.60,deck,sd*2.15,0.36,0.30,1.10,6,TWR_MACH);               // tie-downs
  }
  domStack(m,-4.30,deck,1.55,2.40,0.60);
  ventBank(m,-4.30,deck+0.02,-1.55,2.20,2.20,4,TWR_MACH,0);
  domRivets(m,1.20,deck+0.06,0,5.40,4,TWR_TRIM,0);

  /* TALL AND NARROW ON PURPOSE. The Reaper/Cinder mortar block is the other
     Dominion launcher and it is low and wide; if this rack sat at the same
     height the two families would be one silhouette. Raising it onto visible
     rams and running the cells past the prow is the whole separation. */
  const t=MB();
  domRing(t,-1.35,2.30,1.05);
  t.bevelBox(-1.10,1.05,0,3.00,2.35,4.90,0.42,TWR_COAT);               // rack turntable
  for(const sd of [-1,1]){
    hydraulic(t,-2.05,1.05,sd*2.00,3.30,0.30,TWR_MACH,0);              // elevation rams
    t.bevelBox(-0.55,3.40,sd*2.55,5.60,3.55,0.54,0.20,TWR_ARM_D);      // rack cheek
    t.box(-0.55,6.99,sd*2.79,3.40,0.26,0.50,sd>0?TEAM_A:HOT);
    domRivets(t,-0.55,5.20,sd*2.84,3.90,3,TWR_TRIM,0);
  }
  t.box(-3.10,3.40,0,0.95,3.55,5.10,TWR_MACH);                         // rack backplate
  /* Six genuinely open cells. The muzzle collar is the only bright ring on the
     model, so a loaded rack reads even against terrain. */
  for(let row=0;row<2;row++) for(let col=0;col<3;col++){
    const y=4.15+row*1.85, z=-1.70+col*1.70;
    cylX(t,-2.40,y,z,6.10,0.66,0.60,9,TWR_MACH,false);
    ringX(t,3.62,y,z,0.62,0.84,9,TWR_TRIM);
    tubeX(t,3.66,y,z,0.68,0.66,0.36,8,TWR_BORE);
  }
  return {hull:m.build(),tur:t.build(),s:1.0,turH:4.45};
}

/* ---------------------------------------------------------------------------
   5 — WASP (hp 135 / dmg 13 / rng 78)   and   25 — KESTREL (hp 120 / rng 150)
   Tier-1 air, and the Dominion builds it the way it builds everything else: an
   armoured keel, a bolted spine, slit vision instead of a canopy, and two
   ducted turbines hung off short thick wings. Chaff budget — the detail goes
   into the nacelles and the wing roots, which is what is visible from above.
   --------------------------------------------------------------------------- */
function mdlDomFlyer(){
  const m=MB();
  const keel=[[-5.10,-1.60],[-3.05,-2.10],[2.50,-2.20],[5.40,-0.85],[5.95,0],
              [5.40,0.85],[2.50,2.20],[-3.05,2.10],[-5.10,1.60]];
  const spine=[[-4.55,-1.35],[-2.45,-1.72],[2.65,-1.68],[4.90,-0.60],[5.35,0],
               [4.90,0.60],[2.65,1.68],[-2.45,1.72],[-4.55,1.35]];
  m.extrude(0,0,0,keel,1.30,TWR_ARM_D);                                // armoured keel
  m.extrude(0,1.30,0,spine,1.10,TWR_ARM);
  m.extrude(0.15,2.40,0,spine.map(p=>[p[0]*0.70,p[1]*0.62]),0.52,TEAM_A);
  m.wedge(3.55,2.40,0,3.00,0.90,2.40,TWR_ARM,Math.PI/2,false);         // bolted nose cowl
  m.box(4.35,2.62,0,0.32,0.36,1.70,TWR_BORE);                          // vision slit
  m.box(-0.70,2.94,0,3.90,0.28,1.05,TEAM_T);                           // dorsal identity
  domRivets(m,0.60,2.98,0,3.20,3,TWR_TRIM,0);
  ventBank(m,-2.10,2.94,0,1.55,1.25,3,TWR_MACH,0);
  for(const sd of [-1,1]){
    const wing=sd>0
      ? [[-3.40,1.15],[2.30,1.35],[0.85,6.30],[-4.05,5.55]]
      : [[-3.40,-1.15],[-4.05,-5.55],[0.85,-6.30],[2.30,-1.35]];
    m.extrude(0,1.00,0,wing,0.62,TWR_ARM_D);                           // one-piece wing
    m.extrude(0,1.62,0,wing.map(p=>[p[0]*0.74,p[1]*0.80]),0.22,sd>0?TEAM_A:TEAM_B);
    m.box(-1.55,1.02,sd*3.40,4.30,0.78,2.15,TWR_COAT);                 // engine pylon
    cylX(m,-4.45,1.36,sd*3.60,5.20,1.08,0.90,9,TWR_MACH,false);        // ducted turbine
    ringX(m,0.45,1.36,sd*3.60,0.66,0.98,9,TWR_TRIM);                   // intake lip
    tubeX(m,-4.90,1.36,sd*3.60,0.78,0.88,0.42,9,TWR_BORE);             // hollow exhaust
    ringX(m,-4.94,1.36,sd*3.60,0.30,0.48,8,HOT);
    m.box(-1.10,1.90,sd*3.60,2.10,0.36,1.20,TWR_TRIM);                 // nacelle saddle
    m.box(2.15,0.50,sd*1.50,2.05,0.74,0.82,TWR_COAT);                  // gun receiver
    gunX(m,2.70,0.80,3.00,0.26,TWR_MACH,sd*1.50);
    m.bevelBox(-0.30,0.46,sd*5.15,2.70,0.86,1.20,0.22,DARKER);         // stores pylon
    for(let k=0;k<3;k++) cylX(m,-0.90+k*0.82,0.56,sd*5.15,1.20,0.22,0.17,6,HOT,false);
    m.box(-4.05,2.10,sd*1.45,2.15,1.80,0.38,TWR_ARM);                  // twin fins
    m.box(-3.60,3.32,sd*1.45,1.40,0.26,0.34,LAMP);
  }
  m.bevelBox(-4.10,1.50,0,2.25,1.20,3.40,0.30,DARKER);                 // tail gearbox
  return {hull:m.build(),tur:null,s:0.96,air:1};
}

/* ---------------------------------------------------------------------------
   17 — RAPTOR.  Heavy gunship, hp 280 / dmg 85 / rng 52.
   Fifty-two range means it gets close, so it is short, deep and plated, with
   the guns UNDER the chin where a gunship's guns go. Stub wings carry rocket
   pods rather than fuel — nothing about this airframe is meant to loiter.
   --------------------------------------------------------------------------- */
function mdlDomGunship(){
  const m=MB();
  /* SHORT AND WIDE. Fifty-two range is knife-fighting distance, so the Raptor
     is deliberately shorter than the Wasp and half again its beam — the two
     airframes share every component and still separate at a glance. */
  const keel=[[-4.55,-2.55],[-2.55,-3.35],[2.05,-3.45],[4.25,-1.75],[4.85,0],
              [4.25,1.75],[2.05,3.45],[-2.55,3.35],[-4.55,2.55]];
  const deck=[[-4.05,-2.25],[-2.20,-2.90],[1.95,-2.95],[3.75,-1.45],[4.30,0],
              [3.75,1.45],[1.95,2.95],[-2.20,2.90],[-4.05,2.25]];
  m.extrude(0,0.90,0,keel,1.75,TWR_ARM_D);                             // deep armoured body
  m.extrude(0,2.65,0,deck,1.65,TWR_ARM);
  m.extrude(-0.20,4.30,0,deck.map(p=>[p[0]*0.76,p[1]*0.70]),0.68,TEAM_A);
  m.wedge(3.35,4.30,0,3.60,1.05,2.60,TWR_ARM,Math.PI/2,false);         // blunt bolted brow
  m.box(4.15,4.62,0,0.36,0.44,2.35,TWR_BORE);                          // armoured vision slit
  m.box(-1.10,4.98,0,3.20,0.30,1.10,TEAM_T);
  domRivets(m,0.90,5.02,0,3.20,4,TWR_TRIM,0);
  ventBank(m,-2.75,4.98,0,2.00,1.45,4,TWR_MACH,0);
  /* CHIN BATTERY — under the nose, ahead of everything, the read at 60px. */
  m.bevelBox(2.85,0,0,3.00,1.68,3.20,0.40,TWR_COAT);
  for(const sd of [-1,1]) gunX(m,3.65,0.86,2.80,0.30,TWR_MACH,sd*0.98);
  m.box(2.85,1.68,0,2.20,0.24,2.20,TEAM_T);                            // chin plate livery
  for(const sd of [-1,1]){
    const wing=sd>0
      ? [[-3.05,2.05],[2.00,2.30],[1.15,5.20],[-3.60,4.65]]
      : [[-3.05,-2.05],[-3.60,-4.65],[1.15,-5.20],[2.00,-2.30]];
    m.extrude(0,2.10,0,wing,0.88,TWR_ARM_D);                           // thick stub wing
    m.box(-1.10,2.35,sd*3.55,4.30,1.05,2.35,TWR_COAT);                 // engine pylon
    cylX(m,-4.15,2.80,sd*3.85,4.90,1.32,1.10,10,TWR_MACH,false);       // armoured turbine
    ringX(m,0.65,2.80,sd*3.85,0.86,1.20,10,TWR_TRIM);
    tubeX(m,-4.58,2.80,sd*3.85,0.98,1.08,0.54,10,TWR_BORE);
    ringX(m,-4.62,2.80,sd*3.85,0.36,0.58,8,HOT);
    m.box(-1.10,3.49,sd*3.85,2.40,0.30,1.55,sd>0?TEAM_A:TEAM_B);
    m.bevelBox(-0.45,1.40,sd*4.65,3.00,1.00,1.45,0.28,DARKER);         // rocket pod
    for(let k=0;k<3;k++) tubeX(m,-1.45+k*0.95,1.60,sd*4.65,0.82,0.30,0.14,6,HOT);
    m.box(-4.20,3.85,sd*2.30,2.10,2.55,0.42,TWR_ARM);                  // twin tails
    m.box(-3.80,6.15,sd*2.30,1.35,0.30,0.46,TWR_TRIM);
  }
  m.bevelBox(-4.35,3.10,0,2.55,1.55,3.85,0.42,DARKER);                 // tail gearbox
  return {hull:m.build(),tur:null,s:1.0,air:1};
}

/* ---------------------------------------------------------------------------
   10 — VULTURE (hp 170 / dmg 52 / rng 172)  and  22 — LANCER (hp 190 / dmg 150
   / rng 230).  One role: a light, thin-skinned hull whose entire mass is a
   single very long high-velocity gun on a high-elevation mount, with a
   tracking dish behind it. Fragile, long-reaching, and unmistakably a hunter
   rather than a line tank.
   --------------------------------------------------------------------------- */
function mdlDomHunter(){
  const m=MB();
  domTracks(m,11.8,2.80,2.50,3.25,5,0);
  const deck=domHullSlab(m,-0.20,2.05,11.2,6.60,1.35,0.85);            // deck ~4.25
  domProw(m,4.35,2.10,0,3.00,2.05,5.20);
  for(const sd of [-1,1]){
    armorPlate(m,0.10,2.10,sd*4.35,8.40,1.45,0.40,0,TWR_COAT,0);
    m.box(0.10,deck+0.02,sd*2.85,5.90,0.32,0.60,sd>0?TEAM_A:TEAM_B);
  }
  domStack(m,-3.90,deck,1.80,2.30,0.58);
  ventBank(m,-3.90,deck+0.02,-1.80,2.10,2.20,4,TWR_MACH,0);
  domRivets(m,1.40,deck+0.06,0,5.60,4,TWR_TRIM,0);
  deckCrown(m,-0.20,deck+0.02,0,10.6,6.4,TWR_ARM_D,TEAM_T);
  sensorMast(m,-4.60,deck+0.05,1.55,1.90,TWR_TRIM);

  const t=MB();
  domRing(t,-0.80,2.35,1.00);
  t.bevelBox(-0.70,1.00,0,4.60,2.10,4.60,0.46,TWR_ARM_D);
  t.bevelBox(-0.45,3.10,0,3.90,0.75,3.80,0.26,TWR_ARM);
  for(const sd of [-1,1]){
    t.cyl(1.15,0.85,sd*1.75,1.05,0.92,0.85,8,TWR_MACH);                // high trunnion
    hydraulic(t,-1.25,0.85,sd*1.90,2.10,0.26,TWR_MACH,0);
    t.box(-0.55,2.25,sd*2.35,3.20,0.40,0.44,sd>0?TEAM_A:HOT);
  }
  t.box(2.90,1.05,0,1.05,1.90,2.35,TWR_COAT);                          // mantlet
  gunX(t,2.35,1.95,12.60,0.44,TWR_MACH);                               // very long lance
  cylX(t,1.55,1.95,0,2.10,0.90,0.72,10,TWR_COAT,false);
  for(const x of [5.40,8.60,11.60]) ringX(t,x,1.95,0,0.56,0.80,10,x>11?HOT:TWR_TRIM);
  /* Tracking dish — the reason this thing hits at 230 and the reason it can
     lay onto a fast mover. It also breaks the flat rear deck. */
  t.cyl(-2.35,2.05,0,0.36,0.30,1.35,7,TWR_MACH);
  t.cyl(-2.35,3.40,0,1.85,0.36,0.34,10,TWR_TRIM);
  t.box(-2.35,3.72,0,0.24,0.62,2.10,DARKER);
  t.bevelBox(-2.55,1.00,0,1.50,1.30,3.20,0.28,DARKER);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:4.30};
}

/* ---------------------------------------------------------------------------
   20 — REAPER (hp 300 / dmg 26 / rng 120)  and  21 — CINDER (hp 260 / rng 96)
   Close saturation. A medium hull under a BANK OF SHORT FAT MORTAR TUBES on a
   traversing block — short and wide where the Longbow's rack is long and thin,
   so the two launcher families never get confused at range.
   --------------------------------------------------------------------------- */
function mdlDomSplash(){
  const m=MB();
  domTracks(m,11.8,2.95,2.60,3.35,5,1);
  const deck=domHullSlab(m,-0.20,2.20,11.4,7.80,1.60,0.95);            // deck ~4.75
  domProw(m,4.40,2.25,0,3.00,2.35,6.20);
  for(const sd of [-1,1]){
    armorPlate(m,0.10,2.30,sd*4.85,8.80,1.70,0.46,0,TWR_COAT,0);
    m.box(0.20,deck+0.02,sd*3.35,6.20,0.34,0.64,sd>0?TEAM_A:TEAM_B);
    kitBox(m,-3.10,deck+0.02,sd*2.55,2.10,0.95,1.35,TWR_MACH,0);       // bomb lockers
  }
  domStack(m,-4.30,deck,1.85,2.55,0.64);
  ventBank(m,-4.30,deck+0.02,-1.85,2.30,2.40,4,TWR_MACH,0);
  domRivets(m,1.40,deck+0.06,0,5.80,4,TWR_TRIM,0);
  deckCrown(m,-0.20,deck+0.02,0,11.0,7.6,TWR_ARM_D,TEAM_T);

  const t=MB();
  domRing(t,-1.10,2.75,1.10);
  t.bevelBox(-1.00,1.10,0,3.60,2.30,6.00,0.50,TWR_COAT);               // traversing block
  for(const sd of [-1,1]){
    hydraulic(t,-1.90,1.10,sd*2.20,2.10,0.28,TWR_MACH,0);
    t.bevelBox(-0.30,3.40,sd*3.15,4.20,1.90,0.54,0.20,TWR_ARM_D);      // magazine cheek
    t.box(-0.30,5.34,sd*3.38,2.60,0.22,0.48,sd>0?TEAM_A:HOT);
  }
  t.box(-2.35,3.40,0,0.85,1.90,6.10,TWR_MACH);                         // breech backplate
  /* Eight short fat tubes in two rows — a mortar battery, not a gun. */
  for(let row=0;row<2;row++) for(let col=0;col<4;col++){
    const y=3.85+row*1.40, z=-2.55+col*1.70;
    cylX(t,-1.55,y,z,3.10,0.62,0.58,8,TWR_MACH,false);
    ringX(t,1.45,y,z,0.58,0.82,8,TWR_TRIM);
    tubeX(t,1.48,y,z,0.62,0.58,0.31,7,TWR_BORE);                       // shadowed bore
  }
  t.bevelBox(-2.60,1.10,0,1.40,2.00,4.60,0.30,DARKER);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:4.80};
}

/* ---------------------------------------------------------------------------
   16 — BOMBARD.  Siege platform, hp 400 / dmg 95 / rng 400.
   Four hundred range is the longest thing on the board, and the silhouette has
   to say so from across a minimap: ONE very long thin barrel on a braced
   carriage, with four hydraulic outrigger spades dug in around it. Everything
   else on the hull is deliberately low so the tube dominates.
   --------------------------------------------------------------------------- */
function mdlDomSiege(){
  const m=MB();
  domTracks(m,15.4,4.00,3.20,4.30,7,2);
  const deck=domHullSlab(m,-0.30,2.75,15.0,9.60,1.90,1.05);            // deck ~5.70
  domProw(m,5.60,2.80,0,3.60,2.55,7.40);
  for(const sd of [-1,1]){
    armorPlate(m,0.00,2.85,sd*5.60,11.4,2.00,0.50,0,TWR_COAT,0);
    m.box(0.40,deck+0.02,sd*4.20,7.60,0.42,0.70,sd>0?TEAM_A:TEAM_B);
    /* Outriggers, fore and aft, and pushed well clear of the tracks. A gun this
       long cannot fire off its running gear — and the four-legged plan-view
       footprint is the ONE thing that separates a 400-range siege platform from
       every other Dominion vehicle with a long tube on it. */
    for(const fx of [5.40,-6.40]){
      m.box(fx,1.55,sd*6.90,2.70,1.30,3.60,TWR_MACH);                  // outrigger arm
      m.box(fx,0.55,sd*8.30,2.30,1.00,1.60,TWR_COAT);                  // outer leg
      m.wedge(fx-0.20,0,sd*8.30,3.20,0.90,2.60,TWR_PAD,Math.PI/2,fx<0); // dug-in spade
      hydraulic(m,fx,2.85,sd*6.10,2.60,0.32,TWR_MACH,0);
    }
    domStack(m,-4.60,deck,sd*2.60,3.00,0.76);
    kitBox(m,-2.20,deck+0.02,sd*3.20,2.60,1.00,1.60,TWR_MACH,0);       // shell lockers
  }
  ventBank(m,-4.60,deck+0.02,0,3.40,4.20,5,TWR_MACH,0);
  domRivets(m,2.20,deck+0.06,0,7.20,5,TWR_TRIM,0);
  sensorMast(m,-6.10,deck+0.05,2.10,2.50,TWR_TRIM);
  deckCrown(m,-0.30,deck+0.02,0,14.2,9.2,TWR_ARM_D,TEAM_T);

  const t=MB();
  domRing(t,-0.90,3.35,1.20);
  t.bevelBox(-0.85,1.20,0,6.20,2.90,6.20,0.58,TWR_ARM_D);
  t.bevelBox(-0.55,4.10,0,5.20,0.90,5.10,0.30,TWR_ARM);
  for(const sd of [-1,1]){
    t.cyl(0.90,1.00,sd*2.55,1.32,1.14,1.05,9,TWR_MACH);                // heavy trunnion
    hydraulic(t,-1.70,1.00,sd*2.35,2.90,0.34,TWR_MACH,0);
    t.box(-0.50,3.20,sd*3.05,4.40,0.48,0.44,sd>0?TEAM_A:HOT);
    domRivets(t,-0.50,2.30,sd*3.10,3.20,3,TWR_TRIM,0);
  }
  gunX(t,1.60,2.35,17.60,0.68,TWR_MACH);                               // the longest tube
  cylX(t,1.05,2.35,0,3.10,1.32,1.02,12,TWR_COAT,false);                // recoil cradle
  for(const x of [7.20,12.60]) ringX(t,x,2.35,0,0.78,1.04,10,TWR_TRIM);
  t.bevelBox(-3.30,1.25,0,2.10,2.60,4.80,0.36,DARKER);                 // counterweight
  t.box(-3.30,3.86,0,1.50,0.24,3.40,TEAM_T);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:5.75};
}

/* ---------------------------------------------------------------------------
   27 — HARBINGER.  Siege titan, hp 760 / dmg 44 / rng 210, aoe 60.
   A heavy carriage that is ALL magazine: six fat launch tubes standing in an
   armoured frame, outriggers down, no turret. Where the Bombard is one long
   line, this is a block — the two siege units read apart instantly.
   --------------------------------------------------------------------------- */
function mdlDomBattery(){
  const m=MB();
  domTracks(m,14.8,3.85,3.10,4.20,6,2);
  const deck=domHullSlab(m,-0.30,2.65,14.4,10.20,1.85,1.05);           // deck ~5.55
  domProw(m,5.30,2.70,0,3.40,2.45,7.80);
  for(const sd of [-1,1]){
    armorPlate(m,0.00,2.75,sd*5.90,11.0,2.10,0.54,0,TWR_COAT,0);
    m.box(0.30,deck+0.02,sd*4.40,7.20,0.44,0.72,sd>0?TEAM_A:TEAM_B);
    m.box(-6.00,1.45,sd*6.30,2.80,1.30,1.30,TWR_MACH);                 // outrigger arm
    m.wedge(-6.40,0,sd*6.30,2.50,1.00,2.40,TWR_PAD,Math.PI/2,true);    // dug-in spade
    hydraulic(m,-5.80,2.55,sd*5.70,2.30,0.30,TWR_MACH,0);
    domStack(m,-4.90,deck,sd*2.90,3.10,0.80);
  }
  /* THE MAGAZINE. An armoured frame with six open bores standing in it — the
     tubes are bedded into a real backplate and capped with collars, so it is a
     launcher rather than six pipes resting on a lid. */
  m.bevelBox(-0.40,deck,0,8.20,2.40,8.40,0.66,TWR_ARM_D);
  /* Two ROWS separated along X, three columns across Z, and the rear bank
     standing taller than the front. Stepping the two banks apart is what makes
     this read as six cells instead of one clump — 0.30 of separation left them
     coincident and z-fighting, which from overhead looked like three tubes. */
  for(let row=0;row<2;row++) for(let col=-1;col<=1;col++){
    const bx=row?-2.00:1.25, bz=col*2.55, by=deck+(row?2.35:1.95), bh=row?6.55:5.70;
    m.tube(bx,by,bz,1.18,0.80,bh,8,TWR_MACH);                          // launch cell
    m.ring(bx,by+bh-0.44,bz,0,0.80,8,TWR_BORE);                        // recessed bore
    m.ring(bx,by+bh+0.02,bz,0.84,1.24,8,row?HOT:TWR_TRIM);             // muzzle collar
  }
  m.box(-4.10,deck+0.10,0,1.10,2.60,7.40,TWR_MACH);                    // loading backplate
  m.box(-0.40,deck+2.34,0,6.40,0.26,0.70,TEAM_T);                      // frame livery
  ventBank(m,-5.40,deck+0.02,0,3.20,4.60,6,TWR_MACH,0);
  domRivets(m,2.60,deck+0.06,0,7.00,5,TWR_TRIM,0);
  stowage(m,-2.20,deck+0.02,4.20,5.20,1.70,RUST,0,37);
  sensorMast(m,-5.90,deck+0.05,2.50,2.60,TWR_TRIM);
  deckCrown(m,-0.30,deck+0.02,0,13.8,9.8,TWR_ARM_D,TEAM_T);
  return {hull:m.build(),tur:null,s:1.04};
}

/* ---------------------------------------------------------------------------
   26 — BASILISK.  Experimental heavy, hp 1100 / dmg 120 / rng 190.
   The Rhino's vocabulary taken to its conclusion: a double tier of applique
   over a wide hull, four heat stacks because the powerplant cannot cope, and a
   turret whose cheeks are armour blocks rather than panels.
   --------------------------------------------------------------------------- */
function mdlDomHeavy(){
  const m=MB();
  domTracks(m,16.0,4.20,3.30,4.50,7,2);
  const deck=domHullSlab(m,-0.30,2.85,15.6,10.0,2.10,1.20);            // deck ~6.15
  domProw(m,5.90,2.90,0,4.00,2.90,8.20);
  for(const sd of [-1,1]){
    armorPlate(m,0.00,2.95,sd*5.90,12.0,2.20,0.56,0,TWR_COAT,0);       // lower applique
    armorPlate(m,0.30,5.30,sd*5.20,10.4,1.60,0.50,0,TWR_ARM_D,0);      // upper applique
    m.box(0.30,deck+0.02,sd*4.30,7.80,0.46,0.74,sd>0?TEAM_A:TEAM_B);
    m.bevelBox(3.60,deck,sd*3.85,4.60,1.50,2.05,0.32,TWR_COAT);        // sponson blister
    domStack(m,-4.80,deck,sd*2.85,3.30,0.82);
    m.cyl(6.60,deck,sd*3.20,0.34,0.28,1.20,6,TWR_TRIM);                // tow points
  }
  ventBank(m,-5.20,deck+0.02,0,3.80,5.60,6,TWR_MACH,0);
  domRivets(m,2.60,deck+0.06,0,7.60,5,TWR_TRIM,0);
  stowage(m,-2.40,deck+0.02,3.90,5.60,1.80,RUST,0,29);
  m.bevelBox(-6.00,deck,0,2.60,2.20,6.20,0.48,DARKER);                 // rear engine deck
  sensorMast(m,-6.30,deck+0.05,2.60,2.70,TWR_TRIM);
  deckCrown(m,-0.30,deck+0.02,0,14.6,9.6,TWR_ARM_D,TEAM_T);

  const t=MB();
  domRing(t,-1.00,4.05,1.25);
  t.bevelBox(-0.85,1.25,0,8.20,3.20,7.00,0.78,TWR_ARM_D);
  t.bevelBox(-0.45,4.45,0,7.10,1.05,5.90,0.34,TWR_ARM);
  for(const sd of [-1,1]){
    t.bevelBox(-1.70,1.75,sd*3.35,4.30,2.30,0.86,0.30,TWR_COAT);       // cheek armour block
    t.box(-1.70,4.00,sd*3.72,2.60,0.22,0.56,sd>0?TEAM_A:HOT);
    hydraulic(t,-2.10,0.55,sd*2.55,2.40,0.28,TWR_MACH,0);
    domRivets(t,-1.70,2.80,sd*3.80,3.40,3,TWR_TRIM,0);
  }
  t.box(3.60,1.20,0,1.40,2.60,3.60,TWR_MACH);                          // mantlet
  gunX(t,3.20,2.30,11.20,0.74,TWR_MACH);
  cylX(t,2.30,2.30,0,3.20,1.28,1.02,12,TWR_COAT,false);
  for(const x of [6.20,10.40]) ringX(t,x,2.30,0,0.84,1.14,10,x>10?HOT:TWR_TRIM);
  cylX(t,3.00,0.95,-2.45,3.60,0.30,0.26,7,TWR_MACH,false);             // coaxial
  tubeX(t,6.70,0.95,-2.45,0.46,0.38,0.18,8,TWR_BORE);
  t.bevelBox(-4.00,1.35,0,2.40,2.55,5.00,0.42,DARKER);                 // bustle
  t.box(-4.00,3.94,0,1.70,0.24,3.50,TEAM_T);
  return {hull:m.build(),tur:t.build(),s:1.02,turH:6.20};
}

/* ---------------------------------------------------------------------------
   18 — SCORCHER.  Armoured flame tank, hp 640 / dmg 13 / rng 80.
   The plumbing is the model: two big external fuel drums with caps and bands
   sitting on cradles, a feed run forward, and twin short projector throats. It
   is heavy and it is obviously carrying something that burns.
   --------------------------------------------------------------------------- */
function mdlDomFlame(){
  const m=MB();
  domTracks(m,14.8,3.85,3.15,4.25,6,2);
  const deck=domHullSlab(m,-0.30,2.70,14.2,9.40,1.95,1.10);            // deck ~5.75
  domProw(m,5.30,2.75,0,3.60,2.60,7.40);
  for(const sd of [-1,1]){
    armorPlate(m,0.00,2.80,sd*5.60,11.0,2.00,0.52,0,TWR_COAT,0);
    m.cyl(-4.10,deck,sd*2.70,1.90,1.90,4.60,10,RUST);                  // fuel drum
    m.cyl(-4.10,deck+4.60,sd*2.70,1.90,1.30,0.55,10,TWR_MACH);         // drum cap
    m.ring(-4.10,deck+1.30,sd*2.70,1.90,2.16,10,TWR_MACH);             // bands
    m.ring(-4.10,deck+3.30,sd*2.70,1.90,2.16,10,TWR_MACH);
    m.bevelBox(-4.10,deck-0.55,sd*2.70,5.20,0.90,1.60,0.24,TWR_COAT);  // drum cradle
    cylX(m,-1.20,deck+1.60,sd*1.55,4.60,0.26,0.24,6,TWR_MACH,false);   // feed run forward
    m.box(0.30,deck+0.02,sd*4.10,7.20,0.44,0.70,sd>0?TEAM_A:TEAM_B);
    domStack(m,-6.10,deck,sd*1.55,2.60,0.66);
  }
  m.box(-4.10,deck+5.20,0,4.20,0.55,3.00,DARKER);                      // spine between drums
  ventBank(m,-6.10,deck+0.02,0,2.90,4.20,5,TWR_MACH,0);
  domRivets(m,2.40,deck+0.06,0,6.60,5,TWR_TRIM,0);
  deckCrown(m,-0.30,deck+0.02,0,13.4,9.0,TWR_ARM_D,TEAM_T);

  const t=MB();
  domRing(t,-0.80,3.05,1.10);
  t.bevelBox(-0.70,1.10,0,5.60,2.60,5.60,0.54,TWR_ARM_D);
  t.bevelBox(-0.40,3.70,0,4.80,0.85,4.60,0.28,TWR_ARM);
  for(const sd of [-1,1]){
    t.box(-0.50,1.55,sd*2.90,3.90,0.90,0.44,sd>0?TEAM_A:HOT);
    hydraulic(t,-1.30,0.50,sd*2.20,2.10,0.28,TWR_MACH,0);
    cylX(t,1.50,1.45,sd*1.10,4.60,0.68,0.58,9,TWR_MACH,false);         // projector body
    ringX(t,3.60,1.45,sd*1.10,0.66,0.90,9,TWR_TRIM);
    cylX(t,5.70,1.45,sd*1.10,1.10,0.88,1.22,9,TWR_COAT,false);         // flare shroud
    tubeX(t,6.40,1.45,sd*1.10,0.90,1.24,0.66,10,TWR_BORE);             // open throat
    t.sphere(7.10,1.45,sd*1.10,0.32,6,HOT,1,false);                    // pilot flame
  }
  t.bevelBox(-2.30,2.60,0,1.70,1.30,3.80,0.30,TWR_MACH);               // pump housing
  t.box(-2.30,3.84,0,1.20,0.22,2.80,TEAM_T);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:5.80};
}

/* ---------------------------------------------------------------------------
   23 — RESONATOR.  Sonic platform, hp 340 / dmg 34 / rng 130.
   Nothing else in the Dominion roster is round from above, so the drum stays —
   but it is a Dominion drum: bolted band, radial ribs, and a stepped horn that
   is plainly an emitter rather than a gun.
   --------------------------------------------------------------------------- */
function mdlDomSonic(){
  const m=MB();
  domTracks(m,11.6,2.90,2.55,3.30,5,1);
  m.extrude(-0.20,2.15,0,[[-5.80,-4.20],[-3.20,-5.10],[3.20,-5.10],[5.60,-3.60],
            [5.60,3.60],[3.20,5.10],[-3.20,5.10],[-5.80,4.20]],1.55,TWR_ARM_D);
  const deck=3.70;
  m.cyl(0.20,deck,0,4.35,4.10,1.85,14,TWR_ARM);                        // resonator drum
  m.ring(0.20,deck+1.85,0,4.02,4.35,14,TWR_TRIM);                      // bolted band
  m.cyl(0.20,deck+1.90,0,3.55,3.45,0.34,14,TWR_ARM_D);                 // recessed deck
  for(let k=0;k<8;k++){
    const a=k/8*TAU;
    m.box(0.20+Math.cos(a)*2.90,deck+2.24,Math.sin(a)*2.90,2.40,0.32,0.50,TWR_MACH,a);
  }
  /* Stepped horn — widest at the base, three rings, an emissive throat. */
  m.cyl(1.30,deck+2.24,0,2.05,1.60,1.05,12,TWR_MACH);
  for(let k=0;k<3;k++) m.ring(1.30,deck+3.30+k*0.50,0,1.80-k*0.44,2.35-k*0.44,12,k?TWR_GLOW:TWR_TRIM);
  m.cyl(1.30,deck+4.85,0,0.85,0.48,0.66,10,TWR_GLOW);
  m.box(-4.70,2.15,0,2.40,2.60,5.60,TWR_COAT);                         // rear counterweight
  armorPlate(m,-4.70,4.75,0,4.60,1.20,0.40,0,TEAM_A,0);
  for(const sd of [-1,1]){
    m.bevelBox(-3.10,deck+1.30,sd*3.55,2.60,1.50,1.30,0.28,TWR_COAT);  // capacitor pods
    m.box(-3.10,deck+2.82,sd*3.55,2.20,0.30,0.44,sd>0?TEAM_A:TWR_GLOW);
    domStack(m,-5.30,3.70,sd*1.75,2.30,0.58);
  }
  domRivets(m,3.40,3.72,0,4.20,4,TWR_TRIM,Math.PI/2);
  ventBank(m,-2.20,3.72,3.30,2.00,1.60,3,TWR_MACH,0);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ---------------------------------------------------------------------------
   11 — BULWARK.  Mobile shield generator, hp 950, dmg 0, rng 0. UNARMED.
   No barrel anywhere: four emitter pylons around a caged field core, plus the
   heaviest track run and skirt on a medium chassis, because its whole job is
   to stand in front of things and not die.
   --------------------------------------------------------------------------- */
function mdlDomShield(){
  const m=MB();
  domTracks(m,13.2,3.60,2.85,3.90,6,2);
  const deck=domHullSlab(m,-0.20,2.45,12.8,8.80,1.85,1.05);            // deck ~5.35
  domProw(m,4.90,2.50,0,3.20,2.40,6.80);
  for(const sd of [-1,1]){
    armorPlate(m,0.00,2.55,sd*5.20,10.0,1.95,0.52,0,TWR_COAT,0);
    m.box(0.20,deck+0.02,sd*3.90,7.00,0.44,0.70,sd>0?TEAM_A:TEAM_B);
    domStack(m,-5.30,deck,sd*2.30,2.70,0.68);
  }
  /* GENERATOR HOUSING — livery, because this is the unit the player looks for
     when they want to know whose bubble that is. */
  m.bevelBox(-0.20,deck,0,5.60,2.80,6.40,0.52,TEAM_T);
  m.box(-0.20,deck+2.84,0,4.40,0.28,4.80,TWR_TRIM);
  domRivets(m,-0.20,deck+2.40,3.30,4.20,4,TWR_TRIM,0);
  /* Four emitter pylons and a caged core. Cages, not a bare sphere: the ring
     pair is what makes the emissive read as contained energy. */
  for(const sd of [-1,1]) for(const fx of [2.30,-2.70]){
    m.cyl(fx,deck+2.80,sd*2.30,0.62,0.50,3.30,7,TWR_MACH);
    m.cyl(fx,deck+6.10,sd*2.30,0.78,0.34,0.55,8,TWR_TRIM);
    m.ring(fx,deck+6.55,sd*2.30,0.34,0.72,8,TWR_GLOW);
  }
  m.sphere(-0.20,deck+6.60,0,2.35,8,TWR_GLOW,0.68,false);              // field core
  m.ring(-0.20,deck+7.70,0,1.55,2.55,14,ENERGY);
  ventBank(m,-4.90,deck+0.02,0,3.00,4.20,5,TWR_MACH,0);
  sensorMast(m,-5.60,deck+0.05,2.10,2.20,TWR_TRIM);
  deckCrown(m,-0.20,deck+0.02,0,12.2,8.4,TWR_ARM_D,TEAM_T);
  return {hull:m.build(),tur:null,s:1.0};
}

/* ---------------------------------------------------------------------------
   19 — CONSTRUCTOR.  Engineer, hp 220, dmg 0, rng 0. UNARMED, LEGS.
   A walking works machine: SERVO legs, a welding rig on one shoulder and a
   cutting boom on the other, a load bed with cargo strapped to it and a
   rotating beacon. Nothing on it can be mistaken for a weapon.
   --------------------------------------------------------------------------- */
function mdlDomEngineer(){
  const m=MB();
  for(const sd of [-1,1]){
    m.bevelBox(-0.35,0,sd*2.35,2.85,0.70,1.90,0.24,SERVO);             // foot
    m.box(0.95,0.16,sd*2.35,0.80,0.42,1.55,SERVO);                     // toe
    m.extrude(-0.20,0.70,sd*2.35,[[-0.80,-0.75],[0.60,-0.75],[0.86,-0.32],
              [0.86,0.32],[0.60,0.75],[-0.80,0.75]],2.05,SERVO);       // shin
    m.cyl(0.10,2.75,sd*2.35,0.92,0.82,0.72,7,SERVO);                   // knee
    m.bevelBox(0.05,3.35,sd*2.35,1.95,1.35,1.85,0.26,SERVO);           // thigh
    hydraulic(m,-0.85,1.05,sd*2.35,2.15,0.20,SERVO,0);                 // shin ram
  }
  m.extrude(0,4.70,0,[[-3.20,-2.55],[1.70,-2.85],[3.30,-1.50],[3.30,1.50],
            [1.70,2.85],[-3.20,2.55]],1.85,TWR_ARM_D);                 // chassis
  m.extrude(0.15,6.55,0,[[-2.60,-2.00],[1.40,-2.25],[2.70,-1.15],[2.70,1.15],
            [1.40,2.25],[-2.60,2.00]],0.55,TWR_ARM);
  m.wedge(2.75,6.55,0,3.20,0.75,1.90,TWR_ARM,Math.PI/2,false);         // sloped nose
  /* LOAD BED — recessed, with rails and cargo actually strapped down. */
  const BB=[[-3.00,-1.95],[0.60,-1.95],[0.60,1.95],[-3.00,1.95]];
  m.extrude(-0.10,7.10,0,BB,0.28,TWR_MACH);
  m.extrude(-0.10,7.38,0,BB.map(q=>[q[0]*0.88,q[1]*0.82]),0.18,DARKER);
  for(const sd of [-1,1]){
    m.box(-1.20,7.38,sd*1.90,3.40,0.44,0.20,TWR_TRIM);                 // bed rail
    m.box(0.90,7.20,sd*2.10,2.20,0.30,0.52,sd>0?TEAM_A:TEAM_B);        // livery
  }
  kitBox(m,-1.80,7.50,0.75,1.70,0.95,1.70,TWR_MACH,0);
  stowage(m,-0.60,7.50,-1.30,2.00,0.90,RUST,0,41);
  /* WELDING RIG — a shielded head on a short arm, plainly a tool. */
  m.bevelBox(2.05,7.10,-1.35,1.35,1.20,1.30,0.26,TWR_COAT);
  m.box(3.10,7.55,-1.35,1.90,0.44,0.44,TWR_TRIM);
  m.bevelBox(4.15,7.35,-1.35,0.95,0.75,0.85,0.20,TWR_MACH);
  m.cyl(4.15,8.10,-1.35,0.42,0.16,0.42,7,ENERGY);                      // arc head
  /* CUTTING BOOM — telescopic, stepped, reaching forward and down. */
  m.bevelBox(1.95,7.10,1.45,1.30,1.15,1.25,0.24,TWR_COAT);
  m.box(3.05,8.05,1.45,2.30,0.60,0.60,TWR_TRIM,0.30);
  m.box(4.65,7.35,1.45,1.90,0.42,0.42,TWR_MACH,0.30);
  m.cyl(5.55,6.75,1.45,0.34,0.14,0.60,7,ENERGY);                       // cutter emitter
  hydraulic(m,2.30,7.55,1.45,1.70,0.20,TWR_MACH,0);
  m.cyl(-2.95,7.50,1.50,0.24,0.18,1.55,6,DARKER);
  m.cyl(-2.95,9.05,1.50,0.38,0.32,0.40,7,LAMP);                        // rotating beacon
  domRivets(m,1.40,7.44,0,2.60,3,TWR_TRIM,0);
  return {hull:m.build(),tur:null,s:0.98};
}

/* ---------------------------------------------------------------------------
   24 — WARDEN.  Repair / medic vehicle, hp 420, dmg 0, rng 0. UNARMED.
   A recovery tractor: hose reel with visible spooled line, a folding crane
   that reaches OVER the casualty, and stretcher racks down the flanks. The
   crane reaching down is the shape that says "working on something".
   --------------------------------------------------------------------------- */
function mdlDomWarden(){
  const m=MB();
  domTracks(m,10.4,2.65,2.30,3.00,4,0);
  const deck=domHullSlab(m,-0.20,1.90,10.0,6.20,1.35,0.80);            // deck ~4.05
  domProw(m,3.85,1.95,0,2.60,1.90,4.90);
  for(const sd of [-1,1]){
    /* STRETCHER RACKS — two loaded litters clipped to each flank. Nothing else
       in the roster carries anything shaped like this. */
    for(let k=0;k<2;k++)
      m.box(-1.30,deck+0.35+k*0.90,sd*3.10,4.60,0.42,1.10,k?TWR_TRIM:RUST);
    m.box(-1.30,deck+0.02,sd*3.10,4.80,0.34,1.35,TWR_COAT);            // rack frame
    m.box(1.60,deck+0.04,sd*2.35,3.20,0.30,0.56,sd>0?TEAM_A:TEAM_B);
  }
  /* HOSE REEL — two cheeks with spooled line between them. */
  for(const sd of [-1,1]) m.cyl(-2.20,deck,sd*1.35,1.55,1.55,0.34,9,TWR_TRIM);
  m.cyl(-2.20,deck+0.10,-1.05,1.25,1.25,2.10,8,DARKER);
  m.tube(-2.20,deck+2.05,0,1.15,0.72,0.42,9,ENERGY);                   // emitter head
  /* FOLDING CRANE */
  m.bevelBox(1.85,deck,0,1.60,1.65,1.85,0.30,TWR_COAT);
  m.cyl(1.85,deck+1.65,0,0.40,0.34,1.30,7,TWR_MACH);
  m.box(3.20,deck+2.85,0,3.30,0.56,0.56,TWR_TRIM);                     // upper boom
  m.box(4.75,deck+2.05,0,0.52,1.70,0.52,TWR_MACH);                     // drop link
  m.cyl(4.75,deck+1.05,0,0.78,0.48,0.70,8,ENERGY);                     // repair emitter
  hydraulic(m,2.45,deck+0.30,0,2.05,0.22,TWR_MACH,0);
  for(let k=0;k<3;k++)                                                  // hazard chevrons
    m.box(-3.10+k*0.85,deck+0.06,0,0.40,0.14,3.60,k&1?TWR_COAT:LAMP,0.42);
  m.cyl(-4.10,deck,1.60,0.24,0.18,1.45,6,DARKER);
  m.cyl(-4.10,deck+1.45,1.60,0.36,0.30,0.38,7,LAMP);                   // beacon
  ventBank(m,-3.60,deck+0.02,-1.60,1.70,1.90,3,TWR_MACH,0);
  deckCrown(m,-0.20,deck+0.02,0,9.4,5.8,TWR_ARM_D,TEAM_T);
  return {hull:m.build(),tur:null,s:0.96};
}

/* ---------------------------------------------------------------------------
   32 — PROSPECTOR.  Mobile ore miner, hp 190, dmg 0, rng 0. UNARMED.
   A rotary DRILL HEAD on the nose and an open ORE HOPPER over the back deck,
   with a conveyor running between them. The drill points forward and the
   hopper is visibly full — the economic action is legible from the battle
   camera without reading a single icon.
   --------------------------------------------------------------------------- */
function mdlDomMiner(){
  const m=MB();
  domTracks(m,10.6,2.75,2.35,3.05,4,1);
  const deck=domHullSlab(m,-0.30,1.95,10.0,6.40,1.35,0.80);            // deck ~4.10
  /* DRILL HEAD — stepped cutter cone with three cutting collars. */
  m.bevelBox(4.05,1.95,0,2.10,1.90,3.60,0.36,TWR_COAT);                // drill housing
  cylX(m,5.05,2.85,0,2.30,0.95,0.72,9,TWR_MACH,false);
  for(let k=0;k<3;k++) ringX(m,5.35+k*0.75,2.85,0,0.74,1.06,9,k===2?TWR_TRIM:TWR_MACH);
  cylX(m,7.35,2.85,0,1.30,0.66,0.06,8,TWR_TRIM,false);                 // cutter point
  hydraulic(m,3.05,2.10,0,1.90,0.24,TWR_MACH,0);
  /* ORE HOPPER — open box with sloped walls and a visible load. */
  const HP=[[-3.30,-2.55],[0.90,-2.55],[0.90,2.55],[-3.30,2.55]];
  m.extrude(-0.90,deck,0,HP,1.90,TWR_ARM_D);
  m.extrude(-0.90,deck+0.30,0,HP.map(q=>[q[0]*0.86,q[1]*0.82]),1.35,DARKER);
  stowage(m,-1.30,deck+1.55,0,3.20,3.20,RUST,0,63);                    // the ore itself
  for(const sd of [-1,1]){
    m.box(-0.90,deck+1.95,sd*2.60,4.20,0.30,0.56,sd>0?TEAM_A:TEAM_B);  // hopper rim livery
    m.box(2.00,deck+0.02,sd*2.30,2.60,0.30,0.54,TWR_TRIM);
  }
  m.box(1.55,deck+0.55,0,3.20,0.50,1.70,TWR_MACH,0.16);                // conveyor run
  domStack(m,-4.30,deck,1.55,2.20,0.58);
  ventBank(m,-4.30,deck+0.02,-1.55,1.80,1.90,3,TWR_MACH,0);
  m.cyl(3.05,deck,1.95,0.24,0.18,1.40,6,DARKER);
  m.cyl(3.05,deck+1.40,1.95,0.36,0.30,0.38,7,LAMP);                    // beacon
  domRivets(m,0.60,deck+0.06,0,3.60,3,TWR_TRIM,0);
  deckCrown(m,-0.30,deck+0.02,0,9.4,6.0,TWR_ARM_D,TEAM_T);
  return {hull:m.build(),tur:null,s:0.98};
}

/* ---------------------------------------------------------------------------
   14 — CORVETTE.  Light warship, hp 320 / dmg 24 / rng 115.
   The Dominion at sea is the Dominion on land: a slab-sided hull with a belt
   of applique along the waterline, a bolted blockhouse instead of a bridge,
   and heat stacks amidships. One gun forward on a real bearing ring.
   --------------------------------------------------------------------------- */
function mdlDomCorvette(){
  const m=MB();
  const waterline=[[-7.60,-2.20],[-6.30,-3.05],[3.60,-3.40],[7.10,-2.10],[8.05,-0.80],
                   [8.05,0.80],[7.10,2.10],[3.60,3.40],[-6.30,3.05],[-7.60,2.20]];
  const deck=[[-6.95,-2.00],[-5.80,-2.62],[3.50,-2.90],[6.75,-1.75],[7.45,-0.62],
              [7.45,0.62],[6.75,1.75],[3.50,2.90],[-5.80,2.62],[-6.95,2.00]];
  m.extrude(0,0,0,waterline,2.30,TWR_ARM_D);                           // displacement hull
  m.extrude(0,2.30,0,deck,1.35,TWR_ARM);                               // weather deck
  m.extrude(0.20,3.65,0,deck.map(p=>[p[0]*0.94,p[1]*0.86]),0.30,TEAM_A);
  for(const sd of [-1,1]){
    m.box(-0.25,1.10,sd*3.05,10.6,1.10,0.58,TWR_COAT);                 // applique belt
    domRivets(m,-0.25,1.62,sd*3.36,7.20,4,TWR_TRIM,0);
    m.box(0.60,2.52,sd*2.80,8.20,0.40,0.62,sd>0?TEAM_A:TEAM_B);        // fleet stripe
    m.box(-5.10,1.00,sd*1.55,4.00,1.40,1.00,DARKER);                   // propulsion tunnel
    tubeX(m,-7.85,1.10,sd*1.55,0.98,0.72,0.34,9,TWR_BORE);             // waterjet outlet
    ringX(m,-7.89,1.10,sd*1.55,0.28,0.42,8,HOT);
    m.bevelBox(1.80,3.95,sd*2.20,3.40,0.66,1.10,0.22,TWR_MACH);        // deck lockers
    domStack(m,-2.90,3.95,sd*1.60,2.60,0.62);
  }
  /* Blockhouse, not a bridge: a bolted armoured box with slits. */
  m.bevelBox(-1.20,3.95,0,5.40,2.10,4.20,0.50,TWR_ARM);
  m.extrude(-1.05,6.05,0,[[-2.10,-1.70],[1.40,-1.80],[2.35,-0.85],[2.35,0.85],
            [1.40,1.80],[-2.10,1.70]],1.45,TWR_ARM_D);
  m.bevelBox(-0.60,7.50,0,3.10,1.00,2.55,0.32,TEAM_T);                 // bridge roof livery
  m.box(1.25,6.55,0,0.30,0.42,2.20,TWR_BORE);                          // vision slit
  ventBank(m,-3.40,4.00,0,2.20,3.20,5,TWR_MACH,0);
  for(const sd of [-1,1]) for(let k=0;k<3;k++)
    m.tube(-4.55+k*0.82,3.98,sd*0.80,0.30,0.16,0.48,7,TWR_BORE);       // six VLS cells
  sensorMast(m,-1.60,8.50,0,2.35,TWR_TRIM);
  m.cyl(-1.60,9.70,0,1.65,0.30,0.30,10,TWR_TRIM);                      // search radar
  m.box(-1.60,10.00,0,0.24,0.80,2.55,DARKER);
  m.greeble(0.45,3.98,0,2.80,3.20,0.34,5,TWR_MACH,0,141);

  const t=MB();
  domRing(t,0,2.05,0.75);
  t.bevelBox(-0.20,0.75,0,3.90,1.75,3.50,0.42,TWR_ARM_D);
  t.bevelBox(0,2.50,0,3.20,0.55,2.85,0.22,TWR_ARM);
  t.box(1.60,0.60,0,1.15,1.10,1.65,TWR_COAT);                          // mantlet
  gunX(t,1.95,1.15,5.20,0.40,TWR_MACH);
  ringX(t,4.60,1.15,0,0.48,0.68,9,TWR_TRIM);
  for(const sd of [-1,1]) t.box(-0.60,2.20,sd*1.60,2.20,0.20,0.44,sd>0?TEAM_A:HOT);
  t.bevelBox(-1.55,0.80,0,1.10,1.20,2.40,0.24,DARKER);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:3.85,naval:1};
}

/* ---------------------------------------------------------------------------
   15 — DREADNOUGHT.  Capital warship, hp 1300 / dmg 75 / rng 290.
   The Corvette's language at four times the displacement: a full-length belt,
   a citadel amidships, four heat stacks, casemate secondaries on each beam and
   a twin main battery forward. Nothing is elegant; everything is bolted.
   --------------------------------------------------------------------------- */
function mdlDomDread(){
  const m=MB();
  const waterline=[[-13.2,-4.20],[-11.4,-5.10],[6.50,-5.70],[11.6,-3.60],[13.2,-1.40],
                   [13.2,1.40],[11.6,3.60],[6.50,5.70],[-11.4,5.10],[-13.2,4.20]];
  const deck=[[-12.4,-3.75],[-10.6,-4.55],[6.10,-5.10],[10.7,-3.10],[12.0,-1.15],
              [12.0,1.15],[10.7,3.10],[6.10,5.10],[-10.6,4.55],[-12.4,3.75]];
  m.extrude(0,0,0,waterline,3.55,TWR_ARM_D);
  m.extrude(0,3.55,0,deck,1.80,TWR_ARM);
  m.extrude(0.25,5.35,0,deck.map(p=>[p[0]*0.95,p[1]*0.88]),0.38,TEAM_A);
  for(const sd of [-1,1]){
    m.box(-0.55,1.45,sd*5.10,19.0,1.25,0.72,TWR_COAT);                 // full-length belt
    domRivets(m,-0.55,2.12,sd*5.50,13.0,5,TWR_TRIM,0);
    m.box(0.25,3.48,sd*4.75,16.2,0.56,0.82,sd>0?TEAM_A:TEAM_B);        // beam stripe
    m.box(-9.60,1.35,sd*2.50,5.20,2.00,1.40,DARKER);                   // turbine tunnel
    tubeX(m,-13.6,1.50,sd*2.50,1.24,0.96,0.46,9,TWR_BORE);
    ringX(m,-13.65,1.50,sd*2.50,0.42,0.66,8,HOT);
    /* Casemate secondaries — one readable gun per beam, in an armoured box. */
    m.bevelBox(2.60,5.75,sd*3.75,5.20,1.05,1.55,0.28,TWR_ARM_D);
    m.box(2.60,6.78,sd*3.75,4.10,0.26,1.05,TWR_TRIM);
    m.box(4.35,5.90,sd*3.75,1.60,1.20,1.50,TWR_COAT);
    gunX(m,5.05,6.45,3.10,0.24,TWR_MACH,sd*3.75);
    domStack(m,-5.60,5.75,sd*2.35,3.40,0.86);                          // four heat stacks
    domStack(m,-7.90,5.75,sd*2.35,2.90,0.74);
  }
  /* Citadel — armoured island with a bolted conning block on top. */
  m.bevelBox(-2.45,5.75,0,9.00,3.10,7.80,0.72,TWR_ARM);
  m.extrude(-2.20,8.85,0,[[-3.70,-3.20],[2.50,-3.40],[4.00,-1.70],[4.00,1.70],
            [2.50,3.40],[-3.70,3.20]],2.50,TWR_ARM_D);
  m.extrude(-1.75,11.35,0,[[-2.80,-2.35],[1.80,-2.50],[3.00,-1.15],[3.00,1.15],
            [1.80,2.50],[-2.80,2.35]],1.30,TEAM_A);
  m.box(1.00,9.60,0,0.34,0.48,3.20,TWR_BORE);                          // conning slit
  ventBank(m,-6.40,5.78,0,3.10,5.40,7,TWR_MACH,0);
  for(let k=0;k<3;k++) for(const sd of [-1,1])
    m.tube(-8.70+k*1.15,5.76,sd*1.18,0.38,0.20,0.62,7,TWR_BORE);       // six VLS cells
  m.bevelBox(7.00,5.76,0,3.60,0.74,5.20,0.24,DARKER);                  // fore magazine block
  m.greeble(7.00,6.50,0,2.55,4.10,0.44,4,TWR_MACH,0,161);
  sensorMast(m,-2.60,12.65,0,3.10,TWR_TRIM);
  m.cyl(-2.60,14.40,0,2.35,0.40,0.32,12,TWR_TRIM);                     // air-search radar
  m.box(-2.60,14.72,0,0.30,1.15,3.70,DARKER);
  m.greeble(-0.30,5.76,0,5.20,5.20,0.40,4,TWR_MACH,0,171);

  const t=MB();
  domRing(t,0,3.40,1.10);
  t.bevelBox(-0.50,1.10,0,7.20,3.00,6.40,0.68,TWR_ARM_D);
  t.bevelBox(-0.20,4.10,0,6.20,0.95,5.30,0.30,TWR_ARM);
  t.box(3.00,0.85,0,2.10,1.85,3.90,TWR_COAT);                          // shared mantlet
  for(const sd of [-1,1]){
    gunX(t,3.45,1.75,8.90,0.54,TWR_MACH,sd*1.15);                      // true twin battery
    ringX(t,9.80,1.75,sd*1.15,0.64,0.88,9,TWR_TRIM);
    t.bevelBox(-1.60,1.60,sd*2.95,4.20,2.00,0.70,0.26,TWR_COAT);
    t.box(-1.60,3.66,sd*3.24,2.60,0.22,0.54,sd>0?TEAM_A:HOT);
  }
  t.bevelBox(-3.40,1.20,0,2.10,2.20,4.60,0.36,DARKER);                 // bustle
  t.box(-3.40,3.44,0,1.50,0.24,3.20,TEAM_T);
  return {hull:m.build(),tur:t.build(),s:1.0,turH:5.65,naval:1};
}

/* ---------------------------------------------------------------------------
   CRIMSON MATERIAL CONVERSION
   ---------------------------------------------------------------------------
   Geometry already gives the Dominion its blunt prows, applique, rivets and
   exposed stacks. This pass makes those shapes read as aged siege machinery
   under the same world light: cast iron for primary armor, riveted sheet for
   applique, heat-darkened machinery for weapons and vents, and soot-streaked
   siege steel in recesses. Team panels remain masks rather than a red wash. */
const DOM_LEGION_MAT=Object.freeze({
  [MAT.PLATE]:MAT.LEGION_CAST,
  [MAT.GREEBLE]:MAT.LEGION_SIEGE,
  [MAT.TREAD]:MAT.TREAD_WEAR,
  [MAT.TWR_ARMOR]:MAT.LEGION_CAST,
  [MAT.TWR_MACH]:MAT.LEGION_SIEGE,
  [MAT.TWR_COAT]:MAT.LEGION_RIVET,
  [MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
  [MAT.TWR_PAD]:MAT.LEGION_SIEGE,
  [MAT.SYN_CONDUIT]:MAT.LEGION_THERMITE
});
/* Stage D1 bespoke semantic packs. These contracts are deliberately smaller
   than a faction-wide remap: the live V2 material path provides shared AO,
   microdetail and damage, while each chassis reserves its own landmark
   materials until its authored BaseAO/NRE/mask maps are baked. `maps:null`
   means exactly that -- semantic-bake is not a claim that UV texture sets
   already exist. Keep SERVO out of these overrides: it is a vertex-stage gait
   marker, not an ordinary material, and rebinding it strands walker legs. */
const DOM_LEGION_BESPOKE_PACKS=Object.freeze({
  0:Object.freeze({
    id:'legion-striker-v2', source:'authored', maps:'legion-striker-v2',
    surfaces:Object.freeze({[MAT.TRIM]:MAT.LEGION_RIVET})
  }),
  1:Object.freeze({
    id:'legion-rhino-v2', source:'authored', maps:'legion-rhino-v2',
    surfaces:Object.freeze({
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,
      [MAT.TWR_COAT]:MAT.LEGION_RIVET
    })
  }),
  2:Object.freeze({
    id:'legion-goliath-v2', source:'authored', maps:'legion-goliath-v2',
    surfaces:Object.freeze({
      /* Armoured landmark plates, never SERVO gait geometry. */
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_GLOW]:MAT.LEGION_THERMITE
    })
  }),
  3:Object.freeze({
    id:'legion-thumper-v2', source:'authored', maps:'legion-thumper-v2',
    surfaces:Object.freeze({
      /* The carriage stays soot-dark while the gun's heat collars remain a
         localized thermite signature, so it reads as artillery at RTS range. */
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_GLOW]:MAT.LEGION_THERMITE
    })
  }),
  5:Object.freeze({
    id:'legion-wasp-v2', source:'authored', maps:'legion-wasp-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_GLOW]:MAT.WEAPON_GLOW
    })
  }),
  6:Object.freeze({
    id:'legion-longbow-v2', source:'authored', maps:'legion-longbow-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_GLOW]:MAT.CHARGE_STRIP
    })
  }),
  7:Object.freeze({
    id:'legion-hornet-v2', source:'authored', maps:'legion-hornet-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_GLOW]:MAT.LEGION_THERMITE
    })
  }),
  8:Object.freeze({
    id:'legion-titan-v2', source:'authored', maps:'legion-titan-v2',
    surfaces:Object.freeze({
      /* Do not replace the TITAN's SERVO gait channel. */
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_GLOW]:MAT.LEGION_THERMITE
    })
  }),
  9:Object.freeze({
    id:'legion-pyro-v2', source:'authored', maps:'legion-pyro-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_GLOW]:MAT.LEGION_THERMITE
    })
  }),
  10:Object.freeze({
    id:'legion-vulture-v2', source:'authored', maps:'legion-vulture-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_GLOW]:MAT.CHARGE_STRIP
    })
  }),
  11:Object.freeze({
    id:'legion-bulwark-v2', source:'authored', maps:'legion-bulwark-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.SYN_CONDUIT]:MAT.CHARGE_STRIP
    })
  }),
  14:Object.freeze({
    id:'legion-corvette-v2', source:'authored', maps:'legion-corvette-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_GLOW]:MAT.WEAPON_GLOW
    })
  }),
  15:Object.freeze({
    id:'legion-dreadnought-v2', source:'authored', maps:'legion-dreadnought-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_GLOW]:MAT.LEGION_THERMITE
    })
  }),
  16:Object.freeze({
    id:'legion-bombard-v2', source:'authored', maps:'legion-bombard-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_GLOW]:MAT.LEGION_THERMITE
    })
  }),
  17:Object.freeze({
    id:'legion-raptor-v2', source:'authored', maps:'legion-raptor-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_GLOW]:MAT.WEAPON_GLOW
    })
  }),
  18:Object.freeze({
    id:'legion-scorcher-v2', source:'authored', maps:'legion-scorcher-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_GLOW]:MAT.LEGION_THERMITE
    })
  }),
  19:Object.freeze({
    id:'legion-constructor-v2', source:'authored', maps:'legion-constructor-v2',
    surfaces:Object.freeze({
      /* Its servo channels remain untouched; only utility landmarks change. */
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.SYN_CONDUIT]:MAT.CHARGE_STRIP
    })
  }),
  20:Object.freeze({
    id:'legion-reaper-v2', source:'authored', maps:'legion-reaper-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_GLOW]:MAT.LEGION_THERMITE
    })
  }),
  21:Object.freeze({
    id:'legion-cinder-v2', source:'authored', maps:'legion-cinder-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_GLOW]:MAT.LEGION_THERMITE
    })
  }),
  22:Object.freeze({
    id:'legion-lancer-v2', source:'authored', maps:'legion-lancer-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_GLOW]:MAT.CHARGE_STRIP
    })
  }),
  23:Object.freeze({
    id:'legion-resonator-v2', source:'authored', maps:'legion-resonator-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_GLOW]:MAT.CHARGE_STRIP
    })
  }),
  24:Object.freeze({
    id:'legion-warden-v2', source:'authored', maps:'legion-warden-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.SYN_CONDUIT]:MAT.CHARGE_STRIP
    })
  }),
  25:Object.freeze({
    id:'legion-kestrel-v2', source:'authored', maps:'legion-kestrel-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_GLOW]:MAT.WEAPON_GLOW
    })
  }),
  26:Object.freeze({
    id:'legion-basilisk-v2', source:'authored', maps:'legion-basilisk-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,
      [MAT.TWR_GLOW]:MAT.LEGION_THERMITE
    })
  }),
  27:Object.freeze({
    id:'legion-harbinger-v2', source:'authored', maps:'legion-harbinger-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_GLOW]:MAT.LEGION_THERMITE
    })
  }),
  28:Object.freeze({
    id:'legion-praetor-v2', source:'authored', maps:'legion-praetor-v2',
    surfaces:Object.freeze({
      [MAT.TRIM]:MAT.LEGION_CAST,
      [MAT.TWR_GLOW]:MAT.LEGION_THERMITE
    })
  }),
  32:Object.freeze({
    id:'legion-prospector-v2', source:'authored', maps:'legion-prospector-v2',
    surfaces:Object.freeze({
      /* SERVO remains the animation channel on this walking utility chassis. */
      [MAT.TRIM]:MAT.LEGION_RIVET,
      [MAT.SYN_CONDUIT]:MAT.CHARGE_STRIP
    })
  })
});
function domLegionSurfacePass(geo,pack){
  if(!geo||!geo.v)return geo;
  const v=geo.v;
  for(let o=11;o<v.length;o+=VFLOATS){
    const raw=v[o],sgn=raw<0?-1:1,packed=Math.abs(raw);
    const whole=Math.floor(packed),src=whole-1;
    const dst=pack&&pack.surfaces[src]!==undefined?pack.surfaces[src]:DOM_LEGION_MAT[src];
    if(dst!==undefined)v[o]=sgn*((dst+1)+(packed-whole));
  }
  return geo;
}
const DOM_LEGION_FACTORY_CACHE=new Map();
function domLegionFactory(fn,slot){
  /* A single builder can intentionally service several role slots. Cache by
     slot too: caching only `fn` silently applied the first launcher's bespoke
     contract to Reaper, Cinder and Harbinger, defeating per-unit V2 packs. */
  const key=slot+':'+fn.name;
  if(DOM_LEGION_FACTORY_CACHE.has(key))return DOM_LEGION_FACTORY_CACHE.get(key);
  const wrapped=function(){
    const g=fn();
    const pack=DOM_LEGION_BESPOKE_PACKS[slot]||null;
    domLegionSurfacePass(g.hull,pack);domLegionSurfacePass(g.tur,pack);
    return g;
  };
  Object.defineProperty(wrapped,'name',{value:'domRed'+slot+'_'+fn.name});
  DOM_LEGION_FACTORY_CACHE.set(key,wrapped);
  return wrapped;
}

/* ============================================================================
   SLOT MAP.  Types indices, matching TYPES[] in sim.js. Roles that are
   genuinely the same share a builder; roles whose stat line demands a
   different silhouette do not.
   ============================================================================ */
const UNIT_MDL_LEGION={
  0:domLegionFactory(mdlLegionTrooper,0), // Striker      — shield breacher
  1:domLegionFactory(mdlLegionRhino,1),   // Rhino        — slab battle tank
  2:domLegionFactory(mdlDomWalker,2),      // Goliath      — assault walker (SERVO legs)
  3:domLegionFactory(mdlDomArty,3),        // Thumper      — field artillery
  5:domLegionFactory(mdlDomFlyer,5),       // Wasp         — light interceptor
  6:domLegionFactory(mdlDomMissile,6),     // Longbow      — long-range missile carrier
  7:domLegionFactory(mdlDomMissile,7),     // Hornet       — rocket vehicle
  8:domLegionFactory(mdlDomTitan,8),       // TITAN        — walking fortress (SERVO legs)
  9:domLegionFactory(mdlLegionPyro,9),     // Pyro         — furnace trooper
  10:domLegionFactory(mdlDomHunter,10),    // Vulture      — long-gun hunter
  11:domLegionFactory(mdlDomShield,11),    // Bulwark      — shield generator, UNARMED
  14:domLegionFactory(mdlDomCorvette,14),  // Corvette     — light warship
  15:domLegionFactory(mdlDomDread,15),     // Dreadnought  — capital warship
  16:domLegionFactory(mdlDomSiege,16),     // Bombard      — siege platform, longest reach
  17:domLegionFactory(mdlDomGunship,17),   // Raptor       — heavy gunship
  18:domLegionFactory(mdlDomFlame,18),     // Scorcher     — armoured flame tank
  19:domLegionFactory(mdlDomEngineer,19),  // Constructor  — engineer, UNARMED (SERVO legs)
  20:domLegionFactory(mdlDomSplash,20),    // Reaper       — mortar battery
  21:domLegionFactory(mdlDomSplash,21),    // Cinder       — close-support launcher
  22:domLegionFactory(mdlDomHunter,22),    // Lancer       — long-range lance
  23:domLegionFactory(mdlDomSonic,23),     // Resonator    — sonic platform
  24:domLegionFactory(mdlDomWarden,24),    // Warden       — repair / medic, UNARMED
  25:domLegionFactory(mdlDomFlyer,25),     // Kestrel      — fast scout flyer
  26:domLegionFactory(mdlDomHeavy,26),     // Basilisk     — experimental heavy
  27:domLegionFactory(mdlDomBattery,27),   // Harbinger    — siege battery
  28:domLegionFactory(mdlPraetor,28),      // Lord Vex     — Dominion-exclusive commander
  32:domLegionFactory(mdlDomMiner,32),     // Prospector   — ore miner, UNARMED
};

