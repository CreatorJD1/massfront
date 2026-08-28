import {
  DISCOVERY_CATALOG,
  DISTRICT_ADJACENCIES,
  DISTRICT_CATALOG,
  FACTION_CATALOG,
  MODULE_CATALOG,
  RESEARCH_CATALOG,
  RESIDENT_FACTION_IDS,
  RESOURCE_KEYS,
  SHIP_DECKS,
  SHIP_DISTRICT_IDS,
  SPECIALIST_CATALOG,
  SURVEY_CATALOG,
  SYSTEM_CATALOG
} from './catalog.js';
import { clamp, deepClone } from './deterministic.js';
import { DomainValidationError, issue } from './errors.js';
import { assertDomainState } from './state_store.js';
import { CONSTRUCTION_FACILITY_CATALOG, getFacilityChoices } from './construction_catalog.js';
import {
  advanceExpeditionCycles,
  calculateFacilityCapabilities,
  enqueueConstruction,
  getConstructionQuote,
  getConstructionStatus
} from './construction.js';

function fail(message, code, path = '') {
  throw new DomainValidationError(message, [issue(code, message, path)], code);
}

function assertCost(resources, cost, path = 'resources') {
  for (const [key, amount] of Object.entries(cost || {})) {
    if (!RESOURCE_KEYS.includes(key) || !Number.isInteger(amount) || amount < 0) fail(`Invalid cost entry: ${key}.`, 'COST_INVALID', path);
    if ((resources[key] || 0) < amount) fail(`Not enough ${key}; requires ${amount}.`, 'RESOURCE_SHORTAGE', `${path}.${key}`);
  }
}

function spend(resources, cost) {
  for (const [key, amount] of Object.entries(cost || {})) resources[key] -= amount;
}

function reward(resources, rewards) {
  for (const [key, amount] of Object.entries(rewards || {})) {
    if (RESOURCE_KEYS.includes(key)) resources[key] += amount;
  }
}

function completeStoryStep(state, stepId) {
  if (!stepId) return;
  if (!state.story.completedStepIds.includes(stepId)) state.story.completedStepIds.push(stepId);
  state.story.currentStep = stepId;
}

function unlockSystemSurveys(state, systemId) {
  for (const survey of Object.values(SURVEY_CATALOG)) {
    if (survey.systemId === systemId && !state.surveys[survey.id].depleted) state.surveys[survey.id].status = 'available';
  }
}

export function setDomainRoute(state, route) {
  assertDomainState(state);
  if (!route || typeof route !== 'object') fail('Route must be an object.', 'ROUTE_INVALID', 'route');
  const next = deepClone(state);
  next.route = {
    scene: route.scene || next.route.scene,
    systemId: route.systemId || next.route.systemId,
    targetId: typeof route.targetId === 'string' ? route.targetId : null,
    returnRoute: route.returnRoute && typeof route.returnRoute === 'object' ? deepClone(route.returnRoute) : null
  };
  next.revision += 1;
  assertDomainState(next);
  return next;
}

export function getDistrictUpgradeQuote(state, districtId) {
  const current = state.ship?.districts?.[districtId];
  const targetTier = current?.commissioned === false ? 1 : Math.min(3, (current?.level || 1) + 1);
  const choice = targetTier > 1 ? getFacilityChoices(districtId, targetTier)[0]?.id : null;
  const quote = getConstructionQuote(state, districtId, choice);
  return { ...quote, currentLevel: current?.level || 1, targetLevel: quote.targetTier, features: quote.facilityId ? [CONSTRUCTION_FACILITY_CATALOG[quote.facilityId]?.description || 'District capability'] : [], visualChanges: DISTRICT_CATALOG[districtId]?.tiers[(quote.targetTier || 1) - 1]?.visualChanges || [] };
}

export function upgradeDistrict(state, districtId) {
  const district = state.ship?.districts?.[districtId];
  const targetTier = district?.commissioned === false ? 1 : Math.min(3, (district?.level || 1) + 1);
  const facilityId = targetTier > 1 ? getFacilityChoices(districtId, targetTier)[0]?.id : null;
  return enqueueConstruction(state, districtId, facilityId);
}

export function installDistrictModule(state, districtId, socketId, moduleId) {
  assertDomainState(state);
  if (CONSTRUCTION_FACILITY_CATALOG[moduleId]) return enqueueConstruction(state, districtId, moduleId);
  const definition = DISTRICT_CATALOG[districtId];
  const district = state.ship?.districts?.[districtId];
  const socket = definition?.sockets.find(entry => entry.id === socketId);
  const module = MODULE_CATALOG[moduleId];
  if (!definition || !district) fail('Unknown ship district.', 'DISTRICT_UNKNOWN', 'districtId');
  if (district.commissioned === false) fail('District must be commissioned before modules can be installed.', 'DISTRICT_NOT_COMMISSIONED', `ship.districts.${districtId}.commissioned`);
  if (!socket) fail('Unknown district module socket.', 'MODULE_SOCKET_UNKNOWN', 'socketId');
  if (!module || !socket.compatibleModuleIds.includes(moduleId)) fail('Module is incompatible with this socket.', 'MODULE_INCOMPATIBLE', 'moduleId');
  if (socket.unlockLevel > district.level) fail(`Socket unlocks at level ${socket.unlockLevel}.`, 'MODULE_SOCKET_LOCKED', `ship.districts.${districtId}.level`);
  if (district.modules[socketId] === moduleId) return state;
  assertCost(state.resources, module.cost);
  const next = deepClone(state);
  spend(next.resources, module.cost);
  next.ship.districts[districtId].modules[socketId] = moduleId;
  next.revision += 1;
  assertDomainState(next);
  return next;
}

export function commitResearch(state, researchId, amount = null) {
  assertDomainState(state);
  if (state.ship?.districts?.research?.commissioned === false) fail('Research Directorate must be commissioned before programs can advance.', 'RESEARCH_NOT_COMMISSIONED', 'ship.districts.research.commissioned');
  const definition = RESEARCH_CATALOG[researchId];
  if (!definition) fail('Unknown research project.', 'RESEARCH_UNKNOWN', 'researchId');
  if (state.research.completedIds.includes(researchId)) return { state, completed: true, committed: 0 };
  for (const prerequisiteId of definition.prerequisites) {
    if (!state.research.completedIds.includes(prerequisiteId)) fail(`Research requires ${RESEARCH_CATALOG[prerequisiteId].name}.`, 'RESEARCH_PREREQUISITE', 'researchId');
  }
  if (RESIDENT_FACTION_IDS.includes(definition.branch) && !state.factions[definition.branch].resident) fail('Faction research requires permanent residency.', 'RESEARCH_RESIDENCY_REQUIRED', `factions.${definition.branch}.resident`);
  const remaining = definition.cost - state.research.progressById[researchId];
  const requested = amount === null ? remaining : Math.floor(Number(amount));
  if (!Number.isInteger(requested) || requested < 1) fail('Research commitment must be a positive integer.', 'RESEARCH_AMOUNT_INVALID', 'amount');
  const capabilities = calculateFacilityCapabilities(state);
  if (definition.advancedContainment && !capabilities.advancedContainment) fail('This project requires the Containment Institute.', 'ADVANCED_CONTAINMENT_REQUIRED', 'ship.districts.research.facilities.tier3');
  const progressPct = capabilities.researchProgressPct || 0;
  const committed = Math.min(requested, Math.max(1, Math.ceil(remaining * 100 / (100 + progressPct))));
  const progress = Math.min(remaining, Math.max(1, Math.floor(committed * (100 + progressPct) / 100)));
  const completes = progress >= remaining;
  const bioSampleCost = completes && definition.bioSampleCost
    ? Math.max(1, Math.floor(definition.bioSampleCost * (100 + (capabilities.bioResearchCostPct || 0)) / 100))
    : 0;
  if (state.resources.researchPoints < committed) fail(`Not enough researchPoints; requires ${committed}.`, 'RESOURCE_SHORTAGE', 'resources.researchPoints');
  if (state.resources.bioSamples < bioSampleCost) fail(`Not enough bioSamples; completion requires ${bioSampleCost}.`, 'RESOURCE_SHORTAGE', 'resources.bioSamples');
  const next = deepClone(state);
  next.resources.researchPoints -= committed;
  next.resources.bioSamples -= bioSampleCost;
  next.research.sharedBankSpent += committed;
  next.research.allocations[definition.branch] += committed;
  next.research.progressById[researchId] += progress;
  const completed = next.research.progressById[researchId] >= definition.cost;
  if (completed) next.research.progressById[researchId] = definition.cost;
  if (completed) next.research.completedIds.push(researchId);
  next.revision += 1;
  assertDomainState(next);
  return { state: next, completed, committed, bioSamplesSpent: bioSampleCost };
}

export function grantFactionResidency(state, factionId) {
  assertDomainState(state);
  if (state.ship?.districts?.factions?.commissioned === false) fail('Coalition Embassy must be commissioned before faction residency.', 'EMBASSY_NOT_COMMISSIONED', 'ship.districts.factions.commissioned');
  if (!RESIDENT_FACTION_IDS.includes(factionId) || !FACTION_CATALOG[factionId]?.hireable) fail('Only Nova, Dominion, or Syndicate can become residents.', 'FACTION_NOT_RESIDENT_CAPABLE', 'factionId');
  if (state.factions[factionId].resident) return state;
  if (!state.research.completedIds.includes('uga_resident_charter')) fail('Resident Faction Charter research is required.', 'RESIDENCY_RESEARCH_REQUIRED', 'research.completedIds');
  const capacity = DISTRICT_CATALOG.factions.tiers[state.ship.districts.factions.level - 1].capacity.residentCapacity;
  const residentCount = RESIDENT_FACTION_IDS.filter(id => state.factions[id].resident).length;
  if (residentCount >= capacity) fail(`Faction Quarters level ${state.ship.districts.factions.level} has no open resident enclave.`, 'RESIDENT_CAPACITY_EXCEEDED', 'ship.districts.factions.level');
  const next = deepClone(state);
  const faction = next.factions[factionId];
  faction.resident = true;
  faction.recruitmentComplete = true;
  faction.status = 'ready';
  faction.readiness = 100;
  faction.loyalty = Math.max(50, faction.loyalty);
  faction.residentSinceRevision = state.revision + 1;
  for (const [commanderId, commander] of Object.entries(next.personnel.commanders)) {
    if (commanderId.startsWith(`${factionId}_`)) {
      commander.unlocked = true;
      commander.status = 'ready';
      commander.readiness = 100;
    }
  }
  for (const [specialistId, specialist] of Object.entries(next.personnel.specialists)) {
    if (specialistId.startsWith(`${factionId}_`)) {
      specialist.unlocked = true;
      specialist.status = 'ready';
      specialist.readiness = 100;
    }
  }
  next.revision += 1;
  assertDomainState(next);
  return next;
}

export function getSurveyEligibility(state, surveyId) {
  const survey = SURVEY_CATALOG[surveyId];
  if (!survey) return { ok: false, issues: [issue('SURVEY_UNKNOWN', 'Unknown survey.', 'surveyId')] };
  const issues = [];
  const surveyState = state.surveys[surveyId];
  if (!state.world.systems[survey.systemId].discovered) issues.push(issue('SYSTEM_UNDISCOVERED', 'Survey system has not been discovered.', `world.systems.${survey.systemId}.discovered`));
  if (surveyState.depleted || surveyState.status === 'completed') issues.push(issue('SURVEY_DEPLETED', 'This authored survey has already been exhausted.', `surveys.${surveyId}.depleted`));
  if (surveyState.status === 'locked') issues.push(issue('SURVEY_LOCKED', 'Survey is not yet available.', `surveys.${surveyId}.status`));
  if (state.ship.districts.survey.commissioned === false) issues.push(issue('SURVEY_NOT_COMMISSIONED', 'Survey Lab must be commissioned.', 'ship.districts.survey.commissioned'));
  if (state.ship.districts.survey.level < survey.requiredSurveyLevel) issues.push(issue('SURVEY_LEVEL_REQUIRED', `Survey Lab level ${survey.requiredSurveyLevel} is required.`, 'ship.districts.survey.level'));
  const probeCost = Math.max(1, survey.probeCost - (calculateFacilityCapabilities(state).surveyProbeDiscount || 0));
  if (state.resources.probes < probeCost) issues.push(issue('PROBE_SHORTAGE', `Survey requires ${probeCost} probe.`, 'resources.probes'));
  return { ok: issues.length === 0, issues, survey, probeCost };
}

export function deployProbe(state, surveyId) {
  assertDomainState(state);
  const eligibility = getSurveyEligibility(state, surveyId);
  if (!eligibility.ok) throw new DomainValidationError('Probe survey is unavailable.', eligibility.issues, 'SURVEY_UNAVAILABLE');
  const survey = eligibility.survey;
  const next = deepClone(state);
  const capabilities = calculateFacilityCapabilities(state);
  next.resources.probes -= eligibility.probeCost;
  const surveyRewards = deepClone(survey.rewards);
  if (surveyRewards.researchPoints) surveyRewards.researchPoints = Math.floor(surveyRewards.researchPoints * (100 + (capabilities.surveyResearchRewardPct || 0)) / 100);
  if (surveyRewards.bioSamples) surveyRewards.bioSamples = Math.floor(surveyRewards.bioSamples * (100 + (capabilities.bioRewardPct || 0)) / 100);
  reward(next.resources, surveyRewards);
  const surveyState = next.surveys[surveyId];
  surveyState.status = 'completed';
  surveyState.probesSpent = eligibility.probeCost;
  surveyState.completedRevision = state.revision + 1;
  surveyState.depleted = true;
  if (!next.discoveries.foundIds.includes(survey.discoveryId)) next.discoveries.foundIds.push(survey.discoveryId);
  if (!next.discoveries.depletedSurveyIds.includes(surveyId)) next.discoveries.depletedSurveyIds.push(surveyId);
  if (!next.intelligence.evidenceIds.includes(survey.discoveryId)) next.intelligence.evidenceIds.push(survey.discoveryId);
  next.intelligence.bySystem[survey.systemId] = clamp(next.intelligence.bySystem[survey.systemId] + survey.intelligence + (capabilities.surveyIntelligenceBonus || 0), 0, 5);
  if (survey.unlockSystemId) {
    next.world.systems[survey.unlockSystemId].discovered = true;
    unlockSystemSurveys(next, survey.unlockSystemId);
  }
  if (survey.revealsInfestation) {
    next.story.karakInfestationRevealed = true;
    next.world.systems.karak.infestation.active = true;
    next.world.systems.karak.infestation.confirmed = true;
    next.world.systems.karak.populationState = 'infested';
  }
  if (survey.confirmsHiveTargets) next.world.systems.karak.infestation.hiveTargetsConfirmed = true;
  completeStoryStep(next, survey.storyStep);
  next.revision += 1;
  const completedCount = next.discoveries.depletedSurveyIds.length;
  if (capabilities.surveyProbeRefundInterval && completedCount % capabilities.surveyProbeRefundInterval === 0) next.resources.probes += 1;
  const advanced = advanceExpeditionCycles(next, 1, `survey:${surveyId}`, 'survey');
  return { state: advanced.state, survey: deepClone(survey), discovery: deepClone(DISCOVERY_CATALOG[survey.discoveryId]), rewards: surveyRewards, construction: advanced.completedJobs };
}

export function plotCourse(state, systemId) {
  assertDomainState(state);
  const system = SYSTEM_CATALOG[systemId];
  if (!system) fail('Unknown destination system.', 'SYSTEM_UNKNOWN', 'systemId');
  if (!state.world.systems[systemId].discovered) fail('Destination has not been discovered.', 'SYSTEM_UNDISCOVERED', `world.systems.${systemId}.discovered`);
  if (state.route.systemId === systemId) return state;
  if (state.ship.districts.navigation.commissioned === false || state.ship.districts.engineering.commissioned === false) fail('Navigation and Engineering must be commissioned.', 'TRANSIT_SYSTEMS_OFFLINE', 'ship.districts');
  const engineeringLevel = state.ship.districts.engineering.level;
  const efficiency = DISTRICT_CATALOG.engineering.tiers[engineeringLevel - 1].capacity.fuelEfficiency || 0;
  const capabilities = calculateFacilityCapabilities(state);
  const totalEfficiency = clamp(efficiency - (capabilities.transitFuelPct || 0), 0, 60);
  const fuelCost = Math.max(1, Math.ceil(system.travelFuel * (1 - totalEfficiency / 100)));
  if (state.resources.fuel < fuelCost) fail(`Course requires ${fuelCost} fuel.`, 'RESOURCE_SHORTAGE', 'resources.fuel');
  const next = deepClone(state);
  next.resources.fuel -= fuelCost;
  next.route = { scene: 'system', systemId, targetId: null, returnRoute: null };
  next.revision += 1;
  return advanceExpeditionCycles(next, 2, `transit:${state.route.systemId}:${systemId}:${state.revision}`, 'transit').state;
}

export function simulateClassicModeLaunch(state, modeId, setup = {}) {
  assertDomainState(state);
  const allowed = new Set(['training', 'standard', 'campaign', 'mmo_warfront', 'co_op', 'events']);
  if (!allowed.has(modeId)) fail('Unknown Classic Mode.', 'CLASSIC_MODE_UNKNOWN', 'modeId');
  const next = deepClone(state);
  next.classicModes.lastSimulation = { modeId, setup: deepClone(setup), simulated: true, revision: state.revision + 1 };
  next.revision += 1;
  assertDomainState(next);
  return next;
}

export function calculatePowerGridStatus(state) {
  const engineeringDistrict = state.ship?.districts?.engineering;
  const engineeringLevel = engineeringDistrict?.level || 1;
  const engineeringTier = DISTRICT_CATALOG.engineering.tiers[engineeringLevel - 1];
  let totalGeneratedMW = engineeringTier?.capacity?.powerGenerationMW || 120;
  const construction = getConstructionStatus(state);
  const facilityCapabilities = calculateFacilityCapabilities(state);
  totalGeneratedMW += facilityCapabilities.powerGenerationMW || 0;

  if (engineeringDistrict?.modules) {
    for (const moduleId of Object.values(engineeringDistrict.modules)) {
      if (moduleId && MODULE_CATALOG[moduleId]?.powerGenerationBonusMW) {
        totalGeneratedMW += MODULE_CATALOG[moduleId].powerGenerationBonusMW;
      }
    }
  }

  for (const district of Object.values(state.ship?.districts || {})) {
    for (const specialistId of district.staff || []) {
      if (specialistId === 'dominion_tech_vesk') {
        totalGeneratedMW += 25;
      }
    }
  }

  let totalConsumedMW = 0;
  const districtDraws = {};

  let deckBOptimizer = false;
  const deckBDistricts = SHIP_DECKS.B.districtIds;
  for (const dId of deckBDistricts) {
    if (state.ship?.districts?.[dId]?.staff?.includes('syndicate_tech_aya')) {
      deckBOptimizer = true;
      break;
    }
  }

  for (const [districtId, district] of Object.entries(state.ship?.districts || {})) {
    if (district.commissioned === false) continue;
    const def = DISTRICT_CATALOG[districtId];
    if (!def) continue;
    const tier = def.tiers[district.level - 1];
    let districtBaseDraw = tier?.capacity?.powerDrawMW ?? def.basePowerDrawMW ?? 10;

    let moduleDraw = 0;
    for (const moduleId of Object.values(district.modules || {})) {
      if (moduleId && MODULE_CATALOG[moduleId]?.powerDrawMW) {
        moduleDraw += MODULE_CATALOG[moduleId].powerDrawMW;
      }
    }

    let districtTotal = districtBaseDraw + moduleDraw;
    if (deckBOptimizer && deckBDistricts.includes(districtId)) {
      districtTotal = Math.round(districtTotal * 0.8);
    }

    districtDraws[districtId] = {
      base: districtBaseDraw,
      modules: moduleDraw,
      total: districtTotal
    };
    totalConsumedMW += districtTotal;
  }
  for (const district of Object.values(state.ship?.districts || {})) {
    for (const tier of [2, 3]) {
      if (district.facilityOffline?.[`tier${tier}`]) continue;
      totalConsumedMW += CONSTRUCTION_FACILITY_CATALOG[district.facilities?.[`tier${tier}`]]?.powerDrawMW || 0;
    }
  }
  totalConsumedMW += construction.active * construction.power.constructionPowerPerSlotMW;

  const surplusMW = totalGeneratedMW - totalConsumedMW;
  const gridEfficiencyPct = Math.round((totalConsumedMW / Math.max(1, totalGeneratedMW)) * 100);
  const isBrownout = totalConsumedMW > totalGeneratedMW;

  return {
    totalGeneratedMW,
    totalConsumedMW,
    surplusMW,
    gridEfficiencyPct,
    isBrownout,
    districtDraws
  };
}

export function calculateShipExplorationRating(state) {
  let rating = 0;
  const breakdown = {
    districtTiers: 0,
    modulesInstalled: 0,
    specialistsStaffed: 0,
    researchCompleted: 0
  };

  for (const district of Object.values(state.ship?.districts || {})) {
    breakdown.districtTiers += district.level || 1;
    for (const moduleId of Object.values(district.modules || {})) {
      if (moduleId) breakdown.modulesInstalled += 1;
    }
    for (const specialistId of district.staff || []) {
      if (specialistId) breakdown.specialistsStaffed += 1;
    }
  }

  breakdown.researchCompleted = state.research?.completedIds?.length || 0;
  rating = breakdown.districtTiers + breakdown.modulesInstalled + breakdown.specialistsStaffed + breakdown.researchCompleted;

  let className = 'Class I · Survey Cruiser';
  if (rating >= 30) className = 'Class IV · Civilization Flagship';
  else if (rating >= 22) className = 'Class III · Heavy Deep-Space Ark';
  else if (rating >= 15) className = 'Class II · Frontier Exploration Ark';

  return {
    rating,
    className,
    breakdown
  };
}

export function calculateAdjacencySynergies(state) {
  const activeSynergies = [];
  for (const adjacency of DISTRICT_ADJACENCIES) {
    const [d1, d2] = adjacency.districts;
    const dist1 = state.ship?.districts?.[d1];
    const dist2 = state.ship?.districts?.[d2];
    if (dist1?.commissioned !== false && dist2?.commissioned !== false && dist1.level >= 2 && dist2.level >= 2) {
      const tierLevel = Math.min(dist1.level, dist2.level);
      activeSynergies.push({
        ...adjacency,
        tierLevel,
        isAmplified: tierLevel >= 2
      });
    }
  }
  return activeSynergies;
}

export function assignSpecialistToDistrict(state, districtId, slotIndex, specialistId) {
  assertDomainState(state);
  const def = DISTRICT_CATALOG[districtId];
  const district = state.ship?.districts?.[districtId];
  if (!def || !district) fail('Unknown ship district.', 'DISTRICT_UNKNOWN', 'districtId');
  if (district.commissioned === false) fail('District must be commissioned before staff can be assigned.', 'DISTRICT_NOT_COMMISSIONED', `ship.districts.${districtId}.commissioned`);

  const staffSlotDef = def.staffSlots?.[slotIndex];
  if (!staffSlotDef) fail('Invalid district staff slot index.', 'STAFF_SLOT_UNKNOWN', 'slotIndex');
  if (staffSlotDef.unlockLevel > district.level) fail(`Staff slot unlocks at district tier ${staffSlotDef.unlockLevel}.`, 'STAFF_SLOT_LOCKED', `ship.districts.${districtId}.level`);

  const specialistDef = SPECIALIST_CATALOG[specialistId];
  const specialistState = state.personnel?.specialists?.[specialistId];
  if (!specialistDef || !specialistState) fail('Unknown specialist.', 'SPECIALIST_UNKNOWN', 'specialistId');
  if (!specialistState.unlocked || specialistState.status === 'locked') fail('Specialist is not unlocked.', 'SPECIALIST_LOCKED', `personnel.specialists.${specialistId}.status`);
  if (specialistState.injury) fail('Specialist is recovering from injuries.', 'SPECIALIST_INJURED', `personnel.specialists.${specialistId}.injury`);
  if (specialistState.status === 'deployed') fail('Specialist is currently deployed on an active operation.', 'SPECIALIST_DEPLOYED', `personnel.specialists.${specialistId}.status`);

  const next = deepClone(state);

  for (const d of Object.values(next.ship.districts)) {
    if (Array.isArray(d.staff)) {
      for (let i = 0; i < d.staff.length; i++) {
        if (d.staff[i] === specialistId) d.staff[i] = null;
      }
    }
  }

  if (!Array.isArray(next.ship.districts[districtId].staff)) {
    next.ship.districts[districtId].staff = (def.staffSlots || []).map(() => null);
  }
  next.ship.districts[districtId].staff[slotIndex] = specialistId;
  next.revision += 1;
  assertDomainState(next);
  return next;
}

export function unassignSpecialist(state, districtId, slotIndex) {
  assertDomainState(state);
  const def = DISTRICT_CATALOG[districtId];
  const district = state.ship?.districts?.[districtId];
  if (!def || !district) fail('Unknown ship district.', 'DISTRICT_UNKNOWN', 'districtId');

  const next = deepClone(state);
  if (Array.isArray(next.ship.districts[districtId].staff)) {
    next.ship.districts[districtId].staff[slotIndex] = null;
  }
  next.revision += 1;
  assertDomainState(next);
  return next;
}
