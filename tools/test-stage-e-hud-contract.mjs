#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [hud,stack,cinematic,hudflow,css]=await Promise.all([
  'src/ui/hud.js','src/ui/unit-stack-hotbar.js','src/ui/cinematic-hud.js','src/ui/hudflow.js','src/styles/ui.css'
].map(path=>readFile(new URL('../'+path,import.meta.url),'utf8')));

assert.match(hud,/paintMs=total>1500\?125:100/,'minimap lacks unit-load-aware 8-10 Hz scheduling');
assert.match(hud,/wrap&&wrap\.dataset\.transmission\)\{mmTransmissionSkips\+\+;return;\}/,
  'minimap does not suspend beneath Commander/KEEL transmissions');
assert.match(hud,/function mmFogComposite[\s\S]*mmFogNext=now\+500/,
  'fog is not cached on an independent slow cadence');
assert.match(hud,/if\(mmFogComposite\(S,now\)\)mm\.drawImage\(mmFogLayer,0,0\)/,
  'cached fog is not composited into the live command map');
assert.match(hud,/cmdrTxReset[\s\S]{0,700}mmNextPaint=0;mmFogNext=0/,
  'minimap is not invalidated when a transmission releases the receiver');
assert.match(hud,/MFUnitStackHotbar\.selection\(stackSelection\)/,
  'selection HUD does not hand its existing scan to the stack rail');
assert.doesNotMatch(hud,/if\(tac\) tac\.style\.display=/,
  'selection HUD still writes the tactical row style every paint');

assert.match(stack,/MF_UNIT_STACK_AUDIT_MS=2000/,'stack cache lacks a slow repair audit');
assert.match(stack,/mfUnitStackMembersByType/,'stack status does not use cached local memberships');
assert.match(stack,/dataset\.mfOverflow/,'stack rail has no explicit scroll continuation state');

assert.match(cinematic,/data-mf-hud-secondary/,'cinematic HUD lacks event-derived surface state');
assert.match(cinematic,/mfHudSecondaryOpen/,'responsive layout cannot consume the derived surface state');
assert.match(hudflow,/hudFrame%10[\s\S]{0,600}cmdrTxTick\(\)/,
  'consolidated HUD cadence makes Commander/KEEL receiver animation step at 6 Hz');
assert.match(css,/mfHudSecondaryOpen #minimapWrap/,'minimap geometry does not consume derived HUD state');
assert.match(css,/--mfHudTouch:clamp\(44px/,'Stage E regressed the 44px touch floor');
assert.match(css,/--sat\)/,'Stage E lost safe-area anchoring');
assert.match(css,/\.mfUnitStackName\{[\s\S]{0,220}-webkit-line-clamp:2/,
  'exact-model stack labels do not have a bounded two-line presentation');

console.log('PASS — Stage E HUD scheduling, transmission suspension, stack caching, scroll affordance, safe areas, and touch floors are present');
