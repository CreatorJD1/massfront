import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const source=await readFile(resolve(root,'src/game/sim.js'),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const slice=(from,to)=>{
  const a=source.indexOf(from),b=source.indexOf(to,a+from.length);
  assert(a>=0&&b>a,'missing source slice '+from);return source.slice(a,b);
};
const MAXP=6,MAXU=6,context={MAXP,MAXU,pHigh:0,pFree:[],TYPES:[{air:0,r:2},{air:1,r:2}],
  ugen:new Int32Array(MAXU),ualive:new Uint8Array(MAXU),utype:new Int32Array(MAXU),uteam:new Int32Array(MAXU),
  ux:new Float32Array(MAXU),uy:new Float32Array(MAXU),
  WeaponFlightProfile:()=>({trajectory:'line'}),terrainH:()=>10,unitAirAlt:()=>100,
  dist2:(x1,y1,x2,y2)=>(x2-x1)**2+(y2-y1)**2,clamp:(v,a,b)=>Math.max(a,Math.min(b,v))};
const numeric=['palive','ptype','pteam','pdmg','paoe','ptgt','pSplit','pCannon','pBio','pBarrage','pArc','pConcuss',
  'pSrcUnit','pSrcGen','pFlightId','pBaseSpeed','pSpeed','pAge','pObsN','pObsTerrainN','pObsCellN','pObsCandidateN',
  'pArtTrail','pSmokeT','pFlightCue','ptgtg','pLastTX','pLastTY','pmu0','px','py','psx','psy','pex','pey','pt',
  'pz0','pz1','pz','pvx','pvy','plife','pTurbSeed','pmax'];
for(const name of numeric)context[name]=new Float64Array(MAXP);
context.pSrcBld=Array(MAXP).fill(null);context.pwk=Array(MAXP).fill('n');
context.liveTgt=(i,g)=>i>=0&&context.ualive[i]&&context.ugen[i]===g;
vm.createContext(context);
vm.runInContext(slice('function fireProj(', 'function killProj(')+
  slice('function mfProjectileTargetFuse(', '// ---------- projectile tick ----------')+
  '\n;globalThis.__heightTest={fireProj,mfProjectileTargetFuse};',context,{filename:'src/game/sim.js#air-height'});
const H=context.__heightTest;

context.ualive[1]=1;context.ugen[1]=9;context.utype[1]=1;context.ux[1]=50;context.uy[1]=60;
const airShot=H.fireProj(7,0,10,20,50,60,100,20,8,1,212);
assert(airShot===0&&context.pz0[airShot]===212,'aircraft sourceZ was not retained as projectile origin');
assert(context.pz[airShot]===212,'line projectile did not begin at sourceZ');
assert(context.pz1[airShot]===110,'air target endpoint did not include terrain plus flight altitude');
const groundShot=H.fireProj(1,0,10,20,30,40,100,20,0,-1);
assert(context.pz0[groundShot]===26,'legacy ground muzzle fallback changed');

const FP={fuse:'contact',armTime:0,fuseRadius:1};
context.ptgt[0]=1;context.ptgtg[0]=9;context.pteam[0]=0;context.pAge[0]=1;context.pFlightId[0]=7;
context.uteam[1]=1;context.ux[1]=5;context.uy[1]=0;
assert(H.mfProjectileTargetFuse(0,0,0,10,0,FP,110,110),'3D swept fuse missed an air target on the segment');
assert(context.px[0]===5&&context.py[0]===0&&context.pz[0]===110,'air fuse did not resolve the 3D contact point');
assert(!H.mfProjectileTargetFuse(0,0,0,10,0,FP,50,50),'air fuse accepted a different altitude layer');
assert(!H.mfProjectileTargetFuse(0,0,0,10,0,FP),'air fuse did not fail closed without height samples');

context.utype[1]=0;
assert(H.mfProjectileTargetFuse(0,0,0,10,0,FP),'ground target stopped using legacy planar swept fuse');
assert(!H.mfProjectileTargetFuse(0,0,0,10,0,{...FP,fuse:'lifetime'},100,100),'lifetime fuse bypassed its authored path');

console.log(JSON.stringify({ok:true,sourceZ:{air:context.pz0[airShot],groundFallback:context.pz0[groundShot],airTarget:context.pz1[airShot]},
  fuse:{air3d:true,wrongLayerRejected:true,missingHeightRejected:true,groundPlanarPreserved:true}},null,2));
