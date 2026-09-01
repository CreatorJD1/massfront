#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const here=name=>fileURLToPath(new URL('../'+name,import.meta.url));
const [stack,css,manifestText,boot,verifier]=await Promise.all([
  'src/ui/unit-stack-hotbar.js','src/styles/ui.css','assets/data/manifest.json','boot.js','tools/verify-cinematic-hud.mjs'
].map(async name=>readFile(here(name),'utf8')));
const manifest=JSON.parse(manifestText),path='src/ui/unit-stack-hotbar.js',bootPath='./'+path;

assert.equal(manifest.order.filter(value=>value===path).length,1,'bundler manifest does not own exactly one unit-stack module');
assert.equal((boot.match(new RegExp(bootPath.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length,1,
  'runtime boot manifest does not own exactly one unit-stack module');
assert.ok(manifest.order.indexOf(path)===manifest.order.indexOf('src/ui/hotslots.js')+1,
  'unit-stack takeover must load immediately after the HUD action takeover');

assert.match(stack,/const mfUnitStackCardMap=new Map\(\),mfUnitStackPointers=new Set\(\)/,
  'hotbar lacks keyed DOM ownership and an active-pointer topology guard');
assert.match(stack,/if\(!card&&!active\)\{card=mfUnitStackCard\(data\.type,kit\);rail\.appendChild\(card\);\}/,
  'hotbar does not reconcile cards by stable unit-type key');
assert.match(stack,/if\(!active\)for\(const \[type,card\] of mfUnitStackCardMap\)/,
  'hotbar may remove a card while a finger owns the rail');
assert.doesNotMatch(stack,/mfUnitStackRail\.(?:innerHTML|replaceChildren)/,
  'hotbar destroys the live rail during synchronization');
assert.match(stack,/addEventListener\('pointerup',mfUnitStackReleasePointer,\{passive:true,capture:true\}\)/,
  'pointer release is not captured before card commands stop propagation');
assert.match(stack,/addEventListener\('pointercancel',mfUnitStackReleasePointer,\{passive:true,capture:true\}\)/,
  'pointer cancellation is not captured before card commands stop propagation');

assert.match(stack,/mfLocalOwnsUnit==='function'\?mfLocalOwnsUnit\(i\):uteam\[i\]===0/,
  'unit grouping is not scoped to canonical local ownership');
assert.match(stack,/const byType=new Map\(\)/,'live units are not grouped by type');
assert.match(stack,/row\.health=Math\.round\(row\.hp\/row\.count\*100\)/,
  'cards omit average-health state');
assert.match(stack,/row\.ready\+=/,'cards omit readiness state');
assert.match(stack,/unitIconEl\(type,34,kit\)/,'cards do not request existing faction-authored unit art');
assert.match(stack,/mfUnitStackFallback/,'unit art has no safe fallback');

assert.match(stack,/clearSel\(\);for\(const i of members\)usel\[i\]=1/,
  'type activation bypasses canonical selection arrays');
assert.match(stack,/typeof updateSelInfo==='function'\)updateSelInfo\(\)/,
  'type activation does not refresh authoritative selection information');
assert.match(stack,/intelSeenTypes\[type\]=1;[\s\S]*updateSelInfo\(\)/,
  'stack activation can lose its second tap to first-seen Unit Intel');
assert.match(stack,/mfUnitStackLastType===type&&now-mfUnitStackLastAt<=700/,
  'second activation has no bounded camera-focus contract');
assert.match(stack,/cam\.x=cx;cam\.y=cy;[\s\S]{0,100}clampCam\(\);camUpdateMatrices\(\)/,
  'camera focus does not use the canonical camera/clamp pipeline');
assert.doesNotMatch(stack,/\b(?:ctrlGroups|saveGroup|recallGroup)\b/,
  'takeover mutates or replaces P1-P4 saved-platoon authority');
assert.match(stack,/const mfUnitStackBaseUpdateGroupBadges=[\s\S]*updateGroupBadges=function\(\)/,
  'takeover does not extend the existing group update loop');

assert.match(stack,/card=document\.createElement\('button'\);card\.type='button'/,
  'unit stacks are not native keyboard/assistive-technology actions');
assert.match(stack,/row\.selected===row\.count\?'true':row\.selected>0\?'mixed':'false'/,
  'full and partial stack selection state is not exposed to assistive technology');
assert.match(stack,/Activate twice to focus camera/,'action label does not disclose its second-activation behavior');
assert.match(stack,/row\.appendChild\(mfUnitStackRail\)/,'hotbar is not contained by the existing PLATOONS row');
assert.doesNotMatch(stack,/document\.body\.appendChild/,'hotbar creates a battlefield-level surface');

assert.match(css,/#mfUnitStackRail\{[^}]*overflow-x:auto[^}]*touch-action:pan-x/,
  'unit-stack rail is not a horizontally touch-scrollable lane');
assert.match(css,/#grpRow\.mfUnitStackReady>\.grpBtn\{flex:0 0 44px\}/,
  'P1-P4 do not retain 44px targets beside the dynamic rail');
assert.match(css,/\.mfUnitStackCard\{[^}]*min-height:44px[^}]*scroll-snap-align:start[^}]*touch-action:pan-x/,
  'unit-stack cards lack 44px targets or finger-scroll semantics');
assert.match(css,/body\.mf-cinematic-hud #grpRow\.mfUnitStackReady\{overflow:hidden\}/,
  'cinematic takeover lets the stack rail expand the command dock');

assert.match(verifier,/UNIT_STACK_SETUP_FAILED/,'live HUD verification does not exercise the unit-stack takeover');
assert.match(verifier,/stableNode:node===window\.__mfUnitStackVerifierNode/,
  'live verification does not prove keyed DOM stability across activation');
assert.match(verifier,/camera:\{x:cam\.x,y:cam\.y,error:Math\.hypot/,
  'live verification does not measure second-activation camera focus');
assert.match(verifier,/page\.touchscreen\.tap\(before\.point\.x,before\.point\.y\)[\s\S]*page\.touchscreen\.tap\(selected\.point\.x,selected\.point\.y\)/,
  'live verification does not prove the bounded focus gesture through two real touch taps');
assert.match(verifier,/const unitStack=\{shown:stackShown/,
  'HUD geometry verification does not inventory the stack rail');

console.log('PASS — unit-stack hotbar is registered, keyed, locally authoritative, touch-scrollable, accessible, and preserves P1-P4');
