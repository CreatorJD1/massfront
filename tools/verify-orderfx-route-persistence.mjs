// Real 412x900 gameplay verification for move-route readability. The launch
// path is player-visible; only the deterministic move target is authored in
// page context so timed captures can compare the same route on every run.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, relative, resolve } from 'node:path';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';
import { closePwBrowser, launchPwBrowser } from './pw-browser.mjs';
import { enterGalacticStandardRoute } from './perf-lab/perf-probe-runner.mjs';

const root = process.cwd();
const tag = process.env.MF_ORDERFX_TAG || 'final';
assert.match(tag, /^[a-z0-9][a-z0-9-]*$/, 'MF_ORDERFX_TAG must be a safe evidence label');
const out = resolve(root, 'tmp/orderfx-route', tag);
const sourcePath = resolve(root, 'src/ui/orderfx.js');
const delays = [150, 1400, 3000];
const errors = [];
let server, browser, page, guard, sourceBefore, sourceAfter, gpu, runtimeUrl;
let setup = null, samples = [], fatal = null, freezeStable = false;

const digest = value => createHash('sha256').update(value).digest('hex');
const MIME = Object.freeze({
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm'
});

async function openStandardBattle(page) {
  await page.waitForFunction(() => typeof orderMove === 'function' && typeof moveFxDraw === 'function', null, { timeout: 120_000 });
  await page.waitForFunction(() => !document.getElementById('mfBootCover'));
  await page.waitForFunction(() => {
    const play = document.getElementById('mfLaunchPlay'), offline = document.getElementById('mfLaunchOffline');
    return play && !play.disabled || offline && !offline.disabled && getComputedStyle(offline).display !== 'none';
  });
  if (await page.locator('#mfLaunchPlay').isEnabled() && /CONTINUE TO INTRO/.test(await page.locator('#mfLaunchPlay').innerText())) {
    await page.locator('#mfLaunchPlay').click();
  } else await page.locator('#mfLaunchOffline').click();
  await page.locator('#mfIntroStart').click();
  await page.locator('#apOfflineBtn').click();
  await page.waitForURL('**/modules/space_exploration/index.html*', { timeout: 30_000 });
  await enterGalacticStandardRoute(page);
  for (let n = 0; n < 5; n++) {
    await page.waitForFunction(() => {
      const shown = element => !!(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
      return (shown(document.getElementById('deployBtn')) || shown(document.getElementById('setupStart')))
        && !shown(document.getElementById('loadScr'));
    }, null, { timeout: 60_000 });
    if (await page.locator('#deployBtn').isVisible()) break;
    try { await page.locator('#setupStart').click({ timeout: 60_000 }); }
    catch (error) { if (!await page.locator('#deployBtn').isVisible()) throw error; }
    await page.waitForTimeout(600);
  }
  await page.locator('#deployBtn').waitFor({ state: 'visible', timeout: 60_000 });
  try { await page.locator('#deployBtn').click(); }
  catch (error) { if (!await page.evaluate(() => matchLive)) throw error; }
  await page.waitForFunction(() => matchLive, null, { timeout: 15_000 });
}

try {
  await mkdir(out, { recursive: true });
  guard = await acquireVerificationFreeze({
    root,
    label: `orderfx route persistence ${tag}`,
    allowedPaths: [resolve(root, 'tmp'), resolve(root, 'audit')]
  });
  sourceBefore = digest(await readFile(sourcePath));
  server = createServer(async (request, response) => {
    try {
      const path = resolve(root, `.${new URL(request.url, 'http://local').pathname.replace(/\/$/, '/index.html')}`);
      const rel = relative(root, path);
      if (rel.startsWith('..') || isAbsolute(rel)) { response.writeHead(403); return response.end(); }
      response.setHeader('Content-Type', MIME[extname(path)] || 'application/octet-stream');
      response.setHeader('Cache-Control', 'no-store');
      response.end(await readFile(path));
    } catch (_) { response.writeHead(404); response.end(); }
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  runtimeUrl = `http://127.0.0.1:${server.address().port}/`;
  browser = await launchPwBrowser();
  page = await browser.newPage({ viewport: { width: 412, height: 900 }, hasTouch: true });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(runtimeUrl, { waitUntil: 'domcontentloaded' });
  gpu = await assertHardwareGpu(page);
  await openStandardBattle(page);
  setup = await page.evaluate(() => {
    const ids = [];
    for (let i = 0; i < unitHigh && ids.length < 8; i++) {
      const type = TYPES[utype[i]];
      if (ualive[i] && uteam[i] === 0 && type && !type.air && !type.naval) ids.push(i);
    }
    if (!ids.length) throw new Error('NO_PLAYER_GROUND_UNITS_FOR_ORDERFX');
    usel.fill(0);
    let cx = 0, cy = 0;
    for (const id of ids) { usel[id] = 1; cx += ux[id]; cy += uy[id]; }
    cx /= ids.length; cy /= ids.length;
    const sign = cy < MAP * .58 ? 1 : -1;
    const requested = [cx, clamp(cy + sign * 340, 40, MAP - 40)];
    const legal = findLand(requested[0], requested[1]) || requested;
    cam.x = cx; cam.y = (cy + legal[1]) * .5;
    camYaw = yawTarget = 0; camPitch = pitchTarget = 1.3;
    orthoSpan = distTarget = 760; camUpdateMatrices();
    moveMode = true;
    orderMove(legal[0], legal[1], false, true);
    const fx = moveFxList[moveFxList.length - 1];
    if (!fx) throw new Error('MOVE_ROUTE_EFFECT_NOT_CREATED');
    return {
      issuedAt: performance.now(), ids, start: [cx, cy], destination: [legal[0], legal[1]],
      routeLength: fx.len, lifetimeMs: fx.until - fx.born, viewport: [innerWidth, innerHeight],
      screenStart: w2s(cx, cy), screenDestination: w2s(legal[0], legal[1]), orthoSpan
    };
  });
  for (let index = 0; index < delays.length; index++) {
    await page.waitForFunction(({ issuedAt, target }) => performance.now() - issuedAt >= target,
      { issuedAt: setup.issuedAt, target: delays[index] });
    const sample = await page.evaluate(({ issuedAt, expectedDelay }) => {
      const fx = moveFxList[moveFxList.length - 1] || null;
      const now = performance.now(), span = orthoSpan, worldPerPx = span / Math.max(1, VH);
      const k = clamp(span / 470, 1, 3.2), spacing = Math.max(46, 34 * k);
      const clock = now / 1000;
      const motion = typeof moveFxMotion === 'function'
        ? moveFxMotion(k, clock)
        : { spacing, drift: (clock * 58) % spacing, flash: null, screenSpeed: 58 / worldPerPx };
      return {
        expectedDelay, elapsedMs: now - issuedAt, alive: !!fx,
        remainingMs: fx ? fx.until - now : 0, routeCount: moveFxList.length,
        worldPerPx, spacingPx: motion.spacing / worldPerPx,
        phasePx: motion.drift / worldPerPx, screenSpeedPxPerSec: motion.screenSpeed,
        flash: motion.flash
      };
    }, { issuedAt: setup.issuedAt, expectedDelay: delays[index] });
    const image = resolve(out, `${index + 1}-${delays[index]}ms.png`);
    await page.screenshot({ path: image });
    samples.push({ ...sample, image });
  }
} catch (error) {
  fatal = error.stack || String(error);
} finally {
  if (browser) try { await closePwBrowser(); } catch (error) { errors.push(`browser close: ${error}`); }
  if (server?.listening) await new Promise(done => server.close(done));
  try { sourceAfter = digest(await readFile(sourcePath)); } catch (error) { errors.push(`source hash: ${error}`); }
  if (guard) try { await guard.release({ assertStable: true, name: `orderfx ${tag} complete` }); freezeStable = true; }
  catch (error) { errors.push(`freeze: ${error}`); }
}

const phaseForward = samples.length === delays.length && samples.slice(1).every((sample, index) => {
  const previous = samples[index];
  const delta = (sample.phasePx - previous.phasePx + sample.spacingPx) % sample.spacingPx;
  return delta > 4 && delta < sample.spacingPx * .9;
});
const pass = !fatal && !errors.length && freezeStable && sourceBefore === sourceAfter
  && samples.length === delays.length && samples.every(sample => sample.alive)
  && samples.every(sample => sample.screenSpeedPxPerSec >= 22 && sample.screenSpeedPxPerSec <= 34)
  && phaseForward;
const report = {
  status: pass ? 'PASS' : 'FAIL', tag, runtimeUrl, gpu, setup, delays, samples,
  phaseForward, sourceBefore, sourceAfter, freezeStable, errors, fatal
};
await writeFile(resolve(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exitCode = pass ? 0 : 1;
