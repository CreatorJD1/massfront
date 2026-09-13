#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const tutorial=await readFile(new URL('../src/tutorial.js',import.meta.url),'utf8');
const onboarding=await readFile(new URL('../src/onboarding.js',import.meta.url),'utf8');
const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const galactic=await readFile(new URL('../src/galactic-operations.js',import.meta.url),'utf8');
const css=await readFile(new URL('../src/styles/tutorial.css',import.meta.url),'utf8');

assert.match(tutorial,/var GUIDE_VERSION=5;/,'rebuilt tutorial version was not advanced');
const basicMatch=tutorial.match(/var BASIC_STEP_IDS=\[([^\]]+)\]/);
assert.ok(basicMatch,'basic-course membership is missing');
const basicIds=Array.from(basicMatch[1].matchAll(/'([^']+)'/g),match=>match[1]);
assert.deepEqual(basicIds,[
  'camera','deploy','commander','mex','power','fac','queue','train','orders','objective'
],'new-career tutorial is no longer the agreed super-basic RTS course');

for(const id of basicIds){
  assert.match(tutorial,new RegExp("\\{ id:'"+id+"'"),`basic course references missing real-state step ${id}`);
}
assert.match(tutorial,/TUT\.basicMode=newCareerTrainingRequested\(\)\|\|\(!M\.basicDone&&!M\.done\)/,
  'first tutorial run no longer selects the basic course');
assert.match(tutorial,/if\(!TUT\.trainingMode\)\{[\s\S]*M\.basicDone=true/,
  'training completion is published before its checked finish transaction');
assert.match(tutorial,/if\(wasBasic&&saved\)\{[\s\S]*TRAINING_COMPLETE_EVENT/,
  'basic completion event is not gated by durable save success');
assert.match(tutorial,/nextStep:'required-faction-selection'/,
  'basic completion no longer continues to mandatory commissioning');
assert.match(tutorial,/gate\.openFromRoute\(\{choice:'skipped'\}\)/,
  'in-mission tutorial skip does not converge on faction commissioning');
assert.match(tutorial,/tutSkip\(confirmState\)/,
  'confirmed Training exit does not preserve the course state captured before the modal');
assert.match(tutorial,/wasBasic&&typeof window\.__MF_RETURN_TO_BASE_FOR_COMMISSIONING__==='function'/,
  'protected Training skip does not preserve the base document for commissioning');
assert.match(galactic,/if\(gateState&&gateState\.phase==='training'\)return base\.apply\(this,arguments\);/,
  'Galactic battle return still unloads protected Training before its commissioning gate can open');
assert.match(main,/window\.__MF_RETURN_TO_BASE_FOR_COMMISSIONING__=returnToMainMenu;/,
  'the protected-commissioning return is not anchored to main.js menu cleanup');
assert.match(galactic,/typeof window\.__MF_RETURN_TO_BASE_FOR_COMMISSIONING__!=='function'/,
  'Galactic integration can overwrite the authoritative protected-commissioning return');

assert.match(onboarding,/mainMenuPreserved:true/,'onboarding contract no longer preserves the main menu');
assert.match(onboarding,/commanderGrant:'selected-faction-commander-1'/,
  'onboarding contract no longer requires the selected faction Commander 1');
assert.match(onboarding,/battleTransmissionSurface:'battle-minimap'/,
  'battle guidance is not contractually bound to the minimap receiver');
assert.match(onboarding,/spaceTransmissionSurface:'space-story-rail'/,
  'normal-space guidance is not contractually bound to the story rail');
assert.match(onboarding,/if\(ev\.key==='Escape'\)\{ ev\.preventDefault\(\);return; \}/,
  'Escape once again silently persists a tutorial skip');

assert.doesNotMatch(css,/#keelBadge[^\{]*\{[^}]*nova_192/i,
  'KEEL fallback badge is still rendered as Nova personnel');
assert.match(css,/#keelBadge::after\{content:'UGA'/,
  'KEEL fallback badge does not visibly identify UGA');
assert.match(css,/\.mfOnboardingActions button\{[^}]*min-height:58px/,
  'orientation choices lost their mobile touch target');
assert.match(css,/@media\(max-width:540px\)[\s\S]*\.mfOnboardingActions button\{min-height:60px\}/,
  'phone orientation choices lost their larger touch target');

console.log('PASS — Stage 11 basic tutorial, fail-closed continuation, KEEL identity, and mobile onboarding surface');
