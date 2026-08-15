#!/usr/bin/env node
/* ============================================================================
   HUD STACK + PLATOON CAPTURE — pop chip 1K, stacked mass, P1–P4 chips

   Playwright + real GPU (ABORT on SwiftShader). Writes PNGs under
   .tmp/hud-stack-YYYY-MM-DD/. A human must Read the images.

   Usage: node tools/capture-hud-stage1.mjs
   ============================================================================ */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'hud-stack-2026-08-14');
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
  page.setDefaultTimeout(180000);
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

  await page.waitForFunction(() => typeof openPlanetarySetup === 'function' && typeof mfGalaxyReady !== 'undefined' && mfGalaxyReady === true && typeof PLANETS === 'object' && typeof newSkirmish === 'function', { timeout: 120000 });
  await page.waitForTimeout(400);
  const bootProbe = await page.evaluate(() => ({
    stamp: typeof stampHardscapeAlbedo,
    buildTerrain: typeof buildTerrain,
    newSkirmish: typeof newSkirmish,
    hudPlayerPop: typeof hudPlayerPop,
    ledger: typeof populationLedgerPlayer
  }));
  console.log('boot ' + JSON.stringify(bootProbe));

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
    /* Harness only: a missing bake must not abort terrain gen. */
    if (typeof stampHardscapeAlbedo !== 'function') stampHardscapeAlbedo = function () {};
    newSkirmish();
  });
  await page.waitForFunction(() => typeof heightF !== 'undefined' && heightF && typeof terrainTex !== 'undefined' && terrainTex, { timeout: 90000 });
  await page.waitForTimeout(500);

  const battle = await page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch (e) {}
    for (const id of ['pauseOverlay', 'gameOver', 'levelUp', 'loadScr', 'dispatch', 'apOverlay', 'setupScr']) {
      const e = document.getElementById(id); if (e) e.style.setProperty('display', 'none', 'important');
    }
    document.querySelectorAll('.mfTitleReveal,#mfIntroSkip,#mfIntroReplay').forEach(el => {
      el.style.setProperty('display', 'none', 'important');
    });
    demoMode = false; running = true; paused = false; fogOn = false; gameEnded = false;
    if (typeof carrier !== 'undefined' && carrier) {
      carrier.active = true;
      carrier.phase = 1;
      carrier.alt = 0;
      carrier.clearance = 0;
    }
    let deployed = false;
    try { if (typeof deployCarrier === 'function') { deployCarrier(); deployed = true; } } catch (e) {}
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
    /* updateHUD writes every 10th call. Force a write. */
    if (typeof hudFrame !== 'undefined') hudFrame = 9;
    if (typeof updateHUD === 'function') updateHUD(60);
    if (typeof render === 'function') render(0.016);
    const popEl = document.getElementById('unitV');
    const ledger = typeof populationLedgerPlayer === 'function' ? populationLedgerPlayer() : null;
    return {
      deployed,
      hq: hq ? { x: hq.x, y: hq.y } : null,
      popText: popEl ? popEl.textContent : '',
      ledger,
      capFor0: typeof populationCapFor === 'function' ? populationCapFor(0) : null,
      team0: typeof teamCount !== 'undefined' ? teamCount[0] : null
    };
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    if (typeof hudFrame !== 'undefined') hudFrame = 9;
    if (typeof updateHUD === 'function') updateHUD(60);
    if (typeof render === 'function') render(0.016);
  });
  await shot(page, '01-battle-hud.png');

  const topbar = page.locator('#topbar');
  if (await topbar.count()) await topbar.screenshot({ path: join(outDir, '01b-topbar.png') });
  const unitRes = page.locator('#unitRes');
  if (await unitRes.count()) await unitRes.screenshot({ path: join(outDir, '01c-unitRes.png') });

  /* Squad: ~18 selected infantry so per-unit rings still draw (under LOD 48). */
  const squad = await page.evaluate(() => {
    const hq = bldLive && bldLive.find(B => B && B.alive && B.type === 'hq' && B.team === 0);
    const ox = hq ? hq.x : cam.x, oy = hq ? hq.y : cam.y;
    let spawned = 0;
    for (let k = 0; k < 18; k++) {
      const a = k * 0.9, r = 70 + (k % 5) * 18;
      const i = spawnUnit(0, 0, ox + Math.cos(a) * r, oy + Math.sin(a) * r, -1);
      if (i >= 0) { usel[i] = 1; spawned++; }
    }
    if (heroIdx >= 0 && ualive[heroIdx]) usel[heroIdx] = 1;
    cam.x = ox; cam.y = oy;
    orthoSpan = distTarget = 520;
    camFollow = -1;
    if (typeof hudFrame !== 'undefined') hudFrame = 9;
    if (typeof updateHUD === 'function') updateHUD(60);
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    if (typeof render === 'function') render(0.016);
    const popEl = document.getElementById('unitV');
    let sel = 0, visSel = 0;
    for (let i = 0; i < unitHigh; i++) if (ualive[i] && usel[i]) sel++;
    return { spawned, sel, popText: popEl ? popEl.textContent : '', span: orthoSpan };
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => { if (typeof render === 'function') render(0.016); });
  await shot(page, '02-rings-squad.png');

  /* Mass select: 90 more, still player slot. Cell-collapse at tactical. */
  const mass = await page.evaluate(() => {
    const hq = bldLive && bldLive.find(B => B && B.alive && B.type === 'hq' && B.team === 0);
    const ox = hq ? hq.x : cam.x, oy = hq ? hq.y : cam.y;
    let spawned = 0;
    for (let k = 0; k < 90; k++) {
      const a = k * 0.41, r = 90 + (k % 9) * 22;
      const i = spawnUnit(0, 0, ox + Math.cos(a) * r, oy + Math.sin(a) * r, -1);
      if (i >= 0) { usel[i] = 1; spawned++; }
    }
    for (let i = 0; i < unitHigh; i++) if (ualive[i] && uteam[i] === 0) usel[i] = 1;
    cam.x = ox; cam.y = oy;
    orthoSpan = distTarget = 900;
    if (typeof hudFrame !== 'undefined') hudFrame = 10;
    if (typeof updateHUD === 'function') updateHUD(60);
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    if (typeof saveGroup === 'function') saveGroup(0);
    if (typeof showHudDock === 'function') showHudDock(true, 'orders');
    if (typeof render === 'function') render(0.016);
    const popEl = document.getElementById('unitV');
    let sel = 0;
    for (let i = 0; i < unitHigh; i++) if (ualive[i] && usel[i]) sel++;
    return {
      spawned, sel, popText: popEl ? popEl.textContent : '', span: orthoSpan,
      stackOn: typeof mfIconStackOn === 'function' ? mfIconStackOn() : null,
      stackCell: typeof mfIconStackCell === 'function' ? mfIconStackCell() : null
    };
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => { if (typeof render === 'function') render(0.016); });
  await shot(page, '03-rings-mass-tactical.png');

  /* Platoons strip: labeled dock row, P1 filled. Not under commander name. */
  const plt = await page.evaluate(() => {
    if (typeof showHudDock === 'function') showHudDock(true, 'platoons');
    if (typeof updateGroupBadges === 'function') updateGroupBadges();
    if (typeof hudFrame !== 'undefined') hudFrame = 10;
    if (typeof updateHUD === 'function') updateHUD(60);
    if (typeof render === 'function') render(0.016);
    const row = document.getElementById('grpRow');
    const p1 = document.getElementById('grp1N');
    const popEl = document.getElementById('unitV');
    const hero = document.getElementById('heroBar');
    return {
      deck: typeof hudDeck === 'string' ? hudDeck : null,
      rowDisplay: row ? row.style.display : null,
      rowText: row ? row.innerText.replace(/\s+/g, ' ').trim() : null,
      p1: p1 ? p1.textContent : null,
      popText: popEl ? popEl.textContent : '',
      heroText: hero ? hero.innerText.replace(/\s+/g, ' ').trim() : null,
      cmdbarBottom: (() => {
        const c = document.getElementById('cmdbar');
        return c ? Math.round(c.getBoundingClientRect().bottom) : null;
      })()
    };
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => { if (typeof render === 'function') render(0.016); });
  await shot(page, '05-platoons-strip.png');
  const grp = page.locator('#grpRow');
  if (await grp.count()) await grp.screenshot({ path: join(outDir, '05b-grpRow.png') });

  /* Command zoom: commander-only rings. */
  const strat = await page.evaluate(() => {
    orthoSpan = distTarget = 1800;
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    if (typeof hudFrame !== 'undefined') hudFrame = 9;
    if (typeof updateHUD === 'function') updateHUD(60);
    if (typeof render === 'function') render(0.016);
    const popEl = document.getElementById('unitV');
    return { span: orthoSpan, popText: popEl ? popEl.textContent : '' };
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => { if (typeof render === 'function') render(0.016); });
  await shot(page, '04-rings-mass-strategic.png');

  const report = { gpu: gpu.renderer, errs: errs.slice(0, 12), battle, squad, mass, plt, strat, outDir };
  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  server.close();
}
