#!/usr/bin/env node
/* Research capture: spawn planner + four-commander geometry. Do not commit. */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', process.argv[2] || 'planner-stage0-2026-08-14');
await mkdir(outDir, { recursive: true });

const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.webmanifest':'application/manifest+json'
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
  page.on('console', msg => {
    const t = msg.text();
    if (/error|fail|ERR|galaxy|boot/i.test(t)) console.log('CON ' + msg.type() + ' ' + t.slice(0, 240));
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
  /* Spawn planner lives in main.js. Galaxy ready is nice but not required. */
  try {
    await page.waitForFunction(() =>
      typeof openPlanetarySetup === 'function' &&
      typeof renderSpawnPlanner === 'function' &&
      typeof aiSlots !== 'undefined' && Array.isArray(aiSlots), null, { timeout: 90000 });
  } catch (e) {
    const dump = await page.evaluate(() => ({
      ready: document.readyState,
      scripts: document.scripts.length,
      openPlanetarySetup: typeof openPlanetarySetup,
      renderSpawnPlanner: typeof renderSpawnPlanner,
      mfGalaxyReady: typeof mfGalaxyReady === 'undefined' ? 'undef' : mfGalaxyReady,
      PLANETS: typeof PLANETS,
      aiSlots: typeof aiSlots,
      bootCover: !!(document.getElementById('mfBootCover'))
    }));
    console.log('BOOT DUMP ' + JSON.stringify(dump));
    throw e;
  }
  const bootFlags = await page.evaluate(() => ({
    mfGalaxyReady: typeof mfGalaxyReady === 'undefined' ? 'undef' : mfGalaxyReady,
    renderSpawnPlanner: typeof renderSpawnPlanner
  }));
  console.log('boot ' + JSON.stringify(bootFlags));

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
    const setupEl = document.getElementById('setupScr');
    if (setupEl) {
      setupEl.dataset.tab = 'forces';
      setupEl.classList.remove('setupAll');
      document.querySelectorAll('.setupTabBtn').forEach(b => b.classList.toggle('on', b.dataset.tab === 'forces'));
    }
    curMap = 'aelos_north_large';
    battlefieldPreset = 'large';
    playerStartZone = 'sw';
    spawnPick = 'player';
    for (const A of aiSlots) { A.on = false; A.ally = false; A.diff = 1; A.behavior = 'balanced'; }
    aiSlots[0].on = true; aiSlots[0].zone = 'ne'; aiSlots[0].ally = false;
    aiSlots[1].on = false; aiSlots[1].zone = 'nw';
    aiSlots[2].on = false; aiSlots[2].zone = 'se';
    normalizeAiSlotsForBattlefield();
    try { if (typeof mfGalaxySetStage === 'function') mfGalaxySetStage('deploy'); } catch (e) {}
    const adv = document.getElementById('mfAdvanced');
    if (adv) adv.open = true;
    renderSpawnPlanner();
    try { if (typeof mfQuickRender === 'function') mfQuickRender(); } catch (e) {}
  });
  await page.waitForSelector('#spawnMap', { state: 'attached', timeout: 10000 });
  await page.waitForTimeout(250);

  const openPlanner = async (scrollTo) => {
    await page.evaluate((scrollTo) => {
      const setup = document.getElementById('setupScr');
      const galaxy = typeof mfGalaxyReady !== 'undefined' && mfGalaxyReady;
      if (galaxy) {
        try { if (typeof mfGalaxySetStage === 'function') mfGalaxySetStage('deploy'); } catch (e) {}
        const adv = document.getElementById('mfAdvanced');
        if (adv && !adv.open) adv.open = true;
      } else if (setup) {
        /* Tabbed War Table: spawn planner lives on FORCES, not MAP. */
        setup.dataset.tab = 'forces';
        setup.classList.remove('setupAll');
        document.querySelectorAll('.setupTabBtn').forEach(b => b.classList.toggle('on', b.dataset.tab === 'forces'));
      }
      const sc = setup && setup.querySelector('.setupScroll');
      const wrap = document.querySelector('.spawnMapWrap');
      const list = document.getElementById('aiSlotList');
      const target = scrollTo === 'list' ? (list && (list.closest('.setupCard') || list)) : wrap;
      if (sc && target) {
        let y = 0, n = target;
        while (n && n !== sc) { y += n.offsetTop; n = n.offsetParent; }
        sc.scrollTop = Math.max(0, y - 12);
      }
      if (typeof drawSpawnPlanner === 'function') drawSpawnPlanner();
    }, scrollTo || 'map');
    await page.waitForTimeout(280);
  };
  const shotCanvas = async (name) => {
    try {
      const vis = await page.waitForSelector('#spawnMap', { state: 'visible', timeout: 4000 }).catch(() => null);
      if (!vis) { console.log('canvas shot skip ' + name + ': spawnMap not visible'); return; }
      const p = join(outDir, name);
      await vis.screenshot({ path: p, timeout: 8000 });
      console.log('wrote ' + p);
    } catch (e) {
      console.log('canvas shot skip ' + name + ': ' + (e.message || e));
    }
  };

  await openPlanner();
  await shot(page, '01-spawn-1v1-large.png');
  await shotCanvas('01b-spawnmap-1v1.png');

  /* Large 1v3: turn on three enemies and let reseatSpawnPlanner place them.
     Stage 0 contract: YOU SW, first enemy NE, second enemy SE (never NW). */
  const oneV3 = await page.evaluate(() => {
    battlefieldPreset = 'large';
    curMap = 'aelos_north_large';
    playerStartZone = 'sw';
    spawnPick = 'player';
    aiSlots[0].on = true; aiSlots[0].ally = false; aiSlots[0].zone = 'ne';
    aiSlots[1].on = true; aiSlots[1].ally = false; aiSlots[1].zone = 'nw';
    aiSlots[2].on = true; aiSlots[2].ally = false; aiSlots[2].zone = 'se';
    normalizeAiSlotsForBattlefield();
    renderSpawnPlanner();
    return {
      player: playerStartZone,
      slots: aiSlots.map((A, i) => ({ i, on: A.on, ally: A.ally, zone: A.zone })),
      fairness: ($('spawnFairness') && $('spawnFairness').innerText) || ''
    };
  });
  await openPlanner();
  await shot(page, '02-spawn-1v3-corners.png');
  await shotCanvas('02b-spawnmap-1v3.png');
  console.log('1v3 ' + JSON.stringify(oneV3));

  await openPlanner('list');
  await shot(page, '03-ai-slots-1v3.png');

  /* 2v1: one ally on NW, one enemy on NE. Slot 2 off. */
  const twoV1 = await page.evaluate(() => {
    battlefieldPreset = 'large';
    curMap = 'aelos_north_large';
    playerStartZone = 'sw';
    aiSlots[0].on = true; aiSlots[0].ally = false; aiSlots[0].zone = 'ne';
    aiSlots[1].on = true; aiSlots[1].ally = true; aiSlots[1].zone = 'nw';
    aiSlots[2].on = false; aiSlots[2].ally = false; aiSlots[2].zone = 'se';
    normalizeAiSlotsForBattlefield();
    renderSpawnPlanner();
    return {
      player: playerStartZone,
      slots: aiSlots.map((A, i) => ({ i, on: A.on, ally: A.ally, zone: A.zone }))
    };
  });
  await openPlanner();
  await shot(page, '04-spawn-2v1-ally-nw.png');
  await shotCanvas('04b-spawnmap-2v1.png');
  console.log('2v1 ' + JSON.stringify(twoV1));

  await page.evaluate(() => {
    aiSlots[0].on = true; aiSlots[0].ally = false; aiSlots[0].zone = 'ne';
    aiSlots[1].on = true; aiSlots[1].ally = true; aiSlots[1].zone = 'nw';
    aiSlots[2].on = true; aiSlots[2].ally = false; aiSlots[2].zone = 'se';
    playerStartZone = 'sw';
    normalizeAiSlotsForBattlefield();
    renderSpawnPlanner();
  });
  await openPlanner();
  await shot(page, '04c-spawn-2v2-west-east.png');
  await shotCanvas('04d-spawnmap-2v2.png');

  const compact = await page.evaluate(() => {
    curMap = 'aelos_north_small';
    battlefieldPreset = 'compact';
    aiSlots[0].on = true; aiSlots[0].ally = false; aiSlots[0].zone = 'ne';
    aiSlots[1].on = true; aiSlots[1].ally = false; aiSlots[1].zone = 'nw';
    aiSlots[2].on = true; aiSlots[2].ally = false; aiSlots[2].zone = 'se';
    normalizeAiSlotsForBattlefield();
    renderSpawnPlanner();
    const adv = document.getElementById('mfAdvanced');
    if (adv) adv.open = true;
    const sc = document.querySelector('#setupScr .setupScroll');
    const list = document.getElementById('aiSlotList');
    if (sc && list) {
      const card = list.closest('.setupCard') || list;
      sc.scrollTop = Math.max(0, card.offsetTop - 8);
    }
    return {
      player: playerStartZone,
      cap: battlefieldAiCap(),
      slots: aiSlots.map((A, i) => ({ i, on: A.on, ally: A.ally, zone: A.zone })),
      toggles: [...document.querySelectorAll('#aiSlotList .aiToggle')].map(b => b.textContent.trim())
    };
  });
  await openPlanner('list');
  await shot(page, '05-spawn-compact-maplock.png');
  await shotCanvas('05b-spawnmap-compact.png');
  console.log('compact ' + JSON.stringify(compact));

  await page.evaluate(() => {
    const sc = document.querySelector('#setupScr .setupScroll');
    const q = document.getElementById('mfQuickSetup');
    if (sc && q) sc.scrollTop = Math.max(0, q.offsetTop - 36);
  });
  await page.waitForTimeout(120);
  await shot(page, '06-quick-team-only-two-modes.png');

  const metrics = await page.evaluate(() => {
    const layouts = {
      duel: { player:'sw', slots:[{on:true,zone:'ne',ally:false},{on:false,zone:'nw',ally:false},{on:false,zone:'se',ally:false}] },
      twoFront: { player:'sw', slots:[{on:true,zone:'ne',ally:false},{on:true,zone:'se',ally:false},{on:false,zone:'nw',ally:false}] },
      crushAdj: { player:'sw', slots:[{on:true,zone:'w',ally:false},{on:true,zone:'s',ally:false},{on:false,zone:'ne',ally:false}] },
      fourCorner: { player:'sw', slots:[{on:true,zone:'ne',ally:false},{on:true,zone:'nw',ally:false},{on:true,zone:'se',ally:false}] },
      twoVtwoWE: { player:'sw', slots:[{on:true,zone:'ne',ally:false},{on:true,zone:'nw',ally:true},{on:true,zone:'se',ally:false}] },
      twoVtwoNS: { player:'s', slots:[{on:true,zone:'n',ally:false},{on:true,zone:'se',ally:true},{on:true,zone:'nw',ally:false}] }
    };
    const theatres = ['compact','standard','large'];
    const out = { MAP, SPAN_MIN, SPAN_MAX, FN, FACTION_POP_CAP, factionCap: BATTLEFIELD_FACTION_CAP, presets: {} };
    for (const key of theatres) {
      battlefieldPreset = key;
      const P = battlefieldPresetDef(), B = battlefieldPlayBounds(0);
      out.presets[key] = {
        nm: P.nm, km: P.km, world: P.world, start: P.start, spread: P.spread,
        nodes: P.nodes, geysers: P.geysers, factionCap: battlefieldFactionCap(),
        bounds: [Math.round(B.lo), Math.round(B.hi), Math.round(B.span)]
      };
    }
    out.layouts = {};
    for (const [name, L] of Object.entries(layouts)) {
      out.layouts[name] = {};
      for (const key of theatres) {
        battlefieldPreset = key;
        playerStartZone = L.player;
        for (let i = 0; i < 3; i++) {
          const S = L.slots[i];
          aiSlots[i].on = !!S.on; aiSlots[i].zone = S.zone; aiSlots[i].ally = !!S.ally; aiSlots[i].diff = 1;
        }
        normalizeAiSlotsForBattlefield();
        setupDeposits();
        const S = skirmishSpawnPoints();
        const dists = [];
        for (let a = 0; a < S.length; a++) for (let b = a + 1; b < S.length; b++) {
          dists.push({ a: S[a].zone + '/' + S[a].kind, b: S[b].zone + '/' + S[b].kind, m: Math.round(Math.sqrt(dist2(S[a].x, S[a].y, S[b].x, S[b].y))) });
        }
        dists.sort((x, y) => x.m - y.m);
        const starters = S.map(A => ({
          zone: A.zone, kind: A.kind,
          mass: deposits.filter(D => D.starter === A.zone).length,
          geo: geysers.filter(G => G.starter === A.zone).length,
          x: Math.round(A.x), y: Math.round(A.y)
        }));
        const hqVision = 22 * (3200 / 128);
        const visiblePair = dists.filter(d => d.m < hqVision * 2);
        out.layouts[name][key] = {
          commanders: S.length,
          nearest: dists[0] || null,
          farthest: dists[dists.length - 1] || null,
          dists,
          deposits: deposits.length,
          geysers: geysers.length,
          starters,
          fair: starters.every(A => A.mass === 3 && A.geo === 1),
          hqVisionWu: Math.round(hqVision),
          spawnInHqVision: visiblePair
        };
      }
    }
    const phone = {
      portrait: { w: 412, h: 915 },
      atLanding: { span: 680, worldH: 680, worldW: Math.round(680 * 412 / 915) },
      atCommand: { span: 1500, worldH: 1500, worldW: Math.round(1500 * 412 / 915) },
      atMax: { span: SPAN_MAX, worldH: SPAN_MAX, worldW: Math.round(SPAN_MAX * 412 / 915) }
    };
    return {
      MAP, phone,
      fogCellWu: MAP / FN,
      pop: { FACTION_POP_CAP, sessMax: 4000, maxu: MAXU, toastLiesAboutTheatre: true },
      presets: out.presets,
      layouts: out.layouts,
      caps: BATTLEFIELD_FACTION_CAP
    };
  });

  await writeFile(join(outDir, 'metrics.json'), JSON.stringify({
    gpu: true,
    errs: errs.slice(0, 12),
    seating: { oneV3, twoV1, compact },
    metrics
  }, null, 2));
  console.log(JSON.stringify({
    errs: errs.slice(0, 8),
    seating: { oneV3, twoV1, compact },
    caps: metrics.caps,
    fourCornerLarge: metrics.layouts.fourCorner.large,
    crushAdjLarge: metrics.layouts.crushAdj.large,
    compactLock: metrics.layouts.fourCorner.compact.commanders
  }, null, 2));
} finally {
  await browser.close();
  server.close();
}
