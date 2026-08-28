#!/usr/bin/env node
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const inputPath=fileURLToPath(new URL('../src/ui/input.js',import.meta.url));
const src=await readFile(inputPath,'utf8');
const main=await readFile(fileURLToPath(new URL('../src/main.js',import.meta.url)),'utf8');
const airlift=await readFile(fileURLToPath(new URL('../src/airlift.js',import.meta.url)),'utf8');
const meta=await readFile(fileURLToPath(new URL('../src/game/meta.js',import.meta.url)),'utf8');
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg);};
const sectionOf=(source,start,end)=>{
  const a=source.indexOf(start),b=source.indexOf(end,a);
  if(a<0||b<0)throw new Error('Could not extract '+start+' … '+end);
  return source.slice(a,b);
};
const section=(start,end)=>sectionOf(src,start,end);

/* Exercise the actual global safety policy with the caller shapes that used to
   escape it: a bare Field Study bcard, locally guarded Atlas/Massflesh cards,
   pointerdown-owned queue, and two-step destructive buttons. */
const safetySrc=section('const MF_UI_DESTRUCTIVE_IDS','/* CAMERA AUTHORITY.');
const listeners=new Map(),panels={prodGrid:{id:'prodGrid'},buildGrid:{id:'buildGrid'}};
let now=1000;
class ProbePointerEvent{
  constructor(type,init={}){this.type=type;this.isPrimary=init.isPrimary===undefined?false:!!init.isPrimary;Object.assign(this,init);}
  preventDefault(){this.defaultPrevented=true;}
  stopImmediatePropagation(){this.immediateStopped=true;}
  stopPropagation(){this.propagationStopped=true;}
}
class ProbeEvent extends ProbePointerEvent{}
function makeControl({id='',className='',tagName='DIV',role='',panel='',dataset={}}={}){
  const classes=new Set(className.split(/\s+/).filter(Boolean));
  const ownListeners=new Map();
  return {
    id,className,tagName,textContent:id||className,dataset:{...dataset},isConnected:true,localDispatch:null,
    addEventListener(type,fn){if(!ownListeners.has(type))ownListeners.set(type,[]);ownListeners.get(type).push(fn);},
    contains(node){return node===this;},
    getAttribute(name){return name==='role'?role:name==='aria-label'?this.textContent:null;},
    getBoundingClientRect(){return {width:84,height:64};},
    matches(selector){return selector.split(',').some(raw=>{
      const s=raw.trim();
      return s==='button'?tagName==='BUTTON':s==='[role="button"]'?role==='button':
        s.startsWith('.')?classes.has(s.slice(1)):s===tagName.toLowerCase();
    });},
    closest(selector){
      if(selector==='#prodGrid')return panel==='prodGrid'?panels.prodGrid:null;
      if(selector==='#buildGrid')return panel==='buildGrid'?panels.buildGrid:null;
      return this.matches(selector)?this:null;
    },
    dispatchEvent(ev){ev.target=this;for(const fn of ownListeners.get(ev.type)||[])fn(ev);if(this.localDispatch)this.localDispatch(ev);return true;}
  };
}
function pointerdownOwner(el,fn){el.localDispatch=ev=>{if(ev.type==='pointerdown')fn(ev);};}
function releaseOwner(el,fn){
  let press=null;
  el.localDispatch=ev=>{
    if(ev.type==='pointerdown')press={id:ev.pointerId,x:ev.clientX,y:ev.clientY,moved:false};
    else if(ev.type==='pointermove'&&press&&press.id===ev.pointerId&&Math.hypot(ev.clientX-press.x,ev.clientY-press.y)>10)press.moved=true;
    else if(ev.type==='pointercancel'&&press&&press.id===ev.pointerId)press=null;
    else if(ev.type==='pointerup'&&press&&press.id===ev.pointerId){const ok=!press.moved;press=null;if(ok)fn(ev);}
  };
}
const queueBtn=makeControl({id:'queueBtn',className:'cbtn',tagName:'BUTTON'});
const fieldStudy=makeControl({id:'fieldStudyProbe',className:'bcard',panel:'prodGrid'});
const atlas=makeControl({id:'atlasProbe',className:'bcard mfAirliftCard',role:'button',panel:'prodGrid',dataset:{mfReleaseSafe:'1'}});
const massflesh=makeControl({id:'massfleshProbe',className:'bcard mfMassCard',role:'button',panel:'prodGrid',dataset:{mfReleaseSafe:'1'}});
const profReset=makeControl({id:'profReset',tagName:'BUTTON'});
let toggles=0,studies=0,atlasQueues=0,massQueues=0,resets=0;
pointerdownOwner(queueBtn,()=>toggles++);
pointerdownOwner(fieldStudy,()=>studies++);
releaseOwner(atlas,()=>atlasQueues++);
releaseOwner(massflesh,()=>massQueues++);
releaseOwner(profReset,()=>resets++);
const fakeWindow={
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},
  confirm(){return true;}
};
const safetyContext={
  window:fakeWindow,document:{},PointerEvent:ProbePointerEvent,Event:ProbeEvent,
  performance:{now:()=>now},getComputedStyle:()=>({display:'block'})
};
vm.runInNewContext(safetySrc,safetyContext,{filename:'input-safety-section.js'});
function sendSafety(target,type,id,x=20,y=20,isPrimary=true){
  const ev=new ProbePointerEvent(type,{target,pointerId:id,pointerType:'touch',isPrimary,clientX:x,clientY:y,button:0,buttons:type==='pointerup'?0:1});
  for(const fn of listeners.get(type)||[])fn(ev);
  if(!ev.immediateStopped)target.dispatchEvent(ev);
  return ev;
}
sendSafety(queueBtn,'pointerdown',1);
check(toggles===0,'queueBtn fired on initial pointerdown instead of waiting for release');
sendSafety(queueBtn,'pointerup',1);
check(toggles===1,'stationary queueBtn gesture did not replay exactly once on release');
now+=1000;
sendSafety(queueBtn,'pointerdown',2);sendSafety(queueBtn,'pointermove',2,42,20);sendSafety(queueBtn,'pointerup',2,42,20);
check(toggles===1,'dragged queueBtn gesture was not cancelled');
now+=1000;
sendSafety(queueBtn,'pointerdown',3);sendSafety(queueBtn,'pointercancel',3);
check(toggles===1,'cancelled queueBtn gesture replayed a command');

/* Run the real shared tap binder, not a release-owner approximation. The
   global guard replays setupStart through synthetic PointerEvents; those must
   carry primary-contact state or mfBindTap correctly rejects the replay. */
const tapSrc=sectionOf(meta,'let MF_POINTER_COMMIT','function mfSetTabs');
const tapContext={performance:{now:()=>now}};
vm.runInNewContext(tapSrc+'\nglobalThis.mfBindTap=mfBindTap;',tapContext,{filename:'meta-bind-tap-section.js'});
const setupStart=makeControl({id:'setupStart',tagName:'BUTTON'});
let setupCommits=0;tapContext.mfBindTap(setupStart,()=>setupCommits++);
now+=1000;
sendSafety(setupStart,'pointerdown',15);sendSafety(setupStart,'pointerup',15);
check(setupCommits===1,'globally guarded mfBindTap control did not commit exactly once after primary replay');
now+=1000;
sendSafety(setupStart,'pointerdown',16,20,20,false);sendSafety(setupStart,'pointerup',16,20,20,false);
check(setupCommits===1,'global replay promoted a secondary contact through the real mfBindTap contract');

now+=1000;
sendSafety(fieldStudy,'pointerdown',4);
check(studies===0,'bare Field Study bcard fired on initial pointerdown');
sendSafety(fieldStudy,'pointerup',4);
check(studies===1,'bare Field Study bcard did not replay once after a completed release');
now+=1000;
sendSafety(fieldStudy,'pointerdown',5);sendSafety(fieldStudy,'pointermove',5,42,20);sendSafety(fieldStudy,'pointerup',5,42,20);
check(studies===1,'Field Study scroll gesture committed research');
now+=1000;
sendSafety(fieldStudy,'pointerdown',6);sendSafety(fieldStudy,'pointercancel',6);
check(studies===1,'cancelled Field Study contact committed research');

for(const [card,label,count] of [[atlas,'Atlas',()=>atlasQueues],[massflesh,'Massflesh',()=>massQueues]]){
  now+=1000;sendSafety(card,'pointerdown',card===atlas?7:9);sendSafety(card,'pointermove',card===atlas?7:9,42,20);sendSafety(card,'pointerup',card===atlas?7:9,42,20);
  check(count()===0,label+' scroll gesture queued production');
  now+=1000;sendSafety(card,'pointerdown',card===atlas?8:10);sendSafety(card,'pointerup',card===atlas?8:10);
  check(count()===1,label+' stationary release did not queue exactly once');
}

now+=1000;
sendSafety(profReset,'pointerdown',11);sendSafety(profReset,'pointermove',11,42,20);sendSafety(profReset,'pointerup',11,42,20);
check(resets===0,'profile Reset drag armed or executed the action');
now+=1000;
sendSafety(profReset,'pointerdown',12);sendSafety(profReset,'pointerup',12);
check(resets===1,'profile Reset completed release did not reach its first step');
now+=50;
sendSafety(profReset,'pointerdown',13);sendSafety(profReset,'pointerup',13);
check(resets===1,'same-control destructive bounce reached the second step');
now+=181;
sendSafety(profReset,'pointerdown',14);sendSafety(profReset,'pointerup',14);
check(resets===2,'deliberate destructive confirmation after bounce window was blocked');

const controls=[queueBtn,fieldStudy,atlas,massflesh,profReset];
const inventory=fakeWindow.mfUiControlInventory({querySelectorAll:()=>controls});
check(inventory.disruptive.some(row=>row.id==='queueBtn'),'queueBtn is not classified disruptive');
check(inventory.disruptive.some(row=>row.id==='fieldStudyProbe'&&row.protection==='global-release-after-drag-threshold'),
  'bare Field Study card is absent or falsely marked locally guarded');
check(inventory.disruptive.some(row=>row.id==='atlasProbe'&&row.protection==='local-release-after-drag-threshold'),
  'Atlas card is not reported as locally release guarded');

for(const id of ['profReset','profDel','bp_sell']){
  check(main.includes("mfBindTap($('"+id+"'),"),id+' is not bound through completed-release mfBindTap');
  check(!main.includes("$('"+id+"').addEventListener('pointerdown'"),id+' still owns destructive logic on pointerdown');
}
check((airlift.match(/mfAirliftBindReleaseCard\(d,ev=>/g)||[]).length===3,
  'Atlas/Massflesh callers do not all use the release-card binder');
const airliftBindSrc=sectionOf(airlift,'function mfAirliftBindReleaseCard(d,fn){','\n\nfunction mfAirliftRenderCard');
let bound=0,fallback=0;
const boundCtx={mfBindTap(){bound++;}};
vm.runInNewContext(airliftBindSrc,boundCtx,{filename:'airlift-release-card.js'});
const boundCard={dataset:{},addEventListener(){fallback++;}};
boundCtx.mfAirliftBindReleaseCard(boundCard,()=>{});
check(bound===1&&fallback===0&&boundCard.dataset.mfReleaseSafe==='1',
  'airlift release binder did not mark and bind the local release contract');
const fallbackCtx={};vm.runInNewContext(airliftBindSrc,fallbackCtx,{filename:'airlift-release-card-fallback.js'});
const fallbackCard={dataset:{},addEventListener(type){if(type==='pointerdown')fallback++;}};
fallbackCtx.mfAirliftBindReleaseCard(fallbackCard,()=>{});
check(fallback===1&&!fallbackCard.dataset.mfReleaseSafe,
  'airlift pointerdown fallback was incorrectly advertised as locally release safe');

/* Execute the current endPtr body. A control pointerup proves the fixture can
   reach the commit paths; pointercancel must reach the same cleanup without
   calling onTap or walking the box selection set. */
const endPtrSrc=section('function endPtr(e){',"cv.addEventListener('pointerup',endPtr);");
function endContext({box=false}={}){
  const p={x:20,y:20,sx:0,sy:0,t:0,moved:false,held:false,pointerType:'touch',shift:false};
  const selbox={style:{display:'block'}},boxBtn={classList:{remove(){}}};
  let taps=0,selections=0;
  const ctx={
    clearTimeout(){},holdTimer:0,ptrs:new Map([[7,p]]),multiTouch:false,
    aiming:-1,orderPreview:null,boxStart:box?[0,0]:null,boxAdd:false,boxMode:box,
    performance:{now:()=>100},HOLD_MS:520,TAP_JITTER_MS:220,TAP_JITTER_PX:28,
    placing:null,lastTapShift:false,onTap(){taps++;},
    document:{getElementById(id){return id==='selbox'?selbox:id==='boxBtn'?boxBtn:null;}},
    unitHigh:1,ualive:[1],uteam:[0],utype:[0],TYPES:[{size:10}],ux:[5],uy:[5],usel:[0],
    terrainH(){return 0;},w2s(){return [5,5];},clearSel(){},uiCommandAck(){},updateSelInfo(){selections++;}
  };
  vm.runInNewContext(endPtrSrc,ctx,{filename:'input-end-pointer-section.js'});
  return {ctx,p,selbox,get taps(){return taps;},get selections(){return selections;}};
}
const tapCancel=endContext();tapCancel.ctx.endPtr({type:'pointercancel',pointerId:7});
check(tapCancel.taps===0,'pointercancel reached onTap');
const tapUp=endContext();tapUp.ctx.endPtr({type:'pointerup',pointerId:7});
check(tapUp.taps===1,'control pointerup did not reach onTap in the fixture');
const boxCancel=endContext({box:true});boxCancel.ctx.endPtr({type:'pointercancel',pointerId:7});
check(boxCancel.ctx.usel[0]===0&&boxCancel.selections===0,'pointercancel committed box selection');
check(boxCancel.ctx.boxStart===null&&boxCancel.selbox.style.display==='none','pointercancel did not clean up the selection box');
const boxUp=endContext({box:true});boxUp.ctx.endPtr({type:'pointerup',pointerId:7});
check(boxUp.ctx.usel[0]===1&&boxUp.selections===1,'control box pointerup did not select in the fixture');

if(failures.length){
  console.error('FAIL — Stage 7 input cancellation\n  '+failures.join('\n  '));
  process.exitCode=1;
}else{
  console.log('PASS — queue, Field Study, Atlas/Massflesh and destructive callers require bounce-safe completed release; pointercancel commits nothing');
}
