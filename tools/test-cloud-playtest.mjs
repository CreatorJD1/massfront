/* Smoke-test the public cloud build at an iPhone-sized touch viewport.
   Usage: node tools/test-cloud-playtest.mjs [URL] */
import {chromium} from 'playwright';
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

const browser=await chromium.launch({
  headless:true,
  executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']
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
  page.on('requestfailed',r=>failed.push(r.url()+': '+(r.failure()?.errorText||'failed')));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof APP_VERSION!=='undefined'&&typeof render==='function'&&
    typeof TYPES!=='undefined'&&typeof BT!=='undefined',{timeout:60000});
  await page.waitForTimeout(2500);
  const state=await page.evaluate(() => ({
    version:String(APP_VERSION),
    webgl2:!!document.querySelector('#gl')?.getContext('webgl2'),
    units:TYPES.length,
    buildings:Object.keys(BT).length,
    homeVisible:getComputedStyle(document.querySelector('#startScreen')).display!=='none',
    manifest:document.querySelector('link[rel="manifest"]')?.href||''
  }));
  await page.screenshot({path:out,fullPage:false});
  if(pageErrors.length) throw new Error('page errors:\n'+pageErrors.join('\n'));
  if(failed.length) throw new Error('failed requests:\n'+failed.join('\n'));
  if(!state.webgl2||!state.homeVisible) throw new Error('invalid boot state '+JSON.stringify(state));
  console.log(JSON.stringify({...state,screenshot:out},null,2));
}finally{
  await browser.close();
}
