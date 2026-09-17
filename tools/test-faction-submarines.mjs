import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../src/game/sim.js', import.meta.url), 'utf8');
const names = [...src.matchAll(/\{name:'([^']+)'/g)].map(m => m[1]);
/* First TYPES table only — later files mention names in comments. */
const typesStart = src.indexOf('const TYPES=[');
const typesEnd = src.indexOf('];\n/* UNIT CATEGORIES');
const block = src.slice(typesStart, typesEnd);
const roster = [...block.matchAll(/\{name:'([^']+)'/g)].map(m => m[1]);
assert.equal(roster[33], 'Submarine', 'slot 33 must be the submarine chassis');
assert.equal(roster[32], 'Prospector');
assert.equal(roster[14], 'Corvette');
assert.match(block, /name:'Submarine'[\s\S]*sub:1/);
assert.match(block, /name:'Corvette'[\s\S]*asw:1/);
assert.match(src, /UT_SUB=33/);
assert.match(src, /\[0,4\],\s*\/\/ 33 Submarine/);
assert.match(src, /Submarine:'nav'/);
assert.match(src, /!T\.sub\|\|typeof mfSubCanFire/);

const boot = await readFile(new URL('../boot.js', import.meta.url), 'utf8');
assert.match(boot, /src\/submarines\.js/);
const man = JSON.parse(await readFile(new URL('../assets/data/manifest.json', import.meta.url), 'utf8'));
assert.equal(man.order[man.order.indexOf('src/intel.js') + 1], 'src/submarines.js');

const hud = await readFile(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
assert.match(hud, /harbor'\) list=\[14,15,33\]/);
const doc = await readFile(new URL('../src/factiondoctrine.js', import.meta.url), 'utf8');
assert.equal([...doc.matchAll(/harbor:new Set\(\[14,15,33\]\)/g)].length, 4);

const sub = await readFile(new URL('../src/submarines.js', import.meta.url), 'utf8');
assert.match(sub, /surfaceFire:1/);
assert.match(sub, /function mfSubCanFire/);
assert.match(sub, /umode\[i\]=4/);

console.log(`faction submarines: PASS (${roster.length} chassis, ${roster[33]} at 33)`);
