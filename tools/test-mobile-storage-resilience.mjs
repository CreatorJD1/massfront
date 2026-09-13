import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const swSource=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const updaterSource=fs.readFileSync(new URL('../src/updater.js',import.meta.url),'utf8');
const packSource=fs.readFileSync(new URL('../src/assetpack.js',import.meta.url),'utf8');

class MemoryCache{
  constructor(){this.rows=new Map();this.failPut=false;}
  key(request){return typeof request==='string'?new URL(request,'https://game.test/').href:request.url;}
  async put(request,response){if(this.failPut)throw new Error('quota');const key=this.key(request);this.rows.delete(key);this.rows.set(key,response);}
  async match(request){return this.rows.get(this.key(request))||null;}
  async keys(){return [...this.rows.keys()].map(url=>new Request(url));}
  async delete(request){return this.rows.delete(this.key(request));}
}
const cacheRows=new Map();
const caches={
  async open(name){if(!cacheRows.has(name))cacheRows.set(name,new MemoryCache());return cacheRows.get(name);},
  async keys(){return [...cacheRows.keys()];},
  async delete(name){return cacheRows.delete(name);}
};
const listeners={};
const swContext=vm.createContext({
  URL,Request,Response,Headers,caches,console,indexedDB:undefined,
  self:{location:{origin:'https://game.test'},clients:{claim:async()=>{}},skipWaiting:async()=>{},
    addEventListener(type,fn){listeners[type]=fn;}}
});
vm.runInContext(swSource,swContext,{filename:'sw.js'});

assert.equal(vm.runInContext("mfSwBypass(new URL('https://game.test/src/main.js'),new Request('https://game.test/src/main.js'))",swContext),false);
assert.equal(vm.runInContext("mfSwBypass(new URL('https://game.test/patch.bin'),new Request('https://game.test/patch.bin',{cache:'no-store'}))",swContext),true);
assert.equal(vm.runInContext("mfSwContentBytes(new Response('unknown'))",swContext),4*1024*1024,'missing Content-Length must receive the conservative unknown-size charge');
assert.equal(vm.runInContext("mfSwContentBytes(new Response('invalid',{headers:{'content-length':'bogus'}}))",swContext),4*1024*1024,'invalid Content-Length must receive the conservative unknown-size charge');

const contentName=vm.runInContext('MF_SW_CONTENT_CACHE',swContext);
const shellName=vm.runInContext('MF_SW_CACHE',swContext);
const contentCache=await caches.open(contentName);
await contentCache.put('https://game.test/assets/pre-policy-a.png',new Response('a'));
await contentCache.put('https://game.test/assets/pre-policy-b.png',new Response('b',{headers:{'x-massfront-cache-bytes':'invalid'}}));
const coldState=await vm.runInContext('caches.open(MF_SW_CONTENT_CACHE).then(cache=>mfSwContentState(cache))',swContext);
assert.equal(coldState.bytes,8*1024*1024,'cold-worker scan must conservatively charge missing and invalid policy headers');

for(let i=0;i<245;i++){
  swContext.__request=new Request(`https://game.test/assets/texture-${i}.png`);
  swContext.__response=new Response(new Uint8Array([i&255]),{headers:{'content-length':'1'}});
  await vm.runInContext('mfSwStore(__request,__response)',swContext);
}
assert.equal(contentCache.rows.size,240,'content cache must prune to its entry budget');
assert.equal(contentCache.rows.has('https://game.test/assets/texture-0.png'),false,'oldest content should be pruned first');
assert.equal(contentCache.rows.has('https://game.test/assets/texture-244.png'),true,'new content should remain available offline');
swContext.__oldRequest=new Request('https://game.test/assets/texture-0.png');
swContext.__newRequest=new Request('https://game.test/assets/texture-244.png');
assert.equal(await vm.runInContext('mfSwFallback(__oldRequest,false)',swContext),null,'evicted content must not masquerade as an offline hit');
assert.ok(await vm.runInContext('mfSwFallback(__newRequest,false)',swContext),'retained content must remain available offline');

swContext.__request=new Request('https://game.test/assets/oversize.glb');
swContext.__response=new Response(new Uint8Array([1]),{headers:{'content-length':String(49*1024*1024)}});
await vm.runInContext('mfSwStore(__request,__response)',swContext);
assert.equal(contentCache.rows.has(swContext.__request.url),false,'one oversized object must not defeat the total cache budget');

swContext.__request=new Request('https://game.test/src/runtime.js');
swContext.__response=new Response('runtime');
await vm.runInContext('mfSwStore(__request,__response)',swContext);
assert.equal(cacheRows.get(shellName).rows.has(swContext.__request.url),true,'runtime source must remain in the offline shell cache');
await cacheRows.get(shellName).put('./index.html',new Response('offline shell'));
swContext.__navigation=new Request('https://game.test/commander/deep-link');
const offlineNavigation=await vm.runInContext('mfSwFallback(__navigation,true)',swContext);
assert.equal(await offlineNavigation.text(),'offline shell','offline navigation must retain the app-shell fallback');
await cacheRows.get(shellName).put('https://game.test/assets/legacy.png',new Response('legacy',{headers:{'content-length':'6'}}));
await vm.runInContext('mfSwMigrateLegacyContent()',swContext);
assert.equal(cacheRows.get(shellName).rows.has('https://game.test/assets/legacy.png'),false,'legacy media must leave the unbounded shell cache');
assert.equal(contentCache.rows.has('https://game.test/assets/legacy.png'),true,'legacy media within policy must migrate to bounded content storage');
assert.equal(contentCache.rows.size,240,'legacy migration must honor the same hard entry budget');

swContext.__request=new Request('https://game.test/assets/quota.png');
swContext.__response=new Response('offline old',{headers:{'content-length':'11'}});
await vm.runInContext('mfSwStore(__request,__response)',swContext);
contentCache.failPut=true;
swContext.__response=new Response('network survives',{headers:{'content-length':'16'}});
const networkResponse=await vm.runInContext('mfSwStore(__request,__response)',swContext);
assert.equal(await networkResponse.text(),'network survives','cache quota failure must not discard a successful network response');
assert.equal(await (await contentCache.match(swContext.__request)).clone().text(),'offline old','failed replacement must preserve the last offline-good cached body');
contentCache.failPut=false;
assert.match(swSource,/MF_SW_CONTENT_STATE/,'content accounting should initialize once per worker, not rescan after every response');
assert.match(swSource,/MF_SW_CONTENT_QUEUE/,'concurrent cache writes must serialize their accounting');

const readStart=updaterSource.indexOf('async function updReadResponseBytes(');
const readEnd=updaterSource.indexOf('\nfunction updTransportFailure(',readStart);
assert.ok(readStart>=0&&readEnd>readStart,'updater response reader must exist');
const readSource=updaterSource.slice(readStart,readEnd);
assert.match(readSource,/new Uint8Array\(limit\)/,'stream reader must write into one bounded destination');
assert.doesNotMatch(readSource,/const parts\s*=\s*\[\]/,'stream reader must not retain every network chunk');
const readContext=vm.createContext({Uint8Array,Error,fmtBytes:n=>String(n),updAssertDownload:()=>{}});
vm.runInContext(readSource,readContext);
readContext.__response=new Response(new Uint8Array([1,2,3,4]));
readContext.__seen=0;
const bytes=await vm.runInContext("updReadResponseBytes(__response,4,'runtime',0,null,n=>__seen+=n)",readContext);
assert.deepEqual([...bytes],[1,2,3,4]);
assert.equal(readContext.__seen,4);

const artifactStart=updaterSource.indexOf('async function updDownloadArtifact(');
const artifactEnd=updaterSource.indexOf('\nconst UPD=',artifactStart);
const artifactSource=updaterSource.slice(artifactStart,artifactEnd);
assert.match(artifactSource,/fetched\.bytes\.subarray\(/,'whole-response range checks must avoid file-sized slice copies');
assert.doesNotMatch(artifactSource,/parts\s*=\s*new Array/,'artifact assembly must not retain a second file-sized parts array');
assert.match(artifactSource,/updVerifyHash\(all,file\.sha256/,'assembled artifacts must retain whole-file verification');
assert.match(artifactSource,/updVerifyHash\(part,c\.sha256/,'range-ignored artifacts must retain per-range verification');

assert.match(packSource,/packRequestPersistence\(await packStoragePreflight/,'pack install should request durable storage after quota preflight');
assert.match(packSource,/catch\(e\)\{\}\s*\n\s*return \{\.\.\.preflight,persisted\}/,'persistence denial must remain advisory');
assert.match(packSource,/new PackSha256State\(\)/,'asset pack verification must remain incremental');

console.log('mobile storage resilience contract: PASS');
