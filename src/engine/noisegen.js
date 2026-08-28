/* ============================================================================
   PROCEDURAL NOISE + 4K TEXTURE GENERATION SYSTEM
   ----------------------------------------------------------------------------
   MASSFRONT's mobile WebGL2 target cannot ship 4K authored atlases in the APK,
   but it CAN generate them on-device from compact math. This module produces
   deterministic, tileable, high-resolution textures for noise, shockwaves,
   energy fields, terrain detail and explosion falloffs.

   Every generator returns either a Float32Array/RGBA buffer OR uploads directly
   to a WebGL texture. All functions are GPU-friendly (no per-pixel allocation
   in the hot path) and quality-aware: HIGH/CINEMATIC gets 2K/4K, MEDIUM gets
   1K, LOW falls back to existing authored sheets.

   INTEGRATION CONTRACT
     mfNoiseInit()                once after gl is available
     mfNoiseUpload(name, opts)    -> WebGLTexture (cached)
     mfNoiseCanvas(name, opts)    -> HTMLCanvasElement (for canvas paths)
     mfNoiseQuality()             -> 'low'|'medium'|'high'|'cinematic'
     mfNoiseSize()                -> pixel dimension for current quality
     mfNoiseGLReset()             call on context rebuild

   Globals intentionally avoided: do not declare `const NOISE_*` at top level;
   the module prefix `MF_NG_` is used for internal constants only.
   ============================================================================ */
(function(){
'use strict';

const MF_NG_CACHE = new Map();
const MF_NG_TEX_CACHE = new Map();
let mfNgEpoch = -1;

function mfNoiseQuality(){
  try{
    if(typeof qualityKey==='function') return qualityKey();
    if(typeof META!=='undefined'&&META.settings&&META.settings.quality) return META.settings.quality;
  }catch(_){}
  return 'high';
}

/* Cap generated size by quality. 4K procedural generation hitches too hard on
   a mobile CPU, so CINEMATIC caps at 2K — still 4x the legacy authored sheets
   and visibly crisp at zoom. HIGH shares the 2K sheet; MEDIUM gets 1K. */
function mfNoiseSize(){
  const q=mfNoiseQuality();
  return q==='low'?256:q==='medium'?1024:2048;
}

function mfNoiseGLReset(){
  const glCtx=(typeof gl!=='undefined'&&gl&&gl.deleteTexture)?gl:null;
  if(glCtx){
    for(const t of MF_NG_TEX_CACHE.values()){ try{ glCtx.deleteTexture(t); }catch(_){} }
  }
  MF_NG_TEX_CACHE.clear();
  MF_NG_CACHE.clear();
  mfNgEpoch=-1;
}

function mfNoiseCtxCheck(){
  const ep=(typeof glEpoch!=='undefined')?glEpoch:0;
  if(mfNgEpoch!==ep) mfNoiseGLReset();
  mfNgEpoch=ep;
}

/* Deterministic seeded random for reproducible worlds. */
function mfNgHash(seed){
  let h=seed|0;
  h=((h>>>16)^h)*0x45d9f3b; h=((h>>>16)^h)*0x45d9f3b; h=(h>>>16)^h;
  return (h>>>0)/4294967296;
}
/* Permutations are immutable for a seed. The procedural texture builders call
   FBM once per texel, so rebuilding this table there turned a 2K material into
   millions of short-lived allocations and a minute-long boot on some systems. */
const MF_NG_PERM_CACHE=new Map();
function mfNgPerm(seed){
  seed=seed|0;
  const cached=MF_NG_PERM_CACHE.get(seed);
  if(cached) return cached;
  const p=new Uint8Array(512);
  for(let i=0;i<256;i++) p[i]=i;
  let s=seed|0;
  for(let i=255;i>0;i--){
    s=((s*1664525+1013904223)|0);
    const j=(s>>>0)%(i+1);
    const t=p[i];p[i]=p[j];p[j]=t;
  }
  for(let i=0;i<256;i++) p[i+256]=p[i];
  MF_NG_PERM_CACHE.set(seed,p);
  return p;
}

/* Gradient table for value/Perlin noise. */
const MF_NG_GRAD3=[
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
];

function mfNgFade(t){ return t*t*t*(t*(t*6-15)+10); }
function mfNgSmoothstep(edge0,edge1,x){
  const t=Math.max(0,Math.min(1,(x-edge0)/(edge1-edge0)));
  return t*t*(3-2*t);
}
function mfNgLerp(a,b,t){ return a+(b-a)*t; }
function mfNgDot(g,x,y){ return g[0]*x+g[1]*y; }

/* 2D Perlin-like noise with a fixed permutation. Tileable when sampled at
   integer boundaries; for seamless tiles we wrap the lattice with the perm. */
function mfNgNoise2D(x,y,perm){
  const X=(Math.floor(x)&255), Y=(Math.floor(y)&255);
  const xf=x-Math.floor(x), yf=y-Math.floor(y);
  const u=mfNgFade(xf), v=mfNgFade(yf);
  const A=perm[X]+Y, B=perm[X+1]+Y;
  const g1=MF_NG_GRAD3[perm[A]%12], g2=MF_NG_GRAD3[perm[B]%12];
  const g3=MF_NG_GRAD3[perm[A+1]%12], g4=MF_NG_GRAD3[perm[B+1]%12];
  const n1=mfNgDot(g1,xf,yf);
  const n2=mfNgDot(g2,xf-1,yf);
  const n3=mfNgDot(g3,xf,yf-1);
  const n4=mfNgDot(g4,xf-1,yf-1);
  return mfNgLerp(mfNgLerp(n1,n2,u),mfNgLerp(n3,n4,u),v);
}

/* Fractal Brownian Motion: layered octaves with lacunarity and gain. */
function mfNgFBM(x,y,octaves,seed,opts){
  const o=opts||{};
  const lac=o.lac||2.0, gain=o.gain||0.5;
  const perm=mfNgPerm(seed||123);
  let amp=0.5, freq=o.freq||1.0, sum=0, norm=0;
  for(let i=0;i<octaves;i++){
    sum+=amp*mfNgNoise2D(x*freq,y*freq,perm);
    norm+=amp;
    amp*=gain; freq*=lac;
  }
  return sum/norm;
}

/* Ridged multifractal: |noise| inverted, good for mountains/craters. */
function mfNgRidged(x,y,octaves,seed,opts){
  const o=opts||{};
  const lac=o.lac||2.0, gain=o.gain||0.55, off=o.offset||0.65;
  const perm=mfNgPerm(seed||456);
  let amp=0.5, freq=o.freq||1.0, sum=0, norm=0;
  for(let i=0;i<octaves;i++){
    const n=Math.abs(mfNgNoise2D(x*freq,y*freq,perm));
    sum+=amp*(off-n)*(off-n);
    norm+=amp;
    amp*=gain; freq*=lac;
  }
  return Math.max(0,Math.min(1,sum/norm));
}

/* Voronoi/Worley cellular noise: distance to nearest feature point.
   Returns [F1, F2, cell-id] for use in crack/energy patterns. */
function mfNgWorley(x,y,seed,opts){
  const o=opts||{};
  const freq=o.freq||4.0;
  const fx=x*freq, fy=y*freq;
  const ix=Math.floor(fx), iy=Math.floor(fy);
  let f1=1e9, f2=1e9;
  let cid=0;
  for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++){
    const cx=ix+i, cy=iy+j;
    const h=mfNgHash((cx*73856093)^(cy*19349663)^(seed|0)*83492791);
    const h2=mfNgHash((h*4294967296)|0);
    const px=cx+h, py=cy+h2;
    const d2=(fx-px)*(fx-px)+(fy-py)*(fy-py);
    if(d2<f1){ f2=f1; f1=d2; cid=(h*255)|0; }
    else if(d2<f2){ f2=d2; }
  }
  return [Math.sqrt(f1), Math.sqrt(f2), cid];
}

/* Swirly domain-warped FBM: essential for alien terrain and fluid energy. */
function mfNgWarpFBM(x,y,octaves,seed,opts){
  const o=opts||{};
  const warp=o.warp||0.65, scale=o.scale||1.0;
  const qx=mfNgFBM(x+0.0,y+0.0,octaves,seed,{freq:scale});
  const qy=mfNgFBM(x+5.2,y+1.3,octaves,seed+1,{freq:scale});
  return mfNgFBM(x+warp*qx,y+warp*qy,octaves,seed+2,{freq:scale});
}

/* ============================================================================
   GENERATORS
   Each returns a Uint8Array RGBA buffer of size*size.
   ============================================================================ */
const MF_NG_GENERATORS={
  /* Neutral mono grain: bump/normal/roughness source for materials. */
  grain:function(size,seed,opts){
    const o=opts||{};
    const buf=new Uint8Array(size*size*4);
    const oct=o.octaves||6;
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const u=x/size, v=y/size;
      const n=mfNgFBM(u,v,oct,seed,{freq:o.freq||8});
      const v2=(n*0.5+0.5)*255;
      const i=(y*size+x)*4;
      buf[i]=buf[i+1]=buf[i+2]=v2|0;
      buf[i+3]=255;
    }
    return buf;
  },

  /* Shockwave ring: radial falloff with high-frequency detail so the ring
     never looks like a smooth gradient at 4K. */
  shockwave:function(size,seed,opts){
    const o=opts||{};
    const buf=new Uint8Array(size*size*4);
    const center=size/2;
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const dx=x-center+0.5, dy=y-center+0.5;
      const r=Math.hypot(dx,dy)/(size*0.5);
      const ang=Math.atan2(dy,dx);
      /* Ring body: sharp inner edge, soft outer tail. */
      const ring=Math.exp(-Math.pow((r-0.55)*14,2));
      const secondary=Math.exp(-Math.pow((r-0.72)*22,2))*0.45;
      const detail=0.5+0.5*mfNgFBM(ang*8,r*12,3,seed,{freq:2});
      const a=Math.min(255,(ring+secondary)*detail*255);
      const i=(y*size+x)*4;
      const hot=o.hot||[255,230,180];
      buf[i]=hot[0]; buf[i+1]=hot[1]; buf[i+2]=hot[2];
      buf[i+3]=a|0;
    }
    return buf;
  },

  /* Energy field: tileable plasma suitable for forcefields and shields. */
  energy:function(size,seed,opts){
    const o=opts||{};
    const buf=new Uint8Array(size*size*4);
    const col=o.color||[90,210,255];
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const u=x/size, v=y/size;
      const n=mfNgWarpFBM(u,v,4,seed,{freq:o.freq||6,warp:o.warp||0.8});
      const cell=mfNgWorley(u,v,seed+7,{freq:o.freq||5});
      const veins=Math.max(0,1.0-cell[0]*3.5);
      const a=(0.12+0.88*veins)*(0.5+0.5*n)*255;
      const i=(y*size+x)*4;
      buf[i]=(col[0]*n)|0;
      buf[i+1]=(col[1]*n)|0;
      buf[i+2]=(col[2]*n)|0;
      buf[i+3]=Math.min(255,a)|0;
    }
    return buf;
  },

  /* Detonation falloff: radial with turbulent edge for explosion alpha masks. */
  blast:function(size,seed,opts){
    const o=opts||{};
    const buf=new Uint8Array(size*size*4);
    const c=size/2;
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const dx=x-c+0.5, dy=y-c+0.5;
      const r=Math.hypot(dx,dy)/(size*0.5);
      const ang=Math.atan2(dy,dx);
      const turb=0.5+0.5*mfNgFBM(ang*6,r*8,3,seed,{freq:2});
      const core=Math.max(0,1.0-mfNgSmoothstep(0.0,0.45,r));
      const body=Math.max(0,1.0-mfNgSmoothstep(0.25,0.85,r))*turb;
      const a=(core*0.8+body*0.5)*255;
      const i=(y*size+x)*4;
      buf[i]=255; buf[i+1]=230; buf[i+2]=180;
      buf[i+3]=Math.min(255,a)|0;
    }
    return buf;
  },

  /* Alien terrain detail: ridged+FBM mix, tileable. */
  terrain:function(size,seed,opts){
    const o=opts||{};
    const buf=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const u=x/size, v=y/size;
      const rid=mfNgRidged(u,v,5,seed,{freq:o.freq||4});
      const fbm=mfNgFBM(u,v,4,seed+3,{freq:o.freq||6});
      const w=mfNgWorley(u,v,seed+5,{freq:o.freq||3});
      const val=(rid*0.55+fbm*0.35+w[0]*0.1)*255;
      const i=(y*size+x)*4;
      buf[i]=buf[i+1]=buf[i+2]=Math.min(255,val)|0;
      buf[i+3]=255;
    }
    return buf;
  },

  /* Smoke/dust volume mask: soft billows, low frequency. */
  smoke:function(size,seed,opts){
    const o=opts||{};
    const buf=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const u=x/size, v=y/size;
      const n=mfNgWarpFBM(u,v,5,seed,{freq:o.freq||3,warp:o.warp||1.2});
      const a=(0.5+0.5*n)*255;
      const i=(y*size+x)*4;
      const grey=o.grey||[160,150,138];
      buf[i]=grey[0]; buf[i+1]=grey[1]; buf[i+2]=grey[2];
      buf[i+3]=a|0;
    }
    return buf;
  }
};

/* Normal map derivation from a grey buffer. */
function mfNgDerivNormal(buf,size,strength){
  const out=new Uint8Array(size*size*4);
  const get=(x,y)=>{
    x=(x+size)%size; y=(y+size)%size;
    return buf[(y*size+x)*4]/255;
  };
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const gx=(get(x+1,y-1)+2*get(x+1,y)+get(x+1,y+1))-(get(x-1,y-1)+2*get(x-1,y)+get(x-1,y+1));
    const gy=(get(x-1,y+1)+2*get(x,y+1)+get(x+1,y+1))-(get(x-1,y-1)+2*get(x,y-1)+get(x+1,y-1));
    let nx=-gx*strength, ny=-gy*strength, nz=1;
    const l=Math.hypot(nx,ny,nz)||1;
    const i=(y*size+x)*4;
    out[i]=(nx/l*0.5+0.5)*255;
    out[i+1]=(ny/l*0.5+0.5)*255;
    out[i+2]=(nz/l*0.5+0.5)*255;
    out[i+3]=255;
  }
  return out;
}

/* Public API: generate buffer. */
function mfNoiseBuffer(name, opts){
  mfNoiseCtxCheck();
  const o=opts||{};
  const size=o.size||mfNoiseSize();
  const seed=o.seed||0;
  const gen=MF_NG_GENERATORS[name];
  if(!gen) return null;
  const key=name+'|'+size+'|'+seed+'|'+(o.hot?o.hot.join(','):'')+'|'+(o.color?o.color.join(','):'');
  if(MF_NG_CACHE.has(key)) return MF_NG_CACHE.get(key);
  const buf=gen(size,seed,o);
  MF_NG_CACHE.set(key,buf);
  return buf;
}

/* Public API: generate or return cached WebGL texture. */
function mfNoiseUpload(name, opts){
  mfNoiseCtxCheck();
  const glCtx=(typeof gl!=='undefined'&&gl&&gl.getParameter)?gl:null;
  if(!glCtx) return null;
  const o=opts||{};
  const size=o.size||mfNoiseSize();
  const seed=o.seed||0;
  const key=name+'|'+size+'|'+seed+'|'+(o.hot?o.hot.join(','):'')+'|'+(o.color?o.color.join(','):'');
  if(MF_NG_TEX_CACHE.has(key)) return MF_NG_TEX_CACHE.get(key);
  const buf=mfNoiseBuffer(name,o);
  if(!buf) return null;
  const wasActive=glCtx.getParameter(glCtx.ACTIVE_TEXTURE);
  const wasTex=glCtx.getParameter(glCtx.TEXTURE_BINDING_2D);
  const wasAlign=glCtx.getParameter(glCtx.UNPACK_ALIGNMENT);
  const wasFlip=glCtx.getParameter(glCtx.UNPACK_FLIP_Y_WEBGL);
  let tex=null;
  try{
    tex=glCtx.createTexture();
    glCtx.activeTexture(glCtx.TEXTURE0);
    glCtx.bindTexture(glCtx.TEXTURE_2D,tex);
    glCtx.pixelStorei(glCtx.UNPACK_ALIGNMENT,1);
    glCtx.pixelStorei(glCtx.UNPACK_FLIP_Y_WEBGL,false);
    glCtx.texImage2D(glCtx.TEXTURE_2D,0,glCtx.RGBA,size,size,0,glCtx.RGBA,glCtx.UNSIGNED_BYTE,buf);
    glCtx.texParameteri(glCtx.TEXTURE_2D,glCtx.TEXTURE_MIN_FILTER,glCtx.LINEAR_MIPMAP_LINEAR);
    glCtx.texParameteri(glCtx.TEXTURE_2D,glCtx.TEXTURE_MAG_FILTER,glCtx.LINEAR);
    glCtx.texParameteri(glCtx.TEXTURE_2D,glCtx.TEXTURE_WRAP_S,glCtx.REPEAT);
    glCtx.texParameteri(glCtx.TEXTURE_2D,glCtx.TEXTURE_WRAP_T,glCtx.REPEAT);
    glCtx.generateMipmap(glCtx.TEXTURE_2D);
    MF_NG_TEX_CACHE.set(key,tex);
  }catch(e){
    if(tex){ try{glCtx.deleteTexture(tex);}catch(_){} tex=null; }
    console.warn('mfNoiseUpload failed',name,e);
  }finally{
    glCtx.pixelStorei(glCtx.UNPACK_ALIGNMENT,wasAlign);
    glCtx.pixelStorei(glCtx.UNPACK_FLIP_Y_WEBGL,wasFlip);
    glCtx.bindTexture(glCtx.TEXTURE_2D,wasTex);
    glCtx.activeTexture(wasActive);
  }
  return tex;
}

/* Public API: generate or return cached HTMLCanvasElement. */
function mfNoiseCanvas(name, opts){
  const buf=mfNoiseBuffer(name,opts);
  if(!buf) return null;
  const size=opts&&opts.size?opts.size:mfNoiseSize();
  const c=document.createElement('canvas');
  c.width=size; c.height=size;
  const ctx=c.getContext('2d');
  const img=ctx.createImageData(size,size);
  img.data.set(buf);
  ctx.putImageData(img,0,0);
  return c;
}

/* Expose globally. */
window.mfNoiseQuality=mfNoiseQuality;
window.mfNoiseSize=mfNoiseSize;
window.mfNoiseBuffer=mfNoiseBuffer;
window.mfNoiseUpload=mfNoiseUpload;
window.mfNoiseCanvas=mfNoiseCanvas;
window.mfNoiseGLReset=mfNoiseGLReset;
window.MF_NG_GENERATORS=MF_NG_GENERATORS; // for diagnostics
window.mfNgFBM=mfNgFBM;
window.mfNgRidged=mfNgRidged;
window.mfNgWorley=mfNgWorley;
window.mfNgWarpFBM=mfNgWarpFBM;
window.mfNgNoise2D=mfNgNoise2D;
window.mfNgPerm=mfNgPerm;
})();
