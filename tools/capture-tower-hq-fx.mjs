#!/usr/bin/env node
/* HQ close-up + damaged/dead tower stills on live 8901 only. One tab. */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const url = 'http://127.0.0.1:8901/';
const out = join(root, '.tmp', 'tower-hq-fx-2026-08-14');
await mkdir(out, { recursive: true });

function is8901(p) {
  try { return (p.url() || '').startsWith(url); } catch { return false; }
}

const browser = await launchPwBrowser();
let opened = false;
let page = null;
try {
  const pages = browser.contexts().flatMap(c => c.pages());
  const tabs8901 = pages.filter(is8901);
  const matchish = [];
  for (const p of tabs8901) {
    try {
      const live = await p.evaluate(() => !!(typeof matchLive !== 'undefined' && matchLive && typeof running !== 'undefined' && running));
      if (live) matchish.push(p);
    } catch {}
  }
  if (tabs8901.length) {
    page = tabs8901[0];
    await page.setViewportSize({ width: 412, height: 915 }).catch(() => {});
  } else {
    page = await browser.newPage({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark'
    });
    opened = true;
  }

  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.log('ERR ' + e.message); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await assertHardwareGpu(page);
  await page.waitForFunction(() => typeof newSkirmish === 'function' && typeof applyQualityPreset === 'function' && typeof GFX !== 'undefined', null, { timeout: 60000 });
  await page.waitForFunction(() => typeof gl !== 'undefined' && gl && heightF && terrainTex, null, { timeout: 60000 });

  await page.evaluate(() => {
    if (typeof apGateSatisfied === 'function') apGateSatisfied();
    const ap = document.getElementById('apOverlay'); if (ap) ap.style.display = 'none';
    META.settings.quality = 'high';
    META.settings.godMode = true;
    applyQualityPreset();
    if (typeof GFX !== 'undefined') GFX.worldV2 = true;
    activeWarMode = 'standard';
    curMap = 'vespera_refinery_large';
    curTheme = 'vespera';
    builtMap = '';
    hideFrontScreens();
    newSkirmish();
  });
  await page.waitForFunction(() => carrier && carrier.active && heightF && PASS, null, { timeout: 90000 });
  await page.waitForFunction(() => typeof MFWorldStructuresV2 === 'undefined' || MFWorldStructuresV2.status().ready, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => {
    stopAttract(); hideFrontScreens();
    for (const id of ['pauseOverlay', 'gameOver', 'levelUp', 'loadScr', 'dispatch']) {
      const e = document.getElementById(id); if (e) e.style.display = 'none';
    }
    document.body.dataset.frontScreen = '';
    document.body.classList.remove('menuMode', 'mfMenuOpen');
    demoMode = true; running = true; matchLive = true; paused = true; fogOn = false;
    if (typeof gameEnded !== 'undefined') gameEnded = false;
    if (typeof dayT !== 'undefined') dayT = 0.08;
    const toastEl = document.getElementById('toast') || document.getElementById('toasts');
    if (toastEl) toastEl.style.display = 'none';
    document.querySelectorAll('.toast,.mfToast,#cmdNotice').forEach(e => { e.style.display = 'none'; });
    if (typeof heroIdx === 'number' && ualive[heroIdx]) uhp[heroIdx] = uhpm[heroIdx];
    else if (typeof heroIdx === 'number' && !ualive[heroIdx] && typeof addUnit === 'function') {
      /* Keep the match from flipping to DEFEAT mid-capture. */
    }
    if (!blds.some(b => b.alive && b.type === 'hq' && b.team === 0) && typeof addBld === 'function') {
      const hx = carrier && carrier.x ? carrier.x : MAP * 0.32;
      const hy = carrier && carrier.y ? carrier.y : MAP * 0.32;
      addBld('hq', 0, hx, hy, true);
    }
    carrier.active = false; carrier.phase = 2;
    if (typeof showHudDock === 'function') showHudDock(true, 'view');
    if (typeof setHudDeck === 'function') setHudDeck('view');
    try { if (typeof clearSel === 'function') clearSel(); } catch (e) {}
    try { if (typeof selected !== 'undefined') selected.length = 0; } catch (e) {}
    try { openBld = -1; } catch (e) {}
  });

  const look = (x, y, span) => page.evaluate(({ x, y, span }) => {
    const go = document.getElementById('gameOver'); if (go) go.style.display = 'none';
    document.querySelectorAll('.toast,.mfToast,#cmdNotice,#dispatch').forEach(e => { if (e) e.style.display = 'none'; });
    running = true; paused = true; matchLive = true; demoMode = true; fogOn = false;
    if (typeof gameEnded !== 'undefined') gameEnded = false;
    if (typeof teamCount !== 'undefined') { teamCount[0] = Math.max(teamCount[0], 1); teamCount[1] = Math.max(teamCount[1], 1); }
    if (typeof heroIdx === 'number' && ualive[heroIdx]) uhp[heroIdx] = uhpm[heroIdx];
    if (typeof dayT !== 'undefined') dayT = 0.08;
    cam.x = x; cam.y = y; camFollow = -1;
    camYaw = yawTarget = 0.55; camPitch = pitchTarget = 1.05;
    orthoSpan = distTarget = span;
    clampCam(); camUpdateMatrices();
    if (typeof render === 'function') render(0.016);
  }, { x, y, span });

  const snap = async (x, y, span, name) => {
    await look(x, y, span);
    await page.waitForTimeout(280);
    await look(x, y, span);
    await page.screenshot({ path: join(out, name), fullPage: false, timeout: 12000 });
  };

  const hq = await page.evaluate(() => {
    const B = blds.find(b => b.alive && b.type === 'hq' && b.team === 0);
    return B ? { x: B.x, y: B.y, hp: B.hp, hpm: B.hpm } : null;
  });
  console.log('HQ', JSON.stringify(hq));
  if (hq) await snap(hq.x, hq.y, 200, '01-hq-close.png');

  const tower = await page.evaluate(() => {
    const hq = blds.find(b => b.alive && b.type === 'hq' && b.team === 0);
    const T = relics.filter(r => r.alive && r.kind === 0).sort((a, b) => {
      const da = hq ? (a.x-hq.x)**2+(a.y-hq.y)**2 : 0;
      const db = hq ? (b.x-hq.x)**2+(b.y-hq.y)**2 : 0;
      return db - da;
    })[0];
    if (!T) return null;
    damageRelic(T, T.hpm * 0.58, 0);
    T._cap = 1;
    T.burn = Math.max(T.burn || 0, 0.72);
    return { x: T.x, y: T.y, hp: T.hp, hpm: T.hpm, burn: T.burn, kind: T.kind, alive: T.alive };
  });
  console.log('TOWER_DMG', JSON.stringify(tower));
  if (tower) {
    await page.evaluate(() => { paused = false; running = true; });
    await page.waitForTimeout(400);
    await snap(tower.x, tower.y, 240, '02-tower-damaged.png');
    const dead = await page.evaluate(() => {
      const T = relics.find(r => r._cap);
      if (T && T.alive) damageRelic(T, T.hpm + 80, 0);
      const D = relics.find(r => r._cap);
      return D ? { alive: D.alive, hp: D.hp, burn: D.burn, fallT: D.fallT || 0, crumble: typeof towerCrumble === 'function' } : null;
    });
    console.log('TOWER_DEAD', JSON.stringify(dead));
    await page.evaluate(() => { paused = false; running = true; });
    await page.waitForTimeout(450);
    await snap(tower.x, tower.y, 240, '03-tower-dead.png');
  }

  const def = await page.evaluate(() => {
    const hq = blds.find(b => b.alive && b.type === 'hq' && b.team === 0);
    if (!hq || typeof addBld !== 'function') return null;
    let B = addBld('turret', 0, hq.x + 70, hq.y - 55, true);
    if (B) { B.prog = 1; B.hp = B.hpm; B.rot = 0.2; B._cap = 1; }
    if (!B) return null;
    const idx = blds.indexOf(B);
    /* attTeam 0 — godMode ignores enemy damage on player buildings. */
    damageBld(idx, B.hpm * 0.58, 0);
    return { x: B.x, y: B.y, hp: B.hp, hpm: B.hpm, type: B.type, alive: B.alive };
  });
  console.log('DEF_DMG', JSON.stringify(def));
  if (def) {
    await page.evaluate(() => { paused = false; });
    await page.waitForTimeout(220);
    await snap(def.x, def.y, 240, '04-defense-damaged.png');
    await page.evaluate(() => {
      const i = blds.findIndex(b => b._cap && b.alive && b.type === 'turret');
      if (i >= 0) damageBld(i, blds[i].hpm + 80, 0);
    });
    await page.evaluate(() => { paused = false; });
    await page.waitForTimeout(280);
    await snap(def.x, def.y, 240, '05-defense-dead.png');
  }

  const probe = await page.evaluate(() => {
    const deadRel = relics.filter(r => !r.alive).length;
    const rubbleN = rubbles.length;
    const flames = typeof ftype !== 'undefined' ? [...ftype].filter((t, i) => flife[i] > 0 && t === 4).length : -1;
    const fireballs = typeof ftype !== 'undefined' ? [...ftype].filter((t, i) => flife[i] > 0 && t === 3).length : -1;
    return {
      deadRel, rubbleN, flames, fireballs,
      worldV2: typeof MFWorldStructuresV2 !== 'undefined' ? MFWorldStructuresV2.status() : null,
      gfxWorldV2: typeof GFX !== 'undefined' ? GFX.worldV2 : null,
      q: typeof qualityKey === 'function' ? qualityKey() : null,
      turret: (() => { const T = blds.find(b => b.type === 'turret'); return T ? { hp: T.hp, hpm: T.hpm, alive: T.alive, fallT: T.fallT || 0 } : null; })(),
      glError: gl ? gl.getError() : null,
      collapse: typeof spawnBuildingCollapse === 'function',
      towerCrumble: typeof towerCrumble === 'function',
      towerFxQ: typeof towerFxQ === 'function' ? towerFxQ() : null
    };
  });
  console.log('PROBE', JSON.stringify(probe));
  if (errors.length) console.log('ERRORS', errors.join('\n'));
  console.log('OUT', out);
  console.log('TABS8901', tabs8901.length, 'OPENED', opened, 'MATCH', matchish.length);
} finally {
  /* Shared CDP Chrome stays up — closePwBrowser hung and killed the one tab. */
}
