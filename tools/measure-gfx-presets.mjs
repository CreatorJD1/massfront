#!/usr/bin/env node
/* Measure HIGH / MEDIUM / LOW frame times on the live 8901 tab.
   Reuse one tab. No extra tabs. Optional --refresh once after pack. */
import { launchPwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const url = 'http://127.0.0.1:8901/';
const label = process.argv.includes('--after') ? 'after' : 'before';
const doRefresh = process.argv.includes('--refresh');
const doWater = process.argv.includes('--water');
const waterOnly = process.argv.includes('--water-only');
const out = join(root, '.tmp', 'gfx-presets-2026-08-14');
await mkdir(out, { recursive: true });

function is8901(p) {
  try { return (p.url() || '').startsWith(url); } catch { return false; }
}

async function sampleFrames(page, n = 90) {
  return page.evaluate(async (count) => {
    await new Promise(r => requestAnimationFrame(r));
    for (let i = 0; i < 25; i++) await new Promise(r => requestAnimationFrame(r));
    const samples = [];
    let prev = performance.now();
    for (let i = 0; i < count; i++) {
      await new Promise(r => requestAnimationFrame(r));
      const now = performance.now();
      samples.push(now - prev);
      prev = now;
    }
    samples.sort((a, b) => a - b);
    const at = p => samples[Math.min(samples.length - 1, Math.floor(p * (samples.length - 1)))];
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const cv = document.getElementById('gl');
    const g = typeof gl !== 'undefined' ? gl : null;
    let glErr = null;
    if (g) { while (g.getError()); glErr = g.getError(); }
    return {
      n: samples.length,
      p50: +at(0.5).toFixed(2),
      p95: +at(0.95).toFixed(2),
      mean: +mean.toFixed(2),
      min: +samples[0].toFixed(2),
      max: +samples[samples.length - 1].toFixed(2),
      quality: typeof qualityKey === 'function' ? qualityKey() : null,
      gfx: typeof GFX !== 'undefined' ? Object.assign({}, GFX) : null,
      dpr: typeof DPR !== 'undefined' ? DPR : null,
      cv: cv ? [cv.width, cv.height] : null,
      worldV2: typeof MFWorldStructuresV2 !== 'undefined' ? MFWorldStructuresV2.status() : null,
      aoReady: typeof aoReady !== 'undefined' ? aoReady : null,
      aoDoSSAO: typeof aoDoSSAO !== 'undefined' ? aoDoSSAO : null,
      aoSize: typeof aoW !== 'undefined' ? [aoW, aoH, glowW, glowH] : null,
      water: {
        idx: typeof waterIdxCount !== 'undefined' ? waterIdxCount : null,
        prog: !!(typeof waterProg !== 'undefined' && waterProg),
        mode: typeof battlefieldWaterMode === 'function' ? battlefieldWaterMode() : null,
        err: typeof GL_PROG_ERRORS !== 'undefined' ? GL_PROG_ERRORS.filter(e => /water/i.test(e)) : []
      },
      glError: glErr,
      map: typeof curMap !== 'undefined' ? curMap : null
    };
  }, n);
}

async function aimWater(page) {
  return page.evaluate(() => {
    const hits = [];
    const pad = MAP * 0.18;
    const step = 70;
    for (let x = pad; x < MAP - pad && hits.length < 80; x += step) {
      for (let y = pad; y < MAP - pad && hits.length < 80; y += step) {
        const wet = typeof authoredWaterAt === 'function' && authoredWaterAt(x, y);
        if (!wet) continue;
        const hydro = typeof waterHydroAt === 'function' ? waterHydroAt(x, y) : -1;
        const h = typeof terrainH === 'function' ? terrainH(x, y) : 0;
        if (h > -1.5) continue;
        hits.push({ x, y, hydro, h });
      }
    }
    const cx = MAP * 0.5, cy = MAP * 0.5;
    const best = want => {
      let b = null, s = 1e18;
      for (const h of hits) {
        if (want >= 0 && h.hydro !== want) continue;
        const d = (h.x - cx) * (h.x - cx) + (h.y - cy) * (h.y - cy) - h.h * 400;
        if (d < s) { s = d; b = h; }
      }
      return b;
    };
    const p = best(0) || best(1) || best(2) || best(-1) || { x: cx, y: cy, hydro: -1, h: 0 };
    cam.x = p.x; cam.y = p.y; camFollow = -1;
    camYaw = yawTarget = 0.42; camPitch = pitchTarget = 0.92; orthoSpan = distTarget = 520;
    clampCam(); camUpdateMatrices();
    return { hits: hits.length, ocean: hits.filter(h => h.hydro === 0).length,
      river: hits.filter(h => h.hydro === 1).length, lake: hits.filter(h => h.hydro === 2).length, at: p };
  });
}

const browser = await launchPwBrowser();
let opened = false;
let page = null;
try {
  const pages = browser.contexts().flatMap(c => c.pages());
  const tabs8901 = pages.filter(is8901);
  if (tabs8901.length) {
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

  if (doRefresh || opened || !(page.url() || '').startsWith(url) || page.isClosed()) {
    if (page.isClosed()) {
      page = await browser.newPage({
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark'
      });
      opened = true;
    }
    const cdp0 = await page.context().newCDPSession(page);
    await cdp0.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  if (page.isClosed()) throw new Error('8901 tab closed during goto');
  const cdp = await page.context().newCDPSession(page);
  await assertHardwareGpu(page);
  console.log('GPU ok', page.url());
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 412, height: 915, deviceScaleFactor: 2, mobile: true, screenWidth: 412, screenHeight: 915
  }).catch(() => {});
  await page.waitForFunction(() => typeof newSkirmish === 'function' && typeof applyQualityPreset === 'function', null, { timeout: 60000 });
  console.log('boot fns ready');

  await page.evaluate(() => {
    if (typeof apGateSatisfied === 'function') apGateSatisfied();
    const ap = document.getElementById('apOverlay'); if (ap) ap.style.display = 'none';
    META.settings.quality = 'high';
    applyQualityPreset();
    activeWarMode = 'standard';
    curMap = 'aelos_coast_medium';
    curTheme = 'verdant';
    builtMap = '';
    hideFrontScreens();
    newSkirmish();
  });
  await page.waitForFunction(() => carrier && carrier.active && heightF && PASS, null, { timeout: 90000 });
  await page.evaluate(() => {
    stopAttract(); hideFrontScreens();
    for (const id of ['pauseOverlay', 'gameOver', 'levelUp', 'loadScr', 'dispatch']) {
      const e = document.getElementById(id); if (e) e.style.display = 'none';
    }
    document.body.dataset.frontScreen = '';
    document.body.classList.remove('menuMode', 'mfMenuOpen');
    demoMode = false; running = true; matchLive = true; paused = true; fogOn = false;
    carrier.active = false; carrier.phase = 2;
    camFollow = -1;
    camYaw = yawTarget = 0.55; camPitch = pitchTarget = 1.08; orthoSpan = distTarget = 900;
    clampCam(); camUpdateMatrices();
    if (typeof showHudDock === 'function') showHudDock(true, 'view');
  });
  await aimWater(page);
  await page.waitForTimeout(800);

  const report = { label, gpu: null, presets: {} };
  report.gpu = await page.evaluate(() => (typeof mfGraphicsDiag === 'function') ? mfGraphicsDiag() : null);

  if (!waterOnly) {
  for (const q of ['high', 'medium', 'low']) {
    await page.evaluate(key => {
      META.settings.quality = key;
      applyQualityPreset();
      if (typeof applySettings === 'function') applySettings();
    }, q);
    await page.waitForTimeout(700);
    report.presets[q] = await sampleFrames(page, 90);
    console.log(label.toUpperCase(), q.toUpperCase(), JSON.stringify(report.presets[q]));
    await page.screenshot({ path: join(out, `${label}-${q}.png`), fullPage: false });
  }
  }

  if (doWater || waterOnly) {
    const maps = [
      { id: 'aelos_coast_medium', theme: 'verdant', name: 'ocean' },
      { id: 'aelos_north_medium', theme: 'verdant', name: 'river' },
      { id: 'nordhall_isles_medium', theme: 'arctic', name: 'lake' }
    ];
    await page.evaluate(() => { META.settings.quality = 'high'; applyQualityPreset(); });
    for (const M of maps) {
      await page.evaluate(m => {
        curMap = m.id; curTheme = m.theme; builtMap = '';
        hideFrontScreens(); newSkirmish();
      }, M);
      await page.waitForFunction(() => carrier && carrier.active && heightF && PASS, null, { timeout: 90000 });
      await page.evaluate(() => {
        stopAttract(); hideFrontScreens();
        demoMode = false; running = true; matchLive = true; paused = true; fogOn = false;
        carrier.active = false; carrier.phase = 2;
      });
      const aim = await aimWater(page);
      await page.waitForTimeout(900);
      const snap = await sampleFrames(page, 30);
      await page.screenshot({ path: join(out, `water-${M.name}.png`), fullPage: false });
      report['water_' + M.name] = { map: M.id, aim, snap };
      console.log('WATER', M.name, JSON.stringify({ aim, water: snap.water, p50: snap.p50 }));
    }
  }

  await writeFile(join(out, `${label}.json`), JSON.stringify(report, null, 2));
  console.log('OUT', out);
  if (errors.length) console.log('ERRORS', errors.join('\n'));
  console.log('OPENED', opened);
} catch (e) {
  console.error('FAIL', e && e.stack || e);
  process.exitCode = 1;
} finally {
  process.exit(process.exitCode || 0);
}
