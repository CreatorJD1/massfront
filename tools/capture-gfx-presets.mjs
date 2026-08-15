#!/usr/bin/env node
/* LOW / MEDIUM / HIGH on live 8901. Reuse one tab. ONE hard refresh. */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const url = 'http://127.0.0.1:8901/';
const out = join(root, '.tmp', 'gfx-presets-2026-08-14');
await mkdir(out, { recursive: true });

function is8901(p) {
  try { return (p.url() || '').startsWith(url); } catch { return false; }
}

const browser = await launchPwBrowser();
let opened = false;
let page = null;
try {
  const pages = browser.contexts().flatMap(c => c.pages());
  const tabs8901 = pages.filter(is8901);
  const matchish = [];
  for (const p of tabs8901) {
    try {
      const live = await p.evaluate(() => !!(typeof matchLive !== 'undefined' && matchLive && typeof running !== 'undefined' && running));
      if (live) matchish.push(p);
    } catch {}
  }
  if (matchish.length) {
    page = await browser.newPage({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark'
    });
    opened = true;
  } else if (tabs8901.length) {
    page = tabs8901[0];
    await page.setViewportSize({ width: 412, height: 915 }).catch(() => {});
  } else {
    page = await browser.newPage({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark'
    });
    opened = true;
  }

  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.log('ERR ' + e.message); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  let already = false;
  try {
    already = await page.evaluate(() => typeof applyQualityPreset === 'function' && typeof mfHazeQ === 'function');
  } catch {}
  if (!already) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } else {
    console.log('REUSE loaded 8901 tab — no second refresh');
  }
  await assertHardwareGpu(page);
  await page.waitForFunction(() => typeof newSkirmish === 'function' && typeof applyQualityPreset === 'function' && typeof GFX !== 'undefined', null, { timeout: 60000 });
  await page.waitForFunction(() => typeof gl !== 'undefined' && gl && heightF && terrainTex, null, { timeout: 60000 });
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    if (typeof apGateSatisfied === 'function') apGateSatisfied();
    const ap = document.getElementById('apOverlay'); if (ap) ap.style.display = 'none';
    META.settings.quality = 'high';
    META.settings.gfxOver = {};
    applyQualityPreset();
    activeWarMode = 'standard';
    curMap = 'vespera_refinery_large';
    curTheme = 'vespera';
    builtMap = '';
    hideFrontScreens();
    newSkirmish();
  });
  await page.waitForFunction(() => carrier && carrier.active && heightF && PASS, null, { timeout: 90000 });
  await page.waitForFunction(() => MFWorldStructuresV2.status().ready, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => {
    stopAttract(); hideFrontScreens();
    for (const id of ['pauseOverlay', 'gameOver', 'levelUp', 'loadScr', 'dispatch']) {
      const e = document.getElementById(id); if (e) e.style.display = 'none';
    }
    document.body.dataset.frontScreen = '';
    document.body.classList.remove('menuMode', 'mfMenuOpen');
    demoMode = false; running = true; matchLive = true; paused = true; fogOn = false;
    carrier.active = false; carrier.phase = 2;
    const Z = cityZones.find(z => z.ind) || cityZones[0];
    cam.x = Z.x; cam.y = Z.y; camFollow = -1;
    camYaw = yawTarget = 0.69; camPitch = pitchTarget = 1.13; orthoSpan = distTarget = 700;
    clampCam(); camUpdateMatrices();
    if (typeof showHudDock === 'function') showHudDock(true, 'view');
    if (typeof setHudDeck === 'function') setHudDeck('view');
  });
  await page.waitForTimeout(1200);

  const snap = () => page.evaluate(() => {
    const cv = document.getElementById('gl');
    const g = typeof gl !== 'undefined' ? gl : null;
    let err = null;
    try { err = g ? g.getError() : null; } catch (e) { err = String(e); }
    return {
      quality: qualityKey(),
      gfx: Object.assign({}, GFX),
      dpr: typeof DPR !== 'undefined' ? DPR : null,
      cv: [cv.width, cv.height],
      aoW: typeof aoW !== 'undefined' ? aoW : null,
      aoH: typeof aoH !== 'undefined' ? aoH : null,
      aoDoSSAO: typeof aoDoSSAO !== 'undefined' ? aoDoSSAO : null,
      aoReady: typeof aoReady !== 'undefined' ? aoReady : null,
      worldV2: typeof mfWorldV2Enabled === 'function' ? mfWorldV2Enabled() : null,
      haze: typeof mfHazeQ === 'function' ? mfHazeQ() : null,
      fCount: typeof fCount !== 'undefined' ? fCount : null,
      glError: err,
      gpu: typeof mfGraphicsDiag === 'function' ? mfGraphicsDiag() : null
    };
  });

  for (const q of ['high', 'medium', 'low']) {
    await page.evaluate((qq) => {
      META.settings.quality = qq;
      META.settings.gfxOver = {};
      applyQualityPreset();
      applySettings();
    }, q);
    await page.waitForTimeout(700);
    const s = await snap();
    console.log(q.toUpperCase(), JSON.stringify(s));
    await page.screenshot({ path: join(out, q + '.png'), fullPage: false });
  }

  await page.evaluate(() => {
    META.settings.quality = 'high';
    META.settings.gfxOver = {};
    applyQualityPreset();
  });

  if (errors.length) console.log('ERRORS', errors.join('\n'));
  console.log('TABS8901', tabs8901.length, 'OPENED', opened, 'MATCH', matchish.length);
  console.log('OUT', out);
  if (opened && matchish.length) {
    await page.close().catch(() => {});
    console.log('CLOSED capture tab; left user match tab');
  }
} finally {
  await closePwBrowser();
}
