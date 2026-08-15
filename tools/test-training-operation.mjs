/* Mobile regression for the explicit KEEL Training Operation.
   Usage: node tools/test-training-operation.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const outDir=join(root,'releases','training-operation');
const shot=join(outDir,'training-camera-guide-mobile.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(outDir,{recursive:true});

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  await context.addInitScript(()=>{try{localStorage.clear();localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');}catch(e){}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof APP_VERSION!=='undefined'&&typeof window.__tutDebug==='function',null,{timeout:60000});
  await page.waitForTimeout(1200);

  const entry=page.locator('#keelTrainingCallout');
  await entry.scrollIntoViewIfNeeded();
  assert(await entry.isVisible(),'first-time Training Operation callout is not visible');
  const entryTap=await entry.locator('button').boundingBox();
  assert(entryTap&&entryTap.height>=44&&entryTap.width>=44,'training launch target is smaller than 44px');

  // Operations must lead with the same explicit mission, not hide it in Help.
  await page.locator('#opsBtn').click();
  await page.waitForTimeout(250);
  const op=page.locator('#keelTrainingOp');
  assert(await op.isVisible(),'Training Operation is missing from Operations');
  assert(await page.locator('#opsPane-threat').evaluate((p,c)=>p.firstElementChild===c,await op.elementHandle()),
    'Training Operation is not the first recommended operation');
  await page.locator('#opsBack').click();

  const before=await page.evaluate(()=>({difficulty,defenseFocus,infestationOn,wcChoice,goalSel,timeLimit,
    curMap,curTheme,aiFactionSel,playerStartZone,ai:aiSlots.map(A=>({...A}))}));
  await entry.scrollIntoViewIfNeeded();
  await entry.locator('button').click();
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('opsScr')).display!=='none');
  await page.locator('#keelTrainingOp .ktoAction').click();
  await page.waitForTimeout(1800);
  const launchState=await page.evaluate(()=>({training:window.__tutDebug().TUT.trainingMode,
    active:window.__tutDebug().TUT.active,running,load:getComputedStyle(document.querySelector('#loadScr')).display,
    front:getComputedStyle(document.querySelector('#startScreen')).display}));
  assert(launchState.training,'training launch control did not enter training mode: '+JSON.stringify(launchState)+' errors='+errors.join(' | '));
  await page.waitForFunction(()=>running&&window.__tutDebug().TUT.trainingMode&&window.__tutDebug().TUT.active,null,{timeout:60000});
  await page.waitForTimeout(500);

  const live=await page.evaluate(()=>({
    step:window.__tutDebug().STEPS[window.__tutDebug().TUT.stepIdx].id,
    ids:window.__tutDebug().STEPS.map(S=>S.id),difficulty,infestationOn,wcChoice,goalSel,timeLimit,
    map:curMap,theme:curTheme,faction:aiFactionSel,activeAi:aiSlots.filter(A=>A.on).map(A=>A.diff),
    highlighted:[...document.querySelectorAll('.keelFocus')].map(e=>e.id||e.textContent.trim().slice(0,24)),
    mapCue:document.querySelector('#keelMapCue').classList.contains('show'),
    bubble:document.querySelector('#keelWrap').classList.contains('show')
  }));
  assert(live.step==='camera','training did not start with camera control');
  assert(JSON.stringify(live.ids)===JSON.stringify(['camera','deploy','commander','pickup','mex','power','fac','territory','queue','train',
    'turret','platoon','formation','attack','fog','tech','ability','objective','cloud']),
    'staged objective sequence changed: '+live.ids.join(','));
  assert(live.difficulty===0&&!live.infestationOn&&live.wcChoice===0&&live.timeLimit===0,
    'training safety rules were not applied');
  assert(live.map==='vanguard'&&live.theme==='verdant'&&live.faction==='legion'&&live.activeAi.length===1&&live.activeAi[0]===0,
    'training map/opponent is not fixed and Easy');
  assert(live.bubble&&(live.mapCue||live.highlighted.length),'current objective has no visible contextual signal');
  await page.screenshot({path:shot,fullPage:false});

  // Skip is reversible and must restore every normal-skirmish choice.
  await page.locator('#keelSkip').click();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#startScreen')).display!=='none',null,{timeout:10000});
  const after=await page.evaluate(()=>({difficulty,defenseFocus,infestationOn,wcChoice,goalSel,timeLimit,
    curMap,curTheme,aiFactionSel,playerStartZone,ai:aiSlots.map(A=>({...A}))}));
  assert(JSON.stringify(after)===JSON.stringify(before),'training leaked its fixed rules into normal skirmish setup');

  // Settings remains the explicit replay path after a skip.
  await page.evaluate(()=>openSettings('main'));
  await page.waitForTimeout(250);
  const replay=page.locator('#keelSetRow');
  assert(await replay.count()===1,'Settings does not contain the training replay row');
  assert(/REPLAY/.test(await replay.textContent()),'Settings does not offer training replay');
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,objectives:live.ids.length,safety:'easy / no infestation / no timer',
    normalConfigRestored:true,screenshot:shot},null,2));
}finally{await browser.close();}
