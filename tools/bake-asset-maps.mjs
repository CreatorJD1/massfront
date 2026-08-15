#!/usr/bin/env node
/* ============================================================================
   IN-ENGINE ASSET-MAP BAKER  —  docs/ASSET_MAPS_STEP6.md step 1
   ----------------------------------------------------------------------------
       node tools/bake-asset-maps.mjs nova:1 [--publish] [options]

   WHY THIS IS NOT A BLENDER SCRIPT. 121 packs declare maps; 2 assets have a
   .blend. The other 119 are procedural JavaScript with no source file to open.
   tools/artv2/mf2_bake.py can only bake a Blender collection, so for 119 of 121
   assets it has nothing to point at. This bakes the mesh the GAME builds,
   in the page, against the atlas the game actually uploads.

   WHAT IT PRODUCES, per texel of an injective per-face unwrap
   (MeshBuilder.unwrapAssetUV / mfUnwrapGeoUV):

     BaseAO  rgb  the face's material albedo, LINEARISED, times a restrained
                  fraction of the geometric AO term
             a    tile AO * geometric AO
     NRE     rg   the face's material normal xy, byte-for-byte from the atlas
             b    roughness = 1 - MAT_GLOSS      (FS3D carries gloss, mesh.js:1122)
             a    emissive  = the material's MAT_EMIS render
     Masks   r    metal = MAT_METAL
             g    team-livery mask, from the SIGN of vertex lane 11
             b,a  0 (secondary livery / edge wear have no per-asset source yet)

   Channel order is materials-v2.js:84-115, which is the decode FS3D already
   implements at mesh.js:1114-1122. Nothing in src/ is touched by this tool.

   THE AMBIENT OCCLUSION IS THE ENTIRE POINT. Everything else here is a
   re-encoding of the shared atlas into a per-asset sheet and would be pure
   loss — more memory for the same picture. AO cannot come from a tiling atlas
   because it is a property of the ASSET: where the turret meets the hull, the
   inside of a vent, the underside of an overhang. Rays test this mesh plus the
   sibling hull/turret placed at turH — a hull-only soup cannot shadow the deck
   ring the turret actually sits on.

   THREE THINGS THAT ARE EASY TO GET WRONG, AND HOW THIS HANDLES THEM

   1. sRGB. The premade albedo atlas is uploaded SRGB8_ALPHA8 (materials.js:628)
      so the shader's atlas tap is LINEAR, while the asset base map is uploaded
      plain RGBA (mesh.js:mfAssetTex) and is NOT decoded. Writing the atlas
      bytes straight through would hand FS3D sRGB numbers where it expects
      linear ones and wash the whole chassis out. So albedo is linearised here.

   2. The UV carries the instance scale. VS3D does vUV = aUV * aInst.w, and the
      atlas UV is world-scaled (UVS = 0.055 repeats per world unit). Baking at
      the wrong scale changes the panel/rivet frequency on the flat areas — a
      visible regression that has nothing to do with AO. --uvscale defaults to
      the live expression from render3d.js:1200.

   3. Canvas round-trips destroy AO. AO lives in BaseAO's ALPHA, and a 2D
      canvas premultiplies: putImageData/toDataURL would quantise every dark
      texel. Raw bytes come back from the page and are encoded by
      tools/artv2/pnglib.cjs; no canvas ever holds the result.

   HONEST ABOUT WHERE THE GPU IS. The page runs on real ANGLE/D3D11 Chrome and
   this ABORTS on a software renderer, because the engine must boot, build its
   kits and upload its atlas exactly as it does in the game. The rasterise and
   raycast maths then run in JS on that page. This is not a GPU bake and does
   not claim to be; the GPU requirement is about baking against the real engine
   state, per docs/POSTMORTEM-1.33.31-REGRESSION.md.

   OUTPUT
     source-media/material-v2/<slug>/<slug>-{baseao,nre,masks}.png
     --publish also copies them to assets/textures/materials/ (where
     mfAssetSkin reads) and leaves an artv2-shaped provenance sidecar.

   OPTIONS
     --kit K --slot N | positional "kit:slot"   which FAC_KIT entry to bake
     --part hull|turret|both   which InstMesh to unwrap (default hull).
                     Turret is a second draw at turH; it cannot share the hull
                     sheet. `both` writes <slug> and <slug>-turret. The other
                     part is always an AO occluder so deck/ring contact lands.
     --slug S        output name (default: the pack's declared `maps` name)
     --size N        map size, default 1024 (mfUnwrapGeoUV's 2/1024 seam guard
                     assumes 1024; other sizes warn)
     --rays N        AO rays per sample, default 24
     --radius F      AO ray length as a fraction of the mesh diagonal, def 0.16
     --ao-albedo F   how much AO multiplies into rgb, default 0.35
     --ao-floor F    darkest AO written, default 0.12
     --ao-stride N   compute AO every N texels and box-fill, default 2
     --uvscale F     override the instance-scale UV multiplier
     --port N        static server port, default 8907
     --headed        show the browser
     --publish       also copy to assets/textures/materials/
     --force         allow --publish to overwrite files artv2 did not write
     --json          emit one JSON envelope instead of prose
   ============================================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const require = createRequire(import.meta.url);
const pnglib = require('./artv2/pnglib.cjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DEST_DIR = path.join(ROOT, 'assets', 'textures', 'materials');

/* ------------------------------------------------------------------ args */
const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const num = (n, d) => { const v = Number(opt(n, NaN)); return Number.isFinite(v) ? v : d; };

const asJson = flag('json');
let kit = opt('kit', null), slot = opt('slot', null);
const pos = argv.find(a => /^[a-z]+:\d+$/.test(a));
if (pos) { const [k, s] = pos.split(':'); kit = kit || k; slot = slot === null ? s : slot; }
if (!kit || slot === null) {
  console.error('usage: node tools/bake-asset-maps.mjs <kit:slot> [--part hull|turret|both] [--publish]   e.g. nova:1 (the Rhino)');
  process.exit(2);
}
slot = Number(slot);
const partArg = String(opt('part', 'hull') || 'hull').toLowerCase();
if (!['hull', 'turret', 'both'].includes(partArg)) {
  console.error('--part must be hull, turret or both');
  process.exit(2);
}

const CFG = {
  kit, slot, part: partArg,
  slug: opt('slug', null),
  size: num('size', 1024),
  rays: num('rays', 24),
  radius: num('radius', 0.16),
  aoAlbedo: num('ao-albedo', 0.35),
  aoFloor: num('ao-floor', 0.12),
  aoStride: Math.max(1, num('ao-stride', 2)),
  uvscale: num('uvscale', 0),
};
const PORT = num('port', 8907);

const out = { ok: false, command: 'bake-asset-maps', asset: `${kit}:${slot}`, data: {}, errors: [], warnings: [], next: [] };
const say = (...a) => { if (!asJson) console.log(...a); };
const die = code => {
  if (asJson) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  else for (const e of out.errors) console.error('ERROR ' + e);
  process.exit(code);
};

if (CFG.size !== 1024) out.warnings.push(
  `size ${CFG.size} != 1024: mfUnwrapGeoUV's seam guard is a hardcoded 2/1024, so the guard band will not be a whole number of texels`);

/* ------------------------------------------------- static server (repo root) */
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png',
  '.json': 'application/json', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
/* join(ROOT, '/assets/...') is C:\assets\... on Windows. resolve() both sides. */
function repoFile(urlPath) {
  const u = decodeURIComponent((urlPath || '/').split('?')[0]);
  const rel = (u === '/' ? 'index.html' : u).replace(/^\/+/, '');
  const root = path.resolve(ROOT);
  const f = path.resolve(root, rel);
  if (f !== root && !f.startsWith(root + path.sep)) return null;
  return f;
}
const server = http.createServer((q, r) => {
  const f = repoFile(q.url);
  if (!f) { r.writeHead(403); r.end('nope'); return; }
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); r.end('nope'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    r.end(d);
  });
});
await new Promise(res => server.listen(PORT, res));

/* ------------------------------------------------------------------ browser */
if (!fs.existsSync(CHROME)) {
  out.errors.push(`real-GPU Chrome not found at ${CHROME}. Bundled Chromium is refused: a bake made against `
    + `SwiftShader is not evidence about the shipped atlas (docs/POSTMORTEM-1.33.31-REGRESSION.md).`);
  server.close(); die(3);
}
const browser = await launchPwBrowser({
  executablePath: CHROME, headless: !flag('headed'),
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
const pageErrs = [];
page.on('pageerror', e => pageErrs.push(e.message.slice(0, 160)));

const finish = async code => { await browser.close(); server.close(); die(code); };

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);

const gpu = await page.evaluate(() => {
  const c = document.createElement('canvas'), g = c.getContext('webgl2');
  if (!g) return { renderer: 'NO-WEBGL2' };
  const d = g.getExtension('WEBGL_debug_renderer_info');
  return { renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown',
           vendor: d ? g.getParameter(d.UNMASKED_VENDOR_WEBGL) : 'unknown' };
});
out.data.gpu = gpu;
if (/swiftshader|software|llvmpipe/i.test(gpu.renderer)) {
  out.errors.push('software renderer: ' + gpu.renderer + ' — refusing to bake');
  await finish(3);
}
say('gpu           ', gpu.renderer);

/* Same boot the other real-GPU harnesses use: the kits are built at GL init,
   so the engine has to be past the front screens before FAC_KIT is populated. */
await page.evaluate(() => {
  for (const id of ['apOverlay', 'loadScr']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  try { hideFrontScreens(); } catch (e) {}
  try { applyTheme(); } catch (e) {}
  try { newSkirmish(); } catch (e) {}
});
try {
  await page.waitForFunction(
    () => typeof FAC_KIT !== 'undefined' && typeof mfUnwrapGeoUV === 'function'
      && typeof VFLOATS !== 'undefined' && typeof MAT_TILES !== 'undefined',
    { timeout: 45000 });
} catch (e) {
  out.errors.push('engine globals never appeared (FAC_KIT / mfUnwrapGeoUV / VFLOATS / MAT_TILES)');
  out.data.pageErrors = pageErrs.slice(0, 6);
  await finish(1);
}
await page.waitForTimeout(6000);

/* ------------------------------------------------------------------- bake */
const packInfo = await page.evaluate(o => {
  try {
    const T = o.kit === 'nova' ? TFC_NOVA_BESPOKE_PACKS
      : o.kit === 'legion' ? DOM_LEGION_BESPOKE_PACKS
      : o.kit === 'horde' ? BRD_BESPOKE_PACKS
      : COA_SYN_BESPOKE_PACKS;
    const p = T && T[o.slot];
    return p ? { maps: p.maps || null, mapsTur: p.mapsTur || null } : null;
  } catch (e) { return null; }
}, CFG);
const baseSlug = CFG.slug || (packInfo && packInfo.maps) || `${kit}-slot${slot}`;
const jobs = CFG.part === 'both'
  ? [
      { part: 'hull', slug: baseSlug },
      { part: 'turret', slug: (packInfo && packInfo.mapsTur) || (baseSlug + '-turret') },
    ]
  : [{
      part: CFG.part,
      slug: CFG.part === 'turret'
        ? (CFG.slug || (packInfo && packInfo.mapsTur) || (baseSlug + '-turret'))
        : baseSlug,
    }];

const t0 = Date.now();
const allWritten = [];
const bakes = [];

for (const job of jobs) {
say('baking        ', `${kit}:${slot}:${job.part}  ${CFG.size}px  ${CFG.rays} rays  stride ${CFG.aoStride}`);

const stats = await page.evaluate(async O => {
  const S = O.size, VF = VFLOATS, N = S * S;

  /* ---- the atlas the game actually uploads ------------------------------ */
  const loadImg = src => new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src;
  });
  const grab = async src => {
    const img = await loadImg(src);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    return { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data };
  };
  let A, Nx, Om, atlasSource = 'premade-png';
  try {
    A = await grab('assets/textures/mat-albedo.png');
    Nx = await grab('assets/textures/mat-normal.png');
    Om = await grab('assets/textures/mat-orm.png');
  } catch (e) {
    /* The procedural path only serialises its canvases under ?materialCapture,
       so say what to run rather than baking against nothing. */
    return { error: 'atlas PNGs unreadable (' + e.message + '). Run: node tools/capture-mat-atlas.cjs' };
  }
  const ATLAS = MAT_TILES * MAT_TS;
  if (A.w !== ATLAS || Nx.w !== ATLAS || Om.w !== ATLAS) {
    return { error: `atlas size mismatch: expected ${ATLAS}px square, got ${A.w}/${Nx.w}/${Om.w}` };
  }

  /* ---- the mesh the game builds ---------------------------------------- */
  const fn = FAC_KIT[O.kit] && FAC_KIT[O.kit][O.slot];
  if (typeof fn !== 'function') return { error: `no FAC_KIT["${O.kit}"][${O.slot}]` };
  const g = fn();
  const target = O.part === 'turret' ? g.tur : g.hull;
  if (!target || !target.v) {
    return { error: O.part === 'turret' ? 'kit fn returned no turret geometry' : 'kit fn returned no hull geometry' };
  }

  /* Lanes 9-10 are rewritten by the unwrap, so the ORIGINAL atlas UV has to be
     kept: the bake needs both — the unwrapped one to know WHERE to write, the
     atlas one to know WHAT the material looks like at that point. */
  const OV = new Float32Array(target.v);
  const work = { v: new Float32Array(target.v), i: target.i, count: target.count };
  mfUnwrapGeoUV(work);
  const grid = (work.assetUV && work.assetUV.grid) || 1;
  const nFaces = (work.assetUV && work.assetUV.faces) || 0;

  let uvScale = O.uvscale;
  if (!(uvScale > 0)) {
    try { const T = TYPES[O.slot]; uvScale = T.size / 15 * (g.s || 1) * 1.5 * (T.vscale || 1); }
    catch (e) { uvScale = 1.5; }
  }

  /* ---- pass 1: rasterise the unwrap into a G-buffer -------------------- */
  const V = work.v, IX = work.i, nDraw = Math.floor(work.count / 3);
  const gPos = new Float32Array(N * 3), gNrm = new Float32Array(N * 3), gAU = new Float32Array(N * 2);
  const gMat = new Int32Array(N).fill(-1), gTeam = new Uint8Array(N), cov = new Uint8Array(N);
  const matsSeen = Object.create(null);

  for (let t = 0; t < nDraw; t++) {
    const A0 = IX[t * 3] * VF, B0 = IX[t * 3 + 1] * VF, C0 = IX[t * 3 + 2] * VF;
    const ax = V[A0 + 9] * S, ay = V[A0 + 10] * S;
    const bx = V[B0 + 9] * S, by = V[B0 + 10] * S;
    const cx = V[C0 + 9] * S, cy = V[C0 + 10] * S;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (!den) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1);
    const x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1);
    const y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
    /* Lane 11 is flat in the shader (VS3D: matId = floor(abs(aMat))-1, and the
       SIGN is the team-livery flag), so take it from one corner, not lerped. */
    const am = V[A0 + 11];
    const mid = Math.floor(Math.abs(am)) - 1;
    const team = am < 0 ? 255 : 0;
    matsSeen[mid] = (matsSeen[mid] || 0) + 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
      const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const i = y * S + x;
      if (cov[i]) continue;                       // injective unwrap: first writer wins
      cov[i] = 1;
      for (let k = 0; k < 3; k++) {
        gPos[i * 3 + k] = V[A0 + k] * w0 + V[B0 + k] * w1 + V[C0 + k] * w2;
        gNrm[i * 3 + k] = V[A0 + 3 + k] * w0 + V[B0 + 3 + k] * w1 + V[C0 + 3 + k] * w2;
      }
      gAU[i * 2]     = OV[A0 + 9]  * w0 + OV[B0 + 9]  * w1 + OV[C0 + 9]  * w2;
      gAU[i * 2 + 1] = OV[A0 + 10] * w0 + OV[B0 + 10] * w1 + OV[C0 + 10] * w2;
      gMat[i] = mid; gTeam[i] = team;
    }
  }
  let covered = 0; for (let i = 0; i < N; i++) if (cov[i]) covered++;
  if (!covered) return { error: 'unwrap rasterised to zero texels' };

  /* ---- AO soup: this part plus the sibling at turH ----------------------
     Hull and turret are separate InstMeshes. A hull-only soup never hits the
     ring that sits on the deck, which is the contact the bake exists to hold. */
  const occ = O.part === 'turret' ? g.hull : g.tur;
  const dyOcc = O.part === 'turret' ? -(g.turH || 0) : (g.turH || 0);
  const tOcc = (occ && occ.i) ? Math.floor(occ.count / 3) : 0;
  const tris = nDraw + tOcc;
  const TP = new Float32Array(tris * 9);
  for (let t = 0; t < nDraw; t++) for (let k = 0; k < 3; k++) {
    const b = IX[t * 3 + k] * VF;
    TP[t * 9 + k * 3] = V[b]; TP[t * 9 + k * 3 + 1] = V[b + 1]; TP[t * 9 + k * 3 + 2] = V[b + 2];
  }
  if (tOcc) {
    const OV2 = occ.v, IX2 = occ.i;
    for (let t = 0; t < tOcc; t++) for (let k = 0; k < 3; k++) {
      const b = IX2[t * 3 + k] * VF;
      const o = (nDraw + t) * 9 + k * 3;
      TP[o] = OV2[b]; TP[o + 1] = OV2[b + 1] + dyOcc; TP[o + 2] = OV2[b + 2];
    }
  }
  let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
  for (let t = 0; t < tris; t++) for (let k = 0; k < 3; k++) {
    const o = t * 9 + k * 3;
    if (TP[o] < mnx) mnx = TP[o]; if (TP[o] > mxx) mxx = TP[o];
    if (TP[o + 1] < mny) mny = TP[o + 1]; if (TP[o + 1] > mxy) mxy = TP[o + 1];
    if (TP[o + 2] < mnz) mnz = TP[o + 2]; if (TP[o + 2] > mxz) mxz = TP[o + 2];
  }
  const diag = Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) || 1;
  const R = Math.max(1e-4, O.radius * diag);       // AO is a CONTACT term: short rays
  const cs = R;
  const gx = Math.max(1, Math.min(96, Math.ceil((mxx - mnx) / cs) + 1));
  const gy = Math.max(1, Math.min(96, Math.ceil((mxy - mny) / cs) + 1));
  const gz = Math.max(1, Math.min(96, Math.ceil((mxz - mnz) / cs) + 1));
  const sx = (mxx - mnx) / gx || 1, sy = (mxy - mny) / gy || 1, sz = (mxz - mnz) / gz || 1;
  const cellOf = (x, y, z) => {
    const i = Math.min(gx - 1, Math.max(0, Math.floor((x - mnx) / sx)));
    const j = Math.min(gy - 1, Math.max(0, Math.floor((y - mny) / sy)));
    const k = Math.min(gz - 1, Math.max(0, Math.floor((z - mnz) / sz)));
    return (k * gy + j) * gx + i;
  };
  const nCells = gx * gy * gz;
  const count = new Int32Array(nCells + 1);
  const tcell = [];
  for (let t = 0; t < tris; t++) {
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9, c0 = 1e9, c1 = -1e9;
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      if (TP[o] < a0) a0 = TP[o]; if (TP[o] > a1) a1 = TP[o];
      if (TP[o + 1] < b0) b0 = TP[o + 1]; if (TP[o + 1] > b1) b1 = TP[o + 1];
      if (TP[o + 2] < c0) c0 = TP[o + 2]; if (TP[o + 2] > c1) c1 = TP[o + 2];
    }
    const i0 = Math.min(gx - 1, Math.max(0, Math.floor((a0 - mnx) / sx)));
    const i1 = Math.min(gx - 1, Math.max(0, Math.floor((a1 - mnx) / sx)));
    const j0 = Math.min(gy - 1, Math.max(0, Math.floor((b0 - mny) / sy)));
    const j1 = Math.min(gy - 1, Math.max(0, Math.floor((b1 - mny) / sy)));
    const k0 = Math.min(gz - 1, Math.max(0, Math.floor((c0 - mnz) / sz)));
    const k1 = Math.min(gz - 1, Math.max(0, Math.floor((c1 - mnz) / sz)));
    const list = [];
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = (k * gy + j) * gx + i; list.push(c); count[c + 1]++;
    }
    tcell.push(list);
  }
  for (let c = 0; c < nCells; c++) count[c + 1] += count[c];
  const bucket = new Int32Array(count[nCells]);
  const fill = count.slice();
  for (let t = 0; t < tris; t++) for (const c of tcell[t]) bucket[fill[c]++] = t;

  /* ---- pass 2: ambient occlusion --------------------------------------- */
  /* Cosine-weighted directions on the canonical hemisphere, generated once.
     Each ray then carries equal weight, so the estimator is just the hit
     fraction — no per-ray cosine bookkeeping to get subtly wrong. */
  const K = O.rays, DIR = new Float32Array(K * 3);
  for (let k = 0; k < K; k++) {
    const r = Math.sqrt((k + 0.5) / K), phi = k * 2.399963229728653;
    DIR[k * 3] = r * Math.cos(phi); DIR[k * 3 + 1] = r * Math.sin(phi);
    DIR[k * 3 + 2] = Math.sqrt(Math.max(0, 1 - r * r));
  }
  const ao = new Float32Array(N).fill(1);
  const stamp = new Int32Array(tris).fill(-1);
  const cand = new Int32Array(tris);
  const EPS = diag * 2e-4;
  let visit = 0, aoPts = 0;
  const ST = O.aoStride;

  for (let y = 0; y < S; y += ST) for (let x = 0; x < S; x += ST) {
    const i = y * S + x;
    if (!cov[i]) continue;
    const ox = gPos[i * 3], oy = gPos[i * 3 + 1], oz = gPos[i * 3 + 2];
    let nx = gNrm[i * 3], ny = gNrm[i * 3 + 1], nz = gNrm[i * 3 + 2];
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;

    /* Candidates once per point, reused by every ray: the sphere of influence
       is R and the grid cell is R, so this is at most a 3x3x3 gather. */
    let nc = 0; visit++;
    const i0 = Math.min(gx - 1, Math.max(0, Math.floor((ox - R - mnx) / sx)));
    const i1 = Math.min(gx - 1, Math.max(0, Math.floor((ox + R - mnx) / sx)));
    const j0 = Math.min(gy - 1, Math.max(0, Math.floor((oy - R - mny) / sy)));
    const j1 = Math.min(gy - 1, Math.max(0, Math.floor((oy + R - mny) / sy)));
    const k0 = Math.min(gz - 1, Math.max(0, Math.floor((oz - R - mnz) / sz)));
    const k1 = Math.min(gz - 1, Math.max(0, Math.floor((oz + R - mnz) / sz)));
    for (let kk = k0; kk <= k1; kk++) for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
      const c = (kk * gy + jj) * gx + ii;
      for (let p = count[c]; p < count[c + 1]; p++) {
        const t = bucket[p];
        if (stamp[t] === visit) continue;
        stamp[t] = visit; cand[nc++] = t;
      }
    }
    if (!nc) { aoPts++; continue; }

    /* Tangent frame, rotated per texel so the fixed direction set does not
       stripe the map with its own pattern. */
    let tx, ty, tz;
    if (Math.abs(ny) < 0.9) { tx = -nz; ty = 0; tz = nx; } else { tx = 0; ty = -nz; tz = ny; }
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    let bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    const th = ((x * 12.9898 + y * 78.233) % 6.283185307);
    const ct = Math.cos(th), st = Math.sin(th);
    const t2x = tx * ct + bx * st, t2y = ty * ct + by * st, t2z = tz * ct + bz * st;
    const b2x = -tx * st + bx * ct, b2y = -ty * st + by * ct, b2z = -tz * st + bz * ct;

    const px = ox + nx * EPS, py = oy + ny * EPS, pz = oz + nz * EPS;
    let occ = 0;
    for (let k = 0; k < K; k++) {
      const du = DIR[k * 3], dv = DIR[k * 3 + 1], dw = DIR[k * 3 + 2];
      const dx = t2x * du + b2x * dv + nx * dw;
      const dy = t2y * du + b2y * dv + ny * dw;
      const dz = t2z * du + b2z * dv + nz * dw;
      let best = R;
      for (let q = 0; q < nc; q++) {
        const o = cand[q] * 9;
        const ax = TP[o], ay = TP[o + 1], az = TP[o + 2];
        const e1x = TP[o + 3] - ax, e1y = TP[o + 4] - ay, e1z = TP[o + 5] - az;
        const e2x = TP[o + 6] - ax, e2y = TP[o + 7] - ay, e2z = TP[o + 8] - az;
        const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (det > -1e-9 && det < 1e-9) continue;
        const inv = 1 / det;
        const sx2 = px - ax, sy2 = py - ay, sz2 = pz - az;
        const u = (sx2 * hx + sy2 * hy + sz2 * hz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = sy2 * e1z - sz2 * e1y, qy = sz2 * e1x - sx2 * e1z, qz = sx2 * e1y - sy2 * e1x;
        const vv = (dx * qx + dy * qy + dz * qz) * inv;
        if (vv < 0 || u + vv > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (tt > 1e-5 && tt < best) best = tt;
      }
      if (best < R) occ += 1 - best / R;          // near contacts weigh most
    }
    const a = Math.max(O.aoFloor, Math.min(1, 1 - occ / K));
    for (let dy2 = 0; dy2 < ST && y + dy2 < S; dy2++)
      for (let dx2 = 0; dx2 < ST && x + dx2 < S; dx2++) ao[(y + dy2) * S + x + dx2] = a;
    aoPts++;
  }

  /* Ray noise removal, confined to one unwrap cell so no face borrows its
     neighbour's shading. The cell is derivable from the texel's own position
     because the unwrap partitions the map into a grid of exactly that size. */
  {
    const src = ao.slice();
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
      const i = y * S + x; if (!cov[i]) continue;
      const cxx = Math.floor(x / S * grid), cyy = Math.floor(y / S * grid);
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const jx = x + dx, jy = y + dy, j = jy * S + jx;
        if (!cov[j]) continue;
        if (Math.floor(jx / S * grid) !== cxx || Math.floor(jy / S * grid) !== cyy) continue;
        s += src[j]; n++;
      }
      if (n) ao[i] = s / n;
    }
  }

  /* ---- pass 3: pack ----------------------------------------------------- */
  const base = new Uint8Array(N * 4), nre = new Uint8Array(N * 4), msk = new Uint8Array(N * 4);
  const toLinear = c => (c <= 0.04045) ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) LIN[i] = toLinear(i / 255);

  /* matUV(), reimplemented from mesh.js:1078-1088. Same tile cell, same
     frequency bands, same 0.004 inset that keeps bilinear taps off the seam. */
  const BUILDLO = MAT.BUILD, BUILDHI = MAT.ROOF, TOWERLO = MAT.TWR_ARMOR, TOWERHI = MAT.TWR_BORE;
  const matFreq = id => (id >= BUILDLO && id <= BUILDHI) ? 0.34 : (id >= TOWERLO && id <= TOWERHI) ? 0.48 : 1.0;
  const TS = MAT_TS;
  const bilinear = (M, fx, fy, o) => {
    const x0 = Math.floor(fx - 0.5), y0 = Math.floor(fy - 0.5);
    const tx = fx - 0.5 - x0, ty = fy - 0.5 - y0;
    const cl = (v, m) => v < 0 ? 0 : v > m ? m : v;
    const xa = cl(x0, M.w - 1), xb = cl(x0 + 1, M.w - 1), ya = cl(y0, M.h - 1), yb = cl(y0 + 1, M.h - 1);
    const p00 = M.d[(ya * M.w + xa) * 4 + o], p10 = M.d[(ya * M.w + xb) * 4 + o];
    const p01 = M.d[(yb * M.w + xa) * 4 + o], p11 = M.d[(yb * M.w + xb) * 4 + o];
    return (p00 * (1 - tx) + p10 * tx) * (1 - ty) + (p01 * (1 - tx) + p11 * tx) * ty;
  };

  let aoSum = 0, aoMin = 1, aoN = 0;
  for (let i = 0; i < N; i++) {
    if (!cov[i]) continue;
    const mid = gMat[i];
    const f = matFreq(mid);
    const cellX = mid % MAT_TILES, cellY = Math.floor(mid / MAT_TILES);
    let fu = (gAU[i * 2] * uvScale * f) % 1; if (fu < 0) fu += 1;
    let fv = (gAU[i * 2 + 1] * uvScale * f) % 1; if (fv < 0) fv += 1;
    fu = Math.min(0.996, Math.max(0.004, fu)); fv = Math.min(0.996, Math.max(0.004, fv));
    const ax = (cellX + fu) * TS, ay = (cellY + fv) * TS;

    const a = ao[i];
    aoSum += a; if (a < aoMin) aoMin = a; aoN++;
    const tileAO = bilinear(Om, ax, ay, 0) / 255;
    const glossB = bilinear(Om, ax, ay, 1);
    const emisB  = bilinear(Om, ax, ay, 2);
    const metalB = bilinear(Om, ax, ay, 3);

    /* rgb: the atlas tap FS3D would have made, linearised because that tap
       comes from an SRGB8 texture and this one will not. Times a restrained
       share of the AO so contact shadows also survive direct sun; full AO here
       would double-count against the alpha channel below. */
    const kAO = 1 - O.aoAlbedo * (1 - a);
    const o4 = i * 4;
    base[o4]     = Math.max(0, Math.min(255, Math.round(LIN[Math.round(bilinear(A, ax, ay, 0))] * 255 * kAO)));
    base[o4 + 1] = Math.max(0, Math.min(255, Math.round(LIN[Math.round(bilinear(A, ax, ay, 1))] * 255 * kAO)));
    base[o4 + 2] = Math.max(0, Math.min(255, Math.round(LIN[Math.round(bilinear(A, ax, ay, 2))] * 255 * kAO)));
    base[o4 + 3] = Math.max(0, Math.min(255, Math.round(tileAO * a * 255)));

    nre[o4]     = Math.round(bilinear(Nx, ax, ay, 0));
    nre[o4 + 1] = Math.round(bilinear(Nx, ax, ay, 1));
    nre[o4 + 2] = Math.max(0, Math.min(255, Math.round(255 - glossB)));   // roughness = 1 - gloss
    nre[o4 + 3] = Math.round(emisB);

    msk[o4]     = Math.round(metalB);
    msk[o4 + 1] = gTeam[i];
    msk[o4 + 2] = 0;
    msk[o4 + 3] = 0;
  }

  /* ---- pass 4: seam guard ---------------------------------------------- */
  /* unwrapAssetUV insets each face by 2/1024 so bilinear and mip 1 have room.
     Those texels are inside the FACE'S OWN cell and are still unwritten, so a
     same-cell dilation fills them with that face's colour. Crossing a cell is
     forbidden: that is another face and the bleed it would cause is exactly
     what the inset exists to prevent. */
  const cellId = (x, y) => Math.floor(y / S * grid) * grid + Math.floor(x / S * grid);
  for (let pass = 0; pass < 3; pass++) {
    const before = cov.slice();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x; if (before[i]) continue;
      const cid = cellId(x, y);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const jx = x + dx, jy = y + dy;
        if (jx < 0 || jy < 0 || jx >= S || jy >= S) continue;
        const j = jy * S + jx;
        if (!before[j] || cellId(jx, jy) !== cid) continue;
        for (let c = 0; c < 4; c++) {
          base[i * 4 + c] = base[j * 4 + c]; nre[i * 4 + c] = nre[j * 4 + c]; msk[i * 4 + c] = msk[j * 4 + c];
        }
        cov[i] = 1; break;
      }
    }
  }
  let filled = 0; for (let i = 0; i < N; i++) if (cov[i]) filled++;

  const b64 = u8 => {
    let s = ''; const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  };
  window.__MF_BAKE = { baseao: b64(base), nre: b64(nre), masks: b64(msk) };

  return {
    atlasSource, atlasPx: A.w, size: S, tris: nDraw, occTris: tOcc,
    part: O.part || 'hull', turH: +(g.turH || 0).toFixed(2),
    faces: nFaces, gridCells: grid,
    uvScale: +uvScale.toFixed(4), meshDiag: +diag.toFixed(2), aoRadius: +R.toFixed(3),
    coveredPct: +(100 * covered / N).toFixed(1), filledPct: +(100 * filled / N).toFixed(1),
    aoPoints: aoPts, aoMean: +(aoSum / Math.max(1, aoN)).toFixed(4), aoMin: +aoMin.toFixed(4),
    materials: Object.keys(matsSeen).map(Number).sort((a, b) => a - b),
  };
}, { ...CFG, part: job.part });

if (stats && stats.error) { out.errors.push(stats.error); await finish(1); }
bakes.push({ part: job.part, slug: job.slug, stats });
say('mesh          ', `${job.part} ${stats.tris} tris + ${stats.occTris} occ @ turH ${stats.turH}, ${stats.faces} faces -> ${stats.gridCells}x${stats.gridCells}, uvScale ${stats.uvScale}`);
say('coverage      ', `${stats.coveredPct}% rasterised, ${stats.filledPct}% after seam guard`);
say('ao            ', `mean ${stats.aoMean}  min ${stats.aoMin}  radius ${stats.aoRadius} of diag ${stats.meshDiag}  (${stats.aoPoints} samples)`);
say('materials     ', stats.materials.join(','));
if (stats.aoMean > 0.995) out.warnings.push(
  `${job.part}: AO is effectively flat (mean ${stats.aoMean}) — this bake would add nothing the atlas does not already have. Check --radius.`);
if (!(stats.occTris > 0)) out.warnings.push(
  `${job.part}: no sibling occluder tris — contact AO against the other part will be missing.`);

const slug = job.slug;
const outDir = path.join(ROOT, 'source-media', 'material-v2', slug);
fs.mkdirSync(outDir, { recursive: true });
for (const role of ['baseao', 'nre', 'masks']) {
  const b64 = await page.evaluate(r => window.__MF_BAKE[r], role);
  const buf = Buffer.from(b64, 'base64');
  const p = path.join(outDir, `${slug}-${role}.png`);
  pnglib.encode(CFG.size, CFG.size, buf, p);
  allWritten.push({ role, path: path.relative(ROOT, p), kb: Math.round(fs.statSync(p).size / 1024), slug, outDir });
  say('wrote         ', path.relative(ROOT, p), `(${Math.round(fs.statSync(p).size / 1024)} KB)`);
}
}

out.data.slug = jobs.map(j => j.slug).join(',');
out.data.bake = bakes;
out.data.bakeSeconds = +((Date.now() - t0) / 1000).toFixed(1);
out.data.written = allWritten;

await browser.close();
server.close();

/* ---------------------------------------------------------------- publish */
if (flag('publish')) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  const sha = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const pub = [];
  const byDir = new Map();
  for (const w of allWritten) {
    if (!byDir.has(w.outDir)) byDir.set(w.outDir, { slug: w.slug, files: [] });
    byDir.get(w.outDir).files.push(w);
  }
  for (const [outDir, rec] of byDir) {
    const provPath = path.join(outDir, '.artv2-publish.json');
    const prev = fs.existsSync(provPath) ? JSON.parse(fs.readFileSync(provPath, 'utf8')) : {};
    const known = prev.files || {};
    const wrote = {};
    for (const w of rec.files) {
      const name = `${rec.slug}-${w.role}.png`;
      const src = path.join(outDir, name), dest = path.join(DEST_DIR, name);
      const s = sha(src);
      if (fs.existsSync(dest) && sha(dest) !== s && known[name] !== sha(dest) && !flag('force')) {
        out.errors.push(`${name} exists in assets/textures/materials/ and was not published by this tool — pass --force`);
        pub.push({ role: w.role, name, action: 'refused' });
        continue;
      }
      fs.copyFileSync(src, dest);
      wrote[name] = s;
      pub.push({ role: w.role, name, action: 'copied', sha: s.slice(0, 12) });
      say('published     ', 'assets/textures/materials/' + name);
    }
    if (Object.keys(wrote).length) {
      fs.writeFileSync(provPath, JSON.stringify({
        stage: 'publish', tool: 'bake-asset-maps.mjs',
        agent: process.env.ARTV2_AGENT || 'unknown', at: new Date().toISOString(),
        files: { ...known, ...wrote }, dest: 'assets/textures/materials',
      }, null, 2) + '\n');
    }
  }
  out.data.published = pub;
  out.next.push('node tools/capture-asset-bake-ab.mjs   # hull+turret A/B');
}

out.ok = out.errors.length === 0;
if (asJson) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
else {
  for (const w of out.warnings) console.log('WARN  ' + w);
  for (const e of out.errors) console.log('ERROR ' + e);
  for (const n of out.next) console.log('NEXT  ' + n);
  console.log(out.ok ? 'OK   bake-asset-maps ' + jobs.map(j => j.slug).join(',') : 'FAIL bake-asset-maps');
}
process.exit(out.ok ? 0 : 1);

