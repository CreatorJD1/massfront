/* ============================================================================
   MATERIAL SYSTEM V2 — OPT-IN BENCHMARK LAB
   ----------------------------------------------------------------------------
   This is deliberately parallel to the production atlas renderer. Nothing in
   the live roster opts in yet. `?materiallab=1` opens a deterministic scene
   that compares identical geometry through legacy and V2 lighting, exercises
   authored UV0/masks, and exposes channel debug views. Keeping the laboratory
   behind an explicit query means normal battles allocate zero V2 textures,
   programs or buffers until the architecture proves its cost and appearance.

   Packed prototype contract (chosen after auditing the existing renderer):
     A: RGB authored base colour, A baked AO
     B: RG tangent normal XY, B roughness, A emissive
     C: R metal, G faction-primary mask, B secondary mask, A wear

   This is a prototype contract, not permission to convert the asset library.
   ============================================================================ */
const MF2_QUERY=typeof location!=='undefined'?new URLSearchParams(location.search):new URLSearchParams();
const MF2_LAB_ENABLED=MF2_QUERY.get('materiallab')==='1';
const MF2_SHOWCASE=MF2_QUERY.get('materialquality')==='showcase';
const MF2_AUTHORED_LOD=MF2_QUERY.get('materiallod')==='1'?1:0;
const MF2_ASSET=MF2_QUERY.get('materialasset')==='factory'?'factory':MF2_QUERY.get('materialasset')==='commander'?'commander':'tank';
const MF2_ASSET_KEY=MF2_ASSET==='factory'?'novaFactoryV2':MF2_ASSET==='commander'?'novaCommanderV2':'novaHeavyTankV2';
const MF2_ASSET_FILE=MF2_ASSET==='factory'?'material-v2-nova-factory':MF2_ASSET==='commander'?'material-v2-commander':'material-v2-tank';
const MF2_MAP_FILE=MF2_ASSET==='factory'?'nova-factory-v2':MF2_ASSET==='commander'?'nova-commander-v2':'nova-heavy-tank-v2';
const MF2_TEX_SIZE=MF2_SHOWCASE?1024:512,MF2_GRID=24;
let mf2Prog=null,mf2U={},mf2BaseAO=null,mf2NRE=null,mf2Masks=null,mf2DamageTex=null,mf2Epoch=-1;
let mf2LegacyTank=null,mf2Tank=null,mf2Stage=null,mf2LegacyStage=null,mf2Refs=[],mf2Cells=[],mf2SharedUV=new Map(),mf2Geo=null,mf2TankCellCount=0;
let mf2Debug=0,mf2Night=0,mf2LabCount=1,mf2LabPath='v2',mf2Overlay=null,mf2LastGLError=0;
let mf2Damage=0;
let mf2View=MF2_QUERY.get('materialview')||'close';
let mf2DetailPixels=null,mf2DetailSide=0,mf2DetailReady=false,mf2DetailRequested=false;
let mf2PayloadRequested=false,mf2PayloadFailed=false,mf2ImportedMeta=null;
let mf2AuthoredMapsReady=false;

const MF2_VS=`#version 300 es
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
out vec3 vNrm;out vec3 vObjNrm;out vec3 vCol;out vec3 vTint;out vec3 vWorld;out vec3 vObj;out vec2 vUV;
out float vFog;flat out float vSurface;
void main(){
  float c=cos(aYaw),s=sin(aYaw);
  vec3 sp=vec3(aPos.x*aInst.w,aPos.y*aInst.w,aPos.z*aWide);
  vec3 p=vec3(sp.x*c-sp.z*s,sp.y,sp.x*s+sp.z*c)+aInst.xyz;
  vNrm=vec3(aNrm.x*c-aNrm.z*s,aNrm.y,aNrm.x*s+aNrm.z*c);vObjNrm=aNrm;
  vCol=aCol;vTint=aTint.rgb;vWorld=p;vObj=aPos;vUV=aUV;
  vSurface=floor(abs(aMat))-1.0;
  float d=length(p-uEye);
  float planar=length(vec2(p.x-uEye.x, p.z-uEye.z));
  vFog=clamp((planar-1380.0)/1900.0,0.0,0.40);
  gl_Position=uVP*vec4(p,1.0);
}`;
const MF2_FS=`#version 300 es
precision highp float;
in vec3 vNrm;in vec3 vObjNrm;in vec3 vCol;in vec3 vTint;in vec3 vWorld;in vec3 vObj;in vec2 vUV;in float vFog;
flat in float vSurface;
uniform sampler2D uBaseAO;
uniform sampler2D uNRE;
uniform sampler2D uMasks;
uniform sampler2D uDamageTex;
uniform vec3 uEye,uSun,uSunC,uAmbSky,uAmbGnd,uFogC,uSecondary,uEmissive;
uniform int uDebug;uniform float uShowcase,uDamage,uAssetKind;
out vec4 o;
vec3 srgbToLinear(vec3 c){return pow(max(c,vec3(0.0)),vec3(2.2));}
vec2 mfUvGradClamp(vec2 g){
  float l=length(g);
  return (l>0.25)?g*(0.25/l):g;
}
mat3 cotangent(vec3 N,vec3 p,vec2 uv){
  vec3 dp1=dFdx(p),dp2=dFdy(p);
  vec2 du1=mfUvGradClamp(dFdx(uv)),du2=mfUvGradClamp(dFdy(uv));
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
  vec4 ba=textureGrad(uBaseAO,vUV,dxa,dya);vec4 nr=textureGrad(uNRE,vUV,dxa,dya);vec4 mk=textureGrad(uMasks,vUV,dxa,dya);
  /* A separate authored burn tile is triplanar-mapped in object space. That
     keeps the fracture scale stable while a unit moves and avoids stretching
     the same crack across unrelated UV islands. Only damage states consume
     the data; clean armor remains exactly as authored. */
  vec3 dan=pow(abs(normalize(vObjNrm))+vec3(.0001),vec3(5.0));dan/=dan.x+dan.y+dan.z;
  float damageData=texture(uDamageTex,vObj.zy*.078).r*dan.x+
    texture(uDamageTex,vObj.xz*.078).r*dan.y+texture(uDamageTex,vObj.xy*.078).r*dan.z;
  /* The authored source contains hairline and primary fractures. Preserve a
     broad-enough band that the line network survives 412 px phone rendering. */
  float damageCrack=smoothstep(.20,.46,damageData);
  float damageCrust=smoothstep(.045,.36,damageData);
  vec2 xy=(nr.rg*2.0-1.0)*mix(1.0,1.08,uShowcase);float nz=sqrt(max(0.02,1.0-dot(xy,xy)));
  vec3 N=normalize(cotangent(normalize(vNrm),vWorld,vUV)*vec3(xy,nz));
  /* Blender writes the diffuse bake as linear data into this packed map; it is
     intentionally not an SRGB8 texture at runtime. Linearising it a second
     time crushed deep-blue armor almost to black. */
  vec3 authored=ba.rgb*mix(vec3(1.0),srgbToLinear(vCol),0.20);
  vec3 primary=srgbToLinear(vTint),secondary=srgbToLinear(uSecondary);
  vec3 alb=mix(authored,primary,mk.g*0.78);
  alb=mix(alb,secondary,mk.b*0.72);
  /* Global material fatigue is restrained; localized packed-mask damage below
     still carries the actual chips/scorch. This keeps the state readable at
     phone distance without repainting the faction identification panels. */
  alb*=mix(vec3(1.0),vec3(0.86,0.82,0.78),uDamage*0.42);
  float ao=ba.a,rough=clamp(nr.b,0.055,1.0),metal=mk.r,emis=nr.a;
  /* Wear remains authored in the packed mask; the state control changes only
     its presentation, so clean/worn/critical reuse identical UVs and batches. */
  float state=clamp(uDamage,0.0,1.0),destroyed=smoothstep(1.15,1.85,uDamage);
  float impact=smoothstep(0.58,0.94,mk.a);
  float edgeMask=clamp(min(mk.a,0.48)/0.48,0.0,1.0);
  /* The vehicle is field-used even in its undamaged inventory state. Damage
     increases the same authored curvature mask, but clean no longer means
     factory-plastic edges with zero exposed alloy. */
  float wear=edgeMask*mix(.30,1.0,smoothstep(0.08,0.58,state));
  /* Wear exposes a cooler, smoother metallic edge. The first prototype
     darkened worn pixels, outlining every face in black and destroying the
     machined highlight language visible in the quality reference. */
  alb=mix(alb,vec3(.43,.50,.59),wear*.64);
  rough=mix(rough,.20,wear*.52);metal=max(metal,wear*.86);
  /* Values above the edge-wear range are authored object-space strikes. They
     stay on real armor regions after UV repacks instead of blackening every
     cavity, which was visually noisy and mechanically implausible. */
  /* The packed mask carries the authored strikes, while these matching
     object-space ellipsoids feather them beyond a few UV texels. Without the
     feather, the BURNING state read almost clean at phone distance even though
     the heat particles were active. */
   /* Each benchmark has different impact landmarks. Do not extrapolate the
      factory profile to the commander: it would turn the narrow hero into a
      broad burning blob and make the damage comparison meaningless. */
   vec3 hitA,hitB,hitC;
   if(uAssetKind>1.5){
     hitA=(vObj-vec3(2.0,16.0,0.0))/vec3(6.0,6.0,7.0);
     hitB=(vObj-vec3(-1.8,22.0,3.0))/vec3(5.0,5.0,4.5);
     hitC=(vObj-vec3(0.0,7.0,0.0))/vec3(8.0,6.0,8.0);
   }else if(uAssetKind>.5){
     hitA=(vObj-vec3(17.0,10.0,0.0))/vec3(13.0,10.0,16.0);
     hitB=(vObj-vec3(-5.0,26.0,8.0))/vec3(15.0,9.0,12.0);
     hitC=(vObj-vec3(-22.0,16.0,-10.0))/vec3(10.0,12.0,14.0);
   }else{
     hitA=(vObj-vec3(16.6,5.0,.8))/vec3(8.2,5.0,5.6);
     hitB=(vObj-vec3(4.0,14.0,5.3))/vec3(7.4,5.2,5.2);
     hitC=(vObj-vec3(-6.8,1.2,-2.9))/vec3(9.0,4.2,5.8);
   }
  float burnZone=max(max(1.0-smoothstep(.48,1.0,length(hitA)),1.0-smoothstep(.48,1.0,length(hitB))),
    1.0-smoothstep(.48,1.0,length(hitC)));
  float heatState=smoothstep(0.70,1.0,state)*(1.0-destroyed);
  float critical=max(impact,burnZone*.86)*heatState;
  /* Vehicles may carry broad heat through thin armor; a factory should burn
     around breached bays and roof plant, not turn every wall into lava rock. */
  float classSpread=mix(1.0,.14,uAssetKind);
  float burnCoverage=max(critical,heatState*(.10+.18*damageCrust)*classSpread);
  vec3 localChar=mix(vec3(.004,.0045,.005),vec3(.078,.064,.052),damageCrust);
  alb=mix(alb,localChar,burnCoverage*0.94);
  rough=mix(rough,mix(.95,.995,damageCrust),burnCoverage*0.92);
  metal=mix(metal,0.0,burnCoverage*.90);
  /* Heat lives in cracks within the authored impact zones. The underlying
     char remains after heat dies, so BURNING and DESTROYED are visibly
     different states instead of the same red tint with fewer particles. */
  float fissure=damageCrack*max(critical,burnCoverage*.38)*(1.0-destroyed);
  alb=mix(alb,vec3(.48,.026,.0025),fissure*.78);
  /* Derivative bump turns the grayscale crust into raised charcoal islands.
     It costs no extra texture fetches and is limited to burning/wreck states. */
  float crustBump=max(burnCoverage,destroyed);
  vec3 bdx=dFdx(vWorld),bdy=dFdy(vWorld),br1=cross(bdy,N),br2=cross(N,bdx);
  float bdet=dot(bdx,br1),bsafe=max(abs(bdet),1e-5);
  vec3 bgrad=(dFdx(damageData)*br1+dFdy(damageData)*br2)/bsafe*sign(bdet);
  N=normalize(N-bgrad*crustBump*1.85);
  /* A wreck is carbonised material, not glossy black paint. The generated
     crack tile replaces the whole destroyed surface while retaining varied
     soot/ash breakup, then explicitly drives roughness to its matte limit. */
  vec3 wreckChar=mix(vec3(.0035,.004,.0045),vec3(.092,.076,.061),damageCrust);
  wreckChar=mix(wreckChar,vec3(.145,.125,.105),damageCrack*.42);
  alb=mix(alb,wreckChar,destroyed*.97);
  rough=mix(rough,.995,destroyed);metal=mix(metal,0.0,destroyed);emis*=1.0-destroyed;
  /* Four calibrated objects occupy reserved material ids in the lab only. */
  if(vSurface>119.5){
    if(vSurface<120.5){alb=vec3(0.18);ao=1.0;rough=0.72;metal=0.0;emis=0.0;}
    else if(vSurface<121.5){alb=vec3(0.24);ao=1.0;rough=0.82;metal=1.0;emis=0.0;}
    else if(vSurface<122.5){alb=vec3(0.62);ao=1.0;rough=0.08;metal=1.0;emis=0.0;}
    else {alb=vec3(0.018,0.08,0.14);ao=1.0;rough=0.34;metal=0.0;emis=1.0;}
  }
  vec3 V=normalize(uEye-vWorld),L=normalize(uSun),H=normalize(V+L);
  float ndl=max(dot(N,L),0.0),ndv=max(dot(N,V),0.001),ndh=max(dot(N,H),0.001),vdh=max(dot(V,H),0.0);
  float a=rough*rough,a2=a*a,den=(ndh*ndh*(a2-1.0)+1.0);
  float D=a2/max(3.14159265*den*den,0.001),k=(rough+1.0)*(rough+1.0)*0.125;
  float gv=ndv/(ndv*(1.0-k)+k),gl=ndl/(ndl*(1.0-k)+k);
  vec3 f0=mix(vec3(0.04),alb,metal),F=f0+(1.0-f0)*pow(1.0-vdh,5.0);
  vec3 spec=D*gv*gl*F/max(4.0*ndl*ndv,0.001);
  /* Roughness alone still leaves a broad dielectric highlight. Destroyed
     state has an explicit reflection kill so sun, environment and showcase
     keys cannot make a carbonised wreck look lacquered. */
  float reflection=1.0-destroyed*.995;spec*=reflection;
  vec3 kd=(1.0-F)*(1.0-metal),amb=mix(uAmbGnd,uAmbSky,N.y*0.5+0.5);
  /* Production daylight was authored for the much brighter legacy atlas. It
     crushed physically darker steel/albedo values into a navy silhouette and
     hid the offline normal/roughness work. Showcase uses a calibrated diffuse
     key plus cool opposing fill; battle remains on the cheaper world light. */
  vec3 sunC=uSunC*mix(1.0,2.34,uShowcase);
  vec3 lit=alb*amb*ao*mix(.92,.92,uShowcase)+(kd*alb/3.14159265+spec)*sunC*ndl;
  vec3 fillL=normalize(vec3(-uSun.x,.72,-uSun.z));
  float fill=max(dot(N,fillL),0.0);
  lit+=alb*vec3(.055,.075,.11)*fill*uShowcase;
  /* Cheap environment response is intentionally broader than SSR: it works
     off-screen, costs one colour interpolation, and scales to an army. */
  vec3 env=mix(uAmbGnd,uAmbSky,clamp(N.y*0.5+0.5,0.0,1.0));
  vec3 envF=f0+(1.0-f0)*pow(1.0-ndv,5.0);
  lit+=env*envF*(1.0-rough)*mix(.42,.31,uShowcase)*ao*reflection;
  /* A cheap analytic sky/horizon reflection supplies the narrow metallic
     highlight that the old constant environment term could not. This is the
     showcase substitute for a cubemap/SSR pass and costs no extra sampler. */
  vec3 R=reflect(-V,N);
  float horizon=pow(clamp(1.0-abs(R.y-.08),0.0,1.0),5.0);
  vec3 horizonC=mix(vec3(.16,.22,.30),vec3(.58,.72,.88),horizon);
  lit+=horizonC*envF*(1.0-rough)*(0.16+0.58*metal)*uShowcase*reflection;
  float coat=pow(max(dot(reflect(-L,N),V),0.0),mix(14.0,72.0,1.0-rough));
  lit+=sunC*mix(vec3(.20),f0,.66)*coat*(.22+.92*metal)*uShowcase*reflection;
  /* A controlled Arsenal key makes rough paint, polished alloy and weapon
     steel separate in one frame. It is a second BRDF evaluation in the single
     showcase only; battle material LOD never pays for it. */
  vec3 studioL=normalize(vec3(.46,.82,-.34)),studioH=normalize(V+studioL);
  float studio=pow(max(dot(N,studioH),0.0),mix(20.0,104.0,1.0-rough));
  lit+=vec3(1.0,.86,.67)*studio*(.10+.95*metal)*(1.0-rough)*uShowcase*reflection;
  /* Showcase gets one restrained view-dependent separation light. It is not
     a second full-screen pass and is disabled for battle/material stress. */
  float rim=pow(1.0-clamp(dot(N,V),0.0,1.0),3.0);
  lit+=mix(primary,vec3(0.08,0.58,0.88),0.55)*rim*(0.07+0.10*metal)*uShowcase*reflection;
  vec3 glow=uEmissive*emis*(1.25+1.5*float(vSurface>122.5));
  /* Incandescent cracks need two scales: a broader red/orange heat bed and a
     narrow near-white core. This survives the phone downsample and reads as
     heat inside split armor rather than a flat red decal. */
  glow+=vec3(1.0,.035,.002)*critical*heatState*.30;
  glow+=vec3(1.0,.105,.004)*fissure*2.35;
  glow+=vec3(1.0,.48,.055)*smoothstep(.66,.88,damageData)*critical*(1.0-destroyed)*1.55;
  lit+=glow;
  lit=mix(lit,uFogC,vFog);
  if(uDebug==1)lit=alb;
  else if(uDebug==2)lit=N*0.5+0.5;
  else if(uDebug==3)lit=vec3(ao);
  else if(uDebug==4)lit=vec3(rough);
  else if(uDebug==5)lit=vec3(metal);
  else if(uDebug==6)lit=mk.gba;
  else if(uDebug==7)lit=glow;
  else if(uDebug==8)lit=vec3(wear);
  else if(uDebug==9)lit=vec3(damageData);
  lit=vec3(1.0)-exp(-max(lit,vec3(0.0))*mix(1.34,1.58,uShowcase));
  /* Production (FS3D / civic V2) writes the filmic curve as display values.
     A further linearToSrgb after 1-exp lifted charcoal into mid-grey — the
     extra-gamma lab wash. Debug views still show raw channels. */
  o=vec4(clamp(lit,vec3(0.0),vec3(1.0)),1.0);
}`;

class MF2InstMesh extends InstMesh{
  flushV2(){
    if(!this.n)return;
    const g=this.gl;g.bindVertexArray(this.vao);g.bindBuffer(g.ARRAY_BUFFER,this.ivb);
    g.bufferSubData(g.ARRAY_BUFFER,0,this.data,0,this.n*INST_FLOATS);
    g.drawElementsInstanced(g.TRIANGLES,this.count,g.UNSIGNED_SHORT,0,this.n);
    drawCalls++;triCount+=this.count/3*this.n;this.n=0;
  }
}

const MF2_SEM={
  armor:{base:[92,104,122],rough:145,metal:62,mat:MAT.NOVA_COMPOSITE},
  structure:{base:[76,82,92],rough:176,metal:216,mat:MAT.GREEBLE},
  machine:{base:[29,35,43],rough:202,metal:194,mat:MAT.SERVO},
  weapon:{base:[54,64,77],rough:102,metal:228,mat:MAT.TWR_BORE},
  glass:{base:[18,48,64],rough:54,metal:18,emissive:142,mat:MAT.HUD_CANOPY},
  energy:{base:[18,62,74],rough:82,metal:70,emissive:235,mat:MAT.SYN_CONDUIT}
};
/* Bespoke-pack contract. A pack describes one hero asset's authored intent,
   not a global recolour. Imported BaseAO/NRE/mask files may replace the
   generated maps once a Blender UV bake exists; until then the contract can
   still drive a deterministic semantic bake for a single showcase asset. */
const MF2_BESPOKE_PACKS={
  legionHQV2:{faction:'legion',source:'authored',maps:'legion-hq-v2',uv:'authored-landmark-uv0'},
  syndicateHQV2:{faction:'syndicate',source:'authored',maps:'syndicate-hq-v2',uv:'authored-landmark-uv0'},
  legionProductionV2:{faction:'legion',source:'authored',maps:'legion-production-v2',uv:'authored-landmark-uv0'},
  legionResearchV2:{faction:'legion',source:'authored',maps:'legion-research-v2',uv:'authored-landmark-uv0'},
  syndicateProductionV2:{faction:'syndicate',source:'authored',maps:'syndicate-production-v2',uv:'authored-landmark-uv0'},
  syndicateResearchV2:{faction:'syndicate',source:'authored',maps:'syndicate-research-v2',uv:'authored-landmark-uv0'},
  legionEconomyV2:{faction:'legion',source:'authored',maps:'legion-economy-v2',uv:'authored-landmark-uv0'},
  syndicateEconomyV2:{faction:'syndicate',source:'authored',maps:'syndicate-economy-v2',uv:'authored-landmark-uv0'},
  legionDefenseV2:{faction:'legion',source:'authored',maps:'legion-defense-v2',uv:'authored-landmark-uv0'},
  syndicateDefenseV2:{faction:'syndicate',source:'authored',maps:'syndicate-defense-v2',uv:'authored-landmark-uv0'},
  legionArtilleryV2:{faction:'legion',source:'authored',maps:'legion-artillery-v2',uv:'authored-unit-uv0'},
  syndicateEmitterV2:{faction:'syndicate',source:'authored',maps:'syndicate-emitter-v2',uv:'authored-unit-uv0'},
  syndicateStriderV2:{faction:'syndicate',source:'authored',maps:'syndicate-strider-v2',uv:'authored-unit-uv0'},
  syndicateRhinoV2:{faction:'syndicate',source:'authored',maps:'syndicate-rhino-v2',uv:'authored-unit-uv0'},
  syndicateSabreV2:{faction:'syndicate',source:'authored',maps:'syndicate-sabre-v2',uv:'authored-unit-uv0'},
  syndicateOracleV2:{faction:'syndicate',source:'authored',maps:'syndicate-oracle-v2',uv:'authored-unit-uv0'},
  syndicateDroneV2:{faction:'syndicate',source:'authored',maps:'syndicate-drone-v2',uv:'authored-unit-uv0'},
  syndicateLanceV2:{faction:'syndicate',source:'authored',maps:'syndicate-lance-v2',uv:'authored-unit-uv0'},
  syndicateRocketV2:{faction:'syndicate',source:'authored',maps:'syndicate-rocket-v2',uv:'authored-unit-uv0'},
  syndicateTitanV2:{faction:'syndicate',source:'authored',maps:'syndicate-titan-v2',uv:'authored-unit-uv0'},
  syndicateIncineratorV2:{faction:'syndicate',source:'authored',maps:'syndicate-incinerator-v2',uv:'authored-unit-uv0'},
  syndicateBeamV2:{faction:'syndicate',source:'authored',maps:'syndicate-beam-v2',uv:'authored-unit-uv0'},
  syndicateShieldV2:{faction:'syndicate',source:'authored',maps:'syndicate-shield-v2',uv:'authored-unit-uv0'},
  syndicateSkimmerV2:{faction:'syndicate',source:'authored',maps:'syndicate-skimmer-v2',uv:'authored-unit-uv0'},
  syndicateCapitalV2:{faction:'syndicate',source:'authored',maps:'syndicate-capital-v2',uv:'authored-unit-uv0'},
  syndicateSiegeV2:{faction:'syndicate',source:'authored',maps:'syndicate-siege-v2',uv:'authored-unit-uv0'},
  syndicateGunshipV2:{faction:'syndicate',source:'authored',maps:'syndicate-gunship-v2',uv:'authored-unit-uv0'},
  syndicateFlamerV2:{faction:'syndicate',source:'authored',maps:'syndicate-flamer-v2',uv:'authored-unit-uv0'},
  syndicateBuilderV2:{faction:'syndicate',source:'authored',maps:'syndicate-builder-v2',uv:'authored-unit-uv0'},
  syndicateCasterV2:{faction:'syndicate',source:'authored',maps:'syndicate-caster-v2',uv:'authored-unit-uv0'},
  syndicateConduitV2:{faction:'syndicate',source:'authored',maps:'syndicate-conduit-v2',uv:'authored-unit-uv0'},
  syndicateHeavybeamV2:{faction:'syndicate',source:'authored',maps:'syndicate-heavybeam-v2',uv:'authored-unit-uv0'},
  syndicateSonicV2:{faction:'syndicate',source:'authored',maps:'syndicate-sonic-v2',uv:'authored-unit-uv0'},
  syndicateServiceV2:{faction:'syndicate',source:'authored',maps:'syndicate-service-v2',uv:'authored-unit-uv0'},
  syndicateScoutV2:{faction:'syndicate',source:'authored',maps:'syndicate-scout-v2',uv:'authored-unit-uv0'},
  syndicateExpV2:{faction:'syndicate',source:'authored',maps:'syndicate-exp-v2',uv:'authored-unit-uv0'},
  syndicateBatteryV2:{faction:'syndicate',source:'authored',maps:'syndicate-battery-v2',uv:'authored-unit-uv0'},
  syndicateArchonV2:{faction:'syndicate',source:'authored',maps:'syndicate-archon-v2',uv:'authored-unit-uv0'},
  syndicateMinerV2:{faction:'syndicate',source:'authored',maps:'syndicate-miner-v2',uv:'authored-unit-uv0'},
  syndicateMexV2:{faction:'syndicate',source:'authored',maps:'syndicate-mex-v2',uv:'authored-landmark-uv0'},
  syndicateGeoV2:{faction:'syndicate',source:'authored',maps:'syndicate-geo-v2',uv:'authored-landmark-uv0'},
  syndicateRailV2:{faction:'syndicate',source:'authored',maps:'syndicate-rail-v2',uv:'authored-landmark-uv0'},
  syndicateUplinkV2:{faction:'syndicate',source:'authored',maps:'syndicate-uplink-v2',uv:'authored-landmark-uv0'},
  syndicateTurretV2:{faction:'syndicate',source:'authored',maps:'syndicate-turret-v2',uv:'authored-landmark-uv0'},
  syndicateBunkerV2:{faction:'syndicate',source:'authored',maps:'syndicate-bunker-v2',uv:'authored-landmark-uv0'},
  syndicateBastionV2:{faction:'syndicate',source:'authored',maps:'syndicate-bastion-v2',uv:'authored-landmark-uv0'},
  syndicateAatowerV2:{faction:'syndicate',source:'authored',maps:'syndicate-aatower-v2',uv:'authored-landmark-uv0'},
  syndicateMinelaserV2:{faction:'syndicate',source:'authored',maps:'syndicate-minelaser-v2',uv:'authored-landmark-uv0'},
  syndicateMissilebastionV2:{faction:'syndicate',source:'authored',maps:'syndicate-missilebastion-v2',uv:'authored-landmark-uv0'},
  syndicateHellstormV2:{faction:'syndicate',source:'authored',maps:'syndicate-hellstorm-v2',uv:'authored-landmark-uv0'},
  syndicateArcV2:{faction:'syndicate',source:'authored',maps:'syndicate-arc-v2',uv:'authored-landmark-uv0'},
  syndicateSgenV2:{faction:'syndicate',source:'authored',maps:'syndicate-sgen-v2',uv:'authored-landmark-uv0'},
  syndicatePlasmaV2:{faction:'syndicate',source:'authored',maps:'syndicate-plasma-v2',uv:'authored-landmark-uv0'},
  syndicateWallV2:{faction:'syndicate',source:'authored',maps:'syndicate-wall-v2',uv:'authored-landmark-uv0'},
  syndicateGateV2:{faction:'syndicate',source:'authored',maps:'syndicate-gate-v2',uv:'authored-landmark-uv0'},
  broodSovereignV2:{faction:'brood',source:'authored',maps:'brood-sovereign-v2',uv:'authored-organic-uv0'},
  broodTidecasterV2:{faction:'brood',source:'authored',maps:'brood-tidecaster-v2',uv:'authored-organic-uv0'},
  broodGrubV2:{faction:'brood',source:'authored',maps:'brood-grub-v2',uv:'authored-organic-uv0'},
  broodRavagerV2:{faction:'brood',source:'authored',maps:'brood-ravager-v2',uv:'authored-organic-uv0'},
  broodAlphaRavagerV2:{faction:'brood',source:'authored',maps:'brood-alpha-ravager-v2',uv:'authored-organic-uv0'},
  broodNestV2:{faction:'brood',source:'authored',maps:'brood-nest-v2',uv:'authored-organic-uv0'},
  broodHiveV2:{faction:'brood',source:'authored',maps:'brood-hive-v2',uv:'authored-organic-uv0'},
  broodSpireV2:{faction:'brood',source:'authored',maps:'brood-spire-v2',uv:'authored-organic-uv0'},
  broodSporeV2:{faction:'brood',source:'authored',maps:'brood-spore-v2',uv:'authored-organic-uv0'},
  broodCarapaceV2:{faction:'brood',source:'authored',maps:'brood-carapace-v2',uv:'authored-organic-uv0'},
  broodSacV2:{faction:'brood',source:'authored',maps:'brood-sac-v2',uv:'authored-organic-uv0'},
  broodMoundV2:{faction:'brood',source:'authored',maps:'brood-mound-v2',uv:'authored-organic-uv0'},
  broodTendrilV2:{faction:'brood',source:'authored',maps:'brood-tendril-v2',uv:'authored-organic-uv0'},
  legionStrikerV2:{faction:'legion',source:'authored',maps:'legion-striker-v2',uv:'authored-unit-uv0'},
  legionRhinoV2:{faction:'legion',source:'authored',maps:'legion-rhino-v2',uv:'authored-unit-uv0'},
  legionGoliathV2:{faction:'legion',source:'authored',maps:'legion-goliath-v2',uv:'authored-unit-uv0'},
  legionThumperV2:{faction:'legion',source:'authored',maps:'legion-thumper-v2',uv:'authored-unit-uv0'},
  legionWaspV2:{faction:'legion',source:'authored',maps:'legion-wasp-v2',uv:'authored-unit-uv0'},
  legionLongbowV2:{faction:'legion',source:'authored',maps:'legion-longbow-v2',uv:'authored-unit-uv0'},
  legionHornetV2:{faction:'legion',source:'authored',maps:'legion-hornet-v2',uv:'authored-unit-uv0'},
  legionTitanV2:{faction:'legion',source:'authored',maps:'legion-titan-v2',uv:'authored-unit-uv0'},
  legionPyroV2:{faction:'legion',source:'authored',maps:'legion-pyro-v2',uv:'authored-unit-uv0'},
  legionVultureV2:{faction:'legion',source:'authored',maps:'legion-vulture-v2',uv:'authored-unit-uv0'},
  legionBulwarkV2:{faction:'legion',source:'authored',maps:'legion-bulwark-v2',uv:'authored-unit-uv0'},
  legionCorvetteV2:{faction:'legion',source:'authored',maps:'legion-corvette-v2',uv:'authored-unit-uv0'},
  legionDreadnoughtV2:{faction:'legion',source:'authored',maps:'legion-dreadnought-v2',uv:'authored-unit-uv0'},
  legionBombardV2:{faction:'legion',source:'authored',maps:'legion-bombard-v2',uv:'authored-unit-uv0'},
  legionRaptorV2:{faction:'legion',source:'authored',maps:'legion-raptor-v2',uv:'authored-unit-uv0'},
  legionScorcherV2:{faction:'legion',source:'authored',maps:'legion-scorcher-v2',uv:'authored-unit-uv0'},
  legionConstructorV2:{faction:'legion',source:'authored',maps:'legion-constructor-v2',uv:'authored-unit-uv0'},
  legionReaperV2:{faction:'legion',source:'authored',maps:'legion-reaper-v2',uv:'authored-unit-uv0'},
  legionCinderV2:{faction:'legion',source:'authored',maps:'legion-cinder-v2',uv:'authored-unit-uv0'},
  legionLancerV2:{faction:'legion',source:'authored',maps:'legion-lancer-v2',uv:'authored-unit-uv0'},
  legionResonatorV2:{faction:'legion',source:'authored',maps:'legion-resonator-v2',uv:'authored-unit-uv0'},
  legionWardenV2:{faction:'legion',source:'authored',maps:'legion-warden-v2',uv:'authored-unit-uv0'},
  legionKestrelV2:{faction:'legion',source:'authored',maps:'legion-kestrel-v2',uv:'authored-unit-uv0'},
  legionBasiliskV2:{faction:'legion',source:'authored',maps:'legion-basilisk-v2',uv:'authored-unit-uv0'},
  legionHarbingerV2:{faction:'legion',source:'authored',maps:'legion-harbinger-v2',uv:'authored-unit-uv0'},
  legionPraetorV2:{faction:'legion',source:'authored',maps:'legion-praetor-v2',uv:'authored-unit-uv0'},
  legionProspectorV2:{faction:'legion',source:'authored',maps:'legion-prospector-v2',uv:'authored-unit-uv0'},
  legionHqV2:{faction:'legion',source:'authored',maps:'legion-hq-v2',uv:'authored-landmark-uv0'},
  legionFacV2:{faction:'legion',source:'authored',maps:'legion-fac-v2',uv:'authored-landmark-uv0'},
  legionTechlabV2:{faction:'legion',source:'authored',maps:'legion-techlab-v2',uv:'authored-landmark-uv0'},
  legionPgenV2:{faction:'legion',source:'authored',maps:'legion-pgen-v2',uv:'authored-landmark-uv0'},
  legionMexV2:{faction:'legion',source:'authored',maps:'legion-mex-v2',uv:'authored-landmark-uv0'},
  legionGeoV2:{faction:'legion',source:'authored',maps:'legion-geo-v2',uv:'authored-landmark-uv0'},
  legionAirfieldV2:{faction:'legion',source:'authored',maps:'legion-airfield-v2',uv:'authored-landmark-uv0'},
  legionRailV2:{faction:'legion',source:'authored',maps:'legion-rail-v2',uv:'authored-landmark-uv0'},
  legionUplinkV2:{faction:'legion',source:'authored',maps:'legion-uplink-v2',uv:'authored-landmark-uv0'},
  legionTurretV2:{faction:'legion',source:'authored',maps:'legion-turret-v2',uv:'authored-landmark-uv0'},
  legionBunkerV2:{faction:'legion',source:'authored',maps:'legion-bunker-v2',uv:'authored-landmark-uv0'},
  legionBastionV2:{faction:'legion',source:'authored',maps:'legion-bastion-v2',uv:'authored-landmark-uv0'},
  legionAatowerV2:{faction:'legion',source:'authored',maps:'legion-aatower-v2',uv:'authored-landmark-uv0'},
  legionMinelaserV2:{faction:'legion',source:'authored',maps:'legion-minelaser-v2',uv:'authored-landmark-uv0'},
  legionMissilebastionV2:{faction:'legion',source:'authored',maps:'legion-missilebastion-v2',uv:'authored-landmark-uv0'},
  legionHellstormV2:{faction:'legion',source:'authored',maps:'legion-hellstorm-v2',uv:'authored-landmark-uv0'},
  legionArcV2:{faction:'legion',source:'authored',maps:'legion-arc-v2',uv:'authored-landmark-uv0'},
  legionSgenV2:{faction:'legion',source:'authored',maps:'legion-sgen-v2',uv:'authored-landmark-uv0'},
  legionPlasmaV2:{faction:'legion',source:'authored',maps:'legion-plasma-v2',uv:'authored-landmark-uv0'},
  legionWallV2:{faction:'legion',source:'authored',maps:'legion-wall-v2',uv:'authored-landmark-uv0'},
  legionGateV2:{faction:'legion',source:'authored',maps:'legion-gate-v2',uv:'authored-landmark-uv0'},
  novaStrikerV2:{faction:'nova',source:'authored',maps:'nova-striker-v2',uv:'authored-unit-uv0'},
  novaRhinoV2:{faction:'nova',source:'authored',maps:'nova-rhino-v2',uv:'authored-unit-uv0'},
  novaGoliathV2:{faction:'nova',source:'authored',maps:'nova-goliath-v2',uv:'authored-unit-uv0'},
  novaThumperV2:{faction:'nova',source:'authored',maps:'nova-thumper-v2',uv:'authored-unit-uv0'},
  novaCommanderV2:{faction:'nova',source:'authored',maps:'nova-commander-v2',uv:'authored-hero-uv0'},
  novaWaspV2:{faction:'nova',source:'authored',maps:'nova-wasp-v2',uv:'authored-unit-uv0'},
  novaLongbowV2:{faction:'nova',source:'authored',maps:'nova-longbow-v2',uv:'authored-unit-uv0'},
  novaHornetV2:{faction:'nova',source:'authored',maps:'nova-hornet-v2',uv:'authored-unit-uv0'},
  novaTitanV2:{faction:'nova',source:'authored',maps:'nova-titan-v2',uv:'authored-unit-uv0'},
  novaPyroV2:{faction:'nova',source:'authored',maps:'nova-pyro-v2',uv:'authored-unit-uv0'},
  novaVultureV2:{faction:'nova',source:'authored',maps:'nova-vulture-v2',uv:'authored-unit-uv0'},
  novaBulwarkV2:{faction:'nova',source:'authored',maps:'nova-bulwark-v2',uv:'authored-unit-uv0'},
  novaCorvetteV2:{faction:'nova',source:'authored',maps:'nova-corvette-v2',uv:'authored-unit-uv0'},
  novaDreadnoughtV2:{faction:'nova',source:'authored',maps:'nova-dreadnought-v2',uv:'authored-unit-uv0'},
  novaBombardV2:{faction:'nova',source:'authored',maps:'nova-bombard-v2',uv:'authored-unit-uv0'},
  novaRaptorV2:{faction:'nova',source:'authored',maps:'nova-raptor-v2',uv:'authored-unit-uv0'},
  novaScorcherV2:{faction:'nova',source:'authored',maps:'nova-scorcher-v2',uv:'authored-unit-uv0'},
  novaConstructorV2:{faction:'nova',source:'authored',maps:'nova-constructor-v2',uv:'authored-unit-uv0'},
  novaReaperV2:{faction:'nova',source:'authored',maps:'nova-reaper-v2',uv:'authored-unit-uv0'},
  novaCinderV2:{faction:'nova',source:'authored',maps:'nova-cinder-v2',uv:'authored-unit-uv0'},
  novaLancerV2:{faction:'nova',source:'authored',maps:'nova-lancer-v2',uv:'authored-unit-uv0'},
  novaResonatorV2:{faction:'nova',source:'authored',maps:'nova-resonator-v2',uv:'authored-unit-uv0'},
  novaWardenV2:{faction:'nova',source:'authored',maps:'nova-warden-v2',uv:'authored-unit-uv0'},
  novaKestrelV2:{faction:'nova',source:'authored',maps:'nova-kestrel-v2',uv:'authored-unit-uv0'},
  novaBasiliskV2:{faction:'nova',source:'authored',maps:'nova-basilisk-v2',uv:'authored-unit-uv0'},
  novaHarbingerV2:{faction:'nova',source:'authored',maps:'nova-harbinger-v2',uv:'authored-unit-uv0'},
  novaProspectorV2:{faction:'nova',source:'authored',maps:'nova-prospector-v2',uv:'authored-unit-uv0'},
  novaMexV2:{faction:'nova',source:'authored',maps:'nova-mex-v2',uv:'authored-landmark-uv0'},
  novaPgenV2:{faction:'nova',source:'authored',maps:'nova-pgen-v2',uv:'authored-landmark-uv0'},
  novaFacV2:{faction:'nova',source:'authored',maps:'nova-fac-v2',uv:'authored-landmark-uv0'},
  novaTurretV2:{faction:'nova',source:'authored',maps:'nova-turret-v2',uv:'authored-landmark-uv0'},
  novaBunkerV2:{faction:'nova',source:'authored',maps:'nova-bunker-v2',uv:'authored-landmark-uv0'},
  novaSgenV2:{faction:'nova',source:'authored',maps:'nova-sgen-v2',uv:'authored-landmark-uv0'},
  novaTgateV2:{faction:'nova',source:'authored',maps:'nova-tgate-v2',uv:'authored-landmark-uv0'},
  novaHarborV2:{faction:'nova',source:'authored',maps:'nova-harbor-v2',uv:'authored-landmark-uv0'},
  novaSeafortV2:{faction:'nova',source:'authored',maps:'nova-seafort-v2',uv:'authored-landmark-uv0'},
  novaBastionV2:{faction:'nova',source:'authored',maps:'nova-bastion-v2',uv:'authored-landmark-uv0'},
  novaTechlabV2:{faction:'nova',source:'authored',maps:'nova-techlab-v2',uv:'authored-landmark-uv0'},
  novaAatowerV2:{faction:'nova',source:'authored',maps:'nova-aatower-v2',uv:'authored-landmark-uv0'},
  novaAirfieldV2:{faction:'nova',source:'authored',maps:'nova-airfield-v2',uv:'authored-landmark-uv0'},
  novaUplinkV2:{faction:'nova',source:'authored',maps:'nova-uplink-v2',uv:'authored-landmark-uv0'},
  novaHqV2:{faction:'nova',source:'authored',maps:'nova-hq-v2',uv:'authored-landmark-uv0'},
  novaHellstormV2:{faction:'nova',source:'authored',maps:'nova-hellstorm-v2',uv:'authored-landmark-uv0'},
  novaArcV2:{faction:'nova',source:'authored',maps:'nova-arc-v2',uv:'authored-landmark-uv0'},
  novaRailV2:{faction:'nova',source:'authored',maps:'nova-rail-v2',uv:'authored-landmark-uv0'},
  novaNovaV2:{faction:'nova',source:'authored',maps:'nova-nova-v2',uv:'authored-landmark-uv0'},
  novaMinelaserV2:{faction:'nova',source:'authored',maps:'nova-minelaser-v2',uv:'authored-landmark-uv0'},
  novaMissilebastionV2:{faction:'nova',source:'authored',maps:'nova-missilebastion-v2',uv:'authored-landmark-uv0'},
  novaPlasmaV2:{faction:'nova',source:'authored',maps:'nova-plasma-v2',uv:'authored-landmark-uv0'},
  novaWallV2:{faction:'nova',source:'authored',maps:'nova-wall-v2',uv:'authored-landmark-uv0'},
  novaGateV2:{faction:'nova',source:'authored',maps:'nova-gate-v2',uv:'authored-landmark-uv0'},
  worldGeoV2:{faction:'nova',source:'authored',maps:'world-geo-v2',uv:'authored-landmark-uv0'},
  worldSiloV2:{faction:'nova',source:'authored',maps:'world-silo-v2',uv:'authored-landmark-uv0'},
  worldFabV2:{faction:'nova',source:'authored',maps:'world-fab-v2',uv:'authored-landmark-uv0'}
};
const MF2_BESPOKE_PACK=MF2_BESPOKE_PACKS[MF2_ASSET_KEY]||null;
function mf2Semantic(name){
  const src=MF2_SEM[name]||MF2_SEM.armor,over=MF2_BESPOKE_PACK&&MF2_BESPOKE_PACK.semantics&&MF2_BESPOKE_PACK.semantics[name];
  return over?Object.assign({},src,over):src;
}
function mf2CellUV(width,height,sem,opt){
  const shared=opt&&opt.shared;
  const sharedKey=shared?[shared,sem,Math.round(width*100),Math.round(height*100),opt.primary?1:0,opt.secondary?1:0].join('|'):'';
  if(sharedKey&&mf2SharedUV.has(sharedKey))return mf2SharedUV.get(sharedKey);
  if(mf2Cells.length>=MF2_GRID*MF2_GRID)throw new Error('Material V2 test atlas cell budget exceeded');
  const id=mf2Cells.length,cx=id%MF2_GRID,cy=Math.floor(id/MF2_GRID),step=1/MF2_GRID;
  const scale=step*0.74/Math.max(width,height,0.001),du=width*scale,dv=height*scale;
  const uc=(cx+0.5)*step,vc=(cy+0.5)*step,u0=uc-du/2,u1=uc+du/2,v0=vc-dv/2,v1=vc+dv/2;
  mf2Cells.push({sem:sem||'armor',primary:!!(opt&&opt.primary),secondary:!!(opt&&opt.secondary),
    u0:(u0-cx*step)/step,u1:(u1-cx*step)/step,v0:(v0-cy*step)/step,v1:(v1-cy*step)/step});
  const uv=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
  if(sharedKey)mf2SharedUV.set(sharedKey,uv);return uv;
}
function mf2ImportedTankGeometry(){
  const G=typeof MF2_IMPORTED_GEO==='object'&&MF2_IMPORTED_GEO[MF2_ASSET_KEY];
  if(!G)return null;
  mf2Cells=[];mf2SharedUV.clear();
  const names=['armor','structure','machine','weapon','glass','energy'],v=new Float32Array(G.p.length/3*12);
  const b=G.meta&&G.meta.bounds,ox=b?(b.min[0]+b.max[0])*.5:0,oy=b?b.min[1]:0,oz=b?(b.min[2]+b.max[2])*.5:0;
  for(let k=0;k<G.p.length/3;k++){
    const sem=names[G.sem[k]]||'armor',S=MF2_SEM[sem]||MF2_SEM.armor,o=k*12;
    v[o]=G.p[k*3]-ox;v[o+1]=G.p[k*3+1]-oy;v[o+2]=G.p[k*3+2]-oz;
    v[o+3]=G.n[k*3];v[o+4]=G.n[k*3+1];v[o+5]=G.n[k*3+2];
    v[o+6]=v[o+7]=v[o+8]=1;
    /* The baked benchmark owns a unique, non-overlapping UV0. Remapping it
       into the procedural semantic atlas would discard the bake and recreate
       the stretching/material repetition this gate is meant to fix. */
    v[o+9]=G.uv[k*2];v[o+10]=G.uv[k*2+1];v[o+11]=S.mat+1;
  }
  mf2ImportedMeta=G.meta||null;
  return {v,i:G.i,count:G.i.length,skel:new Float32Array(10),bones:0};
}
function mf2SubOpt(opt,suffix){return opt&&opt.shared?{shared:opt.shared+suffix}:null;}
function mf2Quad(B,a,b,c,d,sem,opt){
  const ab=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
  const ad=Math.hypot(d[0]-a[0],d[1]-a[1],d[2]-a[2]);
  const S=MF2_SEM[sem]||MF2_SEM.armor;
  B.mat(S.mat).team(!!(opt&&opt.primary));B.quad(a,b,c,d,[1,1,1],mf2CellUV(ab,ad,sem,opt));B.team(false);
}
function mf2BevelPart(B,x,y,z,w,h,d,b,sem,opt,yaw){
  const hw=w/2,hd=d/2,co=Math.cos(yaw||0),si=Math.sin(yaw||0);
  b=Math.min(b,Math.min(w,d)*0.38,h*0.48);
  const P=(px,py,pz)=>[x+px*co-pz*si,y+py,z+px*si+pz*co];
  const q=[P(-hw,h-b,-hd),P(hw,h-b,-hd),P(hw,h-b,hd),P(-hw,h-b,hd),
           P(-hw+b,h,-hd+b),P(hw-b,h,-hd+b),P(hw-b,h,hd-b),P(-hw+b,h,hd-b),
           P(-hw,0,-hd),P(hw,0,-hd),P(hw,0,hd),P(-hw,0,hd)];
  mf2Quad(B,q[4],q[5],q[6],q[7],sem,opt);mf2Quad(B,q[11],q[10],q[9],q[8],sem,opt);
  mf2Quad(B,q[8],q[9],q[1],q[0],sem,opt);mf2Quad(B,q[9],q[10],q[2],q[1],sem,opt);
  mf2Quad(B,q[10],q[11],q[3],q[2],sem,opt);mf2Quad(B,q[11],q[8],q[0],q[3],sem,opt);
  mf2Quad(B,q[0],q[1],q[5],q[4],sem,opt);mf2Quad(B,q[1],q[2],q[6],q[5],sem,opt);
  mf2Quad(B,q[2],q[3],q[7],q[6],sem,opt);mf2Quad(B,q[3],q[0],q[4],q[7],sem,opt);
}
function mf2HullWedge(B,x,y,z,len,h,rearW,frontW,sem,opt){
  const xr=x-len/2,xf=x+len/2,rb=rearW/2,fb=frontW/2,rt=rb*.86,ft=fb*.82;
  const a=[xr,y,z-rb],b=[xf,y,z-fb],c=[xf,y,z+fb],d=[xr,y,z+rb];
  const e=[xr+1.6,y+h,z-rt],f=[xf-2.0,y+h*.78,z-ft];
  const g=[xf-2.0,y+h*.78,z+ft],hh=[xr+1.6,y+h,z+rt];
  mf2Quad(B,e,f,g,hh,sem,opt);mf2Quad(B,d,c,b,a,'machine',null);
  mf2Quad(B,a,b,f,e,sem,opt);mf2Quad(B,c,d,hh,g,sem,opt);
  mf2Quad(B,b,c,g,f,sem,opt);mf2Quad(B,d,a,e,hh,sem,opt);
}
/* Axis-specific tubes retain one UV island per physical face. The barrel
   helper includes a recessed inner wall and annular muzzle, so no weapon in
   the showcase can end in the flat painted cap that made earlier guns toy-like. */
function mf2TubeX(B,x0,x1,y,z,r,inner,seg,sem,opt){
  for(let k=0;k<seg;k++){
    const a=k/seg*TAU,b=(k+1)/seg*TAU;
    const O=(x,q,rr)=>[x,y+Math.cos(q)*rr,z+Math.sin(q)*rr];
    mf2Quad(B,O(x0,a,r),O(x1,a,r),O(x1,b,r),O(x0,b,r),sem,opt);
    if(inner>0){
      mf2Quad(B,O(x1,a,r),O(x1,a,inner),O(x1,b,inner),O(x1,b,r),'machine',mf2SubOpt(opt,'-rim'));
      mf2Quad(B,O(x1,a,inner),O(x1-2.2,a,inner),O(x1-2.2,b,inner),O(x1,b,inner),'machine',mf2SubOpt(opt,'-bore'));
    }
  }
}
function mf2TubeZ(B,x,y,z0,z1,r,inner,seg,sem,opt){
  for(let k=0;k<seg;k++){
    const a=k/seg*TAU,b=(k+1)/seg*TAU;
    const O=(zv,q,rr)=>[x+Math.cos(q)*rr,y+Math.sin(q)*rr,zv];
    mf2Quad(B,O(z0,a,r),O(z1,a,r),O(z1,b,r),O(z0,b,r),sem,opt);
    mf2Quad(B,O(z1,a,r),O(z1,a,inner),O(z1,b,inner),O(z1,b,r),'structure',mf2SubOpt(opt,'-rim'));
    mf2Quad(B,O(z0,b,r),O(z0,b,inner),O(z0,a,inner),O(z0,a,r),'structure',mf2SubOpt(opt,'-rim'));
    mf2Quad(B,O(z1,a,inner),O(z0,a,inner),O(z0,b,inner),O(z1,b,inner),'machine',mf2SubOpt(opt,'-hub'));
  }
}
function mf2TubeY(B,x,y0,y1,z,r,inner,seg,sem,opt){
  for(let k=0;k<seg;k++){
    const a=k/seg*TAU,b=(k+1)/seg*TAU;
    const O=(yv,q,rr)=>[x+Math.cos(q)*rr,yv,z-Math.sin(q)*rr];
    mf2Quad(B,O(y0,a,r),O(y1,a,r),O(y1,b,r),O(y0,b,r),sem,opt);
    mf2Quad(B,O(y1,a,r),O(y1,a,inner),O(y1,b,inner),O(y1,b,r),sem,opt);
    mf2Quad(B,O(y0,b,r),O(y0,b,inner),O(y0,a,inner),O(y0,a,r),'machine',mf2SubOpt(opt,'-base'));
    mf2Quad(B,O(y1,a,inner),O(y0,a,inner),O(y0,b,inner),O(y1,b,inner),'machine',mf2SubOpt(opt,'-inner'));
  }
}
function mf2TankGeometry(){
  mf2Cells=[];mf2SharedUV.clear();const B=MB();
  /* One uninterrupted load path: suspension meets the track housings, those
     housings carry a tapered lower hull, the hull carries the turret race,
     and every surface module deliberately intersects its parent. */
  mf2HullWedge(B,0,1.1,0,38,7.2,23,17,'structure',null);
  mf2HullWedge(B,-1.8,6.0,0,30,6.4,18,13,'armor',null);
  for(const side of [-1,1]){
    const z=side*13.6;
    mf2BevelPart(B,0,0,z,38,7.9,7.4,1.0,'machine',null,0);
    for(let k=0;k<5;k++){
      const wx=-13.5+k*6.8;
      mf2TubeZ(B,wx,3.5,side<0?-17.9:16.5,side<0?-16.5:17.9,2.45,.92,10,'structure',{shared:'roadwheel'});
      mf2BevelPart(B,wx,7.65,z,4.8,.92,7.55,.25,'structure',{shared:'tread-shoe'},0);
    }
    /* Larger end housings visually explain how the tread loop is driven; the
       smaller road wheels remain visible instead of reading as flat decals. */
    if(MF2_SHOWCASE)for(const wx of [-17.0,17.0]){
      mf2TubeZ(B,wx,3.7,side<0?-18.25:16.15,side<0?-16.15:18.25,3.18,1.18,12,'weapon',{shared:'drive-wheel'});
      mf2TubeZ(B,wx,3.7,side<0?-18.48:18.18,side<0?-18.18:18.48,1.35,.35,10,'energy',{shared:'drive-hub'});
    }
    /* Three connected skirt plates expose service gaps instead of one plain
       slab, preserving the large track silhouette at combat distance. */
    for(let k=0;k<3;k++)
      mf2BevelPart(B,-10.4+k*10.4,6.25,side*15.15,9.2,2.7,1.75,.42,'armor',{primary:true,shared:'skirt'},0);
    mf2BevelPart(B,1.5,6.4,side*10.5,20,4.5,5.7,1.0,'armor',{secondary:true,shared:'shoulder'},0);
    if(MF2_SHOWCASE)for(const x of [-10.2,0,10.2])
      mf2BevelPart(B,x,8.05,side*15.75,2.8,.65,.58,.16,'structure',{shared:'skirt-lock'},0);
  }
  /* Layered glacis plates are shallow and sunk into the parent by 0.18 units;
     the separation comes from real silhouette/normal changes, not noisy paint. */
  mf2BevelPart(B,11.2,6.2,0,10.5,3.7,16.4,1.0,'armor',null,0);
  mf2BevelPart(B,13.0,9.55,0,6.8,.78,12.2,.24,'armor',{primary:true},0);
  if(MF2_SHOWCASE)for(const z of [-4.2,0,4.2])
    mf2BevelPart(B,14.35,10.18,z,5.6,.62,1.15,.18,z===0?'armor':'structure',z===0?{secondary:true}:{shared:'glacis-rib'},0);
  for(const z of [-7.1,7.1])mf2BevelPart(B,7.3,10.0,z,6.8,.72,2.0,.22,'structure',null,0);

  /* Turret race, receiver and two visibly supported weapon channels. */
  mf2TubeY(B,-2.8,10.0,12.1,0,8.7,6.0,12,'structure',null);
  mf2HullWedge(B,-1.4,11.5,0,16.5,5.1,13.8,10.6,'weapon',null);
  for(const side of [-1,1])
    mf2BevelPart(B,-2.6,16.15,side*4.35,7.2,.82,2.15,.24,'armor',{primary:true,shared:'turret-crown'},0);
  if(MF2_SHOWCASE)for(const side of [-1,1]){
    const z=side*7.0;
    mf2BevelPart(B,-2.4,13.4,z,6.2,2.45,2.6,.48,'armor',{secondary:true,shared:'rangefinder-shell'},0);
    mf2BevelPart(B,.1,13.55,side*8.25,2.25,1.2,.72,.22,'glass',{shared:'rangefinder-optic'},0);
  }
  mf2BevelPart(B,5.2,12.4,-3.5,7.5,3.4,3.8,.68,'weapon',{shared:'breech'},0);
  mf2BevelPart(B,5.2,12.4, 3.5,7.5,3.4,3.8,.68,'weapon',{shared:'breech'},0);
  for(const side of [-1,1]){
    const z=side*3.5;
    mf2TubeX(B,7.8,27.0,14.0,z,1.36,.56,12,'weapon',{shared:'barrel'});
    mf2TubeX(B,23.8,29.6,14.0,z,1.72,.64,12,'structure',{shared:'muzzle'});
    if(MF2_SHOWCASE)for(const bx of [11.5,18.0])mf2TubeX(B,bx-1.0,bx+1.0,14.0,z,1.58,.56,12,'armor',{secondary:true,shared:'barrel-collar'});
    mf2BevelPart(B,8.5,11.7,z,7.0,1.05,1.2,.22,'machine',{shared:'recoil-rail'},0);
  }

  /* Rear reactor, flush vents, optical package, lamps and protected aerials. */
  mf2BevelPart(B,-13.4,7.0,0,7.0,4.2,10.6,.88,'energy',{secondary:true},0);
  for(const z of [-3.2,0,3.2])
    mf2BevelPart(B,-13.6,10.72,z,3.8,.72,1.25,.22,'machine',{shared:'reactor-vent'},0);
  if(MF2_SHOWCASE)for(const z of [-6.8,6.8]){
    mf2BevelPart(B,-14.8,10.2,z,4.4,3.2,2.65,.55,'structure',{shared:'exhaust-armor'},0);
    mf2TubeY(B,-15.2,12.0,16.3,z,.86,.38,10,'machine',{shared:'exhaust-stack'});
  }
  mf2BevelPart(B,-4.0,16.15,0,5.5,2.35,5.4,.62,'glass',{primary:true},0);
  for(const z of [-5.8,5.8]){
    mf2BevelPart(B,15.0,8.45,z,2.3,1.2,2.0,.3,'energy',{shared:'headlamp'},0);
    mf2TubeY(B,-9.2,13.2,18.0,z*.55,.52,.18,8,'structure',{shared:'aerial'});
  }
  B.scale(1.34);return B.build();
}
function mf2CommanderGeometry(){
  mf2Cells=[];mf2SharedUV.clear();const B=MB();
  /* Hero benchmark: a connected command mech built from the same bounded
     battle primitives as the roster, with explicit V2 semantic regions. It
     remains procedural until an authored commander bake completes the Blender
     round trip; the showcase still exercises unique UV islands, masks, damage
     and hero-scale lighting now. */
  for(const side of [-1,1]){
    const z=side*4.0;
    mf2BevelPart(B,-1.0,0,z,6.6,1.8,3.7,.58,'structure',null,0);
    mf2BevelPart(B,-.7,2.0,z,4.8,2.0,3.0,.42,'machine',null,0);
    mf2BevelPart(B,.2,7.1,z,4.6,2.8,4.0,.62,'armor',{primary:true},0);
    mf2TubeY(B,-1.2,2.4,10.7,z,1.05,.52,10,'machine',{shared:'commander-hydraulic'});
    mf2TubeY(B,-1.0,8.2,11.4,z,1.22,.62,10,'structure',{shared:'commander-knee'});
  }
  mf2HullWedge(B,0,11.2,0,11.5,7.0,9.0,7.8,'structure',null);
  mf2BevelPart(B,.3,15.6,0,8.6,5.0,7.6,.85,'armor',{primary:true,shared:'commander-chest'},0);
  mf2BevelPart(B,2.7,19.4,0,5.2,2.6,6.2,.48,'weapon',{shared:'commander-chest-plate'},0);
  for(const side of [-1,1]){
    const z=side*7.0;
    mf2BevelPart(B,.4,16.4,z,5.0,3.8,3.7,.72,'armor',{primary:true,shared:'commander-shoulder'},0);
    mf2BevelPart(B,.8,12.8,z,3.4,3.3,3.2,.42,'machine',{shared:'commander-upper-arm'},0);
    mf2TubeX(B,1.5,7.6,13.0,z,1.05,.48,10,'weapon',{shared:'commander-arm-cannon'});
    mf2BevelPart(B,5.8,13.0,z,2.4,1.3,2.2,.22,'structure',{shared:'commander-muzzle'},0);
    mf2TubeY(B,-2.0,15.8,22.0,z*.43,.58,.26,8,'machine',{shared:'commander-vent'});
    mf2TubeY(B,-1.8,18.0,22.8,z*.43,.48,.20,8,'energy',{shared:'commander-energy-vent'});
  }
  mf2BevelPart(B,-3.1,15.8,0,4.8,4.1,6.8,.64,'machine',{shared:'commander-backpack'},0);
  mf2BevelPart(B,2.0,21.2,0,4.4,3.0,4.8,.62,'structure',null,0);
  mf2BevelPart(B,3.7,23.2,0,2.7,2.1,3.7,.44,'glass',{primary:true,shared:'commander-visor'},0);
  mf2BevelPart(B,1.0,24.8,0,.92,1.6,1.0,.18,'energy',{shared:'commander-beacon'},0);
  for(const side of [-1,1]){
    mf2TubeY(B,-2.6,18.0,23.8,side*2.9,.92,.46,10,'weapon',{shared:'commander-capacitor'});
    mf2TubeY(B,-2.6,21.6,25.2,side*2.9,.68,.32,10,'energy',{shared:'commander-capacitor-glow'});
  }
  /* The halo is a readable command signature, not a floating attachment: its
     support posts intersect the backpack before the ring is drawn. */
  mf2TubeY(B,-2.1,22.0,24.6,0,2.5,2.05,18,'energy',{shared:'commander-halo'});
  B.scale(1.02);return B.build();
}
function mf2StageGeometry(){
  const B=MB();
  const hero=MF2_ASSET==='commander',pw=hero?78:116,pd=hero?62:88;
  mf2BevelPart(B,0,0,0,pw,4.0,pd,4.0,'machine',null,0);
  mf2BevelPart(B,0,3.55,0,pw-12,1.45,pd-12,2.0,'structure',null,0);
  for(const side of [-1,1]){
    const edge=pd*.715;
    mf2BevelPart(B,0,4.72,side*edge,pw-20,.52,1.2,.18,'energy',{primary:true},0);
    mf2BevelPart(B,side*(pw/2-8),4.72,0,1.2,.52,pd-14,.18,'energy',{primary:true},0);
  }
  return B.build();
}
function mf2RefGeometry(id){
  const B=MB();B.mat(id);B.bevelBox(0,0,0,6,6,6,1,[1,1,1],0);return B.build();
}
function mf2Hash(x,y,n){
  let h=(x*374761393+y*668265263+n*1442695041)|0;h=(h^(h>>>13))*1274126177;return ((h^(h>>>16))>>>0)/4294967295;
}
function mf2BuildPackedMaps(){
  const S=MF2_TEX_SIZE,step=S/MF2_GRID,A=new Uint8Array(S*S*4),B=new Uint8Array(S*S*4),C=new Uint8Array(S*S*4);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const cellX=Math.floor(x/step),cellY=Math.floor(y/step),id=cellY*MF2_GRID+cellX,M=mf2Cells[id];
    const o=(y*S+x)*4,u=(x-cellX*step)/step,v=(y-cellY*step)/step;
    if(!M){A[o]=A[o+1]=A[o+2]=72;A[o+3]=255;B[o]=B[o+1]=128;B[o+2]=210;C[o+3]=0;continue;}
    /* UV islands reserve a gutter, so texture-space cell edges are not face
       edges. Reconstruct face-local coordinates before baking AO/wear; using
       raw cell UV made the edge treatment sit outside the sampled island. */
    const fu=clamp((u-M.u0)/Math.max(.001,M.u1-M.u0),0,1);
    const fv=clamp((v-M.v0)/Math.max(.001,M.v1-M.v0),0,1);
    const D=mf2Semantic(M.sem),bake=MF2_BESPOKE_PACK&&MF2_BESPOKE_PACK.bake;
    const edge=Math.min(fu,fv,1-fu,1-fv),edgeWidth=bake?bake.edgeWidth:.052;
    const grain=(mf2Hash(x,y,id)-.5)*(MF2_SHOWCASE?8:4);
    const canDetail=MF2_SHOWCASE&&mf2DetailPixels&&(M.sem==='armor'||M.sem==='structure'||M.sem==='weapon');
    let detail=0,detailDX=0,detailDY=0;
    if(canDetail){
      const ds=mf2DetailSide,sx=Math.min(ds-1,Math.max(0,Math.floor(fu*(ds-1))));
      const sy=Math.min(ds-1,Math.max(0,Math.floor(fv*(ds-1))));
      const dl=Math.max(0,sx-1),dr=Math.min(ds-1,sx+1),dt=Math.max(0,sy-1),db=Math.min(ds-1,sy+1);
      const sample=(px,py)=>mf2DetailPixels[(py*ds+px)*4]/255;
      detail=sample(sx,sy)-.58;detailDX=sample(dr,sy)-sample(dl,sy);detailDY=sample(sx,db)-sample(sx,dt);
    }
    const panelWidth=bake?bake.panelWidth:null;
    const panelLine=(id&1)?Math.abs(fu-.5)<(panelWidth||.022):Math.abs(fv-.5)<(panelWidth||.019);
    const seam=panelLine?.72:1.0,edgeHi=edge<.052?1.20:1.0;
    const cornerX=fu<.5?.15:.85,cornerY=fv<.5?.15:.85;
    const bdx=fu-cornerX,bdy=fv-cornerY,boltD=Math.hypot(bdx,bdy);
    const bolt=(M.sem==='armor'||M.sem==='structure')&&(id%(bake?bake.boltStride:4)===0)&&boltD<.058;
    const hi=bolt?1.42:edgeHi;
    A[o]=clamp(D.base[0]*seam*hi+grain+detail*25,0,255);
    A[o+1]=clamp(D.base[1]*seam*hi+grain+detail*23,0,255);
    A[o+2]=clamp(D.base[2]*seam*hi+grain+detail*20,0,255);
    A[o+3]=bolt?205:edge<.07?150:edge<.14?205:panelLine?188:242;
    let nx=128,ny=128;
    if(edge<.075){if(fu<.075)nx=82;else if(fu>.925)nx=174;if(fv<.075)ny=82;else if(fv>.925)ny=174;}
    if(panelLine){if(id&1)nx+=(fu<.5?-24:24);else ny+=(fv<.5?-24:24);}
    if(bolt){const bl=Math.max(.001,boltD);nx=128+bdx/bl*34;ny=128+bdy/bl*34;}
    const micro=(mf2Hash(x*3,y*5,id+19)-.5)*(MF2_SHOWCASE?8:3);
    B[o]=clamp(nx+micro-detailDX*58,0,255);B[o+1]=clamp(ny-micro*.45+detailDY*58,0,255);
    B[o+2]=clamp(D.rough+(mf2Hash(y,x,id+31)-.5)*(MF2_SHOWCASE?18:8)+detail*34-(bolt?42:0),12,250);
    B[o+3]=D.emissive||0;
    C[o]=bolt?245:D.metal;C[o+1]=M.primary?218:0;
    C[o+2]=M.secondary&&(fv>.39&&fv<.61)?224:0;
    const canWear=M.sem==='armor'||M.sem==='structure'||M.sem==='weapon';
    C[o+3]=bolt?220:canWear&&edge<edgeWidth?clamp((bake?bake.wearFloor:92)+mf2Hash(y,x,id)*136,0,255):panelLine?34:8;
  }
  return [A,B,C];
}
function mf2UploadTexture(data,srgb){
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  gl.texImage2D(gl.TEXTURE_2D,0,srgb?gl.SRGB8_ALPHA8:gl.RGBA8,MF2_TEX_SIZE,MF2_TEX_SIZE,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.generateMipmap(gl.TEXTURE_2D);
  const an=gl.getExtension('EXT_texture_filter_anisotropic');
  if(an)gl.texParameterf(gl.TEXTURE_2D,an.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  return t;
}
function mf2UploadImage(tex,img,srgb){
  const bound=gl.getParameter(gl.TEXTURE_BINDING_2D),align=gl.getParameter(gl.UNPACK_ALIGNMENT),flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
  gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  /* glTF UV0 and its exported bake use the same convention. A browser-side
     Y flip would move wear, normals and faction masks onto unrelated panels. */
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,srgb?gl.SRGB8_ALPHA8:gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,img);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.generateMipmap(gl.TEXTURE_2D);
  const an=gl.getExtension('EXT_texture_filter_anisotropic');
  if(an)gl.texParameterf(gl.TEXTURE_2D,an.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,align);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);gl.bindTexture(gl.TEXTURE_2D,bound);
}
function mf2CreateDamageTexture(){
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([22,22,22,255]));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
  return t;
}
function mf2LoadDamageTexture(){
  const epoch=glEpoch;
  const img=new Image();img.onload=()=>{
    if(epoch!==glEpoch||!mf2DamageTex)return;
    const bound=gl.getParameter(gl.TEXTURE_BINDING_2D),align=gl.getParameter(gl.UNPACK_ALIGNMENT),flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    gl.bindTexture(gl.TEXTURE_2D,mf2DamageTex);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,img);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D);
    const an=gl.getExtension('EXT_texture_filter_anisotropic');
    if(an)gl.texParameterf(gl.TEXTURE_2D,an.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,align);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);gl.bindTexture(gl.TEXTURE_2D,bound);
    const stats=document.getElementById('mf2Stats');if(stats)stats.textContent=stats.textContent.replace('damage tile loading','cracked burn tile ready');
  };img.onerror=()=>console.warn('[MaterialV2] Cracked burn tile unavailable');
  img.src=(typeof mf2AssetURL==='function')?mf2AssetURL('assets/textures/materials/mf2-carbon-cracks-v1.png')
                                          :'assets/textures/materials/mf2-carbon-cracks-v1.png';
}
function mf2LoadAuthoredMaps(){
  const epoch=glEpoch;
  const files=[MF2_MAP_FILE+'-baseao.png',MF2_MAP_FILE+'-nre.png',MF2_MAP_FILE+'-masks.png'];
  Promise.all(files.map(file=>new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error(file));
    img.src=(typeof mf2AssetURL==='function')?mf2AssetURL('assets/textures/materials/'+file)
                                            :('assets/textures/materials/'+file);
  }))).then(imgs=>{
    if(epoch!==glEpoch||!mf2BaseAO||!mf2NRE||!mf2Masks)return;
    mf2UploadImage(mf2BaseAO,imgs[0],true);mf2UploadImage(mf2NRE,imgs[1],false);mf2UploadImage(mf2Masks,imgs[2],false);
    mf2AuthoredMapsReady=true;
    const stats=document.getElementById('mf2Stats');
    if(stats)stats.textContent=stats.textContent.replace('authored maps loading','authored maps ready');
  }).catch(err=>console.warn('[MaterialV2] Authored packed maps unavailable',err));
}
function mf2RefreshPackedTextures(){
  if(!mf2BaseAO||!mf2NRE||!mf2Masks)return;
  const maps=mf2BuildPackedMaps();
  for(const pair of [[mf2BaseAO,maps[0]],[mf2NRE,maps[1]],[mf2Masks,maps[2]]]){
    gl.bindTexture(gl.TEXTURE_2D,pair[0]);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,MF2_TEX_SIZE,MF2_TEX_SIZE,gl.RGBA,gl.UNSIGNED_BYTE,pair[1]);
    gl.generateMipmap(gl.TEXTURE_2D);
  }
}
function mf2LoadDetailSource(){
  if(!MF2_SHOWCASE||mf2DetailRequested)return;
  mf2DetailRequested=true;
  const epoch=glEpoch;
  const img=new Image();
  img.onload=()=>{
    if(epoch!==glEpoch||!mf2BaseAO||!mf2NRE||!mf2Masks)return;
    try{
      /* Bake the authored micro-surface into the packed maps once. It adds no
         texture lookup to the battle shader, and semantic filtering prevents
         armor grain from contaminating glass, lights or open machinery. */
      const side=512,c=document.createElement('canvas');c.width=c.height=side;
      const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(img,0,0,side,side);
      mf2DetailPixels=cx.getImageData(0,0,side,side).data;mf2DetailSide=side;
      mf2RefreshPackedTextures();mf2DetailReady=true;
      const stats=document.getElementById('mf2Stats');if(stats)stats.textContent=stats.textContent.replace('microdetail loading','authored microdetail baked');
    }catch(err){console.warn('[MaterialV2] Detail bake skipped',err);}
  };
  img.onerror=()=>console.warn('[MaterialV2] Authored microdetail source unavailable');
  img.src=(typeof mf2AssetURL==='function')?mf2AssetURL('assets/textures/materials/mf_mechanical_microdetail_v2.webp')
                                          :'assets/textures/materials/mf_mechanical_microdetail_v2.webp';
}
function mf2ResetContextResources(){
  if(mf2Epoch===glEpoch)return;
  /* A restored WebGL context makes every old program, texture, VAO and buffer
     handle invalid while leaving the JavaScript references truthy. Rebuild the
     opt-in lab exactly like a cold start instead of drawing through dead V2
     objects after a device context loss. */
  mf2Prog=null;mf2U={};mf2BaseAO=null;mf2NRE=null;mf2Masks=null;mf2DamageTex=null;
  mf2LegacyTank=null;mf2Tank=null;mf2Stage=null;mf2LegacyStage=null;mf2Refs=[];
  mf2Geo=null;mf2TankCellCount=0;mf2ImportedMeta=null;mf2AuthoredMapsReady=false;mf2DetailReady=false;mf2DetailRequested=false;
  mf2Epoch=glEpoch;
}
function mf2BuildOverlay(){
  if(!MF2_LAB_ENABLED||mf2Overlay)return;
  document.body.classList.add('mfMat2Lab');
  const style=document.createElement('style');style.id='mf2LabStyle';style.textContent=`
body.mfMat2Lab .overlay,body.mfMat2Lab #mfPreAlphaIntro,body.mfMat2Lab #mfBootCover,
body.mfMat2Lab #topbar,body.mfMat2Lab #heroBar,body.mfMat2Lab #cmdbar,
body.mfMat2Lab #minimapWrap,body.mfMat2Lab #toast,body.mfMat2Lab #coach,
body.mfMat2Lab #goalBar,body.mfMat2Lab #wcRow,body.mfMat2Lab #infMeter,
body.mfMat2Lab #apOverlay{display:none!important}
body.mfMat2Lab #grade{display:none!important}body.mfMat2Lab #gl{filter:none!important}
#mf2LabUI{position:fixed;z-index:2147482000;left:max(10px,env(safe-area-inset-left));right:max(10px,env(safe-area-inset-right));top:calc(env(safe-area-inset-top) + 10px);color:#dff7ff;font:700 11px/1.35 system-ui,sans-serif;pointer-events:none}
#mf2LabUI .mf2Card{max-width:520px;margin:auto;padding:10px 12px;border:1px solid #3abbe5;border-radius:13px;background:rgba(3,12,23,.88);box-shadow:0 8px 30px #000b;backdrop-filter:blur(10px)}
#mf2LabUI h1{font-size:14px;letter-spacing:.12em;margin:0 0 5px;color:#80ddff}#mf2LabUI p{margin:2px 0;color:#9db5c5}
#mf2LabUI .mf2Key{display:flex;gap:8px;flex-wrap:wrap;margin-top:7px}.mf2Key b{padding:4px 7px;border-radius:7px;background:#10283b}.mf2Key b:last-child{color:#71f0ff;border:1px solid #28aeda}
#mf2LabUI .mf2Btns{pointer-events:auto;display:flex;gap:5px;overflow-x:auto;margin-top:8px;padding-bottom:2px}.mf2Btns button{min-width:48px;min-height:42px;border:1px solid #355873;border-radius:9px;background:#0b1b2b;color:#aac3d5;font:800 9px system-ui}.mf2Btns button.on{border-color:#47d8ff;background:#15547a;color:white}
#mf2LabUI .mf2StateBtns{pointer-events:auto;display:flex;gap:5px;margin-top:6px}.mf2StateBtns button{flex:1;min-height:30px;border:1px solid #35495e;border-radius:7px;background:#0a1725;color:#8ba9bd;font:800 9px system-ui}.mf2StateBtns button.on{border-color:#e5a33f;color:#ffe2a2;background:#3a280c}
#mf2Night{pointer-events:auto;float:right;min-height:42px;padding:0 12px;border:1px solid #d5a13a;border-radius:9px;background:#3b2a0b;color:#ffe6a2;font-weight:900}
`;document.head.appendChild(style);
  mf2Overlay=document.createElement('div');mf2Overlay.id='mf2LabUI';
  const labels=['LIT','ALBEDO','NORMAL','AO','ROUGH','METAL','MASKS','EMISSIVE','WEAR','DAMAGE'];
  mf2Overlay.innerHTML='<div class="mf2Card"><button id="mf2Night">DAY</button><h1>MATERIAL V2 · '+(MF2_SHOWCASE?(MF2_ASSET==='factory'?'NOVA FACTORY':MF2_ASSET==='commander'?'NOVA COMMANDER':'ARSENAL SHOWCASE'):'OPT-IN LAB')+'</h1>'+
    '<p id="mf2Stats">Initialising benchmark…</p><div class="mf2Key">'+
    (MF2_SHOWCASE?'<b>'+(MF2_ASSET==='factory'?'CONNECTED PRODUCTION STRUCTURE':MF2_ASSET==='commander'?'COMMANDER HERO BENCHMARK':'CONNECTED HIGH-DETAIL UNIT')+'</b><b>SHOWCASE MATERIAL LOD</b>':'<b>LEFT · LEGACY</b><b>RIGHT · MATERIAL V2</b>')+'</div>'+ 
    '<div class="mf2Btns">'+labels.map((v,i)=>'<button data-mf2="'+i+'" class="'+(i===0?'on':'')+'">'+v+'</button>').join('')+'</div>'+
    (MF2_SHOWCASE?'<div class="mf2StateBtns"><button data-mf2-damage="0" class="on">CLEAN</button><button data-mf2-damage=".5">WORN</button><button data-mf2-damage="1">BURNING</button><button data-mf2-damage="2">DESTROYED</button></div><div class="mf2StateBtns"><button data-mf2-view="close" class="on">CLOSE</button><button data-mf2-view="tactical">TACTICAL</button><button data-mf2-view="far">FAR</button></div>':'')+'</div>';
  document.body.appendChild(mf2Overlay);
  mf2Overlay.querySelectorAll('[data-mf2]').forEach(btn=>btn.addEventListener('pointerdown',e=>{
    e.preventDefault();mf2Debug=+btn.dataset.mf2;window.MFMaterialV2Debug=mf2Debug;
    mf2Overlay.querySelectorAll('[data-mf2]').forEach(b=>b.classList.toggle('on',b===btn));
  }));
  mf2Overlay.querySelectorAll('[data-mf2-damage]').forEach(btn=>btn.addEventListener('pointerdown',e=>{
    e.preventDefault();mf2Damage=+btn.dataset.mf2Damage;
    mf2Overlay.querySelectorAll('[data-mf2-damage]').forEach(b=>b.classList.toggle('on',b===btn));
  }));
  mf2Overlay.querySelectorAll('[data-mf2-view]').forEach(btn=>btn.addEventListener('pointerdown',e=>{
    e.preventDefault();mf2View=btn.dataset.mf2View;
    mf2Overlay.querySelectorAll('[data-mf2-view]').forEach(b=>b.classList.toggle('on',b===btn));
  }));
  mf2Overlay.querySelector('#mf2Night').addEventListener('pointerdown',e=>{
    e.preventDefault();mf2Night=mf2Night?0:1;e.currentTarget.textContent=mf2Night?'NIGHT':'DAY';
  });
}
function mf2RequestImportedPayload(){
  if(mf2PayloadRequested)return;mf2PayloadRequested=true;
  const s=document.createElement('script');
  s.src='assets/data/'+MF2_ASSET_FILE+(MF2_AUTHORED_LOD?'-lod1':'')+'.js';s.async=true;
  s.onload=()=>{
    if(typeof initMaterialV2==='function'&&initMaterialV2()&&typeof setupAttract==='function')setupAttract();
  };
  s.onerror=()=>{
    mf2PayloadFailed=true;console.warn('[MaterialV2] Authored '+MF2_ASSET+' payload unavailable; using procedural showcase fallback');
    if(typeof initMaterialV2==='function'&&initMaterialV2()&&typeof setupAttract==='function')setupAttract();
  };
  document.head.appendChild(s);
}
function initMaterialV2(){
  if(!MF2_LAB_ENABLED)return false;
  mf2ResetContextResources();
  mf2BuildOverlay();
  if(MF2_SHOWCASE&&MF2_ASSET!=='commander'&&!mf2PayloadFailed&&!(typeof MF2_IMPORTED_GEO==='object'&&MF2_IMPORTED_GEO[MF2_ASSET_KEY])){
    const stats=document.getElementById('mf2Stats');if(stats)stats.textContent='Loading authored Blender benchmark…';
    mf2RequestImportedPayload();return false;
  }
  if(mf2Prog)return true;
  /* mkProg() defers link validation (see mesh.js). This fallback must know
     NOW whether the V2 program linked, so ask explicitly. */
  mf2Prog=mkProg(MF2_VS,MF2_FS,'material-v2');if(!mfProgOk(mf2Prog))return false;
  for(const k of ['uVP','uEye','uSun','uSunC','uAmbSky','uAmbGnd','uFogC','uSecondary','uEmissive','uDebug','uShowcase','uDamage','uAssetKind','uBaseAO','uNRE','uMasks','uDamageTex'])
    mf2U[k]=gl.getUniformLocation(mf2Prog,k);
  mf2Geo=(MF2_SHOWCASE&&mf2ImportedTankGeometry())||(MF2_ASSET==='commander'?mf2CommanderGeometry():mf2TankGeometry());
  mf2TankCellCount=mf2ImportedMeta&&mf2ImportedMeta.materials?mf2ImportedMeta.materials.length:mf2Cells.length;
  const stageGeo=mf2StageGeometry(),maps=mf2BuildPackedMaps();
  mf2BaseAO=mf2UploadTexture(maps[0],true);mf2NRE=mf2UploadTexture(maps[1],false);mf2Masks=mf2UploadTexture(maps[2],false);
  mf2DamageTex=mf2CreateDamageTexture();mf2LoadDamageTexture();
  mf2LegacyTank=new InstMesh(gl,mf2Geo,220);mf2Tank=new MF2InstMesh(gl,mf2Geo,240);
  mf2Stage=new MF2InstMesh(gl,stageGeo,2);mf2LegacyStage=new InstMesh(gl,stageGeo,2);
  mf2Refs=[120,121,122,123].map(id=>new MF2InstMesh(gl,mf2RefGeometry(id),2));
  const q=new URLSearchParams(location.search),n=Number(q.get('materialcount')||1);
  mf2LabCount=Math.max(1,Math.min(200,Number.isFinite(n)?n|0:1));
  mf2LabPath=q.get('materialpath')==='legacy'?'legacy':'v2';
  const stats=document.getElementById('mf2Stats');if(stats)stats.textContent=
    Math.round(mf2Geo.count/3)+' tris · '+mf2TankCellCount+(mf2ImportedMeta?' semantic regions · authored LOD'+MF2_AUTHORED_LOD:' authored UV cells')+' · '+
    (MF2_TEX_SIZE*MF2_TEX_SIZE*20/1048576).toFixed(1)+' MB maps · '+mf2LabCount+' '+
    (mf2LabPath==='legacy'?'legacy':'V2')+' instance'+(mf2LabCount===1?'':'s')+' · damage tile loading';
  window.__mfMaterialV2={enabled:true,version:2,asset:MF2_ASSET,assetKey:MF2_ASSET_KEY,epoch:mf2Epoch,packing:'BaseAO + NormalRoughEmissive + MetalFactionWear',
    textureSize:MF2_TEX_SIZE,textureBytes:MF2_TEX_SIZE*MF2_TEX_SIZE*4*4*4/3,
    cells:mf2TankCellCount,triangles:mf2Geo.count/3,count:mf2LabCount,path:mf2LabPath,
    geometrySource:mf2ImportedMeta?'Blender GLB':'procedural fallback',importedMeta:mf2ImportedMeta,
    geometryLod:mf2ImportedMeta?MF2_AUTHORED_LOD:'battle',
     detailSource:mf2ImportedMeta?MF2_MAP_FILE+' packed maps':MF2_BESPOKE_PACK&&MF2_BESPOKE_PACK.source==='semantic-bake'?'Nova commander bespoke semantic bake':'mf_mechanical_microdetail_v2.webp',
    bespokePack:MF2_BESPOKE_PACK?{faction:MF2_BESPOKE_PACK.faction,source:MF2_BESPOKE_PACK.source,maps:MF2_BESPOKE_PACK.maps,uv:MF2_BESPOKE_PACK.uv}:null,
    damageTexture:'assets/textures/materials/mf2-carbon-cracks-v1.png',
    detailReady:()=>mf2ImportedMeta?mf2AuthoredMapsReady:mf2DetailReady,
    authoredMapsReady:()=>mf2AuthoredMapsReady,
    debug:()=>mf2Debug,damage:()=>mf2Damage,view:()=>mf2View,lastGLError:()=>mf2LastGLError};
  if(MF2_SHOWCASE){
    if(mf2ImportedMeta){if(stats)stats.textContent+=' · authored maps loading';mf2LoadAuthoredMaps();}
    else if(MF2_ASSET==='commander'){mf2DetailReady=true;if(stats)stats.textContent+=' · procedural hero maps ready';}
    else {if(stats)stats.textContent+=' · microdetail loading';mf2LoadDetailSource();}
  }
  return true;
}
function materialV2LabEnabled(){return !!(MF2_LAB_ENABLED&&mf2Epoch===glEpoch&&mf2Prog&&mf2Tank);}
function materialV2LabNightAmount(){return materialV2LabEnabled()?mf2Night:null;}
function mf2ViewSpan(){
  if(MF2_ASSET==='factory')return mf2View==='far'?700:mf2View==='tactical'?440:225;
  if(MF2_ASSET==='commander')return mf2View==='far'?420:mf2View==='tactical'?270:145;
  return mf2View==='far'?620:mf2View==='tactical'?390:190;
}
function materialV2SetupAttract(){
  if(!materialV2LabEnabled())return false;
  attractCX=MAP*SP_LO;attractCY=MAP*SP_HI;attractOn=true;attractT=0;
  const spread=Math.ceil(Math.sqrt(mf2LabCount));
  orthoSpan=distTarget=mf2LabCount>1?Math.max(760,spread*58):(MF2_SHOWCASE?mf2ViewSpan():420);
  cam.x=attractCX;cam.y=attractCY;camYaw=yawTarget=MF2_SHOWCASE?.55:.08;
  camPitch=pitchTarget=MF2_SHOWCASE?.72:.98;
  /* The production camera correctly enforces company-view zoom and a steep
     tactical pitch. Arsenal is the controlled exception: calling clampCam()
     here would silently force 255 back to 420 and .72 back to 1.05, erasing
     the close-up view this material tier exists to validate. */
  if(!MF2_SHOWCASE)clampCam();else camDist=orthoSpan;
  camUpdateMatrices();document.body.classList.add('menuMode');return true;
}
function materialV2TickAttract(dt){
  if(!materialV2LabEnabled())return false;
  attractT+=dt;const spread=Math.ceil(Math.sqrt(mf2LabCount));
  camYaw=yawTarget=(MF2_SHOWCASE?.55:.08)+Math.sin(attractT*.18)*(MF2_SHOWCASE?.22:.10);
  orthoSpan=distTarget=mf2LabCount>1?Math.max(760,spread*58):(MF2_SHOWCASE?mf2ViewSpan():420);
  camPitch=pitchTarget=MF2_SHOWCASE?.72:.98;cam.x=attractCX;cam.y=attractCY;
  if(!MF2_SHOWCASE)clampCam();else camDist=orthoSpan;
  camUpdateMatrices();return true;
}
function mf2Begin(night){
  const S=sunFor(night);gl.useProgram(mf2Prog);
  gl.uniformMatrix4fv(mf2U.uVP,false,matVP);gl.uniform3f(mf2U.uEye,eyeX,eyeY,eyeZ);
  gl.uniform3f(mf2U.uSun,S.dir[0],S.dir[1],S.dir[2]);
  {const c=_lin(S.col);gl.uniform3f(mf2U.uSunC,c[0],c[1],c[2]);}
  {const c=_lin(S.sky);gl.uniform3f(mf2U.uAmbSky,c[0],c[1],c[2]);}
  {const c=_lin(S.gnd);gl.uniform3f(mf2U.uAmbGnd,c[0],c[1],c[2]);}
  {const c=_lin(S.fog);gl.uniform3f(mf2U.uFogC,c[0],c[1],c[2]);}
  gl.uniform3f(mf2U.uSecondary,1.0,.66,.08);gl.uniform3f(mf2U.uEmissive,.05,.72,1.0);
  gl.uniform1i(mf2U.uDebug,mf2Debug);
  gl.uniform1f(mf2U.uShowcase,MF2_SHOWCASE?1:0);
  gl.uniform1f(mf2U.uDamage,mf2Damage);
   gl.uniform1f(mf2U.uAssetKind,MF2_ASSET==='factory'?1:MF2_ASSET==='commander'?2:0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,mf2BaseAO);gl.uniform1i(mf2U.uBaseAO,0);
  /* Unit 1 is intentionally used here. Post-processing owns 4/5/6 and moving
     this sampler there can corrupt the next full-screen pass. */
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mf2DamageTex);gl.uniform1i(mf2U.uDamageTex,1);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,mf2NRE);gl.uniform1i(mf2U.uNRE,2);
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,mf2Masks);gl.uniform1i(mf2U.uMasks,3);
}
function materialV2QueueShadows(S){
  if(!materialV2LabEnabled()||!FX.shadow)return false;
  const sd=S.dir,el=Math.max(.22,sd[1]),kx=-sd[0]/el,kz=-sd[2]/el;
  const put=(x,y,scale)=>{
    const h=16*scale,cx=x+kx*h*.55,cy=y+kz*h*.55;
    FX.shadow.add(cx,cy,terrainH(cx,cy)+.9,27*scale+h*Math.min(2.4,Math.hypot(kx,kz))*.55,
      Math.atan2(kz,kx),255,255,255,255,18*scale);
  };
  if(mf2LabCount===1){
    if(MF2_SHOWCASE)put(attractCX,attractCY,mf2ImportedMeta?(MF2_ASSET==='factory'?1.70:2.05):1.58);
    else {put(attractCX,attractCY-52,1);put(attractCX,attractCY+52,1);}
  }else{
    const cols=Math.ceil(Math.sqrt(mf2LabCount)),gap=52,rows=Math.ceil(mf2LabCount/cols);
    for(let i=0;i<mf2LabCount;i++)put(attractCX+(Math.floor(i/cols)-(rows-1)/2)*gap,
      attractCY+(i%cols-(cols-1)/2)*gap,.72);
  }
  return true;
}
function renderMaterialV2Lab(night,t){
  if(!materialV2LabEnabled())return false;
  /* Nova identification is deep military blue with cyan reserved for optics
     and energy. The previous sky-blue team tint repainted whole armor panels
     into the same glow colour as the sensor package. */
  const blue=[38,86,176],at=(x,y)=>terrainH(x,y);
  if(mf2LabCount===1){
    if(MF2_SHOWCASE){
      const h=at(attractCX,attractCY);
      /* Keep the plinth on legacy materials when the authored tank atlas is
         active. Sampling tank-only UV data on unrelated stage geometry would
         create false seams and panels around the benchmark. */
      if(mf2ImportedMeta)mf2LegacyStage.add(attractCX,attractCY,h,1,.10,255,255,255,255);
      else mf2Stage.add(attractCX,attractCY,h,1,.10,255,255,255,255);
      mf2Tank.add(attractCX,attractCY,h+5.0,mf2ImportedMeta?(MF2_ASSET==='factory'?1.70:2.05):1.58,.10,blue[0],blue[1],blue[2],255);
    }else{
      /* Same geometry, same transform scale, same directional environment. */
      mf2LegacyTank.add(attractCX,attractCY-52,at(attractCX,attractCY-52),1,.10,blue[0],blue[1],blue[2],255);
      mf2LegacyTank.flush(gl);
      mf2Tank.add(attractCX,attractCY+52,at(attractCX,attractCY+52),1,.10,blue[0],blue[1],blue[2],255);
    }
  }else{
    const cols=Math.ceil(Math.sqrt(mf2LabCount)),gap=52;
    for(let i=0;i<mf2LabCount;i++){
      const row=Math.floor(i/cols),col=i%cols;
      const x=attractCX+(row-(Math.ceil(mf2LabCount/cols)-1)/2)*gap;
      const y=attractCY+(col-(cols-1)/2)*gap;
      const stream=mf2LabPath==='legacy'?mf2LegacyTank:mf2Tank;
      stream.add(x,y,at(x,y),0.72,(i%4)*.14,blue[0],blue[1],blue[2],255);
    }
  }
  if(mf2LabCount>1&&mf2LabPath==='legacy'){
    mf2LegacyTank.flush(gl);mf2LastGLError=0;return true;
  }
  /* getError is intentionally used only in this opt-in laboratory. Drain the
     legacy renderer's queued capability-query error before V2 so the recorded
     value belongs to this shader/texture/draw sequence, not an earlier pass. */
  if(MF2_SHOWCASE&&mf2ImportedMeta&&mf2LegacyStage)mf2LegacyStage.flush(gl);
  for(let i=0;i<8&&gl.getError()!==gl.NO_ERROR;i++){}
   mf2Begin(night);
   if(MF2_SHOWCASE&&!mf2ImportedMeta&&mf2Stage){
     gl.uniform1f(mf2U.uDamage,0);mf2Stage.flushV2();gl.uniform1f(mf2U.uDamage,mf2Damage);
   }
   mf2Tank.flushV2();
  if(mf2LabCount===1&&!MF2_SHOWCASE){
    const names=mf2Refs;for(let i=0;i<names.length;i++){
      const x=attractCX+65,y=attractCY-54+i*36;
      names[i].add(x,y,at(x,y),3.7,t*.18,255,255,255,255);names[i].flushV2();
    }
  }
   mf2LastGLError=gl.getError();
  if(MF2_SHOWCASE&&mf2LabCount===1&&mf2Damage>.72){
    const h=at(attractCX,attractCY),destroyed=mf2Damage>1.25,isFactory=MF2_ASSET==='factory';
    const fxX=attractCX+(isFactory?17:-7),fxY=attractCY+(isFactory?2:1),fxZ=h+(isFactory?64:43);
    /* The showcase plinth is five units above terrain, so its persistent
       scorch must sit on that receiver rather than disappear underneath it. */
    FX.disc.add(fxX,fxY,h+5.12,destroyed?(isFactory?60:46):(isFactory?44:34),t*.02,18,13,11,destroyed?150:92);
    FX.ring.add(fxX,fxY,h+5.16,destroyed?(isFactory?57:43):(isFactory?41:31),t*.03,48,24,14,destroyed?82:58);
    if(!destroyed){
      const flame=sprites.flame||sprites.fireball||sprites.glow;
      /* `sprites.flame` is an authored tapered fire silhouette rendered by
         the depth-aware billboard batch. Keep each source coherent: random
         radial cores/lobes made fire read as an explosion frozen in time. */
      const flick=.94+Math.sin(t*7.4)*.06;
      bbAdd.add(flame,fxX,fxY-3,fxZ,(isFactory?48:42)*flick,-t*.10,255,255,255,218);
      bbAdd.add(flame,fxX+(isFactory?-22:17),fxY+5,fxZ-(isFactory?7:6),(isFactory?37:31)*(1.02+Math.sin(t*6.2+1.7)*.05),t*.08,255,255,255,196);
      /* One restrained base light illuminates the hull; it is not part of the
         flame silhouette and stays broad/soft like reflected firelight. */
      bbAdd.add(sprites.glow||flame,fxX-1,fxY,fxZ-(isFactory?22:20),isFactory?48:36,0,255,86,18,62);
    }
    const smokeN=destroyed?7:6;
    for(let i=0;i<smokeN;i++){
      const a=i*2.21-t*.11,px=fxX+Math.cos(a)*(4+i*1.8),py=fxY+Math.sin(a)*(3+i*1.2);
      const z=(isFactory?fxZ-2:h+(destroyed?35:49))+i*8,sz=(destroyed?22:19)+i*3.6;
      bbAlpha.add(sprites.smoke||sprites.glow,px,py,z,sz,-t*.13+i,30+i*2,27+i*2,25+i*2,destroyed?205-i*9:156-i*10);
    }
  }
  begin3D(night);return true;
}

