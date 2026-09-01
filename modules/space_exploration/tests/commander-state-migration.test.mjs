import assert from 'node:assert/strict';
import {
  ACCOUNT_PROFILE_COMMANDER_ROSTER_FINGERPRINT,
  CANONICAL_COMMANDER_CATALOG_V1,
  COMMANDER1_BY_CAMPAIGN_FACTION,
  COMMANDER_LEGACY_ALIASES,
  COMMANDER_ROSTER_IDS,
  DOMAIN_COMMANDER_ROSTER_FINGERPRINT,
  DOMAIN_STATE_SCHEMA_VERSION,
  PRODUCTION_COMMANDER_CATALOG_CONTEXT_KIND,
  applyAccountProfile,
  commissionCareerFaction,
  createInitialAccountProfile,
  createInitialDomainState,
  deserializeAccountProfile,
  deserializeDomainState,
  grantFactionResidency,
  migrateDomainState,
  normalizeAccountProfile,
  serializeAccountProfile,
  serializeDomainState,
  validateAccountProfile,
  validateDomainState
} from '../src/domain/index.js';

const EXPECTED_FINGERPRINT = 'fnv1a32:0aadcd2d';
const PRODUCTION_CONTEXT = Object.freeze({
  schemaVersion: 1,
  kind: PRODUCTION_COMMANDER_CATALOG_CONTEXT_KIND,
  productionIntegrated: true,
  fixtureOnly: false,
  snapshotFingerprint: EXPECTED_FINGERPRINT,
  commanderIds: COMMANDER_ROSTER_IDS,
  commander1ByCampaignFaction: COMMANDER1_BY_CAMPAIGN_FACTION,
  migrationAliases: COMMANDER_LEGACY_ALIASES,
  catalog: CANONICAL_COMMANDER_CATALOG_V1
});

const CASES = [
  ['nova_rhea_voss', 'nova_kai', 'nova'],
  ['dominion_toren_vale', 'legion_vex', 'dominion'],
  ['syndicate_mara_quill', 'syndicate_renn', 'syndicate']
];

function verifyFreshNeutralState() {
  const state = createInitialDomainState(PRODUCTION_CONTEXT);
  assert.equal(DOMAIN_COMMANDER_ROSTER_FINGERPRINT, EXPECTED_FINGERPRINT);
  assert.equal(state.commanderRosterFingerprint, EXPECTED_FINGERPRINT);
  assert.deepEqual(state.commissioning, { factionId: null, commanderId: null, completed: false, completedRevision: null });
  assert.ok(Object.values(state.factions).every(faction => !faction.resident && faction.status === 'nonresident'));
  assert.ok(Object.values(state.personnel.commanders).every(commander => !commander.unlocked && commander.status === 'locked'));
  assert.equal(Object.hasOwn(state.personnel.commanders, 'keel'), false);
  assert.equal(validateDomainState(state, PRODUCTION_CONTEXT).ok, true);

  const profile = createInitialAccountProfile('neutral', PRODUCTION_CONTEXT);
  assert.equal(ACCOUNT_PROFILE_COMMANDER_ROSTER_FINGERPRINT, EXPECTED_FINGERPRINT);
  assert.equal(profile.factionIdentity, null);
  assert.equal(profile.commanderId, null);
  assert.ok(Object.values(profile.commanders).every(commander => !commander.unlocked));
  assert.equal(validateAccountProfile(profile, PRODUCTION_CONTEXT).ok, true);
}

function verifyProductionContextBinding() {
  assert.equal(createInitialDomainState(PRODUCTION_CONTEXT).commanderRosterFingerprint, EXPECTED_FINGERPRINT);
  assert.throws(() => createInitialDomainState({ ...PRODUCTION_CONTEXT, snapshotFingerprint: 'fnv1a32:stale' }), /commander catalog context/i);
  assert.throws(() => createInitialAccountProfile('stale', { ...PRODUCTION_CONTEXT, snapshotFingerprint: 'fnv1a32:stale' }), /canonical production/i);
}

function profileMigrationFixture(legacyId, canonicalId, factionId) {
  return {
    schemaVersion: 1,
    profileId: `legacy-${factionId}`,
    career: { level: 3, experience: 440 },
    factionIdentity: factionId,
    commanderId: legacyId,
    inventory: { items: {}, craftedMods: {} },
    commanders: {
      [legacyId]: {
        unlocked: true,
        level: 7,
        experience: 900,
        readiness: 73,
        loyalty: 61,
        status: 'recovering',
        injury: { type: 'legacy_wound', severity: 'light', recoveryCycles: 2, clinicTicket: 'clinic-v2' },
        deployedAt: 111,
        unlockTokens: ['legacy-token'],
        forwardData: { legacyOnly: true }
      },
      [canonicalId]: {
        unlocked: false,
        level: 4,
        experience: 1200,
        readiness: 94,
        loyalty: 88,
        deployedAt: 222,
        unlockTokens: ['canonical-token'],
        forwardData: { canonicalOnly: true },
        legacyV2Payload: '{"kind":"EntryV2","token":"A.B.C"}'
      }
    },
    cosmetics: { shipLivery: 'nightglass', illumination: 'expedition_blue', unlockedIds: [] },
    settings: { permanentDeath: false, reducedMotion: false, textScale: 1 }
  };
}

function verifyProfileAliasMigrations() {
  for (const [legacyId, canonicalId, factionId] of CASES) {
    const profile = normalizeAccountProfile(profileMigrationFixture(legacyId, canonicalId, factionId), undefined, PRODUCTION_CONTEXT);
    const commander = profile.commanders[canonicalId];
    assert.equal(profile.factionIdentity, factionId);
    assert.equal(profile.commanderId, COMMANDER1_BY_CAMPAIGN_FACTION[factionId]);
    assert.equal(Object.hasOwn(profile.commanders, legacyId), false);
    assert.equal(commander.unlocked, true);
    assert.equal(commander.level, 7);
    assert.equal(commander.experience, 1200);
    assert.equal(commander.readiness, 94);
    assert.equal(commander.loyalty, 88);
    assert.equal(commander.injury.clinicTicket, 'clinic-v2');
    assert.equal(commander.deployedAt, 222);
    assert.deepEqual(commander.unlockTokens, ['legacy-token', 'canonical-token']);
    assert.deepEqual(commander.forwardData, { legacyOnly: true, canonicalOnly: true });
    assert.equal(commander.legacyV2Payload, '{"kind":"EntryV2","token":"A.B.C"}');
    assert.equal(validateAccountProfile(profile, PRODUCTION_CONTEXT).ok, true);
    const serialized = serializeAccountProfile(profile, PRODUCTION_CONTEXT);
    const roundTrip = deserializeAccountProfile(serialized, PRODUCTION_CONTEXT);
    assert.deepEqual(roundTrip, profile);
    assert.equal(roundTrip.commanders[canonicalId].legacyV2Payload, '{"kind":"EntryV2","token":"A.B.C"}');
  }
}

function domainMigrationFixture(legacyId, canonicalId, factionId) {
  const state = createInitialDomainState(PRODUCTION_CONTEXT);
  state.schemaVersion = 4;
  state.revision = 9;
  state.factionIdentity = factionId;
  delete state.commanderRosterFingerprint;
  delete state.commissioning;
  state.personnel.commanders[legacyId] = {
    unlocked: true,
    status: 'recovering',
    level: 8,
    experience: 700,
    readiness: 76,
    loyalty: 69,
    injury: { type: 'legacy_wound', severity: 'moderate', recoveryCycles: 3, physician: 'UGA-4' },
    operationsCompleted: 5,
    deployedAt: 300,
    unlockTokens: ['legacy-token'],
    forwardData: { legacyOnly: true }
  };
  Object.assign(state.personnel.commanders[canonicalId], {
    unlocked: false,
    status: 'ready',
    level: 6,
    experience: 1100,
    readiness: 91,
    loyalty: 82,
    operationsCompleted: 7,
    deployedAt: 400,
    unlockTokens: ['canonical-token'],
    forwardData: { canonicalOnly: true },
    legacyV2Token: 'v2:opaque:00ff'
  });
  state.operations.history = [{ commanderId: legacyId, nested: { commander: { id: legacyId } }, legacyV2Token: 'v2:opaque:00ff' }];
  return state;
}

function verifyDomainAliasMigrations() {
  for (const [legacyId, canonicalId, factionId] of CASES) {
    const migrated = migrateDomainState({ storageFormatVersion: 2, state: domainMigrationFixture(legacyId, canonicalId, factionId) }, PRODUCTION_CONTEXT);
    const commander = migrated.personnel.commanders[canonicalId];
    assert.equal(migrated.schemaVersion, DOMAIN_STATE_SCHEMA_VERSION);
    assert.equal(migrated.commanderRosterFingerprint, EXPECTED_FINGERPRINT);
    assert.deepEqual(migrated.commissioning, { factionId, commanderId: COMMANDER1_BY_CAMPAIGN_FACTION[factionId], completed: true, completedRevision: 9 });
    assert.equal(Object.hasOwn(migrated.personnel.commanders, legacyId), false);
    assert.equal(commander.level, 8);
    assert.equal(commander.experience, 1100);
    assert.equal(commander.readiness, 91);
    assert.equal(commander.loyalty, 82);
    assert.equal(commander.operationsCompleted, 7);
    assert.equal(commander.injury.physician, 'UGA-4');
    assert.equal(commander.deployedAt, 400);
    assert.deepEqual(commander.unlockTokens, ['legacy-token', 'canonical-token']);
    assert.deepEqual(commander.forwardData, { legacyOnly: true, canonicalOnly: true });
    assert.equal(commander.legacyV2Token, 'v2:opaque:00ff');
    assert.equal(migrated.operations.history[0].commanderId, canonicalId);
    assert.equal(migrated.operations.history[0].nested.commander.id, canonicalId);
    assert.equal(migrated.operations.history[0].legacyV2Token, 'v2:opaque:00ff');
    assert.equal(validateDomainState(migrated, PRODUCTION_CONTEXT).ok, true);
    const roundTrip = deserializeDomainState(serializeDomainState(migrated, PRODUCTION_CONTEXT), PRODUCTION_CONTEXT);
    assert.deepEqual(roundTrip, migrated);
    assert.equal(roundTrip.personnel.commanders[canonicalId].legacyV2Token, 'v2:opaque:00ff');
  }
}

function verifyUntouchedLegacyBootstrapIsNeutralized() {
  const legacy = createInitialDomainState(PRODUCTION_CONTEXT);
  legacy.schemaVersion = 4;
  delete legacy.commanderRosterFingerprint;
  delete legacy.commissioning;
  legacy.factions.nova = {
    resident: true,
    recruitmentComplete: true,
    status: 'ready',
    reputation: 12,
    loyalty: 58,
    readiness: 100,
    recoveryCycles: 0,
    operationsCompleted: 0,
    residentSinceRevision: 0
  };
  for (const id of ['nova_kai', 'nova_holt', 'nova_vale']) Object.assign(legacy.personnel.commanders[id], { unlocked: true, status: 'ready', readiness: 100, loyalty: 62 });
  const migrated = migrateDomainState(legacy, PRODUCTION_CONTEXT);
  assert.deepEqual(migrated.commissioning, { factionId: null, commanderId: null, completed: false, completedRevision: null });
  assert.ok(Object.values(migrated.factions).every(faction => !faction.resident));
  assert.ok(Object.values(migrated.personnel.commanders).every(commander => !commander.unlocked));

  const profile = normalizeAccountProfile({
    schemaVersion: 1,
    profileId: 'untouched',
    career: { level: 1, experience: 0 },
    factionIdentity: 'uga',
    inventory: { items: {}, craftedMods: {} },
    commanders: Object.fromEntries(Object.entries(CANONICAL_COMMANDER_CATALOG_V1).map(([id, definition]) => [id, { unlocked: definition.factionId === 'nova', level: 1, experience: 0, scars: [] }]))
  }, undefined, PRODUCTION_CONTEXT);
  assert.equal(profile.factionIdentity, null);
  assert.equal(profile.commanderId, null);
  assert.ok(Object.values(profile.commanders).every(commander => !commander.unlocked));
}

function verifyCommissioningAndDominionMapping() {
  const neutral = createInitialDomainState(PRODUCTION_CONTEXT);
  assert.throws(() => grantFactionResidency(neutral, 'dominion'), error => error?.code === 'CAREER_COMMISSIONING_REQUIRED');
  for (const [factionId, commanderId] of Object.entries(COMMANDER1_BY_CAMPAIGN_FACTION)) {
    const commissioned = commissionCareerFaction(neutral, factionId, commanderId);
    assert.equal(commissioned.commissioning.commanderId, commanderId);
    assert.equal(commissioned.personnel.commanders[commanderId].status, 'ready');
    assert.ok(Object.entries(commissioned.personnel.commanders).filter(([, person]) => person.unlocked).every(([id]) => id === commanderId));
  }
  assert.throws(() => commissionCareerFaction(neutral, 'nova', 'keel'), error => error?.code === 'COMMISSIONING_COMMANDER_INVALID');
  assert.throws(() => commissionCareerFaction(neutral, 'nova', 'nova_rhea_voss'), error => error?.code === 'COMMISSIONING_COMMANDER_INVALID');

  let state = commissionCareerFaction(neutral, 'nova');
  state.ship.districts.factions.level = 2;
  state.ship.districts.factions.commissioned = true;
  state.ship.districts.factions.built = true;
  state.ship.districts.factions.facilities.tier1 = 'factions_tier1_core';
  state.ship.districts.factions.upgradesCompleted = 1;
  state.research.completedIds.push('uga_resident_charter');
  state.research.progressById.uga_resident_charter = 100;
  const dominion = grantFactionResidency(state, 'dominion');
  assert.deepEqual(['legion_vex', 'legion_korr', 'legion_dravik'].map(id => dominion.personnel.commanders[id].status), ['ready', 'ready', 'ready']);
  assert.equal(Object.keys(dominion.personnel.commanders).some(id => id.startsWith('dominion_')), false);

  const rawProfile = createInitialAccountProfile('invalid', PRODUCTION_CONTEXT);
  rawProfile.commanders.keel = { unlocked: true, level: 1, experience: 0 };
  rawProfile.commanders.nova_rhea_voss = { unlocked: true, level: 9, experience: 9 };
  assert.ok(validateAccountProfile(rawProfile, PRODUCTION_CONTEXT).issues.some(entry => entry.code === 'ACCOUNT_COMMANDER_ALIAS_OR_UNKNOWN'));
}

function verifyAccountApplication() {
  const profile = normalizeAccountProfile(profileMigrationFixture('dominion_toren_vale', 'legion_vex', 'dominion'), undefined, PRODUCTION_CONTEXT);
  const state = applyAccountProfile(createInitialDomainState(PRODUCTION_CONTEXT), profile, PRODUCTION_CONTEXT);
  assert.equal(state.commissioning.factionId, 'dominion');
  assert.equal(state.commissioning.commanderId, 'legion_vex');
  assert.equal(state.personnel.commanders.legion_vex.level, 7);
  assert.equal(state.personnel.commanders.legion_vex.experience, 1200);
  assert.equal(validateDomainState(state, PRODUCTION_CONTEXT).ok, true);
}

verifyFreshNeutralState();
verifyProductionContextBinding();
verifyProfileAliasMigrations();
verifyDomainAliasMigrations();
verifyUntouchedLegacyBootstrapIsNeutralized();
verifyCommissioningAndDominionMapping();
verifyAccountApplication();
console.log('commander state migration tests: PASS');
