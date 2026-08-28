#!/usr/bin/env node
/* Stage 8 player-path proof for portable .mfsave transfer.

   This is intentionally a browser probe, not another VM codec test: the file
   must come from the visible SAVE FILE button, enter through the real hidden
   file input, survive a partial localStorage transaction failure, and reject
   a byte-level corruption without changing the player's current career. */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { collectEvidenceIdentity } from './evidence-foundation/fingerprints.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';
import { installOfflineNetworkIsolation } from './offline-network-isolation.mjs';
import {
  assertPwBrowserOwnership,
  closePwBrowser,
  launchPwBrowser,
  recordPwBrowserGpu
} from './pw-browser.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const output=join(root,'.tmp','stage8-save-transfer');
const reportPath=join(output,'report.json');
const screenshotPath=join(output,'save-transfer-corrupt-rejected.png');
const viewport={width:412,height:900};
const MIME={
  '.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml',
  '.ogg':'audio/ogg','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wasm':'application/wasm',
  '.glb':'model/gltf-binary','.ktx2':'image/ktx2','.webmanifest':'application/manifest+json'
};

function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
function assert(condition,message){if(!condition)throw new Error(message);}
function inside(base,file){
  const rel=relative(base,file);
  return rel!==''&&rel!=='..'&&!rel.startsWith('..'+sep)&&!resolve(rel).startsWith('..'+sep);
}
function sameIdentity(a,b){
  return ['gitHead','dirtyFingerprint','runtimeFingerprint','testedEntrySha256','testedPackageSha256']
    .every(key=>a?.[key]===b?.[key]);
}
function errorText(error){return String(error?.stack||error?.message||error);}

async function startServer(){
  const server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://127.0.0.1');
      const pathname=decodeURIComponent(url.pathname);
      const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
      if(!inside(root,file)||!existsSync(file)){
        res.writeHead(404,{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;
      }
      const bytes=await readFile(file);
      res.writeHead(200,{'Cache-Control':'no-store','Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream',
        'Cross-Origin-Resource-Policy':'same-origin'});
      if(req.method==='HEAD')res.end();else res.end(bytes);
    }catch(error){
      res.writeHead(500,{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'});
      res.end('Loopback server error: '+(error?.message||error));
    }
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  const origin='http://127.0.0.1:'+server.address().port;
  return {origin,url:origin+'/',async close(){
    server.closeIdleConnections?.();server.closeAllConnections?.();
    await new Promise((ok,fail)=>server.close(error=>error?fail(error):ok()));
  }};
}

async function artifact(path){
  const [bytes,info]=await Promise.all([readFile(path),stat(path)]);
  return {path,bytes:info.size,sha256:sha256(bytes),modifiedAt:info.mtime.toISOString()};
}

async function waitForToast(page,from,pattern){
  await page.waitForFunction(({from,source,flags})=>{
    const re=new RegExp(source,flags),list=window.__mfSaveProbeToasts||[];
    return list.slice(from).some(message=>re.test(message));
  },{from,source:pattern.source,flags:pattern.flags},{timeout:15000});
  return page.evaluate(index=>(window.__mfSaveProbeToasts||[]).slice(index),from);
}

async function importAndConfirm(page,path){
  await page.locator('#saveFileInput').setInputFiles(path);
  await page.locator('#accDlg').waitFor({state:'visible',timeout:15000});
  await page.locator('#accDlgY').click();
  await page.locator('#accDlg').waitFor({state:'hidden',timeout:10000});
}

async function runtimeSnapshot(page){
  return page.evaluate(()=>{
    const profile=activeProf();
    const pickMeta=m=>({xp:m.xp,cores:m.cores,researchData:m.researchData,matches:m.matches,wins:m.wins,
      losses:m.losses,color:m.color,setup:m.setup?JSON.parse(JSON.stringify(m.setup)):null});
    const pickProfile=p=>({name:p?.name||'',emblem:p?.emblem||'',char:p?.char||'',title:p?.title||'',
      frame:p?.frame||'',link:p?.link==null?null:JSON.parse(JSON.stringify(p.link))});
    return {meta:pickMeta(META),profile:pickProfile(profile),metaKey:metaKey(),
      storedMeta:localStorage.getItem(metaKey()),storedProfiles:localStorage.getItem(PROF_KEY)};
  });
}

await mkdir(output,{recursive:true});
const startedAt=new Date().toISOString(),assertions=[],diagnostics={pageErrors:[],consoleErrors:[],httpErrors:[]};
let guard=null,server=null,browser=null,context=null,page=null,network=null,gpu=null,browserProvenance=null;
let networkEvidence=null;
let sourceBefore=null,sourceAfter=null,downloadInfo=null,corruptInfo=null,seedState=null,mutatedState=null;
let quotaState=null,restoredState=null,corruptState=null,fatal=null,blocked=false;
const cleanupFailures=[];

try{
  /* Five seconds is the production minimum and deliberately bounded: active
     Blender writers turn this run into a clear blocker instead of a long wait. */
  guard=await acquireVerificationFreeze({root,label:'Stage 8 save transfer browser probe',quietMs:5000});
  sourceBefore=await collectEvidenceIdentity({root});
  server=await startServer();
  assert(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(server.url),'probe origin is not ephemeral loopback');
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
  await assertPwBrowserOwnership(browser);
  context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1,
    colorScheme:'dark',acceptDownloads:true,serviceWorkers:'block'});
  page=await context.newPage();
  page.on('pageerror',error=>diagnostics.pageErrors.push(errorText(error)));
  page.on('console',message=>{if(message.type()==='error')diagnostics.consoleErrors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)diagnostics.httpErrors.push({status:response.status(),url:response.url()});});
  network=await installOfflineNetworkIsolation(page);
  await page.addInitScript(()=>{
    try{
      localStorage.setItem('mf_prealpha_cinematic_v2','stage8-save-transfer');
      localStorage.setItem('mf_auth_gate_v1','1');localStorage.setItem('mf_ap_gate_closed','1');
      localStorage.setItem('mf_ap_dismissed','1');
    }catch{}
    try{Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:undefined});}catch{}
    try{Object.defineProperty(navigator,'share',{configurable:true,value:undefined});}catch{}
    try{Object.defineProperty(navigator,'canShare',{configurable:true,value:undefined});}catch{}
    try{Object.defineProperty(window,'Capacitor',{configurable:true,value:undefined});}catch{}
  });
  const navigation=await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:60000});
  assert(navigation?.ok(),`navigation failed with HTTP ${navigation?.status()??'unknown'}`);
  gpu=await assertHardwareGpu(page);recordPwBrowserGpu(browser,gpu);
  await page.waitForFunction(()=>typeof META==='object'&&typeof activeProf==='function'&&
    typeof mfWriteFile==='function'&&typeof applyIncoming==='function'&&typeof metaSave==='function'&&
    document.getElementById('saveFileGet'),null,{timeout:120000});
  await page.waitForTimeout(800);
  const fallbackDisabled=await page.evaluate(()=>{
    document.body.classList.add('mfIntroDone');
    try{if(typeof apGateSatisfied==='function')apGateSatisfied();}catch{}
    try{if(typeof apClose==='function')apClose();}catch{}
    for(const id of ['mfBootCover','apOverlay','apConfirmOverlay','mfIntroSkip','mfIntroReplay']){
      const el=document.getElementById(id);if(el)el.style.setProperty('display','none','important');
    }
    window.__mfSaveProbeToasts=[];
    const originalToast=toast;
    toast=function(message){window.__mfSaveProbeToasts.push(String(message));return originalToast(message);};
    const originalSet=Storage.prototype.setItem;
    window.__mfSaveProbeQuota=false;
    window.__mfSaveProbeSetItem=originalSet;
    Storage.prototype.setItem=function(key,value){
      if(window.__mfSaveProbeQuota&&String(key)===String(metaKey()))throw new DOMException('Storage quota exhausted','QuotaExceededError');
      return originalSet.call(this,key,value);
    };
    return {picker:typeof showSaveFilePicker,share:typeof navigator.share,canShare:typeof navigator.canShare,
      native:typeof window.Capacitor};
  });
  assert(Object.values(fallbackDisabled).every(value=>value==='undefined'),
    'picker/share/native export fallback was not disabled: '+JSON.stringify(fallbackDisabled));

  seedState=await page.evaluate(()=>{
    Object.assign(META,{xp:43210,cores:321,researchData:765,matches:44,wins:31,losses:13,color:'crimson',
      setup:Object.assign({},META.setup||{},{pf:'nova',pc:'kai'})});
    const profile=activeProf();Object.assign(profile,{name:'Stage8Seed',emblem:'⭐',char:'kai',title:'IRONSIDE',
      frame:'bronze',link:{provider:'local-proof',id:'stage8'}});
    if(profSave()!==true)throw new Error('seed profile did not persist');
    if(metaSave(true)!==true)throw new Error('seed career did not persist');
    renderMetaHead();renderProfile();renderAccount();
    return true;
  });
  assert(seedState===true,'career seed failed');
  seedState=await runtimeSnapshot(page);

  await page.locator('#rankEm').click();
  await page.locator('#profileScr').waitFor({state:'visible',timeout:10000});
  await page.locator('#profileTab-transfer').click();
  await page.locator('#saveFileGet').waitFor({state:'visible',timeout:10000});
  const downloadPromise=page.waitForEvent('download',{timeout:20000});
  await page.locator('#saveFileGet').click();
  const download=await downloadPromise;
  const suggested=download.suggestedFilename();
  assert(/^MASSFRONT-Stage8Seed-\d{8}-\d{4}\.mfsave$/.test(suggested),'unexpected save filename: '+suggested);
  const downloadPath=join(output,suggested);
  await download.saveAs(downloadPath);
  const downloadFailure=await download.failure();
  assert(downloadFailure===null,'save download failed: '+downloadFailure);
  downloadInfo=await artifact(downloadPath);
  assert(downloadInfo.bytes>46,'downloaded save is too small');
  assertions.push({id:'real-save-file-download',status:'PASS',detail:suggested});

  await page.evaluate(()=>{
    Object.assign(META,{xp:987,cores:12,researchData:3,matches:2,wins:1,losses:1,color:'azure',
      setup:Object.assign({},META.setup||{},{pf:'syndicate',pc:'renn'})});
    Object.assign(activeProf(),{name:'MutatedCareer',emblem:'🎖',char:'',title:'',frame:'steel',link:null});
    if(profSave()!==true||metaSave(true)!==true)throw new Error('mutated control state did not persist');
    renderMetaHead();renderProfile();renderAccount();
  });
  mutatedState=await runtimeSnapshot(page);
  assert(JSON.stringify(mutatedState)!==JSON.stringify(seedState),'mutated control state did not differ from export');

  const quotaToastStart=await page.evaluate(()=>(window.__mfSaveProbeToasts||[]).length);
  await page.evaluate(()=>{window.__mfSaveProbeQuota=true;});
  await importAndConfirm(page,downloadPath);
  const quotaToasts=await waitForToast(page,quotaToastStart,/low on storage|storage is unavailable/i);
  quotaState=await runtimeSnapshot(page);
  assert(JSON.stringify(quotaState)===JSON.stringify(mutatedState),'quota failure changed live or stored career/profile');
  assert(!quotaToasts.some(message=>/restored from game save file/i.test(message)),
    'quota failure emitted a success message: '+JSON.stringify(quotaToasts));
  assertions.push({id:'quota-rollback-live-and-storage',status:'PASS',detail:quotaToasts.join(' | ')});

  const restoreToastStart=await page.evaluate(()=>{window.__mfSaveProbeQuota=false;return (window.__mfSaveProbeToasts||[]).length;});
  await importAndConfirm(page,downloadPath);
  const restoreToasts=await waitForToast(page,restoreToastStart,/restored from game save file/i);
  restoredState=await runtimeSnapshot(page);
  assert(JSON.stringify(restoredState)===JSON.stringify(seedState),'successful file re-import did not restore exported career/profile');
  assertions.push({id:'successful-ui-reimport',status:'PASS',detail:restoreToasts.join(' | ')});

  const corruptBytes=await readFile(downloadPath);
  const corrupt=Buffer.from(corruptBytes);corrupt[15]^=1;
  let differences=0;for(let i=0;i<corrupt.length;i++)if(corrupt[i]!==corruptBytes[i])differences++;
  assert(differences===1,'corrupt fixture did not change exactly one byte');
  const corruptPath=join(output,suggested.replace(/\.mfsave$/,'-one-byte-corrupt.mfsave'));
  await writeFile(corruptPath,corrupt);corruptInfo=await artifact(corruptPath);
  const corruptToastStart=await page.evaluate(()=>(window.__mfSaveProbeToasts||[]).length);
  await page.locator('#saveFileInput').setInputFiles(corruptPath);
  const corruptToasts=await waitForToast(page,corruptToastStart,/could not load file:.*integrity/i);
  corruptState=await runtimeSnapshot(page);
  assert(JSON.stringify(corruptState)===JSON.stringify(restoredState),'corrupt file changed live or stored career/profile');
  assert(await page.locator('#accDlg').isHidden(),'corrupt file reached replacement confirmation');
  await page.screenshot({path:screenshotPath,fullPage:false});
  assertions.push({id:'one-byte-corruption-rejected',status:'PASS',detail:corruptToasts.join(' | ')});

  networkEvidence=await network.finalize('Stage 8 save transfer probe');
  assert(diagnostics.pageErrors.length===0,'page errors: '+diagnostics.pageErrors.join(' | '));
  assertions.push({id:'offline-and-page-clean',status:'PASS',detail:'no external requests or page errors'});
  await guard.checkpoint('browser save-transfer complete');
}catch(error){
  fatal=errorText(error);
  blocked=/VERIFICATION_FREEZE|SOURCE_WRITE_DURING_VERIFICATION|VERIFICATION_RECLAIM_ACTIVE/.test(fatal);
}
finally{
  if(context)try{await context.close();}catch(error){cleanupFailures.push('context: '+errorText(error));}
  if(browser)try{browserProvenance=await closePwBrowser(browser);}catch(error){cleanupFailures.push('browser: '+errorText(error));}
  if(server)try{await server.close();}catch(error){cleanupFailures.push('server: '+errorText(error));}
  if(guard){
    try{sourceAfter=await collectEvidenceIdentity({root});}catch(error){cleanupFailures.push('end fingerprint: '+errorText(error));}
    if(sourceBefore&&sourceAfter&&!sameIdentity(sourceBefore,sourceAfter))cleanupFailures.push('source identity changed during probe');
    try{await guard.checkpoint('final save-transfer evidence');}catch(error){cleanupFailures.push('workspace stability: '+errorText(error));}
    try{await guard.release();}catch(error){cleanupFailures.push('guard release: '+errorText(error));}
    guard=null;
  }
  const failures=[...(fatal?[fatal]:[]),...cleanupFailures];
  let screenshot=null;
  try{if(existsSync(screenshotPath))screenshot=await artifact(screenshotPath);}catch(error){failures.push('screenshot artifact: '+errorText(error));}
  const report={schema:'MassfrontStage8SaveTransferProbeV1',status:blocked?'BLOCKED':failures.length?'FAIL':'PASS',startedAt,
    completedAt:new Date().toISOString(),origin:server?.origin||null,viewport,gpu,
    source:{before:sourceBefore,after:sourceAfter,stable:!!sourceBefore&&!!sourceAfter&&sameIdentity(sourceBefore,sourceAfter)},
    browser:browserProvenance,network:networkEvidence||network?.snapshot?.()||null,
    fallbacks:{filePicker:'disabled',webShare:'disabled',nativeBridge:'disabled'},
    artifacts:{download:downloadInfo,corrupt:corruptInfo,screenshot},assertions,diagnostics,
    states:{seed:seedState,mutated:mutatedState,afterQuotaFailure:quotaState,afterRestore:restoredState,afterCorrupt:corruptState},
    failures};
  try{await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');}
  catch(error){failures.push('report write: '+errorText(error));}
  console.log(JSON.stringify({...report,reportPath},null,2));
  if(failures.length)process.exitCode=1;
}
