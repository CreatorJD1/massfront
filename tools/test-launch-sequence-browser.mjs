import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';

const url=process.env.MF_LAUNCH_TEST_URL||'http://127.0.0.1:8993/';
const out='tmp/verification/launch-sequence'+(process.env.MF_LAUNCH_TEST_URL?'-packed':'');
await mkdir(out,{recursive:true});
const evidence={url,at:new Date().toISOString(),viewport:{width:412,height:900},sourceHashes:{},errors:[],failedRequests:[],consoleErrors:[],steps:[]};
for(const file of ['src/intro.js','src/launcher.js','src/onboarding.js','src/main.js','modules/space_exploration/src/space_experience.js','modules/space_exploration/src/ui/uga_command.js'])
  evidence.sourceHashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
const browser=await launchPwBrowser();
let context;
try {
  context=await browser.newContext({viewport:evidence.viewport,hasTouch:true});
  const page=await context.newPage();
  page.on('pageerror',e=>evidence.errors.push(e.message));
  page.on('requestfailed',r=>evidence.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
  page.on('console',m=>{if(m.type()==='error')evidence.consoleErrors.push(m.text());});
  // pw-browser intentionally shares one hardware-GPU Chromium. Give this
  // acceptance case a fresh career so another run's faction/tutorial state
  // cannot redirect the post-identity route and create a false launch failure.
  await page.addInitScript(()=>{
    if(sessionStorage.getItem('mf_launch_acceptance_page'))return;
    localStorage.clear();
    sessionStorage.setItem('mf_launch_acceptance_page','1');
  });
  await page.route('**/*',route=>{
    const host=new URL(route.request().url()).hostname;
    return ['127.0.0.1','localhost'].includes(host)||/^(blob|data):/.test(route.request().url())?route.continue():route.abort();
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof mfLauncherSnapshot==='function'&&mfLauncherSnapshot().gate,{timeout:30000});
  evidence.gpu=await assertHardwareGpu(page);
  assert.equal(await page.locator('#apOverlay').isVisible(),false,'login opened before updater');
  assert.equal(await page.locator('#mfIntroStart').isVisible(),false,'intro opened before updater');
  evidence.steps.push('updater-first');
  await page.waitForFunction(()=>!document.getElementById('mfBootCover')&&!document.getElementById('bootCover'),{},{timeout:15000});
  await page.screenshot({path:out+'/01-updater.png'});
  await page.waitForFunction(()=>{
    const primary=document.getElementById('mfLaunchPlay'),offline=document.getElementById('mfLaunchOffline');
    return primary&&!primary.disabled||offline&&!offline.disabled&&getComputedStyle(offline).display!=='none';
  },{},{timeout:30000});
  const primary=page.locator('#mfLaunchPlay');
  if(await primary.isEnabled()&&/CONTINUE TO INTRO/.test(await primary.innerText()))await primary.click();
  else await page.locator('#mfLaunchOffline').click();
  await page.locator('#mfIntroStart').waitFor({state:'visible'});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.mfTitleReveal')).opacity==='1');
  await page.waitForTimeout(1200); // Inspect settled artwork, not the opening cross-fade.
  assert.equal(await page.locator('#apOverlay').isVisible(),false,'login overlapped intro');
  evidence.steps.push('intro-before-login');
  await page.screenshot({path:out+'/02-intro.png'});
  await page.locator('#mfIntroStart').click();
  await page.locator('#apOfflineBtn').waitFor({state:'visible',timeout:10000});
  evidence.steps.push('login-after-intro');
  await page.screenshot({path:out+'/03-login.png'});
  await page.locator('#apOfflineBtn').click();
  await page.waitForURL('**/modules/space_exploration/index.html*',{timeout:30000});
  await page.waitForFunction(()=>window.__MASSFRONT_SPACE__||window.__MASSFRONT_SPACE_ERROR__,{},{timeout:60000});
  await page.evaluate(()=>window.__MASSFRONT_SPACE__?.ready);
  evidence.module=await page.evaluate(()=>({scene:window.__MASSFRONT_SPACE__?.scene,host:window.__MASSFRONT_SPACE_HOST__?.kind,error:String(window.__MASSFRONT_SPACE_ERROR__||''),state:window.__MASSFRONT_SPACE__?.firstEntryIntro}));
  assert.equal(evidence.module.error,'');
  /* SUPERSEDED CONTRACT — this run is not acceptance proof. A fresh player no
     longer lands in `system`: src/launcher.js routes the main UGA entry to
     campaign_hub, and system assets/travel must not start before a deliberate
     departure. The hub-first expectation is scene==='uga' with currentSystem
     null, asserted by tools/verify-launch-home-entry.mjs, which also covers the
     depart/return legs this script's first-entry story rail assumes. Everything
     below this line still drives the old system-first sequence, so fix the whole
     flow against a real run before trusting it — do not just flip this string. */
  assert.equal(evidence.module.scene,'system');
  evidence.steps.push('offline-identity-auto-enters-galactic');
  await page.waitForTimeout(600);
  await page.screenshot({path:out+'/04-galactic.png'});
  await page.waitForTimeout(4100);
  await page.locator('[data-story-action="first-entry-next"]').click();
  await page.locator('[data-story-action="first-entry-continue"]').click();
  await page.locator('[data-story-action="begin-planetary-training"]').waitFor({state:'visible'});
  evidence.steps.push('space-briefings-wait-for-player');
  await page.locator('#btnUgaCommand').click();
  await page.locator('[data-nav="more"]').waitFor({state:'visible',timeout:30000});
  await page.locator('[data-nav="more"]').click();
  await page.locator('[data-hub-route="galactic-research"]').click();
  assert.equal(await page.locator('[data-research]:enabled').count(),0,'fresh uncommissioned research cannot spend');
  await page.locator('[data-action="open-research-construction"]').click();
  await page.locator('[data-build-commission]').waitFor({state:'visible'});
  await page.waitForFunction(()=>window.__MASSFRONT_SPACE__.commandScene.selectedDistrictId==='research');
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.uga-command-shell').getAttribute('data-district'),'research');
  assert.match(await page.locator('.uga-district-plots').innerText(),/Research Directorate/i);
  evidence.steps.push('research-requirement-opens-research-construction');
  await page.screenshot({path:out+'/05-research-construction.png'});
  await page.locator('[data-deck-filter="B"]').click();
  await page.locator('[data-district="engineering"]').click();
  if(!await page.locator('[data-action="upgrade"]').isVisible())await page.locator('[data-action="toggle-sheet"]').click();
  await page.locator('[data-action="upgrade"]').click();
  assert.ok(await page.locator('[data-build-facility]').count()>1,'upgrade must offer facility choices');
  assert.equal(await page.evaluate(()=>window.__MASSFRONT_SPACE__.getState().ship.constructionQueue.length),0,'viewing upgrades must not enqueue or spend');
  evidence.steps.push('upgrade-opens-facility-choices-without-spend');
  await page.locator('[data-nav="more"]').click();
  await page.locator('[data-session-route="standard-classic"]').click();
  await page.waitForURL(/galacticRoute=/,{timeout:30000});
  await page.locator('#setupBack').waitFor({state:'visible',timeout:30000});
  evidence.steps.push('galactic-command-opens-standard-tactical-deployment');
  await page.screenshot({path:out+'/06-standard.png'});
  // The connected War Table is a five-stage drill-down. Its Back control
  // deliberately walks deploy -> region -> planet -> system before exposing
  // the strategic-home return, so verify the player-visible path instead of
  // assuming one tap can escape every depth.
  for(let depth=0;depth<5&&!/WAR ROOM/.test(await page.locator('#setupBack').innerText());depth++)
    await page.locator('#setupBack').click();
  assert.match(await page.locator('#setupBack').innerText(),/WAR ROOM/,'standard deployment did not unwind to its strategic-home exit');
  await page.locator('#setupBack').click();
  await page.waitForURL('**/modules/space_exploration/index.html*',{timeout:30000});
  await page.waitForFunction(()=>window.__MASSFRONT_SPACE__,{},{timeout:60000});
  await page.evaluate(()=>window.__MASSFRONT_SPACE__.ready);
  await page.locator('[data-nav="missions"]').waitFor({state:'visible',timeout:30000});
  evidence.steps.push('tactical-deployment-back-returns-galactic-command');
  await page.locator('[data-nav="missions"]').click();
  await page.locator('[data-host-route="new-career-faction"]').click();
  await page.waitForURL(/galacticRoute=/,{timeout:30000});
  evidence.hireRoute=page.url();
  await page.waitForTimeout(1500);
  evidence.steps.push('missions-hire-commander-secured-base-route');
  await page.screenshot({path:out+'/07-hire-commander.png'});
  assert.deepEqual(evidence.errors,[]);
  evidence.pass=true;
} catch(error){evidence.pass=false;evidence.failure=error.stack;throw error;}
finally {await writeFile(out+'/result.json',JSON.stringify(evidence,null,2));await context?.close();await closePwBrowser();}
console.log(JSON.stringify(evidence,null,2));
