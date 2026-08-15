#!/usr/bin/env node
/* ============================================================================
   OVERHAUL BASELINE CAPTURE  —  War Table + optional city battle frame

   Future updates in this workstream MUST dump screenshots the same way:
     Playwright + real GPU (ABORT on SwiftShader), PNGs under
     .tmp/overhaul-baseline-YYYY-MM-DD/ with clear names, then Read the
     images and report what is actually on screen vs what was asked.
   Do not ship a progress update in this workstream without those PNGs.

   Usage: node tools/capture-overhaul-baseline.mjs
   Output: .tmp/overhaul-baseline-2026-08-14/
     01-war-table-galaxy.png
     02-war-table-system.png
     02b-system-learn-more.png     (CONTINUE / LEARN MORE hex pair)
     03-war-table-planet.png
     04-battle-city-tactical.png   (skipped if terrain gen overruns)
     05-battle-hq-pop.png          (HQ framing + 1K pop HUD)
     report.json, checklist.json
   ============================================================================ */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'overhaul-baseline-2026-08-14');
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

try {
  const page = await browser.newPage({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark'
  });
  const errs = [];
  const consoles = [];
  page.on('pageerror', e => { errs.push(e.message); console.log('ERR ' + e.message); });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      consoles.push(t);
      console.log('CONSOLE ' + t);
    }
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
  const galaxy = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('#mfWorldStrip .mfWorldChip')].map(b => ({
      nm: (b.querySelector('b') || b).textContent.trim(),
      sub: (b.querySelector('small') || { textContent: '' }).textContent.trim(),
      locked: b.classList.contains('locked'),
      on: b.classList.contains('on')
    }));
    const cont = document.getElementById('mfConquestContinue');
    const launch = document.getElementById('setupStart');
    const catalog = (typeof mfGalaxyCatalog === 'function') ? mfGalaxyCatalog() : {};
    const order = (typeof MF_GALAXY_SYSTEM_ORDER !== 'undefined') ? MF_GALAXY_SYSTEM_ORDER.slice() : [];
    return {
      chips,
      continueText: cont ? cont.innerText.replace(/\s+/g, ' ').trim() : '',
      launchText: launch ? launch.textContent.trim() : '',
      systems: order.map(id => ({ id, nm: catalog[id] && catalog[id].nm, home: catalog[id] && catalog[id].home, star: catalog[id] && catalog[id].star })),
      fourCount: order.length
    };
  });

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
  const system = await page.evaluate(() => {
    const enter = document.querySelector('[data-mf-sys-enter] span');
    const lore = document.querySelector('[data-mf-sys-lore] span');
    const launch = document.getElementById('setupStart');
    const sub = document.querySelector('.mfSystemSub');
    const S = (typeof mfGalaxySystem === 'function') ? mfGalaxySystem() : {};
    const fillers = (typeof MF_SYSTEM_FILLERS !== 'undefined' && MF_SYSTEM_FILLERS[S.id]) || [];
    const planets = (typeof systemPlanets === 'function') ? systemPlanets(S.id) : [];
    return {
      enterText: enter ? enter.textContent.trim() : '',
      learnMoreText: lore ? lore.textContent.trim() : '',
      launchText: launch ? launch.textContent.trim() : '',
      subtitle: sub ? sub.textContent.trim() : '',
      home: S.home || '',
      star: S.star || '',
      loreBodies: fillers.map(F => ({ kind: F.kind, ring: F.ring })),
      planetKeysInSystem: planets,
      targetCount: (typeof mfSystemTargets !== 'undefined') ? mfSystemTargets.length : -1
    };
  });
  await page.evaluate(() => {
    if (typeof mfGalaxyToggleSystemLore === 'function') mfGalaxyToggleSystemLore();
  });
  await page.waitForTimeout(200);
  await shot(page, '02b-system-learn-more.png');
  const loreOpen = await page.evaluate(() => {
    const dos = document.getElementById('mfSystemDossier');
    const extra = document.querySelector('.mfSysLoreExtra');
    const loreBtn = document.querySelector('[data-mf-sys-lore]');
    return {
      dossierLoreOpen: !!(dos && dos.classList.contains('loreOpen')),
      extraVisible: !!(extra && getComputedStyle(extra).display !== 'none'),
      loreOn: !!(loreBtn && loreBtn.classList.contains('loreOn')),
      extraText: extra ? extra.innerText.replace(/\s+/g, ' ').trim().slice(0, 240) : ''
    };
  });

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
  const planet = await page.evaluate(() => {
    const P = (typeof mfGalaxyPlanet === 'function') ? mfGalaxyPlanet() : {};
    const chips = [...document.querySelectorAll('#mfRegionStrip .mfRegionChip')].map(b => ({
      nm: (b.querySelector('b') || b).textContent.trim(),
      sub: (b.querySelector('small') || { textContent: '' }).textContent.trim(),
      locked: b.classList.contains('locked'),
      on: b.classList.contains('on')
    }));
    const launch = document.getElementById('setupStart');
    const stats = [...document.querySelectorAll('.mfPlanetStats b')].map(b => b.textContent.trim());
    return {
      key: (typeof mfGalaxyPlanetKey === 'function') ? mfGalaxyPlanetKey() : '',
      nm: P.nm || '',
      regionCount: (P.regions || []).length,
      regionNames: (P.regions || []).map(R => R.nm),
      chips,
      launchText: launch ? launch.textContent.trim() : '',
      stats,
      siblingWorldsOnGlobe: false
    };
  });

  /* City tactical after deploy. Compact civic map keeps terrain-gen inside
     the boot budget. Infestation off so the baseline is not a map-filling FX. */
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
    /* HQ only exists after a legal landing. phase 0 is descent; phase 1 is
       the drop prompt. Calling deployCarrier() earlier toasts and returns. */
    await page.waitForFunction(() => typeof carrier !== 'undefined' && carrier && carrier.active && carrier.phase === 1, { timeout: 30000 });
    await page.waitForTimeout(200);
    battle = await page.evaluate(() => {
      try { if (typeof apClose === 'function') apClose(); } catch (e) {}
      for (const id of ['pauseOverlay', 'gameOver', 'levelUp', 'loadScr', 'dispatch', 'apOverlay', 'setupScr']) {
        const e = document.getElementById(id); if (e) e.style.setProperty('display', 'none', 'important');
      }
      document.querySelectorAll('.mfTitleReveal,#mfIntroSkip,#mfIntroReplay').forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });
      demoMode = false; running = true; paused = false; fogOn = false; gameEnded = false;
      let deployed = false;
      try {
        if (typeof carrierCanDeploy === 'function' && carrierCanDeploy() && typeof deployCarrier === 'function') {
          deployCarrier(); deployed = true;
        } else if (typeof deployCarrier === 'function') {
          try { deployCarrier(); deployed = true; } catch (e) {}
        }
      } catch (e) {}
      matchLive = true; paused = true;
      /* Notices are HUD, not the terrain baseline. */
      for (const id of ['toast', 'coach']) {
        const e = document.getElementById(id); if (e) { e.style.display = 'none'; e.textContent = ''; }
      }
      try { if (typeof clearFirstContactGuide === 'function') clearFirstContactGuide(); } catch (e) {}
      const cities = (typeof cityZones !== 'undefined' && cityZones) ? cityZones : [];
      const Z = cities[0] || null;
      if (Z) { cam.x = Z.x; cam.y = Z.y; }
      else { cam.x = MAP * 0.5; cam.y = MAP * 0.5; }
      camFollow = -1;
      camYaw = yawTarget = 0.28;
      camPitch = pitchTarget = 0.95;
      orthoSpan = distTarget = 520;
      if (typeof clampCam === 'function') clampCam();
      if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
      if (typeof updateHUD === 'function') updateHUD(60);
      if (typeof render === 'function') render(0.016);
      const popEl = document.getElementById('unitV');
      return {
        ok: true, deployed, cities: cities.length,
        map: typeof curMap !== 'undefined' ? curMap : '',
        cam: { x: cam.x, y: cam.y, span: orthoSpan },
        popText: popEl ? popEl.textContent : '',
        popCap: typeof populationCapFor === 'function' ? populationCapFor(0) : null,
        factionPopCap: typeof FACTION_POP_CAP !== 'undefined' ? FACTION_POP_CAP : null,
        team0: typeof teamCount !== 'undefined' ? teamCount[0] : null,
        theme: typeof curTheme !== 'undefined' ? curTheme : '',
        mapTheme: (typeof MAPDEFS !== 'undefined' && MAPDEFS[curMap]) ? MAPDEFS[curMap].theme : ''
      };
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      for (const id of ['toast', 'coach']) {
        const e = document.getElementById(id); if (e) { e.style.display = 'none'; e.textContent = ''; }
      }
      try { if (typeof clearFirstContactGuide === 'function') clearFirstContactGuide(); } catch (e) {}
      paused = true; running = true; gameEnded = false;
      if (typeof updateHUD === 'function') updateHUD(60);
      if (typeof render === 'function') render(0.016);
    });
    await shot(page, '04-battle-city-tactical.png');

    battle.hq = await page.evaluate(() => {
      if (typeof refreshBldLive === 'function') refreshBldLive();
      const list = (typeof blds !== 'undefined' && blds) ? blds : [];
      const hq = list.find(B => B && B.alive && B.type === 'hq' && B.team === 0) || null;
      if (hq) { cam.x = hq.x; cam.y = hq.y; }
      else if (typeof carrier !== 'undefined' && carrier) { cam.x = carrier.x; cam.y = carrier.y; }
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
        found: !!hq,
        x: hq ? hq.x : (typeof carrier !== 'undefined' ? carrier.x : null),
        y: hq ? hq.y : (typeof carrier !== 'undefined' ? carrier.y : null),
        popText: popEl ? popEl.textContent : '',
        popCap: typeof populationCapFor === 'function' ? populationCapFor(0) : null
      };
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      if (typeof updateHUD === 'function') updateHUD(60);
      if (typeof render === 'function') render(0.016);
    });
    await shot(page, '05-battle-hq-pop.png');
  } catch (e) {
    battle = Object.assign(battle || {}, { ok: false, reason: String(e && e.message || e) });
    console.log('BATTLE SKIP: ' + battle.reason);
  }

  const four = {
    labeledSystems: galaxy.fourCount === 4 && galaxy.chips.length === 4,
    systemHomes: galaxy.systems.map(S => S.home),
    continuePresent: /CONTINUE/i.test(galaxy.continueText + ' ' + system.enterText + ' ' + system.launchText),
    learnMorePresent: /LEARN MORE/i.test(system.learnMoreText),
    oneHomeworld: system.planetKeysInSystem.length <= 1 && system.home === 'aelos',
    loreNotMoons: (system.loreBodies || []).every(B => B.kind === 'rock' || B.kind === 'gas'),
    planetFourRegions: planet.regionCount === 4 && planet.chips.length === 4,
    popIs1K: !!(battle && (battle.popCap === 1000 || (battle.hq && battle.hq.popCap === 1000)))
      && !/4K/.test((battle && battle.popText) || '') && !/4K/.test((battle && battle.hq && battle.hq.popText) || ''),
    factionPopCap: (battle && battle.factionPopCap) || null
  };
  const checklist = {
    gpu: gpu.renderer,
    pageErrors: errs.slice(0, 12),
    consoleErrors: consoles.slice(0, 12),
    galaxy, system, loreOpen, planet, battle, four,
    gates: {
      consoleClean: errs.length === 0,
      fourLabeledSystems: four.labeledSystems,
      oneHomeworldPlusLore: four.oneHomeworld && four.loreNotMoons,
      planetFourRegions: four.planetFourRegions,
      popHud1K: four.popIs1K,
      continueLearnMore: four.continuePresent && four.learnMorePresent && loreOpen.dossierLoreOpen
    }
  };
  await writeFile(join(outDir, 'report.json'), JSON.stringify({ gpu: gpu.renderer, errs: errs.slice(0, 12), consoles: consoles.slice(0, 12), battle, outDir }, null, 2));
  await writeFile(join(outDir, 'checklist.json'), JSON.stringify(checklist, null, 2));
  console.log(JSON.stringify({ gpu: gpu.renderer, errs, gates: checklist.gates, four, battle, loreOpen }, null, 2));
} finally {
  await browser.close();
  server.close();
}
