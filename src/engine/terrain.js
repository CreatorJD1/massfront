/* ============================================================================
   TERRAIN AS REAL GEOMETRY
   ----------------------------------------------------------------------------
   The old renderer painted a heightfield onto a flat quad and faked relief with
   shading. Here the heightfield IS the mesh: a displaced grid with true vertex
   normals and per-vertex material colour. Everything the player complained
   about follows from this change — hills occlude, craters have walls you can
   look into, slopes catch the sun, and a shell crater is a hole in the ground
   rather than a dark circle painted on it.

   One mesh, one draw call, 32-bit indices. Deformation rewrites the affected
   vertices in place and re-uploads only that window, so blowing a crater costs
   a small bufferSubData rather than a rebuild.
   ============================================================================ */
/* 256 keeps the terrain a single draw call while reducing each ground cell
   from 16.7 m to 12.5 m on the 3.2 km theatre. That extra silhouette density
   matters most at city aprons: graded pads, gutters and road crowns can now
   meet building footprints without the coarse mesh cutting diagonally through
   them. Raising the 2048 source/height canvas instead would duplicate tens of
   megabytes across terrainCanvas, terrainBase and heightF on Android; geometry
   density is the safer resolution increase. */
/* 320 raises silhouette density to 10 m cells. The real close-range detail
   now comes from per-pixel heightfield normals (below), so geometry only has
   to carry the outline — 103k verts still one draw call. */
const TGRID=320;
const TVERT=TGRID+1;
/* Vertical exaggeration. The heightfield was authored as a shading source, so
   its raw noise is far too spiky to use as literal geometry — at full strength
   the map becomes razor ridges. Scaled down and smoothed it reads as rolling
   terrain a tank could plausibly drive over, which is what it has to be now
   that it IS the ground. */
const HSCALE=118;
const SEABED=-26;                    // floor the ocean bottom so water has depth

let terrMesh=null, terrVerts=null, terrVAO=null, terrVBO=null, terrIBO=null, terrIdxCount=0;
let waterMesh=null, waterVAO=null, waterVBO=null, waterIBO=null, waterIdxCount=0, waterVerts=null;
/* WATER HAS TO FOLLOW THE GROUND IT SITS IN. The water sheet is built once
   from authored hydrology (oceans, rivers, lakes). deformTerrain rewrites
   the heightfield all match long — craters, superweapon pits, singularity
   collapses — but punching a bowl below WATER_H must not grow that sheet
   into an inland pond. Coverage is gated on WATER_AUTH (frozen at gen).
   Shoreline bowls are the exception: a crater that actually touches the
   waterline enqueues a flood job. The front walks from the breach through
   below-table cells inside that bowl (~54 wu/s). Those cells become real
   water again — WATER_AUTH, PASS, naval mask, albedo — the way a beach
   crater used to fill before inland punches were locked dry. Isolated
   inland bowls still stay dirt. */
let waterNeed=null, waterTH=null, waterDirty=false, waterRebuildT=0, waterBaseCol=null, waterBowlSynced=0;
let WATER_LIP=null;
const WATER_FLOOD_CAP=6;
const waterFloods=[];
let waterTickAt=-1;
/* The playable heightfield still ends at MAP, but the camera is deliberately
   allowed to overhang it so a corner base can remain centred while the player
   rotates. A cheap low-density skirt gives that overhang real depth instead
   of exposing the framebuffer clear as a flat blue/black wedge. The terrain
   shader turns the skirt into atmospheric fake-land; it never participates in
   pathfinding, fog sensors, placement or deformation. */
const TERR_EDGE_EXT=960;
let terrEdgeVAO=null, terrEdgeVBO=null, terrEdgeIBO=null, terrEdgeIdxCount=0;
/* CONTEXT-LOSS RESET. Every builder above caches its VAO/VBO in a module
   variable and takes an if(!vao) create-else-update branch. After a context
   loss those handles still LOOK truthy but point at dead GL objects, so the
   rebuild path poured fresh vertices into dead buffers and the ground simply
   never drew again - the exact match-killing symptom on device: units,
   structures and boundary intact, terrain a flat fog-coloured void. Recovery
   must forget the handles so the builders genuinely re-create. */
/* ---------------------------------------------------------------------------
   HEIGHT TEXTURE — the terrain's own normal map, at heightfield resolution.
   Vertex normals live at mesh density (10 m). The heightfield knows the
   ground at 1.56 m. Uploading it as ONE global R16F sheet lets the fragment
   stage derive per-pixel normals: an 8x lighting-resolution jump with no new
   geometry, no chunks, and — because every deformation already funnels
   through terrainDirty() — crater edits re-upload just their window into the
   same sheet. A single texture cannot have chunk seams.
   --------------------------------------------------------------------------- */
let heightTex=null;
function waterLipAt(wx,wy){
  if(!WATER_LIP||!heightF) return false;
  const x=clamp(wx/MAP*TS|0,0,TS-1), y=clamp(wy/MAP*TS|0,0,TS-1);
  return !!WATER_LIP[y*TS+x];
}
function waterVisualWetTexel(ix,iy){
  return !WATER_AUTH||!!WATER_AUTH[iy*TS+ix]||!!(WATER_LIP&&WATER_LIP[iy*TS+ix]);
}
function waterLipReset(){
  WATER_LIP=null;
  waterBowlSynced=0;
  waterFloods.length=0;
  waterTickAt=-1;
}
function terrainWorldH(ix,iy){
  const h=heightF[iy*TS+ix];
  const wet=waterVisualWetTexel(ix,iy);
  return (wet&&h<=WATER_H) ? Math.max(SEABED,(h-WATER_H)*HSCALE*1.4) : (h-WATER_H)*HSCALE;
}
function uploadHeightTex(x0,y0,x1,y1){
  if(!heightF||typeof gl==='undefined'||!gl) return;
  const full=x0==null;
  if(full){ x0=0; y0=0; x1=TS; y1=TS; }
  x0=clamp(x0|0,0,TS); y0=clamp(y0|0,0,TS); x1=clamp(Math.ceil(x1),0,TS); y1=clamp(Math.ceil(y1),0,TS);
  const w=x1-x0, h=y1-y0; if(w<=0||h<=0) return;
  const buf=new Float32Array(w*h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) buf[y*w+x]=terrainWorldH(x0+x,y0+y);
  /* Height lives on unit 10 in the terrain pass. Combat craters upload from
     the sim tick, which can land while TEXTURE0 still holds the material
     atlas. bindTexture(null) on the active unit was the adboards strobe:
     every hull sampled an empty atlas for a frame. Scratch-upload on 10 and
     restore whatever was there — never null, never unit 0. */
  const was=gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE10);
  const prev=gl.getParameter(gl.TEXTURE_BINDING_2D);
  if(!heightTex){
    heightTex=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,heightTex);
    gl.texStorage2D(gl.TEXTURE_2D,1,gl.R16F,TS,TS);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  } else gl.bindTexture(gl.TEXTURE_2D,heightTex);
  gl.texSubImage2D(gl.TEXTURE_2D,0,x0,y0,w,h,gl.RED,gl.FLOAT,buf);
  gl.bindTexture(gl.TEXTURE_2D,prev);
  gl.activeTexture(was);
}
function terrainGLReset(){
  heightTex=null;
  terrHealTries=0;                       // a new loss deserves fresh attempts
  terrEpoch=-1;
  terrVAO=terrVBO=terrIBO=null;
  terrEdgeVAO=terrEdgeVBO=terrEdgeIBO=null;
  waterVAO=waterVBO=waterIBO=null;
  waterLipReset();
  mfShadePend=null;
  if(typeof waterFxReset==='function') waterFxReset();
}

/* World height in world units. Bilinear so slopes are smooth and the camera
   ray-march in s2w() converges instead of stair-stepping. */
function rawH(wx,wy){
  const fx=clamp(wx/MAP*(TS-1),0,TS-1.001), fy=clamp(wy/MAP*(TS-1),0,TS-1.001);
  const x0=fx|0, y0=fy|0, tx=fx-x0, ty=fy-y0;
  const i=y0*TS+x0;
  return (heightF[i]*(1-tx)+heightF[i+1]*tx)*(1-ty)+(heightF[i+TS]*(1-tx)+heightF[i+TS+1]*tx)*ty;
}
/* Box-blurred height. The blur is the important part: the shading heightfield
   carries high-frequency detail that looks like grain when painted and looks
   like spikes when extruded. Averaging a small neighbourhood turns it back
   into landforms without touching the gameplay heightfield. */
/* 7, down from 13: the old radius averaged a 26-unit neighbourhood into every
   vertex — hills could not be sharper than blobs no matter what the data
   held. Half the radius keeps the de-spiking role while letting the new fine
   octave actually shape the mesh; per-pixel normals carry what remains. */
const HSM=7;
function terrainH(wx,wy){
  if(!heightF) return 0;
  const h=(rawH(wx,wy)*2
        + rawH(wx-HSM,wy) + rawH(wx+HSM,wy) + rawH(wx,wy-HSM) + rawH(wx,wy+HSM)
        + rawH(wx-HSM,wy-HSM)+rawH(wx+HSM,wy+HSM)+rawH(wx-HSM,wy+HSM)+rawH(wx+HSM,wy-HSM))/10;
  const wet=(typeof authoredWaterAt==='function'&&authoredWaterAt(wx,wy))||waterLipAt(wx,wy);
  return (wet&&h<=WATER_H) ? Math.max(SEABED,(h-WATER_H)*HSCALE*1.4) : (h-WATER_H)*HSCALE;
}
const WATER_Y=0;                     // sea level sits at world y=0 by construction

/* Material colour for a point, from height and slope. Slope is what sells a
   landscape: flat ground is soil or grass, anything steep is exposed rock, and
   the transition band between them is where a hillside reads as a hillside. */
function terrColor(h,slope,TH,wx,wy,out){
  const LP=(a,b,t)=>[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
  let c;
  const wet=(typeof authoredWaterAt==='function'?authoredWaterAt(wx,wy):h<WATER_H)||waterLipAt(wx,wy);
  if(wet&&h<WATER_H-0.02) c=LP(TH.wDeep,TH.wShal,clamp((h-0.18)/0.14,0,1));
  else if(h<WATER_H)      c=LP(TH.h0,TH.g0,0.45);   // inland dry crater bowl, not a pond
  else if(h<BEACH_H)      c=LP(TH.b0,TH.b1,clamp((h-WATER_H)/0.04,0,1));
  else if(h<0.56)         c=LP(TH.g0,TH.g1,clamp((h-BEACH_H)/0.185,0,1));
  else if(h<0.70)         c=LP(TH.h0,TH.h1,clamp((h-0.56)/0.14,0,1));
  else                    c=LP(TH.h1,TH.plat,clamp((h-0.70)/0.16,0,1));
  // steep faces break through to bedrock
  // only genuinely steep ground breaks through to rock
  const rock=clamp((slope-0.62)/0.95,0,1);
  c=LP(c,TH.cliff,rock*0.82);
  /* Causeways remain visible if the painted terrain shader fails. They inherit
     biome weathering rather than becoming one modern grey ribbon everywhere. */
  if(typeof ROADG!=='undefined'&&ROADG){
    const gx=clamp(wx/MAP*PGS|0,0,PGS-1), gy=clamp(wy/MAP*PGS|0,0,PGS-1);
    if(ROADG[gy*PGS+gx]){
      const rc=curTheme==='ashland'?[65,56,52]:curTheme==='arctic'?[91,104,113]:
               curTheme==='vespera'?[78,62,72]:[73,76,66];
      c=LP(c,rc,0.72);
    }
  }
  // per-vertex grain so large flat areas aren't a single dead colour
  const n=(Math.sin(wx*0.031)*Math.cos(wy*0.027)+Math.sin(wx*0.0093+wy*0.011))*0.5;
  const g=1+n*0.055;
  out[0]=clamp(c[0]*g,0,255)/255; out[1]=clamp(c[1]*g,0,255)/255; out[2]=clamp(c[2]*g,0,255)/255;
  return out;
}

/* Vertex layout matches the instanced format so the same shader draws it:
   pos(3) normal(3) colour(3) = 9 floats. The terrain is drawn as a single
   instance parked at the origin. */
function buildTerrainMesh(themeKey){
  const raw=THEMES[themeKey||curTheme]||THEMES.verdant;
  const TH=typeof themePaint==='function'?themePaint(raw):raw;
  const cell=MAP/TGRID;
  terrVerts=new Float32Array(TVERT*TVERT*12);
  const idx=new Uint32Array(TGRID*TGRID*6);
  let ii=0;
  for(let z=0;z<TGRID;z++) for(let x=0;x<TGRID;x++){
    const a=z*TVERT+x, b=a+1, c=a+TVERT, d=c+1;
    idx[ii++]=a; idx[ii++]=c; idx[ii++]=b;
    idx[ii++]=b; idx[ii++]=c; idx[ii++]=d;
  }
  terrIdxCount=ii;
  refreshTerrainVerts(0,0,TVERT-1,TVERT-1,TH);

  if(!terrVAO){
    terrVAO=gl.createVertexArray(); gl.bindVertexArray(terrVAO);
    terrVBO=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,terrVBO);
    gl.bufferData(gl.ARRAY_BUFFER,terrVerts,gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,VSTRIDE,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,VSTRIDE,12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,3,gl.FLOAT,false,VSTRIDE,24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,2,gl.FLOAT,false,VSTRIDE,36);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4,1,gl.FLOAT,false,VSTRIDE,44);
    terrIBO=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,terrIBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);
    // terrain has no per-instance stream: pin the instance attributes to constants
    gl.disableVertexAttribArray(5); gl.vertexAttrib4f(5,0,0,0,1);
    gl.disableVertexAttribArray(6); gl.vertexAttrib1f(6,0);
    gl.disableVertexAttribArray(7); gl.vertexAttrib4f(7,1,1,1,1);
    gl.disableVertexAttribArray(8); gl.vertexAttrib1f(8,1);
    gl.bindVertexArray(null);
  } else {
    gl.bindVertexArray(terrVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER,terrVBO);
    gl.bufferData(gl.ARRAY_BUFFER,terrVerts,gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,terrIBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }
  buildTerrainEdgeMesh(TH);
  buildWaterMesh(TH);
  terrEpoch=(typeof glEpoch!=='undefined')?glEpoch:0;   // built against THIS context
  return terrVAO;
}

/* Four rectilinear strips cover the world outside [0,MAP]. Keeping 0 and MAP
   as authored vertices makes the join exact, while a handful of radial bands
   is enough because dense haze intentionally removes high-frequency detail.
   North/south extend around the corners; west/east only fill the middle, so
   there are no holes and no overlapping coplanar corner sheets. */
function buildTerrainEdgeMesh(TH){
  const verts=[],idx=[];
  const edgeKind=curMap==='isles'?1:(curTheme==='ashland'||curMap==='crater'?2:
    (curTheme==='arctic'||curMap==='highland'?3:0));
  const sink=edgeKind===1?38:edgeKind===2?13:edgeKind===3?27:20;
  const reliefAmp=edgeKind===2?7.2:edgeKind===3?2.8:4.2;
  /* MOUNTAIN FRAME. The skirt used to be near-flat "atmospheric fake-land",
     which left every battlefield floating in a void with a 4-unit ripple for
     a horizon. It is the one place true mountains cost nothing: no pathing,
     no placement, no fog sensor ever touches it — so the ranges here can be
     3–4x taller than anything the playable field allows. Ridged noise (the
     fold of |sin|, squared) gives connected ridgelines rather than lone
     bumps, and the amplitude builds from zero at the seam so the join stays
     crack-free. Each world wears its own range: volcanic cones with ember
     rims on the ashlands, high glacial walls on arctic worlds, pale alien
     mesas at dusk. Drowned archipelagos keep their open ocean horizon. */
  const drowned=edgeKind===1;
  const peakAmp=drowned?0:edgeKind===2?205:edgeKind===3?255:(curTheme==='vespera'?215:165);
  const peakCol=(TH&&TH.peakCol)||(curTheme==='arctic'?[238,244,252]:curTheme==='ashland'?[66,50,44]:
                curTheme==='vespera'?[150,112,152]:[120,123,130]);
  const capCol=curTheme==='ashland'?[255,120,50]:[246,250,255];   // ember rim vs snow cap
  const ridged=(x,z)=>{
    const w1=Math.sin(x*0.0016+z*0.0009)+0.6*Math.sin(z*0.0027-x*0.0013);
    let r=1-Math.abs(Math.sin(x*0.00115+z*0.00165+w1*0.9)); r*=r;
    const r2=1-Math.abs(Math.sin((x+z)*0.00205+w1*0.5));
    return r*0.72+r2*r2*0.28;
  };
  const axis=(a,b,n)=>Array.from({length:n+1},(_,i)=>a+(b-a)*i/n);
  const along=axis(-TERR_EDGE_EXT,MAP+TERR_EDGE_EXT,72);
  const middle=axis(0,MAP,48);
  /* THE SMEAR AXIS. Six rows carried the whole 960-unit skirt, so every
     distance-driven band in the terrain shader (outer haze, exclusion zone,
     foam/storm patterns) was reconstructed from 5 linear spans across a
     strongly curved superellipse field — which is exactly what read as long
     stretched stripes in the outer ranges. Eleven rows costs +2.9k triangles
     against a 205k-triangle terrain (+1.4%, build-time only, zero fill cost)
     and makes those contours curve properly. */
  const bands=[0,60,130,230,330,470,610,700,800,880,TERR_EDGE_EXT];
  const smooth=q=>q*q*(3-2*q);
  /* One height function, used for the vertex AND for its normal. Every skirt
     vertex previously shipped (0,1,0): a 255-unit ridged mountain range lit as
     a flat plane, with no relief anywhere in the outer ranges. The per-pixel
     normal path cannot rescue it either — outside 0..1 the height texture
     clamps, so its central difference is identically zero along the outward
     axis, which generates precisely the long streaks reported. */
  const edgeH=(x,z)=>{
    const outside=Math.max(0,-x,x-MAP,-z,z-MAP), q=clamp(outside/TERR_EDGE_EXT,0,1);
    const bx=clamp(x,0,MAP), bz=clamp(z,0,MAP), join=clamp(outside/150,0,1);
    const relief=(Math.sin(x*.0067+z*.0031)+Math.sin(z*.0083-x*.0027))*(1-q)*reliefAmp*join;
    const build=smooth(clamp((outside-120)/(TERR_EDGE_EXT*0.82-120),0,1));
    return terrainH(bx,bz)-smooth(q)*sink*(1-build)+relief+ridged(x,z)*peakAmp*build;
  };
  const addRect=(xs,zs)=>{
    const base=verts.length/12, nx=xs.length;
    for(const z of zs) for(const x of xs){
      const outside=Math.max(0,-x,x-MAP,-z,z-MAP), q=clamp(outside/TERR_EDGE_EXT,0,1);
      const bx=clamp(x,0,MAP), bz=clamp(z,0,MAP), join=clamp(outside/150,0,1);
      /* Continue the edge silhouette, then let it settle slightly into the
         weather. Relief starts at zero on the seam, so even a grazing camera
         cannot reveal a vertical crack between authored and fake terrain. */
      const relief=(Math.sin(x*.0067+z*.0031)+Math.sin(z*.0083-x*.0027))*(1-q)*reliefAmp*join;
      const build=smooth(clamp((outside-120)/(TERR_EDGE_EXT*0.82-120),0,1));
      const mtn=ridged(x,z)*peakAmp*build;
      /* Isles fall away fastest into their drowned perimeter; dry maps keep
         harder broken shelves; storm maps flatten into a low obscured waste. */
      const h=terrainH(bx,bz)-smooth(q)*sink*(1-build)+relief+mtn;
      const cc=TH.cliff||[112,116,122];
      /* Colour climbs from biome cliff rock through range rock to the cap. */
      const pk=peakAmp>0?clamp((mtn-peakAmp*0.30)/(peakAmp*0.55),0,1):0;
      const cap=peakAmp>0?clamp((mtn-peakAmp*0.72)/(peakAmp*0.26),0,1)*(edgeKind===2?0.55:1):0;
      const cr=cc[0]+(peakCol[0]-cc[0])*pk+(capCol[0]-peakCol[0])*cap*pk;
      const cg=cc[1]+(peakCol[1]-cc[1])*pk+(capCol[1]-peakCol[1])*cap*pk;
      const cb=cc[2]+(peakCol[2]-cc[2])*pk+(capCol[2]-peakCol[2])*cap*pk;
      const eps=32;
      let nvx=edgeH(x-eps,z)-edgeH(x+eps,z), nvy=2*eps, nvz=edgeH(x,z-eps)-edgeH(x,z+eps);
      const nl=Math.hypot(nvx,nvy,nvz)||1;
      verts.push(x,h,z, nvx/nl,nvy/nl,nvz/nl, cr/255,cg/255,cb/255,
        x*.035,z*.035,MAT.EARTH);
    }
    for(let z=0;z<zs.length-1;z++) for(let x=0;x<xs.length-1;x++){
      const a=base+z*nx+x,b=a+1,c=a+nx,d=c+1;
      idx.push(a,c,b,b,c,d);
    }
  };
  addRect(along,bands.slice().reverse().map(d=>-d));
  addRect(along,bands.map(d=>MAP+d));
  addRect(bands.slice().reverse().map(d=>-d),middle);
  addRect(bands.map(d=>MAP+d),middle);
  terrEdgeIdxCount=idx.length;
  const data=new Float32Array(verts),indices=new Uint32Array(idx);
  if(!terrEdgeVAO){
    terrEdgeVAO=gl.createVertexArray(); gl.bindVertexArray(terrEdgeVAO);
    terrEdgeVBO=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,terrEdgeVBO);
    gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,VSTRIDE,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,VSTRIDE,12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,3,gl.FLOAT,false,VSTRIDE,24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,2,gl.FLOAT,false,VSTRIDE,36);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4,1,gl.FLOAT,false,VSTRIDE,44);
    terrEdgeIBO=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,terrEdgeIBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
    gl.disableVertexAttribArray(5); gl.vertexAttrib4f(5,0,0,0,1);
    gl.disableVertexAttribArray(6); gl.vertexAttrib1f(6,0);
    gl.disableVertexAttribArray(7); gl.vertexAttrib4f(7,1,1,1,1);
    gl.disableVertexAttribArray(8); gl.vertexAttrib1f(8,1);
    gl.bindVertexArray(null);
  }else{
    gl.bindVertexArray(terrEdgeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER,terrEdgeVBO); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,terrEdgeIBO); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }
}

/* Rewrite a rectangular window of terrain vertices — positions, normals and
   colours — from the current heightfield. Normals are central differences of
   the heightfield rather than face normals, which keeps the surface smooth
   across cell boundaries and makes lighting read as terrain, not as a grid. */
function getRoadTile(gx,gy){
  /* Connectivity used to select painted lanes, corners and crosswalks. At the
     coarse fallback-mesh UV scale those tiles turned every junction into a
     toy road mat. The causeway silhouette already lives in ROADG; choose only
     rugged materials here and use a stable hash to scatter damaged plates. */
  const scar=((gx*73856093)^(gy*19349663))>>>0;
  if(curTheme==='ashland') return (scar&7)===0?MAT.BLAST_SLAG:MAT.BASALT_CRUST;
  if(curTheme==='arctic') return (scar&7)===0?MAT.ICE_PACK:MAT.SHATTER_CONC;
  if(curTheme==='vespera') return (scar&7)===0?MAT.CANYON_ROCK:MAT.BEDROCK;
  return (scar&7)===0?MAT.CRATER_DEBRIS:MAT.SHATTER_CONC;
}

const _tc=[0,0,0];
function refreshTerrainVerts(gx0,gz0,gx1,gz1,TH){
  TH=TH||(typeof themePaint==='function'?themePaint(THEMES[curTheme]||THEMES.verdant):THEMES[curTheme]||THEMES.verdant);
  const cell=MAP/TGRID;
  gx0=clamp(gx0,0,TVERT-1); gz0=clamp(gz0,0,TVERT-1);
  gx1=clamp(gx1,0,TVERT-1); gz1=clamp(gz1,0,TVERT-1);
  const eps=cell*0.75;
  for(let z=gz0;z<=gz1;z++) for(let x=gx0;x<=gx1;x++){
    const wx=x*cell, wy=z*cell;
    const h=terrainH(wx,wy);
    const hl=terrainH(wx-eps,wy), hr=terrainH(wx+eps,wy);
    const hd=terrainH(wx,wy-eps), hu=terrainH(wx,wy+eps);
    let nx=hl-hr, ny=2*eps, nz=hd-hu;
    const l=Math.hypot(nx,ny,nz)||1; nx/=l; ny/=l; nz/=l;
    const slope=Math.hypot(hr-hl,hu-hd)/(2*eps);
    const raw=heightF?heightF[clamp(Math.round(wy/MAP*(TS-1)),0,TS-1)*TS+clamp(Math.round(wx/MAP*(TS-1)),0,TS-1)]:0.5;
    terrColor(raw,slope,TH,wx,wy,_tc);
    const o=(z*TVERT+x)*12;
    terrVerts[o]=wx; terrVerts[o+1]=h; terrVerts[o+2]=wy;
    terrVerts[o+3]=nx; terrVerts[o+4]=ny; terrVerts[o+5]=nz;
    terrVerts[o+6]=_tc[0]; terrVerts[o+7]=_tc[1]; terrVerts[o+8]=_tc[2];
    terrVerts[o+9]=wx*0.035; terrVerts[o+10]=wy*0.035;
    let mid=MAT.EARTH;
    const rx=clamp(wy/MAP*PGS|0,0,PGS-1), ry=clamp(wx/MAP*PGS|0,0,PGS-1);
    const authoredWet=typeof authoredWaterAt==='function'&&authoredWaterAt(wx,wy);
    const lipWet=waterLipAt(wx,wy);
    if(typeof ROADG!=='undefined'&&ROADG&&ROADG[rx*PGS+ry]){
      mid=getRoadTile(ry,rx);
    } else if(raw<WATER_H && !authoredWet && !lipWet) {
      mid=MAT.CRATER_DEBRIS;
    } else if(slope>0.72) {
      mid=(curTheme==='arctic') ? MAT.STONE : (curTheme==='ashland' ? MAT.BASALT_CRUST : MAT.STONE);
    } else if(raw<BEACH_H) {
      mid=(curTheme==='arctic') ? MAT.ICE_PACK : (curTheme==='ashland' ? MAT.LAVA_FISSURE : MAT.SAND);
    } else if(raw<0.60) {
      mid=(curTheme==='arctic') ? MAT.SNOW_DRIFT : (curTheme==='ashland' ? MAT.SULFUR_ASH : MAT.LEAF);
    }
    terrVerts[o+11]=mid;
  }
}
/* Push a modified window back to the GPU. Rows are contiguous in the buffer,
   so one sub-upload per row is the cheapest correct thing to do. */
function uploadTerrainRegion(gx0,gz0,gx1,gz1){
  if(!terrVAO) return;
  gx0=clamp(gx0,0,TVERT-1); gz0=clamp(gz0,0,TVERT-1);
  gx1=clamp(gx1,0,TVERT-1); gz1=clamp(gz1,0,TVERT-1);
  gl.bindBuffer(gl.ARRAY_BUFFER,terrVBO);
  const w=gx1-gx0+1;
  for(let z=gz0;z<=gz1;z++){
    const start=(z*TVERT+gx0)*12;
    gl.bufferSubData(gl.ARRAY_BUFFER, start*4, terrVerts.subarray(start,start+w*12));
  }
}
/* World-space rectangle -> regenerate and upload. Called by every crater,
   collapse and excavation, which is how deformation becomes geometry. */
function terrainDirty(wx,wy,rad,depth){
  /* Lip + splash first so the height sheet and vertex colours see the wet
     bowl on this same upload, not a frame later. */
  waterReactDeform(wx,wy,rad,depth);
  if(!terrVerts) return;
  const cell=MAP/TGRID, pad=2;
  const gx0=Math.floor((wx-rad)/cell)-pad, gx1=Math.ceil((wx+rad)/cell)+pad;
  const gz0=Math.floor((wy-rad)/cell)-pad, gz1=Math.ceil((wy+rad)/cell)+pad;
  refreshTerrainVerts(gx0,gz0,gx1,gz1);
  uploadTerrainRegion(gx0,gz0,gx1,gz1);
  /* Same window, same choke point: the per-pixel normal sheet follows every
     crater and foundation cut with a small sub-upload, never a full rebuild. */
  const k=TS/MAP, hp=6;
  uploadHeightTex((wx-rad)*k-hp,(wy-rad)*k-hp,(wx+rad)*k+hp,(wy+rad)*k+hp);
  /* Did this deform change visual water coverage? Only the touched window
     is scanned. A dry inland crater punching below WATER_H must not grow
     the sheet — crater-below-water-table used to spawn fake lakes. Authored
     oceans/rivers/lakes and WATER_LIP shoreline bowls still rebuild. */
  if(waterNeed&&!waterDirty){
    const cx0=clamp(gx0,0,TGRID),cx1=clamp(gx1,0,TGRID),cz0=clamp(gz0,0,TGRID),cz1=clamp(gz1,0,TGRID);
    for(let z=cz0;z<=cz1&&!waterDirty;z++) for(let x=cx0;x<=cx1;x++){
      const wxv=x*cell, wyv=z*cell;
      const hx=clamp(Math.round(wxv/MAP*(TS-1)),0,TS-1), hy=clamp(Math.round(wyv/MAP*(TS-1)),0,TS-1);
      const authored=WATER_AUTH?WATER_AUTH[hy*TS+hx]:1;
      const lip=WATER_LIP&&WATER_LIP[hy*TS+hx];
      const wet=(authored||lip)&&heightF[hy*TS+hx]<WATER_H+0.012?1:0;
      if(wet!==waterNeed[z*TVERT+x]){ waterDirty=true; break; }
    }
  }
}
/* Rebuild the flooded sheet at most a few times a second: a bombardment that
   opens twenty craters in one second pays for one rebuild, not twenty.
   First shoreline miss does not wait here — waterSyncBowl rebuilds with
   the splash so the hole is wet when the ring reads. */
function waterMaintain(dt){
  if(waterRebuildT>0) waterRebuildT-=dt;
  if(waterRebuildT<=0) waterBowlSynced=0;
  if(!waterDirty||waterRebuildT>0||!waterTH||typeof gl==='undefined'||!gl) return;
  waterRebuildT=waterFloods.length?0.14:0.45;
  waterBowlSynced=0;
  buildWaterMesh(waterTH);
}
function waterFloodEnqueue(wx,wy,rad,hx,hy){
  const r=rad||40;
  for(let i=0;i<waterFloods.length;i++){
    const F=waterFloods[i];
    if(Math.hypot(F.x-wx,F.y-wy)<Math.max(F.r,r)*0.65){
      F.r=Math.max(F.r,r);
      F.maxFront=Math.max(F.maxFront, r*1.18+10);
      F.hx=hx; F.hy=hy;
      return F;
    }
  }
  if(waterFloods.length>=WATER_FLOOD_CAP) waterFloods.shift();
  const F={x:wx,y:wy,r:r,hx:hx,hy:hy,front:0,maxFront:r*1.18+10,speed:54,age:0,fxT:0};
  waterFloods.push(F);
  return F;
}
/* Grow WATER_LIP from authored water through below-table cells inside
   this bowl. Path distance, not a disc — water comes through the breach. */
function waterFloodMark(F,frontWu){
  if(!waterLipEnsure()) return false;
  const k=TS/MAP;
  const cx=F.x*k, cy=F.y*k;
  const cr=Math.max(6,F.r*k);
  const frontT=Math.max(1,frontWu*k);
  const reach=cr+frontT+3;
  const x0=clamp(Math.floor(cx-reach),0,TS-1), x1=clamp(Math.ceil(cx+reach),0,TS-1);
  const y0=clamp(Math.floor(cy-reach),0,TS-1), y1=clamp(Math.ceil(cy+reach),0,TS-1);
  const W=x1-x0+1, Hh=y1-y0+1;
  const seen=new Uint8Array(W*Hh);
  const at=(x,y)=>(y-y0)*W+(x-x0);
  const q=[];
  for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
    if(!WATER_AUTH[y*TS+x]) continue;
    if(heightF[y*TS+x]>=WATER_H+0.012) continue;
    q.push(x,y,0);
    seen[at(x,y)]=1;
  }
  if(!q.length) return false;
  const DX=[1,-1,0,0], DY=[0,0,1,-1];
  const bowlR=cr*1.22;
  let marked=false, qh=0;
  while(qh<q.length){
    const x=q[qh++], y=q[qh++], dist=q[qh++];
    if(dist>frontT) continue;
    for(let i=0;i<4;i++){
      const nx=x+DX[i], ny=y+DY[i];
      if(nx<x0||nx>x1||ny<y0||ny>y1) continue;
      const si=at(nx,ny);
      if(seen[si]) continue;
      seen[si]=1;
      if(heightF[ny*TS+nx]>=WATER_H+0.012) continue;
      const nd=dist+1;
      const dx=nx-cx, dy=ny-cy;
      if(dx*dx+dy*dy>bowlR*bowlR) continue;
      if(!WATER_AUTH[ny*TS+nx]&&nd<=frontT){
        if(waterFloodCommit(nx,ny)) marked=true;
      }
      if(nd<=frontT) q.push(nx,ny,nd);
    }
  }
  return marked;
}
function waterFloodTick(dt){
  if(dt>0&&waterFloods.length){
    let marked=false;
    for(let i=waterFloods.length-1;i>=0;i--){
      const F=waterFloods[i];
      F.age+=dt;
      F.front=Math.min(F.maxFront, F.front+F.speed*dt);
      if(waterFloodMark(F,F.front)){
        marked=true;
        if(typeof waterFxImpact==='function'){
          const ang=Math.atan2(F.y-F.hy,F.x-F.hx);
          waterFxImpact(F.hx+Math.cos(ang)*F.front*0.82, F.hy+Math.sin(ang)*F.front*0.82,
            9+F.r*0.07, 0.62, true);
        }
      }
      F.fxT+=dt;
      if(F.fxT>=0.48&&typeof waterFxCrater==='function'){
        F.fxT=0;
        waterFxCrater(F.x,F.y,Math.max(22,F.r*0.62),0.035,F.hx,F.hy);
      }
      if(F.front>=F.maxFront-0.05||F.age>3.6){
        if(waterFloodMark(F,F.maxFront)) marked=true;
        waterFloods.splice(i,1);
      }
    }
    if(marked){
      waterDirty=true;
      if(waterRebuildT>0.12) waterRebuildT=0.12;
      const k=TS/MAP;
      for(let i=0;i<waterFloods.length;i++){
        const F=waterFloods[i];
        const cr=Math.max(6,F.r*k), reach=cr+F.front*k+4;
        waterFloodRelight(
          clamp(Math.floor(F.x*k-reach),0,TS-1),
          clamp(Math.floor(F.y*k-reach),0,TS-1),
          clamp(Math.ceil(F.x*k+reach),0,TS-1),
          clamp(Math.ceil(F.y*k+reach),0,TS-1));
      }
    }
  }
  waterMaintain(dt);
}
/* True when the live water mesh still misses a wet (authored or lip) cell
   in this crater window. Inland dry bowls stay false — only a flood that
   walked from WATER_AUTH writes AUTH / PASS / NAV via waterFloodCommit. */
function waterBowlMeshMisses(wx,wy,rad){
  if(!waterNeed) return true;
  const cell=MAP/TGRID, pad=2, r=rad||40;
  const gx0=clamp(Math.floor((wx-r)/cell)-pad,0,TGRID);
  const gx1=clamp(Math.ceil((wx+r)/cell)+pad,0,TGRID);
  const gz0=clamp(Math.floor((wy-r)/cell)-pad,0,TGRID);
  const gz1=clamp(Math.ceil((wy+r)/cell)+pad,0,TGRID);
  for(let z=gz0;z<=gz1;z++) for(let x=gx0;x<=gx1;x++){
    if(waterNeed[z*TVERT+x]) continue;
    const hx=clamp(Math.round(x*cell/MAP*(TS-1)),0,TS-1);
    const hy=clamp(Math.round(z*cell/MAP*(TS-1)),0,TS-1);
    if(heightF[hy*TS+hx]>=WATER_H+0.012) continue;
    if(waterVisualWetTexel(hx,hy)) return true;
  }
  return false;
}
/* First splash owns the wet-bowl mesh. Later marks in the 0.45s window
   stay on waterMaintain so a shoreline volley is one rebuild, not sixteen. */
function waterSyncBowl(wx,wy,rad){
  if(!waterTH||typeof gl==='undefined'||!gl) return;
  if(!waterBowlMeshMisses(wx,wy,rad)) return;
  /* A prior lake maintain can leave waterRebuildT hot. That must not
     delay the first shoreline hole — only a bowl we already synced. */
  if(waterBowlSynced&&waterRebuildT>0){
    waterDirty=true;
    if(waterRebuildT>0.08) waterRebuildT=0.08;
    return;
  }
  buildWaterMesh(waterTH);
  waterRebuildT=0.45;
  waterBowlSynced=1;
}
/* Nearest authored-water sample inside rad. Stepped — this is a deform
   hook, not a per-frame scan. Null on dry maps and inland bowls. */
function waterNearAuthored(wx,wy,rad){
  if(!WATER_AUTH||!heightF) return null;
  if(typeof battlefieldWaterMode==='function'&&battlefieldWaterMode()==='none') return null;
  const k=TS/MAP;
  const cx=wx*k, cy=wy*k, reach=Math.max(8,(rad||24)*k);
  const x0=clamp(Math.floor(cx-reach),0,TS-1), x1=clamp(Math.ceil(cx+reach),0,TS-1);
  const y0=clamp(Math.floor(cy-reach),0,TS-1), y1=clamp(Math.ceil(cy+reach),0,TS-1);
  const step=Math.max(1,(reach/18)|0);
  let best=null, bestD=1e9;
  for(let y=y0;y<=y1;y+=step) for(let x=x0;x<=x1;x+=step){
    if(!WATER_AUTH[y*TS+x]) continue;
    const ddx=x-cx, ddy=y-cy, d=ddx*ddx+ddy*ddy;
    if(d<bestD){ bestD=d; best=[x/k,y/k]; }
  }
  return best;
}
function waterLipEnsure(){
  if(!WATER_AUTH||!heightF) return false;
  if(!WATER_LIP||WATER_LIP.length!==WATER_AUTH.length) WATER_LIP=new Uint8Array(WATER_AUTH.length);
  return true;
}
/* One texel becomes authored water. This is the old crater-flood write:
   mesh coverage, pond albedo, ground blocked, ships may enter if the
   cell inherits the shoreline's naval component. Civic pads stay dry
   (JET ASSIST). Inland soil never reaches here — no path from WATER_AUTH. */
function waterFloodCommit(ix,iy){
  const i=iy*TS+ix;
  if(WATER_AUTH[i]) return false;
  const wx=(ix+0.5)/TS*MAP, wy=(iy+0.5)/TS*MAP;
  if(typeof cityGroundAt==='function'&&cityGroundAt(wx,wy)>=1) return false;
  WATER_AUTH[i]=1;
  if(WATER_LIP) WATER_LIP[i]=1;
  if(PASS){
    const px=clamp(wx/MAP*PGS|0,0,PGS-1), py=clamp(wy/MAP*PGS|0,0,PGS-1);
    const pi=py*PGS+px;
    PASS[pi]=0;
    if(typeof NAVW!=='undefined'&&NAVW){
      NAVW[pi]=1;
      if(typeof NAVCOMP!=='undefined'&&NAVCOMP&&!NAVCOMP[pi]){
        const DX=[1,-1,0,0], DY=[0,0,1,-1];
        for(let k=0;k<4;k++){
          const qx=px+DX[k], qy=py+DY[k];
          if(qx<0||qy<0||qx>=PGS||qy>=PGS) continue;
          const c=NAVCOMP[qy*PGS+qx];
          if(c){
            NAVCOMP[pi]=c;
            if(typeof NAV_SIZE!=='undefined'&&NAV_SIZE) NAV_SIZE[c]=(NAV_SIZE[c]||0)+1;
            break;
          }
        }
      }
    }
  }
  return true;
}
function waterFloodRelight(x0,y0,x1,y1){
  if(typeof shadeRegion!=='function'||!heightF) return;
  const sx=clamp(x0-2,0,TS-1), sy=clamp(y0-2,0,TS-1);
  const ex=clamp(x1+2,0,TS-1), ey=clamp(y1+2,0,TS-1);
  const w=ex-sx+1, h=ey-sy+1;
  if(w<=0||h<=0) return;
  shadeRegion(sx,sy,w,h,null,true);
  if(typeof gl==='undefined'||!gl||!terrainCanvas||typeof terrainTex==='undefined'||!terrainTex) return;
  const tmp=document.createElement('canvas'); tmp.width=w; tmp.height=h;
  tmp.getContext('2d').drawImage(terrainCanvas,sx,sy,w,h,0,0,w,h);
  const was=gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE10);
  const prev=gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.bindTexture(gl.TEXTURE_2D,terrainTex);
  gl.texSubImage2D(gl.TEXTURE_2D,0,sx,sy,gl.RGBA,gl.UNSIGNED_BYTE,tmp);
  gl.bindTexture(gl.TEXTURE_2D,prev);
  gl.activeTexture(was);
}
function waterReactDeform(wx,wy,rad,depth){
  if(typeof battlefieldWaterMode==='function'&&battlefieldWaterMode()==='none') return false;
  const r=rad||40;
  const onWet=typeof authoredWaterAt==='function'&&authoredWaterAt(wx,wy);
  const hit=onWet? [wx,wy] : waterNearAuthored(wx,wy,r+40);
  if(!hit) return false;
  const F=waterFloodEnqueue(wx,wy,r,hit[0],hit[1]);
  /* Seed a thin contact so the splash lands on wet sheet, then the tick
     walks the front through the bowl. Instant full-lip was a painted stain. */
  F.front=Math.max(F.front, 8);
  if(waterFloodMark(F,F.front)){
    waterDirty=true;
    waterSyncBowl(wx,wy,r);
    const k=TS/MAP, cr=Math.max(6,r*k), reach=cr+F.front*k+4;
    waterFloodRelight(
      clamp(Math.floor(wx*k-reach),0,TS-1),
      clamp(Math.floor(wy*k-reach),0,TS-1),
      clamp(Math.ceil(wx*k+reach),0,TS-1),
      clamp(Math.ceil(wy*k+reach),0,TS-1));
  }
  if(typeof waterFxCrater==='function') waterFxCrater(wx,wy,Math.max(22,r*0.62),depth,hit[0],hit[1]);
  return true;
}

/* Hydrology class stamped into the water sheet:
     0 ocean — readable swell + glitter
     1 river — directional flow along the authored carve axis
     2 lake  — enclosed / secondary bodies, calmer
   Not biome (lava/ice) — that stays uKind. Small NAV components on an
   ocean map are lakes so a lagoon does not heave like the open sea. */
function waterHydroAt(wx,wy){
  /* Flooded crater bowls are enclosed ponds — ocean swell in a 60 wu hole
     reads as the sheet tearing. */
  if(typeof waterLipAt==='function'&&waterLipAt(wx,wy)) return 2;
  const mode=typeof battlefieldWaterMode==='function'?battlefieldWaterMode():'none';
  if(mode==='river') return 1;
  if(mode==='ocean'){
    /* Only a smaller SECONDARY naval component is a lake. Shallows of the
       main sea used to return 2 because waterComponentAt is 0 there, and
       the whole ocean drew as a millpond. */
    if(typeof waterComponentAt==='function'&&typeof NAV_MAIN!=='undefined'&&NAV_MAIN>0&&typeof NAV_SIZE!=='undefined'){
      const c=waterComponentAt(wx,wy);
      if(c&&c!==NAV_MAIN&&(NAV_SIZE[c]||0)>8&&(NAV_SIZE[c]||0)<(NAV_SIZE[NAV_MAIN]||0)*0.45) return 2;
    }
    return 0;
  }
  return 2;
}
function waterAmpNow(){
  const G=typeof GFX!=='undefined'?GFX:{};
  const a=G.waterAmp;
  return a==null?1:+a;
}
function waterFxTier(){
  /* Same cuts as uDetail: LOW cheapest, MEDIUM readable, HIGH richer.
     Reads GFX.waterAmp only — no new META.settings key. */
  const a=waterAmpNow();
  return a>=0.85?2:a>=0.55?1:0;
}
function waterSurfaceY(wx,wy){
  /* MUST match VSW. Hulls that bob on a different swell sit in a hole or
     fly. Visual only — sim pathing stays on the flat naval mask; do not
     put this in sim.js (contended, and a bouncing flowfield is a bug). */
  const t=(typeof performance!=='undefined'?performance.now():0)*0.001;
  const hydro=waterHydroAt(wx,wy);
  const h=typeof terrainH==='function'?terrainH(wx,wy):0;
  const deep=clamp((-h-0.8)/11.0,0,1);
  let A=hydro>1.5?0.90:hydro>0.5?0.62:2.85;
  A*=waterAmpNow()*deep;
  const TH=typeof THEMES!=='undefined'&&THEMES[curTheme];
  if(TH&&TH.water==='ice') A*=0.28;
  else if(TH&&TH.water==='lava') A*=0.55;
  let swell;
  if(hydro>1.5){
    swell=(Math.sin(wx*0.011+t*0.28)+Math.sin(wy*0.009-t*0.22))*0.5;
  }else if(hydro>0.5){
    const fl=typeof battlefieldWaterFlow==='function'?battlefieldWaterFlow():[1,0];
    swell=Math.sin(wx*fl[0]*0.048+wy*fl[1]*0.048-t*1.55);
  }else{
    const w1=Math.sin(wx*0.016+t*0.62), w2=Math.sin(wy*0.013-t*0.48);
    const w3=Math.sin((wx+wy)*0.022+t*0.91);
    swell=w1*0.50+w2*0.32+w3*0.18;
  }
  /* Same suction the water VS applies — hulls that skip it sit on a hump
     next to a pulled sheet. Visual only; sim pathing stays flat. */
  let y=WATER_Y+0.55+swell*A-waterCraterPull(wx,wy)*deep;
  if(waterFxTier()>=2) y+=waterCraterChop(wx,wy)*deep;
  return y;
}

/* Cheap GPU water FX — not a solver. Wakes and impact rings are:
     1. uniforms sampled by the water fragment (reads at command zoom, no z-fight)
     2. a few additive InstMesh quads at tactical zoom (silhouette)
   Sim pathing stays on the flat naval mask.

   ONE declaration. This file is a classic <script> concatenated into one
   global scope (bundle.mjs / boot.js). A second `const WFX_N` anywhere in
   src/ is a SyntaxError at load, not a warning — the same class as RESEARCH
   / bloomB. Do not redeclare next to drawWater. */
const WFX_N=8;
const WFX_CRATER_N=4;
const wfxWake=new Float32Array(WFX_N*4);
const wfxRipple=new Float32Array(WFX_N*4);
const wfxCrater=new Float32Array(WFX_CRATER_N*4);
let wfxWakeN=0, wfxRippleN=0, wfxCraterN=0, wfxRipSlot=0, wfxFxEpoch=-1;
const wfxRipX=new Float32Array(WFX_N), wfxRipY=new Float32Array(WFX_N);
const wfxRipR0=new Float32Array(WFX_N), wfxRipLife=new Float32Array(WFX_N);
const wfxRipBorn=new Float32Array(WFX_N);
const wfxCratX=new Float32Array(WFX_CRATER_N), wfxCratY=new Float32Array(WFX_CRATER_N);
const wfxCratR=new Float32Array(WFX_CRATER_N), wfxCratLife=new Float32Array(WFX_CRATER_N);
const wfxCratBorn=new Float32Array(WFX_CRATER_N), wfxCratStr=new Float32Array(WFX_CRATER_N);
const wfxCratHitX=new Float32Array(WFX_CRATER_N), wfxCratHitY=new Float32Array(WFX_CRATER_N);
let wfxSplashing=false;
function mdlWake(){
  const m=MB();
  /* Authored along -X so hull yaw (forward = +X) trails aft. Vertex colour
     is the additive fade — black adds nothing. */
  const bands=[[-0.05,-0.22,1.00,0.10],[-0.22,-0.48,0.55,0.20],[-0.48,-0.78,0.26,0.34],[-0.78,-1.00,0.09,0.46]];
  for(const [x0,x1,v,hz] of bands)
    m.quad([x0,0,-hz*0.28],[x1,0,-hz],[x1,0,hz],[x0,0,hz*0.28],[v,v,v]);
  return m.build();
}
function mdlRipple(){
  const m=MB();
  m.ring(0,0,0,0.82,1.0,22,[1,1,1]);
  m.ring(0,0,0,0.52,0.64,18,[0.32,0.32,0.32]);
  return m.build();
}
function ensureWaterFxMeshes(){
  if(typeof gl==='undefined'||!gl||typeof FX==='undefined'||typeof InstMesh!=='function'||typeof MB!=='function') return;
  const ep=typeof glEpoch!=='undefined'?glEpoch:0;
  if(wfxFxEpoch!==ep){ FX.wake=null; FX.ripple=null; wfxFxEpoch=ep; }
  if(!FX.wake) FX.wake=new InstMesh(gl,mdlWake(),280);
  if(!FX.ripple) FX.ripple=new InstMesh(gl,mdlRipple(),160);
}
function waterFxReset(){
  wfxWake.fill(0); wfxRipple.fill(0); wfxCrater.fill(0);
  wfxWakeN=0; wfxRippleN=0; wfxCraterN=0;
  wfxRipLife.fill(0); wfxCratLife.fill(0); wfxRipSlot=0; wfxFxEpoch=-1;
  if(typeof FX!=='undefined'){ FX.wake=null; FX.ripple=null; }
}
function waterCraterPull(wx,wy){
  const now=(typeof performance!=='undefined'?performance.now():0)*0.001;
  let pull=0;
  for(let i=0;i<WFX_CRATER_N;i++){
    if(wfxCratLife[i]<=0) continue;
    const age=now-wfxCratBorn[i];
    if(age>=wfxCratLife[i]) continue;
    const q=1-age/wfxCratLife[i];
    const d=Math.hypot(wx-wfxCratX[i],wy-wfxCratY[i]);
    const rad=Math.max(wfxCratR[i],4);
    const fall=1-clamp(d/rad,0,1);
    pull+=wfxCratStr[i]*q*q*fall*fall*0.85;
  }
  return pull;
}
function waterCraterChop(wx,wy){
  /* HIGH-only surface chop. Must match VSW or hulls sit on a hump. */
  const now=(typeof performance!=='undefined'?performance.now():0)*0.001;
  let chop=0;
  for(let i=0;i<WFX_CRATER_N;i++){
    if(wfxCratLife[i]<=0) continue;
    const age=now-wfxCratBorn[i];
    if(age>=wfxCratLife[i]) continue;
    const q=1-age/wfxCratLife[i];
    const d=Math.hypot(wx-wfxCratX[i],wy-wfxCratY[i]);
    const rad=Math.max(wfxCratR[i],4);
    const fall=1-clamp(d/rad,0,1);
    chop+=wfxCratStr[i]*q*q*fall*Math.sin(d*0.22-now*4.8)*0.32;
  }
  return chop;
}
function stampWaterRipple(x,y,str){
  /* Alias for GPU bursts. waterFxImpact owns the ring buffer. */
  if(typeof authoredWaterAt==='function'&&!authoredWaterAt(x,y)) return;
  waterFxImpact(x,y, 8+12*(str==null?1:str), 0.9+0.4*(str==null?1:str));
}
function wfxTacticalQuads(){
  return typeof orthoSpan==='undefined'||orthoSpan<2200;
}
function wfxQuadScale(){
  /* Bloom is extracted BEFORE water, so these additive quads no longer
     feed the HIGH two-pass glow (the old noon-haze reason they were
     skipped). HIGH still uses a dimmer alpha: the sheet already paints
     the V, and a full-bright quad on noon water is haze without bloom. */
  return (typeof GFX!=='undefined'&&GFX.bloomBlur>=2)?0.72:1;
}
function waterFxBegin(){
  wfxWake.fill(0); wfxWakeN=0;
  ensureWaterFxMeshes();
  const now=(typeof performance!=='undefined'?performance.now():0)*0.001;
  const close=wfxTacticalQuads();
  const dim=wfxQuadScale();
  let n=0;
  for(let i=0;i<WFX_N;i++){
    if(wfxRipLife[i]<=0) continue;
    const age=now-wfxRipBorn[i];
    if(age>=wfxRipLife[i]){ wfxRipLife[i]=0; continue; }
    const q=1-age/wfxRipLife[i];
    const rad=wfxRipR0[i]+age*36;
    const o=n*4;
    wfxRipple[o]=wfxRipX[i]; wfxRipple[o+1]=wfxRipY[i];
    wfxRipple[o+2]=rad; wfxRipple[o+3]=q*q;
    if(close&&FX.ripple){
      const hy=typeof waterSurfaceY==='function'?waterSurfaceY(wfxRipX[i],wfxRipY[i]):0.6;
      FX.ripple.add(wfxRipX[i],wfxRipY[i],hy+0.38, rad, now*0.7, 220,240,255, 70*q*q*dim);
    }
    n++;
  }
  wfxRippleN=n;
  if(n<WFX_N) wfxRipple.fill(0,n*4);
  let cn=0;
  for(let i=0;i<WFX_CRATER_N;i++){
    if(wfxCratLife[i]<=0) continue;
    const age=now-wfxCratBorn[i];
    if(age>=wfxCratLife[i]){ wfxCratLife[i]=0; continue; }
    const q=1-age/wfxCratLife[i];
    const o=cn*4;
    wfxCrater[o]=wfxCratX[i]; wfxCrater[o+1]=wfxCratY[i];
    wfxCrater[o+2]=wfxCratR[i]; wfxCrater[o+3]=wfxCratStr[i]*q*q;
    cn++;
  }
  wfxCraterN=cn;
  if(cn<WFX_CRATER_N) wfxCrater.fill(0,cn*4);
}
function waterFxWake(x,y,yaw,len,wid){
  if(wfxWakeN>=WFX_N) return;
  const o=wfxWakeN*4;
  wfxWake[o]=x; wfxWake[o+1]=y; wfxWake[o+2]=yaw; wfxWake[o+3]=len;
  wfxWakeN++;
  if(wfxTacticalQuads()&&FX.wake){
    const hy=typeof waterSurfaceY==='function'?waterSurfaceY(x,y):0.6;
    FX.wake.add(x,y,hy+0.32, len, yaw, 210,235,245, 48*wfxQuadScale(), wid||len*0.38);
  }
}
function waterFxImpact(x,y,r0,life,force){
  const now=(typeof performance!=='undefined'?performance.now():0)*0.001;
  if(!force){
    for(let i=0;i<WFX_N;i++){
      if(wfxRipLife[i]<=0) continue;
      const dx=x-wfxRipX[i], dy=y-wfxRipY[i];
      if(dx*dx+dy*dy<22*22 && (now-wfxRipBorn[i])<0.28) return;
    }
  }
  const i=wfxRipSlot; wfxRipSlot=(wfxRipSlot+1)%WFX_N;
  wfxRipX[i]=x; wfxRipY[i]=y; wfxRipR0[i]=r0||8;
  wfxRipLife[i]=life||1.15; wfxRipBorn[i]=now;
  if(wfxSplashing) return;
  /* force = crater ring. waterFxCrater owns that column so MEDIUM does
     not pay two bursts per shoreline bowl. */
  if(force) return;
  if(typeof gpfxBurst==='function'&&waterFxTier()>=1){
    const n=waterFxTier()>=2?12:7;
    if(n){
      wfxSplashing=true;
      try{
        gpfxBurst(x,y,(typeof waterSurfaceY==='function'?waterSurfaceY(x,y):0)+2,n,
          {speed:42,up:0.85,life:0.55,col:[200,230,255],size:2.1,drag:0.96,jit:3});
      }finally{ wfxSplashing=false; }
    }
  }
}
function stampWaterCrater(x,y,r,str,hx,hy){
  const now=(typeof performance!=='undefined'?performance.now():0)*0.001;
  let i=0, worst=1e9;
  for(let k=0;k<WFX_CRATER_N;k++){
    if(wfxCratLife[k]<=0){ i=k; worst=-1; break; }
    const left=wfxCratLife[k]-(now-wfxCratBorn[k]);
    if(left<worst){ worst=left; i=k; }
  }
  wfxCratX[i]=x; wfxCratY[i]=y;
  wfxCratR[i]=Math.max(12,r||28);
  const tier=waterFxTier();
  wfxCratLife[i]=(tier>=2?2.15:tier?1.75:1.15)+0.35*(str||1);
  wfxCratBorn[i]=now;
  wfxCratStr[i]=clamp(str==null?1:str,0.4,1.8);
  wfxCratHitX[i]=hx==null?x:hx; wfxCratHitY[i]=hy==null?y:hy;
}
function waterFxCrater(x,y,r,depth,hx,hy){
  const rad=r||40;
  const hitX=hx==null?x:hx, hitY=hy==null?y:hy;
  const str=clamp((rad/70)*(0.7+(depth||0.04)*8),0.55,1.65);
  const tier=waterFxTier();
  stampWaterCrater(x,y,rad,str*(tier?1:0.72),hitX,hitY);
  /* LOW: one short ring, no column. MEDIUM: two rings + cheap splash.
     HIGH: three staggered rings + richer column. force skips impact splash. */
  waterFxImpact(hitX,hitY, 16+rad*(tier?0.24:0.14), (tier?1.45:0.88)+str*0.22, true);
  if(tier>=1 && Math.hypot(x-hitX,y-hitY)>10)
    waterFxImpact(x,y, 10+rad*0.14, 1.12, true);
  if(tier>=2){
    waterFxImpact(hitX,hitY, 30+rad*0.30, 1.95+str*0.30, true);
    waterFxImpact(hitX+(x-hitX)*0.38, hitY+(y-hitY)*0.38, 14+rad*0.10, 1.28, true);
  }
  if(tier<1 || wfxSplashing) return;
  if(typeof gpfxBurst!=='function') return;
  const n=tier>=2?Math.round(36*str):Math.round(12*str);
  if(n<=0) return;
  wfxSplashing=true;
  try{
    const hy0=typeof waterSurfaceY==='function'?waterSurfaceY(hitX,hitY):0.6;
    gpfxBurst(hitX,hitY,hy0+3.2,n,
      {speed:tier>=2?72:48,up:tier>=2?1.22:0.95,life:tier>=2?0.72:0.52,
       col:[188,226,255],size:tier>=2?2.7:2.1,drag:0.935,jit:tier>=2?6:4});
    if(tier>=2){
      const dx=x-hitX, dy=y-hitY, dl=Math.hypot(dx,dy)||1;
      gpfxBurst(hitX,hitY,hy0+1.6,Math.round(14*str),
        {speed:38,up:0.22,life:0.55,col:[210,236,255],size:2.0,drag:0.94,jit:5,
         dir:[dx/dl,dy/dl],spread:0.55});
    }
  }finally{ wfxSplashing=false; }
}
function waterFxEmitCraterWakes(){
  /* Inflow V on the wet contact for the first beat. LOW skips. MEDIUM
     takes one leftover slot. HIGH uses what ships have not claimed. */
  const tier=waterFxTier();
  if(tier<1) return;
  const now=(typeof performance!=='undefined'?performance.now():0)*0.001;
  let left=Math.max(0, WFX_N-wfxWakeN);
  if(tier<2) left=Math.min(left,1);
  for(let i=0;i<WFX_CRATER_N && left>0;i++){
    if(wfxCratLife[i]<=0) continue;
    const age=now-wfxCratBorn[i];
    if(age>0.75) continue;
    const dx=wfxCratX[i]-wfxCratHitX[i], dy=wfxCratY[i]-wfxCratHitY[i];
    const yaw=Math.atan2(dy,dx);
    waterFxWake(wfxCratHitX[i],wfxCratHitY[i],yaw, Math.max(18,wfxCratR[i]*0.85), wfxCratR[i]*0.42);
    left--;
  }
}

/* ---------- WATER -----------------------------------------------------------
   A separate mesh at sea level covering only the cells that are actually below
   water, so we aren't drawing a full-map transparent sheet over dry land. It
   animates in the vertex stage as real displacement, so waves have crests that
   catch the sun rather than a scrolling texture. */
function buildWaterMesh(TH){
  const cell=MAP/TGRID;
  const verts=[], idx=[];
  const map=new Int32Array(TVERT*TVERT).fill(-1);
  const need=new Uint8Array(TVERT*TVERT);
  for(let z=0;z<TGRID;z++) for(let x=0;x<TGRID;x++){
    let wet=false;
    for(const [dx,dz] of [[0,0],[1,0],[0,1],[1,1]]){
      const wx=(x+dx)*cell, wy=(z+dz)*cell;
      const hx=clamp(Math.round(wx/MAP*(TS-1)),0,TS-1), hy=clamp(Math.round(wy/MAP*(TS-1)),0,TS-1);
      if(heightF[hy*TS+hx]<WATER_H+0.012){
        const lip=WATER_LIP&&WATER_LIP[hy*TS+hx];
        if(WATER_AUTH&&!WATER_AUTH[hy*TS+hx]&&!lip) continue;  // inland dry crater
        wet=true; break;
      }
    }
    if(!wet) continue;
    for(const [dx,dz] of [[0,0],[1,0],[0,1],[1,1]]) need[(z+dz)*TVERT+(x+dx)]=1;
  }
  waterNeed=need; waterTH=TH; waterDirty=false; waterBaseCol=null;
  let vn=0;
  const wc=TH.wShal, wd=TH.wDeep;
  for(let z=0;z<TVERT;z++) for(let x=0;x<TVERT;x++){
    if(!need[z*TVERT+x]) continue;
    map[z*TVERT+x]=vn++;
    const wx=x*cell, wy=z*cell;
    const hx=clamp(Math.round(wx/MAP*(TS-1)),0,TS-1), hy=clamp(Math.round(wy/MAP*(TS-1)),0,TS-1);
    const depth=clamp((WATER_H-heightF[hy*TS+hx])/0.10,0,1);   // shallows are lighter
    const r=(wd[0]*depth+wc[0]*(1-depth))/255;
    const g=(wd[1]*depth+wc[1]*(1-depth))/255;
    const b=(wd[2]*depth+wc[2]*(1-depth))/255;
    /* aUV.x is hydrology class (ocean/river/lake), not a texture coord.
       The water program never sampled these UVs; stamping hydro here is
       free and lets one sheet carry three motions. */
    verts.push(wx,WATER_Y,wy, 0,1,0, r,g,b, waterHydroAt(wx,wy), 0, MAT.CRYST);
  }
  for(let z=0;z<TGRID;z++) for(let x=0;x<TGRID;x++){
    const a=map[z*TVERT+x], b=map[z*TVERT+x+1], c=map[(z+1)*TVERT+x], d=map[(z+1)*TVERT+x+1];
    if(a<0||b<0||c<0||d<0) continue;
    idx.push(a,c,b, b,c,d);
  }
  waterIdxCount=idx.length;
  waterVerts=new Float32Array(verts);
  if(!waterVAO){
    waterVAO=gl.createVertexArray(); gl.bindVertexArray(waterVAO);
    waterVBO=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,waterVBO);
    gl.bufferData(gl.ARRAY_BUFFER,waterVerts,gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,VSTRIDE,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,VSTRIDE,12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,3,gl.FLOAT,false,VSTRIDE,24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,2,gl.FLOAT,false,VSTRIDE,36);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4,1,gl.FLOAT,false,VSTRIDE,44);
    waterIBO=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,waterIBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(idx),gl.STATIC_DRAW);
    gl.disableVertexAttribArray(5); gl.vertexAttrib4f(5,0,0,0,1);
    gl.disableVertexAttribArray(6); gl.vertexAttrib1f(6,0);
    gl.disableVertexAttribArray(7); gl.vertexAttrib4f(7,1,1,1,1);
    gl.disableVertexAttribArray(8); gl.vertexAttrib1f(8,1);
    gl.bindVertexArray(null);
  } else {
    /* REBUILD ATOMICALLY. A shoreline rebuild changes both vertex and index
       counts; re-uploading into the live VAO let stale indices read the wrong
       vertex array — undefined behaviour that drew enormous stretched sheets
       off the map. Drop and recreate: all-or-nothing. Combat craters on dry
       land never reach here (WATER_AUTH gates coverage). */
    gl.deleteVertexArray(waterVAO); gl.deleteBuffer(waterVBO); gl.deleteBuffer(waterIBO);
    waterVAO=gl.createVertexArray(); gl.bindVertexArray(waterVAO);
    waterVBO=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,waterVBO);
    gl.bufferData(gl.ARRAY_BUFFER,waterVerts,gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,VSTRIDE,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,VSTRIDE,12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,3,gl.FLOAT,false,VSTRIDE,24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,2,gl.FLOAT,false,VSTRIDE,36);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4,1,gl.FLOAT,false,VSTRIDE,44);
    waterIBO=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,waterIBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(idx),gl.STATIC_DRAW);
    gl.disableVertexAttribArray(5); gl.vertexAttrib4f(5,0,0,0,1);
    gl.disableVertexAttribArray(6); gl.vertexAttrib1f(6,0);
    gl.disableVertexAttribArray(7); gl.vertexAttrib4f(7,1,1,1,1);
    gl.disableVertexAttribArray(8); gl.vertexAttrib1f(8,1);
    gl.bindVertexArray(null);
  }
}
/* ---------- WATER SURFACE SHADER ------------------------------------------
   Yesterday this was a flat sheet: ±0.38 swell (invisible at command zoom),
   one motion for every hydrology class, no river axis. ±3.4 CPU trains are
   still forbidden — they z-fight the beach. Deep*amp → 0 at the waterline
   is what makes a 2.45 ocean swell legal.

   Cheap mobile RTS water, not a solver:
     * vertex displacement (ocean swell / lake chop / river travel)
     * fragment scrolling (flow streaks, caustics) — this is what READS at
       strategic zoom when vertex motion is a sub-pixel
     * heightTex shore foam
     * crater suction + lip foam (uCrater[4], no extra textures)
   No extra textures (units 4/5/6 stay post, 7 is ads/civic, 8 FOW, 10 height).
   LOW still draws; uAmp/uDetail only quiet the motion. Skipping the pass
   is the flicker class. Fallback is millimetre CPU waves on prog3D. */
const VSW=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=2) in vec3 aCol;
layout(location=3) in vec2 aUV;
uniform mat4 uVP;
uniform vec3 uEye;
uniform float uTime;
uniform float uMap;
uniform float uKind;
uniform float uLift;
uniform float uAmp;
uniform vec2 uFlow;
uniform sampler2D uHeight;
uniform vec4 uCrater[4];
uniform highp int uCraterN;
out vec3 vWorld; out vec3 vCol; out vec2 vMapUV; out float vFog; out float vDeep; out float vHydro;
void main(){
  vec3 p=aPos;
  vMapUV=vec2(p.x,p.z)/uMap;
  vHydro=aUV.x;
  float h=texture(uHeight,clamp(vMapUV,0.0,1.0)).r;
  float deep=clamp((-h-0.8)/11.0,0.0,1.0);
  float lava=step(0.5,uKind)*step(uKind,1.5);
  float ice=step(1.5,uKind)*step(uKind,2.5);
  float hydro=vHydro;
  float A=hydro>1.5?0.90:(hydro>0.5?0.62:2.85);
  A*=uAmp*deep*(1.0-ice*0.72)*(1.0-lava*0.45);
  float t=uTime;
  float swell;
  if(hydro>1.5){
    swell=(sin(p.x*0.011+t*0.28)+sin(p.z*0.009-t*0.22))*0.5;
  }else if(hydro>0.5){
    swell=sin(dot(p.xz,uFlow)*0.048-t*1.55);
  }else{
    float w1=sin(p.x*0.016+t*0.62), w2=sin(p.z*0.013-t*0.48);
    float w3=sin((p.x+p.z)*0.022+t*0.91);
    swell=w1*0.50+w2*0.32+w3*0.18;
  }
  float pull=0.0;
  float chop=0.0;
  int cn=uCraterN<0?0:uCraterN; if(cn>4) cn=4;
  for(int i=0;i<4;i++){
    if(i>=cn) break;
    vec4 C=uCrater[i];
    float cratR=max(C.z,4.0);
    float dd=distance(p.xz,C.xy);
    float fall=1.0-smoothstep(0.0,cratR,dd);
    pull+=C.w*fall*fall;
    if(uAmp>0.84) chop+=sin(dd*0.22-t*4.8)*fall*C.w*0.32;
  }
  p.y=uLift+swell*A-(pull-chop)*deep;
  vWorld=p; vCol=aCol; vDeep=deep;
  float d=length(p-uEye);
  vFog=clamp((d-2600.0)/4200.0,0.0,0.5);
  gl_Position=uVP*vec4(p,1.0);
}`;
const FSW=`#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vCol; in vec2 vMapUV; in float vFog; in float vDeep; in float vHydro;
uniform sampler2D uHeight;
uniform sampler2D uFowMap;
uniform float uFowOn;
uniform vec3 uSun; uniform vec3 uSunC;
uniform vec3 uAmbSky; uniform vec3 uAmbGnd; uniform vec3 uFogC;
uniform vec3 uEye; uniform vec3 uDeepC; uniform vec3 uShalC; uniform vec3 uFoamC;
uniform float uTime; uniform float uKind; uniform float uNight;
uniform float uAmp; uniform float uDetail; uniform vec2 uFlow;
/* Wakes / impact rings live IN the water sheet so they cannot z-fight the
   swell. Eight of each is a mobile budget, not a particle solver. */
uniform vec4 uWake[8];
uniform vec4 uRipple[8];
uniform vec4 uCrater[4];
uniform int uWakeN;
uniform int uRippleN;
uniform highp int uCraterN;
out vec4 o;
void main(){
  vec2 he=1.0/vec2(textureSize(uHeight,0));
  float h=texture(uHeight,vMapUV).r;
  float hL=texture(uHeight,vMapUV-vec2(he.x,0.0)).r;
  float hR=texture(uHeight,vMapUV+vec2(he.x,0.0)).r;
  float hU=texture(uHeight,vMapUV-vec2(0.0,he.y)).r;
  float hD=texture(uHeight,vMapUV+vec2(0.0,he.y)).r;
  float nearLand=max(max(hL,hR),max(hU,hD));
  if(uDetail>0.5){
    vec2 e2=he*2.5, e6=he*6.0;
    float nAxis=max(
      max(texture(uHeight,vMapUV+vec2(e6.x,0.0)).r, texture(uHeight,vMapUV-vec2(e6.x,0.0)).r),
      max(texture(uHeight,vMapUV+vec2(0.0,e6.y)).r, texture(uHeight,vMapUV-vec2(0.0,e6.y)).r));
    float nDiag=max(
      max(texture(uHeight,vMapUV+e6).r, texture(uHeight,vMapUV-e6).r),
      max(texture(uHeight,vMapUV+vec2(e6.x,-e6.y)).r, texture(uHeight,vMapUV+vec2(-e6.x,e6.y)).r));
    float nClose=max(
      max(texture(uHeight,vMapUV+e2).r, texture(uHeight,vMapUV-e2).r),
      nearLand);
    nearLand=max(max(nAxis,nDiag),nClose);
  }
  /* Apron covers the 10 m mesh jag: water+foam still draw a few metres onto
     the beach so the stair is a ribbon, not a polygon. */
  float cover=1.0-smoothstep(-1.2,8.2,h);
  if(cover<0.02) discard;
  float deep=clamp((-h-0.3)/28.0,0.0,1.0);
  deep=max(deep,vDeep*0.18);
  float t=uTime;
  vec2 wxz=vWorld.xz;
  float hydro=vHydro;
  float river=step(0.5,hydro)*step(hydro,1.5);
  float lake=step(1.5,hydro);
  vec2 flow=dot(uFlow,uFlow)>0.2?normalize(uFlow):vec2(1.0,0.0);
  float along=dot(wxz,flow);
  float across=dot(wxz,vec2(-flow.y,flow.x));
  float w1=sin(wxz.x*0.018+t*0.55)*0.55+sin(wxz.y*0.015-t*0.42)*0.40;
  w1=mix(w1, sin(along*0.048-t*1.55)*0.85+sin(across*0.22+t*0.31)*0.25, river);
  w1=mix(w1, sin(wxz.x*0.011+t*0.28)*0.4+sin(wxz.y*0.009-t*0.22)*0.4, lake);
  vec3 n=normalize(vec3(
    -(cos(wxz.x*0.018+t*0.55)*0.018*0.55+cos((wxz.x+wxz.y)*0.029+t*0.84)*0.029*0.26),
    1.0,
    -(cos(wxz.y*0.015-t*0.42)*0.015*0.40+cos((wxz.x+wxz.y)*0.029+t*0.84)*0.029*0.26)
  ));
  vec3 nRiver=normalize(vec3(
    -flow.x*(0.22+0.18*cos(along*0.048-t*1.55)),
    1.0,
    -flow.y*(0.22+0.18*cos(along*0.048-t*1.55))
  ));
  n=mix(n, nRiver, river);
  n=normalize(mix(vec3(0.0,1.0,0.0), n, mix(0.50+0.50*deep, 0.28+0.22*deep, lake)));
  vec3 V=normalize(uEye-vWorld);
  float ndv=max(dot(n,V),0.0);
  float lava=step(0.5,uKind)*step(uKind,1.5);
  float ice=step(1.5,uKind)*step(uKind,2.5);
  float dusk=step(2.5,uKind);
  vec3 body=mix(uShalC*1.04, uDeepC*1.08, pow(deep,0.85));
  body=mix(body,vCol,0.06);
  /* Fake volume. Optical depth thickens at grazing angles so the sheet
     reads as a body, not a painted plane. Beer-Lambert toward a darker
     navy; not a raymarch — WFX crater/wake/ripple uniforms stay. */
  float od=deep/max(ndv,0.12);
  body*=exp(-vec3(0.88,0.44,0.15)*od*0.70);
  body=mix(body, uDeepC*0.52, clamp(od*0.16,0.0,0.38));
  vec3 reflDir=reflect(-V,n);
  float skyT=clamp(reflDir.y*0.55+0.42,0.0,1.0);
  vec3 skyRefl=mix(uFogC*1.18, uAmbSky*1.12, skyT);
  skyRefl=mix(skyRefl, vec3(0.55,0.22,0.08), lava*0.65);
  skyRefl=mix(skyRefl, vec3(0.80,0.90,1.08), ice*0.40);
  skyRefl=mix(skyRefl, vec3(0.42,0.22,0.58), dusk*0.45);
  float fres=0.10+(1.0-0.10)*pow(1.0-ndv,4.0);
  float sheen=0.22+0.48*(1.0-n.y)+0.12*max(0.0,w1);
  fres=max(fres, sheen)*(1.0-lava*0.75);
  fres=mix(fres, fres*0.55, lake);
  vec3 H=normalize(uSun+V);
  float spec=pow(max(dot(n,H),0.0), mix(mix(48.0,20.0,lava), 96.0, ice));
  /* 0.40/0.45 glitter filled the bloom bright-pass on HIGH noon oceans. */
  spec*=0.28+0.32*deep;
  spec=mix(spec, spec*1.22, river);
  vec3 amb=mix(uAmbGnd,uAmbSky,n.y*0.5+0.5);
  float ndl=max(dot(n,uSun),0.0);
  vec3 lit=body*(amb*1.10 + uSunC*(ndl*0.55+0.28));
  float sss=(1.0-deep)*max(dot(n,uSun)*0.38+0.22,0.0)*(0.16+0.26*(1.0-ndv));
  lit+=vec3(0.09,0.24,0.22)*sss*(1.0-lava)*(1.0-ice*0.55);
  lit=mix(lit, skyRefl, clamp(0.12+fres*0.30,0.0,0.40));
  lit+=uSunC*spec*(0.62+0.55*ice);
  float sp=sin(wxz.x*0.33+t*0.78)*sin(wxz.y*0.29-t*0.64);
  float caus=pow(max(0.0, sp*0.62+0.22), 4.8)*mix(0.14,0.24,deep)*mix(1.0,0.45,ice);
  /* River: scrolling streaks along the carve axis. This is the read at
     command zoom — vertex travel alone is a sub-pixel. */
  float streak=pow(0.5+0.5*sin(along*0.11-t*2.4)*sin(across*0.55+t*0.18), mix(3.2,5.5,uDetail));
  caus=mix(caus, streak*mix(0.18,0.32,deep), river);
  caus=mix(caus, caus*0.45, lake);
  lit+=mix(vec3(0.32,0.55,0.62), vec3(0.55,0.18,0.04), lava)*caus;
  lit+=body*lava*(0.16+0.12*max(0.0,w1))*(0.45+0.55*uNight);
  vec2 grad=vec2(hL-hR, hU-hD);
  float gln=length(grad);
  vec2 shoreDir=gln>1e-4?vec2(-grad.y,grad.x)/gln:vec2(1.0,0.0);
  float train=0.84+0.16*sin(dot(wxz,shoreDir)*0.28-t*1.05);
  train=mix(train, 0.80+0.20*sin(along*0.22-t*2.1), river);
  float hw=max(fwidth(h),0.22);
  float foamPix=1.0-smoothstep(hw*0.4, hw*7.5, abs(h));
  float foamWorld=smoothstep(-6.0,1.2,nearLand)*(1.0-smoothstep(2.8,8.4,h));
  float foam=cover*max(foamPix, foamWorld*mix(0.72,0.92,uAmp))*train;
  /* Ship wake: a widening V behind hull yaw. along>0 is aft of +X. */
  int wn=uWakeN<0?0:uWakeN; if(wn>8) wn=8;
  for(int i=0;i<8;i++){
    if(i>=wn) break;
    vec4 W=uWake[i];
    vec2 d=wxz-W.xy;
    float c=cos(W.z), s=sin(W.z);
    float wAlong=-(d.x*c+d.y*s);
    float wAcross=abs(-d.x*s+d.y*c);
    float len=max(W.w,4.0);
    /* half is reserved in GLSL ES 3.00 — ANGLE rejected the water FS. */
    float wakeHalf=mix(len*0.07, len*0.40, clamp(wAlong/len,0.0,1.0));
    float trail=smoothstep(1.2,7.0,wAlong)*(1.0-smoothstep(len*0.52,len,wAlong));
    trail*=1.0-smoothstep(wakeHalf*0.10, wakeHalf, wAcross);
    float bow=smoothstep(-7.0,-1.2,wAlong)*smoothstep(-20.0,-7.0,-wAlong);
    bow*=1.0-smoothstep(len*0.05, len*0.16, wAcross);
    foam+=(trail*mix(0.28,0.62,uAmp)+bow*mix(0.22,0.48,uAmp))*cover;
  }
  int rn=uRippleN<0?0:uRippleN; if(rn>8) rn=8;
  for(int i=0;i<8;i++){
    if(i>=rn) break;
    vec4 R=uRipple[i];
    float rad=max(R.z,1.5);
    float dd=distance(wxz,R.xy);
    float ring=1.0-smoothstep(0.0, 2.6+rad*0.035, abs(dd-rad));
    ring*=1.0-smoothstep(rad*1.05, rad*1.25, dd);
    foam+=ring*R.w*mix(0.32,0.70,uAmp)*cover;
  }
  int cn=uCraterN<0?0:uCraterN; if(cn>4) cn=4;
  for(int i=0;i<4;i++){
    if(i>=cn) break;
    vec4 C=uCrater[i];
    float cratR=max(C.z,4.0);
    float dd=distance(wxz,C.xy);
    float lipRing=1.0-smoothstep(0.0, 2.4+cratR*0.03, abs(dd-cratR*0.62));
    lipRing*=1.0-smoothstep(cratR*1.02, cratR*1.22, dd);
    foam+=lipRing*C.w*mix(0.48,1.15,uAmp)*cover;
    /* LOW: lip only. MEDIUM: radial inflow. HIGH: second ring + flow streaks. */
    if(uDetail>0.5){
      float inward=1.0-smoothstep(0.0,cratR,dd);
      float inflow=pow(0.5+0.5*sin(dd*0.18-t*3.6)*sin(dd*0.44+t*1.2), mix(2.2,3.8,uDetail));
      foam+=inward*inflow*C.w*mix(0.22,0.58,uAmp)*cover;
      if(uDetail>1.5){
        float ring2=1.0-smoothstep(0.0, 1.8+cratR*0.022, abs(dd-cratR*0.36));
        foam+=ring2*C.w*0.58*cover;
        vec2 toC=C.xy-wxz;
        float toLen=length(toC);
        vec2 toN=toLen>1e-3?toC/toLen:vec2(1.0,0.0);
        float flowAlign=max(0.0,dot(toN, flow));
        float streakC=pow(0.5+0.5*sin(dd*0.31-t*4.2), 3.0)*inward;
        foam+=streakC*(0.22+0.28*flowAlign)*C.w*cover;
      }
    }
  }
  foam=clamp(foam,0.0,1.0);
  /* 0.50 white crushed noon foam into the bloom bright-pass. Stay with the
     authored foam colour so a wake is a ribbon, not a glare sheet. */
  vec3 foamC=mix(uFoamC, vec3(0.90,0.95,0.97), 0.12+0.08*ice);
  lit=mix(lit, foamC*(0.74+0.16*(amb+uSunC*0.14)), pow(foam,0.72));
  /* Weaker filmic so the sheet stays navy, not a white glass plane. */
  lit=vec3(1.0)-exp(-lit*1.12);
  float fow=texture(uFowMap,clamp(vMapUV,0.0,1.0)).a*uFowOn;
  lit=mix(lit, mix(uAmbGnd*0.10,uFogC*0.20,0.5), fow);
  lit=mix(lit,uFogC,vFog*(1.0-fow));
  float alpha=mix(0.80,0.97,pow(deep,0.58));
  alpha=mix(alpha,0.94,lava);
  alpha=mix(alpha,0.78,ice);
  alpha=mix(alpha,0.88,foam*0.75);
  alpha=mix(alpha, mix(0.58,0.80,deep), lake*0.35);
  alpha*=cover;
  o=vec4(clamp(lit,vec3(0.0),vec3(1.0)), clamp(alpha,0.0,0.94));
}`;
let waterProg=null, waterProgTried=false, waterProgEpoch=-1, UW={};
function ensureWaterProg(){
  if(typeof gl==='undefined'||!gl||gl.isContextLost()) return null;
  if(typeof glEpoch!=='undefined'&&waterProgEpoch!==glEpoch){
    waterProg=null; waterProgTried=false; UW={};
  }
  if(waterProgTried) return waterProg;
  waterProgTried=true;
  waterProgEpoch=(typeof glEpoch!=='undefined')?glEpoch:0;
  if(typeof mkProg!=='function') return null;
  waterProg=mkProg(VSW,FSW,'water');
  if(!waterProg) return null;
  UW={};
  for(const k of ['uVP','uEye','uSun','uSunC','uAmbSky','uAmbGnd','uFogC',
                  'uTime','uKind','uLift','uMap','uNight','uFowOn',
                  'uAmp','uDetail','uFlow',
                  'uHeight','uFowMap','uDeepC','uShalC','uFoamC'])
    UW[k]=gl.getUniformLocation(waterProg,k);
  UW.uWake=gl.getUniformLocation(waterProg,'uWake[0]');
  UW.uRipple=gl.getUniformLocation(waterProg,'uRipple[0]');
  UW.uCrater=gl.getUniformLocation(waterProg,'uCrater[0]');
  UW.uWakeN=gl.getUniformLocation(waterProg,'uWakeN');
  UW.uRippleN=gl.getUniformLocation(waterProg,'uRippleN');
  UW.uCraterN=gl.getUniformLocation(waterProg,'uCraterN');
  gl.useProgram(waterProg);
  if(UW.uHeight) gl.uniform1i(UW.uHeight,10);
  if(UW.uFowMap) gl.uniform1i(UW.uFowMap,8);
  return waterProg;
}
/* GPU water owns swell, foam and FOW. The CPU path remains for a shader-link
   miss: millimetre displacement so a fallback cannot resurrect shoreline
   z-fight, plus the original vertex-colour fog dimming. */
let wavePhase=0;
function animateWater(t){
  if(!waterVerts||!waterIdxCount) return;
  wavePhase=t;
  if(ensureWaterProg()){
    if(typeof prog3D!=='undefined'&&prog3D) gl.useProgram(prog3D);
    return;
  }
  const n=waterVerts.length/12;
  const fogging=(typeof fogGameplayActive==='function')&&fogGameplayActive()&&(typeof covAt==='function');
  if(fogging&&(!waterBaseCol||waterBaseCol.length!==waterVerts.length)){
    waterBaseCol=new Float32Array(waterVerts.length);
    waterBaseCol.set(waterVerts);
  }
  if(!fogging&&waterBaseCol){
    for(let k=0;k<n;k++){ const o=k*12;
      waterVerts[o+6]=waterBaseCol[o+6]; waterVerts[o+7]=waterBaseCol[o+7]; waterVerts[o+8]=waterBaseCol[o+8]; }
    waterBaseCol=null;
  }
  for(let k=0;k<n;k++){
    const o=k*12, x=waterVerts[o], z=waterVerts[o+2];
    if(fogging){
      const seen=covAt(x,z)?1:(fogExploredAt(x,z)?0.34:0.045);
      waterVerts[o+6]=waterBaseCol[o+6]*seen;
      waterVerts[o+7]=waterBaseCol[o+7]*seen;
      waterVerts[o+8]=waterBaseCol[o+8]*seen;
    }
    /* ±0.22, not ±3.4: enough to sell a ripple if we are stuck on prog3D. */
    const w1=Math.sin(x*0.021+t*0.62)*0.12, w2=Math.sin(z*0.017-t*0.48)*0.08;
    waterVerts[o+1]=WATER_Y+0.28+w1+w2;
    waterVerts[o+3]=0; waterVerts[o+4]=1; waterVerts[o+5]=0;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,waterVBO);
  gl.bufferSubData(gl.ARRAY_BUFFER,0,waterVerts);
}
/* SELF-HEAL. `if(!terrVAO) return;` was a silent, permanent surrender: any
   path that left the terrain mesh unbuilt or its handle dropped — a context
   loss on the menu diorama, an OTA patch that replaces the document and its
   canvas, a quality change that re-inits GL — produced a world with rocks,
   trees and buildings floating over a flat void, and NOTHING ever tried again.
   The heightfield is deterministic from the map seed and its source canvas is
   already in memory, so rebuilding is cheap and reproduces the same ground
   rather than a new map.

   Bounded on purpose: a few attempts, not one per frame. If the mesh cannot be
   built the cause is upstream (no GL context at all) and hammering it every
   frame would turn a visual fault into a frozen device. */
let terrHealTries=0, terrEpoch=-1;
/* Stale = built against a context that no longer exists. A dead handle is
   still truthy, so this — not `!terrVAO` — is the real test. */
function terrainStale(){
  return !terrVAO || (typeof glEpoch!=='undefined' && terrEpoch!==glEpoch);
}
function terrainSelfHeal(){
  if(!terrainStale()||terrHealTries>=3) return false;
  if(typeof gl==='undefined'||!gl||gl.isContextLost()) return false;
  if(typeof terrainCanvas==='undefined'||!terrainCanvas) return false;
  terrHealTries++;
  try{
    /* Drop the dead handles FIRST or buildTerrainMesh takes its update branch
       and pours vertices into buffers that no longer exist. */
    terrainGLReset();
    buildTerrainMesh(typeof curTheme!=='undefined'?curTheme:undefined);
    if(terrVAO){
      terrEpoch=(typeof glEpoch!=='undefined')?glEpoch:0;
      console.warn('terrain: rebuilt after the mesh went stale'); terrHealTries=0; return true; }
  }catch(e){ console.warn('terrain: self-heal failed',e); }
  return false;
}
/* Draw the terrain with the MODEL program. Only used when the terrain's own
   program failed to build on this GPU — see the call site in render3d.js. The
   VAO is already in the model layout, so this is a bind and a draw; what is
   lost is the painted map texture, not the geometry. */
function drawTerrainFallback(){
  if(terrainStale()&&!terrainSelfHeal()) return;
  if(!terrVAO||typeof prog3D==='undefined'||!prog3D) return;
  gl.bindVertexArray(terrVAO);
  gl.drawElements(gl.TRIANGLES,terrIdxCount,gl.UNSIGNED_INT,0);
  drawCalls++; triCount+=terrIdxCount/3;
  if(terrEdgeVAO&&terrEdgeIdxCount){
    gl.bindVertexArray(terrEdgeVAO);
    gl.drawElements(gl.TRIANGLES,terrEdgeIdxCount,gl.UNSIGNED_INT,0);
    drawCalls++;
  }
  gl.bindVertexArray(null);
}
/* Z-STRIP CULLING.
   The terrain was the one pass that submitted its whole grid every frame while
   every other pass was culled against camBounds — 320x320 quads, ~205k
   triangles, most of them behind the camera or past the far edge.

   This needs no chunking and no rebuild because the index buffer is already
   row-major in Z (buildTerrainMesh: `for z ... for x`), so grid row z occupies
   exactly [z*TGRID*6, (z+1)*TGRID*6). A contiguous span of rows is therefore a
   contiguous span of indices, and culling collapses to a different count and
   offset on the SAME single drawElements: one draw call, one buffer, no new
   vertices, and — crucially — no chunk seams, which is the objection the
   un-chunked design was written around (see the note at the top of this file).

   X is deliberately not culled. Doing so would need one draw per row, trading a
   free win for 320 draw calls. */
let terrRowsDrawn=0;
function drawTerrain(){
  if(terrainStale()&&!terrainSelfHeal()) return;
  if(!terrVAO) return;
  gl.bindVertexArray(terrVAO);
  let first=0, count=terrIdxCount;
  if(typeof camBounds==='function'){
    const B=camBounds(), cell=MAP/TGRID;
    /* Relief pad: terrain rises above the ground plane, so a hill outside the
       flat footprint can still be on screen. Max relief is about 78 world units
       and the shallowest pitch leans it ~45 units toward the camera; camBounds
       already carries +60, so two rows either side is comfortably conservative. */
    const pad=2;
    const z0=Math.max(0, Math.floor(B.y0/cell)-pad);
    const z1=Math.min(TGRID-1, Math.ceil(B.y1/cell)+pad);
    if(z1<z0) return;                       // wholly off the map
    first=z0*TGRID*6;
    count=(z1-z0+1)*TGRID*6;
    if(count>terrIdxCount-first) count=terrIdxCount-first;
  }
  if(count<=0) return;
  terrRowsDrawn=count/(TGRID*6);   // measured by the capture harness
  gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_INT,first*4);   // offset is in BYTES
  drawCalls++; triCount+=count/3;
}
/* CSM Z-strip only. Same row-major index math as drawTerrain. Does not
   heal, rebuild, or touch WATER_LIP / scars / wet-bowls. */
function csmTerrainSpan(y0,y1){
  if(!terrVAO||!terrIdxCount) return null;
  if(typeof terrainStale==='function'&&terrainStale()) return null;
  const cell=MAP/TGRID, pad=3;
  const z0=Math.max(0, Math.floor(y0/cell)-pad);
  const z1=Math.min(TGRID-1, Math.ceil(y1/cell)+pad);
  if(z1<z0) return null;
  let first=z0*TGRID*6;
  let count=(z1-z0+1)*TGRID*6;
  if(count>terrIdxCount-first) count=terrIdxCount-first;
  if(count<=0) return null;
  return {first,count};
}
function drawTerrainEdge(){
  if(!terrEdgeVAO||!terrEdgeIdxCount) return;
  gl.bindVertexArray(terrEdgeVAO);
  gl.drawElements(gl.TRIANGLES,terrEdgeIdxCount,gl.UNSIGNED_INT,0);
  drawCalls++; triCount+=terrEdgeIdxCount/3;
}
function drawWater(){
  const now=(typeof performance!=='undefined'?performance.now():0)*0.001;
  const dt=waterTickAt<0?0.016:Math.min(0.05,now-waterTickAt);
  waterTickAt=now;
  waterFloodTick(dt);
  if(!waterVAO||!waterIdxCount) return;
  const dummy=(typeof terrainTex!=='undefined'&&terrainTex)||null;
  const ht=(typeof heightTex!=='undefined'&&heightTex)||dummy;
  const ft=(typeof fogTex!=='undefined'&&fogTex)||dummy;
  const prog=ensureWaterProg();
  if(prog&&ht&&dummy){
    const nA=(typeof nightAmt==='function')?nightAmt():0;
    const S=(typeof sunFor==='function')?sunFor(nA):null;
    const lin=c=>[Math.pow(c[0],2.2),Math.pow(c[1],2.2),Math.pow(c[2],2.2)];
    const TH=waterTH||(typeof THEMES!=='undefined'&&THEMES[curTheme])||null;
    const kind=TH&&TH.water==='lava'?1:TH&&TH.water==='ice'?2:TH&&TH.water==='dusk'?3:0;
    const toLin3=(rgb)=>{
      const c=lin([rgb[0]/255,rgb[1]/255,rgb[2]/255]);
      return c;
    };
    gl.useProgram(prog);
    gl.uniformMatrix4fv(UW.uVP,false,matVP);
    gl.uniform3f(UW.uEye,eyeX,eyeY,eyeZ);
    if(S){
      gl.uniform3f(UW.uSun,S.dir[0],S.dir[1],S.dir[2]);
      const sc=lin(S.col), sk=lin(S.sky), sg=lin(S.gnd), sf=lin(S.fog);
      gl.uniform3f(UW.uSunC,sc[0],sc[1],sc[2]);
      gl.uniform3f(UW.uAmbSky,sk[0],sk[1],sk[2]);
      gl.uniform3f(UW.uAmbGnd,sg[0],sg[1],sg[2]);
      gl.uniform3f(UW.uFogC,sf[0],sf[1],sf[2]);
    }else{
      gl.uniform3f(UW.uSun,sunDir[0],sunDir[1],sunDir[2]);
      gl.uniform3f(UW.uSunC,0.9,0.85,0.7);
      gl.uniform3f(UW.uAmbSky,0.35,0.42,0.55);
      gl.uniform3f(UW.uAmbGnd,0.18,0.20,0.22);
      gl.uniform3f(UW.uFogC,0.30,0.36,0.45);
    }
    const now=(typeof performance!=='undefined'?performance.now():0)*0.001;
    gl.uniform1f(UW.uTime,now);
    gl.uniform1f(UW.uKind,kind);
    gl.uniform1f(UW.uLift,WATER_Y+0.55);
    gl.uniform1f(UW.uMap,MAP);
    gl.uniform1f(UW.uNight,nA);
    const amp=waterAmpNow();
    gl.uniform1f(UW.uAmp,amp);
    /* LOW keeps the draw and the 5-tap shore; HIGH adds the 8-neighborhood.
       Never 0 — a skipped water pass is a missing lake, not a budget win. */
    gl.uniform1f(UW.uDetail, amp>=0.85?2:amp>=0.55?1:0);
    const fl=typeof battlefieldWaterFlow==='function'?battlefieldWaterFlow():[1,0];
    if(UW.uFlow) gl.uniform2f(UW.uFlow,fl[0],fl[1]);
    if(UW.uWake) gl.uniform4fv(UW.uWake,wfxWake);
    if(UW.uRipple) gl.uniform4fv(UW.uRipple,wfxRipple);
    if(UW.uCrater) gl.uniform4fv(UW.uCrater,wfxCrater);
    if(UW.uWakeN) gl.uniform1i(UW.uWakeN,wfxWakeN);
    if(UW.uRippleN) gl.uniform1i(UW.uRippleN,wfxRippleN);
    if(UW.uCraterN) gl.uniform1i(UW.uCraterN,wfxCraterN);
    gl.uniform1f(UW.uFowOn,(typeof fogGameplayActive==='function'&&fogGameplayActive()&&!(typeof demoMode!=='undefined'&&demoMode)&&ft)?1:0);
    if(TH){
      const d=toLin3(TH.wDeep), s=toLin3(TH.wShal), f=toLin3(TH.foam);
      gl.uniform3f(UW.uDeepC,d[0],d[1],d[2]);
      gl.uniform3f(UW.uShalC,s[0],s[1],s[2]);
      gl.uniform3f(UW.uFoamC,f[0],f[1],f[2]);
    }else{
      gl.uniform3f(UW.uDeepC,0.004,0.025,0.065);
      gl.uniform3f(UW.uShalC,0.035,0.18,0.32);
      gl.uniform3f(UW.uFoamC,0.32,0.62,0.62);
    }
    gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D,ht);
    gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D,ft||dummy);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    /* Pull the sheet toward the camera so swell cannot z-fight the beach
       kerb. HIGH DPR does not add depth bits — the same 24-bit buffer — so
       the extra units are for the shallower slope at command zoom. Deep*amp
       already dies at the waterline; this is the residual 24-bit stitch.
       Cascaded shadow maps are documented at drawShadows, not implemented. */
    gl.polygonOffset(-6.2,-34);
    gl.bindVertexArray(waterVAO);
    gl.drawElements(gl.TRIANGLES,waterIdxCount,gl.UNSIGNED_INT,0);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindVertexArray(null);
    drawCalls++; triCount+=waterIdxCount/3;
    /* Restore the model program; additive FX bind progG next. */
    if(typeof prog3D!=='undefined'&&prog3D) gl.useProgram(prog3D);
    return;
  }
  gl.bindVertexArray(waterVAO);
  gl.drawElements(gl.TRIANGLES,waterIdxCount,gl.UNSIGNED_INT,0);
  drawCalls++; triCount+=waterIdxCount/3;
}

/* ============================================================================
   COMBAT-READABLE DESTRUCTION — takeover of gl.js deformTerrain / applyDeform
   ----------------------------------------------------------------------------
   applyGroundDestruction() was never recovered. Live path is still
   deformTerrain → deformQ → applyDeform → terrainDirty. Those live in gl.js;
   this file loads after and takes them over so combat policy stays next to
   the mesh (10 m cells). A 16-unit pock used to tint albedo and miss every
   vertex. Artillery at d=0.045 carved ~8 m — a stain, not a hole.

   CITYG>=1 stays non-soil: no dirt pocks, no berms, no orange stamps.
   Civic bowls still crater via applyDeform's existing 0.55× / WATER_H floor.
   Water reaction stays on waterReactDeform (already called from terrainDirty).
   waterFxCrater is the water-agent signal — do not stamp splash here.

   Quality reads GFX / qualityKey() only — no new META.settings keys.
   MEDIUM leftover cut: skip stampGroundScar when r<80 (Stormcaller lands
   ~70). shadeRegion + texSubImage still relight; HIGH keeps the scar.
   Civic never cheap / never defers. r<40 stays a subset of r<80.
   ============================================================================ */
const MF_DEFORM_RES=64;
const mfDeformT=new Float32Array(MF_DEFORM_RES*MF_DEFORM_RES);
const mfDeformD=new Float32Array(MF_DEFORM_RES*MF_DEFORM_RES);
const mfCraterSpriteT=new Float32Array(MF_DEFORM_RES*MF_DEFORM_RES);
/* Pending albedo window for MEDIUM/LOW r<80. Height + mesh already punched;
   one shade+texSubImage covers a Stormcaller volley instead of 16. */
let mfShadePend=null;
let mfScarSkipN=0, mfShadeFlushN=0, mfDeferShadeN=0;
let mfDeformClock=-1;
function mfDeformQual(){
  /* Prefer the live preset name. GFX.particles is the same dial when
     qualityKey has not been declared yet (menu diorama / early boot). */
  const q=typeof qualityKey==='function'?qualityKey()
    :(typeof GFX!=='undefined'&&GFX.particles>=1.4)?'cinematic'
    :(typeof GFX!=='undefined'&&GFX.particles<=0.55)?'low'
    :(typeof GFX!=='undefined'&&GFX.particles<0.9)?'medium':'high';
  if(q==='low') return {q,r:0.95,d:0.84,minR:42,pock:false,pockCool:99,drain:2,coalesce:1,berm:0,boost:1.12};
  if(q==='medium') return {q,r:1.14,d:0.96,minR:38,pock:true,pockCool:4.4,drain:3,coalesce:1,berm:1,boost:1.22};
  if(q==='cinematic') return {q,r:1.10,d:1.14,minR:22,pock:true,pockCool:1.5,drain:8,coalesce:0,berm:2,boost:1.38};
  return {q,r:1.04,d:1.06,minR:26,pock:true,pockCool:2.5,drain:6,coalesce:0,berm:2,boost:1.30};
}
function mfDeformResetIfNeeded(){
  const t=typeof stats!=='undefined'?stats.t:0;
  if(mfDeformClock<0||t<mfDeformClock-0.25||(t<1.2&&mfDeformClock>6)){
    mfDeformT.fill(-99); mfDeformD.fill(0); mfCraterSpriteT.fill(-99);
  }
  mfDeformClock=t;
}
function mfDeformCell(x,y){
  const gx=clamp((x/MAP*MF_DEFORM_RES)|0,0,MF_DEFORM_RES-1);
  const gy=clamp((y/MAP*MF_DEFORM_RES)|0,0,MF_DEFORM_RES-1);
  return gy*MF_DEFORM_RES+gx;
}
function mfCraterSpriteOk(x,y,s){
  mfDeformResetIfNeeded();
  const civic=typeof cityGroundAt==='function'&&cityGroundAt(x,y)>=1;
  const Q=mfDeformQual();
  /* Large civic records stay for the city-combat gate + 2D fallback.
     3D hud already refuses to draw the dirt atlas on CITYG>=1. */
  if(civic&&s<36) return false;
  if(!civic&&s<16) return false;
  if(!civic&&s<24&&(Q.q==='medium'||Q.q==='low')) return false;
  if(s>=48) return true;
  const i=mfDeformCell(x,y);
  const now=typeof stats!=='undefined'?stats.t:0;
  if(now-mfCraterSpriteT[i]<(Q.q==='medium'?3.4:1.5)) return false;
  mfCraterSpriteT[i]=now;
  return true;
}
function mfCombatDeformPlan(x,y,r,depth,kind){
  mfDeformResetIfNeeded();
  const Q=mfDeformQual();
  const civic=typeof cityGroundAt==='function'&&cityGroundAt(x,y)>=1;
  r=(r||20)*Q.r;
  depth=(depth||0.02)*Q.d;
  const pock=kind==='pock'||(kind!=='blast'&&r<34&&depth<0.046);
  if(pock&&!Q.pock) return null;
  if(pock&&civic) return null;
  if(civic&&r<28&&depth<0.05) return null;
  const i=mfDeformCell(x,y);
  const now=typeof stats!=='undefined'?stats.t:0;
  if(now-mfDeformT[i]>42) mfDeformD[i]=0;
  const cool=pock?Q.pockCool:(r<70?0.55:0.12);
  const budget=civic?0.16:0.34;
  const heavy=kind==='blast'||depth>=0.08||r>=70;
  if(!heavy&&now-mfDeformT[i]<cool){
    if(pock) return null;
    depth*=0.42;
  }
  if(!heavy&&mfDeformD[i]+depth>budget){
    if(pock) return null;
    depth=Math.max(0,budget-mfDeformD[i]);
    if(depth<0.012) return null;
  }
  if(!pock&&r<Q.minR) r=Q.minR;
  if(pock){
    r=Math.max(r,Q.q==='medium'?32:28);
    depth=Math.min(depth,Q.q==='medium'?0.034:0.028);
  }
  mfDeformT[i]=now;
  mfDeformD[i]=Math.min(budget,mfDeformD[i]+depth);
  return {x,y,r,d:depth,civic,pock};
}
function mfCoalesceDeformQ(){
  if(deformQ.length<3) return;
  const out=[], used=new Uint8Array(deformQ.length);
  for(let i=0;i<deformQ.length;i++){
    if(used[i]) continue;
    let A=deformQ[i];
    const civicA=typeof cityGroundAt==='function'&&cityGroundAt(A.x,A.y)>=1;
    for(let j=i+1;j<deformQ.length;j++){
      if(used[j]) continue;
      const B=deformQ[j];
      const civicB=typeof cityGroundAt==='function'&&cityGroundAt(B.x,B.y)>=1;
      if(civicA||civicB) continue;
      const d=Math.hypot(A.x-B.x,A.y-B.y);
      if(d>Math.max(A.r,B.r)*0.9+32) continue;
      used[j]=1;
      const wA=Math.max(0.001,A.d*A.r), wB=Math.max(0.001,B.d*B.r), w=wA+wB;
      A={x:(A.x*wA+B.x*wB)/w, y:(A.y*wA+B.y*wB)/w,
         r:Math.min(160,Math.max(A.r,B.r)+Math.min(d*0.4,22)),
         d:Math.min(0.24,A.d+B.d*0.52), k:A.k};
    }
    out.push(A);
  }
  deformQ.length=0;
  for(let i=0;i<out.length;i++) deformQ.push(out[i]);
}
if(typeof deformTerrain==='function'){
  deformTerrain=function(x,y,r,depth,kind){
    const plan=mfCombatDeformPlan(x,y,r,depth,kind);
    if(!plan) return;
    if(deformQ.length>=48){
      if(plan.d>=0.07||plan.r>=72){
        let worst=-1,wd=1e9;
        for(let i=0;i<deformQ.length;i++) if(deformQ[i].d<wd){wd=deformQ[i].d;worst=i;}
        if(worst>=0&&wd<plan.d) deformQ.splice(worst,1);
        else return;
      } else return;
    }
    deformQ.push({x:plan.x,y:plan.y,r:plan.r,d:plan.d});
  };
}
function mfNoteShadePend(D){
  const k=TS/MAP, cr=Math.max(5,D.r*k);
  const x0=clamp(Math.floor(D.x*k-cr*1.4)-3,0,TS-1);
  const y0=clamp(Math.floor(D.y*k-cr*1.4)-3,0,TS-1);
  const x1=clamp(Math.ceil(D.x*k+cr*1.4)+4,0,TS);
  const y1=clamp(Math.ceil(D.y*k+cr*1.4)+4,0,TS);
  if(!mfShadePend){ mfShadePend={x0,y0,x1,y1,t:0}; return; }
  const nx0=Math.min(mfShadePend.x0,x0), ny0=Math.min(mfShadePend.y0,y0);
  const nx1=Math.max(mfShadePend.x1,x1), ny1=Math.max(mfShadePend.y1,y1);
  /* Far shells start a new window so one AABB cannot cover half the map. */
  if(nx1-nx0>240||ny1-ny0>240){ mfFlushShadePend(); mfShadePend={x0,y0,x1,y1,t:0}; }
  else { mfShadePend.x0=nx0; mfShadePend.y0=ny0; mfShadePend.x1=nx1; mfShadePend.y1=ny1; }
}
function mfFlushShadePend(){
  const P=mfShadePend; mfShadePend=null;
  if(!P||typeof shadeRegion!=='function'||typeof gl==='undefined'||!gl) return;
  const sx=P.x0, sy=P.y0, w=P.x1-P.x0, h=P.y1-P.y0;
  if(w<=0||h<=0) return;
  shadeRegion(sx,sy,w,h,null,true);
  if(typeof relightCivicAlbedo==='function') relightCivicAlbedo(sx,sy,w,h);
  if(typeof stampHardscapeAlbedo==='function') stampHardscapeAlbedo(sx,sy,w,h);
  if(typeof paintPave==='function') paintPave(sx,sy,w,h);
  const tmp=document.createElement('canvas'); tmp.width=w; tmp.height=h;
  tmp.getContext('2d').drawImage(terrainCanvas,sx,sy,w,h,0,0,w,h);
  gl.bindTexture(gl.TEXTURE_2D,terrainTex);
  gl.texSubImage2D(gl.TEXTURE_2D,0,sx,sy,gl.RGBA,gl.UNSIGNED_BYTE,tmp);
  gl.bindTexture(gl.TEXTURE_2D,atlasTex);
  mipDirty=true;
  mfShadeFlushN++;
}
if(typeof applyDeform==='function'){
  const _mfApplyDeform=applyDeform;
  applyDeform=function(D){
    const civic=typeof cityGroundAt==='function'&&cityGroundAt(D.x,D.y)>=1;
    if(civic){ _mfApplyDeform(D); return; }
    const Q=mfDeformQual();
    /* MEDIUM/LOW: skip the lobe albedo stamp under r=80. Stormcaller
       shells land ~70; r<40 stays skipped as a subset. Bowl still
       SCORCH + mesh. HIGH/CINEMATIC always stamp. Civic never cheap. */
    const cheap=(Q.q==='medium'||Q.q==='low')&&D.r<80;
    if(cheap) mfScarSkipN++;
    _mfApplyDeform({x:D.x,y:D.y,r:D.r,d:D.d*Q.boost,k:D.k,cheap:cheap?1:0,deferShade:cheap?1:0});
    if(cheap){ mfDeferShadeN++; mfNoteShadePend(D); }
  };
}
if(typeof addRelief==='function'){
  const _mfAddRelief=addRelief;
  addRelief=function(x,y,r,depth,kind){
    const Q=mfDeformQual();
    if(Q.berm<=0) return;
    if(Q.berm===1&&r<38) return;
    _mfAddRelief(x,y,r,depth,kind);
  };
}
if(typeof processDeforms==='function'){
  processDeforms=function(){
    const Q=mfDeformQual();
    if(Q.coalesce&&deformQ.length>4) mfCoalesceDeformQ();
    let n=deformQ.length>(Q.q==='medium'?8:12)?Q.drain:1;
    if(Q.q==='cinematic'&&deformQ.length>6) n=Math.max(n,2);
    while(n-->0&&deformQ.length) applyDeform(deformQ.shift());
  };
}
if(typeof deformMaintain==='function'){
  const _mfDeformMaintain=deformMaintain;
  deformMaintain=function(dt){
    if(mfShadePend){
      mfShadePend.t+=dt;
      if(mfShadePend.t>=0.20) mfFlushShadePend();
    }
    _mfDeformMaintain(dt);
  };
}

