/* Concatenator leftover `;;` lived here; do not restore it. */
/* ============================================================================
   INFESTATION SWARM - PROCEDURAL STRUCTURE LIBRARY
   ----------------------------------------------------------------------------
   Load after engine/models.js. These are complete one-piece organic buildings,
   not skins over Terran bases. Their silhouette vocabulary is rooted creep,
   asymmetrical chitin, wet tissue, egg sacs, bone tools and genuinely hollow
   mouths. Low radial segment counts keep the full faction practical on phones.

   This module intentionally has no runtime takeover. Integration can choose
   BLD_MDL_INFESTATION without making this optional art package own faction or
   renderer policy. Keeping every helper inside the closure also protects the
   game's single classic-script global scope from another name collision.
   ============================================================================ */
var BLD_MDL_INFESTATION, BLD_TUR_MDL_INFESTATION,
    BLD_TIER_MDL_INFESTATION, BLD_TUR_H_INFESTATION, BLD_TUR_S_INFESTATION;
/* Ichor RGB — same wet green as INF_MUCUS / INF_SAC / INF_GLOW inside the
   IIFE. organicfx.js prefers this for caste-0 infestation so a nest and a
   Ravager bleed the same substance the sac tiles are painted with. */
var INF_ICHOR=Object.freeze({
  wet:[115,177,77], dark:[62,88,30], hi:[185,255,72]
});

(function(){
  /* Existing atlas cells are deliberately zoned by biological function. Using
     one CHITIN tile for everything recreated the noisy single-material look
     this faction pass is meant to replace. */
  const INF_CHITIN=C(118,78,58), INF_CHITIN_H=C(166,116,76);
  const INF_FLESH=C(119,56,68), INF_FLESH_H=C(174,84,91);
  const INF_SAC=C(126,151,65), INF_MUCUS=C(115,177,77);
  const INF_GLOW=C(185,255,72), INF_GLOW_H=C(226,255,151);
  const INF_ROOT=C(58,43,34), INF_BONE=C(219,198,151);
  const INF_SILK=C(191,184,169), INF_BORE=C(12,8,10);

  COL_MAT.set(INF_CHITIN,MAT.CHITIN); COL_MAT.set(INF_CHITIN_H,MAT.CHITIN);
  COL_MAT.set(INF_FLESH,MAT.RUST);    COL_MAT.set(INF_FLESH_H,MAT.LEAF);
  COL_MAT.set(INF_SAC,MAT.GLASS);     COL_MAT.set(INF_MUCUS,MAT.CRYST);
  /* TWR_GLOW's atlas tile is Nova cyan (#78b6c4). Brood lumen painted through
     that id read as Frontline energy on every hive, nest and glow node. Slime
     keeps the wet-green emissive the ichor VFX already uses. */
  COL_MAT.set(INF_GLOW,MAT.BROOD_SLIME);COL_MAT.set(INF_GLOW_H,MAT.BROOD_SLIME);
  COL_MAT.set(INF_ROOT,MAT.EARTH);    COL_MAT.set(INF_BONE,MAT.STONE);
  COL_MAT.set(INF_SILK,MAT.TRIM);     COL_MAT.set(INF_BORE,MAT.TWR_BORE);

  function infRand(seed){
    let s=(seed|0)||1;
    return function(){ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
  }
  function infMix(a,b,t){ return a+(b-a)*t; }
  function infPoint(a,b,t){ return [infMix(a[0],b[0],t),infMix(a[1],b[1],t),infMix(a[2],b[2],t)]; }

  /* Rotate a temporary +Y primitive onto the line a->b. Positions and normals
     use the same orthonormal frame; UV and material data remain untouched. */
  function infMergeAlong(m,mm,a,b){
    let dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
    const len=Math.hypot(dx,dy,dz)||1; dx/=len;dy/=len;dz/=len;
    const rx=Math.abs(dy)>.92?0:0, ry=Math.abs(dy)>.92?0:1, rz=Math.abs(dy)>.92?1:0;
    let ux=ry*dz-rz*dy,uy=rz*dx-rx*dz,uz=rx*dy-ry*dx;
    const ul=Math.hypot(ux,uy,uz)||1;ux/=ul;uy/=ul;uz/=ul;
    const wx=uy*dz-uz*dy,wy=uz*dx-ux*dz,wz=ux*dy-uy*dx;
    for(let i=0;i<mm.v.length;i+=VFLOATS){
      const px=mm.v[i],py=mm.v[i+1],pz=mm.v[i+2];
      mm.v[i]=a[0]+ux*px+dx*py+wx*pz;
      mm.v[i+1]=a[1]+uy*px+dy*py+wy*pz;
      mm.v[i+2]=a[2]+uz*px+dz*py+wz*pz;
      const nx=mm.v[i+3],ny=mm.v[i+4],nz=mm.v[i+5];
      mm.v[i+3]=ux*nx+dx*ny+wx*nz;
      mm.v[i+4]=uy*nx+dy*ny+wy*nz;
      mm.v[i+5]=uz*nx+dz*ny+wz*nz;
    }
    const off=m.n;
    for(const value of mm.v)m.v.push(value);
    for(const index of mm.i)m.i.push(index+off);
    m.n+=mm.n; m.m=mm.m; m.tm=mm.tm;
    return m;
  }
  function infLimb(m,a,b,r1,r2,col,seg,cap){
    const len=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const mm=MB(); mm.m=m.m;mm.tm=m.tm;
    mm.cyl(0,0,0,r1,r2,len,seg||7,col,cap);
    return infMergeAlong(m,mm,a,b);
  }
  function infTube(m,a,b,rOut,rIn,col,seg){
    const len=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const mm=MB(); mm.m=m.m;mm.tm=m.tm;
    mm.tube(0,0,0,rOut,rIn,len,seg||8,col);
    return infMergeAlong(m,mm,a,b);
  }
  function infOpenLimb(m,a,b,r1,r2,seg){
    const q=infPoint(a,b,.76);
    infLimb(m,a,q,r1,r2*1.08,INF_CHITIN_H,seg||8,false);
    infTube(m,q,b,r2*1.14,r2*.53,INF_BORE,seg||8);
    return m;
  }
  function infSpike(m,a,b,r,heavy){
    infLimb(m,a,b,r,heavy?r*.10:0,heavy?INF_CHITIN_H:INF_BONE,6,true);
    return m;
  }
  function infBulb(m,x,y,z,r,col,squash){
    const sy=squash===undefined?.78:squash;
    m.sphere(x,y+r*sy,z,r,6,col||INF_SAC,sy,false);
    return m;
  }
  function infGlowNode(m,x,y,z,r){
    m.sphere(x,y+r,z,r,6,INF_GLOW,.82,false);
    m.ring(x,y+r*.95,z,r*1.08,r*1.34,10,INF_GLOW_H);
    return m;
  }
  function infRoots(m,r,count,seed,tier){
    const rr=infRand(seed), t=tier||1;
    m.cyl(0,0,0,r*.66,r*.78,2.2,10,INF_ROOT);
    m.cyl(0,2.2,0,r*.58,r*.49,2.4,10,INF_FLESH);
    for(let i=0;i<count;i++){
      const a=i/count*TAU+(rr()-.5)*.22;
      const reach=r*(.78+rr()*.35), bend=a+(rr()-.5)*.34;
      const p0=[Math.cos(a)*r*.24,2.8,Math.sin(a)*r*.24];
      const p1=[Math.cos(bend)*reach*.58,1.25+rr()*.55,Math.sin(bend)*reach*.58];
      const p2=[Math.cos(a)*reach,.28,Math.sin(a)*reach];
      infLimb(m,p0,p1,r*(.12+rr()*.025),r*.085,INF_ROOT,7,true);
      infLimb(m,p1,p2,r*.088,r*.026,INF_ROOT,6,true);
      if(t>1&&i%2===0){
        const s=a+(i%4<2?.34:-.34),p3=[Math.cos(s)*reach*.88,.22,Math.sin(s)*reach*.88];
        infLimb(m,p1,p3,r*.052,r*.012,INF_FLESH,6,true);
      }
    }
    const lobes=3+Math.min(t,2);
    for(let i=0;i<lobes;i++){
      const a=(i/lobes)*TAU+.35,rad=r*(.44+(i%2)*.08),sz=r*(.17+(i%3)*.012);
      m.sphere(Math.cos(a)*rad,3.4+sz*.44,Math.sin(a)*rad,sz,5,i%2?INF_CHITIN:INF_FLESH_H,.46,false);
    }
    m.ring(0,4.72,0,r*.25,r*.43,18,INF_GLOW);
    return m;
  }
  function infMound(m,x,y,z,r,seed,tier){
    const rr=infRand(seed),t=tier||1;
    m.sphere(x,y+r*.52,z,r,7,INF_FLESH,.52,false);
    const lobes=3+t;
    for(let i=0;i<lobes;i++){
      const a=i/lobes*TAU+rr()*.4,rad=r*(.54+rr()*.15),sz=r*(.25+rr()*.08);
      m.sphere(x+Math.cos(a)*rad,y+sz*.46,z+Math.sin(a)*rad,sz,5,i%3?INF_CHITIN:INF_FLESH_H,.46,false);
    }
    const sacs=1+t;
    for(let i=0;i<sacs;i++){
      const a=(i+.5)/sacs*TAU+seed*.13,rad=r*.55,sz=r*(.15+i*.012);
      infBulb(m,x+Math.cos(a)*rad,y+r*.48,z+Math.sin(a)*rad,sz,i%2?INF_SAC:INF_MUCUS,.86);
    }
    return m;
  }
  function infTrunk(m,x,y,z,r,h,seed,tier){
    const t=tier||1,rr=infRand(seed);
    m.cyl(x,y,z,r,r*.78,h*.42,9,INF_FLESH);
    m.cyl(x,y+h*.39,z,r*.82,r*.55,h*.36,9,INF_CHITIN);
    m.cyl(x,y+h*.72,z,r*.57,r*.36,h*.28,8,INF_FLESH_H);
    const plates=2+t;
    for(let i=0;i<plates;i++){
      const a=i/plates*TAU+rr()*.2,py=y+h*(.22+i/plates*.58),rad=r*(.68-i/plates*.22);
      m.sphere(x+Math.cos(a)*rad,py,z+Math.sin(a)*rad,r*(.28+rr()*.05),5,INF_CHITIN_H,.34,false);
    }
    for(let i=0;i<t;i++){
      const a=(i+.5)/t*TAU+seed*.1;
      infGlowNode(m,x+Math.cos(a)*r*.50,y+h*(.40+i*.13),z+Math.sin(a)*r*.50,r*.16);
    }
    return m;
  }
  function infCrownSpikes(m,x,y,z,r,n,h,seed){
    const rr=infRand(seed);
    for(let i=0;i<n;i++){
      const a=i/n*TAU+(rr()-.5)*.18,inner=[x+Math.cos(a)*r*.35,y,z+Math.sin(a)*r*.35];
      const outer=[x+Math.cos(a)*r*(.82+rr()*.25),y+h*(.78+rr()*.22),z+Math.sin(a)*r*(.82+rr()*.25)];
      infSpike(m,inner,outer,r*(.10+rr()*.025),i%3===0);
    }
    return m;
  }

  /* ---- explicit contact-sheet defenses -------------------------------- */
  function mdlInfSpineSpiker(tier){
    const t=tier||1,m=MB(),r=17+t*2;
    infRoots(m,r,7+t,101+t,t); infMound(m,0,4.6,0,r*.58,111+t,t);
    infTrunk(m,-2,5,0,6.8+t,12+t*2,117+t,t);
    const mouthA=[0,13+t*1.6,0],mouthB=[11+t*2,20+t*2,0];
    infOpenLimb(m,mouthA,mouthB,4.1+t*.35,2.2+t*.18,9);
    for(let i=0;i<4+t*2;i++){
      const a=i/(4+t*2)*TAU,base=[Math.cos(a)*8,7,Math.sin(a)*8];
      infSpike(m,base,[Math.cos(a)*(16+t*2),16+(i%2)*4+t,Math.sin(a)*(16+t*2)],1.8+t*.12,i%2===0);
    }
    infGlowNode(m,-4,13+t,0,2.0+t*.15);
    return m.build();
  }
  function mdlInfToxicGusher(tier){
    const t=tier||1,m=MB(),r=18+t*2;
    infRoots(m,r,8,201+t,t); infMound(m,0,4.6,0,r*.63,211+t,t);
    infTrunk(m,0,5,0,7.4+t,15+t*2,217+t,t);
    infOpenLimb(m,[0,15,0],[2,29+t*3,0],4.6+t*.4,3.0+t*.2,10);
    for(let i=0;i<3+t;i++){
      const a=i/(3+t)*TAU+.5,rad=8+t,sz=2.5+t*.25;
      infBulb(m,Math.cos(a)*rad,11+i*.8,Math.sin(a)*rad,sz,i%2?INF_SAC:INF_MUCUS,.92);
      infGlowNode(m,Math.cos(a)*rad,8+i*.8,Math.sin(a)*rad,sz*.35);
    }
    infCrownSpikes(m,0,21+t,0,8,4+t,8+t,221+t);
    return m.build();
  }
  function mdlInfSporeLauncher(tier){
    const t=tier||1,m=MB(),r=19+t*2;
    infRoots(m,r,8+t,301+t,t); infMound(m,-2,4.6,0,r*.65,311+t,t);
    const tubes=2+t;
    for(let i=0;i<tubes;i++){
      const z=(i-(tubes-1)/2)*6.4,a=[-4,10,z],b=[11+t*2,23+(i%2)*4+t*2,z*1.12];
      infOpenLimb(m,a,b,4.3+t*.25,2.25+t*.16,9);
      infBulb(m,-6,9,z,3.2+t*.2,i%2?INF_SAC:INF_FLESH_H,.88);
    }
    infCrownSpikes(m,-7,10,0,10,4+t,10+t,321+t);
    infGlowNode(m,-6,13,0,2.2+t*.2);
    return m.build();
  }
  function mdlInfSilkTrap(tier){
    const t=tier||1,m=MB(),r=20+t*2;
    infRoots(m,r,9+t,401+t,t); infMound(m,0,4.5,0,r*.56,411+t,t);
    m.tube(0,6.5,0,7.2+t,3.6+t*.4,2.6+t*.4,12,INF_BORE);
    m.ring(0,9.25+t*.4,0,4.0+t*.4,7.6+t,20,INF_SILK);
    const n=6+t;
    for(let i=0;i<n;i++){
      const a=i/n*TAU,p0=[Math.cos(a)*r*.72,4,Math.sin(a)*r*.72];
      const p1=[Math.cos(a)*r*.48,13+t*1.8,Math.sin(a)*r*.48];
      const p2=[Math.cos(a)*r*.18,9+t,Math.sin(a)*r*.18];
      infLimb(m,p0,p1,1.15+t*.08,.52,INF_CHITIN,6,true);
      infLimb(m,p1,p2,.55,.16,INF_SILK,6,true);
    }
    infGlowNode(m,0,5.1,0,2.2+t*.25);
    return m.build();
  }
  function mdlInfAcidGeyser(tier){
    const t=tier||1,m=MB(),r=18+t*2;
    infRoots(m,r,8,501+t,t); infMound(m,0,4.6,0,r*.62,511+t,t);
    m.cyl(0,7.0,0,8+t,6+t*.7,5+t,10,INF_CHITIN,false);
    m.tube(0,11+t,0,6.3+t*.7,3.1+t*.38,3.2+t*.4,12,INF_BORE);
    for(let i=0;i<6+t;i++){
      const a=i/(6+t)*TAU,base=[Math.cos(a)*(8+t),7,Math.sin(a)*(8+t)];
      infSpike(m,base,[Math.cos(a)*(13+t*1.4),16+(i%3)*2+t,Math.sin(a)*(13+t*1.4)],1.35+t*.08,false);
    }
    for(let i=0;i<3+t;i++){
      const a=(i+.5)/(3+t)*TAU;infBulb(m,Math.cos(a)*9,7,Math.sin(a)*9,2.4+t*.2,INF_MUCUS,.8);
    }
    infGlowNode(m,0,9.4+t,0,2.4+t*.2);
    return m.build();
  }
  function mdlInfThornNest(tier){
    const t=tier||1,m=MB(),r=21+t*2;
    infRoots(m,r,10,601+t,t); infMound(m,-1,4.6,0,r*.69,611+t,t);
    const n=7+t*2;
    for(let i=0;i<n;i++){
      const a=i/n*TAU,p0=[Math.cos(a)*r*.52,7,Math.sin(a)*r*.52];
      const p1=[Math.cos(a)*r*(.86+(i%2)*.12),15+(i%3)*3+t,Math.sin(a)*r*(.86+(i%2)*.12)];
      infSpike(m,p0,p1,1.45+t*.10,i%2===0);
    }
    for(let i=0;i<2+t;i++){
      const a=i/(2+t)*TAU+.4;infBulb(m,Math.cos(a)*5,7,Math.sin(a)*5,3.0+t*.2,INF_SAC,.96);
    }
    infOpenLimb(m,[-5,8,0],[9+t,12+t,0],3.5+t*.25,2.1+t*.15,9);
    infGlowNode(m,-2,8.5,0,2.0+t*.18);
    return m.build();
  }
  function mdlInfSonicShrieker(tier){
    const t=tier||1,m=MB(),r=17+t*2;
    infRoots(m,r,7+t,701+t,t); infMound(m,0,4.6,0,r*.55,711+t,t);
    infTrunk(m,0,5,0,6.3+t*.5,23+t*3,717+t,t);
    infOpenLimb(m,[0,24+t*2,0],[10+t*2,33+t*3,0],5.1+t*.35,3.7+t*.25,11);
    for(let i=0;i<4+t;i++){
      const a=i/(4+t)*TAU,p0=[Math.cos(a)*5,19+t,Math.sin(a)*5];
      infSpike(m,p0,[Math.cos(a)*(10+t),29+t*2,Math.sin(a)*(10+t)],1.1+t*.08,false);
    }
    for(let y=12;y<23+t*2;y+=5)m.ring(0,y,0,4.2+(y-12)*.08,5.2+(y-12)*.08,16,INF_SILK);
    infGlowNode(m,-3,22+t,0,2.0+t*.2);
    return m.build();
  }
  function mdlInfBroodSpire(tier){
    const t=tier||1,m=MB(),r=28+t*4;
    infRoots(m,r,10+t*2,801+t,t); infMound(m,0,4.6,0,r*.62,811+t,t);
    infTrunk(m,-2,6,0,10+t,29+t*5,817+t,t);
    infTrunk(m,5,9,-3,6+t*.5,20+t*3,823+t,t);
    const sacs=4+t*2;
    for(let i=0;i<sacs;i++){
      const a=i/sacs*TAU+.25,rad=10+(i%2)*4,py=12+(i%3)*7;
      infBulb(m,Math.cos(a)*rad,py,Math.sin(a)*rad,3.4+t*.32,i%2?INF_SAC:INF_FLESH_H,.94);
    }
    infOpenLimb(m,[-1,31+t*3,0],[12+t*2,42+t*5,0],5.0+t*.4,3.0+t*.25,10);
    infCrownSpikes(m,-2,34+t*4,0,12+t,6+t*2,17+t*2,831+t);
    for(let i=0;i<t+1;i++)infGlowNode(m,-4+i*5,22+i*7,-2+i%2*4,2.2+t*.18);
    return m.build();
  }

  /* ---- economy, production and support -------------------------------- */
  function mdlInfMex(){
    const m=MB(); infRoots(m,19,8,901,1);infMound(m,-2,4.6,0,11,907,1);
    for(let i=0;i<3;i++){
      const a=(i-1)*.72;infOpenLimb(m,[-4,8,Math.sin(a)*5],[10+Math.cos(a)*5,12+i*3,Math.sin(a)*13],3.1,1.45,8);
    }
    infGlowNode(m,-5,9,0,2.1);infBulb(m,-8,6,-6,3.0,INF_SAC,.82);
    return m.build();
  }
  function mdlInfPgen(){
    const m=MB();infRoots(m,20,8,921,1);infMound(m,0,4.6,0,11.5,927,1);
    for(let i=0;i<3;i++){
      const a=i*TAU/3,x=Math.cos(a)*8,z=Math.sin(a)*8;
      infBulb(m,x,8,z,4.4,i===0?INF_MUCUS:INF_SAC,1.22);
      infSpike(m,[x,10,z],[x*1.35,21+(i%2)*3,z*1.35],1.25,false);
    }
    m.tube(0,8,0,4.0,2.1,3,10,INF_BORE);infGlowNode(m,0,12,0,2.8);
    return m.build();
  }
  function mdlInfFactory(){
    /* Compact BIRTH-MAW. Factory / harbor / airfield used to be the same
       recipe — roots, two mounds, one open limb on +X — so at tactical zoom
       they were three cousins. Production has to read as a fat hive with a
       dark mouth, not a dock and not a runway. The slit is a real tube; a
       painted recess disappears under baked lighting. */
    const m=MB();
    m.cyl(0,0,0,18,16,3.2,10,INF_ROOT);
    m.sphere(-4,11,0,16,8,INF_FLESH,.72,false);
    m.sphere(-6,16,0,11,7,INF_CHITIN,.78,false);
    m.cyl(2,7,0,10,8.2,12,10,INF_CHITIN_H,false);
    m.tube(10,12,0,6.4,3.1,8.5,11,INF_BORE);
    m.ring(18.2,12,0,3.2,5.4,14,INF_GLOW);
    for(const s of [-1,1]){
      infBulb(m,-12,8,s*14,5.2,s>0?INF_SAC:INF_FLESH_H,.95);
      infBulb(m,-2,10,s*16,4.0,INF_MUCUS,.82);
      infLimb(m,[-8,14,s*10],[-2,22,s*15],2.4,.7,INF_CHITIN,7,true);
    }
    infGlowNode(m,-6,20,0,2.4);
    return m.build();
  }
  function mdlInfShield(){
    const m=MB();infRoots(m,22,9,961,2);infMound(m,0,4.6,0,12,967,1);
    infBulb(m,0,12,0,7.5,INF_MUCUS,1.12);m.ring(0,19.8,0,7.5,10.5,24,INF_GLOW);
    for(let i=0;i<6;i++){
      const a=i*TAU/6,p0=[Math.cos(a)*15,4,Math.sin(a)*15],p1=[Math.cos(a)*10,24,Math.sin(a)*10],p2=[0,31,0];
      infLimb(m,p0,p1,2.0,.8,INF_CHITIN,7,true);infLimb(m,p1,p2,.82,.18,INF_SILK,6,true);
    }
    infGlowNode(m,0,12,0,3.0);return m.build();
  }
  function mdlInfTransitGate(){
    const m=MB();infRoots(m,31,10,981,2);infMound(m,-18,4.6,0,11,987,1);infMound(m,18,4.6,0,11,991,1);
    const left=[[-19,7,0],[-21,25,0],[-10,41,0],[0,46,0]],right=[[19,7,0],[21,25,0],[10,41,0],[0,46,0]];
    for(const path of [left,right])for(let i=0;i<path.length-1;i++)infLimb(m,path[i],path[i+1],4.0-i*.55,3.4-i*.55,i%2?INF_FLESH_H:INF_CHITIN,8,true);
    ringX(m,.2,27,0,13,16,26,INF_GLOW);ringX(m,0,27,0,16.5,18.5,26,INF_SILK);
    for(const s of [-1,1])infGlowNode(m,s*16,12,0,2.5);return m.build();
  }
  function mdlInfHarbor(){
    /* Living U-SLIP. Nova's drydock taught the same lesson: the empty dark
       berth is the silhouette, not another mound with a limb glued on. Two
       chitin quays flank a recessed bore opening +X so a shipyard never
       reads as a factory maw or an airfield strip. */
    const m=MB();
    m.cyl(-8,0,0,16,14,2.6,10,INF_ROOT);
    m.box(6,0.6,0,40,1.4,16,INF_BORE);
    m.box(8,1.4,0,36,.55,10,INF_ROOT);
    infMound(m,-16,3.2,0,12,1007,1);
    infBulb(m,-18,8,0,5.0,INF_FLESH_H,.88);
    for(const s of [-1,1]){
      m.box(8,4.2,s*14,38,7.2,7.5,INF_CHITIN);
      m.box(8,8.0,s*14,34,1.1,5.2,INF_CHITIN_H);
      for(const x of [-6,6,18]){
        infLimb(m,[x,7.5,s*17],[x+2,13,s*20],1.6,.45,INF_BONE,6,true);
        infGlowNode(m,x,8.6,s*14,1.15);
      }
      infBulb(m,-10,6,s*16,3.4,INF_SAC,.74);
    }
    infGlowNode(m,-16,12,0,2.2);
    return m.build();
  }
  function mdlInfTech(){
    const m=MB();infRoots(m,23,9,1031,2);infMound(m,0,4.6,0,13,1037,2);infTrunk(m,0,6,0,7.5,19,1043,2);
    for(let i=0;i<5;i++){
      const a=i*TAU/5+.3;infBulb(m,Math.cos(a)*8,20+(i%2)*4,Math.sin(a)*8,3.4,i%2?INF_SAC:INF_FLESH_H,.86);
      infLimb(m,[0,17,0],[Math.cos(a)*8,22+(i%2)*4,Math.sin(a)*8],1.0,.35,INF_SILK,6,true);
    }
    infGlowNode(m,0,28,0,3.0);return m.build();
  }
  function mdlInfAirfield(){
    /* LONG RUNWAY. The cousin pass hid a +X open limb under wing-limbs, so
       this still read as a factory at forty pixels. The strip itself is the
       tell: a flat bone deck on +X, hangar mound only at the stern, two
       spore masts instead of another mouth. */
    const m=MB();
    m.cyl(-16,0,0,14,12,2.4,10,INF_ROOT);
    infMound(m,-18,3.8,0,13,1067,2);
    infTrunk(m,-18,6,0,6.2,11,1073,1);
    m.box(8,2.4,0,52,3.6,12,INF_BONE);
    m.box(8,4.4,0,50,.55,3.4,INF_SILK);
    for(const s of [-1,1]){
      m.box(8,4.5,s*8.4,48,.7,1.6,INF_GLOW);
      infLimb(m,[-16,8,s*6],[-14,18,s*8],1.8,.55,INF_CHITIN,7,true);
      infGlowNode(m,-14,19,s*8,1.6);
      for(let i=0;i<3;i++) infBulb(m,-6+i*12,3.4,s*12,2.6-i*.2,INF_SAC,.62);
    }
    infGlowNode(m,-18,16,0,2.1);
    return m.build();
  }
  function mdlInfArc(){
    const m=MB();infRoots(m,20,8,1081,2);infMound(m,0,4.6,0,11,1087,1);
    for(let i=0;i<5;i++){
      const a=i*TAU/5,p0=[Math.cos(a)*8,8,Math.sin(a)*8],p1=[Math.cos(a)*12,24+(i%2)*4,Math.sin(a)*12];
      infLimb(m,p0,p1,1.8,.35,i%2?INF_CHITIN_H:INF_BONE,7,true);infGlowNode(m,p1[0],p1[1]-1.2,p1[2],1.3);
    }
    infBulb(m,0,13,0,5.0,INF_MUCUS,1.0);infGlowNode(m,0,16,0,2.5);return m.build();
  }
  function mdlInfBoneLance(){
    const m=MB();infRoots(m,24,9,1101,2);infMound(m,-5,4.6,0,14,1107,2);infTrunk(m,-6,6,0,7,15,1113,2);
    infOpenLimb(m,[-3,18,0],[29,25,0],5.0,2.2,10);
    for(const s of [-1,1])infSpike(m,[-5,14,s*5],[18,23,s*9],1.5,true);
    for(let x=2;x<25;x+=6)ringX(m,x,22.5+(x+3)*.10,0,2.7,3.5,14,x>20?INF_GLOW:INF_BONE);
    infGlowNode(m,-7,18,0,2.3);return m.build();
  }
  function mdlInfWall(){
    const m=MB();
    for(let i=-3;i<=3;i++){
      const x=i*5.2,h=11+(i%2===0?5:0);
      infLimb(m,[x,0,-6],[x+(i%2)*2,h,0],2.5,1.25,i%2?INF_ROOT:INF_CHITIN,7,true);
      infSpike(m,[x,h*.55,0],[x,h+8,-(i%3-1)*4],1.1,false);
      if(i<3){
        infLimb(m,[x,5,0],[x+5.2,5.8,0],1.05,.82,INF_FLESH,6,true);
        infLimb(m,[x,h*.55,0],[x+5.2,9,0],.75,.48,INF_SILK,6,true);
      }
    }
    m.box(0,0,0,35,2.2,14,INF_ROOT);m.ring(0,2.3,0,8,15,18,INF_GLOW);return m.build();
  }
  function mdlInfProboscis(){
    const m=MB();infRoots(m,20,8,1141,2);infMound(m,-4,4.6,0,12,1147,1);
    infOpenLimb(m,[-5,12,0],[27,17,0],4.2,1.55,9);
    for(let i=0;i<4;i++){
      const x=2+i*6;ringX(m,x,13.1+x*.15,0,1.9-i*.08,2.7-i*.08,14,i===3?INF_GLOW:INF_CHITIN_H);
    }
    for(const s of [-1,1])infSpike(m,[-3,9,s*5],[10,17,s*8],1.1,false);
    infGlowNode(m,-6,13,0,2.2);return m.build();
  }
  function mdlInfPlasma(){
    const m=MB();infRoots(m,21,9,1161,2);infMound(m,0,4.6,0,12,1167,2);
    for(let i=0;i<5;i++){
      const a=i*TAU/5,rad=8+(i%2)*2;infBulb(m,Math.cos(a)*rad,9+(i%2)*3,Math.sin(a)*rad,3.4,INF_MUCUS,.95);
      infLimb(m,[0,9,0],[Math.cos(a)*rad,11+(i%2)*3,Math.sin(a)*rad],1.0,.42,INF_FLESH_H,6,true);
    }
    m.tube(0,11,0,5.0,2.5,3.5,12,INF_BORE);infGlowNode(m,0,14,0,3.3);
    infCrownSpikes(m,0,10,0,9,5,12,1171);return m.build();
  }
  function mdlInfGate(){
    const m=MB();m.box(0,0,0,43,2.2,17,INF_ROOT);
    for(const s of [-1,1]){
      infMound(m,s*16,2.2,0,9,1191+s,1);
      infLimb(m,[s*16,5,0],[s*18,23,0],4.3,2.8,INF_CHITIN,8,true);
      infLimb(m,[s*18,23,0],[0,33,0],2.9,.65,INF_BONE,7,true);
      infGlowNode(m,s*16,12,0,1.8);
    }
    ringX(m,.1,20,0,8.5,10.3,22,INF_SILK);return m.build();
  }
  function mdlInfGeo(){
    const m=MB();infRoots(m,23,9,1211,2);infMound(m,0,4.6,0,13,1217,2);
    const cells=[[-7,-5],[7,-5],[-7,6],[7,6]];
    for(let i=0;i<cells.length;i++){
      const p=cells[i],h=12+i*2;
      m.cyl(p[0],7,p[1],3.8,2.6,h,8,i%2?INF_FLESH_H:INF_CHITIN,false);
      m.tube(p[0],7+h,p[1],2.75,1.25,2.1,9,INF_BORE);
      infGlowNode(m,p[0],8+i,p[1],1.2);
    }
    infBulb(m,0,13,0,4.2,INF_MUCUS,1.15);return m.build();
  }
  function mdlInfSilo(){
    const m=MB();infRoots(m,24,9,1231,2);infMound(m,0,4.6,0,13,1237,2);
    for(let i=0;i<5;i++){
      const a=i*TAU/5,rad=9+(i%2)*2,r=4.0+(i%2)*.7;
      infBulb(m,Math.cos(a)*rad,8,Math.sin(a)*rad,r,i%2?INF_SAC:INF_FLESH_H,1.65);
      m.ring(Math.cos(a)*rad,8+r*1.55,Math.sin(a)*rad,r*.35,r*.72,12,INF_GLOW);
    }
    m.tube(0,10,0,4.2,2.1,3,10,INF_BORE);infGlowNode(m,0,13,0,2.5);return m.build();
  }
  function mdlInfFab(){
    const m=MB();infRoots(m,27,10,1251,2);infMound(m,-4,4.6,0,16,1257,2);infTrunk(m,-5,6,0,8,17,1263,2);
    for(let i=0;i<6;i++){
      const a=i*TAU/6,x=Math.cos(a)*12,z=Math.sin(a)*12;
      infBulb(m,x,8+(i%2)*4,z,3.2,i%2?INF_SAC:INF_MUCUS,.88);
      infOpenLimb(m,[x*.55,11,z*.55],[x*1.18,13+(i%2)*3,z*1.18],2.1,1.0,7);
    }
    infGlowNode(m,-5,21,0,2.7);infCrownSpikes(m,-5,18,0,8,5,9,1267);return m.build();
  }

  /* ---- tracking weapon assemblies ---------------------------------------
     Organic weapons used to be grown as one rigid mesh. Their projectiles
     tracked correctly, but the visible proboscis kept staring east. These
     sockets leave roots and circulatory tissue in the base while V.tur owns
     the mouth, so yawing never spins the whole creep mound. All bores remain
     real tubes; a dark cap would turn flat again under mobile baked lighting. */
  function infAimSocket(m,y,r,tier){
    const t=tier||1;
    m.cyl(0,y-3,0,r*1.18,r,3.0,9,INF_FLESH);
    m.cyl(0,y,0,r,r*.88,1.2,9,INF_CHITIN);
    m.ring(0,y+1.25,0,r*.56,r*.92,14,INF_GLOW);
    for(let i=0;i<Math.min(3,t);i++){
      const a=i*TAU/Math.min(3,t)+.4,x=Math.cos(a)*r*.88,z=Math.sin(a)*r*.88;
      infBulb(m,x,y-2.4,z,r*.26,i%2?INF_SAC:INF_FLESH_H,.72);
    }
    return m;
  }
  function infTurJoint(m,r,tier){
    const t=tier||1;
    m.cyl(0,0,0,r*.92,r*.82,1.4,9,INF_CHITIN);
    m.sphere(-r*.18,2.0,0,r,7,INF_FLESH_H,.62,false);
    m.ring(0,1.45,0,r*.48,r*.84,14,INF_GLOW);
    if(t>1) for(const s of [-1,1]) infSpike(m,[-r*.3,2,s*r*.55],[-r*.9,6+t,s*r*.95],r*.18,false);
    return m;
  }
  function mdlInfSpineBase(tier){
    const t=tier||1,m=MB(),r=17+t*2;
    infRoots(m,r,7+t,1401+t,t);infMound(m,-2,4.6,0,r*.58,1407+t,t);
    infTrunk(m,-2,5,0,6.2+t*.5,9,1413+t,t);infAimSocket(m,16,4.5+t*.25,t);
    for(let i=0;i<4+t;i++){
      const a=i/(4+t)*TAU,base=[Math.cos(a)*8,7,Math.sin(a)*8];
      infSpike(m,base,[Math.cos(a)*(14+t),13+(i%2)*3,Math.sin(a)*(14+t)],1.25+t*.08,i%2===0);
    }
    infGlowNode(m,-4,11,0,1.8+t*.12);return m.build();
  }
  function mdlInfSpineTur(tier){
    const t=tier||1,m=MB();infTurJoint(m,4.4+t*.25,t);
    infOpenLimb(m,[-1,2,0],[13+t*3,9+t*1.5,0],4.1+t*.35,2.2+t*.18,9);
    for(const s of [-1,1]) infSpike(m,[1,3,s*3.0],[11+t*2,10+t,s*(5+t*.4)],1.2+t*.10,true);
    infGlowNode(m,-3,3.8,0,1.8+t*.16);return m.build();
  }
  /* Concussion Mortar used to be the Sentinel spine family at a different
     label. Its new siege organ stores pressure in rear sacs, braces against
     recoil with bone outriggers, and raises one wide lobbed-fire throat. */
  function mdlInfMortarBase(tier){
    const t=tier||1,m=MB(),r=18+t*1.5;
    infRoots(m,r,8+t,1421+t,t);infMound(m,-3,4.6,0,r*.62,1427+t,t);
    infTrunk(m,-6,5,0,6.5+t*.45,10+t,1433+t,t);infAimSocket(m,16.0,4.8+t*.22,t);
    for(const s of [-1,1]){
      infBulb(m,-9,8.0,s*(6.2+t*.45),3.5+t*.28,s>0?INF_SAC:INF_MUCUS,.90);
      infLimb(m,[-7,7,s*4],[-13,2,s*(10+t)],1.45+t*.08,.45,INF_ROOT,7,true);
      infSpike(m,[-3,8,s*5],[6,13,s*(10+t*.45)],1.15+t*.07,true);
    }
    infGlowNode(m,-7,12,0,2.0+t*.12);return m.build();
  }
  function mdlInfMortarTur(tier){
    const t=tier||1,m=MB();infTurJoint(m,4.8+t*.22,t);
    infBulb(m,-5,3.0,0,4.0+t*.34,INF_SAC,.94);
    infOpenLimb(m,[-2,2,0],[11+t*2,13+t*1.8,0],5.1+t*.34,2.65+t*.19,10);
    for(const s of [-1,1]){
      infLimb(m,[-2,3,s*2.8],[7+t,8+t*.7,s*(5.8+t*.45)],1.25,.62,INF_FLESH_H,7,true);
      infSpike(m,[-4,4,s*3.5],[4+t,10+t,s*(8+t*.5)],1.0+t*.07,true);
    }
    infCrownSpikes(m,-4,4,0,4.6,3+t,6+t,1437+t);
    infGlowNode(m,-5,5,0,2.2+t*.14);return m.build();
  }
  function mdlInfThornBase(tier){
    const t=tier||1,m=MB(),r=20+t*2;
    infRoots(m,r,9+t,1441+t,t);infMound(m,-1,4.6,0,r*.67,1447+t,t);
    infTrunk(m,-3,5,0,5.8+t*.4,6.5,1453+t,t);infAimSocket(m,13,4.4+t*.22,t);
    const n=5+t;
    for(let i=0;i<n;i++){
      const a=i/n*TAU,p0=[Math.cos(a)*r*.52,7,Math.sin(a)*r*.52];
      infSpike(m,p0,[Math.cos(a)*r*.88,13+(i%3)*2,Math.sin(a)*r*.88],1.25+t*.08,i%2===0);
    }
    return m.build();
  }
  function mdlInfThornTur(tier){
    const t=tier||1,m=MB();infTurJoint(m,4.4+t*.22,t);
    infOpenLimb(m,[-1,2,0],[12+t*2,6+t,0],3.8+t*.28,2.0+t*.16,9);
    for(const s of [-1,1]) for(let i=0;i<t+1;i++)
      infSpike(m,[1+i*3,3,s*2.5],[9+i*3+t,8+i,s*(5+i)],.9+t*.08,false);
    infGlowNode(m,-2,3,0,1.7+t*.14);return m.build();
  }
  function mdlInfSporeBase(tier){
    const t=tier||1,m=MB(),r=19+t*2;
    infRoots(m,r,8+t,1481+t,t);infMound(m,-2,4.6,0,r*.65,1487+t,t);
    infTrunk(m,-3,5,0,6.4+t*.45,9.5,1493+t,t);infAimSocket(m,16.5,4.8+t*.22,t);
    for(let i=0;i<2+t;i++){
      const a=i/(2+t)*TAU+.3;infBulb(m,Math.cos(a)*8,8+(i%2)*2,Math.sin(a)*8,2.6+t*.18,i%2?INF_SAC:INF_FLESH_H,.88);
    }
    return m.build();
  }
  function mdlInfSporeTur(tier){
    const t=tier||1,m=MB();infTurJoint(m,4.8+t*.22,t);
    const tubes=2+t;
    for(let i=0;i<tubes;i++){
      const z=(i-(tubes-1)/2)*5.6,a=[-1,2,z*.38],b=[12+t*2,8+(i%2)*3+t,z];
      infOpenLimb(m,a,b,3.35+t*.22,1.75+t*.14,8);
      infBulb(m,-3,2,z*.55,2.4+t*.16,i%2?INF_SAC:INF_FLESH_H,.86);
    }
    infGlowNode(m,-3,3,0,1.9+t*.15);return m.build();
  }
  /* Missile Bastion is now a deliberate brood-launch organ rather than the
     Skyguard spore mouth. Clustered pressure eggs feed divergent open throats;
     bone fins make the battery readable even when its mucus colour is muted. */
  function mdlInfMissileBase(tier){
    const t=tier||1,m=MB(),r=17+t*1.4;
    infRoots(m,r,8+t,1501+t,t);infMound(m,-2,4.6,0,r*.64,1507+t,t);
    infTrunk(m,-5,5,0,6.0+t*.42,8+t,1513+t,t);infAimSocket(m,15.2,4.7+t*.22,t);
    const n=3+t;
    for(let i=0;i<n;i++){
      const a=i/n*TAU+.25,rad=8+t*.45;
      infBulb(m,Math.cos(a)*rad-2,7+(i&1)*1.2,Math.sin(a)*rad,2.7+t*.17,
        i&1?INF_SAC:INF_MUCUS,.91);
      if(!(i&1)) infSpike(m,[Math.cos(a)*rad*.65,8,Math.sin(a)*rad*.65],
        [Math.cos(a)*(rad+5),13+t,Math.sin(a)*(rad+5)],.9+t*.06,false);
    }
    return m.build();
  }
  function mdlInfMissileTur(tier){
    const t=tier||1,m=MB();infTurJoint(m,4.7+t*.22,t);
    const cells=2+t;
    for(let i=0;i<cells;i++){
      const z=(i-(cells-1)/2)*4.25,spread=(i-(cells-1)/2)*.62;
      infBulb(m,-4,2.2,z*.42,2.35+t*.13,i&1?INF_SAC:INF_MUCUS,.92);
      infOpenLimb(m,[-2,2,z*.38],[12+t*1.55,8+(i&1)*2+t, z+spread],3.05+t*.18,1.50+t*.10,8);
      infSpike(m,[-1,3,z*.48],[7+t,11+t*.65,z+(z<0?-3:3)],.74+t*.05,i===0||i===cells-1);
    }
    for(const s of [-1,1]) infSpike(m,[-5,3,s*3],[-1,10+t,s*(8+t*.4)],1.0+t*.06,true);
    infGlowNode(m,-4,4,0,2.0+t*.15);return m.build();
  }
  function mdlInfToxicBase(tier){
    const t=tier||1,m=MB(),r=18+t*2;
    infRoots(m,r,8,1521+t,t);infMound(m,0,4.6,0,r*.63,1527+t,t);
    infTrunk(m,-2,5,0,6.8+t*.45,10.5,1533+t,t);infAimSocket(m,17.5,4.8+t*.25,t);
    for(let i=0;i<3+t;i++){
      const a=i/(3+t)*TAU+.5;infBulb(m,Math.cos(a)*(8+t),8+i*.6,Math.sin(a)*(8+t),2.4+t*.2,i%2?INF_SAC:INF_MUCUS,.92);
    }
    return m.build();
  }
  function mdlInfToxicTur(tier){
    const t=tier||1,m=MB();infTurJoint(m,4.8+t*.25,t);
    infOpenLimb(m,[-1,2,0],[12+t*2,11+t*2,0],4.5+t*.35,2.8+t*.2,10);
    infCrownSpikes(m,-1,3,0,5.5,3+t,7+t,1541+t);
    infGlowNode(m,-3,4,0,1.9+t*.18);return m.build();
  }
  function mdlInfBoneBase(tier){
    const t=tier||1,m=MB(),r=22+t*2;
    infRoots(m,r,9,1561+t,t);infMound(m,-5,4.6,0,14+t,1567+t,t);
    infTrunk(m,-6,6,0,7+t*.3,9,1573+t,t);infAimSocket(m,17,5.0+t*.2,t);
    for(const s of [-1,1]) infSpike(m,[-6,9,s*6],[5,16,s*11],1.35,true);
    return m.build();
  }
  function mdlInfBoneTur(tier){
    const t=tier||1,m=MB();infTurJoint(m,5.0+t*.2,t);
    infOpenLimb(m,[-1,2,0],[27+t*4,8+t,0],5.0+t*.28,2.2+t*.16,10);
    for(const s of [-1,1]) infSpike(m,[-2,3,s*4.5],[20+t*3,7+t,s*(8+t)],1.35+t*.08,true);
    for(let x=4;x<24+t*3;x+=6) ringX(m,x,6.4+x*.06,0,2.7,3.5,14,x>19?INF_GLOW:INF_BONE);
    infGlowNode(m,-4,4,0,2.1+t*.12);return m.build();
  }
  function mdlInfAcidBase(tier){
    const t=tier||1,m=MB(),r=18+t*2;
    infRoots(m,r,8,1601+t,t);infMound(m,0,4.6,0,r*.64,1607+t,t);
    m.cyl(0,7,0,8+t,6+t*.7,3.2,10,INF_CHITIN,false);infAimSocket(m,11.2,5.3+t*.3,t);
    for(let i=0;i<3+t;i++){
      const a=(i+.5)/(3+t)*TAU;infBulb(m,Math.cos(a)*9,7,Math.sin(a)*9,2.4+t*.2,INF_MUCUS,.8);
    }
    return m.build();
  }
  function mdlInfAcidTur(tier){
    const t=tier||1,m=MB();infTurJoint(m,5.3+t*.3,t);
    infOpenLimb(m,[-1,2,0],[11+t*2,6+t,0],4.8+t*.35,2.6+t*.22,10);
    infBulb(m,-4,2,0,3.2+t*.25,INF_MUCUS,.94);
    for(const s of [-1,1]) infSpike(m,[0,3,s*3.4],[8+t,8+t,s*(6+t*.4)],1.0+t*.07,false);
    infGlowNode(m,-3,3,0,2.1+t*.16);return m.build();
  }
  function mdlInfProboscisBase(tier){
    const t=tier||1,m=MB(),r=19+t*1.5;
    infRoots(m,r,8,1641+t,t);infMound(m,-4,4.6,0,12+t*.6,1647+t,t);
    infTrunk(m,-5,5,0,5.8+t*.35,6.5,1653+t,t);infAimSocket(m,13,4.2+t*.22,t);
    return m.build();
  }
  function mdlInfProboscisTur(tier){
    const t=tier||1,m=MB();infTurJoint(m,4.2+t*.22,t);
    infOpenLimb(m,[-1,2,0],[25+t*3,6+t,0],4.2+t*.2,1.55+t*.12,9);
    for(let x=3;x<23+t*2;x+=6) ringX(m,x,4.6+x*.04,0,1.9,2.7,14,x>18?INF_GLOW:INF_CHITIN_H);
    for(const s of [-1,1]) infSpike(m,[-2,2,s*3.5],[10+t*2,7,s*(7+t*.4)],1.0,false);
    infGlowNode(m,-3,3,0,1.8+t*.14);return m.build();
  }
  function mdlInfPlasmaBase(tier){
    const t=tier||1,m=MB(),r=20+t*1.5;
    infRoots(m,r,9,1681+t,t);infMound(m,0,4.6,0,12+t*.6,1687+t,t);
    for(let i=0;i<4+t;i++){
      const a=i/(4+t)*TAU,rad=8+(i%2)*2;infBulb(m,Math.cos(a)*rad,8,Math.sin(a)*rad,2.8+t*.18,INF_MUCUS,.95);
      infLimb(m,[0,8,0],[Math.cos(a)*rad,10,Math.sin(a)*rad],.85,.34,INF_FLESH_H,6,true);
    }
    infAimSocket(m,12.5,5.0+t*.25,t);return m.build();
  }
  function mdlInfPlasmaTur(tier){
    const t=tier||1,m=MB();infTurJoint(m,5.0+t*.25,t);
    infBulb(m,-3,3,0,3.8+t*.3,INF_MUCUS,1.0);
    infOpenLimb(m,[0,2,0],[13+t*2,7+t,0],4.4+t*.25,2.5+t*.18,10);
    for(const s of [-1,1]) infSpike(m,[-2,3,s*3.6],[9+t,8+t,s*(6+t*.5)],1.0+t*.08,false);
    infGlowNode(m,-3,4,0,2.7+t*.2);return m.build();
  }
  function mdlInfSeafortBase(tier){
    const t=tier||1,m=MB(),r=18+t;
    infMound(m,0,2.2,0,r*.72,1601+t,t);
    infTrunk(m,-4,4,0,6.2+t*.3,8+t,1607+t,t);infAimSocket(m,14.8,4.6+t*.2,t);
    for(const s of [-1,1]){
      infOpenLimb(m,[-8,6,s*6],[16,8,s*(14+t)],4.2+t*.2,2.2,8);
      infBulb(m,-10,7,s*(8+t*.3),3.2+t*.2,s>0?INF_SAC:INF_MUCUS,.88);
    }
    infGlowNode(m,-6,11,0,2.1+t*.12);return m.build();
  }
  function mdlInfSeafortTur(tier){
    const t=tier||1,m=MB();infTurJoint(m,4.6+t*.2,t);
    infOpenLimb(m,[-1,2,0],[12+t*2,8+t,0],4.6+t*.28,2.4+t*.16,9);
    for(const s of [-1,1]) infOpenLimb(m,[0,4,s*2],[10+t,10+t,s*(4+t*.3)],2.6+t*.14,1.3,7);
    infGlowNode(m,-3,4,0,1.9+t*.14);return m.build();
  }
  function mdlInfStormBase(tier){
    const t=tier||1,m=MB(),r=17+t*1.2;
    infRoots(m,r,8+t,1621+t,t);infMound(m,-2,4.6,0,r*.62,1627+t,t);
    infTrunk(m,-5,5,0,6.0+t*.4,8+t,1633+t,t);infAimSocket(m,15.4,4.7+t*.2,t);
    for(let i=0;i<6;i++){
      const a=i/6*TAU;infBulb(m,Math.cos(a)*9,9+(i%2)*2,Math.sin(a)*9,2.8+t*.16,i%2?INF_SAC:INF_MUCUS,.9);
    }
    infGlowNode(m,0,16,0,2.6+t*.16);return m.build();
  }
  function mdlInfStormTur(tier){
    const t=tier||1,m=MB();infTurJoint(m,4.7+t*.2,t);
    for(let r=0;r<4;r++) for(let c=0;c<4;c++){
      const y=3.6+(r-1.5)*1.7,z=(c-1.5)*2.6;
      infOpenLimb(m,[-1,2,z*.4],[10+t,y,z],2.2+t*.1,1.15,6);
    }
    infGlowNode(m,-3,3.6,0,2.0+t*.12);return m.build();
  }

  /* Every simulation key receives its own wrapper even when it shares an art
     family. That keeps old saves stable and gives balance/art tuning an escape
     hatch without renaming a building later. */
  BLD_MDL_INFESTATION={
    mex:()=>mdlInfMex(), pgen:()=>mdlInfPgen(), fac:()=>mdlInfFactory(),
    turret:()=>mdlInfSpineBase(1), bunker:()=>mdlInfThornBase(1),
    sgen:()=>mdlInfShield(), tgate:()=>mdlInfTransitGate(), nest:()=>mdlInfThornNest(2),
    harbor:()=>mdlInfHarbor(), bastion:()=>mdlInfMortarBase(1), techlab:()=>mdlInfTech(),
    aatower:()=>mdlInfSporeBase(1), airfield:()=>mdlInfAirfield(),
    uplink:()=>mdlInfSonicShrieker(2), hq:()=>mdlInfBroodSpire(3),
    hellstorm:()=>mdlInfToxicBase(2), arc:()=>mdlInfArc(), rail:()=>mdlInfBoneBase(1),
    nova:()=>mdlInfAcidBase(3), wall:()=>mdlInfWall(), minelaser:()=>mdlInfProboscisBase(1),
    missilebastion:()=>mdlInfMissileBase(1), plasma:()=>mdlInfPlasmaBase(1), gate:()=>mdlInfGate(),
    geo:()=>mdlInfGeo(), silo:()=>mdlInfSilo(), fab:()=>mdlInfFab(),
    seafort:()=>mdlInfSeafortBase(1), stormcaller:()=>mdlInfStormBase(1),

    spinespiker:mdlInfSpineBase, gorespiker:mdlInfSpineBase, spineburrow:mdlInfSpineBase,
    toxicgusher:mdlInfToxicBase, acidgusher:mdlInfToxicBase, toxicspewer:mdlInfToxicBase,
    sporelauncher:mdlInfSporeBase, sporetower:mdlInfSporeBase,
    silktrap:mdlInfSilkTrap, tendriltrap:mdlInfSilkTrap, tendrilmaw:mdlInfSilkTrap,
    acidgeyser:mdlInfAcidBase, creeppustule:mdlInfAcidBase,
    thornnest:mdlInfThornBase, raptornest:mdlInfThornBase,
    sonicshrieker:mdlInfSonicShrieker,
    broodspire:mdlInfBroodSpire, broodchamber:mdlInfBroodSpire,
  };

  BLD_TUR_MDL_INFESTATION={
    turret:mdlInfSpineTur,bunker:mdlInfThornTur,bastion:mdlInfMortarTur,
    aatower:mdlInfSporeTur,hellstorm:mdlInfToxicTur,rail:mdlInfBoneTur,
    nova:mdlInfAcidTur,minelaser:mdlInfProboscisTur,
    missilebastion:mdlInfMissileTur,plasma:mdlInfPlasmaTur,
    seafort:mdlInfSeafortTur,stormcaller:mdlInfStormTur,
    spinespiker:mdlInfSpineTur,gorespiker:mdlInfSpineTur,spineburrow:mdlInfSpineTur,
    toxicgusher:mdlInfToxicTur,acidgusher:mdlInfToxicTur,toxicspewer:mdlInfToxicTur,
    sporelauncher:mdlInfSporeTur,sporetower:mdlInfSporeTur,
    acidgeyser:mdlInfAcidTur,creeppustule:mdlInfAcidTur,
    thornnest:mdlInfThornTur,raptornest:mdlInfThornTur,
  };
  BLD_TUR_H_INFESTATION={
    turret:17.25,bunker:14.25,bastion:17.25,aatower:17.75,hellstorm:18.75,
    rail:18.25,nova:12.45,minelaser:14.25,missilebastion:16.45,plasma:13.75,
    seafort:16.05,stormcaller:16.65,
    spinespiker:17.25,gorespiker:17.25,spineburrow:17.25,
    toxicgusher:18.75,acidgusher:18.75,toxicspewer:18.75,
    sporelauncher:17.75,sporetower:17.75,acidgeyser:12.45,creeppustule:12.45,
    thornnest:14.25,raptornest:14.25,
  };
  BLD_TUR_S_INFESTATION={
    turret:1.08,bunker:1.05,bastion:1.04,aatower:1.05,hellstorm:1.06,
    rail:1.08,nova:1.08,minelaser:1.07,missilebastion:1.04,plasma:1.07,
    seafort:1.06,stormcaller:1.05,
    spinespiker:1.08,gorespiker:1.08,spineburrow:1.08,
    toxicgusher:1.06,acidgusher:1.06,toxicspewer:1.06,
    sporelauncher:1.05,sporetower:1.05,acidgeyser:1.08,creeppustule:1.08,
    thornnest:1.05,raptornest:1.05,
  };

  const tiered={
    spinespiker:[mdlInfSpineBase,mdlInfSpineTur],gorespiker:[mdlInfSpineBase,mdlInfSpineTur],
    spineburrow:[mdlInfSpineBase,mdlInfSpineTur],
    toxicgusher:[mdlInfToxicBase,mdlInfToxicTur],acidgusher:[mdlInfToxicBase,mdlInfToxicTur],
    toxicspewer:[mdlInfToxicBase,mdlInfToxicTur],
    sporelauncher:[mdlInfSporeBase,mdlInfSporeTur],sporetower:[mdlInfSporeBase,mdlInfSporeTur],
    silktrap:[mdlInfSilkTrap,null],acidgeyser:[mdlInfAcidBase,mdlInfAcidTur],
    creeppustule:[mdlInfAcidBase,mdlInfAcidTur],thornnest:[mdlInfThornBase,mdlInfThornTur],
    raptornest:[mdlInfThornBase,mdlInfThornTur],
    sonicshrieker:[mdlInfSonicShrieker,null],broodspire:[mdlInfBroodSpire,null],
    turret:[mdlInfSpineBase,mdlInfSpineTur],bunker:[mdlInfThornBase,mdlInfThornTur],
    bastion:[mdlInfMortarBase,mdlInfMortarTur],aatower:[mdlInfSporeBase,mdlInfSporeTur],
    uplink:[mdlInfSonicShrieker,null],hellstorm:[mdlInfToxicBase,mdlInfToxicTur],
    rail:[mdlInfBoneBase,mdlInfBoneTur],nova:[mdlInfAcidBase,mdlInfAcidTur],
    minelaser:[mdlInfProboscisBase,mdlInfProboscisTur],
    missilebastion:[mdlInfMissileBase,mdlInfMissileTur],plasma:[mdlInfPlasmaBase,mdlInfPlasmaTur],
    seafort:[mdlInfSeafortBase,mdlInfSeafortTur],stormcaller:[mdlInfStormBase,mdlInfStormTur],
  };
  BLD_TIER_MDL_INFESTATION={};
  for(const k in tiered){
    const pair=tiered[k],base=pair[0],tur=pair[1];
    BLD_TIER_MDL_INFESTATION[k]=[1,2,3].map(t=>({base:()=>base(t),tur:tur?()=>tur(t):null}));
  }
  const INF_BLD_BESPOKE_PACKS=Object.freeze({
    nest: Object.freeze({id:'brood-nest-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    hq: Object.freeze({id:'brood-hive-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    fac: Object.freeze({id:'brood-hive-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    harbor: Object.freeze({id:'brood-hive-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    seafort: Object.freeze({id:'brood-hive-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    stormcaller: Object.freeze({id:'brood-spore-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    airfield: Object.freeze({id:'brood-hive-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    tgate: Object.freeze({id:'brood-hive-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    spire: Object.freeze({id:'brood-spire-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    broodspire: Object.freeze({id:'brood-spire-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    broodchamber: Object.freeze({id:'brood-spire-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    techlab: Object.freeze({id:'brood-spire-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    aatower: Object.freeze({id:'brood-spore-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    sporelauncher: Object.freeze({id:'brood-spore-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    sporetower: Object.freeze({id:'brood-spore-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    missilebastion: Object.freeze({id:'brood-spore-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    wall: Object.freeze({id:'brood-carapace-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    gate: Object.freeze({id:'brood-carapace-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    bunker: Object.freeze({id:'brood-carapace-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    bastion: Object.freeze({id:'brood-carapace-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    rail: Object.freeze({id:'brood-carapace-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    arc: Object.freeze({id:'brood-carapace-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    nova: Object.freeze({id:'brood-carapace-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    plasma: Object.freeze({id:'brood-carapace-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    minelaser: Object.freeze({id:'brood-carapace-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    mex: Object.freeze({id:'brood-sac-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    pgen: Object.freeze({id:'brood-sac-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    geo: Object.freeze({id:'brood-sac-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    silo: Object.freeze({id:'brood-sac-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    fab: Object.freeze({id:'brood-sac-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    acidgeyser: Object.freeze({id:'brood-sac-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    creeppustule: Object.freeze({id:'brood-sac-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    toxicgusher: Object.freeze({id:'brood-sac-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    acidgusher: Object.freeze({id:'brood-sac-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    toxicspewer: Object.freeze({id:'brood-sac-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    hellstorm: Object.freeze({id:'brood-sac-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    turret: Object.freeze({id:'brood-mound-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    spinespiker: Object.freeze({id:'brood-mound-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    gorespiker: Object.freeze({id:'brood-mound-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    spineburrow: Object.freeze({id:'brood-mound-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    silktrap: Object.freeze({id:'brood-tendril-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    tendriltrap: Object.freeze({id:'brood-tendril-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    tendrilmaw: Object.freeze({id:'brood-tendril-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    uplink: Object.freeze({id:'brood-tendril-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    sonicshrieker: Object.freeze({id:'brood-tendril-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    sgen: Object.freeze({id:'brood-tendril-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    thornnest: Object.freeze({id:'brood-nest-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})}),
    raptornest: Object.freeze({id:'brood-nest-v2', source:'semantic-bake', maps:null, surfaces:Object.freeze({})})
  });

  function infOrganicSurfacePass(geo,pack){
    if(!geo)return geo;
    if(geo.v){
      const v=geo.v;
      for(let o=11;o<v.length;o+=VFLOATS){
        const raw=v[o],sgn=raw<0?-1:1,packed=Math.abs(raw);
        const whole=Math.floor(packed),src=whole-1;
        const dst=pack&&pack.surfaces&&pack.surfaces[src]!==undefined?pack.surfaces[src]
          :(src===MAT.TWR_GLOW?MAT.BROOD_SLIME:src);
        if(dst!==undefined)v[o]=sgn*((dst+1)+(packed-whole));
      }
    }
    return geo;
  }

  function infBldFactory(fn, k) {
    if (!fn) return fn;
    const wrapped = function(...args) {
      const g = fn(...args);
      const pack = INF_BLD_BESPOKE_PACKS[k] || null;
      if (g && typeof g === 'object') {
        if (g.hull) infOrganicSurfacePass(g.hull, pack);
        if (g.tur) infOrganicSurfacePass(g.tur, pack);
        if (g.v) infOrganicSurfacePass(g, pack);
      }
      return g;
    };
    Object.defineProperty(wrapped, 'name', {value: 'infBld_' + k});
    return wrapped;
  }

  for (const k in INF_BLD_BESPOKE_PACKS) {
    if (typeof BLD_MDL_INFESTATION !== 'undefined' && BLD_MDL_INFESTATION[k]) {
      BLD_MDL_INFESTATION[k] = infBldFactory(BLD_MDL_INFESTATION[k], k);
    }
    if (typeof BLD_TUR_MDL_INFESTATION !== 'undefined' && BLD_TUR_MDL_INFESTATION[k]) {
      BLD_TUR_MDL_INFESTATION[k] = infBldFactory(BLD_TUR_MDL_INFESTATION[k], k);
    }
    if (typeof BLD_TIER_MDL_INFESTATION !== 'undefined' && BLD_TIER_MDL_INFESTATION[k]) {
      const orig = BLD_TIER_MDL_INFESTATION[k];
      BLD_TIER_MDL_INFESTATION[k] = orig.map(V => ({
        base: infBldFactory(V.base, k),
        tur: V.tur ? infBldFactory(V.tur, k) : null
      }));
    }
  }
})();

