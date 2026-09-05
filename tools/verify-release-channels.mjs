#!/usr/bin/env node
/* Read-only release equivalence and delivery gate. The local candidate and
 * every public channel must expose the same rooted delta + full fallback, and
 * every Range-bearing object must pass strict preflight/redirect/CORS checks. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {releaseDeliveryInventory} from './release-delivery-contract.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const argv=process.argv.slice(2);
const after=flag=>{const i=argv.indexOf(flag);return i<0?'':String(argv[i+1]||'');};
const REPO='CREATORJD/massfront-releases';
const WORKER='https://massfront-update.jasondixon1994.workers.dev';
const BROWSER_ORIGIN='https://creatorjd-massfront-playtest.static.hf.space';
const TIMEOUT_MS=Math.max(3000,Math.min(60000,Number(after('--timeout')||15000)|0));
const CHANNELS=[
  {name:'HF resolve (client endpoint)',url:`https://huggingface.co/datasets/${REPO}/resolve/main/update.json?download=true`},
  {name:'HF raw (mirror)',url:`https://huggingface.co/datasets/${REPO}/raw/main/update.json`},
  {name:'Cloudflare worker (mirror)',url:`${WORKER}/update.json`}
];
const failures=[];
const note=message=>console.log(message);
const fail=message=>{failures.push(message);console.log('  FAIL  '+message);};

async function getJson(url){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try{
    const response=await fetch(url+(url.includes('?')?'&':'?')+'mf_verify='+Date.now(),{cache:'no-store',signal:controller.signal});
    if(!response.ok) throw new Error('HTTP '+response.status);
    return JSON.parse((await response.text()).replace(/^\uFEFF/,''));
  }finally{clearTimeout(timer);}
}
async function readManifest(path,label){
  const manifest=JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
  return {channel:{name:label,url:path},manifest,delivery:releaseDeliveryInventory(manifest,label)};
}

const requestedCandidate=after('--manifest-file');
if(argv.includes('--manifest-file')&&!requestedCandidate) throw new Error('--manifest-file requires a path');
const candidatePath=resolve(requestedCandidate||resolve(root,'update.json'));
const candidate=await readManifest(candidatePath,after('--manifest-file')?'local candidate':'local update.json');
let expected=after('--version')||candidate.delivery.version;
if(!/^\d+\.\d+\.\d+$/.test(expected)) throw new Error('Use --version x.y.z');
if(candidate.delivery.version!==expected)
  throw new Error(`Local candidate is v${candidate.delivery.version}, not requested v${expected}`);
note(`\nEXPECTING v${expected} ${candidate.delivery.channel} from ${candidatePath}\n`);

const seen=[candidate];
for(const channel of CHANNELS){
  try{
    const manifest=await getJson(channel.url);
    const delivery=releaseDeliveryInventory(manifest,channel.name);
    seen.push({channel,manifest,delivery});
    note(`${channel.name}\n  version ${delivery.version}  delta ${delivery.inventory.files.length}  `+
      `full ${delivery.inventory.full.length}  ranged ${delivery.ranged.length}`);
    if(delivery.version!==expected) fail(`${channel.name} serves v${delivery.version}, not v${expected}.`);
  }catch(e){fail(`${channel.name} is unreadable or invalid (${e.message}).`);}
}

/* Same version is not enough. Ordered payload/full/runtime fingerprints and
   every signed root must agree with the explicit local candidate. */
for(const item of seen.slice(1)){
  const a=candidate.delivery,b=item.delivery;
  if(a.version!==b.version||a.channel!==b.channel||a.fullKind!==b.fullKind||
     a.payloadText!==b.payloadText||a.fullText!==b.fullText||a.runtimeText!==b.runtimeText||
     a.payloadRoot!==b.payloadRoot||a.fullRoot!==b.fullRoot||a.runtimeRoot!==b.runtimeRoot||
     a.manifestRoot!==b.manifestRoot)
    fail(`${item.channel.name} does not match the candidate's ordered full+delta release identity.`);
}
if(!failures.length) note('\nAll readable channels match the candidate version, channel, order, chunks and roots.');

function allowed(value){return value==='*'||value===BROWSER_ORIGIN;}
function hasToken(value,token){return value==='*'||value.toLowerCase().split(',').map(x=>x.trim()).includes(token);}
async function fetchTimed(url,options){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try{return await fetch(url,{...options,signal:controller.signal});}
  finally{clearTimeout(timer);}
}
async function cancel(response){try{await response.body?.cancel();}catch(e){}}
async function verifyRanged(entry){
  const preflight=await fetchTimed(entry.url,{method:'OPTIONS',redirect:'manual',cache:'no-store',headers:{
    Origin:BROWSER_ORIGIN,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'range'
  }});
  try{
    if(preflight.status<200||preflight.status>=300||preflight.headers.get('location')) throw new Error(`preflight HTTP ${preflight.status} or redirect`);
    if(!allowed(preflight.headers.get('access-control-allow-origin')||'')) throw new Error('preflight origin denied');
    if(!hasToken(preflight.headers.get('access-control-allow-methods')||'','get')) throw new Error('preflight GET denied');
    if(!hasToken(preflight.headers.get('access-control-allow-headers')||'','range')) throw new Error('preflight Range denied');
  }finally{await cancel(preflight);}
  const response=await fetchTimed(entry.url,{redirect:'manual',cache:'no-store',headers:{Origin:BROWSER_ORIGIN,Range:'bytes=0-0'}});
  try{
    const location=response.headers.get('location');
    if(location) throw new Error(`ranged request redirects HTTP ${response.status} to ${new URL(location,entry.url).host}`);
    if(response.status!==206) throw new Error(`HTTP ${response.status}, expected 206`);
    if(response.headers.get('content-range')!==`bytes 0-0/${entry.size}`) throw new Error('invalid Content-Range');
    if(response.headers.get('content-length')!=='1') throw new Error('invalid Content-Length');
    if(!allowed(response.headers.get('access-control-allow-origin')||'')) throw new Error('response origin denied');
    if(!hasToken(response.headers.get('access-control-expose-headers')||'','content-range')) throw new Error('Content-Range not exposed');
  }finally{await cancel(response);}
}
async function pool(entries,worker,limit=4){
  const bad=[];let cursor=0;
  await Promise.all(Array.from({length:Math.min(limit,entries.length)},async()=>{
    while(cursor<entries.length){const entry=entries[cursor++];try{await worker(entry);}catch(e){bad.push(`${entry.path}: ${e.message}`);}}
  }));
  return bad;
}

for(const item of seen){
  const bad=await pool(item.delivery.ranged,verifyRanged);
  note(`${bad.length?'FAIL':'PASS'}  ${item.channel.name}: all ${item.delivery.ranged.length} ranged entries `+
    `(${item.delivery.ranged.filter(entry=>entry.fullOnly).length} full-only)`);
  for(const message of bad.slice(0,8)) note('        '+message);
  if(bad.length) fail(`${item.channel.name} has ${bad.length} undeliverable ranged payload(s).`);
}

/* Optional marker proof searches the complete inventory, so a fix retained
   only in full recovery is still addressable rather than silently skipped. */
const require=after('--require');
if(require){
  const cut=require.indexOf(':'),reqPath=cut>0?require.slice(0,cut):'src/updater.js';
  const reqMarker=cut>0?require.slice(cut+1):require;
  for(const item of seen){
    const target=item.delivery.entries.find(entry=>entry.path===reqPath);
    if(!target){fail(`${item.channel.name} does not advertise ${reqPath}.`);continue;}
    try{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
      let body;
      try{const response=await fetch(target.url,{cache:'no-store',signal:controller.signal});body=await response.text();}
      finally{clearTimeout(timer);}
      if(!body.includes(reqMarker)) fail(`${item.channel.name} ${reqPath} lacks the expected marker.`);
      else note(`${item.channel.name} ${reqPath} contains the expected marker.`);
    }catch(e){fail(`${item.channel.name} could not read ${reqPath} (${e.message}).`);}
  }
}

if(failures.length){
  console.log(`\nRELEASE CHANNELS NOT CONSISTENT — ${failures.length} problem(s):`);
  failures.forEach(message=>console.log('  - '+message));
  process.exit(1);
}
console.log(`\nRELEASE CHANNELS VERIFIED at v${expected}: complete metadata identities match and every ranged full+delta object is directly deliverable.`);
