import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/ui/render3d.js',import.meta.url),'utf8');
function sliceBetween(a,b){
  const p=source.indexOf(a),q=source.indexOf(b,p);
  assert.ok(p>=0&&q>p,`missing source slice ${a} -> ${b}`);
  return source.slice(p,q);
}

/* Run the actual renderer cache implementation in an isolated classic-script
   context. This is intentionally not a reimplementation of the algorithm. */
{
  const MAXPART=9000,flife=new Float32Array(MAXPART);
  flife[0]=1;flife[1]=1;flife[2]=1;
  const ctx=vm.createContext({MAXPART,flife,fHead:3,fCount:3,Int32Array,Math,window:{}});
  vm.runInContext(sliceBetween('let _mfFpI=','function unitGroundY')+
    '\nthis.api={begin:mfRenderParticleCacheBegin,indices:()=>Array.from(_mfFpI.slice(0,_mfFpN)),tel:MF_RENDER_PARTICLE_CACHE_TELEMETRY};',ctx);
  assert.equal(ctx.api.begin(),3);
  assert.equal(ctx.api.indices().join(','),'0,1,2');
  assert.equal(ctx.api.tel.lastSlotsTested,MAXPART,'first observation must establish exact live membership');

  flife[1]=0;flife[3]=1;flife[4]=1;ctx.fHead=5;ctx.fCount=4;
  assert.equal(ctx.api.begin(),4);
  assert.equal(ctx.api.indices().join(','),'0,2,3,4');
  assert.equal(ctx.api.tel.lastSlotsTested,5,'steady work is live candidates plus new ring writes');
  assert.ok(ctx.api.tel.lastSlotsTested<MAXPART/1000,'sparse steady frame must avoid the 9000-slot scan');

  /* An out-of-band transition models reset/recovery corruption. fCount proves
     the incremental membership is incomplete and forces an exact full repair. */
  flife[777]=1;ctx.fCount=5;
  assert.equal(ctx.api.begin(),5);
  assert.ok(ctx.api.indices().includes(777));
  assert.equal(ctx.api.tel.reconciles,1);
}

/* HIGH alpha blending historically walked numeric slot order. Exercise the
   real ring wrap and an equal-count out-of-band replacement; membership and
   order must both remain identical to a 0..MAXPART legacy scan. */
{
  const MAXPART=9000,flife=new Float32Array(MAXPART);
  flife[8997]=1;flife[8998]=1;flife[8999]=1;
  const ctx=vm.createContext({MAXPART,flife,fHead:0,fCount:3,Int32Array,Uint32Array,Math,window:{}});
  vm.runInContext(sliceBetween('let _mfFpI=','function unitGroundY')+
    '\nthis.api={begin:mfRenderParticleCacheBegin,indices:()=>Array.from(_mfFpI.slice(0,_mfFpN)),tel:MF_RENDER_PARTICLE_CACHE_TELEMETRY};',ctx);
  ctx.api.begin();
  flife[8997]=0;flife[0]=1;flife[1]=1;ctx.fHead=2;ctx.fCount=4;
  ctx.api.begin();
  assert.equal(ctx.api.indices().join(','),'0,1,8998,8999','wrap must retain legacy ascending alpha order');
  assert.equal(ctx.api.tel.lastSlotsTested,5);
  assert.equal(ctx.api.tel.lastOrderWords,Math.ceil(MAXPART/32));

  flife[8998]=0;flife[777]=1;ctx.fCount=4; // same head and same count
  ctx.api.begin();
  assert.equal(ctx.api.indices().join(','),'0,1,777,8999','equal-count replacement must reconcile exact membership');
  assert.equal(ctx.api.tel.reconciles,1);

  flife.fill(0);for(const i of [3,50,400,8000])flife[i]=1;
  ctx.fHead=51;ctx.fCount=4;
  ctx.api.begin();
  assert.equal(ctx.api.indices().join(','),'3,50,400,8000','reset/head jump must retain legacy ascending order');
}

{
  const unitHigh=1000,ualive=new Uint8Array(unitHigh),usel=new Uint8Array(unitHigh),
    ux=new Float32Array(unitHigh),uy=new Float32Array(unitHigh),uteam=new Uint8Array(unitHigh);
  const uActive=new Int32Array(unitHigh);uActive.set([2,700,999]);
  for(const i of [2,700,999]){ualive[i]=1;ux[i]=i;uy[i]=10;}
  usel[999]=1;
  const ctx=vm.createContext({unitHigh,ualive,usel,ux,uy,uteam,uActive,uActiveCount:3,
    Int32Array,Uint32Array,Float64Array,window:{},fogEntityVisible:()=>true});
  vm.runInContext(sliceBetween('let _mfRuI=','function mfRenderUnitFogVisible')+
    '\nthis.api={begin:mfRenderUnitCacheBegin,indices:()=>Array.from(_mfRuI.slice(0,_mfRuN)),tel:MF_RENDER_UNIT_CACHE_TELEMETRY};',ctx);
  const selected=ctx.api.begin((x)=>x>=700,0);
  assert.equal(selected,1);
  assert.equal(ctx.api.indices().join(','),'700,999');
  assert.equal(ctx.api.tel.alive,3);
  assert.equal(ctx.api.tel.slotsVisited,3);
  assert.equal(ctx.api.tel.slotHighWater,unitHigh);
  assert.equal(ctx.api.tel.denseSource,true);
}

/* Reference-load work counters: these are slot visits from the actual cache,
   not wall-clock timing, so host CPU noise cannot turn the contract flaky. */
{
  const MAXPART=9000,flife=new Float32Array(MAXPART);flife.fill(1,0,2000);
  const ctx=vm.createContext({MAXPART,flife,fHead:2000,fCount:2000,Int32Array,Math,window:{}});
  vm.runInContext(sliceBetween('let _mfFpI=','function unitGroundY')+
    '\nthis.api={begin:mfRenderParticleCacheBegin,tel:MF_RENDER_PARTICLE_CACHE_TELEMETRY};',ctx);
  ctx.api.begin();ctx.api.begin();
  assert.equal(ctx.api.tel.lastSlotsTested,2000);
  assert.equal(ctx.api.tel.lastOrderWords,Math.ceil(MAXPART/32));
  console.log(`MEASURE particle steady slots: ${ctx.api.tel.lastSlotsTested}/${MAXPART} (${(100*(1-ctx.api.tel.lastSlotsTested/MAXPART)).toFixed(1)}% fewer)`);
  console.log(`MEASURE particle order index: ${ctx.api.tel.lastOrderWords} words + ${ctx.api.tel.candidates} live bits`);
}
{
  const unitHigh=4000,activeN=2000,ualive=new Uint8Array(unitHigh),usel=new Uint8Array(unitHigh),
    ux=new Float32Array(unitHigh),uy=new Float32Array(unitHigh),uteam=new Uint8Array(unitHigh),uActive=new Int32Array(unitHigh);
  for(let n=0;n<activeN;n++){const i=n*2;uActive[n]=i;ualive[i]=1;ux[i]=i;}
  const ctx=vm.createContext({unitHigh,ualive,usel,ux,uy,uteam,uActive,uActiveCount:activeN,
    Int32Array,Uint32Array,Float64Array,window:{},fogEntityVisible:()=>true});
  vm.runInContext(sliceBetween('let _mfRuI=','function mfRenderUnitFogVisible')+
    '\nthis.api={begin:mfRenderUnitCacheBegin,tel:MF_RENDER_UNIT_CACHE_TELEMETRY};',ctx);
  ctx.api.begin(()=>true,0);
  assert.equal(ctx.api.tel.slotsVisited,activeN);
  console.log(`MEASURE unit cache slots: ${ctx.api.tel.slotsVisited}/${unitHigh} (${(100*(1-activeN/unitHigh)).toFixed(1)}% fewer after churn)`);
}

console.log('render dense-scan contract: PASS');
