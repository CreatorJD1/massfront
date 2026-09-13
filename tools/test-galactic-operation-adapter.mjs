import assert from 'node:assert/strict';
import {
  CATALOG_VERSION,
  MISSION_CATALOG,
  createGroundOperation,
  createGroundOperationRequestV2,
  createMemoryStorage,
  createShowcaseReadyDomainState,
  getUgaGroundAreaForMission
} from '../modules/space_exploration/src/domain/index.js';
import {
  MASSFRONT_GALACTIC_ENTRY_TICKET_KEY,
  MassfrontSoloHost,
  createMassfrontGalacticEntryTicket
} from '../modules/space_exploration/src/host/massfront_solo_host.js';
import { loadProductionCommanderRosterSnapshot } from '../modules/space_exploration/tools/tests/production-commander-roster.fixture.mjs';

const now = 1_788_800_000_000;
const profileId = 'galactic_adapter_test';
const roster = await loadProductionCommanderRosterSnapshot();
const ticket = createMassfrontGalacticEntryTicket(profileId, {
  issuedAt: now,
  ttlMs: 300_000,
  commanderRosterSnapshot: roster,
  commanderRosterFingerprint: roster.fingerprint,
  commissioning: { factionId: 'nova', commanderId: 'nova_kai' }
});
const sessionStorage = createMemoryStorage({
  [MASSFRONT_GALACTIC_ENTRY_TICKET_KEY]: JSON.stringify(ticket)
});
const host = new MassfrontSoloHost({
  storage: createMemoryStorage(),
  indexedDB: null,
  sessionStorage,
  navigation: async () => {},
  now: () => now,
  contentVersion: `catalog-${CATALOG_VERSION}`
});

const state = createShowcaseReadyDomainState();
state.profileId = profileId;
state.missions.uga_pale_bloom.completions = 1;
state.missions.uga_silent_spine.completions = 1;

const operations = new Map();
let index = 0;
for (const mission of Object.values(MISSION_CATALOG)) {
  const operation = createGroundOperation(state, {
    missionId: mission.id,
    factionId: mission.contractFactionId || 'nova',
    mapId: getUgaGroundAreaForMission(mission.id).recommendedMapId
  });
  operations.set(mission.id, operation);
  assert.equal(host.validateIntegratedOperation(operation), operation, `${mission.id} raw operation`);
  assert.deepEqual(operation.objective, mission.objective, `${mission.id} objective must remain authored`);
  assert.equal(operation.battlefield.location.mapId, getUgaGroundAreaForMission(mission.id).recommendedMapId);

  const nonce = `galactic_adapter_${String(index).padStart(4, '0')}`;
  const request = createGroundOperationRequestV2(operation, {
    nonce,
    accountId: profileId,
    issuedAt: now,
    ttlMs: 300_000,
    contentVersion: `catalog-${CATALOG_VERSION}`
  });
  assert.equal(host.validateIntegratedOperation(request), request.operation, `${mission.id} V2 envelope`);
  const prepared = await host.prepareGroundOperation(request);
  assert.equal(prepared.accepted, true, `${mission.id} production preparation`);
  assert.equal(prepared.adapter, 'massfront-solo-v2');
  const restored = await host.loadGroundOperationRequest(nonce);
  assert.equal(restored.operation.missionId, mission.id);
  assert.deepEqual(restored.operation.objective, mission.objective);
  index += 1;
}
assert.equal(operations.size, 9, 'the current authored playable catalog must contain nine operations');

function expectRejected(value, expectedIssue) {
  assert.throws(
    () => host.validateIntegratedOperation(value),
    error => {
      assert.equal(error.code, 'GALACTIC_OPERATION_OUT_OF_SCOPE');
      assert.ok(error.issues.some(entry => entry.code === expectedIssue),
        `expected ${expectedIssue}, received ${error.issues.map(entry => entry.code).join(', ')}`);
      return true;
    }
  );
}

const paleBloom = operations.get('uga_pale_bloom');
assert.equal(paleBloom.objective.type, 'purge_brood');
assert.equal(paleBloom.battlefield.infestationActive, true);
assert.deepEqual(paleBloom.battlefield.hiveTargetIds, paleBloom.objective.hiveTargetIds);

const missingBattlefield = structuredClone(paleBloom);
delete missingBattlefield.battlefield.location;
expectRejected(missingBattlefield, 'GALACTIC_OPERATION_BATTLEFIELD_INVALID');

const relabeledBattlefield = structuredClone(paleBloom);
relabeledBattlefield.battlefield.location.display.planetName = 'Vespera';
expectRejected(relabeledBattlefield, 'GALACTIC_OPERATION_BATTLEFIELD_INVALID');

const arbitraryOperation = structuredClone(operations.get('nova_heliograph_wake'));
arbitraryOperation.untrustedRuntimeOverride = 'instant_victory';
expectRejected(arbitraryOperation, 'GALACTIC_OPERATION_FIELDS_INVALID');

const fakeMission = structuredClone(paleBloom);
fakeMission.missionId = 'uga_unpublished_fake';
expectRejected(fakeMission, 'GALACTIC_OPERATION_MISSION_INVALID');

const circularObjective = structuredClone(paleBloom);
circularObjective.objective.self = circularObjective.objective;
expectRejected(circularObjective, 'GALACTIC_OPERATION_MALFORMED');

const wrongFaction = structuredClone(operations.get('dominion_caldris_claim'));
wrongFaction.proxyFactionId = 'nova';
wrongFaction.playerFactionId = 'nova';
expectRejected(wrongFaction, 'GALACTIC_OPERATION_ACCESS_INVALID');

const wrongObjective = structuredClone(operations.get('syndicate_black_manifest'));
wrongObjective.objective = { type: 'purge_brood', infestation: true, hiveTargetIds: ['invented_hive'], nestCount: 1 };
expectRejected(wrongObjective, 'GALACTIC_OPERATION_OBJECTIVE_INVALID');

const staleRoster = structuredClone(paleBloom);
staleRoster.commanderRosterFingerprint = 'fnv1a32:stale';
expectRejected(staleRoster, 'GALACTIC_OPERATION_ROSTER_INVALID');

const validRequest = createGroundOperationRequestV2(paleBloom, {
  nonce: 'galactic_adapter_forged_envelope',
  accountId: profileId,
  issuedAt: now,
  ttlMs: 300_000,
  contentVersion: `catalog-${CATALOG_VERSION}`
});
const arbitraryEnvelope = { ...validRequest, untrusted: true };
expectRejected(arbitraryEnvelope, 'REQUEST_ENVELOPE_FIELDS_INVALID');

const fakeEnvelope = {
  schemaVersion: 2,
  kind: 'GroundOperationRequestV2',
  nonce: 'galactic_adapter_fake_envelope',
  operation: { missionId: 'uga_pale_bloom' }
};
expectRejected(fakeEnvelope, 'REQUEST_ENVELOPE_FIELDS_INVALID');

console.log(`galactic operation adapter: ${operations.size} authored operations accepted; forged operations/envelopes rejected`);
