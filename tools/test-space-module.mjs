#!/usr/bin/env node
/* Standalone exploration-module smoke test.

   The module is an ES-module/WebGL application and therefore must be tested
   from an HTTP origin. A file:// load makes every imported module a CORS
   failure, while merely printing page/console errors allowed the old harness
   to finish with a false-green exit. This harness owns an ephemeral loopback
   server and browser, exercises the current player-facing paths, and treats
   page, CORS, request, HTTP, application, WebGL, and cleanup errors as fatal. */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { closePwBrowser, launchPwBrowser } from './pw-browser.mjs';
import {
  ACCOUNT_PROFILE_STORAGE_KEY,
  advanceExpeditionCycles,
  commissionCareerFaction,
  createInitialAccountProfile,
  createInitialDomainState,
  deployProbe,
  enqueueConstruction,
  projectAccountProfile,
  serializeAccountProfile,
  serializeDomainState,
} from '../modules/space_exploration/src/domain/index.js';
import { LOCAL_EXPLORATION_CAMPAIGN_STORAGE_KEY } from '../modules/space_exploration/src/host/local_sandbox_host.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDir = join(root, 'dist');
const modulePath = '/modules/space_exploration/index.html';
const viewport = { width: 412, height: 860 };
const args = new Set(process.argv.slice(2));

function preparedAelosWarfrontStorage() {
  let state = commissionCareerFaction(createInitialDomainState(), 'nova');
  state = deployProbe(state, 'aelos_traffic_census').state;
  for (const districtId of ['mission_ops', 'hangar']) {
    state = enqueueConstruction(state, districtId);
    state = advanceExpeditionCycles(state, 1, `warfront-${districtId}-1`, 'survey').state;
    state = advanceExpeditionCycles(state, 1, `warfront-${districtId}-2`, 'survey').state;
  }
  const profile = projectAccountProfile(state, createInitialAccountProfile(state.profileId));
  return {
    campaignKey: LOCAL_EXPLORATION_CAMPAIGN_STORAGE_KEY,
    campaign: serializeDomainState(state),
    profileKey: ACCOUNT_PROFILE_STORAGE_KEY,
    profile: serializeAccountProfile(profile),
  };
}

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

async function sweepSurveyToPeak(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector('#surveyGlobeCanvas');
    const button = document.querySelector('#btnSurveyLaunchProbe');
    if (!canvas || !button) return { unlocked: false, peak: 0, steps: 0 };
    const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
    const event = (type, x, y) => new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 9, isPrimary: true,
      pointerType: 'touch', clientX: x, clientY: y
    });
    const box = canvas.getBoundingClientRect();
    const cx = box.left + box.width * 0.5;
    const cy = box.top + box.height * 0.5;
    let peak = 0;
    let steps = 0;
    for (let row = 0; row < 9 && button.disabled; row++) {
      canvas.dispatchEvent(event('pointerdown', cx, cy));
      // Reset to the south sensor limit, then step through the full latitude
      // band. Relative row nudges accumulated around the first hit and never
      // reached a second signal in the opposite hemisphere.
      window.dispatchEvent(event('pointermove', cx, cy - 200));
      window.dispatchEvent(event('pointermove', cx, cy - 200 + row * 22));
      await frame();
      for (let column = 0; column < 90 && button.disabled; column++) {
        window.dispatchEvent(event('pointermove', cx + column * 9, cy - 200 + row * 22));
        await frame();
        peak = Math.max(peak, parseInt(document.querySelector('#me2SignalStrength')?.textContent || '0', 10) || 0);
        steps += 1;
      }
      window.dispatchEvent(event('pointerup', cx, cy));
      await frame();
    }
    window.dispatchEvent(event('pointerup', cx, cy));
    return {
      unlocked: !button.disabled,
      peak,
      steps,
      label: (button.querySelector('span') || button).textContent.trim(),
      signal: document.querySelector('#me2SignalStrength')?.textContent || null
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
    const surveyFraming = await page.evaluate(() => {
      const survey = window.__MASSFRONT_SPACE__?.planetarySurvey;
      const camera = survey?.camera;
      const stage = document.querySelector('#survey3DStage')?.getBoundingClientRect();
      const dossier = document.querySelector('.survey-dossier')?.getBoundingClientRect();
      if (!camera || !stage || !dossier) return null;
      const verticalFov = camera.fov * Math.PI / 180;
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const distance = Math.hypot(camera.position.x, camera.position.y, camera.position.z);
      return {
        cameraZ: camera.position.z,
        globeWidthRatio: (2 * Math.atan(22 / distance)) / horizontalFov,
        stageWidth: stage.width,
        stageHeight: stage.height,
        dossierTop: dossier.top,
        viewportHeight: innerHeight,
      };
    });
    if (!surveyFraming || surveyFraming.cameraZ < 150 || surveyFraming.globeWidthRatio < .55 || surveyFraming.globeWidthRatio > .82) {
      throw new Error(`SURVEY_GLOBE_FRAMING_INVALID: ${JSON.stringify(surveyFraming)}`);
    }
    if (surveyFraming.stageWidth < 400 || surveyFraming.stageHeight < 840 || surveyFraming.dossierTop < surveyFraming.viewportHeight * .6) {
      throw new Error(`SURVEY_UI_OBSCURES_GLOBE: ${JSON.stringify(surveyFraming)}`);
    }
    await screenshot(page, 'module_05_planetary_survey.png');
    const probe = page.locator('#btnSurveyLaunchProbe');
    if (!await probe.isDisabled()) throw new Error('DIRECTED_PROBE_MUST_START_LOCKED');
    const caldrisSignals = await page.locator('#surveyDiscoveryList').innerText();
    if (!/Outer Relay Phase Trace/.test(caldrisSignals) || /Orbital Traffic Census/.test(caldrisSignals)) {
      throw new Error(`CALDRIS_SURVEY_OWNERSHIP_INVALID: ${caldrisSignals}`);
    }
    await page.locator('.survey-planet-pill[data-planet-id="aelos_ithara"]').click();
    const itharaSignals = await page.locator('#surveyDiscoveryList').innerText();
    if (!/Orbital Traffic Census/.test(itharaSignals) || /Outer Relay Phase Trace/.test(itharaSignals)) {
      throw new Error(`ITHARA_SURVEY_OWNERSHIP_INVALID: ${itharaSignals}`);
    }
    await page.locator('.survey-planet-pill[data-planet-id="aelos_caldris"]').click();
    const beforeProbe = await page.evaluate(() => window.__MASSFRONT_SPACE__.getState());
    await page.evaluate(() => {
      const button = document.querySelector('#btnSurveyLaunchProbe');
      button.disabled = false;
      button.click();
    });
    await page.waitForTimeout(150);
    const afterMiss = await page.evaluate(() => window.__MASSFRONT_SPACE__.getState());
    if (afterMiss.resources.probes !== beforeProbe.resources.probes) throw new Error('OFF_PEAK_PROBE_WAS_SPENT');
    const sweep = await sweepSurveyToPeak(page);
    if (!sweep.unlocked) throw new Error(`DIRECTED_PROBE_PEAK_NOT_FOUND: ${JSON.stringify(sweep)}`);
    await page.waitForFunction(() => !document.querySelector('#toastBanner')?.classList.contains('show'));
    await screenshot(page, 'module_06_signal_peak.png');
    await probe.click();
    await page.waitForTimeout(350);
    const afterFirstProbe = await page.evaluate(() => window.__MASSFRONT_SPACE__.getState());
    if (afterFirstProbe.resources.probes !== beforeProbe.resources.probes - 1) throw new Error('LOCKED_PROBE_DID_NOT_SPEND_EXACTLY_ONE');
    const secondSweep = await sweepSurveyToPeak(page);
    if (!secondSweep.unlocked) throw new Error(`SECOND_DIRECTED_PROBE_PEAK_NOT_FOUND: ${JSON.stringify(secondSweep)}`);
    await page.waitForFunction(() => !document.querySelector('#toastBanner')?.classList.contains('show'));
    await screenshot(page, 'module_07_second_signal_peak.png');
    await probe.click();
    await page.waitForTimeout(350);
    const afterProbe = await page.evaluate(() => window.__MASSFRONT_SPACE__.getState());
    if (afterProbe.resources.probes !== beforeProbe.resources.probes - 2) throw new Error('TWO_LOCKED_PROBES_DID_NOT_SPEND_EXACTLY_TWO');
    const depletedSurvey = Object.keys(afterProbe.surveys).find(id => !beforeProbe.surveys[id].depleted && afterProbe.surveys[id].depleted) || null;
    const extractedDeposit = afterProbe.discoveries.extractedDepositIds.find(id => !beforeProbe.discoveries.extractedDepositIds.includes(id)) || null;
    if (!depletedSurvey || !extractedDeposit) throw new Error('CALDRIS_MINERAL_AND_AUTHORED_SIGNAL_WERE_NOT_BOTH_PERSISTED');
    await screenshot(page, 'module_08_probe_results.png');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__ || window.__MASSFRONT_SPACE_ERROR__, null, { timeout: 30_000 });
    await page.evaluate(async () => {
      if (window.__MASSFRONT_SPACE_ERROR__) throw window.__MASSFRONT_SPACE_ERROR__;
      await window.__MASSFRONT_SPACE__.ready;
    });
    await waitForScene(page, 'survey');
    const restored = await page.evaluate(() => window.__MASSFRONT_SPACE__.getState());
    if (restored.route.targetId !== 'aelos_caldris') throw new Error(`SAVED_SURVEY_TARGET_NOT_RESTORED: ${restored.route.targetId}`);
    if (restored.resources.probes !== afterProbe.resources.probes) throw new Error('PROBE_LEDGER_CHANGED_ON_RELOAD');
    if (depletedSurvey && !restored.surveys[depletedSurvey].depleted) throw new Error('SURVEY_DEPLETION_NOT_RESTORED');
    if (extractedDeposit && !restored.discoveries.extractedDepositIds.includes(extractedDeposit)) throw new Error('MINERAL_DEPLETION_NOT_RESTORED');
    await page.locator('#renderVeil').waitFor({ state: 'hidden', timeout: 30_000 });
    await screenshot(page, 'module_09_saved_survey_restored.png');
    await page.locator('#btnCloseSurvey').click();
    await waitForScene(page, 'system');

    console.log('Opening the UGA Strike/Expedition Bay...');
    await page.locator('#btnUgaCommand').click();
    await waitForScene(page, 'uga');
    const deckC = page.locator('[data-deck-filter="C"]');
    if (await deckC.count()) await deckC.click();
    await page.locator('.uga-district-button[data-district="hangar"]').click();
    await page.waitForTimeout(300);
    await screenshot(page, 'module_07_strike_expedition_bay.png');
    await page.locator('.uga-command-exit').click();
    await waitForScene(page, 'system');

    console.log('Opening the galaxy map and selecting Veyra...');
    await page.locator('#btnGalaxyMap').click();
    await waitForScene(page, 'galaxy');
    await page.waitForSelector('.galaxy-system-label[data-id="veyra"]', { state: 'attached' });
    const warfront = await page.evaluate(() => ({
      title: document.querySelector('.galactic-war-title h1')?.textContent?.trim() || '',
      aelos: document.querySelector('.galaxy-system-label[data-id="aelos"]')?.dataset.frontState || '',
      veyra: document.querySelector('.galaxy-system-label[data-id="veyra"]')?.dataset.frontState || '',
      operationCount: document.querySelectorAll('#galaxyOperations .galaxy-operation-card').length,
      operationThreats: [...document.querySelectorAll('#galaxyOperations .galaxy-operation-card em')].map(node => node.textContent.trim()),
      hasDocumentOverflow: document.documentElement.scrollWidth > innerWidth,
    }));
    if (!/SOMBRERO FRONT/i.test(warfront.title) || warfront.aelos !== 'protected' || warfront.veyra !== 'contested') {
      throw new Error(`GALACTIC_FRONT_STATE_INVALID: ${JSON.stringify(warfront)}`);
    }
    if (warfront.operationCount !== 3 || warfront.operationThreats.some(label => !/^THREAT \d$/.test(label))) {
      throw new Error(`GALACTIC_OPERATION_BOARD_INVALID: ${JSON.stringify(warfront)}`);
    }
    if (warfront.hasDocumentOverflow) throw new Error('GALACTIC_WAR_DOCUMENT_OVERFLOW');
    await screenshot(page, 'module_08_galaxy_map.png');
    await clickGalaxySystem(page, 'veyra');
    await page.waitForTimeout(250);
    await screenshot(page, 'module_09_veyra_route.png');

    console.log('Verifying Galactic War entry into a real drop loadout...');
    const prepared = preparedAelosWarfrontStorage();
    await page.evaluate(storage => {
      localStorage.setItem(storage.campaignKey, storage.campaign);
      localStorage.setItem(storage.profileKey, storage.profile);
    }, prepared);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__ || window.__MASSFRONT_SPACE_ERROR__, null, { timeout: 30_000 });
    await page.evaluate(async () => {
      if (window.__MASSFRONT_SPACE_ERROR__) throw window.__MASSFRONT_SPACE_ERROR__;
      await window.__MASSFRONT_SPACE__.ready;
      /* Campaign Hub now intentionally opens the shared UGA command surface.
         This case is specifically exercising Galactic War operation selection,
         so enter the explicit galaxy controller instead of depending on the
         retired hub-as-galaxy side effect. */
      window.__MASSFRONT_SPACE__.openGalaxy();
    });
    await waitForScene(page, 'galaxy');
    await page.waitForSelector('.galaxy-operation-card[data-galaxy-mission="nova_heliograph_wake"].is-ready', { state: 'attached' });
    const readyFront = await page.evaluate(() => ({
      scene: window.__MASSFRONT_SPACE__?.scene,
      aelos: document.querySelector('.galaxy-system-label[data-id="aelos"]')?.dataset.frontState || '',
      selectedMission: document.querySelector('.galaxy-operation-card.is-selected')?.dataset.galaxyMission || '',
      readyOperations: document.querySelectorAll('.galaxy-operation-card.is-ready').length,
      loadoutDisabled: document.querySelector('#galaxyLoadoutBtn')?.disabled,
      hasDocumentOverflow: document.documentElement.scrollWidth > innerWidth,
    }));
    if (readyFront.scene !== 'galaxy' || readyFront.aelos !== 'protected' || readyFront.selectedMission !== 'nova_heliograph_wake' || readyFront.readyOperations < 1 || readyFront.loadoutDisabled) {
      throw new Error(`READY_WARFRONT_INVALID: ${JSON.stringify(readyFront)}`);
    }
    if (readyFront.hasDocumentOverflow) throw new Error('READY_WARFRONT_DOCUMENT_OVERFLOW');
    await page.locator('#renderVeil').waitFor({ state: 'hidden', timeout: 30_000 });
    await screenshot(page, 'module_10_warfront_ready.png');
    await page.locator('#galaxyLoadoutBtn').click();
    await waitForScene(page, 'uga');
    const planner = page.locator('.uga-deployment-planner[data-mission-id="nova_heliograph_wake"]');
    await planner.waitFor({ state: 'visible', timeout: 30_000 });
    const loadout = await planner.evaluate(node => ({
      commanderOptions: node.querySelector('[data-deploy="commanderId"]')?.options.length || 0,
      specialistSelectors: node.querySelectorAll('[data-specialist]').length,
      landingZones: node.querySelector('[data-deploy="landingZone"]')?.options.length || 0,
      supportPackages: node.querySelector('[data-deploy="support"]')?.options.length || 0,
      unitSelectors: node.querySelectorAll('[data-deploy-unit]').length,
      structureSelectors: node.querySelectorAll('[data-deploy-structure]').length,
      modSelectors: node.querySelectorAll('[data-deploy-mod]').length,
      areaId: node.dataset.selectedAreaId || '',
      mapId: node.querySelector('[data-deploy="mapId"]')?.value || '',
      mapSize: node.dataset.selectedMapSize || '',
      mapOptions: [...node.querySelectorAll('[data-deploy="mapId"] option[data-ground-map]')].map(option => ({ id: option.value, size: option.dataset.mapSize })),
      deployDisabled: node.querySelector('[data-action="deploy"]')?.disabled,
    }));
    if (loadout.commanderOptions < 1 || loadout.specialistSelectors !== 3 || loadout.landingZones < 2 || loadout.supportPackages < 2 ||
      loadout.unitSelectors < 1 || loadout.structureSelectors < 1 || loadout.modSelectors < 1 || loadout.areaId !== 'aelos_heliograph' ||
      loadout.mapId !== '' || loadout.mapSize !== '' || loadout.mapOptions.length !== 3 ||
      loadout.mapOptions.map(option => option.size).join(',') !== 'compact,standard,large' ||
      loadout.mapOptions.some(option => !option.id.startsWith('aelos_heliograph_')) || !loadout.deployDisabled) {
      throw new Error(`DROP_LOADOUT_INCOMPLETE: ${JSON.stringify(loadout)}`);
    }
    await planner.locator('[data-deploy="mapId"]').selectOption('aelos_heliograph_standard');
    await page.waitForFunction(() => {
      const shell = document.querySelector('.uga-command-shell');
      const planner = document.querySelector('.uga-deployment-planner[data-mission-id="nova_heliograph_wake"]');
      return planner?.dataset.selectedAreaId === 'aelos_heliograph'
        && planner?.dataset.selectedMapId === 'aelos_heliograph_standard'
        && planner?.dataset.selectedMapSize === 'standard'
        && shell?.dataset.selectedAreaId === 'aelos_heliograph'
        && shell?.dataset.selectedMapId === 'aelos_heliograph_standard'
        && shell?.dataset.selectedMapSize === 'standard'
        && planner?.querySelector('[data-deployment-confirm-state]')?.dataset.deploymentConfirmState === 'ready'
        && planner?.querySelector('[data-action="deploy"]')?.disabled === false;
    }, null, { timeout: 30_000 });
    await page.locator('[data-action="toggle-deployment-loadout"]').click();
    await page.waitForFunction(() => document.querySelector('.uga-command-shell')?.classList.contains('is-loadout-expanded'));
    const landingZone = planner.locator('[data-deploy="landingZone"]');
    const supportPackage = planner.locator('[data-deploy="support"]');
    await landingZone.selectOption({ index: 1 });
    await supportPackage.selectOption({ index: 1 });
    const changedLoadout = {
      mapId: await planner.locator('[data-deploy="mapId"]').inputValue(),
      areaId: await planner.getAttribute('data-selected-area-id'),
      mapSize: await planner.getAttribute('data-selected-map-size'),
      landingZone: await landingZone.inputValue(),
      support: await supportPackage.inputValue(),
    };
    if (changedLoadout.mapId !== 'aelos_heliograph_standard' || changedLoadout.areaId !== 'aelos_heliograph' || changedLoadout.mapSize !== 'standard' ||
      !changedLoadout.landingZone || !changedLoadout.support) throw new Error(`DROP_LOADOUT_SELECTION_FAILED: ${JSON.stringify(changedLoadout)}`);
    await screenshot(page, 'module_11_drop_loadout.png');

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
      'module_04_logistics_district.png', 'module_05_planetary_survey.png',
      'module_06_signal_peak.png', 'module_07_second_signal_peak.png', 'module_08_probe_results.png', 'module_09_saved_survey_restored.png',
      'module_07_strike_expedition_bay.png', 'module_08_galaxy_map.png', 'module_09_veyra_route.png',
      'module_10_warfront_ready.png', 'module_11_drop_loadout.png',
    ].map(name => join(outputDir, name)),
    failures,
  };
  await writeFile(join(outputDir, 'space-module-report.json'), `${JSON.stringify(report, null, 2)}\n`);
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
