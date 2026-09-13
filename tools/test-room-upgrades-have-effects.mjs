/* A ROOM YOU UPGRADE HAS TO CHANGE THE GAME.
 *
 * The design is that upgrading a section lets you personalise it, that the
 * modules you fit into it matter, and that what you build affects unlocks,
 * mods, exploration, bonuses, resources and commander experience.
 *
 * Most of that was already true: 50 facilities, two choices at each of tiers 2
 * and 3, and 34 effect keys every one of which some domain command reads. Two
 * things were not.
 *
 * Socket modules changed exactly one thing — the power bill. They had names,
 * costs, an install flow and a place in the room, and fitting one drew more
 * megawatts and nothing else.
 *
 * And commander experience was a flat number. Every other reward an operation
 * pays scales with the ship — research, materials, bio samples, fuel, probes —
 * but experience was identical on a bare hull and a fully fitted one, so no
 * room a player upgraded could make their commanders grow faster.
 *
 * This proves both, through the real domain rather than by reading source.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const domain = join(root, 'modules', 'space_exploration', 'src', 'domain');
const load = name => import(pathToFileURL(join(domain, name)).href);

const { MODULE_CATALOG, DISTRICT_CATALOG } = await load('catalog.js');
const { calculateFacilityCapabilities } = await load('construction.js');
const { CONSTRUCTION_FACILITY_CATALOG } = await load('construction_catalog.js');

/* 1. EVERY MODULE DOES SOMETHING. A module that only costs power is a
      purchase, not a decision. */
const inert = Object.values(MODULE_CATALOG).filter(module =>
  !Object.keys(module.effects || {}).length && !module.powerGenerationBonusMW);
assert.deepEqual(inert.map(m => m.id), [],
  `these modules have no gameplay effect at all — installing one only raises the power bill: ${inert.map(m => m.id).join(', ')}`);

/* 2. AND WHAT IT DOES IS SOMETHING THE GAME READS. A new effect key that no
      domain command consumes is a promise printed on the socket card and never
      kept, so module effects are held to the vocabulary the facilities already
      established — plus commanderXpPct, asserted for real below. */
const facilityKeys = new Set();
for (const facility of Object.values(CONSTRUCTION_FACILITY_CATALOG)) {
  for (const key of Object.keys(facility.effects || {})) facilityKeys.add(key);
}
const KNOWN_NEW_KEYS = new Set(['commanderXpPct']);
for (const module of Object.values(MODULE_CATALOG)) {
  for (const key of Object.keys(module.effects || {})) {
    assert.ok(facilityKeys.has(key) || KNOWN_NEW_KEYS.has(key),
      `module ${module.id} grants "${key}", which no facility grants and nothing is proven to read`);
  }
}

/* A state shaped like a real save, with one district and one socket filled. */
function shipWith({ districtId, moduleId, facilities = {} }) {
  const districts = {};
  for (const id of Object.keys(DISTRICT_CATALOG)) {
    districts[id] = { level: 1, tier: 1, commissioned: true, modules: {}, staff: [], facilities: {} };
  }
  if (districtId) {
    districts[districtId].level = 3;
    districts[districtId].tier = 3;
    districts[districtId].facilities = facilities;
    if (moduleId) {
      const socket = DISTRICT_CATALOG[districtId].sockets
        .find(entry => entry.compatibleModuleIds.includes(moduleId));
      assert.ok(socket, `${moduleId} fits no socket in ${districtId}`);
      districts[districtId].modules[socket.id] = moduleId;
    }
  }
  return { ship: { districts } };
}

/* 3. AN INSTALLED MODULE REACHES THE CAPABILITIES EVERY CONSUMER READS. This
      is the seam that makes a module real in thirty places at once. */
const bare = calculateFacilityCapabilities(shipWith({}));
for (const [moduleId, module] of Object.entries(MODULE_CATALOG)) {
  const effects = module.effects || {};
  if (!Object.keys(effects).length) continue;
  const districtId = Object.keys(DISTRICT_CATALOG)
    .find(id => DISTRICT_CATALOG[id].sockets?.some(s => s.compatibleModuleIds.includes(moduleId)));
  assert.ok(districtId, `${moduleId} is in the catalog but fits no socket on the ship`);
  const fitted = calculateFacilityCapabilities(shipWith({ districtId, moduleId }));
  for (const [key, value] of Object.entries(effects)) {
    const before = bare[key] || 0;
    const after = fitted[key] || 0;
    /* transitFuelPct and commanderXpPct are clamped; a clamp must not be able
       to swallow the whole contribution of a single module on a bare ship. */
    assert.notEqual(after, before,
      `installing ${moduleId} did not change "${key}" in the ship's capabilities (${before} -> ${after})`);
    if (value > 0) assert.ok(after > before, `${moduleId} should raise "${key}"`);
    if (value < 0) assert.ok(after < before, `${moduleId} should lower "${key}"`);
  }
}

/* 4. COMMANDER EXPERIENCE ACTUALLY SCALES — RUN, NOT READ.
      An earlier version of this asserted that buildPersonnelDelta merely
      MENTIONED commanderXpPct, and passed with the whole calculation disabled:
      `const xp = false ? …scaled… : baseXp` still contains the words. So lift
      the real function out of source and execute it. */
const groundResult = await readFile(join(domain, 'ground_result.js'), 'utf8');
const blanked = groundResult.replace(/\/\*[\s\S]*?\*\//g, block => ' '.repeat(block.length));
function lift(name) {
  const at = blanked.indexOf(`function ${name}(`);
  assert.ok(at > 0, `${name} is missing from ground_result.js`);
  const next = blanked.indexOf('\nfunction ', at + 10);
  return blanked.slice(at, next < 0 ? blanked.length : next);
}
const personnelDelta = new Function(`
  const INJURY_BAND_ORDER = ['none', 'light', 'moderate', 'severe'];
  ${lift('effectiveInjuryBand')}
  ${lift('injuryCycles')}
  ${lift('buildPersonnelDelta')}
  return buildPersonnelDelta;`)();

const operationWith = commanderXpPct => ({
  commanderId: 'cmdr', specialistIds: ['spec'], missionType: 'uga_contract',
  configuration: { facilityEffects: commanderXpPct == null ? {} : { commanderXpPct } }
});
const victory = { outcome: 'victory', secondaryObjectivesComplete: 2, injuryBand: 'none', injuredPersonnelIds: [] };

const bareAward = personnelDelta(operationWith(null), victory);
const fittedAward = personnelDelta(operationWith(40), victory);
assert.ok(bareAward.commander.experience > 0, 'a victory awards no commander experience at all');
assert.ok(fittedAward.commander.experience > bareAward.commander.experience,
  `a fitted ship awarded the same experience as a bare hull (${bareAward.commander.experience} -> `
  + `${fittedAward.commander.experience}) — no room a player upgrades can make their commanders grow faster`);
assert.equal(fittedAward.commander.experience,
  Math.floor(bareAward.commander.experience * 140 / 100),
  'the commander experience bonus is not applied as a straight percentage of the base award');

/* The multiplier has to reach the specialists that deployed too, or a fitted
   ship trains its officer and nobody else. */
assert.ok(fittedAward.specialists[0].experience > bareAward.specialists[0].experience,
  'specialists do not share the commander experience bonus');

/* A hostile or malformed value must never zero the award out. */
for (const pathological of [-100, -250, -1000]) {
  const award = personnelDelta(operationWith(pathological), victory);
  assert.ok(award.commander.experience >= 1,
    `a ${pathological}% bonus awarded ${award.commander.experience} experience; the award must stay positive`);
}
/* And a defeat still teaches something, scaled the same way. */
const defeat = { outcome: 'defeat', secondaryObjectivesComplete: 0, injuryBand: 'light', injuredPersonnelIds: [] };
assert.ok(personnelDelta(operationWith(40), defeat).commander.experience
  > personnelDelta(operationWith(null), defeat).commander.experience,
  'the experience bonus applies only to victories');

/* 5. THE STACK IS BOUNDED. Eleven rooms each contributing is a product, and an
      unbounded one turns a long campaign into a single-operation promotion. */
const construction = await readFile(join(domain, 'construction.js'), 'utf8');
assert.match(construction, /result\.commanderXpPct = Math\.min\(\d+, result\.commanderXpPct\)/,
  'the commander experience bonus is not capped');

/* Build the most fitted ship the catalog allows and prove the cap holds. */
const everything = { ship: { districts: {} } };
for (const [id, definition] of Object.entries(DISTRICT_CATALOG)) {
  const district = { level: 3, tier: 3, commissioned: true, modules: {}, staff: [], facilities: {} };
  for (const socket of definition.sockets || []) {
    const moduleId = socket.compatibleModuleIds?.[0];
    if (moduleId) district.modules[socket.id] = moduleId;
  }
  for (const tier of [2, 3]) {
    const choice = Object.values(CONSTRUCTION_FACILITY_CATALOG)
      .find(f => f.districtId === id && f.tier === tier);
    if (choice) district.facilities[`tier${tier}`] = choice.id;
  }
  everything.ship.districts[id] = district;
}
const maxed = calculateFacilityCapabilities(everything);
assert.ok((maxed.commanderXpPct || 0) > 0,
  'a fully fitted ship grants no commander experience bonus at all');
assert.ok(maxed.commanderXpPct <= 60,
  `a fully fitted ship grants ${maxed.commanderXpPct}% commander experience, past the declared cap`);
assert.ok(maxed.transitFuelPct >= -25, 'the transit fuel clamp no longer holds with modules stacking');

/* 6. THE SOCKET CARD SHOWS WHAT THE MODULE DOES. An effect the player cannot
      read before paying for it is not a choice. */
const ui = await readFile(join(root, 'modules', 'space_exploration', 'src', 'ui', 'uga_command.js'), 'utf8');
assert.match(ui, /function socketEffectMarkup\(/, 'sockets do not describe their module effects');
assert.match(ui, /socketEffectMarkup\(modules, installed,/, 'the socket row does not render module effects');
assert.match(ui, /commanderXpPct: '% commander experience'/,
  'the commander experience effect has no readable label, so it renders as a raw token');

console.log(`room upgrades have effects: PASS (${Object.keys(MODULE_CATALOG).length} modules all effectful, `
  + `every effect key consumed, commander XP scales and caps at ${maxed.commanderXpPct}% on a fully fitted ship)`);
