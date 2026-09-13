/* The UGA tactical ladder must stay (a) identical on both sides of the
   module/classic boundary, and (b) inside the values the War Table Standard
   setup actually offers. Two mirrored tables and a set of authored option lists
   are exactly the kind of thing that drifts silently, and a drifted value here
   configures a real match. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { UGA_GROUND_TACTICAL_PROFILES, getUgaGroundTacticalProfile } from '../modules/space_exploration/src/domain/catalog.js';

const root = resolve(import.meta.dirname, '..');
const classic = await readFile(resolve(root, 'src/galactic-operations.js'), 'utf8');
const indexHtml = await readFile(resolve(root, 'index.html'), 'utf8');

/* Options the Standard setup screen authors, scraped from the markup so this
   test fails if the setup UI is retuned without revisiting the UGA ladder. */
const options = (row, attr) => {
  const block = indexHtml.slice(indexHtml.indexOf(`id="${row}"`));
  const end = block.indexOf('</div>');
  return new Set([...block.slice(0, end === -1 ? block.length : end)
    .matchAll(new RegExp(`data-${attr}="([^"]*)"`, 'g'))].map(match => Number(match[1])));
};
const TIMER = options('timeRow', 't');
const PACE = options('paceRow', 'p');
const CRATE = options('crRow', 'c');
const FOCUS = options('defFocusRow', 'df');

assert.ok(TIMER.size >= 3 && PACE.size >= 3, 'the Standard setup rows must still be readable from index.html');

/* The classic mirror, parsed out of the source it is applied from. */
const mirror = {};
for (const [, size, body] of classic.matchAll(/(compact|standard|large):\s*\{([^}]*)\}/g)) {
  const field = name => {
    const found = body.match(new RegExp(`${name}\\s*:\\s*(-?[0-9.]+)`));
    return found ? Number(found[1]) : undefined;
  };
  mirror[size] = { tier: field('tier'), timeLimit: field('timeLimit'), resPace: field('resPace'), crateRate: field('crateRate'), defenseFocus: field('defenseFocus'), wildcards: field('wildcards'), enemies: field('enemies') };
}

assert.deepEqual(Object.keys(mirror).sort(), ['compact', 'large', 'standard'],
  'src/galactic-operations.js must define a profile for every map size');

for (const size of ['compact', 'standard', 'large']) {
  const profile = UGA_GROUND_TACTICAL_PROFILES[size];
  assert.deepEqual(mirror[size], profile, `${size} profile has drifted between catalog.js and galactic-operations.js`);
  assert.ok(TIMER.has(profile.timeLimit), `${size} timeLimit ${profile.timeLimit} is not an authored Standard timer option`);
  assert.ok(PACE.has(profile.resPace), `${size} resPace ${profile.resPace} is not an authored Standard pace option`);
  assert.ok(CRATE.has(profile.crateRate), `${size} crateRate ${profile.crateRate} is not an authored Standard crate option`);
  assert.ok(FOCUS.has(profile.defenseFocus), `${size} defenseFocus ${profile.defenseFocus} is not an authored Standard focus option`);
}

/* The ladder must actually be a ladder. */
const tiers = ['compact', 'standard', 'large'].map(size => UGA_GROUND_TACTICAL_PROFILES[size].tier);
assert.deepEqual(tiers, [1, 2, 3], 'map sizes must form a monotonic difficulty ladder');
const timers = ['compact', 'standard', 'large'].map(size => UGA_GROUND_TACTICAL_PROFILES[size].timeLimit);
assert.ok(timers[0] < timers[1] && timers[1] < timers[2], 'a larger map must allow more time, not less');
const paces = ['compact', 'standard', 'large'].map(size => UGA_GROUND_TACTICAL_PROFILES[size].resPace);
assert.ok(paces[0] > paces[1] && paces[1] > paces[2], 'a larger map must run leaner, not richer');

/* Danger modifiers and enemy count are the other two rungs of the same ladder. */
const wildcards = ['compact', 'standard', 'large'].map(size => UGA_GROUND_TACTICAL_PROFILES[size].wildcards);
const enemies = ['compact', 'standard', 'large'].map(size => UGA_GROUND_TACTICAL_PROFILES[size].enemies);
assert.ok(wildcards.every(count => Number.isInteger(count) && count >= 0 && count <= 3),
  'wildcard counts must stay inside the 0-3 the Standard wcRowSel offers');
assert.ok(wildcards[0] <= wildcards[1] && wildcards[1] <= wildcards[2] && wildcards[2] > wildcards[0],
  'danger modifiers must rise with the ladder');
assert.ok(enemies.every(count => Number.isInteger(count) && count >= 1 && count <= 3),
  'enemy count must be at least one and fit the available non-player zones');
assert.ok(enemies[0] <= enemies[1] && enemies[1] <= enemies[2] && enemies[2] > enemies[0],
  'a larger region must field more opponents');

/* Enemies must never spawn on a zone a player can land in. */
const enemyZones = [...classic.matchAll(/UGA_ENEMY_ZONES=\[([^\]]*)\]/g)]
  .flatMap(match => [...match[1].matchAll(/'([a-z]+)'/g)].map(zone => zone[1]));
assert.ok(enemyZones.length >= Math.max(...enemies), 'UGA_ENEMY_ZONES must cover the largest enemy count');
for (const zone of ['sw', 'se']) {
  assert.ok(!enemyZones.includes(zone), `${zone} is a player landing zone and must not be an enemy spawn`);
}
assert.ok(/wcChoice=tac\.wildcards/.test(classic), 'wildcards must come from the region profile');
assert.ok(/aiSlots\[i\]\.on=i<tac\.enemies/.test(classic), 'enemy count must come from the region profile');
assert.ok(!/wcChoice=0;/.test(classic), 'the pinned zero-wildcard constant must be gone');

/* An unknown size must fall back rather than hand the match undefined rules. */
assert.deepEqual(getUgaGroundTacticalProfile('nonsense'), UGA_GROUND_TACTICAL_PROFILES.standard);
assert.deepEqual(getUgaGroundTacticalProfile(undefined), UGA_GROUND_TACTICAL_PROFILES.standard);

/* The applied globals and the reported setup record must be the same values —
   they were literals before, and a setup record that disagrees with the match it
   configured is worse than none. */
assert.ok(/tl:timeLimit/.test(classic), 'sandboxMeta.setup must report the applied timeLimit, not a literal');
assert.ok(/rp:resPace/.test(classic), 'sandboxMeta.setup must report the applied resPace, not a literal');
assert.ok(/cr:crateRate/.test(classic), 'sandboxMeta.setup must report the applied crateRate, not a literal');
assert.ok(/df:defenseFocus/.test(classic), 'sandboxMeta.setup must report the applied defenseFocus, not a literal');
assert.ok(!/tl:1200/.test(classic), 'the hardcoded 1200s timer must be gone');

console.log(JSON.stringify({ ok: true, profiles: UGA_GROUND_TACTICAL_PROFILES,
  standardTimerOptions: [...TIMER].sort((a, b) => a - b), standardPaceOptions: [...PACE].sort((a, b) => a - b) }, null, 1));
