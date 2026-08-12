/* Guard the Crimson Dominion semantic-pack contract without booting WebGL.
   SERVO is not an ordinary material: mesh.js reads its raw material id as a
   vertex-stage gait marker. A Dominion pack must never remap it, otherwise
   walker/constructor limbs stop following their gait transform. */
import fs from 'node:fs';

const file='src/engine/models-units-legion.js';
const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
let failed=0;
const fail=message=>{ console.error('FAIL '+message); failed++; };
const pass=message=>console.log('PASS '+message);

function blockAfter(marker){
  const start=source.indexOf(marker);
  if(start<0)return '';
  let depth=0,opened=false;
  for(let i=start;i<source.length;i++){
    const ch=source[i];
    if(ch==='{'){depth++;opened=true;}
    else if(ch==='}'&&opened&&--depth===0)return source.slice(start,i+1);
  }
  return '';
}

const registry=blockAfter('const UNIT_MDL_LEGION=');
const packs=blockAfter('const DOM_LEGION_BESPOKE_PACKS=');
const shared=blockAfter('const DOM_LEGION_MAT=');
const expectedRegistry=[0,1,2,3,5,6,7,8,9,10,11,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,32];
/* The D1-D3 Dominion scope covers every real playable roster slot. These are
   semantic-bake contracts, not a claim that every slot already owns UV maps. */
const expectedPackSlots=expectedRegistry;

if(!registry)fail('Dominion registry is present');
else{
  const wrapped=[...registry.matchAll(/^\s*(\d+)\s*:\s*domLegionFactory\(/gm)].map(m=>Number(m[1]));
  const missing=expectedRegistry.filter(slot=>!wrapped.includes(slot));
  const extra=wrapped.filter(slot=>!expectedRegistry.includes(slot));
  if(missing.length||extra.length)fail('Dominion registry wrapper slots (missing '+missing.join(',')+'; extra '+extra.join(',')+')');
  else pass('Dominion roster routes all stated slots through domLegionFactory');
}

if(!packs)fail('Dominion bespoke pack registry is present');
else{
  const slots=[...packs.matchAll(/^\s*(\d+)\s*:\s*Object\.freeze\(/gm)].map(m=>Number(m[1]));
  const missing=expectedPackSlots.filter(slot=>!slots.includes(slot));
  const extra=slots.filter(slot=>!expectedPackSlots.includes(slot));
  if(missing.length||extra.length)fail('Dominion bespoke pack slots (missing '+missing.join(',')+'; extra '+extra.join(',')+')');
  else pass('Dominion bespoke pack slots match the D1-D3 contract');
  for(const slot of slots){
    if(!new RegExp('^\\s*'+slot+'\\s*:\\s*domLegionFactory\\(','m').test(registry))
      fail('Pack slot '+slot+' is routed through the Dominion factory');
  }
  if(!failed)pass('Every bespoke pack slot has a Dominion semantic factory route');
}

const rawServoKey=/\[MAT\.SERVO\]\s*:/;
if(rawServoKey.test(shared)||rawServoKey.test(packs))fail('Raw SERVO is never remapped by Dominion semantic material maps');
else pass('Raw SERVO is absent from all Dominion semantic remap maps');

if(!/const dst=pack&&pack\.surfaces\[src\]!==undefined\?pack\.surfaces\[src\]:DOM_LEGION_MAT\[src\];/.test(source)||
   !/if\(dst!==undefined\)v\[o\]=sgn\*\(\(dst\+1\)\+\(packed-whole\)\);/.test(source))
  fail('Surface pass preserves unmapped raw material ids');
else pass('Surface pass leaves unmapped gait markers untouched');

if(!/const key=slot\+'\:'\+fn\.name;/.test(source))
  fail('Factory cache keys include the unit slot so shared geometry retains its own pack');
else pass('Factory cache preserves individual contracts for shared geometry');

if(!/Keep SERVO out of these overrides/.test(source)||!/vertex-stage gait\s+marker/.test(source))
  fail('SERVO gait-marker rationale remains documented beside the packs');
else pass('SERVO gait-marker safeguard remains documented');

if(failed)process.exit(1);
