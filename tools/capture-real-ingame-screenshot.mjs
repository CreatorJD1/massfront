import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { playwrightGpuLaunch, assertHardwareGpu } from './chrome-gpu.mjs';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const wwwDir = join(root, 'www');
const artifactDir = join(root, '.tmp', 'agent-captures', 'antigravity', 'real-ingame');
await mkdir(artifactDir, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wasm': 'application/wasm'
};

const server = createServer(async (req, res) => {
  try {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = join(wwwDir, reqPath);
    const ext = extname(filePath).toLowerCase();
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  } catch (err) {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const PORT = 8999;
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
console.log(`Local web server listening on http://127.0.0.1:${PORT}`);

const browser = await launchPwBrowser(playwrightGpuLaunch());

try {
  const page = await browser.newPage({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    colorScheme: 'dark'
  });

  await page.addInitScript(() => {
    try {
      localStorage.setItem('mf_ap_gate_closed', '1');
      localStorage.setItem('mf_ap_dismissed', '1');
      localStorage.setItem('mf_offline', '1');
      window.checkVictory = () => {};
      window.gameOver = () => {};
    } catch (e) {}
  });

  page.on('pageerror', e => console.log('PAGE ERROR: ' + e.message));

  console.log('Navigating to game...');
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await assertHardwareGpu(page);

  // Wait for engine init & heightmap array heightF
  await page.waitForFunction(() => typeof render === 'function' && typeof heightF !== 'undefined' && !!heightF && typeof FX !== 'undefined' && !!FX.rock, { timeout: 30000 });
  await page.waitForTimeout(1000);

  // Directly initialize live 3D battlefield rendering with no UI overlay blockage
  await page.evaluate(() => {
    if (typeof apClose === 'function') apClose();
    window.checkVictory = () => {};
    window.gameOver = () => {};
    
    matchLive = true;
    running = true;
    paused = false;
    demoMode = false;
    fogOn = false;
    victoryDone = true;

    // Purge ALL DOM elements except the 3D WebGL canvas
    document.body.className = 'mfIntroDone';
    document.querySelectorAll('body > *:not(canvas)').forEach(e => e.remove());
    document.querySelectorAll('div, form, header, footer, section, button, span, img').forEach(e => {
      if (e.tagName !== 'CANVAS') e.style.setProperty('display', 'none', 'important');
    });

    matchLive = true;
    running = true;
    paused = false;
    demoMode = false;
    fogOn = false;
    victoryDone = true;

    // Set up camera and render base ground
    cam.x = MAP * 0.5; cam.y = MAP * 0.5;
    orthoSpan = distTarget = 480;
    clampCam();
    camUpdateMatrices();
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);

  const realShot1 = join(artifactDir, 'real-ingame-match-overview.png');
  await page.screenshot({ path: realShot1, fullPage: false });
  console.log('SAVED REAL INGAME MATCH SCREENSHOT:', realShot1);

  // Capture City Paving with human buildings
  await page.evaluate(() => {
    blds.length = 0;
    if (typeof makeBuilding === 'function') {
      makeBuilding('hq', 0, 1000, 1000);
      makeBuilding('fac', 0, 1080, 1000);
      makeBuilding('pgen', 0, 1000, 1080);
      makeBuilding('mex', 0, 1080, 1080);
    }
    cam.x = 1040; cam.y = 1040;
    orthoSpan = distTarget = 300;
    clampCam();
    camUpdateMatrices();
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);

  const realShot2 = join(artifactDir, 'real-ingame-city-paving.png');
  await page.screenshot({ path: realShot2, fullPage: false });
  console.log('SAVED REAL INGAME CITY PAVING SCREENSHOT:', realShot2);

  // Capture Nordhall (arctic) ground
  await page.evaluate(() => {
    blds.length = 0;
    window.curTheme = 'arctic';
    if (typeof buildTerrain === 'function') buildTerrain('arctic');
    if (typeof initPaving === 'function') initPaving();
    if (typeof buildTerrainMesh === 'function') buildTerrainMesh('arctic');
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);
  const realShotNordhall = join(artifactDir, 'real-ingame-nordhall-arctic.png');
  await page.screenshot({ path: realShotNordhall, fullPage: false });
  console.log('SAVED NORDHALL GROUND SCREENSHOT:', realShotNordhall);

  // Capture Pyraeth (ashland) ground
  await page.evaluate(() => {
    blds.length = 0;
    window.curTheme = 'ashland';
    if (typeof buildTerrain === 'function') buildTerrain('ashland');
    if (typeof initPaving === 'function') initPaving();
    if (typeof buildTerrainMesh === 'function') buildTerrainMesh('ashland');
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);
  const realShotPyraeth = join(artifactDir, 'real-ingame-pyraeth-ashland.png');
  await page.screenshot({ path: realShotPyraeth, fullPage: false });
  console.log('SAVED PYRAETH GROUND SCREENSHOT:', realShotPyraeth);

} catch (err) {
  console.error('Real game screenshot failed:', err);
} finally {
  await browser.close();
  server.close();
}
