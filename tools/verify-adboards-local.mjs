#!/usr/bin/env node
/* Bounded packed-runtime visual check for fictional local in-world boards.
   This is not a provider, billable-impression, or revenue acceptance test. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { sha256File } from './evidence-foundation/fingerprints.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = resolve(root, 'tmp/adboards-fog-visible-20260923');
const url = process.argv[2] || 'http://127.0.0.1:8902/';
const report = { schema: 'massfront.adboards-local/v2', url, viewport: { width: 412, height: 900 },
  at: new Date().toISOString(), status: 'RUNNING', errors: [], blockedRequests: [] };
await mkdir(outDir, { recursive: true });
const source = join(root, 'src/adboards.js'), packed = join(root, 'www/src/adboards.js');
report.sourceHash = await sha256File(source);
report.packedHash = await sha256File(packed);
if (report.sourceHash !== report.packedHash) throw new Error('AD_SOURCE_PACK_MISMATCH');

let guard, browser, page;
try {
  guard = await acquireVerificationFreeze({ root, label: 'packed local adboard visual check',
    quietMs: 5000, allowedPaths: [outDir] });
  browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });
  page = await browser.newPage({ viewport: report.viewport, hasTouch: true, deviceScaleFactor: 1 });
  page.on('pageerror', e => report.errors.push(e.message));
  await page.route('**/*', route => {
    const u = new URL(route.request().url());
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.hostname === '127.0.0.1' && u.port === '8902')
      return route.continue();
    report.blockedRequests.push(u.href);
    return route.abort();
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  report.gpu = await assertHardwareGpu(page);
  // The updater retries remote endpoints before offering PLAY OFFLINE. A fixed
  // boot delay can miss that button while it is hidden, then strand the run on
  // the Launcher. Wait for the actual enabled player choice.
  report.phase = 'launcher-offline-choice';
  await page.locator('#mfLaunchOffline').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('#mfLaunchOffline').click({ timeout: 20000 });
  report.launchChoice = 'visible-play-offline';
  report.phase = 'intro';
  await page.locator('#mfIntroStart').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#mfIntroStart').click({ timeout: 20000 });
  report.phase = 'account-offline-choice';
  await page.waitForFunction(() =>
    !!document.querySelector('#apOfflineBtn')?.getClientRects().length ||
    location.pathname.includes('/modules/space_exploration/index.html'), null, { timeout: 30000 });
  if (await page.locator('#apOfflineBtn').isVisible())
    await page.locator('#apOfflineBtn').click({ timeout: 20000 });
  report.phase = 'uga';
  await page.waitForURL(/\/modules\/space_exploration\/index\.html/, { timeout: 60000 });
  report.ugaUrl = page.url();
  // Classic War Table lives under the PLAY dock's Basic Access panel.
  report.phase = 'uga-classic';
  await page.locator('[data-nav="classic"]').click({ timeout: 30000 });
  await page.locator('.uga-basic-access [data-host-route="war-room"]').waitFor({ state: 'visible', timeout: 30000 });
  await Promise.all([
    page.waitForURL(current => current.pathname.endsWith('/index.html') &&
      !current.pathname.includes('/modules/space_exploration/'), { timeout: 60000 }),
    page.locator('.uga-basic-access [data-host-route="war-room"]').click({ timeout: 30000 })
  ]);
  report.warRoomUrl = page.url();
  report.phase = 'war-room';
  await page.locator('#warScr').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.warCard[data-mode="standard"]').click({ timeout: 20000 });
  await page.waitForTimeout(500);
  for (let i = 0; i < 4; i++) {
    await page.locator('#setupStart').click({ timeout: 20000 });
    await page.waitForTimeout(500);
  }
  await page.locator('#setupStart').click({ timeout: 20000 });
  await page.waitForTimeout(16000);
  await page.locator('#deployBtn').click({ timeout: 20000 });
  report.phase = 'battle';
  await page.waitForFunction(() => typeof running !== 'undefined' && running &&
    typeof adBoards !== 'undefined' && adBoards.length > 0, null, { timeout: 30000 });
  await page.waitForFunction(() => adBoards.some(b => b.creative && !b._contextual &&
    !fogFxFootprintVisible(b.x, b.y, AD_HALFW * b.scale) &&
    AD_CREATIVES[b.creative] && AD_CREATIVES[b.creative].posterLoaded), null, { timeout: 30000 });

  report.board = await page.evaluate(() => {
    const b = adBoards.find(b => b.creative && !b._contextual &&
      !fogFxFootprintVisible(b.x, b.y, AD_HALFW * b.scale) &&
      AD_CREATIVES[b.creative] && AD_CREATIVES[b.creative].posterLoaded);
    camFollow = -1; cam.x = b.x; cam.y = b.y;
    orthoSpan = distTarget = 200; camPitch = pitchTarget = 1.12;
    camYaw = yawTarget = b.yaw + Math.PI; clampCam(); camUpdateMatrices();
    return { id: b.id, creative: b.creative, x: b.x, y: b.y };
  });
  const snapshot = () => page.evaluate(id => {
    const b = adBoards.find(row => row.id === id);
    return { running, paused, gameEnded, ads: META.settings.ads !== false,
      boardOnscreen: b._onscreen, shownCreative: b._shownCreative,
      fogVisible: fogFxFootprintVisible(b.x, b.y, AD_HALFW * b.scale),
      fogCoverage: covAt(b.x, b.y), terrainProgramOk: terrainProgOK,
      dwell: b._dwell, counted: b._counted, total: AD_STATS.total,
      frameDrawn: _adDrawnFrame, frameId: _adFrameId,
      glProgramRestored: gl.getParameter(gl.CURRENT_PROGRAM) === prog3D };
  }, report.board.id);
  report.phase = 'unscouted-board';
  await page.waitForTimeout(1600);
  report.hidden = await snapshot();
  await page.screenshot({ path: join(outDir, 'ad-hidden-fog.png') });
  // A local verification fixture uses the existing in-game scan mechanic to
  // reveal this remote board. It is not a normal player command or ad delivery.
  report.fixture = { type: 'local-gameplay-fog-scan', radius: 200, seconds: 40 };
  await page.evaluate(id => {
    const b = adBoards.find(row => row.id === id);
    fogStartScan(b.x, b.y, 40, 200);
  }, report.board.id);
  report.phase = 'scouted-board';
  await page.waitForFunction(id => adBoards.find(b => b.id === id)?._counted,
    report.board.id, { timeout: 12000 });
  report.on = await snapshot();
  await page.screenshot({ path: join(outDir, 'ad-on.png') });

  const setting = async () => {
    await page.locator('#menuBtn').click({ timeout: 20000 });
    await page.locator('#pauseSettings').click({ timeout: 20000 });
    await page.locator('#setTab-display').click({ timeout: 20000 });
    await page.locator('.adsRow').click({ timeout: 20000 });
    await page.locator('#setBack').click({ timeout: 20000 });
    await page.locator('#resumeBtn').click({ timeout: 20000 });
  };
  await setting();
  report.offStart = await snapshot();
  await page.waitForTimeout(1800);
  report.off = await snapshot();
  await page.screenshot({ path: join(outDir, 'ad-off.png') });
  await setting();
  await page.waitForTimeout(2800);
  report.reenabled = await snapshot();
  await page.screenshot({ path: join(outDir, 'ad-reenabled.png') });
  report.status = !report.hidden.fogVisible && !report.hidden.boardOnscreen &&
    !report.hidden.shownCreative && !report.hidden.counted &&
    report.on.fogVisible && report.on.ads && report.on.boardOnscreen && report.on.shownCreative &&
    report.on.counted && report.off.ads === false && !report.off.shownCreative &&
    report.off.total === report.offStart.total && report.reenabled.ads &&
    report.reenabled.shownCreative && !report.errors.length ? 'PASS' : 'FAIL';
} catch (e) {
  report.status = 'FAIL'; report.failure = String(e && e.stack || e);
  if (page) report.currentUrl = page.url();
  if (page) try { await page.screenshot({ path: join(outDir, 'failure.png') }); } catch {}
} finally {
  if (browser) try { await closePwBrowser(browser); } catch (e) { report.errors.push('browser close: ' + e); }
  if (guard) try { await guard.release({ assertStable: true, name: 'adboard local final release' }); }
    catch (e) { report.status = 'FAIL'; report.errors.push('freeze: ' + e); }
  report.sourceHashAfter = await sha256File(source);
  report.packedHashAfter = await sha256File(packed);
  if (report.sourceHashAfter !== report.sourceHash || report.packedHashAfter !== report.packedHash)
    report.status = 'FAIL';
  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, outDir, failure: report.failure,
    board: report.board, on: report.on, off: report.off, reenabled: report.reenabled,
    errors: report.errors, blockedRequests: report.blockedRequests.length }, null, 2));
}
if (report.status !== 'PASS') process.exitCode = 1;
