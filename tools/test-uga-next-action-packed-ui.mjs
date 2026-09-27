import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';

const root = process.cwd();
const serveRoot = resolve(root, 'www');
const out = resolve(root, 'tmp', `uga-next-action-packed-ui-${new Date().toISOString().replaceAll(':', '-')}`);
const files = [
  'boot.js', 'modules/space_exploration/index.html',
  'modules/space_exploration/src/space_experience.js',
  'modules/space_exploration/src/ui/uga_command.js',
  'modules/space_exploration/src/ui/uga_command.css',
  'modules/space_exploration/src/ui/campaign_hub_registry.js',
  'modules/space_exploration/src/domain/catalog.js',
  'modules/space_exploration/src/domain/progression.js',
  'modules/space_exploration/src/domain/state_store.js',
  'modules/space_exploration/src/systems/planetary_survey.js',
  'modules/space_exploration/src/systems/showcase_systems.js',
  'modules/space_exploration/src/ui/space_module.css',
  'modules/space_exploration/src/host/massfront_solo_host.js'
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function hashes(base) {
  return Object.fromEntries(await Promise.all(files.map(async path => [path, sha(await readFile(resolve(base, path)))])));
}
const report = {
  test: 'Packed mobile UGA discovered-mission next action and research commitment',
  fixture: 'Nova is hired through the real UI. Authored domain survey and showcase snapshots create two reproducible states; both asserted actions use real touch controls.',
  viewport: { width: 412, height: 900 },
  startedAt: new Date().toISOString(),
  output: out,
  pass: false,
  steps: [],
  pageErrors: [],
  captures: {}
};
let guard, server, browser, page, fatal;

try {
  guard = await acquireVerificationFreeze({ root, label: 'packed UGA next action and research UI', allowedPaths: [resolve(root, 'tmp'), resolve(root, 'audit')] });
  await mkdir(out, { recursive: true });
  report.sourceBefore = await hashes(root);
  report.packageBefore = await hashes(serveRoot);
  assert.deepEqual(report.packageBefore, report.sourceBefore, 'tested www module files must match current source');
  report.entrySha256 = sha(await readFile(resolve(serveRoot, 'index.html')));
  report.verifierSha256 = sha(await readFile(new URL(import.meta.url)));

  server = createServer(async (request, response) => {
    try {
      const path = resolve(serveRoot, '.' + new URL(request.url, 'http://local').pathname.replace(/\/$/, '/index.html'));
      const rel = relative(serveRoot, path);
      if (rel.startsWith('..') || isAbsolute(rel)) { response.writeHead(403); response.end(); return; }
      response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' })[extname(path)] || 'application/octet-stream');
      response.end(await readFile(path));
    } catch { response.writeHead(404); response.end(); }
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
  report.steps.push('packed entry on hardware WebGL2');

  async function ready() {
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__ && window.__MASSFRONT_SPACE_HOST__, null, { timeout: 60000 });
    await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  }
  async function touch(locator) {
    await locator.scrollIntoViewIfNeeded();
    const geometry = await locator.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
        width: rect.width, height: rect.height,
        hit: hit === element || element.contains(hit),
        disabled: Boolean(element.disabled),
        viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth
      };
    });
    assert.ok(geometry.width >= 44 && geometry.height >= 40, 'player action has a usable mobile touch target');
    assert.ok(geometry.hit && !geometry.disabled, 'player action is unobscured and enabled');
    assert.ok(geometry.documentWidth <= geometry.viewportWidth + 1, 'player action does not produce horizontal page overflow');
    await page.touchscreen.tap(geometry.x, geometry.y);
    return geometry;
  }
  async function capture(name, selector) {
    const target = page.locator(selector).first();
    await target.waitFor({ state: 'visible', timeout: 30000 });
    await target.scrollIntoViewIfNeeded();
    report.captures[name] = await target.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        text: element.innerText?.trim(),
        button: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        hit: hit === element || element.contains(hit), disabled: Boolean(element.disabled),
        viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth
      };
    });
    assert.equal(report.captures[name].hit, true, `${name} is reachable in the packed mobile UI`);
    assert.ok(report.captures[name].documentWidth <= report.viewport.width + 1, `${name} has no horizontal page overflow`);
    await page.screenshot({ path: resolve(out, `${name}.png`) });
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
  async function playHome() {
    await touch(page.locator('.uga-command-nav [data-nav="classic"]'));
    await page.locator('.uga-command-shell[data-view="campaign_hub"] .uga-campaign-hub').waitFor({ state: 'visible', timeout: 10000 });
  }

  await page.waitForFunction(() => typeof mfLauncherSnapshot === 'function' && !document.getElementById('mfBootCover'), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const play = document.getElementById('mfLaunchPlay'), offline = document.getElementById('mfLaunchOffline');
    return play && !play.disabled || offline && !offline.disabled && getComputedStyle(offline).display !== 'none';
  });
  if (await page.locator('#mfLaunchPlay').isEnabled() && /CONTINUE TO INTRO/.test(await page.locator('#mfLaunchPlay').innerText())) await page.locator('#mfLaunchPlay').click();
  else await page.locator('#mfLaunchOffline').click();
  const introStart = page.locator('#mfIntroStart');
  const offlineGate = page.locator('#apOfflineBtn');
  if (await introStart.isVisible()) {
    try {
      await introStart.click({ timeout: 5000 });
      report.steps.push('intro start accepted');
    } catch (error) {
      // The account gate may replace the intro while Playwright is scrolling
      // the button into view. Only accept that race when the real offline gate
      // is now visible; otherwise retain the original click failure.
      if (!(await offlineGate.isVisible())) throw error;
      report.steps.push('account gate superseded intro start');
    }
  } else {
    report.steps.push('account gate opened without an intro tap');
  }
  await offlineGate.click();
  await page.waitForURL('**/modules/space_exploration/index.html*');
  await ready();
  await enterUga();
  await touch(page.locator('.uga-command-nav [data-nav="missions"]'));
  await page.locator('.uga-command-shell[data-view="progress"]').waitFor({ state: 'visible' });
  await touch(page.locator('[data-hub-route="galactic-operations"]'));
  await touch(page.locator('[data-host-route="new-career-faction"]'));
  await page.waitForURL(/galacticRoute=/);
  // The catalog's presentation short name can change independently of its
  // canonical career ID; select the actual Nova faction, not button copy.
  const novaCard = page.locator('#mfCareerFactionGate .mfcfgCard[data-faction="nova"]');
  await novaCard.waitFor({ state: 'visible', timeout: 120000 });
  report.careerCardDom = await novaCard.evaluate(card => ({
    tag: card.tagName, chooseCount: card.querySelectorAll('.mfcfgChoose').length,
    chooseText: card.querySelector('.mfcfgChoose')?.textContent?.trim()
  }));
  await touch(novaCard);
  await page.waitForURL('**/modules/space_exploration/index.html*');
  await ready();
  report.steps.push('Nova career commissioned through integrated player UI');

  const discoveredSetup = await page.evaluate(async () => {
    const host = window.__MASSFRONT_SPACE_HOST__;
    const state = window.__MASSFRONT_SPACE__.getState();
    const { deployProbe } = await import('./src/domain/progression.js');
    if (!state.commissioning.completed) throw new Error('Nova career did not commission');
    // The planet ladder now requires Caldris's primary scan before Ithara.
    // Preserve this freshly commissioned state for the separate emergency fixture.
    const vector = deployProbe(state, 'aelos_capitol_vector').state;
    const phase = deployProbe(vector, 'aelos_phase_trace').state;
    const next = deployProbe(phase, 'aelos_traffic_census').state;
    await host.saveCampaignSnapshot(next);
    return {
      commissionedBase: state,
      profileId: next.profileId, revision: next.revision,
      foundIds: next.discoveries.foundIds,
      missionOpsCommissioned: next.ship.districts.mission_ops.commissioned,
      hangarCommissioned: next.ship.districts.hangar.commissioned
    };
  });
  const commissionedBase = discoveredSetup.commissionedBase;
  delete discoveredSetup.commissionedBase;
  report.discoveredFixture = discoveredSetup;
  assert.ok(report.discoveredFixture.foundIds.includes('aelos_traffic_cipher'));
  assert.equal(report.discoveredFixture.missionOpsCommissioned, false);
  await page.reload();
  await ready();
  await enterUga();
  await playHome();
  const objective = page.locator('.uga-campaign-hub [data-objective]');
  report.objectiveBefore = await objective.evaluate(element => ({
    step: element.dataset.objective, title: element.querySelector('h3')?.textContent,
    detail: element.querySelector(':scope > p')?.textContent,
    constructionTarget: element.querySelector('[data-objective-construction]')?.dataset.objectiveConstruction,
    buttonCount: element.querySelectorAll('button').length
  }));
  assert.equal(report.objectiveBefore.step, 'deploy', 'known locked mission must not send player back to scan');
  assert.equal(report.objectiveBefore.constructionTarget, 'mission_ops', 'next action identifies the missing Mission Ops core');
  assert.equal(report.objectiveBefore.buttonCount, 1, 'objective has one next-action control');
  assert.match(report.objectiveBefore.detail, /Commission Mission Operations/i);
  await capture('01-discovered-next-action', '[data-objective-construction="mission_ops"]');
  await touch(page.locator('[data-objective-construction="mission_ops"]'));
  const construction = page.locator('.uga-command-shell[data-view="construction"][data-district="mission_ops"]');
  await construction.waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await construction.locator('[data-build-plot="tier1"]').first().evaluate(element => element.classList.contains('is-selected')), true);
  assert.match(await construction.locator('.uga-district-plots').innerText(), /Mission Operations/);
  await capture('02-mission-ops-plot', '[data-build-plot="tier1"]');
  report.steps.push('discovered but core-blocked mission opens its exact Tier-1 construction plot');
  await page.reload();
  await ready();
  await enterUga();
  await playHome();
  assert.equal(await page.locator('[data-objective-construction="mission_ops"]').count(), 1, 'next action survives reload without spending resources');
  report.steps.push('blocked objective remains correctly routed after reload');

  report.zeroProbeFixture = await page.evaluate(async base => {
    const host = window.__MASSFRONT_SPACE_HOST__;
    const domain = await import('./src/domain/state_store.js');
    const { deployProbe } = await import('./src/domain/progression.js');
    const next = deployProbe(base, 'aelos_capitol_vector').state;
    if (next.surveys.aelos_phase_trace.depleted) throw new Error('Critical Aelos route was already surveyed');
    next.resources.probes = 0;
    next.route = { scene: 'system', systemId: 'aelos', targetId: 'aelos_caldris', returnRoute: null };
    next.revision = window.__MASSFRONT_SPACE__.getState().revision + 1;
    domain.assertDomainState(next, host.commanderCatalogContext);
    await host.saveCampaignSnapshot(next);
    return {
      revision: next.revision, probes: next.resources.probes,
      targetId: next.route.targetId, phaseTraceDepleted: next.surveys.aelos_phase_trace.depleted
    };
  }, commissionedBase);
  await page.reload();
  await ready();
  if (await page.evaluate(() => window.__MASSFRONT_SPACE__.scene === 'uga')) {
    await enterUga();
    await playHome();
    await touch(page.locator('.uga-campaign-depart'));
  }
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__.scene === 'system', null, { timeout: 60000 });
  await touch(page.locator('#actSurvey'));
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__.scene === 'survey' && window.__MASSFRONT_SPACE__.planetarySurvey?.active, null, { timeout: 15000 });
  assert.match(await page.locator('#surveyModalTitle').innerText(), /CALDRIS ORBITAL SURVEY/i);
  const phaseRow = page.locator('#surveyDiscoveryList .discovery-item').filter({ hasText: 'Outer Relay Phase Trace' });
  assert.match(await phaseRow.innerText(), /EMERGENCY/, 'campaign-critical signal stays available at zero probes');

  async function aimAtDeposit(id) {
    let aim;
    for (let attempt = 0; attempt < 3; attempt++) {
      // Read the authored site and current reticle, then rotate the actual
      // globe canvas with pointer gestures. No rotation or aim state is set.
      const drag = await page.evaluate(depositId => {
        const survey = window.__MASSFRONT_SPACE__.planetarySurvey;
        const deposit = survey.deposits.find(item => item.id === depositId);
        if (!deposit) throw new Error(`Authored scanner site missing: ${depositId}`);
        const rect = survey.renderer.domElement.getBoundingClientRect();
        const dossierTop = document.querySelector('.survey-dossier').getBoundingClientRect().top;
        const x = rect.left + rect.width / 2;
        const y = Math.min(rect.top + rect.height * .37, dossierTop - 130);
        const yaw = survey.planetGroup.rotation.y;
        // The reticle faces local longitude -rotation.y, not +rotation.y.
        const deltaYaw = Math.atan2(Math.sin(-deposit.lon - yaw), Math.cos(-deposit.lon - yaw));
        return { x, y, dx: deltaYaw / .012, dy: (deposit.lat - survey.planetGroup.rotation.x) / .012, target: { id: deposit.id, kind: deposit.kind, lat: deposit.lat, lon: deposit.lon } };
      }, id);
      await page.mouse.move(drag.x, drag.y);
      await page.mouse.down();
      await page.mouse.move(drag.x + drag.dx, drag.y + drag.dy, { steps: 18 });
      await page.mouse.up();
      aim = await page.evaluate(() => {
        const survey = window.__MASSFRONT_SPACE__.planetarySurvey;
        const result = survey.evaluateAim();
        return { hit: result.hit, id: result.deposit?.id, kind: result.kind, surveyId: result.surveyId, signal: result.signal, threshold: result.threshold, rotation: { x: survey.planetGroup.rotation.x, y: survey.planetGroup.rotation.y } };
      });
      if (aim.hit && aim.id === id) break;
    }
    assert.equal(aim?.id, id, `real globe gesture aimed at ${id}`);
    assert.equal(aim.hit, true, `real globe gesture crossed the signal threshold for ${id}`);
    return aim;
  }

  report.emergencyAim = await aimAtDeposit('caldris_pelagic_archive');
  assert.equal(report.emergencyAim.surveyId, 'aelos_phase_trace');
  await page.waitForFunction(() => {
    const button = document.getElementById('btnSurveyLaunchProbe');
    return button && !button.disabled && /EMERGENCY SIGNAL SCAN/.test(button.innerText);
  }, null, { timeout: 5000 });
  await capture('03-zero-probe-emergency-aim', '#btnSurveyLaunchProbe');
  await touch(page.locator('#btnSurveyLaunchProbe'));
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__.getState().surveys.aelos_phase_trace.depleted, null, { timeout: 10000 });
  report.emergencyAfter = await page.evaluate(async () => {
    const state = window.__MASSFRONT_SPACE__.getState();
    const saved = await window.__MASSFRONT_SPACE_HOST__.loadCampaignSnapshot();
    return {
      probes: state.resources.probes,
      depleted: state.surveys.aelos_phase_trace.depleted,
      spent: state.surveys.aelos_phase_trace.probesSpent,
      discoveryCount: state.discoveries.foundIds.filter(id => id === 'veyra_route_solution').length,
      savedProbes: saved.resources.probes,
      savedDepleted: saved.surveys.aelos_phase_trace.depleted,
      savedSpent: saved.surveys.aelos_phase_trace.probesSpent,
      resultVisible: !document.getElementById('surveyResult').hidden
    };
  });
  assert.deepEqual(report.emergencyAfter, {
    probes: 0, depleted: true, spent: 0, discoveryCount: 1,
    savedProbes: 0, savedDepleted: true, savedSpent: 0, resultVisible: true
  }, 'critical discovery depletes once without spending or creating a probe');
  await page.screenshot({ path: resolve(out, '04-zero-probe-emergency-result.png') });
  await touch(page.locator('#surveyContinueScan'));
  report.depositAim = await aimAtDeposit('caldris_alloy_shelf');
  assert.equal(report.depositAim.kind, 'mineral');
  await page.waitForFunction(() => {
    const button = document.getElementById('btnSurveyLaunchProbe');
    return button?.disabled && /DEPOSITS REQUIRE RESUPPLY/.test(button.innerText);
  }, null, { timeout: 5000 });
  await page.screenshot({ path: resolve(out, '05-zero-probe-deposit-blocked.png') });
  assert.equal(await page.locator('#btnSurveyLaunchProbe').isDisabled(), true, 'zero-probe mineral extraction remains blocked');
  report.steps.push('real scanner gesture resolves one emergency signal at zero probes; deposit extraction stays blocked');
  await page.reload();
  await ready();
  report.emergencyAfterReload = await page.evaluate(() => {
    const state = window.__MASSFRONT_SPACE__.getState();
    return {
      probes: state.resources.probes,
      depleted: state.surveys.aelos_phase_trace.depleted,
      spent: state.surveys.aelos_phase_trace.probesSpent,
      discoveryCount: state.discoveries.foundIds.filter(id => id === 'veyra_route_solution').length
    };
  });
  assert.deepEqual(report.emergencyAfterReload, { probes: 0, depleted: true, spent: 0, discoveryCount: 1 }, 'reload cannot duplicate or charge the emergency survey');
  report.steps.push('emergency survey depletion and zero-probe ledger survive reload');

  report.researchFixture = await page.evaluate(async () => {
    const host = window.__MASSFRONT_SPACE_HOST__;
    const current = window.__MASSFRONT_SPACE__.getState();
    const domain = await import('./src/domain/state_store.js');
    const next = domain.createShowcaseReadyDomainState(host.commanderCatalogContext);
    next.profileId = current.profileId;
    domain.assertDomainState(next, host.commanderCatalogContext);
    await host.saveCampaignSnapshot(next);
    return {
      profileId: next.profileId, revision: next.revision,
      researchCommissioned: next.ship.districts.research.commissioned,
      researchPoints: next.resources.researchPoints,
      progress: next.research.progressById.universal_probe_autonomy
    };
  });
  assert.equal(report.researchFixture.researchCommissioned, true);
  await page.reload();
  await ready();
  await enterUga();
  await playHome();
  await touch(page.locator('.uga-campaign-hub [data-hub-route="galactic-research"]'));
  const researchRoom = page.locator('.uga-command-shell[data-view="command"][data-district="research"]');
  await researchRoom.waitFor({ state: 'visible', timeout: 10000 });
  const researchButton = researchRoom.locator('[data-research="universal_probe_autonomy"]');
  assert.equal(await researchButton.isEnabled(), true, 'canonical-state research quote enables the real UI button');
  report.researchBefore = await page.evaluate(async () => {
    const state = window.__MASSFRONT_SPACE__.getState();
    const { commitResearch } = await import('./src/domain/progression.js');
    const quote = commitResearch(state, 'universal_probe_autonomy', 10);
    return {
      revision: state.revision,
      researchPoints: state.resources.researchPoints,
      progress: state.research.progressById.universal_probe_autonomy,
      expected: {
        revision: quote.state.revision,
        researchPoints: quote.state.resources.researchPoints,
        progress: quote.state.research.progressById.universal_probe_autonomy,
        committed: quote.committed
      }
    };
  });
  assert.match(await researchButton.innerText(), new RegExp(`COMMIT ${report.researchBefore.expected.committed}`));
  await capture('06-research-before-commit', '[data-research="universal_probe_autonomy"]');
  await touch(researchButton);
  await page.waitForFunction(expected => window.__MASSFRONT_SPACE__.getState().revision >= expected, report.researchBefore.expected.revision, { timeout: 10000 });
  report.researchAfter = await page.evaluate(async () => {
    const state = window.__MASSFRONT_SPACE__.getState();
    const saved = await window.__MASSFRONT_SPACE_HOST__.loadCampaignSnapshot();
    return {
      revision: state.revision, researchPoints: state.resources.researchPoints,
      progress: state.research.progressById.universal_probe_autonomy,
      savedRevision: saved.revision, savedResearchPoints: saved.resources.researchPoints,
      savedProgress: saved.research.progressById.universal_probe_autonomy
    };
  });
  const expected = report.researchBefore.expected;
  assert.deepEqual([report.researchAfter.revision, report.researchAfter.researchPoints, report.researchAfter.progress], [expected.revision, expected.researchPoints, expected.progress], 'touch commits exactly the quoted domain research amount once');
  assert.deepEqual([report.researchAfter.savedRevision, report.researchAfter.savedResearchPoints, report.researchAfter.savedProgress], [expected.revision, expected.researchPoints, expected.progress], 'host saves research once');
  await capture('07-research-after-commit', '[data-research="universal_probe_autonomy"]');
  report.steps.push('enabled research button commits the quoted amount and persists through host');
  await page.reload();
  await ready();
  await enterUga();
  await playHome();
  await touch(page.locator('.uga-campaign-hub [data-hub-route="galactic-research"]'));
  await researchRoom.waitFor({ state: 'visible', timeout: 10000 });
  report.researchAfterReload = await page.evaluate(() => {
    const state = window.__MASSFRONT_SPACE__.getState();
    return { revision: state.revision, researchPoints: state.resources.researchPoints, progress: state.research.progressById.universal_probe_autonomy };
  });
  assert.deepEqual(report.researchAfterReload, { revision: expected.revision, researchPoints: expected.researchPoints, progress: expected.progress }, 'reload neither loses nor duplicates research commitment');
  assert.equal(await researchButton.isEnabled(), true, 'partially funded research remains actionable after reload');
  await capture('08-research-after-reload', '[data-research="universal_probe_autonomy"]');
  report.steps.push('reload preserves one committed research action and still offers the next');

  assert.deepEqual(report.pageErrors, [], 'no uncaught page errors');
  report.sourceAfter = await hashes(root);
  report.packageAfter = await hashes(serveRoot);
  assert.deepEqual(report.sourceAfter, report.sourceBefore, 'source stable across capture');
  assert.deepEqual(report.packageAfter, report.packageBefore, 'package stable across capture');
  await guard.checkpoint('packed UGA next action and research final');
  report.pass = true;
} catch (error) {
  fatal = error;
  report.failure = { message: error.message, stack: error.stack };
  if (page) {
    try {
      report.failureFrames = await Promise.all(page.frames().map(async frame => ({
        url: frame.url(),
        careerCards: await frame.locator('#mfCareerFactionGate .mfcfgCard').evaluateAll(cards => cards.map(card => ({
          faction: card.dataset.faction,
          text: card.innerText.slice(0, 180)
        }))).catch(() => [])
      })));
      report.failureUi = await page.evaluate(() => ({
        scene: window.__MASSFRONT_SPACE__?.scene,
        view: document.querySelector('.uga-command-shell')?.dataset.view,
        district: document.querySelector('.uga-command-shell')?.dataset.district,
        objective: document.querySelector('[data-objective]')?.textContent?.trim(),
        research: document.querySelector('[data-research="universal_probe_autonomy"]')?.outerHTML
      }));
      await page.screenshot({ path: resolve(out, 'failure-screen.png') });
    } catch (diagnosticError) { report.failureUiError = String(diagnosticError); }
  }
} finally {
  if (page) await page.close().catch(() => {});
  if (browser) await closePwBrowser().catch(() => {});
  if (server) await new Promise(done => server.close(done));
  if (guard) {
    try { await guard.release({ assertStable: true, name: 'packed UGA next action and research release' }); }
    catch (error) { report.pass = false; report.freezeFailure = error.message; fatal ||= error; }
  }
  report.finishedAt = new Date().toISOString();
  if (guard) await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ pass: report.pass, output: out, failure: report.failure?.message, freezeFailure: report.freezeFailure, steps: report.steps }, null, 2));
}
if (fatal) process.exitCode = 1;
