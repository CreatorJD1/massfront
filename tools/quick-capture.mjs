import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8982/';
const out=join(root,'.tmp');
await mkdir(out,{recursive:true});
const shot=join(out,'road-removal.png');

const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(4000);
  await page.evaluate(()=>{
    try{META.settings.quality='cinematic';applyQualityPreset();}catch(e){}
    activeWarMode='standard';curMap='vespera_refinery_large';curTheme='vespera';
    try{hideFrontScreens();newSkirmish();}catch(e){}
  });
  await page.waitForTimeout(16000);
  await page.evaluate(()=>{
    try{
      if(typeof apGateSatisfied==='function')apGateSatisfied();
      const ap=document.getElementById('apOverlay');if(ap)ap.style.display='none';
      stopAttract();hideFrontScreens();
      for(const id of ['pauseOverlay','gameOver','levelUp','loadScr','dispatch']){const e=document.getElementById(id);if(e)e.style.display='none';}
      document.body.dataset.frontScreen='';document.body.classList.remove('menuMode','mfMenuOpen');
      demoMode=false;running=true;matchLive=true;paused=true;fogOn=false;
      carrier.active=false;carrier.phase=2;
      const Z=cityZones[0];
      cam.x=Z.x;cam.y=Z.y;camFollow=-1;camYaw=yawTarget=.69;camPitch=pitchTarget=1.13;orthoSpan=distTarget=700;
      clampCam();camUpdateMatrices();showHudDock(true,'view');setHudDeck('view');
    }catch(e){errors.push('eval: '+e.message);}
  });
  await page.waitForTimeout(2000);
  await page.screenshot({path:shot,fullPage:false});
  if(errors.length)console.log('ERRORS:',errors.join('\n'));else console.log('OK:',shot);
}finally{await browser.close();}
