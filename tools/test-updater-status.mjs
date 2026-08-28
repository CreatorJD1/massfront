/* Focused regression for the two update-channel version directions.
   Usage: node tools/test-updater-status.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {installOfflineNetworkIsolation} from './offline-network-isolation.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir=join(root,'releases','updater');
const shot=join(outDir,'updater-local-ahead-mobile.png');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(outDir,{recursive:true});

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark',serviceWorkers:'block'});
  const networkIsolation=await installOfflineNetworkIsolation(page);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof renderUpdatePanel==='function'&&typeof updSet==='function',null,{timeout:60000});
  const states=await page.evaluate(()=>{
    updVerShown=APP_VERSION;updOpen=true;
    UPD.manifest={version:'1.30.0',notes:'',files:[]};
    updSet('stale');
    const stale={title:document.getElementById('updTxt').textContent,
      sub:document.getElementById('updSub').textContent,
      button:document.getElementById('updBtn').textContent};
    UPD.manifest={version:'1.32.0',notes:'Test release',files:[{path:'x',size:1024}]};
    updSet('available');
    const available={title:document.getElementById('updTxt').textContent,
      sub:document.getElementById('updSub').textContent,
      button:document.getElementById('updBtn').textContent};
    UPD.manifest={version:'1.30.0',notes:'',files:[]};
    updSet('stale');
    const r=document.getElementById('updBtn').getBoundingClientRect();
    return {version:APP_VERSION,stale,available,touch:{w:r.width,h:r.height}};
  });
  assert(states.stale.title==='LOCAL BUILD AHEAD','newer local build is mislabeled');
  assert(!/outdated/i.test(states.stale.title+states.stale.sub),'stale wording still says outdated');
  assert(states.stale.sub.includes('update server is v1.30.0'),'server-behind detail missing');
  assert(states.available.title==='UPDATE AVAILABLE'&&states.available.button==='DOWNLOAD','newer server direction regressed');
  assert(states.touch.w>=44&&states.touch.h>=44,'update control is below the 44px touch floor');
  assert(errors.length===0,'page errors: '+errors.join(' | '));
  await page.screenshot({path:shot,fullPage:false,timeout:60000});
  const networkEvidence=await networkIsolation.finalize('updater status regression');
  console.log(JSON.stringify({ok:true,states,screenshot:shot,networkIsolation:networkEvidence},null,2));
}finally{await browser.close();}
