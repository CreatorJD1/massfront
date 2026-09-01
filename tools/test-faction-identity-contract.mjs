import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleUrl = pathToFileURL(path.join(root, 'modules/space_exploration/src/domain/catalog.js'));
const { FACTION_CATALOG } = await import(moduleUrl.href);
const factionIdSource = await readFile(path.join(root, 'src/faction-id.js'), 'utf8');
const factionArtSource = await readFile(path.join(root, 'src/factions.js'), 'utf8');

const expected = Object.freeze({
  nova: { name: 'Terran Frontline Command', shortName: 'NOVA', color: '#5db6ff' },
  dominion: { name: 'Crimson Dominion', shortName: 'DOMINION', color: '#ff6b58' },
  syndicate: { name: 'Syndicate Coalition', shortName: 'SYNDICATE', color: '#8ce85a' },
  brood: { name: 'Brood Swarm', shortName: 'BROOD', color: '#b978ff' }
});

for (const [id, identity] of Object.entries(expected)) {
  assert.equal(FACTION_CATALOG[id]?.name, identity.name, `${id} space name drifted`);
  assert.equal(FACTION_CATALOG[id]?.shortName, identity.shortName, `${id} space short name drifted`);
  assert.equal(FACTION_CATALOG[id]?.color, identity.color, `${id} space color drifted`);
  assert.match(factionIdSource, new RegExp(`name:'${identity.name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}'`), `${id} canonical name missing`);
  assert.match(factionArtSource, new RegExp(`nm:'${identity.name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}'[\\s\\S]{0,350}col:'${identity.color}'`), `${id} FACART identity drifted`);
}

console.log(JSON.stringify({ status: 'PASS', contract: 'canonical-faction-identity', factions: Object.keys(expected) }, null, 2));
