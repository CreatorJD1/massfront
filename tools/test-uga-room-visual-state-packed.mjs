/* Packed, hardware-GPU regression for the shared orbit/UGA room canvas.
   This is deliberately supplemental: it proves the streaming/failure seal and
   keeps screenshots of the real ready cutaway for human visual acceptance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';

const root = process.cwd();
const serveRoot = resolve(root, 'www');
const out = resolve(root, 'tmp', `uga-room-visual-state-packed-${new Date().toISOString().replaceAll(':', '-')}`);
const viewports = [
  { name: '320-portrait', width: 320, height: 700 },
  { name: '412-portrait', width: 412, height: 900 },
  { name: '915-landscape', width: 915, height: 412 }
];
const timeoutMs = 300000;
const coreFiles = [
  'boot.js', 'assets/data/manifest.json',
  'modules/space_exploration/index.html',
  'modules/space_exploration/src/space_module.js',
  'modules/space_exploration/src/space_experience.js',
  'modules/space_exploration/src/ui/space_module.css',
  'modules/space_exploration/src/ui/uga_command.js',
  'modules/space_exploration/src/ui/uga_command.css',
  'modules/space_exploration/src/ui/campaign_hub_registry.js',
  'modules/space_exploration/src/ui/uga_scene.js',
  'modules/space_exploration/src/core/uga_command_scene.js',
  'modules/space_exploration/src/ship/uga_blender_assets.js',
  'modules/space_exploration/assets/runtime/content/assetpack-runtime.js',
  'modules/space_exploration/assets/runtime/models/nexus-vii-cutaway-hull-overlay.glb',
  'modules/space_exploration/assets/runtime/models/uga-sections/delivery-manifest.json',
  'modules/space_exploration/assets/runtime/models/uga-sections/scene.gltf'
];
const report = {
  test: 'Packed UGA room visual states after a real orbital return',
  scope: 'One authored Command cutaway: held streaming, successful ready, and controlled scene.gltf request failure; three mobile viewports each.',
  startedAt: new Date().toISOString(), output: out, timeoutMs, pass: false,
  captures: {}, interactions: [], pageErrors: [], requestFailures: []
};

async function shaFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function parityFiles() {
  const css = await readFile(resolve(root, 'modules/space_exploration/src/ui/uga_command.css'), 'utf8');
  const art = Array.from(css.matchAll(/menu-art-v1\/([a-z0-9-]+\.webp)/g), match =>
    `modules/space_exploration/assets/runtime/ui/menu-art-v1/${match[1]}`);
  const base = 'modules/space_exploration/assets/runtime/models/uga-sections/';
  const delivery = JSON.parse(await readFile(resolve(root, base, 'delivery-manifest.json'), 'utf8'));
  assert.equal(delivery.schema, 'massfront.uga-shared-resource-delivery.v1');
  assert.ok(delivery.resources.length > 0, 'authored cutaway resources are listed');
  const resources = delivery.resources.map(resource => {
    assert.match(resource.uri, /^[A-Za-z0-9._-]+$/, 'resource path stays inside the cutaway directory');
    return base + resource.uri;
  });
  return [...new Set([...coreFiles, ...art, ...resources])].sort();
}

async function hashes(base, files) {
  const result = {};
  for (const file of files) result[file] = await shaFile(resolve(base, file));
  return result;
}

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://local');
      const requested = decodeURIComponent(url.pathname.replace(/\/$/, '/index.html'));
      const path = resolve(serveRoot, '.' + requested);
      const rel = relative(serveRoot, path);
      if (rel.startsWith('..') || isAbsolute(rel)) { response.writeHead(403); response.end(); return; }
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Type', ({
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.json': 'application/json', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary',
        '.wasm': 'application/wasm', '.webp': 'image/webp', '.png': 'image/png',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'
      })[extname(path)] || 'application/octet-stream');
      response.end(await readFile(path));
    } catch { response.writeHead(404); response.end(); }
  });
  return server;
}

async function touch(page, selector) {
  const button = page.locator(selector).first();
  await button.waitFor({ state: 'visible', timeout: 30000 });
  await button.scrollIntoViewIfNeeded();
  const hit = await button.evaluate(element => {
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, width: box.width, height: box.height,
      hit: top === element || element.contains(top), disabled: Boolean(element.disabled),
      viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth };
  });
  assert.ok(hit.width >= 40 && hit.height >= 40, `${selector}: practical touch target`);
  assert.ok(hit.hit && !hit.disabled, `${selector}: unobscured and enabled`);
  assert.ok(hit.documentWidth <= hit.viewportWidth + 1, `${selector}: no horizontal page overflow`);
  await page.touchscreen.tap(hit.x, hit.y);
  return hit;
}

async function launchIntoOrbit(page) {
  await page.route('**/*', route => {
    const url = route.request().url();
    return ['127.0.0.1', 'localhost'].includes(new URL(url).hostname) || /^(blob|data):/.test(url)
      ? route.continue() : route.abort();
  });
  await page.goto(report.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  report.gpu ||= await assertHardwareGpu(page);
  await page.waitForFunction(() => typeof mfLauncherSnapshot === 'function' && !document.getElementById('mfBootCover'), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const offline = document.getElementById('mfLaunchOffline');
    return offline && !offline.disabled && getComputedStyle(offline).display !== 'none';
  }, null, { timeout: 60000 });
  await page.locator('#mfLaunchOffline').click();
  const intro = page.locator('#mfIntroStart');
  const offlineGate = page.locator('#apOfflineBtn');
  if (await intro.isVisible()) {
    try { await intro.click({ timeout: 5000 }); }
    catch (error) { if (!(await offlineGate.isVisible())) throw error; }
  }
  await offlineGate.click();
  await page.waitForURL('**/modules/space_exploration/index.html*', { timeout: 60000 });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__ && window.__MASSFRONT_SPACE_HOST__, null, { timeout: 60000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  await page.locator('.uga-command-shell[data-view="campaign_hub"]').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('#renderVeil').waitFor({ state: 'hidden', timeout: 60000 });
  await page.locator('.uga-campaign-depart[data-action="exit"]').click();
  await page.waitForFunction(() => document.getElementById('moduleFrame')?.dataset.scene === 'system' &&
    window.__MASSFRONT_SPACE__?.engine?.currentSystem, null, { timeout: 90000 });
  await page.locator('#renderVeil').waitFor({ state: 'hidden', timeout: 90000 });
  await page.screenshot({ path: resolve(out, `${report.caseName}-orbit-before-room.png`) });
  await page.locator('#btnUgaCommand').click();
  await page.locator('.uga-command-shell[data-view="campaign_hub"]').waitFor({ state: 'visible', timeout: 30000 });
}

async function roomEvidence(page, state, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.waitForFunction(expected => document.getElementById('moduleFrame')?.dataset.ugaVisualState === expected &&
    document.querySelector('.uga-command-shell[data-stage="room"]'), state, { timeout: 120000 });
  if (state === 'ready') await page.waitForFunction(() => !window.__MASSFRONT_SPACE__?.commandScene?.tween,
    null, { timeout: 15000 });
  if (state === 'ready') await page.waitForFunction(() => !document.getElementById('toastBanner')?.classList.contains('show'),
    null, { timeout: 15000 });
  if (state === 'ready') await page.waitForTimeout(350); // allow the opacity transition to finish before art comparison
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const evidence = await page.evaluate(async expected => {
    const frame = document.getElementById('moduleFrame');
    const shell = document.querySelector('.uga-command-shell[data-stage="room"]');
    const commandScene = window.__MASSFRONT_SPACE__?.commandScene;
    const style = getComputedStyle(shell), box = shell.getBoundingClientRect();
    const rect = selector => {
      const node = shell.querySelector(selector), r = node?.getBoundingClientRect();
      return r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const identitySub = shell.querySelector('.uga-command-identity span:not(.uga-command-crest)');
    const firstResource = shell.querySelector('.uga-resource');
    const art = style.getPropertyValue('--uga-room-seal-art').trim();
    let artDecoded = null;
    if (expected !== 'ready') {
      // The computed background resolves CSS-relative URLs against the style
      // sheet; a raw custom property's relative URL resolves differently.
      const urls = Array.from(style.backgroundImage.matchAll(/url\(["']?([^"')]+)/g));
      const imageUrl = urls.at(-1)?.[1];
      if (imageUrl) {
        const image = new Image();
        image.src = imageUrl;
        try { await image.decode(); artDecoded = true; } catch { artDecoded = false; }
      }
    }
    return {
      scene: frame.dataset.scene, visualState: frame.dataset.ugaVisualState,
      view: shell.dataset.view, district: shell.dataset.district, stage: shell.dataset.stage,
      shell: { x: box.x, y: box.y, width: box.width, height: box.height,
        backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage,
        art, artDecoded },
      cutaway: { loaded: Boolean(commandScene?.loaded), active: Boolean(commandScene?.active),
        districts: commandScene?.districtRoots?.size || 0,
        hullOverlayLoaded: Boolean(commandScene?.root?.userData?.hullOverlayLoaded),
        hullOverlayError: commandScene?.root?.userData?.hullOverlayError || null,
        inspectionBayVisible: Boolean(commandScene?.inspectionBay?.visible),
        selected: commandScene?.selectedDistrictId,
        visibleCarrier: commandScene?.authoredCarrierContext?.filter(({ object }) => object.visible).map(({ object }) => object.name) || [] },
      navigation: {
        subtitle: identitySub?.textContent?.trim(),
        subtitleDisplay: identitySub && getComputedStyle(identitySub).display,
        location: shell.querySelector('.uga-ship-location')?.innerText?.trim(),
        tabs: [...shell.querySelectorAll('[data-deck-filter]')].map(node => ({
          text: node.innerText.trim(), width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height })),
        resourceLabelDisplay: firstResource?.querySelector('small') && getComputedStyle(firstResource.querySelector('small')).display,
        resourceFrameDisplay: getComputedStyle(shell.querySelector('.uga-resource-ribbon'), '::after').display,
        header: rect('.uga-command-header'), resources: rect('.uga-resource-ribbon'),
        locationBar: rect('.uga-ship-location'), power: rect('.uga-ship-telemetry-badge'),
        deckTabs: rect('.uga-deck-filter-bar'), rooms: rect('.uga-district-list'),
        inspector: rect('.uga-context-panel'),
        commandAction: rect('.uga-campaign-hub.is-room-embedded .uga-objective > .uga-primary-button'),
        dock: rect('.uga-command-nav')
      },
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth
    };
  }, state);
  assert.equal(evidence.scene, 'uga');
  assert.equal(evidence.visualState, state);
  assert.equal(evidence.stage, 'room');
  assert.equal(evidence.view, 'command');
  assert.equal(evidence.district, 'command');
  assert.ok(evidence.shell.width >= viewport.width - 1 && evidence.shell.height >= viewport.height - 1,
    'room shell seals the entire shared orbital canvas');
  assert.ok(evidence.documentWidth <= viewport.width + 1, 'room has no horizontal page overflow');
  assert.match(evidence.navigation.subtitle, /UGA EXPLORER.*SHIP INTERIOR/);
  assert.notEqual(evidence.navigation.subtitleDisplay, 'none', 'ship-interior identity stays visible');
  assert.match(evidence.navigation.location, /INSIDE NEXUS-VII/);
  assert.deepEqual(evidence.navigation.tabs.map(tab => tab.text.replace(/\s+/g, ' ')),
    ['FORWARD', 'UPPER', 'LOWER'], 'interior areas map to physical positions in the ship');
  for (const tab of evidence.navigation.tabs) assert.ok(tab.width >= 44 && tab.height >= 44, 'area tabs are touch targets');
  assert.notEqual(evidence.navigation.resourceLabelDisplay, 'none', 'resource numbers retain visible labels');
  assert.equal(evidence.navigation.resourceFrameDisplay, 'none', 'resource frame does not paint over the stats');
  assert.ok(evidence.navigation.resources.bottom <= evidence.navigation.locationBar.top + 2,
    'ship resources do not overlap the interior location bar');
  if (viewport.width < viewport.height) {
    assert.ok(evidence.navigation.locationBar.bottom <= evidence.navigation.deckTabs.top + 2,
      'portrait location precedes area tabs');
    assert.ok(evidence.navigation.deckTabs.bottom <= evidence.navigation.rooms.top + 2,
      'portrait area tabs precede their room list');
  } else {
    assert.ok(evidence.navigation.locationBar.right <= evidence.navigation.deckTabs.left + 2,
      'landscape location and area tabs occupy separate lanes');
    assert.ok(evidence.navigation.deckTabs.bottom <= evidence.navigation.rooms.top + 2,
      'landscape area tabs precede their room list');
  }
  if (state === 'ready') {
    assert.ok(evidence.navigation.commandAction?.height >= 44,
      'Command room keeps a practical primary action');
    assert.ok(evidence.navigation.commandAction.bottom <= evidence.navigation.dock.top - 3,
      'Command room primary action is wholly visible above the phone dock on first open');
    assert.equal(evidence.cutaway.loaded, true, 'ready means the authored cutaway loaded');
    assert.equal(evidence.cutaway.districts, 11, 'ready scene retains all 11 authored districts');
    assert.equal(evidence.cutaway.hullOverlayLoaded, true, `authored connected hull loaded: ${evidence.cutaway.hullOverlayError || ''}`);
    assert.equal(evidence.cutaway.inspectionBayVisible, false, 'the generic grey inspection bay is hidden around authored rooms');
    assert.equal(evidence.cutaway.selected, 'command', 'ready room stays focused on Command');
    assert.ok(evidence.cutaway.visibleCarrier.some(name => /^NexusVII_(?:BowCap|FarHullPanel_Command|NearHullSill_Command)/.test(name)),
      'Command focus retains a sculpted bow or local cutaway hull');
    assert.ok(!evidence.cutaway.visibleCarrier.some(name => /^NexusVII_NearHullSill_/.test(name)),
      'whole-ship near-side sills do not cross a focused room');
    assert.ok(!evidence.cutaway.visibleCarrier.some(name => /^NexusVII_FarHullPanel_[1-6]$/.test(name)),
      'Command focus excludes full-height rear panels from neighbouring decks');
    assert.ok(!evidence.cutaway.visibleCarrier.some(name => /^NexusVII_(?:Keel|MidDeck|CeilingSpine)|^TransitPod_/.test(name)),
      'full-span hull and transit art remain hidden so they do not occlude the room');
  } else {
    assert.equal(evidence.cutaway.loaded, false, `${state} must not fake room readiness`);
    assert.match(evidence.shell.backgroundColor, /^rgb\(6, 19, 31\)$/, 'opaque navy seals stale orbital pixels');
    assert.match(evidence.shell.backgroundImage, /menu-art-v1/, 'contextual authored room art covers the seal');
    assert.equal(evidence.shell.artDecoded, true, 'contextual room art decodes in the packed runtime');
  }
  const key = `${report.caseName}-${state}-${viewport.name}`;
  report.captures[key] = evidence;
  await page.screenshot({ path: resolve(out, `${key}.png`) });
  // Check a real room control after the visual capture, then restore Command.
  // This is stronger than counting buttons under a visually sealed overlay.
  const survey = await touch(page, '.uga-district-button[data-district="survey"]');
  await page.locator('.uga-command-shell[data-district="survey"]').waitFor({ state: 'visible' });
  if (state === 'ready') {
    const localHull = await page.evaluate(() => window.__MASSFRONT_SPACE__.commandScene.authoredCarrierContext
      .filter(({ object }) => object.visible && /^NexusVII_(?:FarHullPanel_|WindowRibbon_|NearHullSill_|HullFrame_)/.test(object.name))
      .map(({ object }) => object.name));
    assert.ok(localHull.length > 0, 'Survey focus retains the matching authored hull segment');
    assert.ok(!localHull.some(name => /^NexusVII_NearHullSill_/.test(name)), 'Survey focus has no foreground hull bar');
    assert.ok(!localHull.some(name => /^NexusVII_FarHullPanel_Lower_/.test(name)), 'upper Survey focus hides lower rear shells');
    report.interactions.push({ key, surveyLocalHull: localHull });
    await page.waitForFunction(() => !window.__MASSFRONT_SPACE__?.commandScene?.tween,
      null, { timeout: 15000 });
    await page.screenshot({ path: resolve(out, `${report.caseName}-survey-${viewport.name}.png`) });
  }
  const command = await touch(page, '.uga-district-button[data-district="command"]');
  await page.locator('.uga-command-shell[data-district="command"]').waitFor({ state: 'visible' });
  report.interactions.push({ key, survey, command });
  if (state === 'ready' && viewport.name === '412-portrait') {
    await touch(page, '[data-deck-filter="B"]');
    await page.locator('.uga-command-shell[data-district="research"]').waitFor({ state: 'visible' });
    await touch(page, '[data-deck-filter="C"]');
    await page.locator('.uga-command-shell[data-district="habitat"]').waitFor({ state: 'visible' });
    await touch(page, '[data-deck-filter="A"]');
    await page.locator('.uga-command-shell[data-district="command"]').waitFor({ state: 'visible' });
    report.interactions.push({ key, areaFlow: 'Forward → Upper → Lower → Forward' });
  }
  if (state === 'ready') {
    await touch(page, '.uga-overview-button');
    await page.waitForFunction(() => !window.__MASSFRONT_SPACE__?.commandScene?.tween,
      null, { timeout: 15000 });
    const overview = await page.evaluate(() => {
      const scene = window.__MASSFRONT_SPACE__.commandScene;
      return { selected: scene.selectedDistrictId,
        visibleRooms: [...scene.districtRoots.values()].filter(root => root.visible).length,
        visibleCarrier: scene.authoredCarrierContext?.filter(({ object }) => object.visible).length || 0,
        lowerFocusPanels: scene.authoredCarrierContext?.filter(({ object }) => object.visible && /^NexusVII_FarHullPanel_Lower_/.test(object.name)).length || 0,
        location: document.querySelector('.uga-ship-location')?.innerText?.trim(),
        sheetLabel: document.querySelector('.uga-sheet-toggle b')?.textContent?.trim(),
        pressedRooms: document.querySelectorAll('.uga-district-button[aria-pressed="true"]').length };
    });
    assert.equal(overview.selected, null, 'ship overview clears room focus');
    assert.equal(overview.visibleRooms, 11, 'overview shows every authored compartment in the ship');
    assert.ok(overview.visibleCarrier > 0, 'overview restores the authored hull');
    assert.equal(overview.lowerFocusPanels, 0, 'overview does not double the lower focus-only rear shells');
    assert.match(overview.location, /SHIP OVERVIEW/, 'overview is located in the whole ship, not Command');
    assert.match(overview.sheetLabel, /SHIP OVERVIEW/, 'collapsed inspector names the ship overview');
    assert.equal(overview.pressedRooms, 0, 'overview does not highlight a hidden focused room');
    report.interactions.push({ key, overview });
    await page.screenshot({ path: resolve(out, `${report.caseName}-overview-${viewport.name}.png`) });
    await touch(page, '.uga-district-button[data-district="command"]');
    await page.locator('.uga-command-shell[data-district="command"]').waitFor({ state: 'visible' });
  }
}

let guard, server, browser, page, watchdog, fatal, releaseHeldRequest;
try {
  assert.ok((await stat(resolve(root, '.git'))).isDirectory(), 'run from the canonical local Git checkout, not a worktree');
  guard = await acquireVerificationFreeze({ root, label: 'packed UGA sealed-room visual states',
    allowedPaths: [resolve(root, 'tmp'), resolve(root, 'audit')] });
  await mkdir(out, { recursive: true });
  const files = await parityFiles();
  report.parityFiles = files;
  report.sourceBefore = await hashes(root, files);
  report.packageBefore = await hashes(serveRoot, files);
  assert.deepEqual(report.packageBefore, report.sourceBefore, 'source and www room inputs must match before capture');
  report.entrySha256 = await shaFile(resolve(serveRoot, 'index.html'));
  report.verifierSha256 = await shaFile(new URL(import.meta.url));
  server = startServer();
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  report.url = `http://127.0.0.1:${server.address().port}/`;
  browser = await launchPwBrowser();
  watchdog = setTimeout(() => { report.timedOut = true; void page?.close().catch(() => {}); }, timeoutMs);

  report.caseName = 'held';
  page = await browser.newPage({ viewport: viewports[1], hasTouch: true, serviceWorkers: 'block' });
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => report.pageErrors.push({ case: report.caseName, error: error.message }));
  page.on('requestfailed', request => report.requestFailures.push({ case: report.caseName,
    url: request.url(), error: request.failure()?.errorText }));
  await launchIntoOrbit(page);
  let seenRequest;
  const requestSeen = new Promise(resolveSeen => { seenRequest = resolveSeen; });
  let intercepted = 0;
  await page.route('**/uga-sections/scene.gltf*', async route => {
    intercepted++;
    seenRequest();
    const disposition = await new Promise(resolveRelease => { releaseHeldRequest = resolveRelease; });
    if (disposition === 'continue') await route.continue(); else await route.abort();
  });
  await page.locator('.uga-command-nav [data-nav="ship"]').click();
  await Promise.race([requestSeen, new Promise((_, reject) => setTimeout(() => reject(new Error('cutaway request never reached held route')), 60000))]);
  assert.equal(intercepted, 1, 'exactly one authored cutaway load is held');
  for (const viewport of viewports) await roomEvidence(page, 'streaming', viewport);
  releaseHeldRequest('continue');
  releaseHeldRequest = null;
  await page.waitForFunction(() => document.getElementById('moduleFrame')?.dataset.ugaVisualState === 'ready', null, { timeout: 120000 });
  for (const viewport of viewports) await roomEvidence(page, 'ready', viewport);
  report.heldRequestCount = intercepted;
  await page.close();
  page = null;

  report.caseName = 'failed';
  page = await browser.newPage({ viewport: viewports[1], hasTouch: true, serviceWorkers: 'block' });
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => report.pageErrors.push({ case: report.caseName, error: error.message }));
  page.on('requestfailed', request => report.requestFailures.push({ case: report.caseName,
    url: request.url(), error: request.failure()?.errorText }));
  await launchIntoOrbit(page);
  let aborted = 0;
  await page.route('**/uga-sections/scene.gltf*', route => { aborted++; return route.abort('failed'); });
  await page.locator('.uga-command-nav [data-nav="ship"]').click();
  await page.waitForFunction(() => document.getElementById('moduleFrame')?.dataset.ugaVisualState === 'failed', null, { timeout: 60000 });
  assert.ok(aborted >= 1, 'controlled cutaway failure was actually injected');
  for (const viewport of viewports) await roomEvidence(page, 'failed', viewport);
  report.failedRequestCount = aborted;
  assert.equal(report.pageErrors.length, 0, 'no uncaught browser page errors');
  report.sourceAfter = await hashes(root, files);
  report.packageAfter = await hashes(serveRoot, files);
  assert.deepEqual(report.sourceAfter, report.sourceBefore, 'source did not drift during capture');
  assert.deepEqual(report.packageAfter, report.packageBefore, 'packed www did not drift during capture');
  await guard.checkpoint('packed UGA room visual-state capture');
  report.pass = true;
} catch (error) {
  fatal = error;
  report.failure = { message: error.message, stack: error.stack };
  if (page && !page.isClosed()) {
    try {
      report.failureUi = await page.evaluate(() => ({
        scene: document.getElementById('moduleFrame')?.dataset.scene,
        visualState: document.getElementById('moduleFrame')?.dataset.ugaVisualState,
        view: document.querySelector('.uga-command-shell')?.dataset.view,
        district: document.querySelector('.uga-command-shell')?.dataset.district
      }));
      await page.screenshot({ path: resolve(out, 'failure-screen.png') });
    } catch (diagnosticError) { report.failureUiError = String(diagnosticError); }
  }
} finally {
  if (watchdog) clearTimeout(watchdog);
  if (releaseHeldRequest) releaseHeldRequest('abort');
  if (page) await page.close().catch(() => {});
  if (browser) await closePwBrowser().catch(() => {});
  if (server) await new Promise(done => server.close(done));
  if (guard) {
    try { await guard.release({ assertStable: true, name: 'packed UGA room visual-state release' }); }
    catch (error) { report.pass = false; report.freezeFailure = error.message; fatal ||= error; }
  }
  report.finishedAt = new Date().toISOString();
  if (guard) await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ pass: report.pass, output: out, captureCount: Object.keys(report.captures).length,
    failure: report.failure?.message, freezeFailure: report.freezeFailure }, null, 2));
}
if (fatal) process.exitCode = 1;
