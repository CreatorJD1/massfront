/* ============================================================================
   BROOD SILHOUETTE CAPTURE
       node tools/capture-brood-silhouettes.mjs

   The twelve slots that used to share mdlHordeSpitter and mdlHordeBombardier,
   rendered by the GAME's own renderer at the GAME's own camera angle, plus a
   line-up strip at play zoom where the whole claim actually has to hold.

   Self-contained: its own http.createServer over the repo root, so there is no
   external server to start. REAL GPU ONLY — headed Chrome on d3d11. It reads
   UNMASKED_RENDERER_WEBGL first and refuses to produce a screenshot at all if
   that matches swiftshader/software, because a software raster is not evidence
   about a shader-driven organic surface (docs/POSTMORTEM-1.33.31-REGRESSION.md).
   ============================================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = path.join(root, '.tmp', 'brood-silhouettes');
const outDir = path.join(root, 'releases');
const PORT = Number(process.argv[2] || 8123);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

await rm(tmpDir, { recursive: true, force: true });
await mkdir(tmpDir, { recursive: true });
await mkdir(outDir, { recursive: true });

/* The twelve, in the two groups they came from. */
const SUBJECTS = [
  { g: 'spitter', slot: 1,  animal: 'Gorger',      note: 'short + WIDE, low — frontal brow shield' },
  { g: 'spitter', slot: 2,  animal: 'Ramparthorn', note: 'long + wide, TALL — shoulder pauldrons' },
  { g: 'spitter', slot: 7,  animal: 'Skysting',    note: 'long + narrow — dorsal rack raked up' },
  { g: 'spitter', slot: 10, animal: 'Flakspine',   note: 'SHORT + narrow, TALL — vertical mast' },
  { g: 'spitter', slot: 20, animal: 'Bloomsac',    note: 'round + FAT, LOW — sac + burst ring' },
  { g: 'spitter', slot: 21, animal: 'Emberthroat', note: 'long + narrow — vane fan, drooping gullet' },
  { g: 'bombard', slot: 3,  animal: 'Mortarback',  note: 'SHORT + deep, hunched — up/back mortar' },
  { g: 'bombard', slot: 6,  animal: 'Lancespine',  note: 'VERY LONG + low — forward harpoon' },
  { g: 'bombard', slot: 16, animal: 'Siegemound',  note: 'wide + squat, LOW — vertical chimney' },
  { g: 'bombard', slot: 22, animal: 'Railfang',    note: 'long + narrow — braced forward lance' },
  { g: 'bombard', slot: 26, animal: 'Basilisk',    note: 'long + wide, tall — crown, one great eye' },
  { g: 'bombard', slot: 27, animal: 'Harbinger',   note: 'short + narrow, STILTS — hanging bell' },
];

/* The fourteen that still shared Beast / Leviathan / Flyer / Support / Swimmer. */
const REMAINING = [
  { g: 'beast',     slot: 0,  animal: 'Skitterling', note: 'SHORT + NARROW, low — dart mandibles' },
  { g: 'beast',     slot: 9,  animal: 'Brandmaw',    note: 'SHORT + WIDE, low — open furnace mouth' },
  { g: 'leviathan', slot: 4,  animal: 'Crownbeast',  note: 'long + WIDE, TALL — ring of sensory stalks' },
  { g: 'leviathan', slot: 8,  animal: 'Worldshell',  note: 'VERY LONG + WIDE, TALL — stacked dorsal plates' },
  { g: 'leviathan', slot: 18, animal: 'Furnaceback', note: 'wide + squat, LOW — twin flank heat sacs' },
  { g: 'flyer',     slot: 5,  animal: 'Stingwing',   note: 'compact DELTA, air — triangular wings + sting' },
  { g: 'flyer',     slot: 17, animal: 'Sacfly',      note: 'round + FAT, air — hanging bomb sac' },
  { g: 'flyer',     slot: 25, animal: 'Needlewren',  note: 'long + NARROW, air — swept needle wings' },
  { g: 'support',   slot: 11, animal: 'Bastioncrab', note: 'SHORT + WIDE, low — disc shield, NO weapon' },
  { g: 'support',   slot: 19, animal: 'Weaver',      note: 'mid + arms — reaching spinnerets, unarmed' },
  { g: 'support',   slot: 23, animal: 'Drumback',    note: 'round, mid — paired tympanic plates' },
  { g: 'support',   slot: 24, animal: 'Ichorleech',  note: 'NARROW, low — palps + flank sacs, unarmed' },
  { g: 'swimmer',   slot: 14, animal: 'Razorfinn',   note: 'long + NARROW, LOW — one tall dorsal keel' },
  { g: 'swimmer',   slot: 15, animal: 'Keelback',    note: 'VERY LONG + WIDE, LOW — row of chimney spines' },
];
const ALL = SUBJECTS.concat(REMAINING);

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const fp = path.join(root, u);
  if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});
await new Promise(r => server.listen(PORT, r));
console.log('serving ' + root + ' on http://127.0.0.1:' + PORT);

const browser = await launchPwBrowser({
  headless: false, executablePath: CHROME,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox'],
});
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

try {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(`http://127.0.0.1:${PORT}/?rosterCapture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof TYPES !== 'undefined' && typeof render === 'function' &&
    typeof FAC_MESH !== 'undefined' && typeof spawnUnit === 'function', { timeout: 60000 });
  await page.waitForTimeout(2500);

  /* GATE 1 — the renderer has to be real silicon or nothing below is evidence. */
  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2');
    if (!g) return { renderer: 'NO-WEBGL2', vendor: '' };
    const d = g.getExtension('WEBGL_debug_renderer_info');
    return { renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER),
             vendor: d ? g.getParameter(d.UNMASKED_VENDOR_WEBGL) : g.getParameter(g.VENDOR) };
  });
  console.log('GPU: ' + gpu.vendor + ' | ' + gpu.renderer);
  if (/swiftshader|software|llvmpipe/i.test(gpu.renderer)) {
    console.error('REFUSING: software renderer (' + gpu.renderer + '). No screenshot produced.');
    process.exitCode = 3;
    throw new Error('software-renderer');
  }

  /* GATE 2 — triangle counts, straight off the live builders the kit registered. */
  const tris = await page.evaluate(list => {
    const out = {};
    for (const s of list) {
      const fn = (FAC_KIT.horde && FAC_KIT.horde[s]) || null;
      if (!fn) { out[s] = { err: 'no builder' }; continue; }
      try {
        const g = fn();
        out[s] = { name: fn.name,
                   hull: Math.round((g.hull ? g.hull.count : 0) / 3),
                   tur: Math.round((g.tur ? g.tur.count : 0) / 3),
                   bones: g.hull ? (g.hull.bones || 0) : 0,
                   s: g.s || 1 };
      } catch (e) { out[s] = { err: String(e && e.message || e) }; }
    }
    return out;
  }, ALL.map(s => s.slot));

  /* Distinctness, measured rather than asserted: two slots that still share a
     builder produce byte-identical vertex buffers. */
  const dupes = await page.evaluate(list => {
    const hash = a => { let h = 2166136261 >>> 0;
      for (let k = 0; k < a.length; k += 7) { h ^= Math.round(a[k] * 4096) | 0; h = Math.imul(h, 16777619) >>> 0; }
      return (h >>> 0).toString(16); };
    const seen = {}, coll = [];
    for (const s of list) {
      const fn = FAC_KIT.horde[s]; if (!fn) continue;
      const g = fn(); const h = hash(g.hull.v) + ':' + g.hull.count;
      if (seen[h] !== undefined) coll.push([seen[h], s]); else seen[h] = s;
    }
    return coll;
  }, ALL.map(s => s.slot));

  /* The auth portal and the loader sit ON TOP of the canvas as their own DOM
     roots, so hiding every child of <body> is not enough — the first run of
     this harness produced twelve identical screenshots of the SIGN IN form.
     Dismiss them the way tools/verify-asset-unwrap.mjs does, then let the
     skirmish spin up before touching the world. */
  await page.evaluate(() => {
    for (const id of ['apOverlay', 'loadScr', 'authPortal', 'introScr']) {
      const e = document.getElementById(id); if (e) e.style.display = 'none';
    }
    try { hideFrontScreens(); } catch {}
    try { applyTheme(); } catch {}
    try { newSkirmish(); } catch {}
  });
  await page.waitForTimeout(9000);

  /* ---- scene control, lifted from tools/capture-live-roster.mjs ---- */
  await page.evaluate(() => {
    stopAttract(); resetWorld();
    attractOn = false; demoMode = true; matchLive = true; fogOn = false;
    running = true; paused = true; gameEnded = false; shake = 0; dayT = 0;
    carrier.active = false; carrier.phase = 2;
    camTick = () => camUpdateMatrices();
    document.body.className = '';
    document.documentElement.style.background = '#07111a';
    document.body.style.background = '#07111a';
    for (const el of [...document.body.children]) if (el.id !== 'gl') el.style.display = 'none';
    /* …and anything that re-parents itself elsewhere in the tree. */
    for (const el of document.querySelectorAll('#apOverlay,#loadScr,.screen,.overlay')) el.style.display = 'none';
    cv.style.display = 'block'; cv.style.filter = 'none';
    cv.style.position = 'fixed'; cv.style.inset = '0'; cv.style.width = '100vw'; cv.style.height = '100vh';
    resize();

    const clearScene = () => {
      ualive.fill(0); usel.fill(0); freeList = []; unitHigh = 0;
      teamCount[0] = teamCount[1] = teamCount[2] = 0;
      rebuildGrid(); blds.length = 0; rebuildBGrid(true);
      for (const a of [rocks, trees, crystals, deposits, geysers, relief, wrecks, crates, relics, craters, rubbles, birds, tanks]) a.length = 0;
      beams.length = 0; palive.fill(0); pHigh = 0; flife.fill(0); fCount = 0;
    };
    const broodColour = () => {
      const F = FACTIONS.horde; AI.fac = 'horde';
      TEAMC[2][0] = F.col[0]; TEAMC[2][1] = F.col[1]; TEAMC[2][2] = F.col[2];
      TEAMB[2][0] = F.colB[0]; TEAMB[2][1] = F.colB[1]; TEAMB[2][2] = F.colB[2];
    };
    const place = (ty, x, y, ang) => {
      const i = spawnUnit(ty, 2, x, y);
      ux[i] = utx[i] = x; uy[i] = uty[i] = y;
      uang[i] = ang; uturr[i] = ang;
      ustate[i] = 0; umov[i] = 0; uwalk[i] = 1.1;
      return i;
    };

    /* One animal, three-quarter hero angle — for reading the anatomy. */
    window.__broodSolo = (ty, yaw) => {
      clearScene(); broodColour();
      const cx = MAP * .5, cy = MAP * .5;
      place(ty, cx, cy, Math.PI * .74);
      rebuildGrid();
      cam.x = cx; cam.y = cy; camFollow = -1;
      camYaw = yawTarget = (yaw == null ? .66 : yaw); camPitch = pitchTarget = 1.12;
      orthoSpan = distTarget = Math.max(150, TYPES[ty].size * 4.3);
      camUpdateMatrices();
      return ty;
    };
    /* One animal, straight down the camera's own gameplay pitch — the PLAN
       silhouette, which is the only thing the player actually reads. */
    window.__broodPlan = ty => {
      clearScene(); broodColour();
      const cx = MAP * .5, cy = MAP * .5;
      place(ty, cx, cy, 0);
      rebuildGrid();
      cam.x = cx; cam.y = cy; camFollow = -1;
      camYaw = yawTarget = 0; camPitch = pitchTarget = 1.52;
      orthoSpan = distTarget = Math.max(150, TYPES[ty].size * 4.3);
      camUpdateMatrices();
      return ty;
    };
    /* All twelve in one line at PLAY zoom. If the split does not hold here it
       does not hold — this is the size they are fought at. */
    window.__broodLine = (list, span) => {
      clearScene(); broodColour();
      const cx = MAP * .5, cy = MAP * .5, n = list.length, step = 42;
      for (let k = 0; k < n; k++) place(list[k], cx + (k - (n - 1) / 2) * step, cy, Math.PI * .74);
      rebuildGrid();
      cam.x = cx; cam.y = cy; camFollow = -1;
      camYaw = yawTarget = .66; camPitch = pitchTarget = 1.20;
      orthoSpan = distTarget = span;
      camUpdateMatrices();
      return n;
    };
  });

  const shot = async (file, clip) => {
    await page.waitForTimeout(140);
    await page.evaluate(() => { render(1 / 60); render(1 / 60); });
    await page.waitForTimeout(140);
    await page.screenshot({ path: path.join(tmpDir, file), clip });
  };
  const CLIP = { x: 150, y: 130, width: 700, height: 700 };

  for (const s of ALL) {
    await page.evaluate(t => window.__broodSolo(t), s.slot);
    await shot(`solo-${String(s.slot).padStart(2, '0')}-${s.animal.toLowerCase()}.png`, CLIP);
    await page.evaluate(t => window.__broodPlan(t), s.slot);
    await shot(`plan-${String(s.slot).padStart(2, '0')}-${s.animal.toLowerCase()}.png`, CLIP);
    console.log('  captured ' + s.slot + ' ' + s.animal + '  tris=' + (tris[s.slot].hull ?? tris[s.slot].err));
  }

  for (const [g, span] of [['spitter', 300], ['bombard', 300],
                           ['beast', 220], ['leviathan', 280], ['flyer', 280],
                           ['support', 300], ['swimmer', 240]]) {
    const list = ALL.filter(s => s.g === g).map(s => s.slot);
    await page.evaluate(([l, sp]) => window.__broodLine(l, sp), [list, span]);
    await shot(`line-${g}.png`, { x: 60, y: 300, width: 880, height: 380 });
  }
  /* Play zoom: the game's own default span, all twelve, no help. */
  await page.evaluate(([l, sp]) => window.__broodLine(l, sp), [SUBJECTS.map(s => s.slot), 420]);
  await shot('line-playzoom.png', { x: 40, y: 320, width: 920, height: 330 });
  await page.evaluate(([l, sp]) => window.__broodLine(l, sp), [REMAINING.map(s => s.slot), 480]);
  await shot('line-playzoom-remaining.png', { x: 40, y: 320, width: 920, height: 330 });

  /* ---- contact sheet ---- */
  const sheet = await ctx.newPage();
  await sheet.setViewportSize({ width: 1960, height: 2400 });
  const card = s => {
    const t = tris[s.slot] || {};
    return `<article><div class="pair">
      <div class="f"><img src="http://127.0.0.1:${PORT}/.tmp/brood-silhouettes/solo-${String(s.slot).padStart(2, '0')}-${s.animal.toLowerCase()}.png"><span>3/4</span></div>
      <div class="f"><img src="http://127.0.0.1:${PORT}/.tmp/brood-silhouettes/plan-${String(s.slot).padStart(2, '0')}-${s.animal.toLowerCase()}.png"><span>PLAN</span></div>
      </div><h2>${String(s.slot).padStart(2, '0')} &middot; ${esc(s.animal)}</h2>
      <p>${esc(TYPES_NAME[s.slot] || '')} &middot; ${t.hull ?? '?'} tris &middot; ${t.bones ?? '?'} bones</p>
      <p class="n">${esc(s.note)}</p></article>`;
  };
  const TYPES_NAME = await page.evaluate(() => TYPES.map(t => t.name));
  const html = `<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;background:#05080e;color:#eef6ff;font-family:Arial,Helvetica,sans-serif}
    body{width:1960px;padding:26px 32px}
    header{padding:14px 22px;border:1px solid #6a4b93;background:#100a1a;margin-bottom:14px}
    h1{margin:0;color:#caa2ff;font-size:28px;letter-spacing:.10em}
    header p{margin:6px 0 0;color:#9c8fc0;font-size:12px;letter-spacing:.04em}
    h3{color:#caa2ff;font-size:15px;letter-spacing:.14em;margin:18px 0 8px}
    main{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
    article{border:1px solid #4b3a66;background:#0b0913}
    .pair{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#2a2038}
    .f{position:relative;height:210px;background:#07111a;overflow:hidden}
    .f img{width:100%;height:100%;object-fit:cover}
    .f span{position:absolute;left:4px;top:4px;font-size:9px;color:#8f7fb5;letter-spacing:.10em}
    h2{font-size:15px;margin:8px 10px 2px;color:#e2ccff}
    p{margin:0 10px 3px;color:#8ea3b8;font-size:10px;letter-spacing:.03em}
    p.n{color:#6f8399;margin-bottom:9px;text-transform:uppercase;font-size:9px}
    .strip{border:1px solid #4b3a66;background:#07111a;margin-top:8px}
    .strip img{width:100%;display:block}
  </style><body>
  <header><h1>BROOD — SPITTER / BOMBARDIER SILHOUETTE SPLIT</h1>
  <p>Twelve slots that shared two vertex buffers, now twelve builders &middot; live WebGL, ${esc(gpu.renderer)} &middot; game renderer, game camera</p></header>
  <h3>WAS mdlHordeSpitter &mdash; SLOTS 1, 2, 7, 10, 20, 21</h3>
  <main>${SUBJECTS.filter(s => s.g === 'spitter').map(card).join('')}</main>
  <div class="strip"><img src="http://127.0.0.1:${PORT}/.tmp/brood-silhouettes/line-spitter.png"></div>
  <h3>WAS mdlHordeBombardier &mdash; SLOTS 3, 6, 16, 22, 26, 27</h3>
  <main>${SUBJECTS.filter(s => s.g === 'bombard').map(card).join('')}</main>
  <div class="strip"><img src="http://127.0.0.1:${PORT}/.tmp/brood-silhouettes/line-bombard.png"></div>
  <h3>ALL TWELVE AT PLAY ZOOM &mdash; 420 SPAN, THE SIZE THEY ARE FOUGHT AT</h3>
  <div class="strip"><img src="http://127.0.0.1:${PORT}/.tmp/brood-silhouettes/line-playzoom.png"></div>
  </body>`;
  await sheet.setContent(html, { waitUntil: 'load' });
  await sheet.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth));
  const out = path.join(outDir, 'brood-silhouette-split.png');
  await sheet.screenshot({ path: out, fullPage: true });

  await sheet.setViewportSize({ width: 1960, height: 2800 });
  const html2 = `<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;background:#05080e;color:#eef6ff;font-family:Arial,Helvetica,sans-serif}
    body{width:1960px;padding:26px 32px}
    header{padding:14px 22px;border:1px solid #6a4b93;background:#100a1a;margin-bottom:14px}
    h1{margin:0;color:#caa2ff;font-size:28px;letter-spacing:.10em}
    header p{margin:6px 0 0;color:#9c8fc0;font-size:12px;letter-spacing:.04em}
    h3{color:#caa2ff;font-size:15px;letter-spacing:.14em;margin:18px 0 8px}
    main{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
    article{border:1px solid #4b3a66;background:#0b0913}
    .pair{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#2a2038}
    .f{position:relative;height:210px;background:#07111a;overflow:hidden}
    .f img{width:100%;height:100%;object-fit:cover}
    .f span{position:absolute;left:4px;top:4px;font-size:9px;color:#8f7fb5;letter-spacing:.10em}
    h2{font-size:15px;margin:8px 10px 2px;color:#e2ccff}
    p{margin:0 10px 3px;color:#8ea3b8;font-size:10px;letter-spacing:.03em}
    p.n{color:#6f8399;margin-bottom:9px;text-transform:uppercase;font-size:9px}
    .strip{border:1px solid #4b3a66;background:#07111a;margin-top:8px}
    .strip img{width:100%;display:block}
  </style><body>
  <header><h1>BROOD — REMAINING SHARED-BUILDER SPLIT</h1>
  <p>Fourteen slots that shared five vertex buffers, now fourteen builders &middot; live WebGL, ${esc(gpu.renderer)} &middot; game renderer, game camera</p></header>
  <h3>WAS mdlHordeBeast &mdash; SLOTS 0, 9</h3>
  <main>${REMAINING.filter(s => s.g === 'beast').map(card).join('')}</main>
  <div class="strip"><img src="http://127.0.0.1:${PORT}/.tmp/brood-silhouettes/line-beast.png"></div>
  <h3>WAS mdlHordeLeviathan &mdash; SLOTS 4, 8, 18</h3>
  <main>${REMAINING.filter(s => s.g === 'leviathan').map(card).join('')}</main>
  <div class="strip"><img src="http://127.0.0.1:${PORT}/.tmp/brood-silhouettes/line-leviathan.png"></div>
  <h3>WAS mdlHordeFlyer &mdash; SLOTS 5, 17, 25</h3>
  <main>${REMAINING.filter(s => s.g === 'flyer').map(card).join('')}</main>
  <div class="strip"><img src="http://127.0.0.1:${PORT}/.tmp/brood-silhouettes/line-flyer.png"></div>
  <h3>WAS mdlHordeSupport &mdash; SLOTS 11, 19, 23, 24</h3>
  <main>${REMAINING.filter(s => s.g === 'support').map(card).join('')}</main>
  <div class="strip"><img src="http://127.0.0.1:${PORT}/.tmp/brood-silhouettes/line-support.png"></div>
  <h3>WAS mdlHordeSwimmer &mdash; SLOTS 14, 15</h3>
  <main>${REMAINING.filter(s => s.g === 'swimmer').map(card).join('')}</main>
  <div class="strip"><img src="http://127.0.0.1:${PORT}/.tmp/brood-silhouettes/line-swimmer.png"></div>
  <h3>ALL FOURTEEN AT PLAY ZOOM &mdash; 480 SPAN</h3>
  <div class="strip"><img src="http://127.0.0.1:${PORT}/.tmp/brood-silhouettes/line-playzoom-remaining.png"></div>
  </body>`;
  await sheet.setContent(html2, { waitUntil: 'load' });
  await sheet.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth));
  const out2 = path.join(outDir, 'brood-silhouette-remaining.png');
  await sheet.screenshot({ path: out2, fullPage: true });

  console.log('\nTRIANGLES  (floor 2000 / target 5000 / ceiling 10000)');
  let bad = 0;
  for (const s of ALL) {
    const t = tris[s.slot] || {};
    const n = t.hull ?? 0;
    const flag = t.err ? 'ERR ' + t.err : n < 2000 ? 'UNDER FLOOR' : n > 10000 ? 'OVER CEILING' : 'ok';
    if (flag !== 'ok') bad++;
    console.log('  ' + String(s.slot).padStart(2) + ' ' + s.animal.padEnd(13) + String(n).padStart(6) + '  bones ' + String(t.bones ?? 0).padStart(3) + '  ' + flag);
  }
  console.log(dupes.length ? '\nDUPLICATE GEOMETRY: ' + JSON.stringify(dupes) : '\nno two slots share a vertex buffer');
  if (errors.length) console.error('\nPAGE ERRORS:\n  ' + errors.join('\n  '));
  console.log('\ncontact sheet -> ' + out);
  console.log('remaining sheet -> ' + out2);
  if (bad) process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
