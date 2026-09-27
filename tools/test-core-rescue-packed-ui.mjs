import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';

const root = process.cwd();
const serveRoot = resolve(root, 'www');
const out = resolve(root, 'tmp', `core-rescue-packed-ui-${new Date().toISOString().replaceAll(':', '-')}`);
const files = [
  'modules/space_exploration/src/domain/construction.js',
  'modules/space_exploration/src/domain/state_store.js',
  'modules/space_exploration/src/space_experience.js',
  'modules/space_exploration/src/ui/uga_command.js',
  'modules/space_exploration/src/ui/uga_command.css',
  'modules/space_exploration/src/host/massfront_solo_host.js'
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function hashes(base) {
  return Object.fromEntries(await Promise.all(files.map(async path => [path, hash(await readFile(resolve(base, path)))])));
}
const report = {
  startedAt: new Date().toISOString(),
  test: 'Packed integrated UGA core commissioning rescue, first operation legacy save',
  fixture: 'Nova commissioned through integrated UI. An already-stranded legacy resource snapshot is saved through the real campaign host; rescue itself uses only player UI.',
  viewport: { width: 412, height: 900 },
  output: out,
  pass: false,
  steps: [],
  pageErrors: []
};
let guard, server, browser, page, fatal;

try {
  guard = await acquireVerificationFreeze({ root, label: 'packed core rescue UI', allowedPaths: [resolve(root, 'tmp'), resolve(root, 'audit')] });
  await mkdir(out);
  report.sourceBefore = await hashes(root);
  report.packageBefore = await hashes(serveRoot);
  assert.deepEqual(report.packageBefore, report.sourceBefore, 'tested www module files must match source');
  report.entrySha256 = hash(await readFile(resolve(serveRoot, 'index.html')));
  report.verifierSha256 = hash(await readFile(new URL(import.meta.url)));
  server = createServer(async (req, res) => {
    try {
      const path = resolve(serveRoot, '.' + new URL(req.url, 'http://local').pathname.replace(/\/$/, '/index.html'));
      if (!path.startsWith(serveRoot + '\\')) { res.writeHead(403); res.end(); return; }
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' })[extname(path)] || 'application/octet-stream');
      res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  report.url = `http://127.0.0.1:${server.address().port}/`;
  browser = await launchPwBrowser();
  page = await browser.newPage({ viewport: report.viewport, hasTouch: true, serviceWorkers: 'block' });
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    return ['127.0.0.1', 'localhost'].includes(new URL(url).hostname) || /^(blob|data):/.test(url) ? route.continue() : route.abort();
  });
  await page.goto(report.url, { waitUntil: 'domcontentloaded' });
  report.gpu = await assertHardwareGpu(page);
  report.steps.push('real hardware WebGL2 packed entry');
  await page.waitForFunction(() => typeof mfLauncherSnapshot === 'function' && !document.getElementById('mfBootCover'), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const play = document.getElementById('mfLaunchPlay'), offline = document.getElementById('mfLaunchOffline');
    return play && !play.disabled || offline && !offline.disabled && getComputedStyle(offline).display !== 'none';
  });
  if (await page.locator('#mfLaunchPlay').isEnabled() && /CONTINUE TO INTRO/.test(await page.locator('#mfLaunchPlay').innerText())) await page.locator('#mfLaunchPlay').click();
  else await page.locator('#mfLaunchOffline').click();
  await page.locator('#mfIntroStart').click();
  await page.locator('#apOfflineBtn').click();
  await page.waitForURL('**/modules/space_exploration/index.html*');

  async function ready() {
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__ && window.__MASSFRONT_SPACE_HOST__, null, { timeout: 60000 });
    await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  }
  async function touch(locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 40, 'player control has a usable touch target');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }
  async function enterUga() {
    await page.waitForFunction(() => {
      const space = window.__MASSFRONT_SPACE__;
      return space?.scene === 'uga' && document.querySelector('.uga-command-shell') ||
        space?.scene === 'system' && /ENTER UGA MANAGEMENT/i.test(document.getElementById('actInteract')?.innerText || '');
    }, null, { timeout: 60000 });
    if (await page.locator('#actInteract').isVisible()) await touch(page.locator('#actInteract'));
    await page.locator('.uga-command-shell').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#renderVeil').waitFor({ state: 'hidden', timeout: 60000 });
  }
  async function openConstruction() {
    // The compact mobile room view hides desktop quick actions and collapses
    // its inspector on reload. Play is the visible route back to Galactic
    // Command, whose Build button is the player-facing construction entrance.
    await touch(page.locator('.uga-command-nav [data-nav="classic"]'));
    await page.locator('.uga-command-shell[data-view="campaign_hub"] .uga-campaign-hub').waitFor({ state: 'visible' });
    await touch(page.locator('.uga-campaign-hub [data-command-construction="build"]'));
    await page.locator('.uga-command-shell[data-view="construction"]').waitFor({ state: 'visible' });
  }
  await ready();
  await enterUga();
  await touch(page.locator('.uga-command-nav [data-nav="missions"]'));
  await page.locator('.uga-command-shell[data-view="progress"]').waitFor({ state: 'visible' });
  await touch(page.locator('[data-hub-route="galactic-operations"]'));
  await page.locator('[data-host-route="new-career-faction"]').click();
  await page.waitForURL(/galacticRoute=/);
  const novaCard = page.locator('#mfCareerFactionGate .mfcfgCard').filter({ hasText: /COMMISSION NOVA/i }).first();
  await touch(novaCard.locator('.mfcfgChoose'));
  await page.waitForURL('**/modules/space_exploration/index.html*');
  await ready();
  report.steps.push('real integrated Nova career commissioning');

  report.fixture = await page.evaluate(async () => {
    const host = window.__MASSFRONT_SPACE_HOST__;
    const state = window.__MASSFRONT_SPACE__.getState();
    const domain = await import('./src/domain/state_store.js');
    const construction = await import('./src/domain/construction.js');
    state.resources.credits = 1600;
    state.resources.alloys = 20;
    state.resources.components = 80;
    domain.assertDomainState(state, host.commanderCatalogContext);
    const quote = construction.getCoreCommissionRescueQuote(state);
    if (!quote.ok || quote.grant.alloys <= 0) throw new Error(`Legacy fixture failed rescue quote: ${JSON.stringify(quote)}`);
    await host.saveCampaignSnapshot(state);
    return { profileId: state.profileId, revision: state.revision, resources: state.resources, quote };
  });
  await page.reload();
  await ready();
  await enterUga();
  await openConstruction();
  const rescue = page.locator('[data-core-rescue]');
  await rescue.waitFor({ state: 'visible' });
  assert.equal(await rescue.isEnabled(), true, 'stranded career rescue control enabled');
  assert.match(await rescue.innerText(), /REQUISITION CORE WORK/i);
  report.beforeClick = await page.evaluate(() => ({
    scene: window.__MASSFRONT_SPACE__.scene,
    view: document.querySelector('.uga-command-shell')?.dataset.view,
    card: document.querySelector('.uga-commission-card:has([data-core-rescue])')?.innerText,
    quoteButton: document.querySelector('[data-core-rescue]')?.getBoundingClientRect().toJSON(),
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth
  }));
  assert.ok(report.beforeClick.documentWidth <= report.beforeClick.viewportWidth + 1, 'construction panel does not cause horizontal overflow');
  await rescue.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, '01-rescue-offer.png') });
  await touch(rescue);
  await rescue.waitFor({ state: 'visible' });
  assert.match(await rescue.innerText(), /CONFIRM REQUISITION/i);
  report.confirmationReachability = await rescue.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { top: box.top, bottom: box.bottom, viewportHeight: innerHeight, hit: hit === element || element.contains(hit) };
  });
  assert.ok(report.confirmationReachability.top >= 0 && report.confirmationReachability.bottom <= report.confirmationReachability.viewportHeight && report.confirmationReachability.hit, 'first tap leaves confirmation reachable without scrolling');
  await page.screenshot({ path: resolve(out, '02-rescue-confirmation.png') });
  report.afterFirstClick = await page.evaluate(() => ({ used: window.__MASSFRONT_SPACE__.getState().ship.coreCommissionRescueUsed }));
  assert.equal(report.afterFirstClick.used, false, 'first click is only confirmation');
  await touch(rescue);
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__.getState().ship.coreCommissionRescueUsed === true, null, { timeout: 10000 });
  report.afterAction = await page.evaluate(async () => {
    const state = window.__MASSFRONT_SPACE__.getState();
    const saved = await window.__MASSFRONT_SPACE_HOST__.loadCampaignSnapshot();
    return {
      used: state.ship.coreCommissionRescueUsed,
      powerMW: state.ship.coreCommissionRescuePowerMW,
      resources: state.resources,
      queue: state.ship.constructionQueue.filter(job => ['mission_ops', 'hangar'].includes(job.districtId)).map(job => ({ districtId: job.districtId, rescueFunded: job.rescueFunded, rescueGrant: job.rescueGrant, reservedCost: job.reservedCost, workCompleted: job.workCompleted })),
      savedUsed: saved.ship.coreCommissionRescueUsed,
      savedQueueLength: saved.ship.constructionQueue.length,
      rescueButtonCount: document.querySelectorAll('[data-core-rescue]').length,
      card: [...document.querySelectorAll('.uga-commission-card')].find(card => /Core Commissioning Requisition/.test(card.textContent))?.innerText
    };
  });
  assert.equal(report.afterAction.savedUsed, true, 'host persisted rescue');
  assert.equal(report.afterAction.rescueButtonCount, 0, 'requisition cannot be repeated in UI');
  assert.deepEqual(report.afterAction.queue.map(job => job.districtId).sort(), ['hangar', 'mission_ops']);
  assert.ok(report.afterAction.queue.every(job => job.rescueFunded), 'both core jobs protected');
  await page.locator('.uga-commission-card').filter({ hasText: 'Core Commissioning Requisition' }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, '03-rescue-queued.png') });
  report.steps.push('offer visible; first tap confirms; second tap queues protected core work through UI and host save');
  await page.reload();
  await ready();
  await enterUga();
  await openConstruction();
  report.afterReload = await page.evaluate(() => ({
    used: window.__MASSFRONT_SPACE__.getState().ship.coreCommissionRescueUsed,
    queue: window.__MASSFRONT_SPACE__.getState().ship.constructionQueue.filter(job => ['mission_ops', 'hangar'].includes(job.districtId)).map(job => ({ districtId: job.districtId, rescueFunded: job.rescueFunded })),
    rescueButtonCount: document.querySelectorAll('[data-core-rescue]').length,
    card: [...document.querySelectorAll('.uga-commission-card')].find(card => /Core Commissioning Requisition/.test(card.textContent))?.innerText
  }));
  assert.equal(report.afterReload.used, true);
  assert.equal(report.afterReload.rescueButtonCount, 0);
  assert.equal(report.afterReload.queue.length, 2);
  assert.ok(report.afterReload.queue.every(job => job.rescueFunded));
  await page.locator('.uga-commission-card').filter({ hasText: 'Core Commissioning Requisition' }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, '04-rescue-after-reload.png') });
  report.steps.push('saved rescue is idempotent after reload');
  report.sourceAfter = await hashes(root);
  report.packageAfter = await hashes(serveRoot);
  assert.deepEqual(report.sourceAfter, report.sourceBefore, 'source stable across capture');
  assert.deepEqual(report.packageAfter, report.packageBefore, 'package stable across capture');
  await guard.checkpoint('packed core rescue final');
  report.pass = true;
} catch (error) {
  fatal = error;
  report.failure = { message: error.message, stack: error.stack };
  if (page && out) {
    try {
      report.failureUi = await page.evaluate(() => ({
        scene: window.__MASSFRONT_SPACE__?.scene,
        view: document.querySelector('.uga-command-shell')?.dataset.view,
        entryView: document.getElementById('moduleFrame')?.dataset.entryView,
        controls: [...document.querySelectorAll('[data-command-construction], [data-quick="construction"], [data-action="open-construction"]')].map(element => ({
          action: element.dataset.commandConstruction || element.dataset.quick || element.dataset.action,
          text: element.textContent?.trim(),
          visible: !!element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden'
        }))
      }));
      await page.screenshot({ path: resolve(out, 'failure-screen.png') });
    } catch (diagnosticError) { report.failureUiError = String(diagnosticError); }
  }
} finally {
  if (page) await page.close().catch(() => {});
  if (browser) await closePwBrowser().catch(() => {});
  if (server) await new Promise(done => server.close(done));
  if (guard) {
    try { await guard.release({ assertStable: true, name: 'packed core rescue release' }); }
    catch (error) { report.pass = false; report.freezeFailure = error.message; fatal ||= error; }
  }
  report.finishedAt = new Date().toISOString();
  if (guard) await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ pass: report.pass, output: out, failure: report.failure?.message, freezeFailure: report.freezeFailure, steps: report.steps }, null, 2));
}
if (fatal) process.exitCode = 1;
