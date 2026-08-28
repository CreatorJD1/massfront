import assert from 'node:assert/strict';
import {
  commanderRosterSnapshotFingerprintV1,
  normalizeCommanderRosterSnapshotV1,
  validateCommanderRosterSnapshotV1
} from '../../src/domain/commander_roster_contract.js';
import {
  validateCommanderRosterHostCapabilityV1,
  validateExplorationHostV1
} from '../../src/domain/host_contract.js';

const commanderIds = [
  ['nova_kai', 'nova', 'nova'],
  ['nova_holt', 'nova', 'nova'],
  ['nova_vale', 'nova', 'nova'],
  ['legion_vex', 'legion', 'dominion'],
  ['legion_korr', 'legion', 'dominion'],
  ['legion_dravik', 'legion', 'dominion'],
  ['syndicate_renn', 'syndicate', 'syndicate'],
  ['syndicate_nyx', 'syndicate', 'syndicate'],
  ['syndicate_voss', 'syndicate', 'syndicate']
];

function makeSnapshot() {
  const commanders = commanderIds.map(([id, sourceFactionId, campaignFactionId], index) => ({
    id,
    sourceFactionId,
    campaignFactionId,
    name: `Commander ${index + 1}`,
    rank: 'Commander',
    shortName: id.split('_').at(-1),
    callsign: `CALL-${index + 1}`,
    role: 'COMMAND',
    chassis: { heroType: index + 1, unit: `Chassis ${index + 1}`, sprite: `cmdr_${index + 1}` },
    passive: { label: `Passive ${index + 1}`, perk: `perk_${index + 1}` },
    signature: { id: `signature_${index + 1}`, label: `Signature ${index + 1}`, em: '✦' },
    weapons: { primary: `Primary ${index + 1}`, secondary: `Secondary ${index + 1}` },
    portrait: { resolver: 'commanderPortraitSrc', fallback: `./fallback_${index + 1}.jpg`, alt: `${id} portrait` },
    voice: { bank: `cmdr_${id}`, channel: 'cmdr', slotPrefix: `vo_cmdr_${id}_` }
  }));
  const snapshot = {
    schemaVersion: 1,
    kind: 'CommanderRosterSnapshotV1',
    source: 'massfront-base',
    sourceVersion: 1,
    commanderCount: commanders.length,
    commanders
  };
  snapshot.fingerprint = commanderRosterSnapshotFingerprintV1(snapshot);
  return snapshot;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function codes(validation) {
  return validation.issues.map(entry => entry.code);
}

function makeHost(overrides = {}) {
  return {
    schemaVersion: 1,
    loadProfileSnapshot() {},
    loadCampaignSnapshot() {},
    saveCampaignSnapshot() {},
    transact() {},
    prepareGroundOperation() {},
    consumeGroundResult() {},
    launchClassicMode() {},
    returnToMainMenu() {},
    subscribeResult() {},
    dispose() {},
    ...overrides
  };
}

const valid = makeSnapshot();
assert.equal(validateCommanderRosterSnapshotV1(valid).ok, true);
assert.deepEqual(JSON.parse(JSON.stringify(valid)), valid, 'snapshot must survive a JSON round trip');
assert.equal(commanderRosterSnapshotFingerprintV1(valid), valid.fingerprint);
assert.equal(commanderRosterSnapshotFingerprintV1(clone(valid)), valid.fingerprint, 'fingerprint must not depend on object identity');
assert.deepEqual(valid.commanders.map(entry => entry.id), commanderIds.map(entry => entry[0]), 'authored order must remain stable');
assert.equal(valid.commanders.some(entry => /^(brood|horde)/.test(entry.id)), false);

const normalized = normalizeCommanderRosterSnapshotV1(valid);
assert.equal(Object.isFrozen(normalized), true);
assert.equal(Object.isFrozen(normalized.commanders), true);
assert.notEqual(normalized, valid, 'normalization must not retain a mutable host reference');

const staleFingerprint = clone(valid);
staleFingerprint.commanders[0].callsign = 'MUTATED';
assert.ok(codes(validateCommanderRosterSnapshotV1(staleFingerprint)).includes('COMMANDER_ROSTER_FINGERPRINT_INVALID'));

const wrongMapping = clone(valid);
wrongMapping.commanders[3].campaignFactionId = 'legion';
wrongMapping.fingerprint = commanderRosterSnapshotFingerprintV1(wrongMapping);
assert.ok(codes(validateCommanderRosterSnapshotV1(wrongMapping)).includes('COMMANDER_ROSTER_FACTION_MAPPING_INVALID'));

const duplicate = clone(valid);
duplicate.commanders[8].id = duplicate.commanders[7].id;
duplicate.fingerprint = commanderRosterSnapshotFingerprintV1(duplicate);
assert.ok(codes(validateCommanderRosterSnapshotV1(duplicate)).includes('COMMANDER_ROSTER_ID_DUPLICATE'));

const brood = clone(valid);
brood.commanders[8].id = 'horde_sovereign';
brood.commanders[8].sourceFactionId = 'horde';
brood.fingerprint = commanderRosterSnapshotFingerprintV1(brood);
const broodCodes = codes(validateCommanderRosterSnapshotV1(brood));
assert.ok(broodCodes.includes('COMMANDER_ROSTER_FACTION_UNPLAYABLE'));
assert.ok(broodCodes.includes('COMMANDER_ROSTER_BROOD_FORBIDDEN'));

const nonJson = clone(valid);
nonJson.commanders[0].runtimeResolver = () => 'not serializable';
assert.ok(codes(validateCommanderRosterSnapshotV1(nonJson)).includes('COMMANDER_ROSTER_NOT_JSON_SAFE'));

const localCompatibleHost = makeHost();
assert.equal(validateExplorationHostV1(localCompatibleHost).ok, true, 'existing ExplorationHostV1 remains valid without the optional roster method');
assert.deepEqual(validateCommanderRosterHostCapabilityV1(localCompatibleHost, null), { ok: true, supported: false, issues: [] });

const integratedHost = makeHost({ loadCommanderRosterSnapshot: () => valid });
assert.equal(validateExplorationHostV1(integratedHost).ok, true);
assert.equal(validateCommanderRosterHostCapabilityV1(integratedHost, valid).supported, true);
assert.equal(validateCommanderRosterHostCapabilityV1(integratedHost, valid).ok, true);

const malformedOptionalHost = makeHost({ loadCommanderRosterSnapshot: valid });
const malformedHostValidation = validateExplorationHostV1(malformedOptionalHost);
assert.equal(malformedHostValidation.ok, false);
assert.ok(codes(malformedHostValidation).includes('HOST_OPTIONAL_METHOD_INVALID'));

console.log('CommanderRosterSnapshotV1 contract: PASS');
