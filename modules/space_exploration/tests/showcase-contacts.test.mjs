/* Showcase contact contract.
   Every visible contact is authored art — no default primitive — so the chart
   may only reference contact ids that resolve to a GLB root (authored or
   aliased). Alias targets must themselves be authored roots, so a typo can
   never strand a system load. */
import assert from 'node:assert/strict';
import { SHOWCASE_SYSTEMS } from '../src/systems/showcase_systems.js';
import { SITE_CATALOG } from '../src/domain/catalog.js';
import {
  AUTHORED_CONTACT_ROOT_IDS,
  SHOWCASE_CONTACT_ALIASES,
  resolveShowcaseContactRootId
} from '../src/celestial/showcase_contact_ids.js';

{
  const rootIds = new Set(AUTHORED_CONTACT_ROOT_IDS);
  for (const aliasId of Object.keys(SHOWCASE_CONTACT_ALIASES)) {
    assert.equal(rootIds.has(aliasId), false, `${aliasId} must not be both root and alias`);
  }
  for (const [aliasId, target] of Object.entries(SHOWCASE_CONTACT_ALIASES)) {
    assert.ok(rootIds.has(target), `alias ${aliasId} must point at an authored root, got ${target}`);
  }
}

{
  const contactIds = new Set();
  for (const [systemId, system] of Object.entries(SHOWCASE_SYSTEMS)) {
    assert.ok(system.contacts.length >= 2, `${systemId} needs a station/gate plus at least one more contact`);
    let nonGate = 0;
    for (const contact of system.contacts) {
      assert.equal(contactIds.has(contact.id), false, `${contact.id} must be globally unique`);
      contactIds.add(contact.id);
      assert.ok(contact.kind, `${contact.id} must declare a kind`);
      assert.ok(contact.dist > 0 && contact.dist < 500, `${contact.id} must sit inside the chart ring`);
      if (contact.interaction === 'system-jump') continue;
      nonGate += 1;
      assert.ok(resolveShowcaseContactRootId(contact.id), `${contact.id} must resolve to authored art`);
      /* A discovery contact either names a cataloged site in its own system or
         is a pure salvage mystery (no siteId) — it must never point at another
         system's site. */
      if (contact.siteId) {
        const site = SITE_CATALOG[contact.siteId];
        if (site) assert.equal(site.systemId, systemId, `${contact.id} must reference a site in its own system`);
      }
    }
    assert.ok(nonGate >= 2, `${systemId} needs at least two non-gate contacts`);
  }
}

/* Asteroid belts must live in their own lane. The engine renders the belt as
   one instanced band at `asteroidBelt.radius ± width/2`; a lane that overlaps
   a planet orbit or a contact station renders rock THROUGH the object (the
   Veyra teal-orb bug: the legacy hard-coded band at 260±22 sliced Orison at
   orbitDist 255). Belt-less systems stay exempt. */
{
  for (const [systemId, system] of Object.entries(SHOWCASE_SYSTEMS)) {
    const planets = system.planets || [];
    if (!system.hasAsteroidBelt) continue;
    const belt = system.asteroidBelt || { radius: 260, width: 45 };
    assert.ok(belt.width > 0, `${systemId} belt width must be positive`);
    const beltInner = belt.radius - belt.width / 2;
    const beltOuter = belt.radius + belt.width / 2;
    for (const p of planets) {
      if (!p.orbitDist) continue;
      const inner = p.orbitDist - p.radius;
      const outer = p.orbitDist + p.radius;
      assert.ok(
        outer < beltInner || inner > beltOuter,
        `${systemId} belt [${beltInner}-${beltOuter}] collides with planet ${p.id} [${inner}-${outer}]`
      );
    }
    for (const c of system.contacts || []) {
      if (!c.dist) continue;
      const margin = 6;
      assert.ok(
        c.dist < beltInner - margin || c.dist > beltOuter + margin,
        `${systemId} belt [${beltInner}-${beltOuter}] collides with contact ${c.id} at ${c.dist}`
      );
    }
    // The black-hole singularity blocks the inner chart (r24 sphere + disk).
    if (system.isBlackHole) {
      assert.ok(beltInner > 118, `${systemId} belt must clear the singularity (r24 + disk edge ~105)`);
    }
  }
}

console.log('showcase-contacts: ok');
