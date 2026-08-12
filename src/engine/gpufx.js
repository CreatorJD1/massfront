;
;
/* ============================================================================
   GPU PARTICLES — transform feedback
   ----------------------------------------------------------------------------
   The CPU particle pool is fine for forty smoke puffs; it is not fine for the
   three thousand white-hot fragments a superweapon owes the player. This is
   the industry-standard mobile answer: particles live entirely on the GPU —
   position, velocity, life, colour in one interleaved buffer, advanced by a
   transform-feedback pass (rasterizer discarded), rendered as additive point
   sprites in the same draw state as every other glow. The CPU's only job is
   writing newborn particles into a ring window of the buffer.

   12 floats per particle: pos(3) life(1) vel(3) size(1) rgb(3) drag(1).
   Capacity 6144 — a full superweapon plus every beam on screen, one draw.

   ROUTING RULE (hybrid by design — keep it this way):
     CPU pool (addParticle)  → light, few, authored: smoke puffs, muzzle
       flashes, shock rings, flipbook fireballs, mushroom columns, debris
       chunks that need per-particle gameplay logic.
     GPU (gpfxBurst)         → heavy, many, dynamic: spark fountains, ember
       storms, beam impact spray, singularity infall — anything where the
       COUNT is the effect. If an effect wants >24 particles a burst or
       continuous emission, it belongs here; if it wants bespoke behaviour
       per particle, it belongs on the CPU.
   ============================================================================ */
const GPFX_CAP=6144, GPFX_FLOATS=12;
let gpfxA=null, gpfxB=null, gpfxVAO_A=null, gpfxVAO_B=null, gpfxTF=null;
let gpfxProgU=null, gpfxProgR=null, gpfxHead=0, gpfxFlip=0, gpfxLive=0;
let gpfxUup={}, gpfxUr={};
let gpfxAttr=[0,0,0,0];      // set by the sim while a singularity is live
const GPFX_SCRATCH=new Float32Array(GPFX_FLOATS*512);

const GPFX_VSU=`#version 300 es
layout(location=0) in vec4 aP;   // xyz + life
layout(location=1) in vec4 aV;   // vel + size
layout(location=2) in vec4 aC;   // rgb + drag
uniform float uDt; uniform float uGrav;
uniform vec4 uAttr;          // xyz = singularity core, w = strength (0 = off)
out vec4 tfP; out vec4 tfV; out vec4 tfC;
void main(){
  float life=aP.w-uDt;
  vec3 v=aV.xyz;
  v.y-=uGrav*uDt;
  /* SINGULARITY PULL. Inverse-distance attraction plus a tangential term, so
     matter SPIRALS in along an accretion path instead of falling straight —
     the swirl is what reads as gravity rather than suction. Anything that
     crosses the horizon is consumed. */
  if(uAttr.w>0.0){
    vec3 dvec=uAttr.xyz-aP.xyz;
    float dl=length(dvec)+3.0;
    vec3 dir=dvec/dl;
    float pull=uAttr.w*2400.0/dl;
    v+=dir*pull*uDt;
    v+=vec3(dir.z,0.0,-dir.x)*pull*0.42*uDt;
    if(dl<7.5) life=0.0;
  }
  v*=pow(aC.w,uDt*60.0);
  vec3 p=aP.xyz+v*uDt;
  /* Grounding: an ember that reaches the floor dies there in a brief flare
     rather than sinking through the world. */
  if(p.y<0.4&&v.y<0.0){ p.y=0.4; v*=0.22; life=min(life,0.22); }
  tfP=vec4(p,life); tfV=vec4(v,aV.w); tfC=aC;
}`;
const GPFX_FSU=`#version 300 es
precision lowp float; out vec4 o; void main(){ o=vec4(0.0); }`;

const GPFX_VSR=`#version 300 es
layout(location=0) in vec4 aP;
layout(location=1) in vec4 aV;
layout(location=2) in vec4 aC;
uniform mat4 uVP; uniform float uPx;
out vec3 vC; out float vA;
void main(){
  float life=max(aP.w,0.0);
  gl_Position=uVP*vec4(aP.xyz,1.0);
  /* Hot when young: size and brightness both decay with life so a burst
     reads as cooling debris, not confetti. */
  float t=clamp(life*1.6,0.0,1.0);
  gl_PointSize=clamp(aV.w*uPx/max(gl_Position.w,0.6),1.0,42.0)*(0.55+0.45*t);
  vC=aC.rgb*(0.55+1.45*t*t);
  vA=(life>0.0?1.0:0.0)*min(1.0,life*3.0);
}`;
const GPFX_FSR=`#version 300 es
precision mediump float;
in vec3 vC; in float vA; out vec4 o;
void main(){
  vec2 q=gl_PointCoord*2.0-1.0;
  float d=dot(q,q); if(d>1.0) discard;
  float k=(1.0-d)*(1.0-d);
  o=vec4(vC*k*vA,k*vA);
}`;

function gpfxInit(){
  if(gpfxProgU||typeof gl==='undefined'||!gl) return;
  const mk=(vs,fs,tf)=>{
    const p=gl.createProgram();
    for(const [ty,src] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){
      const sh=gl.createShader(ty); gl.shaderSource(sh,src); gl.compileShader(sh);
      if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){
        console.error('gpufx shader',gl.getShaderInfoLog(sh)); return null; }
      gl.attachShader(p,sh);
    }
    if(tf) gl.transformFeedbackVaryings(p,['tfP','tfV','tfC'],gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)){
      console.error('gpufx link',gl.getProgramInfoLog(p)); return null; }
    return p;
  };
  gpfxProgU=mk(GPFX_VSU,GPFX_FSU,true);
  gpfxProgR=mk(GPFX_VSR,GPFX_FSR,false);
  if(!gpfxProgU||!gpfxProgR){ gpfxProgU=gpfxProgR=null; return; }
  gpfxUup={dt:gl.getUniformLocation(gpfxProgU,'uDt'),grav:gl.getUniformLocation(gpfxProgU,'uGrav'),
           attr:gl.getUniformLocation(gpfxProgU,'uAttr')};
  gpfxUr={vp:gl.getUniformLocation(gpfxProgR,'uVP'),px:gl.getUniformLocation(gpfxProgR,'uPx')};
  const bytes=GPFX_CAP*GPFX_FLOATS*4;
  const mkBuf=()=>{ const b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.bufferData(gl.ARRAY_BUFFER,bytes,gl.DYNAMIC_COPY); return b; };
  gpfxA=mkBuf(); gpfxB=mkBuf();
  const mkVao=(buf)=>{ const v=gl.createVertexArray(); gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,4,gl.FLOAT,false,48,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,4,gl.FLOAT,false,48,16);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,4,gl.FLOAT,false,48,32);
    gl.bindVertexArray(null); return v; };
  gpfxVAO_A=mkVao(gpfxA); gpfxVAO_B=mkVao(gpfxB);
  gpfxTF=gl.createTransformFeedback();
}
function gpfxGLReset(){ gpfxProgU=gpfxProgR=gpfxA=gpfxB=gpfxVAO_A=gpfxVAO_B=gpfxTF=null; gpfxHead=0; gpfxLive=0; }

/* Emit n particles. kind of spray is caller-shaped via speed/spread/gravity:
   sparks (fast, hot, heavy), embers (slow, drifting), debris (mid, dark). */
function gpfxBurst(x,y,h,n,opts){
  if(!gpfxProgU){ gpfxInit(); if(!gpfxProgU) return; }
  n=Math.min(n|0,512); if(n<=0) return;
  const o=opts||{};
  const sp=o.speed||90, up=o.up==null?0.55:o.up, life=o.life||1.1;
  const col=o.col||[255,190,90], size=o.size||3.2, drag=o.drag==null?0.985:o.drag;
  const S=GPFX_SCRATCH;
  for(let i=0;i<n;i++){
    const a=Math.random()*TAU, el=(Math.random()*2-1);
    const v=sp*(0.35+Math.random()*0.65);
    const k=i*GPFX_FLOATS;
    S[k]=x+(Math.random()*2-1)*(o.jit||2);  S[k+1]=h+(Math.random()*2-1)*(o.jit||2);
    S[k+2]=y+(Math.random()*2-1)*(o.jit||2);
    S[k+3]=life*(0.55+Math.random()*0.65);
    S[k+4]=Math.cos(a)*v*(1-Math.abs(el)*0.4);
    S[k+5]=v*up*(0.4+Math.random()*0.9);
    S[k+6]=Math.sin(a)*v*(1-Math.abs(el)*0.4);
    S[k+7]=size*(0.6+Math.random()*0.8);
    S[k+8]=col[0]/255; S[k+9]=col[1]/255; S[k+10]=col[2]/255;
    S[k+11]=drag;
  }
  const buf=gpfxFlip?gpfxB:gpfxA;
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  const end=Math.min(GPFX_CAP,gpfxHead+n);
  const first=end-gpfxHead;
  gl.bufferSubData(gl.ARRAY_BUFFER,gpfxHead*48,S.subarray(0,first*GPFX_FLOATS));
  if(n>first) gl.bufferSubData(gl.ARRAY_BUFFER,0,S.subarray(first*GPFX_FLOATS,n*GPFX_FLOATS));
  gpfxHead=(gpfxHead+n)%GPFX_CAP;
  gpfxLive=Math.min(GPFX_CAP,gpfxLive+n);
  gl.bindBuffer(gl.ARRAY_BUFFER,null);
}

/* One call per frame from the additive pass: advance, then draw. */
function gpfxFrame(dt,matVP,viewH){
  if(!gpfxProgU||!gpfxLive) return;
  const src=gpfxFlip?gpfxVAO_B:gpfxVAO_A, dst=gpfxFlip?gpfxA:gpfxB;
  gl.useProgram(gpfxProgU);
  gl.uniform1f(gpfxUup.dt,Math.min(dt,0.05));
  gl.uniform1f(gpfxUup.grav,gpfxAttr[3]>0?30.0:150.0);
  gl.uniform4f(gpfxUup.attr,gpfxAttr[0],gpfxAttr[1],gpfxAttr[2],gpfxAttr[3]);
  gl.enable(gl.RASTERIZER_DISCARD);
  gl.bindVertexArray(src);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,gpfxTF);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,dst);
  gl.beginTransformFeedback(gl.POINTS);
  gl.drawArrays(gl.POINTS,0,GPFX_CAP);
  gl.endTransformFeedback();
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);
  gl.disable(gl.RASTERIZER_DISCARD);
  gpfxFlip^=1;
  gl.useProgram(gpfxProgR);
  gl.uniformMatrix4fv(gpfxUr.vp,false,matVP);
  gl.uniform1f(gpfxUr.px,(viewH||900)*0.9);
  gl.bindVertexArray(gpfxFlip?gpfxVAO_B:gpfxVAO_A);
  gl.drawArrays(gl.POINTS,0,GPFX_CAP);
  gl.bindVertexArray(null);
}

