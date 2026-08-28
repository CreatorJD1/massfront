#!/usr/bin/env node
/* Deterministic Stage-2 ground/blocker probe.

   This probe is evidence-bound: it refuses software WebGL, records source and
   package identities, hashes every served runtime input, and fails if the
   tested bytes drift from either the source tree or the selected package. */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import {
  collectPackageFingerprint,
  collectRuntimeFingerprint,
  collectSourceFingerprint,
  sha256File,
} from './evidence-foundation/fingerprints.mjs';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const packageMode = args.includes('--package');
const explicitUrl = args.find(arg => /^https?:\/\//.test(arg)) || null;
const packageRootArg = args.find(arg => arg.startsWith('--package-root='));
const packageRoot = packageMode
  ? resolve(root, packageRootArg ? packageRootArg.slice('--package-root='.length) : 'www')
  : root;
const startedUtc = new Date().toISOString();
const runId = startedUtc.replace(/[:.]/g, '-');
const output = join(root, '.tmp', 'movement-blockers', 'runs', runId);
const viewport = { width: 1000, height: 760 };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const trajectorySha = value => sha256(JSON.stringify(value));
const MIME = {
  '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.m4a': 'audio/mp4', '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp',
};

await mkdir(output, { recursive: true });

function runtimeDigest(files) {
  const hash = createHash('sha256');
  for (const file of files) hash.update(`path\0${file.path}\0`).update(file.bytes).update('\0');
  return hash.digest('hex');
}

async function startServer(servedRoot) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? '/index.html' : pathname;
      const file = resolve(servedRoot, `.${requested}`);
      const rel = relative(servedRoot, file);
      if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || resolve(servedRoot, rel) !== file || !existsSync(file)) {
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
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise(resolveClose => {
      server.close(resolveClose);
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    }),
  };
}

async function fetchServedRuntime(baseUrl, runtime) {
  const files = [];
  const failures = [];
  for (const path of runtime.files) {
    try {
      const requestUrl = new URL(path, baseUrl);
      requestUrl.searchParams.set('__mf_probe_identity', runId);
      const response = await fetch(requestUrl, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
      const bytes = Buffer.from(await response.arrayBuffer());
      const record = { path, status: response.status, size: bytes.length, sha256: sha256(bytes), bytes };
      files.push(record);
      if (!response.ok || runtime.fileHashes[path] !== record.sha256) {
        failures.push({
          path,
          status: response.status,
          expectedSha256: runtime.fileHashes[path] || null,
          actualSha256: record.sha256,
        });
      }
    } catch (error) {
      failures.push({ path, status: null, expectedSha256: runtime.fileHashes[path] || null, error: String(error?.stack || error) });
    }
  }
  const complete = files.length === runtime.files.length && failures.length === 0;
  return {
    complete,
    runtimeFingerprint: complete ? runtimeDigest(files) : null,
    failures,
    files: files.map(({ bytes, ...file }) => file),
  };
}

async function collectIdentity() {
  if (!existsSync(packageRoot)) throw new Error(`PACKAGE_ROOT_MISSING: ${packageRoot}`);
  const [source, sourceRuntime, testedRuntime] = await Promise.all([
    collectSourceFingerprint(root),
    collectRuntimeFingerprint(root),
    collectRuntimeFingerprint(packageRoot),
  ]);
  const packageInfo = await collectPackageFingerprint(root, packageRoot, testedRuntime);
  return {
    source,
    sourceRuntimeFingerprint: sourceRuntime.runtimeFingerprint,
    testedRuntimeFingerprint: testedRuntime.runtimeFingerprint,
    testedRuntime,
    packageFingerprint: packageInfo.packageFingerprint,
    packageKind: packageInfo.packageKind,
    packageFiles: packageInfo.files.length,
    testedEntrySha256: await sha256File(join(packageRoot, 'index.html')),
  };
}

let startIdentity = null;
let endIdentity = null;
let served = null;
let gpu = null;
let webglContextLosses = null;
let fatalError = null;
const runtimeErrors = [];
const consoleErrors = [];
const runs = [];
let browser = null;
let page = null;
let localServer = null;
let runtimeUrl = explicitUrl;

try {
  startIdentity = await collectIdentity();
  if (!runtimeUrl) {
    localServer = await startServer(packageRoot);
    runtimeUrl = localServer.url;
  }
  served = await fetchServedRuntime(runtimeUrl, startIdentity.testedRuntime);
  /* A shared CDP target may be closed by another concurrent audit. Evidence
     must own its renderer process for the complete identity/evaluation window. */
  browser = await launchPwBrowser({ headless: true, ownershipMode: 'isolated' });
  page = await browser.newPage({ viewport, deviceScaleFactor: 1, colorScheme: 'dark' });
  page.on('pageerror', error => runtimeErrors.push(String(error?.stack || error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    let state = 1;
    window.__mfStage2Seed = seed => { state = (seed >>> 0) || 1; };
    window.__mfProbeWebGlContextLosses = 0;
    addEventListener('webglcontextlost', () => { window.__mfProbeWebGlContextLosses++; }, true);
    Math.random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    try {
      localStorage.setItem('mf_ap_gate_closed', '1');
      localStorage.setItem('mf_ap_dismissed', '1');
      localStorage.setItem('mf_offline', '1');
      localStorage.setItem('mf_auth_gate_v1', '1');
    } catch {}
  });
  gpu = await assertHardwareGpu(page);
  await page.goto(runtimeUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => typeof resetWorld === 'function' && typeof unitTick === 'function'
    && typeof requestField === 'function' && typeof isWalkable === 'function'
    && typeof PASS !== 'undefined' && PASS && PASS.length > 0, null, { timeout: 120_000 });

  let fixedCenter = null;
  for (let repetition = 0; repetition < 2; repetition++) {
    const run = await page.evaluate(({ rep, fixedCenter: requestedCenter }) => {
      const SEED = 0x53544732, DT = 1 / 30, TICKS = 3600;
      __mfStage2Seed(SEED); srand(SEED | 0); curMap = 'vanguard'; curTheme = 'verdant';
      terrainTex = buildTerrain(curTheme); builtTheme = curTheme; builtMap = curMap; resetWorld();
      running = false; paused = false; demoMode = false; matchLive = true; gameEnded = false; fogOn = false;
      for (let i = 0; i < unitHigh; i++) if (ualive[i]) killUnit(i, true);
      blds.length = 0; relics.length = 0; rocks.length = 0; fields.length = 0; ffNext = 0;
      rebuildBGrid(true); rebuildGrid(); stats.t = 0;

      const open = (x, y) => {
        for (let oy = -150; oy <= 150; oy += 30) for (let ox = -360; ox <= 360; ox += 30) {
          if (!isWalkable(x + ox, y + oy)) return false;
        }
        return true;
      };
      let C = requestedCenter;
      if (!C) for (let y = 420; y < MAP - 420 && !C; y += 48) {
        for (let x = 500; x < MAP - 500; x += 48) if (open(x, y)) { C = [x, y]; break; }
      }
      if (!C) throw new Error('no open ground blocker fixture');
      const [cx, cy] = C, start = [cx - 300, cy], goal = [cx + 300, cy];
      const routeField = requestField(goal[0], goal[1], false);
      let routeCell = ffCell(start[0], start[1]);
      for (let n = 0; n < PGS * 2; n++) {
        const k = fields[routeField].dirs[routeCell]; if (k >= 8) break;
        const x = routeCell % PGS, y = routeCell / PGS | 0, nx = x + DIRX[k], ny = y + DIRY[k];
        routeCell = ny * PGS + nx;
        const wx = (nx + .5) / PGS * MAP, wy = (ny + .5) / PGS * MAP;
        if (Math.hypot(goal[0] - wx, goal[1] - wy) < 300) break;
      }
      const blockX = ((routeCell % PGS) + .5) / PGS * MAP;
      const blockY = ((routeCell / PGS | 0) + .5) / PGS * MAP;
      fields.length = 0; ffNext = 0;
      const wall = [];
      for (let q = -2; q <= 2; q++) {
        const B = { x: blockX, y: blockY + q * 72, r: 36, w: 72, h: 72, s: 72, a: 0, kind: 2,
          zone: -1, role: 'probe-blocker', hp: 900, hpm: 900, alive: true, salv: 0, salvE: 0, lean: 0,
          burn: 0, seed: q + 3 };
        wall.push(B); relics.push(B);
      }
      const id = spawnUnit(1, 0, start[0], start[1], -1);
      if (id < 0) throw new Error('ground fixture spawn refused');
      ux[id] = start[0]; uy[id] = start[1]; utx[id] = goal[0]; uty[id] = goal[1];
      ustate[id] = 1; utgt[id] = -1; utgtg[id] = -1; uhold[id] = 0; umarch[id] = 0;
      ufield[id] = requestField(goal[0], goal[1], false); gridRelink(id);
      const rows = []; let minWall = 1e9, stalledTicks = 0, maxStall = 0, lastX = ux[id], lastY = uy[id];
      for (let step = 0; step < TICKS; step++) {
        tick++; stats.t += DT; unitTick(DT);
        const travel = Math.hypot(ux[id] - lastX, uy[id] - lastY);
        if (travel < 0.002 && Math.hypot(goal[0] - ux[id], goal[1] - uy[id]) > unitArrivalRadius(TYPES[utype[id]]) * 2) {
          stalledTicks++; maxStall = Math.max(maxStall, stalledTicks);
        } else stalledTicks = 0;
        for (const B of wall) minWall = Math.min(minWall, Math.hypot(ux[id] - B.x, uy[id] - B.y) - B.r - TYPES[utype[id]].r);
        if ((step % 5) === 0) rows.push([+ux[id].toFixed(4), +uy[id].toFixed(4), +uang[id].toFixed(5),
          +utx[id].toFixed(3), +uty[id].toFixed(3)]);
        lastX = ux[id]; lastY = uy[id];
      }
      return { rep, center: C, block: [+blockX.toFixed(3), +blockY.toFixed(3)], start, goal,
        final: [+ux[id].toFixed(4), +uy[id].toFixed(4)],
        finalDistance: +Math.hypot(goal[0] - ux[id], goal[1] - uy[id]).toFixed(4),
        state: ustate[id], moving: umov[id], minWallClearance: +minWall.toFixed(4), maxStallTicks: maxStall,
        targetStable: Math.abs(utx[id] - goal[0]) < .01 && Math.abs(uty[id] - goal[1]) < .01, rows };
    }, { rep: repetition + 1, fixedCenter });
    if (!fixedCenter) fixedCenter = run.center;
    run.trajectorySha256 = trajectorySha(run.rows);
    await writeFile(join(output, `repetition-${run.rep}.json`), `${JSON.stringify(run, null, 2)}\n`);
    runs.push(run);
  }
  webglContextLosses = await page.evaluate(() => window.__mfProbeWebGlContextLosses || 0);
} catch (error) {
  fatalError = String(error?.stack || error);
} finally {
  if (page) await page.close().catch(() => {});
  if (browser) await closePwBrowser(browser).catch(() => {});
  if (localServer) await localServer.close().catch(() => {});
}

try { endIdentity = await collectIdentity(); } catch (error) {
  fatalError = fatalError || String(error?.stack || error);
}

const first = runs[0] || null;
const second = runs[1] || null;
const provenanceChecks = {
  sourceIdentityAvailable: !!startIdentity?.source?.gitHead,
  runtimeIdentityAvailable: !!startIdentity?.testedRuntimeFingerprint,
  packageIdentityAvailable: !!startIdentity?.packageFingerprint,
  sourceHeadStable: !!startIdentity && !!endIdentity && startIdentity.source.gitHead === endIdentity.source.gitHead,
  dirtyFingerprintStable: !!startIdentity && !!endIdentity
    && startIdentity.source.dirtyFingerprint === endIdentity.source.dirtyFingerprint,
  sourceRuntimeStable: !!startIdentity && !!endIdentity
    && startIdentity.sourceRuntimeFingerprint === endIdentity.sourceRuntimeFingerprint,
  testedRuntimeStable: !!startIdentity && !!endIdentity
    && startIdentity.testedRuntimeFingerprint === endIdentity.testedRuntimeFingerprint,
  packageFingerprintStable: !!startIdentity && !!endIdentity
    && startIdentity.packageFingerprint === endIdentity.packageFingerprint,
  packageMatchesCurrentSource: !!startIdentity
    && startIdentity.sourceRuntimeFingerprint === startIdentity.testedRuntimeFingerprint,
  servedRuntimeComplete: !!served?.complete,
  servedRuntimeMatchesExpected: !!served?.runtimeFingerprint && !!startIdentity
    && served.runtimeFingerprint === startIdentity.testedRuntimeFingerprint,
  hardwareWebGl2: !!gpu?.renderer,
  noWebGlContextLoss: webglContextLosses === 0,
};
const movementChecks = {
  reachesGoal: !!first && first.finalDistance <= 20 && first.state === 0,
  doesNotPenetrateBlocker: !!first && first.minWallClearance >= -0.75,
  noLongStall: !!first && first.maxStallTicks < 150,
  targetStable: !!first?.targetStable,
  deterministicRepeat: !!first && !!second && first.trajectorySha256 === second.trajectorySha256,
};
const checks = {
  ...provenanceChecks,
  ...movementChecks,
  noRuntimeErrors: runtimeErrors.length === 0,
  noConsoleErrors: consoleErrors.length === 0,
  noFatalError: fatalError === null,
};
const pass = Object.values(checks).every(Boolean);
const report = {
  schema: 'MassfrontMovementBlockerProbeV2',
  startedUtc,
  finishedUtc: new Date().toISOString(),
  result: pass ? 'PASS' : 'FAIL',
  mode: packageMode ? 'packaged-runtime' : 'source-runtime',
  source: startIdentity ? {
    gitHead: startIdentity.source.gitHead,
    gitDirty: startIdentity.source.gitDirty,
    dirtyFingerprint: startIdentity.source.dirtyFingerprint,
    changedPaths: startIdentity.source.changedPaths,
    runtimeFingerprint: startIdentity.sourceRuntimeFingerprint,
  } : null,
  testedPackage: startIdentity ? {
    root: packageRoot,
    kind: startIdentity.packageKind,
    files: startIdentity.packageFiles,
    runtimeFingerprint: startIdentity.testedRuntimeFingerprint,
    packageFingerprint: startIdentity.packageFingerprint,
    entrySha256: startIdentity.testedEntrySha256,
  } : null,
  sourceEnd: endIdentity ? {
    gitHead: endIdentity.source.gitHead,
    dirtyFingerprint: endIdentity.source.dirtyFingerprint,
    runtimeFingerprint: endIdentity.sourceRuntimeFingerprint,
    testedRuntimeFingerprint: endIdentity.testedRuntimeFingerprint,
    packageFingerprint: endIdentity.packageFingerprint,
  } : null,
  runtime: { url: runtimeUrl, selfHosted: !explicitUrl, viewport, gpu, webglContextLosses, served },
  repetitions: runs.map(run => ({
    repetition: run.rep,
    trajectorySha256: run.trajectorySha256,
    final: run.final,
    finalDistance: run.finalDistance,
    state: run.state,
    moving: run.moving,
    minWallClearance: run.minWallClearance,
    maxStallTicks: run.maxStallTicks,
    targetStable: run.targetStable,
    evidence: `repetition-${run.rep}.json`,
  })),
  checks,
  runtimeErrors,
  consoleErrors,
  fatalError,
};

const reportJsonPath = join(output, 'report.json');
const reportMdPath = join(output, 'report.md');
await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
const markdown = [
  '# MASSFRONT movement blocker evidence', '',
  `- Result: **${report.result}**`,
  `- Mode: ${report.mode}`,
  `- HEAD: \`${report.source?.gitHead || 'UNKNOWN'}\``,
  `- Dirty fingerprint: \`${report.source?.dirtyFingerprint || 'UNKNOWN'}\``,
  `- Source runtime fingerprint: \`${report.source?.runtimeFingerprint || 'UNKNOWN'}\``,
  `- Tested runtime fingerprint: \`${report.testedPackage?.runtimeFingerprint || 'UNKNOWN'}\``,
  `- Package fingerprint: \`${report.testedPackage?.packageFingerprint || 'UNKNOWN'}\``,
  `- GPU: ${gpu ? `${gpu.renderer} (${gpu.vendor})` : 'UNKNOWN'}`,
  `- Runtime: ${runtimeUrl || 'UNKNOWN'}`, '',
  '## Measurements', '',
  ...(first ? [
    `- Final distance: ${first.finalDistance} wu`,
    `- Minimum blocker clearance: ${first.minWallClearance} wu`,
    `- Maximum stall: ${first.maxStallTicks} ticks`,
    `- Repeat hashes: \`${first.trajectorySha256}\` / \`${second?.trajectorySha256 || 'UNKNOWN'}\``,
  ] : ['- Movement result: UNKNOWN']), '',
  '## Checks', '',
  ...Object.entries(checks).map(([name, ok]) => `- ${ok ? 'PASS' : 'FAIL'} — ${name}`),
  ...(served?.failures?.length ? ['', '## Served-runtime mismatches', '',
    ...served.failures.map(failure => `- ${failure.path}: ${failure.error || `${failure.status}; expected ${failure.expectedSha256}; received ${failure.actualSha256}`}`)] : []),
  ...(fatalError ? ['', '## Fatal error', '', '```text', fatalError, '```'] : []),
].join('\n');
await writeFile(reportMdPath, `${markdown}\n`);

const artifactFiles = [reportJsonPath, reportMdPath];
for (const run of runs) artifactFiles.push(join(output, `repetition-${run.rep}.json`));
const artifacts = [];
for (const path of artifactFiles) artifacts.push({ path, sha256: await sha256File(path) });
const evidenceIndexPath = join(output, 'evidence-index.json');
await writeFile(evidenceIndexPath, `${JSON.stringify({ schema: 'MassfrontEvidenceIndexV1', result: report.result, artifacts }, null, 2)}\n`);

console.log(JSON.stringify({
  output,
  evidenceIndex: evidenceIndexPath,
  evidenceIndexSha256: await sha256File(evidenceIndexPath),
  result: report.result,
  checks,
  measurements: first ? {
    finalDistance: first.finalDistance,
    minWallClearance: first.minWallClearance,
    maxStallTicks: first.maxStallTicks,
    deterministicRepeat: movementChecks.deterministicRepeat,
  } : null,
  fatalError,
}, null, 2));
if (!pass) process.exitCode = 1;
