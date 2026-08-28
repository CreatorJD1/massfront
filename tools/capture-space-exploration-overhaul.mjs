import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifactDir = join(root, '.tmp', 'agent-captures', 'antigravity', 'space-overhaul');
const outDir = join(root, '.tmp', 'space-overhaul-captures');
await mkdir(outDir, { recursive: true });
await mkdir(artifactDir, { recursive: true });

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
  '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm'
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/modules/space_exploration/index.html';
    const f = resolve(join(root, p));
    if (!f.startsWith(root) || !existsSync(f)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(await readFile(f));
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const serverPort = server.address().port;
const url = `http://127.0.0.1:${serverPort}/modules/space_exploration/index.html`;

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await launchPwBrowser({
  executablePath: existsSync(chrome) ? chrome : undefined,
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox']
});

try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    colorScheme: 'dark'
  });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

  console.log('Navigating to Space Exploration test room:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for 3D engine and HUD to initialize
  await page.waitForTimeout(4000);

  // 1. Capture Planetary Survey (Mass Effect 2 Spectrogram Oscilloscope & Scanner)
  console.log('Capturing Mass Effect 2 Planetary Survey Scanner...');
  await page.evaluate(() => {
    const surveyBtn = document.getElementById('actSurvey');
    if (surveyBtn && !surveyBtn.disabled) surveyBtn.click();
    else if (window.spaceExperience) window.spaceExperience.openSurvey?.();
  });
  await page.waitForTimeout(2500);

  const shot1 = join(outDir, '01-me2-planetary-scanner.png');
  await page.screenshot({ path: shot1 });
  await copyFile(shot1, join(artifactDir, '01-me2-planetary-scanner.png'));
  console.log('Saved 01-me2-planetary-scanner.png');

  // Close Survey and open UGA Ark Base Management
  await page.evaluate(() => {
    const closeBtn = document.getElementById('btnCloseSurvey');
    if (closeBtn) closeBtn.click();
  });
  await page.waitForTimeout(1000);

  // 2. Open UGA Ark Management
  console.log('Opening UGA Ark Interior Base Management...');
  await page.evaluate(() => {
    const igaBtn = document.getElementById('actInteract');
    if (igaBtn) igaBtn.click();
  });
  await page.waitForTimeout(4000);

  const shot2 = join(outDir, '02-uga-base-overview.png');
  await page.screenshot({ path: shot2 });
  await copyFile(shot2, join(artifactDir, '02-uga-base-overview.png'));
  console.log('Saved 02-uga-base-overview.png');

  // 3. Focus on a Function Sector (Research Directorate)
  console.log('Focusing on Function Sector: Research Directorate...');
  await page.evaluate(() => {
    const researchBtn = document.querySelector('button[data-district="research"]');
    if (researchBtn) researchBtn.click();
  });
  await page.waitForTimeout(1500);

  const shot3 = join(outDir, '03-uga-function-sector-research.png');
  await page.screenshot({ path: shot3 });
  await copyFile(shot3, join(artifactDir, '03-uga-function-sector-research.png'));
  console.log('Saved 03-uga-function-sector-research.png');

  // 4. Focus on a Civil Sector (Habitat & Medical)
  console.log('Focusing on Civil Sector: Habitat & Medical...');
  await page.evaluate(() => {
    const civilFilter = document.querySelector('button[data-sector-filter="civil"]');
    if (civilFilter) civilFilter.click();
    const habitatBtn = document.querySelector('button[data-district="habitat"]');
    if (habitatBtn) habitatBtn.click();
  });
  await page.waitForTimeout(1500);

  const shot4 = join(outDir, '04-uga-civil-sector-habitat.png');
  await page.screenshot({ path: shot4 });
  await copyFile(shot4, join(artifactDir, '04-uga-civil-sector-habitat.png'));
  console.log('Saved 04-uga-civil-sector-habitat.png');
  await page.close();

  // 5. Mobile Portrait Viewport (412 x 915)
  console.log('Capturing Mobile Portrait Viewport...');
  const mobilePage = await browser.newPage({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    hasTouch: true
  });
  await mobilePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mobilePage.waitForTimeout(4000);

  // Open UGA Management on Mobile
  await mobilePage.evaluate(() => {
    const igaBtn = document.getElementById('actInteract');
    if (igaBtn) igaBtn.click();
  });
  await mobilePage.waitForTimeout(3000);

  const shot5 = join(outDir, '05-mobile-portrait-base.png');
  await mobilePage.screenshot({ path: shot5 });
  await copyFile(shot5, join(artifactDir, '05-mobile-portrait-base.png'));
  console.log('Saved 05-mobile-portrait-base.png');

  // Open ME2 Scanner on Mobile
  await mobilePage.evaluate(() => {
    const exitBtn = document.getElementById('btnExitUga');
    if (exitBtn) exitBtn.click();
  });
  await mobilePage.waitForTimeout(1000);
  await mobilePage.evaluate(() => {
    const surveyBtn = document.getElementById('actSurvey');
    if (surveyBtn && !surveyBtn.disabled) surveyBtn.click();
  });
  await mobilePage.waitForTimeout(2500);

  const shot6 = join(outDir, '06-mobile-portrait-scanner.png');
  await mobilePage.screenshot({ path: shot6 });
  await copyFile(shot6, join(artifactDir, '06-mobile-portrait-scanner.png'));
  console.log('Saved 06-mobile-portrait-scanner.png');
  await mobilePage.close();

  // 6. Mobile Landscape Viewport (915 x 412)
  console.log('Capturing Mobile Landscape Viewport...');
  const landPage = await browser.newPage({
    viewport: { width: 915, height: 412 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    hasTouch: true
  });
  await landPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await landPage.waitForTimeout(4000);

  // Open UGA Management in Landscape
  await landPage.evaluate(() => {
    const igaBtn = document.getElementById('actInteract');
    if (igaBtn) igaBtn.click();
  });
  await landPage.waitForTimeout(3000);

  const shot7 = join(outDir, '07-mobile-landscape-base.png');
  await landPage.screenshot({ path: shot7 });
  await copyFile(shot7, join(artifactDir, '07-mobile-landscape-base.png'));
  console.log('Saved 07-mobile-landscape-base.png');

  // Open ME2 Scanner in Landscape
  await landPage.evaluate(() => {
    const exitBtn = document.getElementById('btnExitUga');
    if (exitBtn) exitBtn.click();
  });
  await landPage.waitForTimeout(1000);
  await landPage.evaluate(() => {
    const surveyBtn = document.getElementById('actSurvey');
    if (surveyBtn && !surveyBtn.disabled) surveyBtn.click();
  });
  await landPage.waitForTimeout(2500);

  const shot8 = join(outDir, '08-mobile-landscape-scanner.png');
  await landPage.screenshot({ path: shot8 });
  await copyFile(shot8, join(artifactDir, '08-mobile-landscape-scanner.png'));
  console.log('Saved 08-mobile-landscape-scanner.png');

  await landPage.close();
} finally {
  await closePwBrowser();
  server.close();
}
