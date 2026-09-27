/* The Galaxy's SECURED/LIBERATED badge must follow settled map control, not
   mission replay counts. Extract the small UI derivation because importing the
   full scene in Node requires the browser's Three/WebGL global at module load. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MISSION_CATALOG, UGA_GROUND_AREA_CATALOG } from '../src/domain/catalog.js';
import { derivePlanetControl, isGroundAreaUnlocked } from '../src/domain/ground_control.js';

const source = fs.readFileSync(new URL('../src/space_experience.js', import.meta.url), 'utf8');
const match = source.match(/  function frontStatusForSystem\(systemId\) \{[\s\S]*?\n  \}\n\n  function galaxyFrontStatuses\(/);
assert.ok(match, 'Galaxy front status derivation must remain available for this regression');
const statusSource = match[0].slice(0, -'\n\n  function galaxyFrontStatuses('.length);

function statusFor(state, systemId) {
  const status = vm.runInNewContext(`(${statusSource})`, { state, derivePlanetControl, MISSION_CATALOG, isGroundAreaUnlocked });
  return status(systemId);
}

const victory = (area, mapId) => ({
  operation: {
    missionId: area.missionId,
    proxyFactionId: area.missionId.startsWith('uga_') ? 'nova' : area.missionId.split('_')[0],
    battlefield: { location: { systemId: area.systemId, planetId: area.planetId, areaId: area.id, mapId } }
  },
  result: { outcome: 'victory', missionId: area.missionId }
});

const career = (systemId, areas, history, completions) => ({
  world: { systems: { [systemId]: { discovered: true, soloFront: { pressure: 20 } } } },
  missions: Object.fromEntries(areas.map(area => [area.missionId, { completions: completions[area.missionId] || 0 }])),
  operations: { history }
});

for (const systemId of ['aelos', 'veyra', 'karak']) {
  const areas = Object.values(UGA_GROUND_AREA_CATALOG).filter(area => area.systemId === systemId);
  assert.equal(areas.length, 3, `${systemId} fixture expects three authored areas`);
  const first = areas[0];
  const replay = Array.from({ length: areas.length }, () => victory(first, first.maps[0].id));
  const replayState = career(systemId, areas, replay, { [first.missionId]: areas.length });
  assert.notEqual(statusFor(replayState, systemId).shortLabel, systemId === 'karak' ? 'LIBERATED' : 'SECURED',
    `${systemId} must not be declared held after replaying one mission`);

  const oneMapPerArea = areas.map(area => victory(area, area.maps[0].id));
  const partialState = career(systemId, areas, oneMapPerArea,
    Object.fromEntries(areas.map(area => [area.missionId, 1])));
  assert.notEqual(statusFor(partialState, systemId).shortLabel, systemId === 'karak' ? 'LIBERATED' : 'SECURED',
    `${systemId} must not be declared held after only one map in each area`);

  const allMaps = areas.flatMap(area => area.maps.map(map => victory(area, map.id)));
  const completeState = career(systemId, areas, allMaps,
    Object.fromEntries(areas.map(area => [area.missionId, area.maps.length])));
  assert.equal(statusFor(completeState, systemId).shortLabel, systemId === 'karak' ? 'LIBERATED' : 'SECURED',
    `${systemId} is held only after every authored planet's areas and maps are cleared`);
  completeState.world.systems[systemId].discovered = false;
  assert.equal(statusFor(completeState, systemId).shortLabel, 'UNCHARTED',
    `${systemId} must not disclose the status of an undiscovered system`);
}

console.log('front-status-ground-control.test.mjs PASS');
