#!/usr/bin/env node
/* Isolated production-function contract: terrainDirty is shared by impacts
   and visual/foundation refreshes, but only actual positive deformation may
   create a shoreline flood. */
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const terrain=read('src/engine/terrain.js');
const glsrc=read('src/engine/gl.js');
let failures=0;
function check(ok,msg){
  if(ok) console.log(`PASS ${msg}`);
  else{ failures++; console.error(`FAIL ${msg}`); }
}

const start=terrain.indexOf('function terrainDirty(');
const end=terrain.indexOf('/* Rebuild the flooded sheet',start);
check(start>=0&&end>start,'production terrainDirty function is extractable');

let reactions=[];
const context={
  Number,Math,
  waterReactDeform:(...args)=>reactions.push(args),
  terrVerts:null
};
vm.createContext(context);
vm.runInContext(`${terrain.slice(start,end)}\nthis.__terrainDirty=terrainDirty;`,context);
const dirty=context.__terrainDirty;

const rejected=[undefined,0,-0,-1,NaN,Infinity,-Infinity,'1',null];
for(const depth of rejected) dirty(10,20,30,depth);
check(reactions.length===0,'no-depth, zero, negative, non-finite and non-number refreshes do not drive hydrology');
dirty(10,20,30,0.001);
dirty(11,21,31,4);
check(reactions.length===2&&reactions[0][3]===0.001&&reactions[1][3]===4,
  'positive finite impact depths retain shoreline reaction');

const foundation=glsrc.slice(glsrc.indexOf('function makeFoundation('),glsrc.indexOf('function makeOrganicFoundation('));
const organic=glsrc.slice(glsrc.indexOf('function makeOrganicFoundation('),glsrc.indexOf('const ORGANIC_SPREAD_MUL'));
const deform=glsrc.slice(glsrc.indexOf('function applyDeform('),glsrc.indexOf('function accBounds('));
check(/terrainDirty\(B\.x,B\.y,[^;]+\);/.test(foundation)&&!foundation.includes(',depth)'),
  'mechanical foundation refresh remains a no-depth caller');
check(/terrainDirty\(B\.x,B\.y,[^;]+\);/.test(organic),
  'organic foundation refresh remains a no-depth caller');
check(deform.includes('terrainDirty(D.x,D.y,D.r*1.82,D.d);'),
  'authoritative impact deformation still forwards its positive depth');

if(failures){
  console.error(`${failures} foundation hydrology boundary contract(s) failed`);
  process.exit(1);
}
console.log('Foundation hydrology boundary contracts passed');
