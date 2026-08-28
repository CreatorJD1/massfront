import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/engine/physics.js',import.meta.url),'utf8');

function makeRuntime(){
  const noRandom=Object.create(Math);
  noRandom.random=()=>{throw new Error('physics consumed Math.random()');};
  const window={};
  const context=vm.createContext({
    console,performance,Math:noRandom,Number,ArrayBuffer,DataView,
    Float32Array,Float64Array,Uint8Array,Uint32Array,
    window,perfScale:1,innerHeight:720,orthoSpan:720,
    terrainH:()=>0,camBounds:()=>({x0:-400,x1:400,y0:-300,y1:300})
  });
  new vm.Script(source,{filename:'src/engine/physics.js'}).runInContext(context);
  return window.MFPhys;
}

function stateById(P,id){
  let out=null;
  P.forEach((i,v)=>{if(i===id)out={x:v.x,y:v.y,z:v.z,vx:v.vx,vy:v.vy,vz:v.vz};});
  return out;
}

function scenario(){
  const P=makeRuntime();
  P.clear();P.seed(0x51a7c0de);
  const orbit=P.spawn(60,0,0,{vx:0,vy:0,vz:0,hx:2,hy:1,hz:1,mass:12,ttl:20,chunks:1});
  const horizonA=P.spawn(2,0,0,{hx:1,hy:1,hz:1,mass:4,ttl:20,chunks:1});
  const horizonB=P.spawn(3,0,0,{hx:1,hy:1,hz:1,mass:4,ttl:20,chunks:1});
  const outside=P.spawn(160,0,0,{hx:1,hy:1,hz:1,mass:4,ttl:20,chunks:1});
  const outsideBefore=stateById(P,outside);
  const opts={orbit:.5,consumeRadius:8,maxConsume:1,maxAcceleration:500,maxSpeed:40,verticalScale:.75};
  const affectedFirst=P.attract(0,0,0,100,10000,1,opts);
  const orbitAfter=stateById(P,orbit),outsideAfter=stateById(P,outside);
  const afterFirst=P.probe();
  const affectedSecond=P.attract(0,0,0,100,10000,1,opts);
  const afterSecond=P.probe();

  P.clear();P.seed(0x51a7c0de);
  const impulseBody=P.spawn(40,0,0,{vx:0,vy:0,vz:0,hx:2,hy:1,hz:1,mass:12,ttl:20,chunks:1});
  const impulseHits=P.impulse(0,0,0,100,60);
  const impulseAfter=stateById(P,impulseBody);
  return {affectedFirst,affectedSecond,orbitAfter,outsideBefore,outsideAfter,
    afterFirst,afterSecond,impulseHits,impulseAfter,hash:afterSecond.stateHash,
    ids:{orbit,horizonA,horizonB,outside}};
}

const a=scenario(),b=scenario();
const speed=Math.hypot(a.orbitAfter.vx,a.orbitAfter.vy,a.orbitAfter.vz);
const checks={
  radialPull:a.orbitAfter.vx<0,
  tangentialOrbit:a.orbitAfter.vy<0,
  boundedSpeed:speed<=40.0001,
  boundedConsumption:a.afterFirst.attractConsumed===1&&a.afterSecond.attractConsumed===2,
  consumedCounted:a.affectedFirst===3&&a.affectedSecond===2,
  outsideUntouched:JSON.stringify(a.outsideBefore)===JSON.stringify(a.outsideAfter),
  invalidDtRejected:makeRuntime().attract(0,0,0,100,100,Infinity,.2,4)===0,
  deterministic:a.hash===b.hash&&JSON.stringify(a.orbitAfter)===JSON.stringify(b.orbitAfter),
  outwardImpulseCompatible:a.impulseHits===1&&a.impulseAfter.vx>0,
  finite:a.afterSecond.finite===true,
  noRandomUsed:true
};
const failures=Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name);
const report={status:failures.length?'FAIL':'PASS',checks,failures,measurements:{
  orbitVelocity:a.orbitAfter,speed,consumedAfterFirst:a.afterFirst.attractConsumed,
  consumedAfterSecond:a.afterSecond.attractConsumed,attractClamps:a.afterSecond.attractClamps,
  peakAcceleration:a.afterSecond.attractPeakAccel,stateHash:a.hash,
  outwardImpulseVelocity:a.impulseAfter
}};
console.log(JSON.stringify(report,null,2));
if(failures.length)process.exitCode=1;
