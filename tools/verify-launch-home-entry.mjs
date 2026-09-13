import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';
import { closePwBrowser, launchPwBrowser } from './pw-browser.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.env.MF_LAUNCH_HOME_TAG || 'source';
assert.match(tag, /^[a-z0-9][a-z0-9-]{0,63}$/);
const out = resolve(root, '.tmp', 'launch-home-entry', tag);
const sourceFiles = [
  'src/launcher.js',
  'src/main.js',
  'src/career-faction-gate.js',
  'src/galactic-operations.js',
  'modules/space_exploration/src/space_module.js',
  'modules/space_exploration/src/space_experience.js',
  'modules/space_exploration/src/ui/campaign_hub_registry.js',
  'modules/space_exploration/src/ui/uga_command.js',
  'modules/space_exploration/src/ui/uga_command.css'
];
const digest = value => createHash('sha256').update(value).digest('hex');
const hashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, digest(await readFile(resolve(root, file)))])));
const mime = Object.freeze({
  '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webp': 'image/webp'
});

const report = {
  tag,
  runtime: 'source',
  viewports: [
    { width: 412, height: 900, deviceScaleFactor: 2 },
    { width: 900, height: 412, deviceScaleFactor: 2 }
  ],
  startedAt: new Date().toISOString(),
  verifierSha256: digest(await readFile(new URL(import.meta.url))),
  before: null,
  errors: [],
  consoleErrors: [],
  failedLocalRequests: [],
  blockedExternalRequests: [],
  screenshots: []
};
let freeze, server, browser, context;
try {
  await mkdir(out, { recursive: true });
  freeze = await acquireVerificationFreeze({
    root,
    label: `stable UGA home launch ${tag}`,
    allowedPaths: [resolve(root, '.tmp'), resolve(root, 'tmp'), resolve(root, 'audit')]
  });
  report.before = await hashes();
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const requested = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
      const path = resolve(root, `.${decodeURIComponent(requested)}`);
      if (!path.startsWith(root)) {
        response.writeHead(403);
        response.end();
        return;
      }
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Type', mime[extname(path).toLowerCase()] || 'application/octet-stream');
      response.end(await readFile(path));
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  report.url = `http://127.0.0.1:${server.address().port}/`;

  browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });
  context = await browser.newContext({
    viewport: { width: 412, height: 900 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });
  page.on('requestfailed', request => {
    const failure = { url: request.url(), error: request.failure()?.errorText || '' };
    const host = new URL(request.url()).hostname;
    if (['127.0.0.1', 'localhost'].includes(host)) report.failedLocalRequests.push(failure);
    else report.blockedExternalRequests.push(failure);
  });
  await page.route('**/*', route => {
    const requestUrl = route.request().url();
    const host = new URL(requestUrl).hostname;
    return ['127.0.0.1', 'localhost'].includes(host) || /^(blob|data):/.test(requestUrl)
      ? route.continue()
      : route.abort();
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('mf_launch_home_acceptance')) return;
    localStorage.clear();
    sessionStorage.setItem('mf_launch_home_acceptance', '1');
  });

  /* A wait that dies here used to leave nothing behind: the recorded
     source-final failure had zero screenshots and zero boot state, so a genuine
     stall and a too-tight budget were indistinguishable. Never fail a boot wait
     without recording what the cover was actually doing. */
  const failBootWait = async (label, error) => {
    report.failedWait = label;
    const shot = resolve(out, `failure-${label}.png`);
    try {
      await page.screenshot({ path: shot, timeout: 15000 });
      report.screenshots.push(shot);
    } catch (shotError) { report.failureShotError = shotError.message.split('\n')[0]; }
    try {
      report.bootStateAtFailure = await page.evaluate(() => {
        const text = id => (document.getElementById(id)?.textContent || '').trim();
        return {
          coverPresent: Boolean(document.getElementById('mfBootCover')),
          legacyCoverPresent: Boolean(document.getElementById('bootCover')),
          bootPct: text('mfBootPct'), bootPhase: text('mfBootPhase'), bootDetail: text('mfBootDetail'),
          bodyClass: document.body?.className || '', readyState: document.readyState,
          introStartPresent: Boolean(document.getElementById('mfIntroStart')),
          launcher: typeof mfLauncherSnapshot === 'function' ? mfLauncherSnapshot() : null,
          glBootFailed: window.__MF_GL_BOOT_FAILED === true
        };
      });
    } catch (stateError) { report.bootStateError = stateError.message.split('\n')[0]; }
    throw error;
  };

  /* POLL ON A TIMER, NEVER ON requestAnimationFrame. Every waitForFunction below
     passes this. Playwright defaults to polling:'raf', and this page drives a live
     WebGL attract scene and then a 3D space scene, so when the GPU is starved the
     compositor stops producing frames, rAF callbacks stop firing, and the
     predicate is never evaluated at all. A failed run proved it: the state
     captured on failure showed the cover already gone and mfLauncherSnapshot().gate
     already true, while this very wait had just timed out for 30s. The condition
     had been satisfied the whole time. An interval poll cannot be starved. */
  const POLL = 250;

  await page.goto(report.url, { waitUntil: 'domcontentloaded' });
  /* src/launcher.js:47 declares L.gate=true and L.phase='updater' as plain
     initialisers, so this predicate flips the instant that file PARSES — about
     1.4-3.1s in, measured. It proves the manifest reached launcher.js. It is NOT
     a readiness signal, and nothing may budget from it as if it were. */
  const parsedAt = Date.now();
  await page.waitForFunction(() => typeof mfLauncherSnapshot === 'function' && mfLauncherSnapshot().gate, {}, { timeout: 30000, polling: POLL })
    .catch(error => failBootWait('launcher-parse', error));
  report.launcherParsedMs = Date.now() - parsedAt;
  report.gpu = await assertHardwareGpu(page);
  /* The opaque cover is removed by initIntro(), which main.js's init loop only
     reaches after boot()'s whole synchronous engine bring-up. Measured on an
     RTX 4060 / D3D11: initGL3D ~1.1-1.3s, initModels ~0.6-0.7s, buildDetailTex
     ~0.5s and buildTerrain 4.4-5.4s. Cover-clear across four fresh-browser runs
     was 10.5s, 12.5s, 13.5s and 20.3s, so the old 20000ms budget — started from
     the parse-time gate above — was a coin flip, and losing it is exactly the
     recorded line-115 failure. Budget for the real distribution; a hang still
     fails, now with a frame and the boot phase attached. Raising this alone
     would be wrong: the anchor and the missing evidence were the actual defect. */
  const coverWaitStartedAt = Date.now();
  await page.waitForFunction(() => !document.getElementById('mfBootCover') && !document.getElementById('bootCover'), {}, { timeout: 90000, polling: POLL })
    .catch(error => failBootWait('boot-cover', error));
  report.bootCoverClearedMs = Date.now() - coverWaitStartedAt;
  /* PLAY OFFLINE only appears when the update check fails; on the happy path
     #mfLaunchPlay settles into CONTINUE TO INTRO and the offline action stays
     hidden. The previous readiness predicate accepted an offline button whose own
     computed display was not 'none' while an ancestor still kept it unrendered at
     a zero box, so any run arriving before the play button finished "VERIFYING
     GAME…" took the else branch and spent 30s clicking a control nobody can see.
     Require a real rendered box, and decide the branch from the state that
     actually satisfied the wait rather than re-sampling afterwards. */
  const launchAction = await page.waitForFunction(() => {
    const rendered = element => {
      if (!element || element.disabled) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const primary = document.getElementById('mfLaunchPlay');
    if (rendered(primary) && /CONTINUE TO INTRO/i.test(primary.innerText || '')) return 'play';
    if (rendered(document.getElementById('mfLaunchOffline'))) return 'offline';
    return false;
  }, {}, { timeout: 60000, polling: POLL })
    .then(handle => handle.jsonValue())
    .catch(error => failBootWait('launcher-ready', error));
  report.launchAction = launchAction;
  await page.locator(launchAction === 'play' ? '#mfLaunchPlay' : '#mfLaunchOffline').click();
  /* The launch title dismisses itself: intro.js scheduleClose() calls closeIntro()
     2800ms after the reveal opens, and that runs the very same revealFront() path
     the START button triggers. Insisting on the click is therefore a race the
     harness can only lose on a slow browser — observed as "element is not stable"
     while the open animation runs, then "element is not visible" once the timer
     fires. Take the click when it is there, accept the auto-close as the identical
     outcome, and let the auth gate below be the real assertion. */
  const introStart = page.locator('#mfIntroStart');
  await introStart.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  report.introDismissedBy = await introStart.click({ timeout: 5000 }).then(() => 'start-button', () => 'auto-close');
  await page.locator('#apOfflineBtn').waitFor({ state: 'visible', timeout: 20000 })
    .catch(error => failBootWait('auth-gate', error));
  await page.evaluate(() => {
    sessionStorage.setItem('mf.launch-home-trace.v1', '[]');
    const originalOpen = mfOpenExploration;
    mfOpenExploration = function(entryView, options) {
      const trace = JSON.parse(sessionStorage.getItem('mf.launch-home-trace.v1') || '[]');
      trace.push({ kind: 'open', entryView, options: options || null });
      sessionStorage.setItem('mf.launch-home-trace.v1', JSON.stringify(trace));
      return originalOpen.apply(this, arguments);
    };
    const originalShow = showFrontScreen;
    showFrontScreen = function(id) {
      const trace = JSON.parse(sessionStorage.getItem('mf.launch-home-trace.v1') || '[]');
      trace.push({ kind: 'screen', id });
      sessionStorage.setItem('mf.launch-home-trace.v1', JSON.stringify(trace));
      return originalShow.apply(this, arguments);
    };
  });
  await page.locator('#apOfflineBtn').click();
  await page.waitForURL('**/modules/space_exploration/index.html*', { timeout: 30000 });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__ || window.__MASSFRONT_SPACE_ERROR__, {}, { timeout: 60000, polling: POLL });
  await page.evaluate(() => window.__MASSFRONT_SPACE__?.ready);

  report.home = await page.evaluate(() => {
    const ticket = JSON.parse(sessionStorage.getItem('massfront.galactic.entry.v1') || 'null');
    const trace = JSON.parse(sessionStorage.getItem('mf.launch-home-trace.v1') || '[]');
    const hub = document.querySelector('.uga-campaign-hub');
    const depart = document.querySelector('.uga-campaign-depart');
    const basic = document.querySelector('.uga-basic-access');
    const districtList = document.querySelector('.uga-district-list');
    const visible = element => Boolean(element && !element.hidden && getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0);
    const dockButtons = [...document.querySelectorAll('.uga-command-nav button')].filter(visible);
    const listRect = districtList?.getBoundingClientRect() || null;
    const visibleDistricts = [...(districtList?.querySelectorAll('.uga-district-button') || [])].filter(button => {
      if (!listRect) return false;
      const rect = button.getBoundingClientRect();
      return rect.right > listRect.left && rect.left < listRect.right;
    });
    return {
      ticketEntryView: ticket?.entryView || null,
      trace,
      scene: window.__MASSFRONT_SPACE__?.scene || null,
      currentSystem: window.__MASSFRONT_SPACE__?.engine?.currentSystem?.id || null,
      error: String(window.__MASSFRONT_SPACE_ERROR__ || ''),
      campaignHubVisible: visible(hub),
      departVisible: visible(depart),
      departLabel: depart?.innerText?.trim() || '',
      departIsFirstAction: hub?.querySelector('button') === depart,
      /* What this assertion is actually defending is that the UGA loop leads the
         strategic home and the classic-mode doors never do. "Depart is literally
         the first button" was a fine proxy while the hub had nothing above it,
         but the current objective directive sits above Depart and its action IS
         the loop — for hiring and deployment it reaches places Depart cannot.
         Record the kind of the first action so the contract can say what it
         means, and keep asserting that Basic Access is never it. */
      firstActionKind: (() => {
        const first = hub?.querySelector('button');
        if (!first) return 'none';
        if (first === depart) return 'depart';
        if (first.closest('.uga-objective')) return 'objective';
        if (first.closest('.uga-basic-access')) return 'basic-access';
        return 'other';
      })(),
      basicAccessVisible: visible(basic),
      basicActionLabels: [...(basic?.querySelectorAll('button > span') || [])].map(span => span.textContent.trim()),
      servicesVisible: visible(document.querySelector('.uga-campaign-services')),
      dockLabels: dockButtons.map(button => button.querySelector('span')?.textContent.trim() || ''),
      activeDockLabels: dockButtons.filter(button => button.classList.contains('is-active')).map(button => button.querySelector('span')?.textContent.trim() || ''),
      partialDistrictLabels: visibleDistricts.filter(button => {
        if (!listRect) return false;
        const rect = button.getBoundingClientRect();
        return rect.left < listRect.left - .5 || rect.right > listRect.right + .5;
      }).map(button => button.querySelector('.uga-district-copy b')?.textContent.trim() || ''),
      firstEntryIntroStarted: window.__MASSFRONT_SPACE__?.firstEntryIntro?.started ?? null
    };
  });
  assert.equal(report.home.ticketEntryView, 'campaign_hub');
  assert.deepEqual(report.home.trace.filter(entry => entry.kind === 'open').map(entry => entry.entryView), ['campaign_hub']);
  assert.equal(report.home.trace.some(entry => entry.kind === 'screen' && entry.id === 'startScreen'), false);
  assert.equal(report.home.scene, 'uga');
  assert.equal(report.home.currentSystem, null, 'system assets/travel must not start before deliberate departure');
  assert.equal(report.home.error, '');
  assert.equal(report.home.campaignHubVisible, true);
  assert.equal(report.home.departVisible, true);
  assert.match(report.home.departLabel, /RETURN TO ORBIT|DEPART/i);
  assert.ok(['objective', 'depart'].includes(report.home.firstActionKind),
    `the strategic home's first action must be the command objective or Depart, not ${report.home.firstActionKind}`);
  assert.equal(report.home.basicAccessVisible, true);
  assert.deepEqual(report.home.basicActionLabels, ['Standard', 'Training', 'Campaign', 'War Table']);
  assert.equal(report.home.servicesVisible, false);
  assert.deepEqual(report.home.dockLabels, ['Play', 'Ship', 'Progress', 'Social', 'More']);
  assert.deepEqual(report.home.activeDockLabels, ['Play']);
  assert.deepEqual(report.home.partialDistrictLabels, [], 'portrait room carousel must not clip a partially visible label at the right edge');
  assert.equal(report.home.firstEntryIntroStarted, false);
  const homeShot = resolve(out, '01-stable-campaign-home.png');
  await page.screenshot({ path: homeShot });
  report.screenshots.push(homeShot);

  await page.locator('.uga-command-nav [data-nav="more"]').click();
  await page.locator('.uga-campaign-services').waitFor({ state: 'visible', timeout: 5000 });
  report.more = await page.evaluate(() => {
    const visible = element => Boolean(element && !element.hidden && getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0);
    const dockButtons = [...document.querySelectorAll('.uga-command-nav button')].filter(visible);
    return {
      servicesVisible: visible(document.querySelector('.uga-campaign-services')),
      campaignHubVisible: visible(document.querySelector('.uga-campaign-hub')),
      serviceCount: document.querySelectorAll('.uga-campaign-services .uga-hub-route').length,
      shortcutLabels: [...document.querySelectorAll('.uga-campaign-services .uga-more-shortcuts button span')].map(span => span.textContent.trim()),
      activeDockLabels: dockButtons.filter(button => button.classList.contains('is-active')).map(button => button.querySelector('span')?.textContent.trim() || '')
    };
  });
  assert.equal(report.more.servicesVisible, true);
  assert.equal(report.more.campaignHubVisible, false);
  assert.ok(report.more.serviceCount > 0);
  assert.deepEqual(report.more.shortcutLabels, ['Galaxy', 'Crew', 'Settings']);
  assert.deepEqual(report.more.activeDockLabels, ['More']);
  const moreShot = resolve(out, '02-more-services.png');
  await page.screenshot({ path: moreShot });
  report.screenshots.push(moreShot);

  await page.locator('.uga-command-nav [data-nav="classic"]').click();
  await page.locator('.uga-campaign-hub').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('.uga-campaign-depart').click();
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.scene === 'system' && window.__MASSFRONT_SPACE__?.engine?.currentSystem, {}, { timeout: 120000, polling: POLL });
  report.departed = await page.evaluate(() => ({
    scene: window.__MASSFRONT_SPACE__.scene,
    currentSystem: window.__MASSFRONT_SPACE__.engine.currentSystem?.id || null,
    ugaButtonVisible: (() => {
      const element = document.getElementById('btnUgaCommand');
      return Boolean(element && !element.hidden && getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0);
    })()
  }));
  assert.equal(report.departed.scene, 'system');
  assert.ok(report.departed.currentSystem);
  assert.equal(report.departed.ugaButtonVisible, true);
  const departShot = resolve(out, '03-deliberate-depart.png');
  await page.screenshot({ path: departShot });
  report.screenshots.push(departShot);

  await page.locator('#btnUgaCommand').click();
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.scene === 'uga', {}, { timeout: 30000, polling: POLL });
  report.returned = await page.evaluate(() => {
    const visible = element => Boolean(element && !element.hidden && getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0);
    const dockButtons = [...document.querySelectorAll('.uga-command-nav button')].filter(visible);
    return {
      scene: window.__MASSFRONT_SPACE__.scene,
      campaignHubVisible: visible(document.querySelector('.uga-campaign-hub')),
      activeDockLabels: dockButtons.filter(button => button.classList.contains('is-active')).map(button => button.querySelector('span')?.textContent.trim() || '')
    };
  });
  assert.deepEqual(report.returned, { scene: 'uga', campaignHubVisible: true, activeDockLabels: ['Play'] });
  const returnShot = resolve(out, '04-returned-campaign-home.png');
  await page.screenshot({ path: returnShot });
  report.screenshots.push(returnShot);

  await page.setViewportSize({ width: 900, height: 412 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  report.landscape = await page.evaluate(() => {
    const visible = element => Boolean(element && !element.hidden && getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0);
    const dockButtons = [...document.querySelectorAll('.uga-command-nav button')].filter(visible);
    const districtList = document.querySelector('.uga-district-list');
    const listRect = districtList?.getBoundingClientRect() || null;
    const visibleDistricts = [...(districtList?.querySelectorAll('.uga-district-button') || [])].filter(button => {
      if (!listRect) return false;
      const rect = button.getBoundingClientRect();
      return rect.right > listRect.left && rect.left < listRect.right;
    });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      campaignHubVisible: visible(document.querySelector('.uga-campaign-hub')),
      basicAccessVisible: visible(document.querySelector('.uga-basic-access')),
      servicesVisible: visible(document.querySelector('.uga-campaign-services')),
      dockLabels: dockButtons.map(button => button.querySelector('span')?.textContent.trim() || ''),
      activeDockLabels: dockButtons.filter(button => button.classList.contains('is-active')).map(button => button.querySelector('span')?.textContent.trim() || ''),
      partialDistrictLabels: visibleDistricts.filter(button => {
        if (!listRect) return false;
        const rect = button.getBoundingClientRect();
        return rect.left < listRect.left - .5 || rect.right > listRect.right + .5;
      }).map(button => button.querySelector('.uga-district-copy b')?.textContent.trim() || ''),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1
    };
  });
  assert.deepEqual(report.landscape.viewport, { width: 900, height: 412 });
  assert.equal(report.landscape.campaignHubVisible, true);
  assert.equal(report.landscape.basicAccessVisible, true);
  assert.equal(report.landscape.servicesVisible, false);
  assert.deepEqual(report.landscape.dockLabels, ['Play', 'Ship', 'Progress', 'Social', 'More']);
  assert.deepEqual(report.landscape.activeDockLabels, ['Play']);
  assert.deepEqual(report.landscape.partialDistrictLabels, [], 'landscape room carousel must not clip a partially visible label at the right edge');
  assert.equal(report.landscape.horizontalOverflow, false);
  const landscapeShot = resolve(out, '05-landscape-campaign-home.png');
  await page.screenshot({ path: landscapeShot });
  report.screenshots.push(landscapeShot);

  /* The route handler aborts every non-localhost request on purpose so this runs
     hermetically, and Chrome logs each abort as "Failed to load resource". Those
     console errors are the harness's own doing — this run blocked six updater and
     pack checks to huggingface.co and the Cloudflare worker, and got exactly six.
     Demanding consoleErrors === [] could therefore never pass while the app does
     any update check at all. Subtract exactly as many resource failures as were
     blocked and require the remainder to be clean; a genuine local failure is
     still caught, because failedLocalRequests is asserted empty below. */
  const resourceNoise = report.consoleErrors.filter(text => /Failed to load resource/i.test(text));
  report.unexplainedConsoleErrors = [
    ...report.consoleErrors.filter(text => !/Failed to load resource/i.test(text)),
    ...resourceNoise.slice(report.blockedExternalRequests.length)
  ];
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.unexplainedConsoleErrors, []);
  assert.deepEqual(report.failedLocalRequests, []);
  report.pass = true;
} catch (error) {
  report.pass = false;
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await closePwBrowser(browser).catch(() => {});
  if (server) await new Promise(done => server.close(done));
  report.after = report.before ? await hashes() : null;
  report.sourceDrift = Boolean(report.before && JSON.stringify(report.before) !== JSON.stringify(report.after));
  if (report.sourceDrift) report.pass = false;
  if (freeze) {
    try {
      await freeze.release({ assertStable: true, name: `stable UGA home launch ${tag} complete` });
      report.freezeStable = true;
    } catch (error) {
      report.freezeStable = false;
      report.freezeError = error.stack || String(error);
      report.pass = false;
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify({
  pass: report.pass,
  home: report.home,
  more: report.more,
  departed: report.departed,
  returned: report.returned,
  landscape: report.landscape,
  gpu: report.gpu,
  launcherParsedMs: report.launcherParsedMs,
  bootCoverClearedMs: report.bootCoverClearedMs,
  failedWait: report.failedWait || null,
  launchAction: report.launchAction,
  introDismissedBy: report.introDismissedBy,
  unexplainedConsoleErrors: report.unexplainedConsoleErrors,
  blockedExternalRequests: report.blockedExternalRequests?.length,
  bootStateAtFailure: report.bootStateAtFailure || null,
  sourceDrift: report.sourceDrift,
  freezeStable: report.freezeStable,
  screenshots: report.screenshots,
  failure: report.failure || null
}, null, 2));
