/* ============================================================================
   MASSFRONT — RIGID BODY PHYSICS
   ----------------------------------------------------------------------------
   WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT

   This is a compact impulse-based rigid-body solver: real mass, a real inertia
   tensor, real angular velocity carried on a quaternion, and contacts resolved
   with normal + Coulomb-friction impulses applied AT THE CONTACT POINT — which
   is the whole reason a piece of rubble tumbles instead of sliding flat. It is
   NOT a general physics engine and it is not trying to be one. It runs for
   DESTRUCTION ONLY: debris thrown off a hit, the pieces a destroyed structure
   breaks into, and the shove an explosion gives to both.

   Everything else in this game deliberately stays parametric:
     * unit movement and pathing        (flow field, thousands of agents)
     * projectiles                      (analytic arcs)
     * sparks / embers / smoke / fire   (the type 0-6,8-10 particle ring)
     * the textured shatter shards      (shX/shY in sim.js — billboards)
     * terrain deformation and water
   A full rigid-body sim per unit would cost more than the entire rest of the
   frame and would buy nothing the player can see. Impactful destruction is the
   goal; a physics engine is not.

   WHY A PURPOSE-BUILT SOLVER AND NOT RAPIER/WASM
     1. The OTA path is TEXT ONLY. src/updater.js does
        `out[f.path]=new TextDecoder().decode(bytes)`, boot.js's validBundle()
        requires `typeof b.files[path]==='string'`, and runBundle() hands each
        one to `new Blob([src],{type:'text/javascript'})`. A .wasm cannot
        survive that round trip — TextDecoder mangles non-UTF-8 bytes
        irreversibly. Shipping wasm would mean base64 inside a .js (+33%,
        ~3.4 MB for rapier3d) listed in assets/data/manifest.json's `order`,
        which tools/publish-hf-release.ps1 gates byte-for-byte.
     2. Instantiating wasm is ASYNCHRONOUS. Every system here self-initialises
        synchronously inside one global scope in manifest order, and main.js's
        init loop has no await point. There is nowhere for `await init()` to
        live without restructuring the boot contract.
     3. The body count that matters is ~100-200 pieces of debris, not 10k. What
        Rapier is good at (broad phase, convex-convex, joints, islands) is not
        what this needs; what this needs is heightfield contact, which is 30
        lines. The JS<->wasm transform marshalling per body per step on an
        Android WebView is a real cost that would eat the theoretical win.
     4. APK size is actively being fought (tools/shrink-apk.ps1). 1.5 MB of
        binary for tumbling rubble is a bad trade.

   BUDGET (measured, see mfPhysStats().stepMs)
     perfScale <= 0.34  ->  40 bodies
     perfScale <= 0.50  ->  96 bodies   (the target device sits here, 0.4125)
     otherwise          -> 224 bodies
   Sleeping bodies cost approximately nothing: they are skipped by the
   integrator, the contact solver and the ground query alike.

   RENDERING
   This file does not own a shader and does not touch the renderer's files.
   Each body is drawn as a small CLUSTER of chunk instances pushed into an
   existing lit instanced stream (FX.wreck — solid pass, depth tested, already
   a CSM shadow caster; FX.rock and FX.crate are the fallbacks). The cluster's
   chunk positions are transformed by the
   body's FULL rotation matrix, so three-axis tumble is genuinely visible even
   though the instance stream carries only a yaw. That is a deliberate
   workaround: instance attribute 10 is taken by Material V2 surface state and
   the vertex stage only knows `aYaw` (src/engine/mesh.js). Attribute slots
   11-15 are free; see the report for the one-attribute change that would let a
   single instance carry a full orientation.

   InstMesh accumulates until flush() and flush() zeroes n, so instances added
   before render() reaches its flush are drawn. mfPhysEmit() therefore runs
   once per FRAME (not per sim step — the accumulator in main.js can take zero
   steps in a frame, which would strobe the debris).
   ============================================================================ */

/* ---------------------------------------------------------------------------
   Pool. Structure-of-arrays: the step touches BZ/BVZ for every body and
   nothing else, so keeping them in separate typed arrays is what makes a
   sleeping field free.
   --------------------------------------------------------------------------- */
const MFPHYS_MAX = 256;                 // hard pool ceiling (allocation, not budget)
const MFPHYS_CHUNKS = 6;                // render chunks per body
const MFPHYS_EVENT_MAX = 3;             // one grouped debris layer = at most 3 readable slabs
const MFPHYS_G = 290;                   // wu/s^2 — matches SH_G / DEBRIS_G exactly
const MFPHYS_MAX_V = 650;               // cosmetic rubble must never become a simulation projectile
const MFPHYS_MAX_W = 32;                // rad/s; above this rotation aliases at RTS scale

const mfpX  = new Float32Array(MFPHYS_MAX), mfpY = new Float32Array(MFPHYS_MAX), mfpZ = new Float32Array(MFPHYS_MAX);
const mfpVX = new Float32Array(MFPHYS_MAX), mfpVY= new Float32Array(MFPHYS_MAX), mfpVZ= new Float32Array(MFPHYS_MAX);
const mfpQX = new Float32Array(MFPHYS_MAX), mfpQY= new Float32Array(MFPHYS_MAX), mfpQZ= new Float32Array(MFPHYS_MAX), mfpQW=new Float32Array(MFPHYS_MAX);
const mfpWX = new Float32Array(MFPHYS_MAX), mfpWY= new Float32Array(MFPHYS_MAX), mfpWZ= new Float32Array(MFPHYS_MAX);
const mfpHX = new Float32Array(MFPHYS_MAX), mfpHY= new Float32Array(MFPHYS_MAX), mfpHZ= new Float32Array(MFPHYS_MAX);
const mfpIM = new Float32Array(MFPHYS_MAX);                              // inverse mass
const mfpIIX= new Float32Array(MFPHYS_MAX), mfpIIY=new Float32Array(MFPHYS_MAX), mfpIIZ=new Float32Array(MFPHYS_MAX); // inverse inertia, body diag
const mfpLife=new Float32Array(MFPHYS_MAX), mfpTTL=new Float32Array(MFPHYS_MAX);
const mfpRest=new Float32Array(MFPHYS_MAX), mfpFric=new Float32Array(MFPHYS_MAX);
const mfpSleepT=new Float32Array(MFPHYS_MAX);
const mfpR=new Uint8Array(MFPHYS_MAX), mfpG=new Uint8Array(MFPHYS_MAX), mfpB=new Uint8Array(MFPHYS_MAX);
const mfpState=new Uint8Array(MFPHYS_MAX);        // 0 free, 1 awake, 2 asleep
const mfpNCh =new Uint8Array(MFPHYS_MAX);
const mfpTrail=new Uint8Array(MFPHYS_MAX);        // render-only velocity line; never a sim particle
const mfpSeq =new Float64Array(MFPHYS_MAX);       // spawn order, for eviction
/* Local ground plane cache: g(x,y) ~= g0 + gx*(x-ax) + gy*(y-ay).
   terrainH() is nine rawH() taps; sampling it per corner per step would be the
   single most expensive thing in this file. Three taps per body per refresh,
   then every corner is two multiplies. */
const mfpG0=new Float32Array(MFPHYS_MAX), mfpGX=new Float32Array(MFPHYS_MAX), mfpGY=new Float32Array(MFPHYS_MAX);
const mfpAX=new Float32Array(MFPHYS_MAX), mfpAY=new Float32Array(MFPHYS_MAX);
const mfpGT=new Float32Array(MFPHYS_MAX);         // seconds until the plane is re-sampled
/* Chunk offsets in BODY space + chunk radius: ox,oy,oz,r */
const mfpCh=new Float32Array(MFPHYS_MAX*MFPHYS_CHUNKS*4);

let mfpLive=0, mfpAwake=0, mfpSeqNext=1;
let mfpStepMs=0, mfpEmitMs=0, mfpChunksDrawn=0;
let mfpHooked=false, mfpEmittedFrame=-1, mfpFrame=0;
let mfpEnabled=true;

/* Physics is presentation-only, so it must not consume Math.random() and
   perturb gameplay's random stream. A private xorshift32 makes destruction
   reproducible for a map, event order and quality tier without adding any
   save/replay/network field. mfPhysClear() re-seeds it at match reset. */
let mfpSeedBase=0x6d2b79f5, mfpRandState=mfpSeedBase;
const mfpAudit={
  steps:0, spawns:0, retired:0, invalidRetires:0,
  evictions:0, budgetTrims:0, motionClamps:0, groundQueries:0,
  burstEvents:0, collapseEvents:0, blastEvents:0,
  impulseEvents:0, impulseHits:0, rigidPieces:0,
  attractEvents:0, attractHits:0, attractConsumed:0,
  attractClamps:0, attractWakeups:0, attractPeakAccel:0,
  groupClamps:0, maxGroup:0, maxLive:0, rngDraws:0,
  emitCalls:0, emittedChunks:0, velocityTrails:0, pausedEmitSkips:0,
  offscreenRetires:0, subpixelRetires:0, acceleratedLife:0
};

function mfPhysHashWord(h,v){
  h^=v>>>0;
  return Math.imul(h,16777619)>>>0;
}
function mfPhysWorldSeed(){
  let h=2166136261>>>0;
  const key=(typeof curMap==='string'&&curMap)?curMap:'massfront';
  for(let i=0;i<key.length;i++) h=mfPhysHashWord(h,key.charCodeAt(i));
  if(typeof MAPDEFS!=='undefined'&&MAPDEFS&&MAPDEFS[key]&&Number.isFinite(MAPDEFS[key].seed))
    h=mfPhysHashWord(h,MAPDEFS[key].seed);
  return h||0x6d2b79f5;
}
function mfPhysSeed(seed){
  let s;
  if(seed===undefined||seed===null) s=mfPhysWorldSeed();
  else if(typeof seed==='number'&&Number.isFinite(seed)) s=seed>>>0;
  else{
    const key=String(seed); s=2166136261>>>0;
    for(let i=0;i<key.length;i++) s=mfPhysHashWord(s,key.charCodeAt(i));
  }
  mfpSeedBase=(s>>>0)||0x6d2b79f5;
  mfpRandState=mfpSeedBase;
  return mfpSeedBase;
}
function mfPhysRand(){
  let x=mfpRandState>>>0;
  x^=x<<13; x^=x>>>17; x^=x<<5;
  mfpRandState=(x>>>0)||0x6d2b79f5;
  mfpAudit.rngDraws++;
  return mfpRandState/4294967296;
}
function mfPhysResetAudit(){
  for(const k in mfpAudit) mfpAudit[k]=0;
}

/* Sleep thresholds. Deliberately generous: rubble that keeps micro-jittering
   reads as broken, and every sleeping body is a body the solver skips. */
const MFPHYS_SLEEP_V=2.20, MFPHYS_SLEEP_W=0.90, MFPHYS_SLEEP_T=0.34;

function mfPhysGround(x,y){
  return (typeof terrainH==='function') ? terrainH(x,y) : 0;
}

/* How many bodies this device may keep alive at once. Read live rather than
   cached: perfScale moves with load and with the graphics preset. */
function mfPhysBudget(){
  const ps=(typeof perfScale==='number'&&perfScale>0)?perfScale:1;
  if(ps<=0.34) return 40;
  if(ps<=0.50) return 96;
  return 224;
}

/* Camera-aware retirement is presentation policy only: it changes no damage,
   collision, salvage or gameplay state. One camBounds sample is shared by the
   complete step so the policy does not turn into a per-body layout query. */
let mfpViewClass=0,mfpViewPx=999;
function mfPhysViewSample(i,B){
  const x=mfpX[i],y=mfpY[i],r=Math.max(mfpHX[i],mfpHY[i],mfpHZ[i]);
  mfpViewClass=0;mfpViewPx=999;
  if(B&&Number.isFinite(B.x0)&&Number.isFinite(B.x1)&&Number.isFinite(B.y0)&&Number.isFinite(B.y1)){
    const dx=x<B.x0?B.x0-x:x>B.x1?x-B.x1:0;
    const dy=y<B.y0?B.y0-y:y>B.y1?y-B.y1:0;
    const w=Math.max(1,B.x1-B.x0),h=Math.max(1,B.y1-B.y0);
    mfpViewClass=(dx<=60+r&&dy<=60+r)?0:(dx<=w*.42+120&&dy<=h*.42+120?1:2);
    const vh=(typeof innerHeight==='number'&&innerHeight>0)?innerHeight:720;
    mfpViewPx=r*2*vh/h;
  }else if(typeof orthoSpan==='number'&&orthoSpan>0){
    const vh=(typeof innerHeight==='number'&&innerHeight>0)?innerHeight:720;
    mfpViewPx=r*2*vh/orthoSpan;
  }
  return mfpViewClass;
}
function mfPhysCamBounds(){
  if(typeof camBounds!=='function')return null;
  try{return camBounds()||null;}catch(err){return null;}
}
function mfPhysScaledTTL(i,base){
  const ps=Math.max(.2,Math.min(1,(typeof perfScale==='number'&&perfScale>0)?perfScale:1));
  const pressure=Math.max(0,Math.min(1,mfpLive/Math.max(1,mfPhysBudget())));
  const view=mfPhysViewSample(i,mfPhysCamBounds());
  let scale=(.70+.30*ps)*(1-.36*pressure*pressure);
  if(view===1)scale*=.72;else if(view===2)scale*=.46;
  if(mfpViewPx<1.5)scale*=.72;
  return Math.max(1.35,base*scale);
}

function mfPhysSampleGround(i){
  const x=mfpX[i], y=mfpY[i], d=6;
  const g0=mfPhysGround(x,y);
  mfpG0[i]=g0;
  mfpGX[i]=(mfPhysGround(x+d,y)-g0)/d;
  mfpGY[i]=(mfPhysGround(x,y+d)-g0)/d;
  mfpAX[i]=x; mfpAY[i]=y;
  mfpGT[i]=0.28+((i*0.0137)%0.22);        // staggered so refreshes never bunch
  mfpAudit.groundQueries+=3;
}
function mfPhysPlaneAt(i,x,y){
  return mfpG0[i]+mfpGX[i]*(x-mfpAX[i])+mfpGY[i]*(y-mfpAY[i]);
}

/* ---------------------------------------------------------------------------
   Allocation. When the pool is at budget the OLDEST body goes — sleeping ones
   first, because a settled chunk of rubble disappearing behind the player is
   far less noticeable than one vanishing mid-flight.
   --------------------------------------------------------------------------- */
function mfPhysAlloc(){
  const budget=mfPhysBudget();
  let free=-1;
  for(let i=0;i<MFPHYS_MAX;i++) if(mfpState[i]===0){ free=i; break; }
  if(free>=0&&mfpLive<budget){ mfpLive++; return free; }
  let victim=-1, best=Infinity, victimAsleep=false;
  for(let i=0;i<MFPHYS_MAX;i++){
    if(mfpState[i]===0) continue;
    const asleep=mfpState[i]===2;
    if(victimAsleep&&!asleep) continue;
    if(asleep&&!victimAsleep){ victim=i; best=mfpSeq[i]; victimAsleep=true; continue; }
    if(mfpSeq[i]<best){ victim=i; best=mfpSeq[i]; }
  }
  if(victim<0){
    if(free>=0){ mfpLive++; return free; }
    return -1;
  }
  mfpAudit.evictions++;
  return victim;
}

/* perfScale can fall after a dense scene is already alive. Allocation alone
   cannot enforce the new lower budget, so trim deterministically: oldest
   sleeping rubble first, then oldest airborne rubble. This runs only on a
   tier transition (normally one frame), not as a permanent O(n^2) cost. */
function mfPhysTrimToBudget(){
  const budget=mfPhysBudget();
  let removed=0;
  while(mfpLive>budget){
    let victim=-1, best=Infinity, victimAsleep=false;
    for(let i=0;i<MFPHYS_MAX;i++){
      if(mfpState[i]===0) continue;
      const asleep=mfpState[i]===2;
      if(victimAsleep&&!asleep) continue;
      if(asleep&&!victimAsleep){ victim=i; best=mfpSeq[i]; victimAsleep=true; continue; }
      if(mfpSeq[i]<best){ victim=i; best=mfpSeq[i]; }
    }
    if(victim<0) break;
    if(mfpState[victim]===1&&mfpAwake>0) mfpAwake--;
    mfpState[victim]=0; mfpLive--; removed++;
  }
  mfpAudit.budgetTrims+=removed;
  mfpAudit.retired+=removed;
  return removed;
}

/* ---------------------------------------------------------------------------
   PUBLIC: spawn one rigid body.
   o = {hx,hy,hz  half extents (wu)
        vx,vy,vz  launch velocity (wu/s)
        wx,wy,wz  launch angular velocity (rad/s)
        r,g,b     tint 0..255
        mass, restitution, friction, ttl, chunks}
   Returns the body handle, or -1 when the budget refuses it.
   --------------------------------------------------------------------------- */
function mfPhysSpawn(x,y,z,o){
  if(!mfpEnabled) return -1;
  o=o||{};
  const i=mfPhysAlloc();
  if(i<0) return -1;
  const hx=Math.max(0.35,o.hx||1.4), hy=Math.max(0.35,o.hy||1.4), hz=Math.max(0.30,o.hz||1.0);
  const m=Math.max(0.25,o.mass||(hx*hy*hz*2.4));
  mfpX[i]=x; mfpY[i]=y; mfpZ[i]=z;
  mfpVX[i]=o.vx||0; mfpVY[i]=o.vy||0; mfpVZ[i]=o.vz||0;
  /* Random start orientation: a slab that always begins axis-aligned reads as
     a spawned prop, not as something that just came off a building. */
  const a=mfPhysRand()*Math.PI*2, b=mfPhysRand()*Math.PI*2, c=mfPhysRand()*Math.PI*2;
  const ca=Math.cos(a*0.5), sa=Math.sin(a*0.5), cb=Math.cos(b*0.5), sb=Math.sin(b*0.5), cc=Math.cos(c*0.5), sc=Math.sin(c*0.5);
  mfpQW[i]=ca*cb*cc+sa*sb*sc; mfpQX[i]=sa*cb*cc-ca*sb*sc;
  mfpQY[i]=ca*sb*cc+sa*cb*sc; mfpQZ[i]=ca*cb*sc-sa*sb*cc;
  mfpWX[i]=o.wx!==undefined?o.wx:(mfPhysRand()*2-1)*7;
  mfpWY[i]=o.wy!==undefined?o.wy:(mfPhysRand()*2-1)*7;
  mfpWZ[i]=o.wz!==undefined?o.wz:(mfPhysRand()*2-1)*7;
  mfpHX[i]=hx; mfpHY[i]=hy; mfpHZ[i]=hz;
  mfpIM[i]=1/m;
  /* Solid box inertia about the centre of mass. Full extents are 2h, so
     I = m/12 * ((2a)^2 + (2b)^2) = m/3 * (a^2 + b^2). */
  mfpIIX[i]=3/(m*(hy*hy+hz*hz));
  mfpIIY[i]=3/(m*(hx*hx+hz*hz));
  mfpIIZ[i]=3/(m*(hx*hx+hy*hy));
  const baseTTL=o.ttl||18;
  mfpTTL[i]=mfPhysScaledTTL(i,baseTTL); mfpLife[i]=mfpTTL[i];
  mfpRest[i]=o.restitution!==undefined?o.restitution:0.22;
  mfpFric[i]=o.friction!==undefined?o.friction:0.62;
  mfpSleepT[i]=0;
  mfpR[i]=o.r!==undefined?o.r:150; mfpG[i]=o.g!==undefined?o.g:142; mfpB[i]=o.b!==undefined?o.b:126;
  mfpTrail[i]=o.trail?1:0;
  mfpState[i]=1;
  mfpSeq[i]=mfpSeqNext++;
  mfPhysSampleGround(i);
  /* Chunk cluster. Laid along the body's LONGEST axis so a slab flipping end
     over end is unmistakable; a cube gets a compact clump. */
  const want=Math.max(1,Math.min(MFPHYS_CHUNKS,o.chunks||(hx>2.2||hy>2.2?4:2)));
  mfpNCh[i]=want;
  const base=i*MFPHYS_CHUNKS*4;
  const longX=hx>=hy&&hx>=hz, longY=hy>=hx&&hy>=hz;
  for(let k=0;k<want;k++){
    const t=want===1?0:(k/(want-1))*2-1;                 // -1..1 along the long axis
    const j=mfPhysRand()*0.34;
    const ox=longX?t*hx*0.72:(mfPhysRand()*2-1)*hx*0.42;
    const oy=longY?t*hy*0.72:(mfPhysRand()*2-1)*hy*0.42;
    const oz=(!longX&&!longY)?t*hz*0.72:(mfPhysRand()*2-1)*hz*0.42;
    /* Overlapping, not spaced: the cluster has to read as ONE solid piece
       whose shape rotates, and gaps between chunks read as separate specks. */
    const r=Math.max(hx,hy,hz)*(0.66+j)/Math.max(1,Math.sqrt(want)*0.68);
    mfpCh[base+k*4  ]=ox; mfpCh[base+k*4+1]=oy;
    mfpCh[base+k*4+2]=oz; mfpCh[base+k*4+3]=r;
  }
  mfpAudit.spawns++;
  if(mfpLive>mfpAudit.maxLive) mfpAudit.maxLive=mfpLive;
  mfPhysHook();
  return i;
}

function mfPhysWake(i){
  if(mfpState[i]===2){ mfpState[i]=1; mfpSleepT[i]=0; }
}

/* Rotate a body-space vector into world space by the body's quaternion. */
function mfPhysRot(i,vx,vy,vz,out){
  const qx=mfpQX[i],qy=mfpQY[i],qz=mfpQZ[i],qw=mfpQW[i];
  const tx=2*(qy*vz-qz*vy), ty=2*(qz*vx-qx*vz), tz=2*(qx*vy-qy*vx);
  out[0]=vx+qw*tx+(qy*tz-qz*ty);
  out[1]=vy+qw*ty+(qz*tx-qx*tz);
  out[2]=vz+qw*tz+(qx*ty-qy*tx);
  return out;
}
/* Inverse rotation — world into body space. */
function mfPhysUnrot(i,vx,vy,vz,out){
  const qx=-mfpQX[i],qy=-mfpQY[i],qz=-mfpQZ[i],qw=mfpQW[i];
  const tx=2*(qy*vz-qz*vy), ty=2*(qz*vx-qx*vz), tz=2*(qx*vy-qy*vx);
  out[0]=vx+qw*tx+(qy*tz-qz*ty);
  out[1]=vy+qw*ty+(qz*tx-qx*tz);
  out[2]=vz+qw*tz+(qx*ty-qy*tx);
  return out;
}
const _mfpA=[0,0,0], _mfpB=[0,0,0], _mfpC=[0,0,0];

/* World-space I^-1 * L, without ever forming the 3x3: rotate into body space,
   scale by the diagonal, rotate back. */
function mfPhysInvInertiaMul(i,lx,ly,lz,out){
  mfPhysUnrot(i,lx,ly,lz,_mfpB);
  _mfpB[0]*=mfpIIX[i]; _mfpB[1]*=mfpIIY[i]; _mfpB[2]*=mfpIIZ[i];
  return mfPhysRot(i,_mfpB[0],_mfpB[1],_mfpB[2],out);
}

/* Apply an impulse J at world offset r from the centre of mass.
   dv = J/m, dw = I^-1 (r x J). This is the single line that makes debris
   tumble: an off-centre hit produces torque, and nothing else in this game's
   FX has ever produced torque. */
function mfPhysApplyImpulse(i,jx,jy,jz,rx,ry,rz){
  const im=mfpIM[i];
  mfpVX[i]+=jx*im; mfpVY[i]+=jy*im; mfpVZ[i]+=jz*im;
  const tx=ry*jz-rz*jy, ty=rz*jx-rx*jz, tz=rx*jy-ry*jx;
  mfPhysInvInertiaMul(i,tx,ty,tz,_mfpC);
  mfpWX[i]+=_mfpC[0]; mfpWY[i]+=_mfpC[1]; mfpWZ[i]+=_mfpC[2];
  /* Bound pathological chain blasts. Beyond these speeds a one-frame streak
     is all the player sees, while contact impulses and quaternion integration
     become needlessly unstable. Direction and momentum ratio are preserved. */
  const v2=mfpVX[i]*mfpVX[i]+mfpVY[i]*mfpVY[i]+mfpVZ[i]*mfpVZ[i];
  if(v2>MFPHYS_MAX_V*MFPHYS_MAX_V){
    const s=MFPHYS_MAX_V/Math.sqrt(v2);
    mfpVX[i]*=s; mfpVY[i]*=s; mfpVZ[i]*=s; mfpAudit.motionClamps++;
  }
  const w2=mfpWX[i]*mfpWX[i]+mfpWY[i]*mfpWY[i]+mfpWZ[i]*mfpWZ[i];
  if(w2>MFPHYS_MAX_W*MFPHYS_MAX_W){
    const s=MFPHYS_MAX_W/Math.sqrt(w2);
    mfpWX[i]*=s; mfpWY[i]*=s; mfpWZ[i]*=s; mfpAudit.motionClamps++;
  }
}

/* ---------------------------------------------------------------------------
   THE STEP.
   Semi-implicit Euler for the integrator, sequential impulses for the
   contacts. Contacts are the eight box corners against the cached local
   ground plane; the plane's normal is the terrain's real slope, so a chunk
   thrown onto a hillside slides downhill and settles against the grade rather
   than balancing on a flat imaginary floor.
   --------------------------------------------------------------------------- */
function mfPhysStep(dt){
  if(!mfpEnabled||mfpLive<=0){ mfpAwake=0; mfpStepMs=mfpStepMs*0.9; return; }
  if(!(dt>0)) return;
  if(dt>0.1) dt=0.1;                    // never integrate a stall
  mfPhysTrimToBudget();
  if(mfpLive<=0){ mfpAwake=0; return; }
  const t0=performance.now();
  let awake=0, live=0;
  const viewB=mfPhysCamBounds();
  const ps=Math.max(.2,Math.min(1,(typeof perfScale==='number'&&perfScale>0)?perfScale:1));
  const pressure=Math.max(0,Math.min(1,mfpLive/Math.max(1,mfPhysBudget())));
  const pressureAge=1+(1-ps)*.42+pressure*.68;
  mfpAudit.steps++;

  for(let i=0;i<MFPHYS_MAX;i++){
    const st=mfpState[i];
    if(st===0) continue;
    live++;
    const view=mfPhysViewSample(i,viewB),subpixel=mfpViewPx<1.5;
    let ageMul=pressureAge;
    if(view===1)ageMul*=1.75;else if(view===2)ageMul*=3.40;
    if(subpixel)ageMul*=1.55;
    if(st===2)ageMul*=1.35;
    mfpAudit.acceleratedLife+=dt*Math.max(0,ageMul-1);
    mfpLife[i]-=dt*ageMul;
    if(mfpLife[i]<=0){
      mfpState[i]=0;live--;mfpAudit.retired++;
      if(view>0)mfpAudit.offscreenRetires++;if(subpixel)mfpAudit.subpixelRetires++;
      continue;
    }

    /* Sleeping bodies are skipped entirely, but the ground under them can
       still move — a crater opening beneath settled rubble has to relaunch
       it. One cheap re-sample per second, staggered. */
    if(st===2){
      mfpGT[i]-=dt;
      if(mfpGT[i]<=0){
        const before=mfPhysPlaneAt(i,mfpX[i],mfpY[i]);
        mfPhysSampleGround(i);
        mfpGT[i]+=0.85;
        if(Math.abs(mfPhysPlaneAt(i,mfpX[i],mfpY[i])-before)>0.35) mfPhysWake(i);
      }
      continue;
    }
    awake++;

    /* ---- integrate ---- */
    mfpVZ[i]-=MFPHYS_G*dt;
    const air=1-Math.min(0.45,0.42*dt);          // air drag only; ground drag is friction
    mfpVX[i]*=air; mfpVY[i]*=air;
    mfpX[i]+=mfpVX[i]*dt; mfpY[i]+=mfpVY[i]*dt; mfpZ[i]+=mfpVZ[i]*dt;

    /* quaternion: q' = q + 0.5 * (w as pure quaternion) * q * dt */
    const wx=mfpWX[i], wy=mfpWY[i], wz=mfpWZ[i];
    let qx=mfpQX[i], qy=mfpQY[i], qz=mfpQZ[i], qw=mfpQW[i];
    const h=dt*0.5;
    const nx=qx+h*( wx*qw + wy*qz - wz*qy);
    const ny=qy+h*(-wx*qz + wy*qw + wz*qx);
    const nz=qz+h*( wx*qy - wy*qx + wz*qw);
    const nw=qw+h*(-wx*qx - wy*qy - wz*qz);
    const ql=Math.sqrt(nx*nx+ny*ny+nz*nz+nw*nw)||1;
    qx=nx/ql; qy=ny/ql; qz=nz/ql; qw=nw/ql;
    mfpQX[i]=qx; mfpQY[i]=qy; mfpQZ[i]=qz; mfpQW[i]=qw;
    mfpWX[i]*=air; mfpWY[i]*=air; mfpWZ[i]*=air;

    /* ---- ground plane refresh ---- */
    mfpGT[i]-=dt;
    const moved=Math.abs(mfpX[i]-mfpAX[i])+Math.abs(mfpY[i]-mfpAY[i]);
    if(mfpGT[i]<=0||moved>5) mfPhysSampleGround(i);

    /* ---- contacts: eight corners vs the local plane ---- */
    const gx=mfpGX[i], gy=mfpGY[i];
    let nlen=Math.sqrt(gx*gx+gy*gy+1);
    const Nx=-gx/nlen, Ny=-gy/nlen, Nz=1/nlen;
    const hx=mfpHX[i], hy=mfpHY[i], hz=mfpHZ[i];
    const e=mfpRest[i], mu=mfpFric[i];
    let deepest=0, support=0;

    for(let iter=0;iter<2;iter++){
      for(let c=0;c<8;c++){
        const cx=(c&1)?hx:-hx, cy=(c&2)?hy:-hy, cz=(c&4)?hz:-hz;
        mfPhysRot(i,cx,cy,cz,_mfpA);
        const rx=_mfpA[0], ry=_mfpA[1], rz=_mfpA[2];
        const px=mfpX[i]+rx, py=mfpY[i]+ry, pz=mfpZ[i]+rz;
        const g=mfPhysPlaneAt(i,px,py);
        const pen=(g-pz)*Nz;                       // perpendicular depth
        /* SUPPORT is proximity, not penetration. Counting only penetrating
           corners meant the positional correction below lifted the body out
           of "contact" every other step, the count alternated, and the sleep
           timer could never run to completion — measured 0/9 asleep. */
        if(iter===0&&pen>-0.45){ support++; if(pen>deepest) deepest=pen; }
        if(pen<=0) continue;

        /* relative velocity at the contact point */
        const vpx=mfpVX[i]+(mfpWY[i]*rz-mfpWZ[i]*ry);
        const vpy=mfpVY[i]+(mfpWZ[i]*rx-mfpWX[i]*rz);
        const vpz=mfpVZ[i]+(mfpWX[i]*ry-mfpWY[i]*rx);
        const vn=vpx*Nx+vpy*Ny+vpz*Nz;
        if(vn>=0) continue;

        /* effective mass along the normal: 1/m + N . ((I^-1 (r x N)) x r) */
        let ax=ry*Nz-rz*Ny, ay=rz*Nx-rx*Nz, az=rx*Ny-ry*Nx;
        mfPhysInvInertiaMul(i,ax,ay,az,_mfpC);
        const kx=_mfpC[1]*rz-_mfpC[2]*ry, ky=_mfpC[2]*rx-_mfpC[0]*rz, kz=_mfpC[0]*ry-_mfpC[1]*rx;
        const kn=mfpIM[i]+(kx*Nx+ky*Ny+kz*Nz);
        if(kn<=1e-6) continue;
        /* Restitution only above a threshold: applying it to a 0.2 wu/s
           micro-contact is what makes resting bodies buzz forever. */
        const bounce=(-vn>60)?e:0;
        const jn=Math.max(0,-(1+bounce)*vn/kn);
        mfPhysApplyImpulse(i,Nx*jn,Ny*jn,Nz*jn,rx,ry,rz);

        /* Coulomb friction along the tangential slip direction. This is what
           stops a landed chunk from skating, and what converts a glancing
           landing into a roll. */
        const vpx2=mfpVX[i]+(mfpWY[i]*rz-mfpWZ[i]*ry);
        const vpy2=mfpVY[i]+(mfpWZ[i]*rx-mfpWX[i]*rz);
        const vpz2=mfpVZ[i]+(mfpWX[i]*ry-mfpWY[i]*rx);
        const vn2=vpx2*Nx+vpy2*Ny+vpz2*Nz;
        let tx2=vpx2-vn2*Nx, ty2=vpy2-vn2*Ny, tz2=vpz2-vn2*Nz;
        const tl=Math.sqrt(tx2*tx2+ty2*ty2+tz2*tz2);
        if(tl>0.02){
          tx2/=tl; ty2/=tl; tz2/=tl;
          let bx=ry*tz2-rz*ty2, by=rz*tx2-rx*tz2, bz=rx*ty2-ry*tx2;
          mfPhysInvInertiaMul(i,bx,by,bz,_mfpC);
          const fx=_mfpC[1]*rz-_mfpC[2]*ry, fy=_mfpC[2]*rx-_mfpC[0]*rz, fz=_mfpC[0]*ry-_mfpC[1]*rx;
          const kt=mfpIM[i]+(fx*tx2+fy*ty2+fz*tz2);
          if(kt>1e-6){
            const jt=Math.min(mu*jn,tl/kt);
            mfPhysApplyImpulse(i,-tx2*jt,-ty2*jt,-tz2*jt,rx,ry,rz);
          }
        }
      }
    }

    /* Positional correction. Only the deepest corner, only the excess past a
       slop band, and only partially — a full correction per corner ejects the
       body off the ground and the whole pile pops. */
    if(deepest>0.03) mfpZ[i]+=Math.min(1.2,(deepest-0.03)*0.55)/Math.max(0.35,Nz);

    /* ---- sleep ---- */
    const sv=Math.abs(mfpVX[i])+Math.abs(mfpVY[i])+Math.abs(mfpVZ[i]);
    const sw=Math.abs(mfpWX[i])+Math.abs(mfpWY[i])+Math.abs(mfpWZ[i]);
    /* mfpSleepT counts CONTINUOUS GROUND SUPPORT, not "time spent already
       slow". The earlier version reset it whenever the body was still moving,
       so a slab sliding down a grade steeper than atan(friction), or one
       rocking on a corner, reset it forever: measured 41 of 96 bodies still
       awake after fourteen seconds. Rubble that never stops is not an option.
       Damping now ramps WITH the supported time — negligible during the
       landing and the first roll, decisive after a second — and a body that
       has been on the ground for three seconds is put down regardless. */
    if(support>0) mfpSleepT[i]+=dt; else mfpSleepT[i]=0;
    if(support>0){
      const ramp=Math.min(1,mfpSleepT[i]/1.1);
      const rd=1-Math.min(0.62,(0.9+5.4*ramp*ramp)*dt);
      mfpVX[i]*=rd; mfpVY[i]*=rd; mfpVZ[i]*=rd;
      mfpWX[i]*=rd; mfpWY[i]*=rd; mfpWZ[i]*=rd;
    }
    const slow=sv<MFPHYS_SLEEP_V&&sw<MFPHYS_SLEEP_W;
    if(support>=1&&((slow&&mfpSleepT[i]>=MFPHYS_SLEEP_T)||mfpSleepT[i]>=3.0)){
      mfpState[i]=2; mfpSleepT[i]=0;
      mfpVX[i]=mfpVY[i]=mfpVZ[i]=0; mfpWX[i]=mfpWY[i]=mfpWZ[i]=0;
      mfpGT[i]=0.85;
      awake--;
    }

    /* A body that has fallen through the world (map edge, a torn heightfield)
       is retired rather than integrated forever. */
    if(mfpZ[i]<-400||!Number.isFinite(mfpX[i])||!Number.isFinite(mfpY[i])||
       !Number.isFinite(mfpZ[i])||!Number.isFinite(mfpVX[i])||
       !Number.isFinite(mfpVY[i])||!Number.isFinite(mfpVZ[i])){
      mfpState[i]=0; live--; awake--; mfpAudit.retired++; mfpAudit.invalidRetires++;
    }
  }
  mfpLive=live; mfpAwake=awake;
  /* Exponential average — a single frame's number is noise on a WebView. */
  mfpStepMs=mfpStepMs*0.86+(performance.now()-t0)*0.14;
}

/* ---------------------------------------------------------------------------
   PUBLIC: explosion impulse. Real momentum transfer, applied at an off-centre
   point so a blast SPINS what it shoves instead of sliding it.
   --------------------------------------------------------------------------- */
function mfPhysImpulse(x,y,z,radius,power){
  if(!mfpEnabled||mfpLive<=0) return 0;
  mfpAudit.impulseEvents++;
  const r2=radius*radius;
  let hit=0;
  for(let i=0;i<MFPHYS_MAX;i++){
    if(mfpState[i]===0) continue;
    const dx=mfpX[i]-x, dy=mfpY[i]-y, dz=mfpZ[i]-z;
    const d2=dx*dx+dy*dy+dz*dz;
    if(d2>r2) continue;
    const d=Math.sqrt(d2)||0.001;
    const fall=1-d/radius;
    mfPhysWake(i);
    /* Upward bias: a ground blast lifts as much as it pushes, and rubble that
       only slides outward reads as a wind gust. */
    const mass=1/Math.max(1e-5,mfpIM[i]);
    const mag=power*fall*fall*mass*0.85;
    const ux=dx/d, uy=dy/d, uz=Math.max(0.35,dz/d+0.55);
    const ul=Math.sqrt(ux*ux+uy*uy+uz*uz)||1;
    const off=Math.max(mfpHX[i],mfpHY[i],mfpHZ[i])*0.7;
    mfPhysApplyImpulse(i,ux/ul*mag,uy/ul*mag,uz/ul*mag,
      (mfPhysRand()*2-1)*off,(mfPhysRand()*2-1)*off,(mfPhysRand()*2-1)*off);
    hit++;
  }
  mfpAudit.impulseHits+=hit;
  return hit;
}

/* ---------------------------------------------------------------------------
   PUBLIC: bounded attraction field. This is deliberately an acceleration,
   not an outward-style impulse multiplied by body mass: every loose chunk
   should visibly fall into a singularity, while the authoritative unit mass
   resistance remains in sim.js. `tangent` adds an accretion-orbit component;
   `consumeRadius` retires cosmetic matter that crosses the horizon.
   --------------------------------------------------------------------------- */
function mfPhysAttract(x,y,z,radius,strength,dt,tangent,consumeRadius){
  if(!mfpEnabled||mfpLive<=0||!Number.isFinite(x)||!Number.isFinite(y)||
     !Number.isFinite(z)||!Number.isFinite(radius)||!Number.isFinite(strength)||
     !Number.isFinite(dt)||!(dt>0)||!(radius>0)||!(strength>0)) return 0;
  mfpAudit.attractEvents++;
  /* The positional form is the shipped compatibility surface:
       attract(x,y,z,radius,strength,dt,orbit,consumeRadius)
     New callers may pass an options object in `orbit` without creating a
     second singularity API. All limits are presentation-only and deterministic. */
  const o=tangent&&typeof tangent==='object'?tangent:null;
  let orbit=o?o.orbit:tangent;
  orbit=Number.isFinite(orbit)?Math.max(-1.5,Math.min(1.5,orbit)):0;
  let horizon=o?o.consumeRadius:consumeRadius;
  horizon=Number.isFinite(horizon)?Math.max(0,Math.min(radius*.85,horizon)):0;
  const maxConsume=Math.max(0,Math.min(16,Math.floor(o&&Number.isFinite(o.maxConsume)?o.maxConsume:6)));
  const maxAccel=Math.max(1,Math.min(2400,o&&Number.isFinite(o.maxAcceleration)?o.maxAcceleration:strength));
  const maxSpeed=Math.max(8,Math.min(MFPHYS_MAX_V,o&&Number.isFinite(o.maxSpeed)?o.maxSpeed:MFPHYS_MAX_V));
  const verticalScale=Math.max(0,Math.min(1.5,o&&Number.isFinite(o.verticalScale)?o.verticalScale:1));
  const step=Math.min(dt,1/15);
  if(step!==dt||maxAccel!==strength) mfpAudit.attractClamps++;
  const r2=radius*radius;
  const horizon2=horizon*horizon;
  let hit=0, consumed=0;
  for(let i=0;i<MFPHYS_MAX;i++){
    const state=mfpState[i];
    if(state===0) continue;
    const dx=x-mfpX[i],dy=y-mfpY[i],dz=z-mfpZ[i];
    const d2=dx*dx+dy*dy+dz*dz;
    if(d2>r2) continue;
    if(horizon>0&&d2<=horizon2&&consumed<maxConsume){
      mfpState[i]=0;
      mfpLive=Math.max(0,mfpLive-1);
      if(state===1) mfpAwake=Math.max(0,mfpAwake-1);
      mfpAudit.retired++; consumed++; continue;
    }
    const d=Math.sqrt(d2)||0.001, fall=1-d/radius;
    const accel=Math.min(maxAccel,strength*fall*fall);
    const invD=1/d, tx=-dy*invD,ty=dx*invD;
    if(state===2) mfpAudit.attractWakeups++;
    mfPhysWake(i);
    mfpVX[i]+=(dx*invD+tx*orbit)*accel*step;
    mfpVY[i]+=(dy*invD+ty*orbit)*accel*step;
    mfpVZ[i]+=dz*invD*accel*verticalScale*step;
    const v2=mfpVX[i]*mfpVX[i]+mfpVY[i]*mfpVY[i]+mfpVZ[i]*mfpVZ[i];
    if(v2>maxSpeed*maxSpeed){
      const s=maxSpeed/Math.sqrt(v2);
      mfpVX[i]*=s;mfpVY[i]*=s;mfpVZ[i]*=s;
      mfpAudit.motionClamps++;mfpAudit.attractClamps++;
    }
    mfpSleepT[i]=0;
    if(accel>mfpAudit.attractPeakAccel) mfpAudit.attractPeakAccel=accel;
    hit++;
  }
  mfpAudit.attractHits+=hit;
  mfpAudit.attractConsumed+=consumed;
  return hit+consumed;
}

/* ---------------------------------------------------------------------------
   PUBLIC: a burst of rigid debris. `size` is the source's world scale.
   --------------------------------------------------------------------------- */
function mfPhysBurst(x,y,z,size,o){
  if(!mfpEnabled) return 0;
  o=o||{};
  mfpAudit.burstEvents++;
  const ps=(typeof perfScale==='number'&&perfScale>0)?perfScale:1;
  const room=Math.max(0,mfPhysBudget()-mfpLive);
  const raw=Math.max(0,Math.round(o.count!==undefined?o.count:Math.max(1,2+size*0.30)));
  const requested=Math.min(MFPHYS_EVENT_MAX,raw);
  if(raw>requested) mfpAudit.groupClamps++;
  let n=requested>0?Math.max(1,Math.round(requested*Math.max(0.45,ps))):0;
  n=Math.min(n,room);
  if(n<=0) return 0;
  if(n>mfpAudit.maxGroup) mfpAudit.maxGroup=n;
  const sp=o.speed!==undefined?o.speed:(24+size*0.9);
  const up=o.up!==undefined?o.up:(70+size*1.5);
  const r=o.r!==undefined?o.r:150, g=o.g!==undefined?o.g:142, b=o.b!==undefined?o.b:126;
  let aim=0,aimed=false;
  if(o.direction&&o.direction.length>=2){
    const dl=Math.hypot(o.direction[0],o.direction[1]);
    if(dl>.0001){aim=Math.atan2(o.direction[1]/dl,o.direction[0]/dl);aimed=true;}
  }
  const spread=o.spread!==undefined?Math.max(.05,o.spread):.62;
  let made=0;
  for(let k=0;k<n;k++){
    const a=aimed?aim+(mfPhysRand()*2-1)*spread:mfPhysRand()*Math.PI*2;
    const v=sp*(0.72+mfPhysRand()*0.62);
    /* Each body is an unmistakable shard: one long axis and two unequal thin
       axes. The former independent 0.7-1.6 multipliers frequently converged
       on a cube and the 4.2% scale floor vanished at the tactical camera. */
    const s=Math.max(.82,size*(.050+mfPhysRand()*.040));
    const longAxis=(mfPhysRand()*3)|0,long=1.9+mfPhysRand()*.9;
    const thinA=.52+mfPhysRand()*.32,thinB=.38+mfPhysRand()*.28;
    const hx=s*(longAxis===0?long:longAxis===1?thinA:thinB);
    const hy=s*(longAxis===1?long:longAxis===2?thinA:thinB);
    const hz=s*(longAxis===2?long:longAxis===0?thinA:thinB);
    const launchR=o.launchRadius!==undefined?Math.max(0,o.launchRadius):size*.12;
    const id=mfPhysSpawn(x+Math.cos(a)*launchR,y+Math.sin(a)*launchR,z+mfPhysRand()*size*.28,{
      hx:hx,hy:hy,hz:hz,
      vx:Math.cos(a)*v, vy:Math.sin(a)*v, vz:up*(0.5+mfPhysRand()*0.8),
      r:r,g:g,b:b, ttl:o.ttl||(11+mfPhysRand()*7),
      restitution:0.24, friction:0.66,
      chunks:o.chunks!==undefined?o.chunks:2,trail:!!o.trail
    });
    if(id>=0) made++;
  }
  mfpAudit.rigidPieces+=made;
  return made;
}

/* ---------------------------------------------------------------------------
   PUBLIC: STRUCTURE COLLAPSE.
   The current wreck path scales one uniform mesh to 22-38% for fourteen
   seconds (src/ui/render3d.js:1351). This breaks the same footprint into real
   1-3 large slabs that fall, hit the ground, tip over the debris already on it and come
   to rest at whatever angle they land at. Pieces are biased OUTWARD and
   DOWNWARD from the structure's own volume, so the pile grows from the
   footprint instead of erupting from a point.
   --------------------------------------------------------------------------- */
function mfPhysCollapse(x,y,size,o){
  if(!mfpEnabled) return 0;
  o=o||{};
  mfpAudit.collapseEvents++;
  const ps=(typeof perfScale==='number'&&perfScale>0)?perfScale:1;
  const room=Math.max(0,mfPhysBudget()-mfpLive);
  const sz=Math.max(8,Math.min(size||24,72));
  const raw=Math.max(0,Math.round(o.count!==undefined?o.count:3));
  const requested=Math.min(MFPHYS_EVENT_MAX,raw);
  if(raw>requested) mfpAudit.groupClamps++;
  let n=requested>0?Math.max(1,Math.round(requested*Math.max(0.45,ps))):0;
  n=Math.min(room,n);
  if(n<=0) return 0;
  if(n>mfpAudit.maxGroup) mfpAudit.maxGroup=n;
  const g=mfPhysGround(x,y);
  const civic=!!o.civic;
  const r=o.r!==undefined?o.r:(civic?146:132), gg=o.g!==undefined?o.g:(civic?140:128), b=o.b!==undefined?o.b:(civic?128:118);
  let made=0;
  for(let k=0;k<n;k++){
    const a=mfPhysRand()*Math.PI*2;
    const rad=sz*0.14+mfPhysRand()*sz*0.34;
    /* Slabs, not cubes: one axis two to four times the others. A slab is what
       makes end-over-end rotation legible at RTS camera distance. */
    /* BT sizes are diameters (fac is size:48, r:24). Pieces sit between a
       sixth and a third of the footprint — big enough to read as masonry,
       small enough that a dozen of them look like a collapse. */
    const base=sz*(0.036+mfPhysRand()*0.042);
    const longAxis=(mfPhysRand()*3)|0;
    const hx=base*(longAxis===0?2.0+mfPhysRand()*1.0:0.72+mfPhysRand()*0.46);
    const hy=base*(longAxis===1?2.0+mfPhysRand()*1.0:0.72+mfPhysRand()*0.46);
    const hz=base*(longAxis===2?2.15+mfPhysRand()*0.85:0.44+mfPhysRand()*0.38);
    /* Launch from the structure's own height band, thrown outward, with a
       modest lift — masonry falls, it does not fountain. */
    const zStart=g+sz*(0.18+mfPhysRand()*0.75);
    const out=14+mfPhysRand()*sz*0.55;
    const id=mfPhysSpawn(x+Math.cos(a)*rad,y+Math.sin(a)*rad,zStart,{
      hx:hx, hy:hy, hz:hz,
      vx:Math.cos(a)*out, vy:Math.sin(a)*out, vz:18+mfPhysRand()*sz*1.05,
      r:r,g:gg,b:b,
      ttl:o.ttl||(24+mfPhysRand()*10),
      restitution:0.15, friction:0.78,
      chunks:Math.max(3,Math.min(MFPHYS_CHUNKS,3+((sz/22)|0)))
    });
    if(id>=0) made++;
  }
  mfpAudit.rigidPieces+=made;
  return made;
}

/* ---------------------------------------------------------------------------
   PUBLIC: one call for an explosion — shove what is already there, then throw
   new fragments. This is what sim.js's spawnExplosion hooks.
   --------------------------------------------------------------------------- */
function mfPhysBlast(x,y,size,o){
  if(!mfpEnabled) return 0;
  o=o||{};
  mfpAudit.blastEvents++;
  const g=mfPhysGround(x,y);
  const sz=Math.max(3,size||8);
  mfPhysImpulse(x,y,g+sz*0.30,sz*2.6,sz*0.36);
  /* Only hull-scale detonations mint bodies. Every rifle hit calling
     mfPhysBurst would evict a collapsing factory's rubble within a second —
     the budget is small on purpose and structure collapse has first claim. */
  if(sz<12&&!(o.count>0)) return 0;
  return mfPhysBurst(x,y,g+sz*0.25,sz,
    Object.assign({count:Math.min(3,2+Math.round(sz*0.10))},o));
}

/* ---------------------------------------------------------------------------
   RENDER EMIT.
   Runs once per FRAME. Pushes chunk instances into an existing lit instanced
   stream, which is flushed later in the same frame by render3d.js. Because
   the cluster's chunk positions come through the body's full rotation matrix,
   three-axis tumble is visible with a yaw-only instance stream.
   --------------------------------------------------------------------------- */
/* {mesh, halfW, cy}: halfW is the model's own half-width in model units and
   cy the height of its centre above its anchor, both from
   src/engine/models-world-data.js. The models are BASE-anchored, so without cy
   every chunk floats half its own height. */
let mfpDraw=null;
function mfPhysDrawStream(){
  if(typeof FX==='undefined'||!FX) return null;
  if(mfpDraw&&mfpDraw.mesh) return mfpDraw;
  /* Rigid debris is fractured material, not a miniature wreck token. The
     wreck mesh has rectangular panels and a pale cap, so clustered bodies
     read as tiny cubes around the blast. mdlShard is a closed asymmetric
     extrusion; multiple overlapping instances form a jagged slab while the
     solver still owns the body's full 3-axis tumble and terrain contact. */
  if(FX.shard)      mfpDraw={mesh:FX.shard, halfW:0.62, cy:0.0};
  else if(FX.wreck) mfpDraw={mesh:FX.wreck, halfW:8.15, cy:4.0};
  else if(FX.rock)  mfpDraw={mesh:FX.rock,  halfW:10.0, cy:3.6};
  else if(FX.crate) mfpDraw={mesh:FX.crate, halfW:10.8, cy:10.0};
  else return null;
  return mfpDraw;
}
function mfPhysEmit(){
  mfpFrame++;
  mfpAudit.emitCalls++;
  /* Pausing freezes mfPhysStep, not presentation. Instanced streams are
     flushed every render, so the same frozen bodies must be re-submitted or
     every shard disappears the instant a capture/pause overlay opens. */
  if(!mfpEnabled||mfpLive<=0){ mfpChunksDrawn=0; return 0; }
  const D=mfPhysDrawStream();
  if(!D||!D.mesh||typeof D.mesh.add!=='function'){ mfpChunksDrawn=0; return 0; }
  const M=D.mesh;
  const t0=performance.now();
  /* Cull to the camera. camBounds() is the same rectangle the weather and
     scenery loops use, so debris obeys the same visibility rule they do. */
  let bx0=-Infinity,by0=-Infinity,bx1=Infinity,by1=Infinity;
  if(typeof camBounds==='function'){
    try{ const B=camBounds(); if(B){ bx0=B.x0-60; by0=B.y0-60; bx1=B.x1+60; by1=B.y1+60; } }catch(err){}
  }
  let drawn=0;
  for(let i=0;i<MFPHYS_MAX;i++){
    if(mfpState[i]===0) continue;
    const x=mfpX[i], y=mfpY[i];
    if(x<bx0||x>bx1||y<by0||y>by1) continue;
    /* Destruction is not intelligence. Enemy rubble can be spawned by combat
       outside allied vision, so the renderer must obey the same disclosure
       gate as every other battlefield effect. */
    if(typeof fogPointVisible==='function'&&!fogPointVisible(x,y)) continue;
    /* Fade out over the last second rather than blinking off. */
    const a=mfpLife[i]<1?Math.max(0,mfpLife[i])*255:255;
    if(a<=4) continue;
    /* One short velocity-aligned streak belongs to this rigid body. It is
       queued straight into the render stream and creates no particle/entity,
       so three bodies remain one bounded debris layer and paused renders
       cannot grow a pool. Only the fast, early ballistic phase receives it. */
    const age=1-mfpLife[i]/Math.max(.001,mfpTTL[i]);
    const flightAge=Math.max(0,mfpTTL[i]-mfpLife[i]);
    const speed=Math.hypot(mfpVX[i],mfpVY[i],mfpVZ[i]);
    if(mfpTrail[i]&&mfpState[i]===1&&flightAge<.72&&speed>18&&
       typeof FX!=='undefined'&&FX.beam){
      const lag=Math.min(.13,.050+flightAge*.11),tx=x-mfpVX[i]*lag,ty=y-mfpVY[i]*lag;
      const floor=mfPhysPlaneAt(i,tx,ty)+.35,tz=Math.max(floor,mfpZ[i]-mfpVZ[i]*lag);
      const fade=Math.max(0,1-flightAge/.72);
      const w=Math.max(.46,Math.min(1.40,Math.max(mfpHX[i],mfpHY[i],mfpHZ[i])*.16));
      const tr=Math.max(146,mfpR[i]),tg=Math.max(104,mfpG[i]),tb=Math.max(68,mfpB[i]);
      /* Soft heated wake plus a narrow leading velocity line. Both are
         render-only stamps on this one body—no pool growth and no extra
         logical layer. The paired widths remain readable against fire and
         disappear before the first bounce. */
      if(typeof addBeamRibbon==='function'&&typeof sprites!=='undefined'&&sprites.glow){
        addBeamRibbon(sprites.glow,tx,tz,ty,x,mfpZ[i],y,w*1.55,tr,tg,tb,26+44*fade,150);
        addBeamRibbon(sprites.glow,tx,tz,ty,x,mfpZ[i],y,w*.48,255,218,164,54+72*fade,150);
      }else if(typeof addBeam3D==='function'){
        addBeam3D(FX.beam,tx,tz,ty,x,mfpZ[i],y,w,tr,tg,tb,72+98*fade,
          {projectile:1,noMuzzle:true});
      }
      mfpAudit.velocityTrails++;
    }
    /* Yaw for the instance stream: the heading of the body's own +X axis
       projected onto the ground plane. Positions carry pitch and roll. */
    mfPhysRot(i,1,0,0,_mfpA);
    const yaw=Math.atan2(_mfpA[1],_mfpA[0]);
    const nch=mfpNCh[i], base=i*MFPHYS_CHUNKS*4;
    const r=mfpR[i], g=mfpG[i], b=mfpB[i];
    for(let k=0;k<nch;k++){
      const ox=mfpCh[base+k*4], oy=mfpCh[base+k*4+1], oz=mfpCh[base+k*4+2], cr=mfpCh[base+k*4+3];
      mfPhysRot(i,ox,oy,oz,_mfpA);
      const s=Math.max(0.035,cr/D.halfW);
      M.add(x+_mfpA[0], y+_mfpA[1], mfpZ[i]+_mfpA[2]-D.cy*s, s, yaw+k*0.9, r,g,b, a);
      drawn++;
    }
  }
  mfpChunksDrawn=drawn;
  mfpAudit.emittedChunks+=drawn;
  mfpEmitMs=mfpEmitMs*0.86+(performance.now()-t0)*0.14;
  return drawn;
}

/* ---------------------------------------------------------------------------
   FRAME HOOK.
   render() is a global function declaration in src/ui/render3d.js, so it is a
   property of the global object and can be wrapped from here. That keeps the
   whole integration inside this one file: no other system's source is touched.
   The equivalent explicit hook, if the renderer ever wants to own it, is one
   line at the top of render():   if(typeof mfPhysEmit==='function') mfPhysEmit();
   (delete mfPhysHook and this wrapper at the same time).
   --------------------------------------------------------------------------- */
function mfPhysHook(){
  if(mfpHooked) return true;
  if(typeof window==='undefined'||typeof window.render!=='function') return false;
  const inner=window.render;
  if(inner.__mfPhys) { mfpHooked=true; return true; }
  const wrapped=function(){
    try{ mfPhysEmit(); }catch(err){ /* never let debris take the frame down */ }
    return inner.apply(this,arguments);
  };
  wrapped.__mfPhys=true;
  window.render=wrapped;
  mfpHooked=true;
  return true;
}

function mfPhysClear(){
  for(let i=0;i<MFPHYS_MAX;i++) mfpState[i]=0;
  mfpLive=0; mfpAwake=0; mfpChunksDrawn=0; mfpSeqNext=1;
  mfPhysResetAudit();
  mfPhysSeed();
}
function mfPhysEnable(on){ mfpEnabled=!!on; if(!mfpEnabled) mfPhysClear(); }

function mfPhysStats(){
  let live=0, awake=0;
  for(let i=0;i<MFPHYS_MAX;i++){ if(mfpState[i]===0) continue; live++; if(mfpState[i]===1) awake++; }
  return {bodies:live, awake:awake, asleep:live-awake,
          chunks:mfpChunksDrawn, budget:mfPhysBudget(),
          eventMax:MFPHYS_EVENT_MAX, stepMs:mfpStepMs, emitMs:mfpEmitMs,
          velocityTrails:mfpAudit.velocityTrails,
          pausedEmitSkips:mfpAudit.pausedEmitSkips, budgetTrims:mfpAudit.budgetTrims,
          attractEvents:mfpAudit.attractEvents, attractHits:mfpAudit.attractHits,
          attractConsumed:mfpAudit.attractConsumed, attractClamps:mfpAudit.attractClamps,
          attractWakeups:mfpAudit.attractWakeups, attractPeakAccel:mfpAudit.attractPeakAccel,
          offscreenRetires:mfpAudit.offscreenRetires,subpixelRetires:mfpAudit.subpixelRetires,
          hooked:mfpHooked, enabled:mfpEnabled};
}

/* Exact float32 state hash for replay/device probes. It intentionally omits
   timing telemetry and render counters; equal seeds + event/step sequences
   should yield the same hash even when frames are rendered at different rates. */
const _mfpHashBuf=new ArrayBuffer(4), _mfpHashView=new DataView(_mfpHashBuf);
function mfPhysHashFloat(h,v){
  _mfpHashView.setFloat32(0,v,true);
  return mfPhysHashWord(h,_mfpHashView.getUint32(0,true));
}
function mfPhysStateHash(){
  let h=2166136261>>>0;
  for(let i=0;i<MFPHYS_MAX;i++){
    if(mfpState[i]===0) continue;
    h=mfPhysHashWord(h,i); h=mfPhysHashWord(h,mfpState[i]);
    h=mfPhysHashFloat(h,mfpX[i]); h=mfPhysHashFloat(h,mfpY[i]); h=mfPhysHashFloat(h,mfpZ[i]);
    h=mfPhysHashFloat(h,mfpVX[i]); h=mfPhysHashFloat(h,mfpVY[i]); h=mfPhysHashFloat(h,mfpVZ[i]);
    h=mfPhysHashFloat(h,mfpQX[i]); h=mfPhysHashFloat(h,mfpQY[i]);
    h=mfPhysHashFloat(h,mfpQZ[i]); h=mfPhysHashFloat(h,mfpQW[i]);
    h=mfPhysHashFloat(h,mfpWX[i]); h=mfPhysHashFloat(h,mfpWY[i]); h=mfPhysHashFloat(h,mfpWZ[i]);
    h=mfPhysHashFloat(h,mfpLife[i]);
  }
  return ('00000000'+(h>>>0).toString(16)).slice(-8);
}
function mfPhysProbe(reset){
  let live=0, finite=true;
  for(let i=0;i<MFPHYS_MAX;i++){
    if(mfpState[i]===0) continue;
    live++;
    if(!Number.isFinite(mfpX[i])||!Number.isFinite(mfpY[i])||!Number.isFinite(mfpZ[i])||
       !Number.isFinite(mfpVX[i])||!Number.isFinite(mfpVY[i])||!Number.isFinite(mfpVZ[i])) finite=false;
  }
  const out={
    bodies:live, budget:mfPhysBudget(), withinBudget:live<=mfPhysBudget(), finite:finite,
    eventMax:MFPHYS_EVENT_MAX, maxGroup:mfpAudit.maxGroup,
    layerBounded:mfpAudit.maxGroup<=MFPHYS_EVENT_MAX,
    stateHash:mfPhysStateHash(), seed:mfpSeedBase>>>0, rngState:mfpRandState>>>0,
    steps:mfpAudit.steps, spawns:mfpAudit.spawns, retired:mfpAudit.retired,
    invalidRetires:mfpAudit.invalidRetires, evictions:mfpAudit.evictions,
    budgetTrims:mfpAudit.budgetTrims, motionClamps:mfpAudit.motionClamps,
    groundQueries:mfpAudit.groundQueries, burstEvents:mfpAudit.burstEvents,
    collapseEvents:mfpAudit.collapseEvents, blastEvents:mfpAudit.blastEvents,
    impulseEvents:mfpAudit.impulseEvents, impulseHits:mfpAudit.impulseHits,
    attractEvents:mfpAudit.attractEvents, attractHits:mfpAudit.attractHits,
    attractConsumed:mfpAudit.attractConsumed, attractClamps:mfpAudit.attractClamps,
    attractWakeups:mfpAudit.attractWakeups, attractPeakAccel:mfpAudit.attractPeakAccel,
    rigidPieces:mfpAudit.rigidPieces, groupClamps:mfpAudit.groupClamps,
    rngDraws:mfpAudit.rngDraws, emitCalls:mfpAudit.emitCalls,
    emittedChunks:mfpAudit.emittedChunks, velocityTrails:mfpAudit.velocityTrails,
    pausedEmitSkips:mfpAudit.pausedEmitSkips,
    offscreenRetires:mfpAudit.offscreenRetires,subpixelRetires:mfpAudit.subpixelRetires,
    acceleratedLife:mfpAudit.acceleratedLife
  };
  if(reset) mfPhysResetAudit();
  return out;
}

/* Read-only view for any system that wants to draw or query bodies itself —
   a renderer with a real orientation attribute, an audio impact layer, or a
   test harness. cb(handle, view) with view reused between calls. */
const _mfpView={i:0,x:0,y:0,z:0,vx:0,vy:0,vz:0,wx:0,wy:0,wz:0,
                qx:0,qy:0,qz:0,qw:1,hx:0,hy:0,hz:0,life:0,ttl:0,trail:false,asleep:false};
function mfPhysForEach(cb){
  let n=0;
  for(let i=0;i<MFPHYS_MAX;i++){
    if(mfpState[i]===0) continue;
    _mfpView.i=i;
    _mfpView.x=mfpX[i]; _mfpView.y=mfpY[i]; _mfpView.z=mfpZ[i];
    _mfpView.vx=mfpVX[i]; _mfpView.vy=mfpVY[i]; _mfpView.vz=mfpVZ[i];
    _mfpView.wx=mfpWX[i]; _mfpView.wy=mfpWY[i]; _mfpView.wz=mfpWZ[i];
    _mfpView.qx=mfpQX[i]; _mfpView.qy=mfpQY[i]; _mfpView.qz=mfpQZ[i]; _mfpView.qw=mfpQW[i];
    _mfpView.hx=mfpHX[i]; _mfpView.hy=mfpHY[i]; _mfpView.hz=mfpHZ[i];
    _mfpView.life=mfpLife[i]; _mfpView.ttl=mfpTTL[i]; _mfpView.trail=!!mfpTrail[i];
    _mfpView.asleep=mfpState[i]===2;
    cb(i,_mfpView); n++;
  }
  return n;
}

/* ---------------------------------------------------------------------------
   SELF-INITIALISE. This file loads before src/ui/render3d.js, so the render
   wrapper cannot be installed here; mfPhysHook() is idempotent and is retried
   on the first spawn. Everything else is arrays, already allocated above.
   The namespace is a convenience for tooling — the callable API is the global
   function declarations, exactly like every other system in this build.
   --------------------------------------------------------------------------- */
(function mfPhysInit(){
  mfPhysSeed();
  if(typeof window==='undefined') return;
  window.MFPhys={
    spawn:mfPhysSpawn, burst:mfPhysBurst, collapse:mfPhysCollapse,
    blast:mfPhysBlast, impulse:mfPhysImpulse, attract:mfPhysAttract, step:mfPhysStep,
    emit:mfPhysEmit, stats:mfPhysStats, probe:mfPhysProbe, stateHash:mfPhysStateHash,
    seed:mfPhysSeed, clear:mfPhysClear, enable:mfPhysEnable,
    forEach:mfPhysForEach, budget:mfPhysBudget
  };
  /* Try once now in case the load order ever changes; harmless if render() is
     not there yet, because mfPhysSpawn retries. */
  mfPhysHook();
})();
