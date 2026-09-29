import assert from 'node:assert/strict';
import {
  assertDomainState,
  createInitialDomainState,
  createMemoryStorage,
  deployProbe,
  getCoreCommissionReserve,
  getProbeResupplyQuote,
  getSurveyEligibility,
  LocalDomainStore,
  recoverPlanetFind,
  resupplyProbes
} from '../src/domain/index.js';

function hasIssue(error, code) {
  return error?.issues?.some(entry => entry.code === code);
}

/* The frontier ladder chains Aelos route surveys: phase_trace requires the
   capitol vector scan to be depleted first. Climbing the chain via real
   deployProbe calls keeps these fixtures honest about gate order. */
function runChain(state, surveyIds) {
  let current = state;
  for (const surveyId of surveyIds) current = deployProbe(current, surveyId).state;
  return current;
}

const fresh = createInitialDomainState();
// Every new star-route scan is campaign-critical: spending the last probe on
// optional salvage must not strand the next system behind a paid resupply.
const levelTwo = structuredClone(fresh);
levelTwo.ship.districts.survey.level = 2;
const veyraRoute = runChain(levelTwo, ['aelos_capitol_vector', 'aelos_phase_trace']);
const karakRoute = runChain(veyraRoute, ['veyra_cinder_reach_fix', 'veyra_derelict_echo', 'karak_silent_beacons']);
for (const [base, surveyId, systemId] of [
  [fresh, 'aelos_capitol_vector', 'sombrero_i'],
  [veyraRoute, 'veyra_cinder_reach_fix', 'andromeda_iv'],
  [karakRoute, 'karak_grid_triangulation', 'orion_arc']
]) {
  const zeroBudget = structuredClone(base);
  zeroBudget.resources.probes = 0;
  zeroBudget.resources.credits = 0;
  assertDomainState(zeroBudget);
  const quote = getSurveyEligibility(zeroBudget, surveyId);
  assert.equal(quote.ok, true, `${surveyId} remains reachable with no probes or credits`);
  assert.equal(quote.emergency, true);
  const result = deployProbe(zeroBudget, surveyId).state;
  assert.equal(result.resources.probes, 0);
  assert.equal(result.world.systems[systemId].discovered, true, `${surveyId} opens its next star`);
  assert.equal(getSurveyEligibility(result, surveyId).emergency, false, 'rescue remains one-time');
}
assert.deepEqual(getProbeResupplyQuote(fresh), {
  available: false, amount: 0, targetProbes: 3, creditsCost: 0, canPay: false
});
assert.strictEqual(resupplyProbes(fresh), fresh, 'a full magazine must not create a save revision');
const chainStart = runChain(fresh, ['aelos_capitol_vector']);
const normal = deployProbe(chainStart, 'aelos_phase_trace');
assert.equal(normal.state.resources.probes, chainStart.resources.probes - 1, 'normal surveys still consume a probe');
assert.equal(getSurveyEligibility(fresh, 'aelos_phase_trace').emergency, false);

const stranded = structuredClone(chainStart);
stranded.resources.probes = 0;
stranded.resources.credits = 0;
assertDomainState(stranded);
const routeQuote = getSurveyEligibility(stranded, 'aelos_phase_trace', { planetId: 'aelos_caldris' });
assert.equal(routeQuote.ok, true, 'the authored route survey must recover a zero-credit career');
assert.equal(routeQuote.emergency, true);
assert.equal(routeQuote.probeCost, 0);
assert.equal(routeQuote.standardProbeCost, 1);

const wrongPlanet = getSurveyEligibility(stranded, 'aelos_phase_trace', { planetId: 'aelos_ithara' });
assert.equal(wrongPlanet.ok, false, 'emergency launch must not bypass target selection');
assert(wrongPlanet.issues.some(entry => entry.code === 'SURVEY_WRONG_PLANET'));
const uncommissioned = structuredClone(stranded);
uncommissioned.ship.districts.survey.commissioned = false;
uncommissioned.ship.districts.survey.built = false;
uncommissioned.ship.districts.survey.facilities.tier1 = null;
assert.equal(getSurveyEligibility(uncommissioned, 'aelos_phase_trace').ok, false, 'emergency launch must not commission the Survey Lab');

assert.throws(
  () => recoverPlanetFind(stranded, { id: 'caldris_alloy_shelf', type: 'alloys', amount: 620 }),
  error => hasIssue(error, 'PROBE_SHORTAGE'),
  'free launches are never spendable on ore'
);
const rescued = deployProbe(stranded, 'aelos_phase_trace').state;
assert.equal(rescued.resources.probes, 0, 'emergency survey must not create or overspend inventory');
assert.equal(rescued.world.systems.veyra.discovered, true, 'the priority signal must reopen the campaign route');
assert.equal(rescued.surveys.aelos_phase_trace.depleted, true);
assert.equal(rescued.revision > stranded.revision, true);
assert.equal(getSurveyEligibility(rescued, 'aelos_phase_trace').emergency, false, 'depleted signals cannot keep an emergency waiver');
assert.throws(() => deployProbe(rescued, 'aelos_phase_trace'), error => hasIssue(error, 'SURVEY_DEPLETED'), 'emergency survey cannot repeat');
const veyraLevel = getSurveyEligibility(rescued, 'veyra_photon_ring');
assert.equal(veyraLevel.ok, false, 'free probe does not bypass a level-two Survey Lab');
assert(veyraLevel.issues.some(entry => entry.code === 'SURVEY_LEVEL_REQUIRED'));
const census = deployProbe(rescued, 'aelos_traffic_census').state;
assert.equal(census.resources.probes, 0, 'the separate priority signal also spends no nonexistent probe');
assert.equal(census.surveys.aelos_traffic_census.depleted, true);

const storage = createMemoryStorage();
const firstStore = new LocalDomainStore({ storage, key: 'probe-resupply-critical-survey-test' });
firstStore.load({ recover: false });
firstStore.save(census, { type: 'survey:priority-rescue' });
const reloaded = new LocalDomainStore({ storage, key: 'probe-resupply-critical-survey-test' }).load({ recover: false });
assert.equal(reloaded.schemaVersion, 7, 'existing save schema is sufficient');
assert.equal(reloaded.resources.probes, 0);
assert.equal(reloaded.surveys.aelos_phase_trace.depleted, true);
assert.throws(() => deployProbe(reloaded, 'aelos_phase_trace'), error => hasIssue(error, 'SURVEY_DEPLETED'));

const coreCredits = getCoreCommissionReserve(fresh).cost.credits;
const protectedBudget = structuredClone(fresh);
protectedBudget.resources.probes = 0;
protectedBudget.resources.credits = coreCredits + 449;
assert.deepEqual(getProbeResupplyQuote(protectedBudget), {
  available: true, amount: 3, targetProbes: 3, creditsCost: 450, canPay: false
});
assert.throws(() => resupplyProbes(protectedBudget), error => hasIssue(error, 'PROBE_RESUPPLY_UNAFFORDABLE'));
assert.equal(protectedBudget.resources.probes, 0, 'failed purchase must not mutate input');

const paidBudget = structuredClone(protectedBudget);
paidBudget.resources.credits = coreCredits + 450;
assert.equal(getProbeResupplyQuote(paidBudget).canPay, true);
const paid = resupplyProbes(paidBudget);
assert.equal(paid.resources.probes, 3);
assert.equal(paid.resources.credits, coreCredits, 'purchase must preserve the exact core credit reserve');
assert.equal(paid.revision, paidBudget.revision + 1);
assert.equal(paidBudget.resources.probes, 0, 'paid purchase must not mutate input');
assert.strictEqual(resupplyProbes(paid), paid, 'the bounded magazine cannot be overfilled by repeated calls');
assertDomainState(paid);

console.log('probe resupply and critical survey recovery: passed');
