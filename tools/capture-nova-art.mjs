#!/usr/bin/env node
/* NOVA UNIT ART CAPTURE — hull material and aircraft thrusters, close up, at
   the DEVICE'S REAL perfScale.

   A variant of tools/capture-stagec-fx.mjs. Same server, same auth-gate boot,
   same real-GPU Chrome with d3d11, same pinned perfScale = 0.4125 (medium band
   .55 x GFX.particles .75). The difference is what it frames: Nova aircraft
   (Wasp 5, Raptor 17, Kestrel 25) and Nova ground armour (Rhino 1, Goliath 2,
   Basilisk 26) at tactical zoom, which is where "does the hull read as metal"
   and "does the exhaust read as a plume" can actually be judged.

   TWO CAMERA TRAPS this file works around, both of which silently produce a
   useless capture:
     * main.js takes over clampCam() and floors orthoSpan at spanMinNow()=200.
       Setting orthoSpan=50 once before render() is undone on the next camTick.
       So the span is re-pinned INSIDE the step loop, every frame, after camTick
       has had its say.
     * air units draw at terrainH + unitAirAlt(i) (~58wu). At a 1.05..1.50 pitch
       the aircraft leaves the top of the frame entirely. `--lowair` overrides
       unitAirAlt to a few world units so the same mesh can be inspected at the
       same texel density as a tank; both variants are shot.

   Usage:  node tools/capture-nova-art.mjs [--tag before|after]
   Output: .tmp/nova-art/<tag>/
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tagIdx = process.argv.indexOf('--tag');
const TAG = tagIdx >= 0 ? process.argv[tagIdx + 1] : 'shot';
const outDir = join(root, '.tmp', 'nova-art', TAG);
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
    /* THE ZOOM FLOOR. render() -> camTick() -> clampCam(), and main.js's
       clampCam clamps orthoSpan to spanMinNow()=200. Assigning orthoSpan=30
       before render() is therefore undone on the very next frame, and every
       "close up" comes back as a 150px unit in a 1800px frame — which is what
       the first run of this file produced. spanMinNow is a top-level function
       declaration in a classic script, so it IS a global property and can be
       replaced; clampCam looks it up freely each call. */
    try { spanMinNow = () => 6; } catch (e) {}
    /* THE CONTROL THAT CAN FAIL: if the Nova mesh registry is empty, or the
       aircraft slots are missing, everything downstream is a photograph of a
       fallback chassis and the whole capture is worthless. Report it. */
    const kits = (typeof FAC_MESH !== 'undefined' && FAC_MESH.nova) ? Object.keys(FAC_MESH.nova).length : -1;
    const airOk = (typeof FAC_MESH !== 'undefined' && FAC_MESH.nova)
      ? [5, 17, 25].map(s => (FAC_MESH.nova[s] ? s : 'MISSING' + s)).join(',') : 'NO FAC_MESH.nova';
    return { perfScale, kits, airOk, novaAir: [5,17,25].map(s => !!(TYPES[s] && TYPES[s].air)).join(',') };
  });
  say('world ready at perfScale=' + setup.perfScale + ' (device value)');
  say('FAC_MESH.nova slots=' + setup.kits + '  air meshes=' + setup.airOk + '  TYPES[].air=' + setup.novaAir);
  if (setup.kits <= 0) say('*** CONTROL FAILED: no Nova faction meshes — the capture below is NOT Nova art ***');

  /* Pin the span every frame: main.js clampCam() floors it at 200 and camTick
     lerps toward distTarget, so a one-shot assignment is silently undone. */
  const step = async (n, span, pitch, yaw, cx, cy) => {
    for (let k = 0; k < n; k++) await page.evaluate(([span, pitch, yaw, cx, cy]) => {
      const dt = 1 / 30;
      try { unitTick(dt); } catch (e) {}
      try { projTick(dt); } catch (e) {}
      try { beamTick(dt); } catch (e) {}
      try { if (typeof updParticles === 'function') updParticles(dt); } catch (e) {}
      try { if (typeof shardTick === 'function') shardTick(dt); } catch (e) {}
      if (cx != null) { cam.x = cx; cam.y = cy; }
      if (span != null) {
        orthoSpan = distTarget = camDist = span;
        cam.z = 1400 / span;
        camPitch = pitchTarget = pitch;
        camYaw = yawTarget = yaw;
        if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
      }
      render(dt);
    }, [span, pitch, yaw, cx, cy]);
  };

  /* Read the span back from the page after the frame that was actually
     photographed. If the floor override failed, this prints 200 and every
     "close up" below is a lie. */
  const spanNow = async () => page.evaluate(() => Math.round(orthoSpan * 10) / 10);

  await step(4);

  const site = await page.evaluate(() => {
    let p = null;
    for (let r = 150; r < MAP * 0.45 && !p; r += 90) {
      for (let a = 0; a < 12; a++) {
        const x = MAP * 0.5 + Math.cos(a * 0.523) * r, y = MAP * 0.5 + Math.sin(a * 0.523) * r;
        if (x < 300 || y < 300 || x > MAP - 300 || y > MAP - 300) continue;
        const civic = typeof cityGroundAt === 'function' && cityGroundAt(x, y) >= 1;
        if (!civic && isWalkable(x, y)) { p = [x, y]; break; }
      }
    }
    if (!p) p = [MAP * 0.5, MAP * 0.5];
    window.__site = p;
    return 'site ' + Math.round(p[0]) + ',' + Math.round(p[1]);
  });
  say(site);

  /* ---- ground armour, close ---------------------------------------------- */
  const ground = await page.evaluate(() => {
    const [sx, sy] = window.__site;
    const made = [];
    const slots = [1, 2, 26];
    for (let k = 0; k < slots.length; k++) {
      const i = spawnUnit(slots[k], 0, sx + (k - 1) * 26, sy);
      made.push(slots[k] + ':' + i);
      if (i >= 0) { uang[i] = 0.7; umov[i] = 0; }
    }
    return made.join(' ');
  });
  say('ground spawn (type:index, -1 = FAILED) ' + ground);
  await page.evaluate(() => { const [sx, sy] = window.__site; cam.x = sx; cam.y = sy; });
  await step(6, 58, 1.06, 0.55, null, null);
  await page.evaluate(() => { const [sx, sy] = window.__site; cam.x = sx; cam.y = sy; });
  await step(2, 58, 1.06, 0.55);
  await page.screenshot({ path: join(outDir, '1-ground-armour.png') });
  say('shot 1: Rhino / Goliath / Basilisk — actual orthoSpan=' + (await spanNow()));

  /* ---- aircraft at REAL altitude ----------------------------------------- */
  const air = await page.evaluate(() => {
    const [sx, sy] = window.__site;
    const made = [];
    const slots = [5, 17, 25];
    for (let k = 0; k < slots.length; k++) {
      const i = spawnUnit(slots[k], 0, sx + (k - 1) * 34, sy + 90);
      made.push(slots[k] + ':' + i);
      if (i >= 0) { uang[i] = 0.7; umov[i] = 0; }
    }
    return made.join(' ');
  });
  say('air spawn (type:index, -1 = FAILED) ' + air);
  await step(8, 150, 1.50, 0.55, null, null);
  const aimed = await page.evaluate(() => {
    /* Aim at where the aircraft actually are, not at the ground under them:
       terrainH + unitAirAlt is ~58wu up, which at this pitch is a long way
       up-screen. Shift the look-at along the view's forward axis. */
    const [sx, sy] = window.__site;
    let n = 0, ax = 0, ay = 0, alt = 0;
    for (let i = 0; i < unitHigh; i++) {
      if (!ualive[i] || !TYPES[utype[i]].air) continue;
      ax += ux[i]; ay += uy[i]; n++;
      alt = (typeof unitAirAlt === 'function') ? unitAirAlt(i) : 58;
    }
    if (!n) return 'no live air units';
    ax /= n; ay /= n;
    cam.x = ax; cam.y = ay + alt * Math.cos(camPitch) / Math.max(0.2, Math.sin(camPitch));
    return 'air centroid ' + Math.round(ax) + ',' + Math.round(ay) + ' alt=' + Math.round(alt) + ' n=' + n;
  });
  say('air aim: ' + aimed);
  await step(3, 150, 1.50, 0.55);
  await page.screenshot({ path: join(outDir, '2-aircraft-inflight.png') });
  say('shot 2: Wasp / Raptor / Kestrel at flight altitude — actual orthoSpan=' + (await spanNow()));

  /* ---- aircraft dropped to inspection altitude ---------------------------- */
  const low = await page.evaluate(() => {
    /* Override the altitude function so the same mesh can be photographed at
       tank texel density. This changes NOTHING about the model or the shader —
       it only moves the camera problem out of the way. */
    if (typeof unitAirAlt !== 'function') return 'no unitAirAlt to override';
    window.unitAirAlt = () => 5;
    return 'unitAirAlt pinned to 5wu for inspection';
  });
  say('low-air: ' + low);
  const lowAim = await page.evaluate(() => {
    let n = 0, ax = 0, ay = 0;
    for (let i = 0; i < unitHigh; i++) {
      if (!ualive[i] || !TYPES[utype[i]].air) continue;
      ax += ux[i]; ay += uy[i]; n++;
    }
    if (!n) return 'none';
    cam.x = ax / n; cam.y = ay / n;
    return 'n=' + n;
  });
  say('low aim: ' + lowAim);
  await step(4, 62, 1.10, 0.55);
  await page.screenshot({ path: join(outDir, '3-aircraft-closeup.png') });
  say('shot 3: aircraft close up (altitude pinned to 5wu) — actual orthoSpan=' + (await spanNow()));

  /* one aircraft alone, filling the frame, tail toward camera so the exhausts
     are the subject */
  const solo = await page.evaluate(() => {
    let target = -1;
    for (let i = 0; i < unitHigh; i++) {
      if (ualive[i] && utype[i] === 5) { target = i; break; }
    }
    if (target < 0) return 'no Wasp alive';
    for (let i = 0; i < unitHigh; i++) if (ualive[i] && i !== target) { ualive[i] = 0; }
    uang[target] = Math.PI * 0.5;      // nose away from camera: exhausts face us
    cam.x = ux[target]; cam.y = uy[target];
    return 'wasp idx ' + target;
  });
  say('solo: ' + solo);
  await step(4, 30, 1.10, 0.55);
  await page.screenshot({ path: join(outDir, '4-wasp-tail-on.png') });
  say('shot 4: single Wasp, tail toward camera — actual orthoSpan=' + (await spanNow()));

  await page.evaluate(() => {
    let target = -1;
    for (let i = 0; i < unitHigh; i++) if (ualive[i] && utype[i] === 5) { target = i; break; }
    if (target >= 0) uang[target] = 0.0;
  });
  await step(3, 30, 1.10, 0.55);
  await page.screenshot({ path: join(outDir, '5-wasp-side.png') });
  say('shot 5: single Wasp, broadside (hull material check) — actual orthoSpan=' + (await spanNow()));

  /* ---- LOW ANGLE ---------------------------------------------------------
     Everything above is shot from the play camera, which is 1.05..1.50 rad and
     therefore nearly top-down: it can judge a deck and a plume but it cannot
     judge a HULL SIDE, and the hull side is where a specular edge either exists
     or does not. PITCH_MIN is 1.05 and clampCam enforces it, so the same
     override the span floor needed is required here. This angle is NOT what a
     player sees -- it is a material inspection, and it is labelled as one. */
  const lowPitch = await page.evaluate(() => {
    /* PITCH_MIN is `const PITCH_MIN=1.05` in mesh.js -- a lexical binding, not a
       global property, so assigning it is a silent no-op and the first version of
       this shot came back top-down with the control printing 1.05. The clamp is
       applied by clampCam(), and THAT is a function declaration (main.js already
       reassigns it), so replace the whole function instead. Keep the two lines
       camTick depends on; drop only the pitch/span/pan clamping. */
    try {
      clampCam = function(){ camDist = orthoSpan; cam.z = 1400 / Math.max(1, orthoSpan); };
    } catch (e) { return 'clampCam not writable: ' + e.message; }
    return 'clampCam replaced';
  });
  say('low-angle: ' + lowPitch);

  await step(4, 34, 0.30, 0.55);
  const pitchGot = await page.evaluate(() => Math.round(camPitch * 100) / 100);
  await page.screenshot({ path: join(outDir, '6-wasp-low-angle.png') });
  say('shot 6: Wasp from a low angle - actual camPitch=' + pitchGot + ' orthoSpan=' + (await spanNow()));

  const backGround = await page.evaluate(() => {
    const [sx, sy] = window.__site;
    for (let i = 0; i < unitHigh; i++) if (ualive[i]) ualive[i] = 0;
    const made = [];
    const slots = [1, 2];
    for (let k = 0; k < slots.length; k++) {
      const i = spawnUnit(slots[k], 0, sx + (k - 0.5) * 30, sy);
      made.push(slots[k] + ':' + i);
      if (i >= 0) { uang[i] = 0.9; umov[i] = 0; }
    }
    cam.x = sx; cam.y = sy;
    return made.join(' ');
  });
  say('low-angle ground respawn (type:index, -1 = FAILED) ' + backGround);
  await step(6, 46, 0.30, 0.55);
  await page.evaluate(() => { const [sx, sy] = window.__site; cam.x = sx; cam.y = sy; });
  await step(2, 46, 0.30, 0.55);
  await page.screenshot({ path: join(outDir, '7-armour-low-angle.png') });
  say('shot 7: Rhino + Goliath from a low angle - orthoSpan=' + (await spanNow()));

  say('');
  say('page errors: ' + (errs.length ? errs.slice(0, 6).join(' | ') : 'none'));
  await writeFile(join(outDir, 'log.txt'), log.join('\n'), 'utf8');
  await page.close();
} catch (e) {
  say('FATAL ' + e.message + '\n' + (e.stack || '').slice(0, 600));
  await writeFile(join(outDir, 'log.txt'), log.join('\n'), 'utf8');
} finally {
  await closePwBrowser();
  try { server.closeAllConnections && server.closeAllConnections(); } catch (e) {}
  server.close();
}
console.log('output: ' + outDir);
/* Chrome holds keep-alive sockets on the static server, so server.close()
   never resolves the event loop and node hangs after the last screenshot.
   The work is done at this point; leave deliberately. */
process.exit(0);
