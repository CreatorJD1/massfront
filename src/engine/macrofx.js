;/* ============================================================================
   MACRO FX FLIPBOOK RENDERER
   ----------------------------------------------------------------------------
   The simulation owns recipes; this file owns only their authored billboard
   fallback. One macro queue entry becomes one BBBatch instance. There are no
   additive cores, point sprays or helper lobes here, so switching a volume to
   its fallback cannot accidentally double the event's logical layer count.

   INTEGRATION CONTRACT
     macroFxBoot()                                  after initBillboards()
     macroFxQueue(kind,x,y,h,size,age01,alpha,tint,rot)
     macroFxQueueRect(kind,x,y,h,width,height,age01,alpha,tint,rot)
     macroFxDraw(S_nA)                              once after queueing
     macroFxGLReset()                               on GL context rebuild
     macroFxReset()                                 on resetWorld()

   Stable queue kinds deliberately match the particle-ring takeover types:
     11 blast, 12 collapse dust, 13 persistent wreck fire/smoke,
     14 missile/air smoke, 15 energy ribbon, 16 energy terminus,
     17 organic ichor, 18 airborne vehicle destruction.
   ============================================================================ */
(function(){
'use strict';

const MF_MX_BLAST=11;
const MF_MX_DUST=12;
const MF_MX_WRECK=13;
const MF_MX_TRAIL=14;
const MF_MX_ENERGY_RIBBON=15;
const MF_MX_ENERGY_HIT=16;
const MF_MX_ICHOR=17;
const MF_MX_AIR_DEATH=18;
const MF_MX_CAP=4096;
const MF_MX_BATCH_CAP=1024;
/* Owner review: velocity-aligned geometric stretch smears fire into an
   unnatural oval. Fire-bearing billboards never exceed ~1.6:1; the trimmed
   elongation is traded into the short axis at equal area so coverage and
   apparent density hold, and motion continuity comes from the per-frame
   restamp along the particle's advected path, not from stretching art. */
const MF_MX_FIRE_STRETCH_CAP=1.6;
/* Asset groups, not queue kinds: ribbon and terminus intentionally share one
   decoded texture and one draw call, using different eight-frame ranges. */
const MF_MX_KIND_N=7;
const MF_MX_FALLBACK_GROUP=7;

const MF_MX_PATH=[
  'assets/textures/vfx/mf-blast-flipbook-v4.png',
  'assets/textures/vfx/mf-collapse-dust-flipbook-v1.png',
  'assets/textures/vfx/mf-wreck-fire-flipbook-v1.png',
  'assets/textures/vfx/mf-missile-air-smoke-flipbook-v1.png',
  'assets/textures/vfx/mf-energy-beam-terminus-flipbook-v2.png',
  'assets/textures/vfx/mf-organic-ichor-flipbook-v1.png',
  'assets/textures/vfx/mf-air-destruction-flipbook-v1.png'
];

/* Queue-of-structs would allocate an object for every visible event every
   frame. Parallel fixed arrays keep a 1,000-unit artillery exchange GC-free. */
const mfMxKind=new Uint8Array(MF_MX_CAP);
const mfMxX=new Float32Array(MF_MX_CAP);
const mfMxY=new Float32Array(MF_MX_CAP);
const mfMxH=new Float32Array(MF_MX_CAP);
const mfMxSize=new Float32Array(MF_MX_CAP);
const mfMxAspect=new Float32Array(MF_MX_CAP);
const mfMxAge=new Float32Array(MF_MX_CAP);
const mfMxAlpha=new Uint8Array(MF_MX_CAP);
const mfMxRot=new Float32Array(MF_MX_CAP);
const mfMxR=new Uint8Array(MF_MX_CAP);
const mfMxG=new Uint8Array(MF_MX_CAP);
const mfMxB=new Uint8Array(MF_MX_CAP);
const mfMxUV=new Float32Array(4);
/* Stable frame buckets replace the old group-by-group full queue scan. Each
   event is classified once after texture upload/fallback state is final, then
   groups consume queue indices in original insertion order. Keeping one fixed
   segment per group avoids per-frame arrays/objects while preserving the exact
   authored-groups-first, procedural-fallback-last draw order. */
const mfMxBucketN=new Uint16Array(MF_MX_KIND_N+1);
const mfMxBucketIndex=new Uint16Array((MF_MX_KIND_N+1)*MF_MX_CAP);

/* Images survive a context loss; GL textures and BBBatches do not. Keeping
   the decoded source lets restoration re-upload without a second network race. */
const mfMxImage=new Array(MF_MX_KIND_N);
const mfMxImageState=new Uint8Array(MF_MX_KIND_N); // 0 idle, 1 loading, 2 decoded, 3 failed
const mfMxTexture=new Array(MF_MX_KIND_N);
const mfMxInset=new Float32Array(MF_MX_KIND_N);
const mfMxUploadEpoch=new Int32Array(MF_MX_KIND_N);
const mfMxBatch=new Array(MF_MX_KIND_N+1);         // authored groups plus one procedural fallback

let mfMxN=0;
let mfMxEpoch=-1;
let mfMxPassOpen=false;

const MF_MX_TELEMETRY={
  ready:false,capacity:MF_MX_CAP,queued:0,dropped:0,frames:0,
  drawn:0,culled:0,fallbacks:0,lastQueued:0,lastDrawn:0,
  lastCulled:0,lastFallbacks:0,blast:'idle',dust:'idle',wreck:'idle',
  trail:'idle',energy:'idle',ichor:'idle',airDeath:'idle',
  loadFailures:0,uploadFailures:0,lastError:''
};

function mfMxClampByte(v,def){
  v=Number(v);
  if(!Number.isFinite(v)) v=def;
  return v<=0?0:v>=255?255:v|0;
}
function mfMxKindIndex(kind){
  kind=kind|0;
  return kind===MF_MX_BLAST?0:kind===MF_MX_DUST?1:kind===MF_MX_WRECK?2:
    kind===MF_MX_TRAIL?3:(kind===MF_MX_ENERGY_RIBBON||kind===MF_MX_ENERGY_HIT)?4:
    kind===MF_MX_ICHOR?5:kind===MF_MX_AIR_DEATH?6:-1;
}
function mfMxAssetURL(path){
  return typeof mf2AssetURL==='function'?mf2AssetURL(path):('./'+path);
}
function mfMxStateName(i){
  if(mfMxTexture[i]) return 'ready';
  if(mfMxImageState[i]===3) return 'fallback-load';
  if(mfMxImageState[i]===2&&mfMxEpoch>=0&&mfMxUploadEpoch[i]===mfMxEpoch) return 'fallback-upload';
  if(mfMxImageState[i]===2) return 'decoded';
  return mfMxImageState[i]===1?'loading':'idle';
}
function mfMxSyncTelemetry(){
  MF_MX_TELEMETRY.queued=mfMxN;
  MF_MX_TELEMETRY.blast=mfMxStateName(0);
  MF_MX_TELEMETRY.dust=mfMxStateName(1);
  MF_MX_TELEMETRY.wreck=mfMxStateName(2);
  MF_MX_TELEMETRY.trail=mfMxStateName(3);
  MF_MX_TELEMETRY.energy=mfMxStateName(4);
  MF_MX_TELEMETRY.ichor=mfMxStateName(5);
  MF_MX_TELEMETRY.airDeath=mfMxStateName(6);
}

function mfMxUpload(i){
  if(mfMxTexture[i]||mfMxImageState[i]!==2||typeof gl==='undefined'||!gl) return !!mfMxTexture[i];
  const ep=(typeof glEpoch!=='undefined')?glEpoch:0;
  if(mfMxUploadEpoch[i]===ep) return false;
  mfMxUploadEpoch[i]=ep;
  const im=mfMxImage[i];
  let tex=null;
  const wasActive=gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE0);
  const wasTex=gl.getParameter(gl.TEXTURE_BINDING_2D);
  const wasAlign=gl.getParameter(gl.UNPACK_ALIGNMENT);
  const wasFlip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
  const wasPremul=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
  try{
    tex=gl.createTexture();
    if(!tex) throw new Error('createTexture returned null');
    gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,im);
    /* A conventional atlas-wide mip chain averages neighbouring animation
       cells together at tactical zoom. That showed up as dark rectangular
       plates around narrow smoke and as pale polygonal lobes around blast
       frames even though every level-0 gutter was transparent. These soft
       macro layers do not need mip sharpening: LINEAR plus the authored
       per-cell gutter is stable and never samples a neighbouring frame. */
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    mfMxTexture[i]=tex;
    /* The deterministic baker guarantees a six-pixel empty gutter. Sample
       seven source pixels inside each cell so interpolation cannot touch the
       cell boundary or a low-alpha matte remnant. */
    mfMxInset[i]=7/Math.max(4,Number(im.naturalWidth||im.width)||1024);
    return true;
  }catch(e){
    if(tex){ try{gl.deleteTexture(tex);}catch(_){} }
    MF_MX_TELEMETRY.uploadFailures++;
    MF_MX_TELEMETRY.lastError='upload '+MF_MX_PATH[i]+': '+String(e&&e.message||e).slice(0,140);
    return false;
  }finally{
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,wasAlign);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,wasFlip);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,wasPremul);
    gl.bindTexture(gl.TEXTURE_2D,wasTex);
    gl.activeTexture(wasActive);
  }
}

function mfMxRequest(i){
  if(mfMxImageState[i]!==0) return;
  if(typeof Image==='undefined'){
    mfMxImageState[i]=3;
    MF_MX_TELEMETRY.loadFailures++;
    return;
  }
  const im=new Image();
  mfMxImage[i]=im;
  mfMxImageState[i]=1;
  im.decoding='async';
  im.onload=function(){
    const iw=im.naturalWidth|0,ih=im.naturalHeight|0;
    if(!(iw>0)||!(ih>0)||iw!==ih||(iw&3)||(ih&3)){
      mfMxImageState[i]=3;
      MF_MX_TELEMETRY.loadFailures++;
      MF_MX_TELEMETRY.lastError='invalid 4x4 atlas '+MF_MX_PATH[i]+' ('+iw+'x'+ih+')';
      mfMxSyncTelemetry();
      return;
    }
    mfMxImageState[i]=2;
    mfMxUpload(i);
    mfMxSyncTelemetry();
  };
  im.onerror=function(){
    mfMxImageState[i]=3;
    MF_MX_TELEMETRY.loadFailures++;
    MF_MX_TELEMETRY.lastError='load '+MF_MX_PATH[i];
    mfMxSyncTelemetry();
  };
  im.src=mfMxAssetURL(MF_MX_PATH[i]);
}

function mfMxMakeBatches(){
  if(mfMxBatch[0]) return true;
  if(typeof BBBatch==='undefined'||typeof progBB==='undefined'||!progBB) return false;
  const wasVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  const wasArray=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  try{
    for(let i=0;i<MF_MX_KIND_N+1;i++) mfMxBatch[i]=new BBBatch(gl,MF_MX_BATCH_CAP);
  }catch(e){
    for(let i=0;i<MF_MX_KIND_N+1;i++) mfMxBatch[i]=null;
    MF_MX_TELEMETRY.lastError='batch: '+String(e&&e.message||e).slice(0,140);
    return false;
  }finally{
    gl.bindVertexArray(wasVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER,wasArray);
  }
  return true;
}

function macroFxBoot(){
  if(typeof gl==='undefined'||!gl) return false;
  if(typeof beginBB!=='function'||typeof endBB!=='function') return false;
  const ep=(typeof glEpoch!=='undefined')?glEpoch:0;
  if(mfMxEpoch!==ep){
    macroFxGLReset();
    mfMxEpoch=ep;
  }
  const batches=mfMxMakeBatches();
  for(let i=0;i<MF_MX_KIND_N;i++){
    mfMxRequest(i);
    if(mfMxImageState[i]===2&&!mfMxTexture[i]) mfMxUpload(i);
  }
  /* Authored images are optional. Readiness means the renderer can draw,
     because atlasTex + sprites provide the atomic fallback while they decode. */
  MF_MX_TELEMETRY.ready=!!(batches&&typeof atlasTex!=='undefined'&&atlasTex);
  mfMxSyncTelemetry();
  return MF_MX_TELEMETRY.ready;
}

function mfMxQueue(kind,x,y,h,width,height,age01,alpha,tint,rot){
  const ki=mfMxKindIndex(kind);
  x=Number(x);y=Number(y);h=Number(h);width=Number(width);height=Number(height);
  if(ki<0||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(h)||!(width>0)||!(height>0)){
    MF_MX_TELEMETRY.dropped++;
    return false;
  }
  if(mfMxN>=MF_MX_CAP){
    MF_MX_TELEMETRY.dropped++;
    return false;
  }
  if(kind===MF_MX_BLAST||kind===MF_MX_WRECK||kind===MF_MX_TRAIL||kind===MF_MX_AIR_DEATH){
    const long=width>height?width:height, short=width>height?height:width;
    if(long>short*MF_MX_FIRE_STRETCH_CAP){
      const capShort=Math.sqrt(width*height/MF_MX_FIRE_STRETCH_CAP);
      const capLong=capShort*MF_MX_FIRE_STRETCH_CAP;
      if(width>=height){width=capLong;height=capShort;}
      else{width=capShort;height=capLong;}
    }
  }
  let r=ki===0?255:ki===1?166:ki===2?255:ki===3?106:ki===4?255:ki===5?190:255;
  let g=ki===0?220:ki===1?154:ki===2?126:ki===3?102:ki===4?255:ki===5?238:190;
  let b=ki===0?160:ki===1?138:ki===2?50:ki===3?98:ki===4?255:ki===5?112:112;
  if(tint!=null){
    if(typeof tint==='number'){
      const c=tint>>>0;
      r=(c>>>16)&255;g=(c>>>8)&255;b=c&255;
    }else if(tint.length>=3){
      r=mfMxClampByte(tint[0],r);g=mfMxClampByte(tint[1],g);b=mfMxClampByte(tint[2],b);
    }else{
      r=mfMxClampByte(tint.r,r);g=mfMxClampByte(tint.g,g);b=mfMxClampByte(tint.b,b);
    }
  }
  age01=Number(age01);
  if(!Number.isFinite(age01)) age01=0;
  if(age01<0) age01=0;else if(age01>1) age01=1;
  alpha=Number(alpha);
  if(!Number.isFinite(alpha)) alpha=255;
  if(alpha>=0&&alpha<=1) alpha*=255;
  const i=mfMxN++;
  mfMxKind[i]=kind;
  mfMxX[i]=x;mfMxY[i]=y;mfMxH[i]=h;mfMxSize[i]=height;mfMxAspect[i]=width/height;mfMxAge[i]=age01;
  mfMxAlpha[i]=mfMxClampByte(alpha,255);
  mfMxRot[i]=Number.isFinite(Number(rot))?Number(rot):0;
  mfMxR[i]=r;mfMxG[i]=g;mfMxB[i]=b;
  MF_MX_TELEMETRY.queued=mfMxN;
  return true;
}
function macroFxQueue(kind,x,y,h,size,age01,alpha,tint,rot){
  return mfMxQueue(kind,x,y,h,size,size,age01,alpha,tint,rot);
}
function macroFxQueueRect(kind,x,y,h,width,height,age01,alpha,tint,rot){
  return mfMxQueue(kind,x,y,h,width,height,age01,alpha,tint,rot);
}

function mfMxAuthoredUV(i,ki){
  const kind=mfMxKind[i];
  const range8=kind===MF_MX_ENERGY_RIBBON||kind===MF_MX_ENERGY_HIT;
  let frame;
  if(kind===MF_MX_BLAST){
    /* Hold the three visual clauses long enough to read at tactical scale:
       ignition 0..3, turbulent fire/soot 4..9, smoke aftermath 10..15.
       The authored plate remains one core layer; this only remaps its clock. */
    const t=mfMxAge[i];
    frame=t<.18?Math.min(3,(t/.18*4)|0):
      t<.62?Math.min(9,4+(((t-.18)/.44)*6)|0):
      Math.min(15,10+(((t-.62)/.38)*6)|0);
  }else frame=range8?(kind===MF_MX_ENERGY_HIT?8:0)+Math.min(7,(mfMxAge[i]*8)|0)
    :Math.min(15,(mfMxAge[i]*16)|0);
  const col=frame&3,row=frame>>2,pad=mfMxInset[ki]||0.0009765625;
  mfMxUV[0]=col*.25+pad;
  /* DOM images upload top row first when UNPACK_FLIP_Y_WEBGL is false. Keep
     the authored row-major animation order, but reverse each cell's V range
     so blast/dust/smoke plumes stand upright instead of growing downward. */
  mfMxUV[1]=(row+1)*.25-pad;
  mfMxUV[2]=(col+1)*.25-pad;
  mfMxUV[3]=row*.25+pad;
  return mfMxUV;
}
function mfMxFallbackUV(ki){
  if(typeof sprites==='undefined') return null;
  if(ki===0) return sprites.fireball||sprites.glow||null;
  if(ki===1) return sprites.smoke||sprites.glow||null;
  if(ki===2) return sprites.flame||sprites.fireball||sprites.smoke||sprites.glow||null;
  if(ki===3) return sprites.smoke||sprites.glow||null;
  if(ki===4) return sprites.glow||null;
  if(ki===5) return sprites.smoke||sprites.glow||null;
  return sprites.fireball||sprites.flame||sprites.smoke||sprites.glow||null;
}

function mfMxBucketFrame(){
  mfMxBucketN.fill(0);
  for(let i=0;i<mfMxN;i++){
    const ki=mfMxKindIndex(mfMxKind[i]);
    /* Queue validation guarantees ki>=0. Texture readiness is sampled once
       per frame so an entry can never enter both the authored and fallback
       groups, even if an image callback completes before the next frame. */
    const group=mfMxTexture[ki]?ki:MF_MX_FALLBACK_GROUP;
    const n=mfMxBucketN[group]++;
    mfMxBucketIndex[group*MF_MX_CAP+n]=i;
  }
}

function mfMxDrawGroup(group){
  const bucketN=mfMxBucketN[group];
  if(!bucketN) return;
  const fallback=group===MF_MX_FALLBACK_GROUP;
  const tex=fallback?atlasTex:mfMxTexture[group];
  if(!tex) return;
  const batch=mfMxBatch[group];
  if(!batch) return;
  beginBB(tex);
  mfMxPassOpen=true;
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  const bucketBase=group*MF_MX_CAP;
  for(let bi=0;bi<bucketN;bi++){
    const i=mfMxBucketIndex[bucketBase+bi];
    const ki=fallback?mfMxKindIndex(mfMxKind[i]):group;
    const uv=fallback?mfMxFallbackUV(ki):mfMxAuthoredUV(i,ki);
    if(!uv) continue;
    const before=batch.n;
    const aspect=mfMxAspect[i]||1;
    let rr=mfMxR[i],gg=mfMxG[i],bb=mfMxB[i];
    if(ki===0){
      /* `hot` tints belong to ignition. Multiplying the authored soot frames
         by that same orange tint made the aftermath a brown translucent puff.
         Fade the multiplier to neutral while the single core cools. */
      const cool=Math.max(0,Math.min(1,(mfMxAge[i]-.42)/.30));
      rr=(rr+(255-rr)*cool)|0;
      gg=(gg+(255-gg)*cool)|0;
      bb=(bb+(255-bb)*cool)|0;
    }
    if(Math.abs(aspect-1)>0.001) batch.addOrientedRect(uv,mfMxX[i],mfMxY[i],mfMxH[i],
      mfMxSize[i]*aspect,mfMxSize[i],mfMxRot[i],rr,gg,bb,mfMxAlpha[i]);
    else batch.add(uv,mfMxX[i],mfMxY[i],mfMxH[i],mfMxSize[i],mfMxRot[i],
      rr,gg,bb,mfMxAlpha[i]);
    if(batch.n>before){
      MF_MX_TELEMETRY.lastDrawn++;
      if(fallback) MF_MX_TELEMETRY.lastFallbacks++;
    }else MF_MX_TELEMETRY.lastCulled++;
  }
  batch.flush(gl);
  endBB();
  mfMxPassOpen=false;
}

function macroFxDraw(nA){
  const queued=mfMxN;
  MF_MX_TELEMETRY.lastQueued=queued;
  MF_MX_TELEMETRY.lastDrawn=0;
  MF_MX_TELEMETRY.lastCulled=0;
  MF_MX_TELEMETRY.lastFallbacks=0;
  if(!queued){
    MF_MX_TELEMETRY.queued=0;
    return 0;
  }
  if(!macroFxBoot()){
    MF_MX_TELEMETRY.lastCulled=queued;
    MF_MX_TELEMETRY.culled+=queued;
    mfMxN=0;MF_MX_TELEMETRY.queued=0;
    return 0;
  }

  const wasProg=gl.getParameter(gl.CURRENT_PROGRAM);
  const wasVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  const wasArray=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  const wasActive=gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE0);
  const wasTex0=gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.activeTexture(wasActive);
  const wasBlend=gl.isEnabled(gl.BLEND),wasCull=gl.isEnabled(gl.CULL_FACE),wasDepth=gl.isEnabled(gl.DEPTH_TEST);
  const wasMask=gl.getParameter(gl.DEPTH_WRITEMASK),wasDepthFunc=gl.getParameter(gl.DEPTH_FUNC);
  const srcRGB=gl.getParameter(gl.BLEND_SRC_RGB),dstRGB=gl.getParameter(gl.BLEND_DST_RGB);
  const srcA=gl.getParameter(gl.BLEND_SRC_ALPHA),dstA=gl.getParameter(gl.BLEND_DST_ALPHA);
  const eqRGB=gl.getParameter(gl.BLEND_EQUATION_RGB),eqA=gl.getParameter(gl.BLEND_EQUATION_ALPHA);
  try{
    mfMxBucketFrame();
    for(let group=0;group<MF_MX_KIND_N+1;group++) mfMxDrawGroup(group);
  }catch(e){
    MF_MX_TELEMETRY.lastError='draw: '+String(e&&e.message||e).slice(0,140);
  }finally{
    if(mfMxPassOpen&&typeof endBB==='function'){
      try{endBB();}catch(_){}
      mfMxPassOpen=false;
    }
    for(let i=0;i<MF_MX_KIND_N+1;i++) if(mfMxBatch[i]) mfMxBatch[i].n=0;
    mfMxN=0;
    gl.bindVertexArray(wasVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER,wasArray);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,wasTex0);gl.activeTexture(wasActive);
    gl.blendEquationSeparate(eqRGB,eqA);
    gl.blendFuncSeparate(srcRGB,dstRGB,srcA,dstA);
    gl.depthFunc(wasDepthFunc);gl.depthMask(wasMask);
    if(wasDepth)gl.enable(gl.DEPTH_TEST);else gl.disable(gl.DEPTH_TEST);
    if(wasCull)gl.enable(gl.CULL_FACE);else gl.disable(gl.CULL_FACE);
    if(wasBlend)gl.enable(gl.BLEND);else gl.disable(gl.BLEND);
    gl.useProgram(wasProg);
    /* begin3D is the renderer's stronger state boundary: in addition to the
       program it repairs every material sampler after a custom texture pass. */
    try{
      if(typeof begin3D==='function'){
        let night=Number(nA);
        if(!Number.isFinite(night)) night=typeof nightAmt==='function'?nightAmt():0;
        begin3D(night);
      }
    }catch(e){
      gl.useProgram(wasProg);
      MF_MX_TELEMETRY.lastError='restore: '+String(e&&e.message||e).slice(0,140);
    }
  }
  MF_MX_TELEMETRY.frames++;
  MF_MX_TELEMETRY.drawn+=MF_MX_TELEMETRY.lastDrawn;
  MF_MX_TELEMETRY.culled+=MF_MX_TELEMETRY.lastCulled;
  MF_MX_TELEMETRY.fallbacks+=MF_MX_TELEMETRY.lastFallbacks;
  MF_MX_TELEMETRY.queued=0;
  return MF_MX_TELEMETRY.lastDrawn;
}

function macroFxGLReset(){
  for(let i=0;i<MF_MX_KIND_N;i++) mfMxTexture[i]=null;
  for(let i=0;i<MF_MX_KIND_N+1;i++) mfMxBatch[i]=null;
  mfMxUploadEpoch.fill(-1);
  mfMxPassOpen=false;
  mfMxEpoch=-1;
  MF_MX_TELEMETRY.ready=false;
  mfMxSyncTelemetry();
}

function macroFxReset(){
  mfMxN=0;
  /* resetWorld() already owns this macro reset boundary. Organic splashes use
     the same renderer but keep their own fixed pool, so leaving that pool
     alive let blood/ichor from the previous match bleed into the next map (and
     contaminated the aircraft-destruction QA scene with violet billboards).
     Keep the dependency optional for boot-order/context-loss safety. */
  if(typeof orgfxReset==='function') orgfxReset();
  for(let i=0;i<MF_MX_KIND_N+1;i++) if(mfMxBatch[i]) mfMxBatch[i].n=0;
  MF_MX_TELEMETRY.queued=0;
  MF_MX_TELEMETRY.dropped=0;
  MF_MX_TELEMETRY.frames=0;
  MF_MX_TELEMETRY.drawn=0;
  MF_MX_TELEMETRY.culled=0;
  MF_MX_TELEMETRY.fallbacks=0;
  MF_MX_TELEMETRY.lastQueued=0;
  MF_MX_TELEMETRY.lastDrawn=0;
  MF_MX_TELEMETRY.lastCulled=0;
  MF_MX_TELEMETRY.lastFallbacks=0;
  MF_MX_TELEMETRY.lastError='';
  mfMxSyncTelemetry();
}

function macroFxTelemetry(){
  mfMxSyncTelemetry();
  return MF_MX_TELEMETRY;
}

if(typeof window!=='undefined'){
  window.MF_MACROFX_BLAST=MF_MX_BLAST;
  window.MF_MACROFX_DUST=MF_MX_DUST;
  window.MF_MACROFX_WRECK=MF_MX_WRECK;
  window.MF_MACROFX_TRAIL=MF_MX_TRAIL;
  window.MF_MACROFX_ENERGY_RIBBON=MF_MX_ENERGY_RIBBON;
  window.MF_MACROFX_ENERGY_HIT=MF_MX_ENERGY_HIT;
  window.MF_MACROFX_ICHOR=MF_MX_ICHOR;
  window.MF_MACROFX_AIR_DEATH=MF_MX_AIR_DEATH;
  window.macroFxBoot=macroFxBoot;
  window.macroFxQueue=macroFxQueue;
  window.macroFxQueueRect=macroFxQueueRect;
  window.macroFxDraw=macroFxDraw;
  window.macroFxGLReset=macroFxGLReset;
  window.macroFxReset=macroFxReset;
  window.macroFxTelemetry=macroFxTelemetry;
}
})();
