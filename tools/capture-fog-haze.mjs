#!/usr/bin/env node
/* ============================================================================
   FOG / FOW / HAZE CAPTURE — distance fog, sensor shroud, atmospheric skirt.
   Real Chrome D3D11 (ABORT on SwiftShader). LOOK at the PNGs.
   Usage: node tools/capture-fog-haze.mjs
   Output: .tmp/fog-haze-2026-08-14/
   ============================================================================ */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'fog-haze-2026-08-14');
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

const hudOff = () => {
  try { if (typeof apClose === 'function') apClose(); } catch (e) {}
  for (const id of ['pauseOverlay', 'gameOver', 'levelUp', 'loadScr', 'dispatch', 'apOverlay', 'setupScr', 'toast', 'coach']) {
    const e = document.getElementById(id); if (e) { e.style.setProperty('display', 'none', 'important'); e.textContent = e.id==='toast'||e.id==='coach' ? '' : e.textContent; }
  }
  try { if (typeof clearFirstContactGuide === 'function') clearFirstContactGuide(); } catch (e) {}
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
    fogOn = true;
    defenseFocus = 0;
    curMap = 'aelos_north_small';
    curTheme = 'verdant';
    curRegionId = 'aelos_north';
    battlefieldPreset = 'compact';
    deploymentPackage = 'prepared';
    if (typeof META !== 'undefined' && META.settings) {
      META.settings.fog = true;
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
    return { map: curMap, fog: fogOn };
  });
  console.log('start ' + JSON.stringify(start));

  await page.waitForFunction(() => typeof heightF !== 'undefined' && heightF && typeof terrainTex !== 'undefined' && terrainTex, { timeout: 90000 });
  await page.waitForFunction(() => typeof carrier !== 'undefined' && carrier && carrier.active && carrier.phase === 1, { timeout: 30000 });

  const live = await page.evaluate(() => {
    if (typeof carrier !== 'undefined' && carrier) {
      carrier.active = true; carrier.phase = 1; carrier.alt = 0; carrier.clearance = 0;
    }
    try { if (typeof deployCarrier === 'function') deployCarrier(); } catch (e) {}
    matchLive = true; running = true; paused = true; dayT = 0.08; perfScale = 1;
    fogOn = true; demoMode = false;
    if (typeof META !== 'undefined' && META.settings) META.settings.fog = true;
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
    /* Stamp explored memory in a wide ring so the shroud (explored-but-dark)
       is visible beyond the live sensor bubble — otherwise a fresh deploy
       is only bright vision vs pitch-black unexplored. */
    if (typeof fogSeen !== 'undefined' && typeof FN !== 'undefined') {
      for (let i = 0; i < FN * FN; i++) {
        const x = (i % FN + 0.5) * MAP / FN, y = ((i / FN | 0) + 0.5) * MAP / FN;
        if (Math.hypot(x - hx, y - hy) < 980) fogSeen[i] = 1;
      }
    }
    if (typeof updateFog === 'function') updateFog();
    cam.x = hx; cam.y = hy;
    camFollow = -1;
    camYaw = yawTarget = 0.18;
    camPitch = pitchTarget = 1.14;
    orthoSpan = distTarget = 560;
    if (typeof showHudDock === 'function') showHudDock(true, 'orders');
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    if (typeof updateHUD === 'function') updateHUD(60);
    const cities = (typeof cityZones !== 'undefined' && cityZones) ? cityZones : [];
    return {
      hq: hq ? [hq.x, hq.y] : [hx, hy],
      cities: cities.map(Z => ({ x: Z.x, y: Z.y, w: Z.w, h: Z.h })),
      fogOn, matchLive, nA: typeof nightAmt === 'function' ? nightAmt() : null,
      fogC: typeof sunFor === 'function' ? sunFor(typeof nightAmt === 'function' ? nightAmt() : 0).fog : null
    };
  });
  await page.evaluate(hudOff);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    paused = true; running = true; fogOn = true;
    if (typeof updateFog === 'function') updateFog();
    if (typeof updateHUD === 'function') updateHUD(60);
    if (typeof render === 'function') render(0.016);
  });
  await shot(page, '01-hq-tactical-fow.png');

  await page.evaluate(() => {
    orthoSpan = distTarget = 1680;
    camPitch = pitchTarget = 1.12;
    camYaw = yawTarget = 0.22;
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    if (typeof updateFog === 'function') updateFog();
    if (typeof render === 'function') render(0.016);
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => { if (typeof render === 'function') render(0.016); });
  await shot(page, '02-operational-haze.png');

  await page.evaluate(() => {
    orthoSpan = distTarget = 2800;
    camPitch = pitchTarget = 1.08;
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    if (typeof render === 'function') render(0.016);
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => { if (typeof render === 'function') render(0.016); });
  await shot(page, '03-strategic-atmosphere.png');

  const city = await page.evaluate(({ hx, hy }) => {
    const cities = (typeof cityZones !== 'undefined' && cityZones) ? cityZones : [];
    let best = null, bestD = 1e12;
    for (const Z of cities) {
      const d = (Z.x - hx) * (Z.x - hx) + (Z.y - hy) * (Z.y - hy);
      if (d < bestD && d > 80 * 80) { bestD = d; best = Z; }
    }
    if (!best && typeof relics !== 'undefined') {
      for (const R of relics) {
        if (!R || !R.alive) continue;
        const d = (R.x - hx) * (R.x - hx) + (R.y - hy) * (R.y - hy);
        if (d < bestD && d > 80 * 80) { bestD = d; best = R; }
      }
    }
    if (best) { cam.x = best.x; cam.y = best.y; }
    camFollow = -1;
    camYaw = yawTarget = 0.16;
    camPitch = pitchTarget = 1.14;
    orthoSpan = distTarget = 720;
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    if (typeof updateFog === 'function') updateFog();
    if (typeof render === 'function') render(0.016);
    return {
      city: best ? { x: best.x, y: best.y } : null,
      vis: best && typeof covAt === 'function' ? covAt(best.x, best.y) : null,
      seen: best && typeof fogExploredAt === 'function' ? fogExploredAt(best.x, best.y) : null,
      d: Math.sqrt(bestD)
    };
  }, { hx: live.hq[0], hy: live.hq[1] });
  await page.waitForTimeout(200);
  await page.evaluate(() => { if (typeof render === 'function') render(0.016); });
  await shot(page, '04-city-fow-edge.png');

  /* Midpoint between HQ vision and a far city — FOW boundary across the frame. */
  await page.evaluate(({ hx, hy }) => {
    const cities = (typeof cityZones !== 'undefined' && cityZones) ? cityZones : [];
    let best = cities[0] || { x: hx + 700, y: hy - 400 }, bestD = 1e12;
    for (const Z of cities) {
      const d = (Z.x - hx) * (Z.x - hx) + (Z.y - hy) * (Z.y - hy);
      if (d < bestD && d > 120 * 120) { bestD = d; best = Z; }
    }
    cam.x = hx * 0.45 + best.x * 0.55;
    cam.y = hy * 0.45 + best.y * 0.55;
    camFollow = -1;
    camYaw = yawTarget = 0.12;
    camPitch = pitchTarget = 1.16;
    orthoSpan = distTarget = 1100;
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    if (typeof updateFog === 'function') updateFog();
    if (typeof render === 'function') render(0.016);
  }, { hx: live.hq[0], hy: live.hq[1] });
  await page.waitForTimeout(200);
  await page.evaluate(() => { if (typeof render === 'function') render(0.016); });
  await shot(page, '05-fow-boundary.png');

  const report = { gpu: gpu.renderer, errs: errs.slice(0, 12), outDir, live, city };
  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  server.close();
}
