#!/usr/bin/env node
/* SCREENSHOT WHAT UGA COMMAND NOW OPENS ON.
 *
 * The door used to land on the War Table panel — the same place DEPLOY
 * MASSFRONT goes — so the button named after the ship never showed the ship.
 * It enters at the 'system' view now: the orbital scene with NEXUS-VII.
 *
 * The module boots to that same view when no ticket names another one
 * (space_module.js: `host.ticket?.entryView || 'system'`), so loading it
 * directly captures exactly the scene the menu door now reaches.
 *
 * Usage: node tools/capture-uga-space-entry.mjs [--out tmp/uga-shots]
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const outDir = join(root, (argv.indexOf('--out') >= 0 && argv[argv.indexOf('--out') + 1]) || join('tmp', 'uga-shots'));
await mkdir(outDir, { recursive: true });
const moduleRoot = join(root, 'modules', 'space_exploration');

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2',
  '.bin': 'application/octet-stream', '.basis': 'application/octet-stream'
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    const file = resolve(moduleRoot, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
    assert.ok(file.startsWith(moduleRoot), 'path escape');
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch {
    if (!response.headersSent) response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('nf');
  }
});
await new Promise(accept => server.listen(0, '127.0.0.1', accept));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await launchPwBrowser({ ownershipMode: 'isolated' });
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded', timeout: 180000 });

  /* Wait for the exterior to finish streaming rather than a fixed sleep: the
     scene is the point of the capture, and a timer catches it half-built. */
  await page.waitForFunction(() => {
    const frame = document.querySelector('[data-exterior-visual-state]')
      || document.getElementById('spaceFrame') || document.body;
    return frame?.dataset?.exteriorVisualState === 'ready'
      || document.querySelector('canvas')?.clientWidth > 0;
  }, null, { polling: 250, timeout: 180000 }).catch(() => {});
  await page.waitForTimeout(9000);

  const scene = await page.evaluate(() => {
    const frame = document.querySelector('[data-scene]');
    return {
      scene: frame?.dataset?.scene || '(none)',
      exterior: document.querySelector('[data-exterior-visual-state]')?.dataset?.exteriorVisualState || '(none)',
      entryView: document.querySelector('[data-entry-view]')?.dataset?.entryView || '(none)',
      canvases: document.querySelectorAll('canvas').length
    };
  });
  console.log('scene=' + scene.scene + '  entryView=' + scene.entryView
    + '  exterior=' + scene.exterior + '  canvases=' + scene.canvases);

  const file = join(outDir, 'entry-space.png');
  await page.screenshot({ path: file, timeout: 30000 });
  console.log('-> ' + file.replace(root, '.'));
  if (errors.length) console.log('page errors: ' + [...new Set(errors)].slice(0, 3).join(' | '));
  await page.close();
} finally {
  try { await closePwBrowser(browser); } catch {}
  server.close();
}
