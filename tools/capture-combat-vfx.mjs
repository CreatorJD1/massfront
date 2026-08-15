#!/usr/bin/env node
/* Combat VFX capture — tracers, beams, muzzle flash at tactical zoom.
   Usage: node tools/capture-combat-vfx.mjs
   Output: .tmp/combat-vfx-2026-08-14/
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'combat-vfx-2026-08-14');
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
    viewport: { width: 900, height: 900 },
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

  await page.waitForFunction(() => typeof spawnUnit === 'function' && typeof addBeam === 'function' &&
    typeof fireProj === 'function' && typeof render === 'function' && typeof resetWorld === 'function', { timeout: 120000 });
  await page.waitForTimeout(400);
  await page.evaluate(boot);
  await page.waitForFunction(() => typeof heightF !== 'undefined' && heightF && typeof terrainTex !== 'undefined' && terrainTex, { timeout: 90000 }).catch(() => {});

  const setup = await page.evaluate(() => {
    try { stopAttract(); } catch (e) {}
    attractOn = false; demoMode = false; matchLive = true; fogOn = false;
    running = true; paused = false; gameEnded = false;
    if (typeof META !== 'undefined' && META.settings) {
      META.settings.fog = false;
      META.settings.dayNight = false;
      META.settings.quality = 'high';
      META.settings.cine = true;
    }
    if (typeof applySettings === 'function') applySettings();
    dayT = 0.08; perfScale = 1;
    if (typeof GFX !== 'undefined') { GFX.ao = true; GFX.bloom = true; GFX.fxFloor = 0.55; }
    resetWorld();
    playerFaction = 'nova';
    const F = FACTIONS.legion; AI.fac = 'legion';
    TEAMC[1][0] = F.col[0]; TEAMC[1][1] = F.col[1]; TEAMC[1][2] = F.col[2];
    TEAMB[1][0] = F.colB[0]; TEAMB[1][1] = F.colB[1]; TEAMB[1][2] = F.colB[2];
    const cx = MAP * 0.5, cy = MAP * 0.5;
    const idx = n => TYPES.findIndex(T => T.name === n);
    const rhino = idx('Rhino'), striker = idx('Striker'), longbow = idx('Longbow'), lancer = idx('Lancer');
    const west = [], east = [];
    const put = (ty, team, x, y, bag) => {
      const i = spawnUnit(ty, team, x, y);
      if (i >= 0) { ucool[i] = 0; umarch[i] = 0; ustate[i] = 0; bag.push(i); }
      return i;
    };
    for (let k = 0; k < 5; k++) {
      put(rhino, 0, cx - 70, cy - 48 + k * 24, west);
      put(rhino, 1, cx + 70, cy - 48 + k * 24, east);
    }
    for (let k = 0; k < 4; k++) {
      put(striker, 0, cx - 52, cy - 36 + k * 24, west);
      put(striker, 1, cx + 52, cy - 36 + k * 24, east);
    }
    put(longbow, 0, cx - 95, cy - 10, west);
    put(longbow, 1, cx + 95, cy + 10, east);
    put(lancer, 0, cx - 88, cy + 28, west);
    put(lancer, 1, cx + 88, cy - 28, east);
    const aim = (i, j) => {
      if (i < 0 || j < 0) return;
      const ang = Math.atan2(uy[j] - uy[i], ux[j] - ux[i]) + Math.PI / 2;
      uang[i] = uturr[i] = ang;
      utgt[i] = j; utgtg[i] = ugen[j];
      ucool[i] = 0;
    };
    for (let k = 0; k < west.length; k++) aim(west[k], east[k % east.length]);
    for (let k = 0; k < east.length; k++) aim(east[k], west[k % west.length]);
    /* Guaranteed readable samples even if the first sim tick is unlucky. */
    const a = west[0], b = east[0];
    if (a >= 0 && b >= 0) {
      addBeam(ux[a] + 10, uy[a], ux[b], uy[b], 2.8, 80, 210, 255, 0.85, 'laser');
      addBeam(ux[west[west.length - 1]] + 8, uy[west[west.length - 1]], ux[b], uy[b], 5.4, 90, 200, 255, 0.85, 'lance');
      const pk = fireProj(1, 0, ux[a] + 12, uy[a], ux[b], uy[b], 300, 18, 0, b);
      if (pk >= 0) { pwk[pk] = 'p'; projectileFireFX(pk, ux[a] + 12, uy[a], ux[b] - ux[a], uy[b] - uy[a]); }
      const gk = fireProj(1, 0, ux[a] + 8, uy[a] + 6, ux[b], uy[b], 900, 150, 0, b);
      if (gk >= 0) { pwk[gk] = 'g'; projectileFireFX(gk, ux[a] + 8, uy[a] + 6, ux[b] - ux[a], uy[b] - uy[a]); }
    }
    for (const id of ['pauseOverlay', 'gameOver', 'levelUp', 'loadScr', 'dispatch', 'apOverlay', 'setupScr', 'startScreen']) {
      const e = document.getElementById(id); if (e) e.style.setProperty('display', 'none', 'important');
    }
    document.body.classList.remove('menuMode', 'mfMenuOpen');
    for (const el of [...document.body.children]) if (el.id !== 'gl') el.style.display = 'none';
    cv.style.display = 'block'; cv.style.position = 'fixed'; cv.style.inset = '0';
    cv.style.width = '100vw'; cv.style.height = '100vh';
    cam.x = cx; cam.y = cy; camFollow = -1;
    camYaw = yawTarget = 0.22; camPitch = pitchTarget = 1.14;
    orthoSpan = distTarget = 420;
    if (typeof resize === 'function') resize();
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    return { west: west.length, east: east.length, rhino, striker, longbow, lancer, cx, cy };
  });
  console.log('setup ' + JSON.stringify(setup));

  for (let n = 0; n < 8; n++) {
    await page.evaluate(() => {
      const dt = 1 / 30;
      unitTick(dt); projTick(dt); beamTick(dt);
      if (typeof updParticles === 'function') updParticles(dt);
      if (typeof shardTick === 'function') shardTick(dt);
      render(dt);
    });
  }

  const volley = async () => page.evaluate(() => {
    const west = [], east = [];
    for (let i = 0; i < unitHigh; i++) {
      if (!ualive[i]) continue;
      if (uteam[i] === 0) west.push(i); else if (uteam[i] === 1) east.push(i);
    }
    for (let k = 0; k < Math.min(west.length, east.length); k++) {
      const i = west[k], j = east[k];
      ucool[i] = 0; ucool[j] = 0;
      utgt[i] = j; utgt[j] = i;
      const Ti = TYPES[utype[i]], Tj = TYPES[utype[j]];
      const pk = fireProj(Ti.ptype || 1, 0, ux[i], uy[i], ux[j], uy[j],
        Ti.psp > 0 ? Ti.psp : 320, 16, 0, j);
      if (pk >= 0) { pwk[pk] = Ti.wk || 'p'; projectileFireFX(pk, ux[i], uy[i], ux[j] - ux[i], uy[j] - uy[i]); }
      const qk = fireProj(Tj.ptype || 1, 1, ux[j], uy[j], ux[i], uy[i],
        Tj.psp > 0 ? Tj.psp : 320, 16, 0, i);
      if (qk >= 0) { pwk[qk] = Tj.wk || 'p'; projectileFireFX(qk, ux[j], uy[j], ux[i] - ux[j], uy[i] - uy[j]); }
    }
    if (west[0] >= 0 && east[0] >= 0) {
      addBeam(ux[west[0]] + 8, uy[west[0]], ux[east[0]], uy[east[0]], 2.8, 80, 210, 255, 1.4, 'laser');
      beams[beams.length - 1].team = 0;
      addBeam(ux[west[Math.min(2, west.length - 1)]] + 6, uy[west[Math.min(2, west.length - 1)]],
        ux[east[0]], uy[east[0]], 5.2, 95, 205, 255, 1.4, 'lance');
      beams[beams.length - 1].team = 0;
      addBeam(ux[east[1]] - 8, uy[east[1]], ux[west[1]], uy[west[1]], 2.4, 255, 95, 55, 1.4, 'laser');
      beams[beams.length - 1].team = 1;
    }
    projTick(0.05);
    render(0.016);
    let liveP = 0;
    for (let i = 0; i < pHigh; i++) if (palive[i]) liveP++;
    return { projectiles: liveP, beams: beams.length, orthoSpan };
  });

  const metrics = await volley();
  console.log('metrics ' + JSON.stringify(metrics));

  const p1 = join(outDir, '01-firefight-tactical.png');
  await page.screenshot({ path: p1, fullPage: false });
  console.log('wrote ' + p1);

  await volley();
  const p2 = join(outDir, '02-firefight-plus-beams.png');
  await page.screenshot({ path: p2, fullPage: false });
  console.log('wrote ' + p2);

  await page.evaluate(() => {
    orthoSpan = distTarget = 280;
    camYaw = yawTarget = 0.55;
    camPitch = pitchTarget = 1.05;
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
  });
  await volley();
  const p3 = join(outDir, '03-firefight-close.png');
  await page.screenshot({ path: p3, fullPage: false });
  console.log('wrote ' + p3);

  const report = { gpu: gpu.renderer, errs: errs.slice(0, 12), outDir, setup, metrics };
  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (errs.length) throw new Error(errs.join('\n'));
} finally {
  await browser.close();
  server.close();
}
