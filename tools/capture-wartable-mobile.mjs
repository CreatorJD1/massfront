#!/usr/bin/env node
/* Phone 412×915 War Table recapture. Writes .tmp/wartable-mobile-YYYY-MM-DD/
   so stage0 / planner folders are not raced. Do not commit. */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', process.argv[2] || 'wartable-mobile-2026-08-14');
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

const footMetrics = () => {
  const foot = document.querySelector('#setupScr .setupFoot');
  const back = document.getElementById('setupBack');
  const launch = document.getElementById('setupStart');
  const cs = foot ? getComputedStyle(foot) : null;
  const br = back ? back.getBoundingClientRect() : null;
  const lr = launch ? launch.getBoundingClientRect() : null;
  return {
    stage: typeof mfGalaxyStage !== 'undefined' ? mfGalaxyStage : '',
    backText: back ? back.textContent.replace(/\s+/g, ' ').trim() : '',
    launchText: launch ? launch.textContent.replace(/\s+/g, ' ').trim() : '',
    footDisplay: cs ? cs.display : 'missing',
    grid: cs ? cs.gridTemplateColumns : '',
    backW: br ? Math.round(br.width) : 0,
    launchW: lr ? Math.round(lr.width) : 0,
    widthDelta: (br && lr) ? Math.abs(Math.round(br.width) - Math.round(lr.width)) : null,
    equalWidth: !!(br && lr && Math.abs(br.width - lr.width) <= 2),
    y: br ? Math.round(br.y) : null
  };
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

  await page.waitForFunction(() =>
    typeof openPlanetarySetup === 'function' &&
    typeof mfGalaxyReady !== 'undefined' && mfGalaxyReady === true &&
    typeof PLANETS === 'object', null, { timeout: 120000 });
  await page.waitForTimeout(300);

  const shot = async (name) => {
    const p = join(outDir, name);
    await page.screenshot({ path: p, fullPage: false });
    console.log('wrote ' + p);
    return p;
  };
  const shotEl = async (sel, name) => {
    const h = await page.$(sel);
    if (!h) { console.log('skip ' + name + ': no ' + sel); return; }
    const p = join(outDir, name);
    await h.screenshot({ path: p, timeout: 8000 });
    console.log('wrote ' + p);
  };

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
    mfGalaxyYaw = 0.12;
    mfGalaxyPitch = -0.20;
    mfGalaxySetStage('galaxy');
    if (typeof mfGalaxyStopAnim === 'function') mfGalaxyStopAnim();
    const sc = document.querySelector('#setupScr .setupScroll');
    if (sc) sc.scrollTop = 0;
    if (typeof mfGalaxyDraw === 'function') mfGalaxyDraw(performance.now());
  });
  await page.waitForSelector('#mfGalaxyCanvas', { timeout: 15000 });
  await page.waitForTimeout(200);
  await shot('01-galaxy-dock.png');
  await shotEl('#setupScr .setupFoot', '01b-galaxy-foot.png');
  const galaxy = await page.evaluate(footMetrics);
  console.log('galaxy ' + JSON.stringify(galaxy));

  await page.evaluate(() => {
    mfGalaxySelectSystem('sombrero', false);
    mfGalaxySetStage('system');
    if (typeof mfGalaxyStopAnim === 'function') mfGalaxyStopAnim();
    const sc = document.querySelector('#setupScr .setupScroll');
    if (sc) sc.scrollTop = 0;
    /* Fixed clock so Aelos sits on the ellipse, sun stays screen-center.
       t=12000 → ~103° from 3 o'clock (upper-left of the ring). */
    if (typeof mfGalaxyDrawSystemView === 'function') mfGalaxyDrawSystemView(12000);
  });
  await page.waitForSelector('#mfSystemCanvas', { timeout: 8000 });
  await page.waitForTimeout(180);
  await shot('02-system-dock.png');
  await shotEl('#mfSystemCanvas', '02b-system-orbit.png');
  await shotEl('#setupScr .setupFoot', '02c-system-foot.png');
  const system = await page.evaluate(() => {
    const foot = (function () {
      const footEl = document.querySelector('#setupScr .setupFoot');
      const back = document.getElementById('setupBack');
      const launch = document.getElementById('setupStart');
      const cs = footEl ? getComputedStyle(footEl) : null;
      const br = back ? back.getBoundingClientRect() : null;
      const lr = launch ? launch.getBoundingClientRect() : null;
      return {
        stage: mfGalaxyStage,
        backText: back ? back.textContent.replace(/\s+/g, ' ').trim() : '',
        launchText: launch ? launch.textContent.replace(/\s+/g, ' ').trim() : '',
        footDisplay: cs ? cs.display : 'missing',
        grid: cs ? cs.gridTemplateColumns : '',
        backW: br ? Math.round(br.width) : 0,
        launchW: lr ? Math.round(lr.width) : 0,
        widthDelta: (br && lr) ? Math.abs(Math.round(br.width) - Math.round(lr.width)) : null,
        equalWidth: !!(br && lr && Math.abs(br.width - lr.width) <= 2)
      };
    })();
    const cv = document.getElementById('mfSystemCanvas');
    const home = (mfSystemTargets && mfSystemTargets[0]) || null;
    return Object.assign(foot, {
      canvas: cv ? { w: cv.width, h: cv.height } : null,
      home: home ? { key: home.key, x: Math.round(home.x), y: Math.round(home.y), r: Math.round(home.r) } : null,
      sunFixed: true
    });
  });
  console.log('system ' + JSON.stringify(system));

  await page.evaluate(() => {
    planetYaw = 0.42;
    planetPitch = -0.08;
    mfGalaxySetStage('planet');
    const sc = document.querySelector('#setupScr .setupScroll');
    if (sc) sc.scrollTop = 0;
    const cv = document.getElementById('mfPlanetCanvas');
    if (cv && typeof draw3DPlanetSphere === 'function') draw3DPlanetSphere(cv, mfGalaxyPlanetKey(), planetYaw, planetPitch, curRegionId);
  });
  await page.waitForSelector('#mfPlanetCanvas', { timeout: 8000 });
  await page.waitForTimeout(200);
  await shot('03-planet-dock.png');
  await shotEl('#mfPlanetCanvas', '03b-planet-globe.png');
  await shotEl('#setupScr .setupFoot', '03c-planet-foot.png');
  const planet = await page.evaluate(footMetrics);
  console.log('planet ' + JSON.stringify(planet));

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
    await page.waitForFunction(() => typeof heightF !== 'undefined' && heightF && typeof terrainTex !== 'undefined' && terrainTex, null, { timeout: 90000 });
    await page.waitForFunction(() => typeof carrier !== 'undefined' && carrier && carrier.active && carrier.phase === 1, null, { timeout: 30000 });
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
      return {
        ok: true,
        cities: cities.length,
        map: curMap,
        theme: curTheme,
        popText: popEl ? popEl.textContent : '',
        popCap: typeof populationCapFor === 'function' ? populationCapFor(0) : null
      };
    });
    await page.waitForTimeout(350);
    await page.evaluate(() => { if (typeof updateHUD === 'function') updateHUD(60); if (typeof render === 'function') render(0.016); });
    await shot('04-battle-city-tactical.png');
    const mm = await page.$('#minimap') || await page.$('canvas#mm') || await page.$('#mm');
    if (mm) {
      const p = join(outDir, '04b-minimap.png');
      await mm.screenshot({ path: p, timeout: 8000 });
      console.log('wrote ' + p);
    } else {
      console.log('skip 04b-minimap.png: no minimap node');
    }
  } catch (e) {
    battle = Object.assign(battle || {}, { ok: false, reason: String(e && e.message || e) });
    console.log('BATTLE SKIP: ' + battle.reason);
  }

  const report = {
    gpu: gpu.renderer,
    viewport: { w: 412, h: 915 },
    errs: errs.slice(0, 12),
    galaxy, system, planet, battle,
    gates: {
      galaxyWarRoomEnterSombrero: !!(/WAR ROOM/i.test(galaxy.backText) && /ENTER SOMBRERO/i.test(galaxy.launchText)),
      galaxyEqualWidth: !!galaxy.equalWidth,
      systemWarRoomEnterAelos: !!(/WAR ROOM/i.test(system.backText) && /ENTER AELOS/i.test(system.launchText)),
      systemEqualWidth: !!system.equalWidth,
      planetPreviousOpenRegion: !!(/PREVIOUS/i.test(planet.backText) && /OPEN REGION/i.test(planet.launchText)),
      planetEqualWidth: !!planet.equalWidth,
      consoleClean: errs.length === 0
    }
  };
  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  server.close();
}
