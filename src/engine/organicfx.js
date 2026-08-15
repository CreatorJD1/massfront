/* ============================================================================
   ORGANIC FX — Brood ichor / bile / violet-black fluid
   ----------------------------------------------------------------------------
   Trail/smoke/energy live in gpufx.js and the CPU particle switch. This file
   owns GROWN-tissue liquid only: droplets, short puddles, and wisps.

   Why not gpfxBurst: that path is sparks/embers. A lime GPU fountain reads as
   the same energy Nova/Legion already spray. Ichor has to sit on the ground
   as a wet stain with a sheen, not a point-sprite firework.

   Civic rule: never addCrater / addGroundBurn / deformTerrain for ichor.
   Pavement already has a soot carpet; a crater-sprite stain reads as a
   broken placement preview. Puddles are billboards, not terrain decals.

   Mechanical factions stay sparks/oil/energy. unitIsBrood / horde kit only.
   ============================================================================ */
const ORGFX_CAP=384, ORGFX_DROP=0, ORGFX_SPLAT=1, ORGFX_WISP=2;
const orgX=new Float32Array(ORGFX_CAP), orgY=new Float32Array(ORGFX_CAP);
const orgZ=new Float32Array(ORGFX_CAP), orgVx=new Float32Array(ORGFX_CAP);
const orgVy=new Float32Array(ORGFX_CAP), orgVz=new Float32Array(ORGFX_CAP);
const orgLife=new Float32Array(ORGFX_CAP), orgMax=new Float32Array(ORGFX_CAP);
const orgSize=new Float32Array(ORGFX_CAP), orgRot=new Float32Array(ORGFX_CAP);
const orgAsp=new Float32Array(ORGFX_CAP);
const orgR=new Uint8Array(ORGFX_CAP), orgG=new Uint8Array(ORGFX_CAP), orgB=new Uint8Array(ORGFX_CAP);
const orgKind=new Uint8Array(ORGFX_CAP);
let orgHead=0, orgN=0, orgfxOn=0, orgfxHurtT=null;

/* Fallback if BRD_ICHOR / INF_ICHOR have not loaded. Same triples as the
   brood slime tile and infestation mucus/sac/glow — not human crimson. */
const ORGFX_PAL=[
  [[115,177,77],[62,88,30],[185,255,72]],
  [[214,168,40],[78,48,12],[255,220,110]],
  [[186,82,245],[48,18,64],[220,150,255]]
];

function orgfxQ(){
  return (typeof mfVfxQ==='function')?mfVfxQ()
    :((typeof GFX!=='undefined'&&GFX.particles!=null)?GFX.particles:1);
}
function orgfxH(x,y){
  return (typeof terrainH==='function')?terrainH(x,y):0.4;
}
function orgfxCaste(sz,name){
  const s=String(name||'');
  if(s.indexOf('Nest')>=0||s.indexOf('Sovereign')>=0||s.indexOf('Hive')>=0
     ||s.indexOf('Tidecaster')>=0) return 2;
  if(s.indexOf('Bile')>=0||s.indexOf('Acid')>=0||s.indexOf('Spore')>=0
     ||s.indexOf('Geyser')>=0||s.indexOf('Toxic')>=0) return 1;
  return sz>=28?2:sz>=18?1:0;
}
function orgfxPal(caste){
  const c=caste|0;
  if(typeof BRD_ICHOR!=='undefined'&&BRD_ICHOR[c]&&BRD_ICHOR[c][0])
    return BRD_ICHOR[c];
  if(c===0&&typeof INF_ICHOR!=='undefined'&&INF_ICHOR.wet)
    return [INF_ICHOR.wet,INF_ICHOR.dark,INF_ICHOR.hi];
  return ORGFX_PAL[c]||ORGFX_PAL[0];
}
function orgfxUnitOrganic(i){
  if(typeof unitIsBrood==='function') return unitIsBrood(i);
  return !!(typeof TYPES!=='undefined'&&TYPES[utype[i]]&&TYPES[utype[i]].brood) || uteam[i]===2;
}
function orgfxBldOrganic(B){
  if(!B) return false;
  if(B.team===2||B.type==='nest') return true;
  if(typeof bldFactionKit==='function') return bldFactionKit(B)==='horde';
  if(B.team===1&&typeof AI!=='undefined'&&AI&&AI.fac==='horde') return true;
  const pf=(typeof playerFaction!=='undefined'&&playerFaction)||'';
  return B.team===0&&(pf==='horde'||pf==='brood');
}
function orgfxStrategic(){
  return (typeof orthoSpan==='number'&&orthoSpan>900);
}
function orgfxOverview(){
  return (typeof orthoSpan==='number'&&orthoSpan>2400);
}

function orgfxAdd(kind,x,y,z,vx,vy,vz,life,size,r,g,b,rot,asp){
  if(orgN>=ORGFX_CAP) return;
  const i=orgHead; orgHead=(orgHead+1)%ORGFX_CAP;
  if(!orgLife[i]) orgN++;
  orgKind[i]=kind; orgX[i]=x; orgY[i]=y; orgZ[i]=z;
  orgVx[i]=vx; orgVy[i]=vy; orgVz[i]=vz;
  orgLife[i]=life; orgMax[i]=life; orgSize[i]=size;
  orgRot[i]=rot||0; orgAsp[i]=asp>0.05?asp:1;
  orgR[i]=r; orgG[i]=g; orgB[i]=b;
}

function orgfxBurst(x,y,size,dirX,dirY,death){
  const q=orgfxQ();
  /* LOW particles is 0.5. Below ~0.28 is "FX off" leftovers. */
  if(q<0.28) return;
  const strat=orgfxStrategic(), over=orgfxOverview();
  const caste=arguments.length>6?arguments[6]:orgfxCaste(size);
  const pal=orgfxPal(caste);
  const wet=pal[0], dark=pal[1], hi=pal[2];
  const floor=orgfxH(x,y);
  const hasDir=dirX*dirX+dirY*dirY>0.01;
  const dl=hasDir?Math.hypot(dirX,dirY):1;
  const dx=hasDir?dirX/dl:0, dy=hasDir?dirY/dl:0;
  /* Preset split:
       LOW    (q<0.65)  tinted puffs only — no pools, no beads
       MEDIUM (q<0.95)  few large splats, still readable
       HIGH+            volume + wet sheen + lingering pools
     Strategic zoom keeps wisps; a puddle field vanishes into noise. */
  let nDrop, nSplat, nWisp;
  if(over){ nDrop=0; nSplat=0; nWisp=death?2:1; }
  else if(strat){ nDrop=death?2:0; nSplat=0; nWisp=death?3:1; }
  else if(q<0.65){ nDrop=0; nSplat=0; nWisp=death?3:2; }
  else if(q<0.95){ nDrop=death?5:3; nSplat=death?3:2; nWisp=death?2:1; }
  else { nDrop=death?(q>=1.25?12:8):(q>=1.25?6:5); nSplat=death?(q>=1.25?6:4):3; nWisp=death?(q>=1.25?3:2):1; }
  const scale=Math.max(10,size);
  for(let k=0;k<nDrop;k++){
    const sway=rr(-0.55,0.55), c=Math.cos(sway), s=Math.sin(sway);
    const spd=(death?16:9)+Math.random()*(death?20:11);
    const vx=hasDir?(dx*c-dy*s)*spd:Math.cos(Math.random()*TAU)*spd;
    const vy=hasDir?(dx*s+dy*c)*spd:Math.sin(Math.random()*TAU)*spd;
    const hot=Math.random()<0.58;
    const col=hot?hi:wet;
    /* Do not aim the quad along velocity — that turned a 1.12 aspect
       bead into a short tracer. Round disc, random spin. */
    orgfxAdd(ORGFX_DROP,x,y,floor+scale*0.42+Math.random()*2.4,
      vx,vy,12+Math.random()*(death?24:14),
      0.48+Math.random()*0.32, (q<0.95?7.2:6.4)+Math.random()*2.6,
      col[0],col[1],col[2], Math.random()*TAU, 1.04+Math.random()*0.10);
  }
  if(!strat&&nSplat){
    const civic=typeof cityGroundAt==='function'&&cityGroundAt(x,y)>=1;
    const splatN=civic?Math.max(1,nSplat-1):nSplat;
    /* HIGH lingering pools. MEDIUM shorter but still a wet mark. Civic
       stays a stain, never a crater-sprite carpet. */
    const splatLife=civic?(q>=0.95?1.6:0.85)
      :(q>=1.25?4.0:q>=0.95?2.8:1.25);
    for(let k=0;k<splatN;k++){
      const a=Math.random()*TAU, d=Math.random()*scale*(death?0.62:0.32);
      /* Cap the puddle. Even 16 wu at tactical close reads as an AoE ring. */
      const sz=Math.min(7.5,(q<0.95?scale*0.42:scale*0.36)*(civic?0.72:1)*(0.80+Math.random()*0.35));
      orgfxAdd(ORGFX_SPLAT,x+Math.cos(a)*d,y+Math.sin(a)*d,floor+0.42,
        0,0,0, splatLife*(0.75+Math.random()*0.35),
        sz, (dark[0]*0.45+wet[0]*0.55)|0,(dark[1]*0.45+wet[1]*0.55)|0,
        (dark[2]*0.45+wet[2]*0.55)|0, a, 1.08+Math.random()*0.16);
    }
  }
  for(let k=0;k<nWisp;k++){
    const a=Math.random()*TAU, d=Math.random()*scale*0.28;
    orgfxAdd(ORGFX_WISP,x+Math.cos(a)*d,y+Math.sin(a)*d,floor+scale*0.22,
      rr(-5,5),rr(-5,5),7+Math.random()*11,
      (strat?0.22:0.50)+Math.random()*0.18, scale*(strat?0.34:0.55),
      wet[0],wet[1],wet[2], a, 1);
  }
}
function orgfxHit(x,y,size,dirX,dirY,caste){
  orgfxBurst(x,y,size,dirX||0,dirY||0,false,caste==null?orgfxCaste(size):caste);
}
function orgfxDeath(x,y,size,caste){
  orgfxBurst(x,y,size,0,0,true,caste==null?orgfxCaste(size):caste);
}
function orgfxCount(){ return orgN; }

/* Tiny sim.js hooks. Sampling lives here so dealDamage stays a one-liner. */
function orgfxOnHit(j,dmg,attacker){
  if(j<0||!ualive[j]||!orgfxUnitOrganic(j)) return;
  const q=orgfxQ();
  if(q<0.28) return;
  const now=(typeof stats!=='undefined')?stats.t:0;
  if(!orgfxHurtT&&typeof MAXU==='number') orgfxHurtT=new Float32Array(MAXU);
  if(orgfxHurtT&&orgfxHurtT[j]>now) return;
  if(orgfxHurtT) orgfxHurtT[j]=now+(q>=0.95?0.08:0.14);
  /* HIGH: almost every real hit sprays. MEDIUM must still read as liquid. */
  const keep=q>=0.95?0.92:q>=0.65?0.78:0.34;
  if(Math.random()>keep) return;
  const T=TYPES[utype[j]], sz=T&&T.size||12;
  let dx=0,dy=0;
  if(attacker>=0&&ualive[attacker]){ dx=ux[j]-ux[attacker]; dy=uy[j]-uy[attacker]; }
  /* Rim of the carapace facing the shot — hull-center spray looked like
     a green energy fountain sitting on the navel. */
  const il=Math.hypot(dx,dy)||1;
  orgfxHit(ux[j]-(dx/il)*sz*0.42, uy[j]-(dy/il)*sz*0.42, sz, dx, dy, orgfxCaste(sz,T&&T.name));
}
function orgfxOnDeath(x,y,size,name){
  orgfxDeath(x,y,size,orgfxCaste(size,name));
}
function orgfxOnBld(B,dmg,died){
  if(!orgfxBldOrganic(B)||!B||B.x==null) return;
  const sz=(typeof BT!=='undefined'&&BT[B.type]&&BT[B.type].size)||B.r*2||24;
  const caste=orgfxCaste(sz,B.type);
  if(died){ orgfxDeath(B.x,B.y,sz,caste); return; }
  if(!(dmg>=10)||Math.random()>0.45) return;
  orgfxHit(B.x,B.y,sz,0,0,caste);
}
function orgfxSeep(x,y,size){
  const q=orgfxQ();
  if(q<0.95||orgfxStrategic()) return;
  const pal=orgfxPal(orgfxCaste(size));
  const wet=pal[0], floor=orgfxH(x,y);
  const a=Math.random()*TAU, spd=6+Math.random()*8;
  orgfxAdd(ORGFX_DROP,x,y,floor+Math.max(8,size)*0.38,
    Math.cos(a)*spd,Math.sin(a)*spd,8+Math.random()*10,
    0.36+Math.random()*0.18, 5.4+Math.random()*1.8,
    wet[0],wet[1],wet[2], a, 1.06);
}

function orgfxTick(dt){
  if(!orgN) return;
  dt=Math.min(dt,0.05);
  for(let i=0;i<ORGFX_CAP;i++){
    if(!orgLife[i]) continue;
    orgLife[i]-=dt;
    if(orgLife[i]<=0){ orgLife[i]=0; orgN--; continue; }
    const k=orgKind[i];
    if(k===ORGFX_SPLAT) continue;
    orgX[i]+=orgVx[i]*dt; orgY[i]+=orgVy[i]*dt; orgZ[i]+=orgVz[i]*dt;
    if(k===ORGFX_DROP){
      orgVz[i]-=78*dt; orgVx[i]*=0.91; orgVy[i]*=0.91;
      /* Keep the authored spin. Re-aiming at velocity made every bead a streak. */
      const floor=orgfxH(orgX[i],orgY[i])+0.32;
      if(orgZ[i]<=floor&&orgVz[i]<0){
        orgZ[i]=floor; orgVz[i]=0;
        /* Landing bead becomes a brief puddle at tactical MEDIUM+. */
        const q=orgfxQ();
        if(!orgfxStrategic()&&q>=0.65&&Math.random()<(q>=0.95?0.72:0.38)){
          orgKind[i]=ORGFX_SPLAT;
          orgLife[i]=q>=0.95?Math.max(orgLife[i],1.6):Math.max(orgLife[i],0.7);
          orgMax[i]=orgLife[i]; orgSize[i]=Math.min(8,orgSize[i]*1.55); orgAsp[i]=1.10+Math.random()*0.16;
          orgR[i]=orgR[i]*0.48|0; orgG[i]=orgG[i]*0.52|0; orgB[i]=orgB[i]*0.42|0;
        } else orgLife[i]=Math.min(orgLife[i],0.10);
      }
    } else {
      orgVz[i]*=0.94; orgVx[i]*=0.96; orgVy[i]*=0.96;
    }
  }
}

function orgfxEnqueue(){
  if(!orgN||typeof bbAdd==='undefined'||!bbAdd) return;
  if(typeof sprites==='undefined'||!sprites.glow) return;
  const glow=sprites.glow, smoke=sprites.smoke||glow;
  const q=orgfxQ(), strat=orgfxStrategic(), over=orgfxOverview();
  const t=(typeof performance!=='undefined')?performance.now()*0.001:0;
  const addRect=bbAlpha.addOrientedRect?bbAlpha.addOrientedRect.bind(bbAlpha):null;
  const addGlow=bbAdd.addOrientedRect?bbAdd.addOrientedRect.bind(bbAdd):null;
  for(let i=0;i<ORGFX_CAP;i++){
    if(!orgLife[i]) continue;
    if(over&&(i&1)) continue;
    const X=orgX[i], Y=orgY[i];
    if(typeof cam!=='undefined'){
      const lim=(typeof orthoSpan==='number'?orthoSpan:900)*0.9;
      const dx=X-cam.x, dy=Y-cam.y;
      if(dx*dx+dy*dy>lim*lim) continue;
    }
    if(typeof fogPointVisible==='function'&&!fogPointVisible(X,Y)) continue;
    const lf=orgLife[i]/orgMax[i], k=orgKind[i], H=orgZ[i];
    const rot=orgRot[i], asp=orgAsp[i]||1, sz=orgSize[i];
    if(k===ORGFX_SPLAT){
      if(strat) continue;
      /* Dark elliptical stain + saturated wet body + moving sheen.
         Sheen is HIGH-only so MEDIUM stays a cheaper readable slick. */
      const fade=Math.min(1,lf*1.15);
      const aStain=Math.min(200,175*fade);
      const w=sz*asp, h=sz;
      if(addRect) addRect.call(bbAlpha,smoke,X,Y,H,w,h,rot,orgR[i],orgG[i],orgB[i],aStain);
      else bbAlpha.add(smoke,X,Y,H,sz*(1.05+(1-lf)*0.3),rot,orgR[i],orgG[i],orgB[i],aStain);
      const wr=Math.min(255,orgR[i]+48), wg=Math.min(255,orgG[i]+62), wb=Math.min(255,orgB[i]+28);
      if(addRect) addRect.call(bbAlpha,glow,X,Y,H+0.12,w*0.70,h*0.64,rot,wr,wg,wb,88*fade);
      else bbAlpha.add(glow,X,Y,H+0.12,sz*0.62,rot,wr,wg,wb,95*fade);
      if(q>=0.95){
        const shimmer=0.55+0.45*Math.sin(t*5.2+i);
        const ox=Math.cos(rot)*sz*0.12, oy=Math.sin(rot)*sz*0.12;
        if(addGlow) addGlow.call(bbAdd,glow,X+ox,Y+oy,H+0.22,w*0.38,h*0.22,rot,
          Math.min(255,wr+40),Math.min(255,wg+30),Math.min(255,wb+20),52*fade*shimmer);
        else bbAdd.add(glow,X+ox,Y+oy,H+0.22,sz*0.34,rot,
          Math.min(255,wr+40),Math.min(255,wg+30),Math.min(255,wb+20),52*fade*shimmer);
      }
    } else if(k===ORGFX_WISP){
      const lift=H+(1-lf)*12;
      bbAlpha.add(smoke,X,Y,lift,sz*(0.95+(1-lf)*1.15),t*0.28+i,
        orgR[i],orgG[i],orgB[i], (strat?80:130)*lf);
    } else {
      /* In-flight bead: circular body + wet core. Aspect stays ~1. */
      const w=sz*asp, h=sz;
      if(addRect) addRect.call(bbAlpha,smoke,X,Y,H-0.25,w*1.12,h*1.12,rot,
        orgR[i]*0.45|0,orgG[i]*0.5|0,orgB[i]*0.4|0,150*lf);
      else bbAlpha.add(smoke,X,Y,H-0.25,sz*1.35,rot,
        orgR[i]*0.45|0,orgG[i]*0.5|0,orgB[i]*0.4|0,150*lf);
      if(addGlow) addGlow.call(bbAdd,glow,X,Y,H,w*0.92,h*0.92,rot,orgR[i],orgG[i],orgB[i],230*lf);
      else bbAdd.add(glow,X,Y,H,sz,rot,orgR[i],orgG[i],orgB[i],230*lf);
    }
  }
}

function orgfxInstall(){
  if(orgfxOn) return;
  orgfxOn=1;
  if(typeof MAXU==='number'&&!orgfxHurtT) orgfxHurtT=new Float32Array(MAXU);
}

(function orgfxHook(){
  if(typeof beginBB==='function'){
    const prev=beginBB;
    beginBB=function(tex){
      orgfxInstall();
      const r=prev.apply(this,arguments);
      /* Enqueue after beginBB so frustum cull matches this camera. */
      if(!tex) orgfxEnqueue();
      return r;
    };
  }
  if(typeof gpfxFrame==='function'){
    const prev=gpfxFrame;
    gpfxFrame=function(dt,matVP,viewH){
      orgfxInstall();
      const r=prev.apply(this,arguments);
      orgfxTick((typeof dt==='number'&&dt>0)?dt:0.016);
      return r;
    };
  }
})();
