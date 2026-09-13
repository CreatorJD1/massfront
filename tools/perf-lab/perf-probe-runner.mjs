/* MASSFRONT performance probe runner.
   Accepted evidence must enter a real match through PLAY OFFLINE -> War Room
   -> setup -> DEPLOY before any direct diagnostic load is injected. */

import { launchPwBrowser, closePwBrowser } from '../pw-browser.mjs';
import { assertHardwareGpu } from '../chrome-gpu.mjs';
import { installOfflineNetworkIsolation } from '../offline-network-isolation.mjs';
import { acquireVerificationFreeze } from '../evidence-foundation/workspace-guard.mjs';
import { inspectPng } from '../evidence-foundation/png-evidence.mjs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { freemem, totalmem } from 'node:os';
import {
  BENCHMARK_SCENARIOS,
  BROOD_PROXY_DENSITY_PRESETS,
  POPULATION_LADDERS,
  benchmarkScenarioSupport
} from './scenario-manifests.mjs';
import {
  setupDeterministicScenario,
  collectAuthoritativePopulation,
  collectBattlefieldTelemetry,
  frameEvidenceCamera,
  injectCombatDirective
} from './seeded-load-generator.mjs';
import {
  PERF_EVIDENCE_SCHEMA,
  PERF_EXECUTION_PATH,
  deriveStage8PerformanceGate,
  telemetryStats,
  validatePerfEvidence
} from './evidence-contract.mjs';
import { ANDROID_S25_USER_AGENT, S25_VIEWPORT, assertMobileGpuBranch } from '../mobile-device-profile.mjs';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LEGACY_PERF_ROOT = join(ROOT, 'tmp/perf-lab');
const CURRENT_PERF_ROOT = join(LEGACY_PERF_ROOT, 'current');
const METRICS_DIR = join(CURRENT_PERF_ROOT, 'metrics');
const CAPTURES_DIR = join(CURRENT_PERF_ROOT, 'captures');
const DIAGNOSTICS_DIR = join(CURRENT_PERF_ROOT, 'diagnostics');
const LEGACY_CAPTURES_DIR = join(LEGACY_PERF_ROOT, 'captures');
const DEFAULT_VIEWPORT = S25_VIEWPORT;
const HOST_MEMORY_POINT_CAP = 600;
const HOST_MEMORY_SAMPLE_INTERVAL_MS = 1000;
/* Cursor owns Stage 10 and may save these authoring-only utilities while the
   game performance lane is running. They are not loaded by index/boot or by
   this probe. Keep watching every other repository path, bind evidence to the
   complete executing input closure below, and record any concurrent saves. */
const CONCURRENT_STAGE10_AUTHORING = [
  'tools/blender/audit-stage10-z-fighting.py',
  'tools/blender/render-stage10-repaired-model-pack.py',
  'tools/blender/repair-stage10-model-pack.py',
  'tools/blender/texture-stage10-model-pack.py',
  'tools/build-stage10-repair-review-gallery.mjs',
  'tools/verify-stage10-repaired-model-pack.mjs',
  'docs/MASTER_PLAN_STAGE10_LAYOUT_PROCESSING_MANIFEST_2026-08-29.json',
  'docs/MASTER_PLAN_STAGE10_LAYOUT_PROCESSING_PREP_2026-08-29.md',
  'docs/MASTER_PLAN_STAGE10_LAYOUT_PROGRESS_2026-08-29.md',
  'docs/STAGE10_MODEL_REVIEW_LEDGER_2026-08-29.md',
  'docs/MASTER_PLAN_STATUS.md'
];
const PERF_PROBE_INPUTS = [
  'tools/perf-lab/perf-probe-runner.mjs',
  'tools/perf-lab/scenario-manifests.mjs',
  'tools/perf-lab/seeded-load-generator.mjs',
  'tools/perf-lab/evidence-contract.mjs',
  'tools/pw-browser.mjs',
  'tools/chrome-gpu.mjs',
  'tools/offline-network-isolation.mjs',
  'tools/mobile-device-profile.mjs',
  'tools/evidence-foundation/workspace-guard.mjs',
  'tools/evidence-foundation/png-evidence.mjs'
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fileSha256(path) {
  return sha256(await readFile(path));
}

function sameSourceIdentity(a, b) {
  return ['gitHead', 'worktreeFingerprint', 'runtimeFingerprint', 'testedEntrySha256', 'testedPackageSha256']
    .every(key => a?.[key] === b?.[key]);
}

function scenarioStem(scenarioId, unitsPerFaction) {
  if (!/^[a-z0-9_]+$/.test(scenarioId) || !Number.isInteger(unitsPerFaction) || unitsPerFaction < 1) {
    throw new Error(`Unsafe performance-output identity: ${scenarioId}/${unitsPerFaction}`);
  }
  return `${scenarioId}_${unitsPerFaction}u`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

export function parsePerformancePopulations(args = []) {
  const unitFlag = args.indexOf('--units');
  const rawUnits = unitFlag >= 0 ? args[unitFlag + 1] : null;
  if (unitFlag >= 0 && (!rawUnits || rawUnits.startsWith('--') || !/^\d+$/.test(rawUnits))) {
    throw new Error(`--units must be one of: ${POPULATION_LADDERS.join(', ')}`);
  }
  const units = rawUnits == null ? 500 : Number(rawUnits);
  if (!POPULATION_LADDERS.includes(units)) {
    throw new Error(`--units must be one of: ${POPULATION_LADDERS.join(', ')}`);
  }
  return args.includes('--ladder') ? [...POPULATION_LADDERS] : [units];
}

export function parseBroodProxyDensity(args = []) {
  const raw = valueAfter(args, '--proxy-density') || 'high';
  if (!Object.prototype.hasOwnProperty.call(BROOD_PROXY_DENSITY_PRESETS, raw)) {
    throw new Error(`--proxy-density must be one of: ${Object.keys(BROOD_PROXY_DENSITY_PRESETS).join(', ')}`);
  }
  return raw;
}

export function summarizeHostMemoryPressure({
  before = null,
  after = null,
  points = [],
  totalPointCount = points.length,
  totalBytes = null,
  observedFreeMinBytes = null,
  observedFreeMaxBytes = null
} = {}) {
  const total = Number(totalBytes);
  const retained = [before, ...points, after].filter(row => Number.isFinite(row?.freeBytes));
  const retainedValues = retained.map(row => Number(row.freeBytes));
  const freeMin = Number.isFinite(observedFreeMinBytes) ? Number(observedFreeMinBytes)
    : (retainedValues.length ? Math.min(...retainedValues) : null);
  const freeMax = Number.isFinite(observedFreeMaxBytes) ? Number(observedFreeMaxBytes)
    : (retainedValues.length ? Math.max(...retainedValues) : null);
  const threshold = Number.isFinite(total) && total > 0
    ? Math.max(512 * 1024 * 1024, Math.round(total * 0.10)) : null;
  return {
    schema: 'massfront-host-memory-pressure-v1',
    source: 'Node os.freemem()/os.totalmem() on the benchmark host',
    sampleIntervalMs: HOST_MEMORY_SAMPLE_INTERVAL_MS,
    pointCapacity: HOST_MEMORY_POINT_CAP,
    periodicTotalCount: totalPointCount,
    retainedPointCount: points.length,
    totalBytes: Number.isFinite(total) ? total : null,
    freeMinBytes: freeMin,
    freeMaxBytes: freeMax,
    pressureThresholdBytes: threshold,
    pressure: Number.isFinite(freeMin) && Number.isFinite(threshold) ? freeMin < threshold : null,
    before,
    after,
    points,
    limitation: 'Host-wide free memory is a confounder signal, not Android-device memory, process RSS, GPU memory, or hardware emulation. OS cache accounting may change independently of MASSFRONT.'
  };
}

function startHostMemoryMonitor() {
  const startedAt = performance.now();
  const totalBytes = totalmem();
  const points = [];
  let pointCursor = 0, totalPointCount = 0, freeMinBytes = Infinity, freeMaxBytes = -Infinity, stopped = false;
  const read = kind => {
    const freeBytes = freemem();
    freeMinBytes = Math.min(freeMinBytes, freeBytes);
    freeMaxBytes = Math.max(freeMaxBytes, freeBytes);
    return { kind, elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100, freeBytes };
  };
  const before = read('before');
  const sample = () => {
    const row = read('periodic');
    totalPointCount++;
    if (points.length < HOST_MEMORY_POINT_CAP) points.push(row);
    else { points[pointCursor] = row; pointCursor = (pointCursor + 1) % HOST_MEMORY_POINT_CAP; }
  };
  const timer = setInterval(sample, HOST_MEMORY_SAMPLE_INTERVAL_MS);
  timer.unref?.();
  return {
    stop() {
      if (stopped) throw new Error('Host memory monitor was already stopped');
      stopped = true; clearInterval(timer);
      const after = read('after');
      const ordered = points.length === HOST_MEMORY_POINT_CAP && totalPointCount > HOST_MEMORY_POINT_CAP
        ? [...points.slice(pointCursor), ...points.slice(0, pointCursor)] : [...points];
      return summarizeHostMemoryPressure({
        before, after, points: ordered, totalPointCount, totalBytes,
        observedFreeMinBytes: freeMinBytes, observedFreeMaxBytes: freeMaxBytes
      });
    }
  };
}

function finiteRange(values) {
  const finite = Array.isArray(values) ? values.filter(Number.isFinite) : [];
  return {
    sampleCount: finite.length,
    min: finite.length ? Math.min(...finite) : null,
    max: finite.length ? Math.max(...finite) : null
  };
}

export function summarizeMeasurementCoverage(samples = {}, expectedTotal = null, admission = {}) {
  const requested = Number(expectedTotal);
  const attempted = Number(admission.attempted?.total);
  const accepted = Number(admission.accepted?.total);
  const postSettle = Number(admission.postSettle?.total);
  const exact = Number.isFinite(requested) && attempted === requested && accepted === requested &&
    postSettle === requested && admission.postSettle?.unmatched === 0;
  const brood = {
    realBodies: finiteRange(samples.realBroodUnits),
    cameraVisibleBodies: finiteRange(samples.cameraVisibleBroodUnits),
    visibleBodies: finiteRange(samples.visibleBroodUnits),
    proxyBodies: finiteRange(samples.proxyBodies),
    proxyClusters: finiteRange(samples.proxyClusters)
  };
  return {
    admission: {
      label: 'exact-authoritative-admission-before-measurement',
      exact,
      requested: Number.isFinite(requested) ? requested : null,
      attempted: Number.isFinite(attempted) ? attempted : null,
      accepted: Number.isFinite(accepted) ? accepted : null,
      postSettle: Number.isFinite(postSettle) ? postSettle : null,
      unmatched: Number.isFinite(admission.postSettle?.unmatched) ? admission.postSettle.unmatched : null
    },
    liveSample: {
      label: 'live-authoritative-population-during-presented-frame-sample',
      total: finiteRange(samples.totalUnits)
    },
    brood: {
      label: 'live-brood-and-proxy-coverage-during-presented-frame-sample',
      ...brood,
      visibleRealBroodCovered: brood.visibleBodies.sampleCount > 0 && brood.visibleBodies.max > 0,
      proxyTelemetryCovered: brood.proxyBodies.sampleCount > 0 || brood.proxyClusters.sampleCount > 0
    }
  };
}

export function cleanupDiagnosticCandidate(record, error) {
  const measurement = JSON.parse(JSON.stringify(record));
  const originalOutcome = measurement?.performanceGate?.outcome || null;
  measurement.evidenceStatus = 'diagnostic';
  measurement.evidenceClass = 'diagnostic-incomplete';
  measurement.performanceGate = {
    ...(measurement.performanceGate || {}),
    outcome: 'DIAGNOSTIC/INCOMPLETE', evidenceStatus: 'diagnostic', evidenceClass: 'diagnostic-incomplete',
    acceptancePopulationEligible: false, thresholdPassed: false, cleanupQualified: false,
    originalMeasuredOutcome: originalOutcome
  };
  return {
    schema: 'massfront-perf-cleanup-diagnostic-v1',
    evidenceStatus: 'diagnostic', evidenceClass: 'diagnostic-incomplete', acceptanceEligible: false,
    invalidation: {
      stage: 'owned-browser-cleanup', code: 'PW_OWNED_CLEANUP_INCOMPLETE',
      message: error?.message || String(error)
    },
    measurement
  };
}

async function prepareScenarioOutput(scenarioId, unitsPerFaction, metricsDir, capturesDir) {
  const stem = scenarioStem(scenarioId, unitsPerFaction);
  const removed = [];
  const metric = join(metricsDir, `${stem}_v3.json`);
  if (existsSync(metric)) { await rm(metric, { force: true }); removed.push(relative(ROOT, metric).replace(/\\/g, '/')); }
  const oldCapture = new RegExp(`^${escapeRegExp(stem)}_(?:[a-f0-9]{12}_\\d+|desktop-v3)_(?:start|mid|end)\\.png(?:\\.partial-\\d+)?$`);
  for (const file of await readdir(capturesDir)) {
    if (!oldCapture.test(file)) continue;
    const path = join(capturesDir, file);
    await rm(path, { force: true });
    removed.push(relative(ROOT, path).replace(/\\/g, '/'));
  }
  return { mode: 'bounded-current', removed };
}

export async function prepareCurrentPerfOutput({
  scenarios,
  populations,
  currentRoot = CURRENT_PERF_ROOT
} = {}) {
  if (!Array.isArray(scenarios) || !scenarios.length) throw new Error('Current performance output requires scenarios');
  if (!Array.isArray(populations) || !populations.length ||
      populations.some(value => !POPULATION_LADDERS.includes(value))) {
    throw new Error(`Current performance output populations must be one of: ${POPULATION_LADDERS.join(', ')}`);
  }
  const metricsDir = join(currentRoot, 'metrics');
  const capturesDir = join(currentRoot, 'captures');
  const reportsDir = join(currentRoot, 'reports');
  const diagnosticsDir = join(currentRoot, 'diagnostics');
  await Promise.all([
    mkdir(metricsDir, { recursive: true }),
    mkdir(capturesDir, { recursive: true }),
    mkdir(reportsDir, { recursive: true }),
    mkdir(diagnosticsDir, { recursive: true })
  ]);
  const removed = [];
  for (const scenario of scenarios) {
    const support = benchmarkScenarioSupport(scenario);
    if (support.status === 'supported') {
      for (const unitsPerFaction of populations) {
        removed.push(...(await prepareScenarioOutput(
          scenario.id, unitsPerFaction, metricsDir, capturesDir
        )).removed);
        const diagnosticPath = join(diagnosticsDir, `${scenarioStem(scenario.id, unitsPerFaction)}_cleanup_incomplete_v3.json`);
        if (existsSync(diagnosticPath)) {
          await rm(diagnosticPath, { force: true });
          removed.push(relative(ROOT, diagnosticPath).replace(/\\/g, '/'));
        }
        const profilePattern = new RegExp(`^${escapeRegExp(scenarioStem(scenario.id, unitsPerFaction))}_[a-z0-9-]+_sample[12]\\.cpuprofile$`);
        for (const file of await readdir(diagnosticsDir)) {
          if (!profilePattern.test(file)) continue;
          const profilePath = join(diagnosticsDir, file);
          await rm(profilePath, { force: true });
          removed.push(relative(ROOT, profilePath).replace(/\\/g, '/'));
        }
      }
      continue;
    }
    const unsupportedPath = join(metricsDir, `${scenario.id}_unsupported_v3.json`);
    if (existsSync(unsupportedPath)) {
      await rm(unsupportedPath, { force: true });
      removed.push(relative(ROOT, unsupportedPath).replace(/\\/g, '/'));
    }
  }
  for (const file of await readdir(metricsDir)) {
    if (!/^summary_matrix_[a-f0-9]{12}_v3\.json$/.test(file)) continue;
    const path = join(metricsDir, file);
    await rm(path, { force: true });
    removed.push(relative(ROOT, path).replace(/\\/g, '/'));
  }
  for (const file of ['EVIDENCE_REJECTION_LEDGER.json', 'BENCHMARK_MATRIX_REPORT.md', 'benchmark_matrix.csv']) {
    const path = join(reportsDir, file);
    if (!existsSync(path)) continue;
    await rm(path, { force: true });
    removed.push(relative(ROOT, path).replace(/\\/g, '/'));
  }
  return {
    mode: 'bounded-current',
    root: currentRoot,
    metricsDir,
    capturesDir,
    reportsDir,
    diagnosticsDir,
    removed
  };
}

async function preserveCleanupDiagnostics(results, error) {
  await mkdir(DIAGNOSTICS_DIR, { recursive: true });
  const paths = [];
  for (const result of results) {
    const path = join(DIAGNOSTICS_DIR, `${scenarioStem(result.scenarioId, result.unitsPerFaction)}_cleanup_incomplete_v3.json`);
    await writeFile(path, `${JSON.stringify(cleanupDiagnosticCandidate(result, error), null, 2)}\n`, 'utf8');
    paths.push(path);
  }
  return paths;
}

async function gitOutput(args) {
  const { stdout } = await execFileAsync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function runtimeTree(base, prefix = '') {
  const manifest = JSON.parse(await readFile(join(base, 'assets/data/manifest.json'), 'utf8'));
  const entryText = await readFile(join(base, 'index.html'), 'utf8');
  const linkedFiles = [...entryText.matchAll(/(?:src|href)=["']\.\/?([^"'?#]+)(?:\?[^"']*)?["']/g)]
    .map(match => match[1]).filter(path => existsSync(join(base, path)));
  const descriptor = 'assets/data/runtime-compatibility.json';
  const files = [...new Set([
    'index.html', 'boot.js', 'assets/data/manifest.json', ...linkedFiles, ...(manifest.order || []),
    ...(existsSync(join(base, descriptor)) ? [descriptor] : [])
  ])];
  const hash = createHash('sha256');
  const records = [];
  for (const path of files) {
    const absolute = join(base, path);
    if (!existsSync(absolute)) throw new Error(`Runtime fingerprint input is missing: ${prefix}${path}`);
    const bytes = await readFile(absolute), digest = sha256(bytes);
    hash.update(`path\0${prefix}${path}\0`); hash.update(bytes); hash.update('\0');
    records.push({ path: `${prefix}${path}`, bytes: bytes.length, sha256: digest });
  }
  return { manifest, files, records, fingerprint: hash.digest('hex') };
}

function parityBytes(path, bytes) {
  if (path !== 'boot.js') return bytes;
  /* pack-www deliberately changes only this capability bit in its copied
     boot.js when the optional Galactic pack is omitted. Compare every other
     byte so the intentional package transform cannot hide stale runtime JS. */
  return Buffer.from(bytes.toString('utf8').replace(
    /window\.__MF_BUILD_HAS_GALACTIC_EXPLORATION=(?:true|false);/,
    'window.__MF_BUILD_HAS_GALACTIC_EXPLORATION=__PACKAGED_CAPABILITY__;'
  ));
}

async function assertPackedJsParity(sourceTree, packedTree, packedRoot) {
  const sourceOrder = sourceTree.manifest.order || [], packedOrder = packedTree.manifest.order || [];
  if (JSON.stringify(sourceOrder) !== JSON.stringify(packedOrder)) {
    throw new Error('Packed www runtime JavaScript is stale: manifest order differs; run node tools/pack-www.mjs');
  }
  const paths = ['boot.js', ...sourceOrder.filter(path => path.endsWith('.js'))];
  const mismatches = [];
  for (const path of paths) {
    const packedPath = join(packedRoot, path);
    if (!existsSync(packedPath)) { mismatches.push(`${path} (missing)`); continue; }
    const [sourceBytes, packedBytes] = await Promise.all([readFile(join(ROOT, path)), readFile(packedPath)]);
    if (!parityBytes(path, sourceBytes).equals(parityBytes(path, packedBytes))) mismatches.push(path);
  }
  if (mismatches.length) {
    throw new Error(`Packed www runtime JavaScript is stale (${mismatches.slice(0, 8).join(', ')}); run node tools/pack-www.mjs`);
  }
}

export async function collectSourceIdentity({ sourceRuntime = false } = {}) {
  const gitHead = (await gitOutput(['rev-parse', 'HEAD'])).trim();
  const status = await gitOutput(['status', '--porcelain=v1', '--untracked-files=all']);
  const dirty = status.trim().length > 0;

  const sourceTree = await runtimeTree(ROOT);
  const packedRoot = join(ROOT, 'www');
  const servingPacked = !sourceRuntime && existsSync(join(packedRoot, 'index.html'));
  const servedTree = servingPacked ? await runtimeTree(packedRoot, 'www/') : sourceTree;
  if (servingPacked) await assertPackedJsParity(sourceTree, servedTree, packedRoot);
  const runtimeFingerprint = servedTree.fingerprint;
  const inputFiles = [...new Set([...sourceTree.files, ...PERF_PROBE_INPUTS])].sort();
  const inputClosure = createHash('sha256');
  inputClosure.update(`head\0${gitHead}\0`);
  const inputRecords = [];
  for (const path of inputFiles) {
    const absolute = join(ROOT, path);
    if (!existsSync(absolute)) throw new Error(`Performance input-closure file is missing: ${path}`);
    const bytes = await readFile(absolute);
    const digest = sha256(bytes);
    inputClosure.update(`path\0${path}\0${digest}\0`);
    inputRecords.push({ path, bytes: bytes.length, sha256: digest });
  }
  if (servingPacked) {
    for (const record of servedTree.records) {
      inputClosure.update(`path\0${record.path}\0${record.sha256}\0`);
      inputRecords.push(record);
    }
  }
  const inputClosureFingerprint = inputClosure.digest('hex');
  const testedEntry = servingPacked ? 'www/index.html' : 'index.html';
  return {
    gitHead,
    gitDirty: dirty,
    /* Kept under the schema's established field name: it is now the explicit
       executing closure rather than every unrelated dirty authoring file. */
    worktreeFingerprint: inputClosureFingerprint,
    inputClosureFingerprint,
    inputClosure: inputRecords,
    runtimeFingerprint,
    sourceRuntimeFingerprint: sourceTree.fingerprint,
    servedRuntimeRoot: servingPacked ? 'www/' : './',
    testedEntry,
    testedEntrySha256: await fileSha256(join(ROOT, testedEntry)),
    /* This hashes the entry, linked manifests/styles, boot, manifest-ordered
       scripts, and the pack-generated compatibility descriptor when present. */
    testedPackageSha256: runtimeFingerprint
  };
}

async function collectConcurrentStage10Snapshot() {
  const files = [];
  for (const path of CONCURRENT_STAGE10_AUTHORING) {
    const absolute = join(ROOT, path);
    if (!existsSync(absolute)) { files.push({ path, exists: false }); continue; }
    const [info, bytes] = await Promise.all([stat(absolute), readFile(absolute)]);
    files.push({ path, exists: true, bytes: bytes.length, mtimeMs: info.mtimeMs, sha256: sha256(bytes) });
  }
  return { fingerprint: sha256(JSON.stringify(files)), files };
}

export async function startStaticServer({ sourceRuntime = false } = {}) {
  /* Packaged verification must read www/, not the repo-root dev tree. Root
     index.html matches byte-for-byte today, but www/ is what Capacitor, OTA
     shell, and port-8901 acceptance actually ship — serving root hid stale
     www/ mistakes and made screenshots look like an old build. */
  const WWW = join(ROOT, 'www');
  const SERVE_ROOT = !sourceRuntime && existsSync(join(WWW, 'index.html')) ? WWW : ROOT;
  if (SERVE_ROOT !== ROOT) console.log('[static-server] serving packaged www/');
  const server = createServer(async (req, res) => {
    try {
      let requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (requestPath === '/') requestPath = '/index.html';
      const file = resolve(SERVE_ROOT, `.${requestPath}`);
      const rel = relative(SERVE_ROOT, file);
      if (rel.startsWith(`..${sep}`) || rel === '..' || !existsSync(file)) {
        res.writeHead(404); res.end('Not Found'); return;
      }
      const extension = extname(file).toLowerCase();
      const mime = extension === '.html' ? 'text/html'
        : extension === '.js' || extension === '.mjs' ? 'text/javascript'
        : extension === '.css' ? 'text/css'
        : extension === '.json' ? 'application/json'
        : extension === '.webmanifest' ? 'application/manifest+json'
        : extension === '.png' ? 'image/png'
        : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg'
        : extension === '.webp' ? 'image/webp'
        : extension === '.ogg' ? 'audio/ogg'
        : extension === '.m4a' ? 'audio/mp4'
        : extension === '.wasm' ? 'application/wasm'
        : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
      res.end(await readFile(file));
    } catch (error) {
      res.writeHead(500); res.end(`Server Error: ${error.message}`);
    }
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise(resolveClose => server.close(resolveClose))
  };
}

export async function installTelemetryInit(page) {
  const networkIsolation = await installOfflineNetworkIsolation(page);
  await page.addInitScript(() => {
    /* The QA origin is an ephemeral local port. Clear only its auth keys so a
       reused Chrome profile must exercise PLAY OFFLINE on every evidence run. */
    try {
      localStorage.removeItem('mf_auth_gate_v1');
      localStorage.removeItem('massfront_authp_session_v1');
    } catch {}
    window.__mfProbe = {
      resourceCounts: { textures: 0, buffers: 0, programs: 0, vaos: 0, fbos: 0 },
      longTasks: [],
      longTaskTotalCount: 0,
      contextLossEvents: 0
    };
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const probe = window.__mfProbe;
          probe.longTaskTotalCount++;
          if (probe.longTasks.length >= 256) probe.longTasks.shift();
          probe.longTasks.push({ name: entry.name, startTime: entry.startTime, duration: entry.duration });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {}
    document.addEventListener('webglcontextlost', () => { window.__mfProbe.contextLossEvents++; }, true);
    if (typeof WebGL2RenderingContext === 'undefined' || WebGL2RenderingContext.prototype.__mfPerfWrapped) return;
    const proto = WebGL2RenderingContext.prototype;
    Object.defineProperty(proto, '__mfPerfWrapped', { value: true, configurable: true });
    for (const [method, counter] of [
      ['createTexture', 'textures'], ['createBuffer', 'buffers'], ['createProgram', 'programs'],
      ['createVertexArray', 'vaos'], ['createFramebuffer', 'fbos']
    ]) {
      const original = proto[method];
      if (typeof original !== 'function') continue;
      proto[method] = function(...args) {
        window.__mfProbe.resourceCounts[counter]++;
        return original.apply(this, args);
      };
    }
  });
  return networkIsolation;
}

export async function applyPreset(page, preset) {
  const selected = await page.evaluate(value => {
    const allowed = ['low', 'medium', 'high', 'cinematic'];
    if (!allowed.includes(value)) throw new Error(`Unknown graphics preset: ${value}`);
    if (typeof META === 'undefined' || !META.settings) throw new Error('Graphics settings are unavailable');
    META.settings.quality = value;
    META.settings.gfxOver = {};
    if (typeof applyQualityPreset === 'function') applyQualityPreset();
    return typeof mfGfxKey === 'function' ? mfGfxKey() : value;
  }, preset);
  if (selected !== preset) throw new Error(`Graphics preset did not apply: requested ${preset}, live ${selected}`);
  return selected;
}

async function clickVisible(page, selector, label, timeout = 20000) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible', timeout });
  await locator.click();
  return label;
}

export async function enterGalacticStandardRoute(page) {
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__, null, { timeout: 60000 });
  /* Integrated launches now open Galactic Command directly. #btnUgaCommand is
     intentionally hidden because the player is already on that surface; a
     verifier that tries to press it again falsely reports a deployment fault.
     Prove the player-visible Campaign Hub state, then use PLAY's Standard card. */
  await page.waitForFunction(() => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    };
    return window.__MASSFRONT_SPACE__?.scene === 'uga'
      && document.getElementById('moduleFrame')?.dataset.entryView === 'campaign_hub'
      && visible(document.querySelector('.uga-campaign-hub'))
      && visible(document.querySelector('[data-nav="classic"]'));
  }, null, { timeout: 60000 });
  const entry = await page.evaluate(() => {
    const hidden = element => {
      if (!element) return true;
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      return style.display === 'none' || style.visibility === 'hidden' || box.width <= 0 || box.height <= 0;
    };
    return {
      entryView: document.getElementById('moduleFrame')?.dataset.entryView || '',
      scene: window.__MASSFRONT_SPACE__?.scene || '',
      campaignHub: !hidden(document.querySelector('.uga-campaign-hub')),
      redundantUgaControlHidden: hidden(document.getElementById('btnUgaCommand'))
    };
  });
  if (entry.entryView !== 'campaign_hub' || entry.scene !== 'uga' || !entry.campaignHub || !entry.redundantUgaControlHidden)
    throw new Error(`Integrated Galactic entry contract failed: ${JSON.stringify(entry)}`);
  await clickVisible(page, '[data-nav="classic"]', 'PLAY', 30000);
  await clickVisible(page, '[data-command-mode="standard"][data-hub-route="standard"]', 'STANDARD', 30000);
  await page.waitForURL(/galacticRoute=/, { timeout: 30000 });
  return entry;
}

export async function enterRealBattle(page, opts = {}) {
  const fromMainMenu = opts.fromMainMenu === true;
  await page.waitForFunction(() => !document.getElementById('mfBootCover'), null, { timeout: 90000 });
  const intro = page.locator('#mfIntroStart');
  if (await intro.isVisible().catch(() => false)) {
    /* The title can finish its own dismissal between the visibility probe and
       Playwright's actionability retry.  That is already the desired state,
       so a disappearing intro must not strand an otherwise valid probe. */
    await intro.click({ timeout: 3000 }).catch(() => {});
  }
  /* Each of these swaps a full-screen panel with a transition. Clicking the
     next control the instant it reports visible lands the tap mid-transition
     and it is swallowed, leaving the run stranded on the previous screen.
     Let each panel settle first. */
  if (!fromMainMenu) {
    /* Fresh installs traverse updater -> intro -> account -> launcher, while a
       remembered offline identity can omit either account or launcher. Walk
       only explicit forward controls until the same main menu is reached. */
    for (let gate = 0; gate < 6 && !await page.locator('#startBtn').isVisible().catch(() => false); gate++) {
      await page.waitForFunction(() => {
        const visible=id=>{const node=document.getElementById(id),style=node&&getComputedStyle(node),box=node&&node.getBoundingClientRect();
          return !!(node&&style.display!=='none'&&style.visibility!=='hidden'&&box.width>0&&box.height>0);};
        const state=typeof mfLauncherSnapshot==='function'?mfLauncherSnapshot():null;
        const primary=document.getElementById('mfLaunchPlay');
        return location.pathname.includes('/modules/space_exploration/')&&!!window.__MASSFRONT_SPACE__||
          visible('startBtn')||visible('mfIntroStart')||visible('apOfflineBtn')||visible('mfLaunchOffline')||
          (visible('mfLaunchPlay')&&!primary.disabled&&state&&/^play-/.test(state.primary));
      }, null, { timeout: 30000 });
      if (page.url().includes('/modules/space_exploration/')) break;
      if (await page.locator('#startBtn').isVisible().catch(() => false)) break;
      if (await page.locator('#mfIntroStart').isVisible().catch(() => false)) await page.locator('#mfIntroStart').click({timeout:3000}).catch(()=>{});
      else if (await page.locator('#apOfflineBtn').isVisible().catch(() => false)) await page.locator('#apOfflineBtn').click();
      else if (await page.locator('#mfLaunchOffline').isVisible().catch(() => false)) await page.locator('#mfLaunchOffline').click();
      else await page.locator('#mfLaunchPlay').click();
      await page.waitForTimeout(700);
    }
  }
  const viaGalactic=page.url().includes('/modules/space_exploration/');
  if(viaGalactic){
    await enterGalacticStandardRoute(page);
  }else{
    /* Fresh careers can offer onboarding after either the launcher path or a
       probe's pre-seeded main-menu path. Follow the real experienced-player
       choice instead of letting the modal intercept War Room. */
    const onboardingSkip = page.locator('#mfOnboardingSkip');
    if (await onboardingSkip.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
      await onboardingSkip.click();
      await page.waitForTimeout(350);
    }
    await clickVisible(page, '#startBtn', 'War Room', 30000);
    await page.waitForTimeout(700);
    await clickVisible(page, '.warCard[data-mode="standard"]', 'Standard match card', 30000);
    await page.waitForTimeout(700);
  }

  /* The war table is GALAXY -> SYSTEM -> PLANET -> REGION -> DEPLOY and each
     stage exposes its own commit control (#setupStart on some, a world/region
     chip or quick-plan card on others). The previous fixed loop of five
     #setupStart clicks stalled on a hidden #setupStart and no run could reach
     a battle. Advance on whichever control the current stage actually shows. */
  /* Deliberately no generic '.mbtn'/'.warCard' fallback: those match #setupBack
     / #warBack and silently walk the run BACKWARDS to the card list. Only
     forward controls belong here. #setupStart is the commit on the SYSTEM,
     REGION and DEPLOY stages (galaxyui.js:1230 binds it as `launch`). */
  const ADVANCE = [
    '#setupStart',            // commit (SYSTEM, REGION, DEPLOY stages)
    '.mfWorldChip',           // GALAXY: first chip is the unlocked system
    '.mfRegionChip',          // PLANET: first chip is the unlocked region
    '.mfQuickPlan',           // DEPLOY: force template
    '.mfTeamBtn',
    '#mfConquestContinue'
  ];
  // Which war-table stage panel is on screen, used to confirm a tap advanced us.
  const stageSignature = () => page.evaluate(() => {
    const vis = el => {
      if (!el) return false;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const panels=[...document.querySelectorAll('[id^="mfStage"]')].filter(vis).map(el=>el.id).join(',');
    if(panels)return panels;
    /* During the secured-route first paint, setupScr is already visible a
       frame before its selected stage panel gains geometry. The persistent
       HUD DOM also has dimensions under menu CSS, so treating that instant as
       in-world exits the setup loop before START BATTLE is ever pressed. */
    if(vis(document.getElementById('setupScr')))
      return 'setup:'+(typeof mfGalaxyStage!=='undefined'?mfGalaxyStage:'pending');
    return vis(document.getElementById('cmdbar'))&&!document.body.classList.contains('menuMode') ? 'in-world' : 'unknown';
  }).catch(() => 'unknown');

  let setupClicks = 0;
  /* Each of the five first-career orientation acknowledgements consumes its
     own loop pass. Slow mobile paints can reveal the final card only after the
     transition pass, so a 20-pass ceiling could expire with START BATTLE still
     usable on screen. This remains bounded, but covers that complete route. */
  for (let step = 0; step < 48; step++) {
    // The world is up once the carrier's DEPLOY BASE HERE control appears.
    if (await page.locator('#deployBtn').first().isVisible().catch(() => false)) break;
    /* A fresh career receives one War Table orientation card per stage. Its
       acknowledgement is part of the real player path and can sit above the
       same stage whose forward control we are about to press. */
    const primer=page.locator('.wtpDone').first();
    if(await primer.isVisible().catch(()=>false)){
      const beforePrimer=await page.evaluate(()=>typeof __wtpDebug==='function'?__wtpDebug():null);
      await primer.tap({timeout:20000}).catch(()=>primer.click({timeout:20000}));
      await page.waitForTimeout(700);
      if(await primer.isVisible().catch(()=>false)){
        const afterPrimer=await page.evaluate(()=>typeof __wtpDebug==='function'?__wtpDebug():null);
        throw new Error('War-table orientation acknowledgement did not commit: '+JSON.stringify({beforePrimer,afterPrimer}));
      }
      continue;
    }
    const before = await stageSignature();
    /* The secured launch briefly hides setup before the next War Table paint.
       A visible command dock in that handoff frame is not proof that the
       carrier world owns input yet. Keep observing until DEPLOY BASE HERE is
       actually visible; if setup returns, the next pass services its primer. */
    if (before === 'in-world') { await page.waitForTimeout(850); continue; }
    /* A route handoff can briefly have neither setup geometry nor an input-owning
       world surface. It is a paint boundary, not a stalled player state. */
    if (before === 'unknown') { await page.waitForTimeout(450); continue; }
    let advanced = false;
    for (const selector of ADVANCE) {
      const locator = page.locator(selector).first();
      if (!(await locator.isVisible().catch(() => false))) continue;
      /* The war table uses two-tap arm/commit navigation (galaxyui.js:1349):
         the first tap arms a chip, the second commits it. Tapping once and
         judging "no progress" is what made the previous attempt fall through
         to a BACK button. Give each control both taps before moving on. */
      for (let tap = 0; tap < 2 && !advanced; tap++) {
        await locator.click({ timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(650);
        if (await stageSignature() !== before ||
            await page.locator('#deployBtn').first().isVisible().catch(() => false)) {
          advanced = true;
        }
      }
      if (advanced) break;
    }
    if (!advanced) throw new Error(`War-table setup stalled at stage "${before}" — no control advanced it.`);
    setupClicks++;
  }

  /* The match world loads with the carrier still airborne — the HUD says
     "tap ground to fly there, then DEPLOY". matchLive only becomes true once
     the base is actually placed, so the run must finish that placement. */
  const deployReady=await page.locator('#deployBtn').first().isVisible().catch(()=>false);
  const exitState=await stageSignature();
  if(!deployReady&&exitState!=='in-world')throw new Error('War-table setup transition budget exhausted at '+exitState);
  await page.locator('#deployBtn').first().waitFor({ state: 'visible', timeout: 90000 });
  const canvasBox = await page.locator('#gl').boundingBox().catch(() => null);
  if (canvasBox) {
    await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height * 0.45);
    await page.waitForTimeout(2500);
  }
  // The button can be mid-animation as the carrier flies; the ground tap alone
  // often commits the drop, so a failed click here is not fatal. The
  // matchLive wait below is the real gate.
  await page.locator('#deployBtn').first().click({ timeout: 20000 }).catch(() => {});
  await page.waitForFunction(() => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    return typeof matchLive !== 'undefined' && matchLive === true &&
      typeof running !== 'undefined' && running === true &&
      visible(document.getElementById('topbar')) && visible(document.getElementById('cmdbar'));
  }, null, { timeout: 60000 });
  return page.evaluate(clicks => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    const authUiVisible = visible(document.getElementById('apOverlay')) || visible(document.getElementById('apForm')) ||
      visible(document.getElementById('authPortal')) || visible(document.getElementById('apOfflineBtn'));
    const menuUiVisible = [...document.querySelectorAll('.overlay')].some(visible);
    const proof = {
      deployedViaUi: true,
      playOfflineUsed: true,
      warRoomUsed: true,
      /* Completion is "the war-table stages were traversed and the battle is
         actually live", not a fixed click count — the stage count is a UI
         detail that already changed once and silently broke every run. */
      setupStagesCompleted: clicks > 0 && typeof matchLive !== 'undefined' && matchLive === true,
      setupClicks: clicks,
      authUiVisible,
      menuUiVisible,
      battleHudVisible: visible(document.getElementById('topbar')) && visible(document.getElementById('cmdbar')),
      matchLive: typeof matchLive !== 'undefined' && matchLive === true,
      running: typeof running !== 'undefined' && running === true,
      atPerformanceMs: performance.now()
    };
    window.__mfPerfRealDeployment = proof;
    return proof;
  }, setupClicks);
}

async function runtimeState(page) {
  return page.evaluate(() => {
    const atPerformanceMs = performance.now();
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    let authoritativeUnits = null;
    if (typeof teamCount !== 'undefined' && teamCount && teamCount.length >= 3) {
      authoritativeUnits = Number(teamCount[0]) + Number(teamCount[1]) + Number(teamCount[2]);
    } else if (typeof ualive !== 'undefined' && typeof unitHigh !== 'undefined') {
      authoritativeUnits = 0;
      for (let index = 0; index < unitHigh; index++) if (ualive[index]) authoritativeUnits++;
    }
    const menuUiVisible = [...document.querySelectorAll('.overlay')].some(visible);
    const simStepSec = typeof MF_SIM_DT !== 'undefined' && Number.isFinite(MF_SIM_DT) && MF_SIM_DT > 0
      ? Number(MF_SIM_DT) : null;
    const simTick = typeof mfDetTick !== 'undefined' && Number.isInteger(mfDetTick)
      ? Number(mfDetTick)
      : (typeof tick !== 'undefined' && Number.isInteger(tick) ? Number(tick) : null);
    const simTickSource = typeof mfDetTick !== 'undefined' && Number.isInteger(mfDetTick) ? 'mfDetTick'
      : (typeof tick !== 'undefined' && Number.isInteger(tick) ? 'tick' : null);
    const simTimeSec = typeof stats !== 'undefined' && Number.isFinite(stats?.t) ? stats.t : null;
    return {
      atPerformanceMs,
      authUiVisible: visible(document.getElementById('apOverlay')) || visible(document.getElementById('apForm')) ||
        visible(document.getElementById('authPortal')) || visible(document.getElementById('apOfflineBtn')),
      menuUiVisible,
      battleHudVisible: visible(document.getElementById('topbar')) && visible(document.getElementById('cmdbar')),
      matchLive: typeof matchLive !== 'undefined' && matchLive === true,
      running: typeof running !== 'undefined' && running === true,
      paused: typeof paused !== 'undefined' ? !!paused : null,
      contextLossCount: window.__mfProbe?.contextLossEvents ?? null,
      contextIsLost: typeof gl !== 'undefined' && gl && typeof gl.isContextLost === 'function' ? gl.isContextLost() : null,
      simTimeSec,
      simStepSec,
      simTick,
      simTickSource,
      simAccumulatorSec: typeof acc !== 'undefined' && Number.isFinite(acc) ? Number(acc) : null,
      simBacklogSteps: typeof acc !== 'undefined' && Number.isFinite(acc) && simStepSec != null
        ? Number(acc) / simStepSec : null,
      gameSpeed: typeof gameSpeed !== 'undefined' && Number.isFinite(gameSpeed) ? Number(gameSpeed) : null,
      authoritativeUnits,
      camera: typeof cam !== 'undefined' ? {
        x: Number(cam.x), y: Number(cam.y),
        span: typeof orthoSpan !== 'undefined' ? Number(orthoSpan) : null,
        pitch: typeof pitch !== 'undefined' ? Number(pitch) : null,
        yaw: typeof yaw !== 'undefined' ? Number(yaw) : null
      } : null,
      preset: typeof mfGfxKey === 'function' ? mfGfxKey() : null
    };
  });
}

function assertRuntimeState(state, label) {
  const failures = [];
  if (state.authUiVisible) failures.push('auth UI visible');
  if (state.menuUiVisible) failures.push('front/menu UI visible');
  if (!state.battleHudVisible) failures.push('battle HUD absent');
  if (!state.matchLive) failures.push('matchLive false');
  if (!state.running) failures.push('running false');
  if (!Number.isFinite(state.simStepSec) || state.simStepSec <= 0) failures.push('MF_SIM_DT unavailable');
  if (!Number.isInteger(state.simTick) || !state.simTickSource) failures.push('authority tick (mfDetTick/tick) unavailable');
  if (state.contextLossCount !== 0) failures.push(`context loss count ${state.contextLossCount}`);
  if (state.contextIsLost) failures.push('WebGL context is lost');
  if (failures.length) throw new Error(`${label} runtime gate failed: ${failures.join(', ')}`);
}

export async function enableRuntimeTelemetry(page) {
  const enabled = await page.evaluate(() => typeof mfPerfEnable === 'function' ? mfPerfEnable(true) : false);
  if (!enabled) throw new Error('Native mfPerf telemetry could not be enabled');
}

async function takePerfCheckpoint(page, label) {
  return page.evaluate(checkpointLabel => {
    if (typeof mfPerfSnapshot !== 'function') throw new Error('Native mfPerfSnapshot is unavailable');
    return { label: checkpointLabel, atPerformanceMs: performance.now(), snapshot: mfPerfSnapshot() };
  }, label);
}

async function sampleFrames(page, totalFrames, initialGpuSampleSerial = null) {
  return page.evaluate(async ({ frameCount, initialGpuSampleSerial: initialSerial }) => {
    const probe = {
      frameDts: [], rafCallbackDts: [], presentationFrames: [], simTicks: [],
      simTimes: [], renderTimes: [], gpuTimes: [], gpuSampleSerials: [],
      gpuResultAges: [], gpuQueryLatencies: [], gpuDisjointFlags: [], drawCalls: [], triangles: [],
      totalUnits: [], visibleUnits: [], culledUnits: [], visibilityValidity: [], particleCounts: [], projectileCounts: [], heapUsed: [],
      realBroodUnits: [], cameraVisibleBroodUnits: [], visibleBroodUnits: [], proxyBodies: [], proxyClusters: [],
      simBacklogSteps: [], reconciliation: []
    };
    const push = (array, value) => { if (Number.isFinite(value)) array.push(value); };
    if (typeof mfPerfLatest !== 'function') throw new Error('Cheap mfPerfLatest telemetry is unavailable');
    if (typeof MF_SIM_DT === 'undefined' || !Number.isFinite(MF_SIM_DT) || MF_SIM_DT <= 0) {
      throw new Error('Authoritative MF_SIM_DT is unavailable during performance sampling');
    }
    if (typeof mfPresentationFrames === 'undefined' || !Number.isInteger(mfPresentationFrames)) {
      throw new Error('mfPresentationFrames is unavailable during performance sampling');
    }
    const latest = {};
    /* Establish a fresh baseline for each measured half. A query that retired
       during the mid capture is not a sample from either measured window. */
    const baseline = mfPerfLatest(latest);
    const baselineSerial = Number(baseline?.gpuSampleSerial);
    let lastGpuSampleSerial = Number.isInteger(baselineSerial) ? baselineSerial
      : (Number.isInteger(initialSerial) ? initialSerial : null);
    let lastRaf = performance.now(), lastPresentationAt = null;
    let observedPresentationFrame = Number(mfPresentationFrames), rafCallbacks = 0;
    const maxRafCallbacks = (frameCount + 1) * 8 + 120;
    while (probe.frameDts.length < frameCount) {
      await new Promise(resolveFrame => requestAnimationFrame(resolveFrame));
      const now = performance.now();
      push(probe.rafCallbackDts, now - lastRaf); lastRaf = now;
      if (++rafCallbacks > maxRafCallbacks) {
        throw new Error(`Presentation sampling stalled: ${probe.frameDts.length}/${frameCount} frames after ${rafCallbacks} RAF callbacks`);
      }
      const presented = Number(mfPresentationFrames);
      if (!Number.isInteger(presented) || presented < observedPresentationFrame) {
        throw new Error('mfPresentationFrames became invalid or moved backwards during performance sampling');
      }
      if (presented === observedPresentationFrame) continue;
      observedPresentationFrame = presented;
      if (lastPresentationAt == null) { lastPresentationAt = now; continue; }
      const presentationInterval = now - lastPresentationAt;
      lastPresentationAt = now;
      push(probe.frameDts, presentationInterval);
      push(probe.presentationFrames, presented);
      const authorityTick = typeof mfDetTick !== 'undefined' && Number.isInteger(mfDetTick)
        ? Number(mfDetTick)
        : (typeof tick !== 'undefined' && Number.isInteger(tick) ? Number(tick) : null);
      if (!Number.isInteger(authorityTick)) throw new Error('Authority tick is unavailable during performance sampling');
      push(probe.simTicks, authorityTick);
      const frame = probe.frameDts.length - 1;
      const current = mfPerfLatest(latest);
      push(probe.simTimes, current?.cpu?.sim);
      push(probe.renderTimes, current?.cpu?.render);
      /* mfPerfLatest exposes the last resolved query until another one retires.
         Count that driver result once, not once per presented frame. */
      const gpuSerial = Number(current?.gpuSampleSerial);
      if (current?.gpuTimer && Number.isInteger(gpuSerial) && gpuSerial > 0 && gpuSerial !== lastGpuSampleSerial) {
        lastGpuSampleSerial = gpuSerial;
        probe.gpuSampleSerials.push(gpuSerial);
        push(probe.gpuResultAges, current?.gpuResultAgeFrames);
        push(probe.gpuQueryLatencies, current?.gpuQueryLatencyMs);
        probe.gpuDisjointFlags.push(current?.gpuDisjoint ? 1 : 0);
        if (!current?.gpuDisjoint) push(probe.gpuTimes, current?.gpu?.render);
      }
      if (typeof drawCalls !== 'undefined') push(probe.drawCalls, Number(drawCalls));
      if (typeof triCount !== 'undefined') push(probe.triangles, Number(triCount));
      const counterTotal = typeof teamCount !== 'undefined' && teamCount && teamCount.length >= 3
        ? Number(teamCount[0]) + Number(teamCount[1]) + Number(teamCount[2]) : null;
      push(probe.totalUnits, counterTotal);
      if (typeof acc !== 'undefined' && Number.isFinite(acc)) {
        push(probe.simBacklogSteps, Number(acc) / Number(MF_SIM_DT));
      }
      /* A complete authoritative/camera reconciliation is deliberately bounded
         to checkpoints. Scanning every unit every RAF would measure the probe. */
      if (frame === 0 || frame === frameCount - 1 || (frame + 1) % 30 === 0) {
        let scannedTotal = 0, visibleCount = 0, realBrood = 0, cameraVisibleBrood = 0, visibleBrood = 0;
        const rawBounds = typeof camBounds === 'function' ? camBounds() : null;
        const boundsValid = !!rawBounds && Number.isFinite(rawBounds.x0) && Number.isFinite(rawBounds.x1) &&
          Number.isFinite(rawBounds.y0) && Number.isFinite(rawBounds.y1) &&
          rawBounds.x0 <= rawBounds.x1 && rawBounds.y0 <= rawBounds.y1;
        const width = typeof VW === 'number' ? VW : innerWidth, height = typeof VH === 'number' ? VH : innerHeight;
        const viewportValid = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
        const projectionSupported = typeof w2s === 'function';
        let projectionValid = true;
        if (typeof ualive !== 'undefined' && typeof unitHigh !== 'undefined') {
          for (let index = 0; index < unitHigh; index++) {
            if (!ualive[index]) continue;
            scannedTotal++;
            const team = typeof uteam !== 'undefined' ? Number(uteam[index]) : -1;
            const x = Number(ux[index]), y = Number(uy[index]);
            if (team === 2) realBrood++;
            /* Preserve the live predicate's derived intel-cache refresh. Only
               projection moves behind the cheap, validated world-space gate. */
            const renderVisible = typeof fogEntityVisible !== 'function' || fogEntityVisible(team, x, y);
            if (!boundsValid || !viewportValid || !projectionSupported) continue;
            const inBounds = x >= rawBounds.x0 && x <= rawBounds.x1 && y >= rawBounds.y0 && y <= rawBounds.y1;
            if (!inBounds) continue;
            const projected = w2s(x, y);
            const projectedValid = !!projected && Number.isFinite(projected[0]) && Number.isFinite(projected[1]);
            if (!projectedValid) { projectionValid = false; continue; }
            const onScreen =
              projected[0] >= -24 && projected[0] <= width + 24 && projected[1] >= -24 && projected[1] <= height + 24;
            if (!onScreen) continue;
            if (team === 2) cameraVisibleBrood++;
            if (renderVisible) visibleCount++;
            if (team === 2 && renderVisible) visibleBrood++;
          }
        }
        const visibilitySupported = boundsValid && viewportValid && projectionSupported && projectionValid;
        const visibilityUnavailableReason = !boundsValid ? 'camera-bounds-invalid'
          : !viewportValid ? 'viewport-invalid'
          : !projectionSupported ? 'projection-unavailable'
          : !projectionValid ? 'projection-invalid' : null;
        const culled = visibilitySupported ? scannedTotal - visibleCount : null;
        probe.visibilityValidity.push(visibilitySupported ? 1 : 0);
        push(probe.visibleUnits, visibilitySupported ? visibleCount : NaN);
        push(probe.culledUnits, visibilitySupported ? culled : NaN);
        push(probe.realBroodUnits, realBrood);
        push(probe.cameraVisibleBroodUnits, visibilitySupported ? cameraVisibleBrood : NaN);
        push(probe.visibleBroodUnits, visibilitySupported ? visibleBrood : NaN);
        let proxy = null;
        try {
          if (typeof mfBroodCrowdStats === 'function') proxy = mfBroodCrowdStats();
          else if (typeof window.mfBroodCrowdTelemetry === 'function') proxy = window.mfBroodCrowdTelemetry();
          else proxy = window.__mfBroodCrowdTelemetry || window.MF_BROOD_CROWD_TELEMETRY || null;
        } catch (error) { proxy = null; }
        const proxyBodies = Number(proxy?.proxyBodies ?? proxy?.visualBodies ?? proxy?.bodies ?? proxy?.instances);
        const proxyClusters = Number(proxy?.proxyClusters ?? proxy?.clusterInstances ?? proxy?.clusters);
        push(probe.proxyBodies, proxyBodies); push(probe.proxyClusters, proxyClusters);
        probe.reconciliation.push({
          frame, counterTotal: Number.isFinite(counterTotal) ? counterTotal : null,
          scannedTotal, visible: visibilitySupported ? visibleCount : null, culled,
          realBrood, cameraVisibleBrood: visibilitySupported ? cameraVisibleBrood : null,
          visibleBrood: visibilitySupported ? visibleBrood : null,
          proxyBodies: Number.isFinite(proxyBodies) ? proxyBodies : null,
          proxyClusters: Number.isFinite(proxyClusters) ? proxyClusters : null,
          hasCameraBounds: !!rawBounds, cameraBoundsValid: boundsValid, viewportValid,
          projectionSupported, visibilitySupported, visibilityUnavailableReason
        });
      }
      if (typeof nPart !== 'undefined') push(probe.particleCounts, Number(nPart));
      if (typeof nProj !== 'undefined') push(probe.projectileCounts, Number(nProj));
      if (performance.memory && Number.isFinite(performance.memory.usedJSHeapSize)) {
        push(probe.heapUsed, performance.memory.usedJSHeapSize / (1024 * 1024));
      }
    }
    return probe;
  }, { frameCount: totalFrames, initialGpuSampleSerial });
}

async function sampleFramesWithCpuProfile(page, totalFrames, {
  enabled = false,
  path = null,
  initialGpuSampleSerial = null
} = {}) {
  if (!enabled) return { samples: await sampleFrames(page, totalFrames, initialGpuSampleSerial), cpuProfile: null };
  if (!path || extname(path) !== '.cpuprofile') throw new Error('CPU profile requires a deterministic .cpuprofile path');
  const session = await page.context().newCDPSession(page);
  let samples = null, profile = null, failure = null, started = false;
  try {
    await session.send('Profiler.enable');
    await session.send('Profiler.setSamplingInterval', { interval: 1000 });
    await session.send('Profiler.start');
    started = true;
    samples = await sampleFrames(page, totalFrames, initialGpuSampleSerial);
  } catch (error) {
    failure = error;
  } finally {
    if (started) {
      try { profile = (await session.send('Profiler.stop')).profile; }
      catch (error) { failure = failure ? new AggregateError([failure, error], 'Frame sample and CPU profiler stop failed') : error; }
    }
    await session.send('Profiler.disable').catch(() => {});
    await session.detach().catch(() => {});
  }
  let cpuProfile = null;
  if (profile) {
    await mkdir(dirname(path), { recursive: true });
    const body = `${JSON.stringify(profile)}\n`;
    await writeFile(path, body, 'utf8');
    cpuProfile = {
      path: relative(ROOT, path).replace(/\\/g, '/'),
      sha256: sha256(body),
      bytes: Buffer.byteLength(body),
      samplingIntervalUs: 1000,
      scope: 'only the requested presented-frame sample; setup, captures and report generation excluded'
    };
  }
  if (failure) throw failure;
  return { samples, cpuProfile };
}

function appendProbe(target, source) {
  for (const key of Object.keys(target)) target[key].push(...(source[key] || []));
}

async function captureBattlefield(page, scenario, unitsPerFaction, stage, captureLane, authoritative, capturesDir, proxyPlan) {
  if (!/^[a-z0-9-]+$/.test(captureLane) || !['start', 'mid', 'end'].includes(stage)) {
    throw new Error(`Unsafe performance-capture identity: ${captureLane}/${stage}`);
  }
  const framing = await frameEvidenceCamera(page, scenario, stage);
  await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
  const state = await runtimeState(page);
  assertRuntimeState(state, `${stage} capture`);
  const battlefield = await collectBattlefieldTelemetry(page);
  if (!battlefield.visibilitySupported) {
    throw new Error(`${stage} capture rejected: battlefield visibility unavailable (${battlefield.visibilityUnavailableReason || 'unknown'})`);
  }
  if (battlefield.total > 0 && battlefield.visible < 1) {
    throw new Error(`${stage} capture rejected: evidence camera projected zero render-visible authoritative units`);
  }
  await page.evaluate(({ label, counts, battlefield: field, proxy }) => {
    let overlay = document.getElementById('__mfPerfEvidenceHud');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = '__mfPerfEvidenceHud';
      Object.assign(overlay.style, {
        position: 'fixed', left: '8px', top: '82px', zIndex: '99999', pointerEvents: 'none',
        padding: '7px 9px', color: '#dff8ff', background: 'rgba(2,8,15,.86)',
        border: '1px solid #38d8ff', font: '700 10px/1.45 monospace', whiteSpace: 'pre-wrap'
      });
      document.body.appendChild(overlay);
    }
    const proxyText = field.proxyTelemetrySupported
      ? `${field.proxyBodies} / ${field.proxyClusters}`
      : `UNAVAILABLE (REQUEST ${proxy?.requestedProxyBodies ?? 0} / ${proxy?.requestedProxyClusters ?? 0})`;
    overlay.textContent = `${label}\nAUTHORITATIVE ${counts.total} · VISIBLE ${field.visible}\n` +
      `BROOD REAL ${field.realBrood} · CAMERA ${field.cameraVisibleBrood} · FOG ${field.visibleBrood}\nPROXY BODIES / CLUSTERS ${proxyText}\n` +
      `NORMAL / SYSTEM ${counts.byAuthorityKind?.['normal-participant'] || 0} / ${counts.byAuthorityKind?.['system-force'] || 0}`;
  }, {
    label: `${scenario.id} ${unitsPerFaction}/AUTHORITY ${stage.toUpperCase()}`,
    counts: authoritative, battlefield, proxy: proxyPlan
  });
  const file = `${scenarioStem(scenario.id, unitsPerFaction)}_${captureLane}_${stage}.png`;
  const path = join(capturesDir, file);
  await page.screenshot({ path });
  const png = await inspectPng(path);
  return {
    stage,
    file,
    sha256: await fileSha256(path),
    width: png.width,
    height: png.height,
    hudVisible: state.battleHudVisible,
    authoritativeTotal: authoritative.total,
    byFaction: authoritative.byFaction,
    byTeam: authoritative.byTeam,
    byAuthorityKind: authoritative.byAuthorityKind,
    realBrood: battlefield.realBrood,
    cameraVisibleBrood: battlefield.cameraVisibleBrood,
    visibleBrood: battlefield.visibleBrood,
    proxyBodies: battlefield.proxyBodies,
    proxyClusters: battlefield.proxyClusters,
    proxyTelemetrySupported: battlefield.proxyTelemetrySupported,
    framing,
    simTimeSec: state.simTimeSec
  };
}

function detectBackend(renderer) {
  if (/direct3d\s*11|d3d11/i.test(renderer)) return 'ANGLE/D3D11';
  if (/metal/i.test(renderer)) return 'ANGLE/Metal';
  if (/vulkan/i.test(renderer)) return 'ANGLE/Vulkan';
  if (/opengl/i.test(renderer)) return 'OpenGL';
  return 'unknown-hardware-backend';
}

export async function runScenarioBenchmark(page, scenario, unitsPerFaction, options) {
  const {
    durationFrames = 240,
    sourceIdentity,
    gpu,
    issues,
    deploymentProof,
    preset,
    viewport,
    url,
    proxyDensity = 'high',
    captureLane = 'device-v3',
    capturesDir = LEGACY_CAPTURES_DIR,
    cpuProfile = false,
    cpuProfileDir = DIAGNOSTICS_DIR,
    evidenceScope = 'physical-device-short-run',
    checkpoint = async () => {}
  } = options;
  const topology = benchmarkScenarioSupport(scenario);
  if (topology.status !== 'supported') {
    const error = new Error(`UNSUPPORTED ${scenario.id}: ${topology.reason}`);
    error.code = 'MASSFRONT_PERF_SCENARIO_UNSUPPORTED';
    throw error;
  }
  if (issues.pageErrors.length) throw new Error(`Pre-sample page errors: ${issues.pageErrors.join(' | ')}`);
  if (issues.consoleErrors.length) throw new Error(`Pre-sample console errors: ${issues.consoleErrors.join(' | ')}`);
  await checkpoint('before deterministic load');
  const preState = await runtimeState(page);
  assertRuntimeState(preState, 'pre-load');
  const setup = await setupDeterministicScenario(page, scenario, unitsPerFaction, { proxyDensity });
  await frameEvidenceCamera(page, scenario, 'settle');

  /* Admission reconciliation must not double as an unmeasured combat sample.
     Freeze authority only for these 30 visual-settle frames, then resume
     before runtime-state validation and the measured directive. */
  await page.evaluate(() => { if (typeof paused !== 'undefined') paused = true; });
  for (let frame = 0; frame < 30; frame++) await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(resolveFrame)));
  const postSettle = await collectAuthoritativePopulation(page, scenario);
  if (!postSettle.supported) throw new Error('Authoritative population arrays are unavailable');
  const expectedTotal = setup.expected.total;
  if (setup.attempted.total !== expectedTotal || setup.accepted.total !== expectedTotal ||
      postSettle.total !== expectedTotal || postSettle.unmatched !== 0) {
    throw new Error(`Population gate failed: attempted=${setup.attempted.total}, accepted=${setup.accepted.total}, ` +
      `postSettle=${postSettle.total}, unmatched=${postSettle.unmatched}, requested=${expectedTotal}`);
  }
  await page.evaluate(() => { if (typeof paused !== 'undefined') paused = false; });
  await checkpoint('after population settle');

  const sampleStartState = await runtimeState(page);
  assertRuntimeState(sampleStartState, 'post-settle');
  const captures = [];
  captures.push(await captureBattlefield(
    page, scenario, unitsPerFaction, 'start', captureLane, postSettle, capturesDir, setup.expected.broodWildcard?.proxy || null
  ));
  await checkpoint('after start capture');
  await injectCombatDirective(page, 'advance_to_center');
  const nativeCheckpoints = [await takePerfCheckpoint(page, 'start')];
  const samples = {
    frameDts: [], rafCallbackDts: [], presentationFrames: [], simTicks: [],
    simTimes: [], renderTimes: [], gpuTimes: [], gpuSampleSerials: [],
    gpuResultAges: [], gpuQueryLatencies: [], gpuDisjointFlags: [], drawCalls: [], triangles: [],
    totalUnits: [], visibleUnits: [], culledUnits: [], visibilityValidity: [], particleCounts: [], projectileCounts: [], heapUsed: [],
    realBroodUnits: [], cameraVisibleBroodUnits: [], visibleBroodUnits: [], proxyBodies: [], proxyClusters: [],
    simBacklogSteps: [], reconciliation: []
  };
  const firstFrames = Math.max(1, Math.floor(durationFrames / 2));
  /* The wall clock and authority tick must describe the identical interval.
     Capture each pair inside one page callback; host-side performance.now()
     cannot be compared tightly with state read through a later CDP call. */
  const measurementStartState = await runtimeState(page);
  assertRuntimeState(measurementStartState, 'measurement start');
  const memoryMonitor = startHostMemoryMonitor();
  const cpuProfiles = [];
  let measurementEndState, postSampleDiagnostics, hostMemory;
  try {
    const stem = scenarioStem(scenario.id, unitsPerFaction);
    const firstSample = await sampleFramesWithCpuProfile(page, firstFrames, {
      enabled: cpuProfile,
      path: join(cpuProfileDir, `${stem}_${captureLane}_sample1.cpuprofile`)
    });
    appendProbe(samples, firstSample.samples);
    if (firstSample.cpuProfile) cpuProfiles.push(firstSample.cpuProfile);
    nativeCheckpoints.push(await takePerfCheckpoint(page, 'mid'));
    const midPopulation = await collectAuthoritativePopulation(page, scenario);
    captures.push(await captureBattlefield(
      page, scenario, unitsPerFaction, 'mid', captureLane, midPopulation, capturesDir, setup.expected.broodWildcard?.proxy || null
    ));
    await checkpoint('after mid capture');
    const lastGpuSerial = samples.gpuSampleSerials.length
      ? samples.gpuSampleSerials[samples.gpuSampleSerials.length - 1] : null;
    const secondSample = await sampleFramesWithCpuProfile(page, Math.max(1, durationFrames - firstFrames), {
      enabled: cpuProfile,
      path: join(cpuProfileDir, `${stem}_${captureLane}_sample2.cpuprofile`),
      initialGpuSampleSerial: lastGpuSerial
    });
    appendProbe(samples, secondSample.samples);
    if (secondSample.cpuProfile) cpuProfiles.push(secondSample.cpuProfile);
    /* One bounded copy after sampling. Calling this in RAF would make the
       profiler itself a frame-time contributor. */
    postSampleDiagnostics = await page.evaluate(() => {
      if (typeof window.mfPerfTraceSnapshot !== 'function') {
        throw new Error('Required window.mfPerfTraceSnapshot() is unavailable in the current runtime source');
      }
      const probe = window.__mfProbe;
      return {
        hitchTrace: window.mfPerfTraceSnapshot(),
        longTasks: {
          totalCount: Number(probe?.longTaskTotalCount || 0),
          retainedCount: Array.isArray(probe?.longTasks) ? probe.longTasks.length : 0,
          capacity: 256,
          records: Array.isArray(probe?.longTasks) ? probe.longTasks.map(row => ({ ...row })) : []
        }
      };
    });
    measurementEndState = await runtimeState(page);
  } finally {
    hostMemory = memoryMonitor.stop();
  }
  assertRuntimeState(measurementEndState, 'measurement end');
  const wallDurationMs = measurementEndState.atPerformanceMs - measurementStartState.atPerformanceMs;
  nativeCheckpoints.push(await takePerfCheckpoint(page, 'end'));
  const endPopulation = await collectAuthoritativePopulation(page, scenario);
  captures.push(await captureBattlefield(
    page, scenario, unitsPerFaction, 'end', captureLane, endPopulation, capturesDir, setup.expected.broodWildcard?.proxy || null
  ));
  await checkpoint('after end capture');

  const endState = await runtimeState(page);
  assertRuntimeState(endState, 'post-sample');
  if (issues.pageErrors.length) throw new Error(`Page errors during benchmark: ${issues.pageErrors.join(' | ')}`);
  if (issues.consoleErrors.length) throw new Error(`Console errors during benchmark: ${issues.consoleErrors.join(' | ')}`);
  const endSourceIdentity = await collectSourceIdentity();
  const sourceStable = sameSourceIdentity(sourceIdentity, endSourceIdentity);
  await checkpoint('after end source identity');
  const frameTimeMs = telemetryStats(samples.frameDts, {
    supported: samples.frameDts.length > 0,
    source: 'mfPresentationFrames transitions / performance.now presentationInterval'
  });
  if (measurementEndState.simStepSec !== measurementStartState.simStepSec) {
    throw new Error(`Authoritative MF_SIM_DT changed during sample: ${measurementStartState.simStepSec} -> ${measurementEndState.simStepSec}`);
  }
  const simulatedTicks = measurementEndState.simTick - measurementStartState.simTick;
  if (!Number.isInteger(simulatedTicks) || simulatedTicks < 0) {
    throw new Error(`Authority tick moved backwards during sample: ${measurementStartState.simTick} -> ${measurementEndState.simTick}`);
  }
  const simulatedDurationSec = simulatedTicks * measurementStartState.simStepSec;
  const wallTimeRatio = simulatedDurationSec / (wallDurationMs / 1000);
  const maxBacklogSteps = samples.simBacklogSteps.length ? Math.max(...samples.simBacklogSteps) : null;
  const measurementCoverage = summarizeMeasurementCoverage(samples, expectedTotal, {
    attempted: setup.attempted, accepted: setup.accepted, postSettle
  });
  const performanceGate = deriveStage8PerformanceGate({
    scenarioId: scenario.id,
    unitsPerFaction,
    expectedSeats: setup.expected.seats,
    expectedTotal,
    acceptanceTotal: topology.acceptanceTotal,
    frameTimeMs,
    scope: evidenceScope
  });
  const result = {
    schema: PERF_EVIDENCE_SCHEMA,
    evidenceStatus: performanceGate.evidenceStatus,
    executionPath: PERF_EXECUTION_PATH,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    theatre: scenario.theatre,
    unitsPerFaction,
    factionsCount: topology.authorityCount,
    normalParticipantCount: topology.normalParticipantCount,
    systemForceCount: topology.systemForceCount,
    evidenceClass: performanceGate.evidenceClass,
    topology: { ...topology, seatCount: topology.authorityCount },
    timestamp: new Date().toISOString(),
    performanceGate,
    runtimeGate: {
      ...deploymentProof,
      authUiVisible: endState.authUiVisible,
      menuUiVisible: endState.menuUiVisible,
      battleHudVisible: endState.battleHudVisible,
      matchLive: endState.matchLive,
      running: endState.running,
      gpuValidation: { passed: true, hardware: true, renderer: gpu.renderer, vendor: gpu.vendor },
      pageErrors: [...issues.pageErrors],
      consoleErrors: [...issues.consoleErrors],
      contextLossCount: endState.contextLossCount
    },
    population: {
      requestedPerFaction: unitsPerFaction,
      expected: {
        seats: setup.expected.seats, total: setup.expected.total,
        byAuthorityKind: setup.expected.byAuthorityKind,
        normalParticipantCount: setup.expected.normalParticipantCount,
        systemForceCount: setup.expected.systemForceCount,
        broodWildcard: setup.expected.broodWildcard
      },
      attempted: setup.attempted,
      accepted: setup.accepted,
      postSettle,
      admission: measurementCoverage.admission,
      liveSample: measurementCoverage.liveSample
    },
    broodWildcard: setup.expected.broodWildcard ? {
      present: true,
      authorityKind: 'system-force',
      expectedRealBodies: setup.expected.broodWildcard.realBodies,
      observedRealBodies: postSettle.realBrood,
      proxyDensity: setup.expected.broodWildcard.proxy,
      coverage: measurementCoverage.brood
    } : {
      present: false,
      authorityKind: 'system-force',
      expectedRealBodies: 0,
      observedRealBodies: 0,
      proxyDensity: null,
      coverage: measurementCoverage.brood
    },
    provenance: {
      ...sourceIdentity,
      sourceDriftChecked: true,
      sourceStable,
      endWorktreeFingerprint: endSourceIdentity.worktreeFingerprint,
      endRuntimeFingerprint: endSourceIdentity.runtimeFingerprint,
      preset,
      viewport,
      url,
      renderer: gpu.renderer,
      vendor: gpu.vendor,
      backend: detectBackend(gpu.renderer),
      seed: scenario.mapSeed,
      camera: { start: sampleStartState.camera, end: endState.camera },
      simulation: {
        startTimeSec: measurementStartState.simTimeSec,
        endTimeSec: measurementEndState.simTimeSec,
        startTick: measurementStartState.simTick,
        endTick: measurementEndState.simTick,
        startTickSource: measurementStartState.simTickSource,
        endTickSource: measurementEndState.simTickSource,
        startStepSec: measurementStartState.simStepSec,
        endStepSec: measurementEndState.simStepSec,
        simulatedTicks,
        durationFrames,
        presentedIntervalSampleCount: samples.frameDts.length,
        rafCallbackSampleCount: samples.rafCallbackDts.length,
        wallDurationMs: Math.round(wallDurationMs * 100) / 100,
        simulatedDurationSec: Math.round(simulatedDurationSec * 100000) / 100000,
        wallTimeRatio: Math.round(wallTimeRatio * 10000) / 10000,
        startBacklogSec: measurementStartState.simAccumulatorSec,
        endBacklogSec: measurementEndState.simAccumulatorSec,
        maxBacklogSteps: maxBacklogSteps == null ? null : Math.round(maxBacklogSteps * 10000) / 10000,
        backlogSampleCount: samples.simBacklogSteps.length,
        gameSpeed: measurementEndState.gameSpeed
      }
    },
    captures,
    metrics: {
      fpsEstimated: frameTimeMs.mean > 0 ? Math.round((1000 / frameTimeMs.mean) * 10) / 10 : null,
      frameTimeMs,
      rafCallbackTimeMs: telemetryStats(samples.rafCallbackDts, {
        supported: samples.rafCallbackDts.length > 0, source: 'raw requestAnimationFrame callback cadence (diagnostic only)'
      }),
      simPhaseMs: telemetryStats(samples.simTimes, { supported: samples.simTimes.length > 0, source: 'mfPerfLatest.cpu.sim' }),
      renderCpuMs: telemetryStats(samples.renderTimes, { supported: samples.renderTimes.length > 0, source: 'mfPerfLatest.cpu.render' }),
      gpuTimeMs: telemetryStats(samples.gpuTimes, { supported: samples.gpuTimes.length > 0, source: 'EXT_disjoint_timer_query_webgl2/mfPerf' }),
      gpuResultAgeFrames: telemetryStats(samples.gpuResultAges, {
        supported: samples.gpuResultAges.length > 0, source: 'mfPerfLatest.gpuResultAgeFrames on each newly resolved query'
      }),
      gpuQueryLatencyMs: telemetryStats(samples.gpuQueryLatencies, {
        supported: samples.gpuQueryLatencies.length > 0, source: 'mfPerfLatest.gpuQueryLatencyMs on each newly resolved query'
      }),
      gpuResultIdentity: {
        supported: samples.gpuSampleSerials.length > 0,
        uniqueResultCount: samples.gpuSampleSerials.length,
        firstSerial: samples.gpuSampleSerials.length ? samples.gpuSampleSerials[0] : null,
        lastSerial: samples.gpuSampleSerials.length ? samples.gpuSampleSerials[samples.gpuSampleSerials.length - 1] : null,
        disjointCount: samples.gpuDisjointFlags.length
          ? samples.gpuDisjointFlags.reduce((sum, value) => sum + value, 0) : null,
        disjointObserved: samples.gpuDisjointFlags.length ? samples.gpuDisjointFlags.some(Boolean) : null,
        limitation: 'mfPerfLatest is sampled at presentation boundaries; a serial jump greater than one would mean an intermediate resolved result was not individually observable.'
      },
      drawCalls: telemetryStats(samples.drawCalls, { supported: samples.drawCalls.length > 0, source: 'drawCalls' }),
      triangles: telemetryStats(samples.triangles, { supported: samples.triangles.length > 0, source: 'triCount' }),
      visibility: {
        total: telemetryStats(samples.totalUnits, { supported: samples.totalUnits.length > 0, source: 'teamCount authoritative counter' }),
        visible: telemetryStats(samples.visibleUnits, {
          supported: samples.visibilityValidity.length > 0 && samples.visibilityValidity.every(Boolean) &&
            samples.visibleUnits.length === samples.visibilityValidity.length,
          source: 'validated bounds + projection + fogEntityVisible reconciliation'
        }),
        culled: telemetryStats(samples.culledUnits, {
          supported: samples.visibilityValidity.length > 0 && samples.visibilityValidity.every(Boolean) &&
            samples.culledUnits.length === samples.visibilityValidity.length,
          source: 'authoritative total minus camera-and-fog-visible reconciliation'
        }),
        reconciliation: samples.reconciliation
      },
      brood: {
        realBodies: telemetryStats(samples.realBroodUnits, {
          supported: samples.realBroodUnits.length > 0, source: 'authoritative team-2 unit arrays'
        }),
        cameraVisibleBodies: telemetryStats(samples.cameraVisibleBroodUnits, {
          supported: samples.visibilityValidity.length > 0 && samples.visibilityValidity.every(Boolean) &&
            samples.cameraVisibleBroodUnits.length === samples.visibilityValidity.length,
          source: 'validated bounds + projection reconciliation before fog'
        }),
        visibleBodies: telemetryStats(samples.visibleBroodUnits, {
          supported: samples.visibilityValidity.length > 0 && samples.visibilityValidity.every(Boolean) &&
            samples.visibleBroodUnits.length === samples.visibilityValidity.length,
          source: 'projection + fogEntityVisible reconciliation'
        }),
        proxyBodies: telemetryStats(samples.proxyBodies, {
          supported: samples.proxyBodies.length > 0, source: samples.proxyBodies.length ? 'Brood crowd runtime telemetry' : 'unimplemented runtime hook'
        }),
        proxyClusters: telemetryStats(samples.proxyClusters, {
          supported: samples.proxyClusters.length > 0, source: samples.proxyClusters.length ? 'Brood crowd runtime telemetry' : 'unimplemented runtime hook'
        })
      },
      simBacklogSteps: telemetryStats(samples.simBacklogSteps, {
        supported: samples.simBacklogSteps.length > 0, source: 'fixed-step accumulator/MF_SIM_DT'
      }),
      nativeCheckpoints,
      vfx: {
        particles: telemetryStats(samples.particleCounts, { supported: samples.particleCounts.length > 0, source: 'nPart' }),
        projectiles: telemetryStats(samples.projectileCounts, { supported: samples.projectileCounts.length > 0, source: 'nProj' })
      },
      webglResources: {
        supported: !!(await page.evaluate(() => window.__mfProbe?.resourceCounts)),
        sampleCount: 1,
        values: await page.evaluate(() => window.__mfProbe?.resourceCounts || null)
      },
      jsHeapMB: telemetryStats(samples.heapUsed, { supported: samples.heapUsed.length > 0, source: 'performance.memory.usedJSHeapSize' }),
      hitchTrace: postSampleDiagnostics.hitchTrace,
      longTaskCount: postSampleDiagnostics.longTasks.totalCount,
      longTasks: postSampleDiagnostics.longTasks,
      hostMemory,
      cpuProfiles: {
        enabled: cpuProfile,
        artifactCount: cpuProfiles.length,
        artifacts: cpuProfiles,
        limitation: 'CDP statistical CPU profiles are opt-in and cover only the two presented-frame sample windows; they are not generated by default.'
      },
      contextLossCount: endState.contextLossCount
    }
  };
  const validation = validatePerfEvidence(result);
  if (!validation.valid) {
    result.evidenceStatus = 'rejected';
    result.rejectionReasons = validation.errors;
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const runAll = args.includes('--all');
  const runRequired = args.includes('--required');
  const runLadder = args.includes('--ladder');
  const cpuProfile = args.includes('--cpu-profile');
  if (runAll && runRequired) throw new Error('--all and --required are mutually exclusive');
  const scenarioKey = valueAfter(args, '--scenario') || '1v1_duel_verdant';
  const preset = valueAfter(args, '--preset') || 'high';
  const proxyDensity = parseBroodProxyDensity(args);
  const frameValue = Number.parseInt(valueAfter(args, '--frames') || '240', 10);
  if (!Number.isInteger(frameValue) || frameValue < 3) throw new Error('--frames must be an integer >= 3');
  const requiredScenarioIds = [
    '1v1_duel_verdant', '1v2_flank_arctic',
    '1v3_crossfire_ashland', '1v4_continental_conquest'
  ];
  const scenarios = runAll ? Object.values(BENCHMARK_SCENARIOS)
    : runRequired ? requiredScenarioIds.map(id => BENCHMARK_SCENARIOS[id])
      : [BENCHMARK_SCENARIOS[scenarioKey]];
  if (scenarios.some(value => !value)) throw new Error(`Unknown scenario: ${scenarioKey}`);
  const populations = parsePerformancePopulations(args);
  const unsupportedUnits = runLadder ? 500 : populations[0];

  const unsupported = scenarios.filter(scenario => benchmarkScenarioSupport(scenario).status === 'unsupported');
  const supportedScenarios = scenarios.filter(scenario => benchmarkScenarioSupport(scenario).status === 'supported');
  const queuedOutputs = [];
  const unsupportedResults = [];
  const results = [];
  const outcomeLines = [];
  let hasDiagnostic = unsupported.length > 0;
  let hasPerformanceFailure = false;
  let sourceIdentity = null;
  let workspaceGuard = null;
  let concurrentStage10Start = null;
  let server = null;
  let browser = null;
  let failure = null;
  try {
    concurrentStage10Start = await collectConcurrentStage10Snapshot();
    workspaceGuard = await acquireVerificationFreeze({
      root: ROOT,
      label: 'Stage 8 performance evidence matrix',
      quietMs: Number(process.env.MF_QUIET_PREFLIGHT_MS || 15000),
      /* Watchers on Windows may report the parent directory without a child
         filename when current/ is created. The producer still writes only to
         CURRENT_PERF_ROOT; allowing its dedicated perf-lab parent prevents an
         anonymous self-write from masquerading as source drift. */
      allowedPaths: [LEGACY_PERF_ROOT, ...CONCURRENT_STAGE10_AUTHORING.map(path => join(ROOT, path))]
    });
    await workspaceGuard.checkpoint('before bounded performance-output preparation');
    await prepareCurrentPerfOutput({ scenarios, populations });
    await workspaceGuard.checkpoint('after bounded performance-output preparation');

    sourceIdentity = await collectSourceIdentity();
    await workspaceGuard.checkpoint('after initial performance source identity');
    console.log(`MASSFRONT perf evidence ${sourceIdentity.gitHead} dirty=${sourceIdentity.gitDirty}`);
    console.log(`worktree=${sourceIdentity.worktreeFingerprint} runtime=${sourceIdentity.runtimeFingerprint}`);

    for (const scenario of unsupported) {
      const topology = benchmarkScenarioSupport(scenario);
      const result = {
        schema: PERF_EVIDENCE_SCHEMA,
        evidenceStatus: 'unsupported',
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        unitsPerFaction: unsupportedUnits,
        factionsCount: topology.authorityCount,
        normalParticipantCount: topology.normalParticipantCount,
        systemForceCount: topology.systemForceCount,
        topology: { ...topology, seatCount: topology.authorityCount },
        timestamp: new Date().toISOString()
      };
      unsupportedResults.push(result);
      queuedOutputs.push({ path: join(METRICS_DIR, `${scenario.id}_unsupported_v3.json`), record: result });
    }

    if (supportedScenarios.length) {
      server = await startStaticServer();
      browser = await launchPwBrowser({ headless: true, ownershipMode: 'isolated' });
      for (const scenario of supportedScenarios) {
        for (const unitsPerFaction of populations) {
          const runLabel = `${scenario.id} ${unitsPerFaction}/authority proxy=${proxyDensity}`;
          await workspaceGuard.checkpoint(`before performance scenario ${runLabel}`);
          const page = await browser.newPage({
            viewport: { width: DEFAULT_VIEWPORT.width, height: DEFAULT_VIEWPORT.height },
            deviceScaleFactor: DEFAULT_VIEWPORT.dpr,
            hasTouch: true,
            isMobile: true,
            serviceWorkers: 'block',
            userAgent: ANDROID_S25_USER_AGENT
          });
          const issues = { pageErrors: [], consoleErrors: [] };
          page.on('pageerror', error => issues.pageErrors.push(error.message));
          page.on('console', message => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
          try {
            const networkIsolation = await installTelemetryInit(page);
            const url = `${server.url}?mfperf=1&perfEvidence=1`;
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
            const gpu = await assertHardwareGpu(page);
            await page.waitForFunction(() => typeof spawnUnit === 'function' && typeof resetWorld === 'function', null, { timeout: 90000 });
            const mobileProof = await page.evaluate(() => ({
              userAgent: navigator.userAgent,
              mobileGpu: typeof MF_MOBILE_GPU === 'boolean' ? MF_MOBILE_GPU : null
            }));
            assertMobileGpuBranch(mobileProof.mobileGpu, mobileProof.userAgent, 'perf-probe-runner');
            const livePreset = await applyPreset(page, preset);
            const deploymentProof = await enterRealBattle(page);
            await workspaceGuard.checkpoint(`after real deployment ${runLabel}`);
            await enableRuntimeTelemetry(page);
            const result = await runScenarioBenchmark(page, scenario, unitsPerFaction, {
              durationFrames: frameValue,
              sourceIdentity,
              gpu,
              issues,
              deploymentProof,
              preset: livePreset,
              proxyDensity,
              viewport: DEFAULT_VIEWPORT,
              url,
              captureLane: 'desktop-v3',
              capturesDir: CAPTURES_DIR,
              cpuProfile,
              cpuProfileDir: DIAGNOSTICS_DIR,
              evidenceScope: 'desktop-short-run',
              checkpoint: name => workspaceGuard.checkpoint(`${runLabel}: ${name}`)
            });
            result.networkIsolation = await networkIsolation.finalize(`performance scenario ${scenario.id}`);
            result.runtimeGate.pageErrors = [...issues.pageErrors];
            result.runtimeGate.consoleErrors = [...issues.consoleErrors];
            await workspaceGuard.checkpoint(`after offline isolation ${runLabel}`);

            const scenarioEndIdentity = await collectSourceIdentity();
            result.provenance.sourceStable = sameSourceIdentity(sourceIdentity, scenarioEndIdentity);
            result.provenance.endWorktreeFingerprint = scenarioEndIdentity.worktreeFingerprint;
            result.provenance.endRuntimeFingerprint = scenarioEndIdentity.runtimeFingerprint;
            await workspaceGuard.checkpoint(`after final source identity ${runLabel}`);
            const validation = validatePerfEvidence(result);
            if (!validation.valid) {
              result.evidenceStatus = 'rejected';
              result.rejectionReasons = validation.errors;
              throw new Error(`Evidence rejected: ${validation.errors.join('; ')}`);
            }
            delete result.rejectionReasons;
            results.push(result);
            queuedOutputs.push({
              path: join(METRICS_DIR, `${scenarioStem(scenario.id, unitsPerFaction)}_v3.json`),
              record: result
            });
            const gate = result.performanceGate;
            if (validation.status === 'accepted') {
              outcomeLines.push(`SCENARIO DESKTOP PASS ${runLabel} p95=${gate.frameP95Ms}ms p99=${gate.frameP99Ms}ms <= ${gate.thresholdMs}ms`);
            } else if (validation.status === 'diagnostic') {
              hasDiagnostic = true;
              outcomeLines.push(`DIAGNOSTIC/INCOMPLETE ${runLabel} p95=${gate.frameP95Ms}ms p99=${gate.frameP99Ms}ms; acceptance requires exactly 500/faction`);
            } else {
              hasPerformanceFailure = true;
              outcomeLines.push(`SCENARIO DESKTOP FAIL ${runLabel} p95=${gate.frameP95Ms}ms p99=${gate.frameP99Ms}ms > ${gate.thresholdMs}ms`);
            }
          } finally {
            await page.close().catch(() => {});
          }
          await workspaceGuard.checkpoint(`after performance scenario ${runLabel}`);
        }
      }
    }

    if (browser) {
      await closePwBrowser(browser);
      browser = null;
    }
    if (server) {
      await server.close();
      server = null;
    }
    const finalSourceIdentity = await collectSourceIdentity();
    if (!sameSourceIdentity(sourceIdentity, finalSourceIdentity)) {
      throw new Error('Performance matrix source identity changed before final evidence release');
    }
    await workspaceGuard.checkpoint('performance matrix completion');
    const concurrentStage10End = await collectConcurrentStage10Snapshot();
    const concurrentStage10 = {
      scope: 'excluded authoring-only Stage 10 utilities; absent from runtime/probe input closure',
      start: concurrentStage10Start,
      end: concurrentStage10End,
      changed: concurrentStage10Start.fingerprint !== concurrentStage10End.fingerprint
    };
    for (const result of results) result.provenance.concurrentOutOfScopeWrites = concurrentStage10;
    queuedOutputs.push({
      path: join(METRICS_DIR, `summary_matrix_${sourceIdentity.runtimeFingerprint.slice(0, 12)}_v3.json`),
      record: [...results, ...unsupportedResults]
    });
  } catch (error) {
    failure = error;
  } finally {
    if (browser) await closePwBrowser(browser).catch(error => { failure ??= error; });
    if (server) await server.close().catch(error => { failure ??= error; });
    if (workspaceGuard) {
      try {
        await workspaceGuard.release({ assertStable: true, name: 'performance evidence final release' });
      } catch (error) {
        failure ??= error;
      }
      workspaceGuard = null;
    }
  }

  if (failure) {
    if (/PW_OWNED_CLEANUP_INCOMPLETE/.test(String(failure?.message || failure)) && results.length) {
      try {
        const paths = await preserveCleanupDiagnostics(results, failure);
        console.error(`DIAGNOSTIC/INCOMPLETE preserved after browser cleanup failure: ${paths.map(path => relative(ROOT, path).replace(/\\/g, '/')).join(', ')}`);
      } catch (diagnosticError) {
        throw new AggregateError([failure, diagnosticError],
          `Browser cleanup failed and diagnostic preservation also failed: ${diagnosticError.message}`);
      }
    }
    throw failure;
  }
  try {
    for (const output of queuedOutputs) {
      await writeFile(output.path, `${JSON.stringify(output.record, null, 2)}\n`, 'utf8');
    }
  } catch (error) {
    await Promise.all(queuedOutputs.map(output => rm(output.path, { force: true }).catch(() => {})));
    throw new Error(`Performance evidence publication failed: ${error.message}`, { cause: error });
  }
  for (const scenario of unsupported) {
    console.log(`UNSUPPORTED ${scenario.id}: ${benchmarkScenarioSupport(scenario).reason}`);
  }
  for (const line of outcomeLines) console.log(line);
  if (hasPerformanceFailure) process.exitCode = 1;
  else if (hasDiagnostic || !supportedScenarios.length) process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(`Fatal probe error: ${error.stack || error.message}`); process.exit(1); });
}
