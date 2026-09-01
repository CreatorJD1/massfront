#!/usr/bin/env node
/* Geometry + screenshot proof that the battle minimap occupies the command
   plate's dedicated bay instead of floating over ORDERS. The cinematic phone
   layout stacks that bay immediately above the dock; landscape keeps it beside
   the dock. Uses a real Standard match. */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { ANDROID_S25_USER_AGENT, S25_VIEWPORT, assertMobileGpuBranch } from './mobile-device-profile.mjs';
import { startStaticServer, applyPreset, enterRealBattle } from './perf-lab/perf-probe-runner.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'audit', 'minimap-dock');

function fail(label, extra) {
  throw new Error(label + (extra ? ' ' + JSON.stringify(extra) : ''));
}

async function measure(page) {
  return page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: +r.x.toFixed(1), y: +r.y.toFixed(1),
        w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        bottom: +r.bottom.toFixed(1), right: +r.right.toFixed(1),
        display: cs.display
      };
    };
    const overlap = (a, b) => {
      if (!a || !b) return 0;
      const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      return +(w * h).toFixed(1);
    };
    const wrap = box(document.getElementById('minimapWrap'));
    const map = box(document.getElementById('minimap'));
    const dock = box(document.getElementById('cmdbar'));
    const tabs = box(document.getElementById('hudDeckTabs'));
    const orders = box(document.querySelector('.hudDeckBtn[data-deck="orders"]'));
    const army = box(document.getElementById('armyBtn'));
    const primary = box(document.getElementById('primaryRow'));
    const topbar = box(document.getElementById('topbar'));
    const goal = box(document.getElementById('goalBar'));
    const hero = box(document.getElementById('heroBar'));
    const haz = box(document.getElementById('hazChip'));
    const fps = box(document.getElementById('fps'));
    const res = box(document.querySelector('#topbar .res'));
    const goalParent = document.getElementById('goalBar')?.parentElement?.id || null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      vw, vh,
      dockOn: document.body.classList.contains('hudTacticalDock'),
      mmSize: getComputedStyle(document.documentElement).getPropertyValue('--mmSize').trim(),
      mmBay: getComputedStyle(document.documentElement).getPropertyValue('--mmBay').trim(),
      mmDockPad: getComputedStyle(document.documentElement).getPropertyValue('--mmDockPad').trim(),
      wrap, map, dock, tabs, orders, army, primary,
      topbar, goal, hero, haz, fps, res, goalParent,
      overlapOrders: overlap(wrap, orders),
      overlapArmy: overlap(wrap, army),
      overlapGoalHero: overlap(goal, hero),
      overlapGoalHaz: overlap(goal, haz),
      overlapResGoal: overlap(res, goal),
      mapVsDockBottom: wrap && dock ? +(wrap.bottom - dock.bottom).toFixed(1) : null,
      mapVsArmyBottom: wrap && army ? +(wrap.bottom - army.bottom).toFixed(1) : null,
      mapVsDockTop: wrap && dock ? +(wrap.top - dock.top).toFixed(1) : null,
      mapVsOrdersLeft: wrap && orders ? +(orders.x - (wrap.x + wrap.w)).toFixed(1) : null
    };
  });
}

const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });
const server = await startStaticServer();
const checks = [];
try {
  await mkdir(OUT, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: S25_VIEWPORT.width, height: S25_VIEWPORT.height },
    deviceScaleFactor: S25_VIEWPORT.dpr,
    hasTouch: true,
    isMobile: true,
    userAgent: ANDROID_S25_USER_AGENT,
    serviceWorkers: 'block'
  });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  await page.goto(server.url + '?minimapdock=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await assertHardwareGpu(page);
  await page.waitForFunction(() => typeof spawnUnit === 'function', null, { timeout: 90000 });
  const mobile = await page.evaluate(() => ({
    ua: navigator.userAgent,
    mobileGpu: typeof MF_MOBILE_GPU === 'boolean' ? MF_MOBILE_GPU : null
  }));
  assertMobileGpuBranch(mobile.mobileGpu, mobile.ua, 'verify-minimap-dock');

  await enterRealBattle(page);
  await applyPreset(page, 'high');
  await page.evaluate(() => {
    if (typeof showHudDock === 'function') showHudDock(true, 'orders');
    else document.body.classList.add('hudTacticalDock');
    const primary = document.getElementById('primaryRow');
    if (primary) primary.style.display = 'flex';
  });
  await page.waitForTimeout(600);

  const geo = await measure(page);
  await writeFile(join(OUT, 'geometry.json'), JSON.stringify(geo, null, 2));

  checks.push(['tactical dock live', geo.dockOn]);
  checks.push(['minimap visible', !!(geo.wrap && geo.wrap.w > 40 && geo.wrap.h > 40)]);
  checks.push(['command plate visible', !!(geo.dock && geo.dock.w > 200)]);
  checks.push(['map bay stays inside screen X', geo.wrap && geo.wrap.x >= -1 && geo.wrap.right <= geo.vw + 1]);
  checks.push(['map bay joins command plate Y', geo.wrap && geo.dock &&
    ((geo.dock.y-geo.wrap.bottom >= -2 && geo.dock.y-geo.wrap.bottom <= 8) ||
     (geo.wrap.y >= geo.dock.y - 2 && geo.wrap.bottom <= geo.dock.bottom + 2))]);
  checks.push(['map bay aligns or stacks with actions', geo.wrap && geo.dock &&
    ((geo.dock.y-geo.wrap.bottom >= -2 && geo.dock.y-geo.wrap.bottom <= 8) ||
     (Number.isFinite(geo.mapVsArmyBottom) && Math.abs(geo.mapVsArmyBottom) <= 6))]);
  checks.push(['ORDERS not covered', geo.overlapOrders <= 4]);
  checks.push(['map bay is separate from action controls', geo.overlapOrders <= 4 && geo.overlapArmy <= 4]);
  checks.push(['map width clamped to screen', geo.wrap && geo.wrap.w <= geo.vw * 0.28 + 1]);
  checks.push(['shared bay tokens present', /px/.test(geo.mmSize) && /px/.test(geo.mmBay)]);
  checks.push(['intel lives in topbar', geo.goalParent === 'topbar']);
  checks.push(['intel below resources', !geo.res || !geo.goal || geo.res.bottom <= geo.goal.y + 1]);
  checks.push(['intel not over LV chip', geo.overlapGoalHero <= 4]);
  checks.push(['intel not over weather', geo.overlapGoalHaz <= 4]);
  checks.push(['side chips below top plate', !geo.topbar || ((!geo.hero || geo.topbar.bottom <= geo.hero.y + 1) && (!geo.haz || geo.topbar.bottom <= geo.haz.y + 1))]);

  const shot = join(OUT, '01-minimap-dock-412.png');
  await page.screenshot({ path: shot, fullPage: false });
  await page.screenshot({ path: join(OUT, '03-topbar-412.png'), clip: { x: 0, y: 0, width: S25_VIEWPORT.width, height: 220 } });

  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(250);
  const geo360 = await measure(page);
  await writeFile(join(OUT, 'geometry-360.json'), JSON.stringify(geo360, null, 2));
  checks.push(['360 map still in plate', geo360.wrap && geo360.dock && geo360.wrap.bottom <= geo360.dock.bottom + 2 && geo360.overlapOrders <= 4]);
  checks.push(['360 intel still in topbar', geo360.goalParent === 'topbar' && geo360.overlapGoalHero <= 4 && geo360.overlapGoalHaz <= 4]);
  await page.screenshot({ path: join(OUT, '02-minimap-dock-360.png'), fullPage: false });
  await page.screenshot({ path: join(OUT, '04-topbar-360.png'), clip: { x: 0, y: 0, width: 360, height: 220 } });

  await page.setViewportSize({ width: 780, height: 412 });
  await page.waitForTimeout(250);
  const geoWide = await measure(page);
  await writeFile(join(OUT, 'geometry-wide.json'), JSON.stringify(geoWide, null, 2));
  checks.push(['wide intel still in topbar', geoWide.goalParent === 'topbar' && geoWide.overlapGoalHero <= 4]);
  checks.push(['wide map stays clamped', geoWide.map && geoWide.map.w <= 90 && geoWide.map.h <= 90]);
  await page.screenshot({ path: join(OUT, '05-hud-wide-780.png'), fullPage: false });

  for (const [label, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) fail(label, { geo, geo360, geoWide });
  }
  console.log(JSON.stringify({ out: OUT, geo: { wrap: geo.wrap, dock: geo.dock, orders: geo.orders, army: geo.army, overlapOrders: geo.overlapOrders } }, null, 2));
} finally {
  await closePwBrowser(browser).catch(() => {});
  await server.close().catch(() => {});
}
