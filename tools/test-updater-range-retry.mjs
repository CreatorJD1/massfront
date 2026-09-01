import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const source=await readFile(resolve(root,'src/updater.js'),'utf8');
const constants=source.match(/const UPD_FETCH_ATTEMPTS=[^;]+;/)?.[0];
const start=source.indexOf('async function updReadResponseBytes');
const end=source.indexOf('async function updDownloadArtifact',start);
assert.ok(constants&&start>=0&&end>start,'updater retry implementation is missing');

const warnings=[];
let fetchImpl;
const math=Object.create(Math); math.random=()=>0;
const sandbox={
  URL,Date,Math:math,Uint8Array,AbortController,setTimeout,clearTimeout,
  location:{href:'https://localhost/'},navigator:{onLine:true},
  console:{warn:(...args)=>warnings.push(args)},
  UPD:{downloadRun:7,transferDiagnostic:null},
  fmtBytes(n){ return n+' B'; },
  updDownloadAbort(){ const error=new Error('Download cancelled');error.name='AbortError';return error; },
  updAssertDownload(run,ac){
    if(sandbox.UPD.downloadRun!==run||(ac&&ac.signal&&ac.signal.aborted))
      throw sandbox.updDownloadAbort();
  },
  async updVerifyHash(bytes,want,path,run,ac){
    sandbox.updAssertDownload(run,ac);
    const got=createHash('sha256').update(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength)).digest('hex');
    if(got!==want) throw new Error(path+': integrity check failed');
  },
  fetch(...args){ return fetchImpl(...args); }
};
vm.createContext(sandbox);
vm.runInContext(constants+'\n'+source.slice(start,end)+`\n;globalThis.retryApi={
  updFetchArtifactPart,updArtifactAttemptUrl,updArtifactDiagnostic
};`,sandbox,{filename:'src/updater.js:range-retry'});
const api=sandbox.retryApi;

const bytes=new TextEncoder().encode('ABCDEFGHIJ');
const hash=value=>createHash('sha256').update(value).digest('hex');
const file={path:'ota/00-runtime.js',size:bytes.byteLength,sha256:hash(bytes)};
const chunks=[
  {offset:0,size:4,sha256:hash(bytes.slice(0,4))},
  {offset:4,size:4,sha256:hash(bytes.slice(4,8))},
  {offset:8,size:2,sha256:hash(bytes.slice(8))}
];
const manifest={version:'1.33.62'};
function headers(values={}){
  const map=new Map(Object.entries(values).map(([key,value])=>[key.toLowerCase(),value]));
  return {get:key=>map.get(String(key).toLowerCase())||null};
}
function rangeResponse(chunk=chunks[0],body=bytes.slice(chunk.offset,chunk.offset+chunk.size)){
  return {ok:true,status:206,headers:headers({
    'content-range':`bytes ${chunk.offset}-${chunk.offset+chunk.size-1}/${file.size}`,
    'content-type':'application/javascript'
  }),body:null,async arrayBuffer(){
    return body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength);
  }};
}
function statusResponse(status){
  return {ok:false,status,headers:headers(),body:null,async arrayBuffer(){ return new ArrayBuffer(0); }};
}
async function call({src='https://cdn.example/releases/ota/00-runtime.js',chunk=chunks[0],
                     index=0,onRead=()=>{}}={}){
  const ac=new AbortController();
  return api.updFetchArtifactPart(src,manifest,file,chunk,index,chunks.length,7,ac,onRead);
}
function reset(){ sandbox.UPD.downloadRun=7;sandbox.UPD.transferDiagnostic=null;warnings.length=0; }

/* Fetch rejection is a transport fault: retry from the immutable original,
   preserve the Range header, and force a fresh CDN resolution on each retry. */
reset();
{
  const calls=[];
  fetchImpl=async(url,options)=>{
    calls.push({url,range:options.headers.Range});
    if(calls.length<3) throw new TypeError('simulated redirect failure');
    return rangeResponse();
  };
  const result=await call();
  assert.deepEqual([...result.bytes], [...bytes.slice(0,4)]);
  assert.equal(calls.length,3);
  assert.ok(!calls[0].url.includes('mf_retry='));
  assert.ok(calls[1].url.includes('mf_retry=2-')&&calls[2].url.includes('mf_retry=3-'));
  assert.deepEqual(calls.map(call=>call.range),['bytes=0-3','bytes=0-3','bytes=0-3']);
  assert.equal(sandbox.UPD.transferDiagnostic.outcome,'recovered');
  assert.equal(sandbox.UPD.transferDiagnostic.attempt,3);
}

/* Every explicitly transient HTTP class gets one bounded retry. */
for(const status of [408,425,429,500,503]){
  reset();let calls=0;
  fetchImpl=async()=>++calls===1?statusResponse(status):rangeResponse();
  await call();
  assert.equal(calls,2,'HTTP '+status+' was not retried exactly once');
}

/* A short body rolls its streamed bytes out of retained progress, then retries.
   Network-rate accounting may still count those physical bytes separately. */
reset();
{
  let calls=0;const deltas=[];
  fetchImpl=async()=>++calls===1?rangeResponse(chunks[0],bytes.slice(0,2)):rangeResponse();
  await call({onRead:n=>{deltas.push(n);return n;}});
  assert.equal(calls,2);
  assert.deepEqual(deltas,[2,-2,4]);
  assert.equal(deltas.reduce((sum,n)=>sum+n,0),chunks[0].size);
}

/* Deterministic client/server contract failures and integrity failures must not
   be hidden by three identical downloads. */
reset();
{
  let calls=0;
  fetchImpl=async()=>{calls++;return statusResponse(404);};
  await assert.rejects(call(),error=>{
    assert.equal(error.updateDiagnostic.status,404);
    assert.equal(error.updateDiagnostic.outcome,'failed');
    return true;
  });
  assert.equal(calls,1);
}
reset();
{
  let calls=0;
  fetchImpl=async()=>{calls++;return rangeResponse(chunks[0],new TextEncoder().encode('WXYZ'));};
  await assert.rejects(call(),/integrity check failed/);
  assert.equal(calls,1);
}

/* Three failures are the hard ceiling, and diagnostics disclose the host/range
   shape without copying a signed URL or query token. */
reset();
{
  let calls=0;
  const signed='https://private.example/object?X-Amz-Signature=TOPSECRET&token=NOPE';
  const seen=[];
  fetchImpl=async url=>{calls++;seen.push(url);throw new TypeError('failed '+signed);};
  await assert.rejects(call({src:signed}),error=>{
    const encoded=JSON.stringify(error.updateDiagnostic);
    assert.equal(error.message,'ota/00-runtime.js: network request failed');
    assert.equal(error.updateDiagnostic.attempt,3);
    assert.equal(error.updateDiagnostic.maxAttempts,3);
    assert.equal(error.updateDiagnostic.host,'private.example');
    assert.equal(JSON.stringify(error.updateDiagnostic.range),
      JSON.stringify({index:1,count:3,start:0,end:3}));
    assert.ok(!/TOPSECRET|NOPE|X-Amz|token=/i.test(encoded));
    return true;
  });
  assert.equal(calls,3);
  assert.ok(seen.every(url=>url===signed),'signed URL query was modified during retry');
  assert.ok(warnings.every(row=>!/TOPSECRET|NOPE|X-Amz|token=/i.test(JSON.stringify(row))));
}

/* Player cancellation interrupts the backoff instead of waiting for another
   socket attempt. */
reset();
{
  let calls=0;
  fetchImpl=async()=>{calls++;throw new TypeError('radio dropped');};
  const ac=new AbortController(),started=Date.now();
  const pending=api.updFetchArtifactPart('https://cdn.example/object',manifest,file,
    chunks[0],0,chunks.length,7,ac,()=>{});
  setTimeout(()=>ac.abort(),15);
  await assert.rejects(pending,error=>error&&error.name==='AbortError');
  assert.equal(calls,1);
  assert.ok(Date.now()-started<180,'cancel waited through retry backoff');
}

console.log(JSON.stringify({ok:true,attempts:3,retryHttp:[408,425,429,500,503],
  incompleteBody:true,integritySingleAttempt:true,cancellationImmediate:true,
  diagnostics:'sanitized-host-range-online'},null,2));
