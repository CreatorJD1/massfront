#!/usr/bin/env node
/* ============================================================================
   DAYTIME FX CAPTURE — gold-standard lighting: charcoal hulls, crystal bloom,
   ground pools, saturated units. Real Chrome D3D11 (ABORT on SwiftShader).
   Usage: node tools/capture-daytime-fx.mjs
   Output: .tmp/daytime-fx-2026-08-14/
     01-deploy-carrier-crystals.png
     02-live-base-units-crystals.png
   ============================================================================ */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'daytime-fx-2026-08-14');
await mkdir(outDir, { recursive: true });

const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.mp3':'audio/mpeg', '.wav':'audio/wav',
  '.glb':'model/gltf-binary', '.gltf':'model/gltf+json', '.webmanifest':'application/manifest+json',
  '.wasm':'application/wasm'
};
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = resolve(join(root, p));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port + '/';
console.log('serving ' + url);

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await launchPwBrowser({
  executablePath: chrome, headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox']
});

const shot = async (page, name) => {
  const p = join(outDir, name);
  await page.screenshot({ path: p, fullPage: false });
  console.log('wrote ' + p);
  return p;
};

const boot = () => {
  try { if (typeof apClose === 'function') apClose(); } catch (e) {}
  try { if (typeof apGateSatisfied === 'function') apGateSatisfied(); } catch (e) {}
  try { if (typeof stopAttract === 'function') stopAttract(); } catch (e) {}
  document.body.classList.add('mfIntroDone');
  for (const id of ['mfBootCover', 'apOverlay', 'loadScr', 'mfIntroSkip', 'mfIntroReplay']) {
    const el = document.getElementById(id);
    if (el) el.style.setProperty('display', 'none', 'important');
  }
  document.querySelectorAll('.mfTitleReveal').forEach(el => el.style.setProperty('display', 'none', 'important'));
};

try {
  const page = await browser.newPage({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark'
  });
  const errs = [];
  page.on('pageerror', e => { errs.push(e.message); console.log('ERR ' + e.message); });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mf_ap_gate_closed', '1');
      localStorage.setItem('mf_ap_dismissed', '1');
      localStorage.setItem('mf_offline', '1');
      localStorage.setItem('mf_prealpha_cinematic_v2', 'test-seen');
      localStorage.setItem('mf_auth_gate_v1', '1');
    } catch (e) {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas'), g = c.getContext('webgl2');
    if (!g) return { renderer: 'NO-WEBGL2' };
    const d = g.getExtension('WEBGL_debug_renderer_info');
    return { renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : String(g.getParameter(g.RENDERER)) };
  });
  console.log('UNMASKED_RENDERER_WEBGL: ' + gpu.renderer);
  if (/swiftshader|software|llvmpipe/i.test(gpu.renderer)) {
    throw new Error('REFUSING: software renderer ' + gpu.renderer);
  }

  await page.waitForFunction(() => typeof newSkirmish === 'function' && typeof PLANETS === 'object', { timeout: 120000 });
  await page.waitForTimeout(300);
  await page.evaluate(boot);

  const start = await page.evaluate(() => {
    infestationOn = false;
    fogOn = false;
    defenseFocus = 0;
    curMap = 'aelos_north_small';
    curTheme = 'verdant';
    curRegionId = 'aelos_north';
    battlefieldPreset = 'compact';
    deploymentPackage = 'prepared';
    if (typeof META !== 'undefined' && META.settings) {
      META.settings.fog = false;
      META.settings.dayNight = false;
      META.settings.quality = 'high';
      META.settings.cine = true;
      META.settings.perf = 'auto';
    }
    if (typeof applySettings === 'function') applySettings();
    dayT = 0.08;
    demoMode = false;
    if (typeof hideFrontScreens === 'function') hideFrontScreens();
    const setup = document.getElementById('setupScr');
    if (setup) setup.style.display = 'none';
    document.body.classList.remove('menuMode', 'mfMenuOpen');
    document.body.dataset.frontScreen = '';
    newSkirmish();
    return { map: curMap, quality: META.settings.quality, cine: META.settings.cine };
  });
  console.log('start ' + JSON.stringify(start));

  await page.waitForFunction(() => typeof heightF !== 'undefined' && heightF && typeof terrainTex !== 'undefined' && terrainTex, { timeout: 90000 });
  await page.waitForFunction(() => typeof carrier !== 'undefined' && carrier && carrier.active && carrier.phase === 1, { timeout: 30000 });

  const deployInfo = await page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch (e) {}
    for (const id of ['pauseOverlay', 'gameOver', 'levelUp', 'loadScr', 'dispatch', 'apOverlay', 'setupScr']) {
      const e = document.getElementById(id); if (e) e.style.setProperty('display', 'none', 'important');
    }
    demoMode = false; running = true; paused = false; fogOn = false; gameEnded = false; matchLive = false;
    dayT = 0.08; perfScale = 1;
    if (typeof GFX !== 'undefined') { GFX.ao = true; GFX.bloom = true; GFX.fxFloor = 0.55; }
    let cx = carrier.x, cy = carrier.y;
    let best = null, bestD = 1e12;
    if (typeof crystals !== 'undefined') {
      for (const cs of crystals) {
        const d = (cs.x - cx) * (cs.x - cx) + (cs.y - cy) * (cs.y - cy);
        if (d < bestD) { bestD = d; best = cs; }
      }
    }
    if (best) { cam.x = (cx + best.x) * 0.5; cam.y = (cy + best.y) * 0.5; }
    else { cam.x = cx; cam.y = cy; }
    camFollow = -1;
    camYaw = yawTarget = 0.18;
    camPitch = pitchTarget = 1.08;
    orthoSpan = distTarget = 620;
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    return { carrier: [cx, cy], crystal: best ? [best.x, best.y] : null, glowQFloor: 0.65 };
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => { if (typeof render === 'function') render(0.016); });
  await shot(page, '01-deploy-carrier-crystals.png');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    if (typeof carrierTick === 'function') carrierTick(0.2);
    if (typeof render === 'function') render(0.016);
  });
  await shot(page, '01b-deploy-200ms-later.png');

  const liveInfo = await page.evaluate(() => {
    if (typeof carrier !== 'undefined' && carrier) {
      carrier.active = true; carrier.phase = 1; carrier.alt = 0; carrier.clearance = 0;
    }
    try { if (typeof deployCarrier === 'function') deployCarrier(); } catch (e) {}
    matchLive = true; running = true; paused = false; dayT = 0.08; perfScale = 1;
    if (typeof refreshBldLive === 'function') refreshBldLive();
    const hq = (typeof blds !== 'undefined' && blds)
      ? blds.find(B => B && B.alive && B.type === 'hq' && B.team === 0)
      : null;
    const hx = hq ? hq.x : carrier.x, hy = hq ? hq.y : carrier.y;
    if (typeof addBld === 'function') {
      try { addBld('fac', 0, hx + 90, hy + 10, true, 0); } catch (e) {}
      try { addBld('pgen', 0, hx - 70, hy + 55, true, 0); } catch (e) {}
    }
    if (typeof spawnUnit === 'function') {
      spawnUnit(0, 0, hx + 36, hy + 28);
      spawnUnit(1, 0, hx + 58, hy - 18);
    }
    let best = null, bestD = 1e12;
    if (typeof crystals !== 'undefined') {
      for (const cs of crystals) {
        const d = (cs.x - hx) * (cs.x - hx) + (cs.y - hy) * (cs.y - hy);
        if (d < bestD) { bestD = d; best = cs; }
      }
    }
    /* Match live HQ shot 044628: command camera on the HQ, crystal in frame. */
    cam.x = hx; cam.y = hy;
    camFollow = -1;
    camYaw = yawTarget = 0.12;
    camPitch = pitchTarget = 1.18;
    orthoSpan = distTarget = 560;
    if (typeof showHudDock === 'function') showHudDock(true, 'orders');
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    if (typeof updateHUD === 'function') updateHUD(60);
    return {
      hq: hq ? [hq.x, hq.y] : null,
      crystal: best ? [best.x, best.y] : null,
      units: teamCount[0],
      blds: blds.filter(B => B && B.alive && B.team === 0).map(B => B.type)
    };
  });
  await page.waitForTimeout(1100);
  await page.evaluate(() => { if (typeof updateHUD === 'function') updateHUD(60); if (typeof render === 'function') render(0.016); });
  await shot(page, '02-live-base-units-crystals.png');
  await page.waitForTimeout(200);
  await page.evaluate(() => { if (typeof render === 'function') render(0.016); });
  await shot(page, '02b-live-200ms-later.png');

  const nightInfo = await page.evaluate(() => {
    if (typeof META !== 'undefined' && META.settings) META.settings.dayNight = true;
    if (typeof applySettings === 'function') applySettings();
    dayT = 0.42;
    running = true; paused = false;
    if (typeof updateHUD === 'function') updateHUD(60);
    if (typeof render === 'function') render(0.016);
    const nA = typeof nightAmt === 'function' ? nightAmt() : null;
    return { dayT, nA, dayCycle: typeof dayCycleOn === 'function' && dayCycleOn() };
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { if (typeof render === 'function') render(0.016); });
  await shot(page, '03-live-night-hulls.png');

  const report = { gpu: gpu.renderer, errs: errs.slice(0, 12), outDir, deployInfo, liveInfo, nightInfo };
  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await closePwBrowser();
  server.close();
}
