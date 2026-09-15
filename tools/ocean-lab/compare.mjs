/* Concept beside render, at the same framing, so a cycle is judged against the
 * target instead of against the previous cycle.
 *
 *   node tools/ocean-lab/compare.mjs cycle-02 S1 storm
 *   node tools/ocean-lab/compare.mjs cycle-02 S1 storm 0.30,0.35,0.25   # crop: x,y,width (fractions)
 *
 * Both images are 16:9, so one fractional crop frames the same part of each.
 * Writes tmp/ocean-lab/<cycle>/compare-<shot>-<concept>[-crop].png.
 */
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from '../pw-browser.mjs';

const [cycle = 'cycle-02', shot = 'S1', concept = 'storm', crop] = process.argv.slice(2);
const base = process.env.OCEAN_LAB_BASE || 'http://127.0.0.1:8931/tmp/ocean-lab/';
const [fx, fy, fw] = crop ? crop.split(',').map(Number) : [0, 0, 1];
const PW = 800, PH = 450;
const W = PW / fw, H = W * 9 / 16;
const panel = (src, label) => `<figure><div class="p"><img src="${src}" style="width:${W}px;height:${H}px;left:${-fx * W}px;top:${-fy * H}px"></div><figcaption>${label}</figcaption></figure>`;
const html = `<!doctype html><html><head><style>
  body{margin:0;background:#081016;color:#cfe3e1;font:13px ui-monospace,Consolas,monospace;display:flex;gap:12px;padding:12px}
  figure{margin:0} .p{position:relative;width:${PW}px;height:${PH}px;overflow:hidden;background:#000}
  .p img{position:absolute;image-rendering:auto} figcaption{padding:6px 2px}
</style></head><body>
${panel(`${base}concepts/stormbreak-${concept}.jpg`, `CONCEPT · ${concept}${crop ? ' · crop ' + crop : ''}`)}
${panel(`${base}${cycle}/${shot}.png?cb=${Date.now()}`, `RENDER · ${cycle} ${shot}`)}
</body></html>`;

const out = fileURLToPath(new URL(`../../tmp/ocean-lab/${cycle}/compare-${shot}-${concept}${crop ? '-crop' : ''}.png`, import.meta.url));
const browser = await launchPwBrowser();
try {
  const page = await browser.newPage({ viewport: { width: PW * 2 + 36, height: PH + 52 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  const broken = await page.evaluate(() => [...document.images].filter(i => !i.naturalWidth).map(i => i.src));
  if (broken.length) throw new Error('images failed to load: ' + broken.join(', '));
  await page.screenshot({ path: out });
  console.log(out);
} finally {
  await closePwBrowser();
}
