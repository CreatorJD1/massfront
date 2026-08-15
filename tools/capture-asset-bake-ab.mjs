#!/usr/bin/env node
/* ============================================================================
   ASSET-BAKE A/B  —  docs/ASSET_MAPS_STEP6.md step 2, "prove it on the Rhino"
       node tools/capture-asset-bake-ab.mjs [port]

   THE ACCEPTANCE TEST IS NOT "PIXELS CHANGED". Two runs of the same build
   differ by most of their pixels, because the scene animates and reseeds. So
   this does not report a diff percentage as if it were a verdict. It produces
   two frames of ONE subject, framed identically, that a person compares:

     same silhouette, visible contact AO in the crevices, no regression flat.

   To make that comparison mean anything the two runs must differ ONLY in the
   flag. Math.random is seeded before any game script; the camera, the spawn
   coordinates and the zoom are set explicitly rather than inherited from
   whatever the intro camera was doing; and the units are held still.

   It also records the things a screenshot cannot show and that this project
   has been burned by before: the real GPU string (it ABORTS on SwiftShader),
   every assets/textures/materials/ request with its status as seen BY THE
   SERVER, and whether the mesh actually took the skin — assetMaps bound and
   geo.assetUV present. A frame that looks different for the wrong reason is
   worse than no frame.

   Output: releases/asset-bake-ab/{wide,close}-{off,on}.png + report.json
   Brood:  $env:MF_AB_KIT='horde'; $env:MF_AB_SLOT='1'; node tools/capture-asset-bake-ab.mjs
           writes horde1-{wide,close}-{off,on}.png so the Rhino pair is kept.
   Read-only with respect to src/.
   ============================================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'releases', 'asset-bake-ab');
fs.mkdirSync(OUT, { recursive: true });
const PORT = Number(process.argv[2] || 8931);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const KIT = process.env.MF_AB_KIT || 'nova';
const SLOT = Number(process.env.MF_AB_SLOT || 1);
/* Team 0 is Nova. Brood geometry lives on team 2 (AI horde kit). Spawning
   slot 1 on team 0 photographs a Rhino even when MF_AB_KIT=horde. */
const TEAM = Number(process.env.MF_AB_TEAM || (KIT === 'horde' ? 2 : 0));
const SKIN = process.env.MF_AB_SKIN || (KIT === 'horde' && SLOT === 1 ? 'gorger' : '1');
const PREFIX = (KIT === 'nova' && SLOT === 1) ? '' : `${KIT}${SLOT}-`;

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png',
  '.json': 'application/json', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
let matLog = [];
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
  const isMat = /assets\/textures\/materials\//.test(q.url || '');
  if (!f) { if (isMat) matLog.push({ url: q.url, status: 403 }); r.writeHead(403); r.end('nope'); return; }
  fs.readFile(f, (e, d) => {
    if (e) { if (isMat) matLog.push({ url: q.url, status: 404 }); r.writeHead(404); r.end('nope'); return; }
    if (isMat) matLog.push({ url: q.url, status: 200, bytes: d.length });
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    r.end(d);
  });
});
await new Promise(res => server.listen(PORT, res));

const browser = await launchPwBrowser({
  executablePath: CHROME, headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox'],
});

/* Installed before any game script: identical map, spawns and jitter in both
   runs, so the flag is the only variable left. */
const SEED = () => {
  let s = 0x9e3779b9 >>> 0;
  Math.random = function () {
    s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

async function run(qs, label) {
  matLog = [];
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await page.addInitScript(SEED);
  await page.goto(`http://127.0.0.1:${PORT}/${qs}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas'), g = c.getContext('webgl2');
    if (!g) return { renderer: 'NO-WEBGL2' };
    const d = g.getExtension('WEBGL_debug_renderer_info');
    return { renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown' };
  });
  if (/swiftshader|software|llvmpipe/i.test(gpu.renderer)) {
    console.error('ABORT: software renderer ' + gpu.renderer);
    await browser.close(); server.close(); process.exit(2);
  }

  await page.evaluate(() => {
    for (const id of ['apOverlay', 'loadScr']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    try { hideFrontScreens(); } catch (e) {}
    try { applyTheme(); } catch (e) {}
    try { newSkirmish(); } catch (e) {}
  });
  for (let k = 0; k < 12; k++) {
    await page.waitForTimeout(2500);
    const n = await page.evaluate(() => { let n = 0; try { for (let i = 0; i < unitHigh; i++) if (ualive[i]) n++; } catch (e) {} return n; });
    if (n >= 6 && k >= 5) break;
  }

  /* Three of the subject on a fixed line. Pin the camera every frame: the intro
     fly-in and carrier follow silently undo a one-shot assignment, which is
     how an earlier run photographed the undeployed commander instead.
     uhead is gone on this tree. clampCam enforces SPAN_MIN (420) so a close-up
     of contact AO must skip it and replace camTick, same as capture-brood-silhouettes. */
  const spawn = await page.evaluate(o => {
    const r = { ok: [], err: null };
    try {
      try { stopAttract(); } catch (e) {}
      try { attractOn = false; demoMode = true; matchLive = true; fogOn = false; } catch (e) {}
      try { running = true; paused = true; gameEnded = false; shake = 0; } catch (e) {}
      try { if (carrier) { carrier.active = false; carrier.phase = 2; } } catch (e) {}
      if (o.team === 2) {
        try { resetWorld(); } catch (e) {}
        try {
          const F = FACTIONS.horde; AI.fac = 'horde';
          TEAMC[2][0] = F.col[0]; TEAMC[2][1] = F.col[1]; TEAMC[2][2] = F.col[2];
          TEAMB[2][0] = F.colB[0]; TEAMB[2][1] = F.colB[1]; TEAMB[2][2] = F.colB[2];
        } catch (e) {}
      }
      const cx = MAP * 0.5, cy = MAP * 0.5;
      for (let k = 0; k < 3; k++) {
        const x = cx + k * 46 - 46, y = cy;
        const i = spawnUnit(o.slot, o.team, x, y);
        if (i >= 0) {
          r.ok.push(i);
          ux[i] = utx[i] = x; uy[i] = uty[i] = y;
          try { ustate[i] = 0; umov[i] = 0; } catch (e) {}
        }
      }
      if (typeof camFollow !== 'undefined') camFollow = -1;
      try { camTick = () => camUpdateMatrices(); } catch (e) {}
      window.__pin = () => {
        try {
          if (typeof camFollow !== 'undefined') camFollow = -1;
          cam.x = cx; cam.y = cy; camYaw = yawTarget = 0.60; camPitch = pitchTarget = 1.05;
          /* Inspection span, not SPAN_MIN: contact AO is invisible at command zoom. */
          orthoSpan = distTarget = 160; camUpdateMatrices();
        } catch (e) {}
        requestAnimationFrame(window.__pin);
      };
      window.__pin();
    } catch (e) { r.err = String(e); }
    return r;
  }, { slot: SLOT, team: TEAM });
  await page.waitForTimeout(9000);      // the skin decodes and swaps async

  /* Did the mesh actually take it? A frame that differs because the geometry
     failed to swap is not evidence about the bake. */
  const census = await page.evaluate(o => {
    const M = (typeof FAC_MESH !== 'undefined' && FAC_MESH[o.kit]) ? FAC_MESH[o.kit][o.slot] : null;
    const tex = (typeof MF_ASSET_TEX !== 'undefined') ? MF_ASSET_TEX : {};
    return {
      flag: (typeof mfAssetSkinEnabled === 'function') ? mfAssetSkinEnabled() : null,
      pack: (typeof mfPackMaps === 'function') ? mfPackMaps(o.kit, o.slot) : null,
      mapsTur: (o.kit === 'nova' && typeof TFC_NOVA_BESPOKE_PACKS !== 'undefined' && TFC_NOVA_BESPOKE_PACKS[o.slot])
        ? (TFC_NOVA_BESPOKE_PACKS[o.slot].mapsTur || null)
        : (o.kit === 'horde' && typeof BRD_BESPOKE_PACKS !== 'undefined' && BRD_BESPOKE_PACKS[o.slot])
          ? (BRD_BESPOKE_PACKS[o.slot].mapsTur || null) : null,
      hasMaps: !!(M && M.hull && M.hull.assetMaps),
      hasMapsTur: !!(M && M.tur && M.tur.assetMaps),
      unwrapped: !!(M && M.hull && M.hull.geo && M.hull.geo.assetUV),
      unwrappedTur: !!(M && M.tur && M.tur.geo && M.tur.geo.assetUV),
      texUrls: Object.keys(tex).length,
      texReady: Object.values(tex).filter(r => r.ready).length,
      texFailed: Object.values(tex).filter(r => r.failed).length,
      orthoSpan, camx: cam.x, camy: cam.y,
      alive: (() => { let n = 0; try { for (let i = 0; i < unitHigh; i++) if (ualive[i]) n++; } catch (e) {} return n; })(),
    };
  }, { kit: KIT, slot: SLOT });

  /* uAssetOn read off the live program, per draw call, for one frame. Also
     wrap InstMesh.flush so hull vs turret can be named — drawElementsInstanced
     alone cannot tell a skinned turret from a semantic hull. */
  const draws = await page.evaluate(() => new Promise(res => {
    const st = { draws: 0, on: 0, off: 0, values: {}, mapDraws: [] };
    const orig = gl.drawElementsInstanced.bind(gl);
    gl.drawElementsInstanced = function (m, c, t, o, p) {
      st.draws++;
      try {
        if (gl.getParameter(gl.CURRENT_PROGRAM) === prog3D && U3 && U3.uAssetOn) {
          const v = gl.getUniform(prog3D, U3.uAssetOn);
          st.values[String(v)] = (st.values[String(v)] || 0) + 1;
          if (v > 0.5) st.on++; else st.off++;
        }
      } catch (e) {}
      return orig(m, c, t, o, p);
    };
    const tag = new Map();
    try {
      for (const k in FAC_MESH) for (const ty in FAC_MESH[k]) {
        const M = FAC_MESH[k][ty]; if (!M) continue;
        if (M.hull && !tag.has(M.hull)) tag.set(M.hull, k + '/' + ty + ':' + ((typeof mfPackMaps === 'function' && mfPackMaps(k, ty)) || '-'));
        if (M.tur && !tag.has(M.tur)) tag.set(M.tur, k + '/' + ty + ':turret');
      }
    } catch (e) {}
    const origFlush = InstMesh.prototype.flush;
    InstMesh.prototype.flush = function (g) {
      const n = this.n, maps = !!this.assetMaps, who = tag.get(this) || null;
      const r = origFlush.call(this, g);
      if (n) {
        let v = null;
        try { if (gl.getParameter(gl.CURRENT_PROGRAM) === prog3D && U3.uAssetOn) v = gl.getUniform(prog3D, U3.uAssetOn); } catch (e) {}
        if (maps || (who && /rhino|gorger|nova\/1|horde\/1/.test(who))) st.mapDraws.push({ who, n, maps, uAssetOn: v });
      }
      return r;
    };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      gl.drawElementsInstanced = orig;
      InstMesh.prototype.flush = origFlush;
      res(st);
    }));
  }));

  await page.evaluate(() => {
    for (const id of ['apOverlay', 'loadScr', 'deployBtn', 'authPortal', 'introScr']) {
      const e = document.getElementById(id); if (e) e.style.display = 'none';
    }
    try {
      for (const el of [...document.body.children]) {
        if (el.id === 'gl' || el.tagName === 'CANVAS') continue;
        el.style.display = 'none';
      }
    } catch (e) {}
  });
  const wide = path.join(OUT, `${PREFIX}wide-${label}.png`);
  const close = path.join(OUT, `${PREFIX}close-${label}.png`);
  await page.screenshot({ path: wide });
  await page.screenshot({ path: close, clip: { x: 300, y: 300, width: 320, height: 320 } });

  const luma = await page.evaluate(() => {
    const c = document.querySelector('canvas'); const g = c && c.getContext('webgl2'); if (!g) return null;
    const w = Math.min(c.width, 512), h = Math.min(c.height, 512);
    const px = new Uint8Array(w * h * 4); g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
    let s = 0, nz = 0; for (let i = 0; i < px.length; i += 4) { const v = px[i] + px[i + 1] + px[i + 2]; s += v; if (v > 12) nz++; }
    return { meanLuma: +(s / (px.length / 4) / 3).toFixed(2), nonBlackPct: +(100 * nz / (px.length / 4)).toFixed(1) };
  });

  await page.close();
  return { label, qs, gpu, spawn, census, draws, luma, wide, close,
    mats: { req: matLog.length, ok: matLog.filter(m => m.status === 200).length,
            missing: matLog.filter(m => m.status === 404).map(m => m.url).slice(0, 6),
            got: matLog.filter(m => m.status === 200).map(m => m.url).slice(0, 6) },
    errors: [...new Set(errs)].slice(0, 8) };
}

const off = await run('', 'off');
const on = await run('?assetskin=' + encodeURIComponent(SKIN), 'on');
await browser.close(); server.close();

fs.writeFileSync(path.join(OUT, PREFIX ? `${PREFIX}report.json` : 'report.json'), JSON.stringify({ when: new Date().toISOString(), kit: KIT, slot: SLOT, team: TEAM, skin: SKIN, off, on }, null, 2));
for (const r of [off, on]) {
  console.log('\n=== ' + r.label + '  (' + (r.qs || 'no flag') + ')');
  console.log('  gpu        ', r.gpu.renderer);
  console.log('  flag       ', r.census.flag, ' pack', r.census.pack, ' tur', r.census.mapsTur,
    ' hasMaps', r.census.hasMaps, ' hasMapsTur', r.census.hasMapsTur,
    ' unwrapped', r.census.unwrapped, ' unwrappedTur', r.census.unwrappedTur);
  console.log('  tex        ', r.census.texUrls + ' urls, ready ' + r.census.texReady + ', failed ' + r.census.texFailed);
  console.log('  material   ', r.mats.req + ' reqs, 200:' + r.mats.ok, r.mats.missing.length ? '404:' + r.mats.missing.join(' ') : '');
  console.log('  draws      ', r.draws.draws + ' total, uAssetOn=1 on ' + r.draws.on + ' draws', JSON.stringify(r.draws.values));
  if (r.draws.mapDraws && r.draws.mapDraws.length)
    console.log('  skinned    ', JSON.stringify(r.draws.mapDraws.slice(0, 8)));
  console.log('  spawn      ', (r.spawn && r.spawn.ok && r.spawn.ok.length) + ' ok', r.spawn && r.spawn.err ? r.spawn.err : '');
  console.log('  units      ', r.census.alive + ' alive, span ' + r.census.orthoSpan);
  console.log('  frame      ', JSON.stringify(r.luma));
  console.log('  errors     ', r.errors.length, r.errors.slice(0, 2).join(' | '));
  console.log('  shots      ', path.relative(ROOT, r.wide), path.relative(ROOT, r.close));
}
console.log('\nCOMPARE THE TWO close-*.png BY EYE. Same silhouette + darker crevices + unchanged flats = pass.');
