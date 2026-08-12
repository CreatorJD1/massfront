;
;
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
   from the heightfield, but deformTerrain rewrites that heightfield all match
   long — craters, superweapon pits, singularity collapses. Nothing rebuilt the
   sheet, so a crater blasted below sea level stayed a dry hole in the middle of
   a lake. Keep the coverage map and the theme that built it, flag a mismatch
   from terrainDirty (the single choke point every deform already passes
   through), and rebuild on the maintenance tick rather than mid-explosion. */
let waterNeed=null, waterTH=null, waterDirty=false, waterRebuildT=0, waterBaseCol=null;
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
function terrainWorldH(ix,iy){
  const h=heightF[iy*TS+ix];
  return h<=WATER_H ? Math.max(SEABED,(h-WATER_H)*HSCALE*1.4) : (h-WATER_H)*HSCALE;
}
function uploadHeightTex(x0,y0,x1,y1){
  if(!heightF||typeof gl==='undefined'||!gl) return;
  const full=x0==null;
  if(full){ x0=0; y0=0; x1=TS; y1=TS; }
  x0=clamp(x0|0,0,TS); y0=clamp(y0|0,0,TS); x1=clamp(Math.ceil(x1),0,TS); y1=clamp(Math.ceil(y1),0,TS);
  const w=x1-x0, h=y1-y0; if(w<=0||h<=0) return;
  const buf=new Float32Array(w*h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) buf[y*w+x]=terrainWorldH(x0+x,y0+y);
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
  gl.bindTexture(gl.TEXTURE_2D,null);
}
function terrainGLReset(){
  heightTex=null;
  terrHealTries=0;                       // a new loss deserves fresh attempts
  terrEpoch=-1;
  terrVAO=terrVBO=terrIBO=null;
  terrEdgeVAO=terrEdgeVBO=terrEdgeIBO=null;
  waterVAO=waterVBO=waterIBO=null;
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
  return h<=WATER_H ? Math.max(SEABED,(h-WATER_H)*HSCALE*1.4) : (h-WATER_H)*HSCALE;
}
const WATER_Y=0;                     // sea level sits at world y=0 by construction

/* Material colour for a point, from height and slope. Slope is what sells a
   landscape: flat ground is soil or grass, anything steep is exposed rock, and
   the transition band between them is where a hillside reads as a hillside. */
function terrColor(h,slope,TH,wx,wy,out){
  const LP=(a,b,t)=>[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
  let c;
  if(h<WATER_H-0.02)      c=LP(TH.wDeep,TH.wShal,clamp((h-0.18)/0.14,0,1));
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
  const TH=THEMES[themeKey||curTheme]||THEMES.verdant;
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
  const peakCol=curTheme==='arctic'?[238,244,252]:curTheme==='ashland'?[66,50,44]:
                curTheme==='vespera'?[150,112,152]:[120,123,130];
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
  TH=TH||THEMES[curTheme]||THEMES.verdant;
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
    if(typeof ROADG!=='undefined'&&ROADG&&ROADG[rx*PGS+ry]){
      mid=getRoadTile(ry,rx);
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
function terrainDirty(wx,wy,rad){
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
  /* Did this deform change what is underwater? Only the touched window is
     scanned, and only against the coverage the current sheet was built from,
     so ordinary shell craters on dry high ground cost four comparisons and
     never trigger a rebuild. */
  if(waterNeed&&!waterDirty){
    const cx0=clamp(gx0,0,TGRID),cx1=clamp(gx1,0,TGRID),cz0=clamp(gz0,0,TGRID),cz1=clamp(gz1,0,TGRID);
    for(let z=cz0;z<=cz1&&!waterDirty;z++) for(let x=cx0;x<=cx1;x++){
      const wxv=x*cell, wyv=z*cell;
      const hx=clamp(Math.round(wxv/MAP*(TS-1)),0,TS-1), hy=clamp(Math.round(wyv/MAP*(TS-1)),0,TS-1);
      const wet=heightF[hy*TS+hx]<WATER_H+0.012?1:0;
      if(wet!==waterNeed[z*TVERT+x]){ waterDirty=true; break; }
    }
  }
}
/* Rebuild the flooded sheet at most a few times a second: a bombardment that
   opens twenty craters in one second pays for one rebuild, not twenty. */
function waterMaintain(dt){
  if(waterRebuildT>0) waterRebuildT-=dt;
  if(!waterDirty||waterRebuildT>0||!waterTH||typeof gl==='undefined'||!gl) return;
  waterRebuildT=0.45;
  buildWaterMesh(waterTH);
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
      if(heightF[hy*TS+hx]<WATER_H+0.012){ wet=true; break; }
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
    verts.push(wx,WATER_Y,wy, 0,1,0, r,g,b, wx*0.02,wy*0.02, MAT.CRYST);
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
    /* REBUILD ATOMICALLY. A crater-flood rebuild changes both vertex and index
       counts; re-uploading into the live VAO let stale indices read the wrong
       vertex array — undefined behaviour that drew enormous stretched sheets
       off the map. Drop and recreate: all-or-nothing. */
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
/* Animate the surface: two crossing wave trains, with normals recomputed from
   the same functions so crests actually catch the light. Only run when water
   is on screen and only every few frames — it's a nicety, not a necessity. */
let wavePhase=0;
function animateWater(t){
  if(!waterVerts||!waterIdxCount) return;
  wavePhase=t;
  const n=waterVerts.length/12;
  /* WATER OBEYS FOG OF WAR TOO. The sheet is drawn by the MODEL program, which
     has no fog sampler, so an unscouted lake stayed fully legible inside the
     black — you could read the whole coastline of a map you had never visited.
     Colour is already rewritten here every few ticks, so the darkening rides
     along for free instead of costing a new uniform, sampler or draw call.
     Base colours are kept in waterBaseCol so the dimming can never compound. */
  const fogging=(typeof fogGameplayActive==='function')&&fogGameplayActive()&&(typeof covAt==='function');
  if(fogging&&(!waterBaseCol||waterBaseCol.length!==waterVerts.length)){
    waterBaseCol=new Float32Array(waterVerts.length);
    waterBaseCol.set(waterVerts);
  }
  /* Fog turning OFF has to give the colour back. Without this the last dimmed
     values simply stayed, so revealing the map (or a replay/observer view) left
     every previously-unscouted lake rendered as a black hole in the ground. */
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
    const w1=Math.sin(x*0.021+t*1.15)*1.5, w2=Math.sin(z*0.017-t*0.86)*1.2;
    const w3=Math.sin((x+z)*0.033+t*1.9)*0.7;
    waterVerts[o+1]=WATER_Y+w1+w2+w3;
    const dx=Math.cos(x*0.021+t*1.15)*0.021*1.5+Math.cos((x+z)*0.033+t*1.9)*0.033*0.7;
    const dz=Math.cos(z*0.017-t*0.86)*0.017*1.2+Math.cos((x+z)*0.033+t*1.9)*0.033*0.7;
    const l=Math.hypot(-dx,1,-dz)||1;
    waterVerts[o+3]=-dx/l; waterVerts[o+4]=1/l; waterVerts[o+5]=-dz/l;
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
function drawTerrain(){
  if(terrainStale()&&!terrainSelfHeal()) return;
  if(!terrVAO) return;
  gl.bindVertexArray(terrVAO);
  gl.drawElements(gl.TRIANGLES,terrIdxCount,gl.UNSIGNED_INT,0);
  drawCalls++; triCount+=terrIdxCount/3;
}
function drawTerrainEdge(){
  if(!terrEdgeVAO||!terrEdgeIdxCount) return;
  gl.bindVertexArray(terrEdgeVAO);
  gl.drawElements(gl.TRIANGLES,terrEdgeIdxCount,gl.UNSIGNED_INT,0);
  drawCalls++; triCount+=terrEdgeIdxCount/3;
}
function drawWater(){
  if(!waterVAO||!waterIdxCount) return;
  gl.bindVertexArray(waterVAO);
  gl.drawElements(gl.TRIANGLES,waterIdxCount,gl.UNSIGNED_INT,0);
  drawCalls++; triCount+=waterIdxCount/3;
}

