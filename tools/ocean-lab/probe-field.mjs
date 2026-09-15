/* Read the GPU wave field back and print what it holds, per shot.
 *   node tools/ocean-lab/probe-field.mjs S1,S3
 * hsMeasured must match hsTarget (Douglas height x drama) and fftImagRatio must
 * be ~0; otherwise the look is being judged on a broken field. */
import { launchPwBrowser, closePwBrowser } from '../pw-browser.mjs';
import { assertHardwareGpu } from '../chrome-gpu.mjs';

const shots = (process.argv[2] || 'S1').split(',');
const url = process.env.OCEAN_LAB_URL || 'http://127.0.0.1:8931/tools/ocean-lab/';
const browser = await launchPwBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url + '?cb=' + Date.now(), { waitUntil: 'load' });
  await assertHardwareGpu(page);
  await page.waitForFunction(() => (window.oceanLab && window.oceanLab.ready) || window.__oceanLabError, {}, { timeout: 90000, polling: 250 });
  for (const name of shots) {
    await page.evaluate(n => window.oceanLab.shot(n), name);
    const stats = await page.evaluate(() => window.oceanLab.fieldStats());
    console.log(`${name}  Hs target ${stats.hsTarget.toFixed(2)} m  measured ${stats.hsMeasured.toFixed(2)} m  foam bias ${stats.foamBias.toFixed(2)}`);
    for (const c of stats.cascades) {
      console.log(`  L ${String(c.L).padStart(4)}  sigmaJ ${c.sigmaJ.toFixed(3)} bias ${c.bias.toFixed(2)}  hStd ${c.hStd.toFixed(3)}  slopeRms ${c.slopeRms.toFixed(3)}  Jmin ${c.jMin.toFixed(3)}` +
        `  J<bias ${(c.foamBelowBias * 100).toFixed(2)}%  foam max ${c.foamMax.toFixed(2)} mean ${c.foamMean.toFixed(3)}` +
        `  dispMax ${c.dispMax.toFixed(2)} m  fftImag ${c.fftImagRatio.toExponential(1)}`);
    }
  }
  if (errors.length) console.log('page errors: ' + errors.join(' | '));
} finally {
  await closePwBrowser();
}
