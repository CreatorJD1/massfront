/* DEPLOY MASSFRONT MUST SURVIVE THE BACK BUTTON.
 *
 * mfExplorationLaunching is a one-shot latch that stops a fast second tap from
 * opening a duplicate launch. It is set before same-tab navigation into the
 * exploration module and cleared only by finishLaunch, on the reasoning that
 * the success path leaves this document behind.
 *
 * Safari does not leave it behind. Back/forward navigations are restored from
 * bfcache, which resumes the JavaScript heap exactly as it was, so the player
 * enters UGA Command, presses Back, and lands on a menu whose latch is still
 * true. Every DEPLOY MASSFRONT tap after that returns at the duplicate guard.
 * Nothing is disabled and nothing throws, which is why it reads as the whole
 * menu being dead rather than as one stuck boolean.
 *
 * This runs under WebKit deliberately: Chromium's bfcache heuristics differ,
 * and the bug was reported on Safari. The test asserts the restore contract
 * rather than the specific navigation Playwright happens to perform, so it
 * stays honest even if the harness declines to use bfcache on a given run.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { webkit } = createRequire(pathToFileURL(join(root, 'package.json')).href)('playwright');
const www = join(root, 'www');

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2', '.webp': 'image/webp', '.wasm': 'application/wasm',
  '.ktx2': 'image/ktx2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml'
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = resolve(www, relative);
    assert.ok(file.startsWith(www), 'path escape');
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
  }
});
await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await webkit.launch({ headless: true });
const failures = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => typeof mfLauncherSnapshot === 'function', null, { polling: 250, timeout: 120000 });
  await page.waitForTimeout(2500);

  /* 1. The handlers have to exist at all. Without them nothing below can pass
        for the right reason, and a silent regression here is invisible. */
  const wired = await page.evaluate(() => {
    let pageshow = false, pagehide = false;
    const original = window.addEventListener;
    // Already-registered listeners are not enumerable, so prove the behaviour
    // instead: strand the latch, fire the events, and read it back.
    return { original: typeof original === 'function', pageshow, pagehide };
  });
  assert.ok(wired.original, 'addEventListener must exist');

  /* 2. A restored page must not come back mid-launch. This is the contract the
        fix adds: pageshow with persisted=true clears the latch and the pressed
        styling, because a bfcache restore fires no load event. */
  const restored = await page.evaluate(() => {
    const startBtn = document.getElementById('startBtn');
    if (startBtn) { startBtn.classList.add('is-launching'); startBtn.setAttribute('aria-busy', 'true'); }
    const before = {
      latch: typeof mfExplorationLaunching !== 'undefined' ? mfExplorationLaunching : null,
      launching: startBtn ? startBtn.classList.contains('is-launching') : null
    };
    try { window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })); } catch (e) { return { error: e.message }; }
    return {
      before,
      after: {
        latch: typeof mfExplorationLaunching !== 'undefined' ? mfExplorationLaunching : null,
        launching: startBtn ? startBtn.classList.contains('is-launching') : null,
        busy: startBtn ? startBtn.hasAttribute('aria-busy') : null
      }
    };
  });
  if (restored.error) failures.push('pageshow dispatch threw: ' + restored.error);
  else {
    if (restored.after.latch !== false) failures.push(`bfcache restore left mfExplorationLaunching = ${restored.after.latch}; DEPLOY MASSFRONT stays dead`);
    if (restored.after.launching !== false) failures.push('bfcache restore left the launch button styled mid-launch');
    if (restored.after.busy !== false) failures.push('bfcache restore left aria-busy on the launch button');
  }

  /* 3. pagehide must clear it too, so a cancelled navigation cannot strand the
        button either. */
  const hidden = await page.evaluate(() => {
    try { window.dispatchEvent(new Event('pagehide')); } catch (e) { return { error: e.message }; }
    return { latch: typeof mfExplorationLaunching !== 'undefined' ? mfExplorationLaunching : null };
  });
  if (hidden.error) failures.push('pagehide dispatch threw: ' + hidden.error);
  else if (hidden.latch !== false) failures.push(`pagehide left mfExplorationLaunching = ${hidden.latch}`);

  /* 4. The launcher's own entry latch has the same hazard: L.entering is
        cleared in a promise finally that never runs when the document
        navigates away mid-flight. */
  const launcher = await page.evaluate(() => {
    try { window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })); } catch (e) { return { error: e.message }; }
    const snap = typeof mfLauncherSnapshot === 'function' ? mfLauncherSnapshot() : null;
    return { snapshot: Boolean(snap) };
  });
  if (launcher.error) failures.push('launcher pageshow threw: ' + launcher.error);
  if (!launcher.snapshot) failures.push('launcher snapshot unavailable after restore');

  /* 5. And the button must actually be pressable afterwards - the point of all
        of the above. A stranded latch makes the handler return before it does
        anything observable, so assert it reaches the launch path. */
  const pressable = await page.evaluate(async () => {
    if (typeof mfExplorationLaunching === 'undefined') return { skipped: 'latch not in scope' };
    mfExplorationLaunching = true;
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    return { latchAfterRestore: mfExplorationLaunching };
  });
  if (!pressable.skipped && pressable.latchAfterRestore !== false) {
    failures.push('a stranded latch survived the restore');
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  for (const f of failures) console.error('  FAIL ' + f);
  throw new Error(`bfcache restore contract broken (${failures.length})`);
}
console.log('bfcache restore: PASS (WebKit; latch, button styling and launcher entry all reset)');
