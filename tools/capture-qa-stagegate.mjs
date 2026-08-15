#!/usr/bin/env node
/* ============================================================================
   QA STAGE-GATE CAPTURE — system dock, 1K pop HUD, city vs minimap

   Writes a NEW dated folder so overhaul-baseline / stage0 are not raced.
   Usage: node tools/capture-qa-stagegate.mjs
   Output: .tmp/qa-stagegate-2026-08-14/
     01-system-dock.png          scrollTop 0 — War Room / gold Enter must be on screen
     02-system-orbit.png         orbit canvas (one homeworld + lore rocks)
     03-battle-city-tactical.png city pad; minimap vs paved 3D
     04-battle-hq-pop.png        HQ + pop chip n / 1K
   ============================================================================ */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'qa-stagegate-2026-08-14');
await mkdir(outDir, { recursive: true });

const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.mp3':'audio/mpeg', '.wav':'audio/wav',
  '.glb':'model/gltf-binary', '.gltf':'model/gltf+json', '.webmanifest':'application/manifest+json',
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
const url = 'http://127.0.0.1:' + server.address().port + '/';
console.log('serving ' + url);

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await launchPwBrowser({
  executablePath: chrome, headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox']
});

const shot = async (page, name) => {
  const p = join(outDir, name);
  await page.screenshot({ path: p, fullPage: false });
  console.log('wrote ' + p);
  return p;
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

  await page.waitForFunction(() => typeof openPlanetarySetup === 'function' && typeof mfGalaxyReady !== 'undefined' && mfGalaxyReady === true && typeof PLANETS === 'object', null, { timeout: 120000 });
  await page.waitForTimeout(300);

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
    mfGalaxySelectSystem('sombrero', false);
    mfGalaxyYaw = 0.18;
    mfGalaxyPitch = -0.12;
    mfGalaxySetStage('system');
  });
  await page.waitForSelector('#mfSystemCanvas', { timeout: 8000 });
  /* Dock first: do not scroll the canvas over the footer. */
  await page.evaluate(() => {
    const sc = document.querySelector('#setupScr .setupScroll');
    if (sc) sc.scrollTop = 0;
    if (typeof mfGalaxyDrawSystemView === 'function') mfGalaxyDrawSystemView(8000);
  });
  await page.waitForTimeout(250);
  await shot(page, '01-system-dock.png');

  const dock = await page.evaluate(() => {
    const foot = document.querySelector('#setupScr .setupFoot');
    const back = document.getElementById('setupBack');
    const launch = document.getElementById('setupStart');
    const enter = document.querySelector('[data-mf-sys-enter] span');
    const lore = document.querySelector('[data-mf-sys-lore] span');
    const hexBack = document.querySelector('[data-mf-sys-back] span');
    const cs = foot ? getComputedStyle(foot) : null;
    return {
      backText: back ? back.textContent.trim() : '',
      launchText: launch ? launch.textContent.trim() : '',
      enterHex: enter ? enter.textContent.trim() : '',
      learnMoreHex: lore ? lore.textContent.trim() : '',
      hexBack: hexBack ? hexBack.textContent.trim() : '',
      footDisplay: cs ? cs.display : 'missing',
      footVisible: !!(foot && cs && cs.display !== 'none' && cs.visibility !== 'hidden'),
      popCap: typeof populationCapFor === 'function' ? populationCapFor(0) : null
    };
  });

  await page.evaluate(() => {
    const sc = document.querySelector('#setupScr .setupScroll');
    const vp = document.querySelector('.mfSystemViewport');
    if (sc && vp) sc.scrollTop = Math.max(0, vp.offsetTop - 40);
    if (typeof mfGalaxyDrawSystemView === 'function') mfGalaxyDrawSystemView(8000);
  });
  await page.waitForTimeout(200);
  await shot(page, '02-system-orbit.png');

  let battle = { ok: false, reason: 'not attempted' };
  try {
    await page.evaluate(() => {
      infestationOn = false;
      fogOn = false;
      defenseFocus = 0;
      curMap = 'aelos_north_small';
      curTheme = 'verdant';
      curRegionId = 'aelos_north';
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
    await page.waitForFunction(() => typeof carrier !== 'undefined' && carrier && carrier.active && carrier.phase === 1, { timeout: 30000 });
    await page.waitForTimeout(200);
    battle = await page.evaluate(() => {
      try { if (typeof apClose === 'function') apClose(); } catch (e) {}
      for (const id of ['pauseOverlay', 'gameOver', 'levelUp', 'loadScr', 'dispatch', 'apOverlay', 'setupScr']) {
        const e = document.getElementById(id); if (e) e.style.setProperty('display', 'none', 'important');
      }
      demoMode = false; running = true; paused = false; fogOn = false; gameEnded = false;
      try { if (typeof deployCarrier === 'function') deployCarrier(); } catch (e) {}
      matchLive = true; paused = true;
      for (const id of ['toast', 'coach']) {
        const e = document.getElementById(id); if (e) { e.style.display = 'none'; e.textContent = ''; }
      }
      try { if (typeof clearFirstContactGuide === 'function') clearFirstContactGuide(); } catch (e) {}
      if (typeof refreshBldLive === 'function') refreshBldLive();
      const cities = (typeof cityZones !== 'undefined' && cityZones) ? cityZones : [];
      const Z = cities[0];
      if (Z) { cam.x = Z.x; cam.y = Z.y; }
      camFollow = -1;
      camYaw = yawTarget = 0.28;
      camPitch = pitchTarget = 0.95;
      orthoSpan = distTarget = 520;
      if (typeof showHudDock === 'function') showHudDock(true, 'orders');
      if (typeof clampCam === 'function') clampCam();
      if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
      if (typeof updateHUD === 'function') updateHUD(60);
      if (typeof render === 'function') render(0.016);
      const popEl = document.getElementById('unitV');
      const mm = document.getElementById('minimap') || document.querySelector('#mm,canvas#mm,canvas.minimap');
      return {
        ok: true,
        cities: cities.length,
        map: curMap,
        theme: curTheme,
        mapTheme: (MAPDEFS[curMap] && MAPDEFS[curMap].theme) || '',
        popText: popEl ? popEl.textContent : '',
        popCap: typeof populationCapFor === 'function' ? populationCapFor(0) : null,
        team0: teamCount[0],
        minimapId: mm ? mm.id : '',
        cam: { x: cam.x, y: cam.y, span: orthoSpan }
      };
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => { if (typeof updateHUD === 'function') updateHUD(60); if (typeof render === 'function') render(0.016); });
    await shot(page, '03-battle-city-tactical.png');

    battle.hq = await page.evaluate(() => {
      if (typeof refreshBldLive === 'function') refreshBldLive();
      const hq = (blds || []).find(B => B && B.alive && B.type === 'hq' && B.team === 0) || null;
      if (hq) { cam.x = hq.x; cam.y = hq.y; }
      camFollow = -1;
      camYaw = yawTarget = 0.22;
      camPitch = pitchTarget = 1.05;
      orthoSpan = distTarget = 720;
      if (typeof clampCam === 'function') clampCam();
      if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
      if (typeof updateHUD === 'function') updateHUD(60);
      if (typeof render === 'function') render(0.016);
      const popEl = document.getElementById('unitV');
      return {
        found: !!hq,
        popText: popEl ? popEl.textContent : '',
        popCap: typeof populationCapFor === 'function' ? populationCapFor(0) : null
      };
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => { if (typeof updateHUD === 'function') updateHUD(60); if (typeof render === 'function') render(0.016); });
    await shot(page, '04-battle-hq-pop.png');
  } catch (e) {
    battle = Object.assign(battle || {}, { ok: false, reason: String(e && e.message || e) });
    console.log('BATTLE SKIP: ' + battle.reason);
  }

  const popOk = !!(battle && battle.hq && /\/ ?1K\b/.test(battle.hq.popText) && !/4K/.test(battle.hq.popText));
  const dockOk = !!(dock.footVisible && /WAR ROOM/i.test(dock.backText) && /ENTER AELOS/i.test(dock.launchText));
  const report = {
    gpu: gpu.renderer, errs: errs.slice(0, 12), outDir, dock, battle,
    gates: {
      warRoomEnterAelos: dockOk,
      popHud1K: popOk,
      popCap1000: (battle && battle.popCap) === 1000,
      consoleClean: errs.length === 0
    }
  };
  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  server.close();
}
