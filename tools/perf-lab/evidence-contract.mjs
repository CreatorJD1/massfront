/* MASSFRONT performance evidence contract.
   This module is intentionally browser-free so fixtures can reject false-green
   captures without launching a long benchmark. */

export const PERF_EVIDENCE_SCHEMA = 'massfront-perf-evidence-v3';
export const PERF_EXECUTION_PATH = 'synthetic-load-in-real-match';
export const PERF_CAPTURE_STAGES = Object.freeze(['start', 'mid', 'end']);
export const PERF_CURRENT_MAX_SEATS = 4;
export const PERF_CURRENT_MAX_AI_SLOT = 2;
export const PERF_ACCEPTANCE_UNITS_PER_FACTION = 500;
export const PERF_FRAME_P99_BUDGET_MS = 33.3;
export const PERF_GATE_SCHEMA = 'massfront-stage8-short-frame-gate-v1';
export const PERF_STAGE8_SCENARIO_TOTALS = Object.freeze({
  '1v1_duel_verdant': 1000,
  '1v1_duel_megacity': 1000,
  '1v2_flank_arctic': 1500,
  '1v3_crossfire_ashland': 2000
});
export const PERF_STAGE8_DESKTOP_REQUIRED_SCENARIOS = Object.freeze([
  '1v1_duel_verdant',
  '1v2_flank_arctic',
  '1v3_crossfire_ashland'
]);

const STAT_KEYS = Object.freeze(['p50', 'p95', 'p99', 'mean', 'max', 'min']);
const SHA256_RE = /^[a-f0-9]{64}$/i;
const GIT_HEAD_RE = /^[a-f0-9]{40}$/i;

function finiteValues(values) {
  return Array.isArray(values) ? values.filter(Number.isFinite) : [];
}

/** Empty or unavailable telemetry is explicitly null, never a pretend zero. */
export function telemetryStats(values, { supported = true, source = null } = {}) {
  const samples = supported ? finiteValues(values) : [];
  const out = { supported: !!supported, sampleCount: samples.length, source: source || null };
  if (!supported || samples.length === 0) {
    for (const key of STAT_KEYS) out[key] = null;
    return out;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const len = sorted.length;
  const percentile = pct => sorted[Math.min(len - 1, Math.max(0, Math.ceil((len - 1) * pct)))];
  const round = value => Math.round(value * 100) / 100;
  const sum = sorted.reduce((total, value) => total + value, 0);
  Object.assign(out, {
    p50: round(percentile(0.50)),
    p95: round(percentile(0.95)),
    p99: round(percentile(0.99)),
    mean: round(sum / len),
    max: round(sorted[len - 1]),
    min: round(sorted[0])
  });
  return out;
}

export function nullTelemetry(source = null) {
  return telemetryStats([], { supported: false, source });
}

export function deriveStage8PerformanceGate({
  scenarioId,
  unitsPerFaction,
  expectedSeats,
  expectedTotal,
  acceptanceTotal,
  frameTimeMs,
  scope = 'desktop-short-run'
} = {}) {
  const seats = Array.isArray(expectedSeats) ? expectedSeats : [];
  const seatTotal = seats.reduce((total, seat) => total + (Number.isInteger(seat?.count) ? seat.count : 0), 0);
  const scenarioAcceptanceTotal = PERF_STAGE8_SCENARIO_TOTALS[scenarioId] ?? null;
  const acceptancePopulationEligible = unitsPerFaction === PERF_ACCEPTANCE_UNITS_PER_FACTION &&
    Number.isInteger(scenarioAcceptanceTotal) && acceptanceTotal === scenarioAcceptanceTotal &&
    expectedTotal === scenarioAcceptanceTotal && seatTotal === scenarioAcceptanceTotal &&
    seats.length === scenarioAcceptanceTotal / PERF_ACCEPTANCE_UNITS_PER_FACTION &&
    seats.length > 0 && seats.every(seat => seat?.count === PERF_ACCEPTANCE_UNITS_PER_FACTION);
  const frameP95Ms = Number.isFinite(frameTimeMs?.p95) ? frameTimeMs.p95 : null;
  const frameP99Ms = Number.isFinite(frameTimeMs?.p99) ? frameTimeMs.p99 : null;
  const thresholdPassed = frameP99Ms != null && frameP99Ms <= PERF_FRAME_P99_BUDGET_MS;
  const outcome = !acceptancePopulationEligible ? 'DIAGNOSTIC/INCOMPLETE' : thresholdPassed ? 'PASS' : 'FAIL';
  const evidenceStatus = outcome === 'PASS' ? 'accepted' : outcome === 'FAIL' ? 'failed' : 'diagnostic';
  const evidenceClass = outcome === 'PASS' ? 'stage8-scenario-pass'
    : outcome === 'FAIL' ? 'stage8-over-budget' : 'diagnostic-incomplete';
  return {
    schema: PERF_GATE_SCHEMA,
    scope,
    claim: 'short-run-frame-budget-only',
    metric: 'metrics.frameTimeMs.p99',
    thresholdMs: PERF_FRAME_P99_BUDGET_MS,
    frameP95Ms,
    frameP99Ms,
    acceptanceUnitsPerFaction: PERF_ACCEPTANCE_UNITS_PER_FACTION,
    expectedAcceptanceTotal: scenarioAcceptanceTotal,
    observedRequestedTotal: Number.isInteger(expectedTotal) ? expectedTotal : null,
    acceptancePopulationEligible,
    thresholdPassed,
    outcome,
    evidenceStatus,
    evidenceClass,
    physicalSustainedDevicePass: false
  };
}

export function validateStage8DesktopMatrix(records = []) {
  const requiredScenarioIds = [...PERF_STAGE8_DESKTOP_REQUIRED_SCENARIOS];
  const acceptedScenarioIds = records.map(record => record?.scenarioId).filter(Boolean);
  const counts = new Map();
  for (const scenarioId of acceptedScenarioIds) counts.set(scenarioId, (counts.get(scenarioId) || 0) + 1);
  const missingScenarioIds = requiredScenarioIds.filter(scenarioId => !counts.has(scenarioId));
  const duplicateScenarioIds = [...counts].filter(([, count]) => count > 1).map(([scenarioId]) => scenarioId).sort();
  const unexpectedScenarioIds = [...counts.keys()].filter(scenarioId => !requiredScenarioIds.includes(scenarioId)).sort();
  const errors = [];
  if (missingScenarioIds.length) errors.push(`missing required scenarios: ${missingScenarioIds.join(', ')}`);
  if (duplicateScenarioIds.length) errors.push(`duplicate scenario rows: ${duplicateScenarioIds.join(', ')}`);
  if (unexpectedScenarioIds.length) errors.push(`unexpected substitute scenarios: ${unexpectedScenarioIds.join(', ')}`);
  return {
    schema: 'massfront-stage8-desktop-matrix-v1',
    requiredScenarioIds,
    acceptedScenarioIds,
    missingScenarioIds,
    duplicateScenarioIds,
    unexpectedScenarioIds,
    valid: errors.length === 0 && acceptedScenarioIds.length === requiredScenarioIds.length,
    errors
  };
}

function addError(errors, condition, message) {
  if (!condition) errors.push(message);
}

function exactCountMap(actual, expected, label, errors) {
  addError(errors, actual && typeof actual === 'object' && !Array.isArray(actual), `${label} is missing`);
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  addError(errors, JSON.stringify(actualKeys) === JSON.stringify(expectedKeys), `${label} keys do not match the scenario`);
  for (const key of expectedKeys) {
    addError(errors, Number.isInteger(actual[key]) && actual[key] === expected[key], `${label}.${key} expected ${expected[key]}, got ${actual[key]}`);
  }
}

function expectedPopulationMaps(population, errors) {
  const seats = population?.expected?.seats;
  addError(errors, Array.isArray(seats) && seats.length > 0, 'population.expected.seats is missing');
  if (!Array.isArray(seats) || seats.length === 0) return null;
  const bySeat = {};
  const byFaction = {};
  const byTeam = {};
  let total = 0;
  for (const seat of seats) {
    addError(errors, typeof seat?.key === 'string' && seat.key.length > 0, 'expected seat key is missing');
    addError(errors, typeof seat?.faction === 'string' && seat.faction.length > 0, `expected faction is missing for ${seat?.key || 'seat'}`);
    addError(errors, Number.isInteger(seat?.team), `expected team is missing for ${seat?.key || 'seat'}`);
    addError(errors, Number.isInteger(seat?.count) && seat.count > 0, `expected count is invalid for ${seat?.key || 'seat'}`);
    if (!seat?.key || !Number.isInteger(seat?.count)) continue;
    bySeat[seat.key] = seat.count;
    byFaction[seat.faction] = (byFaction[seat.faction] || 0) + seat.count;
    byTeam[String(seat.team)] = (byTeam[String(seat.team)] || 0) + seat.count;
    total += seat.count;
  }
  return { seats, bySeat, byFaction, byTeam, total };
}

function validatePopulationSnapshot(snapshot, expected, label, errors) {
  addError(errors, snapshot && typeof snapshot === 'object', `population.${label} is missing`);
  if (!snapshot || typeof snapshot !== 'object') return;
  addError(errors, Number.isInteger(snapshot.total) && snapshot.total === expected.total,
    `population.${label}.total expected ${expected.total}, got ${snapshot.total}`);
  exactCountMap(snapshot.bySeat, expected.bySeat, `population.${label}.bySeat`, errors);
  exactCountMap(snapshot.byFaction, expected.byFaction, `population.${label}.byFaction`, errors);
  exactCountMap(snapshot.byTeam, expected.byTeam, `population.${label}.byTeam`, errors);
}

function validateTelemetryMetric(metric, path, errors, { required = false, positive = false } = {}) {
  addError(errors, metric && typeof metric === 'object', `${path} is missing`);
  if (!metric || typeof metric !== 'object') return;
  addError(errors, typeof metric.supported === 'boolean', `${path}.supported must be boolean`);
  addError(errors, Number.isInteger(metric.sampleCount) && metric.sampleCount >= 0, `${path}.sampleCount must be a non-negative integer`);
  if (required) addError(errors, metric.supported && metric.sampleCount > 0, `${path} requires supported samples`);
  if (!metric.supported || metric.sampleCount === 0) {
    for (const key of STAT_KEYS) addError(errors, metric[key] === null, `${path}.${key} must be null when unsupported or empty`);
  } else {
    for (const key of STAT_KEYS) addError(errors, Number.isFinite(metric[key]), `${path}.${key} must be finite when sampled`);
    if (positive) addError(errors, metric.max > 0 && metric.mean > 0, `${path} contains an unsupported zero timing placeholder`);
  }
}

/** A fifth seat is authored for future work but does not exist in the runtime.
    Unsupported evidence is excluded as UNSUPPORTED, never accepted or failed. */
export function classifyPerfTopology(record) {
  const seats = record?.population?.expected?.seats;
  const explicit = record?.topology;
  const invalidSlot = Array.isArray(seats)
    ? seats.find(seat => Number.isInteger(seat?.slot) && (seat.slot < -1 || seat.slot > PERF_CURRENT_MAX_AI_SLOT))
    : null;
  if (record?.evidenceStatus === 'unsupported' || explicit?.status === 'unsupported' ||
      record?.scenarioId === '1v4_continental_conquest' || (Array.isArray(seats) && seats.length > PERF_CURRENT_MAX_SEATS) || invalidSlot) {
    return {
      status: 'unsupported',
      reason: explicit?.reason || (invalidSlot
        ? `commander slot ${invalidSlot.slot} exceeds the current -1..${PERF_CURRENT_MAX_AI_SLOT} topology`
        : `scenario requires more than ${PERF_CURRENT_MAX_SEATS} seats`)
    };
  }
  return { status: 'supported', reason: null };
}

/**
 * Validate a single result without trusting the report generator or filename.
 * Artifact existence/hash checks are performed by the report generator because
 * this pure validator is also used by fixtures.
 */
export function validatePerfEvidence(record) {
  const errors = [];
  const warnings = [];
  const topology = classifyPerfTopology(record);
  if (topology.status === 'unsupported') {
    return { valid: false, status: 'unsupported', errors, warnings, unsupportedReason: topology.reason };
  }
  addError(errors, record?.schema === PERF_EVIDENCE_SCHEMA, `schema must be ${PERF_EVIDENCE_SCHEMA}`);
  addError(errors, record?.executionPath === PERF_EXECUTION_PATH, `executionPath must be ${PERF_EXECUTION_PATH}`);

  const gate = record?.runtimeGate;
  addError(errors, gate?.deployedViaUi === true, 'real UI deployment was not proven');
  addError(errors, gate?.playOfflineUsed === true, 'PLAY OFFLINE was not used');
  addError(errors, gate?.warRoomUsed === true, 'War Room entry was not proven');
  addError(errors, gate?.setupStagesCompleted === true, 'setup stages were not completed');
  addError(errors, gate?.authUiVisible === false, 'authentication UI remained visible');
  addError(errors, gate?.menuUiVisible === false, 'front/menu UI remained visible');
  addError(errors, gate?.battleHudVisible === true, 'battle HUD was not visible');
  addError(errors, gate?.matchLive === true, 'matchLive was not true');
  addError(errors, gate?.running === true, 'running was not true');
  addError(errors, gate?.gpuValidation?.passed === true, 'hardware GPU validation did not pass');
  addError(errors, gate?.gpuValidation?.hardware === true, 'GPU validation did not prove hardware rendering');
  addError(errors, typeof gate?.gpuValidation?.renderer === 'string' && gate.gpuValidation.renderer.length > 0,
    'GPU validation renderer is missing');
  addError(errors, typeof gate?.gpuValidation?.vendor === 'string' && gate.gpuValidation.vendor.length > 0,
    'GPU validation vendor is missing');
  addError(errors, Array.isArray(gate?.pageErrors) && gate.pageErrors.length === 0, 'page errors were recorded');
  addError(errors, Array.isArray(gate?.consoleErrors) && gate.consoleErrors.length === 0, 'console errors were recorded');
  addError(errors, Number.isInteger(gate?.contextLossCount) && gate.contextLossCount === 0, 'WebGL context loss was recorded');

  const expected = expectedPopulationMaps(record?.population, errors);
  if (expected) {
    addError(errors, Number.isInteger(record.population.requestedPerFaction) && record.population.requestedPerFaction > 0,
      'requestedPerFaction must be a positive integer');
    addError(errors, record?.unitsPerFaction === record.population.requestedPerFaction,
      'unitsPerFaction does not match population.requestedPerFaction');
    addError(errors, expected.seats.every(seat => seat.count === record.population.requestedPerFaction),
      'expected seat populations do not exactly match requestedPerFaction');
    validatePopulationSnapshot(record.population.attempted, expected, 'attempted', errors);
    validatePopulationSnapshot(record.population.accepted, expected, 'accepted', errors);
    validatePopulationSnapshot(record.population.postSettle, expected, 'postSettle', errors);
    addError(errors, record?.topology?.status === 'supported', 'topology status must be supported');
    addError(errors, record?.topology?.seatCount === record.population.expected.seats.length,
      'topology seat count is missing or inconsistent');
    addError(errors, record?.topology?.acceptanceUnitsPerFaction === PERF_ACCEPTANCE_UNITS_PER_FACTION,
      `topology acceptance population must be ${PERF_ACCEPTANCE_UNITS_PER_FACTION} per faction`);
    addError(errors, record?.topology?.acceptanceTotal === expected.seats.length * PERF_ACCEPTANCE_UNITS_PER_FACTION,
      'topology acceptance total is inconsistent');
  }

  const provenance = record?.provenance;
  addError(errors, GIT_HEAD_RE.test(provenance?.gitHead || ''), 'full 40-character gitHead is missing');
  addError(errors, typeof provenance?.gitDirty === 'boolean', 'gitDirty is missing');
  for (const key of ['worktreeFingerprint', 'runtimeFingerprint', 'testedEntrySha256', 'testedPackageSha256']) {
    addError(errors, SHA256_RE.test(provenance?.[key] || ''), `${key} is missing or is not SHA-256`);
  }
  addError(errors, typeof provenance?.testedEntry === 'string' && provenance.testedEntry.length > 0, 'testedEntry is missing');
  addError(errors, typeof provenance?.preset === 'string' && provenance.preset.length > 0, 'graphics preset is missing');
  addError(errors, Number.isInteger(provenance?.viewport?.width) && provenance.viewport.width > 0, 'viewport width is missing');
  addError(errors, Number.isInteger(provenance?.viewport?.height) && provenance.viewport.height > 0, 'viewport height is missing');
  addError(errors, Number.isFinite(provenance?.viewport?.dpr) && provenance.viewport.dpr > 0, 'viewport DPR is missing');
  addError(errors, typeof provenance?.url === 'string' && /^https?:\/\//.test(provenance.url), 'tested URL is missing');
  addError(errors, typeof provenance?.renderer === 'string' && provenance.renderer.length > 0, 'renderer is missing');
  addError(errors, typeof provenance?.vendor === 'string' && provenance.vendor.length > 0, 'GPU vendor is missing');
  addError(errors, typeof provenance?.backend === 'string' && provenance.backend.length > 0, 'backend is missing');
  addError(errors, provenance?.backend !== 'unknown-hardware-backend', 'hardware backend is unknown');
  addError(errors, !/swiftshader|software/i.test(`${provenance?.renderer || ''} ${provenance?.backend || ''}`),
    'software GPU provenance is not accepted');
  addError(errors, provenance?.sourceDriftChecked === true, 'source drift was not checked');
  addError(errors, provenance?.sourceStable === true, 'source drift was detected');
  addError(errors, provenance?.endWorktreeFingerprint === provenance?.worktreeFingerprint,
    'end worktree fingerprint does not match tested source');
  addError(errors, provenance?.endRuntimeFingerprint === provenance?.runtimeFingerprint,
    'end runtime fingerprint does not match tested package');
  addError(errors, provenance?.testedPackageSha256 === provenance?.runtimeFingerprint,
    'tested package hash does not match runtime fingerprint');
  addError(errors, Number.isInteger(provenance?.seed), 'deterministic seed is missing');
  addError(errors, Number.isFinite(provenance?.camera?.start?.x) && Number.isFinite(provenance?.camera?.end?.x), 'camera start/end are missing');
  addError(errors, Number.isFinite(provenance?.simulation?.startTimeSec) && Number.isFinite(provenance?.simulation?.endTimeSec), 'simulation start/end are missing');
  addError(errors, Number.isInteger(provenance?.simulation?.startTick) && Number.isInteger(provenance?.simulation?.endTick), 'simulation tick start/end are missing');
  addError(errors, Number.isFinite(provenance?.simulation?.startStepSec) && Number.isFinite(provenance?.simulation?.endStepSec), 'simulation fixed-step values are missing');
  addError(errors, Number.isInteger(provenance?.simulation?.durationFrames) && provenance.simulation.durationFrames > 0, 'simulation frame duration is missing');
  addError(errors, Number.isFinite(provenance?.simulation?.wallDurationMs) && provenance.simulation.wallDurationMs > 0, 'simulation wall duration is missing');
  const simulation = provenance?.simulation;
  const simulatedDuration = Number(simulation?.endTimeSec) - Number(simulation?.startTimeSec);
  const calculatedRatio = simulatedDuration / (Number(simulation?.wallDurationMs) / 1000);
  addError(errors, Number.isFinite(simulation?.simulatedDurationSec) && simulation.simulatedDurationSec > 0,
    'simulation advance duration is missing');
  addError(errors, Number.isFinite(simulation?.wallTimeRatio) && simulation.wallTimeRatio > 0,
    'simulation wall-time ratio is missing');
  addError(errors, Number.isFinite(calculatedRatio) && Math.abs(simulation?.wallTimeRatio - calculatedRatio) <= 0.02,
    'simulation wall-time ratio is inconsistent');
  addError(errors, Number.isFinite(simulation?.startBacklogSec) && simulation.startBacklogSec >= 0,
    'simulation start backlog is missing');
  addError(errors, Number.isFinite(simulation?.endBacklogSec) && simulation.endBacklogSec >= 0,
    'simulation end backlog is missing');
  addError(errors, Number.isFinite(simulation?.maxBacklogSteps) && simulation.maxBacklogSteps >= 0,
    'simulation max backlog is missing');
  addError(errors, Number.isInteger(simulation?.backlogSampleCount) && simulation.backlogSampleCount > 0,
    'simulation backlog samples are missing');

  const captures = record?.captures;
  addError(errors, Array.isArray(captures) && captures.length === PERF_CAPTURE_STAGES.length, 'exactly start/mid/end captures are required');
  if (Array.isArray(captures)) {
    for (const stage of PERF_CAPTURE_STAGES) {
      const capture = captures.find(item => item?.stage === stage);
      addError(errors, !!capture, `${stage} capture is missing`);
      if (!capture) continue;
      addError(errors, typeof capture.file === 'string' && capture.file.length > 0, `${stage} capture path is missing`);
      addError(errors, SHA256_RE.test(capture.sha256 || ''), `${stage} capture SHA-256 is missing`);
      addError(errors, Number.isInteger(capture.width) && capture.width > 0, `${stage} capture width is missing`);
      addError(errors, Number.isInteger(capture.height) && capture.height > 0, `${stage} capture height is missing`);
      addError(errors, capture.hudVisible === true, `${stage} capture lacks battle HUD proof`);
      addError(errors, Number.isInteger(capture.authoritativeTotal) && capture.authoritativeTotal >= 0,
        `${stage} capture authoritative count is missing`);
      if (stage === 'start') {
        addError(errors, expected && capture.authoritativeTotal === expected.total,
          'start capture authoritative count does not match the post-settle requested total');
      } else if (expected) {
        addError(errors, capture.authoritativeTotal <= expected.total,
          `${stage} capture count exceeds the accepted population`);
      }
    }
  }

  const metrics = record?.metrics || {};
  validateTelemetryMetric(metrics.frameTimeMs, 'metrics.frameTimeMs', errors, { required: true, positive: true });
  validateTelemetryMetric(metrics.simPhaseMs, 'metrics.simPhaseMs', errors, { required: true, positive: true });
  validateTelemetryMetric(metrics.renderCpuMs, 'metrics.renderCpuMs', errors, { required: true, positive: true });
  validateTelemetryMetric(metrics.gpuTimeMs, 'metrics.gpuTimeMs', errors, { positive: true });
  validateTelemetryMetric(metrics.drawCalls, 'metrics.drawCalls', errors, { required: true, positive: true });
  validateTelemetryMetric(metrics.triangles, 'metrics.triangles', errors, { required: true, positive: true });
  validateTelemetryMetric(metrics.jsHeapMB, 'metrics.jsHeapMB', errors);
  validateTelemetryMetric(metrics.simBacklogSteps, 'metrics.simBacklogSteps', errors, { required: true });
  validateTelemetryMetric(metrics?.visibility?.total, 'metrics.visibility.total', errors, { required: true, positive: true });
  validateTelemetryMetric(metrics?.visibility?.visible, 'metrics.visibility.visible', errors);
  validateTelemetryMetric(metrics?.visibility?.culled, 'metrics.visibility.culled', errors);
  const reconciliation = metrics?.visibility?.reconciliation;
  addError(errors, Array.isArray(reconciliation) && reconciliation.length > 0,
    'visible-unit reconciliation samples are missing');
  if (Array.isArray(reconciliation)) for (const [index, sample] of reconciliation.entries()) {
    const label = `metrics.visibility.reconciliation[${index}]`;
    addError(errors, Number.isInteger(sample?.counterTotal) && sample.counterTotal >= 0, `${label}.counterTotal is invalid`);
    addError(errors, Number.isInteger(sample?.scannedTotal) && sample.scannedTotal >= 0, `${label}.scannedTotal is invalid`);
    addError(errors, sample?.counterTotal === sample?.scannedTotal, `${label} authoritative counter and scan disagree`);
    addError(errors, Number.isInteger(sample?.visible) && sample.visible >= 0 && sample.visible <= sample.scannedTotal,
      `${label}.visible is implausible`);
    addError(errors, Number.isInteger(sample?.culled) && sample.culled >= 0 && sample.visible + sample.culled === sample.scannedTotal,
      `${label}.culled does not reconcile`);
    addError(errors, sample?.hasCameraBounds === true, `${label} lacks camera bounds`);
  }
  validateTelemetryMetric(metrics?.vfx?.particles, 'metrics.vfx.particles', errors);
  validateTelemetryMetric(metrics?.vfx?.projectiles, 'metrics.vfx.projectiles', errors);
  addError(errors, Number.isFinite(metrics?.fpsEstimated) && metrics.fpsEstimated > 0, 'fpsEstimated requires sampled frame telemetry');
  addError(errors, Number.isInteger(metrics?.contextLossCount) && metrics.contextLossCount === 0, 'metrics report a context loss');

  const expectedGate = deriveStage8PerformanceGate({
    scenarioId: record?.scenarioId,
    unitsPerFaction: record?.unitsPerFaction,
    expectedSeats: expected?.seats,
    expectedTotal: expected?.total,
    acceptanceTotal: record?.topology?.acceptanceTotal,
    frameTimeMs: metrics.frameTimeMs,
    scope: record?.performanceGate?.scope
  });
  const performanceGate = record?.performanceGate;
  addError(errors, performanceGate && typeof performanceGate === 'object', 'performanceGate is missing');
  addError(errors, performanceGate?.schema === PERF_GATE_SCHEMA, `performanceGate.schema must be ${PERF_GATE_SCHEMA}`);
  addError(errors, ['desktop-short-run', 'physical-device-short-run'].includes(performanceGate?.scope),
    'performanceGate.scope must identify a short desktop or physical-device run');
  addError(errors, performanceGate?.claim === expectedGate.claim, 'performanceGate must be labeled short-run only');
  addError(errors, performanceGate?.metric === expectedGate.metric, 'performanceGate metric must be frame-time p99');
  addError(errors, performanceGate?.thresholdMs === PERF_FRAME_P99_BUDGET_MS,
    `performanceGate threshold must be ${PERF_FRAME_P99_BUDGET_MS} ms`);
  for (const key of [
    'frameP95Ms', 'frameP99Ms', 'acceptanceUnitsPerFaction', 'expectedAcceptanceTotal',
    'observedRequestedTotal', 'acceptancePopulationEligible', 'thresholdPassed', 'outcome',
    'evidenceStatus', 'evidenceClass', 'physicalSustainedDevicePass'
  ]) {
    addError(errors, performanceGate?.[key] === expectedGate[key], `performanceGate.${key} does not match measured evidence`);
  }
  addError(errors, record?.evidenceStatus === expectedGate.evidenceStatus,
    `evidenceStatus must be ${expectedGate.evidenceStatus} for ${expectedGate.outcome}`);
  addError(errors, record?.evidenceClass === expectedGate.evidenceClass,
    `evidenceClass must be ${expectedGate.evidenceClass} for ${expectedGate.outcome}`);

  if (record?.provenance?.gitDirty) warnings.push('The tested worktree was dirty; use worktreeFingerprint for exact identity.');
  const status = errors.length ? 'unknown' : expectedGate.outcome === 'PASS' ? 'accepted'
    : expectedGate.outcome === 'FAIL' ? 'failed' : 'diagnostic';
  return { valid: errors.length === 0, status, errors, warnings, performanceGate: expectedGate };
}

/** Reject batches that silently combine different source/runtime/device runs. */
export function validateEvidenceBatch(records) {
  const decisions = records.map((record, index) => ({ index, record, ...validatePerfEvidence(record) }));
  const contractValid = decisions.filter(item => item.valid);
  const accepted = contractValid.filter(item => item.status === 'accepted');
  const diagnostic = contractValid.filter(item => item.status === 'diagnostic');
  const failed = contractValid.filter(item => item.status === 'failed');
  const unsupported = decisions.filter(item => item.status === 'unsupported');
  const rejected = decisions.filter(item => !item.valid && item.status !== 'unsupported');
  const matrixGate = validateStage8DesktopMatrix(accepted.map(item => item.record));
  const mixedErrors = [];
  if (contractValid.length > 1) {
    const keys = [
      ['worktreeFingerprint', r => r.provenance.worktreeFingerprint],
      ['runtimeFingerprint', r => r.provenance.runtimeFingerprint],
      ['testedPackageSha256', r => r.provenance.testedPackageSha256],
      ['preset', r => r.provenance.preset],
      ['viewport/DPR', r => `${r.provenance.viewport.width}x${r.provenance.viewport.height}@${r.provenance.viewport.dpr}`],
      ['evidence scope', r => r.performanceGate.scope],
      ['renderer/backend', r => `${r.provenance.renderer}|${r.provenance.backend}`]
    ];
    for (const [label, getter] of keys) {
      const values = new Set(contractValid.map(item => getter(item.record)));
      if (values.size > 1) mixedErrors.push(`mixed ${label}: ${[...values].join(' vs ')}`);
    }
  }
  return {
    valid: matrixGate.valid && diagnostic.length === 0 && failed.length === 0 &&
      rejected.length === 0 && mixedErrors.length === 0,
    contractValidBatch: contractValid.length > 0 && rejected.length === 0 && mixedErrors.length === 0,
    stage8Pass: matrixGate.valid && diagnostic.length === 0 && failed.length === 0 &&
      rejected.length === 0 && mixedErrors.length === 0,
    matrixGate,
    contractValid: mixedErrors.length ? [] : contractValid,
    accepted: mixedErrors.length ? [] : accepted,
    diagnostic: mixedErrors.length ? [] : diagnostic,
    failed: mixedErrors.length ? [] : failed,
    rejected,
    unsupported,
    mixedErrors
  };
}
