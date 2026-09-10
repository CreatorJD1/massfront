import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import vm from 'node:vm';
import {buildAudioPack,buildAudioPackFileEntry} from './build-audio-pack.mjs';

const sha256=data=>createHash('sha256').update(data).digest('hex');
const MiB=1024*1024;

/* Metadata-only: this proves the client can validate and plan a pack larger
   than the current Galactic payload without allocating or pretending to
   transfer 768 MiB in a Node contract test. */
function logicalLargeFile(name,size,tag){
  const chunkSize=2*MiB,chunks=[];
  for(let offset=0,index=0;offset<size;offset+=chunkSize,index++){
    const bytes=Math.min(chunkSize,size-offset);
    chunks.push({offset,size:bytes,sha256:((index+tag)%16).toString(16).repeat(64)});
  }
  return {name,size,sha256:(tag%16).toString(16).repeat(64),chunks};
}
const logicalLargeFiles=[
  logicalLargeFile('world/cityforms.bin',256*MiB,10),
  logicalLargeFile('world/transit.bin',256*MiB,11),
  logicalLargeFile('world/superstructures.bin',256*MiB,12)
];
const logicalExplorationBytes=147627666;
const logicalExplorationFile=logicalLargeFile('runtime/galactic-exploration.bin',logicalExplorationBytes,13);

function fakeIndexedDb(){
  const databases=new Map();
  const ensure=(name,version=0)=>{
    if(!databases.has(name)) databases.set(name,{version,stores:new Map()});
    return databases.get(name);
  };
  const api={
    open(name,version){
      const request={result:null,error:null};
      queueMicrotask(()=>{
        try{
          const state=ensure(name);
          const upgrading=version>state.version;
          const db={
            objectStoreNames:{contains:key=>state.stores.has(key)},
            createObjectStore(key){if(!state.stores.has(key)) state.stores.set(key,new Map());},
            close(){},
            onversionchange:null,
            transaction(storeName,mode){
              if(!state.stores.has(storeName)) throw new Error('missing store '+storeName);
              const store=state.stores.get(storeName);
              const tx={error:null,oncomplete:null,onerror:null,objectStore(){
                const read=(run,write=false)=>{
                  const q={result:undefined,error:null,onsuccess:null,onerror:null};
                  queueMicrotask(()=>{
                    try{q.result=run();if(q.onsuccess)q.onsuccess();if(write)queueMicrotask(()=>tx.oncomplete&&tx.oncomplete());}
                    catch(e){q.error=e;tx.error=e;if(q.onerror)q.onerror();if(tx.onerror)tx.onerror();}
                  });
                  return q;
                };
                return {
                  get:key=>read(()=>store.get(key)),
                  getAllKeys:()=>read(()=>[...store.keys()]),
                  put:(value,key)=>read(()=>{
                    if(name==='massfront-packs'&&storeName==='meta'&&key==='index:active') api.activePointerWrites++;
                    return store.set(key,value);
                  },true),
                  delete:key=>read(()=>store.delete(key),true)
                };
              }};
              return tx;
            }
          };
          request.result=db;
          if(upgrading){state.version=version;if(request.onupgradeneeded)request.onupgradeneeded();}
          if(request.onsuccess)request.onsuccess();
        }catch(e){request.error=e;if(request.onerror)request.onerror();}
      });
      return request;
    },
    store(dbName,storeName){return ensure(dbName).stores.get(storeName);},
    activePointerWrites:0
  };
  return api;
}

const content={
  'galactic-command/runtime/core.bin':Buffer.from('ABCDEFGHIJKL'),
  'galactic-command/runtime/ui.bin':Buffer.from('0123456789'),
  'range-ignore/large.glb':Buffer.from('range ignored but verified'),
  'low-space/too-large.bin':Buffer.from('storage preflight'),
  'shared-core/base.bin':Buffer.from('shared dependency'),
  'dependent-a/a.bin':Buffer.from('dependent a'),
  'dependent-b/b.bin':Buffer.from('dependent b'),
  'resume-corrupt/retry.bin':Buffer.from('persisted partial retry'),
  'legacy-hashed/retry.bin':Buffer.from('legacy retry data'),
  'galactic-exploration/section.bin':Buffer.from('sectioned galactic content'),
  'batch-shared/base.bin':Buffer.from('shared batch dependency'),
  'batch-a/a.bin':Buffer.from('batch expansion alpha'),
  'batch-b/b.bin':Buffer.from('batch expansion bravo'),
  'manual-only/manual.bin':Buffer.from('manual pack must stay idle'),
  'startup-a/a.bin':Buffer.from('startup expansion alpha'),
  'startup-b/b.bin':Buffer.from('startup expansion bravo'),
  'legacy/tone.ogg':Buffer.from('old')
};
const entry=(name,data,chunk=4)=>buildAudioPackFileEntry(name,data,chunk);
const manifest={version:2,packs:{
  'galactic-command':{
    format:2,label:'Galactic command runtime',chunkSize:4,
    bytes:content['galactic-command/runtime/core.bin'].length+content['galactic-command/runtime/ui.bin'].length,
    files:[
      entry('runtime/core.bin',content['galactic-command/runtime/core.bin']),
      entry('runtime/ui.bin',content['galactic-command/runtime/ui.bin'])
    ]
  },
  'range-ignore':{
    format:2,label:'No Range CDN',chunkSize:4,bytes:content['range-ignore/large.glb'].length,
    files:[entry('large.glb',content['range-ignore/large.glb'])]
  },
  'low-space':{
    format:2,label:'Storage check',chunkSize:4,bytes:content['low-space/too-large.bin'].length,
    files:[entry('too-large.bin',content['low-space/too-large.bin'])]
  },
  'shared-core':{
    format:2,label:'Shared foundation',chunkSize:4,bytes:content['shared-core/base.bin'].length,
    files:[entry('base.bin',content['shared-core/base.bin'])]
  },
  'dependent-a':{
    format:2,label:'Dependent A',chunkSize:4,dependencies:['shared-core'],bytes:content['dependent-a/a.bin'].length,
    files:[entry('a.bin',content['dependent-a/a.bin'])]
  },
  'dependent-b':{
    format:2,label:'Dependent B',chunkSize:4,dependencies:['shared-core'],bytes:content['dependent-b/b.bin'].length,
    files:[entry('b.bin',content['dependent-b/b.bin'])]
  },
  'large-metadata':{
    format:2,label:'Metadata-only 768 MiB plan',chunkSize:2*MiB,bytes:768*MiB,
    files:logicalLargeFiles
  },
  'large-metadata-2':{
    format:2,delivery:'manual',label:'Metadata-only 768 MiB plan B',chunkSize:2*MiB,bytes:768*MiB,
    files:logicalLargeFiles
  },
  'large-metadata-3':{
    format:2,delivery:'manual',label:'Metadata-only 768 MiB plan C',chunkSize:2*MiB,bytes:768*MiB,
    files:logicalLargeFiles
  },
  'galactic-exploration-policy':{
    format:2,delivery:'manual',label:'Metadata-only current Galactic payload',chunkSize:2*MiB,
    bytes:logicalExplorationBytes,files:[logicalExplorationFile]
  },
  'batch-shared':{
    format:2,delivery:'base',label:'Shared batch foundation',chunkSize:4,
    bytes:content['batch-shared/base.bin'].length,
    files:[entry('base.bin',content['batch-shared/base.bin'])]
  },
  'batch-a':{
    format:2,delivery:'manual',label:'Batch expansion A',chunkSize:4,dependencies:['batch-shared'],
    bytes:content['batch-a/a.bin'].length,files:[entry('a.bin',content['batch-a/a.bin'])]
  },
  'batch-b':{
    format:2,delivery:'manual',label:'Batch expansion B',chunkSize:4,dependencies:['batch-shared'],
    bytes:content['batch-b/b.bin'].length,files:[entry('b.bin',content['batch-b/b.bin'])]
  },
  'manual-only':{
    format:2,delivery:'manual',label:'Manual-only expansion',chunkSize:4,
    bytes:content['manual-only/manual.bin'].length,
    files:[entry('manual.bin',content['manual-only/manual.bin'])]
  },
  'startup-a':{
    format:2,delivery:'startup',label:'Startup expansion A',chunkSize:4,
    bytes:content['startup-a/a.bin'].length,files:[entry('a.bin',content['startup-a/a.bin'])]
  },
  'startup-b':{
    format:2,delivery:'startup',label:'Startup expansion B',chunkSize:4,
    bytes:content['startup-b/b.bin'].length,files:[entry('b.bin',content['startup-b/b.bin'])]
  },
  'resume-corrupt':{
    format:1,label:'Persisted partial integrity',chunkSize:4,
    bytes:content['resume-corrupt/retry.bin'].length,
    files:[{name:'retry.bin',size:content['resume-corrupt/retry.bin'].length,
      sha256:sha256(content['resume-corrupt/retry.bin'])}]
  },
  'legacy-hashed':{
    format:1,label:'Hashed v1',chunkSize:4,bytes:content['legacy-hashed/retry.bin'].length,
    files:[{name:'retry.bin',size:content['legacy-hashed/retry.bin'].length,
      sha256:sha256(content['legacy-hashed/retry.bin'])}]
  },
  legacy:{format:1,label:'Legacy audio',bytes:3,files:[{name:'tone.ogg',size:3}]}
}};
let activeManifest=manifest;

const idb=fakeIndexedDb();
let quota=1024*1024*1024,usage=0,active=0,maxActive=0,failSecondChunk=true,failReplacementChunk=false;
let failResumeCorrupt=true,failBatchSecond=true,persistenceGranted=false,persistRequests=0;
let networkAllowed=true,corruptLegacy=true;
const connectionState={saveData:false,metered:false,cost:'',effectiveType:'4g',downlink:10,
  addEventListener(){}};
const requests=[];
async function fetchMock(url,options={}){
  active++;maxActive=Math.max(maxActive,active);
  await new Promise(resolve=>setImmediate(resolve));
  try{
    if(String(url).includes('/packs.json'))
      return new Response(JSON.stringify(activeManifest),{status:200,headers:{'content-type':'application/json'}});
    if(String(url).includes('exploration-pack-remote.json')) return new Response(JSON.stringify({
      base:'https://packs.test/exploration-pack/',manifest:'https://packs.test/exploration-pack/manifest.json'
    }),{status:200,headers:{'content-type':'application/json'}});
    if(String(url).includes('/exploration-pack/manifest.json')){
      const data=content['galactic-exploration/section.bin'];
      return new Response(JSON.stringify({kind:'ExplorationContentManifestV1',totalBytes:data.length,files:[{
        path:'section.bin',bytes:data.length,hash:'sha256-'+sha256(data),kind:'asset'
      }]}),{status:200,headers:{'content-type':'application/json'}});
    }
    const pathname=new URL(url).pathname;
    const exploration=pathname.split('/exploration-pack/')[1];
    const path=pathname.split('/pack/')[1];
    if(exploration){
      const data=content['galactic-exploration/'+decodeURIComponent(exploration)];
      if(!data) return new Response('',{status:404});
      const range=options.headers&&options.headers.Range;
      requests.push({key:'galactic-exploration/'+decodeURIComponent(exploration),range});
      const match=/^bytes=(\d+)-(\d+)$/.exec(String(range||''));
      if(!match) return new Response('',{status:400});
      const start=Number(match[1]),end=Number(match[2]),body=data.subarray(start,end+1);
      return new Response(body,{status:206,headers:{'content-range':`bytes ${start}-${end}/${data.length}`}});
    }
    if(!path) return new Response('',{status:404});
    const parts=path.split('/').map(decodeURIComponent),pack=parts.shift(),name=parts.join('/');
    const key=pack+'/'+name;
    let data=content[key];
    if(!data) return new Response('',{status:404});
    const range=options.headers&&options.headers.Range;
    requests.push({key,range});
    if(pack==='range-ignore'){
      const response=new Response(data,{status:200,headers:{'content-length':String(data.length)}});
      response.blob=async()=>{throw new Error('ignored-Range path must stream, not buffer the whole response');};
      return response;
    }
    if(pack==='legacy-hashed'&&corruptLegacy){data=Buffer.from(data);data[0]^=255;}
    const match=/^bytes=(\d+)-(\d+)$/.exec(String(range||''));
    if(!match) return new Response('',{status:400});
    const start=Number(match[1]),end=Number(match[2]);
    if(pack==='galactic-command'&&name==='runtime/core.bin'&&start===4&&failSecondChunk){
      failSecondChunk=false;
      throw new Error('simulated process/network interruption');
    }
    if(pack==='galactic-command'&&name==='runtime/core.bin'&&start===4&&failReplacementChunk)
      throw new Error('simulated replacement interruption');
    if(pack==='resume-corrupt'&&start===4&&failResumeCorrupt){
      failResumeCorrupt=false;
      throw new Error('simulated persisted-partial interruption');
    }
    if(pack==='batch-b'&&start===4&&failBatchSecond){
      failBatchSecond=false;
      throw new Error('simulated aggregate-batch interruption');
    }
    const body=data.subarray(start,end+1);
    return new Response(body,{status:206,headers:{
      'content-range':`bytes ${start}-${end}/${data.length}`,
      'content-length':String(body.length)
    }});
  }finally{active--;}
}

const source=await readFile(new URL('../src/assetpack.js',import.meta.url),'utf8');
const heldWriterLocks=new Set();
const testWriterLocks={async request(name,options,callback){
  if(heldWriterLocks.has(name))return callback(null);
  heldWriterLocks.add(name);
  try{return await callback({name});}finally{heldWriterLocks.delete(name);}
}};
function loadPackRuntime(){
  const sandbox={
    Blob,Response,Headers,Uint8Array,Uint32Array,Map,Set,Date,Math,Object,Array,String,Number,RegExp,Error,TypeError,
    Promise,console,crypto:webcrypto,indexedDB:idb,fetch:fetchMock,
    navigator:{connection:connectionState,locks:testWriterLocks,storage:{
      estimate:async()=>({quota,usage}),
      persisted:async()=>persistenceGranted,
      persist:async()=>{persistRequests++;persistenceGranted=true;return true;}
    }},
    localStorage:{getItem:()=>null,setItem:()=>{}},
    document:{getElementById:()=>null,createElement:()=>({})},
    URL:{createObjectURL:()=>`blob:test-${Math.random()}`,revokeObjectURL:()=>{}},
    setTimeout,clearTimeout,
    UPDATE_URL:'https://packs.test/update.json',
    netAllowed:()=>networkAllowed
  };
  sandbox.window=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source,sandbox,{filename:'src/assetpack.js'});
  return sandbox;
}
let sandbox=loadPackRuntime();
let packs=sandbox.MASSFRONT_ASSET_PACKS;
assert.ok(packs,'public optional-pack API was not installed');
assert.equal(typeof packs.installMany,'function','public API must expose aggregate installation');
assert.equal(typeof packs.startup,'function','public API must expose data-driven startup installation');
assert.equal(typeof packs.snapshot,'function','public API must expose aggregate transfer state');

const built=buildAudioPackFileEntry('five.bin',Buffer.from('12345'),2);
assert.equal(built.chunks.length,3);
assert.deepEqual(built.chunks.map(c=>c.size),[2,2,1]);
assert.equal(built.sha256,sha256(Buffer.from('12345')));

await packs.loadIndex();
quota=2*1024*MiB;
const logicalLargeStatus=await packs.status('large-metadata');
assert.equal(logicalLargeStatus.remainingBytes,768*MiB);
assert.deepEqual([...logicalLargeStatus.missingFiles],logicalLargeFiles.map(file=>file.name));
const logicalLargePreflight=await packs.preflight('large-metadata');
assert.equal(logicalLargePreflight.ok,true);
assert.ok(logicalLargePreflight.required>768*MiB,
  'preflight must include assembly headroom beyond remaining logical bytes');
const fileRequestsBeforeMultiGb=requests.length;
const multiGb=await packs.installMany(['large-metadata','large-metadata-2','large-metadata-3']);
assert.equal(multiGb.ok,false);
assert.equal(multiGb.reason,'storage','a 2.25 GiB batch must fail at aggregate storage preflight on a 2 GiB quota');
assert.equal(packs.snapshot().total,3*768*MiB,'aggregate accounting must remain exact above the signed 32-bit range');
assert.equal(requests.length,fileRequestsBeforeMultiGb,'multi-GB storage refusal must happen before any payload request');

/* One operation owns a future expansion batch. Shared dependencies appear once,
   byte progress never resets between packs, and no new pack becomes active when
   a later target fails. Verified finals/chunks remain staged for the retry. */
const listed=await packs.list();
assert.equal(listed.find(pack=>pack.id==='batch-shared').delivery,'base');
assert.equal(listed.find(pack=>pack.id==='batch-a').delivery,'manual');
assert.equal(listed.find(pack=>pack.id==='startup-a').delivery,'startup');
const batchProgress=[];
const activeWritesBeforeBatch=idb.activePointerWrites;
const interruptedBatchPromise=packs.installMany(['batch-a','batch-b'],{
  onProgress:(got,total,detail)=>batchProgress.push({got,total,detail})
});
const liveBatch=packs.snapshot();
assert.equal(liveBatch.busy,true,'installMany must acquire one busy latch before its first await');
assert.equal(liveBatch.state,'downloading');
const concurrentInstall=await packs.install('manual-only');
assert.equal(concurrentInstall.ok,false);
assert.equal(concurrentInstall.reason,'busy','a second install must not interleave with an aggregate batch');
const interruptedBatch=await interruptedBatchPromise;
assert.equal(interruptedBatch.ok,false,'an interrupted target must fail the whole activation batch');
assert.equal(idb.activePointerWrites,activeWritesBeforeBatch,
  'a failed batch must not move the active manifest pointer');
assert.equal((await packs.status('batch-a')).installed,false,
  'an earlier verified target must remain staged until the whole batch verifies');
const sharedBatchChunkRequests=manifest.packs['batch-shared'].files[0].chunks.length;
assert.equal(requests.filter(r=>r.key==='batch-shared/base.bin').length,sharedBatchChunkRequests,
  'a shared dependency must be fetched once for two targets (one request per manifest chunk)');
assert.ok(batchProgress.length>0);
assert.ok(batchProgress.every((row,index,all)=>Number.isFinite(row.got)&&row.got>=0&&row.got<=row.total
  &&row.total===all[0].total&&(!index||row.got>=all[index-1].got)&&row.detail&&typeof row.detail==='object'),
  'aggregate progress must be monotonic, bounded, and keep one total across pack boundaries');

const resumedBatchProgress=[];
const resumedBatch=await packs.installMany(['batch-a','batch-b'],{
  onProgress:(got,total,detail)=>resumedBatchProgress.push({got,total,detail})
});
assert.equal(resumedBatch.ok,true);
assert.deepEqual([...resumedBatch.packs],['batch-shared','batch-a','batch-b'],
  'aggregate install order must contain one de-duplicated dependency before both targets');
assert.equal(requests.filter(r=>r.key==='batch-shared/base.bin').length,sharedBatchChunkRequests,
  'retry must reuse the verified dependency instead of downloading it again');
assert.equal(idb.activePointerWrites,activeWritesBeforeBatch+1,
  'all verified targets and dependencies must promote through one active-pointer write');
assert.ok(resumedBatchProgress.length>0);
assert.ok(resumedBatchProgress.every((row,index,all)=>row.total===all[0].total
  &&row.got<=row.total&&(!index||row.got>=all[index-1].got)));
assert.equal(resumedBatchProgress.at(-1).got,resumedBatchProgress.at(-1).total,
  'successful aggregate progress must finish exactly at its advertised total');
const readyBatch=packs.snapshot();
assert.equal(readyBatch.busy,false);
assert.equal(readyBatch.state,'ready');

/* Startup selection is manifest data, not another hard-coded pack list. Base
   dependencies are pulled only through their selected consumers, while manual
   packs remain untouched. */
for(const policy of [
  {patch:{saveData:true},reason:'save-data'},
  {patch:{metered:true},reason:'metered-network'},
  {patch:{effectiveType:'3g',downlink:1.2},reason:'slow-network'}
]){
  Object.assign(connectionState,{saveData:false,metered:false,cost:'',effectiveType:'4g',downlink:10},policy.patch);
  const before=requests.length,blocked=await packs.install('galactic-exploration-policy',{automatic:true});
  assert.equal(blocked.ok,false);
  assert.equal(blocked.reason,policy.reason);
  assert.equal(requests.length,before,'automatic policy refusal must precede payload transfer');
  assert.equal(packs.snapshot().state,'waiting');
  assert.match(packs.snapshot().error,/use Install or Retry to download now/);
}
connectionState.saveData=true;
const startupPayloadRequests=()=>requests.filter(row=>row.key==='startup-a/a.bin'||row.key==='startup-b/b.bin').length;
const startupRequestsBefore=startupPayloadRequests(),blockedStartup=await packs.startup();
assert.equal(blockedStartup.reason,'save-data');
assert.equal(startupPayloadRequests(),startupRequestsBefore,'data-driven startup must use the same automatic policy');
Object.assign(connectionState,{saveData:false,metered:false,cost:'',effectiveType:'3g',downlink:1.2});
const explicitOnSlow=await packs.install('startup-a');
assert.equal(explicitOnSlow.ok,true,'an explicit install must override the automatic slow-network pause');
assert.equal((await packs.remove('startup-a')).ok,true);
Object.assign(connectionState,{saveData:false,metered:false,cost:'',effectiveType:'4g',downlink:10});
const manualRequestsBefore=requests.filter(r=>r.key==='manual-only/manual.bin').length;
const activeWritesBeforeStartup=idb.activePointerWrites;
const startupProgress=[];
const startupResult=await packs.startup({
  onProgress:(got,total,detail)=>startupProgress.push({got,total,detail})
});
assert.equal(startupResult.ok,true);
assert.equal((await packs.status('startup-a')).installed,true);
assert.equal((await packs.status('startup-b')).installed,true);
assert.equal((await packs.status('manual-only')).installed,false,
  'startup must select delivery=startup and leave delivery=manual idle');
assert.equal(requests.filter(r=>r.key==='manual-only/manual.bin').length,manualRequestsBefore);
assert.equal(idb.activePointerWrites,activeWritesBeforeStartup+1,
  'startup packs must use the same one-write aggregate activation path');
assert.ok(startupProgress.length>0);
assert.equal(startupProgress.at(-1).got,startupProgress.at(-1).total);

quota=1024*MiB;
const first=await packs.install('galactic-command');
assert.equal(first.ok,false,'interrupted install must not become active');
assert.equal(first.reason,'download');
assert.equal(requests.filter(r=>r.key==='galactic-command/runtime/core.bin'&&r.range==='bytes=0-3').length,1);
assert.equal(persistRequests,1,'first player-initiated pack install should request durable storage once');

/* Simulate a killed/reopened app. Only IndexedDB and the remote offer survive;
   no in-memory PACK state or chunk map is shared with the new runtime. */
networkAllowed=false;
sandbox=loadPackRuntime();
packs=sandbox.MASSFRONT_ASSET_PACKS;
assert.ok(await packs.loadIndex(),'reopened runtime must restore the offered manifest from IndexedDB');
networkAllowed=true;
const resumed=await packs.install('galactic-command');
assert.equal(resumed.ok,true);
assert.equal(resumed.storage.persisted,true);
assert.equal(requests.filter(r=>r.key==='galactic-command/runtime/core.bin'&&r.range==='bytes=0-3').length,1,
  'verified first chunk must resume after a full runtime reload without another request');
assert.equal((await packs.status('galactic-command')).installed,true);
assert.equal(maxActive,1,'aggregate packs must fetch only one bounded file/chunk at a time');

/* Discovering v2 must not revoke or overwrite the verified v1 mount. Use the
   same path and byte length so this catches the old name+size key collision,
   then interrupt v2 after its first staged chunk. */
const finalKey=(pack,file)=>pack+'/'+file.name+':'+file.size+(file.sha256?':sha256:'+file.sha256:'');
const v1Core=activeManifest.packs['galactic-command'].files[0];
const v1CoreKey=finalKey('galactic-command',v1Core);
const v1Url=await packs.url('galactic-command','runtime/core.bin');
const v2Data=Buffer.from('mnopqrstuvwx');
assert.equal(v2Data.length,content['galactic-command/runtime/core.bin'].length);
const v2Core=entry('runtime/core.bin',v2Data);
activeManifest={...activeManifest,packs:{...activeManifest.packs,'galactic-command':{
  ...activeManifest.packs['galactic-command'],
  files:[v2Core,activeManifest.packs['galactic-command'].files[1]]
}}};
content['galactic-command/runtime/core.bin']=v2Data;
await packs.loadIndex();
const offeredV2=await packs.status('galactic-command');
assert.equal(offeredV2.installed,true,'verified v1 must remain active while v2 is only offered');
assert.equal(offeredV2.updateAvailable,true);
assert.equal(await packs.url('galactic-command','runtime/core.bin'),v1Url,
  'refreshing the offer must keep the v1 object URL mounted');
failReplacementChunk=true;
const failedV2=await packs.install('galactic-command');
assert.equal(failedV2.ok,false);
assert.equal((await packs.status('galactic-command')).installed,true,
  'interrupted v2 must leave v1 installed');
assert.equal(await packs.url('galactic-command','runtime/core.bin'),v1Url,
  'interrupted v2 must not revoke v1');
const fileStore=idb.store('massfront-packs','files');
const metaStore=idb.store('massfront-packs','meta');
const chunkStore=idb.store('massfront-packs','chunks');
const v2CoreKey=finalKey('galactic-command',v2Core);
assert.ok(fileStore.has(v1CoreKey),'v1 final Blob must survive failed replacement');
assert.equal(fileStore.has(v2CoreKey),false,'failed v2 must not become a final Blob');
chunkStore.set('galactic-command/runtime/core.bin:'+v1Core.size+':'+v1Core.sha256+':chunk:stale',new Blob(['stale']));
failReplacementChunk=false;
const promotedV2=await packs.install('galactic-command');
assert.equal(promotedV2.ok,true);
const activeV2=await packs.status('galactic-command');
assert.equal(activeV2.installed,true);
assert.equal(activeV2.updateAvailable,false);
assert.ok(fileStore.has(v2CoreKey),'verified v2 final Blob must be active');
assert.equal(Buffer.from(await fileStore.get(v2CoreKey).arrayBuffer()).toString(),v2Data.toString(),
  'the promoted content-addressed final must contain v2 bytes');
assert.equal(fileStore.has(v1CoreKey),false,'v1 final Blob must be collected only after v2 promotion');
assert.equal(metaStore.has('file:'+v1CoreKey),false,'v1 verification metadata must be collected after promotion');
assert.equal([...chunkStore.keys()].filter(k=>String(k).startsWith('galactic-command/')).length,0,
  'promotion must collect interrupted and stale chunk identities');
assert.notEqual(await packs.url('galactic-command','runtime/core.bin'),v1Url,
  'the object URL may switch only after activation commits');

/* Format-1 manifests do not carry per-chunk authorities. The client records
   the fetched chunk digest locally; after a restart, a same-size damaged Blob
   must be rejected and only that chunk fetched again. */
const partialCorrupt=await packs.install('resume-corrupt');
assert.equal(partialCorrupt.ok,false);
const resumeEntry=activeManifest.packs['resume-corrupt'].files[0];
const resumePrefix='resume-corrupt/retry.bin:'+resumeEntry.size+':'+resumeEntry.sha256+':chunk:';
const resumeChunk0=chunkStore.get(resumePrefix+'0');
assert.ok(resumeChunk0&&resumeChunk0.sha256);
chunkStore.set(resumePrefix+'0',{...resumeChunk0,blob:new Blob([Buffer.alloc(4,255)])});
const corruptChunk0Requests=requests.filter(r=>r.key==='resume-corrupt/retry.bin'&&r.range==='bytes=0-3').length;
networkAllowed=false;
sandbox=loadPackRuntime();packs=sandbox.MASSFRONT_ASSET_PACKS;
assert.ok(await packs.loadIndex());networkAllowed=true;
assert.equal((await packs.install('resume-corrupt')).ok,true);
assert.equal(requests.filter(r=>r.key==='resume-corrupt/retry.bin'&&r.range==='bytes=0-3').length,corruptChunk0Requests+1,
  'damaged persisted synthetic chunk must be refetched after runtime reload');

const beforeIgnore=requests.length;
const ignored=await packs.install('range-ignore');
assert.equal(ignored.ok,true,'HTTP 200 full-file fallback should be accepted after full verification');
assert.equal(requests.length-beforeIgnore,1,'ignored Range must not download the full file once per chunk');

/* A stale metadata record must not make Repair trust a damaged final Blob. The
   old Blob remains until the replacement is fully verified, then is swapped. */
const ignoredEntry=activeManifest.packs['range-ignore'].files[0];
const ignoredKey=finalKey('range-ignore',ignoredEntry);
fileStore.set(ignoredKey,new Blob([Buffer.alloc(content['range-ignore/large.glb'].length,7)]));
const beforeRepair=requests.length;
const repaired=await packs.repair('range-ignore');
assert.equal(repaired.ok,true);
assert.equal(requests.length-beforeRepair,1,'repair must re-download a same-size corrupt Blob');

quota=32;usage=16;
const beforeLow=requests.length;
const low=await packs.install('low-space');
assert.equal(low.ok,false);
assert.equal(low.reason,'storage');
assert.equal(requests.length,beforeLow,'storage failure must happen before the first payload request');
quota=1024*1024*1024;usage=0;

const depA=await packs.install('dependent-a');
assert.equal(depA.ok,true);
assert.deepEqual([...depA.packs],['shared-core','dependent-a'],'dependencies must install before their consumer');
const sharedRequestsAfterA=requests.filter(r=>r.key==='shared-core/base.bin').length;
const depB=await packs.install('dependent-b');
assert.equal(depB.ok,true);
assert.equal(requests.filter(r=>r.key==='shared-core/base.bin').length,sharedRequestsAfterA,
  'a verified shared dependency must not be fetched again');
const protectedRemove=await packs.remove('shared-core');
assert.equal(protectedRemove.ok,false);
assert.equal(protectedRemove.reason,'dependency');
assert.deepEqual([...protectedRemove.dependents].sort(),['dependent-a','dependent-b']);
assert.equal((await packs.remove('dependent-a')).ok,true);
const stillProtected=await packs.remove('shared-core');
assert.equal(stillProtected.reason,'dependency');
assert.deepEqual([...stillProtected.dependents],['dependent-b']);
assert.equal((await packs.remove('dependent-b')).ok,true);
assert.equal((await packs.remove('shared-core')).ok,true);

const poisoned=await packs.install('legacy-hashed');
assert.equal(poisoned.ok,false);
assert.equal(poisoned.reason,'file-hash');
assert.equal([...chunkStore.keys()].filter(k=>String(k).startsWith('legacy-hashed/')).length,0,
  'whole-file failure must clear unverified synthetic v1 chunks');
const legacyFirstRange=requests.filter(r=>r.key==='legacy-hashed/retry.bin'&&r.range==='bytes=0-3').length;
corruptLegacy=false;
assert.equal((await packs.install('legacy-hashed')).ok,true);
assert.equal(requests.filter(r=>r.key==='legacy-hashed/retry.bin'&&r.range==='bytes=0-3').length,legacyFirstRange+1,
  'retry must fetch the first synthetic chunk again after poison cleanup');

await packs.status('legacy'); // creates/upgrades the v1-compatible files store
fileStore.set('legacy/tone.ogg:3',new Blob([content['legacy/tone.ogg']]));
assert.equal((await packs.install('legacy')).ok,true,'verified legacy Blob must promote without a network request');
assert.equal((await packs.status('legacy')).installed,true,'legacy size-keyed Blob must remain installed');
assert.match(await packs.url('legacy','tone.ogg'),/^blob:test-/);

connectionState.saveData=true;
const explorationRequestsBefore=requests.filter(row=>row.key==='galactic-exploration/section.bin').length;
const automaticExploration=await sandbox.mfInstallExplorationPack({automatic:true});
assert.equal(automaticExploration.ok,false);
assert.equal(automaticExploration.reason,'save-data');
assert.equal(requests.filter(row=>row.key==='galactic-exploration/section.bin').length,explorationRequestsBefore,
  'automatic Galactic delivery must stop before its first payload range');
const exploration=await sandbox.mfInstallExplorationPack();
assert.equal(exploration.ok,true,'legacy Galactic entry point must route through the generic pack installer');
const cachedExplorationRequests=requests.filter(row=>row.key==='galactic-exploration/section.bin').length;
const cachedAutomaticExploration=await sandbox.mfInstallExplorationPack({automatic:true});
assert.equal(cachedAutomaticExploration.ok,true,'verified Galactic content must still mount under Save-Data');
assert.equal(requests.filter(row=>row.key==='galactic-exploration/section.bin').length,cachedExplorationRequests);
connectionState.saveData=false;
assert.equal((await packs.status('galactic-exploration')).installed,true);
assert.equal(idb.store('massfront-exploration-pack','files').size,0,
  'the retired whole-file exploration store must receive no new writes');
await packs.loadIndex();
assert.ok((await packs.list()).some(pack=>pack.id==='galactic-exploration'),
  'a network index refresh must preserve locally registered special packs');

networkAllowed=false;
vm.runInContext('PACK.idx=null;PACK.rawIndex=null',sandbox);
assert.ok(await packs.loadIndex(),'offline restart must restore the last normalized manifest from IndexedDB');
assert.equal((await packs.status('range-ignore')).installed,true);
assert.match(await packs.url('range-ignore','large.glb'),/^blob:test-/,
  'offline restart must mount verified final Blobs through the cached manifest');
assert.equal((await packs.status('galactic-exploration')).installed,true,
  'sectioned Galactic content must remain mounted from its cached immutable manifest');
networkAllowed=true;

const removed=await packs.remove('legacy');
assert.equal(removed.ok,true);
assert.equal((await packs.status('legacy')).installed,false);

const cycleError=vm.runInContext(`(()=>{try{
  packNormalizeIndex({packs:{a:{files:[],dependencies:['b']},b:{files:[],dependencies:['a']}}});return '';
}catch(e){return e.message;}})()`,sandbox);
assert.equal(cycleError,'dependency-cycle');
const chunkCapError=vm.runInContext(`(()=>{try{
  packNormalizeIndex({packs:{huge:{chunkSize:1,bytes:4097,files:[{name:'huge.bin',size:4097}]}}});return '';
}catch(e){return e.message;}})()`,sandbox);
assert.equal(chunkCapError,'chunks','synthetic legacy chunks must be capped before allocation');
const unsafeStartupError=vm.runInContext(`(()=>{try{
  packNormalizeIndex({packs:{unsafe:{format:1,delivery:'startup',bytes:1,files:[{name:'x.bin',size:1}]}}});return '';
}catch(e){return e.message;}})()`,sandbox);
assert.equal(unsafeStartupError,'startup-format','automatic delivery must require whole-file and per-chunk format-2 hashes');

const scratchRoot=await mkdtemp(join(process.cwd(),'tmp','assetpack-builder-'));
try{
  const musicDir=join(scratchRoot,'releases','audio-pack','pack','music');
  await mkdir(musicDir,{recursive:true});
  await writeFile(join(musicDir,'track.m4a'),Buffer.from('audio'));
  const prior={version:1,packs:{future:{label:'future',bytes:9,files:[]}}};
  const shared={version:1,packs:{voice:{label:'voice',bytes:7,files:[]},sharedFuture:{label:'shared future',bytes:11,files:[]}}};
  await writeFile(join(scratchRoot,'releases','audio-pack','packs.json'),JSON.stringify(prior));
  await mkdir(join(scratchRoot,'assets','packs'),{recursive:true});
  await writeFile(join(scratchRoot,'assets','packs','packs.json'),JSON.stringify(shared));
  await buildAudioPack({root:scratchRoot});
  const rebuilt=JSON.parse(await readFile(join(scratchRoot,'releases','audio-pack','packs.json'),'utf8'));
  assert.deepEqual(rebuilt.packs.voice,shared.packs.voice);
  assert.deepEqual(rebuilt.packs.future,prior.packs.future);
  assert.deepEqual(rebuilt.packs.sharedFuture,shared.packs.sharedFuture);
  assert.equal(rebuilt.packs.music.delivery,'base','rebuilt current soundtrack metadata must remain base-delivery');

  const emptyRoot=join(scratchRoot,'empty');
  await mkdir(join(emptyRoot,'releases','audio-pack','pack','music'),{recursive:true});
  await assert.rejects(buildAudioPack({root:emptyRoot}),/Refusing to replace.*empty manifest/);
}finally{await rm(scratchRoot,{recursive:true,force:true});}

console.log(JSON.stringify({
  ok:true,resumedRanges:requests.filter(r=>r.key==='galactic-command/runtime/core.bin').map(r=>r.range),
  rangeIgnoredRequests:1,maxConcurrentFetches:maxActive,legacyBlobPreserved:true,
  offlineManifestRestored:true,dependencyRemovalProtected:true,legacyPoisonCleared:true,
  interruptedReplacementKeptActive:true,postPromotionGc:true,
  persistedResumeAfterReload:true,damagedPartialRefetched:true,
  logicalLargeMetadataBytes:768*MiB,logicalLargeMetadataOnly:true,persistenceRequested:persistRequests,
  logicalMultiPackBytes:3*768*MiB,multiGigabytePreflight:true,
  aggregateBatchProgress:true,aggregateBatchAtomicPromotion:true,startupDeliverySelection:true,
  automaticNetworkPolicy:true,explicitNetworkOverride:true,explorationAutomaticPolicy:true,
  cachedMountBypassesNetworkPolicy:true,
  logicalExplorationPolicyBytes:logicalExplorationBytes,
  builderPreservedOtherPacks:true,explorationUsesGenericEngine:true,
  storagePreflight:'blocked-before-fetch',wholeFileSha256:built.sha256
},null,2));
