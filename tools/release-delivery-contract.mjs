import { createHash } from 'node:crypto';
import { releaseInventory,buildMirrorManifest } from './mirror-release-contract.mjs';

const HASH=/^[0-9a-f]{64}$/i;
const VERSION=/^\d+\.\d+\.\d+$/;

function fail(message){ throw new Error(message); }
const sha=value=>createHash('sha256').update(value).digest('hex');

function validateChunks(entry,scope){
  if(entry.chunks==null) return '-';
  if(!Array.isArray(entry.chunks)||!entry.chunks.length)
    fail(`Invalid chunk table in ${scope}: ${entry.path}`);
  let offset=0;
  const rows=[];
  for(const chunk of entry.chunks){
    if(!chunk||!Number.isSafeInteger(chunk.offset)||chunk.offset!==offset||
       !Number.isSafeInteger(chunk.size)||chunk.size<=0||!HASH.test(chunk.sha256||''))
      fail(`Invalid chunk table in ${scope}: ${entry.path}`);
    rows.push(`${chunk.offset}|${chunk.size}|${String(chunk.sha256).toLowerCase()}`);
    offset+=chunk.size;
  }
  if(offset!==entry.size) fail(`Incomplete chunk table in ${scope}: ${entry.path}`);
  return rows.join(',');
}

function fingerprint(entries,scope){
  return entries.map(entry=>
    `${entry.path}|${entry.size}|${String(entry.sha256).toLowerCase()}|${validateChunks(entry,scope)}`
  ).join('\n');
}

function runtimeFingerprint(entries){
  return entries.map(entry=>`${entry.path}|${entry.size}|${String(entry.sha256).toLowerCase()}`).join('\n');
}

export function validateReleaseIdentity(source,label='release manifest'){
  if(!source||Number(source.schema)<3) fail(`${label} is not a rooted schema-3 release`);
  if(!VERSION.test(String(source.version||''))) fail(`${label} has an invalid version`);
  const channel=String(source.channel||'').toLowerCase();
  if(channel!=='stable'&&channel!=='preview') fail(`${label} has an invalid channel`);
  for(const key of ['manifestRoot','payloadRoot','fullRoot','runtimeRoot'])
    if(!HASH.test(source[key]||'')) fail(`${label} has an invalid ${key}`);
  const inventory=releaseInventory(source);
  const payloadText=fingerprint(inventory.files,`${label} payload`);
  const fullText=fingerprint(inventory.full,`${label} full`);
  const runtimeText=runtimeFingerprint(inventory.full);
  const payloadRoot=sha(payloadText),fullRoot=sha(fullText),runtimeRoot=sha(runtimeText);
  const contract=[
    `schema=${source.schema}`,`channel=${channel}`,`version=${source.version}`,
    `kind=${source.kind||''}`,`category=${source.category||''}`,`patchFrom=${source.patchFrom||''}`,
    `payload=${payloadRoot}`,`full=${fullRoot}`,`runtime=${runtimeRoot}`
  ].join('\n');
  const manifestRoot=sha(contract);
  for(const [key,actual] of Object.entries({payloadRoot,fullRoot,runtimeRoot,manifestRoot}))
    if(String(source[key]).toLowerCase()!==actual) fail(`${label} ${key} does not match its release identity`);
  return {
    inventory,version:String(source.version),channel,fullKind:inventory.fullKind,
    payloadText,fullText,runtimeText,payloadRoot,fullRoot,runtimeRoot,manifestRoot
  };
}

export function releaseDeliveryInventory(source,label='release manifest'){
  const identity=validateReleaseIdentity(source,label);
  for(const entry of identity.inventory.entries){
    let url;
    try{url=new URL(entry.url);}catch(e){fail(`${label} has an invalid delivery URL for ${entry.path}`);}
    if(url.protocol!=='https:'||url.username||url.password)
      fail(`${label} has an unsafe delivery URL for ${entry.path}`);
  }
  const payloadByPath=new Map(identity.inventory.files.map(entry=>[entry.path,entry]));
  for(const entry of identity.inventory.full){
    const payload=payloadByPath.get(entry.path);
    if(payload&&payload.url!==entry.url)
      fail(`${label} payload/full delivery URLs disagree for ${entry.path}`);
  }
  const payloadPaths=new Set(identity.inventory.files.map(entry=>entry.path));
  const fullPaths=new Set(identity.inventory.full.map(entry=>entry.path));
  const entries=identity.inventory.entries.map(entry=>({
    ...entry,
    scopes:[...(payloadPaths.has(entry.path)?['payload']:[]),...(fullPaths.has(entry.path)?['full']:[])],
    fullOnly:fullPaths.has(entry.path)&&!payloadPaths.has(entry.path),
    ranged:Array.isArray(entry.chunks)&&entry.chunks.length>1
  }));
  return {...identity,entries,ranged:entries.filter(entry=>entry.ranged),plain:entries.filter(entry=>!entry.ranged)};
}

function mirrorHost(source,identity,label){
  let base;
  try{base=new URL(source.base);}catch(e){fail(`${label} has no valid mirror base`);}
  if(base.protocol!=='https:'||base.search||base.hash||base.username||base.password)
    fail(`${label} mirror base must be an absolute HTTPS URL`);
  const expectedPath=`/f/${identity.version}/`;
  if(base.pathname!==expectedPath) fail(`${label} mirror base path must be ${expectedPath}`);
  return base.origin;
}

function entryUrls(source){
  const inventory=releaseInventory(source);
  return {
    payload:inventory.files.map(entry=>entry.url),
    full:inventory.full.map(entry=>entry.url)
  };
}

export function repointReleaseToMirror(source,mirror,{label='release manifest'}={}){
  const identity=validateReleaseIdentity(source,label);
  const mirrorIdentity=validateReleaseIdentity(mirror,'mirror release manifest');
  if(identity.version!==mirrorIdentity.version) fail(`${label} version does not match the mirror`);
  if(identity.channel!==mirrorIdentity.channel) fail(`${label} channel does not match the mirror`);
  if(identity.fullKind!==mirrorIdentity.fullKind) fail(`${label} full fallback shape does not match the mirror`);
  for(const key of ['payloadText','fullText','runtimeText','payloadRoot','fullRoot','runtimeRoot','manifestRoot'])
    if(identity[key]!==mirrorIdentity[key]) fail(`${label} ${key} does not match the mirror`);

  const host=mirrorHost(mirror,mirrorIdentity,'mirror release manifest');
  const canonicalMirror=buildMirrorManifest(mirror,{host,version:identity.version});
  const advertised=entryUrls(mirror),expected=entryUrls(canonicalMirror);
  if(JSON.stringify(advertised)!==JSON.stringify(expected)||mirror.base!==canonicalMirror.base)
    fail('Mirror release manifest contains a non-canonical delivery URL');

  const result=buildMirrorManifest(source,{host,version:identity.version});
  const before=entryUrls(source),after=entryUrls(result);
  let changed=0;
  for(const scope of ['payload','full'])
    for(let i=0;i<before[scope].length;i++) if(before[scope][i]!==after[scope][i]) changed++;
  validateReleaseIdentity(result,`${label} repointed result`);
  return {manifest:result,changed,host,version:identity.version,channel:identity.channel};
}
