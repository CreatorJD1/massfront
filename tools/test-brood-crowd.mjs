#!/usr/bin/env node
/* Static + isolated runtime contract for the cosmetic Brood crowd layer.
   This deliberately does not boot the game: the purpose is to prove that the
   extra bodies remain bounded render submissions rather than hidden sim state. */
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const crowd=read('src/engine/brood-crowd.js');
const render=read('src/ui/render3d.js');
const glsrc=read('src/engine/gl.js');
const mesh=read('src/engine/mesh.js');
const boot=read('boot.js');
const manifest=read('assets/data/manifest.json');
let failures=0;
function check(ok,msg){
  if(ok) console.log(`PASS ${msg}`);
  else{ failures++; console.error(`FAIL ${msg}`); }
}

for(const forbidden of ['spawnUnit(','localStorage','indexedDB','WebSocket','fetch(','ualive[','uteam[','ux[','uy['])
  check(!crowd.includes(forbidden),`crowd has no authoritative ${forbidden} access`);
check((crowd.match(/new InstMesh\(/g)||[]).length===3,'exactly three instanced LOD streams');
check(/quality==='low'\?96:quality==='medium'\?160:256/.test(crowd),'quality budgets are explicit');
check(/p<\.36\?Math\.min\(base,64\):p<\.56\?Math\.min\(base,112\):base/.test(crowd),'pressure caps are explicit');

const units=render.indexOf('// ---------------- units');
const fog=render.indexOf('if(!mfRenderUnitFogVisible(i)) continue;',units);
const queue=render.indexOf("if(unitKit==='horde'&&typeof mfBroodCrowdQueue==='function')",units);
const iconDrop=render.indexOf('if(uIcon>=1) continue;',queue);
const realFlush=render.indexOf('for(const k in FAC_MESH)',queue);
const crowdFlush=render.indexOf("if(typeof mfBroodCrowdFlush==='function')",queue);
check(fog>=0&&queue>fog,'crowd submission follows the camera/fog gate');
check(iconDrop>queue,'strategic-icon anchors may still seed far silhouettes');
check(realFlush>queue&&crowdFlush>realFlush,'crowd flush follows authoritative faction meshes');

check(glsrc.includes("albedo:'./assets/terrain/locations/brood-infested-soil-albedo-v1.webp'"),'Brood terrain albedo has a literal packable path');
check(glsrc.includes("normal:'./assets/terrain/locations/brood-infested-soil-normal-rough-v1.webp'"),'Brood terrain normal/roughness has a literal packable path');
check(glsrc.includes('gl.RG8')&&glsrc.includes('gl.RG,gl.UNSIGNED_BYTE'),'surface mask uses two channels');
const organic=glsrc.slice(glsrc.indexOf('function organicStampMask'),glsrc.indexOf('function organicVein'));
check(!organic.includes('groundMaskCanvas.getContext'),'organic creep never paints hardscape R');
const foundation=glsrc.slice(glsrc.indexOf('function makeOrganicFoundation'),glsrc.indexOf('function makeHardFoundation'));
check(foundation.indexOf('creepStampRelief(')<foundation.indexOf('organicStampMask('),'creep relief is authored before its G-channel upload');
check(mesh.includes('vec2 surfaceMask=textureGrad(uGMask,vMapUV,dMx,dMy).rg;'),'terrain shader reads the packed semantic mask');
check(mesh.includes('soilMix=mix(soilMix,1.0,creepMask);'),'creep reuses the existing soil PBR family');
check(!mesh.includes('uBroodT')&&!mesh.includes('uBroodN'),'Brood terrain adds no fullscreen samplers');
check(boot.includes("'./src/engine/brood-crowd.js'")&&manifest.includes('src/engine/brood-crowd.js'),'crowd source is registered in both runtime manifests');

let builds=0,streamCreates=0;
class StubMB{
  constructor(){this.prims=0;}
  translate(){return this;} rotateY(){return this;} scale3d(){return this;}
  mat(){return this;} team(){return this;} popTransform(){return this;}
  sphere(){this.prims+=12;return this;} box(){this.prims+=12;return this;}
  build(){ builds++; return {count:this.prims*3}; }
}
class StubInstMesh{
  constructor(_gl,geo,cap){this.geo=geo;this.cap=cap;this.n=0;this.adds=[];streamCreates++;}
  clear(){this.n=0;this.adds=[];}
  add(...a){if(this.n<this.cap){this.adds.push(a);this.n++;}}
  flush(){this.flushed=(this.flushed||0)+1;}
}
const context={
  console,Math,Object,Number,Uint8Array,
  gl:{},glEpoch:1,InstMesh:StubInstMesh,MB:()=>new StubMB(),
  MAT:{CHITIN:1,LEAF:2},CHIT_D:[1],CHITIN:[1],BIO_TEAM:[1],BIO_LEG:[1],
  MAPDEFS:{arena:{seed:12345}},curMap:'arena',mfGfxKey:()=> 'high'
};
vm.createContext(context);
vm.runInContext(`${crowd}\nthis.__api={begin:mfBroodCrowdBeginFrame,queue:mfBroodCrowdQueue,flush:mfBroodCrowdFlush,stats:mfBroodCrowdStats,hash:mfBroodCrowdHash};`,context);
const api=context.__api;
const type={size:14,cat:'ground'};
check(api.begin(3,1000,1,2),'crowd initializes with renderer services');
for(let i=0;i<400;i++) api.queue(i,1,i,0,2,0,type,[120,80,200],2,0,true,true);
api.flush();
let stat=api.stats();
check(stat.clusterInstances<=256&&stat.budget===256,'high-quality hard cap is 256 clusters');
check(stat.visualBodies===stat.clusterInstances*3,'mid LOD reports three visual bodies per anchor');
check(stat.drawCalls<=3,'crowd uses at most three draw calls');
check(stat.triangles>0&&Number.isFinite(stat.triangles),'triangle telemetry is finite');

api.begin(3,1000,.25,2);
for(let i=0;i<400;i++) api.queue(i,1,i,0,2,0,type,[120,80,200],2,0,true,true);
stat=api.stats();
check(stat.budget===64&&stat.clusterInstances<=64,'pressure fallback caps clusters at 64');
const before=stat.clusterInstances;
api.queue(900,1,0,0,2,0,{size:14,air:true},[1,2,3],2,0,true,true);
api.queue(901,1,0,0,2,0,{size:14,naval:true},[1,2,3],2,0,true,true);
api.queue(902,1,0,0,2,0,{size:14,cat:'hero'},[1,2,3],2,0,true,true);
api.queue(903,1,0,0,2,0,{size:25},[1,2,3],2,0,true,true);
api.queue(904,1,0,0,2,0,type,[1,2,3],2,0,true,false);
check(api.stats().clusterInstances===before,'air, naval, hero, large and non-Brood anchors are rejected');

const h1=api.hash(812733),h2=api.hash(812733);
check(h1===h2,'anchor hashing is deterministic');
context.glEpoch=2;
api.begin(4,500,1,1);
check(builds===6&&streamCreates===6,'WebGL context epoch rebuilds all three streams');

if(failures){
  console.error(`\n${failures} Brood crowd contract failure(s)`);
  process.exit(1);
}
console.log('\nBrood crowd contract PASS');
