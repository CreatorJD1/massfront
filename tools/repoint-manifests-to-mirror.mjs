#!/usr/bin/env node
/* Reconcile an existing release or activate a prepared, verified mirror.
 * Dry run writes nothing. HF activation uses a parent-commit compare-and-swap. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {repointReleaseToMirror,validateReleaseIdentity} from './release-delivery-contract.mjs';
import {assertManifestExact} from './mirror-release-contract.mjs';
import {assertExpectedPrior,assertMirroredRelease,verifyActivationPayloads} from './release-activation-contract.mjs';
import {assertNoVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';

const pexec=promisify(execFile);
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const apply=process.argv.includes('--apply');
const after=flag=>{const i=process.argv.indexOf(flag);return i<0?'':String(process.argv[i+1]||'');};
const candidateFile=after('--manifest-file');
const expected={version:after('--expected-prior-version'),manifestRoot:after('--expected-prior-root')};
const rollback=process.argv.includes('--rollback')?{rollback:true,reason:after('--rollback-reason'),to:after('--rollback-to')}:null;
const REPO='CREATORJD/massfront-releases';
const WORKER='https://massfront-update.jasondixon1994.workers.dev/update.json';
const HF=(name,revision='main')=>`https://huggingface.co/datasets/${REPO}/resolve/${revision}/${name}?download=true`;
const requiredRemote=version=>['MASSFRONT-update.json',`update-v${version}.json`,'update.json'];
const repoUrl=`https://huggingface.co/api/datasets/${REPO}`;
const readJson=async file=>JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
const getJson=async(url,{optional=false,bust=true}={})=>{
  const response=await fetch(url+(bust?(url.includes('?')?'&':'?')+'x='+Date.now():''),{cache:'no-store',signal:AbortSignal.timeout(60000)});
  if(optional&&response.status===404){await response.body?.cancel();return null;}
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  return JSON.parse((await response.text()).replace(/^\uFEFF/,''));
};

const mirror=await getJson(WORKER);
const version=String(mirror.version||'');
assertMirroredRelease(mirror);
if(candidateFile)assertManifestExact(await readJson(resolve(candidateFile)),mirror,'Prepared candidate does not exactly match the activated Worker');
const localPath=resolve(root,'update.json');
if(!existsSync(localPath))throw new Error('Required local update.json is missing');
const local=await readJson(localPath);
const localResult=candidateFile
  ?(assertExpectedPrior(local,mirror,expected,'local update.json',rollback||{}),{manifest:mirror,changed:1})
  :repointReleaseToMirror(local,mirror,{label:'local update.json'});
const snapshot=await getJson(repoUrl,{bust:false});
if(!/^[a-f0-9]{40}$/i.test(snapshot.sha||''))throw new Error('HF repository head is unavailable');
const planned=[];
for(const name of requiredRemote(version)){
  let remote;
  try{remote=await getJson(HF(name,snapshot.sha),{optional:Boolean(candidateFile)&&name===`update-v${version}.json`});}
  catch(e){throw new Error(`Required remote ${name} is unavailable: ${e.message}`);}
  let result;
  try{
    if(candidateFile){
      if(remote&&name===`update-v${version}.json`&&remote.version!==version)
        throw new Error('Historical target is occupied by a different version');
      if(remote)assertExpectedPrior(remote,mirror,expected,name,rollback||{});
      result={manifest:mirror,changed:remote&&JSON.stringify(remote)===JSON.stringify(mirror)?0:1};
    }else result=repointReleaseToMirror(remote,mirror,{label:name});
  }catch(e){throw new Error(`Required remote ${name} failed delivery identity: ${e.message}`);}
  planned.push({name,result,remote});
}
console.log(`Mirror v${version} passed rooted full+delta identity and prior-pointer validation.`);
for(const {name,result} of planned)console.log(`PLAN ${name}: ${result.changed?'update':'already matching'}`);
if(!apply){
  console.log('DRY RUN — all required manifests validated; nothing written. Re-run with --apply.');
  process.exit(0);
}

// A mirror pointer alone is not proof: verify all bytes, chunk hashes, CORS and
// endpoint ranges before the HF aliases can expose this candidate.
await verifyActivationPayloads(fetch,mirror,{onProgress:(done,total,file)=>console.log(`VERIFIED ${done}/${total} ${file}`)});
assertManifestExact(await getJson(WORKER),mirror,'Worker changed during HF activation preflight');
if((await getJson(repoUrl,{bust:false})).sha!==snapshot.sha)throw new Error('HF changed during preflight; rerun to review the new prior state');
await assertNoVerificationFreeze(root);
const scratch=resolve(root,'.tmp','ota-delivery-repair',`repoint-v${version}`);
await mkdir(scratch,{recursive:true});
const backups=[{name:'local-update.json',remote:local},...planned.filter(item=>item.remote)];
for(const {name,remote} of backups){
  const prior=validateReleaseIdentity(remote,name);
  const output=resolve(scratch,`rollback-v${prior.version}-${prior.manifestRoot}-${name}`);
  if(existsSync(output))assertManifestExact(await readJson(output),remote,'Rollback evidence already differs');
  else await writeFile(output,JSON.stringify(remote,null,2)+'\n');
}
const staged=[];
for(const {name,result} of planned.filter(item=>item.result.changed>0)){
  const output=resolve(scratch,name);
  await writeFile(output,JSON.stringify(result.manifest,null,2)+'\n');
  staged.push({name,output});
}
staged.sort((a,b)=>(a.name==='update.json'?1:0)-(b.name==='update.json'?1:0));
if(staged.length){
  const py=[
    'import json,sys',
    'from huggingface_hub import HfApi, CommitOperationAdd',
    'p=json.loads(sys.argv[1])',
    'ops=[CommitOperationAdd(path_in_repo=f["name"],path_or_fileobj=f["output"]) for f in p["files"]]',
    'r=HfApi().create_commit(repo_id=p["repo"],repo_type="dataset",operations=ops,parent_commit=p["parent"],commit_message=p["message"])',
    'print(json.dumps({"commit":r.oid}))'
  ].join('\n');
  await assertNoVerificationFreeze(root);
  try{
    const {stdout}=await pexec('python',['-c',py,JSON.stringify({repo:REPO,parent:snapshot.sha,files:staged,
      message:`Activate MASSFRONT v${version} verified full and delta mirror`})],{maxBuffer:1<<20,windowsHide:true});
    const commit=JSON.parse(stdout.trim()).commit;
    if(!/^[a-f0-9]{40}$/i.test(commit||''))throw new Error('Hub did not return a commit identity');
    for(const {name} of staged)assertManifestExact(await getJson(HF(name,commit)),mirror,`Committed ${name} differs`);
    console.log(`HF_MANIFESTS_ACTIVATED=v${version} commit=${commit}`);
  }catch(e){throw new Error(`HF activation failed; immutable objects and rollback evidence preserved: ${String(e.stderr||e.message||'').slice(0,300)}`);}
}
await assertNoVerificationFreeze(root);
await writeFile(localPath,JSON.stringify(localResult.manifest,null,2)+'\n');
await mkdir(resolve(root,'releases'),{recursive:true});
for(const name of ['MASSFRONT-update.json',`update-v${version}.json`])
  await writeFile(resolve(root,'releases',name),JSON.stringify(mirror,null,2)+'\n');
for(const name of requiredRemote(version))assertManifestExact(await getJson(HF(name)),mirror,`Live ${name} differs after activation`);
console.log(`MANIFESTS RECONCILED at v${version}; previous artifacts preserved.`);
