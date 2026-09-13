import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  CATALOG_VERSION,
  MISSION_CATALOG,
  UGA_GROUND_AREA_CATALOG,
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

const scanA = deployProbe(createInitialDomainState(), 'aelos_traffic_census');
const scanB = deployProbe(createInitialDomainState(), 'aelos_traffic_census');
assert.deepEqual(scanA.nextAction, scanB.nextAction, 'scan next action must be deterministic');
assert.deepEqual(scanA.nextAction, getSurveyNextAction(scanA.state, 'aelos_traffic_census', scanA.rewards));
assert.equal(scanA.nextAction.kind, 'UgaScanNextActionV1');
assert.equal(scanA.nextAction.action, 'inspect-ground-area');
assert.equal(scanA.nextAction.systemId, 'aelos');
assert.equal(scanA.nextAction.planetId, 'aelos_ithara');
assert.equal(scanA.nextAction.areaIds.length, 3);
assert.deepEqual(scanA.nextAction.resourceKeys, ['components', 'credits', 'researchPoints']);
assert.doesNotMatch(JSON.stringify(scanA.nextAction), /runtimeTemplateMapId|nordhall|vespera|pyraeth/i);

const routeScan = deployProbe(createInitialDomainState(), 'aelos_phase_trace');
assert.equal(routeScan.nextAction.action, 'plot-system-course');
assert.equal(routeScan.nextAction.targetSystemId, 'veyra');
assert.deepEqual(routeScan.nextAction.areaIds, []);

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
