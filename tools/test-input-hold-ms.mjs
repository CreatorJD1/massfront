/* Gate for the battlefield tap/hold dead zone.
   Tap used to require <400 ms while intel-card hold armed at 520 ms, so a
   400–520 ms press did nothing. Both paths must share HOLD_MS. */
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const src=await readFile(resolve(fileURLToPath(new URL('../src/ui/input.js',import.meta.url))),'utf8');
const fail=[];
const assert=(ok,msg)=>{if(!ok)fail.push(msg);};

const decl=src.match(/const HOLD_MS=(\d+)/);
assert(decl,'HOLD_MS is not declared');
const ms=decl?+decl[1]:0;
assert(ms>=400&&ms<=700,'HOLD_MS='+ms+' is outside a mobile tap/hold range');

assert(/setTimeout\(\(\)=>\{[\s\S]*?\},HOLD_MS\)/.test(src),'intel-card hold timer does not use HOLD_MS');
assert(/performance\.now\(\)-p\.t<HOLD_MS/.test(src),'tap path does not use HOLD_MS');
assert(!/performance\.now\(\)-p\.t<\d+/.test(src),'tap path still has a numeric duration literal');
assert(!/setTimeout\(\(\)=>\{[\s\S]*?\},520\)/.test(src),'intel-card hold still hard-codes 520 ms');
assert(/p\.held=true/.test(src),'hold does not mark the pointer consumed');
assert(/!p\.held/.test(src),'tap path does not refuse a pointer that already held');

/* The 120 ms gap is the bug. Shared HOLD_MS makes every duration one of:
     t < HOLD_MS  → tap
     t >= HOLD_MS → hold (if a unit/building is under the finger)
   Never a silent discard. */
function classify(t,held){
  if(held) return 'hold';
  if(t<ms) return 'tap';
  return 'hold-release';
}
const table=[
  [120,false,'tap'],[399,false,'tap'],[400,false,'tap'],[450,false,'tap'],
  [519,false,'tap'],[520,true,'hold'],[600,true,'hold']
];
for(const [t,held,want] of table){
  const got=classify(t,held);
  assert(got===want,'duration '+t+'ms held='+held+' → '+got+' (want '+want+')');
}

if(fail.length){
  console.log('FAIL:\n  '+fail.join('\n  '));
  process.exitCode=1;
}else{
  console.log('PASS — tap and intel hold share HOLD_MS='+ms+'; 400–520 ms is a tap');
}
