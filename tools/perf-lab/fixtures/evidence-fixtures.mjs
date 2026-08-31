import {
  PERF_EVIDENCE_SCHEMA,
  PERF_EXECUTION_PATH,
  deriveStage8PerformanceGate,
  telemetryStats
} from '../evidence-contract.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HEAD = 'c'.repeat(40);
const FIXTURE_SCENARIOS = Object.freeze({
  '1v1_duel_verdant': {
    name: '1v1 Frontier Duel (fixture)',
    seats: [
      { faction: 'nova', team: 0, slot: -1 },
      { faction: 'legion', team: 1, slot: 0 }
    ]
  },
  '1v1_duel_megacity': {
    name: '1v1 Urban Warfare (fixture)',
    seats: [
      { faction: 'nova', team: 0, slot: -1 },
      { faction: 'syndicate', team: 1, slot: 0 }
    ]
  },
  '1v2_flank_arctic': {
    name: '1v2 Glacial Containment (fixture)',
    seats: [
      { faction: 'nova', team: 0, slot: -1 },
      { faction: 'legion', team: 1, slot: 0 },
      { faction: 'syndicate', team: 1, slot: 1 }
    ]
  },
  '1v3_crossfire_ashland': {
    name: '1v3 Ashland Crossfire (fixture)',
    seats: [
      { faction: 'nova', team: 0, slot: -1 },
      { faction: 'legion', team: 1, slot: 0 },
      { faction: 'syndicate', team: 1, slot: 1 },
      { faction: 'horde', team: 2, slot: 2 }
    ]
  }
});

export function validEvidenceFixture({
  captureSha256 = HASH_A,
  captureWidth = 2,
  captureHeight = 2,
  runtimeFingerprint = HASH_A,
  scenarioId = '1v1_duel_verdant',
  unitsPerFaction = 500,
  frameSamples = [16, 17, 16],
  scope = 'desktop-short-run'
} = {}) {
  const scenario = FIXTURE_SCENARIOS[scenarioId];
  if (!scenario) throw new Error(`Unknown evidence fixture scenario: ${scenarioId}`);
  const seats = scenario.seats.map((seat, index) => ({
    ...seat,
    key: `${seat.faction}|team:${seat.team}|slot:${seat.slot}|seat:${index}`,
    count: unitsPerFaction
  }));
  const total = unitsPerFaction * seats.length;
  const bySeat = {}, byFaction = {}, byTeam = {};
  for (const seat of seats) {
    bySeat[seat.key] = unitsPerFaction;
    byFaction[seat.faction] = (byFaction[seat.faction] || 0) + unitsPerFaction;
    byTeam[String(seat.team)] = (byTeam[String(seat.team)] || 0) + unitsPerFaction;
  }
  const snapshot = {
    total,
    bySeat,
    byFaction,
    byTeam
  };
  const frameTimeMs = telemetryStats(frameSamples, { source: 'fixture' });
  const visibleStart = Math.floor(total * 0.90);
  const visibleEnd = Math.floor(total * 0.85);
  const performanceGate = deriveStage8PerformanceGate({
    scenarioId,
    unitsPerFaction,
    expectedSeats: seats,
    expectedTotal: total,
    acceptanceTotal: seats.length * 500,
    frameTimeMs,
    scope
  });
  return {
    schema: PERF_EVIDENCE_SCHEMA,
    evidenceStatus: performanceGate.evidenceStatus,
    executionPath: PERF_EXECUTION_PATH,
    scenarioId,
    scenarioName: scenario.name,
    theatre: 'fixture',
    unitsPerFaction,
    factionsCount: seats.length,
    evidenceClass: performanceGate.evidenceClass,
    topology: {
      status: 'supported', reason: null, seats: seats.length, seatCount: seats.length,
      acceptanceUnitsPerFaction: 500, acceptanceTotal: seats.length * 500
    },
    timestamp: '2026-08-24T00:00:00.000Z',
    performanceGate,
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
      requestedPerFaction: unitsPerFaction,
      expected: { seats, total },
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
      width: captureWidth,
      height: captureHeight,
      hudVisible: true,
      authoritativeTotal: total,
      byFaction: structuredClone(byFaction),
      byTeam: structuredClone(byTeam)
    })),
    metrics: {
      fpsEstimated: Math.round((1000 / frameTimeMs.mean) * 10) / 10,
      frameTimeMs,
      simPhaseMs: telemetryStats([2, 2.2], { source: 'fixture' }),
      renderCpuMs: telemetryStats([4, 4.2], { source: 'fixture' }),
      gpuTimeMs: telemetryStats([], { supported: false, source: 'fixture unsupported' }),
      drawCalls: telemetryStats([40, 41], { source: 'fixture' }),
      triangles: telemetryStats([1000, 1050], { source: 'fixture' }),
      visibility: {
        total: telemetryStats([total, total], { source: 'fixture counter' }),
        visible: telemetryStats([visibleStart, visibleEnd], { source: 'fixture bounded scan' }),
        culled: telemetryStats([total - visibleStart, total - visibleEnd], { source: 'fixture bounded scan' }),
        reconciliation: [
          { frame: 0, counterTotal: total, scannedTotal: total, visible: visibleStart, culled: total - visibleStart, hasCameraBounds: true },
          { frame: 30, counterTotal: total, scannedTotal: total, visible: visibleEnd, culled: total - visibleEnd, hasCameraBounds: true }
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
