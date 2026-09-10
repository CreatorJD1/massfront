#!/usr/bin/env node
/* Small fixture-only build proof. Does not copy the real Galactic tree, upload
   anything, or claim installed-device/native-mount acceptance. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,readFile,readdir,symlink} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertNoVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';
import {buildExplorationDelivery,immutableContentBase,CONTENT_CHUNK_BYTES,CONTENT_MAX_FILES,CONTENT_MAX_FILE_BYTES,CONTENT_MAX_MANIFEST_BYTES} from './build-exploration-delivery.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
await assertNoVerificationFreeze(root);
await mkdir(join(root,'tmp/exploration-delivery-build'),{recursive:true});
const out=await mkdtemp(join(root,'tmp/exploration-delivery-build/run-'));
const version='1.33.76',base='https://massfront-update.jasondixon1994.workers.dev/f/1.33.76/content-fixture/';
const checks=[],check=async(name,fn)=>{await fn();checks.push({name,pass:true});console.log('PASS '+name);};
const json=value=>JSON.stringify(value,null,2)+'\n';
function withSelfHash(value){const result={...value};delete result.hash;result.hash='sha256-'+sha(Buffer.from(JSON.stringify(result)));return result;}
async function fixture(name){
  const moduleRoot=join(out,name),manifestPath=join(moduleRoot,'dist/exploration-content-manifest-v1.json');
  const values=new Map([['index.html',Buffer.from('<!doctype html><title>Fixture</title>')],['assets/sample.bin',Buffer.alloc(CONTENT_CHUNK_BYTES+31,97)],['src/start.js',Buffer.from('globalThis.fixture=true;\n')]]);
  for(const [path,bytes] of values){await mkdir(dirname(join(moduleRoot,path)),{recursive:true});await writeFile(join(moduleRoot,path),bytes,{flag:'wx'});}
  const manifest=withSelfHash({schemaVersion:1,kind:'ExplorationContentManifestV1',contentVersion:'fixture-dev',compatibleGameRange:'developer-builds-only',delivery:'base',totalBytes:[...values.values()].reduce((n,b)=>n+b.length,0),files:[...values].map(([path,bytes])=>({path,bytes:bytes.length,hash:'sha256-'+sha(bytes),kind:path.startsWith('assets/')?'asset':'runtime-code'}))});
  await mkdir(dirname(manifestPath));await writeFile(manifestPath,json(manifest),{flag:'wx'});
  return {moduleRoot,manifestPath,manifest,values,output:join(out,name+'-output'),root,version,base};
}
async function mutate(f,fn,{rehash=true}={}){fn(f.manifest);await writeFile(f.manifestPath,json(rehash?withSelfHash(f.manifest):f.manifest));}
async function rejects(name,change,pattern){await check(name,async()=>{const f=await fixture(name);await change(f);await assert.rejects(()=>buildExplorationDelivery(f),pattern);assert.equal((await readdir(out)).includes(name+'-output'),false,'failed input must not create output');});}
try{
  const good=await fixture('valid');let built,manifest,descriptor;
  await check('valid module-only closure and raw-manifest descriptor',async()=>{
    built=await buildExplorationDelivery(good);assert.equal(built.reused,false);
    const raw=await readFile(join(good.output,'exploration-content-manifest-v2.json'));manifest=JSON.parse(raw);descriptor=JSON.parse(await readFile(join(good.output,'delivery.json')));
    assert.equal(descriptor.schema,'MassfrontExplorationPackRemoteV2');assert.equal(descriptor.manifestSha256,sha(raw));assert.equal(descriptor.manifestBytes,raw.length);
    assert.equal(descriptor.base,base);assert.equal(descriptor.manifest,base+'exploration-content-manifest-v2.json');assert.equal(descriptor.version,version);assert.equal(descriptor.downloadQuery,'');
    assert.equal(manifest.schemaVersion,2);assert.equal(manifest.kind,'ExplorationContentManifestV1');assert.equal(manifest.contentVersion,version);assert.equal(manifest.compatibleGameRange,'='+version);assert.equal(manifest.delivery,'startup');assert.deepEqual(withSelfHash(manifest),manifest);
    assert.equal(built.files,3);for(const [path,bytes] of good.values)assert((await readFile(join(good.output,path))).equals(bytes));
  });
  await check('canonical <=2MiB chunks and whole hashes',async()=>{
    for(const entry of manifest.files){const bytes=good.values.get(entry.path);assert.equal(entry.sha256,sha(bytes));assert.equal(entry.hash,'sha256-'+sha(bytes));let offset=0;for(const chunk of entry.chunks){assert.equal(chunk.offset,offset);assert.equal(chunk.size,Math.min(CONTENT_CHUNK_BYTES,bytes.length-offset));assert.equal(chunk.sha256,sha(bytes.subarray(offset,offset+chunk.size)));offset+=chunk.size;}assert.equal(offset,bytes.length);}
    assert.equal(manifest.files.find(f=>f.path==='assets/sample.bin').chunks.length,2);
  });
  await check('separate payload inventory is not executable OTA',async()=>{
    const inventory=JSON.parse(await readFile(join(good.output,'payload-inventory.json')));assert.equal(inventory.executableOta,false);assert.equal(inventory.files,undefined);assert.equal(inventory.full,undefined);assert.equal(inventory.entries.length,3);assert.equal(inventory.totalBytes,good.manifest.totalBytes+descriptor.manifestBytes);assert.equal(inventory.manifest.sha256,descriptor.manifestSha256);
  });
  await check('identical candidate reuse writes no replacement',async()=>{const result=await buildExplorationDelivery(good);assert.equal(result.reused,true);assert.equal(result.manifestSha256,built.manifestSha256);});
  await check('existing changed candidate is preserved and refused',async()=>{const path=join(good.output,'delivery.json'),bytes=Buffer.concat([await readFile(path),Buffer.from(' ')]);await writeFile(path,bytes);await assert.rejects(()=>buildExplorationDelivery(good),/DELIVERY_OUTPUT_CONFLICT/);assert((await readFile(path)).equals(bytes));});
  await check('same-length altered payload is preserved and refused',async()=>{const f=await fixture('payload-conflict');await buildExplorationDelivery(f);const path=join(f.output,'src/start.js'),bytes=Buffer.alloc(f.values.get('src/start.js').length,33);await writeFile(path,bytes);await assert.rejects(()=>buildExplorationDelivery(f),/DELIVERY_OUTPUT_CONFLICT/);assert((await readFile(path)).equals(bytes));});
  await check('pre-existing empty candidate is not replaced',async()=>{const f=await fixture('empty-output');await mkdir(f.output);await assert.rejects(()=>buildExplorationDelivery(f),/DELIVERY_OUTPUT_CONFLICT/);assert.deepEqual(await readdir(f.output),[]);});
  await rejects('stale-bytes',async f=>{await writeFile(join(f.moduleRoot,'src/start.js'),Buffer.alloc(f.values.get('src/start.js').length,33));},/DELIVERY_SOURCE_SHA_MISMATCH/);
  await rejects('wrong-size',async f=>{await writeFile(join(f.moduleRoot,'src/start.js'),'wrong');},/DELIVERY_SOURCE_SIZE_MISMATCH/);
  await rejects('manifest-tamper',f=>mutate(f,m=>{m.delivery='startup';},{rehash:false}),/DELIVERY_MANIFEST_HASH_MISMATCH/);
  await rejects('total-tamper',f=>mutate(f,m=>{m.totalBytes++;}),/DELIVERY_TOTAL_MISMATCH/);
  await rejects('wrong-kind',f=>mutate(f,m=>{m.kind='UnrelatedManifest';}),/DELIVERY_MANIFEST_INVALID/);
  await rejects('missing-entrypoint',f=>mutate(f,m=>{m.files[0].path='src/entry.html';}),/DELIVERY_ENTRYPOINT_MISSING/);
  await rejects('authoring-content',f=>mutate(f,m=>{m.files[1].path='assets/source/private.blend';}),/DELIVERY_NON_RUNTIME_PATH/);
  await rejects('traversal',f=>mutate(f,m=>{m.files[0].path='../escape.html';}),/DELIVERY_PATH_INVALID/);
  await rejects('backslash-path',f=>mutate(f,m=>{m.files[0].path='assets\\escape.html';}),/DELIVERY_PATH_INVALID/);
  await rejects('encoded-traversal',f=>mutate(f,m=>{m.files[0].path='%2e%2e/escape.html';}),/DELIVERY_PATH_INVALID/);
  await rejects('case-collision',f=>mutate(f,m=>{m.files.push({...m.files[0],path:m.files[0].path.toUpperCase()});m.totalBytes+=m.files[0].bytes;}),/DELIVERY_DUPLICATE_PATH/);
  await rejects('parent-file-collision',f=>mutate(f,m=>{m.files[1].path='src/start.js/child.bin';}),/DELIVERY_PATH_COLLISION/);
  await rejects('reserved-metadata',f=>mutate(f,m=>{m.files[0].path='delivery.json';}),/DELIVERY_RESERVED_PATH/);
  await rejects('windows-device-path',f=>mutate(f,m=>{m.files[0].path='AUX.txt';}),/DELIVERY_PATH_INVALID/);
  await rejects('input-symlink',async f=>{await symlink(join(f.moduleRoot,'assets'),join(f.moduleRoot,'src/linked-assets'),process.platform==='win32'?'junction':'dir');await mutate(f,m=>{m.files[1].path='src/linked-assets/sample.bin';});},/DELIVERY_SYMLINK_REFUSED/);
  await check('output symlink is refused without touching target',async()=>{const f=await fixture('output-link');await symlink(f.moduleRoot,f.output,process.platform==='win32'?'junction':'dir');await assert.rejects(()=>buildExplorationDelivery(f),/DELIVERY_SYMLINK_REFUSED/);assert.equal((await readdir(f.moduleRoot)).includes('delivery.json'),false);});
  await check('missing source file is refused',async()=>{const f=await fixture('missing');await mutate(f,m=>{m.files[2].path='src/not-present.js';});await assert.rejects(()=>buildExplorationDelivery(f),/DELIVERY_SOURCE_MISSING/);});
  await check('unsafe output locations are refused',async()=>{for(const output of [root,join(root,'src/candidate'),join(out,'../..'),resolve(root,'../outside-candidate')])await assert.rejects(()=>buildExplorationDelivery({...good,output}),/DELIVERY_OUTPUT_INVALID/);});
  await check('immutable HTTPS URL contract rejects mutable and disguised paths',async()=>{
    for(const url of ['http://example.test/f/1.33.76/content-r5/','https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main/exploration-pack/','https://example.test/f/1.33.75/content-r5/','https://example.test/f/1.33.76/content-r5/?q=1','https://user:pass@example.test/f/1.33.76/content-r5/','https://example.test/f/1.33.76/content-r5/../other/','https://example.test/f/1.33.76/content-r5/%2e%2e/','https://example.test/f//1.33.76/content-r5/','https://example.test/f/1.33.76-content-r5/'])assert.throws(()=>immutableContentBase(url,version),/DELIVERY_BASE_/);
    const hf='https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/'+'a'.repeat(40)+'/v1.33.76-content-r5';assert.equal(immutableContentBase(hf,version),hf+'/');assert.equal(immutableContentBase(base.slice(0,-1),version),base);
  });
  const workerSource=await readFile(join(root,'cloudflare/massfront-update/src/index.js'),'utf8');
  await check('actual Worker accepts generated URLs and maps exact R2 keys',async()=>{
    // Execute the actual Worker handler with local R2 storage doubles. There
    // is no live fetch, server, upload, or parallel reimplementation of its regex.
    const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(workerSource).toString('base64'));
    const keys=[],env={RELEASES:{head:async key=>{keys.push(key);return {size:32,httpEtag:'fixture',writeHttpMetadata:headers=>headers.set('content-type','application/octet-stream')};},get:async()=>{throw new Error('HEAD must not read R2 bodies');}}};
    for(const path of [...manifest.files.map(entry=>entry.path),'exploration-content-manifest-v2.json']){
      const response=await worker.fetch(new Request(base+path,{method:'HEAD'}),env);assert.equal(response.status,200);assert.equal(keys.at(-1),'massfront/'+version+'/content-fixture/'+path);assert.equal(response.headers.get('accept-ranges'),'bytes');
    }
    const invalid=await worker.fetch(new Request('https://massfront-update.jasondixon1994.workers.dev/f/1.33.76-content-r5/index.html',{method:'HEAD'}),env);assert.equal(invalid.status,400,'old version-suffixed route must remain rejected');
  });
  const clientSource=await readFile(join(root,'src/assetpack.js'),'utf8');
  await check('builder caps equal actual client file/chunk limits',async()=>{
    const constant=name=>{const match=clientSource.match(new RegExp('\\b'+name+'\\s*=\\s*(\\d+(?:\\s*\\*\\s*\\d+)*)'));assert(match,name+' exists');return match[1].split('*').reduce((n,v)=>n*Number(v.trim()),1);};
    assert.equal(CONTENT_MAX_FILES,constant('PACK_MAX_FILES'));assert.equal(CONTENT_MAX_FILE_BYTES,constant('PACK_MAX_FILE_BYTES'));assert(CONTENT_CHUNK_BYTES<=constant('PACK_MAX_CHUNK_BYTES'));assert(Math.ceil(CONTENT_MAX_FILE_BYTES/CONTENT_CHUNK_BYTES)<=constant('PACK_MAX_CHUNKS_PER_FILE'));
    assert.match(clientSource,/manifestBytes\s*<=\s*8\s*\*\s*1024\s*\*\s*1024/);assert.equal(CONTENT_MAX_MANIFEST_BYTES,8*1024*1024);
  });
  await rejects('file-count-over-cap',f=>mutate(f,m=>{m.files=Array.from({length:CONTENT_MAX_FILES+1},(_,i)=>({path:i?'assets/cap-'+i+'.bin':'index.html',bytes:1,hash:'sha256-'+sha(Buffer.from('a'))}));m.totalBytes=m.files.length;}),/DELIVERY_FILE_COUNT_LIMIT/);
  await rejects('file-size-over-cap',f=>mutate(f,m=>{m.totalBytes+=CONTENT_MAX_FILE_BYTES+1-m.files[1].bytes;m.files[1].bytes=CONTENT_MAX_FILE_BYTES+1;}),/DELIVERY_FILE_SIZE_LIMIT/);
  await check('exact 4096-file cap proceeds to source validation',async()=>{const f=await fixture('file-count-boundary');await mutate(f,m=>{m.files=Array.from({length:CONTENT_MAX_FILES},(_,i)=>({path:i?'assets/cap-'+i+'.bin':'index.html',bytes:1,hash:'sha256-'+sha(Buffer.from('a'))}));m.totalBytes=m.files.length;});await assert.rejects(()=>buildExplorationDelivery(f),/DELIVERY_SOURCE_MISSING/);});
  await check('exact 256MiB cap proceeds to source validation without huge allocation',async()=>{const f=await fixture('file-size-boundary');await mutate(f,m=>{m.totalBytes+=CONTENT_MAX_FILE_BYTES-m.files[1].bytes;m.files[1].bytes=CONTENT_MAX_FILE_BYTES;});await assert.rejects(()=>buildExplorationDelivery(f),/DELIVERY_SOURCE_SIZE_MISMATCH/);});
  await rejects('generated-manifest-over-cap',f=>mutate(f,m=>{m.allowlistRules=['x'.repeat(CONTENT_MAX_MANIFEST_BYTES)];}),/DELIVERY_MANIFEST_SIZE_LIMIT/);
  await rejects('worker-relative-path-over-cap',f=>mutate(f,m=>{m.files[1].path='assets/'+'a'.repeat(500);}),/DELIVERY_WORKER_PATH_INVALID/);
  await assertNoVerificationFreeze(root);
  const report={pass:true,scope:'Small synthetic module fixtures and actual Worker handler with local R2 doubles only; no real content build, network request, upload, native mount, or device acceptance.',output:out,checks,workerSourceSha256:sha(Buffer.from(workerSource)),clientSourceSha256:sha(Buffer.from(clientSource)),builderSha256:sha(await readFile(join(root,'tools/build-exploration-delivery.mjs'))),testSha256:sha(await readFile(fileURLToPath(import.meta.url)))};
  await writeFile(join(out,'report.json'),json(report),{flag:'wx'});console.log(JSON.stringify({pass:true,checks:checks.length,report:join(out,'report.json')}));
}catch(error){await writeFile(join(out,'failure.json'),json({pass:false,checks,error:error.stack}),{flag:'wx'});throw error;}
