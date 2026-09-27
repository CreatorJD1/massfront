/* Wreck boarding contract.
   Each salvage wreck authors an interior X-S boarding area: one XS template
   from the stage-10 contract and a small-unit envelope. The interior battle
   runtime is reserved, so shipped stays false and no planet runtime region is
   claimed — authored, visible, explicitly undeployable. */
import assert from 'node:assert/strict';
import {
  WRECK_BOARDING_CATALOG,
  SALVAGE_CATALOG,
  getWreckBoarding,
  getPlanetSurfaceTheater,
  PLANET_RUNTIME_REGION,
  SYSTEM_CATALOG
} from '../src/domain/catalog.js';
import { SHOWCASE_SYSTEMS } from '../src/systems/showcase_systems.js';
import { readFileSync } from 'node:fs';

const theatre = readFileSync('assets/data/theatreprofiles-stage10.js', 'utf8');

{
  /* Every salvage wreck is boardable, and boarding implies salvage. */
  assert.deepEqual(
    new Set(Object.keys(WRECK_BOARDING_CATALOG)),
    new Set(Object.keys(SALVAGE_CATALOG)),
    'boarding and salvage must cover the same wreck set'
  );
  for (const boarding of Object.values(WRECK_BOARDING_CATALOG)) {
    assert.ok(SALVAGE_CATALOG[boarding.id], `${boarding.id} must carry a salvage manifest`);
    assert.ok(SYSTEM_CATALOG[boarding.systemId], `${boarding.id} names a real system`);
    const contact = SHOWCASE_SYSTEMS[boarding.systemId].contacts.find(contact => contact.id === boarding.contactId);
    assert.ok(contact && contact.kind === 'derelict', `${boarding.id} must board a derelict contact`);
    assert.equal(getWreckBoarding(boarding.contactId), boarding);
    /* Reserved until the interior battle runtime ships. */
    assert.equal(boarding.shipped, false, `${boarding.id} must not claim the interior runtime`);
  }
}

{
  /* Templates and envelopes must exist in the stage-10 contract, and the
     envelope must be one of the small-unit-restricted pair. */
  const templateIds = [...theatre.matchAll(/id:'(interior_[a-z0-9_]+)'/g)].map(match => match[1]);
  const envelopeIds = [...theatre.matchAll(/^    ([a-z_]+):\{$/gm)].map(match => match[1]);
  for (const boarding of Object.values(WRECK_BOARDING_CATALOG)) {
    assert.ok(templateIds.includes(boarding.templateId), `${boarding.id} references a real stage-10 template`);
    assert.ok(['infantry_only', 'small_unit_combined'].includes(boarding.envelope), `${boarding.id} must use a restricted envelope`);
    assert.ok(['XS', 'SMALL'].includes(boarding.sizeClass), `${boarding.id} must be a restricted-size interior`);
  }
}

{
  /* Boarding lives on the station-keeping hull: the host planets' theatres and
     runtime regions are untouched by the interior areas. */
  for (const boarding of Object.values(WRECK_BOARDING_CATALOG)) {
    const planetIds = Object.keys(PLANET_RUNTIME_REGION);
    for (const planetId of planetIds) {
      const theater = getPlanetSurfaceTheater(planetId);
      if (theater.id === 'interior_xs') assert.fail('no planet may claim interior_xs yet');
    }
  }
  assert.equal(getPlanetSurfaceTheater('sombrero_aelos').id, 'land');
}

console.log('wreck-boarding: ok');
