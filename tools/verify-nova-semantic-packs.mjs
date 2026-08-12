/* Guard the Nova semantic-pack contract without booting WebGL.
   SERVO is not a cosmetic material: the vertex stage reads its raw material
   id as a gait marker. A semantic remap must never turn it into NOVA_SERVO or
   any other material, even when a unit receives a bespoke surface contract. */
import fs from 'node:fs';

const file='src/engine/models-units-nova.js';
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

const registry=blockAfter('const UNIT_MDL_NOVA=');
const packs=blockAfter('const TFC_NOVA_BESPOKE_PACKS=');
const shared=blockAfter('const TFC_NOVA_MAT=');
/* The catalogue expanded after the original N1-N4 pilot. Keep this gate in
   lockstep with the live roster so a newly covered unit is not misreported as
   a regression merely because the validator still knows the old milestone. */
const expectedPackSlots=[0,1,2,3,4,5,6,7,8,9,10,11,14,15,16,17,18,19,20,21,22,23,24,25,26,27,32];

if(!registry) fail('Nova registry is present');
else {
  const wrapped=[...registry.matchAll(/^\s*(\d+)\s*:\s*tfcNovaFactory\(/gm)].map(m=>Number(m[1]));
  const expectedRegistry=[0,1,2,3,4,5,6,7,8,9,10,11,14,15,16,17,18,19,20,21,22,23,24,25,26,27,32];
  const missing=expectedRegistry.filter(slot=>!wrapped.includes(slot));
  const extra=wrapped.filter(slot=>!expectedRegistry.includes(slot));
  if(missing.length||extra.length) fail('Nova registry wrapper slots (missing '+missing.join(',')+'; extra '+extra.join(',')+')');
  else pass('Nova roster routes all stated slots through tfcNovaFactory');
}

if(!packs) fail('Nova bespoke pack registry is present');
else {
  const slots=[...packs.matchAll(/^\s*(\d+)\s*:\s*Object\.freeze\(/gm)].map(m=>Number(m[1]));
  const missing=expectedPackSlots.filter(slot=>!slots.includes(slot));
  const extra=slots.filter(slot=>!expectedPackSlots.includes(slot));
  if(missing.length||extra.length) fail('Nova bespoke pack slots (missing '+missing.join(',')+'; extra '+extra.join(',')+')');
  else pass('Nova bespoke pack slots match the authored N1-N4 contract');
  for(const slot of slots){
    if(!new RegExp('^\\s*'+slot+'\\s*:\\s*tfcNovaFactory\\(', 'm').test(registry))
      fail('Pack slot '+slot+' is routed through the Nova factory');
  }
  if(!failed) pass('Every bespoke pack slot has a Nova semantic factory route');
}

const rawServoKey=/\[MAT\.SERVO\]\s*:/;
if(rawServoKey.test(shared)||rawServoKey.test(packs)) fail('Raw SERVO is never remapped by Nova semantic material maps');
else pass('Raw SERVO is absent from all Nova semantic remap maps');

if(!/,src=whole-1;/.test(source)||!/(?:pack&&pack\.surfaces\[src\]!==undefined\?pack\.surfaces\[src\]:TFC_NOVA_MAT\[src\])/.test(source))
  fail('Surface pass preserves unmapped raw material ids');
else pass('Surface pass leaves unmapped gait markers untouched');

if(!/(?:SERVO geometry below the hip line|SERVO is deliberately absent)/.test(source))
  fail('SERVO gait-marker rationale remains documented beside the packs');
else pass('SERVO gait-marker safeguard remains documented');

if(failed) process.exit(1);
