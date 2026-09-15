/* Capture a look-dev cycle of the ocean lab on the real GPU.
 *
 *   node tools/ocean-lab/shoot.mjs cycle-01            # S1..S5
 *   node tools/ocean-lab/shoot.mjs cycle-01 S1,S3      # a subset
 *
 * Writes tmp/ocean-lab/<cycle>/<shot>.png plus meta.json. Shots are framed by
 * the engine's own battle camera and rendered at a fixed clock after six
 * seconds of foam history, so two cycles differ only by what changed in code.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from '../pw-browser.mjs';
import { assertHardwareGpu } from '../chrome-gpu.mjs';

const cycle = process.argv[2] || 'cycle-00';
const shots = (process.argv[3] || 'S1,S2,S3,S4,S5').split(',');
/* Optional debug views per shot, e.g. "0,1,2,3,4" (see uDebug in ocean-surface.js). */
const modes = (process.argv[4] || '0').split(',').map(Number);
const url = process.env.OCEAN_LAB_URL || 'http://127.0.0.1:8931/tools/ocean-lab/';
const outDir = fileURLToPath(new URL(`../../tmp/ocean-lab/${cycle}/`, import.meta.url));
await mkdir(outDir, { recursive: true });

const browser = await launchPwBrowser();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ' ' + m.text()); });
  await page.goto(url + '?cb=' + Date.now(), { waitUntil: 'load' });
  await assertHardwareGpu(page);
  await page.waitForFunction(() => (window.oceanLab && window.oceanLab.ready) || window.__oceanLabError,
    {}, { timeout: 90000, polling: 250 });
  const bootError = await page.evaluate(() => window.__oceanLabError || null);
  if (bootError) throw new Error('lab failed to boot: ' + bootError);
  const gpu = await page.evaluate(() => window.oceanLab.gpu());
  const meta = { cycle, url, gpu, shots: [] };
  for (const name of shots) {
    for (const debug of modes) {
      const info = await page.evaluate(([n, d]) => window.oceanLab.shot(n, { debug: d }), [name, debug]);
      const file = `${outDir}${name}${debug ? '-dbg' + debug : ''}.png`;
      await page.screenshot({ path: file, timeout: 60000 });
      meta.shots.push({ name, debug, file, hs: info.sea.hs, period: info.sea.period, wind: info.sea.wind });
      console.log(`${name}${debug ? ' dbg' + debug : ''}  Hs ${info.sea.hs.toFixed(2)} m  T ${info.sea.period.toFixed(1)} s  -> ${file}`);
      const hulls = await page.evaluate(() => (window.oceanLab.hulls ? window.oceanLab.hulls() : []));
      if (hulls.length) {
        const deg = r => (r * 180 / Math.PI).toFixed(1);
        console.log('   hulls: ' + hulls.map(h => `pitch ${deg(h.pitch)} roll ${deg(h.roll)} heave ${h.heave.toFixed(2)} m`).join(' | ') +
          `  (mirror keeps ${(hulls[0].energy * 100).toFixed(0)}% of wave energy)`);
      }
    }
  }
  meta.errors = errors;
  await writeFile(`${outDir}meta.json`, JSON.stringify(meta, null, 2));
  console.log(`gpu: ${gpu}`);
  if (errors.length) console.log('page errors:\n  ' + errors.join('\n  '));
} finally {
  await closePwBrowser();
}
