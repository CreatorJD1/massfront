/* Small process-level fixtures for CI: scenario frame-budget pass=0,
   rejected/over-budget=1, diagnostic or unsupported=2. */

import { validatePerfEvidence } from './evidence-contract.mjs';
import { validEvidenceFixture, cloneFixture } from './fixtures/evidence-fixtures.mjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PERF_FIXTURE_CASES = Object.freeze([
  'valid', 'diagnostic-ladder', 'over-budget',
  'auth', 'menu', 'nonbattle', 'console-error', 'visible-reconciliation', 'zero-timing',
  'missing-source', 'missing-package', 'missing-gpu', 'source-drift',
  'missing-wall-ratio', 'missing-backlog', 'unsupported-1v4'
]);

export function evidenceFixtureCase(name) {
  let record = cloneFixture(validEvidenceFixture());
  switch (name) {
    case 'valid': break;
    case 'diagnostic-ladder': record = validEvidenceFixture({ unitsPerFaction: 250 }); break;
    case 'over-budget': record = validEvidenceFixture({ frameSamples: [16, 20, 48] }); break;
    case 'auth': record.runtimeGate.authUiVisible = true; break;
    case 'menu': record.runtimeGate.menuUiVisible = true; break;
    case 'nonbattle': record.runtimeGate.matchLive = false; break;
    case 'console-error': record.runtimeGate.consoleErrors.push('WebGL shader compilation failed'); break;
    case 'visible-reconciliation': record.metrics.visibility.reconciliation[0].visible = 1001; break;
    case 'zero-timing': {
      record.metrics.simPhaseMs = {
        supported: true, sampleCount: 2, source: 'placeholder',
        p50: 0, p95: 0, p99: 0, mean: 0, max: 0, min: 0
      };
      break;
    }
    case 'missing-source': delete record.provenance.worktreeFingerprint; break;
    case 'missing-package': delete record.provenance.testedPackageSha256; break;
    case 'missing-gpu': record.runtimeGate.gpuValidation.hardware = false; break;
    case 'source-drift': {
      record.provenance.sourceStable = false;
      record.provenance.endRuntimeFingerprint = 'd'.repeat(64);
      break;
    }
    case 'missing-wall-ratio': delete record.provenance.simulation.wallTimeRatio; break;
    case 'missing-backlog': {
      delete record.provenance.simulation.maxBacklogSteps;
      delete record.metrics.simBacklogSteps;
      break;
    }
    case 'unsupported-1v4': {
      record.evidenceStatus = 'unsupported';
      record.scenarioId = '1v4_continental_conquest';
      record.scenarioName = '1v4 Continental War';
      record.factionsCount = 5;
      record.topology = {
        status: 'unsupported', seatCount: 5, seats: 5,
        acceptanceUnitsPerFaction: 500, acceptanceTotal: 2500,
        reason: 'Requires a fifth-seat/commander adapter.'
      };
      break;
    }
    default: throw new Error(`Unknown fixture case: ${name}`);
  }
  return record;
}

export function verifyFixtureCase(name) {
  const validation = validatePerfEvidence(evidenceFixtureCase(name));
  const status = validation.status === 'accepted' ? 'SCENARIO_PASS'
    : validation.status === 'diagnostic' ? 'DIAGNOSTIC/INCOMPLETE'
    : validation.status === 'failed' ? 'FAILED'
    : validation.status === 'unsupported' ? 'UNSUPPORTED' : 'UNKNOWN';
  return { name, status, validation };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const name = process.argv[2] || 'valid';
  const result = verifyFixtureCase(name);
  console.log(JSON.stringify({
    fixture: name, status: result.status,
    reasons: result.validation.errors,
    unsupportedReason: result.validation.unsupportedReason || null
  }));
  process.exitCode = result.status === 'SCENARIO_PASS' ? 0
    : ['DIAGNOSTIC/INCOMPLETE', 'UNSUPPORTED'].includes(result.status) ? 2 : 1;
}
