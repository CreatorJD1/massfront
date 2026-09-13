#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATASET_BASE='https://huggingface.co/datasets/CREATORJD/massfront-releases';
const toolsDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(toolsDir,'..');

function fail(message){ throw new Error(message); }
function sha256(data){ return createHash('sha256').update(data).digest('hex'); }

const args=process.argv.slice(2);
if(args.length!==2){
  console.error('Usage: node tools/pin-release-manifest.mjs <VERSION> <40-char COMMIT>');
  process.exit(2);
}
const version=args[0].replace(/^v/i,'');
const commit=args[1].toLowerCase();
if(!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) fail(`Invalid VERSION: ${args[0]}`);
if(!/^[0-9a-f]{40}$/.test(commit)) fail(`Invalid COMMIT: ${args[1]}`);

async function readJson(file,label){
  let text;
  try{ text=await readFile(file,'utf8'); }
  catch(error){
    const wrapped=new Error(`${label} cannot be read: ${error.message}`);
    wrapped.code=error.code;
    throw wrapped;
  }
  try{ return JSON.parse(text); }
  catch(error){ fail(`${label} is not valid JSON: ${error.message}`); }
}

function requireManifestShape(manifest,label,expectedVersion,expectedChannel){
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)) fail(`${label} must contain a JSON object`);
  if(manifest.version!==expectedVersion) fail(`${label} version ${JSON.stringify(manifest.version)} does not match ${expectedVersion}`);
  if(typeof manifest.channel!=='string'||!manifest.channel.trim()) fail(`${label} channel must be a non-empty string`);
  if(expectedChannel!==undefined&&manifest.channel!==expectedChannel){
    fail(`${label} channel ${JSON.stringify(manifest.channel)} does not match ${JSON.stringify(expectedChannel)}`);
  }
  for(const listName of ['files','full']){
    if(!Array.isArray(manifest[listName])||manifest[listName].length===0){
      fail(`${label} must contain a non-empty ${listName} array`);
    }
  }
}

function safeArtifactPath(raw,label){
  if(typeof raw!=='string'||!raw) fail(`${label}.path must be a non-empty string`);
  if(raw.includes('\\')||raw.includes('\0')||raw.startsWith('/')||/^[A-Za-z]:/.test(raw)){
    fail(`${label}.path is not a safe staging-relative POSIX path: ${JSON.stringify(raw)}`);
  }
  const parts=raw.split('/');
  if(parts.some(part=>!part||part==='.'||part==='..')||path.posix.normalize(raw)!==raw){
    fail(`${label}.path is not normalized: ${JSON.stringify(raw)}`);
  }
  return parts;
}

function requireEntryMetadata(entry,label){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)) fail(`${label} must be an object`);
  const parts=safeArtifactPath(entry.path,label);
  if(!Number.isSafeInteger(entry.size)||entry.size<0) fail(`${label}.size must be a non-negative safe integer`);
  if(typeof entry.sha256!=='string'||!/^[0-9a-f]{64}$/i.test(entry.sha256)) fail(`${label}.sha256 must be 64 hexadecimal characters`);
  return parts;
}

const canonicalPath=path.join(root,'update.json');
const manifest=await readJson(canonicalPath,'update.json');
requireManifestShape(manifest,'update.json',version);
const channel=manifest.channel;

// Existing mirrors must describe the same release channel before they are overwritten.
for(const mirror of [
  path.join(root,'releases','MASSFRONT-update.json'),
  path.join(root,'releases',`update-v${version}.json`)
]){
  try{
    const prior=await readJson(mirror,path.relative(root,mirror));
    requireManifestShape(prior,path.relative(root,mirror),version,channel);
  }catch(error){
    if(error?.code==='ENOENT') continue;
    throw error;
  }
}

const stagingDir=path.join(root,'releases',`staging-v${version}`);
let stagingReal;
try{ stagingReal=await realpath(stagingDir); }
catch(error){ fail(`Staging directory ${path.relative(root,stagingDir)} cannot be read: ${error.message}`); }

const inventoryPath=path.join(stagingDir,'artifacts.json');
const inventory=await readJson(inventoryPath,path.relative(root,inventoryPath));
if(!Array.isArray(inventory)||inventory.length===0) fail('Staging artifacts.json must contain a non-empty array');
const inventoryByPath=new Map();
for(let i=0;i<inventory.length;i++){
  const entry=inventory[i];
  requireEntryMetadata(entry,`artifacts.json[${i}]`);
  if(inventoryByPath.has(entry.path)) fail(`Duplicate staging inventory path: ${entry.path}`);
  inventoryByPath.set(entry.path,{size:entry.size,sha256:entry.sha256.toLowerCase()});
}

const diskCache=new Map();
async function verifyEntry(entry,label){
  const parts=requireEntryMetadata(entry,label);
  const prior=inventoryByPath.get(entry.path);
  if(!prior) fail(`${label} has no matching entry in staging artifacts.json: ${entry.path}`);
  if(prior.size!==entry.size||prior.sha256!==entry.sha256.toLowerCase()){
    fail(`${label} metadata does not match staging artifacts.json: ${entry.path}`);
  }
  let actual=diskCache.get(entry.path);
  if(!actual){
    const candidate=path.resolve(stagingDir,...parts);
    const relative=path.relative(stagingDir,candidate);
    if(relative.startsWith(`..${path.sep}`)||relative==='..'||path.isAbsolute(relative)) fail(`${label} escapes the staging directory`);
    let candidateReal;
    try{ candidateReal=await realpath(candidate); }
    catch(error){ fail(`${label} staging artifact cannot be read (${entry.path}): ${error.message}`); }
    const realRelative=path.relative(stagingReal,candidateReal);
    if(realRelative.startsWith(`..${path.sep}`)||realRelative==='..'||path.isAbsolute(realRelative)){
      fail(`${label} staging artifact resolves outside the staging directory: ${entry.path}`);
    }
    const info=await stat(candidateReal);
    if(!info.isFile()) fail(`${label} staging artifact is not a regular file: ${entry.path}`);
    const bytes=await readFile(candidateReal);
    actual={size:bytes.length,sha256:sha256(bytes)};
    diskCache.set(entry.path,actual);
  }
  if(actual.size!==entry.size){
    fail(`${label} size mismatch for ${entry.path}: manifest=${entry.size}, staged=${actual.size}`);
  }
  if(actual.sha256!==entry.sha256.toLowerCase()){
    fail(`${label} SHA-256 mismatch for ${entry.path}: manifest=${entry.sha256}, staged=${actual.sha256}`);
  }
}

function listMap(entries,label){
  const result=new Map();
  for(let i=0;i<entries.length;i++){
    const entry=entries[i];
    requireEntryMetadata(entry,`${label}[${i}]`);
    if(result.has(entry.path)) fail(`Duplicate ${label} path: ${entry.path}`);
    result.set(entry.path,entry);
  }
  return result;
}

const filesByPath=listMap(manifest.files,'files');
const fullByPath=listMap(manifest.full,'full');
if(filesByPath.size!==fullByPath.size) fail(`files/full entry counts differ: ${filesByPath.size} vs ${fullByPath.size}`);
for(const [artifact,fileEntry] of filesByPath){
  const fullEntry=fullByPath.get(artifact);
  if(!fullEntry) fail(`full is missing files entry: ${artifact}`);
  if(fileEntry.size!==fullEntry.size||String(fileEntry.sha256).toLowerCase()!==String(fullEntry.sha256).toLowerCase()){
    fail(`files/full metadata differs for ${artifact}`);
  }
}
if(inventoryByPath.size!==filesByPath.size){
  fail(`Staging inventory/manifest counts differ: ${inventoryByPath.size} vs ${filesByPath.size}`);
}
for(const artifact of inventoryByPath.keys()){
  if(!filesByPath.has(artifact)) fail(`Manifest omits staged inventory artifact: ${artifact}`);
}

for(const listName of ['files','full']){
  for(let i=0;i<manifest[listName].length;i++){
    const entry=manifest[listName][i];
    await verifyEntry(entry,`${listName}[${i}]`);
    const encodedPath=entry.path.split('/').map(encodeURIComponent).join('/');
    entry.url=`${DATASET_BASE}/resolve/${commit}/v${version}/${encodedPath}?download=true`;
  }
}

const refs=new Set();
for(const listName of ['files','full']){
  for(const entry of manifest[listName]){
    if(entry.url.includes('/resolve/main/')) fail(`${listName} still contains resolve/main: ${entry.path}`);
    const parsed=new URL(entry.url);
    const match=parsed.pathname.match(/\/resolve\/([^/]+)\//);
    if(!match) fail(`${listName} URL lacks a resolve ref: ${entry.path}`);
    refs.add(match[1].toLowerCase());
  }
}
if(refs.size!==1||!refs.has(commit)) fail(`Expected exactly one immutable commit ref ${commit}; found ${[...refs].join(', ')||'none'}`);

const output=Buffer.from(`${JSON.stringify(manifest,null,2)}\n`,'utf8');
if(output.includes('/resolve/main/')) fail('Generated manifest still contains a mutable resolve/main ref');
const targets=[
  canonicalPath,
  path.join(root,'releases','MASSFRONT-update.json'),
  path.join(root,'releases',`update-v${version}.json`)
];
for(const target of targets) await writeFile(target,output);
for(const target of targets){
  const check=await readFile(target);
  if(!check.equals(output)) fail(`Post-write byte comparison failed: ${path.relative(root,target)}`);
}

console.log(`Pinned MASSFRONT v${version} ${channel} manifest to ${commit}`);
console.log(`Verified ${diskCache.size} staged artifacts across ${manifest.files.length+manifest.full.length} manifest entries`);
console.log(`Manifest bytes=${output.length} sha256=${sha256(output)}`);
for(const target of targets) console.log(`  ${path.relative(root,target)}`);
