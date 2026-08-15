#!/usr/bin/env node
/* Same 8901 tab. No navigation. Force HIGH after phone-med remap. */
import { launchPwBrowser } from './pw-browser.mjs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const url = 'http://127.0.0.1:8901/';
const out = join(root, '.tmp', 'tower-hq-fx-2026-08-14');
await mkdir(out, { recursive: true });

const browser = await launchPwBrowser();
const page = browser.contexts().flatMap(c => c.pages()).find(p => {
  try { return (p.url() || '').startsWith(url); } catch { return false; }
});
if (!page) { console.log('NO_TAB'); process.exit(1); }

const look = (x, y, span) => page.evaluate(({ x, y, span }) => {
  const go = document.getElementById('gameOver'); if (go) go.style.display = 'none';
  document.querySelectorAll('.toast,.mfToast,#cmdNotice,#dispatch').forEach(e => { if (e) e.style.display = 'none'; });
  running = true; paused = true; matchLive = true; demoMode = true; fogOn = false;
  if (typeof gameEnded !== 'undefined') gameEnded = false;
  if (typeof dayT !== 'undefined') dayT = 0.08;
  cam.x = x; cam.y = y; camFollow = -1;
  camYaw = yawTarget = 0.55; camPitch = pitchTarget = 1.05;
  orthoSpan = distTarget = span;
  clampCam(); camUpdateMatrices();
  if (typeof render === 'function') render(0.016);
}, { x, y, span });

const snap = async (x, y, span, name) => {
  await look(x, y, span);
  await page.waitForTimeout(200);
  await look(x, y, span);
  await page.screenshot({ path: join(out, name), fullPage: false, timeout: 12000 });
};

const q = await page.evaluate(() => {
  META.settings.quality = 'high';
  if (META.settings.gfxOver && typeof META.settings.gfxOver === 'object')
    META.settings.gfxOver.worldV2 = true;
  else META.settings.gfxOver = { worldV2: true };
  applyQualityPreset();
  GFX.worldV2 = true;
  return { q: qualityKey(), worldV2: GFX.worldV2, fx: typeof towerFxQ === 'function' ? towerFxQ() : null };
});
console.log('Q', JSON.stringify(q));

const hq = await page.evaluate(() => {
  const B = blds.find(b => b.alive && b.type === 'hq' && b.team === 0);
  return B ? { x: B.x, y: B.y } : null;
});
console.log('HQ', JSON.stringify(hq));
if (hq) await snap(hq.x, hq.y, 190, '06-hq-high.png');

if (hq) {
  const def = await page.evaluate(({ x, y }) => {
    let B = blds.find(b => b._cap2 && b.type === 'turret');
    if (!B) {
      B = addBld('turret', 0, x + 55, y - 40, true);
      if (B) { B.prog = 1; B.hp = B.hpm; B.rot = 0.2; B._cap2 = 1; }
    }
    if (!B) return null;
    const idx = blds.indexOf(B);
    damageBld(idx, B.hpm * 0.62, 0);
    return { x: B.x, y: B.y, hp: B.hp, hpm: B.hpm, alive: B.alive };
  }, hq);
  console.log('DEF_DMG', JSON.stringify(def));
  if (def) {
    await page.evaluate(() => { paused = false; running = true; });
    await page.waitForTimeout(350);
    await snap(def.x, def.y, 200, '07-defense-high-dmg.png');
    await page.evaluate(() => {
      const i = blds.findIndex(b => b._cap2 && b.alive && b.type === 'turret');
      if (i >= 0) damageBld(i, blds[i].hpm + 80, 0);
    });
    await page.evaluate(() => { paused = false; running = true; });
    await page.waitForTimeout(400);
    await snap(def.x, def.y, 200, '08-defense-high-dead.png');
  }
}
console.log('OUT', out);
