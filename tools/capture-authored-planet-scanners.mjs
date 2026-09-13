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

const outDir = join(root, 'docs', 'visuals', 'scanners');
const artifactDir = join(root, '.tmp', 'agent-captures', 'antigravity', 'planet-scanners');
await mkdir(outDir, { recursive: true });
await mkdir(artifactDir, { recursive: true });

const browser = await launchPwBrowser();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    colorScheme: 'dark'
  });

  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  // 1. Open Survey on Planet 1: Caldris
  console.log('Opening Orbital Survey for Caldris...');
  await page.evaluate(() => {
    const surveyBtn = document.getElementById('actSurvey');
    if (surveyBtn && !surveyBtn.disabled) surveyBtn.click();
  });
  await page.waitForTimeout(2500);

  const shot1 = join(outDir, '01-scanner-caldris.png');
  await page.screenshot({ path: shot1 });
  await copyFile(shot1, join(artifactDir, '01-scanner-caldris.png'));
  console.log('Saved 01-scanner-caldris.png');

  // 2. Switch to Planet 2 in Aelos: Ithara (Golden Jade world with Rings)
  console.log('Switching to Ithara (with rings)...');
  await page.evaluate(() => {
    const itharaPill = document.querySelector('button[data-planet-id="aelos_ithara"]');
    if (itharaPill) itharaPill.click();
  });
  await page.waitForTimeout(2500);

  const shot2 = join(outDir, '02-scanner-ithara-rings.png');
  await page.screenshot({ path: shot2 });
  await copyFile(shot2, join(artifactDir, '02-scanner-ithara-rings.png'));
  console.log('Saved 02-scanner-ithara-rings.png');

  // 3. Mobile Viewport test for Ithara
  console.log('Capturing Mobile Portrait for Ithara...');
  const mobilePage = await browser.newPage({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    hasTouch: true
  });
  await mobilePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mobilePage.waitForTimeout(3500);

  await mobilePage.evaluate(() => {
    const surveyBtn = document.getElementById('actSurvey');
    if (surveyBtn && !surveyBtn.disabled) surveyBtn.click();
  });
  await mobilePage.waitForTimeout(2000);

  await mobilePage.evaluate(() => {
    const itharaPill = document.querySelector('button[data-planet-id="aelos_ithara"]');
    if (itharaPill) itharaPill.click();
  });
  await mobilePage.waitForTimeout(2000);

  const shot3 = join(outDir, '03-mobile-scanner-ithara.png');
  await mobilePage.screenshot({ path: shot3 });
  await copyFile(shot3, join(artifactDir, '03-mobile-scanner-ithara.png'));
  console.log('Saved 03-mobile-scanner-ithara.png');

  await mobilePage.close();
  await page.close();
} finally {
  await closePwBrowser();
  server.close();
}
