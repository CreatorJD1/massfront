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

function makeDatabase(initial,{failOpenCount=0}={}){
  const records=new Map();
  let openFailures=Math.max(0,failOpenCount|0);
  for(const [key,value] of Object.entries(initial||{})) records.set(key,clone(value));
  const db={
    objectStoreNames:{contains:name=>name==='bundles'},
    createObjectStore(){ return {}; },
    transaction(name){
      assert.equal(name,'bundles','boot opened an unexpected IndexedDB store');
      const tx={oncomplete:null,onerror:null};
      const complete=()=>queueMicrotask(()=>{ if(tx.oncomplete) tx.oncomplete(); });
      tx.objectStore=()=>({
        get(key){
          const request={result:undefined,error:null,onsuccess:null,onerror:null};
          queueMicrotask(()=>{
            request.result=clone(records.get(key));
            if(request.onsuccess) request.onsuccess();
          });
          return request;
        },
        put(value,key){ records.set(key,clone(value));complete(); },
        delete(key){ records.delete(key);complete(); }
      });
      return tx;
    }
  };
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
    has:key=>records.has(key)
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
const healthyDb=makeDatabase({
  pending:healthyBundle,
  active:healthyBundle,
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
const incompleteDb=makeDatabase({
  pending:incompleteBundle,
  active:incompleteBundle,
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

/* An IndexedDB failure can make boot.js fall back to packaged scripts even
   though a new patch and a zero-try probation record are still stored. That
   packaged frame must never clear probation: it has not run the patch. On the
   next healthy launch the broken patch has to be tried under probation and
   then roll back normally, rather than being silently promoted unguarded. */
const guardedFallbackDb=makeDatabase({
  pending:incompleteBundle,
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
  incomplete:{
    failedPath,firstLaunch:{ran:expectedArtifacts-1,bootOkCalls:0,probationTries:1},
    secondLaunch:{selected:'packaged',activeRemoved:true,pendingRetained:true,
                  failureCount:failure.count}
  },
  indexedDbFallback:{
    packagedFrameDidNotClearProbation:true,
    recoveredLaunchRetriedUnderProbation:true
  }
},null,2));
