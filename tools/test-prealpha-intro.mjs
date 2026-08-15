/* Focused <=2-minute mobile smoke test for the supplied-art launch reveal. */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const supplied=process.argv.find(a=>/^https?:\/\//.test(a));
const url=supplied||'http://127.0.0.1:8137/';
const out=join(root,'releases','prealpha'),png=join(out,'prealpha-logo-reveal-mobile.png');
const titleAsset='assets/brand/massfront-title-command-conquer-overwhelm-v1.png';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};let server=null;
await mkdir(out,{recursive:true});
if(!supplied){
  server=spawn('python',['-m','http.server','8137','--directory',root],{stdio:'ignore',windowsHide:true});
  for(let i=0;i<30;i++){try{const r=await fetch(url);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
}
const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark',reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'?intro=1',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__mfIntroDebug&&__mfIntroDebug().open&&
    document.querySelector('img[src*="massfront-title-command-conquer-overwhelm-v1.png"]'),null,{timeout:45000});
  await page.waitForTimeout(250);
  const opening=await page.evaluate(()=>{
    const root=document.getElementById('mfPreAlphaIntro'),skip=mfIntroSkip.getBoundingClientRect(),start=mfIntroStart.getBoundingClientRect();
    const title=root.querySelector('img[src*="massfront-title-command-conquer-overwhelm-v1.png"]'),titleBox=title&&title.getBoundingClientRect();
    return {text:root.textContent.replace(/\s+/g,' ').trim(),build:root.querySelector('.mfTitleBuild')?.textContent.replace(/\s+/g,' ').trim(),debug:__mfIntroDebug(),factionImages:root.querySelectorAll('img[src*="/factions/"]').length,
      skip:{w:skip.width,h:skip.height,l:skip.left,r:skip.right,t:skip.top,b:skip.bottom},
      start:{w:start.width,h:start.height,l:start.left,r:start.right,t:start.top,b:start.bottom},
      title:{asset:title?.getAttribute('src')||'',loaded:!!(title&&title.complete&&title.naturalWidth>0),w:titleBox?.width||0,h:titleBox?.height||0,l:titleBox?.left||0,r:titleBox?.right||0},viewport:{w:innerWidth,h:innerHeight}};
  });
  assert(opening.build==='v1.32.2 \u00b7 PRE-ALPHA','build/version is not one compact v1.32.2 token: '+opening.build);
  assert(opening.title.asset.endsWith(titleAsset)&&opening.title.loaded&&opening.title.w>0&&opening.title.h>0,'supplied title art is missing: '+JSON.stringify(opening.title));
  assert(opening.title.l>=10&&opening.title.r<=opening.viewport.w-10,'supplied title art is clipped: '+JSON.stringify(opening.title));
  /* Retired text-wordmark assertions. The supplied title-art checks above
     are authoritative for the v1.32.2 launch presentation.
  assert(opening.build==='v'+opening.debug.version+' · PRE-ALPHA','build/version is not one compact token: '+opening.build);
  assert(opening.text.includes('MASSFRONT')&&opening.text.includes('SUPREME MOBILE WARFARE'),'logo reveal is incomplete');
  */
  assert(opening.text.includes('SKIP')&&opening.text.includes('START NOW'),'exit actions are unclear');
  assert(opening.debug.stageId==='title'&&opening.debug.usesFactionArt===false&&opening.factionImages===0,
    'dossier/faction art leaked into title reveal: '+JSON.stringify(opening));
  for(const box of [opening.skip,opening.start]){
    assert(box.h>=48,'title action below 48px: '+JSON.stringify(box));
    assert(box.l>=0&&box.r<=opening.viewport.w+1&&box.t>=0&&box.b<=opening.viewport.h+1,'title action clipped: '+JSON.stringify(box));
  }
  await page.screenshot({path:png});
  const before=await page.evaluate(()=>__mfIntroDebug());await page.waitForTimeout(1000);const after=await page.evaluate(()=>__mfIntroDebug());
  assert(before.open&&after.open&&after.reduced,'reduced-motion reveal did not remain available');
  await page.locator('#mfIntroStart').tap();
  await page.waitForFunction(()=>!__mfIntroDebug().open&&getComputedStyle(document.getElementById('setupScr')).display==='flex');
  await page.evaluate(()=>showFrontScreen('startScreen'));
  const replay=await page.evaluate(()=>!!document.getElementById('mfIntroReplay'));
  assert(!replay,'obsolete replay card is still present');

  /* Legacy seen state and established careers cannot suppress a launch
     sequence: it is presentation, not a first-run reward. */
  const veteran=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  await veteran.addInitScript(()=>{localStorage.setItem('mf_prealpha_cinematic_v1','test-seen');localStorage.setItem('massfront_profiles_v1','test-career');});
  const vp=await veteran.newPage();await vp.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await vp.waitForFunction(()=>window.__mfIntroDebug&&__mfIntroDebug().open,null,{timeout:45000});
  const veteranState=await vp.evaluate(()=>__mfIntroDebug());
  assert(veteranState.launchSequence&&veteranState.open,'stored career suppressed launch title: '+JSON.stringify(veteranState));
  await veteran.close();
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,opening,replay,veteranState,screenshot:png},null,2));
}finally{await browser.close();if(server)server.kill();}
