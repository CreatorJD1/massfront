import {
  COMMANDER_CATALOG,
  DEPLOYMENT_STRUCTURE_CATALOG,
  DEPLOYMENT_UNIT_CATALOG,
  DOCTRINE_CATALOG,
  FACTION_CATALOG,
  MISSION_CATALOG,
  OPERATION_MOD_CATALOG,
  RESIDENT_FACTION_IDS,
  SITE_CATALOG,
  SPECIALIST_CATALOG,
  SUPPORT_CATALOG
} from './catalog.js';
import { deepClone, deepFreeze, deterministicId, hash32, stableStringify } from './deterministic.js';
import { DomainValidationError, issue } from './errors.js';
import { calculateFacilityCapabilities } from './construction.js';
import {
  assertDomainState,
  getReadyCommanderIds,
  getReadySpecialistIds,
  validateDomainState
} from './state_store.js';

export const GROUND_OPERATION_SCHEMA_VERSION = 2;

function mergeCosts(...costs) {
  const result = {};
  for (const cost of costs) {
    for (const [key, amount] of Object.entries(cost || {})) result[key] = (result[key] || 0) + amount;
  }
  return result;
}

function operationIdentity(fields) {
  const identity = {
    schemaVersion: GROUND_OPERATION_SCHEMA_VERSION,
    profileId: fields.profileId,
    sequence: fields.sequence,
    launchRevision: fields.launchRevision,
    missionId: fields.missionId,
    missionType: fields.missionType,
    systemId: fields.systemId,
    siteId: fields.siteId,
    sponsorId: fields.sponsorId,
    contractFactionId: fields.contractFactionId,
    proxyFactionId: fields.proxyFactionId,
    opponentFactionId: fields.opponentFactionId,
    commanderId: fields.commanderId,
    specialistIds: fields.specialistIds,
    doctrineId: fields.doctrineId,
    supportId: fields.supportId,
    landingZoneId: fields.landingZoneId,
    difficulty: fields.difficulty,
    intelligence: fields.intelligence,
    battlefield: fields.battlefield,
    factionSnapshot: fields.factionSnapshot,
    personnelSnapshot: fields.personnelSnapshot,
    deploymentCost: fields.deploymentCost,
    returnRoute: fields.returnRoute
  };
  // Preserve deterministic IDs for already-saved schema-v2 operations while
  // making the new sized manifest authoritative for every new launch.
  if (fields.deploymentManifest) identity.deploymentManifest = fields.deploymentManifest;
  if (fields.configuration?.facilityEffects) identity.facilityEffects = fields.configuration.facilityEffects;
  return identity;
}

function expectedOperationId(fields) {
  return `gop_${String(fields.sequence).padStart(4, '0')}_${hash32(operationIdentity(fields))}`;
}

function expectedResultSeed(fields) {
  return deterministicId('seed', { operationId: fields.operationId, missionId: fields.missionId, siteId: fields.siteId });
}

function expectedReturnToken(fields) {
  return deterministicId('return', { operationId: fields.operationId, profileId: fields.profileId, returnRoute: fields.returnRoute });
}

function residentReady(state, factionId, mission) {
  const faction = state.factions?.[factionId];
  return Boolean(
    RESIDENT_FACTION_IDS.includes(factionId) &&
    FACTION_CATALOG[factionId]?.hireable &&
    faction?.resident &&
    faction.status === 'ready' &&
    faction.recoveryCycles === 0 &&
    faction.readiness >= mission.requiredReadiness
  );
}

function candidateFactionIds(state, mission) {
  if (mission.access.type === 'faction_exclusive') return [mission.access.factionId];
  return RESIDENT_FACTION_IDS.filter(factionId => residentReady(state, factionId, mission));
}

function normalizeManifestEntries(entries, catalog, allowedIds) {
  const counts = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const id = typeof entry === 'string' ? entry : entry?.id;
    if (!catalog[id] || !allowedIds.includes(id)) continue;
    const count = Math.max(1, Math.min(8, Math.floor(Number(typeof entry === 'string' ? 1 : entry.count) || 1)));
    counts.set(id, Math.min(8, (counts.get(id) || 0) + count));
  }
  return [...counts.entries()].map(([id, count]) => ({ id, count, slotCost: catalog[id].slotCost }));
}

function resolveDeploymentManifest(state, mission, request = {}) {
  const effects = state ? calculateFacilityCapabilities(state) : request.facilityEffects || {};
  const capacity = {
    ...mission.deploymentCapacity,
    slots: mission.deploymentCapacity.slots + (effects.deploymentSlots || 0),
    modLimit: mission.deploymentCapacity.modLimit + (effects.operationModSlots || 0)
  };
  const source = request.deploymentManifest || {};
  const defaultUnits = [{ id: 'recon_team', count: 1 }, { id: 'line_section', count: 1 }, { id: 'armored_element', count: 1 }];
  const defaultStructures = [{ id: 'field_relay', count: 1 }];
  const units = normalizeManifestEntries(source.units || request.units || defaultUnits, DEPLOYMENT_UNIT_CATALOG, capacity.allowedUnitIds);
  const structures = normalizeManifestEntries(source.structures || request.structures || defaultStructures, DEPLOYMENT_STRUCTURE_CATALOG, capacity.allowedStructureIds);
  const modIds = [...new Set((source.modIds || request.modIds || ['survey_link']).filter(id => capacity.allowedModIds.includes(id) && OPERATION_MOD_CATALOG[id]))];
  const slotsUsed = [...units, ...structures].reduce((sum, entry) => sum + entry.slotCost * entry.count, 0);
  return {
    slotCapacity: capacity.slots,
    slotsUsed,
    units,
    structures,
    modIds,
    unitLimit: capacity.unitLimit,
    structureLimit: capacity.structureLimit,
    modLimit: capacity.modLimit
  };
}

function pushManifestLocks(mission, manifest, locks) {
  if (manifest.slotsUsed > manifest.slotCapacity) locks.push(issue('DEPLOYMENT_CAPACITY_EXCEEDED', `Deployment uses ${manifest.slotsUsed} of ${manifest.slotCapacity} available slots.`, 'deploymentManifest'));
  if (manifest.units.reduce((sum, entry) => sum + entry.count, 0) > manifest.unitLimit) locks.push(issue('DEPLOYMENT_UNIT_LIMIT', `Mission allows at most ${manifest.unitLimit} starting unit groups.`, 'deploymentManifest.units'));
  if (manifest.structures.reduce((sum, entry) => sum + entry.count, 0) > manifest.structureLimit) locks.push(issue('DEPLOYMENT_STRUCTURE_LIMIT', `Mission allows at most ${manifest.structureLimit} starting structures.`, 'deploymentManifest.structures'));
  if (manifest.modIds.length > manifest.modLimit) locks.push(issue('DEPLOYMENT_MOD_LIMIT', `Mission allows at most ${manifest.modLimit} operation mods.`, 'deploymentManifest.modIds'));
  for (const requiredId of mission.deploymentCapacity.requiredUnitIds) {
    if (!manifest.units.some(entry => entry.id === requiredId && entry.count > 0)) locks.push(issue('DEPLOYMENT_REQUIRED_UNIT', `${DEPLOYMENT_UNIT_CATALOG[requiredId].name} is required for this operation.`, 'deploymentManifest.units'));
  }
  if (!manifest.units.length) locks.push(issue('DEPLOYMENT_EMPTY', 'Select at least one starting unit group.', 'deploymentManifest.units'));
}

function resolveRequest(state, mission, request) {
  const requestedFactionId = request.proxyFactionId || request.factionId || null;
  const expectedFactionId = mission.access.type === 'faction_exclusive' ? mission.access.factionId : null;
  const proxyFactionId = requestedFactionId || expectedFactionId || candidateFactionIds(state, mission)[0] || null;
  const commanderId = request.commanderId || getReadyCommanderIds(state, proxyFactionId)[0] || null;
  const specialistIds = Array.isArray(request.specialistIds)
    ? [...request.specialistIds]
    : getReadySpecialistIds(state, proxyFactionId).slice(0, 3);
  const doctrineId = request.doctrineId || request.doctrine || request.approach || mission.recommendedDoctrineId;
  const supportId = request.supportId || request.support || mission.supportIds[0];
  const landingZoneId = request.landingZoneId || mission.landingZoneIds[0];
  const deploymentManifest = resolveDeploymentManifest(state, mission, request);
  return { requestedFactionId, expectedFactionId, proxyFactionId, commanderId, specialistIds, doctrineId, supportId, landingZoneId, deploymentManifest };
}

function pushEligibilityLocks(state, mission, resolved, locks) {
  if (state.operations?.pending) locks.push(issue('OPERATION_ALREADY_PENDING', 'Resolve or cancel the pending operation before launching another.', 'operations.pending'));
  if (state.ship?.districts?.mission_ops?.commissioned === false) locks.push(issue('MISSION_OPS_NOT_COMMISSIONED', 'Mission Operations must be commissioned.', 'ship.districts.mission_ops.commissioned'));
  if (state.ship?.districts?.hangar?.commissioned === false) locks.push(issue('HANGAR_NOT_COMMISSIONED', 'Strike Bay must be commissioned.', 'ship.districts.hangar.commissioned'));
  if (!state.world?.systems?.[mission.systemId]?.discovered) locks.push(issue('SYSTEM_UNDISCOVERED', 'The mission system has not been discovered.', `world.systems.${mission.systemId}.discovered`));
  if (state.ship?.districts?.hangar?.level < mission.requiredHangarLevel) locks.push(issue('HANGAR_LEVEL_REQUIRED', `Deployment Hangar level ${mission.requiredHangarLevel} is required.`, 'ship.districts.hangar.level'));
  if ((state.intelligence?.bySystem?.[mission.systemId] || 0) < mission.requirements.intelligence) locks.push(issue('INTELLIGENCE_REQUIRED', `Mission requires intelligence level ${mission.requirements.intelligence}.`, `intelligence.bySystem.${mission.systemId}`));
  for (const discoveryId of mission.requirements.discoveryIds || []) {
    if (!state.discoveries?.foundIds?.includes(discoveryId)) locks.push(issue('DISCOVERY_REQUIRED', `Required discovery has not been found: ${discoveryId}.`, 'discoveries.foundIds'));
  }
  for (const researchId of mission.requirements.researchIds || []) {
    if (!state.research?.completedIds?.includes(researchId)) locks.push(issue('RESEARCH_REQUIRED', `Required research is incomplete: ${researchId}.`, 'research.completedIds'));
  }
  for (const completedMissionId of mission.requirements.completedMissionIds || []) {
    if ((state.missions?.[completedMissionId]?.completions || 0) < 1) locks.push(issue('PRIOR_MISSION_REQUIRED', `Complete ${MISSION_CATALOG[completedMissionId].title} first.`, `missions.${completedMissionId}.completions`));
  }

  if (resolved.requestedFactionId && !RESIDENT_FACTION_IDS.includes(resolved.requestedFactionId)) locks.push(issue('FACTION_NOT_HIREABLE', 'UGA operations require a hireable resident proxy; Brood can never be hired.', 'factionId'));
  if (mission.access.type === 'faction_exclusive' && resolved.requestedFactionId && resolved.requestedFactionId !== resolved.expectedFactionId) locks.push(issue('MISSION_FACTION_EXCLUSIVE', `${mission.title} requires ${FACTION_CATALOG[resolved.expectedFactionId].name}.`, 'factionId'));
  if (!resolved.proxyFactionId || !state.factions?.[resolved.proxyFactionId]?.resident) locks.push(issue('FACTION_RESIDENCY_REQUIRED', 'Mission requires a permanent resident faction.', `factions.${resolved.proxyFactionId || 'unknown'}.resident`));
  else if (!residentReady(state, resolved.proxyFactionId, mission)) locks.push(issue('FACTION_NOT_READY', `${FACTION_CATALOG[resolved.proxyFactionId].name} is not ready to deploy.`, `factions.${resolved.proxyFactionId}.status`));

  const commanderDefinition = COMMANDER_CATALOG[resolved.commanderId];
  const commanderState = state.personnel?.commanders?.[resolved.commanderId];
  if (!commanderDefinition || commanderDefinition.factionId !== resolved.proxyFactionId) locks.push(issue('COMMANDER_INVALID', 'Select a commander belonging to the proxy faction.', 'commanderId'));
  else if (commanderState?.status !== 'ready' || commanderState.injury) locks.push(issue('COMMANDER_NOT_READY', 'Selected commander is deployed, injured, or recovering.', `personnel.commanders.${resolved.commanderId}`));
  else {
    if (commanderState.readiness < mission.requiredReadiness) locks.push(issue('COMMANDER_READINESS_REQUIRED', `Commander requires ${mission.requiredReadiness} readiness.`, `personnel.commanders.${resolved.commanderId}.readiness`));
    if (commanderState.loyalty < mission.requiredLoyalty) locks.push(issue('COMMANDER_LOYALTY_REQUIRED', `Commander requires ${mission.requiredLoyalty} loyalty.`, `personnel.commanders.${resolved.commanderId}.loyalty`));
  }

  if (resolved.specialistIds.length !== 3 || new Set(resolved.specialistIds).size !== 3) locks.push(issue('SPECIALIST_COUNT_INVALID', 'Select exactly three unique specialists.', 'specialistIds'));
  let crossFactionCount = 0;
  const crossFactionLimit = calculateFacilityCapabilities(state).crossFactionSpecialists || 0;
  for (const specialistId of resolved.specialistIds) {
    const definition = SPECIALIST_CATALOG[specialistId];
    const specialist = state.personnel?.specialists?.[specialistId];
    if (!definition) {
      locks.push(issue('SPECIALIST_INVALID', 'Selected specialist is unknown.', `specialistIds.${specialistId}`));
      continue;
    }
    if (definition.factionId !== resolved.proxyFactionId) {
      crossFactionCount += 1;
      if (crossFactionCount > crossFactionLimit || !state.factions?.[definition.factionId]?.resident) locks.push(issue('SPECIALIST_INVALID', 'Joint Command permits only one ready specialist from another resident faction.', `specialistIds.${specialistId}`));
    }
    if (specialist?.status !== 'ready' || specialist.injury || specialist.readiness < 50) locks.push(issue('SPECIALIST_NOT_READY', `${definition.name} is not ready to deploy.`, `personnel.specialists.${specialistId}`));
  }

  if (!mission.doctrineIds.includes(resolved.doctrineId) || !DOCTRINE_CATALOG[resolved.doctrineId]) locks.push(issue('DOCTRINE_INVALID', 'Selected operational doctrine is not allowed.', 'doctrineId'));
  const support = SUPPORT_CATALOG[resolved.supportId];
  if (!mission.supportIds.includes(resolved.supportId) || !support) locks.push(issue('SUPPORT_INVALID', 'Selected support package is not allowed.', 'supportId'));
  else if (state.ship.districts.hangar.level < support.minimumHangarLevel) locks.push(issue('SUPPORT_HANGAR_LEVEL_REQUIRED', `${support.name} requires Deployment Hangar level ${support.minimumHangarLevel}.`, 'ship.districts.hangar.level'));
  if (!mission.landingZoneIds.includes(resolved.landingZoneId)) locks.push(issue('LANDING_ZONE_INVALID', 'Selected landing zone is not available.', 'landingZoneId'));
  pushManifestLocks(mission, resolved.deploymentManifest, locks);

  if (mission.missionType === 'uga_brood_purge') {
    const infestation = state.world?.systems?.[mission.systemId]?.infestation;
    const site = SITE_CATALOG[mission.siteId];
    if (!infestation?.active || !infestation.confirmed) locks.push(issue('ACTIVE_INFESTATION_REQUIRED', 'UGA Brood operation requires a confirmed active infestation.', `world.systems.${mission.systemId}.infestation`));
    if (!infestation?.hiveTargetsConfirmed) locks.push(issue('HIVE_INTELLIGENCE_REQUIRED', 'Confirmed hive target geometry is required.', `world.systems.${mission.systemId}.infestation.hiveTargetsConfirmed`));
    if (mission.opponentFactionId !== 'brood' || !FACTION_CATALOG.brood.hostile || mission.objective?.type !== 'purge_brood' || !mission.objective?.infestation) locks.push(issue('BROOD_PURGE_CATALOG_INVALID', 'UGA Brood contract violates purge invariants.', 'missionId'));
    if (!mission.objective.hiveTargetIds.length || mission.objective.hiveTargetIds.some(targetId => !site?.hiveTargetIds.includes(targetId))) locks.push(issue('HIVE_TARGET_INVALID', 'UGA Brood operation requires valid hive targets.', 'missionId'));
  }

  const deploymentCost = mergeCosts(mission.baseDeploymentCost, SUPPORT_CATALOG[resolved.supportId]?.cost);
  for (const [key, amount] of Object.entries(deploymentCost)) {
    if ((state.resources?.[key] || 0) < amount) locks.push(issue('RESOURCE_SHORTAGE', `Deployment requires ${amount} ${key}.`, `resources.${key}`));
  }
}

export function getMissionEligibility(state, missionId, request = {}) {
  const stateValidation = validateDomainState(state);
  const mission = MISSION_CATALOG[missionId];
  if (!mission) return { ok: false, eligible: false, locks: [...stateValidation.issues, issue('MISSION_UNKNOWN', 'Unknown mission.', 'missionId')], mission: null, defaults: null };
  const resolved = resolveRequest(state, mission, request);
  const locks = [...stateValidation.issues];
  pushEligibilityLocks(state, mission, resolved, locks);
  return {
    ok: locks.length === 0,
    eligible: locks.length === 0,
    locks,
    mission,
    defaults: {
      proxyFactionId: resolved.proxyFactionId,
      commanderId: resolved.commanderId,
      specialistIds: [...resolved.specialistIds],
      doctrineId: resolved.doctrineId,
      supportId: resolved.supportId,
      landingZoneId: resolved.landingZoneId,
      deploymentManifest: deepClone(resolved.deploymentManifest)
    }
  };
}

export function validateGroundOperationRequest(state, request = {}) {
  const eligibility = getMissionEligibility(state, request.missionId, request);
  return {
    ok: eligibility.ok,
    issues: eligibility.locks,
    resolved: eligibility.ok ? { mission: eligibility.mission, ...eligibility.defaults } : null
  };
}

export function createGroundOperation(state, request = {}) {
  const validation = validateGroundOperationRequest(state, request);
  if (!validation.ok) throw new DomainValidationError('Ground operation request is invalid.', validation.issues, 'GROUND_OPERATION_REQUEST_INVALID');
  const { mission, proxyFactionId, commanderId, specialistIds, doctrineId, supportId, landingZoneId, deploymentManifest } = validation.resolved;
  const site = SITE_CATALOG[mission.siteId];
  const faction = state.factions[proxyFactionId];
  const commander = state.personnel.commanders[commanderId];
  const intelligenceEvidence = state.intelligence.evidenceIds.filter(id => state.discoveries.foundIds.includes(id));
  const infestation = state.world.systems[mission.systemId].infestation;
  const personnelSnapshot = {
    commander: {
      id: commanderId,
      level: commander.level,
      experience: commander.experience,
      readiness: commander.readiness,
      loyalty: commander.loyalty,
      trait: COMMANDER_CATALOG[commanderId].trait
    },
    specialists: specialistIds.map(id => ({
      id,
      role: SPECIALIST_CATALOG[id].role,
      rating: SPECIALIST_CATALOG[id].rating,
      readiness: state.personnel.specialists[id].readiness,
      loyalty: state.personnel.specialists[id].loyalty
    }))
  };
  const operation = {
    schemaVersion: GROUND_OPERATION_SCHEMA_VERSION,
    kind: 'GroundOperation',
    profileId: state.profileId,
    sequence: state.operations.nextSequence,
    launchRevision: state.revision,
    missionId: mission.id,
    missionType: mission.missionType,
    systemId: mission.systemId,
    siteId: mission.siteId,
    sponsorId: mission.sponsorId,
    contractFactionId: mission.contractFactionId,
    proxyFactionId,
    playerFactionId: proxyFactionId,
    opponentFactionId: mission.opponentFactionId,
    commanderId,
    specialistIds: [...specialistIds],
    doctrineId,
    supportId,
    landingZoneId,
    configuration: {
      doctrineId,
      approach: doctrineId,
      supportId,
      support: supportId,
      landingZoneId,
      deploymentManifest: deepClone(deploymentManifest),
      facilityEffects: deepClone(calculateFacilityCapabilities(state))
    },
    objective: deepClone(mission.objective),
    difficulty: mission.difficulty,
    intelligence: {
      level: state.intelligence.bySystem[mission.systemId],
      evidenceIds: [...intelligenceEvidence],
      discoveryIds: mission.requirements.discoveryIds.filter(id => state.discoveries.foundIds.includes(id))
    },
    battlefield: {
      terrain: site.biome,
      hazards: [...site.hazards],
      threat: mission.missionType === 'uga_brood_purge' ? infestation.severity : mission.difficulty * 14,
      infestationActive: mission.missionType === 'uga_brood_purge' ? infestation.active : false,
      hiveTargetIds: mission.missionType === 'uga_brood_purge' ? [...mission.objective.hiveTargetIds] : [],
      landingZoneId
    },
    scanTierAtLaunch: state.ship.districts.survey.level,
    threatAtLaunch: mission.missionType === 'uga_brood_purge' ? infestation.severity : mission.difficulty * 14,
    factionSnapshot: {
      reputation: faction.reputation,
      loyalty: faction.loyalty,
      readiness: faction.readiness,
      recoveryCycles: faction.recoveryCycles
    },
    personnelSnapshot,
    deploymentManifest: deepClone(deploymentManifest),
    deploymentCost: mergeCosts(mission.baseDeploymentCost, SUPPORT_CATALOG[supportId].cost),
    rewardPlan: deepClone(mission.rewards),
    returnRoute: deepClone(state.route)
  };
  operation.operationId = expectedOperationId(operation);
  operation.resultSeed = expectedResultSeed(operation);
  operation.returnToken = expectedReturnToken(operation);
  const operationValidation = validateGroundOperation(operation);
  if (!operationValidation.ok) throw new DomainValidationError('Generated GroundOperation failed validation.', operationValidation.issues);
  return deepFreeze(operation);
}

export function validateGroundOperation(operation) {
  const issues = [];
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return { ok: false, issues: [issue('GROUND_OPERATION_NOT_OBJECT', 'GroundOperation must be an object.')] };
  const mission = MISSION_CATALOG[operation.missionId];
  const site = SITE_CATALOG[operation.siteId];
  if (operation.schemaVersion !== GROUND_OPERATION_SCHEMA_VERSION || operation.kind !== 'GroundOperation') issues.push(issue('GROUND_OPERATION_VERSION_INVALID', 'GroundOperation schema or kind is invalid.'));
  if (!mission) issues.push(issue('MISSION_UNKNOWN', 'GroundOperation mission is unknown.', 'missionId'));
  if (!site) issues.push(issue('SITE_UNKNOWN', 'GroundOperation site is unknown.', 'siteId'));
  if (!Number.isInteger(operation.sequence) || operation.sequence < 1) issues.push(issue('OPERATION_SEQUENCE_INVALID', 'GroundOperation sequence must be positive.', 'sequence'));
  if (!Number.isInteger(operation.launchRevision) || operation.launchRevision < 0) issues.push(issue('OPERATION_REVISION_INVALID', 'GroundOperation launch revision must be non-negative.', 'launchRevision'));
  if (typeof operation.profileId !== 'string' || !operation.profileId) issues.push(issue('PROFILE_ID_INVALID', 'GroundOperation profile ID is required.', 'profileId'));
  if (!RESIDENT_FACTION_IDS.includes(operation.proxyFactionId) || !FACTION_CATALOG[operation.proxyFactionId]?.hireable || operation.playerFactionId !== operation.proxyFactionId) issues.push(issue('PROXY_FACTION_INVALID', 'GroundOperation proxy must be a hireable resident faction.', 'proxyFactionId'));

  if (mission) {
    if (operation.sponsorId !== 'uga' || operation.sponsorId !== mission.sponsorId) issues.push(issue('SPONSOR_INVALID', 'UGA must remain the operation sponsor.', 'sponsorId'));
    for (const field of ['missionType', 'systemId', 'siteId', 'contractFactionId', 'opponentFactionId', 'difficulty']) {
      if (operation[field] !== mission[field]) issues.push(issue('MISSION_CONTRACT_MISMATCH', `${field} does not match the mission catalog.`, field));
    }
    if (stableStringify(operation.objective) !== stableStringify(mission.objective)) issues.push(issue('OBJECTIVE_MISMATCH', 'Operation objective does not match its mission.', 'objective'));
    if (stableStringify(operation.rewardPlan) !== stableStringify(mission.rewards)) issues.push(issue('REWARD_PLAN_MISMATCH', 'Operation rewards do not match its mission.', 'rewardPlan'));
    if (!mission.doctrineIds.includes(operation.doctrineId) || operation.configuration?.doctrineId !== operation.doctrineId || operation.configuration?.approach !== operation.doctrineId) issues.push(issue('DOCTRINE_INVALID', 'Operation doctrine is not allowed.', 'doctrineId'));
    if (!mission.supportIds.includes(operation.supportId) || operation.configuration?.supportId !== operation.supportId || operation.configuration?.support !== operation.supportId) issues.push(issue('SUPPORT_INVALID', 'Operation support is not allowed.', 'supportId'));
    if (!mission.landingZoneIds.includes(operation.landingZoneId) || operation.configuration?.landingZoneId !== operation.landingZoneId) issues.push(issue('LANDING_ZONE_INVALID', 'Operation landing zone is not allowed.', 'landingZoneId'));
    if (operation.deploymentManifest) {
      const manifestIssues = [];
      const normalized = resolveDeploymentManifest(null, mission, { deploymentManifest: operation.deploymentManifest, facilityEffects: operation.configuration?.facilityEffects || {} });
      pushManifestLocks(mission, normalized, manifestIssues);
      // Schema-v2 saves created before facility construction do not carry the
      // derived unit/structure/mod limit fields. Compare their original shape
      // while still validating against the current authoritative limits.
      const normalizedShape = Object.fromEntries(Object.keys(operation.deploymentManifest).map(key => [key, normalized[key]]));
      if (stableStringify(normalizedShape) !== stableStringify(operation.deploymentManifest)) manifestIssues.push(issue('DEPLOYMENT_MANIFEST_INVALID', 'Operation deployment manifest is not normalized.', 'deploymentManifest'));
      issues.push(...manifestIssues);
    }
    if (mission.access.type === 'faction_exclusive' && operation.proxyFactionId !== mission.access.factionId) issues.push(issue('MISSION_FACTION_EXCLUSIVE', 'Operation uses the wrong faction for an exclusive mission.', 'proxyFactionId'));
    const expectedCost = mergeCosts(mission.baseDeploymentCost, SUPPORT_CATALOG[operation.supportId]?.cost);
    if (stableStringify(operation.deploymentCost) !== stableStringify(expectedCost)) issues.push(issue('DEPLOYMENT_COST_INVALID', 'Operation deployment cost is invalid.', 'deploymentCost'));
    if (mission.missionType === 'uga_brood_purge') {
      const targets = mission.objective.hiveTargetIds;
      if (operation.opponentFactionId !== 'brood' || operation.objective?.type !== 'purge_brood' || !operation.objective?.infestation || !operation.battlefield?.infestationActive || !targets.length || stableStringify(operation.battlefield?.hiveTargetIds) !== stableStringify(targets)) issues.push(issue('BROOD_PURGE_INVALID', 'UGA Brood operation is missing active infestation and valid hive targets.', 'battlefield'));
      if (targets.some(targetId => !site?.hiveTargetIds.includes(targetId))) issues.push(issue('HIVE_TARGET_INVALID', 'Operation contains a non-catalog hive target.', 'battlefield.hiveTargetIds'));
    }
  }
  const commander = COMMANDER_CATALOG[operation.commanderId];
  if (!commander || commander.factionId !== operation.proxyFactionId) issues.push(issue('COMMANDER_INVALID', 'Operation commander does not belong to its proxy faction.', 'commanderId'));
  if (!Array.isArray(operation.specialistIds) || operation.specialistIds.length !== 3 || new Set(operation.specialistIds).size !== 3) issues.push(issue('SPECIALIST_COUNT_INVALID', 'Operation requires exactly three unique specialists.', 'specialistIds'));
  else {
    const outsiderCount = operation.specialistIds.filter(id => SPECIALIST_CATALOG[id]?.factionId !== operation.proxyFactionId).length;
    const allowedOutsiders = Math.max(0, Number(operation.configuration?.facilityEffects?.crossFactionSpecialists) || 0);
    if (outsiderCount > allowedOutsiders) issues.push(issue('SPECIALIST_INVALID', 'Operation specialist mix exceeds Joint Command authorization.', 'specialistIds'));
  }
  if (!Number.isInteger(operation.intelligence?.level) || operation.intelligence.level < 0 || operation.intelligence.level > 5) issues.push(issue('INTELLIGENCE_INVALID', 'Operation intelligence level is invalid.', 'intelligence.level'));
  if (!Array.isArray(operation.battlefield?.hazards) || !Number.isInteger(operation.battlefield?.threat) || operation.battlefield.threat < 0 || operation.battlefield.threat > 100) issues.push(issue('BATTLEFIELD_INVALID', 'Operation battlefield payload is invalid.', 'battlefield'));
  if (!Number.isInteger(operation.factionSnapshot?.reputation) || operation.factionSnapshot.reputation < 0 || operation.factionSnapshot?.recoveryCycles !== 0) issues.push(issue('FACTION_SNAPSHOT_INVALID', 'Faction launch snapshot is invalid.', 'factionSnapshot'));
  if (operation.returnRoute === null || typeof operation.returnRoute !== 'object' || typeof operation.returnRoute.scene !== 'string' || typeof operation.returnRoute.systemId !== 'string') issues.push(issue('RETURN_ROUTE_INVALID', 'Operation must carry an exact return route.', 'returnRoute'));
  if (operation.operationId !== expectedOperationId(operation)) issues.push(issue('OPERATION_ID_INVALID', 'GroundOperation ID is not deterministic for its payload.', 'operationId'));
  if (operation.resultSeed !== expectedResultSeed(operation)) issues.push(issue('RESULT_SEED_INVALID', 'GroundOperation result seed is invalid.', 'resultSeed'));
  if (operation.returnToken !== expectedReturnToken(operation)) issues.push(issue('RETURN_TOKEN_INVALID', 'GroundOperation return token is invalid.', 'returnToken'));
  return { ok: issues.length === 0, issues };
}

export function beginGroundOperation(state, request = {}) {
  const operation = createGroundOperation(state, request);
  const next = deepClone(state);
  for (const [key, amount] of Object.entries(operation.deploymentCost)) next.resources[key] -= amount;
  next.operations.pending = deepClone(operation);
  next.operations.nextSequence += 1;
  next.factions[operation.proxyFactionId].status = 'deployed';
  next.personnel.commanders[operation.commanderId].status = 'deployed';
  for (const specialistId of operation.specialistIds) next.personnel.specialists[specialistId].status = 'deployed';
  next.missions[operation.missionId].attempts += 1;
  next.route = { scene: 'deployment', systemId: operation.systemId, targetId: operation.siteId, returnRoute: deepClone(operation.returnRoute) };
  next.revision += 1;
  assertDomainState(next);
  return { state: next, operation };
}

export function cancelGroundOperation(state, operationId = state.operations?.pending?.operationId) {
  assertDomainState(state);
  const pending = state.operations.pending;
  if (!pending || pending.operationId !== operationId) throw new DomainValidationError('Ground operation cancellation does not match the pending operation.', [issue('PENDING_OPERATION_MISMATCH', 'No matching GroundOperation is pending.', 'operationId')], 'PENDING_OPERATION_MISMATCH');
  const next = deepClone(state);
  for (const [key, amount] of Object.entries(pending.deploymentCost)) next.resources[key] += amount;
  next.factions[pending.proxyFactionId].status = 'ready';
  next.personnel.commanders[pending.commanderId].status = 'ready';
  for (const specialistId of pending.specialistIds) next.personnel.specialists[specialistId].status = 'ready';
  next.operations.pending = null;
  next.route = deepClone(pending.returnRoute);
  next.revision += 1;
  assertDomainState(next);
  return next;
}
