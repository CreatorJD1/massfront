#!/usr/bin/env node
/* ============================================================================
   STAGE 0 CAPTURE — War Table, Large force picker, HQ-drop battle HUD

   Playwright + real GPU (ABORT on SwiftShader). Writes PNGs under
   .tmp/stage0-YYYY-MM-DD/ then a human must Read the images.

   Complements tools/capture-overhaul-baseline.mjs (already on disk):
     .tmp/overhaul-baseline-2026-08-14/01..04
   This pass adds Large-theatre AI slots, HQ-drop framing, command dock.

   Usage: node tools/capture-stage0.mjs
   ============================================================================ */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'stage0-2026-08-14');
await mkdir(outDir, { recursive: true });

const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.mp3':'audio/mpeg', '.wav':'audio/wav',
  '.glb':'model/gltf-binary', '.gltf':'application/json', '.webmanifest':'application/manifest+json',
  '.wasm':'application/wasm'
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
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox', '--disable-software-rasterizer']
});

const shot = async (page, name) => {
  const p = join(outDir, name);
  await page.screenshot({ path: p, fullPage: false });
  console.log('wrote ' + p);
  return p;
};

const dismissChrome = () => {
  try { if (typeof apClose === 'function') apClose(); } catch (e) {}
  try { if (typeof apGateSatisfied === 'function') apGateSatisfied(); } catch (e) {}
  try { if (typeof stopAttract === 'function') stopAttract(); } catch (e) {}
  document.body.classList.add('mfIntroDone');
  for (const id of ['mfBootCover', 'apOverlay', 'loadScr', 'mfIntroSkip', 'mfIntroReplay']) {
    const el = document.getElementById(id);
    if (el) el.style.setProperty('display', 'none', 'important');
  }
  document.querySelectorAll('.mfTitleReveal').forEach(el => el.style.setProperty('display', 'none', 'important'));
};

try {
  const page = await browser.newPage({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark'
  });
  const errs = [];
  page.on('pageerror', e => { errs.push(e.message); console.log('ERR ' + e.message); });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mf_ap_gate_closed', '1');
      localStorage.setItem('mf_ap_dismissed', '1');
      localStorage.setItem('mf_offline', '1');
      localStorage.setItem('mf_prealpha_cinematic_v2', 'test-seen');
      localStorage.setItem('mf_auth_gate_v1', '1');
    } catch (e) {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas'), g = c.getContext('webgl2');
    if (!g) return { renderer: 'NO-WEBGL2' };
    const d = g.getExtension('WEBGL_debug_renderer_info');
    return { renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : String(g.getParameter(g.RENDERER)) };
  });
  console.log('UNMASKED_RENDERER_WEBGL: ' + gpu.renderer);
  if (/swiftshader|software|llvmpipe/i.test(gpu.renderer)) {
    throw new Error('REFUSING: software renderer ' + gpu.renderer);
  }

  await page.waitForFunction(() => typeof openPlanetarySetup === 'function' && typeof mfGalaxyReady !== 'undefined' && mfGalaxyReady === true && typeof PLANETS === 'object', { timeout: 120000 });
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch (e) {}
    try { if (typeof apGateSatisfied === 'function') apGateSatisfied(); } catch (e) {}
    try { if (typeof stopAttract === 'function') stopAttract(); } catch (e) {}
    document.body.classList.add('mfIntroDone');
    for (const id of ['mfBootCover', 'apOverlay', 'loadScr', 'mfIntroSkip', 'mfIntroReplay']) {
      const el = document.getElementById(id);
      if (el) el.style.setProperty('display', 'none', 'important');
    }
    document.querySelectorAll('.mfTitleReveal').forEach(el => el.style.setProperty('display', 'none', 'important'));
    openPlanetarySetup('standard');
    mfGalaxyYaw = 0.12;
    mfGalaxyPitch = -0.20;
    mfGalaxySetStage('galaxy');
  });
  await page.waitForSelector('#mfGalaxyCanvas', { timeout: 15000 });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    const sc = document.querySelector('#setupScr .setupScroll');
    const vp = document.querySelector('.mfGalaxyViewport');
    if (sc && vp) sc.scrollTop = Math.max(0, vp.offsetTop - 70);
    if (typeof mfGalaxyDraw === 'function') mfGalaxyDraw(performance.now());
  });
  await shot(page, '01-war-table-galaxy.png');

  await page.evaluate(() => {
    mfGalaxySelectSystem('sombrero', false);
    mfGalaxySetStage('system');
    mfGalaxyYaw = 0.18;
    mfGalaxyPitch = -0.12;
    if (typeof mfGalaxyDrawSystemView === 'function') mfGalaxyDrawSystemView(8000);
  });
  await page.waitForSelector('#mfSystemCanvas', { timeout: 8000 });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const sc = document.querySelector('#setupScr .setupScroll');
    const vp = document.querySelector('.mfSystemViewport');
    if (sc && vp) sc.scrollTop = Math.max(0, vp.offsetTop - 40);
    if (typeof mfGalaxyDrawSystemView === 'function') mfGalaxyDrawSystemView(8000);
  });
  await shot(page, '02-war-table-system.png');

  await page.evaluate(() => {
    planetYaw = 0.42;
    planetPitch = -0.08;
    mfGalaxySetStage('planet');
  });
  await page.waitForSelector('#mfPlanetCanvas', { timeout: 8000 });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const sc = document.querySelector('#setupScr .setupScroll');
    const vp = document.querySelector('.mfPlanetViewport');
    if (sc && vp) sc.scrollTop = Math.max(0, vp.offsetTop - 80);
    const cv = document.getElementById('mfPlanetCanvas');
    if (cv && typeof draw3DPlanetSphere === 'function') draw3DPlanetSphere(cv, mfGalaxyPlanetKey(), planetYaw, planetPitch, curRegionId);
  });
  await shot(page, '03-war-table-planet.png');

  /* Region row: Compact/Standard/Large sites. Unlock Large locally so the
     4-faction theatre card is visible; this is capture-only, not a save. */
  const regionInfo = await page.evaluate(() => {
    const P = PLANETS.aelos, R = P.regions[0];
    META.mapWins = META.mapWins || {};
    META.mapWins[R.maps[0]] = 1;
    META.mapWins[R.maps[1]] = 1;
    curRegionId = R.id;
    syncBattlefieldFromMap(R.maps[2]);
    if (typeof renderMapRow === 'function') renderMapRow();
    mfGalaxySetStage('region');
    const sc = document.querySelector('#setupScr .setupScroll');
    const host = document.getElementById('mfRegionMapHost') || document.getElementById('mapRow');
    if (sc && host) sc.scrollTop = Math.max(0, host.offsetTop - 40);
    return {
      maps: R.maps.slice(),
      preset: battlefieldPreset,
      cap: typeof battlefieldFactionCap === 'function' ? battlefieldFactionCap() : null,
      pop: typeof populationCapFor === 'function' ? populationCapFor(0) : null
    };
  });
  await page.waitForTimeout(400);
  await shot(page, '04-war-table-region-large.png');
  console.log('region ' + JSON.stringify(regionInfo));

  /* Deploy quick-setup (solo vs ally — 4 commanders are NOT on this surface). */
  await page.evaluate(() => {
    mfGalaxySetStage('deploy');
    if (typeof mfQuickRender === 'function') mfQuickRender();
    if (typeof mfGalaxySummary === 'function') mfGalaxySummary();
    const sc = document.querySelector('#setupScr .setupScroll');
    const q = document.getElementById('mfQuickSetup');
    if (sc && q) sc.scrollTop = Math.max(0, q.offsetTop - 20);
  });
  await page.waitForTimeout(250);
  await shot(page, '05-deploy-quick-setup.png');

  /* Large theatre: enable all 3 AI commanders, open Advanced Control so the
     spawn planner + AI COMMANDER 1/2/3 rows are on screen. */
  const forceInfo = await page.evaluate(() => {
    battlefieldPreset = 'large';
    playerStartZone = 'sw';
    aiSlots[0].on = true; aiSlots[0].ally = false; aiSlots[0].zone = 'ne'; aiSlots[0].diff = 1;
    aiSlots[1].on = true; aiSlots[1].ally = false; aiSlots[1].zone = 'nw'; aiSlots[1].diff = 1;
    aiSlots[2].on = true; aiSlots[2].ally = false; aiSlots[2].zone = 'se'; aiSlots[2].diff = 1;
    spawnPick = 'player';
    normalizeAiSlotsForBattlefield();
    renderSpawnPlanner();
    if (typeof mfQuickRender === 'function') mfQuickRender();
    const adv = document.getElementById('mfAdvanced');
    if (adv) adv.open = true;
    const sc = document.querySelector('#setupScr .setupScroll');
    const list = document.getElementById('aiSlotList');
    const map = document.getElementById('spawnMap');
    const target = map || list;
    if (sc && target) {
      const card = target.closest('.setupCard') || target;
      sc.scrollTop = Math.max(0, card.offsetTop - 8);
    }
    const fair = document.getElementById('spawnFairness');
    return {
      preset: battlefieldPreset,
      factionCap: battlefieldFactionCap(),
      aiCap: battlefieldAiCap(),
      slots: aiSlots.map(A => ({ on: A.on, ally: A.ally, zone: A.zone })),
      fairness: fair ? fair.innerText : '',
      popCap: populationCapFor(0)
    };
  });
  await page.waitForTimeout(350);
  await shot(page, '06-deploy-large-ai-slots.png');
  console.log('forces ' + JSON.stringify(forceInfo));

  /* Live match: compact civic map, infestation off. Camera ON the HQ drop
     (baseline 04 framed a city pad instead). Command dock visible. */
  let battle = { ok: false, reason: 'not attempted' };
  try {
    await page.evaluate(() => {
      infestationOn = false;
      fogOn = false;
      defenseFocus = 0;
      curMap = 'aelos_north_small';
      curTheme = 'verdant';
      curRegionId = 'aelos_north';
      battlefieldPreset = 'compact';
      deploymentPackage = 'prepared';
      if (typeof META !== 'undefined' && META.settings) {
        META.settings.fog = false;
        META.settings.dayNight = false;
      }
      dayT = 0.08;
      if (typeof hideFrontScreens === 'function') hideFrontScreens();
      const setup = document.getElementById('setupScr');
      if (setup) setup.style.display = 'none';
      document.body.classList.remove('menuMode', 'mfMenuOpen');
      document.body.dataset.frontScreen = '';
      newSkirmish();
    });
    await page.waitForFunction(() => typeof heightF !== 'undefined' && heightF && typeof terrainTex !== 'undefined' && terrainTex, { timeout: 90000 });
    await page.waitForTimeout(600);
    battle = await page.evaluate(() => {
      try { if (typeof apClose === 'function') apClose(); } catch (e) {}
      for (const id of ['pauseOverlay', 'gameOver', 'levelUp', 'loadScr', 'dispatch', 'apOverlay', 'setupScr']) {
        const e = document.getElementById(id); if (e) e.style.setProperty('display', 'none', 'important');
      }
      document.querySelectorAll('.mfTitleReveal,#mfIntroSkip,#mfIntroReplay').forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });
      demoMode = false; running = true; paused = false; fogOn = false; gameEnded = false;
      /* deployCarrier refuses unless the ship is in phase-1 hover. The
         harness used to call it during orbital descent, so HQ never spawned
         and the camera sat on empty grass. */
      if (typeof carrier !== 'undefined' && carrier) {
        carrier.active = true;
        carrier.phase = 1;
        carrier.alt = 0;
        carrier.clearance = 0;
      }
      let deployed = false, deployOk = false, deployWhy = '';
      try {
        deployOk = typeof carrierCanDeploy === 'function' && carrierCanDeploy();
        if (!deployOk && typeof carrier !== 'undefined') {
          const p = typeof carrierSnapPosition === 'function' ? carrierSnapPosition() : [carrier.x, carrier.y];
          deployWhy = 'blocked at ' + p[0] + ',' + p[1];
        }
        if (typeof deployCarrier === 'function') { deployCarrier(); deployed = true; }
      } catch (e) { deployWhy = String(e && e.message || e); }
      matchLive = true; paused = true;
      for (const id of ['toast', 'coach']) {
        const e = document.getElementById(id); if (e) { e.style.display = 'none'; e.textContent = ''; }
      }
      try { if (typeof clearFirstContactGuide === 'function') clearFirstContactGuide(); } catch (e) {}
      const hq = (typeof bldLive !== 'undefined' && bldLive)
        ? bldLive.find(B => B && B.alive && B.type === 'hq' && B.team === 0)
        : null;
      if (hq) { cam.x = hq.x; cam.y = hq.y; }
      else if (typeof carrier !== 'undefined') { cam.x = carrier.x; cam.y = carrier.y; }
      camFollow = -1;
      camYaw = yawTarget = 0.22;
      camPitch = pitchTarget = 1.05;
      orthoSpan = distTarget = 720;
      if (typeof showHudDock === 'function') showHudDock(true, 'orders');
      if (typeof clampCam === 'function') clampCam();
      if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
      if (typeof updateHUD === 'function') updateHUD(60);
      if (typeof render === 'function') render(0.016);
      const popEl = document.getElementById('unitV');
      return {
        ok: true, deployed, deployOk, deployWhy,
        hq: hq ? { x: hq.x, y: hq.y } : null,
        popText: popEl ? popEl.textContent : '',
        popCap: typeof populationCapFor === 'function' ? populationCapFor(0) : null,
        team0: typeof teamCount !== 'undefined' ? teamCount[0] : null,
        map: typeof curMap !== 'undefined' ? curMap : '',
        cam: { x: cam.x, y: cam.y, span: orthoSpan }
      };
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      if (typeof updateHUD === 'function') updateHUD(60);
      if (typeof render === 'function') render(0.016);
    });
    await shot(page, '07-battle-hq-drop.png');

    await page.evaluate(() => {
      if (typeof setHudDeck === 'function') setHudDeck('platoons', true);
      if (typeof updateHUD === 'function') updateHUD(60);
      if (typeof updateSelInfo === 'function') updateSelInfo();
      if (typeof render === 'function') render(0.016);
    });
    await page.waitForTimeout(200);
    await shot(page, '08-command-dock-platoons.png');

    /* City frame after HQ — same match, pan only. Documents minimap vs 3D. */
    await page.evaluate(() => {
      const cities = (typeof cityZones !== 'undefined' && cityZones) ? cityZones : [];
      const Z = cities[0];
      if (Z) { cam.x = Z.x; cam.y = Z.y; }
      camFollow = -1;
      orthoSpan = distTarget = 520;
      if (typeof setHudDeck === 'function') setHudDeck('orders', true);
      if (typeof showHudDock === 'function') showHudDock(true, 'orders');
      if (typeof clampCam === 'function') clampCam();
      if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
      if (typeof updateHUD === 'function') updateHUD(60);
      if (typeof render === 'function') render(0.016);
      try { mmBg = null; mmFrame = 0; } catch (e) {}
      if (typeof renderMinimap === 'function') renderMinimap();
      return { cities: cities.length };
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      if (typeof render === 'function') render(0.016);
      try { mmBg = null; mmFrame = 0; } catch (e) {}
      if (typeof renderMinimap === 'function') renderMinimap();
    });
    await shot(page, '09-battle-city-tactical.png');
  } catch (e) {
    battle = { ok: false, reason: String(e && e.message || e) };
    console.log('BATTLE SKIP: ' + battle.reason);
  }

  const report = { gpu: gpu.renderer, errs: errs.slice(0, 12), regionInfo, forceInfo, battle, outDir };
  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  server.close();
}
