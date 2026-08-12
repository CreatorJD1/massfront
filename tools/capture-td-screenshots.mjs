import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifactDir = 'C:/Users/Jason/.gemini/antigravity/brain/86010afe-f1c4-44d4-a618-12f28cfd8c8b';
await mkdir(artifactDir, { recursive: true });

const url = 'http://127.0.0.1:8974/';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

console.log('Launching browser to capture 3D TD screenshots...');
const browser = await chromium.launch({
  headless: true,
  executablePath: chrome,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
});

try {
  const page = await browser.newPage({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    colorScheme: 'dark'
  });

  page.on('pageerror', e => console.log('PAGE ERROR: ' + e.message));

  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);

  // Wait for terrain generator heightmap array heightF
  await page.waitForFunction(() => typeof render === 'function' && typeof BT !== 'undefined' && typeof bldLive !== 'undefined' && typeof heightF !== 'undefined' && !!heightF, { timeout: 60000 });
  console.log('Heightmap & terrain ready! Setting up live 3D match...');

  await page.evaluate(() => {
    // Disable all delayed popups permanently
    apOpen = () => {};
    openAccountModal = () => {};
    checkVictory = () => {};
    if (typeof stopAttract === 'function') stopAttract();
    if (typeof apClose === 'function') apClose();

    matchLive = true;
    running = true;
    paused = false;
    demoMode = false;
    fogOn = false;
    victoryDone = true;
    if (typeof carrier !== 'undefined') carrier.active = false;

    // Remove all modal/overlay elements completely from DOM
    document.querySelectorAll('.overlay, #dispatch, #gameOver, #levelUp, #mfIntroCard, #mfBootCover, #setupDock, #mapModal, #attractCover, #authModal, #accountModal, #apModal, #apBackdrop, #apGateFoot, .modal, [id*="Modal"], [id*="modal"], [id*="Over"], [id*="over"]').forEach(e => e.remove());
    document.body.classList.remove('menuMode');
    document.body.classList.add('mfIntroDone');

    // Ensure full procedural terrain generation (close-range grain & distant biome splatmaps)
    if (typeof curTheme === 'undefined' || !curTheme) curTheme = 'verdant';
    if (typeof buildTerrain === 'function') buildTerrain(curTheme);
    if (typeof initPaving === 'function') initPaving();
    if (typeof buildTerrainMesh === 'function') buildTerrainMesh(curTheme);
    if (typeof buildDetailTex === 'function') buildDetailTex();

    // Clear and build defensive structures
    const cx = MAP * 0.5, cy = MAP * 0.5;
    blds.length = 0;
    rebuildBGrid(true);

    const hq = addBld('hq', 0, cx - 180, cy + 180, true);
    if (typeof makeFoundation === 'function') makeFoundation(hq);

    const lab = addBld('techlab', 0, cx + 180, cy + 180, true);
    if (typeof makeFoundation === 'function') makeFoundation(lab);

    const t1 = addBld('turret', 0, cx - 280, cy - 60, true);
    t1.kills = 12; t1.rank = 2; t1.prio = 1;
    if (typeof makeFoundation === 'function') makeFoundation(t1);

    const hellfire = addBld('hellfire_cannon', 0, cx - 140, cy - 60, true);
    hellfire.kills = 22; hellfire.rank = 3; hellfire.charging = true; hellfire.chargeTimer = 2.5; hellfire.targetLoc = [cx - 140, cy - 300];
    if (typeof makeFoundation === 'function') makeFoundation(hellfire);

    const sov = addBld('sovereign_howitzer', 0, cx, cy - 60, true);
    sov.kills = 9; sov.rank = 2;
    if (typeof makeFoundation === 'function') makeFoundation(sov);

    const sing = addBld('singularity_disruptor', 0, cx + 140, cy - 60, true);
    sing.kills = 19; sing.rank = 3;
    if (typeof makeFoundation === 'function') makeFoundation(sing);

    const spore = addBld('spore_catalyst', 2, cx + 280, cy - 60, true);
    spore.kills = 5; spore.rank = 1;
    if (typeof makeOrganicFoundation === 'function') makeOrganicFoundation(spore);

    openBld = blds.indexOf(t1);
    if (typeof renderBldPanel === 'function') renderBldPanel();

    cam.x = cx; cam.y = cy + 20; camFollow = -1;
    camYaw = yawTarget = 0.35; camPitch = pitchTarget = 1.12;
    orthoSpan = distTarget = 620;
    clampCam();
    camUpdateMatrices();
    if (typeof renderMinimap === 'function') renderMinimap();
    if (typeof render === 'function') render();
  });

  await page.waitForTimeout(1000);
  const shot1 = join(artifactDir, 'td-01-targeting-modes.png');
  await page.screenshot({ path: shot1, fullPage: false });
  console.log('Saved 3D shot:', shot1);

  // Capture Hellfire Battery
  await page.evaluate(() => {
    const h = blds.find(b => b.type === 'hellfire_cannon');
    if (h) { openBld = blds.indexOf(h); renderBldPanel(); }
    cam.x = h.x; cam.y = h.y;
    orthoSpan = distTarget = 380;
    clampCam(); camUpdateMatrices();
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);
  const shot2 = join(artifactDir, 'td-02-hellfire-battery.png');
  await page.screenshot({ path: shot2, fullPage: false });
  console.log('Saved 3D shot:', shot2);

  // Capture Sovereign Howitzer
  await page.evaluate(() => {
    const h = blds.find(b => b.type === 'sovereign_howitzer');
    if (h) { openBld = blds.indexOf(h); renderBldPanel(); }
    cam.x = h.x; cam.y = h.y;
    orthoSpan = distTarget = 380;
    clampCam(); camUpdateMatrices();
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);
  const shot3 = join(artifactDir, 'td-03-sovereign-howitzer.png');
  await page.screenshot({ path: shot3, fullPage: false });
  console.log('Saved 3D shot:', shot3);

  // Capture Chrono Singularity Tower
  await page.evaluate(() => {
    const h = blds.find(b => b.type === 'singularity_disruptor');
    if (h) { openBld = blds.indexOf(h); renderBldPanel(); }
    cam.x = h.x; cam.y = h.y;
    orthoSpan = distTarget = 380;
    clampCam(); camUpdateMatrices();
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);
  const shot4 = join(artifactDir, 'td-04-singularity-tower.png');
  await page.screenshot({ path: shot4, fullPage: false });
  console.log('Saved 3D shot:', shot4);

  // Capture Corrosive Spore Rain Spire
  await page.evaluate(() => {
    const h = blds.find(b => b.type === 'spore_catalyst');
    if (h) { openBld = blds.indexOf(h); renderBldPanel(); }
    cam.x = h.x; cam.y = h.y;
    orthoSpan = distTarget = 380;
    clampCam(); camUpdateMatrices();
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);
  const shot5 = join(artifactDir, 'td-05-spore-catalyst.png');
  await page.screenshot({ path: shot5, fullPage: false });
  console.log('Saved 3D shot:', shot5);

  // Capture Nordhall (arctic) theme
  await page.evaluate(() => {
    curTheme = 'arctic';
    curMap = 'highland';
    if (typeof buildTerrain === 'function') buildTerrain('arctic');
    if (typeof initPaving === 'function') initPaving();
    if (typeof buildTerrainMesh === 'function') buildTerrainMesh('arctic');
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);
  const shotNordhall = join(artifactDir, 'theme-nordhall-arctic.png');
  await page.screenshot({ path: shotNordhall, fullPage: false });
  console.log('Saved Nordhall theme shot:', shotNordhall);

  // Capture Pyraeth (ashland) theme
  await page.evaluate(() => {
    curTheme = 'ashland';
    curMap = 'crater';
    if (typeof buildTerrain === 'function') buildTerrain('ashland');
    if (typeof initPaving === 'function') initPaving();
    if (typeof buildTerrainMesh === 'function') buildTerrainMesh('ashland');
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);
  const shotPyraeth = join(artifactDir, 'theme-pyraeth-ashland.png');
  await page.screenshot({ path: shotPyraeth, fullPage: false });
  console.log('Saved Pyraeth theme shot:', shotPyraeth);

  // Capture Vespera (vespera) theme
  await page.evaluate(() => {
    curTheme = 'vespera';
    curMap = 'vanguard';
    if (typeof buildTerrain === 'function') buildTerrain('vespera');
    if (typeof initPaving === 'function') initPaving();
    if (typeof buildTerrainMesh === 'function') buildTerrainMesh('vespera');
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);
  const shotVespera = join(artifactDir, 'theme-vespera-purple.png');
  await page.screenshot({ path: shotVespera, fullPage: false });
  console.log('Saved Vespera theme shot:', shotVespera);

  console.log('ALL 3D INGAME SCREENSHOTS CAPTURED SUCCESSFULLY!');
} catch (err) {
  console.error('Screenshot capture failed:', err);
} finally {
  await browser.close();
}
