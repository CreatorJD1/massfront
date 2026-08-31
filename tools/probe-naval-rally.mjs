#!/usr/bin/env node
/* Source-bound fixed-step naval movement probe.

   This intentionally drives the real input order path (`orderMove`) and then
   advances the real `unitTick` at 30 Hz. Two seeded repetitions must produce
   the same trajectory hash. Runtime source is never modified by this probe. */
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const execFile = promisify(execFileCallback);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const startedUtc = new Date().toISOString();
const runId = startedUtc.replace(/[:.]/g, '-');
const output = join(root, '.tmp', 'naval-rally', 'runs', runId);
const sourceFiles = [
  'src/game/sim.js',
  'src/ui/input.js',
  'src/game/ai.js',
  'src/ui/hud.js',
  'src/engine/gl.js',
  'src/main.js',
  'boot.js',
  'assets/data/manifest.json',
  'index.html',
  'tools/probe-naval-rally.mjs',
];
const MIME = {
  '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.m4a': 'audio/mp4', '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp',
};

await mkdir(output, { recursive: true });

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function boundedClose(promise, timeoutMs = 5000) {
  await Promise.race([promise, new Promise(resolveTimeout => setTimeout(resolveTimeout, timeoutMs))]);
}

async function git(args) {
  const { stdout } = await execFile('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return stdout.trimEnd();
}

async function provenance() {
  const files = [];
  for (const path of sourceFiles) {
    const bytes = await readFile(join(root, path));
    files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const [head, status] = await Promise.all([
    git(['rev-parse', 'HEAD']),
    git(['status', '--porcelain=v1', '--untracked-files=all']),
  ]);
  const entries = status ? status.split(/\r?\n/).filter(Boolean) : [];
  return {
    head,
    dirty: entries.length > 0,
    dirtyEntries: entries.length,
    dirtyFingerprint: sha256(status),
    sourceSetSha256: sha256(files.map(file => `${file.path}:${file.sha256}`).join('\n')),
    files,
  };
}

function sourceLine(path, pattern) {
  return readFile(join(root, path), 'utf8').then(text => {
    const lines = text.split(/\r?\n/);
    const index = lines.findIndex(line => pattern.test(line));
    return index < 0 ? null : index + 1;
  });
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? '/index.html' : pathname;
      const file = resolve(root, `.${requested}`);
      const rel = relative(root, file);
      if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || resolve(root, rel) !== file || !existsSync(file)) {
        throw new Error('outside root or missing');
      }
      const bytes = await readFile(file);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      });
      response.end(bytes);
    } catch {
      response.writeHead(404, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
    port: address.port,
    close: () => new Promise(resolveClose => {
      server.close(resolveClose);
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    }),
  };
}

async function servedHashes(baseUrl) {
  const out = [];
  for (const path of sourceFiles.filter(path => !path.startsWith('tools/'))) {
    const response = await fetch(new URL(path, baseUrl), { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    out.push({ path, status: response.status, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return out;
}

const startSource = await provenance();
const lines = {
  orderMove: await sourceLine('src/ui/input.js', /^function orderMove\(/),
  aiIssueFocus: await sourceLine('src/game/ai.js', /^function aiIssueFocus\(/),
  arrivalRadius: await sourceLine('src/game/sim.js', /^function unitArrivalRadius\(/),
  separation: await sourceLine('src/game/sim.js', /^function unitSeparation\(/),
  nonHolonomic: await sourceLine('src/game/sim.js', /toward that final intent/),
  arrivalStop: await sourceLine('src/game/sim.js', /Ordinary move\/A-move\/rally orders enter a stable idle state/),
};
const localByPath = Object.fromEntries(startSource.files.map(file => [file.path, file]));
const server = await startServer();
const browser = await launchPwBrowser({ headless: true });
let page;
const runtimeErrors = [];
const consoleErrors = [];
const blockedExternal = [];

try {
  page = await browser.newPage({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  page.on('pageerror', error => runtimeErrors.push(String(error?.stack || error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.protocol === 'data:' || url.protocol === 'blob:') {
      await route.continue();
    } else {
      blockedExternal.push(url.href);
      await route.abort('blockedbyclient');
    }
  });
  await page.addInitScript(() => {
    let probeRandomState = 1;
    window.__mfProbeSetRandomSeed = seed => { probeRandomState = (seed >>> 0) || 1; };
    Math.random = () => {
      probeRandomState = (Math.imul(probeRandomState, 1664525) + 1013904223) >>> 0;
      return probeRandomState / 4294967296;
    };
    try {
      localStorage.setItem('mf_ap_gate_closed', '1');
      localStorage.setItem('mf_ap_dismissed', '1');
      localStorage.setItem('mf_offline', '1');
      localStorage.setItem('mf_prealpha_cinematic_v2', 'test-seen');
      localStorage.setItem('mf_auth_gate_v1', '1');
    } catch {}
  });
  const gpu = await assertHardwareGpu(page);
  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => typeof spawnUnit === 'function'
    && typeof resetWorld === 'function'
    && typeof unitTick === 'function'
    && typeof orderMove === 'function'
    && typeof unitArrivalRadius === 'function'
    && typeof isNavigableWater === 'function'
    && typeof requestField === 'function'
    && typeof aiIssueFocus === 'function', null, { timeout: 120_000 });

  const evaluation = await page.evaluate(() => {
    const RUNTIME_SEED = 0x4e415641;
    const TICKS = 1800;
    const DT = 1 / 30;
    const OFFSETS = [[-60, -22], [-20, -22], [20, -22], [60, -22], [-60, 22], [-20, 22], [20, 22], [60, 22]];
    const round = (value, digits = 5) => +Number(value).toFixed(digits);
    const wrap = value => {
      while (value > Math.PI) value -= Math.PI * 2;
      while (value < -Math.PI) value += Math.PI * 2;
      return value;
    };
    const p95 = values => {
      if (!values.length) return 0;
      const sorted = values.slice().sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1))];
    };
    const openWater = (x, y, radius) => {
      for (let dy = -radius; dy <= radius; dy += 40) {
        for (let dx = -radius; dx <= radius; dx += 40) {
          if (!isNavigableWater(x + dx, y + dy, true)) return false;
        }
      }
      return isNavigableWater(x, y, true);
    };
    const lane = () => {
      const candidates = [];
      for (let y = 180; y < MAP - 180; y += 36) {
        for (let x = 180; x < MAP - 180; x += 36) {
          if (openWater(x, y, 60)) candidates.push([x, y]);
        }
      }
      if (candidates.length < 2) throw new Error(`not enough open water candidates: ${candidates.length}`);
      let best = null;
      let bestScore = Infinity;
      /* The authored coast changed shape while this probe kept assuming a
         350..540 wu straight lane. Eight Corvettes only need 140 wu beyond the
         120 wu launch shell to exercise turning, spacing and arrival. Keep the
         lane source-bound, but select the longest useful reachable pair instead
         of failing before unitTick when the current coast is more compact. */
      const minLane = 140, maxLane = 620, idealLane = 300;
      const stride = Math.max(1, Math.floor(candidates.length / 220));
      let distancePairs = 0;
      let reachablePairs = 0;
      for (let a = 0; a < candidates.length; a += stride) {
        for (let b = a + stride; b < candidates.length; b += stride) {
          const A = candidates[a], B = candidates[b];
          const distance = Math.hypot(B[0] - A[0], B[1] - A[1]);
          if (distance < minLane || distance > maxLane) continue;
          distancePairs++;
          const field = requestField(B[0], B[1], true);
          if (field < 0 || !fields[field] || fields[field].dirs[ffCell(A[0], A[1])] >= 8) continue;
          reachablePairs++;
          const score = Math.abs(distance - idealLane);
          if (score < bestScore) {
            bestScore = score;
            best = { start: A, target: B, distance, field };
          }
        }
      }
      if (!best) throw new Error(`no open-water lane: candidates=${candidates.length} stride=${stride} distancePairs=${distancePairs} reachablePairs=${reachablePairs}`);
      return best;
    };

    window.__mfProbeSetRandomSeed(RUNTIME_SEED);
    srand(RUNTIME_SEED | 0);
    curMap = 'aelos_coast_medium';
    curTheme = 'verdant';
    terrainTex = buildTerrain(curTheme);
    builtTheme = curTheme;
    builtMap = curMap;

    /* The player order path already resolves a clicked land point onto water.
       AI defense/recall orders use aiIssueFocus instead, so exercise that real
       entry point with a deliberately invalid land destination. */
    const aiNavalGoalFixture = () => {
      window.__mfProbeSetRandomSeed(RUNTIME_SEED);
      srand(RUNTIME_SEED | 0);
      resetWorld();
      tick = 0;
      matchLive = true;
      running = false;
      paused = false;
      gameEnded = false;
      fogOn = false;
      const chosen = lane();
      let land = null;
      for (let y = 80; y < MAP - 80 && !land; y += 24) {
        for (let x = 80; x < MAP - 80; x += 24) {
          if (isWalkable(x, y) && !isNavigableWater(x, y, true)) { land = [x, y]; break; }
        }
      }
      if (!land) throw new Error('no deliberate land goal found for AI naval fixture');
      const id = spawnUnit(14, 1, chosen.start[0], chosen.start[1], 0);
      if (id < 0) throw new Error('AI naval fixture spawn refused');
      aiIssueFocus(id, land[0], land[1], -1);
      const F = ufield[id] >= 0 ? fields[ufield[id]] : null;
      return {
        requested: { x: land[0], y: land[1], navigableWater: isNavigableWater(land[0], land[1], true) },
        assigned: { x: utx[id], y: uty[id], navigableWater: isNavigableWater(utx[id], uty[id], true) },
        field: { id: ufield[id], exists: !!F, naval: !!(F && F.naval) },
      };
    };

    const aiNavalGoal = aiNavalGoalFixture();
    const aiNavalGoalRepeat = aiNavalGoalFixture();
    aiNavalGoal.deterministicRepeat = aiNavalGoal.assigned.x === aiNavalGoalRepeat.assigned.x
      && aiNavalGoal.assigned.y === aiNavalGoalRepeat.assigned.y
      && aiNavalGoal.field.naval === aiNavalGoalRepeat.field.naval;

    const run = repetition => {
      window.__mfProbeSetRandomSeed(RUNTIME_SEED);
      srand(RUNTIME_SEED | 0);
      try { if (typeof stopAttract === 'function') stopAttract(); } catch {}
      resetWorld();
      tick = 0;
      perfScale = 0.4125;
      attractOn = false;
      demoMode = false;
      matchLive = true;
      running = false;
      paused = false;
      gameEnded = false;
      fogOn = false;
      if (typeof META !== 'undefined' && META.settings) {
        META.settings.quality = 'medium';
        META.settings.fog = false;
      }
      const chosen = lane();
      const ids = [];
      for (let index = 0; index < OFFSETS.length; index++) {
        const offset = OFFSETS[index];
        const spawn = [chosen.start[0] + offset[0], chosen.start[1] + offset[1]];
        if (!isNavigableWater(spawn[0], spawn[1], true)) throw new Error(`spawn ${index} is not navigable water`);
        const id = spawnUnit(14, 0, spawn[0], spawn[1], -1);
        if (id < 0) throw new Error(`spawn refused at ${index}`);
        ids.push(id);
        usel[id] = 1;
      }
      cam.x = (chosen.start[0] + chosen.target[0]) * 0.5;
      cam.y = (chosen.start[1] + chosen.target[1]) * 0.5;
      orthoSpan = distTarget = 1100;
      selFormation = 3;
      moveMode = 1;
      const orderAccepted = orderMove(chosen.target[0], chosen.target[1], false, false);
      if (!orderAccepted) throw new Error('orderMove rejected the selected naval group');
      const goals = ids.map(id => ({ x: utx[id], y: uty[id] }));
      const arrival = ids.map(id => unitArrivalRadius(TYPES[utype[id]]));
      const previous = ids.map(id => ({ x: ux[id], y: uy[id], heading: uang[id], targetX: utx[id], targetY: uty[id] }));
      const inside = ids.map(() => false);
      const arrivedOnce = ids.map(() => false);
      const lastTurn = ids.map(() => 0);
      const lastRadial = ids.map(() => 0);
      const metrics = ids.map(() => ({
        headingReversals: 0, nearGoalHeadingReversals: 0, postArrivalHeadingReversals: 0,
        radialReversalsNearGoal: 0, arrivalEntries: 0, arrivalExits: 0,
        targetRewrites: 0, lateTravel: 0, postArrivalMaxDistance: 0,
      }));
      const mismatch = [];
      const lateralRatios = [];
      const rows = [];
      let minPair = Infinity;
      let overlapTicks = 0;
      let overlapPairTicks = 0;
      for (let step = 0; step < TICKS; step++) {
        tick++;
        stats.t += DT;
        unitTick(DT);
        let anyOverlap = false;
        for (let a = 0; a < ids.length; a++) {
          for (let b = a + 1; b < ids.length; b++) {
            const A = ids[a], B = ids[b];
            const distance = Math.hypot(ux[A] - ux[B], uy[A] - uy[B]);
            const TA = TYPES[utype[A]], TB = TYPES[utype[B]];
            const personal = Math.max(TA.r, TA.size * 0.54) + Math.max(TB.r, TB.size * 0.54) + 2;
            minPair = Math.min(minPair, distance);
            if (step >= 30 && distance < personal * 0.92) {
              anyOverlap = true;
              overlapPairTicks++;
            }
          }
        }
        if (anyOverlap) overlapTicks++;
        const tickUnits = [];
        for (let index = 0; index < ids.length; index++) {
          const id = ids[index];
          const dx = ux[id] - previous[index].x;
          const dy = uy[id] - previous[index].y;
          const travel = Math.hypot(dx, dy);
          const distance = Math.hypot(goals[index].x - ux[id], goals[index].y - uy[id]);
          const dHeading = wrap(uang[id] - previous[index].heading);
          const radial = distance - Math.hypot(goals[index].x - previous[index].x, goals[index].y - previous[index].y);
          const turnSignificant = Math.abs(dHeading) > 0.006;
          const radialSignificant = Math.abs(radial) > 0.01;
          if (turnSignificant && Math.abs(lastTurn[index]) > 0.006 && Math.sign(dHeading) !== Math.sign(lastTurn[index])) {
            metrics[index].headingReversals++;
            if (distance < arrival[index] * 2) metrics[index].nearGoalHeadingReversals++;
            if (arrivedOnce[index]) metrics[index].postArrivalHeadingReversals++;
          }
          if (radialSignificant && Math.abs(lastRadial[index]) > 0.01 && Math.sign(radial) !== Math.sign(lastRadial[index])
            && distance < arrival[index] * 2) metrics[index].radialReversalsNearGoal++;
          const nowInside = distance <= arrival[index];
          if (nowInside && !inside[index]) {
            metrics[index].arrivalEntries++;
            arrivedOnce[index] = true;
          } else if (!nowInside && inside[index]) {
            metrics[index].arrivalExits++;
          }
          inside[index] = nowInside;
          if (arrivedOnce[index]) metrics[index].postArrivalMaxDistance = Math.max(metrics[index].postArrivalMaxDistance, distance);
          if (Math.hypot(utx[id] - previous[index].targetX, uty[id] - previous[index].targetY) > 0.01) metrics[index].targetRewrites++;
          if (step >= TICKS - 150) metrics[index].lateTravel += travel;
          let facingTravelMismatch = 0;
          if (travel > 0.001) {
            facingTravelMismatch = Math.abs(wrap(Math.atan2(dy, dx) - (uang[id] - Math.PI / 2)));
            mismatch.push(facingTravelMismatch);
            lateralRatios.push(Math.abs(Math.sin(facingTravelMismatch)));
          }
          tickUnits.push({
            unit: index, x: round(ux[id], 4), y: round(uy[id], 4), dx: round(dx, 4), dy: round(dy, 4),
            heading: round(uang[id], 5), dHeading: round(dHeading, 5), distance: round(distance, 4),
            radialDelta: round(radial, 5), targetX: round(utx[id], 3), targetY: round(uty[id], 3),
            facingTravelMismatch: round(facingTravelMismatch, 5), moving: umov[id], state: ustate[id],
          });
          previous[index] = { x: ux[id], y: uy[id], heading: uang[id], targetX: utx[id], targetY: uty[id] };
          if (turnSignificant) lastTurn[index] = dHeading;
          if (radialSignificant) lastRadial[index] = radial;
        }
        rows.push({ step, time: round((step + 1) * DT, 4), units: tickUnits });
      }
      const final = ids.map((id, index) => ({
        unit: index, x: round(ux[id], 4), y: round(uy[id], 4), targetX: round(goals[index].x, 4),
        targetY: round(goals[index].y, 4), distance: round(Math.hypot(goals[index].x - ux[id], goals[index].y - uy[id]), 4),
        arrivalRadius: round(arrival[index], 4), moving: umov[id], state: ustate[id], metrics: metrics[index],
      }));
      let finalMinPair = Infinity;
      let finalOverlapPairs = 0;
      let targetMinPair = Infinity;
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          const distance = Math.hypot(ux[ids[a]] - ux[ids[b]], uy[ids[a]] - uy[ids[b]]);
          const TA = TYPES[utype[ids[a]]], TB = TYPES[utype[ids[b]]];
          const personal = Math.max(TA.r, TA.size * 0.54) + Math.max(TB.r, TB.size * 0.54) + 2;
          finalMinPair = Math.min(finalMinPair, distance);
          targetMinPair = Math.min(targetMinPair, Math.hypot(goals[a].x - goals[b].x, goals[a].y - goals[b].y));
          if (distance < personal * 0.92) finalOverlapPairs++;
        }
      }
      const sum = key => metrics.reduce((total, item) => total + item[key], 0);
      const settled = final.filter(item => item.distance <= item.arrivalRadius + 0.25 && item.moving === 0 && item.state === 0).length;
      return {
        repetition,
        environment: {
          map: curMap, theme: curTheme, perfScale, runtimeSeed: RUNTIME_SEED, fixedStepHz: 30,
          ticks: TICKS, seconds: TICKS / 30, unitType: TYPES[14].name, units: ids.length,
          start: chosen.start, target: chosen.target, laneDistance: round(chosen.distance, 4),
          orderPath: 'orderMove(selected naval group, MOVE mode, Box formation)',
        },
        summary: {
          settled, headingReversals: sum('headingReversals'), nearGoalHeadingReversals: sum('nearGoalHeadingReversals'),
          postArrivalHeadingReversals: sum('postArrivalHeadingReversals'),
          radialReversalsNearGoal: sum('radialReversalsNearGoal'), arrivalEntries: sum('arrivalEntries'),
          arrivalExits: sum('arrivalExits'), targetRewrites: sum('targetRewrites'),
          lateTravel: round(sum('lateTravel'), 5), minPair: round(minPair, 4),
          finalMinPair: round(finalMinPair, 4), targetMinPair: round(targetMinPair, 4),
          finalOverlapPairs, overlapTickPct: round(overlapTicks / (TICKS - 30) * 100, 5),
          overlapPairTickCount: overlapPairTicks,
          meanFacingTravelMismatchRad: round(mismatch.reduce((sum2, value) => sum2 + value, 0) / Math.max(1, mismatch.length), 6),
          p95FacingTravelMismatchRad: round(p95(mismatch), 6),
          p95LateralTravelRatio: round(p95(lateralRatios), 6),
          finalMeanDistance: round(final.reduce((sum2, item) => sum2 + item.distance, 0) / final.length, 5),
        },
        final,
        rows,
      };
    };
    return { repetitions: [run(1), run(2)], aiNavalGoal };
  });
  const repetitions = evaluation.repetitions;

  for (const repetition of repetitions) {
    repetition.trajectorySha256 = sha256(JSON.stringify(repetition.rows));
    await writeFile(join(output, `repetition-${repetition.repetition}.json`), `${JSON.stringify(repetition, null, 2)}\n`);
  }
  const first = repetitions[0];
  const second = repetitions[1];
  const deterministicRepeat = first.trajectorySha256 === second.trajectorySha256;
  const movementChecks = {
    allUnitsSettled: first.summary.settled === first.environment.units,
    noArrivalExitHunting: first.summary.arrivalExits === 0,
    noPostArrivalHeadingTwitch: first.summary.postArrivalHeadingReversals === 0,
    targetsStable: first.summary.targetRewrites === 0,
    noFinalOverlap: first.summary.finalOverlapPairs === 0,
    formationSpreadRetained: first.summary.finalMinPair >= first.summary.targetMinPair * 0.90,
    lateMotionStopped: first.summary.lateTravel < 0.5,
    facingModelRespected: first.summary.p95FacingTravelMismatchRad < 0.35,
    aiNavalGoalResolvedToWater: evaluation.aiNavalGoal.assigned.navigableWater,
    aiNavalFieldUsesWaterMedium: evaluation.aiNavalGoal.field.exists && evaluation.aiNavalGoal.field.naval,
    aiNavalGoalDeterministic: evaluation.aiNavalGoal.deterministicRepeat,
    deterministicRepeat,
  };
  const endSource = await provenance();
  const served = await servedHashes(server.url);
  const servedMismatch = served.filter(file => !localByPath[file.path]
    || localByPath[file.path].sha256 !== file.sha256 || file.status !== 200);
  const provenanceChecks = {
    headStable: startSource.head === endSource.head,
    dirtyFingerprintStable: startSource.dirtyFingerprint === endSource.dirtyFingerprint,
    sourceSetStable: startSource.sourceSetSha256 === endSource.sourceSetSha256,
    servedSourcesMatchLocal: servedMismatch.length === 0,
  };
  const checks = { ...movementChecks, ...provenanceChecks, noRuntimeErrors: runtimeErrors.length === 0 };
  const sourceBindingPass = provenanceChecks.headStable && provenanceChecks.sourceSetStable
    && provenanceChecks.servedSourcesMatchLocal;
  const movementPass = Object.values(movementChecks).every(Boolean)
    && sourceBindingPass && runtimeErrors.length === 0;
  const report = {
    schema: 'MassfrontNavalRallyProbeV2',
    startedUtc,
    finishedUtc: new Date().toISOString(),
    result: movementPass ? 'PASS' : 'FAIL',
    provenance: { start: startSource, end: endSource, checks, sourceLines: lines },
    runtime: { url: server.url, port: server.port, gpu, blockedExternalCount: blockedExternal.length },
    servedSources: served,
    servedMismatch,
    runtimeErrors,
    consoleErrors,
    aiNavalGoal: evaluation.aiNavalGoal,
    repetitions: repetitions.map(repetition => ({
      repetition: repetition.repetition,
      trajectorySha256: repetition.trajectorySha256,
      environment: repetition.environment,
      summary: repetition.summary,
      evidence: `repetition-${repetition.repetition}.json`,
    })),
    checks,
  };
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const summary = first.summary;
  const markdown = [
    '# MASSFRONT current-source naval rally probe', '',
    `- Result: **${report.result}**`,
    `- Started: ${startedUtc}`,
    `- HEAD: \`${startSource.head}\``,
    `- Dirty fingerprint: \`${startSource.dirtyFingerprint}\` (${startSource.dirtyEntries} entries)`,
    `- Source-set SHA-256: \`${startSource.sourceSetSha256}\``,
    `- GPU: ${gpu.renderer} (${gpu.vendor})`,
    `- Runtime: ${server.url}`, '',
    '## Measurement', '',
    `- Settled: ${summary.settled}/${first.environment.units}`,
    `- Heading reversals (all / near / post-arrival): ${summary.headingReversals} / ${summary.nearGoalHeadingReversals} / ${summary.postArrivalHeadingReversals}`,
    `- Near-goal radial reversals: ${summary.radialReversalsNearGoal}`,
    `- Arrival entries / exits: ${summary.arrivalEntries} / ${summary.arrivalExits}`,
    `- Target rewrites: ${summary.targetRewrites}`,
    `- Late travel (last 5 s, all units): ${summary.lateTravel} wu`,
    `- Overlap tick rate: ${summary.overlapTickPct}% ; final overlap pairs: ${summary.finalOverlapPairs}`,
    `- Final / target minimum pair spacing: ${summary.finalMinPair} / ${summary.targetMinPair} wu`,
    `- Facing-to-travel mismatch mean / p95: ${summary.meanFacingTravelMismatchRad} / ${summary.p95FacingTravelMismatchRad} rad`,
    `- Lateral travel ratio p95: ${summary.p95LateralTravelRatio}`,
    `- Repeat hashes: \`${first.trajectorySha256}\` / \`${second.trajectorySha256}\``, '',
    '## AI naval-goal fixture', '',
    `- Requested land: ${evaluation.aiNavalGoal.requested.x}, ${evaluation.aiNavalGoal.requested.y}`,
    `- Assigned goal: ${evaluation.aiNavalGoal.assigned.x}, ${evaluation.aiNavalGoal.assigned.y}`,
    `- Assigned goal navigable water: ${evaluation.aiNavalGoal.assigned.navigableWater}`,
    `- Assigned flow field exists / naval: ${evaluation.aiNavalGoal.field.exists} / ${evaluation.aiNavalGoal.field.naval}`, '',
    '## Checks', '',
    ...Object.entries(checks).map(([name, pass]) => `- ${pass ? 'PASS' : 'FAIL'} — ${name}`), '',
    '## Source anchors', '',
    `- orderMove: src/ui/input.js:${lines.orderMove}`,
    `- aiIssueFocus: src/game/ai.js:${lines.aiIssueFocus}`,
    `- unitArrivalRadius: src/game/sim.js:${lines.arrivalRadius}`,
    `- unitSeparation: src/game/sim.js:${lines.separation}`,
    `- non-holonomic facing: src/game/sim.js:${lines.nonHolonomic}`,
    `- arrival stop: src/game/sim.js:${lines.arrivalStop}`,
  ].join('\n');
  await writeFile(join(output, 'report.md'), `${markdown}\n`);
  console.log(JSON.stringify({ output, result: report.result, summary, checks }, null, 2));
  if (report.result !== 'PASS') process.exitCode = 1;
} finally {
  if (page) await boundedClose(page.close().catch(() => {}));
  await boundedClose(server.close().catch(() => {}));
  await boundedClose(closePwBrowser().catch(() => {}));
}
setTimeout(() => process.exit(process.exitCode || 0), 25).unref();
