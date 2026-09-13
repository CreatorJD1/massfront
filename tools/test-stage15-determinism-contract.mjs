#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..'),source=readFileSync(resolve(root,'src/game/determinism.js'),'utf8');
function runtime(){const ctx={window:{addEventListener(){}}};vm.createContext(ctx);vm.runInContext(source,ctx);return ctx.window.MFDeterministicSim;}
const a=runtime(),b=runtime();
a.reset('match-42');b.reset('match-42');
for(let tick=1;tick<=90;tick++){
  assert.equal(a.beginStep(1/30),tick);assert.equal(b.beginStep(1/30),tick);
  for(let n=0;n<7;n++)assert.equal(a.random(),b.random());
  a.endStep();b.endStep();
}
assert.deepEqual({...a.snapshot()},{...b.snapshot()});
assert.equal(a.snapshot().tick,90);assert.equal(a.snapshot().micros,2999970);
assert.equal(a.snapshot().calls,630);assert.equal(a.snapshot().active,false);
const saved={...a.snapshot()},next=a.random();assert.equal(a.restore(saved),true);assert.equal(a.random(),next);
assert.equal(a.restore({...saved,active:true}),false);
assert.throws(()=>a.beginStep(0));assert.equal(a.beginStep(1/30,91),91);assert.throws(()=>a.beginStep(1/30,92));a.endStep();
a.reset('match-43');assert.notEqual(a.random(),b.random());
console.log('PASS Stage 15 deterministic simulation clock/RNG contract');
