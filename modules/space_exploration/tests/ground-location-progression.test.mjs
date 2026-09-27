import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  CATALOG_VERSION,
  MISSION_CATALOG,
  UGA_GROUND_AREA_CATALOG,
  chooseGalaxyOperationId,
  createGroundOperation,
  createInitialDomainState,
  createShowcaseReadyDomainState,
  createUgaGroundLocation,
  deployProbe,
  getSurveyNextAction,
  getUgaGroundAreaForMission,
  getUgaGroundAreaOptions,
  validateCatalogs,
  validateGroundOperation,
  validateGroundOperationRequest
} from '../src/domain/index.js';
import { deterministicId, hash32 } from '../src/domain/deterministic.js';

assert.equal(CATALOG_VERSION, 8);
assert.deepEqual(validateCatalogs(), { ok: true, errors: [] });
assert.equal(Object.keys(UGA_GROUND_AREA_CATALOG).length, 9);

const glSource = fs.readFileSync(new URL('../../../src/engine/gl.js', import.meta.url), 'utf8');
const mapDefsExpression = glSource.match(/const MAPDEFS=(\(\(\)=>\{[\s\S]*?return out;\s*\}\)\(\));/);
assert.ok(mapDefsExpression, 'base RTS MAPDEFS authority must remain extractable');
const mapDefs = vm.runInNewContext(mapDefsExpression[1]);
const publicMapIds = new Set();

for (const mission of Object.values(MISSION_CATALOG)) {
  const area = getUgaGroundAreaForMission(mission.id);
  const options = getUgaGroundAreaOptions(mission.id);
  assert.ok(area, `${mission.id} must own a UGA ground area`);
  assert.equal(area.id, mission.groundAreaId);
  assert.equal(area.missionId, mission.id);
  assert.equal(area.systemId, mission.systemId);
  assert.equal(area.siteId, mission.siteId);
  assert.deepEqual(area.maps.map(map => map.size), ['compact', 'standard', 'large']);
  assert.equal(area.maps.find(map => map.id === area.recommendedMapId)?.size, 'standard');
  assert.doesNotMatch(JSON.stringify(options), /runtimeTemplateMapId|nordhall|vespera|pyraeth/i,
    `${mission.id} public map choices must not leak terrain-template lore`);
  for (const map of area.maps) {
    assert.equal(publicMapIds.has(map.id), false, `${map.id} must be globally unique`);
    publicMapIds.add(map.id);
    const runtime = mapDefs[map.runtimeTemplateMapId];
    assert.ok(runtime, `${map.runtimeTemplateMapId} must exist in base RTS MAPDEFS`);
    assert.equal(runtime.size, map.size, `${map.id} size must match its runtime template`);
    const expectedRegion = map.runtimeTemplateMapId.replace(/_(?:small|medium|large)$/, '');
    assert.equal(runtime.region, expectedRegion, `${map.id} template must stay in its authored base region`);
    const location = createUgaGroundLocation(mission.id, map.id);
    assert.equal(location.mapId, map.id);
    assert.equal(location.size, map.size);
    assert.doesNotMatch(JSON.stringify(location), /runtimeTemplateMapId|nordhall|vespera|pyraeth/i,
      `${map.id} operation location must remain UGA-facing`);
  }
}
assert.equal(publicMapIds.size, 27);

/* The frontier ladder gates the Aelos scans in sequence: traffic census
   needs the capitol vector and phase trace rungs depleted first. */
const runChain = (state, surveyIds) => surveyIds.reduce(
  (current, surveyId) => deployProbe(current, surveyId).state, state);
const aelosChain = () => runChain(createInitialDomainState(), ['aelos_capitol_vector', 'aelos_phase_trace']);

const scanA = deployProbe(aelosChain(), 'aelos_traffic_census');
const scanB = deployProbe(aelosChain(), 'aelos_traffic_census');
assert.deepEqual(scanA.nextAction, scanB.nextAction, 'scan next action must be deterministic');
assert.deepEqual(scanA.nextAction, getSurveyNextAction(scanA.state, 'aelos_traffic_census', scanA.rewards));
assert.equal(scanA.nextAction.kind, 'UgaScanNextActionV1');
assert.equal(scanA.nextAction.action, 'inspect-ground-area');
assert.equal(scanA.nextAction.systemId, 'aelos');
assert.equal(scanA.nextAction.planetId, 'aelos_ithara');
assert.equal(scanA.nextAction.areaIds.length, 3);
assert.equal(scanA.nextAction.areas[0].planetId, 'aelos_ithara',
  'a discovery may unlock other planets, but the surveyed planet is offered first');
assert.equal(scanA.nextAction.label, 'CHOOSE PLANET AND AREA');
assert.equal(new Set(scanA.nextAction.areas.map(area => area.planetId)).size, 2,
  'cross-planet areas remain selectable instead of being silently discarded');
assert.deepEqual(scanA.nextAction.resourceKeys, ['components', 'credits', 'researchPoints']);
assert.doesNotMatch(JSON.stringify(scanA.nextAction), /runtimeTemplateMapId|nordhall|vespera|pyraeth/i);

const routeScan = deployProbe(runChain(createInitialDomainState(), ['aelos_capitol_vector']), 'aelos_phase_trace');
assert.equal(routeScan.nextAction.action, 'plot-system-course');
assert.equal(routeScan.nextAction.targetSystemId, 'veyra');
assert.deepEqual(routeScan.nextAction.areaIds, []);

const aelosOperations = Object.values(MISSION_CATALOG).filter(mission => mission.systemId === 'aelos');
const aelosEligibleIds = aelosOperations.map(mission => mission.id);
assert.equal(chooseGalaxyOperationId(aelosOperations, aelosEligibleIds), 'nova_heliograph_wake');
assert.equal(chooseGalaxyOperationId(aelosOperations, aelosEligibleIds, ['aelos_heliograph']), 'dominion_caldris_claim',
  'the first controlled region must not hide the next playable operation');
assert.equal(chooseGalaxyOperationId(aelosOperations, aelosEligibleIds, [], scanA.nextAction.primaryAreaId), 'syndicate_black_manifest',
  'a playable scanned-planet area takes priority over catalog order');
assert.equal(chooseGalaxyOperationId(aelosOperations, ['nova_heliograph_wake'], [], scanA.nextAction.primaryAreaId), 'nova_heliograph_wake',
  'a locked local area must not displace a different playable operation');
assert.equal(chooseGalaxyOperationId(aelosOperations, ['nova_heliograph_wake'], aelosOperations.map(mission => mission.groundAreaId)), 'nova_heliograph_wake',
  'completed operations remain available when the system is fully controlled');
assert.equal(chooseGalaxyOperationId([]), null);

const hivePending = createShowcaseReadyDomainState();
hivePending.world.systems.karak.infestation.hiveTargetsConfirmed = false;
hivePending.surveys.karak_hive_scan.depleted = false;
hivePending.surveys.karak_hive_scan.status = 'available';
hivePending.surveys.karak_hive_scan.completedRevision = null;
hivePending.discoveries.depletedSurveyIds = hivePending.discoveries.depletedSurveyIds.filter(id => id !== 'karak_hive_scan');
hivePending.discoveries.foundIds = hivePending.discoveries.foundIds.filter(id => id !== 'karak_hive_geometry');
hivePending.intelligence.evidenceIds = hivePending.intelligence.evidenceIds.filter(id => id !== 'karak_hive_geometry');
hivePending.story.completedStepIds = hivePending.story.completedStepIds.filter(id => id !== 'karak_hive_mapped');
hivePending.story.currentStep = 'karak_infestation_confirmed';
hivePending.ship.districts.survey.level = 2;
const labAction = getSurveyNextAction(hivePending, 'karak_silent_beacons');
assert.equal(labAction.action, 'prepare-survey-lab');
assert.equal(labAction.primaryAreaId, null);
assert.equal(labAction.targetSurveyId, 'karak_hive_scan');
assert.match(labAction.label, /SURVEY LAB.*LEVEL 3/);
hivePending.ship.districts.survey.level = 3;
const hiveAction = getSurveyNextAction(hivePending, 'karak_silent_beacons');
assert.equal(hiveAction.action, 'continue-survey');
assert.equal(hiveAction.targetSurveyId, 'karak_hive_scan');
hivePending.world.systems.karak.infestation.hiveTargetsConfirmed = true;
assert.equal(getSurveyNextAction(hivePending, 'karak_silent_beacons').action, 'inspect-ground-area',
  'confirmed hive geometry may finally route to the ground operation');

const exhausted = structuredClone(createInitialDomainState());
exhausted.surveys.karak_grid_triangulation.depleted = true;
exhausted.surveys.karak_silent_beacons.depleted = true;
exhausted.surveys.karak_hive_scan.depleted = true;
const finalSignal = getSurveyNextAction(exhausted, 'karak_silent_beacons');
assert.equal(finalSignal.action, 'review-frontier');
assert.equal(finalSignal.label, 'REVIEW FRONTIER STATUS',
  'a finite exhausted system must never promise another authored signal');

const ready = createShowcaseReadyDomainState();
const missionId = 'uga_pale_bloom';
const area = getUgaGroundAreaForMission(missionId);
const missingMap = validateGroundOperationRequest(ready, { missionId, proxyFactionId: 'nova' });
assert.equal(missingMap.ok, false);
assert.ok(missingMap.issues.some(entry => entry.code === 'BATTLEFIELD_SELECTION_REQUIRED'));
const internalMap = validateGroundOperationRequest(ready, {
  missionId,
  proxyFactionId: 'nova',
  mapId: 'vespera_plateau_medium'
});
assert.equal(internalMap.ok, false);
assert.ok(internalMap.issues.some(entry => entry.code === 'BATTLEFIELD_MAP_INVALID'));

/* Unlock the ladder rungs this test needs: it creates operations for every
   map size, so seed settled compact+standard victories (the same ledger the
   domain derives control from) before climbing to large. */
for (const clearedMapId of ['karak_meridian_quarantine_compact', 'karak_meridian_quarantine_standard']) {
  ready.operations.history.push({
    operation: { missionId, proxyFactionId: 'nova', battlefield: { location: { systemId: area.systemId, planetId: area.planetId, areaId: area.id, mapId: clearedMapId } } },
    result: { outcome: 'victory', missionId }
  });
}

const selectedOperations = area.maps.map(map => createGroundOperation(ready, {
  missionId,
  proxyFactionId: 'nova',
  mapId: map.id
}));
assert.equal(new Set(selectedOperations.map(operation => operation.operationId)).size, 3,
  'battlefield choice must participate in deterministic operation identity');
for (let index = 0; index < selectedOperations.length; index += 1) {
  const operation = selectedOperations[index];
  assert.deepEqual(operation.battlefield.location, createUgaGroundLocation(missionId, area.maps[index].id));
  assert.equal(validateGroundOperation(operation).ok, true);
}

const tampered = structuredClone(selectedOperations[1]);
tampered.battlefield.location.display.mapName = 'NORDHALL OVERRIDE';
const tamperedValidation = validateGroundOperation(tampered);
assert.equal(tamperedValidation.ok, false);
assert.ok(tamperedValidation.issues.some(entry => entry.code === 'BATTLEFIELD_LOCATION_INVALID'));

/* Locationless GroundOperationV3 records were already durable before catalog-8.
   Recompute the historical deterministic IDs after removing the new field to
   prove the generic validator can still load and resolve those pending saves;
   production prepare remains stricter and is covered by the host adapter test. */
const recovered = structuredClone(selectedOperations[1]);
delete recovered.battlefield.location;
const identityKeys = [
  'schemaVersion', 'profileId', 'sequence', 'launchRevision', 'missionId', 'missionType',
  'systemId', 'siteId', 'sponsorId', 'contractFactionId', 'proxyFactionId',
  'opponentFactionId', 'commanderId', 'specialistIds', 'doctrineId', 'supportId',
  'landingZoneId', 'difficulty', 'intelligence', 'battlefield', 'factionSnapshot',
  'personnelSnapshot', 'deploymentCost', 'returnRoute'
];
const identity = Object.fromEntries(identityKeys.map(key => [key, recovered[key]]));
identity.commanderRosterFingerprint = recovered.commanderRosterFingerprint;
identity.commanderIdentity = recovered.commanderIdentity;
identity.deploymentManifest = recovered.deploymentManifest;
identity.facilityEffects = recovered.configuration.facilityEffects;
recovered.operationId = `gop_${String(recovered.sequence).padStart(4, '0')}_${hash32(identity)}`;
recovered.resultSeed = deterministicId('seed', {
  operationId: recovered.operationId,
  missionId: recovered.missionId,
  siteId: recovered.siteId
});
recovered.returnToken = deterministicId('return', {
  operationId: recovered.operationId,
  profileId: recovered.profileId,
  returnRoute: recovered.returnRoute
});
assert.equal(validateGroundOperation(recovered).ok, true, 'historical locationless V3 pending operation must remain loadable');

console.log('UGA scan -> area -> explicit map -> operation authority: PASS');
