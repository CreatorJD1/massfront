;/* ============================================================================
   SHIELD / FORCE-FIELD FX
   ----------------------------------------------------------------------------
   One field source owns one translucent surface. Protected units do not grow
   their own bubbles: Bulwark/Archon/Aegis/Techlab state is sampled directly,
   while blocked hits enter the bounded mfShieldHit queue below.

   INTEGRATION CONTRACT
     shieldFxBoot()                         after initGL3D()
     shieldFxTick(dt)                       once per simulation/render frame
     shieldFxDraw(S_nA, animationSeconds)   after opaque meshes, before bloom
     mfShieldHit(x,y,team,r,dx,dy,key,h,piercing)
     shieldFxGLReset()                      before GL resource rebuild
     shieldFxReset()                        on resetWorld()

   `dx,dy` is the projectile travel direction. `h` is an optional world-space
   vertical centre; omitting it anchors the ripple from terrain height. A true
   `piercing` flag deliberately queues nothing.
   ============================================================================ */
(function(){
'use strict';

const MF_SF_DOME_CAP=72;
const MF_SF_PLATE_CAP=192;
const MF_SF_INST_CAP=Math.max(MF_SF_DOME_CAP,MF_SF_PLATE_CAP);
const MF_SF_INST_FLOATS=12;
const MF_SF_HIT_CAP=48;
const MF_SF_RATE_CAP=64;
const MF_SF_RATE_SECONDS=0.12;

const MF_SF_INST=new Float32Array(MF_SF_INST_CAP*MF_SF_INST_FLOATS);
/* Domes and plates used to share one staging array because plates were packed
   only after dome submission. Collecting both before touching GL needs their
   CPU data to coexist; this tiny fixed sidecar preserves both original caps
   and order without allocating during a battle. */
const MF_SF_DOME_INST=new Float32Array(MF_SF_DOME_CAP*MF_SF_INST_FLOATS);
const MF_SF_HX=new Float32Array(MF_SF_HIT_CAP);
const MF_SF_HY=new Float32Array(MF_SF_HIT_CAP);
const MF_SF_HH=new Float32Array(MF_SF_HIT_CAP);
const MF_SF_HR=new Float32Array(MF_SF_HIT_CAP);
const MF_SF_HDX=new Float32Array(MF_SF_HIT_CAP);
const MF_SF_HDY=new Float32Array(MF_SF_HIT_CAP);
const MF_SF_HAGE=new Float32Array(MF_SF_HIT_CAP);
const MF_SF_HTEAM=new Uint8Array(MF_SF_HIT_CAP);
const MF_SF_RATE_KEY=new Array(MF_SF_RATE_CAP);
const MF_SF_RATE_TIME=new Float64Array(MF_SF_RATE_CAP);

let mfSfHitN=0, mfSfRateHead=0, mfSfPackedHits=0;
let mfSfProg=null, mfSfVAO=null, mfSfMeshVBO=null, mfSfInstVBO=null;
let mfSfDomeFirst=0, mfSfDomeVerts=0, mfSfPlateFirst=0, mfSfPlateVerts=0;
let mfSfU={};

const MF_SF_TELEM={
  ready:false, drawCalls:0, domes:0, plates:0, hits:0, liveHits:0,
  acceptedHits:0, rateLimitedHits:0, droppedHits:0, culled:0, lastError:''
};

const MF_SF_VS=`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aI0;       // world centre xyz, radius / half-width
layout(location=3) in vec4 aI1;       // tint rgb, opacity
layout(location=4) in vec4 aI2;       // yaw, kind, normalised age, height scale
uniform mat4 uVP;
out vec3 vWorld;
out vec3 vNrm;
out vec3 vLocal;
flat out vec4 vTint;
flat out vec2 vKindAge;
void main(){
  float c=cos(aI2.x),s=sin(aI2.x),kind=aI2.y;
  vec3 lp=aPos;
  vec3 ln=aNrm;
  if(kind<0.5){
    lp=vec3(lp.x*aI0.w,lp.y*aI0.w*aI2.w,lp.z*aI0.w);
    ln=normalize(vec3(ln.x,ln.y/max(0.08,aI2.w),ln.z));
  }else{
    lp=vec3(lp.x*aI0.w*0.04,lp.y*aI0.w*aI2.w,lp.z*aI0.w);
  }
  vec3 rp=vec3(lp.x*c-lp.z*s,lp.y,lp.x*s+lp.z*c);
  vec3 rn=normalize(vec3(ln.x*c-ln.z*s,ln.y,ln.x*s+ln.z*c));
  vWorld=aI0.xyz+rp;
  vNrm=rn;
  vLocal=aPos;
  vTint=aI1;
  vKindAge=aI2.yz;
  gl_Position=uVP*vec4(vWorld,1.0);
}`;

const MF_SF_FS=`#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNrm;
in vec3 vLocal;
flat in vec4 vTint;
flat in vec2 vKindAge;
uniform vec3 uEye;
uniform float uTime;
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
  float kind=vKindAge.x,age=clamp(vKindAge.y,0.0,1.0);
  vec3 col=vTint.rgb;
  float a=0.0;
  if(kind<0.5){
    vec3 V=normalize(uEye-vWorld);
    float rim=pow(1.0-clamp(abs(dot(normalize(vNrm),V)),0.0,1.0),2.35);
    float foot=1.0-smoothstep(0.012,0.115,vLocal.y);
    float cell=hexEdge((vLocal.xz+vec2(vLocal.y*0.17,-vLocal.y*0.11))*9.0);
    float energyPulse=sin(vLocal.y*12.0-uTime*3.8+vWorld.x*0.04+vWorld.z*0.03)*0.5+0.5;
    float hexGlow=cell*(0.08+0.22*energyPulse);
    float breathe=0.95+0.05*sin(uTime*2.15+vWorld.x*0.017+vWorld.z*0.013);

    a=(rim*0.42+foot*0.20+uHex*(0.024+hexGlow))*vTint.a*breathe;
    vec3 rimCol=mix(col,vec3(0.88,0.96,1.0),rim*0.55+hexGlow*uHex*0.25);
    col=mix(rimCol,vec3(1.0,1.0,1.0),rim*rim*0.45+foot*0.35);
  }else{
    float rho=length(vLocal.yz);
    float edge=1.0-smoothstep(0.045,0.105,abs(rho-0.88));
    float cell=hexEdge(vLocal.yz*6.0);
    if(kind<1.5){
      /* Braced guard plate */
      float energyPulse=sin(vLocal.y*8.0-uTime*3.0)*0.5+0.5;
      float hexGlow=cell*(0.06+0.18*energyPulse);
      a=(0.022+edge*0.32+uHex*hexGlow)*vTint.a;
      col=mix(col,vec3(0.88,0.96,1.0),edge*0.40+hexGlow*0.20);
    }else{
      /* Supersonic kinetic impact ripple wavefronts */
      float waveFront=mix(0.14,0.95,age);
      float wave=exp(-pow((rho-waveFront)*12.0,2.0));
      float echoFront=max(0.0,waveFront-0.26);
      float echo=exp(-pow((rho-echoFront)*16.0,2.0))*0.42;

      float hitHex=cell*(1.0-smoothstep(0.0,0.80,rho))*(1.0-age*0.75);
      float centerSpark=(1.0-smoothstep(0.0,0.38,age))*(1.0-smoothstep(0.0,0.28,rho));
      float fade=1.0-smoothstep(0.60,1.0,age);

      a=((wave+echo)*0.92+hitHex*uHex*0.45+centerSpark*0.80+edge*0.16)*fade*vTint.a;
      col=mix(vTint.rgb,vec3(1.0,1.0,1.0),centerSpark*0.85+wave*0.60);
    }
  }
  if(a<0.004) discard;
  o=vec4(col*a,a);
}`;

function mfSfNow(){
  return typeof performance!=='undefined'&&performance.now?performance.now()*0.001:Date.now()*0.001;
}

function mfSfQuality(){
  try{
    if(typeof qualityKey==='function') return qualityKey();
    if(typeof META!=='undefined'&&META.settings&&META.settings.quality) return META.settings.quality;
  }catch(_){ }
  return 'high';
}

function mfSfGround(x,y,T,i){
  try{
    if(T&&typeof unitGroundY==='function') return unitGroundY(T,x,y,i);
    if(typeof terrainH==='function') return terrainH(x,y);
  }catch(_){ }
  return 0;
}

function mfSfFog(team,x,y,entity){
  try{
    if(entity&&typeof fogEntityVisible==='function') return !!fogEntityVisible(team,x,y);
    if(typeof fogPointVisible==='function') return team===0||!!fogPointVisible(x,y);
  }catch(_){ return false; }
  return true;
}

let mfSfBX0=-1e9,mfSfBX1=1e9,mfSfBY0=-1e9,mfSfBY1=1e9;
function mfSfSyncBounds(){
  mfSfBX0=mfSfBY0=-1e9; mfSfBX1=mfSfBY1=1e9;
  try{
    if(typeof camBounds==='function'){
      const b=camBounds();
      if(b){ mfSfBX0=b.x0;mfSfBX1=b.x1;mfSfBY0=b.y0;mfSfBY1=b.y1; }
    }
  }catch(_){ }
}
function mfSfInView(x,y,r){
  const ok=!(x+r<mfSfBX0||x-r>mfSfBX1||y+r<mfSfBY0||y-r>mfSfBY1);
  if(!ok) MF_SF_TELEM.culled++;
  return ok;
}

function mfSfMesh(){
  const out=[];
  const put=(p,n)=>{out.push(p[0],p[1],p[2],n[0],n[1],n[2]);};
  const lat=8,seg=20;
  mfSfDomeFirst=0;
  for(let iy=0;iy<lat;iy++){
    const a0=iy/lat*Math.PI*0.5,a1=(iy+1)/lat*Math.PI*0.5;
    const r0=Math.cos(a0),r1=Math.cos(a1),h0=Math.sin(a0),h1=Math.sin(a1);
    for(let ix=0;ix<seg;ix++){
      const t0=ix/seg*Math.PI*2,t1=(ix+1)/seg*Math.PI*2;
      const p00=[r0*Math.cos(t0),h0,r0*Math.sin(t0)];
      const p01=[r1*Math.cos(t0),h1,r1*Math.sin(t0)];
      const p11=[r1*Math.cos(t1),h1,r1*Math.sin(t1)];
      const p10=[r0*Math.cos(t1),h0,r0*Math.sin(t1)];
      put(p00,p00);put(p01,p01);put(p11,p11);
      put(p00,p00);put(p11,p11);put(p10,p10);
    }
  }
  mfSfDomeVerts=out.length/6;
  mfSfPlateFirst=mfSfDomeVerts;
  const ps=18,n=[1,0,0],c=[0,0,0];
  for(let i=0;i<ps;i++){
    const a=i/ps*Math.PI*2,b=(i+1)/ps*Math.PI*2;
    put(c,n);put([0,Math.cos(a),Math.sin(a)],n);put([0,Math.cos(b),Math.sin(b)],n);
  }
  mfSfPlateVerts=out.length/6-mfSfPlateFirst;
  return new Float32Array(out);
}

function shieldFxBoot(){
  if(mfSfProg&&mfSfVAO&&mfSfInstVBO) return true;
  if(typeof gl==='undefined'||!gl||typeof mkProg!=='function'){
    MF_SF_TELEM.lastError='GL or mkProg unavailable'; return false;
  }
  const wasVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  const wasArr=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  try{
    mfSfProg=mkProg(MF_SF_VS,MF_SF_FS,'shieldfx');
    /* mkProg() defers link validation (mesh.js) — ask explicitly. */
    if(!mfProgOk(mfSfProg)) throw new Error('shieldfx shader did not link');
    mfSfU.uVP=gl.getUniformLocation(mfSfProg,'uVP');
    mfSfU.uEye=gl.getUniformLocation(mfSfProg,'uEye');
    mfSfU.uTime=gl.getUniformLocation(mfSfProg,'uTime');
    mfSfU.uHex=gl.getUniformLocation(mfSfProg,'uHex');

    mfSfMeshVBO=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,mfSfMeshVBO);
    gl.bufferData(gl.ARRAY_BUFFER,mfSfMesh(),gl.STATIC_DRAW);
    mfSfInstVBO=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,mfSfInstVBO);
    gl.bufferData(gl.ARRAY_BUFFER,MF_SF_INST.byteLength,gl.DYNAMIC_DRAW);

    mfSfVAO=gl.createVertexArray();
    gl.bindVertexArray(mfSfVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER,mfSfMeshVBO);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
    gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
    gl.bindBuffer(gl.ARRAY_BUFFER,mfSfInstVBO);
    const st=MF_SF_INST_FLOATS*4;
    for(let a=2;a<=4;a++){
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a,4,gl.FLOAT,false,st,(a-2)*16);
      gl.vertexAttribDivisor(a,1);
    }
    MF_SF_TELEM.ready=true; MF_SF_TELEM.lastError='';
    return true;
  }catch(e){
    MF_SF_TELEM.ready=false;
    MF_SF_TELEM.lastError=String(e&&e.message||e).slice(0,180);
    console.warn('shieldfx: init failed',e);
    mfSfProg=mfSfVAO=mfSfMeshVBO=mfSfInstVBO=null; mfSfU={};
    return false;
  }finally{
    gl.bindVertexArray(wasVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER,wasArr);
  }
}

function shieldFxGLReset(){
  mfSfProg=mfSfVAO=mfSfMeshVBO=mfSfInstVBO=null;
  mfSfU={}; MF_SF_TELEM.ready=false;
}

function shieldFxReset(){
  mfSfHitN=0; mfSfRateHead=0;
  for(let i=0;i<MF_SF_RATE_CAP;i++){MF_SF_RATE_KEY[i]=undefined;MF_SF_RATE_TIME[i]=0;}
  MF_SF_TELEM.liveHits=0;MF_SF_TELEM.acceptedHits=0;
  MF_SF_TELEM.rateLimitedHits=0;MF_SF_TELEM.droppedHits=0;
}

function mfSfRateKey(x,y,team,key){
  if(key!==undefined&&key!==null) return String(team)+':'+String(key);
  return ((x/20)|0)*73856093^((y/20)|0)*19349663^(team|0)*83492791;
}

function mfShieldHit(x,y,team,radius,dx,dy,key,height,piercing){
  if(piercing) return false;
  x=Number(x);y=Number(y);radius=Math.max(2,Number(radius)||8);
  if(!Number.isFinite(x)||!Number.isFinite(y)) return false;
  team=Math.max(0,Math.min(255,team|0));
  const now=mfSfNow(),rk=mfSfRateKey(x,y,team,key);
  for(let i=0;i<MF_SF_RATE_CAP;i++) if(MF_SF_RATE_KEY[i]===rk){
    if(now-MF_SF_RATE_TIME[i]<MF_SF_RATE_SECONDS){MF_SF_TELEM.rateLimitedHits++;return false;}
    MF_SF_RATE_TIME[i]=now; break;
  }
  let known=false;
  for(let i=0;i<MF_SF_RATE_CAP;i++) if(MF_SF_RATE_KEY[i]===rk){known=true;break;}
  if(!known){
    const ri=mfSfRateHead++%MF_SF_RATE_CAP;
    MF_SF_RATE_KEY[ri]=rk;MF_SF_RATE_TIME[ri]=now;
  }

  let slot=mfSfHitN;
  if(mfSfHitN<MF_SF_HIT_CAP) mfSfHitN++;
  else{
    slot=0;
    for(let i=1;i<MF_SF_HIT_CAP;i++) if(MF_SF_HAGE[i]>MF_SF_HAGE[slot]) slot=i;
    MF_SF_TELEM.droppedHits++;
  }
  let dl=Math.hypot(Number(dx)||0,Number(dy)||0);
  if(dl<0.001){dx=1;dy=0;dl=1;}
  dx=(Number(dx)||0)/dl;dy=(Number(dy)||0)/dl;
  MF_SF_HX[slot]=x;MF_SF_HY[slot]=y;
  MF_SF_HH[slot]=Number.isFinite(Number(height))?Number(height):mfSfGround(x,y,null,-1)+radius*0.58;
  MF_SF_HR[slot]=radius;MF_SF_HDX[slot]=dx;MF_SF_HDY[slot]=dy;
  MF_SF_HAGE[slot]=0;MF_SF_HTEAM[slot]=team;
  MF_SF_TELEM.acceptedHits++;MF_SF_TELEM.liveHits=mfSfHitN;
  return true;
}

function shieldFxTick(dt){
  dt=Number(dt);
  if(!(dt>0)) return;
  dt=Math.min(0.25,dt);
  for(let i=mfSfHitN-1;i>=0;i--){
    MF_SF_HAGE[i]+=dt/0.46;
    if(MF_SF_HAGE[i]<1) continue;
    const n=--mfSfHitN;
    if(i!==n){
      MF_SF_HX[i]=MF_SF_HX[n];MF_SF_HY[i]=MF_SF_HY[n];MF_SF_HH[i]=MF_SF_HH[n];
      MF_SF_HR[i]=MF_SF_HR[n];MF_SF_HDX[i]=MF_SF_HDX[n];MF_SF_HDY[i]=MF_SF_HDY[n];
      MF_SF_HAGE[i]=MF_SF_HAGE[n];MF_SF_HTEAM[i]=MF_SF_HTEAM[n];
    }
  }
  MF_SF_TELEM.liveHits=mfSfHitN;
}

function mfSfPut(n,x,h,y,r,team,alpha,yaw,kind,age,heightScale,out){
  if(n>=MF_SF_INST_CAP) return n;
  let cr=120,cg=205,cb=255;
  try{
    if(typeof TEAMC!=='undefined'&&TEAMC[team]){cr=TEAMC[team][0];cg=TEAMC[team][1];cb=TEAMC[team][2];}
  }catch(_){ }
  const o=n*MF_SF_INST_FLOATS,d=out||MF_SF_INST;
  d[o]=x;d[o+1]=h;d[o+2]=y;d[o+3]=r;
  /* Pull every livery slightly toward ion-blue so red/orange teams still read
     as a shield surface rather than a second fire effect. */
  d[o+4]=Math.min(1,cr/255*0.72+0.16);
  d[o+5]=Math.min(1,cg/255*0.72+0.22);
  d[o+6]=Math.min(1,cb/255*0.72+0.27);
  d[o+7]=alpha;
  d[o+8]=yaw||0;d[o+9]=kind;d[o+10]=age||0;d[o+11]=heightScale;
  return n+1;
}

function mfSfCollectDomes(){
  let n=0;
  try{
    if(typeof unitHigh==='number'&&typeof ualive!=='undefined'&&typeof utype!=='undefined'){
      for(let i=0;i<unitHigh&&n<MF_SF_DOME_CAP;i++){
        if(!ualive[i]) continue;
        const ty=utype[i]; if(ty!==11&&ty!==29) continue;
        if(typeof ushielded!=='undefined'&&ushielded[i]<=0) continue;
        const x=ux[i],y=uy[i],team=uteam[i],R=(typeof SHIELD_R==='number'?SHIELD_R:95)*(ty===29?1.6:1);
        if(!mfSfFog(team,x,y,true)||!mfSfInView(x,y,R)) continue;
        const T=typeof TYPES!=='undefined'?TYPES[ty]:null;
        n=mfSfPut(n,x,mfSfGround(x,y,T,i)+0.35,y,R,team,ty===29?0.62:0.54,0,0,0,ty===29?0.64:0.56,MF_SF_DOME_INST);
      }
    }
    if(typeof blds!=='undefined') for(let i=0;i<blds.length&&n<MF_SF_DOME_CAP;i++){
      const B=blds[i]; if(!B||!B.alive||B.prog<1) continue;
      let R=0,a=0.5;
      if(B.type==='sgen') R=120+Math.max(0,(B.lvl||1)-1)*18;
      else if(B.type==='techlab'&&B.shieldMax>0&&(B.shield>0||B.guardT>0)){
        const sz=typeof BT!=='undefined'&&BT.techlab?BT.techlab.size:B.r*2;
        R=Math.max(B.r*1.15,sz*0.82);a=B.guardT>0?0.66:0.58;
      }else continue;
      if(!mfSfFog(B.team,B.x,B.y,true)||!mfSfInView(B.x,B.y,R)) continue;
      n=mfSfPut(n,B.x,mfSfGround(B.x,B.y,null,-1)+0.35,B.y,R,B.team,a,0,0,0,B.type==='sgen'?0.55:0.68,MF_SF_DOME_INST);
    }
  }catch(e){
    MF_SF_TELEM.lastError='collect domes: '+String(e&&e.message||e).slice(0,120);
  }
  return n;
}

function mfSfCollectPlates(){
  let n=0;mfSfPackedHits=0;
  /* Transient shield contacts are packed first. They must remain visible in a
     huge Guard formation even when the persistent plate budget is saturated. */
  for(let i=0;i<mfSfHitN&&n<MF_SF_PLATE_CAP;i++){
    const x=MF_SF_HX[i],y=MF_SF_HY[i],r=MF_SF_HR[i],team=MF_SF_HTEAM[i];
    if(!mfSfFog(team,x,y,false)||!mfSfInView(x,y,r)) continue;
    const nx=-MF_SF_HDX[i],ny=-MF_SF_HDY[i];
    const before=n;
    n=mfSfPut(n,x+nx*r*0.42,MF_SF_HH[i],y+ny*r*0.42,r*0.92,team,0.94,
      Math.atan2(ny,nx),2,MF_SF_HAGE[i],0.82);
    if(n>before)mfSfPackedHits++;
  }
  try{
    if(typeof unitHigh==='number'&&typeof umode!=='undefined') for(let i=0;i<unitHigh&&n<MF_SF_PLATE_CAP;i++){
      if(!ualive[i]||umode[i]!==2||(typeof umodeT!=='undefined'&&umodeT[i]>0)) continue;
      const x=ux[i],y=uy[i],team=uteam[i],T=TYPES[utype[i]]; if(!T) continue;
      const yaw=uang[i]-Math.PI*0.5,r=T.size*0.73;
      if(!mfSfFog(team,x,y,true)||!mfSfInView(x,y,r*1.5)) continue;
      const ahead=Math.max(T.r||4,T.size*0.42)*1.18;
      n=mfSfPut(n,x+Math.cos(yaw)*ahead,mfSfGround(x,y,T,i)+T.size*0.50,
        y+Math.sin(yaw)*ahead,r,team,0.52,yaw,1,0,0.57);
    }
  }catch(e){
    MF_SF_TELEM.lastError='collect plates: '+String(e&&e.message||e).slice(0,120);
  }
  return n;
}

function mfSfSubmit(first,count,n,data){
  if(n<=0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER,mfSfInstVBO);
  gl.bufferSubData(gl.ARRAY_BUFFER,0,data||MF_SF_INST,0,n*MF_SF_INST_FLOATS);
  gl.drawArraysInstanced(gl.TRIANGLES,first,count,n);
  MF_SF_TELEM.drawCalls++;
  try{ if(typeof drawCalls==='number') drawCalls++; if(typeof triCount==='number') triCount+=count/3*n; }catch(_){ }
}

function shieldFxDraw(nightAmount,animationSeconds){
  mfSfSyncBounds();
  MF_SF_TELEM.drawCalls=0;MF_SF_TELEM.domes=0;MF_SF_TELEM.plates=0;MF_SF_TELEM.hits=0;MF_SF_TELEM.culled=0;
  const domes=mfSfCollectDomes();
  const plates=mfSfCollectPlates();
  /* Empty frames are the normal case. CPU visibility/fog collection is enough
     to prove there is no field to show, so do not boot the pass, query/alter
     GL state, or bind anything. This also leaves the renderer's expected 3D
     program intact without a restoration round trip. */
  if(!domes&&!plates) return true;
  if(!shieldFxBoot()) return false;
  const wasProg=gl.getParameter(gl.CURRENT_PROGRAM);
  const wasVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  const wasArr=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  const wasBlend=gl.isEnabled(gl.BLEND),wasCull=gl.isEnabled(gl.CULL_FACE),wasDepth=gl.isEnabled(gl.DEPTH_TEST);
  const wasMask=gl.getParameter(gl.DEPTH_WRITEMASK),wasDepthFunc=gl.getParameter(gl.DEPTH_FUNC);
  const srcRGB=gl.getParameter(gl.BLEND_SRC_RGB),dstRGB=gl.getParameter(gl.BLEND_DST_RGB);
  const srcA=gl.getParameter(gl.BLEND_SRC_ALPHA),dstA=gl.getParameter(gl.BLEND_DST_ALPHA);
  try{
    gl.useProgram(mfSfProg);
    gl.uniformMatrix4fv(mfSfU.uVP,false,matVP);
    gl.uniform3f(mfSfU.uEye,typeof eyeX==='number'?eyeX:0,typeof eyeY==='number'?eyeY:3000,typeof eyeZ==='number'?eyeZ:0);
    gl.uniform1f(mfSfU.uTime,Number.isFinite(Number(animationSeconds))?Number(animationSeconds):mfSfNow());
    gl.uniform1f(mfSfU.uHex,mfSfQuality()==='low'?0:1);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(mfSfVAO);
    if(domes){mfSfSubmit(mfSfDomeFirst,mfSfDomeVerts,domes,MF_SF_DOME_INST);MF_SF_TELEM.domes=domes;}
    if(plates){
      mfSfSubmit(mfSfPlateFirst,mfSfPlateVerts,plates,MF_SF_INST);
      MF_SF_TELEM.plates=plates;MF_SF_TELEM.hits=mfSfPackedHits;
    }
  }catch(e){
    MF_SF_TELEM.lastError='draw: '+String(e&&e.message||e).slice(0,150);
    return false;
  }finally{
    gl.bindVertexArray(wasVAO);gl.bindBuffer(gl.ARRAY_BUFFER,wasArr);
    gl.blendFuncSeparate(srcRGB,dstRGB,srcA,dstA);
    gl.depthFunc(wasDepthFunc);gl.depthMask(wasMask);
    if(wasDepth)gl.enable(gl.DEPTH_TEST);else gl.disable(gl.DEPTH_TEST);
    if(wasCull)gl.enable(gl.CULL_FACE);else gl.disable(gl.CULL_FACE);
    if(wasBlend)gl.enable(gl.BLEND);else gl.disable(gl.BLEND);
    /* Every custom GL pass must hand control back through begin3D. Besides the
       program, it repairs model samplers 0-8 after optional post/FX passes. */
    try{
      if(typeof begin3D==='function'){
        let nA=Number(nightAmount);
        if(!Number.isFinite(nA)) nA=typeof nightAmt==='function'?nightAmt():0;
        begin3D(nA);
      }else gl.useProgram(wasProg);
    }catch(_){gl.useProgram(wasProg);}
  }
  return true;
}

function shieldFxTelemetry(){
  return {
    ready:MF_SF_TELEM.ready,drawCalls:MF_SF_TELEM.drawCalls,domes:MF_SF_TELEM.domes,
    plates:MF_SF_TELEM.plates,hits:MF_SF_TELEM.hits,liveHits:mfSfHitN,
    acceptedHits:MF_SF_TELEM.acceptedHits,rateLimitedHits:MF_SF_TELEM.rateLimitedHits,
    droppedHits:MF_SF_TELEM.droppedHits,culled:MF_SF_TELEM.culled,lastError:MF_SF_TELEM.lastError
  };
}

if(typeof window!=='undefined'){
  window.shieldFxBoot=shieldFxBoot;
  window.shieldFxTick=shieldFxTick;
  window.shieldFxDraw=shieldFxDraw;
  window.shieldFxGLReset=shieldFxGLReset;
  window.shieldFxReset=shieldFxReset;
  window.shieldFxTelemetry=shieldFxTelemetry;
  window.mfShieldHit=mfShieldHit;
  window.MF_SHIELD_FX_TELEMETRY=MF_SF_TELEM;
}
})();
