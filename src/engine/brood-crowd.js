/* ============================================================================
   BROOD CROWD — RENDER-ONLY SWARM DENSITY
   ----------------------------------------------------------------------------
   These bodies are deliberately NOT units. They never enter the simulation,
   pathfinder, selection, targeting, fog, save, replay or network state. A
   visible real Brood ground unit is the only anchor allowed to submit one
   deterministic cluster, so crowd art cannot reveal a hidden army or create a
   second source of combat truth.

   Three LOD meshes keep the illusion honest. Close view adds one subordinate
   crawler; tactical view adds a three-body knot; distant view adds four very
   cheap silhouettes beneath the strategic icon tier. Every tier remains one
   InstMesh draw, and one global frame budget is shared across all three.
   ============================================================================ */

let MF_BROOD_CROWD_STREAMS=null;
let MF_BROOD_CROWD_EPOCH=-1;
let MF_BROOD_CROWD_FRAME={time:0,span:0,perf:1,diff:1,seed:0,budget:0,density:0,queued:0};
let MF_BROOD_CROWD_STAT={
  enabled:false,quality:'high',budget:0,visibleAnchors:0,eligibleAnchors:0,
  clusterInstances:0,visualBodies:0,drawCalls:0,triangles:0,
  skippedDensity:0,skippedBudget:0,near:0,mid:0,far:0
};

function mfBroodCrowdHash(v){
  v=(v|0)^0x6d2b79f5;
  v=Math.imul(v^(v>>>15),v|1);
  v^=v+Math.imul(v^(v>>>7),v|61);
  return (v^(v>>>14))>>>0;
}
function mfBroodCrowdStringHash(s){
  s=String(s||'');
  let h=2166136261;
  for(let i=0;i<s.length;i++) h=Math.imul(h^s.charCodeAt(i),16777619);
  return h>>>0;
}

/* One crawler is intentionally less detailed than a real Skitterling. Its
   small subordinate silhouette prevents a cosmetic body being mistaken for a
   target with its own health, while CHITIN/LEAF keep the live organic shader
   response and animation instead of introducing a flat sprite species. */
function mfBroodCrowdCrawler(m,x,z,yaw,scale,legs){
  m.translate(x,0,z);m.rotateY(yaw);m.scale3d(scale,scale,scale);
  m.mat(MAT.CHITIN).team(0);
  m.sphere(-.25,.72,0,1.34,5,CHIT_D,.55,false);
  m.sphere(1.02,.64,0,.72,4,CHITIN,.66,false);
  m.sphere(-1.22,.65,0,.62,4,CHIT_D,.58,false);
  /* A small team-bearing dorsal plate reads allegiance, but most of the body
     keeps authored chitin colour so a dense group does not become a neon blob. */
  m.mat(MAT.CHITIN).team(1);
  m.sphere(-.15,1.19,0,.48,4,BIO_TEAM,.34,true);
  m.team(0).mat(MAT.LEAF);
  const n=Math.max(1,legs|0);
  for(let k=0;k<n;k++) for(const sd of [-1,1]){
    const lx=n===1?.05:-.62+k*(1.24/Math.max(1,n-1));
    const lz=sd*(1.12+(k&1)*.10);
    m.box(lx,.18,lz,1.72,.22,.25,BIO_LEG,sd*(.30+k*.09));
  }
  m.popTransform();m.popTransform();m.popTransform();
}

function mfBroodCrowdGeo(tier){
  const m=MB();
  if(tier==='near'){
    mfBroodCrowdCrawler(m,2.7,1.2,.28,.82,3);
  }else if(tier==='mid'){
    mfBroodCrowdCrawler(m,-2.8,-1.7,-.42,.76,2);
    mfBroodCrowdCrawler(m, 2.4,-1.2, .34,.70,2);
    mfBroodCrowdCrawler(m, -.2, 2.7,1.92,.66,2);
  }else{
    mfBroodCrowdCrawler(m,-2.7,-1.8,-.34,.55,1);
    mfBroodCrowdCrawler(m, 2.5,-1.5, .46,.52,1);
    mfBroodCrowdCrawler(m,-1.7, 2.3,2.36,.48,1);
    mfBroodCrowdCrawler(m, 2.0, 2.1,1.18,.46,1);
  }
  return m.build();
}

function mfBroodCrowdInit(){
  if(typeof gl==='undefined'||!gl||typeof InstMesh!=='function'||typeof MB!=='function') return false;
  const epoch=typeof glEpoch==='number'?glEpoch:0;
  if(MF_BROOD_CROWD_STREAMS&&MF_BROOD_CROWD_EPOCH===epoch) return true;
  const near=mfBroodCrowdGeo('near'),mid=mfBroodCrowdGeo('mid'),far=mfBroodCrowdGeo('far');
  MF_BROOD_CROWD_STREAMS={
    near:new InstMesh(gl,near,64),
    mid:new InstMesh(gl,mid,256),
    far:new InstMesh(gl,far,256),
    bodies:{near:1,mid:3,far:4},
    tris:{near:near.count/3,mid:mid.count/3,far:far.count/3}
  };
  MF_BROOD_CROWD_EPOCH=epoch;
  return true;
}

function mfBroodCrowdBeginFrame(time,ortho,perf,difficulty){
  const quality=typeof mfGfxKey==='function'?mfGfxKey():'high';
  const base=quality==='low'?96:quality==='medium'?160:256;
  const p=Number.isFinite(perf)?perf:1;
  /* Population pressure already drives perfScale. Honour that signal here
     rather than making the presentation layer compete with authoritative AI. */
  const budget=p<.36?Math.min(base,64):p<.56?Math.min(base,112):base;
  const d=Math.max(0,Math.min(2,difficulty|0));
  const density=[.28,.58,1.0][d];
  const mapSeed=(typeof MAPDEFS!=='undefined'&&typeof curMap!=='undefined'&&MAPDEFS[curMap])?
    (MAPDEFS[curMap].seed|0):mfBroodCrowdStringHash(typeof curMap!=='undefined'?curMap:'');
  MF_BROOD_CROWD_FRAME={
    time:Number.isFinite(time)?time:0,span:Number.isFinite(ortho)?ortho:0,
    perf:p,diff:d,seed:mapSeed,budget,density,queued:0
  };
  MF_BROOD_CROWD_STAT={
    enabled:budget>0,quality,budget,visibleAnchors:0,eligibleAnchors:0,
    clusterInstances:0,visualBodies:0,drawCalls:0,triangles:0,
    skippedDensity:0,skippedBudget:0,near:0,mid:0,far:0
  };
  if(!mfBroodCrowdInit()){ MF_BROOD_CROWD_STAT.enabled=false; return false; }
  MF_BROOD_CROWD_STREAMS.near.clear();
  MF_BROOD_CROWD_STREAMS.mid.clear();
  MF_BROOD_CROWD_STREAMS.far.clear();
  return true;
}

/* Called only after the real anchor passed camera and fog visibility gates.
   isBrood must come from the resolved faction kit, never from an assumed team
   number: an AI commander can field the Brood kit in an ordinary seat. */
function mfBroodCrowdQueue(unitIndex,type,x,y,h,yaw,T,teamColour,uLod,iconQ,moving,isBrood){
  MF_BROOD_CROWD_STAT.visibleAnchors++;
  if(!MF_BROOD_CROWD_STAT.enabled||!isBrood||!T||T.air||T.naval||T.cat==='hero'||T.hero||T.size>24) return false;
  MF_BROOD_CROWD_STAT.eligibleAnchors++;
  const F=MF_BROOD_CROWD_FRAME;
  const hv=mfBroodCrowdHash((unitIndex|0)^Math.imul((type|0)+17,0x45d9f3b)^F.seed);
  if((hv&65535)/65535>F.density){ MF_BROOD_CROWD_STAT.skippedDensity++; return false; }
  if(F.queued>=F.budget){ MF_BROOD_CROWD_STAT.skippedBudget++; return false; }
  const iq=Number.isFinite(iconQ)?iconQ:0;
  let tier;
  if(iq>.12||F.span>1800||uLod===1) tier='far';
  else if(F.span>760) tier='mid';
  else tier='near';
  /* Close view is where a tethered cosmetic body is easiest to notice. Keep
     only one in five eligible anchors there; mid/far carry the mass fantasy. */
  if(tier==='near'&&((hv>>>16)%5)!==0){ MF_BROOD_CROWD_STAT.skippedDensity++; return false; }
  const stream=MF_BROOD_CROWD_STREAMS[tier],tc=teamColour||[190,92,230];
  const jitter=.88+((hv>>>24)&255)/255*.22;
  const sc=Math.max(.68,Math.min(1.28,(T.size||12)/16))*jitter;
  const turn=((hv>>>8)&1023)/1023*6.2831853;
  const anim=tier==='far'||F.perf<.36?0:F.time*(moving?6.2:2.05)+(hv&2047)*.0137;
  stream.add(x,y,h,sc,yaw+turn,tc[0],tc[1],tc[2],255,sc,anim,0);
  F.queued++;
  MF_BROOD_CROWD_STAT.clusterInstances++;
  MF_BROOD_CROWD_STAT.visualBodies+=MF_BROOD_CROWD_STREAMS.bodies[tier];
  MF_BROOD_CROWD_STAT.triangles+=MF_BROOD_CROWD_STREAMS.tris[tier];
  MF_BROOD_CROWD_STAT[tier]++;
  return true;
}

function mfBroodCrowdFlush(){
  if(!MF_BROOD_CROWD_STREAMS||typeof gl==='undefined'||!gl) return;
  for(const tier of ['near','mid','far']){
    const stream=MF_BROOD_CROWD_STREAMS[tier];
    if(stream.n){ MF_BROOD_CROWD_STAT.drawCalls++; stream.flush(gl); }
  }
}

function mfBroodCrowdStats(){
  return Object.assign({},MF_BROOD_CROWD_STAT);
}

