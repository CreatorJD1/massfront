import {
  CATALOG_VERSION,
  COMMANDER_CATALOG,
  DISCOVERY_CATALOG,
  DISTRICT_CATALOG,
  MISSION_CATALOG,
  MODULE_CATALOG,
  RESEARCH_CATALOG,
  RESIDENT_FACTION_IDS,
  RESOURCE_KEYS,
  SHIP_DISTRICT_IDS,
  SPECIALIST_CATALOG,
  SURVEY_CATALOG,
  SYSTEM_CATALOG
} from './catalog.js';
import {
  CONSTRUCTION_FACILITY_CATALOG,
  CONSTRUCTION_QUEUE_LIMIT,
  INITIAL_COMMISSIONED_DISTRICTS,
  getCoreFacilityId,
  getFacilityChoices
} from './construction_catalog.js';
import { clamp, deepClone, stableStringify } from './deterministic.js';
import { DomainValidationError, issue } from './errors.js';

export const DOMAIN_STATE_SCHEMA_VERSION = 4;
export const DOMAIN_STORAGE_FORMAT_VERSION = 2;
export const DOMAIN_STORAGE_KEY = 'massfront.space_exploration.domain_state';

const ROUTE_SCENES = new Set(['galaxy', 'system', 'orbit', 'survey', 'uga', 'deployment', 'classic', 'results']);
const FACTION_STATUSES = new Set(['nonresident', 'ready', 'deployed', 'recovering']);
const PERSONNEL_STATUSES = new Set(['locked', 'ready', 'deployed', 'recovering']);

function integer(value, fallback = 0, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(Number(value))) return fallback;
  return clamp(Math.floor(Number(value)), minimum, maximum);
}

function uniqueKnown(values, catalog) {
  return [...new Set(Array.isArray(values) ? values.filter(id => typeof id === 'string' && catalog[id]) : [])];
}

function createDistrictState(definition) {
  const modules = {};
  for (const socket of definition.sockets) modules[socket.id] = null;
  if (definition.id === 'command') {
    modules.command_socket_1 = 'command_holotable';
    modules.command_socket_2 = 'command_archive';
    modules.command_socket_3 = 'command_terminal';
  }
  const staff = (definition.staffSlots || []).map(() => null);
  const commissioned = INITIAL_COMMISSIONED_DISTRICTS.includes(definition.id);
  return {
    level: definition.initialLevel,
    built: commissioned,
    commissioned,
    modules,
    staff,
    facilities: {
      tier1: commissioned && !definition.fixed ? getCoreFacilityId(definition.id) : definition.fixed ? 'command_core' : null,
      tier2: null,
      tier3: null
    },
    facilityOffline: { tier2: false, tier3: false },
    construction: null,
    upgradesCompleted: Math.max(0, definition.initialLevel - 1)
  };
}

function createFactionState(factionId) {
  const resident = factionId === 'nova';
  return {
    resident,
    recruitmentComplete: resident,
    status: resident ? 'ready' : 'nonresident',
    reputation: resident ? 12 : 0,
    loyalty: resident ? 58 : 40,
    readiness: resident ? 100 : 0,
    recoveryCycles: 0,
    operationsCompleted: 0,
    residentSinceRevision: resident ? 0 : null
  };
}

function createCommanderState(definition) {
  const resident = definition.factionId === 'nova';
  return {
    unlocked: resident,
    status: resident ? 'ready' : 'locked',
    level: definition.initialLevel,
    experience: 0,
    readiness: resident ? 100 : 0,
    loyalty: resident ? 62 : 45,
    injury: null,
    operationsCompleted: 0
  };
}

function createSpecialistState(definition) {
  const resident = definition.factionId === 'nova';
  return {
    unlocked: resident,
    status: resident ? 'ready' : 'locked',
    experience: 0,
    readiness: resident ? 100 : 0,
    loyalty: resident ? 58 : 42,
    injury: null,
    operationsCompleted: 0
  };
}

function createWorldState() {
  return {
    systems: {
      aelos: {
        discovered: true,
        trafficState: 'dense',
        populationState: 'thriving',
        infestation: { active: false, confirmed: false, severity: 0, hiveTargetsConfirmed: false }
      },
      veyra: {
        discovered: false,
        trafficState: 'sparse',
        populationState: 'frontier',
        infestation: { active: false, confirmed: false, severity: 0, hiveTargetsConfirmed: false }
      },
      karak: {
        discovered: false,
        trafficState: 'silent',
        populationState: 'unknown',
        infestation: { active: false, confirmed: false, severity: 88, hiveTargetsConfirmed: false }
      }
    }
  };
}

export function createInitialDomainState() {
  const districts = {};
  for (const definition of Object.values(DISTRICT_CATALOG)) districts[definition.id] = createDistrictState(definition);

  const factions = {};
  for (const factionId of RESIDENT_FACTION_IDS) factions[factionId] = createFactionState(factionId);

  const commanders = {};
  for (const definition of Object.values(COMMANDER_CATALOG)) commanders[definition.id] = createCommanderState(definition);
  const specialists = {};
  for (const definition of Object.values(SPECIALIST_CATALOG)) specialists[definition.id] = createSpecialistState(definition);

  const progressById = {};
  for (const researchId of Object.keys(RESEARCH_CATALOG)) progressById[researchId] = 0;
  const surveys = {};
  for (const survey of Object.values(SURVEY_CATALOG)) {
    surveys[survey.id] = {
      status: survey.systemId === 'aelos' ? 'available' : 'locked',
      probesSpent: 0,
      completedRevision: null,
      depleted: false
    };
  }
  const missions = {};
  for (const missionId of Object.keys(MISSION_CATALOG)) {
    missions[missionId] = { attempts: 0, completions: 0, lastOutcome: null, lastResultId: null };
  }

  return {
    schemaVersion: DOMAIN_STATE_SCHEMA_VERSION,
    catalogVersion: CATALOG_VERSION,
    profileId: 'local_expedition',
    seed: 'massfront-cinematic-test-room-v1',
    revision: 0,
    route: { scene: 'system', systemId: 'aelos', targetId: null, returnRoute: null },
    resources: {
      credits: 7200,
      alloys: 360,
      components: 420,
      bioSamples: 0,
      researchPoints: 260,
      fuel: 90,
      probes: 8
    },
    ship: {
      name: 'UGA Wayfarer',
      livery: 'nightglass',
      illumination: 'expedition_blue',
      population: 6200,
      expeditionCycle: 0,
      constructionQueue: [],
      constructionHistory: [],
      processedCycleEventIds: [],
      districts
    },
    research: {
      sharedBankSpent: 0,
      allocations: { uga: 0, universal: 0, nova: 0, dominion: 0, syndicate: 0 },
      progressById,
      completedIds: []
    },
    factions,
    personnel: { commanders, specialists },
    surveys,
    discoveries: { foundIds: [], depletedSurveyIds: [] },
    intelligence: { bySystem: { aelos: 0, veyra: 0, karak: 0 }, evidenceIds: [] },
    story: { currentStep: 'aelos_arrival', completedStepIds: [], karakInfestationRevealed: false },
    world: createWorldState(),
    missions,
    operations: { nextSequence: 1, pending: null, appliedResultIds: [], history: [] },
    classicModes: { lastSimulation: null }
  };
}

function unlockResidentPersonnel(state, factionId) {
  for (const [commanderId, definition] of Object.entries(COMMANDER_CATALOG)) {
    if (definition.factionId !== factionId) continue;
    const commander = state.personnel.commanders[commanderId];
    commander.unlocked = true;
    commander.status = 'ready';
    commander.readiness = Math.max(85, commander.readiness);
  }
  for (const [specialistId, definition] of Object.entries(SPECIALIST_CATALOG)) {
    if (definition.factionId !== factionId) continue;
    const specialist = state.personnel.specialists[specialistId];
    specialist.unlocked = true;
    specialist.status = 'ready';
    specialist.readiness = Math.max(85, specialist.readiness);
  }
}

export function createShowcaseReadyDomainState() {
  const state = createInitialDomainState();
  state.resources = { credits: 18000, alloys: 1400, components: 1200, bioSamples: 120, researchPoints: 1200, fuel: 260, probes: 24 };
  state.ship.districts.factions.level = 3;
  state.ship.districts.survey.level = 3;
  state.ship.districts.research.level = 3;
  state.ship.districts.engineering.level = 3;
  state.ship.districts.hangar.level = 2;
  for (const [districtId, district] of Object.entries(state.ship.districts)) {
    district.commissioned = true;
    district.built = true;
    if (districtId !== 'command') {
      district.facilities.tier1 = getCoreFacilityId(districtId);
      for (const tier of [2, 3]) {
        if (district.level >= tier) district.facilities[`tier${tier}`] = getFacilityChoices(districtId, tier)[0]?.id || null;
      }
    }
  }
  state.ship.population = 24000;
  for (const factionId of RESIDENT_FACTION_IDS) {
    const faction = state.factions[factionId];
    faction.resident = true;
    faction.recruitmentComplete = true;
    faction.status = 'ready';
    faction.readiness = 100;
    faction.reputation = Math.max(15, faction.reputation);
    faction.residentSinceRevision = 0;
    unlockResidentPersonnel(state, factionId);
  }
  for (const systemId of Object.keys(SYSTEM_CATALOG)) state.world.systems[systemId].discovered = true;
  for (const [surveyId, surveyState] of Object.entries(state.surveys)) {
    surveyState.status = 'completed';
    surveyState.depleted = true;
    surveyState.probesSpent = SURVEY_CATALOG[surveyId].probeCost;
    surveyState.completedRevision = 0;
  }
  state.discoveries.foundIds = Object.keys(DISCOVERY_CATALOG);
  state.discoveries.depletedSurveyIds = Object.keys(SURVEY_CATALOG);
  state.intelligence.bySystem = { aelos: 2, veyra: 2, karak: 4 };
  state.intelligence.evidenceIds = Object.keys(DISCOVERY_CATALOG);
  state.story.currentStep = 'karak_hive_mapped';
  state.story.completedStepIds = ['veyra_route_open', 'karak_route_open', 'karak_infestation_confirmed', 'karak_hive_mapped'];
  state.story.karakInfestationRevealed = true;
  state.world.systems.karak.infestation = { active: true, confirmed: true, severity: 88, hiveTargetsConfirmed: true };
  for (const researchId of ['uga_brood_containment', 'universal_spectral_cartography']) {
    state.research.progressById[researchId] = RESEARCH_CATALOG[researchId].cost;
    state.research.completedIds.push(researchId);
    state.research.allocations[RESEARCH_CATALOG[researchId].branch] += RESEARCH_CATALOG[researchId].cost;
    state.research.sharedBankSpent += RESEARCH_CATALOG[researchId].cost;
  }
  return state;
}

function normalizeInjury(value) {
  if (!value || typeof value !== 'object') return null;
  const recoveryCycles = integer(value.recoveryCycles, 0, 0, 12);
  if (!recoveryCycles) return null;
  return {
    type: typeof value.type === 'string' && value.type ? value.type : 'operational_trauma',
    severity: ['light', 'moderate', 'severe'].includes(value.severity) ? value.severity : 'light',
    recoveryCycles
  };
}

function normalizePersonnelState(target, source, catalog, residentFactions) {
  for (const [id, definition] of Object.entries(catalog)) {
    const incoming = source?.[id];
    if (!incoming || typeof incoming !== 'object') continue;
    const person = target[id];
    const shouldUnlock = residentFactions.has(definition.factionId) || Boolean(incoming.unlocked);
    person.unlocked = shouldUnlock;
    if (person.level !== undefined) person.level = integer(incoming.level, person.level, 1, 20);
    person.experience = integer(incoming.experience, person.experience, 0);
    person.readiness = integer(incoming.readiness, person.readiness, 0, 100);
    person.loyalty = integer(incoming.loyalty, person.loyalty, 0, 100);
    person.operationsCompleted = integer(incoming.operationsCompleted, person.operationsCompleted, 0);
    person.injury = normalizeInjury(incoming.injury);
    person.status = PERSONNEL_STATUSES.has(incoming.status) ? incoming.status : person.status;
    if (!person.unlocked) person.status = 'locked';
    else if (person.injury) person.status = 'recovering';
    else if (person.status === 'locked' || person.status === 'recovering') person.status = 'ready';
  }
}

export function normalizeDomainState(source) {
  const state = createInitialDomainState();
  if (!source || typeof source !== 'object' || Array.isArray(source)) return state;
  const preConstructionSchema = integer(source.schemaVersion, 0) > 0 && integer(source.schemaVersion, 0) < 4;
  state.profileId = typeof source.profileId === 'string' && source.profileId ? source.profileId : state.profileId;
  state.seed = typeof source.seed === 'string' && source.seed ? source.seed : state.seed;
  state.revision = integer(source.revision, 0);

  const systemId = SYSTEM_CATALOG[source.route?.systemId] ? source.route.systemId : state.route.systemId;
  state.route = {
    scene: ROUTE_SCENES.has(source.route?.scene) ? source.route.scene : state.route.scene,
    systemId,
    targetId: typeof source.route?.targetId === 'string' ? source.route.targetId : null,
    returnRoute: source.route?.returnRoute && typeof source.route.returnRoute === 'object' ? deepClone(source.route.returnRoute) : null
  };
  for (const key of RESOURCE_KEYS) state.resources[key] = integer(source.resources?.[key], state.resources[key]);

  state.ship.name = typeof source.ship?.name === 'string' && source.ship.name ? source.ship.name : state.ship.name;
  state.ship.livery = typeof source.ship?.livery === 'string' ? source.ship.livery : state.ship.livery;
  state.ship.illumination = typeof source.ship?.illumination === 'string' ? source.ship.illumination : state.ship.illumination;
  state.ship.population = integer(source.ship?.population, state.ship.population);
  state.ship.expeditionCycle = integer(source.ship?.expeditionCycle, 0);
  state.ship.processedCycleEventIds = [...new Set(Array.isArray(source.ship?.processedCycleEventIds) ? source.ship.processedCycleEventIds.filter(id => typeof id === 'string' && id) : [])].slice(-128);
  state.ship.constructionHistory = Array.isArray(source.ship?.constructionHistory) ? deepClone(source.ship.constructionHistory.filter(entry => entry && typeof entry === 'object')).slice(-24) : [];
  for (const districtId of SHIP_DISTRICT_IDS) {
    const definition = DISTRICT_CATALOG[districtId];
    const incoming = source.ship?.districts?.[districtId];
    if (!incoming || typeof incoming !== 'object') continue;
    const district = state.ship.districts[districtId];
    district.level = definition.fixed ? definition.initialLevel : integer(incoming.level, district.level, 1, 3);
    district.commissioned = definition.fixed ? true : typeof incoming.commissioned === 'boolean' ? incoming.commissioned : preConstructionSchema ? true : district.commissioned;
    district.built = district.commissioned;
    district.upgradesCompleted = integer(incoming.upgradesCompleted, Math.max(0, district.level - 1), 0, 2);
    district.construction = incoming.construction && typeof incoming.construction === 'object' ? deepClone(incoming.construction) : null;
    for (const socket of definition.sockets) {
      const moduleId = incoming.modules?.[socket.id];
      district.modules[socket.id] = socket.unlockLevel <= district.level && socket.compatibleModuleIds.includes(moduleId) ? moduleId : district.modules[socket.id];
    }
    district.staff = (definition.staffSlots || []).map((slot, index) => {
      const assigned = incoming.staff?.[index];
      return typeof assigned === 'string' && SPECIALIST_CATALOG[assigned] ? assigned : null;
    });
    const incomingFacilities = incoming.facilities || {};
    district.facilities.tier1 = district.commissioned ? getCoreFacilityId(districtId) : null;
    for (const tier of [2, 3]) {
      const facilityId = incomingFacilities[`tier${tier}`];
      const validFacility = CONSTRUCTION_FACILITY_CATALOG[facilityId]?.districtId === districtId && CONSTRUCTION_FACILITY_CATALOG[facilityId]?.tier === tier ? facilityId : null;
      district.facilities[`tier${tier}`] = validFacility || (preConstructionSchema && district.level >= tier ? getFacilityChoices(districtId, tier)[0]?.id || null : null);
      district.facilityOffline[`tier${tier}`] = Boolean(incoming.facilityOffline?.[`tier${tier}`] && district.facilities[`tier${tier}`]);
    }
  }
  state.ship.constructionQueue = Array.isArray(source.ship?.constructionQueue)
    ? deepClone(source.ship.constructionQueue.filter(job => job && typeof job === 'object' && typeof job.id === 'string').slice(0, CONSTRUCTION_QUEUE_LIMIT))
    : [];
  state.ship.constructionQueue.forEach((job, queueOrder) => { job.queueOrder = queueOrder; });

  for (const factionId of RESIDENT_FACTION_IDS) {
    const incoming = source.factions?.[factionId];
    if (!incoming || typeof incoming !== 'object') continue;
    const faction = state.factions[factionId];
    faction.resident = Boolean(incoming.resident);
    faction.recruitmentComplete = faction.resident || Boolean(incoming.recruitmentComplete);
    faction.status = FACTION_STATUSES.has(incoming.status) ? incoming.status : faction.status;
    faction.reputation = integer(incoming.reputation, faction.reputation);
    faction.loyalty = integer(incoming.loyalty, faction.loyalty, 0, 100);
    faction.readiness = integer(incoming.readiness, faction.readiness, 0, 100);
    faction.recoveryCycles = integer(incoming.recoveryCycles, faction.recoveryCycles, 0, 12);
    faction.operationsCompleted = integer(incoming.operationsCompleted, faction.operationsCompleted);
    faction.residentSinceRevision = incoming.residentSinceRevision === null ? null : integer(incoming.residentSinceRevision, faction.residentSinceRevision || 0);
    if (!faction.resident) faction.status = 'nonresident';
    else if (faction.recoveryCycles > 0) faction.status = 'recovering';
    else if (faction.status === 'nonresident' || faction.status === 'recovering') faction.status = 'ready';
  }
  const residentFactions = new Set(RESIDENT_FACTION_IDS.filter(id => state.factions[id].resident));
  normalizePersonnelState(state.personnel.commanders, source.personnel?.commanders, COMMANDER_CATALOG, residentFactions);
  normalizePersonnelState(state.personnel.specialists, source.personnel?.specialists, SPECIALIST_CATALOG, residentFactions);

  state.research.completedIds = uniqueKnown(source.research?.completedIds, RESEARCH_CATALOG);
  state.research.sharedBankSpent = integer(source.research?.sharedBankSpent, 0);
  for (const branch of Object.keys(state.research.allocations)) state.research.allocations[branch] = integer(source.research?.allocations?.[branch], 0);
  for (const [researchId, definition] of Object.entries(RESEARCH_CATALOG)) {
    const progress = integer(source.research?.progressById?.[researchId], 0, 0, definition.cost);
    state.research.progressById[researchId] = state.research.completedIds.includes(researchId) ? definition.cost : progress;
  }

  for (const [surveyId, definition] of Object.entries(SURVEY_CATALOG)) {
    const incoming = source.surveys?.[surveyId];
    if (!incoming || typeof incoming !== 'object') continue;
    const survey = state.surveys[surveyId];
    survey.status = ['locked', 'available', 'completed'].includes(incoming.status) ? incoming.status : survey.status;
    survey.probesSpent = integer(incoming.probesSpent, 0, 0, definition.probeCost);
    survey.completedRevision = incoming.completedRevision === null ? null : integer(incoming.completedRevision, 0);
    survey.depleted = Boolean(incoming.depleted);
    if (survey.depleted) survey.status = 'completed';
  }
  state.discoveries.foundIds = uniqueKnown(source.discoveries?.foundIds, DISCOVERY_CATALOG);
  state.discoveries.depletedSurveyIds = uniqueKnown(source.discoveries?.depletedSurveyIds, SURVEY_CATALOG);
  state.intelligence.evidenceIds = uniqueKnown(source.intelligence?.evidenceIds, DISCOVERY_CATALOG);
  for (const systemKey of Object.keys(SYSTEM_CATALOG)) state.intelligence.bySystem[systemKey] = integer(source.intelligence?.bySystem?.[systemKey], 0, 0, 5);
  state.story.currentStep = typeof source.story?.currentStep === 'string' ? source.story.currentStep : state.story.currentStep;
  state.story.completedStepIds = [...new Set(Array.isArray(source.story?.completedStepIds) ? source.story.completedStepIds.filter(id => typeof id === 'string') : [])];
  state.story.karakInfestationRevealed = Boolean(source.story?.karakInfestationRevealed);

  for (const systemKey of Object.keys(SYSTEM_CATALOG)) {
    const incoming = source.world?.systems?.[systemKey];
    if (!incoming || typeof incoming !== 'object') continue;
    const world = state.world.systems[systemKey];
    world.discovered = Boolean(incoming.discovered);
    world.trafficState = typeof incoming.trafficState === 'string' ? incoming.trafficState : world.trafficState;
    world.populationState = typeof incoming.populationState === 'string' ? incoming.populationState : world.populationState;
    world.infestation.active = Boolean(incoming.infestation?.active);
    world.infestation.confirmed = Boolean(incoming.infestation?.confirmed);
    world.infestation.severity = integer(incoming.infestation?.severity, world.infestation.severity, 0, 100);
    world.infestation.hiveTargetsConfirmed = Boolean(incoming.infestation?.hiveTargetsConfirmed);
  }
  state.world.systems[state.route.systemId].discovered = true;

  for (const missionId of Object.keys(MISSION_CATALOG)) {
    const incoming = source.missions?.[missionId];
    if (!incoming || typeof incoming !== 'object') continue;
    const mission = state.missions[missionId];
    mission.attempts = integer(incoming.attempts, 0);
    mission.completions = integer(incoming.completions, 0, 0, mission.attempts);
    mission.lastOutcome = ['victory', 'partial', 'setback'].includes(incoming.lastOutcome) ? incoming.lastOutcome : null;
    mission.lastResultId = typeof incoming.lastResultId === 'string' ? incoming.lastResultId : null;
  }

  state.operations.nextSequence = integer(source.operations?.nextSequence, 1, 1);
  state.operations.pending = source.operations?.pending && typeof source.operations.pending === 'object' ? deepClone(source.operations.pending) : null;
  state.operations.appliedResultIds = [...new Set(Array.isArray(source.operations?.appliedResultIds) ? source.operations.appliedResultIds.filter(id => typeof id === 'string' && id) : [])];
  state.operations.history = Array.isArray(source.operations?.history) ? deepClone(source.operations.history.filter(entry => entry && typeof entry === 'object')) : [];
  state.classicModes.lastSimulation = source.classicModes?.lastSimulation && typeof source.classicModes.lastSimulation === 'object' ? deepClone(source.classicModes.lastSimulation) : null;

  const pendingFactionId = state.operations.pending?.proxyFactionId || state.operations.pending?.playerFactionId;
  if (pendingFactionId && state.factions[pendingFactionId]?.resident) {
    state.factions[pendingFactionId].status = 'deployed';
    const commander = state.personnel.commanders[state.operations.pending.commanderId];
    if (commander) commander.status = 'deployed';
    for (const specialistId of state.operations.pending.specialistIds || []) {
      if (state.personnel.specialists[specialistId]) state.personnel.specialists[specialistId].status = 'deployed';
    }
  } else if (state.operations.pending) {
    state.operations.pending = null;
  }

  state.schemaVersion = DOMAIN_STATE_SCHEMA_VERSION;
  state.catalogVersion = CATALOG_VERSION;
  return state;
}

function migrateLegacyState(source) {
  const state = createInitialDomainState();
  const legacySystem = source.location?.systemId || source.currentSystemId || source.systemId;
  const systemMap = { sombrero_i: 'aelos', orion_arc: 'aelos', andromeda_iv: 'veyra', nordhall: 'karak' };
  const systemId = SYSTEM_CATALOG[legacySystem] ? legacySystem : systemMap[legacySystem];
  if (systemId) {
    state.route.systemId = systemId;
    state.world.systems[systemId].discovered = true;
  }
  state.profileId = typeof source.profileId === 'string' ? source.profileId : state.profileId;
  state.revision = integer(source.revision, 0);
  const resources = source.resources || {};
  state.resources.researchPoints = integer(resources.researchPoints ?? resources.science ?? source.science, state.resources.researchPoints);
  state.resources.bioSamples = integer(resources.bioSamples ?? source.bioSamples, state.resources.bioSamples);
  state.resources.credits = integer(resources.credits ?? resources.requisition ?? source.requisition, state.resources.credits);
  const legacyFactions = source.factions || source.factionStatus || {};
  for (const factionId of RESIDENT_FACTION_IDS) {
    const incoming = legacyFactions[factionId];
    if (!incoming) continue;
    state.factions[factionId].resident = true;
    state.factions[factionId].recruitmentComplete = true;
    state.factions[factionId].status = 'ready';
    if (typeof incoming === 'object') {
      state.factions[factionId].reputation = integer(incoming.reputation, 0);
      state.factions[factionId].operationsCompleted = integer(incoming.operationsCompleted, 0);
    }
    unlockResidentPersonnel(state, factionId);
  }
  const residentCount = RESIDENT_FACTION_IDS.filter(factionId => state.factions[factionId].resident).length;
  const factionDistrict = state.ship.districts.factions;
  factionDistrict.level = Math.max(factionDistrict.level, residentCount);
  factionDistrict.upgradesCompleted = Math.max(factionDistrict.upgradesCompleted, factionDistrict.level - 1);
  const completed = [...(source.research?.completedIds || source.completedResearchIds || [])];
  if (completed.includes('spectral_cartography')) completed.push('universal_spectral_cartography');
  state.research.completedIds = uniqueKnown(completed, RESEARCH_CATALOG);
  for (const researchId of state.research.completedIds) state.research.progressById[researchId] = RESEARCH_CATALOG[researchId].cost;
  state.operations.nextSequence = integer(source.operations?.nextSequence ?? source.operationSequence, 1, 1);
  // Every pre-construction save represented a fully operational ship. Preserve
  // that fact explicitly instead of treating absent commissioning fields as a
  // new-campaign lockout.
  for (const [districtId, district] of Object.entries(state.ship.districts)) {
    district.commissioned = true;
    district.built = true;
    if (districtId === 'command') continue;
    district.facilities.tier1 = getCoreFacilityId(districtId);
    for (const tier of [2, 3]) {
      if (district.level >= tier) district.facilities[`tier${tier}`] = getFacilityChoices(districtId, tier)[0]?.id || null;
    }
  }
  return state;
}

export function migrateDomainState(payload) {
  let source = payload;
  if (typeof source === 'string') source = JSON.parse(source);
  if (source?.storageFormatVersion !== undefined && source?.state) {
    if (source.storageFormatVersion > DOMAIN_STORAGE_FORMAT_VERSION) {
      throw new DomainValidationError(
        `Storage format ${source.storageFormatVersion} is newer than supported format ${DOMAIN_STORAGE_FORMAT_VERSION}.`,
        [issue('STORAGE_FORMAT_UNSUPPORTED', 'A newer client is required to read this local state.', 'storageFormatVersion')],
        'STORAGE_FORMAT_UNSUPPORTED'
      );
    }
    source = source.state;
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return createInitialDomainState();
  const version = integer(source.schemaVersion, 0);
  if (version > DOMAIN_STATE_SCHEMA_VERSION) {
    throw new DomainValidationError(
      `Domain state schema ${version} is newer than supported schema ${DOMAIN_STATE_SCHEMA_VERSION}.`,
      [issue('STATE_VERSION_UNSUPPORTED', 'A newer client is required to read this save.', 'schemaVersion')],
      'STATE_VERSION_UNSUPPORTED'
    );
  }
  if (version >= 3) return normalizeDomainState(source);
  return version < DOMAIN_STATE_SCHEMA_VERSION ? migrateLegacyState(deepClone(source)) : normalizeDomainState(source);
}

export function validateDomainState(state) {
  const issues = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return { ok: false, issues: [issue('STATE_NOT_OBJECT', 'Domain state must be an object.')] };
  if (state.schemaVersion !== DOMAIN_STATE_SCHEMA_VERSION) issues.push(issue('STATE_VERSION_INVALID', `Expected schema ${DOMAIN_STATE_SCHEMA_VERSION}.`, 'schemaVersion'));
  if (!ROUTE_SCENES.has(state.route?.scene)) issues.push(issue('ROUTE_SCENE_INVALID', 'Current route scene is invalid.', 'route.scene'));
  if (!SYSTEM_CATALOG[state.route?.systemId]) issues.push(issue('SYSTEM_UNKNOWN', 'Current route system is not in the catalog.', 'route.systemId'));
  for (const key of RESOURCE_KEYS) {
    if (!Number.isInteger(state.resources?.[key]) || state.resources[key] < 0) issues.push(issue('RESOURCE_INVALID', `${key} must be a non-negative integer.`, `resources.${key}`));
  }
  for (const districtId of SHIP_DISTRICT_IDS) {
    const definition = DISTRICT_CATALOG[districtId];
    const district = state.ship?.districts?.[districtId];
    if (!district || !Number.isInteger(district.level) || district.level < 1 || district.level > 3) {
      issues.push(issue('DISTRICT_LEVEL_INVALID', `${districtId} must be at level 1-3.`, `ship.districts.${districtId}.level`));
      continue;
    }
    if (definition.fixed && district.level !== definition.initialLevel) issues.push(issue('FIXED_DISTRICT_INVALID', `${districtId} is fixed at level ${definition.initialLevel}.`, `ship.districts.${districtId}.level`));
    if (typeof district.commissioned !== 'boolean' || district.built !== district.commissioned) issues.push(issue('DISTRICT_COMMISSION_INVALID', `${districtId} commissioning state is invalid.`, `ship.districts.${districtId}.commissioned`));
    if (!district.facilities || !district.facilityOffline) issues.push(issue('DISTRICT_FACILITIES_INVALID', `${districtId} facility state is missing.`, `ship.districts.${districtId}.facilities`));
    else {
      if (district.commissioned && !definition.fixed && district.facilities.tier1 !== getCoreFacilityId(districtId)) issues.push(issue('DISTRICT_CORE_INVALID', `${districtId} requires its Tier-1 core.`, `ship.districts.${districtId}.facilities.tier1`));
      for (const tier of [2, 3]) {
        const facilityId = district.facilities[`tier${tier}`];
        if (facilityId && (CONSTRUCTION_FACILITY_CATALOG[facilityId]?.districtId !== districtId || CONSTRUCTION_FACILITY_CATALOG[facilityId]?.tier !== tier || district.level < tier)) issues.push(issue('DISTRICT_FACILITY_INVALID', `${districtId} has an invalid Tier-${tier} facility.`, `ship.districts.${districtId}.facilities.tier${tier}`));
      }
    }
    for (const socket of definition.sockets) {
      const moduleId = district.modules?.[socket.id];
      if (moduleId === null) continue;
      if (!MODULE_CATALOG[moduleId] || socket.unlockLevel > district.level || !socket.compatibleModuleIds.includes(moduleId)) issues.push(issue('DISTRICT_MODULE_INVALID', `${districtId} has an incompatible module in ${socket.id}.`, `ship.districts.${districtId}.modules.${socket.id}`));
    }
  }
  if (!Number.isInteger(state.ship?.expeditionCycle) || state.ship.expeditionCycle < 0) issues.push(issue('EXPEDITION_CYCLE_INVALID', 'Expedition cycle must be a non-negative integer.', 'ship.expeditionCycle'));
  if (!Array.isArray(state.ship?.constructionQueue) || state.ship.constructionQueue.length > CONSTRUCTION_QUEUE_LIMIT) issues.push(issue('CONSTRUCTION_QUEUE_INVALID', 'Construction queue is invalid.', 'ship.constructionQueue'));
  else {
    const jobIds = new Set();
    state.ship.constructionQueue.forEach((job, index) => {
      if (!job || typeof job.id !== 'string' || jobIds.has(job.id) || job.queueOrder !== index || !DISTRICT_CATALOG[job.districtId] || !['commission', 'tier', 'retrofit'].includes(job.kind) || !Number.isInteger(job.workRequired) || !Number.isInteger(job.workCompleted) || job.workCompleted < 0 || job.workCompleted >= job.workRequired) issues.push(issue('CONSTRUCTION_JOB_INVALID', 'Construction queue contains an invalid job.', `ship.constructionQueue.${index}`));
      else jobIds.add(job.id);
    });
  }
  if (!Array.isArray(state.ship?.processedCycleEventIds) || new Set(state.ship.processedCycleEventIds).size !== state.ship.processedCycleEventIds.length) issues.push(issue('EXPEDITION_EVENT_LEDGER_INVALID', 'Processed construction event IDs must be unique.', 'ship.processedCycleEventIds'));
  if (state.factions?.brood || state.factions?.uga) issues.push(issue('NON_RESIDENT_FACTION_STATE', 'UGA and Brood cannot appear in the resident faction roster.', 'factions'));
  let residentCount = 0;
  for (const factionId of RESIDENT_FACTION_IDS) {
    const faction = state.factions?.[factionId];
    if (!faction || !FACTION_STATUSES.has(faction.status)) {
      issues.push(issue('FACTION_STATE_INVALID', `${factionId} has an invalid state.`, `factions.${factionId}`));
      continue;
    }
    if (faction.resident) residentCount += 1;
    if (!faction.resident && faction.status !== 'nonresident') issues.push(issue('NONRESIDENT_STATUS_INVALID', `${factionId} must remain nonresident until recruited.`, `factions.${factionId}.status`));
    for (const field of ['reputation', 'loyalty', 'readiness', 'recoveryCycles', 'operationsCompleted']) {
      if (!Number.isInteger(faction[field]) || faction[field] < 0) issues.push(issue('FACTION_VALUE_INVALID', `${factionId}.${field} must be a non-negative integer.`, `factions.${factionId}.${field}`));
    }
  }
  const factionTier = DISTRICT_CATALOG.factions.tiers[(state.ship?.districts?.factions?.level || 1) - 1];
  if (factionTier && residentCount > factionTier.capacity.residentCapacity) issues.push(issue('RESIDENT_CAPACITY_EXCEEDED', 'Faction Quarters cannot support the current resident roster.', 'factions'));
  for (const [commanderId, definition] of Object.entries(COMMANDER_CATALOG)) {
    const person = state.personnel?.commanders?.[commanderId];
    if (!person || !PERSONNEL_STATUSES.has(person.status)) issues.push(issue('COMMANDER_STATE_INVALID', `${commanderId} has an invalid state.`, `personnel.commanders.${commanderId}`));
    else if (person.unlocked && !state.factions[definition.factionId].resident) issues.push(issue('COMMANDER_RESIDENCY_INVALID', `${commanderId} is unlocked without faction residency.`, `personnel.commanders.${commanderId}.unlocked`));
  }
  for (const [specialistId, definition] of Object.entries(SPECIALIST_CATALOG)) {
    const person = state.personnel?.specialists?.[specialistId];
    if (!person || !PERSONNEL_STATUSES.has(person.status)) issues.push(issue('SPECIALIST_STATE_INVALID', `${specialistId} has an invalid state.`, `personnel.specialists.${specialistId}`));
    else if (person.unlocked && !state.factions[definition.factionId].resident) issues.push(issue('SPECIALIST_RESIDENCY_INVALID', `${specialistId} is unlocked without faction residency.`, `personnel.specialists.${specialistId}.unlocked`));
  }
  for (const [researchId, definition] of Object.entries(RESEARCH_CATALOG)) {
    const value = state.research?.progressById?.[researchId];
    if (!Number.isInteger(value) || value < 0 || value > definition.cost) issues.push(issue('RESEARCH_PROGRESS_INVALID', `${researchId} progress is invalid.`, `research.progressById.${researchId}`));
  }
  for (const surveyId of Object.keys(SURVEY_CATALOG)) {
    const survey = state.surveys?.[surveyId];
    if (!survey || !['locked', 'available', 'completed'].includes(survey.status)) issues.push(issue('SURVEY_STATE_INVALID', `${surveyId} has an invalid state.`, `surveys.${surveyId}`));
  }
  for (const systemId of Object.keys(SYSTEM_CATALOG)) {
    if (!state.world?.systems?.[systemId]) issues.push(issue('WORLD_SYSTEM_STATE_MISSING', `${systemId} world state is missing.`, `world.systems.${systemId}`));
  }
  const pending = state.operations?.pending;
  if (pending) {
    const proxyFactionId = pending.proxyFactionId || pending.playerFactionId;
    if (!RESIDENT_FACTION_IDS.includes(proxyFactionId) || !state.factions[proxyFactionId]?.resident) issues.push(issue('PENDING_PROXY_INVALID', 'Pending operation must use a resident proxy faction.', 'operations.pending.proxyFactionId'));
    else if (state.factions[proxyFactionId].status !== 'deployed') issues.push(issue('PENDING_PROXY_NOT_DEPLOYED', 'Pending operation proxy must be deployed.', `factions.${proxyFactionId}.status`));
    if (state.personnel.commanders[pending.commanderId]?.status !== 'deployed') issues.push(issue('PENDING_COMMANDER_NOT_DEPLOYED', 'Pending operation commander must be deployed.', 'operations.pending.commanderId'));
    if (!Array.isArray(pending.specialistIds) || pending.specialistIds.length !== 3 || pending.specialistIds.some(id => state.personnel.specialists[id]?.status !== 'deployed')) issues.push(issue('PENDING_SPECIALISTS_NOT_DEPLOYED', 'Pending operation must have three deployed specialists.', 'operations.pending.specialistIds'));
  }
  for (const factionId of RESIDENT_FACTION_IDS) {
    if (state.factions[factionId]?.status === 'deployed' && (pending?.proxyFactionId || pending?.playerFactionId) !== factionId) issues.push(issue('ORPHANED_DEPLOYMENT', `${factionId} is deployed without a matching operation.`, `factions.${factionId}.status`));
  }
  if (!Number.isInteger(state.operations?.nextSequence) || state.operations.nextSequence < 1) issues.push(issue('OPERATION_SEQUENCE_INVALID', 'Operation sequence must be positive.', 'operations.nextSequence'));
  const appliedIds = state.operations?.appliedResultIds;
  if (!Array.isArray(appliedIds) || new Set(appliedIds).size !== appliedIds.length) issues.push(issue('RESULT_LEDGER_INVALID', 'Applied result IDs must be a unique array.', 'operations.appliedResultIds'));
  return { ok: issues.length === 0, issues };
}

export function assertDomainState(state) {
  const validation = validateDomainState(state);
  if (!validation.ok) throw new DomainValidationError('Domain state is invalid.', validation.issues);
  return state;
}

export function serializeDomainState(state) {
  const normalized = normalizeDomainState(state);
  assertDomainState(normalized);
  return stableStringify({ storageFormatVersion: DOMAIN_STORAGE_FORMAT_VERSION, state: normalized });
}

export function deserializeDomainState(serialized) {
  const state = migrateDomainState(serialized);
  assertDomainState(state);
  return state;
}

export function createMemoryStorage(initialEntries = {}) {
  const entries = new Map(Object.entries(initialEntries).map(([key, value]) => [String(key), String(value)]));
  return {
    get length() { return entries.size; },
    key(index) { return [...entries.keys()][index] ?? null; },
    getItem(key) { return entries.has(String(key)) ? entries.get(String(key)) : null; },
    setItem(key, value) { entries.set(String(key), String(value)); },
    removeItem(key) { entries.delete(String(key)); },
    clear() { entries.clear(); }
  };
}

function defaultStorage() {
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch (_) {
    // Some native/webview sandboxes expose localStorage but deny access.
  }
  return createMemoryStorage();
}

export class LocalDomainStore {
  constructor({ storage = defaultStorage(), key = DOMAIN_STORAGE_KEY, initialState = null } = {}) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new TypeError('LocalDomainStore requires a Storage-compatible object.');
    this.storage = storage;
    this.key = key;
    this.initialState = initialState ? normalizeDomainState(initialState) : null;
    this.lastLoadError = null;
    this.listeners = new Set();
    this.current = null;
  }

  load({ recover = true } = {}) {
    const serialized = this.storage.getItem(this.key);
    if (serialized === null) {
      this.current = deepClone(this.initialState || createInitialDomainState());
      return deepClone(this.current);
    }
    try {
      this.current = deserializeDomainState(serialized);
      this.lastLoadError = null;
      return deepClone(this.current);
    } catch (error) {
      this.lastLoadError = error;
      if (!recover) throw error;
      this.current = deepClone(this.initialState || createInitialDomainState());
      return deepClone(this.current);
    }
  }

  getState() {
    if (!this.current) this.load();
    return deepClone(this.current);
  }

  subscribe(listener, { emitCurrent = false } = {}) {
    if (typeof listener !== 'function') throw new TypeError('LocalDomainStore.subscribe requires a function.');
    this.listeners.add(listener);
    if (emitCurrent) listener(this.getState(), { type: 'current', previous: null });
    return () => this.listeners.delete(listener);
  }

  notify(state, type, previous) {
    for (const listener of [...this.listeners]) listener(deepClone(state), { type, previous: previous ? deepClone(previous) : null });
  }

  save(state, { type = 'save' } = {}) {
    const previous = this.current ? deepClone(this.current) : null;
    const normalized = normalizeDomainState(state);
    assertDomainState(normalized);
    this.storage.setItem(this.key, serializeDomainState(normalized));
    this.current = deepClone(normalized);
    this.lastLoadError = null;
    this.notify(this.current, type, previous);
    return deepClone(this.current);
  }

  transact(update, { type = 'transaction' } = {}) {
    if (typeof update !== 'function') throw new TypeError('LocalDomainStore.transact requires a function.');
    const current = this.current ? deepClone(this.current) : this.load({ recover: false });
    const draft = deepClone(current);
    const updated = update(draft);
    if (updated && typeof updated.then === 'function') throw new TypeError('LocalDomainStore transactions must be synchronous.');
    const next = updated === undefined ? draft : updated;
    if (stableStringify(next) !== stableStringify(current) && integer(next.revision, 0) <= current.revision) next.revision = current.revision + 1;
    return this.save(next, { type });
  }

  reset({ showcaseReady = false } = {}) {
    const state = showcaseReady ? createShowcaseReadyDomainState() : createInitialDomainState();
    return this.save(state, { type: 'reset' });
  }

  clear() {
    const previous = this.current ? deepClone(this.current) : null;
    this.storage.removeItem(this.key);
    this.current = null;
    const state = this.load();
    this.notify(state, 'clear', previous);
    return state;
  }
}

export function getDistrictState(state, districtId) {
  return state.ship?.districts?.[districtId] || null;
}

export function getResidentFactionIds(state) {
  return RESIDENT_FACTION_IDS.filter(factionId => state.factions?.[factionId]?.resident);
}

export function getReadyCommanderIds(state, factionId) {
  return Object.keys(COMMANDER_CATALOG).filter(id => COMMANDER_CATALOG[id].factionId === factionId && state.personnel?.commanders?.[id]?.status === 'ready' && !state.personnel.commanders[id].injury);
}

export function getReadySpecialistIds(state, factionId) {
  return Object.keys(SPECIALIST_CATALOG).filter(id => SPECIALIST_CATALOG[id].factionId === factionId && state.personnel?.specialists?.[id]?.status === 'ready' && !state.personnel.specialists[id].injury);
}
