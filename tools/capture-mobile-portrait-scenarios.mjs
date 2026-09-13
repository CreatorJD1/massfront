import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFile, mkdir } from 'node:fs/promises';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml'
};

const server = createServer(async (req, res) => {
  try {
    const rawPath = req.url.split('?')[0];
    const path = rawPath === '/' ? '/modules/space_exploration/index.html' : rawPath;
    const file = join(root, path.replace(/^\//, ''));
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/modules/space_exploration/index.html`;

const outDir = join(root, 'docs', 'visuals', 'mobile');
const artifactDir = join(root, '.tmp', 'agent-captures', 'antigravity', 'mobile-portrait');
await mkdir(outDir, { recursive: true });
await mkdir(artifactDir, { recursive: true });

const browser = await launchPwBrowser();
try {
  console.log('Launching Mobile Portrait Viewport (412 x 915)...');
  const page = await browser.newPage({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    hasTouch: true
  });

  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  // 1. Mobile Portrait: Caldris Scanner
  console.log('Capturing Mobile Portrait Scanner: Caldris...');
  await page.evaluate(() => {
    const surveyBtn = document.getElementById('actSurvey');
    if (surveyBtn && !surveyBtn.disabled) surveyBtn.click();
  });
  await page.waitForTimeout(3000);

  const shot1 = join(outDir, 'mobile-01-scanner-caldris-portrait.png');
  await page.screenshot({ path: shot1 });
  await copyFile(shot1, join(artifactDir, 'mobile-01-scanner-caldris-portrait.png'));
  console.log('Saved mobile-01-scanner-caldris-portrait.png');

  // 2. Mobile Portrait: Ithara Scanner (with Rings)
  console.log('Capturing Mobile Portrait Scanner: Ithara (Rings)...');
  await page.evaluate(() => {
    const itharaBtn = document.querySelector('button[data-planet-id="aelos_ithara"]');
    if (itharaBtn) itharaBtn.click();
  });
  await page.waitForTimeout(3000);

  const shot2 = join(outDir, 'mobile-02-scanner-ithara-rings-portrait.png');
  await page.screenshot({ path: shot2 });
  await copyFile(shot2, join(artifactDir, 'mobile-02-scanner-ithara-rings-portrait.png'));
  console.log('Saved mobile-02-scanner-ithara-rings-portrait.png');

  // Exit scanner to return to flight
  await page.evaluate(() => {
    const closeBtn = document.getElementById('btnCloseSurvey');
    if (closeBtn) closeBtn.click();
  });
  await page.waitForTimeout(1000);

  // 3. Mobile Portrait: Base Overview
  console.log('Capturing Mobile Portrait Base Overview...');
  await page.evaluate(() => {
    const interactBtn = document.getElementById('actInteract');
    if (interactBtn) interactBtn.click();
  });
  await page.waitForTimeout(3000);

  const shot3 = join(outDir, 'mobile-03-uga-base-overview-portrait.png');
  await page.screenshot({ path: shot3 });
  await copyFile(shot3, join(artifactDir, 'mobile-03-uga-base-overview-portrait.png'));
  console.log('Saved mobile-03-uga-base-overview-portrait.png');

  // 4. Mobile Portrait: Research Directorate
  console.log('Capturing Mobile Portrait Research Directorate...');
  await page.evaluate(() => {
    const researchBtn = document.querySelector('button[data-district="research"]');
    if (researchBtn) researchBtn.click();
  });
  await page.waitForTimeout(2000);

  const shot4 = join(outDir, 'mobile-04-uga-research-district-portrait.png');
  await page.screenshot({ path: shot4 });
  await copyFile(shot4, join(artifactDir, 'mobile-04-uga-research-district-portrait.png'));
  console.log('Saved mobile-04-uga-research-district-portrait.png');

  // 5. Mobile Portrait: Habitat & Medical Arcology
  console.log('Capturing Mobile Portrait Habitat & Medical...');
  await page.evaluate(() => {
    const civilFilter = document.querySelector('button[data-filter="civil"]');
    if (civilFilter) civilFilter.click();
    const habitatBtn = document.querySelector('button[data-district="habitat"]');
    if (habitatBtn) habitatBtn.click();
  });
  await page.waitForTimeout(2000);

  const shot5 = join(outDir, 'mobile-05-uga-habitat-district-portrait.png');
  await page.screenshot({ path: shot5 });
  await copyFile(shot5, join(artifactDir, 'mobile-05-uga-habitat-district-portrait.png'));
  console.log('Saved mobile-05-uga-habitat-district-portrait.png');

  // 6. Mobile Portrait: Engineering & Warp Core
  console.log('Capturing Mobile Portrait Engineering...');
  await page.evaluate(() => {
    const funcFilter = document.querySelector('button[data-filter="function"]');
    if (funcFilter) funcFilter.click();
    const engBtn = document.querySelector('button[data-district="engineering"]');
    if (engBtn) engBtn.click();
  });
  await page.waitForTimeout(2000);

  const shot6 = join(outDir, 'mobile-06-uga-engineering-district-portrait.png');
  await page.screenshot({ path: shot6 });
  await copyFile(shot6, join(artifactDir, 'mobile-06-uga-engineering-district-portrait.png'));
  console.log('Saved mobile-06-uga-engineering-district-portrait.png');

  await page.close();
} finally {
  await closePwBrowser();
  server.close();
}
