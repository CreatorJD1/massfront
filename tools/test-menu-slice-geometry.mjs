/* The menu plates, the deploy CTA and the dock come from the authored
   production pack, and every slice number in ui.css is a restatement of a
   number in that pack's ASSET_MANIFEST.json. A drift between them does not
   throw - it silently smears a chamfer, clips the corner ticks, or stretches
   the hazard ends - so it has to be a test.

   This checks three things: the shipped PNGs are byte-identical to what the
   pack shipped, the CSS border-image-slice values equal the manifest borders
   converted to png_2x pixels, and the cap widths CSS derives from the control
   height equal border/height from the manifest. Re-exporting the pack with
   different geometry fails here until the CSS is updated to match, which is
   the point.
   Run: node tools/test-menu-slice-geometry.mjs */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const artDir = resolve(root, 'assets/textures/ui/mf-ui-v3');
const manifest = JSON.parse(await readFile(resolve(artDir, 'ASSET_MANIFEST.json'), 'utf8'));
const css = await readFile(resolve(root, 'src/styles/ui.css'), 'utf8');
const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));

/* A selector can carry several rules in this sheet, so pick the block that
   actually declares the thing being checked rather than the first match. */
const rule = (selector, mustDeclare) => {
  let at = css.indexOf(selector + ("{"));
  while (at >= 0) {
    const block = css.slice(at, css.indexOf(("}"), at) + 1);
    if (!mustDeclare || block.includes(mustDeclare)) return block;
    at = css.indexOf(selector + ("{"), at + 1);
  }
  assert.fail(selector + " must declare " + (mustDeclare || "anything") + " in ui.css");
};
/* png_2x pixels per logical unit, read rather than assumed. */
const scaleOf = asset => {
  const scale = asset.pixel_sizes.png_2x[0] / asset.logical_size[0];
  assert.equal(scale, asset.pixel_sizes.png_2x[1] / asset.logical_size[1],
    `${asset.id} is not uniformly scaled between logical and png_2x`);
  return scale;
};
const declaredNumbers = (block, property) => {
  const at = block.indexOf(property + ':');
  assert.ok(at >= 0, `${property} must be declared`);
  return block.slice(at + property.length + 1, block.indexOf(';', at))
    .split(/\s+/).filter(part => /^[0-9.]+$/.test(part)).map(Number);
};
const ratioVar = (block, name) => {
  const marker = `--${name}:calc(var(--${block.includes('--sliceH') ? 'sliceH' : 'ctaH'}) * `;
  const at = block.indexOf(marker);
  assert.ok(at >= 0, `--${name} must be derived from the control height, not pinned to a pixel value`);
  return Number(block.slice(at + marker.length, block.indexOf(')', at + marker.length)));
};

/* Every asset the menu references must be the pack's own file, unmodified. */
const referenced = [...css.matchAll(/mf-ui-v3\/([a-z0-9_]+)\.png/g)].map(match => match[1]);
assert.ok(referenced.length >= 12, `the menu should be drawing from the pack (${referenced.length} references)`);
for (const id of new Set(referenced)) {
  const asset = byId.get(id);
  assert.ok(asset, `ui.css references ${id}.png, which is not in the pack manifest`);
  const path = resolve(artDir, `${id}.png`);
  assert.ok(existsSync(path), `${id}.png is referenced but not shipped`);
  const bytes = await readFile(path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256.png_2x,
    `${id}.png does not match the pack checksum - it has been re-encoded or edited in place`);
}

/* Menu button: horizontal three-slice, caps against the control height. */
const menu = byId.get('menu_normal');
const menuScale = scaleOf(menu);
const [mLeft, , mRight] = menu.resizing.borders_logical;
const menuHeight = menu.pixel_sizes.png_2x[1];
const slice = rule('#startScreen .menuSlices .slice', 'border-image-slice');
assert.equal(menu.resizing.mode, 'horizontal_three_slice', 'the menu plate is no longer a horizontal three-slice');
assert.deepEqual(declaredNumbers(slice, 'border-image-slice'), [0, mRight * menuScale, 0, mLeft * menuScale],
  'menu border-image-slice drifted from the manifest borders');
assert.ok(/border-image-slice:[^;]*fill/.test(slice), 'the menu slice must fill, or the plate has no middle');
assert.ok(/border-image-repeat:stretch/.test(slice),
  'the middle must stretch; repeat rescales the tile and rings at every boundary');
assert.equal(ratioVar(slice, 'capL'), mLeft * menuScale / menuHeight,
  'the left cap width drifted from the art proportions');
assert.equal(ratioVar(slice, 'capR'), mRight * menuScale / menuHeight,
  'the right cap width drifted from the art proportions');
assert.ok(/border-width:0 var\(--capR\) 0 var\(--capL\)/.test(slice),
  'the menu border widths must come from the cap variables, or border-image scales the caps');
/* .gbtn carries min-height:54px. height alone loses to it, the box renders two
   pixels taller than the caps were sized for, and border-image stretches them. */
for (const property of ['height', 'min-height', 'max-height'])
  assert.ok(slice.includes(property + ':var(--sliceH)'),
    `${property} must be pinned to --sliceH, or an inherited min-height stretches the caps`);

/* Every authored state has to be reachable, or a press or an expand shows the
   resting plate and the pack's state work is wasted. */
for (const [state, id] of Object.entries(manifest.state_groups.menu))
  assert.ok(css.includes(`mf-ui-v3/${id}.png`), `the menu ${state} plate is never referenced`);
for (const [state, id] of Object.entries(manifest.state_groups.nav))
  assert.ok(css.includes(`mf-ui-v3/${id}.png`), `the dock ${state} plate is never referenced`);

/* Deploy CTA: same model, wider hazard caps, and the label is allowed to sit
   over them - the manifest content rect starts inside the left cap - so the
   caps are painted with border-image-width while border-width stays 0. */
const deploy = byId.get('deploy_normal');
const deployScale = scaleOf(deploy);
const [dLeft, , dRight] = deploy.resizing.borders_logical;
const cta = rule('#startScreen #startBtn', 'border-image-slice');
assert.deepEqual(declaredNumbers(cta, 'border-image-slice'), [0, dRight * deployScale, 0, dLeft * deployScale],
  'deploy border-image-slice drifted from the manifest borders');
assert.equal(ratioVar(cta, 'ctaCap'), dLeft * deployScale / deploy.pixel_sizes.png_2x[1],
  'the hazard cap width drifted from the art proportions');
assert.equal(dLeft, dRight, 'the deploy plate is symmetric; one cap variable is only valid while that holds');
assert.ok(/border-image-width:0 var\(--ctaCap\)/.test(cta),
  'the caps must be painted by border-image-width, or the label loses the room the content rect gives it');
assert.ok(/border-width:0;/.test(cta), 'border-width must stay 0 so the caps do not inset the label box');
assert.ok(/white-space:nowrap/.test(cta), 'DEPLOY MASSFRONT wrapped to two lines and overflowed the plate');
assert.ok(!/repeating-linear-gradient/.test(cta), 'the hand-drawn hazard gradient must be gone; the art carries it');

/* Dock: a real nine-slice, so the border is one number on every edge. */
const nav = byId.get('nav_normal');
const navScale = scaleOf(nav);
const navBorders = nav.resizing.borders_logical.map(value => value * navScale);
assert.equal(new Set(navBorders).size, 1, 'the nav plate borders are no longer uniform');
const dock = rule('#startScreen .menuStrip .sbtn', 'border-image-slice');
assert.deepEqual(declaredNumbers(dock, 'border-image-slice'), [navBorders[0]],
  'dock border-image-slice drifted from the manifest border');
assert.ok(/border-image-slice:[^;]*fill/.test(dock), 'the dock slice must fill, or the plate has no centre');

/* Landscape retunes the height and inherits every other number. */
const landscape = css.slice(css.indexOf('@media (orientation:landscape) and (max-height:560px)'));
assert.ok(/#startScreen \.menuSlices \.slice\{--sliceH:[0-9]+px\}/.test(landscape),
  'the short landscape row must set --sliceH and inherit the rest');
assert.ok(/--ctaH:[0-9]+px/.test(landscape), 'the short landscape CTA must retune --ctaH, not its padding');

console.log(JSON.stringify({
  ok: true, pack: manifest.pack, version: manifest.version, assetsReferenced: new Set(referenced).size,
  menu: { slice: [0, mRight * menuScale, 0, mLeft * menuScale], capsAt52: { left: +(mLeft * menuScale / menuHeight * 52).toFixed(1), right: +(mRight * menuScale / menuHeight * 52).toFixed(1) } },
  deploy: { slice: [0, dRight * deployScale, 0, dLeft * deployScale], capAt60: +(dLeft * deployScale / deploy.pixel_sizes.png_2x[1] * 60).toFixed(1) },
  nav: { slice: navBorders[0] }
}, null, 1));
