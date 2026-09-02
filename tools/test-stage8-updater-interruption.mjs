import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {TextDecoder,TextEncoder} from 'node:util';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const updaterSource=await readFile(resolve(root,'src/updater.js'),'utf8');
assert.match(updaterSource,/async function updDownload\(\)/,
             'production updDownload() is missing');
assert.match(updaterSource,/function updCancel\(\)/,
             'production updCancel() is missing');

const encoder=new TextEncoder();
const clone=value=>value===undefined?undefined:structuredClone(value);
const tick=()=>new Promise(resolveTick=>setTimeout(resolveTick,0));
async function waitFor(predicate,label){
  for(let i=0;i<250;i++){
    if(predicate()) return;
    await tick();
  }
  throw new Error('timeout waiting for '+label);
}
function deferred(){
  let resolvePromise,rejectPromise;
  const promise=new Promise((resolve,reject)=>{
    resolvePromise=resolve; rejectPromise=reject;
  });
  return {promise,resolve:resolvePromise,reject:rejectPromise};
}
function abortError(){
  const error=new Error('aborted'); error.name='AbortError'; return error;
}
function digestBytes(bytes){
  const digest=createHash('sha256').update(bytes).digest();
  return digest.buffer.slice(digest.byteOffset,digest.byteOffset+digest.byteLength);
}
function digestText(text){ return createHash('sha256').update(String(text)).digest('hex'); }
function file(path,text,url){
  const bytes=encoder.encode(text);
  return {path,size:bytes.byteLength,
          sha256:createHash('sha256').update(bytes).digest('hex'),
          ...(url?{url}:{}),bytes,text};
}
function chunkedFile(path,text,chunkSize=4,url){
  const entry=file(path,text,url),chunks=[];
  for(let offset=0;offset<entry.bytes.byteLength;offset+=chunkSize){
    const part=entry.bytes.slice(offset,Math.min(entry.bytes.byteLength,offset+chunkSize));
    chunks.push({offset,size:part.byteLength,
      sha256:createHash('sha256').update(part).digest('hex')});
  }
  return {...entry,chunks};
}
function rangedResponse(entry,start,end){
  const bytes=entry.bytes.slice(start,end+1),total=entry.bytes.byteLength;
  return {ok:true,status:206,headers:{get:name=>{
    name=String(name).toLowerCase();
    if(name==='content-range') return `bytes ${start}-${end}/${total}`;
    if(name==='content-type') return 'application/javascript';
    return null;
  }},body:null,async arrayBuffer(){
    return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  }};
}
function response(entry,{stream=false,blockAfterFirst=false}={}){
  return signal=>{
    const bytes=entry.bytes;
    if(!stream){
      return {ok:true,status:200,headers:{get:()=> 'application/javascript'},body:null,
        async arrayBuffer(){
          if(signal&&signal.aborted) throw abortError();
          return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
        }};
    }
    let step=0;
    return {ok:true,status:200,headers:{get:()=> 'application/javascript'},
      body:{getReader(){ return {read(){
        if(signal&&signal.aborted) return Promise.reject(abortError());
        if(step++===0){
          const cut=Math.max(1,Math.floor(bytes.byteLength/2));
          return Promise.resolve({done:false,value:bytes.slice(0,cut)});
        }
        if(blockAfterFirst){
          return new Promise((resolveRead,rejectRead)=>{
            if(signal&&signal.aborted){ rejectRead(abortError()); return; }
            signal.addEventListener('abort',()=>rejectRead(abortError()),{once:true});
          });
        }
        if(step===2){
          const cut=Math.max(1,Math.floor(bytes.byteLength/2));
          return Promise.resolve({done:false,value:bytes.slice(cut)});
        }
        return Promise.resolve({done:true,value:undefined});
      }}; }}};
  };
}

function makeLocalStorage(initial={}){
  const values=new Map(Object.entries(initial).map(([key,value])=>[key,String(value)]));
  return {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem(key,value){ values.set(key,String(value)); },
    removeItem:key=>values.delete(key),
    snapshot:()=>Object.fromEntries(values)
  };
}

function makeDatabase(initial={}){
  let records=new Map(Object.entries(initial).map(([key,value])=>[key,clone(value)]));
  const transactions=[],failRules=[],holdStartRules=[],holdCommitRules=[];
  const getCounts=new Map(),getOrder=[];
  let active=null,held=null,writeCommits=0,transactionSeq=0;
  const mutationKeys=state=>state.requests
    .filter(operation=>operation.type==='put'||operation.type==='delete')
    .map(operation=>operation.key);
  const matches=(state,rule,phase)=>{
    if(rule.mode&&state.mode!==rule.mode) return false;
    const source=phase==='start'
      ? state.requests.filter(operation=>operation.type==='get').map(operation=>operation.key)
      : mutationKeys(state);
    return !rule.keys||rule.keys.every(key=>source.includes(key));
  };
  const takeRule=(rules,state,phase)=>{
    const index=rules.findIndex(rule=>matches(state,rule,phase));
    return index<0?null:rules.splice(index,1)[0];
  };
  const pump=()=>{
    if(active||held||!transactions.length) return;
    const state=transactions.shift();
    active=state;
    const hold=takeRule(holdStartRules,state,'start');
    if(hold){
      held={phase:'start',state,release:()=>start(state)};
      return;
    }
    start(state);
  };
  const finish=state=>{
    if(active===state) active=null;
    queueMicrotask(pump);
  };
  const abort=(state,error,fireError=false)=>{
    if(state.settled) return;
    state.aborted=true; state.settled=true;
    state.tx.error=error||Object.assign(new Error('transaction aborted'),{name:'AbortError'});
    queueMicrotask(()=>{
      if(fireError&&state.tx.onerror) state.tx.onerror();
      if(state.tx.onabort) state.tx.onabort();
      finish(state);
    });
  };
  const commit=state=>{
    if(state.settled||state.aborted) return;
    const dirty=mutationKeys(state).length>0;
    if(dirty&&!state.commitHoldChecked){
      state.commitHoldChecked=true;
      const hold=takeRule(holdCommitRules,state,'commit');
      if(hold){
        held={phase:'commit',state,release:()=>commit(state)};
        return;
      }
    }
    if(dirty){
      const failure=takeRule(failRules,state,'commit');
      if(failure){
        const error=new Error(failure.message||'injected atomic transaction failure');
        error.name=failure.name;
        abort(state,error,true);
        return;
      }
      records=new Map([...state.working].map(([key,value])=>[key,clone(value)]));
      writeCommits++;
    }
    state.settled=true;
    queueMicrotask(()=>{
      if(state.tx.oncomplete) state.tx.oncomplete();
      finish(state);
    });
  };
  const process=state=>{
    if(state.settled||state.aborted) return;
    if(state.cursor>=state.requests.length){
      /* A request callback may enqueue more work in the same transaction. */
      queueMicrotask(()=>state.cursor<state.requests.length?process(state):commit(state));
      return;
    }
    const operation=state.requests[state.cursor++];
    queueMicrotask(()=>{
      if(state.settled||state.aborted) return;
      try{
        if(operation.type==='get'){
          getCounts.set(operation.key,(getCounts.get(operation.key)||0)+1);
          getOrder.push(operation.key);
          operation.request.result=clone(state.working.get(operation.key));
        }
        else if(operation.type==='getAllKeys'){
          operation.request.result=[...state.working.keys()].sort();
        }
        else if(operation.type==='put'){
          state.working.set(operation.key,clone(operation.value));
          operation.request.result=operation.key;
        }else state.working.delete(operation.key);
        if(operation.request.onsuccess) operation.request.onsuccess();
      }catch(error){
        operation.request.error=error;
        if(operation.request.onerror) operation.request.onerror();
        abort(state,error,true);
        return;
      }
      queueMicrotask(()=>process(state));
    });
  };
  const start=state=>{
    if(state.settled||state.aborted) return;
    state.started=true;
    /* IndexedDB takes its view when a serialized transaction begins, not when
       another document first constructed the transaction object. */
    state.working=new Map([...records].map(([key,value])=>[key,clone(value)]));
    process(state);
  };
  const db={
    objectStoreNames:{contains:name=>name==='bundles'},
    createObjectStore(){ return {}; },
    transaction(name,mode){
      assert.equal(name,'bundles','unexpected updater object store');
      mode=mode||'readonly';
      const state={id:++transactionSeq,mode,requests:[],cursor:0,working:null,
                   started:false,settled:false,aborted:false,commitHoldChecked:false,tx:null};
      const tx={oncomplete:null,onerror:null,onabort:null,error:null,
        abort(){ abort(state); }};
      state.tx=tx;
      const request=operation=>{
        assert.ok(!state.settled&&!state.aborted,'request added to inactive transaction');
        const result={result:undefined,error:null,onsuccess:null,onerror:null};
        state.requests.push(Object.assign(operation,{request:result}));
        return result;
      };
      const store={
        get:key=>request({type:'get',key}),
        getAllKeys:()=>request({type:'getAllKeys'}),
        put(value,key){
          assert.equal(mode,'readwrite','put outside readwrite transaction');
          return request({type:'put',key,value:clone(value)});
        },
        delete(key){
          assert.equal(mode,'readwrite','delete outside readwrite transaction');
          return request({type:'delete',key});
        }
      };
      tx.objectStore=()=>store;
      transactions.push(state);
      queueMicrotask(pump);
      return tx;
    }
  };
  return {
    indexedDB:{open(name,version){
      assert.equal(name,'massfront-updates','unexpected updater database');
      assert.equal(version,1,'unexpected updater database version');
      const request={result:db,error:null,onupgradeneeded:null,onsuccess:null,onerror:null};
      queueMicrotask(()=>{ if(request.onsuccess) request.onsuccess(); });
      return request;
    }},
    get:key=>clone(records.get(key)),
    snapshot:()=>Object.fromEntries([...records].map(([key,value])=>[key,clone(value)])),
    failNextWrite(name='Error'){
      failRules.push({name,message:'injected atomic staging failure'});
    },
    failWriteKeys(keys,name='Error'){
      failRules.push({keys:[...keys],name,message:'injected atomic transition failure'});
    },
    holdNextWrite(){ holdCommitRules.push({}); },
    holdWriteKeys(keys){ holdCommitRules.push({keys:[...keys]}); },
    holdNextTransaction({mode,reads}={}){
      holdStartRules.push({mode,keys:reads?[...reads]:null});
    },
    hasHeldWrite:()=>!!held&&held.phase==='commit',
    hasHeldTransaction:()=>!!held&&held.phase==='start',
    releaseHeldWrite(){
      assert.ok(held&&held.phase==='commit','no held write');
      const current=held; held=null; current.release();
    },
    releaseHeldTransaction(){
      assert.ok(held&&held.phase==='start','no held transaction');
      const current=held; held=null; current.release();
    },
    fixtureWrite({puts={},deletes=[]}={}){
      return new Promise((resolveWrite,rejectWrite)=>{
        const tx=db.transaction('bundles','readwrite'),store=tx.objectStore('bundles');
        for(const key of deletes) store.delete(key);
        for(const [key,value] of Object.entries(puts)) store.put(value,key);
        tx.oncomplete=()=>resolveWrite();
        tx.onerror=()=>rejectWrite(tx.error||new Error('fixture write failed'));
        tx.onabort=()=>rejectWrite(tx.error||new Error('fixture write aborted'));
      });
    },
    getCount:key=>getCounts.get(key)||0,
    getOrder:()=>getOrder.slice(),
    resetGetCounts(){ getCounts.clear(); getOrder.length=0; },
    commits:()=>writeCommits
  };
}

function makeHarness({records={},storage={},fetchImpl,cryptoImpl,navigatorImpl,
                      database:sharedDatabase,localStorage:sharedStorage}={}){
  const database=sharedDatabase||makeDatabase(records);
  const localStorage=sharedStorage||makeLocalStorage(storage);
  const navigation=[];
  const location={protocol:'http:',hostname:'127.0.0.1',href:'http://127.0.0.1/',
    replace(href){ this.href=String(href); navigation.push({kind:'replace',href:this.href}); },
    reload(){ navigation.push({kind:'reload',href:this.href}); }};
  const document={
    getElementById(){ return null; },
    createElement(){ throw new Error('unexpected DOM creation in updater contract'); },
    body:{classList:{add(){}}}
  };
  const context=vm.createContext({
    console:{log(){},warn(){},error(){}},
    window:{},document,localStorage,indexedDB:database.indexedDB,
    location,
    navigator:navigatorImpl||{},URL,AbortController,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,
    performance,setTimeout,clearTimeout,queueMicrotask,
    fetch:fetchImpl||(()=>{ throw new Error('unexpected fetch'); }),
    crypto:cryptoImpl||{subtle:{digest:async(algorithm,bytes)=>{
      assert.equal(String(algorithm).toUpperCase(),'SHA-256');
      return digestBytes(bytes);
    }}}
  });
  vm.runInContext(updaterSource+`
    ;globalThis.__stage8Updater={UPD,updDownload,updRetryDownload,updCancel,updButton,
      updSetChannel,updCommitPending,updCommitApply,updCheck,updApply,updRollback,
      updAcquireSharedOperation,updReleaseSharedOperation,updCommitRollback,
      updRefreshSharedOperation,updPreparePrevious,updClearPreviousOwned,
      updGetBundleMeta,updPendingIdentity,updRunningIdentity,updBundleMeta,updIdentityRootsMatch,
      updTransferPlan,updKindForFiles,updKind,updIsPatch,updPendingForChannel,
      updNormalizeManifest,updValidManifest,updValidChunks,updChunkTable,
      updManifestFingerprint,updRuntimeFingerprint,updValidateManifestRoots,updManifestSameRelease,
      updTransferIdentity,updStoragePreflight,updDownloadArtifact,
      updTransferMaintenance,UPD_TRANSFER_STALE_MS,
      updTransferStoredBytes,updTransferStoredSize,updTransferFileKey,
      setEndpoint(url){UPDATE_URL=url;updResolved=true;},
      setLoadManifest(fn){updLoadManifest=fn;},
      setResolveEndpoint(fn){updResolveEndpoint=fn;}};`,context,{filename:'src/updater.js'});
  const api=context.__stage8Updater;
  api.reset=manifest=>{
    Object.assign(api.UPD,{state:'available',manifest,pct:0,got:0,total:0,rate:0,
      err:null,abort:null,feed:[],fileIdx:-1,downloadRun:0,retryDownload:false});
  };
  return {api,context,database,localStorage,navigation};
}

function manifest(version,files,extra={}){
  return Object.assign({version,notes:'Stage 8 updater transaction',schema:1,
    channel:'stable',severity:'recommended',kind:'full',base:'https://updates/',
    files:files.map(({bytes,text,...entry})=>entry)},extra);
}
function rootedManifest(harness,version,files,full,extra={}){
  const entries=full.map(({bytes,text,...entry})=>entry);
  const m=manifest(version,files,Object.assign({schema:3,category:'system',full:entries},extra));
  m.payloadRoot=digestText(harness.api.updManifestFingerprint(m.files));
  m.fullRoot=digestText(harness.api.updManifestFingerprint(m.full));
  m.runtimeRoot=digestText(harness.api.updRuntimeFingerprint(m.full));
  m.manifestRoot=digestText([
    'schema='+m.schema,'channel='+m.channel,'version='+m.version,
    'kind='+(m.kind||''),'category='+(m.category||''),'patchFrom='+(m.patchFrom||''),
    'payload='+m.payloadRoot,'full='+m.fullRoot,'runtime='+m.runtimeRoot
  ].join('\n'));
  return m;
}
function bundleMeta(value){
  return {version:value.version,channel:value.channel||'stable',at:value.at,
    notes:value.notes||'',severity:value.severity||'recommended',
    kind:value.kind||'full',category:value.category||'',
    patchedFrom:value.patchedFrom||'',manifestRoot:value.manifestRoot||'',
    payloadRoot:value.payloadRoot||'',targetRoot:value.targetRoot||'',
    sourcePayloadRoot:value.sourcePayloadRoot||'',fullRoot:value.fullRoot||'',
    runtimeRoot:value.runtimeRoot||'',manifestKind:value.manifestKind||'',
    manifestCategory:value.manifestCategory||'',
    manifestPatchFrom:value.manifestPatchFrom||'',storage:value.storage||''};
}
function rollbackRef(key,value){
  return {key,version:value.version,channel:value.channel||'stable',at:value.at,
    manifestRoot:value.manifestRoot||'',targetRoot:value.targetRoot||'',
    runtimeRoot:value.runtimeRoot||''};
}

/* Interrupted/legacy publishers may leave an explicit empty files[] beside a
   complete recovery list. Normalize that shape, but reject duplicated paths so
   one downloaded object cannot overwrite another during staging. */
{
  const h=makeHarness();
  const a=file('a.js','a'),b=file('b.js','b');
  const entries=[a,b].map(({bytes,text,...entry})=>entry);
  const normalized=clone(h.api.updNormalizeManifest({version:'2.0.0',files:[],full:entries}));
  assert.deepEqual(normalized.files,entries,'empty files[] masked complete full[] recovery');
  assert.equal(h.api.updValidManifest(normalized),true,'normalized full[] recovery was rejected');
  const duplicate=clone(h.api.updNormalizeManifest({version:'2.0.0',files:[entries[0],entries[0]]}));
  assert.equal(h.api.updValidManifest(duplicate),false,'duplicate manifest paths were accepted');
}

/* Schema 3 roots bind ordered executable bytes, full recovery bytes and the
   transport/category contract. A syntactically valid reused root cannot rename
   different bytes or reorder classic scripts under one staged identity. */
{
  const h=makeHarness(),rootHash='0'.repeat(64);
  const a=chunkedFile('a.js','abcdefgh',4,'https://immutable/a.js');
  const b=chunkedFile('b.js','ijklmnop',4,'https://immutable/b.js');
  const entries=[a,b].map(({bytes,text,...entry})=>entry);
  const m=manifest('2.1.0',[a,b],{schema:3,category:'system',full:clone(entries),
    payloadRoot:rootHash,fullRoot:rootHash,manifestRoot:rootHash});
  m.payloadRoot=digestText(h.api.updManifestFingerprint(m.files));
  m.fullRoot=digestText(h.api.updManifestFingerprint(m.full));
  m.runtimeRoot=digestText(h.api.updRuntimeFingerprint(m.full));
  m.manifestRoot=digestText([
    'schema='+m.schema,'channel='+m.channel,'version='+m.version,
    'kind='+m.kind,'category='+m.category,'patchFrom=',
    'payload='+m.payloadRoot,'full='+m.fullRoot,'runtime='+m.runtimeRoot
  ].join('\n'));
  assert.equal(await h.api.updValidateManifestRoots(m),true,'valid schema-3 roots were rejected');
  const reordered=clone(m); reordered.files.reverse();
  assert.equal(await h.api.updValidateManifestRoots(reordered),false,
               'manifest root did not bind executable order');
  assert.equal(h.api.updManifestSameRelease(m,{...clone(m),manifestRoot:'e'.repeat(64)}),false,
               'same-version mirror equivocation was accepted');
  const changedChunk=clone(m); changedChunk.files[0].chunks[0].sha256='f'.repeat(64);
  assert.equal(await h.api.updValidateManifestRoots(changedChunk),false,
               'manifest root did not bind the range contract');
  const recategorized=clone(m); recategorized.category='hotfix';
  assert.equal(await h.api.updValidateManifestRoots(recategorized),false,
               'manifest root did not bind the player-facing category');
  const legacyA=manifest('2.0.9',[a,b]),legacyB=manifest('2.0.9',[b,a]);
  assert.equal(h.api.updManifestSameRelease(legacyA,legacyB),false,
               'legacy mirror order equivocation was accepted');
}
function setRunning(harness,value){
  harness.context.window.__MASSFRONT_PATCHED=value.version;
  harness.context.window.__MASSFRONT_PATCH_CHANNEL=value.channel||'stable';
  harness.context.window.__MASSFRONT_PATCH_AT=value.at;
  harness.context.window.__MASSFRONT_PATCH_MANIFEST_ROOT=value.manifestRoot||'';
  harness.context.window.__MASSFRONT_PATCH_TARGET_ROOT=value.targetRoot||'';
  harness.context.window.__MASSFRONT_PATCH_RUNTIME_ROOT=value.runtimeRoot||'';
}
function unchanged(harness,before,label){
  const authority=records=>Object.fromEntries(Object.entries(records)
    .filter(([key])=>!key.startsWith('transfer-v1:')));
  /* Interrupted large transfers intentionally retain only content-addressed
     journals/ranges. They must never mutate active/pending/rollback authority
     or player-facing notes until the final atomic stage succeeds. */
  assert.deepEqual(authority(harness.database.snapshot()),authority(before.records),
    label+' changed durable update authority');
  assert.deepEqual(harness.localStorage.snapshot(),before.storage,label+' changed local storage');
}

/* Init's metadata getter pays for a legacy payload read once, backfills the
   small identity in the same RW transaction, then avoids that payload forever. */
{
  const legacy={version:'2.5.0',channel:'preview',at:250,notes:'legacy',
    severity:'optional',kind:'patch',patchedFrom:'2.4.0',order:['legacy.js'],
    files:{'legacy.js':'large legacy payload'}};
  const h=makeHarness({records:{pending:legacy}});
  assert.deepEqual(clone(await h.api.updGetBundleMeta('pending')),bundleMeta(legacy));
  assert.equal(h.database.getCount('pendingMeta'),1);
  assert.equal(h.database.getCount('pending'),1,
               'first legacy metadata lookup did not read the payload exactly once');
  assert.deepEqual(h.database.get('pendingMeta'),bundleMeta(legacy),
                   'legacy metadata lookup did not persist its backfill');
  assert.deepEqual(clone(await h.api.updGetBundleMeta('pending')),bundleMeta(legacy));
  assert.equal(h.database.getCount('pendingMeta'),2);
  assert.equal(h.database.getCount('pending'),1,
               'second metadata lookup deserialized the legacy payload again');
  assert.equal(h.database.commits(),1,'metadata backfill committed more than once');
}

/* Staging arbitrates on pendingMeta when it exists and must not deserialize the
   payload. A legacy record falls back to one payload read and preserves the
   same conflict without opportunistically mutating its records. */
{
  const existing={version:'31.0.0',channel:'stable',at:3100,order:['old.js'],
                  files:{'old.js':'existing payload'}};
  const incoming={version:'30.0.0',channel:'stable',at:3000,order:['new.js'],
                  files:{'new.js':'incoming payload'}};
  const metadata=makeHarness({records:{pending:existing,pendingMeta:bundleMeta(existing)},
                              storage:{mf_update_channel:'stable'}});
  const metadataBefore=metadata.database.snapshot();
  await assert.rejects(()=>metadata.api.updCommitPending(incoming),
    error=>error&&error.code==='MF_UPDATE_PENDING_SUPERSEDED');
  assert.equal(metadata.database.getCount('pendingMeta'),1);
  assert.equal(metadata.database.getCount('pending'),0,
               'metadata arbitration unnecessarily read the pending payload');
  assert.deepEqual(metadata.database.snapshot(),metadataBefore);

  const legacy=makeHarness({records:{pending:existing},
                            storage:{mf_update_channel:'stable'}});
  const legacyBefore=legacy.database.snapshot();
  await assert.rejects(()=>legacy.api.updCommitPending(incoming),
    error=>error&&error.code==='MF_UPDATE_PENDING_SUPERSEDED');
  assert.equal(legacy.database.getCount('pendingMeta'),1);
  assert.equal(legacy.database.getCount('pending'),1,
               'legacy staging arbitration did not read pending exactly once');
  assert.deepEqual(legacy.database.snapshot(),legacyBefore,
                   'legacy staging conflict mutated the preserved candidate');
}

/* Check ownership begins before endpoint/manifest awaits. A fresh packaged
   client is told the full-fallback size and classification, not the tiny delta
   it cannot apply. */
{
  const delta=file('delta.js','delta');
  const full={path:'massfront.html',size:25*1024*1024,sha256:'a'.repeat(64),
              url:'https://updates.example/full/massfront.html'};
  const offered=manifest('9.0.0',[delta],{kind:'patch',patchFrom:'8.0.0',full});
  const manifestGate=deferred(); let loads=0;
  const h=makeHarness();
  h.api.setEndpoint('https://updates.example/update.json');
  h.api.setLoadManifest(async()=>{ loads++; return manifestGate.promise; });
  const check=h.api.updCheck(false);
  assert.equal(h.api.UPD.state,'checking','check did not claim state synchronously');
  h.api.updCheck(false);
  assert.equal(await h.api.updSetChannel('preview'),false,
               'channel changed while manifest check was unresolved');
  manifestGate.resolve({manifest:offered,source:'fixture'});
  await check;
  assert.equal(loads,1,'overlapping checks both loaded a manifest');
  assert.equal(h.api.UPD.state,'available');
  assert.equal(h.api.UPD.offerFallback,true);
  assert.equal(h.api.UPD.offerBytes,full.size);
  assert.equal(h.api.UPD.offerKind,'overhaul');
}

/* Player-facing category is independent of patch/full transport and transfer
   size. Legacy manifests still get their previous safe size inference. */
{
  const h=makeHarness();
  const large={path:'large.js',size:21*1024*1024,sha256:'a'.repeat(64),
               url:'https://updates.example/large.js'};
  assert.equal(h.api.updKind(manifest('9.1.0',[large],{kind:'patch',
    patchFrom:'9.0.0',category:'hotfix'}),[large]),'hotfix');
  assert.equal(h.api.updKind(manifest('9.1.0',[large],{kind:'full',
    category:'system'}),[large]),'system');
  assert.equal(h.api.updKind(manifest('9.1.0',[large],{kind:'content'}),[large]),
    'content','legacy display kind stopped working');
  assert.equal(h.api.updKind(manifest('9.1.0',[large],{kind:'patch',
    patchFrom:'9.0.0'}),[large]),'overhaul','legacy patch lost size inference');
  const unknown=h.api.updNormalizeManifest(manifest('9.1.0',[large],{
    kind:'patch',patchFrom:'9.0.0',category:'made-up'}));
  assert.equal(unknown.category,'','unknown category was exposed to the UI');
  assert.equal(h.api.updKind(unknown,[large]),'overhaul');
}

/* The offer and live download must both retain HOTFIX for a declared large
   delta instead of silently reverting to the size-derived OVERHAUL label. */
{
  const large={path:'large.js',size:21*1024*1024,sha256:'b'.repeat(64),
               url:'https://updates.example/large.js'};
  const offered=manifest('9.1.0',[large],{kind:'patch',patchFrom:'9.0.0',
    category:'hotfix',full:[large]});
  const fetchGate=deferred();
  const h=makeHarness({records:{active:{version:'9.0.0',order:['large.js'],
    files:{'large.js':'old'}}},fetchImpl:async()=>{
      await fetchGate.promise; throw new Error('cancelled fixture transfer');
    }});
  h.api.setEndpoint('https://updates.example/update.json');
  h.api.setLoadManifest(async()=>({manifest:offered,source:'fixture'}));
  await h.api.updCheck(false);
  assert.equal(h.api.UPD.state,'available');
  assert.equal(h.api.UPD.offerFallback,false);
  assert.equal(h.api.UPD.offerBytes,large.size);
  assert.equal(h.api.UPD.offerKind,'hotfix');
  assert.equal(h.api.updIsPatch(offered),true,'category changed patch transport');
  const transfer=h.api.updDownload();
  await waitFor(()=>h.api.UPD.transferKind==='hotfix','declared transfer category');
  h.api.updCancel(); fetchGate.resolve(); await transfer;
  assert.equal(h.api.UPD.state,'available');
}

/* Channel resolution has its own synchronous lock; a second channel selection
   cannot replace intent while the first local endpoint lookup is pending. */
{
  const gate=deferred(),h=makeHarness({storage:{mf_update_channel:'stable'}});
  h.api.setResolveEndpoint(async()=>{ await gate.promise; return 'fixture'; });
  const change=h.api.updSetChannel('preview');
  assert.equal(h.api.UPD.state,'channeling');
  assert.equal(await h.api.updSetChannel('stable'),false,
               'second channel selection overtook unresolved first selection');
  gate.resolve();
  await change;
  assert.equal(h.api.UPD.state,'idle');
  assert.equal(h.localStorage.getItem('mf_update_channel'),'preview');
}

/* Mid-stream cancellation must not touch any durable update record. Channel
   selection is refused until the aborted reader has actually relinquished the
   transfer token. */
{
  const entry=file('a.js','A'.repeat(256));
  let secondRead=false;
  const baseResponse=response(entry,{stream:true,blockAfterFirst:true});
  const fetchImpl=async(url,{signal})=>{
    const built=baseResponse(signal);
    const reader=built.body.getReader();
    built.body.getReader=()=>({read(){
      const pending=reader.read();
      if(!secondRead) pending.then(result=>{ if(!result.done) secondRead=true; });
      else secondRead=true;
      return pending;
    }});
    return built;
  };
  const h=makeHarness({
    records:{active:{version:'1.0.0',files:{'old.js':'old'}},
      previous:{version:'0.9.0'},pending:{version:'kept'},
      applyFailure:{version:'broken'}},
    storage:{mf_update_channel:'stable',mf_update_notes:'[{"version":"kept"}]'},
    fetchImpl
  });
  h.api.reset(manifest('2.0.0',[entry]));
  const before={records:h.database.snapshot(),storage:h.localStorage.snapshot()};
  const run=h.api.updDownload();
  await waitFor(()=>h.api.UPD.got>0,'first streamed updater chunk');
  await h.api.updRollback();
  assert.equal(h.api.UPD.state,'downloading','rollback stole an active transfer');
  assert.equal(await h.api.updSetChannel('preview'),false,
               'channel changed during an active transfer');
  assert.equal(h.localStorage.getItem('mf_update_channel'),'stable');
  h.api.updCancel();
  await run;
  assert.equal(h.api.UPD.state,'available');
  assert.equal(h.api.UPD.downloadRun,0);
  unchanged(h,before,'mid-stream cancellation');
}

/* Cancellation while SHA-256 is pending is the late race which previously
   staged a payload after the player pressed Cancel. */
{
  const patch=file('a.js','new-a'.repeat(80));
  const hashGate=deferred(); let digestStarted=false;
  const h=makeHarness({
    records:{active:{version:'1.5.0',order:['a.js','b.js'],
      files:{'a.js':'old-a','b.js':'old-b'}},pending:{version:'kept'},
      applyFailure:{version:'broken'}},
    storage:{mf_update_notes:'[{"version":"kept"}]'},
    fetchImpl:async(url,{signal})=>response(patch)(signal),
    cryptoImpl:{subtle:{digest:async(algorithm,bytes)=>{
      digestStarted=true;
      await hashGate.promise;
      return digestBytes(bytes);
    }}}
  });
  h.api.reset(manifest('1.6.0',[patch],{kind:'patch',patchFrom:'1.5.0'}));
  const before={records:h.database.snapshot(),storage:h.localStorage.snapshot()};
  const run=h.api.updDownload();
  await waitFor(()=>digestStarted,'deferred updater hash');
  h.api.updCancel();
  hashGate.resolve();
  await run;
  assert.equal(h.api.UPD.state,'available');
  unchanged(h,before,'late hash cancellation');
}

/* A transient failure on the second file is retried inside the same bounded
   transfer. The verified first file is never fetched again, the Range request
   keeps one cancellation owner, and the release stages exactly once. */
{
  const a=file('a.js','alpha'.repeat(90)),b=file('b.js','beta'.repeat(90));
  const paths=[],signals=[]; let call=0;
  const h=makeHarness({
    records:{active:{version:'1.0.0',files:{'base.js':'base'}},
      previous:{version:'0.9.0'},pending:{version:'kept',files:{kept:'yes'}},
      applyFailure:{version:'broken',reason:'old failure'}},
    storage:{mf_update_notes:'[{"version":"kept","notes":"old"}]'},
    fetchImpl:async(url,{signal})=>{
      paths.push(new URL(url).pathname.split('/').pop()); signals.push(signal);
      const index=call++;
      if(index===1) throw new Error('injected network loss');
      return response(index===0?a:b)(signal);
    }
  });
  h.api.reset(manifest('2.0.0',[a,b]));
  const before={records:h.database.snapshot(),storage:h.localStorage.snapshot()};
  await h.api.updDownload();
  assert.equal(h.api.UPD.state,'ready');
  assert.equal(h.api.UPD.retryDownload,false);
  assert.deepEqual(paths,['a.js','b.js','b.js'],
                   'range retry fetched an already verified first file');
  assert.equal(signals[1],signals[2],'range retry lost its cancellation owner');
  assert.equal(h.database.get('pending').version,'2.0.0','retry did not stage the release');
  assert.deepEqual(h.database.get('active'),before.records.active);
  assert.deepEqual(h.database.get('previous'),before.records.previous);
  assert.equal(h.database.get('applyFailure'),undefined);
  const pending=h.database.get('pending');
  assert.equal(pending.version,'2.0.0');
  assert.deepEqual(pending.order,['a.js','b.js']);
  assert.deepEqual(pending.files,{'a.js':a.text,'b.js':b.text});
  assert.deepEqual(h.database.get('pendingMeta'),bundleMeta(pending),
                   'staging did not atomically publish matching pending metadata');
  assert.match(h.localStorage.getItem('mf_update_notes'),/2\.0\.0/,
               'successful staging did not publish its notes');
}

/* RETRY DOWNLOAD refreshes the manifest before touching the network payload.
   Repointing URLs under the same signed/rooted identity resumes its persisted
   first range from IndexedDB; it never goes back to the failed host. */
{
  const entry=chunkedFile('repointed.js','abcdefghijkl',4,
    'https://failed-delivery.example/repointed.js');
  const oldRanges=[],newRanges=[];
  const h=makeHarness({fetchImpl:async(url,{headers})=>{
    const match=/bytes=(\d+)-(\d+)/.exec(headers&&headers.Range||'');
    assert.ok(match,'retry-refresh transfer omitted Range');
    const start=Number(match[1]),end=Number(match[2]),host=new URL(url).host;
    if(host==='failed-delivery.example'){
      oldRanges.push(start);
      if(start===4) throw new Error('failed delivery host');
    }else if(host==='repaired-delivery.example') newRanges.push(start);
    else throw new Error('unexpected artifact host '+host);
    return rangedResponse(entry,start,end);
  }});
  const failed=rootedManifest(h,'70.0.0',[entry],[entry]);
  h.api.reset(failed);
  await h.api.updDownload();
  assert.equal(h.api.UPD.state,'error');
  assert.equal(h.api.UPD.retryDownload,true);
  assert.deepEqual(oldRanges,[0,4,4,4],'failed range did not exhaust its bounded attempts');
  assert.ok(Object.keys(h.database.snapshot()).some(key=>key.includes(':chunk:0:repointed.js')),
            'verified first range was not persisted for retry refresh');

  const refreshed=clone(failed);
  refreshed.files[0].url='https://repaired-delivery.example/repointed.js';
  refreshed.full[0].url='https://repaired-delivery.example/repointed.js';
  assert.equal(h.api.updManifestSameRelease(failed,refreshed),true,
               'URL-only delivery repair changed immutable release identity');
  let manifestLoads=0;
  h.api.setEndpoint('https://manifest.example/update.json');
  h.api.setResolveEndpoint(async()=>{});
  h.api.setLoadManifest(async()=>{ manifestLoads++;return {manifest:refreshed,source:'repair'}; });
  const retry=h.api.updRetryDownload();
  assert.equal(h.api.UPD.state,'checking','retry did not claim refresh ownership synchronously');
  assert.equal(await h.api.updRetryDownload(),false,'second retry started a parallel operation');
  assert.equal(await retry,true,'same-root retry did not auto-resume');
  assert.equal(manifestLoads,1,'retry did not refresh the manifest exactly once');
  assert.equal(h.api.UPD.state,'ready');
  assert.deepEqual(newRanges,[4,8],
    'repointed retry either refetched the durable range or skipped a missing range');
  assert.deepEqual(oldRanges,[0,4,4,4],'retry reused a stale artifact URL');
  assert.equal(h.database.get('pending').files['repointed.js'],entry.text);
}

/* A different immutable identity is a new offer. The retry tap may discover
   and display it, but cannot serve as download consent for those new bytes. */
{
  const oldEntry=chunkedFile('old.js','old-release',4,'https://old.example/old.js');
  const nextEntry=chunkedFile('next.js','next-release',4,'https://new.example/next.js');
  let artifactFetches=0;
  const h=makeHarness({fetchImpl:async()=>{ artifactFetches++;throw new Error('must not download'); }});
  const failed=rootedManifest(h,'71.0.0',[oldEntry],[oldEntry]);
  const next=rootedManifest(h,'72.0.0',[nextEntry],[nextEntry]);
  h.api.reset(failed); h.api.UPD.state='error'; h.api.UPD.retryDownload=true;
  h.api.setEndpoint('https://manifest.example/update.json');
  h.api.setResolveEndpoint(async()=>{});
  h.api.setLoadManifest(async()=>({manifest:next,source:'new release'}));
  assert.equal(await h.api.updRetryDownload(),false,
               'different release identity was downloaded without new consent');
  assert.equal(h.api.UPD.state,'available');
  assert.equal(h.api.UPD.manifest.version,'72.0.0');
  assert.equal(artifactFetches,0,'new release payload started during retry refresh');
}

/* A wrong hash is a retryable download failure, never a partial stage. */
{
  const bad=file('bad.js','corrupt'.repeat(70));
  const listed={...bad,sha256:'0'.repeat(64)};
  const h=makeHarness({
    records:{pending:{version:'kept'},applyFailure:{version:'broken'}},
    storage:{mf_update_notes:'[{"version":"kept"}]'},
    fetchImpl:async(url,{signal})=>response(bad)(signal)
  });
  h.api.reset(manifest('2.1.0',[listed]));
  const before={records:h.database.snapshot(),storage:h.localStorage.snapshot()};
  await h.api.updDownload();
  assert.equal(h.api.UPD.state,'error');
  assert.match(h.api.UPD.err,/integrity check failed/);
  assert.equal(h.api.UPD.retryDownload,true);
  unchanged(h,before,'hash rejection');
}

/* A host that streams substantially more than the signed manifest declared is
   cut off while reading, before the excess response can accumulate in memory. */
{
  const actual=file('oversized.js','x'.repeat(2048));
  const listed={...actual,size:32};
  const h=makeHarness({
    records:{pending:{version:'kept'}},
    fetchImpl:async(url,{signal})=>response(actual,{stream:true})(signal)
  });
  h.api.reset(manifest('2.1.1',[listed]));
  const before={records:h.database.snapshot(),storage:h.localStorage.snapshot()};
  await h.api.updDownload();
  assert.equal(h.api.UPD.state,'error');
  assert.match(h.api.UPD.err,/exceeded its declared size/);
  unchanged(h,before,'oversized response rejection');
}

/* A delta reads the real active record, cannot be double-started before that
   read settles, and preserves untouched files and order in the staged copy. */
{
  const patch=file('a.js','patched-a'.repeat(50)); let fetches=0;
  const active={version:'3.0.0',order:['a.js','b.js'],
                files:{'a.js':'old-a','b.js':'old-b'}};
  const h=makeHarness({
    records:{active,previous:{version:'2.9.0'},applyFailure:{version:'broken'}},
    fetchImpl:async(url,{signal})=>{ fetches++; return response(patch)(signal); }
  });
  h.api.reset(manifest('3.1.0',[patch],{kind:'patch',patchFrom:'3.0.0'}));
  const first=h.api.updDownload(),second=h.api.updDownload();
  await Promise.all([first,second]);
  assert.equal(fetches,1,'double activation started a second delta transfer');
  const pending=h.database.get('pending');
  assert.equal(pending.kind,'patch');
  assert.equal(pending.patchedFrom,'3.0.0');
  assert.deepEqual(pending.order,['a.js','b.js']);
  assert.deepEqual(pending.files,{'a.js':patch.text,'b.js':'old-b'});
  assert.deepEqual(h.database.get('pendingMeta'),bundleMeta(pending),
                   'delta staging omitted its identity metadata');
  assert.deepEqual(h.database.get('active'),active,'delta mutated the active base');
}

/* Schema-3 patching assembles the exact signed full[] inventory. This covers a
   reordered target, removal of a stale prior path and addition of a new path,
   while retaining the original manifest contract beside the selected payload. */
{
  const oldA=file('a.js','old-a','https://immutable/a.js');
  const newB=file('b.js','new-b','https://immutable/b.js');
  const added=file('added.js','added','https://immutable/added.js');
  const active={version:'73.0.0',channel:'stable',at:7300,
    order:['a.js','b.js','obsolete.js'],
    files:{'a.js':oldA.text,'b.js':'old-b','obsolete.js':'remove-me'},storage:'bundle-v1'};
  const h=makeHarness({records:{active,activeMeta:bundleMeta(active)},fetchImpl:async(url,{signal})=>{
    const clean=String(url).split('?')[0];
    const entry=clean===newB.url?newB:clean===added.url?added:null;
    assert.ok(entry,'adjacent patch fetched outside its delta: '+url);
    return response(entry)(signal);
  }});
  const m=rootedManifest(h,'73.1.0',[added,newB],[newB,oldA,added],
    {kind:'patch',patchFrom:'73.0.0',category:'system'});
  assert.equal(await h.api.updValidateManifestRoots(m),true,'patch fixture roots are invalid');
  h.api.reset(m);
  await h.api.updDownload();
  assert.equal(h.api.UPD.state,'ready',h.api.UPD.err||'adjacent schema-3 patch failed');
  const pending=h.database.get('pending');
  assert.equal(pending.kind,'patch');
  assert.equal(pending.patchedFrom,'73.0.0');
  assert.deepEqual(pending.order,['b.js','a.js','added.js'],
                   'adjacent patch did not adopt signed full[] order');
  assert.deepEqual(pending.files,{'b.js':newB.text,'a.js':oldA.text,'added.js':added.text},
                   'adjacent patch retained a removed path or omitted an added one');
  assert.equal(pending.manifestRoot,m.manifestRoot);
  assert.equal(pending.payloadRoot,m.payloadRoot);
  assert.equal(pending.sourcePayloadRoot,m.payloadRoot);
  assert.equal(pending.fullRoot,m.fullRoot);
  assert.equal(pending.targetRoot,m.fullRoot);
  assert.equal(pending.runtimeRoot,m.runtimeRoot);
  assert.equal(pending.manifestKind,'patch');
  assert.equal(pending.manifestCategory,'system');
  assert.equal(pending.manifestPatchFrom,'73.0.0');
  assert.deepEqual(h.database.get('pendingMeta'),bundleMeta(pending),
                   'schema-3 patch metadata lost its signed source contract');
  assert.equal(h.api.updIdentityRootsMatch(pending,{...pending,runtimeRoot:'f'.repeat(64)}),false,
               'exact rooted identity ignored a mismatched runtimeRoot');

  const stale={...active,files:{...active.files,'a.js':'stale-a'}};
  const staleHarness=makeHarness({records:{active:stale,activeMeta:bundleMeta(stale)}});
  const stalePlan=await staleHarness.api.updTransferPlan(m);
  assert.equal(stalePlan.fallback,true,'stale unchanged base bytes did not force full fallback');
  assert.equal(stalePlan.patching,false);
  assert.deepEqual(stalePlan.files.map(entry=>entry.path),['b.js','a.js','added.js']);

  const offBase=makeHarness({records:{active:{...active,version:'72.9.0'}},
    fetchImpl:async(url,{signal})=>{
      const clean=String(url).split('?')[0];
      const entry=clean===newB.url?newB:clean===oldA.url?oldA:clean===added.url?added:null;
      assert.ok(entry,'full fallback fetched an unknown target: '+url);
      return response(entry)(signal);
    }});
  offBase.api.reset(m);
  await offBase.api.updDownload();
  assert.equal(offBase.api.UPD.state,'ready',offBase.api.UPD.err||'schema-3 full fallback failed');
  const fallback=offBase.database.get('pending');
  assert.equal(fallback.kind,'full');
  assert.equal(fallback.patchedFrom,'');
  assert.deepEqual(fallback.order,['b.js','a.js','added.js']);
  assert.equal(fallback.payloadRoot,m.fullRoot,
               'off-base fallback did not select the full payload root');
  assert.equal(fallback.sourcePayloadRoot,m.payloadRoot,
               'off-base fallback lost the source manifest payload root');
  assert.equal(fallback.fullRoot,m.fullRoot);
  assert.equal(fallback.targetRoot,m.fullRoot);
  assert.equal(fallback.runtimeRoot,m.runtimeRoot);
  assert.equal(fallback.manifestKind,'patch');
  assert.equal(fallback.manifestCategory,'system');
  assert.equal(fallback.manifestPatchFrom,'73.0.0');
  assert.deepEqual(offBase.database.get('pendingMeta'),bundleMeta(fallback));
}

/* The transition to staging removes Cancel before the atomic transaction. A
   failed transaction changes neither key nor notes; a completed one replaces
   pending and clears applyFailure together. */
{
  const entry=file('atomic.js','atomic'.repeat(80));
  const initialRecords={pending:{version:'kept',files:{kept:'yes'}},
                        applyFailure:{version:'broken',reason:'old'}};
  const initialStorage={mf_update_channel:'stable',
                        mf_update_notes:'[{"version":"kept"}]'};
  const failed=makeHarness({records:initialRecords,storage:initialStorage,
    fetchImpl:async(url,{signal})=>response(entry)(signal)});
  /* IndexedDB itself uses AbortError for quota/transaction aborts. That is a
     storage failure here, not evidence that the player pressed Cancel. */
  failed.database.failWriteKeys(['pending','pendingMeta'],'AbortError');
  failed.api.reset(manifest('4.0.0',[entry]));
  const before={records:failed.database.snapshot(),storage:failed.localStorage.snapshot()};
  await failed.api.updDownload();
  assert.equal(failed.api.UPD.state,'error');
  assert.equal(failed.api.UPD.retryDownload,true);
  unchanged(failed,before,'failed atomic staging');

  const held=makeHarness({records:initialRecords,storage:initialStorage,
    fetchImpl:async(url,{signal})=>response(entry)(signal)});
  held.database.holdWriteKeys(['pending','pendingMeta']);
  held.api.reset(manifest('4.0.0',[entry]));
  const run=held.api.updDownload();
  await waitFor(()=>held.api.UPD.state==='staging'&&held.database.hasHeldWrite(),
                'held atomic staging transaction');
  assert.equal(held.api.UPD.abort,null,'Cancel remained armed during atomic staging');
  held.api.updCancel();
  assert.equal(await held.api.updSetChannel('preview'),false,
               'channel changed during atomic staging');
  unchanged(held,{records:initialRecords,storage:initialStorage},
            'held atomic staging transaction');
  held.database.releaseHeldWrite();
  await run;
  assert.equal(held.api.UPD.state,'ready');
  const committed=held.database.get('pending');
  assert.equal(committed.version,'4.0.0');
  assert.deepEqual(held.database.get('pendingMeta'),bundleMeta(committed),
                   'atomic staging committed payload without metadata');
  assert.equal(held.database.get('applyFailure'),undefined);
}

/* Apply refuses a hidden pending bundle from a different selected channel. */
{
  const pending={version:'5.0.0',channel:'preview',at:500,order:['a.js'],
                 files:{'a.js':'preview'}};
  const h=makeHarness({records:{pending,pendingMeta:bundleMeta(pending),
                       active:{version:'4.0.0',files:{'a.js':'stable'}}},
                       storage:{mf_update_channel:'stable'}});
  h.api.reset({version:'5.0.0',channel:'preview',files:[]});
  h.api.UPD.state='ready';
  h.api.UPD.readyIdentity=h.api.updPendingIdentity(pending);
  const before=h.database.snapshot();
  await h.api.updApply();
  assert.equal(h.api.UPD.state,'error');
  assert.match(h.api.UPD.err,/different channel/);
  assert.deepEqual(h.database.snapshot(),before,'mismatched pending bundle was applied');
}

/* A verified but older document cannot overwrite a newer pending candidate
   staged by another document while this one was downloading. */
{
  const entry=file('old.js','older'.repeat(80));
  const newer={version:'7.0.0',channel:'stable',order:['new.js'],files:{'new.js':'newer'}};
  const failure={version:'6.5.0',reason:'keep until a valid replacement commits'};
  const h=makeHarness({records:{pending:newer,applyFailure:failure},
    storage:{mf_update_notes:'[{"version":"7.0.0"}]'},
    fetchImpl:async(url,{signal})=>response(entry)(signal)});
  h.api.reset(manifest('6.0.0',[entry]));
  const before={records:h.database.snapshot(),storage:h.localStorage.snapshot()};
  await h.api.updDownload();
  assert.equal(h.api.UPD.state,'error');
  assert.match(h.api.UPD.err,/newer update is already staged/);
  assert.equal(h.api.UPD.retryDownload,false);
  unchanged(h,before,'cross-document newer pending guard');
}

/* A hidden pending candidate from the other channel does not permanently
   block the channel the player explicitly selected. */
{
  const entry=file('stable.js','stable'.repeat(80));
  const preview={version:'8.0.0',channel:'preview',order:['preview.js'],
                 files:{'preview.js':'preview'}};
  const h=makeHarness({records:{pending:preview,applyFailure:{version:'old'}},
    storage:{mf_update_channel:'stable'},
    fetchImpl:async(url,{signal})=>response(entry)(signal)});
  h.api.reset(manifest('7.0.0',[entry],{channel:'stable'}));
  await h.api.updDownload();
  assert.equal(h.api.UPD.state,'ready');
  assert.equal(h.database.get('pending').version,'7.0.0');
  assert.equal(h.database.get('pending').channel,'stable');
  assert.deepEqual(h.database.get('pendingMeta'),bundleMeta(h.database.get('pending')),
                   'channel replacement left stale pending metadata');
  assert.equal(h.database.get('applyFailure'),undefined);
}

/* Apply's serialized transaction rejects a stale snapshot, while probation
   prevents any later document from staging bytes that boot confirmation could
   accidentally delete. */
{
  const current={version:'9.0.0',channel:'stable',at:900,order:['new.js'],
                 files:{'new.js':'new'}};
  const stale={version:'8.0.0',channel:'stable',at:800,order:['old.js'],
               files:{'old.js':'old'}};
  const h=makeHarness({records:{pending:current,pendingMeta:bundleMeta(current),
                       active:{version:'7.0.0',files:{base:'base'}}},
                       storage:{mf_update_channel:'stable'}});
  const staleIdentity=h.api.updPendingIdentity(stale);
  const lease=await h.api.updAcquireSharedOperation('apply',staleIdentity);
  assert.deepEqual(clone(lease.target),clone(staleIdentity),
                   'Apply lease was not bound to its consented payload identity');
  await assert.rejects(()=>h.api.updCommitApply(
    stale,lease,staleIdentity),
    error=>error&&error.code==='MF_UPDATE_PENDING_CHANGED');
  await h.api.updReleaseSharedOperation(lease);
  assert.equal(h.database.get('probation'),undefined);
  assert.equal(h.database.get('active').version,'7.0.0');
  assert.deepEqual(h.database.get('pending'),current);
  assert.equal(h.database.get('operation'),undefined);

  const entry=file('blocked.js','blocked'.repeat(80));
  const blocked=makeHarness({records:{probation:{version:'9.0.0',tries:0},
      pending:current},storage:{mf_update_channel:'stable'},
    fetchImpl:async(url,{signal})=>response(entry)(signal)});
  blocked.api.reset(manifest('10.0.0',[entry],{channel:'stable'}));
  const before={records:blocked.database.snapshot(),storage:blocked.localStorage.snapshot()};
  await blocked.api.updDownload();
  assert.equal(blocked.api.UPD.state,'error');
  assert.match(blocked.api.UPD.err,/already being installed/);
  assert.equal(blocked.api.UPD.retryDownload,false);
  unchanged(blocked,before,'probation staging guard');
}

/* Failed-start probation is durable consent to let boot recovery finish. Even
   tries:1 must reject an install rather than reset its retry count or replace
   active bytes. The temporary operation lease must disappear on that refusal. */
{
  const pending={version:'13.0.0',channel:'stable',at:1300,order:['new.js'],
                 files:{'new.js':'new'}};
  const active={version:'12.0.0',channel:'stable',at:1200,order:['old.js'],
                files:{'old.js':'old'}};
  const initial={pending,pendingMeta:bundleMeta(pending),active,activeMeta:bundleMeta(active),
                 probation:{version:'12.0.0',channel:'stable',pendingAt:1200,
                            at:1201,tries:1}};
  const h=makeHarness({records:initial,storage:{mf_update_channel:'stable'}});
  h.api.reset({version:pending.version,channel:pending.channel,files:[]});
  h.api.UPD.state='ready';
  h.api.UPD.readyIdentity=h.api.updPendingIdentity(pending);
  await h.api.updApply();
  assert.equal(h.api.UPD.state,'error');
  assert.match(h.api.UPD.err,/already being installed/);
  assert.deepEqual(h.database.snapshot(),initial,
                   'probation refusal mutated durable updater records');
  assert.equal(h.database.get('operation'),undefined,
               'probation refusal leaked the Apply lease');
}

/* Consent is for the exact pending identity shown in this document. Another
   document may stage vN+1, but the old INSTALL action must then stop and ask
   the player to review it instead of silently promoting unseen bytes. */
{
  const shown={version:'20.0.0',channel:'stable',at:2000,order:['shown.js'],
               files:{'shown.js':'shown'}};
  const replacement={version:'21.0.0',channel:'stable',at:2100,order:['next.js'],
                     files:{'next.js':'next'}};
  const database=makeDatabase({pending:shown,
    active:{version:'19.0.0',order:['base.js'],files:{'base.js':'base'}}});
  const localStorage=makeLocalStorage({mf_update_channel:'stable'});
  const viewer=makeHarness({database,localStorage});
  const publisher=makeHarness({database,localStorage});
  viewer.api.reset({version:shown.version,channel:shown.channel,files:[]});
  viewer.api.UPD.state='ready';
  viewer.api.UPD.readyIdentity=viewer.api.updPendingIdentity(shown);
  await publisher.api.updCommitPending(replacement);
  assert.deepEqual(database.get('pendingMeta'),bundleMeta(replacement),
                   'cross-window replacement did not update pending metadata');
  const before=database.snapshot();
  await viewer.api.updApply();
  assert.equal(viewer.api.UPD.state,'error');
  assert.match(viewer.api.UPD.err,/changed.*review/i);
  assert.deepEqual(database.snapshot(),before,
                   'stale displayed consent silently applied replacement bytes');
  assert.equal(database.get('operation'),undefined,'stale consent leaked the Apply lease');
}

/* Recheck channel intent at the last serialized promotion boundary. The hold
   represents an older/uncooperative document writing shared localStorage while
   this document owns the IDB lease; active and probation still commit as none. */
{
  const pending={version:'22.0.0',channel:'stable',at:2200,order:['a.js'],
                 files:{'a.js':'stable'}};
  const active={version:'21.0.0',channel:'stable',at:2100,order:['base.js'],
                files:{'base.js':'base'}};
  const initial={pending,pendingMeta:bundleMeta(pending),active,activeMeta:bundleMeta(active)};
  const database=makeDatabase(initial);
  const localStorage=makeLocalStorage({mf_update_channel:'stable'});
  const h=makeHarness({database,localStorage});
  const otherWindow=makeHarness({database,localStorage});
  h.api.reset({version:pending.version,channel:pending.channel,files:[]});
  h.api.UPD.state='ready';
  h.api.UPD.readyIdentity=h.api.updPendingIdentity(pending);
  database.holdNextTransaction({mode:'readwrite',
    reads:['pendingMeta','activeMeta','probation','operation']});
  const apply=h.api.updApply();
  await waitFor(()=>database.hasHeldTransaction(),'held Apply promotion transaction');
  assert.deepEqual(database.get('operation').target,
    clone(h.api.updPendingIdentity(pending)),
    'Apply lease did not retain the exact displayed identity');
  otherWindow.localStorage.setItem('mf_update_channel','preview');
  database.releaseHeldTransaction();
  await apply;
  assert.equal(h.api.UPD.state,'error');
  assert.match(h.api.UPD.err,/channel changed/);
  assert.deepEqual(database.snapshot(),initial,
                   'channel change partially promoted the pending update');
  assert.equal(database.get('operation'),undefined,'channel rejection leaked the Apply lease');
}

/* The ordinary Apply entry point atomically promotes exactly the consented
   bundle and arms probation before releasing its cross-document lease. */
{
  const pending={version:'23.0.0',channel:'stable',at:2300,
                 manifestRoot:'a'.repeat(64),targetRoot:'b'.repeat(64),
                 runtimeRoot:'c'.repeat(64),order:['a.js'],files:{'a.js':'installed'}};
  const active={version:'22.0.0',channel:'stable',at:2200,order:['old.js'],
                files:{'old.js':'old'}};
  const oldRollback={version:'21.0.0',channel:'stable',at:2100,order:['rollback.js'],
                     files:{'rollback.js':'currently referenced'}};
  const staleInactive={version:'20.0.0',channel:'stable',at:2000,order:['stale.js'],
                       files:{'stale.js':'inactive slot debris'}};
  const legacyRollback={version:'19.0.0',channel:'stable',at:1900,order:['legacy.js'],
                        files:{'legacy.js':'legacy rollback'}};
  const initial={pending,pendingMeta:bundleMeta(pending),active,activeMeta:bundleMeta(active),
    previousRef:rollbackRef('previousA',oldRollback),
    previousA:oldRollback,previousAMeta:bundleMeta(oldRollback),
    previousB:staleInactive,previousBMeta:bundleMeta(staleInactive),
    previous:legacyRollback,previousMeta:bundleMeta(legacyRollback)};
  const failed=makeHarness({records:initial,storage:{mf_update_channel:'stable'}});
  failed.api.reset({version:pending.version,channel:pending.channel,files:[]});
  failed.api.UPD.state='ready';
  failed.api.UPD.readyIdentity=failed.api.updPendingIdentity(pending);
  failed.database.failWriteKeys(['active','activeMeta','probation'],'QuotaExceededError');
  await failed.api.updApply();
  assert.equal(failed.api.UPD.state,'applyError');
  assert.deepEqual(failed.database.snapshot(),initial,
                   'failed Apply split active payload from its metadata');

  const h=makeHarness({records:initial,
    storage:{mf_update_channel:'stable'}});
  setRunning(h,active);
  h.api.reset({version:pending.version,channel:pending.channel,files:[]});
  h.api.UPD.state='ready';
  h.api.UPD.readyIdentity=h.api.updPendingIdentity(pending);
  h.database.holdWriteKeys(['active','activeMeta','probation','previousRef']);
  const apply=h.api.updApply();
  await waitFor(()=>h.database.hasHeldWrite(),'held atomic rollback-slot flip');
  assert.deepEqual(h.database.get('previousRef'),rollbackRef('previousA',oldRollback),
                   'Apply flipped rollback pointer before promotion committed');
  assert.deepEqual(h.database.get('previousA'),oldRollback,
                   'Apply deleted the referenced rollback before promotion committed');
  assert.deepEqual(h.database.get('previousB'),active,
                   'Apply did not prepare active into the inactive rollback slot');
  assert.deepEqual(h.database.get('previousBMeta'),bundleMeta(active));
  assert.deepEqual(h.database.get('previous'),legacyRollback,
                   'Apply deleted legacy rollback before promotion committed');
  assert.deepEqual(h.database.get('active'),active,
                   'Apply exposed promoted active before pointer flip committed');
  h.database.releaseHeldWrite();
  await apply;
  assert.deepEqual(h.database.get('active'),pending);
  assert.deepEqual(h.database.get('activeMeta'),bundleMeta(pending),
                   'Apply committed active payload without matching metadata');
  assert.deepEqual(h.database.get('pending'),pending,
                   'Apply removed the retryable pending copy before boot confirmation');
  assert.deepEqual(h.database.get('pendingMeta'),bundleMeta(pending),
                   'Apply changed the consented pending metadata');
  assert.deepEqual(h.database.get('previousRef'),rollbackRef('previousB',active),
                   'Apply did not atomically flip rollback pointer to prepared slot');
  assert.deepEqual(h.database.get('previousB'),active,
                   'prepared inactive rollback slot does not contain prior active');
  assert.deepEqual(h.database.get('previousBMeta'),bundleMeta(active));
  assert.equal(h.database.get('previousA'),undefined,
               'Apply did not retire the formerly referenced rollback slot');
  assert.equal(h.database.get('previousAMeta'),undefined);
  assert.equal(h.database.get('previous'),undefined,
               'Apply did not retire the legacy rollback payload after pointer flip');
  assert.equal(h.database.get('previousMeta'),undefined);
  assert.equal(h.database.getCount('active'),1,
               'OTA-to-OTA Apply read active payload outside its one prepare step');
  assert.equal(h.database.getCount('pending'),1,
               'OTA-to-OTA Apply materialized pending payload more than once');
  assert.deepEqual(h.database.getOrder().filter(key=>key==='active'||key==='pending'),
                   ['active','pending'],
                   'Apply did not finish active preservation before materializing pending');
  assert.equal(h.database.getCount('activeMeta'),2,
               'Apply did not limit active arbitration to prepare plus promotion metadata');
  assert.equal(h.database.getCount('pendingMeta'),2,
               'Apply did not limit pending arbitration to consent plus promotion metadata');
  assert.equal(h.database.get('probation').version,pending.version);
  assert.equal(h.database.get('probation').pendingAt,pending.at);
  assert.equal(h.database.get('probation').runtimeRoot,pending.runtimeRoot,
               'Apply probation omitted the exact runtime root');
  assert.equal(h.database.get('probation').tries,0);
  assert.equal(h.database.get('operation'),undefined,'successful Apply leaked its lease');
}

/* activeMeta is an index, not the installed bytes. A torn/legacy metadata
   write must not deadlock an otherwise exact OTA-to-OTA Apply: the full active
   payload can authoritatively prove the identity this document is executing.
   The repair and rollback copy stay in the same lease-owned transaction. */
{
  const pending={version:'45.0.0',channel:'stable',at:4500,order:['new.js'],
                 files:{'new.js':'new'}};
  const active={version:'44.0.0',channel:'stable',at:4400,order:['active.js'],
                files:{'active.js':'running'}};
  const staleMeta={version:'43.0.0',channel:'stable',at:4300,order:['stale.js'],
                   files:{'stale.js':'metadata names old bytes'}};
  const h=makeHarness({records:{pending,pendingMeta:bundleMeta(pending),active,
    activeMeta:bundleMeta(staleMeta)},storage:{mf_update_channel:'stable'}});
  setRunning(h,active);
  h.api.reset({version:pending.version,channel:pending.channel,files:[]});
  h.api.UPD.state='ready';
  h.api.UPD.readyIdentity=h.api.updPendingIdentity(pending);
  await h.api.updApply();
  assert.deepEqual(h.database.get('active'),pending,
                   'stale active metadata blocked an exact active payload');
  assert.deepEqual(h.database.get('activeMeta'),bundleMeta(pending));
  assert.deepEqual(h.database.get('previousRef'),rollbackRef('previousA',active));
  assert.deepEqual(h.database.get('previousA'),active,
                   'authoritative running payload was not preserved for rollback');
  assert.deepEqual(h.database.get('previousAMeta'),bundleMeta(active),
                   'rollback copy retained the stale active metadata');
  assert.equal(h.database.get('operation'),undefined,
               'metadata repair Apply leaked its operation lease');
}

/* Metadata drift is recoverable; payload drift is not. Even when activeMeta is
   stale, a full active payload with a different staging identity must leave the
   candidate, installed bytes and rollback records untouched. */
{
  const pending={version:'48.0.0',channel:'stable',at:4800,order:['new.js'],
                 files:{'new.js':'new'}};
  const shown={version:'47.0.0',channel:'stable',at:4700};
  const different={version:'47.0.0',channel:'stable',at:4701,order:['active.js'],
                   files:{'active.js':'different active bytes'}};
  const staleMeta={version:'46.0.0',channel:'stable',at:4600};
  const initial={pending,pendingMeta:bundleMeta(pending),active:different,
                 activeMeta:staleMeta};
  const h=makeHarness({records:initial,storage:{mf_update_channel:'stable'}});
  setRunning(h,shown);
  h.api.reset({version:pending.version,channel:pending.channel,files:[]});
  h.api.UPD.state='ready';
  h.api.UPD.readyIdentity=h.api.updPendingIdentity(pending);
  await h.api.updApply();
  assert.equal(h.api.UPD.state,'error');
  assert.match(h.api.UPD.err,/installed update changed/);
  assert.deepEqual(h.database.snapshot(),initial,
                   'different active payload was accepted as metadata repair');
  assert.equal(h.database.get('previousA'),undefined);
  assert.equal(h.database.get('operation'),undefined);
}

/* Android shells through v1.33.56 predate schema-3 roots. Such a boot executes
   a fully rooted OTA record but can expose only version/channel/attempt to its
   updater, so an exact root comparison called the running payload "changed" and
   permanently refused Apply on precisely the installs that needed the update.
   A fully rooted stored record plus an exact version/channel/attempt match is
   accepted as that one immutable-shell compatibility shape. */
{
  const rootHash='a'.repeat(64);
  const pending={version:'51.0.0',channel:'stable',at:5100,order:['new.js'],
                 files:{'new.js':'successor'}};
  const active={version:'50.0.0',channel:'stable',at:5000,manifestRoot:rootHash,
                targetRoot:rootHash,runtimeRoot:rootHash,order:['active.js'],
                files:{'active.js':'running'}};
  const h=makeHarness({records:{pending,pendingMeta:bundleMeta(pending),active,
    activeMeta:bundleMeta(active)},storage:{mf_update_channel:'stable'}});
  /* A legacy shell reports no roots and never sets the descriptor flag. */
  setRunning(h,{version:active.version,channel:active.channel,at:active.at});
  h.api.reset({version:pending.version,channel:pending.channel,files:[]});
  h.api.UPD.state='ready';
  h.api.UPD.readyIdentity=h.api.updPendingIdentity(pending);
  await h.api.updApply();
  assert.notEqual(h.api.UPD.state,'error',
                  'rooted record under a legacy shell refused Apply: '+h.api.UPD.err);
  assert.deepEqual(h.database.get('active'),pending,
                   'legacy-shell Apply did not promote the verified candidate');
  assert.deepEqual(h.database.get('previousRef'),rollbackRef('previousA',active));
  assert.deepEqual(h.database.get('previousA'),active,
                   'legacy-shell Apply discarded the authoritative rollback payload');
  assert.equal(h.database.get('operation'),undefined,
               'legacy-shell Apply leaked its operation lease');
}

/* That shape is the only relaxation. A descriptor-capable boot, a running
   identity already carrying any root, a partially rooted stored record and a
   same-version rebuild under a different attempt token all still refuse to
   borrow consent from bytes this document is not running. */
for(const variant of [
  {label:'descriptor-capable boot',descriptor:true},
  {label:'partially rooted running identity',running:{manifestRoot:'b'.repeat(64)}},
  {label:'partially rooted stored record',partialStored:true},
  {label:'different attempt token',running:{at:5149}}
]){
  const rootHash='a'.repeat(64);
  const pending={version:'52.0.0',channel:'stable',at:5200,order:['new.js'],
                 files:{'new.js':'successor'}};
  const roots=variant.partialStored
    ?{manifestRoot:rootHash,targetRoot:rootHash}
    :{manifestRoot:rootHash,targetRoot:rootHash,runtimeRoot:rootHash};
  const active={version:'51.5.0',channel:'stable',at:5150,...roots,
                order:['active.js'],files:{'active.js':'running'}};
  const initial={pending,pendingMeta:bundleMeta(pending),active,
                 activeMeta:bundleMeta(active)};
  const h=makeHarness({records:initial,storage:{mf_update_channel:'stable'}});
  setRunning(h,{version:active.version,channel:active.channel,at:active.at,
                ...(variant.running||{})});
  if(variant.descriptor) h.context.window.__MF_ARTIFACT_BOOT_V1=true;
  h.api.reset({version:pending.version,channel:pending.channel,files:[]});
  h.api.UPD.state='ready';
  h.api.UPD.readyIdentity=h.api.updPendingIdentity(pending);
  await h.api.updApply();
  assert.equal(h.api.UPD.state,'error',
               variant.label+' was accepted as a legacy shell');
  assert.match(h.api.UPD.err,/installed update changed/);
  assert.deepEqual(h.database.snapshot(),initial,
                   variant.label+' mutated durable update authority');
  assert.equal(h.database.get('previousA'),undefined);
  assert.equal(h.database.get('operation'),undefined);
}

/* After immutable boot rejects drifted active state, the packaged document has
   no running OTA identity. It can therefore promote the retained download
   without attempting to preserve the broken active record. This is the second
   half of the no-reinstall recovery path used by already-shipped updaters. */
{
  const pending={version:'49.0.0',channel:'stable',at:4900,order:['repair.js'],
                 files:{'repair.js':'retained verified successor'}};
  const h=makeHarness({records:{pending,pendingMeta:bundleMeta(pending)},
                       storage:{mf_update_channel:'stable'}});
  h.api.reset({version:pending.version,channel:pending.channel,files:[]});
  h.api.UPD.state='ready';
  h.api.UPD.readyIdentity=h.api.updPendingIdentity(pending);
  await h.api.updApply();
  assert.deepEqual(h.database.get('active'),pending,
                   'packaged recovery could not promote retained download');
  assert.deepEqual(h.database.get('activeMeta'),bundleMeta(pending));
  assert.equal(h.database.get('previousRef'),undefined,
               'packaged recovery preserved nonexistent active bytes');
  assert.equal(h.database.get('probation').pendingAt,pending.at);
  assert.equal(h.database.get('operation'),undefined);
}

/* A failure after inactive-slot preparation must leave the last validated
   pointer and its payload untouched. Finally may remove only this lease's
   prepared slot; legacy recovery data is also outside that cleanup scope. */
{
  const pending={version:'33.0.0',channel:'stable',at:3300,order:['new.js'],
                 files:{'new.js':'pending'}};
  const active={version:'32.0.0',channel:'stable',at:3200,order:['active.js'],
                files:{'active.js':'running'}};
  const prior={version:'31.0.0',channel:'stable',at:3100,order:['prior.js'],
               files:{'prior.js':'validated rollback'}};
  const legacy={version:'30.0.0',channel:'stable',at:3000,order:['legacy.js'],
                files:{'legacy.js':'legacy fallback'}};
  const initial={pending,pendingMeta:bundleMeta(pending),active,activeMeta:bundleMeta(active),
    previousRef:rollbackRef('previousA',prior),previousA:prior,
    previousAMeta:bundleMeta(prior),previous:legacy,previousMeta:bundleMeta(legacy)};
  const h=makeHarness({records:initial,storage:{mf_update_channel:'stable'}});
  setRunning(h,active);
  h.api.reset({version:pending.version,channel:pending.channel,files:[]});
  h.api.UPD.state='ready';
  h.api.UPD.readyIdentity=h.api.updPendingIdentity(pending);
  h.database.holdWriteKeys(['previousB','previousBMeta']);
  const apply=h.api.updApply();
  await waitFor(()=>h.database.hasHeldWrite(),'held inactive rollback-slot preparation');
  h.localStorage.setItem('mf_update_channel','preview');
  h.database.releaseHeldWrite();
  await apply;
  assert.equal(h.api.UPD.state,'error');
  assert.match(h.api.UPD.err,/different channel/);
  assert.deepEqual(h.database.snapshot(),initial,
                   'failed Apply changed prior rollback pointer or cleaned beyond its slot');
  assert.equal(h.database.get('previousB'),undefined,
               'failed Apply left its inactive prepared slot behind');
  assert.equal(h.database.get('previousBMeta'),undefined);
}

/* Rollback preservation now finishes before pending is materialized. Queue a
   boot/new-owner replacement behind that held prepare commit, then let the old
   Apply resume. Its refresh fails before promotion and its finally-cleanup must
   not delete the new owner's different previous payload or metadata. */
{
  const pending={version:'41.0.0',channel:'stable',at:4100,order:['new.js'],
                 files:{'new.js':'promoted'}};
  const active={version:'40.0.0',channel:'stable',at:4000,order:['old.js'],
                files:{'old.js':'old running'}};
  const prior={version:'39.0.0',channel:'stable',at:3900,order:['prior.js'],
               files:{'prior.js':'still referenced'}};
  const otherPrevious={version:'39.5.0',channel:'preview',at:3950,order:['other.js'],
                       files:{'other.js':'owned by the newer operation'}};
  const database=makeDatabase({pending,pendingMeta:bundleMeta(pending),active,
    activeMeta:bundleMeta(active),previousRef:rollbackRef('previousA',prior),
    previousA:prior,previousAMeta:bundleMeta(prior)});
  const h=makeHarness({database,storage:{mf_update_channel:'stable'}});
  setRunning(h,active);
  h.api.reset({version:pending.version,channel:pending.channel,files:[]});
  h.api.UPD.state='ready';
  h.api.UPD.readyIdentity=h.api.updPendingIdentity(pending);
  database.holdWriteKeys(['previousB','previousBMeta']);
  const apply=h.api.updApply();
  await waitFor(()=>database.hasHeldWrite(),'held pre-promotion previous preparation');
  const newerLease={kind:'boot-fixture',at:Date.now(),
    target:{version:otherPrevious.version,channel:otherPrevious.channel,at:otherPrevious.at},
    token:'new-owner-after-promotion'};
  const fixture=database.fixtureWrite({deletes:['operation'],puts:{
    operation:newerLease,previousB:otherPrevious,previousBMeta:bundleMeta(otherPrevious)
  }});
  database.releaseHeldWrite();
  await Promise.all([fixture,apply]);
  assert.equal(h.api.UPD.state,'error');
  assert.match(h.api.UPD.err,/ownership changed/);
  assert.deepEqual(database.get('active'),active,
                   'lost ownership still promoted pending bytes');
  assert.equal(database.get('probation'),undefined,
               'lost ownership armed probation without promotion');
  assert.deepEqual(database.get('previousRef'),rollbackRef('previousA',prior),
                   'lost owner changed the last validated rollback pointer');
  assert.deepEqual(database.get('previousA'),prior);
  assert.deepEqual(database.get('previousB'),otherPrevious,
                   'old Apply deleted the newer owner\'s rollback payload');
  assert.deepEqual(database.get('previousBMeta'),bundleMeta(otherPrevious),
                   'old Apply deleted or rewrote the newer owner\'s metadata');
  assert.deepEqual(database.get('operation'),newerLease,
                   'old Apply released a lease token owned by the newer operation');
}

/* A quota failure while preparing the inactive slot is best-effort. The valid
   pointer/slot (and legacy fallback) remain intact, while Apply may still
   promote without publishing a half-written inactive slot. */
{
  const pending={version:'43.0.0',channel:'stable',at:4300,order:['new.js'],
                 files:{'new.js':'new'}};
  const active={version:'42.0.0',channel:'stable',at:4200,order:['active.js'],
                files:{'active.js':'running'}};
  const prior={version:'41.0.0',channel:'stable',at:4100,order:['prior.js'],
               files:{'prior.js':'validated pointer rollback'}};
  const stalePrevious={version:'38.0.0',channel:'stable',at:3800,order:['stale.js'],
                       files:{'stale.js':'stale rollback'}};
  const initial={pending,pendingMeta:bundleMeta(pending),active,activeMeta:bundleMeta(active),
                 previousRef:rollbackRef('previousA',prior),previousA:prior,
                 previousAMeta:bundleMeta(prior),
                 previous:stalePrevious,previousMeta:bundleMeta(stalePrevious)};
  const h=makeHarness({records:initial,storage:{mf_update_channel:'stable'}});
  setRunning(h,active);
  h.api.reset({version:pending.version,channel:pending.channel,files:[]});
  h.api.UPD.state='ready';
  h.api.UPD.readyIdentity=h.api.updPendingIdentity(pending);
  h.database.failWriteKeys(['previousB','previousBMeta'],'QuotaExceededError');
  h.database.holdWriteKeys(['active','activeMeta','probation','previousRef']);
  const apply=h.api.updApply();
  await waitFor(()=>h.database.hasHeldWrite(),'held promotion after rollback-slot quota failure');
  assert.deepEqual(h.database.get('previousRef'),rollbackRef('previousA',prior),
                   'preparation abort damaged rollback pointer before promotion');
  assert.deepEqual(h.database.get('previousA'),prior,
                   'preparation abort damaged referenced slot before promotion');
  assert.deepEqual(h.database.get('previousAMeta'),bundleMeta(prior));
  assert.equal(h.database.get('previousB'),undefined,
               'quota-aborted inactive slot became partially visible');
  assert.equal(h.database.get('previousBMeta'),undefined);
  assert.deepEqual(h.database.get('previous'),stalePrevious,
                   'preparation abort retired legacy recovery before promotion');
  h.database.releaseHeldWrite();
  await apply;
  assert.deepEqual(h.database.get('active'),pending,
                   'quota failure rolled back the already atomic promotion');
  assert.equal(h.database.get('previousRef'),undefined,
               'successful promotion left rollback pointing two releases behind');
  assert.equal(h.database.get('previousA'),undefined,
               'successful promotion retained the obsolete referenced slot');
  assert.equal(h.database.get('previousAMeta'),undefined);
  assert.equal(h.database.get('previousB'),undefined,
               'successful promotion retained failed inactive-slot debris');
  assert.equal(h.database.get('previousBMeta'),undefined);
  assert.equal(h.database.get('previous'),undefined,
               'successful promotion retained obsolete legacy recovery');
  assert.equal(h.database.get('previousMeta'),undefined);
  assert.equal(h.database.get('operation'),undefined,
               'owned quota cleanup leaked the Apply lease');
}

/* Rollback consent is also exact. A new payload with the same version/channel
   but a different staging identity cannot be reverted by an older document.
   The held metadata-first transaction also proves its refreshed lease remains
   bound to the exact running payload. */
{
  const shown={version:'25.0.0',channel:'stable',at:2500};
  const current={version:'25.0.0',channel:'stable',at:2501,order:['current.js'],
                 files:{'current.js':'different bytes'}};
  const previous={version:'24.0.0',channel:'stable',at:2400,order:['old.js'],
                  files:{'old.js':'validated'}};
  const pending={version:'25.0.0',channel:'stable',at:2600,order:['next.js'],
                 files:{'next.js':'same version, newer consent'}};
  const initial={previous,previousMeta:bundleMeta(previous),
    active:current,activeMeta:bundleMeta(current),pending,pendingMeta:bundleMeta(pending),
    probation:{version:current.version,channel:current.channel,pendingAt:current.at,
               at:2502,tries:1}};
  const database=makeDatabase(initial);
  const h=makeHarness({database,storage:{mf_update_channel:'stable'}});
  setRunning(h,shown);
  database.holdNextTransaction({mode:'readwrite',
    reads:['activeMeta','pendingMeta','probation','operation','previousRef',
           'previousAMeta','previousBMeta','previousMeta']});
  const rollback=h.api.updRollback();
  await waitFor(()=>database.hasHeldTransaction(),'held exact-identity rollback');
  assert.deepEqual(database.get('operation').target,clone(h.api.updRunningIdentity()),
                   'Rollback lease was not bound to the exact running identity');
  database.releaseHeldTransaction();
  await rollback;
  assert.equal(h.api.UPD.state,'error');
  assert.match(h.api.UPD.err,/installed update changed/);
  assert.deepEqual(database.snapshot(),initial,
                   'same-version different-at rollback mutated or discarded records');
  assert.deepEqual(database.get('pending'),pending,
                   'refused rollback discarded the newer consent identity');
  assert.deepEqual(database.get('pendingMeta'),bundleMeta(pending));
}

/* Pointer-backed rollback is a single durable rewrite. An injected failure
   preserves ref and both slots; success resolves the referenced payload,
   consumes pointer, both slots and legacy recovery, then preserves an unrelated
   same-version pending candidate whose staging timestamp differs. */
{
  const rollbackPayload={version:'24.0.0',channel:'stable',at:2400,
                         manifestRoot:'d'.repeat(64),targetRoot:'e'.repeat(64),
                         runtimeRoot:'f'.repeat(64),order:['old.js'],
                         files:{'old.js':'pointer validated'}};
  const staleSlot={version:'23.0.0',channel:'stable',at:2300,order:['stale.js'],
                   files:{'stale.js':'unreferenced slot'}};
  const legacyPrevious={version:'22.0.0',channel:'stable',at:2200,order:['legacy.js'],
                        files:{'legacy.js':'must not win over pointer'}};
  const active={version:'25.0.0',channel:'stable',at:2500,order:['current.js'],
                files:{'current.js':'current'}};
  const pending={version:'25.0.0',channel:'stable',at:2600,order:['next.js'],
                 files:{'next.js':'same version, different staged bytes'}};
  const initial={active,activeMeta:bundleMeta(active),pending,pendingMeta:bundleMeta(pending),
    previousRef:rollbackRef('previousB',rollbackPayload),
    previousA:staleSlot,previousAMeta:bundleMeta(staleSlot),
    previousB:rollbackPayload,previousBMeta:bundleMeta(rollbackPayload),
    previous:legacyPrevious,previousMeta:bundleMeta(legacyPrevious),
    probation:{version:active.version,channel:'stable',pendingAt:active.at,
               at:2501,tries:1}};

  const failed=makeHarness({records:initial,storage:{mf_update_channel:'stable'}});
  setRunning(failed,active);
  failed.database.failWriteKeys(['active','previousRef','probation'],'QuotaExceededError');
  await failed.api.updRollback();
  assert.equal(failed.api.UPD.state,'error');
  assert.match(failed.api.UPD.err,/Could not revert/);
  assert.deepEqual(failed.database.snapshot(),initial,
                   'failed rollback exposed a partially rewritten record set');
  assert.equal(failed.database.get('operation'),undefined,
               'failed rollback leaked its operation lease');

  const passed=makeHarness({records:initial,storage:{mf_update_channel:'stable'}});
  setRunning(passed,active);
  await passed.api.updRollback();
  assert.deepEqual(passed.database.get('active'),rollbackPayload,
                   'manual rollback did not resolve the pointer-backed payload');
  assert.deepEqual(passed.database.get('activeMeta'),bundleMeta(rollbackPayload),
                   'rollback restored payload without matching active metadata');
  assert.equal(passed.database.getCount('previousB'),1,
               'manual rollback did not read the referenced slot exactly once');
  assert.equal(passed.database.getCount('previous'),0,
               'valid rollback pointer still deserialized legacy previous payload');
  assert.equal(passed.database.get('previousRef'),undefined,
               'manual rollback did not consume rollback pointer');
  assert.equal(passed.database.get('previousA'),undefined);
  assert.equal(passed.database.get('previousAMeta'),undefined);
  assert.equal(passed.database.get('previousB'),undefined);
  assert.equal(passed.database.get('previousBMeta'),undefined);
  assert.equal(passed.database.get('previous'),undefined);
  assert.equal(passed.database.get('previousMeta'),undefined,
               'rollback left stale previous metadata behind');
  assert.equal(passed.database.get('probation').version,rollbackPayload.version);
  assert.equal(passed.database.get('probation').pendingAt,rollbackPayload.at,
               'rollback probation was not bound to the restored payload');
  assert.equal(passed.database.get('probation').runtimeRoot,rollbackPayload.runtimeRoot,
               'rollback probation omitted the restored runtime root');
  assert.equal(passed.database.get('probation').tries,0);
  assert.deepEqual(passed.database.get('pending'),pending,
                   'rollback discarded same-version pending with a different identity');
  assert.deepEqual(passed.database.get('pendingMeta'),bundleMeta(pending),
                   'rollback discarded or rewrote pending metadata');
  assert.equal(passed.database.get('operation'),undefined,
               'successful rollback leaked its operation lease');
  assert.equal(passed.navigation[0]&&passed.navigation[0].kind,'replace',
               'successful rollback did not request a document restart');
}

/* Rollback uses the same authoritative fallback as Apply. A stale activeMeta
   index may be repaired from the full payload only when it exactly matches the
   identity executing this Rollback; the prior validated slot remains required. */
{
  const active={version:'47.0.0',channel:'stable',at:4700,order:['active.js'],
                files:{'active.js':'running'}};
  const staleMeta={version:'46.0.0',channel:'stable',at:4600};
  const previous={version:'45.0.0',channel:'stable',at:4500,order:['old.js'],
                  files:{'old.js':'validated'}};
  const h=makeHarness({records:{active,activeMeta:staleMeta,
    previousRef:rollbackRef('previousB',previous),previousB:previous,
    previousBMeta:bundleMeta(previous),
    probation:{version:active.version,channel:active.channel,pendingAt:active.at,
               at:4701,tries:1}},storage:{mf_update_channel:'stable'}});
  setRunning(h,active);
  await h.api.updRollback();
  assert.deepEqual(h.database.get('active'),previous,
                   'stale active metadata blocked rollback of exact running bytes');
  assert.deepEqual(h.database.get('activeMeta'),bundleMeta(previous));
  assert.equal(h.database.get('previousRef'),undefined);
  assert.equal(h.database.get('operation'),undefined,
               'metadata fallback Rollback leaked its operation lease');
  assert.equal(h.navigation[0]&&h.navigation[0].kind,'replace');
}

/* Pre-metadata installs issue active/pending reads dynamically from metadata
   callbacks. The fake must keep that transaction alive for those requests,
   and production must migrate the restored active record atomically. */
{
  const previous={version:'26.0.0',channel:'stable',at:2600,order:['old.js'],
                  files:{'old.js':'legacy rollback'}};
  const active={version:'27.0.0',channel:'stable',at:2700,order:['active.js'],
                files:{'active.js':'legacy active'}};
  const pending={version:'28.0.0',channel:'stable',at:2800,order:['next.js'],
                 files:{'next.js':'legacy pending'}};
  const h=makeHarness({records:{previous,active,pending,
    probation:{version:active.version,channel:active.channel,pendingAt:active.at,
               at:2701,tries:1}},storage:{mf_update_channel:'stable'}});
  setRunning(h,active);
  await h.api.updRollback();
  assert.deepEqual(h.database.get('active'),previous,
                   'legacy callback reads did not complete before rollback commit');
  assert.deepEqual(h.database.get('activeMeta'),bundleMeta(previous),
                   'legacy rollback did not migrate restored active metadata');
  assert.deepEqual(h.database.get('pending'),pending,
                   'legacy rollback discarded a different pending bundle');
  assert.equal(h.database.get('pendingMeta'),undefined,
               'legacy fallback invented metadata for an untouched pending record');
  assert.equal(h.database.get('probation').pendingAt,previous.at);
  assert.equal(h.database.get('operation'),undefined);
}

/* A live Apply/Rollback lease blocks both another destructive operation and a
   verified download commit. This is the cross-document contract: every copy
   sees the same IndexedDB lock even though its in-memory UPD state is private. */
{
  const current={version:'12.0.0',channel:'stable',at:1200,order:['a.js'],
                 files:{'a.js':'current'}};
  const operation={kind:'apply',at:Date.now(),token:'other-window'};
  const h=makeHarness({records:{pending:current,operation},
                       storage:{mf_update_channel:'stable'}});
  const before=h.database.snapshot();
  await assert.rejects(()=>h.api.updCommitPending({
    version:'13.0.0',channel:'stable',at:1300,order:['b.js'],files:{'b.js':'next'}
  }),error=>error&&error.code==='MF_UPDATE_OPERATION_BUSY');
  assert.deepEqual(h.database.snapshot(),before,'live lease allowed pending replacement');

  h.api.UPD.state='installed';
  await h.api.updRollback();
  assert.equal(h.api.UPD.state,'error');
  assert.match(h.api.UPD.err,/already busy/);
  assert.deepEqual(h.database.snapshot(),before,'live lease allowed rollback mutation');
}

/* Missing downloaded bytes leave the apply retry loop and route the next main
   action back to an update check. */
{
  const expected={version:'11.0.0',channel:'stable',at:1100};
  const h=makeHarness({records:{pendingMeta:bundleMeta(expected)},
                       storage:{mf_update_channel:'stable'}});
  h.api.reset({version:'11.0.0',channel:'stable',files:[]});
  h.api.UPD.state='ready';
  h.api.UPD.readyIdentity=expected;
  await h.api.updApply();
  assert.equal(h.api.UPD.state,'error');
  assert.match(h.api.UPD.err,/missing/);
  assert.equal(h.api.UPD.retryDownload,false);
}

/* Manifest-declared ranges survive a killed/failed attempt. A new document
   reuses the verified first range and asks the server only for the missing
   ranges before it verifies the whole file and stages the legacy boot bundle. */
{
  const entry=chunkedFile('large.js','abcdefghijkl');
  const database=makeDatabase(),localStorage=makeLocalStorage({mf_update_channel:'stable'});
  const rootHash='1'.repeat(64),firstRanges=[]; let failures=3;
  const fetchRange=async(url,{headers})=>{
    const match=/bytes=(\d+)-(\d+)/.exec(headers&&headers.Range||'');
    assert.ok(match,'chunked transfer omitted Range');
    const start=Number(match[1]),end=Number(match[2]); firstRanges.push(start);
    if(start===4&&failures-->0) throw new Error('injected range loss');
    return rangedResponse(entry,start,end);
  };
  const first=makeHarness({database,localStorage,fetchImpl:fetchRange});
  first.api.reset(manifest('60.0.0',[entry],{manifestRoot:rootHash,payloadRoot:rootHash}));
  await first.api.updDownload();
  assert.equal(first.api.UPD.state,'error');
  assert.deepEqual(firstRanges,[0,4,4,4]);
  assert.ok(Object.keys(database.snapshot()).some(key=>key.includes(':chunk:0:large.js')),
            'verified first range was not journaled');

  const resumedRanges=[];
  const resumed=makeHarness({database,localStorage,fetchImpl:async(url,{headers})=>{
    const match=/bytes=(\d+)-(\d+)/.exec(headers&&headers.Range||'');
    const start=Number(match[1]),end=Number(match[2]); resumedRanges.push(start);
    return rangedResponse(entry,start,end);
  }});
  resumed.api.reset(manifest('60.0.0',[entry],{manifestRoot:rootHash,payloadRoot:rootHash}));
  await resumed.api.updDownload();
  assert.equal(resumed.api.UPD.state,'ready');
  assert.deepEqual(resumedRanges,[4,8],'restart re-downloaded an already verified range');
  assert.equal(database.get('pending').files['large.js'],entry.text);
  assert.equal(Object.keys(database.snapshot()).some(key=>key.startsWith('transfer-v1:')),false,
               'successful stage leaked temporary range records');
}

/* Quota preflight inventories and re-hashes persisted ranges before deciding.
   A restart with room for only the missing bytes must not be rejected as if the
   already durable first range still needed downloading. */
{
  const entry=chunkedFile('quota-resume.js','abcdefghijkl'),rootHash='6'.repeat(64);
  const database=makeDatabase(),localStorage=makeLocalStorage({mf_update_channel:'stable'});
  let failures=3;
  const first=makeHarness({database,localStorage,fetchImpl:async(url,{headers})=>{
    const match=/bytes=(\d+)-(\d+)/.exec(headers&&headers.Range||'');
    const start=Number(match[1]),end=Number(match[2]);
    if(start===4&&failures-->0) throw new Error('stop after first range');
    return rangedResponse(entry,start,end);
  }});
  first.api.reset(manifest('60.1.0',[entry],{manifestRoot:rootHash,payloadRoot:rootHash}));
  await first.api.updDownload();
  assert.equal(first.api.UPD.state,'error');
  const margin=32*1024*1024,requiredForRemainder=margin+32,resumed=[];
  const second=makeHarness({database,localStorage,
    navigatorImpl:{storage:{estimate:async()=>({usage:100,quota:100+requiredForRemainder})}},
    fetchImpl:async(url,{headers})=>{
      const match=/bytes=(\d+)-(\d+)/.exec(headers&&headers.Range||'');
      resumed.push(Number(match[1]));
      return rangedResponse(entry,Number(match[1]),Number(match[2]));
    }});
  second.api.reset(manifest('60.1.0',[entry],{manifestRoot:rootHash,payloadRoot:rootHash}));
  await second.api.updDownload();
  assert.equal(second.api.UPD.state,'ready');
  assert.deepEqual(resumed,[4,8],'quota-aware retry did not reuse the persisted range');
}

/* A mirror that ignores Range is tolerated once: the complete response is
   whole-file verified, split against every declared chunk hash, and never
   downloaded once per chunk. */
{
  const entry=chunkedFile('range-ignored.js','abcdefghijkl'),rootHash='2'.repeat(64);
  let fetches=0;
  const h=makeHarness({fetchImpl:async(url,{signal})=>{
    fetches++; return response(entry)(signal);
  }});
  h.api.reset(manifest('61.0.0',[entry],{manifestRoot:rootHash,payloadRoot:rootHash}));
  await h.api.updDownload();
  assert.equal(h.api.UPD.state,'ready');
  assert.equal(fetches,1,'Range-ignoring mirror caused repeated whole-file downloads');
}

/* A server may ignore Range for today's 27 MB core artifact, but it may not
   force a future very large source file into several simultaneous full-size
   allocations. Large artifacts fail before their response body is consumed
   and can resume once a compliant mirror is available. */
{
  const size=32*1024*1024+1,hash='7'.repeat(64);
  const entry={path:'too-large-range-ignore.js',size,sha256:hash,chunks:[
    {offset:0,size:4,sha256:'8'.repeat(64)},
    {offset:4,size:size-4,sha256:'9'.repeat(64)}
  ]};
  let bodyRead=false;
  const h=makeHarness({fetchImpl:async()=>({ok:true,status:200,
    headers:{get:()=> 'application/javascript'},
    body:{getReader(){ bodyRead=true;throw new Error('body must remain unread'); }}})});
  h.api.reset(manifest('61.0.1',[entry],{manifestRoot:hash,payloadRoot:hash}));
  await h.api.updDownload();
  assert.equal(h.api.UPD.state,'error');
  assert.match(h.api.UPD.err,/must support byte ranges/);
  assert.equal(bodyRead,false,'oversized ignored-Range response was materialized');
}

/* New packaged boots stage tiny descriptors while verified source stays in
   one-artifact records. This is the storage/memory contract that makes a full
   source update practical; old boots leave the flag absent and retain the
   legacy all-string payload tested above. */
{
  const entry=chunkedFile('descriptor.js','abcdefghijkl'),rootHash='5'.repeat(64);
  const h=makeHarness({fetchImpl:async(url,{headers})=>{
    const match=/bytes=(\d+)-(\d+)/.exec(headers&&headers.Range||'');
    assert.ok(match,'descriptor transfer omitted Range');
    return rangedResponse(entry,Number(match[1]),Number(match[2]));
  }});
  h.context.window.__MF_ARTIFACT_BOOT_V1=true;
  h.api.reset(manifest('61.1.0',[entry],{manifestRoot:rootHash,payloadRoot:rootHash}));
  await h.api.updDownload();
  assert.equal(h.api.UPD.state,'ready');
  const pending=h.database.get('pending'),ref=pending.files['descriptor.js'];
  assert.equal(pending.storage,'artifact-v1');
  assert.equal(typeof ref,'object','descriptor boot staged a legacy source string');
  assert.equal(ref.size,entry.size);
  assert.equal(ref.sha256,entry.sha256);
  assert.deepEqual(h.database.get(ref.key),
    {size:entry.size,sha256:entry.sha256,text:entry.text},
    'verified artifact record was not retained for packaged boot');
  const transferKeys=Object.keys(h.database.snapshot()).filter(key=>key.startsWith('transfer-v1:'));
  assert.deepEqual(transferKeys,[ref.key],
    'descriptor stage retained journal/range scratch records');
  assert.deepEqual(h.database.get('pendingMeta'),bundleMeta(pending));
}

/* Storage failure is decided before the first network byte, with concrete
   required/available wording rather than a late opaque IndexedDB abort. */
{
  const entry=chunkedFile('too-large.js','abcdefghijkl'),rootHash='3'.repeat(64);
  let fetches=0;
  const h=makeHarness({navigatorImpl:{storage:{estimate:async()=>({usage:900,quota:1000})}},
    fetchImpl:async()=>{ fetches++; throw new Error('network should not start'); }});
  h.api.reset(manifest('62.0.0',[entry],{manifestRoot:rootHash,payloadRoot:rootHash}));
  await h.api.updDownload();
  assert.equal(h.api.UPD.state,'error');
  assert.match(h.api.UPD.err,/Not enough storage/);
  assert.equal(fetches,0,'storage preflight ran after network transfer');
}

/* Retrying an immutable identity that is already staged is idempotent. It
   returns to Ready with the original attempt token instead of recreating the
   historical "already staged" loop. */
{
  const entry=file('same.js','same bytes'),rootHash='4'.repeat(64);
  const staged={version:'63.0.0',channel:'stable',at:6300,manifestRoot:rootHash,
    payloadRoot:rootHash,targetRoot:rootHash,order:['same.js'],files:{'same.js':entry.text}};
  const h=makeHarness({records:{pending:staged,pendingMeta:bundleMeta(staged)},
    fetchImpl:async(url,{signal})=>response(entry)(signal)});
  h.api.reset(manifest('63.0.0',[entry],{manifestRoot:rootHash,payloadRoot:rootHash}));
  await h.api.updDownload();
  assert.equal(h.api.UPD.state,'ready');
  assert.equal(h.api.UPD.readyIdentity.at,6300);
  assert.equal(h.database.get('pending').files['same.js'],entry.text);
  assert.equal(h.database.get('pending').at,6300,'same-root repair changed the consent token');
}

/* Lightweight metadata can survive a quota-evicted/torn pending value. A
   verified same-root retry repairs that payload instead of returning Ready to
   another guaranteed "download is missing" Apply failure. */
{
  const entry=file('repair-same.js','repaired bytes'),rootHash='a'.repeat(64);
  const metadata={version:'63.0.1',channel:'stable',at:6310,manifestRoot:rootHash,
    payloadRoot:rootHash,targetRoot:rootHash,order:['repair-same.js'],
    files:{'repair-same.js':entry.text}};
  const h=makeHarness({records:{pendingMeta:bundleMeta(metadata)},
    fetchImpl:async(url,{signal})=>response(entry)(signal)});
  h.api.reset(manifest('63.0.1',[entry],{manifestRoot:rootHash,payloadRoot:rootHash}));
  await h.api.updDownload();
  assert.equal(h.api.UPD.state,'ready');
  assert.equal(h.database.get('pending').files['repair-same.js'],entry.text);
  assert.equal(h.database.get('pending').at,6310);
}

/* Artifact storage is reference-counted by reachability, not by release
   prefix. Deltas deliberately inherit immutable refs from older identities,
   while cancelled scratch remains resumable for one documented TTL. */
{
  const now=Date.now(),staleAt=now-(8*24*60*60*1000);
  const makeRef=(identity,path,text)=>{
    const bytes=encoder.encode(text);
    return {key:`transfer-v1:${identity}:file:${path}`,size:bytes.byteLength,
      sha256:createHash('sha256').update(bytes).digest('hex')};
  };
  const makeDescriptor=(version,path,ref)=>({version,channel:'stable',at:Number(version.split('.').pop()),
    storage:'artifact-v1',order:[path],files:{[path]:ref}});
  const refs={
    pending:makeRef('base-a','pending.js','pending'),
    active:makeRef('base-a','active.js','active'),
    previousA:makeRef('base-b','previous-a.js','previous-a'),
    previousB:makeRef('base-b','previous-b.js','previous-b'),
    previous:makeRef('legacy-slot','previous.js','previous')
  };
  const records={sentinel:{keep:true}};
  let patch=70;
  for(const [slot,ref] of Object.entries(refs)){
    const descriptor=makeDescriptor(`70.0.${patch++}`,Object.keys(refs).find(key=>refs[key]===ref)+'.js',ref);
    /* Use the ref's real path rather than the slot label for differently named
       rollback fixtures. */
    descriptor.order=[ref.key.slice(ref.key.indexOf(':file:')+6)];
    descriptor.files={[descriptor.order[0]]:ref};
    records[slot]=descriptor; records[slot+'Meta']=bundleMeta(descriptor);
    records[ref.key]={size:ref.size,sha256:ref.sha256,text:descriptor.order[0]};
  }
  /* Stored record text is irrelevant to GC, but keep metadata representative. */
  for(const ref of Object.values(refs)) records[ref.key]={size:ref.size,sha256:ref.sha256,text:'x'};
  const freshPrefix='transfer-v1:fresh-transfer:';
  records[freshPrefix+'journal']={identity:'fresh-transfer',at:now};
  records[freshPrefix+'file:fresh.js']={text:'fresh'};
  records[freshPrefix+'chunk:0:fresh.js']={bytes:new Uint8Array([1])};
  const currentPrefix='transfer-v1:current-transfer:';
  records[currentPrefix+'journal']={identity:'current-transfer',at:staleAt};
  records[currentPrefix+'file:current.js']={text:'current'};
  records[currentPrefix+'chunk:0:current.js']={bytes:new Uint8Array([2])};
  const stalePrefix='transfer-v1:stale-transfer:';
  records[stalePrefix+'journal']={identity:'stale-transfer',at:staleAt};
  records[stalePrefix+'file:stale.js']={text:'stale'};
  records[stalePrefix+'chunk:0:stale.js']={bytes:new Uint8Array([3])};
  records['transfer-v1:orphan:file:orphan.js']={text:'orphan'};
  const h=makeHarness({records});
  const result=await h.api.updTransferMaintenance('current-transfer');
  for(const ref of Object.values(refs))
    assert.equal(h.database.get(ref.key)!=null,true,'GC deleted a descriptor-reachable artifact');
  for(const key of [freshPrefix+'journal',freshPrefix+'file:fresh.js',freshPrefix+'chunk:0:fresh.js',
                     currentPrefix+'journal',currentPrefix+'file:current.js',currentPrefix+'chunk:0:current.js'])
    assert.equal(h.database.get(key)!=null,true,'GC deleted fresh/current resumable state '+key);
  for(const key of [stalePrefix+'journal',stalePrefix+'file:stale.js',stalePrefix+'chunk:0:stale.js',
                     'transfer-v1:orphan:file:orphan.js'])
    assert.equal(h.database.get(key),undefined,'GC retained stale unreachable state '+key);
  assert.deepEqual(h.database.get('sentinel'),{keep:true},'GC touched a non-transfer record');
  assert.equal(result.deleted,4);
}

/* A known bundle-v1 payload can be enormous and has no artifact refs. Its
   metadata lets maintenance reclaim unrelated artifacts without reading it. */
{
  const legacy={version:'71.0.0',channel:'stable',at:7100,storage:'bundle-v1',
    order:['legacy.js'],files:{'legacy.js':'large legacy source'}};
  const orphan='transfer-v1:legacy-orphan:file:unused.js';
  const h=makeHarness({records:{active:legacy,activeMeta:bundleMeta(legacy),[orphan]:{text:'unused'}}});
  await h.api.updTransferMaintenance();
  assert.equal(h.database.getCount('active'),0,'GC deserialized a metadata-proven legacy bundle');
  assert.equal(h.database.get(orphan),undefined,'GC retained an unreachable legacy-era artifact');
}

/* The maintenance snapshot and its deletes share one readwrite transaction.
   A staging commit already ahead of it in the IDB queue must become visible
   before marking, rather than having its newly referenced file swept. */
{
  const text='queued',bytes=encoder.encode(text);
  const ref={key:'transfer-v1:queued-stage:file:queued.js',size:bytes.byteLength,
    sha256:createHash('sha256').update(bytes).digest('hex')};
  const pending={version:'72.0.0',channel:'stable',at:7200,storage:'artifact-v1',
    order:['queued.js'],files:{'queued.js':ref}};
  const orphan='transfer-v1:queued-orphan:file:unused.js';
  const h=makeHarness({records:{[ref.key]:{size:ref.size,sha256:ref.sha256,text},
    [orphan]:{text:'unused'}}});
  h.database.holdWriteKeys(['pending','pendingMeta']);
  const staging=h.database.fixtureWrite({puts:{pending,pendingMeta:bundleMeta(pending)}});
  await waitFor(()=>h.database.hasHeldWrite(),'queued pending staging commit');
  const maintenance=h.api.updTransferMaintenance();
  h.database.releaseHeldWrite();
  await Promise.all([staging,maintenance]);
  assert.equal(h.database.get(ref.key)!=null,true,'queued staging lost its referenced artifact');
  assert.equal(h.database.get(orphan),undefined,'queued staging prevented unrelated cleanup');
}

/* The network gate has two halves and they are not equally trustworthy.
   Offline Mode is the player's own switch and must always be honoured. The
   browser's navigator.onLine is only a hint: an Android WebView reports it as
   false on a plainly connected device, and treating it as a gate meant a
   deliberate retry did nothing, forever, with no error to explain why. An
   automatic pass still respects the hint so an offline device is not made to
   churn; an explicit tap always attempts and reports a real result. */
{
  let loads=0;
  const h=makeHarness({fetchImpl:async()=>{ throw new Error('no network expected'); }});
  h.api.setEndpoint('https://updates.invalid/update.json');
  h.api.setResolveEndpoint(async()=>'https://updates.invalid/update.json');
  h.api.setLoadManifest(async()=>{ loads++; throw new Error('unreachable'); });
  h.context.netForcedOffline=()=>true;
  h.context.netBrowserOffline=()=>false;
  await h.api.updCheck(true);
  assert.equal(h.api.UPD.state,'unset','Offline Mode must report an unavailable service');
  assert.equal(loads,0,'Offline Mode still reached for the update service');
}
{
  let loads=0;
  const h=makeHarness({fetchImpl:async()=>{ throw new Error('no network expected'); }});
  h.api.setEndpoint('https://updates.invalid/update.json');
  h.api.setResolveEndpoint(async()=>'https://updates.invalid/update.json');
  h.api.setLoadManifest(async()=>{ loads++; throw new Error('unreachable'); });
  h.context.netForcedOffline=()=>false;
  h.context.netBrowserOffline=()=>true;
  await h.api.updCheck(false);
  assert.equal(loads,0,'an automatic pass ignored the browser offline hint');
}
{
  let loads=0;
  const h=makeHarness({fetchImpl:async()=>{ throw new Error('no network expected'); }});
  h.api.setEndpoint('https://updates.invalid/update.json');
  h.api.setResolveEndpoint(async()=>'https://updates.invalid/update.json');
  h.api.setLoadManifest(async()=>{ loads++; throw new Error('unreachable'); });
  h.context.netForcedOffline=()=>false;
  h.context.netBrowserOffline=()=>true;
  await h.api.updCheck(true);
  assert.equal(loads,1,
    'a deliberate retry was refused by the browser hint and never reached the service');
  assert.notEqual(h.api.UPD.state,'unset',
    'a failed deliberate retry must report a real error, not a silent unavailable service');
}

/* The resume scan runs before the first network byte and its only consumer is
   the storage preflight, which wants a byte estimate. It used to call
   updTransferGetFile() per file, which decodes the record and SHA-256s the
   whole thing — so every retry re-hashed everything already on disk while the
   panel truthfully showed 0 bytes and no speed, which is indistinguishable
   from a dead transfer. Counting sizes must not hash. */
{
  const entry=file('runtime.js','abcdefghijklmnopqrstuvwxyz'),rootHash='c'.repeat(64);
  let digests=0;
  const transfer={identity:'t-resume'};
  /* A completed file already on disk, exactly as an interrupted attempt left it. */
  const key='transfer-v1:'+transfer.identity+':file:'+entry.path;
  const h=makeHarness({
    records:{[key]:{size:entry.size,sha256:entry.sha256,text:entry.text}},
    cryptoImpl:{subtle:{digest:async(algorithm,bytes)=>{ digests++; return digestBytes(bytes); }}},
    fetchImpl:async()=>{ throw new Error('the resume scan must not reach the network'); }
  });
  const before=digests;
  const resume=await h.api.updTransferStoredBytes(transfer,[entry],0,null);
  assert.equal(resume.bytes,entry.size,
    'the resume scan did not credit a file that is already fully stored');
  assert.equal(digests-before,0,
    `the resume scan hashed stored content ${digests-before} time(s); it only needs sizes`);
}

/* A record whose declared identity does not match the manifest is not credited,
   so a corrupt or superseded leftover cannot shrink the storage estimate. */
{
  const entry=file('runtime.js','abcdefghijklmnopqrstuvwxyz');
  const transfer={identity:'t-resume-2'};
  const key='transfer-v1:'+transfer.identity+':file:'+entry.path;
  const h=makeHarness({
    records:{[key]:{size:entry.size,sha256:'9'.repeat(64),text:entry.text}},
    fetchImpl:async()=>{ throw new Error('no network'); }});
  const resume=await h.api.updTransferStoredBytes(transfer,[entry],0,null);
  assert.equal(resume.bytes,0,'a record with the wrong hash was counted as already downloaded');
  assert.equal(resume.largestIncomplete,entry.size);
}

/* PLAY OFFLINE used to latch the persistent Offline Mode switch, and the
   updater treats that switch as its one authoritative gate. When identity
   stalls, PLAY OFFLINE is the only enabled control, so the single reachable
   action permanently disabled the path that would deliver the fix. The launcher
   no longer latches it, and a deliberate tap on the update control now leaves
   Offline Mode rather than refusing with a dead RETRY. */
{
  let loads=0,cleared=0;
  const h=makeHarness({fetchImpl:async()=>{ throw new Error('no network expected'); }});
  h.api.setEndpoint('https://updates.invalid/update.json');
  h.api.setResolveEndpoint(async()=>'https://updates.invalid/update.json');
  h.api.setLoadManifest(async()=>{ loads++; throw new Error('unreachable'); });
  let forced=true;
  h.context.netForcedOffline=()=>forced;
  h.context.netSetOffline=(v)=>{ forced=!!v; if(!v) cleared++; };
  h.context.netBrowserOffline=()=>false;
  await h.api.updCheck(true);
  assert.equal(cleared,1,'a deliberate update tap did not leave Offline Mode');
  assert.equal(forced,false,'Offline Mode was still latched after an explicit check');
  assert.equal(loads,1,'the check did not proceed after leaving Offline Mode');
}
{
  /* An automatic pass must never change a setting the player chose. */
  let loads=0,changed=0,forced=true;
  const h=makeHarness({fetchImpl:async()=>{ throw new Error('no network expected'); }});
  h.api.setEndpoint('https://updates.invalid/update.json');
  h.api.setResolveEndpoint(async()=>'https://updates.invalid/update.json');
  h.api.setLoadManifest(async()=>{ loads++; throw new Error('unreachable'); });
  h.context.netForcedOffline=()=>forced;
  h.context.netSetOffline=()=>{ changed++; };
  h.context.netBrowserOffline=()=>false;
  await h.api.updCheck(false);
  assert.equal(changed,0,'an automatic pass changed the Offline Mode setting');
  assert.equal(loads,0,'an automatic pass reached the service while Offline Mode was on');
  assert.equal(h.api.UPD.state,'unset');
}

console.log('PASS Stage 8 updater interruption: check/channel ownership, truthful fallback size, resumable verified ranges, descriptor staging, reachability GC, storage preflight, idempotent same-root staging, cancellation, metadata-first staging/init, Apply/rollback, and serialized cross-document ownership guards');
