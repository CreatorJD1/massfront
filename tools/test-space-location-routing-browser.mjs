#!/usr/bin/env node
/* Real-document UGA -> War Table location continuity.

   The module and base game use separate documents. This test enters through
   the production ticket issuer, persists a Veyra/Nacre module location, then
   enters the Galactic War, opens the flagship's UGA Campaign Hub, then
   activates Standard Deployment. The accepted result must be Nordhall Peaks
   in the live base setup globals. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { closePwBrowser, launchPwBrowser } from './pw-browser.mjs';

const root = process.cwd();
const outDir = resolve(root, 'tmp/space-location-routing');
const mime = {
  '.bin': 'application/octet-stream', '.css': 'text/css', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.html': 'text/html', '.js': 'text/javascript',
  '.json': 'application/json', '.ktx2': 'image/ktx2', '.m4a': 'audio/mp4',
  '.mjs': 'text/javascript', '.ogg': 'audio/ogg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url || '/', 'http://local').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(root, `.${pathname}`);
    if (!file.startsWith(root) || !existsSync(file)) {
      response.writeHead(404); response.end('not found'); return;
    }
    const body = await readFile(file);
    response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch (error) {
    response.writeHead(500); response.end(String(error?.stack || error));
  }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir(outDir, { recursive: true });

const report = { origin, startedAt: new Date().toISOString(), pageErrors: [], consoleErrors: [], steps: [] };
let browser;
let page;
try {
  browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });
  page = await browser.newPage({ viewport: { width: 412, height: 900 }, hasTouch: true, colorScheme: 'dark' });
  page.on('pageerror', error => report.pageErrors.push(String(error?.stack || error)));
  page.on('console', message => {
    if (message.type() === 'error' && !/net::ERR_FAILED|Failed to load resource/i.test(message.text())) report.consoleErrors.push(message.text());
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname) || /^(blob|data):/.test(url.protocol)) return route.continue();
    return route.abort();
  });
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  report.gpu = await assertHardwareGpu(page);
  await page.waitForFunction(() => typeof mfLauncherSnapshot === 'function' && !document.getElementById('mfBootCover'), null, { timeout: 90_000 });
  await page.waitForFunction(() => {
    const online = document.getElementById('mfLaunchPlay');
    const offline = document.getElementById('mfLaunchOffline');
    return online && !online.disabled || offline && !offline.disabled && getComputedStyle(offline).display !== 'none';
  });
  if (await page.locator('#mfLaunchPlay').isEnabled() && /CONTINUE TO INTRO/.test(await page.locator('#mfLaunchPlay').innerText())) {
    await page.locator('#mfLaunchPlay').click();
  } else {
    await page.locator('#mfLaunchOffline').click();
  }
  await page.locator('#mfIntroStart').click();
  await page.locator('#apOfflineBtn').click();
  await page.waitForURL('**/modules/space_exploration/index.html*', { timeout: 60_000 });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__, null, { timeout: 90_000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  report.steps.push('production entry ticket opened the module');

  report.savedBeforeReload = await page.evaluate(async () => {
    const host = window.__MASSFRONT_SPACE_HOST__;
    const domain = await import('./src/domain/state_store.js');
    const state = domain.createShowcaseReadyDomainState(host.commanderCatalogContext);
    state.profileId = window.__MASSFRONT_SPACE__.getState().profileId;
    state.route = { scene: 'uga', systemId: 'veyra', targetId: 'veyra_nacre', returnRoute: null };
    await host.saveCampaignSnapshot(state);
    const saved = host.loadCampaignSnapshot();
    return { key: host.key, route: saved?.route || null, stored: Boolean(host.storage.getItem(host.key)) };
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__, null, { timeout: 90_000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  const restored = await page.evaluate(() => ({ scene: window.__MASSFRONT_SPACE__.scene, route: window.__MASSFRONT_SPACE__.getState().route }));
  report.restored = restored;
  assert.equal(restored.scene, 'uga');
  assert.equal(restored.route.systemId, 'veyra');
  assert.equal(restored.route.targetId, 'veyra_nacre');
  await page.locator('#renderVeil').waitFor({ state: 'hidden', timeout: 30_000 });
  await page.screenshot({ path: resolve(outDir, '01-restored-veyra-nacre-uga.png') });
  report.steps.push('saved UGA scene and Veyra/Nacre target restored');

  await page.evaluate(() => window.__MASSFRONT_SPACE__.openCampaignHub());
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.scene === 'galaxy');
  await page.locator('#galaxyOperations .galaxy-operation-card').first().waitFor({ state: 'visible' });
  await page.screenshot({ path: resolve(outDir, '02-galactic-war-campaign-entry.png') });
  report.steps.push('Campaign Hub entry opened the Galactic War strategic layer');
  await page.locator('#galaxyFlagshipBtn').click();
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.scene === 'uga');
  await page.locator('[data-nav="more"]').click();
  const standard = page.locator('[data-session-route="standard-classic"]');
  await standard.waitFor({ state: 'visible' });
  assert.equal(await standard.isEnabled(), true);
  await page.screenshot({ path: resolve(outDir, '03-uga-campaign-hub-standard.png') });
  await standard.click();
  await page.waitForURL(/galacticRoute=/, { timeout: 30_000 });
  await page.waitForFunction(() => window.__MF_GALACTIC_BRIDGE?.status === 'menu-route', null, { timeout: 90_000 });
  await page.waitForFunction(() => typeof curMap === 'string' && curMap === 'nordhall_peaks_medium' && curRegionId === 'nordhall_peaks');
  const base = await page.evaluate(() => ({
    status: window.__MF_GALACTIC_BRIDGE.status,
    map: curMap,
    region: curRegionId,
    theme: curTheme,
    planet: typeof planetForMap === 'function' ? planetForMap(curMap) : null,
    setupVisible: getComputedStyle(document.getElementById('setupScr')).display !== 'none',
    stage: typeof mfGalaxyStage === 'string' ? mfGalaxyStage : null,
    brief: document.getElementById('mfMissionHero')?.textContent?.replace(/\s+/g, ' ').trim() || ''
  }));
  assert.equal(base.status, 'menu-route');
  assert.equal(base.map, 'nordhall_peaks_medium');
  assert.equal(base.region, 'nordhall_peaks');
  assert.equal(base.theme, 'arctic');
  assert.equal(base.planet, 'nordhall');
  assert.equal(base.setupVisible, true);
  assert.equal(base.stage, 'deploy');
  assert.match(base.brief, /NORDHALL/i);
  assert.match(base.brief, /SKYSHIELD RANGE/i);
  await page.screenshot({ path: resolve(outDir, '04-nacre-routed-to-nordhall-peaks.png') });
  report.steps.push('UGA Standard route opened Nordhall Peaks in the live War Table');
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  report.pass = true;
  report.base = base;
} catch (error) {
  report.pass = false;
  report.failure = String(error?.stack || error);
  await page?.screenshot({ path: resolve(outDir, 'failure.png') }).catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2));
  await page?.close().catch(() => {});
  await closePwBrowser(browser).catch(() => {});
  await new Promise(resolveClose => server.close(resolveClose));
}

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.pass ? 0 : 1;
