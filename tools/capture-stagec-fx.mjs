#!/usr/bin/env node
/* Stage C capture — explosions, a destroyed structure, and deep water, shot at
   the DEVICE'S REAL perfScale rather than at 1.0.

   That last point is the whole reason this file exists. The owner's phone runs
   the medium mobile preset at 28-42 fps, which resolves to
   perfScale = band(0.55) * GFX.particles(0.75) = 0.4125 — and the single most
   common effect gate in this codebase is `perfScale > 0.48`. A capture taken at
   perfScale 1 shows debris, fragments and faction accents that the phone never
   draws, i.e. it shows a build the owner does not have. This project has an
   eleven-case history of probes measuring the wrong thing; that is one of them.

   Usage:  node tools/capture-stagec-fx.mjs
   Output: .tmp/stagec-fx/
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'stagec-fx');
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
  executablePath: existsSync(chrome) ? chrome : undefined, headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox']
});

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

const log = [];
const say = m => { log.push(m); console.log(m); };

try {
  const page = await browser.newPage({
    viewport: { width: 900, height: 900 },
    deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark'
  });
  const errs = [];
  page.on('pageerror', e => { errs.push(e.message.slice(0, 200)); });
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
    if (!g) return 'NO-WEBGL2';
    const d = g.getExtension('WEBGL_debug_renderer_info');
    return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : String(g.getParameter(g.RENDERER));
  });
  say('GPU: ' + gpu);
  if (/swiftshader|llvmpipe|lavapipe/i.test(String(gpu)))
    say('*** SOFTWARE RASTERISER - shading is not representative ***');

  await page.waitForFunction(() => typeof spawnUnit === 'function' && typeof render === 'function' &&
    typeof resetWorld === 'function' && typeof spawnExplosion === 'function', { timeout: 120000 });
  await page.waitForTimeout(400);
  await page.evaluate(boot);
  await page.waitForFunction(() => typeof heightF !== 'undefined' && heightF && typeof terrainTex !== 'undefined' && terrainTex, { timeout: 90000 }).catch(() => {});

  /* ---- world at DEVICE settings ------------------------------------------ */
  const setup = await page.evaluate(() => {
    try { stopAttract(); } catch (e) {}
    attractOn = false; demoMode = false; matchLive = true; fogOn = false;
    running = true; paused = false; gameEnded = false;
    if (typeof META !== 'undefined' && META.settings) {
      META.settings.fog = false; META.settings.dayNight = false;
      META.settings.quality = 'medium';                 // the mobile default
    }
    if (typeof applySettings === 'function') applySettings();
    dayT = 0.20;
    resetWorld();
    playerFaction = 'nova';
    const cx = MAP * 0.5, cy = MAP * 0.5;

    /* THE DEVICE'S VALUE, pinned after applySettings so nothing overwrites it */
    perfScale = 0.4125;
    if (typeof GFX !== 'undefined') { GFX.particles = 0.75; GFX.fxFloor = 0.35; }

    const cv = document.getElementById('gl');
    for (const id of ['pauseOverlay','gameOver','levelUp','loadScr','dispatch','apOverlay','setupScr','startScreen']) {
      const e = document.getElementById(id); if (e) e.style.setProperty('display','none','important');
    }
    document.body.classList.remove('menuMode', 'mfMenuOpen');
    for (const el of [...document.body.children]) if (el.id !== 'gl') el.style.display = 'none';
    cv.style.display = 'block'; cv.style.position = 'fixed'; cv.style.inset = '0';
    cv.style.width = '100vw'; cv.style.height = '100vh';
    cam.x = cx; cam.y = cy; camFollow = -1;
    camYaw = yawTarget = 0.22; camPitch = pitchTarget = 1.05;
    orthoSpan = distTarget = 300;
    if (typeof resize === 'function') resize();
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    return { cx, cy, perfScale };
  });
  say('world ready at perfScale=' + setup.perfScale + ' (device value)');

  const step = async (n) => { for (let k = 0; k < n; k++) await page.evaluate(() => {
    const dt = 1 / 30;
    try { unitTick(dt); } catch (e) {}
    try { projTick(dt); } catch (e) {}
    try { beamTick(dt); } catch (e) {}
    try { if (typeof bldTick === 'function') bldTick(dt); } catch (e) {}
    try { if (typeof updParticles === 'function') updParticles(dt); } catch (e) {}
    try { if (typeof shardTick === 'function') shardTick(dt); } catch (e) {}
    render(dt);
  }); };

  await step(6);

  /* ---- 1. explosions: a big one and a small one, side by side ------------- */
  await page.evaluate(() => {
    const cx = MAP * 0.5, cy = MAP * 0.5;
    spawnExplosion(cx - 70, cy, 40, 0);     // large
    spawnExplosion(cx + 70, cy, 8, 1);      // small
  });
  await step(3);
  await page.screenshot({ path: join(outDir, '1-explosion-big-vs-small.png') });
  say('shot 1: explosion size contrast (sz 40 vs sz 8)');

  /* ---- 2. a destroyed structure ------------------------------------------ */
  const wreck = await page.evaluate(() => {
    const cx = MAP * 0.5, cy = MAP * 0.5;
    if (typeof addBld !== 'function') return 'no addBld';
    let B = null;
    try {
      /* instant=true - the previous run omitted it, so the structure was still
         under construction and never became a wreck. */
      B = addBld('fac', 1, cx, cy + 40, true);
    } catch (e) { return 'build threw: ' + String(e).slice(0, 80); }
    if (!B) return 'no building';
    /* damageBld(b,...) takes an INDEX into blds - `const B=blds[b]` - not the
       object. Passing the object made blds[obj] undefined and the function
       returned on its first line, which is why the structure stayed alive. */
    const bi = (typeof B === 'number') ? B : blds.indexOf(B);
    const obj = (typeof B === 'number') ? blds[B] : B;
    if (bi < 0) return 'building not in blds';
    obj.hp = 1;
    if (typeof damageBld === 'function') damageBld(bi, 999999, 0);
    return 'idx=' + bi + ' type=' + (obj.type || '?') + ' alive=' + obj.alive
         + ' fallT=' + (obj.fallT != null ? obj.fallT : 'none')
         + ' (alive must be false and fallT set, or this shot shows a healthy building)';
  });
  say('wreck: ' + wreck);
  await step(4);
  await page.evaluate(() => { cam.x = MAP * 0.5; cam.y = MAP * 0.5 + 40; orthoSpan = distTarget = 150;
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices(); });
  await step(2);
  await page.screenshot({ path: join(outDir, '2-destroyed-structure.png') });
  say('shot 2: destroyed structure (carbonise check)');

  /* ---- 3. deep water ------------------------------------------------------ */
  const water = await page.evaluate(() => {
    /* Water is heightF < WATER_H. The previous run tested isWalkable, but
       unwalkable does not mean wet - steep rock is unwalkable too - so it
       found no water at all and shot an arbitrary cliff. */
    const wet = (x, y) => {
      const ix = Math.max(0, Math.min(TS - 1, (x / MAP * TS) | 0));
      const iy = Math.max(0, Math.min(TS - 1, (y / MAP * TS) | 0));
      return heightF[iy * TS + ix] < WATER_H;
    };
    let best = null, bestD = 0;
    for (let y = 200; y < MAP - 200; y += 50) for (let x = 200; x < MAP - 200; x += 50) {
      if (!wet(x, y)) continue;
      let d = 0;
      for (let r = 40; r < 500; r += 40) {
        let shore = false;
        for (let a = 0; a < 8; a++) {
          const px = x + Math.cos(a * 0.785) * r, py = y + Math.sin(a * 0.785) * r;
          if (!wet(px, py)) { shore = true; break; }
        }
        if (shore) break; d = r;
      }
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
    if (!best) return 'no water on this map';
    cam.x = best[0]; cam.y = best[1];
    camPitch = pitchTarget = 1.28;                 // grazing, where the streaks read worst
    orthoSpan = distTarget = 420;
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    return 'deep water at ' + best[0] + ',' + best[1] + ' clearance ' + bestD;
  });
  say('water: ' + water);
  await step(4);
  await page.screenshot({ path: join(outDir, '3-deep-water.png') });
  say('shot 3: deep water (diagonal-streak check)');

  /* ---- 4. a CYAN DEPOSIT up close - the red-halo test --------------------- */
  const dep = await page.evaluate(() => {
    /* The halo comes from per-channel unsharp over cyan vein strokes painted
       into the macro map, so the test must actually frame a deposit. */
    if (typeof deposits === 'undefined' || !deposits || !deposits.length) return 'no deposits';
    const d = deposits[0];
    cam.x = d.x; cam.y = d.y;
    camPitch = pitchTarget = 0.95;
    orthoSpan = distTarget = 60;                 // close, where uGate is fully live
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    return 'deposit at ' + Math.round(d.x) + ',' + Math.round(d.y) + ' of ' + deposits.length;
  });
  say('deposit: ' + dep);
  await step(3);
  await page.screenshot({ path: join(outDir, '4-deposit-closeup.png') });
  say('shot 4: cyan deposit close up (red-halo check)');

  /* ---- 5. a road edge up close - the speckle test ------------------------- */
  const road = await page.evaluate(() => {
    if (typeof ROAD_PATHS === 'undefined' || !ROAD_PATHS || !ROAD_PATHS.length) return 'no roads';
    for (const R of ROAD_PATHS) {
      const P = R.path; if (!P || P.length < 3) continue;
      const p = P[(P.length / 2) | 0];
      cam.x = (p.x != null ? p.x : p[0]); cam.y = (p.y != null ? p.y : p[1]);
      camPitch = pitchTarget = 0.90; orthoSpan = distTarget = 55;
      if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
      return 'road at ' + Math.round(cam.x) + ',' + Math.round(cam.y);
    }
    return 'no usable road path';
  });
  say('road: ' + road);
  await step(3);
  await page.screenshot({ path: join(outDir, '5-road-edge.png') });
  say('shot 5: road edge close up (speckle check)');

  say('');
  say('page errors: ' + (errs.length ? errs.slice(0, 4).join(' | ') : 'none'));
  await writeFile(join(outDir, 'log.txt'), log.join('\n'), 'utf8');
  await page.close();
} catch (e) {
  say('FATAL ' + e.message);
  await writeFile(join(outDir, 'log.txt'), log.join('\n'), 'utf8');
} finally {
  await closePwBrowser();
  server.close();
}
console.log('output: ' + outDir);
