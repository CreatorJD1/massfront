/* ============================================================================
   SHOCKWAVE + FORCEFIELD SYSTEM
   ----------------------------------------------------------------------------
   Real mesh-based shockwaves for impacts and forcefields, not camera-facing
   quads. Each event spawns an expanding ring on the ground plane; forcefields
   are domes with faction-tinted energy. The shader samples procedural 4K noise
   so the ring never pixelates at cinematic zoom.

   INTEGRATION CONTRACT
     mfShockwaveBoot()                    after initGL3D()
     mfShockwaveHit(x,y,radius,energy,faction, opts)
     mfShockwaveForcefield(x,y,radius,faction, opts)
     mfShockwaveDraw(S_nA, culler)        once per frame after opaque, before bloom
     mfShockwaveTick(dt)
     mfShockwaveGLReset()                 on GL context rebuild
     mfShockwaveReset()                   on resetWorld()

   Globals: uses window.gl, window.mkProg, window.matVP, window.cam, etc.
   ============================================================================ */
(function(){
'use strict';

const MF_SW_CAP=64;
const MF_SW_FLOATS=12;
const MF_SW_RING_INST=new Float32Array(MF_SW_CAP*MF_SW_FLOATS);
const MF_SW_DOME_INST=new Float32Array(MF_SW_CAP*MF_SW_FLOATS);
const MF_SW_RING_MAP=new Int16Array(MF_SW_CAP);
const mfSwPresented=new Uint8Array(MF_SW_CAP);

/* Ring instance data: x,y,z, radius, age01, opacity, r,g,b, speed, kind, seed */
const mfSwX=new Float32Array(MF_SW_CAP);
const mfSwY=new Float32Array(MF_SW_CAP);
const mfSwR=new Float32Array(MF_SW_CAP);
const mfSwAge=new Float32Array(MF_SW_CAP);
const mfSwLife=new Float32Array(MF_SW_CAP);
const mfSwOp=new Float32Array(MF_SW_CAP);
const mfSwR0=new Float32Array(MF_SW_CAP);
const mfSwR1=new Float32Array(MF_SW_CAP);
const mfSwColR=new Uint8Array(MF_SW_CAP);
const mfSwColG=new Uint8Array(MF_SW_CAP);
const mfSwColB=new Uint8Array(MF_SW_CAP);
const mfSwSpeed=new Float32Array(MF_SW_CAP);
const mfSwKind=new Uint8Array(MF_SW_CAP); // 0=impact ring, 1=forcefield dome
const mfSwSeed=new Float32Array(MF_SW_CAP);
let mfSwN=0;

const MF_SW_TELEM={ready:false, rings:0, domes:0, dropped:0, lastError:''};

let mfSwProg=null, mfSwVAO=null, mfSwMeshVBO=null, mfSwInstVBO=null;
let mfSwU={};
let mfSwTex=null, mfSwEpoch=-1, mfSwInitFailed=false;
let mfSwRingVerts=0, mfSwDomeFirst=0, mfSwDomeVerts=0;

const MF_SW_VS=`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aI0; // x,y,z,radius
layout(location=3) in vec4 aI1; // age, opacity, speed, seed
layout(location=4) in vec4 aI2; // r,g,b, kind
uniform mat4 uVP;
uniform float uTime;
out vec3 vWorld;
out vec3 vLocal;
out vec3 vNrm;
flat out vec4 vTint;
flat out vec4 vParam;
void main(){
  float kind=aI2.w;
  vec3 p=aPos;
  vec3 n=aNrm;
  float age=clamp(aI1.x,0.0,1.0);
  float rad=aI0.w;
  if(kind<0.5){
    /* Ground ring: scale on XZ, keep Y at ground. */
    p=vec3(p.x*rad, p.y*0.12, p.z*rad);
  }else{
    /* Forcefield dome. */
    p=vec3(p.x*rad, p.y*rad*0.65, p.z*rad);
    n=aNrm;
  }
  vWorld=aI0.xyz+p;
  /* Normalized mesh coordinates stay independent of world radius. The old
     radius-scaled value made every ring test outside its shader's 0..1 band. */
  vLocal=aPos;
  vNrm=n;
  vTint=vec4(aI2.rgb/255.0, aI1.y);
  vParam=vec4(age, aI1.z, aI1.w, kind);
  gl_Position=uVP*vec4(vWorld,1.0);
}`;

const MF_SW_FS=`#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vLocal;
in vec3 vNrm;
flat in vec4 vTint;
flat in vec4 vParam;
uniform vec3 uEye;
uniform float uTime;
uniform sampler2D uNoise;
uniform float uHex;
out vec4 o;

float hexEdge(vec2 p){
  const vec2 hs=vec2(1.0,1.7320508);
  vec2 h=hs*0.5;
  vec2 a=mod(p,hs)-h;
  vec2 b=mod(p-h,hs)-h;
  vec2 g=dot(a,a)<dot(b,b)?a:b;
  float d=0.5-max(abs(g.x)*0.8660254+abs(g.y)*0.5,abs(g.y));
  float w=max(fwidth(d)*1.35,0.012);
  return 1.0-smoothstep(0.0,w,d);
}

void main(){
  float age=vParam.x, speed=vParam.y, seed=vParam.z, kind=vParam.w;
  vec3 col=vTint.rgb;
  float alpha=0.0;
  if(kind<0.5){
    /* ONE readable soft annulus with a bright LEADING edge.
       u runs 0 at the inner rim to 1 at the outer rim, so the front of the
       wave is the incandescent part and everything behind it falls off into
       the burn. That asymmetry is what makes it read as a travelling shock
       front rather than a drawn circle, and there is exactly one of it. */
    float d=length(vLocal.xz);
    float u=clamp((d-0.72)/0.44,0.0,1.0);
    float ang=atan(vLocal.z,vLocal.x)*0.15915494+0.5;
    float turbulence=texture(uNoise,vec2(ang*2.0+seed,age*.18+seed*.071)).a;
    float body=smoothstep(0.0,0.42,u)*(1.0-smoothstep(0.62,1.0,u));
    float lead=exp(-pow((u-0.80)/0.115,2.0));
    float rough=0.72+0.28*turbulence;
    float fade=(1.0-age)*(1.0-age*0.55);
    alpha=(body*0.42+lead*0.95)*rough*fade*vTint.a;
    vec3 hot=mix(col,vec3(1.0),0.72);
    col=mix(col*0.85,hot,clamp(lead*1.15,0.0,1.0));
  }else{
    /* Forcefield dome. */
    vec3 V=normalize(uEye-vWorld);
    float rim=pow(1.0-clamp(abs(dot(normalize(vNrm),V)),0.0,1.0),2.6);
    float foot=1.0-smoothstep(0.012,0.115,vLocal.y);
    float cell=hexEdge((vLocal.xz+vec2(vLocal.y*0.17,-vLocal.y*0.11))*mix(6.0,14.0,uHex));
    float energyPulse=sin(vLocal.y*14.0-uTime*4.2+vWorld.x*0.05+vWorld.z*0.04)*0.5+0.5;
    float hexGlow=cell*(0.08+0.24*energyPulse);
    float breathe=0.94+0.06*sin(uTime*2.5+vWorld.x*0.02+vWorld.z*0.015);
    /* Faction-coloured rim, white core, hex lattice */
    vec3 rimCol=mix(col,vec3(0.88,0.96,1.0),rim*0.55+hexGlow*uHex*0.28);
    alpha=(rim*0.38+foot*0.18+uHex*(0.022+hexGlow))*vTint.a*breathe;
    col=mix(rimCol,vec3(1.0),rim*rim*0.4+foot*0.3);
  }
  if(alpha<0.004) discard;
  o=vec4(col,alpha);
}`;

function mfSwNow(){ return (typeof performance!=='undefined'&&performance.now?performance.now()*0.001:Date.now()*0.001); }

function mfSwMesh(){
  const out=[];
  const put=(p,n)=>out.push(p[0],p[1],p[2],n[0],n[1],n[2]);
  /* Ring: a FLAT annulus on the XZ plane, normal up.
     This was a torus tube, and a tube is why impacts showed nested rings: its
     surface crosses the shader's |d-1| band TWICE — once over the top of the
     tube and once underneath it — and with additive blending and depth writes
     off, both crossings composite, so one shock front drew as two concentric
     bright circles. One annulus is one front. It is also a quarter of the
     triangles (96*2 vs 64*8*2). */
  const seg=96, R_IN=0.72, R_OUT=1.16, NUP=[0,1,0];
  for(let i=0;i<seg;i++){
    const t0=i/seg*Math.PI*2, t1=(i+1)/seg*Math.PI*2;
    const c0=Math.cos(t0), s0=Math.sin(t0), c1=Math.cos(t1), s1=Math.sin(t1);
    const A=[c0*R_IN,0,s0*R_IN],  B=[c0*R_OUT,0,s0*R_OUT];
    const C=[c1*R_IN,0,s1*R_IN],  D=[c1*R_OUT,0,s1*R_OUT];
    put(A,NUP); put(B,NUP); put(D,NUP);
    put(A,NUP); put(D,NUP); put(C,NUP);
  }
  mfSwRingVerts=out.length/6;
  mfSwDomeFirst=out.length/6;
  /* Dome: hemisphere. */
  const lat=8, lng=20;
  for(let iy=0;iy<lat;iy++){
    const a0=iy/lat*Math.PI*0.5, a1=(iy+1)/lat*Math.PI*0.5;
    const r0=Math.cos(a0), r1=Math.cos(a1), h0=Math.sin(a0), h1=Math.sin(a1);
    for(let ix=0;ix<lng;ix++){
      const t0=ix/lng*Math.PI*2, t1=(ix+1)/lng*Math.PI*2;
      const P00=[r0*Math.cos(t0),h0,r0*Math.sin(t0)];
      const P01=[r1*Math.cos(t0),h1,r1*Math.sin(t0)];
      const P11=[r1*Math.cos(t1),h1,r1*Math.sin(t1)];
      const P10=[r0*Math.cos(t1),h0,r0*Math.sin(t1)];
      put(P00,P00); put(P01,P01); put(P11,P11);
      put(P00,P00); put(P11,P11); put(P10,P10);
    }
  }
  mfSwDomeVerts=out.length/6-mfSwDomeFirst;
  return new Float32Array(out);
}

function mfShockwaveBoot(){
  if(mfSwInitFailed) return false;
  if(typeof gl==='undefined'||!gl||typeof mkProg!=='function'){
    MF_SW_TELEM.lastError='GL or mkProg unavailable'; return false;
  }
  if(mfSwProg&&mfSwVAO&&mfSwInstVBO) return true;
  const wasVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  const wasArr=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  try{
    mfSwProg=mkProg(MF_SW_VS,MF_SW_FS,'shockwave');
    /* mkProg() defers link validation (mesh.js) — ask explicitly. */
    if(!mfProgOk(mfSwProg)) throw new Error('shockwave shader did not link');
    mfSwU.uVP=gl.getUniformLocation(mfSwProg,'uVP');
    mfSwU.uEye=gl.getUniformLocation(mfSwProg,'uEye');
    mfSwU.uTime=gl.getUniformLocation(mfSwProg,'uTime');
    mfSwU.uNoise=gl.getUniformLocation(mfSwProg,'uNoise');
    mfSwU.uHex=gl.getUniformLocation(mfSwProg,'uHex');

    mfSwMeshVBO=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,mfSwMeshVBO);
    gl.bufferData(gl.ARRAY_BUFFER,mfSwMesh(),gl.STATIC_DRAW);

    mfSwInstVBO=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,mfSwInstVBO);
    gl.bufferData(gl.ARRAY_BUFFER,MF_SW_CAP*MF_SW_FLOATS*4,gl.DYNAMIC_DRAW);

    mfSwVAO=gl.createVertexArray();
    gl.bindVertexArray(mfSwVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER,mfSwMeshVBO);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
    gl.bindBuffer(gl.ARRAY_BUFFER,mfSwInstVBO);
    const st=MF_SW_FLOATS*4;
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,4,gl.FLOAT,false,st,0); gl.vertexAttribDivisor(2,1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,4,gl.FLOAT,false,st,16); gl.vertexAttribDivisor(3,1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4,4,gl.FLOAT,false,st,32); gl.vertexAttribDivisor(4,1);
    gl.bindVertexArray(null);

    /* The annulus samples a narrow 1D-looking band on a mesh; 512 seamless
       noise texels exceed its projected detail while avoiding a first-impact
       2K CPU generation hitch on High/Cinematic. */
    mfSwTex=mfNoiseUpload('shockwave',{size:512,seed:42,hot:[255,230,180]});
    MF_SW_TELEM.ready=true;
    return true;
  }catch(e){
    MF_SW_TELEM.ready=false;
    MF_SW_TELEM.lastError=String(e&&e.message||e).slice(0,180);
    console.warn('shockwave boot failed',e);
    mfSwProg=null; mfSwVAO=null; mfSwMeshVBO=null; mfSwInstVBO=null; mfSwTex=null;
    mfSwInitFailed=true;
    return false;
  }finally{
    gl.bindVertexArray(wasVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER,wasArr);
  }
}

function mfShockwaveGLReset(){
  mfSwProg=null; mfSwVAO=null; mfSwMeshVBO=null; mfSwInstVBO=null; mfSwTex=null;
  mfSwInitFailed=false; MF_SW_TELEM.ready=false;
}

function mfShockwaveReset(){ mfSwN=0;mfSwPresented.fill(0); }

function mfShockwavePresentedAt(x,y,targetRadius){
  x=Number(x);y=Number(y);targetRadius=Math.max(1,Number(targetRadius)||1);
  for(let i=0;i<mfSwN;i++){
    if(!mfSwPresented[i]||mfSwKind[i]!==0) continue;
    const dx=mfSwX[i]-x,dy=mfSwY[i]-y,reach=Math.max(3,targetRadius*.12);
    if(dx*dx+dy*dy>reach*reach) continue;
    const ratio=mfSwR1[i]/targetRadius;
    if(ratio>.68&&ratio<1.48) return true;
  }
  return false;
}

function mfShockwaveHit(x,y,radius,energy,faction,opts){
  const o=opts||{};
  if(mfSwN>=MF_SW_CAP){ MF_SW_TELEM.dropped++; return -1; }
  const q=typeof mfVfxQ==='function'?mfVfxQ():1;
  if(q<0.35) return -1;
  const prof=mfEnergyProfile(faction||'nova');
  const col=prof.impact.shockwaveColor;
  const i=mfSwN++;
  mfSwPresented[i]=0;          // a reused slot must not inherit a stale bit
  mfSwX[i]=x; mfSwY[i]=y;
  mfSwR0[i]=radius||18;
  mfSwR1[i]=o.maxRadius||Math.max(radius*3,60);
  mfSwR[i]=mfSwR0[i];
  mfSwAge[i]=0;
  /* ONE faction-speed division, not two. vfxRecipe already derives shockLife
     as 0.34/shockwaveSpeed and mfEmitMacroFx passes that through as `life`, so
     dividing again here squared the faction term: a fast profile
     (shockwaveSpeed ~1.6) got 0.34/1.6/1.6 = 0.13 s and the annulus was gone
     about three frames after the detonation it belongs to. An explicit caller
     life is now taken as the FINAL duration; only the default derives from the
     profile. speedMul shortens the ring, which is what "faster" means. */
  const baseLife=o.life>0?o.life:(0.7/Math.max(0.72,prof.impact.shockwaveSpeed));
  mfSwLife[i]=Math.max(0.05,baseLife/Math.max(0.35,o.speedMul||1.0));
  mfSwOp[i]=o.opacity||1.0;
  mfSwColR[i]=col[0]; mfSwColG[i]=col[1]; mfSwColB[i]=col[2];
  mfSwSpeed[i]=prof.impact.shockwaveSpeed*(o.speedMul||1.0);
  mfSwKind[i]=0;
  mfSwSeed[i]=Math.random()*64;
  return i;
}

function mfShockwaveForcefield(x,y,radius,faction,opts){
  const o=opts||{};
  if(mfSwN>=MF_SW_CAP){ MF_SW_TELEM.dropped++; return -1; }
  const prof=mfEnergyProfile(faction||'nova');
  const col=prof.forcefield.color;
  const i=mfSwN++;
  mfSwPresented[i]=0;
  mfSwX[i]=x; mfSwY[i]=y;
  mfSwR0[i]=radius||30;
  mfSwR1[i]=radius||30;
  mfSwR[i]=mfSwR0[i];
  mfSwAge[i]=0;
  mfSwLife[i]=o.life||999999; /* persistent until removed */
  mfSwOp[i]=(o.opacity!=null?o.opacity:prof.forcefield.opacity)*0.65;
  mfSwColR[i]=col[0]; mfSwColG[i]=col[1]; mfSwColB[i]=col[2];
  mfSwSpeed[i]=0;
  mfSwKind[i]=1;
  mfSwSeed[i]=Math.random()*64;
  return i;
}

function mfShockwaveRemove(id){
  if(id<0||id>=mfSwN) return false;
  /* Swap-last removal, keep prefix dense. */
  const j=mfSwN-1;
  if(id!==j){
    mfSwX[id]=mfSwX[j]; mfSwY[id]=mfSwY[j]; mfSwR[id]=mfSwR[j];
    mfSwAge[id]=mfSwAge[j]; mfSwLife[id]=mfSwLife[j]; mfSwOp[id]=mfSwOp[j];
    mfSwR0[id]=mfSwR0[j]; mfSwR1[id]=mfSwR1[j];
    mfSwColR[id]=mfSwColR[j]; mfSwColG[id]=mfSwColG[j]; mfSwColB[id]=mfSwColB[j];
    mfSwSpeed[id]=mfSwSpeed[j]; mfSwKind[id]=mfSwKind[j]; mfSwSeed[id]=mfSwSeed[j];
    mfSwPresented[id]=mfSwPresented[j];   // the bit belongs to the event, not the slot
  }
  mfSwPresented[j]=0;
  mfSwN--;
  return true;
}

function mfShockwaveUpdate(id, opts){
  if(id<0||id>=mfSwN) return false;
  const o=opts||{};
  if(o.x!=null) mfSwX[id]=o.x;
  if(o.y!=null) mfSwY[id]=o.y;
  if(o.radius!=null){ mfSwR0[id]=o.radius; mfSwR1[id]=o.radius; }
  if(o.opacity!=null) mfSwOp[id]=o.opacity;
  if(o.life!=null){ mfSwLife[id]=o.life; mfSwAge[id]=0; }
  return true;
}

function mfShockwaveTick(dt){
  if(!(dt>0)) return;
  let write=0;
  for(let i=0;i<mfSwN;i++){
    mfSwAge[i]+=dt/mfSwLife[i];
    if(mfSwAge[i]>=1.0) continue;
    /* Expand impact rings. */
    if(mfSwKind[i]===0){
      const t=mfSwAge[i];
      mfSwR[i]=mfSwR0[i]+(mfSwR1[i]-mfSwR0[i])*t;
    }else{
      mfSwR[i]=mfSwR0[i];
    }
    if(write!==i){
      mfSwX[write]=mfSwX[i]; mfSwY[write]=mfSwY[i]; mfSwR[write]=mfSwR[i];
      mfSwAge[write]=mfSwAge[i]; mfSwLife[write]=mfSwLife[i]; mfSwOp[write]=mfSwOp[i];
      mfSwR0[write]=mfSwR0[i]; mfSwR1[write]=mfSwR1[i];
      mfSwColR[write]=mfSwColR[i]; mfSwColG[write]=mfSwColG[i]; mfSwColB[write]=mfSwColB[i];
      mfSwSpeed[write]=mfSwSpeed[i]; mfSwKind[write]=mfSwKind[i]; mfSwSeed[write]=mfSwSeed[i];
      mfSwPresented[write]=mfSwPresented[i];
    }
    write++;
  }
  /* Compaction moved live events down; anything at or past the new end is a
     dead slot whose presentation bit would otherwise answer a later query. */
  for(let i=write;i<mfSwN;i++) mfSwPresented[i]=0;
  mfSwN=write;
  MF_SW_TELEM.rings=0; MF_SW_TELEM.domes=0;
  for(let i=0;i<mfSwN;i++) if(mfSwKind[i]===0) MF_SW_TELEM.rings++; else MF_SW_TELEM.domes++;
}

function mfShockwaveDraw(S_nA,culler){
  mfSwPresented.fill(0);
  if(mfSwN<=0) return;
  if(!mfShockwaveBoot()||!mfSwProg) return false;
  const wasProg=gl.getParameter(gl.CURRENT_PROGRAM);
  const wasVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  const wasArr=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  const wasActive=gl.getParameter(gl.ACTIVE_TEXTURE);
  const wasActiveTex=gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.activeTexture(gl.TEXTURE0);
  const wasTex0=gl.getParameter(gl.TEXTURE_BINDING_2D);
  const wasBlend=gl.isEnabled(gl.BLEND),wasCull=gl.isEnabled(gl.CULL_FACE),wasDepth=gl.isEnabled(gl.DEPTH_TEST);
  const wasMask=gl.getParameter(gl.DEPTH_WRITEMASK),wasDepthFunc=gl.getParameter(gl.DEPTH_FUNC),wasCullMode=gl.getParameter(gl.CULL_FACE_MODE);
  const srcRGB=gl.getParameter(gl.BLEND_SRC_RGB),dstRGB=gl.getParameter(gl.BLEND_DST_RGB);
  const srcA=gl.getParameter(gl.BLEND_SRC_ALPHA),dstA=gl.getParameter(gl.BLEND_DST_ALPHA);
  const eqRGB=gl.getParameter(gl.BLEND_EQUATION_RGB),eqA=gl.getParameter(gl.BLEND_EQUATION_ALPHA);
  try{
    let n=0,nd=0;
    for(let i=0;i<mfSwN;i++){
      const r=Math.max(2,mfSwR[i]);
      if(typeof fogFxFootprintVisible==='function'&&!fogFxFootprintVisible(mfSwX[i],mfSwY[i],r)) continue;
      /* `vis` is a render-local closure. Looking it up from this classic
         script always failed, so off-camera annuli were uploaded and shaded
         until expiry. The renderer now passes that exact culler; the bounds
         fallback keeps boot probes and direct diagnostic calls safe. */
      if(typeof culler==='function'){
        if(!culler(mfSwX[i],mfSwY[i],r*1.2)) continue;
      }else if(typeof camBounds==='function'){
        const B=camBounds(),pad=r*1.2;
        if(B&&(mfSwX[i]<B.x0-pad||mfSwX[i]>B.x1+pad||mfSwY[i]<B.y0-pad||mfSwY[i]>B.y1+pad)) continue;
      }
      const dst=mfSwKind[i]===1?MF_SW_DOME_INST:MF_SW_RING_INST;
      const row=mfSwKind[i]===1?nd++:n++,o=row*MF_SW_FLOATS;
      if(mfSwKind[i]===0) MF_SW_RING_MAP[row]=i;
      dst[o+0]=mfSwX[i];dst[o+1]=terrainH(mfSwX[i],mfSwY[i])+(mfSwKind[i]===1?r*.3:.3);dst[o+2]=mfSwY[i];dst[o+3]=r;
      dst[o+4]=Math.min(1,mfSwAge[i]);dst[o+5]=mfSwKind[i]===1?mfSwOp[i]:mfSwOp[i]*(1-mfSwAge[i]*mfSwAge[i]);
      dst[o+6]=mfSwSpeed[i];dst[o+7]=mfSwSeed[i];
      dst[o+8]=mfSwColR[i];dst[o+9]=mfSwColG[i];dst[o+10]=mfSwColB[i];dst[o+11]=mfSwKind[i];
    }
    if(!n&&!nd) return true;
    gl.useProgram(mfSwProg);
    gl.uniformMatrix4fv(mfSwU.uVP,false,matVP);
    const eye=typeof eyeX==='number'?[eyeX,eyeY,eyeZ]:[cam.x,200,cam.y];
    gl.uniform3f(mfSwU.uEye,eye[0],eye[1],eye[2]);
    gl.uniform1f(mfSwU.uTime,typeof animT==='number'?animT:mfSwNow());
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,mfSwTex);gl.uniform1i(mfSwU.uNoise,0);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);
    gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
    gl.bindVertexArray(mfSwVAO);gl.bindBuffer(gl.ARRAY_BUFFER,mfSwInstVBO);
    if(n){
      gl.uniform1f(mfSwU.uHex,0);gl.bufferSubData(gl.ARRAY_BUFFER,0,MF_SW_RING_INST,0,n*MF_SW_FLOATS);
      gl.drawArraysInstanced(gl.TRIANGLES,0,mfSwRingVerts,n);
    }
    if(nd){
      gl.uniform1f(mfSwU.uHex,1);gl.bufferSubData(gl.ARRAY_BUFFER,0,MF_SW_DOME_INST,0,nd*MF_SW_FLOATS);
      gl.drawArraysInstanced(gl.TRIANGLES,mfSwDomeFirst,mfSwDomeVerts,nd);
    }
    /* Suppress the armed legacy annulus only after the complete custom pass
       succeeds. A later dome/upload failure must reveal every fallback rather
       than leave a half-presented frame. */
    for(let i=0;i<n;i++) mfSwPresented[MF_SW_RING_MAP[i]]=1;
  }catch(e){
    mfSwPresented.fill(0);
    MF_SW_TELEM.lastError='draw: '+String(e&&e.message||e).slice(0,150);
    return false;
  }finally{
    gl.bindVertexArray(wasVAO);gl.bindBuffer(gl.ARRAY_BUFFER,wasArr);
    gl.blendFuncSeparate(srcRGB,dstRGB,srcA,dstA);gl.blendEquationSeparate(eqRGB,eqA);
    gl.depthFunc(wasDepthFunc);gl.depthMask(wasMask);gl.cullFace(wasCullMode);
    if(wasDepth)gl.enable(gl.DEPTH_TEST);else gl.disable(gl.DEPTH_TEST);
    if(wasCull)gl.enable(gl.CULL_FACE);else gl.disable(gl.CULL_FACE);
    if(wasBlend)gl.enable(gl.BLEND);else gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,wasTex0);
    gl.activeTexture(wasActive);gl.bindTexture(gl.TEXTURE_2D,wasActiveTex);
    try{
      if(typeof begin3D==='function') begin3D(Number.isFinite(Number(S_nA))?Number(S_nA):0);
      else gl.useProgram(wasProg);
    }catch(_){gl.useProgram(wasProg);}
  }
  return true;
}

window.mfShockwaveBoot=mfShockwaveBoot;
window.mfShockwaveHit=mfShockwaveHit;
window.mfShockwaveForcefield=mfShockwaveForcefield;
window.mfShockwaveRemove=mfShockwaveRemove;
window.mfShockwaveUpdate=mfShockwaveUpdate;
window.mfShockwaveDraw=mfShockwaveDraw;
window.mfShockwaveTick=mfShockwaveTick;
window.mfShockwaveGLReset=mfShockwaveGLReset;
window.mfShockwaveReset=mfShockwaveReset;
window.mfShockwavePresentedAt=mfShockwavePresentedAt;
window.MF_SW_TELEM=MF_SW_TELEM;
})();
