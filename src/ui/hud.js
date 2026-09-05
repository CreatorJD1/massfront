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
/* Large translucent FX cannot use centre-point visibility alone. A blast whose
   origin sat on the last visible fog cell painted half of its billboard into
   unexplored territory, which looked like fog was being drawn underneath the
   effect. Macro fallbacks use this conservative whole-footprint gate; the
   volume pass applies the same gate before its depth-aware composite. */
function fogFxFootprintVisible(wx,wy,r){
  if(!fogGameplayActive()||(typeof demoMode!=='undefined'&&demoMode)) return true;
  if(!covAt(wx,wy)) return false;
  r=Math.max(0,Number(r)||0)*0.62;
  if(r<4) return true;
  for(let k=0;k<8;k++){
    const a=k*Math.PI*.25;
    if(!covAt(wx+Math.cos(a)*r,wy+Math.sin(a)*r)) return false;
  }
  return true;
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
/* renderLegacySprites was REMOVED here (was ~1232 lines).
   It was the 2D sprite renderer and it had not been called from anywhere for
   a long time -- the only reference in the tree was tools/test-fog-pickups.mjs
   inspecting it via .toString(). That made it an active hazard, not just dead
   weight: 1.33.42 spent a release editing its deposit/geyser/mex-rotor drawing,
   and none of those edits could ever execute, and a comment in render3d.js
   cited it as the reason the build-zone overlay could hide itself during
   placement.
   Everything player-facing was harvested into the live 3D renderer first:
   rally flags, bird flocks, cloud shadows and the off-screen threat arrow.
   Deliberately NOT harvested: worldAlertPing (dead end-to-end -- its consumer
   was here and it has no callers either) and the generic per-building night
   work-light cones, which the live renderer retired on purpose to cut clutter.
   If you need the original, it is in git before this commit. */

// ---------- minimap ----------
const mm=document.getElementById('minimap').getContext('2d',{willReadFrequently:true});
let mmBg=null, mmFrame=0, mmBgGen=0, mmNextPaint=0, mmFogLayer=null, mmFogCtx=null, mmFogImg=null, mmFogNext=0;
let mmPaints=0,mmFogPaints=0,mmTransmissionSkips=0;
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
/* The accessible command map batches one Path2D per allegiance/contact state:
   at most six filled+outlined paths instead of up to 1,800 per-contact paints.
   The backing store is always 256 px but the shipped tactical dock shrinks it
   to 56 CSS px. Author the floor in CSS pixels at that WORST supported scale;
   a 5 px backing-store pip is only 1.1 px there and every shape becomes a dot. */
const MM_TEAM_ID_CANVAS=256, MM_TEAM_ID_MIN_CSS=56;
function mmTeamIdBackingScale(cssWidth){
  return MM_TEAM_ID_CANVAS/Math.max(MM_TEAM_ID_MIN_CSS,+cssWidth||MM_TEAM_ID_MIN_CSS);
}
function mmTeamIdCanvasScale(){
  const C=typeof mm!=='undefined'&&mm&&mm.canvas;
  return ((C&&C.width)||MM_TEAM_ID_CANVAS)/Math.max(MM_TEAM_ID_MIN_CSS,(C&&C.clientWidth)||MM_TEAM_ID_MIN_CSS);
}
function mmTeamIdMarkerSize(size,radar,scale){
  return Math.max((radar?4:5)*(scale||mmTeamIdBackingScale()),size);
}
function mmTeamIdStrokeWidth(radar,scale){ return (radar?1.1:1)*(scale||mmTeamIdBackingScale()); }
function mmTeamIdPath(path,x,y,size,allegiance){
  const h=size*.5, w=Math.max(1,size*.22);
  if(allegiance===0){ path.moveTo(x+h,y); path.arc(x,y,h,0,TAU); return; }
  if(allegiance===1){
    path.moveTo(x,y-h); path.lineTo(x+h*.92,y+h*.82); path.lineTo(x-h*.92,y+h*.82); path.closePath();
    return;
  }
  /* A cross cannot be mistaken for square deposits or diamond supply crates. */
  path.moveTo(x-w,y-h); path.lineTo(x+w,y-h); path.lineTo(x+w,y-w);
  path.lineTo(x+h,y-w); path.lineTo(x+h,y+w); path.lineTo(x+w,y+w);
  path.lineTo(x+w,y+h); path.lineTo(x-w,y+h); path.lineTo(x-w,y+w);
  path.lineTo(x-h,y+w); path.lineTo(x-h,y-w); path.lineTo(x-w,y-w); path.closePath();
}
function mmTeamIdPaint(path,allegiance,radar,scale){
  const c=mfTeamIdColorClass(allegiance,false), b=mfTeamIdColorClass(allegiance,true);
  mm.fillStyle='rgba('+c[0]+','+c[1]+','+c[2]+','+(radar?.30:.96)+')';
  mm.strokeStyle=radar?'rgba('+b[0]+','+b[1]+','+b[2]+',.92)':'rgba(3,10,18,.94)';
  mm.lineWidth=mmTeamIdStrokeWidth(radar,scale);
  if(path){ mm.fill(path); mm.stroke(path); } else { mm.fill(); mm.stroke(); }
}
function mmTeamIdBatch(){
  return {paths:typeof Path2D==='function'?Array.from({length:6},()=>new Path2D()):null,
    used:new Uint8Array(6),scale:mmTeamIdCanvasScale()};
}
function mmTeamIdQueue(batch,x,y,size,team,radar){
  const allegiance=mfTeamIdAllegiance(team), at=allegiance+(radar?3:0);
  size=mmTeamIdMarkerSize(size,radar,batch.scale);
  if(batch.paths){ mmTeamIdPath(batch.paths[at],x,y,size,allegiance); batch.used[at]=1; return; }
  /* Path2D predates every supported WebGL2 WebView, but retain a correct slow
     fallback rather than reverting accessibility markers to colour-only. */
  mm.save(); mm.beginPath(); mmTeamIdPath(mm,x,y,size,allegiance); mm.lineJoin='round';
  mmTeamIdPaint(null,allegiance,radar,batch.scale); mm.restore();
}
function mmTeamIdFlush(batch){
  if(!batch.paths) return;
  mm.save(); mm.lineJoin='round';
  for(let at=0;at<6;at++) if(batch.used[at]) mmTeamIdPaint(batch.paths[at],at%3,at>=3,batch.scale);
  mm.restore();
}
function mmFactionCrest(fac,x,y,size,stroke,team){
  const I=typeof facIconCanvas==='function'?facIconCanvas(fac,()=>{mmNextPaint=0;}):null,s=size||12,h=s*.5;
  mm.save();
  if(typeof mfTeamIdEnabled==='function'&&mfTeamIdEnabled()&&team!=null){
    const allegiance=mfTeamIdAllegiance(team), P=typeof Path2D==='function'?new Path2D():null;
    if(P) mmTeamIdPath(P,x,y,s+9,allegiance); else { mm.beginPath(); mmTeamIdPath(mm,x,y,s+9,allegiance); }
    const c=mfTeamIdColorClass(allegiance,false);
    mm.fillStyle='rgba(3,10,18,.94)';mm.strokeStyle='rgb('+c[0]+','+c[1]+','+c[2]+')';mm.lineWidth=Math.max(2.4,mmTeamIdStrokeWidth(false,mmTeamIdCanvasScale()));mm.lineJoin='round';
    if(P){mm.fill(P);mm.stroke(P);}else{mm.fill();mm.stroke();}
  }
  mm.beginPath();mm.arc(x,y,h+1.5,0,TAU);mm.fillStyle='rgba(3,10,18,.92)';mm.fill();
  mm.lineWidth=1.5;mm.strokeStyle=stroke||'#dff6ff';mm.stroke();
  if(I)mm.drawImage(I,x-h,y-h,s,s);
  else{mm.fillStyle=stroke||'#dff6ff';mm.font='900 '+Math.max(7,s*.65)+'px sans-serif';mm.textAlign='center';mm.textBaseline='middle';mm.fillText('\u25c8',x,y+.5);}
  mm.restore();
}
function mmFogComposite(S,now){
  const active=typeof fogGameplayActive==='function'?fogGameplayActive()&&!demoMode:fogOn&&!demoMode;
  if(!active){mmFogLayer=null;mmFogCtx=null;mmFogImg=null;mmFogNext=0;return false;}
  if(mmFogLayer&&mmFogLayer.width===S&&now<mmFogNext)return true;
  if(!mmFogLayer||mmFogLayer.width!==S){
    mmFogLayer=document.createElement('canvas');mmFogLayer.width=S;mmFogLayer.height=S;
    mmFogCtx=mmFogLayer.getContext('2d');mmFogImg=mmFogCtx.createImageData(S,S);
  }
  const d=mmFogImg.data;
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const a=fogBuf[((y/S*FN|0)*FN+(x/S*FN|0))*4+3],dim=a>=220?0.50:a>=80?0.72:1,mo=(y*S+x)*4;
    d[mo]=10;d[mo+1]=12;d[mo+2]=8;d[mo+3]=Math.round((1-dim)*255);
  }
  mmFogCtx.putImageData(mmFogImg,0,0);mmFogNext=now+500;mmFogPaints++;return true;
}
function renderMinimap(){
  const now=typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
  /* Older callers invalidate the tactical map by assigning mmFrame=0. Keep that
     public contract while scheduling by elapsed time instead of refresh rate. */
  if(mmFrame===0)mmNextPaint=0;
  const wrap=document.getElementById('minimapWrap');
  /* The receiver completely covers the map during Commander/KEEL speech. Keep
     the last tactical frame instead of spending CPU on an invisible canvas. */
  if(wrap&&wrap.dataset.transmission){mmTransmissionSkips++;return;}
  const total=teamCount[0]+teamCount[1]+teamCount[2],paintMs=total>1500?125:100;
  if(now<mmNextPaint)return;mmNextPaint=now+paintMs;mmFrame++;mmPaints++;
  /* 256 backing store: a 5x5 civic cell is ~10 px, so lots/streets survive
     the command-map read. CSS paints 56/84 px in portrait and uses the
     intrinsic 256 px canvas in landscape, tablet and desktop layouts. */
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
  const teamId=typeof mfTeamIdEnabled==='function'&&mfTeamIdEnabled();
  const teamMarks=teamId?mmTeamIdBatch():null;
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
    if(teamId) mmTeamIdQueue(teamMarks,B.x*k,B.y*k,s,B.team,radarB);
    else mm.fillRect(B.x*k-s/2,B.y*k-s/2,s,s);
  }
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
    if(teamId) mmTeamIdQueue(teamMarks,ux[i]*k,uy[i]*k,d,uteam[i],radarU);
    else mm.fillRect(ux[i]*k-d/2,uy[i]*k-d/2,d,d);
  }
  if(teamId) mmTeamIdFlush(teamMarks);
  for(const C of crates){
    if(!C.seen&&!fogPointVisible(C.x,C.y)) continue;
    const cc=C.kind&&C.kind.col||[255,225,140];
    mm.fillStyle='rgb('+cc[0]+','+cc[1]+','+cc[2]+')';
    const x=C.x*k,y=C.y*k; mm.beginPath();mm.moveTo(x,y-6);mm.lineTo(x+6,y);mm.lineTo(x,y+6);mm.lineTo(x-6,y);mm.closePath();mm.fill();
  }
  /* Cache fog as a source-over tint. This is the same transform as
     out=source*dim+[10,12,8]*(1-dim), but avoids getImageData plus a 65K-pixel
     read/modify/write on every entity pass. Fog changes at human-map cadence,
     while unit pips and the camera outline remain 8-10 Hz. */
  if(mmFogComposite(S,now))mm.drawImage(mmFogLayer,0,0);
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
  if(ownHq)mmFactionCrest(ownFac,ownHq.x*k,ownHq.y*k,20,'#5de1ff',0);
  if(typeof AI!=='undefined'){
    for(const A of AI.allies||[])mmFactionCrest(A.fac||ownFac,A.x*k,A.y*k,20,'#66e5a2',0);
    for(const A of AI.bases||[]){
      const h=A.commander,visible=h>=0&&ualive[h]&&fogEntityVisible(uteam[h],ux[h],uy[h]);
      if(visible)mmFactionCrest(A.fac||AI.fac,ux[h]*k,uy[h]*k,24,'#ff6d5e',1);
    }
  }
  if(heroIdx>=0&&ualive[heroIdx])mmFactionCrest(ownFac,ux[heroIdx]*k,uy[heroIdx]*k,26,'#ffd257',0);
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
window.MFMinimapScheduler=Object.freeze({
  invalidate:()=>{mmNextPaint=0;mmFogNext=0;},
  snapshot:()=>({paints:mmPaints,fogPaints:mmFogPaints,transmissionSkips:mmTransmissionSkips,
    nextPaint:mmNextPaint,fogNext:mmFogNext,terrainReady:!!mmBg,fogReady:!!mmFogLayer})
});

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
const MF_UTILITY_HUD_LABEL=Object.freeze({
  'repair-unit':'HEAL','repair-structure':'REPAIR','construction-assist':'ASSIST',
  'production-assist':'ASSIST','salvage':'SALVAGE','mining':'MINE','survey':'SURVEY',
  'escort':'ESCORT','return':'RETURN'
});
/* A utility unit may be motionless while doing real work: Wardens and
   Prospectors use state 0 at range and Constructors use state 6. Read the
   exact live lease instead of translating those states to READY. The board's
   manual gate remains authoritative, so a player-issued move/hold never wears
   an obsolete automatic-job label. */
function mfUtilityHudOrder(i){
  if(typeof uUtilityJob==='undefined'||typeof uUtilityAuto==='undefined'||
     !uUtilityAuto[i]||!uUtilityJob[i]||typeof mfUtilityBoardForWorker!=='function'||
     typeof mfUtilityWorkerRef!=='function'||typeof mfUtilityJobGet!=='function'||
     typeof mfUtilityJobClaimForWorker!=='function')return '';
  if(typeof mfUtilityManualOverride==='function'&&mfUtilityManualOverride(i))return '';
  const board=mfUtilityBoardForWorker(i),worker=mfUtilityWorkerRef(i),id=uUtilityJob[i];
  const job=board&&mfUtilityJobGet(board,id),claim=board&&mfUtilityJobClaimForWorker(board,worker);
  if(!job||!claim||claim.jobId!==id||claim.workerGeneration!==ugen[i]||
     claim.expiresAt<=(board.nowTick||0))return '';
  const allowed=typeof mfUtilityWorkerKinds==='function'?mfUtilityWorkerKinds(i):null;
  if(allowed&&allowed.indexOf(job.kind)<0)return '';
  const label=MF_UTILITY_HUD_LABEL[job.kind]||'';
  return label&&ustate[i]===1&&label!=='RETURN'?'TO '+label:label;
}
function updateSelInfo(){
  const el=$('selInfo'), tac=$('tacRow');
  const deck=typeof hudDeck==='string'?hudDeck:'orders';
  const counts={},stackSelection={};
  let n=0,first=-1,modeable=0,curMode=-1,mixed=false,patrolling=0,holding=0,stopped=0,moving=0,reposition=0,guarding=0,
      utilityOrder='',utilityCount=0,utilityMixed=false;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]){
    n++; if(first<0) first=i;
    if(typeof mfLocalOwnsUnit!=='function'||mfLocalOwnsUnit(i))stackSelection[utype[i]]=(stackSelection[utype[i]]||0)+1;
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
    const utility=mfUtilityHudOrder(i);
    if(utility){utilityCount++;if(!utilityOrder)utilityOrder=utility;else if(utilityOrder!==utility)utilityMixed=true;}
    if(unitModes(utype[i]).length>1){
      modeable++;
      if(curMode<0) curMode=umode[i]; else if(curMode!==umode[i]) mixed=true;
    }
  }
  if(window.MFUnitStackHotbar&&typeof window.MFUnitStackHotbar.selection==='function')window.MFUnitStackHotbar.selection(stackSelection);
  if(typeof updateGroupBadges==='function')updateGroupBadges();
  hudDisp(tac,deck==='orders'&&n?'flex':'none');
  /* The mode button only appears when the selection can actually use it, and
     it reports the CURRENT stance so the button is a readout as well as a
     control — no guessing what a rooted artillery line is doing. */
  const mr=$('modeBtn');
  if(mr){
    hudDisp(mr,deck==='platoons'&&modeable?'flex':'none');
    if(modeable){
      const M=unitModeDef(utype[first],mixed?0:Math.max(0,curMode));
      $('modeEm').textContent=mixed?'⁇':M.em;
      $('modeNm').textContent=mixed?'Mixed':M.nm;
    }
  }
  if(!n){ hudDisp(el,'none'); intelPrimaryUnit=-1; return; }
  hudDisp(el,'flex');
  const utilityActive=utilityCount===n&&!utilityMixed?utilityOrder:'';
  const order=patrolling===n?'PATROL':guarding===n?'GUARD':stopped===n?'STOP':holding===n?'HOLD'
    :(stopped+holding)===n?'HOLD/STOP':utilityActive||(moving===n?(reposition===n?'MOVE':'A-MOVE'):'READY');
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
    if(ib) mfBindNativePress(ib,ev=>{
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
  /* One faction-wide wallet. Allied commander seats contribute to this same
     count and never multiply the 500-body admission cap. */
  if(typeof populationLedgerPlayer==='function') return populationLedgerPlayer();
  const cap=typeof populationCapFor==='function'?populationCapFor(0)
    :(typeof FACTION_POP_CAP==='number'?FACTION_POP_CAP:500);
  const used=typeof populationUsedFor==='function'?populationUsedFor(0)
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
function hudIntelChip(kind,inner){
  return '<span class="hudIntelChip '+kind+'">'+inner+'</span>';
}
function hudCommanderPortrait(C){
  const img=$('heroPortraitImg'),fallback=$('heroPortraitFallback');if(!img||!fallback)return;
  const binding=C&&C.portrait,primary=typeof binding==='string'?binding:(binding&&binding.src)||'',
        secondary=typeof binding==='object'&&binding?binding.fallback||'':'';
  const key=primary+'|'+secondary;
  if(img.dataset.portraitKey===key)return;
  img.dataset.portraitKey=key;img.dataset.stage='primary';
  const showFallback=()=>{img.style.display='none';fallback.style.display='grid';};
  img.onload=()=>{img.style.display='block';fallback.style.display='none';};
  img.onerror=()=>{
    if(img.dataset.stage==='primary'&&secondary&&secondary!==primary){img.dataset.stage='fallback';img.src=secondary;return;}
    showFallback();
  };
  if(primary){img.style.display='block';img.src=primary;}else showFallback();
}
function updateHUD(fps){
  /* The commander rail runs on EVERY frame, ahead of the 1-in-10 gate below.
     Its state machine is measured in tenths of a second and its idle path is a
     couple of comparisons; running it at 6Hz made the entry and exit visibly
     step. Placement solving inside it is separately throttled to twice a
     second, so this does not add a layout read per frame. */
  if(typeof cmdrTxTick==='function') cmdrTxTick();
  mfEnsureEconomyInspectors();
  if((hudFrame++)%10){ if(typeof showHazChip==='function') showHazChip(); return; }
  updateWaveWarning();
  const massV=$('massV'), enV=$('enV'), massR=$('massR'), enR=$('enR');
  const localBank=typeof mfLocalBank==='function'?mfLocalBank():{mass:resM[0],energy:resE[0],massCap:RES_MCAP[0],energyCap:RES_ECAP[0]};
  /* The upper rail is a tactical glance surface, so four- and five-digit banks
     use the same compact K notation as population. Full precision remains in
     the inspector title reached by tapping the chip. */
  hudTxt(massV, hudPopK(Math.floor(localBank.mass)));
  hudTxt(enV, hudPopK(Math.floor(localBank.energy)));
  hudCol(massV, stallM>0?'#ff8d7a':(localBank.mass>=localBank.massCap-1?'#ffd257':''));
  hudCol(enV, stallE>0?'#ff8d7a':'');
  // net rate = income − measured spending, so the economy reads honestly
  const mNet=mRate-mSpend, eNet=eRate-eSpend;
  if(localBank.mass>=localBank.massCap-1){ hudTxt(massR,'FULL'); hudCol(massR,'#ffd257'); }
  else {
    hudTxt(massR,(mNet>=0?'+':'')+mNet.toFixed(1));
    hudCol(massR,mNet<0?'#ff8d7a':'');
  }
  hudTxt(enR,(eNet>=0?'+':'')+eNet.toFixed(0));
  hudCol(enR,eNet<0?'#ff8d7a':'');
  const massBox=massV&&massV.closest('.res'),energyBox=enV&&enV.closest('.res');
  if(massBox)massBox.title='Mass: '+Math.floor(localBank.mass)+' / '+Math.floor(localBank.massCap)+' · gross '+mRate.toFixed(1)+'/s · spend '+mSpend.toFixed(1)+'/s · tap for forecast';
  if(energyBox)energyBox.title='Energy: '+Math.floor(localBank.energy)+' / '+Math.floor(localBank.energyCap)+' · gross '+eRate.toFixed(1)+'/s · spend '+eSpend.toFixed(1)+'/s · tap for forecast';
  coachTick();
  if(typeof updateSelInfo==='function') updateSelInfo();
  const popL=hudPlayerPop(),popEl=$('unitV'),popBox=$('unitRes');
  /* Chip is the whole player faction's 500, including allied commanders. */
  const popNowTxt=hudPopK(popL.used);
  const popCapTxt=popL.cap===1000?'1K':hudPopK(popL.cap);
  hudTxt(popEl, popNowTxt+'/'+popCapTxt);
  popBox.classList.toggle('popWarn',popL.used>=popL.cap*.9);
  popBox.classList.toggle('popFull',popL.used>=popL.cap);
  const popTitle='Faction population: '+popL.used+' of '+popL.cap+' — allied commanders share this cap';
  if(popBox.title!==popTitle) popBox.title=popTitle;
  hudTxt($('fps'), fps+' fps');
  const localHero=typeof mfLocalCommander==='function'?mfLocalCommander():heroIdx;
  if(localHero>=0&&ualive[localHero]){
    /* Realtime seats can own a commander that is not heroIdx. The locator must
       describe the same unit it selects and centres, otherwise seats 2-4 see
       the primary player's portrait/callsign on their own commander control. */
    const heroBar=$('heroBar'),localCommanderId=typeof commanderIdForUnit==='function'?commanderIdForUnit(localHero):null,
          C=localCommanderId&&typeof commanderIdentity==='function'?commanderIdentity(localCommanderId):
            (typeof playerCommanderIdentity==='function'?playerCommanderIdentity():null);
    hudDisp(heroBar,'flex');hudCommanderPortrait(C);
    const _hb=$('heroRankEm');
    if(_hb&&typeof metaRankIdx==='function'&&typeof RANKS!=='undefined'){
      const _r=RANKS[metaRankIdx()]; if(_r) hudTxt(_hb,_r.em);
    }
    const heroName=(C&&(C.shortName||C.name))||'COMMANDER',heroCall=(C&&C.callsign)||'FIELD COMMAND';
    hudTxt($('heroNameTxt'),String(heroName).toUpperCase());hudTxt($('heroCallsignTxt'),String(heroCall).toUpperCase());
    hudTxt($('heroPortraitFallback'),String(heroName).trim().charAt(0).toUpperCase()||'C');
    hudTxt($('heroLvlTxt'),'LV '+heroLvl);
    const xpPct=Math.round(clamp(heroXp/Math.max(1,heroXpNext),0,1)*100),hpPct=Math.round(clamp(uhp[localHero]/Math.max(1,uhpm[localHero]),0,1)*100);
    const xpW=xpPct+'%',hpW=hpPct+'%';
    const xpEl=$('xpFill');if(xpEl&&xpEl._mfW!==xpW){xpEl._mfW=xpW;xpEl.style.width=xpW;}
    const hpEl=$('heroHpFill');if(hpEl&&hpEl._mfW!==hpW){hpEl._mfW=hpW;hpEl.style.width=hpW;}
    hudTxt($('heroHpTxt'),hpPct+'%');hudTxt($('heroXpTxt'),xpPct+'%');hudTxt($('heroLvlBadge'),String(heroLvl));
    /* In-session commander XP, on the chip itself.
       heroXp/heroLvl is a real in-match progression -- it unlocks abilities --
       but the only readout for it lived in .heroVital, which the cinematic HUD
       hides outright below 700px: measured 0x0 / display:none on a 412x900
       portrait, with #heroNameTxt hidden too and the whole profile head only
       24px wide. So a phone player levelled up with nothing on screen to show
       it. There is no room for the grid row (it needs ~78px against a 55px
       body), so the progress and the real numbers go on the portrait chip.
       Styled inline on purpose: CSS ships only in the APK and the Space, never
       over the air, and this has to reach installed players. */
    let xpChip=$('heroXpChip');
    if(!xpChip&&heroBar){
      xpChip=document.createElement('span');xpChip.id='heroXpChip';
      xpChip.setAttribute('aria-hidden','true');
      xpChip.style.cssText='position:absolute;left:3px;right:3px;bottom:2px;height:8px;'+
        'display:flex;align-items:center;justify-content:center;border-radius:3px;'+
        'border:1px solid rgba(101,162,193,.35);background:rgba(0,0,0,.72);'+
        'overflow:hidden;pointer-events:none;z-index:2';
      const xf=document.createElement('i');xf.id='heroXpChipFill';
      xf.style.cssText='position:absolute;left:0;top:0;bottom:0;width:0%;'+
        'background:linear-gradient(90deg,#c9973b,#ffd257,#ffef9a);transition:width .16s linear';
      const xt=document.createElement('b');xt.id='heroXpChipTxt';
      xt.style.cssText='position:relative;font:800 6px/1 var(--fT,monospace);'+
        'color:#ffefc2;letter-spacing:.02em;text-shadow:0 1px 2px rgba(0,0,0,.9)';
      xpChip.appendChild(xf);xpChip.appendChild(xt);
      if(getComputedStyle(heroBar).position==='static') heroBar.style.position='relative';
      heroBar.appendChild(xpChip);
    }
    if(xpChip){
      const xf=$('heroXpChipFill');
      if(xf&&xf._mfW!==xpW){xf._mfW=xpW;xf.style.width=xpW;}
      hudTxt($('heroXpChipTxt'),heroXp+'/'+heroXpNext+' XP');
    }
    heroBar.classList.toggle('heroCritical',hpPct<=25);
    const commanderLabel='Commander '+heroName+', callsign '+heroCall+', level '+heroLvl+', health '+hpPct+' percent, XP '+heroXp+' of '+heroXpNext+'. Activate to select and center.';
    if(heroBar.getAttribute('aria-label')!==commanderLabel)heroBar.setAttribute('aria-label',commanderLabel);
    if(heroBar.title!==commanderLabel)heroBar.title=commanderLabel;
  } else hudDisp($('heroBar'),'none');
  /* Length-driven, not a hardcoded 4. The EMP module added a fifth ability and
     the old literal silently left it out of the cooldown/lock rendering. */
  const btns=[$('abOver'),$('abHeal'),$('abRage'),$('abLance'),$('abEmp')].filter(Boolean);
  for(let k=0;k<btns.length;k++){
    const cd=btns[k].querySelector('.cdring');
    if(!abUnlock[k]){
      if(!btns[k].classList.contains('cd'))btns[k].classList.add('cd');
      if(cd.style.display!=='flex') cd.style.display='flex';
      hudTxt(cd,'🔒');
    } else if(abCool[k]>0){
      if(!btns[k].classList.contains('cd'))btns[k].classList.add('cd');
      if(cd.style.display!=='flex') cd.style.display='flex';
      hudTxt(cd, String(Math.ceil(abCool[k])));
    } else {
      if(btns[k].classList.contains('cd'))btns[k].classList.remove('cd');
      if(cd.style.display!=='none') cd.style.display='none';
    }
  }
  /* classList add/remove emit a record even when the class state is already
     correct, and these buttons are serviced every HUD pass. */
  const overBtn=$('abOver'),wantOver=aiming===0;
  if(overBtn&&overBtn.classList.contains('on')!==wantOver) overBtn.classList.toggle('on',wantOver);
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
      /* Assigning textContent replaces the text node even when the string is
         identical, so this ran as a childList mutation on every HUD service
         point and fed the observers watching #cmdbar. hudTxt() is the guarded
         setter this file already uses everywhere else. */
      if(db.classList.contains('bad')!==!okd) db.classList.toggle('bad',!okd);
      hudTxt(db,okd?(cityN?'⚠  DEPLOY + CLEAR '+cityN+' BLOCK'+(cityN===1?'':'S'):'⚓  DEPLOY BASE HERE'):'⛔  BAD GROUND — FLY ON');
    } else if(db.style.display!=='none'&&!(carrier.active&&carrier.phase===1)) db.style.display='none';
  }
  // objective + match clock
  const gb=$('goalBar');
  if(gb){
    if(running&&!demoMode&&matchLive){
      gb.style.display='flex';
      /* #goalBar remains the polite live status region, while its one native
         button owns the briefing action. A role=status element with only an
         onclick was reachable by touch but was neither keyboard-actionable nor
         exposed as a control to assistive technology. Keep an OTA-safe fallback
         because an updated script may run once against an older HTML shell. */
      let goalAction=$('goalDetailBtn');
      if(!goalAction){
        goalAction=document.createElement('button');goalAction.type='button';goalAction.id='goalDetailBtn';
        goalAction.setAttribute('aria-label','Open mission objective details');gb.replaceChildren(goalAction);gb._mfH=null;
      }
      if(gb.onclick)gb.onclick=null;
      if(goalAction.dataset.mfMissionBound!=='1'){
        goalAction.dataset.mfMissionBound='1';
        mfBindTap(goalAction,()=>{
          const def=typeof goalDef==='function'?goalDef():null;
          if(def)toast((def.em?def.em+' ':'')+def.nm+' — '+def.ds);
        });
      }
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
      /* Compact chips for the top-plate strip only. goalStatus() still
         feeds the tap toast — do not rewrite that string here. */
      const contact=typeof openingContactRemaining==='function'?openingContactRemaining():0;
      let bar='';
      if(contact>0){
        const cs=Math.ceil(contact),cm=(cs/60)|0,cr=cs%60;
        bar+=hudIntelChip('contact','\u25c8 <span class="hudIntelFull">FIRST CONTACT </span>'+cm+':'+(cr<10?'0':'')+cr);
      }
      const leftCmd=/enemy commanders left: (\d+)/.exec(h);
      const inboundCmd=/enemy commanders inbound: (\d+)/.exec(h);
      const hivesLeft=/hives left: (\d+)/.exec(h);
      if(leftCmd) bar+=hudIntelChip('goal','\u2620 <span class="hudIntelFull">'+leftCmd[1]+' left</span><span class="hudIntelCompact">'+leftCmd[1]+'</span>');
      else if(inboundCmd) bar+=hudIntelChip('goal','\u2620 <span class="hudIntelFull">inbound '+inboundCmd[1]+'</span><span class="hudIntelCompact">'+inboundCmd[1]+'</span>');
      else if(hivesLeft) bar+=hudIntelChip('goal','🐛 <span class="hudIntelFull">'+hivesLeft[1]+' hives</span><span class="hudIntelCompact">'+hivesLeft[1]+'</span>');
      else if(h) bar+=hudIntelChip('goal','<span class="hudIntelFull">'+h+'</span><span class="hudIntelCompact">GOAL</span>');
      if(timeLimit>0){
        const m2=(matchClock/60)|0, s2=(matchClock%60)|0;
        bar+=hudIntelChip('time','<span class="clk'+(matchClock<60?' low':'')+'">'+m2+':'+(s2<10?'0':'')+s2+'</span>');
      }
      h=bar;
      /* updateHUD runs ~6x a second but this string only changes once a second
         (the clock) — so five of every six assignments reparsed identical HTML
         and invalidated layout for nothing, inside the frame loop. The handler
         was also a fresh closure every pass. */
      if(gb._mfH!==h){ gb._mfH=h; goalAction.innerHTML=h; }
      const def=typeof goalDef==='function'?goalDef():null;
      const actionLabel='Open mission objective details'+(def&&def.nm?': '+def.nm:'');
      if(goalAction.getAttribute('aria-label')!==actionLabel)goalAction.setAttribute('aria-label',actionLabel);
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

/* UI_CONTROL_SAFETY_HELPERS_BEGIN
   Custom role=button widgets are not native <button>s: Tab needs tabindex,
   and Enter/Space does not synthesize click. Route keys through one fn so a
   pointer path cannot double-fire. */
function mfHudEnterSpace(el,fn){
  el.addEventListener('keydown',ev=>{
    /* Interactive descendants (for example the About button inside a build
       card) own their own keyboard action. Letting their keydown bubble into
       the card used to queue the unit / start placement instead of opening
       help. Only the element that received this binding may commit it. */
    if(ev.target!==el||ev.repeat||(ev.key!=='Enter'&&ev.key!==' '))return;
    ev.preventDefault();ev.stopPropagation();
    fn(ev);
  });
}
/* A queue plate is replaced synchronously after its second confirmed release.
   The browser's synthetic click can then retarget the new plate, so a guard
   stored on the old node cannot stop a second cancellation. Keep the release
   guard at document scope; any fresh pointerdown clears it, preserving rapid
   deliberate input while suppressing only the click generated by that release. */
let mfHudQueueClickGuard=null,mfHudQueueClickGuardReady=false;
function mfHudEnsureQueueClickGuard(){
  if(mfHudQueueClickGuardReady)return;
  mfHudQueueClickGuardReady=true;
  document.addEventListener('pointerdown',()=>{mfHudQueueClickGuard=null;},true);
  document.addEventListener('click',ev=>{
    const g=mfHudQueueClickGuard,now=Date.now();
    if(!g||now>g.until||ev.detail===0)return;
    const q=ev.target&&ev.target.closest?ev.target.closest('.qPlate'):null;
    const samePointer=Number.isFinite(ev.pointerId)&&ev.pointerId===g.pointerId;
    const sameSpot=Math.hypot((ev.clientX||0)-g.x,(ev.clientY||0)-g.y)<=28;
    if(!q&&!samePointer&&!sameSpot)return;
    mfHudQueueClickGuard=null;
    ev.preventDefault();ev.stopImmediatePropagation();
  },true);
}
function mfHudBindQueueCancel(plate,requestCancel){
  mfHudEnsureQueueClickGuard();
  let press=null;
  plate.addEventListener('pointerdown',ev=>{
    ev.stopPropagation();
    press={id:ev.pointerId,x:ev.clientX,y:ev.clientY,moved:false};
  });
  plate.addEventListener('pointermove',ev=>{
    if(!press||press.id!==ev.pointerId)return;
    if(Math.hypot(ev.clientX-press.x,ev.clientY-press.y)>10)press.moved=true;
  });
  const finish=ev=>{
    if(!press||press.id!==ev.pointerId)return;
    const p=press;press=null;
    if(ev.type!=='pointerup')return;
    mfHudQueueClickGuard={pointerId:ev.pointerId,x:ev.clientX,y:ev.clientY,until:Date.now()+650};
    if(!p.moved)requestCancel(ev);
  };
  plate.addEventListener('pointerup',finish);
  plate.addEventListener('pointercancel',finish);
  /* detail===0 is keyboard/assistive activation. Physical clicks are consumed
     by the document guard before this handler, including after DOM replacement. */
  plate.addEventListener('click',requestCancel);
}
/* UI_CONTROL_SAFETY_HELPERS_END */
/* ---------- WILDCARD ACTIVE BANNER (top bar during match) ---------- */
let _mfWcBannerEl=null;
function showWcBanner(){
  if(!_mfWcBannerEl){
    _mfWcBannerEl=document.createElement('div');
    _mfWcBannerEl.id='wcBanner';
    _mfWcBannerEl.setAttribute('role','button');
    _mfWcBannerEl.setAttribute('tabindex','0');
    _mfWcBannerEl.setAttribute('aria-label','Active modifiers');
    mfHudEnterSpace(_mfWcBannerEl,()=>_mfWcBannerEl.click());
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
    _mfHazChipEl.setAttribute('tabindex','0');
    _mfHazChipEl.setAttribute('aria-label','Map weather');
    mfHudEnterSpace(_mfHazChipEl,()=>_mfHazChipEl.click());
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
    /* Keep the live match chip on the same canonical art mapping as Account
       Armory. The data emoji remains the fallback when the inventory renderer
       is unavailable or the mapped image cannot load. */
    const art=typeof armInvIcon==='function'?armInvIcon(c,32):'<span>'+c.em+'</span>';
    h+='<div class="conHudSlot" title="ONE MATCH · '+c.nm+': '+c.ds+'"><span class="conHudEm">'+art+'</span>'
      +'<span class="conHudNm">'+c.nm+'</span><span class="conHudScope">ONE MATCH</span><span class="conHudCt">'+stock+'</span></div>';
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
    h+='<div class="msRow"><span class="msEm">'+g.em+'</span><span class="msNm">'+g.nm+'</span><span class="msTag" style="color:'+r.col+'">EQUIPPED · '+r.nm+'</span></div>';
  }
  if(hasCons) for(const c of _mfMatchCons){
    const r=invRarity(c.rarity);
    h+='<div class="msRow"><span class="msEm">'+c.em+'</span><span class="msNm">'+c.nm+'</span><span class="msTag" style="color:'+r.col+'">ONE MATCH · '+r.nm+'</span></div>';
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
  const slot=kind==='wildcard'?'WILDCARD':kind==='gear'?it.slot.toUpperCase()+' · EQUIPPED':'CONSUMABLE · ONE MATCH';
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
  tech:{tag:'FIELD STUDIES',use:'Run match-only upgrades here; each completed study banks +3 ◆ Data for persistent Development at debrief.',chain:'LAB → FIELD STUDY → DEVELOPMENT DATA'},
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
  if(T.miner) return 'Mines phase ore, assists production, or surveys fields for a discovery reward.';
  if(T.caster) return 'Critical-mass Brood leader. Its aura turns nearby creatures into a faster coordinated tide.';
  if(T.builder) return 'Builds and repairs structures, assists construction, and reclaims wrecks quickly.';
  if(T.medic) return 'Automatically heals damaged units, escorts the Commander, and returns to base when idle.';
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
/* ---------- authoritative production / economy previews -----------------
   These presenters deliberately read the same live values used by sim.js and
   economy.js. They do not reserve resources or mutate queues; they explain the
   consequence of the next tap before the player commits it. */
const MF_PRODUCTION_QUEUE_CAP=30;
function mfFmtSeconds(v){
  v=Math.max(0,Number(v)||0);
  if(v>=60) return Math.floor(v/60)+'m '+Math.ceil(v%60)+'s';
  return (v>=10?Math.round(v):Math.round(v*10)/10)+'s';
}
function mfUnitSizeBand(T){
  const d=Math.max(1,Math.round((T&&T.r||3)*2));
  return {diameter:d,label:d>=28?'SUPERHEAVY':d>=18?'HEAVY':d>=11?'MEDIUM':'LIGHT'};
}
function mfFactorySpeed(B,T){
  if(typeof mfProductionSpeed==='function')return Math.max(.01,mfProductionSpeed(B,T));
  if(!B) return 1;
  const team=B.team==null?0:B.team;
  const tractor=B.tractorT>0?1+.22*Math.min(2,B.tractorN||1):1;
  const doctrine=(typeof factionDoctrineBuildSpeedMul==='function')?factionDoctrineBuildSpeedMul(team):1;
  const base=team===1?(typeof aiBuildMult==='number'?aiBuildMult:1)
    :(typeof playerBuildMult==='number'?playerBuildMult:1);
  const fort=(typeof fortOf==='function'&&fortOf(team))?fortOf(team).prod:1;
  return Math.max(.01,base*doctrine*(1+.12*Math.min(2,B.adj||0))*fort*tractor);
}
function mfUnitProductionQuote(tIdx,B){
  const T=TYPES[tIdx],team=B&&B.team!=null?B.team:0;
  if(!T) return null;
  const cost=(typeof factionDoctrineUnitCost==='function')?factionDoctrineUnitCost(T,team):{m:T.cm,e:T.ce};
  const size=mfUnitSizeBand(T),pop=hudPlayerPop(),q=B&&Array.isArray(B.queue)?B.queue.length:0;
  const queueFull=q>=MF_PRODUCTION_QUEUE_CAP;
  const facility=B&&BT[B.type]?BT[B.type].name:'compatible production facility';
  const tier=B&&B.type==='fac'?' · TECH '+(B.tier||1):'';
  const baseSeconds=T.bt||0;
  const effectiveSeconds=B?baseSeconds/mfFactorySpeed(B,T)
    :(typeof mfProductionDuration==='function'?mfProductionDuration(T):baseSeconds);
  return {
    cost,baseSeconds,effectiveSeconds,size,
    population:1,popUsed:pop.used,popCap:pop.cap,
    queueUsed:q,queueCap:MF_PRODUCTION_QUEUE_CAP,queueFull,
    queuePosition:queueFull?MF_PRODUCTION_QUEUE_CAP:q+1,
    dependency:facility+tier
  };
}
function mfStructureBuildSpeed(key){
  const doctrine=(typeof defenseFocus!=='undefined'&&defenseFocus&&typeof DEFT!=='undefined'&&DEFT[key])?1.333:1;
  const boost=typeof boostMul==='function'?boostMul('build'):1;
  const research=typeof bldSpeedMult==='number'?bldSpeedMult:1;
  return Math.max(.01,boost*research*doctrine);
}
function mfStructureEffect(key,T){
  const effect={
    mex:'+4 mass/s at a Tier-I phase deposit; richer deposits multiply yield',
    pgen:'+14 energy/s at Mk1',geo:'+30 energy/s from an active geothermal vent',
    silo:'+600 mass and +2,000 energy storage',fab:'Converts up to 58 energy/s into 3.6 mass/s',
    fac:'Adds a ground-unit production queue',airfield:'Adds an aircraft production queue',
    harbor:'Adds a naval production queue on connected water',techlab:'Unlocks field studies and banks Development data',
    uplink:'Extends HQ construction range and targeting coverage'
  };
  return effect[key]||T.desc||'Battlefield structure';
}
function mfStructureLockReasons(key){
  const T=BT[key],out=[];if(!T)return out;
  if(T.clvl&&typeof heroLvl==='number'&&heroLvl<T.clvl)out.push('Commander level '+T.clvl);
  if(T.req&&typeof hasBld==='function'&&!hasBld(0,T.req))out.push(BT[T.req].name);
  if(T.placement==='water'&&typeof battlefieldNavalEnabled==='function'&&!battlefieldNavalEnabled())out.push('Connected naval domain');
  return out;
}
function mfStructureDependencies(key){
  const T=BT[key],out=[];if(!T)return out;
  if(T.clvl)out.push('Commander level '+T.clvl);
  if(T.req)out.push(BT[T.req].name);
  if(T.placement==='water')out.push('Connected naval domain');
  if(key==='mex')out.push('Phase deposit at placement');
  if(key==='geo')out.push('Geothermal vent at placement');
  return out.length?out:['None'];
}
function mfStructureBuildQuote(key){
  const T=BT[key];if(!T)return null;
  const kit=typeof playerKitKey==='function'?playerKitKey():'nova';
  /* bldFoot(type, faction) with no tier returns the largest authored family
     footprint. New sites reserve that complete envelope through footTier, so
     this is the space placement and later upgrades actually own. */
  const foot=typeof bldFoot==='function'?bldFoot(key,kit):[T.size,T.size];
  const escrow=typeof MF_BUILD_ESCROW_FRAC==='number'?MF_BUILD_ESCROW_FRAC:.02;
  return {cost:{m:T.cm,e:T.ce},effectiveSeconds:T.bt/mfStructureBuildSpeed(key),footprint:foot,
    placement:T.placement==='water'?'NAVAL':'LAND',effect:mfStructureEffect(key,T),dependencies:mfStructureDependencies(key),locks:mfStructureLockReasons(key),
    escrow:{m:T.cm*escrow,e:T.ce*escrow},streamPercent:Math.round((1-escrow)*100)};
}
function mfEconomySnapshot(){
  const m={stored:Math.floor(resM[0]),cap:Math.floor(RES_MCAP[0]),gross:+mRate||0,spend:+mSpend||0};
  const e={stored:Math.floor(resE[0]),cap:Math.floor(RES_ECAP[0]),gross:+eRate||0,spend:+eSpend||0};
  for(const x of [m,e]){
    x.net=x.gross-x.spend;
    x.forecast=x.stored>=x.cap-1&&x.net>.001?'FULL · INCOME WASTED'
      :x.net<-.001?'EMPTY IN '+mfFmtSeconds(x.stored/-x.net)
      :x.net>.001?'CAP IN '+mfFmtSeconds(Math.max(0,x.cap-x.stored)/x.net):'STEADY';
  }
  let bottleneck='NONE — both resource flows are stable';
  if(stallM>0)bottleneck='MASS — active work is stalled';
  else if(stallE>0)bottleneck='ENERGY — active work is stalled';
  else if(m.net<0||e.net<0){
    const mr=m.net<0?m.stored/-m.net:Infinity,er=e.net<0?e.stored/-e.net:Infinity;
    bottleneck=mr<=er?'MASS — shortest projected runway':'ENERGY — shortest projected runway';
  }else{
    const massFull=m.stored>=m.cap-1,energyFull=e.stored>=e.cap-1;
    if(massFull&&energyFull)bottleneck='MASS + ENERGY STORAGE FULL — income is being wasted';
    else if(massFull)bottleneck='MASS STORAGE FULL — income is being wasted';
    else if(energyFull)bottleneck='ENERGY STORAGE FULL — income is being wasted';
  }
  return {mass:m,energy:e,bottleneck};
}
function mfEconomyRow(label,x){
  const sign=n=>(n>=0?'+':'')+n.toFixed(1);
  return '<div class="econResource"><b>'+label+'</b><span>STORED <strong>'+x.stored+' / '+x.cap+'</strong></span>'
    +'<span>GROSS <strong>'+sign(x.gross)+'/s</strong></span><span>SPEND <strong>-'+x.spend.toFixed(1)+'/s</strong></span>'
    +'<span>NET <strong class="'+(x.net<0?'bad':'good')+'">'+sign(x.net)+'/s</strong></span>'
    +'<span class="econForecast">FORECAST <strong>'+x.forecast+'</strong></span></div>';
}
function showEconomyIntel(){
  const E=mfEconomySnapshot();
  const h='<section id="economyIntel"><div class="ucHead"><span class="ucRoleIcon">⌁</span><div><b>RESOURCE FORECAST</b>'
    +'<small>Live income, committed spending, storage and projected runway.</small></div><button type="button" class="ucClose" aria-label="Close resource forecast">×</button></div>'
    +'<div class="econGrid">'+mfEconomyRow('◆ MASS',E.mass)+mfEconomyRow('⚡ ENERGY',E.energy)+'</div>'
    +'<div class="econBottleneck"><span>BOTTLENECK</span><b>'+E.bottleneck+'</b></div></section>';
  showIntelMarkup(h,true);
}
function mfEnsureEconomyInspectors(){
  if(mfEnsureEconomyInspectors.ready)return;
  const mass=$('massV'),energy=$('enV');
  const nodes=[mass&&mass.closest('.res'),energy&&energy.closest('.res')].filter(Boolean);
  if(nodes.length!==2)return;
  mfEnsureEconomyInspectors.ready=true;
  nodes.forEach((el,i)=>{
    el.dataset.econ=i?'energy':'mass';el.setAttribute('role','button');el.setAttribute('tabindex','0');
    el.setAttribute('aria-label',(i?'Energy':'Mass')+' economy details');
    if(typeof mfBindTap==='function')mfBindTap(el,showEconomyIntel);else el.addEventListener('click',showEconomyIntel);
    mfHudEnterSpace(el,()=>el.click());
  });
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
const mfIntelThumbCache=new Map(),mfIntelThumbWait=new Map(),mfIntelThumbQueue=[],mfIntelThumbState=new Map();
let mfIntelThumbBusy=false,mfIntelThumbCanvas=null,mfIntelThumbView=null;
let mfIntelThumbRequests=0,mfIntelThumbCacheHits=0,mfIntelThumbRenders=0,mfIntelThumbFailures=0;
function mfIntelThumbKey(kind,id,kit){return kind+':'+mfIntelKit(kit)+':'+id;}
function mfIntelThumbRecord(key,kind,id,kit,status,bytes,reason){
  const old=mfIntelThumbState.get(key)||{};
  mfIntelThumbState.set(key,{key,kind,id:String(id),kit,status,bytes:bytes||old.bytes||0,reason:reason||''});
}
function mfIntelThumbHolder(holder,key,kind,id,kit,status,source){
  if(!holder)return;
  holder.dataset.mfModelKey=key;holder.dataset.mfModelKind=kind;holder.dataset.mfModelId=String(id);
  holder.dataset.mfModelKit=kit;holder.dataset.mfThumbStatus=status;holder.dataset.mfThumbSource=source||'pending';
}
function mfIntelThumbUnavailable(holder,key,kind,id,kit,reason){
  if(!holder||holder.dataset.mfModelKey!==key)return;
  holder.replaceChildren();holder.classList.add('missingFactionModel');
  mfIntelThumbHolder(holder,key,kind,id,kit,'unavailable','unavailable');
  const mark=document.createElement('span');mark.className='mfRuntimeThumbUnavailable';mark.textContent='!';
  mark.setAttribute('aria-label',kit+' '+kind+' model unavailable');holder.appendChild(mark);
  if(reason)holder.dataset.mfThumbReason=reason;
}
function mfIntelThumbRequest(img,holder,kind,id,kit){
  kit=mfIntelKit(kit);const key=mfIntelThumbKey(kind,id,kit),cached=mfIntelThumbCache.get(key);
  mfIntelThumbRequests++;mfIntelThumbHolder(holder,key,kind,id,kit,'queued','pending');
  const done=url=>{
    if(!holder||holder.dataset.mfModelKey!==key)return;
    if(!url){mfIntelThumbUnavailable(holder,key,kind,id,kit,'geometry');return;}
    const ready=()=>{
      if(holder.dataset.mfModelKey!==key)return;
      const fallback=holder.querySelector('.mfRuntimeThumbFallback');if(fallback)fallback.remove();
      img.style.opacity='1';holder.classList.remove('missingFactionModel');delete holder.dataset.mfThumbReason;
      mfIntelThumbHolder(holder,key,kind,id,kit,'ready','runtime-geometry');
    };
    img.onload=ready;img.onerror=()=>mfIntelThumbUnavailable(holder,key,kind,id,kit,'decode');img.src=url;
    mfIntelThumbHolder(holder,key,kind,id,kit,'rendered','runtime-geometry');
    if(img.complete&&img.naturalWidth)ready();
  };
  if(cached!==undefined){mfIntelThumbCacheHits++;done(cached);return;}
  const waits=mfIntelThumbWait.get(key);if(waits){waits.push(done);return;}
  mfIntelThumbRecord(key,kind,id,kit,'queued',0,'');
  mfIntelThumbWait.set(key,[done]);mfIntelThumbQueue.push({key,kind,id,kit});mfIntelThumbPump();
}
function mfIntelThumbPump(){
  if(mfIntelThumbBusy||!mfIntelThumbQueue.length)return;mfIntelThumbBusy=true;
  requestAnimationFrame(ts=>{
    const job=mfIntelThumbQueue.shift();let url='',subjectReady=false;
    mfIntelThumbRecord(job.key,job.kind,job.id,job.kit,'rendering',0,'');
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
    if(url){mfIntelThumbRenders++;mfIntelThumbRecord(job.key,job.kind,job.id,job.kit,'ready',url.length,'');}
    else{mfIntelThumbFailures++;mfIntelThumbRecord(job.key,job.kind,job.id,job.kit,'unavailable',0,subjectReady?'snapshot':'geometry');}
    mfIntelThumbCache.set(job.key,url);const waits=mfIntelThumbWait.get(job.key)||[];mfIntelThumbWait.delete(job.key);for(const fn of waits)fn(url);
    mfIntelThumbBusy=false;if(mfIntelThumbQueue.length)mfIntelThumbPump();
  });
}
function mfIntelThumbSnapshot(){
  const entries=[...mfIntelThumbState.values()].map(row=>({...row})),holders=[...document.querySelectorAll('.mfRuntimeThumb[data-mf-model-key]')].map(el=>({
    key:el.dataset.mfModelKey,kind:el.dataset.mfModelKind,id:el.dataset.mfModelId,kit:el.dataset.mfModelKit,
    status:el.dataset.mfThumbStatus,source:el.dataset.mfThumbSource,connected:el.isConnected
  }));
  return {sharedContextCount:mfIntel3DGL?1:0,sharedSurfaceCount:mfIntel3DSurf?1:0,
    contextReady:!!(mfIntel3DGL&&mfIntel3DProg&&!mfIntel3DGL.isContextLost()),busy:mfIntelThumbBusy,
    queueDepth:mfIntelThumbQueue.length,waitingKeys:mfIntelThumbWait.size,requests:mfIntelThumbRequests,
    cacheHits:mfIntelThumbCacheHits,renders:mfIntelThumbRenders,failures:mfIntelThumbFailures,
    readyEntries:entries.filter(row=>row.status==='ready').length,unavailableEntries:entries.filter(row=>row.status==='unavailable').length,
    readyHolders:holders.filter(row=>row.status==='ready'&&row.source==='runtime-geometry').length,entries,holders};
}
window.MFIntelRuntimeThumbnails=Object.freeze({snapshot:mfIntelThumbSnapshot});
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
  mfBindNativePress(inspect,ev=>{
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
  const factory=openBld>=0&&blds[openBld]&&blds[openBld].alive&&Array.isArray(blds[openBld].queue)?blds[openBld]:null;
  const Q=mfUnitProductionQuote(tIdx,factory);
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
    +'<div class="ucStats productionQuote"><span>COST <b>'+Q.cost.m+'m · '+Q.cost.e+'e</b></span>'
    +'<span>BUILD <b>'+mfFmtSeconds(Q.effectiveSeconds)+'</b></span><span>SIZE <b>'+Q.size.label+' · Ø'+Q.size.diameter+'m</b></span>'
    +'<span>POPULATION <b>+1 · '+Q.popUsed+'/'+Q.popCap+'</b></span><span>QUEUE <b>'+Q.queuePosition+'/'+Q.queueCap+'</b></span></div>'
    +(T.wk==='n'?'<div class="ucCounter caution">⚠ UNARMED · ESCORT THIS UNIT</div>'
      :'<div class="ucMatchups" aria-label="Live combat matchup multipliers">'
       +intelWeaponMatchups(T.wk)+intelArmorThreatMatchups(ai2)+'</div>')
    +'<div class="ucAmmo">AMMO · '+ammoName(T)+(T.minRng?' · MIN RANGE '+T.minRng:'')+'</div>'
    +'<div class="ucDependency">DEPENDENCY · '+Q.dependency+'</div>';
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
  const Q=mfStructureBuildQuote(key);
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
    +'<div class="ucStats productionQuote"><span>COST <b>'+Q.cost.m+'m · '+Q.cost.e+'e</b></span>'
    +'<span>BUILD <b>'+mfFmtSeconds(Q.effectiveSeconds)+'</b></span><span>FOOTPRINT <b>'+Math.round(Q.footprint[0])+'×'+Math.round(Q.footprint[1])+'m</b></span>'
    +'<span>DOMAIN <b>'+Q.placement+'</b></span><span>PAYMENT <b>2% start · '+Q.streamPercent+'% streamed</b></span></div>'
    +'<div class="ucDependency">OUTPUT · '+Q.effect+'</div>'
    +(B&&typeof bldUpgradePlanText==='function'?'<div class="ucDependency">GRADE PATH · '+bldUpgradePlanText(B)+'</div>':'')
    +'<div class="ucMatchups" aria-label="Live structure matchup multipliers">'
    +(P?intelWeaponMatchups(P.wk):'')+intelStructureThreats()+'</div>'
    +'<div class="ucCounter"><span>✓ PURPOSE: '+(INTEL_BUILD_COPY[T.bcat]||T.desc)+'</span>'
    +'<span class="caution">⌁ DEPENDENCIES · '+Q.dependencies.join(' · ').toUpperCase()+'</span></div>';
  showIntelMarkup(h,pinned);
  mfIntelAttachPreview('building',key,bkit);
}
function showIntelMarkup(h,pinned){
  const el=$('unitCard'); if(!el) return;
  el.innerHTML=h;
  el.style.display='block';
  el.classList.toggle('pinned',!!pinned);
  const close=el.querySelector('.ucClose');
  if(close){
    const dismiss=ev=>{
      if(ev)ev.stopPropagation();
      clearTimeout(el._t);el.style.display='none';
      if(typeof mfUiQueueSync==='function')mfUiQueueSync();
    };
    /* Stop the battlefield press at its source, then commit on a completed tap
       or native keyboard click. pointerdown-only made the visible 44px close
       button impossible to operate with Enter/Space. */
    close.addEventListener('pointerdown',ev=>ev.stopPropagation(),{passive:true});
    if(typeof mfBindTap==='function')mfBindTap(close,dismiss);else close.addEventListener('click',dismiss);
  }
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
  const inspect=ev=>{
    if(ev){ev.preventDefault();ev.stopPropagation();}
    if(kind==='unit') showUnitTypeCard(id,true); else showBuildingTypeCard(id,-1,true);
    sfx('ui');
  };
  /* Keep the parent card from arming on a press that began on About. The
     shared tap contract supplies release/cancel safety and a real click path
     for keyboard and assistive activation. */
  b.addEventListener('pointerdown',ev=>ev.stopPropagation(),{passive:true});
  if(typeof mfBindTap==='function')mfBindTap(b,inspect);else b.addEventListener('click',inspect);
  card.appendChild(b);
}

// ---------- menus ----------
function closeMenus(){
  const menuVisible=id=>{const el=$(id);return !!(el&&getComputedStyle(el).display!=='none');};
  const hadOpen=menuVisible('buildMenu')||menuVisible('prodMenu')||menuVisible('bldMenu2');
  if(hadOpen&&typeof mfUiMarkPanelDismiss==='function')mfUiMarkPanelDismiss();
  $('buildMenu').style.display='none';
  $('prodMenu').style.display='none';
  $('bldMenu2').style.display='none';
  openBld=-1;
}
/* THE PANEL MUST DIE WITH THE STRUCTURE.
   `blds` entries are never spliced during a match — a destroyed structure just
   gets `alive=false` (sim.js) and its slot stays in the array until resetWorld
   empties it. Every menu renderer here only ever asked `openBld<0`, and the
   800ms refresh in main.js only asks `!blds[openBld]`, so NONE of those tests
   can ever notice a death. A raid that killed the factory you had open left the
   production sheet on screen, still painting that factory's queue and ETA, and
   still accepting unit taps with a confirm sound — every unit queued that way
   went into a corpse and never appeared. (The batch-hold path two lines below
   the single push already checked `B5.alive`, which is what makes the missing
   check on the single push an omission rather than a decision.)
   One guard, called at the top of every renderer, closes the sheet instead. */
function openBldGone(){
  if(openBld<0) return true;
  const B=blds[openBld];
  if(B&&B.alive) return false;
  closeMenus();
  return true;
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
    mfBindNativePress(nav.querySelector('#prodPrev'),ev=>{ev.stopPropagation();cycleProdBuilding(-1);});
    mfBindNativePress(nav.querySelector('#prodNext'),ev=>{ev.stopPropagation();cycleProdBuilding(1);});
  }
  return nav;
}
function prodBuildingPeers(B){
  if(!B)return [];
  return blds.map((Q,i)=>({Q,i})).filter(o=>o.Q&&o.Q.alive&&
    (typeof mfLocalOwnsBuilding==='function'?mfLocalOwnsBuilding(o.Q):o.Q.team===0)&&o.Q.type===B.type);
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
/* One service strip moves between the general structure panel and the
   production sheet. Reusing the existing bp_sell node preserves its global
   release/confirmation guard; duplicating a second destructive control in the
   factory sheet would silently drop that safety contract. */
function mfEnsureBuildingServiceControls(panelId){
  const host=$(panelId||'bldMenu2'),sell=$('bp_sell');
  if(!host||!sell)return null;
  let row=$('mfBldServiceActions');
  if(!row){
    row=document.createElement('div');row.id='mfBldServiceActions';row.className='bldServiceActions';
    row.setAttribute('role','group');
    row.setAttribute('aria-label','Structure maintenance');
  }
  let repair=$('bp_repair');
  if(!repair){
    repair=document.createElement('button');repair.type='button';repair.id='bp_repair';
    repair.className='bldServiceBtn bldServiceRepair';repair.textContent='REPAIR';
  }
  sell.classList.add('bldServiceBtn','bldServiceRecycle');
  if(repair.parentElement!==row)row.appendChild(repair);
  if(sell.parentElement!==row)row.appendChild(sell);
  if(row.parentElement!==host){
    if(host.id==='prodMenu'){
      const upgrade=$('mfProdUpgradePanel'),single=$('upBtn');
      const anchor=upgrade&&upgrade.parentElement===host?upgrade:(single&&single.parentElement===host?single:null);
      host.insertBefore(row,anchor);
    }
    else host.appendChild(row);
  }
  row.dataset.panel=host.id;
  return {row,repair,recycle:sell};
}
function mfRenderBuildingServiceControls(B,panelId){
  const C=mfEnsureBuildingServiceControls(panelId);if(!C||!B)return;
  const S=window.MFBuildingService,Q=S&&typeof S.quote==='function'?S.quote(B):
    {eligible:false,state:'unavailable',reason:'service-unavailable',active:false,rate:0,fullCostM:0,fullCostE:0};
  const state=Q.state||'unavailable',labels={off:'REPAIR',repairing:'REPAIRING',stalled:'STALLED',
    'under-fire':'UNDER FIRE',full:'FULL HEALTH',building:'BUILDING',unavailable:'UNAVAILABLE'};
  C.repair.textContent=labels[state]||'UNAVAILABLE';
  C.repair.dataset.state=state;C.repair.disabled=!Q.eligible;
  C.repair.setAttribute('aria-pressed',Q.active?'true':'false');
  const cost=[];if(Q.fullCostM>0)cost.push(Math.ceil(Q.fullCostM)+' mass');if(Q.fullCostE>0)cost.push(Math.ceil(Q.fullCostE)+' energy');
  const detail=state==='repairing'?'Repair active':state==='stalled'?'Repair stalled; more resources required':
    state==='under-fire'?'Repair paused under hostile fire':state==='full'?'Structure is at full health':
    state==='building'?'Repair unlocks when construction finishes':state==='off'?'Start structure repair':'Structure repair unavailable';
  C.repair.setAttribute('aria-label',detail+(cost.length?'. Full recovery costs up to '+cost.join(' and '):''));
  C.repair.title=detail+(Q.rate?(' · '+Math.round(Q.rate)+' HP/s'):'')+(cost.length?(' · '+cost.join(' / ')):'' );
  const refund=typeof bldRecycleMass==='function'?bldRecycleMass(B):0,armed=B.recycleConfirmAt>Date.now();
  C.recycle.disabled=!B.alive;C.recycle.dataset.armed=armed?'true':'false';
  C.recycle.textContent=armed?'CONFIRM RECYCLE +'+refund+'M':'RECYCLE +'+refund+'M';
  C.recycle.setAttribute('aria-label',armed?'Confirm recycle '+BT[B.type].name+' for '+refund+' mass':'Arm recycle '+BT[B.type].name+' for '+refund+' mass');
}
function mfEnsureBuildingActivityControls(panelId){
  const host=$(panelId);if(!host)return null;
  const id=panelId==='prodMenu'?'mfProdActivity':'mfBldActivity';
  let rail=$(id);
  if(!rail){
    rail=document.createElement('div');rail.id=id;rail.className='bldActivityRail';
    rail.setAttribute('role','status');rail.setAttribute('aria-live','polite');
    rail.innerHTML='<i class="bldActivityMark" aria-hidden="true"></i><b></b><span></span>'
      +'<em class="bldActivityTrack" aria-hidden="true"><i></i></em>';
  }
  const anchor=panelId==='prodMenu'?$('prodQueue'):$('bp_stats');
  if(rail.parentElement!==host)host.insertBefore(rail,anchor||host.firstChild);
  return rail;
}
function mfRenderBuildingActivityControls(B,panelId){
  const rail=mfEnsureBuildingActivityControls(panelId);if(!rail)return;
  /* Queue and research contents are private tactical information. Resolve the
     local command seat, not merely team 0: co-op allies have separate banks
     and a PvP client may own a nonzero team. */
  const authority=typeof mfBuildingUpgradeAuthority==='function'?mfBuildingUpgradeAuthority():null;
  if(!B||!authority||B.team!==authority.team||typeof commanderSlotForBuilding!=='function'||
     commanderSlotForBuilding(B)!==authority.slot||typeof mfBuildingActivity!=='function'){rail.hidden=true;return;}
  const A=mfBuildingActivity(B),pct=Math.round(clamp(Number(A.progress)||0,0,1)*100),kind=A.kind||'idle';
  rail.hidden=false;rail.dataset.state=A.state||kind;rail.dataset.kind=kind;
  let label=A.label||kind.toUpperCase(),detail='READY';
  if(kind==='constructing')detail=pct+'%';
  else if(kind!=='idle')detail=(A.queueCount>1?A.queueCount+' QUEUED  ·  ':'')+Math.max(0,Math.ceil(A.remaining||0))+'S';
  if(A.stalled)detail=(A.reason==='population'?'UNIT CAP':'RESOURCES')+'  ·  '+pct+'%';
  const title=rail.querySelector('b'),meta=rail.querySelector('span'),fill=rail.querySelector('.bldActivityTrack>i');
  if(title.textContent!==label)title.textContent=label;
  if(meta.textContent!==detail)meta.textContent=detail;
  const scale='scaleX('+(kind==='idle'?1:pct/100)+')';if(fill.style.transform!==scale)fill.style.transform=scale;
  rail.setAttribute('aria-label',label+'. '+detail);
}
function mfUpgradeAmount(value,suffix){return Math.max(0,Math.ceil(Number(value)||0))+suffix;}
function mfEnsureBuildingUpgradeControls(panelId){
  const host=$(panelId),single=$(panelId==='prodMenu'?'upBtn':'bp_up');
  if(!host||!single)return null;
  const id=panelId==='prodMenu'?'mfProdUpgradePanel':'mfBldUpgradePanel';
  let panel=$(id);
  if(!panel){
    panel=document.createElement('section');panel.id=id;panel.className='bldUpgradePanel';
    panel.setAttribute('role','group');panel.setAttribute('aria-label','Structure upgrades');
    panel.innerHTML='<div class="bldUpgradeHead"><span>STRUCTURE GRADE</span><b></b></div>'
      +'<div class="bldUpgradeCensus" aria-live="polite"></div>'
      +'<div class="bldUpgradeActions"></div><div class="bldUpgradeReason" aria-live="polite"></div>';
    const all=document.createElement('button');all.type='button';
    all.id=panelId==='prodMenu'?'upAllBtn':'bp_up_all';
    all.className='bldUpgradeBtn bldUpgradeAll';
    const activate=ev=>{
      if(ev)ev.stopPropagation();
      if(typeof mfBuildingUpgradePress==='function')mfBuildingUpgradePress(true);
      else {if(typeof toast==='function')toast('Structure upgrade controls are unavailable');if(typeof sfx==='function')sfx('deny');}
    };
    if(typeof mfBindNativePress==='function')mfBindNativePress(all,activate);
    else all.addEventListener('click',activate);
    panel.querySelector('.bldUpgradeActions').appendChild(all);
  }
  const service=$('mfBldServiceActions'),stats=$('bp_stats'),prio=$('bp_prio');
  const anchor=panelId==='prodMenu'?(service&&service.parentElement===host?service:null):
    (stats&&stats.parentElement===host?stats:(prio&&prio.parentElement===host?prio:(service&&service.parentElement===host?service:null)));
  if(panel.parentElement!==host)host.insertBefore(panel,anchor||null);
  const actions=panel.querySelector('.bldUpgradeActions');
  single.classList.add('bldUpgradeBtn','bldUpgradeThis');
  if(single.parentElement!==actions)actions.insertBefore(single,actions.firstChild);
  return {panel,single,all:panel.querySelector('.bldUpgradeAll'),head:panel.querySelector('.bldUpgradeHead'),
    census:panel.querySelector('.bldUpgradeCensus'),reason:panel.querySelector('.bldUpgradeReason')};
}
function mfUpgradeReason(value,fallback){
  const reason=String(value||fallback||'').replace(/^\s+|\s+$/g,'');
  return reason||'Upgrade unavailable';
}
function mfUpgradeButtonCopy(button,label,detail){
  let strong=button.querySelector('strong'),small=button.querySelector('small');
  if(!strong||!small){
    button.textContent='';strong=document.createElement('strong');small=document.createElement('small');
    button.appendChild(strong);button.appendChild(small);
  }
  if(strong.textContent!==label)strong.textContent=label;
  if(small.textContent!==detail)small.textContent=detail;
}
function mfRenderBuildingUpgradeControls(B,panelId){
  const C=mfEnsureBuildingUpgradeControls(panelId);if(!C||!B)return;
  if(typeof BUP==='undefined'||!BUP[B.type]){C.panel.hidden=true;return;}
  C.panel.hidden=false;
  const info=typeof mfBuildingUpgradeBatchInfo==='function'?mfBuildingUpgradeBatchInfo(openBld):null;
  if(!info){
    C.panel.classList.add('is-legacy');C.all.hidden=true;C.head.hidden=true;C.census.hidden=true;C.reason.hidden=true;
    return;
  }
  C.panel.classList.remove('is-legacy');C.all.hidden=false;C.head.hidden=false;C.census.hidden=false;
  const target=String(info.targetLabel||'NEXT GRADE').toUpperCase();
  const grade=C.head.querySelector('b');if(grade.textContent!==target)grade.textContent=target;
  const owned=Math.max(0,Number(info.ownedCount)||0),eligible=Math.max(0,Number(info.eligibleCount)||0);
  const skipped=[];
  if(info.busyCount>0)skipped.push(info.busyCount+' BUSY');
  if(info.maxCount>0)skipped.push(info.maxCount+' MAX');
  if(info.lockedCount>0)skipped.push(info.lockedCount+' LOCKED');
  if(info.buildingCount>0)skipped.push(info.buildingCount+' BUILDING');
  let census=eligible+' OF '+owned+' OWNED ELIGIBLE'+(skipped.length?'  ·  SKIP '+skipped.join(' · '):'');
  const oneCost=mfUpgradeAmount(info.costM,'M')+'  '+mfUpgradeAmount(info.costE,'E');
  const allCost=mfUpgradeAmount(info.totalCostM,'M')+'  '+mfUpgradeAmount(info.totalCostE,'E');
  const oneDetail=info.canUpgradeSelected?target+'  ·  '+oneCost+'  ·  '+mfUpgradeAmount(info.duration,'S'):
    String(info.selectedCode||'blocked').toUpperCase();
  const allDetail=info.canUpgradeAll?eligible+' ELIGIBLE  ·  '+allCost:
    (eligible?eligible+' ELIGIBLE':'NO ELIGIBLE');
  mfUpgradeButtonCopy(C.single,'UPGRADE THIS',oneDetail);
  mfUpgradeButtonCopy(C.all,'UPGRADE ALL','THIS TYPE  ·  '+allDetail);
  C.single.style.display='flex';C.single.disabled=!info.canUpgradeSelected;
  C.all.disabled=!info.canUpgradeAll;
  C.single.dataset.state=info.canUpgradeSelected?'ready':'blocked';
  C.all.dataset.state=info.canUpgradeAll?'ready':'blocked';
  C.single.setAttribute('aria-label','Upgrade this '+String(info.name||BT[B.type]?.name||'structure')+'. '+oneDetail);
  C.all.setAttribute('aria-label','Upgrade all eligible owned '+String(info.name||BT[B.type]?.name||'structures')+' of this type. '+allDetail);
  C.single.title=oneDetail;C.all.title=allDetail;
  const reasons=[];
  if(!info.canUpgradeSelected)reasons.push('THIS: '+mfUpgradeReason(info.selectedReason));
  const batchReason=mfUpgradeReason(info.batchReason);
  if(!info.canUpgradeAll&&(!reasons.length||batchReason!==mfUpgradeReason(info.selectedReason)))reasons.push('ALL: '+batchReason);
  C.reason.hidden=true;C.reason.textContent='';
  census+=(reasons.length?'  ·  '+reasons.join('  ·  '):'');
  if(C.census.textContent!==census)C.census.textContent=census;
  C.panel.dataset.state=info.canUpgradeSelected||info.canUpgradeAll?'available':'blocked';
}
function renderBldPanel(){ if(openBldGone()) return;
  if(openBld<0) return;
  const B=blds[openBld], T=BT[B.type];
  const bi=$('bp_ic'); bi.innerHTML='';
  const panelKit=(typeof factionTextKit==='function')?factionTextKit(B.team):undefined;
  const ic=bldIconEl(B.type,52,panelKit); if(ic) bi.appendChild(ic);
  bi.classList.add('intelTap');
  bi.setAttribute('role','button'); bi.setAttribute('tabindex','0');
  bi.setAttribute('aria-label','Open full '+T.name+' structure intel and grade path');
  const explainBuilding=ev=>{
    if(ev)ev.stopPropagation();
    const live=openBld>=0&&blds[openBld];if(!live||!live.alive)return;
    showBuildingTypeCard(live.type,openBld,true);sfx('ui');
  };
  bi.onpointerdown=explainBuilding;
  bi.onkeydown=ev=>{if(!ev.repeat&&(ev.key==='Enter'||ev.key===' ')){ev.preventDefault();explainBuilding(ev);}};
  bi.onclick=ev=>{if(ev.detail===0)explainBuilding(ev);};
  const bLv=typeof bldDisplayLevel==='function'?bldDisplayLevel(B):(B.type==='fac'?(B.tier===2?2:1):(B.lvl||1));
  $('bp_title').textContent=intelBldName(B.type,(typeof factionTextKit==='function')?factionTextKit(B.team):undefined)
    +'  ·  LV'+bLv+(bLv>1?' '+'★'.repeat(Math.min(3,bLv)):'');
  $('bp_desc').textContent='HP '+Math.ceil(B.hp)+' / '+Math.ceil(B.hpm)
    +(B.shieldMax?' · '+Math.ceil(B.shield)+'/'+Math.ceil(B.shieldMax)+' shield':'');
  const statsEl=$('bp_stats'),deltaEl=$('bp_delta');
  if(statsEl) statsEl.textContent=bldPanelStatText(B);
  mfRenderBuildingActivityControls(B,'bldMenu2');
  const ub=$('bp_up'), path=BUP[B.type];
  const bLvl=B.type==='fac'?(B.tier===2?2:1):(B.lvl||1);
  if(path && (bLvl-1)<path.length && !(B.type==='fac')){
    const U=path[bLvl-1];
    if(deltaEl){ deltaEl.style.display='none'; deltaEl.textContent=bldUpgradeDeltaText(B)+'  ·  '+bldUpgradePlanText(B); }
    ub.style.display='block';
    ub.textContent=B.upT>0? ('UPGRADING… '+Math.ceil(B.upT)+'s')
      : ('⬆ UPGRADE TO MK'+(bLvl+1)+'  ·  '+U.cm+'m '+U.ce+'e  ·  '+U.t+'s');
  } else {
    ub.style.display='none';
    if(deltaEl&&path&&!((B.type==='fac'))){
      deltaEl.style.display='none';
      deltaEl.textContent='◆ MAXIMUM STRUCTURE GRADE  ·  '+bldUpgradePlanText(B);
    } else if(deltaEl) deltaEl.style.display='none';
  }
  mfRenderBuildingServiceControls(B,'bldMenu2');
  mfRenderBuildingUpgradeControls(B,'bldMenu2');
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
      /* novaFire spends the wallet that OWNS the silo. Reading resE[0] here made
         the button say READY on an ally Nova the ally could not afford, and
         NEEDS ENERGY on one it could. Ask the same wallet the shot will bill. */
      const novaBank=(typeof econBankE==='function'&&typeof commanderSlotForBuilding==='function')
        ? econBankE(0,commanderSlotForBuilding(B)) : resE[0];
      const lowE=novaBank<NOVA.e;
      fb.style.display='block';
      fb.disabled=B.cool>0||lowE;
      fb.textContent=B.cool>0? ('☄ CHARGING… '+Math.ceil(B.cool)+'s')
                    : lowE? ('⚡ NEEDS '+NOVA.e+' ENERGY ('+Math.floor(novaBank)+')')
                          : '☄ FIRE NOVA — then tap any target';
    } else fb.style.display='none';
  }
}
function renderResearchMenu(){ if(openBldGone()) return;
  const g=$('prodGrid'); g.innerHTML='';
  if(openBld<0) return;
  const B=blds[openBld];
  renderProdNav(B);
  $('prodNavName').textContent='FIELD STUDIES';
  const status=document.createElement('div');
  status.className='researchStatus';
  const carryN=Object.keys(researchCarry).filter(id=>!researched[id]&&researchCarry[id]>.5).length;
  const guard=B.guardT>0?('CONTAINMENT '+Math.ceil(B.guardT)+'s')
    :B.guardReady?'CONTAINMENT READY'
    :('REARM '+Math.min(99,Math.floor((B.guardCharge||0)/TECH_GUARD.rearm*100))+'%');
  status.innerHTML='<b>FIELD STUDIES · MATCH ONLY</b><span>'+Math.ceil(B.shield)+' / '+Math.ceil(B.shieldMax)+' SHIELD · '
    +guard+' · '+resDone+' STUDIES'+(carryN?' · '+carryN+' RECOVERABLE':'')+'</span>'
    +'<small>Effects end with this battle. Each completion banks +3 ◆ Data for persistent Development at debrief.</small>';
  g.appendChild(status);
  let shown=0;
  RESEARCH.forEach((R,idx)=>{
    if(researched[R.id]) return;
    if(R.req&&!researched[R.req]) return;
    const lockLvl=R.clvl&&heroLvl<R.clvl;
    const carry=researchResumeTime(R.id),recover=carry>0?Math.min(99,Math.floor(carry/R.t*100)):0;
    const d=document.createElement('div');
    d.className='bcard'+(lockLvl?' locked':'');
    d.setAttribute('role','button');d.tabIndex=0;d.setAttribute('aria-disabled',lockLvl?'true':'false');
    d.setAttribute('aria-label',R.nm+'. '+(lockLvl?'Unlocks at Commander level '+R.clvl:
      'Costs '+R.cm+' mass and '+R.ce+' energy. '+R.ds));
    d.innerHTML='<div class="em">'+(lockLvl?'🔒':R.em)+'</div><div class="nm">'+R.nm+'</div>'
      +(lockLvl?'<div class="cost" style="color:#ffd257">CDR LV '+R.clvl+'</div>'
        :'<div class="cost">'+R.cm+'m <span>'+R.ce+'e</span></div>')
      +'<div style="opacity:.7">'+R.ds+'</div>'
      +(recover?'<div class="researchRecover">◆ RECOVER '+recover+'%</div>':'');
    const activate=ev=>{
      if(ev)ev.preventDefault();
      ev.stopPropagation();
      if(lockLvl){ toast('🔒 Field Study '+R.nm+' unlocks at Commander level '+R.clvl); return; }
      /* Same corpse hazard as the production sheet, plus a hard throw: a lab
         destroyed while its card list was on screen left openBld pointing at a
         dead slot, and `Bb.res` on a cleared openBld (-1) is a TypeError that
         kills the whole pointerdown handler chain. */
      if(openBldGone()) return;
      const Bb=blds[openBld];
      if(Bb.res>=0){ toast('Already studying '+RESEARCH[Bb.res].nm); return; }
      if(window.MFMatchCommandConsumer&&typeof MFMatchCommandConsumer.takeover==='function'&&
         MFMatchCommandConsumer.takeover({type:'research',building:{id:openBld,type:Bb.type},study:R.id})){
        toast('◆ '+R.nm+' order transmitted');return;
      }
      Bb.res=idx; Bb.resT=Math.min(R.t-.01,researchResumeTime(R.id)); sfx('ui'); renderQueue();
      if(Bb.resT>0) toast('◆ '+R.nm+' recovered at '+Math.floor(Bb.resT/R.t*100)+'%');
    };
    if(typeof mfBindNativePress==='function')mfBindNativePress(d,activate);
    else d.addEventListener('pointerdown',activate);
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
  renderQueue(true);
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
  const T=TYPES[tIdx];
  const w=document.createElement('div');
  w.className='mfRuntimeThumb';
  w.style.cssText='position:relative;width:'+size+'px;height:'+size+'px;display:grid;place-items:center;overflow:hidden';
  w.setAttribute('role','img');w.setAttribute('aria-label',(T&&T.name||'Unit')+' runtime model');
  /* A neutral loading reticle is deliberately the only pre-render fallback.
     The faction icon sheets classify a role; they do not depict the exact live
     chassis, and were the source of the commander/build-card mismatch. */
  const fallback=document.createElement('span');fallback.className='mfRuntimeThumbFallback';fallback.textContent='◌';
  fallback.setAttribute('aria-hidden','true');fallback.style.opacity='.42';w.appendChild(fallback);
  const live=document.createElement('img');live.alt='';live.setAttribute('aria-hidden','true');
  live.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .16s';
  w.appendChild(live);
  mfIntelThumbRequest(live,w,'unit',tIdx,kit);
  return w;
}
function bldIconEl(key,size,kit){
  kit=mfIntelKit(kit);
  const d=document.createElement('div');d.className='mfRuntimeThumb';
  d.style.cssText='position:relative;width:'+size+'px;height:'+size+'px;display:grid;place-items:center;overflow:hidden';
  const T=BT[key];d.setAttribute('role','img');d.setAttribute('aria-label',(T&&T.name||'Building')+' runtime model');
  const fallback=document.createElement('span');fallback.className='mfRuntimeThumbFallback';fallback.textContent='◌';
  fallback.setAttribute('aria-hidden','true');fallback.style.opacity='.42';d.appendChild(fallback);
  const live=document.createElement('img');live.alt='';live.setAttribute('aria-hidden','true');
  live.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .16s';
  d.appendChild(live);
  mfIntelThumbRequest(live,d,'building',key,kit);
  return d;
}
/* The open tab persists across openings — a player who is in the middle of
   building anti-air should not be dropped back on infantry every time they
   reopen the panel. */
let prodTab='inf', bldTab='eco';
function mfSyncProductionQueueCards(B){
  const full=!!(B&&Array.isArray(B.queue)&&B.queue.length>=MF_PRODUCTION_QUEUE_CAP);
  const cards=document.querySelectorAll('#prodGrid .bcard[data-queue-sensitive="1"]');
  for(const card of cards){
    const authored=card.dataset.authoredLock==='1';
    card.classList.toggle('locked',authored||full);
    card.classList.toggle('queueFull',full);
    card.setAttribute('aria-disabled',authored||full?'true':'false');
    const flag=card.querySelector('.cardQueueLock');if(flag)flag.hidden=!full;
    const base=card.dataset.baseAria||card.getAttribute('aria-label')||'';
    card.setAttribute('aria-label',(full?'Queue full. ':'')+base);
  }
}
const BASE_FINDER_GROUPS=[
  {id:'all',nm:'All buildings',short:'ALL',em:'⌂'},{id:'economy',nm:'Economy buildings',short:'ECON',em:'⛏'},
  {id:'production',nm:'Factories',short:'FACT',em:'🏭'},{id:'defence',nm:'Defence buildings',short:'DEF',em:'🛡'},
  {id:'support',nm:'Support buildings',short:'SUP',em:'📡'}
];
const BASE_FINDER_ECON=new Set(['mex','pgen','geo','silo','fab']);
const BASE_FINDER_PROD=new Set(['fac','tgate','harbor','airfield']);
const BASE_FINDER_DEF=new Set(['turret','bunker','seafort','bastion','aatower','hellstorm','arc','rail','nova','minelaser','missilebastion','plasma','stormcaller','wall','gate']);
let baseFinderFilter='all';
const baseFinderTypeCursor=Object.create(null);
function baseFinderGroup(B){
  const type=B&&B.type||'';
  if(BASE_FINDER_ECON.has(type))return'economy';
  if(BASE_FINDER_PROD.has(type))return'production';
  if(BASE_FINDER_DEF.has(type))return'defence';
  /* HQ, research, shields and territory relays are support. This explicit map
     fixes the old `bcat || support` fallback that labelled Extractors, Reactors,
     Factories, artillery and walls as Support. */
  return'support';
}
function ensureBaseFinder(){
  let p=$('baseFinder'); if(p) return p;
  p=document.createElement('section');p.id='baseFinder';p.className='baseFinder';p.setAttribute('aria-label','Owned buildings');document.body.appendChild(p);return p;
}
function focusBaseBuilding(B){
  clearSel();openBld=blds.indexOf(B);camFollow=-1;cam.x=B.x;cam.y=B.y;clampCam();camUpdateMatrices();
  addParticle(3,B.x,B.y,0,0,.55,B.r*2.4,112,220,255); toast('⌖ '+BT[B.type].name.toUpperCase()+' — '+baseFinderGroup(B).toUpperCase());
}
function baseFinderTypeStatus(list){
  let building=0,stalled=0,damaged=0,hp=0,hpm=0;
  for(const B of list){
    if(B.prog!=null&&B.prog<1){building++;if(B.buildStalled)stalled++;}
    else if(B.hp<B.hpm*.75)damaged++;
    hp+=Math.max(0,B.hp||0);hpm+=Math.max(1,B.hpm||1);
  }
  const ready=list.length-building,parts=[];
  if(ready)parts.push(ready+' READY');if(building)parts.push(building+' BUILDING');if(stalled)parts.push(stalled+' STALLED');if(damaged)parts.push(damaged+' DAMAGED');
  return {text:parts.join(' · ')||'READY',health:Math.round(clamp(hp/hpm,0,1)*100)};
}
function renderBaseFinder(){
  const p=ensureBaseFinder(),all=blds.filter(B=>B.alive&&(typeof mfLocalOwnsBuilding==='function'?mfLocalOwnsBuilding(B):B.team===0));
  const list=all.filter(B=>baseFinderFilter==='all'||baseFinderGroup(B)===baseFinderFilter);
  const byType=new Map();for(const B of list){if(!byType.has(B.type))byType.set(B.type,[]);byType.get(B.type).push(B);}
  const types=Array.from(byType.keys()).sort((a,b)=>a==='hq'?-1:b==='hq'?1:BT[a].name.localeCompare(BT[b].name));
  const cards=types.map(type=>{
    const owned=byType.get(type),T=BT[type],S=baseFinderTypeStatus(owned),active=openBld>=0&&blds[openBld]&&blds[openBld].type===type;
    return '<button type="button" class="baseFindCard'+(active?' on':'')+'" data-btype="'+type+'" aria-label="'+T.name+', '+owned.length+' owned, '+S.text+'. Tap to focus the next one.">'
      +'<span class="baseFindIcon">'+(T.em||'◇')+'</span><span class="baseFindCopy"><b>'+T.name+'</b><small>'+S.text+'</small>'
      +'<i><span style="width:'+S.health+'%"></span></i></span><strong>×'+owned.length+'<small>'+S.health+'% HP</small></strong></button>';
  }).join('');
  p.innerHTML='<header><button type="button" class="baseFindBack" aria-label="Close Buildings and return to Orders">‹ ORDERS</button><span><b>OWNED BUILDINGS</b><small>'+all.length+' TOTAL</small></span></header>'
    +'<div class="baseFindTabs" role="tablist" aria-label="Building categories">'+BASE_FINDER_GROUPS.map(g=>'<button type="button" role="tab" aria-selected="'+(g.id===baseFinderFilter?'true':'false')+'" aria-label="'+g.nm+'" title="'+g.nm+'" data-f="'+g.id+'" class="'+(g.id===baseFinderFilter?'on':'')+'"><span class="baseFindTabIcon" aria-hidden="true">'+g.em+'</span><span class="baseFindTabLabel">'+g.short+'</span></button>').join('')+'</div>'
    +'<div class="baseFindGrid" role="list">'+(cards||'<p class="baseFindEmpty">NO '+baseFinderFilter.toUpperCase()+' BUILDINGS YET</p>')+'</div>'
    +'<p class="baseFindHint">Tap a building card to select and center it. Tap again to cycle another of that type.</p>';
  /* Cards are first assembled as light markup, then receive the same exact
     runtime-geometry thumbnails as production and Unit Intel. T.em remains
     only in the category vocabulary; it must not masquerade as a building. */
  const finderKit=typeof playerKitKey==='function'?playerKitKey():'nova';
  p.querySelectorAll('[data-btype]').forEach(btn=>{
    const icon=btn.querySelector('.baseFindIcon'),type=btn.dataset.btype;if(!icon||!BT[type])return;
    icon.replaceChildren(bldIconEl(type,36,finderKit));
  });
  mfBindNativePress(p.querySelector('.baseFindBack'),()=>{closeBaseFinder(true);sfx('ui');});
  p.querySelectorAll('[data-f]').forEach(btn=>mfBindNativePress(btn,ev=>{
    ev.stopPropagation();baseFinderFilter=btn.dataset.f;renderBaseFinder();sfx('ui');
  }));
  p.querySelectorAll('[data-btype]').forEach(btn=>mfBindNativePress(btn,ev=>{
    ev.stopPropagation();const type=btn.dataset.btype,owned=all.filter(B=>B.type===type);
    if(!owned.length){renderBaseFinder();return;}
    const at=(baseFinderTypeCursor[type]||0)%owned.length;baseFinderTypeCursor[type]=at+1;
    focusBaseBuilding(owned[at]);renderBaseFinder();sfx('ui');
  }));
}
function openBaseFinder(){renderBaseFinder();ensureBaseFinder().style.display='block';}
function closeBaseFinder(restoreDeck){
  const p=$('baseFinder');if(p)p.style.display='none';
  if(restoreDeck!==false&&typeof hudDeck==='string'&&hudDeck==='buildings'&&typeof setHudDeck==='function')setHudDeck('orders',true);
}
function toggleBaseFinder(){
  const p=ensureBaseFinder();
  if(p.style.display==='block'){closeBaseFinder(true);return;}
  if(typeof setHudDeck==='function')setHudDeck('buildings');else openBaseFinder();
}
function renderProdMenu(){ if(openBldGone()) return;
  const g=$('prodGrid'); g.innerHTML='';
  $('repeatBtn').style.display='block';
  if(openBld<0) return;
  const B=blds[openBld];
  renderProdNav(B);
  /* Locked units used to be DELETED from the roster: a tier-1 factory simply
     did not draw the twelve tier-2 chassis, and factionDoctrineRoster silently
     dropped whatever the faction does not field. Structures have always shown
     their locks (grey + padlock + reason); units showed nothing, so the player
     could not tell a missing card from a card that does not exist. Keep the
     removed entries and render them locked. */
  let list, lockedTier=[], lockedDoc=[];
  if(B.type==='tgate') list=[8,26];
  else if(B.type==='harbor') list=[14,15];
  else if(B.type==='airfield') list=[5,17,25];
  else {
    const T2=[0,1,9,18,10,2,3,6,7,11,16,19,20,21,22,23,24,27,32];
    const T1=[0,1,9,10,19,24,32];
    list = B.tier===2? T2 : T1;
    if(B.tier!==2) lockedTier=T2.filter(t=>T1.indexOf(t)<0);
  }
  if(typeof factionDoctrineRoster==='function'){
    const kept=factionDoctrineRoster(list,B.type,0);
    lockedDoc=list.filter(t=>kept.indexOf(t)<0);
    /* A chassis the faction does not field is not unlocked by TECH 2 either. */
    if(lockedTier.length) lockedTier=factionDoctrineRoster(lockedTier,B.type,0);
    list=kept;
  }
  const lockWhy={};
  for(const t of lockedTier) lockWhy[t]='TECH 2';
  for(const t of lockedDoc) lockWhy[t]='NOT FIELDED';
  const lockedAll=lockedTier.concat(lockedDoc);
  /* ROLE TABS. A flat grid of eighteen cards is a wall; one tap per role lets
     the player find the answer to whatever is killing them without reading
     every stat block on the way there. */
  const order=['inf','veh','at','aoe','art','aa','air','nav','sup','exp'];
  const groups={};
  for(const t of list){ const c=TYPES[t].cat||'veh'; (groups[c]||(groups[c]=[])).push(t); }
  /* Locked chassis join their own role tab so the tab itself stops lying about
     how deep the roster is. They sort last within the tab. */
  for(const t of lockedAll){ const c=TYPES[t].cat||'veh'; (groups[c]||(groups[c]=[])).push(t); }
  const tabs=order.filter(c=>groups[c]);
  if(tabs.indexOf(prodTab)<0) prodTab=tabs[0];
  const tr=$('prodTabs'); tr.innerHTML='';
  tr.style.display=tabs.length>1?'flex':'none';
  for(const c of tabs){
    const C=UCAT[c]||{nm:'OTHER',em:'•'};
    const b=document.createElement('button');
    b.className='tabBtn'+(c===prodTab?' on':'');
    b.innerHTML='<span class="tEm">'+C.em+'</span>'+C.nm;
    mfBindNativePress(b,ev=>{ ev.stopPropagation(); prodTab=c; sfx('ui'); renderProdMenu(); });
    tr.appendChild(b);
  }
  renderMenuRoleBrief('unit',prodTab,groups[prodTab]||[]);
  const tabList=(groups[prodTab]||[]).slice().sort((a,b)=>(lockWhy[a]?1:0)-(lockWhy[b]?1:0));
  tabList.forEach(tIdx=>{
    const T=TYPES[tIdx];
    const why=lockWhy[tIdx]||'';
    const Q=mfUnitProductionQuote(tIdx,B),C=Q.cost;
    const d=document.createElement('div');
    d.className='bcard'+((why||Q.queueFull)?' locked':'')+(Q.queueFull?' queueFull':'');
    d.dataset.queueSensitive='1';d.dataset.authoredLock=why?'1':'0';
    d.dataset.previewKind='unit';d.dataset.previewId=String(tIdx);
    d.innerHTML='<div class="nm">'+intelUnitName(tIdx)+'</div>'
      +'<div class="cost">'+C.m+'m <span>'+C.e+'e</span></div>'
      +'<div class="cardMeta"><span>⏱ '+mfFmtSeconds(Q.effectiveSeconds)+'</span><span>'+Q.size.label+' · Ø'+Q.size.diameter+'m</span></div>'
      +'<div class="cardMeta"><span>POP +1 · '+Q.popUsed+'/'+Q.popCap+'</span><span>'+(Q.queueFull?'QUEUE FULL':'QUEUE '+Q.queuePosition+'/'+Q.queueCap)+'</span></div>'
      +'<div class="cardDependency">FACILITY · '+Q.dependency+'</div>'
      +(why?'<div class="cardLocks">🔒 '+why+'</div>':'')
      +'<div class="cardLocks cardQueueLock"'+(Q.queueFull?'':' hidden')+'>🔒 QUEUE FULL · CANCEL OR COMPLETE A UNIT</div>'
      +'<div class="wkTag">'+ammoName(T)+'</div><div class="cardPurpose">'+intelUnitLine(tIdx)+'</div>'
      +(why?'<span class="lockOv">🔒</span>':'');
    d.setAttribute('role','button');
    d.setAttribute('tabindex','0');
    d.dataset.baseAria='Build '+intelUnitName(tIdx)+'. Cost '+C.m+' mass and '+C.e+' energy. '+mfFmtSeconds(Q.effectiveSeconds)+'. '+Q.size.label+' size. Population plus one. Queue position '+Q.queuePosition+' of '+Q.queueCap+'. '+(why?'Locked: '+why+'. ':'')+intelUnitLine(tIdx);
    d.setAttribute('aria-label',(Q.queueFull?'Queue full. ':'')+d.dataset.baseAria);
    d.setAttribute('aria-disabled',(why||Q.queueFull)?'true':'false');
    const icw=document.createElement('div'); icw.className='icw';
    icw.appendChild(unitIconEl(tIdx,44));
    d.insertBefore(icw,d.firstChild);
    const queueUnit=(batch)=>{
      if(why){
        if(typeof sfx==='function') sfx('deny');
        toast(why==='TECH 2'
          ? '🔒 '+intelUnitName(tIdx)+' needs a TECH 2 factory — upgrade this factory to field it'
          : '🔒 '+intelUnitName(tIdx)+' is not fielded by your faction');
        return false;
      }
      /* The structure can die between opening the sheet and this tap. Without
         this the push lands in a corpse: sfx('ui') fires, the plate paints, and
         the unit is never built. */
      if(openBldGone()) return false;
      const Bb=blds[openBld];
      const popSlot=typeof commanderSlotForBuilding==='function'?commanderSlotForBuilding(Bb):-1;
      if(!populationCanSpawn(tIdx,0,popSlot)){
        const used=typeof populationUsedFor==='function'?populationUsedFor(0):(teamCount[0]|0);
        const cap=typeof populationCapFor==='function'?populationCapFor(0):500;
        toast('⚠ FACTION CAP '+used+' / '+cap+' — recycle units to free population');
        sfx('deny');return false;
      }
      if(tIdx===8 && titanCount[0]+Bb.queue.filter(q=>q===8).length>=3){ toast('Max 3 TITANs'); return false; }
      if((tIdx===UT_ENGINEER||tIdx===UT_MINER)&&supportUnitCount(0,true)>=supportUnitCap(0)){
        toast('⚙ SUPPORT CAP '+supportUnitCap(0)+' — raise Commander level or operate a Research Lab');return false;
      }
      const room=MF_PRODUCTION_QUEUE_CAP-Bb.queue.length;
      if(room<=0){
        toast('🔒 PRODUCTION QUEUE FULL · CANCEL OR COMPLETE A UNIT');sfx('deny');
        mfSyncProductionQueueCards(Bb);return false;
      }
      const n=Math.max(1,Math.min(batch||1,tIdx===8?1:5,room));
      if(window.MFMatchCommandConsumer&&typeof MFMatchCommandConsumer.takeover==='function'&&
         MFMatchCommandConsumer.takeover({type:'produce',building:{id:openBld,type:Bb.type},unit:tIdx,count:n})){
        toast('▶ '+T.name+' order transmitted');return true;
      }
      for(let q=0;q<n;q++)Bb.queue.push(tIdx);
      if(n){renderQueue();sfx('ui');if(n>1)toast('▶ ×'+n+' '+T.name+' queued (hold to batch)');}
      return !!n;
    };
    /* Commit on release, not pointerdown: scrolling the roster cannot queue a
       unit. A stationary 430ms hold still queues the authored batch of five. */
    let prodPress=null;
    d.addEventListener('pointerdown',ev=>{
      ev.stopPropagation();
      prodPress={id:ev.pointerId,x:ev.clientX,y:ev.clientY,moved:false,batch:false,hold:0};
      if(tIdx!==8)prodPress.hold=setTimeout(()=>{
        if(prodPress&&!prodPress.moved){prodPress.batch=true;queueUnit(5);}
      },430);
    });
    d.addEventListener('pointermove',ev=>{
      if(!prodPress||prodPress.id!==ev.pointerId)return;
      if(Math.hypot(ev.clientX-prodPress.x,ev.clientY-prodPress.y)>10){prodPress.moved=true;clearTimeout(prodPress.hold);}
    });
    const finishProd=ev=>{
      if(!prodPress||prodPress.id!==ev.pointerId)return;
      const p=prodPress;prodPress=null;clearTimeout(p.hold);
      if(ev.type==='pointerup'&&!p.moved&&!p.batch)queueUnit(1);
    };
    d.addEventListener('pointerup',finishProd);
    d.addEventListener('pointercancel',finishProd);
    d.addEventListener('pointerleave',ev=>{if(prodPress&&prodPress.id===ev.pointerId&&prodPress.moved)finishProd(ev);});
    /* Pointer already commits on release. Enter/Space must not also synthesize
       a click handler — production cards have none — so the key path queues
       once, matching a completed tap. */
    mfHudEnterSpace(d,()=>{if(!prodPress)queueUnit(1);});
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
  renderQueue(true);
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
      /* Refund the seat that OWNS the factory. Refunding the human bank
         while an ally seat paid the stream is a wallet-to-wallet theft
         primitive under shared control: queue in an ally factory, cancel,
         pocket the refund. */
      credit(0,facCost.m*frac,facCost.e*frac,typeof commanderSlotForBuilding==='function'?commanderSlotForBuilding(B):null);
    }
    B.queue.shift();
    B.prodT=0;
  } else B.queue.splice(last,1);
  return true;
}
function renderQueue(forceControls){ if(openBldGone()) return;
  if(openBld<0) return;
  const B=blds[openBld];
  const prodPanel=$('prodMenu'),prodVisible=!!(prodPanel&&prodPanel.style.display==='block');
  if(forceControls||prodVisible){
    mfRenderBuildingActivityControls(B,'prodMenu');
    mfRenderBuildingServiceControls(B,'prodMenu');
    mfRenderBuildingUpgradeControls(B,'prodMenu');
  }
  const el=$('prodQueue'); if(!el) return;
  if(B.type==='techlab'){
    el._mfQ='';
    el.classList.add('empty');
    const shield='SHIELD '+Math.ceil(B.shield)+'/'+Math.ceil(B.shieldMax);
    const pending=resDone*3+' ◆ DATA → DEVELOPMENT AT DEBRIEF';
    el.textContent=(B.res>=0?('Studying '+RESEARCH[B.res].nm+' — '+Math.ceil(RESEARCH[B.res].t-B.resT)+'s'):'Choose a match-only Field Study')
      +' · '+shield+' · '+pending;
    return;
  }
  const q=B.queue||[];
  mfSyncProductionQueueCards(B);
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
        /* Same two-tap arm as recycle (bp_sell): first completed tap states the
           cancel, second commits. pointerdown only records the press so a
           horizontal queue-row pan cannot refund a unit. */
        const requestCancel=ev=>{
          ev.stopPropagation();
          const Bb=openBld>=0?blds[openBld]:null;
          if(!Bb||!Bb.alive) return;
          const now=Date.now();
          if(!(plate._mfQCancelAt>now)){
            plate._mfQCancelAt=now+3000;
            plate.setAttribute('aria-label','Tap again to cancel one '+intelUnitName(S.t)+', '+S.n+' queued');
            if(typeof toast==='function') toast('✕ CANCEL '+intelUnitName(S.t).toUpperCase()+' · TAP AGAIN TO CONFIRM');
            if(typeof sfx==='function') sfx('ui');
            return;
          }
          plate._mfQCancelAt=0;
          if(cancelQueuedUnit(Bb,S.i)){ if(typeof sfx==='function') sfx('ui'); renderQueue(); }
        };
        mfHudBindQueueCancel(plate,requestCancel);
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
  /* Unit production was the ONLY system with no numeric time readout —
     structures show 'UPGRADING… Ns', research shows its countdown, Nova shows
     charge seconds, and a factory showed a bar with no scale. Written outside
     the signature-diff above so it ticks without rebuilding the row. */
  let eta=el.querySelector('.qEtaLine');
  if(q.length){
    const T0=TYPES[q[0]];
    const headSpeed=mfFactorySpeed(B,T0);
    let rem=T0?Math.max(0,(T0.bt||0)-(B.prodT||0))/headSpeed:0;
    for(let qi=1;qi<q.length;qi++){
      const Tq=TYPES[q[qi]];rem+=(Tq.bt||0)/mfFactorySpeed(B,Tq);
    }
    const head=T0?Math.max(0,Math.ceil(((T0.bt||0)-(B.prodT||0))/headSpeed)):0;
    if(!eta){ eta=document.createElement('div'); eta.className='qAdj qEtaLine'; el.appendChild(eta); }
    const stalled=B.prodStalled?(B.prodStalled==='population'?'UNIT CAP':'NEEDS RESOURCES'):'';
    eta.textContent=stalled?('■ STALLED · '+stalled+' · '+intelUnitName(q[0])):
      ('▶ '+intelUnitName(q[0])+' in '+head+'s'+(q.length>1?('  ·  queue '+Math.ceil(rem)+'s'):''));
  } else if(eta) eta.remove();
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
    mfBindNativePress(b,ev=>{ ev.stopPropagation(); bldTab=c; sfx('ui'); renderBuildMenu(); });
    tr.appendChild(b);
  }
  renderMenuRoleBrief('building',bldTab,grp[bldTab]||[]);
  for(const key of (grp[bldTab]||[])){
    const T=BT[key];
    const d=document.createElement('div');
    const lockLvl=T.clvl&&heroLvl<T.clvl;
    const lockReq=T.req&&!hasBld(0,T.req);
    const lockDomain=T.placement==='water'&&typeof battlefieldNavalEnabled==='function'&&!battlefieldNavalEnabled();
    const Q=mfStructureBuildQuote(key),hardLocks=[];
    if(lockLvl)hardLocks.push('COMMANDER LEVEL '+T.clvl);
    if(lockReq)hardLocks.push('NEEDS '+BT[T.req].name.toUpperCase());
    if(lockDomain)hardLocks.push('CONNECTED NAVAL DOMAIN');
    d.className='bcard'+((lockLvl||lockReq||lockDomain)?' locked':'');
    d.dataset.previewKind='building';d.dataset.previewId=key;
    d.dataset.footprint=Math.round(Q.footprint[0])+'x'+Math.round(Q.footprint[1]);
    d.dataset.footprintPolicy='reserved-max-tier';
    d.innerHTML='<div class="nm">'+intelBldName(key)+'</div>'
      +'<div class="cost">'+T.cm+'m <span>'+T.ce+'e</span></div>'
      +'<div class="cardMeta"><span>⏱ '+mfFmtSeconds(Q.effectiveSeconds)+'</span><span>FOOT '+Math.round(Q.footprint[0])+'×'+Math.round(Q.footprint[1])+'m</span></div>'
      +'<div class="cardMeta"><span>'+Q.placement+'</span><span>2% START · '+Q.streamPercent+'% STREAM</span></div>'
      +'<div class="cardDependency">PREREQ · '+Q.dependencies.join(' · ')+'</div>'
      +'<div class="cardEffect">'+Q.effect+'</div>'
      +(hardLocks.length?'<div class="cardLocks">🔒 '+hardLocks.join(' · ')+'</div>':'')
      +'<div class="cardPurpose">'+intelBldMini(key)+'</div><div class="cardDesc">'+T.desc+'</div>'
      +((lockLvl||lockReq)?'<span class="lockOv">🔒</span>':lockDomain?'<span class="lockOv navalX">✕</span>':'');
    d.setAttribute('role','button');
    d.setAttribute('tabindex','0');
    d.setAttribute('aria-disabled',(lockLvl||lockReq||lockDomain)?'true':'false');
    d.setAttribute('aria-label','Build '+intelBldName(key)+'. Cost '+T.cm+' mass and '+T.ce+' energy. '+mfFmtSeconds(Q.effectiveSeconds)+'. Footprint '+Math.round(Q.footprint[0])+' by '+Math.round(Q.footprint[1])+' meters. '+(hardLocks.length?'Locked: '+hardLocks.join(', ')+'. ':'')+Q.effect);
    const icw=document.createElement('div'); icw.className='icw';
    icw.appendChild(bldIconEl(key,46));
    d.insertBefore(icw,d.firstChild);
    const chooseStructure=ev=>{
      ev.stopPropagation();
      if(T.clvl&&heroLvl<T.clvl){ toast('🔒 '+T.name+' unlocks at Commander level '+T.clvl); return; }
      if(T.req&&!hasBld(0,T.req)){ toast('🔒 Requires a '+BT[T.req].name); return; }
      if(lockDomain){ toast('✕ NAVAL UNAVAILABLE — this battlefield has no connected ocean or river domain'); sfx('reject'); return; }
      startPlacing(key); sfx('ui');
    };
    /* A build card lives inside a scrollable phone sheet. Committing on
       pointerdown made an attempt to scroll into an immediate placement action,
       which reads as an unrelated notification/ghost instead of a deliberate
       choice. Use the shared tap contract when it is available; it commits only
       a completed tap and keeps keyboard activation intact. */
    if(typeof mfBindTap==='function') mfBindTap(d,chooseStructure);
    else d.addEventListener('pointerdown',chooseStructure);
    /* mfBindTap already owns click (keyboard + assistive tap). Enter/Space on a
       div does not fire click, so synthesize one click — not a second choose. */
    mfHudEnterSpace(d,ev=>{
      if(typeof mfBindTap==='function') d.click();
      else chooseStructure(ev);
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


/* ============================================================================
   COMMANDER / KEEL MINIMAP RECEIVER
   ----------------------------------------------------------------------------
   Presentation only. src/game/commander.js owns which cue happens, in what
   order, and how often; src/story.js owns what it says; src/audio.js owns
   whether it is spoken. This block owns the single in-battle presentation
   surface requested for both profiles: the minimap temporarily becomes the
   receiver, signal-flickers during the line, then returns to tactical use.

   IT DOES NOT RE-IMPLEMENT ANY OF THAT. There is no local dedupe, no local
   priority, no local queue and no replay buffer here — those all exist
   upstream, and a second copy would drift. The receiver is instead the PACING
   CONSUMER: it calls commanderDialogueDrain() only while it is idle, so a cue
   is pulled at the exact moment the receiver is free, and anything that goes
   stale while it is busy is dropped upstream by the rules that
   already govern it. One cue on screen at a time, by construction.

   ONE NODE, FOR THE WHOLE MATCH. #cmdrTx and its children are authored in
   index.html and reused; nothing here creates, clones or appends an element, so
   a long match cannot grow the DOM by a single node.

   PLACEMENT IS DELIBERATE. #cmdrTx is a child of #minimapWrap and fills its
   inner canvas area at every responsive HUD size. It is not allowed to float
   elsewhere, because commander dialogue should read as an intercepted tactical
   transmission rather than another unrelated HUD card.

   NOTHING HERE IS INTERACTIVE. No listener, no tabindex, no focus() call, and
   pointer-events:none in CSS. The rail cannot take a tap, cannot be tabbed to,
   and cannot swallow a gesture meant for the battlefield or the command dock.
   ============================================================================ */
/* Entry and exit are short enough to read as a cut rather than an animation;
   the hold is what the player actually experiences. Reduced motion drops the
   transition in CSS and leaves these timings alone, so the line is on screen
   for the same duration either way. */
const CMDRTX_ENTER_MS=170, CMDRTX_EXIT_MS=230;
/* Reading time, not a fixed dwell: a three-word acknowledgement and a full
   sentence should not sit on screen for the same length of time. Floor keeps a
   short line from flashing; ceiling keeps a long one from outstaying an event
   the player has already moved past. */
const CMDRTX_HOLD_MIN=2600, CMDRTX_HOLD_MAX=6500, CMDRTX_HOLD_BASE=900, CMDRTX_HOLD_PER_CHAR=46;
/* Recheck while a cue is visible so responsive HUD changes and device rotation
   cannot leave a legacy inline size on the fixed minimap receiver. */
const CMDRTX_SOLVE_MS=500;
const CMDRTX={el:null,wrap:null,video:null,img:null,initial:null,who:null,rank:null,tag:null,line:null,ready:false,missing:false,
  bound:false,state:'idle',until:0,solveAt:0,cue:null,
  shown:0,solved:0,placement:'',portraitFallbacks:0,lastKey:''};
function cmdrTxEls(){
  if(CMDRTX.ready) return true;
  if(CMDRTX.missing) return false;
  const el=document.getElementById('cmdrTx');
  if(!el){
    /* A shell without the container is an OTA skew, not a crash. Latch the miss
       so this does not run a DOM query every frame for the rest of the match. */
    CMDRTX.missing=true; return false;
  }
  CMDRTX.el=el;
  CMDRTX.wrap=document.getElementById('minimapWrap');
  CMDRTX.video=document.getElementById('cmdrTxVideo');
  CMDRTX.img=document.getElementById('cmdrTxImg');
  CMDRTX.initial=document.getElementById('cmdrTxInitial');
  CMDRTX.who=document.getElementById('cmdrTxWho');
  CMDRTX.rank=document.getElementById('cmdrTxRank');
  CMDRTX.tag=document.getElementById('cmdrTxTag');
  CMDRTX.line=document.getElementById('cmdrTxLine');
  if(!CMDRTX.wrap||!CMDRTX.video||!CMDRTX.img||!CMDRTX.who||!CMDRTX.rank||!CMDRTX.tag||!CMDRTX.line){ CMDRTX.missing=true; return false; }
  /* The portrait chain is bound ONCE on the single reused <img>: commander
     portrait, then the faction portrait the cue supplies, then the initial
     chip. A per-cue handler on a reused node stacks listeners; a per-cue node
     grows the DOM. This does neither. */
  CMDRTX.img.addEventListener('error',()=>{
    const stage=CMDRTX.el.dataset.portrait||'primary';
    const fb=CMDRTX.cue&&CMDRTX.cue.portrait&&CMDRTX.cue.portrait.fallback;
    CMDRTX.portraitFallbacks++;
    if(stage==='primary'&&fb&&CMDRTX.img.getAttribute('src')!==fb){
      CMDRTX.el.dataset.portrait='fallback'; CMDRTX.img.src=fb; return;
    }
    CMDRTX.el.dataset.portrait='initial';
  });
  CMDRTX.ready=true;
  return true;
}
function cmdrTxHoldMs(text,cue){
  const authored=cue&&Number(cue.durationMs);
  if(Number.isFinite(authored)) return Math.max(1000,Math.min(12000,authored));
  const n=String(text||'').length;
  return Math.max(CMDRTX_HOLD_MIN,Math.min(CMDRTX_HOLD_MAX,CMDRTX_HOLD_BASE+n*CMDRTX_HOLD_PER_CHAR));
}
/* This is intentionally not a placement search. CSS anchors the receiver to
   the minimap; this check only clears pre-migration inline dimensions and
   reports whether the receiver remains inside that authored surface. */
function cmdrTxSolve(){
  if(!cmdrTxEls()) return null;
  /* CSS owns the inset. Clearing legacy inline placement is important for an
     OTA shell that previously solved the receiver as a floating rail. */
  CMDRTX.el.style.left='';
  CMDRTX.el.style.top='';
  CMDRTX.el.style.width='';
  const own=CMDRTX.el.getBoundingClientRect();
  const wrap=CMDRTX.wrap.getBoundingClientRect();
  const box={l:own.left,t:own.top,w:own.width,h:own.height};
  const overlap=Math.max(0,wrap.left-own.left)+Math.max(0,own.right-wrap.right)
    +Math.max(0,wrap.top-own.top)+Math.max(0,own.bottom-wrap.bottom);
  CMDRTX.placement=overlap?'minimap!':'minimap';
  CMDRTX.solved++;
  return {placement:CMDRTX.placement,overlap,box};
}
function cmdrTxShow(cue){
  if(!cmdrTxEls()||!cue) return false;
  const sub=cue.subtitle||{};
  const por=cue.portrait||{};
  const name=String(sub.speaker||sub.shortName||'COMMANDER');
  const rank=sub.rank?String(sub.rank):'';
  const call=sub.callsign?String(sub.callsign):'';
  /* Three separate fields, deliberately. cue.subtitle.speaker is the authored
     roster name and ALREADY carries a rank form — sometimes abbreviated, as in
     "Cmdr. Sera Vale" — so prefixing the canonical rank rendered "Captain
     Captain Elara Kai". The name stands alone; the canonical rank and the
     callsign share the chip beside it; the tag says what kind of report this
     is. All three are text nodes: cue strings are authored copy, but
     textContent means they can never become markup. */
  CMDRTX.who.textContent=name;
  CMDRTX.rank.textContent=rank?(call?rank.toUpperCase()+' · '+call:rank.toUpperCase()):call;
  /* The chip is the CATEGORY, not cue.subtitle.tag. Upstream builds that tag as
     "<FACTION NAME> // <CATEGORY>", which is 36 characters for Nova — on the
     915x412 rail, solved to 251px, it clipped at "TERRAN FRONTLINE COMMA" and
     took the category, the one part this chip exists to show, off the screen
     with it. The faction is already carried by the portrait and the speaker
     name; the category is not carried anywhere else. */
  CMDRTX.tag.textContent=String(cue.category||sub.tag||cue.key||'TRANSMISSION').toUpperCase();
  CMDRTX.line.textContent=String(sub.text||'');
  const initial=(sub.shortName||name).trim().charAt(0).toUpperCase()||'C';
  CMDRTX.initial.textContent=initial;
  const src=por.src||por.fallback||'';
  const animationSrc=String(cue.animationSrc||(cue.animation&&cue.animation.src)||por.animationSrc||'');
  if(animationSrc){
    if(CMDRTX.video.getAttribute('src')!==animationSrc) CMDRTX.video.setAttribute('src',animationSrc);
    CMDRTX.el.dataset.animation='video';
    try{ CMDRTX.video.currentTime=0; CMDRTX.video.play().catch(()=>{}); }catch(e){}
  } else {
    CMDRTX.el.dataset.animation='portrait';
    CMDRTX.video.removeAttribute('src');
    try{ CMDRTX.video.load(); }catch(e){}
  }
  if(src){
    CMDRTX.el.dataset.portrait='primary';
    if(CMDRTX.img.getAttribute('src')!==src) CMDRTX.img.setAttribute('src',src);
  } else {
    CMDRTX.el.dataset.portrait='initial';
  }
  CMDRTX.cue=cue;
  CMDRTX.lastKey=String(cue.speakerId||cue.commanderId||'')+'|'+String(cue.key||'')+'#'+String(cue.seq);
  /* enter BEFORE solving: the box has to be laid out at its real height before
     its position can be chosen, and [data-state="idle"] is display:none. */
  CMDRTX.el.dataset.state='enter';
  CMDRTX.wrap.dataset.transmission='enter';
  cmdrTxSolve();
  CMDRTX.shown++;
  return true;
}
function cmdrTxReset(){
  if(!cmdrTxEls()) return;
  CMDRTX.state='idle'; CMDRTX.until=0; CMDRTX.cue=null; CMDRTX.solveAt=0;
  CMDRTX.el.dataset.state='idle';
  if(CMDRTX.wrap) delete CMDRTX.wrap.dataset.transmission;
  /* The last tactical map frame was intentionally frozen beneath the receiver.
     Force an immediate entity/fog refresh as soon as it returns. */
  mmNextPaint=0;mmFogNext=0;
  if(CMDRTX.video){
    try{ CMDRTX.video.pause(); }catch(e){}
    CMDRTX.video.removeAttribute('src');
    try{ CMDRTX.video.load(); }catch(e){}
  }
}
/* Subscribe ONCE, for the life of the page. commanderDialogueOn() is idempotent
   per function reference, but the guard also stops a re-entrant HUD init from
   ever attaching a second copy of the handler. */
function cmdrTxBind(){
  if(CMDRTX.bound) return true;
  CMDRTX.bound=true;
  if(typeof commanderDialogueOn==='function') commanderDialogueOn(cue=>{
    /* The rail only ever drains while idle, so a cue arriving here always has
       somewhere to go. Guarded anyway: another consumer could pump the drain,
       and dropping the newer cue is the correct outcome — replacing a line
       mid-read would be the rail second-guessing upstream priority. */
    if(CMDRTX.state!=='idle') return;
    cmdrTxShow(cue);
    CMDRTX.state='enter';
    CMDRTX.until=cmdrTxNow()+CMDRTX_ENTER_MS;
  });
  /* Onboarding and future KEEL systems use one cancelable presenter event.
     Mark it handled only when the battlefield receiver truly accepted it; if
     a commander line is already active, onboarding retains its existing KEEL
     bubble/toast fallback instead of silently losing guidance. */
  window.addEventListener('massfront:keel-hint',ev=>{
    const d=ev&&ev.detail;
    if(!d||d.surface!=='battle-minimap'||CMDRTX.state!=='idle'||!cmdrTxInMatch()) return;
    /* This event is KEEL's UGA contract, not a generic commander skin. Even a
       stale or malformed caller cannot recast her as Nova (or any faction). */
    const ugaMedia=d.affiliation==='uga'&&d.profileId==='uga-keel-expedition-guide';
    const cue={speakerId:'keel',profileId:'uga-keel-expedition-guide',key:d.hintId||d.context||'keel-hint',seq:d.issuedAt||Date.now(),
      category:'UGA GUIDANCE',durationMs:d.durationMs,animationSrc:ugaMedia?(d.animationSrc||''):'',
      subtitle:{speaker:'KEEL',shortName:'KEEL',rank:'UGA SHIP LIAISON',text:d.text||''},
      /* KEEL owns an original neutral-UGA portrait even when an older hint
         caller supplies no media. Callers may still replace it with an
         authored animation/portrait while the UGA identity gate remains. */
      portrait:{src:ugaMedia?(d.portraitSrc||'assets/textures/ui/mf-keel-uga-portrait-v1.webp'):'',fallback:ugaMedia?(d.fallbackPortraitSrc||''):''}};
    if(!cmdrTxShow(cue)) return;
    CMDRTX.state='enter'; CMDRTX.until=cmdrTxNow()+CMDRTX_ENTER_MS;
    d.handled=true; d.presenter='battle-minimap';
    if(ev.cancelable) ev.preventDefault();
  });
  return true;
}
function cmdrTxNow(){
  return (typeof performance!=='undefined'&&performance&&performance.now)?performance.now():0;
}
/* Is the battlefield actually on screen? A cue must not be presented over the
   menu, over a results screen or while the match is not live. CSS already hides
   the rail under body.mfMenuOpen; this stops the STATE MACHINE too, so a cue
   cannot burn its hold time invisibly behind a front screen. */
function cmdrTxInMatch(){
  if(typeof matchLive!=='undefined'&&!matchLive) return false;
  if(typeof gameEnded!=='undefined'&&gameEnded) return false;
  const b=document.body;
  if(b&&b.classList&&(b.classList.contains('mfMenuOpen')||b.classList.contains('menuMode'))) return false;
  return true;
}
/* Driven from updateHUD(). Cheap on the common path: while idle and with an
   empty upstream queue this is two comparisons and one function call. */
function cmdrTxTick(){
  if(!cmdrTxEls()) return;
  cmdrTxBind();
  const now=cmdrTxNow();
  if(!cmdrTxInMatch()){
    if(CMDRTX.state!=='idle') cmdrTxReset();
    return;
  }
  if(CMDRTX.state==='idle'){
    /* PULL, do not push. Draining only from idle is what makes "one cue at a
       time" a property of the system rather than a rule the rail enforces by
       throwing cues away. */
    if(typeof commanderDialogueDrain==='function'){
      /* Gameplay producers use the fixed-step match clock so replays and
         different refresh rates retain identical cue age/order. UI animation
         still uses performance.now above; only the dialogue queue uses sim
         time, preventing a long-lived browser tab from marking a new-match cue
         stale the instant it is raised. */
      const cueNow=typeof stats!=='undefined'&&stats&&Number.isFinite(stats.t)
        ?Math.max(0,stats.t*1000):now;
      try{ commanderDialogueDrain(cueNow); }catch(e){}
    }
    return;
  }
  if(now>=CMDRTX.until){
    if(CMDRTX.state==='enter'){
      CMDRTX.state='hold'; CMDRTX.el.dataset.state='hold';
      if(CMDRTX.wrap) CMDRTX.wrap.dataset.transmission='hold';
      CMDRTX.until=now+cmdrTxHoldMs(CMDRTX.line?CMDRTX.line.textContent:'',CMDRTX.cue);
    } else if(CMDRTX.state==='hold'){
      CMDRTX.state='exit'; CMDRTX.el.dataset.state='exit';
      if(CMDRTX.wrap) CMDRTX.wrap.dataset.transmission='exit';
      CMDRTX.until=now+CMDRTX_EXIT_MS;
    } else {
      cmdrTxReset();
      return;
    }
  }
  if(CMDRTX.state!=='exit'&&now>=CMDRTX.solveAt){
    CMDRTX.solveAt=now+CMDRTX_SOLVE_MS;
    cmdrTxSolve();
  }
}
/* Read-only introspection for tools/probe-commander-hud.mjs and for a debug
   overlay. Never mutates; safe to call at any time. */
function cmdrTxDebug(){
  const el=CMDRTX.el;
  const r=el?el.getBoundingClientRect():null;
  return {
    ready:CMDRTX.ready,missing:CMDRTX.missing,bound:CMDRTX.bound,
    state:CMDRTX.state,placement:CMDRTX.placement,
    shown:CMDRTX.shown,solved:CMDRTX.solved,portraitFallbacks:CMDRTX.portraitFallbacks,
    lastKey:CMDRTX.lastKey,
    portraitStage:el?(el.dataset.portrait||''):'',
    text:CMDRTX.line?CMDRTX.line.textContent:'',
    who:CMDRTX.who?CMDRTX.who.textContent:'',
    rank:CMDRTX.rank?CMDRTX.rank.textContent:'',
    tag:CMDRTX.tag?CMDRTX.tag.textContent:'',
    audio:CMDRTX.cue?CMDRTX.cue.audio:null,
    receiver:CMDRTX.wrap&&CMDRTX.wrap.dataset.transmission||'',
    animation:el?(el.dataset.animation||''):'',
    rect:r?{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}:null,
    overflow:CMDRTX.line?{scroll:CMDRTX.line.scrollHeight,client:CMDRTX.line.clientHeight}:null
  };
}
/* A new match starts with an empty rail: a line left over from the last one is
   worse than silence. Exposed rather than wired — src/main.js owns resetWorld()
   and this lane does not touch it — and called defensively from cmdrTxTick()
   through cmdrTxInMatch() in the meantime. */
function cmdrTxMatchReset(){
  cmdrTxReset();
  CMDRTX.shown=0; CMDRTX.solved=0; CMDRTX.portraitFallbacks=0; CMDRTX.lastKey='';
}
/* ---------------------------------------------------------------------------
   INTEGRATION POINTS still open after this lane:

     src/main.js resetWorld()          -> cmdrTxMatchReset()
       Not wired here: main.js is out of this lane. Until it is, the rail clears
       itself the first tick after matchLive/gameEnded flips, which covers every
       observed transition but leaves one frame of the old line on a same-frame
       restart.

     src/game/sim.js, src/game/ai.js, src/develop.js, src/endgame.js
       -> commanderCue(...) at the sites named in src/game/commander.js.
       Nothing raises a cue in normal play yet, so the rail is correct and inert
       on a shipped build; tools/probe-commander-hud.mjs raises real cues
       through the public API to exercise it.
   -------------------------------------------------------------------------- */
