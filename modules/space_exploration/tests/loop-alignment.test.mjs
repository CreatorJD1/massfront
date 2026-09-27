/* L4/L5 + reward loop — purchases must produce capabilities, and the reward
   plan must follow the front.

   Before this, 7 of 9 research nodes and 10 of 12 specialist perks were
   free text nothing consumed: a player spent research points and staff slots
   and the game state did not change. These tests walk the seam
   (calculateFacilityCapabilities) end to end so no effect can silently
   degrade back into decoration, and they pin the two reward-loop rules:
   a hot front pays a bounty, a re-run decays toward its floor. */
import assert from 'node:assert/strict';
import {
  CONSTRUCTION_FACILITY_CATALOG,
  DISTRICT_CATALOG,
  MISSION_CATALOG,
  MODULE_CATALOG,
  RESEARCH_CATALOG,
  beginGroundOperation,
  calculateFacilityCapabilities,
  commissionCareerFaction,
  commitResearch,
  createGroundResult,
  createInitialDomainState,
  createShowcaseReadyDomainState,
  getCoreCommissionReserve,
  getCoreFacilityId,
  getFacilityChoices,
  getUgaGroundAreaOptions,
  grantFactionResidency,
  installDistrictModule,
  validateGroundOperation
} from '../src/domain/index.js';

function readySpecialist(state, specialistId) {
  const person = state.personnel.specialists[specialistId];
  person.unlocked = true;
  person.status = 'ready';
  person.readiness = 100;
}

/* Residency is a governed transition (career commissioned, charter researched,
   embassy open), so walk it with the real functions instead of hand-setting a
   flag the validator rightly rejects. */
function residentFaction(state, factionId) {
  commissionDistrict(state, 'research');
  commissionDistrict(state, 'factions');
  state.resources.researchPoints = Math.max(state.resources.researchPoints || 0, 2000);
  let next = state;
  if (!next.research.completedIds.includes('uga_resident_charter')) next = commitResearch(next, 'uga_resident_charter').state;
  if (!next.factions[factionId].resident) next = grantFactionResidency(next, factionId);
  return next;
}

/* Hand-commission a district the way a finished commission job would: the
   validator requires the tier-1 core facility to exist alongside the flag. */
function commissionDistrict(state, districtId, level = 1) {
  const district = state.ship.districts[districtId];
  district.commissioned = true;
  district.built = true;
  district.level = Math.max(district.level, level);
  district.tier = Math.max(district.tier, level);
  district.facilities.tier1 = getCoreFacilityId(districtId);
}

/* ---- L4: completed research lands in the capability seam ---- */
{
  const state = createInitialDomainState();
  commissionDistrict(state, 'research');
  state.resources.researchPoints = 2000;
  assert.equal(calculateFacilityCapabilities(state).transitFuelPct, 0, 'no research, no effects');

  let next = commitResearch(state, 'universal_spectral_cartography').state;
  let caps = calculateFacilityCapabilities(next);
  assert.equal(caps.surveyResearchRewardPct, 10, 'Spectral Cartography must boost survey yields');
  assert.equal(caps.surveyIntelligenceBonus, 1, 'Spectral Cartography must sharpen probe intelligence');

  next = commitResearch(next, 'universal_fold_harmonics').state;
  assert.equal(calculateFacilityCapabilities(next).transitFuelPct, -15, 'Fold Harmonics must cut transit fuel');

  next = commitResearch(next, 'universal_probe_autonomy').state;
  assert.equal(calculateFacilityCapabilities(next).surveyProbeRefundInterval, 3, 'Autonomous Probes must refund one probe every third survey');
}

/* Trauma Recovery needs the Containment Institute; its payoff is faster
   healing for personnel and factions on every recovery cycle. */
{
  const state = createInitialDomainState();
  commissionDistrict(state, 'research', 3);
  state.resources.researchPoints = 2000;
  state.resources.bioSamples = 50;
  const containment = Object.values(CONSTRUCTION_FACILITY_CATALOG).find(facility => facility.effects?.advancedContainment);
  assert.ok(containment, 'the catalog must author a Containment Institute facility');
  state.ship.districts.research.facilities.tier2 = getFacilityChoices('research', 2)[0].id;
  state.ship.districts.research.facilities.tier3 = containment.id;

  let next = commitResearch(state, 'uga_brood_containment').state;
  next = commitResearch(next, 'uga_trauma_recovery').state;
  const caps = calculateFacilityCapabilities(next);
  assert.equal(caps.personnelRecoveryCycles, -1, 'Trauma Recovery must shorten injury countdowns');
  assert.equal(caps.factionRecoveryCycles, -1, 'Trauma Recovery must shorten faction recovery');
}

/* Doctrine research is alliance-scoped: the branch faction gains standing. */
{
  const state = residentFaction(commissionCareerFaction(createInitialDomainState(), 'nova'), 'nova');
  const next = commitResearch(state, 'nova_pathfinder_doctrine').state;
  const caps = calculateFacilityCapabilities(next);
  assert.equal(caps.novaReputationPct, 12, 'Nova Pathfinder Doctrine must deepen the Nova alliance');
  assert.equal(caps.operationResearchRewardPct, 10, 'Nova Pathfinder Doctrine must fund methodical research');
  assert.equal(calculateFacilityCapabilities(state).novaReputationPct, undefined, 'an uncommitted doctrine contributes nothing');
}

/* ---- L5: specialist perks fire only where the specialist can apply them ---- */
{
  const state = createInitialDomainState();
  readySpecialist(state, 'nova_scout_ilan');

  state.ship.districts.command.staff = ['nova_scout_ilan'];
  assert.equal(calculateFacilityCapabilities(state).surveyIntelligenceBonus, undefined,
    'Ilan is a recon specialist: staffing Command must not grant survey intelligence');

  state.ship.districts.command.staff = [];
  state.ship.districts.survey.staff = ['nova_scout_ilan'];
  assert.equal(calculateFacilityCapabilities(state).surveyIntelligenceBonus, 1,
    'Ilan staffed in Survey must grant the signal-discovery perk');

  /* An injured specialist is in a recovery bed, not on the deck. */
  state.personnel.specialists.nova_scout_ilan.injury = { severity: 'light', recoveryCycles: 2 };
  assert.equal(calculateFacilityCapabilities(state).surveyIntelligenceBonus, undefined,
    'an injured specialist must not contribute perks');
}

/* Refund intervals are thresholds: the strongest source wins instead of the
   absurd additive stack where two refunds could only make refunds rarer. */
{
  const state = createInitialDomainState();
  commissionDistrict(state, 'research');
  state.resources.researchPoints = 2000;
  let next = commitResearch(state, 'universal_probe_autonomy').state;
  assert.equal(calculateFacilityCapabilities(next).surveyProbeRefundInterval, 3);

  readySpecialist(next, 'syndicate_scout_nix');
  next.ship.districts.command.staff = ['syndicate_scout_nix'];
  assert.equal(calculateFacilityCapabilities(next).surveyProbeRefundInterval, 2,
    'Nix (every 2nd) must beat the research interval (every 3rd), never sum to 5');
}

/* Sumi's Harmonic Synthesis discounts module components on the one module
   purchase path. */
{
  const installCosts = staffSumi => {
    const state = createShowcaseReadyDomainState();
    for (const district of Object.values(state.ship.districts)) district.staff = [];
    const socket = DISTRICT_CATALOG.research.sockets.find(entry => entry.unlockLevel <= state.ship.districts.research.level);
    const moduleId = socket.compatibleModuleIds[0];
    if (staffSumi) {
      readySpecialist(state, 'nova_tech_sumi');
      state.ship.districts.research.staff = ['nova_tech_sumi'];
    }
    const reserve = getCoreCommissionReserve(state);
    for (const [key, amount] of Object.entries(reserve.cost || {})) {
      state.resources[key] = Math.max(state.resources[key] || 0, amount + 500);
    }
    for (const [key, amount] of Object.entries(MODULE_CATALOG[moduleId].cost || {})) {
      state.resources[key] = Math.max(state.resources[key] || 0, amount + 500);
    }
    const pct = calculateFacilityCapabilities(state).moduleCostPct || 0;
    const before = structuredClone(state.resources);
    const next = installDistrictModule(state, 'research', socket.id, moduleId);
    return { pct, spent: Object.fromEntries(Object.keys(before).map(key => [key, before[key] - next.resources[key]])), module: MODULE_CATALOG[moduleId] };
  };

  const plain = installCosts(false);
  const discounted = installCosts(true);
  assert.equal(plain.pct, 0, 'no Sumi on deck, no module discount');
  assert.equal(discounted.pct, -15, 'Sumi staffed in Research must apply her -15% module-cost perk');
  for (const [key, amount] of Object.entries(plain.module.cost || {})) {
    assert.equal(plain.spent[key], Math.round(amount * (100 + plain.pct) / 100), `undiscounted install must pay full ${key}`);
    assert.equal(discounted.spent[key], Math.round(amount * (100 + discounted.pct) / 100), `Sumi must discount ${key} by 15%`);
  }
}

/* ---- Reward loop: the front pays a bounty, re-farming decays ---- */
{
  const mission = MISSION_CATALOG.uga_pale_bloom;
  // Compact: the always-open bottom rung of the linear map ladder.
  const mapId = getUgaGroundAreaOptions('uga_pale_bloom').maps[0].id;
  const launch = state => beginGroundOperation(state, { missionId: 'uga_pale_bloom', mapId });

  // Karak's authored front starts at pressure 72: a 29% salvage bounty.
  const cold = launch(createShowcaseReadyDomainState());
  assert.equal(cold.operation.rewardModifiers.frontBountyPct, Math.round(72 * 40 / 100));
  assert.equal(cold.operation.rewardModifiers.replayScalePct, 100);
  assert.equal(cold.operation.rewardPlan.credits,
    Math.round(mission.rewards.credits * (100 + Math.round(72 * 40 / 100)) / 100),
    'the front bounty must pay on credits at launch');
  assert.equal(validateGroundOperation(cold.operation).ok, true);

  const hotState = createShowcaseReadyDomainState();
  hotState.world.systems.karak.soloFront.pressure = 100;
  const hot = launch(hotState);
  assert.equal(hot.operation.rewardModifiers.frontBountyPct, 40, 'a boiling front pays the full bounty');
  assert.equal(hot.operation.rewardPlan.credits, Math.round(mission.rewards.credits * 140 / 100));
  assert.equal(hot.operation.rewardPlan.researchPoints, mission.rewards.researchPoints,
    'the bounty is salvage: research points keep their authored value');

  const farmedState = createShowcaseReadyDomainState();
  farmedState.world.systems.karak.soloFront.pressure = 100;
  farmedState.missions.uga_pale_bloom.completions = 2;
  const farmed = launch(farmedState);
  assert.equal(farmed.operation.rewardModifiers.replayScalePct, Math.round(100 * 0.72 ** 2));
  const hotPlan = hot.operation.rewardPlan;
  for (const key of Object.keys(hotPlan)) {
    assert.equal(farmed.operation.rewardPlan[key], Math.round(hotPlan[key] * Math.round(100 * 0.72 ** 2) / 100),
      `re-farming must decay ${key}`);
  }

  const deepState = structuredClone(farmedState);
  deepState.missions.uga_pale_bloom.completions = 20;
  const deep = launch(deepState);
  assert.equal(deep.operation.rewardModifiers.replayScalePct, 35, 'replay decay must bottom out at its floor');

  // The validator recomputes from the mission table + modifiers: legacy flat
  // plans pass, tampered plans are rejected, bad modifiers are rejected.
  const legacy = structuredClone(cold.operation);
  delete legacy.rewardModifiers;
  legacy.rewardPlan = structuredClone(mission.rewards);
  assert.equal(validateGroundOperation(legacy).ok, true, 'a legacy operation without modifiers must still validate');

  const tampered = structuredClone(cold.operation);
  tampered.rewardPlan.credits += 1;
  assert.equal(validateGroundOperation(tampered).ok, false, 'a hand-edited reward plan must fail validation');

  const badModifiers = structuredClone(cold.operation);
  badModifiers.rewardModifiers = { frontBountyPct: 400, replayScalePct: 100 };
  assert.equal(validateGroundOperation(badModifiers).ok, false, 'out-of-range modifiers must fail validation');
}

/* ---- Consumed effects: kest credits, doctrine reputation, medic recovery ---- */
{
  const mapId = getUgaGroundAreaOptions('uga_pale_bloom').maps[0].id;
  const run = (mutate, options = {}) => {
    let state = createShowcaseReadyDomainState();
    for (const district of Object.values(state.ship.districts)) district.staff = [];
    if (mutate) state = mutate(state) || state;
    const launch = beginGroundOperation(state, { missionId: 'uga_pale_bloom', mapId, supportId: options.supportId });
    const report = {
      outcome: 'victory', score: 90, primaryObjectiveComplete: true, secondaryObjectivesComplete: 0,
      injuryBand: options.injuryBand || 'moderate',
      // The FIRST injured id soaks the showcase's casualty-forecast reduction;
      // a decoy in front keeps the measured patient's math clean.
      injuredPersonnelIds: [launch.operation.specialistIds[1], launch.operation.specialistIds[0]]
    };
    return { result: createGroundResult(launch.operation, report), operation: launch.operation };
  };

  // Black-Market Throughput: +20% credit salvage on results.
  const plainRun = run(null);
  const kestRun = run(state => {
    readySpecialist(state, 'syndicate_support_kest');
    state.ship.districts.logistics.staff = ['syndicate_support_kest'];
  });
  assert.equal(kestRun.result.rewards.credits,
    Math.floor(plainRun.result.rewards.credits * 120 / 100),
    'Kest staffed in Logistics must pay +20% credit salvage');

  // Doctrine research deepens the hiring alliance: +12% reputation.
  assert.ok(!plainRun.operation.configuration.facilityEffects.novaReputationPct, 'showcase baseline must not pre-apply doctrine effects');
  const doctrineRun = run(state => commitResearch(residentFaction(state, 'nova'), 'nova_pathfinder_doctrine').state);
  assert.equal(doctrineRun.result.factionDelta.reputation,
    Math.floor(plainRun.result.factionDelta.reputation * 112 / 100),
    'Nova Pathfinder Doctrine must pay +12% reputation on Nova contracts');

  // Field medics: every faction's medic shortens that faction's injuries.
  // Severe band + survey drones + the decoy above make the base countdown
  // exactly 3, so a one-cycle medic reduction is observable, not absorbed.
  const medicOptions = { supportId: 'survey_drones', injuryBand: 'severe' };
  const medicPlain = run(null, medicOptions);
  const medicRun = run(state => {
    for (const id of ['nova_medic_orr', 'dominion_medic_tala', 'syndicate_medic_lev']) {
      readySpecialist(state, id);
    }
    state.ship.districts.habitat.staff = ['nova_medic_orr', 'dominion_medic_tala', 'syndicate_medic_lev'];
  }, medicOptions);
  const patientOf = run => run.result.personnelDelta.specialists.find(delta => delta.id === run.operation.specialistIds[0]).injury;
  const plainInjury = patientOf(medicPlain);
  const medicInjury = patientOf(medicRun);
  assert.ok(plainInjury && medicInjury,
    `a severe-band report must injure its patient (plain ${plainInjury?.recoveryCycles ?? 'none'}, medic ${medicInjury?.recoveryCycles ?? 'none'})`);
  assert.equal(medicInjury.recoveryCycles, plainInjury.recoveryCycles - 1,
    'a staffed faction medic must cut the patient\'s recovery countdown by one cycle');
}
