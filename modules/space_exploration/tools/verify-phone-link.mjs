import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';

const url = process.env.MF_PHONE_URL;
if (!url) throw new Error('MF_PHONE_URL is required.');

const output = new URL('../tmp/browser-captures/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await launchPwBrowser();
let page;
const errors = [];

try {
  const probe = await browser.newPage({ viewport: { width: 320, height: 240 } });
  await probe.goto('about:blank');
  const gpu = await assertHardwareGpu(probe);
  await probe.close();

  page = await browser.newPage({ viewport: { width: 430, height: 932 }, hasTouch: true });
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  const started = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  const loadingStatus = await page.evaluate(() => ({
    progress: document.querySelector('#loadProgressPercent')?.textContent,
    phase: document.querySelector('#loadPhase')?.textContent,
    detail: document.querySelector('#loadStatus')?.textContent,
    elapsed: document.querySelector('#loadElapsed')?.textContent,
    ready: document.querySelector('#renderVeil')?.classList.contains('ready')
  }));
  await page.screenshot({ path: fileURLToPath(new URL('phone-cloud-loading-progress.png', output)), fullPage: true });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 30000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  await page.waitForTimeout(1200);
  const status = await page.evaluate(() => {
    const experience = window.__MASSFRONT_SPACE__;
    const gl = experience?.engine?.renderer?.getContext?.();
    return {
      scene: document.querySelector('#moduleFrame')?.dataset.scene,
      veil: document.querySelector('#renderVeil')?.className,
      progress: document.querySelector('#loadProgressPercent')?.textContent,
      phase: document.querySelector('#loadPhase')?.textContent,
      canvasCount: document.querySelectorAll('canvas').length,
      renderCanvasCount: document.querySelectorAll('#spatialHudLayer > canvas').length,
      contextLost: gl ? gl.isContextLost() : true,
      startupError: window.__MASSFRONT_SPACE_ERROR__?.message || null
    };
  });
  await page.screenshot({ path: fileURLToPath(new URL('phone-cloud-link.png', output)), fullPage: true });
  if (status.scene !== 'system' || !status.veil.includes('ready') || status.progress !== '100%'
      || status.renderCanvasCount !== 1 || status.contextLost || status.startupError || errors.length) {
    throw new Error(`Phone cloud startup failed: ${JSON.stringify({ status, errors })}`);
  }
  console.log(JSON.stringify({ pass: true, elapsedMs: Date.now() - started, gpu, loadingStatus, status, errors }, null, 2));
} finally {
  if (page) await page.close();
  await closePwBrowser();
}
