import assert from 'node:assert/strict';
import {
  COMMANDER1_BY_CAMPAIGN_FACTION,
  COMMANDER_LEGACY_ALIASES,
  COMMANDER_ROSTER_AUTHORITY,
  COMMANDER_ROSTER_IDS,
  COMMANDER_SOURCE_ART_BY_ID,
  commanderRosterSnapshotFingerprintV1,
  isSelectableCommanderIdV1,
  normalizeCommanderRosterSnapshotV1,
  resolveCommanderIdAtMigrationBoundaryV1,
  validateCommanderRosterSnapshotV1
} from '../../src/domain/commander_roster_contract.js';
import {
  CANONICAL_COMMANDER_CATALOG_V1,
  SANDBOX_ONLY_LEGACY_COMMANDER_CATALOG_FIXTURE_V1,
  createCommanderCatalogFromSnapshotV1,
  createProductionCommanderCatalogContextV1,
  createSandboxCommanderCatalogContextV1,
  validateCommanderCatalogContextV1
} from '../../src/domain/commander_catalog.js';
import { COMMANDER_CATALOG } from '../../src/domain/catalog.js';
import {
  COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1,
  EXPLORATION_PRODUCTION_HOST_SCHEMA_VERSION,
  validateCommanderRosterHostCapabilityV1,
  validateExplorationHostV1,
  validateExplorationHostV2,
  validateProductionCommanderRosterHostCapabilityV2
} from '../../src/domain/host_contract.js';
import { loadProductionCommanderRosterSnapshot } from './production-commander-roster.fixture.mjs';

function makeSnapshot() {
  const commanders = COMMANDER_ROSTER_AUTHORITY.map((authority, index) => ({
    id: authority.id,
    sourceFactionId: authority.sourceFactionId,
    campaignFactionId: authority.campaignFactionId,
    name: authority.name,
    rank: authority.rank,
    shortName: authority.shortName,
    callsign: authority.callsign,
    role: authority.role,
    lore: { key: `commander.${authority.id}`, epithet: `Epithet ${index + 1}`, service: `Service ${index + 1}`, bio: `Biography ${index + 1}` },
    chassis: { heroType: index + 1, unit: `Chassis ${index + 1}`, sprite: `cmdr_${index + 1}` },
    passive: { label: `Passive ${index + 1}`, perk: authority.trait },
    baseline: { index, label: `Baseline ${index + 1}` },
    signature: { id: `signature_${index + 1}`, label: `Signature ${index + 1}`, em: '✦' },
    weapons: { primary: `Primary ${index + 1}`, secondary: `Secondary ${index + 1}` },
    portrait: { resolver: 'commanderPortraitSrc', fallback: `./fallback_${index + 1}.jpg`, alt: `${authority.id} portrait` },
    voice: { bank: `cmdr_${authority.id}`, channel: 'cmdr', slotPrefix: `vo_cmdr_${authority.id}_` },
    sourceArt: clone(COMMANDER_SOURCE_ART_BY_ID[authority.id] || null)
  }));
  const snapshot = {
    schemaVersion: 1,
    kind: 'CommanderRosterSnapshotV1',
    source: 'massfront-base',
    sourceVersion: 1,
    commanderCount: commanders.length,
    commander1ByCampaignFaction: clone(COMMANDER1_BY_CAMPAIGN_FACTION),
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
    kind: 'LocalSandboxHostV1',
    productionIntegrated: false,
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
assert.deepEqual(valid.commanders.map(entry => entry.id), COMMANDER_ROSTER_IDS, 'authored order must remain stable');
assert.equal(valid.commanders.some(entry => /^(brood|horde)/.test(entry.id)), false);
assert.deepEqual(valid.commander1ByCampaignFaction, { nova: 'nova_kai', dominion: 'legion_vex', syndicate: 'syndicate_renn' });
assert.deepEqual(
  Object.fromEntries(['nova', 'legion', 'syndicate'].map(faction => [faction, valid.commanders.filter(entry => entry.sourceFactionId === faction).length])),
  { nova: 3, legion: 3, syndicate: 3 },
  'authority requires three commanders per source faction'
);

const normalized = normalizeCommanderRosterSnapshotV1(valid);
function assertDeepFrozen(value, path = 'snapshot') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
  for (const [key, child] of Object.entries(value)) assertDeepFrozen(child, `${path}.${key}`);
}
assertDeepFrozen(normalized);
assert.notEqual(normalized, valid, 'normalization must not retain a mutable host reference');
assert.throws(() => { normalized.commanders[0].lore.bio = 'mutated'; }, TypeError);

assert.equal(isSelectableCommanderIdV1('keel'), false, 'KEEL is a UGA guide, not a selectable commander');
assert.equal(resolveCommanderIdAtMigrationBoundaryV1('keel'), null);
assert.equal(resolveCommanderIdAtMigrationBoundaryV1('KEEL'), null);
for (const [legacyId, canonicalId] of Object.entries(COMMANDER_LEGACY_ALIASES)) {
  assert.equal(isSelectableCommanderIdV1(legacyId), false, `${legacyId} cannot leak into production selection`);
  assert.equal(resolveCommanderIdAtMigrationBoundaryV1(legacyId), canonicalId, `${legacyId} resolves only at the migration boundary`);
}
assert.equal(resolveCommanderIdAtMigrationBoundaryV1('nova_kai'), 'nova_kai');

const productionCatalog = createCommanderCatalogFromSnapshotV1(valid);
assert.deepEqual(Object.keys(productionCatalog), COMMANDER_ROSTER_IDS);
assert.equal(Object.keys(productionCatalog).length, 9);
assert.equal(Object.keys(productionCatalog).some(id => Object.hasOwn(COMMANDER_LEGACY_ALIASES, id)), false);
assert.strictEqual(COMMANDER_CATALOG, CANONICAL_COMMANDER_CATALOG_V1, 'deprecated compatibility alias must be the canonical nine-row catalog');
assert.notStrictEqual(COMMANDER_CATALOG, SANDBOX_ONLY_LEGACY_COMMANDER_CATALOG_FIXTURE_V1);
assert.equal(productionCatalog.syndicate_renn.sourceArt.status, 'SOURCE_ACCEPTED_RUNTIME_UNREGISTERED');
assert.equal(productionCatalog.syndicate_renn.sourceArt.runtimeReady, false);
assert.equal(productionCatalog.syndicate_renn.sourceArt.runtimeRegistered, false);
assert.doesNotMatch(JSON.stringify(productionCatalog.syndicate_renn.sourceArt), /\.vrm(?:"|$)/i, 'source metadata must not register a VRM runtime path');

const productionContext = createProductionCommanderCatalogContextV1(valid);
assert.equal(validateCommanderCatalogContextV1(productionContext, { requireProduction: true }).ok, true);
assert.deepEqual(productionContext.commanderIds, COMMANDER_ROSTER_IDS);
assertDeepFrozen(productionContext);
const sandboxContext = createSandboxCommanderCatalogContextV1();
assert.equal(validateCommanderCatalogContextV1(sandboxContext).ok, true);
assert.equal(validateCommanderCatalogContextV1(sandboxContext, { requireProduction: true }).ok, false, 'production must reject sandbox fixtures');
assert.strictEqual(sandboxContext.catalog, SANDBOX_ONLY_LEGACY_COMMANDER_CATALOG_FIXTURE_V1);
assert.deepEqual(Object.keys(sandboxContext.catalog), Object.keys(COMMANDER_LEGACY_ALIASES));
assert.equal(Object.keys(sandboxContext.catalog).some(id => COMMANDER_ROSTER_IDS.includes(id)), false, 'sandbox fixture identities stay isolated from production IDs');

const staleFingerprint = clone(valid);
staleFingerprint.commanders[0].callsign = 'MUTATED';
assert.ok(codes(validateCommanderRosterSnapshotV1(staleFingerprint)).includes('COMMANDER_ROSTER_FINGERPRINT_INVALID'));

const wrongMapping = clone(valid);
wrongMapping.commanders[3].campaignFactionId = 'legion';
wrongMapping.fingerprint = commanderRosterSnapshotFingerprintV1(wrongMapping);
assert.ok(codes(validateCommanderRosterSnapshotV1(wrongMapping)).includes('COMMANDER_ROSTER_FACTION_MAPPING_INVALID'));

const wrongCommander1 = clone(valid);
wrongCommander1.commander1ByCampaignFaction.nova = 'nova_holt';
wrongCommander1.fingerprint = commanderRosterSnapshotFingerprintV1(wrongCommander1);
assert.ok(codes(validateCommanderRosterSnapshotV1(wrongCommander1)).includes('COMMANDER_ROSTER_COMMANDER1_INVALID'));

const wrongOrder = clone(valid);
[wrongOrder.commanders[0], wrongOrder.commanders[1]] = [wrongOrder.commanders[1], wrongOrder.commanders[0]];
wrongOrder.fingerprint = commanderRosterSnapshotFingerprintV1(wrongOrder);
assert.ok(codes(validateCommanderRosterSnapshotV1(wrongOrder)).includes('COMMANDER_ROSTER_ORDER_INVALID'));

const unexpectedDeepField = clone(valid);
unexpectedDeepField.commanders[0].voice.runtimeUrl = './unapproved.vrm';
unexpectedDeepField.fingerprint = commanderRosterSnapshotFingerprintV1(unexpectedDeepField);
assert.ok(codes(validateCommanderRosterSnapshotV1(unexpectedDeepField)).includes('COMMANDER_ROSTER_SCHEMA_INVALID'));

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
assert.equal(validateExplorationHostV1(localCompatibleHost).ok, true, 'the explicit LocalSandboxHostV1 exception remains valid without the roster method');
assert.deepEqual(validateCommanderRosterHostCapabilityV1(localCompatibleHost, null), { ok: true, supported: false, issues: [] });

const productionSnapshot = await loadProductionCommanderRosterSnapshot();
assert.equal(productionSnapshot.fingerprint, COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1);
const integratedHost = makeHost({
  schemaVersion: EXPLORATION_PRODUCTION_HOST_SCHEMA_VERSION,
  kind: 'MassfrontSoloHostV2',
  productionIntegrated: true,
  commanderRosterSnapshot: productionSnapshot,
  commanderRosterFingerprint: productionSnapshot.fingerprint,
  loadCommanderRosterSnapshot: () => productionSnapshot
});
assert.equal(validateExplorationHostV1(integratedHost).ok, true);
assert.equal(validateExplorationHostV2(integratedHost).ok, true);
assert.equal(validateCommanderRosterHostCapabilityV1(integratedHost, productionSnapshot).supported, true);
assert.equal(validateCommanderRosterHostCapabilityV1(integratedHost, productionSnapshot).ok, true);
assert.equal(validateProductionCommanderRosterHostCapabilityV2(integratedHost, productionSnapshot).ok, true);

const missingProductionRoster = makeHost({
  schemaVersion: EXPLORATION_PRODUCTION_HOST_SCHEMA_VERSION,
  kind: 'MassfrontSoloHostV2',
  productionIntegrated: true
});
assert.equal(validateExplorationHostV2(missingProductionRoster).ok, false, 'production cannot use the sandbox roster exception');
assert.ok(codes(validateExplorationHostV2(missingProductionRoster)).includes('HOST_COMMANDER_ROSTER_CAPABILITY_MISSING'));

const staleProductionHost = {
  ...integratedHost,
  commanderRosterFingerprint: 'fnv1a32:stale'
};
assert.equal(validateExplorationHostV2(staleProductionHost).ok, false);
assert.ok(codes(validateExplorationHostV2(staleProductionHost)).includes('HOST_COMMANDER_ROSTER_FINGERPRINT_INVALID'));

const divergentProductionCapability = {
  ...integratedHost,
  loadCommanderRosterSnapshot: () => valid
};
assert.equal(validateExplorationHostV2(divergentProductionCapability).ok, false);
assert.ok(codes(validateExplorationHostV2(divergentProductionCapability)).includes('HOST_COMMANDER_ROSTER_CAPABILITY_INVALID'));

const malformedOptionalHost = makeHost({ loadCommanderRosterSnapshot: valid });
const malformedHostValidation = validateExplorationHostV1(malformedOptionalHost);
assert.equal(malformedHostValidation.ok, false);
assert.ok(codes(malformedHostValidation).includes('HOST_OPTIONAL_METHOD_INVALID'));

console.log('CommanderRosterSnapshotV1 contract: PASS');
