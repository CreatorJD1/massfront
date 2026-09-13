import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/updater.js',import.meta.url),'utf8');
const start='/* ---- MATCH RUNTIME COMPATIBILITY';
const end='/* ---- END MATCH RUNTIME COMPATIBILITY';
const a=source.indexOf(start),b=source.indexOf(end,a);
assert.ok(a>=0&&b>a,'runtime compatibility implementation markers exist');
const snippet=source.slice(a,source.indexOf('*/',b)+2);
const APP_VERSION='1.33.48';
const H1='1'.repeat(64),H2='a'.repeat(64);

function descriptor(version=APP_VERSION,overrides={}){
  return {schema:'massfront.runtime-compatibility',schemaVersion:1,
    buildVersion:version,manifestHash:H1,balanceHash:H2,...overrides};
}
function response(body,ok=true){ return {ok,json:async()=>body}; }
function harness(fetchImpl=async()=>response(descriptor())){
  const context=vm.createContext({window:{},fetch:fetchImpl,Map,Object,Error,String,Array});
  vm.runInContext(`const APP_VERSION=${JSON.stringify(APP_VERSION)};
    function verNewer(a,b){const pa=String(a).split('.').map(Number),pb=String(b).split('.').map(Number);
      for(let i=0;i<Math.max(pa.length,pb.length);i++){const x=pa[i]||0,y=pb[i]||0;if(x!==y)return x>y;}return false;}
    ${snippet}`,context);
  return context;
}
async function rejectsCode(promise,code){
  await assert.rejects(promise,e=>e&&e.name==='MassfrontRuntimeCompatibilityError'&&
    e.code===code,code);
}

let fetches=0;
let h=harness(async url=>{
  fetches++;
  assert.equal(url,'./assets/data/runtime-compatibility.json');
  return response(descriptor());
});
let value=await h.window.mfRuntimeCompatibility();
assert.deepEqual({...value},{buildVersion:APP_VERSION,manifestHash:H1,balanceHash:H2});
assert.deepEqual(Object.keys(value),['buildVersion','manifestHash','balanceHash']);
assert.equal(Object.isFrozen(value),true);
assert.equal(await h.window.mfRuntimeCompatibility(),value,'same runtime uses bounded cache');
assert.equal(fetches,1,'packaged descriptor fetched once');

h=harness(async()=>{ throw new Error('packaged descriptor must not be fetched for OTA'); });
h.window.__MASSFRONT_PATCHED='1.33.49';
h.window.__MASSFRONT_PATCH_AT=123;
h.window.__MASSFRONT_RUNTIME_COMPATIBILITY=descriptor('1.33.49');
value=await h.window.mfRuntimeCompatibility();
assert.equal(value.buildVersion,'1.33.49','active newer OTA metadata wins');

h=harness(async()=>{ throw new Error('target-version OTA must not fetch packaged metadata'); });
h.window.__MASSFRONT_PATCHED=APP_VERSION;
h.window.__MASSFRONT_RUNTIME_COMPATIBILITY=descriptor(APP_VERSION);
assert.equal((await h.window.mfRuntimeCompatibility()).buildVersion,APP_VERSION,
  'boot-owned active marker accepts OTA source whose APP_VERSION equals its target');

h=harness(async()=>{ throw new Error('prerelease OTA must not fetch packaged metadata'); });
h.window.__MASSFRONT_PATCHED='1.33.49-preview.1';
h.window.__MASSFRONT_RUNTIME_COMPATIBILITY=descriptor('1.33.49-preview.1');
assert.equal((await h.window.mfRuntimeCompatibility()).buildVersion,'1.33.49-preview.1',
  'newer prerelease core is an active OTA build');

h=harness(async()=>response(descriptor(APP_VERSION,{manifestHash:'A'.repeat(64)})));
await rejectsCode(h.window.mfRuntimeCompatibility(),'MF_RUNTIME_COMPATIBILITY_MALFORMED');
h=harness(async()=>response(descriptor('1.33.47')));
await rejectsCode(h.window.mfRuntimeCompatibility(),'MF_RUNTIME_COMPATIBILITY_STALE');

fetches=0;
h=harness(async()=>{
  fetches++;
  return fetches===1?response(null,false):response(descriptor());
});
await rejectsCode(h.window.mfRuntimeCompatibility(),'MF_RUNTIME_COMPATIBILITY_UNAVAILABLE');
assert.equal((await h.window.mfRuntimeCompatibility()).buildVersion,APP_VERSION,
  'failed read is not cached permanently');
assert.equal(fetches,2);

h=harness(async()=>response(descriptor()));
h.window.__MASSFRONT_PATCHED='1.33.49';
h.window.__MASSFRONT_RUNTIME_COMPATIBILITY=descriptor('1.33.50');
await rejectsCode(h.window.mfRuntimeCompatibility(),'MF_RUNTIME_COMPATIBILITY_STALE');
h.window.__MASSFRONT_RUNTIME_COMPATIBILITY=null;
await rejectsCode(h.window.mfRuntimeCompatibility(),'MF_RUNTIME_COMPATIBILITY_UNAVAILABLE');

for(const invalid of ['1.33','1.33.47','1.33.49+local']){
  h=harness();
  h.window.__MASSFRONT_PATCHED=invalid;
  h.window.__MASSFRONT_RUNTIME_COMPATIBILITY=descriptor(invalid);
  await rejectsCode(h.window.mfRuntimeCompatibility(),
    'MF_RUNTIME_COMPATIBILITY_PATCH_STATE_INVALID');
}

let resolveFetch;
h=harness(()=>new Promise(resolve=>{ resolveFetch=resolve; }));
const packagedPending=h.window.mfRuntimeCompatibility();
h.window.__MASSFRONT_PATCHED='1.33.49';
h.window.__MASSFRONT_PATCH_AT=999;
h.window.__MASSFRONT_RUNTIME_COMPATIBILITY=descriptor('1.33.49');
resolveFetch(response(descriptor()));
await rejectsCode(packagedPending,'MF_RUNTIME_COMPATIBILITY_RUNTIME_CHANGED');
assert.equal((await h.window.mfRuntimeCompatibility()).buildVersion,'1.33.49',
  'next read follows the newly executing OTA');
delete h.window.__MASSFRONT_PATCHED;
delete h.window.__MASSFRONT_PATCH_AT;
delete h.window.__MASSFRONT_RUNTIME_COMPATIBILITY;
assert.equal((await h.window.mfRuntimeCompatibility()).buildVersion,APP_VERSION,
  'switching back selects the packaged runtime cache by identity');

console.log('PASS runtime compatibility accessor: packaged, OTA precedence, strict validation, fail-closed errors, retry, and runtime switching');
