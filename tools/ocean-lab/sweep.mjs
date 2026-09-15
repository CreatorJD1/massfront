/* Calibration sweep: render one shot under several style variants, one frame
 * each, for tools/ocean-lab/measure.py to score against a concept.
 *
 *   node tools/ocean-lab/sweep.mjs tools/ocean-lab/sweeps/tone-01.json
 *
 * Spec: { "name", "shot", "variants": [{ "id", "style": {...}, "state": {...} }] }.
 * Every variant starts from the lab's default style, so variants never leak
 * into each other. Frames land in tmp/ocean-lab/sweep-<name>/<id>.png.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from '../pw-browser.mjs';
import { assertHardwareGpu } from '../chrome-gpu.mjs';

const specPath = process.argv[2];
if (!specPath) throw new Error('usage: node tools/ocean-lab/sweep.mjs <spec.json>');
const spec = JSON.parse(await readFile(specPath, 'utf8'));
const url = process.env.OCEAN_LAB_URL || 'http://127.0.0.1:8931/tools/ocean-lab/';
const outDir = fileURLToPath(new URL(`../../tmp/ocean-lab/sweep-${spec.name}/`, import.meta.url));
await mkdir(outDir, { recursive: true });

const browser = await launchPwBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url + '?cb=' + Date.now(), { waitUntil: 'load' });
  await assertHardwareGpu(page);
  await page.waitForFunction(() => (window.oceanLab && window.oceanLab.ready) || window.__oceanLabError,
    {}, { timeout: 90000, polling: 250 });
  const bootError = await page.evaluate(() => window.__oceanLabError || null);
  if (bootError) throw new Error('lab failed to boot: ' + bootError);
  const defaults = await page.evaluate(() => JSON.parse(JSON.stringify(window.oceanLab.style)));
  for (const v of spec.variants) {
    await page.evaluate(([d, s]) => { Object.assign(window.oceanLab.style, d, s || {}); }, [defaults, v.style]);
    await page.evaluate(([shot, st]) => window.oceanLab.shot(shot, st || {}), [spec.shot || 'S1', v.state]);
    const file = `${outDir}${v.id}.png`;
    await page.screenshot({ path: file, timeout: 60000 });
    console.log(`${v.id} -> ${file}`);
  }
  await writeFile(`${outDir}spec.json`, JSON.stringify({ spec, defaults }, null, 2));
  if (errors.length) console.log('page errors: ' + errors.join(' | '));
} finally {
  await closePwBrowser();
}
