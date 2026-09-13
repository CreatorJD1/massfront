#!/usr/bin/env node
/* Read-only release gate for the public account/social Worker.
   OPTIONS is intentionally not used: the Worker answers preflight before route
   dispatch, so a 204 can make a missing endpoint look healthy. */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
function arg(name){const i=args.indexOf(name);return i>=0?args[i+1]:'';}
const config=JSON.parse(fs.readFileSync(path.join(ROOT,'assets','auth.json'),'utf8'));
const base=String(arg('--base')||config.syncUrl||'').replace(/\/+$/,'');
const timeoutMs=Math.max(1000,Math.min(30000,Number(arg('--timeout-ms'))||10000));
if(!/^https:\/\//i.test(base))throw new Error('A public HTTPS auth Worker URL is required.');

const checks=[
  {name:'health',method:'GET',path:'/health',status:200},
  {name:'social capability handshake',method:'GET',path:'/social/capabilities'},
  {name:'friend list',method:'GET',path:'/social/friends'},
  {name:'friend requests',method:'GET',path:'/social/requests'},
  {name:'direct-message history',method:'GET',path:'/social/messages?with=Contract_Probe'},
  {name:'presence',method:'GET',path:'/social/presence'},
  /* These are POST-only. GET must reach route dispatch and return 405, not the
     generic 404. This proves route presence without creating a lobby. */
  {name:'lobby create route',method:'GET',path:'/multiplayer/lobbies'},
  {name:'lobby join route',method:'GET',path:'/multiplayer/lobbies/join'},
  {name:'lobby invitation inbox',method:'GET',path:'/multiplayer/invites'}
];

async function request(check){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  const started=Date.now();
  try{
    const response=await fetch(base+check.path,{
      method:check.method,
      headers:{accept:'application/json',origin:'https://creatorjd-massfront-playtest.static.hf.space'},
      redirect:'error',signal:ctrl.signal
    });
    const text=(await response.text()).slice(0,300);
    let body=null;try{body=JSON.parse(text);}catch{}
    const routeMissing=response.status===404&&(body&&body.error==='route_not_found'||/no such endpoint/i.test(text));
    const ok=check.status?response.status===check.status:!routeMissing&&[401,403,405].includes(response.status);
    return {...check,ok,status:response.status,ms:Date.now()-started,body:text};
  }catch(error){
    return {...check,ok:false,status:0,ms:Date.now()-started,body:error&&error.name==='AbortError'?'timeout':String(error&&error.message||error)};
  }finally{clearTimeout(timer);}
}

console.log(`MASSFRONT live social contract: ${base}`);
const results=[];
for(const check of checks){
  const result=await request(check);results.push(result);
  console.log(`${result.ok?'PASS':'FAIL'}  ${result.name}  ${result.method} ${result.path} -> ${result.status} (${result.ms} ms)`);
  if(!result.ok&&result.body)console.log(`      ${result.body}`);
}
const failed=results.filter(result=>!result.ok);
console.log(`\nverify-social-live-contract: ${results.length-failed.length} PASS, ${failed.length} FAIL`);
if(failed.length){
  console.error('The web client must not ship ahead of these deployed Worker routes.');
  process.exitCode=1;
}
