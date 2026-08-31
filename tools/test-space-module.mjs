#!/usr/bin/env node
/* Standalone exploration-module smoke test.

   The module is an ES-module/WebGL application and therefore must be tested
   from an HTTP origin. A file:// load makes every imported module a CORS
   failure, while merely printing page/console errors allowed the old harness
   to finish with a false-green exit. This harness owns an ephemeral loopback
   server and browser, exercises the current player-facing paths, and treats
   page, CORS, request, HTTP, application, WebGL, and cleanup errors as fatal. */

import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { closePwBrowser, launchPwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDir = join(root, 'dist');
const modulePath = '/modules/space_exploration/index.html';
const viewport = { width: 412, height: 860 };
const args = new Set(process.argv.slice(2));

const MIME = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ktx2': 'image/ktx2',
  '.m4a': 'audio/mp4',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
});

function isInsideRoot(serverRoot, file) {
  const rel = relative(serverRoot, file);
  return Boolean(rel) && rel !== '..' && !rel.startsWith(`..${sep}`) && !resolve(rel).startsWith(`..${sep}`);
}

async function startLoopbackServer(serverRoot = root) {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(requestUrl.pathname);
      const requested = pathname === '/' ? modulePath : pathname;
      const file = resolve(serverRoot, `.${requested}`);
      if (!isInsideRoot(serverRoot, file) || !existsSync(file)) {
        response.writeHead(404, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }
      const bytes = await readFile(file);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'Cross-Origin-Resource-Policy': 'same-origin',
      });
      if (request.method === 'HEAD') response.end();
      else response.end(bytes);
    } catch (error) {
      response.writeHead(500, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(`Loopback server error: ${error?.message || error}`);
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const address = server.address();
  let closed = false;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    url: `http://127.0.0.1:${address.port}${modulePath}`,
    async close() {
      if (closed) return;
      closed = true;
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
    },
  };
}

function emptyDiagnostics() {
  return {
    pageErrors: [],
    consoleErrors: [],
    corsErrors: [],
    requestFailures: [],
    responseErrors: [],
    crashes: [],
  };
}

function diagnosticFailures(diagnostics, runtime = {}) {
  const failures = [];
  for (const message of diagnostics.pageErrors || []) failures.push(`PAGE_ERROR: ${message}`);
  for (const message of diagnostics.consoleErrors || []) failures.push(`CONSOLE_ERROR: ${message}`);
  for (const message of diagnostics.corsErrors || []) failures.push(`CORS_ERROR: ${message}`);
  for (const request of diagnostics.requestFailures || []) failures.push(`REQUEST_FAILED: ${request.url} (${request.error})`);
  for (const response of diagnostics.responseErrors || []) failures.push(`HTTP_${response.status}: ${response.url}`);
  for (const message of diagnostics.crashes || []) failures.push(`PAGE_CRASH: ${message}`);
  if (runtime.applicationError) failures.push(`APPLICATION_ERROR: ${runtime.applicationError}`);
  if (runtime.contextLosses > 0) failures.push(`WEBGL_CONTEXT_LOST: ${runtime.contextLosses}`);
  if (runtime.contextIsLost === true) failures.push('WEBGL_CONTEXT_IS_LOST');
  if (runtime.glError != null && runtime.glError !== 0) failures.push(`WEBGL_ERROR: ${runtime.glError}`);
  if (runtime.ready !== true) failures.push('MODULE_NOT_READY');
  if (runtime.scene && !['system', 'survey', 'galaxy', 'uga'].includes(runtime.scene)) failures.push(`UNKNOWN_SCENE: ${runtime.scene}`);
  return failures;
}

function attachDiagnostics(page, diagnostics) {
  page.on('pageerror', error => diagnostics.pageErrors.push(String(error?.stack || error)));
  page.on('console', message => {
    const text = message.text();
    if (/cors|cross-origin|access-control-allow-origin/i.test(text)) diagnostics.corsErrors.push(text);
    if (message.type() === 'error') diagnostics.consoleErrors.push(text);
  });
  page.on('requestfailed', request => {
    diagnostics.requestFailures.push({ url: request.url(), error: request.failure()?.errorText || 'unknown request failure' });
  });
  page.on('response', response => {
    if (response.status() >= 400) diagnostics.responseErrors.push({ url: response.url(), status: response.status() });
  });
  page.on('crash', () => diagnostics.crashes.push('renderer process crashed'));
}

async function waitForScene(page, expected, timeout = 90_000) {
  await page.waitForFunction(scene => {
    const experience = window.__MASSFRONT_SPACE__;
    return experience && experience.scene === scene && !experience.recovering;
  }, expected, { timeout });
}

async function screenshot(page, filename) {
  await page.screenshot({ path: join(outputDir, filename), fullPage: false });
}

async function selectSpatialContact(page, id) {
  const selector = `.spatial-callout[data-id="${id}"]`;
  await page.waitForSelector(selector, { state: 'attached', timeout: 20_000 });
  await page.locator(selector).dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0 });
}

async function clickGalaxySystem(page, id) {
  const point = await page.evaluate(systemId => {
    const map = window.__MASSFRONT_SPACE__?.galaxyMap;
    const node = map?.systemNodes?.[systemId];
    const canvas = map?.inputElement;
    if (!map || !node || !canvas) return null;
    const projected = node.core.position.clone().project(map.camera);
    const box = canvas.getBoundingClientRect();
    return {
      x: box.left + (projected.x + 1) * box.width / 2,
      y: box.top + (1 - projected.y) * box.height / 2,
    };
  }, id);
  if (!point) throw new Error(`Galaxy system ${id} could not be projected for player input.`);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(name => document.querySelector('#galaxyInfoName')?.textContent?.trim() === name, id.toUpperCase(), { timeout: 15_000 });
}

async function runtimeState(page) {
  return page.evaluate(() => {
    const experience = window.__MASSFRONT_SPACE__;
    const applicationError = window.__MASSFRONT_SPACE_ERROR__;
    const gl = experience?.engine?.renderer?.getContext?.();
    return {
      ready: Boolean(experience && !applicationError),
      scene: experience?.scene || null,
      applicationError: applicationError ? String(applicationError?.stack || applicationError) : null,
      contextLosses: Number(window.__mfSpaceModuleHarness?.contextLosses || 0),
      contextIsLost: gl ? Boolean(gl.isContextLost()) : null,
      glError: gl ? gl.getError() : null,
      canvasCount: document.querySelectorAll('canvas').length,
      veilFailed: document.querySelector('#renderVeil')?.classList.contains('failed') || false,
    };
  });
}

async function runModuleTest() {
  await mkdir(outputDir, { recursive: true });
  const diagnostics = emptyDiagnostics();
  let localServer = null;
  let browser = null;
  let page = null;
  let gpu = null;
  let runtime = {};
  let fatalError = null;
  const cleanupFailures = [];

  try {
    localServer = await startLoopbackServer();
    console.log('Navigating to MASSFRONT Space Exploration Module:', localServer.url);
    if (!localServer.url.startsWith('http://127.0.0.1:')) throw new Error(`INVALID_TEST_ORIGIN: ${localServer.url}`);

    browser = await launchPwBrowser({ headless: true, ownershipMode: 'isolated' });
    page = await browser.newPage({
      viewport,
      hasTouch: true,
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    });
    attachDiagnostics(page, diagnostics);
    await page.addInitScript(() => {
      window.__mfSpaceModuleHarness = { contextLosses: 0 };
      addEventListener('webglcontextlost', () => { window.__mfSpaceModuleHarness.contextLosses++; }, true);
    });

    const navigation = await page.goto(localServer.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (!navigation || !navigation.ok()) throw new Error(`MODULE_NAVIGATION_FAILED: ${navigation?.status() ?? 'no response'}`);
    gpu = await assertHardwareGpu(page);
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__ || window.__MASSFRONT_SPACE_ERROR__, null, { timeout: 30_000 });
    await page.evaluate(async () => {
      if (window.__MASSFRONT_SPACE_ERROR__) throw window.__MASSFRONT_SPACE_ERROR__;
      await window.__MASSFRONT_SPACE__.ready;
    });
    await waitForScene(page, 'system');

    await screenshot(page, 'module_01_aelos_system.png');

    console.log('Testing autopilot hold control...');
    await page.locator('#btnAutopilotHold').click();
    await page.waitForTimeout(250);
    await screenshot(page, 'module_02_autopilot_hold.png');

    console.log('Opening the Concord Spindle faction district...');
    await selectSpatialContact(page, 'aelos_embassy_spindle');
    await page.locator('#actInteract').click();
    await waitForScene(page, 'uga');
    await screenshot(page, 'module_03_faction_district.png');
    await page.locator('.uga-command-exit').click();
    await waitForScene(page, 'system');

    console.log('Opening the Peregrine Logistics Array...');
    await selectSpatialContact(page, 'aelos_logistics_array');
    await page.locator('#actInteract').click();
    await waitForScene(page, 'uga');
    await screenshot(page, 'module_04_logistics_district.png');
    await page.locator('.uga-command-exit').click();
    await waitForScene(page, 'system');

    console.log('Opening Caldris orbital survey...');
    await page.locator('#actSurvey').click();
    await waitForScene(page, 'survey');
    await page.waitForSelector('#surveyModal.active', { state: 'visible' });
    await screenshot(page, 'module_05_planetary_survey.png');
    const probe = page.locator('#btnSurveyLaunchProbe');
    if (await probe.isDisabled()) throw new Error('DIRECTED_PROBE_UNAVAILABLE_IN_CLEAN_SANDBOX');
    await probe.click();
    await page.waitForTimeout(350);
    await screenshot(page, 'module_06_probe_launched.png');
    await page.locator('#btnCloseSurvey').click();
    await waitForScene(page, 'system');

    console.log('Opening the UGA Strike/Expedition Bay...');
    await page.locator('#btnUgaCommand').click();
    await waitForScene(page, 'uga');
    await page.locator('.uga-district-button[data-district="hangar"]').click();
    await page.waitForTimeout(300);
    await screenshot(page, 'module_07_strike_expedition_bay.png');
    await page.locator('.uga-command-exit').click();
    await waitForScene(page, 'system');

    console.log('Opening the galaxy map and selecting Veyra...');
    await page.locator('#btnGalaxyMap').click();
    await waitForScene(page, 'galaxy');
    await page.waitForSelector('.galaxy-system-label[data-id="veyra"]', { state: 'attached' });
    await screenshot(page, 'module_08_galaxy_map.png');
    await clickGalaxySystem(page, 'veyra');
    await page.waitForTimeout(250);
    await screenshot(page, 'module_09_veyra_route.png');

    runtime = await runtimeState(page);
    if (runtime.veilFailed) throw new Error('MODULE_RENDER_VEIL_FAILED');
  } catch (error) {
    fatalError = String(error?.stack || error);
  } finally {
    if (page) {
      try {
        const finalState = await runtimeState(page);
        runtime = { ...runtime, ...finalState };
      } catch (error) {
        cleanupFailures.push(`runtime state collection failed: ${error?.message || error}`);
      }
      try { await page.close(); } catch (error) { cleanupFailures.push(`page close failed: ${error?.message || error}`); }
    }
    if (browser) {
      try {
        const browserEvidence = await closePwBrowser(browser);
        if (browserEvidence?.cleanup?.success !== true) cleanupFailures.push('owned browser cleanup did not report success');
      } catch (error) {
        cleanupFailures.push(`browser close failed: ${error?.message || error}`);
      }
    }
    if (localServer) {
      try { await localServer.close(); } catch (error) { cleanupFailures.push(`loopback server close failed: ${error?.message || error}`); }
    }
  }

  const failures = diagnosticFailures(diagnostics, runtime);
  if (fatalError) failures.unshift(`TEST_EXECUTION: ${fatalError}`);
  failures.push(...cleanupFailures.map(message => `CLEANUP_ERROR: ${message}`));
  const report = {
    status: failures.length ? 'FAIL' : 'PASS',
    origin: localServer?.origin || null,
    viewport,
    gpu,
    runtime,
    diagnostics,
    screenshots: [
      'module_01_aelos_system.png', 'module_02_autopilot_hold.png', 'module_03_faction_district.png',
      'module_04_logistics_district.png', 'module_05_planetary_survey.png', 'module_06_probe_launched.png',
      'module_07_strike_expedition_bay.png', 'module_08_galaxy_map.png', 'module_09_veyra_route.png',
    ].map(name => join(outputDir, name)),
    failures,
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) throw new Error(`SPACE_MODULE_TEST_FAILED (${failures.length} blocker${failures.length === 1 ? '' : 's'})`);
  console.log('MASSFRONT SPACE EXPLORATION MODULE VERIFIED SUCCESSFULLY');
}

async function runSelfTest() {
  const fixtures = [
    ['page error', { diagnostics: { ...emptyDiagnostics(), pageErrors: ['TypeError'] } }],
    ['console error', { diagnostics: { ...emptyDiagnostics(), consoleErrors: ['WebGL INVALID_OPERATION'] } }],
    ['CORS error', { diagnostics: { ...emptyDiagnostics(), corsErrors: ['blocked by CORS policy'] } }],
    ['request failure', { diagnostics: { ...emptyDiagnostics(), requestFailures: [{ url: 'http://127.0.0.1/missing.js', error: 'net::ERR_FAILED' }] } }],
    ['HTTP error', { diagnostics: { ...emptyDiagnostics(), responseErrors: [{ url: 'http://127.0.0.1/missing.glb', status: 404 }] } }],
    ['application error', { diagnostics: emptyDiagnostics(), runtime: { ready: false, applicationError: 'boot failed' } }],
    ['context loss', { diagnostics: emptyDiagnostics(), runtime: { ready: true, contextLosses: 1, contextIsLost: true, glError: 0 } }],
    ['WebGL error', { diagnostics: emptyDiagnostics(), runtime: { ready: true, contextLosses: 0, contextIsLost: false, glError: 1282 } }],
  ];
  const failures = [];
  const clean = diagnosticFailures(emptyDiagnostics(), { ready: true, contextLosses: 0, contextIsLost: false, glError: 0, scene: 'system' });
  if (clean.length) failures.push(`clean fixture rejected: ${clean.join(' | ')}`);
  for (const [name, fixture] of fixtures) {
    const blockers = diagnosticFailures(fixture.diagnostics, fixture.runtime || { ready: true, contextLosses: 0, contextIsLost: false, glError: 0, scene: 'system' });
    if (!blockers.length) failures.push(`${name} fixture was falsely accepted`);
  }

  let server = null;
  try {
    server = await startLoopbackServer();
    const valid = await fetch(server.url, { cache: 'no-store' });
    if (!valid.ok || !/^text\/html/.test(valid.headers.get('content-type') || '')) failures.push('loopback module response invalid');
    const traversal = await fetch(`${server.origin}/%2e%2e%2fpackage.json`, { cache: 'no-store' });
    if (traversal.status !== 404) failures.push(`path traversal fixture returned ${traversal.status}, expected 404`);
  } catch (error) {
    failures.push(`loopback fixture failed: ${error?.stack || error}`);
  } finally {
    if (server) await server.close().catch(error => failures.push(`loopback fixture cleanup failed: ${error?.message || error}`));
  }

  console.log(JSON.stringify({ status: failures.length ? 'FAIL' : 'PASS', cleanFixture: clean.length === 0, rejectedFailureFixtures: fixtures.length, failures }, null, 2));
  if (failures.length) throw new Error(`SPACE_MODULE_SELF_TEST_FAILED (${failures.length})`);
}

try {
  if (args.has('--self-test')) await runSelfTest();
  else await runModuleTest();
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 1;
}
