#!/usr/bin/env node
/* ============================================================================
   SCREEN GRADE A/B — the canvas CSS filter, on one frozen frame

   Boots a match on 127.0.0.1:8901, pauses it, then swaps canvas#gl's filter
   between the shipped default (Screen Grade NEUTRAL = none) and the two grades
   it replaced. The scene is paused and re-rendered from the same state, so the
   ONLY variable between shots is the filter.

   Also measures the crush: what share of the battlefield each grade pushes to
   pure black, and what the darkest decile averages. Writes PNGs + a summary to
   audit/screenshots/.

   Usage: node tools/capture-screen-grade-ab.mjs
   ============================================================================ */
import { mkdir, writeFile } from 'node:fs/promises';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const URL = 'http://127.0.0.1:8901/';
const OUT = 'audit/screenshots';
const CLIP = { x: 16, y: 260, width: 380, height: 380 };   // battlefield, clear of HUD

/* The two values that were live before this change: the stylesheet's baked-in
   canvas rule, and the stronger one applySettings() wrote over it when
   Cinematic Lighting was on (i.e. by default). */
const STATES = [
  { id: 'after-neutral', css: 'none',                                           nm: 'AFTER  NEUTRAL (shipped default, no filter)' },
  { id: 'before-cine',   css: 'contrast(1.12) saturate(1.16) brightness(1.03)', nm: 'BEFORE applySettings() cine filter' },
  { id: 'before-css',    css: 'contrast(1.17) saturate(1.20) brightness(0.95)', nm: 'BEFORE ui.css canvas#gl filter' }
];

const browser = await launchPwBrowser({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2,
    hasTouch: true, isMobile: true, colorScheme: 'dark'
  });
  page.on('pageerror', e => console.log('ERR ' + e.message));
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
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas'), g = c.getContext('webgl2');
    if (!g) return 'NO-WEBGL2';
    const d = g.getExtension('WEBGL_debug_renderer_info');
    return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : String(g.getParameter(g.RENDERER));
  });
  console.log('UNMASKED_RENDERER_WEBGL: ' + gpu);
  if (/swiftshader|software|llvmpipe/i.test(gpu)) throw new Error('REFUSING: software renderer ' + gpu);

  await page.waitForFunction(() => typeof newSkirmish === 'function' && typeof mfGalaxyReady !== 'undefined'
    && mfGalaxyReady === true && typeof PLANETS === 'object', { timeout: 120000 });
  await page.waitForTimeout(400);

  /* Read the shipped default BEFORE anything is overridden — this, not the
     screenshots, is the proof that the game no longer double-grades itself. */
  const shipped = await page.evaluate(() => {
    const c = document.getElementById('gl');
    return {
      setting: (typeof META !== 'undefined' && META.settings) ? String(META.settings.screenGrade) : '(no META)',
      cine: (typeof META !== 'undefined' && META.settings) ? META.settings.cine : null,
      computed: getComputedStyle(c).filter,
      inline: c.style.filter
    };
  });
  console.log('shipped default: screenGrade=' + shipped.setting + '  cine=' + shipped.cine
    + '  computed filter=' + shipped.computed + '  inline=' + JSON.stringify(shipped.inline));

  await page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch (e) {}
    try { if (typeof apGateSatisfied === 'function') apGateSatisfied(); } catch (e) {}
    try { if (typeof stopAttract === 'function') stopAttract(); } catch (e) {}
    document.body.classList.add('mfIntroDone');
    for (const id of ['mfBootCover', 'apOverlay', 'loadScr', 'mfIntroSkip', 'mfIntroReplay']) {
      const el = document.getElementById(id); if (el) el.style.setProperty('display', 'none', 'important');
    }
    document.querySelectorAll('.mfTitleReveal').forEach(el => el.style.setProperty('display', 'none', 'important'));
    infestationOn = false; fogOn = false; defenseFocus = 0;
    curMap = 'aelos_north_small'; curTheme = 'verdant'; curRegionId = 'aelos_north';
    battlefieldPreset = 'compact'; deploymentPackage = 'prepared';
    if (typeof META !== 'undefined' && META.settings) { META.settings.fog = false; META.settings.dayNight = false; }
    /* Low sun on purpose: long shadows are the part of the ramp a contrast()
       pivot destroys, so this is the frame that answers the question. */
    dayT = 0.11;
    if (typeof hideFrontScreens === 'function') hideFrontScreens();
    const setup = document.getElementById('setupScr'); if (setup) setup.style.display = 'none';
    document.body.classList.remove('menuMode', 'mfMenuOpen');
    document.body.dataset.frontScreen = '';
    if (typeof stampHardscapeAlbedo !== 'function') stampHardscapeAlbedo = function () {};
    newSkirmish();
  });
  await page.waitForFunction(() => typeof heightF !== 'undefined' && heightF
    && typeof terrainTex !== 'undefined' && terrainTex, { timeout: 90000 });
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch (e) {}
    for (const id of ['pauseOverlay', 'gameOver', 'levelUp', 'loadScr', 'dispatch', 'apOverlay', 'setupScr', 'toast', 'coach']) {
      const e = document.getElementById(id); if (e) e.style.setProperty('display', 'none', 'important');
    }
    demoMode = false; running = true; paused = false; fogOn = false; gameEnded = false;
    if (typeof carrier !== 'undefined' && carrier) { carrier.active = true; carrier.phase = 1; carrier.alt = 0; carrier.clearance = 0; }
    try { if (typeof deployCarrier === 'function') deployCarrier(); } catch (e) {}
    matchLive = true;
    const hq = (typeof bldLive !== 'undefined' && bldLive)
      ? bldLive.find(B => B && B.alive && B.type === 'hq' && B.team === 0) : null;
    if (hq) { cam.x = hq.x; cam.y = hq.y; }
    else if (typeof carrier !== 'undefined') { cam.x = carrier.x; cam.y = carrier.y; }
    camFollow = -1; camYaw = yawTarget = 0.22; camPitch = pitchTarget = 1.05;
    orthoSpan = distTarget = 640;
    if (typeof showHudDock === 'function') showHudDock(true, 'orders');
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
  });
  await page.waitForTimeout(2500);
  /* Freeze: every state below re-renders this exact simulation tick. */
  await page.evaluate(() => { paused = true; });
  await page.waitForTimeout(300);

  await mkdir(OUT, { recursive: true });
  const shots = [];
  for (const st of STATES) {
    await page.evaluate(f => {
      document.getElementById('gl').style.filter = f;
      if (typeof hudFrame !== 'undefined') hudFrame = 9;
      if (typeof updateHUD === 'function') updateHUD(60);
      if (typeof render === 'function') render(0.016);
    }, st.css);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/v1.34-grade-${st.id}.png` });
    const clip = await page.screenshot({ clip: CLIP });
    shots.push({ ...st, b64: clip.toString('base64') });
    console.log('shot ' + st.id);
  }
  await page.evaluate(() => { document.getElementById('gl').style.filter = 'none'; });

  /* Crush measurement. A grade that clips shows a spike at 0 and a toe that
     has collapsed toward it; a neutral one keeps the ramp populated. */
  const stats = await page.evaluate(async list => {
    const out = [];
    for (const s of list) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + s.b64;
      await img.decode();
      const cv = new OffscreenCanvas(img.width, img.height);
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      const px = cx.getImageData(0, 0, img.width, img.height).data;
      const n = px.length / 4;
      let pure = 0, near = 0, sum = 0, toeSum = 0, toeN = 0, distinct = new Set();
      for (let i = 0; i < px.length; i += 4) {
        const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        sum += l;
        if (px[i] === 0 && px[i + 1] === 0 && px[i + 2] === 0) pure++;
        if (l < 16) { near++; toeSum += l; toeN++; distinct.add(Math.round(l)); }
      }
      out.push({
        id: s.id, nm: s.nm,
        purePct: 100 * pure / n, nearPct: 100 * near / n,
        meanL: sum / n, toeMean: toeN ? toeSum / toeN : 0, toeLevels: distinct.size
      });
    }
    return out;
  }, shots);

  const rows = stats.map(s =>
    s.id.padEnd(14) + ' pureBlack ' + s.purePct.toFixed(2).padStart(6) + '%' +
    '  lum<16 ' + s.nearPct.toFixed(2).padStart(6) + '%' +
    '  meanLum ' + s.meanL.toFixed(1).padStart(5) +
    '  toeMean ' + s.toeMean.toFixed(2).padStart(5) +
    '  toeLevels ' + String(s.toeLevels).padStart(3) + '   ' + s.nm);
  console.log('\n' + rows.join('\n'));
  await writeFile(OUT + '/v1.34-grade-ab.txt',
    'shipped default: screenGrade=' + shipped.setting + ' cine=' + shipped.cine +
    '\ncomputed canvas filter: ' + shipped.computed + '\n\n' + rows.join('\n') + '\n');
} finally {
  await closePwBrowser();
}
