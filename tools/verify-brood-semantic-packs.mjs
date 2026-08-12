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
const expectedSlots=[12,13,30,31,32];

if(!registry) fail('Brood unit registry is present');
else {
  const slots=[...registry.matchAll(/(\d+)\s*:\s*brdBroodFactory\(/g)].map(m=>Number(m[1]));
  const missing=expectedSlots.filter(slot=>!slots.includes(slot));
  const extra=slots.filter(slot=>!expectedSlots.includes(slot));
  if(missing.length||extra.length) fail('Brood registry slots (missing '+missing.join(',')+'; extra '+extra.join(',')+')');
  else pass('Brood roster routes all organic slots (30, 31, 32)');
}

if(/m\.mat\(MAT\.SERVO\)/.test(source)) fail('Brood source never applies MAT.SERVO');
else pass('Raw MAT.SERVO assignment is absent from all Brood organic models');

if(!/brdShell/.test(source)||!/brdLimb/.test(source)||!/brdLivery/.test(source))
  fail('Brood surface declaration helpers are present');
else pass('Brood organic surface helpers (brdShell, brdLimb, brdLivery) present');

if(!/SERVO gets the machine walk/.test(source))
  fail('Brood organic SERVO rationale remains documented');
else pass('Brood organic material animation rationale remains documented');

if(failed) process.exit(1);
