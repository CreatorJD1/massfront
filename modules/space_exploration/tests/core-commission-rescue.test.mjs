import assert from 'node:assert/strict';
import {
  calculatePowerGridStatus,
  cancelConstruction,
  commissionCareerFaction,
  createInitialDomainState,
  createMemoryStorage,
  deployProbe,
  enqueueConstruction,
  getConstructionQuote,
  getCoreCommissionRescueQuote,
  getCoreCommissionReserve,
  getMissionEligibility,
  installDistrictModule,
  LocalDomainStore,
  plotCourse,
  requisitionCoreCommissioning,
  validateDomainState
} from '../src/domain/index.js';

const CORE_IDS = ['mission_ops', 'hangar'];
const FIRST_MISSION = 'nova_heliograph_wake';

const initial = createInitialDomainState();
assert.deepEqual({
  credits: initial.resources.credits,
  alloys: initial.resources.alloys,
  components: initial.resources.components
}, { credits: 7200, alloys: 360, components: 420 });
for (const districtId of CORE_IDS) {
  const quote = getConstructionQuote(initial, districtId);
  assert.equal(quote.ok, true, `${districtId} must be affordable at career start`);
  assert.deepEqual(quote.cost, { credits: 650, alloys: 30, components: 35 });
  assert.equal(quote.workRequired, 2);
}

// Every entry was a legal public construction action before the reserve guard.
// The final one consumes resources the first two playable mission cores need.
let beforeLegacyOverspend = commissionCareerFaction(initial, 'nova');
for (const districtId of ['factions', 'navigation', 'survey']) {
  const quote = getConstructionQuote(beforeLegacyOverspend, districtId);
  assert.equal(quote.ok, true, `${districtId} optional purchase must be legal`);
  beforeLegacyOverspend = enqueueConstruction(beforeLegacyOverspend, districtId);
}
assert.deepEqual({
  credits: beforeLegacyOverspend.resources.credits,
  alloys: beforeLegacyOverspend.resources.alloys,
  components: beforeLegacyOverspend.resources.components
}, { credits: 3100, alloys: 160, components: 170 });

// Rehydrate the one final transaction as a valid old-save queue record. A new
// career must no longer be allowed to make this purchase through the public
// API, but an existing player's already-spent resources cannot be discarded.
const oldEngineeringCost = { credits: 2000, alloys: 140, components: 110 };
const legacyStranded = structuredClone(beforeLegacyOverspend);
for (const [resourceId, amount] of Object.entries(oldEngineeringCost)) legacyStranded.resources[resourceId] -= amount;
legacyStranded.ship.constructionQueue.push({
  id: 'build_legacy_engineering_01',
  version: 1,
  districtId: 'engineering',
  kind: 'tier',
  targetTier: 2,
  facilityId: 'engineering_t2_reactor_baffles',
  replacedFacilityId: null,
  reservedCost: oldEngineeringCost,
  workRequired: 2,
  workCompleted: 0,
  status: 'queued',
  queuedAtCycle: legacyStranded.ship.expeditionCycle,
  startedAtCycle: null,
  queueOrder: legacyStranded.ship.constructionQueue.length
});
legacyStranded.revision += 1;
assert.deepEqual(validateDomainState(legacyStranded).issues, [], 'old queue and resource ledger must be a valid save');

let surveyed = deployProbe(legacyStranded, 'aelos_capitol_vector').state;
surveyed = deployProbe(surveyed, 'aelos_phase_trace').state;
surveyed = deployProbe(surveyed, 'aelos_traffic_census').state;
for (const systemId of ['veyra', 'aelos', 'veyra']) surveyed = plotCourse(surveyed, systemId);
assert.equal(surveyed.ship.constructionQueue.length, 0, 'all optional work must finish so cancellation cannot refund the overspend');
assert.equal(surveyed.ship.districts.engineering.level, 2);
assert.equal(surveyed.ship.districts.survey.level, 2);
assert.deepEqual({
  credits: surveyed.resources.credits,
  alloys: surveyed.resources.alloys,
  components: surveyed.resources.components,
  fuel: surveyed.resources.fuel,
  probes: surveyed.resources.probes
}, { credits: 1600, alloys: 20, components: 95, fuel: 63, probes: 5 });
assert.deepEqual(getMissionEligibility(surveyed, FIRST_MISSION).locks.map(lock => lock.code), [
  'MISSION_OPS_NOT_COMMISSIONED', 'HANGAR_NOT_COMMISSIONED'
], 'the first earned discovery must leave only the two missing cores as mission locks');
for (const districtId of CORE_IDS) {
  const quote = getConstructionQuote(surveyed, districtId);
  assert.equal(quote.ok, false, `${districtId} cannot be bought with 20 alloys`);
  assert.deepEqual(quote.shortages, [{ key: 'alloys', required: 30, available: 20 }]);
  assert.ok(quote.projectedPower.surplusMW > 0, 'projected power is not the blocker in this fixture');
}

const storage = createMemoryStorage();
new LocalDomainStore({ storage, key: 'core-commission-legacy' }).save(surveyed);
surveyed = new LocalDomainStore({ storage, key: 'core-commission-legacy' }).load({ recover: false });
assert.equal(validateDomainState(surveyed).ok, true, 'stranded legacy save must survive persistence');

const reserve = getCoreCommissionReserve(beforeLegacyOverspend);
assert.equal(reserve.active, true);
assert.deepEqual(reserve.cost, { credits: 1300, alloys: 60, components: 78 }, 'reserve both cores and first Field Lab support');
assert.equal(reserve.powerOk, true);
const forbiddenOptional = getConstructionQuote(beforeLegacyOverspend, 'engineering');
assert.equal(forbiddenOptional.ok, false, 'fresh-career guard must reject the purchase that stranded old saves');
assert.ok(forbiddenOptional.issues.some(entry => entry.code === 'CORE_COMMISSION_RESERVE'), 'guard should name the protected mission-core budget');
assert.throws(() => enqueueConstruction(beforeLegacyOverspend, 'engineering'), error =>
  error?.issues?.some(entry => entry.code === 'CORE_COMMISSION_RESERVE'), 'direct domain action must enforce the same guard as its quote');

let optionalCoreTier = commissionCareerFaction(createInitialDomainState(), 'nova');
optionalCoreTier = enqueueConstruction(optionalCoreTier, 'mission_ops');
optionalCoreTier = deployProbe(optionalCoreTier, 'aelos_capitol_vector').state;
optionalCoreTier = deployProbe(optionalCoreTier, 'aelos_phase_trace').state;
optionalCoreTier = deployProbe(optionalCoreTier, 'aelos_traffic_census').state;
optionalCoreTier = enqueueConstruction(optionalCoreTier, 'engineering');
optionalCoreTier = enqueueConstruction(optionalCoreTier, 'navigation');
optionalCoreTier = plotCourse(optionalCoreTier, 'veyra');
optionalCoreTier = plotCourse(optionalCoreTier, 'aelos');
optionalCoreTier = installDistrictModule(optionalCoreTier, 'navigation', 'navigation_socket_2', 'orbit_scheduler');
assert.deepEqual(getCoreCommissionReserve(optionalCoreTier).cost, { credits: 650, alloys: 30, components: 43 });
const tierBypass = getConstructionQuote(optionalCoreTier, 'mission_ops', 'mission_ops_t2_readiness_network');
assert.equal(tierBypass.ok, false, 'optional work in a core district must not inherit the core commission exemption');
assert.ok(tierBypass.issues.some(entry => entry.code === 'CORE_COMMISSION_RESERVE'));

let protectedQueue = createInitialDomainState();
for (const districtId of ['mission_ops', 'hangar', 'navigation', 'survey', 'logistics']) protectedQueue = enqueueConstruction(protectedQueue, districtId);
const mandatoryJobId = protectedQueue.ship.constructionQueue.find(job => job.districtId === 'mission_ops').id;
assert.throws(() => cancelConstruction(protectedQueue, mandatoryJobId), error =>
  error?.issues?.some(entry => entry.code === 'CORE_COMMISSION_JOB_PROTECTED'), 'canceling a mandatory first-operation core must not erase the protected budget');

const rescueQuote = getCoreCommissionRescueQuote(surveyed);
assert.equal(rescueQuote.ok, true, 'one-time rescue must be offered for the truly stranded old save');
assert.deepEqual(rescueQuote.districtIds, CORE_IDS);
assert.deepEqual(rescueQuote.cost, { credits: 1300, alloys: 60, components: 70 });
assert.deepEqual(rescueQuote.grant, { credits: 0, alloys: 40, components: 0 }, 'grant only the exact missing alloy, not free liquid stores');
assert.equal(rescueQuote.powerGrantMW, 0, 'this fixture has sufficient power without a power grant');

let rescued = requisitionCoreCommissioning(surveyed);
assert.equal(rescued.ship.coreCommissionRescueUsed, true);
assert.deepEqual({
  credits: rescued.resources.credits,
  alloys: rescued.resources.alloys,
  components: rescued.resources.components
}, { credits: 300, alloys: 0, components: 25 });
assert.deepEqual(rescued.ship.constructionQueue.map(job => job.districtId), CORE_IDS);
for (const job of rescued.ship.constructionQueue) {
  assert.equal(job.rescueFunded, true, 'rescued core must be tagged against cancellation/refund');
  assert.ok(job.rescueGrant && typeof job.rescueGrant === 'object');
  assert.throws(() => cancelConstruction(rescued, job.id), error => error?.code === 'CORE_RESCUE_JOB_PROTECTED',
    'rescue-funded core must not be cancelable for a refund');
}
assert.equal(getCoreCommissionRescueQuote(rescued).ok, false, 'rescue cannot be claimed twice');
assert.throws(() => requisitionCoreCommissioning(rescued), error =>
  error?.issues?.some(entry => entry.code === 'CORE_RESCUE_ALREADY_USED'), 'a second requisition cannot duplicate grants or jobs');

new LocalDomainStore({ storage, key: 'core-commission-rescued' }).save(rescued);
rescued = new LocalDomainStore({ storage, key: 'core-commission-rescued' }).load({ recover: false });
assert.equal(rescued.ship.coreCommissionRescueUsed, true, 'one-time flag must survive save/reload');
assert.deepEqual(rescued.ship.constructionQueue.map(job => job.districtId), CORE_IDS);
assert.equal(getCoreCommissionRescueQuote(rescued).ok, false, 'reload must not reoffer rescue');
for (const job of rescued.ship.constructionQueue) {
  assert.equal(job.rescueFunded, true, 'reload must retain cancellation protection');
  assert.throws(() => cancelConstruction(rescued, job.id), error => error?.code === 'CORE_RESCUE_JOB_PROTECTED');
}

for (const systemId of ['aelos', 'veyra', 'aelos']) rescued = plotCourse(rescued, systemId);
assert.equal(rescued.ship.districts.mission_ops.commissioned, true);
assert.equal(rescued.ship.districts.hangar.commissioned, true);
assert.equal(rescued.ship.constructionQueue.length, 0);
const mission = getMissionEligibility(rescued, FIRST_MISSION, { supportId: 'field_lab' });
assert.equal(mission.eligible, true, `first mission must reopen after real transit construction: ${mission.locks.map(lock => lock.code).join(', ')}`);
assert.ok(rescued.resources.components >= 8, 'first mission Field Lab remains affordable after commissioning');

const supportStarved = structuredClone(surveyed);
supportStarved.resources.components = 0; // A legacy save may have spent its last support kit before this patch.
assert.equal(validateDomainState(supportStarved).ok, true);
const supportQuote = getCoreCommissionRescueQuote(supportStarved);
assert.equal(supportQuote.ok, true);
assert.equal(supportQuote.supportGrant, 8);
assert.deepEqual(supportQuote.grant, { credits: 0, alloys: 40, components: 78 });
const supportRescued = requisitionCoreCommissioning(supportStarved);
assert.equal(supportRescued.resources.components, 8, 'only the first Field Lab kit may enter liquid stores');
assert.deepEqual(supportRescued.ship.constructionQueue.map(job => job.districtId), CORE_IDS);

// A second legacy build can strand the same mission on power as well as cost.
// First isolate projected power from the resource gate in a resource-rich copy.
let beforePowerOverspend = commissionCareerFaction(initial, 'nova');
for (const districtId of ['research', 'factions', 'navigation', 'survey']) {
  assert.equal(getConstructionQuote(beforePowerOverspend, districtId).ok, true);
  beforePowerOverspend = enqueueConstruction(beforePowerOverspend, districtId);
}
const fundedPowerControl = structuredClone(beforePowerOverspend);
Object.assign(fundedPowerControl.resources, { credits: 9000, alloys: 500, components: 500 });
assert.equal(validateDomainState(fundedPowerControl).ok, true);
const powerGuardQuote = getConstructionQuote(fundedPowerControl, 'logistics');
assert.deepEqual(powerGuardQuote.issues.map(entry => entry.code), ['CORE_COMMISSION_POWER_RESERVE'],
  'a new career must reject a grid that cannot run later core construction even when stores are rich');
assert.throws(() => enqueueConstruction(fundedPowerControl, 'logistics'), error =>
  error?.issues?.some(entry => entry.code === 'CORE_COMMISSION_POWER_RESERVE'));

// Rehydrate the old Logistics-II transaction just as above, then let actual
// surveys and transits finish all five optional jobs before the rescue check.
const oldLogisticsCost = { credits: 1800, alloys: 125, components: 90 };
let powerLegacy = structuredClone(beforePowerOverspend);
for (const [resourceId, amount] of Object.entries(oldLogisticsCost)) powerLegacy.resources[resourceId] -= amount;
powerLegacy.ship.constructionQueue.push({
  id: 'build_legacy_logistics_01',
  version: 1,
  districtId: 'logistics',
  kind: 'tier',
  targetTier: 2,
  facilityId: 'logistics_t2_salvage_sorting',
  replacedFacilityId: null,
  reservedCost: oldLogisticsCost,
  workRequired: 2,
  workCompleted: 0,
  status: 'queued',
  queuedAtCycle: powerLegacy.ship.expeditionCycle,
  startedAtCycle: null,
  queueOrder: powerLegacy.ship.constructionQueue.length
});
powerLegacy.revision += 1;
assert.equal(validateDomainState(powerLegacy).ok, true);
const crowded = getCoreCommissionRescueQuote(powerLegacy);
assert.equal(crowded.ok, false, 'the one-time rescue cannot overfill a five-job queue with two cores');
assert.ok(crowded.issues.some(entry => entry.code === 'CONSTRUCTION_QUEUE_FULL'));
assert.throws(() => requisitionCoreCommissioning(powerLegacy), error =>
  error?.issues?.some(entry => entry.code === 'CONSTRUCTION_QUEUE_FULL'));

for (const surveyId of ['aelos_capitol_vector', 'aelos_phase_trace', 'aelos_traffic_census']) powerLegacy = deployProbe(powerLegacy, surveyId).state;
for (const systemId of ['veyra', 'aelos', 'veyra', 'aelos']) powerLegacy = plotCourse(powerLegacy, systemId);
assert.equal(powerLegacy.ship.constructionQueue.length, 0, 'legacy optional queue must be exhausted before power rescue');
assert.equal(getCoreCommissionReserve(powerLegacy).powerNeededMW, 8);
const powerQuote = getCoreCommissionRescueQuote(powerLegacy);
assert.equal(powerQuote.ok, true);
assert.equal(powerQuote.powerGrantMW, 8, 'backup generation must be exactly the measured core-construction deficit');
assert.deepEqual(powerQuote.grant, { credits: 150, alloys: 55, components: 0 });

const overCapPower = structuredClone(powerLegacy);
overCapPower.ship.districts.navigation.modules.navigation_socket_1 = 'route_predictor';
overCapPower.ship.districts.survey.modules.survey_socket_1 = 'spectral_array';
overCapPower.ship.districts.engineering.modules.engineering_socket_1 = 'drive_tuner';
assert.equal(validateDomainState(overCapPower).ok, true, 'old save with three installed power consumers is valid');
const overCapQuote = getCoreCommissionRescueQuote(overCapPower);
assert.ok(overCapQuote.powerGrantMW > 30, 'fixture must exceed the emergency backup cap');
assert.equal(overCapQuote.ok, false, 'rescue may not silently add unlimited grid generation');
assert.ok(overCapQuote.issues.some(entry => entry.code === 'CORE_RESCUE_POWER_CAP'));

// The player may have found enough material after that old build but still be
// unable to start either core. Power alone must qualify for rescue.
const powerOnly = structuredClone(powerLegacy);
Object.assign(powerOnly.resources, { credits: 1300, alloys: 60, components: 78 });
assert.equal(validateDomainState(powerOnly).ok, true);
const powerOnlyQuote = getCoreCommissionRescueQuote(powerOnly);
assert.equal(powerOnlyQuote.ok, true);
assert.deepEqual(powerOnlyQuote.grant, { credits: 0, alloys: 0, components: 0 });
assert.equal(powerOnlyQuote.powerGrantMW, 8);
const generationBefore = calculatePowerGridStatus(powerOnly).totalGeneratedMW;
let powerRescued = requisitionCoreCommissioning(powerOnly);
assert.equal(powerRescued.ship.coreCommissionRescuePowerMW, 8);
assert.equal(calculatePowerGridStatus(powerRescued).totalGeneratedMW, generationBefore + 8);
new LocalDomainStore({ storage, key: 'core-commission-power' }).save(powerRescued);
powerRescued = new LocalDomainStore({ storage, key: 'core-commission-power' }).load({ recover: false });
assert.equal(powerRescued.ship.coreCommissionRescuePowerMW, 8, 'backup power must survive save/reload');
for (const systemId of ['veyra', 'aelos']) powerRescued = plotCourse(powerRescued, systemId);
assert.equal(powerRescued.ship.districts.mission_ops.commissioned, true);
assert.equal(powerRescued.ship.districts.hangar.commissioned, true);
assert.equal(getMissionEligibility(powerRescued, FIRST_MISSION, { supportId: 'field_lab' }).eligible, true);

console.log('core-commission guard, legacy resource rescue, and capped power rescue: PASS');
