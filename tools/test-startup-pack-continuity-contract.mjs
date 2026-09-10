import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../src/assetpack.js',import.meta.url),'utf8');
function fixture({locks=true,offline=false}={}){
  const timers=new Map(),listeners=new Map();let next=0;
  const state={offline};
  const c={console,Blob,Uint8Array,Uint32Array,Map,Set,Date,Math,Object,Array,String,Number,RegExp,Error,TypeError,Promise,
    navigator:{onLine:true,...(locks?{locks:{request:async(n,o,cb)=>cb({name:n})}}:{})},
    localStorage:{getItem:k=>k==='massfront_offline'&&state.offline?'1':null},
    document:{getElementById:()=>null},
    setTimeout:(fn,delay)=>{timers.set(++next,{fn,delay});return next;},clearTimeout:id=>timers.delete(id),
    addEventListener:(name,cb)=>listeners.set(name,cb),dispatchEvent:()=>{},
    URL:{},fetch:()=>{throw Error('contract must not access network');}};
  c.window=c;vm.createContext(c);vm.runInContext(source,c);
  return {c,state,timers,listeners,run:code=>vm.runInContext(code,c),async tick(){const [id,item]=timers.entries().next().value;timers.delete(id);await item.fn();}};
}
const unsupported=fixture({locks:false});
unsupported.run('var writes=0;packLoadCachedIndex=async()=>null');
assert.equal((await unsupported.run('packWithWriter(async()=>{writes++;return {ok:true}},true)')).reason,'lock-unavailable');
assert.equal(unsupported.c.writes,0);
assert.equal((await unsupported.run('packWithWriter(async()=>{writes++;return {ok:true}},false)')).ok,true);
assert.equal(unsupported.c.writes,1,'legacy manual lane remains available without a cross-tab promise');
const retry=fixture();
retry.run('var starts=0;packStart=async()=>{starts++;return {ok:false,reason:"fetch"}}');
retry.c.MASSFRONT_ASSET_PACKS.initializeStartup({ui:false});
while(retry.timers.size)await retry.tick();
assert.equal(retry.c.starts,6,'one initial attempt plus five bounded retries');
retry.listeners.get('online')();assert.equal(retry.timers.size,1);await retry.tick();assert.equal(retry.c.starts,7);
retry.listeners.get('pagehide')();assert.equal(retry.timers.size,0);
retry.listeners.get('pageshow')();assert.equal(retry.timers.size,1);
const offline=fixture({offline:true});offline.c.MASSFRONT_ASSET_PACKS.initializeStartup({ui:false});
assert.equal(offline.timers.size,0,'canonical forced-offline preference suppresses auto start');
offline.state.offline=false;offline.listeners.get('storage')({key:'massfront_offline'});assert.equal(offline.timers.size,1);
const handoff=new Map();
const endpointFixture=()=>{
  const f=fixture();f.c.URL=URL;f.c.location={href:'https://game.test/modules/space_exploration/index.html',origin:'https://game.test'};
  f.c.sessionStorage={getItem:key=>handoff.get(key)||null,setItem:(key,value)=>handoff.set(key,value)};return f;
};
const base=endpointFixture();base.c.MASSFRONT_UPDATE_URL='https://content.test/stable/update.json?ignored=not-stored';
base.c.MASSFRONT_ASSET_PACKS.initializeStartup({ui:false});
assert.ok(handoff.has('massfront_content_endpoint_v1'),'initialization stores channel before any delayed catalog request');
assert.equal(base.run('packEndpoint()'),'https://content.test/stable');
assert.ok(!handoff.values().next().value.includes('ignored'),'endpoint record excludes query tokens');
const galactic=endpointFixture();assert.equal(galactic.run('packEndpoint()'),'https://content.test/stable');
const relativeEndpoint=endpointFixture();relativeEndpoint.c.MASSFRONT_UPDATE_URL='/update.json';
assert.equal(relativeEndpoint.run('packEndpoint()'),'https://game.test');
handoff.set('massfront_content_endpoint_v1',JSON.stringify({base:'https://user:secret@content.test',origin:'https://game.test',savedAt:Date.now()}));
const credentials=endpointFixture();assert.equal(credentials.run('packEndpoint()'),'');assert.equal(credentials.run('packNetworkAllowed()'),false);
credentials.c.MASSFRONT_UPDATE_URL='https://content.test/repaired/update.json';
credentials.c.MASSFRONT_ASSET_PACKS.retryStartup();assert.equal(credentials.run('packNetworkAllowed()'),true);assert.equal(credentials.timers.size,1);
handoff.set('massfront_content_endpoint_v1',JSON.stringify({base:'https://content.test',origin:'https://game.test',savedAt:Date.now()-86400001}));
const stale=endpointFixture();assert.equal(stale.run('packEndpoint()'),'');assert.equal(stale.run('packNetworkAllowed()'),false);
console.log(JSON.stringify({ok:true,unsupportedAutoFailClosed:true,legacyManualPreserved:true,boundedRetryAttempts:6,onlineAndPageshowResume:true,forcedOfflineKey:'massfront_offline',endpointHandoff:true,credentialAndStaleEndpointRejected:true}));
