/* Typed Galactic content is a separate download closure, never OTA files/full.
   Descriptor authority comes from already hash-verified executable OTA bytes;
   the manifest's self-hash alone is not a signature or a trust anchor. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,realpath,readFile,readdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep,join} from 'node:path';
import {immutableContentBase,CONTENT_CHUNK_BYTES,CONTENT_MAX_FILES,CONTENT_MAX_FILE_BYTES,CONTENT_MAX_MANIFEST_BYTES} from './build-exploration-delivery.mjs';

export const EXPLORATION_MIRROR='https://massfront-update.jasondixon1994.workers.dev';
export const EXPLORATION_MANIFEST='exploration-content-manifest-v2.json';
const HASH=/^[a-f0-9]{64}$/,VERSION=/^\d+\.\d+\.\d+$/,
  ORIGIN='https://creatorjd-massfront-playtest.static.hf.space',
  sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw new Error('EXPLORATION_DELIVERY: '+message);};
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
function json(bytes,label){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail(label+' is not UTF-8 JSON');}}
function safePath(path){
  if(typeof path!=='string'||path.length>512||path.split('/').some(s=>!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(s)||s.endsWith('.')||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)))fail('unsafe path '+path);
  return path;
}
export function validateExplorationDescriptor(descriptor,version){
  const keys=['schema','kind','version','base','manifest','manifestSha256','manifestBytes','downloadQuery'];
  if(!plain(descriptor)||Object.keys(descriptor).length!==keys.length||!keys.every(k=>Object.hasOwn(descriptor,k))||
    descriptor.schema!=='MassfrontExplorationPackRemoteV2'||descriptor.kind!=='ExplorationPackRemote'||!VERSION.test(version)||
    descriptor.version!==version||!HASH.test(descriptor.manifestSha256)||!Number.isSafeInteger(descriptor.manifestBytes)||
    descriptor.manifestBytes<=0||descriptor.manifestBytes>CONTENT_MAX_MANIFEST_BYTES||descriptor.downloadQuery!=='')fail('invalid release-bound V2 descriptor');
  if(immutableContentBase(descriptor.base,version)!==descriptor.base||descriptor.manifest!==descriptor.base+EXPLORATION_MANIFEST)fail('descriptor base/manifest disagree');
  return descriptor;
}
export function descriptorFromVerifiedOta(artifacts,version){
  const runtime=artifacts.get('ota/00-runtime.js')?.toString('utf8')||'',source=artifacts.get('src/assetpack.js')?.toString('utf8')||'',
    flags=[...runtime.matchAll(/window\.__MF_OTA_HAS_GALACTIC_DELIVERY\s*=\s*(true|false)\s*;/g)];
  if(flags.length>1||runtime.includes('__MF_OTA_HAS_GALACTIC_DELIVERY')&&flags.length!==1)fail('ambiguous Galactic delivery flag');
  const advertised=flags[0]?.[1]==='true',stubs=[...source.matchAll(/\bconst\s+EXP_PACK_STUB\s*=\s*(['"])(data:application\/json;base64,([A-Za-z0-9+/=]+))\1\s*;/g)];
  if(stubs.length>1)fail('ambiguous OTA content descriptor');
  let descriptor=null;
  if(stubs.length){
    const encoded=stubs[0][3],raw=Buffer.from(encoded,'base64');
    if(raw.length>65536||raw.toString('base64')!==encoded)fail('invalid OTA descriptor encoding');
    descriptor=json(raw,'OTA descriptor');
  }
  const typed=descriptor?.schema==='MassfrontExplorationPackRemoteV2';
  if(advertised&&!typed)fail('Galactic delivery flag has no bound V2 descriptor');
  if(typed&&!advertised)fail('V2 descriptor lacks its Galactic delivery flag');
  return typed?validateExplorationDescriptor(descriptor,version):null;
}
export function validateExplorationManifest(raw,descriptor){
  validateExplorationDescriptor(descriptor,descriptor.version);
  if(raw.length!==descriptor.manifestBytes||sha(raw)!==descriptor.manifestSha256)fail('raw manifest identity mismatch');
  const manifest=json(raw,'manifest');
  if(manifest.schemaVersion!==2||manifest.kind!=='ExplorationContentManifestV1'||manifest.contentVersion!==descriptor.version||
    manifest.compatibleGameRange!=='='+descriptor.version||manifest.delivery!=='startup'||manifest.optional!==false||manifest.resumable!==true||
    manifest.chunkSize!==CONTENT_CHUNK_BYTES||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>CONTENT_MAX_FILES)fail('invalid typed module manifest');
  const unsigned={...manifest};delete unsigned.hash;
  if(manifest.hash!=='sha256-'+sha(Buffer.from(JSON.stringify(unsigned))))fail('manifest self-hash mismatch');
  const seen=new Set(),entries=[];let total=0;
  const workerPrefix=new URL(descriptor.base).pathname.startsWith('/f/')?new URL(descriptor.base).pathname.split('/').slice(3).join('/'):'';
  for(const file of manifest.files){
    safePath(file.path);const key=file.path.toLowerCase();
    if(seen.has(key))fail('duplicate content path '+file.path);seen.add(key);
    if(key!=='index.html'&&!/^(assets|lib|src)\//.test(key)||/(^|\/)(source|tools|tests|tmp|docs|_archive)(\/|$)/.test(key)||/\.blend\d?$/.test(key))fail('non-runtime content path '+file.path);
    if(workerPrefix.length+file.path.length>512)fail('Worker path length exceeded');
    if(!Number.isSafeInteger(file.bytes)||file.bytes<=0||file.bytes>CONTENT_MAX_FILE_BYTES||!HASH.test(file.sha256||'')||file.hash!=='sha256-'+file.sha256)fail('invalid content identity '+file.path);
    if(!Array.isArray(file.chunks)||file.chunks.length!==Math.ceil(file.bytes/CONTENT_CHUNK_BYTES))fail('invalid chunk count '+file.path);
    let offset=0;
    for(const chunk of file.chunks){
      const size=Math.min(CONTENT_CHUNK_BYTES,file.bytes-offset);
      if(!plain(chunk)||Object.keys(chunk).length!==3||chunk.offset!==offset||chunk.size!==size||!HASH.test(chunk.sha256||''))fail('noncanonical chunk table '+file.path);
      offset+=size;
    }
    total+=file.bytes;if(!Number.isSafeInteger(total))fail('unsafe total bytes');
    entries.push({path:file.path,url:descriptor.base+file.path,size:file.bytes,sha256:file.sha256,chunks:file.chunks});
  }
  if(!seen.has('index.html')||total!==manifest.totalBytes)fail('missing entrypoint or wrong content total');
  for(const path of seen){const parts=path.split('/');parts.pop();while(parts.length){if(seen.has(parts.join('/')))fail('content file/directory collision');parts.pop();}}
  return {manifest,entries,totalBytes:total};
}
export async function verifyContentStream(iterable,entry){
  const whole=createHash('sha256');let bytes=0,chunkAt=0,inChunk=0,part=createHash('sha256');
  for await(const value of iterable){const buffer=Buffer.from(value);if(bytes+buffer.length>entry.size)fail('oversized body '+entry.path);
    whole.update(buffer);bytes+=buffer.length;let offset=0;
    while(entry.chunks&&offset<buffer.length){const chunk=entry.chunks[chunkAt];if(!chunk)fail('excess chunk bytes');
      const size=Math.min(buffer.length-offset,chunk.size-inChunk);part.update(buffer.subarray(offset,offset+size));inChunk+=size;offset+=size;
      if(inChunk===chunk.size){if(part.digest('hex')!==chunk.sha256)fail('chunk hash mismatch '+entry.path);chunkAt++;inChunk=0;part=createHash('sha256');}}
  }
  if(bytes!==entry.size||whole.digest('hex')!==entry.sha256||entry.chunks&&(chunkAt!==entry.chunks.length||inChunk))fail('whole-file identity mismatch '+entry.path);
  return bytes;
}
async function cancel(response){try{await response.body?.cancel();}catch{}}
const headerToken=(response,name,token)=>{const text=response.headers.get(name)||'';return text==='*'||text.toLowerCase().split(',').map(s=>s.trim()).includes(token);};
function responseHeaders(response,entry,status){
  if(response.status!==status||response.headers.get('location'))fail(`HTTP ${response.status}/redirect for ${entry.path}`);
  const origin=response.headers.get('access-control-allow-origin');if(origin!=='*'&&origin!==ORIGIN)fail('content CORS denied '+entry.path);
  const encoding=response.headers.get('content-encoding');if(encoding&&encoding!=='identity')fail('transformed content '+entry.path);
  // Correct bytes with octet-stream JS or JavaScript-labelled GLB still fail
  // real module/streaming loaders. Hashes cannot stand in for this contract.
  if(status!==204){const expected=contentMime(entry.path).split(';')[0].toLowerCase(),actual=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(actual!==expected)fail('content MIME mismatch '+entry.path+': '+actual+' != '+expected);}
}
async function request(fetchImpl,url,options={}){
  return fetchImpl(url,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(300000),...options,
    headers:{Origin:ORIGIN,'Accept-Encoding':'identity',...options.headers}});
}
function verifyWholeLengthHeader(response,expected,label){
  /* Workers may stream otherwise byte-identical text without Content-Length.
     The bounded stream verifier below is still authoritative for exact size
     and SHA-256; reject only a length header that is actually present and
     disagrees. Range responses remain strict because their headers define the
     requested byte interval. */
  const value=response.headers.get('content-length');
  if(value!==null&&Number(value)!==expected)fail(label);
}
export async function verifyRemoteContentEntry(fetchImpl,entry,{allowMissing=false,ranges=false,android=false}={}){
  const response=await request(fetchImpl,entry.url);
  try{
    if(allowMissing&&response.status===404)return {missing:true};
    responseHeaders(response,entry,200);
    verifyWholeLengthHeader(response,entry.size,'content length mismatch '+entry.path);
    if(!response.body)fail('missing content stream '+entry.path);
    await verifyContentStream(response.body,entry);
  }finally{await cancel(response);}
  if(ranges&&entry.chunks){
    const preflight=await request(fetchImpl,entry.url,{method:'OPTIONS',headers:{'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'range'}});
    try{responseHeaders(preflight,entry,204);if(!headerToken(preflight,'access-control-allow-methods','get')||!headerToken(preflight,'access-control-allow-headers','range'))fail('content range preflight denied');}
    finally{await cancel(preflight);}
    const probes=entry.chunks.length>1?[entry.chunks[0],entry.chunks.at(-1)]:[entry.chunks[0]];
    for(const chunk of probes){const end=chunk.offset+chunk.size-1,ranged=await request(fetchImpl,entry.url,{headers:{Range:`bytes=${chunk.offset}-${end}`}});
      try{responseHeaders(ranged,entry,206);
        if(ranged.headers.get('accept-ranges')!=='bytes'||ranged.headers.get('content-range')!==`bytes ${chunk.offset}-${end}/${entry.size}`||Number(ranged.headers.get('content-length'))!==chunk.size||!headerToken(ranged,'access-control-expose-headers','content-range'))fail('invalid content range '+entry.path);
        await verifyContentStream(ranged.body,{path:entry.path,size:chunk.size,sha256:chunk.sha256});
      }finally{await cancel(ranged);}}
  }
  if(android&&entry.chunks){const chunk=entry.chunks[0],end=chunk.size-1,
    ranged=await request(fetchImpl,entry.url,{headers:{Range:`bytes=0-${end}`,'User-Agent':'Mozilla/5.0 (Linux; Android 13; QA) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'}});
    try{
      if(ranged.status===200&&entry.size<=32*1024*1024){responseHeaders(ranged,entry,200);
        verifyWholeLengthHeader(ranged,entry.size,'Android whole fallback length mismatch');await verifyContentStream(ranged.body,entry);
      }else{responseHeaders(ranged,entry,206);
        if(ranged.headers.get('accept-ranges')!=='bytes'||!headerToken(ranged,'access-control-expose-headers','content-range')||ranged.headers.get('content-range')!==`bytes 0-${end}/${entry.size}`||Number(ranged.headers.get('content-length'))!==chunk.size)fail('Android range mismatch');
        await verifyContentStream(ranged.body,{path:entry.path,size:chunk.size,sha256:chunk.sha256});}
    }finally{await cancel(ranged);}
  }
  return {missing:false,bytes:entry.size};
}
export async function verifyRemoteExplorationDelivery(fetchImpl,descriptor,{onProgress=()=>{},concurrency=6}={}){
  if(!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>8)fail('verification concurrency must be 1..8');
  validateExplorationDescriptor(descriptor,descriptor.version);
  const response=await request(fetchImpl,descriptor.manifest),parts=[];let size=0,raw;
  try{responseHeaders(response,{path:EXPLORATION_MANIFEST},200);
    verifyWholeLengthHeader(response,descriptor.manifestBytes,'manifest content length mismatch');
    for await(const value of response.body){size+=value.length;if(size>descriptor.manifestBytes)fail('oversized manifest');parts.push(Buffer.from(value));}raw=Buffer.concat(parts);
  }finally{await cancel(response);}
  const {entries,totalBytes}=validateExplorationManifest(raw,descriptor);
  const largest=entries.reduce((a,b)=>a.size>b.size?a:b);let done=0,cursor=0;
  // Each worker streams one file at a time, keeping memory bounded while
  // avoiding hundreds of serialized network round trips for large catalogs.
  await Promise.all(Array.from({length:Math.min(concurrency,entries.length)},async()=>{
    while(cursor<entries.length){const entry=entries[cursor++];
      await verifyRemoteContentEntry(fetchImpl,entry,{ranges:true,android:entry===largest});
      onProgress(++done,entries.length,entry.path);
    }
  }));
  return {files:entries.length,bytes:totalBytes,manifestBytes:raw.length,manifestSha256:sha(raw),base:descriptor.base,androidProbe:largest.path};
}
function inside(base,path){const rel=relative(base,path);return !rel||!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep);}
async function noLinks(root,path){
  if(!inside(root,path))fail('local content escapes repository');let current=root;
  for(const part of relative(root,path).split(sep).filter(Boolean)){current=join(current,part);const stat=await lstat(current);
    if(stat.isSymbolicLink()||resolve(await realpath(current)).toLowerCase()!==resolve(current).toLowerCase())fail('local content symlink refused');}
}
export async function validateLocalExplorationDelivery(root,directory,version){
  directory=resolve(root,directory);await noLinks(root,directory);
  const read=async path=>{const full=resolve(directory,path);await noLinks(root,full);const stat=await lstat(full);
    if(!stat.isFile()||stat.size>CONTENT_MAX_MANIFEST_BYTES*2)fail('invalid local metadata '+path);return readFile(full);};
  const descriptor=validateExplorationDescriptor(json(await read('delivery.json'),'descriptor'),version),
    raw=await read(EXPLORATION_MANIFEST),{manifest,entries,totalBytes}=validateExplorationManifest(raw,descriptor),
    inventory=json(await read('payload-inventory.json'),'inventory'),manifestEntry={path:EXPLORATION_MANIFEST,url:descriptor.manifest,size:raw.length,sha256:sha(raw)};
  if(inventory.schema!=='MassfrontExplorationDeliveryInventoryV1'||inventory.executableOta!==false||inventory.version!==version||inventory.base!==descriptor.base||
    inventory.files!==undefined||inventory.full!==undefined||inventory.totalBytes!==totalBytes+raw.length||!HASH.test(inventory.sourceManifestSha256||''))fail('invalid separate content inventory');
  assert.deepEqual(inventory.manifest,manifestEntry,'content inventory manifest identity');assert.deepEqual(inventory.entries,entries,'content inventory entries');
  const expected=new Set(['delivery.json','payload-inventory.json',EXPLORATION_MANIFEST,...entries.map(e=>e.path)]),actual=[];
  async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){const full=join(dir,item.name);await noLinks(root,full);
    if(item.isDirectory())await walk(full);else if(item.isFile())actual.push(relative(directory,full).split(sep).join('/'));else fail('non-regular candidate entry');}}
  await walk(directory);assert.deepEqual(actual.sort(),[...expected].sort(),'unlisted/missing content candidate files');
  for(const entry of entries){const full=resolve(directory,entry.path);await noLinks(root,full);const before=await lstat(full);
    if(before.size!==entry.size)fail('local content size mismatch '+entry.path);await verifyContentStream(createReadStream(full),entry);
    const after=await lstat(full);await noLinks(root,full);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino)fail('local content changed during validation');}
  return {directory,descriptor,manifest,entries,manifestEntry,totalBytes:totalBytes+raw.length,inventorySha256:sha(await read('payload-inventory.json'))};
}
export function contentMime(path){
  const extension=path.split('.').at(-1).toLowerCase(),types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',
    wasm:'application/wasm',gltf:'model/gltf+json',glb:'model/gltf-binary',bin:'application/octet-stream',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',ktx2:'image/ktx2',ogg:'audio/ogg',m4a:'audio/mp4',mp3:'audio/mpeg',woff2:'font/woff2',svg:'image/svg+xml'};
  return types[extension]||'application/octet-stream';
}
