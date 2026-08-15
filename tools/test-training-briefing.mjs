/* Focused mobile smoke test for the Training Operation discoverability card.
   Usage: node tools/test-training-briefing.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const out=join(root,'releases','ui-stage6');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(ok,msg)=>{ if(!ok) throw new Error(msg); };
await mkdir(out,{recursive:true});

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,
    hasTouch:true,isMobile:true,colorScheme:'dark'});
  await context.addInitScript(()=>{try{localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');}catch(e){}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__keelInit&&typeof renderOps==='function'&&
    typeof showFrontScreen==='function'&&document.getElementById('keelTrainingOp'),null,{timeout:45000});
  await page.evaluate(()=>{
    META.matches=0; META.tutorial={done:false,skipped:false,version:0,progress:0,rewardedVersion:0};
    showFrontScreen('startScreen');
  });
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('keelTrainingCallout')).display==='flex');
  const entry=await page.evaluate(()=>{
    const c=keelTrainingCallout,b=c.querySelector('button'),r=b.getBoundingClientRect();
    return {text:c.textContent.replace(/\s+/g,' ').trim(),button:{w:r.width,h:r.height}};
  });
  assert(entry.text.includes('FIELD ORIENTATION')&&entry.text.includes('0 / 19 OBJECTIVES'),
    'first-time recommendation is not discoverable: '+entry.text);
  assert(entry.button.h>=48,'main Training brief action is below 48px: '+JSON.stringify(entry.button));
  await page.locator('#keelTrainingCallout button').tap();
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('opsScr')).display==='flex'&&
    !document.getElementById('opsPane-threat').hidden);
  await page.evaluate(()=>{
    META.matches=0;
    META.tutorial={done:false,skipped:true,version:3,progress:4,rewardedVersion:0};
    renderOps(); showFrontScreen('opsScr'); mfSetTabs(document.getElementById('opsScr'),'threat',false);
    document.querySelector('#opsScr>.opsScroll').scrollTop=0;
  });
  await page.waitForFunction(()=>document.getElementById('keelTrainingOp')?.dataset.progress==='4');
  await page.waitForFunction(()=>{
    const i=document.querySelector('#keelTrainingOp .ktoPortrait>img'); return i&&i.complete&&i.naturalWidth>0;
  },null,{timeout:15000});
  await page.waitForTimeout(200);

  const interrupted=await page.evaluate(()=>{
    const card=document.getElementById('keelTrainingOp'),action=card.querySelector('.ktoAction'),
      portrait=card.querySelector('.ktoPortrait>img'),crest=card.querySelector('.ktoCrestImg'),
      r=card.getBoundingClientRect(),a=action.getBoundingClientRect(),back=opsBack.getBoundingClientRect();
    return {text:card.textContent.replace(/\s+/g,' ').trim(),progress:card.dataset.progress,
      signature:card.dataset.stateSig,topics:card.querySelectorAll('.ktoTeach span').length,
      action:action.textContent.trim(),actionBox:{w:a.width,h:a.height},card:{w:r.width,h:r.height},
      portrait:portrait.naturalWidth,crest:!!crest,visible:[...document.querySelectorAll('#opsScr [data-mf-panel]:not([hidden])')].map(p=>p.dataset.mfPanel),
      back:{h:back.height,b:back.bottom},viewport:innerHeight,callout:getComputedStyle(keelTrainingCallout).display};
  });
  for(const value of ['INCOMPLETE · RESTARTABLE','Captain Elara Kai','KEEL tactical guidance','4 / 19',
    'CAMERA','ECONOMY','PRODUCTION','DEFENCE','PLATOONS','SCOUTING','TECH','POWERS','SAVES','FIRST CLEAR · +150 ⬡ CORES'])
    assert(interrupted.text.includes(value),'Training brief omitted: '+value+'\n'+interrupted.text);
  assert(interrupted.text.includes('a new drop restarts at camera control'),'interrupted copy implies a false checkpoint resume');
  assert(interrupted.progress==='4'&&interrupted.topics===9,'progress/topics are not represented correctly');
  assert(interrupted.action==='↻ RESTART TRAINING','interrupted training action is misleading: '+interrupted.action);
  assert(interrupted.actionBox.h>=48&&interrupted.actionBox.w>=280,'Training action is below mobile target: '+JSON.stringify(interrupted.actionBox));
  assert(interrupted.card.w>=320&&interrupted.card.w<=360,'Training card overflows/underfills: '+JSON.stringify(interrupted.card));
  assert(interrupted.portrait>0&&interrupted.crest,'canonical Nova portrait or crest failed to render');
  assert(JSON.stringify(interrupted.visible)===JSON.stringify(['threat']),'Threat is not the sole visible category');
  assert(interrupted.back.h>=48&&interrupted.back.b<=interrupted.viewport+1,'Back control is clipped');

  /* A live paused lesson has a true Resume path, including from Settings. */
  await page.evaluate(()=>{
    const d=window.__tutDebug(); d.TUT.trainingMode=true; d.TUT.active=true; d.TUT.stepIdx=4;
    running=true; paused=true; if(typeof carrier!=='undefined') carrier.active=false; renderOps();
    document.querySelector('#opsScr>.opsScroll').scrollTop=0;
  });
  await page.waitForFunction(()=>document.getElementById('keelTrainingOp')?.dataset.stateSig.split(':')[1]==='true');
  const active=await page.evaluate(()=>{
    const c=document.getElementById('keelTrainingOp'); return {text:c.textContent.replace(/\s+/g,' ').trim(),
      action:c.querySelector('.ktoAction').textContent.trim(),active:c.classList.contains('active')};
  });
  assert(active.active&&active.text.includes('TRAINING PAUSED · RESUMABLE')&&active.text.includes('Current lesson:'),
    'active training does not expose its resume state: '+JSON.stringify(active));
  assert(active.action==='▶ RESUME TRAINING','active lesson lacks the true Resume action');
  const png=join(out,'training-operation-briefing-mobile.png');
  await page.evaluate(()=>{
    scrollTo(0,0); document.documentElement.scrollTop=0; document.body.scrollTop=0;
    document.querySelector('#opsScr>.opsScroll').scrollTop=0;
  });
  await page.waitForFunction(()=>{
    const i=document.querySelector('#keelTrainingOp .ktoPortrait>img'); return i&&i.complete&&i.naturalWidth>0;
  });
  await page.waitForTimeout(300);
  await page.screenshot({path:png});
  await page.evaluate(async()=>{
    renderSettings(); showFrontScreen('settingsScr'); await Promise.resolve();
    mfSetTabs(document.getElementById('setList'),'system',false);
  });
  await page.waitForSelector('#keelSetRow');
  const settingsResume=await page.evaluate(()=>keelSetRow.textContent.replace(/\s+/g,' ').trim());
  assert(settingsResume.includes('RESUME'),'paused Training Settings row does not offer Resume: '+settingsResume);
  await page.locator('#keelSetRow').tap();
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('settingsScr')).display==='none'&&!paused);
  await page.evaluate(()=>{
    const d=window.__tutDebug(); d.TUT.trainingMode=false; d.TUT.active=false; running=false; paused=false;
    showFrontScreen('opsScr'); mfSetTabs(document.getElementById('opsScr'),'threat',false); renderOps();
  });

  /* The front-page recommendation is for true first-time profiles only. */
  await page.evaluate(()=>{ META.matches=3; });
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('keelTrainingCallout')).display==='none');
  const veteranHidden=await page.evaluate(()=>getComputedStyle(keelTrainingCallout).display==='none');
  assert(veteranHidden,'experienced profile was forced to keep the first-operation prompt');

  /* Completion must expose replay while clearly marking the one-time reward claimed. */
  await page.evaluate(()=>{
    META.tutorial={done:true,skipped:false,version:3,progress:19,rewardedVersion:3}; renderOps();
  });
  await page.waitForFunction(()=>document.getElementById('keelTrainingOp')?.dataset.progress==='19');
  const complete=await page.evaluate(()=>{
    const c=document.getElementById('keelTrainingOp');
    return {done:c.classList.contains('done'),text:c.textContent.replace(/\s+/g,' ').trim(),action:c.querySelector('.ktoAction').textContent.trim()};
  });
  assert(complete.done&&complete.text.includes('COMPLETED · REPLAYABLE')&&complete.text.includes('FIRST-CLEAR REWARD CLAIMED'),
    'completed state/reward claim is unclear: '+JSON.stringify(complete));
  assert(complete.action==='↻ REPLAY TRAINING','completed operation lacks replay access');

  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,entry,interrupted,active,settingsResume,complete,veteranHidden,screenshot:png},null,2));
}finally{
  await browser.close();
}
