#!/usr/bin/env node
/* Real-browser recovery proof for the one failure that cannot no module code can
   catch: the space entry module itself never loading. The inline document
   bootstrap must expose a usable escape, Classic must remain navigable, and a
   deliberate UGA retry must be the only action that clears that session latch. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { closePwBrowser, launchPwBrowser } from './pw-browser.mjs';

const root = process.cwd();
const outDir = resolve(root, 'tmp/space-bootstrap-fallback');
const latchKey = 'massfront.galactic.classic-fallback.v1';
const mime = {
  '.bin': 'application/octet-stream', '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.ktx2': 'image/ktx2',
  '.m4a': 'audio/mp4', '.mjs': 'text/javascript; charset=utf-8',
  '.ogg': 'audio/ogg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.webp': 'image/webp', '.woff2': 'font/woff2'
};

const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url || '/', 'http://local').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(`${root}${sep}`) || !existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': mime[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': body.length
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500).end(String(error?.stack || error));
  }
});

await new Promise((accept, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', accept);
});
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir(outDir, { recursive: true });

const report = {
  startedAt: new Date().toISOString(), origin,
  viewport: { width: 412, height: 900 }, blockedEntryImports: 0,
  pageErrors: [], consoleErrors: [], steps: []
};
let browser;
let context;
let page;
try {
  browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });
  context = await browser.newContext({ viewport: report.viewport, hasTouch: true, colorScheme: 'dark', serviceWorkers: 'block' });
  page = await context.newPage();
  page.setDefaultTimeout(90_000);
  page.on('pageerror', error => report.pageErrors.push(String(error?.stack || error)));
  page.on('console', message => {
    if (message.type() === 'error' && !/net::ERR_FAILED|Failed to load resource/i.test(message.text())) {
      report.consoleErrors.push(message.text());
    }
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/modules/space_exploration/src/space_module.js')) {
      report.blockedEntryImports++;
      return route.abort('failed');
    }
    if (['127.0.0.1', 'localhost'].includes(url.hostname) || /^(blob|data):/.test(url.protocol)) return route.continue();
    return route.abort('blockedbyclient');
  });

  await page.goto(`${origin}/modules/space_exploration/index.html`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  report.gpu = await assertHardwareGpu(page);
  await page.locator('#renderVeil.failed').waitFor({ state: 'visible', timeout: 15_000 });
  const firstFailure = await page.evaluate(() => {
    const button = document.getElementById('renderReturnMassfront');
    const box = button?.getBoundingClientRect();
    return {
      title: document.querySelector('#renderVeil b')?.textContent || '',
      status: document.getElementById('loadStatus')?.textContent || '',
      button: button?.textContent || '',
      width: box?.width || 0,
      height: box?.height || 0,
      moduleBound: window.__MASSFRONT_SPACE_MODULE_BOUND__ === true
    };
  });
  assert.equal(firstFailure.moduleBound, false, 'the module import must actually be blocked');
  assert.match(firstFailure.title, /FAILED TO START/);
  assert.match(firstFailure.status, /COULD NOT LOAD/);
  assert.match(firstFailure.button, /RETURN TO MASSFRONT/);
  assert.ok(firstFailure.width >= 44 && firstFailure.height >= 44, 'the pre-import escape needs a mobile touch target');
  await page.screenshot({ path: resolve(outDir, '01-import-blocked-return-visible.png'), fullPage: true });
  report.steps.push({ id: 'module-import-blocked', firstFailure });

  await page.locator('#renderReturnMassfront').click();
  await page.waitForURL(url => url.pathname === '/index.html', { timeout: 30_000 });
  await page.locator('#warScr').waitFor({ state: 'visible', timeout: 90_000 });
  const classic = await page.evaluate(key => ({
    search: location.search,
    latch: sessionStorage.getItem(key),
    active: window.__MF_GALACTIC_BRIDGE?.classicFallbackActive === true,
    status: window.__MF_GALACTIC_BRIDGE?.status || '',
    warVisible: getComputedStyle(document.getElementById('warScr')).display !== 'none'
  }), latchKey);
  assert.deepEqual(classic, {
    search: '', latch: '1', active: true,
    status: 'classic-fallback-war-room', warVisible: true
  });
  const classicLayout = await page.evaluate(() => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const label = element => {
      if (element.id) return `#${element.id}`;
      const classes = [...element.classList].slice(0, 3).join('.');
      return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
    };
    const bounds = element => {
      const rect = element.getBoundingClientRect();
      return {
        selector: label(element), left: Math.round(rect.left * 100) / 100,
        right: Math.round(rect.right * 100) / 100, width: Math.round(rect.width * 100) / 100,
        clientWidth: element.clientWidth, scrollWidth: element.scrollWidth
      };
    };
    const nodes = [...document.querySelectorAll('#warScr, #warScr *')].filter(visible);
    const viewportOffenders = nodes.filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.left < -0.5 || rect.right > innerWidth + 0.5;
    }).map(bounds);
    const cards = [...document.querySelectorAll('#warScr .warCard')].filter(visible).map(bounds);
    const scrollContainers = nodes.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({
      ...bounds(element),
      overflowX: getComputedStyle(element).overflowX,
      offsetHeight: element.offsetHeight,
      clientHeight: element.clientHeight,
      text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100)
    }));
    const clippedText = [...document.querySelectorAll('#warScr .warNm, #warScr .warDs, #warScr .warFootTx, #warScr .warReward, #warScr .warLock')]
      .filter(visible)
      .filter(element => element.scrollWidth > element.clientWidth + 1)
      .map(bounds);
    return {
      innerWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      viewportOffenders,
      cards,
      scrollContainers,
      clippedText
    };
  });
  report.classicLayout = classicLayout;
  assert.equal(classicLayout.documentScrollWidth, classicLayout.innerWidth,
    `Classic recovery must not create page-level horizontal overflow: ${JSON.stringify(classicLayout.viewportOffenders)}`);
  assert.deepEqual(classicLayout.viewportOffenders, [], 'every visible War Room element must remain inside the phone viewport');
  assert.deepEqual(classicLayout.scrollContainers, [],
    `the War Room must not expose a nested horizontal scrollbar: ${JSON.stringify(classicLayout.scrollContainers)}`);
  assert.deepEqual(classicLayout.clippedText, [], 'War Room card labels and descriptions must not be horizontally clipped');
  await page.screenshot({ path: resolve(outDir, '02-classic-war-room-recovered.png'), fullPage: true });
  report.steps.push({ id: 'classic-war-room-recovered', classic, layout: classicLayout });

  const standard = page.locator('.warCard[data-mode="standard"]');
  await standard.waitFor({ state: 'visible' });
  assert.equal(await standard.isEnabled(), true);
  await standard.click();
  await page.locator('#setupScr').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), latchKey), '1');
  await page.locator('#setupBack').click();
  await page.locator('#warScr').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => location.pathname), '/index.html', 'Standard Back must stay in the Classic base game');
  report.steps.push({ id: 'standard-round-trip', result: 'setup -> Back -> Classic War Room' });

  await page.locator('#warBack').click();
  await page.locator('#startScreen').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), latchKey), '1');
  const uga = page.locator('#ugaBtn');
  await uga.waitFor({ state: 'visible' });
  await uga.click();
  await page.waitForURL(url => url.pathname.endsWith('/modules/space_exploration/index.html'), { timeout: 60_000 });
  await page.locator('#renderVeil.failed').waitFor({ state: 'visible', timeout: 15_000 });
  const retry = await page.evaluate(key => ({
    latch: sessionStorage.getItem(key),
    title: document.querySelector('#renderVeil b')?.textContent || '',
    status: document.getElementById('loadStatus')?.textContent || ''
  }), latchKey);
  assert.equal(retry.latch, null, 'an explicit, successfully prepared UGA retry must clear the Classic latch');
  assert.match(retry.title, /FAILED TO START/);
  assert.equal(report.blockedEntryImports, 2, 'the explicit retry must really attempt a new module document');
  await page.screenshot({ path: resolve(outDir, '03-explicit-retry-import-blocked.png'), fullPage: true });
  report.steps.push({ id: 'explicit-uga-retry', retry });

  await page.locator('#renderReturnMassfront').click();
  await page.locator('#warScr').waitFor({ state: 'visible', timeout: 90_000 });
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), latchKey), '1', 'a second emergency escape must re-arm Classic recovery');
  report.steps.push({ id: 'repeat-recovery', result: 'Classic War Room restored and latch re-armed' });

  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  report.pass = true;
} catch (error) {
  report.pass = false;
  report.failure = String(error?.stack || error);
  await page?.screenshot({ path: resolve(outDir, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2));
  await page?.close().catch(() => {});
  await context?.close().catch(() => {});
  await closePwBrowser(browser).catch(() => {});
  await new Promise(resolveClose => server.close(resolveClose));
}

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.pass ? 0 : 1;
