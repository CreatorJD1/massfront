/* ============================================================================
   VOLUMETRIC FX — raymarched proxy volumes for detonations, dust and plumes
   ----------------------------------------------------------------------------
   Every "volumetric" effect in this renderer before today was a camera-facing
   quad with a soft texture on it. terrain.js:1280 says so in as many words:
   "not a raymarch". This file is the raymarch.

   WHAT IT IS
     A small ring of ANALYTIC VOLUMES — centre, anisotropic half-extents, age,
     density, emission — each drawn as a unit-cube proxy in ONE instanced draw.
     The fragment shader intersects the box in world space, marches the ray
     front-to-back through an ellipsoidal shell modulated by a 3D FBM texture,
     accumulates Beer-Lambert transmittance with a single-scatter term (an
     analytic sun chord weighted by two real density probes — no second
     march), and terminates the march on the scene depth buffer so smoke is cut
     by terrain, hulls and buildings instead of floating through them.

     Total per frame: one bufferSubData, one instanced draw, one fullscreen
     composite. No per-frame allocation, no per-particle GPU state.

   WHAT IT IS NOT — READ THIS BEFORE JUSTIFYING IT ON PERFORMANCE
     It is NOT a fill-rate win over the billboard system, and the measured
     baseline says so plainly. The billboard path is already TWO instanced
     draws for the entire battlefield (billboard.js:135), it already rasterises
     into the half-res scene target on MEDIUM, and the whole billboard system
     costs 0.6-1.2 ms of a 23-25 ms frame. Deleting it outright buys under one
     frame per second. A march step is several times the cost of FSBB's single
     texture fetch plus multiply, so the same explosion costs roughly an order
     of magnitude MORE ALU here than it did as quads.

     What this actually buys:
       - COST BECOMES BOUNDED. steps x pixels, both clamped, instead of scaling
         with the number of simultaneous events. Ten detonations cost the same
         as three, only coarser.
       - Blend BANDWIDTH drops (~39 additive layers on a covered pixel become
         one composited layer), which is the half that matters on a tiler.
       - The SHAPE becomes the effect: a mushroom column really is a column,
         lit from above, self-shadowed, and cut correctly by the ridge in front
         of it. That is a LOOK argument, and it is the honest one.

     So this ships behind a quality gate with the sprite path intact as the
     fallback, and it is OFF on LOW. Do not present it as a speed-up.

   INTEGRATION CONTRACT
     volFxBurst(x, y, worldY, kind, radius, opts)   <- sim, gameplay thread
     volFxActive()                                   <- sim, to gate sprite smoke
     volFxDraw(dtDraw, Sun)                          <- render3d, once per frame
     volFxGLReset()                                  <- glrecover, after a restore
     volFxTelemetry()                                <- probes

     The sim call sites live in src/game/sim.js and are owned elsewhere; this
     file exposes the API and never reaches into the sim. Until those sites are
     wired the ring stays empty and the pass costs one early-out per frame.

   SCOPE COUPLING — everything below is read, never written:
     mesh.js   mkProg, GL_PROG_ERRORS, glEpoch, aoReady, aoW/aoH, aoFB2,
               aoColB, aoDepth, matV, matVP, orthoSpan, gfxTune
     hud.js    fogPointVisible          terrain.js  WATER_Y
     meta.js   GFX (volSteps optional; a preset-derived default is used when
               the key is absent, so this file works before meta.js is updated)
   ============================================================================ */

/* Kinds. Keep these numeric and stable: they are packed into an instance
   attribute and compared as floats in the shader. */
const VOL_BLAST = 0;      // detonation fireball: hot core, fast expansion
const VOL_SMOKE = 1;      // lingering smoke ball
const VOL_DUST  = 2;      // ground-rooted, vertically billowing collapse/shear dust
const VOL_PLUME = 3;      // mushroom column / singularity plume
const VOL_IMPACT= 4;      // compact depth-clipped projectile/beam contact burst
const VOL_TRAIL_ENERGY=5; // experimental swept plasma volume; probe-only until approved
const VOL_TRAIL_SHELL =6; // experimental combustion/soot volume; probe-only until approved
const VOL_TRAIL_CURVE_ENERGY=7; // one proxy sampling a fixed-step history texture
const VOL_TRAIL_CURVE_SHELL =8; // one advected combustion/soot history volume

/* Ring capacity. The arrays are always this size (48 * 16 floats = 3 KB of
   instance data worst case); the LIVE cap is a per-preset runtime limit so
   MEDIUM cannot queue a HIGH-preset workload. */
const VOL_CAP = 48;

/* Struct-of-arrays, allocated once, exactly the discipline sim.js uses for its
   particle ring. Dense prefix: [0, volN) is live, no holes, no GC.
   AXIS NOTE: the sim's (x,y) is the GROUND PLANE and terrainH(x,y) is world Y.
   These arrays store world XYZ with Y genuinely up, so the shader's .y means
   what it says. Callers pass (x, y, worldY) and this file does the swap. */
const volPX   = new Float32Array(VOL_CAP);   // world X
const volPY   = new Float32Array(VOL_CAP);   // world Y (UP)
const volPZ   = new Float32Array(VOL_CAP);   // world Z (the sim's y)
const volR0   = new Float32Array(VOL_CAP);   // spawn radius, world units
const volLife = new Float32Array(VOL_CAP);   // seconds
const volT    = new Float32Array(VOL_CAP);   // elapsed seconds
const volDens = new Float32Array(VOL_CAP);
const volEmis = new Float32Array(VOL_CAP);
const volRise = new Float32Array(VOL_CAP);   // world units/s along +Y
const volDX   = new Float32Array(VOL_CAP);
const volDZ   = new Float32Array(VOL_CAP);
const volSeed = new Float32Array(VOL_CAP);
/* Internal High/Cinematic material profiles.  This travels beside the seed in
   an existing instance lane, so a profile does not become another draw or
   another macro-FX layer. */
const volStyle= new Uint8Array(VOL_CAP);
const volAngle= new Float32Array(VOL_CAP);   // world XZ direction for impacts
/* Probe-only swept-trail axis and half length.  Keeping the full 3D tangent is
   essential: an artillery arc cannot be represented by the yaw-only impact
   orientation without turning each steep segment into a separate upright
   capsule at the RTS camera angle. */
const volTX   = new Float32Array(VOL_CAP);
const volTY   = new Float32Array(VOL_CAP);
const volTZ   = new Float32Array(VOL_CAP);
const volTHalf= new Float32Array(VOL_CAP);
const volAX   = new Float32Array(VOL_CAP);   // aspect
const volAY   = new Float32Array(VOL_CAP);
const volAZ   = new Float32Array(VOL_CAP);
const volKind = new Uint8Array(VOL_CAP);
const volTR   = new Uint8Array(VOL_CAP);
const volTG   = new Uint8Array(VOL_CAP);
const volTB   = new Uint8Array(VOL_CAP);
let   volN    = 0;

/* Draw-side scratch. Preallocated: this is per-frame code. */
const VOL_INST_FLOATS = 20;                                  // 80 B per instance
const volInstData = new Float32Array(VOL_CAP*VOL_INST_FLOATS);
const volOrder    = new Int32Array(VOL_CAP);
/* One bit per live proxy, rebuilt after a successful composite. Render-side
   fallback suppression queries this exact set instead of the old global
   `drawn>0`, which could hide a blast merely because an unrelated dust volume
   happened to render in the same frame. */
const volPresented = new Uint8Array(VOL_CAP);
const VOL_ZERO4   = new Float32Array([0,0,0,0]);
const volKey      = new Float32Array(VOL_CAP);
const volArea     = new Float32Array(VOL_CAP);

/* GL handles. Every one of these is invalidated by a context loss, which is
   what volEpoch is for. */
let volProg=null, volProgUp=null, volVAO=null, volEmptyVAO=null, volCubeVBO=null, volInstVBO=null;
let volNoiseTex=null, volDriverTex=null, volTrailHistoryTex=null, volFB=null, volTex=null;
let volW=0, volH=0, volFailN=0;
let volU={}, volUup={};
/* WHICH GL CONTEXT THESE HANDLES BELONG TO, and whether the build already
   failed on it. Both halves are load-bearing, and gpufx.js:44-48 records why:
   a lost context leaves volProg TRUTHY (so a `if(volProg) return` guard refuses
   to rebuild and the pass drives dead VAOs forever), and a failed build with no
   latch recompiles on EVERY burst on a device that cannot compile it. */
let volEpoch=-1, volInitFailed=false;
let volTime=0;

/* The authored 4x4 density/emission sheet is deliberately a MATERIAL DRIVER,
   not a substitute billboard.  It is sampled through object-space triplanar
   projections inside VOL_FS, where it modulates the existing 3D density and
   combustion field.  A one-pixel neutral texture is installed synchronously;
   decode/upload failure simply leaves driverReady false and the procedural
   raymarch keeps rendering. */
const VOL_DRIVER_UNIT=14;
const VOL_DRIVER_ASSET='assets/textures/vfx/mf-raymarch-density-emission-driver-v1.png';
let volDriverReady=false, volDriverState='uninitialised', volDriverError='';
let volDriverSerial=0;

/* Fixed-step projectile histories. A row is one projectile and a
   texel is one simulation-owned sample: world XYZ plus authored radius. The
   renderer never appends, ages, or reorders this data. RGBA32F is sample-only
   (never a render target), so WebGL2 provides it without a float colour-buffer
   extension. Twelve points keep the fragment loop bounded while remaining
   smooth at the intended tactical/command camera spans. */
const VOL_TRAIL_HISTORY_ROWS=8,VOL_TRAIL_HISTORY_POINTS=12;
const volTrailHistoryData=new Float32Array(VOL_TRAIL_HISTORY_ROWS*VOL_TRAIL_HISTORY_POINTS*4);
const volTrailHistoryUpload=new Float32Array(VOL_TRAIL_HISTORY_ROWS*VOL_TRAIL_HISTORY_POINTS*4);
const volTrailHistoryStamp=new Float32Array(VOL_TRAIL_HISTORY_ROWS*VOL_TRAIL_HISTORY_POINTS);
const volTrailHistoryCount=new Uint8Array(VOL_TRAIL_HISTORY_ROWS);
const volTrailHistoryKind=new Uint8Array(VOL_TRAIL_HISTORY_ROWS);
const volTrailHistoryUsed=new Uint8Array(VOL_TRAIL_HISTORY_ROWS);
const volTrailHistoryTint=new Uint8Array(VOL_TRAIL_HISTORY_ROWS*3);
const volTrailHistorySeed=new Float32Array(VOL_TRAIL_HISTORY_ROWS);
let volTrailHistoryRows=0,volTrailHistoryDirty=true,volTrailHistoryEpoch=-1;
const VOL_TRAIL_HISTORY_TELEM={rows:0,points:0,pushes:0,emits:0,uploads:0,
  pausedStable:0,ready:false,lastError:''};

/* Read-back for probes. Sampled AFTER volFxDraw in the same frame — the counts
   are not zeroed by the draw. (render3d.js:3204-3207 records the opposite
   mistake with bbIcon.n.) */
const VOLFX_TELEMETRY={live:0, drawn:0, steps:0, marchedPx:0, compositePx:0, budget:0,
                       progOK:false, glErr:0, w:0, h:0, culled:0,
                       presentedBlast:0,presentedDust:0,presentedImpact:0,
                       presentedTrailEnergy:0,presentedTrailShell:0,trailDriverReady:false,trailHistoryReady:false,
                       fallbackQueries:0,fallbackHits:0,lastError:'',
                       driverReady:false,driverState:'uninitialised',driverSamples:0,
                       driverAsset:VOL_DRIVER_ASSET,driverError:''};
function volFxTelemetry(){ return VOLFX_TELEMETRY; }
function volFxDriverTelemetry(){
  return {ready:!!volDriverReady,state:volDriverState,error:volDriverError,
    asset:VOL_DRIVER_ASSET,unit:VOL_DRIVER_UNIT,dimensions:[1024,1024],
    grid:[4,4],gutter:4};
}
function volFxPresentedAt(kind,x,y){
  kind=kind|0;x=Number(x);y=Number(y);
  VOLFX_TELEMETRY.fallbackQueries++;
  if(!Number.isFinite(x)||!Number.isFinite(y)) return false;
  for(let i=0;i<volN;i++){
    if(!volPresented[i]||volKind[i]!==kind) continue;
    const reach=Math.max(3,volR0[i]*.72),dx=volPX[i]-x,dy=volPZ[i]-y;
    if(dx*dx+dy*dy<=reach*reach){VOLFX_TELEMETRY.fallbackHits++;return true;}
  }
  return false;
}

/* ---------------------------------------------------------------------------
   QUALITY GATE
   The brief's warning is real: `perfScale > 0.48` is the most common effect
   gate in this codebase and it sits ABOVE the target device (perfScale 0.4125
   on medium), which is exactly the bug sim.js:4849-4854 documents. So
   perfScale appears here ONLY as a multiplier inside the step budget, NEVER as
   an on/off. The on/off gates are deterministic:
     volSteps() > 0   preset / Advanced setting
     aoReady && aoW   no offscreen path -> no sampleable depth -> no pass
     volProg          latched compile failure
   --------------------------------------------------------------------------- */
function volStepCeiling(){
  /* GFX.volSteps when meta.js carries it; otherwise derive from the preset so
     this module is useful before that edit lands. */
  if(typeof GFX!=='undefined'&&GFX&&typeof GFX.volSteps==='number') return GFX.volSteps|0;
  let q='high';
  if(typeof qualityKey==='function'){ try{ q=qualityKey(); }catch(e){} }
  return q==='low'?0 : q==='medium'?16 : q==='cinematic'?32 : 24;
}
/* Simulation intent is deliberately separate from render readiness. An event
   can occur while the AO/depth target is being resized or before the first
   offscreen frame has completed. Queue the density field for every tier that
   requests one; volFxDraw decides whether it can present this frame, while the
   already-armed flipbook remains the atomic failure fallback. */
function volFxEnabled(){ return volStepCeiling()>0; }
function volLiveCap(){ return volStepCeiling()<=16?24:VOL_CAP; }
function volIsTrailKind(k){
  return k===VOL_TRAIL_ENERGY||k===VOL_TRAIL_SHELL||
    k===VOL_TRAIL_CURVE_ENERGY||k===VOL_TRAIL_CURVE_SHELL;
}
function volFxActive(){
  if(!volFxEnabled()) return false;
  if(typeof gl==='undefined'||!gl) return false;
  if(typeof aoReady==='undefined'||!aoReady) return false;
  if(typeof aoW==='undefined'||!(aoW>0)||!(aoH>0)) return false;
  volFxCtxCheck();
  if(volInitFailed) return false;
  if(!volProg) volFxInit();
  return !!volProg;
}

/* ---------------------------------------------------------------------------
   HOP 1 — sim -> ring.  No allocation, no GL.
   --------------------------------------------------------------------------- */
function volFxBurst(x, y, worldY, kind, radius, opts){
  if(!(radius>0)) return -1;
  const o=opts||{};
  const k=kind|0;
  const style=Math.max(0,Math.min(volIsTrailKind(k)?15:3,o.style|0));
  const cap=volLiveCap();

  /* COALESCING. This is what makes the bounded-cost argument true: a cluster
     shell that fires 8 bomblets (sim.js:4959-4966) must produce ONE volume,
     not eight. Merge a same-kind neighbour that is still young. */
  const mergeR=radius*0.6;
  for(let i=0;i<volN;i++){
    /* A profile changes the material inside an otherwise identical volume.
       Do not merge a falling airframe's soot crown into a conventional blast:
       keeping their one-core recipes separate is cheaper and more legible than
       allowing the oldest profile to accidentally repaint the newer event. */
    if(volKind[i]!==k||volStyle[i]!==style) continue;
    const age=volLife[i]>0?volT[i]/volLife[i]:1;
    if(age>=0.25) continue;
    const dx=volPX[i]-x, dy=volPY[i]-worldY, dz=volPZ[i]-y;
    if(dx*dx+dy*dy+dz*dz > mergeR*mergeR) continue;
    volR0[i]=Math.max(volR0[i], radius);
    volDens[i]=Math.min(2.6, volDens[i]+0.18);
    if(o.emis>volEmis[i]) volEmis[i]=o.emis;
    const want=(o.life>0?o.life:volLife[i]);
    volLife[i]=Math.max(volLife[i], volT[i]+want);
    return i;
  }

  let s;
  if(volN<cap){ s=volN++; }
  else{
    /* Evict the OLDEST by age, never the newest. A fresh detonation must always
       be visible; a three-second-old smoke ball losing its last half second is
       something no player will ever see. */
    s=0; let worst=-1;
    for(let i=0;i<volN;i++){
      const age=volLife[i]>0?volT[i]/volLife[i]:1;
      if(age>worst){ worst=age; s=i; }
    }
  }

  /* A NEW or EVICTED slot must never inherit the previous occupant's
     presentation bit. render3d suppresses an event's armed flipbook when the
     matching proxy reports "presented", so a stale bit makes a brand-new
     detonation hide its own fallback for a composite that belonged to a
     different explosion — the frame then shows neither the volume nor the
     card, which is the exact non-atomic failure this bit exists to prevent. */
  volPresented[s]=0;
  const tint=o.tint;
  volPX[s]=x; volPY[s]=worldY; volPZ[s]=y;
  volR0[s]=radius;
  volLife[s]=o.life>0?o.life:(k===VOL_IMPACT?.46:k===VOL_BLAST?2.6:k===VOL_PLUME?7.0:3.4);
  volT[s]=0;
  volKind[s]=k;
  volDens[s]=o.dens>0?o.dens:(k===VOL_DUST?0.85:1.0);
  volEmis[s]=o.emis>0?o.emis:0;
  volRise[s]=(o.rise!=null)?o.rise:(k===VOL_PLUME?26:k===VOL_BLAST?9:k===VOL_IMPACT?2:3);
  volDX[s]=o.drift?o.drift[0]:0;
  volDZ[s]=o.drift?o.drift[1]:0;
  volSeed[s]=Number.isFinite(o.seed)?Math.max(0,Math.min(63.999,o.seed)):Math.random()*64;
  volStyle[s]=style;
  if(o.direction&&Number.isFinite(o.direction[0])&&Number.isFinite(o.direction[1]))
    volAngle[s]=Math.atan2(o.direction[1],o.direction[0]);
  else volAngle[s]=volSeed[s]*1.61803398875;
  if(o.trailAxis&&Number.isFinite(o.trailAxis[0])&&Number.isFinite(o.trailAxis[1])&&
      Number.isFinite(o.trailAxis[2])&&o.trailHalf>0){
    volTX[s]=o.trailAxis[0];volTY[s]=o.trailAxis[1];volTZ[s]=o.trailAxis[2];volTHalf[s]=o.trailHalf;
  }else{
    volTX[s]=0;volTY[s]=0;volTZ[s]=0;volTHalf[s]=0;
  }
  if(o.aspect){ volAX[s]=o.aspect[0]; volAY[s]=o.aspect[1]; volAZ[s]=o.aspect[2]; }
  else if(k===VOL_DUST){ volAX[s]=1.35; volAY[s]=0.85; volAZ[s]=1.35; }
  else if(k===VOL_PLUME){ volAX[s]=1.20; volAY[s]=3.60; volAZ[s]=1.20; }
  else if(k===VOL_IMPACT){ volAX[s]=1.45; volAY[s]=1.65; volAZ[s]=1.45; }
  else { volAX[s]=1.30; volAY[s]=3.20; volAZ[s]=1.30; }
  if(tint){ volTR[s]=tint[0]|0; volTG[s]=tint[1]|0; volTB[s]=tint[2]|0; }
  else if(k===VOL_DUST){ volTR[s]=196; volTG[s]=178; volTB[s]=150; }
  else if(k===VOL_BLAST){ volTR[s]=118; volTG[s]=112; volTB[s]=108; }
  else { volTR[s]=134; volTG[s]=130; volTB[s]=128; }
  return s;
}

/* Age the ring. Swap-down removal keeps the prefix dense with no holes. */
function volFxTick(dt){
  if(!(dt>0)) dt=0;
  volTime+=dt;
  for(let i=0;i<volN;){
    volT[i]+=dt;
    if(volLife[i]<=0||volT[i]>=volLife[i]){
      const j=--volN;
      if(j!==i){
        volPX[i]=volPX[j]; volPY[i]=volPY[j]; volPZ[i]=volPZ[j];
        volR0[i]=volR0[j]; volLife[i]=volLife[j]; volT[i]=volT[j];
        volDens[i]=volDens[j]; volEmis[i]=volEmis[j]; volRise[i]=volRise[j];
        volDX[i]=volDX[j]; volDZ[i]=volDZ[j]; volSeed[i]=volSeed[j]; volStyle[i]=volStyle[j];
        volAngle[i]=volAngle[j];
        volTX[i]=volTX[j];volTY[i]=volTY[j];volTZ[i]=volTZ[j];volTHalf[i]=volTHalf[j];
        volAX[i]=volAX[j]; volAY[i]=volAY[j]; volAZ[i]=volAZ[j];
        volKind[i]=volKind[j]; volTR[i]=volTR[j]; volTG[i]=volTG[j]; volTB[i]=volTB[j];
        /* The presentation bit is indexed by SLOT, so swap-down removal has to
           carry it with the event it describes; otherwise the surviving volume
           inherits a dead neighbour's bit and suppresses the wrong fallback. */
        volPresented[i]=volPresented[j];
      }
      volPresented[j]=0; volStyle[j]=0;
      continue;
    }
    volPY[i]+=volRise[i]*dt;
    volPX[i]+=volDX[i]*dt;
    volPZ[i]+=volDZ[i]*dt;
    volRise[i]*=Math.pow(0.62, dt);          // buoyancy bleeds off
    i++;
  }
}
function volFxClear(){ volN=0;volPresented.fill(0);volStyle.fill(0); }

/* ---------------------------------------------------------------------------
   FIXED-STEP TRAIL HISTORY — simulation writes, renderer reads.
   --------------------------------------------------------------------------- */
function volFxTrailHistoryReset(){
  volTrailHistoryCount.fill(0);volTrailHistoryKind.fill(0);volTrailHistoryUsed.fill(0);
  volTrailHistoryData.fill(0);volTrailHistoryUpload.fill(0);
  volTrailHistoryRows=0;volTrailHistoryDirty=true;
  VOL_TRAIL_HISTORY_TELEM.rows=0;VOL_TRAIL_HISTORY_TELEM.points=0;
  VOL_TRAIL_HISTORY_TELEM.pushes=0;VOL_TRAIL_HISTORY_TELEM.emits=0;
  VOL_TRAIL_HISTORY_TELEM.pausedStable=0;VOL_TRAIL_HISTORY_TELEM.lastError='';
}
function volFxTrailHistoryBegin(kind,opts){
  let row=-1;
  for(let i=0;i<VOL_TRAIL_HISTORY_ROWS;i++)if(!volTrailHistoryUsed[i]){row=i;break;}
  if(row<0)return -1;
  const o=opts||{};volTrailHistoryUsed[row]=1;volTrailHistoryRows=Math.max(volTrailHistoryRows,row+1);
  const k=(kind|0)===VOL_TRAIL_SHELL||(kind|0)===VOL_TRAIL_CURVE_SHELL
    ?VOL_TRAIL_CURVE_SHELL:VOL_TRAIL_CURVE_ENERGY;
  volTrailHistoryKind[row]=k;volTrailHistoryCount[row]=0;
  const rb=row*VOL_TRAIL_HISTORY_POINTS,db=rb*4;
  volTrailHistoryData.fill(0,db,db+VOL_TRAIL_HISTORY_POINTS*4);
  volTrailHistoryUpload.fill(0,db,db+VOL_TRAIL_HISTORY_POINTS*4);
  volTrailHistoryStamp.fill(0,rb,rb+VOL_TRAIL_HISTORY_POINTS);
  const tint=o.tint||(k===VOL_TRAIL_CURVE_ENERGY?[206,132,255]:[255,118,38]);
  const to=row*3;volTrailHistoryTint[to]=tint[0]|0;volTrailHistoryTint[to+1]=tint[1]|0;volTrailHistoryTint[to+2]=tint[2]|0;
  volTrailHistorySeed[row]=Number.isFinite(o.seed)?Math.max(0,Math.min(63.999,o.seed)):7.25;
  let used=0;for(let i=0;i<VOL_TRAIL_HISTORY_ROWS;i++)used+=volTrailHistoryUsed[i]?1:0;
  VOL_TRAIL_HISTORY_TELEM.rows=used;volTrailHistoryDirty=true;return row;
}
function volFxTrailHistoryPush(row,x,z,worldY,stamp){
  row|=0;if(row<0||row>=volTrailHistoryRows||!volTrailHistoryUsed[row])return false;
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(worldY)||!Number.isFinite(stamp))return false;
  let n=volTrailHistoryCount[row]|0;
  const rb=row*VOL_TRAIL_HISTORY_POINTS,db=rb*4;
  if(n>=VOL_TRAIL_HISTORY_POINTS){
    volTrailHistoryData.copyWithin(db,db+4,db+VOL_TRAIL_HISTORY_POINTS*4);
    volTrailHistoryStamp.copyWithin(rb,rb+1,rb+VOL_TRAIL_HISTORY_POINTS);
    n=VOL_TRAIL_HISTORY_POINTS-1;
  }
  const o=db+n*4;volTrailHistoryData[o]=x;volTrailHistoryData[o+1]=worldY;volTrailHistoryData[o+2]=z;volTrailHistoryData[o+3]=0;
  volTrailHistoryStamp[rb+n]=stamp;volTrailHistoryCount[row]=n+1;
  volTrailHistoryDirty=true;VOL_TRAIL_HISTORY_TELEM.pushes++;
  let total=0;for(let r=0;r<volTrailHistoryRows;r++)total+=volTrailHistoryCount[r];
  VOL_TRAIL_HISTORY_TELEM.points=total;return true;
}
function volFxTrailHistoryEmit(row,opts){
  row|=0;if(row<0||row>=volTrailHistoryRows||!volTrailHistoryUsed[row])return -1;
  const n=volTrailHistoryCount[row]|0;if(n<2)return -1;
  const o=opts||{},k=volTrailHistoryKind[row],rb=row*VOL_TRAIL_HISTORY_POINTS,db=rb*4;
  const widthScale=Math.max(.12,Math.min(2,Number(o.widthScale)||1)),noHead=!!o.noHead;
  const newest=volTrailHistoryStamp[rb+n-1],oldest=volTrailHistoryStamp[rb],duration=Math.max(1e-4,newest-oldest);
  let minX=1e9,minY=1e9,minZ=1e9,maxX=-1e9,maxY=-1e9,maxZ=-1e9,maxR=1;
  /* Keep a small screen-space floor without baking one camera distance into
     the authored history. `orthoSpan / VH` is the engine's established
     world-units-per-CSS-pixel conversion (billboard.js/input.js). The floor is
     evaluated only when the fixed-step history is emitted; rendering paused
     frames still cannot mutate the field or grow the pool. */
  const worldPx=(typeof orthoSpan==='number'&&typeof VH==='number'&&VH>0)
    ?Math.max(.24,orthoSpan/VH):.58;
  for(let i=0;i<n;i++){
    const so=db+i*4,age=Math.max(0,Math.min(1,(newest-volTrailHistoryStamp[rb+i])/duration));
    let x=volTrailHistoryData[so],y=volTrailHistoryData[so+1],z=volTrailHistoryData[so+2];
    /* The uploaded centreline is the projectile's real deterministic history.
       Turbulence belongs in the density field, not in a CPU-side displacement
       that makes the old wake detach from the ballistic arc. */
    const width=(k===VOL_TRAIL_CURVE_ENERGY
      ?Math.max(worldPx*6.40,3.2+2.4*(1-age))
      :Math.max(worldPx*8.80,5.4+5.0*age))*widthScale;
    volTrailHistoryUpload[so]=x;volTrailHistoryUpload[so+1]=y;volTrailHistoryUpload[so+2]=z;volTrailHistoryUpload[so+3]=width;
    minX=Math.min(minX,x-width);maxX=Math.max(maxX,x+width);minY=Math.min(minY,y-width);maxY=Math.max(maxY,y+width);minZ=Math.min(minZ,z-width);maxZ=Math.max(maxZ,z+width);maxR=Math.max(maxR,width);
  }
  /* The projectile/head is an elongated part of the same volume. Give its
     terminal ellipsoid enough proxy room so it cannot be clipped at the last
     history sample. */
  const ho=db+(n-1)*4,hx=volTrailHistoryUpload[ho],hy=volTrailHistoryUpload[ho+1],hz=volTrailHistoryUpload[ho+2];
  const headPad=volTrailHistoryUpload[ho+3]*(noHead?.42:(k===VOL_TRAIL_CURVE_ENERGY?1.85:2.20));
  minX=Math.min(minX,hx-headPad);maxX=Math.max(maxX,hx+headPad);
  minY=Math.min(minY,hy-headPad);maxY=Math.max(maxY,hy+headPad);
  minZ=Math.min(minZ,hz-headPad);maxZ=Math.max(maxZ,hz+headPad);
  const last=db+(n-1)*4;
  for(let i=n;i<VOL_TRAIL_HISTORY_POINTS;i++)volTrailHistoryUpload.set(volTrailHistoryUpload.subarray(last,last+4),db+i*4);
  volTrailHistoryDirty=true;
  const cx=(minX+maxX)*.5,cy=(minY+maxY)*.5,cz=(minZ+maxZ)*.5;
  const tintOff=row*3,tint=[volTrailHistoryTint[tintOff],volTrailHistoryTint[tintOff+1],volTrailHistoryTint[tintOff+2]];
  const life=o.life>0?o.life:.28,dens=o.dens||(k===VOL_TRAIL_CURVE_ENERGY?1.72:2.10),
    emis=o.emis||(k===VOL_TRAIL_CURVE_ENERGY?2.05:1.08),aspect=[Math.max(1,(maxX-minX)*.5),Math.max(1,(maxY-minY)*.5),Math.max(1,(maxZ-minZ)*.5)];
  /* Refresh one proxy per row from fixed-step simulation. Searching the tiny
     bounded volume ring is safer than caching a slot index because volFxTick
     compacts the ring when unrelated smoke expires. No render call can grow
     this pool or advance its lifetime. */
  let slot=-1;
  for(let i=0;i<volN;i++)if(volKind[i]===k&&volStyle[i]===row&&volTX[i]===row){slot=i;break;}
  if(slot<0)slot=volFxBurst(cx,cz,cy,k,1,{life,rise:0,dens,emis,aspect,
    trailAxis:[row,n,noHead?1:0],trailHalf:1,tint,style:row,seed:volTrailHistorySeed[row]});
  else{
    volPresented[slot]=0;volPX[slot]=cx;volPY[slot]=cy;volPZ[slot]=cz;volR0[slot]=1;
    volLife[slot]=life;volT[slot]=0;volDens[slot]=dens;volEmis[slot]=emis;volRise[slot]=0;
    volDX[slot]=volDZ[slot]=0;volTX[slot]=row;volTY[slot]=n;volTZ[slot]=noHead?1:0;volTHalf[slot]=1;
    volAX[slot]=aspect[0];volAY[slot]=aspect[1];volAZ[slot]=aspect[2];
    volTR[slot]=tint[0]|0;volTG[slot]=tint[1]|0;volTB[slot]=tint[2]|0;
  }
  if(slot>=0){volT[slot]=Math.max(0,Math.min(.9,Number(o.age)||0))*volLife[slot];VOL_TRAIL_HISTORY_TELEM.emits++;}
  return slot;
}
function volFxTrailHistoryRelease(row,fade){
  row|=0;if(row<0||row>=VOL_TRAIL_HISTORY_ROWS||!volTrailHistoryUsed[row])return false;
  const k=volTrailHistoryKind[row];
  for(let i=0;i<volN;i++)if(volKind[i]===k&&volStyle[i]===row&&volTX[i]===row){
    const left=Math.max(.04,Number(fade)||.12);volLife[i]=Math.min(volLife[i],volT[i]+left);
  }
  volTrailHistoryUsed[row]=0;volTrailHistoryCount[row]=0;volTrailHistoryDirty=true;
  let used=0,points=0;for(let i=0;i<VOL_TRAIL_HISTORY_ROWS;i++)if(volTrailHistoryUsed[i]){used++;points+=volTrailHistoryCount[i];}
  VOL_TRAIL_HISTORY_TELEM.rows=used;VOL_TRAIL_HISTORY_TELEM.points=points;return true;
}
function volFxTrailHistoryTelemetry(){
  return {rows:VOL_TRAIL_HISTORY_TELEM.rows,points:VOL_TRAIL_HISTORY_TELEM.points,pushes:VOL_TRAIL_HISTORY_TELEM.pushes,
    emits:VOL_TRAIL_HISTORY_TELEM.emits,uploads:VOL_TRAIL_HISTORY_TELEM.uploads,pausedStable:VOL_TRAIL_HISTORY_TELEM.pausedStable,
    ready:VOL_TRAIL_HISTORY_TELEM.ready,lastError:VOL_TRAIL_HISTORY_TELEM.lastError};
}
function volFxTrailHistoryTexture(){
  if(typeof gl==='undefined'||!gl)return null;
  const ep=typeof glEpoch==='number'?glEpoch:0;
  if(volTrailHistoryEpoch!==ep){volTrailHistoryEpoch=ep;volTrailHistoryTex=null;volTrailHistoryDirty=true;}
  const wasActive=gl.getParameter(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE10);const wasTex=gl.getParameter(gl.TEXTURE_BINDING_2D);
  try{
    if(!volTrailHistoryTex){
      volTrailHistoryTex=gl.createTexture();if(!volTrailHistoryTex)throw new Error('trail history texture allocation failed');
      gl.bindTexture(gl.TEXTURE_2D,volTrailHistoryTex);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,VOL_TRAIL_HISTORY_POINTS,VOL_TRAIL_HISTORY_ROWS,0,gl.RGBA,gl.FLOAT,volTrailHistoryUpload);
      volTrailHistoryDirty=false;VOL_TRAIL_HISTORY_TELEM.uploads++;
    }else if(volTrailHistoryDirty){
      gl.bindTexture(gl.TEXTURE_2D,volTrailHistoryTex);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,VOL_TRAIL_HISTORY_POINTS,VOL_TRAIL_HISTORY_ROWS,gl.RGBA,gl.FLOAT,volTrailHistoryUpload);
      volTrailHistoryDirty=false;VOL_TRAIL_HISTORY_TELEM.uploads++;
    }
    VOL_TRAIL_HISTORY_TELEM.ready=true;VOL_TRAIL_HISTORY_TELEM.lastError='';return volTrailHistoryTex;
  }catch(e){VOL_TRAIL_HISTORY_TELEM.ready=false;VOL_TRAIL_HISTORY_TELEM.lastError=String(e&&e.message||e);return null;}
  finally{gl.bindTexture(gl.TEXTURE_2D,wasTex);gl.activeTexture(wasActive);}
}

/* Growth curve per kind. Age is the ONLY animation input the shader gets, so
   the CPU and the GPU must agree on the world extents or the march will start
   outside the density it is looking for. */
function volGrow(kind, age, style){
  if(volIsTrailKind(kind))return 1.0;
  if(kind===VOL_DUST)  return 0.45+1.25*age;
  if(kind===VOL_PLUME) return 0.50+0.95*age;
  if(kind===VOL_BLAST) return 0.50+0.90*age;
  /* A phase contact is a fast, bounded displacement of the field rather than
     a combustion balloon.  The generic impact curve grows 4.1x before it
     dies, which made the late void frames become a large purple sphere.  Hold
     the white-violet contact near its authored scale, then collapse it. */
  if(kind===VOL_IMPACT&&(style|0)===2){
    const ignite=age<=0?0:age>=.32?1:(age/.32)*(age/.32)*(3-2*(age/.32));
    const cq=Math.max(0,Math.min(1,(age-.42)/.50));
    const collapse=cq*cq*(3-2*cq);
    return (.56+.34*ignite)*(1-.32*collapse);
  }
  if(kind===VOL_IMPACT)return 0.35+1.10*Math.min(1,age/.72);
  return 0.55+0.90*age;
}
/* Keep distant High/Cinematic volumes volumetric instead of letting a valid
   proxy collapse below a handful of half-resolution pixels. This is a small
   screen-space floor, capped so it cannot turn a tactical blast into a giant
   strategic cloud. The same value is used for culling and instance packing. */
function volRenderGrow(kind,age,r0,pxPerWorld,ax,ay,az,style){
  let g=volGrow(kind,age,style)*r0;
  const projected=g*Math.max(ax,ay,az)*Math.max(.001,pxPerWorld);
  if(projected<5.5) g*=Math.min(1.65,5.5/Math.max(.25,projected));
  return g;
}

/* ---------------------------------------------------------------------------
   NOISE — 32^3 RGBA8, 131 KB, generated once.
   R/G/B are tileable value noise at lattice 4 / 8 / 16 (three FBM octaves out
   of ONE texture fetch); A is an inverted Worley F1 at lattice 6, which is the
   cauliflower billow on the silhouette. Small enough to sit in texture cache
   for the whole pass, which is why this beats analytic hash noise on a mobile
   ALU budget.
   --------------------------------------------------------------------------- */
function volNoiseBuild(){
  const N=32, out=new Uint8Array(N*N*N*4);
  const hash=(a)=>{ a=(a^61)^(a>>>16); a=(a+(a<<3))|0; a^=a>>>4; a=Math.imul(a,0x27d4eb2d); a^=a>>>15; return (a>>>0)/4294967296; };
  const lat=(L,x,y,z)=>hash(((x%L+L)%L) + ((y%L+L)%L)*L + ((z%L+L)%L)*L*L + L*7919);
  const sm=(t)=>t*t*(3-2*t);
  const value=(L,fx,fy,fz)=>{
    const gx=fx*L, gy=fy*L, gz=fz*L;
    const x0=Math.floor(gx), y0=Math.floor(gy), z0=Math.floor(gz);
    const tx=sm(gx-x0), ty=sm(gy-y0), tz=sm(gz-z0);
    const c=(dx,dy,dz)=>lat(L,x0+dx,y0+dy,z0+dz);
    const l=(a,b,t)=>a+(b-a)*t;
    const x00=l(c(0,0,0),c(1,0,0),tx), x10=l(c(0,1,0),c(1,1,0),tx);
    const x01=l(c(0,0,1),c(1,0,1),tx), x11=l(c(0,1,1),c(1,1,1),tx);
    return l(l(x00,x10,ty), l(x01,x11,ty), tz);
  };
  /* Worley feature points, one per cell of a 6^3 lattice, wrapped. */
  const WL=6, fp=new Float32Array(WL*WL*WL*3);
  for(let z=0;z<WL;z++) for(let y=0;y<WL;y++) for(let x=0;x<WL;x++){
    const i=(z*WL*WL+y*WL+x)*3;
    fp[i  ]=(x+hash(i+11))/WL;
    fp[i+1]=(y+hash(i+29))/WL;
    fp[i+2]=(z+hash(i+53))/WL;
  }
  const wrapD=(a,b)=>{ let d=a-b; if(d>0.5) d-=1; else if(d<-0.5) d+=1; return d; };
  for(let z=0;z<N;z++) for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    const fx=x/N, fy=y/N, fz=z/N;
    const o=((z*N+y)*N+x)*4;
    out[o  ]=Math.max(0,Math.min(255, (value( 4,fx,fy,fz)*255)|0));
    out[o+1]=Math.max(0,Math.min(255, (value( 8,fx,fy,fz)*255)|0));
    out[o+2]=Math.max(0,Math.min(255, (value(16,fx,fy,fz)*255)|0));
    let best=4;
    const cx=Math.floor(fx*WL), cy=Math.floor(fy*WL), cz=Math.floor(fz*WL);
    for(let dz=-1;dz<=1;dz++) for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      const ix=((cx+dx)%WL+WL)%WL, iy=((cy+dy)%WL+WL)%WL, iz=((cz+dz)%WL+WL)%WL;
      const i=(iz*WL*WL+iy*WL+ix)*3;
      const ax=wrapD(fx,fp[i]), ay=wrapD(fy,fp[i+1]), az=wrapD(fz,fp[i+2]);
      const d=ax*ax+ay*ay+az*az;
      if(d<best) best=d;
    }
    const f1=Math.min(1, Math.sqrt(best)*WL*1.15);
    out[o+3]=Math.max(0,Math.min(255,(f1*255)|0));
  }
  return out;
}

/* ---------------------------------------------------------------------------
   SHADERS
   --------------------------------------------------------------------------- */
const VOL_VS=`#version 300 es
layout(location=0) in vec3 aPos;    // unit cube, -1..1, divisor 0
layout(location=1) in vec4 aCtr;    // cx, cy(worldY), cz, ageNorm
layout(location=2) in vec4 aExt;    // half-extents xyz, kind
layout(location=3) in vec4 aPar;    // dens, emis, seed, LIFE SECONDS
layout(location=4) in vec4 aTint;   // albedo rgb, softness
layout(location=5) in vec4 aTrail;  // world tangent xyz, capsule half-length
uniform mat4 uVP;
flat out vec4 vCtr;
flat out vec4 vExt;
flat out vec4 vPar;
flat out vec4 vTint;
flat out vec4 vTrail;
out vec3 vWorld;
void main(){
  vCtr=aCtr; vExt=aExt; vPar=aPar; vTint=aTint; vTrail=aTrail;
  vWorld=aCtr.xyz + aPos*aExt.xyz;
  gl_Position=uVP*vec4(vWorld,1.0);
}`;

/* The march. Everything about this shader is shaped by three facts:
     1. The camera is ORTHOGRAPHIC (mesh.js:3277), so the ray direction is a
        per-frame CONSTANT: no matrix inverse, no perspective divide, and the
        Henyey-Greenstein phase can be evaluated once on the CPU.
     2. Depth is LINEAR in window z under that projection, and the conversion
        constant is far-near = 15000 — the same number FSAO already hardcodes
        as uWorldPerZ (mesh.js:2609). COUPLING: if m4ortho's near/far in
        camUpdateMatrices ever change, BOTH call sites must change.
     3. The target is RGBA8 (it matches aoColB), so the hot core clips to white
        before it reads as hot. That is why this pass is inserted where bloom
        can still see it. */
const VOL_FS=`#version 300 es
precision highp float;
precision highp sampler3D;
precision highp sampler2D;

flat in vec4 vCtr;
flat in vec4 vExt;
flat in vec4 vPar;
flat in vec4 vTint;
flat in vec4 vTrail;
in vec3 vWorld;

uniform sampler3D uNoise;
uniform sampler2D uDep;
/* Packed authored field: R density, G emission, B soot, A support.  It is
   never drawn as a screen-facing image; driverUV receives object-space planes
   below and the result only modulates the procedural 3D material. */
uniform sampler2D uDriver;
uniform float uDriverReady;
uniform sampler2D uTrailDriver;
uniform float uTrailDriverReady;
uniform sampler2D uTrailHistory;
uniform float uTrailHistoryReady;
uniform vec3  uRayDir;
uniform vec3  uSunDir;
uniform vec3  uSunCol;
uniform vec3  uAmbSky;
uniform vec3  uAmbGnd;
uniform vec3  uWind;
uniform vec2  uInvVolSize;
uniform float uWorldPerPx;
uniform float uDepthScale;   // far - near = 15000, see note above
uniform float uSigma;
uniform float uPhase;
uniform float uTime;
uniform float uWaterOn;
uniform float uWaterY;
uniform int   uSteps;
out vec4 o;

/* THE JITTER IS OBJECT-SPACE, NOT A SCREEN GRID.
   This used to be a 4x4 ordered Bayer matrix indexed by gl_FragCoord. At 24-32
   steps over a dense field that printed a visible crosshatch directly onto the
   fireball — the hex/diamond weave in the 02f-02h bombard captures is exactly
   it — and because it was pinned to the screen it slid across the volume as
   the camera moved. Offsetting the first sample by a tileable-noise lookup at
   the ray's OBJECT-SPACE entry point gives a blue-noise-like offset that is
   attached to the volume: it cannot align to the pixel grid and cannot crawl,
   and it is stable frame to frame with no temporal term (mesh.js:2262-2265
   records what per-frame rotation without TAA did last time). */

/* Three FBM octaves out of ONE fetch: R/G/B are tileable value noise at
   lattice 4/8/16, A is an inverted Worley F1 (the cauliflower billow). */
float fbm3(vec4 n){ return n.r*0.52+n.g*0.30+n.b*0.18; }

/* Uniform Catmull-Rom centreline reconstruction. The simulation uploads only
   fixed-step points; the renderer evaluates a C1 curve between them. This
   removes the exposed straight-segment joints without creating more trail
   instances or allowing render cadence to author new history. */
vec3 trailCatmull(vec3 p0,vec3 p1,vec3 p2,vec3 p3,float t){
  float t2=t*t,t3=t2*t;
  return 0.5*((2.0*p1)+(-p0+p2)*t+(2.0*p0-5.0*p1+4.0*p2-p3)*t2+(-p0+3.0*p1-3.0*p2+p3)*t3);
}
vec3 trailCatmullTangent(vec3 p0,vec3 p1,vec3 p2,vec3 p3,float t){
  float t2=t*t;
  return 0.5*((-p0+p2)+2.0*(2.0*p0-5.0*p1+4.0*p2-p3)*t+3.0*(-p0+3.0*p1-3.0*p2+p3)*t2);
}

/* A cell-local UV with a literal four-texel guard band.  The baked atlas is
   4x4 cells at 256px each, with 248px authored content inset by 4px.  Keeping
   every filtered coordinate inside that region prevents frame bleeding without
   needing a second draw or an animated billboard. */
vec2 driverUV(vec2 plane,float frame){
  vec2 inner=vec2(4.5/256.0);
  vec2 scale=vec2(247.0/256.0);
  vec2 local=inner+clamp(plane*0.5+0.5,0.0,1.0)*scale;
  vec2 cell=vec2(mod(frame,4.0),floor(frame*0.25));
  return (cell+local)*0.25;
}

/* Project the same authored density/emission stage along all three local axes.
   The weights are derived from the world/object-space surface coordinate, so
   the art influences a real volume and cannot remain flat to the camera. */
vec4 driverTriplanar(vec3 p,float frame){
  vec3 w=pow(abs(p)+vec3(0.035),vec3(1.35));
  w/=max(1e-4,w.x+w.y+w.z);
  vec4 yz=texture(uDriver,driverUV(vec2(p.z,p.y),frame));
  vec4 xz=texture(uDriver,driverUV(vec2(p.x,p.z),frame));
  vec4 xy=texture(uDriver,driverUV(vec2(p.x,p.y),frame));
  return yz*w.x+xz*w.y+xy*w.z;
}

/* Soft shoulder, with the amount of compression left to the CALLER.
   A single fixed shoulder was wrong in both directions: hard clipping
   flat-topped the fireball into white polygons, but compressing everything
   equally drained the punch out of heavy ordnance. Heavy events pass a small k
   so they can genuinely blow out; light contacts pass a large k and stay
   controlled. */
vec3 shoulder(vec3 c,float k){ return c/(1.0+c*k); }

void main(){
  float kind=vExt.w;
  float age=vCtr.w;
  /* Lane z holds a stable 0..64 noise seed plus a tiny internal material
     profile in 64-wide bands.  Reusing the seed lane keeps the existing
     16-float instance ABI intact: this is still one instanced volume draw. */
  float profile=floor(vPar.z*(1.0/64.0));
  float seed=vPar.z-profile*64.0;

  /* --- slab intersection, world units, sign-agnostic ---------------------
     vWorld is the BACK face of the proxy (we cull FRONT), so both roots are
     negative offsets along uRayDir. */
  vec3 iD=1.0/uRayDir;
  vec3 t0=(vCtr.xyz-vExt.xyz-vWorld)*iD;
  vec3 t1=(vCtr.xyz+vExt.xyz-vWorld)*iD;
  vec3 tn=min(t0,t1), tf=max(t0,t1);
  float tEnter=max(max(tn.x,tn.y),tn.z);
  float tExit =min(min(tf.x,tf.y),tf.z);

  /* --- scene depth termination ------------------------------------------ */
  vec2 uv=gl_FragCoord.xy*uInvVolSize;
  vec2 h=uInvVolSize*0.25;
  float dz=min(min(texture(uDep,uv+vec2( h.x, h.y)).r, texture(uDep,uv+vec2(-h.x, h.y)).r),
               min(texture(uDep,uv+vec2( h.x,-h.y)).r, texture(uDep,uv+vec2(-h.x,-h.y)).r));
  float tHere =gl_FragCoord.z*uDepthScale;
  float tScene=dz*uDepthScale;
  tExit=min(tExit, tScene-tHere);
  if(uWaterOn>0.5&&uRayDir.y<0.0) tExit=min(tExit,(uWaterY-vWorld.y)/uRayDir.y);
  tEnter=max(tEnter,-tHere);
  float span=tExit-tEnter;
  if(span<=0.0) discard;

  float steps=float(uSteps);
  float ds=span/steps;
  /* Object-space blue-noise jitter (see the note above the helpers). */
  vec3 pEnter=vWorld+uRayDir*tEnter;
  vec3 jq=(pEnter-vCtr.xyz)/max(vec3(1e-3),vExt.xyz);
  float jit=texture(uNoise,jq*2.7+vec3(seed*0.37)).g;
  float t=tEnter+ds*clamp(jit,0.02,0.98);

  vec3  acc=vec3(0.0);
  float T=1.0;

  float progress=clamp(age,0.0,1.0);

  /* ---- CHRONOLOGY: ONE core, four explicit stages, ABSOLUTE seconds --------
     vPar.w carries the event's life in seconds (it used to carry a world
     radius that this shader never read). Absolute time is required because a
     100 ms flash is 6% of a 1.6 s bombardment but 22% of a 0.46 s contact hit
     — a single normalised threshold cannot express "sub-100 ms" for both.
       flash       t < ~0.10 s   compact, white-hot, high emission
       combustion  -> ~40% life  orange/yellow rolling fire
       soot        -> ~78% life  lobes separate, fire retreats into cavities
       smoke       -> end        translucent grey that thins rather than
                                 collapsing into an opaque black disc          */
  float life=max(0.08,vPar.w);
  float tSec=progress*life;

  /* ONE CLOCK PER BOUNDARY. sBurn used to RISE on absolute seconds and FALL on
     normalised progress. Below a life of about 0.40 s the fall opened before the
     rise had finished, so combustion never reached full weight — that is exactly
     why small contacts read as having no energy. Both knees are now in seconds,
     with the fall floored so a short event still gets a real burn plateau. */
  float sFlash=1.0-smoothstep(0.040,0.105,tSec);
  float tFall=max(0.34*life,0.18);
  float sBurn =smoothstep(0.03,0.12,tSec)*(1.0-smoothstep(tFall,tFall*1.70,tSec));
  /* sootHold is MONOTONE. The tint, extinction and cavity consumers must not let
     soot brighten back up over the tail — the bump form did, by 23%, directly
     contradicting the "then HOLD" intent written above them. The decaying bump
     survives only as the emission gate, where a fading ember residual is right. */
  float sootHold=smoothstep(0.30,0.60,progress);
  float sSoot =sootHold*(1.0-smoothstep(0.72,0.95,progress));
  float sSmoke=smoothstep(0.62,0.97,progress);

  for(int i=0;i<64;i++){
    if(i>=uSteps) break;
    vec3 p=vWorld+uRayDir*t;
    t+=ds;

    vec3 localP=(p-vCtr.xyz)/vExt.xyz;
    float isImpact=1.0-step(0.45,abs(kind-4.0));
    float isVoidImpact=isImpact*(1.0-step(0.45,abs(profile-2.0)));
    float isDust  =1.0-step(0.45,abs(kind-2.0));
    float isBlast =1.0-step(0.45,abs(kind));
    float isSmoke =1.0-step(0.45,abs(kind-1.0));
    float isCurveEnergy=1.0-step(0.45,abs(kind-7.0));
    float isCurveShell =1.0-step(0.45,abs(kind-8.0));
    float isCurve=max(isCurveEnergy,isCurveShell);
    float isTrailEnergy=max(1.0-step(0.45,abs(kind-5.0)),isCurveEnergy);
    float isTrailShell =max(1.0-step(0.45,abs(kind-6.0)),isCurveShell);
    float isTrail=max(isTrailEnergy,isTrailShell);
    /* Falling airframes are still VOL_BLAST and still one macro core. The
       profile merely folds their generic satellite lobes into a hot inner
       pocket below one tall, cooling soot crown. */
    float isAirCrash=(1.0-step(0.45,abs(profile-1.0)))*isBlast;
    /* The proxy is intentionally a box; the density is the art. A blast is
       spherical during ignition and only stretches into a buoyant crown as
       it cools. An impact rotates into projectile direction and combines a
       compact contact bulb with one short excavating wake. Previously both
       paths marched the same tall mushroom, which made direct hits look like
       tiny copies of strategic explosions. */
    float crown=mix(1.0,0.65+0.45*smoothstep(-0.4,0.6,localP.y),
      smoothstep(0.12,0.70,progress)*(1.0-isImpact));
    /* Collapse dust begins as a grounded shear front, then rolls upward into
       cauliflower lobes. This keeps a real vertical silhouette from the RTS
       camera instead of reproducing the old flat horizontal card. */
    crown=mix(crown,0.72+0.42*smoothstep(-0.72,0.72,localP.y),isDust);
    vec3 q=localP;
    q.xz/=crown;
    float blastY=mix(2.35,1.0,smoothstep(0.18,0.62,progress));
    /* The generic flash starts vertically compressed for an outward blast.
       A falling hull is the opposite silhouette: give its coherent crown
       real vertical depth from the first visible frame, not a ground pancake. */
    blastY=mix(blastY,mix(0.78,0.94,smoothstep(0.04,0.70,progress)),isAirCrash);
    q.y*=mix(1.0,blastY,isBlast);
    float ca=cos(vTint.w),sa=sin(vTint.w);
    vec2 iq=mat2(ca,sa,-sa,ca)*q.xz;
    /* EXPERIMENTAL SWEPT-VOLUME TRAILS. Curve kinds use ONE proxy and measure
       every ray sample against a bounded fixed-step history texture. Legacy
       kinds retain the ten-capsule laboratory path for direct A/B comparison. */
    if(isTrail>0.5){
      float headlessWake=isCurveShell*step(.5,vTrail.z);
      if(isCurve>0.5&&uTrailHistoryReady<0.5)discard;
      float trailU=0.5,localU=0.5,tubeR=1.0,segmentWeight=1.0;
      float headSeg=0.0,headR=1.0;
      vec3 radialVec=vec3(0.0),trailTangent=vec3(1.0,0.0,0.0);
      vec3 trailSide=vec3(0.0,0.0,1.0),trailUp=vec3(0.0,1.0,0.0);
      vec3 headPoint=vCtr.xyz,headAxis=vec3(1.0,0.0,0.0);
      if(isCurve>0.5&&uTrailHistoryReady>0.5){
        int histRow=int(clamp(floor(vTrail.x+0.5),0.0,7.0));
        int histCount=int(clamp(floor(vTrail.y+0.5),2.0,12.0));
        float bestD2=1e30,bestU=0.0,bestR=1.0;vec3 bestPoint=vec3(0.0),bestProbe=p,bestTan=vec3(1.0,0.0,0.0);
        for(int hi=0;hi<11;hi++){
          if(hi>=histCount-1)break;
          int im1=max(0,hi-1),ip2=min(histCount-1,hi+2);
          vec4 h0=texelFetch(uTrailHistory,ivec2(im1,histRow),0);
          vec4 h1=texelFetch(uTrailHistory,ivec2(hi,histRow),0);
          vec4 h2=texelFetch(uTrailHistory,ivec2(hi+1,histRow),0);
          vec4 h3=texelFetch(uTrailHistory,ivec2(ip2,histRow),0);
          vec3 chord=h2.xyz-h1.xyz;
          float h=clamp(dot(p-h1.xyz,chord)/max(1e-5,dot(chord,chord)),0.0,1.0);
          /* Two bounded projection refinements are enough for this smooth,
             sparsely sampled ballistic curve and much cheaper than spawning a
             row of overlapping capsule proxies. */
          for(int refine=0;refine<2;refine++){
            vec3 cp=trailCatmull(h0.xyz,h1.xyz,h2.xyz,h3.xyz,h);
            vec3 ct=trailCatmullTangent(h0.xyz,h1.xyz,h2.xyz,h3.xyz,h);
            h=clamp(h+dot(p-cp,ct)/max(1e-5,dot(ct,ct)),0.0,1.0);
          }
          vec3 nearP=trailCatmull(h0.xyz,h1.xyz,h2.xyz,h3.xyz,h);
          vec3 nearT=trailCatmullTangent(h0.xyz,h1.xyz,h2.xyz,h3.xyz,h);
          /* A 32-step volume march can step completely over a 3–6 world-unit
             trail inside a tall artillery proxy. Measure the complete current
             ray interval against the curve, rather than a single point on that
             interval. This is analytic coverage, not extra particle samples,
             and removes the bright/dark comb tied to march planes. */
          vec3 rayProbe=p+uRayDir*clamp(dot(nearP-p,uRayDir),0.0,ds);
          h=clamp(h+dot(rayProbe-nearP,nearT)/max(1e-5,dot(nearT,nearT)),0.0,1.0);
          nearP=trailCatmull(h0.xyz,h1.xyz,h2.xyz,h3.xyz,h);
          nearT=trailCatmullTangent(h0.xyz,h1.xyz,h2.xyz,h3.xyz,h);
          rayProbe=p+uRayDir*clamp(dot(nearP-p,uRayDir),0.0,ds);
          float d2=dot(rayProbe-nearP,rayProbe-nearP),hs=h*h*(3.0-2.0*h);
          if(d2<bestD2){bestD2=d2;bestPoint=nearP;bestProbe=rayProbe;bestTan=nearT;bestR=mix(h1.w,h2.w,hs);bestU=(float(hi)+h)/float(histCount-1);}
        }
        trailU=clamp(bestU,0.006,0.994);
        tubeR=max(max(0.25,bestR),uWorldPerPx*mix(6.40,8.80,isTrailShell)*mix(1.0,.58,headlessWake));
        trailTangent=normalize(bestTan+vec3(1e-5));
        vec3 axisRef=abs(trailTangent.y)<0.88?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0);
        trailSide=normalize(cross(trailTangent,axisRef));trailUp=normalize(cross(trailSide,trailTangent));
        /* The centreline stays ballistic. Only old soot density drifts, with a
           low-frequency bounded curl that cannot expose history spacing. */
        float oldWake=1.0-trailU;
        float curlPhase=trailU*13.0+seed*1.73-uTime*.31;
        vec3 curlOffset=(trailSide*sin(curlPhase)+trailUp*cos(curlPhase*.71))
          *(tubeR*.16*oldWake*oldWake*isTrailShell);
        radialVec=bestProbe-(bestPoint+curlOffset);
        vec4 hpHead=texelFetch(uTrailHistory,ivec2(histCount-1,histRow),0);
        vec4 hpPrev=texelFetch(uTrailHistory,ivec2(histCount-2,histRow),0);
        /* vTrail.z marks headless persistent wakes such as aircraft smoke.
           Their newest history sample is not a projectile and must not grow a
           bright shell/fuse cap that obscures the aircraft. */
        headSeg=1.0-step(.5,vTrail.z);headPoint=hpHead.xyz;headAxis=normalize(hpHead.xyz-hpPrev.xyz+vec3(1e-5));
        headR=max(hpHead.w*mix(.94,1.12,isTrailShell),uWorldPerPx*mix(5.8,8.2,isTrailShell));
      }else{
        float segCount=10.0;
        vec3 trailAxis=normalize(vTrail.xyz);float halfLen=max(0.001,vTrail.w);
        vec3 trailWorld=p-vCtr.xyz;float along=dot(trailWorld,trailAxis);
        localU=clamp(along/(halfLen*2.0)+0.5,0.0,1.0);
        trailU=clamp((profile+localU)/segCount,0.006,0.994);
        vec3 nearest=trailAxis*clamp(along,-halfLen,halfLen);
        vec3 spare=max(vec3(0.001),vExt.xyz-abs(trailAxis)*halfLen);
        tubeR=min(spare.x,min(spare.y,spare.z));
        vec3 axisRef=abs(trailAxis.y)<0.88?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0);
        trailSide=normalize(cross(trailAxis,axisRef));trailUp=normalize(cross(trailSide,trailAxis));
        float wakeAgeLegacy=1.0-trailU,curlPhase=trailU*31.0+seed*1.73-uTime*0.58*wakeAgeLegacy;
        vec3 curlOffset=(trailSide*sin(curlPhase)+trailUp*cos(curlPhase*0.83))
          *(tubeR*0.25*wakeAgeLegacy*wakeAgeLegacy*isTrailShell);
        radialVec=trailWorld-nearest-curlOffset;
        headSeg=step(8.5,profile);vec3 headCentre=trailAxis*(halfLen*0.806);
        headPoint=vCtr.xyz+headCentre;headAxis=trailAxis;
        headR=tubeR*mix(.82,.96,isTrailShell);
        float fadeIn=mix(smoothstep(0.0,0.22,localU),1.0,1.0-step(0.5,profile));
        float fadeOut=mix(1.0-smoothstep(0.78,1.0,localU),1.0,step(8.5,profile));
        segmentWeight=fadeIn*fadeOut;
      }
      float radial=length(radialVec);
      float row=mix(0.25,0.75,isTrailShell);
      float crossY=clamp(dot(radialVec,trailUp)/max(0.001,tubeR),-1.0,1.0);
      float crossZ=clamp(dot(radialVec,trailSide)/max(0.001,tubeR),-1.0,1.0);
      vec4 drvY=texture(uTrailDriver,vec2(trailU,row+crossY*0.235));
      vec4 drvZ=texture(uTrailDriver,vec2(trailU,row+crossZ*0.235));
      vec4 drv=max(drvY,drvZ);
      float drvReady=step(0.5,uTrailDriverReady);
      float driverHeat=max(drv.r,max(drv.g,drv.b))*drvReady;
      vec4 tn=texture(uNoise,vec3(trailU*4.1,crossZ,crossY)+vec3(seed*0.19,uTime*0.11,-uTime*0.07));
      /* Energy narrows into a real tail; combustion already receives a wider
         world-space radius from the CPU.  Noise perturbs the density boundary,
         not just its colour, so the silhouette has volume breakup instead of
         reading as a uniformly glowing hose. */
      float wakeAge=1.0-trailU;
      float radiusScale=mix(mix(0.36,0.72,smoothstep(0.02,0.84,trailU)),
        mix(0.56,0.20,smoothstep(0.04,0.94,trailU)),isTrailShell);
      /* Combustion wakes need a connected low-frequency silhouette. The old
         71-cycle modulation made the density read as a spray of orange dots at
         tactical zoom. Two broad, incommensurate waves now shape large rolling
         smoke cells while the 3D field supplies the small turbulent breakup. */
      float lobeWave=0.92+0.10*sin(trailU*11.0+sin(trailU*5.0)*.72)
        +0.07*sin(trailU*17.0+seed*1.7);
      float shellBillow=mix(1.0,lobeWave*(0.97+0.11*smoothstep(0.20,0.84,tn.a)),isTrailShell);
      float energyBreath=.91+.10*sin(trailU*8.0+seed*.37)+.09*(tn.a-.5);
      radiusScale*=mix(energyBreath,shellBillow,isTrailShell);
      float rr=radial/max(0.001,tubeR*radiusScale);
      float edgeNoise=(fbm3(tn)-0.5)*mix(0.54,0.62,isTrailShell)+(drv.a-0.5)*0.08*drvReady;
      float support=1.0-smoothstep(mix(.52,.48,isTrailShell)+edgeNoise,1.02+edgeNoise,rr);
      /* The energy sheath is allowed to curl around the stable filament. It is
         still evaluated inside this one density field; the offset creates ion
         haze and asymmetry without a second ribbon or sprite layer. */
      float ionPhase=trailU*9.0+seed*.63-uTime*.24;
      vec3 ionOffset=(trailSide*sin(ionPhase)+trailUp*cos(ionPhase*.77))
        *(tubeR*(.16+.18*wakeAge));
      float ionRR=length(radialVec-ionOffset)/max(.001,tubeR*radiusScale*1.22);
      float ionEdge=(fbm3(tn)-.5)*.48;
      float ionSupport=1.0-smoothstep(.48+ionEdge,1.08+ionEdge,ionRR);
      support=max(support,ionSupport*.82*(1.0-isTrailShell));
      /* Longitudinal breakup comes from the continuous noise domain, never
         history indices. It can pulse and tear the plasma without restoring
         the twelve-sample knot pattern. */
      vec4 longTex=texture(uNoise,vec3(trailU*9.7+seed*.13,.29+seed*.017,.71-uTime*.05));
      float longNoise=fbm3(longTex);
      float wave=.5+.5*sin(trailU*33.0-uTime*8.0+longNoise*4.2+seed*.31);
      float energyPulse=.18+.82*smoothstep(.36,.72,longNoise*.46+wave*.54);
      /* Five explicit packets travel inside the uninterrupted filament. Their
         axial phase is analytic (rather than a lucky noise maximum), so launch,
         mid-flight and command zoom all expose the same readable cadence. */
      float packetPhase=abs(fract(trailU*5.0-uTime*.58+seed*.071)-.5);
      float energyPacket=(1.0-smoothstep(.055,.145,packetPhase))
        *smoothstep(.10,.24,trailU)*(1.0-smoothstep(.91,.982,trailU));
      float packetEnvelope=(1.0-smoothstep(.03,.46,rr))*energyPacket;
      /* Tear the ion sheath longitudinally while retaining the much narrower
         analytic filament below. The breakup is sampled from continuous
         object-space noise, so its rhythm cannot reveal the 12 history knots. */
      support=mix(max(support*(.38+.62*energyPulse),
        ionSupport*(.22+.78*energyPulse)),support,isTrailShell);

      /* Kinetic smoke is two advected wisps plus a faint connector—not a
         filled cone. Both wisps remain within this one raymarched instance. */
      vec3 wispOffA=(trailSide*sin(trailU*15.0+seed)+trailUp*cos(trailU*9.0+seed*.7))
        *(tubeR*(.15+.23*wakeAge));
      vec3 wispOffB=(trailSide*cos(trailU*11.0+seed*.43)-trailUp*sin(trailU*13.0+seed))
        *(tubeR*(.21+.19*wakeAge));
      float wispRA=length(radialVec-wispOffA)/max(.001,tubeR*radiusScale*1.16);
      float wispRB=length(radialVec-wispOffB)/max(.001,tubeR*radiusScale*1.02);
      float wispA=1.0-smoothstep(.20+edgeNoise*.42,.84+edgeNoise*.34,wispRA);
      float wispB=1.0-smoothstep(.17-edgeNoise*.22,.78+edgeNoise*.28,wispRB);
      float wispGateA=smoothstep(.20,.62,longNoise*.74+tn.g*.26);
      float wispGateB=smoothstep(.24,.66,(1.0-longNoise)*.58+tn.b*.42);
      float wispGate=max(wispGateA,wispGateB*.78);
      float shellConnector=(1.0-smoothstep(.04,.34,rr))*.08;
      /* Three axial windows shape distinct soot lobes. They overlap just enough
         to read as advected smoke, while the independent pressure backbone
         below maintains physical continuity all the way to the shell. */
      float smokeLobeA=smoothstep(.035,.085,trailU)*(1.0-smoothstep(.16,.22,trailU));
      float smokeLobeB=smoothstep(.285,.34,trailU)*(1.0-smoothstep(.43,.49,trailU));
      float smokeLobeC=smoothstep(.535,.59,trailU)*(1.0-smoothstep(.68,.75,trailU));
      float smokeLobes=max(smokeLobeA,max(smokeLobeB,smokeLobeC));
      float lobeDensity=max(wispA,wispB*.82)*smokeLobes*(.44+.56*wispGate);
      float shellWisps=max(shellConnector*.62,lobeDensity);
      /* A pressure-diffused soot envelope joins the displaced wisps. It is
         deliberately soft and low-density, but broad enough to survive grey
         terrain and command zoom; the previous wisp-only field measured as
         present while visually collapsing to a one-pixel brown scratch. */
      float shellHaze=(1.0-smoothstep(.18,.94,rr))*(.22+.34*smoothstep(.24,.82,tn.a))
        *smoothstep(.025,.18,trailU)*(1.0-smoothstep(.88,.985,trailU))*mix(1.0,.22,headlessWake);
      support=mix(support,max(shellWisps,shellHaze),isTrailShell);
      /* Preserve a continuous plasma filament through every history segment.
         Noise is allowed to fray the sheath, never to punch gaps through the
         spine—the dotted tail in the first hardware capture was a density
         failure, not an intended pulse. */
      float filamentSupport=(1.0-smoothstep(.035,.32,rr))
        *mix(.88,1.0,smoothstep(.02,.24,trailU));
      support=max(support,filamentSupport*(1.0-isTrailShell));
      /* One field, two genuinely different terminal forms. Energy ends in a
         contained plasma ellipsoid and ion envelope. Kinetic ends in a compact
         metal projectile with a rear fuse—not a spherical orange fireball. */
      vec3 headProbe=p+uRayDir*clamp(dot(headPoint-p,uRayDir),0.0,ds);
      vec3 headDelta=headProbe-headPoint;
      float headAlong=dot(headDelta,headAxis);
      float headPerp=length(headDelta-headAxis*headAlong);
      float energyHeadMetric=length(vec2(headAlong/max(.001,headR*1.58),headPerp/max(.001,headR*.46)));
      float shellHeadMetric=length(vec2(headAlong/max(.001,headR*2.16),headPerp/max(.001,headR*.46)));
      float energyHead=headSeg*(1.0-smoothstep(.62,1.0,energyHeadMetric));
      float energyCore=headSeg*(1.0-smoothstep(.08,.62,energyHeadMetric));
      float shellBody=headSeg*(1.0-smoothstep(.72,1.0,shellHeadMetric));
      vec3 fusePoint=headPoint-headAxis*(headR*.74);
      vec3 fuseProbe=p+uRayDir*clamp(dot(fusePoint-p,uRayDir),0.0,ds);
      float fuseMetric=length(fuseProbe-fusePoint)/max(.001,headR*.27);
      float fuseSupport=headSeg*(1.0-smoothstep(.32,1.0,fuseMetric));
      float fuseCore=headSeg*(1.0-smoothstep(.04,.38,fuseMetric));
      float compression=smoothstep(.76,.91,trailU)*(1.0-smoothstep(.965,.995,trailU))
        *(1.0-smoothstep(.08,.34,rr))*(1.0-shellBody);
      float pressureWake=smoothstep(.045,.12,trailU)*(1.0-smoothstep(.968,.996,trailU))
        *(1.0-smoothstep(.018,.17,rr));
      float headSupport=mix(energyHead,max(shellBody,fuseSupport),isTrailShell);
      float headCore=mix(energyCore,fuseCore,isTrailShell);
      support=max(support,headSupport);
      /* Partition the 24% proxy overlap. Without this, premultiplied over
         integrates both capsules at every join and the continuous plasma
         spine becomes a row of bright beads. First/last retain their exposed
         cap; internal endpoints cross-fade into their neighbour. */
      segmentWeight=max(headSupport,segmentWeight);
      /* Energy texture supplies only subtle density breakup. Letting its
         bright knots own opacity produced the soft lavender beads/hose seen
         in the rejected capture. Shell smoke may use more of the authored
         alpha because density variation is physically desirable there. */
      float driverDensity=mix(0.88+drv.a*0.06,0.74+drv.a*0.18,isTrailShell);
      float authored=mix(0.80,driverDensity,drvReady);
      authored=max(authored,headSupport*(0.82+0.18*driverHeat));
      float turbulent=mix(0.78+0.30*fbm3(tn),
        0.48+0.38*fbm3(tn)+0.06*(1.0-tn.a),isTrailShell);
      float energyFade=smoothstep(.006,.18,trailU)*(.28+.72*smoothstep(.10,.72,trailU));
      /* Smoke starts as separated old wisps, is strongest through the middle
         of the path, then clears around the projectile so its gunmetal body and
         tiny hot base stay readable instead of living inside a dark cone. */
      float shellFade=smoothstep(.025,.25,trailU)
        *(1.0-.78*smoothstep(.82,.965,trailU));
      float tailFade=mix(energyFade,shellFade,isTrailShell);
      float longitudinal=mix(.30+.70*energyPulse,.58+.42*wispGate,isTrailShell);
      float trailDensity=support*authored*turbulent*vPar.x*segmentWeight*tailFade
        *longitudinal*mix(1.16,1.82,isTrailShell);
      /* A very narrow optical backbone makes sub-pixel kinetic smoke survive
         the half-resolution march. It carries no glow and remains weaker than
         either displaced wisp; its job is continuity, not a filled cone. */
      trailDensity+=shellConnector*vPar.x*shellFade*(.16+.20*wispGate)*isTrailShell;
      trailDensity+=shellBody*vPar.x*2.36*isTrailShell+fuseSupport*vPar.x*.46*isTrailShell;
      trailDensity+=lobeDensity*vPar.x*3.10*shellFade*isTrailShell;
      trailDensity+=pressureWake*vPar.x*.58*isTrailShell;
      /* The continuous energy filament has its own small extinction floor.
         Packets modulate brightness inside it instead of punching opacity holes
         that turn the trail back into isolated particle beads. */
      trailDensity+=filamentSupport*energyFade*segmentWeight*vPar.x
        *(1.18+.18*energyPulse+.34*energyPacket)*(1.0-isTrailShell);
      trailDensity+=packetEnvelope*energyFade*segmentWeight*vPar.x*.42*(1.0-isTrailShell);
      trailDensity+=energyHead*vPar.x*1.24*(1.0-isTrailShell);
      /* ds is in world units. Normalising it by diameter prevents a long ray
         chord from saturating the entire tube to alpha=1, which erased every
         authored and procedural detail in the first probe. */
      float opticalStep=ds/max(1.0,tubeR*2.0);
      float trailAlpha=1.0-exp(-uSigma*trailDensity*opticalStep*mix(5.55,6.20,isTrailShell)*mix(1.0,.72,headlessWake));
      /* The energy profile is a narrow white plasma filament inside a softer
         ionised sheath. Axial turbulence modulates emission rather than radius,
         retaining one continuous beam-like volume without reintroducing beads. */
      float core=max(1.0-smoothstep(0.025,0.22,rr),headCore);
      float spine=max(1.0-smoothstep(0.006,0.105,rr),headCore);
      float ionPulse=0.91+0.09*tn.b;
      float ionFray=smoothstep(0.28,0.92,tn.a)*(1.0-smoothstep(0.72,1.08,ionRR));
      float containmentRim=energyHead*smoothstep(.50,.78,energyHeadMetric)*(1.0-smoothstep(.78,1.02,energyHeadMetric));
      float frontCap=energyHead*smoothstep(.38,.78,headAlong/max(.001,headR*1.58))
        *(1.0-smoothstep(.12,.62,headPerp/max(.001,headR*.46)));
      vec3 energySheath=vTint.rgb*(0.26+0.23*tn.g+0.27*ionFray)*ionPulse*(.30+.70*energyPulse);
      vec3 energyRgb=mix(energySheath,vec3(1.72,1.86,2.18),core*(.18+.82*energyPulse));
      energyRgb=mix(energyRgb,vec3(2.54,2.72,3.08),spine*(.30+.70*energyPulse));
      energyRgb*=0.62+vPar.y*0.24+energyCore*.52;
      float packetGlow=(core*.42+spine*.80)
        *max(smoothstep(.48,.90,energyPulse)*.34,energyPacket);
      energyRgb+=spine*vec3(1.02,1.14,1.34)+packetGlow*vec3(1.72,1.88,2.12);
      energyRgb+=packetEnvelope*vec3(1.44,1.62,1.94);
      energyRgb+=containmentRim*vTint.rgb*.14+energyCore*vec3(2.12,2.22,2.48)+frontCap*vec3(2.9,3.02,3.18);
      vec3 radialN=normalize(radialVec+vec3(1e-4));
      float smokeLight=0.58+0.42*max(0.0,dot(radialN,normalize(uSunDir)));
      float smokeBody=smoothstep(0.10,0.78,wakeAge);
      float smokeEdge=smoothstep(0.34,0.94,rr);
      /* Use translucent, light-scattering grey-brown rather than nearly black
         extinction. Sparse lobes must remain separable over concrete without
         reading as an opaque painted cone or a ground shadow. */
      vec3 shellSmoke=mix(vec3(.075,.072,.068),vec3(.31,.30,.285),
        clamp(smokeEdge*.56+tn.g*.32,0.0,1.0))*mix(.82,1.06,smokeLight);
      shellSmoke=mix(shellSmoke,vec3(.062,.060,.057),smokeBody*.12);
      /* Headless aircraft damage wakes are soot, not pressure-lit ordnance
         plumes. This removes the pale circular fog disk under an airframe while
         retaining a broken, light-responsive volume behind it. */
      vec3 airSoot=mix(vec3(.022,.024,.027),vec3(.13,.14,.15),
        clamp(smokeEdge*.38+tn.g*.30,0.0,1.0))*mix(.72,.92,smokeLight);
      shellSmoke=mix(shellSmoke,airSoot,headlessWake);
      vec3 shellFire=mix(vec3(0.76,0.022,0.001),vec3(2.25,1.16,0.28),core);
      /* Heat belongs close to the travelling shell. The rejected material
         multiplied the driver over most of the history and turned smoke into
         one orange cloud. This transfers monotonically from compact flame to
         neutral soot over the newest ~22% of the wake. */
      /* The shell reference carries a visible combustion-to-soot hand-off,
         not one orange pixel followed by a black hose. Keep the newest third
         hot, then let authored heat and sparse pockets survive into the middle
         third before neutral smoke owns the old wake. */
      float heatZone=smoothstep(0.93,0.992,trailU)
        *(0.96+0.04*driverHeat)*(1.0-smoothstep(.20,.46,rr));
      float combustion=clamp(heatZone,0.0,1.0)*(1.0-headlessWake);
      vec3 shellWake=mix(shellSmoke,shellFire,combustion);
      float pressureHeat=pressureWake*smoothstep(.62,.91,trailU);
      shellWake=mix(shellWake,vec3(.32,.235,.17),pressureWake*.34);
      shellWake=mix(shellWake,vec3(.285,.275,.26),clamp(lobeDensity*.12,0.0,.16));
      shellWake=mix(shellWake,vec3(1.34,.42,.09),pressureHeat*.72);
      shellWake+=compression*vec3(.94,.75,.48);
      float shellRim=shellBody*smoothstep(.42,.84,shellHeadMetric);
      vec3 shellMetal=mix(vec3(.075,.09,.12),vec3(.82,.86,.90),
        .28+.72*max(0.0,dot(normalize(headDelta+vec3(1e-4)),normalize(uSunDir))));
      shellMetal+=shellRim*vec3(.28,.27,.24);
      vec3 shellRgb=mix(shellWake,shellMetal,shellBody);
      shellRgb+=fuseSupport*vec3(1.32,.24,.016)+fuseCore*vec3(2.8,1.72,.48);
      vec3 trailRgb=mix(energyRgb,shellRgb,isTrailShell);
      float ember=isTrailShell*support*smoothstep(0.976,0.998,tn.b)
        *smoothstep(0.89,0.97,trailU)*(1.0-headCore);
      trailRgb+=vec3(1.50,0.22,0.008)*ember*0.08;
      acc+=T*trailRgb*trailAlpha;T*=1.0-trailAlpha;
      if(T<0.015)break;
      continue;
    }
    /* IMPACT: a COMPACT contact bulb plus a short excavating wake.
       The head used to multiply iq.x by 0.84, and a factor BELOW 1 EXTENDS the
       isosurface along that axis. It sat inside a proxy box the weapon profile
       already makes 1.46 long and only 0.62 tall, so two elongations compounded
       on the same axis and the field integrated to a flat directional smear —
       from the RTS camera that is indistinguishable from a ground decal, which
       is exactly what it got mistaken for. The head is now COMPRESSED along the
       axis (>1) and extended in Y (<1) to fight the pancake proxy; the wake
       alone carries the direction. */
    float impactHead=length(vec3((iq.x-.06)*1.22,q.y*0.72,iq.y*1.08));
    float impactWake=length(vec3((iq.x+.30)*0.86,q.y*1.05,iq.y*1.30))
      +max(0.0,-iq.x-.10)*.34;

    /* ---- CAULIFLOWER LOBES WITH REAL ASYMMETRY -----------------------------
       Seven lobes at mixed radii on an IRREGULAR ring — each one displaced by
       its own hash instead of an even angular step, and each with its own
       size. min() unions them so the creases between neighbours survive; the
       old five evenly-spaced same-radius lobes averaged straight back into a
       sphere, which is the smooth blob in the 02f-02h captures. */
    float coreShape=length(q*vec3(1.08,0.92,1.08));
    float radialLobes=100.0;
    /* A conventional blast benefits from an outward cauliflower union. A
       falling airframe does not: even inward-biased satellites still form two
       detached bodies at the oblique RTS camera angle. Its profile below uses
       this one tapered core plus the same 3D turbulence instead. */
    if((isBlast>0.5||isDust>0.5)&&isAirCrash<0.5){
      float expand=smoothstep(0.04,0.62,progress);
      for(int l=0;l<7;l++){
        float fl=float(l);
        float hh=fract(sin(fl*12.9898+seed*7.233)*43758.5453);
        float a=fl*0.8975979+seed*2.39996+hh*0.90;
        vec3 lDir=vec3(cos(a)*0.88,(hh-0.32)*0.86,sin(a)*0.88);
        vec3 lCtr=lDir*mix(0.08,0.60,expand)*(0.62+0.74*hh);
        /* Keep the irregular lobe vocabulary, but join an air crash's outer
           satellites into one crown.  Suppressing only their heat would leave
           a red/orange necklace under the soot at a top-down RTS angle. */
        lCtr.xz*=mix(1.0,0.36,isAirCrash);
        /* A modest upward bias gives the crash a crown, but not a detached
           top balloon. The fire/soot material bridge below supplies the
           continuous vertical hand-off rather than a second lobe. */
        lCtr.y=mix(lCtr.y,0.02+0.20*hh,isAirCrash);
        float lRad=mix(0.30,0.56,expand)*(0.70+0.60*hh)*mix(1.0,1.16,isAirCrash);
        radialLobes=min(radialLobes,length(q-lCtr)/lRad);
      }
    }
    float blastShape=min(coreShape*1.12,radialLobes);
    /* Contact bursts get the SAME cauliflower vocabulary at contact scale.
       The lobe loop above is gated to blast/dust, so an impact previously had
       no internal structure whatsoever — a single smooth ellipsoid, which is
       the other half of why it read as a flat sprite. Three small lobes are
       enough to break the silhouette and give the march something to shade. */
    float impactShape=min(impactHead,impactWake);
    float voidField=0.0,voidCrescent=0.0,voidSpear=0.0,voidForks=0.0;
    if(isImpact>0.5){
      float ex2=smoothstep(0.02,0.55,progress);
      for(int l=0;l<3;l++){
        float fl=float(l);
        float hh=fract(sin(fl*31.7+seed*5.13)*43758.5453);
        float hg=fract(hh*7.31);
        vec3 lc=vec3((hh-0.55)*0.46,0.10+hg*0.34,(hg-0.5)*0.44)*mix(0.30,0.92,ex2);
        impactShape=min(impactShape,
          length(q-lc)/(mix(0.30,0.48,ex2)*(0.80+0.45*hh)));
      }
      /* VOID CONTACT — one genuine density field, not a card or extra layer.
         The short capsule is the incoming phase spear, the clipped shell is an
         asymmetric crescent, and both join a vertically thick contact bloom.
         Their separate clocks change the 3D silhouette while the event fades. */
      /* The centre is deliberately an OFFSET ellipsoid rather than a full
         ball.  It supplies thickness behind the crescent without filling the
         crescent's negative space from the RTS camera. */
      float bloomR=length(vec3((iq.x+.15)*1.30,q.y*.78,iq.y*1.46));
      float bloom=(1.0-smoothstep(.27,.66,bloomR))
        *(1.0-smoothstep(.56,.97,progress));
      /* One incoming spear plus two short forks live in this same density
         field. They are capsules, not emitted particles, so the silhouette is
         directional while the authoritative layer count remains one. */
      float axis=clamp(iq.x,-.96,.18);
      float spearDist=length(vec3(iq.x-axis,q.y*1.58,iq.y*2.72));
      float spearRadius=mix(.045,.145,smoothstep(-.96,.18,axis));
      float spear=(1.0-smoothstep(spearRadius,spearRadius+.065,spearDist))
        *(1.0-smoothstep(.34,.66,progress));
      float forkGate=smoothstep(-.50,-.18,iq.x)*(1.0-smoothstep(.08,.30,iq.x));
      float forkA=1.0-smoothstep(.045,.115,
        length(vec3(q.y*1.80,(iq.y-(iq.x+.30)*.48)*2.65,0.0)));
      float forkB=1.0-smoothstep(.045,.115,
        length(vec3(q.y*1.80,(iq.y+(iq.x+.30)*.48)*2.65,0.0)));
      float forks=max(forkA,forkB)*forkGate*(1.0-smoothstep(.28,.58,progress));
      /* A ground-plane torus section gives the crescent a real hollow centre
         from the oblique RTS camera.  The earlier spherical-shell subtraction
         integrated its front and back caps into two filled balloons. */
      vec2 arcP=vec2((iq.x-.02)*1.02,iq.y*1.12);
      float arcRad=length(arcP);
      float arcTube=sqrt(pow((arcRad-.53)/.145,2.0)+pow(q.y/.30,2.0));
      float crescent=(1.0-smoothstep(.68,1.12,arcTube))
        *smoothstep(-.28,.10,iq.x)*(1.0-smoothstep(.52,.88,progress));
      voidCrescent=crescent;voidSpear=spear;voidForks=forks;
      voidField=max(bloom*.44,max(max(spear,forks),crescent));
      impactShape=mix(impactShape,1.0-voidField,isVoidImpact);
    }
    float r=mix(blastShape,impactShape,isImpact);

    /* ---- two turbulence octaves displace the SURFACE ---------------------- */
    vec3 nq=mix(q,vec3(iq.x,q.y,iq.y),isImpact);
    /* AUTHORED MATERIAL DRIVER — blast and smoke only.  The 4x4 source stages
       follow ignition -> combustion -> soot, while a standalone smoke event
       begins in the soot half of the same chronology.  nq is reconstructed
       from this march sample, not a screen UV, then triplanar-projected through
       the proxy.  Impacts deliberately stay out of this path: VOL_IMPACT keeps
       its compact authored analytic morphology and exact existing budget. */
    float driverKind=max(isBlast,isSmoke);
    float driverProgress=mix(progress,0.54+progress*0.46,isSmoke);
    float driverFrame=floor(clamp(driverProgress,0.0,0.9999)*16.0);
    float driverWeight=driverKind*step(0.5,uDriverReady);
    vec4 driverField=vec4(0.5,0.0,0.5,1.0);
    if(driverWeight>0.5) driverField=driverTriplanar(nq,driverFrame);
    /* Leave a large procedural contribution even inside transparent portions
       of the authored source.  This is a density/emission *modulator*, never
       a rectangular cutout or a replacement sprite. */
    float driverDensity=mix(1.0,mix(0.72,1.22,driverField.r)
      *mix(0.84,1.0,driverField.a),driverWeight);
    float driverSoot=mix(1.0,mix(0.86,1.16,driverField.b),driverWeight);
    float driverHeat=mix(1.0,mix(0.62,1.30,driverField.g),driverWeight);
    vec3 drift=uWind*uTime*0.035
      -vec3(progress*isImpact*.34,uTime*mix(0.08,0.025,isImpact)+progress*.45,0.0);
    vec3 nc=nq*mix(0.42,0.62,isImpact)+drift+vec3(seed);
    vec4 n=texture(uNoise,nc);
    vec4 nw=texture(uNoise,nc*2.15+vec3(seed*1.7));
    float f=mix(fbm3(n),1.0-n.a,0.38)+(fbm3(nw)-0.5)*0.42;

    /* ---- INTERNAL CAVITIES -------------------------------------------------
       Without carved voids the march integrates a solid shell and no amount of
       lighting stops it reading as a painted blob. These holes widen as the
       fireball cools, and they are also what lets combustion still burning in
       the interior show THROUGH the soot rather than being sealed behind it. */
    vec4 nv=texture(uNoise,q*3.3+vec3(seed*1.31)+drift*0.6);
    float voids=smoothstep(0.44,0.88,nv.a)*mix(0.10,0.58,clamp(sootHold+sSmoke,0.0,1.0));
    /* The source alpha records true authored empty space.  Blend that lightly
       into the analytic cavities so it adds fire/smoke breakup without ever
       hollowing an impact or erasing the fallback procedural field. */
    voids+=driverWeight*(1.0-driverField.a)*0.105;

    /* WORLD-SPACE MATERIAL SPLIT. localP is reconstructed from the live march
       sample p, not the screen coordinate or a painted colour ramp. Keep the
       fuel down in the inner/lower body while the lifted outer surface becomes
       soot. The old fire field lit every lobe equally, so a top-down camera
       integrated one opaque yellow pancake even though the density itself had
       cauliflower detail. These masks make the same density field carry a hot
       core, a cooler crown and real creases between them. */
    float crownAge=smoothstep(0.08,0.66,progress)*(1.0-isImpact);
    float crownTop=smoothstep(-0.08,0.74,localP.y);
    float outerShell=smoothstep(0.20,0.88,r);
    float sootCrown=clamp(crownAge*(0.22+0.78*crownTop)
      +outerShell*(0.18+0.32*crownAge)+sootHold*0.16,0.0,1.0);
    /* Air-crash heat belongs in the lower centre.  The rest of the same
       raymarched field becomes the visibly taller dark crown, so this does
       not add a card, plume, or second combustion layer. */
    sootCrown=clamp(sootCrown+isAirCrash*(0.08+0.38*outerShell*(0.34+0.66*crownTop)),0.0,1.0);
    float fuelHeight=mix(1.0-smoothstep(-0.05,0.70,localP.y),
      1.0-smoothstep(0.42,0.96,localP.y),isImpact);
    float fuelRadius=1.0-smoothstep(0.18,0.74,length(q.xz));
    float fuelPocket=clamp(fuelHeight*fuelRadius*(1.0-0.46*sootCrown)
      +voids*0.16,0.0,1.0);
    float crashCore=1.0-smoothstep(0.10,0.50,length(q.xz));
    float crashFuel=crashCore*(1.0-smoothstep(-0.16,0.28,localP.y));
    /* This is a warm, deliberately thinner neck—not another flame lobe. It
       keeps the fuel column visible while it hands off into soot, so the
       tactical camera reads one combustion volume rather than an orange orb
       sitting below a separate grey oval. */
    float crashBridge=crashCore*(1.0-smoothstep(-0.10,0.82,localP.y));
    sootCrown=mix(sootCrown,max(0.0,sootCrown-crashBridge*0.38),isAirCrash);
    fuelPocket=mix(fuelPocket,clamp(fuelPocket*crashFuel+crashBridge*0.42
      +voids*0.040*crashBridge,0.0,1.0),isAirCrash);
    /* A contact is its own compact material event, not a small rising crown.
       Preserve its pre-existing hot density response; only blast/dust samples
       receive the lower-fuel / lifted-soot separation above. */
    sootCrown*=1.0-isImpact;
    fuelPocket=mix(fuelPocket,1.0,isImpact);

    /* ---- Beer-Lambert density ----------------------------------------------
       Extinction now falls stage by stage so late soot stays TRANSLUCENT. The
       old flat 3.2-3.8 gain drove 1-exp(-sigma*d*ds) to 1.0 across the entire
       silhouette, which is why the aftermath was a uniform opaque black disc
       that completely hid the ground beneath it. */
    float d=(0.80-r)+(f-0.5)*0.72-voids;
    /* Break the upper cap with its own 3D field and taper it slightly. This
       changes the true density boundary (not a colour overlay), preventing a
       perfectly oval soot silhouette at the top-down tactical angle. */
    float crashTop=smoothstep(0.08,0.92,localP.y);
    d-=isAirCrash*crashTop*(0.10+0.26*(1.0-fbm3(nw)));
    float erode=1.0-smoothstep(mix(mix(0.80,0.66,isImpact),0.86,isDust),1.06,progress);
    float ext=mix(mix(3.05,3.55,isImpact),1.28,sSmoke)*mix(1.0,0.82,sootHold)
      *mix(1.0,0.62,sFlash);   /* ignition is THIN and hot, not a dense ball */
    float density=clamp(d*3.2,0.0,1.0)*erode*vPar.x*ext;
    /* Let the high soot cap fray into individual 3D filaments instead of
       preserving the old uniformly opaque upper hemisphere. The low fuel core
       stays dense enough to retain its incandescent read. */
    float crownFilaments=mix(1.0,0.66+0.34*smoothstep(0.18,0.86,fbm3(nw)),
      crownAge*crownTop);
    density*=crownFilaments*driverDensity;

    if(density>0.01){
      /* SELF-SHADOWING FROM THE ACTUAL FIELD.
         The old probe was two analytic sphere chords — length() of an offset
         point — so it produced one smooth radial gradient no matter what the
         density was doing. A smooth gradient over a round silhouette is
         precisely what reads as a flat disc. These two chords re-evaluate the
         SAME noise basis the density uses, so a lobe genuinely shadows the
         fold behind it and the eye gets the depth cue it was missing. */
      float shadow=0.0;
      for(int sI=0;sI<2;sI++){
        float sT=(float(sI)+1.0)*0.24;
        vec3 sq=q+uSunDir*sT;
        float sShape=length(sq*vec3(1.08,0.92,1.08))*1.12;
        vec4 sn=texture(uNoise,sq*mix(0.42,0.62,isImpact)+uWind*uTime*0.035+vec3(seed));
        float sf=sn.r*0.52+sn.g*0.28+sn.b*0.20;
        sf=mix(sf,1.0-sn.a,0.38);
        shadow+=clamp(((0.78-sShape)+(sf-0.5)*0.65)*3.5,0.0,1.0)*(sI==0?0.62:0.38);
      }
      float transmittance=exp(-shadow*3.4);

      /* HEMISPHERIC AMBIENT + PHASE-WEIGHTED SUN.
         uAmbSky, uAmbGnd and uPhase were all uploaded every frame and never
         read by this shader. Without a phase function the sun term ignored
         scattering geometry entirely, and without a sky/ground gradient every
         sample got the same colour regardless of which way it faced — so the
         march returned a uniformly shaded blob. uPhase already carries the
         dual-lobe Henyey-Greenstein evaluated on the CPU (free under ortho);
         it is clamped here only so a grazing sun cannot blow out the core. */
      float ph=clamp(uPhase,0.35,2.4);
      vec3 nrmUp=normalize(q+vec3(0.0,1e-4,0.0));
      vec3 ambient=mix(uAmbGnd,uAmbSky,clamp(0.5+0.5*nrmUp.y,0.0,1.0));

      /* SOOT IS DARK, NOT BLACK. 0.035 through a 0.45 mix landed every sample
         below the terrain's own value, so the integral converged to a flat
         black hole in the ground. Lift the floor and let ambient carry it —
         real soot backscatters plenty at this sun angle. */
      vec3 darkSoot=vec3(0.085,0.076,0.070);
      vec3 sunLitSoot=uSunCol*vec3(0.30,0.25,0.20)*transmittance*ph;
      vec3 smoke=mix(darkSoot,sunLitSoot,0.52)+ambient*(0.34+0.26*transmittance);
      if(isDust>0.5){
        smoke=mix(smoke,vTint.rgb*0.85,0.65);
      }else{
        /* The owning combat recipe supplies faction energy as a material
           driver. Keep soot physically dark, but let its hot inner folds carry
           a restrained trace of that spectrum instead of spawning a separate
           coloured flourish around the volume. */
        smoke=mix(smoke,vTint.rgb*0.20,0.14);
      }

      /* Cool toward soot across the middle of the life, then HOLD. Continuing
         to darken into the tail is what produced the opaque late mass. */
       smoke*=mix(1.0,0.72,sootHold)*mix(1.0,0.86,sSmoke)*driverSoot;
       /* The crown has its own physically darker material response; this is
          what separates rising soot from the fire below without a second card
          or a screen-space overlay. */
       smoke=mix(smoke,darkSoot+ambient*(0.18+0.22*transmittance),sootCrown*0.34);

      /* COMBUSTION, BIASED INTO THE CAVITIES. Where density was carved away the
         volume is thin, and that is exactly where interior burn should still
         be visible from outside — fire showing through pockets rather than
         painted onto a shell. */
      /* ENERGY SCALES WITH THE EVENT, and this is the whole point.
         A flat gain is wrong at both ends: crank it and a rifle contact blows
         out like a bunker buster, damp it and a bombardment loses the
         incandescent core that makes heavy ordnance feel heavy. Power is taken
         from the authored emission AND the volume's own world size — vExt is
         in world units, so a bombardment proxy is several times a small
         impact's — and it drives the fire ramp, the white knee and the
         highlight shoulder together. Cavities REVEAL interior fire; they do
         not manufacture it, hence the small 0.30 term. */
      float rWorld=max(vExt.x,max(vExt.y,vExt.z));
      float power=clamp(vPar.y*(0.74+0.78*smoothstep(6.0,46.0,rWorld)),0.0,1.90);
      /* ONE temperature clock. The old -progress*0.55 was a fifth, unnamed cooling
         ramp that the four stage weights knew nothing about, decaying on a
         different schedule than the gate below and fighting it — which is why
         tuning the constants kept swinging between all-white and all-soot. The
         shrinking hot core is now a SHAPE change on the stage clock instead. */
       float fireField=(0.86-r*mix(0.90,1.38,sootHold))+(fbm3(nw)-0.50)*0.85
         +voids*mix(0.22,0.30,isImpact);
       float fireHeat=clamp(fireField*(1.35+1.25*power),0.0,1.0)*(1.0-isDust);
       /* Fire can only occupy the carved fuel pocket. Its lower/central world
          shape makes the volume read as a crown over a burning interior rather
          than a single yellow density blob; the cavity term leaves sparse hot
          glimpses through the soot rather than broadening the whole shell. */
       fireHeat*=mix(0.28,1.0,fuelPocket)*mix(1.0,0.34,sootCrown)*driverHeat;
      /* Do not let the airframe's now-dark outer crown retain the generic
         blast's side fire. This keeps the remaining gold/orange ignition
         localized at the base instead of reading as separate flat lobes. */
      float crashFlame=clamp(crashFuel+crashBridge*0.52,0.0,1.0);
      fireHeat*=mix(1.0,0.64+0.36*crashFlame,isAirCrash);
      /* The flash owns the white region outright; combustion is weighted to top
         out in the golden band so it reads as ROLLING FIRE rather than a white
         plateau with a thin orange rim. */
      fireHeat*=clamp(sFlash*1.25+sBurn*0.70+sSoot*0.30,0.0,1.30);

      // Saturated Fire -> Golden Core -> Blinding Center
      vec3 deepEmber=vec3(0.75,0.14,0.01);
      vec3 brightFlame=vec3(1.00,0.48,0.04);
      vec3 goldenYellow=vec3(1.00,0.85,0.22);
      /* Heavy ordnance gets a genuinely incandescent core; light contacts get
         a hot but bounded one. */
      vec3 coreWhite=mix(vec3(1.22,1.15,0.98),vec3(1.78,1.68,1.44),
        smoothstep(0.60,1.50,power));

      /* Texture/profile-driven combustion: the centre stays incandescent and
         readable, while the cooler outer fire inherits Nova cyan, Legion heat,
         Syndicate phase-green, or Brood bio energy. This is still one density
         field and one logical core layer. */
      vec3 factionFire=clamp(vTint.rgb*1.18,0.0,1.35);
      deepEmber=mix(deepEmber,factionFire*0.52,0.42);
      brightFlame=mix(brightFlame,max(factionFire,vec3(0.08))*1.08,0.48);

      vec3 fireColor=mix(deepEmber,brightFlame,smoothstep(0.02,0.38,fireHeat));
      /* The white knee slides with power: a bombardment reaches incandescence
         across most of its core, a small contact only at its very centre. */
      /* After the flash the knee lifts so combustion sits in the golden band — but
         the lift is SMALLER for heavy ordnance, so a bombardment still reaches an
         incandescent core while a rifle contact never can. */
      float whiteKnee=mix(0.90,0.58,smoothstep(0.50,1.50,power))
        +mix(0.30,0.16,smoothstep(0.60,1.50,power))*(1.0-sFlash);
      fireColor=mix(fireColor,goldenYellow,smoothstep(0.40,0.74,fireHeat));
      float whiteMix=smoothstep(whiteKnee,1.00,fireHeat)*mix(1.0,sFlash,isAirCrash);
      fireColor=mix(fireColor,coreWhite,whiteMix);
      /* Sub-100 ms ignition is the ONLY stage allowed near the ceiling, and
         even it goes through the shoulder rather than clipping flat. */
      fireColor=mix(fireColor,vec3(1.85,1.74,1.52),sFlash*0.80);

       float fireMix=smoothstep(mix(0.10,0.01,isImpact),mix(0.42,0.26,isImpact),fireHeat)
         *mix(1.0,0.44,sootCrown);
       fireMix*=mix(1.0,0.34+0.66*crashFlame,isAirCrash);
       vec3 stepColor=shoulder(mix(smoke,fireColor,fireMix),
         mix(0.40,0.10,smoothstep(0.60,1.50,power))*mix(1.55,1.0,sFlash));
      /* Void energy never passes through the orange combustion/soot ramp. Its
         volume cools from a bounded white-violet centre into a blue-purple
         sheath, while density erosion—not black smoke—ends the contact. */
      float voidHeat=clamp(voidField*(.82+sFlash*.78)+fireHeat*.22
        +voidCrescent*.38+voidSpear*.48+voidForks*.22,0.0,1.35);
      vec3 voidColor=mix(vec3(.075,.035,.34),vec3(.44,.12,1.18),
        smoothstep(.08,.58,voidHeat));
      voidColor=mix(voidColor,vec3(1.58,1.46,1.82),smoothstep(.68,1.12,voidHeat));
      voidColor*=mix(.76,1.12,sFlash);
      stepColor=mix(stepColor,shoulder(voidColor,.12),isVoidImpact);
      float alpha=1.0-exp(-uSigma*density*ds*3.8);

      acc+=T*stepColor*alpha;
      T*=(1.0-alpha);
      if(T<0.015) break;
    }
  }

  float alpha=1.0-T;
  /* TRANSLUCENCY CEILING FOR THE SMOKE STAGE. acc is already premultiplied, so
     scaling colour and alpha together preserves the "over" identity exactly
     while guaranteeing the tail never becomes a solid occluder — terrain and
     structures stay readable through dissipating soot. */
  float aCap=mix(1.0,0.70,sSmoke);
  if(alpha>aCap){ acc*=aCap/max(alpha,1e-4); alpha=aCap; }
  if(alpha<=0.002) discard;
  o=vec4(acc,alpha);
}`;

/* Fullscreen triangle, no vertex buffer — the same gl_VertexID idiom mesh.js
   already uses for VSQ (mesh.js:2296). */
const VOL_VS_UP=`#version 300 es
out vec2 vUv;
void main(){
  vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2);
  vUv=p; gl_Position=vec4(p*2.0-1.0,0.0,1.0);
}`;

/* Bilateral upsample. volTex is NEAREST so the four taps are the actual
   marched texels; the depth key rejects a tap that marched a different
   surface, which is what keeps the half-res result from haloing over a hull.
   uBilateral=0 collapses this to a single tap for the degraded rung. */
const VOL_FS_UP=`#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uVol;
uniform sampler2D uDep;
uniform vec2  uVolSize;
uniform vec2  uInvVolSize;
uniform float uDepthScale;
uniform float uBilateral;
out vec4 o;
void main(){
  if(uBilateral<0.5){ o=texture(uVol,vUv); return; }
  float dC=texture(uDep,vUv).r*uDepthScale;
  vec2 f=vUv*uVolSize-0.5;
  vec2 base=floor(f), fr=f-base;
  vec4 sum=vec4(0.0); float wsum=0.0;
  for(int j=0;j<2;j++){
    for(int i=0;i<2;i++){
      vec2 tc=(base+vec2(float(i),float(j))+0.5)*uInvVolSize;
      float wb=(i==0?1.0-fr.x:fr.x)*(j==0?1.0-fr.y:fr.y);
      float dS=texture(uDep,tc).r*uDepthScale;
      float w=wb/(1.0+abs(dC-dS)*0.35);
      sum+=texture(uVol,tc)*w; wsum+=w;
    }
  }
  o=sum/max(wsum,1e-4);
}`;

/* ---------------------------------------------------------------------------
   INIT / TEARDOWN
   --------------------------------------------------------------------------- */
function volFxCtxCheck(){
  const ep=(typeof glEpoch!=='undefined')?glEpoch:0;
  if(volEpoch===ep) return;
  volEpoch=ep;
  volInitFailed=false;
  volFxGLReset();
}
function volFxGLReset(){
  volProg=volProgUp=volVAO=volEmptyVAO=volCubeVBO=volInstVBO=null;
  volNoiseTex=volDriverTex=volTrailHistoryTex=volFB=volTex=null;
  volTrailHistoryEpoch=-1;volTrailHistoryDirty=true;VOL_TRAIL_HISTORY_TELEM.ready=false;
  volW=volH=0; volFailN=0;
  volU={}; volUup={};
  volDriverReady=false; volDriverState='uninitialised'; volDriverError='';
  volDriverSerial++;
  VOLFX_TELEMETRY.progOK=false;
  VOLFX_TELEMETRY.driverReady=false;
  VOLFX_TELEMETRY.driverState=volDriverState;
  VOLFX_TELEMETRY.driverSamples=0;
  VOLFX_TELEMETRY.driverError='';
  VOLFX_TELEMETRY.trailHistoryReady=false;
}

function volDriverTelemetrySync(){
  VOLFX_TELEMETRY.driverReady=!!volDriverReady;
  VOLFX_TELEMETRY.driverState=volDriverState;
  VOLFX_TELEMETRY.driverError=volDriverError;
}

/* Keep a complete neutral sampler resident before asynchronous image decode.
   uDriverReady remains zero until the authored sheet uploads, so this value is
   never a visual fallback by itself; it only keeps the sampler valid on every
   ANGLE implementation while the existing procedural density is authoritative. */
function volDriverNeutral(tex){
  if(!tex||typeof gl==='undefined'||!gl) return false;
  const wasActive=gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE0+VOL_DRIVER_UNIT);
  const wasTex=gl.getParameter(gl.TEXTURE_BINDING_2D);
  let ok=false;
  try{
    gl.getError();
    gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,
      new Uint8Array([128,0,128,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    ok=gl.getError()===gl.NO_ERROR;
  }catch(e){ ok=false; }
  gl.bindTexture(gl.TEXTURE_2D,wasTex);
  gl.activeTexture(wasActive);
  return ok;
}

function volDriverCurrent(tex,epoch,serial){
  return !!gl&&volDriverTex===tex&&volEpoch===epoch&&volDriverSerial===serial;
}

function volDriverFail(tex,epoch,serial,message){
  if(!volDriverCurrent(tex,epoch,serial)) return;
  /* Restore the known complete 1x1 sampler if upload itself was the failure.
     The shader consequently takes uDriverReady==0 and retains the procedural
     raymarch; it never presents a blank volume or a second billboard. */
  volDriverNeutral(tex);
  volDriverReady=false;
  volDriverState='procedural-fallback';
  volDriverError=String(message||'driver load failed').slice(0,180);
  volDriverTelemetrySync();
}

function volDriverLoad(){
  const tex=volDriverTex,epoch=volEpoch,serial=++volDriverSerial;
  volDriverReady=false;
  volDriverState='loading';
  volDriverError='';
  volDriverTelemetrySync();
  if(!tex||typeof Image==='undefined'){
    volDriverFail(tex,epoch,serial,'Image decode API is unavailable');
    return;
  }
  const img=new Image();
  img.decoding='async';
  img.onload=()=>{
    if(!volDriverCurrent(tex,epoch,serial)) return;
    if(img.naturalWidth!==1024||img.naturalHeight!==1024){
      volDriverFail(tex,epoch,serial,'invalid driver dimensions '+img.naturalWidth+'x'+img.naturalHeight);
      return;
    }
    const wasActive=gl.getParameter(gl.ACTIVE_TEXTURE);
    gl.activeTexture(gl.TEXTURE0+VOL_DRIVER_UNIT);
    const wasTex=gl.getParameter(gl.TEXTURE_BINDING_2D);
    const wasFlip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    const wasPremul=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
    const wasCS=gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL);
    let ok=false;
    try{
      gl.getError();
      gl.bindTexture(gl.TEXTURE_2D,tex);
      /* Data texture: preserve packed density/emission values exactly.  The
         atlas owns its guard band, so linear base-level filtering is deliberate
         and avoids mip levels blending separate animation cells together. */
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,img);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      ok=gl.getError()===gl.NO_ERROR;
    }catch(e){ ok=false; }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,wasFlip);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,wasPremul);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,wasCS);
    gl.bindTexture(gl.TEXTURE_2D,wasTex);
    gl.activeTexture(wasActive);
    if(!volDriverCurrent(tex,epoch,serial)) return;
    if(!ok){ volDriverFail(tex,epoch,serial,'GPU upload failed'); return; }
    volDriverReady=true;
    volDriverState='ready';
    volDriverError='';
    volDriverTelemetrySync();
  };
  img.onerror=()=>volDriverFail(tex,epoch,serial,'image decode failed');
  try{
    img.src=(typeof mf2AssetURL==='function')?mf2AssetURL(VOL_DRIVER_ASSET):('./'+VOL_DRIVER_ASSET);
  }catch(e){ volDriverFail(tex,epoch,serial,e&&e.message||e); }
}

function volFxInit(){
  if(volProg||volInitFailed) return;
  if(typeof gl==='undefined'||!gl) return;
  if(typeof mkProg!=='function'){ volInitFailed=true; return; }

  volProg=mkProg(VOL_VS,VOL_FS,'volfx');
  volProgUp=mkProg(VOL_VS_UP,VOL_FS_UP,'volfx-upsample');
  /* mkProg() defers link validation (mesh.js). This latch must know NOW, and
     both programs are validated explicitly so neither is left pending. */
  const volOk=mfProgOk(volProg), volUpOk=mfProgOk(volProgUp);
  if(!volOk||!volUpOk){
    /* One may have linked. Release it rather than orphaning it, and LATCH so
       the next detonation does not recompile the pair (gpufx.js:44-48). */
    if(volProg) gl.deleteProgram(volProg);
    if(volProgUp) gl.deleteProgram(volProgUp);
    volProg=volProgUp=null; volInitFailed=true;
    VOLFX_TELEMETRY.progOK=false;
    return;
  }
  for(const k of ['uVP','uNoise','uDep','uDriver','uDriverReady','uTrailDriver','uTrailDriverReady','uTrailHistory','uTrailHistoryReady','uRayDir','uSunDir','uSunCol','uAmbSky','uAmbGnd',
                  'uWind','uInvVolSize','uWorldPerPx','uDepthScale','uSigma','uPhase','uTime',
                  'uWaterOn','uWaterY','uSteps'])
    volU[k]=gl.getUniformLocation(volProg,k);
  for(const k of ['uVol','uDep','uVolSize','uInvVolSize','uDepthScale','uBilateral'])
    volUup[k]=gl.getUniformLocation(volProgUp,k);

  /* PIN THE SAMPLER UNITS AT LINK TIME, not just per draw. Until a uniform is
     written, every sampler reads unit 0 — and this program has a sampler3D
     and a sampler2D, so before the first volFxDraw the program is in the
     state ANGLE reports as "Two textures of different types use the same
     sampler location": VALIDATE_STATUS false and undefined behaviour for any
     draw that slipped in first. Caught by the bring-up probe, which asserts
     VALIDATE_STATUS rather than trusting LINK_STATUS alone. Same fix, same
     save/restore of CURRENT_PROGRAM, as gpufx.js:196-200. */
  {
    const wasP=gl.getParameter(gl.CURRENT_PROGRAM);
    gl.useProgram(volProg);
    if(volU.uNoise) gl.uniform1i(volU.uNoise,12);
    if(volU.uDep)   gl.uniform1i(volU.uDep,4);
    if(volU.uDriver) gl.uniform1i(volU.uDriver,VOL_DRIVER_UNIT);
    if(volU.uDriverReady) gl.uniform1f(volU.uDriverReady,0);
    if(volU.uTrailDriver) gl.uniform1i(volU.uTrailDriver,11);
    if(volU.uTrailDriverReady) gl.uniform1f(volU.uTrailDriverReady,0);
    if(volU.uTrailHistory) gl.uniform1i(volU.uTrailHistory,10);
    if(volU.uTrailHistoryReady) gl.uniform1f(volU.uTrailHistoryReady,0);
    gl.useProgram(volProgUp);
    if(volUup.uVol) gl.uniform1i(volUup.uVol,13);
    if(volUup.uDep) gl.uniform1i(volUup.uDep,4);
    if(wasP) gl.useProgram(wasP); else gl.useProgram(null);
  }

  /* Unit cube, 36 non-indexed verts (432 B). Boxes not spheres: one mesh
     covers ball, dome and column, and the anisotropic extents give the plume
     its aspect for free. */
  const C=new Float32Array(108);
  {
    const F=[[0,1,2,3],[5,4,7,6],[4,5,1,0],[3,2,6,7],[4,0,3,7],[1,5,6,2]];
    const V=[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]];
    let w=0;
    for(const f of F){
      const idx=[f[0],f[1],f[2], f[0],f[2],f[3]];
      for(const q of idx){ C[w++]=V[q][0]; C[w++]=V[q][1]; C[w++]=V[q][2]; }
    }
  }
  volCubeVBO=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,volCubeVBO);
  gl.bufferData(gl.ARRAY_BUFFER,C,gl.STATIC_DRAW);
  volInstVBO=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,volInstVBO);
  gl.bufferData(gl.ARRAY_BUFFER,volInstData.byteLength,gl.DYNAMIC_DRAW);

  volVAO=gl.createVertexArray();
  gl.bindVertexArray(volVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER,volCubeVBO);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);
  gl.vertexAttribDivisor(0,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,volInstVBO);
  const ST=VOL_INST_FLOATS*4;
  for(let a=1;a<=5;a++){
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a,4,gl.FLOAT,false,ST,(a-1)*16);
    gl.vertexAttribDivisor(a,1);
  }
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER,null);

  /* The composite is a gl_VertexID fullscreen triangle with no attributes.
     It gets its own empty VAO rather than riding the default one, so a stray
     enabled attribute array left by another pass cannot fail the draw. */
  volEmptyVAO=gl.createVertexArray();

  volNoiseTex=gl.createTexture();
  gl.activeTexture(gl.TEXTURE12);
  gl.bindTexture(gl.TEXTURE_3D,volNoiseTex);
  gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,32,32,32,0,gl.RGBA,gl.UNSIGNED_BYTE,volNoiseBuild());
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_S,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_T,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_R,gl.REPEAT);
  gl.bindTexture(gl.TEXTURE_3D,null);
  gl.activeTexture(gl.TEXTURE0);

  /* The placeholder must exist before the asynchronous decode starts.  If a
     device cannot allocate even this 1x1 sampler, mark the whole volume pass
     unavailable so the already-armed single flipbook remains the atomic
     fallback instead of attempting an incomplete sampler draw. */
  volDriverTex=gl.createTexture();
  if(!volDriverTex||!volDriverNeutral(volDriverTex)){
    volDriverTex=null;
    volDriverReady=false;
    volDriverState='unavailable';
    volDriverError='could not allocate neutral driver sampler';
    volDriverTelemetrySync();
    volInitFailed=true;
    VOLFX_TELEMETRY.progOK=false;
    return;
  }
  volDriverLoad();

  VOLFX_TELEMETRY.progOK=true;
}

/* Half-res colour target. This mirrors aoAlloc's discipline verbatim
   (mesh.js:2380-2450) and for the same reason: detach BEFORE deleting, do not
   commit the cached size until the framebuffer reports COMPLETE, and bound the
   retry. A single failed alloc once latched AO off for 316 straight frames. */
function volAlloc(w,h){
  w=Math.max(1,w|0); h=Math.max(1,h|0);
  if(volW===w&&volH===h&&volTex&&volFB) return true;
  if(volFailN>=4&&volW===w&&volH===h) return false;
  /* This runs MID-FRAME with aoFB2 bound. Binding the default target and
     returning would send water and every additive pass to the canvas, so the
     caller's framebuffer is saved and put back on BOTH exits. */
  const wasFB=gl.getParameter(gl.FRAMEBUFFER_BINDING);
  if(volFB){
    /* Detach BEFORE deleting: aoAlloc does the same and for the same reason. */
    gl.bindFramebuffer(gl.FRAMEBUFFER,volFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,null,0);
  }
  if(volTex) gl.deleteTexture(volTex);
  volTex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,volTex);
  /* RGBA8 to match aoColB (mesh.js:2410). NEAREST because the bilateral
     upsample must see the texels that were actually marched. */
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D,null);
  if(!volFB) volFB=gl.createFramebuffer();

  gl.bindFramebuffer(gl.FRAMEBUFFER,volFB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,volTex,0);
  const ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER,wasFB);
  if(ok){ volW=w; volH=h; volFailN=0; return true; }
  volFailN++;
  if(volFailN>=4){ volW=w; volH=h; }        // stop retrying every frame
  return false;
}

/* ---------------------------------------------------------------------------
   HOP 2 — ring -> GPU, once per frame.
   CALLED FROM render3d.js immediately BEFORE aoExtractBloom(), which is the
   last point in the frame where a pass can still reach the bright pass
   (render3d.js:2743-2747). At that instant the bound FBO is aoFB2 with
   aoColB + aoDepth, viewport aoW x aoH, scissor already disabled, and
   blend off / depth test on / depthMask true / cull on. This function must
   leave EXACTLY that.
   --------------------------------------------------------------------------- */
function volFxDraw(dtDraw,Sun,canPresent){
  volPresented.fill(0);
  VOLFX_TELEMETRY.live=volN;
  VOLFX_TELEMETRY.drawn=0; VOLFX_TELEMETRY.culled=0;
  VOLFX_TELEMETRY.marchedPx=0; VOLFX_TELEMETRY.compositePx=0; VOLFX_TELEMETRY.steps=0;
  VOLFX_TELEMETRY.presentedBlast=0;VOLFX_TELEMETRY.presentedDust=0;
  VOLFX_TELEMETRY.presentedImpact=0;
  VOLFX_TELEMETRY.presentedTrailEnergy=0;VOLFX_TELEMETRY.presentedTrailShell=0;
  VOLFX_TELEMETRY.trailDriverReady=false;VOLFX_TELEMETRY.trailHistoryReady=false;
  VOLFX_TELEMETRY.fallbackQueries=0;VOLFX_TELEMETRY.fallbackHits=0;
  VOLFX_TELEMETRY.driverSamples=0;
  volDriverTelemetrySync();
  volFxSyncRay();
  /* MAINTENANCE PATH — this function is called EVERY frame, including frames
     where the offscreen/AO target was never bound. Clearing the presentation
     bits above is the whole reason: those bits are what suppress the armed
     flipbook, so a bit left over from the last composited frame would also
     suppress the fallback on a frame that cannot composite, and the detonation
     would render as nothing at all. Everything below needs the offscreen
     colour+depth, so on those frames the correct behaviour is to leave with
     the bits cleared and let the flipbook own the frame. */
  if(canPresent===false) return;
  if(!volFxActive()) return;
  if(volN<=0) return;
  /* Thin ordnance wakes lose their white core and scalloped soot boundary in
     the shared half-resolution blast target. Trail kinds remain probe-only,
     so evaluate them at scene resolution while their cost/quality is being
     measured; production explosions retain the established half-res path. */
  let trailFullRes=false,curveTrail=false;
  for(let vi=0;vi<volN;vi++)if(volIsTrailKind(volKind[vi])){
    trailFullRes=true;if(volKind[vi]===VOL_TRAIL_CURVE_ENERGY||volKind[vi]===VOL_TRAIL_CURVE_SHELL)curveTrail=true;
  }
  if(!volAlloc(Math.max(1,trailFullRes?aoW:aoW>>1), Math.max(1,trailFullRes?aoH:aoH>>1))) return;

  /* ---- cull + project ------------------------------------------------- */
  const cb=(typeof camBounds==='function')?camBounds():null;
  const pxPerWorld=volH/Math.max(1,(typeof orthoSpan==='number'?orthoSpan:1500));
  let n=0, area=0;
  /* Phase B used to run its five-tap bilateral upsample over the entire AO
     target even when three tactical volumes covered <0.2% of it. Project the
     accepted proxy boxes once and scissor the composite to their exact union.
     The march remains half-resolution and depth-aware, and the preset still
     owns the same 24/32 maximum steps; this only removes guaranteed-zero
     fullscreen work. Coordinates stay in GL's bottom-left framebuffer space. */
  let compX0=aoW,compY0=aoH,compX1=0,compY1=0;
  for(let i=0;i<volN;i++){
    const life=volLife[i]; if(!(life>0)) continue;
    const age=Math.min(1,volT[i]/life);
    const g=volRenderGrow(volKind[i],age,volR0[i],pxPerWorld,
      volAX[i],volAY[i],volAZ[i],volStyle[i]);
    const ex=g*volAX[i], ey=g*volAY[i], ez=g*volAZ[i];
    const rad=Math.max(ex,Math.max(ey,ez));
    /* Fog disclosure is a GROUND-PLANE question: what the player would see is
       this volume's footprint on the terrain. Using the 3D radius let a tall
       plume's vertical half-extent (aspect y up to 3.6) inflate the test by
       several times the real footprint, so a volume whose ground position was
       well inside the fog could still be judged visible. */
    const radXZ=Math.max(ex,ez);
    if(cb){
      if(volPX[i]+rad<cb.x0||volPX[i]-rad>cb.x1) { VOLFX_TELEMETRY.culled++; continue; }
      if(volPZ[i]+rad<cb.y0||volPZ[i]-rad>cb.y1) { VOLFX_TELEMETRY.culled++; continue; }
    }
    /* Fog of war owns disclosure. A volume must not draw an enemy detonation
       the player has no vision of — the same rule every other FX loop in
       render3d.js applies. */
    const fogVisible=typeof fogFxFootprintVisible==='function'
      ?fogFxFootprintVisible(volPX[i],volPZ[i],radXZ)
      :(typeof fogPointVisible!=='function'||fogPointVisible(volPX[i],volPZ[i]));
    if(!fogVisible){
      VOLFX_TELEMETRY.culled++; continue;
    }
    for(let cz=-1;cz<=1;cz+=2)for(let cy=-1;cy<=1;cy+=2)for(let cx=-1;cx<=1;cx+=2){
      const wx=volPX[i]+ex*cx,wy=volPY[i]+ey*cy,wz=volPZ[i]+ez*cz;
      const cw=matVP[3]*wx+matVP[7]*wy+matVP[11]*wz+matVP[15];
      if(Math.abs(cw)<1e-5)continue;
      const sx=((matVP[0]*wx+matVP[4]*wy+matVP[8]*wz+matVP[12])/cw*.5+.5)*aoW;
      const sy=((matVP[1]*wx+matVP[5]*wy+matVP[9]*wz+matVP[13])/cw*.5+.5)*aoH;
      compX0=Math.min(compX0,sx);compX1=Math.max(compX1,sx);
      compY0=Math.min(compY0,sy);compY1=Math.max(compY1,sy);
    }
    volOrder[n]=i;
    /* Ortho: the camera ray is constant, so a depth key of dot(centre,rayDir)
       is EXACT and a descending insertion sort over <=48 entries is free.
       Required because each volume's own march emits premultiplied "over", so
       cross-volume compositing has to be back-to-front. */
    volKey[n]=volPX[i]*volRayX+volPY[i]*volRayY+volPZ[i]*volRayZ;
    volArea[n]=Math.PI*ex*ez*pxPerWorld*pxPerWorld;
    area+=volArea[n];
    n++;
  }
  if(n<=0) return;

  /* A ready driver is sampled only by the blast/smoke density material.  This
     is telemetry for the runtime probe, not an additional event/layer count. */
  if(volDriverReady){
    for(let s=0;s<n;s++){
      const k=volKind[volOrder[s]];
      if(k===VOL_BLAST||k===VOL_SMOKE) VOLFX_TELEMETRY.driverSamples++;
    }
  }

  /* ---- sort far -> near (descending along the view ray) ---------------- */
  for(let a=1;a<n;a++){
    const ki=volKey[a], oi=volOrder[a], ai=volArea[a];
    let b=a-1;
    while(b>=0&&volKey[b]<ki){ volKey[b+1]=volKey[b]; volOrder[b+1]=volOrder[b]; volArea[b+1]=volArea[b]; b--; }
    volKey[b+1]=ki; volOrder[b+1]=oi; volArea[b+1]=ai;
  }

  /* ---- step budget: ONE uniform, never a boolean gate ------------------
     perfScale appears here and nowhere else, as a multiplier. The effect never
     disappears under load; it gets coarser. */
  const ps=(typeof perfScale==='number'?perfScale:1);
  const budget=volW*volH*(4.0+8.0*Math.max(0.25,Math.min(1,ps)));
  const ceil=volStepCeiling();
  const steps=Math.max(6,Math.min(ceil,Math.floor(budget/Math.max(1,area))));

  /* ---- pack instances -------------------------------------------------- */
  for(let s=0;s<n;s++){
    const i=volOrder[s], o=s*VOL_INST_FLOATS;
    const life=volLife[i];
    const age=Math.min(1,volT[i]/life);
    const g=volRenderGrow(volKind[i],age,volR0[i],pxPerWorld,
      volAX[i],volAY[i],volAZ[i],volStyle[i]);
    /* NO SECOND TAIL FADE HERE. The march already dissolves the field with an
       age-driven erosion threshold that is shape-aware (it eats the thin
       edges first and leaves the dense core last). Multiplying a second
       smoothstep on top of it made the two fades compound: by 62% of life the
       core was being attenuated twice and the blast visually disappeared while
       its own clock still had a third of the burn left to run, which is the
       "late-life double fade" the audit saw. One fade, owned by the shader. */
    volInstData[o  ]=volPX[i];
    volInstData[o+1]=volPY[i];
    volInstData[o+2]=volPZ[i];
    volInstData[o+3]=age;
    volInstData[o+4]=g*volAX[i];
    volInstData[o+5]=g*volAY[i];
    volInstData[o+6]=g*volAZ[i];
    volInstData[o+7]=volKind[i];
    volInstData[o+8]=volDens[i];
    volInstData[o+9]=volEmis[i];
    /* Lane 10 was a 0..64 seed. Pack the tiny internal material profile above
       that range so the shader can recover both without widening the instance
       struct or introducing another volume draw. */
    volInstData[o+10]=volSeed[i]+volStyle[i]*64;
    /* LANE 11 CARRIES LIFE IN SECONDS, not the world radius it used to hold.
       The shader never read that radius (its `rMax` was dead), and the march
       needs ABSOLUTE time: "sub-100 ms flash" is 6% of a 1.6 s bombardment but
       22% of a 0.46 s contact hit, so no normalised threshold can express it
       for both. Extents already carry the size, so nothing is lost. */
    volInstData[o+11]=life;
    volInstData[o+12]=volTR[i]/255;
    volInstData[o+13]=volTG[i]/255;
    volInstData[o+14]=volTB[i]/255;
    volInstData[o+15]=volAngle[i];
    volInstData[o+16]=volTX[i];
    volInstData[o+17]=volTY[i];
    volInstData[o+18]=volTZ[i];
    volInstData[o+19]=volTHalf[i]*g;
  }

  /* ---- state save ------------------------------------------------------
     EVERY piece of state this pass mutates is captured, and the restore runs
     from a finally. The depth attachment is the dangerous one: Phase B detaches
     aoDepth from aoFB2 to break a feedback loop, and a throw anywhere between
     the detach and the re-attach used to leave the scene's own framebuffer with
     NO depth buffer — the additive block and the billboard pass both depth-test
     against it, so a single bad frame silently removed depth from everything
     drawn after this point. The old restore also assumed it knew what the
     caller's state was ("EXACTLY what render3d left") and hardcoded cullFace
     BACK plus a specific blendFunc; it now puts back what was actually there. */
  const wasFB=gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const wasVP=gl.getParameter(gl.VIEWPORT);
  const wasScBox=gl.getParameter(gl.SCISSOR_BOX);
  const wasScissor=gl.isEnabled(gl.SCISSOR_TEST);
  const wasProg=gl.getParameter(gl.CURRENT_PROGRAM);
  const wasVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  const wasArr=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  const wasActive=gl.getParameter(gl.ACTIVE_TEXTURE);
  const wasBlend=gl.isEnabled(gl.BLEND), wasCull=gl.isEnabled(gl.CULL_FACE);
  const wasDepth=gl.isEnabled(gl.DEPTH_TEST), wasMask=gl.getParameter(gl.DEPTH_WRITEMASK);
  const wasCullMode=gl.getParameter(gl.CULL_FACE_MODE);
  const wasSrcRGB=gl.getParameter(gl.BLEND_SRC_RGB),wasDstRGB=gl.getParameter(gl.BLEND_DST_RGB);
  const wasSrcA=gl.getParameter(gl.BLEND_SRC_ALPHA),wasDstA=gl.getParameter(gl.BLEND_DST_ALPHA);
  const wasEqRGB=gl.getParameter(gl.BLEND_EQUATION_RGB),wasEqA=gl.getParameter(gl.BLEND_EQUATION_ALPHA);
  gl.activeTexture(gl.TEXTURE0);  const wasTex0=gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.activeTexture(gl.TEXTURE4);  const wasTex4=gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.activeTexture(gl.TEXTURE10); const wasTex10=gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.activeTexture(gl.TEXTURE11); const wasTex11=gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.activeTexture(gl.TEXTURE13); const wasTex13=gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.activeTexture(gl.TEXTURE0+VOL_DRIVER_UNIT); const wasTexDriver=gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.activeTexture(wasActive);
  /* Drain any pre-existing error so the NO_ERROR gate below judges THIS pass
     rather than inheriting a flag another system left set. */
  gl.getError();
  let composited=false;
  /* Declared out here because the telemetry write below the finally reads
     them, and a throw must still leave them defined. */
  let compSW=0,compSH=0;
  try{

  /* ================= PHASE A — march into volFB =========================
     Sampling aoDepth HERE is safe: the feedback rule applies only to the
     currently bound DRAW framebuffer, and aoDepth is attached to aoFB2, which
     is not bound. */
  gl.bindFramebuffer(gl.FRAMEBUFFER,volFB);
  gl.viewport(0,0,volW,volH);
  gl.disable(gl.SCISSOR_TEST);
  /* clearBufferfv, NOT clearColor+clear: this runs mid-frame and must not
     leave a different clear colour behind for whoever clears next. */
  gl.clearBufferfv(gl.COLOR,0,VOL_ZERO4);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.FRONT);                 // rasterise BACK faces: works inside the box too
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);   // premultiplied over: what the march emits

  gl.useProgram(volProg);
  gl.bindBuffer(gl.ARRAY_BUFFER,volInstVBO);
  gl.bufferSubData(gl.ARRAY_BUFFER,0,volInstData,0,n*VOL_INST_FLOATS);

  gl.activeTexture(gl.TEXTURE12); gl.bindTexture(gl.TEXTURE_3D,volNoiseTex);
  gl.activeTexture(gl.TEXTURE4);  gl.bindTexture(gl.TEXTURE_2D,aoDepth);
  gl.activeTexture(gl.TEXTURE0+VOL_DRIVER_UNIT); gl.bindTexture(gl.TEXTURE_2D,volDriverTex);
  const trailDriverTex=typeof mfOrdnanceTrailDriverTexture==='function'?mfOrdnanceTrailDriverTexture():null;
  gl.activeTexture(gl.TEXTURE11);gl.bindTexture(gl.TEXTURE_2D,trailDriverTex);
  const trailHistoryTex=curveTrail?volFxTrailHistoryTexture():null;
  gl.activeTexture(gl.TEXTURE10);gl.bindTexture(gl.TEXTURE_2D,trailHistoryTex);
  gl.uniform1i(volU.uNoise,12);
  gl.uniform1i(volU.uDep,4);
  gl.uniform1i(volU.uDriver,VOL_DRIVER_UNIT);
  gl.uniform1f(volU.uDriverReady,volDriverReady?1:0);
  gl.uniform1i(volU.uTrailDriver,11);
  gl.uniform1f(volU.uTrailDriverReady,trailDriverTex?1:0);
  gl.uniform1i(volU.uTrailHistory,10);
  gl.uniform1f(volU.uTrailHistoryReady,trailHistoryTex?1:0);
  VOLFX_TELEMETRY.trailHistoryReady=!!trailHistoryTex;
  VOLFX_TELEMETRY.trailDriverReady=!!trailDriverTex;
  gl.uniformMatrix4fv(volU.uVP,false,matVP);
  gl.uniform3f(volU.uRayDir,volRayX,volRayY,volRayZ);

  const sd=(Sun&&Sun.dir)?Sun.dir:[0.4,0.8,0.45];
  const sc=(Sun&&Sun.col)?Sun.col:[1,0.95,0.86];
  const sk=(Sun&&Sun.sky)?Sun.sky:[0.4,0.45,0.55];
  const gn=(Sun&&Sun.gnd)?Sun.gnd:[0.22,0.22,0.25];
  gl.uniform3f(volU.uSunDir,sd[0],sd[1],sd[2]);
  gl.uniform3f(volU.uSunCol,sc[0],sc[1],sc[2]);
  gl.uniform3f(volU.uAmbSky,sk[0],sk[1],sk[2]);
  gl.uniform3f(volU.uAmbGnd,gn[0],gn[1],gn[2]);
  gl.uniform3f(volU.uWind,0.35,0,0.18);
  gl.uniform2f(volU.uInvVolSize,1/volW,1/volH);
  gl.uniform1f(volU.uWorldPerPx,Math.max(.24,(typeof orthoSpan==='number'?orthoSpan:500)/Math.max(1,typeof VH==='number'?VH:852)));
  /* 15000 = far - near from m4ortho(-6000, 9000) in camUpdateMatrices
     (mesh.js:3277). FSAO hardcodes the same constant as uWorldPerZ at
     mesh.js:2611. COUPLING: change the ortho near/far and BOTH must change. */
  gl.uniform1f(volU.uDepthScale,15000.0);
  /* Extinction. 0.055 marched to a translucent film that read as a flat
     layer, not a mass — the frame-02 critique. 0.12 puts real optical depth
     in the interior: the silhouette occludes, the blackbody core still burns
     through the thin pockets, and the sun-side/far-side probe shading above
     has something to bite on. */
  gl.uniform1f(volU.uSigma,0.12);
  /* Henyey-Greenstein is a per-frame CONSTANT under ortho (both uRayDir and
     uSunDir are constant), so it is evaluated once here instead of per step —
     a genuine orthographic win. DUAL LOBE: this camera looks DOWN at smoke
     lit from ABOVE, i.e. permanent backscatter geometry, and a single
     forward lobe (g=0.35) evaluated there starved the sun term to ~0.2 and
     the whole volume went black. Real soot backscatters (multiple
     scattering folded into a negative-g lobe), so mix a forward and a
     backward lobe the way every dual-lobe HG media model does. */
  {
    const cosT=volRayX*sd[0]+volRayY*sd[1]+volRayZ*sd[2];
    const HG=(g)=>(1-g*g)/Math.pow(Math.max(1e-3,1+g*g-2*g*cosT),1.5);
    gl.uniform1f(volU.uPhase,0.5*(0.65*HG(0.5)+0.35*HG(-0.2)));
  }
  gl.uniform1f(volU.uTime,volTime);
  gl.uniform1f(volU.uWaterOn,(typeof waterIdxCount!=='undefined'&&waterIdxCount>0)?1:0);
  gl.uniform1f(volU.uWaterY,(typeof WATER_Y!=='undefined')?WATER_Y:0);
  gl.uniform1i(volU.uSteps,steps);

  gl.bindVertexArray(volVAO);
  gl.drawArraysInstanced(gl.TRIANGLES,0,36,n);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER,null);

  /* ================= PHASE B — composite into aoFB2 =====================
     aoDepth IS attached to aoFB2 and the bilateral upsample samples it: that
     is a framebuffer feedback loop. csmApply has the identical situation and
     records the consequence at mesh.js:3052-3055 — "ANGLE D3D11 returns
     INVALID_OPERATION (1282) and the multiply is undefined". Detach, draw,
     RE-ATTACH; the re-attach is mandatory because the additive effects block
     (render3d.js:2166) and the billboard pass both depth-test against it. */
  gl.bindFramebuffer(gl.FRAMEBUFFER,aoFB2);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,null,0);
  gl.viewport(0,0,aoW,aoH);
  const compPad=6;
  const compSX=Math.max(0,Math.floor(compX0)-compPad),compSY=Math.max(0,Math.floor(compY0)-compPad);
  const compEX=Math.min(aoW,Math.ceil(compX1)+compPad),compEY=Math.min(aoH,Math.ceil(compY1)+compPad);
  compSW=Math.max(0,compEX-compSX);compSH=Math.max(0,compEY-compSY);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(compSX,compSY,compSW,compSH);
  /* CULLING OFF FOR THE COMPOSITE. Phase A left cullFace(FRONT) so the box
     BACK faces rasterise. The fullscreen triangle is wound CCW, i.e. FRONT
     facing, so leaving that state on culls the composite entirely: volTex
     fills correctly, the draw reports no GL error, and absolutely nothing
     reaches aoColB. Measured exactly that — 719 non-zero half-res texels in
     volTex against a 0-pixel delta in aoColB. aoResolve disables culling
     around its own fullscreen triangle for the same reason (mesh.js:2596). */
  gl.disable(gl.CULL_FACE);
  gl.useProgram(volProgUp);
  gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D,volTex);
  gl.activeTexture(gl.TEXTURE4);  gl.bindTexture(gl.TEXTURE_2D,aoDepth);
  gl.uniform1i(volUup.uVol,13);
  gl.uniform1i(volUup.uDep,4);
  gl.uniform2f(volUup.uVolSize,volW,volH);
  gl.uniform2f(volUup.uInvVolSize,1/volW,1/volH);
  gl.uniform1f(volUup.uDepthScale,15000.0);
  gl.uniform1f(volUup.uBilateral,volBilateral?1:0);
  gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  gl.bindVertexArray(volEmptyVAO);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindVertexArray(null);
  gl.disable(gl.SCISSOR_TEST);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,aoDepth,0);
  /* EVERY input this pass depends on must still be real, the composite must
     have covered a positive area, and the driver must report NO_ERROR. Any one
     of these failing means the frame did not actually put a volume on screen,
     and claiming presentation would suppress the armed flipbook as well —
     leaving the detonation invisible. Draw-time gl.getError() is read here
     rather than under a debug flag because it is the only signal that
     separates "composited" from "silently produced nothing". */
  composited=(compSW>0&&compSH>0)
    &&!!volProg&&!!volProgUp&&!!volVAO&&!!volEmptyVAO&&!!volInstVBO
    &&!!volNoiseTex&&!!volDriverTex&&!!volTex&&!!volFB&&(!curveTrail||!!trailHistoryTex)
    &&(typeof aoDepth!=='undefined'&&!!aoDepth)
    &&gl.getError()===gl.NO_ERROR;

  }catch(e){
    composited=false;
    VOLFX_TELEMETRY.lastError='draw: '+String(e&&e.message||e).slice(0,150);
  }finally{
    /* Depth goes back FIRST and unconditionally: everything downstream of this
       pass depth-tests against aoDepth. */
    try{
      gl.bindFramebuffer(gl.FRAMEBUFFER,aoFB2);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,aoDepth,0);
    }catch(_){}
    gl.bindFramebuffer(gl.FRAMEBUFFER,wasFB);
    gl.viewport(wasVP[0],wasVP[1],wasVP[2],wasVP[3]);
    gl.scissor(wasScBox[0],wasScBox[1],wasScBox[2],wasScBox[3]);
    if(wasScissor) gl.enable(gl.SCISSOR_TEST); else gl.disable(gl.SCISSOR_TEST);
    gl.activeTexture(gl.TEXTURE12); gl.bindTexture(gl.TEXTURE_3D,null);
    gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D,wasTex10);
    gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D,wasTex11);
    gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D,wasTex13);
    gl.activeTexture(gl.TEXTURE0+VOL_DRIVER_UNIT); gl.bindTexture(gl.TEXTURE_2D,wasTexDriver);
    gl.activeTexture(gl.TEXTURE4);  gl.bindTexture(gl.TEXTURE_2D,wasTex4);
    gl.activeTexture(gl.TEXTURE0);  gl.bindTexture(gl.TEXTURE_2D,wasTex0);
    gl.activeTexture(wasActive);
    gl.bindVertexArray(wasVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER,wasArr);
    gl.useProgram(wasProg);
    gl.cullFace(wasCullMode);
    gl.blendFuncSeparate(wasSrcRGB,wasDstRGB,wasSrcA,wasDstA);
    gl.blendEquationSeparate(wasEqRGB,wasEqA);
    if(wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    if(wasCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
    if(wasBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
    gl.depthMask(wasMask);
  }

  /* ATOMIC PRESENTATION. A partial pass claims nothing, so render3d reveals
     exactly one armed flipbook instead of showing both or neither. */
  if(!composited){ volPresented.fill(0); VOLFX_TELEMETRY.drawn=0; VOLFX_TELEMETRY.driverSamples=0; return; }
  for(let s=0;s<n;s++){
    const i=volOrder[s];volPresented[i]=1;
    if(volKind[i]===VOL_BLAST)VOLFX_TELEMETRY.presentedBlast++;
    else if(volKind[i]===VOL_DUST)VOLFX_TELEMETRY.presentedDust++;
    else if(volKind[i]===VOL_IMPACT)VOLFX_TELEMETRY.presentedImpact++;
    else if(volKind[i]===VOL_TRAIL_ENERGY||volKind[i]===VOL_TRAIL_CURVE_ENERGY)VOLFX_TELEMETRY.presentedTrailEnergy++;
    else if(volKind[i]===VOL_TRAIL_SHELL||volKind[i]===VOL_TRAIL_CURVE_SHELL)VOLFX_TELEMETRY.presentedTrailShell++;
  }
  VOLFX_TELEMETRY.drawn=n;
  VOLFX_TELEMETRY.steps=steps;
  VOLFX_TELEMETRY.budget=budget;
  VOLFX_TELEMETRY.marchedPx=area;
  VOLFX_TELEMETRY.compositePx=compSW*compSH;
  VOLFX_TELEMETRY.w=volW; VOLFX_TELEMETRY.h=volH;
  if(volCheckErr) VOLFX_TELEMETRY.glErr=gl.getError();
}

/* The camera ray under ortho: view-forward is the NEGATION of the third row of
   m4look's basis (mesh.js:54-56), which is matV[2], matV[6], matV[10].
   Recomputed once per frame in volFxDraw's caller order — cheap enough to just
   do it at the top of the draw. */
let volRayX=0, volRayY=-1, volRayZ=0;
let volBilateral=true;
let volCheckErr=false;
function volFxSyncRay(){
  if(typeof matV==='undefined'||!matV) return;
  let x=-matV[2], y=-matV[6], z=-matV[10];
  const l=Math.hypot(x,y,z)||1;
  volRayX=x/l; volRayY=y/l; volRayZ=z/l;
}
function volSmooth(a,b,x){
  const t=Math.max(0,Math.min(1,(x-a)/((b-a)||1e-6)));
  return t*t*(3-2*t);
}

/* Probe knobs. These exist so the design's bring-up controls are runnable
   without editing this file: each one is a single uniform or preset value, and
   none of them forks a code path.
     volFxSetBilateral(false)  -> 1-fetch upsample (the degraded rung)
     volFxSetErrCheck(true)    -> read gl.getError() into telemetry each frame
     volFxDebugBurst(...)      -> queue a volume without the sim  */
function volFxSetBilateral(on){ volBilateral=!!on; }
function volFxSetErrCheck(on){ volCheckErr=!!on; }
function volFxDebugBurst(x,y,worldY,kind,radius,opts){ return volFxBurst(x,y,worldY,kind,radius,opts); }
function volFxDebugTrail(x0,z0,y0,x1,z1,y1,kind,opts){
  const o=opts||{},k=kind|0;if(k!==VOL_TRAIL_ENERGY&&k!==VOL_TRAIL_SHELL)return [];
  const count=10,arc=Number.isFinite(o.arc)?o.arc:150,life=o.life>0?o.life:8,age=Math.max(0,Math.min(.9,Number(o.age)||.18));
  const headQ=Math.max(.08,Math.min(1,Number.isFinite(o.headQ)?o.headQ:.86));
  const span=Math.max(.08,Math.min(headQ,Number.isFinite(o.span)?o.span:(k===VOL_TRAIL_ENERGY?.62:.54)));
  const qStart=headQ-span;
  const tint=o.tint||(k===VOL_TRAIL_ENERGY?[96,220,255]:[255,118,38]),ids=[];
  const point=(q)=>[x0+(x1-x0)*q,y0+(y1-y0)*q+Math.sin(q*Math.PI)*arc,z0+(z1-z0)*q];
  for(let j=0;j<count;j++){
    const q0=qStart+span*(j/count),q1=qStart+span*((j+1)/count);
    const u0=j/count,u1=(j+1)/count,a=point(q0),b=point(q1);
    /* Deposited shell exhaust leaves the ballistic centreline. Its oldest
       samples rise and move with a restrained cross-wind while the hot end
       remains attached to the shell. This is deterministic history shaping,
       not render-loop emission. */
    if(k===VOL_TRAIL_SHELL){
      const wa=(1-u0)*(1-u0),wb=(1-u1)*(1-u1);
      a[0]+=wa*8.0;a[1]+=wa*13.0;a[2]-=wa*5.0;
      b[0]+=wb*8.0;b[1]+=wb*13.0;b[2]-=wb*5.0;
    }
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
    const q=(j+.5)/count,thick=k===VOL_TRAIL_ENERGY?7.0:16.0-q*8.0;
    const segLen=Math.hypot(dx,dy,dz),ux=dx/segLen,uy=dy/segLen,uz=dz/segLen;
    /* Twelve percent overlap at both ends closes filtering/jitter cracks while
       keeping ten independently culled proxies for the curved history. */
    const halfLen=segLen*.62;
    const ex=Math.abs(ux)*halfLen+thick,ey=Math.abs(uy)*halfLen+thick,ez=Math.abs(uz)*halfLen+thick;
    const s=volFxBurst((a[0]+b[0])*.5,(a[2]+b[2])*.5,(a[1]+b[1])*.5,k,1,{
      life,rise:0,dens:(o.dens||(k===VOL_TRAIL_ENERGY?1.42:1.55))*(0.58+0.42*q),
      emis:(o.emis||(k===VOL_TRAIL_ENERGY?1.65:.92))*(0.72+0.28*q),
      direction:[dx,dz],aspect:[ex,ey,ez],trailAxis:[ux,uy,uz],trailHalf:halfLen,
      tint,style:j,seed:(o.seed||7.25)%64
    });
    if(s>=0){volT[s]=age*life;ids.push(s);}
  }
  return ids;
}

/* Self-initialise at the end of our own file. There is no GL context at load
   time, so this only primes the ray basis and the epoch latch; the programs,
   buffers and 3D noise are built lazily on first use, exactly like gpfxInit.
   The bundle gate (tools/bundle.mjs:91) requires a file that declares init
   functions to call one of them here rather than relying on main.js. */
function volFxBoot(){
  volEpoch=-1;
  volInitFailed=false;
  volN=0;
  volFxSyncRay();
}
volFxBoot();
