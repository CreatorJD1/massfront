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
     accumulates Beer-Lambert transmittance with a closed-form single-scatter
     term, and terminates the march on the scene depth buffer so smoke is cut
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
const VOL_DUST  = 2;      // flat ground-hugging collapse/shear dust
const VOL_PLUME = 3;      // mushroom column / singularity plume

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
const volAX   = new Float32Array(VOL_CAP);   // aspect
const volAY   = new Float32Array(VOL_CAP);
const volAZ   = new Float32Array(VOL_CAP);
const volKind = new Uint8Array(VOL_CAP);
const volTR   = new Uint8Array(VOL_CAP);
const volTG   = new Uint8Array(VOL_CAP);
const volTB   = new Uint8Array(VOL_CAP);
let   volN    = 0;

/* Draw-side scratch. Preallocated: this is per-frame code. */
const VOL_INST_FLOATS = 16;                                  // 64 B per instance
const volInstData = new Float32Array(VOL_CAP*VOL_INST_FLOATS);
const volOrder    = new Int32Array(VOL_CAP);
const VOL_ZERO4   = new Float32Array([0,0,0,0]);
const volKey      = new Float32Array(VOL_CAP);
const volArea     = new Float32Array(VOL_CAP);

/* GL handles. Every one of these is invalidated by a context loss, which is
   what volEpoch is for. */
let volProg=null, volProgUp=null, volVAO=null, volEmptyVAO=null, volCubeVBO=null, volInstVBO=null;
let volNoiseTex=null, volFB=null, volTex=null;
let volW=0, volH=0, volFailN=0;
let volU={}, volUup={};
/* WHICH GL CONTEXT THESE HANDLES BELONG TO, and whether the build already
   failed on it. Both halves are load-bearing, and gpufx.js:44-48 records why:
   a lost context leaves volProg TRUTHY (so a `if(volProg) return` guard refuses
   to rebuild and the pass drives dead VAOs forever), and a failed build with no
   latch recompiles on EVERY burst on a device that cannot compile it. */
let volEpoch=-1, volInitFailed=false;
let volTime=0;

/* Read-back for probes. Sampled AFTER volFxDraw in the same frame — the counts
   are not zeroed by the draw. (render3d.js:3204-3207 records the opposite
   mistake with bbIcon.n.) */
const VOLFX_TELEMETRY={live:0, drawn:0, steps:0, marchedPx:0, budget:0,
                       progOK:false, glErr:0, w:0, h:0, culled:0};
function volFxTelemetry(){ return VOLFX_TELEMETRY; }

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
  /* DEFAULT OFF UNTIL VERIFIED. The implementing agent hit the session limit
     before the adversarial verify pass ran, so this raymarcher has never been
     confirmed on a real GPU: not its shader link, not its depth compositing,
     not its cost. It previously returned 16 on 'medium', which IS the target
     device - unverified shader work would have auto-enabled on the owner's
     phone. Opt in explicitly with GFX.volSteps (the branch above), verify,
     then restore the preset ladder:
         q==='low'?0 : q==='medium'?16 : q==='cinematic'?32 : 24
     Note the measured baseline before spending effort here: volumetrics are a
     LOOK decision, not a performance one - see the handoff. */
  return 0;
}
function volLiveCap(){ return volStepCeiling()<=16?24:VOL_CAP; }
function volFxActive(){
  if(volStepCeiling()<=0) return false;
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
  const cap=volLiveCap();

  /* COALESCING. This is what makes the bounded-cost argument true: a cluster
     shell that fires 8 bomblets (sim.js:4959-4966) must produce ONE volume,
     not eight. Merge a same-kind neighbour that is still young. */
  const mergeR=radius*0.6;
  for(let i=0;i<volN;i++){
    if(volKind[i]!==k) continue;
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

  const tint=o.tint;
  volPX[s]=x; volPY[s]=worldY; volPZ[s]=y;
  volR0[s]=radius;
  volLife[s]=o.life>0?o.life:(k===VOL_BLAST?2.6:k===VOL_PLUME?7.0:3.4);
  volT[s]=0;
  volKind[s]=k;
  volDens[s]=o.dens>0?o.dens:(k===VOL_DUST?0.85:1.0);
  volEmis[s]=o.emis>0?o.emis:0;
  volRise[s]=(o.rise!=null)?o.rise:(k===VOL_PLUME?26:k===VOL_BLAST?9:3);
  volDX[s]=o.drift?o.drift[0]:0;
  volDZ[s]=o.drift?o.drift[1]:0;
  volSeed[s]=Math.random()*64;
  if(o.aspect){ volAX[s]=o.aspect[0]; volAY[s]=o.aspect[1]; volAZ[s]=o.aspect[2]; }
  else if(k===VOL_DUST){ volAX[s]=1.25; volAY[s]=0.5; volAZ[s]=1.25; }
  else if(k===VOL_PLUME){ volAX[s]=1; volAY[s]=2.6; volAZ[s]=1; }
  else { volAX[s]=1; volAY[s]=0.92; volAZ[s]=1; }
  if(tint){ volTR[s]=tint[0]|0; volTG[s]=tint[1]|0; volTB[s]=tint[2]|0; }
  else if(k===VOL_DUST){ volTR[s]=196; volTG[s]=178; volTB[s]=150; }
  else if(k===VOL_BLAST){ volTR[s]=118; volTG[s]=112; volTB[s]=108; }
  else { volTR[s]=134; volTG[s]=130; volTB[s]=128; }
  return s;
}

/* Age the ring. Swap-down removal keeps the prefix dense with no holes. */
function volFxTick(dt){
  if(!(dt>0)) dt=0;
  for(let i=0;i<volN;){
    volT[i]+=dt;
    if(volLife[i]<=0||volT[i]>=volLife[i]){
      const j=--volN;
      if(j!==i){
        volPX[i]=volPX[j]; volPY[i]=volPY[j]; volPZ[i]=volPZ[j];
        volR0[i]=volR0[j]; volLife[i]=volLife[j]; volT[i]=volT[j];
        volDens[i]=volDens[j]; volEmis[i]=volEmis[j]; volRise[i]=volRise[j];
        volDX[i]=volDX[j]; volDZ[i]=volDZ[j]; volSeed[i]=volSeed[j];
        volAX[i]=volAX[j]; volAY[i]=volAY[j]; volAZ[i]=volAZ[j];
        volKind[i]=volKind[j]; volTR[i]=volTR[j]; volTG[i]=volTG[j]; volTB[i]=volTB[j];
      }
      continue;
    }
    volPY[i]+=volRise[i]*dt;
    volPX[i]+=volDX[i]*dt;
    volPZ[i]+=volDZ[i]*dt;
    volRise[i]*=Math.pow(0.62, dt);          // buoyancy bleeds off
    i++;
  }
}
function volFxClear(){ volN=0; }

/* Growth curve per kind. Age is the ONLY animation input the shader gets, so
   the CPU and the GPU must agree on the world extents or the march will start
   outside the density it is looking for. */
function volGrow(kind, age){
  if(kind===VOL_DUST)  return 0.45+1.25*age;
  if(kind===VOL_PLUME) return 0.50+0.70*age;
  if(kind===VOL_BLAST) return 0.55+0.75*age;
  return 0.60+0.90*age;
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
layout(location=3) in vec4 aPar;    // dens, emis, seed, rWorld
layout(location=4) in vec4 aTint;   // albedo rgb, softness
uniform mat4 uVP;
flat out vec4 vCtr;
flat out vec4 vExt;
flat out vec4 vPar;
flat out vec4 vTint;
out vec3 vWorld;
void main(){
  vCtr=aCtr; vExt=aExt; vPar=aPar; vTint=aTint;
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
in vec3 vWorld;

uniform sampler3D uNoise;
uniform sampler2D uDep;
uniform vec3  uRayDir;
uniform vec3  uSunDir;
uniform vec3  uSunCol;
uniform vec3  uAmbSky;
uniform vec3  uAmbGnd;
uniform vec3  uWind;
uniform vec2  uInvVolSize;
uniform float uDepthScale;   // far - near = 15000, see note above
uniform float uSigma;
uniform float uPhase;
uniform float uTime;
uniform float uWaterOn;
uniform float uWaterY;
uniform int   uSteps;
out vec4 o;

/* 4x4 ordered Bayer, arithmetic (no array indexing). SPATIAL ONLY — there is
   deliberately no temporal jitter term here. mesh.js:2262-2265 records what
   happened the last time this project rotated samples per frame without TAA:
   "grainy crawling blobs". Do not add one. */
float bayer4(vec2 c){
  ivec2 p=ivec2(mod(c,4.0));
  int x=p.x&3, y=p.y&3;
  int a=x^y;
  int v=((a&1)<<3)|((y&1)<<2)|(((a>>1)&1)<<1)|((y>>1)&1);
  return float(v)*(1.0/16.0);
}

void main(){
  float kind=vExt.w;
  float age=vCtr.w;

  /* --- slab intersection, world units, sign-agnostic ---------------------
     vWorld is the BACK face of the proxy (we cull FRONT), so both roots are
     negative offsets along uRayDir. */
  vec3 iD=1.0/uRayDir;
  vec3 t0=(vCtr.xyz-vExt.xyz-vWorld)*iD;
  vec3 t1=(vCtr.xyz+vExt.xyz-vWorld)*iD;
  vec3 tn=min(t0,t1), tf=max(t0,t1);
  float tEnter=max(max(tn.x,tn.y),tn.z);
  float tExit =min(min(tf.x,tf.y),tf.z);

  /* --- scene depth termination ------------------------------------------
     MIN of the four full-res texels under this half-res pixel: conservative on
     purpose, so smoke is cut at the NEAREST occluder in the footprint and can
     never bleed over a tank's silhouette. The one-texel over-cut that leaves
     is exactly what the bilateral upsample recovers. */
  vec2 uv=gl_FragCoord.xy*uInvVolSize;
  vec2 h=uInvVolSize*0.25;
  float dz=min(min(texture(uDep,uv+vec2( h.x, h.y)).r, texture(uDep,uv+vec2(-h.x, h.y)).r),
               min(texture(uDep,uv+vec2( h.x,-h.y)).r, texture(uDep,uv+vec2(-h.x,-h.y)).r));
  float tHere =gl_FragCoord.z*uDepthScale;
  float tScene=dz*uDepthScale;
  tExit=min(tExit, tScene-tHere);
  /* Water writes NO depth (render3d.js:2148 depthMask(false)), so it cannot
     appear in uDep. WATER_Y is a flat plane at 0 by construction
     (terrain.js:168), so clamping the exit against it analytically is free and
     stops a naval blast rendering its lower half through the seabed. */
  if(uWaterOn>0.5&&uRayDir.y<0.0) tExit=min(tExit,(uWaterY-vWorld.y)/uRayDir.y);
  tEnter=max(tEnter,-tHere);
  float span=tExit-tEnter;
  if(span<=0.0) discard;                    // fully occluded: ~12 ALU, 4 fetches

  float steps=float(uSteps);
  float ds=span/steps;
  float dith=bayer4(gl_FragCoord.xy)+fract(vPar.z);
  float t=tEnter+ds*(0.5+fract(dith));

  vec3  acc=vec3(0.0);
  float T=1.0;
  float noiseScale=0.0125/(0.55+0.9*age);
  float erode=0.18+0.55*age;
  vec3  sl=uSunDir/vExt.xyz;
  float kk=dot(sl,sl);
  float hotAge=clamp(1.0-age/0.30,0.0,1.0);

  for(int i=0;i<64;i++){
    if(i>=uSteps) break;
    vec3 p=vWorld+uRayDir*t;
    t+=ds;

    /* --- analytic shape, ZERO texture fetches, evaluated FIRST ----------- */
    vec3 q=(p-vCtr.xyz)/vExt.xyz;
    if(kind>2.5){
      /* plume: a stem that widens into a cap, leaning downwind */
      float hh=q.y*0.5+0.5;
      q.xz/=(0.34+0.66*hh);
      q.xz-=uWind.xz*hh*0.5;
    }else if(kind>1.5){
      q.y*=1.8;                              // dust: flat, ground-hugging
    }
    float r=length(q);
    float shell=1.0-smoothstep(0.42,1.0,r);
    /* THE PRIMARY EARLY-OUT. Inside the box, outside the ellipsoid: about 48%
       of all steps for a sphere in a cube, skipped before any fetch. This is
       why a box proxy costs what a sphere proxy would. */
    if(shell<=0.001) continue;

    /* --- FBM: three octaves out of ONE fetch ---------------------------- */
    vec3 nc=(p-vCtr.xyz)*noiseScale+vec3(vPar.z);
    nc.y-=uTime*0.035+age*0.55;              // buoyant scroll
    vec4 n=texture(uNoise,nc);
    float f=n.r*0.55+n.g*0.30+n.b*0.15;
    f=mix(f,1.0-n.a,0.25);                   // cauliflower billow
    float d=max(shell*(f*1.6-erode),0.0)*vPar.x;
    if(d<=0.0) continue;

    /* --- single scatter, closed form, NO second march -------------------
       A shadow march toward the sun is the thing that kills mobile
       volumetrics. Instead take the analytic chord from p to the shell of the
       anisotropically-scaled unit sphere along the sun direction. 0.55 is the
       mean-vs-local density ratio along that chord. */
    float b=dot(q,sl), c2=dot(q,q)-1.0;
    float chord=(-b+sqrt(max(b*b-kk*c2,0.0)))/max(kk,1e-4);
    float sunT=exp(-uSigma*d*0.55*chord);

    vec3 amb=mix(uAmbGnd,uAmbSky,clamp(q.y*0.5+0.5,0.0,1.0));
    vec3 scat=vTint.rgb*(uSunCol*sunT*uPhase+amb*0.55);
    scat*=(1.0-exp(-2.0*d));                 // powder term: the dark rim

    /* --- emission, VOL_BLAST only ---------------------------------------
       Gated on the DENSE pockets, not on the whole shell — that is what makes
       fire read as seen THROUGH cracks in the smoke rather than as a uniform
       orange ball. */
    vec3 emis=vec3(0.0);
    if(vPar.y>0.0){
      float hot=hotAge*smoothstep(0.25,0.85,shell)*smoothstep(0.35,0.90,d);
      emis=(vec3(1.0,0.28,0.05)*hot+vec3(1.0,0.85,0.55)*hot*hot)*vPar.y*6.0;
    }

    /* --- front-to-back Beer-Lambert, premultiplied ---------------------- */
    float a=1.0-exp(-uSigma*d*ds);
    acc+=T*(scat+emis)*a;
    T*=(1.0-a);
    if(T<0.015) break;                       // saturated: young cores exit in 5-7
  }
  float alpha=1.0-T;
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
  volNoiseTex=volFB=volTex=null;
  volW=volH=0; volFailN=0;
  volU={}; volUup={};
  VOLFX_TELEMETRY.progOK=false;
}

function volFxInit(){
  if(volProg||volInitFailed) return;
  if(typeof gl==='undefined'||!gl) return;
  if(typeof mkProg!=='function'){ volInitFailed=true; return; }

  volProg=mkProg(VOL_VS,VOL_FS,'volfx');
  volProgUp=mkProg(VOL_VS_UP,VOL_FS_UP,'volfx-upsample');
  if(!volProg||!volProgUp){
    /* One may have linked. Release it rather than orphaning it, and LATCH so
       the next detonation does not recompile the pair (gpufx.js:44-48). */
    if(volProg) gl.deleteProgram(volProg);
    if(volProgUp) gl.deleteProgram(volProgUp);
    volProg=volProgUp=null; volInitFailed=true;
    VOLFX_TELEMETRY.progOK=false;
    return;
  }
  for(const k of ['uVP','uNoise','uDep','uRayDir','uSunDir','uSunCol','uAmbSky','uAmbGnd',
                  'uWind','uInvVolSize','uDepthScale','uSigma','uPhase','uTime',
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
  for(let a=1;a<=4;a++){
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
function volFxDraw(dtDraw,Sun){
  VOLFX_TELEMETRY.live=volN;
  VOLFX_TELEMETRY.drawn=0; VOLFX_TELEMETRY.culled=0;
  VOLFX_TELEMETRY.marchedPx=0; VOLFX_TELEMETRY.steps=0;
  const dt=(typeof dtDraw==='number'&&dtDraw>0&&dtDraw<0.5)?dtDraw:0.016;
  volFxSyncRay();
  volTime+=dt;
  volFxTick(dt);
  if(!volFxActive()) return;
  if(volN<=0) return;
  if(!volAlloc(Math.max(1,aoW>>1), Math.max(1,aoH>>1))) return;

  /* ---- cull + project ------------------------------------------------- */
  const cb=(typeof camBounds==='function')?camBounds():null;
  const pxPerWorld=volH/Math.max(1,(typeof orthoSpan==='number'?orthoSpan:1500));
  let n=0, area=0;
  for(let i=0;i<volN;i++){
    const life=volLife[i]; if(!(life>0)) continue;
    const age=Math.min(1,volT[i]/life);
    const g=volGrow(volKind[i],age)*volR0[i];
    const ex=g*volAX[i], ey=g*volAY[i], ez=g*volAZ[i];
    const rad=Math.max(ex,Math.max(ey,ez));
    if(cb){
      if(volPX[i]+rad<cb.x0||volPX[i]-rad>cb.x1) { VOLFX_TELEMETRY.culled++; continue; }
      if(volPZ[i]+rad<cb.y0||volPZ[i]-rad>cb.y1) { VOLFX_TELEMETRY.culled++; continue; }
    }
    /* Fog of war owns disclosure. A volume must not draw an enemy detonation
       the player has no vision of — the same rule every other FX loop in
       render3d.js applies. */
    if(typeof fogPointVisible==='function'&&!fogPointVisible(volPX[i],volPZ[i])){
      VOLFX_TELEMETRY.culled++; continue;
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
    const g=volGrow(volKind[i],age)*volR0[i];
    /* Tail fade folded into the density scale so the shader stays branch-free
       on lifetime: the erosion threshold already rises with age, this takes
       the last of it out. */
    const fade=1-volSmooth(0.62,1.0,age);
    volInstData[o  ]=volPX[i];
    volInstData[o+1]=volPY[i];
    volInstData[o+2]=volPZ[i];
    volInstData[o+3]=age;
    volInstData[o+4]=g*volAX[i];
    volInstData[o+5]=g*volAY[i];
    volInstData[o+6]=g*volAZ[i];
    volInstData[o+7]=volKind[i];
    volInstData[o+8]=volDens[i]*fade;
    volInstData[o+9]=volEmis[i];
    volInstData[o+10]=volSeed[i];
    volInstData[o+11]=g;
    volInstData[o+12]=volTR[i]/255;
    volInstData[o+13]=volTG[i]/255;
    volInstData[o+14]=volTB[i]/255;
    volInstData[o+15]=0.5;
  }

  /* ---- state save ------------------------------------------------------ */
  const wasBlend=gl.getParameter(gl.BLEND), wasCull=gl.getParameter(gl.CULL_FACE);
  const wasDepth=gl.getParameter(gl.DEPTH_TEST), wasMask=gl.getParameter(gl.DEPTH_WRITEMASK);

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
  gl.uniform1i(volU.uNoise,12);
  gl.uniform1i(volU.uDep,4);
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
  /* 15000 = far - near from m4ortho(-6000, 9000) in camUpdateMatrices
     (mesh.js:3277). FSAO hardcodes the same constant as uWorldPerZ at
     mesh.js:2611. COUPLING: change the ortho near/far and BOTH must change. */
  gl.uniform1f(volU.uDepthScale,15000.0);
  gl.uniform1f(volU.uSigma,0.055);
  /* Henyey-Greenstein is a per-frame CONSTANT under ortho (both uRayDir and
     uSunDir are constant), so it is evaluated once here instead of per step —
     a genuine orthographic win. */
  {
    const g=0.35, cosT=volRayX*sd[0]+volRayY*sd[1]+volRayZ*sd[2];
    const den=Math.pow(Math.max(1e-3,1+g*g-2*g*cosT),1.5);
    gl.uniform1f(volU.uPhase,0.62*(1-g*g)/den);
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
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,aoDepth,0);

  /* ---- state restore: EXACTLY what render3d.js:2132-2141 left ----------- */
  gl.activeTexture(gl.TEXTURE12); gl.bindTexture(gl.TEXTURE_3D,null);
  gl.activeTexture(gl.TEXTURE0);
  gl.cullFace(gl.BACK);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  if(wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  if(wasCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
  if(wasBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
  gl.depthMask(wasMask);

  VOLFX_TELEMETRY.drawn=n;
  VOLFX_TELEMETRY.steps=steps;
  VOLFX_TELEMETRY.budget=budget;
  VOLFX_TELEMETRY.marchedPx=area;
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
