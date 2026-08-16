;
;
/* ============================================================
   RENDER v2 — turrets, beams, fog of war, clouds + HUD + sound
   ============================================================ */
const airTmp=new Int32Array(12000);

// per-creature size jitter so no two bugs read as the same model
const BUG_SIZE=[0.86,1.14,0.95,1.22,0.9,1.06,1.18,0.99];

let bloomOn=true, gradeOn=true;
/* ---------- BLOOM — bright emitters bleed light into the frame ---------- */
const BLOOM_MAX=520;
const bloomX=new Float32Array(BLOOM_MAX), bloomY=new Float32Array(BLOOM_MAX),
      bloomS=new Float32Array(BLOOM_MAX), bloomR=new Uint8Array(BLOOM_MAX),
      bloomG=new Uint8Array(BLOOM_MAX), bloomB=new Uint8Array(BLOOM_MAX),
      bloomA=new Float32Array(BLOOM_MAX);
let bloomN=0;
function addBloom(x,y,size,r,g,b,a){
  if(bloomN>=BLOOM_MAX) return;
  bloomX[bloomN]=x; bloomY[bloomN]=y; bloomS[bloomN]=size;
  bloomR[bloomN]=r; bloomG[bloomN]=g; bloomB[bloomN]=b; bloomA[bloomN]=a;
  bloomN++;
}

/* ---------- floating damage numbers (DOM pool) ---------- */
const FT_N=14, ftEls=[], ftDat=[];
function initFloatText(){
  for(let i=0;i<FT_N;i++){
    const d=document.createElement('div');
    d.className='ftxt';
    document.body.appendChild(d);
    ftEls.push(d); ftDat.push({life:0});
  }
}
function spawnFloatText(wx,wy,dmg,mu){
  if(!ftEls.length) return;
  const b=camBounds();
  if(wx<b.x0||wx>b.x1||wy<b.y0||wy>b.y1) return;
  for(let i=0;i<FT_N;i++){
    if(ftDat[i].life<=0){
      const D=ftDat[i];
      D.life=0.85; D.wx=wx+rr(-4,4); D.wy=wy-8; D.vy=-34;
      const el=ftEls[i];
      el.textContent='-'+Math.max(1,Math.round(dmg));
      el.style.color= mu>=1.15?'#ffb35c' : mu<=0.8?'#9aa8b6' : '#f2f7fc';
      el.style.fontSize= mu>=1.15?'13px' : mu<=0.8?'10px' : '11.5px';
      return;
    }
  }
}
function floatTextTick(dt){
  for(let i=0;i<FT_N;i++){
    const D=ftDat[i], el=ftEls[i];
    if(D.life<=0){ if(el.style.opacity!=='0') el.style.opacity='0'; continue; }
    D.life-=dt; D.wy+=D.vy*dt; D.vy*=0.9;
    const [sx2,sy2]=w2s(D.wx,D.wy);
    el.style.transform='translate('+(sx2|0)+'px,'+(sy2|0)+'px)';
    el.style.opacity=Math.min(1,D.life*2.4);
  }
}

/* ---------- minimap pings with severity ---------- */
const mmPings=[];
function mmPing(x,y,type){
  /* type: 'attack' (red), 'ally_down' (yellow), 'new_enemy' (orange), 'building_lost' (purple) */
  const dur=type==='attack'?8:type==='building_lost'?8:type==='ally_down'?6:5;
  const colors={'attack':[255,80,60],'ally_down':[255,220,60],'new_enemy':[255,160,40],'building_lost':[180,80,255]};
  const c=colors[type]||colors.attack;
  mmPings.push({x,y,until:stats.t+dur,type:type||'attack',cr:c[0],cg:c[1],cb:c[2]});
  if(mmPings.length>10) mmPings.shift();
}

// ---------- fog of war ----------
let fogOn=true;
/* 128 cells over the 3200-unit map is 25 world units a cell — half the old
   cell, which removes the stair-stepped fog border. Radii below are in CELLS,
   so every one doubles with the grid to keep world-space vision identical. */
const FN=128;
const fogCov=new Uint8Array(FN*FN);
/* `fogCov` is the live sensor picture; `fogSeen` is only terrain memory.  The
   old implementation had one map, so an area snapped from fully visible to
   pitch black and enemy buildings had to stay live forever once discovered.
   Keeping the layers separate lets scouting uncover the battlefield without
   leaking a base's current health, upgrades or production after it leaves
   line of sight. */
const fogSeen=new Uint8Array(FN*FN), fogSources=new Uint8Array(FN*FN);
const prevFogCov=new Uint8Array(FN*FN);
const fogScans=[];
/* GPU path writes a raw RGBA buffer straight into texSubImage2D — the old
   ImageData -> putImageData -> canvas-source upload walked the same bytes
   through the 2D raster pipeline twice per update. The canvas survives only
   as the minimap's composited fog layer, refreshed at half cadence. */
const fogCanvas=document.createElement('canvas'); fogCanvas.width=FN; fogCanvas.height=FN;
const fogCtx=fogCanvas.getContext('2d',{willReadFrequently:true});
const fogImg=fogCtx.createImageData(FN,FN);
const fogBuf=new Uint8Array(FN*FN*4);
let fogMiniTick=0;
let fogTex=null, fogDirty=true;
/* The landing carrier is the player's first sensor, not an omniscient camera.
   Keeping fog authoritative during descent makes the chosen landing route
   matter and prevents enemy bases/resources leaking before deployment. Menus
   and the attract-mode world remain clear because they have no active carrier. */
function fogGameplayActive(){
  const deploying=typeof carrier!=='undefined'&&carrier&&carrier.active&&carrier.phase<2;
  return fogOn&&(typeof matchLive==='undefined'||matchLive||deploying);
}
/* Context-loss reset: the fog texture handle survives the loss as a truthy
   reference to a dead object; updateFog would then upload into it forever and
   the explored map would never come back. Recovery calls this first. */
function fogGLReset(){ fogTex=null; }
function covAt(wx,wy){
  if(!fogGameplayActive()) return 1;
  return fogCov[clamp(wy/MAP*FN|0,0,FN-1)*FN+clamp(wx/MAP*FN|0,0,FN-1)];
}
function fogExploredAt(wx,wy){
  if(!fogGameplayActive()) return 1;
  return fogSeen[clamp(wy/MAP*FN|0,0,FN-1)*FN+clamp(wx/MAP*FN|0,0,FN-1)];
}
function fogPointVisible(wx,wy){
  return !fogGameplayActive()||(typeof demoMode!=='undefined'&&demoMode)||!!covAt(wx,wy);
}
function fogEntityVisible(team,wx,wy){
  return team===0||fogPointVisible(wx,wy);
}
function fogFxVisible(wx,wy,team){
  /* Friendly ordnance is an issued command and may remain readable at the edge
     of its sensor circle. Hostile fire, smoke and impact flashes never render
     from black map cells — those were the last major spawn-location leak. */
  return team===0||fogPointVisible(wx,wy);
}
function fogStartScan(wx,wy,seconds,radius){
  fogScans.push({x:wx,y:wy,until:stats.t+Math.max(1,seconds||20),r:Math.max(4,radius||13)});
  if(fogScans.length>5) fogScans.shift();
  updateFog();
}
function markCov(wx,wy,rc){
  const cx=clamp(wx/MAP*FN|0,0,FN-1), cy=clamp(wy/MAP*FN|0,0,FN-1);
  const r2=rc*rc;
  for(let y=Math.max(0,cy-rc);y<=Math.min(FN-1,cy+rc);y++)
    for(let x=Math.max(0,cx-rc);x<=Math.min(FN-1,cx+rc);x++){
      const dx=x-cx,dy=y-cy;
      if(dx*dx+dy*dy<=r2) fogCov[y*FN+x]=1;
    }
}
/* 3×3 box blur softens fog coverage edges for smooth vision radius
   boundaries instead of hard pixelated blocks. */
function blurFogCov(){
  const tmp=new Uint8Array(FN*FN);
  for(let y=0;y<FN;y++) for(let x=0;x<FN;x++){
    let s=0,n=0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      const nx=x+dx,ny=y+dy;
      if(nx>=0&&nx<FN&&ny>=0&&ny<FN){ s+=fogCov[ny*FN+nx]; n++; }
    }
    /* 0.4 eroded a floor-size bubble to a point; 0.30 keeps it whole while
       still smoothing jagged coverage edges. */
    tmp[y*FN+x]=s/n>0.30?1:0;
  }
  fogCov.set(tmp);
}
function updateFog(){
  if(!fogGameplayActive()) return;
  /* Snapshot previous fogCov to detect transitions for reveal FX. */
  prevFogCov.set(fogCov);
  fogCov.fill(0);
  fogSources.fill(0);
  const vis=r=>(typeof intelVisionScale==='function')?intelVisionScale(r):(WC.fogb?Math.max(4,Math.round(r*0.6)):r);
  /* Stamp each occupied sensor cell once. Sampling every Nth unit was cheap,
     but at high population it could skip a lone scout and black out the ground
     under the player's own army. This remains bounded by the 64x64 fog grid. */
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]||uteam[i]!==0) continue;
    const hm=typeof hazVisionMult==='function'?hazVisionMult(ux[i],uy[i],i):1;
    /* Haze shortens how far a unit SEES — never whether it lights the ground
       it stands on. Applied to the whole radius, storm front + Fog Bank
       stacked your own column into darkness and erosion ate the remaining
       bubbles: fog read as PERMANENT while driving through it. Six cells of
       self-illumination always; haze scales only the reach beyond.
       Scout/GHOST radii live in src/intel.js — hardcoded air/ground here was
       why a Kestrel saw the same disc as a Wasp. */
    const r=(typeof intelUnitVision==='function')?intelUnitVision(i,vis,hm)
      :Math.max(6,Math.round(6+(vis(TYPES[utype[i]].air?14:10)-6)*hm));
    const cx=clamp(ux[i]/MAP*FN|0,0,FN-1),cy=clamp(uy[i]/MAP*FN|0,0,FN-1),q=cy*FN+cx;
    if(fogSources[q]<r){ fogSources[q]=r; markCov(ux[i],uy[i],r); }
  }
  for(const B of blds){
    if(!B.alive) continue;
    if(B.team===0){
      const hm=typeof hazVisionMult==='function'?hazVisionMult(B.x,B.y,-1):1;
      const br=(typeof intelBldVision==='function')?intelBldVision(B,vis,hm)
        :Math.max(4,Math.round(vis(B.type==='hq'?22:B.type==='turret'?12:10)*hm));
      markCov(B.x,B.y,br);
    }
  }
  if(carrier.active) markCov(carrier.x,carrier.y, vis(24));   // the carrier lights its own way down
  for(let i=fogScans.length-1;i>=0;i--){
    const S=fogScans[i];
    if(stats.t>=S.until){ fogScans.splice(i,1); continue; }
    markCov(S.x,S.y,vis(S.r*2));                 // scan radii were authored on the 64 grid
  }
  for(let i=0;i<FN*FN;i++) if(fogCov[i]) fogSeen[i]=1;
  for(const B of blds){
    if(B.alive&&B.team!==0&&!B.seen&&covAt(B.x,B.y)) B.seen=true;
  }
  for(const C of crates) if(!C.seen&&covAt(C.x,C.y)) C.seen=true;
  /* Reveal FX: spawn white flash particles where fog lifts this frame. */
  for(let i=0;i<FN*FN;i++){
    if(!prevFogCov[i]&&fogCov[i]){
      const wx=(i%FN+0.5)*MAP/FN, wy=((i/FN|0)+0.5)*MAP/FN;
      addParticle(0,wx,wy,0,0,.15,8,180,220,255);
    }
  }
  blurFogCov();
  const d=fogBuf;
  for(let i=0;i<FN*FN;i++){
    const o=i*4, x=i%FN, y=i/FN|0;
    let cov=0, seen=0, n=0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      const nx=x+dx, ny=y+dy;
      if(nx<0||nx>=FN||ny<0||ny>=FN) continue;
      const j=ny*FN+nx;
      cov+=fogCov[j]; seen+=fogSeen[j]; n++;
    }
    /* GPU alpha only — gameplay still uses the binary fogCov stamps.
       Vision 0, explored shroud 168 (scouted terrain stays command-readable),
       unexplored 255. 3x3 vis feathers the sensor bubble before the LINEAR
       filter, so the circle reads as weather rather than a hard disc.
       RGB stays black: 3D shaders sample .a, and a navy fill was the old
       blue cutout on any planet whose atmosphere is not blue. */
    const shroud=1-cov/n;
    d[o]=0; d[o+1]=0; d[o+2]=0;
    d[o+3]=(shroud*(seen/n>0.12?168:255))|0;
  }
  if((fogMiniTick=(fogMiniTick+1)&1)===0){ fogImg.data.set(fogBuf); fogCtx.putImageData(fogImg,0,0); }
  if(!fogTex){
    fogTex=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,fogTex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,FN,FN,0,gl.RGBA,gl.UNSIGNED_BYTE,fogBuf);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  } else {
    gl.bindTexture(gl.TEXTURE_2D,fogTex);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,FN,FN,gl.RGBA,gl.UNSIGNED_BYTE,fogBuf);
  }
  gl.bindTexture(gl.TEXTURE_2D,atlasTex);
}

// ---------- main render ----------
function renderLegacySprites(dtDraw){
  gl.clearColor(0.012,0.02,0.045,1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  let camx=cam.x, camy=cam.y;
  if(shake>0){ camx+=rr(-shake,shake)*shakeMult/cam.z; camy+=rr(-shake,shake)*shakeMult/cam.z; shake*=0.86; if(shake<0.3) shake=0; }
  gl.uniform2f(uCam,camx,camy);
  gl.uniform2f(uSc,2*cam.z/VW,2*cam.z/VH);
  gl.uniform2f(uYawL,Math.cos(camYaw),Math.sin(camYaw));
  gl.uniform1f(uPitchL,camPitch);
  BILLBOARD=0;                       // ground layers first: terrain, water, decals
  const B=camBounds(), m=60;
  const x0=B.x0-m,y0=B.y0-m,x1=B.x1+m,y1=B.y1+m;
  const FULLUV=[0,0,1,1];
  const zoomedIn=cam.z>0.32;
  const t=performance.now()/1000;
  const use3D=unitTexReady;
  const S3D=2.05, S3B=2.15;          // baked frame scale: units / buildings
  const nAmt=nightAmt();             // 0 noon → 1 midnight

  // ---- terrain ----
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.bindTexture(gl.TEXTURE_2D,terrainTex);
  batT.add(FULLUV,MAP/2,MAP/2,MAP,MAP,0,255,255,255,255);
  batT.flush();
  // tiling ground-detail grain — crisp texture at close zoom, mip-fades at distance
  if(detailTex&&zoomedIn){
    gl.bindTexture(gl.TEXTURE_2D,detailTex);
    const rep=MAP/168;
    // detail strengthens as you zoom in — keeps ground grain crisp under magnification
    batT.add([0,0,rep,rep],MAP/2,MAP/2,MAP,MAP,0,255,255,255,clamp(66+cam.z*74,66,168));
    if(cam.z>0.75){                               // second finer octave for extreme close-ups
      const rep2=MAP/52;
      batT.add([0,0,rep2,rep2],MAP/2,MAP/2,MAP,MAP,0,255,255,255,clamp((cam.z-0.75)*135,0,86));
    }
    batT.flush();
  }
  // ---- water: sharp static surface + additive animated caustics ----
  if(waterBaseTex){
    gl.bindTexture(gl.TEXTURE_2D,waterBaseTex);
    batT.add(FULLUV,MAP/2,MAP/2,MAP,MAP,0,255,255,255,255);
    batT.flush();
    if(waterCaustTex.length){
      waterPhase+=dtDraw*4.2;
      const wf=(waterPhase|0)%waterCaustTex.length;
      const nf=(wf+1)%waterCaustTex.length;
      const bl=waterPhase-(waterPhase|0);          // cross-fade keeps the motion fluid
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
      gl.bindTexture(gl.TEXTURE_2D,waterCaustTex[wf]);
      batT.add(FULLUV,MAP/2,MAP/2,MAP,MAP,0,255,255,255,((1-bl)*205)|0);
      batT.flush();
      gl.bindTexture(gl.TEXTURE_2D,waterCaustTex[nf]);
      batT.add(FULLUV,MAP/2,MAP/2,MAP,MAP,0,255,255,255,(bl*205)|0);
      batT.flush();
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    }
  }
  gl.bindTexture(gl.TEXTURE_2D,atlasTex);
  // ambient life: drifting theme motes near the camera (leaves / embers / snow)
  if(perfScale>0.5&&zoomedIn&&running){
    for(let k2=0;k2<2;k2++) if(Math.random()<0.4){
      const mx2=rr(x0,x1), my2=rr(y0,y1);
      if(curTheme==='ashland') addParticle(0,mx2,my2,rr(-5,5),rr(-18,-9),1.5,2.6, 255,150,60);
      else if(curTheme==='arctic') addParticle(9,mx2,my2-30,rr(-8,8),rr(9,17),2.4,2.6, 240,248,255);
      else addParticle(9,mx2,my2-20,rr(-11,11),rr(5,12),2.6,3.0, 96,150,62);
    }
  }

  // ---- decals ----
  const sCrater=sprites.crater, sWreck=sprites.wreck, sRock=sprites.rock, sDep=sprites.dep,
        sTree=sprites.tree, sCry=sprites.crystal, sPx=sprites.px, sCloud=sprites.cloud;
  const selRing=sprites.ring, glow=sprites.glow;
  for(const c of craters){ if(c.x<x0||c.x>x1||c.y<y0||c.y>y1) continue;
    const civic=typeof cityGroundAt==='function' && cityGroundAt(c.x,c.y)>=1;
    if(civic){
      /* 3D civic scars live in the terrain paint (noisy burnt concrete).
         The atlas crater is a square cell with a circular dirt gradient —
         drawing it here cut a grass-tinted box into CITYG pavement. */
      if(use3D) continue;
      const hot=clamp(1-Math.max(0,(stats&&stats.t||0)-(c.ts||0))/42,0,1);
      batN.add(sCrater,c.x,c.y,c.s,c.s,c.a,(32+hot*70)|0,(32+hot*22)|0,(34-hot*8)|0,220);
      if(hot>0.14) batA.add(glow,c.x,c.y,c.s*0.72,c.s*0.72,0,255,110,36,(hot*78)|0);
    } else batN.add(sCrater,c.x,c.y,c.s,c.s,c.a,255,255,255,200); }
  for(const w of wrecks){ if(w.x<x0||w.x>x1||w.y<y0||w.y>y1) continue;
    /* A destroyed machine stains the ground beneath it before the salvage
       disappears. This is tactical history, not another particle pile: the
       scar cools from blast slag to soot using an existing batched decal. */
    const age=Math.max(0,(stats&&stats.t||0)-(w.ts||0)), hot=clamp(1-age/24,0,1);
    if(w.kind!==5) batN.add(sCrater,w.x,w.y,w.s*1.65,w.s*1.18,w.a,
      (42+hot*58)|0,(42+hot*22)|0,(46+hot*10)|0,92);
    if(hot>0.12&&w.kind!==5) batA.add(glow,w.x,w.y,w.s*1.25,w.s*1.25,0,255,92,34,(hot*34)|0);
    if(use3D) batU.add(UNIT_UV.wreck3[angFrame(w.a)%8],w.x,w.y,w.s*1.9,w.s*1.9,0,255,255,255,240);
    else batN.add(sWreck,w.x,w.y,w.s,w.s,w.a,255,255,255,235); }
  for(const rb of rubbles){ if(rb.x<x0||rb.x>x1||rb.y<y0||rb.y>y1) continue;
    const age=Math.max(0,(stats&&stats.t||0)-(rb.ts||0)), hot=clamp(1-age/18,0,1);
    batN.add(sCrater,rb.x,rb.y,rb.s*2.25,rb.s*1.55,rb.a,42,38,34,74);
    if(hot>0.12) batA.add(glow,rb.x,rb.y,rb.s*1.2,rb.s*1.2,0,255,95,34,(hot*28)|0);
    if(use3D) batU.add(UNIT_UV.rubble[0],rb.x,rb.y,rb.s*2.1,rb.s*2.1,rb.a,255,255,255,250);
    else batN.add(sWreck,rb.x,rb.y,rb.s,rb.s,rb.a,255,255,255,235); }
  // cloud shadows drift over ground
  for(let k=0;k<4;k++){
    const sp=[7,10,5,12][k], sz=[720,560,880,480][k];
    const cxx=((t*sp+k*730)%(MAP+1600))-800;
    const cyy=(k*690+t*sp*0.35)%MAP;
    if(cxx>x0-sz&&cxx<x1+sz&&cyy>y0-sz&&cyy<y1+sz)
      batN.add(sCloud,cxx,cyy,sz,sz*0.72,k*1.3,0,0,0,52);
  }
  for(const r of rocks){ if(r.x<x0||r.x>x1||r.y<y0||r.y>y1) continue;
    batN.add(sRock,r.x,r.y,r.s,r.s,r.a,255,255,255,255); }
  for(const d of deposits){
    if(d.x<x0||d.x>x1||d.y<y0||d.y>y1) continue;
    const tier=depositTier(d);
    const col=tier===3?[188,82,255]:tier===2?[58,225,150]:tier===1?[58,190,255]:[72,76,88];
    const fieldR=46+(d.initialTier||1)*8;
    /* 3D owns veins (terrain bake) and shards. 2D glow rects under every
       free node were the white disc + cyan rays on DEPLOY BASE. */
    if(!use3D){
      const pulse=.82+.18*Math.sin(t*2.1+(d.pulse||0));
      const seed=(d.pulse||0)+d.x*0.017+d.y*0.013;
      for(let k=0;k<5;k++){
        const a=seed+k*1.047;
        const len=fieldR*(0.52+((k*17)%9)*0.03)*pulse;
        batN.add(sPx,d.x+Math.cos(a)*len*0.5,d.y+Math.sin(a)*len*0.5,
          2.2,len,a,col[0],col[1],col[2],d.taken?(tier?70:28):(tier?110:48));
      }
      if(tier>0&&!d.taken){
        if(tier===3) batN.add(sprites.depR,d.x,d.y,51,51,0,col[0],col[1],col[2],255);
        else batN.add(sDep,d.x,d.y,42+tier*4,42+tier*4,0,col[0],col[1],col[2],255);
      }
    }
    if(tier>0&&perfScale>.45&&Math.random()<.018*tier)
      addParticle(0,d.x+rr(-fieldR*.55,fieldR*.55),d.y+rr(-fieldR*.42,fieldR*.42),rr(-3,3),rr(-12,-4),.55,3.5,col[0],col[1],col[2]);
  }
  for(const gz of geysers){
    if(gz.x<x0||gz.x>x1||gz.y<y0||gz.y>y1) continue;
    const gc=gz.taken?[95,118,125]:[105,235,255];
    if(!use3D){
      batN.add(glow,gz.x,gz.y,88,88,0,gc[0],gc[1],gc[2],gz.taken?28:86);
      batN.add(selRing,gz.x,gz.y,82,82,t*.26,gc[0],gc[1],gc[2],gz.taken?35:140);
      /* sprites.geyser is the metal iris (dark ellipses + 5 rim arcs + cyan
         hole). That stamp is the phone-shot hatch. 3D draws the vent. */
      batN.add(sprites.geyser,gz.x,gz.y,52,52,0,gc[0],gc[1],gc[2],255);
    }
    if(perfScale>0.4&&Math.random()<0.06)
      addParticle(1,gz.x+rr(-5,5),gz.y+rr(-4,4),rr(-2,2),rr(-17,-10),1.3,9, 165,225,250);
  }
  for(const cst of crystals){ if(cst.x<x0||cst.x>x1||cst.y<y0||cst.y>y1) continue;
    if(use3D) continue;
    const D=deposits[cst.dep],tier=depositTier(D);if(!D||cst.band>tier||D.taken)continue;
    const bandFill=clamp((D.remaining-(tier-1)*DEPOSIT_BAND)/DEPOSIT_BAND,0,1);
    const edge=cst.band===tier?(.42+.58*bandFill):1,pulse=.94+.08*Math.sin(t*1.45+(cst.phase||0));
    const s=cst.s*edge*pulse*(cst.core?1.42:1.18),col=cst.band===3?[220,112,255]:cst.band===2?[78,255,170]:[78,225,255];
    batN.add(glow,cst.x,cst.y,s*1.8,s*1.8,0,col[0],col[1],col[2],cst.core?78:55);
    batN.add(sCry,cst.x,cst.y,s,s*1.22,cst.a+Math.sin(t*.24+(cst.phase||0))*.035,col[0],col[1],col[2],255);
  }
  // ---- contact shadows for standing relief (drawn flat, on the ground) ----
  for(const M of relief){
    if(M.x<x0-60||M.x>x1+60||M.y<y0-60||M.y>y1+60) continue;
    batN.add(sprites.glow,M.x+M.lift*0.16,M.y+M.lift*0.20,M.w*2.6,M.w*1.6,0,0,0,0,66);
  }

  /* ---- structure pads -------------------------------------------------
     Every building sits on a poured slab: an oriented rectangle of hardstand
     with a drop shadow. This is what welds a structure to the terrain (rather
     than letting it hover), and it's the only place a building's FACING is
     visible from directly overhead, since the bodies themselves billboard. */
  for(const Bp of blds){
    if(!Bp.alive) continue;
    if(Bp.x<x0-90||Bp.x>x1+90||Bp.y<y0-90||Bp.y>y1+90) continue;
    if(!fogEntityVisible(Bp.team,Bp.x,Bp.y)) continue;
    const f=bldFoot(Bp), rt=Bp.rot||0, pad=1.22;
    const pw=f[0]*pad, ph=f[1]*pad;
    const tb=TEAMB[Bp.team]||TEAMB[2];
    batN.add(sPx,Bp.x+7,Bp.y+9,pw*1.04,ph*1.04,rt, 0,0,0, 90);      // cast shadow
    batN.add(sPx,Bp.x,Bp.y,pw,ph,rt, 74,76,80, 190);                 // concrete slab
    batN.add(sPx,Bp.x,Bp.y,pw*0.88,ph*0.88,rt, 92,95,100, 150);      // inner apron
    // team-coloured kerb edging, brighter while under construction
    const ka=Bp.prog<1? 90+Math.sin(t*7)*50 : 62;
    const kc=Math.cos(rt), ks=Math.sin(rt), hw=pw/2, hh=ph/2;
    const kerb=(ex,ey,w,h)=>batN.add(sPx,Bp.x+ex*kc-ey*ks,Bp.y+ex*ks+ey*kc,w,h,rt,tb[0],tb[1],tb[2],ka);
    kerb(0,-hh,pw,2.0); kerb(0,hh,pw,2.0); kerb(-hw,0,2.0,ph); kerb(hw,0,2.0,ph);
  }

  /* ---- curtain walls --------------------------------------------------
     The span between two linked barricades is drawn as its own piece of
     wall, so a run of segments becomes one continuous rampart instead of a
     dotted line of separate blocks. This is the visible payoff for laying
     walls in a line, and it's what makes the perimeter readable at a glance. */
  for(let wi=0;wi<blds.length;wi++){
    const W=blds[wi];
    if(!W.alive||(W.type!=='wall'&&W.type!=='gate')||!W.linkA||!W.linkA.length) continue;
    if(W.x<x0-90||W.x>x1+90||W.y<y0-90||W.y>y1+90) continue;
    if(!fogEntityVisible(W.team,W.x,W.y)) continue;
    const tb=TEAMB[W.team]||TEAMB[2];
    const hpf=W.hp/W.hpm;
    for(const la of W.linkA){
      if(Math.cos(la)<0 || (Math.abs(Math.cos(la))<1e-6 && Math.sin(la)<0)) continue;  // draw each span once
      const span=WALL_LINK*0.62;
      const mx2=W.x+Math.cos(la)*span*0.5, my2=W.y+Math.sin(la)*span*0.5;
      batN.add(sPx,mx2+4,my2+6,span,20,la, 0,0,0,80);                    // shadow
      batN.add(sPx,mx2,my2,span,16,la, 96,99,104, 235);                  // rampart body
      batN.add(sPx,mx2,my2,span,7,la, 128,132,138, 210);                 // top walkway
      batN.add(sPx,mx2,my2,span,2.4,la, tb[0]*hpf|0,tb[1]*hpf|0,tb[2]*hpf|0, 130);  // team stripe
    }
  }
  // ---- volatile fuel tanks ----
  for(const T of tanks){
    if(!T.alive||T.x<x0-60||T.x>x1+60||T.y<y0-60||T.y>y1+60) continue;
    batN.add(sprites.tankF,T.x,T.y,T.s,T.s,0,255,255,255,255);
    if(T.fuse>0){                                  // priming: blinking warning
      const bl=(Math.sin(t*26)*0.5+0.5);
      batA.add(sprites.glow,T.x,T.y,T.s*(1.4+bl*0.7),T.s*(1.4+bl*0.7),0,255,120,50,120+bl*120);
      batA.add(sprites.warn,T.x,T.y,T.s*2.4,T.s*2.4,t*2,255,90,60,150*bl);
    }
  }
  // ---- supply crates ----
  for(const C of crates){
    if(C.x<x0-70||C.x>x1+70||C.y<y0-70||C.y>y1+70) continue;
    if(!fogPointVisible(C.x,C.y)&&!C.seen) continue;
    const al=C.alt;
    const cc=C.kind&&C.kind.col||[255,225,140];
    batN.add(sprites.glow,C.x,C.y,44*(1+al/500),30*(1+al/500),0,0,0,0,Math.max(30,110-al*0.16));
    if(al>0){                                      // parachute-less pod: retro burn
      batA.add(sprites.glow,C.x,C.y-al*0.5+22,22,40,0,255,190,110,170);
    } else {
      const bob=Math.sin(t*2.4+C.x)*2;
      batA.add(sprites.glow,C.x,C.y+bob,74+Math.sin(t*3)*8,74+Math.sin(t*3)*8,0,cc[0],cc[1],cc[2],62);
      batA.add(selRing,C.x,C.y+bob,64+(C.kind&&C.kind.rarity||0)*5,64+(C.kind&&C.kind.rarity||0)*5,t*0.7,cc[0],cc[1],cc[2],145);
      const mark=C.kind&&C.kind.spr&&sprites[C.kind.spr];
      if(mark) batA.add(mark,C.x,C.y-31+bob,22,22,-t*.8,cc[0],cc[1],cc[2],235);
    }
    batN.add(sprites.crate,C.x,C.y-al*0.5+(al>0?0:Math.sin(t*2.4+C.x)*2),
      40+(C.kind&&C.kind.rarity||0)*3,40+(C.kind&&C.kind.rarity||0)*3,
      al>0?t*2.4:0,cc[0],cc[1],cc[2],255);
  }
  const tt=(typeof biomeKit==='function'&&biomeKit().treeTint)||THEMES[curTheme].treeTint;
  for(const tr of trees){ if(tr.x<x0||tr.x>x1||tr.y<y0||tr.y>y1) continue;
    batN.add(sTree,tr.x,tr.y,tr.s,tr.s,tr.a,tt[0],tt[1],tt[2],255); }

  batN.flush();                        // ground decals under structures
  BILLBOARD=1;                         // everything from here stands up in the world

  /* ---- standing relief -------------------------------------------------
     Berms and spoil heaps carry a `lift`, so they physically rise out of the
     ground plane. Tilt the camera and a crater now has a rim you look over
     rather than a ring of darker paint.                                   */
  {
    const gt=THEMES[curTheme].g2||[120,116,104];
    for(const M of relief){
      if(M.x<x0-60||M.x>x1+60||M.y<y0-60||M.y>y1+60) continue;
      const tn=M.tone;
      batN.add(sprites.rock, M.x, M.y, M.w*2, M.h, M.a,
        Math.min(255,gt[0]*tn*1.12)|0, Math.min(255,gt[1]*tn*1.06)|0, Math.min(255,gt[2]*tn)|0,
        255, M.lift);
    }
  }

  /* ---- derelict districts ----------------------------------------------
     Blocks are oriented rectangles standing on the ground, so a district
     reads as a laid-out city seen from above rather than scattered props.
     Damage leans them, fires them, and finally drops them into salvage.  */
  /* Kind 4 (intact civic block) has no sprite of its own in the 2D fallback
     path; the low-block art is the right shape for it. Without the entry the
     `||` below silently drew it as a tower. */
  const RSPR=['relicT','relicD','relicI','relicK','relicD'];
  for(let ri=0;ri<relics.length;ri++){
    const R=relics[ri];
    /* 3D owns civic hulls and wreck fire. The 2D relicT sprite is a flat
       red card, and the dead path used sprites.fireball at plot scale —
       that was the clean-pop / vehicle mushroom on a tower. */
    if(use3D) continue;
    if(!R.alive) continue;
    if(R.x<x0-110||R.x>x1+110||R.y<y0-110||R.y>y1+110) continue;
    const dmgT=R.hp/R.hpm;
    const sw=Math.max(R.w,R.h)*1.28;
    const lift=(R.kind===0?R.s*0.95 : R.kind===2?R.s*0.5 : R.s*0.38);
    const lean=(R.lean||0)*(R.kind===0?1:0.4);
    const flick=R.hitT>0?1.6:1;
    const tint=224+31*dmgT;                       // intact concrete is pale, damage darkens it
    batN.add(sprites[RSPR[R.kind]||'relicT'], R.x, R.y, sw, sw, lean,
      Math.min(255,tint*flick)|0, Math.min(255,(tint-8)*flick)|0, Math.min(255,(tint-18))|0, 255, lift);
    // damaged blocks smoulder; heavily damaged ones burn openly
    if(R.burn>0.18){
      const fa=R.burn*(0.6+Math.sin(t*3.1+ri)*0.4);
      batA.add(sprites.glow, R.x+Math.sin(t*0.7+ri)*4, R.y-R.s*0.34, R.s*0.5, R.s*0.6, 0,
        255, 150, 70, 90*fa);
      if(perfScale>0.5 && (tick+ri)%26===0)
        addParticle(1, R.x+rr(-R.w*0.3,R.w*0.3), R.y-R.s*0.2, rr(-4,4), rr(-16,-8), 1.6, R.s*0.22, 54,50,46);
    }
  }
  /* Dead civic blocks still burn on the 2D path — same reason as 3D. */
  for(let ri=0;ri<relics.length;ri++){
    const R=relics[ri];
    if(use3D) continue;
    if(R.alive) continue;
    const age=stats.t-(R.fallT||0);
    if(age>52||!(R.burn>0.18)) continue;
    if(R.x<x0-110||R.x>x1+110||R.y<y0-110||R.y>y1+110) continue;
    const heat=clamp(1-age/52,0,1)*R.burn;
    const fa=heat*(0.55+Math.sin(t*4.2+ri)*0.45);
    batA.add(sprites.flame||sprites.fireball||sprites.glow, R.x, R.y-R.s*0.12, R.s*0.7, R.s*0.9, -t*.5,
      255, 190, 90, 200*fa);
    batA.add(sprites.glow, R.x, R.y, R.s*1.1, R.s*1.1, 0, 255, 110, 40, 70*heat);
  }
  // ---- buildings ----
  const drawBld=(spr,x,y,sz,r,g,b,a)=>{
    const lift=sz*0.5;                 // structures rise out of the ground when tilted
    if(use3D&&UNIT_UV[spr]) batU.add(UNIT_UV[spr][0],x,y,sz*S3B,sz*S3B,0,r,g,b,a,lift);
    else batN.add(sprites[spr],x,y,sz,sz,0,r,g,b,a,lift);
  };
  for(let b=0;b<blds.length;b++){
    const Bd=blds[b]; if(!Bd.alive) continue;
    if(Bd.x<x0-50||Bd.x>x1+50||Bd.y<y0-50||Bd.y>y1+50) continue;
    if(!fogEntityVisible(Bd.team,Bd.x,Bd.y)) continue;
    const BTt=BT[Bd.type], tc=TEAMC[Bd.team];
    const sz=BTt.size;
    if(Bd.prog<1){
      drawBld(BTt.spr,Bd.x,Bd.y,sz,tc[0],tc[1],tc[2],90+Bd.prog*120);
      const sy=Bd.y+sz/2-Bd.prog*sz;
      batA.add(sPx,Bd.x,sy,sz,1.6,0,120,230,255,190);
      batN.add(sPx,Bd.x,Bd.y+sz*0.62,sz*0.9,3,0,10,14,18,220);
      batN.add(sPx,Bd.x-sz*0.45*(1-Bd.prog),Bd.y+sz*0.62,sz*0.9*Bd.prog,3,0,120,230,255,255);
    } else {
      /* ---- living structures ------------------------------------------
         Nothing in a working base should be a static decal. Each building
         moves in the way its JOB implies: extractors piston, reactors pulse,
         factories throb harder while producing, radar sweeps, silos vent,
         fabricators burn. It's a small per-frame cost and it's the single
         biggest thing separating "placed sprite" from "running machine". */
      const an=t*1.6+Bd.anim;
      let bob=0, sq=1, tint=1;
      switch(Bd.type){
        case 'mex':  bob=Math.sin(an*2.6)*sz*0.045; sq=1+Math.sin(an*2.6)*0.035; break;  // pumpjack stroke
        case 'pgen': case 'geo': sq=1+Math.sin(an*1.7)*0.022; tint=1+Math.sin(an*1.7)*0.07; break;
        case 'fac': case 'tgate': case 'airfield': case 'harbor':
          { const busy=Bd.queue.length?1:0.35;
            bob=Math.sin(an*(3.4*busy+1))*sz*0.028*busy; sq=1+Math.sin(an*4.2)*0.02*busy; } break;
        case 'techlab': sq=1+Math.sin(an*2.2)*0.03; tint=1+Math.sin(an*3.1)*0.05; break;
        case 'fab':  sq=1+Math.abs(Math.sin(an*5.2))*0.05; tint=1.06+Math.sin(an*5.2)*0.09; break;
        case 'silo': bob=Math.sin(an*1.1)*sz*0.016; break;
        case 'sgen': sq=1+Math.sin(an*2.0)*0.05; break;
        case 'nova': sq=1+Math.sin(an*0.9)*0.02; break;
        case 'nest': bob=Math.sin(an*1.9)*sz*0.05; sq=1+Math.sin(an*3.7)*0.06; break;   // it breathes
        case 'hq':   bob=Math.sin(an*0.8)*sz*0.012; break;
      }
      if(Bd.hitT>0){ tint=1.5; bob+=Math.sin(t*60)*2.2; }        // flinch on impact
      const asz=sz*sq;
      drawBld(BTt.spr,Bd.x,Bd.y+bob,asz,
        Math.min(255,tc[0]*tint)|0, Math.min(255,tc[1]*tint)|0, Math.min(255,tc[2]*tint)|0, 255);
      // ---- purpose-specific moving parts ----
      if(Bd.type==='mex'){                       // drill head rising and falling
        const st=(Math.sin(an*2.6)*0.5+0.5);
        batN.add(sPx,Bd.x,Bd.y-sz*0.30-st*sz*0.16,sz*0.14,sz*0.34,0, 150,156,164,255, sz*0.62);
        if((tick+b)%34===0) addParticle(1,Bd.x,Bd.y-sz*0.1,rr(-3,3),rr(-9,-4),.7,3.2, 96,88,78);
      }
      if(Bd.type==='pgen'||Bd.type==='geo'){     // coolant vent, on a slow beat
        const v=(Math.sin(an*1.7)*0.5+0.5);
        batA.add(glow,Bd.x,Bd.y-sz*0.42,sz*(0.22+v*0.2),sz*(0.3+v*0.34),0,
          Bd.type==='geo'?90:180, Bd.type==='geo'?230:210, 255, 40+v*60);
      }
      if(Bd.type==='techlab'){                   // radar dish sweeping the sky
        const sw=an*0.9;
        batA.add(sprites.beam,Bd.x+Math.cos(sw)*sz*0.5,Bd.y+Math.sin(sw)*sz*0.5*0.5,
          2.2,sz*1.0,sw+Math.PI/2, 120,210,255, 70);
      }
      if(Bd.type==='fab'){                       // burner flare, irregular like real flame
        const fl=0.55+Math.abs(Math.sin(an*5.2))*0.45+Math.random()*0.1;
        batA.add(glow,Bd.x+sz*0.02,Bd.y-sz*0.5,sz*0.26*fl,sz*0.5*fl,0,255,170,70,150*fl);
        if((tick+b)%12===0) addParticle(1,Bd.x,Bd.y-sz*0.55,rr(-3,3),rr(-22,-12),.9,4, 70,64,58);
      }
      if((Bd.type==='fac'||Bd.type==='tgate'||Bd.type==='airfield')&&Bd.queue.length){
        const dr=(Math.sin(an*3.4)*0.5+0.5);     // bay door cycling open and shut
        batA.add(sPx,Bd.x,Bd.y+sz*0.34,sz*0.56,sz*0.09*(0.3+dr),0, 255,190,90, 110+dr*90);
      }
      if(Bd.type==='silo'){                      // pressure relief puff
        if((tick+b)%70===0) addParticle(2,Bd.x+sz*0.2,Bd.y-sz*0.34,rr(-4,4),rr(-14,-8),.8,7, 190,200,210);
      }
      if(Bd.type==='aatower'||Bd.type==='hellstorm'){   // idle scan sweep
        const sw=Math.sin(an*0.7)*0.9;
        batA.add(sPx,Bd.x,Bd.y-sz*0.2,1.6,sz*0.5,sw, 255,220,150, 46);
      }
      // visual upgrade add-ons (baked 3D parts, not tints)
      if(use3D){
        if(Bd.type==='mex'&&Bd.lvl>=2) batU.add(UNIT_UV.mexUp[0],Bd.x,Bd.y,sz*S3B,sz*S3B,0,tc[0],tc[1],tc[2],255);
        if(Bd.type==='pgen'&&Bd.lvl>=2) batU.add(UNIT_UV.pgenUp[0],Bd.x,Bd.y,sz*S3B,sz*S3B,0,tc[0],tc[1],tc[2],255);
        if(Bd.type==='fac'&&Bd.tier===2) batU.add(UNIT_UV.facUp[0],Bd.x,Bd.y,sz*S3B,sz*S3B,0,tc[0],tc[1],tc[2],255);
        if(Bd.type==='aatower'&&Bd.lvl>=2) batU.add(UNIT_UV.aaUp[0],Bd.x,Bd.y,sz*S3B,sz*S3B,0,tc[0],tc[1],tc[2],255);
      }
      if(Bd.type==='turret'){
        if(use3D){
          const gunUV=Bd.lvl>=3?UNIT_UV.turTg3:Bd.lvl===2?UNIT_UV.turTg2:UNIT_UV.turTg;
          batU.add(gunUV[angFrame(Bd.tang+camYaw)],Bd.x,Bd.y,sz*S3B,sz*S3B,0,tc[0],tc[1],tc[2],255);
        }
        else batN.add(sprites.turT,Bd.x,Bd.y,sz,sz,Bd.tang,tc[0],tc[1],tc[2],255);
      }
      if(Bd.type==='bastion'&&use3D){
        const rec=Math.max(0,Bd.cool/BASTION.cool-0.75)/0.25 * sz*0.1;
        const ba=Bd.tang-Math.PI/2;
        batU.add(UNIT_UV.towerT[angFrame(Bd.tang+camYaw)],Bd.x-Math.cos(ba)*rec,Bd.y-Math.sin(ba)*rec,sz*S3B,sz*S3B,0,tc[0],tc[1],tc[2],255);
      }
      if(Bd.type==='fac'&&Bd.tier===2) batA.add(sPx,Bd.x,Bd.y-sz*0.46,sz*0.94,2.6,0,255,210,87,210);
      if(Bd.lvl>1) for(let L=0;L<Bd.lvl-1;L++)
        batA.add(sprites.glow,Bd.x+sz*0.42-L*7,Bd.y-sz*0.42,6,6,0,255,210,87,220);   // Mk pips
      if(Bd.upT>0){
        const pr=1-Bd.upT/(Bd.upMax||1);
        batN.add(sPx,Bd.x,Bd.y+sz*0.62,sz*0.9,3,0,10,14,18,220);
        batN.add(sPx,Bd.x-sz*0.45*(1-pr),Bd.y+sz*0.62,sz*0.9*pr,3,0,255,210,87,255);
      }
      if(Bd.type==='geo')                    // geothermal: cyan vent glow distinguishes from Reactor
        batA.add(sprites.glow,Bd.x,Bd.y,sz*0.85+Math.sin(t*3.2+b)*5,sz*0.85,0,80,220,255,64);
      if(Bd.type==='nova'){                  // superweapon charge state
        if(Bd.cool<=0){
          batA.add(sprites.glow,Bd.x,Bd.y,sz*(0.9+Math.sin(t*4)*0.12),sz*(0.9+Math.sin(t*4)*0.12),0,255,210,90,110);
          batA.add(selRing,Bd.x,Bd.y,sz*1.5,sz*1.5,t*0.5,255,210,90,70);
        } else {
          const pr2=1-Bd.cool/NOVA.cd;
          batN.add(sPx,Bd.x,Bd.y+sz*0.62,sz*0.9,3,0,10,14,18,220);
          batN.add(sPx,Bd.x-sz*0.45*(1-pr2),Bd.y+sz*0.62,sz*0.9*pr2,3,0,255,210,87,255);
        }
      }
      if(Bd.type==='arc'&&(tick&15)<3)       // idle coil crackle
        batA.add(sprites.glow,Bd.x,Bd.y-sz*0.32,9,9,0,150,230,255,150);
      if(Bd.type==='gate'){                  // energy gate stripe: friendly-pass indicator
        const tb2=TEAMB[Bd.team];
        batA.add(sPx,Bd.x,Bd.y,sz*0.86,3.4,0,tb2[0],tb2[1],tb2[2],120+Math.sin(t*5+b)*60);
      }
      if(zoomedIn&&Bd.adjL&&Bd.adjL.length&&Bd.team===0){  // adjacency feed lines
        for(const o2 of Bd.adjL){
          const O=blds[o2]; if(!O||!O.alive) continue;
          batA.add(sprites.beam,(Bd.x+O.x)/2,(Bd.y+O.y)/2,1.8,Math.hypot(O.x-Bd.x,O.y-Bd.y)*0.82,
            Math.atan2(O.y-Bd.y,O.x-Bd.x)+Math.PI/2,255,220,110,34+Math.sin(t*4+o2)*14);
        }
      }
      if(Bd.type==='techlab'){
        batA.add(sprites.glow,Bd.x,Bd.y-sz*0.1,sz*0.5+Math.sin(t*2.6+b)*4,sz*0.5,0,120,200,255,36);
        if(Bd.res>=0){
          const pr=Bd.resT/RESEARCH[Bd.res].t;
          batN.add(sPx,Bd.x,Bd.y+sz*0.62,sz*0.9,3,0,10,14,18,220);
          batN.add(sPx,Bd.x-sz*0.45*(1-pr),Bd.y+sz*0.62,sz*0.9*pr,3,0,120,210,255,255);
        }
      }
      if(Bd.type==='uplink'){
        batA.add(sprites.ring,Bd.x,Bd.y,UPLINK_R*2,UPLINK_R*2,t*0.3,90,200,255,20);
        batA.add(sprites.glow,Bd.x,Bd.y-sz*0.55,8+Math.sin(t*5+b)*3,8,0,120,220,255,160);
        // energy links to boosted towers
        for(const T2 of blds){
          if(!T2.alive||T2.team!==Bd.team||!(T2.boost>0)) continue;
          if(dist2(Bd.x,Bd.y,T2.x,T2.y)>UPLINK_R*UPLINK_R) continue;
          const mx2=(Bd.x+T2.x)/2, my2=(Bd.y+T2.y)/2;
          const len=Math.sqrt(dist2(Bd.x,Bd.y,T2.x,T2.y));
          batA.add(sPx,mx2,my2,1.4,len,Math.atan2(T2.y-Bd.y,T2.x-Bd.x)+Math.PI/2,90,200,255,60+Math.sin(t*6)*30);
        }
      }
      if(Bd.boost>0) batA.add(sprites.glow,Bd.x,Bd.y-sz*0.5,7,7,0,90,200,255,150);
      if(nAmt>0.25&&Bd.team!==2){
        const fl=(t*3+b)%1>0.9?0.4:1;                                            // occasional flicker
        batA.add(sprites.glow,Bd.x+sz*0.3,Bd.y-sz*0.18,9,9,0,255,220,150,200*nAmt*fl);
        batA.add(sprites.glow,Bd.x-sz*0.26,Bd.y+sz*0.2,7,7,0,170,215,255,170*nAmt);
        /* Area work-light (sz*2.1 warm pool) retired with the 3D night
           billboard — it read as an orange orb on HQ/factory. Window and
           pad-lamp points above stay. */
      }
      if((Bd.type==='fac'||Bd.type==='tgate')&&Bd.queue.length){
        batN.add(sPx,Bd.x,Bd.y+sz*0.62,sz*0.9,3,0,10,14,18,220);
        const pr=Bd.prodT/TYPES[Bd.queue[0]].bt;
        batN.add(sPx,Bd.x-sz*0.45*(1-pr),Bd.y+sz*0.62,sz*0.9*pr,3,0,93,255,154,255);
      }
      /* Health is permanent battlefield information, not a damage alert.
         These bars stay in the existing batched sprite pass so showing every
         visible structure does not add a draw call per object. */
      const bFrac=clamp(Bd.hp/Bd.hpm,0,1);
      batN.add(sPx,Bd.x,Bd.y-sz*0.66,sz*0.9,3.4,0,10,14,18,220);
       batN.add(sPx,Bd.x-sz*0.45*(1-bFrac),Bd.y-sz*0.66,sz*0.9*bFrac,3.4,0,
         bFrac>0.5?93:255, bFrac>0.5?255:120, bFrac>0.25?90:60, 255);
       /* Structure rank uses tiny gold diamonds instead of another text label.
          It remains readable at command zoom, identifies a hardened Mk2/Mk3
          tower at a glance, and costs only two or three batched quads. */
       const bLvl=Bd.type==='fac'?(Bd.tier===2?2:1):(Bd.lvl||1);
       if(bLvl>1){
         const ry=Bd.y-sz*0.92, pips=bLvl;
         for(let rp=0;rp<pips;rp++){
           const rx=Bd.x+(rp-(pips-1)*.5)*5.4;
           batN.add(sPx,rx,ry,4.2,4.2,Math.PI*.25,255,210,87,235);
         }
         batA.add(sprites.glow,Bd.x,ry,9+pips*3,7,0,255,210,87,46);
       }
       // animated working parts
      if(Bd.type==='mex'&&!use3D) batN.add(sprites.rotor,Bd.x,Bd.y-sz*0.09,sz*0.5,sz*0.5,t*2.4+b,255,255,255,235);
      if(Bd.type==='pgen') batA.add(sprites.glow,Bd.x,Bd.y-sz*0.04,sz*0.7+Math.sin(t*3.2+b)*4,sz*0.7+Math.sin(t*3.2+b)*4,0,255,205,90,44);
      if(Bd.type==='sgen'){
        batA.add(sprites.ring,Bd.x,Bd.y,240,240,t*0.4,80,220,160,26);
        batN.add(sprites.dish,Bd.x,Bd.y-sz*0.14,sz*0.62,sz*0.62,t*0.9+b,tc[0],tc[1],tc[2],255);
      }
      if(Bd.type==='fac'){
        const blink=(t*2+b)%1>0.5?200:60;
        batA.add(sprites.glow,Bd.x-sz*0.36,Bd.y-sz*0.1,5,5,0,120,230,255,blink);
        batA.add(sprites.glow,Bd.x+sz*0.36,Bd.y-sz*0.1,5,5,0,120,230,255,260-blink);
      }
      if(Bd.type==='nest') batA.add(sprites.glow,Bd.x,Bd.y+sz*0.05,sz*0.5+Math.sin(t*2+b)*5,sz*0.4,0,255,150,60,40);
      if(Bd.type==='tgate') batA.add(sprites.glow,Bd.x,Bd.y,sz*1.2,sz*1.2,0,90,180,255,30+Math.sin(t*3)*14);
    }
    if(openBld===b) batA.add(sprites.ring,Bd.x,Bd.y,sz*1.5,sz*1.5,0,120,230,255,150);
  }
  // ---- units ----  (bodies → batU; bars/overlays stay in batN, flushed above)
  let nAir=0;
  const FAC_LOOK=(typeof FACTIONS!=='undefined'&&AI&&FACTIONS[AI.fac])?FACTIONS[AI.fac]:null;
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]) continue;
    const X=ux[i], Y=uy[i];
    if(X<x0||X>x1||Y<y0||Y>y1) continue;
    if(!fogEntityVisible(uteam[i],X,Y)) continue;
    const T=TYPES[utype[i]];
    if(T.air){ if(nAir<12000) airTmp[nAir++]=i; continue; }
    const tc=TEAMC[uteam[i]];
    if(usel[i]) batA.add(selRing,X,Y,T.size*1.6,T.size*1.6,0,60,220,140,170);
    if(ubuff[i]>0) batA.add(glow,X,Y,T.size*1.9,T.size*1.9,0,255,210,60,40);
    if(typeof uclassBuffT!=='undefined'&&uclassBuffT[i]>0){
      const cc=uclassBuff[i]===1?[255,112,54]:uclassBuff[i]===2?[75,225,255]:[82,255,164];
      batA.add(selRing,X,Y,T.size*2.05,T.size*2.05,t*(uclassBuff[i]===2?1.8:.65),cc[0],cc[1],cc[2],120);
      batA.add(glow,X,Y,T.size*1.65,T.size*1.65,0,cc[0],cc[1],cc[2],34);
    }
    if(typeof ubroodLed!=='undefined'&&ubroodLed[i]>0){
      batA.add(selRing,X,Y,T.size*1.65,T.size*1.65,t*.72+i*.17,176,92,255,T.caster?155:54);
      if(T.caster){
        batA.add(selRing,X,Y,T.size*2.75,T.size*2.75,-t*.38,116,255,105,128);
        batA.add(glow,X,Y-T.size*.24,T.size*2.25,T.size*2.25,0,178,82,255,64+Math.sin(t*4+i)*24);
      }
    }
    // organic sway for walkers & beasts
    let bodyRot=uang[i];
    if(T.wk==='m'||utype[i]===0||utype[i]===8||utype[i]===11) bodyRot+=Math.sin(t*8+i*1.7)*0.045;
    const rec=T.tur? Math.max(0,(ucool[i]/T.cool)-0.7)/0.3 * T.size*0.09 : 0;
    const ta2=uturr[i]-Math.PI/2;
    // --- silhouette shaping: factions read differently at a glance ---
    let sw=T.size*S3D, sh=T.size*S3D;
    if(uteam[i]===1&&FAC_LOOK){
      sw*=FAC_LOOK.scale*(FAC_LOOK.squash>1?1/FAC_LOOK.squash:1);
      sh*=FAC_LOOK.scale*(FAC_LOOK.squash>1?FAC_LOOK.squash:1);
      if(FAC_LOOK.tilt) bodyRot+=FAC_LOOK.tilt;
      if(FAC_LOOK.glowA&&(i&1)===0)
        batA.add(glow,X,Y,T.size*2.0,T.size*2.0,0,FAC_LOOK.glow[0],FAC_LOOK.glow[1],FAC_LOOK.glow[2],FAC_LOOK.glowA);
    }
    else if(uteam[i]===2){
      // --- ALIEN BIOLOGY: nothing about a bug should look machined ---
      const ph=i*2.399;                                   // per-creature phase
      const breathe=1+Math.sin(t*6.2+ph)*0.11;            // thorax expansion
      const scuttle=umov[i]?Math.sin(t*17+ph)*0.16:Math.sin(t*2.4+ph)*0.045;
      const lurch=umov[i]?Math.abs(Math.sin(t*8.5+ph))*0.13:0;
      sw*=breathe*(1+lurch*0.4)*BUG_SIZE[i%8];
      sh*=(2-breathe)*(1+lurch)*BUG_SIZE[(i>>3)%8];
      bodyRot+=scuttle;
    }
    // GHOST stance: silent running renders the hull as a shimmer, not a solid
    const bodyA = umode[i]===4 ? (uteam[i]===0?96:60) : 255;
    if(use3D&&UNIT_UV[T.spr]){
      // baked walk cycle: alternate stride frames while moving
      let uvBody=UNIT_UV[T.spr];
      if(umov[i]){
        if(utype[i]===0){ if(((t*5.5+i*0.37)|0)&1) uvBody=UNIT_UV.botW||uvBody; }
        else if(utype[i]===12||utype[i]===13){ if(((t*6.5+i*0.37)|0)&1) uvBody=UNIT_UV.ravW||uvBody; }
      }
      batU.add(uvBody[angFrame(bodyRot+camYaw)],X,Y,sw,sh,bodyRot-uang[i],tc[0],tc[1],tc[2],bodyA,T.size*0.35);
      if(T.tur) batU.add(UNIT_UV[T.tur][angFrame(uturr[i]+camYaw)],X-Math.cos(ta2)*rec,Y-Math.sin(ta2)*rec,sw,sh,0,tc[0],tc[1],tc[2],bodyA,T.size*0.45);
    } else {
      batN.add(sprites[T.spr],X,Y,T.size,T.size,bodyRot,tc[0],tc[1],tc[2],bodyA);
      if(T.tur) batN.add(sprites[T.tur],X-Math.cos(ta2)*rec,Y-Math.sin(ta2)*rec,T.size,T.size,uturr[i],tc[0],tc[1],tc[2],bodyA);
    }
    if(uteam[i]===2&&zoomedIn&&(i&3)===0)                 // wet chitin sheen
      batA.add(glow,X,Y-T.size*0.2,T.size*0.9,T.size*0.7,0,150,220,110,26);
    if(utype[i]===11){  // Bulwark shield dome
      batA.add(sprites.bubble,X,Y,SHIELD_R*2,SHIELD_R*2,t*0.5,120,215,255,55);
    }
    if(nAmt>0.25&&umov[i]&&!T.naval&&(i&1)===0&&perfScale>0.5&&uteam[i]!==2){
      const ha=uang[i]-Math.PI/2;
      batA.add(glow,X+Math.cos(ha)*T.size*1.05,Y+Math.sin(ha)*T.size*1.05,T.size*2.2,T.size*2.2,0,255,240,190,42*nAmt);
    }
    if(i===heroIdx||isEnemyCommander(i)||utype[i]===8){
      batA.add(glow,X,Y,T.size*2.1,T.size*2.1,0,
        uteam[i]?255:90, uteam[i]?120:200, uteam[i]?80:255, 34);
    }
    const uFrac=clamp(uhp[i]/uhpm[i],0,1), uBarW=T.size*1.15;
    batN.add(sPx,X,Y-T.size*0.85,uBarW,2.6,0,8,12,16,200);
    batN.add(sPx,X-uBarW/2*(1-uFrac),Y-T.size*0.85,uBarW*uFrac,2.6,0,
      uFrac>0.5?93:255, uFrac>0.5?255:130, uFrac>0.25?90:60, 255);
    /* VETERAN BADGE. A gold star floats over the hull rather than a text label:
       levels add spike length, not count, so a three-star vet stays legible at
       command zoom. Drawn as five radiating slivers because there is no star
       sprite in the sheet and a synthetic glyph is one batN batch line each. */
    if(uvet[i]>0){
      const sy=Y-T.size*1.06, sp2=3.2+uvet[i]*0.9, pulse=1+Math.sin(t*6+i)*0.14;
      for(let k2=0;k2<5;k2++){
        const a2=-Math.PI/2+k2*TAU/5;
        batN.add(sPx,X+Math.cos(a2)*sp2*pulse,sy+Math.sin(a2)*sp2*pulse,2.6,sp2*2.2*pulse,a2,255,210,87,225);
      }
      batA.add(glow,X,sy,9+uvet[i]*2.5,9+uvet[i]*2.5,0,255,210,87,80);
    }
    /* ---- stance tells -------------------------------------------------
       A mode has to be legible from across the battlefield without reading
       any UI: siege drops ground anchors, guard raises a plated dome,
       overdrive glows hot, ghost goes translucent, suppress throws muzzle
       haze. You should be able to tell what a line is doing at a glance. */
    const mo=umode[i];
    if(mo){
      const dep=umodeT[i]>0 ? 1-umodeT[i]/MODE_SWITCH : 1;    // animate the transition in
      if(mo===1){                                             // SIEGE: braced spades
        const sp=T.size*(0.8+dep*0.5);
        batN.add(sPx,X,Y,sp*2.1,sp*0.5,uang[i], 92,96,102, 200*dep);
        batN.add(sPx,X,Y,sp*0.5,sp*2.1,uang[i], 92,96,102, 200*dep);
        batA.add(selRing,X,Y,T.size*2.5,T.size*2.5,0, 255,200,110, 60*dep);
      } else if(mo===2){                                      // GUARD: plated shell
        batA.add(glow,X,Y-T.size*0.1,T.size*1.9*dep,T.size*1.6*dep,0, 130,190,255, 60*dep);
        batA.add(selRing,X,Y,T.size*2.0*dep,T.size*2.0*dep,t*0.4, 150,205,255, 110*dep);
      } else if(mo===3){                                      // OVERDRIVE: running hot
        batA.add(glow,X,Y,T.size*1.6,T.size*1.6,0, 255,120,50, (70+Math.sin(t*11+i)*38)*dep);
      } else if(mo===5){                                      // SUPPRESS: muzzle haze
        const ha=(T.tur?uturr[i]:uang[i])-Math.PI/2;
        batA.add(glow,X+Math.cos(ha)*T.size*0.8,Y+Math.sin(ha)*T.size*0.8,
          T.size*1.3,T.size*1.3,0, 255,190,110, 54*dep);
      } else if(mo===6){                                      // ASSIST: logistics lock
        batA.add(selRing,X,Y,T.size*2.1,T.size*2.1,t*.7,72,225,255,120*dep);
      } else if(mo===7){                                      // SURVEY: scanning wave
        const scan=1+((t*.55+i*.13)%1)*1.8;
        batA.add(selRing,X,Y,T.size*scan,T.size*scan,-t*.35,100,255,185,(125/scan)*dep);
      }
    }
  }
  // air pass
  for(let k=0;k<nAir;k++){
    const i=airTmp[k], T=TYPES[utype[i]], tc=TEAMC[uteam[i]];
    const bob=Math.sin(t*3+i)*1.5;
    if(usel[i]) batA.add(selRing,ux[i],uy[i],T.size*1.6,T.size*1.6,0,60,220,140,170);
    if(typeof uclassBuffT!=='undefined'&&uclassBuffT[i]>0){
      const cc=uclassBuff[i]===2?[75,225,255]:[255,112,54];
      batA.add(selRing,ux[i],uy[i],T.size*2.25,T.size*2.25,t*1.8,cc[0],cc[1],cc[2],135);
    }
    if(use3D&&UNIT_UV[T.spr]){
      batU.add(UNIT_UV[T.spr][angFrame(uang[i]+camYaw)],ux[i],uy[i]-7+bob,T.size*S3D,T.size*S3D,0,tc[0],tc[1],tc[2],255,52);
    } else {
      batN.add(sprites.px,ux[i]+4,uy[i]+9,T.size*0.7,T.size*0.35,uang[i],0,0,0,60);
      batN.add(sprites[T.spr],ux[i],uy[i]-7+bob,T.size,T.size,uang[i],tc[0],tc[1],tc[2],255);
    }
    batA.add(glow,ux[i]-Math.sin(uang[i])*T.size*0.5,uy[i]-7+bob+Math.cos(uang[i])*T.size*0.5,5,5,0,140,220,255,120);
    const aFrac=clamp(uhp[i]/uhpm[i],0,1), aBarW=T.size*1.15;
    batN.add(sPx,ux[i],uy[i]-T.size*1.1,aBarW,2.6,0,8,12,16,200);
    batN.add(sPx,ux[i]-aBarW/2*(1-aFrac),uy[i]-T.size*1.1,aBarW*aFrac,2.6,0,
      aFrac>0.5?93:255,aFrac>0.5?255:130,aFrac>0.25?90:60,255);
  }

  // ---- rally flags (player production buildings) ----
  for(const Bd of blds){
    if(!Bd.alive||Bd.team!==0||!Bd.rally) continue;
    const R2=Bd.rally;
    if(R2.x<x0-30||R2.x>x1+30||R2.y<y0-30||R2.y>y1+30) continue;
    batN.add(sPx,R2.x,R2.y-10,2,20,0,235,242,250,225);                       // pole
    const wave=Math.sin(t*5+R2.x)*1.5;
    batN.add(sPx,R2.x+6,R2.y-15+wave*0.3,10,6,wave*0.05,TEAMC[0][0],TEAMC[0][1],TEAMC[0][2],240);  // pennant
    batA.add(sprites.glow,R2.x,R2.y,16,8,0,120,255,170,60+Math.sin(t*4)*25);
    if(openBld>=0&&blds[openBld]===Bd)                                       // path hint while menu open
      batA.add(sprites.beam,(Bd.x+R2.x)/2,(Bd.y+R2.y)/2,3,Math.hypot(R2.x-Bd.x,R2.y-Bd.y),
        Math.atan2(R2.y-Bd.y,R2.x-Bd.x)+Math.PI/2,120,255,170,46);
  }
  // ---- formation hologram + multi-waypoint patrol routes ----
  const showOrderPaths=!(META&&META.settings&&META.settings.orderPaths===false);
  const drawTacRoute=(pts,closed,draft,activeStep)=>{
    if(!pts||pts.length<2)return;
    const cr=draft?[90,225,255]:[105,255,175], segs=closed?pts.length:pts.length-1;
    for(let j=0;j<segs;j++){
      const A=pts[j],B=pts[(j+1)%pts.length],dx=B.x-A.x,dy=B.y-A.y,len=Math.hypot(dx,dy);
      if(len<4)continue;
      const active=activeStep!=null&&(j+1)%pts.length===activeStep;
      const lc=active?[255,205,90]:cr;
      /* Animated dashes, not a solid beam. The phase marches the gaps along the
         route at a constant world speed (independent of zoom or frame rate), so
         which way the platoon is walking reads even when the camera is far out.
         The active leg is drawn solid so "where the platoon is going next" and
         "where it has been" are distinguishable at a glance. */
      if(active){
        batA.add(sprites.beam,(A.x+B.x)/2,(A.y+B.y)/2,4.2,len,
          Math.atan2(dy,dx)+Math.PI/2,lc[0],lc[1],lc[2],105);
      } else {
        const step=draft?22:20, dashLen=draft?15:13, ang=Math.atan2(dy,dx)+Math.PI/2;
        const off=(t*30)%step;
        for(let d=off-step;d<len;d+=step){
          const d0=Math.max(0,d),d1=Math.min(len,d+dashLen);
          if(d1-d0<2)continue;
          batA.add(sprites.beam,A.x+dx*((d0+d1)/2)/len,A.y+dy*((d0+d1)/2)/len,
            draft?3.1:2.4,d1-d0,ang,lc[0],lc[1],lc[2],draft?74:50);
        }
      }
      /* Three moving light packets make route direction readable even when the
         camera is too far out to distinguish a tiny arrowhead. */
      for(let q=0;q<3;q++){
        const f=(t*.32+q/3+j*.11)%1;
        const sz=active?11:(draft?9:7);
        batA.add(sprites.glow,A.x+dx*f,A.y+dy*f,sz,sz,0,lc[0],lc[1],lc[2],active?210:(draft?180:125));
      }
    }
    for(let j=0;j<pts.length;j++){
      const P=pts[j],active=j===activeStep,pulse=(active?25:18)+Math.sin(t*4+j)*(active?5:3),pc=active?[255,205,90]:cr;
      batA.add(selRing,P.x,P.y,pulse,pulse,t*.35,pc[0],pc[1],pc[2],active?230:(draft?180:125));
      batA.add(sprites.glow,P.x,P.y,active?17:11,active?17:11,0,pc[0],pc[1],pc[2],active?220:150);
      /* Small rank pips identify waypoint order without screen-space text. */
      const marks=Math.min(5,Math.max(1,j));
      for(let q=0;q<marks;q++)batN.add(sPx,P.x+(q-(marks-1)/2)*4.5,P.y-9,2.4,5,0,225,250,255,220);
    }
  };
  if(showOrderPaths){
    const seen={};
    for(let i=0;i<unitHigh;i++){
      if(!ualive[i]||!usel[i]||ustate[i]!==5)continue;
      const ri=uPatrolRoute[i],R=ri>=0?patrolRoutes[ri]:null;
      if(R&&R.pts&&!seen[ri]){
        seen[ri]=1;drawTacRoute(R.pts,true,false,R.step);
        /* Preview the active formation row in-world. Sampling caps the draw
           cost for huge platoons while keeping the spacing/turn intent clear. */
        const row=R.targets&&R.targets[R.step];
        if(row){
          const stride=Math.max(1,Math.ceil(row.length/36));
          for(let k=0;k<row.length;k+=stride){
            const P=row[k],sz=12+Math.sin(t*4+k*.2)*1.5;
            batA.add(selRing,P.x,P.y,sz,sz,t*.45+k*.07,255,210,100,145);
          }
        }
        continue;
      }
      if(ri>=0)continue;
      const dx2=upx2[i]-upx1[i],dy2=upy2[i]-upy1[i],len=Math.hypot(dx2,dy2);
      if(len>=10)drawTacRoute([{x:upx1[i],y:upy1[i]},{x:upx2[i],y:upy2[i]}],true,false);
    }
    if(patrolDraft)drawTacRoute(patrolDraft.pts,patrolDraft.pts.length>2,true);
  }
  const confirmLive=orderConfirm&&performance.now()<orderConfirm.until;
  if(orderConfirm&&!confirmLive)orderConfirm=null;
  const formationDisplay=orderPreview||(confirmLive?orderConfirm:null);
  if(formationDisplay&&!(META&&META.settings&&META.settings.formationPreview===false)){
    const fade=orderPreview?1:clamp((formationDisplay.until-performance.now())/950,0,1);
    const members=formationDisplay.members,F=FORMS[formationDisplay.form]||FORMS[0];
    /* Same 36-ghost cap as patrol. Do not call formationTargets on the full
       selection here — that rebuilt 1000 stands every sprite frame. */
    const slots=typeof formationPreviewSlots==='function'
      ?formationPreviewSlots(formationDisplay,members,F.id)
      :[];
    const n=members.length, stride=Math.max(1,Math.ceil(n/36));
    let cx2=0,cy2=0,cn=0;
    for(let k=0;k<n;k+=stride){
      const i=members[k]; if(!(ualive[i]&&usel[i])) continue;
      cx2+=ux[i]; cy2+=uy[i]; cn++;
    }
    if(cn){cx2/=cn;cy2/=cn;}
    const fa=Math.atan2(formationDisplay.y-cy2,formationDisplay.x-cx2);
    /* noLine: tap-move confirms route through orderfx's traced path; a straight
       beam here would disagree with it whenever the field bends. */
    if(!formationDisplay.noLine)
      batA.add(sprites.beam,(cx2+formationDisplay.x)/2,(cy2+formationDisplay.y)/2,2.4,
        Math.hypot(formationDisplay.x-cx2,formationDisplay.y-cy2),fa+Math.PI/2,90,225,255,46*fade);
    batA.add(selRing,formationDisplay.x,formationDisplay.y,34,34,t*.8,100,235,255,190*fade);
    for(let k=0;k<slots.length;k++){
      const P=slots[k],i=members[Math.min(k*stride,n-1)],T=TYPES[utype[i]]||TYPES[0],sz=Math.max(12,T.size*.82);
      batA.add(selRing,P.x,P.y,sz*1.35,sz*1.35,t*.45+k*.1,95,240,255,185*fade);
      batA.add(sprites.glow,P.x,P.y,sz,sz,0,65,215,255,72*fade);
      const uv=UNIT_UV[T.spr];
      if(uv)batU.add(uv[angFrame(fa+Math.PI/2+camYaw)%uv.length],P.x,P.y,sz*S3D,sz*S3D,0,115,245,255,115*fade,T.air?18:2);
      else if(sprites[T.spr])batN.add(sprites[T.spr],P.x,P.y,sz,sz,fa+Math.PI/2,115,245,255,105*fade);
    }
  }

  // Charged Barrage targeting is a world-space fire plan, not a text prompt.
  const abDraw=(aiming===5&&artBarrageAim)?artBarrageAim:artBarrageCharge;
  if(abDraw){
    const pts=abDraw.pattern||artBarragePattern(abDraw.x,abDraw.y);
    const prog=artBarrageCharge?clamp(artBarrageCharge.t/artBarrageCharge.total,0,1):0;
    batA.add(selRing,abDraw.x,abDraw.y,(ART_BARRAGE.spread+ART_BARRAGE.aoe)*2,
      (ART_BARRAGE.spread+ART_BARRAGE.aoe)*2,t*.34,255,174,68,130+prog*70);
    for(let k=0;k<pts.length;k++){
      const P=pts[k],pulse=ART_BARRAGE.aoe*2+Math.sin(t*5+k)*5;
      batA.add(selRing,P.x,P.y,pulse,pulse,-t*.6+k*.25,255,210,95,165+prog*65);
      batA.add(sprites.glow,P.x,P.y,9+prog*8,9+prog*8,0,255,135,45,95+prog*90);
    }
    const src=artBarrageCharge?artBarrageCharge.members.map(m=>m.i):artBarrageSelected();
    for(const i of src){
      if(!ualive[i]||ugen[i]===undefined)continue;
      const len=Math.hypot(abDraw.x-ux[i],abDraw.y-uy[i]);
      batA.add(selRing,ux[i],uy[i],ART_BARRAGE.range*2,ART_BARRAGE.range*2,0,255,185,70,aiming===5?22:10);
      batA.add(sprites.beam,(ux[i]+abDraw.x)/2,(uy[i]+abDraw.y)/2,2.4+prog*2.4,len,
        Math.atan2(abDraw.y-uy[i],abDraw.x-ux[i])+Math.PI/2,255,182,70,38+prog*80);
      batA.add(selRing,ux[i],uy[i],TYPES[utype[i]].size*(2.1+prog),TYPES[utype[i]].size*(2.1+prog),
        t*(1+prog),255,195,82,150+prog*90);
    }
  }

  // ---- placement ghost + BUILD ZONE rings (no darkening overlay) ----
  if(placing){
    const T=BT[placing.type], ok=placementValid();
    const freeNode=(placing.type==='mex'||placing.type==='geo');
    // construction zone: a SQUARE footprint per structure, with corner brackets
    if(!freeNode){
      for(const Bz of blds){
        if(!Bz.alive||Bz.team!==0) continue;
        const br=buildRadius(Bz), sd=br*2;
        if(Bz.x<x0-br||Bz.x>x1+br||Bz.y<y0-br||Bz.y>y1+br) continue;
        const ew=Math.max(2.2,3.2/cam.z);            // constant on-screen edge weight
        batA.add(sPx,Bz.x,Bz.y,sd,sd,0,60,150,220,13);                     // fill wash
        batA.add(sPx,Bz.x,Bz.y-br,sd,ew,0,120,215,255,120);                // edges
        batA.add(sPx,Bz.x,Bz.y+br,sd,ew,0,120,215,255,120);
        batA.add(sPx,Bz.x-br,Bz.y,ew,sd,0,120,215,255,120);
        batA.add(sPx,Bz.x+br,Bz.y,ew,sd,0,120,215,255,120);
        const cb=br*0.24;                                                   // corner brackets
        for(const sx3 of [-1,1]) for(const sy3 of [-1,1]){
          batA.add(sPx,Bz.x+sx3*(br-cb/2),Bz.y+sy3*br,cb,ew*2.1,0,150,235,255,215);
          batA.add(sPx,Bz.x+sx3*br,Bz.y+sy3*(br-cb/2),ew*2.1,cb,0,150,235,255,215);
        }
      }
    }
    // snap grid
    const gx0=Math.round((placing.x-160)/SNAP)*SNAP, gy0=Math.round((placing.y-160)/SNAP)*SNAP;
    for(let k=0;k<=16;k++){
      batA.add(sPx,gx0+k*SNAP,placing.y,1.2,320,0,120,220,255,44);
      batA.add(sPx,placing.x,gy0+k*SNAP,320,1.2,0,120,220,255,44);
    }
    // alignment guides to snapped neighbours
    for(const Bg of blds){
      if(!Bg.alive||Bg.team!==0) continue;
      if(Math.abs(Bg.x-placing.x)<1 && Math.abs(Bg.y-placing.y)<300)
        batA.add(sPx,placing.x,(placing.y+Bg.y)/2,1.6,Math.abs(placing.y-Bg.y),0,120,255,190,120);
      if(Math.abs(Bg.y-placing.y)<1 && Math.abs(Bg.x-placing.x)<300)
        batA.add(sPx,(placing.x+Bg.x)/2,placing.y,Math.abs(placing.x-Bg.x),1.6,0,120,255,190,120);
    }
    batA.add(glow,placing.x,placing.y,T.size*2.6,T.size*2.6,0, ok?80:255, ok?255:70, ok?140:60, 60);
    const prot=placing.rot||0;
    /* The ghost's FOOTPRINT is the important thing to show — the exact oriented
       rectangle of ground this will consume, so overlaps are obvious before you
       commit rather than a mystery rejection afterwards. */
    const pf=bldFoot(placing.type);
    const pr=ok?[90,235,150]:[255,80,70];
    /* Paint each snapped cell under the proposed footprint. A red cell and
       diagonal cross make an invalid site understandable before Build is
       pressed, including large structures whose centre looks clear while one
       corner clips water, a node, or another building. */
    const nx=Math.max(1,Math.round(pf[0]/SNAP)),ny=Math.max(1,Math.round(pf[1]/SNAP));
    const cellW=pf[0]/nx,cellH=pf[1]/ny;
    const rc=Math.cos(prot),rs=Math.sin(prot);
    for(let cy=0;cy<ny;cy++) for(let cx=0;cx<nx;cx++){
      const lx=(cx-(nx-1)*.5)*cellW,ly=(cy-(ny-1)*.5)*cellH;
      const wx=placing.x+lx*rc-ly*rs,wy=placing.y+lx*rs+ly*rc;
      batA.add(sPx,wx,wy,cellW*.82,cellH*.82,prot,pr[0],pr[1],pr[2],ok?20:72);
      if(!ok) batA.add(sPx,wx,wy,cellW*.92,2.1,prot+Math.PI*.25,255,155,130,180);
    }
    BILLBOARD=0;                    // the footprint lies ON the ground and turns with it
    batA.add(sPx,placing.x,placing.y,pf[0],pf[1],prot, pr[0],pr[1],pr[2], 34);   // filled plate
    const pc=Math.cos(prot), ps=Math.sin(prot), phw=pf[0]/2, phh=pf[1]/2;
    const edge=(ex,ey,w,h,r)=>batA.add(sPx,placing.x+ex*pc-ey*ps,placing.y+ex*ps+ey*pc,w,h,r,pr[0],pr[1],pr[2],210);
    edge(0,-phh,pf[0],2.2,prot); edge(0,phh,pf[0],2.2,prot);
    edge(-phw,0,2.2,pf[1],prot);  edge(phw,0,2.2,pf[1],prot);
    // facing chevron: which way the structure will point once built
    edge(phw*0.55,0, pf[0]*0.30, 3.2, prot);
    edge(phw*0.30,-phh*0.34, pf[0]*0.22, 3.2, prot+0.7);
    edge(phw*0.30, phh*0.34, pf[0]*0.22, 3.2, prot-0.7);
    BILLBOARD=1;
    const guv=UNIT_UV[T.spr];                        // ghost: prefer baked 3D sprite; some buildings have no 2D atlas art
    if(guv) batU.add(guv[0],placing.x,placing.y,T.size*S3B,T.size*S3B,0, ok?160:255, ok?255:120, ok?180:110, 200, T.size*0.5);
    else if(sprites[T.spr]) batN.add(sprites[T.spr],placing.x,placing.y,T.size,T.size,0,
      ok?160:255, ok?255:120, ok?180:110, 190, T.size*0.5);
    if(!freeNode&&!inBuildRange(placing.x,placing.y,0))   // clear "why not" cue, no dark wash
      batA.add(selRing,placing.x,placing.y,T.r*3.4,T.r*3.4,t*1.2,255,90,70,120);
    if(placing.type==='turret') batA.add(selRing,placing.x,placing.y,TURRET_RNG*2,TURRET_RNG*2,0,255,255,255,26);
    if(placing.type==='bastion'){
      batA.add(selRing,placing.x,placing.y,BASTION.rng*2,BASTION.rng*2,0,255,255,255,22);
      batA.add(selRing,placing.x,placing.y,BASTION.minRng*2,BASTION.minRng*2,0,255,90,60,30);
    }
    const newDefR=placing.type==='minelaser'?MINELASER.rng:
                  placing.type==='missilebastion'?MISSILE_BASTION.rng:
                  placing.type==='plasma'?PLASMA_CHARGER.rng:0;
    if(newDefR) batA.add(selRing,placing.x,placing.y,newDefR*2,newDefR*2,0,120,225,255,24);
  }

  // ---- SUPER CARRIER (pre-deployment) ----
  if(carrier.active&&carrier.phase<2){
    const alt=carrierEffectiveAlt(), tc=TEAMC[0];
    const sc=1+alt/620;                                    // parallax: bigger while high
    // ground shadow tightens as it descends
    batN.add(sprites.glow,carrier.x+alt*0.10,carrier.y+alt*0.16,
      110*(1+alt/900),74*(1+alt/900),0,0,0,0,Math.max(28,120-alt*0.09));
    if(carrier.phase===1&&(carrier.tx!==carrier.x||carrier.ty!==carrier.y)){
      batA.add(sprites.beam,(carrier.x+carrier.tx)/2,(carrier.y+carrier.ty)/2,2.4,
        Math.hypot(carrier.tx-carrier.x,carrier.ty-carrier.y),
        Math.atan2(carrier.ty-carrier.y,carrier.tx-carrier.x)+Math.PI/2,120,220,255,42);
      batA.add(selRing,carrier.tx,carrier.ty,44,44,t*1.4,120,220,255,110);
    }
    // deploy-site validity halo
    if(carrier.phase===1){
      const okd=carrierCanDeploy();
      batA.add(selRing,carrier.x,carrier.y-alt*0.5,150,150,t*0.35,
        okd?90:255, okd?240:90, okd?150:70, 90+Math.sin(t*3)*35);
      if(okd) batA.add(sprites.glow,carrier.x,carrier.y,160,110,0,90,240,150,26);
    }
    batN.add(sprites.carrier,carrier.x,carrier.y-alt*0.5,150*sc,150*sc,carrier.ang,
      tc[0],tc[1],tc[2],255);
    if(alt>0){                                             // retro-thrust plumes
      for(const sx2 of [-42,42]){
        batA.add(sprites.glow,carrier.x+sx2,carrier.y-alt*0.5+52,34,52,0,255,190,110,150);
        batA.add(sprites.glow,carrier.x+sx2,carrier.y-alt*0.5+78,22,84,0,255,140,60,90);
      }
    }
  }

  // ---- meteor warnings ----
  for(const M of meteors){
    const pulse=0.6+Math.sin(t*8)*0.4;
    batA.add(sprites.warn,M.x,M.y,170,170,t*0.8,255,90,60,120*pulse);
    batA.add(glow,M.x,M.y,40*pulse,40*pulse,0,255,90,60,70);
    if(M.t<0.6){
      const fall=1-M.t/0.6;
      batA.add(sprites.beam,M.x+40*(1-fall),M.y-320*(1-fall*0.9),10,560,0.12,255,190,110,fall*220);
      batA.add(glow,M.x+40*(1-fall),M.y-620*(1-fall),30,30,0,255,220,150,fall*255);
    }
  }

  // ---- baked 3D unit batch (own texture), then overlays ----
  if(batU.n){
    gl.bindTexture(gl.TEXTURE_2D,unitTex);
    batU.flush();
    gl.bindTexture(gl.TEXTURE_2D,atlasTex);
  }
  batN.flush();

  // ---- night ambient: cool darkness over the world; lights punch through ----
  if(nAmt>0.02){
    batN.add(sPx,camx,camy,B.hw*2+120,B.hh*2+120,0, 13,19,48, Math.min(150,nAmt*135));
    batN.flush();
  }

  // ---- additive pass ----
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE);

  /* ---- VOLUMETRIC LIGHT ------------------------------------------------
     In dark air — night, a Blood Moon, a fog bank — a light source stops
     being a bright dot and becomes a visible SHAFT, because you can see the
     medium it's travelling through. Each shaft is a stack of additive cones
     leaning away from the light, widening and fading with distance; layering
     three of them with slightly different widths gives the soft-edged falloff
     a single quad can't. Gated hard on darkness so noon costs nothing.    */
  const volAmt=Math.min(1, nAmt*1.15 + (WC.moon?0.55:0) + (WC.fogb?0.42:0));
  if(volAmt>0.22 && bloomOn && perfScale>0.35){
    const sBm=sprites.beam, sGl=sprites.glow;
    const drift=Math.sin(t*0.25)*0.10;                 // the air is never quite still
    const shaft=(sx,sy,len,wid,r,g,b,a,ang)=>{
      const A=a*volAmt;
      batA.add(sGl,sx,sy,wid*2.4,wid*2.4,0,r,g,b,A*0.55);            // source bloom
      for(let L=0;L<3;L++){
        const f=1+L*0.9, al=A*(0.34-L*0.09);
        if(al<=1) continue;
        batA.add(sBm, sx+Math.cos(ang)*len*0.5, sy+Math.sin(ang)*len*0.5,
                 wid*f, len, ang+Math.PI/2, r,g,b, al);
      }
    };
    /* Specialist night shafts only. Generic work-light cones used to stamp
       a warm source bloom on every large building — the HUD leftover of
       the 3D billboard this pass retired. Searchlights and runway lamps stay. */
    for(const Bv of blds){
      if(!Bv.alive||Bv.prog<1||Bv.team===2) continue;
      if(Bv.x<x0-140||Bv.x>x1+140||Bv.y<y0-140||Bv.y>y1+140) continue;
      if(!fogEntityVisible(Bv.team,Bv.x,Bv.y)) continue;
      const szv=BT[Bv.type].size;
      if(Bv.type==='techlab'||Bv.type==='uplink'||Bv.type==='nova'){   // sweeping searchlight
        const sw=t*0.55+Bv.anim;
        shaft(Bv.x, Bv.y-szv*0.5, szv*4.4, szv*0.42, 150,210,255, 84, sw);
      }
      if(Bv.type==='airfield'){                                        // runway approach lights
        shaft(Bv.x, Bv.y, szv*3.0, szv*0.32, 120,255,170, 76, (Bv.rot||0));
        shaft(Bv.x, Bv.y, szv*3.0, szv*0.32, 255,140,110, 76, (Bv.rot||0)+Math.PI);
      }
    }
    // vehicle headlights: the beam itself, not just the pool on the ground
    if(volAmt>0.4){
      const stepV=Math.max(1,Math.ceil(teamCount[0]/170));
      for(let i=0;i<unitHigh;i+=stepV){
        if(!ualive[i]||uteam[i]===2||!umov[i]) continue;
        const Tv=TYPES[utype[i]];
        if(Tv.naval||Tv.size<15) continue;
        const X=ux[i], Y=uy[i];
        if(X<x0-40||X>x1+40||Y<y0-40||Y>y1+40) continue;
        if(!fogEntityVisible(uteam[i],X,Y)) continue;
        const ha=uang[i]-Math.PI/2;
        shaft(X+Math.cos(ha)*Tv.size*0.5, Y+Math.sin(ha)*Tv.size*0.5,
              Tv.size*3.4, Tv.size*0.5, 255,242,206, 62, ha);
      }
    }
    // burning ruins glow through the murk
    for(const Rv of relics){
      if(!Rv.alive||!(Rv.burn>0.3)) continue;
      if(Rv.x<x0-120||Rv.x>x1+120||Rv.y<y0-120||Rv.y>y1+120) continue;
      shaft(Rv.x, Rv.y-Rv.s*0.4, Rv.s*2.2, Rv.s*0.6, 255,150,70, 70*Rv.burn, -Math.PI/2+drift);
    }
  }
  // beams
  const sBeam=sprites.beam;
  /* The 3D renderer owns combat VFX when enabled. Drawing the legacy 2D beam
     batch on top projected world lengths through the HUD camera a second time,
     producing the full-screen bars seen in dense battles. */
  if(!use3D) for(const bm of beams){
    const lf=1-bm.t/bm.max;
    const mx=(bm.x0+bm.x1)/2, my=(bm.y0+bm.y1)/2;
    if(mx<x0-200||mx>x1+200||my<y0-200||my>y1+200) continue;
    if(!fogFxVisible(bm.x0,bm.y0,bm.team)||!fogFxVisible(bm.x1,bm.y1,bm.team)) continue;
    const len=Math.sqrt(dist2(bm.x0,bm.y0,bm.x1,bm.y1));
    const rot=Math.atan2(bm.y1-bm.y0,bm.x1-bm.x0)+Math.PI/2;
    batA.add(sBeam,mx,my,bm.w*(2.4-lf),len,rot,bm.r,bm.g,bm.b,lf*230);
    batA.add(sBeam,mx,my,bm.w*0.8,len,rot,255,255,255,lf*255);
    batA.add(glow,bm.x1,bm.y1,bm.w*4,bm.w*4,0,bm.r,bm.g,bm.b,lf*200);
  }
  // projectiles
  const sBolt=sprites.bolt, sGlow=sprites.glow;
  if(!use3D) for(let i=0;i<pHigh;i++){
    if(!palive[i]) continue;
    const X=px[i], Y=py[i];
    if(X<x0||X>x1||Y<y0||Y>y1) continue;
    if(!fogFxVisible(X,Y,pteam[i])) continue;
    const c=TEAMB[pteam[i]], wk=pwk[i]||'p';
    if(wk==='g'){
      const a=Math.atan2(pvy[i],pvx[i])+Math.PI/2;
      batA.add(sBolt,X,Y,4,22,a,205,245,255,255);
      batA.add(sGlow,X,Y,10,10,0,100,215,255,190);
    } else if(wk==='s'){
      batA.add(sGlow,X,Y,14,14,0,205,125,255,230);
      batA.add(sRing,X,Y,19,19,0,120,225,255,160);
    } else if(wk==='i'){
      batA.add(sGlow,X,Y,17,17,0,75,205,255,235);
      batA.add(sGlow,X,Y,7,7,0,235,255,255,255);
    } else if(wk==='f'){
      batA.add(sprites.flame,X,Y,13,18,Math.atan2(pvy[i],pvx[i])+Math.PI/2,255,205,115,235);
    } else if(ptype[i]===2){
      const arc=Math.sin(pt[i]*Math.PI);
      const lift=arc*clamp((pArc[i]||70)*.37,26,240);
      const s=(pBarrage[i]?10:6)+arc*(pBarrage[i]?15:10);
      batA.add(sGlow,X,Y-lift,s,s,0,255,pBarrage[i]?150:190,pBarrage[i]?55:90,235);
      if(pBarrage[i])batN.add(sprites.debris||sGlow,X,Y-lift,s*.72,s*1.7,
        Math.atan2(pvy[i],pvx[i])+Math.PI/2,70,66,62,255);
      batA.add(sGlow,X,Y,4,4,0,40,30,20,120);
    } else if(ptype[i]===3){
      batA.add(sBolt,X,Y,10,26,Math.atan2(pvy[i],pvx[i])+Math.PI/2,140,230,255,255);
    } else if(ptype[i]===4){
      batA.add(sGlow,X,Y,7,7,0,255,170,90,240);
    } else if(ptype[i]===5){
      const gr=1.6-plife[i]*2;   // flame grows as it travels
      batA.add(sprites.flame,X,Y,9*gr,13*gr,Math.atan2(pvy[i],pvx[i])+Math.PI/2,255,255,255,210);
    } else {
      const s=ptype[i]===1?8:5;
      batA.add(sBolt,X,Y,s,s*2.6,Math.atan2(pvy[i],pvx[i])+Math.PI/2,c[0],c[1],c[2],240);
    }
  }
  // particles (additive types)
  const sRing=sprites.ring, sFire=sprites.fireball, sDeb=sprites.debris;
  for(let i=0;i<MAXPART;i++){
    if(!flife[i]) continue;
    if(use3D) continue;
    const X=fx[i], Y=fy[i];
    if(X<x0||X>x1||Y<y0||Y>y1) continue;
    if(!fogPointVisible(X,Y)) continue;
    const lf=flife[i]/fmax[i];
    const tp=ftype[i];
    if(tp===0){ batA.add(sGlow,X,Y,fsize[i]*(1.4-lf*0.4),fsize[i]*(1.4-lf*0.4),0,fcr[i],fcg[i],fcb[i],lf*255); }
    else if(tp===2){ batA.add(sGlow,X,Y,fsize[i],fsize[i],0,fcr[i],fcg[i],fcb[i],lf*255); }
    else if(tp===3){ const g=1-lf; batA.add(sRing,X,Y,fsize[i]*(0.3+g*0.7)*2,fsize[i]*(0.3+g*0.7)*2,0,fcr[i],fcg[i],fcb[i],lf*180); }
    else if(tp===4){ batA.add(sFire,X,Y,fsize[i],fsize[i],i*0.7,255,255,255,lf*235); }
    else if(tp===5){ batA.add(sDeb,X,Y,fsize[i],fsize[i]*2.4,Math.atan2(fvy[i],fvx[i])+Math.PI/2,fcr[i],fcg[i],fcb[i],lf*255); }
    else if(tp===6&&!use3D){ batA.add(sFire,X,Y,fsize[i]*0.6,fsize[i]*0.6,i*0.7,255,255,255,lf*235); }
    else if(tp===7&&!use3D){ batA.add(sDeb,X,Y,fsize[i]*0.5,fsize[i],Math.atan2(fvy[i],fvx[i])+Math.PI/2,255,200,120,lf*255); }
    // feed the bloom pass from the brightest emitters
    if(bloomOn&&(tp===0||tp===4||tp===6)&&fsize[i]>7&&lf>0.25)
      addBloom(X,Y,fsize[i]*3.1,fcr[i],fcg[i],fcb[i],lf*(tp===0?0.30:0.42));
  }
  /* ---- world alert pings: expanding rings at attack locations ---- */
  const sRing2=sprites.ring, sGlow3=sprites.glow;
  for(let pi=worldAlertPings.length-1;pi>=0;pi--){
    const P=worldAlertPings[pi];
    const age=stats.t-P.t;
    if(age>P.dur){ worldAlertPings.splice(pi,1); continue; }
    if(P.x<x0-200||P.x>x1+200||P.y<y0-200||P.y>y1+200) continue;
    const frac=age/P.dur;
    const innerR=40+age*55;
    const outerR=70+age*80;
    batA.add(sRing2,P.x,P.y,innerR,innerR,age*0.6, P.cr,P.cg,P.cb, (1-frac)*200);
    batA.add(sRing2,P.x,P.y,outerR,outerR,-age*0.4, P.cr,P.cg,P.cb, (1-frac)*120);
    batA.add(sGlow3,P.x,P.y,innerR*0.6,innerR*0.6,0, P.cr,P.cg,P.cb, (1-frac)*50);
  }
  /* ---- directional off-screen threat arrow ---- */
  renderOffscreenArrows();
  batA.flush();
  // smoke/dust (normal blending, tinted)
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  const sSmoke=sprites.smoke;
  if(!use3D)for(let s=0;s<artShellSmoke.length;s++){
    const S=artShellSmoke[s];
    if(S.x<x0||S.x>x1||S.y<y0||S.y>y1||!fogFxVisible(S.x,S.y,S.team))continue;
    const lf=S.life/S.max,age=1-lf,sz=S.size*(1+age*1.8),lift=clamp(S.lift*.37,0,260);
    batN.add(sSmoke,S.x,S.y-lift,sz,sz,S.rot+age*.55,78+age*14,73+age*13,69+age*12,145*lf);
  }
  for(let i=0;i<MAXPART;i++){
    if(!flife[i]) continue;
    const tp=ftype[i];
    if(use3D&&tp!==9) continue;
    if(tp!==1&&tp!==8&&tp!==9) continue;
    const X=fx[i], Y=fy[i];
    if(X<x0||X>x1||Y<y0||Y>y1) continue;
    if(tp!==9&&!fogPointVisible(X,Y)) continue;
    const lf=flife[i]/fmax[i];
    if(tp===9){                                   // ambient mote: leaf / snowflake
      batN.add(sprites.glow,X+Math.sin(flife[i]*4+i)*6,Y,fsize[i],fsize[i],0,fcr[i],fcg[i],fcb[i],Math.min(1,lf*2.5)*190);
    } else if(tp===1){
      batN.add(sSmoke,X,Y,fsize[i],fsize[i],i,fcr[i],fcg[i],fcb[i],lf*140);
    } else {
      // volumetric mushroom plume: smoke column + rising expanding cap
      const age=1-lf, S=fsize[i];
      const colH=S*1.9*Math.min(1,age*2.2);
      const nSeg=4;
      for(let s2=1;s2<=nSeg;s2++){
        const fy2=Y-colH*s2/nSeg;
        const w=S*(0.34+0.1*s2/nSeg+age*0.14);
        batN.add(sSmoke,X+Math.sin(i+s2*1.7+age*5)*S*0.05,fy2,w,w,i+s2,52,50,52,lf*165);
      }
      const capW=S*(0.75+age*0.85);
      batN.add(sSmoke,X,Y-colH,capW,capW*0.7,i*0.7,58,54,56,lf*185);
      batN.add(sSmoke,X-capW*0.3,Y-colH+capW*0.12,capW*0.6,capW*0.5,i*1.3,46,44,46,lf*160);
      batN.add(sSmoke,X+capW*0.3,Y-colH+capW*0.12,capW*0.6,capW*0.5,i*2.1,46,44,46,lf*160);
      if(age<0.45) batA.add(sprites.glow,X,Y-colH*0.4,S*0.5*(1-age*2),S*0.7*(1-age*2),0,255,150,60,(1-age*2.2)*160);
    }
  }
  // ---- bird flocks (ambient life, day only) ----
  if(nAmt<0.75) for(const F of birds){
    const rot=Math.atan2(F.vy,F.vx)+Math.PI/2;
    for(let k2=0;k2<F.n;k2++){
      const bx2=F.x - F.vx*k2*0.55 + Math.sin(F.ph+k2*1.7)*13;
      const by2=F.y - F.vy*k2*0.55 + Math.cos(F.ph*0.7+k2*2.1)*10;
      if(bx2<x0||bx2>x1||by2<y0||by2>y1) continue;
      const flap=0.45+Math.abs(Math.sin(F.ph*2.2+k2))*0.75;
      batN.add(sprites.glow,bx2+9,by2+18,8,4,0,0,0,0,55);                    // ground shadow
      batN.add(sprites.bird,bx2,by2,10,10*flap,rot,26,30,38,235);
    }
  }
  // shard ground shadows (atlas still bound)
  for(let i=0;i<MAXSH;i++){
    if(shLife[i]<=0) continue;
    const X=shX[i], Y=shY[i];
    if(X<x0||X>x1||Y<y0||Y>y1) continue;
    if(!fogPointVisible(X,Y)) continue;
    const zf=1/(1+shZ[i]*0.02);
    batN.add(sprites.glow,X,Y,shSize[i]*1.1*(2-zf),shSize[i]*0.7*(2-zf),0,0,0,0,70*zf*Math.min(1,shLife[i]*2));
  }
  batN.flush();
  // ---- baked 3D FX: explosion flipbook + tumbling debris (topmost) ----
  if(use3D){
    for(let i=0;i<MAXPART;i++){
      if(!flife[i]) continue;
      const tp=ftype[i];
      if(tp!==6&&tp!==7) continue;
      const X=fx[i], Y=fy[i];
      if(X<x0||X>x1||Y<y0||Y>y1) continue;
      if(!fogPointVisible(X,Y)) continue;
      const lf=flife[i]/fmax[i];
      if(tp===6){
        // volumetric fireball: three parallax layers rising at different speeds
        const age=1-lf, fr=Math.min(23,(age*24)|0);
        const S=fsize[i];
        batA.add(sprites.glow,X,Y,S*2.5,S*2.5,0,255,185,105,lf*(50+110*nAmt));  // ground illumination
        if(bloomOn) addBloom(X,Y,S*2.6,255,190,120,lf*0.55);
        batU2.add(UNIT_UV.expl[fr],X,Y-age*S*0.10,S,S,(i&3)*1.57,255,255,255,255);
        batU2.add(UNIT_UV.expl[Math.min(23,fr+2)],X+S*0.06,Y-age*S*0.34,S*0.72,S*0.72,((i>>2)&3)*1.57+0.6,255,255,255,215);
        if(S>26) batU2.add(UNIT_UV.expl[Math.min(23,fr+4)],X-S*0.07,Y-age*S*0.58,S*0.5,S*0.5,(i&7)*0.8,255,255,255,170);
      } else {
        // ballistic debris: parabolic hop with ground shadow
        const age=1-lf;
        const hop=fsize[i]*1.7*4*lf*age;         // peak at mid-flight
        const fr=(i+((age*22)|0))%32;
        batU2.add(UNIT_UV.chunk[fr],X,Y-hop,fsize[i]*(1+hop*0.012),fsize[i]*(1+hop*0.012),age*6+i,255,255,255,lf<0.25?lf*1020:255);
      }
    }
    // volumetric shards: textured fragments with altitude + tumble
    for(let i=0;i<MAXSH;i++){
      if(shLife[i]<=0) continue;
      const X=shX[i], Y=shY[i];
      if(X<x0||X>x1||Y<y0||Y>y1) continue;
      if(!fogPointVisible(X,Y)) continue;
      const a=Math.min(1,shLife[i]*2)*255;
      batU2.add([shU0[i],shV0[i],shU1[i],shV1[i]],
        X, Y-shZ[i]*0.9, shSize[i]*(1+shZ[i]*0.004), shSize[i]*(1+shZ[i]*0.004),
        shRot[i], shR[i],shG[i],shB[i], a);
    }
    if(batU2.n){
      gl.bindTexture(gl.TEXTURE_2D,unitTex);
      batU2.flush();
      gl.bindTexture(gl.TEXTURE_2D,atlasTex);
    }
  }
  // ---- BLOOM: soft light bleed around every bright emitter ----
  if(bloomOn&&bloomN){
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
    const sGlow2=sprites.glow;
    for(let i=0;i<bloomN;i++){
      const a=bloomA[i];
      batA.add(sGlow2,bloomX[i],bloomY[i],bloomS[i],bloomS[i],0,
        bloomR[i],bloomG[i],bloomB[i],a*180);
      batA.add(sGlow2,bloomX[i],bloomY[i],bloomS[i]*2.1,bloomS[i]*2.1,0,
        bloomR[i],bloomG[i],bloomB[i],a*66);        // wide halo
    }
    batA.flush();
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  }
  bloomN=0;

  BILLBOARD=0;
  // ---- fog of war overlay ----
  if(fogOn&&fogTex&&!demoMode){
    gl.bindTexture(gl.TEXTURE_2D,fogTex);
    batT.add(FULLUV,MAP/2,MAP/2,MAP,MAP,0,255,255,255,255);
    batT.flush();
    gl.bindTexture(gl.TEXTURE_2D,atlasTex);
  }

  // ---- cinematic sun grade: warm key across the map, cool shadow side ----
  if(gradeOn){
    gl.bindTexture(gl.TEXTURE_2D,atlasTex);
    const nA=nightAmt();
    gl.blendFunc(gl.DST_COLOR,gl.ONE);            // screen-ish lift on the sunlit side
    batA.add(sprites.glow,cam.x-VW*0.22/cam.z,cam.y-VH*0.30/cam.z,
      MAP*1.1,MAP*1.1,0,255,200,140,(19*(1-nA))|0);
    batA.flush();
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    batA.add(sprites.glow,cam.x+VW*0.30/cam.z,cam.y+VH*0.34/cam.z,
      MAP*1.0,MAP*1.0,0,18,32,74,(52+40*nA)|0);   // cool shadow wash
    batA.flush();
  }
}

// ---------- minimap ----------
const mm=document.getElementById('minimap').getContext('2d',{willReadFrequently:true});
let mmBg=null, mmFrame=0, mmBgGen=0;
function mmBgIsLive(cv){
  if(!cv||cv.width<8) return false;
  try{
    const c=cv.getContext('2d',{willReadFrequently:true});
    if(!c) return false;
    /* Interior only — the terrain vignette paints the corners near-black. */
    const S=cv.width, pts=[[S>>2,S>>2],[S>>1,S>>1],[(S*3)>>2,(S*3)>>2],[S>>2,(S*3)>>2],[(S*3)>>2,S>>2]];
    let lit=0;
    for(const p of pts){
      const d=c.getImageData(p[0],p[1],1,1).data;
      if(d[0]+d[1]+d[2]>10) lit++;
    }
    return lit>=1;
  }catch(e){ return false; }
}
function mmFactionCrest(fac,x,y,size,stroke){
  const I=typeof facIconCanvas==='function'?facIconCanvas(fac,()=>{mmFrame=0;}):null,s=size||12,h=s*.5;
  mm.save();mm.beginPath();mm.arc(x,y,h+1.5,0,TAU);mm.fillStyle='rgba(3,10,18,.92)';mm.fill();
  mm.lineWidth=1.5;mm.strokeStyle=stroke||'#dff6ff';mm.stroke();
  if(I)mm.drawImage(I,x-h,y-h,s,s);
  else{mm.fillStyle=stroke||'#dff6ff';mm.font='900 '+Math.max(7,s*.65)+'px sans-serif';mm.textAlign='center';mm.textBaseline='middle';mm.fillText('\u25c8',x,y+.5);}
  mm.restore();
}
function renderMinimap(){
  if((mmFrame++)%5) return;
  /* 256 backing store: a 5x5 civic cell is ~10 px, so lots/streets survive
     the command-map read. CSS still paints 72-84 px; the canvas is the map. */
  const S=256, k=S/MAP;
  const mmEl=mm.canvas;
  if(mmEl.width!==S){ mmEl.width=S; mmEl.height=S; }
  if(!mmBg||mmBg.width!==S){
    mmBg=document.createElement('canvas'); mmBg.width=S; mmBg.height=S;
    const c=mmBg.getContext('2d',{willReadFrequently:true});
    /* Same civic albedo+mask as the 3D ground — not a bilinear grass stamp. */
    if(typeof composeMinimapTerrain==='function') composeMinimapTerrain(c,S);
    else if(terrainCanvas) c.drawImage(terrainCanvas,0,0,S,S);
    /* Empty bake must not stick. MEDIUM's 1100 ms hold would restore this
       black square after applyTheme nulls mmBg. */
    if(!mmBgIsLive(mmBg)) mmBg=null;
  }
  if(!mmBg) return;
  mm.drawImage(mmBg,0,0);
  mm.fillStyle='#3dd68a';
  for(const d of deposits){
    const tier=depositTier(d);
    if(tier<=0||(fogOn&&!demoMode&&!fogExploredAt(d.x,d.y))) continue;
    mm.fillStyle=tier===3?'#d06bff':tier===2?'#55eea3':'#4edcff';
    const rs=(tier+2)*2;mm.fillRect(d.x*k-rs/2,d.y*k-rs/2,rs,rs);
  }
  for(const B of blds){
    if(!B.alive) continue;
    const visB=fogEntityVisible(B.team,B.x,B.y);
    const radarB=!visB&&B.team!==0&&typeof intelRadarContact==='function'&&intelRadarContact(B.x,B.y);
    if(!visB&&!radarB) continue;
    mm.fillStyle=radarB?'rgba(255,109,94,.42)':(B.team===0?mmPCol:(B.team===1?mmECol:'#ffb13a'));
    const s=Math.max(radarB?3:5,B.r*k*(radarB?1.05:1.6));
    mm.fillRect(B.x*k-s/2,B.y*k-s/2,s,s);
  }
  const total=teamCount[0]+teamCount[1]+teamCount[2];
  const step=total>3000? Math.ceil(total/1800):1;
  for(let i=0;i<unitHigh;i+=step){
    if(!ualive[i]) continue;
    const visU=fogEntityVisible(uteam[i],ux[i],uy[i]);
    /* Radar paints a contact without lighting the 3D model. GHOST stays off
       this layer until a detector pierces it — radar is not omni. */
    const radarU=!visU&&uteam[i]!==0&&umode[i]!==4&&typeof intelRadarContact==='function'&&intelRadarContact(ux[i],uy[i]);
    if(!visU&&!radarU) continue;
    mm.fillStyle=radarU?'rgba(255,109,94,.55)':(uteam[i]===0?mmPColA:(uteam[i]===1?mmEColA:'rgba(255,177,58,.9)'));
    const d=radarU?3:4;
    mm.fillRect(ux[i]*k-d/2,uy[i]*k-d/2,d,d);
  }
  for(const C of crates){
    if(!C.seen&&!fogPointVisible(C.x,C.y)) continue;
    const cc=C.kind&&C.kind.col||[255,225,140];
    mm.fillStyle='rgb('+cc[0]+','+cc[1]+','+cc[2]+')';
    const x=C.x*k,y=C.y*k; mm.beginPath();mm.moveTo(x,y-6);mm.lineTo(x+6,y);mm.lineTo(x,y+6);mm.lineTo(x-6,y);mm.closePath();mm.fill();
  }
  if(typeof fogGameplayActive==='function'?fogGameplayActive()&&!demoMode:fogOn&&!demoMode){
    /* Same fogBuf alpha the 3D shaders sample (live 0, shroud 168, unexplored
       255). Drawing fogCanvas source-over painted unexplored as a black disc
       and hid the theatre; dim in place so the command map still reads. */
    const md=mm.getImageData(0,0,S,S), d=md.data;
    for(let y=0;y<S;y++) for(let x=0;x<S;x++){
      const a=fogBuf[((y/S*FN|0)*FN+(x/S*FN|0))*4+3];
      if(a<8) continue;
      /* 0.93 left 7% of night albedo — a black square on 84 px phones.
         Unexplored stays muted so the theatre still reads; live vision
         stays full; shroud sits between. */
      const dim=a>=220?0.50:a>=80?0.72:1, lift=1-dim, mo=(y*S+x)*4;
      d[mo]=d[mo]*dim+10*lift; d[mo+1]=d[mo+1]*dim+12*lift; d[mo+2]=d[mo+2]*dim+8*lift;
    }
    mm.putImageData(md,0,0);
  }
  if(typeof HAZ!=='undefined') for(const F of HAZ.faults||[]){
    if(F.state===2||!fogExploredAt(F.x,F.y)) continue;
    mm.strokeStyle=F.state===1?'rgba(255,174,80,.95)':'rgba(202,167,105,.48)';
    mm.lineWidth=F.state===1?3.6:2;
    mm.beginPath();mm.arc(F.x*k,F.y*k,Math.max(6,F.r*k),0,TAU);mm.stroke();
  }
  for(let p2=mmPings.length-1;p2>=0;p2--){
    const P=mmPings[p2];
    if(stats.t>P.until){ mmPings.splice(p2,1); continue; }
    const ph=(P.until-stats.t)%1;
    mm.strokeStyle='rgba('+P.cr+','+P.cg+','+P.cb+','+(0.35+0.6*(1-ph))+')'; mm.lineWidth=3;
    mm.beginPath(); mm.arc(P.x*k,P.y*k,6+ph*18,0,6.283); mm.stroke();
  }
  /* Strategic identity markers are deliberately painted after fog. Enemy
     crests still require current vision; friendly HQ/ally starts remain useful
     navigation anchors even when the unit dots merge into a large army. */
  const ownFac=(typeof playerFaction!=='undefined'&&playerFaction)||'nova';
  const ownHq=bldLive.find(B=>B.alive&&B.team===0&&B.type==='hq'&&B.allyAI==null);
  if(ownHq)mmFactionCrest(ownFac,ownHq.x*k,ownHq.y*k,20,'#5de1ff');
  if(typeof AI!=='undefined'){
    for(const A of AI.allies||[])mmFactionCrest(A.fac||ownFac,A.x*k,A.y*k,20,'#66e5a2');
    for(const A of AI.bases||[]){
      const h=A.commander,visible=h>=0&&ualive[h]&&fogEntityVisible(uteam[h],ux[h],uy[h]);
      if(visible)mmFactionCrest(A.fac||AI.fac,ux[h]*k,uy[h]*k,24,'#ff6d5e');
    }
  }
  if(heroIdx>=0&&ualive[heroIdx])mmFactionCrest(ownFac,ux[heroIdx]*k,uy[heroIdx]*k,26,'#ffd257');
  /* Ground quad the ortho camera actually sees — not camBounds(). That AABB
     is a cull pad (+60) and at yaw=0 assigns the pitched along-view span to
     world Y while the eye looks along +X, so a portrait view drew a tall
     white box over fog south of the look-at. Same unproject as s2w, onto the
     look-at height plane so relief does not jitter the chrome. */
  const q=mmViewCorners();
  mm.strokeStyle='rgba(255,255,255,.85)'; mm.lineWidth=2.5;
  mm.beginPath();
  mm.moveTo(q[0][0]*k,q[0][1]*k);
  mm.lineTo(q[1][0]*k,q[1][1]*k);
  mm.lineTo(q[2][0]*k,q[2][1]*k);
  mm.lineTo(q[3][0]*k,q[3][1]*k);
  mm.closePath();
  mm.stroke();
}
function mmViewCorners(){
  const m=matV;
  const rx=m[0], ry=m[4], rz=m[8];
  const ux=m[1], uy=m[5], uz=m[9];
  const dx=-m[2], dy=-m[6], dz=-m[10];
  const asp=VW/Math.max(1,VH);
  const hh=orthoSpan*0.5, hw=hh*asp;
  const planeY=typeof terrainH==='function'?terrainH(cam.x,cam.y):0;
  function at(sx,sy){
    const ndx=((sx/VW)*2-1)*hw, ndy=(1-(sy/VH)*2)*hh;
    const ox=eyeX+rx*ndx+ux*ndy, oy=eyeY+ry*ndx+uy*ndy, oz=eyeZ+rz*ndx+uz*ndy;
    if(Math.abs(dy)<1e-5) return [cam.x,cam.y];
    const t=(planeY-oy)/dy;
    return [ox+dx*t, oz+dz*t];
  }
  return [at(0,0), at(VW,0), at(VW,VH), at(0,VH)];
}

// ---------- HUD ----------
const $=id=>document.getElementById(id);
let toastTimer=0;
/* Haptics. A mobile-first game with not a single vibrate call was leaving the
   cheapest feedback channel on the device unused. Guarded because desktop and
   iOS Safari do not implement it. */
function buzz(ms){
  try{ if(navigator.vibrate && META.settings.haptics!==false) navigator.vibrate(ms); }catch(e){}
}
/* The alert chip: a tappable jump-to-trouble marker, because a toast that
   erases itself in 2.6 seconds is not an alert. */
let alertPos=null;
/* World-space 3D alert pings — ring array rendered in the game viewport */
const worldAlertPings=[];
function worldAlertPing(x,y,type){
  const colors={'attack':[255,80,60],'ally_down':[255,220,60],'new_enemy':[255,160,40],'building_lost':[180,80,255]};
  const c=colors[type]||colors.attack;
  worldAlertPings.push({x,y,t:stats.t,dur:type==='attack'?8:type==='building_lost'?8:6,
    cr:c[0],cg:c[1],cb:c[2]});
  if(worldAlertPings.length>6) worldAlertPings.shift();
}
/* Render off-screen directional threat arrows on the viewport edge. Called
   each frame from the HUD layer so the player always knows WHERE trouble is.
   Uses batA sprite batch positioned in world space at the screen edge. */
function renderOffscreenArrows(){
  if(!alertPos) return;
  const b=camBounds();
  /* Is the alert position within the current camera viewport? If yes, skip arrow. */
  if(alertPos[0]>=b.x0 && alertPos[0]<=b.x1 && alertPos[1]>=b.y0 && alertPos[1]<=b.y1) return;
  /* Compute angle from camera center toward the alert world position. */
  const dx=alertPos[0]-cam.x, dy=alertPos[1]-cam.y;
  const ang=Math.atan2(dy,dx);
  const cosA=Math.cos(ang), sinA=Math.sin(ang);
  /* Intersect ray with viewport edge, keeping a margin inside. */
  const halfW=(b.x1-b.x0)*0.5, halfH=(b.y1-b.y0)*0.5;
  const tEdge=Math.min(
    Math.abs(halfW/Math.max(0.001,Math.abs(cosA))),
    Math.abs(halfH/Math.max(0.001,Math.abs(sinA)))
  )*0.88;
  const arrowX=cam.x+cosA*tEdge;
  const arrowY=cam.y+sinA*tEdge;
  const pulse=0.6+0.4*Math.sin(stats.t*4);
  /* Glow background circle */
  batA.add(sprites.glow,arrowX,arrowY,28,28,0, 255,50,30, pulse*160);
  /* Directional pointer: thin beam rotated to point toward threat */
  batA.add(sprites.beam,arrowX+cosA*10,arrowY+sinA*10, 5,22, ang+Math.PI/2, 255,70,50, pulse*235);
}
function showAlert(x,y,type){
  alertPos=[x,y];
  const el=document.getElementById('atkAlert');
  if(!el) return;
  el.style.display='block';
  clearTimeout(showAlert._t);
  const dur=type==='building_lost'?12000:9000;
  showAlert._t=setTimeout(()=>{ el.style.display='none'; alertPos=null; }, dur);
  /* Spawn world-space alert ring + minimap ping */
  worldAlertPing(x,y,type||'attack');
  mmPing(x,y,type||'attack');
  /* 3D world particles: expanding alert rings at the attack position */
  if(typeof addParticle==='function'){
    addParticle(3,x,y,0,0,1.5,60, 255,80,60);
    addParticle(3,x,y,0,0,1.8,100, 255,60,40);
  }
  sfx('alarm',x,y,0.8);
  buzz(80);
}
function jumpToAlert(){
  if(!alertPos) return;
  cam.x=alertPos[0]; cam.y=alertPos[1]; camFollow=-1; clampCam(); camUpdateMatrices();
  const el=document.getElementById('atkAlert'); if(el) el.style.display='none';
  alertPos=null; sfx('ui');
}
/* Pre-contact intelligence names a LANE, never the hidden enemy spawn. The
   stored vector is only the final approach toward a player asset, so the world
   overlay remains useful without punching a hole through fog of war. */
let waveThreat=null;
function waveLaneName(fromX,fromY,toX,toY){
  const a=Math.atan2(fromY-toY,fromX-toX),i=(Math.round(a/(Math.PI/4))+8)%8;
  return ['EAST','SOUTHEAST','SOUTH','SOUTHWEST','WEST','NORTHWEST','NORTH','NORTHEAST'][i]+' LANE';
}
function setWaveWarning(fromX,fromY,toX,toY,eta,wave,count){
  const dx=fromX-toX,dy=fromY-toY,L=Math.hypot(dx,dy)||1,now=(stats&&stats.t)||0;
  waveThreat={x:toX,y:toY,dx:dx/L,dy:dy/L,lane:waveLaneName(fromX,fromY,toX,toY),
    wave:wave||1,count:count||0,until:now+Math.max(0,eta||0),expires:now+Math.max(8,(eta||0)+8)};
  updateWaveWarning();
}
function clearWaveWarning(){
  waveThreat=null;
  const el=document.getElementById('waveAlert'); if(el) el.style.display='none';
}
function updateWaveWarning(){
  const el=document.getElementById('waveAlert'); if(!el) return;
  if(!waveThreat||!running||demoMode||stats.t>waveThreat.expires){ clearWaveWarning(); return; }
  const left=Math.max(0,Math.ceil(waveThreat.until-stats.t));
  const atk=document.getElementById('atkAlert');
  el.classList.toggle('withAttack',!!(atk&&atk.style.display==='block'));
  if(el.style.display!=='block') el.style.display='block';
  const h='<b>⚠ WAVE '+waveThreat.wave+'</b><span>'+waveThreat.lane+' · '
    +(left?left+'s':waveThreat.count?waveThreat.count+' HOSTILES':'CONTACT')+'</span>';
  if(el._mfH!==h){ el._mfH=h; el.innerHTML=h; }
}
function jumpToWaveWarning(){
  if(!waveThreat) return;
  cam.x=waveThreat.x; cam.y=waveThreat.y; camFollow=-1; clampCam(); camUpdateMatrices(); sfx('ui');
}
function toast(msg){
  const el=$('toast'); el.textContent=msg; el.style.opacity=1;
  /* Messages share one reserved notification rail instead of appearing as
     arbitrary centre-screen popups over the build and command interfaces. */
  el.classList.add('noticeBox');
  el.classList.remove('pickupReward','radioNotice'); el.style.removeProperty('--pickup-col');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.style.opacity=0,2600);
}
/* One fixed notification rail owns every transient line. Command speech uses
   this same box, so radio text cannot stack on top of economy/pickup notices. */
function radioNotice(title,msg){
  const el=$('toast');
  el.classList.remove('pickupReward');el.classList.add('noticeBox','radioNotice');
  el.style.removeProperty('--pickup-col');
  el.innerHTML='<b>'+title+'</b><span>'+msg+'</span>';el.style.opacity=1;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.style.opacity=0,2350);
}
function pickupToast(kind,reward){
  const el=$('toast'), rarity=(typeof CRATE_RARITY!=='undefined'&&(CRATE_RARITY[kind.rarity]||CRATE_RARITY[0]))||{nm:'FIELD',col:[255,225,140]};
  const c=kind.col||rarity.col||[255,225,140];
  el.classList.remove('radioNotice');el.classList.add('pickupReward','noticeBox');
  el.style.setProperty('--pickup-col','rgb('+c[0]+','+c[1]+','+c[2]+')');
  el.innerHTML='<b>'+kind.em+' '+rarity.nm.toUpperCase()+' RECOVERED</b><span>'+kind.nm+' · '+reward+'</span>';
  el.style.opacity=1;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{el.style.opacity=0;el.classList.remove('pickupReward');},3200);
}
function updateSelInfo(){
  const el=$('selInfo'), tac=$('tacRow');
  const deck=typeof hudDeck==='string'?hudDeck:'orders';
  const counts={};
  let n=0,first=-1,modeable=0,curMode=-1,mixed=false,patrolling=0,holding=0,stopped=0,moving=0,reposition=0,guarding=0;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]){
    n++; if(first<0) first=i;
    counts[TYPES[utype[i]].name]=(counts[TYPES[utype[i]].name]||0)+1;
    if(ustate[i]===5)patrolling++;
    else if(ustate[i]===7)guarding++;
    else if(uhold[i]){
      /* Stop writes the same uhold stance as Hold so idle acquire cannot chase.
         ustopDisp is set in input.js (stopSelected / orderHold), not sim. */
      if(typeof ustopDisp!=='undefined'&&ustopDisp&&ustopDisp[i]) stopped++;
      else holding++;
    }
    else if(ustate[i]===1){moving++;reposition++;}
    else if(ustate[i]===2)moving++;
    if(unitModes(utype[i]).length>1){
      modeable++;
      if(curMode<0) curMode=umode[i]; else if(curMode!==umode[i]) mixed=true;
    }
  }
  if(typeof updateGroupBadges==='function')updateGroupBadges();
  if(tac) tac.style.display=deck==='orders'&&n?'flex':'none';
  /* The mode button only appears when the selection can actually use it, and
     it reports the CURRENT stance so the button is a readout as well as a
     control — no guessing what a rooted artillery line is doing. */
  const mr=$('modeBtn');
  if(mr){
    mr.style.display=deck==='platoons'&&modeable?'flex':'none';
    if(modeable){
      const M=unitModeDef(utype[first],mixed?0:Math.max(0,curMode));
      $('modeEm').textContent=mixed?'⁇':M.em;
      $('modeNm').textContent=mixed?'Mixed':M.nm;
    }
  }
  if(!n){ el.style.display='none'; intelPrimaryUnit=-1; return; }
  el.style.display='flex';
  const order=patrolling===n?'PATROL':guarding===n?'GUARD':stopped===n?'STOP':holding===n?'HOLD'
    :(stopped+holding)===n?'HOLD/STOP':moving===n?(reposition===n?'MOVE':'A-MOVE'):'READY';
  const platoon=activePlatoon>=0?'P'+(activePlatoon+1)+' · ':'';
  const primary=TYPES[utype[first]], role=UCAT[primary.cat]||UCAT.veh;
  intelPrimaryUnit=first;
  const typeBits=Object.entries(counts);
  const typeLine=typeBits.slice(0,3).map(([k,v])=>v+'× '+k).join(' · ')
    +(typeBits.length>3?' · +'+(typeBits.length-3):'');
  const vet=n===1&&uvet[first]?' · '+'★'.repeat(uvet[first]):'';
  const h='<span class="selIntelCopy"><b>'+role.em+' '+platoon+n+' '+(n===1?'UNIT':'UNITS')+vet+'</b>'
    +'<span>'+FORMS[selFormation].nm.toUpperCase()+' · '+order+' — '
    +typeLine+'</span></span>'
    +'<button type="button" class="selIntelBtn" aria-label="Explain selected unit">ⓘ</button>';
  if(el._mfH!==h){
    el._mfH=h; el.innerHTML=h;
    const ib=el.querySelector('.selIntelBtn');
    if(ib) ib.addEventListener('pointerdown',ev=>{
      ev.stopPropagation();
      if(intelPrimaryUnit>=0&&ualive[intelPrimaryUnit]){ showUnitCard(intelPrimaryUnit,-1,true); sfx('ui'); }
    });
  }
  /* Teach the affordance once per chassis: selection immediately explains the
     first Rhino, Constructor, aircraft, etc.; later selections stay compact and
     the always-visible info target reopens the card on demand. */
  if(n===1&&!intelSeenTypes[utype[first]]){
    intelSeenTypes[utype[first]]=1;
    showUnitCard(first,-1,false);
  }
}
/* Cycle every eligible selected unit to its next stance. Units that share a
   chassis land on the same mode, so a mixed selection resolves per-type
   rather than scattering the army across five different stances. */
function cycleSelectedModes(){
  const decided={};
  let changed=0, label='';
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]||!usel[i]) continue;
    const ty=utype[i], list=unitModes(ty);
    if(list.length<2) continue;
    if(decided[ty]===undefined){
      const cur=list.indexOf(umode[i]);
      decided[ty]=list[(cur+1)%list.length];
    }
    if(setMode(i,decided[ty])){ changed++; label=unitModeDef(ty,decided[ty]).nm; }
  }
  if(changed){
    const firstTy=+Object.keys(decided)[0],M=unitModeDef(firstTy,decided[firstTy]);
    toast(M.em+' '+changed+' units → '+M.nm+' — '+M.ds);
    sfx('ui');
  } else toast('Selected units have no alternate stance');
  updateSelInfo();
}
function hudPlayerPop(){
  /* Player-slot wallet. Theatre size adds slots (2/3/4); each is still 1000.
     Large's 4000 is the theatre total, not this chip. */
  if(typeof populationLedgerPlayer==='function') return populationLedgerPlayer();
  const cap=typeof populationCapForCommander==='function'?populationCapForCommander(-1)
    :(typeof FACTION_POP_CAP==='number'?FACTION_POP_CAP:1000);
  const used=typeof populationUsedForCommander==='function'?populationUsedForCommander(-1)
    :(teamCount[0]|0);
  return {used, cap};
}
function hudPopK(n){
  n=n|0;
  return n>=1000?(n/1000).toFixed(n%1000?1:0)+'K':String(n);
}
let hudFrame=0;
function hudTxt(el,t){ if(el&&el._mfT!==t){ el._mfT=t; el.textContent=t; } }
function hudCol(el,c){ if(el&&el._mfC!==c){ el._mfC=c; el.style.color=c; } }
function hudDisp(el,d){ if(el&&el.style.display!==d) el.style.display=d; }
function updateHUD(fps){
  if((hudFrame++)%10){ if(typeof showHazChip==='function') showHazChip(); return; }
  updateWaveWarning();
  const massV=$('massV'), enV=$('enV'), massR=$('massR'), enR=$('enR');
  hudTxt(massV, String(Math.floor(resM[0])));
  hudTxt(enV, String(Math.floor(resE[0])));
  hudCol(massV, stallM>0?'#ff8d7a':(resM[0]>=RES_MCAP[0]-1?'#ffd257':''));
  hudCol(enV, stallE>0?'#ff8d7a':'');
  // net rate = income − measured spending, so the economy reads honestly
  const mNet=mRate-mSpend, eNet=eRate-eSpend;
  if(resM[0]>=RES_MCAP[0]-1){ hudTxt(massR,'FULL'); hudCol(massR,'#ffd257'); }
  else {
    hudTxt(massR,(mNet>=0?'+':'')+mNet.toFixed(1));
    hudCol(massR,mNet<0?'#ff8d7a':'');
  }
  hudTxt(enR,(eNet>=0?'+':'')+eNet.toFixed(0));
  hudCol(enR,eNet<0?'#ff8d7a':'');
  coachTick();
  if(typeof updateSelInfo==='function') updateSelInfo();
  const popL=hudPlayerPop(),popEl=$('unitV'),popBox=$('unitRes');
  /* Chip is this commander's 1000. 1000 → 1K on the cap side always — never
     print 4K here. Theatre total on Large is 4×1000; the player wallet is 1K. */
  const popNowTxt=hudPopK(popL.used);
  const popCapTxt=popL.cap===1000?'1K':hudPopK(popL.cap);
  hudTxt(popEl, popNowTxt+' / '+popCapTxt);
  popBox.classList.toggle('popWarn',popL.used>=popL.cap*.9);
  popBox.classList.toggle('popFull',popL.used>=popL.cap);
  const popTitle='Your population: '+popL.used+' of '+popL.cap+' — theatre size adds slots, not cap';
  if(popBox.title!==popTitle) popBox.title=popTitle;
  hudTxt($('fps'), fps+' fps');
  if(heroIdx>=0){
    hudDisp($('heroBar'),'block');
    /* Rank symbol, not a sliced profile name. #heroHpFill no longer exists —
       the commander's health reads off the unit in the 3D view like every
       other unit's does. */
    const _hb=$('heroRankEm');
    if(_hb&&typeof metaRankIdx==='function'&&typeof RANKS!=='undefined'){
      const _r=RANKS[metaRankIdx()]; if(_r) hudTxt(_hb,_r.em);
    }
    hudTxt($('heroLvlTxt'),'LV '+heroLvl);
    const xpW=(heroXp/heroXpNext*100)+'%';
    const xpEl=$('xpFill'); if(xpEl&&xpEl._mfW!==xpW){ xpEl._mfW=xpW; xpEl.style.width=xpW; }
    hudTxt($('heroLvlBadge'), String(heroLvl));
  } else hudDisp($('heroBar'),'none');
  /* Length-driven, not a hardcoded 4. The EMP module added a fifth ability and
     the old literal silently left it out of the cooldown/lock rendering. */
  const btns=[$('abOver'),$('abHeal'),$('abRage'),$('abLance'),$('abEmp')].filter(Boolean);
  for(let k=0;k<btns.length;k++){
    const cd=btns[k].querySelector('.cdring');
    if(!abUnlock[k]){
      btns[k].classList.add('cd');
      if(cd.style.display!=='flex') cd.style.display='flex';
      hudTxt(cd,'🔒');
    } else if(abCool[k]>0){
      btns[k].classList.add('cd');
      if(cd.style.display!=='flex') cd.style.display='flex';
      hudTxt(cd, String(Math.ceil(abCool[k])));
    } else {
      btns[k].classList.remove('cd');
      if(cd.style.display!=='none') cd.style.display='none';
    }
  }
  if(aiming===0) $('abOver').classList.add('on'); else $('abOver').classList.remove('on');
  if(typeof commanderActiveButtonState==='function') commanderActiveButtonState();
  if(typeof commanderJumpButtonState==='function') commanderJumpButtonState();
  if(typeof artBarrageButtonState==='function') artBarrageButtonState();
  if(typeof classAbilityButtonState==='function') classAbilityButtonState();
  // carrier deployment prompt
  const db=$('deployBtn');
  if(db){
    if(carrier.active&&carrier.phase===1){
      const okd=carrierCanDeploy();
      const cityN=okd?carrierLandingBlockCount():0;
      db.style.display='block';
      db.classList.toggle('bad',!okd);
      db.textContent=okd?(cityN?'⚠  DEPLOY + CLEAR '+cityN+' BLOCK'+(cityN===1?'':'S'):'⚓  DEPLOY BASE HERE'):'⛔  BAD GROUND — FLY ON';
    } else if(db.style.display!=='none'&&!(carrier.active&&carrier.phase===1)) db.style.display='none';
  }
  // objective + match clock
  const gb=$('goalBar');
  if(gb){
    if(running&&!demoMode&&matchLive){
      gb.style.display='flex';
      let h=goalStatus();
      /* Annihilate keys off livingEnemyCommanders(). Those units spawn in
         newSkirmish, but a first HUD paint (or a failed slot) can still read
         0 while the clock is 10:00 — QA read that as "already won". If AI
         seats are on and the match is still in the opening seconds, say
         inbound instead of a fake zero. */
      if(typeof goalDef==='function'&&goalDef().id==='annihilate'){
        const live=typeof livingEnemyCommanders==='function'?livingEnemyCommanders().length:0;
        let seats=0;
        if(typeof aiSlots!=='undefined') for(let i=0;i<aiSlots.length;i++) if(aiSlots[i]&&aiSlots[i].on&&!aiSlots[i].ally) seats++;
        if(live===0&&seats>0&&(typeof stats==='undefined'||(stats.t|0)<12))
          h='\u2620 enemy commanders inbound: '+seats;
      }
      const contact=typeof openingContactRemaining==='function'?openingContactRemaining():0;
      if(contact>0){
        const cs=Math.ceil(contact),cm=(cs/60)|0,cr=cs%60;
        h='<span class="firstContact">\u25c8 FIRST CONTACT '+cm+':'+(cr<10?'0':'')+cr+'</span> '+h;
      }
      if(timeLimit>0){
        const m2=(matchClock/60)|0, s2=(matchClock%60)|0;
        h+=' <span class="clk'+(matchClock<60?' low':'')+'">'+m2+':'+(s2<10?'0':'')+s2+'</span>';
      }
      /* updateHUD runs ~6x a second but this string only changes once a second
         (the clock) — so five of every six assignments reparsed identical HTML
         and invalidated layout for nothing, inside the frame loop. The handler
         was also a fresh closure every pass. */
      if(gb._mfH!==h){ gb._mfH=h; gb.innerHTML=h; }
      if(!gb.onclick) gb.onclick=()=>toast(goalDef().em+' '+goalDef().nm+' — '+goalDef().ds);
    } else hudDisp(gb,'none');
  }
  // hive threat meter
  const im=$('infMeter');
  if(im){
    if(running&&!demoMode){
      if(typeof infestationOn==='boolean'&&!infestationOn){
        /* The disabled swarm is a setup rule, not a live threat. Keeping its
           confirmation chip on-screen consumed scarce phone HUD space. */
        hudDisp(im,'none');
        if(im._mfH!=='OFF'){ im._mfH='OFF'; im.innerHTML='🐛 INFESTATION OFF'; }
        hudCol(im,'#8fffc0');
        im.classList.remove('t4');
        if(!im._mfOffClick){ im._mfOffClick=1; im.onclick=()=>toast('Neutral map infestation disabled — no nests, guards, spread, eruptions, or tides.'); }
      } else {
      const tier=infTier(), bugs=teamCount[2];
      hudDisp(im,'flex');
      /* Name it for what it is. "HIVE III" is the same label whether the swarm
         is this match's enemy army or the local wildlife, and those are very
         different things for a player deciding whether to go clear it. */
      const isArmy=(typeof broodIsEnemy==='function')&&broodIsEnemy();
      /* Neutral wildlife is background ecology at tier I, not an emergency.
         Showing a permanent row from the first second made the opening HUD
         look like an active crisis. Bring the meter in once the infestation
         reaches tier II; an actual Brood enemy remains visible immediately. */
      if(!isArmy&&tier<2){ im.style.display='none'; im.classList.remove('t4'); }
      else{
      const imH=(isArmy?'🐛 BROOD ':'🐛 WILDLIFE ')+['','I','II','III','IV','V'][tier]
        +' <span style="color:'+(tier>=4?'#ff8d7a':tier>=3?'#ffd257':'#9fc6e0')+'">'+bugs+'</span>';
      if(im._mfH!==imH){ im._mfH=imH; im.innerHTML=imH; }
      im.style.color=tier>=4?'#ffb0a2':tier>=3?'#ffe9ad':'#cfe8ff';
      im.classList.toggle('t4',tier>=4);
      im.onclick=()=>toast('🐛 Hive threat tier '+tier+' — '+liveNests().length+' hives, '+bugs
        +' bugs alive. Eruptions grow with time. Destroy hives for +200 mass bounties!');
      }
      }
    } else im.style.display='none';
  }
  showWcBanner();
  showHazChip();
  showConsHud();
}

/* ---------- WILDCARD ACTIVE BANNER (top bar during match) ---------- */
let _mfWcBannerEl=null;
function showWcBanner(){
  if(!_mfWcBannerEl){
    _mfWcBannerEl=document.createElement('div');
    _mfWcBannerEl.id='wcBanner';
    document.body.appendChild(_mfWcBannerEl);
  }
  if(!wcActive||!wcActive.length||!matchLive){ _mfWcBannerEl.style.display='none'; return; }
  const mult=Math.round((wcRewardMult()-1)*100);
  /* The modifier names are available on tap. Repeating every modifier icon in
     the live HUD consumed a whole row and duplicated the setup preview. */
  const h='<span class="wcBCount">'+wcActive.length+' MOD</span><span class="wcBMult">+'+mult+'%</span>';
  if(_mfWcBannerEl._h!==h){ _mfWcBannerEl._h=h; _mfWcBannerEl.innerHTML=h; }
  _mfWcBannerEl.style.display='flex';
  _mfWcBannerEl.onclick=()=>toast(wcActive.map(w=>w.em+' '+w.nm+': '+w.ds).join('  ·  '));
}

/* Map-exclusive weather. Wildcards are optional modifiers (#wcBanner); this
   chip is the theatre's own hazard so the player can read the sky without
   opening setup. Injected like the wildcard banner. */
let _mfHazChipEl=null,_mfHazChipWatch=false;
function showHazChip(){
  if(!_mfHazChipEl){
    _mfHazChipEl=document.createElement('div');
    _mfHazChipEl.id='hazChip';
    _mfHazChipEl.setAttribute('role','button');
    _mfHazChipEl.setAttribute('aria-label','Map weather');
    document.body.appendChild(_mfHazChipEl);
    if(!_mfHazChipWatch&&typeof mfFlowWatch!=='undefined'&&mfFlowWatch){
      mfFlowWatch.observe(_mfHazChipEl,{attributes:true,attributeFilter:['style','class']});
      _mfHazChipWatch=true;
    }
  }
  const live=!demoMode&&matchLive;
  const D=live&&typeof mapHazardDef==='function'?mapHazardDef(typeof curMap!=='undefined'?curMap:''):null;
  const show=!!(D&&D.nm);
  const h=show?'<span class="hazEm">'+(D.em||'⚠')+'</span><span class="hazNm">'+D.nm+'</span>':'';
  const disp=show?'flex':'none';
  const changed=_mfHazChipEl._mfH!==h||_mfHazChipEl.style.display!==disp;
  if(_mfHazChipEl._mfH!==h){ _mfHazChipEl._mfH=h; _mfHazChipEl.innerHTML=h; }
  _mfHazChipEl.style.display=disp;
  if(show&&!_mfHazChipEl.onclick) _mfHazChipEl.onclick=()=>{
    const d=typeof mapHazardDef==='function'?mapHazardDef(curMap):null;
    if(d) toast((d.em||'⚠')+' '+d.nm+(d.ds?' — '+d.ds:''));
  };
  if(changed&&typeof mfFlowQueueLayout==='function') mfFlowQueueLayout();
}

/* ---------- CONSUMABLE HUD (bottom-left during match) ---------- */
let _mfConsHudEl=null;
function showConsHud(){
  if(!_mfConsHudEl){
    _mfConsHudEl=document.createElement('div');
    _mfConsHudEl.id='consHud';
    document.body.appendChild(_mfConsHudEl);
  }
  if(!_mfMatchCons||!_mfMatchCons.length||!matchLive){ _mfConsHudEl.style.display='none'; return; }
  const b=invBag();
  let h='';
  for(const c of _mfMatchCons){
    const stock=b.consumables[c.id]||0;
    h+='<div class="conHudSlot" title="'+c.nm+': '+c.ds+'"><span class="conHudEm">'+c.em+'</span>'
      +'<span class="conHudNm">'+c.nm+'</span><span class="conHudCt">'+stock+'</span></div>';
  }
  if(_mfConsHudEl._h!==h){ _mfConsHudEl._h=h; _mfConsHudEl.innerHTML=h; }
  _mfConsHudEl.style.display='flex';
}

/* ---------- PRE-MATCH MODIFIER SPLASH ---------- */
let _mfMatchCons=null, _mfMatchGear=null;
function showModSplash(){
  const hasWc=wcActive&&wcActive.length;
  const hasCons=_mfMatchCons&&_mfMatchCons.length;
  const hasGear=_mfMatchGear&&_mfMatchGear.length;
  if(!hasWc&&!hasCons&&!hasGear) return;
  const el=document.createElement('div'); el.id='modSplash';
  const inner=document.createElement('div'); inner.id='modSplashInner';
  let h='<div class="msTitle">MODIFIERS ACTIVE</div>';
  if(hasWc) for(const w of wcActive)
    h+='<div class="msRow"><span class="msEm">'+w.em+'</span><span class="msNm">'+w.nm+'</span><span class="msTag">WILDCARD</span></div>';
  if(hasGear) for(const g of _mfMatchGear){
    const r=invRarity(g.rarity);
    h+='<div class="msRow"><span class="msEm">'+g.em+'</span><span class="msNm">'+g.nm+'</span><span class="msTag" style="color:'+r.col+'">'+r.nm+'</span></div>';
  }
  if(hasCons) for(const c of _mfMatchCons){
    const r=invRarity(c.rarity);
    h+='<div class="msRow"><span class="msEm">'+c.em+'</span><span class="msNm">'+c.nm+'</span><span class="msTag" style="color:'+r.col+'">'+r.nm+'</span></div>';
  }
  inner.innerHTML=h;
  el.appendChild(inner);
  document.body.appendChild(el);
  el.style.display='flex';
  el.style.opacity='1';
  setTimeout(()=>{ el.style.transition='opacity 0.6s'; el.style.opacity='0';
    setTimeout(()=>{ if(el.parentNode) el.parentNode.removeChild(el); },650); },3000);
}

/* ---------- MODIFIER TOOLTIP (long-press on gear/consumable cards) ---------- */
let _mfTooltipEl=null, _mfLpTimer=null;
function showModTooltip(it,kind,x,y){
  if(!_mfTooltipEl){
    _mfTooltipEl=document.createElement('div');
    _mfTooltipEl.id='modTooltip';
    document.body.appendChild(_mfTooltipEl);
  }
  const r=invRarity(it.rarity);
  const fx=typeof armInvEffect==='function'?armInvEffect(it.id):{value:'',stat:''};
  const slot=kind==='wildcard'?'WILDCARD':kind==='gear'?it.slot.toUpperCase():'CONSUMABLE';
  let h='<div class="mtName" style="color:'+r.col+'">'+it.em+' '+it.nm+'</div>'
    +'<div class="mtRarity" style="color:'+r.col+'">'+r.nm+' · '+slot+'</div>'
    +'<div class="mtDesc">'+it.ds+'</div>';
  if(fx.value) h+='<div class="mtSlot">'+fx.value+' '+fx.stat+'</div>';
  _mfTooltipEl.innerHTML=h;
  const vw=window.innerWidth, vh=window.innerHeight;
  const tx=Math.min(x,vw-270), ty=Math.max(10,Math.min(y-120,vh-160));
  _mfTooltipEl.style.left=tx+'px'; _mfTooltipEl.style.top=ty+'px';
  _mfTooltipEl.style.display='block';
}
function hideModTooltip(){
  if(_mfTooltipEl) _mfTooltipEl.style.display='none';
  if(_mfLpTimer){ clearTimeout(_mfLpTimer); _mfLpTimer=null; }
}
function armInvLongPress(el){
  el.addEventListener('pointerdown',ev=>{
    const id=el.dataset.invId, kind=el.dataset.invKind;
    if(!id) return;
    const it=(kind==='gear'?INV_GEAR:INV_CONSUMABLES).find(x=>x.id===id);
    if(!it) return;
    const x=ev.clientX, y=ev.clientY;
    _mfLpTimer=setTimeout(()=>showModTooltip(it,kind,x,y),500);
  });
  el.addEventListener('pointerup',hideModTooltip);
  el.addEventListener('pointerleave',hideModTooltip);
  el.addEventListener('pointercancel',hideModTooltip);
}

/* ---------- coach banners: tell the player HOW to fix a stall ---------- */
let coachCd=0, stallEAcc=0, stallMAcc=0, fullAcc=0, coachHideT=0;
function showCoach(msg){
  const el=$('coach'); if(!el) return;
  el.textContent=msg; el.style.opacity=1;
  clearTimeout(coachHideT);
  coachHideT=setTimeout(()=>el.style.opacity=0,5200);
}
function coachTick(){                              // called ~6x/sec from updateHUD
  if(!running||demoMode) return;
  coachCd-=0.16;
  stallEAcc = stallE>0? stallEAcc+0.16 : 0;
  stallMAcc = stallM>0? stallMAcc+0.16 : 0;
  fullAcc   = resM[0]>=RES_MCAP[0]-1? fullAcc+0.16 : 0;
  if(coachCd>0) return;
  /* A stalled economy is the most punishing state in the game and it was the
     only one with a dedicated on-screen warning and no sound at all. Gated by
     the existing 30 s coachCd on top of notify's own 220 ms gap. */
  if(stallEAcc>2.5){ showCoach('⚡ LOW ENERGY — production stalled. Build ☀ Reactors or a ✦ Geo Plant'); coachCd=30; stallEAcc=0; sfx('notify'); }
  else if(stallMAcc>2.5){ showCoach('⛏ LOW MASS — production stalled. Claim more ◆ deposits with Extractors'); coachCd=30; stallMAcc=0; sfx('notify'); }
  else if(fullAcc>12){ showCoach('🛢 STORAGE FULL — '+Math.round(mWasted)+' mass wasted. Build a Silo, a Fabricator, or spend it'); coachCd=45; fullAcc=0; }
}

/* ---------- unit / building purpose cards ---------------------------------
   The old card only appeared after a hidden 520 ms long-press. That is useful
   for experts, but it cannot teach a first-time player what a Rhino or Reactor
   is for because they have no reason to discover the gesture. These helpers
   derive readable roles from the combat data the simulation already uses, so
   every present and future roster entry gets an honest card without a second
   hand-maintained unit encyclopedia. */
const INTEL_ROLE_COPY={
  inf:'Fast frontline pressure unit', veh:'Durable direct-fire battle unit',
  at:'High-damage armor hunter', aoe:'Area-control unit for packed enemies',
  art:'Long-range siege unit; protect it up close', aa:'Dedicated air-defense unit',
  air:'Fast aircraft for rapid response', nav:'Water-only combat vessel',
  sup:'Utility support unit', exp:'Late-game experimental war machine',
  hero:'Hero commander: builds, fights, and anchors the army'
};
const INTEL_BUILD_COPY={
  eco:'Produces or stores battlefield resources', prod:'Builds combat units',
  def:'Defends an area automatically', wall:'Controls ground movement',
  tech:'Unlocks and strengthens advanced systems', sup:'Extends and sustains the base',
  sup2:'Strategic weapon for decisive strikes'
};
/* A category tab must answer more than “which cards are hidden underneath
   it?”. These short tactical briefs make the taxonomy useful to a newcomer:
   what the role accomplishes, which formation supports it, and the mistake
   that normally gets it killed. They deliberately sit above the card grid so
   the player can understand the decision before spending resources. */
const INTEL_ROLE_GUIDE={
  inf:{tag:'LINE TROOPS',form:'WEDGE / SPREAD',use:'Capture ground, screen expensive weapons, and pressure exposed economy.',avoid:'Do not mass into splash or flame.'},
  veh:{tag:'ARMOURED CORE',form:'BATTLE LINE',use:'Hold the centre and trade efficiently under sustained fire.',avoid:'Screen against gauss and dedicated anti-tank.'},
  at :{tag:'HEAVY HUNTERS',form:'LINE / ARC',use:'Delete plated targets with focused, deliberate volleys.',avoid:'Keep light swarms outside minimum range.'},
  aoe:{tag:'CROWD BREAKERS',form:'SPREAD',use:'Punish dense infantry and biological waves with splash damage.',avoid:'Protect them from long-range armour hunters.'},
  art:{tag:'SIEGE BATTERY',form:'ARC / LINE',use:'Break towers and formations from beyond normal weapon range.',avoid:'Scout first; artillery folds at close range.'},
  aa :{tag:'AIR DENIAL',form:'SPREAD / BOX',use:'Escort valuable columns and deny bomber approaches.',avoid:'Specialists lose value against ground-only armies.'},
  air:{tag:'RAPID RESPONSE',form:'WEDGE',use:'Scout, flank, and strike weak points without following ground paths.',avoid:'Never loiter inside layered anti-air.'},
  nav:{tag:'SEA CONTROL',form:'LINE',use:'Own coastlines and project heavy fire onto nearby land.',avoid:'Water-only movement makes positioning a commitment.'},
  sup:{tag:'FORCE MULTIPLIER',form:'BOX / COLUMN',use:'Repair, shield, build, and keep the fighting line operational.',avoid:'Unarmed support needs an escort.'},
  exp:{tag:'DECISIVE ASSET',form:'BOX',use:'Anchor a late-game push and force the enemy to answer one threat.',avoid:'High cost makes isolation and focus fire disastrous.'}
};
const INTEL_BUILD_GUIDE={
  eco :{tag:'RESOURCE GRID',use:'Secure income and storage before expanding production.',chain:'DEPOSIT → EXTRACTOR → STORAGE'},
  prod:{tag:'ARMY PIPELINE',use:'Set rally points, maintain queues, and diversify unit counters.',chain:'POWER → FACTORY → RALLY'},
  nav :{tag:'SEA CONTROL',use:'Launch fleets and coastal fire support from connected navigable water.',chain:'COAST → HARBOR → FLEET'},
  def :{tag:'DEFENCE LAYER',use:'Overlap ranges so one tower covers another tower’s weakness.',chain:'SCOUT → SCREEN → KILL ZONE'},
  wall:{tag:'PATH CONTROL',use:'Shape enemy movement without trapping your own reinforcements.',chain:'WALL → GATE → CROSS-FIRE'},
  tech:{tag:'ACCOUNT RESEARCH',use:'Protect the lab network; completed studies persist beyond the match.',chain:'LAB → STUDY → ACCOUNT DATA'},
  sup :{tag:'BATTLE NETWORK',use:'Extend territory, shielding, repairs, and targeting coverage.',chain:'UPLINK → COVERAGE → ADVANCE'},
  sup2:{tag:'STRATEGIC STRIKE',use:'Scout the target and force movement before committing the long cooldown.',chain:'VISION → LOCK → LAUNCH'}
};
const INTEL_BLD_WEAPONS={
  turret:{wk:'b',rng:()=>TURRET_RNG,tg:'a'}, bunker:{wk:'e',rng:()=>BUNKER.rng,tg:'g'},
  aatower:{wk:'e',rng:()=>AA.rng,tg:'air'}, bastion:{wk:'e',rng:()=>BASTION.rng,min:()=>BASTION.minRng,tg:'g'},
  seafort:{wk:'e',rng:()=>DEF_WEAPON_DATA.seafort.rng,min:()=>DEF_WEAPON_DATA.seafort.min,tg:'g'},
  hellstorm:{wk:'p',rng:()=>HELL.rng,tg:'g'}, arc:{wk:'b',rng:()=>ARC.rng,tg:'a'},
  rail:{wk:'g',rng:()=>RAIL.rng,tg:'g'}, minelaser:{wk:'b',rng:()=>MINELASER.rng,tg:'g'},
  missilebastion:{wk:'e',rng:()=>MISSILE_BASTION.rng,tg:'g'},
  plasma:{wk:'i',rng:()=>PLASMA_CHARGER.rng,tg:'g'},
  stormcaller:{wk:'e',rng:()=>STORM.rng,min:()=>STORM.minRng,tg:'g'},
  nova:{wk:'e',rng:()=>MAP,tg:'g'}
};
const INTEL_TARGET={a:['◎','AIR + GROUND'],g:['⌖','GROUND'],air:['✈','AIR']};
let intelPrimaryUnit=-1, intelSeenTypes={}, intelSeenBlds={};
function intelTarget(T){ return INTEL_TARGET[(T&&T.tg)||'a']||INTEL_TARGET.a; }
function intelRangeBand(r){
  if(r>=350) return 'EXTREME';
  if(r>=200) return 'LONG';
  if(r>=110) return 'MEDIUM';
  if(r>0) return 'CLOSE';
  return '—';
}
function intelUnitPurpose(T){
  if(T.miner) return 'Mobile phase-ore miner. Cycle MINE, ASSIST and SURVEY orders to gather or accelerate production.';
  if(T.caster) return 'Critical-mass Brood leader. Its aura turns nearby creatures into a faster coordinated tide.';
  if(T.builder) return 'Unarmed mobile engineer. Builds structures, auto-repairs nearby damage and salvages wrecks at 2× speed.';
  if(T.name==='Bulwark') return 'Mobile shield projector that reduces damage to nearby allied units.';
  if(T.scout) return 'High-speed reconnaissance aircraft for finding threats and flanking exposed targets.';
  if(T.dmg<=0) return 'Unarmed support chassis. Keep it behind the frontline and out of direct fire.';
  let s=INTEL_ROLE_COPY[T.cat]||INTEL_ROLE_COPY.veh;
  /* The Bulwark bubble has exactly one answer in the roster and the game never
     said which. A counter the player cannot discover is not a counter — it just
     makes massed shields look unbeatable until someone reads the source. */
  if(WK_PIERCE[T.wk]) s+='. Its fire passes straight through Bulwark shields';
  /* WK_HORDE — the crowd multiplier — appeared nowhere in the entire product
     outside sim.js: the definition, one comment and the damage maths. It is
     the designed answer to a thousand-strong wildlife tide, and no player
     could discover it by playing. */
  if(T.aoe>=24) s+='. Splash damage punishes clustered targets'+
    (WK_HORDE[T.wk]?', and gets stronger the more of them are packed into the blast':'');
  if(T.minRng) s+='. Keep enemies outside its minimum range';
  return s+'.';
}
function intelUnitCounters(T){
  const strong=[],weak=[];
  if(T.wk!=='n') for(let a2=0;a2<3;a2++){
    const m=(WKM[T.wk]||WKM.n)[a2];
    if(m>=1.15) strong.push(ARM_NM[a2]);
    else if(m<=0.85) weak.push(ARM_NM[a2]);
  }
  return {strong,weak};
}
function intelUnitMini(T){
  const C=UCAT[T.cat]||UCAT.veh, tg=intelTarget(T), ct=intelUnitCounters(T);
  if(T.wk==='n') return C.em+' '+C.nm+' · NON-COMBAT';
  return tg[0]+' '+tg[1]+' · ✓ '+(ct.strong[0]||'GENERAL');
}
function intelBldPurpose(key){
  const T=BT[key], P=INTEL_BLD_WEAPONS[key];
  let s=T.desc||INTEL_BUILD_COPY[T.bcat]||'Battlefield structure';
  if(P&&P.min) s+=(/[.!?]$/.test(s)?' ':'; ')+'keep enemies outside its minimum range.';
  return s;
}
function intelBldMini(key){
  const T=BT[key], C=BCAT[T.bcat]||BCAT.sup, P=INTEL_BLD_WEAPONS[key];
  return C.em+' '+C.nm+(P?' · '+intelTarget(P)[0]+' '+intelTarget(P)[1]:'');
}
function armorThreats(ai2){                        // which weapons punish this armor class
  const s=[];
  for(const w in WKM){ if(w!=='n'&&WKM[w][ai2]>=1.15) s.push(WK_NM[w]); }
  return s.join(', ')||'none';
}
const INTEL_ARMOR_ICON=['◇','⬢','⬣'];
/* Matchup cells read as traffic lights, not numbers: >1.2 pays green, 0.8-1.2
   is a coin flip (yellow), <0.8 is a bad matchup (red). The old two-state
   split at 1.15/0.85 hid the large neutral band the triangle actually lives in. */
function intelMulTone(m){ return m>1.2?'good':m<0.8?'bad':'warn'; }
function intelMulChip(icon,label,m){
  const pct=Math.round((m-1)*100),delta=pct>0?'+'+pct+'%':pct<0?pct+'%':'EVEN';
  return '<span class="ucMatchChip '+intelMulTone(m)+'" title="'+label+' effectiveness '+m.toFixed(2)+' times">'
    +'<i>'+icon+'</i><b>'+label+'</b><em>'+m.toFixed(2)+'×</em><small>'+delta+'</small></span>';
}
function intelWeaponMatchups(wk){
  const M=WKM[wk]||WKM.n;
  return '<div class="ucMatchRow"><strong>WEAPON VS</strong><div>'
    +M.map((m,i)=>intelMulChip(INTEL_ARMOR_ICON[i],ARM_NM[i],m)).join('')+'</div></div>';
}
function intelArmorThreatMatchups(ai2){
  const ranked=Object.keys(WKM).filter(w=>w!=='n').map(w=>({w,m:WKM[w][ai2]}))
    .sort((a,b)=>b.m-a.m).slice(0,3);
  return '<div class="ucMatchRow incoming"><strong>YOUR ARMOR FEARS</strong><div>'
    +ranked.map(x=>intelMulChip('◆',WK_NM[x.w],x.m)).join('')+'</div></div>';
}
function intelStructureThreats(){
  const ranked=Object.keys(STM).filter(w=>w!=='n').map(w=>({w,m:STM[w]}))
    .sort((a,b)=>b.m-a.m).slice(0,3);
  return '<div class="ucMatchRow incoming"><strong>STRUCTURE FEARS</strong><div>'
    +ranked.map(x=>intelMulChip('◆',WK_NM[x.w],x.m)).join('')+'</div></div>';
}
function intelChip(icon,label,tone){
  return '<span class="ucChip'+(tone?' '+tone:'')+'"><i>'+icon+'</i>'+label+'</span>';
}

/* ---------- live mesh intelligence previews --------------------------------
   Purpose cards used to stop at icon + prose even though the exact production
   meshes are already resident in UNIT_GEO / BLD_MDL. A tiny isolated WebGL2
   renderer consumes those factories directly. It deliberately keeps its own
   context rather than borrowing the battlefield one: that would have to move
   the command camera and risks leaving the post stack on texture units 4/5/6 in
   the wrong state after a UI draw. ONE context, though — see mfIntel3DShared.
   Per-card contexts are what force-lost the battlefield. */
const MF_INTEL3D_VS=`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
layout(location=4) in float aMat;
uniform mat4 uVP;
uniform vec3 uCenter;
uniform vec3 uOffset;
uniform vec3 uTint;
uniform float uScale;
uniform float uPartScale;
uniform float uYaw;
out vec3 vN; out vec3 vC; flat out float vMat;
void main(){
  float c=cos(uYaw),s=sin(uYaw);
  vec3 q=aPos*uPartScale+uOffset-uCenter;
  vec3 p=vec3(q.x*c-q.z*s,q.y,q.x*s+q.z*c)*uScale;
  vec3 n=vec3(aNrm.x*c-aNrm.z*s,aNrm.y,aNrm.x*s+aNrm.z*c);
  float team=aMat<0.0?1.0:0.0;
  vC=mix(aCol,uTint,team*.82+(1.0-team)*.12);vN=n;vMat=abs(aMat)-1.0;
  gl_Position=uVP*vec4(p,1.0);
}`;
const MF_INTEL3D_FS=`#version 300 es
precision highp float;
in vec3 vN; in vec3 vC; flat in float vMat; out vec4 o;
void main(){
  vec3 n=normalize(vN), sun=normalize(vec3(-.46,.82,.34));
  float direct=max(dot(n,sun),0.0), hemi=.72+.28*(n.y*.5+.5);
  float rim=pow(1.0-max(dot(n,normalize(vec3(.34,.24,.91))),0.0),3.0);
  vec3 lin=pow(max(vC,vec3(.001)),vec3(2.2))*(.32+.75*direct)*hemi;
  lin+=vec3(.12,.45,.72)*rim*.22;
  o=vec4(pow(max(lin,vec3(0.0)),vec3(1.0/2.2)),1.0);
}`;
function mfIntel3DShader(g,type,src){
  const s=g.createShader(type);g.shaderSource(s,src);g.compileShader(s);
  if(!g.getShaderParameter(s,g.COMPILE_STATUS)){ g.deleteShader(s); return null; }
  return s;
}
function mfIntel3DProgram(g){
  const v=mfIntel3DShader(g,g.VERTEX_SHADER,MF_INTEL3D_VS),f=mfIntel3DShader(g,g.FRAGMENT_SHADER,MF_INTEL3D_FS);
  if(!v||!f) return null;
  const p=g.createProgram();g.attachShader(p,v);g.attachShader(p,f);g.linkProgram(p);g.deleteShader(v);g.deleteShader(f);
  if(!g.getProgramParameter(p,g.LINK_STATUS)){g.deleteProgram(p);return null;} return p;
}
function mfIntelKit(kit){
  const raw=kit||((typeof playerKitKey==='function')?playerKitKey():'nova');
  return typeof factionKitKey==='function'?factionKitKey(raw):raw;
}
function mfIntelTint(kit){
  const k=mfIntelKit(kit),F=(typeof FACTIONS!=='undefined'&&FACTIONS[k])||null;
  if(F&&F.col) return F.col.map(v=>v/255);
  const A=(typeof facArt==='function'&&facArt(k))||null,h=A&&A.col&&A.col.replace('#','');
  return h&&h.length===6?[parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255]:[.36,.71,1];
}
function mfIntel3DSource(kind,id,kit){
  try{
    kit=mfIntelKit(kit);
    if(kind==='unit'){
      /* The player's own chassis, not the base roster's. The battlefield has
         resolved the faction kit since 1.32.4x; these previews never did, so
         the card and the thing standing in front of you disagreed. */
      const G=typeof factionUnitGeo==='function'?factionUnitGeo(id,kit,true):null;
      if(!G) return null;
      const out=[{geo:G.hull,off:0,sc:1}];
      if(G.tur) out.push({geo:G.tur,off:G.turH||0,sc:1});
      return out;
    }
    /* Same for structures: every faction ships a complete 27-building kit, and
       the build menu was showing the Nova one to all of them. */
    const S=(typeof factionBldMdlSet==='function')?factionBldMdlSet(kit,true):null;
    const MDL=S&&S.mdl&&S.mdl[id]?S.mdl:null;
    if(!MDL||!MDL[id]) return null;
    const TUR=S.tur,TH=S.h,TS=S.sc;
    const out=[{geo:MDL[id](),off:0,sc:1}];
    if(TUR&&TUR[id])
      out.push({geo:TUR[id](),off:(TH&&TH[id])||0,sc:(TS&&TS[id])||1});
    return out;
  }catch(e){return null;}
}
/* ---------- ONE context for every preview, live cards included --------------
   Chrome allows 16 active WebGL contexts per page and force-loses the OLDEST
   when a 17th is created. The battlefield context (src/engine/gl.js) is created
   first, so it is ALWAYS the oldest: giving each intel card its own context —
   and never releasing it, because dispose() only deleted the program — meant
   that opening and closing about fifteen cards took the ground out from under a
   live match. glrecover.js caught the loss honestly and put GRAPHICS PAUSED on
   top of a black battlefield, which is the bug as the player experiences it.

   So the cards no longer own contexts. A card canvas is an ordinary 2D surface
   that receives a finished frame. All the geometry still belongs to the view
   that built it — VAOs and buffers are per-CONTEXT, not per-canvas, so any
   number of views can keep their own resources resident in this one context and
   nothing is rebuilt per frame. Total cost: one context for the whole UI, for
   any number of cards, forever. This is the same reasoning mfIntelThumbPump's
   comment below already recorded; the live cards simply never followed it. */
let mfIntel3DGL=null,mfIntel3DSurf=null,mfIntel3DProg=null;
const MF_INTEL3D_MAXPX=2048;
function mfIntel3DShared(){
  if(mfIntel3DGL) return mfIntel3DGL;
  if(mfIntel3DSurf) return null;                 // asked once, refused: do not keep asking
  const c=document.createElement('canvas');c.width=c.height=8;mfIntel3DSurf=c;
  const g=mfCreateWebGL2(c,{alpha:true,antialias:true,depth:true,premultipliedAlpha:true});
  if(!g) return null;
  /* preventDefault() or the browser never offers this context back. Every view
     remembers its subject, so a restore rebuilds its buffers from the model
     factories rather than leaving a grid of dead cards. */
  c.addEventListener('webglcontextlost',e=>{
    e.preventDefault();mfIntel3DProg=null;
    for(const V of mfIntel3DViews) V.parts=[];
    if(mfIntelThumbView) mfIntelThumbView.parts=[];
  },false);
  c.addEventListener('webglcontextrestored',()=>{
    mfIntel3DProg=mfIntel3DProgram(mfIntel3DGL);
    for(const V of mfIntel3DViews) V.revive();
    if(mfIntelThumbView) mfIntelThumbView.revive();
  },false);
  mfIntel3DGL=g;mfIntel3DProg=mfIntel3DProgram(g);
  return g;
}
class MFIntelPreview3D{
  constructor(canvas,kind,id,kit){
    this.canvas=canvas;this.gl=mfIntel3DShared();
    this.ctx=this.gl?canvas.getContext('2d'):null;
    this.program=(this.gl&&this.ctx)?mfIntel3DProg:null;
    this.parts=[];this.last=0;this.reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
    if(!this.program) return;
    this.locate();
    this.setSubject(kind,id,kit);
  }
  locate(){
    const g=this.gl,p=this.program;
    this.U={vp:g.getUniformLocation(p,'uVP'),center:g.getUniformLocation(p,'uCenter'),offset:g.getUniformLocation(p,'uOffset'),
      tint:g.getUniformLocation(p,'uTint'),scale:g.getUniformLocation(p,'uScale'),partScale:g.getUniformLocation(p,'uPartScale'),yaw:g.getUniformLocation(p,'uYaw')};
  }
  /* After a restore the program is new and every buffer is gone; rebuild from
     the remembered subject. */
  revive(){
    this.program=(this.gl&&this.ctx)?mfIntel3DProg:null;this.parts=[];
    if(!this.program||this.kind===undefined) return;
    this.locate();this.setSubject(this.kind,this.id,this.kit);
  }
  release(){
    const g=this.gl;
    if(g&&!g.isContextLost())
      for(const P of this.parts){g.deleteVertexArray(P.vao);g.deleteBuffer(P.vb);g.deleteBuffer(P.ib);}
    this.parts=[];
  }
  setSubject(kind,id,kit){
    if(!this.program) return false;
    kit=mfIntelKit(kit);
    const src=mfIntel3DSource(kind,id,kit);if(!src||!src.length) return false;
    this.release();this.kind=kind;this.id=id;this.kit=kit;
    const g=this.gl,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const S of src){
      if(!S.geo||!S.geo.v||!S.geo.i) continue;
      /* Same stride the mesh builder writes. This viewer keeps its own VAO and
         had 12 baked into both the bounds walk and the attribute pointers, so
         when the vertex grew a bone index every model in the LIVE 3D panel
         sheared into coloured shards. */
      for(let i=0;i<S.geo.v.length;i+=VFLOATS){
        const x=S.geo.v[i]*S.sc,y=S.geo.v[i+1]*S.sc+S.off,z=S.geo.v[i+2]*S.sc;
        if(x<min[0])min[0]=x;if(y<min[1])min[1]=y;if(z<min[2])min[2]=z;
        if(x>max[0])max[0]=x;if(y>max[1])max[1]=y;if(z>max[2])max[2]=z;
      }
      const vao=g.createVertexArray();g.bindVertexArray(vao);
      const vb=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,vb);g.bufferData(g.ARRAY_BUFFER,S.geo.v,g.STATIC_DRAW);
      for(const [loc,n,off] of [[0,3,0],[1,3,12],[2,3,24],[4,1,44]]){
        g.enableVertexAttribArray(loc);g.vertexAttribPointer(loc,n,g.FLOAT,false,VFLOATS*4,off);
      }
      const ib=g.createBuffer();g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,ib);g.bufferData(g.ELEMENT_ARRAY_BUFFER,S.geo.i,g.STATIC_DRAW);
      this.parts.push({vao,vb,ib,count:S.geo.count,off:S.off,sc:S.sc});
    }
    g.bindVertexArray(null);
    if(!this.parts.length) return false;
    this.center=[(min[0]+max[0])*.5,(min[1]+max[1])*.5,(min[2]+max[2])*.5];
    this.scale=2.15/Math.max(1,max[0]-min[0],max[1]-min[1],max[2]-min[2]);
    this.tint=mfIntelTint(kit);this.dirty=true;return true;
  }
  draw(ts){
    if(!this.program||!this.parts.length||(!this.dirty&&ts-this.last<34)) return;this.last=ts;this.dirty=false;
    const r=this.canvas.getBoundingClientRect();if(r.width<8||r.height<8) return;
    const d=Math.min(1.6,window.devicePixelRatio||1),
      w=Math.min(MF_INTEL3D_MAXPX,Math.max(64,Math.round(r.width*d))),
      h=Math.min(MF_INTEL3D_MAXPX,Math.max(56,Math.round(r.height*d)));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    const g=this.gl,S=mfIntel3DSurf;
    if(g.isContextLost()) return;
    /* The shared drawing buffer only ever grows, so cards of different sizes do
       not force a reallocation every frame. */
    if(S.width<w||S.height<h){S.width=Math.max(S.width,w);S.height=Math.max(S.height,h);}
    const P=m4(),V=m4(),VP=m4();m4persp(P,.58,w/h,.1,20);m4look(V,3.1,2.05,4.0,0,0,0,0,1,0);m4mul(VP,P,V);
    /* Row 0 of a drawing buffer is the BOTTOM of the presented image, so render
       into the top band and the blit below reads a plain (0,0,w,h). Scissor as
       well as viewport, or the clear would wipe a neighbour's band. */
    const y0=S.height-h;
    g.viewport(0,y0,w,h);g.enable(g.SCISSOR_TEST);g.scissor(0,y0,w,h);
    g.clearColor(0,0,0,0);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);
    g.enable(g.DEPTH_TEST);g.disable(g.CULL_FACE);g.useProgram(this.program);
    g.uniformMatrix4fv(this.U.vp,false,VP);g.uniform3fv(this.U.center,this.center);g.uniform3fv(this.U.tint,this.tint);
    g.uniform1f(this.U.scale,this.scale);g.uniform1f(this.U.yaw,this.reduced ? .72 : (ts*.00034)%TAU);
    for(const Q of this.parts){g.uniform3f(this.U.offset,0,Q.off,0);g.uniform1f(this.U.partScale,Q.sc);g.bindVertexArray(Q.vao);g.drawElements(g.TRIANGLES,Q.count,g.UNSIGNED_SHORT,0);}
    g.bindVertexArray(null);g.disable(g.SCISSOR_TEST);
    /* Copy out in the SAME task: the drawing buffer is cleared at the next
       composite, and it is shared, so the next card overwrites it regardless. */
    this.ctx.clearRect(0,0,w,h);this.ctx.drawImage(S,0,0,w,h,0,0,w,h);
  }
  /* The program belongs to the shared context and outlives every view, so this
     only drops what this view allocated. Nothing here can strand a context. */
  dispose(){this.release();this.program=null;}
}
const mfIntel3DViews=[];
let mfIntel3DRaf=0;
function mfIntel3DPump(ts){
  for(let i=mfIntel3DViews.length-1;i>=0;i--){
    const V=mfIntel3DViews[i];if(!V.canvas.isConnected){V.dispose();mfIntel3DViews.splice(i,1);continue;}
    if(V.canvas.offsetParent!==null) V.draw(ts);
  }
  mfIntel3DRaf=mfIntel3DViews.length?requestAnimationFrame(mfIntel3DPump):0;
}
/* Still thumbnails for every build/production card, rendered through the same
   single context as the live previews above (one view, reused, snapshotted to
   PNG). Giving every card its own context exhausts Android's context budget —
   and Chrome's, which is what killed the battlefield;
   using the legacy unit sheet gives every faction a Nova silhouette. The PNG
   cache is keyed by the exact runtime faction kit and model ID, so a tab can
   rebuild freely without rebuilding geometry or lying about the subject. */
const mfIntelThumbCache=new Map(),mfIntelThumbWait=new Map(),mfIntelThumbQueue=[];
let mfIntelThumbBusy=false,mfIntelThumbCanvas=null,mfIntelThumbView=null;
function mfIntelThumbKey(kind,id,kit){return kind+':'+mfIntelKit(kit)+':'+id;}
function mfIntelThumbRequest(img,holder,kind,id,kit){
  kit=mfIntelKit(kit);const key=mfIntelThumbKey(kind,id,kit),cached=mfIntelThumbCache.get(key);
  const done=url=>{
    if(!holder.isConnected)return;
    if(url){img.src=url;img.style.opacity='1';holder.classList.remove('missingFactionModel');}
    else if(kit!=='nova'){
      holder.replaceChildren();holder.classList.add('missingFactionModel');holder.dataset.faction=kit;
      const mark=document.createElement('span');mark.textContent='!';mark.setAttribute('aria-label',kit+' model unavailable');holder.appendChild(mark);
    }
  };
  if(cached!==undefined){done(cached);return;}
  const waits=mfIntelThumbWait.get(key);if(waits){waits.push(done);return;}
  mfIntelThumbWait.set(key,[done]);mfIntelThumbQueue.push({key,kind,id,kit});mfIntelThumbPump();
}
function mfIntelThumbPump(){
  if(mfIntelThumbBusy||!mfIntelThumbQueue.length)return;mfIntelThumbBusy=true;
  requestAnimationFrame(ts=>{
    const job=mfIntelThumbQueue.shift();let url='',subjectReady=false;
    try{
      if(!mfIntelThumbCanvas){
        mfIntelThumbCanvas=document.createElement('canvas');
        mfIntelThumbCanvas.style.cssText='position:fixed;left:-512px;top:0;width:104px;height:88px;pointer-events:none;opacity:0';
        document.body.appendChild(mfIntelThumbCanvas);
        mfIntelThumbView=new MFIntelPreview3D(mfIntelThumbCanvas,job.kind,job.id,job.kit);
        subjectReady=!!(mfIntelThumbView.program&&mfIntelThumbView.parts.length);
      }else subjectReady=mfIntelThumbView.setSubject(job.kind,job.id,job.kit);
      /* A failed strict lookup intentionally leaves the old buffers resident.
         Gate on this job's result or the cache would snapshot the previous
         faction and recreate the exact silent-fallback bug this path fixes. */
      if(subjectReady){mfIntelThumbView.dirty=true;mfIntelThumbView.draw(2100);url=mfIntelThumbCanvas.toDataURL('image/png');}
    }catch(e){url='';}
    mfIntelThumbCache.set(job.key,url);const waits=mfIntelThumbWait.get(job.key)||[];mfIntelThumbWait.delete(job.key);for(const fn of waits)fn(url);
    mfIntelThumbBusy=false;if(mfIntelThumbQueue.length)mfIntelThumbPump();
  });
}
function mfIntelPreviewWindow(kind,id,tag,kit){
  kit=mfIntelKit(kit);
  const w=document.createElement('div');w.className='mfIntelPreview';w.setAttribute('role','img');
  w.setAttribute('aria-label','Rotating live 3D '+(kind==='unit'?'unit':'structure')+' model preview');
  const c=document.createElement('canvas');c.setAttribute('aria-hidden','true');w.appendChild(c);
  const tx=document.createElement('span');tx.className='mfIntelPreviewTag';tx.textContent=tag||'LIVE 3D MODEL';w.appendChild(tx);
  requestAnimationFrame(()=>{
    const V=new MFIntelPreview3D(c,kind,id,kit);
    if(V.program&&V.parts.length){c._mfIntel3D=V;mfIntel3DViews.push(V);if(!mfIntel3DRaf)mfIntel3DRaf=requestAnimationFrame(mfIntel3DPump);}
    else{
      V.dispose();c.remove();const f=document.createElement('div');f.className='mfIntelFallback';
      /* Never disguise a missing faction asset as a Nova sprite. The explicit
         placeholder makes the broken catalogue entry actionable in QA. */
      if(kit==='nova'){
        const icon=kind==='unit'?unitIconEl(id,78,kit):bldIconEl(id,78,kit);if(icon)f.appendChild(icon);
      }else{
        f.classList.add('missingFactionModel');f.dataset.faction=kit;
        f.innerHTML='<b>MODEL UNAVAILABLE</b><span>'+kit.toUpperCase()+' '+kind.toUpperCase()+'</span>';
      }
      w.appendChild(f);
    }
  });
  return w;
}
function mfIntelAttachPreview(kind,id,kit){
  const el=$('unitCard'),head=el&&el.querySelector('.ucHead');if(!head)return;
  head.insertAdjacentElement('afterend',mfIntelPreviewWindow(kind,id,'LIVE 3D '+((typeof facArt==='function'&&facArt(kit||((typeof playerKitKey==='function')?playerKitKey():'nova'))||{}).nm||'MODEL'),kit));
}
function mfIntelPreviewSet(host,kind,id,kit){
  kit=mfIntelKit(kit);
  const c=host&&host.querySelector('canvas'),V=c&&c._mfIntel3D;
  if(V&&V.setSubject(kind,id,kit)) return;
  if(host){host.innerHTML='';host.appendChild(mfIntelPreviewWindow(kind,id,'LIVE 3D',kit));}
}
function mfMenuRoleHost(menuId,gridId){
  const menu=$(menuId),grid=$(gridId);if(!menu||!grid)return null;
  let host=menu.querySelector('.menuRoleBrief');
  if(!host){host=document.createElement('section');host.className='menuRoleBrief';grid.insertAdjacentElement('beforebegin',host);}
  return host;
}
function renderMenuRoleBrief(kind,key,ids){
  const isUnit=kind==='unit',host=mfMenuRoleHost(isUnit?'prodMenu':'buildMenu',isUnit?'prodGrid':'buildGrid');
  if(!host||!ids||!ids.length)return;
  const C=isUnit?(UCAT[key]||UCAT.veh):(BCAT[key]||BCAT.sup);
  const G=isUnit?(INTEL_ROLE_GUIDE[key]||INTEL_ROLE_GUIDE.veh):(INTEL_BUILD_GUIDE[key]||INTEL_BUILD_GUIDE.sup);
  const first=ids[0],T=isUnit?TYPES[first]:BT[first];
  host.innerHTML='<div class="menuRoleVisual"></div><div class="menuRoleCopy">'
    +'<div class="menuRoleEyebrow"><span>'+C.em+'</span>'+G.tag+'<b>'+ids.length+' AVAILABLE</b></div>'
    +'<strong>'+C.nm+'</strong><p>'+G.use+'</p>'
    +'<div class="menuRoleDoctrine"><span>'+(isUnit?'FORMATION':'BUILD CHAIN')+'</span>'+(isUnit?G.form:G.chain)+'</div>'
    +(isUnit?'<small>⚠ '+G.avoid+'</small>':'')
    +'<button type="button" class="menuRoleInspect">INSPECT '+T.name.toUpperCase()+'</button></div>';
  const visual=host.querySelector('.menuRoleVisual');
  const kit=mfIntelKit();
  visual.appendChild(mfIntelPreviewWindow(isUnit?'unit':'building',first,'TACTICAL PREVIEW',kit));
  const inspect=host.querySelector('.menuRoleInspect');
  inspect.addEventListener('pointerdown',ev=>{
    ev.preventDefault();ev.stopPropagation();
    if(isUnit)showUnitTypeCard(first,true,kit);else showBuildingTypeCard(first,-1,true,kit);
    sfx('ui');
  });
}
let mfIntelMenuTimer=0;
function mfIntelMenuInit(tryN){
  const host=$('menuIntelModel');if(!host||host.dataset.ready) return;
  if((typeof UNIT_GEO==='undefined'||!UNIT_GEO[1])&&(tryN||0)<50){setTimeout(()=>mfIntelMenuInit((tryN||0)+1),180);return;}
  const subjects=[['unit',1],['building','turret'],['unit',3],['building','techlab'],['unit',5],['building','aatower']];
  let at=0;
  const show=n=>{
    at=(n+subjects.length)%subjects.length;const S=subjects[at],T=S[0]==='unit'?TYPES[S[1]]:BT[S[1]];
    mfIntelPreviewSet(host,S[0],S[1],mfIntelKit());
    const nm=$('menuIntelName'),role=$('menuIntelRole'),count=$('menuIntelCount');
    if(nm)nm.textContent=S[0]==='unit'?intelUnitName(S[1]):intelBldName(S[1]);
    if(role)role.textContent=S[0]==='unit'?intelUnitLine(S[1]):intelBldLine(S[1]);
    if(count)count.textContent=String(at+1).padStart(2,'0')+' / '+String(subjects.length).padStart(2,'0');
  };
  host.dataset.ready='1';show(0);window.__mfIntelMenuStep=()=>show(at+1);
  clearInterval(mfIntelMenuTimer);mfIntelMenuTimer=setInterval(()=>show(at+1),5200);
}
setTimeout(()=>mfIntelMenuInit(0),500);

/* THE ARMY'S OWN WORDS. TYPES carries a name and no description at all, so
   every card in this game generated its prose from ten category strings — which
   is why a Rhino, a Goliath and a Hornet all read "Durable direct-fire battle
   unit". These two are the seam: a faction's authored line if it has one (see
   src/factext.js), otherwise the generated fallback, which is still better than
   nothing for a chassis nobody has written yet. `kit` is optional and defaults
   to the player's, so inspecting an ENEMY unit can show what THEY call it. */
function intelUnitName(ty,kit){
  return (typeof factionUnitName==='function')?factionUnitName(ty,kit)
    :((TYPES[ty]&&TYPES[ty].name)||'');
}
function intelUnitLine(ty,kit){
  const d=(typeof factionUnitDesc==='function')?factionUnitDesc(ty,kit):'';
  let s=d||intelUnitPurpose(TYPES[ty]);
  /* Nova Wasp's authored line in factext.js stops at "fast enough not to".
     Completing the idiom here keeps the home-screen feed and inspect card
     from advertising a sentence that just ends. */
  if(typeof s==='string'&&/not to\s*$/i.test(s)) s=s.replace(/\s*$/,' die.');
  return s;
}
function intelBldName(id,kit){
  return (typeof factionBldName==='function')?factionBldName(id,kit)
    :((BT[id]&&BT[id].name)||'');
}
function intelBldLine(id,kit){
  const d=(typeof factionBldDesc==='function')?factionBldDesc(id,kit):'';
  return d||intelBldPurpose(id);
}
function showUnitTypeCard(tIdx,pinned,kit){
  const T=TYPES[tIdx]; if(!T) return;
  const C=UCAT[T.cat]||UCAT.veh, tg=intelTarget(T), ai2=ARM[tIdx]||0, ct=intelUnitCounters(T);
  const h='<div class="ucHead"><span class="ucRoleIcon">'+C.em+'</span><div><b>'+intelUnitName(tIdx,kit)+'</b>'
    +'<small>'+intelUnitLine(tIdx,kit)+'</small></div><button type="button" class="ucClose" aria-label="Close unit information">×</button></div>'
    +'<div class="ucChips">'+intelChip(C.em,C.nm)+intelChip(tg[0],tg[1])
    +intelChip('◈',WK_NM[T.wk])+intelChip('↔',intelRangeBand(T.rng))
    +intelChip('⬢',ARM_NM[ai2]+' ARMOR')
    +(T.scout?intelChip('⌾','RECON'):'')
    +((typeof unitModes==='function'&&unitModes(tIdx).indexOf(4)>=0)?intelChip('◌','GHOST'):'')
    +'</div>'
    +'<div class="ucStats"><span>DMG <b>'+T.dmg+'</b></span><span>RANGE <b>'+T.rng+'</b></span><span>SPEED <b>'+T.spd+'</b></span>'
    +(T.aoe?'<span>SPLASH <b>'+T.aoe+'</b></span>':'')+'</div>'
    +(T.wk==='n'?'<div class="ucCounter caution">⚠ UNARMED · ESCORT THIS UNIT</div>'
      :'<div class="ucMatchups" aria-label="Live combat matchup multipliers">'
       +intelWeaponMatchups(T.wk)+intelArmorThreatMatchups(ai2)+'</div>')
    +'<div class="ucAmmo">AMMO · '+ammoName(T)+(T.minRng?' · MIN RANGE '+T.minRng:'')+'</div>';
  showIntelMarkup(h,pinned);
  if(T.cat==='art'){
    const card=$('unitCard'),info=document.createElement('div');
    info.className='ucCounter'+(artBarrageUnlocked()?'':' caution');
    info.textContent=artBarrageUnlocked()
      ?'☄ ACTIVE: CHARGED BARRAGE · select artillery, then tap BARRAGE in the action bar'
      :'🔒 CHARGED BARRAGE · research Fire Mission Protocol in Development > Doctrine';
    card.appendChild(info);
  }else if(typeof CLASS_AB!=='undefined'){
    const k=Object.keys(CLASS_AB).find(id=>CLASS_AB[id].cats.indexOf(T.cat)>=0);
    if(k){
      const A=CLASS_AB[k],card=$('unitCard'),info=document.createElement('div'),open=classAbilityUnlocked(A);
      info.className='ucCounter'+(open?'':' caution');
      info.textContent=open
        ?A.em+' ACTIVE: '+A.nm+' · select this class, then tap the ability in the action bar'
        :'🔒 '+A.nm+' · research '+((typeof DEVTREE!=='undefined'&&DEVTREE.find(x=>x.id===A.req)||{}).nm||A.req)+' in Development > Doctrine';
      card.appendChild(info);
    }
  }
  mfIntelAttachPreview('unit',tIdx,kit);
}
function showBuildingTypeCard(key,bIdx,pinned,kit){
  const T=BT[key]; if(!T) return;
  const B=bIdx>=0?blds[bIdx]:null, C=BCAT[T.bcat]||BCAT.sup, P=INTEL_BLD_WEAPONS[key], tg=P?intelTarget(P):null;
  const W=B&&typeof bldWeaponSnapshot==='function'?bldWeaponSnapshot(B,B.lvl||1):null;
  const shownRange=W?Math.round(W.range):(P?P.rng():0);
  const bkit=B?((typeof factionTextKit==='function')?factionTextKit(B.team):undefined):kit;
  const h='<div class="ucHead"><span class="ucRoleIcon">'+(T.em||C.em)+'</span><div><b>'+intelBldName(key,bkit)+(B&&B.lvl>1?' MK'+B.lvl:'')+'</b>'
    +'<small>'+intelBldLine(key,bkit)+'</small></div><button type="button" class="ucClose" aria-label="Close structure information">×</button></div>'
    +'<div class="ucChips">'+intelChip(C.em,C.nm)
    +(P?intelChip(tg[0],tg[1])+intelChip('◈',WK_NM[P.wk])+intelChip('↔',intelRangeBand(shownRange)):'')
    +intelChip('⬢',(B?Math.ceil(B.hp)+' / '+Math.ceil(B.hpm):T.hp)+' HP')
    +(key==='uplink'?intelChip('📡','RADAR'):'')
    +(key==='techlab'?intelChip('🔭','DETECT'):'')
    +'</div>'
    +(P?'<div class="ucStats"><span>DAMAGE TYPE <b>'+WK_NM[P.wk]+'</b></span>'
      +(W?'<span>DAMAGE <b>'+bldNum(W.damage)+'</b></span><span>RATE <b>'+bldNum(W.rate)+'/s</b></span>':'')
      +'<span>RANGE <b>'+shownRange+'</b></span>'
      +(P.min?'<span>MIN <b>'+P.min()+'</b></span>':'')+'</div>':'')
    +'<div class="ucMatchups" aria-label="Live structure matchup multipliers">'
    +(P?intelWeaponMatchups(P.wk):'')+intelStructureThreats()+'</div>'
    +'<div class="ucCounter"><span>✓ PURPOSE: '+(INTEL_BUILD_COPY[T.bcat]||T.desc)+'</span>'
    +((T.req||T.clvl)?'<span class="caution">⌁ '+(T.req?'NEEDS '+BT[T.req].name.toUpperCase():'CDR LEVEL '+T.clvl)+'</span>':'')+'</div>';
  showIntelMarkup(h,pinned);
  mfIntelAttachPreview('building',key,bkit);
}
function showIntelMarkup(h,pinned){
  const el=$('unitCard'); if(!el) return;
  el.innerHTML=h;
  el.style.display='block';
  el.classList.toggle('pinned',!!pinned);
  const close=el.querySelector('.ucClose');
  if(close) close.addEventListener('pointerdown',ev=>{ ev.stopPropagation(); clearTimeout(el._t); el.style.display='none'; });
  clearTimeout(el._t);
  if(!pinned) el._t=setTimeout(()=>el.style.display='none',6500);
}
function showUnitCard(uIdx,bIdx,pinned){
  if(uIdx>=0&&ualive[uIdx]){
    const tIdx=utype[uIdx];
    /* Their hardware, their name for it. Reading "Iron Ram" on a Dominion tank
       is a small piece of intelligence, and it is the only honest label. */
    showUnitTypeCard(tIdx,pinned,(typeof factionTextKit==='function')?factionTextKit(uteam[uIdx]):undefined);
    const el=$('unitCard'), live=el&&el.querySelector('.ucStats');
    if(live){
      /* Stance is readout, not decoration: a rooted artillery line and a
         redlining tank look identical until the panel says what they committed to. */
      const Md=umode[uIdx]?unitModeDef(utype[uIdx],umode[uIdx]):null;
      live.insertAdjacentHTML('afterbegin','<span>HP <b>'+Math.ceil(uhp[uIdx])+' / '+Math.ceil(uhpm[uIdx])+'</b></span>'
        +(umode[uIdx]!==0&&Md?'<span>MODE <b>'+Md.em+' '+Md.nm+'</b></span>':'')
        +(uvet[uIdx]?'<span>VETERAN <b>'+'★'.repeat(uvet[uIdx])+'</b></span>':''));
    }
  } else if(bIdx>=0&&blds[bIdx]&&blds[bIdx].alive) showBuildingTypeCard(blds[bIdx].type,bIdx,pinned,
    (typeof factionTextKit==='function')?factionTextKit(blds[bIdx].team):undefined);
}
function addCardIntelButton(card,kind,id){
  const b=document.createElement('button');
  b.type='button'; b.className='cardIntel'; b.textContent='ⓘ';
  b.setAttribute('aria-label','About '+(kind==='unit'?TYPES[id].name:BT[id].name));
  b.addEventListener('pointerdown',ev=>{
    ev.preventDefault(); ev.stopPropagation();
    if(kind==='unit') showUnitTypeCard(id,true); else showBuildingTypeCard(id,-1,true);
    sfx('ui');
  });
  card.appendChild(b);
}

// ---------- menus ----------
function closeMenus(){
  $('buildMenu').style.display='none';
  $('prodMenu').style.display='none';
  $('bldMenu2').style.display='none';
  openBld=-1;
}
function openBldMenu(b){
  closeMenus();
  const B=blds[b];
  if(B.type==='fac'||B.type==='tgate'||B.type==='harbor'||B.type==='airfield'){
    openBld=b; renderProdMenu(); $('prodMenu').style.display='block'; sfx('ui');
  }
  else if(B.type==='techlab'){
    openBld=b; renderResearchMenu(); $('prodMenu').style.display='block'; sfx('ui');
  }
  else { openBld=b; renderBldPanel(); $('bldMenu2').style.display='block'; sfx('ui'); }
  if(!intelSeenBlds[B.type]){
    intelSeenBlds[B.type]=1;
    showUnitCard(-1,b,false);
  }
}
function prodNavShell(){
  let nav=$('prodNav');
  if(!nav){
    /* OTA source can run inside an older packaged HTML shell. Build the compact
       navigator here as well as in index.html so that patch does not need a full
       APK reinstall just to expose the controls. */
    nav=document.createElement('div');nav.id='prodNav';
    nav.setAttribute('aria-label','Selected production structure');
    nav.innerHTML='<button id="prodPrev" aria-label="Previous structure">&lsaquo;</button><b id="prodNavName">PRODUCTION</b><span id="prodNavCount">1 / 1</span><button id="prodNext" aria-label="Next structure">&rsaquo;</button>';
    const menu=$('prodMenu');if(menu)menu.insertBefore(nav,menu.firstChild);
  }
  /* The packaged shell already contains the navigator. Binding only the
     dynamically-created version made those visible arrows inert after a full
     APK install, while the same OTA patch worked on an older shell. */
  if(nav.dataset.bound!=='1'){
    nav.dataset.bound='1';
    nav.querySelector('#prodPrev').addEventListener('pointerdown',ev=>{ev.stopPropagation();cycleProdBuilding(-1);});
    nav.querySelector('#prodNext').addEventListener('pointerdown',ev=>{ev.stopPropagation();cycleProdBuilding(1);});
  }
  return nav;
}
function prodBuildingPeers(B){
  if(!B)return [];
  return blds.map((Q,i)=>({Q,i})).filter(o=>o.Q&&o.Q.alive&&o.Q.team===0&&o.Q.type===B.type);
}
function cycleProdBuilding(dir){
  if(openBld<0||!blds[openBld]||!blds[openBld].alive)return;
  const peers=prodBuildingPeers(blds[openBld]);if(peers.length<2){sfx('ui');return;}
  let at=peers.findIndex(o=>o.i===openBld);if(at<0)at=0;
  openBld=peers[(at+dir+peers.length)%peers.length].i;
  const B=blds[openBld];cam.x=B.x;cam.y=B.y;camFollow=-1;clampCam();camUpdateMatrices();
  if(B.type==='techlab')renderResearchMenu();else renderProdMenu();
  if(typeof mmPing==='function')mmPing(B.x,B.y);
  sfx('ui');
}
function renderProdNav(B){
  const nav=prodNavShell(),peers=prodBuildingPeers(B),at=Math.max(0,peers.findIndex(o=>o.i===openBld));
  $('prodNavName').textContent=intelBldName(B.type).toUpperCase();
  $('prodNavCount').textContent=(at+1)+' / '+Math.max(1,peers.length);
  for(const id of ['prodPrev','prodNext']){
    const b=$(id);b.disabled=peers.length<2;b.classList.toggle('muted',peers.length<2);
  }
  nav.style.display='grid';
}
function renderBldPanel(){
  if(openBld<0) return;
  const B=blds[openBld], T=BT[B.type];
  const bi=$('bp_ic'); bi.innerHTML='';
  const panelKit=(typeof factionTextKit==='function')?factionTextKit(B.team):undefined;
  const ic=bldIconEl(B.type,52,panelKit); if(ic) bi.appendChild(ic);
  bi.classList.add('intelTap');
  bi.setAttribute('role','button'); bi.setAttribute('tabindex','0');
  bi.setAttribute('aria-label','Explain '+T.name);
  bi.onpointerdown=ev=>{ ev.stopPropagation(); showBuildingTypeCard(B.type,openBld,true); sfx('ui'); };
  const bLv=typeof bldDisplayLevel==='function'?bldDisplayLevel(B):(B.type==='fac'?(B.tier===2?2:1):(B.lvl||1));
  $('bp_title').textContent=intelBldName(B.type,(typeof factionTextKit==='function')?factionTextKit(B.team):undefined)
    +'  ·  LV'+bLv+(bLv>1?' '+'★'.repeat(Math.min(3,bLv)):'');
  $('bp_desc').textContent=intelBldLine(B.type,(typeof factionTextKit==='function')?factionTextKit(B.team):undefined)
    +' · '+Math.ceil(B.hp)+'/'+Math.ceil(B.hpm)+' hp'
    +(B.shieldMax?' · '+Math.ceil(B.shield)+'/'+Math.ceil(B.shieldMax)+' shield':'');
  const statsEl=$('bp_stats'),deltaEl=$('bp_delta');
  if(statsEl) statsEl.textContent=bldPanelStatText(B);
  const ub=$('bp_up'), path=BUP[B.type];
  const bLvl=B.type==='fac'?(B.tier===2?2:1):(B.lvl||1);
  if(path && (bLvl-1)<path.length && !(B.type==='fac')){
    const U=path[bLvl-1];
    if(deltaEl){ deltaEl.style.display='block'; deltaEl.textContent=bldUpgradeDeltaText(B)+'  ·  '+bldUpgradePlanText(B); }
    ub.style.display='block';
    ub.textContent=B.upT>0? ('UPGRADING… '+Math.ceil(B.upT)+'s')
      : ('⬆ UPGRADE TO MK'+(bLvl+1)+'  ·  '+U.cm+'m '+U.ce+'e  ·  '+U.t+'s');
  } else {
    ub.style.display='none';
    if(deltaEl&&path&&!((B.type==='fac'))){
      deltaEl.style.display='block';
      deltaEl.textContent='◆ MAXIMUM STRUCTURE GRADE  ·  '+bldUpgradePlanText(B);
    } else if(deltaEl) deltaEl.style.display='none';
  }
  const recycle=bldRecycleMass(B), armed=B.recycleConfirmAt>Date.now();
  $('bp_sell').textContent=armed?'⚠ TAP AGAIN — RECYCLE +'+recycle+'m':'♻ RECYCLE  +'+recycle+'m';
  const pb=$('bp_prio');
  if(pb){
    if(B.type==='turret'){
      pb.style.display='block';
      pb.textContent='🎯 TARGET: '+(['NEAREST','AIR FIRST','STRONGEST'][B.prio||0]);
    } else pb.style.display='none';
  }
  const fb=$('bp_fire');
  if(fb){
    if(B.type==='nova'&&B.prog>=1){
      const lowE=resE[0]<NOVA.e;
      fb.style.display='block';
      fb.disabled=B.cool>0||lowE;
      fb.textContent=B.cool>0? ('☄ CHARGING… '+Math.ceil(B.cool)+'s')
                    : lowE? ('⚡ NEEDS '+NOVA.e+' ENERGY ('+Math.floor(resE[0])+')')
                          : '☄ FIRE NOVA — then tap any target';
    } else fb.style.display='none';
  }
}
function renderResearchMenu(){
  const g=$('prodGrid'); g.innerHTML='';
  if(openBld<0) return;
  const B=blds[openBld];
  renderProdNav(B);
  const status=document.createElement('div');
  status.className='researchStatus';
  const carryN=Object.keys(researchCarry).filter(id=>!researched[id]&&researchCarry[id]>.5).length;
  const guard=B.guardT>0?('CONTAINMENT '+Math.ceil(B.guardT)+'s')
    :B.guardReady?'CONTAINMENT READY'
    :('REARM '+Math.min(99,Math.floor((B.guardCharge||0)/TECH_GUARD.rearm*100))+'%');
  status.innerHTML='<b>FIELD NETWORK</b><span>'+Math.ceil(B.shield)+' / '+Math.ceil(B.shieldMax)+' SHIELD · '
    +guard+' · '+resDone+' STUDIES'+(carryN?' · '+carryN+' RECOVERABLE':'')+'</span>';
  g.appendChild(status);
  let shown=0;
  RESEARCH.forEach((R,idx)=>{
    if(researched[R.id]) return;
    if(R.req&&!researched[R.req]) return;
    const lockLvl=R.clvl&&heroLvl<R.clvl;
    const carry=researchResumeTime(R.id),recover=carry>0?Math.min(99,Math.floor(carry/R.t*100)):0;
    const d=document.createElement('div');
    d.className='bcard'+(lockLvl?' locked':'');
    d.innerHTML='<div class="em">'+(lockLvl?'🔒':R.em)+'</div><div class="nm">'+R.nm+'</div>'
      +(lockLvl?'<div class="cost" style="color:#ffd257">CDR LV '+R.clvl+'</div>'
        :'<div class="cost">'+R.cm+'m <span>'+R.ce+'e</span></div>')
      +'<div style="opacity:.7">'+R.ds+'</div>'
      +(recover?'<div class="researchRecover">◆ RECOVER '+recover+'%</div>':'');
    d.addEventListener('pointerdown',ev=>{
      ev.stopPropagation();
      if(lockLvl){ toast('🔒 '+R.nm+' unlocks at Commander level '+R.clvl); return; }
      const Bb=blds[openBld];
      if(Bb.res>=0){ toast('Already researching '+RESEARCH[Bb.res].nm); return; }
      Bb.res=idx; Bb.resT=Math.min(R.t-.01,researchResumeTime(R.id)); sfx('ui'); renderQueue();
      if(Bb.resT>0) toast('◆ '+R.nm+' recovered at '+Math.floor(Bb.resT/R.t*100)+'%');
    });
    g.appendChild(d);
    shown++;
  });
  if(!shown){
    const done=document.createElement('div');
    done.className='researchComplete'; done.textContent='All field studies complete ✔';
    g.appendChild(done);
  }
  $('upBtn').style.display='none';
  $('repeatBtn').style.display='none';
  const ry=$('rallyBtn'); if(ry) ry.style.display='none';
  renderQueue();
}
const UNIT_EM={0:'🤖',1:'🚜',2:'🦣',3:'🎯',5:'🚁',6:'🏹',7:'🚀',8:'👹',9:'🔥',10:'🛰',11:'🛡',14:'🚤',15:'🚢',16:'💣',17:'✈',18:'🌋'};
/* ---------- baked-sprite UI icons (real 3D renders instead of emoji) ---------- */
let sheetCssDone=false;
function ensureSheetCss(){
  if(sheetCssDone) return;
  if(typeof UNIT_SHEET_B64!=='string') return;
  sheetCssDone=true;
  const st=document.createElement('style');
  st.textContent='.sic{background-image:url("'+UNIT_SHEET_B64+'")}';
  document.head.appendChild(st);
}
function makeIcon(spr,size,frame){
  /* boot.js continues after a script onerror. UNIT_ROWS lives in unitrows.js
     so a 404 on the 1.6 MB unitsheet.js cannot unbind it; still guard here. */
  const rows=typeof UNIT_ROWS==='object'&&UNIT_ROWS;
  const R=rows?rows[spr]:null; if(!R) return null;
  ensureSheetCss();
  const f=Math.min(frame||0,R.n-1), sc=size/R.fw;
  const d=document.createElement('div');
  d.className='sic';
  d.style.width=size+'px'; d.style.height=size+'px';
  d.style.backgroundSize=(4096*sc)+'px '+(4096*sc)+'px';
  d.style.backgroundPosition=(-(R.x+f*R.fw)*sc)+'px '+(-R.y*sc)+'px';
  return d;
}
function unitIconEl(tIdx,size,kit){
  kit=mfIntelKit(kit);
  const T=TYPES[tIdx], F=4;                       // 3/4-view yaw frame
  const w=document.createElement('div');
  w.className='mfRuntimeThumb';
  w.style.cssText='position:relative;width:'+size+'px;height:'+size+'px;display:grid;place-items:center;overflow:hidden';
  /* Do not paint a base-roster thumbnail while waiting for the live preview.
     That mixed registry contains Brood slots, so its optimistic fallback was
     enough to put Ravagers in Blue catalogues even when strict 3D rejected it. */
  if(typeof factionUnitModelAllowed==='function'&&!factionUnitModelAllowed(tIdx,kit)){
    const unavailable=document.createElement('span');unavailable.textContent='—';unavailable.style.opacity='.38';
    w.appendChild(unavailable);return w;
  }
  const live=document.createElement('img');live.alt='';live.setAttribute('aria-hidden','true');
  live.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .16s';
  const special={
    13:'unit_alpha',18:'unit_scorcher',19:'unit_constructor',
    20:'unit_reaper',21:'unit_cinder',22:'unit_lancer',23:'unit_resonator',
    24:'unit_warden',25:'unit_kestrel',26:'unit_basilisk',27:'unit_harbinger',
    28:'unit_praetor',29:'unit_archon',30:'unit_brood',31:'unit_brood'
  }[tIdx];
  /* The faction sheet leads: it is the only static art that exists for three of
     the four kits, and it is drawn in that kit's livery rather than Nova's. It
     returns null before the sheet decodes or when a role has no glyph, so the
     older paths below stay live as written. */
  const facIc=(typeof mfFacUnitIcon==='function')?mfFacUnitIcon(tIdx,size,kit):null;
  if(facIc){
    w.appendChild(facIc);
  }else if(kit==='nova'&&special&&typeof itemArt==='function'){
    w.innerHTML=itemArt(special,T.name,size);
    const img=w.firstElementChild; if(img) img.classList.add('rosterArt');
  }else{
    /* Sheet sprites for every kit. Codex PNGs are not in the tree, so the
       old nova-only branch left Brood/Legion/Syndicate on a ◇ diamond. */
    const h=makeIcon(T.spr,size,F); if(h) w.appendChild(h);
    if(T.tur){ const t=makeIcon(T.tur,size,F);
      if(t){ t.style.position='absolute'; t.style.left='0'; t.style.top='0'; w.appendChild(t); } }
    if(!h){
      const wait=document.createElement('span');wait.textContent='◇';wait.style.opacity='.45';w.appendChild(wait);
    }
  }
  /* A baked icon IS a render of this model, so asking the live thumbnail path
     for one would spend a GPU pass reproducing the image already on screen and
     then crossfade it onto itself. Skip it; the request still runs for anything
     falling back to a role glyph, where the live render is a real upgrade. */
  const baked=facIc&&facIc.classList.contains('bmIcon');
  w.appendChild(live);
  if(!baked) mfIntelThumbRequest(live,w,'unit',tIdx,kit);
  return w;
}
function bldIconEl(key,size,kit){
  kit=mfIntelKit(kit);
  const d=document.createElement('div');d.className='mfRuntimeThumb';
  d.style.cssText='position:relative;width:'+size+'px;height:'+size+'px;display:grid;place-items:center;overflow:hidden';
  const live=document.createElement('img');live.alt='';live.setAttribute('aria-hidden','true');
  live.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .16s';
  const special={geo:'bld_geo',gate:'bld_gate'}[key];
  /* Same order as unitIconEl, and it matters more here: 29 structures share
     only ~15 sprite rows, so the sheet also ends a lot of duplicate art. */
  const facIc=(typeof mfFacBldIcon==='function')?mfFacBldIcon(key,size,kit):null;
  if(facIc){
    d.appendChild(facIc);
  }else if(kit==='nova'&&special&&typeof itemArt==='function'){
    d.innerHTML=itemArt(special,BT[key].em,size);
    const img=d.firstElementChild; if(img) img.classList.add('rosterArt');
  }else{
    const el=makeIcon(BT[key]&&BT[key].spr,size,0);
    if(el){d.appendChild(el);
      if(key==='geo') el.style.filter='hue-rotate(150deg) saturate(1.6) drop-shadow(0 3px 3px rgba(0,0,0,.55))';}
    if(!el){
      const uv=sprites[BT[key]&&BT[key].spr];
      if(uv&&typeof atlasCanvas!=='undefined'&&atlasCanvas){
        const cv3=document.createElement('canvas'); cv3.width=cv3.height=64;
        cv3.getContext('2d').drawImage(atlasCanvas,
          uv[0]*ATLAS,uv[1]*ATLAS,(uv[2]-uv[0])*ATLAS,(uv[3]-uv[1])*ATLAS, 0,0,64,64);
        d.style.background='url('+cv3.toDataURL()+') center/contain no-repeat';
      }else{
        const wait=document.createElement('span');wait.textContent='◇';wait.style.opacity='.45';d.appendChild(wait);
      }
    }
  }
  d.appendChild(live);
  if(!(facIc&&facIc.classList.contains('bmIcon')))   // see unitIconEl
    mfIntelThumbRequest(live,d,'building',key,kit);
  return d;
}
/* The open tab persists across openings — a player who is in the middle of
   building anti-air should not be dropped back on infantry every time they
   reopen the panel. */
let prodTab='inf', bldTab='eco';
let baseFinderFilter='all',baseFinderCursor=0;
function baseFinderGroup(B){
  const c=(BT[B.type]&&BT[B.type].bcat)||'sup';
  return c==='eco'?'economy':c==='prod'?'production':(c==='def'||c==='wall')?'defence':c==='tech'?'tech':'support';
}
function ensureBaseFinder(){
  let p=$('baseFinder'); if(p) return p;
  p=document.createElement('section');p.id='baseFinder';p.className='baseFinder';document.body.appendChild(p);return p;
}
function focusBaseBuilding(B){
  clearSel(); openBld=blds.indexOf(B); cam.x=B.x;cam.y=B.y;clampCam();camUpdateMatrices();
  addParticle(3,B.x,B.y,0,0,.55,B.r*2.4,112,220,255); toast('⌖ '+BT[B.type].name.toUpperCase()+' — '+baseFinderGroup(B).toUpperCase());
}
function renderBaseFinder(){
  const p=ensureBaseFinder(),all=blds.filter(B=>B.alive&&B.team===0);
  const groups=['all','economy','production','defence','tech','support'];
  const list=all.filter(B=>baseFinderFilter==='all'||baseFinderGroup(B)===baseFinderFilter);
  p.innerHTML='<header><b>⌖ BASE FINDER</b><button type="button" aria-label="Close base finder">×</button></header>'
    +'<div class="baseFindTabs">'+groups.map(g=>'<button data-f="'+g+'" class="'+(g===baseFinderFilter?'on':'')+'">'+g.toUpperCase()+'</button>').join('')+'</div>'
    +'<p>'+list.length+' owned structures · tap a category to cycle and focus its next structure.</p>';
  p.querySelector('header button').addEventListener('pointerdown',()=>{p.style.display='none';});
  p.querySelectorAll('[data-f]').forEach(btn=>btn.addEventListener('pointerdown',ev=>{
    ev.stopPropagation();const f=btn.dataset.f;if(f!==baseFinderFilter){baseFinderFilter=f;baseFinderCursor=0;}
    const now=all.filter(B=>baseFinderFilter==='all'||baseFinderGroup(B)===baseFinderFilter);
    if(!now.length){toast('NO '+baseFinderFilter.toUpperCase()+' STRUCTURES');renderBaseFinder();return;}
    focusBaseBuilding(now[baseFinderCursor%now.length]);baseFinderCursor++;renderBaseFinder();
  }));
}
function toggleBaseFinder(){
  const p=ensureBaseFinder(); if(p.style.display==='block'){p.style.display='none';return;}
  /* BASE means "take me home" before it means "open a filter". Center the
     command structure immediately, then expose the category finder for the
     player's next tap. */
  const hq=blds.find(B=>B.alive&&B.team===0&&B.type==='hq');
  if(hq)focusBaseBuilding(hq);
  else {
    const any=blds.find(B=>B.alive&&B.team===0);
    if(any)focusBaseBuilding(any);
    else if(heroIdx>=0&&ualive[heroIdx]){cam.x=ux[heroIdx];cam.y=uy[heroIdx];clampCam();camUpdateMatrices();}
  }
  renderBaseFinder();p.style.display='block';
}
function renderProdMenu(){
  const g=$('prodGrid'); g.innerHTML='';
  $('repeatBtn').style.display='block';
  if(openBld<0) return;
  const B=blds[openBld];
  renderProdNav(B);
  let list;
  if(B.type==='tgate') list=[8,26];
  else if(B.type==='harbor') list=[14,15];
  else if(B.type==='airfield') list=[5,17,25];
  else list = B.tier===2? [0,1,9,18,10,2,3,6,7,11,16,19,20,21,22,23,24,27,32]
                        : [0,1,9,10,19,24,32];
  if(typeof factionDoctrineRoster==='function') list=factionDoctrineRoster(list,B.type,0);
  /* ROLE TABS. A flat grid of eighteen cards is a wall; one tap per role lets
     the player find the answer to whatever is killing them without reading
     every stat block on the way there. */
  const order=['inf','veh','at','aoe','art','aa','air','nav','sup','exp'];
  const groups={};
  for(const t of list){ const c=TYPES[t].cat||'veh'; (groups[c]||(groups[c]=[])).push(t); }
  const tabs=order.filter(c=>groups[c]);
  if(tabs.indexOf(prodTab)<0) prodTab=tabs[0];
  const tr=$('prodTabs'); tr.innerHTML='';
  tr.style.display=tabs.length>1?'flex':'none';
  for(const c of tabs){
    const C=UCAT[c]||{nm:'OTHER',em:'•'};
    const b=document.createElement('button');
    b.className='tabBtn'+(c===prodTab?' on':'');
    b.innerHTML='<span class="tEm">'+C.em+'</span>'+C.nm;
    b.addEventListener('pointerdown',ev=>{ ev.stopPropagation(); prodTab=c; sfx('ui'); renderProdMenu(); });
    tr.appendChild(b);
  }
  renderMenuRoleBrief('unit',prodTab,groups[prodTab]||[]);
  (groups[prodTab]||[]).forEach(tIdx=>{
    const T=TYPES[tIdx];
    const C=(typeof factionDoctrineUnitCost==='function')?factionDoctrineUnitCost(T,0):{m:T.cm,e:T.ce};
    const d=document.createElement('div');
    d.className='bcard';
    d.innerHTML='<div class="nm">'+intelUnitName(tIdx)+'</div><div class="cost">'+C.m+'m <span>'+C.e+'e</span></div>'
      +'<div class="wkTag">'+ammoName(T)+'</div><div class="cardPurpose">'+intelUnitLine(tIdx)+'</div>';
    d.setAttribute('role','button');
    d.setAttribute('aria-label','Build '+intelUnitName(tIdx)+'. '+intelUnitLine(tIdx));
    const icw=document.createElement('div'); icw.className='icw';
    icw.appendChild(unitIconEl(tIdx,44));
    d.insertBefore(icw,d.firstChild);
    d.addEventListener('pointerdown',ev=>{
      ev.stopPropagation();
      if(openBld<0) return;
      const Bb=blds[openBld];
      const popSlot=typeof commanderSlotForBuilding==='function'?commanderSlotForBuilding(Bb):-1;
      if(!populationCanSpawn(tIdx,0,popSlot)){
        /* Each slot is 1000. Theatre size only adds slots — recycle, do not
           tell the player expanding the theatre would raise this wallet. */
        const used=typeof populationUsedForCommander==='function'?populationUsedForCommander(popSlot):(teamCount[0]|0);
        const cap=typeof populationCapForCommander==='function'?populationCapForCommander(popSlot):1000;
        toast('⚠ UNIT CAP '+used+' / '+cap+' — recycle units to free population');
        sfx('deny');return;
      }
      if(tIdx===8 && titanCount[0]+Bb.queue.filter(q=>q===8).length>=3){ toast('Max 3 TITANs'); return; }
      if((tIdx===UT_ENGINEER||tIdx===UT_MINER)&&supportUnitCount(0,true)>=supportUnitCap(0)){
        toast('⚙ SUPPORT CAP '+supportUnitCap(0)+' — raise Commander level or operate a Research Lab');return;
      }
      if(Bb.queue.length<30){ Bb.queue.push(tIdx); sfx('ui'); renderQueue(); }
      if(tIdx!==8){                              // hold to queue a batch of 5
        const hold=setTimeout(()=>{
          const B5=blds[openBld];
          if(B5&&B5.alive&&B5.queue.length<26&&populationCanSpawn(tIdx,0,popSlot)){
            for(let q=0;q<4;q++) B5.queue.push(tIdx);
            renderQueue(); toast('▶ ×5 '+T.name+' queued (hold to batch)'); sfx('ui');
          }
        },430);
        const clr=()=>{ clearTimeout(hold); d.removeEventListener('pointerup',clr); d.removeEventListener('pointercancel',clr); d.removeEventListener('pointerleave',clr); };
        d.addEventListener('pointerup',clr); d.addEventListener('pointercancel',clr); d.addEventListener('pointerleave',clr);
      }
    });
    addCardIntelButton(d,'unit',tIdx);
    g.appendChild(d);
  });
  // T2 upgrade button
  const ub=$('upBtn');
  if(B.type==='fac'&&B.tier===1){
    ub.style.display='block';
    const needLab=!hasBld(0,'techlab');
    ub.textContent=B.upT>0?('UPGRADING… '+Math.ceil(B.upT)+'s')
      : needLab? '🔒 TECH 2 — requires Tech Lab'
      : ('⬆ UPGRADE TO TECH 2 ('+BUP.fac[0].cm+'m '+BUP.fac[0].ce+'e)');
  } else ub.style.display='none';
  renderQueue();
  const rb=$('repeatBtn');
  rb.textContent='REPEAT: '+(B.repeat?'ON':'OFF');
  rb.classList.toggle('on',B.repeat);
  const ry=$('rallyBtn');
  if(ry){ ry.style.display='block'; ry.textContent=B.rally?'⚑ RALLY SET — TAP TO MOVE':'⚑ SET RALLY POINT'; }
}
function queueStacks(q){
  const out=[];
  if(!q||!q.length) return out;
  /* Consecutive groups, not a global count-by-type. Rhino×3 then Eng then
     Rhino is three plates — SupCom / C&C factory language. A type-merge
     would hide the later Rhino behind the first stack. */
  for(let i=0;i<q.length;){
    const t=q[i]; let n=1;
    while(i+n<q.length&&q[i+n]===t) n++;
    out.push({t,n,i});
    i+=n;
  }
  return out;
}
function cancelQueuedUnit(B,start){
  if(!B||!B.queue||start<0||start>=B.queue.length) return false;
  const type=B.queue[start];
  let end=start;
  while(end<B.queue.length&&B.queue[end]===type) end++;
  const last=end-1;
  if(last===0){
    const T=TYPES[type];
    if(T&&B.prodT>0&&B.team===0){
      const facCost=(typeof factionDoctrineUnitCost==='function')?factionDoctrineUnitCost(T,0):{m:T.cm,e:T.ce};
      const frac=Math.min(1,B.prodT/Math.max(0.01,T.bt));
      resM[0]=Math.min(RES_MCAP[0],resM[0]+facCost.m*frac);
      resE[0]=Math.min(RES_ECAP[0],resE[0]+facCost.e*frac);
    }
    B.queue.shift();
    B.prodT=0;
  } else B.queue.splice(last,1);
  return true;
}
function renderQueue(){
  if(openBld<0) return;
  const B=blds[openBld];
  const el=$('prodQueue'); if(!el) return;
  if(B.type==='techlab'){
    el._mfQ='';
    el.classList.add('empty');
    const shield='SHIELD '+Math.ceil(B.shield)+'/'+Math.ceil(B.shieldMax);
    const pending=resDone*3+' ◆ DATA PENDING';
    el.textContent=(B.res>=0?('Researching '+RESEARCH[B.res].nm+' — '+Math.ceil(RESEARCH[B.res].t-B.resT)+'s'):'Pick a field study')
      +' · '+shield+' · '+pending;
    return;
  }
  const q=B.queue||[];
  const stacks=queueStacks(q);
  const sig=stacks.map(s=>s.t+':'+s.n+':'+s.i).join(',')+'|'+(B.adj||0);
  if(el._mfQ!==sig){
    el._mfQ=sig;
    el.innerHTML='';
    el.classList.toggle('empty',!stacks.length);
    if(!stacks.length){
      el.textContent='Queue empty — tap a unit to stack'
        +(B.adj?'  ·  ⚡ adjacency +'+(12*Math.min(2,B.adj))+'% speed':'');
    } else {
      const row=document.createElement('div');
      row.className='qRow';
      stacks.forEach((S,si)=>{
        const plate=document.createElement('button');
        plate.type='button';
        plate.className='qPlate'+(si===0?' active':'');
        plate.setAttribute('aria-label','Cancel one '+intelUnitName(S.t)+', '+S.n+' queued');
        const ic=document.createElement('div'); ic.className='qIc';
        ic.appendChild(unitIconEl(S.t,36));
        const nm=document.createElement('span'); nm.className='qNm';
        nm.textContent=intelUnitName(S.t);
        const ct=document.createElement('b'); ct.className='qN';
        ct.textContent='×'+S.n;
        const bar=document.createElement('i'); bar.className='qBar';
        plate.appendChild(ic); plate.appendChild(nm); plate.appendChild(ct); plate.appendChild(bar);
        plate.addEventListener('pointerdown',ev=>{
          ev.stopPropagation();
          const Bb=openBld>=0?blds[openBld]:null;
          if(!Bb||!Bb.alive) return;
          if(cancelQueuedUnit(Bb,S.i)){ if(typeof sfx==='function') sfx('ui'); renderQueue(); }
        });
        row.appendChild(plate);
      });
      el.appendChild(row);
      if(B.adj){
        const adj=document.createElement('div');
        adj.className='qAdj';
        adj.textContent='⚡ +'+(12*Math.min(2,B.adj))+'% speed';
        el.appendChild(adj);
      }
    }
  }
  const bar=el.querySelector('.qPlate.active .qBar');
  if(bar&&q.length){
    const T=TYPES[q[0]];
    bar.style.width=T?((clamp(B.prodT/T.bt,0,1)*100)+'%'):'0';
  }
}
function renderBuildMenu(){
  const g=$('buildGrid'); g.innerHTML='';
  /* Grouped by what a structure is FOR, and presented as TABS. Twenty cards in
     one flat grid, most of them padlocked, is what a new player's first look at
     the build system used to be; stacking them into sections only meant
     scrolling past everything you did not want. One tap per role, and the panel
     keeps a constant height, which matters when it is anchored to the bottom of
     a phone. */
  const keys=['mex','pgen','geo','silo','fab','fac','turret','bunker','wall','gate','aatower',
              'sgen','techlab','uplink','hellstorm','arc','rail','minelaser','missilebastion','plasma',
              'stormcaller','airfield','harbor','seafort','bastion','nova','tgate'];
  const order=['eco','prod','nav','def','wall','tech','sup','sup2'];
  const grp={};
  for(const k of keys){ const c=BT[k].bcat||'sup'; (grp[c]||(grp[c]=[])).push(k); }
  const tabs=order.filter(c=>grp[c]);
  if(tabs.indexOf(bldTab)<0) bldTab=tabs[0];
  const tr=$('buildTabs'); tr.innerHTML='';
  for(const c of tabs){
    const C=BCAT[c]||{nm:'OTHER',em:'•'};
    const b=document.createElement('button');
    b.className='tabBtn'+(c===bldTab?' on':'');
    b.innerHTML='<span class="tEm">'+C.em+'</span>'+C.nm;
    b.addEventListener('pointerdown',ev=>{ ev.stopPropagation(); bldTab=c; sfx('ui'); renderBuildMenu(); });
    tr.appendChild(b);
  }
  renderMenuRoleBrief('building',bldTab,grp[bldTab]||[]);
  for(const key of (grp[bldTab]||[])){
    const T=BT[key];
    const d=document.createElement('div');
    const lockLvl=T.clvl&&heroLvl<T.clvl;
    const lockReq=T.req&&!hasBld(0,T.req);
    const lockDomain=T.placement==='water'&&typeof battlefieldNavalEnabled==='function'&&!battlefieldNavalEnabled();
    d.className='bcard'+((lockLvl||lockReq||lockDomain)?' locked':'');
    d.innerHTML='<div class="nm">'+intelBldName(key)+'</div>'
      +(lockLvl?'<div class="cost" style="color:#ffd257">CDR LV '+T.clvl+'</div>'
        :lockReq?'<div class="cost" style="color:#ffd257">Needs '+BT[T.req].name+'</div>'
        :'<div class="cost">'+T.cm+'m <span>'+T.ce+'e</span></div>')
      +'<div class="cardPurpose">'+intelBldMini(key)+'</div><div class="cardDesc">'+T.desc+'</div>'
      +((lockLvl||lockReq)?'<span class="lockOv">🔒</span>':lockDomain?'<span class="lockOv navalX">✕</span>':'');
    d.setAttribute('role','button');
    d.setAttribute('aria-label','Build '+intelBldName(key)+'. '+intelBldLine(key));
    const icw=document.createElement('div'); icw.className='icw';
    icw.appendChild(bldIconEl(key,46));
    d.insertBefore(icw,d.firstChild);
    d.addEventListener('pointerdown',ev=>{
      ev.stopPropagation();
      if(T.clvl&&heroLvl<T.clvl){ toast('🔒 '+T.name+' unlocks at Commander level '+T.clvl); return; }
      if(T.req&&!hasBld(0,T.req)){ toast('🔒 Requires a '+BT[T.req].name); return; }
      if(lockDomain){ toast('✕ NAVAL UNAVAILABLE — this battlefield has no connected ocean or river domain'); sfx('reject'); return; }
      startPlacing(key); sfx('ui');
    });
    addCardIntelButton(d,'building',key);
    g.appendChild(d);
  }
}

/* ============================================================
   AUDIO v2 — cinematic sound design.
   Everything is built from filtered noise, resonant sweeps and
   sub-sines through a shared reverb bus. No square/saw chiptune.
   ============================================================ */
let AC=null, muted=false, sfxOn=true, sndT=0, sndN=0;
let mixMaster=null, mixSfx=null, mixMus=null, mixRev=null, mixRevSend=null, NBUF=null;

function makeIR(sec,decay,bright){
  const n=(AC.sampleRate*sec)|0, b=AC.createBuffer(2,n,AC.sampleRate);
  for(let c=0;c<2;c++){
    const d=b.getChannelData(c);
    for(let i=0;i<n;i++){
      const t=i/n;
      // early diffusion + exponential tail, slightly darker over time
      d[i]=(Math.random()*2-1)*Math.pow(1-t,decay)*(1-t*bright);
    }
  }
  return b;
}
/* iOS starts every AudioContext suspended and will only resume it inside a real
   user gesture. Every entry point into the game calls initAudio(), but a
   context created during one gesture can still be suspended later by the system
   (a call, the ring switch, backgrounding), so a one-shot unlock listener stays
   armed for the life of the session. */
function iosAudioUnlock(){
  const go=()=>{
    if(!AC) return;
    if(AC.state==='suspended') AC.resume().catch(()=>{});
    if(AC.state==='running'){
      // a zero-length silent buffer is what actually satisfies WebKit
      try{ const b=AC.createBuffer(1,1,22050), s=AC.createBufferSource();
           s.buffer=b; s.connect(AC.destination); s.start(0); }catch(e){}
    }
  };
  for(const ev of ['pointerdown','touchend','click'])
    document.addEventListener(ev,go,{passive:true});
}
iosAudioUnlock();
function initAudio(){
  if(!AC){
    try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
    try{
      mixMaster=AC.createDynamicsCompressor();
      mixMaster.threshold.value=-16; mixMaster.knee.value=26;
      mixMaster.ratio.value=8; mixMaster.attack.value=0.004; mixMaster.release.value=0.22;
      const lift=AC.createGain(); lift.gain.value=1.5;
      mixMaster.connect(lift).connect(AC.destination);
      mixSfx=AC.createGain(); mixSfx.gain.value=0.9; mixSfx.connect(mixMaster);
      mixMus=AC.createGain(); mixMus.gain.value=0.5; mixMus.connect(mixMaster);
      mixRev=AC.createConvolver(); mixRev.buffer=makeIR(2.6,2.6,0.55);
      const revLvl=AC.createGain(); revLvl.gain.value=0.85;
      mixRev.connect(revLvl).connect(mixMaster);
      mixRevSend=AC.createGain(); mixRevSend.gain.value=1; mixRevSend.connect(mixRev);
      NBUF=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate);
      const d=NBUF.getChannelData(0);
      let last=0;
      for(let i=0;i<d.length;i++){ const w=Math.random()*2-1; last=last*0.18+w*0.82; d[i]=last; }
    }catch(e){}
  }
  if(AC&&AC.state==='suspended') AC.resume();
}
/* Suspending the whole context is the only reliable way to go quiet in the
   background. The music bed is a CONTINUOUS oscillator, and the code that
   fades it lives in the frame loop — which the browser stops calling the
   moment the tab hides. So the drone just kept sounding, as a stuck hum,
   until you came back. Killing the context kills every scheduled voice with
   it, including ones queued seconds into the future. */
let audioSuspended=false;
function audioSleep(){
  if(!AC||audioSuspended) return;
  audioSuspended=true;
  try{
    if(musDroneG) musDroneG.gain.setTargetAtTime(0.0001,AC.currentTime,0.05);
    musicNext=0;
    AC.suspend();
  }catch(e){}
}
function audioWake(){
  if(!AC||!audioSuspended) return;
  audioSuspended=false;
  try{ AC.resume(); musicNext=0; }catch(e){}
}
document.addEventListener('visibilitychange',()=>{ document.hidden?audioSleep():audioWake(); });
window.addEventListener('pagehide',audioSleep);
window.addEventListener('pageshow',audioWake);
/* Do not sleep on window.blur. Desktop Chrome fires blur whenever the
   window loses focus (second monitor, DevTools, clicking the IDE) while
   the tab is still visible — that muted the 8901 browser build. Android
   WebView rarely delivers blur, which is why the APK still had sound.
   Page Visibility + Capacitor appStateChange cover real backgrounding. */
function env(g,t0,a,peak,d){
  g.gain.setValueAtTime(0.0001,t0);
  g.gain.linearRampToValueAtTime(peak,t0+a);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+a+d);
}
// looping slice of the cached noise bed — cheap, no per-shot allocation
function nz(t0,dur,rate){
  const s=AC.createBufferSource();
  s.buffer=NBUF; s.loop=true;
  s.playbackRate.value=rate||1;
  s.start(t0,Math.random()*1.6,dur);
  return s;
}
function bq(type,f,q){ const b=AC.createBiquadFilter(); b.type=type; b.frequency.value=f; if(q!==undefined) b.Q.value=q; return b; }
function send(node,amt,t0,dur){          // route a voice into the reverb bus
  if(!mixRevSend) return;
  const g=AC.createGain(); g.gain.value=amt;
  node.connect(g); g.connect(mixRevSend);
}

function sfx(name,wx,wy,scale){
  if(!AC||muted||!sfxOn||!mixSfx) return;
  const now=performance.now();
  if(now-sndT>120){ sndT=now; sndN=0; }
  if(sndN>7) return;
  let pan=0, dist=1;
  if(wx!==undefined){
    const b=camBounds();
    if(wx<b.x0-300||wx>b.x1+300||wy<b.y0-300||wy>b.y1+300) return;
    pan=clamp((wx-(b.x0+b.x1)/2)/Math.max(1,(b.x1-b.x0)/2),-1,1);
    /* View-relative proximity falloff (matches the sample path's law): distant
       action fades away fast and fades further as the player zooms out, instead
       of a gentle map-relative dip that let far fights sound close. */
    const span=(typeof orthoSpan==='number'&&orthoSpan>0)?orthoSpan:900;
    const dd=Math.hypot(wx-cam.x,wy-cam.y)/Math.max(300,span*0.64);
    const zoom=clamp((span-540)/1900,0,1);
    dist=clamp(1-dd*0.60-zoom*0.40,0.05,1);
  }
  sndN++;
  const t0=AC.currentTime, s=scale||1;
  try{
    let out=mixSfx;
    if(pan!==0&&AC.createStereoPanner){
      const p=AC.createStereoPanner(); p.pan.value=pan*0.75; p.connect(mixSfx); out=p;
    }
    const V=(v)=>v*dist;

    if(name==='shot'){
      // hard mechanical crack: transient + short resonant body
      const n=nz(t0,0.075,1.8), f=bq('bandpass',1500+Math.random()*700,2.2), g=AC.createGain();
      f.frequency.setValueAtTime(2400,t0); f.frequency.exponentialRampToValueAtTime(520,t0+0.06);
      env(g,t0,0.001,V(0.16*Math.min(1.5,s)),0.07);
      n.connect(f).connect(g).connect(out);
      const o=AC.createOscillator(), g2=AC.createGain();
      o.type='sine'; o.frequency.setValueAtTime(180,t0); o.frequency.exponentialRampToValueAtTime(60,t0+0.06);
      env(g2,t0,0.001,V(0.1*Math.min(1.5,s)),0.06);
      o.connect(g2).connect(out); o.start(t0); o.stop(t0+0.1);
      send(g,0.06*dist);
    }
    else if(name==='laser'){
      // energy discharge: bright noise through a fast-closing resonant sweep
      const n=nz(t0,0.2,1.4), f=bq('bandpass',3000,7), g=AC.createGain();
      f.frequency.setValueAtTime(4200*Math.min(1.3,s),t0);
      f.frequency.exponentialRampToValueAtTime(380,t0+0.16);
      env(g,t0,0.002,V(0.15*Math.min(1.6,s)),0.15);
      n.connect(f).connect(g).connect(out);
      const o=AC.createOscillator(), g2=AC.createGain();
      o.type='triangle';
      o.frequency.setValueAtTime(1300,t0); o.frequency.exponentialRampToValueAtTime(180,t0+0.14);
      env(g2,t0,0.002,V(0.07),0.13);
      o.connect(bq('lowpass',2600)).connect(g2).connect(out); o.start(t0); o.stop(t0+0.2);
      send(g,0.2*dist);
    }
    else if(name==='boom'||name==='hit'){
      const big=name==='boom';
      const dur=big?Math.min(1.6,0.6*s):0.18;
      // body: broadband noise with a downward lowpass sweep
      const n=nz(t0,dur,big?0.55:1.3), f=bq('lowpass',big?900:2600,1.1), g=AC.createGain();
      f.frequency.setValueAtTime(big?1400:2800,t0);
      f.frequency.exponentialRampToValueAtTime(big?90:700,t0+dur*0.85);
      env(g,t0,big?0.006:0.002,V(big?Math.min(0.62,0.3*s):0.13),dur);
      n.connect(f).connect(g).connect(out);
      if(big){
        // sub impact
        const o=AC.createOscillator(), g2=AC.createGain();
        o.type='sine'; o.frequency.setValueAtTime(95,t0); o.frequency.exponentialRampToValueAtTime(26,t0+0.5*s);
        env(g2,t0,0.004,V(Math.min(0.75,0.4*s)),0.55*s);
        o.connect(g2).connect(out); o.start(t0); o.stop(t0+0.8*s);
        // debris crackle grains
        const gr=Math.min(7,3+(s|0));
        for(let k=0;k<gr;k++){
          const dt2=0.04+Math.random()*0.34*s;
          const nn=nz(t0+dt2,0.05,2.4+Math.random()), ff=bq('bandpass',900+Math.random()*2600,4), gg=AC.createGain();
          env(gg,t0+dt2,0.001,V(0.055),0.06);
          nn.connect(ff).connect(gg).connect(out);
        }
        send(g,0.5*dist);
      } else send(g,0.1*dist);
    }
    else if(name==='ui'||name==='move'||name==='attack'){
      // soft filtered impulse — a console tick, not a beep
      const f0=name==='ui'?1800:name==='move'?1150:760;
      const n=nz(t0,0.09,1.6), f=bq('bandpass',f0,9), g=AC.createGain();
      f.frequency.setValueAtTime(f0*1.5,t0); f.frequency.exponentialRampToValueAtTime(f0*0.6,t0+0.07);
      env(g,t0,0.002,0.13,0.08);
      n.connect(f).connect(g).connect(out);
      const o=AC.createOscillator(), g2=AC.createGain();
      o.type='sine'; o.frequency.setValueAtTime(f0*0.5,t0);
      if(name==='attack') o.frequency.exponentialRampToValueAtTime(f0*0.28,t0+0.12);
      env(g2,t0,0.003,0.05,0.11);
      o.connect(g2).connect(out); o.start(t0); o.stop(t0+0.18);
      send(g,0.14);
    }
    else if(name==='alarm'){
      // klaxon: detuned filtered pulses with air
      for(let k=0;k<3;k++){
        const tk=t0+k*0.26;
        const o=AC.createOscillator(), o2=AC.createOscillator();
        const f=bq('lowpass',1500,3), g=AC.createGain();
        o.type='triangle'; o2.type='triangle';
        o.frequency.setValueAtTime(392,tk); o.frequency.linearRampToValueAtTime(330,tk+0.2);
        o2.frequency.setValueAtTime(394.5,tk); o2.frequency.linearRampToValueAtTime(332,tk+0.2);
        env(g,tk,0.02,0.15,0.2);
        o.connect(f); o2.connect(f); f.connect(g).connect(out);
        o.start(tk); o.stop(tk+0.26); o2.start(tk); o2.stop(tk+0.26);
        if(k===0) send(g,0.35);
      }
    }
    else if(name==='level'){
      // rising shimmer + hit — cinematic, no arpeggio
      const n=nz(t0,0.9,1), f=bq('bandpass',600,3), g=AC.createGain();
      f.frequency.setValueAtTime(500,t0); f.frequency.exponentialRampToValueAtTime(5200,t0+0.55);
      env(g,t0,0.35,0.1,0.5);
      n.connect(f).connect(g).connect(out);
      [174.6,261.6,349.2].forEach((fr,i)=>{
        const o=AC.createOscillator(), gg=AC.createGain(), lp=bq('lowpass',2400);
        o.type='triangle'; o.frequency.value=fr;
        env(gg,t0+0.42,0.03,0.11,0.9);
        o.connect(lp).connect(gg).connect(out); o.start(t0+0.42); o.stop(t0+1.5);
        if(i===0) send(gg,0.5);
      });
    }
    else if(name==='heal'||name==='surge'){
      const up=name==='heal';
      const n=nz(t0,0.5,1.1), f=bq('bandpass',up?900:400,5), g=AC.createGain();
      f.frequency.setValueAtTime(up?700:1600,t0);
      f.frequency.exponentialRampToValueAtTime(up?3400:260,t0+0.35);
      env(g,t0,0.02,0.13,0.36);
      n.connect(f).connect(g).connect(out);
      const o=AC.createOscillator(), g2=AC.createGain();
      o.type='sine';
      o.frequency.setValueAtTime(up?330:110,t0);
      o.frequency.exponentialRampToValueAtTime(up?660:440,t0+0.32);
      env(g2,t0,0.02,0.12,0.36);
      o.connect(g2).connect(out); o.start(t0); o.stop(t0+0.55);
      send(g,0.3);
    }
    else if(name==='thrust'){
      // carrier engines / heavy machinery rumble
      const n=nz(t0,1.1,0.4), f=bq('lowpass',300,2.5), g=AC.createGain();
      env(g,t0,0.25,V(0.3),0.85);
      n.connect(f).connect(g).connect(out);
      const o=AC.createOscillator(), g2=AC.createGain();
      o.type='sine'; o.frequency.setValueAtTime(48,t0); o.frequency.linearRampToValueAtTime(38,t0+1);
      env(g2,t0,0.2,V(0.28),0.9);
      o.connect(g2).connect(out); o.start(t0); o.stop(t0+1.3);
      send(g,0.3*dist);
    }
    else if(name==='deploy'){
      // hydraulic slam + metal groan
      const n=nz(t0,0.8,0.7), f=bq('lowpass',700,1.4), g=AC.createGain();
      f.frequency.setValueAtTime(1800,t0); f.frequency.exponentialRampToValueAtTime(140,t0+0.6);
      env(g,t0,0.005,V(0.4),0.7);
      n.connect(f).connect(g).connect(out);
      const o=AC.createOscillator(), g2=AC.createGain();
      o.type='sine'; o.frequency.setValueAtTime(120,t0); o.frequency.exponentialRampToValueAtTime(34,t0+0.55);
      env(g2,t0,0.004,V(0.55),0.6);
      o.connect(g2).connect(out); o.start(t0); o.stop(t0+0.9);
      send(g,0.55);
    }
    else if(name==='pickup'){
      // crate collect: bright metallic shimmer
      const n=nz(t0,0.35,1.8), f=bq('bandpass',2200,6), g=AC.createGain();
      f.frequency.setValueAtTime(1500,t0); f.frequency.exponentialRampToValueAtTime(4800,t0+0.22);
      env(g,t0,0.004,0.14,0.26);
      n.connect(f).connect(g).connect(out);
      [523,784].forEach((fr,i)=>{
        const o=AC.createOscillator(), gg=AC.createGain(), lp=bq('lowpass',3000);
        o.type='triangle'; o.frequency.value=fr;
        env(gg,t0+i*0.06,0.005,0.09,0.28);
        o.connect(lp).connect(gg).connect(out); o.start(t0+i*0.06); o.stop(t0+i*0.06+0.4);
      });
      send(g,0.35);
    }
  }catch(e){}
}

/* ============================================================
   ADAPTIVE SCORE — industrial-orchestral layers that swell with
   combat intensity. Sub drone, bowed pad, taiko hits, metal hits.
   ============================================================ */
let musicOn=true, musicInt=0, musicNext=0, mStep=0, lastDmgTotal=0;
let lastKillsTotal=0, musicFirstBlood=false;
let musDrone=null, musDroneF=null, musDroneG=null;
const M_STEP=60/76/2;                          // slow half-time pulse, 76bpm
const M_ROOTS=[55,49,61.74,58.27];             // A1 G1 B1 Bb1 — dark modal movement
const M_FIFTH=1.4983, M_MIN3=1.1892*1.1892;
function musKick(t0,amp,f0){
  const o=AC.createOscillator(), g=AC.createGain();
  o.type='sine'; o.frequency.setValueAtTime(f0||95,t0);
  o.frequency.exponentialRampToValueAtTime(30,t0+0.22);
  env(g,t0,0.004,amp,0.3);
  o.connect(g).connect(mixMus); o.start(t0); o.stop(t0+0.4);
  const n=nz(t0,0.12,0.6), f=bq('lowpass',420,1.2), g2=AC.createGain();
  env(g2,t0,0.002,amp*0.5,0.12);
  n.connect(f).connect(g2).connect(mixMus);
}
function musicTickFrame(dt){
  const total=dmgAccum[0]+dmgAccum[1]+dmgAccum[2];
  const delta=Math.max(0,total-lastDmgTotal); lastDmgTotal=total;
  /* FIRST BLOOD. Damage alone climbs at ~0.09% of dealt damage per frame — an
     early skirmish can be over before the score gets interesting. A kill is the
     loudest signal the field produces, so it buys a much larger step; the first
     one of the match is a beat of its own, not just another kill. */
  const killsNow=(typeof stats!=='undefined'&&stats.kills)?stats.kills[0]+stats.kills[1]+stats.kills[2]:0;
  const killDelta=killsNow-lastKillsTotal; lastKillsTotal=killsNow;
  let rise=delta*0.0009;
  if(killDelta>0){
    if(!musicFirstBlood){ musicFirstBlood=true; rise+=0.22; }
    else rise+=0.05*killDelta;
  }
  musicInt=clamp(musicInt+rise-dt*0.05,0,1);
  if(!AC||muted||!musicOn||!running||paused||!mixMus){
    if(musDroneG&&AC) musDroneG.gain.setTargetAtTime(0.0001,AC.currentTime,0.3);
    musicNext=0; return;
  }
  // continuous sub drone bed — the floor the whole score sits on
  if(!musDrone){
    try{
      musDrone=AC.createOscillator(); musDrone.type='sawtooth';
      musDrone.frequency.value=M_ROOTS[0]/2;
      musDroneF=bq('lowpass',180,4);
      musDroneG=AC.createGain(); musDroneG.gain.value=0.0001;
      musDrone.connect(musDroneF).connect(musDroneG).connect(mixMus);
      musDrone.start();
    }catch(e){}
  }
  if(musDroneG){
    musDroneG.gain.setTargetAtTime(0.10+musicInt*0.10,AC.currentTime,0.8);
    musDroneF.frequency.setTargetAtTime(150+musicInt*520,AC.currentTime,0.9);
  }
  const now=AC.currentTime;
  if(!musicNext||musicNext<now-0.5) musicNext=now+0.06;
  while(musicNext<now+0.25){
    mscheduleStep(mStep,musicNext);
    musicNext+=M_STEP; mStep=(mStep+1)%32;
  }
}
function mscheduleStep(s,t0){
  try{
    const bar=(s/8|0)%4, root=M_ROOTS[bar], I=musicInt;
    if(musDrone) musDrone.frequency.setTargetAtTime(root/2,t0,0.6);

    // taiko pulse — heartbeat of the battle
    if(s%8===0) musKick(t0,0.5+I*0.3);
    if(I>0.4&&s%8===6) musKick(t0,0.34,80);
    if(I>0.72&&s%4===2) musKick(t0,0.22,70);

    // bowed string pad: stacked fifth, slow filter breathing
    if(s%16===0){
      for(const mul of [1,M_FIFTH,I>0.45?M_MIN3*2:2]){
        const o=AC.createOscillator(), f=bq('lowpass',300,1.6), g=AC.createGain();
        o.type='sawtooth';
        o.frequency.value=root*mul*(1+(Math.random()-0.5)*0.004);
        f.frequency.setValueAtTime(240,t0);
        f.frequency.linearRampToValueAtTime(700+I*1500,t0+2.2);
        env(g,t0,1.1,0.075+I*0.03,2.6);
        o.connect(f).connect(g).connect(mixMus);
        const rv=AC.createGain(); rv.gain.value=0.5; g.connect(rv); if(mixRevSend) rv.connect(mixRevSend);
        o.start(t0); o.stop(t0+4.2);
      }
    }
    // struck metal / anvil accents once the fight is hot
    if(I>0.3&&(s%8===4||(I>0.6&&s%8===2))){
      const n=nz(t0,0.5,1.5), f=bq('bandpass',2600+Math.random()*900,12), g=AC.createGain();
      env(g,t0,0.002,0.1*Math.min(1,I*1.4),0.45);
      n.connect(f).connect(g).connect(mixMus);
      const rv=AC.createGain(); rv.gain.value=0.55; g.connect(rv); if(mixRevSend) rv.connect(mixRevSend);
    }
    // low brass swell answering big pushes
    if(I>0.55&&s%16===8){
      const o=AC.createOscillator(), f=bq('lowpass',700,2.2), g=AC.createGain();
      o.type='sawtooth'; o.frequency.value=root*2;
      f.frequency.setValueAtTime(300,t0); f.frequency.linearRampToValueAtTime(1400,t0+0.9);
      env(g,t0,0.35,0.1,1.1);
      o.connect(f).connect(g).connect(mixMus); o.start(t0); o.stop(t0+1.8);
      const rv=AC.createGain(); rv.gain.value=0.6; g.connect(rv); if(mixRevSend) rv.connect(mixRevSend);
    }
    // sparse air texture in the quiet
    if(I<0.35&&s%16===12){
      const n=nz(t0,2.4,0.5), f=bq('bandpass',700,1.4), g=AC.createGain();
      env(g,t0,1.0,0.045,1.8);
      n.connect(f).connect(g).connect(mixMus);
      const rv=AC.createGain(); rv.gain.value=0.7; g.connect(rv); if(mixRevSend) rv.connect(mixRevSend);
    }
  }catch(e){}
}

