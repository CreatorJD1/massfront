import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';

const source=fs.readFileSync(new URL('../src/engine/terrain.js',import.meta.url),'utf8');
const start=source.indexOf('function rawH('),end=source.indexOf('const WATER_Y=',start);
assert.ok(start>=0&&end>start,'terrain height functions must be extractable');
const implementation=source.slice(start,end);
const terrainBody=implementation.slice(implementation.indexOf('function terrainH('));
assert.equal((terrainBody.match(/mfTerrainSampleCoords\(/g)||[]).length,9,'terrainH must retain exactly nine weighted bilinear samples');
const harness=`
const MAP=3840,TS=2048,HSCALE=118,SEABED=-26,WATER_H=.335;
let heightF=null,clampCalls=0,waterCalls=0,authoredMode=0,lipMode=0;
function clamp(v,a,b){clampCalls++;return v<a?a:v>b?b:v;}
function authoredWaterAt(x,y){waterCalls++;return authoredMode===1||(authoredMode===2&&x<MAP*.25&&y<MAP*.25);}
function waterLipAt(x,y){waterCalls++;return lipMode===1||(lipMode===2&&x>MAP*.75&&y>MAP*.75);}
${implementation}
function referenceRawH(wx,wy){
  const fx=clamp(wx/MAP*(TS-1),0,TS-1.001),fy=clamp(wy/MAP*(TS-1),0,TS-1.001);
  const x0=fx|0,y0=fy|0,tx=fx-x0,ty=fy-y0,i=y0*TS+x0;
  return (heightF[i]*(1-tx)+heightF[i+1]*tx)*(1-ty)+(heightF[i+TS]*(1-tx)+heightF[i+TS+1]*tx)*ty;
}
function referenceTerrainH(wx,wy){
  if(!heightF)return 0;
  const h=(referenceRawH(wx,wy)*2
    +referenceRawH(wx-HSM,wy)+referenceRawH(wx+HSM,wy)+referenceRawH(wx,wy-HSM)+referenceRawH(wx,wy+HSM)
    +referenceRawH(wx-HSM,wy-HSM)+referenceRawH(wx+HSM,wy+HSM)+referenceRawH(wx-HSM,wy+HSM)+referenceRawH(wx+HSM,wy-HSM))/10;
  const wet=(typeof authoredWaterAt==='function'&&authoredWaterAt(wx,wy))||waterLipAt(wx,wy);
  return wet&&h<=WATER_H?Math.max(SEABED,(h-WATER_H)*HSCALE*1.4):(h-WATER_H)*HSCALE;
}
globalThis.api={setField:v=>heightF=v,setWater:(a,l)=>{authoredMode=a;lipMode=l;},resetCounts:()=>{clampCalls=waterCalls=0;},
  counts:()=>({clampCalls,waterCalls}),terrainH,referenceTerrainH,rawH,referenceRawH};
`;
const context=vm.createContext({Float32Array,Math});vm.runInContext(harness,context);const api=context.api;
function rng(seed){let s=seed>>>0;return()=>((s=(s*1664525+1013904223)>>>0)/4294967296);}
const random=rng(0x4d465448),field=new Float32Array(2048*2048);
for(let i=0;i<field.length;i++)field[i]=random()*.82+.04;
api.setField(field);

const points=[[-Infinity,-Infinity],[Infinity,Infinity],[NaN,NaN],[-10000,-10000],[-7,-7],[-Number.EPSILON,0],[0,0],[7,7],[3833,3833],[3840,3840],
  [3840+Number.EPSILON,3840],[10000,10000],[1920,1920],[3840*31/2047,3840*63/2047]];
for(let i=0;i<6000;i++)points.push([-128+random()*4096,-128+random()*4096]);
function exactPass(label){
  for(const [x,y] of points){
    const actual=api.terrainH(x,y),expected=api.referenceTerrainH(x,y);
    assert.ok(Object.is(actual,expected),`${label}: terrainH differs at ${x},${y}: ${actual} !== ${expected}`);
    assert.ok(Object.is(api.rawH(x,y),api.referenceRawH(x,y)),`${label}: rawH changed at ${x},${y}`);
  }
}
for(const [a,l,label] of [[0,0,'dry'],[1,0,'authored-water'],[0,1,'lip-water'],[2,2,'mixed-water']]){
  api.setWater(a,l);exactPass(label);
}

/* Deformation mutates the same live Float32Array; coordinate reuse must not
   cache any samples or invalidate crater/water edits. */
for(let i=0;i<24000;i++)field[(random()*field.length)|0]=random()*.9-.12;
api.setWater(2,2);exactPass('deformed-height-field');

field.fill(0);api.setWater(1,0);exactPass('seabed-floor');
assert.equal(api.terrainH(1920,1920),-26,'wet low terrain must retain the seabed floor');
api.setField(null);api.resetCounts();
assert.ok(Object.is(api.terrainH(20,20),api.referenceTerrainH(20,20)),'null height field must stay exact');
assert.equal(api.counts().clampCalls,0,'null height field must return before coordinate work');
assert.equal(api.counts().waterCalls,0,'null height field must return before water work');

api.setField(field);api.setWater(0,0);api.resetCounts();api.referenceTerrainH(1234.5,2345.75);
const referenceOps=api.counts();api.resetCounts();api.terrainH(1234.5,2345.75);const optimizedOps=api.counts();
assert.equal(referenceOps.clampCalls,18,'reference performs two coordinate clamps for nine raw samples');
assert.equal(optimizedOps.clampCalls,6,'optimized path computes three x and three y coordinates once');
assert.equal(referenceOps.waterCalls,optimizedOps.waterCalls,'water classification cadence must not change');

field.fill(.42);
const benchPoints=points.filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])).slice(0,4096),rounds=7,iterations=24000;
function time(fn){let sum=0;const t=performance.now();for(let i=0;i<iterations;i++){const p=benchPoints[i&(benchPoints.length-1)];sum+=fn(p[0],p[1]);}return {ms:performance.now()-t,sum};}
for(let i=0;i<3;i++){time(api.referenceTerrainH);time(api.terrainH);}
const oldTimes=[],newTimes=[];let checksum=0;
for(let i=0;i<rounds;i++){const a=time(api.referenceTerrainH),b=time(api.terrainH);oldTimes.push(a.ms);newTimes.push(b.ms);checksum+=a.sum+b.sum;}
oldTimes.sort((a,b)=>a-b);newTimes.sort((a,b)=>a-b);
const oldMedian=oldTimes[rounds>>1],newMedian=newTimes[rounds>>1];
console.log(JSON.stringify({ok:true,objectIsCases:points.length*6,rawHPublicExact:true,
  coordinateClamps:{before:referenceOps.clampCalls,after:optimizedOps.clampCalls},waterCalls:optimizedOps.waterCalls,
  optionalNodeTiming:{iterations,rounds,oldMedianMs:oldMedian,newMedianMs:newMedian,ratio:newMedian/oldMedian,checksum}},null,2));
