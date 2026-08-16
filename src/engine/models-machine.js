;
;
/* ============================================================================
   MACHINE ASCENDANCY — PROCEDURAL STRUCTURE LIBRARY
   ----------------------------------------------------------------------------
   Load after engine/models.js. The Machine language is deliberately not a
   purple repaint of Terran concrete: triangular plans, separated/floating
   mechanisms, radial cages and exposed energy throats carry the faction read.

   Every visible finish is zoned onto the existing mobile material atlas. This
   adds no texture, sampler or draw-call class; the new colours are selectors
   for the six tower PBR cells already paid for by materials.js.
   ============================================================================ */

/* Coalition hardware used the same violet glow/black shell family as Brood
   tissue. The meshes were correct, but at phone zoom the palette collapsed
   both factions into the same read. Advanced-machine energy is now cyan/blue
   over brighter naval steel; violet remains exclusive to the organic hive. */
const MAC_ARM=C(124,152,178), MAC_ARM_D=C(37,54,72);
const MAC_PANEL=C(154,179,202), MAC_EDGE=C(208,232,246);
const MAC_MECH=C(136,166,190), MAC_TRIM=C(204,232,246);
const MAC_COAT=C(18,33,48), MAC_GLOW=C(52,198,255);
const MAC_GLOW_HI=C(178,241,255), MAC_STATUS=C(88,216,255), MAC_PAD=C(56,76,94);
const MAC_BORE=C(5,13,20), MAC_TEAM=C(104,176,238);
COL_MAT.set(MAC_ARM,MAT.TWR_ARMOR); COL_MAT.set(MAC_ARM_D,MAT.TWR_COAT);
COL_MAT.set(MAC_PANEL,MAT.TWR_ARMOR); COL_MAT.set(MAC_EDGE,MAT.TWR_MACH);
COL_MAT.set(MAC_MECH,MAT.TWR_MACH); COL_MAT.set(MAC_TRIM,MAT.TWR_MACH);
COL_MAT.set(MAC_COAT,MAT.TWR_COAT); COL_MAT.set(MAC_GLOW,MAT.TWR_GLOW);
COL_MAT.set(MAC_GLOW_HI,MAT.TWR_GLOW); COL_MAT.set(MAC_STATUS,MAT.TWR_GLOW); COL_MAT.set(MAC_PAD,MAT.TWR_PAD);
COL_MAT.set(MAC_BORE,MAT.TWR_BORE); COL_MAT.set(MAC_TEAM,MAT.TWR_ARMOR);
COL_TEAM.add(MAC_TEAM);

function macPoly(n,r,rot){
  const p=[]; rot=rot||0;
  for(let i=0;i<n;i++){const a=rot+i/n*TAU;p.push([Math.cos(a)*r,Math.sin(a)*r]);}
  return p;
}
function macTri(r){ return macPoly(3,r,-Math.PI/2); }
function macHex(r){ return macPoly(6,r,Math.PI/6); }
function macGlowBar(m,x,y,z,w,d,yaw,col){
  m.box(x,y,z,w,.28,d,col||MAC_GLOW,yaw||0); return m;
}
function macCheeks(m,x,y,gap,w,h,tier){
  for(const s of [-1,1]){
    m.bevelBox(x,y,s*gap,w,h,.58,.22,MAC_PANEL);
    m.box(x,y+h-.12,s*(gap+.31),w*.52,.18,.62,s>0?MAC_GLOW:MAC_STATUS);
  }
  if((tier||1)>1) m.box(x-w*.38,y+h*.36,0,.5,h*.42,gap*1.62,MAC_EDGE);
  return m;
}
function macPylon(m,a,r,y,h,w,lit){
  const x=Math.cos(a)*r,z=Math.sin(a)*r, yaw=a+Math.PI/2;
  m.extrude(x,y,z,macTri(w),h,MAC_ARM_D,yaw);
  m.extrude(x,y+h,z,macTri(w*.72),3.0,a<0?MAC_TEAM:MAC_PANEL,yaw);
  m.box(x,y+h*.66,z,w*.58,.34,w*.25,MAC_EDGE,yaw);
  m.box(x,y+h*.42,z,w*.42,h*.48,.55,MAC_COAT,yaw);
  if(lit!==false) m.box(x,y+h*.47,z,w*.18,h*.34,.60,a<0?MAC_STATUS:MAC_GLOW,yaw);
  return m;
}
function macPad(m,r,tier,core){
  tier=tier||1;
  m.extrude(0,0,0,macHex(r),2.8,MAC_PAD);
  m.extrude(0,2.8,0,macTri(r*.91),3.5,MAC_ARM_D);
  m.extrude(0,6.3,0,macHex(r*.67),3.6,MAC_PANEL);
  m.ring(0,10.0,0,r*.38,r*.55,24,MAC_COAT);
  m.ring(0,10.15,0,r*.47,r*.51,24,MAC_GLOW);
  for(let i=0;i<3;i++){
    const a=-Math.PI/2+i*TAU/3,x=Math.cos(a)*r*.73,z=Math.sin(a)*r*.73;
    m.bevelBox(x,2.8,z,r*.28,4.2,r*.20,.55,i===0?MAC_TEAM:MAC_COAT,a);
    m.box(x,6.68,z,r*.20,.24,r*.12,MAC_EDGE,a);
    macGlowBar(m,x,7.1,z,r*.16,r*.06,a,i===0?MAC_STATUS:MAC_GLOW);
    if(tier>1) m.cyl(x,7.0,z,r*.055,r*.035,4.1,7,MAC_MECH);
  }
  if(tier>2) for(let i=0;i<6;i++){
    const a=i*TAU/6,x=Math.cos(a)*r*.58,z=Math.sin(a)*r*.58;
    m.sphere(x,10.8,z,.62,7,MAC_GLOW,1,false);
  }
  if(core) m.tube(0,9.9,0,r*.31,r*.19,1.2,18,MAC_BORE);
  return m;
}
function macCore(m,x,y,z,r,axes){
  m.sphere(x,y,z,r,12,MAC_GLOW,1,false);
  m.ring(x,y,z,r*1.25,r*1.48,24,MAC_EDGE);
  if(axes!==false){
    ringX(m,x,y,z,r*1.38,r*1.58,22,MAC_ARM);
    m.cyl(x,y-r*1.45,z,r*1.55,r*1.55,.32,22,MAC_GLOW_HI);
  }
  return m;
}
function macCrown(m,y,r,n){
  for(let i=0;i<n;i++){
    const a=i/n*TAU,x=Math.cos(a)*r,z=Math.sin(a)*r;
    m.cyl(x,y,z,1.0,.18,7.5,7,MAC_MECH);
    m.sphere(x,y+7.6,z,.72,7,MAC_GLOW,1,false);
  }
  return m;
}
function macPortal(m,x,y,z,ri,ro){
  ringX(m,x,y,z,ri,ro,28,MAC_ARM);
  ringX(m,x+.16,y,z,ri*.78,ri*.94,24,MAC_GLOW);
  tubeX(m,x-.45,y,z,.9,ro*.18,ro*.09,12,MAC_BORE);
  return m;
}

/* ---- economy ------------------------------------------------------------- */
function mdlMacMex(){
  const m=MB(); macPad(m,18,1,true);
  for(let i=0;i<3;i++) macPylon(m,-Math.PI/2+i*TAU/3,11.5,8,19,3.7,true);
  m.tube(0,9.8,0,5.2,3.1,13.5,16,MAC_BORE);
  m.cyl(0,10.2,0,2.9,1.6,18,12,MAC_MECH,false);
  m.cyl(0,28.2,0,1.8,.25,5.2,10,MAC_TRIM,false);
  m.ring(0,22.0,0,7.0,8.2,22,MAC_TRIM);
  for(let i=0;i<3;i++){
    const a=i*TAU/3,x=Math.cos(a)*12,z=Math.sin(a)*12;
    m.bevelBox(x,9,z,5.5,6.5,5.5,.65,MAC_COAT,a);
  }
  return m.build();
}
function mdlMacPgen(){
  const m=MB(); macPad(m,19,1,false);
  m.extrude(0,9.9,0,macTri(10.5),16,MAC_ARM_D);
  m.extrude(0,25.9,0,macTri(7.4),5.0,MAC_ARM);
  for(let i=0;i<3;i++) macPylon(m,-Math.PI/2+i*TAU/3,13,8,21,3.1,true);
  macCore(m,0,30.5,0,5.2,true);
  m.ring(0,20.2,0,10.8,12.0,24,MAC_MECH);
  m.ring(0,23.1,0,8.6,9.3,24,MAC_GLOW);
  return m.build();
}
function mdlMacGeo(){
  const m=MB(); macPad(m,20,1,true);
  for(const s of [-1,1]){
    m.extrude(s*8.5,9.8,0,macTri(5.0),25,MAC_ARM_D,s*Math.PI/8);
    m.tube(s*8.5,34.4,0,3.8,2.0,2.0,14,MAC_BORE);
    m.sphere(s*8.5,38.0,0,2.2,9,MAC_GLOW,1,false);
  }
  macPortal(m,0,28,0,5.2,7.5);
  for(const z of [-11,11]) m.bevelBox(0,9.8,z,13,6,5,.8,MAC_COAT);
  return m.build();
}
function mdlMacSilo(){
  const m=MB(); macPad(m,21,1,false);
  const cells=[[-8,-7],[8,-7],[-8,7],[8,7]];
  for(const p of cells){
    m.extrude(p[0],9.8,p[1],macHex(5.6),18,MAC_ARM_D);
    m.tube(p[0],27.4,p[1],4.7,3.0,1.8,14,MAC_BORE);
    m.ring(p[0],22.0,p[1],5.1,5.8,18,MAC_GLOW);
  }
  m.sphere(0,29,0,3.2,10,MAC_GLOW,1,false);
  ringX(m,0,29,0,4.4,5.2,18,MAC_TRIM);
  return m.build();
}
function mdlMacFab(){
  const m=MB(); macPad(m,22,1,false);
  m.bevelBox(-4,9.8,0,28,15,27,2.2,MAC_ARM_D);
  m.extrude(-4,24.8,0,macTri(14),6,MAC_ARM);
  macPortal(m,10.2,23,0,6.0,9.2);
  for(const s of [-1,1]){
    m.bevelBox(-10,13,s*13.8,11,11,4,.8,MAC_COAT);
    macGlowBar(m,-10,24.1,s*13.9,6.5,1.1,0);
  }
  macCrown(m,28,10,3);
  return m.build();
}

/* ---- production, command, research and support -------------------------- */
function mdlMacFac(){
  const m=MB();
  m.extrude(0,0,0,[[-37,-27],[25,-32],[39,0],[25,32],[-37,27],[-27,0]],4,MAC_PAD);
  m.extrude(-7,4,0,[[-27,-21],[14,-25],[29,0],[14,25],[-27,21],[-20,0]],8,MAC_ARM_D);
  for(const s of [-1,1]){
    m.bevelBox(-8,12,s*19,34,13,7,1.2,MAC_ARM);
    m.bevelBox(-8,22.8,s*19,20,2.0,5,.4,MAC_PANEL);
    m.box(-8,24.85,s*21.55,11,.24,.55,s>0?MAC_GLOW:MAC_STATUS);
    macPylon(m,s*Math.PI/2,30,4,27,4.8,true);
  }
  macPortal(m,22,23,0,10,15);
  m.box(-5,12,0,40,2.0,18,MAC_COAT);
  m.extrude(-9,14.05,0,macTri(8.2),.52,MAC_PANEL);
  m.greeble(-9,14,0,30,14,2.2,10,MAC_MECH,0,71);
  macCore(m,-23,29,0,3.6,false);
  return m.build();
}
function mdlMacAirfield(){
  const m=MB();
  m.extrude(0,0,0,[[-46,-28],[31,-28],[48,0],[31,28],[-46,28],[-35,0]],3,MAC_PAD);
  m.extrude(-4,3,0,[[-37,-22],[28,-22],[39,0],[28,22],[-37,22],[-29,0]],3,MAC_ARM_D);
  for(const s of [-1,1]){
    m.box(-3,6,s*13,60,.55,3.0,MAC_GLOW);
    m.bevelBox(-28,6,s*22,20,8,7,1.0,MAC_ARM_D);
    m.box(-28,14.05,s*22,11,.35,3.4,MAC_PANEL);
    macPylon(m,s*Math.PI/2,27,3,18,3.4,true);
  }
  m.ring(22,6.7,0,9,13,28,MAC_ARM);
  m.ring(22,6.9,0,10.8,11.7,28,MAC_GLOW);
  m.bevelBox(-35,6,0,14,17,30,1.5,MAC_ARM);
  m.bevelBox(-35,23.05,0,9,1.4,22,.35,MAC_PANEL);
  macPortal(m,-27.8,19,0,5,8);
  return m.build();
}
function mdlMacHarbor(){
  const m=MB();
  m.extrude(0,0,0,[[-42,-28],[26,-28],[40,-15],[18,-8],[18,8],[40,15],[26,28],[-42,28]],4,MAC_PAD);
  for(const s of [-1,1]){
    m.bevelBox(-5,4,s*21,64,7,8,1.0,MAC_ARM_D);
    m.box(-3,11.05,s*21,48,.42,4.2,MAC_PANEL);
    macGlowBar(m,-3,11.5,s*21,28,.8,0,s>0?MAC_GLOW:MAC_STATUS);
    macPylon(m,s*Math.PI/2,30,4,22,4.0,true);
  }
  m.bevelBox(-30,4,0,20,19,34,2.0,MAC_ARM);
  m.bevelBox(-30,23.05,0,13,1.5,24,.4,MAC_PANEL);
  macPortal(m,-19,21,0,6.5,10);
  return m.build();
}
function mdlMacHQ(){
  const m=MB();
  m.extrude(0,0,0,macHex(47),4,MAC_PAD);
  m.extrude(0,4,0,macTri(41),8,MAC_ARM_D);
  m.extrude(0,12,0,macHex(29),10,MAC_ARM);
  m.extrude(-7,22,0,macTri(22),13,MAC_ARM_D);
  m.extrude(-7,35.05,0,macTri(15),1.2,MAC_PANEL);
  for(let i=0;i<3;i++){
    const a=-Math.PI/2+i*TAU/3;
    macPylon(m,a,35,4,36,7.0,true);
    const x=Math.cos(a)*29,z=Math.sin(a)*29;
    m.bevelBox(x,9,z,15,14,15,1.8,MAC_COAT,a);
  }
  macCore(m,-7,40,0,8.0,true);
  m.ring(0,22.4,0,25,29,30,MAC_COAT);
  m.ring(0,22.7,0,26.5,27.5,30,MAC_GLOW);
  macPortal(m,31,25,0,8,12);
  macCrown(m,44,24,6);
  return m.build();
}
function mdlMacTechlab(){
  const m=MB(); macPad(m,24,1,false);
  m.extrude(0,9.8,0,macTri(16),11,MAC_ARM_D);
  for(let i=0;i<3;i++) macPylon(m,-Math.PI/2+i*TAU/3,16.5,9,25,4.5,true);
  macCore(m,0,28,0,6.6,true);
  ringX(m,0,28,0,9.0,10.2,28,MAC_MECH);
  m.ring(0,20.6,0,12,14,28,MAC_GLOW);
  return m.build();
}
function mdlMacUplink(){
  const m=MB(); macPad(m,20,2,false);
  m.extrude(0,9.8,0,macTri(9.5),29,MAC_ARM_D);
  m.extrude(0,38.8,0,macTri(5.8),8,MAC_ARM);
  for(let y=17;y<42;y+=7) m.ring(0,y,0,8.5-(y-17)*.10,9.4-(y-17)*.10,22,MAC_GLOW);
  macPortal(m,0,49,0,6.5,9.5);
  macCrown(m,38,12,3);
  return m.build();
}
function mdlMacShield(){
  const m=MB(); macPad(m,20,1,false);
  for(let i=0;i<3;i++) macPylon(m,-Math.PI/2+i*TAU/3,13,9,22,3.8,true);
  macCore(m,0,26,0,7.0,true);
  m.ring(0,17,0,10,13.5,26,MAC_ARM);
  m.ring(0,17.3,0,11.3,12.2,26,MAC_GLOW);
  return m.build();
}
function mdlMacTargetGate(){
  const m=MB(); macPad(m,17,1,false);
  for(const s of [-1,1]){
    m.extrude(0,9.8,s*8,macTri(5.5),24,MAC_ARM_D,s*.22);
    m.box(0,20,s*8,1.0,11,2.5,MAC_GLOW);
  }
  macPortal(m,0,28,0,6.2,9.2);
  m.sphere(0,28,0,2.0,8,MAC_GLOW_HI,1,false);
  return m.build();
}
function mdlMacRelayNest(){
  const m=MB(); macPad(m,19,1,false);
  m.extrude(0,9.8,0,macHex(12),12,MAC_ARM_D);
  for(let i=0;i<6;i++){
    const a=i*TAU/6,x=Math.cos(a)*10,z=Math.sin(a)*10;
    m.tube(x,20,z,2.4,1.25,3.0,10,MAC_BORE);
    m.sphere(x,24,z,1.0,7,MAC_GLOW,1,false);
  }
  macCore(m,0,27,0,4.5,false);
  return m.build();
}

/* ---- walls and gates ----------------------------------------------------- */
function mdlMacWall(){
  const m=MB();
  m.extrude(0,0,0,[[-15,-9],[12,-9],[16,0],[12,9],[-15,9],[-11,0]],3,MAC_PAD);
  m.bevelBox(0,3,0,28,11,11,1.5,MAC_ARM_D);
  m.extrude(0,14,0,[[-14,-5],[10,-5],[14,0],[10,5],[-14,5],[-10,0]],5,MAC_ARM);
  m.box(0,19.05,0,18,.44,6.5,MAC_PANEL);
  for(const x of [-10,0,10]){
    m.box(x,5,-5.7,1.4,11,.55,MAC_GLOW);
    m.box(x,5,5.7,1.4,11,.55,MAC_GLOW);
  }
  for(const x of [-13,13]) m.extrude(x,3,0,macTri(4.2),18,MAC_COAT,x<0?-.2:.2);
  m.box(-13,11.5,-4.25,2.2,5,.38,MAC_TEAM,-.2);
  return m.build();
}
function mdlMacGate(){
  const m=MB();
  m.extrude(0,0,0,[[-16,-10],[12,-10],[17,0],[12,10],[-16,10],[-12,0]],3,MAC_PAD);
  for(const s of [-1,1]){
    m.extrude(s*11,3,0,macTri(6.5),24,MAC_ARM_D,s*.18);
    m.extrude(s*11,27,0,macTri(4.3),4,s<0?MAC_TEAM:MAC_PANEL);
    m.box(s*11,9,0,1.5,14,5,MAC_GLOW);
  }
  m.box(0,23,0,20,4,8,MAC_COAT);
  m.box(0,4,0,17,18,.55,MAC_GLOW);
  macPortal(m,0,25,0,4.5,6.2);
  return m.build();
}

/* ---- eight contact-sheet defensive archetypes -------------------------- */
function mdlMacGravityBase(tier){
  const m=MB(); tier=tier||1; macPad(m,22,tier,true);
  for(let i=0;i<3;i++) macPylon(m,-Math.PI/2+i*TAU/3,15.5,9,11+tier,4.2,true);
  m.tube(0,10,0,8.2,5.5,6.0,22,MAC_BORE);
  m.ring(0,16.1,0,9.0,12.0,28,MAC_ARM);
  m.ring(0,16.4,0,10.2,11.0,28,MAC_GLOW);
  macAimBearing(m,16.7,7.8,tier);
  return m.build();
}
function mdlMacGravityTur(tier){
  const m=MB(); tier=tier||1;
  m.cyl(0,0,0,7.9,7.3,2.0,18,MAC_MECH);
  m.bevelBox(-3.5,2.0,0,15+tier,7.5,15+tier,1.2,MAC_ARM);
  macCheeks(m,-4,4.3,7.55+tier*.5,8.5,2.5,tier);
  tubeX(m,2.5,7.2,0,15+tier*2.5,3.2+tier*.2,1.22+tier*.08,18,MAC_BORE);
  for(const x of [4,10,16]) ringX(m,x,7.2,0,3.5+tier*.2,4.2+tier*.2,20,x===16?MAC_GLOW:MAC_EDGE);
  macCore(m,-8,9.0,0,3.2+tier*.35,false);
  for(const s of [-1,1]) m.extrude(-5,4.8,s*(7.0+tier*.45),macTri(3.0),7+tier,MAC_COAT,s*.2);
  return m.build();
}
function mdlMacSpinBeam(tier){
  const m=MB(); tier=tier||1; macPad(m,20,tier,false);
  m.cyl(0,9.8,0,9.0,7.6,6.5,16,MAC_ARM_D);
  m.cyl(0,16.3,0,6.8,6.8,2.0,16,MAC_MECH);
  m.bevelBox(-3,18.3,0,17,7.5,13,1.2,MAC_ARM);
  tubeX(m,4.5,22.2,0,20+tier*3,2.7,1.25,14,MAC_BORE);
  for(const x of [4,10,16]) ringX(m,x,22.2,0,2.8,3.6,16,x===16?MAC_GLOW:MAC_TRIM);
  m.box(-6,25.9,0,5,.28,7,MAC_TEAM);
  macCore(m,-8,26,0,2.5,false);
  return m.build();
}
function mdlMacPhaseDisruptor(tier){
  const m=MB(); tier=tier||1; macPad(m,21,tier,false);
  m.extrude(0,9.8,0,macTri(12.5),9,MAC_ARM_D);
  for(let i=0;i<3;i++){
    const a=-Math.PI/2+i*TAU/3,x=Math.cos(a)*7,z=Math.sin(a)*7;
    m.extrude(x,18,z,macTri(4.2),15+tier*2,MAC_ARM,a);
    m.box(x,23,z,1.0,8,.8,MAC_GLOW,a);
  }
  macCore(m,0,25+tier,0,4.2,false);
  for(const z of [-4.2,0,4.2]){
    tubeX(m,5.0,27,z,13+tier*2,1.45,.68,12,MAC_BORE);
    ringX(m,16+tier*2,27,z,1.55,2.15,12,MAC_GLOW);
  }
  return m.build();
}
function mdlMacVoidLance(tier){
  const m=MB(); tier=tier||1; macPad(m,22,tier,false);
  m.extrude(-4,9.8,0,macTri(14),10,MAC_ARM_D);
  m.bevelBox(-4,19.8,0,21,9,16,1.5,MAC_ARM);
  for(const s of [-1,1]){
    m.extrude(-7,23,s*8.5,macTri(4),11,MAC_COAT,s*.25);
    m.box(-7,27,s*8.6,1,6,.6,MAC_GLOW);
  }
  tubeX(m,3.5,25,0,29+tier*4,3.4,1.35,16,MAC_BORE);
  for(const x of [4,12,20,28]) ringX(m,x,25,0,3.5,4.4,18,x===28?MAC_GLOW:MAC_TRIM);
  macCore(m,-10,30,0,3.0,false);
  return m.build();
}
function mdlMacSwarmFabricator(tier){
  const m=MB(); tier=tier||1; macPad(m,24,tier,false);
  m.bevelBox(-2,9.8,0,31,14,29,2.0,MAC_ARM_D);
  m.extrude(-5,23.8,0,macTri(15),5,MAC_ARM);
  const cells=tier===1?4:tier===2?6:8;
  for(let i=0;i<cells;i++){
    const row=i>>1,z=(i%2?1:-1)*6.5,y=18+row*4.4;
    tubeX(m,9.5,y,z,4.0,2.25,1.20,12,MAC_BORE);
    m.bevelBox(6.8,y-2.2,z,5.4,4.4,5.4,.55,MAC_MECH);
  }
  macPortal(m,-14,28,0,5.0,8.2);
  macCrown(m,31,12,3);
  return m.build();
}
function mdlMacEnergyVortex(tier){
  const m=MB(); tier=tier||1; macPad(m,23,tier,true);
  m.extrude(0,9.8,0,macHex(14),10,MAC_ARM_D);
  for(let i=0;i<3;i++) macPylon(m,-Math.PI/2+i*TAU/3,15,9,25,4.0,true);
  macPortal(m,0,29+tier,0,10+tier,14+tier);
  ringX(m,.2,29+tier,0,6.0+tier,8.2+tier,26,MAC_GLOW);
  m.sphere(0,29+tier,0,3.4+tier*.5,11,MAC_GLOW_HI,1,false);
  m.ring(0,20,0,12,15,30,MAC_COAT);
  return m.build();
}
function mdlMacPulseArray(tier){
  const m=MB(); tier=tier||1; macPad(m,22,tier,false);
  m.extrude(-3,9.8,0,macTri(14),9,MAC_ARM_D);
  m.bevelBox(-4,18.8,0,19,7.5,18,1.2,MAC_ARM);
  const n=tier===1?3:tier===2?5:7;
  for(let i=0;i<n;i++){
    const a=(i-(n-1)/2)*.48,y=24+Math.cos(a)*4,z=Math.sin(a)*10;
    tubeX(m,3.5,y,z,16+tier*2,1.35,.62,12,MAC_BORE);
    ringX(m,18+tier*2,y,z,1.4,2.0,12,MAC_GLOW);
  }
  for(const s of [-1,1]) macPylon(m,s*Math.PI/2,14,9,22,3.0,true);
  macCore(m,-11,28,0,2.8,false);
  return m.build();
}
function mdlMacSingularityCore(tier){
  const m=MB(); tier=tier||1; macPad(m,25,tier,true);
  for(let i=0;i<6;i++){
    const a=i*TAU/6,x=Math.cos(a)*17,z=Math.sin(a)*17;
    m.extrude(x,9.8,z,macTri(3.8),25+tier*2,MAC_ARM_D,a);
    m.box(x,18,z,1.0,12,.65,MAC_GLOW,a);
  }
  m.tube(0,10,0,9.0,6.0,8.0,22,MAC_BORE);
  macCore(m,0,29+tier*2,0,7.0+tier,true);
  ringX(m,0,29+tier*2,0,11+tier,13+tier,30,MAC_ARM);
  m.ring(0,29+tier*2,0,10+tier,12+tier,30,MAC_GLOW);
  macCrown(m,38+tier*2,18,6);
  return m.build();
}

/* ---- tracking weapon assemblies -----------------------------------------
   The first Machine pass authored complete showcase sculptures. In play that
   made every barrel keep its construction yaw while projectiles correctly
   tracked a target. These mounts deliberately split the low foundation from
   the weapon-forward +X assembly expected by render3d's V.tur stream. Keeping
   the bearing at local Y=0 also means tier changes never make a gun float. */
function macAimBearing(m,y,r,tier){
  m.cyl(0,y,0,r+1.5,r+1.15,1.8,18,MAC_ARM_D);
  m.cyl(0,y+1.8,0,r,r*.92,.9,18,MAC_MECH);
  m.ring(0,y+2.78,0,r*.70,r*.96,20,MAC_GLOW);
  if((tier||1)>1) for(let i=0;i<3;i++){
    const a=i*TAU/3,x=Math.cos(a)*r*.76,z=Math.sin(a)*r*.76;
    m.box(x,y+2.25,z,r*.24,.32,r*.16,MAC_TRIM,a);
  }
  return m;
}
function mdlMacSpinBeamBase(tier){
  const m=MB(); tier=tier||1; macPad(m,20,tier,false);
  m.cyl(0,9.8,0,9.0,7.6,6.2,16,MAC_ARM_D);
  macAimBearing(m,16.0,6.9,tier);
  for(const s of [-1,1]){
    m.bevelBox(-7,10,s*12.3,8,6,4,.55,MAC_COAT);
    m.box(-7,15.8,s*12.35,4,.24,2.2,s>0?MAC_TEAM:MAC_GLOW);
  }
  return m.build();
}
function mdlMacSpinBeamTur(tier){
  const m=MB(); tier=tier||1;
  m.cyl(0,0,0,6.9,6.45,2.0,16,MAC_MECH);
  m.bevelBox(-3,2.0,0,17,7.5,13,1.2,MAC_ARM);
  macCheeks(m,-3,4.4,6.55,9,2.6,tier);
  m.bevelBox(-8.5,3.4,0,6.5,6.6,11,.8,MAC_COAT);
  tubeX(m,4.5,5.9,0,20+tier*3,2.7,1.25,14,MAC_BORE);
  for(const x of [4,10,16]) ringX(m,x,5.9,0,2.8,3.6,16,x===16?MAC_GLOW:MAC_TRIM);
  m.box(-6,9.4,0,5,.28,7,MAC_TEAM);
  macCore(m,-8,9.4,0,2.5,false);
  return m.build();
}
/* The mining laser formerly reused Spin Beam verbatim. The extractor version
   has a single lens throat, calibration forks and a low field cradle: it reads
   as sustained industrial cutting rather than a sweeping anti-unit weapon. */
function mdlMacMiningBase(tier){
  const m=MB();tier=tier||1;macPad(m,21,tier,true);
  m.extrude(0,9.8,0,macHex(12.5),6.2,MAC_ARM_D);
  for(const s of [-1,1]){
    macPylon(m,s*Math.PI/2,13.5,9,11+tier,3.1,true);
    m.bevelBox(-6,10,s*(12.2+tier*.25),8.5,5.6,3.2,.52,MAC_COAT);
    m.box(-6,15.42,s*(13.83+tier*.25),4.2,.22,.48,s>0?MAC_STATUS:MAC_GLOW);
  }
  macAimBearing(m,16.1,7.2,tier);
  return m.build();
}
function mdlMacMiningTur(tier){
  const m=MB();tier=tier||1;
  m.cyl(0,0,0,7.3,6.7,1.8,18,MAC_MECH);
  m.bevelBox(-4,1.8,0,18,7.0,13,1.15,MAC_ARM_D);
  for(const s of [-1,1]){
    m.extrude(-2,5.0,s*(6.7+tier*.22),macTri(2.9),8+tier,MAC_PANEL,s*.16);
    m.box(-2,7.8,s*(6.8+tier*.22),.65,4.0,.55,s>0?MAC_STATUS:MAC_TEAM);
  }
  const L=18+tier*2.5;
  tubeX(m,3.5,6.0,0,L,2.55+tier*.08,1.12+tier*.05,16,MAC_BORE);
  for(let k=0;k<3+tier;k++){
    const x=5+k*(L-3)/(2+tier);
    ringX(m,x,6.0,0,2.75+tier*.08,3.45+tier*.08,18,k===2+tier?MAC_GLOW_HI:MAC_EDGE);
  }
  macCore(m,-8.2,8.8,0,2.7+tier*.15,false);
  return m.build();
}
function mdlMacPhaseBase(tier){
  const m=MB(); tier=tier||1; macPad(m,21,tier,false);
  m.extrude(0,9.8,0,macTri(12.5),6.5,MAC_ARM_D);
  for(let i=0;i<3;i++){
    const a=-Math.PI/2+i*TAU/3,x=Math.cos(a)*10,z=Math.sin(a)*10;
    m.extrude(x,9.8,z,macTri(3.8),8.0+tier,MAC_ARM_D,a);
    m.box(x,13,z,.8,4.2,.65,MAC_GLOW,a);
  }
  macAimBearing(m,16.3,7.0,tier);
  return m.build();
}
function mdlMacPhaseTur(tier){
  const m=MB(); tier=tier||1;
  m.cyl(0,0,0,7.1,6.5,1.8,16,MAC_MECH);
  m.bevelBox(-3,1.8,0,18,7.0,15,1.15,MAC_ARM);
  macCheeks(m,-3,4.0,7.55,9.5,2.5,tier);
  for(const z of [-4.2,0,4.2]){
    tubeX(m,5.0,6.5,z,13+tier*2,1.45,.68,12,MAC_BORE);
    ringX(m,16+tier*2,6.5,z,1.55,2.15,12,MAC_GLOW);
  }
  for(const s of [-1,1]) m.box(-5,8.5,s*5.4,4.2,.24,1.0,s>0?MAC_TEAM:MAC_GLOW);
  macCore(m,-8.0,9.0,0,2.4,false);
  return m.build();
}
/* Plasma Charger is a paired capacitor weapon, not another Phase Disruptor.
   A visible suspended core feeds two short open emitters; the silhouette stays
   compact enough for its existing 54-unit plot at every upgrade tier. */
function mdlMacPlasmaBase(tier){
  const m=MB();tier=tier||1;macPad(m,20,tier,true);
  m.extrude(0,9.8,0,macTri(11.5),6.0,MAC_ARM_D);
  for(let i=0;i<3;i++){
    const a=-Math.PI/2+i*TAU/3,x=Math.cos(a)*11,z=Math.sin(a)*11;
    m.extrude(x,9.8,z,macTri(3.5),7+tier,MAC_COAT,a);
    m.sphere(x,16.2+tier,z,1.25+tier*.08,8,i===0?MAC_STATUS:MAC_GLOW,1,false);
  }
  macAimBearing(m,16.2,6.9,tier);
  return m.build();
}
function mdlMacPlasmaTur(tier){
  const m=MB();tier=tier||1;
  m.cyl(0,0,0,7.0,6.45,1.8,18,MAC_MECH);
  m.bevelBox(-4,1.8,0,17,7.1,14,1.1,MAC_ARM);
  macCore(m,-3.6,8.3,0,3.1+tier*.22,true);
  for(const s of [-1,1]){
    const z=s*(3.15+tier*.12),L=15+tier*1.5;
    m.bevelBox(1.5,4.0,z,10+tier,3.1,2.5,.38,MAC_PANEL);
    tubeX(m,4.2,6.15,z,L,1.42+tier*.08,.67+tier*.04,12,MAC_BORE);
    ringX(m,9.0,6.15,z,1.58+tier*.08,2.10+tier*.09,14,s>0?MAC_STATUS:MAC_GLOW);
    ringX(m,4.2+L,6.15,z,1.60+tier*.08,2.28+tier*.09,14,MAC_GLOW_HI);
  }
  m.box(-7.2,5.0,0,3.4,5.8,8.5,MAC_COAT);
  return m.build();
}
function mdlMacVoidBase(tier){
  const m=MB(); tier=tier||1; macPad(m,22,tier,false);
  m.extrude(-4,9.8,0,macTri(14),7.5,MAC_ARM_D);
  for(const s of [-1,1]){
    m.extrude(-7,10,s*10,macTri(4),8+tier,MAC_COAT,s*.25);
    m.box(-7,13,s*10,1,4,.6,MAC_GLOW);
  }
  macAimBearing(m,17.2,7.4,tier);
  return m.build();
}
function mdlMacVoidTur(tier){
  const m=MB(); tier=tier||1;
  m.cyl(0,0,0,7.5,6.9,2.0,18,MAC_MECH);
  m.bevelBox(-4,2,0,22,8.5,16,1.4,MAC_ARM);
  macCheeks(m,-4.5,4.8,8.05,11,2.8,tier);
  tubeX(m,3.5,6.3,0,29+tier*4,3.4,1.35,16,MAC_BORE);
  for(const x of [4,12,20,28]) ringX(m,x,6.3,0,3.5,4.4,18,x===28?MAC_GLOW:MAC_TRIM);
  for(const s of [-1,1]) m.box(-5,8.8,s*6.4,6,.25,1.0,s>0?MAC_TEAM:MAC_GLOW);
  macCore(m,-10,9.1,0,3.0,false);
  return m.build();
}
function mdlMacPulseBase(tier){
  const m=MB(); tier=tier||1; macPad(m,22,tier,false);
  m.extrude(-3,9.8,0,macTri(14),6.0,MAC_ARM_D);
  for(const s of [-1,1]) macPylon(m,s*Math.PI/2,15,9,12+tier,3.0,true);
  macAimBearing(m,15.8,7.1,tier);
  return m.build();
}
function mdlMacPulseTur(tier){
  const m=MB(); tier=tier||1;
  m.cyl(0,0,0,7.2,6.6,1.8,18,MAC_MECH);
  m.bevelBox(-4,1.8,0,19,7.5,18,1.2,MAC_ARM);
  macCheeks(m,-4,4.2,9.05,9.5,2.6,tier);
  const n=tier===1?3:tier===2?5:7;
  for(let i=0;i<n;i++){
    const a=(i-(n-1)/2)*.48,y=6+Math.cos(a)*2.2,z=Math.sin(a)*8;
    tubeX(m,3.5,y,z,16+tier*2,1.35,.62,12,MAC_BORE);
    ringX(m,18+tier*2,y,z,1.4,2.0,12,MAC_GLOW);
  }
  macCore(m,-11,9.0,0,2.8,false);
  return m.build();
}
/* Skyguard used to be the Bulwark's pulse fan. A raised sensor diamond and
   four separated interceptor barrels now give it a vertical anti-air read. */
function mdlMacAABase(tier){
  const m=MB();tier=tier||1;macPad(m,20,tier,false);
  m.extrude(0,9.8,0,macHex(11.5),6.0,MAC_ARM_D);
  for(let i=0;i<3;i++){
    const a=-Math.PI/2+i*TAU/3,x=Math.cos(a)*11.5,z=Math.sin(a)*11.5;
    m.extrude(x,9.8,z,macTri(3.3),10+tier,MAC_COAT,a);
    m.box(x,14.5,z,.72,5.5,.52,i===0?MAC_STATUS:MAC_GLOW,a);
  }
  macAimBearing(m,16.0,6.8,tier);
  return m.build();
}
function mdlMacAATur(tier){
  const m=MB();tier=tier||1;
  m.cyl(0,0,0,6.9,6.35,1.7,18,MAC_MECH);
  m.bevelBox(-3.5,1.7,0,16,6.8,15,1.05,MAC_ARM_D);
  for(const s of [-1,1]){
    m.extrude(-1.5,5.0,s*(7.6+tier*.15),macTri(3.3),7+tier,MAC_ARM,s*.14);
    for(const q of [-1,1]){
      const y=5.2+q*2.0,z=s*(3.0+tier*.18);
      tubeX(m,3.2,y,z,12+tier*2,1.02+tier*.05,.48+tier*.03,11,MAC_BORE);
      ringX(m,14.0+tier*2,y,z,1.10+tier*.05,1.55+tier*.06,12,q===s?MAC_STATUS:MAC_GLOW);
    }
  }
  macPortal(m,-6.4,9.4,0,2.7+tier*.15,4.1+tier*.18);
  return m.build();
}
function mdlMacSwarmBase(tier){
  const m=MB(); tier=tier||1; macPad(m,24,tier,false);
  m.extrude(-2,9.8,0,macTri(15),7,MAC_ARM_D);
  for(const s of [-1,1]){
    m.bevelBox(-8,10,s*13,9,6,5,.6,MAC_COAT);
    m.box(-8,15.8,s*13.1,4,.24,2,s>0?MAC_TEAM:MAC_GLOW);
  }
  macAimBearing(m,16.8,8.0,tier);
  return m.build();
}
function mdlMacSwarmTur(tier){
  const m=MB(); tier=tier||1;
  m.cyl(0,0,0,8.1,7.5,1.9,18,MAC_MECH);
  m.bevelBox(-2,1.9,0,24,10,24,1.6,MAC_ARM_D);
  m.extrude(-5,11.9,0,macTri(12),4,MAC_ARM);
  macCheeks(m,-5,5.0,12.05,10.5,3.0,tier);
  const cells=tier===1?4:tier===2?6:8;
  for(let i=0;i<cells;i++){
    const row=i>>1,z=(i%2?1:-1)*6.5,y=5.2+row*4.0;
    tubeX(m,9.5,y,z,4.0,2.25,1.20,12,MAC_BORE);
    m.bevelBox(6.8,y-2.2,z,5.4,4.4,5.4,.55,MAC_MECH);
  }
  for(const s of [-1,1]) m.box(-8,13,s*8,5,.24,1,s>0?MAC_TEAM:MAC_GLOW);
  return m.build();
}
function mdlMacSingularityBase(tier){
  const m=MB(); tier=tier||1; macPad(m,25,tier,true);
  for(let i=0;i<6;i++){
    const a=i*TAU/6,x=Math.cos(a)*17,z=Math.sin(a)*17;
    m.extrude(x,9.8,z,macTri(3.8),9+tier,MAC_ARM_D,a);
    m.box(x,13,z,1,5,.65,MAC_GLOW,a);
  }
  m.tube(0,10,0,9.0,6.0,6.0,22,MAC_BORE);
  macAimBearing(m,16.0,8.4,tier);
  return m.build();
}
function mdlMacSingularityTur(tier){
  const m=MB(); tier=tier||1;
  m.cyl(0,0,0,8.5,7.8,2.0,20,MAC_MECH);
  m.bevelBox(-5,2.0,0,20,8.5,18,1.35,MAC_ARM);
  macCheeks(m,-5,4.7,9.05,10,2.8,tier);
  macCore(m,-4,9.5,0,5.2+tier*.5,true);
  tubeX(m,3.5,8.3,0,18+tier*3,3.7,1.45,18,MAC_BORE);
  for(const x of [5,12,19]) ringX(m,x,8.3,0,3.8,4.8,20,x===19?MAC_GLOW_HI:MAC_TRIM);
  for(const s of [-1,1]) m.extrude(-5,6,s*8.5,macTri(3.4),8+tier,MAC_COAT,s*.2);
  return m.build();
}
function mdlMacSeafortBase(tier){
  const m=MB();tier=tier||1;
  m.extrude(0,0.6,0,macHex(20),3.2,MAC_PAD);                  // hex pontoon, air gap
  m.extrude(0,3.8,0,macHex(17.5),1.4,MAC_PANEL);
  for(let i=0;i<6;i++){
    const a=i*TAU/6,x=Math.cos(a)*16.2,z=Math.sin(a)*16.2;
    m.cyl(x,0.2,z,.85,.7,.7,10,MAC_MECH);
    m.ring(x,1.0,z,.62,1.05,12,MAC_GLOW);
  }
  m.extrude(0,5.2,0,macTri(12.5),8.5,MAC_ARM_D);
  for(const s of [-1,1]) macPylon(m,s*Math.PI/2,14,5.2,12+tier,3.2,true);
  macAimBearing(m,14.2,6.8,tier);
  return m.build();
}
function mdlMacSeafortTur(tier){
  const m=MB();tier=tier||1;
  m.cyl(0,0,0,6.8,6.3,1.8,16,MAC_MECH);
  m.bevelBox(-3.2,1.8,0,15,6.6,13.5,1.0,MAC_ARM);
  tubeX(m,3.0,5.8,0,13+tier*1.4,1.85,.82,12,MAC_BORE);
  ringX(m,14+tier*1.4,5.8,0,1.95,2.45,14,MAC_GLOW);
  for(const s of [-1,1]){
    tubeX(m,2.4,8.4,s*2.9,11+tier,.95,.42,10,MAC_BORE);
    ringX(m,12+tier,8.4,s*2.9,1.05,1.45,10,s>0?MAC_STATUS:MAC_GLOW);
  }
  macCore(m,-6.4,7.6,0,2.4,false);
  return m.build();
}
function mdlMacStormBase(tier){
  const m=MB();tier=tier||1;macPad(m,19,tier,true);
  for(const s of [-1,1]){
    m.extrude(-1,9.8,s*12.4,macTri(4.2),8+tier,MAC_COAT,s*.18);
    for(const x of [-6,1,8]){
      m.cyl(x,9.8,s*12.4,1.15,.9,5.5+tier*.5,8,MAC_MECH);
      m.sphere(x,15.5+tier*.5,s*12.4,.72,7,MAC_GLOW,1,false);
    }
  }
  macCore(m,0,18.2,0,3.4+tier*.2,true);
  macAimBearing(m,20.4,7.0,tier);
  return m.build();
}
function mdlMacStormTur(tier){
  const m=MB();tier=tier||1;
  m.cyl(0,0,0,7.2,6.6,1.8,16,MAC_MECH);
  m.bevelBox(-2.6,1.8,0,16,6.8,15,.95,MAC_ARM_D);
  for(let r=0;r<4;r++) for(let c=0;c<4;c++){
    const y=4.0+(r-1.5)*1.95,z=(c-1.5)*2.95;
    tubeX(m,4.8,y,z,2.1,1.05,.62,8,MAC_BORE);
    m.bevelBox(3.4,y-1.0,z,3.0,2.0,2.2,.24,MAC_MECH);
  }
  macCore(m,-7.2,7.4,0,2.6,false);
  return m.build();
}

/* The runtime may select this map by faction without teaching the model module
   about simulation objects. Directed defenses pair a foundation here with a
   +X tracking assembly in BLD_TUR_MDL_MACHINE; field/support devices stay
   complete base meshes because they act radially rather than aim at a unit. */
var BLD_MDL_MACHINE={
  mex:mdlMacMex, pgen:mdlMacPgen, fac:mdlMacFac,
  turret:mdlMacPhaseBase, bunker:mdlMacPulseBase,
  sgen:mdlMacShield, tgate:mdlMacTargetGate, nest:mdlMacRelayNest,
  harbor:mdlMacHarbor, bastion:mdlMacGravityBase,
  techlab:mdlMacTechlab, aatower:mdlMacAABase, airfield:mdlMacAirfield,
  uplink:mdlMacUplink, hq:mdlMacHQ,
  hellstorm:mdlMacSpinBeamBase, arc:mdlMacEnergyVortex, rail:mdlMacVoidBase,
  nova:mdlMacSingularityBase, wall:mdlMacWall,
  minelaser:mdlMacMiningBase, missilebastion:mdlMacSwarmBase,
  plasma:mdlMacPlasmaBase, gate:mdlMacGate,
  geo:mdlMacGeo, silo:mdlMacSilo, fab:mdlMacFab,
  seafort:mdlMacSeafortBase, stormcaller:mdlMacStormBase,

  gravitywell:mdlMacGravityBase, spinbeam:mdlMacSpinBeamBase,
  phasedisruptor:mdlMacPhaseBase, voidlance:mdlMacVoidBase,
  swarmfabricator:mdlMacSwarmBase, energyvortex:mdlMacEnergyVortex,
  pulsearray:mdlMacPulseBase, singularitycore:mdlMacSingularityBase,
};
/* Stage S1 — isolated Syndicate landmark packs.  The Machine kit deliberately
   keeps this data beside its builders instead of recolouring the generic
   renderer: each landmark can receive an authored BaseAO/NRE/mask triplet
   later without changing another building.  These are semantic-bake
   prototypes only — maps:null is an explicit record that no UV-authored
   texture set is being claimed yet. */
const SYN_MACHINE_STRUCTURE_PACKS=Object.freeze({
  hq:Object.freeze({
    id:'syndicate-hq-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_GOLD
    })
  }),
  fac:Object.freeze({
    id:'syndicate-fac-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  techlab:Object.freeze({
    id:'syndicate-techlab-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_GOLD
    })
  }),
  pgen:Object.freeze({
    id:'syndicate-pgen-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_GOLD
    })
  }),
  mex:Object.freeze({
    id:'syndicate-mex-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_NANO,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  geo:Object.freeze({
    id:'syndicate-geo-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  airfield:Object.freeze({
    id:'syndicate-airfield-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  rail:Object.freeze({
    id:'syndicate-rail-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  uplink:Object.freeze({
    id:'syndicate-uplink-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  turret:Object.freeze({
    id:'syndicate-turret-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  bunker:Object.freeze({
    id:'syndicate-bunker-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  bastion:Object.freeze({
    id:'syndicate-bastion-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  aatower:Object.freeze({
    id:'syndicate-aatower-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  minelaser:Object.freeze({
    id:'syndicate-minelaser-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  missilebastion:Object.freeze({
    id:'syndicate-missilebastion-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  hellstorm:Object.freeze({
    id:'syndicate-hellstorm-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  seafort:Object.freeze({
    id:'syndicate-seafort-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  stormcaller:Object.freeze({
    id:'syndicate-stormcaller-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  arc:Object.freeze({
    id:'syndicate-arc-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  sgen:Object.freeze({
    id:'syndicate-sgen-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  plasma:Object.freeze({
    id:'syndicate-plasma-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  wall:Object.freeze({
    id:'syndicate-wall-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  gate:Object.freeze({
    id:'syndicate-gate-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  nest:Object.freeze({
    id:'syndicate-nest-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_GOLD
    })
  }),
  harbor:Object.freeze({
    id:'syndicate-harbor-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  tgate:Object.freeze({
    id:'syndicate-tgate-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  silo:Object.freeze({
    id:'syndicate-silo-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  fab:Object.freeze({
    id:'syndicate-fab-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  }),
  nova:Object.freeze({
    id:'syndicate-nova-v2',source:'semantic-bake', maps:null,
    surfaces:Object.freeze({
      [MAT.TWR_ARMOR]:MAT.SYN_NANO,[MAT.TWR_COAT]:MAT.SYN_HOLO,
      [MAT.TWR_MACH]:MAT.SYN_GOLD,[MAT.TWR_GLOW]:MAT.SYN_CONDUIT,
      [MAT.TWR_PAD]:MAT.SYN_HOLO,[MAT.TRIM]:MAT.SYN_NANO
    })
  })
});
function synMachineStructureSurfacePass(geo,pack){
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
function synMachineStructureFactory(fn,key){
  if(!fn)return fn;
  return function(...args){return synMachineStructureSurfacePass(fn(...args),SYN_MACHINE_STRUCTURE_PACKS[key]);};
}
for(const k of ['hq','fac','techlab','pgen','mex','geo','airfield','rail','uplink','turret','bunker','bastion','aatower','minelaser','missilebastion','hellstorm','arc','sgen','plasma','wall','gate','seafort','stormcaller','nest','harbor','tgate','silo','fab','nova'])
  if(BLD_MDL_MACHINE[k]) BLD_MDL_MACHINE[k]=synMachineStructureFactory(BLD_MDL_MACHINE[k],k);
var BLD_TUR_MDL_MACHINE={
  turret:mdlMacPhaseTur, bunker:mdlMacPulseTur, aatower:mdlMacAATur,
  hellstorm:mdlMacSpinBeamTur, rail:mdlMacVoidTur, nova:mdlMacSingularityTur,
  minelaser:mdlMacMiningTur, missilebastion:mdlMacSwarmTur, plasma:mdlMacPlasmaTur,
  bastion:mdlMacGravityTur, gravitywell:mdlMacGravityTur,
  spinbeam:mdlMacSpinBeamTur, phasedisruptor:mdlMacPhaseTur,
  voidlance:mdlMacVoidTur, swarmfabricator:mdlMacSwarmTur,
  pulsearray:mdlMacPulseTur, singularitycore:mdlMacSingularityTur, seafort:mdlMacSeafortTur, stormcaller:mdlMacStormTur,
};
for(const k of ['turret','bunker','bastion','aatower','minelaser','rail','hellstorm','nova','missilebastion','plasma','seafort','stormcaller'])
  if(BLD_TUR_MDL_MACHINE[k]) BLD_TUR_MDL_MACHINE[k]=synMachineStructureFactory(BLD_TUR_MDL_MACHINE[k],k==='nova'?'hellstorm':k);
var BLD_TUR_H_MACHINE={
  turret:19.1,bunker:18.6,aatower:18.8,hellstorm:18.8,rail:20.0,nova:18.8,
  minelaser:18.8,missilebastion:19.6,plasma:19.0,
  bastion:19.5,gravitywell:19.5,
  spinbeam:18.8,phasedisruptor:19.1,voidlance:20.0,
  swarmfabricator:19.6,pulsearray:18.6,singularitycore:18.8,
  seafort:17.0,stormcaller:23.2,
};
var BLD_TUR_S_MACHINE={
  turret:1.08,bunker:1.04,aatower:1.04,hellstorm:1.06,rail:1.08,nova:1.06,
  minelaser:1.02,missilebastion:1.04,plasma:1.04,
  /* T3's energized ring stays large, but its complete rotating radius must fit
     the 44-unit plot already reserved by existing saves and build previews. */
  bastion:.86,gravitywell:.86,
  spinbeam:1.06,phasedisruptor:1.08,voidlance:1.08,
  swarmfabricator:1.04,pulsearray:1.04,singularitycore:1.06,
  seafort:1.06,stormcaller:1.04,
};
var BLD_TIER_MDL_MACHINE={
  gravitywell:[1,2,3].map(t=>({base:()=>mdlMacGravityBase(t),tur:()=>mdlMacGravityTur(t)})),
  spinbeam:[1,2,3].map(t=>({base:()=>mdlMacSpinBeamBase(t),tur:()=>mdlMacSpinBeamTur(t)})),
  phasedisruptor:[1,2,3].map(t=>({base:()=>mdlMacPhaseBase(t),tur:()=>mdlMacPhaseTur(t)})),
  voidlance:[1,2,3].map(t=>({base:()=>mdlMacVoidBase(t),tur:()=>mdlMacVoidTur(t)})),
  swarmfabricator:[1,2,3].map(t=>({base:()=>mdlMacSwarmBase(t),tur:()=>mdlMacSwarmTur(t)})),
  energyvortex:[1,2,3].map(t=>({base:()=>mdlMacEnergyVortex(t)})),
  pulsearray:[1,2,3].map(t=>({base:()=>mdlMacPulseBase(t),tur:()=>mdlMacPulseTur(t)})),
  singularitycore:[1,2,3].map(t=>({base:()=>mdlMacSingularityBase(t),tur:()=>mdlMacSingularityTur(t)})),
  aatower:[1,2,3].map(t=>({base:()=>mdlMacAABase(t),tur:()=>mdlMacAATur(t)})),
  minelaser:[1,2,3].map(t=>({base:()=>mdlMacMiningBase(t),tur:()=>mdlMacMiningTur(t)})),
  plasma:[1,2,3].map(t=>({base:()=>mdlMacPlasmaBase(t),tur:()=>mdlMacPlasmaTur(t)})),
  seafort:[1,2,3].map(t=>({base:()=>mdlMacSeafortBase(t),tur:()=>mdlMacSeafortTur(t)})),
  stormcaller:[1,2,3].map(t=>({base:()=>mdlMacStormBase(t),tur:()=>mdlMacStormTur(t)})),
};
/* Runtime type aliases keep the simulation/save vocabulary stable while the
   visible Mk1/Mk2/Mk3 geometry follows the Machine contact-sheet archetype. */
for(const pair of [
  ['turret','phasedisruptor'],['bunker','pulsearray'],['bastion','gravitywell'],
  ['hellstorm','spinbeam'],['arc','energyvortex'],
  ['rail','voidlance'],['nova','singularitycore'],
  ['missilebastion','swarmfabricator']
]) BLD_TIER_MDL_MACHINE[pair[0]]=BLD_TIER_MDL_MACHINE[pair[1]];
for(const k in BLD_TIER_MDL_MACHINE){
  const pk=k==='phasedisruptor'?'turret':k==='pulsearray'?'bunker':k==='gravitywell'?'bastion':k==='spinbeam'?'hellstorm':k==='energyvortex'?'arc':k==='voidlance'?'rail':k==='singularitycore'?'hellstorm':k==='swarmfabricator'?'missilebastion':k;
  if(SYN_MACHINE_STRUCTURE_PACKS[pk]){
    BLD_TIER_MDL_MACHINE[k]=BLD_TIER_MDL_MACHINE[k].map(V=>({
      base:synMachineStructureFactory(V.base,pk),
      tur:V.tur?synMachineStructureFactory(V.tur,pk):null
    }));
  }
}

