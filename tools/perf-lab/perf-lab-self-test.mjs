import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  deriveStage8PerformanceGate,
  telemetryStats,
  validatePerfEvidence,
  validateEvidenceBatch,
  validateStage8DesktopMatrix
} from './evidence-contract.mjs';
import { crc32 } from '../evidence-foundation/png-evidence.mjs';
import { generateBenchmarkReports } from './benchmark-report-generator.mjs';
import { validEvidenceFixture, cloneFixture } from './fixtures/evidence-fixtures.mjs';
import {
  BENCHMARK_SCENARIOS,
  BROOD_AUTHORITATIVE_LADDERS,
  benchmarkScenarioSupport,
  broodProxyDensityPlan,
  generateDeterministicRoster,
  scenarioAuthorities
} from './scenario-manifests.mjs';
import {
  buildExpectedPopulation,
  collectAuthoritativePopulation,
  collectBattlefieldTelemetry,
  frameEvidenceCamera
} from './seeded-load-generator.mjs';
import { PERF_FIXTURE_CASES, evidenceFixtureCase, verifyFixtureCase } from './fixture-verifier.mjs';
import {
  cleanupDiagnosticCandidate,
  parseBroodProxyDensity,
  parsePerformancePopulations,
  prepareCurrentPerfOutput,
  summarizeMeasurementCoverage,
  summarizeHostMemoryPressure
} from './perf-probe-runner.mjs';

let passes = 0;
const HERE = dirname(fileURLToPath(import.meta.url));
function check(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  passes++;
  console.log(`PASS ${label}`);
}

function pngChunk(type, payload) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, payload])));
  return Buffer.concat([length, typeBytes, payload, checksum]);
}

function tinyPng({ blank = false, variant = 0 } = {}) {
  const width = 2, height = 2;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const palettes = [
    [[0, 0, 0, 255], [255, 255, 255, 255], [255, 0, 0, 255], [0, 255, 0, 255]],
    [[0, 0, 255, 255], [255, 255, 0, 255], [0, 255, 255, 255], [255, 0, 255, 255]]
  ];
  const pixels = blank ? Array.from({ length: 4 }, () => [32, 32, 32, 255]) : palettes[variant % palettes.length];
  const scanlines = [];
  for (let row = 0; row < height; row++) {
    scanlines.push(Buffer.from([0]));
    scanlines.push(Buffer.from(pixels.slice(row * width, row * width + width).flat()));
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(scanlines))),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

const runnerSource = await readFile(join(HERE, 'perf-probe-runner.mjs'), 'utf8');
const mainAt = runnerSource.indexOf('async function main()');
const runnerMain = runnerSource.slice(mainAt);
const guardAt = runnerMain.indexOf('workspaceGuard = await acquireVerificationFreeze');
const outputPrepAt = runnerMain.indexOf('await prepareCurrentPerfOutput');
check(mainAt >= 0 && guardAt >= 0 && guardAt < outputPrepAt,
  'performance runner acquires the workspace freeze before any output mutation');
check(runnerMain.includes('allowedPaths: [LEGACY_PERF_ROOT, ...CONCURRENT_STAGE10_AUTHORING.map') &&
  runnerSource.includes("const CURRENT_PERF_ROOT = join(LEGACY_PERF_ROOT, 'current')") &&
  runnerSource.includes('collectConcurrentStage10Snapshot()') &&
  runnerSource.includes('inputClosureFingerprint'),
  'performance runner limits output to tmp and records excluded Stage 10 authoring writes while binding executing inputs');
check(runnerSource.includes("ownershipMode: 'isolated'") &&
  (runnerSource.match(/closePwBrowser\(browser\)/g) || []).length === 2,
  'performance runner owns and closes its isolated browser on success and failure paths');
const runtimeStateSource = runnerSource.slice(runnerSource.indexOf('async function runtimeState'),
  runnerSource.indexOf('export async function enableRuntimeTelemetry'));
check(runtimeStateSource.includes("typeof MF_SIM_DT !== 'undefined'") &&
  runtimeStateSource.includes('? Number(mfDetTick)') &&
  !runtimeStateSource.includes('Math.round(simTimeSec /') &&
  !runtimeStateSource.includes('authoritativeUnits > 22000'),
  'runtime evidence uses the engine fixed step and actual authority tick without derived/adaptive timing');
const frameSamplerSource = runnerSource.slice(runnerSource.indexOf('async function sampleFrames'),
  runnerSource.indexOf('function appendProbe'));
check(frameSamplerSource.includes('while (probe.frameDts.length < frameCount)') &&
  frameSamplerSource.includes('presented === observedPresentationFrame') &&
  frameSamplerSource.includes('presentationInterval') &&
  frameSamplerSource.includes('Number(acc) / Number(MF_SIM_DT)'),
  'frame evidence samples presented intervals and cannot count skipped high-refresh RAF callbacks as FPS');
check(runnerSource.includes('const measurementStartState = await runtimeState(page)') &&
  runnerSource.includes('measurementEndState = await runtimeState(page)') &&
  runnerSource.includes('measurementEndState.atPerformanceMs - measurementStartState.atPerformanceMs') &&
  runnerSource.includes('const simulatedTicks = measurementEndState.simTick - measurementStartState.simTick') &&
  runnerSource.includes('const simulatedDurationSec = simulatedTicks * measurementStartState.simStepSec'),
  'wall and simulated duration share exact in-page state/timestamp boundaries');
check(frameSamplerSource.includes('gpuSerial !== lastGpuSampleSerial') &&
  frameSamplerSource.includes('probe.gpuSampleSerials.push(gpuSerial)') &&
  frameSamplerSource.includes("if (!current?.gpuDisjoint) push(probe.gpuTimes, current?.gpu?.render)"),
  'GPU timing records each newly resolved non-disjoint query once instead of repeating stale latest values');
const postSampleTraceAt = runnerSource.indexOf('hitchTrace: window.mfPerfTraceSnapshot()');
const secondSampleAt = runnerSource.indexOf('const secondSample = await sampleFramesWithCpuProfile');
check(secondSampleAt >= 0 && postSampleTraceAt > secondSampleAt &&
  runnerSource.includes("throw new Error('Required window.mfPerfTraceSnapshot() is unavailable"),
  'bounded hitch trace is required and copied once after presented-frame sampling');
check(runnerSource.includes('longTaskTotalCount++') &&
  runnerSource.includes('if (probe.longTasks.length >= 256) probe.longTasks.shift()') &&
  runnerSource.includes('capacity: 256'),
  'probe long-task records retain a total count while bounding stored records to 256');
check(runnerSource.includes("const cpuProfile = args.includes('--cpu-profile')") &&
  runnerSource.includes("samplingIntervalUs: 1000") &&
  runnerSource.includes("extname(path) !== '.cpuprofile'"),
  'optional CDP CPU profiling is explicit, 1000us, deterministic-path, and default-off');
const hostMemory = summarizeHostMemoryPressure({
  before: { kind: 'before', elapsedMs: 0, freeBytes: 900 },
  after: { kind: 'after', elapsedMs: 2000, freeBytes: 700 },
  points: [{ kind: 'periodic', elapsedMs: 1000, freeBytes: 400 }],
  totalPointCount: 1,
  totalBytes: 4096,
  observedFreeMinBytes: 400,
  observedFreeMaxBytes: 900
});
check(hostMemory.freeMinBytes === 400 && hostMemory.freeMaxBytes === 900 &&
  hostMemory.pressureThresholdBytes === 512 * 1024 * 1024 && hostMemory.pressure === true &&
  hostMemory.pointCapacity === 600 && /not Android-device memory/.test(hostMemory.limitation),
  'host memory evidence reports bounded before/after pressure with an explicit non-device limitation');
check(runnerSource.includes("const testedEntry = servingPacked ? 'www/index.html' : 'index.html'") &&
  runnerSource.includes('assets/data/runtime-compatibility.json') &&
  runnerSource.includes('await assertPackedJsParity(sourceTree, servedTree, packedRoot)') &&
  runnerSource.includes('run node tools/pack-www.mjs'),
  'evidence fingerprints the served package and rejects stale packed JavaScript with an actionable error');
const reporterSource = await readFile(join(HERE, 'benchmark-report-generator.mjs'), 'utf8');
check(reporterSource.includes("const CURRENT_PERF_ROOT = join(ROOT, 'tmp/perf-lab/current')") &&
  !reporterSource.includes("join(ROOT, 'tmp/perf-lab/metrics')"),
  'benchmark report defaults scan only the explicit current lane');
check(JSON.stringify(parsePerformancePopulations(['--ladder'])) === JSON.stringify([100, 250, 500]) &&
  parsePerformancePopulations(['--units', '250'])[0] === 250,
  'performance population selection stops at the authoritative 500-body ceiling');
let invalidPopulationCount = 0;
for (const value of ['0', '501', '1001', '500x', '--preset']) {
  try { parsePerformancePopulations(['--units', value]); } catch { invalidPopulationCount++; }
}
check(invalidPopulationCount === 5, 'arbitrary or malformed --units values are rejected');
check(parseBroodProxyDensity([]) === 'high' && parseBroodProxyDensity(['--proxy-density', 'cinematic']) === 'cinematic',
  'Brood proxy density has a stable high default and accepts declared presets');
let invalidProxyDensity = false;
try { parseBroodProxyDensity(['--proxy-density', 'maximum']); } catch { invalidProxyDensity = true; }
check(invalidProxyDensity, 'unknown Brood proxy density is rejected');
const measurementCoverage = summarizeMeasurementCoverage({
  totalUnits: [2500, 2488, 2386],
  realBroodUnits: [500, 493], visibleBroodUnits: [0, 41],
  proxyBodies: [3000, 2900], proxyClusters: [38, 36]
}, 2500, {
  attempted: { total: 2500 }, accepted: { total: 2500 }, postSettle: { total: 2500, unmatched: 0 }
});
check(measurementCoverage.admission.exact && measurementCoverage.admission.postSettle === 2500 &&
  measurementCoverage.liveSample.total.min === 2386 && measurementCoverage.liveSample.total.max === 2500,
  'exact admission is reported separately from live measured population loss');
check(measurementCoverage.brood.realBodies.min === 493 && measurementCoverage.brood.visibleBodies.max === 41 &&
  measurementCoverage.brood.visibleRealBroodCovered && measurementCoverage.brood.proxyTelemetryCovered &&
  measurementCoverage.brood.proxyBodies.max === 3000 && measurementCoverage.brood.proxyClusters.max === 38,
  'Brood evidence labels real, visible, proxy-body, and proxy-cluster measurement coverage');
const cleanupDiagnostic = cleanupDiagnosticCandidate({
  scenarioId: '1v4_continental_conquest', unitsPerFaction: 500,
  evidenceStatus: 'accepted', evidenceClass: 'stage8-scenario-pass',
  performanceGate: { outcome: 'PASS', evidenceStatus: 'accepted', acceptancePopulationEligible: true, thresholdPassed: true }
}, new Error('PW_OWNED_CLEANUP_INCOMPLETE: profile busy'));
check(cleanupDiagnostic.schema === 'massfront-perf-cleanup-diagnostic-v1' &&
  cleanupDiagnostic.acceptanceEligible === false && cleanupDiagnostic.evidenceStatus === 'diagnostic' &&
  cleanupDiagnostic.measurement.evidenceStatus === 'diagnostic' &&
  cleanupDiagnostic.measurement.performanceGate.outcome === 'DIAGNOSTIC/INCOMPLETE' &&
  cleanupDiagnostic.measurement.performanceGate.originalMeasuredOutcome === 'PASS',
  'cleanup failure preserves measurements only as an explicitly non-acceptance diagnostic');
const invalidPopulationCli = spawnSync(process.execPath, [join(HERE, 'perf-probe-runner.mjs'), '--units', '501'], {
  encoding: 'utf8'
});
check(invalidPopulationCli.status === 1 && invalidPopulationCli.stderr.includes('--units must be one of'),
  'invalid CLI population fails before a benchmark or evidence mutation starts');
for (const label of [
  'before performance scenario', 'after real deployment', 'after offline isolation',
  'after final source identity', 'after performance scenario', 'performance matrix completion'
]) {
  check(runnerMain.includes(label), `performance runner guards ${label}`);
}
const benchmarkSource = runnerSource.slice(runnerSource.indexOf('export async function runScenarioBenchmark'), mainAt);
for (const label of [
  'before deterministic load', 'after population settle', 'after start capture',
  'after mid capture', 'after end capture', 'after end source identity'
]) {
  check(benchmarkSource.includes(`checkpoint('${label}')`), `benchmark checkpoints ${label}`);
}
check(benchmarkSource.includes('Pre-sample console errors') &&
  benchmarkSource.includes('Console errors during benchmark') &&
  runnerMain.includes('result.runtimeGate.consoleErrors = [...issues.consoleErrors]'),
  'runner rejects console errors before sampling, during sampling, and before final acceptance');
check(runnerSource.includes("captureLane: 'desktop-v3'") && runnerSource.includes("captureLane = 'device-v3'") &&
  !runnerSource.includes('runTag') && !runnerSource.includes('Date.now()'),
  'performance captures use bounded desktop/device lane names without timestamps');
const finalReleaseAt = runnerMain.indexOf('workspaceGuard.release({ assertStable: true');
const failureGateAt = runnerMain.indexOf('if (failure) {');
const diagnosticPreserveAt = runnerMain.indexOf('await preserveCleanupDiagnostics(results, failure)');
const publishAt = runnerMain.indexOf('for (const output of queuedOutputs)');
check(finalReleaseAt >= 0 && finalReleaseAt < failureGateAt && failureGateAt < diagnosticPreserveAt && diagnosticPreserveAt < publishAt,
  'stable final release and cleanup-diagnostic failure gate precede accepted evidence publication');

const unsupported = telemetryStats([], { supported: false, source: 'self-test' });
check(unsupported.sampleCount === 0 && unsupported.p50 === null && unsupported.mean === null,
  'unsupported telemetry is null, not zero');
const supportedZero = telemetryStats([0, 0], { supported: true, source: 'self-test' });
check(supportedZero.sampleCount === 2 && supportedZero.p50 === 0,
  'supported zero measurements remain distinguishable from missing telemetry');

const rosterScenario = BENCHMARK_SCENARIOS['1v4_continental_conquest'];
const rosterTopology = benchmarkScenarioSupport(rosterScenario);
const rosterPopulation = buildExpectedPopulation(rosterScenario, 500);
check(rosterTopology.status === 'supported' && rosterTopology.normalParticipantCount === 4 &&
  rosterTopology.systemForceCount === 1 && rosterPopulation.total === 2500 &&
  rosterPopulation.byAuthorityKind['normal-participant'] === 2000 &&
  rosterPopulation.byAuthorityKind['system-force'] === 500,
  '1v4/2500 distinguishes four normal participants from the Brood system force');
check(JSON.stringify(BROOD_AUTHORITATIVE_LADDERS) === JSON.stringify([100, 250, 500]) &&
  broodProxyDensityPlan(500, 'high').requestedProxyBodies === 3000 &&
  broodProxyDensityPlan(500, 'high').requestedProxyClusters === 38,
  'Brood authoritative ladder and deterministic High proxy-density plan are explicit');
const broodSpec = rosterScenario.systemForces[0];
const broodRosterA = generateDeterministicRoster(broodSpec, 250, rosterScenario.mapSeed + 404);
const broodRosterB = generateDeterministicRoster(broodSpec, 250, rosterScenario.mapSeed + 404);
const broodRosterC = generateDeterministicRoster(broodSpec, 250, rosterScenario.mapSeed + 405);
check(JSON.stringify(broodRosterA) === JSON.stringify(broodRosterB) &&
  JSON.stringify(broodRosterA) !== JSON.stringify(broodRosterC),
  'Brood wildcard rosters preserve exact seeded repeatability and seed separation');
const unsupportedFiveNormal = {
  id: 'unsupported_five_normal',
  participants: [
    { team: 0, slot: -1 }, { team: 1, slot: 0 }, { team: 1, slot: 1 },
    { team: 1, slot: 2 }, { team: 1, slot: 3 }
  ],
  systemForces: []
};
check(benchmarkScenarioSupport(unsupportedFiveNormal).status === 'unsupported' &&
  benchmarkScenarioSupport(unsupportedFiveNormal).reason.includes('5 normal participants'),
  'five normal seats are unsupported while four plus one system force remains valid');

const browserGlobals = [
  'window', 'ualive', 'unitHigh', 'uteam', 'uCmd', 'ux', 'uy', 'cam', 'camFollow', 'orthoSpan', 'distTarget',
  'camPitch', 'pitchTarget', 'camYaw', 'yawTarget', 'clampCam', 'camUpdateMatrices', 'camBounds', 'w2s',
  'fogEntityVisible', 'mfBroodCrowdStats', 'VW', 'VH'
];
const previousBrowserGlobals = new Map(browserGlobals.map(key => [key, globalThis[key]]));
try {
  Object.assign(globalThis, {
    window: globalThis,
    ualive: Uint8Array.from([1, 1, 1, 1]), unitHigh: 4,
    uteam: Int8Array.from([0, 0, 2, 2]), uCmd: Int8Array.from([-1, -1, -1, -1]),
    ux: Float32Array.from([440, 470, 1600, 1630]), uy: Float32Array.from([430, 460, 1600, 1630]),
    cam: { x: 1600, y: 1600 }, camFollow: 9, orthoSpan: 2600, distTarget: 2600,
    camPitch: 1.05, pitchTarget: 1.05, camYaw: 0.9, yawTarget: 0.9,
    VW: 412, VH: 900
  });
  globalThis.clampCam = () => {};
  globalThis.camUpdateMatrices = () => {};
  globalThis.camBounds = () => ({ x0: globalThis.cam.x - 900, x1: globalThis.cam.x + 900,
    y0: globalThis.cam.y - 900, y1: globalThis.cam.y + 900 });
  globalThis.w2s = (x, y) => [206 + (x - globalThis.cam.x) * 0.5, 450 + (y - globalThis.cam.y) * 0.5];
  globalThis.fogEntityVisible = () => true;
  globalThis.mfBroodCrowdStats = () => ({ visualBodies: 1200, clusterInstances: 15 });
  const fakePage = { evaluate: async (fn, arg) => fn(arg) };
  const auth = await collectAuthoritativePopulation(fakePage, rosterScenario);
  check(auth.total === 4 && auth.realBrood === 2 && auth.unmatched === 0 &&
    auth.byAuthorityKind['normal-participant'] === 2 && auth.byAuthorityKind['system-force'] === 2,
    'authoritative reconciliation assigns team-2 wildlife slots to the Brood system force');
  const framed = await frameEvidenceCamera(fakePage, rosterScenario, 'self-test');
  check(framed.visible === 2 && globalThis.camFollow === -1 && globalThis.camPitch === rosterScenario.camera.pitch &&
    globalThis.camYaw === rosterScenario.camera.yaw,
    'evidence camera frames live friendly bodies and writes the real camPitch/camYaw state');
  const battlefield = await collectBattlefieldTelemetry(fakePage);
  check(battlefield.total === 4 && battlefield.visible > 0 && battlefield.realBrood === 2 &&
    battlefield.proxyBodies === 1200 && battlefield.proxyClusters === 15 && battlefield.proxyTelemetrySupported,
    'battlefield telemetry reports real/visible Brood and render-only proxy bodies/clusters');
} finally {
  for (const [key, value] of previousBrowserGlobals) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}
const supportedMatrix = [
  ['1v1_duel_verdant', 1000], ['1v2_flank_arctic', 1500], ['1v3_crossfire_ashland', 2000],
  ['1v4_continental_conquest', 2500]
];
for (const [scenarioId, total] of supportedMatrix) {
  const scenario = BENCHMARK_SCENARIOS[scenarioId];
  const expectedPopulation = buildExpectedPopulation(scenario, 500);
  check(benchmarkScenarioSupport(scenario).status === 'supported' && expectedPopulation.total === total,
    `${scenarioId} supports the current ${total}-unit acceptance case`);
  check(scenarioAuthorities(scenario).every((spec, index) =>
    generateDeterministicRoster(spec, 500, scenario.mapSeed + index * 1013).length === 500),
    `${scenarioId} deterministic rosters attempt 500 units per seat`);
}

const valid = validEvidenceFixture();
const validDecision = validatePerfEvidence(valid);
check(validDecision.valid && validDecision.status === 'accepted' &&
  valid.performanceGate.outcome === 'PASS' && valid.performanceGate.frameP95Ms === 17 &&
  valid.performanceGate.frameP99Ms === 17 && valid.performanceGate.thresholdMs === 33.3 &&
  valid.performanceGate.physicalSustainedDevicePass === false,
  'exact 500/faction fixture passes the p99 33.3 ms short-run gate without a sustained-device claim');

const requiredMatrixEntries = [
  '1v1_duel_verdant', '1v2_flank_arctic', '1v3_crossfire_ashland', '1v4_continental_conquest'
].map((scenarioId, index) => ({ file: `required-${index}.json`, record: validEvidenceFixture({ scenarioId }) }));
const oneRowMatrix = validateStage8DesktopMatrix(requiredMatrixEntries.slice(0, 1).map(entry => entry.record));
check(!oneRowMatrix.valid && oneRowMatrix.missingScenarioIds.length === 3,
  'one scenario-level PASS is not a complete Stage 8 desktop matrix');
const exactMatrix = validateStage8DesktopMatrix(requiredMatrixEntries.map(entry => entry.record));
check(exactMatrix.valid && !exactMatrix.missingScenarioIds.length &&
  !exactMatrix.duplicateScenarioIds.length && !exactMatrix.unexpectedScenarioIds.length,
  'exactly one valid row for each required 1v1 through 1v4 scenario completes the matrix');
const oneRowBatch = validateEvidenceBatch([requiredMatrixEntries[0].record]);
const exactMatrixBatch = validateEvidenceBatch(requiredMatrixEntries.map(entry => entry.record));
check(oneRowBatch.contractValidBatch && !oneRowBatch.stage8Pass && exactMatrixBatch.stage8Pass,
  'batch validation distinguishes one contract-valid row from the exact Stage 8 matrix PASS');
const duplicateMatrix = validateStage8DesktopMatrix(
  [...requiredMatrixEntries, requiredMatrixEntries[0]].map(entry => entry.record)
);
check(!duplicateMatrix.valid && duplicateMatrix.duplicateScenarioIds.includes('1v1_duel_verdant'),
  'duplicate required-scenario rows keep the matrix incomplete');
const unexpectedMatrix = validateStage8DesktopMatrix([
  ...requiredMatrixEntries,
  { file: 'substitute.json', record: validEvidenceFixture({ scenarioId: '1v1_duel_megacity' }) }
].map(entry => entry.record));
check(!unexpectedMatrix.valid && unexpectedMatrix.unexpectedScenarioIds.includes('1v1_duel_megacity'),
  'an extra substitute scenario keeps the exact Stage 8 matrix incomplete');

const diagnostic = validEvidenceFixture({ unitsPerFaction: 250 });
const diagnosticDecision = validatePerfEvidence(diagnostic);
check(diagnosticDecision.valid && diagnosticDecision.status === 'diagnostic' &&
  diagnostic.evidenceStatus === 'diagnostic' && diagnostic.performanceGate.outcome === 'DIAGNOSTIC/INCOMPLETE' &&
  diagnostic.performanceGate.acceptancePopulationEligible === false,
  'finite non-500 ladder evidence remains contract-valid but DIAGNOSTIC/INCOMPLETE');

const overBudget = validEvidenceFixture({ frameSamples: [16, 20, 48] });
const overBudgetDecision = validatePerfEvidence(overBudget);
check(overBudgetDecision.valid && overBudgetDecision.status === 'failed' &&
  overBudget.evidenceStatus === 'failed' && overBudget.performanceGate.outcome === 'FAIL' &&
  overBudget.performanceGate.frameP95Ms === 48 && overBudget.performanceGate.frameP99Ms === 48 &&
  overBudget.performanceGate.thresholdPassed === false,
  'exact 500/faction evidence over p99 33.3 ms is a Stage 8 FAIL, never accepted');

const wrongScenarioTotal = cloneFixture(valid);
wrongScenarioTotal.scenarioId = '1v3_crossfire_ashland';
wrongScenarioTotal.performanceGate = deriveStage8PerformanceGate({
  scenarioId: wrongScenarioTotal.scenarioId,
  unitsPerFaction: wrongScenarioTotal.unitsPerFaction,
  expectedSeats: wrongScenarioTotal.population.expected.seats,
  expectedTotal: wrongScenarioTotal.population.expected.total,
  acceptanceTotal: wrongScenarioTotal.topology.acceptanceTotal,
  frameTimeMs: wrongScenarioTotal.metrics.frameTimeMs,
  scope: wrongScenarioTotal.performanceGate.scope
});
wrongScenarioTotal.evidenceStatus = wrongScenarioTotal.performanceGate.evidenceStatus;
wrongScenarioTotal.evidenceClass = wrongScenarioTotal.performanceGate.evidenceClass;
const wrongScenarioDecision = validatePerfEvidence(wrongScenarioTotal);
check(wrongScenarioDecision.valid && wrongScenarioDecision.status === 'diagnostic',
  'a 1v3 label with only a 1v1 seat total cannot become Stage 8 acceptance');

const authGate = cloneFixture(valid);
authGate.runtimeGate.authUiVisible = true;
check(!validatePerfEvidence(authGate).valid, 'auth-gate capture is rejected');

const consoleGate = cloneFixture(valid);
consoleGate.runtimeGate.consoleErrors.push('WebGL shader compilation failed');
check(!validatePerfEvidence(consoleGate).valid, 'unexpected console errors reject performance evidence');

const shortSpawn = cloneFixture(valid);
shortSpawn.population.postSettle.total = 3;
check(!validatePerfEvidence(shortSpawn).valid, 'post-settle count mismatch is rejected');

const fakeZero = cloneFixture(valid);
fakeZero.metrics.gpuTimeMs = { supported: false, sampleCount: 0, source: 'none', p50: 0, p95: 0, p99: 0, mean: 0, max: 0, min: 0 };
check(!validatePerfEvidence(fakeZero).valid, 'unsupported zero-filled subsystem timing is rejected');

const missingProvenance = cloneFixture(valid);
delete missingProvenance.provenance.worktreeFingerprint;
check(!validatePerfEvidence(missingProvenance).valid, 'missing worktree provenance is rejected');

for (const name of PERF_FIXTURE_CASES) {
  const result = verifyFixtureCase(name);
  const expectedStatus = name === 'valid' ? 'SCENARIO_PASS'
    : name === 'diagnostic-ladder' ? 'DIAGNOSTIC/INCOMPLETE'
    : name === 'over-budget' ? 'FAILED'
    : name === 'unsupported-1v4' ? 'UNSUPPORTED' : 'UNKNOWN';
  check(result.status === expectedStatus, `${name} fixture classifies ${expectedStatus}`);
  const child = spawnSync(process.execPath, [join(HERE, 'fixture-verifier.mjs'), name], { encoding: 'utf8' });
  const expectedExit = expectedStatus === 'SCENARIO_PASS' ? 0
    : ['DIAGNOSTIC/INCOMPLETE', 'UNSUPPORTED'].includes(expectedStatus) ? 2 : 1;
  check(child.status === expectedExit && child.stdout.includes(`"status":"${expectedStatus}"`),
    `${name} fixture exits ${expectedExit} with ${expectedStatus}`);
}

const mixed = cloneFixture(valid);
mixed.provenance.runtimeFingerprint = 'd'.repeat(64);
mixed.provenance.testedPackageSha256 = mixed.provenance.runtimeFingerprint;
mixed.provenance.endRuntimeFingerprint = mixed.provenance.runtimeFingerprint;
const mixedBatch = validateEvidenceBatch([valid, mixed]);
check(!mixedBatch.valid && mixedBatch.mixedErrors.length > 0, 'mixed runtime evidence batch is rejected');

const tempRoot = await mkdtemp(join(tmpdir(), 'mf-perf-selftest-'));
try {
  const laneRoot = join(tempRoot, 'lane');
  const legacyMetricsDir = join(laneRoot, 'metrics');
  const currentRoot = join(laneRoot, 'current');
  const currentMetricsDir = join(currentRoot, 'metrics');
  const currentCapturesDir = join(currentRoot, 'captures');
  const currentReportsDir = join(currentRoot, 'reports');
  const currentDiagnosticsDir = join(currentRoot, 'diagnostics');
  await Promise.all([
    mkdir(legacyMetricsDir, { recursive: true }),
    mkdir(currentMetricsDir, { recursive: true }),
    mkdir(currentCapturesDir, { recursive: true }),
    mkdir(currentReportsDir, { recursive: true }),
    mkdir(currentDiagnosticsDir, { recursive: true })
  ]);
  const legacyRejectedPath = join(legacyMetricsDir, '1v1_duel_verdant_500u.json');
  await writeFile(legacyRejectedPath, JSON.stringify({ scenarioId: 'preserved-legacy-rejection' }));
  const staleCurrentFiles = [
    join(currentMetricsDir, '1v1_duel_verdant_500u_v3.json'),
    join(currentMetricsDir, 'summary_matrix_abcdef123456_v3.json'),
    ...['start', 'mid', 'end'].map(stage =>
      join(currentCapturesDir, `1v1_duel_verdant_500u_desktop-v3_${stage}.png`)),
    join(currentCapturesDir, '1v1_duel_verdant_500u_abcdef123456_12345_start.png'),
    join(currentReportsDir, 'EVIDENCE_REJECTION_LEDGER.json'),
    join(currentReportsDir, 'BENCHMARK_MATRIX_REPORT.md'),
    join(currentReportsDir, 'benchmark_matrix.csv'),
    join(currentDiagnosticsDir, '1v1_duel_verdant_500u_cleanup_incomplete_v3.json'),
    join(currentDiagnosticsDir, '1v1_duel_verdant_500u_desktop-v3_sample1.cpuprofile'),
    join(currentDiagnosticsDir, '1v1_duel_verdant_500u_desktop-v3_sample2.cpuprofile')
  ];
  for (const path of staleCurrentFiles) await writeFile(path, 'stale');
  const cleanup = await prepareCurrentPerfOutput({
    scenarios: [BENCHMARK_SCENARIOS['1v1_duel_verdant']], populations: [500], currentRoot
  });
  check(cleanup.root === currentRoot && staleCurrentFiles.every(path => !existsSync(path)) && existsSync(legacyRejectedPath),
    'current-lane cleanup removes bounded outputs without touching preserved legacy evidence');

  const laneBytes = tinyPng();
  const laneCaptureSha = createHash('sha256').update(laneBytes).digest('hex');
  const laneRecord = validEvidenceFixture({ captureSha256: laneCaptureSha });
  for (const stage of ['start', 'mid', 'end']) await writeFile(join(currentCapturesDir, `${stage}.png`), laneBytes);
  await writeFile(join(currentMetricsDir, 'valid.json'), JSON.stringify(laneRecord, null, 2));
  const laneAccepted = await generateBenchmarkReports({
    metricsDir: currentMetricsDir, capturesDir: currentCapturesDir, reportsDir: currentReportsDir, throwOnReject: true
  });
  check(!laneAccepted.stage8Pass && laneAccepted.contractValid && laneAccepted.accepted.length === 1 &&
    laneAccepted.matrixGate.missingScenarioIds.length === 3 && laneAccepted.rejected.length === 0 &&
    existsSync(legacyRejectedPath),
  'current-lane report isolates legacy JSON while one scenario-level PASS remains matrix-incomplete');

  const metricsDir = join(tempRoot, 'metrics');
  const capturesDir = join(tempRoot, 'captures');
  const reportsDir = join(tempRoot, 'reports');
  await Promise.all([mkdir(metricsDir), mkdir(capturesDir), mkdir(reportsDir)]);
  let emptyRejected = false;
  try {
    await generateBenchmarkReports({ metricsDir, capturesDir, reportsDir, throwOnReject: true });
  } catch { emptyRejected = true; }
  check(emptyRejected, 'report rejects a missing evidence set');
  const bytes = tinyPng();
  const alternateBytes = tinyPng({ variant: 1 });
  const blankBytes = tinyPng({ blank: true });
  const captureSha = createHash('sha256').update(bytes).digest('hex');
  const artifactRecord = validEvidenceFixture({ captureSha256: captureSha });
  const validMetricPath = join(metricsDir, 'valid.json');
  for (const stage of ['start', 'mid', 'end']) await writeFile(join(capturesDir, `${stage}.png`), bytes);
  await writeFile(validMetricPath, JSON.stringify(artifactRecord, null, 2));
  const accepted = await generateBenchmarkReports({ metricsDir, capturesDir, reportsDir, throwOnReject: true });
  check(!accepted.stage8Pass && accepted.contractValid && accepted.accepted.length === 1 &&
    accepted.matrixGate.missingScenarioIds.length === 3 && accepted.rejected.length === 0,
    'one decoded, dimension-matched scenario PASS remains an incomplete Stage 8 matrix');
  const acceptedMarkdown = await readFile(join(reportsDir, 'BENCHMARK_MATRIX_REPORT.md'), 'utf8');
  check(acceptedMarkdown.includes('Frame p95') && acceptedMarkdown.includes('Frame p99') &&
    acceptedMarkdown.includes('33.3 ms') && acceptedMarkdown.includes('not a physical sustained-device pass') &&
    acceptedMarkdown.includes('1v2_flank_arctic') && acceptedMarkdown.includes('1v3_crossfire_ashland') &&
    acceptedMarkdown.includes('1v4_continental_conquest') &&
    acceptedMarkdown.includes('Outcome: **INCOMPLETE**'),
    'report surfaces p95/p99/scope and the exact missing matrix scenarios');

  const matrixFixtureFiles = [
    ['required-1v2.json', '1v2_flank_arctic'],
    ['required-1v3.json', '1v3_crossfire_ashland'],
    ['required-1v4.json', '1v4_continental_conquest']
  ];
  for (const [file, scenarioId] of matrixFixtureFiles) {
    await writeFile(join(metricsDir, file), JSON.stringify(validEvidenceFixture({ captureSha256: captureSha, scenarioId }), null, 2));
  }
  const exactAccepted = await generateBenchmarkReports({ metricsDir, capturesDir, reportsDir, throwOnReject: true });
  check(exactAccepted.stage8Pass && exactAccepted.accepted.length === 4 && exactAccepted.matrixGate.valid,
    'report reaches Stage 8 matrix PASS only with one valid row for each exact required scenario');
  await writeFile(join(metricsDir, 'unsupported.json'), JSON.stringify(evidenceFixtureCase('unsupported-1v4'), null, 2));
  const withUnsupported = await generateBenchmarkReports({ metricsDir, capturesDir, reportsDir, throwOnReject: true });
  check(withUnsupported.stage8Pass && withUnsupported.accepted.length === 4 &&
    withUnsupported.unsupported.length === 1 && withUnsupported.rejected.length === 0,
    'report marks 1v4 UNSUPPORTED without accepting or failing it');

  await writeFile(join(capturesDir, 'mid.png'), alternateBytes);
  let hashRejected = false;
  try {
    await generateBenchmarkReports({ metricsDir, capturesDir, reportsDir, throwOnReject: true });
  } catch { hashRejected = true; }
  check(hashRejected, 'report rejects a different decodable PNG when its hash does not match');
  await writeFile(join(capturesDir, 'mid.png'), bytes);

  const corruptBytes = Buffer.from('not-a-png-but-hash-matched');
  const corruptRecord = cloneFixture(artifactRecord);
  corruptRecord.captures.find(capture => capture.stage === 'mid').sha256 =
    createHash('sha256').update(corruptBytes).digest('hex');
  await writeFile(validMetricPath, JSON.stringify(corruptRecord, null, 2));
  await writeFile(join(capturesDir, 'mid.png'), corruptBytes);
  let corruptRejected = false;
  try {
    await generateBenchmarkReports({ metricsDir, capturesDir, reportsDir, throwOnReject: true });
  } catch { corruptRejected = true; }
  const corruptLedger = JSON.parse(await readFile(join(reportsDir, 'EVIDENCE_REJECTION_LEDGER.json'), 'utf8'));
  check(corruptRejected && corruptLedger.rejectedFiles.some(item =>
    item.file === 'valid.json' && item.reasons.some(reason => reason.includes('CAPTURE_PNG_SIGNATURE_INVALID'))),
  'arbitrary bytes are rejected even when their recorded hash matches');

  const blankRecord = cloneFixture(artifactRecord);
  blankRecord.captures.find(capture => capture.stage === 'mid').sha256 =
    createHash('sha256').update(blankBytes).digest('hex');
  await writeFile(validMetricPath, JSON.stringify(blankRecord, null, 2));
  await writeFile(join(capturesDir, 'mid.png'), blankBytes);
  let blankRejected = false;
  try {
    await generateBenchmarkReports({ metricsDir, capturesDir, reportsDir, throwOnReject: true });
  } catch { blankRejected = true; }
  const blankLedger = JSON.parse(await readFile(join(reportsDir, 'EVIDENCE_REJECTION_LEDGER.json'), 'utf8'));
  check(blankRejected && blankLedger.rejectedFiles.some(item =>
    item.file === 'valid.json' && item.reasons.some(reason => reason.includes('capture is blank'))),
  'solid-color decoded PNGs are rejected as blank proof');

  const dimensionRecord = cloneFixture(artifactRecord);
  dimensionRecord.captures.find(capture => capture.stage === 'mid').width = 3;
  await writeFile(validMetricPath, JSON.stringify(dimensionRecord, null, 2));
  await writeFile(join(capturesDir, 'mid.png'), bytes);
  let dimensionRejected = false;
  try {
    await generateBenchmarkReports({ metricsDir, capturesDir, reportsDir, throwOnReject: true });
  } catch { dimensionRejected = true; }
  check(dimensionRejected, 'decoded PNG dimensions must match the dimensions recorded in evidence');

  const diagnosticRecord = validEvidenceFixture({ captureSha256: captureSha, unitsPerFaction: 250 });
  await writeFile(validMetricPath, JSON.stringify(diagnosticRecord, null, 2));
  const diagnosticReport = await generateBenchmarkReports({ metricsDir, capturesDir, reportsDir, throwOnReject: true });
  check(!diagnosticReport.stage8Pass && diagnosticReport.contractValid && diagnosticReport.accepted.length === 3 &&
    diagnosticReport.diagnostic.length === 1 && diagnosticReport.performanceFailed.length === 0,
    'report keeps non-500 evidence DIAGNOSTIC/INCOMPLETE instead of accepted');

  const failedRecord = validEvidenceFixture({ captureSha256: captureSha, frameSamples: [16, 20, 48] });
  await writeFile(validMetricPath, JSON.stringify(failedRecord, null, 2));
  let budgetFailed = false;
  try {
    await generateBenchmarkReports({ metricsDir, capturesDir, reportsDir, throwOnReject: true });
  } catch { budgetFailed = true; }
  const failedLedger = JSON.parse(await readFile(join(reportsDir, 'EVIDENCE_REJECTION_LEDGER.json'), 'utf8'));
  check(budgetFailed && failedLedger.performanceFailedFiles.includes('valid.json') &&
    !failedLedger.acceptedFiles.includes('valid.json'),
    'over-budget evidence produces a Stage 8 failure and is never listed as accepted');

  await writeFile(validMetricPath, JSON.stringify(artifactRecord, null, 2));
  await writeFile(join(capturesDir, 'mid.png'), bytes);

  await writeFile(join(metricsDir, 'legacy-invalid.json'), JSON.stringify({
    scenarioId: 'legacy', totalArmySpawned: 1000, metrics: { gpuTimeMs: { p50: 0 } }
  }, null, 2));
  let rejected = false;
  try {
    await generateBenchmarkReports({ metricsDir, capturesDir, reportsDir, throwOnReject: true });
  } catch { rejected = true; }
  check(rejected, 'report exits rejected when any legacy/invalid artifact is present');
  const ledger = JSON.parse(await readFile(join(reportsDir, 'EVIDENCE_REJECTION_LEDGER.json'), 'utf8'));
  check(ledger.acceptedFiles.includes('valid.json') && ledger.rejectedFiles.some(item => item.file === 'legacy-invalid.json'),
    'rejection ledger preserves and excludes invalid artifacts');
  const csv = await readFile(join(reportsDir, 'benchmark_matrix.csv'), 'utf8');
  check(csv.includes('1v1_duel_verdant') && csv.includes('frame_p99_ms') && csv.includes('stage8_outcome') &&
    !csv.includes('legacy'), 'CSV surfaces the Stage 8 gate and excludes rejected evidence');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log(`perf-lab self-test: ${passes} PASS`);
