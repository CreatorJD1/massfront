import assert from 'node:assert/strict';
import {
  applyGroundResult,
  beginGroundOperation,
  createGroundResult,
  createMemoryStorage,
  createShowcaseReadyDomainState,
  getMissionEligibility,
  LocalDomainStore,
  validateGroundOperation
} from '../src/domain/index.js';
import { deriveGroundControl } from '../src/domain/ground_control.js';

const MISSION_ID = 'uga_hive_heart';
const MAP_IDS = [
  'karak_primary_hive_compact',
  'karak_primary_hive_standard',
  'karak_primary_hive_large'
];
const lockCodes = eligibility => eligibility.locks.map(lock => lock.code);

function settleVictory(state, mapId) {
  const launched = beginGroundOperation(state, { missionId: MISSION_ID, mapId });
  assert.equal(launched.operation.battlefield.infestationActive, true, 'an authored Brood map must still carry an active local hive target');
  assert.equal(validateGroundOperation(launched.operation).ok, true);
  const result = createGroundResult(launched.operation, {
    outcome: 'victory',
    score: 90,
    primaryObjectiveComplete: true,
    secondaryObjectivesComplete: 0,
    injuryBand: 'none',
    injuredPersonnelIds: []
  });
  const applied = applyGroundResult(launched.state, result);
  assert.equal(applied.applied, true);
  const replay = applyGroundResult(applied.state, result);
  assert.equal(replay.applied, false, 'a repeated return must not award or clear ground twice');
  assert.strictEqual(replay.state, applied.state);
  return applied.state;
}

let state = createShowcaseReadyDomainState();
state.missions.uga_pale_bloom.completions = 1;
state.missions.uga_silent_spine.completions = 1;
state.missions.uga_pale_bloom.attempts = 1;
state.missions.uga_silent_spine.attempts = 1;
assert.equal(getMissionEligibility(state, MISSION_ID, { mapId: MAP_IDS[0] }).ok, true);

state = settleVictory(state, MAP_IDS[0]);
// Recreate the persisted state produced by older builds. New settlements may
// leave the system infestation active until all authored maps are controlled.
state.world.systems.karak.infestation.active = false;
state.world.systems.karak.infestation.severity = 0;
const storage = createMemoryStorage();
const writer = new LocalDomainStore({ storage, key: 'karak-legacy-cleanup' });
writer.save(state);
state = new LocalDomainStore({ storage, key: 'karak-legacy-cleanup' }).load({ recover: false });
assert.equal(state.world.systems.karak.infestation.active, false, 'legacy save has an inactive system infestation');
assert.deepEqual(deriveGroundControl(state).areas.karak_primary_hive.clearedMapIds, [MAP_IDS[0]]);
assert.equal(deriveGroundControl(state).areas.karak_primary_hive.controlled, false);
assert.equal(getMissionEligibility(state, MISSION_ID).ok, true, 'planner must still offer unfinished authored maps');
assert.equal(getMissionEligibility(state, MISSION_ID, { mapId: MAP_IDS[1] }).ok, true, 'an unfinished map must remain deployable after the first Hive Heart victory');
assert.equal(getMissionEligibility(state, 'uga_pale_bloom', { mapId: 'karak_meridian_quarantine_standard' }).ok, true, 'the earlier Brood area must also remain finishable');
assert.equal(getMissionEligibility(state, 'uga_silent_spine', { mapId: 'karak_transit_spine_standard' }).ok, true, 'all unfinished Karak areas must remain finishable');
assert.ok(lockCodes(getMissionEligibility(state, MISSION_ID, { mapId: MAP_IDS[0] })).includes('BATTLEFIELD_MAP_ALREADY_CLEARED'), 'a cleared map must not be replayable as post-clear cleanup');

state = settleVictory(state, MAP_IDS[1]);
state = settleVictory(state, MAP_IDS[2]);
const control = deriveGroundControl(state).areas.karak_primary_hive;
assert.deepEqual(control.clearedMapIds, MAP_IDS);
assert.equal(control.controlled, true);
assert.equal(control.controllingFactionId, 'uga');
assert.equal(getMissionEligibility(state, MISSION_ID).ok, false, 'completed Hive Heart must not remain an infinite inactive-infestation farm');
assert.ok(lockCodes(getMissionEligibility(state, MISSION_ID, { mapId: MAP_IDS[0] })).includes('ACTIVE_INFESTATION_REQUIRED'));

const neverCleared = createShowcaseReadyDomainState();
neverCleared.missions.uga_silent_spine.completions = 1;
neverCleared.world.systems.karak.infestation.active = false;
assert.ok(lockCodes(getMissionEligibility(neverCleared, MISSION_ID, { mapId: MAP_IDS[1] })).includes('ACTIVE_INFESTATION_REQUIRED'), 'an inactive infestation without a settled Hive Heart victory is not a cleanup campaign');

console.log('karak-control-recovery.test.mjs PASS');
