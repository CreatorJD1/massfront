#!/usr/bin/env node
/* Player-visible mobile proof for Standard's four-step First Contact guidance.
   The opening line has a first-battle and returning-battle variant, so both are
   measured even though each deployment still presents exactly four notices. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';
import { inspectPng } from './evidence-foundation/png-evidence.mjs';
import {
  collectSourceIdentity,
  enterRealBattle,
  installTelemetryInit,
  startStaticServer
} from './perf-lab/perf-probe-runner.mjs';

const verifierPath=fileURLToPath(import.meta.url);
const root=resolve(dirname(verifierPath),'..');
const tag=process.argv[2];
if(!tag||!/^[a-zA-Z0-9_-]+$/.test(tag))throw new Error('Unique evidence tag required');
const out=join(root,'.tmp','first-contact-notices',tag);
const report={schema:'massfront.first-contact-mobile.v1',tag,capturedAt:new Date().toISOString(),
  runtime:'source',viewport:{width:412,height:915,deviceScaleFactor:2},errors:[],screenshots:[]};
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
let freeze,server,browser,context,page,network;
try{
  freeze=await acquireVerificationFreeze({root,label:'First Contact mobile notices '+tag});
  await mkdir(out,{recursive:true});
  report.verifier={path:'tools/verify-first-contact-notices.mjs',sha256:await hash(verifierPath)};
  report.source=await collectSourceIdentity({sourceRuntime:true});
  report.mainBefore=await hash(join(root,'src/main.js'));
  server=await startStaticServer({sourceRuntime:true});report.url=server.url;
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
  context=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  network=await installTelemetryInit(page);
  await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:90000});
  report.gpu=await assertHardwareGpu(page);
  report.deployment=await enterRealBattle(page);
  /* enterRealBattle returns as soon as the clock is live, before the landing
     sequence's delayed BUILD GRID acknowledgement. Wait for that real rail
     event instead of assuming its wall-clock arrival under throttled capture. */
  await page.waitForFunction(()=>document.querySelector('#toast .mfNoticeText')?.textContent.includes('BUILD GRID'),
    null,{timeout:15000});
  await page.waitForTimeout(250);
  report.authored=await page.evaluate(()=>{
    if(typeof startFirstContactGuide!=='function'||typeof clearFirstContactGuide!=='function')
      throw new Error('First Contact guidance owner is unavailable');
    clearFirstContactGuide();
    const previousMatches=META.standardMatches,hasTraining=typeof TUT!=='undefined',
      previousTraining=hasTraining?TUT.trainingMode:false;
    const nativeSetTimeout=window.setTimeout,nativeToast=toast;
    function collect(standardMatches){
      const messages=[];
      META.standardMatches=standardMatches;if(hasTraining)TUT.trainingMode=false;
      toast=message=>messages.push(String(message));
      window.setTimeout=callback=>{callback();return 0;};
      try{startFirstContactGuide();}finally{clearFirstContactGuide();window.setTimeout=nativeSetTimeout;toast=nativeToast;}
      return messages;
    }
    const firstBattle=collect(0),returningBattle=collect(1);
    META.standardMatches=previousMatches;if(hasTraining)TUT.trainingMode=previousTraining;
    const nativeToastRestored=toast===nativeToast;
    /* Preserve an unambiguous handle to the real renderer, then sink unrelated
       live-game notices so they cannot race the five focused screenshots. */
    window.__mfFirstContactVerifierToast=nativeToast;
    toast=()=>{};
    return {firstBattle,returningBattle,nativeToastRestored};
  });
  assert.equal(report.authored.nativeToastRestored,true,'native toast renderer was not restored after message extraction');
  assert.equal(report.authored.firstBattle.length,4,'first Standard battle must schedule four guidance notices');
  assert.equal(report.authored.returningBattle.length,4,'returning Standard battle must schedule four guidance notices');
  assert.deepEqual(report.authored.returningBattle.slice(1),report.authored.firstBattle.slice(1),
    'only the opening notice may vary between early Standard battles');
  const messages=[report.authored.firstBattle[0],report.authored.returningBattle[0],...report.authored.firstBattle.slice(1)];
  assert.equal(new Set(messages).size,5,'expected two opening variants plus three shared notices');
  assert.ok(messages.every(message=>!/\*_medium|HUD pop|n\/500|\([^)]{4,}\)/i.test(message)),
    'player notices still expose debug tokens or duplicated parentheticals');
  /* Freeze simulation after the real deployment. Its independent landing and
     BUILD GRID notices must not replace the exact First Contact copy while we
     measure the shared command rail. */
  await page.evaluate(()=>{clearFirstContactGuide();running=false;paused=true;});
  report.sampleRenderer='isolated production notice director and base toast renderer';
  report.notices=[];
  for(let index=0;index<messages.length;index++){
    const message=messages[index];
    await page.evaluate(value=>{
      if(typeof mfNQ==='undefined'||typeof mfNLiveTimes==='undefined')
        throw new Error('Production notice director is unavailable');
      /* Typography fit is independent from the director's live-rate budget.
         Reset transient scheduling only, then exercise its real toast wrapper
         and base rail renderer for this exact authored sample. */
      clearTimeout(mfNDrainT);mfNDrainT=0;mfNQ.length=0;mfNKey='';mfNPri=99;
      mfNUntil=0;mfNCount=1;mfNRender=null;mfNHold=false;mfNUrgent=false;mfNLiveTimes.length=0;
      window.__mfFirstContactVerifierToast(value);
    },message);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const metrics=await page.evaluate(expected=>{
      const box=document.getElementById('toast'),copy=box?.querySelector('.mfNoticeText');
      if(!box||!copy)throw new Error('Command Notice rail did not render');
      if(copy.textContent!==expected)throw new Error('Command Notice rail was replaced during capture');
      const boxRect=box.getBoundingClientRect(),copyRect=copy.getBoundingClientRect(),style=getComputedStyle(copy);
      const range=document.createRange();range.selectNodeContents(copy);const ink=range.getBoundingClientRect();
      return {text:copy.textContent,box:{left:boxRect.left,right:boxRect.right,top:boxRect.top,bottom:boxRect.bottom,width:boxRect.width,height:boxRect.height},
        copy:{left:copyRect.left,right:copyRect.right,top:copyRect.top,bottom:copyRect.bottom,width:copyRect.width,height:copyRect.height,
          clientWidth:copy.clientWidth,scrollWidth:copy.scrollWidth,clientHeight:copy.clientHeight,scrollHeight:copy.scrollHeight},
        ink:{left:ink.left,right:ink.right,top:ink.top,bottom:ink.bottom},overflow:style.overflow,
        textOverflow:style.textOverflow,lineClamp:style.webkitLineClamp,
        horizontalFits:copy.scrollWidth<=copy.clientWidth+1&&ink.left>=copyRect.left-1&&ink.right<=copyRect.right+1,
        verticalFits:copy.scrollHeight<=copy.clientHeight+1&&ink.top>=copyRect.top-1&&ink.bottom<=copyRect.bottom+1,
        viewportFits:boxRect.left>=0&&boxRect.right<=innerWidth&&boxRect.top>=0&&boxRect.bottom<=innerHeight};
    },message);
    assert.equal(metrics.horizontalFits,true,`notice ${index+1} clips horizontally`);
    assert.equal(metrics.verticalFits,true,`notice ${index+1} exceeds its two-line rail`);
    assert.equal(metrics.viewportFits,true,`notice ${index+1} leaves the phone viewport`);
    assert.notEqual(metrics.textOverflow,'ellipsis',`notice ${index+1} uses ellipsis`);
    const screenshot=join(out,`${String(index+1).padStart(2,'0')}-notice.png`);
    await page.screenshot({path:screenshot});const png=await inspectPng(screenshot);
    assert.deepEqual([png.width,png.height],[824,1830],'DPR2 screenshot dimensions');
    report.screenshots.push({path:screenshot,sha256:await hash(screenshot),width:png.width,height:png.height});
    report.notices.push(metrics);
  }
  assert.deepEqual(report.notices.map(item=>item.text),messages,
    'captured notice sequence must exactly match the authored First Contact variants');
  assert.deepEqual(report.errors,[],'page errors: '+report.errors.join('\n'));
  report.networkIsolation=await network.finalize('First Contact mobile notices');network=null;
  report.mainAfter=await hash(join(root,'src/main.js'));
  assert.equal(report.mainAfter,report.mainBefore,'src/main.js changed during verification');
  await freeze.checkpoint('First Contact notice captures complete');
  report.status='PASS';
}catch(error){
  report.status='FAIL';report.failure=String(error.stack||error);process.exitCode=1;
  if(page){const path=join(out,'failure.png');await page.screenshot({path}).catch(()=>{});report.failureScreenshot=path;}
}finally{
  if(network)report.networkIsolation=await network.finalize('First Contact mobile notices').catch(error=>({error:error.message}));
  if(context)await context.close().catch(()=>{});if(browser)await closePwBrowser(browser).catch(()=>{});if(server)await server.close().catch(()=>{});
  if(freeze)await freeze.release({assertStable:true}).catch(error=>{report.status='FAIL';report.freezeError=error.message;process.exitCode=1;});
  await mkdir(out,{recursive:true});await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,out,notices:report.notices?.map(item=>({text:item.text,horizontalFits:item.horizontalFits,verticalFits:item.verticalFits})),failure:report.failure||null},null,2));
