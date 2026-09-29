#!/usr/bin/env node
/* One bounded, packed-www, two-client diagnostic against explicit LOCAL services.
   This is not a release or multiplayer-completion gate: it identifies whether
   two real WebGL2 peers differ before tick 1, fall behind the Worker, or diverge
   after applying the same first 30 authoritative packets. */
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {acquireVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
if(args.includes('--help')){
  console.log('Usage: node tools/verify-multiplayer-boot-local.mjs --worker http://127.0.0.1:PORT --game http://127.0.0.1:PORT/ [--out tmp/unique-report.json]');
  process.exit(0);
}
function option(name){const i=args.indexOf('--'+name);return i<0?null:args[i+1];}
function localUrl(raw,label){
  assert(raw,`Explicit --${label} is required`);
  const u=new URL(raw);
  assert(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&/^\d+$/.test(u.port)&&Number(u.port)>0&&Number(u.port)<65536,
    `--${label} must use explicit http://127.0.0.1:PORT`);
  assert(!u.username&&!u.password&&!u.search&&!u.hash,`--${label} may not contain credentials, query or fragment`);
  assert(label==='game'?['/','/index.html'].includes(u.pathname):u.pathname==='/',
    `--${label} must be the local service root or packed /index.html`);
  return u;
}
const worker=localUrl(option('worker'),'worker'),game=localUrl(option('game'),'game');
assert(worker.origin!==game.origin,'Game and Worker must use separate explicit local ports');
const run=Date.now().toString(36)+randomBytes(3).toString('hex');
const out=resolve(root,option('out')||`tmp/multiplayer-boot-local/${run}.json`);
const outRel=relative(resolve(root,'tmp'),out);
assert(outRel&&!outRel.startsWith('..')&&!isAbsolute(outRel),'Evidence must stay under project tmp/');
const outDir=resolve(root,'tmp/multiplayer-boot-local',run),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const gameBase=new URL('.',game),now=()=>new Date().toISOString(),delay=ms=>new Promise(r=>setTimeout(r,ms));
const report={schema:'massfront.multiplayer.boot-local.v1',run,startedAt:now(),worker:worker.origin,game:game.href,
  scope:'One local packed-www two-context hardware-WebGL2 match launch through first tick-30 hash; no production, reward, long-match or reconnect acceptance.',
  steps:[],sourcePack:{},clients:{},wire:{A:wireState(),B:wireState()},remoteBlocked:[],errors:[],cleanup:[],
  screenshots:{},classification:null,limitations:[]};
const accounts=[{label:'A',email:`mf-boot-${run}-a@example.com`,username:`mfa${run.slice(-8)}`,token:null},
  {label:'B',email:`mf-boot-${run}-b@example.com`,username:`mfb${run.slice(-8)}`,token:null}];
const password='Local-Boot-QA-'+randomBytes(18).toString('hex')+'!';
const pages=[];let browser=null,guard=null,prepareAt=0,deadlineAt=0;
function wireState(){return {inboundTickHead:0,inboundTickCount:0,firstTickAt:null,tick30At:null,
  tickPackets:{},sentHashes:[],hashAcks:[],agreements:[],divergences:[],rejects:[],frames:[],socketClosedAt:null};}
function step(name,detail=''){report.steps.push({name,at:now(),detail});console.log(name+(detail?' '+detail:''));}
function bounded(promise,ms,label){
  let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timeout')),ms);})])
    .finally(()=>clearTimeout(timer));
}
function remaining(cap=10000){const ms=deadlineAt?deadlineAt-Date.now():cap;if(ms<=0)throw new Error('post-prepare 60-second deadline');return Math.min(cap,ms);}
async function fetchBytes(url){const r=await fetch(url,{signal:AbortSignal.timeout(6000)});assert(r.ok,`HTTP ${r.status} ${url.pathname}`);return Buffer.from(await r.arrayBuffer());}
async function preflight(){
  const health=await fetch(worker.origin+'/health',{signal:AbortSignal.timeout(6000)});
  assert(health.ok,`Local Worker health ${health.status}`);
  const paths=['index.html','boot.js','assets/data/runtime-compatibility.json',
    'src/main.js','src/game/commander.js','src/game/determinism.js','src/game/statehash.js','src/socialui.js','src/game/matchconsumer.js'];
  for(const path of paths){
    const packed=await readFile(resolve(root,'www',path)),served=await fetchBytes(new URL(path,gameBase));
    const row={packed:sha(packed),served:sha(served)};
    if(path.startsWith('src/'))row.source=sha(await readFile(resolve(root,path)));
    report.sourcePack[path]=row;
    assert(row.packed===row.served&&(!row.source||row.source===row.packed),`Source/packed/served mismatch: ${path}`);
  }
  report.runtime=JSON.parse((await readFile(resolve(root,'www/assets/data/runtime-compatibility.json'))).toString('utf8').replace(/^\uFEFF/,''));
  assert(/^\d+\.\d+\.\d+/.test(report.runtime.buildVersion),'Packed runtime descriptor invalid');
  report.gitHead=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
}
function wireFrame(label,direction,payload){
  let body;try{body=JSON.parse(payload);}catch{return;}
  if(!body||body.protocol!=='massfront-match')return;
  const W=report.wire[label],at=now(),type=String(body.type||'');
  if(type==='tick'&&direction==='received'){
    const tick=Number(body.tick);if(!Number.isSafeInteger(tick))return;
    W.inboundTickHead=Math.max(W.inboundTickHead,tick);W.inboundTickCount++;
    if(tick===1&&!W.firstTickAt)W.firstTickAt=at;
    if(tick===30&&!W.tick30At)W.tick30At=at;
    if(tick>=1&&tick<=30)W.tickPackets[tick]={sha256:sha(String(payload)),commands:Array.isArray(body.commands)?body.commands.length:null,at};
    return;
  }
  const row={at,direction,type,tick:Number.isSafeInteger(body.tick)?body.tick:null,
    code:typeof body.code==='string'?body.code:undefined,seat:Number.isSafeInteger(body.seat)?body.seat:undefined};
  /* Keep only digest-shaped setup evidence; welcome frames also carry a
     resumeToken that must never enter the report. */
  for(const key of ['setupHash','rulesHash','stateHash'])if(/^[a-f0-9]{64}$/.test(String(body[key]||'')))row[key]=body[key];
  if(type==='welcome'&&/^[a-f0-9]{64}$/.test(String(body.compatibility?.rulesHash||'')))
    row.rulesHash=body.compatibility.rulesHash;
  if(type==='stateHash'&&direction==='sent'){
    row.hash=typeof body.hash==='string'?body.hash:undefined;
    row.serverHeadAtSend=W.inboundTickHead;
    row.tickLag=W.inboundTickHead-(row.tick||0);
    W.sentHashes.push(row);
  }else if(type==='hashAck')W.hashAcks.push(row);
  else if(type==='hashAgreement'){
    row.hash=typeof body.hash==='string'?body.hash:undefined;W.agreements.push(row);
  }else if(type==='divergence'){
    row.seats=Array.isArray(body.seats)?body.seats.map(s=>({seat:s.seat,hash:s.hash})):[];
    W.divergences.push(row);
  }else if(type==='reject')W.rejects.push(row);
  if(W.frames.length<100)W.frames.push(row);else if(type!=='hashAck'){
    W.frames.splice(20,1);W.frames.push(row);
  }
}
function probeInit({endpoint}){
  window.MASSFRONT_AUTH_URL=endpoint;
  const P=window.__mfBootProbe={events:[],eventCount:0,tick0:null,firstTickAppliedAt:null,tick30AppliedAt:null,
    welcomeAt:null,startAt:null,bootstrapReadyAt:null,contextLost:0};
  const stamp=()=>({at:new Date().toISOString(),perfMs:performance.now()});
  function setup(){
    const det=window.MFDeterministicSim?.snapshot?.()||null;
    return {map:typeof curMap==='string'?curMap:null,preset:typeof battlefieldPreset==='string'?battlefieldPreset:null,
      topology:typeof mfWorldTopologyKey==='function'?mfWorldTopologyKey():null,
      playerStart:typeof playerStartZone==='string'?playerStartZone:null,
      aiSlots:typeof aiSlots!=='undefined'&&Array.isArray(aiSlots)?aiSlots.map(s=>({on:!!s.on,ally:!!s.ally,zone:s.zone,diff:s.diff,behavior:s.behavior})):[],
      difficulty:typeof difficulty==='number'?difficulty:null,
      aiFactionSelection:typeof aiFactionSel==='string'?aiFactionSel:null,
      aiFaction:typeof AI!=='undefined'&&AI?AI.fac:null,
      playerFaction:typeof playerFaction==='string'?playerFaction:null,
      commander:typeof playerCommanderId==='string'?playerCommanderId:null,
      wildcardChoice:typeof wcChoice==='number'?wcChoice:null,
      wildcards:typeof wcActive!=='undefined'&&Array.isArray(wcActive)?wcActive.map(w=>w.id):[],
      deploymentPackage:typeof deploymentPackage==='string'?deploymentPackage:null,
      ownedPerks:typeof META!=='undefined'&&META?.owned?Object.fromEntries(Object.entries(META.owned).sort(([a],[b])=>a.localeCompare(b))):{},
      godMode:typeof META!=='undefined'&&META?.settings?META.settings.godMode===true:false,
      determinism:det,units:typeof unitHigh==='number'?unitHigh:null,
      buildings:typeof blds!=='undefined'&&Array.isArray(blds)?blds.length:null,
      passCells:typeof PASS!=='undefined'&&PASS?PASS.length:null,
      matchLive:typeof matchLive==='boolean'?matchLive:null};
  }
  let watch=null,capturing=false;
  function maybeTick0(){
    if(capturing)return;
    const C=window.MFMatchCommandConsumer;
    if(!C||!C.sessionActive?.())return;
    const applied=C.lastAppliedTick?.();
    if(applied>0){P.tick0={ok:false,reason:'tick0_window_missed',...stamp(),applied};clearInterval(watch);return;}
    if(applied!==0||typeof running!=='boolean'||!running||typeof matchLive!=='boolean'||!matchLive||
       typeof mfGameplayStateHash!=='function')return;
    capturing=true;clearInterval(watch);
    const at=stamp();
    try{
      const settings=setup();P.tick0={ok:false,reason:'digest_pending',...at,setup:settings};
      Promise.all([Promise.resolve().then(()=>mfGameplayStateHash()),
        crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(settings)))])
        .then(([hash,bytes])=>{P.tick0={ok:/^[a-f0-9]{64}$/.test(hash),...at,hash,
          setupSha256:Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join(''),setup:settings};})
        .catch(e=>{P.tick0={ok:false,reason:String(e?.code||e?.message||e),...at,setup:settings};});
    }catch(e){P.tick0={ok:false,reason:String(e?.code||e?.message||e),...at};}
  }
  for(const name of ['status','welcome','start','bootstrapReady','tick','hashAck','hashAgreement','divergence','reject','protocolError','matchEnd'])
    window.addEventListener('massfront-match:'+name,event=>{
      const d=event.detail||{},at=stamp(),row={name,...at,tick:d.tick,state:d.state,code:d.code,reason:d.reason,seat:d.seat};
      P.eventCount++;
      if(name!=='tick'||d.tick===1||d.tick===30||d.tick===60){
        if(P.events.length<100)P.events.push(row);
        else {P.events.splice(20,1);P.events.push(row);}
      }
      if(name==='welcome'&&!P.welcomeAt){P.welcomeAt=at;watch=setInterval(maybeTick0,8);}
      if(name==='start'&&!P.startAt)P.startAt=at;
      if(name==='bootstrapReady'&&!P.bootstrapReadyAt)P.bootstrapReadyAt=at;
      if(name==='tick'&&d.tick===1&&!P.firstTickAppliedAt)P.firstTickAppliedAt=at;
      if(name==='tick'&&d.tick===30&&!P.tick30AppliedAt)P.tick30AppliedAt=at;
    });
  document.addEventListener('webglcontextlost',()=>{P.contextLost++;},true);
}
function localWebSocketOnly(){
  const NativeWebSocket=window.WebSocket;
  function LocalWebSocket(url,protocols){
    const u=new URL(String(url),location.href);
    if(!['ws:','wss:'].includes(u.protocol)||u.hostname!=='127.0.0.1')
      throw new DOMException('Local QA blocks remote WebSocket connections','SecurityError');
    return protocols===undefined?new NativeWebSocket(url):new NativeWebSocket(url,protocols);
  }
  Object.setPrototypeOf(LocalWebSocket,NativeWebSocket);
  LocalWebSocket.prototype=NativeWebSocket.prototype;
  window.WebSocket=LocalWebSocket;
}
async function makeClient(account){
  const context=await browser.newContext({viewport:{width:412,height:900},deviceScaleFactor:1,
    hasTouch:true,isMobile:true,colorScheme:'dark',serviceWorkers:'block'});
  await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(['http:','https:'].includes(u.protocol)&&u.hostname!=='127.0.0.1'){
      report.remoteBlocked.push({client:account.label,origin:u.origin,kind:'http'});return route.abort();
    }
    return route.continue();
  });
  /* Playwright's WebSocket routing can hold the browser upgrade open with no
     network request on this local Worker. Guard construction in-page so the
     native browser transport reaches the actual Worker unmodified. */
  await context.addInitScript(localWebSocketOnly);
  await context.addInitScript(probeInit,{endpoint:worker.origin});
  const page=await context.newPage();pages.push({account,page,context});
  page.on('pageerror',e=>report.errors.push(account.label+' pageerror '+String(e.message).slice(0,240)));
  page.on('crash',()=>report.errors.push(account.label+' page crashed'));
  page.on('console',m=>{if(m.type()==='error'&&report.errors.length<50)report.errors.push(account.label+' console '+m.text().slice(0,240));});
  page.on('websocket',ws=>{
    if(new URL(ws.url()).hostname!=='127.0.0.1')report.errors.push(account.label+' nonlocal websocket observed');
    ws.on('framesent',e=>wireFrame(account.label,'sent',e.payload));
    ws.on('framereceived',e=>wireFrame(account.label,'received',e.payload));
    ws.on('close',()=>{report.wire[account.label].socketClosedAt=now();});
  });
  await page.goto(game.href,{waitUntil:'domcontentloaded',timeout:120000});
  report.clients[account.label]={gpu:await assertHardwareGpu(page)};
  await page.waitForFunction(()=>typeof MFSocialUI!=='undefined'&&typeof apOpen==='function',null,{timeout:120000});
  await page.evaluate(()=>{
    const snapshot=MF_SH_snapshot;
    MF_SH_snapshot=function(){
      const bytes=snapshot();
      if(!window.__mfBootStateBytes)window.__mfBootStateBytes=bytes.slice();
      return bytes;
    };
  });
  const intro=page.locator('#mfIntroStart');if(await intro.isVisible().catch(()=>false))await intro.click({timeout:12000});
  await page.waitForTimeout(1000);
  const overlay=page.locator('#apOverlay');if(!await overlay.isVisible().catch(()=>false))await page.evaluate(()=>apOpen(null));
  await page.locator('#apBody .apTab[data-tab="register"]').click({timeout:15000});
  await page.locator('#apEmail').fill(account.email);await page.locator('#apPass').fill(password);
  await page.locator('#apPass2').fill(password);await page.locator('#apUser').fill(account.username);
  await page.locator('#apDobM').selectOption('0');await page.locator('#apDobY').selectOption('1990');
  await page.locator('#apSubmitBtn').click({timeout:15000});
  await page.waitForFunction(()=>window.MFSocial&&MFSocial.signedIn(),null,{timeout:30000});
  account.token=await page.evaluate(()=>{const raw=localStorage.getItem('massfront_authp_session_v1');return raw&&JSON.parse(raw).token||'';});
  assert(account.token,'Registration did not leave a verified local session');
  const me=await fetch(worker.origin+'/me',{headers:{authorization:'Bearer '+account.token},signal:AbortSignal.timeout(5000)});
  const identity=await me.json();assert(me.status===200&&identity.user?.email===account.email&&identity.user?.username===account.username,
    'QA identity mismatch after registration');
  await page.waitForTimeout(500);
  const noBackup=page.locator('#apConfirmOverlay').getByRole('button',{name:'NOT NOW'});
  if(await noBackup.isVisible().catch(()=>false))await noBackup.click({timeout:10000});
  await page.evaluate(()=>MFSocialUI.open('lobby'));
  await page.waitForFunction(()=>window.MFSocialUI?.state?.caps?.lobbies===true,null,{timeout:30000});
  step('registered '+account.label);return page;
}
async function button(page,name){
  await page.locator('#socialPaneLobby').getByRole('button',{name,exact:true}).click({timeout:remaining(15000)});
  await page.waitForFunction(()=>!MFSocialUI.state.lobbyBusy,null,{timeout:remaining(20000)});
}
async function refresh(page){await button(page,'REFRESH');}
async function summary(page){return page.evaluate(()=>{
  const R=window.MFMatchRuntime?.status?.()||null,L=window.MFSocialUI?.state?.lobby||null,C=window.MFMatchCommandConsumer;
  const stateBytes=window.__mfBootStateBytes;let stateB64=null;
  if(stateBytes){let binary='';for(let i=0;i<stateBytes.length;i+=8192)binary+=String.fromCharCode(...stateBytes.subarray(i,i+8192));stateB64=btoa(binary);}
  return {stateB64,match:R?{state:R.state,seat:R.seat,tick:R.tick,started:R.started,ended:R.ended,generation:R.generation}:null,
    lobby:L?{rules:L.rules,members:Array.isArray(L.members)?L.members.map(m=>({ready:m.ready,compatible:m.compatible})):[]}:null,
    sim:{running:typeof running==='boolean'?running:null,matchLive:typeof matchLive==='boolean'?matchLive:null,
      tick:typeof mfDetTick==='number'?mfDetTick:null,consumerTick:C?.lastAppliedTick?.()??null,
      map:typeof curMap==='string'?curMap:null,preset:typeof battlefieldPreset==='string'?battlefieldPreset:null},
    probe:window.__mfBootProbe||null,perf:typeof mfPerfSnapshot==='function'?mfPerfSnapshot():null,
    visibleScreens:[...document.querySelectorAll('.screen')].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.id)};
});}
async function screenshot(page,label){
  const path=join(outDir,`${label}.png`);
  try{await bounded(page.screenshot({path,timeout:4500}),5000,label+' screenshot');report.screenshots[label]=path;}
  catch(e){report.screenshots[label]=null;report.errors.push(label+' screenshot '+String(e.message).slice(0,200));}
}
async function cleanup(account){
  if(!account.token){report.cleanup.push({client:account.label,deleted:false,reason:'no verified session'});return;}
  try{
    const headers={authorization:'Bearer '+account.token},r=await fetch(worker.origin+'/me',{headers,signal:AbortSignal.timeout(5000)});
    const me=await r.json();assert(r.status===200&&me.user?.email===account.email&&me.user?.username===account.username,
      'cleanup identity mismatch');
    const deleted=await fetch(worker.origin+'/account/delete',{method:'POST',headers:{...headers,'content-type':'application/json'},
      body:'{}',signal:AbortSignal.timeout(5000)});
    report.cleanup.push({client:account.label,deleted:deleted.status===200,status:deleted.status});
  }catch(e){report.cleanup.push({client:account.label,deleted:false,reason:String(e.message).slice(0,160)});}
  finally{account.token=null;}
}
function classify(){
  const A=report.clients.A?.final?.probe?.tick0,B=report.clients.B?.final?.probe?.tick0,
    W1=report.wire.A,W2=report.wire.B,
    h1=W1.sentHashes.find(x=>x.tick===30),h2=W2.sentHashes.find(x=>x.tick===30),
    agreement=[W1,W2].every(w=>w.agreements.some(x=>x.tick===30)),
    divergence=[W1,W2].some(w=>w.divergences.some(x=>x.tick===30)),
    hashReject=[W1,W2].some(w=>w.rejects.some(x=>x.code==='invalid_state_hash')),
    lag=[h1,h2].some(h=>h&&h.tickLag>128),
    packetsEqual=Array.from({length:30},(_,i)=>i+1).every(t=>W1.tickPackets[t]?.sha256&&
      W1.tickPackets[t].sha256===W2.tickPackets[t]?.sha256),
    tick0Equal=!!(A?.ok&&B?.ok&&A.hash===B.hash),tick0Mismatch=!!(A?.ok&&B?.ok&&A.hash!==B.hash),
    tick30Mismatch=!!(h1&&h2&&h1.hash!==h2.hash);
  const facts={tick0A:A?.hash||null,tick0B:B?.hash||null,tick0Equal,tick0Mismatch,
    tick0Reasons:[A?.reason||null,B?.reason||null],tick30A:h1?.hash||null,tick30B:h2?.hash||null,
    tick30Mismatch,packetsEqual,agreement,divergence,hashReject,lag,
    lagAtHash:[h1?.tickLag??null,h2?.tickLag??null],serverHeads:[W1.inboundTickHead,W2.inboundTickHead]};
  let status='INCOMPLETE';
  if(tick0Mismatch)status='SETUP_DIVERGENCE';
  else if(tick0Equal&&packetsEqual&&(tick30Mismatch||divergence))status=lag?'SIM_DIVERGENCE_WITH_LAG':'SIM_DIVERGENCE';
  else if(lag)status=tick30Mismatch?'LAG_WITH_UNLOCALIZED_HASH_MISMATCH':'LAG';
  else if(hashReject)status='HASH_REJECT_UNRESOLVED';
  else if(agreement&&tick0Equal&&packetsEqual&&report.errors.every(e=>!e.includes('pageerror')&&!e.includes('page crashed')))
    status='PASS_FIRST_HASH';
  else if(divergence||tick30Mismatch)status='DIVERGENCE_UNLOCALIZED';
  else if(report.fatal&&/no hardware WebGL2|SwiftShader|NO-WEBGL2/.test(report.fatal))status='GPU_INCONCLUSIVE';
  else if(report.fatal&&(!prepareAt||!W1.inboundTickCount&&!W2.inboundTickCount))status='PROBE_FAILURE';
  else if(!A?.ok||!B?.ok)status='TICK0_UNOBSERVED';
  return {status,facts};
}

try{
  guard=await acquireVerificationFreeze({root,label:'local multiplayer boot browser diagnostic',quietMs:5000,
    allowedPaths:[resolve(root,'tmp'),resolve(root,'.tmp'),resolve(root,'audit')]});
  await mkdir(outDir,{recursive:true});await preflight();step('local packed preflight passed');
  browser=await launchPwBrowser({ownershipMode:'isolated',extraArgs:[
    '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
  const A=await makeClient(accounts[0]),B=await makeClient(accounts[1]);
  await A.locator('#socialPaneLobby').getByLabel('Lobby mode').selectOption('skirmish');
  await A.locator('#socialPaneLobby').getByRole('button',{name:'CREATE LOBBY'}).click({timeout:15000});
  await A.waitForFunction(()=>!!MFSocialUI.state.lobby,null,{timeout:20000});
  const code=await A.evaluate(()=>MFSocialUI.state.lobby?.code||'');assert(code,'Host did not create lobby');
  await B.locator('#socialPaneLobby input[aria-label="Lobby code"]').fill(code);await button(B,'JOIN');
  await refresh(A);await button(A,'READY');await refresh(B);await button(B,'READY');
  await refresh(A);await button(A,'VERIFY THIS BUILD');
  await refresh(B);await button(B,'VERIFY THIS BUILD');await refresh(A);
  const roster=await A.evaluate(()=>MFSocialUI.state.lobby?.members?.map(m=>({ready:m.ready,compatible:m.compatible}))||[]);
  assert(roster.length===2&&roster.every(m=>m.ready&&m.compatible),'Server roster not fully ready and compatible');
  prepareAt=Date.now();deadlineAt=prepareAt+60000;report.prepareRequestedAt=now();
  await button(A,'PREPARE MATCH');step('host prepared match');
  /* The runtime's WebSocket frames are observed independently of a saturated
     page main thread. Do not force a menu hide or call simulation helpers here. */
  while(Date.now()<deadlineAt-10500){
    const W1=report.wire.A,W2=report.wire.B;
    const firstHashDone=[W1,W2].every(w=>w.agreements.some(x=>x.tick===30)||w.divergences.some(x=>x.tick===30));
    const bothRejected=[W1,W2].every(w=>w.sentHashes.some(x=>x.tick===30)&&w.rejects.some(x=>x.code==='invalid_state_hash'));
    const terminal=[W1,W2].some(w=>w.frames.some(x=>x.type==='matchEnd'));
    if(firstHashDone||bothRejected||terminal)break;
    await delay(200);
  }
  report.captureAt=now();
  await Promise.all(pages.map(async({page,account})=>{
    try{report.clients[account.label].final=await bounded(summary(page),3000,account.label+' state');}
    catch(e){report.clients[account.label].final={error:String(e.message)};}
  }));
  await Promise.all(pages.map(({page,account})=>screenshot(page,account.label+'-battlefield')));
}catch(e){
  report.fatal=String(e?.stack||e);report.errors.push('probe '+String(e?.message||e).slice(0,240));
  if(prepareAt&&Date.now()<deadlineAt-8000){
    await Promise.all(pages.map(async({page,account})=>{
      try{report.clients[account.label]??={};report.clients[account.label].final=await bounded(summary(page),2500,account.label+' failure state');}
      catch(error){report.clients[account.label].final={error:String(error.message)};}
    }));
    if(Date.now()<deadlineAt-5000)await Promise.all(pages.map(({page,account})=>screenshot(page,account.label+'-failure')));
  }
}finally{
  report.captureFinishedAt=now();report.captureElapsedMs=prepareAt?Date.now()-prepareAt:null;
  report.classification=classify();
  for(const account of accounts)await cleanup(account);
  for(const {context} of pages)try{await bounded(context.close(),5000,'context close');}catch(e){report.errors.push(String(e.message));}
  if(browser)try{await bounded(closePwBrowser(browser),6000,'browser close');}catch(e){report.errors.push(String(e.message));}
  try{
    for(const path of Object.keys(report.sourcePack)){
      const after=sha(await readFile(resolve(root,'www',path)));
      if(after!==report.sourcePack[path].packed)throw new Error('Packed input changed: '+path);
    }
    if(guard){report.freeze=await guard.checkpoint('local multiplayer boot capture complete');
      await guard.release({assertStable:true});guard=null;}
  }catch(e){report.inputStabilityFailure=String(e.message);report.classification.status='EVIDENCE_INVALID';}
  if(guard)try{await guard.release();}catch(e){report.errors.push('freeze release '+String(e.message));}
  report.finishedAt=now();
  report.cleanupComplete=report.cleanup.every(x=>x.deleted===true);
  if(!report.cleanupComplete&&report.classification.status==='PASS_FIRST_HASH')report.classification.status='EVIDENCE_INCOMPLETE';
  report.limitations.push('The Worker relays packets but does not own or reconstruct the complete game world.');
  report.limitations.push('Tick-zero capture is opportunistic until a server-side bootstrap-ready barrier exists; a missed window is inconclusive.');
  report.limitations.push('First hash agreement is not a long-match, rewards, reconnect, or Apple-device acceptance result.');
  await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:report.classification.status,elapsedMs:report.captureElapsedMs,
    cleanupComplete:report.cleanupComplete,evidence:out}));
  if(report.classification.status!=='PASS_FIRST_HASH'||!report.cleanupComplete)process.exitCode=1;
}
