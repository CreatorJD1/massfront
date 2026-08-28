import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { telemetryStats, validatePerfEvidence, validateEvidenceBatch } from './evidence-contract.mjs';
import { generateBenchmarkReports } from './benchmark-report-generator.mjs';
import { validEvidenceFixture, cloneFixture } from './fixtures/evidence-fixtures.mjs';
import { BENCHMARK_SCENARIOS, benchmarkScenarioSupport, generateDeterministicRoster } from './scenario-manifests.mjs';
import { buildExpectedPopulation } from './seeded-load-generator.mjs';
import { PERF_FIXTURE_CASES, evidenceFixtureCase, verifyFixtureCase } from './fixture-verifier.mjs';

let passes = 0;
const HERE = dirname(fileURLToPath(import.meta.url));
function check(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  passes++;
  console.log(`PASS ${label}`);
}

const unsupported = telemetryStats([], { supported: false, source: 'self-test' });
check(unsupported.sampleCount === 0 && unsupported.p50 === null && unsupported.mean === null,
  'unsupported telemetry is null, not zero');
const supportedZero = telemetryStats([0, 0], { supported: true, source: 'self-test' });
check(supportedZero.sampleCount === 2 && supportedZero.p50 === 0,
  'supported zero measurements remain distinguishable from missing telemetry');

const rosterScenario = BENCHMARK_SCENARIOS['1v4_continental_conquest'];
check(benchmarkScenarioSupport(rosterScenario).status === 'unsupported',
  '1v4/2500 is explicitly UNSUPPORTED until a fifth-seat adapter exists');
let unsupportedRosterBlocked = false;
try { buildExpectedPopulation(rosterScenario, 500); }
catch (error) { unsupportedRosterBlocked = error.code === 'MASSFRONT_PERF_SCENARIO_UNSUPPORTED'; }
check(unsupportedRosterBlocked, 'unsupported 1v4 cannot generate a roster or alias slot 3');
const supportedMatrix = [
  ['1v1_duel_verdant', 1000], ['1v2_flank_arctic', 1500], ['1v3_crossfire_ashland', 2000]
];
for (const [scenarioId, total] of supportedMatrix) {
  const scenario = BENCHMARK_SCENARIOS[scenarioId];
  const expectedPopulation = buildExpectedPopulation(scenario, 500);
  check(benchmarkScenarioSupport(scenario).status === 'supported' && expectedPopulation.total === total,
    `${scenarioId} supports the current ${total}-unit acceptance case`);
  check(scenario.factions.every((spec, index) =>
    generateDeterministicRoster(spec, 500, scenario.mapSeed + index * 1013).length === 500),
    `${scenarioId} deterministic rosters attempt 500 units per seat`);
}

const valid = validEvidenceFixture();
check(validatePerfEvidence(valid).valid, 'complete v3 fixture is accepted');

const authGate = cloneFixture(valid);
authGate.runtimeGate.authUiVisible = true;
check(!validatePerfEvidence(authGate).valid, 'auth-gate capture is rejected');

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
  const expectedStatus = name === 'valid' ? 'ACCEPTED' : name === 'unsupported-1v4' ? 'UNSUPPORTED' : 'UNKNOWN';
  check(result.status === expectedStatus, `${name} fixture classifies ${expectedStatus}`);
  const child = spawnSync(process.execPath, [join(HERE, 'fixture-verifier.mjs'), name], { encoding: 'utf8' });
  const expectedExit = expectedStatus === 'ACCEPTED' ? 0 : expectedStatus === 'UNSUPPORTED' ? 2 : 1;
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
  const metricsDir = join(tempRoot, 'metrics');
  const capturesDir = join(tempRoot, 'captures');
  const reportsDir = join(tempRoot, 'reports');
  await Promise.all([mkdir(metricsDir), mkdir(capturesDir), mkdir(reportsDir)]);
  let emptyRejected = false;
  try {
    await generateBenchmarkReports({ metricsDir, capturesDir, reportsDir, throwOnReject: true });
  } catch { emptyRejected = true; }
  check(emptyRejected, 'report rejects a missing evidence set');
  const bytes = Buffer.from('fixture-capture');
  const captureSha = createHash('sha256').update(bytes).digest('hex');
  const artifactRecord = validEvidenceFixture({ captureSha256: captureSha });
  for (const stage of ['start', 'mid', 'end']) await writeFile(join(capturesDir, `${stage}.png`), bytes);
  await writeFile(join(metricsDir, 'valid.json'), JSON.stringify(artifactRecord, null, 2));
  const accepted = await generateBenchmarkReports({ metricsDir, capturesDir, reportsDir, throwOnReject: true });
  check(accepted.accepted.length === 1 && accepted.rejected.length === 0, 'report accepts hash-matched complete evidence');
  await writeFile(join(metricsDir, 'unsupported.json'), JSON.stringify(evidenceFixtureCase('unsupported-1v4'), null, 2));
  const withUnsupported = await generateBenchmarkReports({ metricsDir, capturesDir, reportsDir, throwOnReject: true });
  check(withUnsupported.accepted.length === 1 && withUnsupported.unsupported.length === 1 && withUnsupported.rejected.length === 0,
    'report marks 1v4 UNSUPPORTED without accepting or failing it');

  await writeFile(join(capturesDir, 'mid.png'), Buffer.from('tampered-capture'));
  let hashRejected = false;
  try {
    await generateBenchmarkReports({ metricsDir, capturesDir, reportsDir, throwOnReject: true });
  } catch { hashRejected = true; }
  check(hashRejected, 'report rejects a capture hash mismatch');
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
  check(csv.includes('fixture_1v1') && !csv.includes('legacy'), 'CSV excludes rejected evidence');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log(`perf-lab self-test: ${passes} PASS`);
