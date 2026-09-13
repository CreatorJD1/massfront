/* ============================================================================
   MASSFRONT — WORLD-SPACE ORDNANCE TRAJECTORY STRIPS
   ----------------------------------------------------------------------------
   A dedicated WebGL2 renderer for artillery flight. This is intentionally not
   a stretched billboard or a render-loop particle emitter: each projectile
   submits a bounded, sampled portion of its real deterministic ballistic arc.
   One dynamic mesh batch draws every energy and hot-shell strip in one call.
   ============================================================================ */
const MF_ORD_TRAIL_SHELL=1,MF_ORD_TRAIL_ENERGY=2,MF_ORD_TRAIL_ORGANIC=3;
const MF_ORD_TRAIL_STRIDE=14,MF_ORD_TRAIL_VERT_CAP=65536;
const MF_ORD_TRAIL_DRIVER_ASSET='assets/textures/vfx/mf-ordnance-trail-drivers-v1.png';
const MF_ORD_TRAIL_TELEM={energy:0,shell:0,organic:0,segments:0,instances:0,
  vertices:0,drawCalls:0,smokeRibbons:0,smokeVertices:0,projectedPxMax:0,shaderReady:false,
  driverReady:false,driverState:'idle',driverAsset:MF_ORD_TRAIL_DRIVER_ASSET,lastError:''};
const mfOrdVerts=new Float32Array(MF_ORD_TRAIL_VERT_CAP*MF_ORD_TRAIL_STRIDE);
const mfOrdPath=new Float32Array(24*3);
const mfOrdDist=new Float32Array(24);
const _mfOrdPoint=[0,0,0],_mfOrdPrev=[0,0,0],_mfOrdA=[0,0,0],_mfOrdB=[0,0,0],_mfOrdDA=[0,0,0],_mfOrdDB=[0,0,0];
const _mfOrdGlow=[0,0,0];
let mfOrdVertCount=0,mfOrdSmokeStart=-1,mfOrdSmokeCount=0,mfOrdProg=null,mfOrdVao=null,mfOrdVbo=null,mfOrdEpoch=-1,mfOrdFailed=false;
let mfOrdUVP=null,mfOrdUView=null,mfOrdUTime=null,mfOrdUDriver=null,mfOrdUDriverReady=null;
let mfOrdDriverImage=null,mfOrdDriverState=0,mfOrdDriverTex=null,mfOrdDriverEpoch=-1;
/* High/Cinematic receives at most eight true curve-history volumes. The Map is
   keyed by the simulation projectile slot and is only mutated by projTick /
   killProj; the renderer merely reads whether the volume owns presentation. */
const mfOrdVolRows=new Map();

const MF_ORD_TRAIL_VS=`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aDir;
layout(location=2) in vec4 aShape;
layout(location=3) in vec4 aColor;
uniform mat4 uVP; uniform vec2 uViewport;
out vec4 vShape; out vec4 vColor;
void main(){
  vec4 p=uVP*vec4(aPos,1.0), q=uVP*vec4(aPos+aDir,1.0);
  vec2 pn=p.xy/max(abs(p.w),0.00001), qn=q.xy/max(abs(q.w),0.00001);
  vec2 tangent=(qn-pn)*uViewport;
  float tl=max(length(tangent),0.001);
  vec2 normal=vec2(-tangent.y,tangent.x)/tl;
  p.xy+=normal*aShape.x*aShape.y*2.0/uViewport*p.w;
  p.z-=0.00018*p.w;
  gl_Position=p;vShape=aShape;vColor=aColor;
}`;
const MF_ORD_TRAIL_FS=`#version 300 es
precision highp float;
in vec4 vShape; in vec4 vColor; uniform float uTime; uniform sampler2D uDriver; uniform float uDriverReady; out vec4 o;
float trailHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float trailNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(trailHash(i),trailHash(i+vec2(1,0)),f.x),mix(trailHash(i+vec2(0,1)),trailHash(i+vec2(1)),f.x),f.y);
}
float trailFbm(vec2 p){float v=0.0,a=0.56;for(int i=0;i<3;i++){v+=a*trailNoise(p);p=p*2.03+vec2(17.3,9.2);a*=0.48;}return v;}
void main(){
  float kind=floor(vShape.w+0.0001),distanceUV=fract(vShape.w)*2048.0;
  float driverEnergy=step(6.5,kind)*step(kind,7.5);
  float driverShell=step(7.5,kind)*step(kind,9.5);
  float driverLayer=max(driverEnergy,driverShell);
  if(driverLayer>0.5&&uDriverReady>0.5){
    float shellFire=step(8.5,kind);
    float plateU=mix(vShape.z,mix(0.58,1.0,vShape.z),shellFire);
    float row=mix(0.25,0.75,driverShell);
    vec4 plate=texture(uDriver,vec2(clamp(plateU,0.008,0.992),row+vShape.x*0.235));
    vec3 rgb=plate.rgb;
    if(driverEnergy>0.5){
      float peak=max(max(rgb.r,rgb.g),rgb.b);
      vec3 faction=peak*(vec3(0.18)+vColor.rgb*1.08);
      float whiteCore=smoothstep(0.76,1.0,min(min(rgb.r,rgb.g),rgb.b));
      rgb=mix(rgb,faction,0.62*(1.0-whiteCore));
    }
    float fade=smoothstep(0.0,0.055,vShape.z);
    float alpha=plate.a*vColor.a*fade;
    if(alpha<0.003)discard;
    o=vec4(rgb,alpha);return;
  }
  float headCap=step(3.5,kind)*step(kind,4.5);
  float smoke=step(4.5,kind)*step(kind,5.5);
  float halo=step(5.5,kind);
  float stripEdge=pow(max(0.0,1.0-abs(vShape.x)),0.72);
  float capEdge=1.0-smoothstep(0.60,1.0,length(vec2(vShape.x*1.18,vShape.z*1.22-0.22)));
  float smokeNoise=trailFbm(vec2(distanceUV*0.031-uTime*0.11,vShape.x*1.28+uTime*0.027));
  float smokeFine=trailFbm(vec2(distanceUV*0.092+uTime*0.043,vShape.x*3.1-uTime*0.019));
  float smokeEdge=1.0-smoothstep(0.38+smokeNoise*0.42,1.0,abs(vShape.x));
  float edge=mix(mix(stripEdge,capEdge,headCap),smokeEdge,smoke);
  float tail=mix(smoothstep(0.0,0.14,vShape.z),1.0,headCap);
  tail=mix(tail,smoothstep(0.0,0.08,vShape.z)*(1.0-smoothstep(0.94,1.0,vShape.z)),smoke);
  float energy=max(step(1.5,kind)*(1.0-step(4.5,kind)),halo);
  float core=step(2.5,kind)*(1.0-step(4.5,kind));
  float plasma=trailFbm(vec2(distanceUV*0.043-uTime*1.74,vShape.x*1.54+uTime*0.12));
  float plasmaFine=trailFbm(vec2(distanceUV*0.117+uTime*0.71,vShape.x*3.6-uTime*0.23));
  float pulse=0.5+0.5*sin(distanceUV*0.135-uTime*17.0+plasmaFine*4.2);
  float sheath=0.28+0.83*smoothstep(0.24,0.88,plasma)*mix(0.72,1.18,pulse);
  float turbulentEdge=1.0-smoothstep(0.33+plasma*0.38,1.0,abs(vShape.x));
  edge=mix(edge,turbulentEdge,energy*(1.0-core)*(1.0-headCap));
  float head=1.0+mix(0.12,0.46,core)*smoothstep(0.70,1.0,vShape.z);
  float smokeDensity=(0.46+0.60*smokeNoise)*(0.62+0.52*smokeFine);
  float alpha=vColor.a*edge*tail*mix(1.0,sheath,energy)*mix(1.0,smokeDensity,smoke);
  alpha*=mix(1.0,0.64+0.36*plasma,halo);
  vec3 rgb=mix(vColor.rgb,mix(vColor.rgb,vec3(1.0),0.62),core)*head;
  rgb*=mix(1.0,0.70+0.66*plasma+0.16*pulse,energy*(1.0-core));
  float roundSection=sqrt(max(0.0,1.0-vShape.x*vShape.x));
  float sootLight=0.64+0.38*smokeNoise+0.24*roundSection-0.10*vShape.x;
  vec3 smokeRgb=vColor.rgb*sootLight;
  float hotSoot=smoothstep(0.70,1.0,vShape.z)*smoothstep(0.58,0.18,smokeFine);
  smokeRgb=mix(smokeRgb,vec3(0.72,0.24,0.055),hotSoot*0.34);
  rgb=mix(rgb,smokeRgb,smoke);
  o=vec4(rgb,alpha);
}`;

function mfOrdnanceTrailGLReset(){
  mfOrdProg=mfOrdVao=mfOrdVbo=null;mfOrdUVP=mfOrdUView=mfOrdUTime=mfOrdUDriver=mfOrdUDriverReady=null;
  mfOrdDriverTex=null;mfOrdDriverEpoch=-1;mfOrdEpoch=-1;mfOrdFailed=false;mfOrdVertCount=0;
  MF_ORD_TRAIL_TELEM.shaderReady=false;MF_ORD_TRAIL_TELEM.driverReady=false;
}
function mfOrdDriverRequest(){
  if(mfOrdDriverState||typeof Image==='undefined')return;
  mfOrdDriverState=1;MF_ORD_TRAIL_TELEM.driverState='loading';
  const im=new Image();mfOrdDriverImage=im;im.decoding='async';
  im.onload=function(){
    const w=im.naturalWidth|0,h=im.naturalHeight|0;
    if(w!==2048||h!==1024){mfOrdDriverState=3;MF_ORD_TRAIL_TELEM.driverState='invalid';MF_ORD_TRAIL_TELEM.lastError='invalid ordnance driver '+w+'x'+h;return;}
    mfOrdDriverState=2;MF_ORD_TRAIL_TELEM.driverState='decoded';mfOrdDriverUpload();
  };
  im.onerror=function(){mfOrdDriverState=3;MF_ORD_TRAIL_TELEM.driverState='failed';MF_ORD_TRAIL_TELEM.lastError='load '+MF_ORD_TRAIL_DRIVER_ASSET;};
  im.src=MF_ORD_TRAIL_DRIVER_ASSET;
}
function mfOrdDriverUpload(){
  if(mfOrdDriverTex||mfOrdDriverState!==2||typeof gl==='undefined'||!gl)return !!mfOrdDriverTex;
  const ep=typeof glEpoch==='number'?glEpoch:0;if(mfOrdDriverEpoch===ep)return false;mfOrdDriverEpoch=ep;
  const wasActive=gl.getParameter(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE3);const wasTex=gl.getParameter(gl.TEXTURE_BINDING_2D);
  const wasAlign=gl.getParameter(gl.UNPACK_ALIGNMENT),wasFlip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),wasPremul=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
  let tex=null;
  try{
    tex=gl.createTexture();if(!tex)throw new Error('createTexture returned null');gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,mfOrdDriverImage);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    mfOrdDriverTex=tex;MF_ORD_TRAIL_TELEM.driverReady=true;MF_ORD_TRAIL_TELEM.driverState='ready';return true;
  }catch(e){if(tex)try{gl.deleteTexture(tex);}catch(_){}MF_ORD_TRAIL_TELEM.driverState='upload-failed';MF_ORD_TRAIL_TELEM.lastError=String(e&&e.message||e);return false;}
  finally{gl.pixelStorei(gl.UNPACK_ALIGNMENT,wasAlign);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,wasFlip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,wasPremul);gl.bindTexture(gl.TEXTURE_2D,wasTex);gl.activeTexture(wasActive);}
}
function mfOrdnanceTrailDriverTexture(){mfOrdInit();return mfOrdDriverTex;}
function mfOrdBuildShader(type,src){
  const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);
  if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh)||'ordnance shader compile failed');
  return sh;
}
function mfOrdInit(){
  if(typeof gl==='undefined'||!gl)return false;
  const ep=typeof glEpoch==='number'?glEpoch:0;
  if(mfOrdEpoch!==ep)mfOrdnanceTrailGLReset();
  mfOrdDriverRequest();if(mfOrdProg){mfOrdDriverUpload();return true;}if(mfOrdFailed)return false;
  try{
    const wasV=gl.getParameter(gl.VERTEX_ARRAY_BINDING),wasB=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    const vs=mfOrdBuildShader(gl.VERTEX_SHADER,MF_ORD_TRAIL_VS),fs=mfOrdBuildShader(gl.FRAGMENT_SHADER,MF_ORD_TRAIL_FS);
    const p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'ordnance program link failed');
    gl.deleteShader(vs);gl.deleteShader(fs);mfOrdProg=p;
    mfOrdUVP=gl.getUniformLocation(p,'uVP');mfOrdUView=gl.getUniformLocation(p,'uViewport');mfOrdUTime=gl.getUniformLocation(p,'uTime');
    mfOrdUDriver=gl.getUniformLocation(p,'uDriver');mfOrdUDriverReady=gl.getUniformLocation(p,'uDriverReady');
    mfOrdVao=gl.createVertexArray();mfOrdVbo=gl.createBuffer();gl.bindVertexArray(mfOrdVao);gl.bindBuffer(gl.ARRAY_BUFFER,mfOrdVbo);
    gl.bufferData(gl.ARRAY_BUFFER,mfOrdVerts.byteLength,gl.DYNAMIC_DRAW);
    const stride=MF_ORD_TRAIL_STRIDE*4;
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,stride,0);
    gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,stride,12);
    gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,4,gl.FLOAT,false,stride,24);
    gl.enableVertexAttribArray(3);gl.vertexAttribPointer(3,4,gl.FLOAT,false,stride,40);
    gl.bindVertexArray(wasV);gl.bindBuffer(gl.ARRAY_BUFFER,wasB);
    mfOrdEpoch=ep;mfOrdDriverUpload();MF_ORD_TRAIL_TELEM.shaderReady=true;MF_ORD_TRAIL_TELEM.lastError='';return true;
  }catch(e){mfOrdFailed=true;MF_ORD_TRAIL_TELEM.lastError=String(e&&e.message||e);console.error('ordnance trail renderer',e);return false;}
}
function mfOrdnanceTrailResetTelemetry(){
  mfOrdVertCount=0;mfOrdSmokeStart=-1;mfOrdSmokeCount=0;
  MF_ORD_TRAIL_TELEM.energy=0;MF_ORD_TRAIL_TELEM.shell=0;MF_ORD_TRAIL_TELEM.organic=0;
  MF_ORD_TRAIL_TELEM.segments=0;MF_ORD_TRAIL_TELEM.instances=0;MF_ORD_TRAIL_TELEM.vertices=0;
  MF_ORD_TRAIL_TELEM.drawCalls=0;MF_ORD_TRAIL_TELEM.smokeRibbons=0;MF_ORD_TRAIL_TELEM.smokeVertices=0;
  MF_ORD_TRAIL_TELEM.projectedPxMax=0;
}
const mfOrdVolOpts=new Map();
function mfOrdnanceTrailSimBegin(i,kind,team,seed,opts){
  const keyId=typeof i==='string'?i:(i|0);if(mfOrdVolRows.has(keyId))return mfOrdVolRows.get(keyId);
  if(typeof volStepCeiling!=='function'||volStepCeiling()<24||
     typeof volFxTrailHistoryBegin!=='function')return -1;
  const key=typeof mfFactionFromTeam==='function'?mfFactionFromTeam(team):'legion';
  const style=typeof mfEnergyArtilleryStyle==='function'?mfEnergyArtilleryStyle(key):null;
  const o=opts||{},tint=o.tint||(style&&style.glow)||(kind===MF_ORD_TRAIL_ENERGY?[96,220,255]:[255,118,38]);
  const numericSeed=Number.isFinite(seed)?seed*63.999:
    (typeof keyId==='number'?(keyId*13.7)%64:(String(keyId).length*7.13)%64);
  /* Runtime ordnance codes are 1=energy / 2=shell; volfx's stable curve
     profiles are 7/8. Passing 2 through directly made every real missile and
     shell select the energy density branch even though synthetic profile
     probes (which supplied 8) looked correct. Translate once at this owner. */
  const volumeKind=kind===MF_ORD_TRAIL_SHELL?8:7;
  const row=volFxTrailHistoryBegin(volumeKind,{tint,seed:numericSeed});
  if(row>=0){mfOrdVolRows.set(keyId,row);mfOrdVolOpts.set(keyId,o);}return row;
}
function mfOrdnanceTrailSimSample(i,x,y,worldY,stamp,kind,team,seed,opts){
  const keyId=typeof i==='string'?i:(i|0);let row=mfOrdVolRows.get(keyId);
  if(row===undefined){row=mfOrdnanceTrailSimBegin(keyId,kind,team,seed,opts);if(row<0)return false;}
  if(!volFxTrailHistoryPush(row,x,y,worldY,stamp))return false;
  const o=opts||mfOrdVolOpts.get(keyId)||{};
  return volFxTrailHistoryEmit(row,{life:o.life||.28,age:0,dens:o.dens,emis:o.emis})>=0;
}
function mfOrdnanceTrailSimStop(i,fade){
  const keyId=typeof i==='string'?i:(i|0),row=mfOrdVolRows.get(keyId);if(row===undefined)return false;
  mfOrdVolRows.delete(keyId);mfOrdVolOpts.delete(keyId);
  return typeof volFxTrailHistoryRelease==='function'?volFxTrailHistoryRelease(row,fade):false;
}
function mfOrdnanceTrailVolActive(i){return mfOrdVolRows.has(typeof i==='string'?i:(i|0));}
function mfOrdnanceTrailSimReset(){
  for(const row of mfOrdVolRows.values())if(typeof volFxTrailHistoryRelease==='function')volFxTrailHistoryRelease(row,.04);
  mfOrdVolRows.clear();mfOrdVolOpts.clear();if(typeof volFxTrailHistoryReset==='function')volFxTrailHistoryReset();
}
function mfOrdnanceTrailCode(team,bio){
  if(bio)return MF_ORD_TRAIL_ORGANIC;
  const key=typeof mfFactionFromTeam==='function'?mfFactionFromTeam(team):'legion';
  const style=typeof mfEnergyArtilleryStyle==='function'?mfEnergyArtilleryStyle(key):null;
  return style&&style.kind==='energy'?MF_ORD_TRAIL_ENERGY:style&&style.kind==='organic'?MF_ORD_TRAIL_ORGANIC:MF_ORD_TRAIL_SHELL;
}
function mfOrdnanceBallisticPoint(i,q,out){
  q=Math.max(0,Math.min(1,q));out=out||[0,0,0];
  out[0]=psx[i]+(pex[i]-psx[i])*q;out[2]=psy[i]+(pey[i]-psy[i])*q;
  out[1]=pz0[i]+(pz1[i]-pz0[i])*q+16+Math.sin(q*Math.PI)*(pArc[i]||70);return out;
}
function mfOrdPutVertex(p,dx,dh,dy,side,width,along,kind,r,g,b,a,distance){
  if(mfOrdVertCount>=MF_ORD_TRAIL_VERT_CAP)return false;let o=mfOrdVertCount++*MF_ORD_TRAIL_STRIDE;
  mfOrdVerts[o++]=p[0];mfOrdVerts[o++]=p[1];mfOrdVerts[o++]=p[2];mfOrdVerts[o++]=dx;mfOrdVerts[o++]=dh;mfOrdVerts[o++]=dy;
  const du=Math.max(0,Math.min(2047,Number.isFinite(distance)?distance:along*128));
  mfOrdVerts[o++]=side;mfOrdVerts[o++]=width;mfOrdVerts[o++]=along;mfOrdVerts[o++]=kind+du/2048;
  mfOrdVerts[o++]=r/255;mfOrdVerts[o++]=g/255;mfOrdVerts[o++]=b/255;mfOrdVerts[o++]=a;return true;
}
function mfOrdEmitSegment(a,b,width,along0,along1,kind,color,alpha,dirA,dirB,dist0,dist1){
  if(mfOrdVertCount+6>MF_ORD_TRAIL_VERT_CAP)return false;
  const dx=b[0]-a[0],dh=b[1]-a[1],dy=b[2]-a[2],da=dirA||[dx,dh,dy],db=dirB||da,r=color[0],g=color[1],bl=color[2];
  mfOrdPutVertex(a,da[0],da[1],da[2],-1,width,along0,kind,r,g,bl,alpha,dist0);mfOrdPutVertex(a,da[0],da[1],da[2],1,width,along0,kind,r,g,bl,alpha,dist0);
  mfOrdPutVertex(b,db[0],db[1],db[2],1,width,along1,kind,r,g,bl,alpha,dist1);mfOrdPutVertex(a,da[0],da[1],da[2],-1,width,along0,kind,r,g,bl,alpha,dist0);
  mfOrdPutVertex(b,db[0],db[1],db[2],1,width,along1,kind,r,g,bl,alpha,dist1);mfOrdPutVertex(b,db[0],db[1],db[2],-1,width,along1,kind,r,g,bl,alpha,dist1);return true;
}
/* Generic fixed-step polyline submission used by aircraft propulsion. Points
   are packed world X/height/Y, oldest first. It reuses the ordnance batch's
   camera-facing cross section and real depth, so a top-down camera sees a
   continuous path instead of a height-only vertical card. */
function mfOrdnanceTrailQueuePath(points,count,outerW,innerW,color,alpha){
  count=Math.max(0,Math.min(24,count|0));if(count<2||mfOrdVertCount+((count-1)*12)>MF_ORD_TRAIL_VERT_CAP)return false;
  let distance=0;_mfOrdGlow[0]=Math.min(255,color[0]+42);_mfOrdGlow[1]=Math.min(255,color[1]+34);_mfOrdGlow[2]=Math.min(255,color[2]+22);
  for(let k=0;k<count-1;k++){
    const a=k*3,b=(k+1)*3,pa=Math.max(0,k-1)*3,nb=Math.min(count-1,k+2)*3;
    _mfOrdA[0]=points[a];_mfOrdA[1]=points[a+1];_mfOrdA[2]=points[a+2];
    _mfOrdB[0]=points[b];_mfOrdB[1]=points[b+1];_mfOrdB[2]=points[b+2];
    _mfOrdDA[0]=points[b]-points[pa];_mfOrdDA[1]=points[b+1]-points[pa+1];_mfOrdDA[2]=points[b+2]-points[pa+2];
    _mfOrdDB[0]=points[nb]-points[a];_mfOrdDB[1]=points[nb+1]-points[a+1];_mfOrdDB[2]=points[nb+2]-points[a+2];
    const seg=Math.hypot(_mfOrdB[0]-_mfOrdA[0],_mfOrdB[1]-_mfOrdA[1],_mfOrdB[2]-_mfOrdA[2]);
    if(seg<.04)continue;
    const u0=k/(count-1),u1=(k+1)/(count-1),next=distance+seg;
    /* Old samples narrow as their energy disperses; the newest segment keeps
       the authored nozzle diameter. Alpha already fades longitudinally in the
       shader, so this is shape taper rather than an opaque pointed cone. */
    const taper=.30+.70*Math.pow(u1,.62);
    mfOrdEmitSegment(_mfOrdA,_mfOrdB,outerW*taper,u0,u1,6,color,alpha,_mfOrdDA,_mfOrdDB,distance,next);
    mfOrdEmitSegment(_mfOrdA,_mfOrdB,innerW*taper,u0,u1,2,_mfOrdGlow,Math.min(.78,alpha*1.28),_mfOrdDA,_mfOrdDB,distance,next);
    distance=next;
  }
  if(distance<=.04)return false;
  MF_ORD_TRAIL_TELEM.instances++;MF_ORD_TRAIL_TELEM.segments+=count-1;
  return true;
}
function mfOrdProjected(i,q0,q1){
  if(typeof w2s!=='function')return 0;mfOrdnanceBallisticPoint(i,q0,_mfOrdPrev);mfOrdnanceBallisticPoint(i,q1,_mfOrdPoint);
  const a=w2s(_mfOrdPrev[0],_mfOrdPrev[2],_mfOrdPrev[1]),b=w2s(_mfOrdPoint[0],_mfOrdPoint[2],_mfOrdPoint[1]);
  return Math.hypot(b[0]-a[0],b[1]-a[1]);
}
function mfOrdQueueArc(i,qStart,qNow,segs,outerW,innerW,outer,inner,kind){
  const n=Math.max(2,Math.min(23,segs));
  mfOrdDist[0]=0;
  for(let k=0;k<=n;k++){const q=qStart+(qNow-qStart)*(k/n),o=k*3;mfOrdnanceBallisticPoint(i,q,_mfOrdPoint);
    mfOrdPath[o]=_mfOrdPoint[0];mfOrdPath[o+1]=_mfOrdPoint[1];mfOrdPath[o+2]=_mfOrdPoint[2];
    if(k){const a=o-3;mfOrdDist[k]=mfOrdDist[k-1]+Math.hypot(mfOrdPath[o]-mfOrdPath[a],mfOrdPath[o+1]-mfOrdPath[a+1],mfOrdPath[o+2]-mfOrdPath[a+2]);}}
  for(let k=0;k<n;k++){
    const o=k*3,p=(k+1)*3,u0=k/n,u1=(k+1)/n,mid=(u0+u1)*.5;
    const taper=(kind===1?.12:.018)+(kind===1?.88:.982)*Math.pow(Math.min(1,mid/.72),.72);
    _mfOrdA[0]=mfOrdPath[o];_mfOrdA[1]=mfOrdPath[o+1];_mfOrdA[2]=mfOrdPath[o+2];
    _mfOrdB[0]=mfOrdPath[p];_mfOrdB[1]=mfOrdPath[p+1];_mfOrdB[2]=mfOrdPath[p+2];
    const pa=Math.max(0,k-1)*3,nb=Math.min(n,k+2)*3;
    _mfOrdDA[0]=mfOrdPath[p]-mfOrdPath[pa];_mfOrdDA[1]=mfOrdPath[p+1]-mfOrdPath[pa+1];_mfOrdDA[2]=mfOrdPath[p+2]-mfOrdPath[pa+2];
    _mfOrdDB[0]=mfOrdPath[nb]-mfOrdPath[o];_mfOrdDB[1]=mfOrdPath[nb+1]-mfOrdPath[o+1];_mfOrdDB[2]=mfOrdPath[nb+2]-mfOrdPath[o+2];
    if(kind!==1)mfOrdEmitSegment(_mfOrdA,_mfOrdB,outerW*1.72*taper,u0,u1,6,outer,.30,_mfOrdDA,_mfOrdDB,mfOrdDist[k],mfOrdDist[k+1]);
    mfOrdEmitSegment(_mfOrdA,_mfOrdB,outerW*taper,u0,u1,kind,outer,kind===1?.68:.64,_mfOrdDA,_mfOrdDB,mfOrdDist[k],mfOrdDist[k+1]);
    mfOrdEmitSegment(_mfOrdA,_mfOrdB,innerW*(.56+.44*taper),u0,u1,kind===1?1:3,inner,kind===1?.96:.70,_mfOrdDA,_mfOrdDB,mfOrdDist[k],mfOrdDist[k+1]);
  }
  MF_ORD_TRAIL_TELEM.segments+=n;MF_ORD_TRAIL_TELEM.instances+=kind===1?2:3;
}
function mfOrdQueueDriverArc(i,qStart,qNow,segs,width,color,kind){
  const n=Math.max(2,Math.min(23,segs));mfOrdDist[0]=0;
  for(let k=0;k<=n;k++){
    const q=qStart+(qNow-qStart)*(k/n),o=k*3;mfOrdnanceBallisticPoint(i,q,_mfOrdPoint);
    mfOrdPath[o]=_mfOrdPoint[0];mfOrdPath[o+1]=_mfOrdPoint[1];mfOrdPath[o+2]=_mfOrdPoint[2];
    if(k){const a=o-3;mfOrdDist[k]=mfOrdDist[k-1]+Math.hypot(mfOrdPath[o]-mfOrdPath[a],mfOrdPath[o+1]-mfOrdPath[a+1],mfOrdPath[o+2]-mfOrdPath[a+2]);}
  }
  for(let k=0;k<n;k++){
    const o=k*3,p=(k+1)*3,u0=k/n,u1=(k+1)/n,pa=Math.max(0,k-1)*3,nb=Math.min(n,k+2)*3;
    _mfOrdA[0]=mfOrdPath[o];_mfOrdA[1]=mfOrdPath[o+1];_mfOrdA[2]=mfOrdPath[o+2];
    _mfOrdB[0]=mfOrdPath[p];_mfOrdB[1]=mfOrdPath[p+1];_mfOrdB[2]=mfOrdPath[p+2];
    _mfOrdDA[0]=mfOrdPath[p]-mfOrdPath[pa];_mfOrdDA[1]=mfOrdPath[p+1]-mfOrdPath[pa+1];_mfOrdDA[2]=mfOrdPath[p+2]-mfOrdPath[pa+2];
    _mfOrdDB[0]=mfOrdPath[nb]-mfOrdPath[o];_mfOrdDB[1]=mfOrdPath[nb+1]-mfOrdPath[o+1];_mfOrdDB[2]=mfOrdPath[nb+2]-mfOrdPath[o+2];
    mfOrdEmitSegment(_mfOrdA,_mfOrdB,width,u0,u1,kind,color,.96,_mfOrdDA,_mfOrdDB,mfOrdDist[k],mfOrdDist[k+1]);
  }
  MF_ORD_TRAIL_TELEM.segments+=n;MF_ORD_TRAIL_TELEM.instances++;
}
function mfOrdQueueHead(i,qNow,width,color){
  let q0=Math.max(0,qNow-.006);
  for(let pass=0;pass<4&&mfOrdProjected(i,q0,qNow)<22;pass++)q0=Math.max(0,qNow-(qNow-q0)*1.72-.003);
  mfOrdnanceBallisticPoint(i,q0,_mfOrdA);mfOrdnanceBallisticPoint(i,qNow,_mfOrdB);
  mfOrdEmitSegment(_mfOrdA,_mfOrdB,width,0,1,4,color,.96);MF_ORD_TRAIL_TELEM.instances++;
}
function mfOrdnanceTrailQueueSmoke(samples){
  if(!samples||!samples.length||mfOrdSmokeStart>=0)return !!mfOrdSmokeCount;
  if(!mfOrdInit())return false;
  mfOrdSmokeStart=mfOrdVertCount;
  const groups=new Map();
  for(let i=0;i<samples.length;i++){const S=samples[i],k=String(S.trail==null?S.team:S.trail);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(S);}
  let visibleGroups=0;
  for(const list of groups.values()){
    let groupVisible=false;
    const distances=new Float32Array(list.length);
    for(let j=1;j<list.length;j++){const a=list[j-1],b=list[j];distances[j]=distances[j-1]+Math.hypot(b.x-a.x,b.y-a.y,b.lift-a.lift);}
    for(let idx=1;idx<list.length;idx++){
      const prev=list[idx-1],S=list[idx],before=list[Math.max(0,idx-2)],after=list[Math.min(list.length-1,idx+1)],total=list.length;
      const mx=(prev.x+S.x)*.5,my=(prev.y+S.y)*.5,team=S.team;
      /* Match the billboard fallback's camera and fog contract. Testing the
         endpoints plus midpoint avoids exposing a hidden battery through its
         smoke while retaining a path segment that crosses the visible edge. */
      const cameraVisible=typeof vis!=='function'||vis(mx,my,Math.hypot(S.x-prev.x,S.y-prev.y)*.55+45);
      const fogVisible=typeof fogFxVisible!=='function'||fogFxVisible(prev.x,prev.y,team)||
        fogFxVisible(S.x,S.y,team)||fogFxVisible(mx,my,team);
      if(!cameraVisible||!fogVisible)continue;
      groupVisible=true;
      _mfOrdA[0]=prev.x;_mfOrdA[1]=(typeof gh==='function'?gh(prev.x,prev.y):0)+prev.lift;_mfOrdA[2]=prev.y;
      _mfOrdB[0]=S.x;_mfOrdB[1]=(typeof gh==='function'?gh(S.x,S.y):0)+S.lift;_mfOrdB[2]=S.y;
      _mfOrdDA[0]=S.x-before.x;_mfOrdDA[1]=((typeof gh==='function'?gh(S.x,S.y):0)+S.lift)-((typeof gh==='function'?gh(before.x,before.y):0)+before.lift);_mfOrdDA[2]=S.y-before.y;
      _mfOrdDB[0]=after.x-prev.x;_mfOrdDB[1]=((typeof gh==='function'?gh(after.x,after.y):0)+after.lift)-((typeof gh==='function'?gh(prev.x,prev.y):0)+prev.lift);_mfOrdDB[2]=after.y-prev.y;
      const age=1-S.life/S.max,width=Math.min(25,Math.max(8,S.size*(.82+age*.92)));
      const u0=(idx-1)/(total-1||1),u1=idx/(total-1||1),life=S.life/S.max;
      if(mfOrdDriverTex){
        /* One authored density/emission plate spans the complete fixed-step
           history. The path bends in world space; the plate supplies the
           irregular combustion-to-soot transition without card gaps. */
        mfOrdEmitSegment(_mfOrdA,_mfOrdB,width*1.38,u0,u1,8,[255,255,255],Math.min(.96,.90*life),_mfOrdDA,_mfOrdDB,distances[idx-1],distances[idx]);
      }else{
        /* Atomic fallback while the production driver decodes. */
        mfOrdEmitSegment(_mfOrdA,_mfOrdB,width*1.32,u0,u1,5,[92+age*12,88+age*11,83+age*10],Math.min(.92,.84*life),_mfOrdDA,_mfOrdDB,distances[idx-1],distances[idx]);
        mfOrdEmitSegment(_mfOrdA,_mfOrdB,width*.62,u0,u1,5,[226-age*35,213-age*32,194-age*29],Math.min(.84,.76*life),_mfOrdDA,_mfOrdDB,distances[idx-1],distances[idx]);
      }
    }
    if(groupVisible)visibleGroups++;
  }
  mfOrdSmokeCount=mfOrdVertCount-mfOrdSmokeStart;MF_ORD_TRAIL_TELEM.smokeVertices=mfOrdSmokeCount;
  MF_ORD_TRAIL_TELEM.smokeRibbons=visibleGroups;return mfOrdSmokeCount>0;
}
function mfDrawOrdnanceTrail(i,X,Y,H,power,fac){
  const code=pArtTrail[i]||mfOrdnanceTrailCode(pteam[i],pBio[i]),style=typeof mfEnergyArtilleryStyle==='function'?mfEnergyArtilleryStyle(fac):null;
  /* Simulation-owned curve volume is the complete High/Cinematic trail. The
     strip remains the atomic fallback when volume capacity/readiness is absent. */
  if(mfOrdnanceTrailVolActive(i))return code;
  const qNow=Math.max(0,Math.min(1,pt[i])),driver=mfOrdInit()&&!!mfOrdDriverTex;
  if(code===MF_ORD_TRAIL_ENERGY){
    const qv=typeof mfVfxQ==='function'?mfVfxQ():1,target=qv>=.95?145:92;
    let tail=Math.min(qNow,(qv>=1.15?.18:qv>=.65?.15:.11)*((style&&style.tail)||1));
    for(let pass=0;pass<6&&tail<qNow&&mfOrdProjected(i,qNow-tail,qNow)<target;pass++)tail=Math.min(qNow,tail*1.55+.02);
    const px=mfOrdProjected(i,qNow-tail,qNow);MF_ORD_TRAIL_TELEM.projectedPxMax=Math.max(MF_ORD_TRAIL_TELEM.projectedPxMax,px);
    const outer=style&&style.glow||[92,214,255],inner=style&&style.core||[255,255,255];
    const outerW=Math.min(15.5,7.8+power*2.75),innerW=Math.min(2.35,.72+power*.49);
    if(driver)mfOrdQueueDriverArc(i,qNow-tail,qNow,qv>=1.15?16:qv>=.65?12:8,outerW*1.72,outer,7);
    else{mfOrdQueueArc(i,qNow-tail,qNow,qv>=1.15?16:qv>=.65?12:8,outerW,innerW,outer,inner,2);mfOrdQueueHead(i,qNow,Math.min(6.2,3.4+power*.92),inner);}
    MF_ORD_TRAIL_TELEM.energy++;return code;
  }
  if(code===MF_ORD_TRAIL_SHELL){
    /* Rocket-assisted physical artillery: an incandescent, pressure-torn
       combustion wake leads the cooler persistent soot ribbon. This is not
       guidance or gameplay thrust; it is a visual flight profile sampled
       from the same deterministic ballistic arc. */
    let tail=Math.min(qNow,.075);for(let pass=0;pass<5&&tail<qNow&&mfOrdProjected(i,qNow-tail,qNow)<82;pass++)tail=Math.min(qNow,tail*1.48+.012);
    const px=mfOrdProjected(i,qNow-tail,qNow);MF_ORD_TRAIL_TELEM.projectedPxMax=Math.max(MF_ORD_TRAIL_TELEM.projectedPxMax,px);
    const outer=style&&style.glow||[255,112,34],inner=style&&style.core||[255,232,178];
    if(driver)mfOrdQueueDriverArc(i,qNow-tail,qNow,8,Math.min(16,8.2+power*2.7),outer,9);
    else mfOrdQueueArc(i,qNow-tail,qNow,8,Math.min(10.5,4.8+power*1.75),Math.min(2.15,.72+power*.48),outer,inner,2);
    const yaw=Math.atan2(pvy[i],pvx[i]);bbAlpha.add(sprites.debris||sprites.glow,X,Y,H,8.8*power,yaw+Math.PI/2,55,53,50,255);
    bbAdd.add(sprites.glow,X,Y,H,4.8*power,0,outer[0],outer[1],outer[2],172);MF_ORD_TRAIL_TELEM.shell++;return code;
  }
  MF_ORD_TRAIL_TELEM.organic++;return code;
}
function mfOrdnanceTrailFlush(vp,time){
  MF_ORD_TRAIL_TELEM.vertices=mfOrdVertCount;if(!mfOrdVertCount||!mfOrdInit())return false;
  const wasP=gl.getParameter(gl.CURRENT_PROGRAM),wasV=gl.getParameter(gl.VERTEX_ARRAY_BINDING),wasB=gl.getParameter(gl.ARRAY_BUFFER_BINDING),
    blend=gl.isEnabled(gl.BLEND),depth=gl.isEnabled(gl.DEPTH_TEST),cull=gl.isEnabled(gl.CULL_FACE),depthWrite=gl.getParameter(gl.DEPTH_WRITEMASK),
    srcRGB=gl.getParameter(gl.BLEND_SRC_RGB),dstRGB=gl.getParameter(gl.BLEND_DST_RGB),srcA=gl.getParameter(gl.BLEND_SRC_ALPHA),dstA=gl.getParameter(gl.BLEND_DST_ALPHA),
    eqRGB=gl.getParameter(gl.BLEND_EQUATION_RGB),eqA=gl.getParameter(gl.BLEND_EQUATION_ALPHA),depthFunc=gl.getParameter(gl.DEPTH_FUNC),
    cullMode=gl.getParameter(gl.CULL_FACE_MODE),frontFace=gl.getParameter(gl.FRONT_FACE),colorMask=gl.getParameter(gl.COLOR_WRITEMASK),
    scissor=gl.isEnabled(gl.SCISSOR_TEST),scissorBox=gl.getParameter(gl.SCISSOR_BOX),framebuffer=gl.getParameter(gl.FRAMEBUFFER_BINDING),
    viewport=gl.getParameter(gl.VIEWPORT),poly=gl.isEnabled(gl.POLYGON_OFFSET_FILL),polyFactor=gl.getParameter(gl.POLYGON_OFFSET_FACTOR),
    polyUnits=gl.getParameter(gl.POLYGON_OFFSET_UNITS),wasActive=gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE3);const wasTex=gl.getParameter(gl.TEXTURE_BINDING_2D);let calls=0;
  try{
    gl.bindTexture(gl.TEXTURE_2D,mfOrdDriverTex);gl.useProgram(mfOrdProg);gl.bindVertexArray(mfOrdVao);gl.bindBuffer(gl.ARRAY_BUFFER,mfOrdVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,mfOrdVerts,0,mfOrdVertCount*MF_ORD_TRAIL_STRIDE);
    gl.uniformMatrix4fv(mfOrdUVP,false,vp);gl.uniform2f(mfOrdUView,Math.max(1,VW),Math.max(1,VH));gl.uniform1f(mfOrdUTime,Number.isFinite(time)?time:0);
    gl.uniform1i(mfOrdUDriver,3);gl.uniform1f(mfOrdUDriverReady,mfOrdDriverTex?1:0);
    gl.enable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);gl.disable(gl.POLYGON_OFFSET_FILL);gl.colorMask(true,true,true,true);
    const glowCount=mfOrdSmokeStart>=0?mfOrdSmokeStart:mfOrdVertCount;
    if(mfOrdSmokeCount){gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.drawArrays(gl.TRIANGLES,mfOrdSmokeStart,mfOrdSmokeCount);calls++;}
    if(glowCount){gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.drawArrays(gl.TRIANGLES,0,glowCount);calls++;}
    if(typeof drawCalls==='number')drawCalls+=calls;if(typeof triCount==='number')triCount+=mfOrdVertCount/3;
    MF_ORD_TRAIL_TELEM.drawCalls=calls;return true;
  }catch(e){MF_ORD_TRAIL_TELEM.lastError=String(e&&e.message||e);return false;}
  finally{
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(viewport[0],viewport[1],viewport[2],viewport[3]);
    gl.scissor(scissorBox[0],scissorBox[1],scissorBox[2],scissorBox[3]);scissor?gl.enable(gl.SCISSOR_TEST):gl.disable(gl.SCISSOR_TEST);
    gl.blendEquationSeparate(eqRGB,eqA);gl.blendFuncSeparate(srcRGB,dstRGB,srcA,dstA);gl.depthFunc(depthFunc);gl.depthMask(depthWrite);
    gl.cullFace(cullMode);gl.frontFace(frontFace);gl.colorMask(colorMask[0],colorMask[1],colorMask[2],colorMask[3]);
    gl.polygonOffset(polyFactor,polyUnits);poly?gl.enable(gl.POLYGON_OFFSET_FILL):gl.disable(gl.POLYGON_OFFSET_FILL);
    blend?gl.enable(gl.BLEND):gl.disable(gl.BLEND);depth?gl.enable(gl.DEPTH_TEST):gl.disable(gl.DEPTH_TEST);cull?gl.enable(gl.CULL_FACE):gl.disable(gl.CULL_FACE);
    gl.bindTexture(gl.TEXTURE_2D,wasTex);gl.activeTexture(wasActive);gl.bindBuffer(gl.ARRAY_BUFFER,wasB);gl.bindVertexArray(wasV);gl.useProgram(wasP);
  }
}
if(typeof window!=='undefined'){
  window.MF_ORD_TRAIL_TELEM=MF_ORD_TRAIL_TELEM;window.mfOrdnanceTrailCode=mfOrdnanceTrailCode;
  window.mfDrawOrdnanceTrail=mfDrawOrdnanceTrail;window.mfOrdnanceTrailFlush=mfOrdnanceTrailFlush;
  window.mfOrdnanceTrailQueueSmoke=mfOrdnanceTrailQueueSmoke;
  window.mfOrdnanceTrailResetTelemetry=mfOrdnanceTrailResetTelemetry;window.mfOrdnanceTrailGLReset=mfOrdnanceTrailGLReset;
  window.mfOrdnanceTrailDriverTexture=mfOrdnanceTrailDriverTexture;
  window.mfOrdnanceTrailSimBegin=mfOrdnanceTrailSimBegin;window.mfOrdnanceTrailSimSample=mfOrdnanceTrailSimSample;
  window.mfOrdnanceTrailSimStop=mfOrdnanceTrailSimStop;window.mfOrdnanceTrailVolActive=mfOrdnanceTrailVolActive;
  window.mfOrdnanceTrailSimReset=mfOrdnanceTrailSimReset;
}
