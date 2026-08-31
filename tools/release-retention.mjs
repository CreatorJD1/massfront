#!/usr/bin/env node
/*
 * Release retention and rollback controller.
 *
 * Default mode is read-only.  It discovers the newest retained release
 * manifests, validates that each can be selected, and prints the result.
 *
 *   node tools/release-retention.mjs --write-index
 *   node tools/release-retention.mjs --prune-local --apply
 *   node tools/release-retention.mjs --activate 1.33.47 --apply
 *   node tools/release-retention.mjs --activate 1.33.47 --publish-active --apply --confirm-retain 1.33.48,1.33.47,1.33.46,1.33.45,1.33.44
 *
 * `--activate` only prepares the three local mutable manifest mirrors. It
 * deliberately does not contact a host: publishing that selection remains a
 * separate, explicit release operation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const releases=path.join(root,'releases');
const args=new Set(process.argv.slice(2));
const valueAfter=flag=>{const i=process.argv.indexOf(flag);return i<0?'':String(process.argv[i+1]||'');};
const keepCount=Number(valueAfter('--keep')||5);
const activate=valueAfter('--activate').replace(/^v/,'');
const apply=args.has('--apply');
const confirmRetain=valueAfter('--confirm-retain');
const versionRx=/v(\d+\.\d+(?:\.\d+)?)(?![\d.])/ig;

if(!Number.isInteger(keepCount)||keepCount<2||keepCount>20) throw new Error('--keep must be an integer from 2 through 20');
if(!fs.existsSync(releases)) throw new Error('releases/ is missing');

function semver(v){
  const p=String(v).split('.').map(Number);
  return [p[0]||0,p[1]||0,p[2]||0];
}
function compareVersion(a,b){
  const aa=semver(a),bb=semver(b);
  for(let i=0;i<3;i++) if(aa[i]!==bb[i]) return bb[i]-aa[i];
  return 0;
}
function walk(dir,out=[]){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,ent.name);
    if(ent.isDirectory()) walk(full,out); else if(ent.isFile()) out.push(full);
  }
  return out;
}
function readJson(file){ return JSON.parse(fs.readFileSync(file,'utf8')); }
function resolveHfCli(){
  const candidates=[process.env.HF_CLI,'hf'].filter(Boolean);
  const pythonRoot=process.env.APPDATA&&path.join(process.env.APPDATA,'Python');
  if(pythonRoot&&fs.existsSync(pythonRoot)){
    for(const dir of fs.readdirSync(pythonRoot).filter(name=>/^Python\d+$/i.test(name)).sort().reverse())
      candidates.push(path.join(pythonRoot,dir,'Scripts','hf.exe'));
  }
  for(const hf of [...new Set(candidates)]){
    try{execFileSync(hf,['--version'],{stdio:'ignore'});return hf;}catch{}
  }
  throw new Error('Hugging Face CLI missing. Install it or set HF_CLI to its executable path.');
}
function versionFor(file){
  /* A release payload can live below staging-vX.Y.Z/ even when its individual
     filenames are plain `src/foo.js`. Scan its repository-relative path, not
     just the basename, or cleanup leaves whole obsolete OTA trees behind. */
  const found=[...path.relative(releases,file).matchAll(versionRx)];
  return found.length?found[found.length-1][1]:'';
}
function bytes(n){ return `${(n/1024/1024).toFixed(1)} MiB`; }

const files=walk(releases);
const versioned=files.filter(file=>versionFor(file));
const versions=[...new Set(versioned.map(versionFor))].sort(compareVersion);
const retained=versions.slice(0,keepCount);
const retired=versions.slice(keepCount);
const active=readJson(path.join(root,'update.json')).version;
if(!retained.includes(active)) throw new Error(`Live version ${active} is not within the ${keepCount} retained versions`);

function manifestFor(version){
  const file=path.join(releases,`update-v${version}.json`);
  if(!fs.existsSync(file)) return {version,eligible:false,reason:'historical manifest missing'};
  let manifest;
  try{manifest=readJson(file);}catch(e){return {version,eligible:false,reason:`invalid JSON: ${e.message}`};}
  const payload=Array.isArray(manifest.files)&&manifest.files.length?manifest.files:
    (Array.isArray(manifest.full?.files)&&manifest.full.files.length?manifest.full.files:[]);
  if(String(manifest.version)!==version) return {version,eligible:false,reason:`manifest declares ${manifest.version||'no version'}`};
  if(!payload.length) return {version,eligible:false,reason:'manifest has no complete payload'};
  const bad=payload.find(f=>!f||typeof f.path!=='string'||!Number.isFinite(f.size)||f.size<=0||!f.sha256);
  if(bad) return {version,eligible:false,reason:'manifest has an invalid payload entry'};
  return {version,eligible:true,manifest:`update-v${version}.json`,kind:manifest.kind||'full',files:payload.length};
}

const choices=retained.map(manifestFor);
const bad=choices.filter(choice=>!choice.eligible);
if(bad.length) throw new Error(`Retention set is not rollback-safe: ${bad.map(x=>`v${x.version} (${x.reason})`).join(', ')}`);
const retiredFiles=versioned.filter(file=>retired.includes(versionFor(file)));
const retainedFiles=versioned.filter(file=>retained.includes(versionFor(file)));
const index={
  schema:'MASSFRONT_RELEASE_RETENTION_V1',
  activeVersion:active,
  retentionCount:keepCount,
  releases:choices.map(choice=>({...choice,active:choice.version===active})),
  selection:{command:'node tools/release-retention.mjs --activate <version> --apply',requiresExplicitApply:true},
};
const indexFile=path.join(releases,'rollback-index.json');

function remoteVersionFor(remotePath){
  const found=[...String(remotePath).matchAll(versionRx)];
  return found.length?found[found.length-1][1]:'';
}
async function remoteTree(){
  let url='https://huggingface.co/api/datasets/CREATORJD/massfront-releases/tree/main?recursive=true&expand=false&limit=1000';
  const all=[];
  while(url){
    const response=await fetch(url);
    if(!response.ok) throw new Error(`Hugging Face inventory failed: HTTP ${response.status}`);
    all.push(...await response.json());
    const link=response.headers.get('link')||'';
    url=link.match(/<([^>]+)>; rel="next"/)?.[1]||'';
  }
  return all.filter(entry=>entry.type==='file');
}
async function pruneHuggingFace(){
  const remote=await remoteTree();
  const versionedRemote=remote.map(entry=>({...entry,version:remoteVersionFor(entry.path)})).filter(entry=>entry.version);
  const remoteVersions=[...new Set(versionedRemote.map(entry=>entry.version))].sort(compareVersion);
  const remoteRetained=remoteVersions.slice(0,keepCount);
  if(remoteRetained.join(',')!==retained.join(','))
    throw new Error(`Remote retention differs from local: remote=${remoteRetained.join(',')} local=${retained.join(',')}`);
  const activeRemote=await (await fetch('https://huggingface.co/datasets/CREATORJD/massfront-releases/raw/main/update.json')).json();
  if(String(activeRemote.version)!==active) throw new Error(`Remote live updater is v${activeRemote.version}, not local v${active}`);
  const old=versionedRemote.filter(entry=>!retained.includes(entry.version));
  console.log(`HF_RECLAIM=${old.length} files / ${bytes(old.reduce((n,entry)=>n+(entry.size||0),0))}`);
  if(!args.has('--prune-hf')) return;
  if(!apply) throw new Error('--prune-hf is destructive; rerun with --apply');
  if(confirmRetain!==retained.join(',')) throw new Error(`Refusing remote deletion: pass --confirm-retain ${retained.join(',')}`);
  const hf=resolveHfCli();
  const batchSize=40;
  for(let i=0;i<old.length;i+=batchSize){
    const batch=old.slice(i,i+batchSize).map(entry=>entry.path);
    console.log(`HF_DELETE_BATCH ${i/batchSize+1}/${Math.ceil(old.length/batchSize)} (${batch.length} files)`);
    execFileSync(hf,['repos','delete-files','CREATORJD/massfront-releases',...batch,
      '--type','dataset','--commit-message',`Prune retired MASSFRONT releases; retain ${retained.map(v=>`v${v}`).join(', ')}`],{stdio:'inherit'});
  }
}

console.log(`ACTIVE=v${active}`);
console.log(`RETAIN=${retained.map(v=>`v${v}`).join(', ')}`);
console.log(`RETIRED=${retired.length} versions / ${retiredFiles.length} files / ${bytes(retiredFiles.reduce((n,f)=>n+fs.statSync(f).size,0))}`);
for(const choice of choices) console.log(`ROLLBACK v${choice.version}: ${choice.files} files (${choice.kind})`);

if(args.has('--write-index')){
  if(!apply) throw new Error('--write-index changes releases/rollback-index.json; rerun with --apply');
  fs.writeFileSync(indexFile,JSON.stringify(index,null,2)+'\n');
  console.log(`WROTE ${path.relative(root,indexFile)}`);
}

if(args.has('--prune-local')){
  if(!apply) throw new Error('--prune-local is a destructive operation; rerun with --apply');
  for(const file of retiredFiles) fs.rmSync(file,{force:true});
  console.log(`PRUNED_LOCAL ${retiredFiles.length} files`);
}

if(activate){
  const choice=choices.find(x=>x.version===activate);
  if(!choice) throw new Error(`v${activate} is not in the retained rollback catalog`);
  if(!apply) throw new Error('--activate changes the local active manifests; rerun with --apply');
  const source=path.join(releases,choice.manifest);
  const manifest=fs.readFileSync(source,'utf8');
  for(const target of [path.join(root,'update.json'),path.join(releases,'update.json'),path.join(releases,'MASSFRONT-update.json')])
    fs.writeFileSync(target,manifest);
  console.log(`ACTIVATED_LOCAL v${activate}; no remote manifest was uploaded`);
}

if(args.has('--publish-active')){
  if(!activate) throw new Error('--publish-active requires --activate <version>');
  if(!apply) throw new Error('--publish-active changes the live updater; rerun with --apply');
  if(confirmRetain!==retained.join(',')) throw new Error(`Refusing live activation: pass --confirm-retain ${retained.join(',')}`);
  /* Refuse to overwrite a live release that changed after this retention run
     began. The historical payloads are immutable; only these two pointers are
     mutable and are deliberately written last. */
  const remote=await (await fetch('https://huggingface.co/datasets/CREATORJD/massfront-releases/raw/main/update.json')).json();
  if(String(remote.version)!==active) throw new Error(`Remote live updater changed to v${remote.version}; re-audit before activating v${activate}`);
  const hf=resolveHfCli();
  execFileSync(hf,['upload','CREATORJD/massfront-releases',path.join(releases,'MASSFRONT-update.json'),'MASSFRONT-update.json',
    '--type','dataset','--commit-message',`Prepare MASSFRONT rollback mirror v${activate}`],{stdio:'inherit'});
  execFileSync(hf,['upload','CREATORJD/massfront-releases',path.join(root,'update.json'),'update.json',
    '--type','dataset','--commit-message',`Activate retained MASSFRONT v${activate}`],{stdio:'inherit'});
  console.log(`ACTIVATED_HF v${activate}`);
}

console.log(`RETAINED_FILES=${retainedFiles.length} (${bytes(retainedFiles.reduce((n,f)=>n+fs.statSync(f).size,0))})`);
await pruneHuggingFace();
