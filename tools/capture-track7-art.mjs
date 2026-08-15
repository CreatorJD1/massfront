#!/usr/bin/env node
/* Track 7 Stage 0 art capture — real GPU.
   Roster/menu inventory + filler lineup + Brood/Nova silhouettes +
   assetskin request log (templates must not be fetched).

     node tools/capture-track7-art.mjs
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'track7-2026-08-14');
await mkdir(outDir, { recursive: true });

const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.webp':'image/webp', '.webmanifest':'application/manifest+json'
};
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = resolve(join(root, p));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const url = 'http://127.0.0.1:' + PORT + '/';
console.log('serving ' + url);

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await launchPwBrowser({
  executablePath: chrome, headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox']
});

const dismiss = () => {
  try { if (typeof apClose === 'function') apClose(); } catch (e) {}
  try { if (typeof stopAttract === 'function') stopAttract(); } catch (e) {}
  document.body.classList.add('mfIntroDone');
  for (const id of ['mfBootCover', 'apOverlay', 'loadScr', 'mfIntroSkip', 'mfIntroReplay']) {
    const el = document.getElementById(id);
    if (el) el.style.setProperty('display', 'none', 'important');
  }
};

try {
  const page = await browser.newPage({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark'
  });
  const errs = [];
  page.on('pageerror', e => { errs.push(e.message); console.log('ERR ' + e.message); });
  const matGets = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/assets/textures/materials/')) matGets.push(u.replace(/^https?:\/\/[^/]+/, ''));
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mf_ap_gate_closed', '1');
      localStorage.setItem('mf_ap_dismissed', '1');
      localStorage.setItem('mf_offline', '1');
      localStorage.setItem('mf_prealpha_cinematic_v2', 'test-seen');
      localStorage.setItem('mf_auth_gate_v1', '1');
    } catch (e) {}
  });
  await page.goto(url + '?assetskin=1&rosterCapture=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas'), g = c.getContext('webgl2');
    if (!g) return { renderer: 'NO-WEBGL2' };
    const d = g.getExtension('WEBGL_debug_renderer_info');
    return { renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : String(g.getParameter(g.RENDERER)) };
  });
  console.log('GPU: ' + gpu.renderer);
  if (/swiftshader|software|llvmpipe/i.test(gpu.renderer)) throw new Error('REFUSING: software renderer ' + gpu.renderer);

  await page.waitForFunction(() => typeof TYPES !== 'undefined' && typeof BT !== 'undefined' &&
    typeof spawnUnit === 'function' && typeof addBld === 'function' && typeof render === 'function', { timeout: 120000 });
  await page.waitForTimeout(800);
  await page.evaluate(dismiss);

  const inv = await page.evaluate(() => {
    const t2 = [0,1,9,18,10,2,3,6,7,11,16,19,20,21,22,23,24,27,32];
    const t1 = [0,1,9,10,19,24,32];
    const air = [5,17,25], naval = [14,15], exp = [8,26];
    const buildable = TYPES.map((T, i) => ({ i, name: T.name, cm: T.cm, cat: T.cat, hero: T.hero || null, brood: !!T.brood, air: !!T.air, naval: !!T.naval }))
      .filter(r => r.cm > 0);
    const packs = (kit, T) => {
      const out = [];
      if (!T) return out;
      for (const k of Object.keys(T)) {
        const p = T[k];
        out.push({ slot: k, id: p.id, source: p.source, maps: p.maps || null, assetSkin: p.assetSkin || null });
      }
      return out;
    };
    const innerName = (fn) => {
      const n = fn && fn.name || '';
      const m = n.match(/^(?:tfcBlue|domRed|coaGreen|brdPurple)\d+_(.+)$/);
      return m ? m[1] : n;
    };
    const share = {};
    const tris = {};
    for (const kit of ['nova', 'legion', 'syndicate', 'horde']) {
      const names = {};
      const kitTris = {};
      const table = (typeof FAC_KIT !== 'undefined' && FAC_KIT[kit]) || {};
      for (const ty of Object.keys(table)) {
        const fn = table[ty];
        if (!fn) continue;
        const inner = innerName(fn);
        (names[inner] = names[inner] || []).push(+ty);
        if (!kitTris[inner]) {
          try {
            const g = fn();
            kitTris[inner] = {
              hull: Math.round((g.hull ? g.hull.count : 0) / 3),
              tur: Math.round((g.tur ? g.tur.count : 0) / 3)
            };
          } catch (e) { kitTris[inner] = { err: String(e && e.message || e) }; }
        }
      }
      share[kit] = Object.entries(names).filter(([, s]) => s.length > 1)
        .map(([n, s]) => ({ builder: n, slots: s, tris: kitTris[n] }));
      tris[kit] = kitTris;
    }
    const instCap = (typeof FAC_MESH !== 'undefined' && FAC_MESH.nova && FAC_MESH.nova[1] && FAC_MESH.nova[1].hull)
      ? FAC_MESH.nova[1].hull.cap : null;
    return {
      types: TYPES.length,
      buildable: buildable.map(r => r.i + ' ' + r.name),
      buildableN: buildable.length,
      factoryT1: t1.map(i => TYPES[i].name),
      factoryT2: t2.map(i => TYPES[i].name),
      factoryT2n: t2.length,
      air, naval, exp,
      buildings: Object.keys(BT).filter(k => BT[k].cm > 0),
      popCap: typeof FACTION_POP_CAP !== 'undefined' ? FACTION_POP_CAP : null,
      maxInst: typeof MAX_INST !== 'undefined' ? MAX_INST : null,
      facMeshStartCap: instCap,
      bbIconCap: (typeof bbIcon !== 'undefined' && bbIcon) ? bbIcon.cap : 12000,
      sharedBuilders: share,
      hullTris: tris,
      novaPacks: packs('nova', typeof TFC_NOVA_BESPOKE_PACKS !== 'undefined' ? TFC_NOVA_BESPOKE_PACKS : null),
      broodPacks: packs('horde', typeof BRD_BESPOKE_PACKS !== 'undefined' ? BRD_BESPOKE_PACKS : null),
      legionPacks: packs('legion', typeof DOM_LEGION_BESPOKE_PACKS !== 'undefined' ? DOM_LEGION_BESPOKE_PACKS : null),
      synPacks: packs('syn', typeof COA_SYN_BESPOKE_PACKS !== 'undefined' ? COA_SYN_BESPOKE_PACKS : null)
    };
  });
  await writeFile(join(outDir, 'roster.json'), JSON.stringify(inv, null, 2));
  console.log('buildable units: ' + inv.buildableN + '  T2 factory cards: ' + inv.factoryT2n);
  const liveMaps = [].concat(inv.novaPacks, inv.broodPacks, inv.legionPacks, inv.synPacks).filter(p => p.maps);
  console.log('live map names: ' + liveMaps.map(p => p.maps + (p.assetSkin ? ' @' + p.assetSkin : '')).join(', '));

  /* Codex sheets decode async; cards stay on 3D bakes until then. */
  await page.waitForFunction(() => typeof MF_BM_URL !== 'undefined' && Object.keys(MF_BM_URL).length >= 4, { timeout: 25000 }).catch(() => {});
  await page.waitForFunction(() => {
    if (typeof MF_ASSET_TEX === 'undefined') return true;
    const recs = Object.values(MF_ASSET_TEX);
    return !recs.length || recs.every(r => r.ready || r.failed);
  }, { timeout: 20000 }).catch(() => {});

  /* ---- T2 factory menu (role-tabbed; comment still says eighteen) ---- */
  await page.setViewportSize({ width: 520, height: 1000 });
  await page.evaluate(() => {
    try { stopAttract(); } catch (e) {}
    attractOn = false; demoMode = true; matchLive = true; fogOn = false;
    running = true; paused = true; gameEnded = false;
    resetWorld();
    heroLvl = 99;
    playerFaction = 'nova';
    const cx = MAP * 0.5, cy = MAP * 0.5;
    addBld('techlab', 0, cx - 120, cy, true, 0);
    const F = addBld('fac', 0, cx, cy, true, 0);
    F.tier = 2; F.queue = [];
    openBld = blds.indexOf(F);
    try { if (typeof apClose === 'function') apClose(); } catch (e) {}
    for (const el of [...document.body.children]) el.style.display = 'none';
    const pm = document.getElementById('prodMenu');
    const bm = document.getElementById('buildMenu');
    if (pm) {
      pm.style.display = 'block'; pm.style.position = 'static';
      pm.style.transform = 'none'; pm.style.margin = '10px auto'; pm.style.maxHeight = 'none';
    }
    if (bm) bm.style.display = 'none';
    prodTab = 'veh';
    if (typeof renderProdMenu === 'function') renderProdMenu();
  });
  await page.waitForTimeout(400);
  await page.locator('#prodMenu').screenshot({ path: join(outDir, '01-factory-t2-menu.png') });
  console.log('wrote 01-factory-t2-menu.png');

  /* ---- 3D lineups. FACTIONS has no nova key — only legion/syndicate/horde. ---- */
  await page.setViewportSize({ width: 1000, height: 1000 });
  await page.evaluate(() => {
    try { stopAttract(); } catch (e) {}
    attractOn = false; demoMode = true; matchLive = true; fogOn = false;
    running = true; paused = true; gameEnded = false; shake = 0; dayT = 0.08;
    try { if (META && META.settings) META.settings.dayNight = false; } catch (e) {}
    if (typeof carrier !== 'undefined') { carrier.active = false; carrier.phase = 2; }
    camTick = () => camUpdateMatrices();
    document.body.className = '';
    document.documentElement.style.background = '#07111a';
    document.body.style.background = '#07111a';
    for (const el of [...document.body.children]) if (el.id !== 'gl') el.style.display = 'none';
    for (const el of document.querySelectorAll('#apOverlay,#loadScr,.screen,.overlay')) el.style.display = 'none';
    cv.style.display = 'block'; cv.style.filter = 'none';
    cv.style.position = 'fixed'; cv.style.inset = '0'; cv.style.width = '100vw'; cv.style.height = '100vh';
    resize();
    window.__t7clear = () => {
      ualive.fill(0); usel.fill(0); freeList = []; unitHigh = 0;
      teamCount[0] = teamCount[1] = teamCount[2] = 0;
      blds.length = 0;
      if (typeof rebuildBGrid === 'function') rebuildBGrid(true);
      if (typeof rebuildGrid === 'function') rebuildGrid();
      for (const a of [rocks, trees, crystals, deposits, geysers, relief, wrecks, crates, relics, craters, rubbles, birds, tanks]) a.length = 0;
      beams.length = 0; palive.fill(0); pHigh = 0; flife.fill(0); fCount = 0;
    };
    window.__t7line = (kit, slots, team, span) => {
      window.__t7clear();
      const cx = MAP * 0.5, cy = MAP * 0.5;
      if (kit === 'horde') {
        const F = FACTIONS.horde; AI.fac = 'horde';
        TEAMC[2][0] = F.col[0]; TEAMC[2][1] = F.col[1]; TEAMC[2][2] = F.col[2];
        TEAMB[2][0] = F.colB[0]; TEAMB[2][1] = F.colB[1]; TEAMB[2][2] = F.colB[2];
      } else {
        playerFaction = kit;
      }
      for (let k = 0; k < slots.length; k++) {
        const x = cx + (k - (slots.length - 1) / 2) * (slots.length > 4 ? 36 : 52);
        const i = spawnUnit(slots[k], team, x, cy);
        if (i >= 0) {
          ux[i] = utx[i] = x; uy[i] = uty[i] = cy;
          uang[i] = Math.PI * 0.74; uturr[i] = uang[i];
          ustate[i] = 0; umov[i] = 0; uwalk[i] = 1.1;
        }
      }
      cam.x = cx; cam.y = cy; camFollow = -1;
      camYaw = yawTarget = 0.66; camPitch = pitchTarget = 1.12;
      orthoSpan = distTarget = span;
      camUpdateMatrices();
      return slots.length;
    };
  });

  const lineup = async (name, kit, slots, team, span) => {
    await page.evaluate(({ kit, slots, team, span }) => window.__t7line(kit, slots, team, span),
      { kit, slots, team, span });
    await page.waitForTimeout(250);
    await page.evaluate(() => { try { render(1 / 60); render(1 / 60); } catch (e) {} });
    await page.waitForTimeout(120);
    await page.screenshot({ path: join(outDir, name), clip: { x: 80, y: 180, width: 840, height: 520 } });
    console.log('wrote ' + name);
  };

  await lineup('02-nova-launcher-filler.png', 'nova', [7, 20, 21, 27], 0, 240);
  await lineup('03-brood-spitter-splits.png', 'horde', [1, 2, 7, 10, 20, 21], 2, 220);

  /* Side-by-side medium tanks: Nova Rhino (unique maps) vs Brood Gorger (unique maps). */
  await page.evaluate(() => {
    window.__t7clear();
    playerFaction = 'nova';
    const F = FACTIONS.horde; AI.fac = 'horde';
    TEAMC[2][0] = F.col[0]; TEAMC[2][1] = F.col[1]; TEAMC[2][2] = F.col[2];
    TEAMB[2][0] = F.colB[0]; TEAMB[2][1] = F.colB[1]; TEAMB[2][2] = F.colB[2];
    const cx = MAP * 0.5, cy = MAP * 0.5;
    const a = spawnUnit(1, 0, cx - 38, cy);
    const b = spawnUnit(1, 2, cx + 38, cy);
    for (const i of [a, b]) {
      if (i < 0) continue;
      uang[i] = Math.PI * 0.74; uturr[i] = uang[i];
      ustate[i] = 0; umov[i] = 0; uwalk[i] = 1.1;
    }
    cam.x = cx; cam.y = cy; camFollow = -1;
    camYaw = yawTarget = 0.66; camPitch = pitchTarget = 1.12;
    orthoSpan = distTarget = 170;
    camUpdateMatrices();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { try { render(1 / 60); render(1 / 60); } catch (e) {} });
  await page.screenshot({ path: join(outDir, '04-nova-vs-brood-tanks.png'), clip: { x: 80, y: 140, width: 840, height: 640 } });
  console.log('wrote 04-nova-vs-brood-tanks.png');

  await lineup('05-brood-gorger.png', 'horde', [1], 2, 150);

  /* ---- strategic tacticons ---- */
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => {
    try { stopAttract(); } catch (e) {}
    attractOn = false; demoMode = true; matchLive = true; fogOn = false;
    running = true; paused = true; gameEnded = false;
    if (typeof window.__t7clear === 'function') window.__t7clear();
    else {
      ualive.fill(0); usel.fill(0); freeList = []; unitHigh = 0;
      teamCount[0] = teamCount[1] = teamCount[2] = 0;
      blds.length = 0;
      if (typeof rebuildBGrid === 'function') rebuildBGrid(true);
    }
    playerFaction = 'nova'; AI.fac = 'legion';
    const F = FACTIONS.legion;
    TEAMC[1][0] = F.col[0]; TEAMC[1][1] = F.col[1]; TEAMC[1][2] = F.col[2];
    TEAMB[1][0] = F.colB[0]; TEAMB[1][1] = F.colB[1]; TEAMB[1][2] = F.colB[2];
    const cx = MAP * 0.5, cy = MAP * 0.5;
    const rank = ['wall', 'turret', 'aatower', 'mex', 'pgen', 'fac', 'hq'];
    rank.forEach((ty, i) => addBld(ty, 0, cx - 280 + i * 80, cy - 80, true, 0));
    rank.forEach((ty, i) => addBld(ty, 1, cx - 280 + i * 80, cy + 80, true, 0));
    [0, 1, 2, 3, 9, 5, 4].forEach((t, k) => spawnUnit(t, 0, cx - 240 + k * 70, cy + 200));
    [0, 1, 2, 3, 9, 5, 4].forEach((t, k) => spawnUnit(t, 1, cx - 240 + k * 70, cy - 200));
    cam.x = cx; cam.y = cy; camFollow = -1;
    camYaw = yawTarget = 0; camPitch = pitchTarget = 1.45;
    orthoSpan = distTarget = (typeof SPAN_MAX !== 'undefined' ? SPAN_MAX : 3400);
    for (const el of [...document.body.children]) if (el.id !== 'gl') el.style.display = 'none';
    cv.style.display = 'block'; cv.style.position = 'fixed'; cv.style.inset = '0';
    cv.style.width = '100vw'; cv.style.height = '100vh';
    resize();
    camUpdateMatrices();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { try { render(1 / 60); render(1 / 60); } catch (e) {} });
  await page.screenshot({ path: join(outDir, '06-tacticons-strategic.png') });
  console.log('wrote 06-tacticons-strategic.png');

  const skins = await page.evaluate(() => {
    const meshes = {};
    for (const kit of ['nova', 'horde']) {
      meshes[kit] = {};
      const T = (typeof FAC_MESH !== 'undefined' && FAC_MESH[kit]) || {};
      for (const ty of Object.keys(T)) {
        const M = T[ty];
        meshes[kit][ty] = { hullMaps: !!(M && M.hull && M.hull.assetMaps), turMaps: !!(M && M.tur && M.tur.assetMaps) };
      }
    }
    const tex = {};
    if (typeof MF_ASSET_TEX !== 'undefined') {
      for (const k of Object.keys(MF_ASSET_TEX)) {
        const r = MF_ASSET_TEX[k];
        tex[k] = { ready: !!r.ready, failed: !!r.failed, reject: r.reject || null };
      }
    }
    return { meshes, tex, iconLast: typeof mfIconLast !== 'undefined' ? mfIconLast : null };
  });

  const uniqueMats = [...new Set(matGets)];
  const templateHits = uniqueMats.filter(u => /v2-(baseao|nre|masks)\.png/.test(u) &&
    !/nova-rhino-v2|nova-rhino-v2-turret|brood-gorger-v2/.test(u) &&
    !/mf[-_]|world-structures|microdetail|carbon-cracks/.test(u));
  const report = {
    gpu: gpu.renderer,
    buildableN: inv.buildableN,
    factoryT2n: inv.factoryT2n,
    popCap: inv.popCap,
    maxInst: inv.maxInst,
    facMeshStartCap: inv.facMeshStartCap,
    bbIconCap: inv.bbIconCap,
    sharedBuilders: inv.sharedBuilders,
    liveMaps: liveMaps,
    skins,
    materialRequests: uniqueMats,
    templateHits,
    errors: errs
  };
  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log('template map requests (should be empty): ' + templateHits.length);
  if (templateHits.length) console.log(templateHits.join('\n'));
  if (errs.length) console.log('page errors: ' + errs.length);
} finally {
  await browser.close();
  server.close();
}
