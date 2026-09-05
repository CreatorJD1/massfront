#!/usr/bin/env node
/* Verify the delivery shape a strict installed WebView needs. Every entry that
 * the updater will request with Range is checked, including full-only recovery
 * files. Plain whole-file entries remain an explicitly labelled sample. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { releaseDeliveryInventory } from './release-delivery-contract.mjs';

const argv=process.argv.slice(2);
const after=flag=>{const i=argv.indexOf(flag);return i<0?'':String(argv[i+1]||'');};
const noBrowser=argv.includes('--no-browser');
const manifestUrl=after('--manifest'),manifestFile=after('--manifest-file');
if(argv.includes('--manifest')&&!manifestUrl) throw new Error('--manifest requires a URL');
if(argv.includes('--manifest-file')&&!manifestFile) throw new Error('--manifest-file requires a path');
if(manifestUrl&&manifestFile) throw new Error('Use either --manifest or --manifest-file, not both');
const MANIFESTS=manifestFile?[['local candidate',resolve(manifestFile),'file']]:manifestUrl?[['given',manifestUrl,'url']]:[
  ['HF resolve (client endpoint)','https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main/update.json?download=true','url'],
  ['HF raw (mirror)','https://huggingface.co/datasets/CREATORJD/massfront-releases/raw/main/update.json','url'],
  ['Cloudflare worker (mirror)','https://massfront-update.jasondixon1994.workers.dev/update.json','url']
];
const PLAIN_SAMPLE=Math.max(0,Math.min(12,Number(after('--sample')||2)|0));
const TIMEOUT_MS=Math.max(3000,Math.min(60000,Number(after('--timeout')||15000)|0));
const BROWSER_ORIGIN='https://creatorjd-massfront-playtest.static.hf.space';

async function getJson(location,kind){
  if(kind==='file') return JSON.parse((await readFile(location,'utf8')).replace(/^\uFEFF/,''));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  let response;
  try{
    response=await fetch(location+(location.includes('?')?'&':'?')+'x='+Date.now(),{cache:'no-store',signal:controller.signal});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return JSON.parse((await response.text()).replace(/^\uFEFF/,''));
  }finally{clearTimeout(timer);if(response) await cancelBody(response);}
}
async function fetchTimed(url,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try{return await fetch(url,{...options,signal:controller.signal});}
  finally{clearTimeout(timer);}
}
async function cancelBody(response){try{await response.body?.cancel();}catch(e){}}
function allowed(header){return header==='*'||header===BROWSER_ORIGIN;}
function hasToken(header,token){return header==='*'||header.toLowerCase().split(',').map(x=>x.trim()).includes(token);}

async function probeRanged(entry){
  const headers={Origin:BROWSER_ORIGIN,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'range'};
  const preflight=await fetchTimed(entry.url,{method:'OPTIONS',redirect:'manual',cache:'no-store',headers});
  try{
    if(preflight.status<200||preflight.status>=300||preflight.headers.get('location'))
      throw new Error(`preflight answered HTTP ${preflight.status}${preflight.headers.get('location')?' with a redirect':''}`);
    if(!allowed(preflight.headers.get('access-control-allow-origin')||'')) throw new Error('preflight does not allow the browser origin');
    if(!hasToken(preflight.headers.get('access-control-allow-methods')||'','get')) throw new Error('preflight does not allow GET');
    if(!hasToken(preflight.headers.get('access-control-allow-headers')||'','range')) throw new Error('preflight does not allow Range');
  }finally{await cancelBody(preflight);}

  const response=await fetchTimed(entry.url,{redirect:'manual',cache:'no-store',headers:{Origin:BROWSER_ORIGIN,Range:'bytes=0-0'}});
  try{
    const location=response.headers.get('location');
    if(location){
      const from=new URL(entry.url),to=new URL(location,entry.url);
      throw new Error(`ranged request redirects ${response.status} ${from.origin===to.origin?'on':'off'}-origin to ${to.host}`);
    }
    if(response.status!==206) throw new Error(`ranged request answered HTTP ${response.status}, not 206`);
    if(response.headers.get('content-range')!==`bytes 0-0/${entry.size}`) throw new Error('Content-Range does not match manifest size');
    if(response.headers.get('content-length')!=='1') throw new Error('one-byte range has an invalid Content-Length');
    if(!allowed(response.headers.get('access-control-allow-origin')||'')) throw new Error('response does not allow the browser origin');
    if(!hasToken(response.headers.get('access-control-expose-headers')||'','content-range'))
      throw new Error('response does not expose Content-Range');
  }finally{await cancelBody(response);}
}

async function probePlain(entry){
  const response=await fetchTimed(entry.url,{cache:'no-store',headers:{Origin:BROWSER_ORIGIN}});
  try{
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    if(!allowed(response.headers.get('access-control-allow-origin')||'')) throw new Error('response does not allow the browser origin');
  }finally{await cancelBody(response);}
}

async function runPool(entries,worker,limit=4){
  const failures=[];let cursor=0;
  const lanes=Array.from({length:Math.min(limit,entries.length)},async()=>{
    while(cursor<entries.length){
      const entry=entries[cursor++];
      try{await worker(entry);}catch(e){failures.push(`${entry.path}: ${e.message}`);}
    }
  });
  await Promise.all(lanes);return failures;
}

let failures=0;
const jobs=[];
for(const [label,location,kind] of MANIFESTS){
  let manifest,inventory;
  try{
    manifest=await getJson(location,kind);
    inventory=releaseDeliveryInventory(manifest,label);
  }catch(e){console.log(`FAIL  ${label}: manifest invalid or unreadable (${e.message})`);failures++;continue;}
  const plain=inventory.plain.slice(0,PLAIN_SAMPLE);
  const rangedFailures=await runPool(inventory.ranged,probeRanged);
  const plainFailures=await runPool(plain,probePlain);
  const bad=[...rangedFailures,...plainFailures];
  console.log(`${bad.length?'FAIL':'PASS'}  ${label}  v${manifest.version} — all ${inventory.ranged.length} ranged `+
    `entries (${inventory.ranged.filter(entry=>entry.fullOnly).length} full-only), ${plain.length}/${inventory.plain.length} plain sampled`);
  for(const error of bad.slice(0,8)) console.log(`        ${error}`);
  if(bad.length) failures++;
  jobs.push({label,picks:[...inventory.ranged,...plain]});
}

/* Optional real-engine corroboration. Do not substitute this for the manual
   redirect/preflight gate above: Chromium can tolerate delivery that an
   installed Android WebView rejects. */
if(!noBrowser&&jobs.length){
  const {launchPwBrowser,closePwBrowser}=await import('./pw-browser.mjs');
  const server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end('<!doctype html>');});
  await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
  const browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
  try{
    const page=await(await browser.newContext()).newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:120000});
    for(const {label,picks} of jobs){
      const results=await page.evaluate(async files=>{
        const out=[];
        for(const file of files){
          const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
          try{
            const response=await fetch(file.url,{cache:'no-store',signal:controller.signal,
              headers:file.ranged?{Range:'bytes=0-0'}:{}});
            const ok=file.ranged?response.status===206:response.ok;
            try{await response.body?.cancel();}catch(e){}
            out.push({path:file.path,ok,status:response.status});
          }catch(e){out.push({path:file.path,ok:false,error:String(e?.message||e)});}
          finally{clearTimeout(timer);}
        }
        return out;
      },picks.map(entry=>({path:entry.path,url:entry.url,ranged:entry.ranged})));
      const bad=results.filter(result=>!result.ok);
      console.log(`${bad.length?'FAIL':'PASS'}  ${label} in-page ${results.length-bad.length}/${results.length}`);
      if(bad.length) failures++;
    }
  }finally{
    await closePwBrowser(browser).catch(()=>{});
    await new Promise(resolveClose=>server.close(resolveClose));
  }
}

console.log('');
if(failures){
  console.log('PAYLOAD DELIVERY FAILED — at least one complete full+delta inventory is not deliverable.');
  process.exit(1);
}
console.log('PAYLOAD DELIVERY VERIFIED — all range-bearing entries passed; plain whole-file coverage is sampled as labelled.');
process.exit(0);
