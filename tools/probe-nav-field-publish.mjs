#!/usr/bin/env node
/* Flow-field publication probe.

   The incremental navigation builder replaced a synchronous full-grid flood
   with a sliced job. A field is only USEFUL once its `dirs` array is published
   and the movement consumer accepts it. This probe measures that end to end in
   a live match: how many fields publish, how many slices are thrown away by
   blocker invalidation, whether an ordered army actually displaces, and
   whether the order-route ribbon traced a real path or a straight beeline.

   Absence of movement is a failure, not a pass. */
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=resolve(root,'.tmp/nav-field-publish');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.glb':'model/gltf-binary','.ogg':'audio/ogg','.m4a':'audio/mp4','.bin':'application/octet-stream',
  '.woff2':'font/woff2','.wasm':'application/wasm','.ktx2':'image/ktx2'};
const server=createServer(async(req,res)=>{
  try{
    let path=decodeURIComponent((req.url||'/').split('?')[0]);if(path==='/')path='/index.html';
    const file=resolve(root,'.'+path);
    if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('not found');return;}
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch(error){res.writeHead(500);res.end(String(error?.stack||error));}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const port=server.address().port;
const cdp=await new Promise((ok,bad)=>{const s=createServer();s.once('error',bad);s.listen(0,'127.0.0.1',()=>{
  const p=s.address().port;s.close(error=>error?bad(error):ok(p));});});
if(!process.env.PW_CDP&&!process.env.PW_CDP_PORT)process.env.PW_CDP_PORT=String(cdp);

const pageErrors=[];let browser=null,report=null,fatal=null;
try{
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true,
    executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1000,height:760},deviceScaleFactor:1,colorScheme:'dark'});
  page.on('pageerror',e=>pageErrors.push(String(e?.stack||e)));
  await page.addInitScript(()=>{try{
    localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
  }catch{}});
  await page.goto(`http://127.0.0.1:${port}/?navfieldprobe=1`,{waitUntil:'domcontentloaded',timeout:90000});
  await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof deployCarrier==='function'
    &&typeof hideFrontScreens==='function'&&typeof orderMove==='function'&&typeof unitTick==='function'
    &&typeof mfNavDiagnostics==='function'&&typeof spawnUnit==='function',null,{timeout:180000});
  await page.waitForFunction(()=>document.body.classList.contains('mfIntroDone')
    &&!document.getElementById('mfBootCover'),null,{timeout:90000})
    .catch(async()=>{await page.evaluate(()=>{const b=document.getElementById('mfIntroStart');if(b)b.click();});});
  await page.waitForTimeout(700);

  report=await page.evaluate(()=>{
    try{if(typeof apClose==='function')apClose();}catch{}
    try{if(document.getElementById('mfOnboardingChoice')&&window.MFOnboarding)
      window.MFOnboarding.decide('skipped',{flowId:'default'});}catch{}
    hideFrontScreens();
    try{if(typeof stopAttract==='function')stopAttract();}catch{}
    demoMode=false;attractOn=false;
    resetWorld();
    const sp=skirmishSpawnPoints(),EP=sp[1]||sp[0],PP=sp[0];
    addBld('hq',1,Math.round(EP.x),Math.round(EP.y),true);
    for(let i=0;i<4;i++)spawnUnit(0,1,EP.x+40+i*18,EP.y+30);
    const heroT=TYPES.findIndex(t=>t&&t.cat==='hero'&&t.hero==='legion');
    const eh=spawnUnit(heroT>=0?heroT:28,1,EP.x-30,EP.y+30);
    if(eh>=0&&typeof enemyHeroIdxs!=='undefined')enemyHeroIdxs.push(eh);
    carrier.active=true;carrier.phase=1;carrier.alt=0;carrier.clearance=0;
    carrier.tx=carrier.x;carrier.ty=carrier.y;
    deployCarrier();
    running=true;paused=false;gameEnded=false;

    // A player squad well away from the destination.
    const mine=[];
    for(let i=0;i<10;i++){const u=spawnUnit(0,0,PP.x+30+(i%5)*16,PP.y+30+((i/5)|0)*16);if(u>=0)mine.push(u);}
    usel.fill(0);for(const i of mine)usel[i]=1;

    const before=mfNavDiagnostics();
    const start=mine.map(i=>[ux[i],uy[i]]);
    const ok=orderMove(EP.x,EP.y);
    const afterOrder=mfNavDiagnostics();
    // What did the route ribbon actually trace?
    const ribbon=(typeof moveFxList!=='undefined'&&moveFxList.length)
      ? {points:moveFxList[moveFxList.length-1].pts.length,len:Math.round(moveFxList[moveFxList.length-1].len)} : null;
    const routeField=mine.length?ufield[mine[0]]:-1;

    // Run 200 fixed sim ticks and sample publication.
    const samples=[],disp=[];
    const avgMoved=()=>{let m=0;for(let k=0;k<mine.length;k++)m+=Math.hypot(ux[mine[k]]-start[k][0],uy[mine[k]]-start[k][1]);
      return Math.round(m/Math.max(1,mine.length));};
    const TICKS=600;
    for(let t=0;t<TICKS;t++){
      unitTick(1/30);
      if(typeof bldTick==='function')bldTick(1/30);
      if(typeof aiTick==='function')aiTick(1/30);
      if(t%100===99){
        const F=(typeof fields!=='undefined')?fields[routeField]:null;
        disp.push({tick:t+1,seconds:Math.round((t+1)/30*10)/10,avgMoved:avgMoved(),
          builds:mfNavDiagnostics().builds,canceled:mfNavDiagnostics().canceled,
          routeHasDirs:!!(F&&F.dirs),routePending:!!(F&&F.pending)});
      }
    }
    samples.push(...disp);
    let moved=0;
    for(let k=0;k<mine.length;k++)moved+=Math.hypot(ux[mine[k]]-start[k][0],uy[mine[k]]-start[k][1]);
    moved/=Math.max(1,mine.length);
    return {ordered:ok,squad:mine.length,routeField,ribbon,
      goalDist:Math.round(Math.hypot(EP.x-PP.x,EP.y-PP.y)),
      avgDisplacement:Math.round(moved),unitSpeed:TYPES[0].spd,before,afterOrder,samples,
      final:mfNavDiagnostics()};
  });
}catch(error){fatal=String(error?.stack||error);}
finally{try{await closePwBrowser(browser);}catch{}server.close();}
await mkdir(outDir,{recursive:true});
const out={generatedAt:new Date().toISOString(),fatal,pageErrors,report};
await writeFile(resolve(outDir,'evidence.json'),JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2).slice(0,6000));
if(fatal)process.exitCode=1;
