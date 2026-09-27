import assert from 'node:assert/strict';
import {
  UGA_GROUND_AREA_CATALOG,
  applyGroundResult,
  beginGroundOperation,
  createGroundResult,
  createShowcaseReadyDomainState,
  getMissionEligibility
} from '../src/domain/index.js';
import { derivePlanetControl } from '../src/domain/ground_control.js';

let state = createShowcaseReadyDomainState();
let victories = 0;
const bloom = UGA_GROUND_AREA_CATALOG.karak_meridian_quarantine;
const spine = UGA_GROUND_AREA_CATALOG.karak_transit_spine;
const heart = UGA_GROUND_AREA_CATALOG.karak_primary_hive;
// Reach Heart as soon as each preceding mission has one win, then finish the
// remaining maps in a different order. The final victory is not Hive Heart.
const route = [
  [bloom, bloom.maps[0]], [spine, spine.maps[0]], [heart, heart.maps[0]],
  ...heart.maps.slice(1).map(map => [heart, map]),
  ...spine.maps.slice(1).map(map => [spine, map]),
  ...bloom.maps.slice(1).map(map => [bloom, map])
];
for (const [area, map] of route) {
  const areaId = area.id;
  assert.equal(getMissionEligibility(state, area.missionId, { mapId: map.id }).ok, true,
    `${areaId}/${map.id} must be playable before planetary control`);
  const launched = beginGroundOperation(state, { missionId: area.missionId, mapId: map.id });
  const result = createGroundResult(launched.operation, {
    outcome: 'victory', score: 90, primaryObjectiveComplete: true,
    secondaryObjectivesComplete: 0, injuryBand: 'none', injuredPersonnelIds: []
  });
  state = applyGroundResult(launched.state, result).state;
  victories += 1;
  if (victories < 9) {
    assert.equal(state.world.systems.karak.infestation.active, true,
      'a single region or map cannot end the planet-wide infestation');
    assert.equal(derivePlanetControl(state).karak_meridian.controlled, false);
    assert.equal(state.story.completedStepIds.includes('karak_reclamation'), false);
  }
}

assert.equal(victories, 9);
assert.equal(derivePlanetControl(state).karak_meridian.controlled, true);
assert.equal(state.world.systems.karak.infestation.active, false);
assert.equal(state.world.systems.karak.infestation.severity, 0);
assert.equal(state.world.systems.karak.populationState, 'recovering');
assert.equal(state.story.completedStepIds.includes('karak_reclamation'), true);

console.log('karak-planet-reclamation.test.mjs PASS');
