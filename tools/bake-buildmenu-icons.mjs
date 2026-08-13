/* Bake the build-menu icons out of the game's own 3D models.

     node tools/bake-buildmenu-icons.mjs [port]

   The build menu needs an icon per entity per faction that represents its
   in-game counterpart. The most faithful possible representation of a thing is
   that thing, rendered — so nothing is drawn here. Every unit and structure is
   pushed through MFIntelPreview3D (the same class that already renders the live
   card thumbnails), captured at 256 px, and packed into the cell layout
   docs/BUILD_MENU_ICON_ART_SPEC.md commissions. Authored art can replace any
   sheet later without touching a line of runtime code.

   Two properties fall out for free, and both are things hand-authored icons
   have to work for:
     - every entity differs, because every MODEL differs. The eleven defence
       emplacements that shared one turret glyph now show eleven turrets.
     - every faction differs, because factionUnitGeo/factionBldMdlSet resolve
       per kit. A faction with no model for a slot leaves the cell EMPTY rather
       than borrowing Nova's, and the runtime falls back to its role glyph.

   REAL GPU ONLY — these are the shipping icons, not a preview.               */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const { decode, encode } = createRequire(import.meta.url)('./artv2/pnglib.cjs');

const PORT = process.argv[2] || '8992';
const OUT = 'assets/textures/ui';
const KITS = ['nova', 'legion', 'syndicate', 'horde'];
const SRC = 256, CELL = 128, GRID = 8, ATLAS = CELL * GRID, INNER = 118;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false,
  args: ['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox'] });
/* deviceScaleFactor 1 so draw()'s internal `min(1.6, dpr)` is 1 and the canvas
   backing store is exactly the CSS size we ask for. */
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(14000);
const renderer = await page.evaluate(() => { try {
  const g = document.createElement('canvas').getContext('webgl2');
  const e = g.getExtension('WEBGL_debug_renderer_info');
  return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; } catch { return '?'; } });
console.log('renderer:', renderer);
if (/swiftshader|software/i.test(renderer)) {
  console.error('REFUSING: software renderer'); await browser.close(); process.exit(3); }

/* Boot a match so the model registries and faction kits are fully resolved. */
await page.evaluate(() => {
  for (const id of ['apOverlay','loadScr']) { const e=document.getElementById(id); if (e) e.style.display='none'; }
  try { hideFrontScreens(); applyTheme(); newSkirmish(); } catch {}
});
await page.waitForTimeout(22000);

const index = {};
for (const kit of KITS) {
  for (const family of ['struct', 'unit']) {
    const shots = await page.evaluate(async ({ kit, family, SRC }) => {
      const cv = document.createElement('canvas');
      cv.style.cssText = 'position:fixed;left:-2048px;top:0;width:' + SRC + 'px;height:' + SRC + 'px;opacity:0;pointer-events:none';
      document.body.appendChild(cv);
      const list = family === 'struct'
        ? MF_BM_STRUCT_ORDER.map((key, cell) => ({ cell, kind: 'building', id: key }))
        : TYPES.map((T, i) => ({ cell: i, kind: 'unit', id: i })).filter(e => e.cell < 64);

      const view = new MFIntelPreview3D(cv, list[0].kind, list[0].id, kit);
      const out = [];
      if (!view.program) { cv.remove(); return out; }
      /* Fixed yaw for every icon: draw() derives it from the timestamp, so
         passing one constant gives the whole set an identical 3/4 view instead
         of catching each model at a random spin. 2100 is what the live
         thumbnail path already uses, so baked and live icons agree. */
      for (const e of list) {
        let ok = false;
        try { ok = view.setSubject(e.kind, e.id, kit); } catch { ok = false; }
        if (!ok) continue;
        view.dirty = true;
        try { view.draw(2100); } catch { continue; }
        let url = '';
        try { url = cv.toDataURL('image/png'); } catch { url = ''; }
        if (url) out.push({ cell: e.cell, url });
      }
      view.dispose(); cv.remove();
      return out;
    }, { kit, family, SRC });

    /* Pack. Each shot is trimmed to its own ink before scaling, so a wall
       segment and a Titan Gate both fill their cell instead of inheriting the
       framing of whatever bounding box the renderer happened to use. */
    const atlas = Buffer.alloc(ATLAS * ATLAS * 4);
    const filled = [];
    for (const s of shots) {
      const png = decode(Buffer.from(s.url.split(',')[1], 'base64'));
      let mnX = 1e9, mnY = 1e9, mxX = -1, mxY = -1;
      for (let y = 0; y < png.h; y++) for (let x = 0; x < png.w; x++) {
        if (png.px[(y * png.w + x) * 4 + 3] < 12) continue;
        if (x < mnX) mnX = x; if (x > mxX) mxX = x;
        if (y < mnY) mnY = y; if (y > mxY) mxY = y;
      }
      if (mxX < 0) continue;                       // model rendered nothing
      const gw = mxX - mnX + 1, gh = mxY - mnY + 1;
      const sc = Math.min(INNER / gw, INNER / gh);
      const dw = Math.max(1, Math.round(gw * sc)), dh = Math.max(1, Math.round(gh * sc));
      const ox = (s.cell % GRID) * CELL + Math.round((CELL - dw) / 2);
      const oy = Math.floor(s.cell / GRID) * CELL + Math.round((CELL - dh) / 2);
      for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
        const sx0 = mnX + x / sc, sx1 = mnX + (x + 1) / sc;
        const sy0 = mnY + y / sc, sy1 = mnY + (y + 1) / sc;
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let sy = Math.floor(sy0); sy < Math.max(Math.floor(sy0) + 1, Math.ceil(sy1)); sy++)
          for (let sx = Math.floor(sx0); sx < Math.max(Math.floor(sx0) + 1, Math.ceil(sx1)); sx++) {
            if (sx < 0 || sy < 0 || sx >= png.w || sy >= png.h) continue;
            const p = (sy * png.w + sx) * 4, al = png.px[p + 3] / 255;
            /* Weight colour by alpha so the transparent surround does not bleed
               a dark halo into the edges when downscaling. */
            r += png.px[p] * al; g += png.px[p + 1] * al; b += png.px[p + 2] * al;
            a += png.px[p + 3]; n++;
          }
        if (!n) continue;
        const A = a / n; if (A < 3) continue;
        /* r/g/b were accumulated pre-multiplied by alpha, so dividing by the
           summed alpha (not the sample count) recovers the colour of the ink
           alone — otherwise every edge pixel darkens toward the transparent
           surround and the icons gain a black rim. */
        const wsum = (a / 255) || 1;
        const d = ((oy + y) * ATLAS + (ox + x)) * 4;
        atlas[d]     = Math.min(255, Math.round(r / wsum));
        atlas[d + 1] = Math.min(255, Math.round(g / wsum));
        atlas[d + 2] = Math.min(255, Math.round(b / wsum));
        atlas[d + 3] = Math.round(A);
      }
      filled.push(s.cell);
    }
    const file = `bm-${family}-${kit}.png`;
    encode(ATLAS, ATLAS, atlas, `${OUT}/${file}`);
    index[`${family}:${kit}`] = filled.sort((a, b) => a - b);
    console.log(`${file.padEnd(24)} ${String(filled.length).padStart(2)} baked`);
  }
}

writeFileSync(`${OUT}/bm-index.json`, JSON.stringify(index) + '\n');
console.log('\nwrote bm-index.json');
if (errs.length) console.log(errs.length + ' page error(s):\n  ' + errs.slice(0, 6).join('\n  '));
await browser.close();
