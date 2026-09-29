import assert from 'node:assert/strict';
import {
  advanceExpeditionCycles,
  applyGroundResult,
  beginGroundOperation,
  createGroundResult,
  createShowcaseReadyDomainState,
  validateDomainState
} from '../src/domain/index.js';

const state = createShowcaseReadyDomainState();
const commanderId = state.commissioning.commanderId;
state.factions.nova.status = 'recovering';
state.factions.nova.recoveryCycles = 2;
state.personnel.commanders[commanderId].status = 'recovering';
state.personnel.commanders[commanderId].injury = {
  type: 'operational_trauma', severity: 'moderate', recoveryCycles: 2
};
assert.equal(validateDomainState(state).ok, true);

const first = advanceExpeditionCycles(state, 1, 'test:recovery-survey', 'survey');
assert.equal(first.state.factions.nova.recoveryCycles, 1, 'survey cycle advances faction recovery');
assert.equal(first.state.personnel.commanders[commanderId].injury.recoveryCycles, 1, 'survey cycle advances personnel recovery');
const duplicate = advanceExpeditionCycles(first.state, 1, 'test:recovery-survey', 'survey');
assert.strictEqual(duplicate.state, first.state, 'replaying a cycle event cannot heal twice');
const second = advanceExpeditionCycles(first.state, 1, 'test:recovery-transit', 'transit');
assert.equal(second.state.factions.nova.status, 'ready');
assert.equal(second.state.factions.nova.recoveryCycles, 0);
assert.equal(second.state.personnel.commanders[commanderId].status, 'ready');
assert.equal(second.state.personnel.commanders[commanderId].injury, null);

const battleState = createShowcaseReadyDomainState();
// Compact map: the always-open bottom rung of the linear map ladder.
const launched = beginGroundOperation(battleState, {
  missionId: 'uga_pale_bloom', mapId: 'karak_meridian_quarantine_compact'
});
const operation = launched.operation;
const result = createGroundResult(operation, {
  outcome: 'victory', score: 70, primaryObjectiveComplete: true,
  secondaryObjectivesComplete: 1, injuryBand: 'severe',
  injuredPersonnelIds: [operation.commanderId]
});
assert.ok(result.personnelDelta.commander.injury, 'test operation must inflict an injury');
const applied = applyGroundResult(launched.state, result);
assert.equal(applied.state.personnel.commanders[operation.commanderId].injury.recoveryCycles,
  result.personnelDelta.commander.injury.recoveryCycles,
  'the operation result must not instantly recover the injury it just inflicted');
assert.equal(applied.state.factions.nova.recoveryCycles, result.factionDelta.recoveryCycles);
const recovered = advanceExpeditionCycles(applied.state, 1, 'test:post-result-survey', 'survey');
assert.equal(recovered.state.personnel.commanders[operation.commanderId].injury?.recoveryCycles || 0,
  Math.max(0, result.personnelDelta.commander.injury.recoveryCycles - 1));
assert.equal(validateDomainState(recovered.state).ok, true);

console.log('recovery-cycle-integration.test.mjs PASS');
