/* Real offline deployment, then diagnostic camera views of the same paused
   world. This is visual evidence, not a high-unit or weapon acceptance test. */
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {acquireVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';
import {startStaticServer,installTelemetryInit,enterRealBattle,applyPreset,collectSourceIdentity} from './perf-lab/perf-probe-runner.mjs';

const root=resolve(new URL('..',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const tag=process.argv[2];
if(!tag||!/^[a-zA-Z0-9_-]+$/.test(tag))throw new Error('Expected unique evidence tag');
const out=join(root,'.tmp','environment-upgrade',tag);
await mkdir(out,{recursive:true});
const report={tag,at:new Date().toISOString(),purpose:'visual-diagnostic-after-real-deployment',acceptance:false,errors:[],views:[]};
let freeze,server,browser,context,page,isolation;
try{
  freeze=await acquireVerificationFreeze({root,label:'environment-'+tag});
  report.source=await collectSourceIdentity();
  server=await startStaticServer();report.url=server.url;
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
  context=await browser.newContext({viewport:{width:412,height:900},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  isolation=await installTelemetryInit(page);
  await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:60000});
  report.gpu=await assertHardwareGpu(page);
  report.deployment=await enterRealBattle(page);
  report.scene=await page.evaluate(()=>{
    paused=true;
    const initial={map:curMap,seed:MAPDEFS[curMap].seed,time:stats.t,waterIndices:waterIdxCount,cam:{x:cam.x,y:cam.y}};
    const sample=(x,y)=>heightF[Math.max(0,Math.min(TS-1,y/MAP*TS|0))*TS+Math.max(0,Math.min(TS-1,x/MAP*TS|0))];
    let coast=null;
    for(let y=160;y<MAP-160&&!coast;y+=24)for(let x=160;x<MAP-160&&!coast;x+=24){
      if(sample(x,y)>=WATER_H)continue;
      for(const [dx,dy] of [[40,0],[-40,0],[0,40],[0,-40]])if(sample(x+dx,y+dy)>WATER_H+1){coast={x,y,dx,dy};break;}
    }
    return {...initial,coast};
  });
  if(tag.startsWith('brood-')){
    report.brood=await page.evaluate(()=>{
      paused=true;playerFaction='horde';fogOn=false;
      /* Match the original baseline's exact terrain coordinates; live command
         units and their starting camera may move during asynchronous boot. */
      const x=1100,y=2640;
      const floodsBefore=waterFloods.length;
      const made=[addBld('hq',0,x,y,true),addBld('fac',0,x+260,y+20,true),
        addBld('pgen',0,x+110,y+130,true)];
      const hash=A=>{let h=2166136261;for(const v of A)h=Math.imul(h^(v*10000|0),16777619);return h>>>0;};
      const authoritative=()=>({height:hash(heightF),pass:hash(PASS),
        hardscape:hash(groundMaskCanvas.getContext('2d').getImageData(0,0,TS,TS).data)});
      const beforeNest=authoritative();
      made.push(addBld('nest',2,x-90,y+220,true));
      const afterNest=authoritative();
      const samples=made.map(B=>{
        const ix=clamp(B.x/MAP*TS|0,0,TS-1),iy=clamp(B.y/MAP*TS|0,0,TS-1);
        const pixels=terrainCanvas.getContext('2d').getImageData(ix-16,iy-16,33,33).data;
        let purplePixels=0;
        for(let p=0;p<pixels.length;p+=4)if(pixels[p]>pixels[p+1]+12&&pixels[p+2]>pixels[p+1]+5)purplePixels++;
        return {type:B.type,team:B.team,fac:B.fac,x:B.x,y:B.y,creep:creepF?creepF[iy*TS+ix]:0,
          purplePixels,albedo:Array.from(terrainCanvas.getContext('2d').getImageData(ix,iy,1,1).data)};
      });
      return {caller:'addBld after choosing Horde; new sites, not recolored old pads',fogDisabledForVisualFixture:true,
        samples,fieldNonzero:creepF?creepF.reduce((n,v)=>n+(v>0),0):0,
        floodsBefore,floodsAfter:waterFloods.length,
        neutralNestPreservesAuthority:JSON.stringify(beforeNest)===JSON.stringify(afterNest),beforeNest,afterNest,
        site:{x:x+80,y:y+70}};
    });
    if(tag.includes('-after-')){
      assert(report.brood.samples.every(B=>B.creep>0),'A real Brood building has no foundation coverage');
      assert(report.brood.fieldNonzero>0,'Infestation field is empty');
      assert(report.brood.neutralNestPreservesAuthority,'Neutral nest changed pathing, terrain height or hardscape');
      assert(report.brood.samples.every(B=>B.purplePixels>10),'An organic foundation has been repainted as ordinary terrain');
      assert.equal(report.brood.floodsAfter,report.brood.floodsBefore,'Foundation placement invented an impact flood');
    }
    report.scene.coast=report.brood.site;
    /* Placement queues mip/height maintenance for the next real sim tick.
       Freezing immediately after addBld leaves old albedo mips on screen even
       though level zero and G are fresh; do not mistake that fixture artifact
       for renderer output during play or manually call a renderer helper. */
    await page.evaluate(()=>{paused=false;});
    await page.waitForFunction(()=>!mipDirty,{},{timeout:15000});
    report.brood.maintenance=await page.evaluate(()=>{
      paused=true;fogOn=false;return {tick,time:stats.t,mipDirty,mipUrgent};
    });
  }
  await page.screenshot({path:join(out,'deployment.png')});
  if(tag.startsWith('building-')){
    report.building=await page.evaluate(()=>{
      const i=blds.findIndex(B=>B.alive&&B.team===0&&B.allyAI==null&&B.type==='pgen');
      if(i<0)throw new Error('Deployment generator missing');
      openBldMenu(i);
      return {id:i,type:blds[i].type,level:blds[i].lvl||1};
    });
    await page.screenshot({path:join(out,'building-panel.png')});
  }
  for(const quality of (tag.startsWith('building-')?[]:['medium','high','cinematic'])){
    await applyPreset(page,quality);
    for(const [name,pitch,span] of [['tactical',1.45,900],['close',1.05,420]]){
      const result=await page.evaluate(({site,pitch,span})=>{
        if(site){cam.x=site.x;cam.y=site.y;}
        camYaw=yawTarget=.22;camPitch=pitchTarget=pitch;orthoSpan=distTarget=span;
        if(typeof clampCam==='function')clampCam();
        render(0);
        return {time:stats.t,paused,cam:{x:cam.x,y:cam.y,yaw:camYaw,pitch:camPitch,span:orthoSpan},
          waterIndices:waterIdxCount,cloud:window.MFCloudFx?.probe?.()||null,
          cloudPost:typeof mfCloudPostProbe==='function'?mfCloudPostProbe():null,
          shaderErrors:typeof shaderErrors!=='undefined'?shaderErrors:null};
      },{site:report.scene.coast,pitch,span});
      await page.screenshot({path:join(out,quality+'-'+name+'.png')});
      report.views.push({quality,name,...result});
    }
  }
  if(report.brood){
    report.brood.pausedTerrainStable=await page.evaluate(()=>{
      const before=creepF.slice();for(let n=0;n<12;n++)render(0);
      return before.every((v,i)=>v===creepF[i]);
    });
    assert(report.brood.pausedTerrainStable,'Paused drawing changes infestation');
  }
  assert.deepEqual(report.errors,[],'Runtime exceptions occurred during the visual diagnostic');
  await freeze.checkpoint('environment capture complete');
  report.sourceStable=true;
  report.status='PASS';
}catch(e){report.failure=e.stack;report.status='FAIL';process.exitCode=1;console.error(e.stack);}
finally{
  if(isolation){
    try{report.networkIsolation=await isolation.finalize('environment visual diagnostic');}
    catch(e){report.networkIsolation=isolation.snapshot();report.isolationError=e.stack;process.exitCode=1;}
  }
  if(context)await context.close().catch(()=>{});
  if(browser)await closePwBrowser(browser).catch(e=>{report.cleanupError=e.message;process.exitCode=1;});
  if(server)await server.close().catch(()=>{});
  if(freeze)await freeze.release({assertStable:true}).catch(e=>{report.sourceStable=false;report.freezeError=e.message;process.exitCode=1;});
  if(process.exitCode)report.status='FAIL';
  await writeFile(join(out,'evidence.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,out,scene:report.scene,errors:report.errors,sourceStable:report.sourceStable}));
}
