/* Quick terrain/road fix verification capture */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8982/';
const out=join(root,'.tmp');
await mkdir(out,{recursive:true});
const shot=join(out,'terrain-road-fixes.png');

const browser=await launchPwBrowser({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof newSkirmish==='function'&&typeof setupRelics==='function'&&typeof cityGroundAt==='function'&&typeof TGRID!=='undefined'&&typeof MFWorldStructuresV2==='object',null,{timeout:60000});
  await page.waitForFunction(()=>typeof gl!=='undefined'&&gl&&heightF&&terrainTex,null,{timeout:60000});
  await page.evaluate(()=>{META.settings.quality='cinematic';applyQualityPreset();activeWarMode='standard';curMap='vespera_refinery_large';curTheme='vespera';builtMap='';hideFrontScreens();newSkirmish();});
  await page.waitForFunction(()=>carrier&&carrier.active&&heightF&&PASS,null,{timeout:60000});
  await page.waitForFunction(()=>MFWorldStructuresV2.status().ready,null,{timeout:30000});
  await page.evaluate(()=>{
    if(typeof apGateSatisfied==='function')apGateSatisfied();
    const ap=document.getElementById('apOverlay');if(ap)ap.style.display='none';
    stopAttract();hideFrontScreens();
    for(const id of ['pauseOverlay','gameOver','levelUp','loadScr','dispatch']){const e=document.getElementById(id);if(e)e.style.display='none';}
    document.body.dataset.frontScreen='';document.body.classList.remove('menuMode','mfMenuOpen');
    curMap='vespera_refinery_large';curTheme='vespera';demoMode=false;running=true;matchLive=true;paused=true;fogOn=false;
    carrier.active=false;carrier.phase=2;
    const Z=cityZones.find(z=>z.ind)||cityZones[0];
    cam.x=Z.x;cam.y=Z.y;camFollow=-1;camYaw=yawTarget=.69;camPitch=pitchTarget=1.13;orthoSpan=distTarget=700;
    clampCam();camUpdateMatrices();showHudDock(true,'view');setHudDeck('view');
  });
  await page.waitForTimeout(1200);await page.screenshot({path:shot,fullPage:false});
  if(errors.length)console.log('ERRORS:',errors.join('\n'));else console.log('OK:',shot);
}finally{await browser.close();}
