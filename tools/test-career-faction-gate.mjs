#!/usr/bin/env node
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../src/career-faction-gate.js',import.meta.url),'utf8');
const mainSource=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const metaSource=await readFile(new URL('../src/game/meta.js',import.meta.url),'utf8');
const factionsSource=await readFile(new URL('../src/factions.js',import.meta.url),'utf8');
const boot=await readFile(new URL('../boot.js',import.meta.url),'utf8');
const manifest=JSON.parse(await readFile(new URL('../assets/data/manifest.json',import.meta.url),'utf8'));

assert.doesNotMatch(source,/\b(?:import|export)\s/,'classic faction gate source must not declare modules');
assert.equal(manifest.order.filter(path=>path==='src/career-faction-gate.js').length,1,
  'career faction gate must be registered exactly once in the bundle manifest');
assert.ok(manifest.order.indexOf('src/career-faction-gate.js')>manifest.order.indexOf('src/onboarding.js'),
  'career faction gate must load after the onboarding and Galactic bridge contracts');
assert.equal((boot.match(/\.\/src\/career-faction-gate\.js/g)||[]).length,1,
  'career faction gate must be registered exactly once in packaged boot');
assert.match(metaSource,/mfMetaCareerLoadedFromStorage=loadedCareer/,
  'meta load no longer publishes authoritative loaded-career provenance');
assert.match(metaSource,/needNewCareerGateSeed=!loadedCareer/,
  'a genuinely new career no longer retains inert gate eligibility across reload');
assert.doesNotMatch(source,/commandersOwned|unlockedCommanders|commanderUnlocks/,
  'gate invented a second commander ownership ledger');
assert.match(source,/KEEL · UGA COMMISSIONING GUIDE/,
  'commissioning UI does not identify KEEL by her neutral UGA role');
assert.match(source,/NO FACTION AFFILIATION · NOT A SELECTABLE COMMANDER/,
  'commissioning UI visually conflates KEEL with a selectable faction or Commander');
assert.match(source,/GRANTS THIS FACTION\\'S REAL/,
  'faction cards do not make the real Commander 1 grant explicit');
assert.match(source,/min-height:62px/,
  'desktop faction commission action is not sized as a touch target');
assert.match(source,/min-height:66px/,
  'phone faction commission action is not sized as a touch target');
assert.match(mainSource,/dispatchEvent\(new CustomEvent\('massfront:exploration-ready'\)\)/,
  'async base wiring must publish the deterministic takeover readiness handshake');
assert.match(source,/window\.addEventListener\(EXPLORATION_READY_EVENT,wrapExploration\)/,
  'career takeover must attach when async base wiring finishes after the tail script');
const rosterBlock=factionsSource.slice(factionsSource.indexOf('const COMMANDER_ROSTERS='),
  factionsSource.indexOf('const COMMANDER_WEAPON_PROFILES='));
const authoredStarters=Object.fromEntries(Array.from(rosterBlock.matchAll(/^  (nova|legion|syndicate):\[\r?\n    \{id:'([^']+)'/gm),
  match=>[match[1],match[2]]));
assert.equal(JSON.stringify(authoredStarters),JSON.stringify({nova:'nova_kai',legion:'legion_vex',syndicate:'syndicate_renn'}),
  'authoritative Commander 1 roster order changed');

class FakeCustomEvent{
  constructor(type,init={}){this.type=type;this.detail=init.detail;this.cancelable=!!init.cancelable;this.defaultPrevented=false;}
  preventDefault(){if(this.cancelable)this.defaultPrevented=true;}
}

const ROSTERS={
  nova:[{id:'nova_kai',nm:'Captain Elara Kai',role:'VANGUARD',passive:'Nova starter'},
        {id:'nova_holt',nm:'Major Rowan Holt',role:'ENGINEER'}],
  legion:[{id:'legion_vex',nm:'Lord Darion Vex',role:'JUGGERNAUT',passive:'Dominion starter'},
          {id:'legion_korr',nm:'Marshal Rhea Korr',role:'WARMASTER'}],
  syndicate:[{id:'syndicate_renn',nm:'Broker Lys Renn',role:'BROKER',passive:'Syndicate starter'},
             {id:'syndicate_nyx',nm:'Operative Nyx Calder',role:'INFILTRATOR'}],
  horde:[{id:'horde_sovereign',nm:'The Brood Sovereign',role:'WILL',aiOnly:true}]
};

function harness({loaded=true,gate=null,trainingDone=false,saveOk=true,lateExploration=false}={}){
  const timers=[],intervals=[],opens=[],events=[],listeners=new Map();
  let saves=0,persisted=0,done=trainingDone;
  const META={matches:0,standardMatches:0,settings:{experimentalExploration:true}};
  if(gate)META.newCareerFactionGate=structuredClone(gate);
  const context={
    console,Date,Promise,Object,Array,CustomEvent:FakeCustomEvent,
    PROFILES:{active:'p1'},META,COMMANDER_ROSTERS:ROSTERS,
    playerFaction:'nova',playerCommanderId:'nova_kai',
    metaCareerLoadedFromStorage(){return loaded;},
    metaSave(){saves++;return saveOk;},
    playableFactions(){return ['nova','legion','syndicate'];},
    facCanonicalId(value){return value==='legion'?'dominion':value;},
    facRuntimeKey(value){return value==='dominion'?'legion':value;},
    facDisplayName(value){return {nova:'Terran Frontline Command',legion:'Crimson Dominion',syndicate:'Syndicate Coalition'}[value]||value;},
    facArt(value){return {id:value,col:'#66d7ff',motto:value+' motto'};},
    commanderFactionKey(value){return value;},
    commanderPortraitSrc(C){return './'+C.id+'.webp';},
    persistCommanderPick(){persisted++;META.setup=META.setup||{};META.setup.pf=context.playerFaction;META.setup.pc=context.playerCommanderId;},
    trainingUiState(){return {done};},
    addEventListener(type,fn){listeners.set(type,fn);},
    dispatchEvent(event){events.push(event);const fn=listeners.get(event.type);if(fn)fn(event);return !event.defaultPrevented;},
    setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){},
    setInterval(fn){intervals.push(fn);return intervals.length;},clearInterval(){},
    document:{body:null,getElementById(){return null;}},
    toast(){},sfx(){},applyFactionTheme(){},renderMetaHead(){}
  };
  const installExploration=()=>{
    context.mfOpenExploration=function(entryView){opens.push(entryView);return Promise.resolve(true);};
    context.dispatchEvent(new FakeCustomEvent('massfront:exploration-ready'));
  };
  if(!lateExploration)context.mfOpenExploration=function(entryView){opens.push(entryView);return Promise.resolve(true);};
  context.window=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'src/career-faction-gate.js'});
  return {context,META,timers,intervals,opens,events,
    get saves(){return saves;},get persisted(){return persisted;},installExploration,setTrainingDone(value){done=!!value;}};
}

{
  const eligible={version:1,profileId:'p1',phase:'eligible',createdAt:1};
  const H=harness({loaded:true,gate:eligible,lateExploration:true});
  assert.equal(typeof H.context.mfOpenExploration,'undefined',
    'regression harness must reproduce tail takeover loading before async base wire');
  H.installExploration();
  assert.equal(await H.context.mfOpenExploration('system'),true);
  assert.equal(H.META.newCareerFactionGate.phase,'awaiting-onboarding',
    'readiness handshake must wrap the late base opener before the first START');
  assert.deepEqual(H.opens,['system']);
}

{
  const H=harness({loaded:true});
  const result=await H.context.mfOpenExploration('system');
  assert.equal(result,true);
  assert.deepEqual(H.opens,['system'],'established career did not pass through integrated system entry');
  assert.equal(H.META.newCareerFactionGate,undefined,'established zero-match career was incorrectly armed');
  assert.equal(H.context.MFNewCareerFactionGate.canEnterSpaceCareer(),true);
}

{
  const H=harness({loaded:false,saveOk:false});
  assert.equal(await H.context.mfOpenExploration('system'),false,
    'unsaved new-career gate entered the separate space document');
  assert.deepEqual(H.opens,[]);
}

{
  const H=harness({loaded:false}),api=H.context.MFNewCareerFactionGate;
  await H.context.mfOpenExploration('system');
  assert.equal(H.META.newCareerFactionGate.phase,'awaiting-onboarding');
  assert.equal(api.canEnterSpaceCareer(),false,'fresh unresolved career did not block full UGA entry');
  assert.equal(await H.context.mfOpenExploration('campaign_hub'),false,'unresolved career bypassed the faction gate');
  assert.deepEqual(H.opens,['system'],'blocked campaign hub still called the base exploration opener');
  assert.equal(api.openFromRoute({choice:'skipped'}),true,'secured skip route did not converge on faction selection');
  assert.equal(H.META.newCareerFactionGate.phase,'faction-selection');
  assert.equal(api.select('brood'),false,'AI-only Brood was accepted by the player gate');
  const detail=api.select('dominion');
  assert.equal(detail.factionId,'dominion');
  assert.equal(detail.commanderId,'legion_vex');
  assert.equal(H.context.playerFaction,'legion');
  assert.equal(H.context.playerCommanderId,'legion_vex');
  assert.equal(JSON.stringify(H.META.setup),JSON.stringify({pf:'legion',pc:'legion_vex'}));
  assert.equal(H.persisted,1,'existing commander persistence transaction was not used');
  assert.equal(H.META.newCareerFactionGate.phase,'ready');
  assert.equal(api.canEnterSpaceCareer(),true);
  while(H.timers.length)H.timers.shift()();
  await Promise.resolve();
  assert.ok(H.events.some(event=>event.type===api.READY_EVENT&&event.detail.commanderId==='legion_vex'),
    'post-selection UGA continuation event was not emitted');
  assert.deepEqual(H.opens,['system','system'],'resolved career did not continue to full UGA space');
}

{
  const eligible={version:1,profileId:'p1',phase:'eligible',createdAt:1};
  const H=harness({loaded:true,gate:eligible}),api=H.context.MFNewCareerFactionGate;
  await H.context.mfOpenExploration('system');
  assert.equal(H.META.newCareerFactionGate.phase,'awaiting-onboarding',
    'reload-safe eligibility marker was not promoted on integrated system entry');
  assert.equal(api.state().armed,true);
}

{
  const H=harness({loaded:false}),api=H.context.MFNewCareerFactionGate;
  await H.context.mfOpenExploration('system');
  assert.equal(api.afterOnboardingChoice({choice:'training'}),true);
  assert.equal(H.META.newCareerFactionGate.phase,'training');
  H.setTrainingDone(true);
  H.intervals[0]();
  assert.equal(H.META.newCareerFactionGate.phase,'faction-selection',
    'real Training completion did not converge on the same faction gate');
}

{
  const H=harness({loaded:false}),map=Object.fromEntries(H.context.MFNewCareerFactionGate.choices().map(choice=>[choice.id,choice.commander.id]));
  assert.equal(JSON.stringify(map),JSON.stringify({nova:'nova_kai',dominion:'legion_vex',syndicate:'syndicate_renn'}),
    'Commander 1 mapping drifted from the authoritative roster order');
}

console.log('PASS — genuine-new-career gate, tutorial/skip convergence, roster Commander 1 grant, and UGA continuation');
