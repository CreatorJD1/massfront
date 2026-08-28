#!/usr/bin/env node
/* Focused hardware-GPU proof for the High/Cinematic cloud post path. This is a
   controlled synthetic camera/weather probe inside a real UI-deployed match;
   it does not qualify as target-phone performance evidence. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { ANDROID_S25_USER_AGENT, S25_VIEWPORT, assertMobileGpuBranch } from './mobile-device-profile.mjs';
import { startStaticServer, installTelemetryInit, applyPreset, enterRealBattle } from './perf-lab/perf-probe-runner.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const OUT=join(ROOT,'tmp','cloud-postfx');
await mkdir(OUT,{recursive:true});
const server=await startStaticServer();
const browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
const errors=[];
let result=null;
try{
  const page=await browser.newPage({
    viewport:{width:S25_VIEWPORT.width,height:S25_VIEWPORT.height},
    deviceScaleFactor:S25_VIEWPORT.dpr,hasTouch:true,isMobile:true,userAgent:ANDROID_S25_USER_AGENT
  });
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
  await installTelemetryInit(page);
  await page.goto(server.url+'?cloudpostprobe=1',{waitUntil:'domcontentloaded',timeout:90000});
  const gpu=await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof spawnUnit==='function'&&typeof MFCloudPost==='object',null,{timeout:90000});
  const mobile=await page.evaluate(()=>({ua:navigator.userAgent,mobileGpu:typeof MF_MOBILE_GPU==='boolean'?MF_MOBILE_GPU:null}));
  assertMobileGpuBranch(mobile.mobileGpu,mobile.ua,'test-cloud-postfx');
  await applyPreset(page,'cinematic');
  const deployment=await enterRealBattle(page);
  await page.evaluate(()=>{
    if(typeof perfScale==='number')perfScale=.85;
    /* Controlled visual probe: reveal terrain under deterministic weather so
       the screenshot judges cloud/world integration rather than black FOW. */
    if(typeof fogOn==='boolean')fogOn=false;
    MFCloudPost.probe(true);
  });

  const captures=[];
  for(const [name,span] of [['tactical',900],['high-altitude',1700],['orbital',3400]]){
    const target=await page.evaluate(s=>{
      const sample=MFCloudFx.sample({time:stats.t,quality:'cinematic',perfScale:.85,mapSize:MAP,mapId:curMap,
        seed:MAPDEFS[curMap]&&MAPDEFS[curMap].seed,daylight:1});
      const body=sample.find(L=>L.kind==='body'&&L.depth===1&&L.x>100&&L.x<MAP-100&&L.y>100&&L.y<MAP-100)||sample.find(L=>L.kind==='body'&&L.depth===1);
      if(body){cam.x=Math.max(0,Math.min(MAP,body.x));cam.y=Math.max(0,Math.min(MAP,body.y));}
      orthoSpan=s;if(typeof distTarget==='number')distTarget=s;
      return body?{x:body.x,y:body.y,size:body.size}:null;
    },span);
    await page.waitForTimeout(1600);
    const path=join(OUT,`${name}.png`);await page.screenshot({path});
    const sha256=createHash('sha256').update(await readFile(path)).digest('hex');
    captures.push({name,span,actualSpan:await page.evaluate(()=>orthoSpan),path,sha256,target,probe:await page.evaluate(()=>MFCloudPost.probe())});
  }

  /* Matched implementation/fallback captures. Same camera and simulation;
     only the presentation backend changes for a few render frames. */
  await page.evaluate(()=>{orthoSpan=900;if(typeof distTarget==='number')distTarget=900;MFCloudPost.setFail('');});
  await page.waitForTimeout(500);
  for(const [name,mode] of [['comparison-post',''],['comparison-billboard','queue']]){
    await page.evaluate(m=>MFCloudPost.setFail(m),mode);await page.waitForTimeout(120);
    const path=join(OUT,`${name}.png`);await page.screenshot({path});
    captures.push({name,span:900,actualSpan:await page.evaluate(()=>orthoSpan),path,
      sha256:createHash('sha256').update(await readFile(path)).digest('hex'),target:'matched-camera',probe:await page.evaluate(()=>MFCloudPost.probe())});
  }
  await page.evaluate(()=>MFCloudPost.setFail(''));

  const cinematicLodProbe=await page.evaluate(()=>MFCloudPost.probe());
  await page.evaluate(()=>MFCloudPost.probe(true));
  await applyPreset(page,'high');
  await page.evaluate(()=>{orthoSpan=900;if(typeof distTarget==='number')distTarget=900;});
  await page.waitForTimeout(500);
  const highProbe=await page.evaluate(()=>MFCloudPost.probe());
  await applyPreset(page,'cinematic');
  await page.waitForTimeout(120);

  const before=await page.evaluate(()=>MFCloudPost.probe());
  await page.evaluate(()=>MFCloudPost.setFail('composite'));
  await page.waitForTimeout(250);
  const forced=await page.evaluate(()=>{const p=MFCloudPost.probe();MFCloudPost.setFail('');return p;});
  const after=await page.evaluate(()=>MFCloudPost.probe());
  const runtime=await page.evaluate(()=>({
    probe:MFCloudPost.probe(),cloud:MFCloudFx.probe(),glErrors:typeof GL_PROG_ERRORS!=='undefined'?GL_PROG_ERRORS.slice():[],
    contextLosses:window.__mfProbe&&window.__mfProbe.contextLossEvents,quality:typeof qualityKey==='function'?qualityKey():null,
    span:typeof orthoSpan==='number'?orthoSpan:null
  }));
  result={gpu,mobile,deployment,controlledProbe:{perfScale:.85,fogForcedVisible:true},captures,cinematicLodProbe,highProbe,before,forced,after,runtime,errors};
  await writeFile(join(OUT,'report.json'),JSON.stringify(result,null,2));
  const checks=[
    ['real match',deployment.matchLive===true],
    ['post presented',cinematicLodProbe.presented>0&&highProbe.presented>0],
    ['all three LODs exercised',cinematicLodProbe.tacticalFrames>0&&cinematicLodProbe.highFrames>0&&cinematicLodProbe.orbitalFrames>0],
    ['High uses the shared 8-step tactical post',highProbe.lastQuality==='high'&&highProbe.lastSteps===8],
    ['forced composite failure used same-frame fallback',forced.fallbackFrames>before.fallbackFrames&&!forced.pending],
    ['no shader errors',runtime.glErrors.length===0],
    ['no context loss',runtime.contextLosses===0],
    ['no page errors',errors.length===0]
  ];
  for(const [label,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${label}`);
  console.log(JSON.stringify({renderer:gpu.renderer,probe:runtime.probe,captures:captures.map(c=>({name:c.name,path:c.path,sha256:c.sha256})),errors},null,2));
  if(checks.some(([,ok])=>!ok))process.exitCode=1;
}finally{
  await closePwBrowser(browser).catch(()=>{});
  await server.close().catch(()=>{});
}
