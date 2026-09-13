/* ONE FACTION, ONE IDENTITY, ACROSS BOTH HALVES OF THE GAME.
 *
 * The base game and the exploration module each keep their own faction table.
 * src/faction-id.js is the canonical seam between them: it maps any name or
 * alias to a stable id, a runtime key and an art kit, and a dozen wrappers at
 * the bottom of that file push every saved faction value through it.
 *
 * So a name in the exploration catalog is not a label — it is machine-read.
 * This gate exists because "Nova Coalition" drifted into the catalog, and the
 * resolver matched the shared word "coalition" to the SYNDICATE before it ever
 * looked for "nova": the player's own faction resolved to a different faction,
 * with a different runtime key and a different art kit, silently.
 *
 * The old version of this gate asserted a frozen snapshot of names, uppercase
 * short names and colours. It caught the name drift and then also failed on
 * two things that are not identity at all: the catalog spells every shortName
 * in title case (its decks and districts do too) and carries its own brighter
 * palette for its own dark UI. Pinning those made the gate unrunnable, so it
 * was reporting the real bug and four false ones in the same breath, and had
 * been left failing.
 *
 * What is checked now is the property, not the snapshot: every name in either
 * table must canonicalise to its own faction. That is what broke, it is what
 * matters, and it keeps working when someone renames a faction on purpose.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleUrl = pathToFileURL(path.join(root, 'modules/space_exploration/src/domain/catalog.js'));
const { FACTION_CATALOG } = await import(moduleUrl.href);
const factionIdSource = await readFile(path.join(root, 'src/faction-id.js'), 'utf8');
const factionArtSource = await readFile(path.join(root, 'src/factions.js'), 'utf8');

/* The real resolver, lifted from source rather than reimplemented — a copy
   would drift exactly the way the thing it guards did. */
const from = factionIdSource.indexOf('var DEF={');
const to = factionIdSource.indexOf('function runtime(');
assert.ok(from >= 0 && to > from, 'could not locate the identity resolver in src/faction-id.js');
const box = vm.createContext({});
vm.runInContext(factionIdSource.slice(from, to) + '\n;this.canonical=canonical;this.DEF=DEF;', box);
const { canonical, DEF } = box;

const IDS = ['nova', 'dominion', 'syndicate', 'brood'];

/* 1. THE CANONICAL TABLE IS COMPLETE AND SELF-CONSISTENT. */
for (const id of IDS) {
  assert.ok(DEF[id], `src/faction-id.js has no entry for ${id}`);
  assert.equal(canonical(DEF[id].name), id,
    `src/faction-id.js names ${id} "${DEF[id].name}", which its own resolver reads as ${canonical(DEF[id].name)}`);
  for (const alias of DEF[id].aliases) {
    assert.equal(canonical(alias), id, `alias "${alias}" of ${id} resolves to ${canonical(alias)}`);
  }
}

/* 2. NO NAME IS AMBIGUOUS BETWEEN FACTIONS. Two factions answering to one
      string is how a shared word ends up outranking a faction's own name. */
const claimed = new Map();
for (const id of IDS) {
  for (const key of [DEF[id].name, ...DEF[id].aliases]) {
    const norm = String(key).trim().toLowerCase();
    assert.ok(!claimed.has(norm) || claimed.get(norm) === id,
      `"${key}" is claimed by both ${claimed.get(norm)} and ${id}`);
    claimed.set(norm, id);
  }
}

/* 3. THE EXPLORATION CATALOG AGREES. Its name and its short name must both
      resolve to the faction they are filed under — the catalog is free to
      choose its own casing and palette, but not its own identity. */
for (const id of IDS) {
  const entry = FACTION_CATALOG[id];
  assert.ok(entry, `the exploration catalog has no ${id} faction`);
  assert.equal(entry.id, id, `catalog ${id} is filed under a mismatched id (${entry.id})`);
  assert.equal(canonical(entry.name), id,
    `the exploration catalog names ${id} "${entry.name}", which the identity seam resolves to `
    + `${canonical(entry.name)} — that is a different runtime key and a different art kit`);
  assert.equal(canonical(entry.shortName), id,
    `the exploration catalog's short name for ${id} ("${entry.shortName}") resolves to ${canonical(entry.shortName)}`);
  assert.equal(entry.name, DEF[id].name,
    `the exploration catalog calls ${id} "${entry.name}" while src/faction-id.js calls it "${DEF[id].name}" — `
    + 'they resolve alike today, but two spellings of one identity is how the last drift started');
  assert.match(String(entry.color), /^#[0-9a-f]{6}$/i, `catalog ${id} colour is not a hex value`);
}

/* 4. AND THE BASE GAME'S OWN ART TABLE AGREES with the canonical names. */
for (const id of IDS) {
  const escaped = DEF[id].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(factionArtSource, new RegExp(`nm:'${escaped}'`),
    `src/factions.js does not field ${id} under its canonical name "${DEF[id].name}"`);
}

/* 5. Distinct colours per faction in each table, so allegiance stays readable. */
for (const [label, colours] of [['exploration catalog', IDS.map(id => FACTION_CATALOG[id].color.toLowerCase())]]) {
  assert.equal(new Set(colours).size, colours.length, `two factions share a colour in the ${label}`);
}

console.log(JSON.stringify({ status: 'PASS', contract: 'canonical-faction-identity', factions: IDS }, null, 2));
