#!/usr/bin/env node
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const main=await readFile(fileURLToPath(new URL('../src/main.js',import.meta.url)),'utf8');
const auth=await readFile(fileURLToPath(new URL('../src/authportal.js',import.meta.url)),'utf8');
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg);};
function section(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a);
  if(a<0||b<0)throw new Error('Could not extract '+start+' … '+end);
  return source.slice(a,b);
}

const backSrc=section(main,'let nativeBackExitAt=0;','function initNativeNavigation(){');
const initSrc=section(main,'function initNativeNavigation(){','/* One exit transaction');
check(initSrc.includes("window.addEventListener('keydown',nativeBackEscape)"),'nativeBackEscape is not registered');
check(initSrc.indexOf("window.addEventListener('keydown',nativeBackEscape)")<initSrc.indexOf("if(!A||typeof A.addListener!=='function')return"),
  'Escape registration is incorrectly gated on the Capacitor App plugin');
function backContext(){
  const elements=new Map();
  const el=id=>{
    if(!elements.has(id))elements.set(id,{id,style:{display:'none'},classList:{remove(){}},clicks:0,click(){this.clicks++;}});
    return elements.get(id);
  };
  let queueCancels=0,rallyCancels=0,portalCloses=0,toasts=0,sounds=0;
  const ctx={
    $:el,getComputedStyle:node=>({display:node.style.display}),
    document:{body:{},activeElement:null},performance:{now:()=>1000},
    aiming:-1,placing:null,armQueue:false,armRally:-1,armPatrol:false,
    armFormation:false,orderPreview:null,boxMode:false,running:true,paused:false,
    cancelQueueDraft(){queueCancels++;ctx.armQueue=false;},
    disarmRally(){rallyCancels++;ctx.armRally=-1;},
    cancelPatrolDraft(){},toast(){toasts++;},sfx(){sounds++;},apClose(){portalCloses++;}
  };
  ctx.document.activeElement=ctx.document.body;
  vm.runInNewContext(backSrc,ctx,{filename:'main-native-back-section.js'});
  return {ctx,el,get queueCancels(){return queueCancels;},get rallyCancels(){return rallyCancels;},get portalCloses(){return portalCloses;},get toasts(){return toasts;},get sounds(){return sounds;}};
}

const queue=backContext();queue.ctx.armQueue=true;queue.ctx.handleNativeBack();
check(queue.queueCancels===1,'Android Back did not cancel an armed queue');
check(queue.ctx.paused===false&&queue.el('pauseOverlay').style.display==='none','Android Back opened Pause before cancelling queue mode');

const rally=backContext();rally.ctx.armRally=4;rally.ctx.handleNativeBack();
check(rally.rallyCancels===1&&rally.ctx.armRally===-1,'Android Back did not disarm rally placement');
check(rally.ctx.paused===false&&rally.el('pauseOverlay').style.display==='none','Android Back opened Pause before cancelling rally mode');

const plain=backContext();plain.ctx.handleNativeBack();
check(plain.ctx.paused===true&&plain.el('pauseOverlay').style.display==='flex','Back without an armed command did not open Pause');

const escape=backContext();escape.ctx.armQueue=true;
const key={key:'Escape',defaultPrevented:false,repeat:false,isComposing:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;}};
escape.ctx.nativeBackEscape(key);
check(key.defaultPrevented&&key.stopped,'Escape was not consumed by the Back hierarchy');
check(escape.queueCancels===1&&escape.ctx.paused===false,'Escape did not cancel queue mode before Pause');
const ownedEscape=backContext();ownedEscape.ctx.armQueue=true;
ownedEscape.ctx.nativeBackEscape({key:'Escape',defaultPrevented:true,repeat:false,isComposing:false});
check(ownedEscape.queueCancels===0,'Escape ignored another modal\'s preventDefault ownership');

const confirmBack=backContext();
confirmBack.el('apConfirmOverlay').style.display='flex';
confirmBack.el('apOverlay').style.display='flex';
confirmBack.ctx.handleNativeBack();
check(confirmBack.el('apConfirmNo').clicks===1,'Android Back did not choose the non-destructive auth-confirm action');
check(confirmBack.portalCloses===0,'Android Back closed the auth portal underneath its confirm dialog');

/* Exercise the actual auth confirm helpers and key/focus handler against a
   minimal DOM. The local confirm must be the active focus trap and Escape must
   run its Cancel callback, not close the parent account portal. */
const confirmSrc=section(auth,'function apConfirmIsOpen(){','/* ---- small helpers');
const keySrc=section(auth,'function apKeyHandler(e){','function apOpen(triggerEl){');
let portalCloses=0,noCalls=0,replacementFocuses=0;
const nodes={};
const doc={body:{id:'body',isConnected:true,focus(){doc.activeElement=this;}},activeElement:null,getElementById:id=>nodes[id]||null};
const row={classList:{toggle(){}}};
function button(id){
  return nodes[id]={id,disabled:false,offsetParent:{},style:{},onclick:null,
    isConnected:true,focuses:0,focus(){this.focuses++;doc.activeElement=this;},
    click(){if(typeof this.onclick==='function')this.onclick();}};
}
const no=button('apConfirmNo'),yes=button('apConfirmYes'),alt=button('apConfirmAlt');
yes.parentElement=row;
nodes.apConfirmTx={textContent:''};
let replacement=null;
const confirmOverlay=nodes.apConfirmOverlay={style:{display:'none'},
  querySelectorAll(){return [no,yes];},contains(node){return node===no||node===yes||node===alt;}};
const fallback=button('apCloseFallback');
const restore=nodes.apPull={id:'apPull',isConnected:true,focus(){doc.activeElement=this;}};
nodes.apOverlay={style:{display:'flex'},querySelectorAll(){return [fallback];},
  contains(node){return node===restore||node===replacement||node===fallback;}};
doc.activeElement=restore;
let raf=[];
const flushRaf=()=>{const jobs=raf;raf=[];for(const fn of jobs)fn();};
const authCtx={
  document:doc,AP_CONFIRM_LAST_FOCUS:null,AP_CONFIRM_LAST_FOCUS_ID:'',AP_CONFIRM_FOCUS_TOKEN:0,
  apConfirmBuildUI(){},requestAnimationFrame(fn){raf.push(fn);},apClose(){portalCloses++;}
};
vm.runInNewContext(confirmSrc+'\n'+keySrc,authCtx,{filename:'auth-confirm-section.js'});
authCtx.apConfirm('Replace save?','REPLACE','CANCEL',null,()=>{
  noCalls++;restore.isConnected=false;
  replacement=nodes.apPull={id:'apPull',isConnected:true,focus(){replacementFocuses++;doc.activeElement=this;}};
});
flushRaf();
check(confirmOverlay.style.display==='flex'&&doc.activeElement===no,'auth confirm did not focus its safe default');
const outside={};doc.activeElement=outside;
const tab={key:'Tab',shiftKey:false,prevented:false,preventDefault(){this.prevented=true;}};
authCtx.apKeyHandler(tab);
check(tab.prevented&&doc.activeElement===no,'Tab was not redirected into the topmost auth confirm');
const esc={key:'Escape',prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
authCtx.apKeyHandler(esc);
check(esc.prevented&&esc.stopped,'auth confirm Escape was not consumed');
check(noCalls===1&&portalCloses===0&&confirmOverlay.style.display==='none','auth confirm Escape did not cancel only the confirm');
flushRaf();
check(replacementFocuses===1&&doc.activeElement===replacement,'auth confirm did not restore focus by stable id after callback rerender');
/* Dismiss before the initial-focus frame. Its stale callback must not focus the
   now-hidden Cancel button after the restoration frame runs. */
doc.activeElement=replacement;
authCtx.apConfirm('Second confirm','YES','NO',null,null);
const noFocusesBefore=no.focuses;
authCtx.apKeyHandler({key:'Escape',preventDefault(){},stopPropagation(){}});
flushRaf();
check(no.focuses===noFocusesBefore&&doc.activeElement===replacement,'deferred initial focus overrode confirm dismissal');
/* Real sync flows often rerender before opening the confirm, leaving body as
   activeElement. Restoration must choose a live parent-modal control instead. */
doc.activeElement=doc.body;
authCtx.apConfirm('Body fallback','YES','NO',null,null);flushRaf();
authCtx.apKeyHandler({key:'Escape',preventDefault(){},stopPropagation(){}});flushRaf();
check(doc.activeElement===fallback,'body focus was restored instead of a usable parent-modal control');
authCtx.apKeyHandler({key:'Escape',preventDefault(){},stopPropagation(){}});
check(portalCloses===1,'Escape with no auth confirm did not close the parent portal');

if(failures.length){
  console.error('FAIL — Stage 7 Back/auth navigation\n  '+failures.join('\n  '));
  process.exitCode=1;
}else{
  console.log('PASS — Back/Escape unwind queue and rally; auth confirm owns dismissal and focus');
}
