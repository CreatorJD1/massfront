#!/usr/bin/env node
/* Stage a typed, immutable module closure. Never uploads latest.json, packs.json
   or executable files/full. The shared activation gate independently reads the
   trusted OTA descriptor and verifies these public bytes before changing a pointer.
   --check-local does no network; --verify-only reads public content; --apply
   uploads only missing exact-version objects, then verifies public delivery. */
import {spawn} from 'node:child_process';
import {mkdir,writeFile,lstat} from 'node:fs/promises';
import {createReadStream,existsSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {assertNoVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';
import {EXPLORATION_MIRROR,validateLocalExplorationDelivery,verifyRemoteContentEntry,
  verifyRemoteExplorationDelivery,verifyContentStream,contentMime} from './exploration-delivery-contract.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
export function contentObjectKey(descriptor,entry){
  if(typeof entry.path!=='string'||entry.path.length>512||entry.path.split('/').some(part=>!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(part)))throw new Error('Unsafe content object path');
  const url=new URL(entry.url),base=new URL(descriptor.base);
  if(base.origin!==EXPLORATION_MIRROR||url.origin!==base.origin||entry.url!==descriptor.base+entry.path||
    base.pathname!==`/f/${descriptor.version}/${base.pathname.split('/')[3]}/`||!/^content-r[1-9][0-9]{0,5}$/.test(base.pathname.split('/')[3]||''))throw new Error('Invalid fixed content namespace');
  return 'massfront/'+url.pathname.slice(3);
}
export function r2ProcessSpec({key,file,contentType},{nodePath=process.execPath,npxCli}={}){
  // A .cmd shell splits MIME values and paths at spaces. Invoke npm's actual
  // JS entrypoint through Node instead; arguments never pass through a shell.
  if(!npxCli)npxCli=[join(dirname(nodePath),'node_modules/npm/bin/npx-cli.js'),
    resolve(dirname(nodePath),'../lib/node_modules/npm/bin/npx-cli.js'),'/usr/share/nodejs/npm/bin/npx-cli.js'].find(existsSync);
  if(!npxCli)throw new Error('Cannot locate installed npm npx-cli.js; refusing shell fallback');
  return {command:nodePath,args:[npxCli,'--yes','wrangler@3','r2','object','put','massfront-releases/'+key,
    '--file',file,'--content-type',contentType],options:{shell:false,windowsHide:true}};
}
export async function prepareExplorationMirror(local,{fetchImpl=fetch,put,checkpoint=async()=>{},onProgress=()=>{},concurrency=6}={}){
  if(typeof put!=='function')throw new Error('Explicit scoped uploader is required');
  if(!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>8)throw new Error('Upload concurrency must be 1..8');
  const all=[...local.entries,local.manifestEntry],missing=[];
  // Arbitrate every occupied path independently before performing any write.
  // Different bytes are never repaired in place: use a new content revision.
  for(const entry of all){contentObjectKey(local.descriptor,entry);
    const state=await verifyRemoteContentEntry(fetchImpl,entry,{allowMissing:true});
    if(state.missing)missing.push(entry);else onProgress('identical',entry.path);}
  const uploadEntry=async entry=>{
    await checkpoint();const file=resolve(local.directory,entry.path);
    const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size!==entry.size)throw new Error('Candidate changed before upload: '+entry.path);
    await verifyContentStream(createReadStream(file),entry);
    // Recheck at the write boundary; another publisher may have populated an
    // initially absent object during this batch. Do not knowingly overwrite it.
    if(!(await verifyRemoteContentEntry(fetchImpl,entry,{allowMissing:true})).missing){onProgress('identical',entry.path);return;}
    await checkpoint();await put({key:contentObjectKey(local.descriptor,entry),file,contentType:contentMime(entry.path)});
    await verifyRemoteContentEntry(fetchImpl,entry);onProgress('uploaded',entry.path);
  };
  // Payload objects are immutable and independent, so bounded workers avoid a
  // process-spawn round trip serializing hundreds of safe writes. The signed
  // manifest remains a separate final write: clients can never observe it
  // before every file it names has passed public readback.
  const payloadMissing=missing.filter(entry=>entry.path!==local.manifestEntry.path);
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(concurrency,payloadMissing.length)},async()=>{
    while(cursor<payloadMissing.length)await uploadEntry(payloadMissing[cursor++]);
  }));
  if(missing.some(entry=>entry.path===local.manifestEntry.path))await uploadEntry(local.manifestEntry);
  const verified=await verifyRemoteExplorationDelivery(fetchImpl,local.descriptor,{onProgress:(done,total,path)=>onProgress('verified',path,{done,total})});
  return {...verified,activated:false};
}
async function main(){
  const args=process.argv.slice(2),values=new Map(),switches=new Set();
  for(let i=0;i<args.length;i++){
    if(['--apply','--verify-only','--check-local'].includes(args[i])){if(switches.has(args[i]))throw new Error('Duplicate option');switches.add(args[i]);}
    else if(['--version','--revision','--delivery','--out'].includes(args[i])){if(values.has(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Invalid option '+args[i]);values.set(args[i],args[++i]);}
    else throw new Error('Unknown option '+args[i]);
  }
  if(switches.size!==1)throw new Error('Choose exactly --check-local, --verify-only, or --apply; there is no implicit remote action');
  const version=values.get('--version'),revision=values.get('--revision'),directory=values.get('--delivery');
  if(!/^\d+\.\d+\.\d+$/.test(version||'')||!/^r[1-9][0-9]{0,5}$/.test(revision||'')||!directory)throw new Error('Explicit --version x.y.z --revision rN --delivery <candidate-directory> required');
  await assertNoVerificationFreeze(ROOT);
  const local=await validateLocalExplorationDelivery(ROOT,directory,version),expected=`${EXPLORATION_MIRROR}/f/${version}/content-${revision}/`;
  if(local.descriptor.base!==expected)throw new Error('Descriptor does not match the requested fixed version/revision');
  const out=resolve(ROOT,values.get('--out')||`.tmp/exploration-delivery/${version}-${revision}-${randomUUID()}.json`),rel=relative(resolve(ROOT,'.tmp'),out);
  if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..'))throw new Error('Evidence must be a fresh file below .tmp');
  try{await lstat(out);throw new Error('Evidence already exists; refusing overwrite');}catch(error){if(error.code!=='ENOENT')throw error;}
  const report={version,revision,base:expected,inventorySha256:local.inventorySha256,manifestSha256:local.descriptor.manifestSha256,
    files:local.entries.length,bytes:local.totalBytes,mode:[...switches][0],startedAt:new Date().toISOString(),activated:false};
  try{
    if(switches.has('--apply')){
      const put=({key,file,contentType})=>new Promise((done,reject)=>{
        const spec=r2ProcessSpec({key,file,contentType}),child=spawn(spec.command,spec.args,
          {...spec.options,cwd:resolve(ROOT,'cloudflare/massfront-update'),stdio:'ignore'});
        child.once('error',reject);child.once('exit',code=>code===0?done():reject(new Error('Scoped R2 upload failed: '+code)));
      });
      report.verified=await prepareExplorationMirror(local,{put,checkpoint:()=>assertNoVerificationFreeze(ROOT),onProgress:(state,path)=>console.log(state.toUpperCase()+' '+path)});
    }else if(switches.has('--verify-only'))report.verified=await verifyRemoteExplorationDelivery(fetch,local.descriptor,{onProgress:(done,total,path)=>console.log(`VERIFIED ${done}/${total} ${path}`)});
    else report.network=false;
    report.status='PASS';
  }catch(error){report.status='FAIL';report.failure=error.message;process.exitCode=1;}
  report.finishedAt=new Date().toISOString();await assertNoVerificationFreeze(ROOT);
  await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:report.status,evidence:out,activated:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
