;
;
/* ============================================================================
   MATERIAL SYSTEM V2 — MAP STRUCTURES
   ----------------------------------------------------------------------------
   The five map-generated civilian/military structures use the same authored
   BaseAO / normal-roughness-emissive / material-mask contract proven by the V2
   tank and factory.  They are packed into three shared 1024 maps because a
   battlefield may contain hundreds of these objects; loading their individual
   2048 showcase maps would spend roughly 320 MB before mipmaps.

   HIGH and CINEMATIC use this battle material LOD. LOW, failed texture loads,
   and `?worldv2=0` retain the old InstMesh path, which makes the conversion
   reversible and prevents a missing optional asset from erasing a city.
   ============================================================================ */
const MFWORLD2_QUERY=typeof location!=='undefined'?new URLSearchParams(location.search):new URLSearchParams();
const MFWORLD2_DISABLED=MFWORLD2_QUERY.get('worldv2')==='0';
const MFWORLD2_DEFS=[
  {kind:0,key:'mdlCityTower',family:0,role:0,rect:[.0234375,.0234375,.296875,.296875]},
  {kind:1,key:'mdlCityDome', family:0,role:1,rect:[.3515625,.0234375,.296875,.296875]},
  {kind:2,key:'mdlCityHall', family:1,role:2,rect:[.6796875,.0234375,.296875,.296875]},
  {kind:3,key:'mdlCityTank', family:1,role:3,rect:[.0234375,.3515625,.296875,.296875]},
  {kind:4,key:'mdlCivicBlock',family:0,role:4,rect:[.3515625,.3515625,.296875,.296875]},
];
let mfWorld2Prog=null,mfWorld2U={},mfWorld2BaseAO=null,mfWorld2NRE=null,mfWorld2Masks=null,mfWorld2DamageTex=null,mfWorld2Detail=null;
let mfWorld2Meshes={},mfWorld2Ready=false,mfWorld2Loaded=0,mfWorld2Error=false,mfWorld2Epoch=-1;

const MFWORLD2_VS=`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
layout(location=3) in vec2 aUV;
layout(location=4) in float aMat;
layout(location=5) in vec4 aInst;
layout(location=6) in float aYaw;
layout(location=7) in vec4 aTint;
layout(location=8) in float aWide;
layout(location=9) in float aAnim;
uniform mat4 uVP;
uniform vec3 uEye;
uniform vec4 uRect;
out vec3 vNrm;out vec3 vObjNrm;out vec3 vWorld;out vec3 vObj;out vec2 vUV;out vec3 vTint;
out float vFog;out float vDamage;
void main(){
  float c=cos(aYaw),s=sin(aYaw);
  vec3 sp=vec3(aPos.x*aInst.w,aPos.y*aInst.w,aPos.z*aWide);
  vec3 p=vec3(sp.x*c-sp.z*s,sp.y,sp.x*s+sp.z*c)+aInst.xyz;
  vNrm=normalize(vec3(aNrm.x*c-aNrm.z*s,aNrm.y,aNrm.x*s+aNrm.z*c));
  vObjNrm=aNrm;vWorld=p;vObj=aPos;vUV=uRect.xy+aUV*uRect.zw;vTint=aTint.rgb;
  vDamage=clamp(aAnim,0.0,1.0);
  float d=length(p-uEye);vFog=clamp((d-2600.0)/4200.0,0.0,0.55);
  gl_Position=uVP*vec4(p,1.0);
}`;
const MFWORLD2_FS=`#version 300 es
precision highp float;
in vec3 vNrm;in vec3 vObjNrm;in vec3 vWorld;in vec3 vObj;in vec2 vUV;in vec3 vTint;
in float vFog;in float vDamage;
uniform sampler2D uBaseAO;uniform sampler2D uNRE;uniform sampler2D uMasks;uniform sampler2D uDamageTex;uniform sampler2D uDetail;
uniform vec3 uEye,uSun,uSunC,uAmbSky,uAmbGnd,uFogC;uniform float uNight,uTime,uFamily,uRole;
uniform int uLightCount;uniform vec4 uLightPosR[8];uniform vec4 uLightColI[8];
out vec4 o;
vec3 linearToSrgb(vec3 c){return pow(max(c,vec3(0.0)),vec3(1.0/2.2));}
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
mat3 cotangent(vec3 N,vec3 p,vec2 uv){
  vec3 dp1=dFdx(p),dp2=dFdy(p);vec2 du1=dFdx(uv),du2=dFdy(uv);
  vec3 p2=cross(dp2,N),p1=cross(N,dp1);
  vec3 T=p2*du1.x+p1*du2.x,B=p2*du1.y+p1*du2.y;
  float inv=inversesqrt(max(max(dot(T,T),dot(B,B)),1e-8));return mat3(T*inv,B*inv,N);
}
void main(){
  vec4 ba=texture(uBaseAO,vUV),nr=texture(uNRE,vUV),mk=texture(uMasks,vUV);
  vec3 dan=pow(abs(normalize(vObjNrm))+vec3(.0001),vec3(5.0));dan/=dan.x+dan.y+dan.z;
  float damageData=texture(uDamageTex,vObj.zy*.078).r*dan.x+
    texture(uDamageTex,vObj.xz*.078).r*dan.y+texture(uDamageTex,vObj.xy*.078).r*dan.z;
  /* Shared neutral micro-surface detail gives civilian concrete, ceramic and
     military alloy the same restrained age/roughness breakup as live units.
     It is intentionally far weaker than the authored maps: it should support
     roof seams and facade normals, never turn a city into visual static. */
  float detailData=texture(uDetail,vObj.zy*.115).r*dan.x+
    texture(uDetail,vObj.xz*.115).r*dan.y+texture(uDetail,vObj.xy*.115).r*dan.z;
  float damageCrust=smoothstep(.055,.38,damageData),damageCrack=smoothstep(.23,.49,damageData);
  vec2 xy=(nr.rg*2.0-1.0)*1.18;float nz=sqrt(max(.03,1.0-dot(xy,xy)));
  vec3 N=normalize(cotangent(normalize(vNrm),vWorld,vUV)*vec3(xy,nz));
  vec3 alb=ba.rgb;float ao=pow(clamp(ba.a,.06,1.0),1.42),rough=clamp(nr.b,.10,1.0),metal=mk.r,emis=nr.a;
  float micro=detailData-.5;ao=clamp(ao-micro*.035,0.0,1.0);rough=clamp(rough-micro*.075,.08,1.0);
  /* Civilian blocks are weathered warm concrete and ceramic; military plant
     is cold steel with denser soot. This is family grading, not a paint wash,
     so authored roof/window/material separation survives. */
  float grime=mk.a*(uFamily<.5?.42:.72);
  alb*=uFamily<.5?vec3(.88,.84,.78):vec3(.72,.79,.84);
  alb=mix(alb,alb*vec3(.32,.29,.25),grime);
  /* Battle-scale V2 still needs authored age when the structure is healthy.
     Reuse the shared object-space surface tile at low strength: broad faces
     stay quiet, while raised normal detail and sparse rubbed edges keep the
     building from reading as a clean grey cut-out against weathered terrain. */
  float relief=clamp(length(xy),0.0,1.0),weather=smoothstep(.46,.80,damageData);
  float aluma=dot(alb,vec3(.2126,.7152,.0722));
  float authoredEdge=smoothstep(.018,.085,length(vec2(dFdx(aluma),dFdy(aluma))));
  float edgeWear=max(relief*weather,authoredEdge*.72)*(1.0-grime);
  alb*=.90+ao*.10;
  alb=mix(alb,uFamily<.5?vec3(.43,.44,.42):vec3(.38,.42,.46),edgeWear*.31);
  rough=clamp(rough+grime*.18,0.0,1.0);
  rough=clamp(rough+(weather-.5)*.10-edgeWear*.17-(uFamily<.5?0.0:1.0)*metal*.08,0.0,1.0);
  /* Authored emissive maps are mostly black on the legacy rebuilds. Add only
     semantic facade detail here: vertical walls receive occupied windows,
     pictogram bars and warning lamps; roofs and foundations can never glow. */
  vec3 on=abs(vObjNrm.y)<.48?vec3(1.0):vec3(0.0);
  vec2 face=abs(vObjNrm.x)>abs(vObjNrm.z)?vec2(vObj.z,vObj.y):vec2(vObj.x,vObj.y);
  vec2 cell=face*vec2(.072,.098),f=fract(cell),id=floor(cell);
  float pane=step(.24,f.x)*step(f.x,.76)*step(.24,f.y)*step(f.y,.69);
  float occupied=step(.78,hash21(id+vec2(uRole*19.0,7.0)));
  float civilian=(uFamily<.5?1.0:0.0);
  /* CivicBlock already has authored window/emissive strips. Procedural panes
     are reserved for the otherwise-unlit tower, and only above its service
     plinth. Applying them to every civil mesh produced the blue circuit-board
     wash that the V2 material system was specifically meant to replace. */
  float tower=float(uRole<.5),window=on.x*pane*occupied*civilian*tower*step(8.0,vObj.y);
  float signBand=on.x*step(.46,f.y)*step(f.y,.55)*step(.18,f.x)*step(f.x,.82);
  float signGate=step(.90,hash21(floor(face*vec2(.025,.041))+vec2(uRole*3.1,2.7)));
  float sign=signBand*signGate*float(uRole<.5||uRole>3.5);
  float warning=on.x*(1.0-civilian)*step(.80,f.x)*step(.78,f.y)*step(.955,hash21(id+9.4));
  /* Industrial halls and tank farms need powered service detail as much as
     towers need windows, but cool cyan strips made every faction read Nova.
     Sparse amber loading-bay lamps retain the brutalist military character
     and give the facade a useful scale cue without becoming neon trim. */
  float industrial=float(uRole>1.5&&uRole<3.5);
  float service=on.x*industrial*step(.35,f.x)*step(f.x,.65)*step(.70,f.y)*step(.91,hash21(id+vec2(4.2,11.7)));
  vec3 emissive=vec3(.30,.74,.92)*(window*.30+sign*.42)+vec3(1.0,.20,.025)*warning*.86;
  emissive+=vec3(1.0,.42,.085)*service*.56;
  emissive+=mix(vec3(.22,.63,.84),vec3(1.0,.18,.018),uFamily)*emis*.38;
  /* Damage carbonises the authored material, destroys polish and turns off
     facade systems. Wreck particles are a separate layer; the surface itself
     must stop looking like intact glossy paint before flames appear. */
  float chip=smoothstep(.36,.84,hash21(floor(face*.31)+floor(vObj.y*.17)));
  float charMask=clamp(vDamage*(.42+.42*damageCrust+.16*chip)+grime*vDamage*.45,0.0,1.0);
  alb=mix(alb,vec3(.018,.015,.013),charMask*.92);
  rough=mix(rough,.985,charMask);metal=mix(metal,0.0,charMask*.92);
  emissive*=1.0-smoothstep(.18,.72,vDamage);
  /* The same triplanar carbon/crack tile used by the V2 tank and factory makes
     burning scenery a material state, not a fire sprite hovering over clean
     steel. Orange heat stays inside the narrow fractures while surrounding
     crust becomes matte charcoal. */
  float hot=smoothstep(.30,.68,vDamage)*damageCrack*(1.0-smoothstep(.88,1.0,vDamage));
  alb=mix(alb,vec3(.26,.018,.002),hot*.58);
  emissive+=vec3(1.0,.075,.003)*hot*1.65+vec3(1.0,.42,.035)*smoothstep(.69,.90,damageData)*hot*.72;
  vec3 V=normalize(uEye-vWorld),L=normalize(uSun),H=normalize(V+L);
  float ndl=max(dot(N,L),0.0),ndv=max(dot(N,V),.001),ndh=max(dot(N,H),.001),vdh=max(dot(V,H),0.0);
  float a=rough*rough,a2=a*a,den=ndh*ndh*(a2-1.0)+1.0;
  float D=a2/max(3.14159265*den*den,.001),k=(rough+1.0)*(rough+1.0)*.125;
  float gv=ndv/(ndv*(1.0-k)+k),gl=ndl/(ndl*(1.0-k)+k);
  vec3 f0=mix(vec3(.04),alb,metal),F=f0+(1.0-f0)*pow(1.0-vdh,5.0);
  vec3 spec=D*gv*gl*F/max(4.0*ndl*ndv,.001);
  vec3 kd=(1.0-F)*(1.0-metal),amb=mix(uAmbGnd,uAmbSky,N.y*.5+.5);
  vec3 lit=alb*amb*ao*.94+(kd*alb/3.14159265+spec)*uSunC*ndl;
  /* Eight camera-relevant sources are already selected for the production
     forward renderer. Reusing that list gives powered windows/signage actual
     environmental influence without turning every window into a GPU light. */
  for(int i=0;i<8;i++){
    if(i>=uLightCount)break;
    vec3 d=uLightPosR[i].xyz-vWorld;float dist=length(d),att=pow(clamp(1.0-dist/uLightPosR[i].w,0.0,1.0),2.0);
    vec3 ll=d/max(dist,.001);float nll=max(dot(N,ll),0.0);
    lit+=(alb*(1.0-metal)*.34+f0*.20)*uLightColI[i].rgb*uLightColI[i].a*nll*att;
  }
  vec3 env=mix(uAmbGnd,uAmbSky,clamp(N.y*.5+.5,0.0,1.0));
  lit+=env*(f0+(1.0-f0)*pow(1.0-ndv,5.0))*(1.0-rough)*.28*ao*(1.0-charMask);
  lit+=emissive*(.34+uNight*.92);
  lit=mix(lit,uFogC,vFog);
  lit=vec3(1.0)-exp(-max(lit,vec3(0.0))*1.24);
  o=vec4(clamp(linearToSrgb(lit),0.0,1.0),1.0);
}`;

class MFWorldV2InstMesh extends InstMesh{
  constructor(gl,geo,cap,def){super(gl,geo,cap);this.def=def;}
  flushWorld(){
    if(!this.n)return;
    const g=this.gl,D=this.def;
    g.uniform4fv(mfWorld2U.uRect,D.rect);g.uniform1f(mfWorld2U.uFamily,D.family);g.uniform1f(mfWorld2U.uRole,D.role);
    g.bindVertexArray(this.vao);g.bindBuffer(g.ARRAY_BUFFER,this.ivb);
    g.bufferSubData(g.ARRAY_BUFFER,0,this.data,0,this.n*INST_FLOATS);
    g.drawElementsInstanced(g.TRIANGLES,this.count,g.UNSIGNED_SHORT,0,this.n);
    drawCalls++;triCount+=this.count/3*this.n;this.n=0;
  }
}
function mfWorld2Placeholder(r,g,b,a){
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([r,g,b,a]));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  return t;
}
function mfWorld2Load(tex,file,srgb,epoch,repeat){
  const img=new Image();img.onload=()=>{
    if(epoch!==glEpoch)return;
    gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage2D(gl.TEXTURE_2D,0,srgb?gl.SRGB8_ALPHA8:gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,img);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
    const an=gl.getExtension('EXT_texture_filter_anisotropic');
    if(an)gl.texParameterf(gl.TEXTURE_2D,an.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    mfWorld2Loaded++;mfWorld2Ready=mfWorld2Loaded===5&&!mfWorld2Error;
  };
  img.onerror=()=>{mfWorld2Error=true;mfWorld2Ready=false;console.warn('[WorldV2] texture unavailable:',file);};
  img.src='./assets/textures/materials/'+file;
}
function mfWorld2Init(){
  mfWorld2Ready=false;mfWorld2Loaded=0;mfWorld2Error=false;mfWorld2Epoch=glEpoch;
  mfWorld2Prog=mkProg(MFWORLD2_VS,MFWORLD2_FS,'world-structures-v2');if(!mfWorld2Prog){mfWorld2Error=true;return;}
  for(const k of ['uVP','uEye','uRect','uBaseAO','uNRE','uMasks','uDamageTex','uDetail','uSun','uSunC','uAmbSky','uAmbGnd','uFogC','uNight','uTime','uFamily','uRole','uLightCount'])
    mfWorld2U[k]=gl.getUniformLocation(mfWorld2Prog,k);
  mfWorld2U.uLightPosR=gl.getUniformLocation(mfWorld2Prog,'uLightPosR[0]');mfWorld2U.uLightColI=gl.getUniformLocation(mfWorld2Prog,'uLightColI[0]');
  mfWorld2BaseAO=mfWorld2Placeholder(128,128,128,255);mfWorld2NRE=mfWorld2Placeholder(128,128,220,0);mfWorld2Masks=mfWorld2Placeholder(0,0,0,0);
  mfWorld2DamageTex=mfWorld2Placeholder(22,22,22,255);
  mfWorld2Detail=mfWorld2Placeholder(128,128,128,255);
  /* The atlas PNG stores display/sRGB albedo in RGB and linear AO in alpha.
     Loading it as plain RGBA treated encoded mid-grey as linear light, then
     linearToSrgb() lifted it a second time: roofs clipped pale and baked AO
     disappeared. SRGB8_ALPHA8 decodes RGB only; alpha remains linear, which is
     exactly this packed map's contract. */
  mfWorld2Load(mfWorld2BaseAO,'mf-world-structures-v2-baseao.png',true,mfWorld2Epoch);
  mfWorld2Load(mfWorld2NRE,'mf-world-structures-v2-nre.png',false,mfWorld2Epoch);
  mfWorld2Load(mfWorld2Masks,'mf-world-structures-v2-masks.png',false,mfWorld2Epoch);
  mfWorld2Load(mfWorld2DamageTex,'mf2-carbon-cracks-v1.png',false,mfWorld2Epoch,true);
  mfWorld2Load(mfWorld2Detail,'mf_mechanical_microdetail_v2.webp',false,mfWorld2Epoch,true);
}
function mfWorldV2Enabled(){
  const q=typeof qualityKey==='function'?qualityKey():'high';
  return !MFWORLD2_DISABLED&&q!=='low'&&mfWorld2Ready&&mfWorld2Epoch===glEpoch;
}
function mfWorldV2Queue(R,scale,height,lod){
  /* V2 is the tactical/showcase material. At strategic range its normal,
     mask, damage and eight-light reads collapse into a few pixels, so the
     caller deliberately falls back to the legacy one-atlas material. That is
     material LOD, not an asset failure, and keeps city density scalable. */
  if(!mfWorldV2Enabled()||(lod||2)<2)return false;
  const M=mfWorld2Meshes[R.kind];if(!M)return false;
  const health=R.hpm>0?clamp(R.hp/R.hpm,0,1):1;
  M.add(R.x,R.y,height,scale*(R.kind===0?.9:1),R.a+(R.lean||0),255,255,255,255,undefined,1-health);
  return true;
}
function mfWorldV2Flush(S,nA,time){
  if(!mfWorldV2Enabled())return false;
  const wasBlend=gl.isEnabled(gl.BLEND),wasCull=gl.isEnabled(gl.CULL_FACE),wasDepth=gl.isEnabled(gl.DEPTH_TEST),wasMask=gl.getParameter(gl.DEPTH_WRITEMASK);
  gl.useProgram(mfWorld2Prog);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.depthMask(true);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,mfWorld2BaseAO);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,mfWorld2NRE);
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,mfWorld2Masks);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mfWorld2DamageTex);
  /* Unit 7 is outside the 4/5/6 post chain and is rebound by begin3D after the
     world pass, so detailed civic materials cannot corrupt AO or bloom. */
  gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,mfWorld2Detail);
  gl.uniform1i(mfWorld2U.uBaseAO,0);gl.uniform1i(mfWorld2U.uNRE,2);gl.uniform1i(mfWorld2U.uMasks,3);gl.uniform1i(mfWorld2U.uDamageTex,1);gl.uniform1i(mfWorld2U.uDetail,7);
  gl.uniformMatrix4fv(mfWorld2U.uVP,false,matVP);gl.uniform3f(mfWorld2U.uEye,eyeX,eyeY,eyeZ);
  gl.uniform3f(mfWorld2U.uSun,S.dir[0],S.dir[1],S.dir[2]);
  let c=_lin(S.col);gl.uniform3f(mfWorld2U.uSunC,c[0],c[1],c[2]);c=_lin(S.sky);gl.uniform3f(mfWorld2U.uAmbSky,c[0],c[1],c[2]);
  c=_lin(S.gnd);gl.uniform3f(mfWorld2U.uAmbGnd,c[0],c[1],c[2]);c=_lin(S.fog);gl.uniform3f(mfWorld2U.uFogC,c[0],c[1],c[2]);
  gl.uniform1f(mfWorld2U.uNight,nA);gl.uniform1f(mfWorld2U.uTime,time);gl.uniform1i(mfWorld2U.uLightCount,_sceneLightN);
  if(_sceneLightN){gl.uniform4fv(mfWorld2U.uLightPosR,_sceneLightPR);gl.uniform4fv(mfWorld2U.uLightColI,_sceneLightCI);}
  for(const D of MFWORLD2_DEFS){const M=mfWorld2Meshes[D.kind];if(M)M.flushWorld();}
  if(wasBlend)gl.enable(gl.BLEND);else gl.disable(gl.BLEND);if(wasCull)gl.enable(gl.CULL_FACE);else gl.disable(gl.CULL_FACE);
  if(wasDepth)gl.enable(gl.DEPTH_TEST);else gl.disable(gl.DEPTH_TEST);gl.depthMask(wasMask);gl.activeTexture(gl.TEXTURE0);
  begin3D(nA);return true;
}

/* Take over after models-civic so the old world meshes remain present as a
   runtime fallback. V2 owns separate authored-UV VAOs and shared textures. */
const mfWorld2BaseInitModels=initModels;
initModels=function(){
  mfWorld2BaseInitModels();mfWorld2Init();mfWorld2Meshes={};
  for(const D of MFWORLD2_DEFS){const geo=loadWorldModel(D.key,true);if(geo)mfWorld2Meshes[D.kind]=new MFWorldV2InstMesh(gl,geo,420,D);}
};
if(typeof window!=='undefined')window.MFWorldStructuresV2={
  status:()=>({enabled:mfWorldV2Enabled(),ready:mfWorld2Ready,error:mfWorld2Error,loaded:mfWorld2Loaded,epoch:mfWorld2Epoch}),
  definitions:MFWORLD2_DEFS
};

