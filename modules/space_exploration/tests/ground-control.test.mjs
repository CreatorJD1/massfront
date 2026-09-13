/* Region control rules, against the real catalog.
   Covers: partial clear does not grant control, clearing every map does, a
   faction contract hands the region to the player's faction, a UGA mission hands
   it to UGA, replayed history cannot double-count, and a planet is only held
   once all of its regions are. */
import assert from 'node:assert/strict';
import {
  GROUND_CONTROL_SCHEMA_VERSION,
  controllingFactionForMission,
  deriveGroundControl,
  derivePlanetControl,
  groundControlSummary
} from '../src/domain/ground_control.js';
import { UGA_GROUND_AREA_CATALOG } from '../src/domain/catalog.js';

const victory = (area, mapId, missionId, proxyFactionId) => ({
  operation: {
    missionId, proxyFactionId,
    battlefield: { location: { areaId: area.id, mapId, planetId: area.planetId, systemId: area.systemId } }
  },
  result: { outcome: 'victory', missionId, proxyFactionId }
});

const stateWith = (...history) => ({ operations: { history } });

const AREA = UGA_GROUND_AREA_CATALOG.karak_meridian_quarantine;   // uga_pale_bloom
const NOVA_AREA = UGA_GROUND_AREA_CATALOG.aelos_heliograph;       // nova_heliograph_wake

/* Empty career reports every authored region, uncontrolled. */
{
  const control = deriveGroundControl(stateWith());
  assert.equal(control.schemaVersion, GROUND_CONTROL_SCHEMA_VERSION);
  const areas = Object.values(control.areas);
  assert.equal(areas.length, Object.keys(UGA_GROUND_AREA_CATALOG).length);
  assert.ok(areas.every(area => !area.controlled && area.clearedMapIds.length === 0));
  assert.ok(areas.every(area => area.totalMaps === 3), 'each authored region exposes three maps');
}

/* Partial clear grants no control. */
{
  const control = deriveGroundControl(stateWith(
    victory(AREA, AREA.maps[0].id, AREA.missionId, 'uga'),
    victory(AREA, AREA.maps[1].id, AREA.missionId, 'uga')
  ));
  const record = control.areas[AREA.id];
  assert.equal(record.clearedMapIds.length, 2);
  assert.equal(record.controlled, false);
  assert.equal(record.controllingFactionId, null);
}

/* Clearing every map takes the region. uga_* is not faction-specific, so UGA holds it. */
{
  const control = deriveGroundControl(stateWith(
    ...AREA.maps.map(map => victory(AREA, map.id, AREA.missionId, 'nova'))
  ));
  const record = control.areas[AREA.id];
  assert.equal(record.controlled, true);
  assert.equal(record.controllingFactionId, 'uga', 'a UGA mission holds its ground for UGA even when fought by a faction proxy');
}

/* A faction contract hands the region to the faction that fought it. */
{
  const control = deriveGroundControl(stateWith(
    ...NOVA_AREA.maps.map(map => victory(NOVA_AREA, map.id, NOVA_AREA.missionId, 'nova'))
  ));
  assert.equal(control.areas[NOVA_AREA.id].controlled, true);
  assert.equal(control.areas[NOVA_AREA.id].controllingFactionId, 'nova');
}

/* Replay safety: the same map cleared repeatedly is still one map. */
{
  const repeated = [
    victory(AREA, AREA.maps[0].id, AREA.missionId, 'uga'),
    victory(AREA, AREA.maps[0].id, AREA.missionId, 'uga'),
    victory(AREA, AREA.maps[0].id, AREA.missionId, 'uga')
  ];
  const record = deriveGroundControl(stateWith(...repeated)).areas[AREA.id];
  assert.equal(record.clearedMapIds.length, 1);
  assert.equal(record.controlled, false, 'replaying one map must never take a three-map region');
}

/* Defeats never take ground. */
{
  const losses = AREA.maps.map(map => {
    const entry = victory(AREA, map.id, AREA.missionId, 'uga');
    entry.result.outcome = 'defeat';
    return entry;
  });
  assert.equal(deriveGroundControl(stateWith(...losses)).areas[AREA.id].controlled, false);
}

/* Planet rollup: Meridian K-4 has three regions and is not held until all three are. */
{
  const meridian = Object.values(UGA_GROUND_AREA_CATALOG).filter(area => area.planetId === 'karak_meridian');
  assert.equal(meridian.length, 3, 'Meridian K-4 is the three-region planet this rollup exists for');
  const twoRegions = meridian.slice(0, 2).flatMap(area => area.maps.map(map => victory(area, map.id, area.missionId, 'uga')));
  let planets = derivePlanetControl(stateWith(...twoRegions));
  assert.equal(planets.karak_meridian.controlledAreas, 2);
  assert.equal(planets.karak_meridian.controlled, false);

  const allRegions = meridian.flatMap(area => area.maps.map(map => victory(area, map.id, area.missionId, 'uga')));
  planets = derivePlanetControl(stateWith(...allRegions));
  assert.equal(planets.karak_meridian.controlledAreas, 3);
  assert.equal(planets.karak_meridian.controlled, true);
  assert.deepEqual(planets.karak_meridian.controllingFactionIds, ['uga']);
}

/* Malformed history must not throw — a legacy operation may carry no location. */
{
  const control = deriveGroundControl(stateWith(
    { operation: {}, result: { outcome: 'victory' } },
    { result: { outcome: 'victory' } },
    null
  ));
  assert.equal(Object.values(control.areas).every(area => !area.controlled), true);
}

/* Faction resolution rules stand alone. */
assert.equal(controllingFactionForMission('uga_hive_heart', 'nova'), 'uga');
assert.equal(controllingFactionForMission('nova_heliograph_wake', 'nova'), 'nova');
assert.equal(controllingFactionForMission('syndicate_black_manifest', 'syndicate'), 'syndicate');
assert.equal(controllingFactionForMission(undefined, undefined), null);

/* Summary totals match the catalog. */
{
  const summary = groundControlSummary(stateWith());
  assert.equal(summary.areasTotal, Object.keys(UGA_GROUND_AREA_CATALOG).length);
  assert.equal(summary.mapsTotal, summary.areasTotal * 3);
  assert.equal(summary.areasControlled, 0);
  assert.equal(summary.planetsTotal, new Set(Object.values(UGA_GROUND_AREA_CATALOG).map(a => a.planetId)).size);
}

console.log('ground-control.test.mjs PASS');
