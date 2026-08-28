#!/usr/bin/env node
/* Step-by-step diagnosis of the PLAY OFFLINE -> War Room -> DEPLOY route.

   Purpose: decide whether the flow is genuinely BROKEN for players, or whether
   the perf-lab automation is simply stale. It drives the real UI, screenshots
   every stage, and records the sim's own state (running / matchLive / demoMode)
   plus which stage panel and controls are actually on screen at each step.

   Read-only: no engine source is patched and no state is injected. */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, extname, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { installTelemetryInit } from './perf-lab/perf-probe-runner.mjs';
import { ANDROID_S25_USER_AGENT, S25_VIEWPORT, assertMobileGpuBranch } from './mobile-device-profile.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, '.tmp', 'deploy-flow-diagnosis');

async function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      let requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (requestPath === '/') requestPath = '/index.html';
      const file = resolve(ROOT, `.${requestPath}`);
      const rel = relative(ROOT, file);
      if (rel.startsWith(`..${sep}`) || rel === '..' || !existsSync(file)) {
        res.writeHead(404); res.end('Not Found'); return;
      }
      const e = extname(file).toLowerCase();
      const mime = e === '.html' ? 'text/html'
        : e === '.js' || e === '.mjs' ? 'text/javascript'
        : e === '.css' ? 'text/css' : e === '.json' ? 'application/json'
        : e === '.webmanifest' ? 'application/manifest+json'
        : e === '.png' ? 'image/png' : e === '.jpg' || e === '.jpeg' ? 'image/jpeg'
        : e === '.webp' ? 'image/webp' : e === '.ogg' ? 'audio/ogg'
        : e === '.m4a' ? 'audio/mp4'
        : e === '.wasm' ? 'application/wasm' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
      res.end(await readFile(file));
    } catch (error) { res.writeHead(500); res.end(String(error.message)); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(d => server.close(d)) };
}

const steps = [];

async function snapshot(page, label) {
  const file = `${String(steps.length).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
  await page.screenshot({ path: join(OUT, file) }).catch(() => {});
  const state = await page.evaluate(() => {
    const read = expr => { try { return eval(expr); } catch { return '<unreadable>'; } };
    const vis = el => {
      if (!el) return false;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0;
    };
    const controls = [...document.querySelectorAll('button,.warCard,[role="button"]')]
      .filter(vis).slice(0, 12)
      .map(el => `${el.id ? '#' + el.id : '.' + String(el.className || '').split(/\s+/)[0]}"${(el.textContent || '').trim().slice(0, 26)}"`);
    // Which top-level screen/panel is showing?
    const screens = [...document.querySelectorAll('[id]')]
      .filter(el => /screen|Screen|stage|Stage|panel|Panel|overlay/.test(el.id) && vis(el))
      .slice(0, 8).map(el => '#' + el.id);
    return {
      running: read('typeof running !== "undefined" ? running : "<undef>"'),
      matchLive: read('typeof matchLive !== "undefined" ? matchLive : "<undef>"'),
      demoMode: read('typeof demoMode !== "undefined" ? demoMode : "<undef>"'),
      paused: read('typeof paused !== "undefined" ? paused : "<undef>"'),
      liveUnits: read('typeof unitCount !== "undefined" ? unitCount : (typeof simHot !== "undefined" ? simHot.live : "<undef>")'),
      bootCover: !!document.getElementById('mfBootCover'),
      screens, controls
    };
  }).catch(e => ({ evaluateError: e.message }));
  steps.push({ label, file, state });
  console.log(`\n[${steps.length - 1}] ${label}  -> ${file}`);
  console.log(`    running=${state.running} matchLive=${state.matchLive} demoMode=${state.demoMode} units=${state.liveUnits}`);
  if (state.screens?.length) console.log(`    screens: ${state.screens.join(' ')}`);
  if (state.controls?.length) console.log(`    controls: ${state.controls.join(' ')}`);
  return state;
}

async function tap(page, selector, label) {
  const loc = page.locator(selector).first();
  const visible = await loc.isVisible().catch(() => false);
  if (!visible) { console.log(`    (skip ${label}: ${selector} not visible)`); return false; }
  await loc.click({ timeout: 20000 }).catch(err => console.log(`    (click failed ${selector}: ${err.message.split('\n')[0]})`));
  await page.waitForTimeout(700);
  return true;
}

await mkdir(OUT, { recursive: true });
const server = await startStaticServer();
const browser = await launchPwBrowser({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: S25_VIEWPORT.width, height: S25_VIEWPORT.height }, deviceScaleFactor: S25_VIEWPORT.dpr,
    hasTouch: true, isMobile: true, userAgent: ANDROID_S25_USER_AGENT
  });
  const errors = [];
  page.on('pageerror', e => errors.push(`page: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await installTelemetryInit(page);
  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const gpu = await assertHardwareGpu(page);
  console.log(`GPU: ${gpu.renderer}`);
  await page.waitForFunction(() => !document.getElementById('mfBootCover'), null, { timeout: 90000 });
  await page.waitForFunction(() => typeof spawnUnit === 'function' && typeof resetWorld === 'function', null, { timeout: 90000 });
  const mobileProof = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    mobileGpu: typeof MF_MOBILE_GPU === 'boolean' ? MF_MOBILE_GPU : null
  }));
  assertMobileGpuBranch(mobileProof.mobileGpu, mobileProof.userAgent, 'diagnose-deploy-flow');
  await page.waitForTimeout(1200);

  await snapshot(page, 'boot complete');
  await tap(page, '#mfIntroStart', 'intro');
  await snapshot(page, 'after intro');
  await tap(page, '#apOfflineBtn', 'PLAY OFFLINE');
  await snapshot(page, 'after play offline');
  await tap(page, '#startBtn', 'WAR ROOM');
  await snapshot(page, 'after war room');
  await tap(page, '.warCard[data-mode="standard"]', 'standard card');
  await snapshot(page, 'after standard card');

  // Walk the setup stages the way a player would: press whatever commit
  // control the current stage exposes, up to a generous ceiling.
  for (let i = 0; i < 10; i++) {
    const live = await page.evaluate(() => typeof matchLive !== 'undefined' && matchLive === true).catch(() => false);
    if (live) { await snapshot(page, `match live at step ${i}`); break; }
    if (await page.locator('#deployBtn').first().isVisible().catch(() => false)) {
      await tap(page, '#deployBtn', 'DEPLOY');
      await snapshot(page, 'after DEPLOY');
      await page.waitForTimeout(3000);
      await snapshot(page, 'after DEPLOY settle');
      break;
    }
    const moved = await tap(page, '#setupStart', `setup ${i + 1}`)
      || await tap(page, '.warStage:not([hidden]) .mbtn', `stage btn ${i + 1}`)
      || await tap(page, '.warCard', `card ${i + 1}`);
    await snapshot(page, `setup step ${i + 1}`);
    if (!moved) { console.log('    no advance control found — stopping'); break; }
  }

  await page.waitForTimeout(2000);
  await snapshot(page, 'final');

  /* The world loads with the carrier airborne: the HUD says "tap ground to fly
     there, then DEPLOY". matchLive only flips once the base is actually placed,
     which is the step both this diagnostic and perf-lab were missing. */
  if (await page.locator('#deployBtn').first().isVisible().catch(() => false)) {
    const box = await page.locator('#gl').boundingBox().catch(() => null);
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.45);
      await page.waitForTimeout(2500);
      await snapshot(page, 'after ground tap');
    }
    await tap(page, '#deployBtn', 'DEPLOY BASE HERE');
    await page.waitForFunction(
      () => typeof matchLive !== 'undefined' && matchLive === true,
      null, { timeout: 30000 }
    ).then(() => console.log('    matchLive became TRUE')).catch(() => console.log('    matchLive did NOT flip'));
    await page.waitForTimeout(2500);
    await snapshot(page, 'after base deployed');
  }

  await writeFile(join(OUT, 'report.json'),
    JSON.stringify({ gpu: gpu.renderer, errors, steps }, null, 2) + '\n');

  console.log('\n=== RUNTIME ERRORS ===');
  console.log(errors.length ? errors.slice(0, 20).join('\n') : '  none');
  const last = steps[steps.length - 1].state;
  console.log('\n=== VERDICT ===');
  console.log(`  final: running=${last.running} matchLive=${last.matchLive} demoMode=${last.demoMode} units=${last.liveUnits}`);
  console.log(`  screenshots: ${OUT}`);
} finally {
  await Promise.race([closePwBrowser(), new Promise(r => setTimeout(r, 5000))]);
  await server.close();
}
