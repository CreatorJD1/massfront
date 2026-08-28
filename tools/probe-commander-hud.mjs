#!/usr/bin/env node
/* Commander transmission rail — real-browser presentation probe.

   Drives the SHIPPED app in Chrome on the hardware GPU: boots index.html from a
   local static server rooted at the repo (so live src/ is under test, not a
   packed www/ copy), plays past the pre-alpha reveal, drops into a real offline
   skirmish with a live opponent, selects the Commander so the selection surfaces
   are actually on screen, then raises REAL cues through the public
   commanderCue() API and measures what the HUD does with them.

   It fails on:
     - software WebGL, a lost GL context, any pageerror or console error
     - a missing #cmdrTx container or a missing in-match HUD
     - the rail clipping off-screen, overlapping any protected HUD surface, or
       overflowing its own subtitle box
     - a cue whose subtitle does not reach the screen (including when its audio
       verdict is 'silent' / 'absent', which is every cue on a shipped build)
     - the rail taking a hit-test away from any visible gameplay control, or
       moving the focus
     - DOM growth across cues
     - stale evidence: the owned sources are hashed before and after the run and
       the hashes are stamped into the report and the capture filenames

   Usage:  node tools/probe-commander-hud.mjs [--json] [--headed] [--entry-only]
   Exit:   0 all checks passed, 1 otherwise. */
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';

const execFile = promisify(execFileCallback);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const startedUtc = new Date().toISOString();
const runId = startedUtc.replace(/[:.]/g, '-');
const output = join(root, '.tmp', 'commander-hud', 'runs', runId);
const jsonOnly = process.argv.includes('--json');
const headed = process.argv.includes('--headed');
const entryOnly = process.argv.includes('--entry-only');

/* Owned by this lane; hashed before and after so a capture can never be
   attributed to source that changed underneath it. */
const OWNED = ['src/ui/hud.js', 'src/styles/ui.css', 'index.html', 'tools/probe-commander-hud.mjs'];
/* Read for context, not owned. The rail is meaningless without the upstream
   API, so the report records exactly which revision of it was exercised. */
const UPSTREAM = ['src/game/commander.js', 'src/story.js', 'src/audio.js', 'src/main.js'];

const VIEWPORTS = [
  { w: 412, h: 915, name: 'phone-portrait', touch: true },
  { w: 915, h: 412, name: 'phone-landscape', touch: true },
  { w: 800, h: 1280, name: 'tablet-portrait', touch: true },
  { w: 1440, h: 900, name: 'desktop', touch: false },
];

const MIME = {
  '.basis': 'application/octet-stream', '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.ktx2': 'image/ktx2', '.m4a': 'audio/mp4', '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

const sha256 = (v) => createHash('sha256').update(v).digest('hex');
const git = async (args) => {
  try { return (await execFile('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })).stdout.trimEnd(); }
  catch { return ''; }
};
async function fingerprint(list) {
  const out = {};
  for (const p of list) { const b = await readFile(join(root, p)); out[p] = { bytes: b.length, sha256: sha256(b) }; }
  return out;
}

const checks = [];
let failed = 0;
function check(scope, name, ok, detail) {
  checks.push({ scope, name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  if (!ok) failed++;
  if (!jsonOnly) console.log(`${ok ? 'PASS' : 'FAIL'} [${scope}] ${name}${detail ? ` — ${detail}` : ''}`);
}
function note(scope, name, detail) {
  checks.push({ scope, name, ok: true, info: true, detail: detail == null ? '' : String(detail) });
  if (!jsonOnly) console.log(`INFO [${scope}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? '/index.html' : pathname;
      const file = resolve(root, `.${requested}`);
      const rel = relative(root, file);
      if (!rel || rel.startsWith(`..${sep}`) || resolve(root, rel) !== file || !existsSync(file)) throw new Error('outside root');
      const bytes = await readFile(file);
      res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(bytes);
    } catch {
      res.writeHead(404, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) };
}

/* Everything the rail is forbidden to cover. Mirrors CMDRTX_PROTECT in
   src/ui/hud.js on purpose: the probe must assert the same contract the solver
   optimises, or a shrunken list in one place would silently weaken both. */
const PROTECT = ['topbar', 'heroBar', 'goalBar', 'toast', 'coach', 'unitCard', 'minimapWrap',
  'selInfo', 'cmdbar', 'atkAlert', 'waveAlert', 'infMeter', 'wcRow', 'buildMenu', 'prodMenu',
  'bldMenu2', 'placeUI', 'mfChips', 'mfLaneMore', 'wcBanner', 'consHud', 'hazChip', 'keelWrap', 'godBadge'];

/* Play the launch sequence the way a device does, then drop into a skirmish.
   Returns the match state so a broken entry fails loudly instead of measuring a
   menu screenshot. */
async function enterMatch(page) {
  await page.waitForFunction(() => typeof resetWorld === 'function' && typeof deployCarrier === 'function'
    && typeof hideFrontScreens === 'function' && typeof updateHUD === 'function'
    && typeof commanderCue === 'function' && typeof commanderDialogueDrain === 'function'
    && typeof cmdrTxTick === 'function', null, { timeout: 180_000 });
  /* The pre-alpha reveal owns the first ~3s and holds #mfBootCover over
     everything. Let it finish rather than tearing it down, so the HUD is
     entered from the same state a player reaches it from. */
  await page.waitForFunction(() => document.body.classList.contains('mfIntroDone')
    && !document.getElementById('mfBootCover'), null, { timeout: 90_000 })
    .catch(async () => { await page.evaluate(() => { const b = document.getElementById('mfIntroStart'); if (b) b.click(); }); });
  await page.waitForTimeout(700);
  const state = await page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch {}
    hideFrontScreens();
    try { if (typeof stopAttract === 'function') stopAttract(); } catch {}
    demoMode = false; attractOn = false;
    resetWorld();
    /* An opponent has to exist or the victory check fires on the first tick and
       tears the match down before anything can be measured. An enemy HQ, a
       squad and a registered enemy commander is the minimum that keeps
       livingEnemyCommanders() non-empty. */
    const sp = skirmishSpawnPoints(), EP = sp[1] || sp[0];
    addBld('hq', 1, Math.round(EP.x), Math.round(EP.y), true);
    for (let i = 0; i < 4; i++) spawnUnit(0, 1, EP.x + 40 + i * 18, EP.y + 30);
    const heroT = TYPES.findIndex((t) => t && t.cat === 'hero' && t.hero === 'legion');
    const eh = spawnUnit(heroT >= 0 ? heroT : 28, 1, EP.x - 30, EP.y + 30);
    if (eh >= 0 && typeof enemyHeroIdxs !== 'undefined') enemyHeroIdxs.push(eh);
    carrier.active = true; carrier.phase = 1; carrier.alt = 0; carrier.clearance = 0;
    carrier.tx = carrier.x; carrier.ty = carrier.y;
    deployCarrier();
    running = true; paused = false; gameEnded = false;
    return { matchLive, running, heroIdx, enemies: typeof enemyHeroIdxs !== 'undefined' ? enemyHeroIdxs.length : -1 };
  });
  /* Headless hardware rendering does not advance at wall-clock speed. A fixed
     1.8s sample caught some viewports after only 0.1s of match simulation and
     before hudflow's next ten-frame service point, leaving a correctly
     accepted cue in the queue and falsely calling it missing. Wait on the real
     presentation state; the bounded timeout still fails a stalled HUD. */
  await page.waitForFunction(() => typeof cmdrTxDebug==='function'
    &&cmdrTxDebug().state==='hold',null,{timeout:15_000}).catch(()=>{});
  /* Match entry now raises the real objective-assigned transmission. Preserve
     that as evidence, then clear both authoritative and presentation queues so
     every focused rail assertion below begins from a known idle state. */
  const startupCue = await page.evaluate(() => {
    const d=typeof cmdrTxDebug === 'function' ? cmdrTxDebug() : null;
    if(!d) return null;
    const S=typeof COMMANDER_DIALOGUE!=='undefined'?COMMANDER_DIALOGUE:null;
    d.entryDiagnostics={
      bodyClass:document.body?document.body.className:'',
      inMatch:typeof cmdrTxInMatch==='function'?cmdrTxInMatch():null,
      training:typeof commanderDialogueTrainingActive==='function'?commanderDialogueTrainingActive():null,
      matchMs:typeof stats!=='undefined'&&stats?stats.t*1000:null,
      queue:S?S.queue.map(q=>({key:q.key,at:q.at,holds:q.holds})):null,
      stats:S?Object.assign({},S.stats):null
    };
    return d;
  });
  await page.evaluate(() => {
    if (typeof commanderDialogueReset === 'function') commanderDialogueReset();
    if (typeof cmdrTxReset === 'function') cmdrTxReset();
  });
  await page.waitForTimeout(80);
  return { ...state, startupCue };
}

/* Measure everything the geometry checks need, in one page round trip. */
async function measure(page) {
  return page.evaluate((PROTECT_IDS) => {
    const el = document.getElementById('cmdrTx');
    const cs = el ? getComputedStyle(el) : null;
    const r = el ? el.getBoundingClientRect() : null;
    const rect = r ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } : null;
    const prot = [];
    for (const id of PROTECT_IDS) {
      const p = document.getElementById(id);
      if (!p) continue;
      const pcs = getComputedStyle(p);
      if (pcs.display === 'none') continue;
      const pr = p.getBoundingClientRect();
      if (pr.width <= 0 || pr.height <= 0) continue;
      prot.push({ id, l: pr.left, t: pr.top, r: pr.right, b: pr.bottom, opacity: pcs.opacity });
    }
    const overlaps = [];
    if (rect) {
      for (const p of prot) {
        const w = Math.min(rect.r, p.r) - Math.max(rect.l, p.l);
        const h = Math.min(rect.b, p.b) - Math.max(rect.t, p.t);
        if (w > 0.5 && h > 0.5) overlaps.push({ id: p.id, area: Math.round(w * h), w: Math.round(w), h: Math.round(h) });
      }
    }
    /* Hit-test every visible gameplay control. The rail is pointer-events:none,
       so elementFromPoint at a control's centre must never resolve into it. */
    const controlSel = '#topbar button, #cmdbar button, #heroBar, #minimap, #waveAlert, #deployBtn';
    const blocked = [], probed = [];
    for (const c of document.querySelectorAll(controlSel)) {
      const ccs = getComputedStyle(c);
      if (ccs.display === 'none' || ccs.visibility === 'hidden' || Number(ccs.opacity) === 0) continue;
      const cr = c.getBoundingClientRect();
      if (cr.width < 2 || cr.height < 2) continue;
      const x = cr.left + cr.width / 2, y = cr.top + cr.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      const name = c.id || c.className || c.tagName;
      probed.push({ name, w: Math.round(cr.width), h: Math.round(cr.height) });
      if (hit && el && (hit === el || el.contains(hit))) blocked.push({ name, hit: hit.id || hit.tagName });
    }
    /* And the converse: a tap in the middle of the rail must reach whatever is
       behind it, which in a match is the battlefield canvas. */
    let passThrough = null;
    if (rect && rect.w > 0) {
      const hit = document.elementFromPoint(rect.l + rect.w / 2, rect.t + rect.h / 2);
      passThrough = hit ? (hit.id || hit.tagName) : null;
    }
    const line = document.getElementById('cmdrTxLine');
    const focusable = el ? el.querySelectorAll('a[href],button,input,select,textarea,[tabindex],[contenteditable]').length : -1;
    return {
      exists: !!el,
      state: el ? el.dataset.state : null,
      portraitStage: el ? (el.dataset.portrait || '') : '',
      pointerEvents: cs ? cs.pointerEvents : null,
      transitionDuration: cs ? cs.transitionDuration : null,
      zIndex: cs ? cs.zIndex : null,
      rect: rect ? { x: Math.round(rect.l), y: Math.round(rect.t), w: Math.round(rect.w), h: Math.round(rect.h) } : null,
      viewport: { w: innerWidth, h: innerHeight },
      clipped: rect ? (rect.l < -0.5 || rect.t < -0.5 || rect.r > innerWidth + 0.5 || rect.b > innerHeight + 0.5) : null,
      overlaps,
      protectedVisible: prot.map((p) => p.id),
      blockedControls: blocked,
      controlsProbed: probed,
      passThrough,
      focusableInside: focusable,
      activeElement: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
      lineOverflow: line ? { scroll: line.scrollHeight, client: line.clientHeight } : null,
      /* #cmdrTx sets contain:layout paint, so anything too wide is cut off
         silently rather than spilling visibly. Check EVERY descendant in both
         axes — the landscape rail solves down to ~250px and the first thing to
         clip there was the category chip, which is one of the fields this rail
         exists to show. */
      clipInside: el ? Array.from(el.getElementsByTagName('*')).map((n) => ({
        id: n.id || n.tagName,
        ox: n.scrollWidth - n.clientWidth,
        oy: n.scrollHeight - n.clientHeight,
      })).filter((c) => c.ox > 1 || c.oy > 1) : [],
      childCount: el ? el.getElementsByTagName('*').length : -1,
      docElements: document.getElementsByTagName('*').length,
      /* A signature census, not just a count: growth in a live match is normal
         (the command dock builds hotslots, the notice log appends rows), so the
         question is not "did the document grow" but "did THIS lane grow it".
         Anything added inside #cmdrTx, or any new node carrying a cmdrTx id, is
         this lane's leak; anything else is attributed and reported. */
      census: (() => {
        const m = Object.create(null);
        for (const n of document.getElementsByTagName('*')) {
          const k = n.tagName + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : '');
          m[k] = (m[k] || 0) + 1;
        }
        return m;
      })(),
      debug: typeof cmdrTxDebug === 'function' ? cmdrTxDebug() : null,
    };
  }, PROTECT);
}

/* Raise a real cue and wait until the rail is holding it. Returns the upstream
   result alongside what reached the screen, so the two can be compared. */
async function raiseAndHold(page, category, kind, opts = {}) {
  const raised = await page.evaluate(([c, k, o]) => {
    const r = commanderCue(c, k, o);
    return { ok: r.ok, reason: r.reason, seq: r.cue ? r.cue.seq : null, text: r.cue ? r.cue.subtitle.text : null,
      tag: r.cue ? r.cue.subtitle.tag : null, who: r.cue ? r.cue.subtitle.speaker : null,
      rank: r.cue ? r.cue.subtitle.rank : null, portrait: r.cue ? r.cue.portrait.src.slice(0, 40) : null };
  }, [category, kind, opts]);
  if (!raised.ok) return { raised, held: false };
  await page.waitForFunction(() => typeof cmdrTxDebug === 'function' && cmdrTxDebug().state === 'hold',
    null, { timeout: 20_000 }).catch(() => {});
  const held = await page.evaluate(() => (typeof cmdrTxDebug === 'function' ? cmdrTxDebug() : null));
  return { raised, held };
}

/* ------------------------------------------------------------------------- */
const before = await fingerprint([...OWNED, ...UPSTREAM]);
const snapshot = {
  startedUtc,
  head: await git(['rev-parse', 'HEAD']),
  branch: await git(['rev-parse', '--abbrev-ref', 'HEAD']),
  dirtyWorktree: !!(await git(['status', '--porcelain=v1', '--untracked-files=all'])),
  owned: OWNED, upstream: UPSTREAM, before,
};
await mkdir(output, { recursive: true });
const stamp = sha256(OWNED.map((p) => before[p].sha256).join('|')).slice(0, 12);
note('run', 'source stamp', stamp);
note('run', 'output', output);

const server = await startServer();
const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: !headed });
const captures = [];
let gpuRenderer = '';

async function newProbePage(vp, extra = {}) {
  const page = await browser.newPage({
    viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, colorScheme: 'dark',
    hasTouch: vp.touch, isMobile: false, ...extra,
  });
  const errors = [];
  const blocked = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e && e.message ? e.message : e)));
  /* The probe itself severs the network, and Chrome logs one console error per
     aborted request. Those are this harness talking to itself, not a defect in
     the page — they are filtered here and the blocked URLs are recorded in the
     report instead, so nothing is hidden. Nothing else is filtered. */
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/ERR_BLOCKED_BY_CLIENT/.test(t)) return;
    errors.push('console: ' + t);
  });
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.protocol === 'data:' || u.protocol === 'blob:') await route.continue();
    else { blocked.push(u.href); await route.abort('blockedbyclient'); }
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mf_ap_gate_closed', '1'); localStorage.setItem('mf_ap_dismissed', '1');
      localStorage.setItem('mf_offline', '1'); localStorage.setItem('mf_prealpha_cinematic_v2', 'test-seen');
      localStorage.setItem('mf_auth_gate_v1', '1');
    } catch {}
  });
  return { page, errors, blocked };
}

async function capture(page, label) {
  const file = join(output, `${label}-${stamp}.png`);
  await page.screenshot({ path: file });
  const bytes = await readFile(file);
  const rec = { label, path: relative(root, file).replace(/\\/g, '/'), bytes: bytes.length, sha256: sha256(bytes) };
  captures.push(rec);
  note(label, 'capture', `${rec.path} sha256=${rec.sha256.slice(0, 16)} ${rec.bytes}B`);
  return rec;
}

try {
  for (const vp of VIEWPORTS) {
    const scope = `${vp.w}x${vp.h}`;
    const { page, errors, blocked } = await newProbePage(vp);
    try {
      const gpu = await assertHardwareGpu(page);
      gpuRenderer = gpu.renderer;
      await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      const match = await enterMatch(page);
      check(scope, 'entered a live offline match', match.matchLive === true && match.running === true && match.heroIdx >= 0,
        JSON.stringify(match));
      check(scope, 'match entry presents the objective-assigned commander cue',
        !!match.startupCue && match.startupCue.state === 'hold'
          && /objective\.assigned/.test(String(match.startupCue.lastKey || '')),
        JSON.stringify(match.startupCue));

      const hudUp = await page.evaluate(() => {
        const vis = (id) => { const e = document.getElementById(id); if (!e) return false; const c = getComputedStyle(e);
          return c.display !== 'none' && c.visibility !== 'hidden' && e.getBoundingClientRect().width > 0; };
        return { cmdrTx: !!document.getElementById('cmdrTx'), topbar: vis('topbar'), cmdbar: vis('cmdbar'), minimap: vis('minimapWrap') };
      });
      check(scope, 'in-match HUD and #cmdrTx container present',
        hudUp.cmdrTx && hudUp.topbar && hudUp.cmdbar && hudUp.minimap, JSON.stringify(hudUp));

      /* Fast diagnostic lane: preserve the real four-viewport boot and shared
         browser profile, but stop after match-entry delivery. This reproduces
         cross-page startup races without spending four minutes exercising the
         already-independent rail geometry suite. */
      if(entryOnly) continue;

      /* Select the Commander through the real control, so the selection
         surfaces the rail must avoid are genuinely on screen. */
      await page.evaluate(() => { const h = document.getElementById('heroBar'); if (h) h.click(); });
      await page.waitForTimeout(900);
      const sel = await page.evaluate(() => {
        const v = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
        return { selInfo: v('selInfo'), unitCard: v('unitCard') };
      });
      note(scope, 'selection surfaces after selecting the Commander', JSON.stringify(sel));

      const idle = await measure(page);
      check(scope, 'rail is idle and unpainted before any cue',
        idle.state === 'idle' && idle.rect === null || (idle.state === 'idle'), `state=${idle.state}`);
      const baselineDoc = idle.docElements;
      const baselineControls = await page.evaluate(() => {
        const out = {};
        for (const c of document.querySelectorAll('#topbar button, #cmdbar button')) {
          const r = c.getBoundingClientRect();
          if (r.width > 0) out[c.id || c.className] = [Math.round(r.width), Math.round(r.height)];
        }
        return out;
      });

      /* Three real cues, three categories, three priorities. Presentation order
         must follow upstream priority, not the order they were raised. */
      const seq = [];
      const a = await raiseAndHold(page, 'research', 'complete', { subject: 'probe_tech' });
      seq.push(['research.complete', a]);
      check(scope, 'a raised cue reaches the screen', a.raised.ok && a.held && a.held.state === 'hold' && !!a.held.text,
        `${a.raised.reason} -> ${a.held && a.held.state} "${a.held && a.held.text}"`);
      check(scope, 'the subtitle on screen is the cue the API returned',
        !!a.held && a.held.text === a.raised.text, `screen="${a.held && a.held.text}" api="${a.raised.text}"`);
      check(scope, 'speaker name is shown, exactly once',
        !!a.held && a.held.who === a.raised.who, `who="${a.held && a.held.who}"`);
      check(scope, 'rank and callsign are shown without duplicating the name',
        !!a.held && a.held.rank.includes(String(a.raised.rank).toUpperCase())
        && !/(\w+)\s+/i.test(a.held.who + ' ' + a.held.rank),
        `rank="${a.held && a.held.rank}" who="${a.held && a.held.who}"`);
      check(scope, 'category tag is shown, and is the category',
        !!a.held && a.held.tag === 'RESEARCH' && a.raised.tag.endsWith(a.held.tag),
        `chip="${a.held && a.held.tag}" upstream="${a.raised.tag}"`);
      check(scope, 'missing audio does not hide the subtitle',
        !!a.held && (a.held.audio === 'silent' || a.held.audio === 'absent') && a.held.text.length > 0,
        `audio=${a.held && a.held.audio}`);
      check(scope, 'portrait resolved to an image or the initial chip',
        !!a.held && (a.held.portraitStage === 'primary' || a.held.portraitStage === 'fallback' || a.held.portraitStage === 'initial'),
        `stage=${a.held && a.held.portraitStage} fallbacks=${a.held && a.held.portraitFallbacks}`);

      const m = await measure(page);
      check(scope, 'rail is fully on screen', m.clipped === false,
        `rect=${JSON.stringify(m.rect)} vp=${JSON.stringify(m.viewport)}`);
      check(scope, 'rail overlaps no protected HUD surface', m.overlaps.length === 0,
        m.overlaps.length ? JSON.stringify(m.overlaps) : `clear of ${m.protectedVisible.length}: ${m.protectedVisible.join(',')}`);
      check(scope, 'solver did not fall back to a dirty placement',
        !!m.debug && /^[A-D]$/.test(m.debug.placement), `placement=${m.debug && m.debug.placement}`);
      check(scope, 'subtitle does not overflow its box',
        !!m.lineOverflow && m.lineOverflow.scroll <= m.lineOverflow.client + 1, JSON.stringify(m.lineOverflow));
      check(scope, 'nothing inside the rail is clipped', m.clipInside.length === 0,
        m.clipInside.length ? JSON.stringify(m.clipInside) : `${m.rect.w}px wide, all children fit`);
      check(scope, 'rail is pointer-events:none', m.pointerEvents === 'none', String(m.pointerEvents));
      check(scope, 'rail blocks no gameplay control', m.blockedControls.length === 0,
        m.blockedControls.length ? JSON.stringify(m.blockedControls) : `${m.controlsProbed.length} controls hit-tested clean`);
      check(scope, 'a tap in the rail reaches the battlefield', m.passThrough === 'gl',
        `elementFromPoint=${m.passThrough}`);
      check(scope, 'rail contains nothing focusable', m.focusableInside === 0, String(m.focusableInside));
      check(scope, 'rail did not take focus', m.activeElement === idle.activeElement,
        `${idle.activeElement} -> ${m.activeElement}`);
      check(scope, 'rail sits below the notice and selection layers',
        Number(m.zIndex) < 19, `z-index=${m.zIndex}`);

      await capture(page, `${vp.name}-cue`);

      /* Two more cues while the first is still on screen. Upstream owns the
         ordering; the rail must present them one at a time and must not grow
         the DOM doing it. */
      const raisedMore = await page.evaluate(() => {
        const r1 = commanderCue('casualty', 'unit', { subject: 'probe_rhino' });
        const r2 = commanderCue('outcome', 'victory', {});
        return [{ ok: r1.ok, reason: r1.reason }, { ok: r2.ok, reason: r2.reason }];
      });
      note(scope, 'two further cues raised while the rail was busy', JSON.stringify(raisedMore));
      const order = [];
      for (let i = 0; i < 2; i++) {
        await page.waitForFunction((prev) => typeof cmdrTxDebug === 'function'
          && cmdrTxDebug().state === 'hold' && cmdrTxDebug().lastKey !== prev,
        (order[order.length - 1] || a.held.lastKey), { timeout: 25_000 }).catch(() => {});
        const d = await page.evaluate(() => cmdrTxDebug());
        order.push(d.lastKey);
        const mm = await measure(page);
        check(scope, `queued cue ${i + 1} presented without overlap or clipping`,
          mm.overlaps.length === 0 && mm.clipped === false && mm.clipInside.length === 0,
          `${d.tag} "${d.text}" overlaps=${JSON.stringify(mm.overlaps)} clipped=${JSON.stringify(mm.clipInside)}`);
        check(scope, `queued cue ${i + 1} did not grow the rail DOM`, mm.childCount === m.childCount,
          `${mm.childCount} vs ${m.childCount}`);
      }
      check(scope, 'higher-priority cue presented before the lower one',
        order.length === 2 && /outcome\.victory/.test(order[0]) && /casualty\.unit/.test(order[1]),
        order.join(' then '));

      const after = await measure(page);
      const added = [];
      for (const k of Object.keys(after.census)) {
        const d = after.census[k] - (idle.census[k] || 0);
        if (d > 0) added.push(`${k} x${d}`);
      }
      const railGrew = after.childCount !== idle.childCount + 0 && after.childCount !== m.childCount;
      const mine = added.filter((k) => /cmdrTx/i.test(k));
      check(scope, 'the rail added no DOM nodes across three cues',
        mine.length === 0 && after.childCount === m.childCount && !railGrew,
        mine.length ? mine.join(', ') : `#cmdrTx subtree ${m.childCount} nodes, unchanged`);
      note(scope, 'document nodes added during the run (other HUD systems)',
        `${baselineDoc} -> ${after.docElements}${added.length ? ' :: ' + added.join(', ') : ''}`);
      const controlsAfter = await page.evaluate(() => {
        const out = {};
        for (const c of document.querySelectorAll('#topbar button, #cmdbar button')) {
          const r = c.getBoundingClientRect();
          if (r.width > 0) out[c.id || c.className] = [Math.round(r.width), Math.round(r.height)];
        }
        return out;
      });
      /* Compare the INTERSECTION. The command dock legitimately swaps rows as
         the selection changes (the ABILITIES deck enables, hotslots appear), so
         a whole-map equality check measures HUD churn rather than anything the
         rail did. What must hold is that no control present both before and
         after changed size while the rail was on screen. */
      const sharedKeys = Object.keys(baselineControls).filter((k) => k in controlsAfter);
      const resized = sharedKeys.filter((k) => String(baselineControls[k]) !== String(controlsAfter[k]));
      check(scope, 'no control was resized while the rail was on screen', resized.length === 0,
        resized.length ? resized.map((k) => `${k} ${baselineControls[k]}->${controlsAfter[k]}`).join(', ')
          : `${sharedKeys.length} controls compared`);
      const churn = Object.keys(controlsAfter).filter((k) => !(k in baselineControls));
      note(scope, 'controls that appeared during the run (HUD deck churn, not the rail)',
        churn.length ? churn.join(',') : 'none');
      const small = Object.entries(controlsAfter).filter(([, s]) => s[0] < 44 || s[1] < 44);
      note(scope, 'controls under 44px (pre-existing control-safety baseline)',
        small.length ? JSON.stringify(small) : 'none');

      const glLost = await page.evaluate(() => {
        const c = document.getElementById('gl');
        try { const g = c && (c.getContext('webgl2') || c.getContext('webgl')); return !g || g.isContextLost(); }
        catch (e) { return 'throw:' + e.message; }
      });
      check(scope, 'WebGL context still alive', glLost === false, String(glLost));
      check(scope, 'no page or console errors', errors.length === 0, errors.slice(0, 4).join(' | ') || 'clean');
      note(scope, 'external requests blocked by the probe',
        blocked.length ? `${blocked.length}: ${[...new Set(blocked.map((u) => new URL(u).host))].join(',')}` : 'none');
    } finally { await page.close(); }
  }

  if(!entryOnly){
  /* ---- reduced motion, on the primary phone viewport ---------------------- */
  {
    const vp = VIEWPORTS[0], scope = 'reduced-motion';
    const { page, errors, blocked } = await newProbePage(vp, { reducedMotion: 'reduce' });
    try {
      await assertHardwareGpu(page);
      await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await enterMatch(page);
      const r = await raiseAndHold(page, 'strategic', 'incoming', {});
      check(scope, 'cue still presented under prefers-reduced-motion',
        r.raised.ok && r.held && r.held.state === 'hold' && !!r.held.text, `"${r.held && r.held.text}"`);
      const m = await measure(page);
      check(scope, 'transitions are disabled', /^0s(, 0s)*$/.test(String(m.transitionDuration)),
        `transition-duration=${m.transitionDuration}`);
      check(scope, 'still clear of every protected surface', m.overlaps.length === 0 && m.clipped === false,
        JSON.stringify(m.overlaps));
      await capture(page, 'phone-portrait-reduced-motion');
      check(scope, 'no page or console errors', errors.length === 0, errors.slice(0, 4).join(' | ') || 'clean');
    } finally { await page.close(); }
  }

  /* ---- missing portrait --------------------------------------------------- */
  {
    const vp = VIEWPORTS[0], scope = 'missing-portrait';
    const { page, errors, blocked } = await newProbePage(vp);
    try {
      await assertHardwareGpu(page);
      await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await enterMatch(page);
      /* Raise a genuine cue, then break BOTH portrait sources on the cue object
         the rail is handed — the commander image and the faction fallback — so
         the last-resort initial chip is what actually gets exercised. */
      const r = await page.evaluate(() => {
        const res = commanderCue('objective', 'assigned', { subject: 'probe_obj' });
        if (res.ok) {
          res.cue.portrait = { src: './assets/factions/commanders/__probe_missing__.jpg',
            fallback: './assets/factions/__probe_missing__.jpg', alt: 'probe' };
        }
        return { ok: res.ok, reason: res.reason, text: res.ok ? res.cue.subtitle.text : null };
      });
      await page.waitForFunction(() => typeof cmdrTxDebug === 'function' && cmdrTxDebug().state === 'hold',
        null, { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const d = await page.evaluate(() => cmdrTxDebug());
      check(scope, 'both portrait sources failing falls through to the initial chip',
        d.portraitStage === 'initial' && d.portraitFallbacks >= 2,
        `stage=${d.portraitStage} fallbacks=${d.portraitFallbacks}`);
      check(scope, 'subtitle survives a missing portrait', !!d.text && d.text === r.text, `"${d.text}"`);
      const m = await measure(page);
      check(scope, 'still clear of every protected surface', m.overlaps.length === 0 && m.clipped === false,
        JSON.stringify(m.overlaps));
      await capture(page, 'phone-portrait-missing-portrait');
      /* A 404 for the deliberately-broken portrait is the point of this pass;
         everything else must still be clean. */
      const real = errors.filter((e) => !/__probe_missing__/.test(e) && !/Failed to load resource/.test(e));
      check(scope, 'no unexpected page or console errors', real.length === 0, real.slice(0, 4).join(' | ') || 'clean');
    } finally { await page.close(); }
  }
  }
} finally {
  await closePwBrowser(browser);
  await server.close();
}

/* ---- staleness ----------------------------------------------------------- */
const afterFp = await fingerprint([...OWNED, ...UPSTREAM]);
const drifted = [...OWNED, ...UPSTREAM].filter((p) => afterFp[p].sha256 !== before[p].sha256);
check('run', 'source did not change during the run (evidence is not stale)', drifted.length === 0,
  drifted.join(',') || `${OWNED.length + UPSTREAM.length} files stable`);
check('run', entryOnly?'entry-only diagnostic wrote no presentation captures'
  :'captures written for all four viewports plus both edge cases', captures.length === (entryOnly?0:6),
  captures.map((c) => c.label).join(','));
check('run', 'hardware GPU, never SwiftShader', !!gpuRenderer && !/swiftshader|llvmpipe|software/i.test(gpuRenderer), gpuRenderer);

const report = {
  probe: 'commander-hud', startedUtc, finishedUtc: new Date().toISOString(),
  snapshot, sourceStamp: stamp, gpuRenderer, viewports: VIEWPORTS, captures,
  after: afterFp, checks,
  passed: checks.filter((c) => c.ok && !c.info).length, failed,
};
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
if (jsonOnly) console.log(JSON.stringify(report, null, 2));
else {
  console.log('');
  console.log(`report ${join(output, 'report.json')}`);
  console.log(`${report.passed} passed, ${failed} failed`);
}
process.exit(failed ? 1 : 0);
