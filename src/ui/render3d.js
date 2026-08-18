/* ============================================================================
   3D RENDER PASS
   ----------------------------------------------------------------------------
   Draw order matters here in a way it never did for sprites:
     1. opaque geometry, depth-write ON  — terrain, models, ruins, scenery
     2. water, depth-test ON, blended    — so shorelines and hulls occlude it
     3. additive effects, depth-write OFF — fire, energy, beams, light shafts
   Depth sorting is the GPU's job now, so nothing needs painter's ordering and
   a tank genuinely disappears behind a hill instead of being drawn over it.
   ============================================================================ */
let sunDir=[0.42,0.78,0.30];
const _tmpV=[0,0,0];
/* Read-only renderer telemetry for device QA. This makes an "effects are gone"
   report diagnosable without a debug console overlay or mutating a live match. */
const _burnVec=new Float32Array(64), _burnKind=new Float32Array(16);
const MF_COMBAT_VFX_TELEMETRY={projectiles:0,beams:0,particles:0,additive:0,maxProjectiles:0,maxBeams:0,maxParticles:0,framesWithCombat:0};
if(typeof window!=='undefined')window.MFCombatVfxTelemetry=MF_COMBAT_VFX_TELEMETRY;
const MF_COMBAT_VFX_DIAGNOSTIC=typeof location!=='undefined'&&location.search.indexOf('beamshow=1')>=0;

function sunFor(nA){
  /* The sun swings across the sky with the day cycle and reddens at the
     horizon, which is where all the "cinematic" feel comes from now — it's
     real directional light, not a colour wash over a flat image. */
  const ang=Math.PI*0.12 + (1-nA)*Math.PI*0.62;
  const az=0.6+nA*0.9;
  const y=Math.max(0.06,Math.sin(ang));
  const h=Math.cos(ang);
  const l=Math.hypot(Math.cos(az)*h,y,Math.sin(az)*h)||1;
  sunDir[0]=Math.cos(az)*h/l; sunDir[1]=y/l; sunDir[2]=Math.sin(az)*h/l;
  const low=1-Math.min(1,y*2.2);                 // 1 at the horizon
  const day=1-nA;
  return {
    dir:sunDir,
    // key light: warm and strong at noon, deep amber at the horizon
    /* Exposure budget: a fully sunlit face gets sky + key, and that sum times
       a typical albedo has to land just under 1.0 or the whole world clips to
       white. sky ~0.40 + key ~1.06 against a 0.55 albedo is the sweet spot. */
    col:[ (0.44+day*0.62)*(1+low*0.30), (0.42+day*0.58)*(1-low*0.10), (0.42+day*0.54)*(1-low*0.34) ],
    /* Midnight still needs to be command-readable on an outdoor phone. The
       previous sky floor was physically moody but crushed terrain and unit
       silhouettes into the same near-black value. This is cool moonlight,
       not a second sun: direct light remains low while the ambient floor
       retains form and lets tactical lights add useful contrast. */
    sky:[ 0.34+day*0.11, 0.39+day*0.12, 0.51+day*0.16 ],
    gnd:[ 0.20+day*0.08, 0.21+day*0.08, 0.24+day*0.07 ],
    /* Horizon weather, not a second key light. Noon used to sit brighter
       than sky ambient, so even a thin veil bleached grass toward milk.
       Stay under the sky so distance haze recedes without crushing
       daytime midtones. */
    fog:[ 0.24+day*0.20+low*0.12, 0.29+day*0.21, 0.39+day*0.22 ],
  };
}

/* ============================================================================
   GROUND SHADOWS
   ----------------------------------------------------------------------------
   Everything in the reference art casts one, and nothing here did. That single
   omission is what made structures look pasted on: with no shadow there is no
   contact point, so the eye reads a building as a decal lying on the grass
   rather than a mass standing on it.

   These are decals, not a shadow map. MEDIUM/LOW stay on this cheap path.
   HIGH/CINEMATIC add a sun-depth atlas beside it (mesh.js csmBegin) and
   skip the stretched CAST so the two do not double-darken. SSAO stays
   contact creasing; this pass is the weld-to-grass near blob.

   The decal is stretched along the light and offset by the object's height, so
   shadows lengthen and swing round as the sun moves across the day cycle.

   Blend is MULTIPLY: the mesh is white at its rim and dark at its core, so the
   rim leaves the ground exactly as it was and only the core darkens. That is
   what lets overlapping shadows merge into one soft pool instead of stacking
   into hard black rectangles.

   HIGH/CINEMATIC with shadowQ>=2 replace the stretched CAST blob with a
   real sun-depth atlas (csmBegin / csmApply). Contact near-blobs stay —
   they weld a footprint to grass; CSM owns the directional mass. MEDIUM
   (shadowQ 1) and LOW (0) never enter that pass.
   ============================================================================ */
function drawShadows(S){
  if(!FX.shadow) return;
  const sq=(typeof GFX!=='undefined'&&GFX.shadowQ!=null)?GFX.shadowQ:2;
  /* shadowQ 0 is a real off — not a hidden stride. The Advanced Shadows
     row would otherwise look like it worked while every building still
     painted a blob. */
  if(sq<=0) return;
  const csmOn=typeof csmActive==='function'&&csmActive();
  const contact=!(typeof GFX!=='undefined'&&GFX.contact===false);
  const cb=camBounds();
  const vis=(x,y,pad)=>x>=cb.x0-(pad||0)&&x<=cb.x1+(pad||0)&&y>=cb.y0-(pad||0)&&y<=cb.y1+(pad||0);
  const gh=(x,y)=>terrainH(x,y);
  const sd=S.dir;
  const el=Math.max(0.22,sd[1]);
  const kx=-sd[0]/el, kz=-sd[2]/el;          // ground offset per unit of height
  const q=typeof mfGfxKey==='function'?mfGfxKey():'high';
  const cine=q==='cinematic'&&sq>=2;
  const stretch=Math.min(2.4,Math.hypot(kx,kz))*(sq===1?0.78:cine?1.12:1);
  const yaw=Math.atan2(kz,kx);
  /* Instance alpha stays at full: the MULTIPLY blend takes the fragment colour
     directly, so any alpha below 1 would darken the white rim as well and put
     a visible disc edge around every object. Shadow strength lives in the mesh
     vertex colours instead. */
  const A=255;
  const putCast=(x,y,rad,hgt,wide)=>{
    const cx=x+kx*hgt*0.55, cy=y+kz*hgt*0.55;
    if(!vis(cx,cy,rad+hgt)) return;
    FX.shadow.add(cx,cy,gh(cx,cy)+2.4, rad*0.55+hgt*stretch*0.12, yaw, 255,255,255,A, (wide||rad)*0.58);
  };
  /* Near cascade: tight footprint under the object. HIGH uses this on
     buildings; CINEMATIC on nearby everything. When the sun-depth atlas is
     live the stretched CAST is skipped so the two do not double-darken. */
  const putNear=(x,y,rad,hgt,wide)=>{
    const cx=x+kx*hgt*0.18, cy=y+kz*hgt*0.18;
    if(!vis(cx,cy,rad)) return;
    FX.shadow.add(cx,cy,gh(cx,cy)+1.8, rad*0.42, yaw, 255,255,255,A, (wide||rad)*0.46);
  };
  const put=(x,y,rad,hgt,wide,near)=>{
    if(near) putNear(x,y,rad,hgt,wide);
    if(!csmOn) putCast(x,y,rad,hgt,wide);
  };
  for(const B of blds){
    if(!B.alive||!vis(B.x,B.y,B.r*2)) continue;
    if(!fogEntityVisible(B.team,B.x,B.y)) continue;
    const f=(typeof bldFoot==='function')?bldFoot(B):[B.r*1.6,B.r*1.6];
    const sw=(Math.round((B.rot||0)/(Math.PI/2))&1)===1;
    const fw=(sw?f[1]:f[0])*0.56, fh=(sw?f[0]:f[1])*0.56;
    put(B.x,B.y,Math.max(fw,fh),B.r*1.8,Math.min(fw,fh)*1.05,sq>=2);
  }
  /* Generated civilian/military structures are relics, not `blds`, so the
     original shadow pass skipped the entire city. V2 materials could be
     perfectly lit and still look pasted on because no mass reached the ground.
     Use the planned footprint and an authored height estimate; the terrain
     apron carries the small contact AO while this supplies the directional
     cast shadow. */
  for(const R of relics){
    if(!R.alive||!vis(R.x,R.y,Math.max(R.w,R.h)+110)||!fogPointVisible(R.x,R.y))continue;
    const hgt=R.kind===0?118:R.kind===2?58:R.kind===3?42:R.kind===4?66:R.kind===5?290:52;
    put(R.x,R.y,Math.max(R.w,R.h)*.57,hgt,Math.min(R.w,R.h)*.55,sq>=2);
  }
  /* At strategic range a regiment's individual contact shadows occupy fewer
     than two pixels and merge into one tone. Sample ordinary units there but
     retain selected units and commanders; off-camera units were already fully
     culled above, so this is the second (distance/material) LOD band. */
  /* MEDIUM (shadowQ=1) used stride 2–4, near HIGH at tactical zoom. 3/6
     still paints commanders and selected units every frame.
     contact=false keeps building/relic blobs (the mass-on-grass read) and
     drops unit/scenery — that is the Advanced Contact Shadows row. */
  const shadowStride=cine?1:(sq===1?Math.max(3,orthoSpan>1800?6:3):(orthoSpan>2550?4:orthoSpan>2050?2:1));
  if(contact){
    for(let i=0;i<unitHigh;i++){
      if(!ualive[i]) continue;
      if(!fogEntityVisible(uteam[i],ux[i],uy[i])) continue;
      const T=TYPES[utype[i]];
      const important=usel[i]||i===heroIdx||T.cat==='hero'||(typeof isEnemyCommander==='function'&&isEnemyCommander(i));
      if(shadowStride>1&&!important&&(i%shadowStride))continue;
      const near=cine&&dist2(ux[i],uy[i],cam.x,cam.y)<520*520;
      put(ux[i],uy[i],T.size*0.70,T.air?T.size*2.6:T.size*0.8,undefined,near);
    }
    /* Scenery casts too. A boulder with no shadow beside a tank with one reads
       as a decal painted on the grass. MEDIUM skips crystals (tiny, many). */
    for(const o of rocks)    if(vis(o.x,o.y,60)&&fogPointVisible(o.x,o.y)) put(o.x,o.y,o.s*0.62,o.s*0.75);
    for(const o of trees)    if(vis(o.x,o.y,60)&&fogPointVisible(o.x,o.y)) put(o.x,o.y,o.s*0.52,o.s*1.15);
    if(typeof cover!=='undefined') for(const o of cover)
      if(vis(o.x,o.y,40)&&fogPointVisible(o.x,o.y)) put(o.x,o.y,o.s*0.46,o.s*0.55);
    if(sq>=2) for(const o of crystals){
      const D=deposits[o.dep],tier=depositTier(D);if(!D||o.band>tier||!vis(o.x,o.y,60))continue;
      if(!fogPointVisible(o.x,o.y))continue;
      put(o.x,o.y,o.s*(o.core?.15:.11),o.s*(o.core?.34:.24));
    }
    if(typeof carrier!=='undefined'&&carrier.active&&carrierEffectiveAlt()<80)
      put(carrier.x,carrier.y,22,Math.max(2,carrierEffectiveAlt()*0.22));
  }
  if(!FX.shadow.n) return;
  gl.useProgram(progG);
  gl.uniformMatrix4fv(UG.uVP,false,matVP);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ZERO,gl.SRC_COLOR);        // multiply: white is a no-op
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  /* Keep DEPTH_TEST. Turning it off laid the whole stepped shadow disc on
     the pavement as concentric dark rings (live recapture). Offset + a 2.2
     raise keeps contact without z-fighting the kerb into grain. */
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(-12,-48);
  FX.shadow.flush(gl);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.enable(gl.CULL_FACE);
  gl.depthMask(true);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.BLEND);
}
function csmDrawBuildingCasters(){
  if(typeof BLD_MESH==='undefined') return;
  const sets=[BLD_MESH,...Object.values(BLD_FACTION_MESH||{})];
  for(const set of sets){
    if(!set) continue;
    for(const k in set){
      const M=set[k];
      if(M.variants) for(const V of M.variants){ csmDrawMesh(V.base); if(V.tur) csmDrawMesh(V.tur); }
      else { csmDrawMesh(M.base); if(M.tur) csmDrawMesh(M.tur); }
    }
  }
}
function csmDrawSceneryCasters(){
  if(typeof FX==='undefined') return;
  for(const k of ['rock','tree','crystal','cityT','cityD','cityH','cityK','cityC','sky1','sky2','skyA','skyS','wreck'])
    if(FX[k]) csmDrawMesh(FX[k]);
  if(typeof worldSites!=='undefined'){
    for(const S of worldSites) if(S.fill) csmDrawMesh(S.fill);
    if(typeof WORLD_KIT!=='undefined') for(const k in WORLD_KIT) if(WORLD_KIT[k].mesh) csmDrawMesh(WORLD_KIT[k].mesh);
  }
}
function csmDrawUnitCasters(){
  if(typeof UNIT_MESH!=='undefined') for(const M of UNIT_MESH){ if(!M) continue; csmDrawMesh(M.hull); if(M.tur) csmDrawMesh(M.tur); }
  if(typeof FAC_MESH!=='undefined') for(const k in FAC_MESH) for(const ty in FAC_MESH[k]){
    const M=FAC_MESH[k][ty]; csmDrawMesh(M.hull); if(M.tur) csmDrawMesh(M.tur);
  }
  if(typeof COMMANDER_KIT_MESH!=='undefined') for(const k in COMMANDER_KIT_MESH){
    const M=COMMANDER_KIT_MESH[k]; if(!M) continue; csmDrawMesh(M.hull); if(M.tur) csmDrawMesh(M.tur);
  }
  if(typeof FAC_DOCTRINE_MESH!=='undefined') for(const k in FAC_DOCTRINE_MESH){
    csmDrawMesh(FAC_DOCTRINE_MESH[k].ground); csmDrawMesh(FAC_DOCTRINE_MESH[k].air);
  }
}
function csmDrawModuleCasters(){
  if(typeof MOD_ATTACH_MESH==='undefined') return;
  for(const id in MOD_ATTACH_MESH) for(const M of MOD_ATTACH_MESH[id]) csmDrawMesh(M);
}
/* HIGH skins commanders, size>=21, and anything inside 720 of the look-at.
   CINEMATIC skins every boned mesh in csmBindSkin — the flag is redundant. */
function csmMarkUnitSkin(M,T,heroUnit,X,Y){
  if(!M||!M.hull||!M.hull.bones) return;
  const q=typeof mfGfxKey==='function'?mfGfxKey():'high';
  if(q!=='high'&&q!=='cinematic') return;
  if(q==='cinematic'||heroUnit||T.cat==='hero'||T.size>=21||dist2(X,Y,cam.x,cam.y)<720*720){
    M.hull.csmSkin=1;
    if(M.tur&&M.tur.bones) M.tur.csmSkin=1;
  }
}
/* Light values in sunFor() are display-space colours picked by eye. The shading
   maths is linear, so they are converted once here rather than in the shader. */
const _lin=c=>[Math.pow(c[0],2.2),Math.pow(c[1],2.2),Math.pow(c[2],2.2)];
/* --------------------------------------------------------------------------
   CINEMATIC LOCAL LIGHTS

   The world renderer deliberately remains forward-rendered. A phone battle can
   have hundreds of lamps, engines and sparks, but only the eight strongest
   camera-relevant sources are promoted into the material shader. Everything
   else keeps its emissive billboard, which preserves the feeling of a living
   base without turning a large fight into a G-buffer bandwidth problem.
   -------------------------------------------------------------------------- */
const _sceneLightPR=new Float32Array(8*4),_sceneLightCI=new Float32Array(8*4);
let _sceneLightN=0;
function sceneLightCap(){
  const n=(typeof GFX!=='undefined'&&GFX.lights!=null)?(GFX.lights|0):8;
  return Math.max(0,Math.min(8,n));
}
function sceneLightPush(x,y,z,range,cr,cg,cb,intensity,score){
  const cap=sceneLightCap();
  if(cap<=0) return;
  let at=_sceneLightN;
  if(at<cap) _sceneLightN++;
  else {
    let worst=0,ws=_sceneLightCI[3];
    for(let i=1;i<cap;i++) if(_sceneLightCI[i*4+3]<ws){ws=_sceneLightCI[i*4+3];worst=i;}
    /* The alpha lane temporarily stores ranking until the list is complete. */
    if(score<=ws) return;
    at=worst;
  }
  const o=at*4;
  _sceneLightPR[o]=x; _sceneLightPR[o+1]=y; _sceneLightPR[o+2]=z; _sceneLightPR[o+3]=range;
  _sceneLightCI[o]=cr; _sceneLightCI[o+1]=cg; _sceneLightCI[o+2]=cb; _sceneLightCI[o+3]=score;
  /* Store physical intensity in an otherwise unused negative range slot? No:
     keep it in a compact scratch sidecar so the upload stays straightforward. */
  _sceneLightI[at]=intensity;
}
const _sceneLightI=new Float32Array(8);
function sceneLightColor(fac){
  if(fac==='horde') return [0.44,0.95,0.25];
  if(fac==='legion') return [1.0,0.32,0.13];
  if(fac==='syndicate') return [0.46,1.0,0.34];
  return [0.20,0.72,1.0];
}
function selectCinematicLights(nA){
  _sceneLightN=0;
  const night=0.35+nA*0.85;
  for(const L of blds){
    if(!L.alive||!fogEntityVisible(L.team,L.x,L.y)) continue;
    const critical=L.hp<L.hpm*.38;
    /* Power structures are NOT cinematic hero lights: a promoted pgen painted
       a 140-unit white pool that bloomed like a detonation. Reactors keep the
       small glow sprite; only true landmarks spend a scene light. */
    const hero=L.type==='hq'||L.type==='arc'||L.type==='techlab'||L.type==='nova';
    if(!hero&&!critical&&!(L.hitT>0)) continue;
    const dx=L.x-cam.x,dy=L.y-cam.y,d2=dx*dx+dy*dy;
    if(d2>orthoSpan*orthoSpan*.62) continue;
    const c=_lin(sceneLightColor(bldFactionKey(L)));
    const isHQ=L.type==='hq',damage=critical||L.hitT>0;
    const range=isHQ?112:(damage?82:70);
    const boost=damage?1.65:(isHQ?1.35:1);
    /* Favour key structures over a nearer minor lamp, but still require them
       to be within the current strategic view. */
    const score=boost*range*range/(d2+range*range);
    sceneLightPush(L.x,L.y,terrainH(L.x,L.y)+(isHQ?34:22),range,c[0],c[1],c[2],
                   Math.min(0.88,(0.46+night*.38)*boost),score);
  }
  /* Powered civic windows and industrial warning lamps use the same eight
     camera-relevant-light budget as bases and vehicles. The emissive facade is
     still visible when a source is not promoted; only the strongest nearby
     districts spend fragment lighting work. */
  for(const R of relics){
    if(!R.alive||!fogPointVisible(R.x,R.y)||(R.kind!==4&&R.kind!==2&&R.kind!==3&&R.kind!==5))continue;
    const dx=R.x-cam.x,dy=R.y-cam.y,d2=dx*dx+dy*dy;
    if(d2>orthoSpan*orthoSpan*.54)continue;
    const civic=R.kind===4||R.kind===5,c=_lin(civic?[.15,.68,1.0]:[1.0,.24,.035]);
    const range=R.kind===5?128:civic?78:58,intensity=(R.kind===5?.30:civic?.23:.16)+night*(R.kind===5?.55:civic?.42:.31);
    sceneLightPush(R.x,R.y,terrainH(R.x,R.y)+(R.kind===5?96:civic?24:18),range,c[0],c[1],c[2],intensity,
                   (civic?1.05:.72)*range*range/(d2+range*range));
  }
  /* The commander and a few nearby vehicles participate in actual material
     lighting. Billboard headlamps illuminate the ground visually; these local
     sources make adjacent hulls and building faces react to them too. */
  let promoted=0;
  for(let i=0;i<unitHigh&&promoted<18;i++){
    if(!ualive[i]||uteam[i]!==0)continue;
    const T=TYPES[utype[i]];if(T.air||unitIsBrood(i))continue;
    const isCommander=i===heroIdx,chosen=!!usel[i];
    if(!isCommander&&!chosen&&(i%19)!==0)continue;
    const dx=ux[i]-cam.x,dy=uy[i]-cam.y,d2=dx*dx+dy*dy;
    if(d2>orthoSpan*orthoSpan*.48)continue;
    const c=_lin(sceneLightColor(typeof playerFactionKey==='function'?playerFactionKey():'nova'));
    const range=isCommander?108:58,boost=isCommander?1.42:(chosen?1.05:.76);
    /* THROWN AHEAD, not centred on the hull. A light sitting inside the unit
       brightens the unit and leaves the direction it faces dark — the exact
       opposite of a flashlight. Placing the source low and forward along the
       facing makes terrain, rocks and building walls IN FRONT catch the beam,
       so where the unit looks is where the player can see. */
    const fa=uang[i]-Math.PI/2, ahead=isCommander?T.size*3.4:T.size*1.9;
    const lx=ux[i]+Math.cos(fa)*ahead, ly=uy[i]+Math.sin(fa)*ahead;
    sceneLightPush(lx,ly,terrainH(lx,ly)+7,range,c[0],c[1],c[2],(.26+night*.42)*boost,boost*range*range/(d2+range*range));
    /* The commander also keeps a soft source on the hull itself, so the
       machine reads lit rather than emitting from empty ground. */
    if(isCommander)
      sceneLightPush(ux[i],uy[i],terrainH(ux[i],uy[i])+T.size*.52,66,c[0],c[1],c[2],(.16+night*.22)*boost,boost*.6);
    promoted++;
  }
  if(typeof singularities!=='undefined') for(const Sg of singularities){
    const dxs=Sg.x-cam.x,dys=Sg.y-cam.y;
    sceneLightPush(Sg.x,Sg.y,terrainH(Sg.x,Sg.y)+22,150,_lin([172,120,255])[0],_lin([172,120,255])[1],_lin([172,120,255])[2],
      0.9+0.5*Math.sin((typeof stats!=='undefined'?stats.t:0)*9),150*150/(dxs*dxs+dys*dys+150*150)+3);
  }
  if(carrier.active&&carrier.phase<2){
    const c=_lin(sceneLightColor(dropFactionKey(carrier.fac)));
    const alt=Math.max(18,carrierEffectiveAlt()*.65);
    const dx=carrier.x-cam.x,dy=carrier.y-cam.y,d2=dx*dx+dy*dy;
    sceneLightPush(carrier.x,carrier.y,terrainH(carrier.x,carrier.y)+alt,28,c[0],c[1],c[2],0.08,28*28/(d2+28*28)+1);
  }
  /* The shader expects intensity in the fourth colour lane. Selection used it
     as a ranking key, so restore the small sidecar just before upload. */
  for(let i=0;i<_sceneLightN;i++) _sceneLightCI[i*4+3]=_sceneLightI[i];
}
function visualDebugMode(){
  const v=typeof window!=='undefined' ? Number(window.MFVisualDebug||0) : 0;
  return Math.max(0,Math.min(7,v|0));
}
let MF_BONES_ON=false;
function begin3D(nA){
  const S=sunFor(nA);
  gl.useProgram(prog3D);
  /* FX and custom passes share InstMesh but do not own prog3D's uniforms.
     Re-entering the model pass is the one reliable boundary where a previous
     rig or per-asset skin must be cleared. This keeps an unlit flush from
     touching a foreign uniform location and prevents stale V2 maps/bones from
     bleeding into the next ordinary unit or structure. */
  if(typeof U3!=='undefined'){
    if(MF_ASSET_ON&&U3.uAssetOn) gl.uniform1f(U3.uAssetOn,0.0);
    if(MF_BONES_ON&&U3.uBoneN!==undefined&&U3.uBoneN!==null) gl.uniform1i(U3.uBoneN,0);
  }
  MF_ASSET_ON=false;
  MF_BONES_ON=false;
  /* If the procedural material atlases were not generated (context recovery
     race, mobile memory pressure, or a startup ordering change), rebuild now
     instead of drawing every building with missing/muted PBR detail. */
  if(!matTex || !matNrmTex || !matOrmTex || !matDamageTex || !matDetailTex){
    if(typeof buildMatAtlas==='function') try{ buildMatAtlas(); }catch(e){}
  }
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,matDamageTex);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D,matNrmTex);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D,matOrmTex);
  /* Texture units 4/5/6 remain reserved for the post chain. Unit 7 is reused
     after terrain/fog and makes the live V2 micro-detail available to every
     instanced unit and building without adding draw calls. */
  gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D,matDetailTex);
  /* Unit 8 carries the live fog-of-war map into the MODEL pass so units,
     buildings and remembered scenery darken with the ground they stand on. */
  if(typeof fogTex!=='undefined'&&fogTex){ gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D,fogTex); }
  /* Units 4-6 carry the per-asset baked triplet when a draw declares one. They
     must reference a COMPLETE texture even when it is unused: WebGL2 validates
     every sampler the program references at draw time, not only the ones the
     taken branch reads, and an unbound unit drops the whole draw call -- which
     is every mesh in the game vanishing while the program still reports as
     linked. The atlas stands in; uAssetOn keeps it from ever being sampled. */
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D,matTex);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,matTex);
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D,matTex);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,matTex);
  gl.uniformMatrix4fv(U3.uVP,false,matVP);
  gl.uniform3f(U3.uEye,eyeX,eyeY,eyeZ);
  gl.uniform3f(U3.uSun,S.dir[0],S.dir[1],S.dir[2]);
  /* View direction under an orthographic projection is the same for every
     pixel in the frame, so the Blinn half-vector is a per-frame constant. */
  const vx=matV[2], vy=matV[6], vz=matV[10];
  let hx=S.dir[0]+vx, hy=S.dir[1]+vy, hz=S.dir[2]+vz;
  const hl=Math.hypot(hx,hy,hz)||1;
  gl.uniform3f(U3.uHalf,hx/hl,hy/hl,hz/hl);
  { const c=_lin(S.col); gl.uniform3f(U3.uSunC,c[0],c[1],c[2]); }
  { const c=_lin(S.sky); gl.uniform3f(U3.uAmbSky,c[0],c[1],c[2]); }
  { const c=_lin(S.gnd); gl.uniform3f(U3.uAmbGnd,c[0],c[1],c[2]); }
  { const c=_lin(S.fog); gl.uniform3f(U3.uFogC,c[0],c[1],c[2]); }
  if(U3.uHazeQ) gl.uniform1f(U3.uHazeQ, typeof mfHazeQ==='function'?mfHazeQ():1);
  gl.uniform1f(U3.uEmis,0);
  if(U3.uNight) gl.uniform1f(U3.uNight,nA);
  if(U3.uTime) gl.uniform1f(U3.uTime,(typeof performance!=='undefined'?performance.now():0)*0.001);
  gl.uniform1i(U3.uDebugMode,visualDebugMode());
  if(U3.uFowMap!=null){ gl.uniform1i(U3.uFowMap,8);
    gl.uniform1f(U3.uFowOn,(typeof fogGameplayActive==='function'&&fogGameplayActive()&&!demoMode&&typeof fogTex!=='undefined'&&fogTex)?1:0); }
  gl.uniform1i(U3.uLightCount,_sceneLightN);
  if(_sceneLightN){
    gl.uniform4fv(U3.uLightPosR,_sceneLightPR);
    gl.uniform4fv(U3.uLightColI,_sceneLightCI);
  }
  return S;
}
function setEmis(v){ gl.uniform1f(U3.uEmis,v); }

/* A battlefield limit should read as command infrastructure, not the renderer
   running out of world. The red core and EVERY grid rung sit on the safe side;
   procedural exclusion art starts beyond them in the terrain shader. It is
   flushed by the unlit additive pass, so sensor fog cannot turn it black and
   the physical-edge haze cannot erase it. */
function terrainExclusionStyle(mapKey,themeKey){
  const TH=THEMES[themeKey]||THEMES.verdant;
  const style=mapKey==='isles'?1:(themeKey==='ashland'||mapKey==='crater'?2:
    (themeKey==='arctic'||mapKey==='highland'?3:0));
  const tint=style===1?TH.wDeep:(style===2?(TH.cliff||[64,48,42]):
    (style===3?(themeKey==='arctic'?[108,128,150]:[76,88,104]):(TH.g0||[62,82,54])));
  return {style,tint};
}
let mapBoundaryDrawCount=0,mapBoundaryOutsideCount=0;
function queueBattlefieldEdgeGrid(t,vis){
  mapBoundaryDrawCount=0;mapBoundaryOutsideCount=0;
  const B=typeof battlefieldPlayBounds==='function'?battlefieldPlayBounds(0):{lo:0,hi:MAP,span:MAP};
  const d=typeof battlefieldSignedDistance==='function'?Math.abs(battlefieldSignedDistance(cam.x,cam.y,0)):
    Math.min(Math.abs(cam.x-B.lo),Math.abs(cam.x-B.hi),Math.abs(cam.y-B.lo),Math.abs(cam.y-B.hi));
  const reach=Math.max(480,orthoSpan*.42);
  if(d>=reach) return 0;
  const reveal=clamp((reach-d)/(reach*.64),0,1),span=B.hi-B.lo;
  const seg=Math.max(64,Math.round(span/28)),inner=Math.min(112,span*.07),safe=9;
  const pulse=.78+.22*Math.sin(t*3.2), coreA=(180+55*pulse)*reveal, gridA=(58+38*pulse)*reveal;
  const inside=(x,y,pad)=>typeof battlefieldContains==='function'?battlefieldContains(x,y,pad||0):
    x>=B.lo+(pad||0)&&x<=B.hi-(pad||0)&&y>=B.lo+(pad||0)&&y<=B.hi-(pad||0);
  const put=(x,y,len,ang,r,g,b,a,w,endpoints)=>{
    if(a<5||!vis(x,y,len*.55+55)) return;
    FX.line.add(x,y,terrainH(x,y)+7.5,len,ang,r,g,b,a,w);
    if(!inside(x,y,0)||(endpoints&&endpoints.some(P=>!inside(P[0],P[1],0))))mapBoundaryOutsideCount++;
    mapBoundaryDrawCount++;
  };
  const point=(a,pad)=>typeof battlefieldBoundaryPoint==='function'?battlefieldBoundaryPoint(a,pad):[
    (B.lo+B.hi)*.5+Math.cos(a)*span*.48,(B.lo+B.hi)*.5+Math.sin(a)*span*.48];
  /* Sample the authored silhouette itself.  Coastal inlets become a soft,
     rounded perimeter; scorched maps keep sharper chamfers; storm fronts bow
     asymmetrically.  No map is forced through the old four-sided stamp. */
  for(let k=0;k<seg;k++){
    const a0=k/seg*TAU,a1=(k+1)/seg*TAU;
    const A=point(a0,safe),C=point(a1,safe),dx=C[0]-A[0],dy=C[1]-A[1],len=Math.hypot(dx,dy);
    put((A[0]+C[0])*.5,(A[1]+C[1])*.5,len,Math.atan2(dy,dx),255,42,30,coreA,3.8,[A,C]);
    const D=point(a0,safe+inner*.42),E=point(a1,safe+inner*.42),ex=E[0]-D[0],ey=E[1]-D[1];
    put((D[0]+E[0])*.5,(D[1]+E[1])*.5,Math.hypot(ex,ey),Math.atan2(ey,ex),255,72,48,gridA,2.0,[D,E]);
    if((k&3)===0){
      const O=point((a0+a1)*.5,safe+2),I=point((a0+a1)*.5,safe+inner),rx=I[0]-O[0],ry=I[1]-O[1];
      put((O[0]+I[0])*.5,(O[1]+I[1])*.5,Math.hypot(rx,ry),Math.atan2(ry,rx),255,58,42,gridA*1.15,1.8,[O,I]);
    }
  }
  const nodeR=5.2+1.0*pulse;
  for(let k=0;k<8;k++){
    const P=point(k/8*TAU,safe+nodeR+1),x=P[0],y=P[1];
    if(!vis(x,y,90))continue;
    FX.ring.add(x,y,terrainH(x,y)+9,nodeR,-t*.55,255,58,38,205*reveal);
    if(!inside(x,y,nodeR*.15))mapBoundaryOutsideCount++;
    mapBoundaryDrawCount++;
  }
  return mapBoundaryDrawCount;
}

/* A beam is a camera-facing textured ribbon, not a row of glow dots. Project
   both endpoints first so the rectangle follows the beam on screen even while
   the player rotates and tilts the camera. Long paths are split into a handful
   of depth-correct spans; that keeps hills and large units able to occlude the
   effect without turning one weapon into dozens of draw calls. */
function addBeamRibbon(uv,x0,h0,y0,x1,h1,y1,width,r,g,b,a,maxPx){
  const a0=w2s(x0,y0,h0), a1=w2s(x1,y1,h1);
  const pxLen=Math.hypot(a1[0]-a0[0],a1[1]-a0[1]);
  const seg=Math.max(1,Math.min(6,Math.ceil(pxLen/(maxPx||170))));
  let ax=x0, ay=y0, ah=h0;
  for(let k=1;k<=seg;k++){
    const q=k/seg, ex=x0+(x1-x0)*q, ey=y0+(y1-y0)*q, eh=h0+(h1-h0)*q;
    const s0=w2s(ax,ay,ah), s1=w2s(ex,ey,eh);
    const sx=s1[0]-s0[0], sy=s1[1]-s0[1];
    const screenLen=Math.hypot(sx,sy);
    if(screenLen>.2){
      /* Atlas cells keep ~16% transparent padding for mip safety. Adjacent
         spans therefore need deliberate overlap; 1.28 closes that padding at
         every zoom without letting a ribbon overshoot its true endpoints by
         more than one soft glow fringe. */
      const worldLen=Math.max(width*1.2,screenLen*orthoSpan/Math.max(1,VH)*1.28);
      /* The atlas beam runs along local +Y. Screen Y points down, hence this
         less-obvious angle instead of atan2(sy,sx). */
      const rot=Math.atan2(-sx,-sy);
      bbAdd.addOrientedRect(uv,(ax+ex)*.5,(ay+ey)*.5,(ah+eh)*.5,
        width,worldLen,rot,r,g,b,a);
    }
    ax=ex; ay=ey; ah=eh;
  }
}
function addBeamPathFx(x0,h0,y0,x1,h1,y1,width,r,g,b,a){
  /* Pearl-necklace of circular energy + smoke. sprites.beam is a thin atlas
     line — the shaft has to be GLOW KNOTS or it reads as a cheap streak.
     Position-seeded, no velocity. First and last knots sit on the bore and
     the impact; jitter in the middle only. */
  const q=typeof mfVfxQ==='function'?mfVfxQ():1;
  if(q<0.35||a<14) return;
  if(typeof orthoSpan==='number'&&orthoSpan>1800) return;
  const dx=x1-x0, dy=y1-y0, dh=h1-h0;
  const len=Math.hypot(dx,dy)||1;
  if(len<10) return;
  const n=Math.max(3,Math.min(q>=0.95?16:13, Math.round(len/(q>=0.95?14:17))));
  const seed=x0*0.073+y0*0.051+x1*0.019;
  const smoke=sprites.smoke||sprites.glow;
  for(let i=0;i<=n;i++){
    const u=i/n;
    const end=i===0||i===n;
    const jx=end?0:Math.sin(seed+i*12.9898)*width*0.16;
    const jy=end?0:Math.cos(seed+i*78.233)*width*0.16;
    const x=x0+dx*u+jx, y=y0+dy*u+jy, h=h0+dh*u;
    const sz=width*(end?1.15:1.55+(Math.sin(seed*3.1+i*2.4)*0.5+0.5)*0.85);
    bbAdd.add(sprites.glow,x,y,h,sz*3.4,0,r,g,b,a*(end?0.72:0.58));
    bbAdd.add(sprites.glow,x,y,h,sz*1.55,0,r,g,b,a*(end?0.90:0.78));
    bbAdd.add(sprites.glow,x,y,h,sz*0.58,0,255,253,248,a*0.92);
    if(q>=0.55&&(i&1)&&!end)
      bbAlpha.add(smoke,x,y,h+1.6,sz*3.8,seed+i, 52+r*0.14,48+g*0.11,44+b*0.09, Math.min(95,a*0.28));
  }
}
function addBeam3D(mesh,x0,h0,y0,x1,h1,y1,rad,r,g,b,a,opt){
  const q=typeof mfVfxQ==='function'?mfVfxQ():1;
  const width=Math.max(4.80,rad*(q>=1.25?6.40:q>=0.95?5.85:q>=0.65?5.40:4.20));
  /* Glow-tube + knots. The beam atlas cell is a 1px streak — do not use it
     as the body. Do not stretch GPU points into ellipses. */
  addBeamRibbon(sprites.glow,x0,h0,y0,x1,h1,y1,
    width*(q>=0.95?5.10:4.20),r,g,b,a*(q>=0.95?.70:.58),210);
  addBeamRibbon(sprites.glow,x0,h0,y0,x1,h1,y1,
    width*1.85,r,g,b,Math.min(255,a*1.22),150);
  addBeamRibbon(sprites.glow,x0,h0,y0,x1,h1,y1,
    Math.max(2.40,width*0.88),255,253,248,Math.min(255,a*1.40),150);
  addBeamPathFx(x0,h0,y0,x1,h1,y1,width,r,g,b,a);
  /* Mid-flight tracers pass noMuzzle — a burst behind the round is the
     floating flash that made shots look disconnected from the barrel. */
  if(opt&&opt.noMuzzle) return;
  bbAdd.add(sprites.glow,x0,y0,h0,width*2.8,0,r,g,b,a*0.85);
  bbAdd.add(sprites.glow,x0,y0,h0,width*1.15,0,255,253,246,a);
}
/* Double-helix filaments give the largest weapons an authored silhouette. The
   radius closes at both ends so the strands grow out of the emitter and merge
   into the impact, rather than looking like two unrelated cables. */
function addBeamHelix(bm,h0,h1,radius,turns,r,g,b,a,t,oneStrand){
  const dx=bm.x1-bm.x0, dy=bm.y1-bm.y0, dl=Math.hypot(dx,dy)||1;
  const ox=-dy/dl, oy=dx/dl, steps=10;
  const strands=oneStrand?1:2;
  for(let s=0;s<strands;s++){
    let ax=bm.x0, ay=bm.y0, ah=h0;
    for(let k=1;k<=steps;k++){
      const q=k/steps, taper=Math.sin(q*Math.PI);
      const ph=q*turns*TAU+t*8+bm.seed*5+s*Math.PI;
      const off=Math.sin(ph)*radius*taper;
      const ex=bm.x0+dx*q+ox*off, ey=bm.y0+dy*q+oy*off;
      const eh=h0+(h1-h0)*q+Math.cos(ph)*radius*.48*taper;
      addBeamRibbon(sprites.glow,ax,ah,ay,ex,eh,ey,
        Math.max(1.55,bm.w*.92),r,g,b,a,220);
      addBeamRibbon(sprites.glow,ax,ah,ay,ex,eh,ey,
        Math.max(.72,bm.w*.28),245,252,255,a*.78,220);
      ax=ex; ay=ey; ah=eh;
    }
  }
}
function addBeamBurst(x,y,h,size,r,g,b,a){
  /* Terminus punch: dense core + soft bloom + a few circular puffs.
     Radial streaks stay short authored flashes, not velocity ellipses. */
  bbAdd.add(sprites.glow,x,y,h,size*2.35,0,r,g,b,a*.95);
  bbAdd.add(sprites.glow,x,y,h,size*1.15,0,r,g,b,a);
  bbAdd.add(sprites.glow,x,y,h,size*0.52,0,255,253,244,a);
  const q=typeof mfVfxQ==='function'?mfVfxQ():1;
  if(q>=0.40&&size>1.4){
    const n=q>=1.2?8:q>=0.65?6:4;
    const seed=x*0.073+y*0.051;
    for(let k=0;k<n;k++){
      const ang=seed+k*(6.283185/n);
      const rad=size*(0.85+(k&1)*0.35);
      const px=x+Math.cos(ang)*rad, py=y+Math.sin(ang)*rad;
      bbAdd.add(sprites.glow,px,py,h,size*0.42,0,r,g,b,a*.70);
    }
  }
  if(typeof gpfxEnergyBlast==='function'&&q>=0.4&&size>2.2
     &&(typeof gpfxLive==='undefined'||gpfxLive<GPFX_CAP-80))
    gpfxEnergyBlast(x,y,h,size>6?22:12,[r,g,b],{speed:72,up:0.32,life:0.64,size:6.6,min:4});
}
function addMuzzleFlash(x,y,h,dx,dy,size,r,g,b,a){
  /* Brief barrel bloom plus a cone along the shot. Both stay on the
     weapon; nothing here is given velocity that would orbit the chassis. */
  if(a<8||size<0.4) return;
  const l=Math.hypot(dx,dy)||1, nx=dx/l, ny=dy/l;
  const q=typeof mfVfxQ==='function'?mfVfxQ():1;
  const cone=Math.max(8.2,size*(q>=0.95?2.65:2.05));
  bbAdd.add(sprites.glow,x,y,h,size*1.48,0,r,g,b,a);
  bbAdd.add(sprites.glow,x,y,h,size*.58,0,255,252,242,a);
  addBeamRibbon(sprites.glow,x,h,y,x+nx*cone,h,y+ny*cone,
    Math.max(2.05,size*.92),255,248,228,a,80);
  /* MEDIUM+ GPU spray at the already-lifted muzzle. n stays under the
     water-ripple stamp (n>=20). LOW keeps the cone so the shot is not mute. */
  if(typeof gpfxBurst==='function'&&q>=0.45&&perfScale>.28
     &&(typeof camDist==='undefined'||camDist<2400)&&gpfxLive<GPFX_CAP-64)
    gpfxBurst(x,y,h,typeof gpfxN==='function'?gpfxN(10,4):6,
      {speed:48,up:0.20,life:0.42,col:[r,g,b],size:4.8,drag:0.92,jit:1.0,dir:[nx,ny],skipWater:1});
}
function addWreckEmbers(x,y,h,size,heat,seed){
  /* Static coal bed + local flicker. Upright flame quads were the licking
     tongues the civic ground-burn pass already retired. */
  if(heat<0.08||size<0.8) return;
  const tt=typeof t==='number'?t:0;
  const flick=0.88+0.12*Math.abs(Math.sin(tt*5.8+seed));
  const a=heat*flick;
  const s=Math.max(2.2,size*0.78);
  bbAdd.add(sprites.glow,x,y,h+1.02,s*1.28,0,255,78,22,Math.min(64,36*a));
  bbAdd.add(sprites.glow,x,y,h+1.18,s*0.46,0,255,132,42,Math.min(130,82*a));
  if(FX.pool) FX.pool.add(x,y,h+0.80,s*1.15,0,255,92,28,Math.min(52,30*a));
}
function addWreckCoalBed(x,y,h,span,heat,seed,n){
  addWreckEmbers(x,y,h,span*0.55,heat,seed);
  const nn=n||3;
  for(let k=0;k<nn;k++){
    const a=seed+k*2.094;
    addWreckEmbers(x+Math.cos(a)*span*0.28,y+Math.sin(a)*span*0.24,h,
      span*0.32,heat*(0.72+((k*13)%7)*0.04),seed+k*3.1);
  }
  /* C&C wreck language: compact coals + a thin dark column, not licking tongues. */
  if(heat>0.22&&sprites.smoke)
    bbAlpha.add(sprites.smoke,x,y,h+span*0.55,span*0.85,seed, 38,36,34, Math.min(90,48*heat));
}
function stampCrystalVeins(D,H,col,pulse,fieldR,taken){
  /* Terrain paintResourceGroundNode owns the crack network. Additive
     glow ribbons + a centre sprite stacked with crystal pools into the
     white disc on every free node — the ore-refinery bloom in deploy. */
  return;
}

/* Combat VFX is authored in 2D (fx/fy, beam x0/y0). The draw path used a
   flat gh()+13 deck, so muzzle/impact sat on the dirt while turrets sit at
   M.turH*ss. Spatial-hash only — no sim writes. */
function fxWeaponH(x,y,muzzle){
  const base=(typeof terrainH==='function'?terrainH(x,y):0);
  const rad=muzzle?36:14;
  if(typeof nearestUnitAny==='function'){
    const u=nearestUnitAny(x,y,rad);
    if(u>=0){
      const T=TYPES[utype[u]];
      const M=typeof UNIT_MESH!=='undefined'?UNIT_MESH[utype[u]]:null;
      const ss=(T.size/15)*(M&&M.s||1)*1.5*(T.vscale||1);
      const th=(M&&M.turH>0?M.turH:(T.air?6:4.6))*ss;
      const hy=unitGroundY(T,ux[u],uy[u],u);
      return muzzle?hy+th:hy+th*0.55;
    }
  }
  if(typeof blds!=='undefined'&&typeof BCS!=='undefined'&&typeof BGW!=='undefined'&&bGrid){
    const cr=1, r2=rad*rad;
    const cx=clamp(x/BCS|0,0,BGW-1), cy=clamp(y/BCS|0,0,BGW-1);
    let best=-1, bd=r2;
    for(let gy=Math.max(0,cy-cr);gy<=Math.min(BGW-1,cy+cr);gy++)
     for(let gx=Math.max(0,cx-cr);gx<=Math.min(BGW-1,cx+cr);gx++){
      const cell=bGrid[gy*BGW+gx]; if(!cell) continue;
      for(const bi of cell){
        const B=blds[bi]; if(!B||!B.alive||B.prog<1) continue;
        const th0=typeof BLD_TUR_H!=='undefined'?BLD_TUR_H[B.type]:0;
        if(!th0) continue;
        const d=dist2(x,y,B.x,B.y); if(d>=bd) continue;
        bd=d; best=bi;
      }
    }
    if(best>=0){
      const B=blds[best];
      const M=typeof bldMeshFor==='function'?bldMeshFor(B):null;
      const grow=B.prog||1;
      const th=(M&&M.turH)||(typeof BLD_TUR_H!=='undefined'&&BLD_TUR_H[B.type])||14;
      const hy=(BT[B.type]&&BT[B.type].placement==='water')?0:base;
      return hy+th*grow*(muzzle?1:0.62);
    }
  }
  return base+(muzzle?13:2.4);
}

/* Rail batteries and strategic silos are base landmarks. Their geometry is
   faction-authored, but at an RTS camera distance a small, quiet charge motif
   is what keeps the role readable in motion. These are billboard/ring effects
   only: no lights, emitters or simulation particles, so a dense fortress does
   not turn into additive fog on a phone. The caller has already passed both
   viewport and fog-of-war visibility gates. */
function addFactionStrategicBuildingVfx(B,fac,H,bob,grow,t,M){
  if(B.prog<1||perfScale<.32||(B.type!=='rail'&&B.type!=='nova')) return;
  const pal=fac==='legion'?[[255,76,48],[255,171,72]]:
    fac==='syndicate'?[[186,78,255],[118,246,182]]:
    fac==='horde'?[[136,232,72],[198,84,255]]:
    [[72,205,255],[205,244,255]];
  const p=.72+Math.sin(t*(B.type==='nova'?2.0:3.2)+B.x*.017+B.y*.011)*.28;
  const th=(M.turH||BLD_TUR_H[B.type]||(B.type==='nova'?20:18))*grow;
  const top=H+bob+th+(B.type==='nova'?10:6)*grow;
  const a=(B.cool||0)<=0?1:.46;
  if(B.type==='rail'){
    const ang=(B.tang||0)-Math.PI/2,dx=Math.cos(ang)*(10+2*(B.lvl||1))*grow;
    const dy=Math.sin(ang)*(10+2*(B.lvl||1))*grow;
    bbAdd.add(sprites.glow,B.x+dx,B.y+dy,top,(7+3*p)*grow,0,pal[0][0],pal[0][1],pal[0][2],145*a);
    bbAdd.add(sprites.ring||sprites.glow,B.x+dx,B.y+dy,top,(5.2+1.7*p)*grow,
      t*.45,pal[1][0],pal[1][1],pal[1][2],118*a);
    if(perfScale>.56) bbAdd.add(sprites.glow,B.x-dx*.42,B.y-dy*.42,top-3*grow,
      10*grow,0,pal[0][0],pal[0][1],pal[0][2],55*a);
    return;
  }
  /* NOVA's slow orbital lock is intentionally wider than its weapon muzzle:
     it telegraphs a strategic asset without resembling ordinary gunfire. */
  FX.ring.add(B.x,B.y,H+1.5,34+5*p,t*.18,pal[0][0],pal[0][1],pal[0][2],52*a);
  bbAdd.add(sprites.glow,B.x,B.y,top,(14+5*p)*grow,0,pal[0][0],pal[0][1],pal[0][2],98*a);
  bbAdd.add(sprites.ring||sprites.glow,B.x,B.y,top,(11+3*p)*grow,-t*.25,
    pal[1][0],pal[1][1],pal[1][2],125*a);
  if(perfScale>.56){
    const n=Math.min(4,1+(B.lvl||1));
    for(let k=0;k<n;k++){
      const q=t*.22+k*TAU/n,rr=(12+2*(B.lvl||1))*grow;
      bbAdd.add(sprites.glow,B.x+Math.cos(q)*rr,B.y+Math.sin(q)*rr,top-3*grow,
        3.2*grow,0,pal[1][0],pal[1][1],pal[1][2],155*a);
    }
  }
}

let fxT=0;
let bzShow=0;                 // territory overlay fades in briefly after it changes
function flashBuildZone(){ bzShow=1; }
/* One border segment: a thin plate a full cell long, laid on the ground so it
   follows the terrain instead of floating over it. */
function bzEdge(wx,wy,h,rot,a){
  // one cell-long hairline, plus a soft under-glow to give the frontier weight
  FX.line.add(wx,wy,h,BZ*1.04,rot, 170,240,255, 250*a, 4.4);
  FX.plate.add(wx,wy,h-0.2,BZ*0.9,0, 90,205,255, 62*a);
}
function drawDropCraft(fac,x,y,alt,ang,t,alpha,gear,thrust,vtolPose){
  const key=typeof dropFactionKey==='function'?dropFactionKey(fac):'nova';
  const D=DROP_MESH[key]||DROP_MESH.nova, P=DROP_PROFILE[key]||DROP_PROFILE.nova;
  if(!D||!D.body) return;
  const tc=P.team||TEAMC[0], anim=P.bio?t*2.7:0;
  D.body.add(x,y,alt,P.scale||1,ang,tc[0],tc[1],tc[2],alpha,undefined,anim);
  if(gear&&D.gear)
    D.gear.add(x,y,alt,P.scale||1,ang,tc[0],tc[1],tc[2],alpha,undefined,anim);
  const ca=Math.cos(ang),sa=Math.sin(ang),g=P.glow;
  const xf=(lx,lz)=>[x+lx*ca-lz*sa,y+lx*sa+lz*ca];
  /* Nova's four lift ducts are real articulated geometry, not exhaust sprites.
     The model's hinge maps 0=upright hover and 1=aft-tilted cruise. Rotors are
     separate instances so their blades can continuously spin while the duct
     itself performs the slower altitude-driven transition. */
  if(D.vtol&&P.vtol){
    const pose=clamp(vtolPose||0,0,1),phase=Math.asin(pose),fanA=clamp(1-pose*1.35,0,1);
    for(let k=0;k<P.vtol.length;k++){
      const H=P.vtol[k],q=xf(H[0],H[1]);
      D.vtol.add(q[0],q[1],alt,P.scale||1,ang,tc[0],tc[1],tc[2],alpha,undefined,phase);
      if(D.rotor&&fanA>.02)
        D.rotor.add(q[0],q[1],alt+12.2*(P.scale||1),P.scale||1,
          ang+t*(k&1?-11.5:11.5),tc[0],tc[1],tc[2],alpha*fanA);
    }
  }
  /* Stamp before flush — dropship streams empty on flush, so a later unit
     pass cannot see them. Same InstMesh path, no new format. */
  if(typeof csmActive==='function'&&csmActive()&&typeof csmBegin==='function'&&csmBegin(false)){
    csmDrawMesh(D.body);
    if(D.gear) csmDrawMesh(D.gear);
    if(D.vtol) csmDrawMesh(D.vtol);
    if(D.rotor) csmDrawMesh(D.rotor);
    csmEnd(_csmFrameNA);
  }
  D.body.flush(gl);
  if(gear&&D.gear) D.gear.flush(gl);
  if(D.vtol&&P.vtol){ D.vtol.flush(gl); if(D.rotor) D.rotor.flush(gl); }
  /* Engine bells are ENERGY on the mesh. Additive glow sprites at P.eng
     bloomed into the orange/yellow sparks on the two rear ports. Dust is
     type-10 alpha, not these. */
}
/* Per-frame render scratch, allocated once. Everything here used to be created
   fresh inside render() and thrown away 60 times a second. */
let _hbI=new Int32Array(4096), _hbF=new Float32Array(4096);
const _hbCells=new Map(), _wallStreams=new Set();
let _csmFrameNA=0;

function unitGroundY(T,x,y,i){
  if(T.air){
    const alt=(i!=null&&typeof unitAirAlt==='function')?unitAirAlt(i):58;
    return terrainH(x,y)+alt;
  }
  if(T.naval){
    /* Visual bob only. Sim pathing stays on the flat naval mask — a
       bouncing flowfield is a bug, and sim.js is contended. */
    return (typeof waterSurfaceY==='function'?waterSurfaceY(x,y):0)+0.95;
  }
  return terrainH(x,y);
}

function queueWaterFx(){
  if(typeof waterFxBegin!=='function'||!waterIdxCount) return;
  waterFxBegin();
  const wet=typeof authoredWaterAt==='function'?authoredWaterAt:()=>false;
  const cb=camBounds();
  const vis=(x,y,p)=>x>=cb.x0-(p||0)&&x<=cb.x1+(p||0)&&y>=cb.y0-(p||0)&&y<=cb.y1+(p||0);
  const push=(i)=>{
    if(!ualive[i]||!umov[i]) return;
    const T=TYPES[utype[i]];
    if(!T||!T.naval) return;
    if(!vis(ux[i],uy[i],90)) return;
    if(!fogEntityVisible(uteam[i],ux[i],uy[i])) return;
    /* Hulls face +X at mesh yaw 0, which is uang-π/2. mdlWake is authored
       aft along -X; the water-sheet V uses the same angle so foam trails
       the hull instead of sitting 90° off the bow. */
    const len=T.size*(T.vscale||1)*3.6;
    waterFxWake(ux[i],uy[i],uang[i]-Math.PI/2,len,T.size*1.2);
  };
  for(let i=0;i<unitHigh;i++) if(usel[i]||i===heroIdx) push(i);
  for(let i=0;i<unitHigh;i++){ if(usel[i]||i===heroIdx) continue; push(i); }
  if(typeof waterFxEmitCraterWakes==='function') waterFxEmitCraterWakes();
  /* Shock rings / explosions only, and only the newest 256 of the 9000-slot
     ring — a full scan was a tax for stamps that fire once while young. */
  if(typeof fHead==='undefined'||typeof MAXPART==='undefined') return;
  const look=Math.min(MAXPART,256);
  for(let k=0;k<look;k++){
    const i=(fHead-1-k+MAXPART)%MAXPART;
    if(flife[i]<=0) continue;
    const ty=ftype[i];
    if(ty!==0&&ty!==3&&ty!==6) continue;
    if(ty===0&&fsize[i]<12) continue;
    if(flife[i]/fmax[i]<0.72) continue;
    if(!vis(fx[i],fy[i],70)) continue;
    if(wet(fx[i],fy[i])){
      waterFxImpact(fx[i],fy[i], ty===6?14:ty===3?Math.max(8,fsize[i]*0.9):10, ty===3?1.35:0.95);
      continue;
    }
    const near=typeof waterNearAuthored==='function'&&waterNearAuthored(fx[i],fy[i],28);
    if(near) waterFxImpact(near[0],near[1], ty===6?12:9, ty===3?1.2:0.85);
  }
}

function render(dtDraw){
  const labNight=typeof materialV2LabNightAmount==='function'?materialV2LabNightAmount():null;
  const S_nA=labNight==null?nightAmt():labNight;
  _csmFrameNA=S_nA;
  /* One biome ground colour per frame, shared by every structure skirt: the
     terrain palette's hill tone pulled toward its cliff rock — what freshly
     turned ground beside a foundation actually looks like. */
  const _skT=THEMES[curTheme]||THEMES.verdant;
  const _skC=[Math.round(_skT.h0[0]*0.62+_skT.cliff[0]*0.38),
              Math.round(_skT.h0[1]*0.62+_skT.cliff[1]*0.38),
              Math.round(_skT.h0[2]*0.62+_skT.cliff[2]*0.38)];
  const t=performance.now()/1000;      // animation clock, shared by every wobble here
  fxT+=dtDraw;
  /* Keep the command network readable while the catalogue is open. Previously
     flashBuildZone() expired before a player finished comparing structures,
     so the actual answer to “where can I build?” vanished before a choice was
     made. Placement has its cheaper local-cell overlay below. */
  const buildCatalogue=document.getElementById('buildMenu');
  const buildCatalogueOpen=!!(buildCatalogue&&buildCatalogue.style.display==='block');
  /* Pin while placing too. startPlacing() hides #buildMenu, so without this the
     overlay would fade out over ~2s exactly as the player starts aiming — the
     same failure the removed `&&!placing` guard caused, just slower. */
  if(buildCatalogueOpen||placing) bzShow=1;
  else if(bzShow>0) bzShow=Math.max(0,bzShow-dtDraw*0.5);
  /* Screen shake is now a camera-space nudge rather than a world offset — with
     a perspective camera you shake the EYE, not the contents of the world. */
  if(shake>0){
    cam.x+=rr(-shake,shake)*shakeMult*0.9;
    cam.y+=rr(-shake,shake)*shakeMult*0.9;
    shake*=0.86; if(shake<0.3) shake=0;
    clampCam(); camUpdateMatrices();
  }
  drawCalls=0; triCount=0;

  gl.viewport(0,0,cv.width,cv.height);
  const Sun=sunFor(S_nA);
  selectCinematicLights(S_nA);
  /* Opaque geometry renders offscreen so screen-space AO can read its depth.
     If the target can't be created the call returns false and everything below
     draws straight to the canvas exactly as before. */
  const aoActive=aoBeginScene();
  if(aoActive&&typeof aoW==='number'&&aoW>0) gl.viewport(0,0,aoW,aoH);
  /* Clear to EXACTLY the fog colour. The border haze fades the last stretch of
     ground into uFogC, so anything the camera sees past the edge has to be the
     same value or the illusion ends in a visible seam. */
  gl.clearColor(Sun.fog[0],Sun.fog[1],Sun.fog[2],1);
  gl.clearDepth(1);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.enable(gl.CULL_FACE);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  /* Portrait takeover in main.js disables this — AABB scissor left fog strips. */
  if(typeof mfGfxScissor==='function') mfGfxScissor(true);

  begin3D(S_nA);

  const B=camBounds();
  const x0=B.x0, x1=B.x1, y0=B.y0, y1=B.y1;
  const vis=(x,y,pad)=>x>=x0-(pad||0)&&x<=x1+(pad||0)&&y>=y0-(pad||0)&&y<=y1+(pad||0);
  /* Rendering relevance has three bands and never changes simulation state:
       0 outside the expanded camera — submit nothing;
       1 visible strategic/far — legacy/far material and no cosmetic hardware;
       2 tactical/important — full V2 material and secondary detail.
     Owned and allied armies keep fighting off-screen; they simply stop
     consuming draw bandwidth until the camera can see them again. */
  const renderBand=(x,y,pad,important)=>{
    if(!vis(x,y,pad))return 0;
    if(important)return 2;
    const far=orthoSpan>(typeof mfLodSpan==='function'?mfLodSpan(2250):2250)||dist2(x,y,cam.x,cam.y)>Math.pow(orthoSpan*.58+pad,2);
    return far?1:2;
  };
  const gh=(x,y)=>terrainH(x,y);
  /* Stage 1 ring LOD. vis() drops off-screen; usel drops unselected mass.
     Army-select at 1000 still paints a carpet at tactical zoom — cap at 48
     and cell-collapse. Command altitude (orthoSpan>1400) keeps the commander
     only: 48 rings at that height is still a smear. Draw budget, not a fake
     4000 pop cap. Count once so icon plates and ground rings share it. */
  let selOnCam=0;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]&&vis(ux[i],uy[i],40)) selOnCam++;
  const SEL_RING_LOD=48;
  const RING_STRATEGIC=orthoSpan>(typeof mfLodSpan==='function'?mfLodSpan(1400):1400);
  const ringKeepCmd=i=>i===heroIdx||(TYPES[utype[i]]&&TYPES[utype[i]].cat==='hero')
    ||(typeof isEnemyCommander==='function'&&isEnemyCommander(i));
  if(typeof mfIconStackRebuild==='function') mfIconStackRebuild(vis, ringKeepCmd);

  /* ---------------- terrain ----------------
     Drawn with its own program so it can sample the painted map canvas plus a
     tiling detail layer, rather than flat vertex colour.

     UNLESS THAT PROGRAM DID NOT BUILD. On a GPU where the terrain shader fails
     to compile or link, every other program still works — so units, buildings,
     rocks and crystals render normally and the GROUND is simply absent. That is
     the "map isn't rendering" report, and it is invisible from here because the
     failure only ever reached a phone's console. The terrain VAO carries the
     model program's exact vertex layout, so we can still draw real lit ground:
     vertex colour and material instead of the painted map, which is a downgrade
     but not a void. */
  if(typeof terrainProgOK!=='undefined'&&!terrainProgOK&&prog3D){
    begin3D(S_nA);
    setEmis(0);
    drawTerrainFallback();
    begin3D(S_nA);
  } else {
  gl.useProgram(progT);
  gl.uniformMatrix4fv(UT.uVP,false,matVP);
  gl.uniform3f(UT.uEye,eyeX,eyeY,eyeZ);
  gl.uniform3f(UT.uSun,Sun.dir[0],Sun.dir[1],Sun.dir[2]);
  { const c=_lin(Sun.col); gl.uniform3f(UT.uSunC,c[0],c[1],c[2]); }
  { const c=_lin(Sun.sky); gl.uniform3f(UT.uAmbSky,c[0],c[1],c[2]); }
  { const c=_lin(Sun.gnd); gl.uniform3f(UT.uAmbGnd,c[0],c[1],c[2]); }
  { const c=_lin(Sun.fog); gl.uniform3f(UT.uFogC,c[0],c[1],c[2]); }
  if(UT.uHazeQ) gl.uniform1f(UT.uHazeQ, typeof mfHazeQ==='function'?mfHazeQ():1);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,terrainTex);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,detailTex);
  /* Units 4/5/6 belong to the post chain. Fog uses 7 and immediately restores
     the active unit, so it cannot alias a material or AO sampler. */
  gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D,fogTex||terrainTex);
   gl.uniform1f(UT.uFogActive,fogGameplayActive()&&!demoMode&&fogTex?1:0);
  /* Splat inputs live on 8/9 — above the post chain's 4/5/6, so neither side
     can alias the other. Tile cells are integers into the 11x11 atlas. */
  const _rt=(typeof terrGroundTex!=='undefined')&&terrGroundTex&&terrSoilTex&&terrPaveTex&&terrGrassTex;
  gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D,_rt?terrGroundTex:matTex);
  gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D,(typeof groundMaskTex!=='undefined'&&groundMaskTex)||terrainTex);
  gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D,(typeof heightTex!=='undefined'&&heightTex)||terrainTex);
  gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D,_rt?terrSoilTex:matTex);
  gl.activeTexture(gl.TEXTURE12); gl.bindTexture(gl.TEXTURE_2D,_rt?terrPaveTex:matTex);
  gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D,_rt?terrGrassTex:matTex);
  const _rn=(typeof terrGroundNrm!=='undefined')&&terrGroundNrm&&terrSoilNrm&&terrPaveNrm&&terrGrassNrm;
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D,_rn?terrGroundNrm:matNrmTex);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D,_rn?terrSoilNrm:matNrmTex);
  gl.activeTexture(gl.TEXTURE14); gl.bindTexture(gl.TEXTURE_2D,_rn?terrPaveNrm:matNrmTex);
  gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D,_rn?terrGrassNrm:matNrmTex);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1f(UT.uRealTex,_rt?1:0);
  {
    const E=typeof battlefieldPlayBounds==='function'?battlefieldPlayBounds(0):{lo:0,hi:MAP};
    const ES=terrainExclusionStyle(curMap,curTheme),style=ES.style,ec=ES.tint;
    const lc=_lin([ec[0]/255,ec[1]/255,ec[2]/255]);
    gl.uniform2f(UT.uPlayBounds,E.lo,E.hi);
    gl.uniform1f(UT.uEdgeStyle,style);gl.uniform1f(UT.uEdgeTime,t);
    /* Impact burns: newest first, culled to view, cooled by age. Explosive
       glow dies in ~11 s, its char fades by ~70 s; civic ember fields hold
       heat longer (~90 s) so a burning city stays readable. Kinetic churn
       settles in ~22 s. Cheap: at most 16 vec4s a frame. */
    if(typeof groundBurns!=='undefined'){
      const now=stats.t;
      const burnLife=G=>!G.kind?22:(G.civic?90:70);
      for(let i=groundBurns.length-1;i>=0;i--){
        const G=groundBurns[i];
        if(now-G.t0>burnLife(G)) groundBurns.splice(i,1);
      }
      const bv=_burnVec, bk=_burnKind; let bn=0;
      for(let i=groundBurns.length-1;i>=0&&bn<16;i--){
        const G=groundBurns[i];
        if(!vis(G.x,G.y,G.r+60)) continue;
        const life=burnLife(G);
        bv[bn*4]=G.x; bv[bn*4+1]=G.y; bv[bn*4+2]=G.r;
        bv[bn*4+3]=clamp((now-G.t0)/life,0,1);
        bk[bn]=G.kind; bn++;
      }
      gl.uniform1i(UT.uBurnN,bn);
      if(bn){ gl.uniform4fv(UT.uBurns,bv); gl.uniform1fv(UT.uBurnKind,bk); }
    } else gl.uniform1i(UT.uBurnN,0);
    gl.uniform3f(UT.uEdgeTint,lc[0],lc[1],lc[2]);
  }
  gl.activeTexture(gl.TEXTURE0);
  drawTerrainEdge();
  drawTerrain();
  }
  if(typeof csmPrepare==='function') csmPrepare(Sun);
  if(typeof materialV2QueueShadows==='function')materialV2QueueShadows(Sun);
  drawShadows(Sun);                 // ground shadows go on before anything stands on them
  begin3D(S_nA);                    // back to the lit model program

  /* Material V2 is an opt-in laboratory until its mobile/army gates pass.
     It draws into the ordinary opaque/SSAO target, then restores begin3D so
     every production stream remains on the legacy shader. */
  if(typeof renderMaterialV2Lab==='function')renderMaterialV2Lab(S_nA,t);

  // ---------------- scenery ----------------
  const qDraw=typeof qualityKey==='function'?qualityKey():'high';
  /* MEDIUM/LOW: every other rock/tree at command zoom. HIGH still submits
     the full stand — one instanced draw either way; this is instance fill
     at a height where a trunk is ~2 px. */
  const sceneryStep=(qDraw==='medium'||qDraw==='low')&&orthoSpan>(typeof mfLodSpan==='function'?mfLodSpan(2000):2000)?2:1;
  const BK=typeof biomeKit==='function'?biomeKit():null;
  const rockTint=(BK&&BK.rockTint)||[190,186,178];
  const floraMesh=k=>k==='pine'?(FX.treePine||FX.tree):k==='palm'?(FX.treePalm||FX.tree):
    k==='dead'?(FX.treeDead||FX.tree):k==='spore'?(FX.treeSpore||FX.tree):FX.tree;
  const rockMesh=k=>k==='ice'?(FX.rockIce||FX.rock):k==='slag'?(FX.rockSlag||FX.rock):FX.rock;
  for(let ri=0;ri<rocks.length;ri++){
    if(sceneryStep>1&&(ri%sceneryStep)) continue;
    const r=rocks[ri];
    if(!vis(r.x,r.y,40)||!fogPointVisible(r.x,r.y)) continue;
    rockMesh(r.k).add(r.x,r.y,gh(r.x,r.y),r.s*0.035,r.a,rockTint[0],rockTint[1],rockTint[2],255);
  }
  /* Settlements: one instanced draw per kit piece + one per site fill mesh.
     Fog rule matches buildings — an unscouted town stays dark. */
  if(typeof worldSites!=='undefined') for(const S of worldSites){
    if(!vis(S.x,S.y,S.r+140)||!fogPointVisible(S.x,S.y)) continue;
    if(S.fill&&S.fill.n!==undefined) S.fill.add(S.x,S.y,gh(S.x,S.y),1,0,255,255,255,255);
    for(const p of S.props){
      if(!vis(p.x,p.y,p.s+30)) continue;
      const K=WORLD_KIT[p.k]; if(K) K.mesh.add(p.x,p.y,gh(p.x,p.y),p.s,p.a,255,255,255,255);
    }
  }
  const tt=(BK&&BK.treeTint)||THEMES[curTheme].treeTint;
  const ct=(BK&&BK.coverTint)||[86,118,58];
  for(let ti=0;ti<trees.length;ti++){
    if(sceneryStep>1&&(ti%sceneryStep)) continue;
    const tr=trees[ti];
    if(!vis(tr.x,tr.y,50)||!fogPointVisible(tr.x,tr.y)) continue;
    floraMesh(tr.k).add(tr.x,tr.y,gh(tr.x,tr.y),tr.s*0.030,tr.a,tt[0],tt[1],tt[2],255);
  }
  if(typeof cover!=='undefined'&&FX.bush) for(let ci=0;ci<cover.length;ci++){
    if(sceneryStep>1&&(ci%sceneryStep)) continue;
    const b=cover[ci];
    if(!vis(b.x,b.y,36)||!fogPointVisible(b.x,b.y)) continue;
    FX.bush.add(b.x,b.y,gh(b.x,b.y),b.s*0.042,b.a,ct[0],ct[1],ct[2],255);
  }
  for(const cs of crystals){
    const D=deposits[cs.dep],tier=depositTier(D);if(!D||cs.band>tier||!vis(cs.x,cs.y,140))continue;
    /* Occupied pad: the extractor owns the node. Drawing the shard cluster
       plus additive glows under a mex stacked into the white bloom discs. */
    if(D.taken)continue;
    if(!fogPointVisible(cs.x,cs.y))continue;
    const fill=clamp((D.remaining-(tier-1)*DEPOSIT_BAND)/DEPOSIT_BAND,0,1),edge=cs.band===tier?(.46+.54*fill):1;
    const col=cs.band===3?[255,120,255]:cs.band===2?[105,255,176]:[105,226,255];
    const sc=cs.s*(cs.core?.090:.074)*edge;
    const H=gh(cs.x,cs.y);
    FX.crystal.add(cs.x,cs.y,H,sc,cs.a,col[0],col[1],col[2],255);
    /* Facet glints only. Standing glow pools under every shard — and a
       deploy floor of 0.9 while matchLive is false — were the white disc
       on DEPLOY BASE. The CRYST mesh plus terrain cracks carry identity. */
    const glowQ=clamp((perfScale-0.28)/0.45,0,1);
    if(glowQ>0.02){
      const tw=Math.sin(t*2.1+cs.x*0.37+cs.y*0.113);
      if(tw>0.97){
        const f=(tw-0.97)*33, ga=cs.a+cs.x;
        bbAdd.add(sprites.spark||sprites.glow,
          cs.x+Math.cos(ga)*sc*46, cs.y+Math.sin(ga)*sc*46, H+sc*175*(0.55+0.4*Math.sin(cs.y)),
          1.8+f*2.2, t*2+cs.x, 235,250,255, 70*f*glowQ);
      }
    }
  }
  /* Mass nodes are the glowing shard cluster, tinted by depletion band.
     Brown habit tints turned the bed into dirt plates and fought the CRYST
     spikes. Kit energy habit still owns geysers. */
  const enHabit=(BK&&BK.energy)||'vent';
  const enCol=enHabit==='frost'?[176,216,226]:enHabit==='heat'?[226,128,58]:
    enHabit==='spore'?[186,78,140]:[92,196,206];
  for(const D of deposits){ if(!vis(D.x,D.y,180)||!fogPointVisible(D.x,D.y)) continue;
    const tier=depositTier(D);
    const col=tier===3?[255,122,255]:tier===2?[110,255,180]:tier===1?[112,228,255]:[88,92,100];
    const pulse=.82+.18*Math.sin(t*2.1+(D.pulse||0)),H=gh(D.x,D.y);
    const fieldR=46+(D.initialTier||1)*8;
    stampCrystalVeins(D,H,col,pulse,fieldR,!!D.taken);
    /* Occupied: extractor owns the pad. Free-node halo + ring + vein
       ribbons were the white bloom disc in the deploy screenshot. */
  }
  for(const G of geysers){ if(!vis(G.x,G.y,180)||!fogPointVisible(G.x,G.y)) continue;
    const tier=typeof geyserTier==='function'?geyserTier(G):(G.taken?2:3);
    const pc=tier?enCol:[83,82,78];
    /* Mesh stays rock. Cyan habit on the whole instance made the cairn a
       painted metal hatch. Steam billboard carries the energy colour. */
    const rock=enHabit==='frost'?[168,176,184]:enHabit==='heat'?[118,88,72]:
      enHabit==='spore'?[96,78,82]:[112,104,92];
    const pulse=.72+.28*Math.sin(t*2.6+(G.pulse||G.x*.01)),H=gh(G.x,G.y);
    if(FX.geyser) FX.geyser.add(G.x,G.y,H,1.48+tier*.10,0,rock[0],rock[1],rock[2],tier?(G.taken?205:255):145);
    if(tier&&qDraw!=='low'){
      bbAdd.add(sprites.glow,G.x,G.y,H+28,(16+tier*3)*pulse,0,pc[0],pc[1],pc[2],G.taken?22:36);
    }
  }
  // crater berms — real mounds standing on the deformed ground
  for(const M of relief){ if(!vis(M.x,M.y,60)||!fogPointVisible(M.x,M.y)) continue;
    FX.berm.add(M.x,M.y,gh(M.x,M.y),M.w*0.075,M.a,208,196,178,255); }
  // salvage fields
  /* Salvage is coloured by what it came from, so a player can tell at a glance
     whether a field is worth walking to: cold alloy reads as scrap and pays
     energy, pale carcass reads as biomass and does not. Tinting here rather
     than in the model keeps it one instanced draw for every kind. */
  for(const W of wrecks){ if(!vis(W.x,W.y,50)||!fogPointVisible(W.x,W.y)) continue;
    const f=0.7+0.5*(W.mass/Math.max(1,W.m0));
    const c = W.kind===5 ? [206,190,150]      // biomass — bone-pale carcass
            : W.kind===2 ? [172,166,158]      // city ruin — dusty concrete
            : [200,190,178];                  // scrap and fallen structures
    FX.wreck.add(W.x,W.y,gh(W.x,W.y),W.s*0.045*f*(W.kind===5?0.8:1),W.a, c[0],c[1],c[2],255); }
  for(const Cc of crates){ if(!vis(Cc.x,Cc.y,60)||(!fogPointVisible(Cc.x,Cc.y)&&!Cc.seen)) continue;
    const cc=Cc.kind&&Cc.kind.col||[255,240,190],rs=1+(Cc.kind&&Cc.kind.rarity||0)*.08;
    FX.crate.add(Cc.x,Cc.y,gh(Cc.x,Cc.y)+Cc.alt*0.55+(Cc.alt>0?0:Math.sin(t*2.4+Cc.x)*1.6),rs,Cc.alt>0?t*2.2:t*0.35,cc[0],cc[1],cc[2],255); }

  // ---------------- derelict districts ----------------
  const worldV2=typeof mfWorldV2Enabled==='function'&&mfWorldV2Enabled();
  for(const R of relics){
    const deadAge=R.alive?0:Math.max(0,(typeof stats!=='undefined'?stats.t:t)-(R.fallT||0));
    if(!R.alive && deadAge>20) continue;
    const rLod=renderBand(R.x,R.y,120,false);
    if(!rLod||!fogPointVisible(R.x,R.y)) continue;
    const dmg=R.alive?(R.hp/R.hpm):0, tint=R.alive?(180+70*dmg):96;
    /* Each ruin mesh is authored at a reference footprint; the instance scale
       maps the planned plot size onto it. Tower blocks are the tall ones, so
       they get the tightest divisor or they overwhelm the skyline. */
    /* Divisors map a plot footprint onto each mesh's own authored reference
       size. The derelict meshes are authored at tens of units; the WORLD_KIT
       meshes are authored NORMALISED (height 0.63-1.49), so their divisor is 1
       and the plot footprint IS the scale. Dividing them by 34 like a ruin
       rendered 1-unit-tall buildings -- present in every count, invisible on
       screen. */
    const sc=Math.max(R.w,R.h)/ (R.kind===2?104 : R.kind===0?46 : R.kind===3?52 : R.kind===4?46 : R.kind===5?44
             : (R.kind===6||R.kind===7)?1 : 44)*(R.alive?1:clamp(0.16+0.12*(1-deadAge/20),0.16,0.28));
    const wreckYaw=(R.a||0)+(R.lean||0)+(R.alive?0:0.42);
    /* Kind 4 is the intact civic block. Falling back to the low block if its
       mesh is missing is not paranoia: models-civic.js has to be registered in
       BOTH boot.js and assets/data/manifest.json, and a file that is listed in
       only one silently does not load — which would otherwise turn every civic
       plot into a null dereference in the hot render loop.
       Kind 5 is the skyline anchor: the alien crystalline monolith on the
       foreign worlds, otherwise the two skyscrapers alternated by position
       hash so twin districts don't clone. */
    const alien5=curTheme==='vespera'||curTheme==='ashland';
    /* Kinds 6/7 are authored template plots and draw from WORLD_KIT, keyed by
       the role the template named. Same null-guard discipline as kind 4 above:
       worldkit.js is registered in both manifests, but a kit whose initialiser
       never ran leaves WORLD_KIT empty, and an unguarded lookup here is a null
       dereference in the hot render loop. Falling back to the derelict block
       shows a building rather than nothing. */
    const kitM=(R.kind===6||R.kind===7)&&typeof WORLD_KIT!=='undefined'&&R.role
      ? (WORLD_KIT[R.role]&&WORLD_KIT[R.role].mesh) : null;
    const mesh=kitM || (R.kind===2?FX.cityH : R.kind===3?FX.cityK : R.kind===0?FX.cityT
             : R.kind===4?(FX.cityC||FX.cityD)
             : R.kind===5?((alien5?FX.skyA:(((R.x*7+R.y*13)|0)%2?FX.sky2:FX.sky1))||FX.cityT)
             : FX.cityD);
    /* V2 and legacy are deliberately separate instance streams. Until all
       three maps have decoded (or on LOW quality), the old mesh draws instead
       of leaving an empty lot. Skyline anchors have no V2 stream — they are
       authored geometry and always draw through their own mesh. */
    if(R.kind===5){
      const vt=curTheme==='vespera';
      /* Past the shear the anchor draws as its own stump. The alien monolith
         has no stump form — a crystal growth shatters rather than shearing,
         so it keeps its silhouette and loses it all at zero. */
      const m5=(R.part&&mesh!==FX.skyA&&FX.skyS)?FX.skyS:mesh;
      m5.add(R.x,R.y,gh(R.x,R.y),sc,wreckYaw,
               vt?226:(curTheme==='ashland'?255:tint),
               vt?205:(curTheme==='ashland'?214:tint-6),
               vt?244:(curTheme==='ashland'?196:tint-16),255);
    } else if(!worldV2||!mfWorldV2Queue(R,sc,gh(R.x,R.y),rLod))
      mesh.add(R.x,R.y,gh(R.x,R.y),sc*(R.kind===0?0.9:1),wreckYaw,tint,tint-6,tint-16,255);
    if(FX.decal) FX.decal.add(R.x,R.y,gh(R.x,R.y)+0.2,sc*1.05,R.a,12,18,28,130);
    /* The berm that ties the block to the ground. Footprint-shaped (the
       cross-axis lane carries depth), tinted with the BIOME so the transition
       belongs to this world rather than to the model's own grey. */
    if(FX.skirt&&rLod<2)
      FX.skirt.add(R.x,R.y,gh(R.x,R.y)+0.14,R.w*1.34,R.a,_skC[0],_skC[1],_skC[2],255,R.h*1.34);
  }
  const worldV2CsmDefer=worldV2&&typeof csmActive==='function'&&csmActive();
  if(worldV2&&!worldV2CsmDefer)mfWorldV2Flush(Sun,S_nA,t);

  /* Structure hardstands are no longer drawn as geometry at all. They are
     levelled into the heightfield and painted into the terrain texture the
     moment a structure is placed, so they ARE the ground — which removes an
     entire pass of ground-hugging quads and, with it, the z-fighting that
     made them flicker as white sheets on shallower depth buffers. */

  /* A building keeps its simulation type, while its resolved owner selects a
     completely different model registry. Iterating buildings once preserves
     instancing without multiplying the hot loop by every faction and type. */
  for(const Bd of blds){
    const wreckAge=(!Bd.alive&&Bd.fallT)?Math.max(0,(typeof stats!=='undefined'?stats.t:t)-Bd.fallT):-1;
    const wreck=wreckAge>=0&&wreckAge<14;
    if(!Bd.alive&&!wreck) continue;
    const bImportant=Bd.alive&&Bd.team===0&&(Bd.type==='hq'||Bd===blds[openBld]);
    const bLod=renderBand(Bd.x,Bd.y,140,bImportant);
    if(!bLod) continue;
    if(!fogEntityVisible(Bd.team,Bd.x,Bd.y)) continue;
    const fac=bldFactionKey(Bd);
    /* STRATEGIC TIER — STRUCTURES. The mirror of the unit branch at :1175, and
       until now the missing half of the feature: mfIconCellForBld, mfBldSpan
       and the eight building glyphs existed, were rasterised into the atlas
       every session, and had no caller. A field of unit symbols floating over
       unreadable building meshes is not a strategic view.

       SITED AFTER THE FOG GATE ABOVE, never in place of it. Disclosure is fog's
       decision at every tier; an icon is only a different way of drawing
       something the player is already allowed to see. (The literal
       fogEntityVisible(Bd.team,Bd.x,Bd.y) line above is pinned by
       tools/test-faction-strategic-defense.mjs.)

       Sited before bldMeshFor() so a fully iconised structure also skips the
       mesh registry lookup, the berm, the turret and the strategic VFX — the
       same CPU saving the unit branch takes.

       WHAT ACTUALLY CONVERTS, measured at VH=915: mfBldSpan is footprint-based
       (size*2.2), so a wall crosses to a pure icon at span 2952 and a Sentinel
       reaches q=0.82 at SPAN_MAX=3400, while a Factory sits at q=0 and a
       Carrier HQ would need span 10199. The crossings scale with VH, so this is
       the 915 px phone case and a shorter viewport converts MORE, not less: at
       VH=800 the Sentinel is a pure icon and the Extractor reaches q=0.83.
       Small emplacements become symbols; landmarks keep their silhouettes for
       the whole zoom range. That is the
       Supreme-Commander read this file's header argues for, and it is why the
       icon LAYERS over the mesh rather than fading it — fading a building by
       screen footprint is exactly the regression in
       docs/POSTMORTEM-1.33.31-REGRESSION.md. */
    const BTd=BT[Bd.type];
    const bIcon=wreck?0:((typeof mfIconQ==='function'&&BTd)?mfIconQ(mfBldSpan(BTd)):0);
    if(bIcon>0&&mfIconEnsure()){
      const bH=(BTd.placement==='water'?0:gh(Bd.x,Bd.y))+2,
            bBody=mfIconBody(Bd.team), bInk=mfIconInk(Bd.team),
            bDpx=mfIconDpxBld(BTd), bIa=255*bIcon;
      /* Domain 'str' — the flat anchored base variant of this faction's plate.
         A structure is not a vehicle and should not wear the ground plate. */
      bbIcon.add(mfIconPlateFor(fac,null,'str'),Bd.x,Bd.y,bH,bDpx,0,bBody[0],bBody[1],bBody[2],bIa);
      bbIcon.add(mfIconCellForBld(BTd,fac),Bd.x,Bd.y,bH,bDpx*0.60,0,bInk[0],bInk[1],bInk[2],bIa);
      if(bImportant){ const bBr=(typeof TEAMB!=='undefined'&&TEAMB[Bd.team])||bBody;
        bbIcon.add(MF_ICO.pl_ring,Bd.x,Bd.y,bH,bDpx*1.26,0,bBr[0],bBr[1],bBr[2],bIa); }
      /* Only a FINISHED structure may drop its mesh. A construction site still
         has to show `grow` — replacing a half-built factory with a completed
         symbol would report a building the player does not yet own. */
      if(bIcon>=1&&Bd.prog>=1) continue;
    }
    const M=bldMeshFor(Bd); if(!M) continue;
    /* Buildings need a lighter faction-grade tint than tiny units: at phone
       zoom the regular team-blue multiplication crushed PBR panels into one
       navy silhouette. The livery remains coloured, but steel and glass read. */
    const tc=fac==='nova'?[188,226,255]:fac==='legion'?[255,156,126]:fac==='syndicate'?[174,224,255]:fac==='horde'?[214,166,255]:(TEAMC[Bd.team]||TEAMC[2]),
          H=BT[Bd.type]&&BT[Bd.type].placement==='water'?0:gh(Bd.x,Bd.y);
    const deployAge=Bd.type==='hq'&&Bd.deployT?Math.max(0,t-Bd.deployT):99;
    const deployQ=clamp(deployAge/2.1,0,1);
    /* The functional HQ is created on touchdown, but its art unfolds over two
       seconds. This avoids the old visual lie where a dropship disappeared
       and a completed base teleported into the exact same footprint. */
    const grow=(Bd.prog<1 ? 0.30+0.70*Bd.prog : 1)*(deployAge<2.1?.62+.38*deployQ:1)*(wreck?clamp(0.22+0.16*(1-wreckAge/14),0.22,0.38):1);
    const an=t*1.6+(Bd.anim||0);
    let bob=0, sq=1, em=0;
    switch(Bd.type){
      case 'mex':  bob=Math.sin(an*2.6)*1.2; break;
      case 'pgen': case 'geo': em=0.05+Math.sin(an*1.7)*0.04; break;
      case 'fac': case 'tgate': case 'airfield': case 'harbor':
        if(Bd.queue.length){ bob=Math.sin(an*3.6)*0.8; em=0.03+Math.abs(Math.sin(an*4))*0.04; } break;
      case 'fab':  em=0.08+Math.abs(Math.sin(an*5.2))*0.10; break;
      case 'techlab': em=0.03+Math.sin(an*2.2)*0.03; break;
      case 'arc':  em=0.06+Math.abs(Math.sin(an*3.4))*0.12; break;
      case 'nest': sq=1+Math.sin(an*1.9)*0.05; break;
      case 'nova': em=Bd.cool<=0?0.10+Math.sin(an*3)*0.06:0; break;
      /* Charged Stormcaller hums visibly; a firing one strobes. */
      case 'stormcaller': em=Bd.sq?0.22+Math.abs(Math.sin(an*9))*0.2:Bd.cool<=0?0.12+Math.sin(an*2.6)*0.07:0.02; break;
    }
    if(fac==='syndicate'){
      bob+=1.15+Math.sin(an*2.25+Bd.x*.01)*0.55;
      if(Bd.type!=='mex') em+=0.05+Math.abs(Math.sin(an*2.1))*0.05;
    }else if(fac==='horde'){
      bob*=0.18;
      sq*=1+Math.sin(an*1.72+Bd.y*.012)*0.026;
      if(Bd.type!=='mex') em+=0.025+Math.abs(Math.sin(an*2.8))*0.035;
    }
    if(Bd.hitT>0) em+=0.35;
    if(deployAge<2.4){
      const pulse=1-deployAge/2.4,pc=fac==='horde'?[168,235,78]:fac==='legion'?[255,132,78]:fac==='syndicate'?[76,215,255]:[132,218,255];
      FX.ring.add(Bd.x,Bd.y,H+2,42+deployQ*48,t*1.4,pc[0],pc[1],pc[2],190*pulse);
      FX.ring.add(Bd.x,Bd.y,H+3,24+deployQ*34,-t*1.9,pc[0],pc[1],pc[2],125*pulse);
      if(fac==='horde'){
        for(let q=0;q<5;q++){
          const a=q/5*TAU+t*.35,r=28+deployQ*43;
          bbAdd.add(sprites.glow,Bd.x+Math.cos(a)*r,Bd.y+Math.sin(a)*r,H+5,7,0,pc[0],pc[1],pc[2],105*pulse);
        }
      }
    }
    const vi=Math.min((M.variants&&M.variants.length||1)-1,Math.max(0,(Bd.lvl||1)-1));
    const V=M.variants?M.variants[vi]:M;
    const damageState=wreck?0.999:(Bd.prog<1?0:Math.min(.999,1-clamp(Bd.hp/Math.max(1,Bd.hpm),0,1)));
    /* HQs are landmarks, so they receive the dedicated V2 landmark profile
       instead of merely being another building using a faction tint. This is
       the live production route for future authored HQ map packs. */
    /* HQ=landmark (profile 2). Other structures use profile 3 so FS3D
       scorches them under fire; units stay on band 0 / commander 1. */
    const surfaceState=(Bd.type==='hq'?4:6)+damageState;
    /* Encode pulse above opaque alpha; the solid shader separates it into a
       per-instance emission value. A shared mesh can now batch every building
       of this faction/type without one animated reactor flushing (and tinting)
       unrelated instances that were already queued. */
    if(wreck){ em=0; bob=0; }
    V.base.add(Bd.x,Bd.y,H+bob,grow*sq,(Bd.rot||0)+(wreck?0.20:0),tc[0],tc[1],tc[2],255*(1+em),undefined,undefined,surfaceState);
    /* THE SAME BERM THE DERELICTS GET. A faction structure dropped onto a
       graded pad meets it at a perfect edge and reads as a game piece sitting
       on a board; this is the turned ground, spoil and broken slab that makes
       it read as EMPLACED. It follows `grow`, so it rises out of the ground
       with the building during construction rather than popping in complete,
       and it is biome-tinted, so the same factory belongs on ice and on ash. */
    if(FX.skirt&&Bd.prog>=1&&bLod<2){
      /* Sized to the PAVED APRON, not the hull. The join that reads as pasted
         on is concrete-to-terrain at the pad's outer edge, not hull-to-pad —
         skirting the hull only decorates ground that already matched. The
         foundation is bldFoot x 1.30 snapped to grid, so the berm straddles
         that boundary and dies into the biome just outside it. */
      const fr=(typeof foundationRect==='function')?foundationRect(Bd):null;
      const fw=(fr?fr[0]:(BT[Bd.type]&&BT[Bd.type].size||18)*2.2)*grow;
      const fh=(fr?fr[1]:(BT[Bd.type]&&BT[Bd.type].size||18)*2.2)*grow;
      FX.skirt.add(Bd.x,Bd.y,H+0.14,fw*1.05,Bd.rot||0,_skC[0],_skC[1],_skC[2],255,fh*1.05);
    }
    if(V.tur){
      V.tur.add(Bd.x,Bd.y,H+(M.turH||BLD_TUR_H[Bd.type]||14)*grow+bob,
        grow*(M.turS||BLD_TUR_S[Bd.type]||1),(Bd.tang||0)-Math.PI/2,tc[0],tc[1],tc[2],255,undefined,undefined,surfaceState);
    }
    if(!wreck&&(bLod===2||Bd.type==='hq'))addFactionStrategicBuildingVfx(Bd,fac,H,bob,grow,t,M);
    /* The command structure is the player's visual anchor. A restrained
       world-space beacon remains readable at strategic zoom, while the BASE
       button centers the same live object in one tap. */
    if(!wreck&&Bd.team===0&&Bd.type==='hq'&&Bd.prog>=1){
      const pulse=.76+.24*Math.sin(t*2.2);
      const bc=fac==='legion'?[255,112,76]:fac==='syndicate'?[72,214,255]:[92,210,255];
      FX.ring.add(Bd.x,Bd.y,H+2,58+pulse*7,t*.28,bc[0],bc[1],bc[2],74);
      /* Close-up: the old 18-unit glow sprite bloomed into a white halo on
         the roof. Keep a small beacon only at command zoom. */
      if(orthoSpan>560)
        bbAdd.add(sprites.glow,Bd.x,Bd.y,H+42,7+pulse*2,0,bc[0],bc[1],bc[2],62);
      if(orthoSpan>720)
        addBeamRibbon(sprites.glow,Bd.x,H+34,Bd.y,Bd.x,H+210,Bd.y,9,bc[0],bc[1],bc[2],42,120);
    }
  }
  if(typeof csmBegin==='function'&&typeof csmActive==='function'&&csmActive()&&csmBegin(true)){
    if(typeof csmDrawTerrain==='function') csmDrawTerrain();
    if(typeof mfWorld2Meshes!=='undefined') for(const k in mfWorld2Meshes) csmDrawMesh(mfWorld2Meshes[k]);
    csmDrawBuildingCasters();
    csmDrawSceneryCasters();
    csmEnd(S_nA);
  }
  if(worldV2CsmDefer)mfWorldV2Flush(Sun,S_nA,t);
  /* MEDIUM has no CSM restore. Icon-ensure / doodad uploads can steal
     unit 0 mid-loop; structures sample uMat there. Always re-bind the
     model atlas before the world flush. */
  begin3D(S_nA);
  const bldMeshSets=[BLD_MESH,...Object.values(BLD_FACTION_MESH)];
  for(const set of bldMeshSets) for(const k in set){
    const M=set[k];
    if(M.variants) for(const V of M.variants){V.base.flush(gl);if(V.tur)V.tur.flush(gl);}
    else {M.base.flush(gl);if(M.tur)M.tur.flush(gl);}
  }
  /* Flush every world-object stream. Each of these is one draw call for an
     entire class of object — all the rocks on screen, all the tower blocks,
     every wreck — which is the whole point of instancing. */
  FX.rock.flush(gl); if(FX.rockIce) FX.rockIce.flush(gl); if(FX.rockSlag) FX.rockSlag.flush(gl);
  FX.tree.flush(gl); if(FX.treePine) FX.treePine.flush(gl); if(FX.treePalm) FX.treePalm.flush(gl);
  if(FX.treeDead) FX.treeDead.flush(gl); if(FX.treeSpore) FX.treeSpore.flush(gl);
  if(FX.bush) FX.bush.flush(gl); FX.crystal.flush(gl);
  if(typeof worldSites!=='undefined'){
    for(const S of worldSites) if(S.fill&&S.fill.n) S.fill.flush(gl);
    if(typeof WORLD_KIT!=='undefined') for(const k in WORLD_KIT){ const M=WORLD_KIT[k]; if(M.mesh.n) M.mesh.flush(gl); }
  }
  FX.dep.flush(gl); FX.geyser.flush(gl); FX.berm.flush(gl);
  FX.wreck.flush(gl); FX.crate.flush(gl);
  FX.cityT.flush(gl); FX.cityD.flush(gl); FX.cityH.flush(gl); FX.cityK.flush(gl);
  if(FX.cityC) FX.cityC.flush(gl);
  if(FX.skirt){
    /* +0.14 raise is not enough at HIGH DPR: 24-bit depth still stitches
       the berm into the pad as a shimmering seam. Offset, then restore. */
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-6,-20);
    FX.skirt.flush(gl);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }
  FX.plate.flush(gl); FX.line.flush(gl);

  /* ---- curtain wall spans ------------------------------------------
     Each linked pair of barricades gets a rampart section built between
     them, so a wall run becomes one continuous fortification instead of a
     dotted line of separate blocks. Drawn as stretched wall geometry along
     the link axis, which is the visible payoff for laying walls in a line. */
  _wallStreams.clear();
  const wallStreams=_wallStreams;
  for(const W of blds){
    if(!W.alive||(W.type!=='wall'&&W.type!=='gate')||!W.linkA||!W.linkA.length) continue;
    if(!vis(W.x,W.y,90)) continue;
    if(!fogEntityVisible(W.team,W.x,W.y)) continue;
    const tc=TEAMC[W.team]||TEAMC[2];
    const family=BLD_FACTION_MESH[bldFactionKey(W)];
    const WM=(family&&family.wall)||BLD_MESH.wall;
    const WV=WM.variants?WM.variants[Math.min(WM.variants.length-1,Math.max(0,(W.lvl||1)-1))]:WM;
    for(const la of W.linkA){
      if(Math.cos(la)<0 || (Math.abs(Math.cos(la))<1e-6 && Math.sin(la)<0)) continue;
      const mx2=W.x+Math.cos(la)*WALL_LINK*0.34, my2=W.y+Math.sin(la)*WALL_LINK*0.34;
      const wallState=1-clamp(W.hp/Math.max(1,W.hpm),0,1);
      WV.base.add(mx2,my2,gh(mx2,my2),0.62,la,tc[0],tc[1],tc[2],255,undefined,undefined,wallState);
      wallStreams.add(WV.base);
    }
  }
  if(typeof csmBegin==='function'&&typeof csmActive==='function'&&csmActive()&&csmBegin(false)){
    for(const stream of wallStreams) csmDrawMesh(stream);
    csmEnd(S_nA);
  }
  for(const stream of wallStreams) stream.flush(gl);

  /* ---- power conduits -------------------------------------------------
     The paved service run is baked into the ground; this is the live cable
     lying on top of it, with a charge pulse travelling each span. The
     difference between "six buildings near each other" and "a base" is
     almost entirely these lines. */
  for(const Bc of blds){
    if(!Bc.alive||!Bc.conduit||!Bc.conduit.length) continue;
    if(!vis(Bc.x,Bc.y,200)) continue;
    if(!fogEntityVisible(Bc.team,Bc.x,Bc.y)) continue;
    const tb=TEAMB[Bc.team]||TEAMB[2];
    for(const O of Bc.conduit){
      if(!O.alive) continue;
      if(!fogEntityVisible(O.team,O.x,O.y)) continue;
      if(O.x<Bc.x||(O.x===Bc.x&&O.y<Bc.y)) continue;      // draw each run once
      const live=(Bc.prog>=1&&O.prog>=1)?1:0.34;
      const mx2=(Bc.x+O.x)/2, my2=(Bc.y+O.y)/2;
      const len=Math.hypot(O.x-Bc.x,O.y-Bc.y);
      const ang=Math.atan2(O.y-Bc.y,O.x-Bc.x);
      FX.line.add(mx2,my2,gh(mx2,my2)+2.4,len,ang, tb[0],tb[1],tb[2], 140*live, 2.4);
      const ph=(t*0.55+(Bc.x+Bc.y)*0.004)%1;
      const pxp=Bc.x+(O.x-Bc.x)*ph, pyp=Bc.y+(O.y-Bc.y)*ph;
      bbAdd.add(sprites.glow,pxp,pyp,gh(pxp,pyp)+5,14,0, tb[0],tb[1],tb[2], 210*live);
    }
  }

  /* ---------------- orbital dropship (pre-deployment) ----------------
     Flown, not placed. It holds a hover altitude, banks into its turns and
     runs its engines — none of which a building does, which was exactly why
     borrowing the deployed HQ's mesh made it read as a sliding bunker. */
  if(typeof singularities!=='undefined') for(const Sg of singularities){
    const dxs=Sg.x-cam.x,dys=Sg.y-cam.y;
    sceneLightPush(Sg.x,Sg.y,terrainH(Sg.x,Sg.y)+22,150,_lin([172,120,255])[0],_lin([172,120,255])[1],_lin([172,120,255])[2],
      0.9+0.5*Math.sin((typeof stats!=='undefined'?stats.t:0)*9),150*150/(dxs*dxs+dys*dys+150*150)+3);
  }
  if(carrier.active&&carrier.phase<2){
    const H=gh(carrier.x,carrier.y),key=dropFactionKey(carrier.fac);
    const hover=carrier.phase===1? 26+Math.sin(t*1.5)*2.4 : 0;
    const flightAlt=carrierEffectiveAlt();
    const alt=H+flightAlt*0.85+hover;
    const dx=carrier.tx-carrier.x, dy=carrier.ty-carrier.y;
    const moving=Math.hypot(dx,dy)>10;
    const thrust=flightAlt>0?1:(moving?0.8:0.36);
    const vtolPose=clamp(flightAlt/Math.max(1,CARRIER_CRUISE_ALT),0,1);
    drawDropCraft(key,carrier.x,carrier.y,alt,carrier.ang,t,255,
                  carrier.phase===1&&flightAlt<8,thrust,vtolPose);
  }

  /* Enemy headquarters retain their own landed craft during the player's
     planning phase, then visibly lift away at match start. This is a bounded
     arrival cue, not a second interactive carrier simulation. */
  for(const A of aiDeployArrivals){
    if(!vis(A.x,A.y,150)||!fogPointVisible(A.x,A.y)) continue;
    const elapsed=A.depart?Math.max(0,t-A.depart):0;
    if(elapsed>8) continue;
    const fade=A.depart?clamp(1-elapsed/8,0,1):1;
    const rise=A.depart?elapsed*elapsed*11:0;
    const drift=A.depart?elapsed*13:0;
    const x=A.x+Math.cos(A.ang)*drift,y=A.y+Math.sin(A.ang)*drift;
    const alt=gh(A.x,A.y)+28+Math.sin(t*1.35+A.x*.01)*1.6+rise;
    drawDropCraft(A.fac,x,y,alt,A.ang,t,255*fade,!A.depart||elapsed<.8,.48+fade*.35,
                  clamp(rise/Math.max(1,CARRIER_CRUISE_ALT),0,1));
    if(!A.depart||elapsed<1.3){
      const P=DROP_PROFILE[dropFactionKey(A.fac)];
      bbAdd.add(sprites.glow,A.x,A.y,gh(A.x,A.y)+1.1,12,0,P.glow[0],P.glow[1],P.glow[2],24*fade);
    }
  }

  // ---------------- units ----------------
  const step=teamCount[2]>9000?2:1;
  /* Resolved once per frame, not per unit: the equipped module set only changes
     between matches, and modAttachSync() short-circuits on an unchanged
     signature so this is a string compare in the steady state. */
  const modKit=(typeof modAttachSync==='function')?modAttachSync():[];
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]) continue;
    const X=ux[i], Y=uy[i];
    const T=TYPES[utype[i]],uImportant=usel[i]||i===heroIdx||T.cat==='hero'||(typeof isEnemyCommander==='function'&&isEnemyCommander(i));
    const uLod=renderBand(X,Y,80,uImportant);
    if(!uLod) continue;
    if(!fogEntityVisible(uteam[i],X,Y)) continue;
    if(uteam[i]===2 && step>1 && (i&1)) continue;
    /* Enemy factions field DIFFERENT HARDWARE, not a recolour: the Syndicate
       hovers on plenum skirts with coil emitters, the Horde is grown carapace
       and claws. You should know what you're fighting from the silhouette
       before the colour registers. */
    /* Team 0 was hard-wired to the Nova kit, which is what made the player's
       own faction choice cosmetic. Both sides now resolve their kit the same
       way, from whichever faction is actually fielding the unit. */
    const ownFac=(typeof playerFaction!=='undefined'&&playerFaction)||'nova';
    const ownKit=(typeof playerKitKey==='function')?playerKitKey():
      ((typeof FACTIONS!=='undefined'&&FACTIONS[ownFac]&&FACTIONS[ownFac].kit)||'nova');
    const unitKit=uteam[i]===0?ownKit:uteam[i]===2?'horde':
      (uteam[i]===1&&AI.fac&&FACTIONS[AI.fac]?FACTIONS[AI.fac].kit:null);
    /* STRATEGIC TIER. Past the point where this unit's own footprint stops
       reading (~24 px fading to ~15 px — per type, not per camera constant) a
       flat symbol carries role and allegiance better than a smear of mesh.
       The plate silhouette is the FACTION and the glyph is the role, so an
       icon claims the same allegiance its mesh would; resolved from the same
       unitKit the 3D path uses rather than a parallel guess.

       Sited after the kit resolves but before factionUnitMeshFor(), so a fully
       iconised unit still skips the mesh lookup, doctrine shells, equipped
       modules and organic motion — the tier saves CPU as well as pixels.

       The mesh is never faded, only dropped: the icon reaches full opacity
       while the mesh is still a ~15 px smear, and fading a mesh by screen
       footprint is precisely what flattened every building in
       docs/POSTMORTEM-1.33.31-REGRESSION.md. */
    const uIcon=(typeof mfIconQ==='function')?mfIconQ(mfUnitSpan(T)):0;
    /* A commander is marked on a ramp of its own, and ONLY marked: uMark drives
       the symbol's alpha while uIcon alone still decides whether the mesh is
       dropped below. Overloading one q for both would delete the commander's
       silhouette the moment it earned a badge — at SPAN_MIN that is a 229 px
       hero replaced by a 46 px plate. The icon layers OVER the mesh here; it
       never replaces or fades one (docs/POSTMORTEM-1.33.31-REGRESSION.md). */
    const uCmdQ=(typeof mfCmdIconQ==='function')?mfCmdIconQ(T):0;
    const uMark=uIcon>uCmdQ?uIcon:uCmdQ;
    const stackSkip=typeof mfIconStackSkip==='function'&&mfIconStackSkip(i);
    if(uMark>0&&!stackSkip&&mfIconEnsure()){
      const ih=unitGroundY(T,X,Y,i)+2,
            body=mfIconBody(uteam[i]), ink=mfIconInk(uteam[i]),
            dpx=(typeof mfIconDpx==='function')?mfIconDpx(T)
                :clamp(18+mfUnitSpan(T)*0.12,22,40)*mfWorldPx(),
            ia=255*uMark,
            iKit=unitKit||(uteam[i]===2?'horde':null);
      bbIcon.add(mfIconPlateFor(iKit,T),X,Y,ih,dpx,0,body[0],body[1],body[2],ia);
      /* iKit again, not a second guess: the glyph is the owner's delivered
         faction art and must claim the same allegiance the plate does. A kit
         with no art for this role falls back to the procedural glyph inside
         mfIconCellForUnit, so this stays one lookup and one instance. */
      bbIcon.add(mfIconCellForUnit(T,iKit),X,Y,ih,dpx*0.60,0,ink[0],ink[1],ink[2],ia);
      /* Selected mass at cap: the plate already shows allegiance. A ring on
         every selected icon is the same fillrate trap as FX.ring. Keep
         commanders. Skip unselected (uImportant), skip command-zoom mass,
         keep the ring for small on-camera squads. */
      if(uImportant&&(ringKeepCmd(i)||(!RING_STRATEGIC&&selOnCam<=SEL_RING_LOD&&usel[i]))){
        const br=(typeof TEAMB!=='undefined'&&TEAMB[uteam[i]])||body;
        bbIcon.add(MF_ICO.pl_ring,X,Y,ih,dpx*1.26,0,br[0],br[1],br[2],ia);
      }
      if(uIcon>=1) continue;          // fully iconised: no mesh work at all
    }
    if(stackSkip) continue;
    /* Never begin from UNIT_MESH and then hope an override exists. That made
       the mixed global registry an accidental cross-faction fallback: Blue
       slot 12 became a Ravager and a missing Brood slot became a tank. */
    let M=unitKit&&typeof factionUnitMeshFor==='function'?factionUnitMeshFor(utype[i],unitKit):null;
    /* Per-instance kit, keyed by that hero's commanderId. Player uses
       playerCommanderId; enemy/ally seats use AI.bases/allies.commanderId.
       Replacing FAC_MESH[type] would retint every chassis of that type. */
    if((T.cat==='hero'||T.hero||utype[i]===4||utype[i]===28||utype[i]===29)&&typeof commanderKitMeshFor==='function'){
      const cid=typeof commanderIdForUnit==='function'?commanderIdForUnit(i):
        (i===heroIdx&&typeof playerCommanderId!=='undefined'?playerCommanderId:null);
      if(cid){ const KM=commanderKitMeshFor(cid); if(KM) M=KM; }
    }
    if(!M) continue;
    const tc=TEAMC[uteam[i]];
    const H=unitGroundY(T,X,Y,i);
    /* Drawn deliberately LARGER than their collision size. At command-view
       zoom a literally-scaled tank is about twenty pixels across, which is
       not enough to read a silhouette; every RTS oversizes units for
       legibility and keeps the sim honest underneath. */
    const sc=T.size/15*M.s*1.5*(T.vscale||1);
    const a=umode[i]===4?110:255;
    // wildlife pulses and lurches; machines don't
    let ss=sc, wide=sc, doctrine=null;
    if(uteam[i]===2) ss*=1+Math.sin(t*6.2+i*2.399)*0.07;
    /* ai.js already authored scale/squash as faction doctrine, but only the old
       sprite fallback consumed it.  Applying it to the live WebGL path makes
       Ascendancy armour columns broad/heavy, Coalition hulls compact/narrow,
       and Brood bodies visibly small and numerous.  A light geometry shell is
       added only where no bespoke faction chassis exists, so artillery stays
       artillery rather than every role becoming the same faction tank. */
    const bespoke=M!==UNIT_MESH[utype[i]],heroUnit=T.cat==='hero'||!!T.hero||utype[i]===4||i===heroIdx||isEnemyCommander(i);
    /* Doctrine shells exist to keep a SHARED role chassis faction-readable.
       Commanders already have authored silhouettes. Layering the generic
       ground shell over a walking hero created a second rigid vehicle whose
       rails stayed planted while the Commander's legs moved beneath it. */
    if(uteam[i]===0&&!heroUnit&&utype[i]<28&&utype[i]!==12&&utype[i]!==13&&!bespoke&&FAC_DOCTRINE_MESH[ownFac]){
      doctrine=FAC_DOCTRINE_MESH[ownFac][T.air?'air':'ground'];
      const PF=FACTIONS[ownFac];
      if(PF&&ownFac!=='nova'){ ss*=PF.scale||1; wide=ss/(PF.squash||1); }
    }else if(uteam[i]===1&&typeof FACTIONS!=='undefined'&&FACTIONS[AI.fac]){
      const F=FACTIONS[AI.fac];
      ss*=F.scale||1;
      wide=ss/(F.squash||1);
      if(!heroUnit&&!bespoke&&utype[i]<28&&FAC_DOCTRINE_MESH[F.kit])
        doctrine=FAC_DOCTRINE_MESH[F.kit][T.air?'air':'ground'];
    }else wide=ss;
    const crashing=T.air&&typeof uCrash!=='undefined'&&uCrash[i];
    const bank=T.air?(crashing?(typeof uCroll!=='undefined'?uCroll[i]:0):Math.sin(t*1.7+i)*0.10):0;
    const crashYaw=crashing&&typeof uCpitch!=='undefined'?uCpitch[i]*0.38:0;
    /* Walk phase. Driven by DISTANCE covered rather than by the clock, so a
       damaged or slowed machine takes shorter strides instead of moon-walking,
       and a stationary one plants its feet. Legged units only — anything on
       tracks, wheels, wings or a plenum skirt passes zero and the vertex stage
       leaves it alone. */
    const organic=uteam[i]===2||(uteam[i]===1&&AI.fac==='horde')||utype[i]===12||utype[i]===13||utype[i]===30;
    /* Procedural spring phase replaces per-bone CPU simulation. Tactical view
       gets breathing, mandible lag and flexible limbs; strategic/low quality
       supplies zero so the shader skips all secondary-motion math. */
    const organicSpan=(typeof GFX!=='undefined'&&GFX.organicSpan!=null)?GFX.organicSpan:2700;
    const organicPhase=organic&&perfScale>.36&&orthoSpan<organicSpan
      ? t*(umov[i]?6.8:2.15)+i*1.618+(uwalk[i]||0)*.45 : 0;
    const anim=organicPhase||((T.legs&&umov[i])?(uwalk[i]||1e-4):0);
    const bob=T.air&&!crashing?Math.sin(t*2.1+i)*2.4:0;
    const damageState=Math.min(.999,1-clamp(uhp[i]/Math.max(1,uhpm[i]),0,1));
    /* Commanders are the first live custom V2 profile. This covers Nova,
       Dominion and Syndicate commanders without forcing their unrelated meshes
       into one material or splitting each army into additional draw calls. */
    const surfaceState=(heroUnit?2:0)+damageState;
    M.hull.add(X,Y,H+bob,ss,uang[i]-Math.PI/2+bank+crashYaw,tc[0],tc[1],tc[2],a,wide,anim,surfaceState);
    if(M.tur) M.tur.add(X,Y,H+M.turH*ss,ss,uturr[i]-Math.PI/2,tc[0],tc[1],tc[2],a,wide,organicPhase,surfaceState);
    csmMarkUnitSkin(M,T,heroUnit,X,Y);
    if(doctrine) doctrine.add(X,Y,H+bob,ss,uang[i]-Math.PI/2+bank+crashYaw,tc[0],tc[1],tc[2],a,wide,undefined,surfaceState);
    /* Crafted modules are hardware, so the army wears it. Player machines only:
       the enemy is not fitted with your loadout, and a mounting bracket on a
       brood organism is not a thing. Empty when nothing is equipped, which is
       the common case and costs one array-length test per unit. */
    if(uLod===2&&modKit.length&&uteam[i]===0&&!T.brood){
      for(let k=0;k<modKit.length;k++){
        const K=modKit[k], am=K.mesh[modAttachVariant(i,k,K.mesh.length)];
        /* M.turH is the hull's own deck line — the height the game already
           uses to sit a turret on this chassis. Mounting from there is what
           makes the kit look bolted on instead of hovering. */
        /* Mounted hardware belongs to the upper chassis. Passing zero here
           made it hover rigidly while a legged unit's body bobbed underneath;
           the shared phase gives non-SERVO attachment vertices the same body
           motion without treating the equipment itself as another leg. */
        /* A module is readable equipment, not a second vehicle. The generic
           vehicle rule multiplied it by the Commander's already-large scale
           and mounted it at a tank turret height, producing an oversized
           rigid-looking block around the legs. Heroes get a torso hardpoint
           and a bounded accessory scale; the low-profile Syndicate Archon has
           its own deck height because it hovers instead of standing upright. */
        const heroMount=T.hero==='syndicate'?5.8:15.2;
        const mountH=heroUnit?heroMount:(M.turH||2.6);
        const heroGearScale=T.hero==='syndicate'?.42:.58;
        const gearScale=ss*K.s*(heroUnit?heroGearScale:1);
        am.add(X,Y,H+bob+(mountH+K.h)*ss,gearScale,uang[i]-Math.PI/2+bank,
               K.col[0],K.col[1],K.col[2],a,heroUnit?gearScale:wide,anim);
      }
    }
  }
  if(typeof mfIconStackDraw==='function') mfIconStackDraw(gh);
  if(typeof csmBegin==='function'&&typeof csmActive==='function'&&csmActive()&&csmBegin(false)){
    csmDrawUnitCasters();
    csmDrawModuleCasters();
    csmEnd(S_nA);
  }
  begin3D(S_nA);
  if(modKit.length&&typeof modAttachFlush==='function') modAttachFlush();
  for(const M of UNIT_MESH){ if(!M) continue; M.hull.flush(gl); if(M.tur) M.tur.flush(gl); }
  for(const k in FAC_MESH) for(const ty in FAC_MESH[k]){
    const M=FAC_MESH[k][ty]; M.hull.flush(gl); if(M.tur) M.tur.flush(gl);
  }
  if(typeof commanderKitMeshFlush==='function') commanderKitMeshFlush();
  for(const k in FAC_DOCTRINE_MESH){
    FAC_DOCTRINE_MESH[k].ground.flush(gl); FAC_DOCTRINE_MESH[k].air.flush(gl);
  }

  /* ---------------- ground overlays ------------------------------------
     Selection markers, the build territory and the placement ghost are all
     translucent decals lying on the terrain, so they need the blend state on.
     Drawn in the opaque pass they came out as a solid wash of colour that hid
     the entire map. Depth test stays on so a marker behind a hill is hidden;
     depth WRITE goes off so overlapping decals don't fight each other. */
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  /* ---- AMBIENT OCCLUSION -------------------------------------------------
     Resolved here: after every opaque surface is down, before any decal, water
     or glow. Overlays and effects then draw on top with the same depth buffer,
     so a selection ring or an explosion never picks up a contact shadow. */
  if(typeof csmApply==='function'&&csmApply()) begin3D(S_nA);
  if(aoActive){
    /* Tint toward a lifted sky, not 0.45*albedo. The old mix(c*sky, c, ao)
       with 80% occlusion crushed noon buildings into silhouettes. */
    aoResolve([
      Math.min(1, Sun.sky[0]*0.22+0.78),
      Math.min(1, Sun.sky[1]*0.22+0.80),
      Math.min(1, Sun.sky[2]*0.22+0.84)
    ]);
    /* aoResolve leaves the fullscreen AO program current. Everything below —
       selection rings, the build territory, the placement ghost — is real
       geometry drawn with the MODEL program, and was silently being issued
       against the post-process shader instead. That is why placing a structure
       showed no highlight and no ghost. */
    begin3D(S_nA);
  }

  // ---------------- selection + orders (flat geometry on the ground) --------
  /* Stage 1: skip unselected (usel) and off-screen (vis). Command zoom keeps
     commanders only. Tactical mass above SEL_RING_LOD collapses to one ring
     per view-sized cell — same pattern as health bars. */
  {
    const putSelRing=i=>{
      const T=TYPES[utype[i]];
      FX.ring.add(ux[i],uy[i],gh(ux[i],uy[i])+1.4,T.size*(T.vscale||1)*1.05,0,90,255,150,210);
    };
    if(RING_STRATEGIC){
      for(let i=0;i<unitHigh;i++){
        if(!ualive[i]||!usel[i]||!vis(ux[i],uy[i],40)) continue;
        if(ringKeepCmd(i)) putSelRing(i);
      }
    } else if(typeof mfIconStackOn==='function'&&mfIconStackOn()&&typeof mfIconStackRingLeads==='function'){
      /* Stacked rings: one per proximity cell, plus commanders. Reuses the
         stack rebuild; does not revert SEL_RING_LOD for the unstacked band. */
      const leads=mfIconStackRingLeads(vis, ringKeepCmd)||[];
      for(let h=0;h<leads.length;h++){
        const lead=leads[h], C=typeof mfIconStackCentroid==='function'?mfIconStackCentroid(lead):[ux[lead],uy[lead],1];
        const T=TYPES[utype[lead]], r=T.size*(T.vscale||1)*1.05*(1+Math.min(0.8,Math.log(C[2]||1)*0.35));
        FX.ring.add(C[0],C[1],gh(C[0],C[1])+1.4,r,0,90,255,150,210);
      }
      for(let i=0;i<unitHigh;i++){
        if(!ualive[i]||!usel[i]||!vis(ux[i],uy[i],40)) continue;
        if(ringKeepCmd(i)) putSelRing(i);
        else if(typeof mfIconStackSkip!=='function'||!mfIconStackSkip(i)) putSelRing(i);
      }
    } else if(selOnCam>SEL_RING_LOD){
      if(_hbI.length<unitHigh) _hbI=new Int32Array(unitHigh);
      let n=0;
      for(let i=0;i<unitHigh;i++){
        if(!ualive[i]||!usel[i]||!vis(ux[i],uy[i],40)) continue;
        if(ringKeepCmd(i)){ putSelRing(i); continue; }
        _hbI[n++]=i;
      }
      const cell=Math.max(48,orthoSpan/17);
      _hbCells.clear();
      for(let k=0;k<n;k++){
        const i=_hbI[k], key=((uy[i]/cell)|0)*8192+((ux[i]/cell)|0);
        if(!_hbCells.has(key)) _hbCells.set(key,i);
      }
      for(const i of _hbCells.values()) putSelRing(i);
    } else if(selOnCam){
      for(let i=0;i<unitHigh;i++){
        if(!ualive[i]||!usel[i]||!vis(ux[i],uy[i],40)) continue;
        putSelRing(i);
      }
    }
  }
  /* ---- FORMATION + PATROL ORDERS ---------------------------------------
     The sprite fallback already drew these cues, but the active mesh renderer
     never did, so a committed route disappeared on every current device. Keep
     them on the terrain/decal pass: they inherit depth, survive camera tilt,
     and cannot become another screen-space HUD pile. */
  {
    const p3Paths=!(META&&META.settings&&META.settings.orderPaths===false);
    const p3Route=(pts,closed,draft,activeStep)=>{
      if(!pts||pts.length<2)return;
      const segs=closed?pts.length:pts.length-1,base=draft?[92,224,255]:[100,245,170];
      for(let j=0;j<segs;j++){
        const A=pts[j],B2=pts[(j+1)%pts.length],dx=B2.x-A.x,dy=B2.y-A.y,len=Math.hypot(dx,dy);
        if(len<4)continue;
        const active=activeStep!=null&&(j+1)%pts.length===activeStep,col=active?[255,202,82]:base;
        const mx=(A.x+B2.x)*.5,my=(A.y+B2.y)*.5;
        if(vis(mx,my,len*.55+30)){
          FX.line.add(mx,my,gh(mx,my)+3.2,len,Math.atan2(dy,dx),col[0],col[1],col[2],active?225:(draft?175:105),active?4.4:(draft?3.2:2.4));
          /* Chevrons, not rings. A ring travelling down a line tells you the
             route is live but not which way the column is going; on a closed
             patrol loop that is the only question worth answering. Two short
             arms swept back from a moving tip read as an arrowhead at command
             zoom without needing a sprite or a glyph atlas. */
          const ang=Math.atan2(dy,dx);
          for(let q=0;q<3;q++){
            const f=(t*.32+q/3+j*.11)%1,px3=A.x+dx*f,py3=A.y+dy*f;
            if(!vis(px3,py3,20))continue;
            const ph=gh(px3,py3)+3.7,arm=active?5.4:3.9,aw=active?2.6:1.9;
            const aa=active?215:145;
            for(const sgn of [1,-1]){
              const a2=ang+sgn*2.44;                     // ~140 deg swept back
              const ex=px3+Math.cos(a2)*arm, ey=py3+Math.sin(a2)*arm;
              FX.line.add((px3+ex)*.5,(py3+ey)*.5,ph,arm,a2,col[0],col[1],col[2],aa,aw);
            }
          }
        }
      }
      for(let j=0;j<pts.length;j++){
        const P=pts[j];if(!vis(P.x,P.y,35))continue;
        const active=j===activeStep,col=active?[255,202,82]:base,pulse=(active?8.5:5.8)+Math.sin(t*4+j)*(active?1.4:.7);
        FX.ring.add(P.x,P.y,gh(P.x,P.y)+4.0,pulse,t*.3,col[0],col[1],col[2],active?245:(draft?210:165));
      }
    };
    if(p3Paths){
      const seen={};
      for(let i=0;i<unitHigh;i++){
        if(!ualive[i]||!usel[i]||ustate[i]!==5)continue;
        const ri=uPatrolRoute[i],R=ri>=0?patrolRoutes[ri]:null;
        if(R&&R.pts&&!seen[ri]){
          seen[ri]=1;p3Route(R.pts,true,false,R.step);
          const row=R.targets&&R.targets[R.step];
          if(row){
            const stride=Math.max(1,Math.ceil(row.length/36));
            for(let k=0;k<row.length;k+=stride){
              const P=row[k];if(vis(P.x,P.y,24))FX.ring.add(P.x,P.y,gh(P.x,P.y)+4.4,3.7,t*.45+k*.07,255,212,96,175);
            }
          }
        } else if(ri<0){
          const dx=upx2[i]-upx1[i],dy=upy2[i]-upy1[i];
          if(Math.hypot(dx,dy)>=10)p3Route([{x:upx1[i],y:upy1[i]},{x:upx2[i],y:upy2[i]}],true,false,null);
        }
      }
      if(typeof patrolDraft!=='undefined'&&patrolDraft)p3Route(patrolDraft.pts,patrolDraft.pts.length>2,true,null);
    }
    /* RALLY FLAGS. The sprite path drew these (hud.js:900) but that whole
       renderer is dead code, so a rally point was invisible in every shipped
       build even though the panel button reported "RALLY SET — TAP TO MOVE".
       Ground decals, so they inherit depth and survive camera tilt. */
    for(const Bd of blds){
      if(!Bd.alive||Bd.team!==0||!Bd.rally)continue;
      const R2=Bd.rally;
      if(!vis(R2.x,R2.y,40))continue;
      const rh=gh(R2.x,R2.y),rp=0.55+0.45*Math.sin(t*3.1+R2.x*0.01);
      FX.ring.add(R2.x,R2.y,rh+3.4,7.4+rp*1.6,t*0.5,120,255,170,195);
      FX.ring.add(R2.x,R2.y,rh+3.0,12.6,-t*0.28,120,255,170,80);
      bbAdd.add(sprites.glow,R2.x,R2.y,rh+7,7+rp*2,0,120,255,170,62);
      /* Line back to its factory only while that factory's panel is open —
         the same rule the sprite path used, so ten factories do not draw ten
         permanent leashes across the base. */
      if(openBld>=0&&blds[openBld]===Bd){
        const mx=(Bd.x+R2.x)*.5,my=(Bd.y+R2.y)*.5;
        const rl=Math.hypot(R2.x-Bd.x,R2.y-Bd.y);
        if(rl>6)FX.line.add(mx,my,gh(mx,my)+3.0,rl,Math.atan2(R2.y-Bd.y,R2.x-Bd.x),120,255,170,72,2.2);
      }
    }
    const now3=performance.now(),confirm3=typeof orderConfirm!=='undefined'&&orderConfirm&&now3<orderConfirm.until;
    if(typeof orderConfirm!=='undefined'&&orderConfirm&&!confirm3)orderConfirm=null;
    const form3=(typeof orderPreview!=='undefined'&&orderPreview)||(confirm3?orderConfirm:null);
    if(form3&&!(META&&META.settings&&META.settings.formationPreview===false)){
      const members=form3.members.filter(i=>ualive[i]&&usel[i]),fd=FORMS[form3.form]||FORMS[0];
      /* Memoised in input.js: the assignment only changes when the target or
         the group does, not once per frame. */
      const slots=formationPreviewSlots(form3,members,fd.id);
      let cx3=0,cy3=0;for(const i of members){cx3+=ux[i];cy3+=uy[i];}
      if(members.length){
        cx3/=members.length;cy3/=members.length;
        const dx=form3.x-cx3,dy=form3.y-cy3,len=Math.hypot(dx,dy),fade=orderPreview?1:clamp((form3.until-now3)/950,0,1);
        /* noLine: a tap-move confirm whose real route is drawn by orderfx -
           the straight beam would contradict the traced path around water. */
        if(len>3&&!form3.noLine)FX.line.add((cx3+form3.x)*.5,(cy3+form3.y)*.5,gh((cx3+form3.x)*.5,(cy3+form3.y)*.5)+3.5,
          len,Math.atan2(dy,dx),88,224,255,145*fade,3.2);
        FX.ring.add(form3.x,form3.y,gh(form3.x,form3.y)+4.2,9.2,t*.8,95,235,255,230*fade);
        for(let k=0;k<slots.length;k++){
          const P=slots[k],T=TYPES[utype[members[k]]];
          if(vis(P.x,P.y,T.size+20))FX.ring.add(P.x,P.y,gh(P.x,P.y)+4.6,Math.max(4.2,T.size*.62),t*.45+k*.08,105,238,255,205*fade);
        }
      }
    }
    if(typeof moveFxDraw==='function')moveFxDraw(vis,t);
  }
  /* ---- CHARGED ARTILLERY FIRE PLAN -------------------------------------
     Preview the exact six impact footprints and each participating battery's
     reach. During the interruptible charge the same geometry fills and brightens
     instead of replacing the plan with a generic spinner. */
  {
    const A=(aiming===5&&artBarrageAim)?artBarrageAim:artBarrageCharge;
    if(A){
      const pts=A.pattern||artBarragePattern(A.x,A.y);
      const prog=artBarrageCharge?clamp(artBarrageCharge.t/artBarrageCharge.total,0,1):0;
      if(vis(A.x,A.y,ART_BARRAGE.spread+ART_BARRAGE.aoe+40)){
        FX.ring.add(A.x,A.y,gh(A.x,A.y)+4,(ART_BARRAGE.spread+ART_BARRAGE.aoe)/3,
          t*.34,255,166,62,145+prog*80);
        for(let k=0;k<pts.length;k++){
          const P=pts[k];if(!vis(P.x,P.y,ART_BARRAGE.aoe+20))continue;
          FX.ring.add(P.x,P.y,gh(P.x,P.y)+4.5,ART_BARRAGE.aoe/3,
            -t*.65+k*.22,255,210,92,175+prog*65);
          bbAdd.add(sprites.glow,P.x,P.y,gh(P.x,P.y)+8,5+prog*5,0,255,116,38,105+prog*105);
        }
      }
      const src=artBarrageCharge?artBarrageCharge.members.map(m=>m.i):artBarrageSelected();
      for(const i of src){
        if(!ualive[i]||uteam[i]!==0||TYPES[utype[i]].cat!=='art')continue;
        const len=Math.hypot(A.x-ux[i],A.y-uy[i]);
        if(vis(ux[i],uy[i],ART_BARRAGE.range+30)&&aiming===5)
          FX.ring.add(ux[i],uy[i],gh(ux[i],uy[i])+2.8,ART_BARRAGE.range/3,0,255,184,70,28);
        if(vis((ux[i]+A.x)*.5,(uy[i]+A.y)*.5,len*.5+20))
          FX.line.add((ux[i]+A.x)*.5,(uy[i]+A.y)*.5,gh((ux[i]+A.x)*.5,(uy[i]+A.y)*.5)+5,
            len,Math.atan2(A.y-uy[i],A.x-ux[i]),255,184,68,48+prog*105,2.5+prog*2.2);
        if(vis(ux[i],uy[i],40)){
          const S=TYPES[utype[i]].size*(1.05+prog*.32);
          FX.ring.add(ux[i],uy[i],gh(ux[i],uy[i])+4,S,t*(.5+prog),255,197,82,160+prog*85);
          bbAdd.add(sprites.glow,ux[i],uy[i],gh(ux[i],uy[i])+TYPES[utype[i]].size*.7,
            6+prog*12,0,255,145,42,75+prog*130);
        }
      }
    }
  }
  /* ---- DEFENCE COVERAGE -------------------------------------------------
     Opening a defensive structure is the player's explicit request for its
     tactical detail, so show its live range and nearby overlapping fields at
     that moment. Placement does the same before money is committed. Rings use
     the renderer's authored 3x decal scale (hence /3), matching the true sim
     radius instead of the oversized circles used by the old placement HUD. */
  const openDef=openBld>=0&&blds[openBld]&&blds[openBld].alive?blds[openBld]:null;
  const placeDef=placing&&DEF_WEAPON_DATA[placing.type]?placing:null;
  const coverAnchor=placeDef||((openDef&&DEF_WEAPON_DATA[openDef.type])?openDef:null);
  if(coverAnchor){
    const ax=coverAnchor.x,ay=coverAnchor.y;
    for(const B of bldLive){
      if(!B.alive||B.team!==0||B.prog<1||!DEF_WEAPON_DATA[B.type]||!vis(B.x,B.y,620)) continue;
      if(B!==openDef&&dist2(ax,ay,B.x,B.y)>720*720) continue;
      const W=bldWeaponSnapshot(B,B.lvl||1),sel=B===openDef;
      FX.ring.add(B.x,B.y,gh(B.x,B.y)+2.1,W.range/3,t*.08,74,204,255,sel?185:48);
      if(W.minRange) FX.ring.add(B.x,B.y,gh(B.x,B.y)+2.4,W.minRange/3,-t*.12,255,118,76,sel?145:32);
    }
    if(placeDef){
      const ghost={type:placeDef.type,lvl:1,team:0,boost:0,boostM:UPLINK_BOOST};
      const W=bldWeaponSnapshot(ghost,1);
      FX.ring.add(placeDef.x,placeDef.y,gh(placeDef.x,placeDef.y)+2.5,W.range/3,t*.12,90,235,150,205);
      if(W.minRange) FX.ring.add(placeDef.x,placeDef.y,gh(placeDef.x,placeDef.y)+2.8,W.minRange/3,-t*.18,255,118,76,160);
    }
  } else if(openDef&&(openDef.type==='sgen'||openDef.type==='uplink')){
    const S=bldSupportSnapshot(openDef,openDef.lvl||1),col=openDef.type==='sgen'?[88,235,178]:[92,205,255];
    FX.ring.add(openDef.x,openDef.y,gh(openDef.x,openDef.y)+2.2,S.field/3,t*.1,col[0],col[1],col[2],185);
  }
  for(const B of bldLive){
    if(B.alive&&B.type==='techlab'&&B.guardT>0&&vis(B.x,B.y,120)){
      const p=.65+.35*Math.sin(t*7+B.x*.01);
      FX.ring.add(B.x,B.y,gh(B.x,B.y)+2.7,(BT.techlab.size*1.65)/3,-t*.7,95,225,255,130+90*p);
      FX.ring.add(B.x,B.y,gh(B.x,B.y)+3.0,(BT.techlab.size*1.15)/3,t*.9,255,220,105,95+75*p);
    }
  }
  /* The warning corridor ends at the threatened player position and only
     extends a few hundred metres outward. It communicates approach direction
     without drawing a breadcrumb trail back to an unseen enemy base. */
  if(typeof waveThreat!=='undefined'&&waveThreat&&stats.t<=waveThreat.expires){
    const W=waveThreat,ang=Math.atan2(W.dy,W.dx),px=-W.dy,py=W.dx,p=.65+.35*Math.sin(t*5.5);
    FX.ring.add(W.x,W.y,gh(W.x,W.y)+2.7,27+3*p,-t*.35,255,174,70,155+70*p);
    for(const side of [-1,1]){
      const mx=W.x+W.dx*235+px*side*42,my=W.y+W.dy*235+py*side*42;
      FX.line.add(mx,my,gh(mx,my)+2.5,350,ang,255,154,58,62+40*p,2.0);
    }
    for(let k=0;k<4;k++){
      const d=95+k*82,x=W.x+W.dx*d,y=W.y+W.dy*d;
      FX.line.add(x,y,gh(x,y)+3,48,ang,255,202,92,125+60*p,3.0);
    }
  }
  /* ---- BUILD TERRITORY -------------------------------------------------
     Drawn straight from the rasterised zone grid, so what you see is exactly
     what placementValid() enforces. A cell whose neighbour is outside the zone
     contributes a border segment; the result is a hard rectilinear frontier
     that grows in squares as you plant Uplinks, instead of a smear of circles
     that never matched the rule.                                          */
  /* The placement UI already draws the exact local grid, invalid footprint
     cells, alignment guides and builder ranges in hud.js. Scanning the full
     raster territory here as well emitted thousands of plates/lines per frame
     and made the battle appear frozen until the player hit X. The expensive
     frontier is now only a short change pulse; placement keeps its precise
     local feedback below. */
  /* The `&&!placing` that used to be here hid the whole territory overlay the
     instant the player picked up a ghost — i.e. exactly when "where may I
     build?" is the only question being asked. The comment justifying it said
     the placement UI already draws the local grid and invalid cells "in
     hud.js"; that code lives inside renderLegacySprites, which is called from
     nowhere (only a test touches it via .toString()). So the justification was
     void and the player got only the ghost outline. Keep the zone up while
     placing — it is the whole point of it. */
  if(bzShow>0){
    const glow=bzShow;
    /* Mobile builder zones are drawn directly rather than rasterised into the
       static grid: they move every frame, and re-stamping a 37k-cell grid at
       frame rate to chase two units would be absurd. */
    forBuilders(0,(bx,by,r)=>{
      for(const [ex,ey,rot2] of [[0,-r,0],[0,r,0],[-r,0,Math.PI/2],[r,0,Math.PI/2]])
        FX.line.add(bx+ex,by+ey,gh(bx+ex,by+ey)+2.4,r*2,rot2, 130,235,190, 190*glow, 3.0);
      FX.ring.add(bx,by,gh(bx,by)+1.8, 22, t*0.9, 130,235,190, 150*glow);
    });
    const cx0=Math.max(0,bzG(x0)-1), cx1=Math.min(BZN-1,bzG(x1)+1);
    const cy0=Math.max(0,bzG(y0)-1), cy1=Math.min(BZN-1,bzG(y1)+1);
    const pulse=0.55+Math.sin(t*2.4)*0.2;
    let drawn=0;
    for(let gy=cy0;gy<=cy1&&drawn<9000;gy++) for(let gx=cx0;gx<=cx1;gx++){
      const st=bzAt(gx,gy);
      if(st===BZ_OUT) continue;
      const wx=bzW(gx), wy=bzW(gy), H=gh(wx,wy)+1.5;
      /* Blocked cells are called out individually in red — water, cliffs, and
         ground already occupied by a structure, ruin or resource node. Seeing
         WHY a spot is unavailable before you commit is the whole point;
         previously the only feedback was a rejection message after the fact. */
      const navalCell=false;
      if(st===BZ_BAD&&!navalCell){
        FX.plate.add(wx,wy,H+0.3,BZ*0.80,0, 255,70,60, 76*glow);
        // a diagonal slash reads as "occupied" at a glance, even in a solid block
        FX.line.add(wx,wy,H+0.6,BZ*1.15,Math.PI*0.25, 255,120,100, 150*glow, 2.2);
      } else if(((gx+gy)&1)===0){
        FX.plate.add(wx,wy,navalCell?1.0:H,BZ*0.62,0, navalCell?70:95,navalCell?230:205,255, (navalCell?48:30)*glow);
      }
      // border: a segment for every edge that leaves the territory entirely
      if(!bzIn(gx-1,gy)){ bzEdge(wx-BZ*0.5,wy,H+0.5,Math.PI/2,glow*pulse); drawn++; }
      if(!bzIn(gx+1,gy)){ bzEdge(wx+BZ*0.5,wy,H+0.5,Math.PI/2,glow*pulse); drawn++; }
      if(!bzIn(gx,gy-1)){ bzEdge(wx,wy-BZ*0.5,H+0.5,0,glow*pulse); drawn++; }
      if(!bzIn(gx,gy+1)){ bzEdge(wx,wy+BZ*0.5,H+0.5,0,glow*pulse); drawn++; }
    }
  }
  if(placing){
    const T=BT[placing.type];
    const ok=placementValid(), f=bldFoot(placing.type), rt=placing.rot||0;
    const H=T.placement==='water'?0:gh(placing.x,placing.y);
    const col=ok?[90,235,150]:[255,80,70];
    FX.plate.add(placing.x,placing.y,H+1.6,1,rt,col[0],col[1],col[2],255);
    const c2=Math.cos(rt), s2=Math.sin(rt);
    // footprint outline: four hairlines plus a facing tick down the front
    const edge=(ex,ey,len,r2)=>FX.line.add(placing.x+ex*c2-ey*s2, placing.y+ex*s2+ey*c2,
                                           H+2.2, len, rt+r2, col[0],col[1],col[2],255, 2.2);
    edge(0,-f[1]/2,f[0],0); edge(0,f[1]/2,f[0],0);
    edge(-f[0]/2,0,f[1],Math.PI/2); edge(f[0]/2,0,f[1],Math.PI/2);
    edge(f[0]*0.34,0,f[0]*0.3,0);
    /* The ghost is a promise about what is going to be there. Showing a Nova
       silo to a Brood player breaks that promise for the whole placement. */
    const M=(typeof bldMeshFor==='function'?bldMeshFor({type:placing.type,team:0}):null)||BLD_MESH[placing.type];
    if(M){ M.base.add(placing.x,placing.y,H,1,rt,col[0],col[1],col[2],200); M.base.flush(gl); }
  }
  /* Pull flat decals toward the camera so 24-bit depth does not stitch them
     into the terrain as cyan scanlines / broken C-rings. Depth TEST off as
     well: a ring of radius 50 sits at one world Y and still loses to kerbs
     and scar lips a few units taller than the node centre. */
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(-8,-32);
  FX.ring.flush(gl); FX.plate.flush(gl); FX.line.flush(gl);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.depthMask(true);
  gl.disable(gl.BLEND);


  // ---------------- water ----------------
  /* Bloom is extracted first so the ocean is not a bright-pass source.
     Depth stays the opaque scene, so hulls still occlude the sheet. */
  if(typeof mfGfxScissor==='function') mfGfxScissor(false);
  if(aoActive&&typeof aoExtractBloom==='function') aoExtractBloom();
  if(waterIdxCount){
    if((tick&3)===0) animateWater(t);
    queueWaterFx();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    drawWater();
    if(FX.wake||FX.ripple){
      gl.useProgram(progG);
      gl.uniformMatrix4fv(UG.uVP,false,matVP);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-8,-32);
      if(FX.wake) FX.wake.flush(gl);
      if(FX.ripple) FX.ripple.flush(gl);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  // ================= ADDITIVE EFFECTS =================
  gl.useProgram(progG);
  gl.uniformMatrix4fv(UG.uVP,false,matVP);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  queueBattlefieldEdgeGrid(t,vis);
  /* Mosswatch arrivals are tears between planes, not ordinary spawn flashes.
     Keep a bounded billboard/beam scar alive long enough for a player who taps
     the warning to actually see it. Fog still owns disclosure: a wound beyond
     allied vision cannot leak the enemy's position. */
  if(typeof storyCampaignRuntime!=='undefined'&&storyCampaignRuntime&&storyCampaignRuntime.rifts){
    for(const Rf of storyCampaignRuntime.rifts){
      const age=Math.max(0,(stats.t||0)-(Rf.t||0));
      if(age>42||!vis(Rf.x,Rf.y,170)||!fogPointVisible(Rf.x,Rf.y))continue;
      const life=clamp(1-age/42,0,1),pulse=.72+.28*Math.sin(t*7+Rf.x*.013),H=gh(Rf.x,Rf.y);
      FX.ring.add(Rf.x,Rf.y,H+2,46+Math.sin(t*3)*8,t*.32,188,72,255,135*life);
      FX.ring.add(Rf.x,Rf.y,H+3,72+age*1.4,-t*.21,255,54,105,76*life);
      bbAdd.add(sprites.glow,Rf.x,Rf.y,H+52,94*pulse,0,168,54,255,92*life);
      bbAdd.add(sprites.glow,Rf.x,Rf.y,H+68,42*pulse,0,255,78,134,155*life);
      for(let q=0;q<3;q++){
        const sway=Math.sin(t*(4.8+q*.7)+q*2.1)*13,off=(q-1)*16;
        addBeam3D(FX.beam,Rf.x+off,H+4,Rf.y,Rf.x+sway+off*.35,H+125+q*22,Rf.y+Math.cos(t*3+q)*9,
          5.5-q*.8,q===1?255:176,q===1?82:60,255,life*(q===1?215:118));
      }
      if(age<8)bbAdd.add(sprites.warn,Rf.x,Rf.y,H+150,25+pulse*6,-t*.45,255,104,182,225*life);
    }
  }
  /* At the strategic overview, thousands of individually correct glows placed
     on regimented formation rows merge into solid stripes. Sample the effects
     there; the full billboard stack returns automatically as the player zooms
     to tactical range. */
  const overviewVfx=orthoSpan>(typeof mfLodSpan==='function'?mfLodSpan(2400):2400);

  /* Pickup identity is carried above the physical pod, so a Mass Cache, scan
     beacon and NOVA code cylinder do not become the same gold box at command
     zoom. One marker plus a bounded number of rarity pips keeps this readable
     without adding meshes or draw calls per pickup. */
  for(const Cc of crates){
    if(Cc.alt>0||!vis(Cc.x,Cc.y,80)||(!fogPointVisible(Cc.x,Cc.y)&&!Cc.seen)) continue;
    const k=Cc.kind||CRATE_KINDS[0],cc=k.col||[255,225,140],H=gh(Cc.x,Cc.y),bob=Math.sin(t*2.4+Cc.x)*1.8;
    const mark=sprites[k.spr]||sprites.crate;
    bbAdd.add(sprites.glow,Cc.x,Cc.y,H+18+bob,58+(k.rarity||0)*7,0,cc[0],cc[1],cc[2],78);
    bbAdd.add(mark,Cc.x,Cc.y,H+35+bob,17+(k.rarity||0)*1.5,-t*.65,cc[0],cc[1],cc[2],235);
    FX.ring.add(Cc.x,Cc.y,H+2,27+(k.rarity||0)*3,t*.55,cc[0],cc[1],cc[2],135);
    if(Cc.site) FX.ring.add(Cc.x,Cc.y,H+2,42+Math.sin(t*2.2)*4,-t*.28,105,235,170,105);
    for(let q=0;q<Math.min(4,k.rarity||0);q++){
      const a=t*1.1+q*TAU/Math.max(1,k.rarity);
      bbAdd.add(sprites.glow,Cc.x+Math.cos(a)*21,Cc.y+Math.sin(a)*21,H+13,3.4,0,cc[0],cc[1],cc[2],220);
    }
  }

  /* Fault shelves and impact cells are world-space telegraphs.  Dormant faults
     are intentionally subtle route-planning information; once armed they gain
     two independently pulsing rings and a warning glyph that stays legible at
     mobile command zoom. Hidden terrain never leaks a fault through fog. */
  if(typeof HAZ!=='undefined'){
    for(const F of HAZ.faults||[]){
      if(!vis(F.x,F.y,F.r+30)||!fogPointVisible(F.x,F.y)||F.state===2) continue;
      const armed=F.state===1,H=gh(F.x,F.y),p=.5+.5*Math.sin(t*(armed?7:2)+F.x*.01);
      /* FX.ring's authored mesh is roughly three world radii wide; feed it a
         third of the simulation radius so the art matches the actual danger
         footprint instead of warning about safe ground. */
      FX.ring.add(F.x,F.y,H+2,F.r*(armed?.38:.33),t*.12,armed?255:188,armed?102:154,armed?62:92,armed?120+90*p:42);
      if(armed){
        FX.ring.add(F.x,F.y,H+3,F.r*(.25+p*.08),-t*.7,255,194,92,125);
        bbAdd.add(sprites.warn,F.x,F.y,H+36,22+p*5,t*.45,255,194,92,230);
      }
    }
    if(HAZ.warn>0) for(const C of HAZ.cells||[]){
      if(!vis(C[0],C[1],C[2]+40)||!fogPointVisible(C[0],C[1])) continue;
      const H=gh(C[0],C[1]),q=.5+.5*Math.sin(t*9);
      FX.ring.add(C[0],C[1],H+4,C[2]*(.29+q*.08),t*.8,C[3][0],C[3][1],C[3][2],150);
      bbAdd.add(sprites.warn,C[0],C[1],H+42,24+q*7,-t*.5,C[3][0],C[3][1],C[3][2],245);
    }
  }

  // Projectiles are directed shots: a velocity-aligned tracer from behind the
  // round to its head, plus a small spark at the tip. Rings, faction orbs and
  // GPU ember sprays around the body made volleys read as orbiting sparks.
  let projectileDrawn=0;
  const projectileLimit=overviewVfx?520:1800;
  for(let i=0;i<pHigh;i++){
    if(!palive[i]) continue;
    /* Strategic zoom may sample common rifle pellets, but artillery, rockets,
       missiles, Commander shells and high-damage rounds are tactical events
       and must never disappear. The former 1-in-16 blanket sample combined
       with a 14 fps phone to make whole battles look completely inert. */
    const essential=pBarrage[i]||pCannon[i]||pdmg[i]>=28||ptype[i]===2||ptype[i]===3||ptype[i]===4||ptype[i]===7||ptype[i]===9;
    if(overviewVfx&&!essential&&(i&7)!==0) continue;
    if(projectileDrawn++>=projectileLimit&&!essential) continue;
    const X=px[i], Y=py[i];
    if(!vis(X,Y,60)) continue;
    if(!fogFxVisible(X,Y,pteam[i])) continue;
    const fac=typeof mfCombatFactionTeam==='function'?mfCombatFactionTeam(pteam[i]):(pteam[i]===2?'horde':pteam[i]===0?'nova':'legion');
    const c=TEAMB[pteam[i]], wk=pwk[i]||'p', bio=!!pBio[i], nova=fac==='nova'&&!pCannon[i]&&!pBarrage[i];
    const fp=typeof mfFactionFxPalette==='function'?mfFactionFxPalette(pteam[i]):{a:c,b:[255,250,240]};
    const ty=ptype[i], power=clamp(Math.sqrt(Math.max(1,pdmg[i]))/6,.7,2.45);
    const yaw=Math.atan2(pvy[i],pvx[i]);
    const vl=Math.hypot(pvx[i],pvy[i])||1, nx=pvx[i]/vl, ny=pvy[i]/vl;
    const age=Math.max(0,(pmax[i]||plife[i])-plife[i]);
    const ballistic=ty===2||!!pBarrage[i];
    const ox=ballistic?psx[i]:X-pvx[i]*age, oy=ballistic?psy[i]:Y-pvy[i]*age;
    const hMuz=fxWeaponH(ox,oy,true);
    /* Stay on the bore. gh()+12 dropped every tracer onto the dirt while
       turrets sit at M.turH — the floating-behind-the-round look. */
    const H=ballistic?gh(X,Y)+16+Math.sin(pt[i]*Math.PI)*(pArc[i]||70)
      :ty===7?hMuz+8:ty===9?hMuz+10:hMuz;
    const vq=typeof mfVfxQ==='function'?mfVfxQ():1;
    const streakMul=vq>=1.2?1.78:vq>=0.95?1.48:vq>=0.65?1.16:0.86;
    const streak=clamp(vl*(wk==='g'?0.28:ty===1?0.23:0.18)*streakMul, 48*streakMul, (wk==='g'?198:ty===1?162:136)*streakMul);
    const young=ballistic?pt[i]<0.08:age<0.22;
    const fromMuz=young||ballistic;
    const bx=fromMuz?ox:X-nx*Math.min(streak,48), by=fromMuz?oy:Y-ny*Math.min(streak,48);
    const bH=fromMuz?hMuz:H;
    const beamOpt=fromMuz?null:{noMuzzle:1};
    if(young){
      addMuzzleFlash(ox,oy,hMuz,nx,ny,(pCannon[i]||pBarrage[i]||ty===2||ty===9)?8.2:5.0*power,
        nova?110:255, nova?230:185, nova?255:80, 230*(ballistic?1-pt[i]/0.08:1-age/0.22));
    }
    if(pBarrage[i]){
      /* A slow, dark shell remains readable against its own hot fuse. The
         streak follows the TANGENT of the ballistic arc so the shot does not
         flatten into a map-space spark while the body is hundreds of metres up. */
      bbAlpha.add(sprites.debris||sprites.glow,X,Y,H,10.5*power,yaw+Math.PI/2,72,68,64,255);
      bbAdd.add(sprites.glow,X,Y,H,7.5*power,0,255,155,54,200);
      const q0=Math.max(0,pt[i]-.022),tx0=psx[i]+(pex[i]-psx[i])*q0,ty0=psy[i]+(pey[i]-psy[i])*q0;
      const h0=gh(tx0,ty0)+16+Math.sin(q0*Math.PI)*(pArc[i]||70);
      addBeam3D(FX.beam,tx0,h0,ty0,X,H,Y,1.55*power,255,132,42,210,beamOpt);
    } else if(bio){
      const pulse=.84+Math.sin(t*15+i*1.7)*.16;
      bbAdd.add(sprites.glow,X,Y,H,8.4*power*pulse,0,205,255,118,250);
      bbAdd.add(sprites.glow,X,Y,H,16*power,0,164,76,232,110);
      addBeam3D(FX.beam,bx,bH,by,X,H,Y,.92*power,145,220,80,210,beamOpt);
    } else if(wk==='g'){
      /* Gauss needle: muzzle→tip while young, then a short same-height streak. */
      addBeam3D(FX.beam,bx,bH,by,X,H,Y,1.18*power,fp.a[0],fp.a[1],fp.a[2],255,beamOpt);
      bbAdd.add(sprites.glow,X,Y,H,5.8*power,0,245,252,255,250);
    } else if(wk==='s'){
      const pulse=.86+Math.sin(t*18+i)*.14;
      bbAdd.add(sprites.glow,X,Y,H,8.4*power*pulse,0,225,245,255,240);
      addBeam3D(FX.beam,bx,bH,by,X,H,Y,.92*power,fp.a[0],fp.a[1],fp.a[2],220,beamOpt);
    } else if(wk==='f'){
      bbAdd.add(sprites.flame||sprites.fireball||sprites.glow,X,Y,H,8*power,yaw+Math.PI/2,255,235,175,245);
      addBeam3D(FX.beam,bx,bH,by,X,H,Y,1.22*power,255,105,24,210,beamOpt);
    } else if(wk==='i'||ty===6){
      /* Plasma orb: a slow glowing ball. A directed trail names the axis
         without turning the orb into a laser. */
      bbAdd.add(sprites.glow,X,Y,H,(9+Math.sin(t*13+i)*1.2)*power,0,235,252,255,255);
      bbAdd.add(sprites.glow,X,Y,H,(20+Math.sin(t*9+i)*2)*power,0,80,205,255,165);
      addBeam3D(FX.beam,bx,bH,by,X,H,Y,1.22*power,fp.a[0],fp.a[1],fp.a[2],205,beamOpt);
    } else if(ty===4){
      bbAlpha.add(sprites.debris||sprites.glow,X,Y,H,7.5*power,yaw+Math.PI/2,nova?155:205,nova?225:210,nova?255:215,245);
      bbAdd.add(sprites.glow,bx,by,bH,9*power,0,nova?100:255,nova?225:130,nova?255:45,180);
      addBeam3D(FX.beam,bx,bH,by,X,H,Y,1.32*power,fp.a[0],fp.a[1],fp.a[2],200,beamOpt);
    } else if(ty===7){
      bbAlpha.add(sprites.debris||sprites.glow,X,Y,H,7.4*power,yaw+Math.PI/2,nova?160:220,nova?230:225,255,245);
      bbAdd.add(sprites.glow,X,Y,H,(10+Math.sin(t*22+i)*2)*power,0,nova?105:255,nova?225:180,nova?255:90,200);
      addBeam3D(FX.beam,bx,bH,by,X,H,Y,1.38*power,fp.a[0],fp.a[1],fp.a[2],220,beamOpt);
    } else if(ty===8){
      addBeam3D(FX.beam,bx,bH,by,X,H,Y,.88*power,255,220,140,250,beamOpt);
      bbAdd.add(sprites.glow,X,Y,H,5.2*power,0,255,235,190,245);
    } else if(ty===9){
      bbAlpha.add(sprites.debris||sprites.glow,X,Y,H,8.2*power,yaw+Math.PI/2,nova?145:205,nova?218:198,nova?255:188,245);
      addBeam3D(FX.beam,bx,bH,by,X,H,Y,1.42*power,fp.a[0],fp.a[1],fp.a[2],200,beamOpt);
    } else if(ty===2){
      bbAlpha.add(sprites.debris||sprites.glow,X,Y,H,6.5*power,yaw+Math.PI/2,nova?110:95,nova?145:90,nova?175:86,255);
      bbAdd.add(sprites.glow,X,Y,H,5.2*power,0,nova?100:255,nova?220:170,nova?255:75,190);
      const q0=Math.max(0,pt[i]-.03),tx0=psx[i]+(pex[i]-psx[i])*q0,ty0=psy[i]+(pey[i]-psy[i])*q0;
      const h0=gh(tx0,ty0)+16+Math.sin(q0*Math.PI)*(pArc[i]||70);
      addBeam3D(FX.beam,tx0,h0,ty0,X,H,Y,1.28*power,255,150,60,205,beamOpt);
    } else if(ty===3||pCannon[i]){
      bbAlpha.add(sprites.debris||sprites.glow,X,Y,H,9.5*power,yaw+Math.PI/2,86,82,78,255);
      bbAdd.add(sprites.glow,X,Y,H,8*power,0,255,165,62,210);
      addBeam3D(FX.beam,bx,bH,by,X,H,Y,1.55*power,255,135,45,225,beamOpt);
    } else {
      const cr=fp.a[0], cg=fp.a[1], cb=fp.a[2];
      addBeam3D(FX.beam,bx,bH,by,X,H,Y,(ty===1?1.72:1.32)*power,cr,cg,cb,ty===1?255:245,beamOpt);
      bbAdd.add(sprites.glow,X,Y,H,(ty===1?8.4:6.8)*power,0,255,252,240,255);
      bbAdd.add(sprites.glow,X,Y,H,(ty===1?3.6:2.8)*power,0,255,255,248,255);
    }
  }
  // Beams connect shooter to target. addBeam3D already supplies sheath + core,
  // so a second white pass (and helix on every style) turned the link into fog.
  let beamDrawn=0, fancyBeams=0;
  const beamLimit=overviewVfx?52:180;
  /* Hidden renderer lab for development captures and device QA. It never runs
     in ordinary play; `?beamshow=1` adds one stable example of each language
     over the live battlefield so camera rotation and mobile drivers can be
     checked without waiting for a 180 ms firing window. */
  let beamQueue=beams;
  if(demoMode&&location.search.indexOf('beamshow=1')>=0){
    const cx=cam.x, cy=cam.y, now=t%1;
    beamQueue=beams.concat([
      {x0:cx-430,y0:cy-250,x1:cx+300,y1:cy-250,w:2.8,r:255,g:80,b:105,t:0,max:1,seed:1,style:'laser'},
      {x0:cx-430,y0:cy-145,x1:cx+300,y1:cy-145,w:3.2,r:115,g:215,b:255,t:0,max:1,seed:2,style:'sniper'},
      {x0:cx-430,y0:cy-35,x1:cx+300,y1:cy-35,w:4.4,r:255,g:125,b:45,t:0,max:1,seed:3,style:'thermal'},
      {x0:cx-430,y0:cy+85,x1:cx+300,y1:cy+85,w:6.2,r:90,g:195,b:255,t:0,max:1,seed:4,style:'lance'},
      {x0:cx-430,y0:cy+205,x1:cx+300,y1:cy+205,w:3.5,r:105,g:255,b:165,t:0,max:1,seed:5+now,style:'repair'}
    ]);
  }
  for(const bm of beamQueue){
    const lf=1-bm.t/bm.max;
    const bmx=(bm.x0+bm.x1)/2,bmy=(bm.y0+bm.y1)/2;
    if(!vis(bmx,bmy,200)||!fogFxVisible(bm.x0,bm.y0,bm.team)||!fogFxVisible(bm.x1,bm.y1,bm.team)) continue;
    if(++beamDrawn>beamLimit) break;
    const sty=bm.style||'laser';
    if(sty==='orbital'||sty==='orbital_up'){
      const gx=sty==='orbital'?bm.x1:bm.x0, gy=sty==='orbital'?bm.y1:bm.y0;
      const h=gh(gx,gy)+8, sway=Math.sin(t*17+bm.seed)*5;
      addBeam3D(FX.beam,gx+sway,h+720,gy-sway*0.4,gx,h,gy,bm.w*2.4,bm.r,bm.g,bm.b,lf*90);
      addBeam3D(FX.beam,gx+sway*.3,h+720,gy,gx,h,gy,bm.w*.7,255,252,226,lf*245);
      addBeamBurst(gx,gy,h+8,bm.w*4.2,bm.r,bm.g,bm.b,lf*210);
      continue;
    }
    const h0=fxWeaponH(bm.x0,bm.y0,true), h1=fxWeaponH(bm.x1,bm.y1,false);
    const fpB=typeof mfFactionFxPalette==='function'?mfFactionFxPalette(bm.team):null;
    let br=bm.r, bgc=bm.g, bbc=bm.b;
    if(fpB&&(sty==='laser'||sty==='tracer'||sty==='sniper'||sty==='lance')){
      br=(br*0.42+fpB.a[0]*0.58)|0; bgc=(bgc*0.42+fpB.a[1]*0.58)|0; bbc=(bbc*0.42+fpB.a[2]*0.58)|0;
    }
    if(sty==='arc'){
      const dx=bm.x1-bm.x0, dy=bm.y1-bm.y0, dl=Math.hypot(dx,dy)||1;
      const ox=-dy/dl, oy=dx/dl, seg=5;
      let ax=bm.x0, ay=bm.y0, ah=h0;
      for(let k=1;k<=seg;k++){
        const q=k/seg, edge=(k===seg?0:Math.sin(q*Math.PI));
        const jitter=Math.sin(bm.seed*7+k*12.71+t*31)*bm.w*2.2*edge;
        const ex=bm.x0+dx*q+ox*jitter, ey=bm.y0+dy*q+oy*jitter;
        const eh=h0+(h1-h0)*q+Math.sin(q*Math.PI)*4;
        addBeam3D(FX.beam,ax,ah,ay,ex,eh,ey,bm.w*1.35,br,bgc,bbc,lf*220);
        ax=ex; ay=ey; ah=eh;
      }
      if(bm.t<0.11) addMuzzleFlash(bm.x0,bm.y0,h0,dx,dy,bm.w*2.4,br,bgc,bbc,(1-bm.t/0.11)*210);
      addBeamBurst(bm.x1,bm.y1,h1,bm.w*3.2,155,225,255,lf*220);
      continue;
    }
    if(sty==='mining'){
      /* THE WHITE DISC. Extraction (TITHE) and build-assist (LABOUR) clamp a
         beam on ONE fixed point for as long as they work, so every frame
         repaints the same texels. The weapon path is built for a transient,
         moving terminus: addBeamBurst lays 8 additive sprites there including
         a 255,253,244 core at full alpha, and addBeam3D rescales rad to
         max(4.80,rad*5.85) then draws ribbons at width*5.10 — ~116 world
         units — the innermost white at a*1.40, plus addBeamPathFx knots and a
         muzzle burst. One beam landed several times over the 0.936 bright-pass
         and bloom spread it into the disc that swallowed the extractor and the
         node under it. Verified by suppressing addBeam at the node: disc gone;
         suppressing the particles changed nothing.
         Two thin ribbons in the tier colour and a soft terminus. No white
         core, no knots, no burst, and do NOT route this through addBeam3D. */
      addBeamRibbon(sprites.glow,bm.x0,h0,bm.y0,bm.x1,h1,bm.y1,bm.w*2.2,br,bgc,bbc,lf*70,150);
      addBeamRibbon(sprites.glow,bm.x0,h0,bm.y0,bm.x1,h1,bm.y1,bm.w*0.9,br,bgc,bbc,lf*95,150);
      bbAdd.add(sprites.glow,bm.x1,bm.y1,h1,bm.w*1.5,0,br,bgc,bbc,lf*48);
      continue;
    }
    if(sty==='repair'){
      /* The un-fixed twin of the mining disc. A constructor holds this on ONE
         target for the whole repair/salvage, so the weapon terminus repaints
         the same texels every frame: addBeam3D rescales bm.w*1.55 to width ~20
         and lays ribbons at width*5.10 (~101 world units) with a white inner at
         a*1.40, then addBeamBurst adds 8 more additive sprites on the target.
         life 0.5 overlaps MORE than the 0.11 mining beam did.
         Keep the travelling green pulses — they are what makes repair read as
         repair — and drop the shaft rescale and the burst. */
      addBeamRibbon(sprites.glow,bm.x0,h0,bm.y0,bm.x1,h1,bm.y1,bm.w*2.0,br,bgc,bbc,lf*64,150);
      addBeamRibbon(sprites.glow,bm.x0,h0,bm.y0,bm.x1,h1,bm.y1,bm.w*0.85,br,bgc,bbc,lf*90,150);
      if(perfScale>.4) for(let k=0;k<2;k++){
        const q=(k/2+t*2.2+bm.seed)%1;
        bbAdd.add(sprites.glow,bm.x0+(bm.x1-bm.x0)*q,bm.y0+(bm.y1-bm.y0)*q,
          h0+(h1-h0)*q,bm.w*1.4,0,145,255,185,lf*95);
      }
      bbAdd.add(sprites.glow,bm.x1,bm.y1,h1,bm.w*1.4,0,br,bgc,bbc,lf*44);
      continue;
    }
    const pulse=sty==='thermal'?(0.78+Math.sin(t*24+bm.seed)*0.22):1;
    const outer=sty==='lance'?2.85:sty==='thermal'?2.35:sty==='repair'?1.55:sty==='sniper'?1.48:sty==='tracer'?1.42:1.58;
    addBeam3D(FX.beam,bm.x0,h0,bm.y0,bm.x1,h1,bm.y1,bm.w*outer*pulse,br,bgc,bbc,lf*(sty==='tracer'?250:245));
    if(!overviewVfx&&perfScale>.44&&fancyBeams<8&&sty==='lance'){
      fancyBeams++;
      addBeamHelix(bm,h0,h1,bm.w*0.9,2.4,150,225,255,lf*130,t,false);
    }
    if(sty==='thermal'&&perfScale>.4){
      for(let k=1;k<3;k++){
        const q=(k/3+t*1.8+bm.seed)%1;
        bbAdd.add(sprites.glow,bm.x0+(bm.x1-bm.x0)*q,bm.y0+(bm.y1-bm.y0)*q,
          h0+(h1-h0)*q,bm.w*2.0,0,255,140,50,lf*85);
      }
    } else if(sty==='repair'&&perfScale>.4){
      for(let k=0;k<2;k++){
        const q=(k/2+t*2.2+bm.seed)%1;
        bbAdd.add(sprites.glow,bm.x0+(bm.x1-bm.x0)*q,bm.y0+(bm.y1-bm.y0)*q,
          h0+(h1-h0)*q,bm.w*1.7,0,145,255,185,lf*140);
      }
    }
    if(bm.t<0.11) addMuzzleFlash(bm.x0,bm.y0,h0,bm.x1-bm.x0,bm.y1-bm.y0,
      bm.w*(sty==='lance'?3.6:2.2),br,bgc,bbc,(1-bm.t/0.11)*225);
    const hitSize=bm.w*(sty==='lance'?4.2:sty==='thermal'?3.2:sty==='sniper'?2.8:sty==='repair'?2.2:2.0);
    addBeamBurst(bm.x1,bm.y1,h1,hitSize*(sty==='tracer'?0.82:1),br,bgc,bbc,lf*(sty==='tracer'?200:220));
  }
  /* ---- particles as sprite billboards --------------------------------
     These use the original procedural sprite art — soft smoke, layered
     fireballs, shock rings — which reads far better than any polygon shell,
     and costs one quad each instead of a hundred triangles. They still sit in
     the depth buffer, so a plume behind a ridge is occluded by the ridge. */
  const sGlowB=sprites.glow, sSmokeB=sprites.smoke||sprites.glow, sRingB=sprites.ring;
  const sFireB=sprites.flame||sprites.fireball||sprites.glow;
  /* Barrage smoke owns a true height sample, unlike the generic ground-space
     particles. Drawing it here lets the wake climb out of frame with the
     shell, then visibly descend/re-enter on the final third of flight. */
  for(let s=0;s<artShellSmoke.length;s++){
    const S=artShellSmoke[s];
    if(overviewVfx&&(s&1))continue;
    if(!vis(S.x,S.y,100)||!fogFxVisible(S.x,S.y,S.team))continue;
    const lf=S.life/S.max,age=1-lf,sz=S.size*(1.15+age*2.25),H=gh(S.x,S.y)+S.lift;
    const aSmoke=Math.min(205,175*lf);
    bbAlpha.add(sSmokeB,S.x,S.y,H,sz,S.rot+t*.16,74+age*16,70+age*14,67+age*12,aSmoke);
    if((typeof mfVfxQ==='function'?mfVfxQ():1)>=0.55)
      bbAlpha.add(sSmokeB,S.x+Math.sin(S.rot)*sz*.22,S.y+Math.cos(S.rot)*sz*.18,
        H+sz*.16,sz*.78,S.rot-t*.12,82+age*12,76+age*10,70+age*8,aSmoke*.7);
    if(S.hot&&age<.42)bbAdd.add(sGlowB,S.x,S.y,H,sz*.58,0,255,118,34,105*(1-age/.42));
  }
  let combatParticleDrawn=0;
  /* HIGH walks the whole ring. MEDIUM/LOW walk recent slots from fHead —
     dead-slot scan of 9000 was the leftover tax. Combat flashes are young
     and sit near the head; magnitudes are unchanged. */
  const gfxQ=typeof mfGfxKey==='function'?mfGfxKey():'high';
  const liveN=(typeof fCount==='number')?fCount:MAXPART;
  const midWalk=liveN>0&&(gfxQ==='medium'||gfxQ==='low');
  const partLook=liveN<=0?0:midWalk?Math.min(MAXPART,Math.max(liveN*(gfxQ==='low'?3:2),gfxQ==='low'?360:720)):MAXPART;
  for(let k=0;k<partLook;k++){
    const i=midWalk?((fHead-1-k+MAXPART)%MAXPART):k;
    if(flife[i]<=0) continue;
    /* Preserve combat punctuation at every zoom. Only long-lived atmosphere
       and smoke are sampled; flashes, rings, flames, fireballs and fragments
       remain visible even when the adaptive scaler has dropped below 30%. */
    const combatFx=ftype[i]===0||ftype[i]===2||ftype[i]===3||ftype[i]===4||ftype[i]===5||ftype[i]===6||ftype[i]===7;
    const movementFx=ftype[i]===10;
    if(overviewVfx&&!combatFx&&!movementFx&&((i+tick)&7)!==0) continue;
    if(overviewVfx&&movementFx&&((i+tick)&3)!==0) continue;
    if(combatFx)combatParticleDrawn++;
    const X=fx[i], Y=fy[i];
    if(!vis(X,Y,90)) continue;
    if(!fogPointVisible(X,Y)) continue;
    const lf=flife[i]/fmax[i], ty=ftype[i], H=gh(X,Y);
    /* Type 0 flashes are 2D (no height). Commander/heavy muzzle stamps are
       size 21–27 — the old <22 cutoff left those on the dirt. Type 2 sparks
       from projectileFireFX are sub-0.5 and belong on the bore too. */
    const Hfx=(ty===0&&fsize[i]<36)||(ty===2&&fsize[i]<0.5)?fxWeaponH(X,Y,true):H;
    /* Skip additive flashes/flames on the hull. Dust (type 1/10) still draws. */
    if(!matchLive&&typeof carrier!=='undefined'&&carrier.active&&carrier.phase<2
       &&(ty===0||ty===2||ty===4)){
      const cdx=X-carrier.x,cdy=Y-carrier.y;
      if(cdx*cdx+cdy*cdy<100*100) continue;
    }
    if(ty===1){                               // drifting smoke — stacked lobes, not a flat disc
      const gsz=fsize[i]*(1.28+(1-lf)*1.85);
      const nearDrop=!matchLive&&typeof carrier!=='undefined'&&carrier.active&&carrier.phase<2
        &&(X-carrier.x)*(X-carrier.x)+(Y-carrier.y)*(Y-carrier.y)<100*100;
      const vq=typeof mfVfxQ==='function'?mfVfxQ():1;
      const airH=typeof fzh!=='undefined'&&fzh[i]>0.5?fzh[i]:0;
      const lift=airH?2+(1-lf)*10:(nearDrop?1.6:11+(1-lf)*34);
      const baseH=airH||H;
      const a0=nearDrop?120*lf:Math.min(215, (vq>=0.65?185:150)*lf);
      bbAlpha.add(sSmokeB,X,Y,baseH+lift,gsz,i*0.4+t*0.22, fcr[i],fcg[i],fcb[i], a0);
      if(!nearDrop&&vq>=0.45){
        bbAlpha.add(sSmokeB,X+Math.sin(i*2.1)*gsz*.30,Y+Math.cos(i*1.7)*gsz*.26,
          baseH+lift+gsz*.20,gsz*.84,-i*.28-t*.16,fcr[i]+10,fcg[i]+8,fcb[i]+6, a0*.74);
      }
      if(!nearDrop&&vq>=0.95){
        bbAlpha.add(sSmokeB,X+Math.cos(i*1.4)*gsz*.24,Y+Math.sin(i*2.3)*gsz*.22,
          baseH+lift+gsz*.42,gsz*.64,i*.51+t*.12,fcr[i]+6,fcg[i]+5,fcb[i]+4, a0*.5);
      }
    } else if(ty===10){                       // movement dust, kept near the tracks / boots
      const age=1-lf,gsz=fsize[i]*(.95+age*1.45);
      bbAlpha.add(sSmokeB,X,Y,H+1.4+age*4,gsz,i*.53+t*.18,fcr[i],fcg[i],fcb[i],140*lf);
    } else if(ty===8){                        // multi-lobed rising smoke plume
      const age=1-lf, gsz=fsize[i]*(1.18+age*2.05);
      const vq=typeof mfVfxQ==='function'?mfVfxQ():1;
      bbAlpha.add(sSmokeB,X,Y,H+10+age*38,gsz,i*0.4+t*0.25,fcr[i],fcg[i],fcb[i],Math.min(210,165*lf));
      if(vq>0.45) bbAlpha.add(sSmokeB,X+Math.sin(i*2.7)*gsz*.26,Y+Math.cos(i*1.9)*gsz*.22,
        H+20+age*52,gsz*.78,-i*.3-t*.18,fcr[i]+8,fcg[i]+7,fcb[i]+6,125*lf);
      if(vq>=0.95) bbAlpha.add(sSmokeB,X+Math.cos(i*1.8)*gsz*.20,Y+Math.sin(i*2.4)*gsz*.18,
        H+28+age*62,gsz*.58,i*.22+t*.14,fcr[i]+4,fcg[i]+3,fcb[i]+3,95*lf);
    } else if(ty===3){                        // shock ring — on the crater, not a spinning halo
      bbAdd.add(sRingB,X,Y,H+1.15,Math.min(18,fsize[i]*(0.55+(1-lf)*0.5)),0, fcr[i],fcg[i],fcb[i], 200*lf);
    } else if(ty===2||ty===5){                // hot sparks and fragments
      /* The debris atlas cell is a camera-facing quad. At phone size its soft
         alpha collapses into a bright white square—the exact blocks reported
         around explosions. A tiny lit shard has a real silhouette at every
         angle; the radial core supplies heat without exposing its rectangle.
         Hop used to launch sparks 20+ units off the crater; keep them in the
         bowl so a volley does not read as an orbiting swarm. */
      const age=1-lf,hop=(1.2+fsize[i]*.22)*lf*age,sz=Math.max(0.85,fsize[i]*(ty===5?.36:.22));
      const sparkH=Hfx+1.4+hop;
      FX.shard.add(X,Y,sparkH,sz,i*.83,fcr[i],fcg[i],fcb[i],lf<.18?lf*1300:235);
      if(ty===2) bbAdd.add(sGlowB,X,Y,sparkH,Math.max(1.0,sz*1.45),0,fcr[i],fcg[i],fcb[i],155*lf);
    } else if(ty===4){                        // ember coal — not an upright licking flame
      const sz=Math.min(10,fsize[i]*0.72);
      const flick=0.86+0.14*lf;
      bbAdd.add(sGlowB,X,Y,H+1.15,sz*1.55,0,fcr[i],Math.max(32,(fcg[i]*0.55)|0),Math.max(20,(fcb[i]*0.35)|0),Math.min(80,52*lf*flick));
      bbAdd.add(sGlowB,X,Y,H+1.35,sz*0.62,0,Math.min(255,fcr[i]+20),Math.min(255,fcg[i]+30),Math.min(255,fcb[i]+20),Math.min(170,120*lf*flick));
    } else if(ty===6){                        // volumetric explosion fireball
      const age=1-lf, S=Math.min(16,fsize[i]);
      bbAdd.add(sprites.fireball||sFireB,X,Y,H+S*.12,S*(0.88+age*.10),0,255,255,255,245*lf);
      bbAdd.add(sGlowB,X,Y,H+1.4,S*0.95,0,255,135,55,52*lf);
    } else if(ty===7){                        // ballistic solid debris
      const age=1-lf, hop=fsize[i]*0.55*lf*age;
      FX.shard.add(X,Y,H+1.6+hop,Math.max(1.2,fsize[i]*.42),i*.7,fcr[i],fcg[i],fcb[i],lf<.22?lf*1100:240);
    } else if(ty===9){                        // ambience: snow, ash, drifting sand
      const age=1-lf;
      bbAlpha.add(sSmokeB,X,Y,H+3+age*2,fsize[i]*(0.85+Math.sin(t*2.5+i)*0.18),
        t*0.12+i, fcr[i],fcg[i],fcb[i], 150*lf);
    } else if(ty!==9){                        // flash
      bbAdd.add(sGlowB,X,Y,Hfx+1.4,Math.min(12,fsize[i]),0, fcr[i],fcg[i],fcb[i], 220*lf);
    }
  }
  // muzzle / engine / stance glows as small shells
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]) continue;
    const mo=umode[i];
    if(!mo||mo===4) continue;
    const X=ux[i], Y=uy[i];
    if(!vis(X,Y,40)) continue;
    if(!fogEntityVisible(uteam[i],X,Y)) continue;
    const T=TYPES[utype[i]], H=unitGroundY(T,X,Y,i);
    if(mo===3)      bbAdd.add(sprites.glow,X,Y,H+T.size*0.5,T.size*1.6,0,255,120,50,120+Math.sin(t*11+i)*50);
    else if(mo===2) bbAdd.add(sprites.glow,X,Y,H+T.size*0.5,T.size*2.0,0,130,190,255,80);
    else if(mo===1||mo===5){
      /* Siege/suppress rings on unselected mass at cap are the same fillrate
         trap as selection rings. Off-screen already skipped via vis(). */
      if(usel[i]||i===heroIdx){
        if(!(RING_STRATEGIC&&i!==heroIdx))
          FX.ring.add(X,Y,H+1.6,T.size*(mo===1?1.5:1.3),0,255,mo===1?200:190,110,mo===1?120:100);
      }
    }
  }
  /* Critical units advertise mechanical failure on the model itself. The sim
     emits persistent smoke and sparks; these attached flames keep the source
     readable while moving. Organic infestation units vent corrosive vapour
     instead of looking like burning machinery. */
  let damagedShown=0;
  for(let i=0;i<unitHigh&&damagedShown<220;i++){
    if(overviewVfx) break;
    if(!ualive[i]) continue;
    const X=ux[i], Y=uy[i];
    if(!vis(X,Y,60)||!fogEntityVisible(uteam[i],X,Y)) continue;
    const frac=uhp[i]/Math.max(1,uhpm[i]);
    if(frac>=.58) continue;
    damagedShown++;
    const T=TYPES[utype[i]], H=gh(X,Y), sev=clamp((.58-frac)/.58,0,1);
    if(unitIsBrood(i)){
      bbAdd.add(sprites.glow,X,Y,H+T.size*.55,T.size*(.7+sev*.7),0,105,255,110,55+sev*100);
      if(frac<.28) bbAlpha.add(sSmokeB,X,Y,H+T.size*.85,T.size*(.45+sev*.5),t*.2+i,80,150,75,70+sev*55);
    } else if(frac<.38){
      addWreckCoalBed(X,Y,H,T.size*(.55+sev*.35),0.40+sev*0.55,i*1.7,frac<.18?3:2);
    }
  }
  // building emissives and night work lights
  for(const Bd of blds){
    if(!Bd.alive||Bd.prog<1||!vis(Bd.x,Bd.y,120)) continue;
    if(!fogEntityVisible(Bd.team,Bd.x,Bd.y)) continue;
    const sz=BT[Bd.type].size, H=BT[Bd.type].placement==='water'?0:gh(Bd.x,Bd.y);
    if(Bd.type==='geo')  bbAdd.add(sprites.glow,Bd.x,Bd.y,H+sz*0.85,sz*0.55,0,80,220,255,170);
    if(Bd.type==='mex'){
      /* Extraction glow, deliberately SLIGHT. 1.33.42 stripped the node halo,
         the ring, the vein ribbons and the standing crystal pools in one pass
         to kill the white disc — which left a finished extractor with no
         readback at all. What bloomed was the STACK: five additive sprites at
         alpha 140-255 over the same texels, which saturates before bloom even
         samples it. One sprite in the 40s does not. Do not add a second.
         Tier only shifts hue: a rich node should be legible without being
         brighter, or the disc comes back on exactly the pads that had it. */
      const mD=(Bd.dep>=0&&deposits[Bd.dep])||null;
      const mTier=mD?depositTier(mD):1;
      const mc=mTier===3?[206,150,255]:mTier===2?[120,232,188]:[120,214,255];
      const mPulse=0.88+Math.sin(t*2.2+(Bd.anim||0))*0.12;
      bbAdd.add(sprites.glow,Bd.x,Bd.y,H+sz*0.55,sz*0.34*mPulse,0,mc[0],mc[1],mc[2],46);
    }
    if(Bd.type==='fab')  bbAdd.add(sprites.glow,Bd.x,Bd.y,H+sz*0.95,sz*0.5*(1+Math.abs(Math.sin(t*5))*0.35),0,255,170,70,230);
    if(Bd.type==='arc')  bbAdd.add(sprites.glow,Bd.x,Bd.y,H+sz*1.15,sz*0.42,0,150,230,255,210);
    if(Bd.type==='rail'){
      const charge=clamp(1-(Bd.cool||0)/Math.max(.1,RAIL.cool),0,1);
      bbAdd.add(sprites.glow,Bd.x,Bd.y,H+sz*.82,sz*(.28+charge*.18),0,125,220,255,105+charge*115);
    }
    if(Bd.type==='minelaser'){
      const charge=clamp(1-(Bd.cool||0)/Math.max(.1,MINELASER.cool),0,1);
      bbAdd.add(sprites.glow,Bd.x,Bd.y,H+sz*.72,sz*(.25+charge*.16),0,90,215,255,95+charge*120);
    }
    if(Bd.type==='plasma'){
      const charge=clamp(1-(Bd.cool||0)/Math.max(.1,PLASMA_CHARGER.cool),0,1);
      bbAdd.add(sprites.glow,Bd.x,Bd.y,H+sz*.76,sz*(.42+charge*.28),0,105,205,255,100+charge*115);
    }
    if(Bd.type==='nova'&&Bd.cool<=0) bbAdd.add(sprites.glow,Bd.x,Bd.y,H+sz*1.4,sz*0.6,0,255,210,90,220);
    if(Bd.type==='sgen'){
      bbAdd.add(sprites.glow,Bd.x,Bd.y,H+sz*0.7,sz*0.66,0,120,215,255,160);
      FX.ring.add(Bd.x,Bd.y,H+2,145+Math.max(0,(Bd.lvl||1)-1)*18,0,95,215,255,38);
    }
    if(Bd.type==='techlab'&&Bd.shieldMax>0&&Bd.shield>0){
      const sf=clamp(Bd.shield/Bd.shieldMax,0,1), pulse=.88+Math.sin(t*2.6+Bd.anim)*.08;
      bbAdd.add(sprites.glow,Bd.x,Bd.y,H+sz*.75,sz*(.62+.25*sf)*pulse,0,95,205,255,65+sf*80);
      if(Bd.dmgT>0||Bd.shield<Bd.shieldMax) FX.ring.add(Bd.x,Bd.y,H+3,sz*(.78+.08*pulse),0,100,220,255,75+sf*90);
    }
    if(Bd.type==='uplink'){
      // SQUARE, because the build zone it projects is square
      const ur=buildRadius(Bd);
      for(const [ex,ey,rot2] of [[0,-ur,0],[0,ur,0],[-ur,0,Math.PI/2],[ur,0,Math.PI/2]])
        FX.line.add(Bd.x+ex,Bd.y+ey,gh(Bd.x+ex,Bd.y+ey)+2,ur*2,rot2, 90,200,255,120, 3.0);
    }
    /* Night work-light pools used to stamp a warm orange billboard on
       every finished building after dusk — the orb this pass retired.
       Mesh windows, HQ_LAMP discs and towerCrumble fire already mark a
       powered or burning structure. Specialist type glows above stay. */
  }
  /* Mobile lights are intentionally budgeted. At command zoom, lighting every
     single tank in a 2,000-unit battle would become a white carpet. The
     commander, selected units and a sampled set of active machines always
     receive a small headlamp pool; biological units use a weaker cold glow so
     their silhouettes remain readable without pretending they carry lamps. */
  if(S_nA>0.10&&FX.wedge){
    const lv=clamp((S_nA-0.10)/0.75,0,1);
    const total=Math.max(1,teamCount[0]+teamCount[1]+teamCount[2]);
    const stride=Math.max(1,Math.ceil(total/260));
    let headlightN=0;
    for(let i=0;i<unitHigh;i++){
      if(!ualive[i]||(!usel[i]&&i!==heroIdx&&(i%stride)!==0)) continue;
      const X=ux[i],Y=uy[i]; if(!vis(X,Y,48)||!fogEntityVisible(uteam[i],X,Y)) continue;
      const T=TYPES[utype[i]], H=gh(X,Y), bio=unitIsBrood(i);
      const active=umov[i]||usel[i]||i===heroIdx;
      const c=bio?[138,104,255]:(TEAMB[uteam[i]]||[165,220,255]);
      const r=T.size*(bio?.82:1.05);
      bbAdd.add(sprites.glow,X,Y,H+1.45,r*(active?1.55:1.18),0,c[0],c[1],c[2],(bio?30:(active?52:32))*lv);
      if(!bio){
        /* Machine underglow — the hull stands in its own worklight, the way a
           service walker's belly lamps pool on the rock beneath it. Ground
           decal, not a camera-facing sprite, so it reads as lit floor. */
        FX.pool.add(X,Y,H+0.85,Math.min(r*1.6,42),0,255,238,198,(active?48:26)*lv);
        bbAdd.add(sprites.glow,X,Y,H+2.0,r*.62,0,255,244,208,(active?60:36)*lv);
        /* Directional flashlight. A wedge of lit ground widening from the
           lamp, ending in a bright splash — the area the unit FACES is the
           area you can see. The bounded count prevents a thousand-unit army
           turning night into a white carpet; the commander always carries the
           long throw. */
        if(headlightN<56&&!T.air&&!T.naval&&(active||(i%7)===0)){
          const cdr=i===heroIdx;
          /* Reach is CAPPED in absolute units. Scaling purely off hull size
             let the size-32 commander throw a 200-unit floodplain that read
             as fog; a lamp's throw does not grow linearly with the vehicle
             carrying it. */
          const a=uang[i]-Math.PI/2;
          const reach=Math.min(T.size*(cdr?3.6:(T.size<15?3.8:4.6)),cdr?118:64);
          const sx=X+Math.cos(a)*T.size*.42,sy=Y+Math.sin(a)*T.size*.42;
          const mx=sx+Math.cos(a)*reach*.55,my=sy+Math.sin(a)*reach*.55;
          const ex=sx+Math.cos(a)*reach,ey=sy+Math.sin(a)*reach;
          const hh=Math.max(H,gh(mx,my))+1.15;
          /* Two layers, like a real lamp: a wide soft skirt and a hot narrow
             core inside it. One wedge alone is either too dim to guide the eye
             or so bright its edges band. */
          FX.wedge.add(sx,sy,hh,reach,a,255,232,182,(cdr?165:105)*lv,reach*(cdr?.58:.54));
          FX.wedge.add(sx,sy,hh+0.12,reach*.86,a,255,244,210,(cdr?135:80)*lv,reach*(cdr?.30:.27));
          FX.pool.add(ex,ey,gh(ex,ey)+1.05,reach*(cdr?.34:.30),0,255,233,186,(cdr?130:78)*lv);
          FX.pool.add(ex,ey,gh(ex,ey)+1.15,reach*(cdr?.19:.17),0,255,246,214,(cdr?95:55)*lv);
          bbAdd.add(sprites.glow,sx,sy,H+2.3,Math.min(T.size*.5,12),0,255,242,204,(cdr?80:44)*lv);
          headlightN++;
        }
      }
    }
  }
  /* ---- live singularities --------------------------------------------
     A black hole cannot be drawn additively — additive can only brighten.
     The core is a deep-dark blob in the ALPHA pass, and everything luminous
     around it (accretion rings, einstein rim, polar shimmer) rides additive
     on top. The implosion phase collapses the ring radius toward the core. */
  if(typeof singularities!=='undefined') for(const Sg of singularities){
    if(!vis(Sg.x,Sg.y,300)) continue;
    const Rg=170*Math.sqrt(Sg.pow), H=gh(Sg.x,Sg.y)+16;
    const ph=Sg.phase, q=ph===0?Math.min(1,Sg.t/2.5):1;
    const coreR=(ph===2? Math.max(0,1-Sg.t/0.6) : (0.35+q*0.65))*Rg*0.22;
    if(coreR>1){
      bbAlpha.add(sprites.glow,Sg.x,Sg.y,H,coreR*2.6,0, 4,2,10, 244);
      bbAlpha.add(sprites.glow,Sg.x,Sg.y,H,coreR*1.4,0, 0,0,0, 252);
      bbAdd.add(sprites.ring,Sg.x,Sg.y,H,coreR*1.55,t*3.1, 205,170,255, 215);
      bbAdd.add(sprites.ring,Sg.x,Sg.y,H,coreR*2.1,-t*2.2, 140,100,240, 130);
      bbAdd.add(sprites.glow,Sg.x,Sg.y,H,coreR*3.4,0, 96,60,190, 60);
      FX.ring.add(Sg.x,Sg.y,H-8,(coreR*2.4)/3,t*4.2, 196,160,255, 180);
      /* infall shimmer: brief luminous streaks on the spiral */
      if(ph===0&&Math.random()<0.5){
        const a4=Math.random()*TAU, d5=coreR*2.2+Math.random()*Rg*0.8;
        bbAdd.add(sprites.glow,Sg.x+Math.cos(a4)*d5,Sg.y+Math.sin(a4)*d5,H+Math.random()*14,
          5+Math.random()*7,0, 210,180,255, 90);
      }
    }
  }
  /* ---- structures burning down --------------------------------------
     A building below half health is visibly failing: coal beds on the hull,
     a smoke column, sparks. Upright flame quads were licking tongues. */
  for(const Bf of blds){
    if(!Bf.alive||Bf.prog<1||!vis(Bf.x,Bf.y,140)) continue;
    if(!fogEntityVisible(Bf.team,Bf.x,Bf.y)) continue;
    const frac=Bf.hp/Bf.hpm;
    if(frac>0.55) continue;
    const sz=BT[Bf.type].size, H=gh(Bf.x,Bf.y);
    const sev=clamp((0.55-frac)/0.55,0,1);       // 0 at 55% hp, 1 at destruction
    const fBase=Math.min(sz,26);
    addWreckCoalBed(Bf.x,Bf.y,H,fBase*(0.55+sev*0.22),0.42+sev*0.55,Bf.anim,sev>.72?4:3);
    // smoke column: emitted, so it drifts and persists rather than pulsing
    if(perfScale>0.35 && (tick+(Bf.anim*97|0))%Math.max(3,10-(sev*7|0))===0){
      addParticle(1, Bf.x+rr(-sz*0.3,sz*0.3), Bf.y+rr(-sz*0.3,sz*0.3),
        rr(-6,6), rr(-28,-16), 3.2+sev*2.0, sz*(0.30+sev*0.36),
        40+sev*22, 38+sev*18, 36+sev*16);
    }
    if(sev>0.6 && (tick+(Bf.anim*31|0))%7===0)
      addParticle(2, Bf.x+rr(-sz*0.18,sz*0.18), Bf.y+rr(-sz*0.18,sz*0.18),
        rr(-8,8), rr(-10,-2), 0.35, 2.0, 255,190,90);
    if(sev>0.82 && perfScale>0.48 && (tick+(Bf.anim*43|0))%31===0){
      addParticle(6,Bf.x+rr(-sz*.28,sz*.28),Bf.y+rr(-sz*.28,sz*.28),0,0,.5,sz*.34,255,145,60);
      addParticle(3,Bf.x,Bf.y,0,0,.28,sz*.8,255,135,55);
    }
  }

  // burning ruins (still standing) — coals, not licking flame quads
  for(const R of relics){
    if(!R.alive||!(R.burn>0.12)||!vis(R.x,R.y,120)) continue;
    const H=gh(R.x,R.y);
    addWreckCoalBed(R.x,R.y,H,Math.min(22,R.s*.42),R.burn,R.seed,3);
    if(S_nA>0.34) FX.cone.add(R.x,R.y,H+R.s*0.55,R.s*0.30,t*0.3,255,150,70,54*R.burn*S_nA);
  }
  /* Collapsed civic wreckage keeps coals until the ember field cools.
     The loop above skips dead blocks, which is why city destroy used to
     look like a quiet grey crater with no fire. */
  for(const R of relics){
    if(R.alive) continue;
    const age=stats.t-(R.fallT||0);
    if(age>52||!(R.burn>0.18)||!vis(R.x,R.y,140)) continue;
    const heat=clamp(1-age/52,0,1)*R.burn;
    const H=gh(R.x,R.y);
    addWreckCoalBed(R.x,R.y,H,Math.min(20,Math.max(8,R.s*0.16)),heat,R.seed,heat>0.55?4:3);
  }
  /* Civic groundBurns and wreckage share the same language: terrain coals
     plus a low glow. No upright flame stamps. */
  for(const W of wrecks){
    if(W.kind!==2||!vis(W.x,W.y,50)) continue;
    const age=stats.t-(W.ts||0);
    if(age>38) continue;
    const heat=clamp(1-age/38,0,1);
    if(heat<0.12) continue;
    addWreckEmbers(W.x,W.y,gh(W.x,W.y),Math.min(12,W.s*(0.26+heat*0.14)),heat,W.x*0.07);
  }
  // salvage pickup shimmer
  for(const W of wrecks){
    if(W.glow<=0||!vis(W.x,W.y,40)) continue;
    /* Reclaim glow follows the same language: green for alloy, amber for
       organic, so the feedback matches the resource it is paying. */
    const g = W.kind===5 ? [255,196,120] : [120,255,170];
    bbAdd.add(sprites.glow,W.x,W.y,gh(W.x,W.y)+6,26,0,g[0],g[1],g[2],220*Math.min(1,W.glow*2));
  }
  // meteor markers
  for(const M of meteors){
    if(!vis(M.x,M.y,200)) continue;
    const H=gh(M.x,M.y);
    FX.ring.add(M.x,M.y,H+2,72+Math.sin(t*8)*8,0,255,90,60,150);
    if(M.t<0.7) addBeam3D(FX.beam,M.x,H,M.y,M.x+50,H+900,M.y,7,255,190,110,200*(1-M.t/0.7));
  }
  /* ---- COMMANDER LOCATOR ----------------------------------------------
     This is navigation help, not part of the mech. Selection already provides
     an unambiguous ring, so stacking the old 9.5-unit crest over a selected
     Commander made it look like oversized rigid hardware. Hide it on selection
     and scale it gently with strategic zoom; close play gets a small beacon. */
  if(sprites.commanderFx&&heroIdx>=0&&ualive[heroIdx]&&!usel[heroIdx]&&vis(ux[heroIdx],uy[heroIdx],90)){
    const cx=ux[heroIdx],cy=uy[heroIdx];
    const q=clamp((orthoSpan-420)/900,0,1),ls=10+q*3,pulse=.92+Math.sin(t*3.2)*.08;
    const ch=gh(cx,cy)+TYPES[utype[heroIdx]].size*1.75+26+Math.sin(t*2.2)*1.4;
    bbAdd.add(sprites.glow,cx,cy,ch,ls*1.55*pulse,0,255,192,45,48);
    bbAdd.add(sprites.ring||sprites.glow,cx,cy,ch,ls*1.22*pulse,-t*.35,255,226,100,115);
    bbAdd.add(sprites.commanderFx,cx,cy,ch,ls*pulse,0,255,218,92,225);
  }
  /* ---- MODULE MARKS ----------------------------------------------------
     Drawn over the Commander and the HQ, one badge per fitted module, slowly
     turning and bobbing. Sourced live from the crafting layer, so a module
     that broke at the end of the last match simply has no mark this one. */
  if(typeof activeModuleMarks==='function' && sprites.ring){
    const marks=activeModuleMarks();
    if(marks.length){
      const carriers=[];
      /* Physical module hardware is readable at tactical zoom. Its duplicate
         floating badge only returns at strategic zoom, where that geometry is
         genuinely too small to identify. */
      if(heroIdx>=0&&ualive[heroIdx]&&orthoSpan>760)
        carriers.push([ux[heroIdx],uy[heroIdx],TYPES[utype[heroIdx]].size*1.5+22]);
      for(const B of bldLive) if(B.alive&&B.team===0&&B.type==='hq'){ carriers.push([B.x,B.y,BT.hq.size*0.9+22]); break; }
      for(const [cx,cy,ch] of carriers){
        if(!vis(cx,cy,80)) continue;
        const H=gh(cx,cy)+ch;
        marks.forEach((mk,k)=>{
          const a=t*0.7+k*(TAU/Math.max(1,marks.length));
          const rr2=marks.length>1?11:0;
          const mx=cx+Math.cos(a)*rr2,my=cy+Math.sin(a)*rr2,mh=H+Math.sin(t*1.6+k)*1.4;
          bbAdd.add(sprites.glow,mx,my,mh,7.4,0,mk.col[0],mk.col[1],mk.col[2],50);
          bbAdd.add(sprites.ring,mx,my,mh,5.2,t*1.1,mk.col[0],mk.col[1],mk.col[2],190);
        });
      }
    }
  }
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(-8,-32);
  FX.bolt.flush(gl); FX.shard.flush(gl); FX.beam.flush(gl);
  FX.cone.flush(gl); FX.shell.flush(gl);
  gl.disable(gl.DEPTH_TEST);
  FX.line.flush(gl); FX.ring.flush(gl); FX.disc.flush(gl);
  if(FX.wedge){ FX.wedge.flush(gl); FX.pool.flush(gl); }
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  MF_COMBAT_VFX_TELEMETRY.projectiles=projectileDrawn;
  MF_COMBAT_VFX_TELEMETRY.beams=beamDrawn;
  MF_COMBAT_VFX_TELEMETRY.particles=combatParticleDrawn;
  MF_COMBAT_VFX_TELEMETRY.additive=bbAdd.n;
  MF_COMBAT_VFX_TELEMETRY.maxProjectiles=Math.max(MF_COMBAT_VFX_TELEMETRY.maxProjectiles,projectileDrawn);
  MF_COMBAT_VFX_TELEMETRY.maxBeams=Math.max(MF_COMBAT_VFX_TELEMETRY.maxBeams,beamDrawn);
  MF_COMBAT_VFX_TELEMETRY.maxParticles=Math.max(MF_COMBAT_VFX_TELEMETRY.maxParticles,combatParticleDrawn);
  if(projectileDrawn||beamDrawn||combatParticleDrawn)MF_COMBAT_VFX_TELEMETRY.framesWithCombat++;
  /* The WebView's isolated inspector cannot read page-world globals. The
     opt-in showcase exposes a tiny DOM snapshot so automated device QA can
     prove the real render queues were flushed; ordinary play pays no cost. */
  if(MF_COMBAT_VFX_DIAGNOSTIC&&(MF_COMBAT_VFX_TELEMETRY.framesWithCombat&7)===0)document.documentElement.dataset.mfVfx=[projectileDrawn,beamDrawn,combatParticleDrawn,MF_COMBAT_VFX_TELEMETRY.maxProjectiles,MF_COMBAT_VFX_TELEMETRY.maxBeams,MF_COMBAT_VFX_TELEMETRY.maxParticles,MF_COMBAT_VFX_TELEMETRY.framesWithCombat].join(',');

  /* ---- UNIVERSAL HEALTH BARS -------------------------------------------
     Health is tactical information, not merely a damage notification. Every
     visible structure, ground unit and aircraft gets a camera-facing bar.
     Both the dark track and coloured fill share bbAlpha, so even a large army
     remains one draw call instead of issuing UI geometry per entity. */
  /* ALLEGIANCE IS THE FIRST READ, damage the second. Every bar used to run
     the same green-amber-red damage ramp, so a brawl was a wall of identical
     green and you could not tell whose army was winning at a glance. Now the
     hue answers "whose?" - your bars keep the full damage ramp (their exact
     state is YOUR tactical information), enemy and wildlife bars live in the
     red family and darken as they fall. */
  /* Bars are screen-space billboards, so author their dimensions in phone
     pixels and convert once through the current world span. The previous hard
     world-unit minimum ballooned into a chunky rectangle while zoomed in and
     shrank into a mipmapped dash while zoomed out. */
  const hbPx=Math.max(.24,orthoSpan/Math.max(1,VH));
  const putHealthBar=(x,y,h,w,bh,frac,team)=>{
    frac=clamp(frac,0,1);
    let er=78,eg=224,eb=132;
    if(team===1){er=255;eg=76;eb=62;}else if(team===2){er=255;eg=144;eb=48;}
    /* Soft allegiance rim -> opaque frame -> fill -> one-pixel gloss. This is
       still one instanced batch; the added layers buy clarity without DOM,
       text, texture scaling or a draw call per entity. */
    bbAlpha.addRect(sprites.px,x,y,h,w+5*hbPx,bh+4*hbPx,er,eg,eb,66);
    bbAlpha.addRect(sprites.px,x,y,h,w+2*hbPx,bh+1.7*hbPx,4,9,15,242);
    if(frac<=0) return;
    const off=-w*(1-frac)*0.5;
    let r,g,b;
    if(team===1){ r=255; g=52+50*frac; b=44; }               // enemy army - hard red
    else if(team===2){ r=255; g=118+50*frac; b=34; }         // wildlife - hot ember
    else { r=frac>0.5?72:255; g=frac>0.5?235:frac>0.25?184:82; b=frac>0.5?112:62; }
    bbAlpha.addRect(sprites.px,
      x+matV[0]*off, y+matV[8]*off, h+matV[4]*off,
      w*frac,bh,r,g,b,255);
    const vo=bh*.26;
    bbAlpha.addRect(sprites.px,
      x+matV[0]*off+matV[1]*vo, y+matV[8]*off+matV[9]*vo, h+matV[4]*off+matV[5]*vo,
      w*frac,Math.max(.55*hbPx,bh*.18),Math.min(255,r+48),Math.min(255,g+48),Math.min(255,b+48),185);
  };
  const putShieldBar=(x,y,h,w,frac)=>{
    frac=clamp(frac,0,1);
    bbAlpha.addRect(sprites.px,x,y,h,w+2,3.2,5,22,34,220);
    if(frac<=0) return;
    const off=-w*(1-frac)*.5;
    bbAlpha.addRect(sprites.px,x+matV[0]*off,y+matV[8]*off,h+matV[4]*off,w*frac,1.8,85,215,255,255);
  };
  const hbMode=(META&&META.settings&&META.settings.healthBars)||'select';
  if(hbMode!=='off'){
    for(let bi=0;bi<blds.length;bi++){
      const Bd=blds[bi];
      if(!Bd.alive||!vis(Bd.x,Bd.y,150)) continue;
      if(hbMode==='select'&&openBld!==bi) continue;
      if(!fogEntityVisible(Bd.team,Bd.x,Bd.y)) continue;
      const T=BT[Bd.type], H=gh(Bd.x,Bd.y);
      const bw=clamp((52+Math.min(12,T.size*.14))*hbPx,30,74);
      const barH=clamp(5.0*hbPx,2.8,5.2), bh=H+T.size*1.34+4*hbPx;
      putHealthBar(Bd.x,Bd.y,bh,bw,barH,Bd.hp/Bd.hpm,Bd.team);
      if(Bd.shieldMax>0) putShieldBar(Bd.x,Bd.y,bh+7*hbPx,bw,Bd.shield/Bd.shieldMax);
    }
    /* Typed scratch, reused across frames. This loop used to push one object
       literal AND build one concatenated string key per visible unit, every
       frame: with health bars on and 300 units on screen that is ~36,000
       allocations a second feeding the collector, which on a mid-range Android
       is a visible hitch every few seconds rather than a lower average frame
       rate. Same results, no garbage. */
    if(_hbI.length<unitHigh){ _hbI=new Int32Array(unitHigh); _hbF=new Float32Array(unitHigh); }
    let hbN=0;
    for(let i=0;i<unitHigh;i++){
      if(!ualive[i]||!vis(ux[i],uy[i],90)) continue;
      if((hbMode==='select'||overviewVfx)&&!usel[i]) continue;
      if(!fogEntityVisible(uteam[i],ux[i],uy[i])) continue;
      if(uteam[i]===2&&step>1&&(i&1)) continue;
      if(i!==heroIdx&&typeof mfIconStackSkip==='function'&&mfIconStackSkip(i)) continue;
      _hbI[hbN]=i; _hbF[hbN]=uhp[i]/uhpm[i]; hbN++;
    }
    const putUnitBar=k=>{
      const i=_hbI[k], T=TYPES[utype[i]], H=unitGroundY(T,ux[i],uy[i],i);
      const vs=T.size*(T.vscale||1),bh=H+vs*(T.air?1.22:1.58)+3*hbPx;
      const bw=clamp((T.cat==='hero'?48:T.size>=24?43:36)*hbPx,20,T.cat==='hero'?60:48);
      const barH=clamp(4.2*hbPx,2.5,4.4);
      putHealthBar(ux[i],uy[i],bh,bw,barH,_hbF[k],uteam[i]);
      /* Secondary shielding is a projected buff (ushielded is a short window a
         shield field keeps refreshing). While it holds, a thin cyan strip
         rides above the health bar - the one defensive state in the game that
         previously had no readback on the unit itself. */
      if(ushielded[i]>0) putShieldBar(ux[i],uy[i],bh+6*hbPx,bw*0.72,clamp(ushielded[i]/0.7,0,1));
    };
    /* One bar per eligible unit. Cell-collapse (most-damaged per view cell
       once hbN>48) changed the approved select/always-on language without
       a go-ahead — bars vanished inside any real formation. */
    for(let k=0;k<hbN;k++) putUnitBar(k);
  }

  /* ---- AMBIENT SKY LIFE (harvested from the dead sprite renderer) --------
     Cloud shadows and bird flocks were both fully implemented in
     renderLegacySprites (hud.js:351 and :1379) — a function called from
     nowhere. The bird SIMULATION has been running live the whole time
     (sim.js:2314 spawns, moves and despawns flocks every tick); nothing drew
     the result. Ported here as alpha billboards: at this camera pitch
     (1.05–1.50 rad) a camera-facing sprite at ground height reads as a
     ground shadow, which is exactly how the 2D version read. */
  if(perfScale>0.4){
    if(sprites.cloud) for(let k=0;k<4;k++){
      const sp=[7,10,5,12][k], sz=[720,560,880,480][k];
      const cxx=((t*sp+k*730)%(MAP+1600))-800;
      const cyy=(k*690+t*sp*0.35)%MAP;
      if(!vis(cxx,cyy,sz)) continue;
      /* Day only, and fade with night: a cloud shadow under a black sky is
         noise. 52 alpha matched the 2D look; scale it by daylight. */
      const ca=52*(1-Math.min(1,S_nA*1.6));
      if(ca>4) bbAlpha.add(sprites.cloud,cxx,cyy,gh(cxx,cyy)+2.5,sz,k*1.3,10,12,16,ca);
    }
    if(sprites.bird&&S_nA<0.75) for(const F of birds){
      const rot=Math.atan2(F.vy,F.vx)+Math.PI/2;
      for(let k2=0;k2<F.n;k2++){
        const bx2=F.x-F.vx*k2*0.55+Math.sin(F.ph+k2*1.7)*13;
        const by2=F.y-F.vy*k2*0.55+Math.cos(F.ph*0.7+k2*2.1)*10;
        if(!vis(bx2,by2,20)) continue;
        const bh2=gh(bx2,by2), flap=0.45+Math.abs(Math.sin(F.ph*2.2+k2))*0.75;
        /* Shadow on the ground, bird well above it — the height gap is what
           says "flying" from a top-down camera. */
        bbAlpha.add(sprites.glow,bx2+6,by2+10,bh2+1.2,7,0,0,0,0,42);
        bbAlpha.add(sprites.bird,bx2,by2,bh2+64,10*flap,rot,26,30,38,225);
      }
    }
  }

  /* Per-unit veterancy and per-structure Mk/tech pips. Not an army rank —
     ukills/uvet and B.lvl stay on the entity. Screen-space sizing matches
     the health bars so a chevron stays readable at tactical zoom. */
  const rkPx=Math.max(.24,orthoSpan/Math.max(1,VH));
  const putRankMark=(x,y,h,n)=>{
    n=n|0; if(n<=0) return;
    /* Chevrons, not 4px diamonds: at tactical zoom a diamond mip-filtered
       into a speck. Two bars read as a rank mark from command altitude. */
    const s=clamp(12*rkPx,8.2,18);
    const lift=h+16*rkPx;
    for(let k=0;k<n;k++){
      const yo=k*s*0.78;
      bbAlpha.addOrientedRect(sprites.px,x,y,lift+yo,s*2.05,s*0.46,-0.64,255,214,90,250);
      bbAlpha.addOrientedRect(sprites.px,x,y,lift+yo,s*2.05,s*0.46,0.64,255,214,90,250);
    }
    bbAdd.add(sprites.glow,x,y,lift+(n-1)*s*0.4,18+n*5,0,255,210,87,78);
  };
  if(orthoSpan<1700){
    for(let bi=0;bi<blds.length;bi++){
      const Bd=blds[bi];
      if(!Bd.alive||Bd.prog<1||!vis(Bd.x,Bd.y,150)) continue;
      if(!fogEntityVisible(Bd.team,Bd.x,Bd.y)) continue;
      const T=BT[Bd.type], H=gh(Bd.x,Bd.y);
      const lv=typeof bldDisplayLevel==='function'?bldDisplayLevel(Bd):(Bd.type==='fac'?(Bd.tier===2?2:1):(Bd.lvl||1));
      putRankMark(Bd.x,Bd.y,H+T.size*1.34+10*rkPx,lv);
    }
    for(let i=0;i<unitHigh;i++){
      if(!ualive[i]||!uvet[i]||!vis(ux[i],uy[i],90)) continue;
      if(!fogEntityVisible(uteam[i],ux[i],uy[i])) continue;
      if(typeof mfIconStackSkip==='function'&&mfIconStackSkip(i)) continue;
      const T=TYPES[utype[i]], H=unitGroundY(T,ux[i],uy[i],i);
      const vs=T.size*(T.vscale||1);
      putRankMark(ux[i],uy[i],H+vs*(T.air?1.22:1.58)+10*rkPx,uvet[i]);
    }
  }

  /* ---- billboard pass -------------------------------------------------
     Sprites last: alpha-blended smoke first so it reads as volume against the
     world, then additive light on top of everything. */
  beginBB();
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  bbAlpha.flush(gl);
  /* Additive glows are screen-aligned quads at a single depth. Depth-testing
     them against pavement kerbs punched C-shaped holes and 1px cyan edges
     through the stain — the other half of the daytime-fx flicker. Light is
     allowed to sit on the ground; smoke above still occludes. */
  gl.disable(gl.DEPTH_TEST);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
  bbAdd.flush(gl);
  gl.enable(gl.DEPTH_TEST);
  /* GPU particle pass: same additive state, one update + one draw. */
  if(typeof gpfxFrame==='function'){
    gl.depthMask(false);
    gpfxFrame((typeof dtDraw==='number'?dtDraw:0.016)||0.016,matVP,
      (gl&&gl.drawingBufferHeight)||((typeof VH==='number'&&typeof DPR==='number')?VH*DPR:900));
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
  }
  /* Tactical icons last, and deliberately without a depth test. The camera
     pitch band allows a ridge to stand in front of a unit, and a strategic
     symbol that disappears behind terrain defeats the purpose of zooming out.
     Disclosure is still owned by fog: nothing reaches this batch that
     fogEntityVisible() rejected. One extra draw call for the whole map. */
  if(typeof bbIcon!=='undefined'&&bbIcon&&bbIcon.n){
    /* Recorded before flush(), which zeroes the count — a harness sampling
       bbIcon.n after the frame would always read 0 and conclude the tier is
       dead. */
    mfIconLast=bbIcon.n;
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    beginBB(mfIcoTex);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    bbIcon.flush(gl);
    gl.enable(gl.DEPTH_TEST);
  } else if(typeof mfIconLast!=='undefined') mfIconLast=0;
  /* Icon sheet is still on unit 0. Present samples 5/6 — do not begin3D
     (that rebinds 4/5/6 to matTex). Restore 0 only. */
  if(typeof endBB==='function') endBB();
  else { gl.activeTexture(gl.TEXTURE0); if(typeof matTex!=='undefined'&&matTex) gl.bindTexture(gl.TEXTURE_2D,matTex); }

  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.enable(gl.CULL_FACE);
  if(aoActive) aoPresent();
  /* Present samples 5/6. Restore the model atlas so the next frame cannot
     start with a post texture on a material sampler. */
  begin3D(S_nA);
  gl.bindVertexArray(null);
}

