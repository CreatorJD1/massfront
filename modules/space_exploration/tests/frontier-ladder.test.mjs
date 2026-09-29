/* Frontier ladder — linear unlock progression across all four tiers:
   systems (route surveys, tier 1), planets (prior body's primary survey,
   tier 2), regions (prior region's mission victory, tier 3), and battlefield
   maps (prior size cleared, tier 4). The galaxy opens as one directed
   campaign; these tests pin every rung and the reasons the UI shows. */
import assert from 'node:assert/strict';
import {
  SYSTEM_CATALOG,
  UGA_GROUND_AREA_CATALOG,
  UGA_GROUND_AREA_LADDER,
  UGA_PLANET_LADDER,
  SURVEY_CATALOG,
  MISSION_CATALOG,
  validateCatalogs,
  getPlanetLadderEntry,
  getPlanetPrimarySurveyId
} from '../src/domain/catalog.js';
import {
  isPlanetUnlocked,
  isGroundAreaUnlocked,
  isGroundMapUnlocked,
  deriveGroundControl
} from '../src/domain/ground_control.js';
import { getSurveyEligibility, deployProbe } from '../src/domain/progression.js';
import { getMissionEligibility } from '../src/domain/ground_operation.js';
import { createInitialDomainState, createShowcaseReadyDomainState } from '../src/domain/index.js';

{
  const catalog = validateCatalogs();
  assert.deepEqual(catalog.errors, [], 'the catalog validator must accept the ladder additions');
}

{
  /* Authoring sanity: every ground area sits on exactly one ladder line, every
     ladder planet exists in its system's runtime data, and every planet with a
     ladder predecessor has an authored primary survey to complete. */
  const areasOnLadder = new Set(Object.values(UGA_GROUND_AREA_LADDER).flat());
  for (const areaId of Object.keys(UGA_GROUND_AREA_CATALOG)) {
    assert.ok(areasOnLadder.has(areaId), `${areaId} must appear on exactly one region ladder line`);
  }
  for (const [systemId, ladder] of Object.entries(UGA_PLANET_LADDER)) {
    assert.ok(SYSTEM_CATALOG[systemId], `planet ladder references unknown system ${systemId}`);
    for (const entry of ladder) assert.ok(entry.id && entry.name, `ladder entry on ${systemId} must be authored`);
  }
  for (const [systemId, ladder] of Object.entries(UGA_PLANET_LADDER)) {
    /* Every body except a system's LAST one must carry a primary authored
       survey — it is the rung its successor's gate reads. A survey-less final
       body (Tethys Foundry: deposits only) is legitimate. */
    for (const entry of ladder.slice(0, -1)) {
      assert.ok(getPlanetPrimarySurveyId(entry.id), `${entry.id} needs a primary survey for the next rung's gate`);
    }
    for (let index = 1; index < ladder.length; index += 1) {
      assert.equal(getPlanetLadderEntry(systemId, ladder[index].id).prior.id, ladder[index - 1].id);
    }
  }
}

{
  /* Tier 1 — fresh career: the frontier starts at Aelos; every War Table star
     beyond it is uncharted and its route survey is chain-locked. */
  const state = createInitialDomainState();
  assert.equal(state.world.systems.sombrero_i.discovered, false);
  assert.equal(state.world.systems.andromeda_iv.discovered, false);
  assert.equal(state.world.systems.orion_arc.discovered, false);
  assert.equal(state.world.systems.helios_core.discovered, false);

  const capitol = getSurveyEligibility(state, 'aelos_capitol_vector');
  assert.equal(capitol.ok, true, 'the first route rung must be open from career start');

  const phaseTrace = getSurveyEligibility(state, 'aelos_phase_trace');
  assert.equal(phaseTrace.issues.some(issue => issue.code === 'SURVEY_CHAIN_REQUIRED'), true,
    'phase trace must wait for the capitol vector rung');

  const hiveScan = getSurveyEligibility(state, 'karak_hive_scan');
  assert.equal(hiveScan.issues.some(issue => issue.code === 'SURVEY_CHAIN_REQUIRED'), true,
    'hive tomography must wait for the grid triangulation rung');
}

{
  /* Tier 1 in motion — completing the capitol vector charts Sombrero-I and
     releases the next rung; probes must not leak from a failed probe. */
  let state = createInitialDomainState();
  const probesBefore = state.resources.probes;
  const probed = deployProbe(state, 'aelos_capitol_vector');
  state = probed.state;
  assert.equal(state.world.systems.sombrero_i.discovered, true, 'the route survey must chart Sombrero-I');
  assert.equal(state.surveys.veyra_photon_ring.status, 'locked', 'veyra surveys stay locked until that system charts');
  const phaseTraceAfter = getSurveyEligibility(state, 'aelos_phase_trace');
  assert.equal(phaseTraceAfter.issues.some(issue => issue.code === 'SURVEY_CHAIN_REQUIRED'), false,
    'the chain gate clears once its prerequisite is depleted');
  assert.ok(state.resources.researchPoints > 260, 'the route survey pays research');
  assert.equal(state.world.systems.andromeda_iv.discovered, false, 'later stars stay dark');

  const next = getSurveyEligibility(state, 'aelos_phase_trace');
  assert.equal(next.issues.some(issue => issue.code === 'SURVEY_CHAIN_REQUIRED'), false,
    'the chain gate clears once its prerequisite is depleted');
  assert.equal(state.resources.probes, probesBefore - 1, 'exactly one probe spent');
}

{
  /* Tier 2 — planets: Ithara's surveys are world-locked until Caldris's
     primary scan is done; Karak's second body has no surveys but the gate
     still resolves through the authored ladder. */
  const state = createInitialDomainState();
  const census = getSurveyEligibility(state, 'aelos_traffic_census');
  assert.equal(census.issues.some(issue => issue.code === 'PLANET_LADDER_REQUIRED'), true,
    'Ithara is the second rung of the Aelos planet ladder');

  const caldrisPrimary = getPlanetPrimarySurveyId('aelos_caldris');
  assert.equal(caldrisPrimary, 'aelos_phase_trace');
  state.surveys[caldrisPrimary].depleted = true;
  state.surveys[caldrisPrimary].status = 'completed';
  const censusAfter = getSurveyEligibility(state, 'aelos_traffic_census');
  assert.equal(censusAfter.issues.some(issue => issue.code === 'PLANET_LADDER_REQUIRED'), false,
    'completing the prior primary survey opens the next world');
}

{
  /* Tier 3 — regions: the second Aelos region waits for the first region's
     mission victory, and the lock names the mission to win. */
  const state = createInitialDomainState();
  state.commissioning = { factionId: 'nova', commanderId: 'nova_kai', completed: true, completedRevision: 0 };
  state.factions.nova.resident = true;
  state.personnel.commanders.nova_kai.unlocked = true;

  const first = getMissionEligibility(state, 'nova_heliograph_wake');
  assert.equal(first.locks.some(lock => lock.code === 'REGION_LADDER_REQUIRED'), false,
    'the first region of the campaign has no region gate');

  const second = getMissionEligibility(state, 'dominion_caldris_claim');
  const regionLock = second.locks.find(lock => lock.code === 'REGION_LADDER_REQUIRED');
  assert.ok(regionLock, 'the second region must be region-gated');
  assert.match(regionLock.message, /Heliograph/i, 'the lock must name the mission to win');

  state.missions.nova_heliograph_wake.completions = 1;
  const secondAfter = getMissionEligibility(state, 'dominion_caldris_claim');
  assert.equal(secondAfter.locks.some(lock => lock.code === 'REGION_LADDER_REQUIRED'), false,
    'winning the prior region opens the next one');
}

{
  /* Tier 4 — maps: compact is always open; standard needs compact cleared;
     large needs standard cleared. The gate is proven through the same
     eligibility the deploy button reads. */
  const state = createShowcaseReadyDomainState();
  const areaId = 'aelos_heliograph';
  assert.equal(isGroundMapUnlocked(state, areaId, 'aelos_heliograph_compact'), true);
  assert.equal(isGroundMapUnlocked(state, areaId, 'aelos_heliograph_standard'), false);
  assert.equal(isGroundMapUnlocked(state, areaId, 'aelos_heliograph_large'), false);

  const lockedSelection = getMissionEligibility(state, 'nova_heliograph_wake', { mapId: 'aelos_heliograph_large' });
  assert.equal(lockedSelection.locks.some(lock => lock.code === 'BATTLEFIELD_MAP_LOCKED'), true,
    'a locked map size must be refused at loadout');

  const control = deriveGroundControl(state);
  control.areas[areaId].clearedMapIds.push('aelos_heliograph_compact');
  const staged = { ...state, operations: { ...state.operations, history: [
    ...state.operations.history,
    { operation: { missionId: 'nova_heliograph_wake', battlefield: { location: { areaId, mapId: 'aelos_heliograph_compact', planetId: 'aelos_caldris', systemId: 'aelos' } } }, result: { outcome: 'victory', missionId: 'nova_heliograph_wake' } }
  ] } };
  assert.equal(isGroundMapUnlocked(staged, areaId, 'aelos_heliograph_standard'), true);
  assert.equal(isGroundMapUnlocked(staged, areaId, 'aelos_heliograph_large'), false,
    'clearing compact opens standard only, not the whole region');
}

{
  /* The showcase fixture is the exploration tour: a pristine galaxy that has
     READ the whole route chart (every system charted, all surveys available)
     but fought nothing — completions 0, no settled history. The ladder is
     visible end to end: bottom rungs open, later rungs still gated on real
     wins and scans, which is exactly what the tour promises. */
  const showcase = createShowcaseReadyDomainState();
  for (const systemId of Object.keys(SYSTEM_CATALOG)) {
    assert.equal(showcase.world.systems[systemId].discovered, true, `${systemId} is charted in the showcase fixture`);
    for (const entry of UGA_PLANET_LADDER[systemId]) {
      assert.equal(isPlanetUnlocked(showcase, systemId, entry.id), true, `${entry.id} is open in the tour`);
    }
  }
  const bottomRungs = Object.values(UGA_GROUND_AREA_LADDER).map(ids => ids[0]);
  for (const areaId of bottomRungs) {
    assert.equal(isGroundAreaUnlocked(showcase, areaId), true, `${areaId} is a bottom rung and must be open`);
  }
  assert.equal(isGroundAreaUnlocked(showcase, 'aelos_caldris_customs'), false,
    'a later region rung still awaits its first campaign win');
  const missionsWithAreas = Object.values(MISSION_CATALOG).filter(mission => mission.groundAreaId);
  assert.ok(missionsWithAreas.length >= 9, 'the mission board still carries the authored campaign');
}

console.log('frontier-ladder: ok');
