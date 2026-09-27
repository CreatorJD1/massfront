/* War Table systems in the exploration chart.
   The base game's galaxy (src/galactic-operations.js PLANETS + src/engine/gl.js)
   owns four stellar systems — Sombrero-I, Andromeda-IV, Orion Arc, Helios Core —
   and four homeworlds — Aelos, Pyraeth, Nordhall, Vespera. All of them must
   exist in the exploration chart with the same star, the same capital world,
   and the same POI identity, or the two halves of the game disagree about the
   galaxy. These tests pin that mapping and the seams that render it. */
import assert from 'node:assert/strict';
import { SYSTEM_CATALOG, SITE_CATALOG, RESOURCE_KEYS, validateCatalogs } from '../src/domain/catalog.js';
import { SHOWCASE_SYSTEMS, SHOWCASE_LAYOUT } from '../src/systems/showcase_systems.js';
import {
  createInitialDomainState,
  createShowcaseReadyDomainState,
  normalizeDomainState,
  migrateDomainState,
  validateDomainState
} from '../src/domain/index.js';

/* system id -> [homeworld planet name, war table planet id] straight from the
   War Table star catalog (PLANETS in the base game). */
const WAR_TABLE_HOMEWORLDS = {
  sombrero_i: ['Aelos', 'sombrero_aelos'],
  andromeda_iv: ['Pyraeth', 'andromeda_pyraeth'],
  orion_arc: ['Nordhall', 'orion_nordhall'],
  helios_core: ['Vespera', 'helios_vespera']
};

{
  const catalog = validateCatalogs();
  assert.deepEqual(catalog.errors, [], 'the catalog validator must accept the War Table additions');
  assert.equal(catalog.ok, true);
}

{
  for (const [systemId, [planetName, planetId]] of Object.entries(WAR_TABLE_HOMEWORLDS)) {
    assert.ok(SYSTEM_CATALOG[systemId], `${systemId} must exist in SYSTEM_CATALOG`);
    const runtime = SHOWCASE_SYSTEMS[systemId];
    assert.ok(runtime, `${systemId} must exist in the runtime chart`);
    const planet = runtime.planets.find(entry => entry.id === planetId);
    assert.ok(planet, `${systemId} must carry its War Table homeworld (${planetId})`);
    assert.equal(planet.name, planetName, `${systemId} homeworld must keep its War Table name`);
    assert.ok(planet.mineralDeposits.length > 0, `${planetName} must carry scannable deposits`);
  }
}

{
  /* Catalog, runtime chart, and layout must describe the same set of systems —
     each seam is consumed by a different renderer and a missing entry in any
     one of them is a silent hole on the map. */
  const catalogIds = Object.keys(SYSTEM_CATALOG).sort();
  const runtimeIds = Object.keys(SHOWCASE_SYSTEMS).sort();
  const layoutIds = Object.keys(SHOWCASE_LAYOUT.systems).sort();
  assert.deepEqual(runtimeIds, catalogIds, 'runtime chart must cover every catalog system');
  assert.deepEqual(layoutIds, catalogIds, 'galaxy layout must place every catalog system');
  for (const systemId of catalogIds) {
    const entry = SYSTEM_CATALOG[systemId];
    for (const siteId of entry.siteIds) {
      assert.equal(SITE_CATALOG[siteId]?.systemId, systemId, `${siteId} must belong to ${systemId}`);
    }
  }
}

{
  /* Deposit ids feed the extracted-deposit ledger and must be unique across the
     whole chart; coordinates are surface picks the survey sphere projects. */
  const depositIds = new Set();
  for (const system of Object.values(SHOWCASE_SYSTEMS)) {
    assert.ok(system.cluster, `${system.id} must sit in a named cluster`);
    assert.ok(SHOWCASE_LAYOUT.clusters[system.cluster], `${system.id} cluster must exist in the layout`);
    for (const planet of system.planets) {
      for (const deposit of planet.mineralDeposits) {
        assert.equal(depositIds.has(deposit.id), false, `${deposit.id} must be globally unique`);
        depositIds.add(deposit.id);
        assert.ok(RESOURCE_KEYS.includes(deposit.type), `${deposit.id} must pay a real resource`);
        assert.ok(deposit.amount > 0, `${deposit.id} must carry a positive yield`);
        assert.ok(Math.abs(deposit.x) <= 0.5 && Math.abs(deposit.y) <= 0.5, `${deposit.id} must sit on the survey sphere`);
      }
      for (const siteId of planet.discoverySiteIds || []) {
        assert.ok(planet.mineralDeposits.some(deposit => deposit.id === siteId),
          `${planet.id} discovery site ${siteId} must be one of its deposits`);
      }
    }
    for (const contact of system.contacts) {
      if (contact.interaction === 'system-jump') {
        assert.ok(SHOWCASE_SYSTEMS[contact.jumpTo], `${contact.id} must jump to a real system`);
        assert.ok(SHOWCASE_LAYOUT.systems[system.id].relays.includes(contact.jumpTo),
          `${contact.id} must follow a charted relay lane`);
      } else if (contact.interaction === 'discovery' || contact.interaction === 'brood-intelligence') {
        /* Contact siteIds may be runtime-only names (Archive Hulk KX-19 has no
           catalog site), but a site that IS cataloged must belong to the
           contact's own system. */
        const site = SITE_CATALOG[contact.siteId];
        if (site) assert.equal(site.systemId, system.id, `${contact.id} must reference a site in its own system`);
      }
    }
  }
  /* Each War Table system must surface its capital site through a contact —
     that is how the POI identity crosses from the War Table into the chart. */
  for (const systemId of Object.keys(WAR_TABLE_HOMEWORLDS)) {
    const capital = SYSTEM_CATALOG[systemId].siteIds[0];
    assert.ok(SHOWCASE_SYSTEMS[systemId].contacts.some(contact => contact.siteId === capital),
      `${systemId} must surface its capital site ${capital} through a contact`);
  }
}

{
  /* Relay lanes power both the galaxy map and the jump gate check
     (`relays.includes`) — an unreciprocated lane is half a route. */
  for (const [systemId, entry] of Object.entries(SHOWCASE_LAYOUT.systems)) {
    assert.ok(entry.coord, `${systemId} needs a chart position`);
    for (const relayId of entry.relays) {
      const target = SHOWCASE_LAYOUT.systems[relayId];
      assert.ok(target, `${systemId} relay ${relayId} must exist`);
      assert.ok(target.relays.includes(systemId), `${relayId} must route back to ${systemId}`);
    }
  }
}

{
  /* Fresh career under the linear ladder: the frontier starts at Aelos; the
     War Table stars are the END of the charting chain and stay dark until
     their route survey runs. The showcase fixture still charts everything. */
  const state = createInitialDomainState();
  for (const systemId of Object.keys(WAR_TABLE_HOMEWORLDS)) {
    assert.equal(state.world.systems[systemId].discovered, false, `${systemId} waits at the end of the route chain`);
  }
  assert.equal(state.world.systems.helios_core.infestation.confirmed, true, 'Vespera is the known Brood homeland');
  const validation = validateDomainState(state);
  assert.deepEqual(validation.issues, [], 'a fresh career with the War Table systems must validate');
  const showcaseState = createShowcaseReadyDomainState();
  const showcase = validateDomainState(showcaseState);
  assert.deepEqual(showcase.issues, [], 'the showcase fixture must validate with the new systems');
  for (const systemId of Object.keys(WAR_TABLE_HOMEWORLDS)) {
    assert.equal(showcaseState.world.systems[systemId].discovered, true, `${systemId} is charted in the showcase fixture`);
  }
}

{
  /* Saves written before the War Table systems arrived upgrade into them with
     defaults, and legacy locale ids keep their historical remap even though
     sombrero_i / andromeda_iv / orion_arc now name real systems. */
  const old = createInitialDomainState();
  delete old.world.systems.sombrero_i;
  delete old.world.systems.helios_core;
  const upgraded = normalizeDomainState(JSON.parse(JSON.stringify(old)));
  /* Under the linear ladder an upgraded save keeps the new stars dark — every
     existing career charts them through the NEW route surveys, which no save
     has spent yet, so the chain never dead-ends. */
  assert.equal(upgraded.world.systems.sombrero_i.discovered, false, 'upgraded saves keep the new system uncharted');
  assert.equal(upgraded.world.systems.helios_core.soloFront.pressure, 84, 'upgraded saves receive the authored pressure');

  const legacy = migrateDomainState({ schemaVersion: 2, currentSystemId: 'sombrero_i' });
  assert.equal(legacy.route.systemId, 'aelos', 'a legacy sombrero_i locale still means the Aelos anchorage');
  const legacyNordhall = migrateDomainState({ schemaVersion: 2, currentSystemId: 'nordhall' });
  assert.equal(legacyNordhall.route.systemId, 'karak', 'a legacy nordhall locale still means Karak');
  const fresh = normalizeDomainState({ schemaVersion: createInitialDomainState().schemaVersion, route: { scene: 'system', systemId: 'sombrero_i' } });
  assert.equal(fresh.route.systemId, 'sombrero_i', 'a current save may route to the real Sombrero-I system');
  const upgradedLadder = normalizeDomainState(JSON.parse(JSON.stringify({ ...createInitialDomainState(), schemaVersion: undefined })));
  assert.equal(typeof upgradedLadder.world.systems.helios_core.soloFront.pressure, 'number');
}

console.log('war-table-systems: ok');
