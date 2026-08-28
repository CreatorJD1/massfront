import { DISTRICT_CATALOG, MODULE_CATALOG, RESOURCE_KEYS, SHIP_DECKS } from './catalog.js';
import {
  CONSTRUCTION_EVENT_HISTORY_LIMIT,
  CONSTRUCTION_FACILITY_CATALOG,
  CONSTRUCTION_JOB_VERSION,
  CONSTRUCTION_POWER_PER_SLOT_MW,
  CONSTRUCTION_QUEUE_LIMIT,
  getCoreFacilityId,
  getFacilityChoices
} from './construction_catalog.js';
import { deepClone, deterministicId } from './deterministic.js';
import { DomainValidationError, issue } from './errors.js';
import { assertDomainState } from './state_store.js';

const DISTRICT_JOB_KINDS = new Set(['commission', 'tier']);

function fail(message, code, path = '') {
  throw new DomainValidationError(message, [issue(code, message, path)], code);
}

function roundPct(value, percent) {
  return Math.floor(value * (100 + percent) / 100);
}

function addEffects(target, effects) {
  for (const [key, value] of Object.entries(effects || {})) target[key] = (target[key] || 0) + value;
}

export function calculateFacilityCapabilities(state, { includeOffline = false } = {}) {
  const result = {};
  for (const district of Object.values(state.ship?.districts || {})) {
    if (district.commissioned === false) continue;
    for (const tier of [2, 3]) {
      if (!includeOffline && district.facilityOffline?.[`tier${tier}`]) continue;
      const facilityId = district.facilities?.[`tier${tier}`];
      const facility = CONSTRUCTION_FACILITY_CATALOG[facilityId];
      if (facility) addEffects(result, facility.effects);
    }
  }
  result.transitFuelPct = Math.max(-25, result.transitFuelPct || 0);
  return result;
}

export function getConstructionCapacity(state) {
  const fabricator = state.ship?.districts?.fabricator;
  const base = fabricator?.commissioned === false ? 1 : DISTRICT_CATALOG.fabricator.tiers[(fabricator?.level || 1) - 1].capacity.fabricationSlots;
  return Math.max(1, base + (calculateFacilityCapabilities(state).constructionSlots || 0));
}

function installedFacilityPower(state) {
  let total = 0;
  for (const district of Object.values(state.ship?.districts || {})) {
    if (district.commissioned === false) continue;
    for (const tier of [2, 3]) {
      if (district.facilityOffline?.[`tier${tier}`]) continue;
      const facility = CONSTRUCTION_FACILITY_CATALOG[district.facilities?.[`tier${tier}`]];
      total += facility?.powerDrawMW || 0;
    }
  }
  return total;
}

function legacyModulePower(state) {
  let draw = 0;
  let generation = 0;
  for (const district of Object.values(state.ship?.districts || {})) {
    for (const moduleId of Object.values(district.modules || {})) {
      draw += MODULE_CATALOG[moduleId]?.powerDrawMW || 0;
      generation += MODULE_CATALOG[moduleId]?.powerGenerationBonusMW || 0;
    }
  }
  return { draw, generation };
}

function powerState(state, activeJobs = null) {
  const engineering = state.ship?.districts?.engineering;
  const engineeringTier = DISTRICT_CATALOG.engineering.tiers[(engineering?.level || 1) - 1];
  const capabilities = calculateFacilityCapabilities(state);
  const legacy = legacyModulePower(state);
  const specialistGeneration = Object.values(state.ship?.districts || {}).some(district => district.staff?.includes('dominion_tech_vesk')) ? 25 : 0;
  const generatedMW = (engineeringTier.capacity.powerGenerationMW || 120) + legacy.generation + specialistGeneration + (capabilities.powerGenerationMW || 0);
  let districtMW = 0;
  const deckBOptimizer = SHIP_DECKS.B.districtIds.some(id => state.ship?.districts?.[id]?.staff?.includes('syndicate_tech_aya'));
  for (const [id, district] of Object.entries(state.ship?.districts || {})) {
    if (district.commissioned === false) continue;
    const baseDraw = DISTRICT_CATALOG[id]?.tiers[(district.level || 1) - 1]?.capacity?.powerDrawMW || 0;
    const moduleDraw = Object.values(district.modules || {}).reduce((sum, moduleId) => sum + (MODULE_CATALOG[moduleId]?.powerDrawMW || 0), 0);
    districtMW += deckBOptimizer && SHIP_DECKS.B.districtIds.includes(id) ? Math.round((baseDraw + moduleDraw) * .8) : baseDraw + moduleDraw;
  }
  const constructionPowerPerSlotMW = capabilities.constructionPowerPerSlotMW || CONSTRUCTION_POWER_PER_SLOT_MW;
  const activeCount = activeJobs == null ? Math.min(getConstructionCapacity(state), state.ship?.constructionQueue?.length || 0) : activeJobs;
  const consumedMW = districtMW + installedFacilityPower(state) + activeCount * constructionPowerPerSlotMW;
  return {
    generatedMW,
    consumedMW,
    surplusMW: generatedMW - consumedMW,
    constructionPowerPerSlotMW,
    activeCount
  };
}

function applyJobCompletion(state, job, { salvage = true } = {}) {
  const district = state.ship.districts[job.districtId];
  if (job.kind === 'commission') {
    district.commissioned = true;
    district.built = true;
    district.level = 1;
    district.facilities.tier1 = getCoreFacilityId(job.districtId);
  } else if (job.kind === 'tier') {
    district.level = job.targetTier;
    district.upgradesCompleted = Math.max(district.upgradesCompleted || 0, job.targetTier - 1);
    district.facilities[`tier${job.targetTier}`] = job.facilityId;
  } else if (job.kind === 'retrofit') {
    district.facilities[`tier${job.targetTier}`] = job.facilityId;
    district.facilityOffline[`tier${job.targetTier}`] = false;
    if (salvage && job.replacedFacilityId) {
      const oldCost = CONSTRUCTION_FACILITY_CATALOG[job.replacedFacilityId]?.cost || {};
      const pct = calculateFacilityCapabilities(state, { includeOffline: true }).retrofitSalvagePct || 40;
      for (const key of ['alloys', 'components']) state.resources[key] += Math.floor((oldCost[key] || 0) * pct / 100);
    }
  }
  district.construction = {
    completedAtCycle: state.ship.expeditionCycle,
    completedJobId: job.id,
    machinerySequence: ['utility_foundation', 'structural_frame', 'systems_install', 'operational_light']
  };
  state.ship.constructionHistory.push({ ...deepClone(job), status: 'completed', completedAtCycle: state.ship.expeditionCycle });
  state.ship.constructionHistory = state.ship.constructionHistory.slice(-24);
}

function projectQueuedPower(state, queue) {
  const projected = deepClone(state);
  projected.ship.constructionQueue = [];
  let firstDeficit = null;
  let power = powerState(projected, 0);
  for (const job of queue) {
    applyJobCompletion(projected, job, { salvage: false });
    power = powerState(projected, 0);
    if (!firstDeficit && power.surplusMW < 0) firstDeficit = { jobId: job.id, districtId: job.districtId, power };
  }
  return { state: projected, power, firstDeficit };
}

function discountedCost(state, cost) {
  const pct = calculateFacilityCapabilities(state).constructionMaterialCostPct || 0;
  const result = {};
  for (const [key, amount] of Object.entries(cost || {})) {
    const discountable = key === 'alloys' || key === 'components';
    result[key] = Math.max(amount > 0 ? 1 : 0, discountable ? roundPct(amount, pct) : amount);
  }
  return result;
}

function addCosts(...costs) {
  const result = {};
  for (const cost of costs) for (const [key, amount] of Object.entries(cost || {})) result[key] = (result[key] || 0) + amount;
  return result;
}

function projectJob(state, districtId, facilityId = null) {
  const district = state.ship?.districts?.[districtId];
  const definition = DISTRICT_CATALOG[districtId];
  if (!district || !definition || definition.fixed) fail('This district cannot be constructed.', 'CONSTRUCTION_DISTRICT_INVALID', `ship.districts.${districtId}`);
  if (state.ship.constructionQueue.some(job => job.districtId === districtId)) fail('This district already has queued work.', 'CONSTRUCTION_DISTRICT_BUSY', `ship.districts.${districtId}`);

  if (district.commissioned === false) {
    const cost = { credits: 650, alloys: 30, components: 35 };
    return { kind: 'commission', targetTier: 1, facilityId: getCoreFacilityId(districtId), replacedFacilityId: null, workRequired: 2, cost };
  }

  const selected = facilityId ? CONSTRUCTION_FACILITY_CATALOG[facilityId] : null;
  if (selected && selected.districtId !== districtId) fail('Facility belongs to another district.', 'FACILITY_DISTRICT_MISMATCH', 'facilityId');
  const targetTier = selected?.tier || Math.min(3, district.level + 1);
  if (targetTier < 2 || targetTier > 3) fail('Select a Tier-2 or Tier-3 facility.', 'FACILITY_TIER_INVALID', 'facilityId');
  if (!selected) {
    const fallback = getFacilityChoices(districtId, targetTier)[0];
    if (!fallback) fail('No facility choice is available.', 'FACILITY_UNKNOWN', 'facilityId');
    facilityId = fallback.id;
  }
  const facility = CONSTRUCTION_FACILITY_CATALOG[facilityId];
  if (targetTier > district.level + 1) fail('District tiers must be constructed in order.', 'CONSTRUCTION_TIER_ORDER', `ship.districts.${districtId}.level`);
  const current = district.facilities?.[`tier${targetTier}`] || null;
  if (targetTier <= district.level) {
    if (!current) return { kind: 'tier', targetTier, facilityId, replacedFacilityId: null, workRequired: targetTier, cost: facility.cost };
    if (current === facilityId) fail('Facility is already installed.', 'FACILITY_ALREADY_INSTALLED', 'facilityId');
    return { kind: 'retrofit', targetTier, facilityId, replacedFacilityId: current, workRequired: 2, cost: facility.cost };
  }
  const structuralCost = definition.tiers[targetTier - 1].cost;
  return { kind: 'tier', targetTier, facilityId, replacedFacilityId: null, workRequired: targetTier, cost: addCosts(structuralCost, facility.cost) };
}

export function getConstructionQuote(state, districtId, facilityId = null) {
  try {
    assertDomainState(state);
    if ((state.ship?.constructionQueue?.length || 0) >= CONSTRUCTION_QUEUE_LIMIT) return { ok: false, issues: [issue('CONSTRUCTION_QUEUE_FULL', `Construction queue is limited to ${CONSTRUCTION_QUEUE_LIMIT} jobs.`, 'ship.constructionQueue')] };
    const spec = projectJob(state, districtId, facilityId);
    const cost = discountedCost(state, spec.cost);
    const shortages = Object.entries(cost).filter(([key, amount]) => !RESOURCE_KEYS.includes(key) || (state.resources[key] || 0) < amount).map(([key, required]) => ({ key, required, available: state.resources[key] || 0 }));
    const provisional = {
      id: 'quote', version: CONSTRUCTION_JOB_VERSION, districtId, ...spec, reservedCost: cost,
      workCompleted: 0, status: 'queued', queuedAtCycle: state.ship.expeditionCycle, startedAtCycle: null, queueOrder: state.ship.constructionQueue.length
    };
    const powerProjection = projectQueuedPower(state, [...state.ship.constructionQueue, provisional]);
    const projectedPower = powerProjection.power;
    const issues = shortages.map(entry => issue('RESOURCE_SHORTAGE', `Not enough ${entry.key}; requires ${entry.required}.`, `resources.${entry.key}`));
    if (powerProjection.firstDeficit) issues.push(issue('PROJECTED_POWER_DEFICIT', `Queue order would exceed generation by ${Math.abs(powerProjection.firstDeficit.power.surplusMW)} MW after ${powerProjection.firstDeficit.districtId}.`, 'ship.power'));
    return { ok: issues.length === 0, issues, shortages, districtId, ...spec, cost, projectedPower };
  } catch (error) {
    if (error instanceof DomainValidationError) return { ok: false, issues: error.issues };
    throw error;
  }
}

export function enqueueConstruction(state, districtId, facilityId = null) {
  assertDomainState(state);
  const quote = getConstructionQuote(state, districtId, facilityId);
  if (!quote.ok) throw new DomainValidationError('Construction is unavailable.', quote.issues, 'CONSTRUCTION_UNAVAILABLE');
  const next = deepClone(state);
  for (const [key, amount] of Object.entries(quote.cost)) next.resources[key] -= amount;
  const id = deterministicId('build', { profileId: state.profileId, revision: state.revision, cycle: state.ship.expeditionCycle, districtId, facilityId: quote.facilityId, queue: state.ship.constructionQueue.length });
  const job = {
    id,
    version: CONSTRUCTION_JOB_VERSION,
    districtId,
    kind: quote.kind,
    targetTier: quote.targetTier,
    facilityId: quote.facilityId,
    replacedFacilityId: quote.replacedFacilityId,
    reservedCost: deepClone(quote.cost),
    workRequired: quote.workRequired,
    workCompleted: 0,
    status: 'queued',
    queuedAtCycle: state.ship.expeditionCycle,
    startedAtCycle: null,
    queueOrder: next.ship.constructionQueue.length
  };
  next.ship.constructionQueue.push(job);
  if (job.kind === 'retrofit') next.ship.districts[districtId].facilityOffline[`tier${job.targetTier}`] = true;
  next.revision += 1;
  assertDomainState(next);
  return next;
}

export function cancelConstruction(state, jobId) {
  assertDomainState(state);
  const index = state.ship.constructionQueue.findIndex(job => job.id === jobId);
  if (index < 0) fail('Construction job was not found.', 'CONSTRUCTION_JOB_UNKNOWN', 'jobId');
  const next = deepClone(state);
  const [job] = next.ship.constructionQueue.splice(index, 1);
  const capabilities = calculateFacilityCapabilities(next, { includeOffline: true });
  const basePct = job.workCompleted > 0 ? 50 : 80;
  const refundPct = Math.min(95, basePct + (capabilities.cancelRefundBonusPct || 0));
  for (const [key, amount] of Object.entries(job.reservedCost || {})) next.resources[key] += Math.floor(amount * refundPct / 100);
  if (job.kind === 'retrofit') next.ship.districts[job.districtId].facilityOffline[`tier${job.targetTier}`] = false;
  next.ship.constructionQueue.forEach((entry, queueOrder) => { entry.queueOrder = queueOrder; });
  next.revision += 1;
  assertDomainState(next);
  return next;
}

export function reorderConstruction(state, jobId, direction) {
  assertDomainState(state);
  const index = state.ship.constructionQueue.findIndex(job => job.id === jobId);
  const target = index + (direction < 0 ? -1 : 1);
  if (index < 0 || target < 0 || target >= state.ship.constructionQueue.length) return state;
  const next = deepClone(state);
  [next.ship.constructionQueue[index], next.ship.constructionQueue[target]] = [next.ship.constructionQueue[target], next.ship.constructionQueue[index]];
  next.ship.constructionQueue.forEach((entry, queueOrder) => { entry.queueOrder = queueOrder; });
  if (projectQueuedPower(next, next.ship.constructionQueue).firstDeficit) fail('Queue order would invalidate projected power.', 'CONSTRUCTION_REORDER_POWER', 'ship.constructionQueue');
  next.revision += 1;
  assertDomainState(next);
  return next;
}

function finishCompletedJobs(state) {
  const completed = state.ship.constructionQueue.filter(job => job.workCompleted >= job.workRequired);
  for (const job of completed) applyJobCompletion(state, job);
  state.ship.constructionQueue = state.ship.constructionQueue.filter(job => job.workCompleted < job.workRequired);
  state.ship.constructionQueue.forEach((job, queueOrder) => { job.queueOrder = queueOrder; });
  return completed;
}

export function advanceExpeditionCycles(state, cycles, eventId, source = 'expedition') {
  assertDomainState(state);
  if (!Number.isInteger(cycles) || cycles < 1) fail('Expedition cycles must be a positive integer.', 'EXPEDITION_CYCLES_INVALID', 'cycles');
  if (typeof eventId !== 'string' || !eventId) fail('Cycle advancement requires a stable event ID.', 'EXPEDITION_EVENT_ID_INVALID', 'eventId');
  if (state.ship.processedCycleEventIds.includes(eventId)) return { state, advanced: false, completedJobs: [] };
  const next = deepClone(state);
  const completedJobs = [];
  for (let step = 0; step < cycles; step++) {
    next.ship.expeditionCycle += 1;
    const capacity = getConstructionCapacity(next);
    const idlePower = powerState(next, 0);
    const maxByPower = Math.max(0, Math.floor(idlePower.surplusMW / Math.max(1, idlePower.constructionPowerPerSlotMW)));
    const activeCount = Math.min(capacity, maxByPower, next.ship.constructionQueue.length);
    next.ship.constructionQueue.forEach((job, index) => {
      job.status = index < activeCount ? 'active' : index < capacity ? 'paused_power' : 'queued';
      if (job.status === 'active') {
        if (job.startedAtCycle == null) job.startedAtCycle = next.ship.expeditionCycle;
        job.workCompleted += 1;
      }
    });
    const capabilities = calculateFacilityCapabilities(next);
    const oldestActive = next.ship.constructionQueue.find(job => job.status === 'active');
    if (oldestActive && capabilities.cycleOldestWork) oldestActive.workCompleted += capabilities.cycleOldestWork;
    if (next.ship.expeditionCycle % 2 === 0) {
      const activeDistrictJobs = next.ship.constructionQueue.filter(job => job.status === 'active' && DISTRICT_JOB_KINDS.has(job.kind));
      if (capabilities.allDistrictWorkEverySecondCycle) activeDistrictJobs.forEach(job => { job.workCompleted += capabilities.allDistrictWorkEverySecondCycle; });
      else if (capabilities.districtWorkEverySecondCycle && activeDistrictJobs[0]) activeDistrictJobs[0].workCompleted += capabilities.districtWorkEverySecondCycle;
    }
    completedJobs.push(...finishCompletedJobs(next));
  }
  const capabilities = calculateFacilityCapabilities(next);
  if (source === 'transit') {
    const capacity = getConstructionCapacity(next);
    const active = next.ship.constructionQueue.slice(0, capacity);
    if (capabilities.transitAllWork) active.forEach(job => { job.workCompleted += capabilities.transitAllWork; });
    else if (capabilities.transitOldestWork && active[0]) active[0].workCompleted += capabilities.transitOldestWork;
    if (capabilities.transitProbeRestore) next.resources.probes += capabilities.transitProbeRestore;
    completedJobs.push(...finishCompletedJobs(next));
  }
  next.ship.processedCycleEventIds.push(eventId);
  next.ship.processedCycleEventIds = next.ship.processedCycleEventIds.slice(-CONSTRUCTION_EVENT_HISTORY_LIMIT);
  next.revision += 1;
  assertDomainState(next);
  return { state: next, advanced: true, completedJobs };
}

export function getConstructionStatus(state) {
  const capacity = getConstructionCapacity(state);
  const queueLength = state.ship?.constructionQueue?.length || 0;
  const idlePower = powerState(state, 0);
  const maxByPower = Math.max(0, Math.floor(idlePower.surplusMW / Math.max(1, idlePower.constructionPowerPerSlotMW)));
  const active = Math.min(capacity, maxByPower, queueLength);
  const power = powerState(state, active);
  const queue = deepClone(state.ship?.constructionQueue || []).map((job, index) => ({
    ...job,
    status: index < active ? 'active' : index < capacity ? 'paused_power' : 'queued'
  }));
  return {
    cycle: state.ship?.expeditionCycle || 0,
    capacity,
    queueLimit: CONSTRUCTION_QUEUE_LIMIT,
    active,
    queue,
    power
  };
}
