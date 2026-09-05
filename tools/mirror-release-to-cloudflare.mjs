#!/usr/bin/env node
/* Stage complete immutable release bytes before a separate guarded activation.
 * Neither phase builds from source or removes a prior release. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildMirrorManifest,assertManifestExact} from './mirror-release-contract.mjs';
import {validateReleaseIdentity} from './release-delivery-contract.mjs';
import {MIRROR_HOST,assertMirroredRelease,verifyActivationPayloads,activateWithChecks} from './release-activation-contract.mjs';
import {assertNoVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workerDir=path.join(root,'cloudflare','massfront-update');
const bucket='massfront-releases',host=MIRROR_HOST;
const args=new Set(process.argv.slice(2));
const after=flag=>{const i=process.argv.indexOf(flag);return i<0?'':String(process.argv[i+1]||'');};
const version=after('--version'),prepare=args.has('--prepare-only'),activationPath=after('--activate-prepared');
const sourcePath=after('--manifest');
const expected={version:after('--expected-prior-version'),manifestRoot:after('--expected-prior-root')};
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const npx=process.platform==='win32'?'npx.cmd':'npx';
const scratchRoot=path.join(root,'.tmp','ota-delivery-repair');
const readJson=file=>JSON.parse(fs.readFileSync(path.resolve(root,file),'utf8').replace(/^\uFEFF/,''));
const progress=(done,total,file)=>console.log(`VERIFIED ${done}/${total} ${file}`);

if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Use --version x.y.z');
if(!args.has('--apply'))throw new Error('Remote storage changes require --apply');
if(args.has('--retire-current'))throw new Error('Release staging/activation preserves prior artifacts; --retire-current is refused');
if(prepare===Boolean(activationPath))throw new Error('Choose --manifest <pinned candidate> --prepare-only OR --activate-prepared <mirror candidate>');
if(prepare&&!sourcePath)throw new Error('--prepare-only requires --manifest <pinned candidate>');
if(activationPath&&sourcePath)throw new Error('--manifest and --activate-prepared are mutually exclusive');
const candidate=readJson(activationPath||sourcePath);
const identity=validateReleaseIdentity(candidate,'candidate');
if(identity.version!==version)throw new Error(`Candidate is v${identity.version}, not v${version}`);
await assertNoVerificationFreeze(root);

async function current(){
  const response=await fetch(`${host}/update.json?mf_activation_check=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(`Cloudflare current manifest unavailable: HTTP ${response.status}`);
  return response.json();
}
async function writeJson(file,value){
  await assertNoVerificationFreeze(root);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
async function preservePrior(prior){
  const priorIdentity=validateReleaseIdentity(prior,'rollback manifest');
  const file=path.join(scratchRoot,`rollback-worker-v${priorIdentity.version}-${priorIdentity.manifestRoot}.json`);
  if(fs.existsSync(file))assertManifestExact(readJson(file),prior,'Saved rollback manifest differs');
  else await writeJson(file,prior);
}
function run(args){
  execFileSync(npx,['--yes','wrangler@3',...args],{cwd:workerDir,stdio:'inherit',windowsHide:true,shell:process.platform==='win32'});
}
function upload(args){
  return new Promise((resolve,reject)=>{
    const child=spawn(npx,['--yes','wrangler@3',...args],{cwd:workerDir,shell:process.platform==='win32',windowsHide:true,stdio:'ignore'});
    child.once('error',reject);
    child.once('exit',code=>code===0?resolve():reject(new Error(`Wrangler upload failed (${code})`)));
  });
}
async function wholeFile(url,entry,{allowMissing=false}={}){
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(300000)});
  if(allowMissing&&response.status===404){await response.body?.cancel();return null;}
  if(!response.ok){await response.body?.cancel();throw new Error(`Immutable source failed ${entry.path}: HTTP ${response.status}`);}
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length!==entry.size||sha(bytes)!==entry.sha256.toLowerCase())throw new Error(`Immutable bytes differ for ${entry.path}; refusing same-version overwrite`);
  return bytes;
}

if(activationPath){
  assertMirroredRelease(candidate);
  const result=await activateWithChecks({candidate,expected,readCurrent:current,
    verifyPayloads:value=>verifyActivationPayloads(fetch,value,{onProgress:progress}),
    checkpoint:()=>assertNoVerificationFreeze(root),
    publish:async(value,prior)=>{
      await preservePrior(prior);
      const pointer=path.join(scratchRoot,`activate-v${version}.json`);
      await writeJson(pointer,value);
      run(['r2','object','put',`${bucket}/massfront/latest.json`,'--file',pointer,'--content-type','application/json']);
    }});
  console.log(`${result.activated?'CLOUDFLARE_ACTIVATED':'CLOUDFLARE_ALREADY_ACTIVE'}=v${version}`);
}else{
  const prior=await current();
  validateReleaseIdentity(prior,'current Worker manifest');
  const mirror=buildMirrorManifest(candidate,{host,version});
  const delivery=assertMirroredRelease(mirror);
  await preservePrior(prior);
  await assertNoVerificationFreeze(root);
  fs.mkdirSync(scratchRoot,{recursive:true});
  const scratch=fs.mkdtempSync(path.join(scratchRoot,`massfront-r2-v${version}-`));
  try{
    const pending=[];
    for(const entry of delivery.entries){
      const original=identity.inventory.entries.find(value=>value.path===entry.path);
      const bytes=await wholeFile(original.url,entry);
      const existing=await wholeFile(entry.url,entry,{allowMissing:true});
      if(existing){console.log(`IMMUTABLE_RESUME ${entry.path}`);continue;}
      const file=path.join(scratch,...entry.path.split('/'));
      await assertNoVerificationFreeze(root);
      fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
      pending.push({entry,file});
    }
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(4,pending.length)},async()=>{
      while(cursor<pending.length){
        const {entry,file}=pending[cursor++];
        await upload(['r2','object','put',`${bucket}/massfront/${version}/${entry.path}`,'--file',file,'--content-type','text/javascript']);
        console.log(`UPLOADED ${entry.path}`);
      }
    }));
    const verified=await verifyActivationPayloads(fetch,mirror,{onProgress:progress});
    const prepared=path.join(scratchRoot,`update-v${version}-cloudflare.json`);
    await writeJson(prepared,mirror);
    await writeJson(path.join(scratchRoot,`update-v${version}-prepared-evidence.json`),{
      version,manifestRoot:identity.manifestRoot,verified,sourceManifest:path.resolve(root,sourcePath),
      priorVersion:prior.version,priorManifestRoot:prior.manifestRoot,preparedAt:new Date().toISOString(),activated:false});
    console.log(`PREPARED_MIRROR=${prepared}\nNO_POINTER_ACTIVATED; prior release artifacts preserved.`);
  }finally{
    // Only the validated mkdtemp child can be removed; never a computed parent.
    if(path.dirname(scratch)!==scratchRoot)throw new Error('Scratch containment failed');
    await assertNoVerificationFreeze(root);
    fs.rmSync(scratch,{recursive:true,force:true});
  }
}
