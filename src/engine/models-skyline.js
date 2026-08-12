;
;
/* ============================================================================
   SKYLINE LANDMARKS — large-scale worldbuilding verticals
   ----------------------------------------------------------------------------
   The tallest thing any battlefield owned was an 87-unit derelict block — the
   whole "city" sat below the height of one gameplay building's footprint, so
   districts read as crates, never as a metropolis a war had hollowed out.
   These are true skyscrapers: 260–335 world units, authored at plot scale
   (≈50-unit footprint, the planner's kind-5 anchor lot), with LIT_WIN /
   COOL_WIN strips the night shader already knows how to sell.

   Three silhouettes, deliberately distinct at command zoom:
     mdlSkyTower1 — stepped brutalist monolith (human worlds)
     mdlSkyTower2 — twin spires joined by a high skybridge
     mdlSkySpire  — an alien crystalline monolith for the foreign worlds:
                    grown, not built, lit from inside through CRYST facets.

   MeshBuilder convention notes (learned the hard way elsewhere): box() takes
   the BASE y, not the centre; the primitive patch resolves materials from the
   exact palette-constant array passed, so WALL / LIT_WIN / ENERGY carry their
   semantics; tri() is NOT patched, so crystalSpike inherits m.mat(MAT.CRYST).
   ============================================================================ */

/* Vertical window strips proud of each face, floor-banded. LIT_WIN carries
   warm interiors, COOL_WIN cold service floors, and an unlit band every fifth
   row keeps the tower from reading as a paper lantern. y0/y1 are world bases. */
function skyStrips(m,cx,cz,w,d,y0,y1,step,warm){
  const half=w/2, dh=d/2;
  let row=0;
  for(let y=y0;y<y1-step*0.45;y+=step,row++){
    const litC=(row%5===4)?WALL_D:(warm&&(row%2===0)?LIT_WIN:COOL_WIN);
    const hh=step*0.44;
    for(const sd of [-1,1]){
      m.box(cx+sd*(half+0.55), y, cz, 1.1, hh, d*0.60, litC);
      m.box(cx, y, cz+sd*(dh+0.55), w*0.60, hh, 1.1, litC);
    }
  }
}

function mdlSkyTower1(){
  const m=MB();
  /* Stepped monolith: plinth, three setback tiers, service crown, mast. */
  m.box(0,  0,0, 54,12,54, CONC_D);                       // plinth 0–12
  m.box(0, 12,0, 46,10,46, CONC);                         // podium 12–22
  m.box(0, 22,0, 40,96,40, WALL);                         // tier 1 22–118
  skyStrips(m,0,0,40,40,30,112,11,true);
  m.box(0,118,0, 44,5,44, ROOFC);                         // setback ledge
  m.box(0,123,0, 32,92,32, WALL_D);                       // tier 2 123–215
  skyStrips(m,0,0,32,32,130,208,11,true);
  m.box(0,215,0, 35,5,35, ROOFC);
  m.box(0,220,0, 23,74,23, WALL);                         // tier 3 220–294
  skyStrips(m,0,0,23,23,226,288,11,false);
  m.box(0,294,0, 26,5,26, ROOF_T);                        // crown ring
  m.box(0,299,0, 13,11,13, MET_D);                        // plant room
  for(const sd of [-1,1]) m.box(sd*8.4,299,0, 2.4,9,2.4, MET_D);
  m.cyl(0,310,0, 1.3,0.7, 22, 6, MET_L);                  // mast 310–332
  m.box(0,332,0, 2.2,2.2,2.2, HOT);                       // aviation beacon
  /* Corner piers give the monolith its brutalist read from directly above. */
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    m.box(sx*20.4,12,sz*20.4, 4.4,204,4.4, CONC_D);
    m.box(sx*20.4,216,sz*20.4, 3.4,24,3.4, CONC);
  }
  return m.build();
}

function mdlSkyTower2(){
  const m=MB();
  /* Twin spires + high skybridge — a silhouette no gameplay structure has. */
  m.box(0,0,0, 56,10,40, CONC_D);                         // shared plinth
  const twr=(cx,H,warm)=>{
    m.box(cx,10,0, 20,H,20, WALL);
    skyStrips(m,cx,0,20,20,18,10+H-8,10.5,warm);
    m.box(cx,10+H,0, 22,5,22, ROOFC);
    m.box(cx,15+H,0, 9,8,9, MET_D);
    m.cyl(cx,23+H,0, 1.1,0.6, 15, 6, MET_L);
    m.box(cx,38+H,0, 1.8,1.8,1.8, HOT);                   // aviation beacon
  };
  twr(-16,230,true); twr(16,200,false);                    // tops 268 / 238
  m.box(0,152,0, 14,7,10, WALL_D);                        // skybridge deck
  m.box(0,159,0, 14,2,10, ROOF_T);
  skyStrips(m,0,0,12,8,153,158,7,true);
  for(const sd of [-1,1]) m.box(sd*6.2,144,0, 1.6,8,1.6, MET_D);  // hangers
  return m.build();
}

function mdlSkySpire(){
  const m=MB(); m.mat(MAT.CRYST);
  /* Alien monolith: one dominant crystal blade with satellite spires, grown
     through a fractured plinth. Authored near-white — the render tint owns
     the world's hue, so one model serves every foreign biome. crystalSpike
     emits through tri(), which the material patch leaves alone, so the CRYST
     transmission path lights the whole growth from inside. */
  const BASE=C(150,140,185), MID=C(210,205,240), TIP=C(255,255,255);
  crystalSpike(m,  0.0, 0.0, 11.5, 320,  4.0,  2.2, 0.35, BASE,MID,TIP);
  crystalSpike(m, 13.5, 4.5,  6.8, 195,  7.5,  3.5, 1.75, BASE,MID,TIP);
  crystalSpike(m,-11.5, 8.0,  5.9, 152, -6.5,  4.5, 0.95, BASE,MID,TIP);
  crystalSpike(m, -7.0,-12.5, 5.2, 128, -4.0, -7.0, 2.45, BASE,MID,TIP);
  crystalSpike(m, 10.0,-9.5,  4.4,  98,  5.5, -5.5, 3.05, BASE,MID,TIP);
  /* Fractured plinth the growth erupted through. */
  m.box(0, 0,0, 34,14,34, CONC_D);
  m.box(0,14,0, 26,4,26, WALL_D);
  for(let k=0;k<6;k++){
    const a=k/6*Math.PI*2, r=15.5;
    m.box(Math.cos(a)*r, 0, Math.sin(a)*r, 5.5,9,5.5, CONC, a);
  }
  m.mat(MAT.CRYST);
  for(let k=0;k<5;k++){                                    // shard ring debris
    const a=k/5*Math.PI*2+0.5;
    crystalSpike(m, Math.cos(a)*21, Math.sin(a)*21, 2.6, 26+((k*13)%18), Math.cos(a)*3, Math.sin(a)*3, k*1.3, BASE,MID,TIP);
  }
  /* Luminous seams RIDE THE SURFACE of the blade — buried inside the crystal
     they were swallowed whole at night. Four ribs lean with the taper, plus
     two halo rings and vent glows at the root: the cyan structure lines that
     make the monolith read as ALIVE from command zoom after dark. */
  for(let k=0;k<4;k++){
    const a=k/4*Math.PI*2+0.4;
    const rx=Math.cos(a), rz=Math.sin(a);
    for(let seg=0;seg<5;seg++){
      const y0=18+seg*30, rr2=10.8*(1-(y0+15)/330);   // hug the taper
      m.box(rx*(rr2+1.3), y0, rz*(rr2+1.3), 2.6, 26, 2.6, ENERGY);
    }
  }
  m.box(0, 186, 0, 12.5, 4.5, 12.5, ENERGY);          // high halo rings
  m.box(0, 122, 0, 16.5, 3.5, 16.5, ENERGY);
  for(let k=0;k<6;k++){                                // root vents
    const a=k/6*Math.PI*2+0.25;
    m.box(Math.cos(a)*13.5, 17, Math.sin(a)*13.5, 3.4, 5, 3.4, ENERGY);
  }
  return m.build();
}


/* ---------------------------------------------------------------------------
   GROUND SKIRT — the piece that makes a structure BELONG to the ground.
   A model box meeting graded terrain at a perfect 90 degree line is exactly
   what reads as "pasted on": real buildings sit in a berm of spoil, drifted
   soil and broken slab. This is a two-band flare drawn per structure, tinted
   with the BIOME's ground colour (not the model's), so a tower on arctic ice
   is skirted in ice and the same tower on ashland sits in slag.

   Built as a rectangle-to-rectangle loop so the instance's cross-axis lane
   can stretch it to a footprint's real aspect: scale = width, wide = depth.
   Four quads per band covers corners too, because the loop is convex.
   --------------------------------------------------------------------------- */
function skirtBand(m,r0,y0,r1,y1,col){
  const A=[[-r0,-r0],[r0,-r0],[r0,r0],[-r0,r0]];
  const B=[[-r1,-r1],[r1,-r1],[r1,r1],[-r1,r1]];
  for(let k=0;k<4;k++){
    const j=(k+1)&3;
    m.quad([A[k][0],y0,A[k][1]],[A[j][0],y0,A[j][1]],
           [B[j][0],y1,B[j][1]],[B[k][0],y1,B[k][1]],col);
  }
}
function mdlBaseSkirt(){
  const m=MB();
  /* Band 1: the structural berm, proud of the wall and steep.
     Band 2: the long soil feather that dies into the terrain. */
  skirtBand(m, 0.50, 0.075, 0.70,-0.010, CONC_D);
  skirtBand(m, 0.70,-0.010, 0.98,-0.055, C(126,120,110));
  /* Spoil heaps break the straight contact line. Sizes and offsets are
     deliberately uneven — a regular ring of identical lumps reads as a
     decoration, an irregular one reads as debris. */
  const L=[[0.62,0.18,0.16,0.055],[-0.55,-0.42,0.13,0.042],[0.10,-0.66,0.18,0.048],
           [-0.68,0.30,0.11,0.036],[0.48,0.60,0.14,0.040],[-0.22,0.70,0.10,0.030],
           [0.72,-0.34,0.12,0.034],[-0.44,0.06,0.09,0.026]];
  for(const [lx,lz,r,h] of L) m.box(lx,-0.012,lz, r,h,r*0.82, C(138,132,122), (lx*7+lz*13));
  return m.build();
}

/* Partial collapse for the skyline anchors: the podium and a sheared stump of
   the first tier, left standing in its own wreckage. Swapped in at half
   health so a skyscraper visibly COMES DOWN in stages instead of blinking
   out of existence when its bar empties. */
function mdlSkyStump(){
  const m=MB();
  m.box(0, 0,0, 54,12,54, CONC_D);
  m.box(0,12,0, 46,10,46, CONC);
  m.box(0,22,0, 40,44,40, WALL);                          // sheared at 66
  skyStrips(m,0,0,40,40,30,58,11,false);
  /* A shear is a jagged line, never a clean lid: broken floor plates at
     different heights, with rebar stubs standing proud of them. */
  const P=[[-12,66,-11,15,5,14],[9,66,10,17,9,15],[-8,66,13,13,3,12],[14,66,-9,11,7,11]];
  for(const [x,y,z,w,h,d] of P) m.box(x,y,z, w,h,d, CONC_D);
  for(let k=0;k<7;k++){
    const a=k/7*Math.PI*2+0.4, r=13+((k*5)%9);
    m.box(Math.cos(a)*r, 70, Math.sin(a)*r, 0.9, 5+((k*3)%7), 0.9, MET_D);
  }
  for(const sx of [-1,1]) for(const sz of [-1,1])
    m.box(sx*20.4,12,sz*20.4, 4.4,52,4.4, CONC_D);        // piers survive the shear
  return m.build();
}

/* REGISTRATION BY TAKEOVER (AGENTS.md): wrap initModels so both the boot path
   and the glrecover.js context-loss rebuild pick the skyline up, with zero
   edits inside models.js itself. */
const skyBaseInitModels=initModels;
initModels=function(){
  skyBaseInitModels();
  FX.sky1=new InstMesh(gl,mdlSkyTower1(),48);
  FX.sky2=new InstMesh(gl,mdlSkyTower2(),48);
  FX.skyA=new InstMesh(gl,mdlSkySpire(),48);
  FX.skyS=new InstMesh(gl,mdlSkyStump(),48);
  /* Every relic and every player structure can carry a skirt, so the cap is
     sized to the whole visible field, not to the skyline. */
  FX.skirt=new InstMesh(gl,mdlBaseSkirt(),1200);
};

