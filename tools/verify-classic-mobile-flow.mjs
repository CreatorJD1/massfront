import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';

// Packed, player-route acceptance for the Classic Standard setup dock. This
// intentionally stops at the deployment brief; START BATTLE is not tapped.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serveRoot = resolve(root, 'www');
const out = resolve(root, 'tmp', `classic-mobile-flow-${new Date().toISOString().replaceAll(':', '-')}-${process.pid}`);
const sourcePaths = ['index.html', 'src/game/meta.js', 'src/galaxyui.js', 'src/styles/ui.css',
  'src/warprimer.js', 'src/styles/tutorial.css'];
const stages = ['galaxy', 'system', 'planet', 'region', 'deploy'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = async base => Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, sha(await readFile(resolve(base, path)))])));
const report = {
  test: 'Packed Classic Standard mobile setup, launch to deployment brief',
  startedAt: new Date().toISOString(), output: out, pass: false,
  sourcePaths, steps: [], pageErrors: [], captures: {}
};
let freeze, server, browser, context, page, fatal;

async function capture(name, selector) {
  await page.locator(selector).waitFor({ state: 'visible', timeout: 30000 });
  const path = resolve(out, `${name}.png`);
  await page.screenshot({ path });
  report.captures[name] = path;
}

async function measureStage(orientation, stage) {
  await page.waitForFunction(expected => typeof mfGalaxyStage !== 'undefined' && mfGalaxyStage === expected &&
    document.getElementById('setupScr')?.classList.contains(`galaxyStage-${expected}`), stage, { timeout: 30000 });
  await page.locator('#setupStart').waitFor({ state: 'visible' });
  const metrics = await page.evaluate(() => {
    const dock = document.querySelector('#setupScr.galaxyFlow .setupFoot');
    const buttons = ['setupBack', 'setupStart'].map(id => {
      const node = document.getElementById(id), rect = node?.getBoundingClientRect();
      const style = node && getComputedStyle(node);
      return { id, text: node?.innerText?.trim(), disabled: Boolean(node?.disabled),
        width: rect?.width, height: rect?.height, top: rect?.top, bottom: rect?.bottom,
        display: style?.display, visibility: style?.visibility };
    });
    const dockStyle = dock && getComputedStyle(dock);
    const screen = document.getElementById('setupScr');
    const scroll = screen?.querySelector('.setupScroll');
    const bounds = screen?.getBoundingClientRect();
    // Inspect only the active stage. Walking every hidden setup subtree and
    // forcing layout for each node can stall this WebGL-heavy page.
    const active = screen?.querySelector('.mfStagePanel.on');
    const activeRect = active?.getBoundingClientRect();
    const selectedSite = active?.querySelector('#mapRow .mapCard.sel');
    const selectedSiteRect = selectedSite?.getBoundingClientRect();
    const siteIntel = selectedSite && Object.fromEntries(['mDs', 'mConquest', 'mReward', 'mHz'].map(name => {
      const node = selectedSite.querySelector(`.${name}`), rect = node?.getBoundingClientRect();
      const label = node?.querySelector('b');
      return [name, { text: node?.textContent?.trim(), display: node && getComputedStyle(node).display,
        height: rect?.height, bottom: rect?.bottom,
        label: label && { textOverflow: getComputedStyle(label).textOverflow,
          scrollWidth: label.scrollWidth, clientWidth: label.clientWidth } }];
    }));
    const siteRows = selectedSite && ['mSize', 'mNm', 'mDs', 'mConquest', 'mReward', 'mHz'].map(name => {
      const node = selectedSite.querySelector(`.${name}`), rect = node?.getBoundingClientRect();
      const children = node && [...node.querySelectorAll(':scope > span, :scope > b')].map(child => {
        const box = child.getBoundingClientRect();
        return { text: child.textContent.trim(), left: box.left, right: box.right,
          top: box.top, bottom: box.bottom };
      });
      return node && { name, top: rect.top, bottom: rect.bottom, children };
    }).filter(Boolean);
    const overflowNodes = [...(screen?.scrollWidth > screen?.clientWidth + 1 && active ? [active, ...active.querySelectorAll('*')] : [])].map(node => {
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
      return { selector: node.id ? `#${node.id}` : node.className && typeof node.className === 'string' ? `.${node.className.trim().split(/\s+/).join('.')}` : node.tagName.toLowerCase(),
        left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width),
        scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, overflowX: style.overflowX };
    }).filter(node => node.right > (bounds?.right || innerWidth) + 2 || node.left < (bounds?.left || 0) - 2).slice(0, 24);
    return { stage: mfGalaxyStage, viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      screenWidth: screen?.clientWidth, screenScrollWidth: screen?.scrollWidth,
      screenOverflowX: screen && getComputedStyle(screen).overflowX,
      activeBounds: activeRect && { left: activeRect.left, right: activeRect.right },
      selectedSite: selectedSiteRect && { height: selectedSiteRect.height, bottom: selectedSiteRect.bottom,
        intel: siteIntel, rows: siteRows },
      contentWidth: scroll?.clientWidth, contentScrollWidth: scroll?.scrollWidth,
      dockBottomPadding: dockStyle?.paddingBottom, buttons, overflowNodes,
      bottomClearance: innerHeight - Math.max(...buttons.map(button => button.bottom || 0)) };
  });
  report.steps.push({ orientation, ...metrics });
  assert.equal(metrics.stage, stage);
  assert.ok(metrics.documentWidth <= metrics.viewport.width + 1, `${orientation}/${stage}: horizontal document overflow`);
  /* Region's off-axis map cards are deliberately clipped by #mapRow. The
     overlay's scrollWidth counts them even though neither the document nor
     the actual setup scrollport can pan sideways. Check the visible stage and
     scrollport instead of treating contained carousel content as overflow. */
  assert.ok(metrics.contentScrollWidth <= metrics.contentWidth + 1,
    `${orientation}/${stage}: horizontal setup content overflow ${metrics.contentScrollWidth}px > ${metrics.contentWidth}px`);
  assert.ok(metrics.activeBounds.left >= -1 && metrics.activeBounds.right <= metrics.viewport.width + 1,
    `${orientation}/${stage}: active stage extends outside viewport`);
  for (const button of metrics.buttons) {
    assert.ok(button.width >= 44 && button.height >= 44, `${orientation}/${stage}: ${button.id} is below a 44px target`);
    assert.ok(button.bottom <= metrics.viewport.height, `${orientation}/${stage}: ${button.id} falls below viewport`);
    assert.ok(button.display !== 'none' && button.visibility !== 'hidden' && !button.disabled,
      `${orientation}/${stage}: ${button.id} is not actionable`);
  }
  assert.ok(metrics.bottomClearance >= 54, `${orientation}/${stage}: footer button bottom clearance ${metrics.bottomClearance}px < 54px`);
  if (stage === 'region') {
    assert.ok(metrics.selectedSite, `${orientation}/region: selected battlefield card missing`);
    const rows = metrics.selectedSite.rows;
    assert.deepEqual(rows.map(row => row.name), ['mSize', 'mNm', 'mDs', 'mConquest', 'mReward', 'mHz'],
      `${orientation}/region: selected battlefield title or decision-critical intel row missing`);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i].top >= rows[i - 1].bottom - 0.5,
        `${orientation}/region: ${rows[i].name} overlaps ${rows[i - 1].name}`);
    }
    for (const row of rows.filter(row => row.name === 'mConquest' || row.name === 'mReward')) {
      const [first, second] = row.children;
      assert.ok(row.children.length === 2 && (second.top >= first.bottom - 0.5 || second.left >= first.right - 0.5),
        `${orientation}/region: ${row.name} label and value overlap`);
    }
    if (orientation === 'landscape') assert.ok(
      metrics.selectedSite.intel.mHz.bottom <= Math.min(...metrics.buttons.map(button => button.top)) - 2,
      `${orientation}/region: weather explanation is hidden behind the action dock`);
    for (const [name, intel] of Object.entries(metrics.selectedSite.intel)) {
      assert.ok(intel.text && intel.display !== 'none' && intel.height > 0 &&
        intel.bottom <= metrics.selectedSite.bottom + 1,
      `${orientation}/region: ${name} is hidden or clipped from the selected battlefield`);
      if (intel.label) assert.ok(intel.label.textOverflow !== 'ellipsis' &&
        intel.label.scrollWidth <= intel.label.clientWidth + 1,
      `${orientation}/region: ${name} label is truncated`);
    }
  }
  if (stage === 'deploy') assert.match(metrics.buttons[1].text, /START BATTLE/i);
  await capture(`${orientation}-${stage}`, '#setupScr');
}

async function advance(expected) {
  await page.locator('#setupStart').click();
  await page.waitForFunction(stage => typeof mfGalaxyStage !== 'undefined' && mfGalaxyStage === stage, expected, { timeout: 30000 });
}

try {
  freeze = await acquireVerificationFreeze({ root, label: 'packed Classic Standard mobile setup',
    allowedPaths: [resolve(root, 'tmp'), resolve(root, 'audit')] });
  await mkdir(out, { recursive: true });
  report.sourceBefore = await hashes(root);
  report.packageBefore = await hashes(serveRoot);
  assert.deepEqual(report.packageBefore, report.sourceBefore, 'www Classic setup files must match current source');
  report.entrySha256 = sha(await readFile(resolve(serveRoot, 'index.html')));
  report.verifierSha256 = sha(await readFile(new URL(import.meta.url)));

  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname).replace(/\/$/, '/index.html');
      const path = resolve(serveRoot, '.' + pathname), rel = relative(serveRoot, path);
      if (rel.startsWith('..') || isAbsolute(rel)) { response.writeHead(403); response.end(); return; }
      response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.webp': 'image/webp',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' })[extname(path)] || 'application/octet-stream');
      response.end(await readFile(path));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  report.url = `http://127.0.0.1:${server.address().port}/`;
  browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });
  context = await browser.newContext({ viewport: { width: 412, height: 900 }, hasTouch: true,
    deviceScaleFactor: 1, serviceWorkers: 'block' });
  page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    return /^(blob|data):/.test(url) || ['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
      ? route.continue() : route.abort();
  });
  await page.goto(report.url, { waitUntil: 'domcontentloaded' });
  report.gpu = await assertHardwareGpu(page);
  report.steps.push('packed entry on hardware WebGL2 in isolated, fresh context');

  await page.waitForFunction(() => typeof mfLauncherSnapshot === 'function' && !document.getElementById('mfBootCover'), null, { timeout: 90000 });
  const launchAction = await page.waitForFunction(() => {
    const visible = node => node && !node.disabled && node.getBoundingClientRect().width > 0;
    const play = document.getElementById('mfLaunchPlay');
    if (visible(play) && /CONTINUE TO INTRO/i.test(play.innerText || '')) return 'play';
    if (visible(document.getElementById('mfLaunchOffline'))) return 'offline';
    return false;
  }, null, { timeout: 60000 }).then(handle => handle.jsonValue());
  await page.locator(launchAction === 'play' ? '#mfLaunchPlay' : '#mfLaunchOffline').click();
  const intro = page.locator('#mfIntroStart');
  await intro.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  report.introDismissedBy = await intro.click({ timeout: 5000 }).then(() => 'button', () => 'auto-close');
  // The first offline tap can open the pre-alpha intro while the launcher
  // remains underneath it. Once the intro closes, a second tap enters login.
  await page.locator('#apOfflineBtn').waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
  if (!await page.locator('#apOfflineBtn').isVisible()) {
    if (await intro.isVisible()) await intro.click({ timeout: 15000 }).catch(() => {});
    await page.locator('#mfPreAlphaIntro').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    if (!await page.locator('#apOfflineBtn').isVisible()) {
      await page.locator('#mfLaunchOffline').click({ timeout: 15000 });
    }
  }
  await page.locator('#apOfflineBtn').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#apOfflineBtn').click();
  await page.waitForURL('**/modules/space_exploration/index.html*', { timeout: 30000 });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__ || window.__MASSFRONT_SPACE_ERROR__, null, { timeout: 60000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__?.ready);
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.scene === 'uga' &&
    document.querySelector('.uga-command-shell'), null, { timeout: 60000 });
  await page.locator('#renderVeil').waitFor({ state: 'hidden', timeout: 60000 });
  report.steps.push('launcher → intro → offline account → UGA command home');

  // Basic Access is not the primary campaign action, but it is the actual
  // discoverable Classic War Table door in the current UGA campaign hub.
  await page.locator('.uga-command-nav [data-nav="classic"]').click();
  await page.locator('.uga-command-shell[data-view="campaign_hub"] .uga-campaign-hub').waitFor({ state: 'visible' });
  await page.locator('[data-host-route="war-room"]').click();
  await page.waitForURL(/galacticRoute=/, { timeout: 30000 });
  await page.locator('#warGrid .warCard[data-mode="standard"]').waitFor({ state: 'visible', timeout: 90000 });
  report.warRoomModes = await page.locator('#warScr .warCard').evaluateAll(cards => cards.map(card => card.dataset.mode));
  assert.deepEqual(report.warRoomModes, ['training', 'standard', 'campaign'],
    'War Room keeps its direct solo modes without duplicate MMO or Co-op roadmap cards');
  await capture('portrait-war-room', '#warScr');
  report.steps.push('UGA → Classic War Table → visible War Room');
  await page.locator('#warScr .warCard[data-mode="standard"]').click();
  await page.waitForFunction(() => typeof mfGalaxyStage !== 'undefined' && typeof activeWarMode !== 'undefined' &&
    mfGalaxyStage === 'galaxy' && activeWarMode === 'standard' &&
    document.getElementById('setupScr')?.classList.contains('galaxyFlow'), null, { timeout: 30000 });

  for (let i = 0; i < stages.length; i++) {
    await measureStage('portrait', stages[i]);
    if (i + 1 < stages.length) await advance(stages[i + 1]);
  }
  await page.setViewportSize({ width: 915, height: 412 });
  // Revisiting the first stage through the visible stepper avoids opening a
  // second game/session while also proving stage reversal is reachable.
  await page.locator('[data-mf-stage="galaxy"]').click();
  await page.waitForFunction(() => typeof mfGalaxyStage !== 'undefined' && mfGalaxyStage === 'galaxy');
  for (let i = 0; i < stages.length; i++) {
    await measureStage('landscape', stages[i]);
    if (i + 1 < stages.length) await advance(stages[i + 1]);
  }
  await page.setViewportSize({ width: 412, height: 900 });
  await page.locator('[data-mf-stage="region"]').click();
  await page.waitForFunction(() => mfGalaxyStage === 'region');
  const alternateSite = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#mapRow .mapCard')]
      .find(node => !node.classList.contains('locked') && !node.classList.contains('sel'));
    return card?.dataset.map || '';
  });
  assert.ok(alternateSite, 'an alternate unlocked battlefield is available for map-selection check');
  await page.locator('#mapRow').evaluate(node => { node.scrollLeft = 0; });
  await page.locator(`#mapRow .mapCard[data-map="${alternateSite}"]`).click();
  const mapChoice = await page.evaluate(() => ({ map: curMap, stage: mfGalaxyStage,
    hazard: getSiteIntel(curMap).hazard.name, heroMap: document.getElementById('mfRegionHero')?.dataset.map,
    hero: document.getElementById('mfRegionHero')?.innerText || '' }));
  report.mapChoice = { expected: alternateSite, ...mapChoice };
  assert.equal(mapChoice.map, alternateSite, 'tapping another site selects that battlefield');
  assert.equal(mapChoice.heroMap, alternateSite, 'region dossier refreshes for the selected battlefield');
  assert.ok(mapChoice.hero.includes(mapChoice.hazard), 'region dossier follows the selected battlefield conditions');
  await page.locator(`#mapRow .mapCard[data-map="${alternateSite}"]`).click();
  await page.waitForFunction(() => mfGalaxyStage === 'deploy', null, { timeout: 15000 });
  report.steps.push('alternate site tap updates conditions; second tap advances to its deployment plan');
  assert.deepEqual(report.pageErrors, [], 'no uncaught page errors on launch and Classic setup route');
  report.sourceAfter = await hashes(root);
  report.packageAfter = await hashes(serveRoot);
  assert.deepEqual(report.sourceAfter, report.sourceBefore, 'source changed during protected capture');
  assert.deepEqual(report.packageAfter, report.packageBefore, 'www changed during protected capture');
  report.pass = true;
} catch (error) {
  fatal = error;
  report.failure = { message: error.message, stack: error.stack };
  if (page) {
    report.failureUrl = page.url();
    report.failureDom = await page.evaluate(() => ({
      warScreenClass: document.getElementById('warScr')?.className,
      warGridCards: [...document.querySelectorAll('#warGrid .warCard')].map(card => ({
        mode: card.dataset.mode, visible: card.getBoundingClientRect().height > 0
      })),
      setupClass: document.getElementById('setupScr')?.className
    })).catch(() => null);
    await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
  }
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await closePwBrowser(browser).catch(() => {});
  if (server) {
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
  if (freeze) {
    try { await freeze.release({ assertStable: true, name: 'packed Classic Standard mobile setup release' }); }
    catch (error) { report.pass = false; report.freezeFailure = error.message; fatal ||= error; }
  }
  report.finishedAt = new Date().toISOString();
  if (freeze) await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ pass: report.pass, output: out, failure: report.failure?.message,
    freezeFailure: report.freezeFailure, captures: Object.keys(report.captures) }, null, 2));
}
if (fatal) process.exitCode = 1;
