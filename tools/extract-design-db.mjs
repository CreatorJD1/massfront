/* ============================================================================
   DESIGN DATABASE EXTRACTOR
   ----------------------------------------------------------------------------
   The game's design data — every unit, structure, weapon, research node,
   craftable module, store perk, faction, map and hazard — lives as plain object
   literals scattered across the source. That is the right place for the game to
   read it from and the wrong place for a human to balance it from: you cannot
   sort a JavaScript literal by damage-per-cost, and you cannot see that two
   units overlap without holding both files in your head.

   This pulls all of it into one place, and it does so by RUNNING THE REAL
   SOURCE rather than parsing it. A regex-based scrape would drift the first
   time someone wrote a value as an expression instead of a number; evaluating
   the actual files means the numbers here are, by construction, the numbers the
   game uses.

   The trick is that these files expect a browser. They are executed inside a VM
   context whose globals are permissive Proxies, so `document.getElementById(x)`
   and `canvas.getContext('2d')` return more Proxies instead of throwing. Nothing
   in this project touches the DOM at module top level — only inside functions —
   so the constant tables evaluate cleanly and the function bodies simply never
   run.

       node tools/extract-design-db.mjs        ->  design/design.json
   ============================================================================ */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* A Proxy that tolerates absolutely any access, call or construction. This is
   what stands in for `document`, `window`, `localStorage` and friends. */
const anything = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0
              : k === 'then' ? undefined            // never look like a promise
              : anything()),
  set: () => true,
  has: () => true,
  apply: () => anything(),
  construct: () => anything(),
});

const sandbox = {
  console: { log(){}, warn(){}, error(){} },
  Math, JSON, Date, Object, Array, String, Number, Boolean, RegExp, Error,
  Map, Set, Promise, Symbol, isNaN, parseInt, parseFloat, encodeURIComponent,
  decodeURIComponent, escape, unescape, atob: () => '', btoa: () => '',
  Uint8Array, Uint16Array, Int16Array, Int32Array, Uint32Array,
  Float32Array, Float64Array, ArrayBuffer, DataView, TextEncoder, TextDecoder,
  setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
  requestAnimationFrame: () => 0, cancelAnimationFrame(){},
  performance: { now: () => 0 },
  document: anything(), window: anything(), navigator: anything(),
  localStorage: anything(), indexedDB: anything(), location: anything(),
  fetch: () => new Promise(() => {}), Image: function(){ return anything(); },
  AudioContext: function(){ return anything(); }, speechSynthesis: anything(),
  CompressionStream: function(){ return anything(); },
  DecompressionStream: function(){ return anything(); },
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

/* Load in the game's own order, skipping only what cannot help and might hurt:
   the 800 KB of inlined base64 item art, and anything that is pure rendering. */
const order = JSON.parse(readFileSync(join(ROOT, 'assets/data/manifest.json'), 'utf8')).order;
const loaded = [], failed = [];
for (const rel of order) {
  if (rel.includes('itemart')) continue;
  let src;
  try { src = readFileSync(join(ROOT, rel), 'utf8'); } catch { continue; }
  try {
    vm.runInContext(src, sandbox, { filename: rel, timeout: 20000 });
    loaded.push(rel);
  } catch (e) {
    /* Expected for files that do real work at load time. The tables we want are
       defined before any of that, so a partial evaluation still yields them. */
    failed.push(rel + ': ' + String(e.message).slice(0, 90));
  }
}

/* Read a game table out of the context.

   `sandbox[k]` returns undefined for all of these, and the reason is worth
   recording: the game declares its tables with `const`, and a top-level `const`
   in a classic script goes into the global LEXICAL scope, never onto the global
   object. That is true in browsers too — `window.TYPES` is undefined there as
   well — it simply does not matter in a browser because nothing looks. Here it
   silently produced an empty database. Evaluating an expression inside the same
   context can see those bindings, so that is how they come out. */
const g = k => {
  try {
    return vm.runInContext(
      `(typeof ${k} !== 'undefined' ? ${k} : undefined)`, sandbox, { timeout: 5000 });
  } catch { return undefined; }
};
const plain = v => JSON.parse(JSON.stringify(v ?? null));

/* Weapon class letters used throughout the unit table. */
const WK = {
  p:'Projectile', b:'Beam/Energy', m:'Missile', e:'Explosive', g:'Gauss',
  f:'Flame', s:'Sonic (ignores shields)', n:'None', h:'Horde/Splash',
};

const out = {
  generatedFrom: 'MASSFRONT source, evaluated — not scraped',
  appVersion: (readFileSync(join(ROOT, 'src/updater.js'), 'utf8')
                .match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1] || 'unknown',
  loaded, failed,
  tables: {},
};

const add = (name, value, note) => {
  if (value === undefined || value === null) return;
  out.tables[name] = { note: note || '', data: plain(value) };
};

add('units', g('TYPES'), 'Every unit. wk = weapon class, see weaponClasses.');
add('buildings', g('BT'), 'Every structure: cost (cm mass / ce energy), size, hp.');
add('buildingUpgrades', g('BUP'), 'Per-structure upgrade tiers.');
add('factions', g('FACTIONS'), 'AI factions: economy multipliers, chassis kit, hero, build bias.');
add('factionLore', g('FACART'), 'Faction identity: commander, motto, doctrine, roster.');
add('maps', g('MAPDEFS'), 'The map catalogue and its terrain-generation parameters.');
add('mapHazards', g('MAPHAZ'), 'Map-exclusive environmental hazards.');
add('storePerks', g('STORE'), 'Permanent Armory upgrades bought with cores.');
add('researchTree', g('DEVTREE'), 'Research nodes: branch, cost, prerequisites.');
add('modules', g('MODULES'), 'Craftable modules and their durability.');
add('materials', g('MATS'), 'Crafting materials.');
add('ranks', g('RANKS'), 'Account rank ladder and XP thresholds.');
add('boosters', g('BOOSTS'), 'Daily-order booster types.');
add('opModifiers', g('OPMODS'), 'Operation modifiers and their payout multipliers.');
add('commanderColors', g('COLORS'), 'Player colour options.');
add('wildcards', g('WILDCARDS') ?? g('WC_DEFS'), 'Danger modifiers.');
add('story', g('STORY'), 'Story dispatches keyed to rank.');
out.tables.weaponClasses = { note: 'Legend for the unit table wk field.', data: WK };

mkdirSync(join(ROOT, 'design'), { recursive: true });
writeFileSync(join(ROOT, 'design/design.json'), JSON.stringify(out, null, 2));

const counts = Object.entries(out.tables)
  .map(([k, v]) => `${k}=${Array.isArray(v.data) ? v.data.length : Object.keys(v.data || {}).length}`);
console.log('evaluated ' + loaded.length + '/' + (order.length - 1) + ' sources');
if (failed.length) console.log('partial: ' + failed.length + ' (constants still extracted)');
console.log(counts.join('  '));
