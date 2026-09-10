/* The front menu's chrome, checked against a real packed build rather than the
   source it came from. Three things live here because they share one boot, and
   the boot is the expensive part:

   1. the command slices are drawn from the authored plate, clamp without
      ellipsising the longest label, and stay inside the viewport;
   2. the tap popout opens on the first tap and enters on the second, which is
      only true while the interception sits on pointerup - mfBindTap commits
      there, so a click-phase guard fires after the screen has already changed;
   3. the update surface floats over the live menu instead of taking the screen,
      and minimises to a pill that leaves the menu tappable.

   Serves www/, so run tools/pack-www.mjs first.
   Run: node tools/verify-menu-chrome.mjs */
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { closePwBrowser, launchPwBrowser } from './pw-browser.mjs';

const root = resolve(import.meta.dirname, '..');
const www = resolve(root, 'www');
const shots = resolve(root, 'tmp', 'menu-chrome');
const POLL = 250;
const MIME = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream' };

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failed++; };

async function routeLocal(page) {
  await page.route('**/*', route => {
    const target = route.request().url();
    return ['127.0.0.1', 'localhost'].includes(new URL(target).hostname) || /^(blob|data):/.test(target)
      ? route.continue() : route.abort();
  });
}

/* Boot, clear the launcher, and step back from the classic fallback's War Room
   to the menu. The UGA slice stays hidden without the galactic payload, so
   reveal it - a three-slice stack would not exercise the clamp. */
async function land(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('mfBootCover'), {}, { timeout: 90000, polling: POLL });
  for (const id of ['#apCloseBtn', '#apOfflineBtn']) {
    const button = page.locator(id);
    if (await button.isVisible().catch(() => false)) await button.click().catch(() => {});
  }
  const back = page.locator('#warBack');
  if (await back.isVisible().catch(() => false)) await back.click().catch(() => {});
  await page.waitForTimeout(1400);
  await page.evaluate(() => { const uga = document.getElementById('ugaBtn'); if (uga) uga.style.display = ''; });
  await page.waitForTimeout(450);
}

let server, browser;
try {
  await mkdir(shots, { recursive: true });
  server = createServer(async (rq, rs) => {
    try {
      const url = new URL(rq.url, 'http://127.0.0.1');
      const path = resolve(www, '.' + decodeURIComponent(url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
      if (!path.startsWith(www)) { rs.writeHead(403); rs.end(); return; }
      rs.setHeader('Cache-Control', 'no-store');
      rs.setHeader('Content-Type', MIME[extname(path).toLowerCase()] || 'application/octet-stream');
      rs.end(await readFile(path));
    } catch { rs.writeHead(404); rs.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${server.address().port}/?galacticFallback=classic`;
  browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });

  /* ---- 1. the slices, at the two widths that actually differ ---- */
  for (const view of [{ name: 'portrait-412x900', width: 412, height: 900 }, { name: 'portrait-360x780', width: 360, height: 780 }]) {
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    await routeLocal(page);
    await land(page, url);
    const slices = await page.evaluate(() => [...document.querySelectorAll('#startScreen .menuSlices .slice')]
      .filter(el => el.getBoundingClientRect().width > 2)
      .map(el => {
        const label = el.querySelector('b');
        const rect = el.getBoundingClientRect();
        return {
          id: el.id,
          text: (label.textContent || '').trim(),
          clipped: label.scrollWidth > label.clientWidth + 1,
          offscreen: rect.left < -0.5 || rect.right > innerWidth + 0.5,
          fromArt: /mf-ui-v3.menu_normal/.test(getComputedStyle(el).borderImageSource || ''),
          height: Math.round(rect.height)
        };
      }));
    await page.screenshot({ path: resolve(shots, `slices-${view.name}.png`), timeout: 30000 }).catch(() => {});
    check(slices.length === 4, `${view.name}: all four command slices render (${slices.length})`);
    check(slices.every(s => s.fromArt), `${view.name}: every slice is drawn from the authored plate`);
    check(!slices.some(s => s.clipped), `${view.name}: no label is ellipsised (${slices.filter(s => s.clipped).map(s => s.text).join(', ') || 'none'})`);
    check(!slices.some(s => s.offscreen), `${view.name}: no slice leaves the viewport`);
    check(new Set(slices.map(s => s.height)).size === 1, `${view.name}: the stack is one consistent height (${[...new Set(slices.map(s => s.height))].join('/')}px)`);
    await context.close();
  }

  /* ---- 2. the popout, then 3. the update float ---- */
  const context = await browser.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await routeLocal(page);
  await land(page, url);

  const visibleScreens = () => page.evaluate(() => [...document.querySelectorAll('#startScreen,.overlay')]
    .filter(el => el.offsetParent !== null && el.getBoundingClientRect().height > 40).map(el => el.id).join('+') || '(none)');
  const home = await visibleScreens();

  await page.locator('#opsBtn').click();
  await page.waitForTimeout(420);
  const opened = await page.evaluate(() => {
    const slice = document.getElementById('opsBtn');
    const panel = slice.nextElementSibling;
    return {
      open: slice.classList.contains('is-open'),
      expanded: slice.getAttribute('aria-expanded'),
      out: !!panel && panel.classList.contains('is-out'),
      height: panel ? Math.round(panel.getBoundingClientRect().height) : 0,
      text: panel ? (panel.textContent || '').trim() : '',
      alignedRight: !!panel && Math.round(panel.getBoundingClientRect().right) === Math.round(slice.getBoundingClientRect().right),
      selectedArt: /mf-ui-v3.menu_selected/.test(getComputedStyle(slice).borderImageSource || '')
    };
  });
  await page.screenshot({ path: resolve(shots, 'popout-open.png'), timeout: 30000 }).catch(() => {});
  check(opened.open && opened.expanded === 'true', 'the first tap opens the slice and reports it');
  check(opened.out && opened.height > 20, `the description panel is revealed (${opened.height}px)`);
  check(/campaign ladder/.test(opened.text), 'the panel carries the slice description');
  check(/ENTER/.test(opened.text), 'the panel offers an explicit enter action');
  check(opened.alignedRight, 'the panel aligns to the slice spine');
  check(opened.selectedArt, 'the open slice swaps to the authored selected plate');
  check(await visibleScreens() === home, 'the first tap does not navigate');

  await page.locator('#devBtn').click();
  await page.waitForTimeout(380);
  const only = await page.evaluate(() => [...document.querySelectorAll('#startScreen .menuSlices .slice.is-open')].map(s => s.id));
  check(only.length === 1 && only[0] === 'devBtn', `only the newest slice stays open (${JSON.stringify(only)})`);

  await page.locator('#devBtn').click();
  await page.waitForTimeout(900);
  const entered = await visibleScreens();
  check(entered !== home, `the second tap enters (${home} -> ${entered})`);

  await page.evaluate(() => { if (typeof showFrontScreen === 'function') showFrontScreen('startScreen'); });
  await page.waitForTimeout(700);
  check(await visibleScreens() === home, 'the menu is reachable again from the slice destination');

  const floatState = () => page.evaluate(() => {
    const scr = document.getElementById('updScr');
    const card = document.getElementById('mfLauncherScroll');
    const rect = card ? card.getBoundingClientRect() : null;
    const slice = document.getElementById('opsBtn');
    const sr = slice ? slice.getBoundingClientRect() : null;
    const hit = sr ? document.elementFromPoint(Math.round(sr.left + sr.width / 2), Math.round(sr.top + sr.height / 2)) : null;
    const menu = document.getElementById('startScreen');
    return {
      floating: scr.classList.contains('mfFloat'),
      minimised: scr.classList.contains('is-min'),
      shown: getComputedStyle(scr).display !== 'none' && scr.getBoundingClientRect().height > 0,
      menuUp: !!menu && menu.offsetParent !== null && menu.getBoundingClientRect().height > 100,
      cardHeight: rect ? Math.round(rect.height) : 0,
      sliceTappable: !!hit && (hit === slice || slice.contains(hit)),
      bar: (document.querySelector('#updScr .mfFloatBar') || {}).textContent || '',
      bootActionsHidden: ['mfLaunchOffline', 'mfLaunchPlay'].every(id => {
        const el = document.getElementById(id);
        return !el || getComputedStyle(el).display === 'none';
      }),
      reservesDock: document.body.classList.contains('mfUpdMin'),
      popupRoute: document.body.dataset.frontPopup || ''
    };
  });

  await page.locator('#updDot').click();
  await page.waitForTimeout(700);
  const float = await floatState();
  await page.screenshot({ path: resolve(shots, 'update-float-open.png'), timeout: 30000 }).catch(() => {});
  check(float.floating && float.shown, 'the update surface opens as a float');
  check(float.menuUp, 'the menu stays up behind the float');
  check(float.cardHeight > 80 && float.cardHeight < 540, `the float is a card, not the viewport (${float.cardHeight}px)`);
  check(float.bootActionsHidden, 'the boot-gate actions are gone once the game is running');
  check(float.popupRoute === 'updScr', 'the float registers as a popup so Back has a target');

  await page.locator('#updScr .mfFloatMin').click();
  await page.waitForTimeout(450);
  const min = await floatState();
  await page.screenshot({ path: resolve(shots, 'update-float-min.png'), timeout: 30000 }).catch(() => {});
  check(min.minimised && min.cardHeight > 20 && min.cardHeight < 80, `minimised is a pill (${min.cardHeight}px)`);
  check(min.menuUp && min.sliceTappable, 'the menu behind stays tappable while minimised');
  check(/[A-Z]/.test(min.bar.trim()), `the pill carries a live status (${min.bar.trim().slice(0, 40)})`);
  check(min.reservesDock, 'the menu reserves room so the pill never covers the dock');

  await page.locator('#updScr .mfFloatMin').click();
  await page.waitForTimeout(400);
  check((await floatState()).cardHeight > 80, 'the pill expands again');

  await page.locator('#updScr .mfFloatClose').click();
  await page.waitForTimeout(400);
  const closed = await floatState();
  check(!closed.shown && !closed.floating, 'close dismisses the float');
  check(closed.menuUp && closed.popupRoute === '', 'closing leaves the menu up and clears the popup route');

  check(errors.length === 0, `no page errors (${errors.length}${errors.length ? ': ' + errors[0] : ''})`);
  await context.close();
} catch (error) {
  console.log('FATAL', error.message.split('\n')[0]);
  failed++;
} finally {
  if (browser) await closePwBrowser(browser).catch(() => {});
  if (server) server.close();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall menu chrome checks passed');
process.exitCode = failed ? 1 : 0;
