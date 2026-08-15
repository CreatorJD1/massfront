/* Guard the Umbral Brood organic material & model contract without booting WebGL.
   Brood creatures rely on organic materials (CHITIN, LEAF, BIO_TEAM) for breathing
   and limb springs. MAT.SERVO must never be worn by Brood units. */
import fs from 'node:fs';

const file='src/engine/models-units-brood.js';
const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
let failed=0;
const fail=message=>{ console.error('FAIL '+message); failed++; };
const pass=message=>console.log('PASS '+message);

function blockAfter(marker){
  const start=source.indexOf(marker);
  if(start<0) return '';
  let depth=0, opened=false;
  for(let i=start;i<source.length;i++){
    const ch=source[i];
    if(ch==='{'){ depth++; opened=true; }
    else if(ch==='}'&&opened&&--depth===0) return source.slice(start,i+1);
  }
  return '';
}

const registry=blockAfter('const UNIT_MDL_BROOD=');
/* The slots that MUST be routed: the two wildlife animals and the three
   bespoke units this file was written for. It is no longer an exhaustive list.
   The registry started as an exclusive override for five slots, and this check
   failed on any `extra` — which made it fail the moment the kit legitimately
   grew, e.g. when the twelve slots that shared mdlHordeSpitter and
   mdlHordeBombardier were split into their own builders. What actually matters
   is that the five originals are still routed and that nothing claims a slot
   outside the roster; an extra Brood slot getting its own organic model is the
   goal here, not a regression. */
const requiredSlots=[12,13,30,31,32];
const remainingSlots=[0,4,5,8,9,11,14,15,17,18,19,23,24,25];
const ROSTER_MAX=32;

if(!registry) fail('Brood unit registry is present');
else {
  const slots=[...registry.matchAll(/(\d+)\s*:\s*brdBroodFactory\(/g)].map(m=>Number(m[1]));
  const missing=requiredSlots.filter(slot=>!slots.includes(slot));
  const missingRemain=remainingSlots.filter(slot=>!slots.includes(slot));
  const oob=slots.filter(slot=>!(Number.isInteger(slot)&&slot>=0&&slot<=ROSTER_MAX));
  const dupes=slots.filter((s,i)=>slots.indexOf(s)!==i);
  if(missing.length) fail('Brood registry slots (missing '+missing.join(',')+')');
  else if(missingRemain.length) fail('Brood remaining-split slots (missing '+missingRemain.join(',')+')');
  else if(oob.length) fail('Brood registry slots outside the roster: '+oob.join(','));
  else if(dupes.length) fail('Brood registry slots declared twice: '+dupes.join(','));
  else pass('Brood roster routes all organic slots ('+slots.slice().sort((a,b)=>a-b).join(', ')+')');
}

const remainNames=new Map();
for(const m of source.matchAll(/(\d+)\s*:\s*brdBroodFactory\((mdlBrd\w+)/g)){
  const slot=Number(m[1]);
  if(!remainingSlots.includes(slot)) continue;
  if([...remainNames.values()].includes(m[2])) fail('remaining slot '+slot+' shares builder '+m[2]);
  remainNames.set(slot,m[2]);
}
const remainMissing=remainingSlots.filter(s=>!remainNames.has(s));
if(remainMissing.length) fail('remaining slots missing dedicated mdlBrd builders: '+remainMissing.join(','));
else pass('Fourteen remaining slots have distinct dedicated builders ('+[...remainNames.values()].join(', ')+')');

if(/m\.mat\(MAT\.SERVO\)/.test(source)) fail('Brood source never applies MAT.SERVO');
else pass('Raw MAT.SERVO assignment is absent from all Brood organic models');

if(!/brdShell/.test(source)||!/brdLimb/.test(source)||!/brdLivery/.test(source))
  fail('Brood surface declaration helpers are present');
else pass('Brood organic surface helpers (brdShell, brdLimb, brdLivery) present');

if(!/SERVO gets the machine walk/.test(source))
  fail('Brood organic SERVO rationale remains documented');
else pass('Brood organic material animation rationale remains documented');

if(failed) process.exit(1);
