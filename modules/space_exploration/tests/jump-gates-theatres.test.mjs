/* Jump gates and surface theatres.
   Every charted relay lane must have a physical jump gate in BOTH systems —
   a lane you cannot fly is half a route. And every planet's ground areas must
   declare the surface theatre they deploy on: ocean is shipping (the Ocean
   Theatre Tester proved it), gas-giant air ops / interior X-S / moon are the
   reserved next theatres. */
import assert from 'node:assert/strict';
import { SHOWCASE_SYSTEMS, SHOWCASE_LAYOUT } from '../src/systems/showcase_systems.js';
import {
  SURFACE_THEATER_CATALOG,
  PLANET_SURFACE_THEATER,
  PLANET_RUNTIME_REGION,
  getPlanetSurfaceTheater,
  UGA_GROUND_AREA_CATALOG
} from '../src/domain/catalog.js';

{
  /* Gate coverage: for every system pair joined by a relay lane, BOTH systems
     must expose a system-jump gate contact pointing at the other. */
  const gatesOf = systemId => (SHOWCASE_SYSTEMS[systemId]?.contacts || [])
    .filter(contact => contact.interaction === 'system-jump');
  for (const [systemId, entry] of Object.entries(SHOWCASE_LAYOUT.systems)) {
    assert.ok(SHOWCASE_SYSTEMS[systemId], `${systemId} must be an authored system`);
    for (const relayId of entry.relays) {
      const forward = gatesOf(systemId).find(gate => gate.jumpTo === relayId);
      const back = gatesOf(relayId).find(gate => gate.jumpTo === systemId);
      assert.ok(forward, `${systemId} needs a jump gate contact to ${relayId}`);
      assert.ok(back, `${relayId} needs a jump gate contact back to ${systemId}`);
    }
    for (const gate of gatesOf(systemId)) {
      assert.ok(SHOWCASE_LAYOUT.systems[gate.jumpTo], `${gate.id} must jump to a charted system`);
      assert.ok(entry.relays.includes(gate.jumpTo), `${gate.id} must follow an authored relay lane`);
    }
  }
  const totalGates = Object.keys(SHOWCASE_LAYOUT.systems)
    .reduce((sum, id) => sum + gatesOf(id).length, 0);
  assert.ok(totalGates >= 12, `every lane needs two gates; found ${totalGates}`);
}

{
  /* Theatre catalog sanity + per-planet consistency. */
  for (const theater of Object.values(SURFACE_THEATER_CATALOG)) {
    assert.ok(theater.name, 'theatre must carry a display name');
  }
  assert.equal(SURFACE_THEATER_CATALOG.ocean.naval, true);
  assert.equal(SURFACE_THEATER_CATALOG.gas_air.airOnly, true, 'gas-giant ops are air-only');
  assert.equal(SURFACE_THEATER_CATALOG.gas_air.shipped, false, 'gas-air is reserved until the engine theatre ships');
  assert.equal(SURFACE_THEATER_CATALOG.interior_xs.airOnly, true);
  assert.equal(SURFACE_THEATER_CATALOG.moon.lowGravity, true);

  for (const planetId of Object.keys(PLANET_SURFACE_THEATER)) {
    const theater = getPlanetSurfaceTheater(planetId);
    assert.ok(theater, `${planetId} must resolve to a known theatre`);
    const region = PLANET_RUNTIME_REGION[planetId];
    if (theater.shipped) {
      assert.ok(region, `${planetId} (${theater.id}) needs a runtime terrain region`);
    }
  }
  /* Ocean planets ride the proven wet kits. */
  assert.equal(PLANET_RUNTIME_REGION.aelos_caldris, 'aelos_coast', 'Caldris is the Nova ocean coast');
  assert.equal(PLANET_RUNTIME_REGION.orion_nordhall, 'nordhall_isles', 'Nordhall is the Syndicate ocean theatre');
  /* Zephyros is the authored gas_air host: the theatre exists, the planet
     exists, the battle layer does not — so the giant stays undeployable. */
  assert.equal(SURFACE_THEATER_CATALOG.gas_air.shipped, false, 'air-only ops are not in the engine yet');
  assert.equal(PLANET_SURFACE_THEATER.aelos_zephyros, 'gas_air', 'Zephyros is the Aelos fuel giant');
  assert.equal(PLANET_RUNTIME_REGION.aelos_zephyros, null,
    'Zephyros is a reserved gas_air world and must not claim a land template');
  /* Reserved theatres must not claim a runtime template that does not exist. */
  for (const planetId of Object.keys(PLANET_SURFACE_THEATER)) {
    const theater = getPlanetSurfaceTheater(planetId);
    if (!theater.shipped) {
      assert.equal(PLANET_RUNTIME_REGION[planetId], null,
        `${planetId} is a reserved ${theater.id} world and must not claim a land template`);
    }
  }
  /* Every authored ground area still resolves to a shipped planet. */
  for (const area of Object.values(UGA_GROUND_AREA_CATALOG)) {
    const theater = getPlanetSurfaceTheater(area.planetId);
    assert.equal(theater.shipped, true, `${area.id} must deploy on a shipped theatre`);
  }
}

console.log('jump-gates-theatres: ok');
