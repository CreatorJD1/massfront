import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';
import { loadProductionCommanderRosterSnapshot } from './tests/production-commander-roster.fixture.mjs';

const moduleRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = join(moduleRoot, 'tmp', 'responsive-interface-audit');
const url = process.env.MF_SPACE_URL || 'http://127.0.0.1:8997/modules/space_exploration/index.html';
await mkdir(output, { recursive: true });

const viewports = [
  ['phone-portrait', 430, 932],
  ['phone-landscape', 932, 430],
  ['tablet-portrait', 820, 1180],
  ['tablet-landscape', 1180, 820],
  ['desktop-1440', 1440, 900],
  ['desktop-1920', 1920, 1080],
  ['foldable-narrow', 360, 740]
];

const errors = [];
const captures = [];
const browser = await launchPwBrowser();
const productionRoster = await loadProductionCommanderRosterSnapshot();
let page;

async function settle(ms = 220) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function waitForSpaceReady() {
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 20_000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
}

async function audit(label, viewportName) {
  const result = await page.evaluate(({ label, viewportName }) => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const scrollClips = element => {
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent);
        if (/(auto|scroll)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`)) return true;
        parent = parent.parentElement;
      }
      return false;
    };
    const controls = [...document.querySelectorAll('button, select, input, [role="button"]')].filter(visible);
    const undersized = [];
    const clipped = [];
    for (const element of controls) {
      const rect = element.getBoundingClientRect();
      const label = element.getAttribute('aria-label') || element.textContent.trim().replace(/\s+/g, ' ').slice(0, 60) || element.id || element.tagName;
      const delegatedCheckbox = element.matches('input[type="checkbox"]') && element.closest('label')?.getBoundingClientRect().height >= 44;
      if (!delegatedCheckbox && (rect.width < 44 || rect.height < 44)) undersized.push({ label, width: +rect.width.toFixed(1), height: +rect.height.toFixed(1) });
      if (!scrollClips(element) && (rect.left < -1 || rect.top < -1 || rect.right > width + 1 || rect.bottom > height + 1)) clipped.push({ label, rect: [rect.left, rect.top, rect.right, rect.bottom].map(value => +value.toFixed(1)) });
    }
    const root = document.documentElement;
    const moduleContextLost = window.__MASSFRONT_SPACE__?.engine?.renderer?.getContext?.().isContextLost();
    let baseContextLost = null;
    try {
      if (typeof gl !== 'undefined' && gl?.isContextLost) baseContextLost = gl.isContextLost();
    } catch (_) {}
    const warRoomVisible = document.querySelector('#warScr') ? visible(document.querySelector('#warScr')) : false;
    return {
      label,
      viewportName,
      viewport: [width, height],
      controlCount: controls.length,
      undersized,
      clipped,
      pageOverflow: { x: Math.max(0, root.scrollWidth - width), y: Math.max(0, root.scrollHeight - height) },
      scene: document.querySelector('#moduleFrame')?.dataset.scene || (warRoomVisible ? 'war-room' : ''),
      contextLost: moduleContextLost ?? baseContextLost ?? true
    };
  }, { label, viewportName });
  return result;
}

async function capture(viewportName, label) {
  await settle();
  const path = join(output, `${viewportName}--${label}.png`);
  await page.screenshot({ path });
  const result = await audit(label, viewportName);
  captures.push({ ...result, path });
  return result;
}

try {
  const gpuPage = await browser.newPage({ viewport: { width: 320, height: 240 } });
  const gpu = await assertHardwareGpu(gpuPage);
  await gpuPage.close();

  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
  });
  page.on('requestfailed', request => errors.push(`request: ${request.url()} - ${request.failure()?.errorText || 'failed'}`));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForSpaceReady();
  await page.evaluate(async commanderRosterSnapshot => {
    const domain = await import('./src/domain/index.js');
    const hostModule = await import('./src/host/massfront_solo_host.js');
    let storedProfiles = null;
    try { storedProfiles = JSON.parse(localStorage.getItem('massfront_profiles_v1')); } catch (_) {}
    const storedList = Array.isArray(storedProfiles?.list) ? storedProfiles.list : [];
    const profileId = storedList.find(profile => profile?.id === storedProfiles?.active)?.id
      || storedList.find(profile => typeof profile?.id === 'string' && profile.id)?.id
      || 'p1';
    const ticket = hostModule.createMassfrontGalacticEntryTicket(profileId, {
      entryView: 'campaign_hub',
      introRequired: false,
      commanderRosterSnapshot,
      commanderRosterFingerprint: commanderRosterSnapshot.fingerprint
    });
    sessionStorage.setItem(hostModule.MASSFRONT_GALACTIC_ENTRY_TICKET_KEY, JSON.stringify(ticket));
  }, productionRoster);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForSpaceReady();
  await page.evaluate(async () => {
    const host = window.__MASSFRONT_SPACE_HOST__;
    const domain = await import('./src/domain/state_store.js');
    const state = domain.createShowcaseReadyDomainState(host.commanderCatalogContext);
    state.profileId = window.__MASSFRONT_SPACE__.getState().profileId;
    await host.saveCampaignSnapshot(state);
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForSpaceReady();

  for (const [viewportName, width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__MASSFRONT_SPACE__.openSystem());
    await capture(viewportName, 'system-autopilot');
    await page.evaluate(() => window.__MASSFRONT_SPACE__.openGalaxy());
    await capture(viewportName, 'galaxy');
    await page.evaluate(() => window.__MASSFRONT_SPACE__.openSystem());
    await page.evaluate(() => window.__MASSFRONT_SPACE__.openSurvey());
    await capture(viewportName, 'survey');
    await page.evaluate(() => window.__MASSFRONT_SPACE__.openUga());
    await page.waitForSelector('.uga-command-shell:not([hidden])');
    await capture(viewportName, 'uga-overview');

    for (const [deck, district] of [['A', 'navigation'], ['B', 'research'], ['C', 'hangar']]) {
      await page.click(`[data-deck-filter="${deck}"]`);
      await page.click(`button[data-district="${district}"]`);
      // UGA focus transitions run for 920 ms. A responsive screenshot taken
      // during that tween is useful for motion debugging but invalid as a
      // visual-quality comparison of the selected room.
      await settle(900);
      await capture(viewportName, `deck-${deck.toLowerCase()}-${district}`);
    }
    for (const [view, selector] of [
      ['missions', '[data-nav="missions"]'],
      ['crew', '[data-nav="crew"]'],
      ['logistics', '[data-nav="more"]'],
      ['research', '[data-quick="research"]'],
      ['construction', '[data-quick="construction"]']
    ]) {
      await page.evaluate(selector => document.querySelector(selector)?.click(), selector);
      await capture(viewportName, view);
    }
    /* PLAY first opens the shallow Command access drawer so exploration stays
       visible. Verify its single active dock state, then exercise the explicit
       War Table escape and real Back control into this same strategic hub. */
    await page.click('[data-nav="classic"]');
    await page.waitForSelector('.uga-command-shell[data-view="classic"] .uga-command-war-table', { timeout: 30_000 });
    const activeDock = await page.locator('.uga-command-nav button.is-active').evaluateAll(buttons => buttons.map(button => button.dataset.nav));
    if (activeDock.length !== 1 || activeDock[0] !== 'classic') errors.push(`route: ${viewportName} PLAY drawer active dock ${JSON.stringify(activeDock)}`);
    await Promise.all([
      page.waitForURL(current => current.pathname.endsWith('/index.html')
        && !current.pathname.includes('/modules/space_exploration/'), { timeout: 60_000 }),
      page.click('.uga-command-war-table')
    ]);
    await page.waitForSelector('#warScr', { state: 'visible', timeout: 60_000 });
    // Direct module layout runs do not pass through the base account portal.
    // Establish the same offline identity a player selected before entering UGA
    // so the portal cannot cover the War Room or its real Back control.
    if (await page.locator('#apOverlay').isVisible()) {
      await page.click('#apOfflineBtn');
      await page.locator('#apOverlay').waitFor({ state: 'hidden', timeout: 30_000 });
      await page.waitForSelector('#warScr', { state: 'visible', timeout: 30_000 });
    }
    const classic = await capture(viewportName, 'classic-terminal');
    if (classic.scene !== 'war-room') errors.push(`route: ${viewportName} Classic did not reach the War Room`);
    await Promise.all([
      page.waitForURL(current => current.pathname.endsWith('/modules/space_exploration/index.html'), { timeout: 60_000 }),
      page.click('#warBack')
    ]);
    await waitForSpaceReady();
  }

  const summary = {
    gpu,
    url,
    captureCount: captures.length,
    runtimeErrors: [...new Set(errors)],
    clipping: captures.reduce((sum, item) => sum + item.clipped.length, 0),
    undersizedControls: captures.reduce((sum, item) => sum + item.undersized.length, 0),
    overflow: captures.reduce((sum, item) => sum + Number(item.pageOverflow.x > 0 || item.pageOverflow.y > 0), 0),
    contextLosses: captures.filter(item => item.contextLost).length,
    captures
  };
  await writeFile(join(output, 'report.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    captureCount: summary.captureCount,
    runtimeErrors: summary.runtimeErrors.length,
    clipping: summary.clipping,
    undersizedControls: summary.undersizedControls,
    overflow: summary.overflow,
    contextLosses: summary.contextLosses,
    output
  }, null, 2));
  if (summary.runtimeErrors.length || summary.clipping || summary.undersizedControls || summary.overflow || summary.contextLosses) process.exitCode = 1;
} finally {
  if (page) await page.close();
  await Promise.race([closePwBrowser(), new Promise(resolve => setTimeout(resolve, 5000))]);
}
process.exit(process.exitCode || 0);
