import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';

const moduleRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = join(moduleRoot, 'tmp', 'construction-state-matrix');
const url = process.env.MF_SPACE_URL || 'http://127.0.0.1:9012/modules/space_exploration/index.html';
const districts = ['navigation', 'survey', 'mission_ops', 'research', 'fabricator', 'engineering', 'habitat', 'factions', 'hangar', 'logistics'];
const scenarios = ['empty', 'queued', 'active', 'completed', 'retrofit'];
await mkdir(output, { recursive: true });

const browser = await launchPwBrowser();
let page;
const runtimeErrors = [];
const captures = [];

async function ready() {
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 30_000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
}

async function installScenario(districtId, scenario) {
  await page.evaluate(async ({ districtId, scenario }) => {
    const domain = await import('./src/domain/index.js');
    let state = domain.createInitialDomainState();
    for (const key of ['credits', 'alloys', 'components', 'bioSamples']) state.resources[key] = 99999;
    const resetDistrict = id => {
      const district = state.ship.districts[id];
      district.built = false;
      district.commissioned = false;
      district.level = 1;
      district.facilities = { tier1: null, tier2: null, tier3: null };
      district.facilityOffline = { tier2: false, tier3: false };
    };
    const finish = (work, eventId) => {
      state = domain.advanceExpeditionCycles(state, work, eventId, 'verification').state;
    };
    const commission = id => {
      if (state.ship.districts[id].commissioned) return;
      state = domain.enqueueConstruction(state, id);
      finish(2, `matrix:${districtId}:${scenario}:${id}:commission`);
    };
    const install = (id, facilityId, work) => {
      state = domain.enqueueConstruction(state, id, facilityId);
      finish(work, `matrix:${districtId}:${scenario}:${facilityId}`);
    };

    resetDistrict(districtId);
    if (scenario === 'queued') {
      const blocker = districtId === 'research' ? 'mission_ops' : 'research';
      resetDistrict(blocker);
      state = domain.enqueueConstruction(state, blocker);
      state = domain.enqueueConstruction(state, districtId);
    } else if (scenario === 'active') {
      state = domain.enqueueConstruction(state, districtId);
    } else if (scenario === 'completed' || scenario === 'retrofit') {
      commission(districtId);
      const tier2 = domain.getFacilityChoices(districtId, 2);
      install(districtId, tier2[0].id, 2);
      if (scenario === 'completed') {
        const tier3 = domain.getFacilityChoices(districtId, 3);
        install(districtId, tier3[0].id, 3);
      } else {
        state = domain.enqueueConstruction(state, districtId, tier2[1].id);
      }
    }
    localStorage.setItem(domain.DOMAIN_STORAGE_KEY, domain.serializeDomainState(state));
  }, { districtId, scenario });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await ready();
  await page.evaluate(id => window.__MASSFRONT_SPACE__.openUga(id), districtId);
  await page.waitForSelector('.uga-command-shell:not([hidden])');
  await page.waitForTimeout(950);
  await page.click('[data-quick="construction"]');
  await page.waitForSelector('.uga-construction-view');
  await page.waitForTimeout(120);
}

try {
  const gpuPage = await browser.newPage({ viewport: { width: 320, height: 240 } });
  const gpu = await assertHardwareGpu(gpuPage);
  await gpuPage.close();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  page.on('pageerror', error => runtimeErrors.push(`page: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await ready();

  for (const districtId of districts) {
    for (const scenario of scenarios) {
      await installScenario(districtId, scenario);
      const evidence = await page.evaluate(async ({ districtId, scenario }) => {
        const domain = await import('./src/domain/index.js');
        const experience = window.__MASSFRONT_SPACE__;
        const state = experience.getState();
        const root = experience.commandScene.districtRoots.get(districtId);
        const visible = [];
        root?.traverse(object => {
          if (object.visible && object.userData?.build_plot_id) visible.push({
            plot: object.userData.build_plot_id,
            phase: object.userData.build_phase,
            facility: object.userData.facility_id || null,
            status: object.userData.construction_status,
            runtimeTopology: object.userData.runtimeTopology === true
          });
        });
        const construction = domain.getConstructionStatus(state);
        return {
          districtId,
          scenario,
          commissioned: state.ship.districts[districtId].commissioned,
          level: state.ship.districts[districtId].level,
          queue: construction.queue.filter(job => job.districtId === districtId).map(job => ({ kind: job.kind, status: job.status, targetTier: job.targetTier })),
          visible,
          contextLost: experience.engine.renderer.getContext().isContextLost()
        };
      }, { districtId, scenario });
      const path = join(output, `${districtId}-${scenario}.png`);
      await page.screenshot({ path });
      captures.push({ ...evidence, path });
    }
  }

  const checks = {
    captureCount: captures.length === districts.length * scenarios.length,
    authoredOnly: captures.every(capture => capture.visible.every(entry => !entry.runtimeTopology)),
    noContextLoss: captures.every(capture => !capture.contextLost),
    emptyStates: captures.filter(capture => capture.scenario === 'empty').every(capture => !capture.commissioned),
    queuedStates: captures.filter(capture => capture.scenario === 'queued').every(capture => capture.queue[0]?.status === 'queued'),
    activeStates: captures.filter(capture => capture.scenario === 'active').every(capture => capture.queue[0]?.status === 'active'),
    completedStates: captures.filter(capture => capture.scenario === 'completed').every(capture => capture.commissioned && capture.level === 3),
    retrofitStates: captures.filter(capture => capture.scenario === 'retrofit').every(capture => capture.queue[0]?.kind === 'retrofit'),
    runtimeErrors: runtimeErrors.length === 0
  };
  const report = { gpu, checks, runtimeErrors, captures };
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ gpu, checks, captureCount: captures.length, output }, null, 2));
  if (Object.values(checks).some(value => value !== true)) process.exitCode = 1;
} finally {
  if (page) await page.close().catch(() => {});
  await Promise.race([closePwBrowser(), new Promise(resolve => setTimeout(resolve, 5000))]);
}

process.exit(process.exitCode || 0);
