#!/usr/bin/env node
/* THE TWO DOOR TAPS THE PLAYER REPORTED AS DEAD.
 *
 * UGA Command and the Ocean Theatre Tester hand the tab to a separate WebGL
 * document. The browser keeps painting THIS document for that whole window, so
 * without an explicit state the menu sits there unchanged and the tap reads as
 * nothing happening. Worse, the failure lines those paths raise went to #toast,
 * which body.mfMenuOpen hides — so an install lacking the module was
 * indistinguishable from a broken button.
 *
 * This proves, against the real packed www/ on 8901 with a hardware GPU:
 *   A  tapping UGA COMMAND raises the launch veil, named and animated
 *   B  tapping the War Room OCEAN TESTER card does the same, and marks the card
 *   C  a launch that FAILS takes the veil down and puts its reason on screen
 *
 * The module routes are held open so the veil can be photographed in the window
 * it exists to cover, which is also the window the player was complaining about.
 *
 * Usage: node tools/verify-launch-affordance.mjs [--out tmp/verify-launch]
 * Exit 0 only when all three cases hold.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const outDir = join(root, (argv.indexOf('--out') >= 0 && argv[argv.indexOf('--out') + 1]) || join('tmp', 'verify-launch'));
await mkdir(outDir, { recursive: true });

const PORT = 8901;
const BASE = `http://127.0.0.1:${PORT}/`;

const server = spawn(process.execPath, [join(root, 'serve.mjs'), 'www', String(PORT)],
  { cwd: root, stdio: 'ignore', windowsHide: true });
const stopServer = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', stopServer);

const reachable = async () => {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(BASE, { cache: 'no-store' });
      await response.body?.cancel();
      if (response.ok) return true;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};
if (!await reachable()) { stopServer(); throw new Error('8901 never came up; is www/ packed?'); }

const veilState = () => {
  const el = document.getElementById('mfLaunchVeil');
  if (!el) return { present: false };
  const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
  const bar = el.querySelector('.mfLvBar > i');
  return {
    present: true,
    shown: el.classList.contains('show'),
    display: style.display,
    covers: rect.width >= window.innerWidth - 1 && rect.height >= window.innerHeight - 1,
    zIndex: style.zIndex,
    busy: el.getAttribute('aria-busy'),
    title: el.querySelector('.mfLvTitle')?.textContent || '',
    note: el.querySelector('.mfLvNote')?.textContent || '',
    animated: !!bar && getComputedStyle(bar).animationName !== 'none'
  };
};
const noticeState = () => {
  const el = document.getElementById('toast');
  if (!el) return { present: false };
  const style = getComputedStyle(el), rect = el.getBoundingClientRect();
  return {
    present: true, display: style.display, opacity: Number(style.opacity),
    menuLane: el.classList.contains('mfMenuNotice'),
    onScreen: style.display !== 'none' && Number(style.opacity) > 0.05
      && rect.width > 4 && rect.height > 4 && rect.bottom <= window.innerHeight + 1,
    text: el.textContent.trim().slice(0, 140)
  };
};

const browser = await launchPwBrowser({ ownershipMode: 'isolated' });
const cases = {};
let page = null;
try {
  /* serviceWorkers:'block' is required, not cosmetic. www/ registers sw.js, and
     a navigation it fulfills from cache never reaches page.route — so the hold
     below silently did nothing and the tester loaded for real, which is how two
     runs of this probe reported an absent veil that had in fact appeared. The
     veil is plain DOM and does not depend on the worker. */
  page = await browser.newPage({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, serviceWorkers: 'block'
  });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e.message).slice(0, 300)));

  /* Hold both module documents open. A real device spends seconds in exactly
     this state; holding it makes the window the veil exists to cover last long
     enough to photograph and assert on. It also keeps the launcher's own
     auto-entry into UGA Command from taking the tab away mid-test. */
  /* Hold, then abort. An unfulfilled route is not enough: the first run of this
     probe let the tester navigate, and waitForFunction then polled inside the
     NEW document where #mfLaunchVeil cannot exist, so a veil that really did
     appear read as absent. Aborting after a beat keeps us on the host document
     with the veil still up (its own 20s deadline has not fired), which is
     exactly the state the player sits in while a module document loads. */
  const held = [];
  const HOLD_MS = 8000;
  for (const pattern of ['**/modules/space_exploration/index.html*', '**/modules/stormpeak_ocean/index.html*']) {
    await page.route(pattern, route => {
      held.push(route.request().url());
      setTimeout(() => { route.abort('aborted').catch(() => {}); }, HOLD_MS);
    });
  }

   /* The launcher gateway owns the first screen, so mfIntroDone alone is not the
      menu — an earlier run of this probe clicked the game entry while it was still
     behind the gate and timed out on an invisible button. This is the route
     tools/audit-front-screens.mjs established: pass the gate, start the intro,
     take the offline identity, then wait for the launcher to actually report
     passed/bypass before touching anything it owns. */
  /* Galactic Command intercepts showFrontScreen('startScreen') and re-launches
     UGA Command, so forcing the classic menu open just re-entered the launch we
     were trying to start from. ?galacticFallback=classic is the product's own
      switch for reaching the retired home; #startBtn and the War Room card are the
      same elements with the same handlers either way, so the affordance under
     test is unchanged. */
  const toMenu = async () => {
    await page.goto(BASE + '?galacticFallback=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => typeof mfLauncherSnapshot === 'function', null,
      { polling: 250, timeout: 120000 });
    await page.waitForFunction(() => {
      const p = document.getElementById('mfLaunchPlay'), o = document.getElementById('mfLaunchOffline');
      return (p && !p.disabled) || (o && !o.disabled);
    }, null, { polling: 250, timeout: 90000 });
    await page.evaluate(() => {
      const p = document.getElementById('mfLaunchPlay'), o = document.getElementById('mfLaunchOffline');
      (p && !p.disabled ? p : o)?.click();
    });
    await page.waitForTimeout(6000);
    await page.evaluate(() => document.getElementById('mfIntroStart')?.click());
    await page.waitForTimeout(3000);
    await page.evaluate(() => document.getElementById('apOfflineBtn')?.click());
    await page.waitForFunction(() => {
      const s = typeof mfLauncherSnapshot === 'function' ? mfLauncherSnapshot() : null;
      return Boolean(s && (s.passed || s.bypass));
    }, null, { polling: 250, timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(5000);
    /* The launcher auto-enters UGA Command on a normal career, which our held
       route freezes mid-launch — with the new veil over it. That is the correct
       behaviour and is recorded below, but the tap cases need a clean menu. */
    const autoEntry = await page.evaluate(veilState);
    await page.evaluate(() => {
      if (typeof mfLaunchVeilClose === 'function') mfLaunchVeilClose();
      mfExplorationLaunching = false;
      mfStormpeakLaunching = false;
      for (const el of document.querySelectorAll('.is-launching')) {
        el.classList.remove('is-launching'); el.removeAttribute('aria-busy');
      }
      if (typeof showFrontScreen === 'function') showFrontScreen('startScreen');
    });
    await page.waitForFunction(() => {
      const b = document.getElementById('startBtn');
      return !!b && !!b.offsetParent && b.getBoundingClientRect().width > 0;
    }, null, { polling: 250, timeout: 60000 });
    return autoEntry;
  };
  const bootVeil = await toMenu();
  await assertHardwareGpu(page);
  await page.screenshot({ path: join(outDir, '00-menu.png') });
  cases.launcherAutoEntry = { raisedVeil: !!bootVeil.shown, veil: bootVeil };

  /* A tap that does NOT raise the veil must leave evidence of what it did
     instead, or this probe reports the same "nothing happened" the player did. */
  const tapForVeil = async (selector, shot) => {
    await page.click(selector, { timeout: 30000 });
    let appeared = true;
    try {
      await page.waitForFunction(
        () => document.getElementById('mfLaunchVeil')?.classList.contains('show'),
        {}, { timeout: 15000, polling: 100 });
    } catch { appeared = false; }
    const veil = await page.evaluate(veilState);
    /* Read the control in the SAME turn, and list every element actually
       wearing the busy class - if the pressed card was replaced by a re-render,
       the class is on a detached node and querySelector finds a fresh one. */
    const control = await page.evaluate(sel => {
      const b = document.querySelector(sel);
      const id = el => el.id || (el.tagName.toLowerCase() + (el.dataset.mode ? '[data-mode=' + el.dataset.mode + ']' : '') + '.' + (el.className || '').split(' ').slice(0, 2).join('.'));
      return {
        launching: !!b && b.classList.contains('is-launching'),
        busy: b ? b.getAttribute('aria-busy') : null,
        found: !!b,
        connected: !!b && b.isConnected,
        allBusy: [...document.querySelectorAll('.is-launching')].map(id)
      };
    }, selector);
    const instead = appeared ? null : await page.evaluate(() => ({
      url: location.href,
      latch: typeof mfExplorationLaunching === 'boolean' ? mfExplorationLaunching : null,
      buildFlag: window.__MF_BUILD_HAS_GALACTIC_EXPLORATION === true,
      otaFlag: window.__MF_OTA_HAS_GALACTIC_DELIVERY === true,
      gate: (() => { try { return window.MFNewCareerFactionGate?.state?.() || null; } catch { return null; } })(),
      dialogs: [...document.querySelectorAll('dialog[open],[role="dialog"]')]
        .map(d => (d.id || d.className || 'dialog') + ':' + d.textContent.trim().slice(0, 70)).slice(0, 4),
      notice: document.getElementById('toast')?.textContent.trim().slice(0, 140) || ''
    }));
    await page.screenshot({ path: join(outDir, shot) });
    return { appeared, veil, control, instead };
  };

   /* ---- A  SINGLE MASSFRONT ENTRY ---------------------------------------- */
   const a = await tapForVeil('#startBtn', '01-massfront-veil.png');
   cases.massfrontEntry = {
     ok: !!(a.veil.shown && a.veil.covers && a.veil.animated
       && /UGA COMMAND/i.test(a.veil.title) && a.veil.note && a.control.launching),
    ...a, navigationHeld: held.some(u => u.includes('space_exploration'))
  };

  /* ---- B  WAR ROOM OCEAN TESTER ------------------------------------------ */
  await toMenu();
  await page.evaluate(() => {
    META.settings = META.settings || {};
    META.settings.oceanTester = true;
    if (typeof metaSave === 'function') metaSave();
    window.openWarRoom();
  });
  await page.waitForSelector('[data-mode="stormpeak"]', { timeout: 20000 });
  /* The dev section sits at the foot of the operations list, below CO-OP, so an
     unscrolled shot proves nothing about it. */
  await page.evaluate(() => {
    document.getElementById('mfWarDevGroup')?.scrollIntoView({ block: 'end' });
    const scroller = document.querySelector('#warScr .warScroll');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(outDir, '02-war-room-dev-section.png') });

  /* ---- B0  DEV MODULES IS A SECTION, NOT A FIFTH OPERATION ---------------- */
  /* The tester card used to be a sibling of TRAINING / STANDARD / CAMPAIGN in
     #warGrid, and the count in the header was recomputed from every .warCard in
     the grid — so a debug surface was advertised as an operation. */
  const devSection = await page.evaluate(() => {
    const grid = document.getElementById('warGrid');
    const sec = document.getElementById('mfWarDevGroup');
    return {
      present: !!sec,
      childOfGrid: !!sec && sec.parentNode === grid,
      heading: sec?.querySelector('.warDevHd')?.textContent || null,
      devCards: sec ? [...sec.querySelectorAll('.warCard')].map(c => c.dataset.mode) : [],
      operationsInGrid: grid
        ? [...grid.children].filter(n => n.classList.contains('warCard')).map(n => n.dataset.mode)
        : [],
      continuation: document.querySelector('#warScr .warContinuation strong')?.textContent || null
    };
  });
  cases.devModulesSection = {
    ok: !!(devSection.present && devSection.childOfGrid
      && devSection.devCards.includes('stormpeak')
      && !devSection.operationsInGrid.includes('stormpeak')
      && /^\d+ OPERATIONS$/.test(devSection.continuation || '')
      && Number((devSection.continuation || '').split(' ')[0]) === devSection.operationsInGrid.length),
    ...devSection
  };

  const b = await tapForVeil('[data-mode="stormpeak"]', '03-ocean-veil.png');
  cases.oceanTester = {
    ok: !!(b.veil.shown && b.veil.covers && b.veil.animated
      && /OCEAN TESTER/i.test(b.veil.title) && b.veil.note && b.control.launching),
    ...b, navigationHeld: held.some(u => u.includes('stormpeak_ocean'))
  };

  /* ---- C  A FAILED LAUNCH MUST SAY WHY ----------------------------------- */
  /* Reproduce the install the player actually has: a shell predating the
     module, whose boot.js never set the capability flag, so the launch falls
     through to the HEAD probe and fails. That reason used to be written into a
     hidden box. */
  await toMenu();
  await page.route('**/modules/stormpeak_ocean/index.html*', route => route.fulfill({ status: 404, body: '' }));
  await page.evaluate(() => {
    window.__MF_BUILD_HAS_STORMPEAK_TESTER = false;
    META.settings = META.settings || {};
    META.settings.oceanTester = true;
    if (typeof metaSave === 'function') metaSave();
    window.openWarRoom();
  });
  await page.waitForSelector('[data-mode="stormpeak"]', { timeout: 20000 });
  await page.click('[data-mode="stormpeak"]', { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const t = document.getElementById('toast');
      return !!t && t.textContent.trim().length > 0 && Number(getComputedStyle(t).opacity) > 0.05
        && !document.getElementById('mfLaunchVeil')?.classList.contains('show');
    }, {}, { timeout: 30000, polling: 150 });
  const c = await page.evaluate(noticeState);
  const cVeil = await page.evaluate(veilState);
  await page.screenshot({ path: join(outDir, '04-failure-notice.png') });
  cases.failureIsLegible = {
    ok: !!(c.onScreen && c.menuLane && /not installed|could not|did not/i.test(c.text) && !cVeil.shown),
    notice: c, veilTakenDown: !cVeil.shown,
    menuOpen: await page.evaluate(() => document.body.classList.contains('mfMenuOpen'))
  };

  cases.pageErrors = pageErrors;
} finally {
  await closePwBrowser(browser);
  stopServer();
}

const ok = cases.massfrontEntry?.ok
  && cases.devModulesSection?.ok && cases.oceanTester?.ok && cases.failureIsLegible?.ok;
await writeFile(join(outDir, 'verdict.json'), JSON.stringify({ ok, outDir, cases }, null, 2));
const mark = v => (v ? 'PASS' : 'FAIL');
console.log(`launch affordance on ${BASE}`);
console.log(`  A  MASSFRONT entry veil    ${mark(cases.massfrontEntry?.ok)}  title="${cases.massfrontEntry?.veil?.title}" note="${cases.massfrontEntry?.veil?.note}"  navHeld ${cases.massfrontEntry?.navigationHeld}`);
console.log(`       covers viewport ${cases.massfrontEntry?.veil?.covers}  animated ${cases.massfrontEntry?.veil?.animated}  button busy ${cases.massfrontEntry?.control?.launching}`);
if (cases.massfrontEntry?.instead) console.log(`       INSTEAD ${JSON.stringify(cases.massfrontEntry.instead)}`);
console.log(`  B0 DEV MODULES section    ${mark(cases.devModulesSection?.ok)}  heading "${cases.devModulesSection?.heading}"  devCards ${JSON.stringify(cases.devModulesSection?.devCards)}`);
console.log(`       operations in grid ${JSON.stringify(cases.devModulesSection?.operationsInGrid)}  header "${cases.devModulesSection?.continuation}"`);
console.log(`  B  OCEAN TESTER veil      ${mark(cases.oceanTester?.ok)}  title="${cases.oceanTester?.veil?.title}" note="${cases.oceanTester?.veil?.note}"  navHeld ${cases.oceanTester?.navigationHeld}`);
console.log(`       covers viewport ${cases.oceanTester?.veil?.covers}  animated ${cases.oceanTester?.veil?.animated}  card busy ${cases.oceanTester?.control?.launching}  allBusy ${JSON.stringify(cases.oceanTester?.control?.allBusy)}`);
if (cases.oceanTester?.instead) console.log(`       INSTEAD ${JSON.stringify(cases.oceanTester.instead)}`);
console.log(`  C  failure is legible     ${mark(cases.failureIsLegible?.ok)}  menuLane ${cases.failureIsLegible?.notice?.menuLane}  veil down ${cases.failureIsLegible?.veilTakenDown}`);
console.log(`       notice "${cases.failureIsLegible?.notice?.text}"`);
console.log(`  page errors               ${cases.pageErrors?.length ?? '-'}`);
(cases.pageErrors || []).slice(0, 6).forEach(e => console.log(`    ${e}`));
console.log(`  screenshots               ${outDir}`);
if (!ok) { console.error('FAIL launch affordance is incomplete'); process.exit(1); }
console.log('PASS both doors show a launch state, and a failed launch says why');
