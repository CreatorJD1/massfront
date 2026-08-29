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
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
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
function file(path,text,url){
  const bytes=encoder.encode(text);
  return {path,size:bytes.byteLength,
          sha256:createHash('sha256').update(bytes).digest('hex'),
          ...(url?{url}:{}),bytes,text};
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

function makeHarness({records={},storage={},fetchImpl,cryptoImpl,
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
    navigator:{},URL,AbortController,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,
    performance,setTimeout,clearTimeout,queueMicrotask,
    fetch:fetchImpl||(()=>{ throw new Error('unexpected fetch'); }),
    crypto:cryptoImpl||{subtle:{digest:async(algorithm,bytes)=>{
      assert.equal(String(algorithm).toUpperCase(),'SHA-256');
      return digestBytes(bytes);
    }}}
  });
  vm.runInContext(updaterSource+`
    ;globalThis.__stage8Updater={UPD,updDownload,updCancel,updButton,
      updSetChannel,updCommitPending,updCommitApply,updCheck,updApply,updRollback,
      updAcquireSharedOperation,updReleaseSharedOperation,updCommitRollback,
      updRefreshSharedOperation,updPreparePrevious,updClearPreviousOwned,
      updGetBundleMeta,updPendingIdentity,updRunningIdentity,updBundleMeta,
      updTransferPlan,updKindForFiles,updPendingForChannel,
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
function bundleMeta(value){
  return {version:value.version,channel:value.channel||'stable',at:value.at,
    notes:value.notes||'',severity:value.severity||'recommended',
    kind:value.kind||'full',patchedFrom:value.patchedFrom||''};
}
function rollbackRef(key,value){
  return {key,version:value.version,channel:value.channel||'stable',at:value.at};
}
function setRunning(harness,value){
  harness.context.window.__MASSFRONT_PATCHED=value.version;
  harness.context.window.__MASSFRONT_PATCH_CHANNEL=value.channel||'stable';
  harness.context.window.__MASSFRONT_PATCH_AT=value.at;
}
function unchanged(harness,before,label){
  assert.deepEqual(harness.database.snapshot(),before.records,label+' changed durable records');
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

/* A failed second file keeps the old transaction intact. One RETRY DOWNLOAD
   activation must refetch from file zero with a fresh controller and commit
   exactly once. */
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
      return response(index===0||index===2?a:b)(signal);
    }
  });
  h.api.reset(manifest('2.0.0',[a,b]));
  const before={records:h.database.snapshot(),storage:h.localStorage.snapshot()};
  await h.api.updDownload();
  assert.equal(h.api.UPD.state,'error');
  assert.equal(h.api.UPD.retryDownload,true);
  const failedFeed=h.api.UPD.feed;
  unchanged(h,before,'network interruption');
  h.api.updButton();
  await waitFor(()=>h.api.UPD.state==='ready'&&h.api.UPD.downloadRun===0,
                'one-tap updater retry');
  assert.deepEqual(paths,['a.js','b.js','a.js','b.js'],
                   'retry did not restart from the first file');
  assert.notEqual(signals[0],signals[2],'retry reused the old AbortController');
  assert.notEqual(h.api.UPD.feed,failedFeed,'retry reused mutable feed rows');
  assert.equal(h.database.commits(),1,'retry committed more than once');
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
  failed.database.failNextWrite('AbortError');
  failed.api.reset(manifest('4.0.0',[entry]));
  const before={records:failed.database.snapshot(),storage:failed.localStorage.snapshot()};
  await failed.api.updDownload();
  assert.equal(failed.api.UPD.state,'error');
  assert.equal(failed.api.UPD.retryDownload,true);
  unchanged(failed,before,'failed atomic staging');

  const held=makeHarness({records:initialRecords,storage:initialStorage,
    fetchImpl:async(url,{signal})=>response(entry)(signal)});
  held.database.holdNextWrite();
  held.api.reset(manifest('4.0.0',[entry]));
  const run=held.api.updDownload();
  await waitFor(()=>held.api.UPD.state==='staging'&&held.database.hasHeldWrite(),
                'held atomic staging transaction');
  assert.equal(held.api.UPD.abort,null,'Cancel remained armed during atomic staging');
  held.api.updCancel();
  assert.equal(await held.api.updSetChannel('preview'),false,
               'channel changed during atomic staging');
  assert.deepEqual(held.database.snapshot(),initialRecords,
                   'records changed before the atomic transaction completed');
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
    {version:pending.version,channel:pending.channel,at:pending.at},
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
  const pending={version:'23.0.0',channel:'stable',at:2300,order:['a.js'],
                 files:{'a.js':'installed'}};
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
  assert.equal(h.database.get('probation').tries,0);
  assert.equal(h.database.get('operation'),undefined,'successful Apply leaked its lease');
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
  assert.deepEqual(database.get('operation').target,shown,
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
  const rollbackPayload={version:'24.0.0',channel:'stable',at:2400,order:['old.js'],
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

console.log('PASS Stage 8 updater interruption: check/channel ownership, truthful fallback size, mid-stream/late cancel, fresh retry, metadata-first staging/init, single-read OTA Apply, bounded A/B rollback slots, atomic pointer rollback, and serialized cross-document ownership guards');
