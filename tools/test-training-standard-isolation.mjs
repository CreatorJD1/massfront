/* Regression: Training is a dedicated mode and may never leak into Standard.
   Usage: node tools/test-training-standard-isolation.mjs [local URL] */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8982/';
const out=join(root,'releases','training-operation');
const shot=join(out,'training-compact-mobile.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  await context.addInitScript(()=>{try{
    localStorage.clear();
    localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
    localStorage.setItem('mf_auth_gate_v1','1');
  }catch(e){}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof window.__tutDebug==='function'&&typeof returnToMainMenu==='function',null,{timeout:60000});
  await page.evaluate(()=>{if(running)returnToMainMenu();});
  await page.evaluate(()=>window.__tutDebug().startTraining());
  /* The carrier fly-in deliberately precedes `running`; guidance is armed on
     that drop edge so camera/deployment teaching is already visible. */
  await page.waitForTimeout(14000);
  const armed=await page.evaluate(()=>({tut:window.__tutDebug().TUT,running,paused,
    carrier:typeof carrier==='undefined'?null:{active:carrier.active,phase:carrier.phase},mode:activeWarMode,
    front:[...document.querySelectorAll('body>div')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.id).filter(Boolean)}));
  assert(armed.tut.trainingMode&&armed.tut.active,'training did not arm: '+JSON.stringify(armed)+' errors='+errors.join(' | '));
  await page.waitForTimeout(500);
  const training=await page.evaluate(()=>{
    const rect=id=>document.getElementById(id)?.getBoundingClientRect();
    return {mode:activeWarMode,training:window.trainingMissionActive(),body:document.body.classList.contains('trainingOperation'),
      keel:getComputedStyle(keelWrap).visibility,keelDisplay:getComputedStyle(keelWrap).display,keelClass:keelWrap.className,
      bodyClass:document.body.className,modeBadge:getComputedStyle(keelModeBadge).display,
      toast:getComputedStyle(document.getElementById('toast')).display,keelRect:rect('keelWrap'),goalRect:rect('goalBar')};
  });
  assert(training.mode==='training'&&training.training&&training.body,'training did not own a dedicated mode: '+JSON.stringify(training));
  assert(training.keel==='visible'&&training.keelDisplay!=='none'&&training.keelRect&&training.keelRect.width>2&&training.keelRect.height>2&&
    !/\bmenuMode\b|\bmfMenuOpen\b/.test(training.bodyClass)&&training.modeBadge==='none'&&training.toast==='none',
    'training still stacks duplicate coaching surfaces: '+JSON.stringify(training));
  assert(!training.goalRect||!training.keelRect||training.keelRect.top>=training.goalRect.bottom-1,'KEEL overlaps the match goal: '+JSON.stringify(training));
  await page.screenshot({path:shot,fullPage:false});

  await page.evaluate(()=>returnToMainMenu());
  await page.waitForFunction(()=>!running&&getComputedStyle(startScreen).display!=='none');
  const returned=await page.evaluate(()=>({mode:activeWarMode,training:window.trainingMissionActive(),
    active:window.__tutDebug().TUT.active,body:document.body.classList.contains('trainingOperation'),keel:keelWrap.classList.contains('show')}));
  assert(returned.mode==='standard'&&!returned.training&&!returned.active&&!returned.body&&!returned.keel,
    'return-to-menu leaked training state: '+JSON.stringify(returned));

  await page.evaluate(()=>openPlanetarySetup('standard'));
  const standard=await page.evaluate(()=>({mode:activeWarMode,training:window.trainingMissionActive(),
    body:document.body.classList.contains('trainingOperation'),header:document.querySelector('#setupScr .setupHead h2')?.textContent||''}));
  assert(standard.mode==='standard'&&!standard.training&&!standard.body&&/STANDARD/.test(standard.header),
    'Standard setup inherited Tutorial: '+JSON.stringify(standard));
  /* Use the setup button's real launch core without depending on synthetic
     touch/pointer timing; this regression is about mode isolation, not input. */
  await page.evaluate(()=>{applyTheme();hideFrontScreens();newSkirmish();});
  await page.waitForFunction(()=>typeof running!=='undefined'&&running&&typeof carrier!=='undefined'&&carrier.active,null,{timeout:60000});
  await page.waitForFunction(()=>carrier.phase===1&&carrierCanDeploy(),null,{timeout:45000});
  await page.evaluate(()=>deployCarrier());
  await page.waitForFunction(()=>matchLive===true,null,{timeout:10000});
  await page.waitForTimeout(900);
  const liveStandard=await page.evaluate(()=>({mode:activeWarMode,training:window.trainingMissionActive(),
    tutorialActive:window.__tutDebug().TUT.active,body:document.body.classList.contains('trainingOperation'),
    keel:keelWrap.classList.contains('show'),trainingText:document.body.innerText.includes('TRAINING OPERATION')}));
  assert(liveStandard.mode==='standard'&&!liveStandard.training&&!liveStandard.tutorialActive&&!liveStandard.body&&!liveStandard.keel&&!liveStandard.trainingText,
    'deployed Standard match inherited Tutorial UI or logic: '+JSON.stringify(liveStandard));
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,training,returned,standard,liveStandard,screenshot:shot},null,2));
}finally{await browser.close();}
