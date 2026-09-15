;
;
/* ============================================================================
   OCEAN SURFACE
   ----------------------------------------------------------------------------
   A camera-following grid displaced by the FFT cascades, shaded for the
   battle camera: an orthographic view 60-86 degrees above the horizon, where
   a crest is almost never seen in silhouette. Peaks therefore have to read
   through what that camera does see - crest glow, the break in the specular,
   lace foam, and horizontal displacement - so those are the terms that carry
   weight here, not a horizon or a refraction.

   Opaque on purpose. The seabed seen through shallows is synthesised from the
   terrain height texture instead of blended over real terrain, so a phone pays
   no transparent overdraw across a full-screen sea.

   Foam is never a hard Jacobian line. Foam AMOUNT (persistent whitecaps, the
   live crest term and shore surf) sets a threshold on a tileable lace texture:
   a little foam is thin veins, a lot is solid white. Cellular noise is used
   here as foam structure only; wave shape comes from the spectrum.

   Output is display-referred filmic (1 - exp), the same contract as the
   engine's scene colour: no extra gamma.
   ============================================================================ */
/* Gray-Scott reaction-diffusion on a wrapped grid ("coral" regime). */
const MF_OCEAN_RD_FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uState; uniform int uInit; uniform int uN;
out vec4 o;
float h1(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec2 at(ivec2 p){return texelFetch(uState,ivec2((p.x+uN)%uN,(p.y+uN)%uN),0).xy;}
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy);
  if(uInit==1){
    float seed=step(0.8,h1(floor(gl_FragCoord.xy/5.0)));
    o=vec4(1.0,seed,0.0,1.0);return;
  }
  vec2 c=at(p);
  /* Anisotropic Laplacian: faster along x stretches the labyrinth into
     streaks, and the surface maps texture x along the wind. */
  vec2 lap=0.26*(at(p+ivec2(1,0))+at(p-ivec2(1,0)))+0.14*(at(p+ivec2(0,1))+at(p-ivec2(0,1)))
          +0.05*(at(p+ivec2(1,1))+at(p-ivec2(1,1))+at(p+ivec2(1,-1))+at(p-ivec2(1,-1)))-c;
  float reac=c.x*c.y*c.y;
  float A=c.x+(lap.x-reac+0.055*(1.0-c.x));
  float B=c.y+(0.5*lap.y+reac-0.117*c.y);
  o=vec4(clamp(A,0.0,1.0),clamp(B,0.0,1.0),0.0,1.0);
}`;

const MF_OCEAN_LACE_FS = `#version 300 es
precision highp float;
uniform float uRes;
uniform sampler2D uRD;
out vec4 o;
vec2 h2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453);}
float h1(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec2 worley(vec2 uv,float cells){
  vec2 p=uv*cells,i=floor(p),f=fract(p);float d1=8.0,d2=8.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 g=vec2(x,y),r=g+h2(mod(i+g,cells))-f;float d=dot(r,r);
    if(d<d1){d2=d1;d1=d;}else if(d<d2){d2=d;}
  }
  return sqrt(vec2(d1,d2));
}
float vnoise(vec2 uv,vec2 cells){
  vec2 p=uv*cells,i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  float a=h1(mod(i,cells)),b=h1(mod(i+vec2(1,0),cells)),c=h1(mod(i+vec2(0,1),cells)),d=h1(mod(i+vec2(1,1),cells));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
float fbm3(vec2 uv,float base){
  float s=0.0,a=0.5,f=base;
  for(int i=0;i<3;i++){s+=a*vnoise(uv,vec2(f));f*=2.0;a*=0.5;}
  return s/0.875;
}
/* Foam filaments are the 0.5 contour of a twice domain-warped fBm, drawn at
   a fixed width: long, curving and branching like real foam marbling.
   Cycle 5 used Worley F2-F1 edges, whose straight segments read as cracked
   glaze. Cycle 6 used five octaves, whose fractal contours thresholded into
   lichen blotches; three octaves keep the contour a clean curve. Every noise
   here has an integer cell count, so the texture still tiles. */
float ridges(vec2 uv,float base,float width){
  vec2 q=vec2(fbm3(uv,2.0),fbm3(uv+vec2(0.52,0.13),2.0));
  vec2 r=vec2(fbm3(uv+q*0.45+vec2(0.17,0.92),3.0),fbm3(uv+q*0.45+vec2(0.83,0.28),3.0));
  float n=fbm3(uv+r*0.35,base);
  return 1.0-smoothstep(0.0,width,abs(n-0.5));
}
float fbm(vec2 uv,float base){return fbm3(uv,base);}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  /* Cycle 10: filaments are the walls of a reaction-diffusion labyrinth.
     Every noise contour tried before read as a texture - cracks, lichen,
     scratches, glyphs. RD walls are connected, organic and vary in width,
     which is what foam lace looks like. */
  float fil=smoothstep(0.10,0.30,texture(uRD,uv).g);
  vec2 c=worley(uv+vec2(0.5,0.1),46.0);
  float bubbles=1.0-smoothstep(0.06,0.32,c.x);
  float breakup=fbm(uv+vec2(0.71,0.44),4.0);
  /* Alpha: the residual-foam net - thin lines around large irregular cells,
     domain-warped so no segment runs straight. Cycle 16 filled residual
     patches with the RD maze and every patch read as a golf ball; foam left
     behind a breaking crest is marbling, mostly dark water between threads. */
  /* A 0.10 warp left the cell edges straight, and the thin lines with bright
     triple junctions read as cracked glass (cycle 18). A third-of-a-tile warp
     bends every edge into a vein; softer, wider edges drop the junction blobs. */
  vec2 wq=uv+(vec2(fbm(uv+vec2(0.13,0.77),2.0),fbm(uv+vec2(0.61,0.29),2.0))-0.5)*0.32;
  vec2 n1=worley(wq,9.0),n2=worley(wq+vec2(0.37,0.11),14.0);
  float net=max(1.0-smoothstep(0.02,0.16,n1.y-n1.x),(1.0-smoothstep(0.02,0.12,n2.y-n2.x))*0.5);
  o=vec4(fil,bubbles,breakup,net);
}`;

const MF_OCEAN_SURFACE_VS = `#version 300 es
precision highp float; precision highp sampler2DArray; precision highp sampler2D;
layout(location=0) in vec2 aUV;
uniform mat4 uVP;
uniform vec2 uCenter; uniform vec2 uRight; uniform vec2 uFwd; uniform vec2 uExtent;
uniform float uSpacing; uniform float uN;
uniform vec3 uCasL; uniform vec3 uCasC; uniform vec3 uCasS;
uniform sampler2DArray uDisp;
uniform sampler2D uHeight; uniform vec4 uMapRect;
out vec2 vXZ; out vec3 vPos; out float vShore;
vec2 casUV(vec2 xz,int c){float co=uCasC[c],si=uCasS[c];return vec2(co*xz.x-si*xz.y,si*xz.x+co*xz.y)/uCasL[c];}
void main(){
  vec2 xz=uCenter+uRight*(aUV.x-0.5)*uExtent.x+uFwd*(aUV.y-0.5)*uExtent.y;
  vec3 d=vec3(0.0);
  for(int c=0;c<3;c++){
    /* Prefilter each cascade to the grid: detail finer than a vertex spacing
       belongs to the per-pixel normal, not to vertex motion that would alias. */
    float lod=max(0.0,log2(uSpacing*uN/uCasL[c]));
    d+=textureLod(uDisp,vec3(casUV(xz,c),float(c)),lod).xyz;
  }
  float g=texture(uHeight,(xz-uMapRect.xy)/(uMapRect.zw-uMapRect.xy)).r;
  /* Waves feel the bottom: amplitude dies across the last ~20 m of depth. */
  vShore=mix(0.2,1.0,smoothstep(0.0,22.0,-g));
  vXZ=xz;
  vPos=vec3(xz.x+d.x*vShore,d.y*vShore,xz.y+d.z*vShore);
  gl_Position=uVP*vec4(vPos,1.0);
}`;

const MF_OCEAN_SURFACE_FS = `#version 300 es
precision highp float; precision highp sampler2DArray; precision highp sampler2D;
in vec2 vXZ; in vec3 vPos; in float vShore;
uniform sampler2DArray uDisp; uniform sampler2DArray uDeriv; uniform sampler2DArray uFoam;
uniform sampler2D uLace; uniform sampler2D uHeight; uniform vec4 uMapRect;
uniform vec3 uCasL; uniform vec3 uCasC; uniform vec3 uCasS;
uniform vec3 uView; uniform vec3 uSun; uniform vec3 uSunC; uniform vec3 uAmb;
uniform vec3 uSkyZ; uniform vec3 uSkyH;
uniform vec3 uDeep; uniform vec3 uBody; uniform vec3 uScatter; uniform vec3 uShallow; uniform vec3 uFoamC; uniform vec3 uSand;
uniform float uHs; uniform float uTime; uniform float uStorm; uniform float uGlow; uniform float uRough; uniform float uCrestLift;
uniform float uFoamBias; uniform float uFoamSigma; uniform float uFoamBias0; uniform float uFoamSigma0; uniform float uCapSigma; uniform float uFoamFloor; uniform float uSeaStorm;
uniform sampler2D uFoamSim; uniform float uSimOn; uniform vec2 uSimOrigin; uniform float uSimSize; uniform int uDebug;
uniform float uGroupAmp; uniform vec2 uGroupDrift;
uniform sampler2D uFoamArt; uniform float uFoamArtOn; uniform float uFoamArtScale; uniform float uFoamGain; uniform float uExposure; uniform vec2 uWind;
out vec4 o;
vec2 casUV(vec2 xz,int c){float co=uCasC[c],si=uCasS[c];return vec2(co*xz.x-si*xz.y,si*xz.x+co*xz.y)/uCasL[c];}
vec3 sky(vec3 r){return mix(uSkyH,uSkyZ,pow(clamp(r.y,0.0,1.0),0.45));}
${MF_OCEAN_GROUP_GLSL}
void main(){
  vec4 D=vec4(0.0),G=vec4(0.0),D0=vec4(0.0),G0=vec4(0.0);float persist=0.0;
  for(int c=0;c<3;c++){
    vec3 uvw=vec3(casUV(vXZ,c),float(c));
    vec4 d=texture(uDisp,uvw),g=texture(uDeriv,uvw);
    if(c==0){D0=d;G0=g;}
    /* The 37 m cascade's slopes at full weight shaded the sea like hammered
       metal (cycles 13-16); it keeps its Jacobian, and 60% of its tilt. */
    D+=d;G+=g*vec4(vec2(c==2?0.45:(c==1?0.7:1.0)),1.0,1.0);
    /* Short-cascade foam is texture, not coverage: at full weight it tiled
       into white capsules (cycle 1). */
    persist=max(persist,texture(uFoam,uvw).r*(c==0?1.0:c==1?0.45:0.0));
  }
  /* Crest-scale fields, slightly prefiltered: glow and whitecap lips belong
     to the ~70 m waves, never to the chop riding on them. */
  vec3 uvw0=vec3(casUV(vXZ,0),0.0);
  vec4 D0s=texture(uDisp,uvw0,1.5),G0s=texture(uDeriv,uvw0,1.5);
  float g=texture(uHeight,(vXZ-uMapRect.xy)/(uMapRect.zw-uMapRect.xy)).r;
  float depth=vPos.y-g;
  if(depth<-0.3) discard;
  float jxx=G.z*vShore,jzz=G.w*vShore,jxz=D.w*vShore;
  float J=(1.0+jxx)*(1.0+jzz)-jxz*jxz;
  vec2 slope=G.xy*vShore/vec2(max(0.3,1.0+jxx),max(0.3,1.0+jzz));
  vec3 n=normalize(vec3(-slope.x,1.0,-slope.y));
  vec3 V=uView,L=uSun;
  float nv=max(dot(n,V),0.03),nl=max(dot(n,L),0.0);

  /* Body: navy in the troughs, lifting toward the crest, and teal scatter
     where the water is high AND the face is steep - thin water lit through. */
  float hN=D.y*vShore/max(uHs,0.05);
  /* Steepness from the slope itself: 1 - n.y is ~slope^2/2 and vanishes at
     the slopes a sea actually has, so it could never light a crest face.
     Crest-scale only: cycles 1-2 drew glow from the chop and lit a teal net
     along the ridges between its cells. */
  float h0n=D0s.y*vShore/max(uHs*0.5,0.05);
  float steep=clamp(length(G0s.xy*vShore)*3.0,0.0,1.0);
  float face=steep;
  float crestZone=smoothstep(-0.05,0.75,h0n);
  /* Crest-scale compression in units of its own spread. The swell dominates
     height, so a height-driven glow tracked broad swell bands (cycle 3);
     compression sits exactly on the breaking crests. */
  /* Prefiltered: unfiltered compression breaks every crest into cusps
     (cycle 7); the filtered field keeps compression as elongated zones along
     crest lines. Filtering lowers its spread, hence 0.8 sigma. */
  /* Wind-projected compression, -(w.grad)(w.D). The full Jacobian of a
     short-crested sea compresses along a cellular NETWORK (debug view 3,
     cycle 10): the fish-scale look behind every cycle. Waves steepen and
     break along their direction of travel, so projecting on the wind keeps
     the crest lines and drops the cross-wind cell walls. */
  float jw=(uWind.x*uWind.x*G0s.z+2.0*uWind.x*uWind.y*D0s.w+uWind.y*uWind.y*G0s.w)*vShore;
  float comp0=clamp(-jw/max(0.05,0.62*uFoamSigma0),0.0,4.0);
  float grp=(waveGroup(vXZ)-0.5)*uGroupAmp;
  vec3 body=mix(uDeep,uBody,smoothstep(-0.8,0.5,hN));
  /* Strategic zoom: crest glow aliases into dashes, so it recedes as a pixel
     covers more water. */
  float farG=smoothstep(0.9,2.6,length(fwidth(vXZ)));
  /* A translucent turquoise face rides just ahead of every whitecap: the band
     where compression is rising toward the breaking threshold. */
  float faceBand=smoothstep(uCapSigma-1.1-grp,uCapSigma-0.25-grp,comp0)*(1.0-smoothstep(uCapSigma-0.1-grp,uCapSigma+0.3-grp,comp0));
  float glow=clamp(smoothstep(0.3,1.7,comp0)*(0.45+0.9*steep)+crestZone*uCrestLift+faceBand*0.55,0.0,1.0)
            *uGlow*(0.5+0.5*uSeaStorm)*(1.0-0.6*farG);
  body=mix(body,uScatter,clamp(glow,0.0,0.92));

  /* Shallows: per-channel absorption over a lit seabed. */
  float dw=max(depth,0.0);
  vec3 bed=uSand*(uAmb+uSunC*max(L.y,0.0)*0.8)*exp(-dw*vec3(0.38,0.075,0.06));
  float see=exp(-dw*0.085);
  body=mix(body,mix(uShallow,bed,0.5),see*0.92);

  /* Top-down, relief reads as hillshade: most of the key light rides n.l so
     sun-facing slopes lift and lee slopes fall into the trough colour. */
  vec3 lit=body*(uAmb*0.9+uSunC*(0.05+0.95*nl));
  vec3 R=reflect(-V,n);R.y=max(R.y,0.03);R=normalize(R);
  float F=0.02+0.98*pow(1.0-nv,5.0);
  lit=mix(lit,sky(R),F);
  vec3 H=normalize(L+V);
  /* Roughness rises as a pixel covers more water, standing in for the slope
     variance the mips average away; without it the strategic view glitters
     like snow (cycle 18, S5). */
  float rgh=mix(uRough,0.42,farG);
  float nh=max(dot(n,H),0.0),a=rgh*rgh,a2=a*a,dn=nh*nh*(a2-1.0)+1.0;
  float Fs=0.02+0.98*pow(1.0-max(dot(V,H),0.0),5.0);
  lit+=uSunC*(a2/(3.14159*dn*dn))*Fs*nl*0.25/nv*(1.0-0.75*uStorm);

  /* Foam amount -> lace threshold. */
  /* "active" is a reserved word in GLSL ES 3.00 and fails the compile. */
  float crestFoam=clamp((uFoamBias-J)/max(0.02,0.8*uFoamSigma),0.0,1.0);
  /* Foam, as the concepts draw it: opaque white LIPS on breaking crests of
     the dominant waves, and thin white FILAMENTS through the troughs where
     older foam is stretched by wind and flow. Filaments are thin, so they can
     be fully white without becoming sheets; cycle 2's 55% blend turned them
     teal-grey and invisible.
     Lace is sampled in wind space (stretched along the wind) at the DISPLACED
     position, so filaments swirl with the orbital motion around crests. */
  /* Cycle 4: whitecaps are crest LINES where the dominant waves compress past
     a storm-scaled threshold; trailing foam comes from persistence; storms
     add a faint web floor. The lace threshold thickens filaments with amount
     and only the crest core goes solid. Cycle 3's streak term read as rain
     and is gone; its lip term fired so rarely it drew isolated capsules. */
  /* Cycle 5: cycle 4's filaments were 0.2-0.4 m wide, under a pixel at
     0.6 m/px, so mipmaps filtered them to nothing. The lace now samples at
     ~11 m cells with ~1 m veins, the scale read off the concept, and storms
     start from a web floor high enough to show it. Crest cores break up on
     the lace and weaken in calm seas, where cycle 4 drew solid capsules. */
  /* Calibrated by measurement (cycle 11: 0.3% bright, 1.5% light against the
     concept's 3.7% / 8.4%): the partial cap feeds thin lace around crests. */
  float cap=smoothstep(uCapSigma-0.3-grp,uCapSigma+0.7-grp,comp0);
  vec2 wd=uWind,wq=vec2(-uWind.y,uWind.x),q=vPos.xz;
  vec2 lq=vec2(dot(q,wd),dot(q,wq));
  /* RD walls repeat every ~14 texels: at these tiles that is ~7 m along the
     wind and ~3.5 m across, with walls 2-3 m wide - resolvable at 0.6 m/px. */
  vec4 l1=texture(uLace,vec2(lq.x/260.0,lq.y/130.0)+vec2(uTime*0.0006,0.0));
  vec4 l2=texture(uLace,vec2(lq.x/110.0,lq.y/55.0)-vec2(uTime*0.0011,0.0));
  float fil=max(l1.r,l2.r*0.6);
  vec4 l3=texture(uLace,vec2(lq.x/92.0,lq.y/46.0)+vec2(uTime*0.0009,0.0));
  /* Foam history comes from the world-space simulation (ocean-foam-sim.js):
     born on crests, carried and stretched by the surface's own motion. It
     replaces cycle 8's downwind trail samples, which could only guess at it. */
  vec2 su=(vXZ-uSimOrigin)/uSimSize;
  /* Outside the sheet, clamp-to-edge smeared its border into streaks across
     the strategic view (cycle 9): fall back to persistence there. */
  float inSim=uSimOn*smoothstep(0.0,0.04,su.x)*smoothstep(0.0,0.04,su.y)
             *smoothstep(0.0,0.04,1.0-su.x)*smoothstep(0.0,0.04,1.0-su.y);
  float simFoam=mix(persist,texture(uFoamSim,su).r,inSim);
  float amount=clamp(max(cap,simFoam)+uFoamFloor+crestFoam*0.3,0.0,1.0)*uFoamGain;
  /* Presence by amount, width by amount. Thresholding the line profile at
     1-amount clipped every filament into dashes wherever amount varied
     (cycle 7's scratches); lines now draw whole and thicken with foam. */
  /* Thin lines: cycle 10's walls filled ~half of any foamed area, and the
     render measured 27% bright foam against the concept's 3.7%. */
  /* Trailing foam as soft translucent streaks of the advected sim density,
     broken up at low frequency. Labyrinth walls behind every cap read as
     zebra patches (cycle 12), so the lace survives only as faint fine texture. */
  /* Trails stretched along the wind (three taps 6 m apart) and broken hard at
     low frequency: unstretched density rendered as round grey domes behind
     every cap (cycle 13), and the faint lace inside them read as golf balls. */
  /* Five taps 8 m apart: three stretched the patches only to ovals, which sat
     in the troughs as round blobs (cycle 20). */
  vec2 wstep=uWind*8.0/uSimSize;
  float simStreak=texture(uFoamSim,su).r*0.3
    +(texture(uFoamSim,su-wstep).r+texture(uFoamSim,su+wstep).r)*0.2
    +(texture(uFoamSim,su-wstep*2.0).r+texture(uFoamSim,su+wstep*2.0).r)*0.15;
  simStreak=mix(persist,simStreak,inSim);
  /* Trails as thin lace lines wherever the sim holds foam. Translucent filled
     density drew grey domes (cycles 13-15), and thin lines cannot form one.
     They also carry the concept's light foam (cycle 15: 7.1% against 8.4%). */
  /* Leftover foam. Six procedural textures drawn where foam lingers all read
     as a pattern on the water instead of foam: Worley cracks, fBm lichen,
     reaction-diffusion zebra, a leopard-spot veil, crackle glaze, and a
     barcode of wind streaks (cycles 5-22). Without an authored texture the
     sim's density shows only as a faint haze; with one, the texture is
     sampled in wind space at the displaced position and thresholded by the
     foam amount - Sea of Thieves' approach: a little foam shows only the
     brightest threads, a lot shows the whole texture. */
  float env=smoothstep(0.08,0.6,simStreak)*(0.55+0.45*l1.b);
  float web=env*0.1;
  if(uFoamArtOn>0.5){
    float art=texture(uFoamArt,lq/uFoamArtScale+vec2(uTime*0.004,0.0)).r;
    float cut=1.0-clamp(env*1.1,0.0,1.0);
    web=max(web,smoothstep(cut,cut+0.25,art)*env);
  }
  /* The whitecap itself is a solid band along the crest line with a broken
     edge; the labyrinth only frames it (cycles 10-11 drew zebra patches). */
  /* Opaque at the centre: the old 0.85-1.0 bubble factor kept every cap a
     partial blend, and cycle 13's brightest foam peaked at 166 of 255. */
  /* Cycle 14's caps were smooth solid strips: the handoff's "paint ribbon"
     failure. Only the band's centre stays solid; its shoulders are cut by fine
     lace holes and bubble speckle, and the edge is ragged, which is how the
     concept's whitecaps read as turbulent water. */
  float coreBand=smoothstep(uCapSigma-0.3-grp,uCapSigma+0.2-grp,comp0+(l1.b-0.5)*0.9);
  float holes=smoothstep(0.55,0.95,l2.r)*(1.0-smoothstep(0.75,1.0,coreBand));
  float core=clamp(coreBand*(1.0-0.65*holes)*(0.75+0.25*l2.g),0.0,1.0)*mix(0.3,1.0,uSeaStorm);
  /* Past ~1 m per pixel the lace cannot be resolved: fade it to its mean
     tone instead of letting it alias into dashes (cycles 4-5, strategic). */
  float fpx=length(fwidth(vXZ));
  float far=smoothstep(0.9,2.6,fpx);
  web=mix(web,amount*0.18,far);
  /* At strategic zoom a 60 m crest is a few pixels: full caps read as white
     dashes over the whole sea (cycles 11-14, S5). */
  core*=mix(1.0,0.2,far);
  float cover=max(web,core);
  /* Ship wakes. Green: the persistent turbulent trail, soft and broken up so it
     reads as churned water rather than a painted stripe. Blue: the Kelvin
     arms, stamped fresh every sim step, drawn as thinner translucent lines. */
  vec2 wakeS=texture(uFoamSim,su).gb*inSim;
  float wakeTrail=smoothstep(0.1,0.7,wakeS.x)*(0.5+0.3*l2.g+0.2*l1.b);
  float wakeArm=smoothstep(0.15,0.85,wakeS.y)*0.55*(0.7+0.3*l2.g);
  cover=max(cover,max(wakeTrail,wakeArm));
  float shore=(1.0-smoothstep(0.0,3.2,dw))*smoothstep(0.3,0.8,0.5+0.5*sin(dw*2.4-uTime*1.7+l1.b*4.0));
  /* Surf takes the marbling net, not the RD maze that striped island
     shores (cycles 10-16, S3). */
  cover=max(cover,shore*(0.55+0.45*max(l3.a,l1.b*0.8)));
  /* Foam scatters light from the whole sky dome. Lit like the water body
     it tonemapped to mid-grey (cycle 6); the concepts draw it near-white. */
  /* Measured against the concept: its foam peaks at 244 (p99.9 of the
     min channel); cycle 14 peaked at 197 through the filmic curve. */
  vec3 foamLit=uFoamC*(uAmb*3.2+uSunC*(2.0+0.9*max(L.y,0.0)))*mix(0.9,1.0,l2.g);
  lit=mix(lit,foamLit,clamp(cover,0.0,1.0));
  /* Sparse glints on steep short-wave facets. */
  float glint=smoothstep(0.6,0.95,length((G.xy-G0.xy)*vShore))*(1.0-cover)*(1.0-far);
  lit+=vec3(0.8,0.92,1.0)*glint*0.35*(0.4+0.6*l2.g);

  o=vec4(vec3(1.0)-exp(-lit*uExposure),1.0);
  /* Debug views: the masks behind the look, so coverage and organisation can
     be measured instead of guessed from the final frame. */
  if(uDebug==1) o=vec4(vec3(amount),1.0);
  else if(uDebug==2) o=vec4(vec3(simFoam),1.0);
  else if(uDebug==3) o=vec4(vec3(comp0/3.0),1.0);
  else if(uDebug==4) o=vec4(vec3(cover),1.0);
}`;

function mfOceanLaceCreate(gl, ocean, res) {
  const R = res || 512;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(R)) + 1, gl.RGBA8, R, R);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
  /* Grow the lace once: 2600 Gray-Scott steps on a wrapped grid, in float
     targets because half floats quantise the reaction and it stalls. */
  const rd = mfOceanProgram(gl, MF_OCEAN_VS, MF_OCEAN_RD_FS, 'rd');
  const rdTex = [0, 1].map(() => mfOceanTex2D(gl, R, gl.RGBA32F, gl.RGBA, gl.FLOAT, null));
  const rdFb = rdTex.map(t => mfOceanFbo(gl, [{ tex: t }]));
  const RDU = 30;
  gl.viewport(0, 0, R, R);
  gl.bindVertexArray(ocean.vao);
  gl.useProgram(rd.p);
  gl.uniform1i(rd.u.uN, R);
  gl.activeTexture(gl.TEXTURE0 + RDU);
  gl.uniform1i(rd.u.uState, RDU);
  gl.bindTexture(gl.TEXTURE_2D, rdTex[1]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, rdFb[0]);
  gl.uniform1i(rd.u.uInit, 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.uniform1i(rd.u.uInit, 0);
  let cur = 0;
  for (let i = 0; i < 2600; i += 1) {
    gl.bindTexture(gl.TEXTURE_2D, rdTex[cur]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rdFb[1 - cur]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    cur = 1 - cur;
  }
  const prog = mfOceanProgram(gl, MF_OCEAN_VS, MF_OCEAN_LACE_FS, 'lace');
  const fb = mfOceanFbo(gl, [{ tex }]);
  gl.viewport(0, 0, R, R);
  gl.useProgram(prog.p);
  gl.uniform1f(prog.u.uRes, R);
  gl.activeTexture(gl.TEXTURE0 + RDU);
  gl.bindTexture(gl.TEXTURE_2D, rdTex[cur]);
  gl.uniform1i(prog.u.uRD, RDU);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  rdFb.forEach(f => gl.deleteFramebuffer(f));
  rdTex.forEach(t => gl.deleteTexture(t));
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.deleteFramebuffer(fb);
  return tex;
}

function mfOceanSurfaceCreate(gl, ocean, options) {
  const o = options || {};
  const nu = o.nu || 420, nv = o.nv || 320;
  const S = { gl, nu, nv, unit: o.unit == null ? 16 : o.unit };
  S.prog = mfOceanProgram(gl, MF_OCEAN_SURFACE_VS, MF_OCEAN_SURFACE_FS, 'surface');
  S.lace = mfOceanLaceCreate(gl, ocean, 512);
  const uv = new Float32Array(nu * nv * 2);
  for (let j = 0; j < nv; j += 1) for (let i = 0; i < nu; i += 1) {
    uv[(j * nu + i) * 2] = i / (nu - 1); uv[(j * nu + i) * 2 + 1] = j / (nv - 1);
  }
  const idx = new Uint32Array((nu - 1) * (nv - 1) * 6);
  let k = 0;
  for (let j = 0; j < nv - 1; j += 1) for (let i = 0; i < nu - 1; i += 1) {
    const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  S.count = idx.length;
  S.vao = gl.createVertexArray();
  gl.bindVertexArray(S.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return S;
}

/* v: vp, center [x,z], yaw, pitch, span, aspect, view [x,y,z] (surface to eye),
   light {sun, sunC, amb, skyZ, skyH}, style {deep, body, scatter, shallow, foam,
   sand, glow, rough, exposure, foamGain}, storm, time, heightTex, mapRect. */
function mfOceanSurfaceDraw(S, ocean, v) {
  const gl = S.gl, P = S.prog, u = P.u, U = S.unit;
  const right = [-Math.sin(v.yaw), Math.cos(v.yaw)], fwd = [Math.cos(v.yaw), Math.sin(v.yaw)];
  const across = v.span * v.aspect * 1.12 + 80, along = v.span / Math.sin(v.pitch) * 1.12 + 80;
  const spacing = Math.max(across / (S.nu - 1), along / (S.nv - 1));
  /* Snap along the grid's own axes so vertices stay put in the world while
     the camera pans; otherwise the displaced mesh visibly swims. */
  const cr = Math.round((v.center[0] * right[0] + v.center[1] * right[1]) / spacing) * spacing;
  const cf = Math.round((v.center[0] * fwd[0] + v.center[1] * fwd[1]) / spacing) * spacing;
  gl.useProgram(P.p);
  gl.uniformMatrix4fv(u.uVP, false, v.vp);
  gl.uniform2f(u.uCenter, right[0] * cr + fwd[0] * cf, right[1] * cr + fwd[1] * cf);
  gl.uniform2f(u.uRight, right[0], right[1]);
  gl.uniform2f(u.uFwd, fwd[0], fwd[1]);
  gl.uniform2f(u.uExtent, across, along);
  gl.uniform1f(u.uSpacing, spacing);
  gl.uniform1f(u.uN, ocean.N);
  const C = ocean.cascades;
  gl.uniform3f(u.uCasL, C[0].L, C[1].L, C[2].L);
  gl.uniform3f(u.uCasC, Math.cos(C[0].rot), Math.cos(C[1].rot), Math.cos(C[2].rot));
  gl.uniform3f(u.uCasS, Math.sin(C[0].rot), Math.sin(C[1].rot), Math.sin(C[2].rot));
  const bindings = [
    ['uDisp', gl.TEXTURE_2D_ARRAY, ocean.dispArr], ['uDeriv', gl.TEXTURE_2D_ARRAY, ocean.derivArr],
    ['uFoam', gl.TEXTURE_2D_ARRAY, mfOceanFoamTex(ocean)], ['uLace', gl.TEXTURE_2D, S.lace],
    ['uHeight', gl.TEXTURE_2D, v.heightTex],
    ['uFoamSim', gl.TEXTURE_2D, v.foamSim ? mfOceanFoamSimTex(v.foamSim) : S.lace],
    /* Unset samplers still need a 2D texture bound; the lace stands in. */
    ['uFoamArt', gl.TEXTURE_2D, v.foamArt || S.lace]
  ];
  bindings.forEach(([name, target, tex], k) => {
    gl.activeTexture(gl.TEXTURE0 + U + k);
    gl.bindTexture(target, tex);
    if (u[name]) gl.uniform1i(u[name], U + k);
  });
  gl.uniform4f(u.uMapRect, v.mapRect[0], v.mapRect[1], v.mapRect[2], v.mapRect[3]);
  const L = v.light, st = v.style;
  gl.uniform3fv(u.uView, v.view); gl.uniform3fv(u.uSun, L.sun); gl.uniform3fv(u.uSunC, L.sunC);
  gl.uniform3fv(u.uAmb, L.amb); gl.uniform3fv(u.uSkyZ, L.skyZ); gl.uniform3fv(u.uSkyH, L.skyH);
  gl.uniform3fv(u.uDeep, st.deep); gl.uniform3fv(u.uBody, st.body); gl.uniform3fv(u.uScatter, st.scatter);
  gl.uniform3fv(u.uShallow, st.shallow); gl.uniform3fv(u.uFoamC, st.foam); gl.uniform3fv(u.uSand, st.sand);
  gl.uniform1f(u.uHs, ocean.sea ? ocean.sea.hs : 1);
  gl.uniform1f(u.uTime, v.time); gl.uniform1f(u.uStorm, v.storm);
  gl.uniform1f(u.uGlow, st.glow); gl.uniform1f(u.uRough, st.rough); gl.uniform1f(u.uExposure, st.exposure);
  /* How far all high water lifts toward the scatter colour, not just crests. */
  gl.uniform1f(u.uCrestLift, st.crestLift == null ? 0.12 : st.crestLift);
  gl.uniform1f(u.uFoamBias, ocean.foam.bias); gl.uniform1f(u.uFoamGain, st.foamGain);
  gl.uniform1f(u.uFoamSigma, ocean.foam.sigma || 0.1);
  gl.uniform1f(u.uFoamBias0, C[0].foamBias == null ? 0.5 : C[0].foamBias);
  gl.uniform1f(u.uFoamSigma0, C[0].sigmaJ || 0.1);
  gl.uniform1f(u.uCapSigma, ocean.foam.capSigma == null ? 1.5 : ocean.foam.capSigma);
  gl.uniform1f(u.uFoamFloor, ocean.foam.floor || 0);
  gl.uniform1f(u.uSeaStorm, ocean.sea ? ocean.sea.storm : 0);
  const sim = v.foamSim && v.foamSim.size ? v.foamSim : null;
  gl.uniform1f(u.uSimOn, sim ? 1 : 0);
  gl.uniform2f(u.uSimOrigin, sim ? sim.origin[0] : 0, sim ? sim.origin[1] : 0);
  gl.uniform1f(u.uSimSize, sim ? sim.size : 1);
  gl.uniform1i(u.uDebug, v.debug | 0);
  const gd = mfOceanGroupDrift(ocean);
  gl.uniform1f(u.uGroupAmp, ocean.foam.groupAmp == null ? 1.2 : ocean.foam.groupAmp);
  gl.uniform2f(u.uGroupDrift, gd[0], gd[1]);
  gl.uniform1f(u.uFoamArtOn, v.foamArt ? 1 : 0);
  /* Metres per tile of the authored foam texture. */
  gl.uniform1f(u.uFoamArtScale, v.foamArtScale || 36);
  const wd = ocean.sea ? ocean.sea.windDir : 0;
  gl.uniform2f(u.uWind, Math.cos(wd), Math.sin(wd));
  gl.bindVertexArray(S.vao);
  gl.drawElements(gl.TRIANGLES, S.count, gl.UNSIGNED_INT, 0);
  gl.bindVertexArray(null);
  return { spacing, across, along };
}
