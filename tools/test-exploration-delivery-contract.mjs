/* Isolated filesystem/HTTP/R2 doubles. Never a live upload or device acceptance. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,readFile,symlink} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {assertNoVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';
import {CONTENT_CHUNK_BYTES as CHUNK} from './build-exploration-delivery.mjs';
import {EXPLORATION_MIRROR as HOST,EXPLORATION_MANIFEST as MANIFEST,validateExplorationDescriptor,
  descriptorFromVerifiedOta,validateExplorationManifest,validateLocalExplorationDelivery,
  verifyRemoteExplorationDelivery,verifyRemoteContentEntry,contentMime} from './exploration-delivery-contract.mjs';
import {contentObjectKey,prepareExplorationMirror,r2ProcessSpec} from './mirror-exploration-content-to-cloudflare.mjs';
import {verifyActivationPayloads,activateWithChecks} from './release-activation-contract.mjs';

const ROOT=resolve(import.meta.dirname,'..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),
  encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n'),copy=value=>JSON.parse(JSON.stringify(value)),checks=[];
await assertNoVerificationFreeze(ROOT);
await mkdir(resolve(ROOT,'tmp/exploration-delivery-contract'),{recursive:true});
const out=await mkdtemp(resolve(ROOT,'tmp/exploration-delivery-contract/run-'));
const test=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
function fixture(){
  const version='1.33.76',base=`${HOST}/f/${version}/content-r6/`,payload=new Map([
    ['index.html',Buffer.from('<!doctype html><title>Isolated fixture</title>')],
    ['src/start.js',Buffer.from('window.fixture=true;')],['assets/audio/fixture.ogg',Buffer.alloc(CHUNK+17,37)]]),
    files=[...payload].sort(([a],[b])=>a.localeCompare(b)).map(([path,bytes])=>{
      const chunks=[];for(let offset=0;offset<bytes.length;offset+=CHUNK){const part=bytes.subarray(offset,offset+CHUNK);chunks.push({offset,size:part.length,sha256:sha(part)});}
      return {path,bytes:bytes.length,hash:'sha256-'+sha(bytes),sha256:sha(bytes),kind:'fixture',chunks};
    }),manifest={schemaVersion:2,kind:'ExplorationContentManifestV1',contentVersion:version,compatibleGameRange:'='+version,
      delivery:'startup',optional:false,resumable:true,chunkSize:CHUNK,totalBytes:files.reduce((n,f)=>n+f.bytes,0),files};
  const F={version,base,payload,manifest};rebind(F);return F;
}
function rebind(F){
  delete F.manifest.hash;F.manifest.hash='sha256-'+sha(Buffer.from(JSON.stringify(F.manifest)));F.raw=encode(F.manifest);
  F.descriptor={schema:'MassfrontExplorationPackRemoteV2',kind:'ExplorationPackRemote',version:F.version,base:F.base,
    manifest:F.base+MANIFEST,manifestSha256:sha(F.raw),manifestBytes:F.raw.length,downloadQuery:''};
  F.entries=F.manifest.files.map(f=>({path:f.path,url:F.base+f.path,size:f.bytes,sha256:f.sha256,chunks:f.chunks}));
  F.manifestEntry={path:MANIFEST,url:F.base+MANIFEST,size:F.raw.length,sha256:sha(F.raw)};
  F.inventory={schema:'MassfrontExplorationDeliveryInventoryV1',version:F.version,base:F.base,executableOta:false,
    sourceManifestSha256:'1'.repeat(64),manifest:F.manifestEntry,totalBytes:F.manifest.totalBytes+F.raw.length,entries:F.entries};
  return F;
}
function carriers(F,flag='true',stub=F.descriptor){return new Map([
  ['ota/00-runtime.js',Buffer.from(flag===null?'window.legacy=true;':`window.__MF_OTA_HAS_GALACTIC_DELIVERY=${flag};`)],
  ['src/assetpack.js',Buffer.from(stub?`const EXP_PACK_STUB='data:application/json;base64,${encode(stub).toString('base64')}';`:'const EXP_PACK_STUB="assets/legacy.json";')]]);}
function network(F,{failure='',objects=new Map([...F.payload].map(([path,bytes])=>[F.base+path,bytes]).concat([[F.base+MANIFEST,F.raw]])),seen=[]}={}){
  const target=F.base+'assets/audio/fixture.ogg';
  const fetchImpl=async(rawUrl,options={})=>{
    const url=new URL(rawUrl);url.search='';const key=url.href,bytes=objects.get(key),range=options.headers?.Range,android=/Android/.test(options.headers?.['User-Agent']||'');
    assert.equal(options.redirect,'manual');assert.equal(options.headers['Accept-Encoding'],'identity');
    seen.push({url:key,method:options.method||'GET',range,android});
    if(!bytes||failure==='missing'&&key===target)return new Response(null,{status:404});
    const headers={'access-control-allow-origin':'*','access-control-expose-headers':'content-range',
      'access-control-allow-methods':'GET, HEAD, OPTIONS','access-control-allow-headers':'Range','accept-ranges':'bytes','content-length':String(bytes.length),
      'content-type':contentMime(url.pathname)};
    if(failure==='mime'&&key===target)headers['content-type']='text/javascript';
    if(failure==='cors'&&key===target)delete headers['access-control-allow-origin'];
    if(failure==='encoding'&&key===target)headers['content-encoding']='gzip';
    if(options.method==='OPTIONS'){
      if(failure==='preflight'&&key===target)headers['access-control-allow-headers']='content-type';
      return new Response(null,{status:204,headers});
    }
    if(failure==='redirect'&&key===target)return new Response(null,{status:302,headers:{location:'https://not-authority.invalid'}});
    if(range&&(!android||failure==='android-range')){
      const [,a,b]=range.match(/^bytes=(\d+)-(\d+)$/),start=Number(a),end=Number(b);
      headers['content-range']=`bytes ${start}-${end}/${bytes.length}`;headers['content-length']=String(end-start+1);
      if(failure==='range'&&key===target)headers['content-range']='bytes 0-1/999';
      if(failure==='range-cors'&&key===target)delete headers['access-control-expose-headers'];
      return new Response(bytes.subarray(start,end+1),{status:206,headers});
    }
    if(failure==='length'&&key===target)headers['content-length']=String(bytes.length+1);
    if(failure==='no-length'&&!range)delete headers['content-length'];
    if(failure==='manifest-corrupt'&&key===F.base+MANIFEST)return new Response(Buffer.alloc(bytes.length),{status:200,headers});
    if(failure==='corrupt'&&key===target||failure==='android-corrupt'&&android)return new Response(Buffer.alloc(bytes.length),{status:200,headers});
    return new Response(bytes,{status:200,headers});
  };
  return {fetchImpl,objects,seen};
}
async function local(F,label){
  const directory=join(out,label);await mkdir(directory);
  for(const [path,bytes] of F.payload){const file=resolve(directory,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);}
  await writeFile(join(directory,MANIFEST),F.raw);await writeFile(join(directory,'delivery.json'),encode(F.descriptor));await writeFile(join(directory,'payload-inventory.json'),encode(F.inventory));
  return directory;
}
function release(artifacts,version='1.33.76'){
  const full=[...artifacts].map(([path,bytes])=>({path,size:bytes.length,sha256:sha(bytes),url:`${HOST}/f/${version}/${path}`})),
    candidate={schema:3,channel:'stable',version,kind:'full',category:'overhaul',base:`${HOST}/f/${version}/`,files:full.slice(),full},
    fp=full.map(f=>`${f.path}|${f.size}|${f.sha256}|-`).join('\n');
  candidate.payloadRoot=candidate.fullRoot=sha(fp);candidate.runtimeRoot=sha(full.map(f=>`${f.path}|${f.size}|${f.sha256}`).join('\n'));
  candidate.manifestRoot=sha([`schema=3`,`channel=stable`,`version=${version}`,`kind=full`,`category=overhaul`,`patchFrom=`,
    `payload=${candidate.payloadRoot}`,`full=${candidate.fullRoot}`,`runtime=${candidate.runtimeRoot}`].join('\n'));
  return candidate;
}

await test('typed descriptor and actual Worker key contract agree',()=>{const F=fixture();assert.equal(validateExplorationDescriptor(F.descriptor,F.version),F.descriptor);
  assert.equal(contentObjectKey(F.descriptor,F.entries[0]),'massfront/1.33.76/content-r6/'+F.entries[0].path);});
await test('immutable manifest binds whole/chunk identities',()=>{const F=fixture();assert.equal(validateExplorationManifest(F.raw,F.descriptor).entries.length,3);});
for(const [name,mutate] of [
  ['wrong version',F=>F.descriptor.version='1.33.75'],['mutable base',F=>F.descriptor.base='https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main/exploration-pack/'],
  ['wrong manifest URL',F=>F.descriptor.manifest=F.base+'other.json'],['oversized manifest',F=>F.descriptor.manifestBytes=8*1024*1024+1],
  ['untyped extra',F=>F.descriptor.files=[]]])await test('descriptor refuses '+name,()=>{const F=fixture();mutate(F);assert.throws(()=>validateExplorationDescriptor(F.descriptor,F.version));});
for(const [name,mutate] of [
  ['traversal',M=>M.files[0].path='../secret'],['duplicate',M=>M.files[1].path=M.files[0].path],['authoring source',M=>M.files[0].path='assets/source/probe.glb'],
  ['incompatible version',M=>M.compatibleGameRange='*'],['oversized file',M=>M.files[0].bytes=256*1024*1024+1],
  ['noncanonical chunks',M=>M.files[0].chunks[0].size--],['too many files',M=>M.files=Array(4097).fill(M.files[0])],
  ['whole hash disagreement',M=>M.files[0].hash='sha256-'+'0'.repeat(64)],['wrong total',M=>M.totalBytes++]])
  await test('manifest refuses '+name,()=>{const F=fixture();mutate(F.manifest);rebind(F);assert.throws(()=>validateExplorationManifest(F.raw,F.descriptor));});
await test('raw manifest and self-hash tampering are independently rejected',()=>{const F=fixture();const raw=Buffer.from(F.raw);raw[0]=32;assert.throws(()=>validateExplorationManifest(raw,F.descriptor));
  F.manifest.hash='sha256-'+'0'.repeat(64);F.raw=encode(F.manifest);F.descriptor.manifestBytes=F.raw.length;F.descriptor.manifestSha256=sha(F.raw);assert.throws(()=>validateExplorationManifest(F.raw,F.descriptor),/self-hash/);});
await test('descriptor decoded from verified OTA bytes only',()=>{const F=fixture();assert.deepEqual(descriptorFromVerifiedOta(carriers(F),F.version),F.descriptor);});
await test('flag without a bound descriptor fails closed',()=>{const F=fixture();assert.throws(()=>descriptorFromVerifiedOta(carriers(F,'true',null),F.version),/no bound/);});
await test('typed descriptor without a true delivery flag fails closed',()=>{const F=fixture();assert.throws(()=>descriptorFromVerifiedOta(carriers(F,'false'),F.version),/lacks/);});
await test('ambiguous capability assignment fails closed',()=>{const F=fixture(),C=carriers(F);C.set('ota/00-runtime.js',Buffer.from('window.__MF_OTA_HAS_GALACTIC_DELIVERY=true;window.__MF_OTA_HAS_GALACTIC_DELIVERY=false;'));assert.throws(()=>descriptorFromVerifiedOta(C,F.version),/ambiguous/);});
await test('classic unflagged and explicit legacy descriptors remain supported',()=>{const F=fixture();assert.equal(descriptorFromVerifiedOta(new Map(),F.version),null);
  assert.equal(descriptorFromVerifiedOta(carriers(F,'false',{kind:'ExplorationPackRemote'}),F.version),null);});
await test('complete public content, desktop ranges and Android whole fallback verify',async()=>{const F=fixture(),N=network(F),result=await verifyRemoteExplorationDelivery(N.fetchImpl,F.descriptor);
  assert.equal(result.files,3);assert(N.seen.some(r=>r.android));assert(N.seen.some(r=>r.range===`bytes=${CHUNK}-${CHUNK+16}`));});
await test('hash-verified whole responses may omit content-length',async()=>{const F=fixture();assert.equal((await verifyRemoteExplorationDelivery(network(F,{failure:'no-length'}).fetchImpl,F.descriptor)).files,3);});
for(const failure of ['missing','redirect','cors','encoding','preflight','range','range-cors','length','manifest-corrupt','corrupt','android-corrupt','mime'])
  await test('public gate refuses '+failure,async()=>{const F=fixture();await assert.rejects(verifyRemoteExplorationDelivery(network(F,{failure}).fetchImpl,F.descriptor));});
await test('Android devices with working 206 ranges are also accepted',async()=>{const F=fixture();assert.equal((await verifyRemoteExplorationDelivery(network(F,{failure:'android-range'}).fetchImpl,F.descriptor)).files,3);});
await test('chunk tampering fails even with a correct whole-file digest',async()=>{const F=fixture();F.manifest.files[0].chunks[0].sha256='0'.repeat(64);rebind(F);
  await assert.rejects(verifyRemoteExplorationDelivery(network(F).fetchImpl,F.descriptor),/chunk hash/);});
await test('local immutable candidate verifies completely',async()=>{const F=fixture(),directory=await local(F,'valid');assert.equal((await validateLocalExplorationDelivery(ROOT,directory,F.version)).entries.length,3);});
await test('local inventory cannot reinterpret media as executable files/full',async()=>{const F=fixture();F.inventory.files=F.entries;const directory=await local(F,'bad-inventory');await assert.rejects(validateLocalExplorationDelivery(ROOT,directory,F.version),/separate content inventory/);});
await test('local inventory must exactly match the bound manifest',async()=>{const F=fixture();F.inventory.entries=copy(F.entries);F.inventory.entries[0].sha256='0'.repeat(64);const directory=await local(F,'inventory-mismatch');await assert.rejects(validateLocalExplorationDelivery(ROOT,directory,F.version));});
await test('unlisted local files are rejected',async()=>{const F=fixture(),directory=await local(F,'unlisted');await writeFile(join(directory,'extra.js'),'bad');await assert.rejects(validateLocalExplorationDelivery(ROOT,directory,F.version));});
await test('same-size local corruption is rejected',async()=>{const F=fixture(),directory=await local(F,'corrupt');await writeFile(join(directory,'src/start.js'),Buffer.alloc(F.payload.get('src/start.js').length));await assert.rejects(validateLocalExplorationDelivery(ROOT,directory,F.version),/hash|identity/);});
await test('symlink/junction candidate paths are rejected',async()=>{const F=fixture(),directory=await local(F,'linked-target'),link=join(out,'linked');await symlink(directory,link,process.platform==='win32'?'junction':'dir');await assert.rejects(validateLocalExplorationDelivery(ROOT,link,F.version),/symlink/);});
await test('uploader puts only typed closure, correct MIME and manifest last',async()=>{const F=fixture(),directory=await local(F,'upload'),L=await validateLocalExplorationDelivery(ROOT,directory,F.version),N=network(F,{objects:new Map()}),puts=[];
  const result=await prepareExplorationMirror(L,{fetchImpl:N.fetchImpl,put:async row=>{puts.push(row);N.objects.set(HOST+'/f/'+row.key.slice('massfront/'.length),await readFile(row.file));}});
  assert.equal(result.activated,false);assert.equal(puts.length,4);assert(puts.at(-1).key.endsWith('/'+MANIFEST));
  assert.equal(puts.find(r=>r.key.endsWith('.ogg')).contentType,'audio/ogg');assert.equal(puts.find(r=>r.key.endsWith('.html')).contentType,'text/html; charset=utf-8');
  assert(puts.every(r=>r.key.startsWith('massfront/1.33.76/content-r6/')));assert(!puts.some(r=>/latest|packs\/index/.test(r.key)));});
await test('identical occupied content is reused without any upload',async()=>{const F=fixture(),directory=await local(F,'reuse'),L=await validateLocalExplorationDelivery(ROOT,directory,F.version);let puts=0;
  await prepareExplorationMirror(L,{fetchImpl:network(F).fetchImpl,put:async()=>puts++});assert.equal(puts,0);});
await test('occupied conflicting bytes prevent all uploads',async()=>{const F=fixture(),directory=await local(F,'conflict'),L=await validateLocalExplorationDelivery(ROOT,directory,F.version);let puts=0;
  await assert.rejects(prepareExplorationMirror(L,{fetchImpl:network(F,{failure:'corrupt'}).fetchImpl,put:async()=>puts++}));assert.equal(puts,0);});
await test('failed content transfer cannot upload manifest or activate anything',async()=>{const F=fixture(),directory=await local(F,'partial'),L=await validateLocalExplorationDelivery(ROOT,directory,F.version),N=network(F,{objects:new Map()}),puts=[];
  await assert.rejects(prepareExplorationMirror(L,{fetchImpl:N.fetchImpl,put:async row=>{puts.push(row.key);throw new Error('injected transfer failure');}}));assert(!puts.includes(contentObjectKey(F.descriptor,F.manifestEntry)));});
await test('shared activation requires content before a pointer can publish',async()=>{const F=fixture(),C=carriers(F),candidate=release(C),prior=release(C,'1.33.75'),N=network(F,{failure:'missing'});
  for(const [path,bytes] of C)N.objects.set(`${HOST}/f/${F.version}/${path}`,bytes);let puts=0;
  await assert.rejects(activateWithChecks({candidate,expected:{version:prior.version,manifestRoot:prior.manifestRoot},readCurrent:async()=>prior,
    verifyPayloads:m=>verifyActivationPayloads(N.fetchImpl,m),publish:async()=>puts++}));assert.equal(puts,0);});
await test('shared activation fully verifies typed content without modifying files/full',async()=>{const F=fixture(),C=carriers(F),candidate=release(C),N=network(F),before=JSON.stringify(candidate);
  for(const [path,bytes] of C)N.objects.set(`${HOST}/f/${F.version}/${path}`,bytes);
  const verified=await verifyActivationPayloads(N.fetchImpl,candidate);assert.equal(verified.exploration.files,3);assert.equal(JSON.stringify(candidate),before);assert.equal(candidate.full.length,2);});
await test('trusted true flag with missing descriptor blocks the shared activation gate',async()=>{const F=fixture(),C=carriers(F,'true',null),candidate=release(C),N=network(F);
  for(const [path,bytes] of C)N.objects.set(`${HOST}/f/${F.version}/${path}`,bytes);await assert.rejects(verifyActivationPayloads(N.fetchImpl,candidate),/no bound/);});
await test('MIME mapping preserves wasm, JSON, models, music and CSS',()=>{for(const [ext,mime] of [['wasm','application/wasm'],['json','application/json'],['glb','model/gltf-binary'],['m4a','audio/mp4'],['css','text/css; charset=utf-8']])assert.equal(contentMime('fixture.'+ext),mime);});
for(const extension of ['js','wasm','gltf','glb','png'])await test('byte-correct '+extension+' with wrong MIME is rejected',async()=>{
  const F=fixture(),path='assets/fixture.'+extension,bytes=Buffer.from('MIME fixture'),entry={path,url:F.base+path,size:bytes.length,sha256:sha(bytes)},N=network(F);
  N.objects.set(entry.url,bytes);const wrong=async(url,options)=>{const response=await N.fetchImpl(url,options);response.headers.set('content-type','application/octet-stream');return response;};
  await assert.rejects(verifyRemoteContentEntry(wrong,entry),/MIME/);
});
await test('range and manifest MIME are checked independently of full payload MIME',async()=>{
  for(const target of ['range','manifest']){const F=fixture(),N=network(F),wrong=async(url,options)=>{const response=await N.fetchImpl(url,options);
    if(target==='range'&&options.headers.Range||target==='manifest'&&String(url)===F.descriptor.manifest)response.headers.set('content-type','text/plain');return response;};
    await assert.rejects(verifyRemoteExplorationDelivery(wrong,F.descriptor),/MIME/);}
});
await test('content key rejects traversal even without caller validation',()=>{const F=fixture();for(const path of ['../outside.js','assets/%2e%2e/escape','assets\\escape','x?query'])
  assert.throws(()=>contentObjectKey(F.descriptor,{path,url:F.base+path}),/Unsafe/);});
await test('shell-free uploader preserves spaced paths and MIME as exact argv values',async()=>{
  const fakeCli=join(out,'fake npm cli with spaces.mjs');await writeFile(fakeCli,'console.log(JSON.stringify(process.argv.slice(2)));\n');
  const file=join(out,'payload with spaces & literal metacharacters.html'),contentType='text/html; charset=utf-8',
    spec=r2ProcessSpec({key:'massfront/1.33.76/content-r6/index.html',file,contentType},{npxCli:fakeCli});
  assert.equal(spec.options.shell,false);const result=await promisify(execFile)(spec.command,spec.args,{...spec.options,encoding:'utf8'}),argv=JSON.parse(result.stdout);
  assert.equal(argv[argv.indexOf('--file')+1],file);assert.equal(argv[argv.indexOf('--content-type')+1],contentType);
  assert.equal(argv[0],'--yes');assert.equal(argv[1],'wrangler@3');
});
await writeFile(join(out,'report.json'),encode({status:'PASS',checks:checks.length,names:checks,network:false,remoteWrites:0,scope:'Isolated filesystem/HTTP/R2 doubles only.'}));
console.log(JSON.stringify({status:'PASS',checks:checks.length,network:false,remoteWrites:0,evidence:join(out,'report.json')}));
