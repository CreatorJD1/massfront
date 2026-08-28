import { PERF_EVIDENCE_SCHEMA, PERF_EXECUTION_PATH, telemetryStats } from '../evidence-contract.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HEAD = 'c'.repeat(40);

export function validEvidenceFixture({ captureSha256 = HASH_A, runtimeFingerprint = HASH_A } = {}) {
  const seatA = { key: 'nova|team:0|slot:-1|seat:0', faction: 'nova', team: 0, slot: -1, count: 500 };
  const seatB = { key: 'legion|team:1|slot:0|seat:1', faction: 'legion', team: 1, slot: 0, count: 500 };
  const snapshot = {
    total: 1000,
    bySeat: { [seatA.key]: 500, [seatB.key]: 500 },
    byFaction: { nova: 500, legion: 500 },
    byTeam: { 0: 500, 1: 500 }
  };
  return {
    schema: PERF_EVIDENCE_SCHEMA,
    evidenceStatus: 'accepted',
    executionPath: PERF_EXECUTION_PATH,
    scenarioId: 'fixture_1v1',
    scenarioName: 'Fixture 1v1',
    theatre: 'fixture',
    unitsPerFaction: 500,
    factionsCount: 2,
    evidenceClass: 'acceptance',
    topology: {
      status: 'supported', reason: null, seats: 2, seatCount: 2,
      acceptanceUnitsPerFaction: 500, acceptanceTotal: 1000
    },
    timestamp: '2026-08-24T00:00:00.000Z',
    runtimeGate: {
      deployedViaUi: true,
      playOfflineUsed: true,
      warRoomUsed: true,
      setupStagesCompleted: true,
      authUiVisible: false,
      menuUiVisible: false,
      battleHudVisible: true,
      matchLive: true,
      running: true,
      gpuValidation: { passed: true, hardware: true, renderer: 'ANGLE D3D11 fixture', vendor: 'Fixture GPU Vendor' },
      pageErrors: [],
      consoleErrors: [],
      contextLossCount: 0
    },
    population: {
      requestedPerFaction: 500,
      expected: { seats: [seatA, seatB], total: 1000 },
      attempted: structuredClone(snapshot),
      accepted: structuredClone(snapshot),
      postSettle: { ...structuredClone(snapshot), supported: true, unmatched: 0 }
    },
    provenance: {
      gitHead: HEAD,
      gitDirty: true,
      worktreeFingerprint: HASH_B,
      runtimeFingerprint,
      testedEntry: 'index.html',
      testedEntrySha256: HASH_A,
      testedPackageSha256: runtimeFingerprint,
      sourceDriftChecked: true,
      sourceStable: true,
      endWorktreeFingerprint: HASH_B,
      endRuntimeFingerprint: runtimeFingerprint,
      preset: 'high',
      viewport: { width: 412, height: 900, dpr: 2 },
      url: 'http://127.0.0.1:9999/?mfperf=1',
      renderer: 'ANGLE (NVIDIA, D3D11)',
      vendor: 'Google Inc.',
      backend: 'ANGLE/D3D11',
      seed: 44019,
      camera: { start: { x: 1600, y: 1600 }, end: { x: 1600, y: 1600 } },
      simulation: {
        startTimeSec: 1, endTimeSec: 2, startTick: 30, endTick: 60,
        startStepSec: 1 / 30, endStepSec: 1 / 30, durationFrames: 60, wallDurationMs: 1000,
        simulatedDurationSec: 1, wallTimeRatio: 1,
        startBacklogSec: 0.01, endBacklogSec: 0.02, maxBacklogSteps: 0.6, backlogSampleCount: 60,
        gameSpeed: 1
      }
    },
    captures: ['start', 'mid', 'end'].map(stage => ({
      stage,
      file: `${stage}.png`,
      sha256: captureSha256,
      hudVisible: true,
      authoritativeTotal: 1000,
      byFaction: { nova: 500, legion: 500 },
      byTeam: { 0: 500, 1: 500 }
    })),
    metrics: {
      fpsEstimated: 60,
      frameTimeMs: telemetryStats([16, 17, 16], { source: 'fixture' }),
      simPhaseMs: telemetryStats([2, 2.2], { source: 'fixture' }),
      renderCpuMs: telemetryStats([4, 4.2], { source: 'fixture' }),
      gpuTimeMs: telemetryStats([], { supported: false, source: 'fixture unsupported' }),
      drawCalls: telemetryStats([40, 41], { source: 'fixture' }),
      triangles: telemetryStats([1000, 1050], { source: 'fixture' }),
      visibility: {
        total: telemetryStats([1000, 1000], { source: 'fixture counter' }),
        visible: telemetryStats([900, 850], { source: 'fixture bounded scan' }),
        culled: telemetryStats([100, 150], { source: 'fixture bounded scan' }),
        reconciliation: [
          { frame: 0, counterTotal: 1000, scannedTotal: 1000, visible: 900, culled: 100, hasCameraBounds: true },
          { frame: 30, counterTotal: 1000, scannedTotal: 1000, visible: 850, culled: 150, hasCameraBounds: true }
        ]
      },
      simBacklogSteps: telemetryStats([0.3, 0.6], { source: 'fixture accumulator' }),
      vfx: {
        particles: telemetryStats([], { supported: false, source: 'fixture unsupported' }),
        projectiles: telemetryStats([0, 0], { source: 'fixture supported zero' })
      },
      webglResources: { supported: true, sampleCount: 1, values: { textures: 1 } },
      jsHeapMB: telemetryStats([], { supported: false, source: 'fixture unsupported' }),
      longTaskCount: 0,
      contextLossCount: 0
    }
  };
}

export function cloneFixture(record) {
  return structuredClone(record);
}

export const FIXTURE_HASHES = Object.freeze({ capture: HASH_A, alternate: HASH_B });
