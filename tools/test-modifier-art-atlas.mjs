/* Focused <=2-minute regression for the 5x2 Map Settings modifier art atlas. */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const supplied=process.argv.find(a=>/^https?:\/\//.test(a));
const url=supplied||'http://127.0.0.1:8149/';
const out=join(root,'releases','modifier-art');
const shot=join(out,'map-settings-modifier-art-mobile.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(v,m)=>{if(!v)throw new Error(m);};
let server=null;await mkdir(out,{recursive:true});
if(!supplied){
  server=spawn('python',['-m','http.server','8149','--directory',root],{stdio:'ignore',windowsHide:true});
  for(let i=0;i<30;i++){try{const r=await fetch(url);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
}
const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,
    hasTouch:true,isMobile:true,colorScheme:'dark',reducedMotion:'reduce'});
  await context.addInitScript(()=>{try{
    localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');localStorage.setItem('mf_offline','1');
  }catch(e){}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof mfGalaxyReady!=='undefined'&&mfGalaxyReady&&typeof renderOps==='function'&&
    typeof showFrontScreen==='function'&&typeof mfGalaxySetStage==='function'&&typeof OPMODS!=='undefined'&&
    document.getElementById('mfAdvanced'),null,{timeout:60000});
  /* Function declarations arrive before boot() finishes its async texture work.
     Give that final route commit the same budget as the player-facing probes or
     it can legitimately put startScreen back on top after this harness opens
     the deploy drawer. */
  await page.waitForTimeout(11000);
  const intro=page.locator('#mfIntroStart');if(await intro.isVisible()){await intro.tap();await page.waitForTimeout(500);}
  const gate=page.locator('#apCloseBtn');if(await gate.isVisible()){await gate.tap();await page.waitForTimeout(250);}
  await page.evaluate(()=>{
    try{if(typeof apGateSatisfied==='function')apGateSatisfied();}catch(e){}
    try{if(typeof apClose==='function')apClose();}catch(e){}
    for(const id of ['apOverlay','apConfirmOverlay','mfBootCover','loadScr']){const el=document.getElementById(id);if(el)el.style.setProperty('display','none','important');}
  });
  const gpu=await assertHardwareGpu(page);
  await page.evaluate(()=>{
    META.xp=100000;META.wins=5;META.matches=4;META.mastery={};META.tutorial={done:true,skipped:false,version:2};
    META.threat=3;META.threatSel=3;META.opmods={iron:1,swarm:1};wcChoice=0;
    showFrontScreen('setupScr');mfGalaxySetStage('deploy');renderOps();document.getElementById('mfAdvanced').open=true;
  });
  await page.waitForFunction(()=>document.querySelectorAll('#mfAdvanced #opModRow .opModArt').length===10);
  await page.waitForFunction(()=>new Promise(resolve=>{
    const i=new Image();i.onload=()=>resolve(i.naturalWidth>0);i.onerror=()=>resolve(false);
    i.src='./assets/modifiers/modifier-art-atlas-v1.png';
  }));
  const result=await page.evaluate(async()=>{
    const atlas=await new Promise(resolve=>{const i=new Image();i.onload=()=>resolve({w:i.naturalWidth,h:i.naturalHeight});i.src='./assets/modifiers/modifier-art-atlas-v1.png';});
    const cards=[...document.querySelectorAll('#opModRow .opMod')];
    const box=e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height};};
    return {atlas,cards:cards.map(c=>({id:c.dataset.id,name:c.querySelector('.opTx b').textContent,
      description:c.querySelector('.opTx span').textContent,locked:c.classList.contains('lock'),active:c.classList.contains('on'),box:box(c),
      image:getComputedStyle(c.querySelector('.opModArt')).backgroundImage,
      position:getComputedStyle(c.querySelector('.opModArt')).backgroundPosition})),
      ids:OPMODS.map(x=>x.id),names:OPMODS.map(x=>x.nm),descriptions:OPMODS.map(x=>x.ds),
      route:{stage:mfGalaxyStage,advancedOpen:document.getElementById('mfAdvanced').open,
        modifierHost:!!document.querySelector('#mfAdvancedBody #opModRow'),modifierVisible:!!document.querySelector('#opModRow .opModArt')?.getClientRects().length,
        frontScreen:document.body.dataset.frontScreen||'',setupDisplay:getComputedStyle(document.getElementById('setupScr')).display,
        stageDisplay:getComputedStyle(document.getElementById('mfStageDeploy')).display,
        advancedDisplay:getComputedStyle(document.getElementById('mfAdvanced')).display,
        bodyDisplay:getComputedStyle(document.getElementById('mfAdvancedBody')).display,
        cardDisplay:getComputedStyle(document.getElementById('opModRow').closest('.setupCard')).display,
        obstructions:['#apOverlay','#apConfirmOverlay','#mfPreAlphaIntro','#mfBootCover','#loadScr'].filter(sel=>{
          const el=document.querySelector(sel);if(!el)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';
        })}};
  });
  assert(result.route.stage==='deploy'&&result.route.advancedOpen&&result.route.modifierHost&&result.route.modifierVisible&&!result.route.obstructions.length,
    'modifier atlas is not visible in the Stage 7 deploy advanced-control route: '+JSON.stringify(result.route));
  assert(result.atlas.w===1983&&result.atlas.h===793&&Math.abs(result.atlas.w/result.atlas.h-2.5)<.01,
    'atlas dimensions/ratio changed: '+JSON.stringify(result.atlas));
  assert(result.cards.length===10&&result.cards.map(x=>x.id).join(',')===result.ids.join(','),'modifier card order no longer matches atlas order');
  assert(result.cards.map(x=>x.name).join('|')===result.names.join('|')&&result.cards.map(x=>x.description).join('|')===result.descriptions.join('|'),
    'modifier descriptions or names changed during art integration');
  const positions=['0% 0%','25% 0%','50% 0%','75% 0%','100% 0%','0% 100%','25% 100%','50% 100%','75% 100%','100% 100%'];
  assert(result.cards.every((x,i)=>x.image.includes('modifier-art-atlas-v1.png')&&x.position===positions[i]),
    'CSS sprite positions are not exact row-major cells: '+JSON.stringify(result.cards.map(x=>x.position)));
  assert(result.cards.every(x=>x.box.h>=96&&x.box.w>=300),'modifier card touch target below 48px: '+JSON.stringify(result.cards.map(x=>x.box)));
  assert(result.cards.find(x=>x.id==='iron').active&&result.cards.find(x=>x.id==='swarm').active,'active modifier styling was lost');
  assert(result.cards.find(x=>x.id==='titan').locked&&result.cards.find(x=>x.id==='nofab').locked,'progression locks were lost');
  const scroll=page.locator('#setupScr .setupScroll');
  await scroll.evaluate(e=>{const target=document.getElementById('opModRow'),tr=target.getBoundingClientRect(),er=e.getBoundingClientRect();e.scrollTop+=tr.top-er.top-8;});
  await page.waitForTimeout(200);
  await page.screenshot({path:shot,fullPage:false});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,gpu,...result,screenshot:shot},null,2));
}finally{await browser.close();if(server)server.kill();}
