/* ============================================================================
   MASSFRONT — DEPTH-AWARE CLOUD POST EFFECT (HIGH / CINEMATIC)
   ----------------------------------------------------------------------------
   mfCloudFxEmit remains the sole cloud recipe owner. This module only caches
   that frame's emitted descriptors, renders one bounded volume per cloud into
   a low-resolution target, and composites it over the resolved scene. If the
   offscreen path, driver, shader, allocation, march, or composite is not
   proven, the exact cached descriptors are returned to the existing billboard
   batch in the same frame. No persistent suppress flag exists.

   World axes used by the 3D renderer are (simulation x, height, simulation y).
   ============================================================================ */
(function mfCloudPostFxModule(){
'use strict';
if(typeof window==='undefined')return;

const MFCP_MAX_LAYERS=15,MFCP_MAX_CLOUDS=5;
const MFCP_ZERO4=new Float32Array([0,0,0,0]);
const MFCP_INV_VP=new Float32Array(16);
const MFCP_FALLBACK=new Array(MFCP_MAX_LAYERS);
const MFCP_PROXY=new Array(MFCP_MAX_CLOUDS);
for(let i=0;i<MFCP_MAX_LAYERS;i++)MFCP_FALLBACK[i]={};
for(let i=0;i<MFCP_MAX_CLOUDS;i++)MFCP_PROXY[i]={body:{},shadow:{},hasShadow:false};

let mfcpFallbackN=0,mfcpProxyN=0,mfcpPending=false,mfcpTime=0,mfcpQuality='high';
let mfcpLod=0,mfcpMap='',mfcpEpoch=-1,mfcpFailMode='';
let mfcpProg=null,mfcpProgUp=null,mfcpVAO=null,mfcpTex=null,mfcpFB=null;
let mfcpNoise=null,mfcpTexW=0,mfcpTexH=0,mfcpProgChecked=false;
let mfcpU=null,mfcpUup=null;
const MFCP_TEL={
  frames:0,armed:0,presented:0,fallbackFrames:0,fallbackLayers:0,
  tacticalFrames:0,highFrames:0,orbitalFrames:0,draws:0,marchedPx:0,
  compositePx:0,allocFailures:0,shaderFailures:0,driverFailures:0,
  glFailures:0,contextResets:0,lastQuality:'high',lastLod:'none',
  lastSteps:0,lastProxies:0,lastScale:0,lastError:''
};

function mfcpCopy(D,S){
  D.cloudId=S.cloudId|0;D.kind=S.kind;D.depth=S.depth|0;
  D.x=+S.x||0;D.y=+S.y||0;D.z=+S.z||0;D.size=+S.size||0;
  D.rotation=+S.rotation||0;D.r=S.r|0;D.g=S.g|0;D.b=S.b|0;D.a=S.a|0;
  D.altitude=+S.altitude||0;D.heightOffset=+S.heightOffset||0;
  D.blend=S.blend||'alpha';D.sprite=S.sprite||'cloud';return D;
}
function mfcpClearPending(){mfcpFallbackN=0;mfcpProxyN=0;mfcpPending=false;}
function mfcpEmitCached(emit){
  let n=0;
  if(typeof emit==='function')for(let i=0;i<mfcpFallbackN;i++){emit(MFCP_FALLBACK[i]);n++;}
  if(n){MFCP_TEL.fallbackFrames++;MFCP_TEL.fallbackLayers+=n;}
  mfcpClearPending();return n;
}
function mfcpChooseLod(span,mapId){
  span=Number.isFinite(+span)?+span:1500;mapId=String(mapId||'');
  /* Compact and Standard theatres deliberately cap phone zoom well below the
     engine's absolute 3400 span. Orbital therefore means the upper 10% of the
     CURRENT theatre's legal view, not an unreachable magic number. */
  const maxSpan=typeof spanMaxNow==='function'?Math.max(1500,spanMaxNow()):3400;
  const orbitEnter=Math.min(3100,maxSpan*.90),orbitLeave=Math.min(2800,maxSpan*.80);
  if(mapId!==mfcpMap){mfcpMap=mapId;mfcpLod=span>=orbitEnter?2:(span>=1450?1:0);}
  else if(mfcpLod===0&&span>1500)mfcpLod=1;
  else if(mfcpLod===1&&span<1300)mfcpLod=0;
  else if(mfcpLod===1&&span>orbitEnter)mfcpLod=2;
  else if(mfcpLod===2&&span<orbitLeave)mfcpLod=1;
  return mfcpLod;
}

/* PUBLIC. Calls the authoritative recipe exactly once. A false return means
   the recipe was already emitted to the supplied legacy callback (or empty). */
function mfCloudPostQueue(ctx,canPresent,emitFallback,span){
  mfcpClearPending();MFCP_TEL.frames++;MFCP_TEL.lastError='';
  const q=ctx&&ctx.quality==='cinematic'?'cinematic':(ctx&&ctx.quality==='high'?'high':'legacy');
  if(typeof window.mfCloudFxEmit!=='function')return false;
  if(!canPresent||q==='legacy'||mfcpFailMode==='queue'){
    window.mfCloudFxEmit(ctx,emitFallback);return false;
  }
  mfcpQuality=q;mfcpTime=Number.isFinite(+(ctx&&ctx.time))?+(ctx.time):0;
  mfcpChooseLod(span,ctx&&ctx.mapId);
  window.mfCloudFxEmit(ctx,function(L){
    if(mfcpFallbackN<MFCP_MAX_LAYERS)mfcpCopy(MFCP_FALLBACK[mfcpFallbackN++],L);
  });
  for(let i=0;i<mfcpFallbackN&&mfcpProxyN<MFCP_MAX_CLOUDS;i++){
    const L=MFCP_FALLBACK[i];if(L.kind!=='body'||L.depth!==1)continue;
    const P=MFCP_PROXY[mfcpProxyN++];mfcpCopy(P.body,L);P.hasShadow=false;
    for(let j=0;j<mfcpFallbackN;j++)if(MFCP_FALLBACK[j].kind==='shadow'&&MFCP_FALLBACK[j].cloudId===L.cloudId){
      mfcpCopy(P.shadow,MFCP_FALLBACK[j]);P.hasShadow=true;break;
    }
  }
  if(mfcpProxyN<=0){mfcpEmitCached(emitFallback);return false;}
  mfcpPending=true;MFCP_TEL.armed++;MFCP_TEL.lastQuality=q;return true;
}

const MFCP_VS=`#version 300 es
precision highp float;
out vec2 vUV;
void main(){
  vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
  vUV=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);
}`;

const MFCP_FS=`#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUV;out vec4 outColor;
uniform sampler2D uDepth,uNoise;
uniform mat4 uInvVP;
uniform vec3 uCenter,uRadii,uSunDir,uTint;
uniform vec2 uActiveSize;
uniform float uRotation,uTime,uOpacity,uShadowAlpha;
uniform vec3 uShadowCenter;
uniform float uShadowRadius;
uniform int uSteps;
vec3 unproject(vec2 uv,float z){vec4 p=uInvVP*vec4(uv*2.0-1.0,z,1.0);return p.xyz/max(abs(p.w),1e-6);}
float noise3(vec3 q){
  float a=texture(uNoise,q.xz*.43+vec2(uTime*.0021,uTime*.0008)).a;
  float b=texture(uNoise,q.xy*.31+vec2(-uTime*.0013,uTime*.0017)+.37).a;
  float c=texture(uNoise,q.zy*.24+vec2(uTime*.0007,-uTime*.0011)+.71).a;
  return a*.52+b*.30+c*.18;
}
void main(){
  vec2 uv=gl_FragCoord.xy/uActiveSize;
  float dep=texture(uDepth,uv).r;
  vec3 ro=unproject(uv,-1.0),rf=unproject(uv,1.0);
  vec3 rd=normalize(rf-ro),scene=unproject(uv,dep*2.0-1.0);
  float sceneT=max(0.0,dot(scene-ro,rd));

  float cr=cos(uRotation),sr=sin(uRotation);
  mat2 R=mat2(cr,-sr,sr,cr);
  vec3 O=ro-uCenter;O.xz=R*O.xz;vec3 D=rd;D.xz=R*D.xz;
  O/=uRadii;D/=uRadii;
  float A=dot(D,D),B=2.0*dot(O,D),C=dot(O,O)-1.0;
  float disc=B*B-4.0*A*C;
  vec3 acc=vec3(0.0);float alpha=0.0;
  if(disc>0.0){
    float sd=sqrt(disc),t0=(-B-sd)/(2.0*A),t1=(-B+sd)/(2.0*A);
    float enter=max(0.0,t0),leave=min(t1,sceneT);
    if(leave>enter){
      float count=float(max(uSteps,1)),stepLen=(leave-enter)/count;
      float jitter=texture(uNoise,uv*3.7+uTime*.0003).a;
      float t=enter+stepLen*(.18+.64*jitter);
      for(int i=0;i<12;i++){
        if(i>=uSteps)break;
        vec3 wp=ro+rd*t,qp=wp-uCenter;qp.xz=R*qp.xz;qp/=uRadii;
        float edge=max(0.0,1.0-dot(qp,qp));
        float billow=noise3(qp*1.9);
        float den=smoothstep(.28,.69,billow+edge*.34)*smoothstep(.01,.42,edge);
        den*=mix(.64,1.12,clamp(qp.y*.5+.5,0.0,1.0));
        float sa=(1.0-exp(-den*stepLen*.025))*uOpacity;
        float silver=pow(clamp(edge,0.0,1.0),.24);
        float top=clamp(qp.y*.5+.5,0.0,1.0);
        float sun=max(.12,uSunDir.y*.72+.22);
        vec3 shade=uTint*mix(.42,1.02,top)*mix(.72,1.12,sun);
        shade+=vec3(.13,.16,.19)*silver*(1.0-top)*.32;
        acc+=(1.0-alpha)*shade*sa;alpha+=(1.0-alpha)*sa;
        if(alpha>.965)break;t+=stepLen;
      }
    }
  }

  vec2 sq=(scene.xz-uShadowCenter.xz)/max(1.0,uShadowRadius);
  sq=R*sq;
  float sr2=dot(sq*vec2(1.0,1.42),sq*vec2(1.0,1.42));
  float sn=texture(uNoise,sq*.34+vec2(.21,.73)+uTime*.00025).a;
  float sha=smoothstep(1.0,.08,sr2)*mix(.42,1.0,sn)*uShadowAlpha;
  vec3 shCol=vec3(.045,.058,.075);
  acc+=shCol*sha*(1.0-alpha);alpha+=sha*(1.0-alpha);
  /* Weather may veil the battle but must not turn a command camera opaque. */
  if(alpha>.50){acc*=.50/alpha;alpha=.50;}
  outColor=vec4(acc,alpha);
}`;

const MFCP_UP_FS=`#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUV;out vec4 outColor;
uniform sampler2D uCloud,uDepth;
uniform vec2 uTexSize,uActiveSize;
vec4 tap(vec2 uv,vec2 off,float centerDepth,out float w){
  vec2 fullUV=clamp(uv+off/uActiveSize,vec2(0.0),vec2(1.0));
  vec2 scale=uActiveSize/uTexSize;
  vec2 cuv=clamp(fullUV*scale,vec2(.5)/uTexSize,(uActiveSize-.5)/uTexSize);
  float d=texture(uDepth,fullUV).r;
  w=exp(-abs(d-centerDepth)*3500.0);
  return texture(uCloud,cuv);
}
void main(){
  vec2 uv=gl_FragCoord.xy/uActiveSize;
  float d=texture(uDepth,uv).r;
  float w0,w1,w2,w3,w4;
  vec4 c=tap(uv,vec2(0),d,w0)*w0*2.0;
  c+=tap(uv,vec2(1,0),d,w1)*w1+tap(uv,vec2(-1,0),d,w2)*w2;
  c+=tap(uv,vec2(0,1),d,w3)*w3+tap(uv,vec2(0,-1),d,w4)*w4;
  outColor=c/max(1e-4,w0*2.0+w1+w2+w3+w4);
}`;

function mfcpDropGL(){
  mfcpProg=mfcpProgUp=mfcpVAO=mfcpTex=mfcpFB=mfcpNoise=null;
  mfcpU=mfcpUup=null;mfcpTexW=mfcpTexH=0;mfcpProgChecked=false;
}
function mfCloudPostGLReset(){mfcpDropGL();mfcpEpoch=-1;mfcpClearPending();}
function mfcpUniforms(p,names){const o={};for(const n of names)o[n]=gl.getUniformLocation(p,n);return o;}
function mfcpEnsurePrograms(){
  const ep=typeof glEpoch==='number'?glEpoch:0;
  if(ep!==mfcpEpoch){if(mfcpEpoch>=0)MFCP_TEL.contextResets++;mfcpDropGL();mfcpEpoch=ep;}
  if(!mfcpProg){
    try{
      mfcpProg=mkProg(MFCP_VS,MFCP_FS,'cloudpost-volume');
      mfcpProgUp=mkProg(MFCP_VS,MFCP_UP_FS,'cloudpost-upsample');
      mfcpVAO=gl.createVertexArray();
      mfcpU=mfcpUniforms(mfcpProg,['uDepth','uNoise','uInvVP','uCenter','uRadii','uSunDir','uTint','uActiveSize','uRotation','uTime','uOpacity','uShadowAlpha','uShadowCenter','uShadowRadius','uSteps']);
      mfcpUup=mfcpUniforms(mfcpProgUp,['uCloud','uDepth','uTexSize','uActiveSize']);
    }catch(e){MFCP_TEL.shaderFailures++;MFCP_TEL.lastError='init: '+String(e&&e.message||e);return false;}
  }
  if(!mfcpProgChecked){
    try{mfcpProgChecked=(typeof mfProgOk!=='function'||(mfProgOk(mfcpProg)&&mfProgOk(mfcpProgUp)));}
    catch(e){mfcpProgChecked=false;}
    if(!mfcpProgChecked){MFCP_TEL.shaderFailures++;MFCP_TEL.lastError='shader validation failed';return false;}
  }
  if(!mfcpNoise){
    try{mfcpNoise=typeof mfNoiseUpload==='function'?mfNoiseUpload('smoke',{size:256,seed:0x434c4f55}):null;}catch(e){mfcpNoise=null;}
    if(!mfcpNoise){MFCP_TEL.driverFailures++;MFCP_TEL.lastError='smoke driver unavailable';return false;}
  }
  return !!mfcpVAO;
}
function mfcpEnsureTarget(w,h){
  if(mfcpFailMode==='alloc')return false;
  if(mfcpTex&&mfcpFB&&mfcpTexW===w&&mfcpTexH===h)return true;
  if(mfcpFB){gl.bindFramebuffer(gl.FRAMEBUFFER,mfcpFB);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,null,0);}
  if(mfcpTex)gl.deleteTexture(mfcpTex);
  mfcpTex=gl.createTexture();gl.activeTexture(gl.TEXTURE13);gl.bindTexture(gl.TEXTURE_2D,mfcpTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  if(!mfcpFB)mfcpFB=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,mfcpFB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,mfcpTex,0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  const ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
  if(ok){mfcpTexW=w;mfcpTexH=h;return true;}
  MFCP_TEL.allocFailures++;MFCP_TEL.lastError='cloud target incomplete';return false;
}
function mfcpProject(x,y,z){
  const w=matVP[3]*x+matVP[7]*y+matVP[11]*z+matVP[15];if(Math.abs(w)<1e-6)return null;
  return [((matVP[0]*x+matVP[4]*y+matVP[8]*z+matVP[12])/w*.5+.5)*aoW,
          ((matVP[1]*x+matVP[5]*y+matVP[9]*z+matVP[13])/w*.5+.5)*aoH];
}
function mfcpBounds(P){
  let x0=aoW,y0=aoH,x1=0,y1=0,hit=0;const B=P.body,rx=B.size*.50,ry=Math.max(28,B.size*.105),rz=B.size*.34;
  for(let ix=-1;ix<=1;ix+=2)for(let iy=-1;iy<=1;iy+=2)for(let iz=-1;iz<=1;iz+=2){
    const p=mfcpProject(B.x+ix*rx,B.z+iy*ry,B.y+iz*rz);if(!p)continue;
    x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);hit++;
  }
  if(P.hasShadow){const S=P.shadow,r=S.size*.55;for(const q of [[-r,0],[r,0],[0,-r],[0,r]]){
    const p=mfcpProject(S.x+q[0],S.z,S.y+q[1]);if(!p)continue;
    x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);hit++;
  }}
  if(!hit)return null;return [Math.max(0,Math.floor(x0)-4),Math.max(0,Math.floor(y0)-4),Math.min(aoW,Math.ceil(x1)+4),Math.min(aoH,Math.ceil(y1)+4)];
}

function mfCloudPostDrawPending(Sun){
  if(!mfcpPending)return false;
  if(typeof gl==='undefined'||!gl||typeof aoW!=='number'||typeof aoH!=='number'||!aoFB2||!aoDepth||!matVP||typeof m4invert!=='function')return false;
  const lod=mfcpLod,div=lod===0?2:4,maxN=lod===0?2:(lod===1?3:5);
  const steps=mfcpQuality==='cinematic'?(lod===0?12:(lod===1?8:6)):(lod===0?8:(lod===1?6:4));
  const activeW=Math.max(1,Math.ceil(aoW/div)),activeH=Math.max(1,Math.ceil(aoH/div));
  const texW=Math.max(1,Math.ceil(aoW/2)),texH=Math.max(1,Math.ceil(aoH/2));
  MFCP_TEL.lastLod=lod===0?'tactical':(lod===1?'high':'orbital');MFCP_TEL.lastSteps=steps;
  MFCP_TEL.lastScale=1/div;MFCP_TEL.lastProxies=Math.min(mfcpProxyN,maxN);
  if(lod===0)MFCP_TEL.tacticalFrames++;else if(lod===1)MFCP_TEL.highFrames++;else MFCP_TEL.orbitalFrames++;

  const wasProg=gl.getParameter(gl.CURRENT_PROGRAM),wasVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING),wasArr=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  const wasRead=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),wasDraw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
  const wasVP=gl.getParameter(gl.VIEWPORT),wasScBox=gl.getParameter(gl.SCISSOR_BOX),wasScissor=gl.isEnabled(gl.SCISSOR_TEST);
  const wasActive=gl.getParameter(gl.ACTIVE_TEXTURE),wasBlend=gl.isEnabled(gl.BLEND),wasCull=gl.isEnabled(gl.CULL_FACE),wasDepth=gl.isEnabled(gl.DEPTH_TEST);
  const wasMask=gl.getParameter(gl.DEPTH_WRITEMASK),wasDepthFn=gl.getParameter(gl.DEPTH_FUNC),wasCullMode=gl.getParameter(gl.CULL_FACE_MODE),wasFront=gl.getParameter(gl.FRONT_FACE);
  const wasSrcRGB=gl.getParameter(gl.BLEND_SRC_RGB),wasDstRGB=gl.getParameter(gl.BLEND_DST_RGB),wasSrcA=gl.getParameter(gl.BLEND_SRC_ALPHA),wasDstA=gl.getParameter(gl.BLEND_DST_ALPHA);
  const wasEqRGB=gl.getParameter(gl.BLEND_EQUATION_RGB),wasEqA=gl.getParameter(gl.BLEND_EQUATION_ALPHA),wasColor=gl.getParameter(gl.COLOR_WRITEMASK);
  const savedTex=[];for(const u of [4,12,13]){gl.activeTexture(gl.TEXTURE0+u);savedTex.push(gl.getParameter(gl.TEXTURE_BINDING_2D));}gl.activeTexture(wasActive);
  gl.getError();let ok=false,depthDetached=false,draws=0,compX0=aoW,compY0=aoH,compX1=0,compY1=0;
  try{
    if(!mfcpEnsurePrograms()||!mfcpEnsureTarget(texW,texH)||mfcpFailMode==='march')return false;
    if(!m4invert(MFCP_INV_VP,matVP))throw new Error('inverse VP failed');
    gl.bindFramebuffer(gl.FRAMEBUFFER,mfcpFB);gl.viewport(0,0,texW,texH);gl.disable(gl.SCISSOR_TEST);gl.clearBufferfv(gl.COLOR,0,MFCP_ZERO4);
    gl.viewport(0,0,activeW,activeH);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.colorMask(true,true,true,true);
    gl.useProgram(mfcpProg);gl.bindVertexArray(mfcpVAO);
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,aoDepth);gl.uniform1i(mfcpU.uDepth,4);
    gl.activeTexture(gl.TEXTURE12);gl.bindTexture(gl.TEXTURE_2D,mfcpNoise);gl.uniform1i(mfcpU.uNoise,12);
    gl.uniformMatrix4fv(mfcpU.uInvVP,false,MFCP_INV_VP);gl.uniform2f(mfcpU.uActiveSize,activeW,activeH);gl.uniform1f(mfcpU.uTime,mfcpTime);gl.uniform1i(mfcpU.uSteps,steps);
    const sd=Sun&&Sun.dir?Sun.dir:[.42,.78,.30];gl.uniform3f(mfcpU.uSunDir,sd[0],sd[1],sd[2]);
    for(let i=0;i<Math.min(mfcpProxyN,maxN);i++){
      const P=MFCP_PROXY[i],B=P.body,S=P.hasShadow?P.shadow:B,bd=mfcpBounds(P);if(!bd||bd[2]<=bd[0]||bd[3]<=bd[1])continue;
      compX0=Math.min(compX0,bd[0]);compY0=Math.min(compY0,bd[1]);compX1=Math.max(compX1,bd[2]);compY1=Math.max(compY1,bd[3]);
      const sx=Math.max(0,Math.floor(bd[0]/div)-2),sy=Math.max(0,Math.floor(bd[1]/div)-2),ex=Math.min(activeW,Math.ceil(bd[2]/div)+2),ey=Math.min(activeH,Math.ceil(bd[3]/div)+2);
      if(ex<=sx||ey<=sy)continue;gl.enable(gl.SCISSOR_TEST);gl.scissor(sx,sy,ex-sx,ey-sy);
      gl.uniform3f(mfcpU.uCenter,B.x,B.z,B.y);gl.uniform3f(mfcpU.uRadii,B.size*.50,Math.max(28,B.size*.105),B.size*.34);
      gl.uniform1f(mfcpU.uRotation,-B.rotation);gl.uniform3f(mfcpU.uTint,Math.min(.88,B.r/255*.92),Math.min(.91,B.g/255*.92),Math.min(.96,B.b/255*.94));
      /* The recipe's authored alpha still owns daylight/quality intensity;
         the post path only translates that descriptor into optical density. */
      gl.uniform1f(mfcpU.uOpacity,(mfcpQuality==='cinematic'?.43:.36)*Math.max(.35,Math.min(1.1,B.a/29)));
      gl.uniform3f(mfcpU.uShadowCenter,S.x,S.z,S.y);gl.uniform1f(mfcpU.uShadowRadius,P.hasShadow?S.size*.53:1);
      gl.uniform1f(mfcpU.uShadowAlpha,P.hasShadow?Math.min(.18,S.a/255*1.22):0);
      gl.drawArrays(gl.TRIANGLES,0,3);draws++;
    }
    if(draws<=0||compX1<=compX0||compY1<=compY0)throw new Error('no visible cloud proxy');
    if(mfcpFailMode==='composite')return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER,aoFB2);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,null,0);depthDetached=true;
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('scene target incomplete after depth detach');
    gl.viewport(0,0,aoW,aoH);gl.enable(gl.SCISSOR_TEST);
    const pad=8,cx=Math.max(0,compX0-pad),cy=Math.max(0,compY0-pad),cex=Math.min(aoW,compX1+pad),cey=Math.min(aoH,compY1+pad);
    gl.scissor(cx,cy,cex-cx,cey-cy);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(mfcpProgUp);gl.bindVertexArray(mfcpVAO);
    gl.activeTexture(gl.TEXTURE13);gl.bindTexture(gl.TEXTURE_2D,mfcpTex);gl.uniform1i(mfcpUup.uCloud,13);
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,aoDepth);gl.uniform1i(mfcpUup.uDepth,4);
    gl.uniform2f(mfcpUup.uTexSize,texW,texH);gl.uniform2f(mfcpUup.uActiveSize,activeW,activeH);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,aoDepth,0);depthDetached=false;
    ok=!!mfcpProg&&!!mfcpProgUp&&!!mfcpVAO&&!!mfcpNoise&&!!mfcpTex&&!!mfcpFB&&gl.getError()===gl.NO_ERROR;
    if(ok){MFCP_TEL.presented++;MFCP_TEL.draws+=draws;MFCP_TEL.marchedPx+=activeW*activeH;MFCP_TEL.compositePx+=(cex-cx)*(cey-cy);mfcpClearPending();}
    else{MFCP_TEL.glFailures++;MFCP_TEL.lastError='draw produced GL error';}
  }catch(e){MFCP_TEL.glFailures++;MFCP_TEL.lastError='draw: '+String(e&&e.message||e).slice(0,180);ok=false;}
  finally{
    try{gl.bindFramebuffer(gl.FRAMEBUFFER,aoFB2);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,aoDepth,0);}catch(_){depthDetached=false;}
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,wasRead);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,wasDraw);
    gl.viewport(wasVP[0],wasVP[1],wasVP[2],wasVP[3]);gl.scissor(wasScBox[0],wasScBox[1],wasScBox[2],wasScBox[3]);if(wasScissor)gl.enable(gl.SCISSOR_TEST);else gl.disable(gl.SCISSOR_TEST);
    for(let i=0;i<3;i++){gl.activeTexture(gl.TEXTURE0+[4,12,13][i]);gl.bindTexture(gl.TEXTURE_2D,savedTex[i]);}gl.activeTexture(wasActive);
    gl.bindVertexArray(wasVAO);gl.bindBuffer(gl.ARRAY_BUFFER,wasArr);gl.useProgram(wasProg);gl.cullFace(wasCullMode);gl.frontFace(wasFront);gl.depthFunc(wasDepthFn);
    gl.blendFuncSeparate(wasSrcRGB,wasDstRGB,wasSrcA,wasDstA);gl.blendEquationSeparate(wasEqRGB,wasEqA);
    if(wasDepth)gl.enable(gl.DEPTH_TEST);else gl.disable(gl.DEPTH_TEST);if(wasCull)gl.enable(gl.CULL_FACE);else gl.disable(gl.CULL_FACE);if(wasBlend)gl.enable(gl.BLEND);else gl.disable(gl.BLEND);
    gl.depthMask(wasMask);gl.colorMask(wasColor[0],wasColor[1],wasColor[2],wasColor[3]);
  }
  return ok;
}

function mfCloudPostEmitFallback(emit){return mfcpEmitCached(emit);}
function mfCloudPostProbe(reset){
  const out=Object.assign({},MFCP_TEL,{pending:mfcpPending,fallbackCached:mfcpFallbackN,proxyCached:mfcpProxyN,failMode:mfcpFailMode,epoch:mfcpEpoch});
  if(reset)for(const k in MFCP_TEL)MFCP_TEL[k]=typeof MFCP_TEL[k]==='string'?'':0;
  return out;
}
function mfCloudPostSetFail(mode){mfcpFailMode=String(mode||'');return mfcpFailMode;}

window.mfCloudPostQueue=mfCloudPostQueue;
window.mfCloudPostDrawPending=mfCloudPostDrawPending;
window.mfCloudPostEmitFallback=mfCloudPostEmitFallback;
window.mfCloudPostGLReset=mfCloudPostGLReset;
window.mfCloudPostProbe=mfCloudPostProbe;
window.MFCloudPost={queue:mfCloudPostQueue,draw:mfCloudPostDrawPending,fallback:mfCloudPostEmitFallback,probe:mfCloudPostProbe,reset:mfCloudPostGLReset,setFail:mfCloudPostSetFail};
})();
