#!/usr/bin/env node
/* Ground truth on three in-session features, measured in a real match.
 *
 * All three were reported missing by the player. All three have code on disk
 * and ship in the OTA manifest, so "missing" here means unreachable, not
 * absent -- the same shape as the UNLOAD control that rendered 0x0. Static
 * reading cannot tell those apart, so this drives the real input path in a
 * real skirmish on the hardware GPU and reports what a thumb can actually do.
 *
 *   1. individual unit selection - onTap on a projected unit selects exactly it
 *   2. unit stack selection      - the per-type rail, and the strategic-zoom
 *                                  icon stack (only on above orthoSpan ~680)
 *   3. commander XP in session   - rank/xp surfaced while a match is running
 *   4. structure upgrades        - an upgrade action with a cost on a selected
 *                                  building
 *
 * Usage:
 *   node tools/probe-session-features.mjs
 *   node tools/probe-session-features.mjs --headed
 * Exit: 0 only if every feature is reachable. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const headed = process.argv.includes('--headed');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wasm': 'application/wasm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream'
};

async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? '/index.html' : pathname;
      const file = resolve(root, `.${requested}`);
      const rel = relative(root, file);
      if (!rel || rel.startsWith(`..${sep}`) || resolve(root, rel) !== file || !existsSync(file)) throw new Error('outside');
      res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('nope'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) };
}

/* Without a registered enemy commander the victory check fires on tick one and
   tears the match down before anything can be measured. */
async function enterMatch(page) {
  await page.waitForFunction(() => typeof resetWorld === 'function' && typeof deployCarrier === 'function'
    && typeof hideFrontScreens === 'function' && typeof updateHUD === 'function', null, { timeout: 180000 });
  await page.waitForFunction(() => document.body.classList.contains('mfIntroDone')
    && !document.getElementById('mfBootCover'), null, { timeout: 90000 })
    .catch(async () => { await page.evaluate(() => { const b = document.getElementById('mfIntroStart'); if (b) b.click(); }); });
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch (e) {}
    try {
      if (document.getElementById('mfOnboardingChoice') && window.MFOnboarding)
        window.MFOnboarding.decide('skipped', { flowId: 'default' });
    } catch (e) {}
    hideFrontScreens();
    try { if (typeof stopAttract === 'function') stopAttract(); } catch (e) {}
    demoMode = false; attractOn = false;
    resetWorld();
    const sp = skirmishSpawnPoints(), EP = sp[1] || sp[0], PP = sp[0];
    addBld('hq', 1, Math.round(EP.x), Math.round(EP.y), true);
    for (let i = 0; i < 4; i++) spawnUnit(0, 1, EP.x + 40 + i * 18, EP.y + 30);
    const heroT = TYPES.findIndex((t) => t && t.cat === 'hero' && t.hero === 'legion');
    const eh = spawnUnit(heroT >= 0 ? heroT : 28, 1, EP.x - 30, EP.y + 30);
    if (eh >= 0 && typeof enemyHeroIdxs !== 'undefined') enemyHeroIdxs.push(eh);
    /* Our own force: two types, clustered, so both the per-type rail and the
       strategic icon stack have something real to group. */
    /* Clear of every structure. pickPointerEntities deliberately lets a
       friendly building erase the unit pick (input.js: pk.own=-1), so units
       parked on a base measure the building rule, not unit selection. */
    const mine = [];
    for (let i = 0; i < 6; i++) mine.push(spawnUnit(0, 0, PP.x + 260 + i * 16, PP.y + 240));
    let t2 = -1;
    for (let k = 1; k < TYPES.length; k++) {
      const T = TYPES[k];
      if (T && T.cat && T.cat !== 'hero' && T.cat !== 'art') { t2 = k; break; }
    }
    if (t2 > 0) for (let i = 0; i < 4; i++) mine.push(spawnUnit(t2, 0, PP.x + 260 + i * 16, PP.y + 290));
    /* One unit deliberately parked on the HQ, to measure that case separately. */
    const onBase = spawnUnit(0, 0, PP.x + 6, PP.y + 6);
    if (onBase >= 0) mine.push(onBase);
    window.__probeOnBase = onBase;
    addBld('hq', 0, Math.round(PP.x), Math.round(PP.y), true);
    /* A player commander, or #heroBar hides itself and the in-session XP track
       it owns cannot be measured at all (main.js spawns heroIdx this way). */
    const PH = typeof PLAYER_HERO !== 'undefined' ? PLAYER_HERO : null;
    heroIdx = spawnUnit(PH && PH.hero != null ? PH.hero : 4, 0, PP.x + 40, PP.y + 40);
    /* HQ deliberately has no BUP entry, so testing upgrades on it measures the
       absence of a path rather than the reachability of the control. Place one
       structure that genuinely has an upgrade path. */
    const upType = Object.keys(BUP).filter((k) => k !== 'fac')[0] || 'turret';
    addBld(upType, 0, Math.round(PP.x + 90), Math.round(PP.y + 90), true);
    carrier.active = true; carrier.phase = 1; carrier.alt = 0; carrier.clearance = 0;
    carrier.tx = carrier.x; carrier.ty = carrier.y;
    deployCarrier();
    running = true; paused = false; gameEnded = false;
    const live = mine.filter((i) => i >= 0);
    const types = [];
    for (const i of live) if (types.indexOf(utype[i]) < 0) types.push(utype[i]);
    return { running: running, mine: live.length, types: types.length };
  });
}

const findings = [];
const record = (name, ok, detail) => {
  findings.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' — ' + detail : ''));
};

const server = await startServer();
const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: !headed });
try {
  const context = await browser.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String((e && e.message) || e)));
  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const entered = await enterMatch(page);
  record('match is live with a player force', entered.running && entered.mine >= 6,
    'running=' + entered.running + ' ownUnits=' + entered.mine + ' types=' + entered.types);
  await page.waitForTimeout(1200);

  /* ---- 1. individual unit selection through the real tap path ---- */
  const single = await page.evaluate(async () => {
    const own = [];
    for (let i = 0; i < unitHigh; i++)
      if (ualive[i] && uteam[i] === 0 && TYPES[utype[i]].cat !== 'hero' && i !== window.__probeOnBase) own.push(i);
    if (!own.length) return { err: 'no own units' };
    const target = own[0];
    if (typeof clearSel === 'function') clearSel();
    /* Close in so the icon stack is off and this is a genuine single pick.
       The camera is a cam{x,y,z} object; there is no camX/camY, and w2s reads
       matVP/VW/VH, which only refresh inside the game's own rAF frame. Setting
       the camera and projecting in the same turn reads a stale matrix and
       returns a point outside the viewport. */
    /* orthoSpan lerps toward distTarget every frame, so setting the span alone
       is undone before the tap lands and icon stacking (>680) switches back on
       -- which selects the whole stack and looks like a selection bug. */
    orthoSpan = distTarget = 320;
    cam.x = ux[target]; cam.y = uy[target];
    camFollow = -1;
    for (let f = 0; f < 6; f++) {
      orthoSpan = distTarget = 320;
      await new Promise((r) => requestAnimationFrame(r));
    }
    const settledSpan = orthoSpan;
    const stackingNow = typeof mfIconStackOn === 'function' ? mfIconStackOn() : null;
    const p = (typeof w2s === 'function') ? w2s(ux[target], uy[target]) : null;
    if (!p) return { err: 'w2s unavailable or returned nothing' };
    const inView = p[0] >= 0 && p[0] <= innerWidth && p[1] >= 0 && p[1] <= innerHeight;
    if (!inView) return { err: 'projected off-screen at ' + JSON.stringify([Math.round(p[0]), Math.round(p[1])])
      + ' for viewport ' + innerWidth + 'x' + innerHeight + ' — probe could not aim, not a game verdict' };
    /* Separate "the probe aimed wrong" from "selection is broken". If the
       screen point does not invert back onto the unit, the aim is at fault and
       nothing after it is a verdict on the game. */
    const back = (typeof s2w === 'function') ? s2w(p[0], p[1]) : null;
    const drift = back ? Math.hypot(back[0] - ux[target], back[1] - uy[target]) : -1;
    const picked = (typeof pickUnit === 'function') ? pickUnit(ux[target], uy[target]) : null;
    const pickedAtTap = (back && typeof pickUnit === 'function') ? pickUnit(back[0], back[1]) : null;
    onTap(p[0], p[1], 'touch');
    const sel = [];
    for (let i = 0; i < unitHigh; i++) if (ualive[i] && usel[i]) sel.push(i);
    return { target: target, count: sel.length, hit: sel.length === 1 && sel[0] === target,
      screen: [Math.round(p[0]), Math.round(p[1])],
      drift: Math.round(drift * 10) / 10,
      pickAtUnit: picked ? picked.own : 'n/a',
      pickAtTap: pickedAtTap ? pickedAtTap.own : 'n/a',
      span: Math.round(settledSpan), stacking: stackingNow,
      aiming: typeof aiming !== 'undefined' ? aiming : 'n/a',
      placing: typeof placing !== 'undefined' ? !!placing : 'n/a',
      armQueue: typeof armQueue !== 'undefined' ? !!armQueue : 'n/a' };
  });
  record('tapping one unit selects exactly that unit', !!single.hit,
    single.err ? single.err
      : 'tapped ' + JSON.stringify(single.screen) + ' -> ' + single.count + ' selected'
        + (single.hit ? '' : ' (wanted only #' + single.target + ')')
        + ' | roundTripDrift=' + single.drift + ' pickAtUnit=' + single.pickAtUnit
        + ' pickAtTap=' + single.pickAtTap + ' span=' + single.span
        + ' stackingOn=' + single.stacking + ' aiming=' + single.aiming
        + ' placing=' + single.placing + ' armQueue=' + single.armQueue);

  /* ---- 1b. a unit standing on a friendly structure ---- */
  const onBase = await page.evaluate(async () => {
    const t = window.__probeOnBase;
    if (t == null || t < 0 || !ualive[t]) return { err: 'no unit parked on the base' };
    if (typeof clearSel === 'function') clearSel();
    if (typeof closeMenus === 'function') closeMenus();
    orthoSpan = distTarget = 320;
    cam.x = ux[t]; cam.y = uy[t]; camFollow = -1;
    for (let f = 0; f < 6; f++) {
      orthoSpan = distTarget = 320;
      await new Promise((r) => requestAnimationFrame(r));
    }
    const p = w2s(ux[t], uy[t]);
    if (!p || p[0] < 0 || p[0] > innerWidth || p[1] < 0 || p[1] > innerHeight)
      return { err: 'projected off-screen; probe could not aim' };
    const bld = typeof pickBld === 'function' ? pickBld(...s2w(p[0], p[1]), p[0], p[1]) : -1;
    const pk = typeof pickPointerEntities === 'function'
      ? pickPointerEntities(...s2w(p[0], p[1]), p[0], p[1], 'touch') : null;
    const raw = typeof pickUnitPointer === 'function'
      ? pickUnitPointer(...s2w(p[0], p[1]), p[0], p[1], 'touch') : null;
    const skipped = typeof mfIconStackSkip === 'function' ? !!mfIconStackSkip(t) : null;
    onTap(p[0], p[1], 'touch');
    let sel = 0, selT = false;
    for (let i = 0; i < unitHigh; i++) if (ualive[i] && usel[i]) { sel++; if (i === t) selT = true; }
    const menu = document.getElementById('bldMenu2') || document.getElementById('prodMenu');
    const menuUp = !!(menu && getComputedStyle(menu).display !== 'none' && menu.getBoundingClientRect().height > 0);
    /* Leave no panel open. A structure menu is uiPanelOpen, which correctly
       suppresses the PLATOONS row, so forgetting this makes every later rail
       check fail for a reason that has nothing to do with the rail. */
    try { if (typeof closeMenus === 'function') closeMenus(); } catch (e) {}
    await new Promise((r) => requestAnimationFrame(r));
    return { target: t, sel, selT, bldUnderTap: bld, ownDirect: pk ? !!pk.ownDirect : null, menuUp,
      pkOwn: pk ? pk.own : null, rawOwn: raw ? raw.own : null,
      rawStack: raw ? !!raw.ownStack : null, stackSkip: skipped };
  });
  record('tapping a unit standing on your own structure selects the unit',
    !onBase.err && onBase.selT && onBase.sel === 1,
    onBase.err ? onBase.err
      : 'unit #' + onBase.target + ' on building ' + onBase.bldUnderTap
        + ': selected=' + onBase.sel + ' gotUnit=' + onBase.selT
        + ' pk.own=' + onBase.pkOwn + ' ownDirect=' + onBase.ownDirect
        + ' rawOwn=' + onBase.rawOwn + ' viaStack=' + onBase.rawStack
        + ' stackSkip=' + onBase.stackSkip + ' menuOpened=' + onBase.menuUp);

  /* ---- 1c. panning a scrollable row must not fire its buttons ---- */
  const panSafe = await (async () => {
    await page.evaluate(() => {
      try { if (typeof showHudDock === 'function') showHudDock(true, 'platoons'); } catch (e) {}
      try { if (typeof setHudDeck === 'function') setHudDeck('platoons', true); } catch (e) {}
      if (window.MFUnitStackHotbar) MFUnitStackHotbar.sync();
    });
    await page.waitForTimeout(700);
    const card = await page.$('#mfUnitStackRail .mfUnitStackCard');
    if (!card) return { err: 'no stack card to pan from' };
    await page.evaluate(() => { if (typeof clearSel === 'function') clearSel(); });
    const box = await card.boundingBox();
    if (!box) return { err: 'card has no box' };
    /* Press on the card and drag well past the slop radius, as a pan does. */
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(box.x + box.width / 2 - i * 12, box.y + box.height / 2);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(200);
    const sel = await page.evaluate(() => {
      let n = 0; for (let i = 0; i < unitHigh; i++) if (ualive[i] && usel[i]) n++; return n;
    });
    return { sel };
  })();
  record('panning across a stack card does not activate it',
    !panSafe.err && panSafe.sel === 0,
    panSafe.err ? panSafe.err : 'after a 72px drag: ' + panSafe.sel + ' unit(s) selected (want 0)');

  /* ---- 2a. per-type stack rail ---- */
  const rail = await page.evaluate(async () => {
    if (!window.MFUnitStackHotbar) return { err: 'MFUnitStackHotbar is not defined' };
    const measure = () => {
      const e = document.getElementById('mfUnitStackRail');
      if (!e) return null;
      const rc = e.getBoundingClientRect();
      return { w: Math.round(rc.width), h: Math.round(rc.height) };
    };
    /* The rail lives inside #grpRow, which is the PLATOONS deck of the HUD
       dock and starts display:none. Measuring only the default deck cannot
       tell a broken control from one the player simply never opens, so record
       both and let the deck that owns it have its say. */
    MFUnitStackHotbar.sync();
    const deckBefore = typeof hudDeck !== 'undefined' ? String(hudDeck) : '(unknown)';
    const el0 = document.getElementById('mfUnitStackRail');
    const atDefault = measure();
    if (typeof setHudDeck === 'function') {
      try { if (typeof showHudDock === 'function') showHudDock(true, 'platoons'); } catch (e) {}
      setHudDeck('platoons', true);
    }
    for (let f = 0; f < 4; f++) await new Promise((r) => requestAnimationFrame(r));
    MFUnitStackHotbar.sync();
    await new Promise((r) => requestAnimationFrame(r));
    const snap = MFUnitStackHotbar.snapshot();
    const el = document.getElementById('mfUnitStackRail');
    if (!el) return { err: 'no #mfUnitStackRail in the document', railCount: snap && snap.railCount };
    const grp = document.getElementById('grpRow');
    const grpCs = grp ? getComputedStyle(grp) : null;
    const grpRect = grp ? grp.getBoundingClientRect() : null;
    /* #unitCard is the unit info card, and mfUiIntelOpen() is simply 'is it
       visible'. Selecting a unit opens it, which sets uiPrimaryOpen, which the
       cinematic rule turns into display:none!important on #grpRow. Dismiss it
       and re-measure to prove the causal chain rather than infer it. */
    /* The real scenario: a unit IS selected, so the card is up. Measure that
       first -- measuring only after dismissing would test a state no player is
       in when they reach for the stack rail. */
    const withCardOpen = measure();
    const card = document.getElementById('unitCard');
    const cardRect = card && getComputedStyle(card).display !== 'none' ? card.getBoundingClientRect() : null;
    const railRect = el0 ? el0.getBoundingClientRect() : null;
    let overlap = 0;
    if (cardRect && railRect && railRect.width > 0) {
      const ox = Math.max(0, Math.min(cardRect.right, railRect.right) - Math.max(cardRect.left, railRect.left));
      const oy = Math.max(0, Math.min(cardRect.bottom, railRect.bottom) - Math.max(cardRect.top, railRect.top));
      overlap = Math.round(ox * oy);
    }
    let afterDismiss = null;
    if (typeof mfUiDismissIntel === 'function') {
      mfUiDismissIntel();
      if (typeof mfUiSync === 'function') mfUiSync();
      for (let f = 0; f < 3; f++) await new Promise((r) => requestAnimationFrame(r));
      MFUnitStackHotbar.sync();
      await new Promise((r) => requestAnimationFrame(r));
      afterDismiss = measure();
      afterDismiss.body = document.body.className;
    }
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const cards = [].slice.call(el.querySelectorAll('button,[role="button"]'));
    let selectedAfter = -1;
    if (cards.length) {
      cards[0].click();
      selectedAfter = 0;
      for (let i = 0; i < unitHigh; i++) if (ualive[i] && usel[i]) selectedAfter++;
    }
    return { cards: cards.length, w: Math.round(r.width), h: Math.round(r.height),
      display: cs.display, vis: cs.visibility, op: cs.opacity,
      onScreen: r.width > 0 && r.height > 0, selectedAfter: selectedAfter,
      railCount: snap && snap.railCount, cardCount: snap && snap.cardCount,
      deckBefore: deckBefore, atDefault: atDefault,
      grpDisplay: grpCs ? grpCs.display : '(no #grpRow)',
      grpSize: grpRect ? Math.round(grpRect.width) + 'x' + Math.round(grpRect.height) : 'n/a',
      bodyClass: document.body.className, afterDismiss: afterDismiss,
      withCardOpen: withCardOpen, overlap: overlap, cardUp: !!cardRect,
      grpInline: grp ? (grp.getAttribute('style') || '') : '' };
  });
  record('stack rail is visible WHILE a unit is selected', !!(rail.withCardOpen && rail.withCardOpen.w > 0 && rail.withCardOpen.h > 0 && rail.cards > 0),
    rail.err ? rail.err
      : 'withUnitCardUp=' + (rail.withCardOpen ? rail.withCardOpen.w + 'x' + rail.withCardOpen.h : 'n/a')
        + ' cardUp=' + rail.cardUp + ' overlapPx=' + rail.overlap + ' cards=' + rail.cards
        + ' | defaultDeck=' + rail.deckBefore + ' railThere=' + (rail.atDefault ? rail.atDefault.w + 'x' + rail.atDefault.h : 'absent')
        + ' | #grpRow display=' + rail.grpDisplay + ' size=' + rail.grpSize
        + ' | afterDismissingUnitCard=' + (rail.afterDismiss ? rail.afterDismiss.w + 'x' + rail.afterDismiss.h : 'n/a'));
  /* The cards bind through mfBindTap (pointer events), not a click listener,
     so an in-page .click() never reaches the handler. Drive a real tap. */
  const tapped = await (async () => {
    /* Tap the LARGEST stack. Tapping whichever card sorts first can land on a
       one-unit stack, where 'selected 1 of 1' passes without ever proving that
       a stack tap selects a stack. */
    const pick = await page.evaluate(() => {
      const cards = [].slice.call(document.querySelectorAll('#mfUnitStackRail .mfUnitStackCard'));
      let best = null;
      for (const c of cards) {
        const t = Number(c.dataset.unitType);
        let n = 0;
        for (let i = 0; i < unitHigh; i++)
          if (ualive[i] && utype[i] === t && (typeof mfLocalOwnsUnit === 'function' ? mfLocalOwnsUnit(i) : uteam[i] === 0)) n++;
        if (!best || n > best.members) best = { type: t, members: n };
      }
      return best;
    });
    if (!pick) return { err: 'no stack cards present' };
    const sel = '#mfUnitStackRail .mfUnitStackCard[data-unit-type="' + pick.type + '"]';
    const card = await page.$(sel);
    if (!card) return { err: 'no .mfUnitStackCard to tap' };
    await page.evaluate(() => { if (typeof clearSel === 'function') clearSel(); });
    await card.click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
    const got = await page.evaluate(() => {
      let n = 0;
      for (let i = 0; i < unitHigh; i++) if (ualive[i] && usel[i]) n++;
      return n;
    });
    return { want: pick.members, got: got, type: pick.type };
  })();
  record('tapping a stack card selects that whole stack',
    !tapped.err && tapped.got > 0 && tapped.got === tapped.want,
    tapped.err ? tapped.err
      : 'card type ' + tapped.type + ': selected ' + tapped.got + ' of ' + tapped.want + ' owned');

  /* ---- 2b. strategic icon stack ---- */
  const stack = await page.evaluate(async () => {
    if (typeof mfIconStackOn !== 'function') return { err: 'mfIconStackOn missing' };
    /* The stack table is rebuilt inside the render frame and culls by
       visibility, so it must be given real frames at the new span -- otherwise
       it reads a stale matrix, culls everything, and reports zero stacks. */
    orthoSpan = distTarget = 900;
    for (let f = 0; f < 6; f++) {
      orthoSpan = distTarget = 900;
      await new Promise((r) => requestAnimationFrame(r));
    }
    const on = mfIconStackOn();
    const own = [];
    for (let i = 0; i < unitHigh; i++) if (ualive[i] && uteam[i] === 0) own.push(i);
    const stacked = own.filter((i) => typeof mfIconStackSkip === 'function' && mfIconStackSkip(i));
    let picked = 0;
    if (stacked.length) {
      if (typeof clearSel === 'function') clearSel();
      if (typeof mfIconStackSelect === 'function') mfIconStackSelect(stacked[0]);
      for (let i = 0; i < unitHigh; i++) if (ualive[i] && usel[i]) picked++;
    }
    return { on: on, stacked: stacked.length, picked: picked, span: orthoSpan };
  });
  record('strategic icon stack groups and selects as one', !!(stack.on && stack.stacked > 0 && stack.picked > 1),
    stack.err ? stack.err
      : 'stackingOn=' + stack.on + ' stackedUnits=' + stack.stacked + ' selected=' + stack.picked
        + ' @orthoSpan=' + stack.span);

  /* ---- 3. commander XP during the session ---- */
  const xp = await page.evaluate(() => {
    const hasMeta = typeof META === 'object' && META && typeof META.xp === 'number';
    const rankFn = typeof metaRankIdx === 'function';
    const nodes = [].slice.call(document.querySelectorAll('body *')).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && el.children.length === 0;
    });
    const texts = nodes.map((el) => (el.textContent || '').trim()).filter(Boolean);
    const rankNames = ['Recruit', 'Private', 'Corporal', 'Sergeant', 'Lieutenant',
      'Captain', 'Major', 'Colonel', 'General', 'Warmaster'];
    const showsRank = texts.some((t) => rankNames.some((r) => t.indexOf(r) >= 0));
    const showsXp = texts.some((t) => /\bXP\b/i.test(t));
    const bar = document.getElementById('heroBar');
    const barRect = bar ? bar.getBoundingClientRect() : null;
    const lvlTxt = ((document.getElementById('heroLvlTxt') || {}).textContent || '').trim();
    const xpTxt = ((document.getElementById('heroXpTxt') || {}).textContent || '').trim();
    const heroLive = typeof heroIdx === 'number' && heroIdx >= 0 && !!ualive[heroIdx];
    const xpNums = typeof heroXp === 'number' ? heroXp + '/' + heroXpNext : 'n/a';
    /* Measure the XP row itself rather than reasoning from breakpoints: the
       cinematic HUD hides .heroVital outright in one media query and restores
       it in another, so only the rendered box is authoritative. */
    const box = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return 'absent';
      const rc = e.getBoundingClientRect();
      return Math.round(rc.width) + 'x' + Math.round(rc.height) + '/' + getComputedStyle(e).display;
    };
    const xpRow = box('#heroBar .heroXp');
    const chip = box('#heroXpChip');
    const chipTxt = ((document.getElementById('heroXpChipTxt') || {}).textContent || '').trim();
    const chipFill = (document.getElementById('heroXpChipFill') || {}).style ? document.getElementById('heroXpChipFill').style.width : 'n/a';
    const xpBar = box('#xpOuter');
    const xpVal = box('#heroXpTxt');
    const pBody = box('#heroBar .heroProfileBody');
    const pHead = box('#heroBar .heroProfileHead');
    const lvlBox = box('#heroLvlTxt');
    const nameBox = box('#heroNameTxt');
    return { hasMeta: hasMeta, xpValue: hasMeta ? META.xp : null, rankFn: rankFn,
      showsRank: showsRank, showsXp: showsXp, sampled: texts.length,
      heroLive: heroLive, lvlTxt: lvlTxt, xpTxt: xpTxt, xpNums: xpNums,
      xpRow: xpRow, xpBar: xpBar, xpVal: xpVal, chip: chip, chipTxt: chipTxt, chipFill: chipFill, pBody: pBody, pHead: pHead, lvlBox: lvlBox, nameBox: nameBox,
      barSize: barRect ? Math.round(barRect.width) + 'x' + Math.round(barRect.height) : 'absent' };
  });
  /* A static readout proves nothing: it has to track real progression. Award
     XP through the real heroXP() path and confirm the chip follows. */
  const xpLive = await page.evaluate(async () => {
    if (typeof heroXP !== 'function') return { err: 'heroXP missing' };
    const before = (document.getElementById('heroXpChipTxt') || {}).textContent || '';
    heroXP(45);
    /* updateHUD does its full work on a 1-in-10 frame gate (hud.js: if
       ((hudFrame++)%10) ... return), so a single call lands on the early
       return and measures nothing. Give it real frames. */
    for (let f = 0; f < 16; f++) await new Promise((r) => requestAnimationFrame(r));
    const el = document.getElementById('heroXpChipFill');
    return { before: before.trim(),
      after: ((document.getElementById('heroXpChipTxt') || {}).textContent || '').trim(),
      fill: el ? el.style.width : 'n/a', lvl: heroLvl, raw: heroXp + '/' + heroXpNext };
  });
  record('commander XP readout tracks real progression',
    !xpLive.err && xpLive.after !== xpLive.before && /[1-9]/.test(String(xpLive.fill)),
    xpLive.err ? xpLive.err
      : 'awarded 45 XP: "' + xpLive.before + '" -> "' + xpLive.after + '" fill=' + xpLive.fill + ' state=' + xpLive.raw);

  record('commander XP is visible during a match', !!(xp.heroLive && xp.chip !== 'absent' && /^[0-9]+x[0-9]+/.test(xp.chip) && parseInt(xp.chip,10) > 0 && /XP/.test(xp.chipTxt)),
    'heroBar=' + xp.barSize + ' heroAlive=' + xp.heroLive + ' lvl="' + xp.lvlTxt
      + '" xpReadout="' + xp.xpTxt + '" heroXp=' + xp.xpNums
      + ' | chip=' + xp.chip + ' reads="' + xp.chipTxt + '" fill=' + xp.chipFill + ' (legacy .heroXp=' + xp.xpRow + ')');

  /* ---- 4. structure upgrades ---- */
  const upg = await page.evaluate(async () => {
    /* The icon-stack check above leaves the camera at strategic span. Restore a
       tactical view and let the HUD settle, so this measures the upgrade
       control and not leftover state from the previous check. */
    orthoSpan = distTarget = 320;
    for (let f = 0; f < 6; f++) {
      orthoSpan = distTarget = 320;
      await new Promise((r) => requestAnimationFrame(r));
    }
    try { if (typeof closeMenus === 'function') closeMenus(); } catch (e) {}
    await new Promise((r) => requestAnimationFrame(r));
    /* Must be a structure that actually has an upgrade path: BUP has no hq
       entry, so an HQ correctly offers nothing and would measure the wrong
       thing entirely. */
    let mine = -1;
    for (let i = 0; i < blds.length; i++)
      if (blds[i] && blds[i].team === 0 && blds[i].alive && BUP[blds[i].type]) { mine = i; break; }
    if (mine < 0) return { err: 'no player building with a BUP upgrade path' };
    if (typeof openBldMenu !== 'function') return { err: 'openBldMenu missing' };
    openBldMenu(mine);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const B = blds[mine];
    const path = BUP[B.type], U = path && path[(B.lvl || 1) - 1];
    const txt = document.body.innerText || '';
    /* The control has to be on screen and hittable, not merely present: a
       populated element measuring 0x0 is exactly how the stack rail fails. */
    const nodes = [].slice.call(document.querySelectorAll('button,[role="button"]'));
    const upBtns = nodes.filter((el) => /upgrade/i.test(el.textContent || ''));
    const hittable = upBtns.filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    });
    const label = hittable.length ? (hittable[0].textContent || '').trim().slice(0, 60) : '';
    return { bld: B.type, lvl: B.lvl || 1, hasApi: typeof startUpgrade === 'function',
      cost: U ? U.cm + 'm ' + U.ce + 'e ' + U.t + 's' : '(no next tier)',
      menuMentionsUpgrade: /upgrade/i.test(txt),
      upButtons: upBtns.length, hittable: hittable.length, label: label };
  });
  record('selected structure offers a hittable upgrade with a cost',
    !!(upg.hittable > 0),
    upg.err ? upg.err
      : upg.bld + ' Mk' + upg.lvl + ' next=' + upg.cost + ' api=' + upg.hasApi
        + ' upgradeButtons=' + upg.upButtons + ' hittable=' + upg.hittable
        + (upg.label ? ' label="' + upg.label + '"' : ''));

  const fatal = errs.filter((e) => !/WebGL|GPU|hardware|AudioContext/i.test(e));
  record('no fatal page errors during the session', fatal.length === 0, fatal.slice(0, 2).join(' | ') || 'none');
  await context.close();
} finally {
  await closePwBrowser(browser).catch(() => {});
  await server.close();
}

const missing = findings.filter((f) => !f.ok);
console.log('');
if (missing.length) {
  console.log('SESSION FEATURES INCOMPLETE — ' + missing.length + ' of ' + findings.length + ' not reachable:');
  for (const m of missing) console.log('  - ' + m.name + ': ' + m.detail);
  process.exit(1);
}
console.log('SESSION FEATURES VERIFIED — all ' + findings.length + ' reachable in a live match.');
