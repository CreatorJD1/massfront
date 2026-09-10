/* Phase 3: the deployment screen's choices must reach the match.
   Landing zone -> spawn zone and doctrine -> landing package are mirrored tables
   on the classic side, keyed by data that lives in the module catalog. That is
   exactly the shape that rots silently, so assert full coverage in both
   directions and that the values are ones the Standard setup actually offers. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MISSION_CATALOG } from '../modules/space_exploration/src/domain/catalog.js';

const root = resolve(import.meta.dirname, '..');
const classic = await readFile(resolve(root, 'src/galactic-operations.js'), 'utf8');
const main = await readFile(resolve(root, 'src/main.js'), 'utf8');
const indexHtml = await readFile(resolve(root, 'index.html'), 'utf8');

const table = name => {
  const start = classic.indexOf(`const ${name}={`);
  assert.ok(start > -1, `${name} must exist in src/galactic-operations.js`);
  const body = classic.slice(start, classic.indexOf('};', start));
  return Object.fromEntries([...body.matchAll(/([a-z_]+)\s*:\s*'([a-z]+)'/g)].map(m => [m[1], m[2]]));
};

const spawns = table('UGA_LANDING_ZONE_SPAWNS');
const packages = table('UGA_DOCTRINE_PACKAGES');

/* Every landing zone the catalog authors must have a spawn, and the table must
   not carry zones that no longer exist. */
const catalogZones = new Set();
const catalogDoctrines = new Set();
for (const mission of Object.values(MISSION_CATALOG)) {
  for (const id of mission.landingZoneIds || []) catalogZones.add(id);
  for (const id of mission.doctrineIds || []) catalogDoctrines.add(id);
}
assert.ok(catalogZones.size >= 18, 'the catalog should still author two landing zones per mission');
assert.deepEqual([...catalogZones].filter(id => !spawns[id]), [], 'landing zones with no spawn mapping');
assert.deepEqual(Object.keys(spawns).filter(id => !catalogZones.has(id)), [], 'spawn mappings for landing zones the catalog no longer has');
assert.deepEqual([...catalogDoctrines].filter(id => !packages[id]), [], 'doctrines with no landing package');
assert.deepEqual(Object.keys(packages).filter(id => !catalogDoctrines.has(id)), [], 'packages for doctrines the catalog no longer has');

/* Spawn zones must be real RTS zones, and packages must be real Standard ones. */
const ZONES = new Set(['sw', 'se', 'nw', 'ne', 'c']);
for (const [id, zone] of Object.entries(spawns)) assert.ok(ZONES.has(zone), `${id} maps to unknown spawn zone ${zone}`);
const packageIds = new Set([...indexHtml.matchAll(/data-pkg="([a-z]+)"/g)].map(m => m[1]));
assert.ok(packageIds.size >= 2, 'the Standard deployPkgRow options must still be readable');
for (const [id, pkg] of Object.entries(packages)) {
  assert.ok(packageIds.has(pkg), `doctrine ${id} maps to ${pkg}, which the Standard setup does not offer`);
  assert.ok(new RegExp(`\\b${pkg}\\s*:`).test(main), `${pkg} is not a real DEPLOYMENT_PACKAGES entry`);
}

/* Each mission's two zones must differ, or the choice is decoration. */
for (const [missionId, mission] of Object.entries(MISSION_CATALOG)) {
  const zones = (mission.landingZoneIds || []).map(id => spawns[id]);
  if (zones.length < 2) continue;
  assert.equal(new Set(zones).size, zones.length, `${missionId} landing zones all spawn in the same place, so the choice does nothing`);
}

/* Both doctrine outcomes must be reachable, or the mapping is a constant. */
assert.ok(new Set(Object.values(packages)).size > 1, 'every doctrine maps to the same package; that is the constant this replaced');

/* The constants must be gone from the applied path and the reported record. */
assert.ok(!/deploymentPackage='expedition';playerStartZone='sw'/.test(classic), 'the hardcoded package and spawn must be gone');
assert.ok(/deploymentPackage=ugaDoctrinePackage\(operation\.doctrineId\)/.test(classic), 'the package must come from the operation doctrine');
assert.ok(/playerStartZone=ugaLandingSpawn\(operation\.landingZoneId\)/.test(classic), 'the spawn must come from the chosen landing zone');
assert.ok(/pkg:deploymentPackage/.test(classic) && /ps:playerStartZone/.test(classic), 'the setup record must report what was applied');

console.log(JSON.stringify({ ok: true, landingZones: Object.keys(spawns).length, doctrines: packages }, null, 1));
