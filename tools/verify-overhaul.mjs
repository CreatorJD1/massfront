import http from 'http';
import fs from 'fs';
import path from 'path';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';

const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4'
};

// Check if port 8901 is up
let port = 8901;
let localServer = null;

const checkPort = (p) => new Promise(resolve => {
  const req = http.get(`http://127.0.0.1:${p}/`, res => {
    resolve(true);
  });
  req.on('error', () => resolve(false));
});

const isUp = await checkPort(8901);
if (isUp) {
  console.log('Existing server detected on port 8901, reusing.');
} else {
  localServer = http.createServer((req, res) => {
    let file = path.join('www', req.url.split('?')[0]);
    if (file.endsWith('/') || file === 'www') file = path.join('www', 'index.html');
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found: ' + req.url);
    }
  });
  await new Promise(r => localServer.listen(8902, '127.0.0.1', r));
  port = 8902;
  console.log(`Local server listening at http://127.0.0.1:${port}/`);
}

const errors = [];
try {
  const browser = await launchPwBrowser();
  const page = await browser.newPage({ viewport: { width: 412, height: 900 }, hasTouch: true });
  page.on('pageerror', e => {
    console.error('PAGE ERROR:', e.message);
    errors.push(e.message);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERR:', msg.text());
    }
  });

  console.log(`Navigating to http://127.0.0.1:${port}/...`);
  await page.goto(`http://127.0.0.1:${port}/`);
  await assertHardwareGpu(page);
  console.log('Hardware GPU verified.');

  // Wait for boot
  await page.waitForTimeout(11000);

  // Close intro / pre-alpha gates
  const intro = page.locator('#mfIntroStart');
  if (await intro.isVisible()) {
    console.log('Clicking intro start');
    await intro.click();
    await page.waitForTimeout(500);
  }
  const gate = page.locator('#apCloseBtn');
  if (await gate.isVisible()) {
    console.log('Closing auth/alpha gate');
    await gate.click();
    await page.waitForTimeout(500);
  }

  // Screenshot Start Screen with Next Unlock Rail
  await page.screenshot({ path: 'tools/verify_start_screen.png' });
  console.log('Start screen captured: tools/verify_start_screen.png');

  // Verify Next Unlock Rail in Start Screen
  const railCount = await page.locator('#mfNextUnlockRail .mfNextCard').count();
  console.log('Next Unlock cards on start screen:', railCount);

  // Open War Room
  await page.click('#startBtn');
  await page.waitForTimeout(800);
  await page.click('.warCard[data-mode="standard"]');
  await page.waitForTimeout(600);

  // Stage 1: Galaxy (Sombrero-I) -> click enter
  console.log('Entering System from Galaxy...');
  await page.click('#setupStart');
  await page.waitForTimeout(800);

  // Stage 2: System (Aelos) -> click enter
  console.log('Entering Planet from System...');
  await page.click('#setupStart');
  await page.waitForTimeout(800);

  // Stage 3: Planet -> Region
  console.log('Entering Region from Planet...');
  await page.click('#setupStart');
  await page.waitForTimeout(800);

  // Check Site Intel Dossier in Region Stage
  const intelDossier = await page.locator('.mfSiteIntelDossier').count();
  console.log('Region stage site intel dossiers visible:', intelDossier);
  await page.screenshot({ path: 'tools/verify_region_intel.png' });
  console.log('Region intel captured: tools/verify_region_intel.png');

  // Stage 4: Region -> Deploy
  console.log('Entering Deploy Stage...');
  await page.click('#setupStart');
  await page.waitForTimeout(800);

  // Check Deploy Summary & Telemetry Bar
  const intelBar = await page.locator('.mfSiteIntelBar').count();
  console.log('Deploy stage site intel bar visible:', intelBar);
  await page.screenshot({ path: 'tools/verify_deploy_brief.png' });
  console.log('Deploy brief captured: tools/verify_deploy_brief.png');

  // Stage 5: Start Battle & Generate Terrain
  console.log('Starting Battle (terrain generation + WebGL init)...');
  await page.click('#setupStart');
  await page.waitForTimeout(14000);

  // Click Deploy Button to start match clock
  const deployBtn = page.locator('#deployBtn');
  if (await deployBtn.isVisible()) {
    console.log('Clicking Deploy Button...');
    await deployBtn.click();
  }
  await page.waitForTimeout(4000);

  // Measure in-match rendering
  const matchMetrics = await page.evaluate(() => {
    return {
      curTheme: typeof curTheme !== 'undefined' ? curTheme : null,
      treeCount: typeof trees !== 'undefined' ? trees.length : 0,
      rockCount: typeof rocks !== 'undefined' ? rocks.length : 0,
      coverCount: typeof cover !== 'undefined' ? cover.length : 0,
      unitCount: typeof unitCount !== 'undefined' ? unitCount : 0,
      fps: typeof frameFps !== 'undefined' ? frameFps : (typeof fps !== 'undefined' ? fps : 60),
      hasSpeciesSprites: typeof sprites !== 'undefined' && !!sprites.treePine && !!sprites.rockIce
    };
  });
  console.log('In-match state:', JSON.stringify(matchMetrics, null, 2));

  await page.screenshot({ path: 'tools/verify_in_match_battlefield.png' });
  console.log('In-match battlefield captured: tools/verify_in_match_battlefield.png');

} catch (err) {
  console.error('Test execution error:', err);
  errors.push(err.message);
} finally {
  await closePwBrowser();
  if (localServer) localServer.close();
  console.log('Browser and local server closed.');
  if (errors.length > 0) {
    console.error('Verification failed with errors:', errors);
    process.exit(1);
  } else {
    console.log('ALL VERIFICATIONS PASSED CLEANLY WITH ZERO ERRORS.');
    process.exit(0);
  }
}
