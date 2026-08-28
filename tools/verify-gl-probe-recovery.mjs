#!/usr/bin/env node
/* WebGL2 diagnostic-probe / recovery regression gate.
   It deliberately uses one browser context and three same-origin pages:
   - first `?volfxprobe=1` gets the real hardware context;
   - second same-origin probe is blocked before canvas.getContext('webgl2');
   - after the first page closes, a new probe and a normal URL both boot again.
   The recovery portion is diagnostic-only: it re-enters the context-restored
   handler while its resource rebuild is in progress, proves it cannot run the
   rebuild or reload queue twice, preserves the player's prior pause intent,
   and proves timer-query telemetry can rebind to the same JS GL wrapper. */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PW_CDP_PORT ||= '9497'; // dedicated: never share the artist probe ports
const { launchPwBrowser, closePwBrowser } = await import('./pw-browser.mjs');

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'.tmp','gl-probe-recovery');
await mkdir(outDir,{recursive:true});
const reportPath=join(outDir,'report.json');
const viewport={width:900,height:900,deviceScaleFactor:1};
async function sha256(path){return createHash('sha256').update(await readFile(path)).digest('hex');}
const testedHashes={
  index:await sha256(join(root,'index.html')),
  recovery:await sha256(join(root,'src','glrecover.js')),
  perf:await sha256(join(root,'src','engine','perf.js')),
  verifier:await sha256(fileURLToPath(import.meta.url)),
  bundle:existsSync(join(root,'dist','massfront.html'))?await sha256(join(root,'dist','massfront.html')):null,
};
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav',
  '.glb':'model/gltf-binary','.webmanifest':'application/manifest+json','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
  try{
    let pathname=decodeURIComponent((req.url||'/').split('?')[0]);
    if(pathname==='/') pathname='/index.html';
    const file=resolve(join(root,pathname));
    if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('nf');return;}
    res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(await readFile(file));
  }catch(e){res.writeHead(500);res.end('server error');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const probeUrl=origin+'/?volfxprobe=1&mfProbeVerify=1';

const checks=[];
const captures=[],captureErrors=[];
let failures=0,unexpectedErrors=[],fatal=null;
let hardwareInfo=null;
function check(name,pass,evidence){
  checks.push({name,pass:!!pass,evidence});
  if(!pass) failures++;
  console.log((pass?'PASS ':'FAIL ')+name+' '+JSON.stringify(evidence));
}
function isSoftware(value){return /swiftshader|software|llvmpipe|lavapipe|microsoft basic render/i.test(String(value||''));}
async function capture(page,name){
  const path=join(outDir,name);
  try{await page.screenshot({path,type:'png',timeout:10000});captures.push(path);return path;}
  catch(error){captureErrors.push({name,error:String(error&&error.message||error)});return null;}
}
async function waitForHardwareBoot(page){
  await page.waitForFunction(()=>!!window.__MF_GL_INFO&&window.__MF_GL_INFO.webgl2===true&&
    window.__MF_GL_INFO.software===false&&window.__MF_GL_BOOT_FAILED!==true,null,{timeout:90000});
  return page.evaluate(()=>({info:window.__MF_GL_INFO,bootFailed:window.__MF_GL_BOOT_FAILED===true,
    lease:localStorage.getItem('massfront.fx-probe-lease.v1')}));
}
function trackErrors(page,label){
  page.on('pageerror',error=>{
    const message=String(error&&error.message||error);
    /* The blocked page intentionally throws out of the hard WebGL gate after
       it has put up a usable overlay. Its state is asserted separately. */
    if(label==='blocked'&&/MASSFRONT requires WebGL2/.test(message)) return;
    unexpectedErrors.push({label,message});
  });
}

const browser=await launchPwBrowser({headless:true});
let context=null;
try{
  context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},
    deviceScaleFactor:viewport.deviceScaleFactor,colorScheme:'dark'});
  const first=await context.newPage();
  trackErrors(first,'first-probe');
  await first.addInitScript(()=>{try{
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_auth_gate_v1','1');
    localStorage.setItem('mf_offline','1');
  }catch(e){}});
  await first.goto(probeUrl,{waitUntil:'domcontentloaded',timeout:60000});
  const firstBoot=await waitForHardwareBoot(first);
  hardwareInfo=firstBoot.info;
  await capture(first,'first-probe-hardware.png');
  const firstLease=firstBoot.lease?JSON.parse(firstBoot.lease):null;
  check('first diagnostic probe boots a hardware WebGL2 renderer',
    firstBoot.info.webgl2&&firstBoot.info.software===false&&!firstBoot.bootFailed&&!isSoftware(firstBoot.info.renderer),firstBoot);
  check('first diagnostic probe owns a renewable same-origin lease',
    !!firstLease&&typeof firstLease.token==='string'&&Number(firstLease.until)>Date.now(),firstLease);

  const blocked=await context.newPage();
  trackErrors(blocked,'blocked');
  await blocked.addInitScript(()=>{
    const native=HTMLCanvasElement.prototype.getContext;
    window.__mfProbeContextCalls=0;
    HTMLCanvasElement.prototype.getContext=function(kind,...args){
      if(String(kind).toLowerCase()==='webgl2') window.__mfProbeContextCalls++;
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

  /* Navigate away before closing so this test observes the real pagehide lease
     release instead of depending on Playwright's process-teardown timing. */
  await first.goto('about:blank',{waitUntil:'commit',timeout:15000});
  await blocked.waitForFunction(()=>!localStorage.getItem('massfront.fx-probe-lease.v1'),null,{timeout:5000});
  const released=await blocked.evaluate(()=>localStorage.getItem('massfront.fx-probe-lease.v1'));
  check('leaving the active probe releases its lease',released===null,released);
  await first.close();
  await blocked.close();

  const recovered=await context.newPage();
  trackErrors(recovered,'recovered-probe');
  await recovered.goto(probeUrl,{waitUntil:'domcontentloaded',timeout:60000});
  const recoveredBoot=await waitForHardwareBoot(recovered);
  check('a probe can boot again after the active tab closes',
    recoveredBoot.info.webgl2&&recoveredBoot.info.software===false&&!recoveredBoot.bootFailed,recoveredBoot);
  await capture(recovered,'recovered-probe-hardware.png');
  await recovered.waitForFunction(()=>typeof glrOnLost==='function'&&typeof glrOnRestored==='function',null,{timeout:30000});

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
      glrOnRestored();
      glrOnRestored();
      const restore={rebuilds,downs,prevented,perfResets,running,paused,lost:glrLost,
        rebuilding:glrRebuilding,giveup:glrGiveupQueued};
      window.setTimeout=()=>{scheduled++;return 1;};
      glrLost=true;glrGiveupQueued=false;
      glrGiveUp();glrGiveUp();
      const giveup={scheduled,giveup:glrGiveupQueued};
      glrLost=false;glrGiveupQueued=false;glrHide();
      const url=glrRecoveryURL();
      return {restore,giveup,url};
    }finally{
      glrRebuildResources=realRebuild;glrQualityDown=realDown;window.setTimeout=realTimeout;
      window.mfPerfGLReset=realPerfReset;
      running=oldRunning;paused=oldPaused;gameEnded=oldEnded;
      glrLost=false;glrRebuilding=false;glrGiveupQueued=false;glrHide();
    }
  });
  const recoveryUrl=new URL(recovery.url);
  check('duplicate/re-entrant restored notifications rebuild resources once',
    recovery.restore.rebuilds===1&&recovery.restore.prevented===1&&!recovery.restore.lost&&!recovery.restore.rebuilding&&!recovery.restore.giveup,recovery.restore);
  check('active match is paused during loss then resumes without changing running state',
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
  check('recovery owns and releases only an active match pause',
    pauseRecovery.active.during.running&&pauseRecovery.active.during.paused&&pauseRecovery.active.during.owned&&
    pauseRecovery.active.after.running&&!pauseRecovery.active.after.paused&&!pauseRecovery.active.after.lost&&!pauseRecovery.active.after.owned,
    pauseRecovery.active);
  check('a modal/already-paused match remains paused after graphics recovery',
    pauseRecovery.modal.during.running&&pauseRecovery.modal.during.paused&&!pauseRecovery.modal.during.owned&&
    pauseRecovery.modal.after.running&&pauseRecovery.modal.after.paused&&!pauseRecovery.modal.after.lost,
    pauseRecovery.modal);
  check('a non-running menu is not spuriously paused by graphics recovery',
    !pauseRecovery.menu.during.running&&!pauseRecovery.menu.during.paused&&!pauseRecovery.menu.during.owned&&
    !pauseRecovery.menu.after.running&&!pauseRecovery.menu.after.paused&&!pauseRecovery.menu.after.lost,
    pauseRecovery.menu);
  check('successive loss cycles resnapshot the current pause intent',
    pauseRecovery.again.during.owned&&pauseRecovery.again.during.paused&&
    !pauseRecovery.again.after.paused&&!pauseRecovery.again.after.owned,pauseRecovery.again);

  const perfRecovery=await recovered.evaluate(()=>{
    mfPerfEnable(true);mfPerfFrameBegin();
    const wrapper=gl,opened=mfPerfGpuBegin('recovery-reset-probe');
    if(opened) mfPerfGpuEnd();
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
  await recovered.close();

  const normal=await context.newPage();
  trackErrors(normal,'normal-after-probe');
  await normal.goto(origin+'/?mf_glreset=probe-guard-verify',{waitUntil:'domcontentloaded',timeout:60000});
  const normalBoot=await waitForHardwareBoot(normal);
  await capture(normal,'normal-after-probe.png');
  check('normal game URL remains a hardware-WebGL2 path after a probe recovery',
    normalBoot.info.webgl2&&normalBoot.info.software===false&&!normalBoot.bootFailed,normalBoot);
  await normal.close();

  const glSource=await readFile(join(root,'src','engine','gl.js'),'utf8');
  const glRecoverySource=await readFile(join(root,'src','glrecover.js'),'utf8');
  check('no query flag enables a software-renderer path',
    !glSource.includes('mfLocalSoftwarePreview')&&/if\(mfGL2IsSoftware\(g\)\) return null;/.test(glSource),
    'software renderer is rejected unconditionally by mfCreateWebGL2');
  check('the ordered restore rebuild explicitly resets perf timer queries',
    /step\('mfPerfGLReset',[\s\S]*?mfPerfGLReset\(\)/.test(glRecoverySource),
    'glrRebuildResources invokes mfPerfGLReset before rebuilding resources');
}catch(error){
  fatal=String(error&&error.stack||error);
  check('verifier completed without an unexpected runtime exception',false,fatal);
}finally{
  if(context) await context.close().catch(()=>{});
  await closePwBrowser().catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
  const report={when:new Date().toISOString(),origin,probeUrl,queryFlags:['volfxprobe=1','mfProbeVerify=1'],
    viewport,testedHashes,hardwareInfo,checks,unexpectedErrors,captureErrors,fatal,captures};
  if(unexpectedErrors.length){
    failures++;
    report.checks.push({name:'live probe pages report no unexpected errors',pass:false,evidence:unexpectedErrors});
  }else report.checks.push({name:'live probe pages report no unexpected errors',pass:true,evidence:[]});
  report.failures=failures;
  await writeFile(reportPath,JSON.stringify(report,null,2));
  console.log('report '+reportPath);
}
process.exit(failures?1:0);
