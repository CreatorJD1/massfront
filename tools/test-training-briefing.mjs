/* Focused hardware-GPU mobile smoke test for the real War Room Training card.
   Usage: node tools/test-training-briefing.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const out=join(root,'releases','ui-stage6');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const cardSelector='.warCard[data-mode="training"]';
const assert=(ok,msg)=>{ if(!ok) throw new Error(msg); };
await mkdir(out,{recursive:true});

async function renderTrainingState(page,spec){
  await page.evaluate(state=>{
    const debug=window.__tutDebug();
    META.matches=0;
    META.tutorial={...state.tutorial};
    debug.TUT.trainingMode=state.trainingMode;
    debug.TUT.active=state.active;
    debug.TUT.stepIdx=state.stepIdx;
    debug.TUT.finishTimer=0;
    running=state.running;
    paused=state.paused;
    renderWarRoom();
    showFrontScreen('warScr');
  },spec);
  await page.waitForFunction(sel=>{
    const card=document.querySelector(sel),screen=document.getElementById('warScr');
    return !!(card&&screen&&getComputedStyle(screen).display==='flex'&&getComputedStyle(card).display!=='none');
  },cardSelector);
  return page.evaluate(sel=>{
    const card=document.querySelector(sel),desc=card.querySelector('.warDs'),foot=card.querySelector('.warFootTx');
    const box=card.getBoundingClientRect(),back=document.getElementById('warBack').getBoundingClientRect();
    return {
      text:card.textContent.replace(/\s+/g,' ').trim(),
      description:desc?desc.textContent.replace(/\s+/g,' ').trim():'',
      state:foot?foot.textContent.replace(/\s+/g,' ').trim():'',
      ariaLabel:card.getAttribute('aria-label')||'',
      affiliation:card.dataset.affiliation||'',mode:card.dataset.mode||'',
      first:card===document.querySelector('#warGrid .warCard'),
      visible:getComputedStyle(card).visibility!=='hidden'&&box.width>0&&box.height>0,
      box:{x:box.x,y:box.y,w:box.width,h:box.height,right:box.right,bottom:box.bottom},
      back:{x:back.x,y:back.y,w:back.width,h:back.height,right:back.right,bottom:back.bottom},
      viewport:{w:innerWidth,h:innerHeight}
    };
  },cardSelector);
}

function assertIdentityAndGeometry(value,label){
  const text=value.text.toUpperCase(),aria=value.ariaLabel.toUpperCase();
  assert(value.mode==='training',label+' card lost its Training route: '+JSON.stringify(value));
  assert(value.affiliation==='uga',label+' card is not marked UGA: '+JSON.stringify(value));
  assert(text.includes('UGA')&&text.includes('KEEL'),label+' card omits visible UGA/KEEL identity: '+value.text);
  assert(aria.includes('UGA')&&aria.includes('KEEL'),label+' card accessible name omits UGA/KEEL: '+value.ariaLabel);
  assert(!text.includes('NOVA')&&!text.includes('ELARA')&&!aria.includes('NOVA')&&!aria.includes('ELARA'),
    label+' card assigns KEEL or pre-faction Training to Nova/Elara: '+JSON.stringify(value));
  assert(value.first,label+' Training card is no longer the first War Room operation');
  assert(value.visible,label+' Training card is not visible');
  assert(value.box.w>=300&&value.box.h>=44,label+' Training card is below the mobile size floor: '+JSON.stringify(value.box));
  assert(value.box.x>=-1&&value.box.right<=value.viewport.w+1,
    label+' Training card overflows the mobile viewport: '+JSON.stringify({box:value.box,viewport:value.viewport}));
  assert(value.back.w>=44&&value.back.h>=44&&value.back.x>=-1&&value.back.right<=value.viewport.w+1
    &&value.back.bottom<=value.viewport.h+1,
    label+' War Room Back control is clipped or below the mobile size floor: '+JSON.stringify({back:value.back,viewport:value.viewport}));
}

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,
    hasTouch:true,isMobile:true,colorScheme:'dark'});
  await context.addInitScript(()=>{try{localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');}catch(e){}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  const gpu=await assertHardwareGpu(page);
  await page.waitForFunction(()=>window.__keelInit&&typeof window.__tutDebug==='function'
    &&typeof renderWarRoom==='function'&&typeof showFrontScreen==='function'
    &&typeof window.trainingUiState==='function',null,{timeout:45000});
  /* The remembered intro can finish hiding between isVisible() and a pointer
     action.  Invoke the live control synchronously when it is still rendered
     so the smoke does not turn that legitimate transition into a 30 s race. */
  await page.evaluate(()=>{
    const intro=document.getElementById('mfIntroStart');
    if(intro&&getComputedStyle(intro).display!=='none'&&getComputedStyle(intro).visibility!=='hidden')intro.click();
  });
  /* This smoke owns the War Room state, not the first-run modal sequence. Close
     those surfaces through their own runtime bridge so neither can intercept
     the Training-card gesture being tested below. */
  await page.evaluate(()=>{
    const choice=document.getElementById('mfOnboardingChoice'); if(choice) choice.remove();
    document.body.classList.remove('mfOnboardingOpen');
    if(typeof apClose==='function')apClose();
  });

  const fresh=await renderTrainingState(page,{
    tutorial:{done:false,skipped:false,version:0,progress:0,rewardedVersion:0},
    trainingMode:false,active:false,stepIdx:0,running:false,paused:false
  });
  assertIdentityAndGeometry(fresh,'Fresh');
  assert(fresh.state==='RECOMMENDED · SKIPS WAR TABLE'&&fresh.description.toUpperCase().includes('START TRAINING'),
    'fresh Training state/action copy is wrong: '+JSON.stringify(fresh));

  const interrupted=await renderTrainingState(page,{
    tutorial:{done:false,skipped:true,version:0,progress:4,rewardedVersion:0},
    trainingMode:false,active:false,stepIdx:4,running:false,paused:false
  });
  assertIdentityAndGeometry(interrupted,'Interrupted');
  assert(interrupted.state==='INCOMPLETE · RESTARTABLE'&&interrupted.description.toUpperCase().includes('RESTART TRAINING'),
    'interrupted Training state/action copy is wrong: '+JSON.stringify(interrupted));

  const active=await renderTrainingState(page,{
    tutorial:{done:false,skipped:false,version:0,progress:4,rewardedVersion:0},
    trainingMode:true,active:true,stepIdx:4,running:true,paused:true
  });
  assertIdentityAndGeometry(active,'Active');
  assert(active.state==='TRAINING PAUSED · RESUMABLE'&&active.description.toUpperCase().includes('RESUME TRAINING'),
    'active Training state/action copy is wrong: '+JSON.stringify(active));

  const png=join(out,'training-war-room-mobile.png');
  await page.screenshot({path:png});

  /* Exercise the card's real handler without starting a synthetic battle: an
     active Training operation takes the production resume path and closes the
     War Room. This proves the inspected card is not merely decorative copy. */
  await page.locator(cardSelector).tap();
  await page.waitForFunction(()=>paused===false&&getComputedStyle(document.getElementById('warScr')).display==='none');
  const resumed=await page.evaluate(()=>({paused,warRoom:getComputedStyle(document.getElementById('warScr')).display,
    training:window.trainingUiState()}));
  assert(resumed.training.active,'War Room Training card did not preserve the live Training operation');

  const completed=await renderTrainingState(page,{
    tutorial:{done:true,skipped:false,version:999,progress:999,rewardedVersion:999},
    trainingMode:false,active:false,stepIdx:0,running:false,paused:false
  });
  assertIdentityAndGeometry(completed,'Completed');
  assert(completed.state==='COMPLETED · REPLAYABLE'&&completed.description.toUpperCase().includes('REPLAY TRAINING'),
    'completed Training state/action copy is wrong: '+JSON.stringify(completed));

  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,url,viewport:{width:393,height:852,deviceScaleFactor:2},gpu,
    fresh,interrupted,active,resumed,completed,screenshot:png,capturedAt:new Date().toISOString()},null,2));
}finally{
  await closePwBrowser(browser);
}
