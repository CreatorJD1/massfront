/* Smoke-test the public cloud build at an iPhone-sized touch viewport.
   Usage: node tools/test-cloud-playtest.mjs [URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||
  'https://creatorjd-massfront-playtest.static.hf.space/';
const local=/^http:\/\/(?:127\.0\.0\.1|localhost)(?::|\/)/.test(url);
const out=join(root,'releases',local?'v1.32.0-local-web-mobile.png':'cloud-playtest-iphone.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
await mkdir(join(root,'releases'),{recursive:true});

const browser=await launchPwBrowser({
  headless:true,
  executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']
});

try{
  const context=await browser.newContext({
    viewport:{width:393,height:852},
    deviceScaleFactor:2,
    hasTouch:true,
    isMobile:true,
    colorScheme:'dark'
  });
  const page=await context.newPage();
  const pageErrors=[];
  const failed=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('requestfailed',r=>{
    const error=r.failure()?.errorText||'failed',requestUrl=r.url();
    /* Galactic Exploration is an intentionally optional pack. The launcher's
       HEAD capability probe may be aborted by a static Space/service worker;
       the UI converts that exact result to NOT INCLUDED IN THIS BUILD. */
    if(r.method()==='HEAD'&&/\/modules\/space_exploration\/index\.html(?:[?#]|$)/.test(requestUrl)&&error==='net::ERR_ABORTED')return;
    failed.push(requestUrl+': '+error);
  });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof APP_VERSION!=='undefined'&&typeof render==='function'&&
    typeof TYPES!=='undefined'&&typeof BT!=='undefined',{timeout:60000});
  await page.waitForTimeout(2500);
  /* The launcher is now the intentional boot gateway. Exercise the same
     signed-out/offline route a player uses instead of treating the hidden
     legacy start screen behind it as a boot failure. */
  const introStart=page.locator('#mfIntroStart');
  const accountOffline=page.locator('#apOfflineBtn');
  const launcherPrimary=page.locator('#mfLaunchPlay');
  const launcherOffline=page.locator('#mfLaunchOffline');
  let introClicks=0,accountClicks=0,launcherClicks=0,gateState=null;
  const gateDeadline=Date.now()+45000;
  while(Date.now()<gateDeadline){
    gateState=await page.evaluate(()=>{
      const shown=id=>{const el=document.getElementById(id);return !!(el&&getComputedStyle(el).display!=='none'&&
        getComputedStyle(el).visibility!=='hidden'&&!el.hidden&&el.getAttribute('aria-hidden')!=='true');};
      const snap=typeof window.mfLauncherSnapshot==='function'?window.mfLauncherSnapshot():null;
      return {intro:shown('mfIntroStart')&&shown('mfPreAlphaIntro'),account:shown('apOfflineBtn'),
        primary:shown('mfLaunchPlay')&&!document.getElementById('mfLaunchPlay').disabled,
        offline:shown('mfLaunchOffline')&&!document.getElementById('mfLaunchOffline').disabled,
        start:shown('startScreen'),passed:!!(snap&&snap.passed),snapshot:snap};
    });
    if(gateState.start&&gateState.passed)break;
    if(gateState.account&&accountClicks<2){accountClicks++;await accountOffline.click();await page.waitForTimeout(250);continue;}
    if(gateState.intro&&introClicks<2){introClicks++;await introStart.click();await page.waitForTimeout(250);continue;}
    if((gateState.primary||gateState.offline)&&launcherClicks<2){
      /* Update-state delivery can change the launch action in the same task
         that enables it. Let that render settle, then verify the resulting
         launcher state before allowing one explicit retry. */
      launcherClicks++;await page.waitForTimeout(120);
      if(await launcherPrimary.isVisible()&&await launcherPrimary.isEnabled())await launcherPrimary.click();
      else if(await launcherOffline.isVisible()&&await launcherOffline.isEnabled())await launcherOffline.click();
      await page.waitForTimeout(250);continue;
    }
    await page.waitForTimeout(250);
  }
  if(!gateState||!gateState.start||!gateState.passed)
    throw new Error('launcher did not hand off to main menu '+JSON.stringify(gateState));
  const onboardingSkip=page.locator('#mfOnboardingSkip');
  if(await onboardingSkip.isVisible()) await onboardingSkip.click();
  const state=await page.evaluate(() => ({
    version:String(APP_VERSION),
    webgl2:!!document.querySelector('#gl')?.getContext('webgl2'),
    units:TYPES.length,
    buildings:Object.keys(BT).length,
    homeVisible:getComputedStyle(document.querySelector('#startScreen')).display!=='none',
    launcherPassed:typeof window.mfLauncherSnapshot==='function'&&!!window.mfLauncherSnapshot().passed,
    manifest:document.querySelector('link[rel="manifest"]')?.href||''
  }));
  await page.screenshot({path:out,fullPage:false});
  if(pageErrors.length) throw new Error('page errors:\n'+pageErrors.join('\n'));
  if(failed.length) throw new Error('failed requests:\n'+failed.join('\n'));
  if(!state.webgl2||!state.homeVisible||!state.launcherPassed) throw new Error('invalid boot state '+JSON.stringify(state));
  console.log(JSON.stringify({...state,screenshot:out},null,2));
}finally{
  await browser.close();
}
