#!/usr/bin/env node
/* Real Chromium verification of the packaged PWA shell. The first controlled
   reload warms runtime fallbacks; the second reload is fully offline. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WWW = resolve(ROOT, 'www');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };

if (!existsSync(resolve(WWW, 'sw.js'))) throw new Error('PWA_PACKAGE_MISSING: run node tools/pack-www.mjs first');

async function dismissLaunchIntro(page) {
  await page.waitForFunction(() => !document.getElementById('mfBootCover') || !!document.getElementById('mfIntroSkip'), null, { timeout: 120000 });
  if (await page.locator('#mfBootCover').count()) {
    await page.locator('#mfIntroSkip').click({ timeout: 10000 });
    await page.waitForFunction(() => !document.getElementById('mfBootCover'), null, { timeout: 30000 });
  }
}

const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
    if (pathname === '/') pathname = '/index.html';
    const file = resolve(WWW, `.${pathname}`);
    const rel = relative(WWW, file);
    if (rel === '..' || rel.startsWith(`..${sep}`) || !existsSync(file)) { response.writeHead(404); response.end('Not Found'); return; }
    response.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(await readFile(file));
  } catch (error) { response.writeHead(500); response.end(error.message); }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });
let page;
try {
  page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
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
      manifestDisplay: (await fetch('./assets/app.webmanifest')).ok
    };
  });
  if (!online.controlled) throw new Error('PWA_NOT_CONTROLLED_AFTER_RELOAD');
  if (!online.cacheNames.some(name => name === 'massfront-pwa-1.33.48-shell1')) throw new Error(`PWA_CACHE_VERSION_MISSING: ${online.cacheNames.join(', ')}`);
  if (online.cachedUrls.some(item => /(?:update(?:-preview)?\.json|assets\/update-config\.json)(?:\?|$)/.test(item))) throw new Error('PWA_UPDATER_MANIFEST_WAS_CACHED');
  if (online.missingRuntimePaths.length) throw new Error(`PWA_RUNTIME_CACHE_INCOMPLETE: ${online.missingRuntimePaths.join(', ')}`);

  await page.context().setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof spawnUnit === 'function' && !!navigator.serviceWorker.controller, null, { timeout: 90000 });
  /* Chromium can honour the host's reduced-motion preference. MASSFRONT then
     deliberately waits for the player to dismiss the title instead of using
     the 2.8 s auto-close timer, so exercise that real interaction rather than
     treating an accessible reduced-motion state as an offline boot failure. */
  await dismissLaunchIntro(page);
  const offline = await page.evaluate(() => ({ title: document.title, runtimeReady: typeof spawnUnit === 'function', controlled: !!navigator.serviceWorker.controller }));
  if (!offline.runtimeReady || !offline.controlled) throw new Error('PWA_OFFLINE_RUNTIME_NOT_READY');
  if (pageErrors.length) throw new Error(`PWA_PAGE_ERRORS: ${pageErrors.join(' | ')}`);
  console.log(JSON.stringify({ status: 'PASS', url, online: { controlled: online.controlled, cacheNames: online.cacheNames, cachedEntries: online.cachedUrls.length, expectedRuntimeCount: online.expectedRuntimeCount, missingRuntimePaths: online.missingRuntimePaths }, offline }, null, 2));
} finally {
  await page?.context().setOffline(false).catch(() => {});
  await page?.close().catch(() => {});
  await closePwBrowser(browser).catch(() => {});
  server.closeAllConnections?.();
  await new Promise(resolveClose => server.close(resolveClose));
}
