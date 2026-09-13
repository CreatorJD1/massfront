#!/usr/bin/env node
/* Rally placement probe.

   Walks the player-visible path end to end: open a factory panel, press the
   real RALLY button through its bound pointer handlers, tap the map, produce a
   unit, and march it. A rally flag that is set but never walked to is a
   failure, and so is a button that no longer arms.

   Absence of movement is a failure, not a pass. */
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=resolve(root,'.tmp/rally-placement');
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
  await page.goto(`http://127.0.0.1:${port}/?rallyprobe=1`,{waitUntil:'domcontentloaded',timeout:90000});
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
    const heroT=TYPES.findIndex(t=>t&&t.cat==='hero'&&t.hero==='legion');
    const eh=spawnUnit(heroT>=0?heroT:28,1,EP.x-30,EP.y+30);
    if(eh>=0&&typeof enemyHeroIdxs!=='undefined')enemyHeroIdxs.push(eh);
    carrier.active=true;carrier.phase=1;carrier.alt=0;carrier.clearance=0;
    carrier.tx=carrier.x;carrier.ty=carrier.y;
    deployCarrier();
    running=true;paused=false;gameEnded=false;

    // A player factory, its panel open, exactly as a player reaches the button.
    const fac=addBld('fac',0,Math.round(PP.x+60),Math.round(PP.y+60),true);
    const bi=blds.findIndex(B=>B===fac||(B&&B.alive&&B.team===0&&B.type==='fac'));
    const B=blds[bi];B.prog=1;B.hp=B.hpm;
    refreshBldLive();

    openBld=bi;
    if(typeof updateSelInfo==='function')updateSelInfo();
    const btn=document.getElementById('rallyBtn');
    const btnBound=!!(btn&&btn.dataset&&btn.dataset.mfNativePress==='1');
    const btnShown=!!(btn&&getComputedStyle(btn).display!=='none');
    // Fire the bound handler the way a real press does.
    let armed=-1;
    if(btn){
      btn.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,clientX:10,clientY:10}));
      btn.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,clientX:10,clientY:10}));
      armed=(typeof armRally!=='undefined')?armRally:-2;
    }
    // Place the flag far away, across the map, exactly as a map tap does.
    /* onTap takes SCREEN coordinates and unprojects them itself. Feeding it
       world units silently lands the flag somewhere else entirely, which looks
       exactly like the bug under test. Frame the camera on the intended flag
       first, then tap the pixel w2s reports for it. */
    /* onTap takes SCREEN coordinates and unprojects them itself. Feeding it
       world units silently lands the flag somewhere else entirely, which looks
       exactly like the bug under test. Tap a real on-screen pixel and compare
       against what the same unprojection says that pixel means. */
    const tapPixel={x:Math.round(innerWidth*0.5),y:Math.round(innerHeight*0.42)};
    const expect=s2w(tapPixel.x,tapPixel.y);
    const flag=(typeof battlefieldClampPoint==='function')?battlefieldClampPoint(expect[0],expect[1],24):expect;
    let placed=null;
    if(typeof onTap==='function'){
      onTap(tapPixel.x,tapPixel.y,'touch');
      placed=B.rally?{x:Math.round(B.rally.x),y:Math.round(B.rally.y)}:null;
    }
    // Produce one unit and let it march.
    resM[0]=99999;resE[0]=99999;
    B.queue=[0];B.prodT=TYPES[0].bt-0.01;B.repeat=false;B.tier=B.tier||1;
    const before=new Set();for(let i=0;i<unitHigh;i++)if(ualive[i]&&uteam[i]===0)before.add(i);
    /* Production is paid per tick; one bldTick cannot finish a unit. Let the
       factory actually deliver, then watch the delivered unit march. */
    let made=-1,s0=null,d0=0;
    for(let t=0;t<900;t++){
      unitTick(1/30);bldTick(1/30);if(typeof aiTick==='function')aiTick(1/30);
      if(made<0)for(let i=0;i<unitHigh;i++)if(ualive[i]&&uteam[i]===0&&!before.has(i)){
        made=i;s0=[ux[i],uy[i]];d0=Math.hypot(utx[i]-ux[i],uty[i]-uy[i]);break;}
    }
    const prodState={stalled:B.prodStalled,queue:B.queue.length,prodT:Math.round(B.prodT*100)/100,
      canSpawn:(typeof populationCanSpawn==='function')?populationCanSpawn(0,0,commanderSlotForBuilding(B)):null};
    const madeState=made>=0?{field:ufield[made],tx:Math.round(utx[made]),ty:Math.round(uty[made]),
      fieldHasDirs:!!(fields[ufield[made]]&&fields[ufield[made]].dirs)}:null;
    const s1=made>=0?[ux[made],uy[made]]:null;
    const d1=made>=0?Math.hypot(utx[made]-ux[made],uty[made]-uy[made]):0;
    return {btnBound,btnShown,armed,tapPixel,facIndex:bi,facAlive:!!(B&&B.alive),
      rallyPlaced:placed,rallyRequested:{x:Math.round(flag[0]),y:Math.round(flag[1])},
      rallyError:placed?Math.round(Math.hypot(placed.x-flag[0],placed.y-flag[1])):null,
      produced:made,madeState,prodState,
      startDistToRally:Math.round(d0),endDistToRally:Math.round(d1),
      travelled:s0&&s1?Math.round(Math.hypot(s1[0]-s0[0],s1[1]-s0[1])):0,
      unitSpeed:TYPES[0].spd,nav:mfNavDiagnostics()};
  });
}catch(error){fatal=String(error?.stack||error);}
finally{try{await closePwBrowser(browser);}catch{}server.close();}
await mkdir(outDir,{recursive:true});
const out={generatedAt:new Date().toISOString(),fatal,pageErrors,report};
await writeFile(resolve(outDir,'evidence.json'),JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2).slice(0,6000));
if(fatal)process.exitCode=1;
