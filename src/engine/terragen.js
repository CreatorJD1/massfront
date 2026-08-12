;
;
/* ============================================================================
   TERRAGEN — landform structure: ridges, drainage, coastlines
   ----------------------------------------------------------------------------
   The base heightfield is five octaves of value noise. Value noise makes
   BLOBS: smooth, rounded, and — the actual complaint — completely without
   structure. Real terrain is not noise, it is noise that WATER HAS RUN OVER.
   Ridgelines radiate from massifs, valleys branch upstream into dendritic
   networks, coasts fray where the sea works into soft rock. None of that is
   in a sum of octaves, at any amplitude, ever.

   Three passes add it, cheapest and highest-payoff first:

     1. RIDGED MULTIFRACTAL (Musgrave's fold: 1-|n|, squared, each octave
        weighted by the previous one's signal) gives continuous crest lines
        instead of scattered bumps. Region-masked by a very low frequency
        field so ranges belong to parts of the map rather than covering it.

     2. FLOW ACCUMULATION (D8 steepest-descent, height-ordered) computes how
        much water crosses every cell, then carves channel depth from
        log(accumulation). This is where the dendritic branching comes from,
        and it is ~100x cheaper than droplet erosion for that specific look:
        one O(N) bucket sort and two O(N) sweeps.

     3. COAST WARP domain-warps the sample position in a band around sea
        level, so shorelines fray into inlets and headlands without touching
        height anywhere inland.

   WHY IT RUNS ON A 512 GRID. The mesh is TGRID=320 (10 world units a cell)
   and terrainH box-blurs +-7 units, so nothing finer than roughly 25-30 world
   units can reach the screen as geometry no matter how fine the field is. A
   512 grid is 6.25 units a cell — already four times finer than the mesh can
   show. Working there costs a sixteenth of 2048 and loses nothing visible.

   WHY IT RETURNS A DELTA. The 2048 field carries a deliberate near-Nyquist
   octave that the per-pixel normal sheet displays. Upsampling absolute heights
   from 512 would erase it. Every pass writes into a delta grid instead, and
   only the delta is bilinearly upsampled and added — large-scale structure
   arrives, fine detail survives untouched.

   HARD RULES, both learned from what this codebase already guarantees:
     - Determinism. A private LCG, seeded from the map seed. Never the shared
       global _seed (planDistricts and friends run after us on that stream)
       and never Math.random(): context-loss rebuilds and map previews must
       reproduce the same ground, byte for byte.
     - No new water. Passability, the naval mask, water-mesh coverage and
       battlefieldNavalEnabled all key off WATER_H. A carve that drops dry
       land below sea level would silently punch holes in pathing and flood
       maps authored dry. Any cell that started at or above WATER_H is
       clamped so it can never finish below it.
   ============================================================================ */

const TERRA={
  work:512,                 // erosion grid resolution (6.25 world units a cell)
  ridgeOct:5,
  ridgeLac:2.05,            // not 2.0: exact doubling re-aligns octave harmonics
  ridgeGain:2.05,
  ridgeFreq:9.5,            // lattice cells across the map at octave 0
  regionFreq:2.4,           // range-vs-lowland mask: 2-3 blobs across the map
  regionLo:0.46, regionHi:0.78,
  streamMin:55,             // contributing cells before a channel exists
  carve:0.0132,             // height units per log-unit of accumulation
  carveMax:0.055,           // ~6.5 world units: deep enough to read, not a canyon
  coastBand:0.055,          // height units either side of sea level that warp
  coastWarp:46,             // world units a shoreline can wander
  ceiling:0.93,             // crests must not clip into flat-topped mesas
  regionBias:0.0            // dev tool: shifts how much of the map is mountainous
};

/* Private deterministic stream. Kept off the global LCG on purpose. */
function terraRng(seed){
  let s=(seed|0)||1;
  return ()=>{ s=(Math.imul(s,1664525)+1013904223)|0; return ((s>>>9)&0x7fffff)/0x800000; };
}
/* Value-noise lattice with wrap, matching the engine's existing sampler so the
   two stacks agree about what a "cell" is. */
function terraLattice(rand,n){
  const g=new Float32Array((n+1)*(n+1));
  for(let i=0;i<g.length;i++) g[i]=rand();
  return g;
}
function terraNoise(g,n,x,y){
  let xi=Math.floor(x), yi=Math.floor(y);
  const fx=x-xi, fy=y-yi;
  xi=((xi%n)+n)%n; yi=((yi%n)+n)%n;
  const x1=(xi+1)%n, y1=(yi+1)%n;
  const sx=fx*fx*(3-2*fx), sy=fy*fy*(3-2*fy);
  const a=g[yi*(n+1)+xi],  b=g[yi*(n+1)+x1];
  const c=g[y1*(n+1)+xi],  d=g[y1*(n+1)+x1];
  return (a+(b-a)*sx)+((c+(d-c)*sx)-(a+(b-a)*sx))*sy;
}
/* Musgrave ridged multifractal. The fold (1-|n|) puts a crest where the noise
   crosses zero, which is a LINE rather than a peak — that is the whole reason
   ridges come out continuous. Squaring sharpens it; weighting each octave by
   the previous signal keeps detail on the ridges and off the valley floors,
   which is what stops it reading as noise-with-creases. */
function terraRidged(g,n,x,y,oct,lac,gain){
  let sum=0, freq=1, amp=0.5, weight=1;
  for(let i=0;i<oct;i++){
    const sig0=1-Math.abs(terraNoise(g,n,x*freq,y*freq)*2-1);
    let sig=sig0*sig0*weight;
    sum+=sig*amp;
    weight=sig*gain; if(weight>1) weight=1; else if(weight<0) weight=0;
    freq*=lac; amp*=0.5;
  }
  return sum;
}

/* ---------------------------------------------------------------------------
   PLAYABILITY MASK — 0 where the ground must stay as authored, 1 where the
   landform passes may do as they like.

   The bumps, corridors and deposit pads are Math.max floors: they do not heal
   after something cuts into them. Attenuating DURING each pass (rather than
   re-stamping afterwards) is what makes a river route AROUND a base instead of
   being clipped flat where it crosses one — a re-stamp leaves a retaining-wall
   edge at every boundary, which is the same "sculpted" tell, just relocated.
   --------------------------------------------------------------------------- */
function terraPlayMask(W,bumps,corridorFns,depPts,roads,tight){
  const m=new Float32Array(W*W).fill(1);
  const s=MAP/W;
  const soften=(i,d,r,feather)=>{
    if(d>=r+feather) return;
    const v=d<=r?0:(d-r)/feather;
    const k=v*v*(3-2*v);
    if(k<m[i]) m[i]=k;
  };
  /* TWO MASKS, BECAUSE THE TWO PASSES CANNOT BREAK THE SAME THINGS.
     Carving digs DOWN: it can approach sea level, punch passability holes and
     cut through a corridor, so it respects the full authored footprint of
     every bump, lane and resource pad. Ridges only ADD height — they cannot
     flood anything, and nothing in this game reads slope for passability — so
     they need protect only enough flat ground to stand a base on. Running one
     conservative mask for both was suppressing ridges across roughly half the
     map, which is why the first pass still looked like smooth blobs. */
  const R=tight?0.42:0.82, F=tight?110:150, CR=tight?0.34:0.70, DR=tight?0.5:0.85;
  for(let y=0;y<W;y++) for(let x=0;x<W;x++){
    const i=y*W+x, wx=(x+0.5)*s, wy=(y+0.5)*s;
    for(const B of bumps) soften(i,Math.hypot(wx-B[0],wy-B[1]),B[2]*R,F);
    soften(i,corridorFns[0](wx,wy),300*CR,F);
    if(roads&&corridorFns[1]) soften(i,corridorFns[1](wx,wy),260*CR,F*0.93);
    if(depPts) for(const p of depPts) soften(i,Math.hypot(wx-p[0],wy-p[1]),120*DR,90);
  }
  return m;
}

/* ---------------------------------------------------------------------------
   FLOW ACCUMULATION (D8). Every cell drains to its steepest lower neighbour.
   Walking cells in DESCENDING height order means every contributor to a cell
   has already been processed when we reach it, so one linear sweep produces
   exact accumulation — no iteration, no convergence check.

   The ordering uses a 4096-bucket counting sort, not Array.sort: a comparator
   sort of a quarter-million floats in JS costs more than every other pass in
   this file combined.
   --------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
   DEPRESSION FILLING (Planchon-Darboux). Without it, D8 routing is useless on
   noise: every local dimple is a sink, so flow terminates a few cells from
   where it started and accumulation comes out as scattered patches instead of
   branching networks. That is exactly what the first pass produced.

   Fill a WORKING surface only — start it at +infinity except on the boundary,
   then repeatedly lower each cell to max(its real height, lowest filled
   neighbour + epsilon). Sweeping in alternating directions propagates the
   boundary constraint inward from all four sides, so it converges in a handful
   of passes rather than the naive one-cell-per-pass.

   The filled surface is used ONLY to decide where water goes. Channel depth is
   still carved into the real terrain, so filling never raises the map — it
   just stops rivers from giving up in a puddle. */
function terraFill(H,W,passes){
  const N=W*W, F=new Float32Array(N);
  const EPS=1e-5;
  for(let i=0;i<N;i++) F[i]=1e9;
  for(let x=0;x<W;x++){ F[x]=H[x]; F[(W-1)*W+x]=H[(W-1)*W+x]; }
  for(let y=0;y<W;y++){ F[y*W]=H[y*W]; F[y*W+W-1]=H[y*W+W-1]; }
  const relax=(i,h)=>{
    let lo=1e9;
    const x=i%W, y=(i/W)|0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy) continue;
      const nx=x+dx, ny=y+dy;
      if(nx<0||ny<0||nx>=W||ny>=W) continue;
      const v=F[ny*W+nx]; if(v<lo) lo=v;
    }
    const cand=lo+EPS;
    if(cand<F[i]) F[i]=h>cand?h:cand;
  };
  for(let p=0;p<passes;p++){
    if(p&1){ for(let y=W-2;y>0;y--) for(let x=W-2;x>0;x--){ const i=y*W+x; if(F[i]>H[i]) relax(i,H[i]); } }
    else   { for(let y=1;y<W-1;y++) for(let x=1;x<W-1;x++){ const i=y*W+x; if(F[i]>H[i]) relax(i,H[i]); } }
  }
  for(let i=0;i<N;i++) if(F[i]>1e8) F[i]=H[i];
  return F;
}
function terraFlow(H,W,mask,out,wet){
  const N=W*W;
  const dir=new Int32Array(N).fill(-1);
  const acc=new Float32Array(N).fill(1);
  const F=terraFill(H,W,10);          // routing surface: sinks removed
  let lo=Infinity, hi=-Infinity;
  for(let i=0;i<N;i++){ const v=F[i]; if(v<lo)lo=v; if(v>hi)hi=v; }
  const span=(hi-lo)||1;
  for(let y=1;y<W-1;y++) for(let x=1;x<W-1;x++){
    const i=y*W+x, h=F[i];
    let bestDrop=0, bi=-1;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy) continue;
      const j=i+dy*W+dx;
      /* Diagonal steps cover sqrt(2) more ground, so comparing raw drop would
         bias every channel onto the diagonals — the classic D8 staircase. */
      const drop=(F[j]-h)/((dx&&dy)?1.41421356:1);
      if(drop<bestDrop){ bestDrop=drop; bi=j; }
    }
    dir[i]=bi;
  }
  const B=4096, head=new Int32Array(B).fill(-1), next=new Int32Array(N).fill(-1);
  for(let i=0;i<N;i++){
    let b=((F[i]-lo)/span*(B-1))|0; if(b<0)b=0; else if(b>B-1)b=B-1;
    next[i]=head[b]; head[b]=i;
  }
  for(let b=B-1;b>=0;b--) for(let i=head[b];i>=0;i=next[i]){
    const d=dir[i]; if(d>=0) acc[d]+=acc[i];
  }
  /* Depth from log(accumulation): a trunk carrying a whole basin cuts a few
     times deeper than a first-order tributary, not thousands of times. */
  for(let i=0;i<N;i++){
    /* Channels stop at the waterline. Carrying the carve on underwater simply
       deepened every existing lake, and the water sheet tints by depth — so
       ponds turned into flat black voids instead of reading as water at all. */
    if(wet&&!wet[i]) {} else if(wet) continue;
    const a=acc[i];
    if(a<TERRA.streamMin) continue;
    let d=TERRA.carve*Math.log(1+a-TERRA.streamMin);
    if(d>TERRA.carveMax) d=TERRA.carveMax;
    out[i]-=d*mask[i];
  }
  return acc;
}

/* Separable box blur on a grid — used to widen carved channels so they survive
   the mesh's own +-7 unit smoothing, and to soften the ridge mask. */
function terraBlur(src,W,r,tmp){
  const inv=1/(r*2+1);
  for(let y=0;y<W;y++){
    let s=0;
    for(let k=-r;k<=r;k++) s+=src[y*W+Math.min(W-1,Math.max(0,k))];
    for(let x=0;x<W;x++){
      tmp[y*W+x]=s*inv;
      s-=src[y*W+Math.min(W-1,Math.max(0,x-r))];
      s+=src[y*W+Math.min(W-1,Math.max(0,x+r+1))];
    }
  }
  for(let x=0;x<W;x++){
    let s=0;
    for(let k=-r;k<=r;k++) s+=tmp[Math.min(W-1,Math.max(0,k))*W+x];
    for(let y=0;y<W;y++){
      src[y*W+x]=s*inv;
      s-=tmp[Math.min(W-1,Math.max(0,y-r))*W+x];
      s+=tmp[Math.min(W-1,Math.max(0,y+r+1))*W+x];
    }
  }
}

/* ---------------------------------------------------------------------------
   THE PASS. Called from buildTerrain after every authored feature is stamped
   and before anything reads the field back — passability, district planning,
   the painted macro map, the mesh and the normal sheet all see eroded ground.
   --------------------------------------------------------------------------- */
function terraShape(heightF,TS,MD,bumps,corridorFns,depPts){
  if(typeof TERRA_ENABLED!=='undefined'&&!TERRA_ENABLED) return null;
  const t0=(typeof performance!=='undefined')?performance.now():0;
  const W=TERRA.work, N=W*W, step=TS/W;
  const rand=terraRng((MD.seed^0xE20D10)|1);
  const LN=64;
  const gr=terraLattice(rand,LN), gm=terraLattice(rand,LN), gw1=terraLattice(rand,LN), gw2=terraLattice(rand,LN);

  /* Downsample by point-sampling the cell centre. A box average here would
     pre-blur the field we are about to measure slopes on, and the delta we
     return is added back to the untouched 2048 heights anyway. */
  const H=new Float32Array(N);
  for(let y=0;y<W;y++) for(let x=0;x<W;x++)
    H[y*W+x]=heightF[((y*step+step*0.5)|0)*TS+((x*step+step*0.5)|0)];

  const wet=new Uint8Array(N);
  for(let i=0;i<N;i++) wet[i]=H[i]>=WATER_H?1:0;      // remembered before anything moves
  const mask=terraPlayMask(W,bumps,corridorFns,depPts,MD.roads,false);   // carving: full protection
  const maskR=terraPlayMask(W,bumps,corridorFns,depPts,MD.roads,true);   // ridges: build pads only
  const delta=new Float32Array(N);
  const rel=MD.relief||1;

  /* ---- 1. RIDGES ---------------------------------------------------------
     Amplitude scales with the map's own relief setting, so a "flat highway
     country" map gets hills and a "cliff arcology" gets a range. The region
     mask decides WHERE, and is blurred so ranges have shoulders instead of
     edges. Squaring the mask keeps foothills low and cores high. */
  const ridgeAmp=(0.23+0.26*Math.max(0,Math.min(1.6,rel)-0.85))*(MD.crater?0.66:1);
  const region=new Float32Array(N), tmp=new Float32Array(N);
  for(let y=0;y<W;y++) for(let x=0;x<W;x++){
    const u=x/W*TERRA.regionFreq, v=y/W*TERRA.regionFreq;
    let m=terraNoise(gm,LN,u,v);
    m=(m-(TERRA.regionLo-TERRA.regionBias))/(TERRA.regionHi-TERRA.regionLo);
    region[y*W+x]=m<0?0:m>1?1:m*m*(3-2*m);
  }
  terraBlur(region,W,3,tmp);
  for(let y=0;y<W;y++) for(let x=0;x<W;x++){
    const i=y*W+x, m=region[i]*region[i]*maskR[i];
    if(m<=0.002) continue;
    const u=x/W*TERRA.ridgeFreq, v=y/W*TERRA.ridgeFreq;
    delta[i]+=terraRidged(gr,LN,u,v,TERRA.ridgeOct,TERRA.ridgeLac,TERRA.ridgeGain)*ridgeAmp*m;
  }

  /* ---- 2. DRAINAGE -------------------------------------------------------
     Flow is routed over base + ridges, so the new ranges are what the new
     rivers come off — the two passes have to see each other or the valleys
     land in the wrong places. */
  const flowH=new Float32Array(N);
  for(let i=0;i<N;i++) flowH[i]=H[i]+delta[i];
  const carve=new Float32Array(N);
  terraFlow(flowH,W,mask,carve,wet);
  /* Widen: a one-cell channel is 6.25 world units and the mesh blur would eat
     it whole. Two blur passes spread it to roughly 30, which is the narrowest
     thing this terrain can actually show. */
  terraBlur(carve,W,2,tmp);
  terraBlur(carve,W,1,tmp);
  for(let i=0;i<N;i++) delta[i]+=carve[i];

  /* ---- 3. COASTS ---------------------------------------------------------
     Domain-warp the sampled position, but only for cells near sea level, and
     write the difference as delta. Inland is untouched, so this costs almost
     nothing and cannot disturb a base sitting on a plateau. */
  for(let y=1;y<W-1;y++) for(let x=1;x<W-1;x++){
    const i=y*W+x, h=H[i]+delta[i];
    const near=1-Math.min(1,Math.abs(h-WATER_H)/TERRA.coastBand);
    if(near<=0.02) continue;
    const u=x/W*7.3, v=y/W*7.3;
    const wx=(terraNoise(gw1,LN,u,v)*2-1)*TERRA.coastWarp/MAP*W;
    const wy=(terraNoise(gw2,LN,u,v)*2-1)*TERRA.coastWarp/MAP*W;
    const sx=Math.max(0,Math.min(W-1,x+wx))|0, sy=Math.max(0,Math.min(W-1,y+wy))|0;
    delta[i]+=(H[sy*W+sx]-H[i])*near*0.55*mask[i];
  }

  /* ---- 4. GUARD ----------------------------------------------------------
     No cell that started dry may finish wet. Everything downstream that
     matters — passability, the naval connectivity flood fill, water mesh
     coverage, whether the map even offers naval units — keys off WATER_H, so
     a carve that crossed it would quietly redesign the map. */
  for(let i=0;i<N;i++){
    let v=H[i]+delta[i];
    if(wet[i]){ if(v<WATER_H+0.004) v=WATER_H+0.004; }      // dry land stays dry
    else if(v<H[i]) v=H[i];                                  // and lakes never get deeper
    if(v>TERRA.ceiling) v=TERRA.ceiling;
    delta[i]=v-H[i];
  }

  /* ---- 5. UPSAMPLE THE DELTA --------------------------------------------
     Bilinear, so the added structure is smooth, while the 2048 field keeps
     every octave it already had underneath. */
  let lo=0, hiV=0;
  for(let y=0;y<TS;y++){
    const gy=(y/step)-0.5, y0=Math.floor(gy), fy=gy-y0;
    const ya=Math.max(0,Math.min(W-1,y0)), yb=Math.max(0,Math.min(W-1,y0+1));
    for(let x=0;x<TS;x++){
      const gx=(x/step)-0.5, x0=Math.floor(gx), fx=gx-x0;
      const xa=Math.max(0,Math.min(W-1,x0)), xb=Math.max(0,Math.min(W-1,x0+1));
      const d=(delta[ya*W+xa]*(1-fx)+delta[ya*W+xb]*fx)*(1-fy)
             +(delta[yb*W+xa]*(1-fx)+delta[yb*W+xb]*fx)*fy;
      const i=y*TS+x;
      const was=heightF[i];
      let v=was+d;
      if(was>=WATER_H){ if(v<WATER_H+0.002) v=WATER_H+0.002; }   // same guard at full res
      else if(v<was) v=was;                                       // no deepening underwater
      if(v>TERRA.ceiling) v=TERRA.ceiling;
      heightF[i]=v;
      if(d<lo) lo=d; if(d>hiV) hiV=d;
    }
  }
  const ms=((typeof performance!=='undefined')?performance.now():0)-t0;
  return {ms:Math.round(ms),work:W,ridgeAmp:+ridgeAmp.toFixed(3),
          deltaLo:+lo.toFixed(3),deltaHi:+hiV.toFixed(3)};
}
let TERRA_ENABLED=true;
let terraLastStats=null;

