import assert from 'node:assert/strict';
import {
  DISTRICT_CATALOG,
  CONSTRUCTION_FACILITY_CATALOG,
  DEPLOYMENT_STRUCTURE_CATALOG,
  DEPLOYMENT_UNIT_CATALOG,
  DOMAIN_STATE_SCHEMA_VERSION,
  DomainValidationError,
  FACTION_CATALOG,
  LocalDomainStore,
  MISSION_CATALOG,
  RESOURCE_KEYS,
  SHIP_DECKS,
  SHIP_DISTRICT_IDS,
  SITE_CATALOG,
  SPECIALIST_CATALOG,
  SYSTEM_CATALOG,
  advanceRecoveryCycles,
  advanceExpeditionCycles,
  applyGroundResult,
  assignSpecialistToDistrict,
  beginGroundOperation,
  calculateAdjacencySynergies,
  calculatePowerGridStatus,
  calculateShipExplorationRating,
  commitResearch,
  createGroundResult,
  createGroundOperationRequestV1,
  createGroundOperationResultV1,
  createExplorationContentManifestV1,
  createInitialDomainState,
  createInitialAccountProfile,
  createMemoryStorage,
  createShowcaseReadyDomainState,
  cancelConstruction,
  deployProbe,
  getMissionEligibility,
  getConstructionQuote,
  getConstructionCapacity,
  getConstructionStatus,
  getSurveyEligibility,
  installDistrictModule,
  enqueueConstruction,
  migrateDomainState,
  applyAccountProfile,
  normalizeAccountProfile,
  projectAccountProfile,
  plotCourse,
  simulateClassicModeLaunch,
  simulateGroundResult,
  unassignSpecialist,
  upgradeDistrict,
  validateCatalogs,
  validateDomainState,
  validateGroundOperation,
  validateGroundOperationRequestV1,
  validateGroundOperationResultV1,
  validateGroundResult
} from '../src/domain/index.js';

let constructionEventSequence = 0;

function finishConstruction(state, cycles, source = 'test') {
  constructionEventSequence += 1;
  return advanceExpeditionCycles(state, cycles, `test-build:${constructionEventSequence}`, source).state;
}

function codes(entries) {
  return entries.map(entry => entry.code);
}

function expectDomainIssue(callback, expectedCode) {
  assert.throws(callback, error => (
    error instanceof DomainValidationError &&
    error.issues.some(entry => entry.code === expectedCode)
  ), `expected DomainValidationError containing ${expectedCode}`);
}

function verifyLockedCatalog() {
  assert.deepEqual(validateCatalogs(), { ok: true, errors: [] });
  assert.deepEqual(RESOURCE_KEYS, [
    'credits',
    'alloys',
    'components',
    'bioSamples',
    'researchPoints',
    'fuel',
    'probes'
  ]);
  assert.deepEqual(SHIP_DISTRICT_IDS, [
    'command',
    'navigation',
    'survey',
    'mission_ops',
    'research',
    'fabricator',
    'engineering',
    'habitat',
    'factions',
    'hangar',
    'logistics'
  ]);
  assert.deepEqual(Object.keys(SYSTEM_CATALOG), ['aelos', 'veyra', 'karak']);
  assert.equal(FACTION_CATALOG.uga.role, 'civilization_authority');
  assert.equal(FACTION_CATALOG.uga.hireable, false);
  assert.equal(FACTION_CATALOG.brood.hireable, false);
  assert.equal(FACTION_CATALOG.brood.hostile, true);
  assert.equal(FACTION_CATALOG.brood.playable, false);
  assert.equal(FACTION_CATALOG.brood.humanoid, false);
  assert.deepEqual(FACTION_CATALOG.brood.enemyOfFactionIds, ['uga', 'nova', 'dominion', 'syndicate']);
  assert.equal(FACTION_CATALOG.brood.primaryEnemyOfFactionId, 'uga');
  assert.equal(DISTRICT_CATALOG.hangar.layoutContract.singleIntegratedHangarVolume, true);
  assert.equal(DISTRICT_CATALOG.hangar.layoutContract.baseDeployerAirUnit, true);
  assert.equal(DISTRICT_CATALOG.hangar.layoutContract.strikerMusterSharesBaseDeployerHangar, true);
  assert.deepEqual(DISTRICT_CATALOG.hangar.layoutContract.residentFactionIds, ['nova', 'dominion', 'syndicate']);
  assert.deepEqual(DISTRICT_CATALOG.hangar.layoutContract.excludedFactionIds, ['brood']);

  for (const districtId of SHIP_DISTRICT_IDS) {
    const district = DISTRICT_CATALOG[districtId];
    assert.ok(district, `${districtId} must be present`);
    assert.deepEqual(district.tiers.map(tier => tier.level), [1, 2, 3]);
    assert.equal(district.sockets.length, 3, `${districtId} must have three sockets`);
  }
  assert.equal(DISTRICT_CATALOG.command.fixed, true);
  assert.equal(DISTRICT_CATALOG.command.buildable, false);
  assert.equal(DISTRICT_CATALOG.command.initialLevel, 3);
  assert.equal(SHIP_DECKS.A.districtIds.length, 4);
  assert.equal(SHIP_DECKS.B.districtIds.length, 3);
  assert.equal(SHIP_DECKS.C.districtIds.length, 4);
  assert.equal(DEPLOYMENT_UNIT_CATALOG.armored_element.slotCost, 3);
  assert.equal(DEPLOYMENT_STRUCTURE_CATALOG.forward_command.slotCost, 4);
  assert.equal(Object.keys(CONSTRUCTION_FACILITY_CATALOG).length, 50, 'Ten districts each expose one core and four specialization choices');

  const broodMissions = Object.values(MISSION_CATALOG).filter(mission => mission.missionType === 'uga_brood_purge');
  assert.equal(Object.keys(MISSION_CATALOG).length, 9);
  assert.equal(broodMissions.length, 3);
  for (const mission of Object.values(MISSION_CATALOG)) assert.equal(mission.sponsorId, 'uga');
  for (const mission of broodMissions) {
    const site = SITE_CATALOG[mission.siteId];
    assert.equal(mission.access.type, 'uga_brood_proxy');
    assert.equal(mission.opponentFactionId, 'brood');
    assert.equal(mission.objective.type, 'purge_brood');
    assert.equal(mission.objective.infestation, true);
    assert.ok(mission.objective.hiveTargetIds.length > 0);
    assert.ok(mission.objective.hiveTargetIds.every(targetId => site.hiveTargetIds.includes(targetId)));
  }
}

function completeAelosVeyraKarakChain() {
  let state = createInitialDomainState();
  assert.deepEqual(validateDomainState(state), { ok: true, issues: [] });
  assert.equal(state.route.systemId, 'aelos');
  assert.equal(state.world.systems.aelos.discovered, true);
  assert.equal(state.world.systems.veyra.discovered, false);
  assert.equal(state.world.systems.karak.discovered, false);

  const lockedPurge = getMissionEligibility(state, 'uga_pale_bloom');
  assert.equal(lockedPurge.eligible, false);
  assert.ok(codes(lockedPurge.locks).includes('SYSTEM_UNDISCOVERED'));
  assert.ok(codes(lockedPurge.locks).includes('RESEARCH_REQUIRED'));
  assert.ok(codes(lockedPurge.locks).includes('ACTIVE_INFESTATION_REQUIRED'));
  assert.ok(codes(lockedPurge.locks).includes('HIVE_INTELLIGENCE_REQUIRED'));

  assert.equal(getSurveyEligibility(state, 'aelos_traffic_census').ok, true);
  state = deployProbe(state, 'aelos_traffic_census').state;
  assert.ok(state.discoveries.foundIds.includes('aelos_traffic_cipher'));
  assert.equal(state.intelligence.bySystem.aelos, 1);
  assert.equal(state.surveys.aelos_traffic_census.depleted, true);
  expectDomainIssue(() => deployProbe(state, 'aelos_traffic_census'), 'SURVEY_DEPLETED');

  state = deployProbe(state, 'aelos_phase_trace').state;
  assert.ok(state.discoveries.foundIds.includes('veyra_route_solution'));
  assert.equal(state.world.systems.veyra.discovered, true);
  assert.equal(state.surveys.veyra_photon_ring.status, 'available');
  assert.ok(state.story.completedStepIds.includes('veyra_route_open'));
  state = plotCourse(state, 'veyra');
  assert.equal(state.route.systemId, 'veyra');

  const veyraLevelLock = getSurveyEligibility(state, 'veyra_photon_ring');
  assert.equal(veyraLevelLock.ok, false);
  assert.ok(codes(veyraLevelLock.issues).includes('SURVEY_LEVEL_REQUIRED'));
  state = upgradeDistrict(state, 'survey');
  state = finishConstruction(state, 2);
  assert.equal(state.ship.districts.survey.level, 2);
  state = deployProbe(state, 'veyra_photon_ring').state;
  state = deployProbe(state, 'veyra_derelict_echo').state;
  assert.ok(state.discoveries.foundIds.includes('veyra_photon_archive'));
  assert.ok(state.discoveries.foundIds.includes('karak_distress_vector'));
  assert.equal(state.world.systems.karak.discovered, true);
  assert.ok(state.story.completedStepIds.includes('karak_route_open'));
  state = plotCourse(state, 'karak');
  assert.equal(state.route.systemId, 'karak');

  state = deployProbe(state, 'karak_silent_beacons').state;
  assert.equal(state.story.karakInfestationRevealed, true);
  assert.equal(state.world.systems.karak.populationState, 'infested');
  assert.equal(state.world.systems.karak.infestation.active, true);
  assert.equal(state.world.systems.karak.infestation.confirmed, true);
  assert.equal(state.world.systems.karak.infestation.hiveTargetsConfirmed, false);
  const hiveLevelLock = getSurveyEligibility(state, 'karak_hive_scan');
  assert.equal(hiveLevelLock.ok, false);
  assert.ok(codes(hiveLevelLock.issues).includes('SURVEY_LEVEL_REQUIRED'));

  state = upgradeDistrict(state, 'survey');
  state = finishConstruction(state, 3);
  assert.equal(state.ship.districts.survey.level, 3);
  state = deployProbe(state, 'karak_hive_scan').state;
  assert.equal(state.world.systems.karak.infestation.hiveTargetsConfirmed, true);
  assert.equal(state.intelligence.bySystem.karak, 4);
  assert.ok(state.discoveries.foundIds.includes('karak_hive_geometry'));
  assert.ok(state.story.completedStepIds.includes('karak_hive_mapped'));
  assert.equal(state.resources.probes, 2, 'all six authored surveys deplete once');

  state = enqueueConstruction(state, 'mission_ops');
  state = finishConstruction(state, 2);
  state = enqueueConstruction(state, 'research');
  state = finishConstruction(state, 2);
  state = enqueueConstruction(state, 'hangar');
  state = finishConstruction(state, 2);

  const researchLock = getMissionEligibility(state, 'uga_pale_bloom');
  assert.equal(researchLock.eligible, false);
  assert.deepEqual(codes(researchLock.locks), ['RESEARCH_REQUIRED']);
  const research = commitResearch(state, 'uga_brood_containment');
  assert.equal(research.completed, true);
  assert.equal(research.committed, 180);
  state = research.state;
  assert.ok(state.research.completedIds.includes('uga_brood_containment'));
  assert.equal(state.research.allocations.uga, 180);
  assert.equal(getMissionEligibility(state, 'uga_pale_bloom').eligible, true);
  assert.deepEqual(validateDomainState(state), { ok: true, issues: [] });
  return state;
}

function verifyMissionLocksAndProxies(progressionState) {
  const overCapacity = getMissionEligibility(progressionState, 'uga_pale_bloom', {
    deploymentManifest: {
      units: [{ id: 'line_section', count: 5 }],
      structures: [],
      modIds: []
    }
  });
  assert.equal(overCapacity.eligible, false);
  assert.ok(codes(overCapacity.locks).includes('DEPLOYMENT_CAPACITY_EXCEEDED'));
  assert.ok(codes(overCapacity.locks).includes('DEPLOYMENT_UNIT_LIMIT'));

  expectDomainIssue(
    () => beginGroundOperation(progressionState, { missionId: 'uga_pale_bloom', factionId: 'brood' }),
    'FACTION_NOT_HIREABLE'
  );
  expectDomainIssue(
    () => beginGroundOperation(progressionState, { missionId: 'uga_pale_bloom', factionId: 'dominion' }),
    'FACTION_RESIDENCY_REQUIRED'
  );

  const showcase = createShowcaseReadyDomainState();
  assert.deepEqual(validateDomainState(showcase), { ok: true, issues: [] });
  const dominion = beginGroundOperation(showcase, {
    missionId: 'uga_pale_bloom',
    factionId: 'dominion'
  });
  assert.equal(dominion.operation.proxyFactionId, 'dominion');
  assert.equal(dominion.operation.commanderId, 'dominion_toren_vale');
  assert.equal(validateGroundOperation(dominion.operation).ok, true);

  const factionLock = getMissionEligibility(showcase, 'nova_heliograph_wake', { factionId: 'syndicate' });
  assert.equal(factionLock.eligible, false);
  assert.ok(codes(factionLock.locks).includes('MISSION_FACTION_EXCLUSIVE'));
  expectDomainIssue(
    () => beginGroundOperation(showcase, { missionId: 'nova_heliograph_wake', factionId: 'syndicate' }),
    'MISSION_FACTION_EXCLUSIVE'
  );
}

function verifyHostContracts(progressionState) {
  const launch = beginGroundOperation(progressionState, { missionId: 'uga_pale_bloom' });
  assert.equal(launch.operation.deploymentManifest.slotsUsed, 7);
  assert.equal(launch.operation.deploymentManifest.slotCapacity, 8);
  assert.equal(launch.operation.configuration.deploymentManifest.slotsUsed, 7);

  const request = createGroundOperationRequestV1(launch.operation, {
    nonce: 'opaque-test-nonce',
    accountId: progressionState.profileId,
    issuedAt: 10_000,
    ttlMs: 60_000,
    contentVersion: 'exploration-test-v1'
  });
  assert.equal(validateGroundOperationRequestV1(request, {
    accountId: progressionState.profileId,
    now: 20_000
  }).ok, true);
  assert.ok(codes(validateGroundOperationRequestV1(request, { now: 80_001 }).issues).includes('REQUEST_EXPIRED'));

  const tamperedRequest = structuredClone(request);
  tamperedRequest.operation.difficulty = 'tampered';
  assert.ok(codes(validateGroundOperationRequestV1(tamperedRequest, { now: 20_000 }).issues).includes('REQUEST_CHECKSUM_INVALID'));

  const groundResult = simulateGroundResult(launch.operation);
  const result = createGroundOperationResultV1(groundResult, {
    nonce: request.nonce,
    accountId: request.accountId,
    issuedAt: 25_000
  });
  assert.equal(validateGroundOperationResultV1(result, request, { accountId: progressionState.profileId }).ok, true);
  assert.ok(codes(validateGroundOperationResultV1(result, request, { accountId: 'different-account' }).issues).includes('RESULT_ACCOUNT_REJECTED'));

  const manifest = createExplorationContentManifestV1([
    { path: 'src/space_experience.js', bytes: 120, hash: 'sha256-a' },
    { path: 'assets/models/uga.glb', bytes: 480, hash: 'sha256-b' }
  ], { contentVersion: 'exploration-test-v1', compatibleGameRange: '>=1.34.0', installed: false });
  assert.equal(manifest.optional, true);
  assert.equal(manifest.resumable, true);
  assert.equal(manifest.totalBytes, 600);
  assert.equal(manifest.files.length, 2);
}

function verifyAccountProfileIsolation() {
  const campaign = createInitialDomainState();
  const profile = createInitialAccountProfile(campaign.profileId);
  profile.career.experience = 420;
  profile.inventory.craftedMods.survey_link = 2;
  profile.commanders.nova_rhea_voss.level = 5;
  profile.commanders.nova_rhea_voss.experience = 900;
  profile.settings.permanentDeath = true;

  const applied = applyAccountProfile(campaign, normalizeAccountProfile(profile));
  assert.equal(applied.personnel.commanders.nova_rhea_voss.level, 5);
  assert.equal(applied.personnel.commanders.nova_rhea_voss.experience, 900);
  assert.equal(applied.operations.nextSequence, campaign.operations.nextSequence);

  const resetCampaign = createInitialDomainState();
  const preserved = projectAccountProfile(resetCampaign, profile);
  assert.equal(preserved.career.experience, 420, 'campaign reset must preserve account career XP');
  assert.equal(preserved.inventory.craftedMods.survey_link, 2, 'campaign reset must preserve crafted mods');
  assert.equal(preserved.commanders.nova_rhea_voss.level, 5, 'campaign reset must preserve commander progression');
  assert.equal(preserved.settings.permanentDeath, true, 'campaign reset must preserve account difficulty setting');
}

function verifyPendingPersistenceAndResults(progressionState) {
  const returnRoute = structuredClone(progressionState.route);
  const resourcesBeforeLaunch = structuredClone(progressionState.resources);
  const launchA = beginGroundOperation(progressionState, { missionId: 'uga_pale_bloom' });
  const launchB = beginGroundOperation(progressionState, { missionId: 'uga_pale_bloom' });
  assert.deepEqual(launchA.operation, launchB.operation, 'same state and request must produce the same operation');
  const { operation } = launchA;
  assert.equal(operation.sponsorId, 'uga');
  assert.equal(operation.proxyFactionId, 'nova');
  assert.equal(operation.playerFactionId, 'nova');
  assert.equal(operation.opponentFactionId, 'brood');
  assert.equal(operation.battlefield.infestationActive, true);
  assert.deepEqual(operation.battlefield.hiveTargetIds, ['meridian_breeder_nest']);
  assert.deepEqual(operation.returnRoute, returnRoute);
  assert.equal(operation.specialistIds.length, 3);
  assert.equal(new Set(operation.specialistIds).size, 3);
  assert.equal(validateGroundOperation(operation).ok, true);
  assert.equal(launchA.state.operations.pending.operationId, operation.operationId);
  assert.equal(launchA.state.route.scene, 'deployment');
  assert.equal(launchA.state.factions.nova.status, 'deployed');
  assert.equal(launchA.state.personnel.commanders[operation.commanderId].status, 'deployed');
  assert.equal(launchA.state.resources.fuel, resourcesBeforeLaunch.fuel - 8);
  assert.equal(launchA.state.resources.probes, resourcesBeforeLaunch.probes - 1);

  const invalidOperation = structuredClone(operation);
  invalidOperation.opponentFactionId = 'nova';
  const invalidValidation = validateGroundOperation(invalidOperation);
  assert.equal(invalidValidation.ok, false);
  assert.ok(codes(invalidValidation.issues).includes('BROOD_PURGE_INVALID'));

  const memory = createMemoryStorage();
  const writer = new LocalDomainStore({ storage: memory, key: 'massfront-domain-test' });
  const savedPending = writer.save(launchA.state);
  const reader = new LocalDomainStore({ storage: memory, key: 'massfront-domain-test' });
  const reloadedPending = reader.load({ recover: false });
  assert.deepEqual(reloadedPending, savedPending, 'unresolved operation must survive a reload');
  assert.deepEqual(reloadedPending.operations.pending, operation);
  assert.equal(reloadedPending.factions.nova.status, 'deployed');
  assert.equal(validateDomainState(reloadedPending).ok, true);
  assert.ok(codes(getMissionEligibility(reloadedPending, 'uga_pale_bloom').locks).includes('OPERATION_ALREADY_PENDING'));

  const simulatedA = simulateGroundResult(operation);
  const simulatedB = simulateGroundResult(operation);
  assert.deepEqual(simulatedA, simulatedB, 'local result simulation must be deterministic');
  assert.equal(validateGroundResult(operation, simulatedA).ok, true);
  assert.deepEqual(simulatedA.deadPersonnelIds, []);

  const injuredSpecialistId = operation.specialistIds[0];
  const result = createGroundResult(operation, {
    outcome: 'victory',
    score: 88,
    primaryObjectiveComplete: true,
    secondaryObjectivesComplete: 2,
    injuryBand: 'light',
    injuredPersonnelIds: [injuredSpecialistId]
  });
  assert.equal(validateGroundResult(operation, result).ok, true);
  expectDomainIssue(() => createGroundResult(operation, {
    outcome: 'victory',
    score: 88,
    primaryObjectiveComplete: true,
    secondaryObjectivesComplete: 2,
    injuryBand: 'none',
    injuredPersonnelIds: [],
    deadPersonnelIds: [operation.commanderId]
  }), 'PERMANENT_DEATH_UNSUPPORTED');

  const applied = applyGroundResult(reloadedPending, result);
  assert.equal(applied.applied, true);
  assert.equal(applied.reason, 'applied');
  assert.equal(applied.state.operations.pending, null);
  assert.deepEqual(applied.state.route, returnRoute);
  assert.equal(applied.state.missions.uga_pale_bloom.completions, 1);
  assert.equal(applied.state.missions.uga_pale_bloom.lastOutcome, 'victory');
  assert.ok(applied.state.world.systems.karak.infestation.severity < 88);
  assert.equal(applied.state.factions.nova.status, 'recovering');
  assert.equal(applied.state.personnel.specialists[injuredSpecialistId].status, 'recovering');
  assert.equal(applied.state.personnel.specialists[injuredSpecialistId].injury.recoveryCycles, 1);
  assert.ok(applied.state.operations.appliedResultIds.includes(result.resultId));
  assert.equal(applied.state.operations.history.length, 1);

  const resourcesAfterFirstApply = structuredClone(applied.state.resources);
  const duplicate = applyGroundResult(applied.state, result);
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.reason, 'already_applied');
  assert.strictEqual(duplicate.state, applied.state, 'duplicate application returns the unchanged state object');
  assert.deepEqual(duplicate.state.resources, resourcesAfterFirstApply, 'duplicate result must not pay rewards twice');

  const recovered = advanceRecoveryCycles(applied.state, 1);
  assert.equal(recovered.factions.nova.status, 'ready');
  assert.equal(recovered.factions.nova.recoveryCycles, 0);
  assert.equal(recovered.personnel.specialists[injuredSpecialistId].status, 'ready');
  assert.equal(recovered.personnel.specialists[injuredSpecialistId].injury, null);

  const savedResolved = writer.save(recovered);
  const resolvedReload = reader.load({ recover: false });
  assert.deepEqual(resolvedReload, savedResolved);
  assert.equal(resolvedReload.operations.pending, null);
  assert.equal(resolvedReload.operations.appliedResultIds.length, 1);
  assert.equal(resolvedReload.operations.history.length, 1);
  const duplicateAfterReload = applyGroundResult(resolvedReload, result);
  assert.equal(duplicateAfterReload.applied, false);
  assert.equal(duplicateAfterReload.reason, 'already_applied');
}

function verifyVersionedMigration() {
  const migrated = migrateDomainState({
    schemaVersion: 1,
    currentSystemId: 'nordhall',
    resources: { science: 317, bioSamples: 11, requisition: 9400 },
    factionStatus: { nova: 'ready', dominion: 'ready' },
    completedResearchIds: ['spectral_cartography'],
    operationSequence: 7
  });
  assert.equal(migrated.schemaVersion, DOMAIN_STATE_SCHEMA_VERSION);
  assert.equal(migrated.route.systemId, 'karak');
  assert.equal(migrated.world.systems.karak.discovered, true);
  assert.equal(migrated.resources.researchPoints, 317);
  assert.equal(migrated.resources.bioSamples, 11);
  assert.equal(migrated.resources.credits, 9400);
  assert.equal(migrated.factions.dominion.resident, true);
  assert.equal(migrated.personnel.commanders.dominion_toren_vale.status, 'ready');
  assert.ok(migrated.research.completedIds.includes('universal_spectral_cartography'));
  assert.equal(migrated.operations.nextSequence, 7);
  assert.ok(Object.values(migrated.ship.districts).every(district => district.commissioned), 'Legacy rooms remain commissioned');
  assert.equal(migrated.ship.districts.command.level, 3);
  assert.equal(validateDomainState(migrated).ok, true);

  const schemaThree = createShowcaseReadyDomainState();
  schemaThree.schemaVersion = 3;
  delete schemaThree.ship.expeditionCycle;
  delete schemaThree.ship.constructionQueue;
  delete schemaThree.ship.processedCycleEventIds;
  for (const district of Object.values(schemaThree.ship.districts)) {
    delete district.commissioned;
    delete district.facilities;
    delete district.facilityOffline;
  }
  const migratedThree = migrateDomainState(schemaThree);
  assert.equal(migratedThree.ship.districts.research.facilities.tier2, 'research_t2_gravitic_computation');
  assert.equal(migratedThree.ship.districts.research.facilities.tier3, 'research_t3_frontier_institute');
}

function verifyClassicModeIsolation(progressionState) {
  const before = structuredClone(progressionState);
  const next = simulateClassicModeLaunch(progressionState, 'mmo_warfront', {
    difficulty: 'crisis',
    forceScale: 'massive',
    simulationOnly: true,
    localOnly: true,
    affectsExplorationProgression: false
  });
  assert.deepEqual(progressionState, before, 'Classic simulation must not mutate its input state');
  assert.equal(next.classicModes.lastSimulation.modeId, 'mmo_warfront');
  assert.equal(next.classicModes.lastSimulation.simulated, true);
  assert.equal(next.revision, before.revision + 1);
  const beforeProgression = structuredClone(before);
  const afterProgression = structuredClone(next);
  delete beforeProgression.classicModes;
  delete afterProgression.classicModes;
  delete beforeProgression.revision;
  delete afterProgression.revision;
  assert.deepEqual(afterProgression, beforeProgression,
    'Classic launch must not change resources, research, personnel, missions, surveys, or world state');
}

function verifyBaseManagementAndStaffing() {
  const state = createInitialDomainState();

  // Test Power Grid calculation
  const initialPower = calculatePowerGridStatus(state);
  assert.equal(initialPower.totalGeneratedMW, 160, 'Initial Engineering level 1 generates 160 MW');
  assert.ok(initialPower.totalConsumedMW > 0, 'Initial consumed MW must be positive');
  assert.equal(initialPower.isBrownout, false, 'Initial state should not be in brownout');
  assert.ok(initialPower.surplusMW > 0, 'Initial state should have power surplus');

  // Test Ship Exploration Rating
  const initialRating = calculateShipExplorationRating(state);
  assert.ok(initialRating.rating >= 10, 'Initial ship rating must be at least 10');
  assert.ok(initialRating.className.includes('Exploration'), 'Initial rating should remain an exploration class');

  // Test Adjacency Synergies
  const initialSynergies = calculateAdjacencySynergies(state);
  assert.ok(Array.isArray(initialSynergies), 'Synergies must be an array');
  assert.equal(initialSynergies.length, 0, 'Adjacency remains inactive until both commissioned districts reach Tier 2');

  // Test Specialist Staffing in District Sockets
  // Ilan is Nova (unlocked initially)
  const staffedState = assignSpecialistToDistrict(state, 'survey', 0, 'nova_scout_ilan');
  assert.equal(staffedState.ship.districts.survey.staff[0], 'nova_scout_ilan', 'Ilan must be stationed in survey slot 0');

  // Re-assigning Ilan to commissioned navigation slot 0 should move him and clear survey slot 0
  const movedState = assignSpecialistToDistrict(staffedState, 'navigation', 0, 'nova_scout_ilan');
  assert.equal(movedState.ship.districts.navigation.staff[0], 'nova_scout_ilan', 'Ilan moved to navigation');
  assert.equal(movedState.ship.districts.survey.staff[0], null, 'Survey slot 0 cleared upon re-assignment');

  // Unassigning specialist
  const unassignedState = unassignSpecialist(movedState, 'navigation', 0);
  assert.equal(unassignedState.ship.districts.navigation.staff[0], null, 'Navigation staff slot cleared');

  expectDomainIssue(() => assignSpecialistToDistrict(state, 'hangar', 0, 'nova_scout_ilan'), 'DISTRICT_NOT_COMMISSIONED');

  // Assigning locked specialist must fail
  expectDomainIssue(() => {
    assignSpecialistToDistrict(state, 'engineering', 0, 'dominion_tech_vesk');
  }, 'SPECIALIST_LOCKED');
}

function verifyConstructionSystem() {
  const initial = createInitialDomainState();
  const commissioned = Object.entries(initial.ship.districts).filter(([, district]) => district.commissioned).map(([id]) => id);
  assert.deepEqual(commissioned, ['command', 'navigation', 'survey', 'engineering', 'habitat', 'logistics']);
  assert.equal(initial.ship.expeditionCycle, 0);
  assert.deepEqual(initial.ship.constructionQueue, []);
  assert.equal(getConstructionCapacity(initial), 1);

  const commissionQuote = getConstructionQuote(initial, 'research');
  assert.equal(commissionQuote.ok, true);
  assert.equal(commissionQuote.workRequired, 2);
  let state = enqueueConstruction(initial, 'research');
  assert.equal(state.ship.constructionQueue.length, 1);
  const duplicate = advanceExpeditionCycles(state, 1, 'commission-research', 'survey');
  assert.equal(duplicate.advanced, true);
  const once = duplicate.state;
  const duplicateResult = advanceExpeditionCycles(once, 1, 'commission-research', 'survey');
  assert.equal(duplicateResult.advanced, false);
  assert.equal(duplicateResult.state.ship.expeditionCycle, once.ship.expeditionCycle);
  state = advanceExpeditionCycles(once, 1, 'commission-research-finish', 'survey').state;
  assert.equal(state.ship.districts.research.commissioned, true);
  assert.equal(state.ship.districts.research.facilities.tier1, 'research_tier1_core');

  const facilityId = 'research_t2_gravitic_computation';
  assert.equal(CONSTRUCTION_FACILITY_CATALOG[facilityId].effects.researchProgressPct, 20);
  state.resources.credits = 99999;
  state.resources.alloys = 9999;
  state.resources.components = 9999;
  state = enqueueConstruction(state, 'research', facilityId);
  const queuedStatus = getConstructionStatus(state);
  assert.equal(queuedStatus.queue.length, 1);
  state = finishConstruction(state, 2);
  assert.equal(state.ship.districts.research.level, 2);
  assert.equal(state.ship.districts.research.facilities.tier2, facilityId);

  const beforeProgress = state.resources.researchPoints;
  const beforeNodeProgress = state.research.progressById.universal_spectral_cartography;
  const research = commitResearch(state, 'universal_spectral_cartography', 10);
  assert.equal(research.state.resources.researchPoints, beforeProgress - 10);
  assert.equal(research.state.research.progressById.universal_spectral_cartography, beforeNodeProgress + 12,
    'Gravitic Computation applies deterministic +20% research progress');

  state.research.completedIds.push('uga_brood_containment');
  state.research.progressById.uga_brood_containment = 180;
  expectDomainIssue(() => commitResearch(state, 'uga_trauma_recovery'), 'ADVANCED_CONTAINMENT_REQUIRED');
  state.resources.bioSamples = 100;
  state = enqueueConstruction(state, 'research', 'research_t3_containment_institute');
  state = finishConstruction(state, 3);
  const containmentResearch = commitResearch(state, 'uga_trauma_recovery');
  assert.equal(containmentResearch.completed, true);
  assert.equal(containmentResearch.bioSamplesSpent, 24, 'Containment Institute discounts the 32 bio-sample completion cost by 25%');
  state = containmentResearch.state;

  state = enqueueConstruction(state, 'research', 'research_t2_xenology_directorate');
  assert.equal(state.ship.districts.research.facilityOffline.tier2, true);
  const job = state.ship.constructionQueue[0];
  const beforeCancel = state.resources.credits;
  state = cancelConstruction(state, job.id);
  assert.equal(state.ship.districts.research.facilityOffline.tier2, false);
  assert.equal(state.ship.districts.research.facilities.tier2, facilityId);
  assert.equal(state.resources.credits, beforeCancel + Math.floor(job.reservedCost.credits * 0.8));

  let fabricatorState = createInitialDomainState();
  fabricatorState.resources.credits = 99999;
  fabricatorState.resources.alloys = 9999;
  fabricatorState.resources.components = 9999;
  fabricatorState = enqueueConstruction(fabricatorState, 'fabricator');
  fabricatorState = finishConstruction(fabricatorState, 2);
  assert.equal(getConstructionCapacity(fabricatorState), 1);
  fabricatorState = enqueueConstruction(fabricatorState, 'fabricator', 'fabricator_t2_precision_forge');
  fabricatorState = finishConstruction(fabricatorState, 2);
  assert.equal(getConstructionCapacity(fabricatorState), 2);
  fabricatorState = enqueueConstruction(fabricatorState, 'fabricator', 'fabricator_t3_megaship_yards');
  fabricatorState = finishConstruction(fabricatorState, 3);
  assert.equal(getConstructionCapacity(fabricatorState), 4, 'Tier-3 Fabricator plus Megaship Yards authorizes four active jobs');

  let fullQueue = createInitialDomainState();
  fullQueue.resources.credits = 99999;
  fullQueue.resources.alloys = 9999;
  fullQueue.resources.components = 9999;
  for (const districtId of ['mission_ops', 'research', 'fabricator', 'factions', 'hangar', 'navigation']) {
    const facilityId = fullQueue.ship.districts[districtId].commissioned ? Object.values(CONSTRUCTION_FACILITY_CATALOG).find(entry => entry.districtId === districtId && entry.tier === 2)?.id : null;
    fullQueue = enqueueConstruction(fullQueue, districtId, facilityId);
  }
  assert.equal(fullQueue.ship.constructionQueue.length, 6);
  assert.equal(getConstructionQuote(fullQueue, 'survey', 'survey_t2_probe_telemetry').issues[0].code, 'CONSTRUCTION_QUEUE_FULL');

  // Every authored specialization must survive the same authoritative quote,
  // enqueue, cycle-completion and persistence path. This catches catalog-only
  // choices that accidentally render in the sheet but cannot be constructed.
  for (const facility of Object.values(CONSTRUCTION_FACILITY_CATALOG).filter(entry => entry.tier > 1)) {
    let choiceState = createInitialDomainState();
    choiceState.resources.credits = 99999;
    choiceState.resources.alloys = 9999;
    choiceState.resources.components = 9999;
    choiceState.resources.bioSamples = 9999;
    if (!choiceState.ship.districts[facility.districtId].commissioned) {
      choiceState = enqueueConstruction(choiceState, facility.districtId);
      choiceState = finishConstruction(choiceState, 2);
    }
    if (facility.tier === 3) {
      const prerequisiteChoice = Object.values(CONSTRUCTION_FACILITY_CATALOG)
        .find(entry => entry.districtId === facility.districtId && entry.tier === 2);
      choiceState = enqueueConstruction(choiceState, facility.districtId, prerequisiteChoice.id);
      choiceState = finishConstruction(choiceState, 2);
    }
    const quote = getConstructionQuote(choiceState, facility.districtId, facility.id);
    assert.equal(quote.ok, true, `${facility.id} must produce a valid authoritative quote`);
    choiceState = enqueueConstruction(choiceState, facility.districtId, facility.id);
    choiceState = finishConstruction(choiceState, facility.tier === 3 ? 3 : 2);
    assert.equal(choiceState.ship.districts[facility.districtId].facilities[`tier${facility.tier}`], facility.id,
      `${facility.id} must install after deterministic cycle completion`);
  }
}

function run() {
  verifyLockedCatalog();
  verifyBaseManagementAndStaffing();
  verifyConstructionSystem();
  const progressionState = completeAelosVeyraKarakChain();
  verifyMissionLocksAndProxies(progressionState);
  verifyHostContracts(progressionState);
  verifyAccountProfileIsolation();
  verifyPendingPersistenceAndResults(progressionState);
  verifyClassicModeIsolation(progressionState);
  verifyVersionedMigration();
  console.log('space exploration domain tests: PASS');
}

run();
