import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {closePwBrowser,launchPwBrowser} from './pw-browser.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const evidencePath=join(root,'tmp','verification','assetpack-browser-atomic.json');
const source=await readFile(join(root,'src','assetpack.js'),'utf8');
const sha256=data=>createHash('sha256').update(data).digest('hex');
const v1=Buffer.from('ABCDEFGHIJKL');
const v2=Buffer.from('mnopqrstuvwx');
const packId='browser-atomic',fileName='runtime/core.bin',chunkBytes=4;

function fileEntry(data){
  const chunks=[];
  for(let offset=0;offset<data.length;offset+=chunkBytes){
    const part=data.subarray(offset,Math.min(data.length,offset+chunkBytes));
    chunks.push({offset,size:part.length,sha256:sha256(part)});
  }
  return {name:fileName,size:data.length,sha256:sha256(data),chunks};
}
function manifest(data){
  const file=fileEntry(data);
  return {version:2,packs:{[packId]:{
    format:2,label:'Browser atomic pack',bytes:data.length,chunkSize:chunkBytes,files:[file]
  }}};
}
function finalKey(data){
  const file=fileEntry(data);
  return `${packId}/${file.name}:${file.size}:sha256:${file.sha256}`;
}

let offered='v1',failReplacement=true;
const requests=[];
const server=createServer((req,res)=>{
  const url=new URL(req.url||'/',`http://${req.headers.host||'127.0.0.1'}`);
  if(url.pathname==='/'){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end(`<!doctype html><meta charset="utf-8"><title>Asset Pack Browser Gate</title>
      <script>window.MASSFRONT_UPDATE_URL=location.origin+'/update.json';window.netAllowed=()=>true;</script>
      <script src="/src/assetpack.js"></script>`);
    return;
  }
  if(url.pathname==='/src/assetpack.js'){
    res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});
    res.end(source);return;
  }
  if(url.pathname==='/favicon.ico'){
    res.writeHead(204,{'cache-control':'no-store'});res.end();return;
  }
  if(url.pathname==='/packs.json'){
    const data=offered==='v1'?v1:v2;
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify(manifest(data)));return;
  }
  if(url.pathname===`/pack/${packId}/runtime/core.bin`){
    const data=offered==='v1'?v1:v2;
    const range=String(req.headers.range||'');
    requests.push({offered,range,at:new Date().toISOString()});
    const match=/^bytes=(\d+)-(\d+)$/.exec(range);
    if(!match){res.writeHead(400);res.end('range required');return;}
    const start=Number(match[1]),end=Number(match[2]);
    if(offered==='v2'&&failReplacement&&start===4){
      res.writeHead(503,{'cache-control':'no-store'});res.end('interrupted');return;
    }
    const body=data.subarray(start,end+1);
    res.writeHead(206,{
      'content-type':'application/octet-stream','content-length':String(body.length),
      'content-range':`bytes ${start}-${end}/${data.length}`,'cache-control':'no-store'
    });
    res.end(body);return;
  }
  res.writeHead(404);res.end('not found');
});

await new Promise((resolveListen,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolveListen);
});
const address=server.address();
const origin=`http://127.0.0.1:${address.port}`;
const evidence={
  schema:'MassfrontAssetPackBrowserEvidenceV1',status:'RUNNING',capturedAt:new Date().toISOString(),
  source:{path:'src/assetpack.js',sha256:sha256(source)},url:origin+'/',viewport:{width:412,height:900},
  gpu:null,browser:null,requests,assertions:[],expectedConsole:[],errors:[]
};

let browser=null,page=null,failure=null;
const note=(name,value=true)=>evidence.assertions.push({name,value});
const pageBytes=async()=>page.evaluate(async({packId,fileName})=>{
  const url=await window.MASSFRONT_ASSET_PACKS.url(packId,fileName);
  if(!url)return {url:null,bytes:[]};
  return {url,bytes:[...new Uint8Array(await (await fetch(url)).arrayBuffer())]};
},{packId,fileName});
const idbSnapshot=async()=>page.evaluate(async()=>{
  const db=await new Promise((resolveDb,reject)=>{
    const request=indexedDB.open('massfront-packs',2);
    request.onsuccess=()=>resolveDb(request.result);request.onerror=()=>reject(request.error);
  });
  try{
    const get=(store,key)=>new Promise((resolveValue,reject)=>{
      const request=db.transaction(store,'readonly').objectStore(store).get(key);
      request.onsuccess=()=>resolveValue(request.result);request.onerror=()=>reject(request.error);
    });
    const keys=store=>new Promise((resolveKeys,reject)=>{
      const request=db.transaction(store,'readonly').objectStore(store).getAllKeys();
      request.onsuccess=()=>resolveKeys(request.result.map(String));request.onerror=()=>reject(request.error);
    });
    return {
      files:await keys('files'),chunks:await keys('chunks'),meta:await keys('meta'),
      active:await get('meta','index:active'),offered:await get('meta','index:offered')
    };
  }finally{db.close();}
});

try{
  browser=await launchPwBrowser({headless:true});
  page=await browser.newPage({viewport:evidence.viewport,hasTouch:true});
  page.on('pageerror',error=>evidence.errors.push({type:'pageerror',message:error.message}));
  page.on('console',message=>{
    if(message.type()!=='error')return;
    const text=message.text();
    if(/Failed to load resource:.*503 \(Service Unavailable\)/i.test(text)){
      evidence.expectedConsole.push({type:'console',message:text});return;
    }
    evidence.errors.push({type:'console',message:text});
  });
  await page.goto(origin+'/',{waitUntil:'load'});
  const gpu=await assertHardwareGpu(page);
  evidence.gpu=gpu;evidence.browser={launcher:'tools/pw-browser.mjs',mode:'managed-shared'};
  await page.evaluate(()=>new Promise((resolveDelete,reject)=>{
    const request=indexedDB.deleteDatabase('massfront-packs');
    request.onsuccess=()=>resolveDelete();request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('IndexedDB delete blocked'));
  }));

  const first=await page.evaluate(packId=>window.MASSFRONT_ASSET_PACKS.install(packId),packId);
  assert.equal(first.ok,true);note('v1 installed');
  const before=await pageBytes();
  assert.deepEqual(before.bytes,[...v1]);note('v1 mounted from real IndexedDB');
  const v1Url=before.url;

  offered='v2';
  await page.evaluate(()=>window.MASSFRONT_ASSET_PACKS.loadIndex());
  const offeredStatus=await page.evaluate(packId=>window.MASSFRONT_ASSET_PACKS.status(packId),packId);
  assert.equal(offeredStatus.installed,true);
  assert.equal(offeredStatus.updateAvailable,true);note('v2 offer leaves v1 active');
  assert.equal((await pageBytes()).url,v1Url);note('v1 object URL retained before consent');

  const failed=await page.evaluate(packId=>window.MASSFRONT_ASSET_PACKS.install(packId),packId);
  assert.equal(failed.ok,false);note('v2 interruption rejected');
  const afterFailure=await pageBytes();
  assert.equal(afterFailure.url,v1Url);
  assert.deepEqual(afterFailure.bytes,[...v1]);note('interrupted v2 preserves v1 bytes');
  const staged=await idbSnapshot();
  assert.ok(staged.files.includes(finalKey(v1)));
  assert.equal(staged.files.includes(finalKey(v2)),false);
  assert.equal(staged.chunks.filter(key=>key.startsWith(packId+'/')).length,1);
  note('one verified v2 chunk persisted for resume');

  /* A navigation creates a new JavaScript realm while retaining the origin's
     real IndexedDB. This is the process-death/restart boundary the VM harness
     cannot model. */
  await page.reload({waitUntil:'load'});
  await page.evaluate(()=>window.MASSFRONT_ASSET_PACKS.loadIndex());
  const restarted=await page.evaluate(packId=>window.MASSFRONT_ASSET_PACKS.status(packId),packId);
  assert.equal(restarted.installed,true);
  assert.equal(restarted.updateAvailable,true);
  assert.deepEqual((await pageBytes()).bytes,[...v1]);note('reload restores active v1 and staged v2');

  const v2ZeroBefore=requests.filter(item=>item.offered==='v2'&&item.range==='bytes=0-3').length;
  failReplacement=false;
  const promoted=await page.evaluate(packId=>window.MASSFRONT_ASSET_PACKS.install(packId),packId);
  assert.equal(promoted.ok,true);note('resumed v2 promoted');
  const v2ZeroAfter=requests.filter(item=>item.offered==='v2'&&item.range==='bytes=0-3').length;
  assert.equal(v2ZeroAfter,v2ZeroBefore);note('verified first v2 chunk not downloaded again');
  const finalStatus=await page.evaluate(packId=>window.MASSFRONT_ASSET_PACKS.status(packId),packId);
  assert.equal(finalStatus.installed,true);
  assert.equal(finalStatus.updateAvailable,false);
  assert.deepEqual((await pageBytes()).bytes,[...v2]);note('v2 bytes mounted after atomic promotion');
  const finalDb=await idbSnapshot();
  assert.deepEqual(finalDb.files.filter(key=>key.startsWith(packId+'/')),[finalKey(v2)]);
  assert.equal(finalDb.chunks.filter(key=>key.startsWith(packId+'/')).length,0);
  assert.equal(finalDb.meta.includes('file:'+finalKey(v1)),false);
  assert.equal(finalDb.active&&finalDb.active.role,'active-v2');
  assert.equal(finalDb.offered&&finalDb.offered.role,'offered-v2');
  note('post-promotion stale final metadata and chunks collected');
  assert.equal(evidence.expectedConsole.length,1);note('deliberate interrupted transfer surfaced one expected 503');
  assert.equal(evidence.errors.length,0);note('no browser runtime errors');
  evidence.finalDb={files:finalDb.files,chunks:finalDb.chunks,meta:finalDb.meta};
  evidence.status='PASS';
}catch(error){
  failure=error;evidence.status='FAIL';evidence.errors.push({type:'test',message:error?.stack||String(error)});
}finally{
  if(browser){
    try{await closePwBrowser(browser);evidence.browser.cleanup='complete';}
    catch(error){
      evidence.errors.push({type:'cleanup',message:error?.stack||String(error)});
      if(!failure)failure=error;evidence.status='FAIL';
    }
  }
  await new Promise(resolveClose=>server.close(resolveClose));
  evidence.finishedAt=new Date().toISOString();
  await mkdir(dirname(evidencePath),{recursive:true});
  await writeFile(evidencePath,JSON.stringify(evidence,null,2)+'\n');
}

console.log(JSON.stringify({
  ok:evidence.status==='PASS',evidencePath,status:evidence.status,gpu:evidence.gpu,
  assertions:evidence.assertions.length,requestCount:requests.length
},null,2));
if(failure)throw failure;
