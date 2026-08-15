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
uniform float uHazeQ;
uniform vec4 uRect;
out vec3 vNrm;out vec3 vObjNrm;out vec3 vWorld;out vec3 vObj;out vec2 vUV;out vec3 vTint;
out float vFog;out float vDamage;out vec2 vFowUV;
void main(){
  float c=cos(aYaw),s=sin(aYaw);
  vec3 sp=vec3(aPos.x*aInst.w,aPos.y*aInst.w,aPos.z*aWide);
  vec3 p=vec3(sp.x*c-sp.z*s,sp.y,sp.x*s+sp.z*c)+aInst.xyz;
  vNrm=normalize(vec3(aNrm.x*c-aNrm.z*s,aNrm.y,aNrm.x*s+aNrm.z*c));
  vObjNrm=aNrm;vWorld=p;vObj=aPos;
  /* Inset authored UVs so mip/atlas bleed cannot sample a neighbour tile's
     copper/emissive into a podium. 0.04 stays inside the 8px pad + 24px
     gutter of each 304px cell even at the coarsest battle mip. */
  vUV=uRect.xy+clamp(aUV,0.04,0.96)*uRect.zw;vTint=aTint.rgb;
  vDamage=clamp(aAnim,0.0,1.0);
  vFowUV=p.xz/MAPSIZE_CONST;
  float d=length(p-uEye);
  float planar=length(vec2(p.x-uEye.x, p.z-uEye.z));
  float hq=uHazeQ>0.01?uHazeQ:1.0;
  vFog=clamp((planar-1380.0)/1900.0,0.0,0.40)*hq;
  float bd=min(min(p.x, MAPSIZE_CONST-p.x), min(p.z, MAPSIZE_CONST-p.z));
  vFog=max(vFog, clamp((BFOG_CONST-bd)/BFOG_CONST,0.0,1.0));
  gl_Position=uVP*vec4(p,1.0);
}`;
const MFWORLD2_FS=`#version 300 es
precision highp float;
in vec3 vNrm;in vec3 vObjNrm;in vec3 vWorld;in vec3 vObj;in vec2 vUV;in vec3 vTint;
in float vFog;in float vDamage;in vec2 vFowUV;
uniform sampler2D uBaseAO;uniform sampler2D uNRE;uniform sampler2D uMasks;uniform sampler2D uDamageTex;uniform sampler2D uDetail;
uniform sampler2D uFowMap;uniform float uFowOn;
uniform vec3 uEye,uSun,uSunC,uAmbSky,uAmbGnd,uFogC;uniform float uNight,uTime,uFamily,uRole;
uniform int uLightCount;uniform vec4 uLightPosR[8];uniform vec4 uLightColI[8];
out vec4 o;
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 mfUvGradClamp(vec2 g){
  float l=length(g);
  return (l>0.25)?g*(0.25/l):g;
}
mat3 cotangent(vec3 N,vec3 p,vec2 uv){
  vec3 dp1=dFdx(p),dp2=dFdy(p);vec2 du1=mfUvGradClamp(dFdx(uv)),du2=mfUvGradClamp(dFdy(uv));
  vec3 p2=cross(dp2,N),p1=cross(N,dp1);
  vec3 T=p2*du1.x+p1*du2.x,B=p2*du1.y+p1*du2.y;
  float t2=dot(T,T),b2=dot(B,B);
  if(max(t2,b2)<1e-10){
    vec3 Tf=normalize(abs(N.y)<0.999?cross(N,vec3(0.0,1.0,0.0)):cross(N,vec3(1.0,0.0,0.0)));
    return mat3(Tf,cross(N,Tf),N);
  }
  vec3 To=T-N*dot(N,T);
  if(dot(To,To)<1e-10){
    vec3 Tf=normalize(abs(N.y)<0.999?cross(N,vec3(0.0,1.0,0.0)):cross(N,vec3(1.0,0.0,0.0)));
    return mat3(Tf,cross(N,Tf),N);
  }
  T=normalize(To);
  vec3 Bn=cross(N,T);
  B=normalize(dot(Bn,B)<0.0?-Bn:Bn);
  return mat3(T,B,N);
}
void main(){
  vec2 dxa=mfUvGradClamp(dFdx(vUV)),dya=mfUvGradClamp(dFdy(vUV));
  vec4 ba=textureGrad(uBaseAO,vUV,dxa,dya),nr=textureGrad(uNRE,vUV,dxa,dya),mk=textureGrad(uMasks,vUV,dxa,dya);
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
  /* SRGB8_ALPHA8 yields LINEAR albedo (AO in alpha stays linear). FS3D and
     terrain light DISPLAY albedo — RGBA8 atlas/canvas * linearized sun, then
     1-exp(-lit*1.55) with no gamma encode. Feeding linear alb into that curve
     parked hulls in the filmic toe (near-black silhouettes) while procedural
     window RGB, already display values, still punched. Encode into the
     production lighting space; keep the shared filmic write so SSAO and
     multiply-shadows share one curve with units and ground. */
  vec3 alb=pow(max(ba.rgb,vec3(0.0)),vec3(1.0/2.2));
  float ao=pow(clamp(ba.a,.06,1.0),1.42),rough=clamp(nr.b,.10,1.0),metal=mk.r,emis=nr.a;
  float micro=detailData-.5;ao=clamp(ao-micro*.035,0.0,1.0);rough=clamp(rough-micro*.075,.08,1.0);
  /* Civilian blocks are weathered warm concrete and ceramic; military plant
     is cold steel with denser soot. This is family grading, not a paint wash,
     so authored roof/window/material separation survives. */
  float grime=mk.a*(uFamily<.5?.42:.72);
  alb*=uFamily<.5?vec3(.92,.88,.82):vec3(.82,.86,.90);
  alb=mix(alb,alb*vec3(.32,.29,.25),grime);
  /* Battle-scale V2 still needs authored age when the structure is healthy.
     Reuse the shared object-space surface tile at low strength: broad faces
     stay quiet, while raised normal detail and sparse rubbed edges keep the
     building from reading as a clean grey cut-out against weathered terrain. */
  float relief=clamp(length(xy),0.0,1.0),weather=smoothstep(.46,.80,damageData);
  float aluma=dot(alb,vec3(.2126,.7152,.0722));
  float authoredEdge=smoothstep(.018,.085,length(vec2(dFdx(aluma),dFdy(aluma))));
  float edgeWear=max(relief*weather,authoredEdge*.72)*(1.0-grime);
  alb*=.96+ao*.08;
  alb=mix(alb,uFamily<.5?vec3(.43,.44,.42):vec3(.38,.42,.46),edgeWear*.31);
  rough=clamp(rough+grime*.18,0.0,1.0);
  rough=clamp(rough+(weather-.5)*.10-edgeWear*.17-(uFamily<.5?0.0:1.0)*metal*.08,0.0,1.0);
  /* Authored emissive maps are mostly black on the legacy rebuilds. Walls
     get occupied windows; caps keep roof beacons — a command camera never
     sees the facade, so facade-only lights made every HQ a silhouette. */
  vec3 on=abs(vObjNrm.y)<.22&&max(abs(vObjNrm.x),abs(vObjNrm.z))>.85?vec3(1.0):vec3(0.0);
  float roofOn=step(.55,vObjNrm.y);
  /* Object position, not interpolated normal: a smoothed corner flips
     abs(n.x)>abs(n.z) mid-face and stair-steps every procedural band. */
  vec2 face=abs(vObj.x)>abs(vObj.z)?vec2(vObj.z,vObj.y):vec2(vObj.x,vObj.y);
  vec2 cell=face*vec2(.072,.098),f=fract(cell),id=floor(cell);
  float pane=step(.24,f.x)*step(f.x,.76)*step(.24,f.y)*step(f.y,.69);
  float occupied=step(.78,hash21(id+vec2(uRole*19.0,7.0)));
  float civilian=(uFamily<.5?1.0:0.0);
  /* CivicBlock already has authored window/emissive strips. Procedural panes
     AND sign bands are reserved for the otherwise-unlit tower. Role 4 used
     to take sign bands; those object-space stripes fought the unwrap and
     read as jagged cyan louvres on the right facade. */
  float tower=float(uRole<.5),window=on.x*pane*occupied*civilian*tower*step(8.0,vObj.y);
  float signBand=on.x*step(.46,f.y)*step(f.y,.55)*step(.18,f.x)*step(f.x,.82);
  float signGate=step(.90,hash21(floor(face*vec2(.025,.041))+vec2(uRole*3.1,2.7)));
  float sign=signBand*signGate*tower;
  float warning=on.x*(1.0-civilian)*step(.80,f.x)*step(.78,f.y)*step(.955,hash21(id+9.4));
  /* Industrial halls and tank farms need powered service detail as much as
     towers need windows, but cool cyan strips made every faction read Nova.
     Sparse amber loading-bay lamps retain the brutalist military character
     and give the facade a useful scale cue without becoming neon trim. */
  float industrial=float(uRole>1.5&&uRole<3.5);
  float service=on.x*industrial*step(.35,f.x)*step(f.x,.65)*step(.70,f.y)*step(.91,hash21(id+vec2(4.2,11.7)));
  /* Night-only occupancy flicker. A noon sin() on every pane read as shader
     strobe; daylight windows stay static. */
  float winPulse=mix(1.0,0.93+0.07*sin(uTime*1.15+id.x*1.7+id.y),uNight);
  vec3 emissive=vec3(.30,.74,.92)*((window*winPulse)*.30+sign*.42)+vec3(1.0,.20,.025)*warning*.86;
  emissive+=vec3(1.0,.42,.085)*service*.56;
  /* Roof lamps are DISCS, not hash cells. floor(xz*0.07) lit a ~14-unit tile
     and bloomed into a white halo on every command-camera cap. */
  vec2 roofCell=fract(vObj.xz*0.34);
  float roofId=hash21(floor(vObj.xz*0.34)+vec2(uRole*5.0,4.2));
  float roofLite=roofOn*step(.96,roofId)*step(length(roofCell-vec2(.5)),.10);
  float lampPulse=mix(1.0,0.90+0.10*sin(uTime*1.35+roofId*8.0),uNight);
  emissive+=vec3(.32,.78,.95)*roofLite*.40*lampPulse;
  /* Authored emis on facades and the tiny roof discs — never a whole cap.
     Sampling NRE.a across roofOn turned neighbouring atlas texels into
     glowing tiles. */
  emissive+=mix(vec3(.22,.63,.84),vec3(1.0,.18,.018),uFamily)*emis*.42*(on.x+roofLite);
  /* Damage carbonises the authored material, destroys polish and turns off
     facade systems. Wreck particles are a separate layer; the surface itself
     must stop looking like intact glossy paint before flames appear. */
  float chip=smoothstep(.36,.84,hash21(floor(face*.31)+floor(vObj.y*.17)));
  float charMask=clamp(vDamage*(.62+.38*damageCrust+.18*chip)+grime*vDamage*.50,0.0,1.0);
  alb=mix(alb,vec3(.018,.015,.013),charMask*.94);
  rough=mix(rough,.985,charMask);metal=mix(metal,0.0,charMask*.94);
  emissive*=1.0-smoothstep(.10,.58,vDamage);
  /* Towers must scorch as soon as they are under fire. A crack-only mask
     stayed black when the carbon tile was quiet, so civic/defense blocks
     looked intact until they popped. */
  float crack=mix(damageCrack,max(damageCrack,.55*tower),.80);
  /* Dead towers used to lose the hot term at vDamage=1, so a collapsed
     civic block read as intact grey. Keep embers on the wreck. */
  float wreck=smoothstep(.88,1.0,vDamage);
  float hot=smoothstep(.10,.46,vDamage)*crack*(1.0-wreck*0.22)+wreck*crack*0.62;
  alb=mix(alb,vec3(.28,.020,.002),hot*.78);
  emissive+=vec3(1.0,.075,.003)*hot*2.25+vec3(1.0,.42,.035)*smoothstep(.42,.80,damageData)*hot*1.05;
  vec3 V=normalize(uEye-vWorld),L=normalize(uSun),H=normalize(V+L);
  float ndl=max(dot(N,L),0.0),ndv=max(dot(N,V),.001),ndh=max(dot(N,H),.001),vdh=max(dot(V,H),0.0);
  float a=rough*rough,a2=a*a,den=ndh*ndh*(a2-1.0)+1.0;
  float D=a2/max(3.14159265*den*den,.001),k=(rough+1.0)*(rough+1.0)*.125;
  float gv=ndv/(ndv*(1.0-k)+k),gl=ndl/(ndl*(1.0-k)+k);
  vec3 f0=mix(vec3(.04),alb,metal),F=f0+(1.0-f0)*pow(1.0-vdh,5.0);
  vec3 spec=D*gv*gl*F/max(4.0*ndl*ndv,.001);
  /* Same command-camera rule as FS3D: (1-metal) kd made steel civic blocks
     ambient-only grey. Do not divide Lambert by PI — production exposure
     was authored without it (the lab shader does, for one showcase object). */
  vec3 kd=(1.0-F)*mix(1.0,0.55,metal),amb=mix(uAmbGnd,uAmbSky,N.y*.5+.5);
  float wrap=dot(N,uSun)*0.5+0.5;
  float sunLen=max(length(vec2(uSun.x,uSun.z)),1e-5);
  float sunSide=dot(vec2(N.x,N.z),vec2(uSun.x,uSun.z)/sunLen);
  ndl=min(1.0,ndl+max(sunSide,0.0)*0.32*(N.y*0.5+0.5));
  /* Lambert sun, not GGX sheet-spec: overhead ndv≈1 made civic roofs one
     pale value. Fade spec on camera-facing caps; keep ndl for day/night. */
  float specAtten=mix(1.0,0.18,smoothstep(0.60,0.94,ndv));
  /* Same sun/ambient weights as FS3D. The 0.68 ambient scale parked civic
     blocks in the filmic toe (black hulls) next to correctly exposed units.
     Overhead ndv lift matches FS3D so HIGH civic HQs are not 0.62-crushed. */
  float metalLift=mix(1.0, mix(0.70, 0.90, smoothstep(0.50, 0.94, ndv)), metal);
  vec3 lit=alb*metalLift*(amb*ao*0.82+uSunC*(ndl*0.92+max(wrap,0.0)*0.10*ao))
    +spec*specAtten*uSunC*ndl;
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
  /* Sharp window/engine lights at noon. 0.34 assumed bloom would carry them
     and they vanished at thresh 0.86. 0.70 keeps charcoal facades and lets
     the panes punch without a bloom soup. */
  float fowA=texture(uFowMap,vFowUV).a*uFowOn;
  /* Civic blocks used to skip the sensor map, so a city on fogged ground
     kept daylight hulls — the same glowing-pieces bug the model shader
     already fixed. Dim lamps with the shroud, then veil only un-fogged faces. */
  lit+=emissive*(.95+uNight*.50)*(1.0-fowA);
  lit=mix(lit,mix(uAmbGnd*0.10,uFogC*0.20,0.5),fowA);
  lit=mix(lit,uFogC,vFog*(1.0-fowA));
  /* Same display contract as FS3D / terrain: filmic roll-off, no extra
     pow(1/2.2) on the output. Albedo was lifted into that space above. */
  lit=vec3(1.0)-exp(-max(lit,vec3(0.0))*1.55);
  o=vec4(clamp(lit,vec3(0.0),vec3(1.0)),1.0);
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
function mfWorld2TexScratch(fn){
  /* Civic maps decode after boot, often mid-match. Binding on the active unit
     (TEXTURE0 / atlas) then leaving it there made every hull sample a 1x1
     placeholder for a frame. Unit 7 is the shared scratch (ads, detail);
     restore the previous 7-binding, never bindTexture(null), never unit 0. */
  const was=gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE7);
  const prev=gl.getParameter(gl.TEXTURE_BINDING_2D);
  fn();
  gl.bindTexture(gl.TEXTURE_2D,prev);
  gl.activeTexture(was);
}
function mfWorld2Placeholder(r,g,b,a){
  const t=gl.createTexture();
  mfWorld2TexScratch(()=>{
    gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([r,g,b,a]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  });
  return t;
}
function mfWorld2Load(tex,file,srgb,epoch,repeat){
  const img=new Image();img.onload=()=>{
    if(epoch!==glEpoch)return;
    const align=gl.getParameter(gl.UNPACK_ALIGNMENT),flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    mfWorld2TexScratch(()=>{
      gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
      gl.texImage2D(gl.TEXTURE_2D,0,srgb?gl.SRGB8_ALPHA8:gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,img);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
      if(typeof mfAniso==='function') mfAniso();
      else {
        const an=gl.getExtension('EXT_texture_filter_anisotropic');
        if(an)gl.texParameterf(gl.TEXTURE_2D,an.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      }
      gl.pixelStorei(gl.UNPACK_ALIGNMENT,align);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);
    });
    mfWorld2Loaded++;mfWorld2Ready=mfWorld2Loaded===5&&!mfWorld2Error;
  };
  img.onerror=()=>{mfWorld2Error=true;mfWorld2Ready=false;console.warn('[WorldV2] texture unavailable:',file);};
  /* Concatenated path — OTA string-replace never matches. mf2AssetURL reads
     __MF_OTA_ASSETS first so a 1.33.31 APK that only ever OTA-updated still
     gets the shared maps. A 404 here latches mfWorld2Error and the production
     atlas (already in the APK / inlined in the payload) draws the city. */
  img.src=(typeof mf2AssetURL==='function')?mf2AssetURL('assets/textures/materials/'+file)
                                          :('./assets/textures/materials/'+file);
}
function mfWorld2Init(){
  mfWorld2Ready=false;mfWorld2Loaded=0;mfWorld2Error=false;mfWorld2Epoch=glEpoch;
  mfWorld2Prog=mkProg(
    MFWORLD2_VS.replace(/MAPSIZE_CONST/g,MAP.toFixed(1)).replace(/BFOG_CONST/g,'430.0'),
    MFWORLD2_FS,'world-structures-v2');if(!mfWorld2Prog){mfWorld2Error=true;return;}
  for(const k of ['uVP','uEye','uHazeQ','uRect','uBaseAO','uNRE','uMasks','uDamageTex','uDetail','uFowMap','uFowOn','uSun','uSunC','uAmbSky','uAmbGnd','uFogC','uNight','uTime','uFamily','uRole','uLightCount'])
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
  /* HIGH/CINEMATIC only. Mid used to keep this path so civic hulls would
     not "look like a missing shader", but the PBR civic pass is HIGH-class
     work (extra maps, 8-light loop, detail on unit 7). MEDIUM falls back
     to the production atlas — still a building, much cheaper. */
  const G=typeof GFX!=='undefined'?GFX:{};
  if(G.worldV2===false) return false;
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
  const health=R.hpm>0?clamp(R.hp/Math.max(1,R.hpm),0,1):0;
  M.add(R.x,R.y,height,scale*(R.kind===0?.9:1),R.a+(R.lean||0)+(R.alive?0:0.42),255,255,255,255,undefined,R.alive?1-health:1);
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
  /* Unit 8 is the live sensor map in the model pass. Terrain rebinds it to
     splat art, so this flush must put fogTex back before sampling. */
  const fowReady=typeof fogGameplayActive==='function'&&fogGameplayActive()&&!demoMode&&typeof fogTex!=='undefined'&&fogTex;
  gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_2D,fowReady?fogTex:mfWorld2BaseAO);
  if(mfWorld2U.uFowMap!=null){gl.uniform1i(mfWorld2U.uFowMap,8);gl.uniform1f(mfWorld2U.uFowOn,fowReady?1:0);}
  gl.uniformMatrix4fv(mfWorld2U.uVP,false,matVP);gl.uniform3f(mfWorld2U.uEye,eyeX,eyeY,eyeZ);
  if(mfWorld2U.uHazeQ) gl.uniform1f(mfWorld2U.uHazeQ, typeof mfHazeQ==='function'?mfHazeQ():1);
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

