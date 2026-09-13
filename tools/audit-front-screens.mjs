/* WALK EVERY FRONT SCREEN AND RECORD WHAT BREAKS.
 *
 * Reported as "loading issues, failed screens, wrong screens, missing gui" -
 * which is four different symptoms that all look the same from the outside. So
 * rather than chase them one screenshot at a time, this opens each destination
 * the main menu offers and records four facts about it: did the screen the
 * button names actually become visible, did anything throw, is it empty, and
 * did the app navigate somewhere else instead.
 *
 * "Wrong screen" is the interesting one and needs the button's own intent to
 * compare against, which is why each row carries the id it is supposed to open.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { launchPwBrowser, closePwBrowser } = await import(pathToFileURL(join(root, 'tools', 'pw-browser.mjs')).href);
const www = join(root, 'www');
const outDir = join(root, 'tmp', 'front-screen-audit');
await mkdir(outDir, { recursive: true });

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2',
  '.webp': 'image/webp', '.wasm': 'application/wasm', '.ktx2': 'image/ktx2',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.svg': 'image/svg+xml'
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    const file = resolve(www, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
    assert.ok(file.startsWith(www), 'path escape');
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('nf');
  }
});
await new Promise(accept => server.listen(0, '127.0.0.1', accept));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

/* [label, control id, the screen it claims to open] */
const DESTINATIONS = [
  ['operations', 'opsBtn', 'opsScr'],
  ['arsenal', 'armoryBtn', 'armory'],
  ['tech-development', 'devBtn', 'devScr'],
  ['intel', 'codexBtn', 'dossierScr'],
  ['contracts', 'dailyBtn', 'dailyScr'],
  ['social', 'socialBtn', 'socialScr'],
  ['settings', 'setBtn', 'settingsScr'],
  ['profile', 'rankEm', 'profileScr'],
  ['update', 'updDot', 'updScr'],
  ['inbox', 'inboxBtn', 'inboxScr']
];

const report = { destinations: [], bootErrors: [] };
const browser = await launchPwBrowser({ ownershipMode: 'isolated' });
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/interactive-widget/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => typeof mfLauncherSnapshot === 'function', null, { polling: 250, timeout: 120000 });
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
  /* Wait for the launcher to actually PASS its gate. Auditing before that
     measures a state no player can be in: the first run of this tool forced the
     menu open while gate=true / identity=pending, saw the normal first entry
     into UGA Command, and very nearly reported it as a routing bug. */
  await page.waitForFunction(() => {
    const s = typeof mfLauncherSnapshot === 'function' ? mfLauncherSnapshot() : null;
    return Boolean(s && (s.passed || s.bypass));
  }, null, { polling: 250, timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(9000);

  /* The launcher may have carried us into the exploration module. Come back to
     the menu, because that is the surface under audit. */
  if (await page.evaluate(() => location.pathname.includes('space_exploration'))) {
    await page.goBack({ timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(7000);
  }
  report.landed = await page.evaluate(() => ({
    path: location.pathname,
    hasStartScreen: Boolean(document.getElementById('startScreen')),
    hasArmoryBtn: Boolean(document.getElementById('armoryBtn')),
    hasShowFront: typeof showFrontScreen === 'function',
    visible: [...document.querySelectorAll('[id$="Scr"], #armory, #startScreen, .uga-command-shell')]
      .filter(x => getComputedStyle(x).display !== 'none' && x.getBoundingClientRect().height > 60)
      .map(x => x.id || x.className).slice(0, 5)
  }));
  console.log('LANDED', JSON.stringify(report.landed));
  report.bootErrors = [...new Set(errors)];
  errors.length = 0;

  const visibleScreens = () => page.evaluate(() => [...document.querySelectorAll('[id$="Scr"], #armory, #startScreen')]
    .filter(el => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 60)
    .map(el => el.id));

  for (const [label, control, expected] of DESTINATIONS) {
    errors.length = 0;
    await page.evaluate(() => {
      if (typeof showFrontScreen === 'function') showFrontScreen('startScreen');
    });
    await page.waitForTimeout(700);

    const present = await page.evaluate(id => {
      const el = document.getElementById(id);
      if (!el) return 'absent';
      if (el.disabled) return 'disabled';
      el.click();
      return 'clicked';
    }, control);
    await page.waitForTimeout(2200);

    const after = await page.evaluate(want => {
      const el = document.getElementById(want);
      const text = el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
      const buttons = el ? el.querySelectorAll('button').length : 0;
      return {
        screens: [...document.querySelectorAll('[id$="Scr"], #armory, #startScreen')]
          .filter(x => getComputedStyle(x).display !== 'none' && x.getBoundingClientRect().height > 60)
          .map(x => x.id),
        opened: el ? getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 60 : false,
        words: text ? text.split(/\s+/).length : 0,
        buttons,
        leftDocument: !location.pathname.endsWith('/index.html')
      };
    }, expected);

    const verdict = present !== 'clicked' ? present
      : !after.opened ? (after.screens.length ? 'WRONG SCREEN -> ' + after.screens.join(',') : 'NOTHING OPENED')
      : after.words < 8 ? 'EMPTY'
      : 'ok';
    report.destinations.push({ label, control, expected, present, verdict, ...after, errors: [...new Set(errors)] });
    if (verdict !== 'ok' || errors.length) {
      await page.screenshot({ path: join(outDir, `${label}.png`), timeout: 15000 }).catch(() => {});
    }
  }
  await page.close();
} finally {
  /* Teardown must never discard the findings. closePwBrowser throws
     PW_OWNED_CLEANUP_INCOMPLETE when the browser process outlives its port
     release, which is a housekeeping detail - and letting it propagate threw
     away a completed audit before it could be written or printed. */
  try { await closePwBrowser(browser); } catch (error) { report.teardown = String(error && error.message || error); }
  server.close();
}

await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));

console.log(`boot errors: ${report.bootErrors.length}`);
for (const e of report.bootErrors.slice(0, 6)) console.log('   ' + e.slice(0, 150));
console.log('');
console.log('DESTINATION        CONTROL      VERDICT                         WORDS  BTNS  ERRORS');
let bad = 0;
for (const d of report.destinations) {
  if (d.verdict !== 'ok' || d.errors.length) bad += 1;
  console.log(`  ${d.label.padEnd(17)} ${d.control.padEnd(12)} ${d.verdict.padEnd(31)} ${String(d.words).padStart(5)} ${String(d.buttons).padStart(5)} ${d.errors.length ? d.errors[0].slice(0, 60) : ''}`);
}
console.log('');
console.log(`${report.destinations.length - bad} / ${report.destinations.length} destinations clean`);
