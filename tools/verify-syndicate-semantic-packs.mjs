/* Guard the Syndicate Coalition semantic-pack contract without booting WebGL.
   SERVO is not a cosmetic material: the vertex stage reads its raw material
   id as a gait marker on the Titan. A semantic remap must never alter it. */
import fs from 'node:fs';

const file='src/engine/models-units-syndicate.js';
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

const registry=blockAfter('const UNIT_MDL_SYNDICATE=');
const packs=blockAfter('const COA_SYN_BESPOKE_PACKS=');
const expectedPackSlots=[0,1,2,3,5,6,7,8,9,10,11,14,15,16,17,18,19,20,21,22,23,24,25,26,27,29,32];

if(!registry) fail('Syndicate registry is present');
else {
  const wrapped=[...registry.matchAll(/(\d+)\s*:\s*coaSyndicateFactory\(/g)].map(m=>Number(m[1]));
  const expectedRegistry=[0,1,2,3,5,6,7,8,9,10,11,14,15,16,17,18,19,20,21,22,23,24,25,26,27,29,32];
  const missing=expectedRegistry.filter(slot=>!wrapped.includes(slot));
  const extra=wrapped.filter(slot=>!expectedRegistry.includes(slot));
  if(missing.length||extra.length) fail('Syndicate registry wrapper slots (missing '+missing.join(',')+'; extra '+extra.join(',')+')');
  else pass('Syndicate roster routes all stated slots through coaSyndicateFactory');
}

if(!packs) fail('Syndicate bespoke pack registry is present');
else {
  const slots=[...packs.matchAll(/(\d+)\s*:\s*Object\.freeze\(/g)].map(m=>Number(m[1]));
  const missing=expectedPackSlots.filter(slot=>!slots.includes(slot));
  const extra=slots.filter(slot=>!expectedPackSlots.includes(slot));
  if(missing.length||extra.length) fail('Syndicate bespoke pack slots (missing '+missing.join(',')+'; extra '+extra.join(',')+')');
  else pass('Syndicate bespoke pack slots match the S1-S3 contract');
  for(const slot of slots){
    if(!new RegExp(slot+'\\s*:\\s*coaSyndicateFactory\\(').test(registry))
      fail('Pack slot '+slot+' is routed through the Syndicate factory');
  }
  if(!failed) pass('Every bespoke pack slot has a Syndicate semantic factory route');
}

const rawServoKey=/\[MAT\.SERVO\]\s*:/;
if(rawServoKey.test(packs)) fail('Raw SERVO is never remapped by Syndicate semantic material maps');
else pass('Raw SERVO is absent from all Syndicate semantic remap maps');

if(!/,src=whole-1;/.test(source)||!/(?:pack&&pack\.surfaces\[src\]!==undefined\?pack\.surfaces\[src\]:COA_SYN_MAT\[src\])/.test(source))
  fail('Surface pass preserves unmapped raw material ids');
else pass('Surface pass leaves unmapped gait markers untouched');

if(!/COA_SYN_FACTORY_CACHE/.test(source))
  fail('Factory cache preserves individual contracts for shared geometry');
else pass('Factory cache preserves individual contracts for shared geometry');

if(!/SERVO                 marks a surface as a LEG/.test(source))
  fail('SERVO gait-marker rationale remains documented beside the components');
else pass('SERVO gait-marker safeguard remains documented');

if(failed) process.exit(1);
