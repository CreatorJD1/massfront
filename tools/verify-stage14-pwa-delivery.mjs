import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';

const root=new URL('../',import.meta.url);
const out=new URL('../audit/stage14-pwa-ota/',import.meta.url);
const outPath=name=>fileURLToPath(new URL(name,out));
const port=Number(process.env.MF_STAGE14_PORT||8914);
const base='http://127.0.0.1:'+port+'/';
const packageVersion=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
const sha=async rel=>createHash('sha256').update(await readFile(new URL('../'+rel,import.meta.url))).digest('hex');
const evidence={capturedAt:new Date().toISOString(),url:base,viewport:{width:412,height:900},
  source:{offlineSha256:await sha('src/offline.js'),packagedOfflineSha256:await sha('www/src/offline.js'),
    indexSha256:await sha('www/index.html'),bootSha256:await sha('www/boot.js')},passes:[],failures:[]};
const check=(ok,label,detail)=>{
  (ok?evidence.passes:evidence.failures).push({label,detail});
  if(!ok) throw new Error(label+': '+JSON.stringify(detail));
};

await mkdir(out,{recursive:true});
const browser=await launchPwBrowser();
let page=null;
try{
  page=await browser.newPage({viewport:evidence.viewport,hasTouch:true});
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(String(e&&e.message||e)));
  page.on('console',m=>{
    /* HTTP failures are recorded below with their URL. Chromium's duplicate
       generic console line has no URL and would make an expected optional-pack
       absence impossible to classify. */
    if(m.type()==='error'&&!/^Failed to load resource:/.test(m.text()))pageErrors.push('console: '+m.text());
  });
  page.on('response',response=>{
    const optionalPackProbe=response.status()===404&&new URL(response.url()).pathname==='/modules/space_exploration/index.html';
    if(response.status()>=400&&!optionalPackProbe)pageErrors.push('http '+response.status()+': '+response.url());
  });
  await page.goto(base+'?diag=1',{waitUntil:'domcontentloaded',timeout:30000});
  evidence.gpu=await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof window.mfPlatformDiagnostics==='function',null,{timeout:90000});
  await page.waitForFunction(()=>{
    const p=document.querySelector('#mfPlatformDiag pre');
    return p&&p.textContent.trim().startsWith('{');
  /* Hardware diagnostics include storage, service-worker and renderer probes.
     A cold mobile-profile launch can finish those just after 30 seconds even
     though the report is healthy (the timeout screenshot proved it appeared).
     Keep the gate bounded, but align it with the 90-second collector budget. */
  },null,{timeout:90000});
  const diag=JSON.parse(await page.locator('#mfPlatformDiag pre').textContent());
  evidence.diagnostics=diag;
  check(diag.version===packageVersion,'running version is current packaged version',diag.version);
  check(diag.serviceWorker&&diag.serviceWorker.registered===true,'service worker registered',diag.serviceWorker);
  check(diag.storage&&diag.storage.supported===true,'storage estimate available',diag.storage);
  check(diag.renderer&&diag.renderer!=='unavailable','renderer status exposed',diag.renderer);
  check(diag.textureFamily&&diag.textureFamily.preferred!=='unavailable','texture family exposed',diag.textureFamily);
  check(Array.isArray(diag.runtimeErrors),'runtime error list exposed',diag.runtimeErrors);
  await page.screenshot({path:outPath('diagnostics-mobile.png'),fullPage:true});
  await page.click('#mfPlatformDiag [data-act="close"]');

  const intro=page.locator('#mfIntroStart');
  if(await intro.isVisible().catch(()=>false)) await intro.click();
  const offlineGate=page.locator('#apOfflineBtn');
  try{
    await offlineGate.waitFor({state:'visible',timeout:5000});
    await offlineGate.click();
    await offlineGate.waitFor({state:'hidden',timeout:5000});
  }catch(e){ /* A remembered identity legitimately bypasses the account choice. */ }

  /* The launcher is now the intentional gateway to both connected and offline
     play. Resolve the real identity choice first, then enter through the real
     launcher action before testing main-menu System settings. */
  await page.waitForTimeout(150);
  const launchPlay=page.locator('#mfLaunchPlay');
  if(await page.evaluate(()=>document.body.classList.contains('mfLauncherGate'))){
    /* ?diag=1 intentionally opens diagnostics before the launcher. Closing the
       diagnostic can return to its prior screen, so restore the already-active
       gate through the same front-screen router the app uses. */
    if(!await page.locator('#updScr').isVisible().catch(()=>false)){
      await page.evaluate(()=>{ if(typeof showFrontScreen==='function')showFrontScreen('updScr'); });
    }
    await page.locator('#updScr').waitFor({state:'visible',timeout:10000});
    await launchPlay.waitFor({state:'visible',timeout:20000});
    await page.waitForFunction(()=>{
      const button=document.getElementById('mfLaunchPlay');
      return button&&!button.disabled&&/PLAY (?:OFFLINE|CONNECTED)/.test(button.textContent||'');
    },null,{timeout:30000});
    await launchPlay.click();
    await page.waitForFunction(()=>!document.body.classList.contains('mfLauncherGate'),null,{timeout:10000});
  }
  const onboarding=page.locator('#mfOnboardingSkip');
  try{
    await onboarding.waitFor({state:'visible',timeout:1500});
    await onboarding.click();
    await onboarding.waitFor({state:'detached',timeout:5000});
  }catch(e){ /* Existing careers legitimately receive no first-run choice. */ }
  /* mfBindTap intentionally suppresses the synthetic click following a pointer
     commit across replaced controls. Do not make the next independent control
     look like that duplicate. */
  await page.waitForTimeout(700);
  await page.locator('#settingsBtn').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('#setTab-system',{state:'visible',timeout:20000});
  /* renderSettings schedules one final tab-state adoption microtask. Wait for
     it before the real pointer tap or that adoption can legitimately restore
     AUDIO after the test has already selected SYSTEM. */
  await page.waitForTimeout(250);
  await page.locator('#setTab-system').click();
  await page.waitForSelector('#setExtraRows [data-set="pwaInstall"]',{state:'visible'});
  const rows=await page.locator('#setExtraRows [data-set]').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.set,text:n.innerText})));
  evidence.systemRows=rows;
  check(rows.some(r=>r.id==='offline'),'offline control is in System settings',rows);
  check(rows.some(r=>r.id==='pwaInstall'),'install control is in System settings',rows);
  check(rows.some(r=>r.id==='platformDiag'),'diagnostic control is in System settings',rows);
  await page.screenshot({path:outPath('settings-system-mobile.png'),fullPage:true});
  await page.waitForTimeout(700);
  await page.locator('[data-set="platformDiag"]').focus();
  await page.keyboard.press('Enter');
  check(await page.locator('#mfPlatformDiag').isVisible(),'settings diagnostic control opens report',true);
  check(pageErrors.length===0,'no page or console errors',pageErrors);
} catch(e){
  evidence.fatal=String(e&&e.stack||e);
  try{ evidence.failureState=await page.evaluate(()=>({readyState:document.readyState,
    title:document.title,diag:!!document.getElementById('mfPlatformDiag'),
    hasCollector:typeof window.mfPlatformDiagnostics==='function',
    bodyClass:document.body&&document.body.className})); }catch(ignore){}
  try{ evidence.failureScreenshot='failure-mobile.png'; await page.screenshot({path:outPath(evidence.failureScreenshot),fullPage:true}); }catch(ignore){}
} finally {
  await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2)+'\n');
  await closePwBrowser();
}
if(evidence.fatal||evidence.failures.length){
  console.error(JSON.stringify(evidence,null,2));
  process.exit(1);
}
console.log('stage14 PWA delivery PASS '+evidence.passes.length+'/'+evidence.passes.length);
console.log(fileURLToPath(new URL('evidence.json',out)));
