import {
  COMMANDER_CATALOG,
  DISCOVERY_CATALOG,
  DISTRICT_ADJACENCIES,
  DISTRICT_CATALOG,
  FACTION_CATALOG,
  MISSION_CATALOG,
  MODULE_CATALOG,
  RESEARCH_CATALOG,
  RESIDENT_FACTION_IDS,
  SALVAGE_CATALOG,
  RESOURCE_KEYS,
  SHIP_DECKS,
  SHIP_DISTRICT_IDS,
  SPECIALIST_CATALOG,
  SURVEY_CATALOG,
  UGA_GROUND_AREA_CATALOG,
  UGA_GROUND_AREA_LADDER,
  UGA_PLANET_LADDER,
  SYSTEM_CATALOG,
  getPlanetLadderEntry,
  getPlanetPrimarySurveyId,
  refreshChainedSurveyAvailability,
  getUgaGroundAreaOptions
} from './catalog.js';
import { COMMANDER1_BY_CAMPAIGN_FACTION, isSelectableCommanderIdV1 } from './commander_roster_contract.js';
import { clamp, deepClone } from './deterministic.js';
import { DomainValidationError, issue } from './errors.js';
import { assertDomainState } from './state_store.js';
import { isGroundAreaUnlocked, isPlanetUnlocked } from './ground_control.js';
import { CONSTRUCTION_FACILITY_CATALOG, getFacilityChoices } from './construction_catalog.js';
import {
  advanceExpeditionCycles,
  calculateFacilityCapabilities,
  enqueueConstruction,
  getCoreCommissionReserve,
  getConstructionQuote,
  getConstructionStatus
} from './construction.js';
import { advanceRecoveryCycles } from './recovery.js';

export const SOLO_FRONT_PRESSURE_CAP = 100;
export const SOLO_FRONT_PRESSURE_PER_CYCLE = 2;
export const DUTY_WATCH_MAX_CYCLES = 2;
export const DUTY_WATCH_INTEL_DECAY = 1;
export const UGA_SCAN_NEXT_ACTION_VERSION = 1;
export const UGA_REFUEL_TARGET = 30;
export const UGA_REFUEL_CREDITS_PER_UNIT = 20;
export const UGA_REFUEL_EMERGENCY_CLEARANCE_CREDITS = 600;
export const UGA_PROBE_STORES_TARGET = 3;
export const UGA_PROBE_CREDITS_PER_UNIT = 150;

/* Keep a scanned area first when it is playable, but never send a commander
   past an uncleared ready operation just because an archived replay was first
   in catalog order. A locked local area remains visible on the board; another
   ready area is the actionable selection until its prerequisites are met. */
export function chooseGalaxyOperationId(missions, eligibleMissionIds = [], controlledAreaIds = [], preferredAreaId = null) {
  const available = Array.isArray(missions) ? missions.filter(mission => mission?.id) : [];
  const preferred = preferredAreaId && available.find(mission => mission.groundAreaId === preferredAreaId);
  const ordered = preferred ? [preferred, ...available.filter(mission => mission !== preferred)] : available;
  const eligible = new Set(eligibleMissionIds);
  const controlled = new Set(controlledAreaIds);
  return ordered.find(mission => eligible.has(mission.id) && !controlled.has(mission.groundAreaId))?.id
    || ordered.find(mission => !controlled.has(mission.groundAreaId))?.id
    || ordered.find(mission => eligible.has(mission.id))?.id
    || ordered[0]?.id || null;
}

// These finite discoveries gate the authored campaign. Reserve an emergency
// launch for each rather than granting a probe that could be spent on ore or
// mission support, and do not silently extend the waiver to optional content.
const CAMPAIGN_CRITICAL_SURVEY_IDS = new Set([
  'aelos_traffic_census', 'aelos_phase_trace', 'aelos_capitol_vector',
  'veyra_photon_ring', 'veyra_derelict_echo', 'veyra_cinder_reach_fix',
  'karak_silent_beacons', 'karak_hive_scan', 'karak_grid_triangulation'
]);

function fail(message, code, path = '') {
  throw new DomainValidationError(message, [issue(code, message, path)], code);
}

/* FRONTIER LADDER PROJECTION ----------------------------------------------
   The unlock predicates (isPlanetUnlocked / isGroundAreaUnlocked) and the
   eligibility locks are the authority; this projects the same catalogs into
   display rows so the hub's dedication ladder board renders exactly what the
   gates enforce. Lives domain-side because it reads four catalog exports the
   UI should not import directly — the UI already speaks to the domain through
   progression and ground_control. */
export function frontierLadderRows(state, control) {
  const systems = Object.values(SYSTEM_CATALOG).sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  return systems.map(system => {
    const systemId = system.id;
    const reached = state.world?.systems?.[systemId]?.discovered === true;
    const planets = (UGA_PLANET_LADDER[systemId] || []).map(rung => {
      const ladder = getPlanetLadderEntry(systemId, rung.id);
      const open = isPlanetUnlocked(state, systemId, rung.id);
      /* Two different surveys matter and conflating them would lie: this
         body's own primary survey is what CHARTS it, while the PRIOR body's
         primary survey is the gate that OPENS the rung (that is exactly what
         isPlanetUnlocked tests). Show the first as the chip and the second
         as the note. */
      const primarySurveyId = getPlanetPrimarySurveyId(rung.id);
      const surveyRecord = primarySurveyId ? state.surveys?.[primarySurveyId] : null;
      const charted = !primarySurveyId || surveyRecord?.depleted === true || surveyRecord?.status === 'completed';
      const gateSurveyId = ladder?.prior ? getPlanetPrimarySurveyId(ladder.prior.id) : null;
      const gateSurvey = gateSurveyId ? SURVEY_CATALOG[gateSurveyId] : null;
      const gateDone = !gateSurveyId || state.surveys?.[gateSurveyId]?.depleted === true || state.surveys?.[gateSurveyId]?.status === 'completed';
      let chip, note;
      if (charted) {
        /* A body with no authored primary survey charts trivially (nothing
           gates on it), but "CHARTED" there would claim a scan the player
           never ran — Zephyros showed that lie on the first render. */
        chip = primarySurveyId ? 'CHARTED' : 'OPEN';
        note = primarySurveyId ? 'Primary survey complete' : 'No primary survey authored';
      }
      else if (!ladder?.prior) { chip = 'SURVEY'; note = 'Open — primary survey pending'; }
      else if (!gateDone) { chip = 'UNCHARTED'; note = gateSurvey ? `Requires: ${gateSurvey.name}` : 'Chart the prior body first'; }
      else { chip = 'READY'; note = 'Gate open — primary survey pending'; }
      const areas = (UGA_GROUND_AREA_LADDER[rung.id] || []).map(areaId => {
        const area = UGA_GROUND_AREA_CATALOG[areaId];
        const record = control?.areas?.[areaId];
        if (!area || !record) return null;
        return {
          id: areaId,
          name: record.areaName,
          cleared: record.clearedMapIds.length,
          total: record.totalMaps,
          held: record.controlled === true,
          open: isGroundAreaUnlocked(state, areaId)
        };
      }).filter(Boolean);
      return { id: rung.id, name: rung.name, open, charted, chip, note, areas };
    });
    return { id: systemId, name: system.name, classification: system.classification || '', reached, planets };
  });
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
    if (survey.systemId !== systemId || state.surveys[survey.id].depleted) continue;
    // Chain-gated route surveys stay 'locked' until their prerequisites are
    // depleted — system unlock and chain rung are independent gates.
    const chained = (survey.requiredSurveyIds || []).some(id => state.surveys[id]?.depleted !== true && state.surveys[id]?.status !== 'completed');
    state.surveys[survey.id].status = chained ? 'locked' : 'available';
  }
}

export function getSurveyNextAction(state, surveyId, rewards = {}) {
  const survey = SURVEY_CATALOG[surveyId];
  if (!survey) return null;
  const missionIds = Object.values(MISSION_CATALOG)
    .filter(mission => mission.systemId === survey.systemId)
    .filter(mission => (mission.requirements.discoveryIds || []).includes(survey.discoveryId))
    .filter(mission => (mission.requirements.discoveryIds || []).every(id => state.discoveries.foundIds.includes(id)))
    .map(mission => mission.id);
  // One discovery can unlock operations on another planet in this system.
  // Keep every area, but present the surveyed planet first where it has one.
  const areas = missionIds.map(getUgaGroundAreaOptions).filter(Boolean)
    .sort((a, b) => Number(b.planetId === survey.planetId) - Number(a.planetId === survey.planetId));
  const resourceKeys = Object.keys(rewards).filter(key => RESOURCE_KEYS.includes(key) && Number(rewards[key]) > 0).sort();
  const shared = {
    schemaVersion: UGA_SCAN_NEXT_ACTION_VERSION,
    kind: 'UgaScanNextActionV1',
    systemId: survey.systemId,
    planetId: survey.planetId,
    resourceKeys,
    missionIds,
    areaIds: areas.map(area => area.areaId),
    areas
  };
  // Meridian's first scan reveals the infested region, not a deployable purge.
  // Pale Bloom still needs confirmed hive geometry from a second authored scan;
  // guide the player to the laboratory instead of a locked operation card.
  if (surveyId === 'karak_silent_beacons'
    && !state.world.systems.karak.infestation.hiveTargetsConfirmed
    && !state.surveys.karak_hive_scan?.depleted) {
    const labReady = state.ship.districts.survey.commissioned !== false
      && state.ship.districts.survey.level >= SURVEY_CATALOG.karak_hive_scan.requiredSurveyLevel;
    return {
      ...shared,
      action: labReady ? 'continue-survey' : 'prepare-survey-lab',
      label: labReady ? 'SCAN HIVE TARGETS' : 'UPGRADE SURVEY LAB · LEVEL 3',
      primaryAreaId: null,
      targetSystemId: survey.systemId,
      targetSurveyId: 'karak_hive_scan'
    };
  }
  if (areas.length) return {
    ...shared,
    action: 'inspect-ground-area',
    label: 'CHOOSE PLANET AND AREA',
    primaryAreaId: areas[0].areaId,
    targetSystemId: survey.systemId
  };
  if (survey.unlockSystemId) return {
    ...shared,
    action: 'plot-system-course',
    label: `PLOT COURSE TO ${SYSTEM_CATALOG[survey.unlockSystemId].name.toUpperCase()}`,
    primaryAreaId: null,
    targetSystemId: survey.unlockSystemId
  };
  const localSignalsRemain = Object.values(SURVEY_CATALOG).some(entry => entry.systemId === survey.systemId && !state.surveys[entry.id]?.depleted);
  return {
    ...shared,
    action: localSignalsRemain ? 'continue-survey' : 'review-frontier',
    label: localSignalsRemain ? 'CONTINUE ORBITAL SURVEY' : 'REVIEW FRONTIER STATUS',
    primaryAreaId: null,
    targetSystemId: survey.systemId
  };
}

function hasUnresolvedSoloFront(state, systemId) {
  return Object.values(MISSION_CATALOG).some(mission => (
    mission.systemId === systemId && (state.missions[mission.id]?.completions || 0) < 1
  ));
}

export function advanceSoloFrontPressure(state, cycles, cause = 'expedition') {
  assertDomainState(state);
  if (!Number.isInteger(cycles) || cycles < 1) fail('Solo-front cycles must be a positive integer.', 'SOLO_FRONT_CYCLES_INVALID', 'cycles');
  const next = deepClone(state);
  for (const [systemId, world] of Object.entries(next.world.systems)) {
    const front = world.soloFront;
    front.lastCycle = next.ship.expeditionCycle;
    front.lastCause = cause;
    front.lastDelta = 0;
    if (!world.discovered || !hasUnresolvedSoloFront(next, systemId)) continue;
    const previous = front.pressure;
    front.pressure = clamp(previous + cycles * SOLO_FRONT_PRESSURE_PER_CYCLE, 0, SOLO_FRONT_PRESSURE_CAP);
    front.lastDelta = front.pressure - previous;
  }
  assertDomainState(next);
  return next;
}

/* L1 — the strategic clock.

   Before this action the expedition cycle only moved when the player did
   something: survey (+1), transit (+2), operation (+2). Construction and
   recovery therefore never progressed on a quiet front, and the REQUIRED
   CORE commission could deadlock a player with no probe, no fuel and no
   mission — the exact 0/2 WORK stall seen on device. A "wait" that cannot
   be repeated also needs a cap: without one, an idle button is an infinite
   construction cycle generator (L2 pressure made it slightly negative, but
   a free infinite loop is still not a loop), so one watch costs the same
   pressure the other cycle sources pay and is capped per event. */
export function getDutyWatchQuote(state) {
  assertDomainState(state);
  if (state.operations.pending) {
    return { available: false, cycles: 0, maxCycles: DUTY_WATCH_MAX_CYCLES, pressurePerCycle: SOLO_FRONT_PRESSURE_PER_CYCLE, reason: 'OPERATION_PENDING' };
  }
  return { available: true, cycles: DUTY_WATCH_MAX_CYCLES, maxCycles: DUTY_WATCH_MAX_CYCLES, pressurePerCycle: SOLO_FRONT_PRESSURE_PER_CYCLE, reason: null };
}

export function holdDutyWatch(state) {
  const quote = getDutyWatchQuote(state);
  if (!quote.available) fail('Resolve the pending ground operation before advancing expedition cycles.', 'OPERATION_PENDING', 'operations.pending');
  assertDomainState(state);
  const eventId = `watch:${state.ship.expeditionCycle}:${state.revision}`;
  const advanced = advanceExpeditionCycles(state, quote.cycles, eventId, 'duty-watch');
  if (!advanced.advanced) return { state, advanced: false, completedJobs: [], breach: [] };
  const pressured = advanceSoloFrontPressure(advanced.state, quote.cycles, eventId);
  // At the cap a front stops being a timer and becomes a battlefield. Clamp
  // reads at 100 with one band of intel decay (L2 consequence) and a stable
  // breach marker the UI can act on, instead of silently looping forever.
  const breached = Object.keys(pressured.world.systems).filter(systemId => {
    const front = pressured.world.systems[systemId].soloFront;
    return front.pressure >= SOLO_FRONT_PRESSURE_CAP && Boolean(pressured.world.systems[systemId].discovered);
  });
  let next = pressured;
  if (breached.length) {
    next = deepClone(pressured);
    for (const systemId of breached) {
      const system = next.world.systems[systemId];
      system.soloFront.pressure = SOLO_FRONT_PRESSURE_CAP;
      system.soloFront.lastCause = 'breach';
      const previousIntel = next.intelligence.bySystem[systemId] || 0;
      next.intelligence.bySystem[systemId] = clamp(previousIntel - DUTY_WATCH_INTEL_DECAY, 0, 5);
      system.soloFront.lastDelta = -DUTY_WATCH_INTEL_DECAY;
    }
    next.revision += 1;
    assertDomainState(next);
  }
  return { state: next, advanced: true, completedJobs: advanced.completedJobs, breach: breached };
}

export function applySoloFrontPressureDelta(state, systemId, delta, cause = 'mission_result') {
  assertDomainState(state);
  if (!SYSTEM_CATALOG[systemId]) fail('Unknown solo-front system.', 'SYSTEM_UNKNOWN', 'systemId');
  if (!Number.isInteger(delta) || delta < -100 || delta > 100) fail('Solo-front delta must be an integer from -100 to 100.', 'SOLO_FRONT_DELTA_INVALID', 'delta');
  const next = deepClone(state);
  const front = next.world.systems[systemId].soloFront;
  const previous = front.pressure;
  front.pressure = clamp(previous + delta, 0, SOLO_FRONT_PRESSURE_CAP);
  front.lastCycle = next.ship.expeditionCycle;
  front.lastDelta = front.pressure - previous;
  front.lastCause = cause;
  assertDomainState(next);
  return next;
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
  /* Staff perks can discount module components (Harmonic Synthesis). This is
     the only module purchase path, so scaling the catalog cost HERE keeps the
     perk's promise true without a parallel quote surface to drift from it. */
  const moduleCostPct = calculateFacilityCapabilities(state).moduleCostPct || 0;
  const cost = {};
  for (const [key, amount] of Object.entries(module.cost || {})) cost[key] = Math.max(0, Math.round(amount * (100 + moduleCostPct) / 100));
  assertCost(state.resources, cost);
  const next = deepClone(state);
  spend(next.resources, cost);
  next.ship.districts[districtId].modules[socketId] = moduleId;
  const reserve = getCoreCommissionReserve(next);
  if (reserve.active) {
    for (const [key, required] of Object.entries(reserve.cost)) {
      if ((next.resources[key] || 0) < required) fail(`Keep ${required} ${key} for core commissioning and first deployment.`, 'CORE_COMMISSION_RESERVE', `resources.${key}`);
    }
    // An affordable module can still strand a queued core by consuming its
    // last powered construction slot. Check after fitting its actual draw.
    if (!reserve.powerOk) fail(reserve.powerIssue?.message || 'Keep a powered construction slot for core commissioning.', 'CORE_COMMISSION_POWER_RESERVE', 'ship.power');
  }
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
  if (!state.commissioning?.completed) fail('Complete new-career faction commissioning before recruiting resident factions.', 'CAREER_COMMISSIONING_REQUIRED', 'commissioning');
  if (state.ship?.districts?.factions?.commissioned === false) fail('Coalition Embassy must be commissioned before faction residency.', 'EMBASSY_NOT_COMMISSIONED', 'ship.districts.factions.commissioned');
  if (!RESIDENT_FACTION_IDS.includes(factionId) || !FACTION_CATALOG[factionId]?.hireable) fail('Only the Nova Coalition, Crimson Dominion, or Syndicate Coalition can become residents.', 'FACTION_NOT_RESIDENT_CAPABLE', 'factionId');
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
  for (const [commanderId, definition] of Object.entries(COMMANDER_CATALOG)) {
    if (definition.factionId !== factionId) continue;
    const commander = next.personnel.commanders[commanderId];
    commander.unlocked = true;
    commander.status = commander.injury ? 'recovering' : 'ready';
    commander.readiness = 100;
  }
  for (const [specialistId, definition] of Object.entries(SPECIALIST_CATALOG)) {
    if (definition.factionId !== factionId) continue;
    const specialist = next.personnel.specialists[specialistId];
    specialist.unlocked = true;
    specialist.status = specialist.injury ? 'recovering' : 'ready';
    specialist.readiness = 100;
  }
  next.revision += 1;
  assertDomainState(next);
  return next;
}

export function commissionCareerFaction(state, factionId, commanderId = COMMANDER1_BY_CAMPAIGN_FACTION[factionId]) {
  assertDomainState(state);
  if (!RESIDENT_FACTION_IDS.includes(factionId) || !FACTION_CATALOG[factionId]?.hireable) fail('Choose the Nova Coalition, Crimson Dominion, or Syndicate Coalition for career commissioning.', 'COMMISSIONING_FACTION_INVALID', 'factionId');
  if (!isSelectableCommanderIdV1(commanderId) || !COMMANDER_CATALOG[commanderId] || COMMANDER_CATALOG[commanderId].factionId !== factionId) fail('Commissioning commander is not selectable for this faction.', 'COMMISSIONING_COMMANDER_INVALID', 'commanderId');
  if (commanderId !== COMMANDER1_BY_CAMPAIGN_FACTION[factionId]) fail('A new career begins with that faction\'s Commander 1.', 'COMMISSIONING_COMMANDER1_REQUIRED', 'commanderId');
  if (state.commissioning?.completed) {
    if (state.commissioning.factionId === factionId && state.commissioning.commanderId === commanderId) return state;
    fail('Career faction commissioning is permanent.', 'COMMISSIONING_ALREADY_COMPLETE', 'commissioning');
  }

  const next = deepClone(state);
  const completedRevision = state.revision + 1;
  next.commissioning = { factionId, commanderId, completed: true, completedRevision };
  const faction = next.factions[factionId];
  faction.resident = true;
  faction.recruitmentComplete = true;
  faction.status = 'ready';
  faction.readiness = 100;
  faction.loyalty = Math.max(50, faction.loyalty);
  faction.residentSinceRevision = completedRevision;

  const commander = next.personnel.commanders[commanderId];
  commander.unlocked = true;
  commander.status = commander.injury ? 'recovering' : 'ready';
  commander.readiness = 100;
  commander.loyalty = Math.max(50, commander.loyalty);
  for (const [specialistId, definition] of Object.entries(SPECIALIST_CATALOG)) {
    if (definition.factionId !== factionId) continue;
    const specialist = next.personnel.specialists[specialistId];
    specialist.unlocked = true;
    specialist.status = specialist.injury ? 'recovering' : 'ready';
    specialist.readiness = 100;
  }
  next.revision = completedRevision;
  assertDomainState(next);
  return next;
}

export function surveySensorProfile(state) {
  const district = state?.ship?.districts?.survey;
  const level = Math.max(1, Number(district?.level) || 1);
  const commissioned = district?.commissioned !== false;
  const cap = DISTRICT_CATALOG.survey?.tiers?.[level - 1]?.capacity || {};
  const range = Math.max(0.4, (cap.probeRange || 1) * (commissioned ? 1 : 0.4));
  const threshold = Math.max(46, 82 - (level - 1) * 12);
  return { range, threshold, level, commissioned };
}

export function getSurveyEligibility(state, surveyId, opts = {}) {
  const survey = SURVEY_CATALOG[surveyId];
  if (!survey) return { ok: false, issues: [issue('SURVEY_UNKNOWN', 'Unknown survey.', 'surveyId')] };
  const issues = [];
  const surveyState = state.surveys[surveyId];
  if (!state.world.systems[survey.systemId].discovered) issues.push(issue('SYSTEM_UNDISCOVERED', 'Survey system has not been discovered.', `world.systems.${survey.systemId}.discovered`));
  if (surveyState.depleted || surveyState.status === 'completed') issues.push(issue('SURVEY_DEPLETED', 'This authored survey has already been exhausted.', `surveys.${surveyId}.depleted`));
  if (surveyState.status === 'locked') issues.push(issue('SURVEY_LOCKED', 'Survey is not yet available.', `surveys.${surveyId}.status`));
  // Frontier ladder, tier 1 — route surveys chain: a scan with
  // requiredSurveyIds refuses to run until every listed scan is completed,
  // so the galaxy chart opens one system at a time in authored order.
  for (const prerequisiteId of survey.requiredSurveyIds || []) {
    const prerequisite = state.surveys?.[prerequisiteId];
    if (prerequisite?.depleted !== true && prerequisite?.status !== 'completed') {
      issues.push(issue('SURVEY_CHAIN_REQUIRED', `Complete ${SURVEY_CATALOG[prerequisiteId]?.name || 'the previous survey'} first.`, `surveys.${prerequisiteId}.depleted`));
      break;
    }
  }
  // Frontier ladder, tier 2 — a system's bodies chart in sequence: planet N
  // opens when planet N-1's primary authored survey has been completed.
  if (survey.planetId && !isPlanetUnlocked(state, survey.systemId, survey.planetId)) {
    issues.push(issue('PLANET_LADDER_REQUIRED', 'Chart the previous world in this system first.', `surveys.${survey.planetId}`));
  }
  if (state.ship.districts.survey.commissioned === false) issues.push(issue('SURVEY_NOT_COMMISSIONED', 'Survey Lab must be commissioned.', 'ship.districts.survey.commissioned'));
  if (state.ship.districts.survey.level < survey.requiredSurveyLevel) issues.push(issue('SURVEY_LEVEL_REQUIRED', `Survey Lab level ${survey.requiredSurveyLevel} is required.`, 'ship.districts.survey.level'));
  if (opts.planetId && survey.planetId && survey.planetId !== opts.planetId) {
    issues.push(issue('SURVEY_WRONG_PLANET', 'This signal is on another body in the system.', 'planetId'));
  }
  const standardProbeCost = Math.max(1, survey.probeCost - (calculateFacilityCapabilities(state).surveyProbeDiscount || 0));
  const emergency = state.resources.probes === 0
    && !surveyState.depleted && surveyState.status !== 'completed'
    && CAMPAIGN_CRITICAL_SURVEY_IDS.has(surveyId);
  const probeCost = emergency ? 0 : standardProbeCost;
  if (state.resources.probes < probeCost) issues.push(issue('PROBE_SHORTAGE', `Survey requires ${probeCost} probe.`, 'resources.probes'));
  return { ok: issues.length === 0, issues, survey, probeCost, standardProbeCost, emergency };
}

export function spendSurveyProbe(state) {
  assertDomainState(state);
  if ((state.resources.probes || 0) < 1) fail('No probes remaining.', 'PROBE_SHORTAGE', 'resources.probes');
  const next = deepClone(state);
  next.resources.probes -= 1;
  next.revision += 1;
  return next;
}

export function recoverPlanetFind(state, find) {
  assertDomainState(state);
  const depositId = typeof find?.id === 'string' && /^[a-z0-9_]{1,96}$/.test(find.id) ? find.id : '';
  if (!depositId) fail('The planetary deposit identity is missing.', 'DEPOSIT_ID_INVALID', 'find.id');
  if (state.discoveries.extractedDepositIds.includes(depositId)) fail('This planetary deposit has already been extracted.', 'DEPOSIT_DEPLETED', 'find.id');
  const next = spendSurveyProbe(state);
  const type = find?.type;
  const amount = Math.max(0, Number(find?.amount) || 0);
  if (type && RESOURCE_KEYS.includes(type) && amount) next.resources[type] += amount;
  const discoveryId = find?.discoveryId;
  if (discoveryId && DISCOVERY_CATALOG[discoveryId] && !next.discoveries.foundIds.includes(discoveryId)) {
    next.discoveries.foundIds.push(discoveryId);
  }
  next.discoveries.extractedDepositIds.push(depositId);
  const advanced = advanceExpeditionCycles(next, 1, `survey:deposit:${depositId}`, 'survey');
  return advanceSoloFrontPressure(advanced.state, 1, `survey:deposit:${depositId}`);
}

export function recoverContactSalvage(state, contactId) {
  assertDomainState(state);
  const salvage = SALVAGE_CATALOG[contactId];
  if (!salvage) fail('No salvage manifest exists for this contact.', 'SALVAGE_UNKNOWN', 'contactId');
  if (salvage.systemId !== state.route.systemId) fail('The wreck is not in the current system.', 'SALVAGE_WRONG_SYSTEM', 'contactId');
  if (state.discoveries.extractedDepositIds.includes(salvage.id)) fail('This wreck has already been stripped.', 'SALVAGE_DEPLETED', 'contactId');
  const next = deepClone(state);
  reward(next.resources, deepClone(salvage.rewards));
  next.discoveries.extractedDepositIds.push(salvage.id);
  const advanced = advanceExpeditionCycles(next, 1, `salvage:${salvage.id}`, 'salvage');
  return {
    state: advanceSoloFrontPressure(advanced.state, 1, `salvage:${salvage.id}`),
    salvage: deepClone(salvage),
    rewards: deepClone(salvage.rewards),
    construction: advanced.completedJobs
  };
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
  // A prerequisite completed in this very deployment must open any chained
  // rung in an already-unlocked system too (same-system chains like Orion
  // behind Karak) — unlockSystemSurveys only covers the newly unlocked one.
  refreshChainedSurveyAvailability(next);
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
  const pressured = advanceSoloFrontPressure(advanced.state, 1, `survey:${surveyId}`);
  return {
    state: pressured,
    survey: deepClone(survey),
    discovery: deepClone(DISCOVERY_CATALOG[survey.discoveryId]),
    rewards: surveyRewards,
    construction: advanced.completedJobs,
    nextAction: getSurveyNextAction(pressured, surveyId, surveyRewards)
  };
}

export function getRefuelQuote(state) {
  assertDomainState(state);
  const amount = Math.max(0, UGA_REFUEL_TARGET - state.resources.fuel);
  const emergencyActive = state.ship.emergencyFuelActive === true;
  // Clear the full reserve value before normal transit can resume; otherwise
  // a one-unit paid top-up launders an emergency tank into construction cycles.
  const clearanceCost = emergencyActive ? UGA_REFUEL_EMERGENCY_CLEARANCE_CREDITS : 0;
  const creditsCost = amount * UGA_REFUEL_CREDITS_PER_UNIT + clearanceCost;
  let canPay = state.resources.credits >= creditsCost;
  if (canPay && creditsCost > 0) {
    const paidCandidate = deepClone(state);
    paidCandidate.resources.credits -= creditsCost;
    const reserve = getCoreCommissionReserve(paidCandidate);
    if (reserve.active) canPay = Object.entries(reserve.cost).every(([key, required]) => (paidCandidate.resources[key] || 0) >= required);
  }
  return {
    available: amount > 0 || (emergencyActive && canPay),
    amount,
    targetFuel: UGA_REFUEL_TARGET,
    creditsCost,
    clearanceCost,
    canPay,
    mode: canPay ? 'paid' : 'emergency',
    emergencyActive
  };
}

export function getProbeResupplyQuote(state) {
  assertDomainState(state);
  const amount = Math.max(0, UGA_PROBE_STORES_TARGET - state.resources.probes);
  const creditsCost = amount * UGA_PROBE_CREDITS_PER_UNIT;
  let canPay = amount > 0 && state.resources.credits >= creditsCost;
  if (canPay) {
    const paidCandidate = deepClone(state);
    paidCandidate.resources.credits -= creditsCost;
    const reserve = getCoreCommissionReserve(paidCandidate);
    if (reserve.active) canPay = Object.entries(reserve.cost).every(([key, required]) => (paidCandidate.resources[key] || 0) >= required);
  }
  return { available: amount > 0, amount, targetProbes: UGA_PROBE_STORES_TARGET, creditsCost, canPay };
}

export function resupplyProbes(state) {
  const quote = getProbeResupplyQuote(state);
  if (!quote.available) return state;
  if (!quote.canPay) fail('Probe resupply would consume protected commissioning supplies or exceeds available credits.', 'PROBE_RESUPPLY_UNAFFORDABLE', 'resources.credits');
  const next = deepClone(state);
  next.resources.credits -= quote.creditsCost;
  next.resources.probes += quote.amount;
  next.revision += 1;
  assertDomainState(next);
  return next;
}

export function refuelShip(state) {
  const quote = getRefuelQuote(state);
  if (!quote.available) return state;
  const next = deepClone(state);
  next.resources.fuel += quote.amount;
  if (quote.canPay) next.resources.credits -= quote.creditsCost;
  next.ship.emergencyFuelActive = !quote.canPay;
  // The bankrupt reserve is a way back into play, not a construction timer.
  next.revision += 1;
  assertDomainState(next);
  return next;
}

export function plotCourse(state, systemId) {
  assertDomainState(state);
  if (state.operations.pending) fail('Resolve the pending ground operation before plotting a course.', 'OPERATION_PENDING', 'operations.pending');
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
  const eventId = `transit:${state.route.systemId}:${systemId}:${state.revision}`;
  if (state.ship.emergencyFuelActive === true) {
    // Free rescue fuel must not become an unlimited construction-cycle button.
    // The only exception is finite core work needed to regain a playable mission.
    const essentialCommissionPending = next.ship.constructionQueue.some(job =>
      job.kind === 'commission' && (job.districtId === 'mission_ops' || job.districtId === 'hangar'));
    if (essentialCommissionPending && getConstructionStatus(next).active > 0) {
      const advanced = advanceExpeditionCycles(next, 2, eventId, 'emergency-transit');
      return advanceSoloFrontPressure(advanced.state, 2, eventId);
    }
    // Travel still consumes fuel, heals the crew, and advances the live front.
    return advanceSoloFrontPressure(advanceRecoveryCycles(next, 2), 2, eventId);
  }
  const advanced = advanceExpeditionCycles(next, 2, eventId, 'transit');
  return advanceSoloFrontPressure(advanced.state, 2, eventId);
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
  totalGeneratedMW += state.ship?.coreCommissionRescuePowerMW || 0;

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
