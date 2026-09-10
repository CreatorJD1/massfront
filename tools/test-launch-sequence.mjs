import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function harness({bundled=true,search=''}={}) {
  const nodes=new Map(),events=new Map(),timers=[],calls=[];
  function element(id) {
    const listeners=new Map(),classes=new Set();
    const el={id,style:{setProperty(){},removeProperty(){}},dataset:{},disabled:false,hidden:false,
      classList:{add(...xs){xs.forEach(x=>classes.add(x));},remove(...xs){xs.forEach(x=>classes.delete(x));},contains:x=>classes.has(x),toggle(x,on){if(on===undefined)on=!classes.has(x);if(on)classes.add(x);else classes.delete(x);}},
      setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},getAttribute(k){return this[k]||null;},
      addEventListener(k,fn){listeners.set(k,fn);},querySelector(){return null;},querySelectorAll(){return [];},
      appendChild(child){child.parentNode=this;return child;},removeChild(){},remove(){},contains(){return false;},focus(){},blur(){},
      click(){if(!this.disabled)listeners.get('click')?.();},
      getBoundingClientRect(){return {width:412,height:900};}};
    Object.defineProperty(el,'innerHTML',{set(value){
      this.markup=value;
      for(const match of String(value).matchAll(/id="([^"]+)"/g))byId(match[1]);
      const first=String(value).match(/id="([^"]+)"/);this.firstElementChild=first?byId(first[1]):null;
    },get(){return this.markup||'';}});
    return el;
  }
  function byId(id){if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);}
  const identity={state:'pending',verified:false,source:'startup',revision:0};
  const ctx={console,Promise,URL,Date,JSON,navigator:{onLine:true},location:{search},
    document:{body:element('body'),getElementById:byId,querySelectorAll:()=>[],createElement:tag=>element(tag),addEventListener(){},activeElement:null},
    localStorage:{getItem:()=>null,setItem(){}},
    setTimeout(fn,ms){const job={fn,ms};timers.push(job);return job;},clearTimeout(job){if(job)job.done=true;},
    requestAnimationFrame(fn){return ctx.setTimeout(fn,16);},
    CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},
    __MF_BUILD_HAS_GALACTIC_EXPLORATION:bundled,
    mfIdentitySnapshot:()=>identity,
    mfUpdaterSnapshot:()=>({state:'checking',status:'Checking',action:{id:'wait',enabled:false},progress:{},history:{},readiness:{busy:true}}),
    showFrontScreen:id=>calls.push('screen:'+id),
    mfAuthGate(){calls.push('auth');ctx.dispatchEvent(new ctx.CustomEvent('massfront:identity-state',{detail:{state:'offline',source:'offline-choice',verified:false}}));},
    mfOpenExploration(view){calls.push('galactic:'+view);return Promise.resolve(true);},
    netSetOffline(){},netAllowed:()=>true,netForcedOffline:()=>false};
  ctx.window=ctx;ctx.addEventListener=(type,fn)=>events.set(type,[...(events.get(type)||[]),fn]);
  ctx.dispatchEvent=event=>{for(const fn of events.get(event.type)||[])fn(event);return true;};
  vm.createContext(ctx);
  for(const name of ['intro','launcher'])vm.runInContext(readFileSync(new URL('../src/'+name+'.js',import.meta.url),'utf8'),ctx,{filename:'src/'+name+'.js'});
  return {ctx,calls,byId,fire(type,detail){ctx.dispatchEvent(new ctx.CustomEvent(type,{detail}));},
    flush(max=340){for(let i=0;i<timers.length;i++){const t=timers[i];if(!t.done&&t.ms<=max){t.done=true;t.fn();}}}};
}

for(const bundled of [true,false]){
  const h=harness({bundled});h.ctx.initIntro();h.ctx.initLauncherGateway();h.flush();
  assert.equal(h.ctx.mfLauncherSnapshot().phase,'updater');
  assert.equal(h.calls.includes('auth'),false,'auth must not open before updater continuation');
  assert.equal(h.byId('mfLaunchPlay').disabled,true,'checking must own the Continue control');
  h.fire('massfront:identity-state',{state:'connected',verified:true,source:'session-verified'});
  assert.equal(h.calls.some(x=>x.startsWith('galactic:')),false,'early identity cannot bypass updater');
  h.fire('massfront:update-state',{state:'current',action:{id:'play',enabled:true},progress:{},history:{},readiness:{busy:false}});
  h.byId('mfLaunchPlay').click();h.flush();
  assert.equal(h.ctx.mfLauncherSnapshot().phase,'intro');
  assert.equal(h.calls.includes('auth'),false,'auth must wait for intro dismissal');
  h.byId('mfIntroStart').click();h.flush();await Promise.resolve();
  assert.equal(h.calls.filter(x=>x==='auth').length,1);
  assert.deepEqual(h.calls.filter(x=>x.startsWith('galactic:')),bundled?['galactic:campaign_hub']:[],
    'normal launch must enter the stable Galactic home, never auto-depart into system travel');
  assert.equal(h.calls.includes('screen:startScreen'),!bundled,
    'the legacy dashboard is a fallback, not an intermediate launcher before Galactic home');
  h.fire('massfront:identity-state',{state:'offline',source:'remembered-offline'});
  h.fire('massfront:identity-state',{state:'connected',verified:true});await Promise.resolve();
  assert.equal(h.calls.filter(x=>x.startsWith('galactic:')).length,bundled?1:0,'duplicate identity must not launch twice');
}
for(const route of ['galacticRoute','groundOperation']){
  const h=harness({search:'?'+route+'=0123456789abcdef0123456789abcdef'});
  h.ctx.initIntro();h.ctx.initLauncherGateway();
  assert.equal(h.ctx.mfLauncherSnapshot().bypass,true,'secured return must bypass launch gate');
}
for(const search of ['?groundOperation=short','?groundOperation=0123456789abcdef0123456789abcdef&extra=1','?galacticRoute=0123456789abcdef0123456789abcdef&extra=1']){
  const h=harness({search});h.ctx.initIntro();h.ctx.initLauncherGateway();
  assert.equal(h.ctx.mfLauncherSnapshot().bypass,false,'malformed/extra query must not bypass launch gate');
}
console.log('PASS launch sequence: updater -> intro -> identity -> Galactic, no early auth/entry, duplicate identity safe, diagnostic fallback and secured return.');
