/* Capture War Table globes + authored map thumbs for the four faction homeworlds.
   2D globes/thumbs prove identity without 4x terrain gen. Real GPU only
   (tools/chrome-gpu.mjs — ABORT on SwiftShader).
   Usage: node tools/capture-planet-homeworlds.mjs */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'planets-2026-08-14');
await mkdir(outDir, { recursive: true });

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
  '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.wasm':'application/wasm' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const file = join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
});
const PORT = 8914;
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await launchPwBrowser({
  headless: true, executablePath: chrome,
  args: ['--use-gl=angle', '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
    '--enable-gpu', '--disable-gpu-sandbox']
});
try {
  const page = await browser.newPage({ viewport:{ width:412, height:900 }, deviceScaleFactor:2, hasTouch:true, isMobile:true, colorScheme:'dark' });
  page.on('pageerror', e => console.log('ERR ' + e.message));
  await page.addInitScript(() => { try {
    localStorage.setItem('mf_ap_gate_closed','1'); localStorage.setItem('mf_offline','1');
    localStorage.setItem('mf_prealpha_cinematic_v2','test-seen'); localStorage.setItem('mf_auth_gate_v1','1');
  } catch (e) {} });
  await page.goto('http://127.0.0.1:'+PORT+'/', { waitUntil:'domcontentloaded', timeout:60000 });
  await assertHardwareGpu(page);
  await page.waitForFunction(() => typeof PLANETS === 'object' && typeof draw3DPlanetSphere === 'function' && typeof MAPDEFS === 'object', null, { timeout:90000 });
  const report = await page.evaluate(() => {
    const worlds = Object.keys(PLANETS).map(k => {
      const P = PLANETS[k], maps = [];
      for (const R of P.regions) for (const m of R.maps) maps.push(m);
      const sample = MAPDEFS[P.regions[0].maps[2]] || MAPDEFS[P.regions[0].maps[0]];
      return { key:k, nm:P.nm, fac:P.fac, theme:P.theme, climate:P.climate,
        city:sample&&sample.city, indus:sample&&sample.indus, hazard:sample&&sample.hazard,
        mapTheme:sample&&sample.theme, infest:sample&&sample.infest };
    });
    return { worlds, mapCount: Object.keys(MAPDEFS).length };
  });
  console.log(JSON.stringify(report, null, 2));

  await page.evaluate(async (dirHint) => {
    /* Build four 560x360 globes and four 192x120 map thumbs into the page. */
    const host = document.createElement('div');
    host.id = 'mfPlanetShotHost';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#030914;overflow:auto;padding:8px';
    document.body.appendChild(host);
    const keys = Object.keys(PLANETS);
    for (const k of keys) {
      const wrap = document.createElement('div'); wrap.style.marginBottom = '10px';
      const label = document.createElement('div');
      label.style.cssText = 'color:#d9f2ff;font:800 12px monospace;margin:6px';
      const P = PLANETS[k];
      label.textContent = P.nm + '  fac=' + P.fac + '  theme=' + P.theme;
      const cv = document.createElement('canvas'); cv.width = 560; cv.height = 360;
      cv.style.width = '100%'; cv.style.maxWidth = '560px';
      wrap.appendChild(label); wrap.appendChild(cv); host.appendChild(wrap);
      draw3DPlanetSphere(cv, k, 0.35, -0.12, P.regions[0].id);
      const large = P.regions[0].maps[2];
      const D = MAPDEFS[large];
      if (D && typeof drawMapPreview === 'function') {
        const th = document.createElement('canvas'); th.width = 384; th.height = 240;
        th.style.width = '100%'; th.style.maxWidth = '384px'; th.style.marginTop = '6px';
        wrap.appendChild(th);
        drawMapPreview(th, D, D.theme || P.theme);
      }
    }
    document.querySelectorAll('body > *:not(#mfPlanetShotHost)').forEach(e => { if (e.tagName !== 'SCRIPT') e.style.display = 'none'; });
    return dirHint;
  }, outDir);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, 'four-homeworlds.png'), fullPage: true });
  const keys = ['aelos','pyraeth','nordhall','vespera'];
  for (let i = 0; i < keys.length; i++) {
    const shot = await page.evaluate(async (i) => {
      const host = document.getElementById('mfPlanetShotHost');
      const wrap = host && host.children[i];
      const cv = wrap && wrap.querySelector('canvas');
      return cv ? cv.toDataURL('image/png') : null;
    }, i);
    if (!shot) continue;
    const b64 = shot.replace(/^data:image\/png;base64,/, '');
    await import('node:fs/promises').then(fs => fs.writeFile(join(outDir, keys[i] + '-globe.png'), Buffer.from(b64, 'base64')));
  }
  console.log('wrote ' + outDir);
} finally {
  await browser.close();
  server.close();
}
