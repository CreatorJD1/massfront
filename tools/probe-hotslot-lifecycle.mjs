import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';

const url=process.env.MASSFRONT_URL||'http://127.0.0.1:8903/';
const browser=await launchPwBrowser({ownershipMode:'isolated'});
let failed=false;
try{
  const page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof hotBuild==='function'&&typeof setHudDeck==='function'&&typeof showHudDock==='function',{timeout:60000});
  const result=await page.evaluate(async()=>{
    const waitTurn=()=>new Promise(resolve=>setTimeout(resolve,0));
    if(typeof hideFrontScreens==='function')hideFrontScreens();
    for(const id of ['startScreen','buildMenu','prodMenu','bldMenu2','baseFinder','pauseOverlay','levelUp','gameOver','loadScr']){
      const el=document.getElementById(id);if(el)el.style.display='none';
    }
    document.body.classList.remove('menuMode','mfMenuOpen');
    running=false;paused=false;hudDeck='abilities';
    hotSelectionSig=()=> 'B:contract';
    hotSelectedBuilders=()=>[0];
    hotBuild();
    const row=document.getElementById('hotSlots'),before=row.querySelector('[data-hot-src="local:builder-repair"]');
    const mark=before&&before.querySelector('.hEm');
    if(mark)mark.innerHTML='<svg data-contract-vector="repair"></svg>';
    hotBuild();
    const after=row.querySelector('[data-hot-src="local:builder-repair"]');
    const directSources=[...row.querySelectorAll(':scope > .hotSlot')].map(el=>el.dataset.hotSrc||'');
    const artPreserved=before===after&&!!(after&&after.querySelector('[data-contract-vector="repair"]'));
    const sample=[
      {kind:'local',hotSrc:'local:contract',em:'L',nm:'LOCAL',fn:()=>{}},
      {kind:'mode',mode:7,em:'M',nm:'MODE'},
      {kind:'ab',src:'buildBtn',em:'A',nm:'OWNER'}
    ];
    hotUtilityToggle(sample);
    const utilitySources=[...document.querySelectorAll('#hotUtilityPanel > .hotUtility')].map(el=>el.dataset.hotSrc||'');
    setHudDeck('orders',true);
    const deckClear=document.querySelectorAll('#hotUtilityPanel > *').length===0&&document.getElementById('hotUtilityPanel').style.display==='none';

    setHudDeck('abilities',true);hotUtilityToggle(sample);showHudDock(false);
    const dockClear=document.querySelectorAll('#hotUtilityPanel > *').length===0&&document.getElementById('hotUtilityPanel').style.display==='none';

    showHudDock(true,'abilities');hotUtilityToggle(sample);
    document.getElementById('buildMenu').style.display='block';await waitTurn();
    const contextClear=document.querySelectorAll('#hotUtilityPanel > *').length===0&&document.getElementById('hotUtilityPanel').style.display==='none';

    document.getElementById('buildMenu').style.display='none';hotUtilityToggle(sample);
    paused=true;document.getElementById('pauseOverlay').style.display='flex';await waitTurn();
    const pauseClear=document.querySelectorAll('#hotUtilityPanel > *').length===0&&document.getElementById('hotUtilityPanel').style.display==='none';

    paused=false;document.getElementById('pauseOverlay').style.display='none';hotUtilityToggle(sample);hotBuild();
    const rebuildClear=document.querySelectorAll('#hotUtilityPanel > *').length===0&&document.getElementById('hotUtilityPanel').style.display==='none';
    return {directSources,utilitySources,artPreserved,deckClear,dockClear,contextClear,pauseClear,rebuildClear};
  });
  const checks={
    directSources:result.directSources.length>0&&result.directSources.every(Boolean)&&new Set(result.directSources).size===result.directSources.length,
    utilitySources:result.utilitySources.length===3&&result.utilitySources.every(Boolean)&&new Set(result.utilitySources).size===3,
    artPreserved:result.artPreserved,deckClear:result.deckClear,dockClear:result.dockClear,
    contextClear:result.contextClear,pauseClear:result.pauseClear,rebuildClear:result.rebuildClear,
    runtimeErrors:errors.length===0
  };
  const bad=Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name);
  if(bad.length){failed=true;console.error(JSON.stringify({status:'FAIL',bad,result,errors},null,2));}
  else console.log(JSON.stringify({status:'PASS',checks,result},null,2));
}finally{
  await closePwBrowser(browser);
}
if(failed)process.exit(1);
