/* The launcher must never present a screen with no usable control.
 *
 * updatePrimary() begins by hiding and disabling PLAY OFFLINE, then each branch
 * re-enables it where offline play is legal. The identity-pending branch
 * returned before doing so, so a device whose identity never resolved showed a
 * disabled "VERIFYING IDENTITY…" and nothing else. Identity has several exits
 * that legitimately leave 'pending' — a cleared 401 session, a stale epoch, a
 * missing gate overlay, a gate throw — and none of them scheduled a retry, so
 * that state could last the whole session and lock the player out of a game
 * they can play offline.
 *
 * This proves the escape stays live while pending, that a real update transfer
 * still suppresses it, and that identity cannot sit in 'pending' forever. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

/* ---- a DOM small enough to read and large enough to run the launcher ---- */
function makeElement(id){
  const el = {
    id, style:{_v:{},
      setProperty(k,v){this._v[k]=v;}, getPropertyValue(k){return this._v[k]||'';},
      removeProperty(k){delete this._v[k];}},
    dataset:{}, disabled:false, textContent:'', className:'', children:[], hidden:false,
    classList:{_s:new Set(),
      add(...c){c.forEach(x=>this._s.add(x));}, remove(...c){c.forEach(x=>this._s.delete(x));},
      toggle(c,f){ if(f===undefined){this._s.has(c)?this._s.delete(c):this._s.add(c);} else if(f){this._s.add(c);} else {this._s.delete(c);} return this._s.has(c);},
      contains(c){return this._s.has(c);}},
    setAttribute(k,v){ this['attr_'+k]=String(v); }, getAttribute(k){ return this['attr_'+k]??null; },
    removeAttribute(k){ delete this['attr_'+k]; },
    addEventListener(){}, removeEventListener(){}, appendChild(c){this.children.push(c);return c;},
    querySelector(){return null;}, querySelectorAll(){return [];},
    insertAdjacentHTML(){}, focus(){}, click(){}, remove(){},
    getBoundingClientRect(){return {width:0,height:0,top:0,left:0,right:0,bottom:0};}
  };
  /* the launcher toggles visibility through .style.display as a plain string */
  el.style.display='';
  return el;
}

function makeHarness(){
  const nodes = new Map();
  const byId = id => { if(!nodes.has(id)) nodes.set(id, makeElement(id)); return nodes.get(id); };
  const listeners = new Map();
  const document = {
    body: makeElement('body'),
    documentElement: makeElement('html'),
    getElementById: byId,
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    createElement(t){ return makeElement('created:'+t); },
    addEventListener(type,fn){ listeners.set(type,(listeners.get(type)||[]).concat(fn)); },
    removeEventListener(){}, dispatchEvent(){ return true; },
    readyState:'complete', hidden:false
  };
  const timers = [];
  const context = {
    console, JSON, Math, String, Number, Boolean, Array, Object, Date, RegExp, Error, isNaN, parseInt, parseFloat,
    document, localStorage:{ _m:new Map(),
      getItem(k){ return this._m.has(k)?this._m.get(k):null; },
      setItem(k,v){ this._m.set(k,String(v)); }, removeItem(k){ this._m.delete(k); } },
    navigator:{ onLine:true }, location:{ href:'http://localhost/', protocol:'http:' },
    setTimeout(fn,ms){ const t={fn,ms,cleared:false}; timers.push(t); return t; },
    clearTimeout(t){ if(t) t.cleared=true; },
    setInterval(){ return null; }, clearInterval(){},
    requestAnimationFrame(fn){ return context.setTimeout(fn,16); },
    CustomEvent: class { constructor(type,init){ this.type=type; this.detail=(init||{}).detail; } },
    fetch: async()=>{ throw new Error('network disabled in this harness'); }
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  context.window.addEventListener = (type,fn)=>{ listeners.set(type,(listeners.get(type)||[]).concat(fn)); };
  context.window.removeEventListener = ()=>{};
  context.window.dispatchEvent = ev => { (listeners.get(ev.type)||[]).forEach(fn=>fn(ev)); return true; };
  vm.createContext(context);
  return {context, byId, timers, fire(type,detail){ context.window.dispatchEvent(new context.CustomEvent(type,{detail})); }};
}

/* ============================ launcher: the escape ========================= */
{
  const source = await readFile(resolve(root,'src/launcher.js'),'utf8');
  assert.match(source,/function updatePrimary\(\)/,'launcher updatePrimary\\(\\) is missing');

  const h = makeHarness();
  /* Identity never resolves; the updater is idle and not transferring. */
  h.context.mfIdentitySnapshot = () => ({state:'pending',signedIn:false,verified:false,source:'gate-error',revision:1});
  h.context.mfUpdaterSnapshot = () => ({state:'idle',status:'',installedVersion:'1.33.63',serverVersion:'',
    channel:'stable',category:'',title:'',summary:'',features:[],fixes:[],upcoming:[],
    progress:{bytes:0,total:0,ratio:0,percent:0,speedBps:0},
    readiness:{online:true,busy:false,current:false},
    action:{id:'wait',label:'PLEASE WAIT',enabled:false},history:{published:[],device:[]}});
  h.context.onlineAllowed = () => true;
  h.context.netAllowed = () => true;

  vm.runInContext(source, h.context, {filename:'src/launcher.js'});
  assert.equal(typeof h.context.initLauncherGateway,'function','launcher did not export its gateway');
  h.context.initLauncherGateway();
  h.fire('massfront:intro-complete');
  /* Identity events are how auth tells the launcher anything changed. */
  h.fire('massfront:identity-state',{state:'pending',signedIn:false,verified:false,source:'gate-error',revision:2});

  const offline = h.byId('mfLaunchOffline');
  const play = h.byId('mfLaunchPlay');

  assert.equal(play.disabled,true,'primary action should wait while identity is pending');
  assert.match(String(play.textContent),/VERIFYING IDENTITY/i,'pending primary lost its wait label');
  assert.notEqual(offline.style.display,'none',
    'PLAY OFFLINE was hidden while identity was pending — the launcher had no usable control');
  assert.equal(offline.disabled,false,
    'PLAY OFFLINE was disabled while identity was pending — the launcher had no usable control');
}

/* A real transfer still owns the footer: offline play must not race an install. */
{
  const source = await readFile(resolve(root,'src/launcher.js'),'utf8');
  const h = makeHarness();
  h.context.mfIdentitySnapshot = () => ({state:'pending',signedIn:false,verified:false,source:'gate-error',revision:1});
  h.context.mfUpdaterSnapshot = () => ({state:'downloading',status:'',installedVersion:'1.33.63',serverVersion:'1.33.64',
    channel:'stable',category:'',title:'',summary:'',features:[],fixes:[],upcoming:[],
    progress:{bytes:10,total:100,ratio:.1,percent:10,speedBps:1000},
    readiness:{online:true,busy:true,current:false},
    action:{id:'cancel',label:'CANCEL',enabled:true},history:{published:[],device:[]}});
  h.context.onlineAllowed = () => true;
  h.context.netAllowed = () => true;
  vm.runInContext(source, h.context, {filename:'src/launcher.js'});
  h.context.initLauncherGateway();
  h.fire('massfront:identity-state',{state:'pending',signedIn:false,verified:false,source:'gate-error',revision:2});
  assert.equal(h.byId('mfLaunchOffline').style.display,'none',
    'an in-flight transfer must still suppress the offline route');
}

/* ======================= authportal: pending cannot stick ================== */
{
  const source = await readFile(resolve(root,'src/authportal.js'),'utf8');
  assert.match(source,/function apIdentitySet\(/,'authportal apIdentitySet\\(\\) is missing');
  assert.match(source,/identity-timeout/,'authportal has no identity watchdog');

  /* Exercise the watchdog contract directly: the guarded region is small and
     self-contained, and running the whole portal would drag in its DOM gate. */
  const start = source.indexOf('const AP_IDENTITY_WAIT_MS');
  const end = source.indexOf('window.MFIdentity=Object.freeze');
  assert.ok(start>0 && end>start,'watchdog block is not where the contract expects it');

  const h = makeHarness();
  const slice = source.slice(0, end);
  vm.runInContext(slice + '\nglobalThis.__set=apIdentitySet;\nglobalThis.__snap=mfIdentitySnapshot;\n' +
    'globalThis.__armed=()=>AP_IDENTITY_WATCHDOG;', h.context, {filename:'src/authportal.js'});

  h.context.__set('pending','gate-error');
  assert.equal(h.context.__snap().state,'pending');
  const armed = h.context.__armed();
  assert.ok(armed,'no watchdog was armed for a stuck pending identity');
  armed.fn();
  assert.equal(h.context.__snap().state,'offline',
    'a stuck pending identity never degraded to offline — the player stays locked out');
  assert.equal(h.context.__snap().source,'identity-timeout');
}

/* The open sign-in gate is a person reading a dialog, not a stall. */
{
  const source = await readFile(resolve(root,'src/authportal.js'),'utf8');
  const end = source.indexOf('window.MFIdentity=Object.freeze');
  const h = makeHarness();
  vm.runInContext(source.slice(0,end) + '\nglobalThis.__set=apIdentitySet;\nglobalThis.__armed=()=>AP_IDENTITY_WATCHDOG;',
    h.context, {filename:'src/authportal.js'});
  h.context.__set('pending','awaiting-choice');
  assert.equal(h.context.__armed(),null,
    'the open sign-in gate must never self-dismiss on a timer');
}

/* Reaching a terminal state disarms the watchdog. */
{
  const source = await readFile(resolve(root,'src/authportal.js'),'utf8');
  const end = source.indexOf('window.MFIdentity=Object.freeze');
  const h = makeHarness();
  vm.runInContext(source.slice(0,end) + '\nglobalThis.__set=apIdentitySet;\nglobalThis.__armed=()=>AP_IDENTITY_WATCHDOG;',
    h.context, {filename:'src/authportal.js'});
  h.context.__set('pending','session-verification');
  assert.ok(h.context.__armed(),'verification did not arm a watchdog');
  h.context.__set('connected','session-verified');
  assert.equal(h.context.__armed(),null,'a resolved identity left its watchdog armed');
}

/* ============ launcher: the retry control must stay reachable ============= */
/* renderUpdate() disabled #updBtn on !onlineAllowed(), which folds in
   navigator.onLine. A WebView false negative therefore greyed out the only
   control that could reach the update service, on a connected device, with no
   explanation. Only the player's own Offline Mode may disable it now. */
function launcherWith(net, updaterState){
  const h = makeHarness();
  h.context.mfIdentitySnapshot = () => ({state:'offline',signedIn:false,verified:false,source:'remembered-offline',revision:1});
  h.context.mfUpdaterSnapshot = () => updaterState;
  h.context.netForcedOffline = () => net.forced;
  h.context.netAllowed = () => !net.forced && !net.browserOffline;
  h.context.navigator.onLine = !net.browserOffline;
  return h;
}
const IDLE_SNAP = {state:'unset',status:'',installedVersion:'1.33.63',serverVersion:'',
  channel:'stable',category:'',title:'',summary:'',features:[],fixes:[],upcoming:[],
  progress:{bytes:0,total:0,ratio:0,percent:0,speedBps:0},
  readiness:{online:false,busy:false,current:false},
  action:{id:'check',label:'RETRY',enabled:true},history:{published:[],device:[]}};

{
  const source = await readFile(resolve(root,'src/launcher.js'),'utf8');
  const h = launcherWith({forced:false,browserOffline:true}, IDLE_SNAP);
  vm.runInContext(source, h.context, {filename:'src/launcher.js'});
  h.context.initLauncherGateway();
  h.fire('massfront:update-state', IDLE_SNAP);
  const btn = h.byId('updBtn');
  assert.equal(btn.disabled,false,
    'a browser offline hint greyed out RETRY — the device could never reach the update service');
}
{
  const source = await readFile(resolve(root,'src/launcher.js'),'utf8');
  const h = launcherWith({forced:true,browserOffline:false}, IDLE_SNAP);
  vm.runInContext(source, h.context, {filename:'src/launcher.js'});
  h.context.initLauncherGateway();
  h.fire('massfront:update-state', IDLE_SNAP);
  assert.equal(h.byId('updBtn').disabled,true,
    "the player's own Offline Mode must still disable the remote retry");
}

console.log('PASS launcher identity lockout: offline escape stays live while identity is pending, '+
  'RETRY stays reachable through a browser offline hint but not through Offline Mode, '+
  'transfers still suppress it, stuck identity degrades to offline, the open gate never self-dismisses, '+
  'and resolution disarms the watchdog');
