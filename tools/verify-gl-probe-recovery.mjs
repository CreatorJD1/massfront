#!/usr/bin/env node
/* WebGL2 diagnostic-probe / recovery acceptance gate.

   One isolated Chromium context exercises four same-origin pages:
   - first `?volfxprobe=1` gets the real hardware context;
   - second same-origin probe is blocked before canvas.getContext('webgl2');
   - after the first page closes, a new probe boots for the diagnostic-only
     re-entrancy, pause-intent and timer-query checks;
   - a normal URL then follows the real local-player UI through DEPLOY, starts
     an active match, and survives one real WEBGL_lose_context loss/restore
     cycle with owned pause, live RAF/simulation continuity, rebuilt resources
     and a non-empty rendered frame.

   Manual re-entrancy checks remain useful, but they are not substituted for
   the real driver event. Every page is isolated from non-loopback networking,
   the report is bound to the current source/runtime identity, and the checkout
   is frozen from quiet preflight through the final evidence checkpoint. */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectEvidenceIdentity, sha256File } from './evidence-foundation/fingerprints.mjs';
import { inspectPng } from './evidence-foundation/png-evidence.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';
import { installOfflineNetworkIsolation } from './offline-network-isolation.mjs';

process.env.PW_CDP_PORT ||= '9497'; // dedicated: never share the artist probe ports
const { launchPwBrowser, closePwBrowser } = await import('./pw-browser.mjs');

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const tmpRoot=join(root,'.tmp');
const outDir=join(tmpRoot,'gl-probe-recovery');
const reportPath=join(outDir,'report.json');
const viewport={width:900,height:900,deviceScaleFactor:1};
const captureNames=[
  'first-probe-hardware.png',
  'second-probe-blocked.png',
  'recovered-probe-hardware.png',
  'actual-context-lost.png',
  'actual-context-restored.png',
  'normal-after-probe.png'
];
const identityKeys=['gitHead','dirtyFingerprint','runtimeFingerprint','packageFingerprint','testedEntrySha256','testedPackageSha256'];
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav',
  '.glb':'model/gltf-binary','.webmanifest':'application/manifest+json','.wasm':'application/wasm'};

function inside(base,target){
  const rel=relative(base,target);
  return rel===''||(!rel.startsWith('..'+sep)&&rel!=='..');
}
function sameIdentity(a,b){return identityKeys.every(key=>a?.[key]===b?.[key]);}
function errorText(error){return String(error&&error.stack||error&&error.message||error);}
function isSoftware(value){return /swiftshader|software|llvmpipe|lavapipe|microsoft basic render/i.test(String(value||''));}
function offlineSnapshotPass(value){
  return !!value&&value.finalized===true&&value.pageClosed===true&&
    value.offlineStorage?.verified===true&&value.serviceWorkers?.bypassConfigured===true&&
    value.serviceWorkers?.verified===true&&value.blockedRequests?.length===0&&
    value.blockedWebSockets?.length===0;
}
async function writeJsonAtomic(path,value){
  const partial=path+`.partial-${process.pid}`;
  await writeFile(partial,JSON.stringify(value,null,2)+'\n','utf8');
  try{await rename(partial,path);}
  catch{await rm(path,{force:true});await rename(partial,path);}
}
async function prepareOutput(){
  if(!inside(tmpRoot,outDir)||relative(tmpRoot,outDir).split(sep).length!==1)
    throw new Error('REFUSED_UNBOUNDED_OUTPUT: '+outDir);
  await mkdir(outDir,{recursive:true});
  const declared=[...captureNames,'report.json'];
  let stalePartialsRemoved=0;
  for(const entry of await readdir(outDir,{withFileTypes:true})){
    if(!entry.isFile())continue;
    const base=declared.find(name=>entry.name===name||entry.name.startsWith(name+'.partial-'));
    if(!base)continue;
    await rm(join(outDir,entry.name),{force:true});
    if(entry.name!==base)stalePartialsRemoved++;
  }
  return {mode:'bounded-fixed-output',root:outDir,expectedArtifacts:[...captureNames],stalePartialsRemoved};
}
async function startServer(){
  const server=createServer(async(req,res)=>{
    try{
      let pathname=decodeURIComponent((req.url||'/').split('?')[0]);
      if(pathname==='/')pathname='/index.html';
      const file=resolve(join(root,pathname));
      if(!inside(root,file)||!existsSync(file)){res.writeHead(404);res.end('nf');return;}
      res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(await readFile(file));
    }catch{res.writeHead(500);res.end('server error');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return server;
}

const checks=[];
const captures=[];
const captureErrors=[];
const unexpectedErrors=[];
const expectedDiagnostics=[];
const networkPages=[];
const expectedForcedContextConsole='WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost';
const forcedContextConsole={active:false,label:'normal-after-probe',allowed:1,seen:0};
let failures=0;
function check(name,pass,evidence){
  checks.push({name,pass:!!pass,evidence});
  if(!pass)failures++;
  console.log((pass?'PASS ':'FAIL ')+name+' '+JSON.stringify(evidence));
}
function trackErrors(page,label){
  page.on('pageerror',error=>{
    const message=String(error&&error.message||error);
    /* The blocked page intentionally throws out of the hard WebGL gate after
       it has put up a usable overlay. Its state is asserted separately. */
    if(label==='blocked-probe'&&/MASSFRONT requires WebGL2/.test(message))return;
    unexpectedErrors.push({label,kind:'pageerror',message});
  });
  page.on('console',message=>{
    const body=message.text();
    if(message.type()!=='error')return;
    const row={label,kind:'console.error',message:body.slice(0,500)};
    if(forcedContextConsole.active&&label===forcedContextConsole.label&&body===expectedForcedContextConsole&&
      forcedContextConsole.seen<forcedContextConsole.allowed){
      forcedContextConsole.seen++;expectedDiagnostics.push(row);return;
    }
    unexpectedErrors.push(row);
  });
}
async function isolatedPage(context,label){
  const page=await context.newPage();
  const row={label,page,networkIsolation:null,snapshot:null,error:null,finalized:false};
  networkPages.push(row);
  trackErrors(page,label);
  row.networkIsolation=await installOfflineNetworkIsolation(page);
  await page.addInitScript(()=>{try{
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_auth_gate_v1','1');
  }catch{}});
  return row;
}
async function finalizeNetworkPage(row){
  if(!row||row.finalized)return row?.snapshot||null;
  try{
    if(!row.networkIsolation)throw new Error('OFFLINE_NETWORK_ISOLATION_NOT_INSTALLED: '+row.label);
    row.snapshot=await row.networkIsolation.finalize('GL recovery '+row.label);
  }catch(error){
    row.error=errorText(error);
    row.snapshot=row.networkIsolation?.snapshot?.()||{installed:false,finalized:false,pageClosed:!!row.page?.isClosed?.()};
    if(row.page&&!row.page.isClosed())await row.page.close().catch(()=>{});
  }
  row.finalized=true;
  return row.snapshot;
}
async function finalizeAllNetworkPages(){
  for(const row of networkPages)await finalizeNetworkPage(row);
}
async function capture(page,name){
  if(!captureNames.includes(name))throw new Error('REFUSED_UNDECLARED_CAPTURE: '+name);
  const path=join(outDir,name),partial=path+`.partial-${process.pid}`;
  try{
    const bytes=await page.screenshot({type:'png',timeout:10000});
    await writeFile(partial,bytes);
    try{await rename(partial,path);}
    catch{await rm(path,{force:true});await rename(partial,path);}
    const info=await inspectPng(path);
    const row={name,path,width:info.width,height:info.height,bytes:info.bytes,sha256:info.sha256};
    captures.push(row);return row;
  }catch(error){
    await rm(partial,{force:true}).catch(()=>{});
    captureErrors.push({name,error:errorText(error)});return null;
  }
}
async function waitForHardwareBoot(page){
  await page.waitForFunction(()=>!!window.__MF_GL_INFO&&window.__MF_GL_INFO.webgl2===true&&
    window.__MF_GL_INFO.software===false&&window.__MF_GL_BOOT_FAILED!==true,null,{timeout:90000});
  return page.evaluate(()=>({info:window.__MF_GL_INFO,bootFailed:window.__MF_GL_BOOT_FAILED===true,
    lease:localStorage.getItem('massfront.fx-probe-lease.v1')}));
}
async function visible(page,selector){return page.locator(selector).first().isVisible().catch(()=>false);}
async function clickVisible(page,selector,label,timeout=30000){
  const control=page.locator(selector).first();
  await control.waitFor({state:'visible',timeout});
  await control.click({timeout});
  await page.waitForTimeout(700);
  return label;
}
async function pressVisible(page,selector,label,timeout=30000){
  const control=page.locator(selector).first();
  await control.waitFor({state:'visible',timeout});
  await control.focus();await control.press('Enter');
  await page.waitForTimeout(700);
  return label;
}
async function enterLocalPlayerMatch(page){
  const route=[];
  await page.waitForFunction(()=>typeof bootConfirmed!=='undefined'&&bootConfirmed===true&&
    typeof resetWorld==='function'&&typeof matchLive!=='undefined'&&document.getElementById('startBtn'),null,{timeout:180000});
  await page.waitForFunction(()=>{
    const shown=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0;};
    return shown(document.getElementById('mfIntroStart'))||shown(document.getElementById('apOfflineBtn'))||
      shown(document.getElementById('apCloseBtn'))||shown(document.getElementById('startBtn'));
  },null,{timeout:90000});
  if(await visible(page,'#mfIntroStart'))route.push(await clickVisible(page,'#mfIntroStart','intro'));
  if(await visible(page,'#apOfflineBtn'))route.push(await clickVisible(page,'#apOfflineBtn','play-offline'));
  else if(await visible(page,'#apCloseBtn'))route.push(await clickVisible(page,'#apCloseBtn','close-account-gate'));
  route.push(await clickVisible(page,'#startBtn','war-room'));
  route.push(await clickVisible(page,'.warCard[data-mode="standard"]','standard-match'));

  const expectedStages=['galaxy','system','planet','region','deploy'],stages=[];
  for(let step=0;step<4;step++){
    const before=await page.evaluate(()=>({stage:typeof mfGalaxyStage!=='undefined'?mfGalaxyStage:null,
      label:(document.getElementById('setupStart')?.textContent||'').trim()}));
    stages.push(before);
    if(before.stage!==expectedStages[step])throw new Error('LOCAL_MATCH_STAGE_MISMATCH: '+JSON.stringify({step,before,expectedStages}));
    route.push(await clickVisible(page,'#setupStart','setup-'+before.stage,60000));
    await page.waitForFunction(stage=>typeof mfGalaxyStage!=='undefined'&&mfGalaxyStage===stage,
      expectedStages[step+1],{timeout:30000});
  }
  const deployStage=await page.evaluate(()=>({stage:mfGalaxyStage,
    label:(document.getElementById('setupStart')?.textContent||'').trim()}));
  stages.push(deployStage);
  if(deployStage.stage!=='deploy')throw new Error('LOCAL_MATCH_DEPLOY_STAGE_MISSING: '+JSON.stringify(deployStage));
  /* START BATTLE installs #loadScr during its activation; use the native
     keyboard path so Playwright does not retry a pointer gesture whose first
     attempt already replaced the target. */
  route.push(await pressVisible(page,'#setupStart','launch-battle',90000));
  await page.waitForFunction(()=>typeof running!=='undefined'&&running===true,null,{timeout:180000});
  await page.locator('#deployBtn').first().waitFor({state:'visible',timeout:180000});
  const beforeDeploy=await page.evaluate(()=>({running,paused,matchLive,
    stage:typeof mfGalaxyStage!=='undefined'?mfGalaxyStage:null,
    label:(document.getElementById('deployBtn')?.textContent||'').trim()}));
  /* Deploy deliberately commits on pointerdown and hides itself immediately.
     Its production keyboard binding is the stable exactly-once test path. */
  route.push(await pressVisible(page,'#deployBtn','deploy-local-player',30000));
  await page.waitForFunction(()=>typeof matchLive!=='undefined'&&matchLive===true&&running===true&&paused===false&&
    typeof stats!=='undefined'&&Number(stats.t)>0&&document.body.classList.contains('hudTacticalDock'),null,{timeout:60000});
  const state=await page.evaluate(()=>({
    running,paused,matchLive,simTime:Number(stats.t),playerFaction,
    hudTacticalDock:document.body.classList.contains('hudTacticalDock'),
    offline:localStorage.getItem('mf_offline')==='1'||localStorage.getItem('massfront_offline')==='1',
    probeRequested:new URL(location.href).searchParams.has('volfxprobe'),
    deployVisible:(()=>{const el=document.getElementById('deployBtn');if(!el)return false;
      const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;})()
  }));
  return {route,expectedStages,stages,beforeDeploy,state};
}

async function runActualContextRecovery(page){
  await page.waitForFunction(()=>typeof bootConfirmed!=='undefined'&&bootConfirmed===true&&
    typeof matchLive!=='undefined'&&matchLive===true&&typeof running!=='undefined'&&running===true&&
    typeof paused!=='undefined'&&paused===false&&typeof stats!=='undefined'&&Number(stats.t)>0&&
    typeof gl!=='undefined'&&gl&&!gl.isContextLost()&&typeof glEpoch==='number'&&glEpoch>0&&
    typeof prog3D!=='undefined'&&!!prog3D&&typeof progT!=='undefined'&&!!progT&&
    typeof terrVAO!=='undefined'&&!!terrVAO&&typeof terrVBO!=='undefined'&&!!terrVBO&&
    typeof terrIBO!=='undefined'&&!!terrIBO&&typeof terrainTex!=='undefined'&&!!terrainTex&&
    typeof atlasTex!=='undefined'&&!!atlasTex&&typeof render==='function'&&
    typeof glrOnLost==='function'&&typeof glrOnRestored==='function'&&
    !!gl.getExtension('WEBGL_lose_context'),null,{timeout:120000});

  const before=await page.evaluate(()=>{
    const ext=gl.getExtension('WEBGL_lose_context');
    if(!ext)throw new Error('WEBGL_lose_context unavailable');
    const quality=()=>typeof qualityKey==='function'?qualityKey():String(META?.settings?.quality||'unknown');
    const heightSignature=()=>{
      if(typeof heightF==='undefined'||!heightF)return null;
      let hash=2166136261>>>0;
      const step=Math.max(1,(heightF.length/257)|0);
      for(let i=0;i<heightF.length;i+=step){hash^=(heightF[i]*1000000)|0;hash=Math.imul(hash,16777619)>>>0;}
      return hash.toString(16).padStart(8,'0');
    };
    gl.finish();
    const preErrors=[];for(let i=0;i<16;i++){const value=gl.getError();if(value===gl.NO_ERROR)break;preErrors.push(value);}
    const state={lostEvents:0,restoredEvents:0,ext,heightSignature,rafFrames:0,rafId:0,monitorActive:true,
      lossObserved:null,restoreObserved:null,
      refs:{prog3D,progT,terrVAO,terrVBO,terrIBO,terrainTex,atlasTex},
      before:{epoch:glEpoch,quality:quality(),heightSignature:heightSignature(),
        running,paused,matchLive,simTime:Number(stats.t),rafFrames:0,
        programErrors:typeof GL_PROG_ERRORS!=='undefined'?GL_PROG_ERRORS.length:null,
        resources:{modelProgram:gl.isProgram(prog3D),terrainProgram:gl.isProgram(progT),
          modelLinked:!!gl.getProgramParameter(prog3D,gl.LINK_STATUS),terrainLinked:!!gl.getProgramParameter(progT,gl.LINK_STATUS),
          terrainVao:gl.isVertexArray(terrVAO),terrainVbo:gl.isBuffer(terrVBO),terrainIbo:gl.isBuffer(terrIBO),
          terrainTexture:gl.isTexture(terrainTex),atlasTexture:gl.isTexture(atlasTex),
          terrainFresh:typeof terrainStale==='function'?!terrainStale():null,
          terrainEpoch:typeof terrEpoch==='number'?terrEpoch:null,terrainHealTries:typeof terrHealTries==='number'?terrHealTries:null},
        preErrors}}
    ;
    const observe=()=>({atPerformanceMs:performance.now(),rafFrames:state.rafFrames,
      simTime:Number(stats.t),running:!!running,paused:!!paused,matchLive:!!matchLive,
      pauseOwned:!!glrPauseOwned,wasRunning:!!glrWasRunning,wasPaused:!!glrWasPaused});
    const pulse=()=>{state.rafFrames++;if(state.monitorActive)state.rafId=requestAnimationFrame(pulse);};
    state.rafId=requestAnimationFrame(pulse);
    const canvas=document.getElementById('gl');
    canvas.addEventListener('webglcontextlost',()=>{state.lostEvents++;state.lossObserved=observe();},true);
    canvas.addEventListener('webglcontextrestored',()=>{state.restoredEvents++;state.restoreObserved=observe();},true);
    window.__mfActualGLRecovery=state;
    ext.loseContext();
    return state.before;
  });

  await page.waitForFunction(()=>{
    const state=window.__mfActualGLRecovery,observed=state?.lossObserved;
    return state?.lostEvents===1&&observed&&state.rafFrames>=observed.rafFrames+3&&gl.isContextLost()&&
      typeof glrLost!=='undefined'&&glrLost===true;
  },null,{timeout:30000});
  const lost=await page.evaluate(()=>{
    const state=window.__mfActualGLRecovery,observed=state.lossObserved;
    const contextErrors=[];
    for(let i=0;i<16;i++){const value=gl.getError();if(value===gl.NO_ERROR)break;contextErrors.push(value);}
    return {
      lostEvents:state.lostEvents,restoredEvents:state.restoredEvents,lossObserved:observed,
      contextLost:gl.isContextLost(),glrLost,glrRebuilding,glrGiveupQueued,
      running,paused,matchLive,pauseOwned:glrPauseOwned,rafFrames:state.rafFrames,
      rafFramesAfterLoss:state.rafFrames-observed.rafFrames,
      simTime:Number(stats.t),simAdvancedDuringLoss:Number(stats.t)-observed.simTime,
      contextLostError:gl.CONTEXT_LOST_WEBGL,contextErrors,
      overlay:(document.getElementById('glrCard')||{}).textContent||''
    };
  });
  await capture(page,'actual-context-lost.png');
  await page.evaluate(()=>window.__mfActualGLRecovery.ext.restoreContext());
  await page.waitForFunction(()=>{
    const state=window.__mfActualGLRecovery,observed=state?.restoreObserved;
    return state&&state.restoredEvents===1&&observed&&!gl.isContextLost()&&glrLost===false&&!glrRebuilding&&
      glEpoch===state.before.epoch+1&&prog3D&&progT&&terrVAO&&terrVBO&&terrIBO&&terrainTex&&atlasTex&&
      running===true&&matchLive===true&&paused===false&&glrPauseOwned===false&&
      state.rafFrames>=observed.rafFrames+8&&Number(stats.t)>observed.simTime+1/30&&drawCalls>0&&triCount>0;
  },null,{timeout:120000});

  const after=await page.evaluate(()=>{
    const state=window.__mfActualGLRecovery;
    const quality=()=>typeof qualityKey==='function'?qualityKey():String(META?.settings?.quality||'unknown');
    const order=['cinematic','high','medium','low'];
    const index=order.indexOf(state.before.quality);
    const expectedQuality=index>=0&&index<order.length-1?order[index+1]:state.before.quality;
    const automatic={running,paused,matchLive,pauseOwned:glrPauseOwned,
      rafFrames:state.rafFrames,framesAfterRestore:state.rafFrames-state.restoreObserved.rafFrames,
      simTime:Number(stats.t),simAdvancedAfterRestore:Number(stats.t)-state.restoreObserved.simTime,
      drawCalls:typeof drawCalls==='number'?drawCalls:null,triangles:typeof triCount==='number'?triCount:null,
      lossObserved:state.lossObserved,restoreObserved:state.restoreObserved};
    const staleErrors=[];for(let i=0;i<16;i++){const value=gl.getError();if(value===gl.NO_ERROR)break;staleErrors.push(value);}
    let renderError=null;
    try{for(let i=0;i<4;i++)render(0);gl.finish();}catch(error){renderError=String(error&&error.stack||error);}
    const postErrors=[];for(let i=0;i<16;i++){const value=gl.getError();if(value===gl.NO_ERROR)break;postErrors.push(value);}
    const sampleW=Math.min(64,cv.width),sampleH=Math.min(64,cv.height);
    const pixels=new Uint8Array(sampleW*sampleH*4);
    gl.readPixels(Math.max(0,((cv.width-sampleW)/2)|0),Math.max(0,((cv.height-sampleH)/2)|0),
      sampleW,sampleH,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let n=0,mean=0,m2=0,nonZeroRgb=0;
    for(let i=0;i<pixels.length;i+=4){
      const value=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;
      const delta=value-mean;n++;mean+=delta/n;m2+=delta*(value-mean);
      if(pixels[i]||pixels[i+1]||pixels[i+2])nonZeroRgb++;
    }
    state.monitorActive=false;cancelAnimationFrame(state.rafId);
    return {lostEvents:state.lostEvents,restoredEvents:state.restoredEvents,
      contextLost:gl.isContextLost(),glrLost,glrRebuilding,glrGiveupQueued,
      epoch:glEpoch,quality:quality(),expectedQuality,heightSignature:state.heightSignature(),
      programErrorsAdded:typeof GL_PROG_ERRORS!=='undefined'&&state.before.programErrors!=null?
        GL_PROG_ERRORS.length-state.before.programErrors:null,
      resourceIdentityChanged:{modelProgram:state.refs.prog3D!==prog3D,terrainProgram:state.refs.progT!==progT,
        terrainVao:state.refs.terrVAO!==terrVAO,terrainVbo:state.refs.terrVBO!==terrVBO,
        terrainIbo:state.refs.terrIBO!==terrIBO,terrainTexture:state.refs.terrainTex!==terrainTex,
        atlasTexture:state.refs.atlasTex!==atlasTex},
      resources:{modelProgram:gl.isProgram(prog3D),terrainProgram:gl.isProgram(progT),
        modelLinked:!!gl.getProgramParameter(prog3D,gl.LINK_STATUS),terrainLinked:!!gl.getProgramParameter(progT,gl.LINK_STATUS),
        terrainVao:gl.isVertexArray(terrVAO),terrainVbo:gl.isBuffer(terrVBO),terrainIbo:gl.isBuffer(terrIBO),
        terrainTexture:gl.isTexture(terrainTex),atlasTexture:gl.isTexture(atlasTex),
        terrainFresh:typeof terrainStale==='function'?!terrainStale():null,
        terrainEpoch:typeof terrEpoch==='number'?terrEpoch:null,terrainHealTries:typeof terrHealTries==='number'?terrHealTries:null,
        currentProgramIsModel:gl.getParameter(gl.CURRENT_PROGRAM)===prog3D,
        framebufferIsDefault:gl.getParameter(gl.FRAMEBUFFER_BINDING)===null,
        viewport:Array.from(gl.getParameter(gl.VIEWPORT)),terrainIndices:typeof terrIdxCount==='number'?terrIdxCount:null},
      automatic,render:{error:renderError,staleErrors,postErrors,drawCalls:typeof drawCalls==='number'?drawCalls:null,
        triangles:typeof triCount==='number'?triCount:null,readback:{width:sampleW,height:sampleH,variance:n>1?m2/(n-1):0,nonZeroRgb,n}}};
  });
  await capture(page,'actual-context-restored.png');
  return {before,lost,after};
}

async function main(){
  let guard=null,server=null,browser=null,context=null;
  let sourceBefore=null,sourceAfter=null,hardwareInfo=null,productionMatch=null,actualRecovery=null,fatal=null;
  let outputPreparation=null,testedHashes=null,guardReleased=false,origin=null,probeUrl=null;
  try{
    guard=await acquireVerificationFreeze({root,label:'Stage 8 GL probe and recovery acceptance',
      quietMs:Number(process.env.MF_QUIET_PREFLIGHT_MS||15000),allowedPaths:[outDir]});
    outputPreparation=await prepareOutput();
    sourceBefore=await collectEvidenceIdentity({root});
    testedHashes={
      index:await sha256File(join(root,'index.html')),
      main:await sha256File(join(root,'src','main.js')),
      recovery:await sha256File(join(root,'src','glrecover.js')),
      perf:await sha256File(join(root,'src','engine','perf.js')),
      verifier:await sha256File(fileURLToPath(import.meta.url)),
      bundle:existsSync(join(root,'dist','massfront.html'))?await sha256File(join(root,'dist','massfront.html')):null
    };
    server=await startServer();
    origin='http://127.0.0.1:'+server.address().port;
    probeUrl=origin+'/?volfxprobe=1&mfProbeVerify=1';
    browser=await launchPwBrowser({headless:true});
    context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},
      deviceScaleFactor:viewport.deviceScaleFactor,colorScheme:'dark',hasTouch:true,serviceWorkers:'block'});

    const firstRow=await isolatedPage(context,'first-probe'),first=firstRow.page;
    await first.goto(probeUrl,{waitUntil:'domcontentloaded',timeout:60000});
    const firstBoot=await waitForHardwareBoot(first);
    hardwareInfo=firstBoot.info;
    await capture(first,'first-probe-hardware.png');
    const firstLease=firstBoot.lease?JSON.parse(firstBoot.lease):null;
    check('first diagnostic probe boots a hardware WebGL2 renderer',
      firstBoot.info.webgl2&&firstBoot.info.software===false&&!firstBoot.bootFailed&&!isSoftware(firstBoot.info.renderer),firstBoot);
    check('first diagnostic probe owns a renewable same-origin lease',
      !!firstLease&&typeof firstLease.token==='string'&&Number(firstLease.until)>Date.now(),firstLease);

    const blockedRow=await isolatedPage(context,'blocked-probe'),blocked=blockedRow.page;
    await blocked.addInitScript(()=>{
      const native=HTMLCanvasElement.prototype.getContext;
      window.__mfProbeContextCalls=0;
      HTMLCanvasElement.prototype.getContext=function(kind,...args){
        if(String(kind).toLowerCase()==='webgl2')window.__mfProbeContextCalls++;
        return native.call(this,kind,...args);
      };
    });
    await blocked.goto(probeUrl,{waitUntil:'domcontentloaded',timeout:60000});
    await blocked.waitForFunction(()=>window.__MF_GL_PROBE_BLOCKED===true&&window.__MF_GL_BOOT_FAILED===true&&
      !!document.getElementById('glLostOverlay'),null,{timeout:15000});
    const blockedState=await blocked.evaluate(()=>({blocked:window.__MF_GL_PROBE_BLOCKED===true,
      bootFailed:window.__MF_GL_BOOT_FAILED===true,webglCalls:window.__mfProbeContextCalls||0,
      hasInfo:!!window.__MF_GL_INFO,overlay:(document.getElementById('glLostOverlay')||{}).textContent||''}));
    await capture(blocked,'second-probe-blocked.png');
    check('second same-origin probe is stopped before WebGL2 allocation',
      blockedState.blocked&&blockedState.bootFailed&&blockedState.webglCalls===0&&!blockedState.hasInfo,blockedState);
    check('blocked diagnostic route explains the active-probe condition',/FX PROBE ALREADY ACTIVE/.test(blockedState.overlay),blockedState.overlay.trim());

    /* Closing through the offline guard still dispatches pagehide, so it tests
       the real lease-release path without navigating away from the page whose
       offline and service-worker state must be verified. */
    await finalizeNetworkPage(firstRow);
    await blocked.waitForFunction(()=>!localStorage.getItem('massfront.fx-probe-lease.v1'),null,{timeout:5000});
    const released=await blocked.evaluate(()=>localStorage.getItem('massfront.fx-probe-lease.v1'));
    check('leaving the active probe releases its lease',released===null,released);
    await finalizeNetworkPage(blockedRow);

    const recoveredRow=await isolatedPage(context,'recovered-probe'),recovered=recoveredRow.page;
    await recovered.goto(probeUrl,{waitUntil:'domcontentloaded',timeout:60000});
    const recoveredBoot=await waitForHardwareBoot(recovered);
    check('a probe can boot again after the active tab closes',
      recoveredBoot.info.webgl2&&recoveredBoot.info.software===false&&!recoveredBoot.bootFailed,recoveredBoot);
    await capture(recovered,'recovered-probe-hardware.png');
    /* __MF_GL_INFO is published by the first-phase gl.js gate. The recovery
       implementation and main state arrive roughly eighty classic scripts
       later, so wait for every binding the internal harness touches instead
       of racing the remainder of boot. */
    await recovered.waitForFunction(()=>typeof bootConfirmed!=='undefined'&&bootConfirmed===true&&
      typeof glrRebuildResources==='function'&&typeof glrQualityDown==='function'&&
      typeof glrOnLost==='function'&&typeof glrOnRestored==='function'&&
      typeof glrGiveUp==='function'&&typeof glrRecoveryURL==='function'&&typeof glrHide==='function'&&
      typeof mfPerfGLReset==='function'&&typeof running!=='undefined'&&typeof paused!=='undefined'&&
      typeof gameEnded!=='undefined',null,{timeout:180000});

    const recovery=await recovered.evaluate(()=>{
      const realRebuild=glrRebuildResources,realDown=glrQualityDown,realTimeout=window.setTimeout;
      const realPerfReset=window.mfPerfGLReset;
      const oldRunning=running,oldPaused=paused,oldEnded=gameEnded;
      let rebuilds=0,downs=0,scheduled=0,prevented=0,perfResets=0;
      try{
        running=true;paused=false;gameEnded=false;
        window.mfPerfGLReset=()=>{perfResets++;return realPerfReset();};
        glrRebuildResources=()=>{rebuilds++;glrOnRestored();return true;};
        glrQualityDown=()=>{downs++;return null;};
        glrOnLost({preventDefault(){prevented++;}});
        glrOnRestored();glrOnRestored();
        const restore={rebuilds,downs,prevented,perfResets,running,paused,lost:glrLost,
          rebuilding:glrRebuilding,giveup:glrGiveupQueued};
        window.setTimeout=()=>{scheduled++;return 1;};
        glrLost=true;glrGiveupQueued=false;
        glrGiveUp();glrGiveUp();
        const giveup={scheduled,giveup:glrGiveupQueued};
        glrLost=false;glrGiveupQueued=false;glrHide();
        return {restore,giveup,url:glrRecoveryURL()};
      }finally{
        glrRebuildResources=realRebuild;glrQualityDown=realDown;window.setTimeout=realTimeout;
        window.mfPerfGLReset=realPerfReset;
        running=oldRunning;paused=oldPaused;gameEnded=oldEnded;
        glrLost=false;glrRebuilding=false;glrGiveupQueued=false;glrHide();
      }
    });
    const recoveryUrl=new URL(recovery.url);
    check('duplicate/re-entrant restored notifications rebuild resources once',
      recovery.restore.rebuilds===1&&recovery.restore.prevented===1&&!recovery.restore.lost&&
      !recovery.restore.rebuilding&&!recovery.restore.giveup,recovery.restore);
    check('manual re-entrancy harness preserves the active running state',
      recovery.restore.running===true&&recovery.restore.paused===false&&recovery.restore.perfResets===1,recovery.restore);
    check('give-up queues exactly one reload action',recovery.giveup.scheduled===1&&recovery.giveup.giveup,recovery.giveup);
    check('failed probe recovery strips only diagnostic probe flags',
      !recoveryUrl.searchParams.has('volfxprobe')&&!recoveryUrl.searchParams.has('fxprobe')&&
      recoveryUrl.searchParams.get('mfProbeVerify')==='1'&&recoveryUrl.searchParams.has('mf_glreset'),recovery.url);

    const pauseRecovery=await recovered.evaluate(()=>{
      const realRebuild=glrRebuildResources,realDown=glrQualityDown;
      const oldRunning=running,oldPaused=paused,oldEnded=gameEnded;
      function cycle(startRunning,startPaused){
        clearInterval(glrTick);glrLost=false;glrRebuilding=false;glrGiveupQueued=false;
        glrWasRunning=false;glrWasPaused=false;glrPauseOwned=false;
        running=startRunning;paused=startPaused;gameEnded=false;
        let prevented=0;
        glrOnLost({preventDefault(){prevented++;}});
        const during={running,paused,owned:glrPauseOwned,prevented};
        glrOnRestored();
        return {during,after:{running,paused,lost:glrLost,owned:glrPauseOwned}};
      }
      try{
        glrRebuildResources=()=>true;glrQualityDown=()=>null;
        return {active:cycle(true,false),modal:cycle(true,true),menu:cycle(false,false),again:cycle(true,false)};
      }finally{
        glrRebuildResources=realRebuild;glrQualityDown=realDown;
        running=oldRunning;paused=oldPaused;gameEnded=oldEnded;
        clearInterval(glrTick);glrLost=false;glrRebuilding=false;glrGiveupQueued=false;
        glrWasRunning=false;glrWasPaused=false;glrPauseOwned=false;glrHide();
      }
    });
    check('manual pause matrix owns and releases only an active-match pause',
      pauseRecovery.active.during.running&&pauseRecovery.active.during.paused&&pauseRecovery.active.during.owned&&
      pauseRecovery.active.after.running&&!pauseRecovery.active.after.paused&&!pauseRecovery.active.after.lost&&
      !pauseRecovery.active.after.owned,pauseRecovery.active);
    check('a modal/already-paused match remains paused after graphics recovery',
      pauseRecovery.modal.during.running&&pauseRecovery.modal.during.paused&&!pauseRecovery.modal.during.owned&&
      pauseRecovery.modal.after.running&&pauseRecovery.modal.after.paused&&!pauseRecovery.modal.after.lost,pauseRecovery.modal);
    check('a non-running menu is not spuriously paused by graphics recovery',
      !pauseRecovery.menu.during.running&&!pauseRecovery.menu.during.paused&&!pauseRecovery.menu.during.owned&&
      !pauseRecovery.menu.after.running&&!pauseRecovery.menu.after.paused&&!pauseRecovery.menu.after.lost,pauseRecovery.menu);
    check('successive loss cycles resnapshot the current pause intent',
      pauseRecovery.again.during.owned&&pauseRecovery.again.during.paused&&
      !pauseRecovery.again.after.paused&&!pauseRecovery.again.after.owned,pauseRecovery.again);

    const perfRecovery=await recovered.evaluate(()=>{
      mfPerfEnable(true);mfPerfFrameBegin();
      const wrapper=gl,opened=mfPerfGpuBegin('recovery-reset-probe');
      if(opened)mfPerfGpuEnd();
      const before=mfPerfSnapshot();
      const resetReturn=mfPerfGLReset(),cleared=mfPerfSnapshot();
      mfPerfFrameBegin();
      const rebound=mfPerfSnapshot();
      return {sameWrapper:wrapper===gl,opened,resetReturn,before,cleared,rebound};
    });
    check('perf reset atomically discards context-owned timer-query state',
      (!perfRecovery.before.gpuTimer||perfRecovery.opened&&perfRecovery.before.gpuQueued===1)&&
      perfRecovery.cleared.gpuResetSerial===perfRecovery.before.gpuResetSerial+1&&
      perfRecovery.cleared.gpuAttached===false&&perfRecovery.cleared.gpuQueued===0&&
      perfRecovery.cleared.gpuOpen===false,perfRecovery);
    check('perf telemetry rebinds after reset even when the JS gl wrapper is unchanged',
      perfRecovery.sameWrapper&&perfRecovery.rebound.gpuAttached===true&&
      perfRecovery.rebound.gpuBindSerial===perfRecovery.before.gpuBindSerial+1&&
      perfRecovery.rebound.gpuTimer===perfRecovery.before.gpuTimer,perfRecovery);
    await finalizeNetworkPage(recoveredRow);

    const normalRow=await isolatedPage(context,'normal-after-probe'),normal=normalRow.page;
    await normal.goto(origin+'/?mf_glreset=probe-guard-verify',{waitUntil:'domcontentloaded',timeout:60000});
    const normalBoot=await waitForHardwareBoot(normal);
    check('normal game URL remains a hardware-WebGL2 path after a probe recovery',
      normalBoot.info.webgl2&&normalBoot.info.software===false&&!normalBoot.bootFailed,normalBoot);
    productionMatch=await enterLocalPlayerMatch(normal);
    check('normal local-player UI traverses GALAXY through DEPLOY into one active match',
      JSON.stringify(productionMatch.stages.map(row=>row.stage))===JSON.stringify(productionMatch.expectedStages)&&
      productionMatch.route.includes('war-room')&&productionMatch.route.includes('standard-match')&&
      productionMatch.route.includes('launch-battle')&&productionMatch.route.includes('deploy-local-player')&&
      productionMatch.beforeDeploy.stage==='deploy'&&productionMatch.beforeDeploy.running&&
      productionMatch.state.running&&productionMatch.state.matchLive&&!productionMatch.state.paused&&
      productionMatch.state.hudTacticalDock&&productionMatch.state.offline&&!productionMatch.state.probeRequested,
      productionMatch);
    await capture(normal,'normal-after-probe.png');

    forcedContextConsole.active=true;
    try{actualRecovery=await runActualContextRecovery(normal);}
    finally{forcedContextConsole.active=false;}
    check('real active-match loss owns the pause while RAF continues and simulation stays held',
      actualRecovery.before.running&&!actualRecovery.before.paused&&actualRecovery.before.matchLive&&
      actualRecovery.lost.lostEvents===1&&actualRecovery.lost.restoredEvents===0&&
      actualRecovery.lost.contextLost&&actualRecovery.lost.glrLost&&!actualRecovery.lost.glrGiveupQueued&&
      actualRecovery.lost.running&&actualRecovery.lost.paused&&actualRecovery.lost.matchLive&&actualRecovery.lost.pauseOwned&&
      actualRecovery.lost.lossObserved.running&&actualRecovery.lost.lossObserved.paused&&
      actualRecovery.lost.lossObserved.matchLive&&actualRecovery.lost.lossObserved.pauseOwned&&
      actualRecovery.lost.lossObserved.wasRunning&&!actualRecovery.lost.lossObserved.wasPaused&&
      actualRecovery.lost.rafFramesAfterLoss>=3&&Math.abs(actualRecovery.lost.simAdvancedDuringLoss)<1e-9&&
      actualRecovery.lost.contextErrors.every(value=>value===actualRecovery.lost.contextLostError)&&
      /GRAPHICS PAUSED/.test(actualRecovery.lost.overlay),
      {before:actualRecovery.before,lost:actualRecovery.lost});
    check('real context restoration rebuilds fresh linked programs, terrain buffers and textures',
      actualRecovery.after.restoredEvents===1&&!actualRecovery.after.contextLost&&!actualRecovery.after.glrLost&&
      !actualRecovery.after.glrRebuilding&&!actualRecovery.after.glrGiveupQueued&&
      actualRecovery.after.epoch===actualRecovery.before.epoch+1&&
      Object.values(actualRecovery.after.resourceIdentityChanged).every(Boolean)&&
      Object.entries(actualRecovery.after.resources).filter(([name])=>
        ['modelProgram','terrainProgram','modelLinked','terrainLinked','terrainVao','terrainVbo','terrainIbo','terrainTexture','atlasTexture','terrainFresh'].includes(name))
        .every(([,value])=>value===true)&&
      actualRecovery.after.resources.terrainEpoch===actualRecovery.after.epoch&&
      actualRecovery.after.resources.terrainHealTries===0,
      {before:actualRecovery.before,after:actualRecovery.after});
    check('the restored active match automatically resumes RAF, simulation and renderer ownership',
      actualRecovery.after.automatic.running&&!actualRecovery.after.automatic.paused&&
      actualRecovery.after.automatic.matchLive&&!actualRecovery.after.automatic.pauseOwned&&
      actualRecovery.after.automatic.restoreObserved.running&&!actualRecovery.after.automatic.restoreObserved.paused&&
      actualRecovery.after.automatic.restoreObserved.matchLive&&!actualRecovery.after.automatic.restoreObserved.pauseOwned&&
      actualRecovery.after.automatic.framesAfterRestore>=8&&
      actualRecovery.after.automatic.simAdvancedAfterRestore>1/30&&
      actualRecovery.after.automatic.drawCalls>0&&actualRecovery.after.automatic.triangles>0,
      actualRecovery.after.automatic);
    check('real context restoration preserves CPU terrain and applies the designed one-step quality fallback',
      actualRecovery.after.heightSignature===actualRecovery.before.heightSignature&&
      actualRecovery.after.quality===actualRecovery.after.expectedQuality,
      {before:{heightSignature:actualRecovery.before.heightSignature,quality:actualRecovery.before.quality},
        after:{heightSignature:actualRecovery.after.heightSignature,quality:actualRecovery.after.quality,
          expectedQuality:actualRecovery.after.expectedQuality}});
    check('the restored renderer presents a non-empty error-free frame with the expected 3D program',
      actualRecovery.before.preErrors.length===0&&!actualRecovery.after.render.error&&
      actualRecovery.after.render.staleErrors.length===0&&actualRecovery.after.render.postErrors.length===0&&
      actualRecovery.after.programErrorsAdded===0&&actualRecovery.after.resources.currentProgramIsModel&&
      actualRecovery.after.resources.framebufferIsDefault&&actualRecovery.after.resources.terrainIndices>0&&
      actualRecovery.after.render.drawCalls>0&&actualRecovery.after.render.triangles>0&&
      actualRecovery.after.render.readback.nonZeroRgb>64&&actualRecovery.after.render.readback.variance>0.1,
      {resources:actualRecovery.after.resources,render:actualRecovery.after.render,
        programErrorsAdded:actualRecovery.after.programErrorsAdded});
    check('forced context-loss console suppression is exact and bounded to at most one event',
      !forcedContextConsole.active&&forcedContextConsole.seen<=forcedContextConsole.allowed,
      {expectedText:expectedForcedContextConsole,...forcedContextConsole});
    await finalizeNetworkPage(normalRow);

    const glSource=await readFile(join(root,'src','engine','gl.js'),'utf8');
    const glRecoverySource=await readFile(join(root,'src','glrecover.js'),'utf8');
    check('no query flag enables a software-renderer path',
      !glSource.includes('mfLocalSoftwarePreview')&&/if\(mfGL2IsSoftware\(g\)\) return null;/.test(glSource),
      'software renderer is rejected unconditionally by mfCreateWebGL2');
    check('the ordered restore rebuild explicitly resets perf timer queries',
      /step\('mfPerfGLReset',[\s\S]*?mfPerfGLReset\(\)/.test(glRecoverySource),
      'glrRebuildResources invokes mfPerfGLReset before rebuilding resources');

    await guard.checkpoint('GL recovery browser path complete');
  }catch(error){
    fatal=errorText(error);
    check('verifier completed without an unexpected runtime exception',false,fatal);
  }finally{
    await finalizeAllNetworkPages();
    if(context)await context.close().catch(()=>{});
    await closePwBrowser().catch(()=>{});
    if(server){try{server.closeAllConnections();}catch{}await new Promise(resolve=>server.close(resolve));}
  }

  const networkEvidence=networkPages.map(row=>({label:row.label,error:row.error,snapshot:row.snapshot}));
  check('all four browser pages remain offline and service-worker isolated through shutdown',
    networkEvidence.length===4&&networkEvidence.every(row=>!row.error&&offlineSnapshotPass(row.snapshot)),networkEvidence);
  check('live probe pages report no unexpected errors',unexpectedErrors.length===0,unexpectedErrors);
  check('all declared PNG captures completed without capture errors',
    captures.length===captureNames.length&&captureErrors.length===0&&captureNames.every(name=>captures.some(row=>row.name===name)),
    {expected:captureNames,captured:captures.map(row=>row.name),captureErrors});

  let artifactValidation=[];
  try{
    artifactValidation=await Promise.all(captures.map(async row=>{
      const current=await inspectPng(row.path);
      return {name:row.name,path:row.path,sha256:current.sha256,width:current.width,height:current.height,bytes:current.bytes,
        hashStable:current.sha256===row.sha256,dimensionsStable:current.width===viewport.width*viewport.deviceScaleFactor&&
          current.height===viewport.height*viewport.deviceScaleFactor};
    }));
    check('capture artifacts remain present, hashed and viewport-sized at finalization',
      artifactValidation.length===captureNames.length&&artifactValidation.every(row=>row.hashStable&&row.dimensionsStable),artifactValidation);
  }catch(error){
    check('capture artifacts remain present, hashed and viewport-sized at finalization',false,errorText(error));
  }

  if(guard){
    try{await guard.checkpoint('before completion source identity');sourceAfter=await collectEvidenceIdentity({root});}
    catch(error){check('completion source identity is readable under the verification freeze',false,errorText(error));}
    const identityStable=sameIdentity(sourceBefore,sourceAfter);
    check('source, dirty worktree, runtime and tested package identities stay stable',identityStable,
      {before:sourceBefore,after:sourceAfter});
    const report={
      schema:'massfront.gl-probe-recovery/v3',generatedAt:new Date().toISOString(),root,origin,probeUrl,
      queryFlags:['volfxprobe=1','mfProbeVerify=1'],viewport,outputPreparation,
      machineOutcome:'PENDING_FINAL_RELEASE',sourceIdentity:{before:sourceBefore,after:sourceAfter,stable:identityStable},
      workspaceGuard:{branch:guard.branch,head:guard.head,freezePath:guard.freezePath,quietMs:guard.quietMs,released:false},
      testedHashes,hardwareInfo,productionMatch,actualRecovery,checks,unexpectedErrors,expectedDiagnostics,
      forcedContextConsole:{expectedText:expectedForcedContextConsole,...forcedContextConsole},captureErrors,
      captures:artifactValidation,networkIsolation:networkEvidence,fatal,failures
    };
    try{await guard.checkpoint('before provisional GL recovery report');await writeJsonAtomic(reportPath,report);}
    catch(error){check('provisional GL recovery report is written under the freeze',false,errorText(error));}
    try{
      await guard.release({assertStable:true,name:'Stage 8 GL recovery final release'});
      guardReleased=true;
    }catch(error){check('verification freeze releases only after a stable final checkpoint',false,errorText(error));}
    report.workspaceGuard.released=guardReleased;
    report.machineOutcome=failures===0&&guardReleased?'PASS':'FAIL';
    report.failures=failures;
    report.checks=checks;
    try{await writeJsonAtomic(reportPath,report);}
    catch(error){console.error('FINAL_REPORT_WRITE_FAILED '+errorText(error));failures++;}
    console.log('report '+reportPath);
  }
  process.exit(failures?1:0);
}

main().catch(error=>{console.error(errorText(error));process.exit(1);});
