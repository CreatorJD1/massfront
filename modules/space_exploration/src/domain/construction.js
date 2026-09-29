import { DISTRICT_CATALOG, MODULE_CATALOG, RESEARCH_CATALOG, RESOURCE_KEYS, SHIP_DECKS, SPECIALIST_CATALOG, SUPPORT_CATALOG } from './catalog.js';
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
import { applyRecoveryCyclesMutable } from './recovery.js';
import { assertDomainState } from './state_store.js';

const DISTRICT_JOB_KINDS = new Set(['commission', 'tier']);
const EMERGENCY_COMMISSION_DISTRICTS = new Set(['mission_ops', 'hangar']);
const CORE_COMMISSION_DISTRICTS = ['mission_ops', 'hangar'];
const FIRST_OPERATION_SUPPORT_COMPONENTS = SUPPORT_CATALOG.field_lab.cost.components;
const CORE_RESCUE_POWER_CAP_MW = 30;

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
    /* INSTALLED MODULES COUNT TOO.
       A socket module used to change exactly one thing: the power bill. It had
       a name, a cost, an install flow and a place in the room, and the only
       consequence of fitting one was drawing more megawatts — so "personalise
       your sections with modules" was a purchase, not a decision.
       Aggregating them HERE rather than at each call site is what makes them
       real everywhere at once: thirty-odd consumers already read these
       capabilities for survey yield, transit fuel, construction cost, injury
       bands, deployment slots and faction standing, and every one of them now
       honours a module without knowing modules exist. */
    for (const moduleId of Object.values(district.modules || {})) {
      const module = MODULE_CATALOG[moduleId];
      if (module) addEffects(result, module.effects);
    }
  }
  /* L4/L5: committed research and staffed specialists are purchases like the
     facilities and modules above, and must surface HERE or their perks stay
     decorative text. Research counts once completed; a specialist counts only
     while staffed in one of their preferred districts — placement is the
     decision the perk rewards, and it keeps a perk from firing in a room where
     its specialty cannot apply. Vesk and Aya keep their bespoke power paths in
     powerState and contribute no capabilities here (no double-counting). */
  const refundIntervals = [];
  const mergeCapabilityEffects = capabilities => {
    if (!capabilities) return;
    // "Every Nth survey refunds a probe" is a threshold, not a stack: summing
    // two intervals can only make refunds RARER (3 + 2 -> 5). The strongest
    // source wins; every other key stacks additively via addEffects.
    const { surveyProbeRefundInterval, ...effects } = capabilities;
    if (surveyProbeRefundInterval) refundIntervals.push(surveyProbeRefundInterval);
    addEffects(result, effects);
  };
  for (const researchId of state.research?.completedIds || []) mergeCapabilityEffects(RESEARCH_CATALOG[researchId]?.capabilities);
  for (const [districtId, district] of Object.entries(state.ship?.districts || {})) {
    for (const specialistId of district.staff || []) {
      const specialist = SPECIALIST_CATALOG[specialistId];
      if (!specialist || !specialist.preferredDistrictIds?.includes(districtId)) continue;
      // The roster decides whether the perk can fire at all: a specialist who
      // is locked away, deployed forward, or lying in a recovery bed is not on
      // the deck applying their specialty, however the staff roster reads.
      const person = state.personnel?.specialists?.[specialistId];
      if (!person?.unlocked || person.status === 'locked' || person.status === 'deployed' || person.injury) continue;
      mergeCapabilityEffects(specialist.capabilities);
    }
  }
  if (refundIntervals.length) result.surveyProbeRefundInterval = Math.min(result.surveyProbeRefundInterval || Infinity, ...refundIntervals);
  result.transitFuelPct = Math.max(-25, result.transitFuelPct || 0);
  /* Commander learning is bounded for the same reason transit fuel is: these
     stack across eleven rooms, and an unbounded product turns a long campaign
     into a single-operation promotion. */
  if (result.commanderXpPct) result.commanderXpPct = Math.min(60, result.commanderXpPct);
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
  const generatedMW = (engineeringTier.capacity.powerGenerationMW || 120) + legacy.generation + specialistGeneration + (capabilities.powerGenerationMW || 0) + (state.ship?.coreCommissionRescuePowerMW || 0);
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

// Core work is a launch dependency. Reserve the live discounted materials and
// enough power to run a slot at every queued stage, not just a nonnegative
// finished grid (which previously permitted permanently paused core jobs).
export function getCoreCommissionReserve(state) {
  const active = (state.operations?.history?.length || 0) === 0;
  const missingCore = CORE_COMMISSION_DISTRICTS.some(id => state.ship?.districts?.[id]?.commissioned === false);
  const cost = { credits: 0, alloys: 0, components: active ? FIRST_OPERATION_SUPPORT_COMPONENTS : 0 };
  if (!active || !missingCore) return { active, cost, powerOk: true, powerIssue: null, powerNeededMW: 0 };
  const queued = new Set((state.ship?.constructionQueue || []).filter(job => job.kind === 'commission').map(job => job.districtId));
  const missing = CORE_COMMISSION_DISTRICTS.filter(id => state.ship.districts[id].commissioned === false && !queued.has(id));
  for (const id of missing) {
    const price = discountedCost(state, { credits: 650, alloys: 30, components: 35 });
    for (const key of ['credits', 'alloys', 'components']) cost[key] += price[key];
  }
  const projected = deepClone(state);
  projected.ship.constructionQueue = [];
  let powerNeededMW = 0;
  const future = missing.map(districtId => ({ kind: 'commission', districtId, targetTier: 1, facilityId: getCoreFacilityId(districtId), id: `reserve:${districtId}`, reservedCost: {}, workCompleted: 0, workRequired: 2 }));
  for (const job of [...(state.ship.constructionQueue || []), ...future]) {
    const power = powerState(projected, 0);
    powerNeededMW = Math.max(powerNeededMW, power.constructionPowerPerSlotMW - power.surplusMW);
    applyJobCompletion(projected, job, { salvage: false });
  }
  powerNeededMW = Math.max(powerNeededMW, -powerState(projected, 0).surplusMW, 0);
  return {
    active,
    cost,
    powerOk: powerNeededMW === 0,
    powerNeededMW,
    powerIssue: powerNeededMW ? issue('CORE_COMMISSION_POWER_RESERVE', `Core commissioning needs ${powerNeededMW} MW more to keep construction powered.`, 'ship.power') : null
  };
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
    const candidate = deepClone(state);
    candidate.ship.constructionQueue.push(provisional);
    for (const [key, amount] of Object.entries(cost)) candidate.resources[key] -= amount;
    const reserve = getCoreCommissionReserve(candidate);
    if (reserve.active) {
      if (!(spec.kind === 'commission' && EMERGENCY_COMMISSION_DISTRICTS.has(districtId))) {
        for (const key of ['credits', 'alloys', 'components']) {
          if (candidate.resources[key] < reserve.cost[key]) issues.push(issue('CORE_COMMISSION_RESERVE', `Keep ${reserve.cost[key]} ${key} for Mission Ops, Strike Bay, and first-operation support.`, `resources.${key}`));
        }
      }
      if (!reserve.powerOk) issues.push(reserve.powerIssue);
    }
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

// The entitlement pays suppliers directly into the required core jobs. Only
// a missing first-operation support kit may enter the ordinary inventory.
// This keeps a legacy stranded save playable without handing out currency
// that can be redirected into optional upgrades or refunded on cancellation.
export function getCoreCommissionRescueQuote(state) {
  try {
    assertDomainState(state);
    const issues = [];
    const queued = new Set(state.ship.constructionQueue.filter(job => job.kind === 'commission').map(job => job.districtId));
    const districtIds = CORE_COMMISSION_DISTRICTS.filter(id => state.ship.districts[id].commissioned === false && !queued.has(id));
    const anyCoreMissing = CORE_COMMISSION_DISTRICTS.some(id => state.ship.districts[id].commissioned === false);
    const reserve = getCoreCommissionReserve(state);
    const cost = { credits: 0, alloys: 0, components: 0 };
    for (const id of districtIds) {
      const price = discountedCost(state, { credits: 650, alloys: 30, components: 35 });
      for (const key of ['credits', 'alloys', 'components']) cost[key] += price[key];
    }
    const supportGrant = Math.max(0, FIRST_OPERATION_SUPPORT_COMPONENTS - state.resources.components);
    const spend = {
      credits: Math.min(state.resources.credits, cost.credits),
      alloys: Math.min(state.resources.alloys, cost.alloys),
      components: Math.min(Math.max(0, state.resources.components - FIRST_OPERATION_SUPPORT_COMPONENTS), cost.components)
    };
    const grant = {
      credits: cost.credits - spend.credits,
      alloys: cost.alloys - spend.alloys,
      components: cost.components - spend.components + supportGrant
    };
    const powerGrantMW = reserve.powerNeededMW;
    if (!reserve.active || (!anyCoreMissing && supportGrant === 0)) issues.push(issue('CORE_RESCUE_NOT_NEEDED', 'Core work and first-operation support are already funded, or the first operation has settled.', 'ship.districts'));
    if (state.ship.coreCommissionRescueUsed === true) issues.push(issue('CORE_RESCUE_ALREADY_USED', 'Core commissioning rescue has already been requisitioned.', 'ship.coreCommissionRescueUsed'));
    if (state.operations.pending) issues.push(issue('OPERATION_PENDING', 'Resolve the pending ground operation first.', 'operations.pending'));
    if (state.ship.constructionQueue.length + districtIds.length > CONSTRUCTION_QUEUE_LIMIT) issues.push(issue('CONSTRUCTION_QUEUE_FULL', 'Clear optional queued work before requisitioning required cores.', 'ship.constructionQueue'));
    if ((state.ship.coreCommissionRescuePowerMW || 0) + powerGrantMW > CORE_RESCUE_POWER_CAP_MW) issues.push(issue('CORE_RESCUE_POWER_CAP', `Required backup exceeds the ${CORE_RESCUE_POWER_CAP_MW} MW rescue limit.`, 'ship.power'));
    if (!Object.values(grant).some(value => value > 0) && powerGrantMW === 0) issues.push(issue('CORE_RESCUE_NOT_NEEDED', 'Normal commissioning remains affordable and powered.', 'ship.districts'));
    return { ok: issues.length === 0, issues, cost, spend, grant, supportGrant, powerGrantMW, districtIds };
  } catch (error) {
    if (error instanceof DomainValidationError) return { ok: false, issues: error.issues, cost: {}, spend: {}, grant: {}, supportGrant: 0, powerGrantMW: 0, districtIds: [] };
    throw error;
  }
}

export function requisitionCoreCommissioning(state) {
  const quote = getCoreCommissionRescueQuote(state);
  if (!quote.ok) throw new DomainValidationError('Core commissioning rescue is unavailable.', quote.issues, 'CORE_RESCUE_UNAVAILABLE');
  const next = deepClone(state);
  next.resources.components += quote.supportGrant;
  for (const key of ['credits', 'alloys', 'components']) next.resources[key] -= quote.spend[key];
  next.ship.coreCommissionRescueUsed = true;
  next.ship.coreCommissionRescuePowerMW += quote.powerGrantMW;
  for (const job of next.ship.constructionQueue) {
    if (job.kind === 'commission' && EMERGENCY_COMMISSION_DISTRICTS.has(job.districtId)) job.rescueFunded = true;
  }
  const remainingSpend = { ...quote.spend };
  for (const districtId of quote.districtIds) {
    const cost = discountedCost(state, { credits: 650, alloys: 30, components: 35 });
    const reservedCost = {};
    const rescueGrant = {};
    for (const key of ['credits', 'alloys', 'components']) {
      reservedCost[key] = Math.min(cost[key], remainingSpend[key]);
      remainingSpend[key] -= reservedCost[key];
      rescueGrant[key] = cost[key] - reservedCost[key];
    }
    next.ship.constructionQueue.push({
      id: deterministicId('core-rescue', { profileId: state.profileId, revision: state.revision, districtId }),
      version: CONSTRUCTION_JOB_VERSION,
      districtId,
      kind: 'commission',
      targetTier: 1,
      facilityId: getCoreFacilityId(districtId),
      replacedFacilityId: null,
      reservedCost,
      rescueGrant,
      rescueFunded: true,
      workRequired: 2,
      workCompleted: 0,
      status: 'queued',
      queuedAtCycle: state.ship.expeditionCycle,
      startedAtCycle: null,
      queueOrder: next.ship.constructionQueue.length
    });
  }
  next.revision += 1;
  assertDomainState(next);
  return next;
}

export function cancelConstruction(state, jobId) {
  assertDomainState(state);
  const index = state.ship.constructionQueue.findIndex(job => job.id === jobId);
  if (index < 0) fail('Construction job was not found.', 'CONSTRUCTION_JOB_UNKNOWN', 'jobId');
  if (state.ship.constructionQueue[index].rescueFunded === true) fail('Core rescue work cannot be canceled.', 'CORE_RESCUE_JOB_PROTECTED', 'jobId');
  if ((state.operations?.history?.length || 0) === 0 && state.ship.constructionQueue[index].kind === 'commission' && EMERGENCY_COMMISSION_DISTRICTS.has(state.ship.constructionQueue[index].districtId)) fail('Required first-operation core work cannot be canceled.', 'CORE_COMMISSION_JOB_PROTECTED', 'jobId');
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
  const reserve = getCoreCommissionReserve(next);
  if (reserve.active && !reserve.powerOk) fail(reserve.powerIssue.message, 'CORE_COMMISSION_POWER_RESERVE', 'ship.power');
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

export function advanceExpeditionCycles(state, cycles, eventId, source = 'expedition', recoveryExclusions = {}) {
  assertDomainState(state);
  if (!Number.isInteger(cycles) || cycles < 1) fail('Expedition cycles must be a positive integer.', 'EXPEDITION_CYCLES_INVALID', 'cycles');
  if (typeof eventId !== 'string' || !eventId) fail('Cycle advancement requires a stable event ID.', 'EXPEDITION_EVENT_ID_INVALID', 'eventId');
  if (state.operations.pending) fail('Resolve the pending ground operation before advancing expedition cycles.', 'OPERATION_PENDING', 'operations.pending');
  if (state.ship.processedCycleEventIds.includes(eventId)) return { state, advanced: false, completedJobs: [] };
  const next = deepClone(state);
  const completedJobs = [];
  const emergencyTransit = source === 'emergency-transit';
  for (let step = 0; step < cycles; step++) {
    next.ship.expeditionCycle += 1;
    const capacity = getConstructionCapacity(next);
    const idlePower = powerState(next, 0);
    const maxByPower = Math.max(0, Math.floor(idlePower.surplusMW / Math.max(1, idlePower.constructionPowerPerSlotMW)));
    const eligibleJobs = emergencyTransit
      ? next.ship.constructionQueue.filter(job => job.kind === 'commission' && EMERGENCY_COMMISSION_DISTRICTS.has(job.districtId))
      : next.ship.constructionQueue;
    const activeCount = Math.min(capacity, maxByPower, eligibleJobs.length);
    let eligibleIndex = 0;
    next.ship.constructionQueue.forEach(job => {
      if (emergencyTransit && !eligibleJobs.includes(job)) {
        job.status = 'queued';
        return;
      }
      const index = eligibleIndex++;
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
  // The same event ledger that protects construction also protects recovery.
  // A just-returned operation holds its deployed team's new injury countdown;
  // readiness can recover now, but wounds heal on a later expedition event.
  applyRecoveryCyclesMutable(next, cycles, recoveryExclusions);
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
