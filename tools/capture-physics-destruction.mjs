#!/usr/bin/env node
/* Rigid-body destruction capture — a variant of capture-stagec-fx.mjs.

   Serves the repo root (so it tests src/ LIVE, not a stale www/ pack), boots
   past the auth gate in real Chrome on d3d11, and pins perfScale to the
   device's 0.4125 before anything is measured.

   EVERY PROBE HERE HAS A CONTROL THAT CAN FAIL. This repo has a dozen recorded
   cases of the probe being wrong and the code being right, so:

     * the tumble metric is run FIRST with zero bodies alive. If it reports
       motion then, the metric is measuring the harness and the run is void.
     * the same tumble metric is run again after the pile has settled. It must
       read ~0. A metric that cannot produce both a large and a zero reading is
       not measuring rotation.
     * `groundRescues` is sampled before and after every motion measurement.
       If it moves, something teleported and the numbers are about teleports,
       not physics (the exact failure recorded against the movement probe).
     * step cost is measured with the bodies asleep AND awake. If those two
       numbers are equal, sleeping is not working and the cost figure is not
       the cost of a live pile.

   Usage:  node tools/capture-physics-destruction.mjs
   Output: .tmp/physics-destruction/
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'physics-destruction');
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
let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  say((ok ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '  [' + detail + ']' : ''));
};

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
    typeof resetWorld === 'function' && typeof spawnExplosion === 'function' &&
    typeof mfPhysStep === 'function', { timeout: 120000 });
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
    cam.x = MAP * 0.5; cam.y = MAP * 0.5; camFollow = -1;
    camYaw = yawTarget = 0.22; camPitch = pitchTarget = 1.20;
    orthoSpan = distTarget = 300;
    if (typeof resize === 'function') resize();
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    return { perfScale, budget: mfPhysBudget(), stats: mfPhysStats() };
  });
  say('world ready at perfScale=' + setup.perfScale + '  physics budget=' + setup.budget + ' bodies');

  /* One sim step + one frame, exactly as the game orders them. */
  const step = async (n) => { for (let k = 0; k < n; k++) await page.evaluate(() => {
    const dt = 1 / 30;
    perfScale = 0.4125;                 // re-pin: main.js recomputes it every rAF
    try { unitTick(dt); } catch (e) {}
    try { projTick(dt); } catch (e) {}
    try { beamTick(dt); } catch (e) {}
    try { if (typeof bldTick === 'function') bldTick(dt); } catch (e) {}
    try { if (typeof updParticles === 'function') updParticles(dt); } catch (e) {}
    try { if (typeof shardTick === 'function') shardTick(dt); } catch (e) {}
    render(dt);
  }); };

  await step(6);

  /* Install the tumble probe. It samples each body's own +X axis in WORLD
     space and returns the largest angle any body's axis swept between two
     calls — that is rotation and nothing else. A translating body reads 0. */
  await page.evaluate(() => {
    window.__mfAxis = () => {
      const out = [];
      mfPhysForEach((i, b) => {
        const qx=b.qx,qy=b.qy,qz=b.qz,qw=b.qw;
        const tx=2*(qy*0-qz*0), ty=2*(qz*1-qx*0), tz=2*(qx*0-qy*1);
        out.push([i,
          1+qw*tx+(qy*tz-qz*ty),
          0+qw*ty+(qz*tx-qx*tz),
          0+qw*tz+(qx*ty-qy*tx)]);
      });
      return out;
    };
    window.__mfTumbleSnap = () => { window.__mfSnap = window.__mfAxis(); return window.__mfSnap.length; };
    window.__mfTumbleDelta = () => {
      const prev = window.__mfSnap || [], now = window.__mfAxis();
      const by = new Map(prev.map(r => [r[0], r]));
      let max = 0, n = 0;
      for (const r of now) {
        const p = by.get(r[0]); if (!p) continue;
        const d = Math.max(-1, Math.min(1, p[1]*r[1] + p[2]*r[2] + p[3]*r[3]));
        max = Math.max(max, Math.acos(d)); n++;
      }
      return { maxRad: max, paired: n };
    };
  });

  /* ================= CONTROL 0 — the metric with NOTHING alive ============ */
  const zero = await page.evaluate(() => {
    mfPhysClear();
    window.__mfTumbleSnap();
    return { bodies: mfPhysStats().bodies };
  });
  await step(10);
  const zeroDelta = await page.evaluate(() => ({ d: window.__mfTumbleDelta(), s: mfPhysStats() }));
  check('control: no bodies alive', zero.bodies === 0 && zeroDelta.s.bodies === 0, 'bodies=' + zeroDelta.s.bodies);
  check('control: tumble metric reads 0 with no bodies',
    zeroDelta.d.maxRad === 0 && zeroDelta.d.paired === 0,
    'maxRad=' + zeroDelta.d.maxRad.toFixed(4) + ' paired=' + zeroDelta.d.paired);
  check('control: step cost ~0 with no bodies', zeroDelta.s.stepMs < 0.05, 'stepMs=' + zeroDelta.s.stepMs.toFixed(4));

  /* ================= a real structure, destroyed ========================== */
  const site = await page.evaluate(() => {
    let p = null;
    for (let r = 200; r < MAP * 0.45 && !p; r += 90) {
      for (let a = 0; a < 12; a++) {
        const x = MAP * 0.5 + Math.cos(a * 0.523) * r, y = MAP * 0.5 + Math.sin(a * 0.523) * r;
        if (x < 260 || y < 260 || x > MAP - 260 || y > MAP - 260) continue;
        const civic = typeof cityGroundAt === 'function' && cityGroundAt(x, y) >= 1;
        if (!civic && isWalkable(x, y)) { p = [x, y]; break; }
      }
    }
    if (!p) return null;
    window.__mfSite = p;
    cam.x = p[0]; cam.y = p[1];
    camPitch = pitchTarget = 1.20; orthoSpan = distTarget = 170;
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    const B = addBld('fac', 1, p[0], p[1], true);
    const bi = (typeof B === 'number') ? B : blds.indexOf(B);
    window.__mfBld = bi;
    return { x: Math.round(p[0]), y: Math.round(p[1]), bi, alive: blds[bi] && blds[bi].alive };
  });
  if (!site) throw new Error('no open non-civic ground on this map');
  say('site: ' + site.x + ',' + site.y + '  bld idx=' + site.bi + ' alive=' + site.alive);

  /* ============== deterministic/bounded presentation contracts ========== */
  const contracts = await page.evaluate(() => {
    const p = window.__mfSite, dt = 1 / 30;
    const runSeeded = () => {
      mfPhysClear(); MFPhys.seed(0x51c0ffee);
      mfPhysCollapse(p[0] + 70, p[1], 52, { count: 99, ttl: 60 });
      for (let k = 0; k < 12; k++) mfPhysStep(dt);
      return MFPhys.probe();
    };
    const seededA = runSeeded(), seededB = runSeeded();

    mfPhysClear(); MFPhys.seed(0x12345678);
    mfPhysCollapse(p[0] + 70, p[1], 52, { count: 3, ttl: 60 });
    const pauseHashA = MFPhys.stateHash();
    paused = true;
    for (let k = 0; k < 50; k++) mfPhysEmit();
    const pauseHashB = MFPhys.stateHash(), pausedProbe = MFPhys.probe();
    paused = false;

    perfScale = 1; mfPhysClear();
    for (let k = 0; k < 80; k++)
      mfPhysSpawn(p[0] + (k % 10) * 2, p[1] + ((k / 10) | 0) * 2, terrainH(p[0], p[1]) + 30,
        { hx: 1, hy: 1, hz: 1, ttl: 60, chunks: 1 });
    const highBodies = mfPhysStats().bodies;
    perfScale = 0.30; mfPhysStep(dt);
    const trimmedProbe = MFPhys.probe();
    perfScale = 0.4125; mfPhysClear();
    return { seededA, seededB, pauseHashA, pauseHashB, pausedProbe, highBodies, trimmedProbe };
  });
  check('private seeded destruction is deterministic',
    contracts.seededA.stateHash === contracts.seededB.stateHash,
    contracts.seededA.stateHash + ' === ' + contracts.seededB.stateHash);
  check('collapse requests are clamped to one 1-3 slab group',
    contracts.seededA.layerBounded && contracts.seededA.maxGroup <= 3 && contracts.seededA.groupClamps > 0,
    'maxGroup=' + contracts.seededA.maxGroup + ' clamps=' + contracts.seededA.groupClamps);
  check('paused renders emit no rubble and preserve physics state',
    contracts.pauseHashA === contracts.pauseHashB && contracts.pausedProbe.pausedEmitSkips === 50 &&
      contracts.pausedProbe.emittedChunks === 0,
    'hash ' + contracts.pauseHashA + ' -> ' + contracts.pauseHashB +
      ', skips=' + contracts.pausedProbe.pausedEmitSkips + ', chunks=' + contracts.pausedProbe.emittedChunks);
  check('quality downgrade trims an already-live pool to its new budget',
    contracts.highBodies > contracts.trimmedProbe.budget && contracts.trimmedProbe.withinBudget &&
      contracts.trimmedProbe.budgetTrims > 0,
    contracts.highBodies + ' -> ' + contracts.trimmedProbe.bodies + '/' + contracts.trimmedProbe.budget +
      ', trims=' + contracts.trimmedProbe.budgetTrims);

  await step(3);
  await page.screenshot({ path: join(outDir, '0-structure-intact.png') });

  const before = await page.evaluate(() => ({
    rescues: (typeof groundRescues !== 'undefined') ? groundRescues : -1,
    rockN: (typeof FX !== 'undefined' && FX.rock) ? FX.rock.n : -1
  }));

  const kill = await page.evaluate(() => {
    perfScale = 0.4125;
    const bi = window.__mfBld;
    blds[bi].hp = 1;
    damageBld(bi, 999999, 0);
    window.__mfTumbleSnap();
    return { alive: blds[bi].alive, fallT: blds[bi].fallT, stats: mfPhysStats() };
  });
  check('structure died and produced rigid bodies',
    kill.alive === false && kill.stats.bodies > 0,
    'alive=' + kill.alive + ' bodies=' + kill.stats.bodies);
  say('collapse: ' + JSON.stringify(kill.stats));

  /* Two frames in — pieces are still in the air. LOW camera (PITCH_MIN=1.05
     is the lowest the camera can go) so the arcs are seen from the side. */
  await page.evaluate(() => { camPitch = pitchTarget = 1.05; orthoSpan = distTarget = 150;
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices(); });
  await step(2);
  const air = await page.evaluate(() => {
    const d = window.__mfTumbleDelta();
    let airborne = 0, maxSpin = 0, maxAbove = 0;
    mfPhysForEach((i, b) => {
      const g = terrainH(b.x, b.y);
      if (b.z - g > 1.0) airborne++;
      maxAbove = Math.max(maxAbove, b.z - g);
      maxSpin = Math.max(maxSpin, Math.abs(b.wx) + Math.abs(b.wy) + Math.abs(b.wz));
    });
    return { d, airborne, maxSpin, maxAbove, s: mfPhysStats(),
             rockN: FX.rock ? FX.rock.n : -1,
             rescues: (typeof groundRescues !== 'undefined') ? groundRescues : -1 };
  });
  await page.screenshot({ path: join(outDir, '1-collapse-airborne-low-angle.png') });
  check('pieces are genuinely airborne', air.airborne > 0, 'airborne=' + air.airborne + ' maxAbove=' + air.maxAbove.toFixed(1) + 'wu');
  check('pieces carry real angular velocity', air.maxSpin > 1.0, 'max|w|=' + air.maxSpin.toFixed(2) + ' rad/s');
  check('orientation actually changed between frames (TUMBLE)',
    air.d.maxRad > 0.15 && air.d.paired > 0,
    'maxRad=' + air.d.maxRad.toFixed(3) + ' over ' + air.d.paired + ' bodies, 2 frames');
  check('render emit reached the instanced stream',
    air.s.chunks > 0, 'chunks=' + air.s.chunks + ' FX.rock.n=' + air.rockN);
  check('groundRescues did not move during the motion measurement',
    air.rescues === before.rescues, before.rescues + ' -> ' + air.rescues);

  /* ---- explosion impulse on the falling pile ----------------------------- */
  await step(4);
  const impulse = await page.evaluate(() => {
    const p = window.__mfSite;
    const pre = [];
    mfPhysForEach((i, b) => pre.push([i, b.vx, b.vy, b.vz, b.wx, b.wy, b.wz]));
    const g = terrainH(p[0], p[1]);
    const hit = mfPhysImpulse(p[0], p[1], g + 4, 90, 26);
    const by = new Map(pre.map(r => [r[0], r]));
    let maxDV = 0, maxDW = 0, woken = 0;
    mfPhysForEach((i, b) => {
      const q = by.get(i); if (!q) return;
      maxDV = Math.max(maxDV, Math.hypot(b.vx - q[1], b.vy - q[2], b.vz - q[3]));
      maxDW = Math.max(maxDW, Math.hypot(b.wx - q[4], b.wy - q[5], b.wz - q[6]));
      if (!b.asleep) woken++;
    });
    return { hit, maxDV, maxDW, woken };
  });
  check('explosion delivers a real linear impulse', impulse.hit > 0 && impulse.maxDV > 5,
    'bodies hit=' + impulse.hit + ' max dV=' + impulse.maxDV.toFixed(1) + ' wu/s');
  check('explosion delivers real TORQUE (off-centre impulse)', impulse.maxDW > 0.5,
    'max dW=' + impulse.maxDW.toFixed(2) + ' rad/s');
  await step(2);
  await page.screenshot({ path: join(outDir, '2-explosion-impulse-low-angle.png') });

  /* ---- settle ------------------------------------------------------------ */
  const rescuesPreSettle = await page.evaluate(() => (typeof groundRescues !== 'undefined') ? groundRescues : -1);
  await step(150);                       // 5 s of sim
  const settled = await page.evaluate(() => {
    let onGround = 0, worst = 0, n = 0;
    mfPhysForEach((i, b) => {
      const g = terrainH(b.x, b.y);
      const clear = b.z - g;
      const halfDiag = Math.hypot(b.hx, b.hy, b.hz);
      if (clear < halfDiag + 0.6 && clear > -halfDiag - 0.6) onGround++;
      worst = Math.max(worst, Math.abs(clear));
      n++;
    });
    window.__mfTumbleSnap();
    return { onGround, worst, n, s: mfPhysStats(),
             rescues: (typeof groundRescues !== 'undefined') ? groundRescues : -1 };
  });
  await step(30);                        // another second, with nothing pushing
  const restDelta = await page.evaluate(() => ({ d: window.__mfTumbleDelta(), s: mfPhysStats() }));
  check('pieces came to rest ON the terrain', settled.n > 0 && settled.onGround === settled.n,
    settled.onGround + '/' + settled.n + ' resting, worst clearance ' + settled.worst.toFixed(2) + 'wu');
  check('pieces went to SLEEP', settled.s.asleep > 0 && restDelta.s.awake === 0,
    'asleep=' + settled.s.asleep + ' awake=' + restDelta.s.awake);
  check('CONTROL: the same tumble metric now reads ~0 (settled, not measuring noise)',
    restDelta.d.maxRad < 0.02 && restDelta.d.paired > 0,
    'maxRad=' + restDelta.d.maxRad.toFixed(4) + ' over ' + restDelta.d.paired + ' bodies, 30 frames');
  check('groundRescues did not move during the settle measurement',
    settled.rescues === rescuesPreSettle, rescuesPreSettle + ' -> ' + settled.rescues);

  await page.evaluate(() => { camPitch = pitchTarget = 1.05; orthoSpan = distTarget = 110;
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices(); });
  await step(2);
  await page.screenshot({ path: join(outDir, '3-settled-rubble-low-angle.png') });
  await page.evaluate(() => { camPitch = pitchTarget = 1.50; orthoSpan = distTarget = 150;
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices(); });
  await step(2);
  await page.screenshot({ path: join(outDir, '4-settled-rubble-top-down.png') });

  /* ================= STEP COST at the device profile ====================== */
  const cost = await page.evaluate(() => {
    perfScale = 0.4125;
    const p = window.__mfSite;
    const dt = 1 / 30;
    /* Fill to the budget, measure AWAKE, let the same field settle, measure
       ASLEEP. Same bodies both times, so the delta is sleep and nothing else. */
    mfPhysClear();
    for (let k = 0; k < 40 && mfPhysStats().bodies < mfPhysBudget(); k++)
      mfPhysCollapse(p[0] + (k % 7) * 26 - 78, p[1] + ((k / 7) | 0) * 26 - 78, 52, { ttl: 600 });
    const full = mfPhysStats().bodies;
    /* Two warm-up steps so the first-touch page faults are not in the sample. */
    mfPhysStep(dt); mfPhysStep(dt);
    t0 = performance.now();
    for (let k = 0; k < 200; k++) mfPhysStep(dt);
    const awakeMs = (performance.now() - t0) / 200;
    const afterStats = mfPhysStats();
    /* Same field, now settled. TTLs are 24-34 s so nothing expires here. */
    for (let k = 0; k < 420; k++) mfPhysStep(dt);
    const settledStats = mfPhysStats();
    t0 = performance.now();
    for (let k = 0; k < 400; k++) mfPhysStep(dt);
    const sleepingMs = (performance.now() - t0) / 400;
    const sleepingBodies = settledStats.bodies;

    /* Emit cost, separately: it is per-frame, not per-step. Measured on the
       SETTLED field, which is the steady state a player actually looks at. */
    t0 = performance.now();
    for (let k = 0; k < 200; k++) mfPhysEmit();
    const emitMs = (performance.now() - t0) / 200;
    const chunks = mfPhysStats().chunks;
    if (!chunks) console.warn('emit measured 0 chunks - the field expired, the number is void');
    return { sleepingMs, sleepingBodies, awakeMs, full, emitMs, chunks,
             awakeAfter: afterStats.awake, stillAwake: settledStats.awake,
             budget: mfPhysBudget() };
  });
  say('');
  say('--- STEP COST at perfScale 0.4125 (budget ' + cost.budget + ' bodies) ---');
  say('  ' + cost.full + ' bodies AWAKE  : ' + cost.awakeMs.toFixed(3) + ' ms / sim step'
    + '  (' + (cost.awakeMs / 33.33 * 100).toFixed(2) + '% of a 30fps frame)');
  say('  ' + cost.sleepingBodies + ' bodies ASLEEP : ' + cost.sleepingMs.toFixed(3) + ' ms / sim step  (same field, settled; ' + cost.stillAwake + ' still awake)');
  say('  render emit         : ' + cost.emitMs.toFixed(3) + ' ms / frame for ' + cost.chunks + ' chunk instances');
  say('  30 fps budget = 33.33 ms/frame; the sim takes at most 3 steps per frame.');
  say('  worst case 3 steps + 1 emit = ' + (cost.awakeMs * 3 + cost.emitMs).toFixed(3) + ' ms ('
    + ((cost.awakeMs * 3 + cost.emitMs) / 33.33 * 100).toFixed(2) + '% of frame)');
  check('CONTROL: sleeping costs materially less than awake (sleep is real)',
    cost.sleepingMs < cost.awakeMs * 0.5,
    'asleep ' + cost.sleepingMs.toFixed(3) + ' ms vs awake ' + cost.awakeMs.toFixed(3) + ' ms');
  check('worst-case physics cost is inside the 30fps budget',
    (cost.awakeMs * 3 + cost.emitMs) < 33.33 * 0.10,
    (cost.awakeMs * 3 + cost.emitMs).toFixed(3) + ' ms < 3.33 ms (10% of frame)');
  check('budget is enforced', cost.full <= cost.budget, cost.full + ' <= ' + cost.budget);

  /* A last shot of the full awake field, low angle, so the density reads.
     Guarded: the renderer died here once after 1400+ stepped frames, and a
     driver death after every check has passed must not discard the run. */
  try {
  await page.evaluate(() => { cam.x = window.__mfSite[0]; cam.y = window.__mfSite[1];
    camPitch = pitchTarget = 1.05; orthoSpan = distTarget = 300;
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices(); });
  await step(8);
  await page.screenshot({ path: join(outDir, '5-full-budget-field-low-angle.png') });
  await step(70);
  await page.screenshot({ path: join(outDir, '6-full-budget-settled-low-angle.png') });
  } catch (e) { say('final field shots skipped: ' + String(e.message).slice(0, 90)); }

  say('');
  say('page errors: ' + (errs.length ? errs.slice(0, 6).join(' | ') : 'none'));
  check('no page errors', errs.length === 0, errs.length + ' errors');
  say('');
  say(failures ? ('*** ' + failures + ' CHECK(S) FAILED ***') : 'ALL CHECKS PASSED');
  await writeFile(join(outDir, 'log.txt'), log.join('\n'), 'utf8');
  await page.close();
} catch (e) {
  say('FATAL ' + e.message + '\n' + (e.stack || ''));
  await writeFile(join(outDir, 'log.txt'), log.join('\n'), 'utf8');
} finally {
  await closePwBrowser();
  /* close() alone only stops NEW connections — Chrome's keep-alive sockets to
     this server keep the event loop alive, so the process wrote every result
     and then hung forever. Two runs had to be killed externally after they had
     already passed. Destroy the live sockets, then exit explicitly: by this
     point log.txt and every screenshot are already flushed to disk. */
  server.closeAllConnections();
  server.close();
}
console.log('output: ' + outDir);
process.exit(failures ? 1 : 0);
