#!/usr/bin/env node
/*
 * Current-source debris pressure / determinism probe.
 *
 * This is deliberately a verification tool, not a gameplay patch. It binds
 * evidence to the exact physics.js + sim.js bytes served to Chromium, forces a
 * 160 -> 96 quality-tier transition so mfPhysTrimToBudget cannot false-pass,
 * runs a three-minute fixed-step pressure simulation, measures camera-aware
 * rigid and legacy type-7 retirement, and proves whether the macro recipe's
 * emergency legacy fallback avoids global Math.random().
 */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const startedAt = new Date();
const runLabel = (process.argv[2] || startedAt.toISOString().replace(/[:.]/g, '-'))
  .replace(/[^a-z0-9_-]/gi, '-');
const outDir = join(root, '.tmp', 'debris-pressure', runLabel);
await mkdir(outDir, { recursive: true });

const SOURCE_PATHS = [
  'src/engine/physics.js',
  'src/game/sim.js',
  'assets/data/manifest.json',
  'boot.js'
];
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.glb': 'model/gltf-binary',
  '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm'
};

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function settleWithin(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise).then(() => true, () => true),
      new Promise(resolveTimeout => { timer = setTimeout(() => resolveTimeout(false), ms); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sourceSnapshot() {
  const files = {};
  for (const rel of SOURCE_PATHS) {
    const data = await readFile(join(root, rel));
    files[rel] = { bytes: data.length, sha256: sha256(data) };
  }
  const physicsText = await readFile(join(root, 'src/engine/physics.js'), 'utf8');
  const simText = await readFile(join(root, 'src/game/sim.js'), 'utf8');
  const findLine = (text, needle) => {
    const i = text.indexOf(needle);
    return i < 0 ? null : text.slice(0, i).split(/\r?\n/).length;
  };
  let head = 'UNKNOWN', status = '';
  try {
    head = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
    status = (await execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
      cwd: root, maxBuffer: 64 * 1024 * 1024
    })).stdout;
  } catch {}
  return {
    head,
    dirty: status.length > 0,
    dirtyEntryCount: status.split(/\r?\n/).filter(Boolean).length,
    worktreeStatusSha256: sha256(status),
    files,
    sourceLocations: {
      budget: { file: 'src/engine/physics.js', line: findLine(physicsText, 'function mfPhysBudget()') },
      trim: { file: 'src/engine/physics.js', line: findLine(physicsText, 'function mfPhysTrimToBudget()') },
      legacyAge: { file: 'src/game/sim.js', line: findLine(simText, 'if(tp===7){') },
      emergencyRandom: { file: 'src/game/sim.js', line: findLine(simText, 'sp=(strategic?26:15)+Math.random()') }
    }
  };
}

const beforeSource = await sourceSnapshot();
const manifest = JSON.parse(await readFile(join(root, 'assets/data/manifest.json'), 'utf8'));
const order = Array.isArray(manifest.order) ? manifest.order : [];

const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    if (pathname === '/') pathname = '/index.html';
    const file = resolve(join(root, pathname));
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404); res.end('not found'); return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500); res.end(String(error && error.message || error));
  }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/?fxprobe=1&debrispressure=1`;

/* Do not attach this long pressure run to another agent's QA browser. Reserve
 * a fresh loopback port before importing pw-browser.mjs (it reads the env at
 * module load), while still using the project's mandatory browser lifecycle. */
const cdpPort = await new Promise((resolvePort, rejectPort) => {
  const reservation = createServer();
  reservation.once('error', rejectPort);
  reservation.listen(0, '127.0.0.1', () => {
    const value = reservation.address().port;
    reservation.close(error => error ? rejectPort(error) : resolvePort(value));
  });
});
if (!process.env.PW_CDP && !process.env.PW_CDP_PORT) process.env.PW_CDP_PORT = String(cdpPort);
const { launchPwBrowser, closePwBrowser, killProjectChromium } = await import('./pw-browser.mjs');

let page;
let report;
const pageErrors = [];
try {
  const browser = await launchPwBrowser({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox']
  });
  page = await browser.newPage({
    viewport: { width: 900, height: 700 }, deviceScaleFactor: 1, colorScheme: 'dark'
  });
  page.on('pageerror', error => pageErrors.push(String(error && error.stack || error)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mf_ap_gate_closed', '1');
      localStorage.setItem('mf_ap_dismissed', '1');
      localStorage.setItem('mf_offline', '1');
      localStorage.setItem('mf_prealpha_cinematic_v2', 'test-seen');
      localStorage.setItem('mf_auth_gate_v1', '1');
    } catch {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() =>
    typeof resetWorld === 'function' && typeof MFPhys === 'object' &&
    typeof MFPhys.step === 'function' && typeof mfEmitMacroFx === 'function' &&
    typeof updParticles === 'function' && typeof render === 'function' &&
    typeof heightF !== 'undefined' && heightF && typeof terrainTex !== 'undefined' && terrainTex,
  null, { timeout: 120000 });

  const browserResult = await page.evaluate(async sourcePaths => {
    const digest = async path => {
      const response = await fetch('/' + path, { cache: 'no-store' });
      if (!response.ok) return { ok: false, status: response.status, sha256: null, bytes: 0 };
      const bytes = await response.arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return {
        ok: true, status: response.status, bytes: bytes.byteLength,
        sha256: [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('')
      };
    };
    const servedSources = {};
    for (const path of sourcePaths) servedSources[path] = await digest(path);

    try { if (typeof stopAttract === 'function') stopAttract(); } catch {}
    attractOn = false; demoMode = false; matchLive = true; fogOn = false;
    resetWorld();
    running = false; paused = false; gameEnded = false;
    if (typeof META !== 'undefined' && META.settings) {
      META.settings.quality = 'medium'; META.settings.fog = false; META.settings.dayNight = false;
    }
    if (typeof applySettings === 'function') applySettings();
    perfScale = 0.4125;

    let site = null;
    for (let radius = 120; radius < MAP * .42 && !site; radius += 70) {
      for (let k = 0; k < 16; k++) {
        const a = k * Math.PI * 2 / 16;
        const x = MAP * .5 + Math.cos(a) * radius;
        const y = MAP * .5 + Math.sin(a) * radius;
        if (x > 180 && y > 180 && x < MAP - 180 && y < MAP - 180 && isWalkable(x, y)) {
          site = [x, y]; break;
        }
      }
    }
    if (!site) site = [MAP * .5, MAP * .5];
    cam.x = site[0]; cam.y = site[1]; camFollow = -1;
    camYaw = yawTarget = .22; camPitch = pitchTarget = 1.2;
    orthoSpan = distTarget = 320;
    if (typeof resize === 'function') resize();
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();

    const canvas = document.getElementById('gl');
    const gl2 = canvas && canvas.getContext('webgl2');
    let gpu = { webgl2: !!gl2, vendor: 'UNKNOWN', renderer: 'UNKNOWN', version: 'UNKNOWN' };
    if (gl2) {
      const ext = gl2.getExtension('WEBGL_debug_renderer_info');
      gpu = {
        webgl2: true,
        vendor: ext ? gl2.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl2.getParameter(gl2.VENDOR),
        renderer: ext ? gl2.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl2.getParameter(gl2.RENDERER),
        version: gl2.getParameter(gl2.VERSION)
      };
    }

    const dt = 1 / 30;
    const percentile = (values, p) => {
      if (!values.length) return 0;
      const sorted = values.slice().sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
    };
    const mean = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const fnv = values => {
      let h = 2166136261 >>> 0;
      for (const value of values) {
        const s = String(value);
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0;
        }
        h ^= 124; h = Math.imul(h, 16777619) >>> 0;
      }
      return h.toString(16).padStart(8, '0');
    };
    const liveHandles = () => {
      const handles = [];
      MFPhys.forEach((i, body) => handles.push([i, body.life.toFixed(5), body.asleep ? 1 : 0]));
      return handles;
    };
    const hasHandle = handle => {
      let found = false;
      MFPhys.forEach(i => { if (i === handle) found = true; });
      return found;
    };
    const spawnGrid = (count, seed, ttl = 600) => {
      MFPhys.clear(); MFPhys.seed(seed); perfScale = 1;
      const ground = mfPhysGround(site[0], site[1]);
      const handles = [];
      for (let i = 0; i < count; i++) {
        const col = i % 16, row = (i / 16) | 0;
        handles.push(MFPhys.spawn(
          site[0] + (col - 7.5) * 2.4,
          site[1] + (row - 4.5) * 2.4,
          ground + 90 + (i % 5),
          { hx: 1.1, hy: .8, hz: .65, vx: 1.25, vy: -.75, vz: .25,
            wx: 1.2, wy: -.8, wz: .55, ttl, chunks: 1 }
        ));
      }
      return handles;
    };

    /* A real >96 state: allocate at the 224 tier, then lower perfScale. */
    const runTrimRepeat = seed => {
      const requested = 160;
      const handles = spawnGrid(requested, seed);
      const highStats = MFPhys.stats();
      const highChunks = MFPhys.emit();
      perfScale = .4125;
      const targetBudget = MFPhys.budget();
      const overBudgetBeforeStep = MFPhys.stats().bodies > targetBudget;
      const t0 = performance.now();
      MFPhys.step(dt);
      const trimStepMs = performance.now() - t0;
      const after = MFPhys.probe();
      const afterChunks = MFPhys.emit();
      const survivors = liveHandles();
      const survivorHash = fnv(survivors.flat());
      const stepCosts = [];
      for (let i = 0; i < 300; i++) {
        const a = performance.now(); MFPhys.step(dt); stepCosts.push(performance.now() - a);
      }
      const final = MFPhys.probe();
      return {
        requested, admitted: handles.filter(h => h >= 0).length,
        highBudget: highStats.budget, highBodies: highStats.bodies, highChunks,
        targetBudget, overBudgetBeforeStep, trimStepMs,
        afterBodies: after.bodies, afterChunks, trimCount: after.budgetTrims,
        retiredCount: after.retired, stateHashAfterTrim: after.stateHash,
        survivorHash, firstSurvivor: survivors[0] && survivors[0][0],
        lastSurvivor: survivors.at(-1) && survivors.at(-1)[0],
        postTrimTickMeanMs: mean(stepCosts), postTrimTickP95Ms: percentile(stepCosts, .95),
        finalBodies: final.bodies, finalStateHash: final.stateHash,
        finite: final.finite, withinBudget: final.withinBudget
      };
    };
    const trimA = runTrimRepeat(0x51c0ffee);
    const trimB = runTrimRepeat(0x51c0ffee);

    /* Camera-aware retirement with identical authored TTLs. */
    const runRigidRetirement = seed => {
      MFPhys.clear(); MFPhys.seed(seed); perfScale = .4125;
      const ground = mfPhysGround(site[0], site[1]);
      const far = [Math.min(MAP - 120, site[0] + 1050), Math.min(MAP - 120, site[1] + 850)];
      const nearId = MFPhys.spawn(site[0], site[1], ground + 15,
        { hx: 1, hy: 1, hz: 1, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, ttl: 10, chunks: 1 });
      const farId = MFPhys.spawn(far[0], far[1], mfPhysGround(far[0], far[1]) + 15,
        { hx: 1, hy: 1, hz: 1, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, ttl: 10, chunks: 1 });
      const initial = {};
      MFPhys.forEach((i, body) => { initial[i] = { life: body.life, ttl: body.ttl }; });
      let nearTick = null, farTick = null;
      const timeline = [];
      for (let tick = 1; tick <= 900 && (nearTick === null || farTick === null); tick++) {
        MFPhys.step(dt);
        const nearAlive = hasHandle(nearId), farAlive = hasHandle(farId);
        if (!nearAlive && nearTick === null) nearTick = tick;
        if (!farAlive && farTick === null) farTick = tick;
        timeline.push(`${tick}:${nearAlive ? 1 : 0}${farAlive ? 1 : 0}`);
      }
      return {
        nearId, farId, initialNearTTL: initial[nearId] && initial[nearId].ttl,
        initialFarTTL: initial[farId] && initial[farId].ttl,
        nearRetireTick: nearTick, farRetireTick: farTick,
        nearRetireSeconds: nearTick === null ? null : nearTick * dt,
        farRetireSeconds: farTick === null ? null : farTick * dt,
        timelineHash: fnv(timeline), probe: MFPhys.probe()
      };
    };
    const rigidRetireA = runRigidRetirement(0x9e3779b9);
    const rigidRetireB = runRigidRetirement(0x9e3779b9);

    const clearLegacy = () => {
      for (let i = 0; i < MAXPART; i++) {
        flife[i] = 0; ftype[i] = 0; fowner[i] = 0;
        fpz[i] = 0; fpvz[i] = 0; fpbnc[i] = 0;
      }
      fHead = 0; fCount = 0;
      if (typeof fownerSlot !== 'undefined' && fownerSlot.fill) fownerSlot.fill(-1);
    };
    const countLegacy7 = () => {
      let n = 0;
      for (let i = 0; i < MAXPART; i++) if (flife[i] > 0 && ftype[i] === 7) n++;
      return n;
    };
    const runLegacyRetirement = () => {
      MFPhys.clear(); clearLegacy(); perfScale = .4125;
      const far = [Math.min(MAP - 120, site[0] + 1050), Math.min(MAP - 120, site[1] + 850)];
      addDebris(site[0], site[1], 8, 4, 65, 1.8, 3, 90, 80, 70);
      const nearSlot = (fHead - 1 + MAXPART) % MAXPART;
      addDebris(far[0], far[1], 8, 4, 65, 1.8, 3, 90, 80, 70);
      const farSlot = (fHead - 1 + MAXPART) % MAXPART;
      let nearTick = null, farTick = null;
      const timeline = [];
      const tickCosts = [];
      for (let tick = 1; tick <= 240 && (nearTick === null || farTick === null); tick++) {
        const t0 = performance.now(); updParticles(dt); tickCosts.push(performance.now() - t0);
        const nearAlive = flife[nearSlot] > 0 && ftype[nearSlot] === 7;
        const farAlive = flife[farSlot] > 0 && ftype[farSlot] === 7;
        if (!nearAlive && nearTick === null) nearTick = tick;
        if (!farAlive && farTick === null) farTick = tick;
        timeline.push(`${tick}:${nearAlive ? flife[nearSlot].toFixed(5) : 0}:${farAlive ? flife[farSlot].toFixed(5) : 0}`);
      }
      return {
        initialCount: 2, finalCount: countLegacy7(), nearSlot, farSlot,
        nearRetireTick: nearTick, farRetireTick: farTick,
        nearRetireSeconds: nearTick === null ? null : nearTick * dt,
        farRetireSeconds: farTick === null ? null : farTick * dt,
        tickMeanMs: mean(tickCosts), tickP95Ms: percentile(tickCosts, .95),
        timelineHash: fnv(timeline)
      };
    };
    const legacyRetireA = runLegacyRetirement();
    const legacyRetireB = runLegacyRetirement();

    /* Three simulated minutes of sustained real physics event APIs. */
    MFPhys.clear(); MFPhys.seed(0xd3b2155); clearLegacy(); perfScale = .4125;
    const pressureTicks = 180 * 30;
    let peakBodies = 0, peakChunks = 0, atBudgetTicks = 0, overBudgetTicks = 0;
    let acceptedPieces = 0, rejectedEvents = 0;
    const pressureStepCosts = [], renderCosts = [], samples = [];
    for (let tick = 0; tick < pressureTicks; tick++) {
      if ((tick % 2) === 0) {
        const event = (tick / 2) | 0, angle = event * 2.399963229728653;
        const offscreen = event % 5 === 4;
        const radius = offscreen ? 900 + (event % 7) * 35 : 25 + (event % 9) * 7;
        const x = site[0] + Math.cos(angle) * radius;
        const y = site[1] + Math.sin(angle) * radius;
        const made = event % 4 === 0
          ? MFPhys.collapse(x, y, 42 + (event % 3) * 6, { count: 3, ttl: 60 })
          : MFPhys.burst(x, y, mfPhysGround(x, y) + 18, 32, { count: 3, ttl: 60, chunks: 1 });
        acceptedPieces += made;
        if (!made) rejectedEvents++;
      }
      const t0 = performance.now(); MFPhys.step(dt); pressureStepCosts.push(performance.now() - t0);
      const stats = MFPhys.stats();
      peakBodies = Math.max(peakBodies, stats.bodies);
      if (stats.bodies === stats.budget) atBudgetTicks++;
      if (stats.bodies > stats.budget) overBudgetTicks++;
      if (tick % 30 === 0) {
        const r0 = performance.now(); render(0); renderCosts.push(performance.now() - r0);
        const afterRender = MFPhys.stats(); peakChunks = Math.max(peakChunks, afterRender.chunks);
        samples.push({ second: tick / 30, bodies: afterRender.bodies, awake: afterRender.awake,
          asleep: afterRender.asleep, chunks: afterRender.chunks, budget: afterRender.budget });
      }
    }
    const pressureProbe = MFPhys.probe();
    const pressure = {
      simulatedSeconds: 180, ticks: pressureTicks, eventIntervalTicks: 2,
      acceptedPieces, rejectedEvents, peakBodies, peakChunks,
      atBudgetTickCount: atBudgetTicks, overBudgetTickCount: overBudgetTicks,
      atBudgetTickPct: atBudgetTicks / pressureTicks * 100,
      tickMeanMs: mean(pressureStepCosts), tickP95Ms: percentile(pressureStepCosts, .95),
      renderCpuMeanMs: mean(renderCosts), renderCpuP95Ms: percentile(renderCosts, .95),
      probe: pressureProbe, samples
    };

    /* Fill the 96-body tier, then call the real authoritative macro recipe. */
    MFPhys.clear(); MFPhys.seed(0xa11ce); clearLegacy(); perfScale = .4125;
    const fallbackGround = mfPhysGround(site[0], site[1]);
    for (let i = 0; i < MFPhys.budget(); i++) {
      MFPhys.spawn(site[0] + (i % 12) * 2, site[1] + ((i / 12) | 0) * 2,
        fallbackGround + 12, { hx: .8, hy: .7, hz: .6, ttl: 60, chunks: 1 });
    }
    const beforeFallback = MFPhys.probe();
    if (typeof mfMacroFxResetTelemetry === 'function') mfMacroFxResetTelemetry();
    const originalRandom = Math.random;
    const originalAddDebris = addDebris;
    let randomCalls = 0;
    const randomStacks = [], legacyEntryRandomCounts = [];
    Math.random = function instrumentedRandom() {
      randomCalls++;
      if (randomStacks.length < 16) randomStacks.push(String(new Error().stack || '').split('\n').slice(1, 5));
      return (Math.imul(randomCalls, 2654435761) >>> 0) / 4294967296;
    };
    addDebris = function instrumentedAddDebris(...args) {
      legacyEntryRandomCounts.push(randomCalls);
      return originalAddDebris(...args);
    };
    let fallbackEventId = null, fallbackError = null;
    try {
      fallbackEventId = mfEmitMacroFx(MF_MACRO_FX_EXPLOSIVE, site[0], site[1], {
        size: 24, faction: 'nova', weaponClass: 'probe-budget-full', shock: false,
        debrisCount: 3, debrisTrails: false
      });
    } catch (error) {
      fallbackError = String(error && error.stack || error);
    } finally {
      addDebris = originalAddDebris;
      Math.random = originalRandom;
    }
    const afterFallback = MFPhys.probe();
    const fallbackTelemetry = typeof mfMacroFxTelemetry === 'function' ? mfMacroFxTelemetry() : null;
    const entryDeltas = legacyEntryRandomCounts.map((value, index) =>
      index === 0 ? value : value - legacyEntryRandomCounts[index - 1]);
    const fallback = {
      eventId: fallbackEventId, error: fallbackError,
      rigidBodiesBefore: beforeFallback.bodies, rigidBodiesAfter: afterFallback.bodies,
      rigidSpawnsBefore: beforeFallback.spawns, rigidSpawnsAfter: afterFallback.spawns,
      legacyType7After: countLegacy7(), randomCalls, legacyEntryRandomCounts, entryDeltas,
      stackMentionsMacroRecipe: randomStacks.some(lines => lines.some(line => /mfEmitMacroFx/.test(line))),
      randomStacks, telemetry: fallbackTelemetry && fallbackTelemetry.last
    };

    return {
      servedSources,
      environment: {
        url: location.href, userAgent: navigator.userAgent,
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        graphicsPreset: META && META.settings ? META.settings.quality : 'UNKNOWN',
        targetPerfScale: .4125, site, map: typeof curMap === 'string' ? curMap : 'UNKNOWN', gpu
      },
      trim: { repeatA: trimA, repeatB: trimB },
      rigidRetirement: { repeatA: rigidRetireA, repeatB: rigidRetireB },
      legacyRetirement: { repeatA: legacyRetireA, repeatB: legacyRetireB },
      pressure, fallback
    };
  }, SOURCE_PATHS);

  const afterSource = await sourceSnapshot();
  const assertions = [];
  const check = (id, pass, detail) => assertions.push({ id, pass: !!pass, detail });
  const trimA = browserResult.trim.repeatA, trimB = browserResult.trim.repeatB;
  const rigidA = browserResult.rigidRetirement.repeatA;
  const rigidB = browserResult.rigidRetirement.repeatB;
  const legacyA = browserResult.legacyRetirement.repeatA;
  const legacyB = browserResult.legacyRetirement.repeatB;
  const pressure = browserResult.pressure;
  const fallback = browserResult.fallback;

  for (const rel of SOURCE_PATHS) {
    check(`served-source-${rel}`,
      browserResult.servedSources[rel].ok &&
      browserResult.servedSources[rel].sha256 === beforeSource.files[rel].sha256,
      `${browserResult.servedSources[rel].sha256} == ${beforeSource.files[rel].sha256}`);
  }
  check('source-stable-during-run',
    sha256(JSON.stringify(beforeSource.files)) === sha256(JSON.stringify(afterSource.files)),
    `${sha256(JSON.stringify(beforeSource.files))} == ${sha256(JSON.stringify(afterSource.files))}`);
  check('manifest-loads-physics-before-sim',
    order.indexOf('src/engine/physics.js') >= 0 &&
    order.indexOf('src/engine/physics.js') < order.indexOf('src/game/sim.js'),
    `physics=${order.indexOf('src/engine/physics.js')} sim=${order.indexOf('src/game/sim.js')}`);
  check('hardware-webgl2', browserResult.environment.gpu.webgl2 &&
    !/swiftshader|software/i.test(browserResult.environment.gpu.renderer),
    browserResult.environment.gpu.renderer);
  check('trim-input-exceeds-target-budget', trimA.highBodies > trimA.targetBudget && trimA.highBodies > 96,
    `${trimA.highBodies} > ${trimA.targetBudget}`);
  check('trim-reclaims-to-budget', trimA.afterBodies === trimA.targetBudget &&
    trimA.trimCount === trimA.highBodies - trimA.targetBudget && trimA.withinBudget,
    `${trimA.highBodies} -> ${trimA.afterBodies}; trims=${trimA.trimCount}`);
  check('trim-is-deterministic', trimA.stateHashAfterTrim === trimB.stateHashAfterTrim &&
    trimA.survivorHash === trimB.survivorHash,
    `${trimA.stateHashAfterTrim}/${trimA.survivorHash} == ${trimB.stateHashAfterTrim}/${trimB.survivorHash}`);
  check('trim-state-remains-finite', trimA.finite && trimB.finite,
    `repeatA=${trimA.finite} repeatB=${trimB.finite}`);
  check('rigid-offscreen-retires-sooner', rigidA.farRetireTick > 0 &&
    rigidA.nearRetireTick > rigidA.farRetireTick,
    `far=${rigidA.farRetireSeconds}s near=${rigidA.nearRetireSeconds}s`);
  check('rigid-retirement-is-deterministic', rigidA.timelineHash === rigidB.timelineHash &&
    rigidA.nearRetireTick === rigidB.nearRetireTick && rigidA.farRetireTick === rigidB.farRetireTick,
    `${rigidA.timelineHash} == ${rigidB.timelineHash}`);
  check('legacy-type7-retires', legacyA.finalCount === 0 &&
    legacyA.nearRetireTick > 0 && legacyA.farRetireTick > 0,
    `final=${legacyA.finalCount} far=${legacyA.farRetireSeconds}s near=${legacyA.nearRetireSeconds}s`);
  check('legacy-offscreen-retires-sooner', legacyA.nearRetireTick > legacyA.farRetireTick,
    `far=${legacyA.farRetireSeconds}s near=${legacyA.nearRetireSeconds}s`);
  check('legacy-retirement-is-deterministic', legacyA.timelineHash === legacyB.timelineHash,
    `${legacyA.timelineHash} == ${legacyB.timelineHash}`);
  check('sustained-load-hits-budget', pressure.atBudgetTickCount > 0 && pressure.peakBodies === pressure.probe.budget,
    `hits=${pressure.atBudgetTickCount} peak=${pressure.peakBodies}/${pressure.probe.budget}`);
  check('sustained-load-never-exceeds-budget', pressure.overBudgetTickCount === 0 && pressure.probe.withinBudget,
    `overBudgetTicks=${pressure.overBudgetTickCount}`);
  check('sustained-load-retires-and-replenishes', pressure.probe.retired > 0 && pressure.acceptedPieces > pressure.peakBodies,
    `retired=${pressure.probe.retired} accepted=${pressure.acceptedPieces}`);
  check('emergency-fallback-is-reachable', !fallback.error && fallback.legacyType7After === 3 &&
    fallback.rigidSpawnsAfter === fallback.rigidSpawnsBefore && fallback.legacyEntryRandomCounts.length === 3,
    `legacy=${fallback.legacyType7After} rigidSpawns=${fallback.rigidSpawnsBefore}->${fallback.rigidSpawnsAfter}`);
  check('emergency-fallback-avoids-global-math-random', fallback.randomCalls === 0 &&
    fallback.legacyEntryRandomCounts.length === 3 &&
    fallback.legacyEntryRandomCounts.every(count => count === 0) &&
    fallback.entryDeltas.every(delta => delta === 0),
    `randomCalls=${fallback.randomCalls} entries=${fallback.legacyEntryRandomCounts.join(',')}`);
  check('no-page-errors', pageErrors.length === 0, `${pageErrors.length} page error(s)`);

  const failedHarnessAssertions = assertions.filter(row => !row.pass);
  const determinismRisk = fallback.randomCalls !== 0 && fallback.legacyType7After === 3;
  report = {
    schema: 'massfront-debris-pressure-v2',
    capturedAt: new Date().toISOString(),
    durationWallMs: Date.now() - startedAt.getTime(),
    provenance: {
      repository: root, head: beforeSource.head, dirty: beforeSource.dirty,
      dirtyEntryCount: beforeSource.dirtyEntryCount,
      worktreeStatusSha256: beforeSource.worktreeStatusSha256,
      sourceStableDuringRun: assertions.find(row => row.id === 'source-stable-during-run').pass,
      files: beforeSource.files, servedSources: browserResult.servedSources,
      manifestOrder: {
        physics: order.indexOf('src/engine/physics.js'), sim: order.indexOf('src/game/sim.js')
      },
      sourceLocations: beforeSource.sourceLocations
    },
    environment: { ...browserResult.environment, localPort: port, cdpPort: Number(process.env.PW_CDP_PORT) },
    results: {
      trim: browserResult.trim,
      rigidRetirement: browserResult.rigidRetirement,
      legacyRetirement: browserResult.legacyRetirement,
      pressure: browserResult.pressure,
      emergencyFallback: browserResult.fallback
    },
    assertions,
    evidenceOutcome: failedHarnessAssertions.length ? 'FAIL' : 'PASS',
    determinismContract: determinismRisk ? 'FAIL' : 'PASS',
    determinismRisk: determinismRisk ? {
      code: 'GLOBAL_MATH_RANDOM_EMERGENCY_DEBRIS_FALLBACK',
      reachable: true,
      detail: 'A full rigid-body budget makes mfPhysBlast return zero; mfEmitMacroFx then creates three legacy type-7 fragments using global Math.random().',
      location: beforeSource.sourceLocations.emergencyRandom,
      narrowRecommendation: 'Replace only the three fallback Math.random() draws with a private deterministic FX RNG (or expose the existing MFPhys RNG); preserve the legacy fallback and schemas.'
    } : null,
    pageErrors,
    failedHarnessAssertions
  };

  const reportPath = join(outDir, 'report.json');
  const summaryPath = join(outDir, 'summary.md');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  const md = [
    '# MASSFRONT debris pressure evidence',
    '',
    `- Evidence outcome: **${report.evidenceOutcome}**`,
    `- Determinism contract: **${report.determinismContract}**`,
    `- HEAD: \`${report.provenance.head}\` (${report.provenance.dirty ? 'dirty' : 'clean'})`,
    `- GPU: ${report.environment.gpu.renderer}`,
    `- Source stable: ${report.provenance.sourceStableDuringRun}`,
    '',
    '## Forced trim',
    '',
    `- Bodies: ${trimA.highBodies} at budget ${trimA.highBudget} -> ${trimA.afterBodies} at budget ${trimA.targetBudget}`,
    `- Budget trims: ${trimA.trimCount}`,
    `- Live chunks: ${trimA.highChunks} -> ${trimA.afterChunks}`,
    `- Repeat hashes: \`${trimA.stateHashAfterTrim}\` / \`${trimB.stateHashAfterTrim}\``,
    `- Post-trim tick p95: ${trimA.postTrimTickP95Ms.toFixed(4)} ms`,
    '',
    '## Three-minute simulated pressure',
    '',
    `- Peak bodies/chunks: ${pressure.peakBodies}/${pressure.peakChunks}`,
    `- Budget-hit ticks: ${pressure.atBudgetTickCount}/${pressure.ticks}`,
    `- Retired/replenished pieces: ${pressure.probe.retired}/${pressure.acceptedPieces}`,
    `- Fixed-step p95: ${pressure.tickP95Ms.toFixed(4)} ms`,
    `- Render CPU submission p95 (1 Hz samples): ${pressure.renderCpuP95Ms.toFixed(4)} ms`,
    '',
    '## Retirement',
    '',
    `- Rigid far/on-screen: ${rigidA.farRetireSeconds}s / ${rigidA.nearRetireSeconds}s`,
    `- Legacy type-7 far/on-screen: ${legacyA.farRetireSeconds}s / ${legacyA.nearRetireSeconds}s`,
    `- Legacy repeat hashes: \`${legacyA.timelineHash}\` / \`${legacyB.timelineHash}\``,
    '',
    '## Determinism finding',
    '',
    determinismRisk
      ? `- **FAIL:** emergency fallback was reachable and consumed ${fallback.randomCalls} global Math.random() draws while creating ${fallback.legacyType7After} legacy fragments.`
      : `- PASS: emergency fallback remained reachable, created ${fallback.legacyType7After} legacy fragments, and consumed zero global Math.random draws.`,
    '',
    '## Assertions',
    '',
    ...assertions.map(row => `- ${row.pass ? 'PASS' : 'FAIL'} — ${row.id}: ${row.detail}`),
    ''
  ].join('\n');
  await writeFile(summaryPath, md);
  console.log(JSON.stringify({
    report: reportPath, summary: summaryPath,
    evidenceOutcome: report.evidenceOutcome,
    determinismContract: report.determinismContract,
    trim: { before: trimA.highBodies, after: trimA.afterBodies, budgetTrims: trimA.trimCount,
      stateHashA: trimA.stateHashAfterTrim, stateHashB: trimB.stateHashAfterTrim },
    pressure: { peakBodies: pressure.peakBodies, peakChunks: pressure.peakChunks,
      budgetHitTicks: pressure.atBudgetTickCount, tickP95Ms: pressure.tickP95Ms,
      renderCpuP95Ms: pressure.renderCpuP95Ms },
    retirement: { rigidFar: rigidA.farRetireSeconds, rigidNear: rigidA.nearRetireSeconds,
      legacyFar: legacyA.farRetireSeconds, legacyNear: legacyA.nearRetireSeconds },
    fallbackMathRandomCalls: fallback.randomCalls,
    failedAssertions: failedHarnessAssertions.map(row => row.id)
  }, null, 2));
  if (failedHarnessAssertions.length) process.exitCode = 1;
} catch (error) {
  const fatal = {
    schema: 'massfront-debris-pressure-v2', capturedAt: new Date().toISOString(),
    evidenceOutcome: 'FAIL', determinismContract: 'UNKNOWN', fatal: String(error && error.stack || error),
    provenance: beforeSource, pageErrors
  };
  await writeFile(join(outDir, 'report.json'), JSON.stringify(fatal, null, 2));
  console.error(fatal.fatal);
  process.exitCode = 1;
} finally {
  if (page) await settleWithin(page.close().catch(() => {}), 3000);
  const browserClosed = await settleWithin(closePwBrowser().catch(() => {}), 5000);
  if (!browserClosed) await settleWithin(killProjectChromium().catch(() => {}), 5000);
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  await settleWithin(new Promise(resolveClose => server.close(resolveClose)), 3000);
}

/* Playwright's driver can retain a pipe handle after a forcibly recovered GPU
 * process even though all evidence and browser cleanup have completed. This is
 * a CLI-only probe, so terminate with the already-decided evidence exit code. */
process.exit(process.exitCode || 0);
