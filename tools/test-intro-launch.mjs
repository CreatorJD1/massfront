/* Verify the launch title screen is safe on a narrow phone and returns on
   every fresh app launch. Usage: node tools/test-intro-launch.mjs [URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8911/';
const out=join(root,'releases','title-fit-360-mobile.png');
const titleAsset='assets/brand/massfront-title-command-conquer-overwhelm-v1.png';
await mkdir(join(root,'releases'),{recursive:true});

const browser=await launchPwBrowser({
  headless:true,
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']
});

try{
  const context=await browser.newContext({
    viewport:{width:360,height:800},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark',reducedMotion:'reduce'
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function waitForIntro(){
    await page.waitForFunction(()=>typeof APP_VERSION!=='undefined'&&
      document.querySelector('.mfTitleReveal.open')&&
      document.querySelector('img[src*="massfront-title-command-conquer-overwhelm-v1.png"]'),{timeout:60000});
  }
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await waitForIntro();
  /* Measure the supplied title art after it settles. This is the actual
     visual asset players see, rather than the old text-only wordmark. */
  await page.waitForTimeout(1650);
  const first=await page.evaluate(()=>{
    const title=document.querySelector('img[src*="massfront-title-command-conquer-overwhelm-v1.png"]');
    const logo=title&&title.getBoundingClientRect();
    return {
      version:document.querySelector('.mfTitleBuild')?.textContent.trim(),
      replay:!!document.querySelector('#mfIntroReplay'),
      asset:title?.getAttribute('src')||'',loaded:!!(title&&title.complete&&title.naturalWidth>0),
      left:Math.round(logo?.left||0),right:Math.round(logo?.right||0),width:Math.round(logo?.width||0),height:Math.round(logo?.height||0),viewport:innerWidth
    };
  });
  await page.screenshot({path:out,fullPage:false});
  await page.evaluate(()=>{
    localStorage.setItem('mf_prealpha_cinematic_v2','old state');
    localStorage.setItem('massfront_profiles_v1','old career');
    document.querySelector('#mfIntroSkip').click();
  });
  await page.waitForFunction(()=>!document.querySelector('.mfTitleReveal.open'),{timeout:10000});
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});
  await waitForIntro();
  const relaunch=await page.evaluate(()=>document.querySelector('.mfTitleReveal.open')?.id||'');
  if(errors.length) throw new Error('page errors: '+errors.join('; '));
  if(first.replay) throw new Error('obsolete replay card is still present');
  if(!first.asset.endsWith(titleAsset)||!first.loaded||first.width<1||first.height<1) throw new Error('supplied title asset is not visible '+JSON.stringify(first));
  if(!/^v1\.32\.2\s+\u00b7\s+PRE-ALPHA$/.test(first.version||'')) throw new Error('bad v1.32.2 build label '+first.version);
  /* Retired text-wordmark build-label assertion retained only as a record of
     the prior test shape; the v1.32.2 launch-art assertion above is authoritative.
  if(!/^v1\.32\.1\s+·\s+PRE-ALPHA$/.test(first.version||'')) throw new Error('bad build label '+first.version);
  */
  if(first.left<10||first.right>first.viewport-10) throw new Error('logo exceeds safe gutter '+JSON.stringify(first));
  if(relaunch!=='mfPreAlphaIntro') throw new Error('launch intro did not return after reload');
  console.log(JSON.stringify({ok:true,...first,relaunch,screenshot:out},null,2));
}finally{
  await browser.close();
}
