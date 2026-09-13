#!/usr/bin/env node
/* Visual acceptance for 1.33.50 hotfix items: minimap dock, rank marks,
   map-edge pan, High/Cinematic clouds in live battle (not synthetic probe). */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { ANDROID_S25_USER_AGENT, S25_VIEWPORT, assertMobileGpuBranch } from './mobile-device-profile.mjs';
import { startStaticServer, installTelemetryInit, applyPreset, enterRealBattle } from './perf-lab/perf-probe-runner.mjs';
import { inspectPng } from './evidence-foundation/png-evidence.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'audit', 'hotfix-13350-visual');
const shots = [];

async function stampBuild(page) {
  return page.evaluate(() => {
    let rev = '?';
    try {
      const scripts = [...document.querySelectorAll('script[src*="boot.js"]')];
      rev = scripts[0]?.src?.match(/[?&]v=([^&]+)/)?.[1] || '?';
    } catch (e) {}
    const el = document.getElementById('mfVerifyStamp') || document.createElement('div');
    el.id = 'mfVerifyStamp';
    el.style.cssText = 'position:fixed;top:46px;left:6px;z-index:2147483646;background:rgba(0,8,16,.82);color:#7dffb8;font:10px/1.35 monospace;padding:4px 6px;border:1px solid rgba(125,255,184,.35);border-radius:4px;pointer-events:none';
    const q = typeof qualityKey === 'function' ? qualityKey() : (META?.settings?.quality || '?');
    el.textContent = `APP ${typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?'}  boot ${rev}  gfx ${q}  www`;
    if (!el.parentNode) document.body.appendChild(el);
    return { app: typeof APP_VERSION !== 'undefined' ? APP_VERSION : null, boot: rev, quality: q };
  });
}

async function capture(page, name, opts = {}) {
  if (opts.stamp) await stampBuild(page);
  const path = join(OUT, name + '.png');
  if (opts.selector) await page.locator(opts.selector).screenshot({ path });
  else await page.screenshot({ path, fullPage: false });
  const bytes = await readFile(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const meta = await inspectPng(path);
  shots.push({ name, path, sha256, width: meta.width, height: meta.height, ...opts.meta });
  return path;
}

const server = await startStaticServer();
const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });
const errors = [];
const checks = [];
try {
  const page = await browser.newPage({
    viewport: { width: S25_VIEWPORT.width, height: S25_VIEWPORT.height },
    deviceScaleFactor: S25_VIEWPORT.dpr,
    hasTouch: true,
    isMobile: true,
    userAgent: ANDROID_S25_USER_AGENT,
    serviceWorkers: 'block'
  });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const networkIsolation = await installTelemetryInit(page);
  await page.goto(server.url + '?hotfix13350visual=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const gpu = await assertHardwareGpu(page);
  await page.waitForFunction(() => typeof spawnUnit === 'function', null, { timeout: 90000 });
  const mobile = await page.evaluate(() => ({
    ua: navigator.userAgent,
    mobileGpu: typeof MF_MOBILE_GPU === 'boolean' ? MF_MOBILE_GPU : null
  }));
  assertMobileGpuBranch(mobile.mobileGpu, mobile.ua, 'verify-hotfix-13350-visual');
  await page.waitForFunction(() => !document.getElementById('mfBootCover'), null, { timeout: 90000 });
  const intro = page.locator('#mfIntroStart');
  if (await intro.isVisible().catch(() => false)) await intro.click();
  await page.waitForTimeout(500);
  await stampBuild(page);
  await capture(page, '00-account-or-boot-stamped', { stamp: true, meta: { screen: 'pre-offline' } });

  const offlineBtn = page.locator('#apOfflineBtn');
  if (await offlineBtn.isVisible().catch(() => false)) {
    await offlineBtn.click();
    await page.waitForTimeout(700);
    const onboardingSkip = page.locator('#mfOnboardingSkip');
    if (await onboardingSkip.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
      await onboardingSkip.click();
      await page.waitForTimeout(350);
    }
    await stampBuild(page);
    await capture(page, '00b-main-menu-stamped', { stamp: true, meta: { screen: 'main-menu' } });
  }

  const deployment = await enterRealBattle(page, { fromMainMenu: true });
  await applyPreset(page, 'high');
  await page.evaluate(() => {
    if (typeof fogOn === 'boolean') fogOn = false;
    if (typeof showHudDock === 'function') showHudDock(true, 'orders');
    else document.body.classList.add('hudTacticalDock');
    const sample = typeof MFCloudFx !== 'undefined' ? MFCloudFx.sample({
      time: stats.t, quality: 'high', perfScale: 1, mapSize: MAP, mapId: curMap,
      seed: MAPDEFS[curMap] && MAPDEFS[curMap].seed, daylight: 1,
      focusX: cam.x, focusY: cam.y, viewSpan: 680
    }) : [];
    const body = sample.find(L => L.kind === 'body') || null;
    if (body) { cam.x = body.x; cam.y = body.y; }
    orthoSpan = 680;
    if (typeof distTarget === 'number') distTarget = 680;
    if (typeof clampCam === 'function') clampCam();
    if (typeof MFCloudPost !== 'undefined') MFCloudPost.probe(true);
  });
  await page.waitForTimeout(2200);

  await capture(page, '01-battle-high-minimap-dock', { stamp: true, meta: { preset: 'high', dock: true } });

  const cloudProbe = await page.evaluate(() => {
    const p = typeof MFCloudPost !== 'undefined' ? MFCloudPost.probe() : null;
    const c = typeof MFCloudFx !== 'undefined' ? MFCloudFx.probe() : null;
    return {
      quality: typeof qualityKey === 'function' ? qualityKey() : null,
      post: p,
      fx: c,
      span: typeof orthoSpan === 'number' ? orthoSpan : null,
      tabs: [...document.querySelectorAll('.hudDeckBtn')].map(b => (b.textContent || '').replace(/\s+/g, ' ').trim()),
      dock: document.body.classList.contains('hudTacticalDock')
    };
  });
  checks.push(['high preset active', cloudProbe.quality === 'high']);
  checks.push(['clouds presented at tactical zoom', (cloudProbe.post?.presented || 0) > 0 || (cloudProbe.fx?.emittedLayers || 0) > 0]);
  checks.push(['deck tabs still labelled', (cloudProbe.tabs || []).join(' ').includes('ORDERS') && (cloudProbe.tabs || []).join(' ').includes('PLATOONS')]);

  await page.evaluate(() => {
    orthoSpan = 1200;
    if (typeof distTarget === 'number') distTarget = 1200;
    cam.x = MAP - 80;
    cam.y = MAP - 80;
    if (typeof clampCam === 'function') clampCam();
  });
  await page.waitForTimeout(1200);
  await capture(page, '02-map-edge-southeast-high', { stamp: true, meta: { edge: 'se', span: 1200 } });

  await page.evaluate(() => {
    cam.x = 40;
    cam.y = 40;
    if (typeof clampCam === 'function') clampCam();
    orthoSpan = 900;
    if (typeof distTarget === 'number') distTarget = 900;
  });
  await page.waitForTimeout(1200);
  await capture(page, '03-map-edge-northwest-high', { stamp: true, meta: { edge: 'nw', span: 900 } });

  await applyPreset(page, 'cinematic');
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const sample = typeof MFCloudFx !== 'undefined' ? MFCloudFx.sample({
      time: stats.t, quality: 'cinematic', perfScale: 1, mapSize: MAP, mapId: curMap,
      seed: MAPDEFS[curMap] && MAPDEFS[curMap].seed, daylight: 1,
      focusX: MAP * 0.5, focusY: MAP * 0.5, viewSpan: 1600
    }) : [];
    const body = sample.find(L => L.kind === 'body') || null;
    if (body) { cam.x = body.x; cam.y = body.y; }
    else { cam.x = MAP * 0.5; cam.y = MAP * 0.5; }
    orthoSpan = 1600;
    if (typeof distTarget === 'number') distTarget = 1600;
    if (typeof fogOn === 'boolean') fogOn = false;
    if (typeof clampCam === 'function') clampCam();
  });
  await page.waitForTimeout(1500);
  await capture(page, '04-cinematic-clouds-mid-span', { stamp: true });
  const cinematicProbe = await page.evaluate(() => MFCloudPost ? MFCloudPost.probe() : null);
  checks.push(['cinematic post presented', (cinematicProbe?.presented || 0) > 0]);

  const networkEvidence = await networkIsolation.finalize('hotfix-13350-visual');
  const report = {
    gpu,
    mobile,
    deployment,
    cloudProbe,
    cinematicProbe,
    screenshots: shots,
    checks: checks.map(([label, ok]) => ({ label, ok })),
    errors,
    networkIsolation: networkEvidence
  };
  await writeFile(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  console.log(JSON.stringify({ out: OUT, screenshots: shots.map(s => s.name), errors }, null, 2));
  if (checks.some(([, ok]) => !ok) || errors.length) process.exitCode = 1;
} finally {
  await closePwBrowser(browser).catch(() => {});
  await server.close().catch(() => {});
}
