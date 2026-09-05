#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const hud=readFileSync(new URL('../src/ui/hud.js',import.meta.url),'utf8');
const start=hud.indexOf('function mfUnitProductionQuote(');
const end=hud.indexOf('function mfStructureBuildSpeed(',start);
assert(start>=0&&end>start,'mfUnitProductionQuote source slice');
const quoteSource=hud.slice(start,end);

function quote(bt,B,{duration=true,speed=1}={}){
  const ctx={
    TYPES:[{cm:10,ce:20,bt,r:4}],BT:{fac:{name:'Factory'}},
    factionDoctrineUnitCost:T=>({m:T.cm,e:T.ce}),
    mfUnitSizeBand:()=>({diameter:8,label:'LIGHT'}),
    hudPlayerPop:()=>({used:0,cap:500}),
    mfFactorySpeed:(actualB,T)=>{assert.equal(actualB,B);assert.equal(T.bt,bt);return speed;},
    result:null
  };
  if(duration)ctx.mfProductionDuration=T=>Math.max(8,4+3*T.bt);
  ctx.inputB=B;
  vm.runInNewContext(`const MF_PRODUCTION_QUEUE_CAP=30;${quoteSource}\nresult=mfUnitProductionQuote(0,inputB);`,
    ctx,{filename:'unit-intel-production-quote.js'});
  return ctx.result;
}

const neutral4=quote(4,null),neutral5=quote(5,null);
assert.equal(neutral4.baseSeconds,4,'authored work remains exposed');
assert.equal(neutral4.effectiveSeconds,16,'bt4 neutral production duration');
assert.equal(neutral5.effectiveSeconds,19,'bt5 neutral production duration');

const factory={team:0,type:'fac',tier:1,queue:[]};
const live=quote(5,factory,{speed:.5});
assert.equal(live.baseSeconds,5,'factory quote retains authored work');
assert.equal(live.effectiveSeconds,10,'selected factory uses its live production speed');

const legacy=quote(5,null,{duration:false});
assert.equal(legacy.effectiveSeconds,5,'older packs without duration authority retain raw authored fallback');

console.log(JSON.stringify({status:'PASS',neutralBt4:16,neutralBt5:19,selectedFactory:10,legacyFallback:5},null,2));
