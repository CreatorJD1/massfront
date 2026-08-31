import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const stagedVersion='1.33.48';
const packagedBase='1.33.47';
const stageRoot=join(root,'releases','staging-v'+stagedVersion);

const [bootSource,mainSource,artifactText]=await Promise.all([
  readFile(join(root,'boot.js'),'utf8'),
  readFile(join(root,'src','main.js'),'utf8'),
  readFile(join(stageRoot,'artifacts.json'),'utf8')
]);
const artifacts=JSON.parse(artifactText);
assert.ok(Array.isArray(artifacts)&&artifacts.length>2,
          'staged v'+stagedVersion+' artifact inventory is empty');

function sha256(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}
function extractFunction(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.notEqual(start,-1,'missing '+name+'() in production source');
  const open=source.indexOf('{',start);
  assert.notEqual(open,-1,'missing body for '+name+'()');
  let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
  for(let i=open;i<source.length;i++){
    const ch=source[i],next=source[i+1];
    if(lineComment){ if(ch==='\n') lineComment=false; continue; }
    if(blockComment){ if(ch==='*'&&next==='/'){ blockComment=false;i++; } continue; }
    if(quote){
      if(escaped){ escaped=false;continue; }
      if(ch==='\\'){ escaped=true;continue; }
      if(ch===quote) quote='';
      continue;
    }
    if(ch==='/'&&next==='/'){ lineComment=true;i++;continue; }
    if(ch==='/'&&next==='*'){ blockComment=true;i++;continue; }
    if(ch==='\''||ch==='"'||ch==='`'){ quote=ch;continue; }
    if(ch==='{') depth++;
    else if(ch==='}'&&--depth===0) return source.slice(start,i+1);
  }
  throw new Error('unterminated body for '+name+'()');
}
function clone(value){
  return value===undefined?undefined:structuredClone(value);
}

/* Check that this test is exercising the exact staged payload which would be
   uploaded, not an order reconstructed from today's source tree. Hashing the
   89 staged files also catches a late edit or interrupted staging run. */
let stagedBytes=0;
const stagedSources=new Map();
for(const artifact of artifacts){
  assert.match(artifact.path,/^[a-z0-9._/-]+$/i,
               'unsafe staged artifact path '+artifact.path);
  const bytes=await readFile(join(stageRoot,...artifact.path.split('/')));
  assert.equal(bytes.byteLength,artifact.size,
               artifact.path+' size differs from artifacts.json');
  assert.equal(sha256(bytes),artifact.sha256,
               artifact.path+' hash differs from artifacts.json');
  const source=bytes.toString('utf8');
  assert.match(source,/;window\.__MF_OTA_RAN=\(window\.__MF_OTA_RAN\|0\)\+1;\s*$/,
               artifact.path+' is missing its terminal completion stamp');
  stagedSources.set(artifact.path,source);
  stagedBytes+=bytes.byteLength;
}

const order=artifacts.map(a=>a.path);
assert.equal(new Set(order).size,order.length,'staged artifact paths are not unique');
assert.equal(order[0],'ota/00-runtime.js','runtime prelude is not the first artifact');
assert.equal(order[1],'ota/01-shell.js','shell is not the second artifact');
assert.ok(order.includes('src/engine/gl.js'),'staged order omits the renderer gate');
assert.ok(order.includes('src/main.js'),'staged order omits src/main.js');

const runtimeSource=stagedSources.get('ota/00-runtime.js');
const expectedMatch=/^window\.__MF_OTA_EXPECT=(\d+);/.exec(runtimeSource);
assert.ok(expectedMatch,'runtime prelude does not publish __MF_OTA_EXPECT');
const expectedArtifacts=Number(expectedMatch[1]);
assert.equal(expectedArtifacts,artifacts.length,
             'runtime expected count differs from staged artifact count');

const stateDeclaration=/\blet\s+bootConfirmed\s*=\s*false\s*,\s*bootIncompleteCount\s*=\s*-1\s*;/.exec(mainSource);
assert.ok(stateDeclaration,'missing confirmBoot state declaration in src/main.js');
const confirmBootSource=extractFunction(mainSource,'confirmBoot');
const stagedMain=stagedSources.get('src/main.js');
assert.ok(stagedMain.includes(stateDeclaration[0]),
          'staged src/main.js lacks the retryable boot state declaration');
assert.equal(extractFunction(stagedMain,'confirmBoot'),confirmBootSource,
             'staged src/main.js does not contain the production confirmBoot fix');

/* The installed base which downloads v1.33.48 is v1.33.47. The checked-in
   immutable boot loader has already been bumped for the new APK, so substitute
   only this release constant in the VM to reproduce the real upgrade edge. */
const revisionPattern=/var PACKAGED_REV='[^']+';/;
assert.equal((bootSource.match(new RegExp(revisionPattern.source,'g'))||[]).length,1,
             'boot.js PACKAGED_REV declaration changed unexpectedly');
const upgradeBootSource=bootSource.replace(
  revisionPattern,"var PACKAGED_REV='"+packagedBase+"';");

function makeDatabase(initial,{failOpenCount=0,holdReadwriteCommits=[],
                              logicalPayloadBytes={},maxPayloadGets={}}={}){
  let records=new Map();
  let openFailures=Math.max(0,failOpenCount|0),active=null,readwriteCount=0;
  const queue=[],held=new Map(),heldWaiters=new Map();
  const holdOrdinals=new Set(holdReadwriteCommits.map(Number));
  const logicalSizes=new Map(Object.entries(logicalPayloadBytes));
  const payloadGets=new Map();
  let logicalBytesRead=0;
  for(const [key,value] of Object.entries(initial||{})) records.set(key,clone(value));

  function notifyHeld(ordinal){
    const waiters=heldWaiters.get(ordinal)||[];
    heldWaiters.delete(ordinal);
    for(const resolveWaiter of waiters) resolveWaiter();
  }
  function startNext(){
    if(active||!queue.length) return;
    active=queue.shift();
    active.start();
  }
  function releaseActive(tx){
    assert.equal(active,tx,'transaction queue released out of order');
    active=null;
    queueMicrotask(startNext);
  }
  const db={
    objectStoreNames:{contains:name=>name==='bundles'},
    createObjectStore(){ return {}; },
    transaction(name,mode='readonly'){
      assert.equal(name,'bundles','boot opened an unexpected IndexedDB store');
      assert.ok(mode==='readonly'||mode==='readwrite','unexpected transaction mode '+mode);
      const writable=mode==='readwrite';
      const ordinal=writable?++readwriteCount:0;
      const operations=[];
      let working=null,index=0,closed=false,aborted=false,commitQueued=false;
      const tx={oncomplete:null,onerror:null,onabort:null,error:null};

      function finishAbort(error){
        if(closed) return;
        closed=true;
        tx.error=error||Object.assign(new Error('transaction aborted'),{name:'AbortError'});
        queueMicrotask(()=>{
          if(tx.onabort) tx.onabort({target:tx});
          releaseActive(tx);
        });
      }
      function finishCommit(){
        if(closed) return;
        closed=true;
        if(writable) records=working;
        queueMicrotask(()=>{
          if(tx.oncomplete) tx.oncomplete({target:tx});
          releaseActive(tx);
        });
      }
      function commit(){
        if(closed||commitQueued) return;
        commitQueued=true;
        queueMicrotask(()=>{
          commitQueued=false;
          if(aborted){ finishAbort(tx.error); return; }
          if(index<operations.length){ pump(); return; }
          if(writable&&holdOrdinals.delete(ordinal)){
            held.set(ordinal,finishCommit);
            notifyHeld(ordinal);
            return;
          }
          finishCommit();
        });
      }
      function fail(error){
        if(closed) return;
        aborted=true;
        tx.error=error instanceof Error?error:new Error(String(error));
        if(tx.onerror) tx.onerror({target:tx});
        finishAbort(tx.error);
      }
      function pump(){
        if(closed) return;
        if(aborted){ finishAbort(tx.error); return; }
        if(index>=operations.length){ commit(); return; }
        const operation=operations[index++];
        queueMicrotask(()=>{
          if(closed) return;
          try{
            if(operation.type==='get'){
              if(logicalSizes.has(operation.key)){
                const count=(payloadGets.get(operation.key)||0)+1;
                payloadGets.set(operation.key,count);
                logicalBytesRead+=Number(logicalSizes.get(operation.key))||0;
                if(Object.prototype.hasOwnProperty.call(maxPayloadGets,operation.key)&&
                   count>Number(maxPayloadGets[operation.key]))
                  throw new Error('payload get budget exceeded for '+operation.key);
              }
              operation.request.result=clone(working.get(operation.key));
            }
            else if(operation.type==='put') working.set(operation.key,clone(operation.value));
            else working.delete(operation.key);
            if(operation.request.onsuccess)
              operation.request.onsuccess({target:operation.request});
          }catch(error){
            operation.request.error=error;
            if(operation.request.onerror) operation.request.onerror({target:operation.request});
            fail(error);
            return;
          }
          pump();
        });
      }
      function request(type,key,value){
        if(closed) throw new Error('request made after transaction completed');
        if(type!=='get') assert.equal(writable,true,type+' outside readwrite transaction');
        const req={result:undefined,error:null,onsuccess:null,onerror:null};
        operations.push({type,key,value:clone(value),request:req});
        return req;
      }
      tx.abort=()=>{
        if(closed) throw new Error('cannot abort a completed transaction');
        aborted=true;
        tx.error=Object.assign(new Error('transaction aborted'),{name:'AbortError'});
      };
      tx.objectStore=()=>({
        get:key=>request('get',key),
        put:(value,key)=>request('put',key,value),
        delete:key=>request('delete',key)
      });
      tx.start=()=>{
        /* Values returned by get() and accepted by put() are cloned, so a
           shallow Map snapshot is sufficient for rollback and avoids copying
           every large payload merely because a metadata transaction opened. */
        working=new Map(records);
        queueMicrotask(pump);
      };
      queue.push(tx);
      startNext();
      return tx;
    }
  };

  function write(mutator){
    return new Promise((resolveWrite,rejectWrite)=>{
      const tx=db.transaction('bundles','readwrite'),store=tx.objectStore('bundles');
      mutator(store);
      tx.oncomplete=resolveWrite;
      tx.onerror=()=>rejectWrite(tx.error||new Error('fixture transaction failed'));
      tx.onabort=()=>rejectWrite(tx.error||new Error('fixture transaction aborted'));
    });
  }
  return {
    indexedDB:{
      open(name,version){
        assert.equal(name,'massfront-updates','boot opened an unexpected database');
        assert.equal(version,1,'boot opened an unexpected database schema');
        const request={result:db,error:null,onupgradeneeded:null,
                       onsuccess:null,onerror:null};
        if(openFailures>0){
          openFailures--;
          queueMicrotask(()=>{
            request.error=new Error('intentional IndexedDB open failure');
            if(request.onerror) request.onerror();
          });
          return request;
        }
        queueMicrotask(()=>{ if(request.onsuccess) request.onsuccess(); });
        return request;
      }
    },
    get:key=>clone(records.get(key)),
    has:key=>records.has(key),
    payloadGetCount:key=>payloadGets.get(key)||0,
    logicalBytesRead:()=>logicalBytesRead,
    put:(key,value)=>write(store=>store.put(value,key)),
    writeRecords:entries=>write(store=>{
      for(const [key,value] of Object.entries(entries)){
        if(value===undefined) store.delete(key);
        else store.put(value,key);
      }
    }),
    abortWriteRecords(entries){
      return new Promise(resolveAbort=>{
        const tx=db.transaction('bundles','readwrite'),store=tx.objectStore('bundles');
        for(const [key,value] of Object.entries(entries)){
          if(value===undefined) store.delete(key);
          else store.put(value,key);
        }
        tx.onabort=resolveAbort;
        tx.abort();
      });
    },
    waitForHeldReadwrite(ordinal){
      if(held.has(ordinal)) return Promise.resolve();
      return new Promise(resolveWaiter=>{
        const waiters=heldWaiters.get(ordinal)||[];
        waiters.push(resolveWaiter); heldWaiters.set(ordinal,waiters);
      });
    },
    releaseHeldReadwrite(ordinal){
      const finish=held.get(ordinal);
      assert.ok(finish,'readwrite transaction '+ordinal+' is not held');
      held.delete(ordinal); finish();
    }
  };
}

function makeBundle({failedPath='' }={}){
  const files={};
  for(const path of order){
    if(path==='ota/00-runtime.js'){
      files[path]='window.__MF_OTA_EXPECT='+expectedArtifacts+';\n'+
        'window.__TEST_STAGED_EXEC=(window.__TEST_STAGED_EXEC|0)+1;\n'+
        ';window.__MF_OTA_RAN=(window.__MF_OTA_RAN|0)+1;';
      continue;
    }
    if(path===failedPath){
      files[path]='window.__TEST_STAGED_EXEC=(window.__TEST_STAGED_EXEC|0)+1;\n'+
        'throw new Error("intentional incomplete artifact: '+path+'");';
      continue;
    }
    if(path==='src/main.js'){
      files[path]=stateDeclaration[0]+'\n'+confirmBootSource+'\n'+
        'window.__TEST_INITIAL_CONFIRM={ran:window.__MF_OTA_RAN|0,'+
          'expect:window.__MF_OTA_EXPECT|0};\n'+
        'confirmBoot();\n'+
        'window.__TEST_INITIAL_CONFIRM.confirmed=bootConfirmed;\n'+
        '(function retryConfirmation(){\n'+
        '  requestAnimationFrame(function(){\n'+
        '    window.__TEST_CONFIRM_RETRIES=(window.__TEST_CONFIRM_RETRIES|0)+1;\n'+
        '    confirmBoot();\n'+
        '    if(!bootConfirmed&&window.__TEST_CONFIRM_RETRIES<48) retryConfirmation();\n'+
        '  });\n'+
        '})();\n'+
        'window.__TEST_STAGED_EXEC=(window.__TEST_STAGED_EXEC|0)+1;\n'+
        ';window.__MF_OTA_RAN=(window.__MF_OTA_RAN|0)+1;';
      continue;
    }
    files[path]='window.__TEST_STAGED_EXEC=(window.__TEST_STAGED_EXEC|0)+1;\n'+
      ';window.__MF_OTA_RAN=(window.__MF_OTA_RAN|0)+1;';
  }
  return {version:stagedVersion,notes:'two-launch regression',at:Date.now(),
          schema:1,channel:'stable',severity:'recommended',kind:'full',
          order:order.slice(),files};
}

function launchBoot(database){
  const blobSources=new Map(),scriptQueue=[],runtimeErrors=[],warnings=[];
  const timerIds=new Set();
  let nextBlob=1,pumping=false,context;
  const trackedSetTimeout=(fn,ms=0,...args)=>{
    const id=setTimeout(()=>{ timerIds.delete(id);fn(...args); },ms);
    timerIds.add(id);
    return id;
  };
  const trackedClearTimeout=id=>{ timerIds.delete(id);clearTimeout(id); };
  class TestBlob{
    constructor(parts){ this.source=parts.map(String).join(''); }
  }
  const TestURL={
    createObjectURL(blob){
      const id='blob:massfront-test/'+nextBlob++;
      blobSources.set(id,blob.source);
      return id;
    }
  };
  function element(tag){
    return {
      tagName:String(tag).toUpperCase(),style:{},parentNode:null,src:'',async:true,
      onload:null,onerror:null,attributes:{},
      setAttribute(name,value=''){ this.attributes[name]=String(value); },
      getAttribute(name){ return this.attributes[name]??null; }
    };
  }
  const documentElement={
    appendChild(node){ node.parentNode=this;return node; },
    removeChild(node){ node.parentNode=null;return node; }
  };
  const body={
    appendChild(node){
      node.parentNode=this;
      if(node.tagName==='SCRIPT'){
        scriptQueue.push(node);
        schedulePump();
      }
      return node;
    },
    removeChild(node){ node.parentNode=null;return node; }
  };
  const document={
    documentElement,body,
    createElement:element,
    getElementById(){ return null; },
    addEventListener(){},removeEventListener(){}
  };
  function schedulePump(){
    if(pumping) return;
    pumping=true;
    trackedSetTimeout(runNext,0);
  }
  function runNext(){
    const script=scriptQueue.shift();
    if(!script){ pumping=false;return; }
    const source=blobSources.get(script.src)||
      'window.__TEST_PACKAGED_EXEC=(window.__TEST_PACKAGED_EXEC|0)+1;'+
      /* The compact packaged stand-in reaches one real frame. This is enough
         to exercise boot.js's persistence decision without duplicating the
         full game inside the loader harness. */
      'if(!window.__TEST_PACKAGED_BOOTED&&window.__bootOk){'+
        'window.__TEST_PACKAGED_BOOTED=1;window.__bootOk();}';
    try{
      vm.runInContext(source,context,{filename:script.src||'packaged-script.js'});
    }catch(error){
      runtimeErrors.push(String(error&&error.message||error));
    }
    /* A downloaded script which throws still fires load in a browser; only a
       transport failure fires error. Its absent terminal stamp is the signal
       confirmBoot uses to keep probation armed. */
    if(script.onload) script.onload();
    trackedSetTimeout(runNext,0);
  }
  const sandbox={
    console:{
      warn(message){ warnings.push(String(message)); },
      error(message){ warnings.push('ERROR '+String(message)); },
      info(){}
    },
    indexedDB:database.indexedDB,document,Blob:TestBlob,URL:TestURL,
    Promise,Date,Math,Map,Set,Object,Array,String,Number,Boolean,RegExp,JSON,
    setTimeout:trackedSetTimeout,clearTimeout:trackedClearTimeout,queueMicrotask,
    requestAnimationFrame(fn){ return trackedSetTimeout(()=>fn(Date.now()),0); }
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  context=vm.createContext(sandbox);
  vm.runInContext(upgradeBootSource,context,{filename:'boot.js#two-launch'});
  vm.runInContext(
    'window.__TEST_BOOT_OK_CALLS=0;'+
    'window.__TEST_REAL_BOOT_OK=window.__bootOk;'+
    'window.__bootOk=function(){window.__TEST_BOOT_OK_CALLS++;'+
      'return window.__TEST_REAL_BOOT_OK();};',
    context,{filename:'two-launch-boot-ok-probe.js'});
  return {
    window:sandbox,runtimeErrors,warnings,
    idle:()=>!pumping&&scriptQueue.length===0,
    close(){ for(const id of timerIds) clearTimeout(id);timerIds.clear(); }
  };
}

async function waitFor(label,predicate,timeout=5000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    if(predicate()) return;
    await new Promise(resolveWait=>setTimeout(resolveWait,5));
  }
  throw new Error('timed out waiting for '+label);
}

/* Happy path: the first main-loop confirmation happens while tail artifacts
   are still loading. The fixed latch stays open, a later frame validates the
   payload, and a completely new boot must still select the active patch. */
const healthyBundle=makeBundle();
const futureBundle={...makeBundle(),version:'1.33.49',at:Date.now()+1000};
function bundleMeta(bundle){
  return {version:bundle.version,channel:bundle.channel||'stable',at:bundle.at,
    notes:bundle.notes||'',severity:bundle.severity||'recommended',
    kind:bundle.kind||'full',patchedFrom:bundle.patchedFrom||''};
}
function bundleIdentity(bundle){
  return {version:bundle.version,channel:bundle.channel||'stable',at:bundle.at};
}
function previousRef(key,bundle){
  return {key,...bundleIdentity(bundle)};
}
function rollbackPayloadGets(database){
  return ['previousA','previousB','previous']
    .reduce((sum,key)=>sum+database.payloadGetCount(key),0);
}

/* The fixture itself must roll back aborted writes; otherwise a fake that
   mutates its Map eagerly can make non-atomic production code look safe. */
const abortDb=makeDatabase({sentinel:{version:'kept'}});
await abortDb.abortWriteRecords({sentinel:{version:'lost'},leak:{version:'bad'}});
assert.deepEqual(abortDb.get('sentinel'),{version:'kept'},
                 'fake IndexedDB committed an aborted overwrite');
assert.equal(abortDb.has('leak'),false,'fake IndexedDB committed an aborted insert');

/* A current full release is roughly 85 MiB per payload. Model that logical
   cost without allocating three giant fixtures, and make accidental payload
   reads fail the transaction. A healthy first boot may deserialize active
   exactly once; supersession and confirmation must stay on metadata. */
const fullPayloadLogicalBytes=85*1024*1024;
const memoryDb=makeDatabase({
  active:healthyBundle,activeMeta:bundleMeta(healthyBundle),
  pending:healthyBundle,pendingMeta:bundleMeta(healthyBundle),
  previousA:futureBundle,previousAMeta:bundleMeta(futureBundle),
  previousRef:previousRef('previousA',futureBundle),
  probation:{version:stagedVersion,channel:'stable',pendingAt:healthyBundle.at,
             at:Date.now(),tries:0},
  operation:{kind:'apply',at:Date.now(),target:bundleIdentity(healthyBundle),
             token:'orphan-apply-after-commit'}
},{logicalPayloadBytes:{active:fullPayloadLogicalBytes,
                        pending:fullPayloadLogicalBytes,
                        previousA:fullPayloadLogicalBytes,
                        previousB:fullPayloadLogicalBytes,
                        previous:fullPayloadLogicalBytes},
   maxPayloadGets:{active:1,pending:0,previousA:0,previousB:0,previous:0}});
const memoryLaunch=launchBoot(memoryDb);
await waitFor('metadata-only healthy boot',()=>
  memoryLaunch.window.__TEST_BOOT_OK_CALLS===1&&
  !memoryDb.has('probation')&&!memoryDb.has('pending')&&memoryLaunch.idle());
assert.equal(memoryDb.payloadGetCount('active'),1,
             'healthy boot deserialized active more than once');
assert.equal(memoryDb.payloadGetCount('pending'),0,
             'healthy boot deserialized the pending payload');
assert.equal(rollbackPayloadGets(memoryDb),0,
             'healthy boot deserialized a rollback payload');
assert.equal(memoryDb.logicalBytesRead(),fullPayloadLogicalBytes,
             'healthy boot crossed the one-payload logical memory budget');
assert.equal(memoryDb.has('previousA'),true,
             'healthy boot deleted the unused rollback payload');
assert.equal(memoryDb.has('operation'),false,
             'confirmed target did not clear its orphan Apply lease');
memoryLaunch.close();

/* A boot attempt is not allowed to execute even its first script until the
   readwrite transaction which increments probation has committed. Killing the
   process at this held boundary must therefore leave both bytes and tries=0. */
const claimDb=makeDatabase({
  pending:healthyBundle,
  pendingMeta:bundleMeta(healthyBundle),
  active:healthyBundle,
  activeMeta:bundleMeta(healthyBundle),
  probation:{version:stagedVersion,channel:'stable',pendingAt:healthyBundle.at,
             at:Date.now(),tries:0}
},{holdReadwriteCommits:[2]});
const claimLaunch=launchBoot(claimDb);
await claimDb.waitForHeldReadwrite(2);
assert.equal(claimLaunch.window.__TEST_STAGED_EXEC|0,0,
             'patch scripts started before probation claim committed');
assert.equal(claimDb.get('probation').tries,0,
             'uncommitted probation claim leaked into durable state');
claimDb.releaseHeldReadwrite(2);
await waitFor('held probation claim release',()=>
  claimLaunch.window.__TEST_BOOT_OK_CALLS===1&&claimLaunch.idle());
assert.equal(claimLaunch.window.__MASSFRONT_PATCHED,stagedVersion,
             'patch did not start after probation claim committed');
claimLaunch.close();

/* Supersession reads and deletes share one transaction. A newer writer queued
   while that transaction is paused must commit after it and survive; the old
   read-then-delete implementation erased this exact candidate. */
const evictDb=makeDatabase({
  pending:{...healthyBundle,version:packagedBase},
  pendingMeta:bundleMeta({...healthyBundle,version:packagedBase}),
  active:healthyBundle,
  activeMeta:bundleMeta(healthyBundle)
},{holdReadwriteCommits:[1]});
const evictLaunch=launchBoot(evictDb);
await evictDb.waitForHeldReadwrite(1);
const evictWriter=evictDb.writeRecords({
  pending:futureBundle,pendingMeta:bundleMeta(futureBundle)
});
evictDb.releaseHeldReadwrite(1);
await evictWriter;
await waitFor('serialized supersession writer',()=>
  evictLaunch.window.__TEST_BOOT_OK_CALLS===1&&evictLaunch.idle());
assert.equal(evictDb.get('pending').version,futureBundle.version,
             'supersession cleanup deleted a newer queued candidate');
evictLaunch.close();

/* Apply writes the running build into the inactive rollback slot before it
   swings previousRef. Even when a newer packaged shell makes those bytes
   superseded, metadata-only boot eviction must not erase the prepared slot
   from under the live Apply owner. The referenced old slot can be retired. */
const supersededBundle={...healthyBundle,version:packagedBase};
const inactiveSlotDb=makeDatabase({
  active:supersededBundle,activeMeta:bundleMeta(supersededBundle),
  previousA:supersededBundle,previousAMeta:bundleMeta(supersededBundle),
  previousB:supersededBundle,previousBMeta:bundleMeta(supersededBundle),
  previousRef:previousRef('previousA',supersededBundle),
  operation:{kind:'apply',at:Date.now(),target:bundleIdentity(futureBundle),
             token:'live-apply-prepared-inactive-slot'}
},{logicalPayloadBytes:{previousA:fullPayloadLogicalBytes,
                        previousB:fullPayloadLogicalBytes},
   maxPayloadGets:{previousA:0,previousB:0}});
const inactiveSlotLaunch=launchBoot(inactiveSlotDb);
await waitFor('inactive rollback-slot preservation',()=>
  (inactiveSlotLaunch.window.__TEST_PACKAGED_BOOTED|0)===1&&inactiveSlotLaunch.idle());
assert.equal(inactiveSlotDb.has('previousRef'),false,
             'superseded referenced rollback pointer survived eviction');
assert.equal(inactiveSlotDb.has('previousA'),false,
             'superseded referenced rollback payload survived eviction');
assert.equal(inactiveSlotDb.has('previousB'),true,
             'boot erased a valid in-progress inactive rollback slot');
assert.equal(inactiveSlotDb.has('previousBMeta'),true,
             'boot erased inactive rollback metadata but left its payload');
assert.equal(rollbackPayloadGets(inactiveSlotDb),0,
             'supersession deserialized a rollback payload');
assert.equal(inactiveSlotDb.get('operation').token,
             'live-apply-prepared-inactive-slot',
             'boot cleared a still-live Apply owner during slot eviction');
inactiveSlotLaunch.close();

/* Once that Apply lease expires, an unreferenced prepared slot has no durable
   owner. Reclaim it even if its version is newer than the packaged shell; the
   referenced slot remains the sole rollback authority and neither payload is
   deserialized for cleanup. */
const staleSlotDb=makeDatabase({
  active:healthyBundle,activeMeta:bundleMeta(healthyBundle),
  previousA:healthyBundle,previousAMeta:bundleMeta(healthyBundle),
  previousRef:previousRef('previousA',healthyBundle),
  previousB:futureBundle,previousBMeta:bundleMeta(futureBundle),
  operation:{kind:'apply',at:Date.now()-5*60*1000-1,
             target:bundleIdentity(futureBundle),token:'stale-preparation-owner'}
},{logicalPayloadBytes:{previousA:fullPayloadLogicalBytes,
                        previousB:fullPayloadLogicalBytes},
   maxPayloadGets:{previousA:0,previousB:0}});
const staleSlotLaunch=launchBoot(staleSlotDb);
await waitFor('stale rollback-slot reclamation',()=>
  staleSlotLaunch.window.__TEST_BOOT_OK_CALLS===1&&staleSlotLaunch.idle());
assert.equal(staleSlotDb.has('previousRef'),true,
             'slot reclamation deleted the valid rollback pointer');
assert.equal(staleSlotDb.has('previousA'),true,
             'slot reclamation deleted the referenced rollback payload');
assert.equal(staleSlotDb.has('previousB'),false,
             'slot reclamation retained a newer unreferenced orphan');
assert.equal(staleSlotDb.has('previousBMeta'),false,
             'slot reclamation left orphan metadata behind');
assert.equal(rollbackPayloadGets(staleSlotDb),0,
             'slot reclamation deserialized a rollback payload');
staleSlotLaunch.close();

const healthyDb=makeDatabase({
  pending:healthyBundle,
  pendingMeta:bundleMeta(healthyBundle),
  active:healthyBundle,
  activeMeta:bundleMeta(healthyBundle),
  probation:{version:stagedVersion,at:Date.now(),tries:0}
});
const healthyFirst=launchBoot(healthyDb);
await waitFor('first launch patch confirmation',()=>
  healthyFirst.window.__TEST_BOOT_OK_CALLS===1&&
  !healthyDb.has('probation')&&!healthyDb.has('pending')&&healthyFirst.idle());
assert.equal(healthyFirst.window.__MASSFRONT_PATCHED,stagedVersion,
             'first launch did not select the staged patch');
assert.equal(healthyFirst.window.__TEST_INITIAL_CONFIRM.confirmed,false,
             'test did not reproduce a frame before tail artifacts completed');
assert.ok(healthyFirst.window.__TEST_INITIAL_CONFIRM.ran<expectedArtifacts,
          'initial confirmation unexpectedly saw a complete payload');
assert.equal(healthyFirst.window.__MF_OTA_RAN,expectedArtifacts,
             'healthy staged payload did not run every artifact');
assert.equal(healthyDb.get('active').version,stagedVersion,
             'successful first launch removed the active patch');
assert.equal(healthyDb.has('probation'),false,
             'successful first launch did not clear probation');
assert.equal(healthyDb.has('pending'),false,
             'successful first launch did not clear the retry copy');
const healthyFirstInitial=clone(healthyFirst.window.__TEST_INITIAL_CONFIRM);
healthyFirst.close();

const healthySecond=launchBoot(healthyDb);
await waitFor('second launch active patch',()=>
  healthySecond.window.__TEST_BOOT_OK_CALLS===1&&healthySecond.idle());
assert.equal(healthySecond.window.__MASSFRONT_PATCHED,stagedVersion,
             'second launch rolled back the validated active patch');
assert.equal(healthySecond.window.__TEST_PACKAGED_EXEC|0,0,
             'second launch ran packaged scripts instead of the active patch');
assert.equal(healthyDb.get('active').version,stagedVersion,
             'second launch deleted the validated active patch');
assert.equal(healthyDb.has('probation'),false,
             'second launch recreated probation for a validated patch');
assert.equal(healthyDb.has('applyFailure'),false,
             'second launch recorded a false failed-start rollback');
healthySecond.close();

/* Boot confirmation owns only the payload named by probation. A candidate
   staged by another document must survive confirmation of the currently
   running patch, even when that candidate is already present by the time the
   cleanup transaction begins. */
const concurrentDb=makeDatabase({
  pending:futureBundle,
  pendingMeta:bundleMeta(futureBundle),
  active:healthyBundle,
  activeMeta:bundleMeta(healthyBundle),
  probation:{version:stagedVersion,channel:'stable',pendingAt:healthyBundle.at,
             at:Date.now(),tries:0},
  operation:{kind:'apply',at:Date.now(),target:bundleIdentity(futureBundle),
             token:'uncommitted-apply'}
});
const concurrentLaunch=launchBoot(concurrentDb);
await waitFor('conditional boot cleanup',()=>
  concurrentLaunch.window.__TEST_BOOT_OK_CALLS===1&&
  !concurrentDb.has('probation')&&concurrentLaunch.idle());
assert.equal(concurrentLaunch.window.__MASSFRONT_PATCHED,stagedVersion,
             'conditional cleanup did not validate the running patch');
assert.equal(concurrentDb.get('pending').version,futureBundle.version,
             'boot confirmation deleted a different pending candidate');
assert.equal(concurrentDb.get('operation').token,'uncommitted-apply',
             'boot confirmation cleared an Apply lease for another target');
concurrentLaunch.close();

/* Rollback commits change durable active away from their lease target. If its
   document dies before finally releasing the lease, boot can prove completion
   from metadata and retire the orphan. A legacy pending payload without
   pendingMeta remains untouched because its exact identity is unknowable. */
const rollbackOrphanDb=makeDatabase({
  active:healthyBundle,activeMeta:bundleMeta(healthyBundle),
  pending:healthyBundle,
  probation:{version:stagedVersion,channel:'stable',pendingAt:healthyBundle.at,
             at:Date.now(),tries:0},
  operation:{kind:'rollback',at:Date.now(),target:bundleIdentity(futureBundle),
             token:'orphan-rollback-after-commit'}
});
const rollbackOrphanLaunch=launchBoot(rollbackOrphanDb);
await waitFor('orphan Rollback cleanup',()=>
  rollbackOrphanLaunch.window.__TEST_BOOT_OK_CALLS===1&&
  !rollbackOrphanDb.has('probation')&&rollbackOrphanLaunch.idle());
assert.equal(rollbackOrphanDb.has('operation'),false,
             'boot retained a committed orphan Rollback lease');
assert.equal(rollbackOrphanDb.has('pending'),true,
             'boot deleted legacy pending without exact metadata');
rollbackOrphanLaunch.close();

/* Safety path: one staged script throws before its completion stamp. Main and
   the tail still execute, but the count can never reach EXPECT, so __bootOk is
   withheld. The next launch observes tries=1 and returns to packaged code while
   retaining pending for the updater's explicit retry UI. */
const failedPath='src/engine/vfxlayers.js';
assert.ok(order.indexOf(failedPath)>order.indexOf('src/engine/gl.js'),
          'chosen failure must occur after the renderer gate');
assert.ok(order.indexOf(failedPath)<order.indexOf('src/main.js'),
          'chosen failure must occur before main confirmation');
const incompleteBundle=makeBundle({failedPath});

/* Failed-start rejection, quarantine removal and fallback selection are one
   transaction. A complete successor queued at its commit boundary must survive
   intact for the next launch instead of being erased by trailing cleanup. */
const rejectionDb=makeDatabase({
  pending:incompleteBundle,
  pendingMeta:bundleMeta(incompleteBundle),
  active:incompleteBundle,
  activeMeta:bundleMeta(incompleteBundle),
  probation:{version:stagedVersion,channel:'stable',pendingAt:incompleteBundle.at,
             at:Date.now(),tries:1},
  applyFailure:{version:stagedVersion,count:1,reason:'first failed start'}
},{holdReadwriteCommits:[2]});
const rejectionLaunch=launchBoot(rejectionDb);
await rejectionDb.waitForHeldReadwrite(2);
const rejectionWriter=rejectionDb.writeRecords({
  pending:futureBundle,
  pendingMeta:bundleMeta(futureBundle),
  active:futureBundle,
  activeMeta:bundleMeta(futureBundle),
  probation:{version:futureBundle.version,channel:'stable',pendingAt:futureBundle.at,
             at:Date.now(),tries:0},
  applyFailure:undefined
});
rejectionDb.releaseHeldReadwrite(2);
await rejectionWriter;
await waitFor('serialized failed-start successor',()=>
  (rejectionLaunch.window.__TEST_PACKAGED_BOOTED|0)===1&&rejectionLaunch.idle());
assert.equal(rejectionDb.get('active').version,futureBundle.version,
             'failed-start cleanup deleted a newer active payload');
assert.equal(rejectionDb.get('pending').version,futureBundle.version,
             'failed-start cleanup deleted a newer pending payload');
assert.equal(rejectionDb.get('probation').version,futureBundle.version,
             'failed-start cleanup deleted a newer probation guard');
rejectionLaunch.close();

const rejectionSuccessor=launchBoot(rejectionDb);
await waitFor('successor after serialized rejection',()=>
  rejectionSuccessor.window.__TEST_BOOT_OK_CALLS===1&&rejectionSuccessor.idle());
assert.equal(rejectionSuccessor.window.__MASSFRONT_PATCHED,futureBundle.version,
             'next launch did not select the successor payload');
assert.equal(rejectionDb.has('probation'),false,
             'successor launch did not clear its own probation');
rejectionSuccessor.close();

const incompleteDb=makeDatabase({
  pending:incompleteBundle,
  pendingMeta:bundleMeta(incompleteBundle),
  active:incompleteBundle,
  activeMeta:bundleMeta(incompleteBundle),
  probation:{version:stagedVersion,at:Date.now(),tries:0}
});
const incompleteFirst=launchBoot(incompleteDb);
await waitFor('incomplete launch confirmation retries',()=>
  (incompleteFirst.window.__TEST_CONFIRM_RETRIES|0)>=48&&incompleteFirst.idle());
assert.equal(incompleteFirst.window.__MASSFRONT_PATCHED,stagedVersion,
             'incomplete first launch did not attempt the staged patch');
assert.equal(incompleteFirst.window.__MF_OTA_RAN,expectedArtifacts-1,
             'incomplete launch did not leave exactly one missing stamp');
assert.equal(incompleteFirst.window.__TEST_BOOT_OK_CALLS,0,
             'incomplete payload cleared probation');
assert.equal(incompleteDb.get('probation').tries,1,
             'boot loader did not claim the incomplete patch attempt');
assert.ok(incompleteFirst.runtimeErrors.some(e=>e.includes(failedPath)),
          'the intended staged artifact failure was not exercised');
incompleteFirst.close();

const incompleteSecond=launchBoot(incompleteDb);
await waitFor('incomplete payload rollback',()=>
  !incompleteDb.has('active')&&!incompleteDb.has('probation')&&
  (incompleteSecond.window.__TEST_PACKAGED_EXEC|0)>0&&incompleteSecond.idle());
const failure=incompleteDb.get('applyFailure');
assert.equal(incompleteSecond.window.__MASSFRONT_PATCHED,undefined,
             'second incomplete launch still selected the broken patch');
assert.equal(incompleteDb.has('active'),false,
             'rollback retained the broken active patch');
assert.equal(incompleteDb.has('probation'),false,
             'rollback retained the consumed probation record');
assert.equal(incompleteDb.has('pending'),true,
             'first failure destroyed the retryable pending payload');
assert.equal(failure.version,stagedVersion,
             'rollback failure record names the wrong version');
assert.equal(failure.count,1,'first failed start has the wrong failure count');
assert.match(failure.reason,/did not finish starting/i,
             'rollback did not preserve the failed-start reason');
incompleteSecond.close();

/* A validated previous payload is promoted in the same rejection transaction,
   and is consumed exactly once. The recovered frame must not confirm or erase
   the failed candidate it is merely replacing for this launch. */
const recoveryBroken={...incompleteBundle,version:futureBundle.version,
                      at:futureBundle.at+1000};
const recoveryDb=makeDatabase({
  pending:recoveryBroken,
  pendingMeta:bundleMeta(recoveryBroken),
  active:recoveryBroken,
  activeMeta:bundleMeta(recoveryBroken),
  probation:{version:recoveryBroken.version,channel:'stable',
             pendingAt:recoveryBroken.at,at:Date.now(),tries:1},
  previousA:healthyBundle,
  previousAMeta:bundleMeta(healthyBundle),
  previousRef:previousRef('previousA',healthyBundle),
  operation:{kind:'apply',at:Date.now(),target:bundleIdentity(recoveryBroken),
             token:'orphan-apply-failed-target'}
},{logicalPayloadBytes:{active:fullPayloadLogicalBytes,
                        pending:fullPayloadLogicalBytes,
                        previousA:fullPayloadLogicalBytes,
                        previousB:fullPayloadLogicalBytes,
                        previous:fullPayloadLogicalBytes},
   maxPayloadGets:{active:0,pending:0,previousA:1,previousB:0,previous:0}});
const recoveryLaunch=launchBoot(recoveryDb);
await waitFor('atomic previous recovery',()=>
  recoveryLaunch.window.__MASSFRONT_RECOVERED_PATCH===recoveryBroken.version&&
  recoveryLaunch.window.__TEST_BOOT_OK_CALLS===1&&recoveryLaunch.idle());
assert.equal(recoveryLaunch.window.__MASSFRONT_PATCHED,healthyBundle.version,
             'recovery did not execute the validated previous payload');
assert.equal(recoveryDb.get('active').version,healthyBundle.version,
             'recovery did not atomically promote previous to active');
assert.equal(recoveryDb.has('previousRef'),false,
             'recovery retained a consumed rollback pointer');
assert.equal(recoveryDb.has('previousA'),false,
             'recovery retained its consumed rollback slot');
assert.equal(recoveryDb.has('previousB'),false,
             'recovery retained an inactive rollback slot');
assert.equal(recoveryDb.get('pending').version,recoveryBroken.version,
             'first recovery destroyed the retryable failed payload');
assert.equal(recoveryDb.has('probation'),false,
             'recovered previous payload retained the failed probation');
assert.equal(recoveryDb.has('operation'),false,
             'recovery retained the failed target\'s committed Apply lease');
assert.equal(recoveryDb.payloadGetCount('pending'),0,
             'failure recovery deserialized pending instead of using metadata');
assert.equal(recoveryDb.payloadGetCount('active'),0,
             'known failed-start recovery deserialized the rejected active payload');
assert.equal(rollbackPayloadGets(recoveryDb),1,
             'failure recovery did not read exactly one rollback payload');
assert.equal(recoveryDb.payloadGetCount('previousA'),1,
             'failure recovery did not select the referenced rollback slot');
assert.equal(recoveryDb.logicalBytesRead(),fullPayloadLogicalBytes,
             'known failed-start recovery crossed one payload of logical reads');
recoveryLaunch.close();

/* A pointer is authority only when its identity exactly matches that slot's
   metadata. A torn pointer must select the legacy previous/previousMeta pair,
   never probe the unowned slot and then double the recovery memory peak. */
const legacyRecoveryDb=makeDatabase({
  pending:recoveryBroken,pendingMeta:bundleMeta(recoveryBroken),
  active:recoveryBroken,activeMeta:bundleMeta(recoveryBroken),
  probation:{version:recoveryBroken.version,channel:'stable',
             pendingAt:recoveryBroken.at,at:Date.now(),tries:1},
  previousA:healthyBundle,previousAMeta:bundleMeta(healthyBundle),
  previousRef:{...previousRef('previousA',healthyBundle),at:healthyBundle.at+1},
  previous:healthyBundle,previousMeta:bundleMeta(healthyBundle),
  operation:{kind:'apply',at:Date.now(),target:bundleIdentity(futureBundle),
             token:'unrelated-apply-during-recovery'}
},{logicalPayloadBytes:{active:fullPayloadLogicalBytes,
                        pending:fullPayloadLogicalBytes,
                        previousA:fullPayloadLogicalBytes,
                        previousB:fullPayloadLogicalBytes,
                        previous:fullPayloadLogicalBytes},
   maxPayloadGets:{active:0,pending:0,previousA:0,previousB:0,previous:1}});
const legacyRecoveryLaunch=launchBoot(legacyRecoveryDb);
await waitFor('legacy rollback fallback',()=>
  legacyRecoveryLaunch.window.__MASSFRONT_RECOVERED_PATCH===recoveryBroken.version&&
  legacyRecoveryLaunch.window.__TEST_BOOT_OK_CALLS===1&&legacyRecoveryLaunch.idle());
assert.equal(legacyRecoveryLaunch.window.__MASSFRONT_PATCHED,healthyBundle.version,
             'mismatched slot pointer did not fall back to legacy rollback');
assert.equal(legacyRecoveryDb.payloadGetCount('previousA'),0,
             'legacy fallback deserialized a mismatched rollback slot');
assert.equal(legacyRecoveryDb.payloadGetCount('previous'),1,
             'legacy fallback did not read exactly its selected payload');
assert.equal(rollbackPayloadGets(legacyRecoveryDb),1,
             'legacy fallback crossed one rollback payload read');
assert.equal(legacyRecoveryDb.logicalBytesRead(),fullPayloadLogicalBytes,
             'legacy fallback crossed the 85 MiB logical recovery budget');
assert.equal(legacyRecoveryDb.get('operation').token,
             'unrelated-apply-during-recovery',
             'recovery cleared an Apply lease for a different target');
for(const key of ['previousRef','previousA','previousAMeta','previousB',
                   'previousBMeta','previous','previousMeta'])
  assert.equal(legacyRecoveryDb.has(key),false,
               'legacy recovery retained rollback debris '+key);
legacyRecoveryLaunch.close();

/* An IndexedDB failure can make boot.js fall back to packaged scripts even
   though a new patch and a zero-try probation record are still stored. That
   packaged frame must never clear probation: it has not run the patch. On the
   next healthy launch the broken patch has to be tried under probation and
   then roll back normally, rather than being silently promoted unguarded. */
const guardedFallbackDb=makeDatabase({
  pending:incompleteBundle,
  pendingMeta:bundleMeta(incompleteBundle),
  active:incompleteBundle,
  probation:{version:stagedVersion,at:Date.now(),tries:0}
},{failOpenCount:1});
const guardedFallbackFirst=launchBoot(guardedFallbackDb);
await waitFor('packaged fallback after IndexedDB failure',()=>
  (guardedFallbackFirst.window.__TEST_PACKAGED_BOOTED|0)===1&&
  guardedFallbackFirst.window.__TEST_BOOT_OK_CALLS===1&&guardedFallbackFirst.idle());
assert.equal(guardedFallbackDb.get('probation').tries,0,
             'packaged fallback erased probation for an unrun patch');
assert.equal(guardedFallbackDb.get('active').version,stagedVersion,
             'packaged fallback destroyed the retryable active patch');
guardedFallbackFirst.close();

const guardedFallbackSecond=launchBoot(guardedFallbackDb);
await waitFor('guarded retry after IndexedDB recovery',()=>
  (guardedFallbackSecond.window.__TEST_CONFIRM_RETRIES|0)>=48&&
  guardedFallbackSecond.idle());
assert.equal(guardedFallbackSecond.window.__MASSFRONT_PATCHED,stagedVersion,
             'recovered IndexedDB launch did not retry the stored patch');
assert.equal(guardedFallbackSecond.window.__TEST_BOOT_OK_CALLS,0,
             'incomplete guarded retry cleared probation');
assert.equal(guardedFallbackDb.get('probation').tries,1,
             'recovered IndexedDB launch did not retain rollback probation');
assert.deepEqual(guardedFallbackDb.get('activeMeta'),bundleMeta(incompleteBundle),
                 'boot did not migrate legacy active metadata atomically');
guardedFallbackSecond.close();

console.log(JSON.stringify({
  ok:true,
  staged:{version:stagedVersion,artifacts:expectedArtifacts,bytes:stagedBytes,
          hashesVerified:true,mainMatchesProduction:true},
  healthy:{
    firstLaunch:{initial:healthyFirstInitial,finalRan:expectedArtifacts,
                 probationCleared:true,pendingCleared:true},
    secondLaunch:{selected:stagedVersion,rolledBack:false}
  },
  bootMemory:{logicalPayloadBytes:fullPayloadLogicalBytes,
              activeGets:memoryDb.payloadGetCount('active'),
              pendingGets:memoryDb.payloadGetCount('pending'),
              rollbackGets:rollbackPayloadGets(memoryDb)},
  recoveryMemory:{logicalPayloadBytes:recoveryDb.logicalBytesRead(),
                  activeGets:recoveryDb.payloadGetCount('active'),
                  pendingGets:recoveryDb.payloadGetCount('pending'),
                  rollbackGets:rollbackPayloadGets(recoveryDb),
                  selectedSlot:'previousA'},
  incomplete:{
    failedPath,firstLaunch:{ran:expectedArtifacts-1,bootOkCalls:0,probationTries:1},
    secondLaunch:{selected:'packaged',activeRemoved:true,pendingRetained:true,
                  failureCount:failure.count}
  },
  indexedDbFallback:{
    packagedFrameDidNotClearProbation:true,
    recoveredLaunchRetriedUnderProbation:true
  },
  transactions:{
    abortRolledBack:true,
    claimCommittedBeforeExecution:true,
    supersessionPreservedQueuedWriter:true,
    rejectionPreservedQueuedSuccessor:true,
    previousRecoveredAtomically:true,
    matchingApplyOrphanCleared:true,
    committedRollbackOrphanCleared:true,
    unrelatedApplyLeaseRetained:true,
    legacyPendingRetained:true,
    inactiveRollbackSlotPreserved:true,
    staleRollbackSlotReclaimed:true,
    invalidPointerUsedLegacyFallback:true,
    failedApplyOrphanCleared:true,
    unrelatedRecoveryApplyRetained:true
  }
},null,2));
