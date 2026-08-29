#!/usr/bin/env node
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const here=name=>fileURLToPath(new URL('../'+name,import.meta.url));
const [meta,main,css,input,hud,hudflow,commander,airlift,probe,index]=await Promise.all([
  'src/game/meta.js','src/main.js','src/styles/ui.css','src/ui/input.js','src/ui/hud.js',
  'src/ui/hudflow.js','src/game/commander.js','src/airlift.js','tools/probe-stage8-accessibility.mjs','index.html'
].map(async name=>readFile(here(name),'utf8')));
function section(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert.ok(a>=0&&b>a,'Could not extract '+start+' … '+end);
  return source.slice(a,b);
}

/* The stored value is a closed set: old/corrupt careers fall back safely and
   the DOM contract is an explicit percentage, not browser zoom. */
const scaleCtx={document:{documentElement:{dataset:{}}}};
vm.createContext(scaleCtx);
vm.runInContext(section(meta,'const MF_TEXT_SCALE_STEPS=','const DEF_SETTINGS='),scaleCtx,{filename:'meta-text-scale.js'});
assert.equal(scaleCtx.mfTextScaleValue('125'),125,'numeric stored text scale was not restored');
assert.equal(scaleCtx.mfTextScaleValue(200),200,'200% text scale was rejected');
assert.equal(scaleCtx.mfTextScaleValue(175),100,'invalid text scale did not fall back to 100%');
assert.equal(scaleCtx.mfApplyTextScale(150),150,'text scale application returned the wrong step');
assert.equal(scaleCtx.document.documentElement.dataset.mfTextScale,'150','root text-scale state was not applied');
assert.match(meta,/textScale:100/,'new profiles do not default to 100% text');
assert.match(meta,/META\.settings\.textScale=mfTextScaleValue/,'loaded profiles do not normalize text scale');
assert.match(meta,/cyc\('textScale','Interface Text Size'/,'Settings does not expose Interface Text Size');
assert.match(meta,/metaSave\(\); applySettings\(\); sfx\('ui'\); renderSettings\(\)/,
  'settings changes are not persisted and applied before rerender');

class FakeButton{
  constructor(id='button'){
    this.id=id;this.dataset={};this.disabled=false;this.isConnected=true;this.style={display:'block'};
    this.listeners=new Map();this.children=[];
  }
  addEventListener(type,fn){
    if(!this.listeners.has(type))this.listeners.set(type,[]);
    this.listeners.get(type).push(fn);
  }
  dispatch(type,init={}){
    const ev={type,target:this,detail:0,key:'',repeat:false,isComposing:false,
      preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},
      stopImmediatePropagation(){this.immediateStopped=true;},...init};
    for(const fn of this.listeners.get(type)||[])fn(ev);
    return ev;
  }
}
let clock=1000;
const pressCtx={mfTapNow:()=>clock,performance:{now:()=>clock}};
vm.createContext(pressCtx);
vm.runInContext(section(meta,'function mfBindNativePress(','/* Settings rows are divs'),pressCtx,{filename:'meta-native-press.js'});
let count=0;
const press=new FakeButton('spdBtn');
pressCtx.mfBindNativePress(press,()=>count++);
press.dispatch('pointerdown',{detail:1});press.dispatch('click',{detail:1});
assert.equal(count,1,'one physical pointer press activated a tactical button more than once');
const enter=press.dispatch('keydown',{key:'Enter'});press.dispatch('click',{detail:0});
assert.equal(count,2,'Enter did not activate exactly once');
assert.ok(enter.defaultPrevented&&enter.stopped,'Enter was not consumed by the tactical control');
press.dispatch('keydown',{key:'Enter',repeat:true});
assert.equal(count,2,'keyboard repeat re-fired a tactical action');
clock+=700;
const space=press.dispatch('keydown',{key:' '});press.dispatch('click',{detail:0});
assert.equal(count,3,'Space did not activate exactly once');
assert.ok(space.defaultPrevented&&space.stopped,'Space was allowed to scroll the battlefield');
clock+=700;press.dispatch('click',{detail:0});
assert.equal(count,4,'an isolated assistive-technology click was discarded');
pressCtx.mfBindNativePress(press,()=>count+=100);
press.dispatch('pointerdown',{detail:1});
assert.equal(count,5,'the same tactical control was bound more than once');
press.disabled=true;
press.dispatch('pointerdown',{detail:1});press.dispatch('keydown',{key:'Enter'});press.dispatch('click',{detail:0});
assert.equal(count,5,'disabled native tactical control still activated');
press.disabled=false;

let releaseCount=0;
const release=new FakeButton('deployBtn');
pressCtx.mfBindNativePress(release,()=>releaseCount++,'pointerup');
release.dispatch('pointerdown',{detail:1});
assert.equal(releaseCount,0,'release-safe action fired on pointerdown');
release.dispatch('pointerup',{detail:1});release.dispatch('click',{detail:1});
assert.equal(releaseCount,1,'release-safe pointer action did not fire exactly once on pointerup');
clock+=700;release.dispatch('keydown',{key:'Enter'});release.dispatch('click',{detail:0});
assert.equal(releaseCount,2,'release-safe action did not fire exactly once from keyboard');

/* The route stack restores the triggering control on Back while direct entry
   starts at a useful reading target. */
class FocusNode{
  constructor(id,tagName='DIV'){
    this.id=id;this.tagName=tagName;this.style={display:'flex'};this.isConnected=true;this.tabIndex=0;
    this.members=new Set();this.attributes=new Set();this.inert=false;this.children=[];
  }
  add(...nodes){for(const node of nodes)this.members.add(node);return this;}
  contains(node){return node===this||this.members.has(node);}
  hasAttribute(name){return this.attributes.has(name);}
  setAttribute(name){this.attributes.add(name);if(name==='inert')this.inert=true;}
  removeAttribute(name){this.attributes.delete(name);if(name==='inert')this.inert=false;}
  querySelector(sel){
    if(sel==='[data-front-focus]')return null;
    if(sel==='h1,h2,[role="heading"]')return this.heading||null;
    return this.firstControl||null;
  }
  querySelectorAll(){return [...this.members].filter(node=>node.tagName==='BUTTON');}
  focus(){focusDoc.activeElement=this;this.focuses=(this.focuses||0)+1;}
}
const body=new FocusNode('body');body.dataset={frontScreen:''};
const start=new FocusNode('startScreen'),war=new FocusNode('warScr'),setup=new FocusNode('setupScr');
const startBtn=new FocusNode('startBtn','BUTTON'),warHead=new FocusNode('warHead','H2'),warCard=new FocusNode('warCard'),setupHead=new FocusNode('setupHead','H2');
start.add(startBtn);start.firstControl=startBtn;war.add(warHead,warCard);war.heading=warHead;setup.add(setupHead);setup.heading=setupHead;
const hidden=['apConfirmOverlay','apOverlay','accDlg','dispatch','pauseOverlay'].map(id=>{const n=new FocusNode(id);n.style.display='none';return n;});
const resumeBtn=new FocusNode('resumeBtn','BUTTON'),menuBtn=new FocusNode('menuBtn','BUTTON');
const pauseSettings=new FocusNode('pauseSettings','BUTTON'),quitBtn=new FocusNode('quitBtn','BUTTON');
hidden.at(-1).add(resumeBtn,pauseSettings,quitBtn);
body.children=[start,war,setup,menuBtn,...hidden];
const nodes=new Map([start,war,setup,startBtn,warHead,warCard,setupHead,resumeBtn,menuBtn,pauseSettings,quitBtn,...hidden].map(n=>[n.id,n]));
const focusDoc={body,activeElement:body};
const focusCtx={
  document:focusDoc,$:id=>nodes.get(id)||null,getComputedStyle:el=>({display:el.style.display||'block',visibility:'visible'}),
  requestAnimationFrame:fn=>fn(),running:true,paused:false
};
vm.createContext(focusCtx);
vm.runInContext(section(main,'/* STAGE8_FRONT_FOCUS_BEGIN','/* STAGE8_FRONT_FOCUS_END */'),focusCtx,{filename:'main-front-focus.js'});
body.dataset.frontScreen='startScreen';focusCtx.mfFrontFocusRoute('','startScreen',start);
assert.equal(focusDoc.activeElement,startBtn,'home entry did not focus WAR ROOM');
focusDoc.activeElement=startBtn;body.dataset.frontScreen='warScr';focusCtx.mfFrontFocusRoute('startScreen','warScr',war);
assert.equal(focusDoc.activeElement,warHead,'forward route did not focus its heading');
focusDoc.activeElement=warCard;body.dataset.frontScreen='setupScr';focusCtx.mfFrontFocusRoute('warScr','setupScr',setup);
assert.equal(focusDoc.activeElement,setupHead,'nested route did not focus its heading');
body.dataset.frontScreen='warScr';focusCtx.mfFrontFocusRoute('setupScr','warScr',war);
assert.equal(focusDoc.activeElement,warCard,'Back did not restore the War Room trigger');
body.dataset.frontScreen='startScreen';focusCtx.mfFrontFocusRoute('warScr','startScreen',start);
assert.equal(focusDoc.activeElement,startBtn,'Back did not restore the home trigger');
focusDoc.activeElement=menuBtn;focusCtx.mfOpenPause();
assert.equal(focusDoc.activeElement,resumeBtn,'Pause did not focus its safe Resume action');
assert.ok(start.inert&&menuBtn.inert,'Pause did not make the underlying battlefield/menu inert');
const shiftTab={key:'Tab',shiftKey:true,target:resumeBtn,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
focusCtx.mfPauseTrapKeydown(shiftTab);
assert.equal(focusDoc.activeElement,quitBtn,'Shift+Tab escaped the start of the Pause dialog');
const tab={key:'Tab',shiftKey:false,target:quitBtn,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
focusCtx.mfPauseTrapKeydown(tab);
assert.equal(focusDoc.activeElement,resumeBtn,'Tab escaped the end of the Pause dialog');
const tacticalKey={key:'Enter',target:menuBtn,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.immediate=true;}};
focusCtx.mfPauseTrapKeydown(tacticalKey);
assert.ok(tacticalKey.prevented&&tacticalKey.immediate,'Pause allowed a tactical keyboard activation through its modal boundary');
focusCtx.mfPauseSetModal(false);
assert.ok(!start.inert&&!menuBtn.inert,'Pause → Settings did not release its inert battlefield state');
focusCtx.mfPauseSetModal(true);
assert.ok(start.inert&&menuBtn.inert,'Settings → Pause did not restore its inert battlefield state');
focusCtx.mfClosePause();
assert.equal(focusDoc.activeElement,menuBtn,'Resume did not restore the Pause trigger');
assert.ok(!start.inert&&!menuBtn.inert,'Resume left the battlefield inert');

const tacticalIds=['spdBtn','upBtn','bp_fire','bp_prio','bp_up','armyBtn','idleBuilderBtn','patrolBtn',
  'deployBtn','rotL','rotR','tiltBtn','holdBtn','formBtn','rallyBtn','boxBtn','stopBtn','atkAlert','waveAlert',
  'moveBtn','clearBtn','buildBtn','placeOk','placeNo','modeBtn','placeRotL','placeRotR','repeatBtn',
  'abOver','abHeal','abRage','abLance','abEmp','abJump','abBarrage','abClass','abHero','baseFindBtn'];
for(const id of tacticalIds){
  assert.ok(main.includes("mfBindNativePress($('"+id+"')"),'native tactical control '+id+' lacks the shared keyboard contract');
  assert.ok(!main.includes("$('"+id+"').addEventListener('pointerdown'"),'native tactical control '+id+' still has a pointer-only binding');
}
assert.match(main,/mfBindNativePress\(\$\('deployBtn'\)[\s\S]*?'pointerup'\)/,'Deploy no longer preserves its pointerup safety contract');
assert.match(input,/mfBindNativePress\(b,[\s\S]*?toggleQueuePlanner/,'dynamic queue button is pointer-only');
assert.match(commander,/mfBindNativePress\(b,[\s\S]*?tryCommanderWeapon/,'commander weapon buttons are pointer-only');
assert.match(airlift,/mfBindNativePress\(b,[\s\S]*?mfAirliftArmUnload/,'airlift unload button is pointer-only');
assert.match(hudflow,/mfBindNativePress\(mfNoticeLogBtn/,'battle notification log is pointer-only');
assert.match(hud,/mfBindNativePress\(nav\.querySelector\('#prodPrev'\)/,'production navigator is pointer-only');
assert.match(index,/<button type="button" id="atkAlert"[^>]+aria-label="Jump to base under attack"/,
  'base-under-attack alarm is not a named native control');
assert.match(index,/<div class="overlay" id="pauseOverlay" role="dialog" aria-modal="true" aria-labelledby="pauseTitle">/,
  'Pause does not expose modal dialog semantics');
assert.match(main,/window\.addEventListener\('keydown',mfPauseTrapKeydown,true\)/,
  'Pause focus confinement is not installed in the keyboard capture phase');

for(const pct of ['125','150','200'])assert.match(css,new RegExp('html\\[data-mf-text-scale="'+pct+'"\\]\\{font-size:'),pct+'% CSS tier is missing');
assert.match(css,/\.mbtn\{font-size:1\.0667rem\}/,'primary menu text is not tied to text scale');
assert.match(css,/#goalBar\{font-size:\.7667rem\}/,'critical objective text is not tied to text scale');
assert.match(css,/\.settingsNav\{overflow-x:auto/,'scaled settings tabs have no overflow strategy');
assert.match(css,/#toast\.noticeBox[\s\S]*max-height:none/,'scaled alerts can still clip vertically');
assert.match(css,/#goalBar\{width:max-content;[^}]*max-height:none;[^}]*overflow:visible/,
  'scaled objective plate retains a fixed clipping height');
assert.match(css,/#hazChip\{width:max-content;[^}]*max-height:none;[^}]*overflow:visible/,
  'scaled infestation/hazard plates retain a fixed clipping height');
assert.match(css,/#infMeter,\s*html\[data-mf-text-scale\]:not\(\[data-mf-text-scale="100"\]\) #hazChip\{[^}]*max-height:none/,
  'scaled infestation plate does not share the unclipped critical-plate contract');
assert.doesNotMatch(css,/data-mf-text-scale[^\n{]*\{[^}]*\bzoom\s*:/,'text scale relies on browser/CSS zoom');

/* Real-browser evidence is source-bound, offline, and cannot publish PASS
   until its declared images and the cooperative freeze both verify. */
const freezeAt=probe.indexOf('const guard=await acquireVerificationFreeze');
const mkdirAt=probe.indexOf('await mkdir(outDir');
const cleanupAt=probe.indexOf('for(const name of outputFiles)await rm');
assert.ok(freezeAt>=0&&mkdirAt>freezeAt&&cleanupAt>mkdirAt,'probe mutates its output before owning the workspace freeze');
assert.match(probe,/const screenshotFiles=\[[^\]]+\]/,'probe has no bounded screenshot declaration');
assert.match(probe,/const deployed=await enterDeployedMatch\(\)/,'probe does not enter a real deployed match for HUD scaling');
assert.match(probe,/await shot\('deployed-hud-text-200\.png'\)/,'probe has no 200% deployed-HUD screenshot');
assert.match(probe,/check\(!plate\.clipped,[^\n]+200%/,'probe does not reject clipped 200% HUD plates');
assert.match(probe,/check\(plate\.contained,[^\n]+200%/,'probe does not reject out-of-viewport 200% HUD plates');
assert.match(probe,/serviceWorkers:'block'/,'probe can be controlled by a service worker');
assert.match(probe,/offline=await installOfflineNetworkIsolation\(page\)/,'probe does not install shared offline isolation before navigation');
assert.match(probe,/report\.networkIsolation=await offline\.finalize/,'probe does not finalize offline evidence');
assert.match(probe,/\['pageerror','console','http','requestfailed'\]/,'probe does not fail unexpected console or request errors');
assert.match(probe,/for\(const name of screenshotFiles\)[\s\S]*?await readFile\(join\(outDir,name\)\)/,
  'probe does not re-hash every declared screenshot from disk');
const identityAt=probe.indexOf('report.sourceAtCompletion=await readRepositoryFingerprint');
const releaseAt=probe.indexOf("await guard.release({assertStable:true,name:'Stage 8 accessibility final evidence release'}");
const passAt=probe.indexOf("report.machineOutcome=report.captureCompleted?'PASS':'FAIL'");
assert.ok(identityAt>=0&&releaseAt>identityAt&&passAt>releaseAt,'probe can publish PASS before completion identity and stable release');
assert.match(probe,/report\.captureCompleted=releaseSucceeded&&captureReady&&!fatal&&report\.failures\.length===0&&report\.errors\.length===0/,
  'late browser, artifact, fingerprint, shutdown, or release errors can still publish PASS');
assert.match(probe,/report\.captureCompleted=false;report\.machineOutcome='PENDING_FINAL_RELEASE'/,
  'provisional accessibility report can claim capture completion');

console.log('PASS — text scale persists at four steps; tactical keys fire once; front/pause focus restores predictably');
