import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  assertPwBrowserOwnership, closePwBrowser, launchPwBrowser, pwBrowserEvidence, recordPwBrowserGpu
} from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';

const execFileAsync = promisify(execFile);
const moduleRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(moduleRoot, '..', '..');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const evidenceRoot = join(moduleRoot, 'tmp', 'construction-system');
const output = join(evidenceRoot, 'runs', runId);
const requestedUrl = process.env.MF_SPACE_URL || null;
const allViewports = [
  { id: 'phone-portrait-430x932', width: 430, height: 932, kind: 'phone portrait' },
  { id: 'phone-landscape-915x412', width: 915, height: 412, kind: 'phone landscape' },
  { id: 'tablet-768x1024', width: 768, height: 1024, kind: 'tablet portrait' },
  { id: 'desktop-1440x900', width: 1440, height: 900, kind: 'desktop' }
];
const viewportFilter = String(process.env.MF_CONSTRUCTION_VIEWPORT || '').trim();
const viewportRepeat = Math.max(1, Number.parseInt(process.env.MF_CONSTRUCTION_REPEAT || '1', 10));
const browserMode = String(process.env.MF_CONSTRUCTION_BROWSER_MODE || 'isolated').trim().toLowerCase();
if (!['isolated', 'shared'].includes(browserMode)) throw new Error(`Unknown MF_CONSTRUCTION_BROWSER_MODE ${browserMode}.`);
const selectedViewports = viewportFilter ? allViewports.filter(viewport => viewport.id === viewportFilter) : allViewports;
const viewports = viewportRepeat === 1
  ? selectedViewports
  : selectedViewports.flatMap(viewport => Array.from({ length: viewportRepeat }, (_, index) => ({
    ...viewport,
    id: `${viewport.id}--repeat-${index + 1}`,
    sourceViewportId: viewport.id,
    repeat: index + 1
  })));
if (!viewports.length) throw new Error(`Unknown MF_CONSTRUCTION_VIEWPORT ${viewportFilter}.`);
const sourceFiles = [
  'index.html',
  'src/space_experience.js',
  'src/core/uga_command_scene.js',
  'src/core/window_emissive_bloom.js',
  'src/domain/construction.js',
  'src/domain/construction_catalog.js',
  'src/domain/state_store.js',
  'src/ui/uga_command.css',
  'src/ui/uga_command.js',
  'tools/verify-construction-system.mjs'
];
const MIME = {
  '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp'
};

await mkdir(output, { recursive: true });

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function posixPath(path) {
  return path.split(sep).join('/');
}

async function sourceProvenance() {
  const files = [];
  for (const name of sourceFiles) {
    const bytes = await readFile(join(moduleRoot, name));
    files.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const { stdout: headOut } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
  const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 });
  const workspaceEntries = statusOut.split(/\r?\n/).filter(Boolean);
  const sourceBearingEntries = workspaceEntries.filter(line => {
    const path = line.slice(3).replace(/\\/g, '/');
    return !path.startsWith('.tmp/') && !path.startsWith('modules/space_exploration/tmp/');
  });
  const sourceEntries = sourceBearingEntries.filter(line => {
    const path = line.slice(3).replace(/\\/g, '/');
    return path.startsWith('modules/space_exploration/') || ['tools/pw-browser.mjs', 'tools/chrome-gpu.mjs'].includes(path);
  });
  const sourceStatus = sourceEntries.join('\n');
  const relevant = sourceEntries.filter(line => line.includes('modules/space_exploration/'));
  return {
    head: headOut.trim(),
    dirty: sourceEntries.length > 0,
    dirtyEntries: sourceEntries.length,
    dirtyFingerprint: sha256(sourceStatus),
    workspaceDirtyEntries: workspaceEntries.length,
    workspaceDirtyFingerprint: sha256(statusOut),
    workspaceSourceDirtyEntries: sourceBearingEntries.length,
    workspaceSourceDirtyFingerprint: sha256(sourceBearingEntries.join('\n')),
    dirtyScope: 'space exploration module + owned browser/GPU harness; generated evidence excluded',
    excludedGeneratedEvidenceEntries: workspaceEntries.length - sourceBearingEntries.length,
    relevantDirtyEntries: relevant,
    sourceSetSha256: sha256(files.map(file => `${file.path}:${file.sha256}`).join('\n')),
    files
  };
}

async function startServer() {
  if (requestedUrl) return { url: requestedUrl, close: async () => {}, mode: 'configured' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? '/index.html' : pathname;
      const file = resolve(moduleRoot, `.${requested}`);
      if (file !== moduleRoot && !file.startsWith(`${moduleRoot}${sep}`)) throw new Error('path outside module root');
      const bytes = await readFile(file);
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
      response.end(bytes);
    } catch {
      response.writeHead(404, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/index.html`,
    mode: 'ephemeral-local',
    close: () => new Promise(resolveClose => server.close(resolveClose))
  };
}

async function ready(page) {
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 60_000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  await page.waitForTimeout(250);
}

async function reloadExperience(page) {
  await page.evaluate(() => window.__MASSFRONT_SPACE__?.dispose?.()).catch(() => {});
  await page.waitForTimeout(80);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await ready(page);
}

async function resetCampaign(page) {
  await page.evaluate(async () => {
    const domain = await import('./src/domain/index.js');
    localStorage.setItem(domain.DOMAIN_STORAGE_KEY, domain.serializeDomainState(domain.createInitialDomainState()));
  });
  await reloadExperience(page);
}

async function seedRetrofitPrecondition(page) {
  return page.evaluate(async () => {
    const domain = await import('./src/domain/index.js');
    let state = domain.createInitialDomainState();
    state.resources.credits = 99999;
    state.resources.alloys = 9999;
    state.resources.components = 9999;
    state = domain.enqueueConstruction(state, 'research', null);
    state = domain.advanceExpeditionCycles(state, 2, 'verify:commission', 'survey').state;
    state = domain.enqueueConstruction(state, 'research', 'research_t2_gravitic_computation');
    state = domain.advanceExpeditionCycles(state, 2, 'verify:tier2', 'survey').state;
    localStorage.setItem(domain.DOMAIN_STORAGE_KEY, domain.serializeDomainState(state));
    return {
      commissioned: state.ship.districts.research.commissioned,
      installed: state.ship.districts.research.facilities.tier2,
      queueLength: state.ship.constructionQueue.length
    };
  });
}

async function clickAuthoredPlot(page, districtId, plotId = 'tier1') {
  await page.waitForTimeout(850);
  const point = await page.evaluate(({ districtId, plotId }) => {
    const experience = window.__MASSFRONT_SPACE__;
    const scene = experience.commandScene;
    const canvas = experience.engine.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const root = scene.districtRoots.get(districtId);
    const candidates = [];
    root?.traverse(object => {
      if (!object.visible || object.userData?.build_plot_id !== plotId || !object.geometry) return;
      object.geometry.computeBoundingSphere();
      const center = object.geometry.boundingSphere?.center?.clone?.();
      if (!center) return;
      object.localToWorld(center);
      center.project(scene.camera);
      const x = rect.left + (center.x + 1) * .5 * rect.width;
      const y = rect.top + (1 - center.y) * .5 * rect.height;
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
      const target = document.elementFromPoint(x, y);
      if (target !== canvas) return;
      scene.pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
      scene.pointer.y = -((y - rect.top) / rect.height) * 2 + 1;
      scene.raycaster.setFromCamera(scene.pointer, scene.camera);
      const hits = scene.raycaster.intersectObject(scene.root, true);
      const resolvesPlot = hits.some(hit => {
        let current = hit.object;
        let hitDistrict = null;
        let hitPlot = null;
        while (current) {
          hitDistrict ||= current.userData?.district_id || null;
          hitPlot ||= current.userData?.build_plot_id || null;
          current = current.parent;
        }
        return hitDistrict === districtId && hitPlot === plotId;
      });
      if (resolvesPlot) candidates.push({ x, y, name: object.name, phase: object.userData?.build_phase ?? null });
    });
    return candidates.sort((a, b) => Number(b.phase ?? -1) - Number(a.phase ?? -1))[0] || null;
  }, { districtId, plotId });
  if (!point) throw new Error(`No visible authored ${districtId}/${plotId} plot point could be hit through the canvas.`);
  await page.mouse.click(point.x, point.y);
  await page.waitForSelector('.uga-construction-view', { state: 'visible', timeout: 10_000 });
  return point;
}

async function openConstruction(page, districtId = 'research', plotId = 'tier1') {
  await page.evaluate(async id => window.__MASSFRONT_SPACE__.openUga(id), districtId);
  await page.waitForSelector('.uga-command-shell:not([hidden])', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const veil = document.querySelector('#renderVeil');
    return veil?.classList.contains('ready') || veil?.classList.contains('failed');
  }, null, { timeout: 60_000 });
  const veil = await page.locator('#renderVeil').getAttribute('class');
  if (/\bfailed\b/.test(veil || '')) throw new Error(`UGA authored cutaway failed to load: ${await page.locator('#loadStatus').textContent()}`);
  const quick = page.locator('button[data-quick="construction"]');
  if (await quick.isVisible()) {
    await quick.click();
  } else {
    const toggle = page.locator('button[data-action="toggle-sheet"]');
    if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    const open = page.locator('button[data-action="open-construction"]');
    if (await open.isVisible()) await open.click();
    else await clickAuthoredPlot(page, districtId, plotId);
  }
  await page.waitForSelector('.uga-construction-view', { state: 'visible' });
  await page.waitForTimeout(180);
}

async function constructionState(page) {
  return page.evaluate(() => {
    const experience = window.__MASSFRONT_SPACE__;
    const state = experience.getState();
    const gl = experience.engine?.renderer?.getContext?.();
    return {
      revision: state.revision,
      resources: state.resources,
      queue: state.ship.constructionQueue.map(job => ({
        id: job.id, districtId: job.districtId, kind: job.kind, targetTier: job.targetTier,
        facilityId: job.facilityId, replacedFacilityId: job.replacedFacilityId,
        status: job.status, queueOrder: job.queueOrder, workCompleted: job.workCompleted, workRequired: job.workRequired
      })),
      research: {
        commissioned: state.ship.districts.research.commissioned,
        tier: state.ship.districts.research.level,
        facilities: state.ship.districts.research.facilities,
        facilityOffline: state.ship.districts.research.facilityOffline
      },
      contextLost: Boolean(gl?.isContextLost?.())
    };
  });
}

async function waitForQueueLength(page, length) {
  await page.waitForFunction(expected => window.__MASSFRONT_SPACE__.getState().ship.constructionQueue.length === expected, length, { timeout: 10_000 });
}

async function clickDistrict(page, districtId) {
  const district = page.locator(`button[data-district="${districtId}"]`);
  await district.waitFor({ state: 'visible' });
  await district.click();
  await page.waitForSelector('.uga-construction-view', { state: 'visible' });
  await page.waitForTimeout(120);
}

async function capture(page, scenario, stage) {
  const filename = `${scenario.id}--${stage}.png`;
  await page.screenshot({ path: join(output, filename), animations: 'disabled' });
  scenario.captures.push(posixPath(relative(moduleRoot, join(output, filename))));
}

async function layoutAudit(page, label) {
  return page.evaluate(stage => {
    const viewport = { width: innerWidth, height: innerHeight };
    const shell = document.querySelector('.uga-command-shell');
    const panel = document.querySelector('.uga-context-panel');
    const scroll = document.querySelector('.uga-construction-view');
    const buttons = [...document.querySelectorAll('.uga-construction-view button')].filter(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }).map((element, index) => {
      const rect = element.getBoundingClientRect();
      return {
        index,
        selector: element.dataset.buildCommission !== undefined ? '[data-build-commission]'
          : element.dataset.buildFacility ? `[data-build-facility="${element.dataset.buildFacility}"]`
            : element.dataset.buildPlot ? `[data-build-plot="${element.dataset.buildPlot}"]`
              : element.dataset.jobCancel ? `[data-job-cancel="${element.dataset.jobCancel}"]`
                : element.dataset.jobOrder ? `[data-job-order="${element.dataset.jobOrder}"]` : element.tagName.toLowerCase(),
        label: (element.getAttribute('aria-label') || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
        disabled: element.disabled,
        x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height,
        intersectsViewport: rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight
      };
    });
    const visible = buttons.filter(button => button.intersectsViewport);
    const overlaps = [];
    for (let a = 0; a < visible.length; a++) for (let b = a + 1; b < visible.length; b++) {
      const left = Math.max(visible[a].x, visible[b].x);
      const top = Math.max(visible[a].y, visible[b].y);
      const right = Math.min(visible[a].right, visible[b].right);
      const bottom = Math.min(visible[a].bottom, visible[b].bottom);
      if (right - left > 1 && bottom - top > 1) overlaps.push({ a: visible[a].selector, b: visible[b].selector, width: right - left, height: bottom - top });
    }
    const rectOf = element => {
      const rect = element?.getBoundingClientRect?.();
      return rect ? { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    };
    return {
      stage,
      viewport,
      shell: rectOf(shell),
      panel: rectOf(panel),
      construction: rectOf(scroll),
      documentHorizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      panelHorizontalOverflow: panel ? panel.scrollWidth - panel.clientWidth : null,
      constructionHorizontalOverflow: scroll ? scroll.scrollWidth - scroll.clientWidth : null,
      undersized: buttons.filter(button => button.width < 44 || button.height < 44),
      horizontallyClipped: visible.filter(button => button.x < -1 || button.right > innerWidth + 1),
      overlaps,
      buttons
    };
  }, label);
}

function addCheck(scenario, id, passed, details = null) {
  scenario.checks.push({ id, status: passed === true ? 'PASS' : passed === false ? 'FAIL' : 'UNKNOWN', details });
}

function auditChecks(scenario, audit) {
  scenario.layoutAudits.push(audit);
  addCheck(scenario, `${audit.stage}:minimum-targets`, audit.undersized.length === 0, audit.undersized);
  addCheck(scenario, `${audit.stage}:horizontal-clipping`, audit.horizontallyClipped.length === 0, audit.horizontallyClipped);
  addCheck(scenario, `${audit.stage}:control-overlap`, audit.overlaps.length === 0, audit.overlaps);
  addCheck(scenario, `${audit.stage}:document-overflow`, audit.documentHorizontalOverflow <= 1, audit.documentHorizontalOverflow);
  addCheck(scenario, `${audit.stage}:panel-overflow`, audit.panelHorizontalOverflow <= 1 && audit.constructionHorizontalOverflow <= 1, {
    panel: audit.panelHorizontalOverflow, construction: audit.constructionHorizontalOverflow
  });
}

async function runScenario(browser, target, url) {
  const scenario = {
    id: target.id,
    kind: target.kind,
    viewport: { width: target.width, height: target.height },
    startedAt: new Date().toISOString(),
    checks: [], captures: [], layoutAudits: [], errors: [], requestsFailed: [], blockers: [], states: {}
  };
  let page;
  try {
    page = await browser.newPage({ viewport: { width: target.width, height: target.height }, hasTouch: true, deviceScaleFactor: 1 });
    page.on('pageerror', error => scenario.errors.push({ type: 'pageerror', message: error.message }));
    page.on('console', message => {
      if (message.type() === 'error') scenario.errors.push({ type: 'console', message: message.text() });
    });
    page.on('requestfailed', request => scenario.requestsFailed.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
    page.on('response', response => {
      if (response.status() >= 400 && !/favicon\.ico(?:\?|$)/.test(response.url())) scenario.errors.push({ type: 'http', status: response.status(), url: response.url() });
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await ready(page);
    await resetCampaign(page);
    await openConstruction(page, 'research');

    const quoteButton = page.locator('button[data-build-commission]');
    await quoteButton.scrollIntoViewIfNeeded();
    const quote = await page.locator('.uga-commission-card').evaluate(card => ({
      text: card.textContent.trim().replace(/\s+/g, ' '),
      costCount: card.querySelectorAll('.uga-facility-cost > span').length,
      buttonText: card.querySelector('[data-build-commission]')?.textContent.trim() || '',
      disabled: Boolean(card.querySelector('[data-build-commission]')?.disabled)
    }));
    scenario.states.initialQuote = quote;
    addCheck(scenario, 'quote:visible-and-actionable', quote.costCount >= 3 && /AUTHORIZE COMMISSIONING/.test(quote.buttonText) && !quote.disabled, quote);
    await capture(page, scenario, 'commission-quote');
    auditChecks(scenario, await layoutAudit(page, 'commission-quote'));

    const beforeFirstCommissionTap = await constructionState(page);
    await quoteButton.click();
    const afterFirstCommissionTap = await constructionState(page);
    const confirmationText = await page.locator('button[data-build-commission]').textContent();
    addCheck(scenario, 'commission:first-tap-is-confirmation-only', beforeFirstCommissionTap.queue.length === 0 && afterFirstCommissionTap.queue.length === 0 && /CONFIRM COMMISSION/.test(confirmationText || ''), {
      beforeQueue: beforeFirstCommissionTap.queue, afterQueue: afterFirstCommissionTap.queue, confirmationText
    });
    await capture(page, scenario, 'commission-confirmation');
    await page.locator('button[data-build-commission]').click();
    await waitForQueueLength(page, 1);
    const oneQueued = await constructionState(page);
    scenario.states.oneQueued = oneQueued;
    addCheck(scenario, 'commission:second-tap-queues', oneQueued.queue.length === 1 && oneQueued.queue[0].districtId === 'research' && oneQueued.queue[0].kind === 'commission', oneQueued.queue);

    await clickDistrict(page, 'fabricator');
    const fabricatorButton = page.locator('button[data-build-commission]');
    await fabricatorButton.scrollIntoViewIfNeeded();
    const fabricatorQuoteText = await page.locator('.uga-commission-card').textContent();
    addCheck(scenario, 'second-quote:visible', /Fabrication & Armory Core/.test(fabricatorQuoteText || ''), fabricatorQuoteText?.trim().replace(/\s+/g, ' ').slice(0, 300));
    await fabricatorButton.click();
    const queueBeforeSecondConfirmation = (await constructionState(page)).queue;
    addCheck(scenario, 'second-commission:first-tap-is-confirmation-only', queueBeforeSecondConfirmation.length === 1 && /CONFIRM COMMISSION/.test(await page.locator('button[data-build-commission]').textContent() || ''), queueBeforeSecondConfirmation);
    await page.locator('button[data-build-commission]').click();
    await waitForQueueLength(page, 2);
    const twoQueued = await constructionState(page);
    scenario.states.twoQueued = twoQueued;
    addCheck(scenario, 'queue:two-user-authorized-jobs', twoQueued.queue.length === 2 && new Set(twoQueued.queue.map(job => job.districtId)).size === 2, twoQueued.queue);

    const movingJob = twoQueued.queue[1];
    const earlier = page.locator(`button[data-job-order="${movingJob.id}:-1"]`);
    await earlier.scrollIntoViewIfNeeded();
    await capture(page, scenario, 'two-jobs-before-reorder');
    auditChecks(scenario, await layoutAudit(page, 'two-jobs-before-reorder'));
    await earlier.click();
    const afterFirstReorderTap = await constructionState(page);
    const reorderAria = await earlier.getAttribute('aria-label');
    addCheck(scenario, 'reorder:first-tap-is-confirmation-only', afterFirstReorderTap.queue[1]?.id === movingJob.id && /confirm queue reorder/i.test(reorderAria || ''), { queue: afterFirstReorderTap.queue, ariaLabel: reorderAria });
    await earlier.click();
    await page.waitForFunction(id => window.__MASSFRONT_SPACE__.getState().ship.constructionQueue[0]?.id === id, movingJob.id, { timeout: 10_000 });
    const reordered = await constructionState(page);
    scenario.states.reordered = reordered;
    addCheck(scenario, 'reorder:second-tap-reorders', reordered.queue[0]?.id === movingJob.id && reordered.queue.every((job, index) => job.queueOrder === index), reordered.queue);
    await capture(page, scenario, 'after-reorder');

    const cancelJob = reordered.queue[1];
    const cancel = page.locator(`button[data-job-cancel="${cancelJob.id}"]`);
    await cancel.scrollIntoViewIfNeeded();
    await cancel.click();
    const afterFirstCancelTap = await constructionState(page);
    const cancelText = await page.locator(`button[data-job-cancel="${cancelJob.id}"]`).textContent();
    addCheck(scenario, 'cancel:first-tap-is-confirmation-only', afterFirstCancelTap.queue.length === 2 && afterFirstCancelTap.queue.some(job => job.id === cancelJob.id) && /CONFIRM/.test(cancelText || ''), {
      queue: afterFirstCancelTap.queue, text: cancelText
    });
    await capture(page, scenario, 'cancel-confirmation');
    await page.locator(`button[data-job-cancel="${cancelJob.id}"]`).click();
    await waitForQueueLength(page, 1);
    const afterCancel = await constructionState(page);
    scenario.states.afterCancel = afterCancel;
    addCheck(scenario, 'cancel:second-tap-cancels', afterCancel.queue.length === 1 && !afterCancel.queue.some(job => job.id === cancelJob.id), afterCancel.queue);

    const persistedJob = afterCancel.queue[0];
    await reloadExperience(page);
    await openConstruction(page, persistedJob.districtId);
    const afterQueueReload = await constructionState(page);
    scenario.states.afterQueueReload = afterQueueReload;
    addCheck(scenario, 'save-reload:queue-continuity', afterQueueReload.queue.length === 1 && afterQueueReload.queue[0].id === persistedJob.id && afterQueueReload.queue[0].queueOrder === 0, afterQueueReload.queue);
    await capture(page, scenario, 'queue-after-reload');
    auditChecks(scenario, await layoutAudit(page, 'queue-after-reload'));

    const retrofitPrecondition = await seedRetrofitPrecondition(page);
    scenario.states.retrofitPrecondition = retrofitPrecondition;
    await reloadExperience(page);
    await openConstruction(page, 'research', 'tier2');
    const tier2Plot = page.locator('button[data-build-plot="tier2"]');
    await tier2Plot.scrollIntoViewIfNeeded();
    await tier2Plot.click();
    const retrofitButton = page.locator('button[data-build-facility="research_t2_xenology_directorate"]');
    await retrofitButton.scrollIntoViewIfNeeded();
    const retrofitQuote = await retrofitButton.locator('xpath=ancestor::article').evaluate(card => ({
      text: card.textContent.trim().replace(/\s+/g, ' '),
      buttonText: card.querySelector('[data-build-facility]')?.textContent.trim() || '',
      costs: card.querySelectorAll('.uga-facility-cost > span').length,
      work: card.querySelector('dl')?.textContent.trim().replace(/\s+/g, ' ') || ''
    }));
    scenario.states.retrofitQuote = retrofitQuote;
    addCheck(scenario, 'retrofit:quote-visible', retrofitPrecondition.commissioned === true && retrofitPrecondition.installed === 'research_t2_gravitic_computation' && /AUTHORIZE RETROFIT/.test(retrofitQuote.buttonText) && retrofitQuote.costs > 0 && /WORK/.test(retrofitQuote.work), retrofitQuote);
    await capture(page, scenario, 'retrofit-quote');
    auditChecks(scenario, await layoutAudit(page, 'retrofit-quote'));

    const beforeFirstRetrofitTap = await constructionState(page);
    await retrofitButton.click();
    const afterFirstRetrofitTap = await constructionState(page);
    const retrofitConfirmationText = await page.locator('button[data-build-facility="research_t2_xenology_directorate"]').textContent();
    addCheck(scenario, 'retrofit:first-tap-is-confirmation-only', beforeFirstRetrofitTap.queue.length === 0 && afterFirstRetrofitTap.queue.length === 0 && afterFirstRetrofitTap.research.facilityOffline.tier2 !== true && /CONFIRM RETROFIT/.test(retrofitConfirmationText || ''), {
      before: beforeFirstRetrofitTap, after: afterFirstRetrofitTap, text: retrofitConfirmationText
    });
    await capture(page, scenario, 'retrofit-confirmation');
    await page.locator('button[data-build-facility="research_t2_xenology_directorate"]').click();
    await waitForQueueLength(page, 1);
    const retrofitQueued = await constructionState(page);
    scenario.states.retrofitQueued = retrofitQueued;
    addCheck(scenario, 'retrofit:second-tap-queues-and-locks-old-facility', retrofitQueued.queue[0]?.kind === 'retrofit'
      && retrofitQueued.queue[0]?.facilityId === 'research_t2_xenology_directorate'
      && retrofitQueued.queue[0]?.replacedFacilityId === 'research_t2_gravitic_computation'
      && retrofitQueued.research.facilityOffline.tier2 === true, retrofitQueued);
    await capture(page, scenario, 'retrofit-queued');

    const retrofitJob = retrofitQueued.queue[0];
    await reloadExperience(page);
    await openConstruction(page, 'research', 'tier2');
    const retrofitReloaded = await constructionState(page);
    scenario.states.retrofitReloaded = retrofitReloaded;
    addCheck(scenario, 'save-reload:retrofit-continuity', retrofitReloaded.queue[0]?.id === retrofitJob.id
      && retrofitReloaded.queue[0]?.kind === 'retrofit'
      && retrofitReloaded.research.facilityOffline.tier2 === true, retrofitReloaded);
    addCheck(scenario, 'webgl:context-healthy', !retrofitReloaded.contextLost, { contextLost: retrofitReloaded.contextLost });
    await capture(page, scenario, 'retrofit-after-reload');
    auditChecks(scenario, await layoutAudit(page, 'retrofit-after-reload'));
  } catch (error) {
    scenario.blockers.push({ code: 'SCENARIO_ABORTED', message: error?.stack || error?.message || String(error) });
  } finally {
    if (page) {
      try {
        const final = await constructionState(page);
        addCheck(scenario, 'webgl:final-context-healthy', !final.contextLost, { contextLost: final.contextLost });
      } catch (error) {
        addCheck(scenario, 'webgl:final-context-healthy', null, error?.message || String(error));
      }
      await page.evaluate(() => window.__MASSFRONT_SPACE__?.dispose?.()).catch(() => {});
      await page.waitForTimeout(80);
      await page.close().catch(() => {});
    }
  }
  addCheck(scenario, 'runtime:no-page-or-console-errors', scenario.errors.length === 0, scenario.errors);
  addCheck(scenario, 'runtime:no-failed-requests', scenario.requestsFailed.length === 0, scenario.requestsFailed);
  if (scenario.blockers.length) addCheck(scenario, 'scenario:completed', false, scenario.blockers);
  else addCheck(scenario, 'scenario:completed', true);
  scenario.finishedAt = new Date().toISOString();
  scenario.summary = {
    pass: scenario.checks.filter(check => check.status === 'PASS').length,
    fail: scenario.checks.filter(check => check.status === 'FAIL').length,
    unknown: scenario.checks.filter(check => check.status === 'UNKNOWN').length,
    blockers: scenario.blockers.length
  };
  scenario.status = scenario.summary.fail === 0 && scenario.summary.unknown === 0 && scenario.summary.blockers === 0 ? 'PASS' : 'FAIL';
  return scenario;
}

function markdown(report) {
  const lines = [
    '# MASSFRONT construction-system acceptance', '',
    `- Status: **${report.status}**`,
    `- Captured: ${report.startedAt} → ${report.finishedAt}`,
    `- URL: \`${report.server?.url || 'UNKNOWN'}\` (${report.server?.mode || 'UNKNOWN'})`,
    `- GPU: \`${JSON.stringify(report.gpu)}\``,
    `- Git HEAD: \`${report.provenance?.head || 'UNKNOWN'}\``,
    `- Start dirty fingerprint: \`${report.provenance?.dirtyFingerprint || 'UNKNOWN'}\` (${report.provenance?.dirtyEntries ?? 'UNKNOWN'} entries)`,
    `- End dirty fingerprint: \`${report.provenanceEnd?.dirtyFingerprint || 'UNKNOWN'}\` (${report.provenanceEnd?.dirtyEntries ?? 'UNKNOWN'} entries)`,
    `- Source-set SHA-256: \`${report.provenance?.sourceSetSha256 || 'UNKNOWN'}\``,
    `- Owned browser sessions: ${report.browserSessions.length}`,
    `- Accepted checks: ${report.summary.pass}`,
    `- Rejected checks: ${report.summary.fail}`,
    `- Unknown checks: ${report.summary.unknown}`,
    `- Blockers: ${report.summary.blockers}`, ''
  ];
  for (const scenario of report.scenarios) {
    lines.push(`## ${scenario.id} — ${scenario.status}`, '');
    lines.push(`PASS ${scenario.summary.pass} · FAIL ${scenario.summary.fail} · UNKNOWN ${scenario.summary.unknown} · blockers ${scenario.summary.blockers}`, '');
    for (const check of scenario.checks) lines.push(`- ${check.status} — ${check.id}`);
    if (scenario.blockers.length) {
      lines.push('', 'Blockers:');
      for (const blocker of scenario.blockers) lines.push(`- ${blocker.code}: ${String(blocker.message).split('\n')[0]}`);
    }
    lines.push('', 'Captures:');
    for (const capturePath of scenario.captures) lines.push(`- \`${capturePath}\``);
    lines.push('');
  }
  lines.push('## Owned browser provenance', '');
  for (const session of report.browserSessions) {
    lines.push(`- PID ${session?.pid ?? 'UNKNOWN'} · port ${session?.port ?? 'UNKNOWN'} · mode ${session?.launchMode ?? 'UNKNOWN'} · owned=${session?.owned ?? 'UNKNOWN'} · reused=${session?.reused ?? 'UNKNOWN'} · GPU \`${session?.gpu?.renderer || 'UNKNOWN'}\` · cleanup=${session?.cleanup?.success ?? false}`);
  }
  lines.push('');
  lines.push('## Source hashes', '');
  for (const file of report.provenance?.files || []) lines.push(`- \`${file.path}\`: \`${file.sha256}\` (${file.bytes} bytes)`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

const report = {
  schemaVersion: 2,
  verifier: 'verify-construction-system.mjs',
  runId,
  startedAt: new Date().toISOString(),
  output: posixPath(relative(moduleRoot, output)),
  acceptance: {
    viewports: viewports.map(({ id, width, height, kind }) => ({ id, width, height, kind })),
    interactions: ['quote', 'two-tap queue authorization', 'two-tap reorder', 'two-tap cancel', 'two-tap retrofit', 'save/reload continuity'],
    minimumTargetCssPx: 44,
    directDomainUse: 'Only deterministic campaign reset and completed Tier-2 retrofit precondition setup; every accepted construction action is performed through a rendered button.'
  },
  diagnostics: {
    browserMode,
    viewportRepeat,
    note: browserMode === 'shared'
      ? 'Diagnostic pressure mode: scenarios intentionally share one Chromium process; not release acceptance evidence.'
      : 'Acceptance mode: each viewport requests an isolated Chromium process.'
  },
  provenance: null,
  provenanceEnd: null,
  server: null,
  gpu: null,
  browserSessions: [],
  scenarios: [],
  blockers: []
};

let browser;
let server;
try {
  report.provenance = await sourceProvenance();
  server = await startServer();
  report.server = { url: server.url, mode: server.mode };
  const runTarget = async (activeBrowser, target) => {
    if (browserMode === 'isolated') await assertPwBrowserOwnership(activeBrowser);
    const gpuPage = await activeBrowser.newPage({ viewport: { width: 320, height: 240 } });
    let gpu;
    try {
      gpu = await assertHardwareGpu(gpuPage);
    } finally {
      await gpuPage.close();
    }
    if (browserMode === 'isolated') recordPwBrowserGpu(activeBrowser, gpu);
    if (!report.gpu) report.gpu = gpu;
    const scenario = await runScenario(activeBrowser, target, server.url);
    scenario.gpu = gpu;
    scenario.browserOwnership = browserMode === 'isolated' ? await assertPwBrowserOwnership(activeBrowser) : null;
    report.scenarios.push(scenario);
    console.log(`${scenario.status} ${scenario.id}: ${scenario.summary.pass} pass, ${scenario.summary.fail} fail, ${scenario.summary.unknown} unknown`);
  };

  if (browserMode === 'shared') {
    report.blockers.push({ code: 'NON_ISOLATED_DIAGNOSTIC', message: 'Shared-browser mode is diagnostic only and cannot produce acceptance PASS.' });
    browser = await launchPwBrowser();
    try {
      for (const target of viewports) await runTarget(browser, target);
    } finally {
      await closePwBrowser(browser).catch(() => {});
      browser = null;
    }
  } else {
    for (const target of viewports) {
      // A clean browser process per viewport is intentional. The authored ship
      // allocates several large WebGL programs; carrying them across four device
      // profiles can turn ANGLE resource pressure into a false application shader
      // regression even after each Three.js renderer is disposed.
      browser = await launchPwBrowser({ ownershipMode: 'isolated' });
      let scenario = null;
      try {
        await runTarget(browser, target);
        scenario = report.scenarios[report.scenarios.length - 1] || null;
      } finally {
        let cleanupError = null;
        try { await closePwBrowser(browser); } catch (error) { cleanupError = error; }
        const evidence = pwBrowserEvidence(browser);
        report.browserSessions.push(evidence);
        if (scenario) scenario.browserOwnership = evidence;
        if (cleanupError) report.blockers.push({ code: 'BROWSER_CLEANUP_FAILED', target: target.id, message: cleanupError?.stack || cleanupError?.message || String(cleanupError) });
        browser = null;
      }
    }
  }
} catch (error) {
  report.blockers.push({ code: 'VERIFIER_ABORTED', message: error?.stack || error?.message || String(error) });
} finally {
  if (browser) {
    try { await closePwBrowser(browser); } catch (error) {
      report.blockers.push({ code: 'BROWSER_CLEANUP_FAILED', message: error?.stack || error?.message || String(error) });
    }
    const evidence = pwBrowserEvidence(browser);
    if (evidence && !report.browserSessions.some(item => item?.token === evidence.token)) report.browserSessions.push(evidence);
  }
  if (server) await server.close().catch(() => {});
  try {
    report.provenanceEnd = await sourceProvenance();
    const stable = report.provenance
      && report.provenance.head === report.provenanceEnd.head
      && report.provenance.dirtyFingerprint === report.provenanceEnd.dirtyFingerprint
      && report.provenance.sourceSetSha256 === report.provenanceEnd.sourceSetSha256;
    if (!stable) report.blockers.push({ code: 'EVIDENCE_PROVENANCE_CHANGED', message: 'HEAD, dirty fingerprint, or source-set hash changed during capture.' });
  } catch (error) {
    report.blockers.push({ code: 'EVIDENCE_PROVENANCE_UNKNOWN', message: error?.stack || error?.message || String(error) });
  }
  report.finishedAt = new Date().toISOString();
  if (browserMode === 'isolated') {
    const validSessions = report.browserSessions.length === viewports.length && report.browserSessions.every(evidence =>
      evidence?.launchMode === 'owned-isolated' && evidence?.owned === true && evidence?.reused === false
      && evidence?.ownership?.status === 'PROVEN' && evidence?.pid && evidence?.port && evidence?.profile
      && evidence?.gpu?.renderer && evidence?.gpu?.vendor && evidence?.cleanup?.success === true
      && evidence?.cleanup?.processExited === true && evidence?.cleanup?.portReleased === true
      && evidence?.cleanup?.profileRemoved === true && evidence?.cleanup?.manifestRemoved === true);
    if (!validSessions) report.blockers.push({ code: 'BROWSER_OWNERSHIP_EVIDENCE_INVALID', message: `Expected ${viewports.length} proven and cleaned owned sessions; recorded ${report.browserSessions.length}.` });
  }
  const allChecks = report.scenarios.flatMap(scenario => scenario.checks);
  report.summary = {
    pass: allChecks.filter(check => check.status === 'PASS').length,
    fail: allChecks.filter(check => check.status === 'FAIL').length,
    unknown: allChecks.filter(check => check.status === 'UNKNOWN').length,
    blockers: report.blockers.length + report.scenarios.reduce((sum, scenario) => sum + scenario.blockers.length, 0),
    captures: report.scenarios.reduce((sum, scenario) => sum + scenario.captures.length, 0)
  };
  report.status = report.summary.fail === 0 && report.summary.unknown === 0 && report.summary.blockers === 0 && report.scenarios.length === viewports.length ? 'PASS' : 'FAIL';
  const reportJson = join(output, 'report.json');
  const reportMd = join(output, 'report.md');
  await writeFile(reportJson, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(reportMd, markdown(report));
  await writeFile(join(evidenceRoot, 'latest.json'), `${JSON.stringify({ runId, status: report.status, report: posixPath(relative(moduleRoot, reportJson)), reportSha256: sha256(await readFile(reportJson)), sourceSetSha256: report.provenance?.sourceSetSha256 || null, endSourceSetSha256: report.provenanceEnd?.sourceSetSha256 || null, dirtyFingerprint: report.provenance?.dirtyFingerprint || null, endDirtyFingerprint: report.provenanceEnd?.dirtyFingerprint || null }, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, summary: report.summary, report: reportJson, markdown: reportMd }, null, 2));
}

process.exit(report.status === 'PASS' ? 0 : 1);
