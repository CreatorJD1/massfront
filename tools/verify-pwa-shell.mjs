#!/usr/bin/env node
/* Real Chromium verification of the packaged PWA shell. The first controlled
   reload warms runtime fallbacks; the second reload is fully offline. */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';
import { collectEvidenceIdentity, sha256File } from './evidence-foundation/fingerprints.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WWW = resolve(ROOT, 'www');
const tag=process.argv[2]||new Date().toISOString().replace(/[:.]/g,'-');
if(!/^[a-zA-Z0-9_-]+$/.test(tag))throw new Error('Invalid evidence tag');
const out=resolve(ROOT,'.tmp','pwa-shell',tag),report={status:'FAIL',tag,at:new Date().toISOString(),
  scope:'Hardware Chromium controlled PWA shell and two offline reloads; not WebKit or physical Apple acceptance',
  physicalDevice:false,webkit:false,offline:[],screenshots:[],errors:[],network:{blockedHttp:[],blockedSockets:[],blockedProxy:[],deniedOfflineOrigin:[],originResponses:0}};
const isLoopback=value=>{try{return ['127.0.0.1','localhost','[::1]'].includes(new URL(value).hostname);}catch{return false;}};
const cleanUrl=value=>{try{const u=new URL(value);return u.origin+u.pathname;}catch{return String(value).slice(0,160);}};
const redact=value=>String(value).replace(/(?:https?|wss?):\/\/[^\s"'<>]+/g,cleanUrl).slice(0,1500);
const record=(list,value)=>{if(list.length<1000)list.push(value);};
let freeze,browser,page,context,initialIdentity,originOffline=false;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };

if (!existsSync(resolve(WWW, 'sw.js'))) throw new Error('PWA_PACKAGE_MISSING: run node tools/pack-www.mjs first');
let expectedCacheName;

async function dismissLaunchIntro(page) {
  await page.waitForFunction(() => !document.getElementById('mfBootCover') || !!document.getElementById('mfIntroSkip'), null, { timeout: 120000 });
  if (await page.locator('#mfBootCover').count()) {
    await page.locator('#mfIntroSkip').click({ timeout: 10000 });
    await page.waitForFunction(() => !document.getElementById('mfBootCover'), null, { timeout: 30000 });
  }
}

const server = createServer(async (request, response) => {
  try {
    // The same loopback server is a deny-only browser proxy. It never forwards
    // a request, including SW fetches that Playwright routing cannot intercept.
    if(/^https?:\/\//.test(request.url||'')&&!isLoopback(request.url)){
      record(report.network.blockedProxy,cleanUrl(request.url));response.writeHead(403);response.end('Network isolated');return;
    }
    if(originOffline){record(report.network.deniedOfflineOrigin,cleanUrl(new URL(request.url||'/', 'http://localhost')));request.socket.destroy();return;}
    let pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
    if (pathname === '/') pathname = '/index.html';
    const file = resolve(WWW, `.${pathname}`);
    const rel = relative(WWW, file);
    if (rel === '..' || rel.startsWith(`..${sep}`) || !existsSync(file)) { response.writeHead(404); response.end('Not Found'); return; }
    const body=await readFile(file);
    // Fail the real network request, not with an HTTP error page: this worker's
    // network-first policy correctly falls back only on a transport failure.
    if(originOffline){record(report.network.deniedOfflineOrigin,pathname);request.socket.destroy();return;}
    report.network.originResponses++;
    response.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch (error) { response.writeHead(500); response.end(error.message); }
});
for(const event of ['connect','upgrade'])server.on(event,(request,socket)=>{
  record(report.network.blockedProxy,{kind:event,target:redact(request.url)});
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
});
try {
  await mkdir(out,{recursive:true});
  freeze=await acquireVerificationFreeze({root:ROOT,label:'pwa-shell-'+tag});
  initialIdentity=await collectEvidenceIdentity({root:ROOT,packageRoot:WWW});report.identity=initialIdentity;
  const serviceWorkerSource=await readFile(resolve(WWW,'sw.js'),'utf8'),
    serviceWorkerVersion=serviceWorkerSource.match(/const\s+MF_SW_VERSION\s*=\s*['"]([^'"]+)['"]/u)?.[1];
  if(!serviceWorkerVersion)throw new Error('PWA_CACHE_VERSION_UNREADABLE');
  expectedCacheName=`massfront-pwa-${serviceWorkerVersion}`;
  report.serviceWorker={version:serviceWorkerVersion,sha256:await sha256File(resolve(WWW,'sw.js'))};
  const descriptor=JSON.parse(await readFile(resolve(WWW,'assets/data/runtime-compatibility.json'),'utf8'));
  report.runtime={buildVersion:descriptor.buildVersion,manifestHash:descriptor.manifestHash,balanceHash:descriptor.balanceHash};
  await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
  const url=`http://127.0.0.1:${server.address().port}/`;report.url=url;
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true,extraArgs:[
    `--proxy-server=${url}`,'--proxy-bypass-list=<-loopback>;127.0.0.1;localhost;[::1]',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE ::1, EXCLUDE [::1]','--disable-quic',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});
  context=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true,
    reducedMotion:'reduce',serviceWorkers:'allow'});
  await context.route('**/*',route=>{
    if(isLoopback(route.request().url()))return route.continue();
    record(report.network.blockedHttp,{method:route.request().method(),url:cleanUrl(route.request().url())});return route.abort('blockedbyclient');
  });
  if(typeof context.routeWebSocket!=='function')throw new Error('WebSocket isolation unavailable');
  await context.routeWebSocket('**/*',socket=>{
    if(isLoopback(socket.url())){socket.connectToServer();return;}
    record(report.network.blockedSockets,cleanUrl(socket.url()));socket.close({code:1008,reason:'Network isolated'});
  });
  report.network.installed=true;report.network.serviceWorkers='allow';report.network.proxyForwards=false;
  page=await context.newPage();const pageErrors=report.errors;
  page.on('pageerror', error => pageErrors.push(redact(error.message)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  report.gpu=await assertHardwareGpu(page);
  await page.waitForFunction(() => window.__mfPwaDiag?.registered === true, null, { timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller && typeof spawnUnit === 'function', null, { timeout: 90000 });
  const online = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const cachedUrls = (await Promise.all(cacheNames.map(async name => (await caches.open(name)).keys()))).flat().map(request => request.url);
    const runtimeManifest = await fetch('./assets/data/manifest.json').then(response => response.json());
    const cachedPaths = new Set(cachedUrls.map(item => new URL(item).pathname));
    const expectedRuntimePaths = runtimeManifest.order.map(item => new URL(item, location.href).pathname);
    return {
      controlled: !!navigator.serviceWorker.controller,
      cacheNames,
      cachedUrls,
      expectedRuntimeCount: expectedRuntimePaths.length,
      missingRuntimePaths: expectedRuntimePaths.filter(item => !cachedPaths.has(item)),
      manifestDisplay: (await fetch('./assets/app.webmanifest').then(response=>response.json())).display
    };
  });
  if (!online.controlled) throw new Error('PWA_NOT_CONTROLLED_AFTER_RELOAD');
  if (!online.cacheNames.some(name => name === expectedCacheName)) throw new Error(`PWA_CACHE_VERSION_MISSING: expected ${expectedCacheName}; found ${online.cacheNames.join(', ')}`);
  if (online.cachedUrls.some(item => /(?:update(?:-preview)?\.json|assets\/update-config\.json)(?:\?|$)/.test(item))) throw new Error('PWA_UPDATER_MANIFEST_WAS_CACHED');
  if (online.missingRuntimePaths.length) throw new Error(`PWA_RUNTIME_CACHE_INCOMPLETE: ${online.missingRuntimePaths.join(', ')}`);
  if(!['standalone','fullscreen','minimal-ui'].includes(online.manifestDisplay))throw new Error('PWA_MANIFEST_DISPLAY_NOT_INSTALLABLE');
  report.online={...online,cachedUrls:online.cachedUrls.map(cleanUrl)};

  originOffline=true;report.network.offlineOriginCutoff=new Date().toISOString();
  report.network.originResponsesAtCutoff=report.network.originResponses;
  server.closeAllConnections?.();
  await page.context().setOffline(true);
  for(let launch=1;launch<=2;launch++){
  const offline={launch};report.offline.push(offline);
  const navigation=await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  offline.navigation={status:navigation?.status(),fromServiceWorker:navigation?.fromServiceWorker()};
  offline.afterNavigation=await readOfflineState();
  await page.waitForFunction(() => typeof spawnUnit === 'function' && !!navigator.serviceWorker.controller, null, { timeout: 90000 });
  /* Chromium can honour the host's reduced-motion preference. MASSFRONT then
     deliberately waits for the player to dismiss the title instead of using
     the 2.8 s auto-close timer, so exercise that real interaction rather than
     treating an accessible reduced-motion state as an offline boot failure. */
  await dismissLaunchIntro(page);
  Object.assign(offline,await readOfflineState());
  offline.uncachedProbe=await page.evaluate(async launch=>{
    try{const response=await fetch('/__pwa_offline_probe_'+launch,{cache:'no-store',signal:AbortSignal.timeout(5000)});return {reachable:true,status:response.status};}
    catch(error){return {reachable:false,error:error.name};}
  },launch);
  offline.originResponsesAfterCutoff=report.network.originResponses-report.network.originResponsesAtCutoff;
  // navigator.onLine is diagnostic, not an offline oracle: the real origin is
  // denied and an uncached fetch must fail while cached navigation boots.
  if (!offline.runtimeReady || !offline.controlled) throw new Error('PWA_OFFLINE_RUNTIME_NOT_READY');
  if(!offline.navigation.fromServiceWorker||offline.uncachedProbe.reachable||offline.originResponsesAfterCutoff!==0)throw new Error('PWA_OFFLINE_CACHE_NOT_PROVEN');
  offline.layout=await captureLayout('offline-'+launch+'-portrait');
  }
  await page.setViewportSize({width:915,height:412});
  await page.waitForFunction(()=>innerWidth===915&&innerHeight===412,null,{timeout:10000});
  report.landscape=await captureLayout('offline-landscape');
  if (pageErrors.length) throw new Error(`PWA_PAGE_ERRORS: ${pageErrors.join(' | ')}`);
  await freeze.checkpoint('PWA two offline reloads complete');report.status='PASS';
} catch(error){report.failure=redact(error.message);process.exitCode=1;
} finally {
  await page?.context().setOffline(false).catch(() => {});
  await context?.close().catch(() => {});
  if(browser)await closePwBrowser(browser).catch(() => {});
  report.network.finalized=true;report.network.pageClosed=!!page?.isClosed();
  server.closeAllConnections?.();
  if(server.listening)await new Promise(resolveClose => server.close(resolveClose));
  if(freeze){
    try{
      report.finalIdentity=await collectEvidenceIdentity({root:ROOT,packageRoot:WWW});
      report.sourceStable=initialIdentity?.worktreeFingerprint===report.finalIdentity.worktreeFingerprint&&
        initialIdentity?.runtimeFingerprint===report.finalIdentity.runtimeFingerprint&&initialIdentity?.packageFingerprint===report.finalIdentity.packageFingerprint;
      if(!report.sourceStable)throw new Error('PWA_SOURCE_OR_PACKAGE_CHANGED');
    }catch(error){report.status='FAIL';report.sourceStable=false;report.identityError=redact(error.message);process.exitCode=1;}
    await freeze.release({assertStable:true}).catch(error=>{report.status='FAIL';report.sourceStable=false;report.freezeError=redact(error.message);process.exitCode=1;});
  }
  report.finishedAt=new Date().toISOString();await mkdir(out,{recursive:true});
  await writeFile(resolve(out,'evidence.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,evidence:resolve(out,'evidence.json'),sourceStable:report.sourceStable,failure:report.failure,scope:report.scope},null,2));
}

async function readOfflineState(){
  return page.evaluate(()=>({title:document.title,runtimeReady:typeof spawnUnit==='function',controlled:!!navigator.serviceWorker.controller,online:navigator.onLine}));
}

async function captureLayout(label){
  const result=await page.evaluate(()=>{
    const probe=document.createElement('div');probe.style.cssText='position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);const s=getComputedStyle(probe),safeArea=[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft].map(parseFloat);probe.remove();
    return {viewportMeta:document.querySelector('meta[name="viewport"]')?.content||'',innerWidth,innerHeight,
      scrollWidth:document.documentElement.scrollWidth,safeArea,cssSafeArea:CSS.supports('padding-top','env(safe-area-inset-top)'),
      visualViewport:window.visualViewport?{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale}:null,
      standalone:matchMedia('(display-mode: standalone)').matches};
  });
  if(!/width\s*=\s*device-width/.test(result.viewportMeta)||!/viewport-fit\s*=\s*cover/.test(result.viewportMeta))throw new Error('PWA_VIEWPORT_CONTRACT');
  if(!result.cssSafeArea||!result.safeArea.every(value=>Number.isFinite(value)&&value>=0))throw new Error('PWA_SAFE_AREA_CONTRACT');
  if(result.scrollWidth>result.innerWidth+2)throw new Error('PWA_HORIZONTAL_OVERFLOW');
  if(!result.visualViewport||result.visualViewport.width<=0||result.visualViewport.height<=0)throw new Error('PWA_VISUAL_VIEWPORT_CONTRACT');
  const screenshot=resolve(out,label+'.png');await page.screenshot({path:screenshot,fullPage:false});report.screenshots.push(screenshot);return result;
}
