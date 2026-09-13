#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root=name=>fileURLToPath(new URL('../'+name,import.meta.url));
const [hud,stack]=await Promise.all([
  readFile(root('src/ui/hud.js'),'utf8'),
  readFile(root('src/ui/unit-stack-hotbar.js'),'utf8')
]);
const between=(text,start,end)=>{
  const a=text.indexOf(start),b=text.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'missing source contract between '+start+' and '+end);
  return text.slice(a,b);
};
const unit=between(hud,'function unitIconEl(','function bldIconEl(');
const building=between(hud,'function bldIconEl(','/* The open tab persists');

assert.equal((hud.match(/mfCreateWebGL2\(/g)||[]).length,1,
  'HUD thumbnail/live-preview pipeline must allocate exactly one shared WebGL2 context');
assert.match(hud,/let mfIntel3DGL=null,mfIntel3DSurf=null,mfIntel3DProg=null/,
  'runtime thumbnails no longer share the Intel preview context');
assert.match(hud,/const mfIntelThumbCache=new Map\(\),mfIntelThumbWait=new Map\(\),mfIntelThumbQueue=\[\],mfIntelThumbState=new Map\(\)/,
  'runtime thumbnail cache lacks deterministic per-model state');

assert.match(unit,/mfIntelThumbRequest\(live,w,'unit',tIdx,kit\)/,
  'unit icon does not always request exact runtime faction geometry');
assert.doesNotMatch(unit,/mfFacUnitIcon|\bmakeIcon\(|\bitemArt\(/,
  'unit icon can still substitute generic/static art for the runtime model');
assert.match(building,/mfIntelThumbRequest\(live,d,'building',key,kit\)/,
  'building icon does not always request exact runtime faction geometry');
assert.doesNotMatch(building,/mfFacBldIcon|\bmakeIcon\(|\bitemArt\(|atlasCanvas/,
  'building icon can still substitute generic/static art for the runtime model');

assert.match(hud,/holder\.dataset\.mfModelKey=key[\s\S]{0,260}holder\.dataset\.mfThumbStatus=status/,
  'thumbnail holders do not expose exact model identity and readiness');
assert.match(hud,/mfIntelThumbHolder\(holder,key,kind,id,kit,'ready','runtime-geometry'\)/,
  'visible readiness does not prove runtime-geometry ownership');
assert.match(hud,/window\.MFIntelRuntimeThumbnails=Object\.freeze\(\{snapshot:mfIntelThumbSnapshot\}\)/,
  'runtime thumbnail readiness has no deterministic verification API');
assert.match(hud,/sharedContextCount:mfIntel3DGL\?1:0,sharedSurfaceCount:mfIntel3DSurf\?1:0/,
  'thumbnail snapshot does not prove the one-context contract');
assert.match(hud,/icon\.replaceChildren\(bldIconEl\(type,36,finderKit\)\)/,
  'Base Finder still substitutes a generic building symbol');

assert.match(stack,/ready=row\.ready===row\.count\?'':row\.ready\+' RDY'/,
  'unit-stack cards repeat ready counts even when the visual ready state is sufficient');
assert.match(stack,/view\.name\.title=row\.name/,
  'a compact/clamped stack label has no full-name disclosure');
assert.match(stack,/labelClipped:[\s\S]{0,220}thumbnailStatus:[\s\S]{0,120}thumbnailSource:/,
  'unit-stack snapshot cannot report label clipping and runtime thumbnail readiness');

console.log('PASS — unit/building UI art resolves exact runtime geometry through one shared GL context with truthful fallback and observable readiness');
