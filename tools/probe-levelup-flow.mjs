/* The level-up chooser still opens, still pauses, and still resumes.
   The gate asserts source ordering; this drives the real thing in a real
   match, because reordering a player-facing flow deserves more than a regex. */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = 'C:/Users/Jason/Documents/Codex/2026-08-01/massfront-rts-mobile-game-for-apple';
const { launchPwBrowser, closePwBrowser } = await import(pathToFileURL(root + '/tools/pw-browser.mjs').href);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.ktx2': 'image/ktx2', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = createServer(async (rq, rs) => {
  try {
    const p = decodeURIComponent(new URL(rq.url || '/', 'http://x').pathname);
    const f = resolve(root, '.' + (p === '/' ? '/index.html' : p));
    const rel = relative(root, f);
    if (!rel || rel.startsWith('..' + sep) || !existsSync(f)) throw 0;
    rs.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    rs.end(await readFile(f));
  } catch { rs.writeHead(404); rs.end('nf'); }
});
await new Promise(a => server.listen(0, '127.0.0.1', a));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await launchPwBrowser({ ownershipMode: 'isolated' });
let bad = 0;
const check = (name, ok, detail) => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => typeof newSkirmish === 'function' && typeof heroXP === 'function', null, { polling: 250, timeout: 180000 });
  await page.waitForFunction(() => document.body.classList.contains('mfIntroDone') && !document.getElementById('mfBootCover'), null, { polling: 250, timeout: 90000 })
    .catch(async () => { await page.evaluate(() => document.getElementById('mfIntroStart')?.click()); });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch {}
    try { if (document.getElementById('mfOnboardingChoice') && window.MFOnboarding) window.MFOnboarding.decide('skipped', { flowId: 'default' }); } catch {}
    hideFrontScreens();
    try { if (typeof stopAttract === 'function') stopAttract(); } catch {}
    demoMode = false; attractOn = false;
    newSkirmish();
    carrier.phase = 1; carrier.alt = 0; carrier.clearance = 0; carrier.tx = carrier.x; carrier.ty = carrier.y;
    deployCarrier();
    running = true; paused = false; gameEnded = false;
  });
  await page.waitForTimeout(2500);

  const before = await page.evaluate(() => ({ paused, running, lvl: heroLvl }));
  check('match is live and unpaused before the award', before.running && !before.paused, JSON.stringify(before));

  /* Award enough XP for one level, the way a kill does. */
  const opened = await page.evaluate(() => {
    heroXP(heroXpNext + 5);
    const el = document.getElementById('levelUp');
    return {
      display: el ? getComputedStyle(el).display : 'no-el',
      cards: document.getElementById('luCards') ? document.getElementById('luCards').children.length : -1,
      head: (document.getElementById('luLvl') || {}).textContent || '',
      paused, pending: pendingLevels
    };
  });
  check('chooser opened', opened.display === 'flex', 'display=' + opened.display);
  check('chooser offered two cards', opened.cards === 2, 'cards=' + opened.cards);
  check('chooser named the level', /level\s*\d/i.test(opened.head), JSON.stringify(opened.head).slice(0, 70));
  check('match paused only once the chooser was up', opened.paused === true, 'paused=' + opened.paused);

  /* Tap a card the way a player does. */
  const after = await page.evaluate(async () => {
    const card = document.getElementById('luCards').children[0];
    const r = card.getBoundingClientRect();
    card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    await new Promise(a => setTimeout(a, 250));
    const el = document.getElementById('levelUp');
    return { display: getComputedStyle(el).display, paused, pending: pendingLevels, lvl: heroLvl };
  });
  check('choosing a card closes the chooser', after.display === 'none', 'display=' + after.display);
  check('choosing a card resumes the match', after.paused === false, 'paused=' + after.paused);
  check('the level was consumed', after.pending === 0, 'pending=' + after.pending);

  /* And the sim really is running again. */
  const t0 = await page.evaluate(() => stats.t);
  await page.waitForTimeout(2500);
  const t1 = await page.evaluate(() => stats.t);
  check('simulation advanced after resume', t1 > t0 + 0.5, `${t0.toFixed(2)} -> ${t1.toFixed(2)}`);
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
} finally {
  try { await closePwBrowser(browser); } catch {}
  server.close();
}
console.log(bad ? `\n${bad} check(s) failed` : '\nlevel-up flow verified end to end in a real match');
process.exitCode = bad ? 1 : 0;
