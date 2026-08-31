#!/usr/bin/env node
/* STAGED PATCH for src/engine/mesh.js — the burn crust is a tan wash, not charcoal.
   Apply when mesh.js is released:  node patch-mesh-charcoal.mjs <repoRoot> [--check]

   WHY. The thermal burn branch already mixes toward ash=vec3(.034,.034,.036),
   which is near-black - but it then does
       base = mix(base, scar, charA*heat*0.34)
   where scar starts at emberAlb=vec3(.52,.14,.03), a dark RED, and heat is ~1
   while the burn is fresh. So the ash it just laid down is immediately pulled
   back toward ember-red across the WHOLE disc, and emberSum adds a broad glow
   on top. Net result at the moment you actually look at it: an orange-tan wash
   with no charcoal anywhere.

   The owner's reference is charred crust with incandescent cracks: the black
   should dominate the AREA and the heat should live in a NARROW crack network.
   Three changes:
     1. deepen and hold the ash (charA no longer decays as fast with cool),
     2. confine the ember-red scar to where the coal-bed mask is actually hot,
        instead of applying it to the whole disc,
     3. sharpen emberSum so glow reads as cracks between cooled clinker.
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
const checkOnly = process.argv.includes('--check');
if (!root) { console.error('usage: patch-mesh-charcoal.mjs <repoRoot> [--check]'); process.exit(2); }
const P = join(root, 'src/engine/mesh.js');
let src = readFileSync(P, 'utf8');

/* A GLSL comment containing a backtick terminates FS3D's template literal and
   black-screens the game with no syntax error. This bit an agent today. */
const assertNoTemplateBreakers = t => { if (t.includes('`') || t.includes('${')) throw new Error('patch text contains a template breaker'); };

const edits = [
  { label: 'char alpha holds',
    from: '      float charA=m*(1.0-cool*cool*0.62);',
    to:   '      /* Hold the char. 0.62 let the crust fade back toward bare ground\n'
        + '         while the burn was still visibly hot, so the disc read tan. */\n'
        + '      float charA=m*(1.0-cool*cool*0.28);' },

  { label: 'scar confined to hot coal',
    from: '      base=mix(base,scar,charA*heat*0.34);',
    to:   '      /* CONFINE the ember-red to where coal is actually hot. This used to\n'
        + '         apply across the whole disc, dragging the ash it had just laid\n'
        + '         down back toward red - which is why there was no charcoal under\n'
        + '         the embers. bed is the coal-bed mask, so red now lives only in\n'
        + '         the crack network and the rest stays black. */\n'
        + '      float bedHot=mfCoalBed(wxz,B)*m*heat;\n'
        + '      base=mix(base,scar,charA*heat*bedHot*0.62);' },

  { label: 'ember glow sharpened to cracks',
    from: '      float bed=mfCoalBed(wxz,B)*m*heat;',
    to:   '      /* Sharpen: pow pushes the mask toward its peaks, so the glow reads\n'
        + '         as incandescent CRACKS between cooled clinker rather than a soft\n'
        + '         wash over the whole burn. */\n'
        + '      float bed=pow(clamp(mfCoalBed(wxz,B),0.0,1.0),1.9)*m*heat;' },

  { label: 'ember contribution weighted to the bed',
    from: '                *((0.24+bed*0.58)*flick);',
    to:   '                *((0.05+bed*0.92)*flick);' },
];

let out = src, applied = [];
for (const e of edits) {
  assertNoTemplateBreakers(e.to);
  const n = out.split(e.from).length - 1;
  if (n !== 1) { console.error('ANCHOR "' + e.label + '": expected 1 occurrence, found ' + n); process.exit(1); }
  out = out.replace(e.from, e.to);
  applied.push(e.label);
}

/* post-conditions */
const must = ['float charA=m*(1.0-cool*cool*0.28);', 'bedHot', 'pow(clamp(mfCoalBed'];
for (const m of must) if (!out.includes(m)) { console.error('POST-CHECK failed, missing: ' + m); process.exit(1); }
const bt = (out.match(/`/g) || []).length;
if (bt % 2 !== 0) { console.error('POST-CHECK failed: unbalanced backticks (' + bt + ') — template literal broken'); process.exit(1); }

if (checkOnly) { console.log('CHECK OK — ' + applied.length + ' anchors match, backticks balanced (' + bt + ')'); process.exit(0); }
writeFileSync(P, out);
console.log('patched mesh.js: ' + applied.join(' | '));
console.log('backticks balanced (' + bt + '). Run: node --check ' + P);
