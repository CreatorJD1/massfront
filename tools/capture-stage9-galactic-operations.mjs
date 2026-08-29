#!/usr/bin/env node
/* Stage 9 Galactic-operation evidence producer.

   This capture follows one real same-tab player route from the default-off
   base Settings screen to NEXUS-VII, through a UGA Pale Bloom deployment, into
   the production RTS and back to the exactly-once debrief archive. The only
   synthetic step is a documented deterministic campaign precondition; the
   launch, deployment, match, return, result consumption and acknowledgement
   all use their player-facing controls.

   This script produces machine evidence and reviewable PNGs. It never grants
   visual approval; every image remains PENDING_HUMAN_REVIEW.

   Usage:
     node tools/capture-stage9-galactic-operations.mjs [run-id]

   Output:
     .tmp/<run-id>/report.json
     .tmp/<run-id>/*.png
*/
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPwBrowserOwnership,
  closePwBrowser,
  launchPwBrowser,
  pwBrowserEvidence,
  recordPwBrowserGpu
} from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { installOfflineNetworkIsolation } from './offline-network-isolation.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';
import {
  readRepositoryFingerprint,
  readRuntimeFingerprint
} from './interface-audit/verify-interface-matrix.mjs';
import {
  buildReachability,
  expectedAllowlistPaths,
  fileRecords,
  fingerprintRecords,
  walkFiles
} from '../modules/space_exploration/tools/readiness/readiness-core.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const moduleRoot=join(root,'modules','space_exploration');
const args=process.argv.slice(2);
if(args.includes('--help')||args.includes('-h')){
  console.log('Usage: node tools/capture-stage9-galactic-operations.mjs [run-id]\n'
    +'       node tools/capture-stage9-galactic-operations.mjs --self-test');
  process.exit(0);
}
const selfTestMode=args.includes('--self-test');
if(selfTestMode&&args.length!==1)throw new Error('--self-test cannot be combined with a run-id');
if(!selfTestMode&&args.length>1)throw new Error('Expected at most one run-id argument');
const DEFAULT_RUN_ID='stage9-galactic-operations';
const explicitRunId=!selfTestMode&&args.length===1;
const runId=explicitRunId?args[0]:DEFAULT_RUN_ID;
if(!/^[a-z0-9][a-z0-9._-]{0,95}$/i.test(runId))throw new Error('Invalid run-id');
const tmpRoot=resolve(root,'.tmp');
const outDir=join(tmpRoot,runId);
const outputLockPath=join(tmpRoot,'.stage9-galactic-operations.lock');
const remoteAttachmentDir=resolve(moduleRoot,'.codex-remote-attachments');

const VIEWPORT={width:412,height:915,dpr:2};
const PHONE_UA='Mozilla/5.0 (Linux; Android 15; SM-S938U Build/AP3A.240905.015.A2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.260 Mobile Safari/537.36';
const ENTRY_KEY='massfront.galactic.entry.v1';
const REQUEST_PREFIX='massfront.galactic.request.v1.';
const RESULT_PREFIX='massfront.galactic.result.v1.';
const PROXY_MAP={nova:'nova',dominion:'legion',syndicate:'syndicate'};
const COMMANDER_MAP={nova:'nova_kai',dominion:'legion_vex',syndicate:'syndicate_renn'};
const DEPLOY_UNIT_EXPECTATIONS={
  recon_team:{type:'Striker',perGroup:1},line_section:{type:'Striker',perGroup:2},
  support_vehicle:{type:'Warden',perGroup:1},armored_element:{type:'Rhino',perGroup:1}
};
const DEPLOY_STRUCTURE_EXPECTATIONS={
  field_relay:'uplink',resource_processor:'pgen',
  defensive_emplacement:'turret',forward_command:'fac'
};
const DOCTRINE_SCORE_DELTA={containment:8,methodical:7,rapid:2};
const SUPPORT_SCORE_DELTA={survey_drones:4,field_lab:2,medevac:1,heavy_lift:5};
const EXPECTED_CAPTURE_KEYS=[
  '01-base-settings-default-off',
  '02-base-settings-opted-in',
  '03-module-starchart',
  '04-uga-pale-bloom-contract',
  '05-uga-pale-bloom-loadout',
  '06-base-pale-bloom-deployment',
  '07-base-pale-bloom-live-match',
  '08-base-pale-bloom-terminal-return',
  '09-module-pale-bloom-debrief',
  '10-module-debrief-archive',
  '11-module-debrief-archive-reloaded'
];
const MIME={
  '.basis':'application/octet-stream','.bin':'application/octet-stream',
  '.css':'text/css; charset=utf-8','.glb':'model/gltf-binary',
  '.gltf':'model/gltf+json','.html':'text/html; charset=utf-8',
  '.jpeg':'image/jpeg','.jpg':'image/jpeg','.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.ktx2':'image/ktx2',
  '.m4a':'audio/mp4','.mjs':'text/javascript; charset=utf-8',
  '.mp3':'audio/mpeg','.ogg':'audio/ogg','.png':'image/png',
  '.svg':'image/svg+xml','.wasm':'application/wasm',
  '.webmanifest':'application/manifest+json','.webp':'image/webp',
  '.woff2':'font/woff2'
};

function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
function pngInfo(bytes){
  if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')
    throw new Error('Screenshot is not a PNG');
  return {sha256:sha256(bytes),bytes:bytes.length,width:bytes.readUInt32BE(16),
    height:bytes.readUInt32BE(20),mime:'image/png'};
}
function inside(base,target){
  const rel=relative(base,target);
  return rel===''||(!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel));
}
const SHA40_OR_64=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const SHA256=/^[0-9a-f]{64}$/i;
function requireSourceIdentity(value,label){
  if(!value||!SHA40_OR_64.test(value.head||'')||!SHA256.test(value.dirtyFingerprint||'')
    ||value.dirtyFingerprint==='UNKNOWN')
    throw new Error('INVALID_'+label.toUpperCase()+'_SOURCE_IDENTITY: '+JSON.stringify(value));
}
function requireRuntimeIdentity(value,label){
  if(!value||!SHA256.test(value.fingerprint||'')||!Array.isArray(value.missingFiles)
    ||value.missingFiles.length)
    throw new Error('INVALID_'+label.toUpperCase()+'_RUNTIME_IDENTITY: '+JSON.stringify(value));
}
function requireModuleRuntimeIdentity(value,label){
  if(!value||!SHA256.test(value.runtimeFingerprint||'')||!SHA256.test(value.inputFingerprint||'')
    ||!Array.isArray(value.missingExpectedPaths)||value.missingExpectedPaths.length)
    throw new Error('INVALID_'+label.toUpperCase()+'_MODULE_RUNTIME_IDENTITY: '+JSON.stringify(value));
}
function sameSource(a,b){return !!a&&!!b&&a.head===b.head&&a.dirtyFingerprint===b.dirtyFingerprint;}
function sameRuntime(a,b){return !!a&&!!b&&a.fingerprint===b.fingerprint;}
function sameModuleRuntime(a,b){
  return !!a&&!!b&&a.runtimeFingerprint===b.runtimeFingerprint
    &&a.inputFingerprint===b.inputFingerprint;
}
function assertion(report,scope,name,ok,detail){
  report.assertions.push({scope,name,ok:!!ok,detail:detail==null?'':detail});
  if(!ok)throw new Error('ASSERTION_FAILED ['+scope+'] '+name+': '+JSON.stringify(detail));
}

function expectedDeploymentPackage(operation){
  const unitTypes={},structureTypes={};
  let units=0,structures=0,groupsLeft=4,structuresLeft=2;
  for(const entry of operation?.deploymentManifest?.units||[]){
    const spec=DEPLOY_UNIT_EXPECTATIONS[entry.id];
    if(!spec)throw new Error('Unknown Stage 9 deployment unit '+entry.id);
    const groups=Math.min(Math.max(0,Number(entry.count)||0),groupsLeft);
    groupsLeft-=groups;
    const count=groups*spec.perGroup;units+=count;
    unitTypes[spec.type]=(unitTypes[spec.type]||0)+count;
  }
  for(const entry of operation?.deploymentManifest?.structures||[]){
    const type=DEPLOY_STRUCTURE_EXPECTATIONS[entry.id];
    if(!type)throw new Error('Unknown Stage 9 deployment structure '+entry.id);
    const count=Math.min(Math.max(0,Number(entry.count)||0),structuresLeft);
    structuresLeft-=count;structures+=count;
    structureTypes[type]=(structureTypes[type]||0)+count;
  }
  return {units,structures,unitTypes,structureTypes};
}

function expectedOperationEffects(operation){
  const doctrineId=operation?.doctrineId,supportId=operation?.supportId;
  const modIds=operation?.deploymentManifest?.modIds||[];
  const matchApplied=[];
  if(modIds.includes('survey_link'))matchApplied.push({layer:'match',source:'mod',id:'survey_link',
    effect:'deployment-scan',seconds:24,radius:15});
  if(modIds.includes('repair_nanites'))matchApplied.push({layer:'match',source:'mod',id:'repair_nanites',
    effect:'starting-unit-repair-reserve',reserveMaxHpPct:20,repairMaxHpPctPerSecond:1});
  const scoreApplied=[
    {layer:'score',source:'doctrine',id:doctrineId,effect:'tactical-score',
      delta:DOCTRINE_SCORE_DELTA[doctrineId]||0},
    {layer:'score',source:'support',id:supportId,effect:'tactical-score',
      delta:SUPPORT_SCORE_DELTA[supportId]||0}
  ];
  const moduleResultApplied=modIds.includes('medical_cache')
    ?[{layer:'module-result',source:'mod',id:'medical_cache',effect:'injury-severity-minus-one'}]:[];
  return {matchApplied,scoreApplied,moduleResultApplied,
    tacticalScoreDelta:scoreApplied.reduce((sum,item)=>sum+item.delta,0)};
}

function expectedVictoryScore(stats,effectDelta){
  let score=68+Math.min(16,Math.max(0,Math.floor(Number(stats.nests)||0))*4)
    +Math.min(12,Math.floor(Math.max(0,Math.floor(Number(stats.kills)||0))/6))
    -Math.min(24,Math.floor(Math.max(0,Math.floor(Number(stats.losses)||0))/4))
    -Math.min(8,Math.floor(Math.max(0,Math.floor(Number(stats.elapsed)||0))/300))
    +(Number(effectDelta)||0);
  score=Math.max(0,Math.min(100,Math.round(score)));
  return Math.max(51,score);
}

function effectListMatches(actual,expected){
  return Array.isArray(actual)&&actual.length===expected.length&&expected.every((item,index)=>
    Object.entries(item).every(([key,value])=>actual[index]?.[key]===value));
}

async function prepareOutput(){
  if(!inside(tmpRoot,outDir)||relative(tmpRoot,outDir).split(sep).length!==1)
    throw new Error('Refused output outside direct .tmp child: '+outDir);
  const entries=existsSync(outDir)?await readdir(outDir):[];
  if(entries.length){
    if(explicitRunId)throw new Error('Explicit output directory is not empty: '+outDir);
    if(resolve(outDir).toLowerCase()!==resolve(tmpRoot,DEFAULT_RUN_ID).toLowerCase())
      throw new Error('Refused replacement of non-default output: '+outDir);
    await rm(outDir,{recursive:true,force:true});
  }
  await mkdir(outDir,{recursive:true});
  return {replaced:entries.length>0,mode:explicitRunId?'retained-explicit':'bounded-default'};
}

function processAlive(pid){
  if(!Number.isInteger(pid)||pid<=0)return false;
  try{process.kill(pid,0);return true;}
  catch(error){return error?.code==='EPERM';}
}
async function acquireOutputLease(){
  await mkdir(tmpRoot,{recursive:true});
  const token=randomUUID(),host=hostname();
  for(let attempt=0;attempt<2;attempt++){
    let handle=null,created=false;
    try{
      handle=await open(outputLockPath,'wx');created=true;
      await handle.writeFile(JSON.stringify({schema:1,token,pid:process.pid,host,
        runId,startedAt:new Date().toISOString()},null,2)+'\n','utf8');
      await handle.close();handle=null;
      const checkpoint=async()=>{
        let held;
        try{held=JSON.parse(await readFile(outputLockPath,'utf8'));}
        catch(error){throw new Error('OUTPUT_LEASE_LOST: '+outputLockPath+' '+String(error?.message||error));}
        if(held.token!==token)throw new Error('OUTPUT_LEASE_LOST: '+outputLockPath);
        return held;
      };
      return {checkpoint,async release(){await checkpoint();await unlink(outputLockPath);}};
    }catch(error){
      if(handle)await handle.close().catch(()=>{});
      if(created){
        try{await unlink(outputLockPath);}
        catch(cleanupError){if(cleanupError?.code!=='ENOENT')throw cleanupError;}
        throw error;
      }
      if(error?.code!=='EEXIST')throw error;
      let raw,held;
      try{raw=await readFile(outputLockPath,'utf8');held=JSON.parse(raw);}catch{
        throw new Error('OUTPUT_LEASE_HELD: unreadable '+outputLockPath);
      }
      if(held.host!==host||processAlive(Number(held.pid)))
        throw new Error('OUTPUT_LEASE_HELD: '+outputLockPath+' by '+held.host+' pid '+held.pid);
      const current=await readFile(outputLockPath,'utf8');
      if(current!==raw)throw new Error('OUTPUT_LEASE_REPLACED: '+outputLockPath);
      await unlink(outputLockPath);
    }
  }
  throw new Error('OUTPUT_LEASE_ACQUIRE_FAILED: '+outputLockPath);
}

async function startServer(report){
  const server=createServer(async(req,res)=>{
    const started=Date.now();
    try{
      const parsed=new URL(req.url||'/','http://127.0.0.1');
      const pathname=decodeURIComponent(parsed.pathname);
      const requested=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
      const file=resolve(root,requested);
      if(!inside(root,file)||!existsSync(file))throw new Error('not found');
      const bytes=await readFile(file);
      res.writeHead(200,{'Cache-Control':'no-store, no-cache, must-revalidate',
        'Pragma':'no-cache','Expires':'0',
        'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream'});
      if(req.method==='HEAD')res.end();else res.end(bytes);
      report.server.requests.push({method:req.method||'GET',path:pathname,status:200,
        bytes:req.method==='HEAD'?0:bytes.length,elapsedMs:Date.now()-started});
    }catch{
      res.writeHead(404,{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'});
      res.end('Not found');
      report.server.requests.push({method:req.method||'GET',path:String(req.url||'/').split('?',1)[0],
        status:404,bytes:9,elapsedMs:Date.now()-started});
    }
  });
  await new Promise((accept,reject)=>{
    server.once('error',reject);server.listen(0,'127.0.0.1',accept);
  });
  return {server,url:'http://127.0.0.1:'+server.address().port+'/'};
}

async function readModuleRuntimeIdentity(){
  const files=await walkFiles(moduleRoot,{excluded:path=>path==='tmp'||path.startsWith('tmp/')
    ||path==='.codex-remote-attachments'||path.startsWith('.codex-remote-attachments/')});
  /* Reachability and allowlist discovery need only the path inventory. Hashing
     preserved Blender/source payloads would turn a runtime identity gate into
     a multi-gigabyte authoring audit. Hash only the explicit reachable runtime
     subset after the readiness-core functions have derived it. */
  const pathRecords=files.map(absolute=>({path:relative(moduleRoot,absolute).split(sep).join('/')}));
  const reachability=await buildReachability(moduleRoot,pathRecords);
  const expectedPaths=expectedAllowlistPaths(pathRecords,{reachableCode:reachability.reachableCode});
  const byPath=new Map(pathRecords.map(record=>[record.path,record]));
  const missingExpectedPaths=expectedPaths.filter(path=>!byPath.has(path));
  const runtimeFiles=expectedPaths.filter(path=>byPath.has(path))
    .map(path=>resolve(moduleRoot,...path.split('/')));
  const runtimeRecords=await fileRecords(moduleRoot,runtimeFiles);
  const runtimeFingerprint=fingerprintRecords(runtimeRecords);
  return {
    kind:'massfront-space-exploration-runtime/v1',
    inputFingerprint:runtimeFingerprint,
    runtimeFingerprint,
    moduleFileCount:pathRecords.length,
    runtimeFileCount:runtimeRecords.length,
    expectedPathCount:expectedPaths.length,
    missingExpectedPaths,
    reachableCodeCount:reachability.reachableCode.length,
    reachableAssetCount:reachability.reachableAssets.length,
    expectedPaths,
    reachableCode:reachability.reachableCode,
    reachableAssets:reachability.reachableAssets
  };
}

function baseCareerRecord(records){
  const normalized=[...records].sort((a,b)=>a.key.localeCompare(b.key));
  const payload=normalized.map(item=>item.key+'\0'+String(item.value)).join('\n');
  return {
    records:normalized.map(item=>({key:item.key,present:item.value!==null,
      bytes:item.value===null?0:Buffer.byteLength(item.value),sha256:item.value===null?null:sha256(item.value)})),
    bytes:Buffer.byteLength(payload),sha256:sha256(payload),raw:normalized
  };
}

async function capture(page,report,key,description,telemetry={}){
  const file=key+'.png';
  await page.waitForTimeout(350);
  const bytes=await page.screenshot({path:join(outDir,file),fullPage:false,animations:'disabled',timeout:120_000});
  const info=pngInfo(bytes);
  assertion(report,key,'phone portrait screenshot dimensions',
    info.width===VIEWPORT.width*VIEWPORT.dpr&&info.height===VIEWPORT.height*VIEWPORT.dpr,
    {expected:{width:VIEWPORT.width*VIEWPORT.dpr,height:VIEWPORT.height*VIEWPORT.dpr},actual:info});
  const item={key,description,viewport:{...VIEWPORT},url:page.url(),telemetry,
    artifact:{file,...info},visualVerdict:'PENDING_HUMAN_REVIEW'};
  report.captures.push(item);
  return item;
}

async function dismissBaseEntry(page){
  await page.waitForFunction(()=>typeof META!=='undefined'&&typeof bootConfirmed!=='undefined'
    &&document.getElementById('settingsBtn'),null,{timeout:180_000});
  await page.waitForFunction(()=>!document.getElementById('mfBootCover')
    ||document.getElementById('mfIntroSkip'),null,{timeout:180_000});
  const bootSkip=page.locator('#mfIntroSkip');
  if(await bootSkip.isVisible().catch(()=>false)){
    await bootSkip.tap({timeout:30_000});
    await page.waitForFunction(()=>!document.getElementById('mfBootCover'),null,{timeout:30_000});
  }
  await page.waitForFunction(()=>{
    const visible=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
    return visible(document.getElementById('mfIntroStart'))||visible(document.getElementById('settingsBtn'))
      ||visible(document.getElementById('apCloseBtn'));
  },null,{timeout:90_000});
  const intro=page.locator('#mfIntroStart');
  if(await intro.isVisible().catch(()=>false)){
    try{await intro.tap({timeout:15_000});}catch(error){
      if(await intro.isVisible().catch(()=>false))throw error;
    }
    await page.waitForTimeout(500);
  }
  const accountClose=page.locator('#apCloseBtn');
  if(await accountClose.isVisible().catch(()=>false)){
    await accountClose.tap({timeout:15_000});await page.waitForTimeout(500);
  }
  await page.locator('#settingsBtn').waitFor({state:'visible',timeout:30_000});
}

async function waitForModuleReady(page){
  await page.waitForFunction(()=>window.__MASSFRONT_SPACE__&&window.__MASSFRONT_SPACE_HOST__
    &&window.__MASSFRONT_SPACE__.ready,null,{timeout:180_000});
  await page.evaluate(async()=>{await window.__MASSFRONT_SPACE__.ready;});
  await page.waitForFunction(()=>window.__MASSFRONT_SPACE__?.scene
    &&document.getElementById('renderVeil')?.classList.contains('ready'),null,{timeout:180_000});
  return page.evaluate(()=>({
    hostKind:window.__MASSFRONT_SPACE_HOST__?.kind||null,
    productionIntegrated:window.__MASSFRONT_SPACE_HOST__?.productionIntegrated===true,
    accountId:window.__MASSFRONT_SPACE_HOST__?.accountId||null,
    key:window.__MASSFRONT_SPACE_HOST__?.key||null,
    profileKey:window.__MASSFRONT_SPACE_HOST__?.profileKey||null,
    namespace:window.__MASSFRONT_SPACE_HOST__?.namespace||null,
    scene:window.__MASSFRONT_SPACE__?.scene||null,
    error:window.__MASSFRONT_SPACE_ERROR__?String(window.__MASSFRONT_SPACE_ERROR__.message||window.__MASSFRONT_SPACE_ERROR__):null
  }));
}

async function seedIntegratedShowcase(page){
  return page.evaluate(async()=>{
    const host=window.__MASSFRONT_SPACE_HOST__;
    if(!host||host.productionIntegrated!==true)throw new Error('Integrated MASSFRONT host is not active');
    const domain=await import('./src/domain/state_store.js');
    const state=domain.createShowcaseReadyDomainState();
    state.profileId=host.accountId;
    const before={history:state.operations?.history?.length||0,pending:state.operations?.pending||null,
      missionCompletions:state.missions?.uga_pale_bloom?.completions||0};
    host.saveCampaignSnapshot(state);
    const restored=host.loadCampaignSnapshot();
    if(!restored||restored.profileId!==host.accountId)throw new Error('Seeded campaign failed profile readback');
    return {precondition:'createShowcaseReadyDomainState',profileId:restored.profileId,
      key:host.key,profileKey:host.profileKey,namespace:host.namespace,before,
      after:{history:restored.operations?.history?.length||0,pending:restored.operations?.pending||null,
        missionCompletions:restored.missions?.uga_pale_bloom?.completions||0}};
  });
}

async function operationState(page){
  return page.evaluate(()=>{
    const host=window.__MASSFRONT_SPACE_HOST__,experience=window.__MASSFRONT_SPACE__;
    const state=experience?.getState?.();
    const pending=state?.operations?.pending||null;
    const history=state?.operations?.history||[];
    const applied=state?.operations?.appliedResultIds||[];
    const requestKeys=[],resultKeys=[];
    for(let i=0;i<sessionStorage.length;i++){
      const key=sessionStorage.key(i)||'';
      if(key.startsWith('massfront.galactic.request.v1.'))requestKeys.push(key);
      if(key.startsWith('massfront.galactic.result.v1.'))resultKeys.push(key);
    }
    return {
      profileId:state?.profileId||null,hostKind:host?.kind||null,
      productionIntegrated:host?.productionIntegrated===true,hostAccountId:host?.accountId||null,
      scene:experience?.scene||null,pending,
      historyCount:history.length,historyResultIds:history.map(entry=>entry?.result?.resultId).filter(Boolean),
      appliedResultIds:[...applied],paleBloomCompletions:state?.missions?.uga_pale_bloom?.completions||0,
      requestKeys:requestKeys.sort(),resultKeys:resultKeys.sort(),
      query:location.search,pathname:location.pathname,
      modal:document.getElementById('operationModal')?.dataset||null,
      payload:document.getElementById('operationPayload')?.dataset||null,
      error:window.__MASSFRONT_SPACE_ERROR__?String(window.__MASSFRONT_SPACE_ERROR__.message||window.__MASSFRONT_SPACE_ERROR__):null
    };
  });
}

async function runFlow(browser,report,url){
  await report.workspaceGuard.checkpoint('before Stage 9 browser flow');
  await assertPwBrowserOwnership(browser);
  const page=await browser.newPage({
    viewport:{width:VIEWPORT.width,height:VIEWPORT.height},deviceScaleFactor:VIEWPORT.dpr,
    hasTouch:true,isMobile:true,userAgent:PHONE_UA,colorScheme:'dark',serviceWorkers:'block'
  });
  const runtimeErrors=[];
  const pushError=(type,message,urlValue='')=>runtimeErrors.push({type,message:String(message||''),url:urlValue||''});
  page.on('pageerror',error=>pushError('pageerror',error.message));
  page.on('console',message=>{if(message.type()==='error')pushError('console',message.text());});
  page.on('requestfailed',request=>pushError('requestfailed',request.failure()?.errorText||'failed',request.url()));
  page.on('response',response=>{if(response.status()>=400)pushError('http','HTTP '+response.status(),response.url());});
  await page.addInitScript(()=>{
    const marker='__mfStage9CaptureInitializedV1';
    try{
      if(sessionStorage.getItem(marker)!=='1'){
        localStorage.clear();sessionStorage.clear();sessionStorage.setItem(marker,'1');
      }
      /* installOfflineNetworkIsolation installs its own authoritative bootstrap
         proof, but init-script order is intentionally unspecified. Reassert
         the two storage flags here so a first-document clear cannot race it. */
      localStorage.setItem('mf_offline','1');localStorage.setItem('massfront_offline','1');
    }catch{}
    const bump=key=>{try{sessionStorage.setItem(key,String((Number(sessionStorage.getItem(key))||0)+1));}catch{}};
    addEventListener('webglcontextlost',()=>bump('__mfStage9ContextLosses'),true);
    addEventListener('webglcontextcreationerror',()=>bump('__mfStage9ContextCreationErrors'),true);
  });
  let offline=null,thrown=null,careerBefore=null,droppedSessionBefore=null,adStatsBefore=null;
  try{
    offline=await installOfflineNetworkIsolation(page);
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60_000});
    await dismissBaseEntry(page);
    const baseGpu=await assertHardwareGpu(page);
    report.gpu.base=baseGpu;recordPwBrowserGpu(browser,baseGpu);
    await page.locator('#settingsBtn').tap({timeout:30_000});
    await page.locator('#settingsScr').waitFor({state:'visible',timeout:30_000});
    await page.locator('#setTab-battle').tap({timeout:30_000});
    const explorationToggle=page.locator('[data-set="experimentalExploration"]');
    await explorationToggle.waitFor({state:'visible',timeout:30_000});
    await explorationToggle.scrollIntoViewIfNeeded();
    const defaultOff=await page.evaluate(()=>({
      setting:META.settings.experimentalExploration,
      toggleVisible:!!document.querySelector('[data-set="experimentalExploration"]')?.offsetParent,
      openPresent:!!document.querySelector('[data-set="openExperimentalExploration"]'),
      mainMenuEntry:!!document.querySelector('#startScreen #exploreBtn'),
      activeProfile:PROFILES.active,frontScreen:document.body.dataset.frontScreen||null
    }));
    assertion(report,'base-settings','fresh profile defaults exploration off',defaultOff.setting===false,defaultOff);
    assertion(report,'base-settings','Settings owns preview and main menu does not',
      defaultOff.toggleVisible&&!defaultOff.openPresent&&!defaultOff.mainMenuEntry,defaultOff);
    await capture(page,report,'01-base-settings-default-off',
      'Fresh local profile: Galactic Campaign preview is visibly default-off in Settings.',defaultOff);

    await explorationToggle.tap({timeout:30_000});
    await page.waitForFunction(()=>META.settings.experimentalExploration===true
      &&document.querySelector('[data-set="openExperimentalExploration"]')?.offsetParent,null,{timeout:30_000});
    const openControl=page.locator('[data-set="openExperimentalExploration"]');
    await openControl.scrollIntoViewIfNeeded();
    const optedIn=await page.evaluate(()=>({
      setting:META.settings.experimentalExploration,
      openVisible:!!document.querySelector('[data-set="openExperimentalExploration"]')?.offsetParent,
      activeProfile:PROFILES.active,metaKey:metaKey(),profilesKey:PROF_KEY,
      mainMenuEntry:!!document.querySelector('#startScreen #exploreBtn')
    }));
    assertion(report,'base-settings','real opt-in exposes Settings-only OPEN action',
      optedIn.setting===true&&optedIn.openVisible&&!optedIn.mainMenuEntry,optedIn);
    await capture(page,report,'02-base-settings-opted-in',
      'Real Settings opt-in exposes the Settings-only OPEN Galactic Campaign action.',optedIn);
    const rawCareerBefore=await page.evaluate(()=>{
      const keys=[PROF_KEY,metaKey()];
      return keys.map(key=>({key,value:localStorage.getItem(key)}));
    });
    careerBefore=baseCareerRecord(rawCareerBefore);
    report.baseCareer.before={records:careerBefore.records,bytes:careerBefore.bytes,sha256:careerBefore.sha256};
    assertion(report,'career-isolation','base career snapshot is readable after opt-in',
      careerBefore.raw.every(item=>item.value!==null),report.baseCareer.before);
    droppedSessionBefore=await page.evaluate(()=>{
      if(typeof SESS_KEY==='undefined'||SESS_KEY!=='mf_dropped_session_v1')
        throw new Error('Unexpected dropped-session key');
      const value=JSON.stringify({v:1,at:Date.now(),reason:'stage9-verifier-sentinel',
        map:'stage9-verifier',t:1,units:{tm:[0]}});
      localStorage.setItem(SESS_KEY,value);
      const restored=localStorage.getItem(SESS_KEY);
      if(restored!==value||typeof sessHas!=='function'||!sessHas())
        throw new Error('Dropped-session sentinel failed readback');
      return {key:SESS_KEY,value:restored};
    });
    report.droppedSession.before={key:droppedSessionBefore.key,
      bytes:Buffer.byteLength(droppedSessionBefore.value),sha256:sha256(droppedSessionBefore.value)};
    adStatsBefore=await page.evaluate(()=>{
      if(typeof AD_STATS_KEY==='undefined'||AD_STATS_KEY!=='massfront_ads_stats_v1')
        throw new Error('Unexpected persistent ad-statistics key');
      const value=JSON.stringify({total:7,impressions:{stage9_verifier_sentinel:7}});
      localStorage.setItem(AD_STATS_KEY,value);
      /* Keep this already-booted menu document coherent with the sentinel
         until its immediate same-tab navigation. The deep-link document then
         restores these exact bytes through adStatsLoad. */
      AD_STATS=JSON.parse(value);
      const restored=localStorage.getItem(AD_STATS_KEY);
      if(restored!==value)throw new Error('Ad-statistics sentinel failed readback');
      return {key:AD_STATS_KEY,value:restored};
    });
    report.adStats.before={key:adStatsBefore.key,bytes:Buffer.byteLength(adStatsBefore.value),
      sha256:sha256(adStatsBefore.value)};

    await Promise.all([
      page.waitForURL(/\/modules\/space_exploration\/index\.html(?:[?#].*)?$/,{timeout:60_000}),
      openControl.tap({timeout:30_000})
    ]);
    let moduleReady=await waitForModuleReady(page);
    assertion(report,'module-entry','OPEN selected the integrated profile host',
      moduleReady.productionIntegrated&&moduleReady.hostKind==='MassfrontSoloHostV1'
        &&moduleReady.accountId===optedIn.activeProfile&&!moduleReady.error,moduleReady);
    report.seed=await seedIntegratedShowcase(page);
    assertion(report,'precondition','showcase seed starts with no result or pending operation',
      report.seed.before.history===0&&!report.seed.before.pending&&report.seed.before.missionCompletions===0
        &&report.seed.after.history===0&&!report.seed.after.pending,report.seed);
    await page.reload({waitUntil:'domcontentloaded',timeout:60_000});
    moduleReady=await waitForModuleReady(page);
    assertion(report,'module-entry','seeded integrated campaign preserves base profile identity',
      moduleReady.productionIntegrated&&moduleReady.accountId===optedIn.activeProfile&&!moduleReady.error,moduleReady);
    const moduleGpu=await assertHardwareGpu(page);
    report.gpu.module=moduleGpu;
    assertion(report,'gpu','base and module use the same hardware renderer',
      JSON.stringify(baseGpu)===JSON.stringify(moduleGpu),{base:baseGpu,module:moduleGpu});

    await page.locator('#btnGalaxyMap').tap({timeout:30_000});
    await page.waitForFunction(()=>window.__MASSFRONT_SPACE__?.scene==='galaxy'
      &&document.getElementById('galaxyModal')?.getAttribute('aria-hidden')==='false',null,{timeout:30_000});
    const starchart=await page.evaluate(()=>({
      scene:window.__MASSFRONT_SPACE__.scene,selected:document.getElementById('galaxyInfoName')?.textContent,
      profileId:window.__MASSFRONT_SPACE__.getState().profileId,
      productionIntegrated:window.__MASSFRONT_SPACE_HOST__.productionIntegrated
    }));
    await capture(page,report,'03-module-starchart',
      'Source-bound integrated exploration campaign at the real Starchart.',starchart);
    await page.locator('#btnCloseGalaxy').tap({timeout:30_000});
    await page.waitForFunction(()=>window.__MASSFRONT_SPACE__?.scene==='system',null,{timeout:30_000});

    await page.locator('#btnUgaCommand').tap({timeout:30_000});
    await page.waitForFunction(()=>window.__MASSFRONT_SPACE__?.scene==='uga'
      &&document.querySelector('.uga-command-shell'),null,{timeout:60_000});
    const missionsNav=page.locator('.uga-command-nav [data-nav="missions"]');
    await missionsNav.waitFor({state:'visible',timeout:30_000});
    await missionsNav.tap({timeout:30_000});
    const paleBloom=page.locator('.uga-mission-card[data-mission="uga_pale_bloom"]');
    await paleBloom.waitFor({state:'visible',timeout:30_000});
    await paleBloom.scrollIntoViewIfNeeded();
    const contract=await paleBloom.evaluate(element=>({
      text:element.innerText,disabled:element.disabled,locked:element.classList.contains('is-locked'),
      mission:element.dataset.mission
    }));
    assertion(report,'uga-contract','Pale Bloom is the eligible UGA/Brood contract',
      contract.mission==='uga_pale_bloom'&&!contract.disabled&&!contract.locked
        &&/UGA/i.test(contract.text)&&/BROOD/i.test(contract.text),contract);
    await capture(page,report,'04-uga-pale-bloom-contract',
      'Real UGA Contracts route with Pale Bloom visibly ready for planning.',contract);

    await paleBloom.tap({timeout:30_000});
    const planner=page.locator('.uga-deployment-planner[data-mission-id="uga_pale_bloom"]');
    await planner.waitFor({state:'visible',timeout:60_000});
    await page.waitForFunction(()=>document.querySelector('.uga-deployment-planner[data-mission-id="uga_pale_bloom"] [data-deployment-confirm-state="ready"]')
      &&!document.querySelector('.uga-deployment-planner[data-mission-id="uga_pale_bloom"] [data-action="deploy"]')?.disabled,
      null,{timeout:60_000});
    const surveyLink=planner.locator('[data-deploy-mod="survey_link"]');
    const repairNanites=planner.locator('[data-deploy-mod="repair_nanites"]');
    if(!await surveyLink.isChecked())await surveyLink.check({timeout:30_000});
    if(!await repairNanites.isChecked())await repairNanites.check({timeout:30_000});
    await page.waitForFunction(()=>{
      const planner=document.querySelector('.uga-deployment-planner[data-mission-id="uga_pale_bloom"]');
      return planner?.querySelector('[data-deploy-mod="repair_nanites"]')?.checked===true
        &&planner?.querySelector('[data-deploy-mod="survey_link"]')?.checked===true
        &&planner?.querySelector('[data-deployment-confirm-state]')?.dataset.deploymentConfirmState==='ready'
        &&planner?.querySelector('[data-action="deploy"]')?.disabled===false;
    },null,{timeout:30_000});
    const loadout=await planner.evaluate(element=>({
      missionId:element.dataset.missionId,screen:element.dataset.deploymentScreen,
      state:element.dataset.deploymentState,
      faction:element.querySelector('[data-deploy="factionId"]')?.value||null,
      commander:element.querySelector('[data-deploy="commanderId"]')?.value||null,
      specialistIds:[...element.querySelectorAll('[data-specialist]')].map(select=>select.value),
      supportId:element.querySelector('[data-deploy="support"]')?.value||null,
      doctrineId:element.querySelector('[data-deploy="doctrine"]')?.value||null,
      modIds:[...element.querySelectorAll('[data-deploy-mod]:checked')].map(input=>input.dataset.deployMod),
      readiness:element.querySelector('[data-deployment-confirm-state]')?.dataset.deploymentConfirmState||null,
      slots:element.querySelector('[data-slot-usage-summary]')?.textContent?.trim()||null,
      deployLabel:element.querySelector('[data-action="deploy"]')?.textContent?.trim()||null
    }));
    assertion(report,'uga-loadout','Pale Bloom loadout is a valid solo resident-proxy team',
      ['nova','dominion','syndicate'].includes(loadout.faction)&&loadout.specialistIds.length===3
        &&new Set(loadout.specialistIds).size===3&&loadout.commander&&loadout.readiness==='ready'
        &&loadout.supportId&&loadout.doctrineId&&loadout.modIds.includes('repair_nanites')
        &&loadout.modIds.includes('survey_link')
        &&/CONFIRM & DEPLOY/.test(loadout.deployLabel),loadout);
    await capture(page,report,'05-uga-pale-bloom-loadout',
      'Real Deployment Hangar with one commander, three specialists and a ready loadout.',loadout);

    const deploy=planner.locator('[data-action="deploy"]');
    await Promise.all([
      page.waitForURL(/\/index\.html\?groundOperation=[A-Za-z0-9_-]{16,128}$/,{timeout:120_000}),
      deploy.tap({timeout:30_000})
    ]);
    await page.waitForFunction(()=>window.__MF_GALACTIC_BRIDGE,null,{timeout:180_000});
    await page.waitForFunction(()=>window.__MF_GALACTIC_BRIDGE?.status==='battle'
      &&document.getElementById('deployBtn'),null,{timeout:180_000});
    const setup=await page.evaluate(()=>{
      const bridge=window.__MF_GALACTIC_BRIDGE,operation=bridge.request?.operation;
      const active=aiSlots.filter(slot=>slot.on),allies=active.filter(slot=>slot.ally);
      const requestKeys=[],resultKeys=[];
      for(let i=0;i<sessionStorage.length;i++){
        const key=sessionStorage.key(i)||'';
        if(key.startsWith('massfront.galactic.request.v1.'))requestKeys.push(key);
        if(key.startsWith('massfront.galactic.result.v1.'))resultKeys.push(key);
      }
      return {
        bridge:{active:bridge.active,status:bridge.status,reason:bridge.reason,
          nonce:new URLSearchParams(location.search).get('groundOperation'),request:bridge.request},
        operation:{operationId:operation?.operationId,missionId:operation?.missionId,
          missionType:operation?.missionType,sponsorId:operation?.sponsorId,
          opponentFactionId:operation?.opponentFactionId,proxyFactionId:operation?.proxyFactionId,
          playerCount:operation?.playerCount,allyCount:operation?.allyCount},
        match:{activeWarMode,playerFaction,playerCommanderId,curMap,curRegionId,goalSel,
          infestationOn,difficulty,enemyFaction:AI?.fac,activeAi:active.map(slot=>({
            diff:slot.diff,ally:slot.ally,zone:slot.zone,behavior:slot.behavior})),allyAiCount:allies.length},
        deployVisible:!!document.getElementById('deployBtn')?.offsetParent,
        transient:{requestKeys:requestKeys.sort(),resultKeys:resultKeys.sort()},
        droppedSession:{key:SESS_KEY,value:localStorage.getItem(SESS_KEY),
          resumeOfferPresent:!!document.getElementById('sessResume')},
        adStats:{key:AD_STATS_KEY,value:localStorage.getItem(AD_STATS_KEY)}
      };
    });
    const expectedProxy=loadout.faction,expectedFaction=PROXY_MAP[expectedProxy],
      expectedCommander=COMMANDER_MAP[expectedProxy];
    assertion(report,'base-bridge','validated Pale Bloom request configured only the solo Brood purge',
      setup.bridge.active&&setup.bridge.status==='battle'&&setup.operation.missionId==='uga_pale_bloom'
        &&setup.operation.missionType==='uga_brood_purge'&&setup.operation.sponsorId==='uga'
        &&setup.operation.opponentFactionId==='brood'&&setup.operation.proxyFactionId===expectedProxy
        &&setup.match.activeWarMode==='galactic'&&setup.match.playerFaction===expectedFaction
        &&setup.match.playerCommanderId===expectedCommander&&setup.match.curMap==='vespera_spire_medium'
        &&setup.match.curRegionId==='vespera_spire'&&setup.match.goalSel==='purge'
        &&setup.match.infestationOn===true&&setup.match.difficulty===2
        &&setup.match.enemyFaction==='horde'&&setup.match.activeAi.length===1
        &&setup.match.activeAi[0].ally===false&&setup.match.activeAi[0].diff===2
        &&setup.match.allyAiCount===0&&setup.deployVisible
        &&setup.transient.requestKeys.length===1
        &&setup.transient.requestKeys[0]===REQUEST_PREFIX+setup.bridge.nonce
        &&setup.transient.resultKeys.length===0
        &&setup.droppedSession.key===droppedSessionBefore.key
        &&setup.droppedSession.value===droppedSessionBefore.value
        &&setup.droppedSession.resumeOfferPresent===false
        &&setup.adStats.key===adStatsBefore.key&&setup.adStats.value===adStatsBefore.value,setup);
    report.operation={nonce:setup.bridge.nonce,operationId:setup.operation.operationId,
      proxyFactionId:expectedProxy,playerFaction:expectedFaction,commanderId:expectedCommander};
    await capture(page,report,'06-base-pale-bloom-deployment',
      'Production RTS deployment screen configured from the validated Pale Bloom request.',setup);

    await page.locator('#deployBtn').tap({timeout:30_000});
    await page.waitForFunction(()=>typeof matchLive!=='undefined'&&matchLive&&running
      &&window.__MF_GALACTIC_BRIDGE?.active&&window.__MF_GALACTIC_BRIDGE?.status==='battle'
      &&window.__MF_GALACTIC_BRIDGE?.packageApplied===true,
      null,{timeout:180_000});
    await page.waitForFunction(()=>Number(stats?.t)>0,null,{timeout:60_000});
    const live=await page.evaluate(()=>{
      const canvas=document.getElementById('gl'),gl=canvas?.getContext('webgl2');
      const active=aiSlots.filter(slot=>slot.on),allies=active.filter(slot=>slot.ally);
      let playerUnits=0,hostileUnits=0;
      for(let i=0;i<unitHigh;i++)if(ualive[i]){if(uteam[i]===0)playerUnits++;else hostileUnits++;}
      return {
        matchLive,running,gameEnded,statsTime:stats.t,activeWarMode,playerFaction,
        playerCommanderId,curMap,curRegionId,goalSel,infestationOn,difficulty,
        enemyFaction:AI?.fac,broodEnemy:typeof broodIsEnemy==='function'&&broodIsEnemy(),
        activeAiCount:active.length,allyAiCount:allies.length,playerUnits,hostileUnits,
        heroAlive:heroIdx>=0,canvas:{width:canvas?.width||0,height:canvas?.height||0,
          webgl2:!!gl,contextLost:gl?.isContextLost?.()??null,glError:gl?.getError?.()??null},
        fogScans:(typeof fogScans==='undefined'?[]:fogScans).map(scan=>({
          x:scan.x,y:scan.y,until:scan.until,radius:scan.r,remaining:scan.until-stats.t
        })),
        bridge:{active:window.__MF_GALACTIC_BRIDGE.active,status:window.__MF_GALACTIC_BRIDGE.status,
          report:window.__MF_GALACTIC_BRIDGE.report,
          operationEffects:window.__MF_GALACTIC_BRIDGE.operationEffects,
          packageApplied:window.__MF_GALACTIC_BRIDGE.packageApplied,
          packageSummary:window.__MF_GALACTIC_BRIDGE.packageSummary,
          isolation:window.__MF_GALACTIC_BRIDGE.isolation}
      };
    });
    const expectedPackage=expectedDeploymentPackage(setup.bridge.request.operation);
    const expectedEffects=expectedOperationEffects(setup.bridge.request.operation);
    assertion(report,'live-match','real production match runtime is deployed before terminal automation',
      live.matchLive&&live.running&&!live.gameEnded&&live.statsTime>0&&live.activeWarMode==='galactic'
        &&live.playerFaction===expectedFaction&&live.playerCommanderId===expectedCommander
        &&live.curMap==='vespera_spire_medium'&&live.goalSel==='purge'&&live.infestationOn
        &&live.enemyFaction==='horde'&&live.broodEnemy&&live.activeAiCount===1&&live.allyAiCount===0
        &&live.heroAlive&&live.playerUnits>0&&live.canvas.webgl2&&!live.canvas.contextLost
        &&live.canvas.glError===0
        &&live.bridge.active&&live.bridge.status==='battle'&&!live.bridge.report
        &&live.bridge.packageApplied===true&&live.bridge.isolation?.active===true
        &&live.bridge.isolation?.droppedSessionPreserved===true
        &&live.bridge.isolation?.persistentCratesSuppressed===0
        &&live.bridge.isolation?.postMatchAdsSuppressed===0
        &&live.bridge.isolation?.billboardImpressionsSuppressed>=0,live);
    const packageSummary=live.bridge.packageSummary;
    assertion(report,'deployment-package','authored NEXUS-VII manifest spawned the exact production package',
      packageSummary?.landingZoneId===setup.bridge.request.operation.landingZoneId
        &&JSON.stringify(packageSummary?.requested?.unitGroups)===JSON.stringify(setup.bridge.request.operation.deploymentManifest.units)
        &&JSON.stringify(packageSummary?.requested?.structures)===JSON.stringify(setup.bridge.request.operation.deploymentManifest.structures)
        &&packageSummary?.spawned?.units===expectedPackage.units
        &&packageSummary?.spawned?.structures===expectedPackage.structures
        &&JSON.stringify(packageSummary?.spawned?.unitTypes)===JSON.stringify(expectedPackage.unitTypes)
        &&JSON.stringify(packageSummary?.spawned?.structureTypes)===JSON.stringify(expectedPackage.structureTypes)
        &&effectListMatches(packageSummary?.appliedEffects?.matchApplied,expectedEffects.matchApplied)
        &&effectListMatches(packageSummary?.appliedEffects?.scoreApplied,expectedEffects.scoreApplied)
        &&effectListMatches(packageSummary?.appliedEffects?.moduleResultApplied,expectedEffects.moduleResultApplied),
      {expected:expectedPackage,actual:packageSummary,operationManifest:setup.bridge.request.operation.deploymentManifest});
    const repairEffect=packageSummary?.appliedEffects?.matchApplied?.find(item=>item.effect==='starting-unit-repair-reserve');
    const scanEffects=expectedEffects.matchApplied.filter(item=>item.effect==='deployment-scan');
    const liveScans=live.fogScans.filter(scan=>scan.radius===15&&scan.remaining>0);
    assertion(report,'operation-effects','resolved operation effects are applied to the real match package',
      effectListMatches(live.bridge.operationEffects?.matchApplied,expectedEffects.matchApplied)
        &&effectListMatches(live.bridge.operationEffects?.scoreApplied,expectedEffects.scoreApplied)
        &&effectListMatches(live.bridge.operationEffects?.moduleResultApplied,expectedEffects.moduleResultApplied)
        &&live.bridge.operationEffects?.tacticalScoreDelta===expectedEffects.tacticalScoreDelta
        &&scanEffects.length===1&&liveScans.length===1
        &&repairEffect?.eligibleUnitCount>0&&repairEffect?.totalReserveHp>0,
      {expected:expectedEffects,operationEffects:live.bridge.operationEffects,
        appliedEffects:packageSummary?.appliedEffects,liveScans});
    report.effectProof.expected=expectedEffects;
    report.effectProof.scan={expectedCount:scanEffects.length,observedCount:liveScans.length,
      scans:liveScans};
    const snapshotSuppression=await page.evaluate(expected=>{
      const before=localStorage.getItem(SESS_KEY);
      const returned=sessSnapshot('stage9-verifier-live');
      const after=localStorage.getItem(SESS_KEY);
      return {key:SESS_KEY,before,after,returned,matchesExpected:before===expected&&after===expected,
        isolation:window.__MF_GALACTIC_BRIDGE.isolation};
    },droppedSessionBefore.value);
    assertion(report,'session-isolation','live Galactic match suppresses snapshots and preserves prior dropped session bytes',
      snapshotSuppression.key===droppedSessionBefore.key&&snapshotSuppression.returned===false
        &&snapshotSuppression.matchesExpected&&snapshotSuppression.isolation?.active===true,
      snapshotSuppression);
    report.droppedSession.live={key:snapshotSuppression.key,returned:snapshotSuppression.returned,
      unchanged:snapshotSuppression.matchesExpected};
    const adSuppression=await page.evaluate(expected=>{
      const before=localStorage.getItem(AD_STATS_KEY);
      const returned=AD_PROVIDER.reportImpression({id:'stage9-verifier-board'},
        {id:'stage9-verifier-creative'});
      const after=localStorage.getItem(AD_STATS_KEY);
      return {key:AD_STATS_KEY,before,after,returned:returned??null,
        matchesExpected:before===expected&&after===expected,
        isolation:window.__MF_GALACTIC_BRIDGE.isolation};
    },adStatsBefore.value);
    assertion(report,'ad-isolation','live Galactic match suppresses the real billboard impression persistence seam',
      adSuppression.key===adStatsBefore.key&&adSuppression.returned===null
        &&adSuppression.matchesExpected&&adSuppression.isolation?.active===true
        &&adSuppression.isolation?.billboardImpressionsSuppressed>=1,adSuppression);
    report.adStats.live={key:adSuppression.key,returned:adSuppression.returned,
      unchanged:adSuppression.matchesExpected,
      billboardImpressionsSuppressed:adSuppression.isolation.billboardImpressionsSuppressed};
    const naniteDamage=await page.evaluate(()=>{
      let index=-1,type=null;
      for(let i=0;i<unitHigh;i++){
        const name=TYPES[utype[i]]?.name;
        if(ualive[i]&&uteam[i]===0&&['Striker','Warden','Rhino'].includes(name)){
          index=i;type=name;break;
        }
      }
      if(index<0)return {index,type,error:'NO_ELIGIBLE_PACKAGE_UNIT'};
      const before=Number(uhp[index]),max=Number(uhpm[index]),generation=ugen[index];
      dealDamage(index,Math.max(20,max*.12),1,-1);
      return {index,type,generation,before,max,afterDamage:Number(uhp[index]),alive:!!ualive[index]};
    });
    assertion(report,'operation-effects','repair-nanite probe damages a live starting package unit through dealDamage',
      naniteDamage.index>=0&&naniteDamage.alive&&naniteDamage.afterDamage<naniteDamage.before,
      naniteDamage);
    await page.waitForFunction(probe=>ualive[probe.index]&&ugen[probe.index]===probe.generation
      &&Number(uhp[probe.index])>probe.afterDamage+.01,naniteDamage,{timeout:15_000});
    const naniteRepair=await page.evaluate(probe=>({
      ...probe,afterRepair:Number(uhp[probe.index]),alive:!!ualive[probe.index],
      generationStillMatches:ugen[probe.index]===probe.generation
    }),naniteDamage);
    assertion(report,'operation-effects','repair nanites restore real unit health after live runtime damage',
      naniteRepair.alive&&naniteRepair.generationStillMatches
        &&naniteRepair.afterRepair>naniteRepair.afterDamage&&naniteRepair.afterRepair<=naniteRepair.max,
      naniteRepair);
    report.effectProof.nanites=naniteRepair;
    report.liveRuntimeProof=live;
    await capture(page,report,'07-base-pale-bloom-live-match',
      'Real deployed hardware-WebGL2 Pale Bloom match before bounded terminal automation.',live);

    await page.evaluate(()=>endGame(true,'Stage 9 bounded acceptance: real Pale Bloom runtime proven'));
    await page.waitForFunction(()=>window.__MF_GALACTIC_BRIDGE?.status==='terminal'
      &&window.__MF_GALACTIC_BRIDGE?.report
      &&document.getElementById('gameOver')?.offsetParent
      &&/RETURN TO NEXUS-VII/.test(document.getElementById('restartBtn')?.textContent||''),
      null,{timeout:30_000});
    const terminal=await page.evaluate(()=>({
      bridge:{active:window.__MF_GALACTIC_BRIDGE.active,status:window.__MF_GALACTIC_BRIDGE.status,
        reason:window.__MF_GALACTIC_BRIDGE.reason,report:window.__MF_GALACTIC_BRIDGE.report,
        operationEffects:window.__MF_GALACTIC_BRIDGE.operationEffects,
        packageApplied:window.__MF_GALACTIC_BRIDGE.packageApplied,
        packageSummary:window.__MF_GALACTIC_BRIDGE.packageSummary,
        isolation:window.__MF_GALACTIC_BRIDGE.isolation},
      stats:{elapsed:Math.max(0,Math.floor(Number(stats?.t)||0)),
        kills:Math.max(0,Math.floor(Number(stats?.kills?.[0])||0)),
        losses:Math.max(0,Math.floor(Number(stats?.kills?.[1])||0)),
        nests:Math.max(0,Math.floor(Number(stats?.nests)||0))},
      returnLabel:document.getElementById('restartBtn')?.textContent?.trim()||null,
      gameOverVisible:!!document.getElementById('gameOver')?.offsetParent,
      payoutText:document.getElementById('goRewards')?.innerText||'',
      postMatchAdPresent:!!document.querySelector('.adPostMatch'),
      droppedSession:{key:SESS_KEY,value:localStorage.getItem(SESS_KEY)},
      adStats:{key:AD_STATS_KEY,value:localStorage.getItem(AD_STATS_KEY)},
      transient:{
        requestKeys:[...Array(sessionStorage.length)].map((_,i)=>sessionStorage.key(i)||'')
          .filter(key=>key.startsWith('massfront.galactic.request.v1.')).sort(),
        resultKeys:[...Array(sessionStorage.length)].map((_,i)=>sessionStorage.key(i)||'')
          .filter(key=>key.startsWith('massfront.galactic.result.v1.')).sort()
      },
      query:location.search
    }));
    assertion(report,'terminal','tactical report is valid and base career payout is suppressed',
      terminal.bridge.status==='terminal'&&terminal.bridge.report?.kind==='MassfrontGalacticTacticalReportV1'
        &&terminal.bridge.report?.nonce===report.operation.nonce
        &&terminal.bridge.report?.operationId===report.operation.operationId
        &&terminal.bridge.report?.report?.outcome==='victory'
        &&terminal.bridge.report?.report?.primaryObjectiveComplete===true
        &&/RETURN TO NEXUS-VII/.test(terminal.returnLabel)
        &&!/MISSION PAYOUT|ACCOUNT SALVAGE|\+\d+\s*XP/i.test(terminal.payoutText)
        &&terminal.bridge.packageApplied===true&&terminal.bridge.isolation?.active===true
        &&terminal.bridge.isolation?.postMatchAdsSuppressed===1
        &&terminal.bridge.isolation?.billboardImpressionsSuppressed>=1
        &&terminal.postMatchAdPresent===false
        &&terminal.droppedSession.key===droppedSessionBefore.key
        &&terminal.droppedSession.value===droppedSessionBefore.value
        &&terminal.adStats.key===adStatsBefore.key&&terminal.adStats.value===adStatsBefore.value
        &&terminal.transient.requestKeys.length===1
        &&terminal.transient.requestKeys[0]===REQUEST_PREFIX+report.operation.nonce
        &&terminal.transient.resultKeys.length===1
        &&terminal.transient.resultKeys[0]===RESULT_PREFIX+report.operation.nonce,terminal);
    const expectedScore=expectedVictoryScore(terminal.stats,expectedEffects.tacticalScoreDelta);
    assertion(report,'operation-effects','doctrine and support modifiers change the immutable tactical report score',
      effectListMatches(terminal.bridge.operationEffects?.scoreApplied,expectedEffects.scoreApplied)
        &&terminal.bridge.operationEffects?.tacticalScoreDelta===expectedEffects.tacticalScoreDelta
        &&terminal.bridge.report?.report?.score===expectedScore,
      {stats:terminal.stats,expectedScore,actualScore:terminal.bridge.report?.report?.score,
        expectedEffects,operationEffects:terminal.bridge.operationEffects});
    report.effectProof.score={stats:terminal.stats,baseScore:expectedVictoryScore(terminal.stats,0),
      tacticalScoreDelta:expectedEffects.tacticalScoreDelta,expectedScore,
      actualScore:terminal.bridge.report.report.score};
    report.tacticalReport=terminal.bridge.report;
    await capture(page,report,'08-base-pale-bloom-terminal-return',
      'Production game-over screen with secured tactical report and real NEXUS-VII return control.',terminal);

    await Promise.all([
      page.waitForURL(/\/modules\/space_exploration\/index\.html\?groundResult=[A-Za-z0-9_-]{16,128}$/,{timeout:60_000}),
      page.locator('#restartBtn').tap({timeout:30_000})
    ]);
    await waitForModuleReady(page);
    await page.waitForFunction(()=>document.querySelector('#operationModal[data-operation-state="debrief"][data-exactly-once="true"]')
      &&document.querySelector('#operationPayload[data-debrief-applied="applied"]')
      &&window.__MASSFRONT_GALACTIC_RESULT__?.applicationDurable===true
      &&window.__MASSFRONT_SPACE__?.getState?.().operations?.history?.length===1
      &&window.__MASSFRONT_SPACE__?.getState?.().operations?.pending===null
      &&location.search==='',null,{timeout:180_000});
    const debrief=await operationState(page);
    assertion(report,'debrief','canonical result applied once and transient bridge mirrors were removed',
      debrief.productionIntegrated&&debrief.profileId===optedIn.activeProfile
        &&debrief.hostAccountId===optedIn.activeProfile&&!debrief.pending
        &&debrief.historyCount===1&&debrief.appliedResultIds.length===1
        &&debrief.historyResultIds[0]===debrief.appliedResultIds[0]
        &&debrief.paleBloomCompletions===1&&debrief.requestKeys.length===0
        &&debrief.resultKeys.length===0&&debrief.query===''&&!debrief.error,debrief);
    report.resultId=debrief.historyResultIds[0];
    await capture(page,report,'09-module-pale-bloom-debrief',
      'Canonical exploration debrief visibly records the exactly-once applied result.',debrief);

    await page.locator('#btnCancelOperation').tap({timeout:30_000});
    const archive=page.locator('[data-debrief-archive][data-archive-count="1"] .uga-debrief-record');
    await archive.waitFor({state:'visible',timeout:60_000});
    await archive.scrollIntoViewIfNeeded();
    const archiveState=await operationState(page);
    const archiveDom=await page.locator('[data-debrief-archive]').evaluate(element=>({
      count:Number(element.dataset.archiveCount),visibleCount:Number(element.dataset.archiveVisibleCount),
      resultIds:element.dataset.archiveResultIds,records:[...element.querySelectorAll('.uga-debrief-record')].map(record=>({
        resultId:record.dataset.resultId,outcome:record.dataset.outcome,text:record.innerText
      }))
    }));
    assertion(report,'archive','acknowledgement opens Contracts with one persistent debrief record',
      archiveState.historyCount===1&&!archiveState.pending&&archiveDom.count===1
        &&archiveDom.visibleCount===1&&archiveDom.records.length===1
        &&archiveDom.records[0].resultId===report.resultId,archiveDom);
    await capture(page,report,'10-module-debrief-archive',
      'Contracts Debrief Archive after real acknowledgement.',{state:archiveState,archive:archiveDom});

    await page.reload({waitUntil:'domcontentloaded',timeout:60_000});
    await waitForModuleReady(page);
    const reloadedBeforeUi=await operationState(page);
    assertion(report,'reload','reload does not replay or duplicate the stripped tactical result',
      reloadedBeforeUi.historyCount===1&&!reloadedBeforeUi.pending
        &&reloadedBeforeUi.appliedResultIds.length===1
        &&reloadedBeforeUi.historyResultIds[0]===report.resultId
        &&reloadedBeforeUi.appliedResultIds[0]===report.resultId
        &&reloadedBeforeUi.paleBloomCompletions===1&&reloadedBeforeUi.query===''
        &&reloadedBeforeUi.requestKeys.length===0&&reloadedBeforeUi.resultKeys.length===0
        &&!reloadedBeforeUi.error,reloadedBeforeUi);
    await page.locator('#btnUgaCommand').tap({timeout:30_000});
    await page.waitForFunction(()=>window.__MASSFRONT_SPACE__?.scene==='uga'
      &&document.querySelector('.uga-command-shell'),null,{timeout:60_000});
    await page.locator('.uga-command-nav [data-nav="missions"]').tap({timeout:30_000});
    const reloadedArchive=page.locator('[data-debrief-archive][data-archive-count="1"] .uga-debrief-record[data-result-id="'+report.resultId+'"]');
    await reloadedArchive.waitFor({state:'visible',timeout:60_000});
    await reloadedArchive.scrollIntoViewIfNeeded();
    const reloadedArchiveDom=await page.locator('[data-debrief-archive]').evaluate(element=>({
      count:Number(element.dataset.archiveCount),visibleCount:Number(element.dataset.archiveVisibleCount),
      resultIds:element.dataset.archiveResultIds,records:[...element.querySelectorAll('.uga-debrief-record')].map(record=>({
        resultId:record.dataset.resultId,outcome:record.dataset.outcome
      }))
    }));
    assertion(report,'reload','persistent archive still contains exactly one matching result',
      reloadedArchiveDom.count===1&&reloadedArchiveDom.visibleCount===1
        &&reloadedArchiveDom.records.length===1&&reloadedArchiveDom.records[0].resultId===report.resultId,
      reloadedArchiveDom);
    await capture(page,report,'11-module-debrief-archive-reloaded',
      'Reloaded Contracts archive proves the result was not duplicated.',
      {state:reloadedBeforeUi,archive:reloadedArchiveDom});

    const rawCareerAfter=await page.evaluate(keys=>keys.map(key=>({key,value:localStorage.getItem(key)})),
      careerBefore.raw.map(item=>item.key));
    const careerAfter=baseCareerRecord(rawCareerAfter);
    report.baseCareer.after={records:careerAfter.records,bytes:careerAfter.bytes,sha256:careerAfter.sha256};
    report.baseCareer.unchanged=careerAfter.sha256===careerBefore.sha256
      &&JSON.stringify(careerAfter.raw)===JSON.stringify(careerBefore.raw);
    assertion(report,'career-isolation','base profile and career bytes remain byte-for-byte unchanged',
      report.baseCareer.unchanged,{before:report.baseCareer.before,after:report.baseCareer.after});
    const droppedSessionAfter=await page.evaluate(key=>({key,value:localStorage.getItem(key)}),
      droppedSessionBefore.key);
    report.droppedSession.after={key:droppedSessionAfter.key,
      bytes:droppedSessionAfter.value===null?0:Buffer.byteLength(droppedSessionAfter.value),
      sha256:droppedSessionAfter.value===null?null:sha256(droppedSessionAfter.value)};
    report.droppedSession.unchanged=droppedSessionAfter.value===droppedSessionBefore.value;
    assertion(report,'session-isolation','pre-existing dropped-session bytes survive the complete round trip',
      report.droppedSession.unchanged,{before:report.droppedSession.before,after:report.droppedSession.after});
    const adStatsAfter=await page.evaluate(key=>({key,value:localStorage.getItem(key)}),adStatsBefore.key);
    report.adStats.after={key:adStatsAfter.key,
      bytes:adStatsAfter.value===null?0:Buffer.byteLength(adStatsAfter.value),
      sha256:adStatsAfter.value===null?null:sha256(adStatsAfter.value)};
    report.adStats.unchanged=adStatsAfter.value===adStatsBefore.value;
    assertion(report,'ad-isolation','persistent base ad-statistics bytes survive the complete round trip',
      report.adStats.unchanged,{before:report.adStats.before,after:report.adStats.after});
    const webglEvents=await page.evaluate(()=>({
      contextLosses:Number(sessionStorage.getItem('__mfStage9ContextLosses'))||0,
      contextCreationErrors:Number(sessionStorage.getItem('__mfStage9ContextCreationErrors'))||0,
      finalContextLost:window.__MASSFRONT_SPACE__?.engine?.renderer?.getContext?.().isContextLost?.()??null,
      finalGlError:window.__MASSFRONT_SPACE__?.engine?.renderer?.getContext?.().getError?.()??null
    }));
    report.webgl=webglEvents;
    assertion(report,'webgl','no context loss or creation error across both documents',
      webglEvents.contextLosses===0&&webglEvents.contextCreationErrors===0
        &&webglEvents.finalContextLost===false&&webglEvents.finalGlError===0,webglEvents);
  }catch(error){thrown=error;}
  finally{
    if(offline){
      try{report.offline=await offline.finalize('Stage 9 Galactic-operation flow');}
      catch(error){report.errors.capture.push({message:String(error&&error.stack||error)});thrown??=error;}
    }else if(!page.isClosed())await page.close().catch(()=>{});
    report.errors.runtime.push(...runtimeErrors);
  }
  assertion(report,'runtime','no page, console, request, or HTTP errors',
    report.errors.runtime.length===0,report.errors.runtime);
  await assertPwBrowserOwnership(browser);
  await report.workspaceGuard.checkpoint('after Stage 9 browser flow');
  if(thrown)throw thrown;
}

async function main(){
  const reportPath=join(outDir,'report.json');
  let outputLease=null,workspaceGuard=null,report=null,server=null,browser=null,failure=null;
  try{
    outputLease=await acquireOutputLease();
    workspaceGuard=await acquireVerificationFreeze({
      root,label:'Stage 9 Galactic-operation capture '+runId,
      quietMs:Number(process.env.MF_QUIET_PREFLIGHT_MS||15000),
      allowedPaths:[outDir,remoteAttachmentDir]
    });
    const outputPreparation=await prepareOutput();
    const source=await readRepositoryFingerprint(root);
    const runtime=await readRuntimeFingerprint(root);
    const moduleRuntime=await readModuleRuntimeIdentity();
    requireSourceIdentity(source,'start');requireRuntimeIdentity(runtime,'start');
    requireModuleRuntimeIdentity(moduleRuntime,'start');
    report={
      schema:'massfront.stage9-galactic-operations/v1',runId,
      generatedAt:new Date().toISOString(),root,moduleRoot,
      captureKind:'real-same-tab-player-route-hardware-webgl2',
      outputPreparation,viewport:{...VIEWPORT},expectedCaptureKeys:EXPECTED_CAPTURE_KEYS,
      expectedPngCount:EXPECTED_CAPTURE_KEYS.length,captureCompleted:false,
      machineOutcome:'UNKNOWN',acceptanceOutcome:'PENDING_HUMAN_VISUAL_REVIEW',
      visualVerdict:'PENDING_HUMAN_REVIEW',visualReviewRequired:true,
      visualChecklist:[
        'The default-off and opted-in Settings screens are legible and the preview remains Settings-only.',
        'The Starchart, UGA Pale Bloom contract and Deployment Hangar read as one coherent player route.',
        'The production deployment and live tactical frames visibly represent a Brood purge, not a generic Standard match.',
        'The terminal screen exposes RETURN TO NEXUS-VII without a normal base-career payout.',
        'The debrief communicates the result, rewards, injuries, world effects and exactly-once status clearly.',
        'The archive still contains one result after reload with no duplicate card.'
      ],
      source,runtime,moduleRuntime,
      sourceAtCompletion:null,runtimeAtCompletion:null,moduleRuntimeAtCompletion:null,
      sourceStable:false,runtimeStable:false,moduleRuntimeStable:false,
      browser:null,browserAtCompletion:null,gpu:{base:null,module:null},
      server:{url:null,requests:[]},seed:null,operation:null,tacticalReport:null,resultId:null,
      liveRuntimeProof:null,baseCareer:{before:null,after:null,unchanged:false},
      effectProof:{expected:null,scan:null,nanites:null,score:null},
      droppedSession:{before:null,live:null,after:null,unchanged:false},
      adStats:{before:null,live:null,after:null,unchanged:false},webgl:null,
      captures:[],offline:null,assertions:[],errors:{runtime:[],capture:[]}
    };
    Object.defineProperty(report,'workspaceGuard',{value:workspaceGuard,enumerable:false});
    try{
      const local=await startServer(report);server=local.server;report.server.url=local.url;
      browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
      report.browser=await assertPwBrowserOwnership(browser);
      await runFlow(browser,report,local.url);
      const keys=report.captures.map(item=>item.key);
      assertion(report,'matrix','exact ordered Stage 9 capture matrix',
        JSON.stringify(keys)===JSON.stringify(EXPECTED_CAPTURE_KEYS),
        {expected:EXPECTED_CAPTURE_KEYS,actual:keys});
      assertion(report,'matrix','exact unique Stage 9 PNG matrix',
        report.captures.length===EXPECTED_CAPTURE_KEYS.length
          &&new Set(report.captures.map(item=>item.artifact.file)).size===EXPECTED_CAPTURE_KEYS.length,
        {expected:EXPECTED_CAPTURE_KEYS.length,actual:report.captures.length});
      for(const item of report.captures){
        const current=pngInfo(await readFile(join(outDir,item.artifact.file)));
        assertion(report,item.key,'PNG exists and matches recorded hash',
          current.sha256===item.artifact.sha256&&current.bytes===item.artifact.bytes,current);
      }
      report.captureCompleted=true;
    }catch(error){
      failure=error;report.captureCompleted=false;
      report.errors.capture.push({message:String(error&&error.stack||error)});
    }finally{
      if(browser){
        try{
          report.browserBeforeClose=pwBrowserEvidence(browser);
          report.browserAtCompletion=await closePwBrowser(browser);
        }catch(error){
          failure??=error;report.captureCompleted=false;
          report.errors.capture.push({message:'Browser cleanup: '+String(error&&error.stack||error)});
        }
      }
      if(server)try{await new Promise((accept,reject)=>server.close(error=>error?reject(error):accept()));}
      catch(error){
        failure??=error;report.captureCompleted=false;
        report.errors.capture.push({message:'Server cleanup: '+String(error&&error.stack||error)});
      }
      try{
        await workspaceGuard.checkpoint('before completion fingerprints');
        report.sourceAtCompletion=await readRepositoryFingerprint(root);
        report.runtimeAtCompletion=await readRuntimeFingerprint(root);
        report.moduleRuntimeAtCompletion=await readModuleRuntimeIdentity();
        requireSourceIdentity(report.sourceAtCompletion,'completion');
        requireRuntimeIdentity(report.runtimeAtCompletion,'completion');
        requireModuleRuntimeIdentity(report.moduleRuntimeAtCompletion,'completion');
        report.sourceStable=sameSource(report.source,report.sourceAtCompletion);
        report.runtimeStable=sameRuntime(report.runtime,report.runtimeAtCompletion);
        report.moduleRuntimeStable=sameModuleRuntime(report.moduleRuntime,report.moduleRuntimeAtCompletion);
        if(!report.sourceStable||!report.runtimeStable||!report.moduleRuntimeStable)
          throw new Error('SOURCE_OR_RUNTIME_CHANGED_DURING_CAPTURE');
      }catch(error){
        failure??=error;report.captureCompleted=false;
        report.errors.capture.push({message:String(error&&error.stack||error)});
      }
      report.completedAt=new Date().toISOString();
    }
  }catch(error){
    failure??=error;
    if(report){
      report.captureCompleted=false;
      report.errors.capture.push({message:String(error&&error.stack||error)});
    }
  }finally{
    let releaseSucceeded=false;
    if(workspaceGuard){
      if(report)try{
        report.machineOutcome='PENDING_FINAL_RELEASE';
        await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
      }catch(error){
        failure??=error;report.captureCompleted=false;
        report.errors.capture.push({message:'Provisional report write: '+String(error&&error.stack||error)});
      }
      try{
        await workspaceGuard.release({assertStable:true,name:'Stage 9 Galactic-operation final release'});
        workspaceGuard=null;releaseSucceeded=true;
      }catch(error){
        failure??=error;
        if(report){
          report.captureCompleted=false;
          report.errors.capture.push({message:'Workspace freeze release: '+String(error&&error.stack||error)});
        }
      }
      if(report){
        report.machineOutcome=releaseSucceeded&&report.captureCompleted&&!failure?'PASS':'FAIL';
        report.completedAt=new Date().toISOString();
        let outputOwned=true;
        try{await outputLease.checkpoint();}
        catch(error){
          outputOwned=false;failure??=error;report.captureCompleted=false;report.machineOutcome='FAIL';
          report.errors.capture.push({message:'Final output lease checkpoint: '+String(error&&error.stack||error)});
        }
        if(outputOwned)try{await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');}
        catch(error){
          failure??=error;report.captureCompleted=false;report.machineOutcome='FAIL';
          report.errors.capture.push({message:'Final report write: '+String(error&&error.stack||error)});
        }
      }
    }
    if(outputLease)try{await outputLease.release();}
    catch(error){console.warn('Output lease cleanup deferred: '+String(error&&error.stack||error));}
  }
  if(report)console.log(JSON.stringify({
    runId,report:reportPath,machineOutcome:report.machineOutcome,
    acceptanceOutcome:report.acceptanceOutcome,captures:report.captures.length,
    gpu:report.gpu,operation:report.operation,resultId:report.resultId,
    careerUnchanged:report.baseCareer.unchanged,errors:report.errors
  },null,2));
  if(failure)throw failure;
}

async function selfTest(){
  if(!inside(root,moduleRoot)||inside(moduleRoot,root))throw new Error('SELF_TEST_CONTAINMENT_FAILED');
  const identity=await readModuleRuntimeIdentity();
  requireModuleRuntimeIdentity(identity,'self-test');
  const required=[
    'index.html','src/space_module.js','src/space_experience.js',
    'src/host/massfront_solo_host.js','src/ui/uga_command.js','src/ui/uga_command.css'
  ];
  const missing=required.filter(path=>!identity.expectedPaths.includes(path));
  if(missing.length)throw new Error('SELF_TEST_STAGE9_RUNTIME_PATHS_MISSING: '+missing.join(', '));
  const careerA=baseCareerRecord([{key:'massfront_profiles_v1',value:'{"active":"p1"}'},
    {key:'massfront_meta_p1',value:'{"wins":0}'}]);
  const careerB=baseCareerRecord([{key:'massfront_meta_p1',value:'{"wins":0}'},
    {key:'massfront_profiles_v1',value:'{"active":"p1"}'}]);
  const careerC=baseCareerRecord([{key:'massfront_profiles_v1',value:'{"active":"p1"}'},
    {key:'massfront_meta_p1',value:'{"wins":1}'}]);
  if(careerA.sha256!==careerB.sha256||careerA.sha256===careerC.sha256)
    throw new Error('SELF_TEST_CAREER_FINGERPRINT_FAILED');
  const packageExpectation=expectedDeploymentPackage({deploymentManifest:{
    units:[{id:'recon_team',count:1},{id:'line_section',count:1},{id:'armored_element',count:1}],
    structures:[{id:'field_relay',count:1}]
  }});
  if(JSON.stringify(packageExpectation)!==JSON.stringify({units:4,structures:1,
    unitTypes:{Striker:3,Rhino:1},structureTypes:{uplink:1}}))
    throw new Error('SELF_TEST_DEPLOYMENT_PACKAGE_MAPPING_FAILED');
  const effectExpectation=expectedOperationEffects({doctrineId:'containment',supportId:'survey_drones',
    deploymentManifest:{modIds:['survey_link','repair_nanites']}});
  if(effectExpectation.matchApplied.length!==2||effectExpectation.scoreApplied.length!==2
    ||effectExpectation.moduleResultApplied.length!==0||effectExpectation.tacticalScoreDelta!==12
    ||expectedVictoryScore({elapsed:0,kills:0,losses:0,nests:0},effectExpectation.tacticalScoreDelta)!==80
    ||!effectListMatches([{...effectExpectation.matchApplied[0],runtimeProof:true},
      {...effectExpectation.matchApplied[1],eligibleUnitCount:4,totalReserveHp:200}],effectExpectation.matchApplied))
    throw new Error('SELF_TEST_OPERATION_EFFECT_MAPPING_FAILED');
  const indexSource=await readFile(join(moduleRoot,'index.html'),'utf8');
  const moduleSource=await readFile(join(moduleRoot,'src','space_module.js'),'utf8');
  const experienceSource=await readFile(join(moduleRoot,'src','space_experience.js'),'utf8');
  if(!/space_module\.js\?v=20260828-stage9ops2/.test(indexSource)
    ||!/space_experience\.js\?v=20260828-stage9ops2/.test(moduleSource)
    ||!/massfront_solo_host\.js\?v=20260828-stage9host2/.test(moduleSource)
    ||!/uga_command\.js\?v=20260828-stage9ops2/.test(experienceSource))
    throw new Error('SELF_TEST_STAGE9_CACHE_CHAIN_STALE');
  console.log(JSON.stringify({status:'PASS',moduleRuntime:{
    fingerprint:identity.runtimeFingerprint,moduleFileCount:identity.moduleFileCount,
    runtimeFileCount:identity.runtimeFileCount,expectedPathCount:identity.expectedPathCount,
    reachableCodeCount:identity.reachableCodeCount,reachableAssetCount:identity.reachableAssetCount
  },requiredPaths:required,packageExpectation,effectExpectation,
  cacheVersions:{operations:'20260828-stage9ops2',host:'20260828-stage9host2'}},null,2));
}

(selfTestMode?selfTest():main()).catch(error=>{
  console.error(error&&error.stack||error);process.exitCode=1;
});
