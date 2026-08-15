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
let gpfxHi=0, gpfxAge=0, gpfxDrawN=0;
let gpfxUup={}, gpfxUr={};
let gpfxAttr=[0,0,0,0];      // set by the sim while a singularity is live
const GPFX_SCRATCH=new Float32Array(GPFX_FLOATS*512);

const GPFX_VSU=`#version 300 es
layout(location=0) in vec4 aP;   // xyz + life
layout(location=1) in vec4 aV;   // vel + size
layout(location=2) in vec4 aC;   // rgb + drag
uniform float uDt; uniform float uGrav;
uniform vec4 uAttr;          // xyz = singularity core, w = strength (0 = off)
/* Height on unit 10 (terrain/water already own it). Never 0/4/5/6.
   Seabed samples are negative; max with 0.4 keeps water spray on the plane. */
uniform sampler2D uHeight;
uniform float uMap;
uniform float uHasH;
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
     rather than sinking through the world. y<0.4 is sea-level — hills sit
     much higher, so sample heightTex (world Y) when the terrain pass left it. */
  float floorY=0.4;
  if(uHasH>0.5&&uMap>1.0){
    vec2 uv=clamp(p.xz/uMap,0.0,1.0);
    floorY=max(0.4, texture(uHeight,uv).r+0.5);
  }
  if(p.y<floorY&&v.y<0.0){ p.y=floorY; v*=0.22; life=min(life,0.22); }
  tfP=vec4(p,life); tfV=vec4(v,aV.w); tfC=aC;
}`;
const GPFX_FSU=`#version 300 es
precision lowp float; out vec4 o; void main(){ o=vec4(0.0); }`;

const GPFX_VSR=`#version 300 es
layout(location=0) in vec4 aP;
layout(location=1) in vec4 aV;
layout(location=2) in vec4 aC;
uniform mat4 uVP; uniform float uPx; uniform float uCap;
out vec3 vC; out float vA; out float vSoft;
void main(){
  float life=max(aP.w,0.0);
  if(aP.w<=0.0){
    gl_Position=vec4(2.0,2.0,2.0,1.0);
    gl_PointSize=0.0; vC=vec3(0.0); vA=0.0; vSoft=0.0; return;
  }
  gl_Position=uVP*vec4(aP.xyz,1.0);
  /* Ortho: pixels = worldSize * (drawingBufferHeight / orthoSpan).
     A 3-unit spark at tactical zoom was ~9 px, then the 1.6 px death
     floor turned the field into 1px grain. Fade by alpha, not size.
     Sprite stays circular — no velocity ellipse. */
  float t=clamp(life*1.55,0.0,1.0);
  float sz=aV.w*uPx;
  gl_PointSize=clamp(sz*(0.88+0.16*t),5.0,max(uCap,24.0));
  /* Size threshold picks puff vs spark in the fragment. Layout stays
     12 floats — do not add a 13th channel. */
  vSoft=smoothstep(4.8,8.2,aV.w);
  /* Contained glow. 2.7× colour * 2.3× kernel * additive * bloom
     painted the close-up white. C&C puffs are dense, not a flashbang. */
  vC=aC.rgb*(1.00+0.55*t*t);
  vA=min(0.78,life*3.2);
}`;
const GPFX_FSR=`#version 300 es
precision highp float;
in vec3 vC; in float vA; in float vSoft; out vec4 o;
void main(){
  vec2 q=gl_PointCoord*2.0-1.0;
  float d2=dot(q,q);
  if(d2>1.0) discard;
  /* Soft circular volume. Spark keeps a hotter core; puff is a disc.
     Peak k stays under ~1.6 so a stack of 30 does not blow the buffer. */
  float body=1.0-smoothstep(0.0,mix(0.38,0.80,vSoft),d2);
  float core=1.0-smoothstep(0.0,mix(0.11,0.26,vSoft),d2);
  float halo=1.0-smoothstep(mix(0.18,0.36,vSoft),1.0,d2);
  float k=core*mix(0.92,0.42,vSoft)+body*mix(0.62,0.88,vSoft)+halo*mix(0.22,0.38,vSoft);
  vec3 hot=mix(vC,vec3(1.0),core*mix(0.55,0.22,vSoft));
  o=vec4(hot*k*vA,k*vA);
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
           attr:gl.getUniformLocation(gpfxProgU,'uAttr'),
           height:gl.getUniformLocation(gpfxProgU,'uHeight'),
           map:gl.getUniformLocation(gpfxProgU,'uMap'),
           hasH:gl.getUniformLocation(gpfxProgU,'uHasH')};
  const wasP=gl.getParameter(gl.CURRENT_PROGRAM);
  gl.useProgram(gpfxProgU);
  if(gpfxUup.height) gl.uniform1i(gpfxUup.height,10);
  if(wasP) gl.useProgram(wasP);
  gpfxUr={vp:gl.getUniformLocation(gpfxProgR,'uVP'),px:gl.getUniformLocation(gpfxProgR,'uPx'),
           cap:gl.getUniformLocation(gpfxProgR,'uCap')};
  /* DYNAMIC_COPY with a byte length leaves GPU memory uninitialized. HIGH/CINE
     still draw GPFX_CAP once any particle is live, so garbage life/pos became
     noisy specks and coloured streaks across the ground. */
  const zero=new Float32Array(GPFX_CAP*GPFX_FLOATS);
  const mkBuf=()=>{ const b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.bufferData(gl.ARRAY_BUFFER,zero,gl.DYNAMIC_COPY); return b; };
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
function gpfxGLReset(){ gpfxProgU=gpfxProgR=gpfxA=gpfxB=gpfxVAO_A=gpfxVAO_B=gpfxTF=null; gpfxHead=0; gpfxLive=0; gpfxHi=0; gpfxAge=0; gpfxDrawN=0; }

/* Preset scale for DRAW-side FX. GFX.particles is 0.5/0.75/1/1.5.
   Do not multiply by perfScale — main.js already folds particles into it. */
function mfVfxQ(){
  return (typeof GFX!=='undefined'&&GFX.particles!=null)?GFX.particles:1;
}
/* HIGH/CINE keep the 6144 window. MEDIUM/LOW only TF+draw the prefix they
   can fill — mid-tier was paying 6144 verts for a handful of sparks. */
function gpfxWorkCap(){
  const p=mfVfxQ();
  if(p>=0.95) return GPFX_CAP;
  return p>=0.65?2048:1024;
}
function gpfxN(n,lo){
  const p=mfVfxQ();
  /* MEDIUM is a first-class mobile target. 0.62 vs HIGH 1.12 was a sparse
     spark rain. Share the look; fillrate is the cheaper point cap / window. */
  const k=p>=1.25?1.55:p>=0.95?1.12:p>=0.65?0.98:0.42;
  return Math.max(lo==null?2:lo, Math.round(n*k));
}
/* Energy / impact: overlapping soft discs first, then a few hot sparks.
   Dark additive "debris" was invisible (SRC_ALPHA,ONE * rgb*0.38 ≈ nothing)
   and the leftover budget went to 9 px needles. Skip the water stamp —
   lifting every land hit to Y=16 floated the puff off the hull. */
function gpfxEnergyBlast(x,y,h,n,col,opts){
  const o=opts||{}, p=mfVfxQ();
  const nn=gpfxN(n, o.min==null?3:o.min);
  if(nn<=0||typeof gpfxBurst!=='function') return;
  const c=col||[180,220,255];
  const terr=(typeof terrainH==='function'?terrainH(x,y):0);
  const hh=Math.max(h==null?0:h, Math.max(0.4, terr+1.15));
  const sp=o.speed||88, lf=o.life||0.88, sz=o.size||6.8;
  const jit=o.jit==null?2.0:o.jit;
  /* Volume is fewer, slower discs — stacking the full nn at 8+ wu
     plus a white needle layer is what washed the close-up. */
  const vn=Math.max(3,(nn*0.62)|0);
  gpfxBurst(x,y,hh,vn,{speed:sp*0.40,up:o.up==null?0.55:o.up,life:lf*1.08,
    col:c,size:sz,drag:o.drag==null?0.960:o.drag,jit:jit,dir:o.dir,skipWater:1});
  if(p>=0.65)
    gpfxBurst(x,y,hh+1.2,Math.max(3,nn>>2),{speed:sp*0.95,up:0.18,life:lf*0.48,
      col:[255,250,232],size:sz*0.46,drag:0.90,jit:Math.min(1.8,jit),dir:o.dir,skipWater:1});
  if(p>=0.95)
    gpfxBurst(x,y,hh+1.8,Math.max(2,(nn*0.22)|0),{speed:sp*1.28,up:0.10,life:lf*0.34,
      col:c,size:sz*0.36,drag:0.87,jit:1.1,dir:o.dir,spread:0.16,skipWater:1});
}

/* Emit n particles. kind of spray is caller-shaped via speed/spread/gravity:
   sparks (fast, hot, heavy), embers (slow, drifting), debris (mid, dark). */
function gpfxBurst(x,y,h,n,opts){
  if(!gpfxProgU){ gpfxInit(); if(!gpfxProgU) return; }
  n=Math.min(n|0,512); if(n<=0) return;
  const o=opts||{};
  /* Superweapon / crater spray over authored water. Energy / muzzle pass
     skipWater so a land hit does not write a crater splash. The splash
     waterFxImpact itself emits is n=12 and wfxSplashing, so it cannot loop. */
  if(!o.skipWater && n>=20 && (h==null||h<16) && !(typeof wfxSplashing!=='undefined'&&wfxSplashing)
     && typeof stampWaterRipple==='function')
    stampWaterRipple(x,y, Math.min(1.25, n/52));
  /* Civic wreck / crater bursts pass h=5–10 (world Y at sea). Hills sit
     much higher — lift the spawn onto terrain without burying water spray
     (seabed samples are negative, so max with 0.4 keeps them on the plane). */
  const terr=(typeof terrainH==='function'?terrainH(x,y):0);
  h=Math.max(h==null?0:h, Math.max(0.4, terr+0.55));
  const sp=o.speed||90, up=o.up==null?0.55:o.up, life=o.life||1.1;
  const col=o.col||[255,190,90], size=o.size||5.8, drag=o.drag==null?0.985:o.drag;
  const dir=o.dir, spread=o.spread==null?0.30:o.spread;
  let dx=0,dz=0,hasDir=false;
  if(dir&&dir.length>=2){
    const dl=Math.hypot(dir[0],dir[1])||1;
    dx=dir[0]/dl; dz=dir[1]/dl; hasDir=true;
  }
  const S=GPFX_SCRATCH;
  for(let i=0;i<n;i++){
    const a=Math.random()*TAU, el=(Math.random()*2-1);
    const v=sp*(0.35+Math.random()*0.65);
    const k=i*GPFX_FLOATS;
    S[k]=x+(Math.random()*2-1)*(o.jit||2);  S[k+1]=h+(Math.random()*2-1)*(o.jit||2);
    S[k+2]=y+(Math.random()*2-1)*(o.jit||2);
    S[k+3]=life*(0.55+Math.random()*0.65);
    if(hasDir){
      S[k+4]=dx*v+(Math.random()*2-1)*v*spread;
      S[k+5]=v*up*(0.22+Math.random()*0.75);
      S[k+6]=dz*v+(Math.random()*2-1)*v*spread;
    } else {
      S[k+4]=Math.cos(a)*v*(1-Math.abs(el)*0.4);
      S[k+5]=v*up*(0.4+Math.random()*0.9);
      S[k+6]=Math.sin(a)*v*(1-Math.abs(el)*0.4);
    }
    S[k+7]=size*(0.6+Math.random()*0.8);
    S[k+8]=col[0]/255; S[k+9]=col[1]/255; S[k+10]=col[2]/255;
    S[k+11]=drag;
  }
  const buf=gpfxFlip?gpfxB:gpfxA;
  /* Sim ticks can emit bursts between draws. Stomping ARRAY_BUFFER while an
     InstMesh VAO is current retargets that VAO's attrib 0 at the particle
     buffer — the next model flush then uploads instance data into GPUFX
     memory and the army's albedo appears to strobe. */
  const wasVao=gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  const wasArr=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  const work=gpfxWorkCap();
  if(gpfxHead>=work) gpfxHead=gpfxHead%work;
  const end=Math.min(work,gpfxHead+n);
  const first=end-gpfxHead;
  gl.bufferSubData(gl.ARRAY_BUFFER,gpfxHead*48,S.subarray(0,first*GPFX_FLOATS));
  if(n>first) gl.bufferSubData(gl.ARRAY_BUFFER,0,S.subarray(first*GPFX_FLOATS,n*GPFX_FLOATS));
  const wrapped=gpfxHead+n>work;
  gpfxHead=(gpfxHead+n)%work;
  gpfxLive=Math.min(work,gpfxLive+n);
  gpfxHi=wrapped?work:Math.max(gpfxHi,gpfxHead||work);
  gpfxAge=0;
  gl.bindBuffer(gl.ARRAY_BUFFER,wasArr);
  gl.bindVertexArray(wasVao);
}

/* One call per frame from the additive pass: advance, then draw. */
function gpfxFrame(dt,matVP,viewH){
  if(!gpfxProgU||!gpfxLive){ gpfxDrawN=0; return; }
  /* Longest authored life is ~2.8×1.2. After that the field is dead — do not
     keep transform-feedbacking the buffer. HIGH also drops; a quiet map is
     not a permanent 6144-point tax. */
  gpfxAge+=Math.min(dt>0?dt:0,0.05);
  if(gpfxAge>4.0){
    gpfxLive=0; gpfxHead=0; gpfxHi=0; gpfxDrawN=0;
    return;
  }
  const p=mfVfxQ();
  const work=gpfxWorkCap();
  if(gpfxHi>work) gpfxHi=work;
  if(gpfxLive>work) gpfxLive=work;
  /* HIGH/CINE: full buffer. MEDIUM/LOW: live high-water only. */
  const nDraw=p>=0.95?GPFX_CAP:Math.max(1,Math.min(work,gpfxHi||gpfxLive));
  gpfxDrawN=nDraw;
  const src=gpfxFlip?gpfxVAO_B:gpfxVAO_A, dst=gpfxFlip?gpfxA:gpfxB;
  /* Combat is the only caller. Leaving TF / RASTERIZER_DISCARD / ARRAY_BUFFER
     dirty made the NEXT frame's model pass sample the wrong buffer as albedo
     — every hull strobing for as long as any GPU particle was alive. */
  const wasProg=gl.getParameter(gl.CURRENT_PROGRAM);
  const wasVao=gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  const wasArr=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  const wasDiscard=gl.isEnabled(gl.RASTERIZER_DISCARD);
  const wasTex=gl.getParameter(gl.ACTIVE_TEXTURE);
  const wasBlend=gl.isEnabled(gl.BLEND), wasCull=gl.isEnabled(gl.CULL_FACE);
  const wasDepth=gl.isEnabled(gl.DEPTH_TEST), wasMask=gl.getParameter(gl.DEPTH_WRITEMASK);
  gl.useProgram(gpfxProgU);
  gl.uniform1f(gpfxUup.dt,Math.min(dt,0.05));
  gl.uniform1f(gpfxUup.grav,gpfxAttr[3]>0?30.0:150.0);
  gl.uniform4f(gpfxUup.attr,gpfxAttr[0],gpfxAttr[1],gpfxAttr[2],gpfxAttr[3]);
  /* Height lives on 10. Bind, sample, restore — never unit 0, never 4/5/6,
     never bindTexture(null). */
  const hasH=typeof heightTex!=='undefined'&&heightTex;
  gl.activeTexture(gl.TEXTURE10);
  const prev10=gl.getParameter(gl.TEXTURE_BINDING_2D);
  if(hasH) gl.bindTexture(gl.TEXTURE_2D,heightTex);
  if(gpfxUup.hasH) gl.uniform1f(gpfxUup.hasH,hasH?1:0);
  if(gpfxUup.map) gl.uniform1f(gpfxUup.map,typeof MAP!=='undefined'?MAP:3200);
  gl.enable(gl.RASTERIZER_DISCARD);
  gl.bindVertexArray(src);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,gpfxTF);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,dst);
  gl.beginTransformFeedback(gl.POINTS);
  gl.drawArrays(gl.POINTS,0,nDraw);
  gl.endTransformFeedback();
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);
  gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,null);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);
  gl.disable(gl.RASTERIZER_DISCARD);
  gl.activeTexture(gl.TEXTURE10);
  if(prev10) gl.bindTexture(gl.TEXTURE_2D,prev10);
  else if(hasH) gl.bindTexture(gl.TEXTURE_2D,heightTex);
  gpfxFlip^=1;
  gl.useProgram(gpfxProgR);
  gl.uniformMatrix4fv(gpfxUr.vp,false,matVP);
  /* Pixels-per-world, not raw view height. drawingBufferHeight is what
     gl_PointSize is measured in; CSS innerHeight * 1/w was the smear. */
  const bufH=(gl&&gl.drawingBufferHeight)||viewH||900;
  const span=Math.max(1,typeof orthoSpan==='number'?orthoSpan:480);
  const qMul=p>=1.25?1.20:p>=0.95?1.12:p>=0.65?1.08:0.88;
  gl.uniform1f(gpfxUr.px,(bufH/span)*qMul);
  /* Cap is fillrate. 52 px * 3k additive discs + bloom = white frame.
     36/30 still reads as a puff, not a 1px grain. */
  const cap=p>=1.25?48:p>=0.95?36:p>=0.65?30:18;
  if(gpfxUr.cap) gl.uniform1f(gpfxUr.cap,cap);
  gl.bindVertexArray(gpfxFlip?gpfxVAO_B:gpfxVAO_A);
  gl.drawArrays(gl.POINTS,0,nDraw);
  /* bindBuffer(ARRAY_BUFFER) AFTER restoring a VAO retargets that VAO's attrib
     0 — the exact leak gpfxBurst used to cause. Restore the default bind with
     VAO unbound, then put the caller's VAO back. */
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER,wasArr);
  gl.bindVertexArray(wasVao);
  if(wasDiscard) gl.enable(gl.RASTERIZER_DISCARD); else gl.disable(gl.RASTERIZER_DISCARD);
  if(wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  if(wasCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
  if(wasBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
  gl.depthMask(wasMask);
  gl.activeTexture(wasTex);
  if(wasProg) gl.useProgram(wasProg);
}

/* Airframe smoke trail. Billboard puffs (addAirPuff) are the smoke; GPU
   motes are HIGH-only soot, not gpfxEnergyBlast. Additive mid-grey read as
   a white energy ribbon on the first pass — do not put the trail on GPU. */
function gpfxAirSmoke(x,y,h,vx,vy,opts){
  const o=opts||{}, p=mfVfxQ();
  const sz=Math.max(4.2,(o.size||14)*0.40);
  const backX=-(vx||0)*0.18, backY=-(vy||0)*0.18;
  if(typeof addAirPuff==='function'){
    const n=p>=0.95?(o.rich||o.crash?3:2):p>=0.65?(o.rich||o.crash?2:1):1;
    for(let k=0;k<n;k++){
      const jx=(Math.random()*2-1)*2.4, jy=(Math.random()*2-1)*2.4;
      addAirPuff(x+jx,y+jy,h, backX+(Math.random()*2-1)*2.2, backY-2-Math.random()*4,
        p>=0.95?1.2:0.82, sz*(0.72+Math.random()*0.38), 54,50,46);
    }
  }
  if(p>=0.95 && typeof gpfxBurst==='function')
    gpfxBurst(x,y,h, o.crash?3:2, {speed:6,up:0.62,life:0.58,col:[58,52,46],
      size:4.4,drag:0.974,jit:1.0,skipWater:1});
}

