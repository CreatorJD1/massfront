import assert from 'node:assert/strict';
import {
  advanceExpeditionCycles,
  assertDomainState,
  beginGroundOperation,
  commissionCareerFaction,
  createInitialDomainState,
  createMemoryStorage,
  createShowcaseReadyDomainState,
  enqueueConstruction,
  getCoreCommissionReserve,
  getConstructionStatus,
  getRefuelQuote,
  getUgaGroundAreaOptions,
  installDistrictModule,
  LocalDomainStore,
  normalizeDomainState,
  plotCourse,
  refuelShip,
  validateDomainState
} from '../src/domain/index.js';

const fresh = createInitialDomainState();
assert.equal(fresh.ship.emergencyFuelActive, false);
assert.deepEqual(getRefuelQuote(fresh), {
  available: false, amount: 0, targetFuel: 30, creditsCost: 0,
  clearanceCost: 0, canPay: true, mode: 'paid', emergencyActive: false
});
assert.strictEqual(refuelShip(fresh), fresh, 'a full tank must not create a save revision');

const oldSave = structuredClone(fresh);
delete oldSave.ship.emergencyFuelActive;
const migrated = normalizeDomainState(oldSave);
assert.equal(migrated.ship.emergencyFuelActive, false, 'existing schema-v7 saves default to normal fuel');
assertDomainState(migrated);
const invalid = structuredClone(migrated);
invalid.ship.emergencyFuelActive = 'true';
assert.equal(validateDomainState(invalid).ok, false, 'the emergency flag must be a boolean');

const paidStart = structuredClone(migrated);
paidStart.resources.fuel = 0;
const coreCredits = getCoreCommissionReserve(paidStart).cost.credits;
paidStart.resources.credits = coreCredits + 600;
assert.deepEqual(getRefuelQuote(paidStart), {
  available: true, amount: 30, targetFuel: 30, creditsCost: 600,
  clearanceCost: 0, canPay: true, mode: 'paid', emergencyActive: false
});
const paid = refuelShip(paidStart);
assert.equal(paid.resources.fuel, 30);
assert.equal(paid.resources.credits, coreCredits);
assert.equal(paid.ship.emergencyFuelActive, false);
assert.equal(paid.ship.expeditionCycle, paidStart.ship.expeditionCycle);
assert.equal(paid.revision, paidStart.revision + 1);
assert.equal(paidStart.resources.fuel, 0, 'refuel must not mutate its input');

const protectedBudget = structuredClone(paidStart);
protectedBudget.resources.credits = coreCredits + 599;
assert.equal(getRefuelQuote(protectedBudget).mode, 'emergency', 'nominally affordable fuel must not consume core commissioning credits');
const protectedFill = refuelShip(protectedBudget);
assert.equal(protectedFill.resources.credits, protectedBudget.resources.credits);
assert.equal(protectedFill.ship.emergencyFuelActive, true);

let stranded = commissionCareerFaction(enqueueConstruction(createInitialDomainState(), 'research'), 'nova');
stranded.world.systems.veyra.discovered = true;
stranded.resources.fuel = 0;
stranded.resources.credits = 599;
stranded.factions.nova.status = 'recovering';
stranded.factions.nova.recoveryCycles = 2;
stranded.factions.nova.readiness = 70;
assertDomainState(stranded);
assert.deepEqual(getRefuelQuote(stranded), {
  available: true, amount: 30, targetFuel: 30, creditsCost: 600,
  clearanceCost: 0, canPay: false, mode: 'emergency', emergencyActive: false
});
const startCycle = stranded.ship.expeditionCycle;
const startWork = stranded.ship.constructionQueue[0].workCompleted;
const startPressure = stranded.world.systems.aelos.soloFront.pressure;
const emergency = refuelShip(stranded);
assert.equal(emergency.resources.fuel, 30);
assert.equal(emergency.resources.credits, 599, 'bankrupt fallback charges no partial hidden fee');
assert.equal(emergency.ship.emergencyFuelActive, true);
assert.equal(emergency.ship.expeditionCycle, startCycle);
assert.equal(emergency.ship.constructionQueue[0].workCompleted, startWork);
assert.equal(emergency.world.systems.aelos.soloFront.pressure, startPressure);
assert.equal(emergency.revision, stranded.revision + 1);

const storage = createMemoryStorage();
const store = new LocalDomainStore({ storage, key: 'fuel-recovery-test', initialState: migrated });
store.load({ recover: false });
store.save(emergency, { type: 'refuel:emergency' });
const reloaded = new LocalDomainStore({ storage, key: 'fuel-recovery-test', initialState: migrated }).load({ recover: false });
assert.equal(reloaded.ship.emergencyFuelActive, true, 'emergency status must survive save/reload');

const firstJump = plotCourse(reloaded, 'veyra');
assert.equal(firstJump.route.systemId, 'veyra');
assert.equal(firstJump.resources.fuel, 12);
assert.equal(firstJump.ship.expeditionCycle, startCycle, 'emergency transit must not advance construction time');
assert.equal(firstJump.ship.constructionQueue[0].workCompleted, startWork);
assert.equal(firstJump.ship.processedCycleEventIds.length, reloaded.ship.processedCycleEventIds.length);
assert.equal(firstJump.factions.nova.recoveryCycles, 0, 'emergency transit still heals personnel');
assert.equal(firstJump.factions.nova.status, 'ready');
assert.equal(firstJump.world.systems.aelos.soloFront.pressure, startPressure + 4, 'front pressure still rises');
const returnJump = plotCourse(firstJump, 'aelos');
assert.equal(returnJump.ship.expeditionCycle, startCycle);
assert.equal(returnJump.ship.constructionQueue[0].workCompleted, startWork);

const settledStart = structuredClone(returnJump);
const settledCoreCredits = getCoreCommissionReserve(settledStart).cost.credits;
settledStart.resources.credits = settledCoreCredits + 600 + (30 - settledStart.resources.fuel) * 20;
const settled = refuelShip(settledStart);
assert.equal(settled.ship.emergencyFuelActive, false, 'a paid refill restores normal travel');
assert.equal(settled.resources.credits, settledCoreCredits);
assert.equal(settled.resources.fuel, 30);
const normalJump = plotCourse(settled, 'veyra');
assert.equal(normalJump.ship.expeditionCycle, startCycle + 2);
assert.equal(normalJump.ship.districts.research.commissioned, true, 'normal transit resumes construction work');
assert.equal(normalJump.ship.processedCycleEventIds.length, settled.ship.processedCycleEventIds.length + 1);

let essentialJobs = createInitialDomainState();
for (const districtId of ['research', 'mission_ops', 'hangar']) essentialJobs = enqueueConstruction(essentialJobs, districtId);
essentialJobs.world.systems.veyra.discovered = true;
essentialJobs.resources.fuel = 0;
essentialJobs.resources.credits = 0;
essentialJobs.resources.probes = 0;
assertDomainState(essentialJobs);
const essentialEmergency = refuelShip(essentialJobs);
const essentialOutbound = plotCourse(essentialEmergency, 'veyra');
assert.equal(essentialOutbound.ship.expeditionCycle, essentialJobs.ship.expeditionCycle + 2);
assert.equal(essentialOutbound.ship.districts.mission_ops.commissioned, true, 'emergency travel must finish an essential core even at zero credits and probes');
assert.equal(essentialOutbound.ship.districts.research.commissioned, false, 'optional construction must remain paused');
assert.equal(essentialOutbound.ship.constructionQueue.find(job => job.districtId === 'research').workCompleted, 0);
assert.equal(essentialOutbound.resources.probes, 0, 'emergency transit must not grant a transit probe bonus');
const essentialReturn = plotCourse(essentialOutbound, 'aelos');
assert.equal(essentialReturn.ship.districts.hangar.commissioned, true, 'a second real trip can finish the other essential core');
assert.equal(essentialReturn.ship.districts.research.commissioned, false);
assert.equal(essentialReturn.ship.constructionQueue.find(job => job.districtId === 'research').workCompleted, 0);
assert.equal(essentialReturn.ship.emergencyFuelActive, true);

const powerBaseline = createInitialDomainState();
const essentialQueue = enqueueConstruction(powerBaseline, 'mission_ops');
const brownout = createShowcaseReadyDomainState();
brownout.ship.districts.engineering = structuredClone(powerBaseline.ship.districts.engineering);
brownout.ship.districts.mission_ops = structuredClone(powerBaseline.ship.districts.mission_ops);
brownout.ship.constructionQueue = [structuredClone(essentialQueue.ship.constructionQueue[0])];
brownout.resources.fuel = 0;
brownout.resources.credits = 0;
brownout.resources.probes = 0;
assertDomainState(brownout);
assert.equal(getConstructionStatus(brownout).active, 0, 'brownout leaves no powered construction slot');
const brownoutEmergency = refuelShip(brownout);
const brownoutJump = plotCourse(brownoutEmergency, 'veyra');
assert.equal(brownoutJump.route.systemId, 'veyra');
assert.equal(brownoutJump.ship.expeditionCycle, brownout.ship.expeditionCycle, 'a stalled essential job must not open a free cycle loop');
assert.equal(brownoutJump.ship.constructionQueue[0].workCompleted, 0);
assert.equal(brownoutJump.world.systems.aelos.soloFront.pressure, brownout.world.systems.aelos.soloFront.pressure + 4);

const pendingBase = createShowcaseReadyDomainState();
// Compact map: the always-open bottom rung of the linear map ladder.
const pendingMapId = getUgaGroundAreaOptions('uga_pale_bloom').maps[0].id;
const pending = beginGroundOperation(pendingBase, { missionId: 'uga_pale_bloom', mapId: pendingMapId }).state;
assert.throws(() => plotCourse(pending, 'veyra'), error => error.code === 'OPERATION_PENDING');
const pendingEmergency = structuredClone(pending);
pendingEmergency.ship.emergencyFuelActive = true;
assert.throws(() => plotCourse(pendingEmergency, 'veyra'), error => error.code === 'OPERATION_PENDING');

const fullEmergency = structuredClone(emergency);
assert.deepEqual(getRefuelQuote(fullEmergency), {
  available: false, amount: 0, targetFuel: 30, creditsCost: 600,
  clearanceCost: 600, canPay: false, mode: 'emergency', emergencyActive: true
});
assert.strictEqual(refuelShip(fullEmergency), fullEmergency, 'full emergency tank is a disabled no-op');

const fullClearance = structuredClone(fullEmergency);
const clearanceCoreCredits = getCoreCommissionReserve(fullClearance).cost.credits;
fullClearance.resources.credits = clearanceCoreCredits + 600;
assert.deepEqual(getRefuelQuote(fullClearance), {
  available: true, amount: 0, targetFuel: 30, creditsCost: 600,
  clearanceCost: 600, canPay: true, mode: 'paid', emergencyActive: true
});
const cleared = refuelShip(fullClearance);
assert.equal(cleared.resources.fuel, 30);
assert.equal(cleared.resources.credits, clearanceCoreCredits);
assert.equal(cleared.ship.emergencyFuelActive, false);
assert.equal(cleared.ship.expeditionCycle, fullClearance.ship.expeditionCycle);
assert.equal(cleared.revision, fullClearance.revision + 1);

const cheapClearAttempt = structuredClone(fullEmergency);
cheapClearAttempt.resources.fuel = 29;
cheapClearAttempt.resources.credits = 20;
assert.deepEqual(getRefuelQuote(cheapClearAttempt), {
  available: true, amount: 1, targetFuel: 30, creditsCost: 620,
  clearanceCost: 600, canPay: false, mode: 'emergency', emergencyActive: true
});
const stillEmergency = refuelShip(cheapClearAttempt);
assert.equal(stillEmergency.resources.fuel, 30);
assert.equal(stillEmergency.resources.credits, 20);
assert.equal(stillEmergency.ship.emergencyFuelActive, true, 'one paid unit cannot cheaply clear emergency mode');

const exactClearAttempt = structuredClone(cheapClearAttempt);
exactClearAttempt.resources.credits = getCoreCommissionReserve(exactClearAttempt).cost.credits + 620;
assert.equal(getRefuelQuote(exactClearAttempt).mode, 'paid');
const exactClear = refuelShip(exactClearAttempt);
assert.equal(exactClear.resources.credits, getCoreCommissionReserve(exactClearAttempt).cost.credits);
assert.equal(exactClear.ship.emergencyFuelActive, false);

const moduleBudget = structuredClone(migrated);
moduleBudget.resources.components = getCoreCommissionReserve(moduleBudget).cost.components + 74;
const budgetBefore = JSON.stringify(moduleBudget);
assert.throws(() => installDistrictModule(moduleBudget, 'navigation', 'navigation_socket_1', 'route_predictor'), error => error.code === 'CORE_COMMISSION_RESERVE');
assert.equal(JSON.stringify(moduleBudget), budgetBefore, 'rejected module must not mutate the save');

let modulePower = createInitialDomainState();
for (const districtId of ['research', 'fabricator', 'factions']) modulePower = enqueueConstruction(modulePower, districtId);
modulePower = advanceExpeditionCycles(modulePower, 6, 'module-guard-power').state;
for (const districtId of ['mission_ops', 'hangar']) modulePower = enqueueConstruction(modulePower, districtId);
modulePower = installDistrictModule(modulePower, 'navigation', 'navigation_socket_1', 'route_predictor');
modulePower = installDistrictModule(modulePower, 'survey', 'survey_socket_1', 'spectral_array');
const powerBefore = JSON.stringify(modulePower);
assert.throws(() => installDistrictModule(modulePower, 'fabricator', 'fabricator_socket_1', 'precision_forge'), error => error.code === 'CORE_COMMISSION_POWER_RESERVE');
assert.equal(JSON.stringify(modulePower), powerBefore, 'rejected power draw must not mutate the save');

console.log('UGA fuel recovery and commissioning guard: PASS');
