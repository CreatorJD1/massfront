#!/usr/bin/env node
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const source=await readFile(new URL('../src/onboarding.js',import.meta.url),'utf8');
const boot=await readFile(new URL('../boot.js',import.meta.url),'utf8');
const manifest=JSON.parse(await readFile(new URL('../assets/data/manifest.json',import.meta.url),'utf8'));

assert.equal(manifest.order.filter(x=>x==='src/onboarding.js').length,1,
  'onboarding must be registered exactly once in the bundle manifest');
assert.ok(manifest.order.indexOf('src/onboarding.js')>manifest.order.indexOf('src/galactic-operations.js'),
  'onboarding must load after tutorial, main, War Table, and Galactic route bridges');
assert.equal((boot.match(/\.\/src\/onboarding\.js/g)||[]).length,1,
  'onboarding must be registered exactly once in the packaged boot manifest');
assert.match(source,/BEGIN PLANETARY BASICS/,'first-career choice is missing its short training action');
assert.match(source,/KEEP CURRENT MAIN MENU/,'base flow no longer preserves the current main menu');
assert.match(source,/LAND FOR BASIC TRAINING/,'live-space flow is missing its protected Training action');
assert.match(source,/SKIP TRAINING · COMMISSION/,'live-space flow is missing its required faction-selection outcome');
assert.doesNotMatch(source,/META\.tutorial\.(?:done|skipped|progress)\s*=/,
  'onboarding must not fake tutorial completion or progress');

class FakeCustomEvent{
  constructor(type,init={}){
    this.type=type;this.detail=init.detail;this.cancelable=!!init.cancelable;this.defaultPrevented=false;
  }
  preventDefault(){if(this.cancelable)this.defaultPrevented=true;}
}

function harness({meta={},training={active:false},saveOk=true,running=false,matchLive=false}={}){
  const timers=[],events=[],spoken=[];
  let saves=0,launches=0;
  const META={matches:0,standardMatches:0,tutorial:{done:false,skipped:false,version:0,progress:0},
    warPrimer:{done:false,version:0,seen:{}},...meta};
  const context={
    console,Date,CustomEvent:FakeCustomEvent,META,bootConfirmed:true,running,matchLive,gameEnded:false,
    location:{search:''},
    document:{readyState:'complete',addEventListener(){},createEvent(){return null;}},
    setInterval(fn){timers.push({kind:'interval',fn});return timers.length;},
    setTimeout(fn){timers.push({kind:'timeout',fn});return timers.length;},
    requestAnimationFrame(fn){fn(0);return 1;},
    metaSave(){saves++;return saveOk;},
    trainingUiState(){return training;},
    resumeTrainingMission(){launches++;},
    __tutDebug(){return {speak(...args){spoken.push(args);}};},
    dispatchEvent(event){events.push(event);return !event.defaultPrevented;},
    toast(){}
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'src/onboarding.js'});
  return {context,META,timers,events,spoken,get saves(){return saves;},get launches(){return launches;}};
}

{
  const H=harness();
  const api=H.context.MFOnboarding;
  assert.equal(api.VERSION,2);
  assert.equal(api.eligible(),true,'fresh untouched career should receive the choice');
  assert.equal(api.automaticEligible(),true,'normal fresh career should receive the base offer');
  const groups=api.skills();
  assert.deepEqual(Array.from(groups,x=>x.id),['strategic-navigation','rts-foundations']);
  assert.equal(groups[0].steps.length,5,'War Table route must expose all five real stages');
  assert.equal(groups[1].steps.length,10,'new-career progress must mirror the super-basic KEEL course');
  const career=api.careerSequence();
  assert.equal(career.schema,'massfront.new-career-onboarding.v2');
  assert.deepEqual(Array.from(career.stages,s=>s.id),[
    'world-introduction','planet-approach','orientation-choice','protected-training',
    'faction-commissioning','starter-commander-1','full-uga-space']);
  assert.equal(career.invariants.mainMenuPreserved,true);
  assert.equal(career.invariants.commanderGrant,'selected-faction-commander-1');
  assert.equal(career.invariants.keelAffiliation,'uga');

  const before=JSON.stringify(H.META.tutorial);
  assert.equal(api.skip(),true);
  assert.equal(H.META.onboarding.choice,'skipped');
  assert.equal(JSON.stringify(H.META.tutorial),before,'skipping the offer changed real tutorial state');
  assert.equal(api.eligible(),false,'a persisted decision should suppress repeat first-career offers');
  assert.ok(H.saves>=1,'the onboarding decision was not persisted');
  assert.ok(H.events.some(e=>e.type===api.CHOICE_EVENT&&e.detail.choice==='skipped'),
    'choice event was not emitted for host integrations');
}

{
  const H=harness({meta:{settings:{experimentalExploration:true}}});
  const api=H.context.MFOnboarding,state=api.state();
  assert.equal(api.eligible(),true,'experimental fresh career lost its post-space choice');
  assert.equal(api.automaticEligible(),false,'experimental flow would still cover the base menu before live space');
  assert.equal(state.awaitingSpaceChoice,true,'host cannot tell that live space owes a tutorial choice');
  const flow=api.sequence('experimental-space');
  assert.equal(flow.entryView,'live-space');
  assert.equal(flow.schema,'massfront.onboarding-flow.v2');
  assert.deepEqual(Array.from(flow.actions,a=>a.outcome),
    ['protected-planetary-training','required-faction-selection']);
  assert.equal(flow.choiceContext,'space-intro');
  assert.equal(flow.affiliation,'uga');
  assert.equal(flow.speakerRole,'UGA EXPEDITION GUIDE');
  assert.equal(flow.profileId,'uga-keel-expedition-guide');
  assert.equal(flow.continuation.afterTraining,'faction-commissioning');
  assert.equal(flow.continuation.afterSkip,'faction-commissioning');

  let routed=null;
  assert.equal(api.skip({flowId:'experimental-space',onSkip:detail=>{routed=detail;}}),true);
  assert.equal(routed.outcome,'required-faction-selection');
  assert.equal(routed.entryView,'live-space');
  assert.equal(H.META.onboarding.flowId,'experimental-space');
  assert.equal(H.META.onboarding.outcome,'required-faction-selection');
  assert.ok(H.events.some(e=>e.type===api.CHOICE_EVENT&&e.detail.outcome==='required-faction-selection'),
    'space host did not receive an outcome-bearing choice event');
}

{
  const H=harness();
  const before=JSON.stringify(H.META.tutorial);
  assert.equal(H.context.MFOnboarding.chooseTraining(),true);
  assert.equal(H.META.onboarding.choice,'training');
  assert.equal(H.launches,1,'training choice did not call the existing real Training bridge');
  assert.equal(JSON.stringify(H.META.tutorial),before,'choosing Training pre-completed tutorial state');
}

{
  const H=harness({meta:{settings:{experimentalExploration:true}}});
  let routed=null;
  assert.equal(H.context.MFOnboarding.chooseTraining({flowId:'experimental-space',launchTraining:false,
    onTraining:detail=>{routed=detail;}}),true);
  assert.equal(H.launches,0,'space-owned Training route was also launched by the base host');
  assert.equal(routed.outcome,'protected-planetary-training');
  assert.equal(routed.entryView,'live-space');
}

{
  const H=harness({
    meta:{tutorial:{done:false,skipped:false,version:0,progress:6},
      warPrimer:{done:false,version:0,seen:{galaxy:true,region:true}}},
    training:{active:true}
  });
  const groups=H.context.MFOnboarding.skills();
  assert.equal(groups[0].steps.find(s=>s.id==='galaxy').state,'complete');
  assert.equal(groups[0].steps.find(s=>s.id==='system').state,'pending');
  assert.equal(groups[1].steps[5].state,'complete','saved KEEL high-water progress was not reflected');
  assert.equal(groups[1].steps[6].state,'current','active KEEL objective was not identified');
  assert.equal(H.context.MFOnboarding.eligible(),false,'an active/interrupted course was treated as a new career');
}

{
  const H=harness();
  const api=H.context.MFOnboarding,presented=[];
  api.setPresenter(payload=>{presented.push(payload);return true;});
  const P=api.present('uga-command');
  assert.ok(P,'UGA contextual hint did not emit');
  assert.equal(P.schema,'massfront.keel-hint.v1');
  assert.equal(P.speaker,'KEEL');
  assert.equal(P.speakerId,'keel');
  assert.equal(P.voiceId,'keen');
  assert.equal(P.profileId,'uga-keel-expedition-guide');
  assert.equal(P.affiliation,'uga');
  assert.equal(P.speakerRole,'UGA EXPEDITION GUIDE');
  assert.equal(P.animationId,'keel-space-link');
  assert.equal(P.surface,'space-story-rail');
  assert.equal(typeof P.text,'string');assert.ok(P.text.length>20);
  assert.ok(P.durationMs>=1000);assert.equal(typeof P.priority,'number');
  assert.equal(P.handled,true,'registered presenter could not claim the transmission');
  assert.equal(presented.length,1);
  assert.equal(H.spoken.length,0,'claimed HUD transmission also rendered in the fallback bubble');
  assert.ok(H.events.some(e=>e.type===api.PRESENTER_EVENT&&e.detail===P),
    'versioned KEEL presenter event did not carry the shared payload');
  assert.equal(H.META.onboarding.hints['uga-command'].seen,true,'hint visibility was not persisted');
  assert.equal(api.present('uga-command'),null,'one-shot persisted hint repeated in the same profile');

  const locked=api.present('battle-orders',{force:true,persist:false,voiceId:'nova',profileId:'nova_kai',surface:'space-story-rail'});
  assert.equal(locked.voiceId,'keen','caller recast KEEL with a faction voice');
  assert.equal(locked.profileId,'uga-keel-expedition-guide','caller recast KEEL with a faction commander profile');
  assert.equal(locked.affiliation,'uga');
  assert.equal(locked.surface,'battle-minimap','caller redirected battle guidance away from the minimap receiver');

  api.setPresenter(null);
  const fallback=api.present('battle-camera',{force:true,persist:false});
  assert.equal(fallback.presenter,'keel-bubble');
  assert.equal(H.spoken.length,1,'unclaimed hint did not use the existing KEEL presentation path');
  assert.equal(H.spoken[0][3],'battle-camera');

  assert.equal(api.completeHint('battle-camera'),true);
  assert.equal(api.dismissHint('battle-orders'),true);
  const state=api.state();
  assert.equal(state.hints['battle-camera'].completed,true);
  assert.equal(state.hints['battle-orders'].dismissed,true);
}

{
  const H=harness({saveOk:false});
  const before=JSON.stringify(H.META.onboarding||null);
  assert.equal(H.context.MFOnboarding.skip(),false,'unsaved career skip was reported as accepted');
  assert.equal(H.META.onboarding?.choice||'','', 'failed persistence left a half-committed onboarding choice');
  assert.equal(H.events.some(e=>e.type===H.context.MFOnboarding.CHOICE_EVENT),false,
    'failed persistence emitted a cross-document career transition');
  assert.ok(H.saves>=1);
}

{
  const H=harness({running:true,matchLive:true}),api=H.context.MFOnboarding;
  const P=api.present('battle-camera',{force:true,persist:false});
  assert.equal(P.presenter,'battle-minimap-pending','busy battle guidance spawned a second talking-head surface');
  assert.equal(H.spoken.length,0,'battle minimap guidance leaked into the legacy KEEL bubble');
}

{
  assert.equal(harness({meta:{matches:1}}).context.MFOnboarding.eligible(),false,
    'established career was treated as first-run');
  assert.equal(harness({meta:{tutorial:{done:true,skipped:false,version:4,progress:21}}}).context.MFOnboarding.eligible(),false,
    'completed Training career was offered onboarding again');
  assert.equal(harness({meta:{tutorial:{done:false,skipped:true,version:4,progress:0}}}).context.MFOnboarding.eligible(),false,
    'legacy tutorial skip was ignored');
}

console.log('PASS — first-career choice, real skill progress, persistence, and KEEL presenter contract');
