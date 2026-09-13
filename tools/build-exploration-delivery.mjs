#!/usr/bin/env node
/* Build an immutable module-only download, never an executable OTA artifact.
   No upload, registry activation, or native whole-root replacement happens here.
   CLI: node tools/build-exploration-delivery.mjs --version 1.33.76
     --base https://massfront-update.jasondixon1994.workers.dev/f/1.33.76/content-r5/
     --output releases/exploration-delivery-v1.33.76-r5
   The caller binds delivery.json into trusted OTA/APK metadata separately. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,realpath,readFile,open,mkdir,mkdtemp,readdir,rename,writeFile} from 'node:fs/promises';
import {resolve,relative,dirname,basename,join,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {assertNoVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
export const CONTENT_CHUNK_BYTES=2*1024*1024;
export const CONTENT_MAX_FILES=4096,CONTENT_MAX_FILE_BYTES=256*1024*1024,CONTENT_MAX_MANIFEST_BYTES=8*1024*1024;
const MANIFEST_NAME='exploration-content-manifest-v2.json';
const DESCRIPTOR_NAME='delivery.json',INVENTORY_NAME='payload-inventory.json';
const VERSION=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SEGMENT=/^[A-Za-z0-9][A-Za-z0-9._+-]*$/;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const fail=(code,detail)=>{throw new Error(`${code}: ${detail}`);};
const normalized=value=>process.platform==='win32'?resolve(value).toLowerCase():resolve(value);
function inside(target,base){const rel=relative(base,target);return rel&&!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel);}
function contentPath(path){
  if(typeof path!=='string'||path.length>512||path.split('/').some(part=>!SEGMENT.test(part)||part.endsWith('.')||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
    fail('DELIVERY_PATH_INVALID',String(path));
  return path;
}
export function immutableContentBase(value,version){
  if(!VERSION.test(version||''))fail('DELIVERY_VERSION_INVALID','use an explicit x.y.z version');
  if(typeof value!=='string'||value!==value.trim()||/%|\\/.test(value))fail('DELIVERY_BASE_INVALID','literal HTTPS path required');
  let url;try{url=new URL(value);}catch{fail('DELIVERY_BASE_INVALID','absolute URL required');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)fail('DELIVERY_BASE_INVALID','HTTPS without credentials/query/fragment required');
  const pathname=value.slice(value.indexOf('://')+3).replace(/^[^/]+/,'');
  const parts=pathname.replace(/\/$/,'').split('/').slice(1);
  if(!parts.length||parts.some(part=>!SEGMENT.test(part)||part==='.'||part==='..'))fail('DELIVERY_BASE_INVALID','canonical path required');
  const hf=url.hostname==='huggingface.co'&&/^\/datasets\/CREATORJD\/massfront-releases\/resolve\/[a-f0-9]{40}(?:\/[A-Za-z0-9][A-Za-z0-9._+-]*)+\/?$/.test(pathname);
  // The deployed Worker only accepts a bare x.y.z version. The immutable
  // content revision belongs to its safe relative path, not its version field.
  const versioned=parts[0]==='f'&&parts[1]===version&&/^content-[a-z0-9][a-z0-9._-]*$/.test(parts[2]||'');
  if(!hf&&!versioned)fail('DELIVERY_BASE_MUTABLE','use an exact HF commit or /f/<version>/content-<revision>/ directory');
  if(versioned&&parts.slice(2).join('/').length+1+MANIFEST_NAME.length>512)fail('DELIVERY_WORKER_PATH_INVALID','manifest exceeds Worker safePath limit');
  return url.href.replace(/\/?$/,'/');
}
async function exists(path){try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function noLinks(root,target,{missing=false}={}){
  if(normalized(target)!==normalized(root)&&!inside(target,root))fail('DELIVERY_OUTSIDE_ROOT',target);
  const parts=relative(root,target).split(sep).filter(Boolean);let path=root;
  for(let i=0;i<parts.length;i++){
    path=join(path,parts[i]);const stat=await exists(path);
    if(!stat){if(missing)return;fail('DELIVERY_SOURCE_MISSING',path);}
    if(stat.isSymbolicLink())fail('DELIVERY_SYMLINK_REFUSED',path);
    if(i<parts.length-1&&!stat.isDirectory())fail('DELIVERY_PARENT_NOT_DIRECTORY',path);
    if(normalized(await realpath(path))!==normalized(path))fail('DELIVERY_SYMLINK_REFUSED',path);
  }
}
async function readManifest(root,path){
  await noLinks(root,path);const stat=await lstat(path);
  if(!stat.isFile()||stat.size>32*1024*1024)fail('DELIVERY_MANIFEST_INVALID','manifest must be a regular file <=32MiB');
  const raw=await readFile(path);await noLinks(root,path);
  let value;try{value=JSON.parse(raw.toString('utf8'));}catch{fail('DELIVERY_MANIFEST_INVALID','invalid JSON');}
  if(!value||value.kind!=='ExplorationContentManifestV1'||![1,2].includes(value.schemaVersion)||!Array.isArray(value.files)||!value.files.length)
    fail('DELIVERY_MANIFEST_INVALID','wrong kind/schema or empty/oversized file table');
  if(value.files.length>CONTENT_MAX_FILES)fail('DELIVERY_FILE_COUNT_LIMIT','client accepts at most '+CONTENT_MAX_FILES+' files');
  const unsigned={...value};delete unsigned.hash;
  if(value.hash!=='sha256-'+sha(Buffer.from(JSON.stringify(unsigned))))fail('DELIVERY_MANIFEST_HASH_MISMATCH','authoritative manifest self-hash is stale');
  return {value,raw};
}
function validEntries(manifest){
  const seen=new Set();let total=0;
  for(const entry of manifest.files){
    contentPath(entry.path);const key=entry.path.toLowerCase();
    if(seen.has(key))fail('DELIVERY_DUPLICATE_PATH',entry.path);seen.add(key);
    if([MANIFEST_NAME,DESCRIPTOR_NAME,INVENTORY_NAME].includes(key))fail('DELIVERY_RESERVED_PATH',entry.path);
    if(key!=='index.html'&&!/^(assets|lib|src)\//.test(key)||/(^|\/)(source|tools|tests|tmp|docs|_archive|\.toolchains)(\/|$)/.test(key)||/\.blend\d?$/.test(key))
      fail('DELIVERY_NON_RUNTIME_PATH',entry.path);
    if(!Number.isSafeInteger(entry.bytes)||entry.bytes<=0||!/^sha256-[a-f0-9]{64}$/.test(entry.hash||''))fail('DELIVERY_ENTRY_INVALID',entry.path);
    if(entry.bytes>CONTENT_MAX_FILE_BYTES)fail('DELIVERY_FILE_SIZE_LIMIT',entry.path+' exceeds client 256MiB limit');
    total+=entry.bytes;if(!Number.isSafeInteger(total))fail('DELIVERY_SIZE_INVALID','unsafe total');
  }
  if(!seen.has('index.html'))fail('DELIVERY_ENTRYPOINT_MISSING','module closure needs index.html');
  for(const path of seen){const parts=path.split('/');parts.pop();while(parts.length){if(seen.has(parts.join('/')))fail('DELIVERY_PATH_COLLISION',path);parts.pop();}}
  if(total!==manifest.totalBytes)fail('DELIVERY_TOTAL_MISMATCH',`${total} != ${manifest.totalBytes}`);
  return [...manifest.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
async function writeAll(handle,bytes){let offset=0;while(offset<bytes.length){const result=await handle.write(bytes,offset,bytes.length-offset);if(!result.bytesWritten)fail('DELIVERY_WRITE_SHORT','zero-byte write');offset+=result.bytesWritten;}}
async function inspectFile(root,moduleRoot,entry,destination){
  const path=resolve(moduleRoot,...entry.path.split('/'));await noLinks(root,path);
  const before=await lstat(path);
  if(!before.isFile()||before.size!==entry.bytes)fail('DELIVERY_SOURCE_SIZE_MISMATCH',entry.path);
  let input,output;
  try{
    input=await open(path,'r');const opened=await input.stat();
    if(!opened.isFile()||opened.dev!==before.dev||opened.ino!==before.ino)fail('DELIVERY_SOURCE_CHANGED',entry.path);
    if(destination)output=await open(destination,'wx');
    const whole=createHash('sha256'),chunks=[];
    for(let offset=0;offset<entry.bytes;){
      const size=Math.min(CONTENT_CHUNK_BYTES,entry.bytes-offset),buffer=Buffer.allocUnsafe(size);let got=0;
      while(got<size){const result=await input.read(buffer,got,size-got,offset+got);if(!result.bytesRead)fail('DELIVERY_SOURCE_SHORT',entry.path);got+=result.bytesRead;}
      whole.update(buffer);chunks.push({offset,size,sha256:sha(buffer)});
      if(output)await writeAll(output,buffer);offset+=size;
    }
    const hash=whole.digest('hex'),after=await input.stat();await noLinks(root,path);
    if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ino!==before.ino||after.dev!==before.dev)fail('DELIVERY_SOURCE_CHANGED',entry.path);
    if('sha256-'+hash!==entry.hash)fail('DELIVERY_SOURCE_SHA_MISMATCH',entry.path);
    if(output)await output.sync();
    return {path:entry.path,bytes:entry.bytes,hash:entry.hash,sha256:hash,kind:entry.kind||'runtime-code',chunks};
  }finally{await output?.close();await input?.close();}
}
async function treeFiles(root,directory){
  await noLinks(root,directory);const result=[];
  for(const name of (await readdir(directory)).sort()){
    const path=join(directory,name);await noLinks(root,path);const stat=await lstat(path);
    if(stat.isDirectory())result.push(...await treeFiles(root,path));
    else if(stat.isFile())result.push(path);else fail('DELIVERY_SPECIAL_FILE_REFUSED',path);
  }
  return result;
}
async function verifyOutput(root,directory,expected){
  const paths=await treeFiles(root,directory),actual=paths.map(path=>relative(directory,path).split(sep).join('/')).sort();
  assert.deepEqual(actual,[...expected.keys()].sort(),'DELIVERY_OUTPUT_CONFLICT: existing candidate inventory differs; not overwritten');
  for(const path of paths){
    const rel=relative(directory,path).split(sep).join('/'),wanted=expected.get(rel),stat=await lstat(path);
    if(stat.size!==wanted.size)fail('DELIVERY_OUTPUT_CONFLICT',rel);
    let info;try{info=await inspectFile(root,directory,{path:rel,bytes:wanted.size,hash:'sha256-'+wanted.sha256});}
    catch(error){if(error.message.startsWith('DELIVERY_SOURCE_SHA_MISMATCH'))fail('DELIVERY_OUTPUT_CONFLICT',rel);throw error;}
    if(info.sha256!==wanted.sha256)fail('DELIVERY_OUTPUT_CONFLICT',rel);
  }
}
export async function buildExplorationDelivery({root=ROOT,version,base,output,moduleRoot,manifestPath}={}){
  const workspace=await assertNoVerificationFreeze(root);root=workspace.root;
  base=immutableContentBase(base,version);
  if(typeof output!=='string'||!output)fail('DELIVERY_OUTPUT_INVALID','--output is required');
  output=resolve(root,output);const outputRel=relative(root,output).split(sep);
  if(!inside(output,root)||outputRel.length<2||!['tmp','.tmp','audit','releases'].includes(outputRel[0]))fail('DELIVERY_OUTPUT_INVALID','use a named candidate below tmp, .tmp, audit, or releases');
  moduleRoot=resolve(root,moduleRoot||'modules/space_exploration');manifestPath=resolve(root,manifestPath||join(moduleRoot,'dist/exploration-content-manifest-v1.json'));
  if(!inside(moduleRoot,root)||!inside(manifestPath,moduleRoot)||inside(output,moduleRoot)||inside(moduleRoot,output)||normalized(output)===normalized(moduleRoot))fail('DELIVERY_OUTPUT_INVALID','input and output must be distinct contained trees');
  await noLinks(root,moduleRoot);await noLinks(root,output,{missing:true});
  const checkpoint=async()=>{if(await exists(join(workspace.gitDir,'massfront-verification.freeze')))fail('VERIFICATION_FREEZE_ACTIVE','writer must wait');};
  const {value:source,raw:sourceRaw}=await readManifest(root,manifestPath),entries=validEntries(source),files=[];
  const baseUrl=new URL(base),workerPrefix=baseUrl.pathname.startsWith('/f/')?baseUrl.pathname.split('/').slice(3).filter(Boolean).join('/')+'/':null;
  if(workerPrefix)for(const entry of entries)if(workerPrefix.length+entry.path.length>512)fail('DELIVERY_WORKER_PATH_INVALID',entry.path+' exceeds Worker relative-path limit');
  // Validate the entire source closure before creating a candidate directory.
  // The second streamed read hashes exactly the bytes copied, closing the
  // validate-then-copy race without retaining a multi-GB tree in memory.
  for(const entry of entries)files.push(await inspectFile(root,moduleRoot,entry));
  const manifest={...source,schemaVersion:2,kind:'ExplorationContentManifestV1',contentVersion:version,compatibleGameRange:'='+version,
    delivery:'startup',optional:false,resumable:true,installed:false,chunkSize:CONTENT_CHUNK_BYTES,files};
  delete manifest.hash;manifest.hash='sha256-'+sha(Buffer.from(JSON.stringify(manifest)));
  const manifestBytes=encode(manifest),manifestSha256=sha(manifestBytes);
  if(manifestBytes.length>CONTENT_MAX_MANIFEST_BYTES)fail('DELIVERY_MANIFEST_SIZE_LIMIT','generated manifest exceeds client 8MiB bound');
  const descriptor={schema:'MassfrontExplorationPackRemoteV2',kind:'ExplorationPackRemote',version,base,
    manifest:base+MANIFEST_NAME,manifestSha256,manifestBytes:manifestBytes.length,downloadQuery:''};
  const inventory={schema:'MassfrontExplorationDeliveryInventoryV1',version,base,executableOta:false,
    sourceManifestSha256:sha(sourceRaw),manifest:{path:MANIFEST_NAME,url:base+MANIFEST_NAME,size:manifestBytes.length,sha256:manifestSha256},
    totalBytes:source.totalBytes+manifestBytes.length,entries:files.map(file=>({path:file.path,url:base+file.path,size:file.bytes,sha256:file.sha256,chunks:file.chunks}))};
  const metadata=new Map([[MANIFEST_NAME,manifestBytes],[DESCRIPTOR_NAME,encode(descriptor)],[INVENTORY_NAME,encode(inventory)]]);
  const expected=new Map(files.map(file=>[file.path,{size:file.bytes,sha256:file.sha256}]));
  for(const [path,bytes] of metadata)expected.set(path,{size:bytes.length,sha256:sha(bytes)});
  const result={output,version,base,files:files.length,contentBytes:source.totalBytes,manifestSha256,manifestBytes:manifestBytes.length,
    descriptorSha256:sha(metadata.get(DESCRIPTOR_NAME)),descriptor:join(output,DESCRIPTOR_NAME),inventory:join(output,INVENTORY_NAME)};
  if(await exists(output)){
    await verifyOutput(root,output,expected);
    if(!sourceRaw.equals((await readManifest(root,manifestPath)).raw))fail('DELIVERY_MANIFEST_CHANGED','source manifest changed during reuse verification');
    return {...result,reused:true};
  }
  let stage;
  try{
    await checkpoint();await noLinks(root,dirname(output),{missing:true});await mkdir(dirname(output),{recursive:true});await noLinks(root,dirname(output));
    stage=await mkdtemp(join(dirname(output),'.'+basename(output)+'.staging-'));await noLinks(root,stage);
    for(let i=0;i<entries.length;i++){
      await checkpoint();const destination=join(stage,...entries[i].path.split('/'));await noLinks(root,dirname(destination),{missing:true});await mkdir(dirname(destination),{recursive:true});
      const copied=await inspectFile(root,moduleRoot,entries[i],destination);assert.deepEqual(copied,files[i],'DELIVERY_SOURCE_CHANGED: copied chunk identities differ');
    }
    if(!sourceRaw.equals((await readManifest(root,manifestPath)).raw))fail('DELIVERY_MANIFEST_CHANGED','source manifest changed during build');
    for(const [path,bytes] of metadata){await checkpoint();await writeFile(join(stage,path),bytes,{flag:'wx'});}
    await verifyOutput(root,stage,expected);await checkpoint();await noLinks(root,output,{missing:true});
    if(await exists(output))fail('DELIVERY_OUTPUT_CONFLICT','candidate appeared during build; staged output retained');
    await rename(stage,output);return {...result,reused:false};
  }catch(error){if(stage)error.message+='; isolated staging retained at '+stage;throw error;}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),allowed=new Set(['--version','--base','--output']);
  try{
    const options={};for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||!args[i+1]||args[i+1].startsWith('--')||options[args[i].slice(2)])fail('DELIVERY_ARGUMENT_INVALID',args[i]);options[args[i].slice(2)]=args[i+1];}
    console.log(JSON.stringify(await buildExplorationDelivery(options),null,2));
  }catch(error){console.error(error.stack||error.message);process.exitCode=1;}
}
