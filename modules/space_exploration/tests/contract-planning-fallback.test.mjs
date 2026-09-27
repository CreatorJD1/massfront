import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePwBrowser, launchPwBrowser } from '../../../tools/pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const mime = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/__contract_planning_test__.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><main id="mount" style="width:100vw;height:100vh"></main></body></html>');
      return;
    }
    if (pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    const file = resolve(root, `.${pathname}`);
    const within = relative(root, file);
    if (!within || within === '..' || within.startsWith('..\\') || within.startsWith('../') || isAbsolute(within)) throw new Error('Outside repository');
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const origin = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  // This mounts the actual delegated card-click path without starting a second
  // WebGL scene or relying on whichever career a full-game capture happened to load.
  browser = await launchPwBrowser({ ownershipMode: 'isolated' });
  for (const scenario of [
    { name: 'zero-probe-support', missionId: 'nova_heliograph_wake', expectedFaction: 'nova' },
    { name: 'injured-default-brood-proxy', missionId: 'uga_pale_bloom', expectedFaction: 'dominion' }
  ]) {
    const page = await browser.newPage({ viewport: { width: 412, height: 900 }, hasTouch: true });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`${origin}/__contract_planning_test__.html`, { waitUntil: 'domcontentloaded' });
    const authority = await page.evaluate(async ({ name, missionId }) => {
      const domain = await import('/modules/space_exploration/src/domain/index.js');
      const { createUgaCommand } = await import('/modules/space_exploration/src/ui/uga_command.js');
      const state = domain.createShowcaseReadyDomainState();
      state.resources.probes = 0;
      state.resources.fuel = 20;
      state.route.systemId = name === 'zero-probe-support' ? 'aelos' : 'karak';
      if (name === 'injured-default-brood-proxy') {
        for (const [id, definition] of Object.entries(domain.SPECIALIST_CATALOG)) {
          if (definition.factionId !== 'nova') continue;
          state.personnel.specialists[id].status = 'recovering';
          state.personnel.specialists[id].injury = { severity: 'minor', recoveryCycles: 1 };
        }
      }
      const probe = domain.getMissionEligibility(state, missionId, { proxyFactionId: 'nova', supportId: 'survey_drones' });
      const novaLab = domain.getMissionEligibility(state, missionId, { proxyFactionId: 'nova', supportId: 'field_lab' });
      const dominionLab = domain.getMissionEligibility(state, missionId, { proxyFactionId: 'dominion', supportId: 'field_lab' });
      const ui = createUgaCommand({
        container: document.getElementById('mount'),
        visible: true,
        getState: () => state,
        getCatalog: () => domain,
        getMissionEligibility: (id, request = {}) => domain.getMissionEligibility(state, id, request),
        onMissionSelect: id => { window.__selectedMission = id; }
      });
      window.__contractUi = ui;
      ui.openView('contracts');
      return {
        probeEligible: probe.eligible,
        probeLocks: probe.locks.map(lock => lock.code),
        novaLabEligible: novaLab.eligible,
        dominionLabEligible: dominionLab.eligible
      };
    }, scenario);
    assert.equal(authority.probeEligible, false, `${scenario.name}: default Survey Drones must be unaffordable`);
    assert.ok(authority.probeLocks.includes('RESOURCE_SHORTAGE'), `${scenario.name}: zero probes must be the authoritative blocker`);
    assert.equal(authority[scenario.name === 'zero-probe-support' ? 'novaLabEligible' : 'dominionLabEligible'], true,
      `${scenario.name}: Field Lab must be an eligible alternate`);
    if (scenario.name === 'injured-default-brood-proxy') assert.equal(authority.novaLabEligible, false, 'injured Nova specialists must be unavailable');

    const card = page.locator(`.uga-mission-card[data-mission="${scenario.missionId}"]`);
    await card.waitFor({ state: 'visible' });
    assert.equal(await card.isEnabled(), true, `${scenario.name}: contract card must allow planning`);
    assert.match(await card.textContent(), /READY FOR PLANNING/, `${scenario.name}: card must not display a stale resource lock`);
    await card.click();
    const planner = page.locator(`.uga-deployment-planner[data-mission-id="${scenario.missionId}"]`);
    await planner.waitFor({ state: 'visible' });
    assert.equal(await planner.locator('[data-deploy="support"]').inputValue(), 'field_lab', `${scenario.name}: planner must inherit affordable Field Lab`);
    assert.equal(await planner.locator('[data-deploy="factionId"]').inputValue(), scenario.expectedFaction,
      `${scenario.name}: planner must inherit an eligible proxy faction`);
    assert.equal(await page.evaluate(() => window.__selectedMission), scenario.missionId, `${scenario.name}: card click must dispatch the mission`);
    assert.deepEqual(pageErrors, [], `${scenario.name}: browser page errors`);
    await page.close();
  }

  const storesPage = await browser.newPage({ viewport: { width: 412, height: 900 }, hasTouch: true });
  const storesErrors = [];
  storesPage.on('pageerror', error => storesErrors.push(error.message));
  await storesPage.goto(`${origin}/__contract_planning_test__.html`, { waitUntil: 'domcontentloaded' });
  const storesBefore = await storesPage.evaluate(async () => {
    const domain = await import('/modules/space_exploration/src/domain/index.js');
    const { createUgaCommand } = await import('/modules/space_exploration/src/ui/uga_command.js');
    let state = domain.enqueueConstruction(domain.createInitialDomainState(), 'mission_ops');
    state.resources.fuel = 0;
    state.resources.credits = 0;
    let refuelCalls = 0;
    const ui = createUgaCommand({
      container: document.getElementById('mount'),
      visible: true,
      getState: () => state,
      getCatalog: () => domain,
      getRefuelQuote: () => domain.getRefuelQuote(state),
      onRefuel: () => {
        state = domain.refuelShip(state);
        refuelCalls += 1;
      }
    });
    window.__storesFixture = { getState: () => state, getRefuelCalls: () => refuelCalls, ui };
    ui.openView('logistics');
    return {
      quote: domain.getRefuelQuote(state),
      workCompleted: state.ship.constructionQueue[0].workCompleted,
      expeditionCycle: state.ship.expeditionCycle
    };
  });
  assert.equal(storesBefore.quote.available, true, 'bankrupt zero-fuel career must offer recovery');
  assert.equal(storesBefore.quote.mode, 'emergency', 'bankrupt recovery must use emergency mode');
  const refuelButton = storesPage.locator('.uga-command-shell[data-view="logistics"] [data-action="refuel"]');
  await refuelButton.waitFor({ state: 'visible' });
  assert.equal(await refuelButton.isEnabled(), true, 'Stores emergency refuel button must be enabled');
  assert.match(await refuelButton.textContent(), /EMERGENCY REFUEL/, 'Stores must identify the emergency action');
  await refuelButton.click();
  await storesPage.waitForFunction(() => window.__storesFixture?.getState().resources.fuel === 30);
  const storesAfter = await storesPage.evaluate(() => {
    const state = window.__storesFixture.getState();
    return {
      fuel: state.resources.fuel,
      credits: state.resources.credits,
      emergencyFuelActive: state.ship.emergencyFuelActive,
      workCompleted: state.ship.constructionQueue[0].workCompleted,
      expeditionCycle: state.ship.expeditionCycle,
      refuelCalls: window.__storesFixture.getRefuelCalls()
    };
  });
  assert.equal(storesAfter.fuel, 30, 'Stores callback must top up the fuel reserve');
  assert.equal(storesAfter.credits, 0, 'emergency refuel must not charge a bankrupt career');
  assert.equal(storesAfter.emergencyFuelActive, true, 'Stores callback must activate emergency fuel');
  assert.equal(storesAfter.workCompleted, storesBefore.workCompleted, 'refuel alone must not advance construction');
  assert.equal(storesAfter.expeditionCycle, storesBefore.expeditionCycle, 'refuel alone must not advance expedition cycles');
  assert.equal(storesAfter.refuelCalls, 1, 'Stores button must dispatch exactly one onRefuel callback');
  assert.deepEqual(storesErrors, [], 'Stores emergency refuel browser page errors');
  await storesPage.close();
} finally {
  if (browser) await closePwBrowser(browser);
  await new Promise(resolveClose => server.close(resolveClose));
}

console.log('UGA contract planning fallback: PASS');
console.log('UGA Stores emergency refuel: PASS');
