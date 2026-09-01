/* Local-browser regression for the two update-channel version directions.
   A loopback page and automated screenshot do not prove a production release.
   Usage: node tools/test-updater-status.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {installOfflineNetworkIsolation} from './offline-network-isolation.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evidenceClassification,validateEvidenceClassification} from './evidence-classification.mjs';

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
  /* This regression owns updater presentation, not the launch-title clock.
     Put the shell in its post-title state deterministically before opening the
     real updater front screen; otherwise body:not(.mfIntroDone) intentionally
     gives every overlay a 0x0 box and the touch measurement proves nothing. */
  await page.evaluate(()=>document.body.classList.add('mfIntroDone'));
  const states=await page.evaluate(()=>{
    const p=APP_VERSION.split('.').map(Number);
    const behind=[p[0],p[1],Math.max(0,p[2]-1)].join('.');
    const ahead=[p[0],p[1],p[2]+1].join('.');
    updVerShown=APP_VERSION;updOpen=true;
    UPD.manifest={version:behind,notes:'',files:[]};
    updSet('stale');
    const stale={title:document.getElementById('updTxt').textContent,
      sub:document.getElementById('updSub').textContent,
      button:document.getElementById('updBtn').textContent};
    const hotfixManifest={version:ahead,notes:'Test release',kind:'patch',
      patchFrom:APP_VERSION,category:'hotfix',
      files:[{path:'x',size:25*1024*1024}]};
    UPD.manifest=hotfixManifest;
    UPD.offerKind=null;UPD.transferKind=null;
    updSet('available');
    const available={title:document.getElementById('updTxt').textContent,
      sub:document.getElementById('updSub').textContent,
      button:document.getElementById('updBtn').textContent};
    UPD.manifest={version:ahead,notes:'System release',kind:'full',category:'system',
      files:[{path:'x',size:1024}]};
    UPD.offerKind=null;UPD.transferKind=null;
    updSet('available');
    const system={title:document.getElementById('updTxt').textContent};
    UPD.manifest={version:ahead,notes:'Legacy release',kind:'patch',
      patchFrom:APP_VERSION,files:[{path:'x',size:25*1024*1024}]};
    UPD.offerKind=null;UPD.transferKind=null;
    updSet('available');
    const legacy={title:document.getElementById('updTxt').textContent};
    UPD.manifest={version:behind,notes:'',files:[]};
    updSet('stale');
    /* The updater lives on its own front screen. Measuring it while that
       ancestor is display:none reports 0x0 and cannot prove a touch target. */
    if(typeof showFrontScreen==='function') showFrontScreen('updScr');
    const r=document.getElementById('updBtn').getBoundingClientRect();
    const boot=document.getElementById('mfBootCover');if(boot)boot.style.display='none';
    const intro=document.getElementById('mfPreAlphaIntro');if(intro)intro.style.display='none';
    document.body.classList.remove('mfIntroOpen');
    UPD.manifest=hotfixManifest;UPD.offerKind=null;UPD.transferKind=null;
    updSet('available');
    return {version:APP_VERSION,behind,ahead,stale,available,system,legacy,
      touch:{w:r.width,h:r.height}};
  });
  assert(states.stale.title==='LOCAL BUILD AHEAD','newer local build is mislabeled');
  assert(!/outdated/i.test(states.stale.title+states.stale.sub),'stale wording still says outdated');
  assert(states.stale.sub.includes('update server is v'+states.behind),'server-behind detail missing');
  assert(states.available.title.startsWith('UPDATE AVAILABLE')&&states.available.button==='DOWNLOAD',
    'newer server direction regressed');
  assert(states.available.title.includes('·  HOTFIX')&&!states.available.title.includes('OVERHAUL'),
    'declared large HOTFIX was mislabeled: '+states.available.title);
  assert(states.system.title.includes('·  SYSTEM'),
    'SYSTEM category was not rendered: '+states.system.title);
  assert(states.legacy.title.includes('·  OVERHAUL'),
    'legacy size fallback was lost: '+states.legacy.title);
  assert(states.touch.w>=44&&states.touch.h>=44,
    'update control is below the 44px touch floor: '+JSON.stringify(states.touch));
  assert(errors.length===0,'page errors: '+errors.join(' | '));
  await page.screenshot({path:shot,fullPage:false,timeout:60000});
  const networkEvidence=await networkIsolation.finalize('updater status regression');
  const evidence=evidenceClassification('localBrowser',{runtime:'Chromium',servedUrl:url,network:'loopback-isolated',
    artifact:'current locally served browser files',screenshot:'automated-uninspected-artifact',production:false});
  validateEvidenceClassification(evidence,'localBrowser');
  const stagedArchiveEvidence=evidenceClassification('stagedArchiveVm',{tool:'tools/test-updater-two-launch.mjs',
    artifact:'local staged OTA archive',runtime:'node:vm packaged stand-in',browser:false,production:false});
  validateEvidenceClassification(stagedArchiveEvidence,'stagedArchiveVm');
  console.log(JSON.stringify({ok:true,...evidence,states,screenshot:shot,networkIsolation:networkEvidence,
    relatedTwoLaunchScope:stagedArchiveEvidence},null,2));
}finally{await browser.close();}
