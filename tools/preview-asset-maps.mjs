#!/usr/bin/env node
/* ============================================================================
   ASSET-MAP CONTACT SHEET  —  the picture tools/bake-asset-maps.mjs's numbers
   cannot substitute for.
       node tools/preview-asset-maps.mjs <slug> [--src <dir>] [--out <png>]
       e.g. nova-rhino-v2    or    nova-rhino-v2-turret

   The one channel that matters most is invisible in an ordinary image viewer:
   AO lives in BaseAO's ALPHA, so a PNG preview shows the albedo and nothing
   about the thing the bake exists to produce. This lays the six meaningful
   channels out side by side as opaque greys/colours:

     baseao.rgb   baseao.a (AO)   nre.rg (normal xy)
     nre.b (rough) nre.a (emis)   masks.r (metal) + masks.g (team, green)

   Anything unwritten reads as magenta, so a hole in the unwrap is obvious
   rather than being mistaken for black paint.
   ============================================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const png = require('./artv2/pnglib.cjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const slug = argv.find(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--src' && argv[argv.indexOf(a) - 1] !== '--out');
if (!slug) { console.error('usage: node tools/preview-asset-maps.mjs <slug>'); process.exit(2); }

const dir = path.resolve(ROOT, opt('src', path.join('source-media', 'material-v2', slug)));
const paths = ['baseao', 'nre', 'masks'].map(r => path.join(dir, `${slug}-${r}.png`));
for (const p of paths) if (!fs.existsSync(p)) { console.error('missing ' + p); process.exit(1); }
const [BA, NR, MK] = paths.map(p => png.decode(p));

const TILE = 512, COLS = 3, ROWS = 2, W = TILE * COLS, H = TILE * ROWS;
const outPx = Buffer.alloc(W * H * 4, 255);
const put = (col, row, fn) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const sx = Math.floor(x / TILE * BA.w), sy = Math.floor(y / TILE * BA.h);
    const s = (sy * BA.w + sx) * 4;
    const c = fn(s);
    const d = ((row * TILE + y) * W + col * TILE + x) * 4;
    outPx[d] = c[0]; outPx[d + 1] = c[1]; outPx[d + 2] = c[2]; outPx[d + 3] = 255;
  }
};
/* A texel no face claimed is written by nobody, so it stays at the buffer's
   zero. Painting it magenta means an unwrap hole can never be read as art. */
const blank = s => MK.px[s] === 0 && MK.px[s + 1] === 0 && BA.px[s] === 0 && BA.px[s + 1] === 0 && BA.px[s + 2] === 0;
const M = [255, 0, 200];

put(0, 0, s => blank(s) ? M : [BA.px[s], BA.px[s + 1], BA.px[s + 2]]);
put(1, 0, s => blank(s) ? M : [BA.px[s + 3], BA.px[s + 3], BA.px[s + 3]]);
put(2, 0, s => blank(s) ? M : [NR.px[s], NR.px[s + 1], 255]);
put(0, 1, s => blank(s) ? M : [NR.px[s + 2], NR.px[s + 2], NR.px[s + 2]]);
put(1, 1, s => blank(s) ? M : [NR.px[s + 3], NR.px[s + 3], NR.px[s + 3]]);
put(2, 1, s => blank(s) ? M : [MK.px[s], MK.px[s + 1], 0]);

const outPath = path.resolve(ROOT, opt('out', path.join('releases', 'assetskin-gpu', `maps-${slug}.png`)));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
png.encode(W, H, outPx, outPath);

/* Histogram of the channel the whole exercise is for. */
let sum = 0, n = 0, dark = 0, flat = 0;
for (let i = 0; i < BA.w * BA.h; i++) {
  const s = i * 4; if (blank(s)) continue;
  const a = BA.px[s + 3] / 255; sum += a; n++;
  if (a < 0.45) dark++; if (a > 0.93) flat++;
}
console.log('preview       ', path.relative(ROOT, outPath));
console.log('layout         [albedo | AO | normal.xy] / [rough | emissive | metal(r)+team(g)]');
console.log('AO             mean ' + (sum / n).toFixed(3)
  + '   <0.45 (crevice) ' + (100 * dark / n).toFixed(1) + '%'
  + '   >0.93 (flat) ' + (100 * flat / n).toFixed(1) + '%'
  + '   of ' + n + ' written texels');
