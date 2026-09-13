#!/usr/bin/env node
/* WATER SHORELINE capture — the edge, from above AND from the lowest camera
   the game allows (PITCH_MIN = 1.05 rad). A bad water edge looks fine top-down
   and falls apart from the side, so both are shot at the same spot.

   Device settings are pinned exactly as capture-stagec-fx.mjs does it:
   quality medium, perfScale 0.4125, GFX.waterAmp 0.80  ->  uDetail = 1.

   Every shot carries a NUMERIC CONTROL THAT CAN FAIL: the chosen world point
   is projected through the live matVP and the framebuffer pixel there is read
   back. If the "water" sample is not blue-dominant, or the land sample is not
   different from it, the probe is wrong and the log says so.

   Usage:  node tools/capture-water-shore.mjs [tag]
   Output: .tmp/water-shore/<tag>/
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const tag = process.argv[2] || 'run';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'water-shore', tag);
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
  page.on('pageerror', e => { errs.push(e.message.slice(0, 240)); });
  page.on('console', m => { const t = m.text(); if (/shader|link|INVALID|water/i.test(t)) errs.push('console: ' + t.slice(0, 240)); });
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
    typeof resetWorld === 'function', { timeout: 120000 });
  await page.waitForTimeout(400);
  await page.evaluate(boot);
  await page.waitForFunction(() => typeof heightF !== 'undefined' && heightF && typeof terrainTex !== 'undefined' && terrainTex, { timeout: 90000 }).catch(() => {});

  const setup = await page.evaluate(() => {
    try { stopAttract(); } catch (e) {}
    attractOn = false; demoMode = false; matchLive = true; fogOn = false;
    running = true; paused = false; gameEnded = false;
    if (typeof META !== 'undefined' && META.settings) {
      META.settings.fog = false; META.settings.dayNight = false;
      META.settings.quality = 'medium';
    }
    if (typeof applySettings === 'function') applySettings();
    dayT = 0.20;
    resetWorld();
    playerFaction = 'nova';
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
    camFollow = -1;
    if (typeof resize === 'function') resize();
    return {
      perfScale, waterAmp: (typeof GFX !== 'undefined' ? GFX.waterAmp : null),
      theme: (typeof curTheme !== 'undefined' ? String(curTheme) : '?'),
      WATER_H: (typeof WATER_H !== 'undefined' ? WATER_H : null),
      MAP: (typeof MAP !== 'undefined' ? MAP : null)
    };
  });
  say('world ready: ' + JSON.stringify(setup));

  const step = async (n) => { for (let k = 0; k < n; k++) await page.evaluate(() => {
    const dt = 1 / 30;
    try { unitTick(dt); } catch (e) {}
    try { projTick(dt); } catch (e) {}
    try { if (typeof updParticles === 'function') updParticles(dt); } catch (e) {}
    render(dt);
  }); };
  await step(6);

  /* ---- shader health: a control that CAN fail --------------------------- */
  const health = await page.evaluate(() => {
    const p = (typeof ensureWaterProg === 'function') ? ensureWaterProg() : null;
    const amp = (typeof waterAmpNow === 'function') ? waterAmpNow() : null;
    return {
      waterProgLinked: !!p,
      waterIdxCount: (typeof waterIdxCount !== 'undefined') ? waterIdxCount : -1,
      uAmp: amp,
      uDetail: amp == null ? null : (amp >= 0.85 ? 2 : amp >= 0.55 ? 1 : 0),
      glError: (typeof gl !== 'undefined' && gl) ? gl.getError() : 'no gl',
      progErrors: (typeof GL_PROG_ERRORS !== 'undefined' && GL_PROG_ERRORS) ? GL_PROG_ERRORS.slice(0, 6) : 'n/a'
    };
  });
  say('water shader: ' + JSON.stringify(health));
  if (!health.waterProgLinked) say('*** WATER PROGRAM DID NOT LINK - every shot below is the CPU fallback ***');
  if (!health.waterIdxCount) say('*** WATER MESH IS EMPTY - this map has no water, shots are meaningless ***');

  /* ---- pick a shoreline: wet cell next to STEEP dry land ---------------- */
  const site = await page.evaluate(() => {
    const hAt = (x, y) => {
      const ix = Math.max(0, Math.min(TS - 1, (x / MAP * TS) | 0));
      const iy = Math.max(0, Math.min(TS - 1, (y / MAP * TS) | 0));
      return heightF[iy * TS + ix];
    };
    const wet = (x, y) => hAt(x, y) < WATER_H;
    let shore = null, shoreScore = -1, deep = null, deepD = 0;
    for (let y = 150; y < MAP - 150; y += 24) for (let x = 150; x < MAP - 150; x += 24) {
      if (!wet(x, y)) continue;
      let d = 0;
      for (let r = 40; r < 520; r += 40) {
        let s = false;
        for (let a = 0; a < 8; a++) if (!wet(x + Math.cos(a * 0.785) * r, y + Math.sin(a * 0.785) * r)) { s = true; break; }
        if (s) break; d = r;
      }
      if (d > deepD) { deepD = d; deep = [x, y]; }
      let land = null;
      for (let a = 0; a < 16 && !land; a++) {
        const px = x + Math.cos(a * 0.3927) * 40, py = y + Math.sin(a * 0.3927) * 40;
        if (!wet(px, py)) land = [px, py, a * 0.3927];
      }
      if (!land) continue;
      const rise = hAt(land[0] + Math.cos(land[2]) * 60, land[1] + Math.sin(land[2]) * 60) - WATER_H;
      const wetSide = WATER_H - hAt(x - Math.cos(land[2]) * 60, y - Math.sin(land[2]) * 60);
      const sc = rise * 100 + wetSide * 60;
      if (sc > shoreScore) { shoreScore = sc; shore = { x, y, ang: land[2], rise, wetSide }; }
    }
    return { shore, shoreScore, deep, deepD };
  });
  say('site: shore=' + JSON.stringify(site.shore) + ' deep=' + JSON.stringify(site.deep) + ' clearance=' + site.deepD);
  if (!site.shore) { say('*** NO SHORELINE FOUND - abort ***'); throw new Error('no shoreline'); }

  /* Render AND read back inside ONE page task. The first version read pixels
     from a later evaluate and got (0,0,0) for every sample: without
     preserveDrawingBuffer the default framebuffer is cleared the moment the
     task that drew it ends, so the probe was measuring an empty buffer, not
     the frame. Twelfth case in this repo of the probe being wrong. */
  const renderAndSample = async (pts) => page.evaluate((P) => {
    const dt = 1 / 30;
    try { unitTick(dt); } catch (e) {}
    try { projTick(dt); } catch (e) {}
    try { if (typeof updParticles === 'function') updParticles(dt); } catch (e) {}
    render(dt);
    const cv = document.getElementById('gl');
    const m = matVP, pz = 0.6, buf = new Uint8Array(4), out = [];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    for (const [px, py] of P) {
      const X = m[0]*px + m[4]*pz + m[8]*py + m[12];
      const Y = m[1]*px + m[5]*pz + m[9]*py + m[13];
      const W = m[3]*px + m[7]*pz + m[11]*py + m[15];
      if (Math.abs(W) < 1e-6) { out.push(null); continue; }
      const nx = X / W, ny = Y / W;
      if (nx < -1 || nx > 1 || ny < -1 || ny > 1) { out.push({ off: true }); continue; }
      const sx = Math.round((nx * 0.5 + 0.5) * cv.width);
      const sy = Math.round((ny * 0.5 + 0.5) * cv.height);
      gl.readPixels(Math.max(0, Math.min(cv.width - 1, sx)), Math.max(0, Math.min(cv.height - 1, sy)),
        1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      out.push({ px: sx, py: sy, rgb: [buf[0], buf[1], buf[2]] });
    }
    return out;
  }, pts);

  const shot = async (name, cfg, note) => {
    await page.evaluate((c) => {
      cam.x = c.x; cam.y = c.y;
      camYaw = yawTarget = c.yaw;
      camPitch = pitchTarget = c.pitch;
      orthoSpan = distTarget = c.span;
      if (typeof clampCam === 'function') clampCam();
      if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    }, cfg);
    await step(3);
    const pts = [cfg.probeW].concat(cfg.probeL ? [cfg.probeL] : []).concat(cfg.line || []);
    const got = await renderAndSample(pts);
    await page.screenshot({ path: join(outDir, name + '.png') });
    const w = got[0], l = cfg.probeL ? got[1] : null;
    let verdict = 'ok';
    if (!w || w.off) verdict = 'PROBE OFF-SCREEN (control failed)';
    else if (w.rgb[2] <= w.rgb[0]) verdict = 'WATER SAMPLE NOT BLUE-DOMINANT rgb=' + w.rgb + ' (control failed)';
    else if (l && !l.off && Math.abs(l.rgb[0] - w.rgb[0]) + Math.abs(l.rgb[1] - w.rgb[1]) + Math.abs(l.rgb[2] - w.rgb[2]) < 12)
      verdict = 'LAND AND WATER SAMPLES IDENTICAL (control failed)';
    say('shot ' + name + ': ' + note + '  water=' + JSON.stringify(w) + ' land=' + JSON.stringify(l) + '  -> ' + verdict);
    if (cfg.line) {
      const prof = got.slice(cfg.probeL ? 2 : 1);
      const rows = prof.map((p, i) => {
        const d = cfg.lineD[i];
        return (d >= 0 ? '+' : '') + d.toFixed(0) + ':' + (p && p.rgb ? p.rgb.join(',') : 'off');
      });
      say('  shore profile (world u from waterline, - = seaward): ' + rows.join('  '));
      /* Edge hardness: the largest single-step colour jump along the transect.
         A hard polygon edge shows one big jump; a graded edge spreads it. */
      let mx = 0, mxAt = 0;
      for (let i = 1; i < prof.length; i++) {
        const a = prof[i - 1], b = prof[i];
        if (!a || !b || !a.rgb || !b.rgb) continue;
        const dd = Math.abs(a.rgb[0]-b.rgb[0]) + Math.abs(a.rgb[1]-b.rgb[1]) + Math.abs(a.rgb[2]-b.rgb[2]);
        if (dd > mx) { mx = dd; mxAt = cfg.lineD[i]; }
      }
      say('  max step along transect = ' + mx + ' (sum|dRGB|) at ' + mxAt + ' u  [lower = softer edge]');
    }
  };

  const S = site.shore, ang = S.ang;
  const inland = [S.x + Math.cos(ang) * 70, S.y + Math.sin(ang) * 70];
  const seaward = [S.x - Math.cos(ang) * 90, S.y - Math.sin(ang) * 90];
  const alongYaw = ang + Math.PI * 0.5;
  /* Transect across the waterline, in world units: negative = out to sea. */
  const lineD = [];
  for (let d = -60; d <= 30; d += 5) lineD.push(d);
  const line = lineD.map(d => [S.x + Math.cos(ang) * d, S.y + Math.sin(ang) * d]);

  await shot('1-shore-top', { x: S.x, y: S.y, yaw: 0.22, pitch: 1.48, span: 420, probeW: seaward, probeL: inland, line, lineD },
    'shoreline, near top-down (the view that always looks fine)');
  await shot('2-shore-low', { x: S.x, y: S.y, yaw: alongYaw, pitch: 1.05, span: 380, probeW: seaward, probeL: inland },
    'SAME shoreline at PITCH_MIN 1.05 - the view that exposes the edge');
  await shot('3-shore-low-close', { x: S.x, y: S.y, yaw: alongYaw, pitch: 1.05, span: 210, probeW: seaward, probeL: inland },
    'shoreline close, lowest camera - stair-step / shelf banding check');
  await shot('4-shore-low-facing', { x: S.x, y: S.y, yaw: ang + Math.PI, pitch: 1.05, span: 300, probeW: seaward, probeL: inland },
    'looking from the land out to sea, lowest camera');
  if (site.deep) {
    await shot('5-deep-low', { x: site.deep[0], y: site.deep[1], yaw: 0.6, pitch: 1.05, span: 620, probeW: site.deep },
      'open water body, lowest camera - specular / sky reflection read');
    await shot('6-deep-top', { x: site.deep[0], y: site.deep[1], yaw: 0.22, pitch: 1.46, span: 900, probeW: site.deep },
      'open water body from above - depth grading read');
  }

  say('');
  say('page errors: ' + (errs.length ? errs.slice(0, 6).join(' | ') : 'none'));
  await writeFile(join(outDir, 'log.txt'), log.join('\n'), 'utf8');
  await page.close();
} catch (e) {
  say('FATAL ' + e.message);
  await writeFile(join(outDir, 'log.txt'), log.join('\n'), 'utf8');
} finally {
  await closePwBrowser();
  server.closeAllConnections();
  server.close();
}
console.log('output: ' + outDir);
process.exit(0);
