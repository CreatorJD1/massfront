import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const here=name=>fileURLToPath(new URL('../'+name,import.meta.url));
const [index,hud,css,cinematic,hotslots,verifier]=await Promise.all([
  'index.html','src/ui/hud.js','src/styles/ui.css','src/ui/cinematic-hud.js','src/ui/hotslots.js','tools/verify-cinematic-hud.mjs'
].map(async name=>readFile(here(name),'utf8')));

assert.match(index,/<div id="goalBar" role="status" aria-live="polite" aria-atomic="true">\s*<button type="button" id="goalDetailBtn"/,
  'mission rail does not separate its live status container from one native action');
assert.match(hud,/mfBindTap\(goalAction,[\s\S]*?goalAction\.innerHTML=h/,
  'mission detail button is not the single authoritative action/render target');
assert.doesNotMatch(hud,/gb\.onclick\s*=\s*\(\)\s*=>\s*toast/,
  'legacy pointer-only mission rail handler remains active');
assert.match(css,/#goalDetailBtn\{[^}]*display:flex[^}]*width:100%[^}]*font:inherit/,
  'mission detail action does not fill and inherit the compact status rail');
assert.match(css,/#goalDetailBtn:focus-visible\{[^}]*outline:/,
  'mission detail action has no visible keyboard focus');
assert.match(hotslots,/hotUtilityPanel\.setAttribute\('data-mf-hud-role','utility-drawer'\)/,
  'dynamic Utility drawer is not self-identifying before cinematic sync');

const required=['inbox','speed','pause','minimap','missionStatus','missionAction','deckTabs','ordersTab','platoonsTab',
  'buildingsTab','abilitiesTab','viewTab','army','idleBuilders','boxSelect','stop','build','patrol','hold','formation',
  'attackMove','clearSelection','rotateLeft','zoomIn','tilt','zoomOut','rotateRight','feed','transmission','hotslots','utility'];
for(const key of required)assert.match(cinematic,new RegExp('\\b'+key+':mfCinematicAuthoritySnapshot\\('),
  'cinematic snapshot omits '+key);
assert.match(cinematic,/duplicateCount:Math\.max\(0,nodes\.length-1\)/,
  'per-control authority snapshots do not expose duplicate counts');
assert.match(cinematic,/authorityDuplicateCount:authorityDuplicateCount,authorityFailures:authorityFailures/,
  'aggregate authority proof omits duplicate/failure inventory');
assert.match(verifier,/mission rail is a live status with one native briefing action/,
  'runtime verifier does not enforce mission keyboard/AT semantics');
assert.match(verifier,/canonical HUD authority inventory is complete and duplicate-free/,
  'runtime verifier does not enforce the expanded canonical inventory');

console.log('PASS — mission status/action semantics and canonical cinematic HUD authority inventory are source-locked');
