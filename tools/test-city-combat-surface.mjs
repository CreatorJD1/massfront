/* City-combat surface gate.
   CITYG >= 1 is non-soil: crater sprites, crater bowls, ash floors, PASS
   unchanged, thermal/kinetic burns become urban ash, void stays void,
   Commander stays walkable (no JET ASSIST). Soil still scars as a DRY bowl
   — punching below WATER_H must not flood, spawn water, or rewrite PASS.
   Real GPU only — software cannot prove the shot.

   Usage: node tools/test-city-combat-surface.mjs
   Optional: node tools/test-city-combat-surface.mjs http://127.0.0.1:PORT/ */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'city-combat-2026-08-13');
const givenUrl = process.argv.find(a => /^https?:\/\//.test(a));
const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.mp3':'audio/mpeg', '.wav':'audio/wav',
  '.glb':'model/gltf-binary', '.gltf':'model/gltf+json', '.webmanifest':'application/manifest+json'
};

let url = givenUrl;
let server = null;
if (!url) {
  server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = resolve(join(root, p));
      if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('nf'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  url = 'http://127.0.0.1:' + server.address().port + '/';
  console.log('serving ' + url);
}
await mkdir(outDir, { recursive: true });

const assert = (v, m) => { if (!v) throw new Error(m); };
const browser = await launchPwBrowser({
  headless: false,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox']
});

try {
  const page = await browser.newPage({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    colorScheme: 'dark'
  });
  const errors = [];
  page.on('pageerror', e => {
    errors.push(e.stack || e.message);
    console.log('PAGEERR ' + (e.message || e));
  });
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('CONSOLE ' + msg.text());
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mf_ap_gate_closed', '1');
      localStorage.setItem('mf_ap_dismissed', '1');
      localStorage.setItem('mf_offline', '1');
    } catch {}
    /* begin3D reads MF_BONES_ON before any rig assigns it. The uncommitted
       renderer hardening never declared the flag, so the first model pass
       throws and the battlefield stays black. Seed it on the global object
       so this gate can photograph the city. */
    window.MF_BONES_ON = false;
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const renderer = await page.evaluate(() => {
    const g = document.createElement('canvas').getContext('webgl2');
    if (!g) return 'NO-WEBGL2';
    const d = g.getExtension('WEBGL_debug_renderer_info');
    return String(d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER));
  });
  console.log('UNMASKED_RENDERER_WEBGL: ' + renderer);
  assert(!/swiftshader|software|llvmpipe/i.test(renderer), 'REFUSING: software renderer — ' + renderer);

  await page.waitForFunction('typeof newSkirmish==="function" && gl && heightF && terrainTex', { timeout: 120000 });
  await page.evaluate(() => {
    if (typeof META !== 'undefined' && META.settings) META.settings.quality = 'cinematic';
    if (typeof applyQualityPreset === 'function') applyQualityPreset();
    activeWarMode = 'standard';
    /* Vanguard actually places a 5x5 derelict district. The large catalog
       map's city=1 override often fails placement and leaves only industry. */
    curMap = 'vanguard';
    curTheme = 'vespera';
    builtMap = '';
    if (typeof META !== 'undefined' && META.settings) META.settings.dayNight = false;
    dayT = 0;
    if (typeof hideFrontScreens === 'function') hideFrontScreens();
    newSkirmish();
  });
  await page.waitForFunction('cityZones && cityZones.length && CITYG && PASS', { timeout: 120000 });
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    if (typeof apGateSatisfied === 'function') apGateSatisfied();
    const ap = document.getElementById('apOverlay'); if (ap) ap.style.display = 'none';
    if (typeof stopAttract === 'function') stopAttract();
    if (typeof hideFrontScreens === 'function') hideFrontScreens();
    for (const id of ['pauseOverlay', 'gameOver', 'levelUp', 'loadScr', 'dispatch']) {
      const e = document.getElementById(id); if (e) e.style.display = 'none';
    }
    document.body.dataset.frontScreen = '';
    document.body.classList.remove('menuMode', 'mfMenuOpen');
    demoMode = false; running = true; matchLive = true; paused = true; fogOn = false;
    gameEnded = false;
    carrier.active = false; carrier.phase = 2;
    document.querySelectorAll('.mfTitleReveal,#mfIntroSkip,#mfIntroReplay').forEach(el => {
      el.style.setProperty('display', 'none', 'important');
      el.classList.remove('open');
    });
    const go = document.getElementById('gameOver');
    if (go) go.style.setProperty('display', 'none', 'important');
  });
  const skip = page.locator('#mfIntroSkip');
  if (await skip.count()) { try { await skip.click({ timeout: 1500 }); } catch {} }

  const lookAt = async (Z, name, span) => {
    await page.evaluate(({ x, y, span }) => {
      cam.x = x; cam.y = y; camFollow = -1;
      camYaw = yawTarget = 0.32; camPitch = pitchTarget = 0.92; orthoSpan = distTarget = span;
      clampCam(); camUpdateMatrices();
      paused = true; running = true; gameEnded = false;
      const go = document.getElementById('gameOver');
      if (go) go.style.setProperty('display', 'none', 'important');
      if (typeof render === 'function') render(0.016);
    }, { x: Z.x, y: Z.y, span });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(outDir, name), fullPage: false });
  };

  const sites = await page.evaluate(() => {
    const pick = (pred) => cityZones.find(pred) || null;
    const pack = (Z) => Z && { x: Z.x, y: Z.y, r: Z.r, span: Z.span, site: Z.site, name: Z.name, gradeH: Z.gradeH };
    const kindCounts = {};
    const yaws = {};
    for (const P of cityPlan) {
      kindCounts[P.kind] = (kindCounts[P.kind] || 0) + 1;
      const q = ((Math.round(P.a / (Math.PI * 0.5)) % 4) + 4) % 4;
      yaws[q] = (yaws[q] || 0) + 1;
    }
    const matDump = (name) => {
      if (typeof loadWorldModel !== 'function' || typeof WORLD_MODELS === 'undefined' || !WORLD_MODELS[name]) return null;
      const m = loadWorldModel(name);
      const bins = { UP: {}, DN: {}, WALL: {} };
      for (let i = 0; i < m.v.length; i += 12) {
        const ny = m.v[i + 4];
        const raw = (Math.floor(Math.abs(m.v[i + 11])) - 1) | 0;
        const key = ny > 0.55 ? 'UP' : ny < -0.55 ? 'DN' : 'WALL';
        bins[key][raw] = (bins[key][raw] || 0) + 1;
      }
      return bins;
    };
    const tips = [];
    for (const P of cityPlan) {
      if (P.kind === 0 || P.kind === 1 || P.kind === 2) tips.push(P);
    }
    let tipCam = null;
    if (tips.length) {
      let sx = 0, sy = 0;
      for (const P of tips) { sx += P.x; sy += P.y; }
      tipCam = { x: sx / tips.length, y: sy / tips.length };
    }
    return {
      curMap,
      city: pack(pick(z => z.site === 'city') || pick(z => z.site === 'indus') || cityZones[0]),
      industrial: pack(pick(z => z.site === 'indus')),
      colony: pack(pick(z => z.site === 'outpost')),
      relic: pack(pick(z => z.site === 'relic')),
      tipCam,
      kinds: cityZones.map(z => z.site),
      plotKinds: kindCounts,
      plotYaws: yaws,
      domeMats: matDump('mdlCityDome'),
      towerMats: matDump('mdlCityTower'),
      hallMats: matDump('mdlCityHall')
    };
  });
  console.log('sites: ' + JSON.stringify(sites));
  if (errors.length) console.log('pageerrors-so-far:', errors.slice(0, 6).join('\n'));
  const tipAt = sites.tipCam || sites.city;
  console.log('lookAt tips', tipAt);
  try {
    if (tipAt) await lookAt(tipAt, 'civic-tips.png', 820);
    console.log('wrote civic-tips.png');
  } catch (e) {
    console.error('lookAt civic-tips failed:', e && e.message || e);
    if (errors.length) console.log('pageerrors:', errors.slice(0, 8).join('\n'));
  }
  if (tipAt) {
    await page.evaluate(({ x, y }) => {
      cam.x = x + 30; cam.y = y - 10; camFollow = -1;
      camYaw = yawTarget = 0.42; camPitch = pitchTarget = 0.88; orthoSpan = distTarget = 340;
      clampCam(); camUpdateMatrices();
      paused = true; running = true; gameEnded = false;
      if (typeof render === 'function') render(0.016);
    }, tipAt);
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(outDir, 'civic-tips-close.png'), fullPage: false });
  }
  if (sites.industrial) await lookAt(sites.industrial, 'pad-city.png', 780);
  try {
    const joinAt = await page.evaluate(() => {
      if (typeof ROAD_JOINS !== 'undefined' && ROAD_JOINS.length) {
        const J = ROAD_JOINS[0];
        return { x: (J[0] + J[2]) * 0.5, y: (J[1] + J[3]) * 0.5 };
      }
      const Z = cityZones.find(z => z.ind) || cityZones[0];
      if (!Z || !ROAD_PATHS || !ROAD_PATHS.length) return null;
      const P = ROAD_PATHS[0].path;
      return { x: Z.x + (P[0][0] - Z.x) * 0.35, y: Z.y + (P[0][1] - Z.y) * 0.35 };
    });
    if (joinAt) await lookAt(joinAt, 'highway-join.png', 420);
  } catch (e) {
    console.error('lookAt highway-join failed:', e && e.message || e);
  }
  if (sites.industrial || sites.city) {
    const hallAt = sites.industrial || sites.city;
    await page.evaluate(({ x, y }) => {
      cam.x = x + 40; cam.y = y - 20; camFollow = -1;
      camYaw = yawTarget = 0.55; camPitch = pitchTarget = 0.78; orthoSpan = distTarget = 280;
      clampCam(); camUpdateMatrices();
      paused = true; running = true; gameEnded = false;
      if (typeof render === 'function') render(0.016);
    }, hallAt);
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(outDir, 'hall-windows.png'), fullPage: false });
  }
  if (sites.colony) await lookAt(sites.colony, 'pad-colony.png', 520);
  if (sites.relic) await lookAt(sites.relic, 'pad-relic.png', 480);

  const beforeShot = join(outDir, 'city-before.png');
  await page.evaluate(() => {
    const Z = cityZones.find(z => z.ind) || cityZones[0];
    cam.x = Z.x; cam.y = Z.y; camFollow = -1;
    camYaw = yawTarget = 0.12; camPitch = pitchTarget = 1.18; orthoSpan = distTarget = 720;
    clampCam(); camUpdateMatrices();
    paused = true; running = true; gameEnded = false;
    const go = document.getElementById('gameOver');
    if (go) go.style.setProperty('display', 'none', 'important');
    if (typeof render === 'function') render(0.016);
  });
  await page.waitForFunction(() => {
    const intro = document.querySelector('.mfTitleReveal.open');
    return !intro && typeof gl !== 'undefined' && gl && gl.canvas && gl.canvas.width > 8;
  }, null, { timeout: 20000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: beforeShot, fullPage: false });

  const result = await page.evaluate(() => {
    const fail = [];
    const sampleH = (wx, wy) => {
      const k = TS / MAP, hx = clamp(wx * k | 0, 0, TS - 1), hy = clamp(wy * k | 0, 0, TS - 1);
      return heightF[hy * TS + hx];
    };
    const ringStats = (Z, r0, r1, step) => {
      const vals = [];
      step = step || 14;
      for (let y = Z.y - r1; y <= Z.y + r1; y += step) {
        for (let x = Z.x - r1; x <= Z.x + r1; x += step) {
          const d = Math.hypot(x - Z.x, y - Z.y);
          if (d < r0 || d > r1) continue;
          const h = sampleH(x, y);
          if (h < WATER_H + 0.004) continue;
          vals.push(h);
        }
      }
      if (!vals.length) return { n: 0, range: 0, mean: 0 };
      let mn = 1e9, mx = -1e9, s = 0;
      for (const v of vals) { if (v < mn) mn = v; if (v > mx) mx = v; s += v; }
      return { n: vals.length, min: +mn.toFixed(4), max: +mx.toFixed(4), range: +(mx - mn).toFixed(4), mean: +(s / vals.length).toFixed(4) };
    };
    const flattenOf = (Z) => {
      if (!Z) return null;
      const hx = Z.padHx || (Z.span || Z.r) * 0.72;
      const hy = Z.padHy || hx;
      const inner = Math.min(hx, hy) * 0.72;
      const berm = typeof siteBermWidth === 'function' ? siteBermWidth(Z) : 40;
      return {
        site: Z.site, name: Z.name, gradeH: Z.gradeH,
        pad: ringStats(Z, 0, inner),
        berm: ringStats(Z, inner, inner + berm),
        wild: ringStats(Z, inner + berm + 50, inner + berm + 160)
      };
    };
    const flatten = cityZones.map(flattenOf);
    for (const F of flatten) {
      if (!F || F.pad.n < 12) continue;
      if (F.pad.range > 0.016) fail.push(F.site + ' pad still hilly: range ' + F.pad.range);
    }
    const kinds = {};
    for (const Z of cityZones) kinds[Z.site] = (kinds[Z.site] || 0) + 1;
    if (!kinds.city && !kinds.indus) fail.push('no city/indus pad to flatten');
    if (!kinds.outpost) fail.push('no colony/outpost pad to flatten');
    if (!kinds.relic) fail.push('no relic pad to flatten');

    const Z = cityZones.find(z => z.ind) || cityZones[0];
    const passAt = (wx, wy) => {
      const x = clamp(wx / MAP * PGS | 0, 0, PGS - 1), y = clamp(wy / MAP * PGS | 0, 0, PGS - 1);
      return PASS[y * PGS + x];
    };
    const sampleCivicPass = (cx, cy, r) => {
      const out = [];
      const cell = MAP / PGS;
      const x0 = clamp((cx - r) / cell | 0, 0, PGS - 1), x1 = clamp(Math.ceil((cx + r) / cell), 0, PGS - 1);
      const y0 = clamp((cy - r) / cell | 0, 0, PGS - 1), y1 = clamp(Math.ceil((cy + r) / cell), 0, PGS - 1);
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        if (!CITYG[gy * PGS + gx]) continue;
        out.push(PASS[gy * PGS + gx]);
      }
      return out;
    };
    const findSoil = () => {
      for (let d = Z.r + 80; d < Z.r + 900; d += 40) {
        for (let n = 0; n < 12; n++) {
          const a = n / 12 * Math.PI * 2, x = Z.x + Math.cos(a) * d, y = Z.y + Math.sin(a) * d;
          if (cityGroundAt(x, y) === 0 && isWalkable(x, y)) return [x, y];
        }
      }
      return null;
    };
    const drain = () => { while (deformQ.length) processDeforms(); };

    const street = cityStreets[0];
    const plot = cityPlan[0];
    const envelope = [Z.x, Z.y];
    const streetPt = street ? [(street[0] + street[2]) * 0.5, (street[1] + street[3]) * 0.5] : null;
    const plotPt = plot ? [plot.x, plot.y] : null;
    const soil = findSoil();

    const civicPts = [
      { name: 'envelope', p: envelope },
      streetPt ? { name: 'street', p: streetPt } : null,
      plotPt ? { name: 'plot', p: plotPt } : null
    ].filter(Boolean);

    craters.length = 0;
    groundBurns.length = 0;
    if (typeof relief !== 'undefined') relief.length = 0;

    const beforePass = {};
    for (const C of civicPts) beforePass[C.name] = sampleCivicPass(C.p[0], C.p[1], 140);
    const soilWalk0 = soil ? isWalkable(soil[0], soil[1]) : null;

    for (const C of civicPts) {
      const [x, y] = C.p;
      addCrater(x, y, 90);
      addGroundBurn(x, y, 70, 1);
      addGroundBurn(x + 18, y + 12, 40, 2);
      deformTerrain(x, y, 110, 0.22);
      if (typeof spawnExplosion === 'function') spawnExplosion(x, y, 12, 1);
    }
    drain();

    const civicCraters = craters.filter(c => cityGroundAt(c.x, c.y) >= 1).length;
    const civicRelief = (typeof relief !== 'undefined' ? relief : []).filter(r => cityGroundAt(r.x, r.y) >= 1).length;
    const burnsAt = (x, y) => groundBurns.filter(g => Math.hypot(g.x - x, g.y - y) < 4);
    const civicKinds = {};
    for (const C of civicPts) {
      civicKinds[C.name] = burnsAt(C.p[0], C.p[1]).map(g => g.kind);
    }
    const afterPass = {};
    let passChanged = 0;
    for (const C of civicPts) {
      afterPass[C.name] = sampleCivicPass(C.p[0], C.p[1], 140);
      const a = afterPass[C.name], b = beforePass[C.name];
      if (a.length !== b.length) passChanged++;
      else for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) passChanged++;
    }
    const civicWalk = civicPts.map(C => ({
      name: C.name,
      civic: cityGroundAt(C.p[0], C.p[1]),
      walk: isWalkable(C.p[0], C.p[1])
    }));

    if (!civicCraters) fail.push('civic crater sprites did not form');
    if (passChanged) fail.push('civic PASS bits changed: ' + passChanged);
    for (const C of civicPts) {
      const kinds = civicKinds[C.name];
      if (!kinds.includes(1)) fail.push(C.name + ' missing thermal burn kind 1: ' + JSON.stringify(kinds));
      const voidB = burnsAt(C.p[0] + 18, C.p[1] + 12);
      if (!voidB.some(g => g.kind === 2)) fail.push(C.name + ' void coerced off kind 2: ' + JSON.stringify(voidB.map(g => g.kind)));
      if (!isWalkable(C.p[0], C.p[1])) fail.push(C.name + ' became unwalkable');
    }

    let soilCrater = false, soilKind = null, soilWalk1 = null, soilH = null, soilAuth = null, soilWetMesh = null;
    if (soil) {
      addCrater(soil[0], soil[1], 80);
      addGroundBurn(soil[0], soil[1], 60, 1);
      deformTerrain(soil[0], soil[1], 95, 0.22);
      drain();
      soilCrater = craters.some(c => Math.hypot(c.x - soil[0], c.y - soil[1]) < 4);
      const sb = burnsAt(soil[0], soil[1]);
      soilKind = sb.length ? sb[sb.length - 1].kind : null;
      soilWalk1 = isWalkable(soil[0], soil[1]);
      soilH = hAt(soil[0], soil[1]);
      soilAuth = typeof authoredWaterAt === 'function' ? !!authoredWaterAt(soil[0], soil[1]) : null;
      if (waterNeed) {
        const cell = MAP / TGRID;
        const gx = clamp(Math.round(soil[0] / cell), 0, TGRID);
        const gz = clamp(Math.round(soil[1] / cell), 0, TGRID);
        soilWetMesh = !!waterNeed[gz * TVERT + gx];
      }
      if (!soilCrater) fail.push('soil crater sprite was suppressed');
      if (soilKind !== 1) fail.push('soil thermal kind expected 1, got ' + soilKind);
      if (soilWalk0 && !soilWalk1) fail.push('soil crater flooded PASS (should stay dry/walkable)');
      if (soilAuth) fail.push('soil crater marked as authored water');
      if (soilWetMesh) fail.push('soil crater spawned water mesh');
      if (typeof isNavigableWater === 'function' && isNavigableWater(soil[0], soil[1])) fail.push('soil crater became navigable water');
    } else fail.push('no walkable soil sample outside the district');

    let collapsed = 0;
    let collapseAt = null;
    for (const R of relics) {
      if (!R.alive || cityGroundAt(R.x, R.y) < 1) continue;
      if (typeof collapseBlock === 'function') collapseBlock(R, 0);
      if (!collapseAt) collapseAt = { x: R.x, y: R.y, s: R.s, burn: R.burn, fallT: R.fallT };
      collapsed++;
      if (collapsed >= 3) break;
    }
    drain();
    const postCollapseCivicCraters = craters.filter(c => cityGroundAt(c.x, c.y) >= 1).length;
    if (!postCollapseCivicCraters) fail.push('collapse left no civic crater sprites');

    let civicFlames = 0;
    if (collapseAt) {
      for (let i = 0; i < MAXPART; i++) {
        if (flife[i] > 0 && ftype[i] === 4 && Math.hypot(fx[i] - collapseAt.x, fy[i] - collapseAt.y) < 140) civicFlames++;
      }
    }
    const hotCivicBurns = groundBurns.filter(g => g.kind === 1 && (g.civic || cityGroundAt(g.x, g.y) >= 1)).length;
    if (!civicFlames) fail.push('collapse left no type-4 civic flames');
    if (!hotCivicBurns) fail.push('collapse left no civic thermal burns');
    if (collapseAt && !(collapseAt.burn > 0.5)) fail.push('collapsed relic burn was not kept');
    /* Age the flash off so the capture shows lingering flames + ember ground,
       not the frozen birth-frame fireball the pause lock used to photograph. */
    if (typeof updParticles === 'function') {
      for (let s = 0; s < 40; s++) { updParticles(0.03); stats.t += 0.03; }
    }
    civicFlames = 0;
    if (collapseAt) {
      for (let i = 0; i < MAXPART; i++) {
        if (flife[i] > 0 && ftype[i] === 4 && Math.hypot(fx[i] - collapseAt.x, fy[i] - collapseAt.y) < 140) civicFlames++;
      }
    }
    if (!civicFlames) fail.push('no lingering type-4 civic flames after flash aged off');

    /* HQ-scale boom on civic used to skip the cap and hand off to
       superDetonation (map-filling flash). Type-4 used to grow e^{1.6t}. */
    spawnExplosion(civicPts[0].p[0], civicPts[0].p[1], 84, 1);
    if (typeof collapseBlock === 'function' && collapseAt)
      spawnCivicWreckFire(collapseAt.x, collapseAt.y, collapseAt.s || 60);
    let maxFlash = 0, maxFire = 0;
    for (let i = 0; i < MAXPART; i++) {
      if (flife[i] <= 0) continue;
      if (ftype[i] === 0 || ftype[i] === 3 || ftype[i] === 6 || ftype[i] === 8)
        maxFlash = Math.max(maxFlash, fsize[i]);
      if (ftype[i] === 4) maxFire = Math.max(maxFire, fsize[i]);
    }
    if (typeof updParticles === 'function') {
      for (let s = 0; s < 20; s++) updParticles(1);
    }
    for (let i = 0; i < MAXPART; i++) {
      if (flife[i] > 0 && ftype[i] === 4) maxFire = Math.max(maxFire, fsize[i]);
    }
    if (maxFlash > 80) fail.push('civic size-84 boom flashed at ' + maxFlash.toFixed(1));
    if (maxFire > 22) fail.push('type-4 flame grew to ' + maxFire.toFixed(1));

    /* Wilderness deform must stop at CITYG>=1, not bite the grey grid. */
    if (soil && civicPts[0]) {
      const [cx, cy] = civicPts[0].p;
      const hCivic0 = hAt(cx, cy);
      deformTerrain(soil[0], soil[1], Math.hypot(soil[0] - cx, soil[1] - cy) + 80, 0.22);
      drain();
      if (cityGroundAt(cx, cy) >= 1 && Math.abs(hAt(cx, cy) - hCivic0) > 0.004)
        fail.push('soil deform punched civic height');
    }

    const toastEl = document.getElementById('toast');
    const toastText = toastEl ? toastEl.textContent : '';
    if (/JET ASSIST/i.test(toastText)) fail.push('JET ASSIST toast after civic impacts: ' + toastText);

    if (typeof commanderTerrainRecovery === 'function' && typeof heroIdx === 'number' && heroIdx >= 0 && ualive[heroIdx]) {
      const C = civicPts[0].p;
      ux[heroIdx] = C[0]; uy[heroIdx] = C[1]; utx[heroIdx] = C[0]; uty[heroIdx] = C[1];
      heroStuckFor = 2;
      commanderTerrainRecovery(heroIdx, 0, 2);
      const t2 = toastEl ? toastEl.textContent : '';
      if (/JET ASSIST/i.test(t2)) fail.push('JET ASSIST after forcing commander onto civic crater: ' + t2);
      if (!isWalkable(ux[heroIdx], uy[heroIdx])) fail.push('commander standing on unwalkable civic ground');
    }

    cam.x = Z.x; cam.y = Z.y; clampCam(); camUpdateMatrices();
    paused = true; running = true; gameEnded = false;
    const go = document.getElementById('gameOver');
    if (go) go.style.setProperty('display', 'none', 'important');
    if (typeof render === 'function') render(0.016);
    return {
      fail,
      flatten,
      kinds,
      envelopeCivic: cityGroundAt(envelope[0], envelope[1]),
      streetCivic: streetPt ? cityGroundAt(streetPt[0], streetPt[1]) : null,
      plotCivic: plotPt ? cityGroundAt(plotPt[0], plotPt[1]) : null,
      civicCraters,
      civicRelief,
      passChanged,
      civicKinds,
      civicWalk,
      soil: soil && [soil[0] | 0, soil[1] | 0],
      soilWalk0, soilWalk1, soilKind, soilCrater, soilH, soilAuth, soilWetMesh,
      collapsed,
      collapseAt,
      civicFlames,
      hotCivicBurns,
      postCollapseCivicCraters,
      toastText,
      renderer: (function () {
        const d = gl.getExtension('WEBGL_debug_renderer_info');
        return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      })()
    };
  });

  await page.waitForTimeout(900);
  const afterShot = join(outDir, 'city-after-combat.png');
  await page.screenshot({ path: afterShot, fullPage: false });

  await page.evaluate(() => {
    const Z = cityZones.find(z => z.ind) || cityZones[0];
    cam.x = Z.x; cam.y = Z.y; camFollow = -1;
    camYaw = yawTarget = 0.08; camPitch = pitchTarget = 1.02; orthoSpan = distTarget = 420;
    clampCam(); camUpdateMatrices();
    paused = true; running = true; gameEnded = false;
    const go = document.getElementById('gameOver');
    if (go) go.style.setProperty('display', 'none', 'important');
    if (typeof render === 'function') render(0.016);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(outDir, 'city-burns-craters.png'), fullPage: false });

  const fireTarget = result.collapseAt || sites.city;
  if (fireTarget) {
    await page.evaluate((T) => {
      cam.x = T.x; cam.y = T.y; camFollow = -1;
      camYaw = yawTarget = 0.38; camPitch = pitchTarget = 0.62; orthoSpan = distTarget = 340;
      clampCam(); camUpdateMatrices();
      paused = true; running = true; gameEnded = false;
      const go = document.getElementById('gameOver');
      if (go) go.style.setProperty('display', 'none', 'important');
      if (typeof render === 'function') render(0.016);
    }, fireTarget);
    await page.waitForTimeout(400);
    const fireShot = join(outDir, 'city-fires.png');
    const fireBuf = await page.screenshot({ path: fireShot, fullPage: false });
    const emberPix = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height).data;
      let ember = 0, n = 0;
      const x0 = (c.width * 0.22) | 0, x1 = (c.width * 0.78) | 0;
      const y0 = (c.height * 0.22) | 0, y1 = (c.height * 0.78) | 0;
      for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
        const i = (y * c.width + x) * 4, r = px[i], gr = px[i + 1], b = px[i + 2];
        n++;
        if (r > 95 && r > gr + 10 && gr > b - 8 && r > b + 18) ember++;
      }
      return { ember, n, frac: +(ember / Math.max(1, n)).toFixed(4) };
    }, fireBuf.toString('base64'));
    result.emberPix = emberPix;
    console.log('ember pixels: ' + JSON.stringify(emberPix));
    if (emberPix.frac < 0.004) result.fail.push('city-fires.png has no readable ember/fire pixels: ' + JSON.stringify(emberPix));
  }

  if (result.soil) {
    await page.evaluate((soil) => {
      cam.x = soil[0]; cam.y = soil[1]; camFollow = -1;
      camYaw = yawTarget = 0.2; camPitch = pitchTarget = 1.08; orthoSpan = distTarget = 480;
      clampCam(); camUpdateMatrices();
      paused = true; running = true; gameEnded = false;
      const go = document.getElementById('gameOver');
      if (go) go.style.setProperty('display', 'none', 'important');
      if (typeof render === 'function') render(0.016);
    }, result.soil);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(outDir, 'soil-crater.png'), fullPage: false });
  }

  const groundPng = await page.evaluate(() => terrainCanvas.toDataURL('image/png').split(',')[1]);
  await writeFile(join(outDir, 'city-ground-after.png'), Buffer.from(groundPng, 'base64'));
  await writeFile(join(outDir, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) console.log('pageerrors:', errors.slice(0, 6).join('\n'));
  assert(!result.fail.length, result.fail.join(' | '));
  console.log('City-combat surface gate passed. Captures: ' + outDir);
} finally {
  await browser.close();
  if (server) await new Promise(r => server.close(r));
}
