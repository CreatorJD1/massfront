;
;
/* ============================================================================
   RED ASCENDANCY STRUCTURES
   ----------------------------------------------------------------------------
   A separate industrial architecture kit for the Legion/Red Ascendancy. These
   are not recoloured Nova buildings: every family uses squat armored plinths,
   oversized mechanisms, exposed heat hardware and red command-view livery.
   The maps at the bottom deliberately mirror BLD_MDL so old saves keep their
   simulation type while receiving the correct faction silhouette at render.
   ============================================================================ */

const LEG_ARM=C(188,178,172), LEG_ARM_D=C(84,73,75);
const LEG_PANEL=C(146,136,133), LEG_EDGE=C(215,207,200);
const LEG_MACH=C(112,116,124), LEG_TRIM=C(232,218,207);
const LEG_RED=C(245,91,62), LEG_HOT=C(255,151,72);
const LEG_PAD=C(98,92,90), LEG_BORE=C(12,10,11);
COL_MAT.set(LEG_ARM,MAT.TWR_ARMOR); COL_MAT.set(LEG_ARM_D,MAT.TWR_COAT);
COL_MAT.set(LEG_PANEL,MAT.TWR_ARMOR); COL_MAT.set(LEG_EDGE,MAT.TWR_MACH);
COL_MAT.set(LEG_MACH,MAT.TWR_MACH); COL_MAT.set(LEG_TRIM,MAT.TRIM);
COL_MAT.set(LEG_RED,MAT.TWR_ARMOR); COL_MAT.set(LEG_HOT,MAT.TWR_GLOW);
COL_MAT.set(LEG_PAD,MAT.TWR_PAD); COL_MAT.set(LEG_BORE,MAT.TWR_BORE);
COL_TEAM.add(LEG_RED);

function legPad(m,r,h){
  r=r||18; h=h||3;
  m.cyl(0,0,0,r,r-1.8,h,8,LEG_PAD);
  m.cyl(0,h,0,r-3,r-4.4,2.6,8,LEG_ARM_D);
  m.ring(0,h+2.62,0,r-5.0,r-3.7,16,LEG_EDGE);
  for(let k=0;k<8;k++){
    const a=k/8*TAU;
    const x=Math.cos(a)*(r-2.2),z=Math.sin(a)*(r-2.2);
    m.bevelBox(x,h+0.4,z,3.8,1.5,3.8,.35,k%2?LEG_MACH:LEG_PANEL,a);
    if(!(k&1)) m.box(x,h+1.92,z,2.2,.20,.55,k===0?LEG_RED:LEG_HOT,a);
  }
  return m;
}
function legHeatStack(m,x,y,z,h,r){
  r=r||2.1;
  m.cyl(x,y,z,r*1.35,r*1.1,h*.30,8,LEG_MACH);
  m.cyl(x,y+h*.26,z,r,r*.82,h*.66,8,LEG_ARM_D);
  m.ring(x,y+h*.28,z,r*1.02,r*1.24,10,LEG_EDGE);
  m.tube(x,y+h*.88,z,r*.9,r*.48,h*.14,8,LEG_BORE);
  m.box(x,y+h*.43,z+r*.92,r*.36,h*.32,r*.28,LEG_HOT);
}
function legCore(m,x,y,z,r){
  m.cyl(x,y,z,r*1.55,r*1.30,1.6,10,LEG_MACH);
  m.sphere(x,y+1.5,z,r,10,LEG_HOT,.92,false);
  m.ring(x,y+1.7,z,r*1.32,r*1.62,18,LEG_RED);
}
function legGun(m,len,r,z,tier){
  const t=tier||1, L=len+(t-1)*2.2;
  m.bevelBox(-2,0,z||0,9+t*1.1,5+t*.4,8+t*.6,.8,LEG_ARM);
  m.bevelBox(-2,4.4,z||0,7+t,1.2,5.8,.3,LEG_PANEL);
  m.box(-2,5.62,z||0,4.4+t*.4,.22,2.2,LEG_RED);
  for(const s of [-1,1]){
    m.bevelBox(-2,1.5,(z||0)+s*(4.15+t*.28),5.6+t*.5,2.3,.58,.22,LEG_PANEL);
    m.box(-2,3.66,(z||0)+s*(4.47+t*.28),3.2,.18,.62,s>0?LEG_RED:LEG_HOT);
  }
  tubeX(m,1.4,2.2,z||0,L,r+(t-1)*.12,(r+(t-1)*.12)*.48,12,LEG_BORE);
  for(let k=0;k<2+t;k++){
    const x=3+k*(L/(2+t));
    ringX(m,x,2.2,z||0,r*1.42,r*1.75,12,k===1+t?LEG_HOT:LEG_MACH);
  }
  m.box(-5.4,1.1,z||0,2.4,3.5,6.4,LEG_MACH);
  return m;
}
function mdlLegTurretBase(tier){
  const m=MB(),t=tier||1; legPad(m,15+t,3.2);
  m.cyl(0,5.6,0,8.2+t*.7,7.2+t*.6,7.2+t,12,LEG_ARM);
  m.ring(0,11.0+t,0,6.9+t*.55,7.7+t*.58,16,LEG_PANEL);
  m.cyl(0,12.4+t,0,6.2+t*.45,5.2+t*.4,2.2,12,LEG_MACH);
  for(const s of [-1,1]){
    m.bevelBox(-3,7.0,s*(8.4+t*.5),8+t,4.2,2.5,.45,LEG_PANEL);
    m.box(-3,10.85,s*(9.68+t*.5),4+t*.4,.22,.55,s>0?LEG_RED:LEG_HOT);
  }
  return m.build();
}
function mdlLegTurretGun(tier){ const m=MB(); legGun(m,12,1.25,0,tier); return m.build(); }
function mdlLegBunkerBase(tier){
  const m=MB(),t=tier||1; legPad(m,20+t,3.4);
  m.bevelBox(0,5.4,0,26+t*2,9+t,22+t*1.5,2.0,LEG_ARM);
  m.bevelBox(4,13+t,0,16+t*1.4,2.0,15,.45,LEG_PANEL);
  m.box(4,15.05+t,0,9+t,.24,4.5,LEG_RED);
  for(const s of [-1,1]){ m.box(-7,6.3,s*11.4,8,5,3,LEG_MACH); legHeatStack(m,-9,10,s*8,8+t,1.6); }
  return m.build();
}
function mdlLegBunkerGun(tier){
  const m=MB(),t=tier||1;
  m.bevelBox(-2,0,0,11+t,5+t*.5,12+t,.9,LEG_ARM);
  for(const s of [-1,1]) legGun(m,11+t*1.5,.9,s*(2.1+t*.2),t);
  return m.build();
}
function mdlLegBastionBase(tier){
  const m=MB(),t=tier||1; legPad(m,22+t*1.2,4);
  m.cyl(0,7.5,0,13+t,11+t*.8,13+t,12,LEG_ARM_D);
  m.cyl(0,19+t,0,10+t*.8,9+t*.7,3,12,LEG_MACH);
  for(let k=0;k<4;k++){
    const a=k/4*TAU,x=Math.cos(a)*15,z=Math.sin(a)*15;
    m.bevelBox(x,5,z,7,5,8,.6,k%2?LEG_ARM:LEG_PANEL,a);
    m.box(x,9.8,z,3.5,.22,4,k===0?LEG_RED:LEG_HOT,a);
  }
  return m.build();
}
function mdlLegBastionGun(tier){
  const m=MB(),t=tier||1;
  m.bevelBox(-3,0,0,15+t*1.5,7+t*.8,14+t,1.2,LEG_ARM);
  for(const s of [-1,1]){
    m.bevelBox(-4,2.1,s*(7.1+t*.5),8+t,3.0,.65,.24,LEG_PANEL);
    m.box(-4,4.92,s*(7.45+t*.5),4+t*.3,.2,.7,s>0?LEG_RED:LEG_HOT);
  }
  tubeX(m,2,3.0,0,17+t*2.5,2.0+t*.2,1.05+t*.12,14,LEG_BORE);
  for(let k=0;k<4;k++) ringX(m,5+k*(4+t*.3),3,0,2.5+t*.22,2.9+t*.22,14,k===3?LEG_HOT:LEG_MACH);
  for(const s of [-1,1]) m.box(-5,1.2,s*6.4,7,5.5,3.0,LEG_RED);
  return m.build();
}
/* The Ascendancy rail battery used to borrow the concussion bastion body and
   gun. That saved geometry, but erased the role at phone scale: a recoil-fed
   penetrator read as another artillery cannon. The dedicated family below is
   deliberately long and low, with separated rails and exposed capacitor
   banks. Tier growth adds hardware instead of simply inflating the silhouette. */
function mdlLegRailBase(tier){
  const m=MB(),t=tier||1; legPad(m,18+t*1.25,3.6);
  m.bevelBox(-1,5.2,0,34+t*2.2,6.5,24+t*1.7,1.3,LEG_ARM_D);
  m.bevelBox(-5,11.5,0,22+t*1.6,3.2,17+t,0.6,LEG_ARM);
  m.cyl(0,14.7,0,8.0+t*.45,7.2+t*.38,2.2,14,LEG_MACH);
  m.ring(0,16.92,0,5.8+t*.32,7.0+t*.38,18,LEG_EDGE);
  for(const s of [-1,1]){
    const z=s*(10.1+t*.72);
    m.bevelBox(-5,7.1,z,13+t,4.4,3.1,.55,LEG_PANEL);
    for(let k=0;k<t+1;k++){
      const x=-9+k*(7.3/(t||1));
      m.cyl(x,10.4,z,1.25,1.05,2.4,8,LEG_MACH);
      m.ring(x,12.82,z,.72,1.08,10,k===t?LEG_HOT:LEG_RED);
    }
  }
  m.box(-13,7.0,0,3.2,5.0,9.5,LEG_MACH);
  m.box(-13,11.86,0,1.6,.22,4.8,LEG_RED);
  return m.build();
}
function mdlLegRailTur(tier){
  const m=MB(),t=tier||1,L=15+t*2.0;
  m.cyl(0,0,0,7.1+t*.30,6.4+t*.26,2.0,14,LEG_MACH);
  m.bevelBox(-3,2.0,0,14+t*1.2,5.8+t*.45,12+t*.65,1.0,LEG_ARM);
  m.bevelBox(-4,7.2+t*.35,0,9+t*.65,1.4,8+t*.45,.28,LEG_PANEL);
  /* Two real open rail bores create a forked muzzle instead of a flat slab. */
  for(const s of [-1,1]){
    const z=s*(2.45+t*.18);
    cylX(m,2.0,5.0,z,L,1.08+t*.11,.92+t*.09,12,LEG_TRIM,false);
    tubeX(m,2.0+L,5.0,z,1.25,1.32+t*.11,.58+t*.06,12,LEG_BORE);
    for(let k=0;k<2+t;k++){
      const x=3.2+k*(L-2)/(1+t*.75);
      ringX(m,x,5.0,z,1.34+t*.10,1.67+t*.10,12,(k+t)&1?LEG_HOT:LEG_MACH);
    }
  }
  for(const s of [-1,1]){
    m.bevelBox(-5,3.1,s*(6.25+t*.32),7.0+t*.5,4.8,2.8,.55,LEG_PANEL);
    m.box(-5,7.76,s*(7.68+t*.32),3.6,.22,.55,s>0?LEG_RED:LEG_HOT);
  }
  m.box(-8,2.4,0,3.2,5.4,7.2,LEG_MACH);
  return m.build();
}
function mdlLegAA(tier){
  const m=MB(),t=tier||1; legPad(m,15+t,3);
  m.cyl(0,5,0,8+t*.35,7+t*.25,7+t,12,LEG_ARM);
  m.cyl(0,12+t,0,5.4,5.4,2,12,LEG_MACH); legCore(m,0,14+t,0,2.1);
  if(t>=3) m.box(0,13+t,0,1.0,.18,6.4,LEG_RED);
  return m.build();
}
function mdlLegAAGun(tier){
  const m=MB(),t=tier||1; m.bevelBox(-2,0,0,10+t*.4,4.5+t*.25,11+t*.35,.8,LEG_ARM);
  for(const s of [-1,1]) m.bevelBox(-2,1.1,s*5.55,6.2,2.2,.55,.18,LEG_PANEL);
  for(const s of [-1,1]) for(const q of [-1,1]) tubeX(m,1.5,2+q*1.1,s*2.6,11+t,.62,.30,10,LEG_BORE);
  m.box(-4,3.8,0,3,2,7,LEG_RED);
  if(t>=3) m.box(-4,5.4,0,2.2,.18,5.2,LEG_HOT);
  return m.build();
}
function mdlLegMiningBase(tier){ return mdlLegTurretBase((tier||1)+1); }
function mdlLegMiningGun(tier){
  const m=MB(),t=tier||1; m.bevelBox(-2,0,0,12+t,6+t*.5,10+t,.9,LEG_ARM);
  for(const s of [-1,1]) m.bevelBox(-3,1.5,s*(5.15+t*.5),7+t,2.8,.58,.2,LEG_PANEL);
  tubeX(m,2,2.8,0,14+t*2,1.7+t*.15,.72+t*.08,14,LEG_BORE);
  for(let k=0;k<4+t;k++) ringX(m,4+k*2.5,2.8,0,2.0+t*.1,2.35+t*.1,14,k%2?LEG_HOT:LEG_RED);
  return m.build();
}
function mdlLegHellfireBase(tier){
  const m=MB(),t=tier||1; legPad(m,18+t,3.5);
  m.cyl(0,6,0,10+t,8.5+t,10,12,LEG_ARM);
  m.cyl(0,16,0,7.2+t*.3,6.6+t*.25,1.8,14,LEG_ARM_D);
  m.ring(0,17.82,0,4.8+t*.2,6.2+t*.25,16,LEG_EDGE);
  for(const s of [-1,1]){
    m.bevelBox(-4,10,s*(10.7+t*.25),5,5,3,.4,LEG_PANEL);
    m.box(-4,14.8,s*(12.22+t*.25),2.6,.20,.6,s>0?LEG_RED:LEG_HOT);
  }
  return m.build();
}
function mdlLegHellfireTur(tier){
  const m=MB(),t=tier||1;
  m.cyl(0,0,0,6.7+t*.25,6.2+t*.2,2.0,14,LEG_MACH);
  m.bevelBox(-1,2,0,13+t,5+t*.5,12+t,1,LEG_ARM);
  m.bevelBox(-2,6.3+t*.4,0,8+t*.6,1.2,8+t*.5,.25,LEG_PANEL);
  for(const s of [-1,1]) for(const q of [-1,0,1])
    tubeX(m,2,4.5+q*1.45,s*2.9,12+t*1.5,.6,.28,9,LEG_BORE);
  for(const s of [-1,1]) m.box(-4,6.6,s*(6.05+t*.5),2.8,.20,.55,s>0?LEG_RED:LEG_HOT);
  return m.build();
}
function mdlLegArc(tier){
  const m=MB(),t=tier||1; legPad(m,17+t,3.4);
  m.cyl(0,6,0,10+t,7+t*.7,8+t,10,LEG_ARM_D);
  for(let k=0;k<4+t;k++){
    const a=k/(4+t)*TAU,rr=8+t*.6;
    m.wedge(Math.cos(a)*rr,8,Math.sin(a)*rr,4,12+t*2,3,LEG_ARM,a+Math.PI/2);
  }
  m.cyl(0,13+t,0,4+t*.4,2.2,9+t*2,10,LEG_MACH); legCore(m,0,23+t*3,0,3+t*.35); return m.build();
}
function mdlLegBarrier(tier){
  const m=MB(),t=tier||1; legPad(m,17+t,3.4);
  m.cyl(0,6,0,10+t,7+t,9+t,10,LEG_ARM);
  for(let k=0;k<6;k++){const a=k/6*TAU;m.wedge(Math.cos(a)*(11+t),5,Math.sin(a)*(11+t),4,16+t*2,4,LEG_ARM_D,a);}
  legCore(m,0,16+t,0,4+t*.5); m.ring(0,17+t,0,7+t,8+t,24,LEG_HOT); return m.build();
}
function mdlLegUplink(tier){
  const m=MB(),t=tier||1; legPad(m,15+t,3);
  m.box(0,5,0,13+t,9+t,12+t,LEG_ARM); m.bevelBox(0,14+t,0,10+t,2,9,.35,LEG_PANEL);
  for(const s of [-1,1]) m.box(0,10,s*(6.05+t*.5),6,.25,.45,s>0?LEG_RED:LEG_HOT);
  m.cyl(0,16+t,0,1.3,1.0,12+t*3,8,LEG_MACH);
  m.ring(0,24+t*3,0,6+t,8+t,24,LEG_TRIM); legCore(m,0,24+t*3,0,1.8+t*.3); return m.build();
}
function mdlLegMissileBase(tier){
  const m=MB(),t=tier||1; legPad(m,22+t,4);
  m.bevelBox(0,7,0,27+t*2,8,23+t,1.6,LEG_ARM);
  for(const s of [-1,1]){
    m.bevelBox(-8,10,s*(11.65+t*.5),8,4,.62,.22,LEG_PANEL);
    m.box(-8,13.75,s*(12+t*.5),4,.2,.68,s>0?LEG_RED:LEG_HOT);
  }
  m.cyl(0,15,0,9.2+t*.35,8.5+t*.3,2.0,16,LEG_ARM_D);
  m.ring(0,17.02,0,6.3+t*.25,8.0+t*.3,18,LEG_EDGE);
  return m.build();
}
function mdlLegMissileTur(tier){
  const m=MB(),t=tier||1;
  m.cyl(0,0,0,8.6+t*.3,8.0+t*.25,2.0,16,LEG_MACH);
  m.bevelBox(-2,2,0,17+t*1.4,8+t*.5,17+t,1.2,LEG_PANEL);
  const rows=2+t,cols=2+t;
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    const z=(c-(cols-1)/2)*3.5,y=4.5+(r-(rows-1)/2)*2.65;
    tubeX(m,5.5,y,z,9+t*1.4,1.18,.62,10,LEG_BORE);
    ringX(m,13.8+t*1.4,y,z,1.26,1.62,10,(r+c)&1?LEG_RED:LEG_HOT);
  }
  m.bevelBox(-8,5.0,0,5.0,5.5,13+t,.65,LEG_ARM);
  m.box(-8,10.25,0,2.8,.2,6,LEG_RED);
  return m.build();
}
/* NOVA is a map-wide strategic weapon, not an enlarged missile rack. Its
   fortress cradle, three heavy launch throats and orbital-control crown make
   that importance legible before the player opens a description panel. */
function mdlLegNovaBase(tier){
  const m=MB(),t=tier||1; legPad(m,22+t*.65,4);
  m.bevelBox(0,6.5,0,43+t*1.5,8.0,34+t,2.0,LEG_ARM_D);
  for(const s of [-1,1]){
    m.bevelBox(-10,10.0,s*(14.8+t*.45),15+t,6.0,4.0,.75,LEG_ARM);
    m.box(-10,15.82,s*(16.82+t*.45),7+t*.5,.22,.58,s>0?LEG_RED:LEG_HOT);
  }
  m.cyl(2,14.5,0,11.5+t*.35,10.3+t*.3,3.1,16,LEG_PANEL);
  m.ring(2,17.62,0,7.6+t*.25,9.8+t*.3,20,LEG_EDGE);
  for(let k=0;k<2+t;k++){
    const a=k/(2+t)*TAU,x=-13,z=Math.sin(a)*9;
    m.cyl(x,7.5,z,1.5,1.25,6.0,9,LEG_MACH);
    m.ring(x,13.52,z,.85,1.28,10,k===t?LEG_HOT:LEG_RED);
  }
  return m.build();
}
function mdlLegNovaTur(tier){
  const m=MB(),t=tier||1;
  m.cyl(0,0,0,10.2+t*.28,9.4+t*.25,2.3,16,LEG_MACH);
  m.bevelBox(-2,2.3,0,18+t,8.0+t*.45,17+t*.55,1.25,LEG_ARM);
  const cells=t===1?[-3.2,3.2]:t===2?[-4.1,0,4.1]:[-5.1,-1.7,1.7,5.1];
  for(let i=0;i<cells.length;i++){
    const z=cells[i];
    m.bevelBox(2,5.3,z,12+t*.7,4.7,3.0,.48,LEG_PANEL);
    cylX(m,4.0,6.3,z,12+t*1.25,1.48+t*.08,1.30+t*.07,12,LEG_TRIM,false);
    tubeX(m,16+t*1.25,6.3,z,1.4,1.78+t*.08,.82+t*.05,12,LEG_BORE);
    ringX(m,11.5+t*.8,6.3,z,1.78+t*.08,2.18+t*.09,12,i&1?LEG_RED:LEG_HOT);
  }
  m.bevelBox(-8,5.2,0,4.6,7.2,13+t,.62,LEG_ARM_D);
  m.cyl(-8,12.4,0,1.15,.8,5+t,8,LEG_MACH);
  m.ring(-8,17.4+t,0,3.8+t*.25,5.2+t*.3,18,LEG_HOT);
  m.box(-8,18.0+t,0,1.0,.25,7+t,LEG_RED);
  return m.build();
}
function mdlLegPlasma(tier){
  const m=MB(),t=tier||1; legPad(m,19+t,3.8);
  m.cyl(0,7,0,12+t,9+t,10+t,10,LEG_ARM_D);
  for(let k=0;k<5+t;k++){
    const a=k/(5+t)*TAU,x=Math.cos(a)*(10+t),z=Math.sin(a)*(10+t);
    m.wedge(x,8,z,4,13+t*2,4,k%2?LEG_ARM:LEG_PANEL,a);
    if(!(k&1)) m.box(x,17+t,z,1.1,.22,1.1,LEG_HOT,a);
  }
  legCore(m,0,17+t,0,5+t*.65); m.ring(0,20+t,0,8+t,9+t,28,LEG_HOT); return m.build();
}
function mdlLegEconomy(kind){
  const m=MB(),r=kind==='mex'?19:kind==='geo'?21:18; legPad(m,r,3.5);
  if(kind==='mex'){
    m.bevelBox(0,5,0,24,9,22,1.5,LEG_ARM); m.cyl(0,14,0,7,5,12,10,LEG_MACH);
    for(const s of [-1,1]){
      m.bevelBox(s*10,5,0,5,13,8,.5,LEG_PANEL);
      m.box(s*10,17.75,0,2.4,.22,4,s>0?LEG_RED:LEG_HOT);
    }
  }else if(kind==='pgen'||kind==='geo'){
    m.cyl(0,6,0,12,9,15,12,LEG_ARM); m.cyl(0,21,0,7,4,6,12,LEG_MACH); legCore(m,0,27,0,3.5);
    for(let k=0;k<4;k++){const a=k/4*TAU;legHeatStack(m,Math.cos(a)*12,5,Math.sin(a)*12,12,1.8);}
  }else if(kind==='silo'){
    for(const s of [-1,1]){m.cyl(s*7,5,0,6,5,25,10,LEG_ARM);m.cyl(s*7,30,0,5,2,5,10,LEG_RED);} legHeatStack(m,0,5,-8,20,2);
  }else{
    m.bevelBox(-2,5,0,25,14,23,1.5,LEG_ARM); m.bevelBox(-2,19,0,21,3,18,.5,LEG_PANEL);
    m.box(-2,22.05,0,12,.24,4.5,LEG_RED);
    legHeatStack(m,11,5,8,22,2.5); legHeatStack(m,11,5,-8,18,2.2);
  }
  return m.build();
}
function mdlLegFactory(kind){
  const m=MB(),large=kind==='hq'||kind==='tgate',w=large?72:kind==='airfield'?82:56,d=large?60:kind==='airfield'?38:46;
  m.bevelBox(0,0,0,w,5,d,2,LEG_PAD); m.bevelBox(-5,5,0,w-12,large?26:19,d-10,2.4,LEG_ARM);
  m.bevelBox(-5,large?31:24,0,w-22,3,d-18,.55,LEG_PANEL);
  m.box(-5,large?34.05:27.05,0,w*.32,.24,d*.18,LEG_RED);
  for(const s of [-1,1]){m.box(-w*.34,7,s*(d*.40),w*.18,large?22:15,4,LEG_MACH);legHeatStack(m,w*.30,5,s*(d*.32),large?26:19,2.2);}
  if(kind==='airfield'||kind==='harbor') m.box(w*.24,5,0,w*.38,3,d*.64,LEG_MACH);
  if(kind==='techlab'){ legCore(m,4,26,0,5); m.ring(4,28,0,9,11,28,LEG_HOT); }
  if(kind==='tgate'){ m.ring(5,33,0,16,20,30,LEG_HOT); m.ring(5,33,0,21,23,30,LEG_MACH); }
  if(kind==='hq'){
    m.bevelBox(4,34,0,31,14,30,2,LEG_ARM); m.bevelBox(4,48,0,24,4,22,.6,LEG_PANEL);
    m.box(4,52.05,0,13,.25,5.5,LEG_RED);
  }
  return m.build();
}
function mdlLegWall(){
  const m=MB();m.bevelBox(0,0,0,34,8,16,1.5,LEG_PAD);m.bevelBox(0,8,0,30,11,12,1.4,LEG_ARM);
  m.bevelBox(0,10.5,-6.1,15,5,.5,.16,LEG_ARM_D);
  m.bevelBox(0,19,0,24,3,8,.45,LEG_PANEL);m.box(0,22.05,0,12,.22,2.2,LEG_RED);
  for(const s of [-1,1]){
    m.box(s*11,11,s*6.05,4,5,.3,LEG_EDGE);
    m.box(s*11,15.4,s*6.24,1.6,.22,.36,LEG_HOT);
  }
  return m.build();
}
function mdlLegGate(){
  const m=MB();m.bevelBox(0,0,0,42,5,18,1.4,LEG_PAD);
  for(const s of [-1,1]){
    m.bevelBox(s*16,5,0,9,22,14,1.4,LEG_ARM);m.bevelBox(s*16,27,0,7,3,10,.4,LEG_PANEL);
    m.box(s*16,30.05,0,3.4,.22,3,s>0?LEG_RED:LEG_HOT);
  }
  m.bevelBox(0,5,0,22,13,5,.35,LEG_ARM_D);m.box(0,17.8,0,11,.22,5.2,LEG_EDGE);return m.build();
}
function mdlLegSeafortBase(tier){
  const m=MB(),t=tier||1;
  m.bevelBox(0,0,0,42,4.2,36,1.6,LEG_PAD);
  m.bevelBox(0,4.2,0,38,2.0,32,.55,LEG_PANEL);
  for(const s of [-1,1]){
    m.bevelBox(-4,0,s*16.8,30,3.4,5.2,.7,LEG_ARM);
    m.box(-4,3.42,s*16.95,16,.22,1.6,s>0?LEG_RED:LEG_HOT);
    legHeatStack(m,-14,4.2,s*12.5,9+t,1.7);
  }
  m.cyl(0,6.2,0,11+t*.3,9.5+t*.25,8.5,12,LEG_ARM_D);
  m.cyl(0,14.5,0,8.4+t*.25,7.6+t*.2,2.0,14,LEG_MACH);
  m.ring(0,16.52,0,5.8+t*.2,7.4+t*.22,16,LEG_EDGE);
  return m.build();
}
function mdlLegSeafortGun(tier){
  const m=MB(),t=tier||1;
  m.bevelBox(-2,0,0,13+t,5.6+t*.4,13+t,.9,LEG_ARM);
  tubeX(m,2,2.6,0,14+t*1.6,1.85+t*.12,.92+t*.08,12,LEG_BORE);
  for(let k=0;k<3;k++) ringX(m,5+k*3.2,2.6,0,2.2+t*.1,2.55+t*.1,12,k===2?LEG_HOT:LEG_MACH);
  for(const s of [-1,1]){
    m.bevelBox(-3,1.4,s*(6.4+t*.3),7,2.4,.55,.2,LEG_PANEL);
    tubeX(m,1.2,4.8,s*3.0,11+t,0.62,0.30,9,LEG_BORE);
    m.box(-3,3.72,s*(6.7+t*.3),3.6,.2,.62,s>0?LEG_RED:LEG_HOT);
  }
  m.box(-5.4,4.6,0,2.8,.22,6.4,LEG_RED);
  return m.build();
}
function mdlLegStormBase(tier){
  const m=MB(),t=tier||1; legPad(m,20+t*.4,3.8);
  m.bevelBox(0,6.4,0,34+t,7.2,28+t,1.4,LEG_ARM_D);
  for(const s of [-1,1]){
    m.bevelBox(-2,10,s*(12.6+t*.3),16,5.2,4.0,.55,LEG_PANEL);
    for(const x of [-6,2,10]){
      m.cyl(x,14.8,s*(12.6+t*.3),1.35,1.1,4.2+t*.6,8,LEG_MACH);
      m.tube(x,18.9+t*.6,s*(12.6+t*.3),1.15,.55,.45,8,LEG_BORE);
      m.ring(x,19.5+t*.6,s*(12.6+t*.3),.7,1.1,10,x===2?LEG_HOT:LEG_RED);
    }
  }
  m.cyl(0,13.4,0,8.8+t*.25,8.0+t*.2,2.2,14,LEG_MACH);
  m.ring(0,15.62,0,6.2+t*.2,8.0+t*.22,16,LEG_EDGE);
  return m.build();
}
function mdlLegStormTur(tier){
  const m=MB(),t=tier||1;
  m.cyl(0,0,0,8.2+t*.2,7.6+t*.18,2.0,14,LEG_MACH);
  m.bevelBox(-2,2,0,16+t,7.2+t*.4,16+t,.95,LEG_ARM);
  for(let r=0;r<4;r++) for(let c=0;c<4;c++){
    const y=4.2+(r-1.5)*2.05,z=(c-1.5)*3.15;
    m.bevelBox(3.6,y-1.05,z,3.4,2.15,2.4,.28,LEG_PANEL);
    tubeX(m,5.2,y,z,2.2,1.12,.62,8,LEG_BORE);
  }
  m.box(-7.2,5.4,0,3.2,5.6,10.5,LEG_ARM_D);
  m.box(-7.2,10.9,0,1.4,.22,6.4,LEG_RED);
  return m.build();
}
function mdlLegNest(){
  /* Nest is Brood-owned at runtime (bldFactionKey forces horde). This Legion
     fallback used to alias HQ — a 72-wide keep for a hatchery slot. A sealed
     quarantine redoubt keeps the catalogue readable as Dominion iron without
     growing tissue or cloning the command keep. */
  const m=MB();
  legPad(m,20,3.4);
  m.bevelBox(0,5.4,0,26,9,22,1.8,LEG_ARM);
  m.bevelBox(0,14.4,0,20,1.8,16,.45,LEG_PANEL);
  m.box(0,16.25,0,10,.22,4.2,LEG_RED);
  m.cyl(0,16.2,0,6.4,5.2,5.5,12,LEG_MACH);
  m.cyl(0,21.7,0,4.6,3.0,2.0,12,LEG_PANEL);
  m.tube(0,23.7,0,3.0,1.4,1.2,10,LEG_BORE);
  m.ring(0,24.9,0,1.8,3.2,14,LEG_HOT);
  for(const s of [-1,1]){
    m.bevelBox(s*11.2,6.2,0,5.6,7.0,8.0,.6,LEG_PANEL);
    m.box(s*11.2,13.15,0,3.2,.22,2.0,s>0?LEG_RED:LEG_HOT);
    legHeatStack(m,s*11.2,13.4,s*6.0,8,1.5);
  }
  return m.build();
}

const BLD_MDL_LEGION={
  mex:()=>mdlLegEconomy('mex'),pgen:()=>mdlLegEconomy('pgen'),geo:()=>mdlLegEconomy('geo'),silo:()=>mdlLegEconomy('silo'),fab:()=>mdlLegEconomy('fab'),
  fac:()=>mdlLegFactory('fac'),tgate:()=>mdlLegFactory('tgate'),harbor:()=>mdlLegFactory('harbor'),airfield:()=>mdlLegFactory('airfield'),
  techlab:()=>mdlLegFactory('techlab'),hq:()=>mdlLegFactory('hq'),nest:()=>mdlLegNest(),
  turret:mdlLegTurretBase,bunker:mdlLegBunkerBase,bastion:mdlLegBastionBase,aatower:mdlLegAA,
  minelaser:mdlLegMiningBase,missilebastion:mdlLegMissileBase,hellstorm:mdlLegHellfireBase,arc:mdlLegArc,
  sgen:mdlLegBarrier,uplink:mdlLegUplink,nova:mdlLegNovaBase,plasma:mdlLegPlasma,
  rail:mdlLegRailBase,wall:mdlLegWall,gate:mdlLegGate,
  seafort:mdlLegSeafortBase,stormcaller:mdlLegStormBase,
};
const BLD_TUR_MDL_LEGION={
  turret:mdlLegTurretGun,bunker:mdlLegBunkerGun,bastion:mdlLegBastionGun,
  aatower:mdlLegAAGun,minelaser:mdlLegMiningGun,rail:mdlLegRailTur,
  hellstorm:mdlLegHellfireTur,nova:mdlLegNovaTur,missilebastion:mdlLegMissileTur,
  seafort:mdlLegSeafortGun,stormcaller:mdlLegStormTur,
};
const BLD_TUR_H_LEGION={
  turret:14,bunker:17,bastion:22,aatower:12,minelaser:15,rail:17,
  hellstorm:17.8,nova:17.7,missilebastion:17,seafort:16.5,stormcaller:15.6,
};
const BLD_TUR_S_LEGION={
  turret:1.13,bunker:1.10,bastion:1.11,aatower:1.12,minelaser:1.10,rail:1.0,
  hellstorm:1.0,nova:1.0,missilebastion:1.0,seafort:1.08,stormcaller:1.05,
};
/* Stage D1 — isolated Legion landmark packs. These are per-building semantic
   bakes, not a faction-wide colour wash: the shared battle material still owns
   lighting/AO/microdetail, while each landmark chooses its own armor, machine
   and heat vocabulary. `maps:null` deliberately records that no bespoke
   authored UV BaseAO/NRE/mask export exists yet. Keeping the selector here,
   next to the actual builders, makes a later authored-map replacement local
   and avoids changing the generic building renderer. */
const DOM_LEGION_STRUCTURE_PACKS=Object.freeze({
  hq:Object.freeze({
    id:'legion-hq-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_CAST,[MAT.TWR_COAT]:MAT.LEGION_RIVET,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  fac:Object.freeze({
    id:'legion-fac-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_RIVET,[MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  techlab:Object.freeze({
    id:'legion-techlab-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_RIVET,[MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  pgen:Object.freeze({
    id:'legion-pgen-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_CAST,[MAT.TWR_COAT]:MAT.LEGION_SIEGE,
      [MAT.TWR_MACH]:MAT.LEGION_RIVET,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  mex:Object.freeze({
    id:'legion-mex-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_RIVET,[MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  geo:Object.freeze({
    id:'legion-geo-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_CAST,[MAT.TWR_COAT]:MAT.LEGION_RIVET,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  airfield:Object.freeze({
    id:'legion-airfield-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_RIVET,[MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  rail:Object.freeze({
    id:'legion-rail-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_CAST,[MAT.TWR_COAT]:MAT.LEGION_RIVET,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  uplink:Object.freeze({
    id:'legion-uplink-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_RIVET,[MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  turret:Object.freeze({
    id:'legion-turret-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_CAST,[MAT.TWR_COAT]:MAT.LEGION_RIVET,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  bunker:Object.freeze({
    id:'legion-bunker-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_CAST,[MAT.TWR_COAT]:MAT.LEGION_RIVET,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  bastion:Object.freeze({
    id:'legion-bastion-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_CAST,[MAT.TWR_COAT]:MAT.LEGION_RIVET,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  aatower:Object.freeze({
    id:'legion-aatower-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_RIVET,[MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  minelaser:Object.freeze({
    id:'legion-minelaser-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_RIVET,[MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  missilebastion:Object.freeze({
    id:'legion-missilebastion-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_CAST,[MAT.TWR_COAT]:MAT.LEGION_RIVET,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  hellstorm:Object.freeze({
    id:'legion-hellstorm-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_CAST,[MAT.TWR_COAT]:MAT.LEGION_RIVET,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  seafort:Object.freeze({
    id:'legion-seafort-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_CAST,[MAT.TWR_COAT]:MAT.LEGION_RIVET,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  stormcaller:Object.freeze({
    id:'legion-stormcaller-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_CAST,[MAT.TWR_COAT]:MAT.LEGION_RIVET,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  arc:Object.freeze({
    id:'legion-arc-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_RIVET,[MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  sgen:Object.freeze({
    id:'legion-sgen-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_RIVET,[MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  plasma:Object.freeze({
    id:'legion-plasma-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_CAST,[MAT.TWR_COAT]:MAT.LEGION_RIVET,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  wall:Object.freeze({
    id:'legion-wall-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_RIVET,[MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  gate:Object.freeze({
    id:'legion-gate-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_RIVET,[MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  nest:Object.freeze({
    id:'legion-nest-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_CAST,[MAT.TWR_COAT]:MAT.LEGION_RIVET,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  harbor:Object.freeze({
    id:'legion-harbor-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_RIVET,[MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  tgate:Object.freeze({
    id:'legion-tgate-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_RIVET,[MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  silo:Object.freeze({
    id:'legion-silo-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_CAST,[MAT.TWR_COAT]:MAT.LEGION_RIVET,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  fab:Object.freeze({
    id:'legion-fab-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_RIVET,[MAT.TWR_COAT]:MAT.LEGION_CAST,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  }),
  nova:Object.freeze({
    id:'legion-nova-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.LEGION_CAST,[MAT.TWR_COAT]:MAT.LEGION_RIVET,
      [MAT.TWR_MACH]:MAT.LEGION_SIEGE,[MAT.TWR_GLOW]:MAT.LEGION_THERMITE,
      [MAT.TWR_PAD]:MAT.LEGION_SIEGE,[MAT.TRIM]:MAT.LEGION_RIVET
    })
  })
});
function domLegionStructureSurfacePass(geo,pack){
  if(!geo||!geo.v||!pack)return geo;
  const v=geo.v;
  for(let o=11;o<v.length;o+=VFLOATS){
    const raw=v[o],sgn=raw<0?-1:1,packed=Math.abs(raw);
    const whole=Math.floor(packed),src=whole-1;
    const dst=pack.surfaces[src];
    if(dst!==undefined)v[o]=sgn*((dst+1)+(packed-whole));
  }
  return geo;
}
function domLegionStructureFactory(fn,key){
  return function(...args){return domLegionStructureSurfacePass(fn(...args),DOM_LEGION_STRUCTURE_PACKS[key]);};
}
for(const k of ['hq','fac','techlab','pgen','mex','geo','airfield','rail','uplink','turret','bunker','bastion','aatower','minelaser','missilebastion','hellstorm','arc','sgen','plasma','wall','gate','seafort','stormcaller','nest','harbor','tgate','silo','fab','nova'])
  if(BLD_MDL_LEGION[k]) BLD_MDL_LEGION[k]=domLegionStructureFactory(BLD_MDL_LEGION[k],k);
for(const k of ['turret','bunker','bastion','aatower','minelaser','rail','hellstorm','nova','missilebastion','seafort','stormcaller'])
  if(BLD_TUR_MDL_LEGION[k]) BLD_TUR_MDL_LEGION[k]=domLegionStructureFactory(BLD_TUR_MDL_LEGION[k],k==='nova'?'hellstorm':k);
const BLD_TIER_MDL_LEGION={};
for(const k of ['turret','bunker','bastion','aatower','minelaser','rail']) BLD_TIER_MDL_LEGION[k]=[1,2,3].map(t=>({base:()=>BLD_MDL_LEGION[k](t),tur:()=>BLD_TUR_MDL_LEGION[k](t)}));
for(const k of ['hellstorm','nova','missilebastion','seafort','stormcaller'])
  BLD_TIER_MDL_LEGION[k]=[1,2,3].map(t=>({base:()=>BLD_MDL_LEGION[k](t),tur:()=>BLD_TUR_MDL_LEGION[k](t)}));
for(const k of ['arc','sgen','uplink','plasma']) BLD_TIER_MDL_LEGION[k]=[1,2,3].map(t=>({base:()=>BLD_MDL_LEGION[k](t)}));

