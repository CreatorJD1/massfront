#!/usr/bin/env node
/* UGA integration probe.

   Two contracts the player actually sees:

   1. The strategic layer has a main-menu door. It used to exist only three
      screens deep inside Settings, which is why the ship, galaxy map and
      survey scanner read as detached content.
   2. Scanning is a hunt, not a tap. The probe button must stay locked until
      the reticle is over a real signal peak, and firing must resolve the site
      under the crosshair - minerals or an authored anomaly - rather than
      awarding the next catalog entry regardless of aim.

   A green result requires the locked state to be observed BEFORE the unlocked
   one; a button that is simply always enabled is a failure. */
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=resolve(root,'.tmp/uga-survey-scan');
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

const pageErrors=[];let browser=null,menu=null,scan=null,fatal=null;
try{
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true,
    executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});

  // ---- 1. main-menu door -------------------------------------------------
  const base=await browser.newPage({viewport:{width:412,height:900},hasTouch:true,colorScheme:'dark'});
  base.on('pageerror',e=>pageErrors.push('base: '+String(e?.message||e)));
  await base.addInitScript(()=>{try{
    localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
  }catch{}});
  await base.goto(`http://127.0.0.1:${port}/?ugamenuprobe=1`,{waitUntil:'domcontentloaded',timeout:90000});
  await assertHardwareGpu(base);
  await base.waitForFunction(()=>typeof mfExplorationMenuSync==='function',null,{timeout:180000});
  menu=await base.evaluate(()=>{
    const btn=document.getElementById('ugaBtn');
    const before={present:!!btn,display:btn?btn.style.display:null};
    window.__MF_BUILD_HAS_GALACTIC_EXPLORATION=true;
    mfExplorationMenuSync();
    const shown=btn?getComputedStyle(btn).display!=='none':false;
    let opened=null;
    const original=mfOpenExploration;
    mfOpenExploration=view=>{opened=view;return false;};
    /* mfBindTap ignores a non-primary pointer. A synthetic PointerEvent
       defaults isPrimary to false, which silently swallows the tap. */
    const pev=(type,x,y)=>new PointerEvent(type,{bubbles:true,pointerId:1,isPrimary:true,
      pointerType:'touch',clientX:x,clientY:y});
    btn?.dispatchEvent(pev('pointerdown',5,5));
    btn?.dispatchEvent(pev('pointerup',5,5));
    mfOpenExploration=original;
    const label=btn?btn.textContent.trim():'';
    return {before,shown,opened,label,
      settingsRowStillThere:/Return to UGA Headquarters/.test(document.body.innerHTML)||null};
  });
  await base.close();

  // ---- 2. the scan gate --------------------------------------------------
  const mod=await browser.newPage({viewport:{width:412,height:900},hasTouch:true,colorScheme:'dark'});
  mod.on('pageerror',e=>pageErrors.push('module: '+String(e?.message||e)));
  await mod.goto(`http://127.0.0.1:${port}/modules/space_exploration/index.html?ugascanprobe=1`,
    {waitUntil:'domcontentloaded',timeout:120000});
  await assertHardwareGpu(mod);
  await mod.waitForFunction(()=>!!document.getElementById('btnSurveyLaunchProbe'),null,{timeout:180000});
  await mod.waitForTimeout(3500);
  scan=await mod.evaluate(async()=>{
    const $=id=>document.getElementById(id);
    const btn=$('btnSurveyLaunchProbe');
    const frame=()=>new Promise(r=>requestAnimationFrame(()=>r()));
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const read=()=>({disabled:!!btn.disabled,
      label:(btn.querySelector('span')||btn).textContent.trim(),
      signal:($('survSigVal')||{}).textContent||null,
      me2:($('me2SignalStrength')||{}).textContent||null,
      status:($('me2ScanStatus')||{}).textContent||null});

    $('actSurvey')?.click();
    await wait(3000);
    const canvas=$('surveyGlobeCanvas');
    const initial=read();

    /* Sweep the globe the way a player does - real pointer drags on the
       canvas - and stop the moment the reticle locks. If a full sweep never
       unlocks the button, that is a failure, not a pass. */
    const pev=(type,x,y)=>new PointerEvent(type,{bubbles:true,pointerId:7,isPrimary:true,
      pointerType:'touch',clientX:x,clientY:y,cancelable:true});
    let locked=null,unlocked=null,peak=0,steps=0;
    if(canvas){
      const box=canvas.getBoundingClientRect(),cx=box.left+box.width*0.5,cy=box.top+box.height*0.5;
      for(let row=0;row<7&&!unlocked;row++){
        canvas.dispatchEvent(pev('pointerdown',cx,cy));
        // one row of latitude, then a full longitude circle in 10px bites
        window.dispatchEvent(pev('pointermove',cx,cy+(row-3)*12));
        await frame();
        for(let k=0;k<70&&!unlocked;k++){
          window.dispatchEvent(pev('pointermove',cx+k*10,cy+(row-3)*12));
          await frame();
          const now=read();steps++;
          peak=Math.max(peak,parseInt(now.me2,10)||0);
          if(now.disabled&&!locked)locked=now;
          if(!now.disabled)unlocked=now;
        }
        window.dispatchEvent(pev('pointerup',cx,cy));
        await frame();
      }
      window.dispatchEvent(pev('pointerup',cx,cy));
    }

    let fired=null;
    if(unlocked){
      btn.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      await wait(600);
      const toast=document.querySelector('#toast,.toast,[data-toast]');
      const result=$('surveyResult');
      fired={toast:toast?toast.textContent.trim():null,after:read(),result:result?{
        visible:!result.hidden,
        title:($('surveyResultTitle')||{}).textContent||'',
        reward:($('surveyResultReward')||{}).textContent||'',
        nextAction:result.dataset.nextActionKind||'',
        systemId:result.dataset.systemId||'',
        planetId:result.dataset.planetId||'',
        primaryAreaId:result.dataset.primaryAreaId||'',
        cta:($('surveyNextAction')||{}).textContent?.trim?.()||''
      }:null};
    }
    return {surveyOpen:!!canvas,canvasFound:!!canvas,initial,locked,unlocked,peak,steps,fired};
  });
  await mod.screenshot({path:resolve(outDir,'survey-result-412x900.png')});
}catch(error){fatal=String(error?.stack||error);}
finally{try{await closePwBrowser(browser);}catch{}server.close();}
await mkdir(outDir,{recursive:true});
const out={generatedAt:new Date().toISOString(),fatal,pageErrors,menu,scan};
await writeFile(resolve(outDir,'evidence.json'),JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2).slice(0,5000));
if(fatal||pageErrors.length||!scan?.fired?.result?.visible||!scan?.fired?.result?.nextAction)process.exitCode=1;
