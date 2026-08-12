;
;
/* ============================================================================
   BUILDABLE FACTION AIRLIFTS — geometry-only takeover
   ----------------------------------------------------------------------------
   airlift.js owns the Atlas simulation, cargo manifests and mobile orders.
   This file loads immediately after it and changes only model factories before
   initModels() uploads them. Keeping the art takeover separate means transport
   saves and mechanics cannot fork by faction.
   ============================================================================ */

/* Four honest, disconnected nacelles are part of the Atlas silhouette, not
   painted engine marks on one broad wing. The coordinates are also a compact
   art-contract used by the render regression. */
const MF_AFL_ATLAS_LIFT_PODS=[[-5.4,-7.4],[-5.4,7.4],[4.8,-7.4],[4.8,7.4]];
const MF_AFL_PHASE_LIFT_NODES=[[5.7,-3.2],[5.7,3.2],[-.8,-5.7],[-.8,5.7],[-6.1,-8.0],[-6.1,8.0]];
const MF_AFL_PHASE_APERTURE=[-.2,2.0,3.2];

/* Custom Coalition colours are material-routed just like the core palette.
   Without these bindings the builder would inherit whichever material the
   previous primitive happened to use, making the Ark's energy nodes matte. */
const MF_AFL_SYN_HULL=C(72,88,92), MF_AFL_SYN_EDGE=C(142,176,166), MF_AFL_SYN_GLOW=C(104,255,146);
COL_MAT.set(MF_AFL_SYN_HULL,MAT.TWR_COAT);
COL_MAT.set(MF_AFL_SYN_EDGE,MAT.TWR_MACH);
COL_MAT.set(MF_AFL_SYN_GLOW,MAT.LAMP);

/* TERRAN FRONTLINE — ATLAS SKYCRANE
   A narrow armoured cargo spine carries a framed forward cockpit and a real
   shadowed rear ramp. Four lift pods sit beyond thin outriggers, leaving clear
   daylight between pod, hull and neighbour at command zoom. */
function mfAflAtlasModel(){
  const m=MB();
  const spine=[[-10.2,-2.8],[-8.0,-3.5],[4.8,-3.25],[9.5,-2.0],[10.8,0],
               [9.5,2.0],[4.8,3.25],[-8.0,3.5],[-10.2,2.8]];
  m.extrude(0,2.7,0,spine,3.15,MET_D);                         // cargo pressure hull
  m.extrude(-1.2,5.8,0,spine.map(p=>[p[0]*.72,p[1]*.70]),1.25,MET);
  m.bevelBox(6.9,5.25,0,5.2,1.25,5.0,.38,MET_L);             // cockpit frame
  m.extrude(7.4,6.45,0,[[-2.0,-2.05],[1.45,-1.35],[2.0,0],[1.45,1.35],[-2.0,2.05]],
            1.45,GLASS);                                      // unmistakable forward canopy
  m.box(7.4,7.94,0,3.5,.24,4.0,DARK);                        // canopy roof bar
  for(const sd of [-1,1])m.box(7.9,6.82,sd*2.18,3.4,.28,.25,TEAM_T,.08*sd);

  /* Rear opening is layered: housing, black aperture, then a projecting ramp
     lip. At mobile tilt this remains a readable exit instead of a flat end. */
  m.bevelBox(-8.4,3.45,0,4.1,2.6,6.2,.45,MET_D);
  m.box(-10.28,3.78,0,.34,2.15,4.6,DARKER);
  m.wedge(-10.72,2.75,0,1.15,.55,4.9,MET_L,0,true);
  for(const sd of [-1,1])m.box(-10.55,3.05,sd*2.18,.25,.30,.42,LAMP);

  for(const P of MF_AFL_ATLAS_LIFT_PODS){
    const x=P[0],z=P[1],sd=Math.sign(z);
    m.bevelBox(x,3.7,sd*5.25,3.0,.65,4.2,.22,MET_D);          // narrow outrigger
    m.bevelBox(x,2.1,z,4.7,3.0,4.0,.48,MET_D);               // separated pod casing
    m.bevelBox(x,5.05,z,3.55,1.0,3.0,.26,MET_L);
    m.cyl(x,.35,z,1.60,1.38,1.55,14,DARKER);                 // downward lift bell
    m.ring(x,1.94,z,1.02,1.48,14,ENERGY);                    // visible lift core
    m.tube(x,5.98,z,1.28,.72,.42,12,DARKER);                 // open intake, not a flat cap
    m.box(x,5.48,z+sd*1.58,2.35,.24,.24,TEAM_A);
    m.box(x+1.42,4.28,z,1.05,.30,2.55,MET_L);                // service hatch rail
  }

  /* Vehicle-scale roof detail breaks up the long transport body without
     changing the narrow load-bearing silhouette. */
  m.bevelBox(-1.8,7.05,0,7.6,.78,4.6,.24,TEAM_T);
  ventBank(m,-2.0,7.86,0,4.8,3.7,6,DARK,0);
  m.greeble(-5.8,7.58,0,2.8,3.3,.55,5,MET_L,0,2471);
  for(const sd of [-1,1]){
    glowStrip(m,1.7,7.26,sd*2.18,5.0,ENERGY,0);
    m.bevelBox(-3.7,2.15,sd*3.45,4.6,.78,.82,.18,DARKER);     // landing rail
    for(const x of [-5.2,-2.2])m.cyl(x,.25,sd*3.45,.42,.42,1.25,8,RUBBER);
  }
  sensorMast(m,-6.2,7.25,1.15,1.75,MET_L);
  return {hull:m.build(),tur:null,s:1.16,air:1};
}

/* SYNDICATE COALITION — PHASE ARK
   No cockpit, tail, cargo fuselage or Terran nacelles are reused. Separate
   shallow delta plates form a broad triangular craft around an actual open
   centre; the illuminated ring bridges that opening as a teleport aperture.
   Six distributed nodes provide lift, so its energy language is structural. */
function mfAflPhaseArkModel(){
  const m=MB();
  for(const sd of [-1,1]){
    /* Two convex plates per side avoid a hidden concave-cap fan while leaving
       the circular middle physically absent. */
    m.extrude(0,.65,0,[[9.8,sd*1.15],[-8.6,sd*10.2],[-6.3,sd*4.15]],1.45,MF_AFL_SYN_HULL);
    m.extrude(0,1.25,0,[[9.8,sd*1.15],[-6.3,sd*4.15],[2.75,sd*3.05]],1.05,TWR_ARM_D);
    m.box(-1.7,2.31,sd*6.1,10.6,.20,.58,MF_AFL_SYN_EDGE,sd*.32);
    m.box(-3.8,2.53,sd*7.65,6.0,.16,.34,TEAM_T,sd*.52);
  }
  m.extrude(0,.72,0,[[10.5,0],[2.75,-2.85],[2.75,2.85]],1.62,TWR_ARM_D); // delta nose, no canopy
  m.extrude(0,.70,0,[[-8.4,-3.9],[-2.8,-3.0],[-2.8,3.0],[-8.4,3.9]],1.55,MF_AFL_SYN_HULL);
  m.bevelBox(-5.7,2.28,0,4.4,.48,5.8,.18,MF_AFL_SYN_EDGE);   // rear field bridge, not a tail

  const A=MF_AFL_PHASE_APERTURE;
  m.ring(A[0],2.18,0,A[1],A[2],28,DARKER);                  // structural aperture rim
  m.ring(A[0],2.38,0,2.30,2.88,28,MF_AFL_SYN_GLOW);         // open luminous teleport annulus
  m.ring(A[0],2.48,0,1.82,2.12,28,MF_AFL_SYN_EDGE);
  for(let k=0;k<8;k++){
    const a=k/8*TAU;
    m.box(A[0]+Math.cos(a)*3.05,2.22,Math.sin(a)*3.05,.72,.36,.34,MF_AFL_SYN_EDGE,-a);
  }

  for(const P of MF_AFL_PHASE_LIFT_NODES){
    const x=P[0],z=P[1];
    m.cyl(x,.34,z,.88,.72,.58,12,TWR_MACH);
    m.ring(x,1.02,z,.62,1.05,14,MF_AFL_SYN_GLOW);
    m.sphere(x,1.13,z,.56,8,MF_AFL_SYN_GLOW,.62,false);
    m.ring(x,1.63,z,.35,.76,12,MF_AFL_SYN_EDGE);
  }
  /* Small field-control bosses sell scale while keeping the entire craft
     shallower than one Atlas lift pod. */
  for(const sd of [-1,1])for(const x of [-5.4,-2.2,1.2,4.6])
    m.bevelBox(x,2.35,sd*(3.8+(.5-Math.abs(x)*.025)),1.25,.44,.92,.13,
      (x===1.2||x===-5.4)?MF_AFL_SYN_GLOW:MF_AFL_SYN_EDGE);
  return {hull:m.build(),tur:null,s:1.17,air:1};
}

/* Safe because main.js calls initModels only after every manifest script has
   loaded. The default mesh serves Terran/Nova; only the Coalition receives the
   Phase Ark through the existing faction registry. */
UNIT_MDL[MF_UT_AIRLIFT]=mfAflAtlasModel;
FAC_KIT.nova[MF_UT_AIRLIFT]=mfAflAtlasModel;
FAC_KIT.syndicate[MF_UT_AIRLIFT]=mfAflPhaseArkModel;

