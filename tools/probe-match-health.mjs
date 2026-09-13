#!/usr/bin/env node
/* WHAT A REAL MATCH ACTUALLY DOES, MEASURED EVERY SECOND.
 *
 * Three readings from the player's own screenshots motivated this and none of
 * them can be judged from source: MASS pinned at 1.2K and NRG at 6K across
 * several different match clocks, CMD sitting at 2/500, and the FEED badge
 * climbing 8 -> 10 -> 20 -> 47 -> 99+ inside a single match. 1200/6000 are
 * exactly MCAP0/ECAP0, so the bank was not frozen, it was FULL - which is a
 * different and worse problem, because full means income is being thrown on
 * the floor while the army is two units.
 *
 * So: enter a real skirmish, let it run, and sample the simulation itself
 * rather than the source that describes it. Everything measured here is a
 * number the game already computes; this tool only writes them down over time.
 *
 * Usage: node tools/probe-match-health.mjs [--seconds 240] [--headed] [--json]
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const WALL_SECONDS = Number(arg('--seconds', '240'));
const jsonOnly = argv.includes('--json');
const outDir = join(root, 'tmp', 'match-health');
await mkdir(outDir, { recursive: true });

const MIME = {
  '.basis': 'application/octet-stream', '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.ktx2': 'image/ktx2', '.m4a': 'audio/mp4', '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.woff2': 'font/woff2'
};

/* Serves the repo root, not www/ — the probe measures live src/, so a stale
   pack cannot make a fixed bug look present or a present bug look fixed. */
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const rel = relative(root, file);
    if (!rel || rel.startsWith('..' + sep) || !existsSync(file)) throw new Error('outside root');
    res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const log = (...a) => { if (!jsonOnly) console.log(...a); };

const browser = await launchPwBrowser({ ownershipMode: 'isolated' });
const report = { startedUtc: new Date().toISOString(), samples: [], findings: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true });
  page.on('pageerror', e => report.errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/interactive-widget/.test(t)) return;
    report.errors.push('console: ' + t.slice(0, 200));
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });

  /* Entry goes through newSkirmish(), NOT the hand-rolled world used by
     tools/probe-commander-hud.mjs. That probe only needs a live opponent for
     the victory check; this one measures the AI's own economy, and the first
     run proved why the difference matters. Spawning a bare enemy HQ leaves
     AI.base without a seat wallet, so `bank.energy||0` is 0, `eStarved` is
     permanently true, and the AI built 31 Reactors and nothing else - a
     harness artifact that reads exactly like a catastrophic AI bug.
     newSkirmish() lays down the real base (pgen + fac + turret), registers the
     seat, picks the faction and spawns the enemy commander. */
  await page.waitForFunction(() => typeof newSkirmish === 'function' && typeof deployCarrier === 'function'
    && typeof hideFrontScreens === 'function' && typeof updateHUD === 'function', null,
    { polling: 250, timeout: 180000 });
  await page.waitForFunction(() => document.body.classList.contains('mfIntroDone')
    && !document.getElementById('mfBootCover'), null, { polling: 250, timeout: 90000 })
    .catch(async () => { await page.evaluate(() => document.getElementById('mfIntroStart')?.click()); });
  await page.waitForTimeout(900);

  const entry = await page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch {}
    try {
      if (document.getElementById('mfOnboardingChoice') && window.MFOnboarding) {
        window.MFOnboarding.decide('skipped', { flowId: 'default' });
      }
    } catch {}
    hideFrontScreens();
    try { if (typeof stopAttract === 'function') stopAttract(); } catch {}
    demoMode = false; attractOn = false;
    newSkirmish();
    /* newSkirmish leaves the carrier in flight so the player can choose a drop
       site. Put it on the ground immediately - the measurement starts at the
       moment a real match starts, which is the landing, not the fly-in. */
    carrier.phase = 1; carrier.alt = 0; carrier.clearance = 0;
    carrier.tx = carrier.x; carrier.ty = carrier.y;
    deployCarrier();
    running = true; paused = false; gameEnded = false;
    return {
      matchLive, running, heroIdx,
      enemies: typeof enemyHeroIdxs !== 'undefined' ? enemyHeroIdxs.length : -1,
      aiFac: typeof AI !== 'undefined' ? AI.fac : null,
      aiDiff: typeof AI !== 'undefined' ? AI.diff : null,
      aiBases: typeof AI !== 'undefined' && AI.bases ? AI.bases.length : -1,
      aiSeatBank: typeof AI !== 'undefined' && AI.base ? { mass: AI.base.mass, energy: AI.base.energy, mcap: AI.base.mcap } : null,
      map: typeof curMap !== 'undefined' ? curMap : null
    };
  });
  report.entry = entry;
  log('ENTRY', JSON.stringify(entry));
  if (!entry.matchLive) throw new Error('match did not go live — every measurement below would be meaningless');

  /* The feed's own counters are the measurement. mfNUnread is what the badge
     renders and mfNHistory is what the panel lists; the player reported the
     badge climbing to 99+, so read both and let the gap between them speak. */

  const sample = () => page.evaluate(() => {
    const nUnits = (team, pred) => {
      let n = 0;
      for (let i = 0; i < ualive.length; i++) {
        if (!ualive[i]) continue;
        if (uteam[i] !== team) continue;
        if (pred && !pred(i)) continue;
        n++;
      }
      return n;
    };
    const bl = typeof blds !== 'undefined' ? blds : [];
    const bcount = team => bl.filter(b => b && b.alive !== false && b.team === team).length;
    const btypes = team => {
      const out = {};
      for (const b of bl) { if (b && b.alive !== false && b.team === team) out[b.type] = (out[b.type] || 0) + 1; }
      return out;
    };
    const pop = typeof hudPlayerPop === 'function' ? hudPlayerPop() : null;
    const feedBadge = document.getElementById('feedBadge') || document.querySelector('[id*="eed"][id*="adge"]');
    return {
      t: +stats.t.toFixed(1),
      running, paused, matchLive, gameEnded,
      mass: Math.round(resM[0]), massCap: Math.round(RES_MCAP[0]),
      energy: Math.round(resE[0]), energyCap: Math.round(RES_ECAP[0]),
      mRate: +(+mRate).toFixed(2), eRate: +(+eRate).toFixed(2),
      mSpend: +(+mSpend).toFixed(2), eSpend: +(+eSpend).toFixed(2),
      mWasted: Math.round(mWasted),
      aiMass: typeof resM !== 'undefined' ? Math.round(resM[1]) : -1,
      aiEnergy: typeof resE !== 'undefined' ? Math.round(resE[1]) : -1,
      pUnits: nUnits(0), eUnits: nUnits(1),
      pBlds: bcount(0), eBlds: bcount(1),
      pBldTypes: btypes(0), eBldTypes: btypes(1),
      popUsed: pop ? pop.used : -1, popCap: pop ? pop.cap : -1,
      kills: Array.isArray(stats.kills) ? stats.kills.slice() : null,
      built: Array.isArray(stats.built) ? stats.built.slice() : null,
      stallM: +(+stallM).toFixed(2), stallE: +(+stallE).toFixed(2),
      feed: {
        unread: typeof mfNUnread === 'number' ? mfNUnread : -1,
        rows: typeof mfNHistory !== 'undefined' && mfNHistory ? mfNHistory.length : -1,
        /* Rows carry an n counter for collapsed repeats. Summing it gives the
           raw event total the badge is actually counting. */
        raw: typeof mfNHistory !== 'undefined' && mfNHistory ? mfNHistory.reduce((a, r) => a + (r.n || 1), 0) : -1
      },
      feedBadgeText: (document.getElementById('noticeLogCount') || feedBadge || {}).textContent || null,
      massTxt: (document.getElementById('massV') || {}).textContent || null,
      enTxt: (document.getElementById('enV') || {}).textContent || null,
      unitTxt: (document.getElementById('unitV') || {}).textContent || null,
      coach: (() => { const c = document.getElementById('coach'); return c && getComputedStyle(c).opacity !== '0' ? c.textContent.trim().slice(0, 90) : null; })(),
      fps: typeof fps !== 'undefined' ? fps : -1
    };
  });

  const deadline = Date.now() + WALL_SECONDS * 1000;
  let last = null;
  while (Date.now() < deadline) {
    const s = await sample().catch(e => ({ error: String(e.message || e) }));
    report.samples.push({ wall: +((WALL_SECONDS * 1000 - (deadline - Date.now())) / 1000).toFixed(1), ...s });
    last = s;
    if (s.gameEnded) { log('match ended at sim t=' + s.t); break; }
    await page.waitForTimeout(4000);
  }
  report.final = last;
  await page.screenshot({ path: join(outDir, 'final.png'), timeout: 20000 }).catch(() => {});
  report.feedKinds = await page.evaluate(() => (window.__feed || {}).byKind || null).catch(() => null);
  await page.close();
} catch (error) {
  report.fatal = String(error && error.stack || error);
} finally {
  try { await closePwBrowser(browser); } catch (e) { report.teardown = String(e && e.message || e); }
  server.close();
}

await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));

if (report.fatal) { console.error(report.fatal); process.exitCode = 1; }

const S = report.samples.filter(s => !s.error);
if (!S.length) { console.error('no samples'); process.exitCode = 1; }
else {
  log('');
  log('  simT  mass/cap      nrg/cap    m+/s  spend   waste | pUnit pBld eUnit eBld | pop     kills      feed  fps');
  for (const s of S) {
    log(`  ${String(s.t).padStart(5)}  ${String(s.mass).padStart(4)}/${String(s.massCap).padEnd(5)} ${String(s.energy).padStart(5)}/${String(s.energyCap).padEnd(5)} `
      + `${String(s.mRate).padStart(5)} ${String(s.mSpend).padStart(6)} ${String(s.mWasted).padStart(7)} | `
      + `${String(s.pUnits).padStart(5)} ${String(s.pBlds).padStart(4)} ${String(s.eUnits).padStart(5)} ${String(s.eBlds).padStart(4)} | `
      + `${String(s.popUsed + '/' + s.popCap).padEnd(7)} ${String((s.kills || []).join(',')).padEnd(10)} `
      + `${String(s.feed ? s.feed.unread + '/' + s.feed.rows : '-').padStart(7)} ${String(s.fps).padStart(4)}`);
    if (s.coach) log(`         COACH: ${s.coach}`);
  }
  const first = S[0], lastS = S[S.length - 1];
  const add = (id, detail) => report.findings.push({ id, detail });

  if (lastS.mass >= lastS.massCap - 2) add('MASS_AT_CAP', `mass ${lastS.mass}/${lastS.massCap} at sim t=${lastS.t}s, ${lastS.mWasted} mass wasted`);
  if (lastS.energy >= lastS.energyCap - 2) add('ENERGY_AT_CAP', `energy ${lastS.energy}/${lastS.energyCap} at sim t=${lastS.t}s`);
  if (lastS.eUnits <= first.eUnits) add('AI_ARMY_NOT_GROWING', `enemy units ${first.eUnits} -> ${lastS.eUnits} over ${(lastS.t - first.t).toFixed(0)}s`);
  if (lastS.eBlds <= first.eBlds) add('AI_NOT_BUILDING', `enemy buildings ${first.eBlds} -> ${lastS.eBlds}`);
  if (lastS.pBlds <= first.pBlds) add('PLAYER_BASE_STATIC', `player buildings ${first.pBlds} -> ${lastS.pBlds} (constructor idle?)`);
  if (lastS.feed && lastS.feed.unread >= 0) {
    add('FEED_RATE', `${((lastS.feed.unread - first.feed.unread) / Math.max(1, lastS.t - first.t)).toFixed(2)} unread/sim-second`);
    /* The badge counts raw submissions; the panel lists deduplicated rows. A
       divergence here is the reported "99+ over a short feed", measured. */
    if (lastS.feed.unread > lastS.feed.rows)
      add('FEED_BADGE_OVERCOUNTS', `badge "${lastS.feedBadgeText}" = ${lastS.feed.unread} unread, panel holds ${lastS.feed.rows} rows (${lastS.feed.raw} raw events)`);
  }
  if (report.errors.length) add('RUNTIME_ERRORS', `${new Set(report.errors).size} distinct: ` + [...new Set(report.errors)].slice(0, 3).join(' | '));

  log('');
  log('FINDINGS');
  for (const f of report.findings) log(`  ${f.id.padEnd(22)} ${f.detail}`);
  log('');
  log('report -> tmp/match-health/report.json');
}
await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
if (jsonOnly) console.log(JSON.stringify({ findings: report.findings, final: report.final, errors: [...new Set(report.errors)] }, null, 2));
