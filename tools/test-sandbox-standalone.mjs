import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const b = await launchPwBrowser();

try {
  const p = await b.newPage({ viewport: { width: 412, height: 860 }, hasTouch: true });
  p.on('pageerror', e => console.log('PAGE ERROR: ' + e.message));

  const sandboxUrl = pathToFileURL(resolve(__dirname, '../docs/mmo-space-exploration-sandbox.html')).href;
  console.log('Navigating to Strategic Exploration Layer Sandbox:', sandboxUrl);
  await p.goto(sandboxUrl);
  await p.waitForTimeout(1000);

  // 1. Initial 3D Space & NCX-221 Flagship Dreadnought View
  await p.screenshot({ path: resolve(__dirname, '../dist/ncx221_3d_flagship_docked.png') });

  // 2. Test Throttle Slider to 70% & Fly Flagship
  console.log('Engaging Throttle Slider...');
  const throttleZone = p.locator('#flightThrottleZone');
  const box = await throttleZone.boundingBox();
  if (box) {
    await p.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height * 0.25);
    await p.mouse.up();
  }
  await p.waitForTimeout(1200);

  // 3. Test Virtual Joystick Steering Left
  console.log('Steering Flagship via Virtual Joystick...');
  const stickZone = p.locator('#flightStickZone');
  const stickBox = await stickZone.boundingBox();
  if (stickBox) {
    await p.mouse.move(stickBox.x + stickBox.width / 2, stickBox.y + stickBox.height / 2);
    await p.mouse.down();
    await p.mouse.move(stickBox.x + stickBox.width * 0.15, stickBox.y + stickBox.height * 0.5);
    await p.waitForTimeout(1500);
    await p.mouse.up();
  }

  // Take screenshot in flight with thruster trails and 3D dreadnought hull
  await p.screenshot({ path: resolve(__dirname, '../dist/ncx221_3d_flagship_inflight.png') });

  // 4. Test Selecting AELOS PRIME and Warping
  console.log('Selecting AELOS PRIME and Warping...');
  const aelosRow = p.locator('.overview-row[data-id="aelos"]');
  if (await aelosRow.isVisible()) {
    await aelosRow.click();
    await p.waitForTimeout(400);
    await p.click('#actWarp');
    await p.waitForTimeout(1500);
    await p.screenshot({ path: resolve(__dirname, '../dist/ncx221_3d_warp_transit.png') });
  }

  console.log('3D CAPITAL SHIP FLIGHT & EXPLORATION TEST COMPLETED SUCCESSFULLY!');
} catch (err) {
  console.error('Test execution failed:', err);
  throw err;
} finally {
  await closePwBrowser();
}
